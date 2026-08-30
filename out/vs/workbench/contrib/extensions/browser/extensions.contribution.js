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
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Event } from "../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { mnemonicButtonLabel } from "../../../../base/common/labels.js";
import { Disposable, DisposableStore, isDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { isNative, isWeb } from "../../../../base/common/platform.js";
import { PolicyCategory } from "../../../../base/common/policy.js";
import { URI } from "../../../../base/common/uri.js";
import { CopyAction, CutAction, PasteAction } from "../../../../editor/contrib/clipboard/browser/clipboard.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../platform/configuration/common/configurationRegistry.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IDialogService, IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ExtensionGalleryManifestStatus, ExtensionGalleryResourceType, ExtensionGalleryServiceUrlConfigKey, getExtensionGalleryManifestResourceUri, IExtensionGalleryManifestService } from "../../../../platform/extensionManagement/common/extensionGalleryManifest.js";
import { EXTENSION_INSTALL_SOURCE_CONTEXT, ExtensionInstallSource, ExtensionRequestsTimeoutConfigKey, ExtensionsLocalizedLabel, FilterType, IExtensionGalleryService, IExtensionManagementService, PreferencesLocalizedLabel, SortBy, VerifyExtensionSignatureConfigKey } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { areSameExtensions, getIdAndVersion } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { ExtensionStorageService } from "../../../../platform/extensionManagement/common/extensionStorage.js";
import { IExtensionRecommendationNotificationService } from "../../../../platform/extensionRecommendations/common/extensionRecommendations.js";
import { EXTENSION_CATEGORIES, ExtensionType } from "../../../../platform/extensions/common/extensions.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import * as jsonContributionRegistry from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import product from "../../../../platform/product/common/product.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { Extensions } from "../../../../platform/quickinput/common/quickAccess.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { Extensions as ConfigurationMigrationExtensions } from "../../../common/configuration.js";
import { IsSessionsWindowContext, ResourceContextKey, WorkbenchStateContext } from "../../../common/contextkeys.js";
import { registerWorkbenchContribution2, Extensions as WorkbenchExtensions, WorkbenchPhase } from "../../../common/contributions.js";
import { EditorExtensions } from "../../../common/editor.js";
import { Extensions as ViewContainerExtensions, ViewContainerLocation } from "../../../common/views.js";
import { DEFAULT_ACCOUNT_SIGN_IN_COMMAND } from "../../../services/accounts/browser/defaultAccount.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { EnablementState, IExtensionManagementServerService, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { IExtensionIgnoredRecommendationsService, IExtensionRecommendationsService } from "../../../services/extensionRecommendations/common/extensionRecommendations.js";
import { IWorkspaceExtensionsConfigService } from "../../../services/extensionRecommendations/common/workspaceExtensionsConfig.js";
import { EXTENSIONS_SUPPORT_AGENTS_WINDOW } from "../../../services/extensions/common/extensionManifestPropertiesService.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { CONTEXT_SYNC_ENABLEMENT } from "../../../services/userDataSync/common/userDataSync.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { WORKSPACE_TRUST_EXTENSION_SUPPORT } from "../../../services/workspaces/common/workspaceTrust.js";
import { IPluginInstallService } from "../../chat/common/plugins/pluginInstallService.js";
import { ILanguageModelToolsService } from "../../chat/common/tools/languageModelToolsService.js";
import { CONTEXT_KEYBINDINGS_EDITOR } from "../../preferences/common/preferences.js";
import { Query } from "../common/extensionQuery.js";
import { AutoRestartConfigurationKey, AutoUpdateConfigurationKey, CONTEXT_EXTENSIONS_GALLERY_STATUS, CONTEXT_HAS_GALLERY, DefaultViewsContext, ExtensionRuntimeActionType, EXTENSIONS_CATEGORY, extensionsFilterSubMenu, extensionsSearchActionsMenu, HasOutdatedExtensionsContext, IExtensionsWorkbenchService, INSTALL_ACTIONS_GROUP, INSTALL_EXTENSION_FROM_VSIX_COMMAND_ID, LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID, OUTDATED_EXTENSIONS_VIEW_ID, SELECT_INSTALL_VSIX_EXTENSION_COMMAND_ID, THEME_ACTIONS_GROUP, TOGGLE_IGNORE_EXTENSION_ACTION_ID, UPDATE_ACTIONS_GROUP, VIEWLET_ID, WORKSPACE_RECOMMENDATIONS_VIEW_ID } from "../common/extensions.js";
import { ExtensionsConfigurationSchema, ExtensionsConfigurationSchemaId } from "../common/extensionsFileTemplate.js";
import { ExtensionsInput } from "../common/extensionsInput.js";
import { KeymapExtensions } from "../common/extensionsUtils.js";
import { SearchExtensionsTool, SearchExtensionsToolData } from "../common/searchExtensionsTool.js";
import { ExtensionEditor } from "./extensionEditor.js";
import { ExtensionEnablementWorkspaceTrustTransitionParticipant } from "./extensionEnablementWorkspaceTrustTransitionParticipant.js";
import { ExtensionRecommendationNotificationService } from "./extensionRecommendationNotificationService.js";
import { ExtensionRecommendationsService } from "./extensionRecommendationsService.js";
import { ClearLanguageAction, ConfigureWorkspaceFolderRecommendedExtensionsAction, ConfigureWorkspaceRecommendedExtensionsAction, InstallAction, InstallAnotherVersionAction, InstallSpecificVersionOfExtensionAction, SetColorThemeAction, SetFileIconThemeAction, SetProductIconThemeAction, ToggleAutoUpdateForExtensionAction, ToggleAutoUpdatesForPublisherAction, TogglePreReleaseExtensionAction } from "./extensionsActions.js";
import { ExtensionActivationProgress } from "./extensionsActivationProgress.js";
import { ExtensionsCompletionItemsProvider } from "./extensionsCompletionItemsProvider.js";
import { ExtensionEnablementContextKeysContribution } from "./extensionEnablementContext.js";
import { ExtensionDependencyChecker } from "./extensionsDependencyChecker.js";
import { clearSearchResultsIcon, configureRecommendedIcon, extensionsViewIcon, filterIcon, installWorkspaceRecommendedIcon, refreshIcon } from "./extensionsIcons.js";
import { InstallExtensionQuickAccessProvider, ManageExtensionsQuickAccessProvider } from "./extensionsQuickAccess.js";
import { BuiltInExtensionsContext, ExtensionMarketplaceStatusUpdater, ExtensionsSearchValueContext, ExtensionsSortByContext, ExtensionsViewletViewsContribution, ExtensionsViewPaneContainer, MaliciousExtensionChecker, RecommendedExtensionsContext, SearchHasTextContext, SearchMarketplaceExtensionsContext, StatusUpdater } from "./extensionsViewlet.js";
import { ExtensionsWorkbenchService } from "./extensionsWorkbenchService.js";
import "./media/extensionManagement.css";
import { UnsupportedExtensionsMigrationContrib } from "./unsupportedExtensionsMigrationContribution.js";
registerSingleton(
  IExtensionsWorkbenchService,
  ExtensionsWorkbenchService,
  InstantiationType.Eager
  /* Auto updates extensions */
);
registerSingleton(IExtensionRecommendationNotificationService, ExtensionRecommendationNotificationService, InstantiationType.Delayed);
registerSingleton(
  IExtensionRecommendationsService,
  ExtensionRecommendationsService,
  InstantiationType.Eager
  /* Prompts recommendations in the background */
);
Registry.as(Extensions.Quickaccess).registerQuickAccessProvider({
  ctor: ManageExtensionsQuickAccessProvider,
  prefix: ManageExtensionsQuickAccessProvider.PREFIX,
  placeholder: localize("manageExtensionsQuickAccessPlaceholder", "Press Enter to manage extensions."),
  helpEntries: [{ description: localize("manageExtensionsHelp", "Manage Extensions") }]
});
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    ExtensionEditor,
    ExtensionEditor.ID,
    localize("extension", "Extension")
  ),
  [
    new SyncDescriptor(ExtensionsInput)
  ]
);
const VIEW_CONTAINER = Registry.as(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer(
  {
    id: VIEWLET_ID,
    title: localize2("extensions", "Extensions"),
    openCommandActionDescriptor: {
      id: VIEWLET_ID,
      mnemonicTitle: localize({ key: "miViewExtensions", comment: ["&& denotes a mnemonic"] }, "E&&xtensions"),
      keybindings: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyX },
      order: 4
    },
    ctorDescriptor: new SyncDescriptor(ExtensionsViewPaneContainer),
    icon: extensionsViewIcon,
    order: 4,
    rejectAddedViews: true,
    alwaysUseContainerInfo: true
  },
  ViewContainerLocation.Sidebar
);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  id: "extensions",
  order: 30,
  title: localize("extensionsConfigurationTitle", "Extensions"),
  type: "object",
  properties: {
    "extensions.autoUpdate": {
      type: "string",
      enum: ["on", "off"],
      enumDescriptions: [
        localize("extensions.autoUpdate.on", "Download and install updates automatically only for enabled extensions."),
        localize("extensions.autoUpdate.off", "Extensions are not automatically updated.")
      ],
      description: localize("extensions.autoUpdate", "Controls the automatic update behavior of extensions. The updates are fetched from a Microsoft online service."),
      default: "on",
      scope: ConfigurationScope.APPLICATION,
      tags: ["usesOnlineServices"],
      policy: {
        name: "ExtensionsAutoUpdate",
        category: PolicyCategory.Extensions,
        minimumVersion: "1.125",
        localization: {
          description: {
            key: "extensions.autoUpdate",
            value: localize("extensions.autoUpdate", "Controls the automatic update behavior of extensions. The updates are fetched from a Microsoft online service.")
          },
          enumDescriptions: [
            {
              key: "extensions.autoUpdate.on",
              value: localize("extensions.autoUpdate.on", "Download and install updates automatically only for enabled extensions.")
            },
            {
              key: "extensions.autoUpdate.off",
              value: localize("extensions.autoUpdate.off", "Extensions are not automatically updated.")
            }
          ]
        }
      }
    },
    "extensions.autoUpdateDelay": {
      type: "number",
      default: 2,
      minimum: 0,
      markdownDescription: localize("extensions.autoUpdateDelay", "Controls the delay in hours after an extension update is published before it is automatically installed. Only applies when `#extensions.autoUpdate#` is set to `on`. This delay helps avoid installing potentially problematic updates immediately after release."),
      scope: ConfigurationScope.APPLICATION,
      policy: {
        name: "ExtensionsAutoUpdateDelay",
        category: PolicyCategory.Extensions,
        minimumVersion: "1.125",
        localization: {
          description: {
            key: "extensions.autoUpdateDelay",
            value: localize("extensions.autoUpdateDelay", "Controls the delay in hours after an extension update is published before it is automatically installed. Only applies when `#extensions.autoUpdate#` is set to `on`. This delay helps avoid installing potentially problematic updates immediately after release.")
          }
        }
      }
    },
    "extensions.autoCheckUpdates": {
      type: "boolean",
      description: localize("extensionsCheckUpdates", "When enabled, automatically checks extensions for updates. If an extension has an update, it is marked as outdated in the Extensions view. The updates are fetched from a Microsoft online service."),
      default: true,
      scope: ConfigurationScope.APPLICATION,
      tags: ["usesOnlineServices"]
    },
    "extensions.ignoreRecommendations": {
      type: "boolean",
      description: localize("extensionsIgnoreRecommendations", "When enabled, the notifications for extension recommendations will not be shown."),
      default: false,
      agentsWindow: { default: true, readOnly: true }
    },
    "extensions.showRecommendationsOnlyOnDemand": {
      type: "boolean",
      deprecationMessage: localize("extensionsShowRecommendationsOnlyOnDemand_Deprecated", "This setting is deprecated. Use extensions.ignoreRecommendations setting to control recommendation notifications. Use Extensions view's visibility actions to hide Recommended view by default."),
      default: false,
      tags: ["usesOnlineServices"]
    },
    "extensions.closeExtensionDetailsOnViewChange": {
      type: "boolean",
      description: localize("extensionsCloseExtensionDetailsOnViewChange", "When enabled, editors with extension details will be automatically closed upon navigating away from the Extensions View."),
      default: false
    },
    "extensions.confirmedUriHandlerExtensionIds": {
      type: "array",
      items: {
        type: "string"
      },
      description: localize("handleUriConfirmedExtensions", "When an extension is listed here, a confirmation prompt will not be shown when that extension handles a URI."),
      default: [],
      scope: ConfigurationScope.APPLICATION
    },
    "extensions.webWorker": {
      type: ["boolean", "string"],
      enum: [true, false, "auto"],
      enumDescriptions: [
        localize("extensionsWebWorker.true", "The Web Worker Extension Host will always be launched."),
        localize("extensionsWebWorker.false", "The Web Worker Extension Host will never be launched."),
        localize("extensionsWebWorker.auto", "The Web Worker Extension Host will be launched when a web extension needs it.")
      ],
      description: localize("extensionsWebWorker", "Enable web worker extension host."),
      default: "auto"
    },
    "extensions.supportVirtualWorkspaces": {
      type: "object",
      markdownDescription: localize("extensions.supportVirtualWorkspaces", "Override the virtual workspaces support of an extension."),
      patternProperties: {
        "([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$": {
          type: "boolean",
          default: false
        }
      },
      additionalProperties: false,
      default: {},
      defaultSnippets: [{
        "body": {
          "pub.name": false
        }
      }]
    },
    [EXTENSIONS_SUPPORT_AGENTS_WINDOW]: {
      type: "object",
      scope: ConfigurationScope.APPLICATION,
      markdownDescription: localize("extensions.supportAgentsWindow", "Override the Agents window support of an extension. Extensions using `true` will be enabled in the Agents window even when they would otherwise be disabled."),
      patternProperties: {
        "([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$": {
          type: "boolean",
          default: false
        }
      },
      additionalProperties: false,
      default: {},
      defaultSnippets: [{
        "body": {
          "pub.name": true
        }
      }]
    },
    "extensions.experimental.affinity": {
      type: "object",
      markdownDescription: localize("extensions.affinity", "Configure an extension to execute in a different extension host process."),
      patternProperties: {
        "([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$": {
          type: "integer",
          default: 1
        }
      },
      additionalProperties: false,
      default: {},
      defaultSnippets: [{
        "body": {
          "pub.name": 1
        }
      }]
    },
    [WORKSPACE_TRUST_EXTENSION_SUPPORT]: {
      type: "object",
      scope: ConfigurationScope.APPLICATION,
      markdownDescription: localize("extensions.supportUntrustedWorkspaces", "Override the untrusted workspace support of an extension. Extensions using `true` will always be enabled. Extensions using `limited` will always be enabled, and the extension will hide functionality that requires trust. Extensions using `false` will only be enabled only when the workspace is trusted."),
      patternProperties: {
        "([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$": {
          type: "object",
          properties: {
            "supported": {
              type: ["boolean", "string"],
              enum: [true, false, "limited"],
              enumDescriptions: [
                localize("extensions.supportUntrustedWorkspaces.true", "Extension will always be enabled."),
                localize("extensions.supportUntrustedWorkspaces.false", "Extension will only be enabled only when the workspace is trusted."),
                localize("extensions.supportUntrustedWorkspaces.limited", "Extension will always be enabled, and the extension will hide functionality requiring trust.")
              ],
              description: localize("extensions.supportUntrustedWorkspaces.supported", "Defines the untrusted workspace support setting for the extension.")
            },
            "version": {
              type: "string",
              description: localize("extensions.supportUntrustedWorkspaces.version", "Defines the version of the extension for which the override should be applied. If not specified, the override will be applied independent of the extension version.")
            }
          }
        }
      }
    },
    "extensions.experimental.deferredStartupFinishedActivation": {
      type: "boolean",
      description: localize("extensionsDeferredStartupFinishedActivation", "When enabled, extensions which declare the `onStartupFinished` activation event will be activated after a timeout."),
      default: false
    },
    "extensions.experimental.issueQuickAccess": {
      type: "boolean",
      description: localize("extensionsInQuickAccess", "When enabled, extensions can be searched for via Quick Access and report issues from there."),
      default: true
    },
    "extensions.allowOpenInModalEditor": {
      type: "boolean",
      description: localize("extensions.allowOpenInModalEditor", "Controls whether extensions and MCP servers open in a modal editor overlay."),
      default: false,
      // TODO@bpasero figure out the default for stable and retire this setting
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    [VerifyExtensionSignatureConfigKey]: {
      type: "boolean",
      description: localize("extensions.verifySignature", "When enabled, extensions are verified to be signed before getting installed."),
      default: true,
      scope: ConfigurationScope.APPLICATION,
      included: isNative
    },
    [AutoRestartConfigurationKey]: {
      type: "boolean",
      description: localize("autoRestart", "If activated, extensions will automatically restart following an update if the window is not in focus. There can be a data loss if you have open Notebooks or Custom Editors."),
      default: false,
      included: product.quality !== "stable"
    },
    [ExtensionGalleryServiceUrlConfigKey]: {
      type: "string",
      description: localize("extensions.gallery.serviceUrl", "Configure the Marketplace service URL to connect to"),
      default: "",
      scope: ConfigurationScope.APPLICATION,
      tags: ["usesOnlineServices"],
      included: false,
      policy: {
        name: "ExtensionGalleryServiceUrl",
        category: PolicyCategory.Extensions,
        minimumVersion: "1.99",
        localization: {
          description: {
            key: "extensions.gallery.serviceUrl",
            value: localize("extensions.gallery.serviceUrl", "Configure the Marketplace service URL to connect to")
          }
        }
      }
    },
    "extensions.supportNodeGlobalNavigator": {
      type: "boolean",
      description: localize("extensionsSupportNodeGlobalNavigator", "When enabled, Node.js navigator object is exposed on the global scope."),
      default: false
    },
    [ExtensionRequestsTimeoutConfigKey]: {
      type: "number",
      description: localize("extensionsRequestTimeout", "Controls the timeout in milliseconds for HTTP requests made when fetching extensions from the Marketplace"),
      default: 6e4,
      scope: ConfigurationScope.APPLICATION,
      tags: ["advanced", "usesOnlineServices"]
    }
  }
});
const jsonRegistry = Registry.as(jsonContributionRegistry.Extensions.JSONContribution);
jsonRegistry.registerSchema(ExtensionsConfigurationSchemaId, ExtensionsConfigurationSchema);
CommandsRegistry.registerCommand("_extensions.manage", (accessor, extensionId, tab, preserveFocus, feature) => {
  const extensionService = accessor.get(IExtensionsWorkbenchService);
  const extension = extensionService.local.find((e) => areSameExtensions(e.identifier, { id: extensionId }));
  if (extension) {
    extensionService.open(extension, { tab, preserveFocus, feature });
  } else {
    throw new Error(localize("notFound", "Extension '{0}' not found.", extensionId));
  }
});
CommandsRegistry.registerCommand("extension.open", async (accessor, extensionId, tab, preserveFocus, feature, sideByside) => {
  const extensionService = accessor.get(IExtensionsWorkbenchService);
  const commandService = accessor.get(ICommandService);
  const [extension] = await extensionService.getExtensions([{ id: extensionId }], CancellationToken.None);
  if (extension) {
    return extensionService.open(extension, { tab, preserveFocus, feature, sideByside });
  }
  return commandService.executeCommand("_extensions.manage", extensionId, tab, preserveFocus, feature);
});
CommandsRegistry.registerCommand({
  id: "workbench.extensions.installExtension",
  metadata: {
    description: localize("workbench.extensions.installExtension.description", "Install the given extension"),
    args: [
      {
        name: "extensionIdOrVSIXUri",
        description: localize("workbench.extensions.installExtension.arg.decription", "Extension id or VSIX resource uri"),
        constraint: (value) => typeof value === "string" || value instanceof URI
      },
      {
        name: "options",
        description: "(optional) Options for installing the extension. Object with the following properties: `installOnlyNewlyAddedFromExtensionPackVSIX`: When enabled, VS Code installs only newly added extensions from the extension pack VSIX. This option is considered only when installing VSIX. ",
        isOptional: true,
        schema: {
          "type": "object",
          "properties": {
            "installOnlyNewlyAddedFromExtensionPackVSIX": {
              "type": "boolean",
              "description": localize("workbench.extensions.installExtension.option.installOnlyNewlyAddedFromExtensionPackVSIX", "When enabled, VS Code installs only newly added extensions from the extension pack VSIX. This option is considered only while installing a VSIX."),
              default: false
            },
            "installPreReleaseVersion": {
              "type": "boolean",
              "description": localize("workbench.extensions.installExtension.option.installPreReleaseVersion", "When enabled, VS Code installs the pre-release version of the extension if available."),
              default: false
            },
            "donotSync": {
              "type": "boolean",
              "description": localize("workbench.extensions.installExtension.option.donotSync", "When enabled, VS Code do not sync this extension when Settings Sync is on."),
              default: false
            },
            "justification": {
              "type": ["string", "object"],
              "description": localize("workbench.extensions.installExtension.option.justification", "Justification for installing the extension. This is a string or an object that can be used to pass any information to the installation handlers. i.e. `{reason: 'This extension wants to open a URI', action: 'Open URI'}` will show a message box with the reason and action upon install.")
            },
            "enable": {
              "type": "boolean",
              "description": localize("workbench.extensions.installExtension.option.enable", "When enabled, the extension will be enabled if it is installed but disabled. If the extension is already enabled, this has no effect."),
              default: false
            }
          }
        }
      }
    ]
  },
  handler: async (accessor, arg, options) => {
    const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
    const extensionManagementService = accessor.get(IWorkbenchExtensionManagementService);
    const extensionGalleryService = accessor.get(IExtensionGalleryService);
    try {
      if (typeof arg === "string") {
        const [id, version] = getIdAndVersion(arg);
        const extension = extensionsWorkbenchService.local.find((e) => areSameExtensions(e.identifier, { id, uuid: version }));
        if (extension?.enablementState === EnablementState.DisabledByExtensionKind) {
          const [gallery] = await extensionGalleryService.getExtensions([{ id, preRelease: options?.installPreReleaseVersion }], CancellationToken.None);
          if (!gallery) {
            throw new Error(localize("notFound", "Extension '{0}' not found.", arg));
          }
          await extensionManagementService.installFromGallery(gallery, {
            isMachineScoped: options?.donotSync ? true : void 0,
            /* do not allow syncing extensions automatically while installing through the command */
            installPreReleaseVersion: options?.installPreReleaseVersion,
            installGivenVersion: !!version,
            context: { [EXTENSION_INSTALL_SOURCE_CONTEXT]: ExtensionInstallSource.COMMAND }
          });
        } else {
          await extensionsWorkbenchService.install(id, {
            version,
            installPreReleaseVersion: options?.installPreReleaseVersion,
            context: { [EXTENSION_INSTALL_SOURCE_CONTEXT]: ExtensionInstallSource.COMMAND },
            justification: options?.justification,
            enable: options?.enable,
            isMachineScoped: options?.donotSync ? true : void 0
            /* do not allow syncing extensions automatically while installing through the command */
          }, ProgressLocation.Notification);
        }
      } else {
        const vsix = URI.revive(arg);
        await extensionsWorkbenchService.install(vsix, { installGivenVersion: true });
      }
    } catch (e) {
      onUnexpectedError(e);
      throw e;
    }
  }
});
CommandsRegistry.registerCommand({
  id: "workbench.extensions.uninstallExtension",
  metadata: {
    description: localize("workbench.extensions.uninstallExtension.description", "Uninstall the given extension"),
    args: [
      {
        name: localize("workbench.extensions.uninstallExtension.arg.name", "Id of the extension to uninstall"),
        schema: {
          "type": "string"
        }
      }
    ]
  },
  handler: async (accessor, id) => {
    if (!id) {
      throw new Error(localize("id required", "Extension id required."));
    }
    const extensionManagementService = accessor.get(IExtensionManagementService);
    const installed = await extensionManagementService.getInstalled();
    const [extensionToUninstall] = installed.filter((e) => areSameExtensions(e.identifier, { id }));
    if (!extensionToUninstall) {
      throw new Error(localize("notInstalled", "Extension '{0}' is not installed. Make sure you use the full extension ID, including the publisher, e.g.: ms-dotnettools.csharp.", id));
    }
    if (extensionToUninstall.isBuiltin) {
      throw new Error(localize("builtin", "Extension '{0}' is a Built-in extension and cannot be uninstalled", id));
    }
    try {
      await extensionManagementService.uninstall(extensionToUninstall);
    } catch (e) {
      onUnexpectedError(e);
      throw e;
    }
  }
});
CommandsRegistry.registerCommand({
  id: "workbench.extensions.search",
  metadata: {
    description: localize("workbench.extensions.search.description", "Search for a specific extension"),
    args: [
      {
        name: localize("workbench.extensions.search.arg.name", "Query to use in search"),
        schema: { "type": "string" }
      }
    ]
  },
  handler: async (accessor, query = "") => {
    return accessor.get(IExtensionsWorkbenchService).openSearch(query);
  }
});
function overrideActionForActiveExtensionEditorWebview(command, f) {
  command?.addImplementation(105, "extensions-editor", (accessor) => {
    const editorService = accessor.get(IEditorService);
    const editor = editorService.activeEditorPane;
    if (editor instanceof ExtensionEditor) {
      if (editor.activeWebview?.isFocused) {
        f(editor.activeWebview);
        return true;
      }
    }
    return false;
  });
}
overrideActionForActiveExtensionEditorWebview(CopyAction, (webview) => webview.copy());
overrideActionForActiveExtensionEditorWebview(CutAction, (webview) => webview.cut());
overrideActionForActiveExtensionEditorWebview(PasteAction, (webview) => webview.paste());
const CONTEXT_HAS_LOCAL_SERVER = new RawContextKey("hasLocalServer", false);
const CONTEXT_HAS_REMOTE_SERVER = new RawContextKey("hasRemoteServer", false);
const CONTEXT_HAS_WEB_SERVER = new RawContextKey("hasWebServer", false);
const CONTEXT_GALLERY_SORT_CAPABILITIES = new RawContextKey("gallerySortCapabilities", "");
const CONTEXT_GALLERY_FILTER_CAPABILITIES = new RawContextKey("galleryFilterCapabilities", "");
const CONTEXT_GALLERY_ALL_PUBLIC_REPOSITORY_SIGNED = new RawContextKey("galleryAllPublicRepositorySigned", false);
const CONTEXT_GALLERY_ALL_PRIVATE_REPOSITORY_SIGNED = new RawContextKey("galleryAllPrivateRepositorySigned", false);
const CONTEXT_GALLERY_HAS_EXTENSION_LINK = new RawContextKey("galleryHasExtensionLink", false);
async function runAction(action) {
  try {
    return await action.run();
  } finally {
    if (isDisposable(action)) {
      action.dispose();
    }
  }
}
let ExtensionsContributions = class extends Disposable {
  constructor(extensionManagementService, extensionManagementServerService, extensionGalleryManifestService, contextKeyService, viewsService, extensionsWorkbenchService, extensionEnablementService, instantiationService, dialogService, commandService, productService, pluginInstallService) {
    super();
    this.extensionManagementService = extensionManagementService;
    this.extensionManagementServerService = extensionManagementServerService;
    this.extensionGalleryManifestService = extensionGalleryManifestService;
    this.contextKeyService = contextKeyService;
    this.viewsService = viewsService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionEnablementService = extensionEnablementService;
    this.instantiationService = instantiationService;
    this.dialogService = dialogService;
    this.commandService = commandService;
    this.productService = productService;
    this.pluginInstallService = pluginInstallService;
    const hasLocalServerContext = CONTEXT_HAS_LOCAL_SERVER.bindTo(contextKeyService);
    if (this.extensionManagementServerService.localExtensionManagementServer) {
      hasLocalServerContext.set(true);
    }
    const hasRemoteServerContext = CONTEXT_HAS_REMOTE_SERVER.bindTo(contextKeyService);
    if (this.extensionManagementServerService.remoteExtensionManagementServer) {
      hasRemoteServerContext.set(true);
    }
    const hasWebServerContext = CONTEXT_HAS_WEB_SERVER.bindTo(contextKeyService);
    if (this.extensionManagementServerService.webExtensionManagementServer) {
      hasWebServerContext.set(true);
    }
    this.updateExtensionGalleryStatusContexts();
    this._register(extensionGalleryManifestService.onDidChangeExtensionGalleryManifestStatus(() => this.updateExtensionGalleryStatusContexts()));
    extensionGalleryManifestService.getExtensionGalleryManifest().then((extensionGalleryManifest) => {
      this.updateGalleryCapabilitiesContexts(extensionGalleryManifest);
      this._register(extensionGalleryManifestService.onDidChangeExtensionGalleryManifest((extensionGalleryManifest2) => this.updateGalleryCapabilitiesContexts(extensionGalleryManifest2)));
    });
    this.registerGlobalActions();
    this.registerContextMenuActions();
    this.registerQuickAccessProvider();
  }
  async updateExtensionGalleryStatusContexts() {
    CONTEXT_HAS_GALLERY.bindTo(this.contextKeyService).set(this.extensionGalleryManifestService.extensionGalleryManifestStatus === ExtensionGalleryManifestStatus.Available);
    CONTEXT_EXTENSIONS_GALLERY_STATUS.bindTo(this.contextKeyService).set(this.extensionGalleryManifestService.extensionGalleryManifestStatus);
  }
  async updateGalleryCapabilitiesContexts(extensionGalleryManifest) {
    CONTEXT_GALLERY_SORT_CAPABILITIES.bindTo(this.contextKeyService).set(`_${extensionGalleryManifest?.capabilities.extensionQuery.sorting?.map((s) => s.name)?.join("_")}_UpdateDate_`);
    CONTEXT_GALLERY_FILTER_CAPABILITIES.bindTo(this.contextKeyService).set(`_${extensionGalleryManifest?.capabilities.extensionQuery.filtering?.map((s) => s.name)?.join("_")}_`);
    CONTEXT_GALLERY_ALL_PUBLIC_REPOSITORY_SIGNED.bindTo(this.contextKeyService).set(!!extensionGalleryManifest?.capabilities?.signing?.allPublicRepositorySigned);
    CONTEXT_GALLERY_ALL_PRIVATE_REPOSITORY_SIGNED.bindTo(this.contextKeyService).set(!!extensionGalleryManifest?.capabilities?.signing?.allPrivateRepositorySigned);
    CONTEXT_GALLERY_HAS_EXTENSION_LINK.bindTo(this.contextKeyService).set(!!(extensionGalleryManifest && getExtensionGalleryManifestResourceUri(extensionGalleryManifest, ExtensionGalleryResourceType.ExtensionDetailsViewUri)));
  }
  registerQuickAccessProvider() {
    if (this.extensionManagementServerService.localExtensionManagementServer || this.extensionManagementServerService.remoteExtensionManagementServer || this.extensionManagementServerService.webExtensionManagementServer) {
      Registry.as(Extensions.Quickaccess).registerQuickAccessProvider({
        ctor: InstallExtensionQuickAccessProvider,
        prefix: InstallExtensionQuickAccessProvider.PREFIX,
        placeholder: localize("installExtensionQuickAccessPlaceholder", "Type the name of an extension to install or search."),
        helpEntries: [{ description: localize("installExtensionQuickAccessHelp", "Install or Search Extensions") }]
      });
    }
  }
  // Global actions
  registerGlobalActions() {
    this._register(MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
      command: {
        id: VIEWLET_ID,
        title: localize({ key: "miPreferencesExtensions", comment: ["&& denotes a mnemonic"] }, "&&Extensions")
      },
      group: "2_configuration",
      order: 3,
      when: IsSessionsWindowContext.negate()
    }));
    this._register(MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
      command: {
        id: VIEWLET_ID,
        title: localize("showExtensions", "Extensions")
      },
      group: "2_configuration",
      order: 3
    }));
    this.registerExtensionAction({
      id: "workbench.extensions.action.focusExtensionsView",
      title: localize2("focusExtensions", "Focus on Extensions View"),
      category: ExtensionsLocalizedLabel,
      f1: true,
      run: async (accessor) => {
        await accessor.get(IExtensionsWorkbenchService).openSearch("");
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.installExtensions",
      title: localize2("installExtensions", "Install Extensions"),
      category: ExtensionsLocalizedLabel,
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER))
      },
      run: async (accessor) => {
        accessor.get(IViewsService).openViewContainer(VIEWLET_ID, true);
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.showRecommendedKeymapExtensions",
      title: localize2("showRecommendedKeymapExtensionsShort", "Keymaps"),
      category: PreferencesLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: CONTEXT_HAS_GALLERY
      }, {
        id: MenuId.EditorTitle,
        when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_HAS_GALLERY),
        group: "2_keyboard_discover_actions"
      }],
      menuTitles: {
        [MenuId.EditorTitle.id]: localize("importKeyboardShortcutsFroms", "Migrate Keyboard Shortcuts from...")
      },
      run: () => this.extensionsWorkbenchService.openSearch("@recommended:keymaps ")
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.showLanguageExtensions",
      title: localize2("showLanguageExtensionsShort", "Language Extensions"),
      category: PreferencesLocalizedLabel,
      menu: {
        id: MenuId.CommandPalette,
        when: CONTEXT_HAS_GALLERY
      },
      run: () => this.extensionsWorkbenchService.openSearch("@recommended:languages ")
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.checkForUpdates",
      title: localize2("checkForUpdates", "Check for Extension Updates"),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER))
      }, {
        id: MenuId.ViewContainerTitle,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("viewContainer", VIEWLET_ID), CONTEXT_HAS_GALLERY),
        group: "1_updates",
        order: 1
      }],
      run: async () => {
        const [, pluginResult] = await Promise.all([
          this.extensionsWorkbenchService.checkForUpdates(),
          this.pluginInstallService.updateAllPlugins({ silent: true }, CancellationToken.None)
        ]);
        const outdated = this.extensionsWorkbenchService.outdated;
        if (outdated.length) {
          return this.extensionsWorkbenchService.openSearch("@outdated ");
        } else if (pluginResult.updatedNames.length === 0 && pluginResult.failedNames.length === 0) {
          return this.dialogService.info(localize("noUpdatesAvailable", "All extensions are up to date."));
        }
      }
    });
    const enableAutoUpdateWhenCondition = ContextKeyExpr.equals(`config.${AutoUpdateConfigurationKey}`, "off");
    this.registerExtensionAction({
      id: "workbench.extensions.action.enableAutoUpdate",
      title: localize2("enableAutoUpdate", "Enable Auto Update for Extensions"),
      category: ExtensionsLocalizedLabel,
      precondition: enableAutoUpdateWhenCondition,
      menu: [{
        id: MenuId.ViewContainerTitle,
        order: 5,
        group: "1_updates",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("viewContainer", VIEWLET_ID), enableAutoUpdateWhenCondition)
      }, {
        id: MenuId.CommandPalette
      }],
      run: (accessor) => accessor.get(IExtensionsWorkbenchService).updateAutoUpdateForAllExtensions(true)
    });
    const disableAutoUpdateWhenCondition = ContextKeyExpr.notEquals(`config.${AutoUpdateConfigurationKey}`, "off");
    this.registerExtensionAction({
      id: "workbench.extensions.action.disableAutoUpdate",
      title: localize2("disableAutoUpdate", "Disable Auto Update for Extensions"),
      precondition: disableAutoUpdateWhenCondition,
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.ViewContainerTitle,
        order: 5,
        group: "1_updates",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("viewContainer", VIEWLET_ID), disableAutoUpdateWhenCondition)
      }, {
        id: MenuId.CommandPalette
      }],
      run: (accessor) => accessor.get(IExtensionsWorkbenchService).updateAutoUpdateForAllExtensions(false)
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.updateAllExtensions",
      title: localize2("updateAll", "Update All Extensions"),
      category: ExtensionsLocalizedLabel,
      precondition: HasOutdatedExtensionsContext,
      menu: [
        {
          id: MenuId.CommandPalette,
          when: ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER))
        },
        {
          id: MenuId.ViewContainerTitle,
          when: ContextKeyExpr.equals("viewContainer", VIEWLET_ID),
          group: "1_updates",
          order: 2
        },
        {
          id: MenuId.ViewTitle,
          when: ContextKeyExpr.equals("view", OUTDATED_EXTENSIONS_VIEW_ID),
          group: "navigation",
          order: 1
        }
      ],
      icon: installWorkspaceRecommendedIcon,
      run: async () => {
        await this.extensionsWorkbenchService.updateAll();
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.enableAll",
      title: localize2("enableAll", "Enable All Extensions"),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER)
      }, {
        id: MenuId.ViewContainerTitle,
        when: ContextKeyExpr.equals("viewContainer", VIEWLET_ID),
        group: "2_enablement",
        order: 1
      }],
      run: async () => {
        const extensionsToEnable = this.extensionsWorkbenchService.local.filter((e) => !!e.local && this.extensionEnablementService.canChangeEnablement(e.local) && !this.extensionEnablementService.isEnabled(e.local));
        if (extensionsToEnable.length) {
          await this.extensionsWorkbenchService.setEnablement(extensionsToEnable, EnablementState.EnabledGlobally);
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.enableAllWorkspace",
      title: localize2("enableAllWorkspace", "Enable All Extensions for this Workspace"),
      category: ExtensionsLocalizedLabel,
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo("empty"), ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER))
      },
      run: async () => {
        const extensionsToEnable = this.extensionsWorkbenchService.local.filter((e) => !!e.local && this.extensionEnablementService.canChangeEnablement(e.local) && !this.extensionEnablementService.isEnabled(e.local));
        if (extensionsToEnable.length) {
          await this.extensionsWorkbenchService.setEnablement(extensionsToEnable, EnablementState.EnabledWorkspace);
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.disableAll",
      title: localize2("disableAll", "Disable All Installed Extensions"),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER)
      }, {
        id: MenuId.ViewContainerTitle,
        when: ContextKeyExpr.equals("viewContainer", VIEWLET_ID),
        group: "2_enablement",
        order: 2
      }],
      run: async () => {
        const extensionsToDisable = this.extensionsWorkbenchService.local.filter((e) => !e.isBuiltin && !!e.local && this.extensionEnablementService.isEnabled(e.local) && this.extensionEnablementService.canChangeEnablement(e.local));
        if (extensionsToDisable.length) {
          await this.extensionsWorkbenchService.setEnablement(extensionsToDisable, EnablementState.DisabledGlobally);
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.disableAllWorkspace",
      title: localize2("disableAllWorkspace", "Disable All Installed Extensions for this Workspace"),
      category: ExtensionsLocalizedLabel,
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo("empty"), ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER))
      },
      run: async () => {
        const extensionsToDisable = this.extensionsWorkbenchService.local.filter((e) => !e.isBuiltin && !!e.local && this.extensionEnablementService.isEnabled(e.local) && this.extensionEnablementService.canChangeEnablement(e.local));
        if (extensionsToDisable.length) {
          await this.extensionsWorkbenchService.setEnablement(extensionsToDisable, EnablementState.DisabledWorkspace);
        }
      }
    });
    this.registerExtensionAction({
      id: SELECT_INSTALL_VSIX_EXTENSION_COMMAND_ID,
      title: localize2("InstallFromVSIX", "Install from VSIX..."),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER)
      }, {
        id: MenuId.ViewContainerTitle,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("viewContainer", VIEWLET_ID), ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER)),
        group: "3_install",
        order: 1
      }],
      run: async (accessor) => {
        const fileDialogService = accessor.get(IFileDialogService);
        const commandService = accessor.get(ICommandService);
        const vsixPaths = await fileDialogService.showOpenDialog({
          title: localize("installFromVSIX", "Install from VSIX"),
          filters: [{ name: "VSIX Extensions", extensions: ["vsix"] }],
          canSelectFiles: true,
          canSelectMany: true,
          openLabel: mnemonicButtonLabel(localize({ key: "installButton", comment: ["&& denotes a mnemonic"] }, "&&Install"))
        });
        if (vsixPaths) {
          await commandService.executeCommand(INSTALL_EXTENSION_FROM_VSIX_COMMAND_ID, vsixPaths);
        }
      }
    });
    this.registerExtensionAction({
      id: INSTALL_EXTENSION_FROM_VSIX_COMMAND_ID,
      title: localize("installVSIX", "Install Extension VSIX"),
      menu: [{
        id: MenuId.ExplorerContext,
        group: "extensions",
        when: ContextKeyExpr.and(ResourceContextKey.Extension.isEqualTo(".vsix"), ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER))
      }],
      run: async (accessor, resources) => {
        const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const hostService = accessor.get(IHostService);
        const notificationService = accessor.get(INotificationService);
        const vsixs = Array.isArray(resources) ? resources : [resources];
        const result = await Promise.allSettled(vsixs.map(async (vsix) => await extensionsWorkbenchService.install(vsix, { installGivenVersion: true })));
        let error, requireReload = false, requireRestart = false;
        for (const r of result) {
          if (r.status === "rejected") {
            error = new Error(r.reason);
            break;
          }
          requireReload = requireReload || r.value.runtimeState?.action === ExtensionRuntimeActionType.ReloadWindow;
          requireRestart = requireRestart || r.value.runtimeState?.action === ExtensionRuntimeActionType.RestartExtensions;
        }
        if (error) {
          throw error;
        }
        if (requireReload) {
          notificationService.prompt(
            Severity.Info,
            vsixs.length > 1 ? localize("InstallVSIXs.successReload", "Completed installing extensions. Please reload Visual Studio Code to enable them.") : localize("InstallVSIXAction.successReload", "Completed installing extension. Please reload Visual Studio Code to enable it."),
            [{
              label: localize("InstallVSIXAction.reloadNow", "Reload Now"),
              run: () => hostService.reload()
            }]
          );
        } else if (requireRestart) {
          notificationService.prompt(
            Severity.Info,
            vsixs.length > 1 ? localize("InstallVSIXs.successRestart", "Completed installing extensions. Please restart extensions to enable them.") : localize("InstallVSIXAction.successRestart", "Completed installing extension. Please restart extensions to enable it."),
            [{
              label: localize("InstallVSIXAction.restartExtensions", "Restart Extensions"),
              run: () => extensionsWorkbenchService.updateRunningExtensions()
            }]
          );
        } else {
          notificationService.prompt(
            Severity.Info,
            vsixs.length > 1 ? localize("InstallVSIXs.successNoReload", "Completed installing extensions.") : localize("InstallVSIXAction.successNoReload", "Completed installing extension."),
            []
          );
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.installExtensionFromLocation",
      title: localize2("installExtensionFromLocation", "Install Extension from Location..."),
      category: Categories.Developer,
      menu: [{
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.or(CONTEXT_HAS_WEB_SERVER, CONTEXT_HAS_LOCAL_SERVER)
      }],
      run: async (accessor) => {
        const extensionManagementService = accessor.get(IWorkbenchExtensionManagementService);
        if (isWeb) {
          return new Promise((c, e) => {
            const quickInputService = accessor.get(IQuickInputService);
            const disposables = new DisposableStore();
            const quickPick = disposables.add(quickInputService.createQuickPick());
            quickPick.title = localize("installFromLocation", "Install Extension from Location");
            quickPick.customButton = true;
            quickPick.customLabel = localize("install button", "Install");
            quickPick.placeholder = localize("installFromLocationPlaceHolder", "Location of the web extension");
            quickPick.ignoreFocusOut = true;
            disposables.add(Event.any(quickPick.onDidAccept, quickPick.onDidCustom)(async () => {
              quickPick.hide();
              if (quickPick.value) {
                try {
                  await extensionManagementService.installFromLocation(URI.parse(quickPick.value));
                } catch (error) {
                  e(error);
                  return;
                }
              }
              c();
            }));
            disposables.add(quickPick.onDidHide(() => disposables.dispose()));
            quickPick.show();
          });
        } else {
          const fileDialogService = accessor.get(IFileDialogService);
          const extensionLocation = await fileDialogService.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            title: localize("installFromLocation", "Install Extension from Location")
          });
          if (extensionLocation?.[0]) {
            await extensionManagementService.installFromLocation(extensionLocation[0]);
          }
        }
      }
    });
    MenuRegistry.appendMenuItem(extensionsSearchActionsMenu, {
      submenu: extensionsFilterSubMenu,
      title: localize("filterExtensions", "Filter Extensions..."),
      group: "navigation",
      order: 2,
      icon: filterIcon
    });
    const showFeaturedExtensionsId = "extensions.filter.featured";
    const featuresExtensionsWhenContext = ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.regex(CONTEXT_GALLERY_FILTER_CAPABILITIES.key, new RegExp(`_${FilterType.Featured}_`)));
    this.registerExtensionAction({
      id: showFeaturedExtensionsId,
      title: localize2("showFeaturedExtensions", "Show Featured Extensions"),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: featuresExtensionsWhenContext
      }, {
        id: extensionsFilterSubMenu,
        when: featuresExtensionsWhenContext,
        group: "1_predefined",
        order: 1
      }],
      menuTitles: {
        [extensionsFilterSubMenu.id]: localize("featured filter", "Featured")
      },
      run: () => this.extensionsWorkbenchService.openSearch("@featured ")
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.showPopularExtensions",
      title: localize2("showPopularExtensions", "Show Popular Extensions"),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: CONTEXT_HAS_GALLERY
      }, {
        id: extensionsFilterSubMenu,
        when: CONTEXT_HAS_GALLERY,
        group: "1_predefined",
        order: 2
      }],
      menuTitles: {
        [extensionsFilterSubMenu.id]: localize("most popular filter", "Most Popular")
      },
      run: () => this.extensionsWorkbenchService.openSearch("@popular ")
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.showRecommendedExtensions",
      title: localize2("showRecommendedExtensions", "Show Recommended Extensions"),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: CONTEXT_HAS_GALLERY
      }, {
        id: extensionsFilterSubMenu,
        when: CONTEXT_HAS_GALLERY,
        group: "1_predefined",
        order: 2
      }],
      menuTitles: {
        [extensionsFilterSubMenu.id]: localize("most popular recommended", "Recommended")
      },
      run: () => this.extensionsWorkbenchService.openSearch("@recommended ")
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.recentlyPublishedExtensions",
      title: localize2("recentlyPublishedExtensions", "Show Recently Published Extensions"),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: CONTEXT_HAS_GALLERY
      }, {
        id: extensionsFilterSubMenu,
        when: CONTEXT_HAS_GALLERY,
        group: "1_predefined",
        order: 2
      }],
      menuTitles: {
        [extensionsFilterSubMenu.id]: localize("recently published filter", "Recently Published")
      },
      run: () => this.extensionsWorkbenchService.openSearch("@recentlyPublished ")
    });
    const extensionsCategoryFilterSubMenu = new MenuId("extensionsCategoryFilterSubMenu");
    MenuRegistry.appendMenuItem(extensionsFilterSubMenu, {
      submenu: extensionsCategoryFilterSubMenu,
      title: localize("filter by category", "Category"),
      when: ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.regex(CONTEXT_GALLERY_FILTER_CAPABILITIES.key, new RegExp(`_${FilterType.Category}_`))),
      group: "2_categories",
      order: 1
    });
    EXTENSION_CATEGORIES.forEach((category, index) => {
      this.registerExtensionAction({
        id: `extensions.actions.searchByCategory.${category}`,
        title: category,
        menu: [{
          id: extensionsCategoryFilterSubMenu,
          when: CONTEXT_HAS_GALLERY,
          order: index
        }],
        run: () => this.extensionsWorkbenchService.openSearch(`@category:"${category.toLowerCase()}"`)
      });
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.installedExtensions",
      title: localize2("installedExtensions", "Show Installed Extensions"),
      category: ExtensionsLocalizedLabel,
      f1: true,
      menu: [{
        id: extensionsFilterSubMenu,
        group: "3_installed",
        order: 1
      }],
      menuTitles: {
        [extensionsFilterSubMenu.id]: localize("installed filter", "Installed")
      },
      run: () => this.extensionsWorkbenchService.openSearch("@installed ")
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.listBuiltInExtensions",
      title: localize2("showBuiltInExtensions", "Show Built-in Extensions"),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER)
      }, {
        id: extensionsFilterSubMenu,
        group: "3_installed",
        order: 3
      }],
      menuTitles: {
        [extensionsFilterSubMenu.id]: localize("builtin filter", "Built-in")
      },
      run: () => this.extensionsWorkbenchService.openSearch("@builtin ")
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.extensionUpdates",
      title: localize2("extensionUpdates", "Show Extension Updates"),
      category: ExtensionsLocalizedLabel,
      precondition: CONTEXT_HAS_GALLERY,
      f1: true,
      menu: [{
        id: extensionsFilterSubMenu,
        group: "3_installed",
        when: CONTEXT_HAS_GALLERY,
        order: 2
      }],
      menuTitles: {
        [extensionsFilterSubMenu.id]: localize("extension updates filter", "Updates")
      },
      run: () => this.extensionsWorkbenchService.openSearch("@updates")
    });
    this.registerExtensionAction({
      id: LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID,
      title: localize2("showWorkspaceUnsupportedExtensions", "Show Extensions Unsupported By Workspace"),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER)
      }, {
        id: extensionsFilterSubMenu,
        group: "3_installed",
        order: 6,
        when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER)
      }],
      menuTitles: {
        [extensionsFilterSubMenu.id]: localize("workspace unsupported filter", "Workspace Unsupported")
      },
      run: () => this.extensionsWorkbenchService.openSearch("@workspaceUnsupported")
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.showEnabledExtensions",
      title: localize2("showEnabledExtensions", "Show Enabled Extensions"),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER)
      }, {
        id: extensionsFilterSubMenu,
        group: "3_installed",
        order: 4
      }],
      menuTitles: {
        [extensionsFilterSubMenu.id]: localize("enabled filter", "Enabled")
      },
      run: () => this.extensionsWorkbenchService.openSearch("@enabled ")
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.showDisabledExtensions",
      title: localize2("showDisabledExtensions", "Show Disabled Extensions"),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER)
      }, {
        id: extensionsFilterSubMenu,
        group: "3_installed",
        order: 5
      }],
      menuTitles: {
        [extensionsFilterSubMenu.id]: localize("disabled filter", "Disabled")
      },
      run: () => this.extensionsWorkbenchService.openSearch("@disabled ")
    });
    const extensionsSortSubMenu = new MenuId("extensionsSortSubMenu");
    MenuRegistry.appendMenuItem(extensionsFilterSubMenu, {
      submenu: extensionsSortSubMenu,
      title: localize("sorty by", "Sort By"),
      when: ContextKeyExpr.and(ContextKeyExpr.or(CONTEXT_HAS_GALLERY, DefaultViewsContext)),
      group: "4_sort",
      order: 1
    });
    [
      { id: "installs", title: localize("sort by installs", "Install Count"), precondition: BuiltInExtensionsContext.negate(), sortCapability: SortBy.InstallCount },
      { id: "rating", title: localize("sort by rating", "Rating"), precondition: BuiltInExtensionsContext.negate(), sortCapability: SortBy.WeightedRating },
      { id: "name", title: localize("sort by name", "Name"), precondition: BuiltInExtensionsContext.negate(), sortCapability: SortBy.Title },
      { id: "publishedDate", title: localize("sort by published date", "Published Date"), precondition: BuiltInExtensionsContext.negate(), sortCapability: SortBy.PublishedDate },
      { id: "updateDate", title: localize("sort by update date", "Updated Date"), precondition: ContextKeyExpr.and(SearchMarketplaceExtensionsContext.negate(), RecommendedExtensionsContext.negate(), BuiltInExtensionsContext.negate()), sortCapability: "UpdateDate" }
    ].map(({ id, title, precondition, sortCapability }, index) => {
      const sortCapabilityContext = ContextKeyExpr.regex(CONTEXT_GALLERY_SORT_CAPABILITIES.key, new RegExp(`_${sortCapability}_`));
      this.registerExtensionAction({
        id: `extensions.sort.${id}`,
        title,
        precondition: ContextKeyExpr.and(precondition, ContextKeyExpr.regex(ExtensionsSearchValueContext.key, /^@contribute:/).negate(), sortCapabilityContext),
        menu: [{
          id: extensionsSortSubMenu,
          when: ContextKeyExpr.and(ContextKeyExpr.or(CONTEXT_HAS_GALLERY, DefaultViewsContext), sortCapabilityContext),
          order: index
        }],
        toggled: ExtensionsSortByContext.isEqualTo(id),
        run: async () => {
          const extensionsViewPaneContainer = (await this.viewsService.openViewContainer(VIEWLET_ID, true))?.getViewPaneContainer();
          const currentQuery = Query.parse(extensionsViewPaneContainer?.searchValue ?? "");
          extensionsViewPaneContainer?.search(new Query(currentQuery.value, id).toString());
          extensionsViewPaneContainer?.focus();
        }
      });
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.clearExtensionsSearchResults",
      title: localize2("clearExtensionsSearchResults", "Clear Extensions Search Results"),
      category: ExtensionsLocalizedLabel,
      icon: clearSearchResultsIcon,
      f1: true,
      precondition: SearchHasTextContext,
      menu: {
        id: extensionsSearchActionsMenu,
        group: "navigation",
        order: 1
      },
      run: async (accessor) => {
        const viewPaneContainer = accessor.get(IViewsService).getActiveViewPaneContainerWithId(VIEWLET_ID);
        if (viewPaneContainer) {
          const extensionsViewPaneContainer = viewPaneContainer;
          extensionsViewPaneContainer.search("");
          extensionsViewPaneContainer.focus();
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.refreshExtension",
      title: localize2("refreshExtension", "Refresh"),
      category: ExtensionsLocalizedLabel,
      icon: refreshIcon,
      f1: true,
      menu: {
        id: MenuId.ViewContainerTitle,
        when: ContextKeyExpr.equals("viewContainer", VIEWLET_ID),
        group: "navigation",
        order: 2
      },
      run: async (accessor) => {
        const viewPaneContainer = accessor.get(IViewsService).getActiveViewPaneContainerWithId(VIEWLET_ID);
        if (viewPaneContainer) {
          await viewPaneContainer.refresh();
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.installWorkspaceRecommendedExtensions",
      title: localize("installWorkspaceRecommendedExtensions", "Install Workspace Recommended Extensions"),
      icon: installWorkspaceRecommendedIcon,
      menu: {
        id: MenuId.ViewTitle,
        when: ContextKeyExpr.equals("view", WORKSPACE_RECOMMENDATIONS_VIEW_ID),
        group: "navigation",
        order: 1
      },
      run: async (accessor) => {
        const view = accessor.get(IViewsService).getActiveViewWithId(WORKSPACE_RECOMMENDATIONS_VIEW_ID);
        return view.installWorkspaceRecommendations();
      }
    });
    this.registerExtensionAction({
      id: ConfigureWorkspaceFolderRecommendedExtensionsAction.ID,
      title: ConfigureWorkspaceFolderRecommendedExtensionsAction.LABEL,
      icon: configureRecommendedIcon,
      menu: [{
        id: MenuId.CommandPalette,
        when: WorkbenchStateContext.notEqualsTo("empty")
      }, {
        id: MenuId.ViewTitle,
        when: ContextKeyExpr.equals("view", WORKSPACE_RECOMMENDATIONS_VIEW_ID),
        group: "navigation",
        order: 2
      }],
      run: () => runAction(this.instantiationService.createInstance(ConfigureWorkspaceFolderRecommendedExtensionsAction, ConfigureWorkspaceFolderRecommendedExtensionsAction.ID, ConfigureWorkspaceFolderRecommendedExtensionsAction.LABEL))
    });
    this.registerExtensionAction({
      id: InstallSpecificVersionOfExtensionAction.ID,
      title: { value: InstallSpecificVersionOfExtensionAction.LABEL, original: "Install Specific Version of Extension..." },
      category: ExtensionsLocalizedLabel,
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER))
      },
      run: () => runAction(this.instantiationService.createInstance(InstallSpecificVersionOfExtensionAction, InstallSpecificVersionOfExtensionAction.ID, InstallSpecificVersionOfExtensionAction.LABEL))
    });
  }
  // Extension Context Menu
  registerContextMenuActions() {
    this.registerExtensionAction({
      id: SetColorThemeAction.ID,
      title: SetColorThemeAction.TITLE,
      menu: {
        id: MenuId.ExtensionContext,
        group: THEME_ACTIONS_GROUP,
        order: 0,
        when: ContextKeyExpr.and(ContextKeyExpr.not("inExtensionEditor"), ContextKeyExpr.equals("extensionStatus", "installed"), ContextKeyExpr.has("extensionHasColorThemes"))
      },
      run: async (accessor, extensionId) => {
        const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const instantiationService = accessor.get(IInstantiationService);
        const extension = extensionWorkbenchService.local.find((e) => areSameExtensions(e.identifier, { id: extensionId }));
        if (extension) {
          const action = instantiationService.createInstance(SetColorThemeAction);
          action.extension = extension;
          return runAction(action);
        }
      }
    });
    this.registerExtensionAction({
      id: SetFileIconThemeAction.ID,
      title: SetFileIconThemeAction.TITLE,
      menu: {
        id: MenuId.ExtensionContext,
        group: THEME_ACTIONS_GROUP,
        order: 0,
        when: ContextKeyExpr.and(ContextKeyExpr.not("inExtensionEditor"), ContextKeyExpr.equals("extensionStatus", "installed"), ContextKeyExpr.has("extensionHasFileIconThemes"))
      },
      run: async (accessor, extensionId) => {
        const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const instantiationService = accessor.get(IInstantiationService);
        const extension = extensionWorkbenchService.local.find((e) => areSameExtensions(e.identifier, { id: extensionId }));
        if (extension) {
          const action = instantiationService.createInstance(SetFileIconThemeAction);
          action.extension = extension;
          return runAction(action);
        }
      }
    });
    this.registerExtensionAction({
      id: SetProductIconThemeAction.ID,
      title: SetProductIconThemeAction.TITLE,
      menu: {
        id: MenuId.ExtensionContext,
        group: THEME_ACTIONS_GROUP,
        order: 0,
        when: ContextKeyExpr.and(ContextKeyExpr.not("inExtensionEditor"), ContextKeyExpr.equals("extensionStatus", "installed"), ContextKeyExpr.has("extensionHasProductIconThemes"))
      },
      run: async (accessor, extensionId) => {
        const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const instantiationService = accessor.get(IInstantiationService);
        const extension = extensionWorkbenchService.local.find((e) => areSameExtensions(e.identifier, { id: extensionId }));
        if (extension) {
          const action = instantiationService.createInstance(SetProductIconThemeAction);
          action.extension = extension;
          return runAction(action);
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.showPreReleaseVersion",
      title: localize2("show pre-release version", "Show Pre-Release Version"),
      menu: {
        id: MenuId.ExtensionContext,
        group: INSTALL_ACTIONS_GROUP,
        order: 0,
        when: ContextKeyExpr.and(ContextKeyExpr.has("inExtensionEditor"), ContextKeyExpr.has("galleryExtensionHasPreReleaseVersion"), ContextKeyExpr.has("isPreReleaseExtensionAllowed"), ContextKeyExpr.not("showPreReleaseVersion"), ContextKeyExpr.not("isBuiltinExtension"))
      },
      run: async (accessor, extensionId) => {
        const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const extension = (await extensionWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
        extensionWorkbenchService.open(extension, { showPreReleaseVersion: true });
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.showReleasedVersion",
      title: localize2("show released version", "Show Release Version"),
      menu: {
        id: MenuId.ExtensionContext,
        group: INSTALL_ACTIONS_GROUP,
        order: 1,
        when: ContextKeyExpr.and(ContextKeyExpr.has("inExtensionEditor"), ContextKeyExpr.has("galleryExtensionHasPreReleaseVersion"), ContextKeyExpr.has("extensionHasReleaseVersion"), ContextKeyExpr.has("showPreReleaseVersion"), ContextKeyExpr.not("isBuiltinExtension"))
      },
      run: async (accessor, extensionId) => {
        const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const extension = (await extensionWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
        extensionWorkbenchService.open(extension, { showPreReleaseVersion: false });
      }
    });
    this.registerExtensionAction({
      id: ToggleAutoUpdateForExtensionAction.ID,
      title: ToggleAutoUpdateForExtensionAction.LABEL,
      category: ExtensionsLocalizedLabel,
      precondition: ContextKeyExpr.and(ContextKeyExpr.or(ContextKeyExpr.notEquals(`config.${AutoUpdateConfigurationKey}`, "on"), ContextKeyExpr.equals("isExtensionEnabled", true)), ContextKeyExpr.not("extensionDisallowInstall"), ContextKeyExpr.has("isExtensionAllowed")),
      menu: {
        id: MenuId.ExtensionContext,
        group: UPDATE_ACTIONS_GROUP,
        order: 1,
        when: ContextKeyExpr.and(
          ContextKeyExpr.not("inExtensionEditor"),
          ContextKeyExpr.equals("extensionStatus", "installed"),
          ContextKeyExpr.not("isBuiltinExtension")
        )
      },
      run: async (accessor, id) => {
        const instantiationService = accessor.get(IInstantiationService);
        const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const extension = extensionWorkbenchService.local.find((e) => areSameExtensions(e.identifier, { id }));
        if (extension) {
          const action = instantiationService.createInstance(ToggleAutoUpdateForExtensionAction);
          action.extension = extension;
          return runAction(action);
        }
      }
    });
    this.registerExtensionAction({
      id: ToggleAutoUpdatesForPublisherAction.ID,
      title: { value: ToggleAutoUpdatesForPublisherAction.LABEL, original: "Auto Update (Publisher)" },
      category: ExtensionsLocalizedLabel,
      precondition: ContextKeyExpr.equals(`config.${AutoUpdateConfigurationKey}`, "off"),
      menu: {
        id: MenuId.ExtensionContext,
        group: UPDATE_ACTIONS_GROUP,
        order: 2,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("extensionStatus", "installed"), ContextKeyExpr.not("isBuiltinExtension"))
      },
      run: async (accessor, id) => {
        const instantiationService = accessor.get(IInstantiationService);
        const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const extension = extensionWorkbenchService.local.find((e) => areSameExtensions(e.identifier, { id }));
        if (extension) {
          const action = instantiationService.createInstance(ToggleAutoUpdatesForPublisherAction);
          action.extension = extension;
          return runAction(action);
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.switchToPreRlease",
      title: localize("enablePreRleaseLabel", "Switch to Pre-Release Version"),
      category: ExtensionsLocalizedLabel,
      menu: {
        id: MenuId.ExtensionContext,
        group: INSTALL_ACTIONS_GROUP,
        order: 2,
        when: ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.has("galleryExtensionHasPreReleaseVersion"), ContextKeyExpr.has("isPreReleaseExtensionAllowed"), ContextKeyExpr.not("installedExtensionIsOptedToPreRelease"), ContextKeyExpr.not("inExtensionEditor"), ContextKeyExpr.equals("extensionStatus", "installed"), ContextKeyExpr.not("isBuiltinExtension"))
      },
      run: async (accessor, id) => {
        const instantiationService = accessor.get(IInstantiationService);
        const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const extension = extensionWorkbenchService.local.find((e) => areSameExtensions(e.identifier, { id }));
        if (extension) {
          const action = instantiationService.createInstance(TogglePreReleaseExtensionAction);
          action.extension = extension;
          return runAction(action);
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.switchToRelease",
      title: localize("disablePreRleaseLabel", "Switch to Release Version"),
      category: ExtensionsLocalizedLabel,
      menu: {
        id: MenuId.ExtensionContext,
        group: INSTALL_ACTIONS_GROUP,
        order: 2,
        when: ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.has("galleryExtensionHasPreReleaseVersion"), ContextKeyExpr.has("isExtensionAllowed"), ContextKeyExpr.has("installedExtensionIsOptedToPreRelease"), ContextKeyExpr.not("inExtensionEditor"), ContextKeyExpr.equals("extensionStatus", "installed"), ContextKeyExpr.not("isBuiltinExtension"))
      },
      run: async (accessor, id) => {
        const instantiationService = accessor.get(IInstantiationService);
        const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const extension = extensionWorkbenchService.local.find((e) => areSameExtensions(e.identifier, { id }));
        if (extension) {
          const action = instantiationService.createInstance(TogglePreReleaseExtensionAction);
          action.extension = extension;
          return runAction(action);
        }
      }
    });
    this.registerExtensionAction({
      id: ClearLanguageAction.ID,
      title: ClearLanguageAction.TITLE,
      menu: {
        id: MenuId.ExtensionContext,
        group: INSTALL_ACTIONS_GROUP,
        order: 0,
        when: ContextKeyExpr.and(ContextKeyExpr.not("inExtensionEditor"), ContextKeyExpr.has("canSetLanguage"), ContextKeyExpr.has("isActiveLanguagePackExtension"))
      },
      run: async (accessor, extensionId) => {
        const instantiationService = accessor.get(IInstantiationService);
        const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const extension = (await extensionsWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
        const action = instantiationService.createInstance(ClearLanguageAction);
        action.extension = extension;
        return runAction(action);
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.installUnsigned",
      title: localize("install", "Install"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "0_install",
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("extensionStatus", "uninstalled"),
          ContextKeyExpr.has("isGalleryExtension"),
          ContextKeyExpr.not("extensionDisallowInstall"),
          ContextKeyExpr.has("extensionIsUnsigned"),
          ContextKeyExpr.or(ContextKeyExpr.and(CONTEXT_GALLERY_ALL_PUBLIC_REPOSITORY_SIGNED, ContextKeyExpr.not("extensionIsPrivate")), ContextKeyExpr.and(CONTEXT_GALLERY_ALL_PRIVATE_REPOSITORY_SIGNED, ContextKeyExpr.has("extensionIsPrivate")))
        ),
        order: 1
      },
      run: async (accessor, extensionId) => {
        const instantiationService = accessor.get(IInstantiationService);
        const extension = this.extensionsWorkbenchService.local.filter((e) => areSameExtensions(e.identifier, { id: extensionId }))[0] || (await this.extensionsWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
        if (extension) {
          const action = instantiationService.createInstance(InstallAction, { installPreReleaseVersion: this.extensionManagementService.preferPreReleases });
          action.extension = extension;
          return runAction(action);
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.installAndDonotSync",
      title: localize("install installAndDonotSync", "Install (Do not Sync)"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "0_install",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("extensionStatus", "uninstalled"), ContextKeyExpr.has("isGalleryExtension"), ContextKeyExpr.has("isExtensionAllowed"), ContextKeyExpr.not("extensionDisallowInstall"), CONTEXT_SYNC_ENABLEMENT),
        order: 1
      },
      run: async (accessor, extensionId) => {
        const instantiationService = accessor.get(IInstantiationService);
        const extension = this.extensionsWorkbenchService.local.filter((e) => areSameExtensions(e.identifier, { id: extensionId }))[0] || (await this.extensionsWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
        if (extension) {
          const action = instantiationService.createInstance(InstallAction, {
            installPreReleaseVersion: this.extensionManagementService.preferPreReleases,
            isMachineScoped: true
          });
          action.extension = extension;
          return runAction(action);
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.installPrereleaseAndDonotSync",
      title: localize("installPrereleaseAndDonotSync", "Install Pre-Release (Do not Sync)"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "0_install",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("extensionStatus", "uninstalled"), ContextKeyExpr.has("isGalleryExtension"), ContextKeyExpr.has("extensionHasPreReleaseVersion"), ContextKeyExpr.has("isPreReleaseExtensionAllowed"), ContextKeyExpr.not("extensionDisallowInstall"), CONTEXT_SYNC_ENABLEMENT),
        order: 2
      },
      run: async (accessor, extensionId) => {
        const instantiationService = accessor.get(IInstantiationService);
        const extension = this.extensionsWorkbenchService.local.filter((e) => areSameExtensions(e.identifier, { id: extensionId }))[0] || (await this.extensionsWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
        if (extension) {
          const action = instantiationService.createInstance(InstallAction, {
            isMachineScoped: true,
            preRelease: true
          });
          action.extension = extension;
          return runAction(action);
        }
      }
    });
    this.registerExtensionAction({
      id: InstallAnotherVersionAction.ID,
      title: InstallAnotherVersionAction.LABEL,
      menu: {
        id: MenuId.ExtensionContext,
        group: "0_install",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("extensionStatus", "uninstalled"), ContextKeyExpr.has("isGalleryExtension"), ContextKeyExpr.has("isExtensionAllowed"), ContextKeyExpr.not("extensionDisallowInstall")),
        order: 3
      },
      run: async (accessor, extensionId) => {
        const instantiationService = accessor.get(IInstantiationService);
        const extension = this.extensionsWorkbenchService.local.filter((e) => areSameExtensions(e.identifier, { id: extensionId }))[0] || (await this.extensionsWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
        if (extension) {
          return runAction(instantiationService.createInstance(InstallAnotherVersionAction, extension, false));
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.copyExtension",
      title: localize2("workbench.extensions.action.copyExtension", "Copy"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "1_copy"
      },
      run: async (accessor, extensionId) => {
        const clipboardService = accessor.get(IClipboardService);
        const extension = this.extensionsWorkbenchService.local.filter((e) => areSameExtensions(e.identifier, { id: extensionId }))[0] || (await this.extensionsWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
        if (extension) {
          const name = localize("extensionInfoName", "Name: {0}", extension.displayName);
          const id = localize("extensionInfoId", "Id: {0}", extensionId);
          const description = localize("extensionInfoDescription", "Description: {0}", extension.description);
          const verision = localize("extensionInfoVersion", "Version: {0}", extension.version);
          const publisher = localize("extensionInfoPublisher", "Publisher: {0}", extension.publisherDisplayName);
          const link = extension.url ? localize("extensionInfoVSMarketplaceLink", "VS Marketplace Link: {0}", `${extension.url}`) : null;
          const clipboardStr = `${name}
${id}
${description}
${verision}
${publisher}${link ? "\n" + link : ""}`;
          await clipboardService.writeText(clipboardStr);
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.copyExtensionId",
      title: localize2("workbench.extensions.action.copyExtensionId", "Copy Extension ID"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "1_copy"
      },
      run: async (accessor, id) => accessor.get(IClipboardService).writeText(id)
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.copyLink",
      title: localize2("workbench.extensions.action.copyLink", "Copy Link"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "1_copy",
        when: ContextKeyExpr.and(ContextKeyExpr.has("isGalleryExtension"), CONTEXT_GALLERY_HAS_EXTENSION_LINK)
      },
      run: async (accessor, _, extension) => {
        const clipboardService = accessor.get(IClipboardService);
        if (extension.galleryLink) {
          await clipboardService.writeText(extension.galleryLink);
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.configure",
      title: localize2("workbench.extensions.action.configure", "Settings"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "2_configure",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("extensionStatus", "installed"), ContextKeyExpr.has("extensionHasConfiguration")),
        order: 1
      },
      run: async (accessor, id) => accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: `@ext:${id}` })
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.download",
      title: localize("download VSIX", "Download VSIX"),
      menu: {
        id: MenuId.ExtensionContext,
        when: ContextKeyExpr.and(ContextKeyExpr.not("extensionDisallowInstall"), ContextKeyExpr.has("isGalleryExtension")),
        order: this.productService.quality === "stable" ? 0 : 1
      },
      run: async (accessor, extensionId) => {
        accessor.get(IExtensionsWorkbenchService).downloadVSIX(extensionId, "release");
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.downloadPreRelease",
      title: localize("download pre-release", "Download Pre-Release VSIX"),
      menu: {
        id: MenuId.ExtensionContext,
        when: ContextKeyExpr.and(ContextKeyExpr.not("extensionDisallowInstall"), ContextKeyExpr.has("isGalleryExtension"), ContextKeyExpr.has("extensionHasPreReleaseVersion")),
        order: this.productService.quality === "stable" ? 1 : 0
      },
      run: async (accessor, extensionId) => {
        accessor.get(IExtensionsWorkbenchService).downloadVSIX(extensionId, "prerelease");
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.downloadSpecificVersion",
      title: localize("download specific version", "Download Specific Version VSIX..."),
      menu: {
        id: MenuId.ExtensionContext,
        when: ContextKeyExpr.and(ContextKeyExpr.not("extensionDisallowInstall"), ContextKeyExpr.has("isGalleryExtension")),
        order: 2
      },
      run: async (accessor, extensionId) => {
        accessor.get(IExtensionsWorkbenchService).downloadVSIX(extensionId, "any");
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.manageAccountPreferences",
      title: localize2("workbench.extensions.action.changeAccountPreference", "Account Preferences"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "2_configure",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("extensionStatus", "installed"), ContextKeyExpr.has("extensionHasAccountPreferences")),
        order: 2
      },
      run: (accessor, id) => accessor.get(ICommandService).executeCommand("_manageAccountPreferencesForExtension", id)
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.configureKeybindings",
      title: localize2("workbench.extensions.action.configureKeybindings", "Keyboard Shortcuts"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "2_configure",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("extensionStatus", "installed"), ContextKeyExpr.has("extensionHasKeybindings")),
        order: 2
      },
      run: async (accessor, id) => accessor.get(IPreferencesService).openGlobalKeybindingSettings(false, { query: `@ext:${id}` })
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.toggleApplyToAllProfiles",
      title: localize2("workbench.extensions.action.toggleApplyToAllProfiles", "Apply Extension to all Profiles"),
      toggled: ContextKeyExpr.has("isApplicationScopedExtension"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "2_configure",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("extensionStatus", "installed"), ContextKeyExpr.has("isDefaultApplicationScopedExtension").negate(), ContextKeyExpr.has("isBuiltinExtension").negate(), ContextKeyExpr.equals("isWorkspaceScopedExtension", false)),
        order: 3
      },
      run: async (accessor, _, extensionArg) => {
        const uriIdentityService = accessor.get(IUriIdentityService);
        const extension = extensionArg.location ? this.extensionsWorkbenchService.installed.find((e) => uriIdentityService.extUri.isEqual(e.local?.location, extensionArg.location)) : void 0;
        if (extension) {
          return this.extensionsWorkbenchService.toggleApplyExtensionToAllProfiles(extension);
        }
      }
    });
    this.registerExtensionAction({
      id: TOGGLE_IGNORE_EXTENSION_ACTION_ID,
      title: localize2("workbench.extensions.action.toggleIgnoreExtension", "Sync This Extension"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "2_configure",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("extensionStatus", "installed"), CONTEXT_SYNC_ENABLEMENT, ContextKeyExpr.equals("isWorkspaceScopedExtension", false)),
        order: 4
      },
      run: async (accessor, id) => {
        const extension = this.extensionsWorkbenchService.local.find((e) => areSameExtensions({ id }, e.identifier));
        if (extension) {
          return this.extensionsWorkbenchService.toggleExtensionIgnoredToSync(extension);
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.ignoreRecommendation",
      title: localize2("workbench.extensions.action.ignoreRecommendation", "Ignore Recommendation"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "3_recommendations",
        when: ContextKeyExpr.has("isExtensionRecommended"),
        order: 1
      },
      run: async (accessor, id) => accessor.get(IExtensionIgnoredRecommendationsService).toggleGlobalIgnoredRecommendation(id, true)
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.undoIgnoredRecommendation",
      title: localize2("workbench.extensions.action.undoIgnoredRecommendation", "Undo Ignored Recommendation"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "3_recommendations",
        when: ContextKeyExpr.has("isUserIgnoredRecommendation"),
        order: 1
      },
      run: async (accessor, id) => accessor.get(IExtensionIgnoredRecommendationsService).toggleGlobalIgnoredRecommendation(id, false)
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.addExtensionToWorkspaceRecommendations",
      title: localize2("workbench.extensions.action.addExtensionToWorkspaceRecommendations", "Add to Workspace Recommendations"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "3_recommendations",
        when: ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo("empty"), ContextKeyExpr.has("isBuiltinExtension").negate(), ContextKeyExpr.has("isExtensionWorkspaceRecommended").negate(), ContextKeyExpr.has("isUserIgnoredRecommendation").negate(), ContextKeyExpr.notEquals("extensionSource", "resource")),
        order: 2
      },
      run: (accessor, id) => accessor.get(IWorkspaceExtensionsConfigService).toggleRecommendation(id)
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.removeExtensionFromWorkspaceRecommendations",
      title: localize2("workbench.extensions.action.removeExtensionFromWorkspaceRecommendations", "Remove from Workspace Recommendations"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "3_recommendations",
        when: ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo("empty"), ContextKeyExpr.has("isBuiltinExtension").negate(), ContextKeyExpr.has("isExtensionWorkspaceRecommended")),
        order: 2
      },
      run: (accessor, id) => accessor.get(IWorkspaceExtensionsConfigService).toggleRecommendation(id)
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.addToWorkspaceRecommendations",
      title: localize2("workbench.extensions.action.addToWorkspaceRecommendations", "Add Extension to Workspace Recommendations"),
      category: EXTENSIONS_CATEGORY,
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo("workspace"), ContextKeyExpr.equals("resourceScheme", Schemas.extension))
      },
      async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const workspaceExtensionsConfigService = accessor.get(IWorkspaceExtensionsConfigService);
        if (!(editorService.activeEditor instanceof ExtensionsInput)) {
          return;
        }
        const extensionId = editorService.activeEditor.extension.identifier.id.toLowerCase();
        const recommendations = await workspaceExtensionsConfigService.getRecommendations();
        if (recommendations.includes(extensionId)) {
          return;
        }
        await workspaceExtensionsConfigService.toggleRecommendation(extensionId);
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.addToWorkspaceFolderRecommendations",
      title: localize2("workbench.extensions.action.addToWorkspaceFolderRecommendations", "Add Extension to Workspace Folder Recommendations"),
      category: EXTENSIONS_CATEGORY,
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo("folder"), ContextKeyExpr.equals("resourceScheme", Schemas.extension))
      },
      run: () => this.commandService.executeCommand("workbench.extensions.action.addToWorkspaceRecommendations")
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.addToWorkspaceIgnoredRecommendations",
      title: localize2("workbench.extensions.action.addToWorkspaceIgnoredRecommendations", "Add Extension to Workspace Ignored Recommendations"),
      category: EXTENSIONS_CATEGORY,
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo("workspace"), ContextKeyExpr.equals("resourceScheme", Schemas.extension))
      },
      async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const workspaceExtensionsConfigService = accessor.get(IWorkspaceExtensionsConfigService);
        if (!(editorService.activeEditor instanceof ExtensionsInput)) {
          return;
        }
        const extensionId = editorService.activeEditor.extension.identifier.id.toLowerCase();
        const unwantedRecommendations = await workspaceExtensionsConfigService.getUnwantedRecommendations();
        if (unwantedRecommendations.includes(extensionId)) {
          return;
        }
        await workspaceExtensionsConfigService.toggleUnwantedRecommendation(extensionId);
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.addToWorkspaceFolderIgnoredRecommendations",
      title: localize2("workbench.extensions.action.addToWorkspaceFolderIgnoredRecommendations", "Add Extension to Workspace Folder Ignored Recommendations"),
      category: EXTENSIONS_CATEGORY,
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo("folder"), ContextKeyExpr.equals("resourceScheme", Schemas.extension))
      },
      run: () => this.commandService.executeCommand("workbench.extensions.action.addToWorkspaceIgnoredRecommendations")
    });
    this.registerExtensionAction({
      id: ConfigureWorkspaceRecommendedExtensionsAction.ID,
      title: { value: ConfigureWorkspaceRecommendedExtensionsAction.LABEL, original: "Configure Recommended Extensions (Workspace)" },
      category: EXTENSIONS_CATEGORY,
      menu: {
        id: MenuId.CommandPalette,
        when: WorkbenchStateContext.isEqualTo("workspace")
      },
      run: () => runAction(this.instantiationService.createInstance(ConfigureWorkspaceRecommendedExtensionsAction, ConfigureWorkspaceRecommendedExtensionsAction.ID, ConfigureWorkspaceRecommendedExtensionsAction.LABEL))
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.manageTrustedPublishers",
      title: localize2("workbench.extensions.action.manageTrustedPublishers", "Manage Trusted Extension Publishers"),
      category: EXTENSIONS_CATEGORY,
      f1: true,
      run: async (accessor) => {
        const quickInputService = accessor.get(IQuickInputService);
        const extensionManagementService = accessor.get(IWorkbenchExtensionManagementService);
        const trustedPublishers = extensionManagementService.getTrustedPublishers();
        const trustedPublisherItems = trustedPublishers.map((publisher) => ({
          id: publisher.publisher,
          label: publisher.publisherDisplayName,
          description: publisher.publisher,
          picked: true
        })).sort((a, b) => a.label.localeCompare(b.label));
        const result = await quickInputService.pick(trustedPublisherItems, {
          canPickMany: true,
          title: localize("trustedPublishers", "Manage Trusted Extension Publishers"),
          placeHolder: localize("trustedPublishersPlaceholder", "Choose which publishers to trust")
        });
        if (result) {
          const untrustedPublishers = [];
          for (const { publisher } of trustedPublishers) {
            if (!result.some((r) => r.id === publisher)) {
              untrustedPublishers.push(publisher);
            }
          }
          trustedPublishers.filter((publisher) => !result.some((r) => r.id === publisher.publisher));
          extensionManagementService.untrustPublishers(...untrustedPublishers);
        }
      }
    });
  }
  registerExtensionAction(extensionActionOptions) {
    const menus = extensionActionOptions.menu ? Array.isArray(extensionActionOptions.menu) ? extensionActionOptions.menu : [extensionActionOptions.menu] : [];
    let menusWithOutTitles = [];
    const menusWithTitles = [];
    if (extensionActionOptions.menuTitles) {
      for (let index = 0; index < menus.length; index++) {
        const menu = menus[index];
        const menuTitle = extensionActionOptions.menuTitles[menu.id.id];
        if (menuTitle) {
          menusWithTitles.push({ id: menu.id, item: { ...menu, command: { id: extensionActionOptions.id, title: menuTitle } } });
        } else {
          menusWithOutTitles.push(menu);
        }
      }
    } else {
      menusWithOutTitles = menus;
    }
    const disposables = new DisposableStore();
    disposables.add(registerAction2(class extends Action2 {
      constructor() {
        super({
          ...extensionActionOptions,
          menu: menusWithOutTitles
        });
      }
      run(accessor, ...args) {
        return extensionActionOptions.run(accessor, ...args);
      }
    }));
    if (menusWithTitles.length) {
      disposables.add(MenuRegistry.appendMenuItems(menusWithTitles));
    }
    return disposables;
  }
};
ExtensionsContributions = __decorateClass([
  __decorateParam(0, IExtensionManagementService),
  __decorateParam(1, IExtensionManagementServerService),
  __decorateParam(2, IExtensionGalleryManifestService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IViewsService),
  __decorateParam(5, IExtensionsWorkbenchService),
  __decorateParam(6, IWorkbenchExtensionEnablementService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, ICommandService),
  __decorateParam(10, IProductService),
  __decorateParam(11, IPluginInstallService)
], ExtensionsContributions);
let ExtensionStorageCleaner = class {
  constructor(extensionManagementService, storageService) {
    ExtensionStorageService.removeOutdatedExtensionVersions(extensionManagementService, storageService);
  }
};
ExtensionStorageCleaner = __decorateClass([
  __decorateParam(0, IExtensionManagementService),
  __decorateParam(1, IStorageService)
], ExtensionStorageCleaner);
let TrustedPublishersInitializer = class {
  constructor(extensionManagementService, userDataProfilesService, productService, storageService) {
    const trustedPublishersInitStatusKey = "trusted-publishers-init-migration";
    if (!storageService.get(trustedPublishersInitStatusKey, StorageScope.APPLICATION)) {
      for (const profile of userDataProfilesService.profiles) {
        extensionManagementService.getInstalled(ExtensionType.User, profile.extensionsResource).then(async (extensions) => {
          const trustedPublishers = /* @__PURE__ */ new Map();
          for (const extension of extensions) {
            if (!extension.publisherDisplayName) {
              continue;
            }
            const publisher = extension.manifest.publisher.toLowerCase();
            if (productService.trustedExtensionPublishers?.includes(publisher) || extension.publisherDisplayName && productService.trustedExtensionPublishers?.includes(extension.publisherDisplayName.toLowerCase())) {
              continue;
            }
            trustedPublishers.set(publisher, { publisher, publisherDisplayName: extension.publisherDisplayName });
          }
          if (trustedPublishers.size) {
            extensionManagementService.trustPublishers(...trustedPublishers.values());
          }
          storageService.store(trustedPublishersInitStatusKey, "true", StorageScope.APPLICATION, StorageTarget.MACHINE);
        });
      }
    }
  }
};
TrustedPublishersInitializer = __decorateClass([
  __decorateParam(0, IWorkbenchExtensionManagementService),
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IProductService),
  __decorateParam(3, IStorageService)
], TrustedPublishersInitializer);
let ExtensionToolsContribution = class extends Disposable {
  constructor(toolsService, instantiationService) {
    super();
    const searchExtensionsTool = instantiationService.createInstance(SearchExtensionsTool);
    this._register(toolsService.registerTool(SearchExtensionsToolData, searchExtensionsTool));
    this._register(toolsService.vscodeToolSet.addTool(SearchExtensionsToolData));
  }
};
ExtensionToolsContribution.ID = "extensions.chat.toolsContribution";
ExtensionToolsContribution = __decorateClass([
  __decorateParam(0, ILanguageModelToolsService),
  __decorateParam(1, IInstantiationService)
], ExtensionToolsContribution);
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(ExtensionsContributions, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(StatusUpdater, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(MaliciousExtensionChecker, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(KeymapExtensions, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(ExtensionsViewletViewsContribution, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(ExtensionActivationProgress, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(ExtensionDependencyChecker, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(ExtensionEnablementWorkspaceTrustTransitionParticipant, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(ExtensionsCompletionItemsProvider, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(ExtensionEnablementContextKeysContribution, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(UnsupportedExtensionsMigrationContrib, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(TrustedPublishersInitializer, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(ExtensionMarketplaceStatusUpdater, LifecyclePhase.Eventually);
if (isWeb) {
  workbenchRegistry.registerWorkbenchContribution(ExtensionStorageCleaner, LifecyclePhase.Eventually);
}
registerWorkbenchContribution2(ExtensionToolsContribution.ID, ExtensionToolsContribution, WorkbenchPhase.AfterRestored);
registerAction2(class ExtensionsGallerySignInAction extends Action2 {
  constructor() {
    super({
      id: "workbench.extensions.actions.gallery.signIn",
      title: localize2("signInToMarketplace", "Sign in to access Extensions Marketplace"),
      menu: {
        id: MenuId.AccountsContext,
        when: CONTEXT_EXTENSIONS_GALLERY_STATUS.isEqualTo(ExtensionGalleryManifestStatus.RequiresSignIn)
      }
    });
  }
  run(accessor) {
    return accessor.get(ICommandService).executeCommand(DEFAULT_ACCOUNT_SIGN_IN_COMMAND);
  }
});
Registry.as(ConfigurationMigrationExtensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: AutoUpdateConfigurationKey,
  /**
   * Migrates the `extensions.autoUpdate` setting to its new `'on' | 'off'` values.
   *
   * The setting previously supported several values that are now retired:
   * - `true` (All Extensions) and `'onlyEnabledExtensions'` (Only Enabled Extensions)
   *   are folded into the new `'on'` value, along with the insiders-only `'delayed'` value.
   * - `false` (None) and the internal `'onlySelectedExtensions'` value map to `'off'`.
   *   In `'off'` mode, extensions explicitly opted in per-extension are still auto-updated,
   *   which preserves the `'onlySelectedExtensions'` behavior.
   *
   * Returning `[]` is a no-op, used when the value is already in the new format
   * (`'on'`/`'off'`) or unset.
   */
  migrateFn: (value, accessor) => {
    if (value === void 0 || value === "on" || value === "off") {
      return [];
    }
    if (value === false || value === "onlySelectedExtensions") {
      return { value: "off" };
    }
    return { value: "on" };
  }
}]);
export {
  CONTEXT_HAS_LOCAL_SERVER,
  CONTEXT_HAS_REMOTE_SERVER,
  CONTEXT_HAS_WEB_SERVER,
  VIEW_CONTAINER
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXGJyb3dzZXJcXGV4dGVuc2lvbnMuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBtbmVtb25pY0J1dHRvbkxhYmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGFiZWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIGlzRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBpc05hdGl2ZSwgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBQb2xpY3lDYXRlZ29yeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BvbGljeS5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgTXVsdGlDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDb3B5QWN0aW9uLCBDdXRBY3Rpb24sIFBhc3RlQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY2xpcGJvYXJkL2Jyb3dzZXIvY2xpcGJvYXJkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBJQWN0aW9uMk9wdGlvbnMsIElNZW51SXRlbSwgTWVudUlkLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSwgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMsIENvbmZpZ3VyYXRpb25TY29wZSwgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSwgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTdGF0dXMsIEV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZVR5cGUsIEV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlVXJsQ29uZmlnS2V5LCBnZXRFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RSZXNvdXJjZVVyaSwgSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QuanMnO1xuaW1wb3J0IHsgRVhURU5TSU9OX0lOU1RBTExfU09VUkNFX0NPTlRFWFQsIEV4dGVuc2lvbkluc3RhbGxTb3VyY2UsIEV4dGVuc2lvblJlcXVlc3RzVGltZW91dENvbmZpZ0tleSwgRXh0ZW5zaW9uc0xvY2FsaXplZExhYmVsLCBGaWx0ZXJUeXBlLCBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgUHJlZmVyZW5jZXNMb2NhbGl6ZWRMYWJlbCwgU29ydEJ5LCBWZXJpZnlFeHRlbnNpb25TaWduYXR1cmVDb25maWdLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IGFyZVNhbWVFeHRlbnNpb25zLCBnZXRJZEFuZFZlcnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25TdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvblN0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblJlY29tbWVuZGF0aW9uTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy9jb21tb24vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLmpzJztcbmltcG9ydCB7IEVYVEVOU0lPTl9DQVRFR09SSUVTLCBFeHRlbnNpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgKiBhcyBqc29uQ29udHJpYnV0aW9uUmVnaXN0cnkgZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vanNvbnNjaGVtYXMvY29tbW9uL2pzb25Db250cmlidXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSVF1aWNrQWNjZXNzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmVEZXNjcmlwdG9yLCBJRWRpdG9yUGFuZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uTWlncmF0aW9uRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25NaWdyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LCBSZXNvdXJjZUNvbnRleHRLZXksIFdvcmtiZW5jaFN0YXRlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIsIEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucywgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJVmlld0NvbnRhaW5lcnNSZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBWaWV3Q29udGFpbmVyRXh0ZW5zaW9ucywgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IERFRkFVTFRfQUNDT1VOVF9TSUdOX0lOX0NPTU1BTkQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hY2NvdW50cy9icm93c2VyL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVuYWJsZW1lbnRTdGF0ZSwgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLCBJUHVibGlzaGVySW5mbywgSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZSwgSUV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMvY29tbW9uL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMvY29tbW9uL3dvcmtzcGFjZUV4dGVuc2lvbnNDb25maWcuanMnO1xuaW1wb3J0IHsgRVhURU5TSU9OU19TVVBQT1JUX0FHRU5UU19XSU5ET1cgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBDT05URVhUX1NZTkNfRU5BQkxFTUVOVCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFdPUktTUEFDRV9UUlVTVF9FWFRFTlNJT05fU1VQUE9SVCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IElQbHVnaW5JbnN0YWxsU2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL3BsdWdpbnMvcGx1Z2luSW5zdGFsbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENPTlRFWFRfS0VZQklORElOR1NfRURJVE9SIH0gZnJvbSAnLi4vLi4vcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IElXZWJ2aWV3IH0gZnJvbSAnLi4vLi4vd2Vidmlldy9icm93c2VyL3dlYnZpZXcuanMnO1xuaW1wb3J0IHsgUXVlcnkgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uUXVlcnkuanMnO1xuaW1wb3J0IHsgQXV0b1Jlc3RhcnRDb25maWd1cmF0aW9uS2V5LCBBdXRvVXBkYXRlQ29uZmlndXJhdGlvbktleSwgQ09OVEVYVF9FWFRFTlNJT05TX0dBTExFUllfU1RBVFVTLCBDT05URVhUX0hBU19HQUxMRVJZLCBEZWZhdWx0Vmlld3NDb250ZXh0LCBFeHRlbnNpb25FZGl0b3JUYWIsIEV4dGVuc2lvblJ1bnRpbWVBY3Rpb25UeXBlLCBFWFRFTlNJT05TX0NBVEVHT1JZLCBleHRlbnNpb25zRmlsdGVyU3ViTWVudSwgZXh0ZW5zaW9uc1NlYXJjaEFjdGlvbnNNZW51LCBIYXNPdXRkYXRlZEV4dGVuc2lvbnNDb250ZXh0LCBJRXh0ZW5zaW9uQXJnLCBJRXh0ZW5zaW9uc1ZpZXdQYW5lQ29udGFpbmVyLCBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsIElOU1RBTExfQUNUSU9OU19HUk9VUCwgSU5TVEFMTF9FWFRFTlNJT05fRlJPTV9WU0lYX0NPTU1BTkRfSUQsIElXb3Jrc3BhY2VSZWNvbW1lbmRlZEV4dGVuc2lvbnNWaWV3LCBMSVNUX1dPUktTUEFDRV9VTlNVUFBPUlRFRF9FWFRFTlNJT05TX0NPTU1BTkRfSUQsIE9VVERBVEVEX0VYVEVOU0lPTlNfVklFV19JRCwgU0VMRUNUX0lOU1RBTExfVlNJWF9FWFRFTlNJT05fQ09NTUFORF9JRCwgVEhFTUVfQUNUSU9OU19HUk9VUCwgVE9HR0xFX0lHTk9SRV9FWFRFTlNJT05fQUNUSU9OX0lELCBVUERBVEVfQUNUSU9OU19HUk9VUCwgVklFV0xFVF9JRCwgV09SS1NQQUNFX1JFQ09NTUVOREFUSU9OU19WSUVXX0lEIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc0NvbmZpZ3VyYXRpb25TY2hlbWEsIEV4dGVuc2lvbnNDb25maWd1cmF0aW9uU2NoZW1hSWQgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uc0ZpbGVUZW1wbGF0ZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zSW5wdXQgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uc0lucHV0LmpzJztcbmltcG9ydCB7IEtleW1hcEV4dGVuc2lvbnMgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uc1V0aWxzLmpzJztcbmltcG9ydCB7IFNlYXJjaEV4dGVuc2lvbnNUb29sLCBTZWFyY2hFeHRlbnNpb25zVG9vbERhdGEgfSBmcm9tICcuLi9jb21tb24vc2VhcmNoRXh0ZW5zaW9uc1Rvb2wuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uRWRpdG9yIH0gZnJvbSAnLi9leHRlbnNpb25FZGl0b3IuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uRW5hYmxlbWVudFdvcmtzcGFjZVRydXN0VHJhbnNpdGlvblBhcnRpY2lwYW50IH0gZnJvbSAnLi9leHRlbnNpb25FbmFibGVtZW50V29ya3NwYWNlVHJ1c3RUcmFuc2l0aW9uUGFydGljaXBhbnQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi9leHRlbnNpb25SZWNvbW1lbmRhdGlvbk5vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZSB9IGZyb20gJy4vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDbGVhckxhbmd1YWdlQWN0aW9uLCBDb25maWd1cmVXb3Jrc3BhY2VGb2xkZXJSZWNvbW1lbmRlZEV4dGVuc2lvbnNBY3Rpb24sIENvbmZpZ3VyZVdvcmtzcGFjZVJlY29tbWVuZGVkRXh0ZW5zaW9uc0FjdGlvbiwgSW5zdGFsbEFjdGlvbiwgSW5zdGFsbEFub3RoZXJWZXJzaW9uQWN0aW9uLCBJbnN0YWxsU3BlY2lmaWNWZXJzaW9uT2ZFeHRlbnNpb25BY3Rpb24sIFNldENvbG9yVGhlbWVBY3Rpb24sIFNldEZpbGVJY29uVGhlbWVBY3Rpb24sIFNldFByb2R1Y3RJY29uVGhlbWVBY3Rpb24sIFRvZ2dsZUF1dG9VcGRhdGVGb3JFeHRlbnNpb25BY3Rpb24sIFRvZ2dsZUF1dG9VcGRhdGVzRm9yUHVibGlzaGVyQWN0aW9uLCBUb2dnbGVQcmVSZWxlYXNlRXh0ZW5zaW9uQWN0aW9uIH0gZnJvbSAnLi9leHRlbnNpb25zQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25BY3RpdmF0aW9uUHJvZ3Jlc3MgfSBmcm9tICcuL2V4dGVuc2lvbnNBY3RpdmF0aW9uUHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc0NvbXBsZXRpb25JdGVtc1Byb3ZpZGVyIH0gZnJvbSAnLi9leHRlbnNpb25zQ29tcGxldGlvbkl0ZW1zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uRW5hYmxlbWVudENvbnRleHRLZXlzQ29udHJpYnV0aW9uIH0gZnJvbSAnLi9leHRlbnNpb25FbmFibGVtZW50Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25EZXBlbmRlbmN5Q2hlY2tlciB9IGZyb20gJy4vZXh0ZW5zaW9uc0RlcGVuZGVuY3lDaGVja2VyLmpzJztcbmltcG9ydCB7IGNsZWFyU2VhcmNoUmVzdWx0c0ljb24sIGNvbmZpZ3VyZVJlY29tbWVuZGVkSWNvbiwgZXh0ZW5zaW9uc1ZpZXdJY29uLCBmaWx0ZXJJY29uLCBpbnN0YWxsV29ya3NwYWNlUmVjb21tZW5kZWRJY29uLCByZWZyZXNoSWNvbiB9IGZyb20gJy4vZXh0ZW5zaW9uc0ljb25zLmpzJztcbmltcG9ydCB7IEluc3RhbGxFeHRlbnNpb25RdWlja0FjY2Vzc1Byb3ZpZGVyLCBNYW5hZ2VFeHRlbnNpb25zUXVpY2tBY2Nlc3NQcm92aWRlciB9IGZyb20gJy4vZXh0ZW5zaW9uc1F1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IEJ1aWx0SW5FeHRlbnNpb25zQ29udGV4dCwgRXh0ZW5zaW9uTWFya2V0cGxhY2VTdGF0dXNVcGRhdGVyLCBFeHRlbnNpb25zU2VhcmNoVmFsdWVDb250ZXh0LCBFeHRlbnNpb25zU29ydEJ5Q29udGV4dCwgRXh0ZW5zaW9uc1ZpZXdsZXRWaWV3c0NvbnRyaWJ1dGlvbiwgRXh0ZW5zaW9uc1ZpZXdQYW5lQ29udGFpbmVyLCBNYWxpY2lvdXNFeHRlbnNpb25DaGVja2VyLCBSZWNvbW1lbmRlZEV4dGVuc2lvbnNDb250ZXh0LCBTZWFyY2hIYXNUZXh0Q29udGV4dCwgU2VhcmNoTWFya2V0cGxhY2VFeHRlbnNpb25zQ29udGV4dCwgU3RhdHVzVXBkYXRlciB9IGZyb20gJy4vZXh0ZW5zaW9uc1ZpZXdsZXQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuL2V4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmpzJztcbmltcG9ydCAnLi9tZWRpYS9leHRlbnNpb25NYW5hZ2VtZW50LmNzcyc7XG5pbXBvcnQgeyBVbnN1cHBvcnRlZEV4dGVuc2lvbnNNaWdyYXRpb25Db250cmliIH0gZnJvbSAnLi91bnN1cHBvcnRlZEV4dGVuc2lvbnNNaWdyYXRpb25Db250cmlidXRpb24uanMnO1xuXG4vLyBTaW5nbGV0b25zXG5yZWdpc3RlclNpbmdsZXRvbihJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsIEV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlciAvKiBBdXRvIHVwZGF0ZXMgZXh0ZW5zaW9ucyAqLyk7XG5yZWdpc3RlclNpbmdsZXRvbihJRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlLCBFeHRlbnNpb25SZWNvbW1lbmRhdGlvbk5vdGlmaWNhdGlvblNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UsIEV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyIC8qIFByb21wdHMgcmVjb21tZW5kYXRpb25zIGluIHRoZSBiYWNrZ3JvdW5kICovKTtcblxuLy8gUXVpY2sgQWNjZXNzXG5SZWdpc3RyeS5hczxJUXVpY2tBY2Nlc3NSZWdpc3RyeT4oRXh0ZW5zaW9ucy5RdWlja2FjY2VzcykucmVnaXN0ZXJRdWlja0FjY2Vzc1Byb3ZpZGVyKHtcblx0Y3RvcjogTWFuYWdlRXh0ZW5zaW9uc1F1aWNrQWNjZXNzUHJvdmlkZXIsXG5cdHByZWZpeDogTWFuYWdlRXh0ZW5zaW9uc1F1aWNrQWNjZXNzUHJvdmlkZXIuUFJFRklYLFxuXHRwbGFjZWhvbGRlcjogbG9jYWxpemUoJ21hbmFnZUV4dGVuc2lvbnNRdWlja0FjY2Vzc1BsYWNlaG9sZGVyJywgXCJQcmVzcyBFbnRlciB0byBtYW5hZ2UgZXh0ZW5zaW9ucy5cIiksXG5cdGhlbHBFbnRyaWVzOiBbeyBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21hbmFnZUV4dGVuc2lvbnNIZWxwJywgXCJNYW5hZ2UgRXh0ZW5zaW9uc1wiKSB9XVxufSk7XG5cbi8vIEVkaXRvclxuUmVnaXN0cnkuYXM8SUVkaXRvclBhbmVSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JQYW5lKS5yZWdpc3RlckVkaXRvclBhbmUoXG5cdEVkaXRvclBhbmVEZXNjcmlwdG9yLmNyZWF0ZShcblx0XHRFeHRlbnNpb25FZGl0b3IsXG5cdFx0RXh0ZW5zaW9uRWRpdG9yLklELFxuXHRcdGxvY2FsaXplKCdleHRlbnNpb24nLCBcIkV4dGVuc2lvblwiKVxuXHQpLFxuXHRbXG5cdFx0bmV3IFN5bmNEZXNjcmlwdG9yKEV4dGVuc2lvbnNJbnB1dClcblx0XSk7XG5cbmV4cG9ydCBjb25zdCBWSUVXX0NPTlRBSU5FUiA9IFJlZ2lzdHJ5LmFzPElWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5PihWaWV3Q29udGFpbmVyRXh0ZW5zaW9ucy5WaWV3Q29udGFpbmVyc1JlZ2lzdHJ5KS5yZWdpc3RlclZpZXdDb250YWluZXIoXG5cdHtcblx0XHRpZDogVklFV0xFVF9JRCxcblx0XHR0aXRsZTogbG9jYWxpemUyKCdleHRlbnNpb25zJywgXCJFeHRlbnNpb25zXCIpLFxuXHRcdG9wZW5Db21tYW5kQWN0aW9uRGVzY3JpcHRvcjoge1xuXHRcdFx0aWQ6IFZJRVdMRVRfSUQsXG5cdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pVmlld0V4dGVuc2lvbnMnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiRSYmeHRlbnNpb25zXCIpLFxuXHRcdFx0a2V5YmluZGluZ3M6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleVggfSxcblx0XHRcdG9yZGVyOiA0LFxuXHRcdH0sXG5cdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihFeHRlbnNpb25zVmlld1BhbmVDb250YWluZXIpLFxuXHRcdGljb246IGV4dGVuc2lvbnNWaWV3SWNvbixcblx0XHRvcmRlcjogNCxcblx0XHRyZWplY3RBZGRlZFZpZXdzOiB0cnVlLFxuXHRcdGFsd2F5c1VzZUNvbnRhaW5lckluZm86IHRydWUsXG5cdH0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblxuUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbilcblx0LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0aWQ6ICdleHRlbnNpb25zJyxcblx0XHRvcmRlcjogMzAsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdleHRlbnNpb25zQ29uZmlndXJhdGlvblRpdGxlJywgXCJFeHRlbnNpb25zXCIpLFxuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdCdleHRlbnNpb25zLmF1dG9VcGRhdGUnOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRlbnVtOiBbJ29uJywgJ29mZiddLFxuXHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2V4dGVuc2lvbnMuYXV0b1VwZGF0ZS5vbicsICdEb3dubG9hZCBhbmQgaW5zdGFsbCB1cGRhdGVzIGF1dG9tYXRpY2FsbHkgb25seSBmb3IgZW5hYmxlZCBleHRlbnNpb25zLicpLFxuXHRcdFx0XHRcdGxvY2FsaXplKCdleHRlbnNpb25zLmF1dG9VcGRhdGUub2ZmJywgJ0V4dGVuc2lvbnMgYXJlIG5vdCBhdXRvbWF0aWNhbGx5IHVwZGF0ZWQuJyksXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5hdXRvVXBkYXRlJywgXCJDb250cm9scyB0aGUgYXV0b21hdGljIHVwZGF0ZSBiZWhhdmlvciBvZiBleHRlbnNpb25zLiBUaGUgdXBkYXRlcyBhcmUgZmV0Y2hlZCBmcm9tIGEgTWljcm9zb2Z0IG9ubGluZSBzZXJ2aWNlLlwiKSxcblx0XHRcdFx0ZGVmYXVsdDogJ29uJyxcblx0XHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdFx0dGFnczogWyd1c2VzT25saW5lU2VydmljZXMnXSxcblx0XHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdFx0bmFtZTogJ0V4dGVuc2lvbnNBdXRvVXBkYXRlJyxcblx0XHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuRXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTI1Jyxcblx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdGtleTogJ2V4dGVuc2lvbnMuYXV0b1VwZGF0ZScsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5hdXRvVXBkYXRlJywgXCJDb250cm9scyB0aGUgYXV0b21hdGljIHVwZGF0ZSBiZWhhdmlvciBvZiBleHRlbnNpb25zLiBUaGUgdXBkYXRlcyBhcmUgZmV0Y2hlZCBmcm9tIGEgTWljcm9zb2Z0IG9ubGluZSBzZXJ2aWNlLlwiKSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRrZXk6ICdleHRlbnNpb25zLmF1dG9VcGRhdGUub24nLFxuXHRcdFx0XHRcdFx0XHRcdHZhbHVlOiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5hdXRvVXBkYXRlLm9uJywgJ0Rvd25sb2FkIGFuZCBpbnN0YWxsIHVwZGF0ZXMgYXV0b21hdGljYWxseSBvbmx5IGZvciBlbmFibGVkIGV4dGVuc2lvbnMuJyksXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRrZXk6ICdleHRlbnNpb25zLmF1dG9VcGRhdGUub2ZmJyxcblx0XHRcdFx0XHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoJ2V4dGVuc2lvbnMuYXV0b1VwZGF0ZS5vZmYnLCAnRXh0ZW5zaW9ucyBhcmUgbm90IGF1dG9tYXRpY2FsbHkgdXBkYXRlZC4nKSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQnZXh0ZW5zaW9ucy5hdXRvVXBkYXRlRGVsYXknOiB7XG5cdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRkZWZhdWx0OiAyLFxuXHRcdFx0XHRtaW5pbXVtOiAwLFxuXHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5hdXRvVXBkYXRlRGVsYXknLCBcIkNvbnRyb2xzIHRoZSBkZWxheSBpbiBob3VycyBhZnRlciBhbiBleHRlbnNpb24gdXBkYXRlIGlzIHB1Ymxpc2hlZCBiZWZvcmUgaXQgaXMgYXV0b21hdGljYWxseSBpbnN0YWxsZWQuIE9ubHkgYXBwbGllcyB3aGVuIGAjZXh0ZW5zaW9ucy5hdXRvVXBkYXRlI2AgaXMgc2V0IHRvIGBvbmAuIFRoaXMgZGVsYXkgaGVscHMgYXZvaWQgaW5zdGFsbGluZyBwb3RlbnRpYWxseSBwcm9ibGVtYXRpYyB1cGRhdGVzIGltbWVkaWF0ZWx5IGFmdGVyIHJlbGVhc2UuXCIpLFxuXHRcdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRuYW1lOiAnRXh0ZW5zaW9uc0F1dG9VcGRhdGVEZWxheScsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjEyNScsXG5cdFx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRrZXk6ICdleHRlbnNpb25zLmF1dG9VcGRhdGVEZWxheScsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5hdXRvVXBkYXRlRGVsYXknLCBcIkNvbnRyb2xzIHRoZSBkZWxheSBpbiBob3VycyBhZnRlciBhbiBleHRlbnNpb24gdXBkYXRlIGlzIHB1Ymxpc2hlZCBiZWZvcmUgaXQgaXMgYXV0b21hdGljYWxseSBpbnN0YWxsZWQuIE9ubHkgYXBwbGllcyB3aGVuIGAjZXh0ZW5zaW9ucy5hdXRvVXBkYXRlI2AgaXMgc2V0IHRvIGBvbmAuIFRoaXMgZGVsYXkgaGVscHMgYXZvaWQgaW5zdGFsbGluZyBwb3RlbnRpYWxseSBwcm9ibGVtYXRpYyB1cGRhdGVzIGltbWVkaWF0ZWx5IGFmdGVyIHJlbGVhc2UuXCIpLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCdleHRlbnNpb25zLmF1dG9DaGVja1VwZGF0ZXMnOiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdleHRlbnNpb25zQ2hlY2tVcGRhdGVzJywgXCJXaGVuIGVuYWJsZWQsIGF1dG9tYXRpY2FsbHkgY2hlY2tzIGV4dGVuc2lvbnMgZm9yIHVwZGF0ZXMuIElmIGFuIGV4dGVuc2lvbiBoYXMgYW4gdXBkYXRlLCBpdCBpcyBtYXJrZWQgYXMgb3V0ZGF0ZWQgaW4gdGhlIEV4dGVuc2lvbnMgdmlldy4gVGhlIHVwZGF0ZXMgYXJlIGZldGNoZWQgZnJvbSBhIE1pY3Jvc29mdCBvbmxpbmUgc2VydmljZS5cIiksXG5cdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRcdHRhZ3M6IFsndXNlc09ubGluZVNlcnZpY2VzJ11cblx0XHRcdH0sXG5cdFx0XHQnZXh0ZW5zaW9ucy5pZ25vcmVSZWNvbW1lbmRhdGlvbnMnOiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdleHRlbnNpb25zSWdub3JlUmVjb21tZW5kYXRpb25zJywgXCJXaGVuIGVuYWJsZWQsIHRoZSBub3RpZmljYXRpb25zIGZvciBleHRlbnNpb24gcmVjb21tZW5kYXRpb25zIHdpbGwgbm90IGJlIHNob3duLlwiKSxcblx0XHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRcdGFnZW50c1dpbmRvdzogeyBkZWZhdWx0OiB0cnVlLCByZWFkT25seTogdHJ1ZSB9LFxuXHRcdFx0fSxcblx0XHRcdCdleHRlbnNpb25zLnNob3dSZWNvbW1lbmRhdGlvbnNPbmx5T25EZW1hbmQnOiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0ZGVwcmVjYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uc1Nob3dSZWNvbW1lbmRhdGlvbnNPbmx5T25EZW1hbmRfRGVwcmVjYXRlZCcsIFwiVGhpcyBzZXR0aW5nIGlzIGRlcHJlY2F0ZWQuIFVzZSBleHRlbnNpb25zLmlnbm9yZVJlY29tbWVuZGF0aW9ucyBzZXR0aW5nIHRvIGNvbnRyb2wgcmVjb21tZW5kYXRpb24gbm90aWZpY2F0aW9ucy4gVXNlIEV4dGVuc2lvbnMgdmlldydzIHZpc2liaWxpdHkgYWN0aW9ucyB0byBoaWRlIFJlY29tbWVuZGVkIHZpZXcgYnkgZGVmYXVsdC5cIiksXG5cdFx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0XHR0YWdzOiBbJ3VzZXNPbmxpbmVTZXJ2aWNlcyddXG5cdFx0XHR9LFxuXHRcdFx0J2V4dGVuc2lvbnMuY2xvc2VFeHRlbnNpb25EZXRhaWxzT25WaWV3Q2hhbmdlJzoge1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uc0Nsb3NlRXh0ZW5zaW9uRGV0YWlsc09uVmlld0NoYW5nZScsIFwiV2hlbiBlbmFibGVkLCBlZGl0b3JzIHdpdGggZXh0ZW5zaW9uIGRldGFpbHMgd2lsbCBiZSBhdXRvbWF0aWNhbGx5IGNsb3NlZCB1cG9uIG5hdmlnYXRpbmcgYXdheSBmcm9tIHRoZSBFeHRlbnNpb25zIFZpZXcuXCIpLFxuXHRcdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdFx0fSxcblx0XHRcdCdleHRlbnNpb25zLmNvbmZpcm1lZFVyaUhhbmRsZXJFeHRlbnNpb25JZHMnOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdoYW5kbGVVcmlDb25maXJtZWRFeHRlbnNpb25zJywgXCJXaGVuIGFuIGV4dGVuc2lvbiBpcyBsaXN0ZWQgaGVyZSwgYSBjb25maXJtYXRpb24gcHJvbXB0IHdpbGwgbm90IGJlIHNob3duIHdoZW4gdGhhdCBleHRlbnNpb24gaGFuZGxlcyBhIFVSSS5cIiksXG5cdFx0XHRcdGRlZmF1bHQ6IFtdLFxuXHRcdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OXG5cdFx0XHR9LFxuXHRcdFx0J2V4dGVuc2lvbnMud2ViV29ya2VyJzoge1xuXHRcdFx0XHR0eXBlOiBbJ2Jvb2xlYW4nLCAnc3RyaW5nJ10sXG5cdFx0XHRcdGVudW06IFt0cnVlLCBmYWxzZSwgJ2F1dG8nXSxcblx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdGxvY2FsaXplKCdleHRlbnNpb25zV2ViV29ya2VyLnRydWUnLCBcIlRoZSBXZWIgV29ya2VyIEV4dGVuc2lvbiBIb3N0IHdpbGwgYWx3YXlzIGJlIGxhdW5jaGVkLlwiKSxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnZXh0ZW5zaW9uc1dlYldvcmtlci5mYWxzZScsIFwiVGhlIFdlYiBXb3JrZXIgRXh0ZW5zaW9uIEhvc3Qgd2lsbCBuZXZlciBiZSBsYXVuY2hlZC5cIiksXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2V4dGVuc2lvbnNXZWJXb3JrZXIuYXV0bycsIFwiVGhlIFdlYiBXb3JrZXIgRXh0ZW5zaW9uIEhvc3Qgd2lsbCBiZSBsYXVuY2hlZCB3aGVuIGEgd2ViIGV4dGVuc2lvbiBuZWVkcyBpdC5cIiksXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uc1dlYldvcmtlcicsIFwiRW5hYmxlIHdlYiB3b3JrZXIgZXh0ZW5zaW9uIGhvc3QuXCIpLFxuXHRcdFx0XHRkZWZhdWx0OiAnYXV0bydcblx0XHRcdH0sXG5cdFx0XHQnZXh0ZW5zaW9ucy5zdXBwb3J0VmlydHVhbFdvcmtzcGFjZXMnOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5zdXBwb3J0VmlydHVhbFdvcmtzcGFjZXMnLCBcIk92ZXJyaWRlIHRoZSB2aXJ0dWFsIHdvcmtzcGFjZXMgc3VwcG9ydCBvZiBhbiBleHRlbnNpb24uXCIpLFxuXHRcdFx0XHRwYXR0ZXJuUHJvcGVydGllczoge1xuXHRcdFx0XHRcdCcoW2EtejAtOUEtWl1bYS16MC05LUEtWl0qKVxcXFwuKFthLXowLTlBLVpdW2EtejAtOS1BLVpdKikkJzoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0ZGVmYXVsdDoge30sXG5cdFx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3tcblx0XHRcdFx0XHQnYm9keSc6IHtcblx0XHRcdFx0XHRcdCdwdWIubmFtZSc6IGZhbHNlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XVxuXHRcdFx0fSxcblx0XHRcdFtFWFRFTlNJT05TX1NVUFBPUlRfQUdFTlRTX1dJTkRPV106IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdleHRlbnNpb25zLnN1cHBvcnRBZ2VudHNXaW5kb3cnLCBcIk92ZXJyaWRlIHRoZSBBZ2VudHMgd2luZG93IHN1cHBvcnQgb2YgYW4gZXh0ZW5zaW9uLiBFeHRlbnNpb25zIHVzaW5nIGB0cnVlYCB3aWxsIGJlIGVuYWJsZWQgaW4gdGhlIEFnZW50cyB3aW5kb3cgZXZlbiB3aGVuIHRoZXkgd291bGQgb3RoZXJ3aXNlIGJlIGRpc2FibGVkLlwiKSxcblx0XHRcdFx0cGF0dGVyblByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHQnKFthLXowLTlBLVpdW2EtejAtOS1BLVpdKilcXFxcLihbYS16MC05QS1aXVthLXowLTktQS1aXSopJCc6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdGRlZmF1bHQ6IHt9LFxuXHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7XG5cdFx0XHRcdFx0J2JvZHknOiB7XG5cdFx0XHRcdFx0XHQncHViLm5hbWUnOiB0cnVlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XVxuXHRcdFx0fSxcblx0XHRcdCdleHRlbnNpb25zLmV4cGVyaW1lbnRhbC5hZmZpbml0eSc6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdleHRlbnNpb25zLmFmZmluaXR5JywgXCJDb25maWd1cmUgYW4gZXh0ZW5zaW9uIHRvIGV4ZWN1dGUgaW4gYSBkaWZmZXJlbnQgZXh0ZW5zaW9uIGhvc3QgcHJvY2Vzcy5cIiksXG5cdFx0XHRcdHBhdHRlcm5Qcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0JyhbYS16MC05QS1aXVthLXowLTktQS1aXSopXFxcXC4oW2EtejAtOUEtWl1bYS16MC05LUEtWl0qKSQnOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnaW50ZWdlcicsXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiAxXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdGRlZmF1bHQ6IHt9LFxuXHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7XG5cdFx0XHRcdFx0J2JvZHknOiB7XG5cdFx0XHRcdFx0XHQncHViLm5hbWUnOiAxXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XVxuXHRcdFx0fSxcblx0XHRcdFtXT1JLU1BBQ0VfVFJVU1RfRVhURU5TSU9OX1NVUFBPUlRdOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5zdXBwb3J0VW50cnVzdGVkV29ya3NwYWNlcycsIFwiT3ZlcnJpZGUgdGhlIHVudHJ1c3RlZCB3b3Jrc3BhY2Ugc3VwcG9ydCBvZiBhbiBleHRlbnNpb24uIEV4dGVuc2lvbnMgdXNpbmcgYHRydWVgIHdpbGwgYWx3YXlzIGJlIGVuYWJsZWQuIEV4dGVuc2lvbnMgdXNpbmcgYGxpbWl0ZWRgIHdpbGwgYWx3YXlzIGJlIGVuYWJsZWQsIGFuZCB0aGUgZXh0ZW5zaW9uIHdpbGwgaGlkZSBmdW5jdGlvbmFsaXR5IHRoYXQgcmVxdWlyZXMgdHJ1c3QuIEV4dGVuc2lvbnMgdXNpbmcgYGZhbHNlYCB3aWxsIG9ubHkgYmUgZW5hYmxlZCBvbmx5IHdoZW4gdGhlIHdvcmtzcGFjZSBpcyB0cnVzdGVkLlwiKSxcblx0XHRcdFx0cGF0dGVyblByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHQnKFthLXowLTlBLVpdW2EtejAtOS1BLVpdKilcXFxcLihbYS16MC05QS1aXVthLXowLTktQS1aXSopJCc6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHQnc3VwcG9ydGVkJzoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6IFsnYm9vbGVhbicsICdzdHJpbmcnXSxcblx0XHRcdFx0XHRcdFx0XHRlbnVtOiBbdHJ1ZSwgZmFsc2UsICdsaW1pdGVkJ10sXG5cdFx0XHRcdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ2V4dGVuc2lvbnMuc3VwcG9ydFVudHJ1c3RlZFdvcmtzcGFjZXMudHJ1ZScsIFwiRXh0ZW5zaW9uIHdpbGwgYWx3YXlzIGJlIGVuYWJsZWQuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ2V4dGVuc2lvbnMuc3VwcG9ydFVudHJ1c3RlZFdvcmtzcGFjZXMuZmFsc2UnLCBcIkV4dGVuc2lvbiB3aWxsIG9ubHkgYmUgZW5hYmxlZCBvbmx5IHdoZW4gdGhlIHdvcmtzcGFjZSBpcyB0cnVzdGVkLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdleHRlbnNpb25zLnN1cHBvcnRVbnRydXN0ZWRXb3Jrc3BhY2VzLmxpbWl0ZWQnLCBcIkV4dGVuc2lvbiB3aWxsIGFsd2F5cyBiZSBlbmFibGVkLCBhbmQgdGhlIGV4dGVuc2lvbiB3aWxsIGhpZGUgZnVuY3Rpb25hbGl0eSByZXF1aXJpbmcgdHJ1c3QuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdleHRlbnNpb25zLnN1cHBvcnRVbnRydXN0ZWRXb3Jrc3BhY2VzLnN1cHBvcnRlZCcsIFwiRGVmaW5lcyB0aGUgdW50cnVzdGVkIHdvcmtzcGFjZSBzdXBwb3J0IHNldHRpbmcgZm9yIHRoZSBleHRlbnNpb24uXCIpLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHQndmVyc2lvbic6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2V4dGVuc2lvbnMuc3VwcG9ydFVudHJ1c3RlZFdvcmtzcGFjZXMudmVyc2lvbicsIFwiRGVmaW5lcyB0aGUgdmVyc2lvbiBvZiB0aGUgZXh0ZW5zaW9uIGZvciB3aGljaCB0aGUgb3ZlcnJpZGUgc2hvdWxkIGJlIGFwcGxpZWQuIElmIG5vdCBzcGVjaWZpZWQsIHRoZSBvdmVycmlkZSB3aWxsIGJlIGFwcGxpZWQgaW5kZXBlbmRlbnQgb2YgdGhlIGV4dGVuc2lvbiB2ZXJzaW9uLlwiKSxcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCdleHRlbnNpb25zLmV4cGVyaW1lbnRhbC5kZWZlcnJlZFN0YXJ0dXBGaW5pc2hlZEFjdGl2YXRpb24nOiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdleHRlbnNpb25zRGVmZXJyZWRTdGFydHVwRmluaXNoZWRBY3RpdmF0aW9uJywgXCJXaGVuIGVuYWJsZWQsIGV4dGVuc2lvbnMgd2hpY2ggZGVjbGFyZSB0aGUgYG9uU3RhcnR1cEZpbmlzaGVkYCBhY3RpdmF0aW9uIGV2ZW50IHdpbGwgYmUgYWN0aXZhdGVkIGFmdGVyIGEgdGltZW91dC5cIiksXG5cdFx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0XHR9LFxuXHRcdFx0J2V4dGVuc2lvbnMuZXhwZXJpbWVudGFsLmlzc3VlUXVpY2tBY2Nlc3MnOiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdleHRlbnNpb25zSW5RdWlja0FjY2VzcycsIFwiV2hlbiBlbmFibGVkLCBleHRlbnNpb25zIGNhbiBiZSBzZWFyY2hlZCBmb3IgdmlhIFF1aWNrIEFjY2VzcyBhbmQgcmVwb3J0IGlzc3VlcyBmcm9tIHRoZXJlLlwiKSxcblx0XHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdCdleHRlbnNpb25zLmFsbG93T3BlbkluTW9kYWxFZGl0b3InOiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdleHRlbnNpb25zLmFsbG93T3BlbkluTW9kYWxFZGl0b3InLCBcIkNvbnRyb2xzIHdoZXRoZXIgZXh0ZW5zaW9ucyBhbmQgTUNQIHNlcnZlcnMgb3BlbiBpbiBhIG1vZGFsIGVkaXRvciBvdmVybGF5LlwiKSxcblx0XHRcdFx0ZGVmYXVsdDogZmFsc2UsIC8vIFRPRE9AYnBhc2VybyBmaWd1cmUgb3V0IHRoZSBkZWZhdWx0IGZvciBzdGFibGUgYW5kIHJldGlyZSB0aGlzIHNldHRpbmdcblx0XHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRcdG1vZGU6ICdhdXRvJ1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0W1ZlcmlmeUV4dGVuc2lvblNpZ25hdHVyZUNvbmZpZ0tleV06IHtcblx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2V4dGVuc2lvbnMudmVyaWZ5U2lnbmF0dXJlJywgXCJXaGVuIGVuYWJsZWQsIGV4dGVuc2lvbnMgYXJlIHZlcmlmaWVkIHRvIGJlIHNpZ25lZCBiZWZvcmUgZ2V0dGluZyBpbnN0YWxsZWQuXCIpLFxuXHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0XHRpbmNsdWRlZDogaXNOYXRpdmVcblx0XHRcdH0sXG5cdFx0XHRbQXV0b1Jlc3RhcnRDb25maWd1cmF0aW9uS2V5XToge1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXV0b1Jlc3RhcnQnLCBcIklmIGFjdGl2YXRlZCwgZXh0ZW5zaW9ucyB3aWxsIGF1dG9tYXRpY2FsbHkgcmVzdGFydCBmb2xsb3dpbmcgYW4gdXBkYXRlIGlmIHRoZSB3aW5kb3cgaXMgbm90IGluIGZvY3VzLiBUaGVyZSBjYW4gYmUgYSBkYXRhIGxvc3MgaWYgeW91IGhhdmUgb3BlbiBOb3RlYm9va3Mgb3IgQ3VzdG9tIEVkaXRvcnMuXCIpLFxuXHRcdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdFx0aW5jbHVkZWQ6IHByb2R1Y3QucXVhbGl0eSAhPT0gJ3N0YWJsZSdcblx0XHRcdH0sXG5cdFx0XHRbRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2VVcmxDb25maWdLZXldOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2V4dGVuc2lvbnMuZ2FsbGVyeS5zZXJ2aWNlVXJsJywgXCJDb25maWd1cmUgdGhlIE1hcmtldHBsYWNlIHNlcnZpY2UgVVJMIHRvIGNvbm5lY3QgdG9cIiksXG5cdFx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0XHR0YWdzOiBbJ3VzZXNPbmxpbmVTZXJ2aWNlcyddLFxuXHRcdFx0XHRpbmNsdWRlZDogZmFsc2UsXG5cdFx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRcdG5hbWU6ICdFeHRlbnNpb25HYWxsZXJ5U2VydmljZVVybCcsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjk5Jyxcblx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdGtleTogJ2V4dGVuc2lvbnMuZ2FsbGVyeS5zZXJ2aWNlVXJsJyxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKCdleHRlbnNpb25zLmdhbGxlcnkuc2VydmljZVVybCcsIFwiQ29uZmlndXJlIHRoZSBNYXJrZXRwbGFjZSBzZXJ2aWNlIFVSTCB0byBjb25uZWN0IHRvXCIpLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHQnZXh0ZW5zaW9ucy5zdXBwb3J0Tm9kZUdsb2JhbE5hdmlnYXRvcic6IHtcblx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2V4dGVuc2lvbnNTdXBwb3J0Tm9kZUdsb2JhbE5hdmlnYXRvcicsIFwiV2hlbiBlbmFibGVkLCBOb2RlLmpzIG5hdmlnYXRvciBvYmplY3QgaXMgZXhwb3NlZCBvbiB0aGUgZ2xvYmFsIHNjb3BlLlwiKSxcblx0XHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdFx0W0V4dGVuc2lvblJlcXVlc3RzVGltZW91dENvbmZpZ0tleV06IHtcblx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uc1JlcXVlc3RUaW1lb3V0JywgXCJDb250cm9scyB0aGUgdGltZW91dCBpbiBtaWxsaXNlY29uZHMgZm9yIEhUVFAgcmVxdWVzdHMgbWFkZSB3aGVuIGZldGNoaW5nIGV4dGVuc2lvbnMgZnJvbSB0aGUgTWFya2V0cGxhY2VcIiksXG5cdFx0XHRcdGRlZmF1bHQ6IDYwXzAwMCxcblx0XHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdFx0dGFnczogWydhZHZhbmNlZCcsICd1c2VzT25saW5lU2VydmljZXMnXVxuXHRcdFx0fSxcblx0XHR9XG5cdH0pO1xuXG5jb25zdCBqc29uUmVnaXN0cnkgPSA8anNvbkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LklKU09OQ29udHJpYnV0aW9uUmVnaXN0cnk+UmVnaXN0cnkuYXMoanNvbkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LkV4dGVuc2lvbnMuSlNPTkNvbnRyaWJ1dGlvbik7XG5qc29uUmVnaXN0cnkucmVnaXN0ZXJTY2hlbWEoRXh0ZW5zaW9uc0NvbmZpZ3VyYXRpb25TY2hlbWFJZCwgRXh0ZW5zaW9uc0NvbmZpZ3VyYXRpb25TY2hlbWEpO1xuXG4vLyBSZWdpc3RlciBDb21tYW5kc1xuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ19leHRlbnNpb25zLm1hbmFnZScsIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZXh0ZW5zaW9uSWQ6IHN0cmluZywgdGFiPzogRXh0ZW5zaW9uRWRpdG9yVGFiLCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbiwgZmVhdHVyZT86IHN0cmluZykgPT4ge1xuXHRjb25zdCBleHRlbnNpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cdGNvbnN0IGV4dGVuc2lvbiA9IGV4dGVuc2lvblNlcnZpY2UubG9jYWwuZmluZChlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgeyBpZDogZXh0ZW5zaW9uSWQgfSkpO1xuXHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0ZXh0ZW5zaW9uU2VydmljZS5vcGVuKGV4dGVuc2lvbiwgeyB0YWIsIHByZXNlcnZlRm9jdXMsIGZlYXR1cmUgfSk7XG5cdH0gZWxzZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdub3RGb3VuZCcsIFwiRXh0ZW5zaW9uICd7MH0nIG5vdCBmb3VuZC5cIiwgZXh0ZW5zaW9uSWQpKTtcblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdleHRlbnNpb24ub3BlbicsIGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZXh0ZW5zaW9uSWQ6IHN0cmluZywgdGFiPzogRXh0ZW5zaW9uRWRpdG9yVGFiLCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbiwgZmVhdHVyZT86IHN0cmluZywgc2lkZUJ5c2lkZT86IGJvb2xlYW4pID0+IHtcblx0Y29uc3QgZXh0ZW5zaW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXG5cdGNvbnN0IFtleHRlbnNpb25dID0gYXdhaXQgZXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb25zKFt7IGlkOiBleHRlbnNpb25JZCB9XSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdGlmIChleHRlbnNpb24pIHtcblx0XHRyZXR1cm4gZXh0ZW5zaW9uU2VydmljZS5vcGVuKGV4dGVuc2lvbiwgeyB0YWIsIHByZXNlcnZlRm9jdXMsIGZlYXR1cmUsIHNpZGVCeXNpZGUgfSk7XG5cdH1cblxuXHRyZXR1cm4gY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ19leHRlbnNpb25zLm1hbmFnZScsIGV4dGVuc2lvbklkLCB0YWIsIHByZXNlcnZlRm9jdXMsIGZlYXR1cmUpO1xufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5pbnN0YWxsRXh0ZW5zaW9uJyxcblx0bWV0YWRhdGE6IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmluc3RhbGxFeHRlbnNpb24uZGVzY3JpcHRpb24nLCBcIkluc3RhbGwgdGhlIGdpdmVuIGV4dGVuc2lvblwiKSxcblx0XHRhcmdzOiBbXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6ICdleHRlbnNpb25JZE9yVlNJWFVyaScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmV4dGVuc2lvbnMuaW5zdGFsbEV4dGVuc2lvbi5hcmcuZGVjcmlwdGlvbicsIFwiRXh0ZW5zaW9uIGlkIG9yIFZTSVggcmVzb3VyY2UgdXJpXCIpLFxuXHRcdFx0XHRjb25zdHJhaW50OiAodmFsdWU6IGFueSkgPT4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyB8fCB2YWx1ZSBpbnN0YW5jZW9mIFVSSSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6ICdvcHRpb25zJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICcob3B0aW9uYWwpIE9wdGlvbnMgZm9yIGluc3RhbGxpbmcgdGhlIGV4dGVuc2lvbi4gT2JqZWN0IHdpdGggdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzOiAnICtcblx0XHRcdFx0XHQnYGluc3RhbGxPbmx5TmV3bHlBZGRlZEZyb21FeHRlbnNpb25QYWNrVlNJWGA6IFdoZW4gZW5hYmxlZCwgVlMgQ29kZSBpbnN0YWxscyBvbmx5IG5ld2x5IGFkZGVkIGV4dGVuc2lvbnMgZnJvbSB0aGUgZXh0ZW5zaW9uIHBhY2sgVlNJWC4gVGhpcyBvcHRpb24gaXMgY29uc2lkZXJlZCBvbmx5IHdoZW4gaW5zdGFsbGluZyBWU0lYLiAnLFxuXHRcdFx0XHRpc09wdGlvbmFsOiB0cnVlLFxuXHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHRcdFx0J2luc3RhbGxPbmx5TmV3bHlBZGRlZEZyb21FeHRlbnNpb25QYWNrVlNJWCc6IHtcblx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5pbnN0YWxsRXh0ZW5zaW9uLm9wdGlvbi5pbnN0YWxsT25seU5ld2x5QWRkZWRGcm9tRXh0ZW5zaW9uUGFja1ZTSVgnLCBcIldoZW4gZW5hYmxlZCwgVlMgQ29kZSBpbnN0YWxscyBvbmx5IG5ld2x5IGFkZGVkIGV4dGVuc2lvbnMgZnJvbSB0aGUgZXh0ZW5zaW9uIHBhY2sgVlNJWC4gVGhpcyBvcHRpb24gaXMgY29uc2lkZXJlZCBvbmx5IHdoaWxlIGluc3RhbGxpbmcgYSBWU0lYLlwiKSxcblx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHQnaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uJzoge1xuXHRcdFx0XHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmluc3RhbGxFeHRlbnNpb24ub3B0aW9uLmluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbicsIFwiV2hlbiBlbmFibGVkLCBWUyBDb2RlIGluc3RhbGxzIHRoZSBwcmUtcmVsZWFzZSB2ZXJzaW9uIG9mIHRoZSBleHRlbnNpb24gaWYgYXZhaWxhYmxlLlwiKSxcblx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHQnZG9ub3RTeW5jJzoge1xuXHRcdFx0XHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmluc3RhbGxFeHRlbnNpb24ub3B0aW9uLmRvbm90U3luYycsIFwiV2hlbiBlbmFibGVkLCBWUyBDb2RlIGRvIG5vdCBzeW5jIHRoaXMgZXh0ZW5zaW9uIHdoZW4gU2V0dGluZ3MgU3luYyBpcyBvbi5cIiksXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0J2p1c3RpZmljYXRpb24nOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogWydzdHJpbmcnLCAnb2JqZWN0J10sXG5cdFx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5pbnN0YWxsRXh0ZW5zaW9uLm9wdGlvbi5qdXN0aWZpY2F0aW9uJywgXCJKdXN0aWZpY2F0aW9uIGZvciBpbnN0YWxsaW5nIHRoZSBleHRlbnNpb24uIFRoaXMgaXMgYSBzdHJpbmcgb3IgYW4gb2JqZWN0IHRoYXQgY2FuIGJlIHVzZWQgdG8gcGFzcyBhbnkgaW5mb3JtYXRpb24gdG8gdGhlIGluc3RhbGxhdGlvbiBoYW5kbGVycy4gaS5lLiBge3JlYXNvbjogJ1RoaXMgZXh0ZW5zaW9uIHdhbnRzIHRvIG9wZW4gYSBVUkknLCBhY3Rpb246ICdPcGVuIFVSSSd9YCB3aWxsIHNob3cgYSBtZXNzYWdlIGJveCB3aXRoIHRoZSByZWFzb24gYW5kIGFjdGlvbiB1cG9uIGluc3RhbGwuXCIpLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdCdlbmFibGUnOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmV4dGVuc2lvbnMuaW5zdGFsbEV4dGVuc2lvbi5vcHRpb24uZW5hYmxlJywgXCJXaGVuIGVuYWJsZWQsIHRoZSBleHRlbnNpb24gd2lsbCBiZSBlbmFibGVkIGlmIGl0IGlzIGluc3RhbGxlZCBidXQgZGlzYWJsZWQuIElmIHRoZSBleHRlbnNpb24gaXMgYWxyZWFkeSBlbmFibGVkLCB0aGlzIGhhcyBubyBlZmZlY3QuXCIpLFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdF1cblx0fSxcblx0aGFuZGxlcjogYXN5bmMgKFxuXHRcdGFjY2Vzc29yLFxuXHRcdGFyZzogc3RyaW5nIHwgVXJpQ29tcG9uZW50cyxcblx0XHRvcHRpb25zPzoge1xuXHRcdFx0aW5zdGFsbE9ubHlOZXdseUFkZGVkRnJvbUV4dGVuc2lvblBhY2tWU0lYPzogYm9vbGVhbjtcblx0XHRcdGluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbj86IGJvb2xlYW47XG5cdFx0XHRkb25vdFN5bmM/OiBib29sZWFuO1xuXHRcdFx0anVzdGlmaWNhdGlvbj86IHN0cmluZyB8IHsgcmVhc29uOiBzdHJpbmc7IGFjdGlvbjogc3RyaW5nIH07XG5cdFx0XHRlbmFibGU/OiBib29sZWFuO1xuXHRcdH0pID0+IHtcblx0XHRjb25zdCBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlKTtcblx0XHR0cnkge1xuXHRcdFx0aWYgKHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGNvbnN0IFtpZCwgdmVyc2lvbl0gPSBnZXRJZEFuZFZlcnNpb24oYXJnKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmluZChlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgeyBpZCwgdXVpZDogdmVyc2lvbiB9KSk7XG5cdFx0XHRcdGlmIChleHRlbnNpb24/LmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlFeHRlbnNpb25LaW5kKSB7XG5cdFx0XHRcdFx0Y29uc3QgW2dhbGxlcnldID0gYXdhaXQgZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhbeyBpZCwgcHJlUmVsZWFzZTogb3B0aW9ucz8uaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uIH1dLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0XHRpZiAoIWdhbGxlcnkpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnbm90Rm91bmQnLCBcIkV4dGVuc2lvbiAnezB9JyBub3QgZm91bmQuXCIsIGFyZykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhd2FpdCBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsRnJvbUdhbGxlcnkoZ2FsbGVyeSwge1xuXHRcdFx0XHRcdFx0aXNNYWNoaW5lU2NvcGVkOiBvcHRpb25zPy5kb25vdFN5bmMgPyB0cnVlIDogdW5kZWZpbmVkLCAvKiBkbyBub3QgYWxsb3cgc3luY2luZyBleHRlbnNpb25zIGF1dG9tYXRpY2FsbHkgd2hpbGUgaW5zdGFsbGluZyB0aHJvdWdoIHRoZSBjb21tYW5kICovXG5cdFx0XHRcdFx0XHRpbnN0YWxsUHJlUmVsZWFzZVZlcnNpb246IG9wdGlvbnM/Lmluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbixcblx0XHRcdFx0XHRcdGluc3RhbGxHaXZlblZlcnNpb246ICEhdmVyc2lvbixcblx0XHRcdFx0XHRcdGNvbnRleHQ6IHsgW0VYVEVOU0lPTl9JTlNUQUxMX1NPVVJDRV9DT05URVhUXTogRXh0ZW5zaW9uSW5zdGFsbFNvdXJjZS5DT01NQU5EIH0sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXdhaXQgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuaW5zdGFsbChpZCwge1xuXHRcdFx0XHRcdFx0dmVyc2lvbixcblx0XHRcdFx0XHRcdGluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbjogb3B0aW9ucz8uaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uLFxuXHRcdFx0XHRcdFx0Y29udGV4dDogeyBbRVhURU5TSU9OX0lOU1RBTExfU09VUkNFX0NPTlRFWFRdOiBFeHRlbnNpb25JbnN0YWxsU291cmNlLkNPTU1BTkQgfSxcblx0XHRcdFx0XHRcdGp1c3RpZmljYXRpb246IG9wdGlvbnM/Lmp1c3RpZmljYXRpb24sXG5cdFx0XHRcdFx0XHRlbmFibGU6IG9wdGlvbnM/LmVuYWJsZSxcblx0XHRcdFx0XHRcdGlzTWFjaGluZVNjb3BlZDogb3B0aW9ucz8uZG9ub3RTeW5jID8gdHJ1ZSA6IHVuZGVmaW5lZCwgLyogZG8gbm90IGFsbG93IHN5bmNpbmcgZXh0ZW5zaW9ucyBhdXRvbWF0aWNhbGx5IHdoaWxlIGluc3RhbGxpbmcgdGhyb3VnaCB0aGUgY29tbWFuZCAqL1xuXHRcdFx0XHRcdH0sIFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgdnNpeCA9IFVSSS5yZXZpdmUoYXJnKTtcblx0XHRcdFx0YXdhaXQgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuaW5zdGFsbCh2c2l4LCB7IGluc3RhbGxHaXZlblZlcnNpb246IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZSk7XG5cdFx0XHR0aHJvdyBlO1xuXHRcdH1cblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy51bmluc3RhbGxFeHRlbnNpb24nLFxuXHRtZXRhZGF0YToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmV4dGVuc2lvbnMudW5pbnN0YWxsRXh0ZW5zaW9uLmRlc2NyaXB0aW9uJywgXCJVbmluc3RhbGwgdGhlIGdpdmVuIGV4dGVuc2lvblwiKSxcblx0XHRhcmdzOiBbXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IGxvY2FsaXplKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy51bmluc3RhbGxFeHRlbnNpb24uYXJnLm5hbWUnLCBcIklkIG9mIHRoZSBleHRlbnNpb24gdG8gdW5pbnN0YWxsXCIpLFxuXHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRdXG5cdH0sXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvciwgaWQ6IHN0cmluZykgPT4ge1xuXHRcdGlmICghaWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnaWQgcmVxdWlyZWQnLCBcIkV4dGVuc2lvbiBpZCByZXF1aXJlZC5cIikpO1xuXHRcdH1cblx0XHRjb25zdCBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IGluc3RhbGxlZCA9IGF3YWl0IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZCgpO1xuXHRcdGNvbnN0IFtleHRlbnNpb25Ub1VuaW5zdGFsbF0gPSBpbnN0YWxsZWQuZmlsdGVyKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCB7IGlkIH0pKTtcblx0XHRpZiAoIWV4dGVuc2lvblRvVW5pbnN0YWxsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ25vdEluc3RhbGxlZCcsIFwiRXh0ZW5zaW9uICd7MH0nIGlzIG5vdCBpbnN0YWxsZWQuIE1ha2Ugc3VyZSB5b3UgdXNlIHRoZSBmdWxsIGV4dGVuc2lvbiBJRCwgaW5jbHVkaW5nIHRoZSBwdWJsaXNoZXIsIGUuZy46IG1zLWRvdG5ldHRvb2xzLmNzaGFycC5cIiwgaWQpKTtcblx0XHR9XG5cdFx0aWYgKGV4dGVuc2lvblRvVW5pbnN0YWxsLmlzQnVpbHRpbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdidWlsdGluJywgXCJFeHRlbnNpb24gJ3swfScgaXMgYSBCdWlsdC1pbiBleHRlbnNpb24gYW5kIGNhbm5vdCBiZSB1bmluc3RhbGxlZFwiLCBpZCkpO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS51bmluc3RhbGwoZXh0ZW5zaW9uVG9Vbmluc3RhbGwpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGUpO1xuXHRcdFx0dGhyb3cgZTtcblx0XHR9XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuc2VhcmNoJyxcblx0bWV0YWRhdGE6IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dvcmtiZW5jaC5leHRlbnNpb25zLnNlYXJjaC5kZXNjcmlwdGlvbicsIFwiU2VhcmNoIGZvciBhIHNwZWNpZmljIGV4dGVuc2lvblwiKSxcblx0XHRhcmdzOiBbXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IGxvY2FsaXplKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5zZWFyY2guYXJnLm5hbWUnLCBcIlF1ZXJ5IHRvIHVzZSBpbiBzZWFyY2hcIiksXG5cdFx0XHRcdHNjaGVtYTogeyAndHlwZSc6ICdzdHJpbmcnIH1cblx0XHRcdH1cblx0XHRdXG5cdH0sXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvciwgcXVlcnk6IHN0cmluZyA9ICcnKSA9PiB7XG5cdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpLm9wZW5TZWFyY2gocXVlcnkpO1xuXHR9XG59KTtcblxuZnVuY3Rpb24gb3ZlcnJpZGVBY3Rpb25Gb3JBY3RpdmVFeHRlbnNpb25FZGl0b3JXZWJ2aWV3KGNvbW1hbmQ6IE11bHRpQ29tbWFuZCB8IHVuZGVmaW5lZCwgZjogKHdlYnZpZXc6IElXZWJ2aWV3KSA9PiB2b2lkKSB7XG5cdGNvbW1hbmQ/LmFkZEltcGxlbWVudGF0aW9uKDEwNSwgJ2V4dGVuc2lvbnMtZWRpdG9yJywgKGFjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBFeHRlbnNpb25FZGl0b3IpIHtcblx0XHRcdGlmIChlZGl0b3IuYWN0aXZlV2Vidmlldz8uaXNGb2N1c2VkKSB7XG5cdFx0XHRcdGYoZWRpdG9yLmFjdGl2ZVdlYnZpZXcpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9KTtcbn1cblxub3ZlcnJpZGVBY3Rpb25Gb3JBY3RpdmVFeHRlbnNpb25FZGl0b3JXZWJ2aWV3KENvcHlBY3Rpb24sIHdlYnZpZXcgPT4gd2Vidmlldy5jb3B5KCkpO1xub3ZlcnJpZGVBY3Rpb25Gb3JBY3RpdmVFeHRlbnNpb25FZGl0b3JXZWJ2aWV3KEN1dEFjdGlvbiwgd2VidmlldyA9PiB3ZWJ2aWV3LmN1dCgpKTtcbm92ZXJyaWRlQWN0aW9uRm9yQWN0aXZlRXh0ZW5zaW9uRWRpdG9yV2VidmlldyhQYXN0ZUFjdGlvbiwgd2VidmlldyA9PiB3ZWJ2aWV3LnBhc3RlKCkpO1xuXG4vLyBDb250ZXh0c1xuZXhwb3J0IGNvbnN0IENPTlRFWFRfSEFTX0xPQ0FMX1NFUlZFUiA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdoYXNMb2NhbFNlcnZlcicsIGZhbHNlKTtcbmV4cG9ydCBjb25zdCBDT05URVhUX0hBU19SRU1PVEVfU0VSVkVSID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2hhc1JlbW90ZVNlcnZlcicsIGZhbHNlKTtcbmV4cG9ydCBjb25zdCBDT05URVhUX0hBU19XRUJfU0VSVkVSID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2hhc1dlYlNlcnZlcicsIGZhbHNlKTtcbmNvbnN0IENPTlRFWFRfR0FMTEVSWV9TT1JUX0NBUEFCSUxJVElFUyA9IG5ldyBSYXdDb250ZXh0S2V5PHN0cmluZz4oJ2dhbGxlcnlTb3J0Q2FwYWJpbGl0aWVzJywgJycpO1xuY29uc3QgQ09OVEVYVF9HQUxMRVJZX0ZJTFRFUl9DQVBBQklMSVRJRVMgPSBuZXcgUmF3Q29udGV4dEtleTxzdHJpbmc+KCdnYWxsZXJ5RmlsdGVyQ2FwYWJpbGl0aWVzJywgJycpO1xuY29uc3QgQ09OVEVYVF9HQUxMRVJZX0FMTF9QVUJMSUNfUkVQT1NJVE9SWV9TSUdORUQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignZ2FsbGVyeUFsbFB1YmxpY1JlcG9zaXRvcnlTaWduZWQnLCBmYWxzZSk7XG5jb25zdCBDT05URVhUX0dBTExFUllfQUxMX1BSSVZBVEVfUkVQT1NJVE9SWV9TSUdORUQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignZ2FsbGVyeUFsbFByaXZhdGVSZXBvc2l0b3J5U2lnbmVkJywgZmFsc2UpO1xuY29uc3QgQ09OVEVYVF9HQUxMRVJZX0hBU19FWFRFTlNJT05fTElOSyA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdnYWxsZXJ5SGFzRXh0ZW5zaW9uTGluaycsIGZhbHNlKTtcblxuYXN5bmMgZnVuY3Rpb24gcnVuQWN0aW9uPFQgPSB2b2lkPihhY3Rpb246IElBY3Rpb24pOiBQcm9taXNlPFQ+IHtcblx0dHJ5IHtcblx0XHRyZXR1cm4gYXdhaXQgYWN0aW9uLnJ1bigpIGFzIFQ7XG5cdH0gZmluYWxseSB7XG5cdFx0aWYgKGlzRGlzcG9zYWJsZShhY3Rpb24pKSB7XG5cdFx0XHRhY3Rpb24uZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxufVxuXG50eXBlIElFeHRlbnNpb25BY3Rpb25PcHRpb25zID0gSUFjdGlvbjJPcHRpb25zICYge1xuXHRtZW51VGl0bGVzPzogeyBbaWQ6IHN0cmluZ106IHN0cmluZyB9O1xuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8YW55Pjtcbn07XG5cbmNsYXNzIEV4dGVuc2lvbnNDb250cmlidXRpb25zIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVmlld3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlld3NTZXJ2aWNlOiBJVmlld3NTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJUGx1Z2luSW5zdGFsbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwbHVnaW5JbnN0YWxsU2VydmljZTogSVBsdWdpbkluc3RhbGxTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IGhhc0xvY2FsU2VydmVyQ29udGV4dCA9IENPTlRFWFRfSEFTX0xPQ0FMX1NFUlZFUi5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0aGFzTG9jYWxTZXJ2ZXJDb250ZXh0LnNldCh0cnVlKTtcblx0XHR9XG5cblx0XHRjb25zdCBoYXNSZW1vdGVTZXJ2ZXJDb250ZXh0ID0gQ09OVEVYVF9IQVNfUkVNT1RFX1NFUlZFUi5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdGhhc1JlbW90ZVNlcnZlckNvbnRleHQuc2V0KHRydWUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc1dlYlNlcnZlckNvbnRleHQgPSBDT05URVhUX0hBU19XRUJfU0VSVkVSLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0aGFzV2ViU2VydmVyQ29udGV4dC5zZXQodHJ1ZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVFeHRlbnNpb25HYWxsZXJ5U3RhdHVzQ29udGV4dHMoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzKCgpID0+IHRoaXMudXBkYXRlRXh0ZW5zaW9uR2FsbGVyeVN0YXR1c0NvbnRleHRzKCkpKTtcblx0XHRleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLmdldEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCgpXG5cdFx0XHQudGhlbihleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QgPT4ge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUdhbGxlcnlDYXBhYmlsaXRpZXNDb250ZXh0cyhleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QpO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCA9PiB0aGlzLnVwZGF0ZUdhbGxlcnlDYXBhYmlsaXRpZXNDb250ZXh0cyhleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QpKSk7XG5cdFx0XHR9KTtcblx0XHR0aGlzLnJlZ2lzdGVyR2xvYmFsQWN0aW9ucygpO1xuXHRcdHRoaXMucmVnaXN0ZXJDb250ZXh0TWVudUFjdGlvbnMoKTtcblx0XHR0aGlzLnJlZ2lzdGVyUXVpY2tBY2Nlc3NQcm92aWRlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVFeHRlbnNpb25HYWxsZXJ5U3RhdHVzQ29udGV4dHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Q09OVEVYVF9IQVNfR0FMTEVSWS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSkuc2V0KHRoaXMuZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZS5leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTdGF0dXMgPT09IEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFN0YXR1cy5BdmFpbGFibGUpO1xuXHRcdENPTlRFWFRfRVhURU5TSU9OU19HQUxMRVJZX1NUQVRVUy5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSkuc2V0KHRoaXMuZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZS5leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTdGF0dXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVHYWxsZXJ5Q2FwYWJpbGl0aWVzQ29udGV4dHMoZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0OiBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0IHwgbnVsbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdENPTlRFWFRfR0FMTEVSWV9TT1JUX0NBUEFCSUxJVElFUy5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSkuc2V0KGBfJHtleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3Q/LmNhcGFiaWxpdGllcy5leHRlbnNpb25RdWVyeS5zb3J0aW5nPy5tYXAocyA9PiBzLm5hbWUpPy5qb2luKCdfJyl9X1VwZGF0ZURhdGVfYCk7XG5cdFx0Q09OVEVYVF9HQUxMRVJZX0ZJTFRFUl9DQVBBQklMSVRJRVMuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpLnNldChgXyR7ZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0Py5jYXBhYmlsaXRpZXMuZXh0ZW5zaW9uUXVlcnkuZmlsdGVyaW5nPy5tYXAocyA9PiBzLm5hbWUpPy5qb2luKCdfJyl9X2ApO1xuXHRcdENPTlRFWFRfR0FMTEVSWV9BTExfUFVCTElDX1JFUE9TSVRPUllfU0lHTkVELmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoISFleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3Q/LmNhcGFiaWxpdGllcz8uc2lnbmluZz8uYWxsUHVibGljUmVwb3NpdG9yeVNpZ25lZCk7XG5cdFx0Q09OVEVYVF9HQUxMRVJZX0FMTF9QUklWQVRFX1JFUE9TSVRPUllfU0lHTkVELmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoISFleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3Q/LmNhcGFiaWxpdGllcz8uc2lnbmluZz8uYWxsUHJpdmF0ZVJlcG9zaXRvcnlTaWduZWQpO1xuXHRcdENPTlRFWFRfR0FMTEVSWV9IQVNfRVhURU5TSU9OX0xJTksuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpLnNldCghIShleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QgJiYgZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0UmVzb3VyY2VVcmkoZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LCBFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VUeXBlLkV4dGVuc2lvbkRldGFpbHNWaWV3VXJpKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclF1aWNrQWNjZXNzUHJvdmlkZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyXG5cdFx0XHR8fCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJcblx0XHRcdHx8IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclxuXHRcdCkge1xuXHRcdFx0UmVnaXN0cnkuYXM8SVF1aWNrQWNjZXNzUmVnaXN0cnk+KEV4dGVuc2lvbnMuUXVpY2thY2Nlc3MpLnJlZ2lzdGVyUXVpY2tBY2Nlc3NQcm92aWRlcih7XG5cdFx0XHRcdGN0b3I6IEluc3RhbGxFeHRlbnNpb25RdWlja0FjY2Vzc1Byb3ZpZGVyLFxuXHRcdFx0XHRwcmVmaXg6IEluc3RhbGxFeHRlbnNpb25RdWlja0FjY2Vzc1Byb3ZpZGVyLlBSRUZJWCxcblx0XHRcdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdpbnN0YWxsRXh0ZW5zaW9uUXVpY2tBY2Nlc3NQbGFjZWhvbGRlcicsIFwiVHlwZSB0aGUgbmFtZSBvZiBhbiBleHRlbnNpb24gdG8gaW5zdGFsbCBvciBzZWFyY2guXCIpLFxuXHRcdFx0XHRoZWxwRW50cmllczogW3sgZGVzY3JpcHRpb246IGxvY2FsaXplKCdpbnN0YWxsRXh0ZW5zaW9uUXVpY2tBY2Nlc3NIZWxwJywgXCJJbnN0YWxsIG9yIFNlYXJjaCBFeHRlbnNpb25zXCIpIH1dXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQvLyBHbG9iYWwgYWN0aW9uc1xuXHRwcml2YXRlIHJlZ2lzdGVyR2xvYmFsQWN0aW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJQcmVmZXJlbmNlc01lbnUsIHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6IFZJRVdMRVRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pUHJlZmVyZW5jZXNFeHRlbnNpb25zJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRXh0ZW5zaW9uc1wiKVxuXHRcdFx0fSxcblx0XHRcdGdyb3VwOiAnMl9jb25maWd1cmF0aW9uJyxcblx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0d2hlbjogSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKClcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5HbG9iYWxBY3Rpdml0eSwge1xuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogVklFV0xFVF9JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzaG93RXh0ZW5zaW9ucycsIFwiRXh0ZW5zaW9uc1wiKVxuXHRcdFx0fSxcblx0XHRcdGdyb3VwOiAnMl9jb25maWd1cmF0aW9uJyxcblx0XHRcdG9yZGVyOiAzXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5mb2N1c0V4dGVuc2lvbnNWaWV3Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ZvY3VzRXh0ZW5zaW9ucycsICdGb2N1cyBvbiBFeHRlbnNpb25zIFZpZXcnKSxcblx0XHRcdGNhdGVnb3J5OiBFeHRlbnNpb25zTG9jYWxpemVkTGFiZWwsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGF3YWl0IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpLm9wZW5TZWFyY2goJycpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5pbnN0YWxsRXh0ZW5zaW9ucycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnN0YWxsRXh0ZW5zaW9ucycsICdJbnN0YWxsIEV4dGVuc2lvbnMnKSxcblx0XHRcdGNhdGVnb3J5OiBFeHRlbnNpb25zTG9jYWxpemVkTGFiZWwsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0hBU19HQUxMRVJZLCBDb250ZXh0S2V5RXhwci5vcihDT05URVhUX0hBU19MT0NBTF9TRVJWRVIsIENPTlRFWFRfSEFTX1JFTU9URV9TRVJWRVIsIENPTlRFWFRfSEFTX1dFQl9TRVJWRVIpKVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKS5vcGVuVmlld0NvbnRhaW5lcihWSUVXTEVUX0lELCB0cnVlKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uc2hvd1JlY29tbWVuZGVkS2V5bWFwRXh0ZW5zaW9ucycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzaG93UmVjb21tZW5kZWRLZXltYXBFeHRlbnNpb25zU2hvcnQnLCAnS2V5bWFwcycpLFxuXHRcdFx0Y2F0ZWdvcnk6IFByZWZlcmVuY2VzTG9jYWxpemVkTGFiZWwsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDT05URVhUX0hBU19HQUxMRVJZXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0tFWUJJTkRJTkdTX0VESVRPUiwgQ09OVEVYVF9IQVNfR0FMTEVSWSksXG5cdFx0XHRcdGdyb3VwOiAnMl9rZXlib2FyZF9kaXNjb3Zlcl9hY3Rpb25zJ1xuXHRcdFx0fV0sXG5cdFx0XHRtZW51VGl0bGVzOiB7XG5cdFx0XHRcdFtNZW51SWQuRWRpdG9yVGl0bGUuaWRdOiBsb2NhbGl6ZSgnaW1wb3J0S2V5Ym9hcmRTaG9ydGN1dHNGcm9tcycsIFwiTWlncmF0ZSBLZXlib2FyZCBTaG9ydGN1dHMgZnJvbS4uLlwiKVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKCdAcmVjb21tZW5kZWQ6a2V5bWFwcyAnKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5zaG93TGFuZ3VhZ2VFeHRlbnNpb25zJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Nob3dMYW5ndWFnZUV4dGVuc2lvbnNTaG9ydCcsICdMYW5ndWFnZSBFeHRlbnNpb25zJyksXG5cdFx0XHRjYXRlZ29yeTogUHJlZmVyZW5jZXNMb2NhbGl6ZWRMYWJlbCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9IQVNfR0FMTEVSWVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKCdAcmVjb21tZW5kZWQ6bGFuZ3VhZ2VzICcpXG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmNoZWNrRm9yVXBkYXRlcycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGVja0ZvclVwZGF0ZXMnLCAnQ2hlY2sgZm9yIEV4dGVuc2lvbiBVcGRhdGVzJyksXG5cdFx0XHRjYXRlZ29yeTogRXh0ZW5zaW9uc0xvY2FsaXplZExhYmVsLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfSEFTX0dBTExFUlksIENvbnRleHRLZXlFeHByLm9yKENPTlRFWFRfSEFTX0xPQ0FMX1NFUlZFUiwgQ09OVEVYVF9IQVNfUkVNT1RFX1NFUlZFUiwgQ09OVEVYVF9IQVNfV0VCX1NFUlZFUikpXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld0NvbnRhaW5lclRpdGxlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Q29udGFpbmVyJywgVklFV0xFVF9JRCksIENPTlRFWFRfSEFTX0dBTExFUlkpLFxuXHRcdFx0XHRncm91cDogJzFfdXBkYXRlcycsXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9XSxcblx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBbLCBwbHVnaW5SZXN1bHRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRcdHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuY2hlY2tGb3JVcGRhdGVzKCksXG5cdFx0XHRcdFx0dGhpcy5wbHVnaW5JbnN0YWxsU2VydmljZS51cGRhdGVBbGxQbHVnaW5zKHsgc2lsZW50OiB0cnVlIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0Y29uc3Qgb3V0ZGF0ZWQgPSB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm91dGRhdGVkO1xuXHRcdFx0XHRpZiAob3V0ZGF0ZWQubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaCgnQG91dGRhdGVkICcpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHBsdWdpblJlc3VsdC51cGRhdGVkTmFtZXMubGVuZ3RoID09PSAwICYmIHBsdWdpblJlc3VsdC5mYWlsZWROYW1lcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5kaWFsb2dTZXJ2aWNlLmluZm8obG9jYWxpemUoJ25vVXBkYXRlc0F2YWlsYWJsZScsIFwiQWxsIGV4dGVuc2lvbnMgYXJlIHVwIHRvIGRhdGUuXCIpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZW5hYmxlQXV0b1VwZGF0ZVdoZW5Db25kaXRpb24gPSBDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0F1dG9VcGRhdGVDb25maWd1cmF0aW9uS2V5fWAsICdvZmYnKTtcblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmVuYWJsZUF1dG9VcGRhdGUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZW5hYmxlQXV0b1VwZGF0ZScsICdFbmFibGUgQXV0byBVcGRhdGUgZm9yIEV4dGVuc2lvbnMnKSxcblx0XHRcdGNhdGVnb3J5OiBFeHRlbnNpb25zTG9jYWxpemVkTGFiZWwsXG5cdFx0XHRwcmVjb25kaXRpb246IGVuYWJsZUF1dG9VcGRhdGVXaGVuQ29uZGl0aW9uLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3Q29udGFpbmVyVGl0bGUsXG5cdFx0XHRcdG9yZGVyOiA1LFxuXHRcdFx0XHRncm91cDogJzFfdXBkYXRlcycsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXdDb250YWluZXInLCBWSUVXTEVUX0lEKSwgZW5hYmxlQXV0b1VwZGF0ZVdoZW5Db25kaXRpb24pXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHR9XSxcblx0XHRcdHJ1bjogKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKS51cGRhdGVBdXRvVXBkYXRlRm9yQWxsRXh0ZW5zaW9ucyh0cnVlKVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZGlzYWJsZUF1dG9VcGRhdGVXaGVuQ29uZGl0aW9uID0gQ29udGV4dEtleUV4cHIubm90RXF1YWxzKGBjb25maWcuJHtBdXRvVXBkYXRlQ29uZmlndXJhdGlvbktleX1gLCAnb2ZmJyk7XG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5kaXNhYmxlQXV0b1VwZGF0ZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdkaXNhYmxlQXV0b1VwZGF0ZScsICdEaXNhYmxlIEF1dG8gVXBkYXRlIGZvciBFeHRlbnNpb25zJyksXG5cdFx0XHRwcmVjb25kaXRpb246IGRpc2FibGVBdXRvVXBkYXRlV2hlbkNvbmRpdGlvbixcblx0XHRcdGNhdGVnb3J5OiBFeHRlbnNpb25zTG9jYWxpemVkTGFiZWwsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdDb250YWluZXJUaXRsZSxcblx0XHRcdFx0b3JkZXI6IDUsXG5cdFx0XHRcdGdyb3VwOiAnMV91cGRhdGVzJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlld0NvbnRhaW5lcicsIFZJRVdMRVRfSUQpLCBkaXNhYmxlQXV0b1VwZGF0ZVdoZW5Db25kaXRpb24pXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHR9XSxcblx0XHRcdHJ1bjogKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKS51cGRhdGVBdXRvVXBkYXRlRm9yQWxsRXh0ZW5zaW9ucyhmYWxzZSlcblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24udXBkYXRlQWxsRXh0ZW5zaW9ucycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd1cGRhdGVBbGwnLCAnVXBkYXRlIEFsbCBFeHRlbnNpb25zJyksXG5cdFx0XHRjYXRlZ29yeTogRXh0ZW5zaW9uc0xvY2FsaXplZExhYmVsLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBIYXNPdXRkYXRlZEV4dGVuc2lvbnNDb250ZXh0LFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9IQVNfR0FMTEVSWSwgQ29udGV4dEtleUV4cHIub3IoQ09OVEVYVF9IQVNfTE9DQUxfU0VSVkVSLCBDT05URVhUX0hBU19SRU1PVEVfU0VSVkVSLCBDT05URVhUX0hBU19XRUJfU0VSVkVSKSlcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuVmlld0NvbnRhaW5lclRpdGxlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlld0NvbnRhaW5lcicsIFZJRVdMRVRfSUQpLFxuXHRcdFx0XHRcdGdyb3VwOiAnMV91cGRhdGVzJyxcblx0XHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgT1VUREFURURfRVhURU5TSU9OU19WSUVXX0lEKSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdH1cblx0XHRcdF0sXG5cdFx0XHRpY29uOiBpbnN0YWxsV29ya3NwYWNlUmVjb21tZW5kZWRJY29uLFxuXHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UudXBkYXRlQWxsKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmVuYWJsZUFsbCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdlbmFibGVBbGwnLCAnRW5hYmxlIEFsbCBFeHRlbnNpb25zJyksXG5cdFx0XHRjYXRlZ29yeTogRXh0ZW5zaW9uc0xvY2FsaXplZExhYmVsLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoQ09OVEVYVF9IQVNfTE9DQUxfU0VSVkVSLCBDT05URVhUX0hBU19SRU1PVEVfU0VSVkVSLCBDT05URVhUX0hBU19XRUJfU0VSVkVSKVxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdDb250YWluZXJUaXRsZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Q29udGFpbmVyJywgVklFV0xFVF9JRCksXG5cdFx0XHRcdGdyb3VwOiAnMl9lbmFibGVtZW50Jyxcblx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdH1dLFxuXHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbnNUb0VuYWJsZSA9IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmlsdGVyKGUgPT4gISFlLmxvY2FsICYmIHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuY2FuQ2hhbmdlRW5hYmxlbWVudChlLmxvY2FsKSAmJiAhdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoZS5sb2NhbCkpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uc1RvRW5hYmxlLmxlbmd0aCkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uuc2V0RW5hYmxlbWVudChleHRlbnNpb25zVG9FbmFibGUsIEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkR2xvYmFsbHkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmVuYWJsZUFsbFdvcmtzcGFjZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdlbmFibGVBbGxXb3Jrc3BhY2UnLCAnRW5hYmxlIEFsbCBFeHRlbnNpb25zIGZvciB0aGlzIFdvcmtzcGFjZScpLFxuXHRcdFx0Y2F0ZWdvcnk6IEV4dGVuc2lvbnNMb2NhbGl6ZWRMYWJlbCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFdvcmtiZW5jaFN0YXRlQ29udGV4dC5ub3RFcXVhbHNUbygnZW1wdHknKSwgQ29udGV4dEtleUV4cHIub3IoQ09OVEVYVF9IQVNfTE9DQUxfU0VSVkVSLCBDT05URVhUX0hBU19SRU1PVEVfU0VSVkVSLCBDT05URVhUX0hBU19XRUJfU0VSVkVSKSlcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uc1RvRW5hYmxlID0gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5sb2NhbC5maWx0ZXIoZSA9PiAhIWUubG9jYWwgJiYgdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5jYW5DaGFuZ2VFbmFibGVtZW50KGUubG9jYWwpICYmICF0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZChlLmxvY2FsKSk7XG5cdFx0XHRcdGlmIChleHRlbnNpb25zVG9FbmFibGUubGVuZ3RoKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5zZXRFbmFibGVtZW50KGV4dGVuc2lvbnNUb0VuYWJsZSwgRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmRpc2FibGVBbGwnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZGlzYWJsZUFsbCcsICdEaXNhYmxlIEFsbCBJbnN0YWxsZWQgRXh0ZW5zaW9ucycpLFxuXHRcdFx0Y2F0ZWdvcnk6IEV4dGVuc2lvbnNMb2NhbGl6ZWRMYWJlbCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKENPTlRFWFRfSEFTX0xPQ0FMX1NFUlZFUiwgQ09OVEVYVF9IQVNfUkVNT1RFX1NFUlZFUiwgQ09OVEVYVF9IQVNfV0VCX1NFUlZFUilcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3Q29udGFpbmVyVGl0bGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlld0NvbnRhaW5lcicsIFZJRVdMRVRfSUQpLFxuXHRcdFx0XHRncm91cDogJzJfZW5hYmxlbWVudCcsXG5cdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHR9XSxcblx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25zVG9EaXNhYmxlID0gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5sb2NhbC5maWx0ZXIoZSA9PiAhZS5pc0J1aWx0aW4gJiYgISFlLmxvY2FsICYmIHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKGUubG9jYWwpICYmIHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuY2FuQ2hhbmdlRW5hYmxlbWVudChlLmxvY2FsKSk7XG5cdFx0XHRcdGlmIChleHRlbnNpb25zVG9EaXNhYmxlLmxlbmd0aCkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uuc2V0RW5hYmxlbWVudChleHRlbnNpb25zVG9EaXNhYmxlLCBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRHbG9iYWxseSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uZGlzYWJsZUFsbFdvcmtzcGFjZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdkaXNhYmxlQWxsV29ya3NwYWNlJywgJ0Rpc2FibGUgQWxsIEluc3RhbGxlZCBFeHRlbnNpb25zIGZvciB0aGlzIFdvcmtzcGFjZScpLFxuXHRcdFx0Y2F0ZWdvcnk6IEV4dGVuc2lvbnNMb2NhbGl6ZWRMYWJlbCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFdvcmtiZW5jaFN0YXRlQ29udGV4dC5ub3RFcXVhbHNUbygnZW1wdHknKSwgQ29udGV4dEtleUV4cHIub3IoQ09OVEVYVF9IQVNfTE9DQUxfU0VSVkVSLCBDT05URVhUX0hBU19SRU1PVEVfU0VSVkVSLCBDT05URVhUX0hBU19XRUJfU0VSVkVSKSlcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uc1RvRGlzYWJsZSA9IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmlsdGVyKGUgPT4gIWUuaXNCdWlsdGluICYmICEhZS5sb2NhbCAmJiB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZChlLmxvY2FsKSAmJiB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmNhbkNoYW5nZUVuYWJsZW1lbnQoZS5sb2NhbCkpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uc1RvRGlzYWJsZS5sZW5ndGgpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnNldEVuYWJsZW1lbnQoZXh0ZW5zaW9uc1RvRGlzYWJsZSwgRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogU0VMRUNUX0lOU1RBTExfVlNJWF9FWFRFTlNJT05fQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ0luc3RhbGxGcm9tVlNJWCcsICdJbnN0YWxsIGZyb20gVlNJWC4uLicpLFxuXHRcdFx0Y2F0ZWdvcnk6IEV4dGVuc2lvbnNMb2NhbGl6ZWRMYWJlbCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKENPTlRFWFRfSEFTX0xPQ0FMX1NFUlZFUiwgQ09OVEVYVF9IQVNfUkVNT1RFX1NFUlZFUilcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3Q29udGFpbmVyVGl0bGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXdDb250YWluZXInLCBWSUVXTEVUX0lEKSwgQ29udGV4dEtleUV4cHIub3IoQ09OVEVYVF9IQVNfTE9DQUxfU0VSVkVSLCBDT05URVhUX0hBU19SRU1PVEVfU0VSVkVSKSksXG5cdFx0XHRcdGdyb3VwOiAnM19pbnN0YWxsJyxcblx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdH1dLFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHtcblx0XHRcdFx0Y29uc3QgZmlsZURpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVEaWFsb2dTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgdnNpeFBhdGhzID0gYXdhaXQgZmlsZURpYWxvZ1NlcnZpY2Uuc2hvd09wZW5EaWFsb2coe1xuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnaW5zdGFsbEZyb21WU0lYJywgXCJJbnN0YWxsIGZyb20gVlNJWFwiKSxcblx0XHRcdFx0XHRmaWx0ZXJzOiBbeyBuYW1lOiAnVlNJWCBFeHRlbnNpb25zJywgZXh0ZW5zaW9uczogWyd2c2l4J10gfV0sXG5cdFx0XHRcdFx0Y2FuU2VsZWN0RmlsZXM6IHRydWUsXG5cdFx0XHRcdFx0Y2FuU2VsZWN0TWFueTogdHJ1ZSxcblx0XHRcdFx0XHRvcGVuTGFiZWw6IG1uZW1vbmljQnV0dG9uTGFiZWwobG9jYWxpemUoeyBrZXk6ICdpbnN0YWxsQnV0dG9uJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmSW5zdGFsbFwiKSlcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmICh2c2l4UGF0aHMpIHtcblx0XHRcdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChJTlNUQUxMX0VYVEVOU0lPTl9GUk9NX1ZTSVhfQ09NTUFORF9JRCwgdnNpeFBhdGhzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogSU5TVEFMTF9FWFRFTlNJT05fRlJPTV9WU0lYX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2luc3RhbGxWU0lYJywgXCJJbnN0YWxsIEV4dGVuc2lvbiBWU0lYXCIpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHBsb3JlckNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnZXh0ZW5zaW9ucycsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChSZXNvdXJjZUNvbnRleHRLZXkuRXh0ZW5zaW9uLmlzRXF1YWxUbygnLnZzaXgnKSwgQ29udGV4dEtleUV4cHIub3IoQ09OVEVYVF9IQVNfTE9DQUxfU0VSVkVSLCBDT05URVhUX0hBU19SRU1PVEVfU0VSVkVSKSksXG5cdFx0XHR9XSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCByZXNvdXJjZXM6IFVSSVtdIHwgVVJJKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIb3N0U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXG5cdFx0XHRcdGNvbnN0IHZzaXhzID0gQXJyYXkuaXNBcnJheShyZXNvdXJjZXMpID8gcmVzb3VyY2VzIDogW3Jlc291cmNlc107XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZCh2c2l4cy5tYXAoYXN5bmMgKHZzaXgpID0+IGF3YWl0IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmluc3RhbGwodnNpeCwgeyBpbnN0YWxsR2l2ZW5WZXJzaW9uOiB0cnVlIH0pKSk7XG5cdFx0XHRcdGxldCBlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQsIHJlcXVpcmVSZWxvYWQgPSBmYWxzZSwgcmVxdWlyZVJlc3RhcnQgPSBmYWxzZTtcblx0XHRcdFx0Zm9yIChjb25zdCByIG9mIHJlc3VsdCkge1xuXHRcdFx0XHRcdGlmIChyLnN0YXR1cyA9PT0gJ3JlamVjdGVkJykge1xuXHRcdFx0XHRcdFx0ZXJyb3IgPSBuZXcgRXJyb3Ioci5yZWFzb24pO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJlcXVpcmVSZWxvYWQgPSByZXF1aXJlUmVsb2FkIHx8IHIudmFsdWUucnVudGltZVN0YXRlPy5hY3Rpb24gPT09IEV4dGVuc2lvblJ1bnRpbWVBY3Rpb25UeXBlLlJlbG9hZFdpbmRvdztcblx0XHRcdFx0XHRyZXF1aXJlUmVzdGFydCA9IHJlcXVpcmVSZXN0YXJ0IHx8IHIudmFsdWUucnVudGltZVN0YXRlPy5hY3Rpb24gPT09IEV4dGVuc2lvblJ1bnRpbWVBY3Rpb25UeXBlLlJlc3RhcnRFeHRlbnNpb25zO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlcnJvcikge1xuXHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChyZXF1aXJlUmVsb2FkKSB7XG5cdFx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFx0XHRTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdFx0dnNpeHMubGVuZ3RoID4gMSA/IGxvY2FsaXplKCdJbnN0YWxsVlNJWHMuc3VjY2Vzc1JlbG9hZCcsIFwiQ29tcGxldGVkIGluc3RhbGxpbmcgZXh0ZW5zaW9ucy4gUGxlYXNlIHJlbG9hZCBWaXN1YWwgU3R1ZGlvIENvZGUgdG8gZW5hYmxlIHRoZW0uXCIpXG5cdFx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ0luc3RhbGxWU0lYQWN0aW9uLnN1Y2Nlc3NSZWxvYWQnLCBcIkNvbXBsZXRlZCBpbnN0YWxsaW5nIGV4dGVuc2lvbi4gUGxlYXNlIHJlbG9hZCBWaXN1YWwgU3R1ZGlvIENvZGUgdG8gZW5hYmxlIGl0LlwiKSxcblx0XHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnSW5zdGFsbFZTSVhBY3Rpb24ucmVsb2FkTm93JywgXCJSZWxvYWQgTm93XCIpLFxuXHRcdFx0XHRcdFx0XHRydW46ICgpID0+IGhvc3RTZXJ2aWNlLnJlbG9hZCgpXG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSBpZiAocmVxdWlyZVJlc3RhcnQpIHtcblx0XHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFx0XHRcdFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0XHR2c2l4cy5sZW5ndGggPiAxID8gbG9jYWxpemUoJ0luc3RhbGxWU0lYcy5zdWNjZXNzUmVzdGFydCcsIFwiQ29tcGxldGVkIGluc3RhbGxpbmcgZXh0ZW5zaW9ucy4gUGxlYXNlIHJlc3RhcnQgZXh0ZW5zaW9ucyB0byBlbmFibGUgdGhlbS5cIilcblx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnSW5zdGFsbFZTSVhBY3Rpb24uc3VjY2Vzc1Jlc3RhcnQnLCBcIkNvbXBsZXRlZCBpbnN0YWxsaW5nIGV4dGVuc2lvbi4gUGxlYXNlIHJlc3RhcnQgZXh0ZW5zaW9ucyB0byBlbmFibGUgaXQuXCIpLFxuXHRcdFx0XHRcdFx0W3tcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdJbnN0YWxsVlNJWEFjdGlvbi5yZXN0YXJ0RXh0ZW5zaW9ucycsIFwiUmVzdGFydCBFeHRlbnNpb25zXCIpLFxuXHRcdFx0XHRcdFx0XHRydW46ICgpID0+IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnVwZGF0ZVJ1bm5pbmdFeHRlbnNpb25zKClcblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFx0XHRcdFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0XHR2c2l4cy5sZW5ndGggPiAxID8gbG9jYWxpemUoJ0luc3RhbGxWU0lYcy5zdWNjZXNzTm9SZWxvYWQnLCBcIkNvbXBsZXRlZCBpbnN0YWxsaW5nIGV4dGVuc2lvbnMuXCIpIDogbG9jYWxpemUoJ0luc3RhbGxWU0lYQWN0aW9uLnN1Y2Nlc3NOb1JlbG9hZCcsIFwiQ29tcGxldGVkIGluc3RhbGxpbmcgZXh0ZW5zaW9uLlwiKSxcblx0XHRcdFx0XHRcdFtdXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5pbnN0YWxsRXh0ZW5zaW9uRnJvbUxvY2F0aW9uJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2luc3RhbGxFeHRlbnNpb25Gcm9tTG9jYXRpb24nLCAnSW5zdGFsbCBFeHRlbnNpb24gZnJvbSBMb2NhdGlvbi4uLicpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoQ09OVEVYVF9IQVNfV0VCX1NFUlZFUiwgQ09OVEVYVF9IQVNfTE9DQUxfU0VSVkVSKVxuXHRcdFx0fV0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UpO1xuXHRcdFx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKGMsIGUpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0XHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0XHRcdGNvbnN0IHF1aWNrUGljayA9IGRpc3Bvc2FibGVzLmFkZChxdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2soKSk7XG5cdFx0XHRcdFx0XHRxdWlja1BpY2sudGl0bGUgPSBsb2NhbGl6ZSgnaW5zdGFsbEZyb21Mb2NhdGlvbicsIFwiSW5zdGFsbCBFeHRlbnNpb24gZnJvbSBMb2NhdGlvblwiKTtcblx0XHRcdFx0XHRcdHF1aWNrUGljay5jdXN0b21CdXR0b24gPSB0cnVlO1xuXHRcdFx0XHRcdFx0cXVpY2tQaWNrLmN1c3RvbUxhYmVsID0gbG9jYWxpemUoJ2luc3RhbGwgYnV0dG9uJywgXCJJbnN0YWxsXCIpO1xuXHRcdFx0XHRcdFx0cXVpY2tQaWNrLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ2luc3RhbGxGcm9tTG9jYXRpb25QbGFjZUhvbGRlcicsIFwiTG9jYXRpb24gb2YgdGhlIHdlYiBleHRlbnNpb25cIik7XG5cdFx0XHRcdFx0XHRxdWlja1BpY2suaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50LmFueShxdWlja1BpY2sub25EaWRBY2NlcHQsIHF1aWNrUGljay5vbkRpZEN1c3RvbSkoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdFx0XHRcdFx0XHRpZiAocXVpY2tQaWNrLnZhbHVlKSB7XG5cdFx0XHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0XHRcdGF3YWl0IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxGcm9tTG9jYXRpb24oVVJJLnBhcnNlKHF1aWNrUGljay52YWx1ZSkpO1xuXHRcdFx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRlKGVycm9yKTtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0YygpO1xuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKSk7XG5cdFx0XHRcdFx0XHRxdWlja1BpY2suc2hvdygpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGZpbGVEaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlRGlhbG9nU2VydmljZSk7XG5cdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uTG9jYXRpb24gPSBhd2FpdCBmaWxlRGlhbG9nU2VydmljZS5zaG93T3BlbkRpYWxvZyh7XG5cdFx0XHRcdFx0XHRjYW5TZWxlY3RGb2xkZXJzOiB0cnVlLFxuXHRcdFx0XHRcdFx0Y2FuU2VsZWN0RmlsZXM6IGZhbHNlLFxuXHRcdFx0XHRcdFx0Y2FuU2VsZWN0TWFueTogZmFsc2UsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2luc3RhbGxGcm9tTG9jYXRpb24nLCBcIkluc3RhbGwgRXh0ZW5zaW9uIGZyb20gTG9jYXRpb25cIiksXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0aWYgKGV4dGVuc2lvbkxvY2F0aW9uPy5bMF0pIHtcblx0XHRcdFx0XHRcdGF3YWl0IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxGcm9tTG9jYXRpb24oZXh0ZW5zaW9uTG9jYXRpb25bMF0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKGV4dGVuc2lvbnNTZWFyY2hBY3Rpb25zTWVudSwge1xuXHRcdFx0c3VibWVudTogZXh0ZW5zaW9uc0ZpbHRlclN1Yk1lbnUsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2ZpbHRlckV4dGVuc2lvbnMnLCBcIkZpbHRlciBFeHRlbnNpb25zLi4uXCIpLFxuXHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0aWNvbjogZmlsdGVySWNvbixcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNob3dGZWF0dXJlZEV4dGVuc2lvbnNJZCA9ICdleHRlbnNpb25zLmZpbHRlci5mZWF0dXJlZCc7XG5cdFx0Y29uc3QgZmVhdHVyZXNFeHRlbnNpb25zV2hlbkNvbnRleHQgPSBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9IQVNfR0FMTEVSWSwgQ29udGV4dEtleUV4cHIucmVnZXgoQ09OVEVYVF9HQUxMRVJZX0ZJTFRFUl9DQVBBQklMSVRJRVMua2V5LCBuZXcgUmVnRXhwKGBfJHtGaWx0ZXJUeXBlLkZlYXR1cmVkfV9gKSkpO1xuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6IHNob3dGZWF0dXJlZEV4dGVuc2lvbnNJZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Nob3dGZWF0dXJlZEV4dGVuc2lvbnMnLCAnU2hvdyBGZWF0dXJlZCBFeHRlbnNpb25zJyksXG5cdFx0XHRjYXRlZ29yeTogRXh0ZW5zaW9uc0xvY2FsaXplZExhYmVsLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogZmVhdHVyZXNFeHRlbnNpb25zV2hlbkNvbnRleHRcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IGV4dGVuc2lvbnNGaWx0ZXJTdWJNZW51LFxuXHRcdFx0XHR3aGVuOiBmZWF0dXJlc0V4dGVuc2lvbnNXaGVuQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcxX3ByZWRlZmluZWQnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdH1dLFxuXHRcdFx0bWVudVRpdGxlczoge1xuXHRcdFx0XHRbZXh0ZW5zaW9uc0ZpbHRlclN1Yk1lbnUuaWRdOiBsb2NhbGl6ZSgnZmVhdHVyZWQgZmlsdGVyJywgXCJGZWF0dXJlZFwiKVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKCdAZmVhdHVyZWQgJylcblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uc2hvd1BvcHVsYXJFeHRlbnNpb25zJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Nob3dQb3B1bGFyRXh0ZW5zaW9ucycsICdTaG93IFBvcHVsYXIgRXh0ZW5zaW9ucycpLFxuXHRcdFx0Y2F0ZWdvcnk6IEV4dGVuc2lvbnNMb2NhbGl6ZWRMYWJlbCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENPTlRFWFRfSEFTX0dBTExFUllcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IGV4dGVuc2lvbnNGaWx0ZXJTdWJNZW51LFxuXHRcdFx0XHR3aGVuOiBDT05URVhUX0hBU19HQUxMRVJZLFxuXHRcdFx0XHRncm91cDogJzFfcHJlZGVmaW5lZCcsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0fV0sXG5cdFx0XHRtZW51VGl0bGVzOiB7XG5cdFx0XHRcdFtleHRlbnNpb25zRmlsdGVyU3ViTWVudS5pZF06IGxvY2FsaXplKCdtb3N0IHBvcHVsYXIgZmlsdGVyJywgXCJNb3N0IFBvcHVsYXJcIilcblx0XHRcdH0sXG5cdFx0XHRydW46ICgpID0+IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaCgnQHBvcHVsYXIgJylcblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uc2hvd1JlY29tbWVuZGVkRXh0ZW5zaW9ucycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzaG93UmVjb21tZW5kZWRFeHRlbnNpb25zJywgJ1Nob3cgUmVjb21tZW5kZWQgRXh0ZW5zaW9ucycpLFxuXHRcdFx0Y2F0ZWdvcnk6IEV4dGVuc2lvbnNMb2NhbGl6ZWRMYWJlbCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENPTlRFWFRfSEFTX0dBTExFUllcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IGV4dGVuc2lvbnNGaWx0ZXJTdWJNZW51LFxuXHRcdFx0XHR3aGVuOiBDT05URVhUX0hBU19HQUxMRVJZLFxuXHRcdFx0XHRncm91cDogJzFfcHJlZGVmaW5lZCcsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0fV0sXG5cdFx0XHRtZW51VGl0bGVzOiB7XG5cdFx0XHRcdFtleHRlbnNpb25zRmlsdGVyU3ViTWVudS5pZF06IGxvY2FsaXplKCdtb3N0IHBvcHVsYXIgcmVjb21tZW5kZWQnLCBcIlJlY29tbWVuZGVkXCIpXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW5TZWFyY2goJ0ByZWNvbW1lbmRlZCAnKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5yZWNlbnRseVB1Ymxpc2hlZEV4dGVuc2lvbnMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncmVjZW50bHlQdWJsaXNoZWRFeHRlbnNpb25zJywgJ1Nob3cgUmVjZW50bHkgUHVibGlzaGVkIEV4dGVuc2lvbnMnKSxcblx0XHRcdGNhdGVnb3J5OiBFeHRlbnNpb25zTG9jYWxpemVkTGFiZWwsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDT05URVhUX0hBU19HQUxMRVJZXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBleHRlbnNpb25zRmlsdGVyU3ViTWVudSxcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9IQVNfR0FMTEVSWSxcblx0XHRcdFx0Z3JvdXA6ICcxX3ByZWRlZmluZWQnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdH1dLFxuXHRcdFx0bWVudVRpdGxlczoge1xuXHRcdFx0XHRbZXh0ZW5zaW9uc0ZpbHRlclN1Yk1lbnUuaWRdOiBsb2NhbGl6ZSgncmVjZW50bHkgcHVibGlzaGVkIGZpbHRlcicsIFwiUmVjZW50bHkgUHVibGlzaGVkXCIpXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW5TZWFyY2goJ0ByZWNlbnRseVB1Ymxpc2hlZCAnKVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uc0NhdGVnb3J5RmlsdGVyU3ViTWVudSA9IG5ldyBNZW51SWQoJ2V4dGVuc2lvbnNDYXRlZ29yeUZpbHRlclN1Yk1lbnUnKTtcblx0XHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oZXh0ZW5zaW9uc0ZpbHRlclN1Yk1lbnUsIHtcblx0XHRcdHN1Ym1lbnU6IGV4dGVuc2lvbnNDYXRlZ29yeUZpbHRlclN1Yk1lbnUsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2ZpbHRlciBieSBjYXRlZ29yeScsIFwiQ2F0ZWdvcnlcIiksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9IQVNfR0FMTEVSWSwgQ29udGV4dEtleUV4cHIucmVnZXgoQ09OVEVYVF9HQUxMRVJZX0ZJTFRFUl9DQVBBQklMSVRJRVMua2V5LCBuZXcgUmVnRXhwKGBfJHtGaWx0ZXJUeXBlLkNhdGVnb3J5fV9gKSkpLFxuXHRcdFx0Z3JvdXA6ICcyX2NhdGVnb3JpZXMnLFxuXHRcdFx0b3JkZXI6IDEsXG5cdFx0fSk7XG5cblx0XHRFWFRFTlNJT05fQ0FURUdPUklFUy5mb3JFYWNoKChjYXRlZ29yeSwgaW5kZXgpID0+IHtcblx0XHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0XHRpZDogYGV4dGVuc2lvbnMuYWN0aW9ucy5zZWFyY2hCeUNhdGVnb3J5LiR7Y2F0ZWdvcnl9YCxcblx0XHRcdFx0dGl0bGU6IGNhdGVnb3J5LFxuXHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdGlkOiBleHRlbnNpb25zQ2F0ZWdvcnlGaWx0ZXJTdWJNZW51LFxuXHRcdFx0XHRcdHdoZW46IENPTlRFWFRfSEFTX0dBTExFUlksXG5cdFx0XHRcdFx0b3JkZXI6IGluZGV4LFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW5TZWFyY2goYEBjYXRlZ29yeTpcIiR7Y2F0ZWdvcnkudG9Mb3dlckNhc2UoKX1cImApXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uaW5zdGFsbGVkRXh0ZW5zaW9ucycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnN0YWxsZWRFeHRlbnNpb25zJywgJ1Nob3cgSW5zdGFsbGVkIEV4dGVuc2lvbnMnKSxcblx0XHRcdGNhdGVnb3J5OiBFeHRlbnNpb25zTG9jYWxpemVkTGFiZWwsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBleHRlbnNpb25zRmlsdGVyU3ViTWVudSxcblx0XHRcdFx0Z3JvdXA6ICczX2luc3RhbGxlZCcsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0fV0sXG5cdFx0XHRtZW51VGl0bGVzOiB7XG5cdFx0XHRcdFtleHRlbnNpb25zRmlsdGVyU3ViTWVudS5pZF06IGxvY2FsaXplKCdpbnN0YWxsZWQgZmlsdGVyJywgXCJJbnN0YWxsZWRcIilcblx0XHRcdH0sXG5cdFx0XHRydW46ICgpID0+IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaCgnQGluc3RhbGxlZCAnKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5saXN0QnVpbHRJbkV4dGVuc2lvbnMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2hvd0J1aWx0SW5FeHRlbnNpb25zJywgJ1Nob3cgQnVpbHQtaW4gRXh0ZW5zaW9ucycpLFxuXHRcdFx0Y2F0ZWdvcnk6IEV4dGVuc2lvbnNMb2NhbGl6ZWRMYWJlbCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKENPTlRFWFRfSEFTX0xPQ0FMX1NFUlZFUiwgQ09OVEVYVF9IQVNfUkVNT1RFX1NFUlZFUiwgQ09OVEVYVF9IQVNfV0VCX1NFUlZFUilcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IGV4dGVuc2lvbnNGaWx0ZXJTdWJNZW51LFxuXHRcdFx0XHRncm91cDogJzNfaW5zdGFsbGVkJyxcblx0XHRcdFx0b3JkZXI6IDMsXG5cdFx0XHR9XSxcblx0XHRcdG1lbnVUaXRsZXM6IHtcblx0XHRcdFx0W2V4dGVuc2lvbnNGaWx0ZXJTdWJNZW51LmlkXTogbG9jYWxpemUoJ2J1aWx0aW4gZmlsdGVyJywgXCJCdWlsdC1pblwiKVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKCdAYnVpbHRpbiAnKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5leHRlbnNpb25VcGRhdGVzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2V4dGVuc2lvblVwZGF0ZXMnLCAnU2hvdyBFeHRlbnNpb24gVXBkYXRlcycpLFxuXHRcdFx0Y2F0ZWdvcnk6IEV4dGVuc2lvbnNMb2NhbGl6ZWRMYWJlbCxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9IQVNfR0FMTEVSWSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IGV4dGVuc2lvbnNGaWx0ZXJTdWJNZW51LFxuXHRcdFx0XHRncm91cDogJzNfaW5zdGFsbGVkJyxcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9IQVNfR0FMTEVSWSxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHR9XSxcblx0XHRcdG1lbnVUaXRsZXM6IHtcblx0XHRcdFx0W2V4dGVuc2lvbnNGaWx0ZXJTdWJNZW51LmlkXTogbG9jYWxpemUoJ2V4dGVuc2lvbiB1cGRhdGVzIGZpbHRlcicsIFwiVXBkYXRlc1wiKVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKCdAdXBkYXRlcycpXG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiBMSVNUX1dPUktTUEFDRV9VTlNVUFBPUlRFRF9FWFRFTlNJT05TX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzaG93V29ya3NwYWNlVW5zdXBwb3J0ZWRFeHRlbnNpb25zJywgJ1Nob3cgRXh0ZW5zaW9ucyBVbnN1cHBvcnRlZCBCeSBXb3Jrc3BhY2UnKSxcblx0XHRcdGNhdGVnb3J5OiBFeHRlbnNpb25zTG9jYWxpemVkTGFiZWwsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihDT05URVhUX0hBU19MT0NBTF9TRVJWRVIsIENPTlRFWFRfSEFTX1JFTU9URV9TRVJWRVIpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogZXh0ZW5zaW9uc0ZpbHRlclN1Yk1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnM19pbnN0YWxsZWQnLFxuXHRcdFx0XHRvcmRlcjogNixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoQ09OVEVYVF9IQVNfTE9DQUxfU0VSVkVSLCBDT05URVhUX0hBU19SRU1PVEVfU0VSVkVSKSxcblx0XHRcdH1dLFxuXHRcdFx0bWVudVRpdGxlczoge1xuXHRcdFx0XHRbZXh0ZW5zaW9uc0ZpbHRlclN1Yk1lbnUuaWRdOiBsb2NhbGl6ZSgnd29ya3NwYWNlIHVuc3VwcG9ydGVkIGZpbHRlcicsIFwiV29ya3NwYWNlIFVuc3VwcG9ydGVkXCIpXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW5TZWFyY2goJ0B3b3Jrc3BhY2VVbnN1cHBvcnRlZCcpXG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnNob3dFbmFibGVkRXh0ZW5zaW9ucycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzaG93RW5hYmxlZEV4dGVuc2lvbnMnLCAnU2hvdyBFbmFibGVkIEV4dGVuc2lvbnMnKSxcblx0XHRcdGNhdGVnb3J5OiBFeHRlbnNpb25zTG9jYWxpemVkTGFiZWwsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihDT05URVhUX0hBU19MT0NBTF9TRVJWRVIsIENPTlRFWFRfSEFTX1JFTU9URV9TRVJWRVIsIENPTlRFWFRfSEFTX1dFQl9TRVJWRVIpXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBleHRlbnNpb25zRmlsdGVyU3ViTWVudSxcblx0XHRcdFx0Z3JvdXA6ICczX2luc3RhbGxlZCcsXG5cdFx0XHRcdG9yZGVyOiA0LFxuXHRcdFx0fV0sXG5cdFx0XHRtZW51VGl0bGVzOiB7XG5cdFx0XHRcdFtleHRlbnNpb25zRmlsdGVyU3ViTWVudS5pZF06IGxvY2FsaXplKCdlbmFibGVkIGZpbHRlcicsIFwiRW5hYmxlZFwiKVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKCdAZW5hYmxlZCAnKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5zaG93RGlzYWJsZWRFeHRlbnNpb25zJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Nob3dEaXNhYmxlZEV4dGVuc2lvbnMnLCAnU2hvdyBEaXNhYmxlZCBFeHRlbnNpb25zJyksXG5cdFx0XHRjYXRlZ29yeTogRXh0ZW5zaW9uc0xvY2FsaXplZExhYmVsLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoQ09OVEVYVF9IQVNfTE9DQUxfU0VSVkVSLCBDT05URVhUX0hBU19SRU1PVEVfU0VSVkVSLCBDT05URVhUX0hBU19XRUJfU0VSVkVSKVxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogZXh0ZW5zaW9uc0ZpbHRlclN1Yk1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnM19pbnN0YWxsZWQnLFxuXHRcdFx0XHRvcmRlcjogNSxcblx0XHRcdH1dLFxuXHRcdFx0bWVudVRpdGxlczoge1xuXHRcdFx0XHRbZXh0ZW5zaW9uc0ZpbHRlclN1Yk1lbnUuaWRdOiBsb2NhbGl6ZSgnZGlzYWJsZWQgZmlsdGVyJywgXCJEaXNhYmxlZFwiKVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKCdAZGlzYWJsZWQgJylcblx0XHR9KTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbnNTb3J0U3ViTWVudSA9IG5ldyBNZW51SWQoJ2V4dGVuc2lvbnNTb3J0U3ViTWVudScpO1xuXHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShleHRlbnNpb25zRmlsdGVyU3ViTWVudSwge1xuXHRcdFx0c3VibWVudTogZXh0ZW5zaW9uc1NvcnRTdWJNZW51LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzb3J0eSBieScsIFwiU29ydCBCeVwiKSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5vcihDT05URVhUX0hBU19HQUxMRVJZLCBEZWZhdWx0Vmlld3NDb250ZXh0KSksXG5cdFx0XHRncm91cDogJzRfc29ydCcsXG5cdFx0XHRvcmRlcjogMSxcblx0XHR9KTtcblxuXHRcdFtcblx0XHRcdHsgaWQ6ICdpbnN0YWxscycsIHRpdGxlOiBsb2NhbGl6ZSgnc29ydCBieSBpbnN0YWxscycsIFwiSW5zdGFsbCBDb3VudFwiKSwgcHJlY29uZGl0aW9uOiBCdWlsdEluRXh0ZW5zaW9uc0NvbnRleHQubmVnYXRlKCksIHNvcnRDYXBhYmlsaXR5OiBTb3J0QnkuSW5zdGFsbENvdW50IH0sXG5cdFx0XHR7IGlkOiAncmF0aW5nJywgdGl0bGU6IGxvY2FsaXplKCdzb3J0IGJ5IHJhdGluZycsIFwiUmF0aW5nXCIpLCBwcmVjb25kaXRpb246IEJ1aWx0SW5FeHRlbnNpb25zQ29udGV4dC5uZWdhdGUoKSwgc29ydENhcGFiaWxpdHk6IFNvcnRCeS5XZWlnaHRlZFJhdGluZyB9LFxuXHRcdFx0eyBpZDogJ25hbWUnLCB0aXRsZTogbG9jYWxpemUoJ3NvcnQgYnkgbmFtZScsIFwiTmFtZVwiKSwgcHJlY29uZGl0aW9uOiBCdWlsdEluRXh0ZW5zaW9uc0NvbnRleHQubmVnYXRlKCksIHNvcnRDYXBhYmlsaXR5OiBTb3J0QnkuVGl0bGUgfSxcblx0XHRcdHsgaWQ6ICdwdWJsaXNoZWREYXRlJywgdGl0bGU6IGxvY2FsaXplKCdzb3J0IGJ5IHB1Ymxpc2hlZCBkYXRlJywgXCJQdWJsaXNoZWQgRGF0ZVwiKSwgcHJlY29uZGl0aW9uOiBCdWlsdEluRXh0ZW5zaW9uc0NvbnRleHQubmVnYXRlKCksIHNvcnRDYXBhYmlsaXR5OiBTb3J0QnkuUHVibGlzaGVkRGF0ZSB9LFxuXHRcdFx0eyBpZDogJ3VwZGF0ZURhdGUnLCB0aXRsZTogbG9jYWxpemUoJ3NvcnQgYnkgdXBkYXRlIGRhdGUnLCBcIlVwZGF0ZWQgRGF0ZVwiKSwgcHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoU2VhcmNoTWFya2V0cGxhY2VFeHRlbnNpb25zQ29udGV4dC5uZWdhdGUoKSwgUmVjb21tZW5kZWRFeHRlbnNpb25zQ29udGV4dC5uZWdhdGUoKSwgQnVpbHRJbkV4dGVuc2lvbnNDb250ZXh0Lm5lZ2F0ZSgpKSwgc29ydENhcGFiaWxpdHk6ICdVcGRhdGVEYXRlJyB9LFxuXHRcdF0ubWFwKCh7IGlkLCB0aXRsZSwgcHJlY29uZGl0aW9uLCBzb3J0Q2FwYWJpbGl0eSB9LCBpbmRleCkgPT4ge1xuXHRcdFx0Y29uc3Qgc29ydENhcGFiaWxpdHlDb250ZXh0ID0gQ29udGV4dEtleUV4cHIucmVnZXgoQ09OVEVYVF9HQUxMRVJZX1NPUlRfQ0FQQUJJTElUSUVTLmtleSwgbmV3IFJlZ0V4cChgXyR7c29ydENhcGFiaWxpdHl9X2ApKTtcblx0XHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0XHRpZDogYGV4dGVuc2lvbnMuc29ydC4ke2lkfWAsXG5cdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChwcmVjb25kaXRpb24sIENvbnRleHRLZXlFeHByLnJlZ2V4KEV4dGVuc2lvbnNTZWFyY2hWYWx1ZUNvbnRleHQua2V5LCAvXkBjb250cmlidXRlOi8pLm5lZ2F0ZSgpLCBzb3J0Q2FwYWJpbGl0eUNvbnRleHQpLFxuXHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdGlkOiBleHRlbnNpb25zU29ydFN1Yk1lbnUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLm9yKENPTlRFWFRfSEFTX0dBTExFUlksIERlZmF1bHRWaWV3c0NvbnRleHQpLCBzb3J0Q2FwYWJpbGl0eUNvbnRleHQpLFxuXHRcdFx0XHRcdG9yZGVyOiBpbmRleCxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdHRvZ2dsZWQ6IEV4dGVuc2lvbnNTb3J0QnlDb250ZXh0LmlzRXF1YWxUbyhpZCksXG5cdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbnNWaWV3UGFuZUNvbnRhaW5lciA9ICgoYXdhaXQgdGhpcy52aWV3c1NlcnZpY2Uub3BlblZpZXdDb250YWluZXIoVklFV0xFVF9JRCwgdHJ1ZSkpPy5nZXRWaWV3UGFuZUNvbnRhaW5lcigpKSBhcyBJRXh0ZW5zaW9uc1ZpZXdQYW5lQ29udGFpbmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRRdWVyeSA9IFF1ZXJ5LnBhcnNlKGV4dGVuc2lvbnNWaWV3UGFuZUNvbnRhaW5lcj8uc2VhcmNoVmFsdWUgPz8gJycpO1xuXHRcdFx0XHRcdGV4dGVuc2lvbnNWaWV3UGFuZUNvbnRhaW5lcj8uc2VhcmNoKG5ldyBRdWVyeShjdXJyZW50UXVlcnkudmFsdWUsIGlkKS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRleHRlbnNpb25zVmlld1BhbmVDb250YWluZXI/LmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5jbGVhckV4dGVuc2lvbnNTZWFyY2hSZXN1bHRzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NsZWFyRXh0ZW5zaW9uc1NlYXJjaFJlc3VsdHMnLCAnQ2xlYXIgRXh0ZW5zaW9ucyBTZWFyY2ggUmVzdWx0cycpLFxuXHRcdFx0Y2F0ZWdvcnk6IEV4dGVuc2lvbnNMb2NhbGl6ZWRMYWJlbCxcblx0XHRcdGljb246IGNsZWFyU2VhcmNoUmVzdWx0c0ljb24sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogU2VhcmNoSGFzVGV4dENvbnRleHQsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBleHRlbnNpb25zU2VhcmNoQWN0aW9uc01lbnUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0fSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHZpZXdQYW5lQ29udGFpbmVyID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpLmdldEFjdGl2ZVZpZXdQYW5lQ29udGFpbmVyV2l0aElkKFZJRVdMRVRfSUQpO1xuXHRcdFx0XHRpZiAodmlld1BhbmVDb250YWluZXIpIHtcblx0XHRcdFx0XHRjb25zdCBleHRlbnNpb25zVmlld1BhbmVDb250YWluZXIgPSB2aWV3UGFuZUNvbnRhaW5lciBhcyBJRXh0ZW5zaW9uc1ZpZXdQYW5lQ29udGFpbmVyO1xuXHRcdFx0XHRcdGV4dGVuc2lvbnNWaWV3UGFuZUNvbnRhaW5lci5zZWFyY2goJycpO1xuXHRcdFx0XHRcdGV4dGVuc2lvbnNWaWV3UGFuZUNvbnRhaW5lci5mb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnJlZnJlc2hFeHRlbnNpb24nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncmVmcmVzaEV4dGVuc2lvbicsICdSZWZyZXNoJyksXG5cdFx0XHRjYXRlZ29yeTogRXh0ZW5zaW9uc0xvY2FsaXplZExhYmVsLFxuXHRcdFx0aWNvbjogcmVmcmVzaEljb24sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3Q29udGFpbmVyVGl0bGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlld0NvbnRhaW5lcicsIFZJRVdMRVRfSUQpLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0fSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHZpZXdQYW5lQ29udGFpbmVyID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpLmdldEFjdGl2ZVZpZXdQYW5lQ29udGFpbmVyV2l0aElkKFZJRVdMRVRfSUQpO1xuXHRcdFx0XHRpZiAodmlld1BhbmVDb250YWluZXIpIHtcblx0XHRcdFx0XHRhd2FpdCAodmlld1BhbmVDb250YWluZXIgYXMgSUV4dGVuc2lvbnNWaWV3UGFuZUNvbnRhaW5lcikucmVmcmVzaCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmluc3RhbGxXb3Jrc3BhY2VSZWNvbW1lbmRlZEV4dGVuc2lvbnMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdpbnN0YWxsV29ya3NwYWNlUmVjb21tZW5kZWRFeHRlbnNpb25zJywgXCJJbnN0YWxsIFdvcmtzcGFjZSBSZWNvbW1lbmRlZCBFeHRlbnNpb25zXCIpLFxuXHRcdFx0aWNvbjogaW5zdGFsbFdvcmtzcGFjZVJlY29tbWVuZGVkSWNvbixcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFdPUktTUEFDRV9SRUNPTU1FTkRBVElPTlNfVklFV19JRCksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHtcblx0XHRcdFx0Y29uc3QgdmlldyA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKS5nZXRBY3RpdmVWaWV3V2l0aElkKFdPUktTUEFDRV9SRUNPTU1FTkRBVElPTlNfVklFV19JRCkgYXMgSVdvcmtzcGFjZVJlY29tbWVuZGVkRXh0ZW5zaW9uc1ZpZXc7XG5cdFx0XHRcdHJldHVybiB2aWV3Lmluc3RhbGxXb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnMoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6IENvbmZpZ3VyZVdvcmtzcGFjZUZvbGRlclJlY29tbWVuZGVkRXh0ZW5zaW9uc0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBDb25maWd1cmVXb3Jrc3BhY2VGb2xkZXJSZWNvbW1lbmRlZEV4dGVuc2lvbnNBY3Rpb24uTEFCRUwsXG5cdFx0XHRpY29uOiBjb25maWd1cmVSZWNvbW1lbmRlZEljb24sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBXb3JrYmVuY2hTdGF0ZUNvbnRleHQubm90RXF1YWxzVG8oJ2VtcHR5JyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBXT1JLU1BBQ0VfUkVDT01NRU5EQVRJT05TX1ZJRVdfSUQpLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0fV0sXG5cdFx0XHRydW46ICgpID0+IHJ1bkFjdGlvbih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbmZpZ3VyZVdvcmtzcGFjZUZvbGRlclJlY29tbWVuZGVkRXh0ZW5zaW9uc0FjdGlvbiwgQ29uZmlndXJlV29ya3NwYWNlRm9sZGVyUmVjb21tZW5kZWRFeHRlbnNpb25zQWN0aW9uLklELCBDb25maWd1cmVXb3Jrc3BhY2VGb2xkZXJSZWNvbW1lbmRlZEV4dGVuc2lvbnNBY3Rpb24uTEFCRUwpKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogSW5zdGFsbFNwZWNpZmljVmVyc2lvbk9mRXh0ZW5zaW9uQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IHsgdmFsdWU6IEluc3RhbGxTcGVjaWZpY1ZlcnNpb25PZkV4dGVuc2lvbkFjdGlvbi5MQUJFTCwgb3JpZ2luYWw6ICdJbnN0YWxsIFNwZWNpZmljIFZlcnNpb24gb2YgRXh0ZW5zaW9uLi4uJyB9LFxuXHRcdFx0Y2F0ZWdvcnk6IEV4dGVuc2lvbnNMb2NhbGl6ZWRMYWJlbCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfSEFTX0dBTExFUlksIENvbnRleHRLZXlFeHByLm9yKENPTlRFWFRfSEFTX0xPQ0FMX1NFUlZFUiwgQ09OVEVYVF9IQVNfUkVNT1RFX1NFUlZFUiwgQ09OVEVYVF9IQVNfV0VCX1NFUlZFUikpXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiAoKSA9PiBydW5BY3Rpb24odGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsU3BlY2lmaWNWZXJzaW9uT2ZFeHRlbnNpb25BY3Rpb24sIEluc3RhbGxTcGVjaWZpY1ZlcnNpb25PZkV4dGVuc2lvbkFjdGlvbi5JRCwgSW5zdGFsbFNwZWNpZmljVmVyc2lvbk9mRXh0ZW5zaW9uQWN0aW9uLkxBQkVMKSlcblx0XHR9KTtcblx0fVxuXG5cdC8vIEV4dGVuc2lvbiBDb250ZXh0IE1lbnVcblx0cHJpdmF0ZSByZWdpc3RlckNvbnRleHRNZW51QWN0aW9ucygpOiB2b2lkIHtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6IFNldENvbG9yVGhlbWVBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogU2V0Q29sb3JUaGVtZUFjdGlvbi5USVRMRSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHRlbnNpb25Db250ZXh0LFxuXHRcdFx0XHRncm91cDogVEhFTUVfQUNUSU9OU19HUk9VUCxcblx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5ub3QoJ2luRXh0ZW5zaW9uRWRpdG9yJyksIENvbnRleHRLZXlFeHByLmVxdWFscygnZXh0ZW5zaW9uU3RhdHVzJywgJ2luc3RhbGxlZCcpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2V4dGVuc2lvbkhhc0NvbG9yVGhlbWVzJykpXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGV4dGVuc2lvbklkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSBleHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHsgaWQ6IGV4dGVuc2lvbklkIH0pKTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldENvbG9yVGhlbWVBY3Rpb24pO1xuXHRcdFx0XHRcdGFjdGlvbi5leHRlbnNpb24gPSBleHRlbnNpb247XG5cdFx0XHRcdFx0cmV0dXJuIHJ1bkFjdGlvbihhY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiBTZXRGaWxlSWNvblRoZW1lQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IFNldEZpbGVJY29uVGhlbWVBY3Rpb24uVElUTEUsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXh0ZW5zaW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6IFRIRU1FX0FDVElPTlNfR1JPVVAsXG5cdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIubm90KCdpbkV4dGVuc2lvbkVkaXRvcicpLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2V4dGVuc2lvblN0YXR1cycsICdpbnN0YWxsZWQnKSwgQ29udGV4dEtleUV4cHIuaGFzKCdleHRlbnNpb25IYXNGaWxlSWNvblRoZW1lcycpKVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBleHRlbnNpb25JZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZS5sb2NhbC5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCB7IGlkOiBleHRlbnNpb25JZCB9KSk7XG5cdFx0XHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdFx0XHRjb25zdCBhY3Rpb24gPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXRGaWxlSWNvblRoZW1lQWN0aW9uKTtcblx0XHRcdFx0XHRhY3Rpb24uZXh0ZW5zaW9uID0gZXh0ZW5zaW9uO1xuXHRcdFx0XHRcdHJldHVybiBydW5BY3Rpb24oYWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogU2V0UHJvZHVjdEljb25UaGVtZUFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBTZXRQcm9kdWN0SWNvblRoZW1lQWN0aW9uLlRJVExFLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkV4dGVuc2lvbkNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiBUSEVNRV9BQ1RJT05TX0dST1VQLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLm5vdCgnaW5FeHRlbnNpb25FZGl0b3InKSwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCdleHRlbnNpb25TdGF0dXMnLCAnaW5zdGFsbGVkJyksIENvbnRleHRLZXlFeHByLmhhcygnZXh0ZW5zaW9uSGFzUHJvZHVjdEljb25UaGVtZXMnKSlcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZXh0ZW5zaW9uSWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IGV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmluZChlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgeyBpZDogZXh0ZW5zaW9uSWQgfSkpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aW9uID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0UHJvZHVjdEljb25UaGVtZUFjdGlvbik7XG5cdFx0XHRcdFx0YWN0aW9uLmV4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHRcdFx0XHRyZXR1cm4gcnVuQWN0aW9uKGFjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uc2hvd1ByZVJlbGVhc2VWZXJzaW9uJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Nob3cgcHJlLXJlbGVhc2UgdmVyc2lvbicsICdTaG93IFByZS1SZWxlYXNlIFZlcnNpb24nKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHRlbnNpb25Db250ZXh0LFxuXHRcdFx0XHRncm91cDogSU5TVEFMTF9BQ1RJT05TX0dST1VQLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmhhcygnaW5FeHRlbnNpb25FZGl0b3InKSwgQ29udGV4dEtleUV4cHIuaGFzKCdnYWxsZXJ5RXh0ZW5zaW9uSGFzUHJlUmVsZWFzZVZlcnNpb24nKSwgQ29udGV4dEtleUV4cHIuaGFzKCdpc1ByZVJlbGVhc2VFeHRlbnNpb25BbGxvd2VkJyksIENvbnRleHRLZXlFeHByLm5vdCgnc2hvd1ByZVJlbGVhc2VWZXJzaW9uJyksIENvbnRleHRLZXlFeHByLm5vdCgnaXNCdWlsdGluRXh0ZW5zaW9uJykpXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGV4dGVuc2lvbklkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSAoYXdhaXQgZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZS5nZXRFeHRlbnNpb25zKFt7IGlkOiBleHRlbnNpb25JZCB9XSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpWzBdO1xuXHRcdFx0XHRleHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlLm9wZW4oZXh0ZW5zaW9uLCB7IHNob3dQcmVSZWxlYXNlVmVyc2lvbjogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uc2hvd1JlbGVhc2VkVmVyc2lvbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzaG93IHJlbGVhc2VkIHZlcnNpb24nLCAnU2hvdyBSZWxlYXNlIFZlcnNpb24nKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHRlbnNpb25Db250ZXh0LFxuXHRcdFx0XHRncm91cDogSU5TVEFMTF9BQ1RJT05TX0dST1VQLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmhhcygnaW5FeHRlbnNpb25FZGl0b3InKSwgQ29udGV4dEtleUV4cHIuaGFzKCdnYWxsZXJ5RXh0ZW5zaW9uSGFzUHJlUmVsZWFzZVZlcnNpb24nKSwgQ29udGV4dEtleUV4cHIuaGFzKCdleHRlbnNpb25IYXNSZWxlYXNlVmVyc2lvbicpLCBDb250ZXh0S2V5RXhwci5oYXMoJ3Nob3dQcmVSZWxlYXNlVmVyc2lvbicpLCBDb250ZXh0S2V5RXhwci5ub3QoJ2lzQnVpbHRpbkV4dGVuc2lvbicpKVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBleHRlbnNpb25JZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gKGF3YWl0IGV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhbeyBpZDogZXh0ZW5zaW9uSWQgfV0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKVswXTtcblx0XHRcdFx0ZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZS5vcGVuKGV4dGVuc2lvbiwgeyBzaG93UHJlUmVsZWFzZVZlcnNpb246IGZhbHNlIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogVG9nZ2xlQXV0b1VwZGF0ZUZvckV4dGVuc2lvbkFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBUb2dnbGVBdXRvVXBkYXRlRm9yRXh0ZW5zaW9uQWN0aW9uLkxBQkVMLFxuXHRcdFx0Y2F0ZWdvcnk6IEV4dGVuc2lvbnNMb2NhbGl6ZWRMYWJlbCxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLm9yKENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhgY29uZmlnLiR7QXV0b1VwZGF0ZUNvbmZpZ3VyYXRpb25LZXl9YCwgJ29uJyksIENvbnRleHRLZXlFeHByLmVxdWFscygnaXNFeHRlbnNpb25FbmFibGVkJywgdHJ1ZSkpLCBDb250ZXh0S2V5RXhwci5ub3QoJ2V4dGVuc2lvbkRpc2FsbG93SW5zdGFsbCcpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2lzRXh0ZW5zaW9uQWxsb3dlZCcpKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHRlbnNpb25Db250ZXh0LFxuXHRcdFx0XHRncm91cDogVVBEQVRFX0FDVElPTlNfR1JPVVAsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIubm90KCdpbkV4dGVuc2lvbkVkaXRvcicpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnZXh0ZW5zaW9uU3RhdHVzJywgJ2luc3RhbGxlZCcpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm5vdCgnaXNCdWlsdGluRXh0ZW5zaW9uJyksXG5cdFx0XHRcdClcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IGV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmluZChlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgeyBpZCB9KSk7XG5cdFx0XHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdFx0XHRjb25zdCBhY3Rpb24gPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUb2dnbGVBdXRvVXBkYXRlRm9yRXh0ZW5zaW9uQWN0aW9uKTtcblx0XHRcdFx0XHRhY3Rpb24uZXh0ZW5zaW9uID0gZXh0ZW5zaW9uO1xuXHRcdFx0XHRcdHJldHVybiBydW5BY3Rpb24oYWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogVG9nZ2xlQXV0b1VwZGF0ZXNGb3JQdWJsaXNoZXJBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogeyB2YWx1ZTogVG9nZ2xlQXV0b1VwZGF0ZXNGb3JQdWJsaXNoZXJBY3Rpb24uTEFCRUwsIG9yaWdpbmFsOiAnQXV0byBVcGRhdGUgKFB1Ymxpc2hlciknIH0sXG5cdFx0XHRjYXRlZ29yeTogRXh0ZW5zaW9uc0xvY2FsaXplZExhYmVsLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0F1dG9VcGRhdGVDb25maWd1cmF0aW9uS2V5fWAsICdvZmYnKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHRlbnNpb25Db250ZXh0LFxuXHRcdFx0XHRncm91cDogVVBEQVRFX0FDVElPTlNfR1JPVVAsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCdleHRlbnNpb25TdGF0dXMnLCAnaW5zdGFsbGVkJyksIENvbnRleHRLZXlFeHByLm5vdCgnaXNCdWlsdGluRXh0ZW5zaW9uJykpXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGlkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSBleHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHsgaWQgfSkpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aW9uID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVG9nZ2xlQXV0b1VwZGF0ZXNGb3JQdWJsaXNoZXJBY3Rpb24pO1xuXHRcdFx0XHRcdGFjdGlvbi5leHRlbnNpb24gPSBleHRlbnNpb247XG5cdFx0XHRcdFx0cmV0dXJuIHJ1bkFjdGlvbihhY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnN3aXRjaFRvUHJlUmxlYXNlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZW5hYmxlUHJlUmxlYXNlTGFiZWwnLCBcIlN3aXRjaCB0byBQcmUtUmVsZWFzZSBWZXJzaW9uXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IEV4dGVuc2lvbnNMb2NhbGl6ZWRMYWJlbCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHRlbnNpb25Db250ZXh0LFxuXHRcdFx0XHRncm91cDogSU5TVEFMTF9BQ1RJT05TX0dST1VQLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfSEFTX0dBTExFUlksIENvbnRleHRLZXlFeHByLmhhcygnZ2FsbGVyeUV4dGVuc2lvbkhhc1ByZVJlbGVhc2VWZXJzaW9uJyksIENvbnRleHRLZXlFeHByLmhhcygnaXNQcmVSZWxlYXNlRXh0ZW5zaW9uQWxsb3dlZCcpLCBDb250ZXh0S2V5RXhwci5ub3QoJ2luc3RhbGxlZEV4dGVuc2lvbklzT3B0ZWRUb1ByZVJlbGVhc2UnKSwgQ29udGV4dEtleUV4cHIubm90KCdpbkV4dGVuc2lvbkVkaXRvcicpLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2V4dGVuc2lvblN0YXR1cycsICdpbnN0YWxsZWQnKSwgQ29udGV4dEtleUV4cHIubm90KCdpc0J1aWx0aW5FeHRlbnNpb24nKSlcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IGV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmluZChlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgeyBpZCB9KSk7XG5cdFx0XHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdFx0XHRjb25zdCBhY3Rpb24gPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUb2dnbGVQcmVSZWxlYXNlRXh0ZW5zaW9uQWN0aW9uKTtcblx0XHRcdFx0XHRhY3Rpb24uZXh0ZW5zaW9uID0gZXh0ZW5zaW9uO1xuXHRcdFx0XHRcdHJldHVybiBydW5BY3Rpb24oYWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5zd2l0Y2hUb1JlbGVhc2UnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdkaXNhYmxlUHJlUmxlYXNlTGFiZWwnLCBcIlN3aXRjaCB0byBSZWxlYXNlIFZlcnNpb25cIiksXG5cdFx0XHRjYXRlZ29yeTogRXh0ZW5zaW9uc0xvY2FsaXplZExhYmVsLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkV4dGVuc2lvbkNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiBJTlNUQUxMX0FDVElPTlNfR1JPVVAsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9IQVNfR0FMTEVSWSwgQ29udGV4dEtleUV4cHIuaGFzKCdnYWxsZXJ5RXh0ZW5zaW9uSGFzUHJlUmVsZWFzZVZlcnNpb24nKSwgQ29udGV4dEtleUV4cHIuaGFzKCdpc0V4dGVuc2lvbkFsbG93ZWQnKSwgQ29udGV4dEtleUV4cHIuaGFzKCdpbnN0YWxsZWRFeHRlbnNpb25Jc09wdGVkVG9QcmVSZWxlYXNlJyksIENvbnRleHRLZXlFeHByLm5vdCgnaW5FeHRlbnNpb25FZGl0b3InKSwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCdleHRlbnNpb25TdGF0dXMnLCAnaW5zdGFsbGVkJyksIENvbnRleHRLZXlFeHByLm5vdCgnaXNCdWlsdGluRXh0ZW5zaW9uJykpXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGlkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSBleHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHsgaWQgfSkpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aW9uID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVG9nZ2xlUHJlUmVsZWFzZUV4dGVuc2lvbkFjdGlvbik7XG5cdFx0XHRcdFx0YWN0aW9uLmV4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHRcdFx0XHRyZXR1cm4gcnVuQWN0aW9uKGFjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6IENsZWFyTGFuZ3VhZ2VBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogQ2xlYXJMYW5ndWFnZUFjdGlvbi5USVRMRSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHRlbnNpb25Db250ZXh0LFxuXHRcdFx0XHRncm91cDogSU5TVEFMTF9BQ1RJT05TX0dST1VQLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLm5vdCgnaW5FeHRlbnNpb25FZGl0b3InKSwgQ29udGV4dEtleUV4cHIuaGFzKCdjYW5TZXRMYW5ndWFnZScpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2lzQWN0aXZlTGFuZ3VhZ2VQYWNrRXh0ZW5zaW9uJykpXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGV4dGVuc2lvbklkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gKGF3YWl0IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmdldEV4dGVuc2lvbnMoW3sgaWQ6IGV4dGVuc2lvbklkIH1dLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSlbMF07XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENsZWFyTGFuZ3VhZ2VBY3Rpb24pO1xuXHRcdFx0XHRhY3Rpb24uZXh0ZW5zaW9uID0gZXh0ZW5zaW9uO1xuXHRcdFx0XHRyZXR1cm4gcnVuQWN0aW9uKGFjdGlvbik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmluc3RhbGxVbnNpZ25lZCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2luc3RhbGwnLCBcIkluc3RhbGxcIiksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXh0ZW5zaW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcwX2luc3RhbGwnLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCdleHRlbnNpb25TdGF0dXMnLCAndW5pbnN0YWxsZWQnKSwgQ29udGV4dEtleUV4cHIuaGFzKCdpc0dhbGxlcnlFeHRlbnNpb24nKSwgQ29udGV4dEtleUV4cHIubm90KCdleHRlbnNpb25EaXNhbGxvd0luc3RhbGwnKSwgQ29udGV4dEtleUV4cHIuaGFzKCdleHRlbnNpb25Jc1Vuc2lnbmVkJyksXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfR0FMTEVSWV9BTExfUFVCTElDX1JFUE9TSVRPUllfU0lHTkVELCBDb250ZXh0S2V5RXhwci5ub3QoJ2V4dGVuc2lvbklzUHJpdmF0ZScpKSwgQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfR0FMTEVSWV9BTExfUFJJVkFURV9SRVBPU0lUT1JZX1NJR05FRCwgQ29udGV4dEtleUV4cHIuaGFzKCdleHRlbnNpb25Jc1ByaXZhdGUnKSkpKSxcblx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZXh0ZW5zaW9uSWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbHRlcihlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgeyBpZDogZXh0ZW5zaW9uSWQgfSkpWzBdXG5cdFx0XHRcdFx0fHwgKGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhbeyBpZDogZXh0ZW5zaW9uSWQgfV0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKVswXTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxBY3Rpb24sIHsgaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uOiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnByZWZlclByZVJlbGVhc2VzIH0pO1xuXHRcdFx0XHRcdGFjdGlvbi5leHRlbnNpb24gPSBleHRlbnNpb247XG5cdFx0XHRcdFx0cmV0dXJuIHJ1bkFjdGlvbihhY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmluc3RhbGxBbmREb25vdFN5bmMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdpbnN0YWxsIGluc3RhbGxBbmREb25vdFN5bmMnLCBcIkluc3RhbGwgKERvIG5vdCBTeW5jKVwiKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHRlbnNpb25Db250ZXh0LFxuXHRcdFx0XHRncm91cDogJzBfaW5zdGFsbCcsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2V4dGVuc2lvblN0YXR1cycsICd1bmluc3RhbGxlZCcpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2lzR2FsbGVyeUV4dGVuc2lvbicpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2lzRXh0ZW5zaW9uQWxsb3dlZCcpLCBDb250ZXh0S2V5RXhwci5ub3QoJ2V4dGVuc2lvbkRpc2FsbG93SW5zdGFsbCcpLCBDT05URVhUX1NZTkNfRU5BQkxFTUVOVCksXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGV4dGVuc2lvbklkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5sb2NhbC5maWx0ZXIoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHsgaWQ6IGV4dGVuc2lvbklkIH0pKVswXVxuXHRcdFx0XHRcdHx8IChhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmdldEV4dGVuc2lvbnMoW3sgaWQ6IGV4dGVuc2lvbklkIH1dLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSlbMF07XG5cdFx0XHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdFx0XHRjb25zdCBhY3Rpb24gPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsQWN0aW9uLCB7XG5cdFx0XHRcdFx0XHRpbnN0YWxsUHJlUmVsZWFzZVZlcnNpb246IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UucHJlZmVyUHJlUmVsZWFzZXMsXG5cdFx0XHRcdFx0XHRpc01hY2hpbmVTY29wZWQ6IHRydWUsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0YWN0aW9uLmV4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHRcdFx0XHRyZXR1cm4gcnVuQWN0aW9uKGFjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uaW5zdGFsbFByZXJlbGVhc2VBbmREb25vdFN5bmMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdpbnN0YWxsUHJlcmVsZWFzZUFuZERvbm90U3luYycsIFwiSW5zdGFsbCBQcmUtUmVsZWFzZSAoRG8gbm90IFN5bmMpXCIpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkV4dGVuc2lvbkNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMF9pbnN0YWxsJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygnZXh0ZW5zaW9uU3RhdHVzJywgJ3VuaW5zdGFsbGVkJyksIENvbnRleHRLZXlFeHByLmhhcygnaXNHYWxsZXJ5RXh0ZW5zaW9uJyksIENvbnRleHRLZXlFeHByLmhhcygnZXh0ZW5zaW9uSGFzUHJlUmVsZWFzZVZlcnNpb24nKSwgQ29udGV4dEtleUV4cHIuaGFzKCdpc1ByZVJlbGVhc2VFeHRlbnNpb25BbGxvd2VkJyksIENvbnRleHRLZXlFeHByLm5vdCgnZXh0ZW5zaW9uRGlzYWxsb3dJbnN0YWxsJyksIENPTlRFWFRfU1lOQ19FTkFCTEVNRU5UKSxcblx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZXh0ZW5zaW9uSWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbHRlcihlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgeyBpZDogZXh0ZW5zaW9uSWQgfSkpWzBdXG5cdFx0XHRcdFx0fHwgKGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhbeyBpZDogZXh0ZW5zaW9uSWQgfV0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKVswXTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxBY3Rpb24sIHtcblx0XHRcdFx0XHRcdGlzTWFjaGluZVNjb3BlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdHByZVJlbGVhc2U6IHRydWVcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRhY3Rpb24uZXh0ZW5zaW9uID0gZXh0ZW5zaW9uO1xuXHRcdFx0XHRcdHJldHVybiBydW5BY3Rpb24oYWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogSW5zdGFsbEFub3RoZXJWZXJzaW9uQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IEluc3RhbGxBbm90aGVyVmVyc2lvbkFjdGlvbi5MQUJFTCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHRlbnNpb25Db250ZXh0LFxuXHRcdFx0XHRncm91cDogJzBfaW5zdGFsbCcsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2V4dGVuc2lvblN0YXR1cycsICd1bmluc3RhbGxlZCcpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2lzR2FsbGVyeUV4dGVuc2lvbicpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2lzRXh0ZW5zaW9uQWxsb3dlZCcpLCBDb250ZXh0S2V5RXhwci5ub3QoJ2V4dGVuc2lvbkRpc2FsbG93SW5zdGFsbCcpKSxcblx0XHRcdFx0b3JkZXI6IDNcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZXh0ZW5zaW9uSWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbHRlcihlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgeyBpZDogZXh0ZW5zaW9uSWQgfSkpWzBdXG5cdFx0XHRcdFx0fHwgKGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhbeyBpZDogZXh0ZW5zaW9uSWQgfV0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKVswXTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0XHRcdHJldHVybiBydW5BY3Rpb24oaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbEFub3RoZXJWZXJzaW9uQWN0aW9uLCBleHRlbnNpb24sIGZhbHNlKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uY29weUV4dGVuc2lvbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uY29weUV4dGVuc2lvbicsICdDb3B5JyksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXh0ZW5zaW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcxX2NvcHknXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGV4dGVuc2lvbklkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmlsdGVyKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCB7IGlkOiBleHRlbnNpb25JZCB9KSlbMF1cblx0XHRcdFx0XHR8fCAoYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5nZXRFeHRlbnNpb25zKFt7IGlkOiBleHRlbnNpb25JZCB9XSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpWzBdO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgbmFtZSA9IGxvY2FsaXplKCdleHRlbnNpb25JbmZvTmFtZScsICdOYW1lOiB7MH0nLCBleHRlbnNpb24uZGlzcGxheU5hbWUpO1xuXHRcdFx0XHRcdGNvbnN0IGlkID0gbG9jYWxpemUoJ2V4dGVuc2lvbkluZm9JZCcsICdJZDogezB9JywgZXh0ZW5zaW9uSWQpO1xuXHRcdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gbG9jYWxpemUoJ2V4dGVuc2lvbkluZm9EZXNjcmlwdGlvbicsICdEZXNjcmlwdGlvbjogezB9JywgZXh0ZW5zaW9uLmRlc2NyaXB0aW9uKTtcblx0XHRcdFx0XHRjb25zdCB2ZXJpc2lvbiA9IGxvY2FsaXplKCdleHRlbnNpb25JbmZvVmVyc2lvbicsICdWZXJzaW9uOiB7MH0nLCBleHRlbnNpb24udmVyc2lvbik7XG5cdFx0XHRcdFx0Y29uc3QgcHVibGlzaGVyID0gbG9jYWxpemUoJ2V4dGVuc2lvbkluZm9QdWJsaXNoZXInLCAnUHVibGlzaGVyOiB7MH0nLCBleHRlbnNpb24ucHVibGlzaGVyRGlzcGxheU5hbWUpO1xuXHRcdFx0XHRcdGNvbnN0IGxpbmsgPSBleHRlbnNpb24udXJsID8gbG9jYWxpemUoJ2V4dGVuc2lvbkluZm9WU01hcmtldHBsYWNlTGluaycsICdWUyBNYXJrZXRwbGFjZSBMaW5rOiB7MH0nLCBgJHtleHRlbnNpb24udXJsfWApIDogbnVsbDtcblx0XHRcdFx0XHRjb25zdCBjbGlwYm9hcmRTdHIgPSBgJHtuYW1lfVxcbiR7aWR9XFxuJHtkZXNjcmlwdGlvbn1cXG4ke3ZlcmlzaW9ufVxcbiR7cHVibGlzaGVyfSR7bGluayA/ICdcXG4nICsgbGluayA6ICcnfWA7XG5cdFx0XHRcdFx0YXdhaXQgY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQoY2xpcGJvYXJkU3RyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5jb3B5RXh0ZW5zaW9uSWQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmNvcHlFeHRlbnNpb25JZCcsICdDb3B5IEV4dGVuc2lvbiBJRCcpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkV4dGVuc2lvbkNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMV9jb3B5J1xuXHRcdFx0fSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBpZDogc3RyaW5nKSA9PiBhY2Nlc3Nvci5nZXQoSUNsaXBib2FyZFNlcnZpY2UpLndyaXRlVGV4dChpZClcblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uY29weUxpbmsnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmNvcHlMaW5rJywgJ0NvcHkgTGluaycpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkV4dGVuc2lvbkNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMV9jb3B5Jyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmhhcygnaXNHYWxsZXJ5RXh0ZW5zaW9uJyksIENPTlRFWFRfR0FMTEVSWV9IQVNfRVhURU5TSU9OX0xJTkspLFxuXHRcdFx0fSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfLCBleHRlbnNpb246IElFeHRlbnNpb25BcmcpID0+IHtcblx0XHRcdFx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cdFx0XHRcdGlmIChleHRlbnNpb24uZ2FsbGVyeUxpbmspIHtcblx0XHRcdFx0XHRhd2FpdCBjbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChleHRlbnNpb24uZ2FsbGVyeUxpbmspO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmNvbmZpZ3VyZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uY29uZmlndXJlJywgJ1NldHRpbmdzJyksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXh0ZW5zaW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcyX2NvbmZpZ3VyZScsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2V4dGVuc2lvblN0YXR1cycsICdpbnN0YWxsZWQnKSwgQ29udGV4dEtleUV4cHIuaGFzKCdleHRlbnNpb25IYXNDb25maWd1cmF0aW9uJykpLFxuXHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBpZDogc3RyaW5nKSA9PiBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSkub3BlblNldHRpbmdzKHsganNvbkVkaXRvcjogZmFsc2UsIHF1ZXJ5OiBgQGV4dDoke2lkfWAgfSlcblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uZG93bmxvYWQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdkb3dubG9hZCBWU0lYJywgXCJEb3dubG9hZCBWU0lYXCIpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkV4dGVuc2lvbkNvbnRleHQsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5ub3QoJ2V4dGVuc2lvbkRpc2FsbG93SW5zdGFsbCcpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2lzR2FsbGVyeUV4dGVuc2lvbicpKSxcblx0XHRcdFx0b3JkZXI6IHRoaXMucHJvZHVjdFNlcnZpY2UucXVhbGl0eSA9PT0gJ3N0YWJsZScgPyAwIDogMVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBleHRlbnNpb25JZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpLmRvd25sb2FkVlNJWChleHRlbnNpb25JZCwgJ3JlbGVhc2UnKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uZG93bmxvYWRQcmVSZWxlYXNlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZG93bmxvYWQgcHJlLXJlbGVhc2UnLCBcIkRvd25sb2FkIFByZS1SZWxlYXNlIFZTSVhcIiksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXh0ZW5zaW9uQ29udGV4dCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLm5vdCgnZXh0ZW5zaW9uRGlzYWxsb3dJbnN0YWxsJyksIENvbnRleHRLZXlFeHByLmhhcygnaXNHYWxsZXJ5RXh0ZW5zaW9uJyksIENvbnRleHRLZXlFeHByLmhhcygnZXh0ZW5zaW9uSGFzUHJlUmVsZWFzZVZlcnNpb24nKSksXG5cdFx0XHRcdG9yZGVyOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLnF1YWxpdHkgPT09ICdzdGFibGUnID8gMSA6IDBcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZXh0ZW5zaW9uSWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKS5kb3dubG9hZFZTSVgoZXh0ZW5zaW9uSWQsICdwcmVyZWxlYXNlJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmRvd25sb2FkU3BlY2lmaWNWZXJzaW9uJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZG93bmxvYWQgc3BlY2lmaWMgdmVyc2lvbicsIFwiRG93bmxvYWQgU3BlY2lmaWMgVmVyc2lvbiBWU0lYLi4uXCIpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkV4dGVuc2lvbkNvbnRleHQsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5ub3QoJ2V4dGVuc2lvbkRpc2FsbG93SW5zdGFsbCcpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2lzR2FsbGVyeUV4dGVuc2lvbicpKSxcblx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZXh0ZW5zaW9uSWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKS5kb3dubG9hZFZTSVgoZXh0ZW5zaW9uSWQsICdhbnknKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24ubWFuYWdlQWNjb3VudFByZWZlcmVuY2VzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5jaGFuZ2VBY2NvdW50UHJlZmVyZW5jZScsIFwiQWNjb3VudCBQcmVmZXJlbmNlc1wiKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHRlbnNpb25Db250ZXh0LFxuXHRcdFx0XHRncm91cDogJzJfY29uZmlndXJlJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygnZXh0ZW5zaW9uU3RhdHVzJywgJ2luc3RhbGxlZCcpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2V4dGVuc2lvbkhhc0FjY291bnRQcmVmZXJlbmNlcycpKSxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGlkOiBzdHJpbmcpID0+IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpLmV4ZWN1dGVDb21tYW5kKCdfbWFuYWdlQWNjb3VudFByZWZlcmVuY2VzRm9yRXh0ZW5zaW9uJywgaWQpXG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmNvbmZpZ3VyZUtleWJpbmRpbmdzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5jb25maWd1cmVLZXliaW5kaW5ncycsICdLZXlib2FyZCBTaG9ydGN1dHMnKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHRlbnNpb25Db250ZXh0LFxuXHRcdFx0XHRncm91cDogJzJfY29uZmlndXJlJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygnZXh0ZW5zaW9uU3RhdHVzJywgJ2luc3RhbGxlZCcpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2V4dGVuc2lvbkhhc0tleWJpbmRpbmdzJykpLFxuXHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0fSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBpZDogc3RyaW5nKSA9PiBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSkub3Blbkdsb2JhbEtleWJpbmRpbmdTZXR0aW5ncyhmYWxzZSwgeyBxdWVyeTogYEBleHQ6JHtpZH1gIH0pXG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnRvZ2dsZUFwcGx5VG9BbGxQcm9maWxlcycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24udG9nZ2xlQXBwbHlUb0FsbFByb2ZpbGVzJywgXCJBcHBseSBFeHRlbnNpb24gdG8gYWxsIFByb2ZpbGVzXCIpLFxuXHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleUV4cHIuaGFzKCdpc0FwcGxpY2F0aW9uU2NvcGVkRXh0ZW5zaW9uJyksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXh0ZW5zaW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcyX2NvbmZpZ3VyZScsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2V4dGVuc2lvblN0YXR1cycsICdpbnN0YWxsZWQnKSwgQ29udGV4dEtleUV4cHIuaGFzKCdpc0RlZmF1bHRBcHBsaWNhdGlvblNjb3BlZEV4dGVuc2lvbicpLm5lZ2F0ZSgpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2lzQnVpbHRpbkV4dGVuc2lvbicpLm5lZ2F0ZSgpLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2lzV29ya3NwYWNlU2NvcGVkRXh0ZW5zaW9uJywgZmFsc2UpKSxcblx0XHRcdFx0b3JkZXI6IDNcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgXzogc3RyaW5nLCBleHRlbnNpb25Bcmc6IElFeHRlbnNpb25BcmcpID0+IHtcblx0XHRcdFx0Y29uc3QgdXJpSWRlbnRpdHlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElVcmlJZGVudGl0eVNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSBleHRlbnNpb25BcmcubG9jYXRpb24gPyB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmluc3RhbGxlZC5maW5kKGUgPT4gdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGUubG9jYWw/LmxvY2F0aW9uLCBleHRlbnNpb25BcmcubG9jYXRpb24pKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnRvZ2dsZUFwcGx5RXh0ZW5zaW9uVG9BbGxQcm9maWxlcyhleHRlbnNpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiBUT0dHTEVfSUdOT1JFX0VYVEVOU0lPTl9BQ1RJT05fSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24udG9nZ2xlSWdub3JlRXh0ZW5zaW9uJywgXCJTeW5jIFRoaXMgRXh0ZW5zaW9uXCIpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkV4dGVuc2lvbkNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMl9jb25maWd1cmUnLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCdleHRlbnNpb25TdGF0dXMnLCAnaW5zdGFsbGVkJyksIENPTlRFWFRfU1lOQ19FTkFCTEVNRU5ULCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2lzV29ya3NwYWNlU2NvcGVkRXh0ZW5zaW9uJywgZmFsc2UpKSxcblx0XHRcdFx0b3JkZXI6IDRcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkIH0sIGUuaWRlbnRpZmllcikpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UudG9nZ2xlRXh0ZW5zaW9uSWdub3JlZFRvU3luYyhleHRlbnNpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmlnbm9yZVJlY29tbWVuZGF0aW9uJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5pZ25vcmVSZWNvbW1lbmRhdGlvbicsIFwiSWdub3JlIFJlY29tbWVuZGF0aW9uXCIpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkV4dGVuc2lvbkNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnM19yZWNvbW1lbmRhdGlvbnMnLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5oYXMoJ2lzRXh0ZW5zaW9uUmVjb21tZW5kZWQnKSxcblx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaWQ6IHN0cmluZykgPT4gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZSkudG9nZ2xlR2xvYmFsSWdub3JlZFJlY29tbWVuZGF0aW9uKGlkLCB0cnVlKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi51bmRvSWdub3JlZFJlY29tbWVuZGF0aW9uJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi51bmRvSWdub3JlZFJlY29tbWVuZGF0aW9uJywgXCJVbmRvIElnbm9yZWQgUmVjb21tZW5kYXRpb25cIiksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXh0ZW5zaW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICczX3JlY29tbWVuZGF0aW9ucycsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmhhcygnaXNVc2VySWdub3JlZFJlY29tbWVuZGF0aW9uJyksXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGlkOiBzdHJpbmcpID0+IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uSWdub3JlZFJlY29tbWVuZGF0aW9uc1NlcnZpY2UpLnRvZ2dsZUdsb2JhbElnbm9yZWRSZWNvbW1lbmRhdGlvbihpZCwgZmFsc2UpXG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmFkZEV4dGVuc2lvblRvV29ya3NwYWNlUmVjb21tZW5kYXRpb25zJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5hZGRFeHRlbnNpb25Ub1dvcmtzcGFjZVJlY29tbWVuZGF0aW9ucycsIFwiQWRkIHRvIFdvcmtzcGFjZSBSZWNvbW1lbmRhdGlvbnNcIiksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXh0ZW5zaW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICczX3JlY29tbWVuZGF0aW9ucycsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChXb3JrYmVuY2hTdGF0ZUNvbnRleHQubm90RXF1YWxzVG8oJ2VtcHR5JyksIENvbnRleHRLZXlFeHByLmhhcygnaXNCdWlsdGluRXh0ZW5zaW9uJykubmVnYXRlKCksIENvbnRleHRLZXlFeHByLmhhcygnaXNFeHRlbnNpb25Xb3Jrc3BhY2VSZWNvbW1lbmRlZCcpLm5lZ2F0ZSgpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2lzVXNlcklnbm9yZWRSZWNvbW1lbmRhdGlvbicpLm5lZ2F0ZSgpLCBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoJ2V4dGVuc2lvblNvdXJjZScsICdyZXNvdXJjZScpKSxcblx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdH0sXG5cdFx0XHRydW46IChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaWQ6IHN0cmluZykgPT4gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnU2VydmljZSkudG9nZ2xlUmVjb21tZW5kYXRpb24oaWQpXG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnJlbW92ZUV4dGVuc2lvbkZyb21Xb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnJlbW92ZUV4dGVuc2lvbkZyb21Xb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnMnLCBcIlJlbW92ZSBmcm9tIFdvcmtzcGFjZSBSZWNvbW1lbmRhdGlvbnNcIiksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXh0ZW5zaW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICczX3JlY29tbWVuZGF0aW9ucycsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChXb3JrYmVuY2hTdGF0ZUNvbnRleHQubm90RXF1YWxzVG8oJ2VtcHR5JyksIENvbnRleHRLZXlFeHByLmhhcygnaXNCdWlsdGluRXh0ZW5zaW9uJykubmVnYXRlKCksIENvbnRleHRLZXlFeHByLmhhcygnaXNFeHRlbnNpb25Xb3Jrc3BhY2VSZWNvbW1lbmRlZCcpKSxcblx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdH0sXG5cdFx0XHRydW46IChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaWQ6IHN0cmluZykgPT4gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnU2VydmljZSkudG9nZ2xlUmVjb21tZW5kYXRpb24oaWQpXG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmFkZFRvV29ya3NwYWNlUmVjb21tZW5kYXRpb25zJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5hZGRUb1dvcmtzcGFjZVJlY29tbWVuZGF0aW9ucycsIFwiQWRkIEV4dGVuc2lvbiB0byBXb3Jrc3BhY2UgUmVjb21tZW5kYXRpb25zXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IEVYVEVOU0lPTlNfQ0FURUdPUlksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChXb3JrYmVuY2hTdGF0ZUNvbnRleHQuaXNFcXVhbFRvKCd3b3Jrc3BhY2UnKSwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCdyZXNvdXJjZVNjaGVtZScsIFNjaGVtYXMuZXh0ZW5zaW9uKSksXG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTxhbnk+IHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZUV4dGVuc2lvbnNDb25maWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnU2VydmljZSk7XG5cdFx0XHRcdGlmICghKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yIGluc3RhbmNlb2YgRXh0ZW5zaW9uc0lucHV0KSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBleHRlbnNpb25JZCA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdGNvbnN0IHJlY29tbWVuZGF0aW9ucyA9IGF3YWl0IHdvcmtzcGFjZUV4dGVuc2lvbnNDb25maWdTZXJ2aWNlLmdldFJlY29tbWVuZGF0aW9ucygpO1xuXHRcdFx0XHRpZiAocmVjb21tZW5kYXRpb25zLmluY2x1ZGVzKGV4dGVuc2lvbklkKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCB3b3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnU2VydmljZS50b2dnbGVSZWNvbW1lbmRhdGlvbihleHRlbnNpb25JZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmFkZFRvV29ya3NwYWNlRm9sZGVyUmVjb21tZW5kYXRpb25zJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5hZGRUb1dvcmtzcGFjZUZvbGRlclJlY29tbWVuZGF0aW9ucycsIFwiQWRkIEV4dGVuc2lvbiB0byBXb3Jrc3BhY2UgRm9sZGVyIFJlY29tbWVuZGF0aW9uc1wiKSxcblx0XHRcdGNhdGVnb3J5OiBFWFRFTlNJT05TX0NBVEVHT1JZLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoV29ya2JlbmNoU3RhdGVDb250ZXh0LmlzRXF1YWxUbygnZm9sZGVyJyksIENvbnRleHRLZXlFeHByLmVxdWFscygncmVzb3VyY2VTY2hlbWUnLCBTY2hlbWFzLmV4dGVuc2lvbikpLFxuXHRcdFx0fSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmFkZFRvV29ya3NwYWNlUmVjb21tZW5kYXRpb25zJylcblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uYWRkVG9Xb3Jrc3BhY2VJZ25vcmVkUmVjb21tZW5kYXRpb25zJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5hZGRUb1dvcmtzcGFjZUlnbm9yZWRSZWNvbW1lbmRhdGlvbnMnLCBcIkFkZCBFeHRlbnNpb24gdG8gV29ya3NwYWNlIElnbm9yZWQgUmVjb21tZW5kYXRpb25zXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IEVYVEVOU0lPTlNfQ0FURUdPUlksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChXb3JrYmVuY2hTdGF0ZUNvbnRleHQuaXNFcXVhbFRvKCd3b3Jrc3BhY2UnKSwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCdyZXNvdXJjZVNjaGVtZScsIFNjaGVtYXMuZXh0ZW5zaW9uKSksXG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTxhbnk+IHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZUV4dGVuc2lvbnNDb25maWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnU2VydmljZSk7XG5cdFx0XHRcdGlmICghKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yIGluc3RhbmNlb2YgRXh0ZW5zaW9uc0lucHV0KSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBleHRlbnNpb25JZCA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdGNvbnN0IHVud2FudGVkUmVjb21tZW5kYXRpb25zID0gYXdhaXQgd29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZ1NlcnZpY2UuZ2V0VW53YW50ZWRSZWNvbW1lbmRhdGlvbnMoKTtcblx0XHRcdFx0aWYgKHVud2FudGVkUmVjb21tZW5kYXRpb25zLmluY2x1ZGVzKGV4dGVuc2lvbklkKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCB3b3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnU2VydmljZS50b2dnbGVVbndhbnRlZFJlY29tbWVuZGF0aW9uKGV4dGVuc2lvbklkKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uYWRkVG9Xb3Jrc3BhY2VGb2xkZXJJZ25vcmVkUmVjb21tZW5kYXRpb25zJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5hZGRUb1dvcmtzcGFjZUZvbGRlcklnbm9yZWRSZWNvbW1lbmRhdGlvbnMnLCBcIkFkZCBFeHRlbnNpb24gdG8gV29ya3NwYWNlIEZvbGRlciBJZ25vcmVkIFJlY29tbWVuZGF0aW9uc1wiKSxcblx0XHRcdGNhdGVnb3J5OiBFWFRFTlNJT05TX0NBVEVHT1JZLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoV29ya2JlbmNoU3RhdGVDb250ZXh0LmlzRXF1YWxUbygnZm9sZGVyJyksIENvbnRleHRLZXlFeHByLmVxdWFscygncmVzb3VyY2VTY2hlbWUnLCBTY2hlbWFzLmV4dGVuc2lvbikpLFxuXHRcdFx0fSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmFkZFRvV29ya3NwYWNlSWdub3JlZFJlY29tbWVuZGF0aW9ucycpXG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiBDb25maWd1cmVXb3Jrc3BhY2VSZWNvbW1lbmRlZEV4dGVuc2lvbnNBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogeyB2YWx1ZTogQ29uZmlndXJlV29ya3NwYWNlUmVjb21tZW5kZWRFeHRlbnNpb25zQWN0aW9uLkxBQkVMLCBvcmlnaW5hbDogJ0NvbmZpZ3VyZSBSZWNvbW1lbmRlZCBFeHRlbnNpb25zIChXb3Jrc3BhY2UpJyB9LFxuXHRcdFx0Y2F0ZWdvcnk6IEVYVEVOU0lPTlNfQ0FURUdPUlksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IFdvcmtiZW5jaFN0YXRlQ29udGV4dC5pc0VxdWFsVG8oJ3dvcmtzcGFjZScpLFxuXHRcdFx0fSxcblx0XHRcdHJ1bjogKCkgPT4gcnVuQWN0aW9uKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29uZmlndXJlV29ya3NwYWNlUmVjb21tZW5kZWRFeHRlbnNpb25zQWN0aW9uLCBDb25maWd1cmVXb3Jrc3BhY2VSZWNvbW1lbmRlZEV4dGVuc2lvbnNBY3Rpb24uSUQsIENvbmZpZ3VyZVdvcmtzcGFjZVJlY29tbWVuZGVkRXh0ZW5zaW9uc0FjdGlvbi5MQUJFTCkpXG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLm1hbmFnZVRydXN0ZWRQdWJsaXNoZXJzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5tYW5hZ2VUcnVzdGVkUHVibGlzaGVycycsIFwiTWFuYWdlIFRydXN0ZWQgRXh0ZW5zaW9uIFB1Ymxpc2hlcnNcIiksXG5cdFx0XHRjYXRlZ29yeTogRVhURU5TSU9OU19DQVRFR09SWSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHtcblx0XHRcdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgdHJ1c3RlZFB1Ymxpc2hlcnMgPSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRUcnVzdGVkUHVibGlzaGVycygpO1xuXHRcdFx0XHRjb25zdCB0cnVzdGVkUHVibGlzaGVySXRlbXMgPSB0cnVzdGVkUHVibGlzaGVycy5tYXAocHVibGlzaGVyID0+ICh7XG5cdFx0XHRcdFx0aWQ6IHB1Ymxpc2hlci5wdWJsaXNoZXIsXG5cdFx0XHRcdFx0bGFiZWw6IHB1Ymxpc2hlci5wdWJsaXNoZXJEaXNwbGF5TmFtZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogcHVibGlzaGVyLnB1Ymxpc2hlcixcblx0XHRcdFx0XHRwaWNrZWQ6IHRydWUsXG5cdFx0XHRcdH0pKS5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKHRydXN0ZWRQdWJsaXNoZXJJdGVtcywge1xuXHRcdFx0XHRcdGNhblBpY2tNYW55OiB0cnVlLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgndHJ1c3RlZFB1Ymxpc2hlcnMnLCBcIk1hbmFnZSBUcnVzdGVkIEV4dGVuc2lvbiBQdWJsaXNoZXJzXCIpLFxuXHRcdFx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgndHJ1c3RlZFB1Ymxpc2hlcnNQbGFjZWhvbGRlcicsIFwiQ2hvb3NlIHdoaWNoIHB1Ymxpc2hlcnMgdG8gdHJ1c3RcIiksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0Y29uc3QgdW50cnVzdGVkUHVibGlzaGVycyA9IFtdO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgeyBwdWJsaXNoZXIgfSBvZiB0cnVzdGVkUHVibGlzaGVycykge1xuXHRcdFx0XHRcdFx0aWYgKCFyZXN1bHQuc29tZShyID0+IHIuaWQgPT09IHB1Ymxpc2hlcikpIHtcblx0XHRcdFx0XHRcdFx0dW50cnVzdGVkUHVibGlzaGVycy5wdXNoKHB1Ymxpc2hlcik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRydXN0ZWRQdWJsaXNoZXJzLmZpbHRlcihwdWJsaXNoZXIgPT4gIXJlc3VsdC5zb21lKHIgPT4gci5pZCA9PT0gcHVibGlzaGVyLnB1Ymxpc2hlcikpO1xuXHRcdFx0XHRcdGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnVudHJ1c3RQdWJsaXNoZXJzKC4uLnVudHJ1c3RlZFB1Ymxpc2hlcnMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oZXh0ZW5zaW9uQWN0aW9uT3B0aW9uczogSUV4dGVuc2lvbkFjdGlvbk9wdGlvbnMpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgbWVudXMgPSBleHRlbnNpb25BY3Rpb25PcHRpb25zLm1lbnUgPyBBcnJheS5pc0FycmF5KGV4dGVuc2lvbkFjdGlvbk9wdGlvbnMubWVudSkgPyBleHRlbnNpb25BY3Rpb25PcHRpb25zLm1lbnUgOiBbZXh0ZW5zaW9uQWN0aW9uT3B0aW9ucy5tZW51XSA6IFtdO1xuXHRcdGxldCBtZW51c1dpdGhPdXRUaXRsZXM6ICh7IGlkOiBNZW51SWQgfSAmIE9taXQ8SU1lbnVJdGVtLCAnY29tbWFuZCc+KVtdID0gW107XG5cdFx0Y29uc3QgbWVudXNXaXRoVGl0bGVzOiB7IGlkOiBNZW51SWQ7IGl0ZW06IElNZW51SXRlbSB9W10gPSBbXTtcblx0XHRpZiAoZXh0ZW5zaW9uQWN0aW9uT3B0aW9ucy5tZW51VGl0bGVzKSB7XG5cdFx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgbWVudXMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRcdGNvbnN0IG1lbnUgPSBtZW51c1tpbmRleF07XG5cdFx0XHRcdGNvbnN0IG1lbnVUaXRsZSA9IGV4dGVuc2lvbkFjdGlvbk9wdGlvbnMubWVudVRpdGxlc1ttZW51LmlkLmlkXTtcblx0XHRcdFx0aWYgKG1lbnVUaXRsZSkge1xuXHRcdFx0XHRcdG1lbnVzV2l0aFRpdGxlcy5wdXNoKHsgaWQ6IG1lbnUuaWQsIGl0ZW06IHsgLi4ubWVudSwgY29tbWFuZDogeyBpZDogZXh0ZW5zaW9uQWN0aW9uT3B0aW9ucy5pZCwgdGl0bGU6IG1lbnVUaXRsZSB9IH0gfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bWVudXNXaXRoT3V0VGl0bGVzLnB1c2gobWVudSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0bWVudXNXaXRoT3V0VGl0bGVzID0gbWVudXM7XG5cdFx0fVxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0Li4uZXh0ZW5zaW9uQWN0aW9uT3B0aW9ucyxcblx0XHRcdFx0XHRtZW51OiBtZW51c1dpdGhPdXRUaXRsZXNcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8YW55PiB7XG5cdFx0XHRcdHJldHVybiBleHRlbnNpb25BY3Rpb25PcHRpb25zLnJ1bihhY2Nlc3NvciwgLi4uYXJncyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGlmIChtZW51c1dpdGhUaXRsZXMubGVuZ3RoKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtcyhtZW51c1dpdGhUaXRsZXMpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cbn1cblxuY2xhc3MgRXh0ZW5zaW9uU3RvcmFnZUNsZWFuZXIgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRFeHRlbnNpb25TdG9yYWdlU2VydmljZS5yZW1vdmVPdXRkYXRlZEV4dGVuc2lvblZlcnNpb25zKGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdH1cbn1cblxuY2xhc3MgVHJ1c3RlZFB1Ymxpc2hlcnNJbml0aWFsaXplciBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IHRydXN0ZWRQdWJsaXNoZXJzSW5pdFN0YXR1c0tleSA9ICd0cnVzdGVkLXB1Ymxpc2hlcnMtaW5pdC1taWdyYXRpb24nO1xuXHRcdGlmICghc3RvcmFnZVNlcnZpY2UuZ2V0KHRydXN0ZWRQdWJsaXNoZXJzSW5pdFN0YXR1c0tleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSkge1xuXHRcdFx0Zm9yIChjb25zdCBwcm9maWxlIG9mIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzKSB7XG5cdFx0XHRcdGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZChFeHRlbnNpb25UeXBlLlVzZXIsIHByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKVxuXHRcdFx0XHRcdC50aGVuKGFzeW5jIGV4dGVuc2lvbnMgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgdHJ1c3RlZFB1Ymxpc2hlcnMgPSBuZXcgTWFwPHN0cmluZywgSVB1Ymxpc2hlckluZm8+KCk7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdFx0XHRcdGlmICghZXh0ZW5zaW9uLnB1Ymxpc2hlckRpc3BsYXlOYW1lKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0Y29uc3QgcHVibGlzaGVyID0gZXh0ZW5zaW9uLm1hbmlmZXN0LnB1Ymxpc2hlci50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRcdFx0XHRpZiAocHJvZHVjdFNlcnZpY2UudHJ1c3RlZEV4dGVuc2lvblB1Ymxpc2hlcnM/LmluY2x1ZGVzKHB1Ymxpc2hlcilcblx0XHRcdFx0XHRcdFx0XHR8fCAoZXh0ZW5zaW9uLnB1Ymxpc2hlckRpc3BsYXlOYW1lICYmIHByb2R1Y3RTZXJ2aWNlLnRydXN0ZWRFeHRlbnNpb25QdWJsaXNoZXJzPy5pbmNsdWRlcyhleHRlbnNpb24ucHVibGlzaGVyRGlzcGxheU5hbWUudG9Mb3dlckNhc2UoKSkpKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0dHJ1c3RlZFB1Ymxpc2hlcnMuc2V0KHB1Ymxpc2hlciwgeyBwdWJsaXNoZXIsIHB1Ymxpc2hlckRpc3BsYXlOYW1lOiBleHRlbnNpb24ucHVibGlzaGVyRGlzcGxheU5hbWUgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAodHJ1c3RlZFB1Ymxpc2hlcnMuc2l6ZSkge1xuXHRcdFx0XHRcdFx0XHRleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS50cnVzdFB1Ymxpc2hlcnMoLi4udHJ1c3RlZFB1Ymxpc2hlcnMudmFsdWVzKCkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUodHJ1c3RlZFB1Ymxpc2hlcnNJbml0U3RhdHVzS2V5LCAndHJ1ZScsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgRXh0ZW5zaW9uVG9vbHNDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2V4dGVuc2lvbnMuY2hhdC50b29sc0NvbnRyaWJ1dGlvbic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHRvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IHNlYXJjaEV4dGVuc2lvbnNUb29sID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VhcmNoRXh0ZW5zaW9uc1Rvb2wpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvb2xzU2VydmljZS5yZWdpc3RlclRvb2woU2VhcmNoRXh0ZW5zaW9uc1Rvb2xEYXRhLCBzZWFyY2hFeHRlbnNpb25zVG9vbCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvb2xzU2VydmljZS52c2NvZGVUb29sU2V0LmFkZFRvb2woU2VhcmNoRXh0ZW5zaW9uc1Rvb2xEYXRhKSk7XG5cdH1cbn1cblxuY29uc3Qgd29ya2JlbmNoUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCk7XG53b3JrYmVuY2hSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihFeHRlbnNpb25zQ29udHJpYnV0aW9ucywgTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpO1xud29ya2JlbmNoUmVnaXN0cnkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oU3RhdHVzVXBkYXRlciwgTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSk7XG53b3JrYmVuY2hSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihNYWxpY2lvdXNFeHRlbnNpb25DaGVja2VyLCBMaWZlY3ljbGVQaGFzZS5FdmVudHVhbGx5KTtcbndvcmtiZW5jaFJlZ2lzdHJ5LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKEtleW1hcEV4dGVuc2lvbnMsIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcbndvcmtiZW5jaFJlZ2lzdHJ5LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKEV4dGVuc2lvbnNWaWV3bGV0Vmlld3NDb250cmlidXRpb24sIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcbndvcmtiZW5jaFJlZ2lzdHJ5LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKEV4dGVuc2lvbkFjdGl2YXRpb25Qcm9ncmVzcywgTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSk7XG53b3JrYmVuY2hSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihFeHRlbnNpb25EZXBlbmRlbmN5Q2hlY2tlciwgTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSk7XG53b3JrYmVuY2hSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihFeHRlbnNpb25FbmFibGVtZW50V29ya3NwYWNlVHJ1c3RUcmFuc2l0aW9uUGFydGljaXBhbnQsIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcbndvcmtiZW5jaFJlZ2lzdHJ5LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKEV4dGVuc2lvbnNDb21wbGV0aW9uSXRlbXNQcm92aWRlciwgTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpO1xud29ya2JlbmNoUmVnaXN0cnkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oRXh0ZW5zaW9uRW5hYmxlbWVudENvbnRleHRLZXlzQ29udHJpYnV0aW9uLCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG53b3JrYmVuY2hSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihVbnN1cHBvcnRlZEV4dGVuc2lvbnNNaWdyYXRpb25Db250cmliLCBMaWZlY3ljbGVQaGFzZS5FdmVudHVhbGx5KTtcbndvcmtiZW5jaFJlZ2lzdHJ5LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKFRydXN0ZWRQdWJsaXNoZXJzSW5pdGlhbGl6ZXIsIExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHkpO1xud29ya2JlbmNoUmVnaXN0cnkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oRXh0ZW5zaW9uTWFya2V0cGxhY2VTdGF0dXNVcGRhdGVyLCBMaWZlY3ljbGVQaGFzZS5FdmVudHVhbGx5KTtcbmlmIChpc1dlYikge1xuXHR3b3JrYmVuY2hSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihFeHRlbnNpb25TdG9yYWdlQ2xlYW5lciwgTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSk7XG59XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihFeHRlbnNpb25Ub29sc0NvbnRyaWJ1dGlvbi5JRCwgRXh0ZW5zaW9uVG9vbHNDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRXh0ZW5zaW9uc0dhbGxlcnlTaWduSW5BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb25zLmdhbGxlcnkuc2lnbkluJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3NpZ25JblRvTWFya2V0cGxhY2UnLCAnU2lnbiBpbiB0byBhY2Nlc3MgRXh0ZW5zaW9ucyBNYXJrZXRwbGFjZScpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkFjY291bnRzQ29udGV4dCxcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9FWFRFTlNJT05TX0dBTExFUllfU1RBVFVTLmlzRXF1YWxUbyhFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTdGF0dXMuUmVxdWlyZXNTaWduSW4pXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKS5leGVjdXRlQ29tbWFuZChERUZBVUxUX0FDQ09VTlRfU0lHTl9JTl9DT01NQU5EKTtcblx0fVxufSk7XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25NaWdyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb25NaWdyYXRpb24pXG5cdC5yZWdpc3RlckNvbmZpZ3VyYXRpb25NaWdyYXRpb25zKFt7XG5cdFx0a2V5OiBBdXRvVXBkYXRlQ29uZmlndXJhdGlvbktleSxcblx0XHQvKipcblx0XHQgKiBNaWdyYXRlcyB0aGUgYGV4dGVuc2lvbnMuYXV0b1VwZGF0ZWAgc2V0dGluZyB0byBpdHMgbmV3IGAnb24nIHwgJ29mZidgIHZhbHVlcy5cblx0XHQgKlxuXHRcdCAqIFRoZSBzZXR0aW5nIHByZXZpb3VzbHkgc3VwcG9ydGVkIHNldmVyYWwgdmFsdWVzIHRoYXQgYXJlIG5vdyByZXRpcmVkOlxuXHRcdCAqIC0gYHRydWVgIChBbGwgRXh0ZW5zaW9ucykgYW5kIGAnb25seUVuYWJsZWRFeHRlbnNpb25zJ2AgKE9ubHkgRW5hYmxlZCBFeHRlbnNpb25zKVxuXHRcdCAqICAgYXJlIGZvbGRlZCBpbnRvIHRoZSBuZXcgYCdvbidgIHZhbHVlLCBhbG9uZyB3aXRoIHRoZSBpbnNpZGVycy1vbmx5IGAnZGVsYXllZCdgIHZhbHVlLlxuXHRcdCAqIC0gYGZhbHNlYCAoTm9uZSkgYW5kIHRoZSBpbnRlcm5hbCBgJ29ubHlTZWxlY3RlZEV4dGVuc2lvbnMnYCB2YWx1ZSBtYXAgdG8gYCdvZmYnYC5cblx0XHQgKiAgIEluIGAnb2ZmJ2AgbW9kZSwgZXh0ZW5zaW9ucyBleHBsaWNpdGx5IG9wdGVkIGluIHBlci1leHRlbnNpb24gYXJlIHN0aWxsIGF1dG8tdXBkYXRlZCxcblx0XHQgKiAgIHdoaWNoIHByZXNlcnZlcyB0aGUgYCdvbmx5U2VsZWN0ZWRFeHRlbnNpb25zJ2AgYmVoYXZpb3IuXG5cdFx0ICpcblx0XHQgKiBSZXR1cm5pbmcgYFtdYCBpcyBhIG5vLW9wLCB1c2VkIHdoZW4gdGhlIHZhbHVlIGlzIGFscmVhZHkgaW4gdGhlIG5ldyBmb3JtYXRcblx0XHQgKiAoYCdvbidgL2Anb2ZmJ2ApIG9yIHVuc2V0LlxuXHRcdCAqL1xuXHRcdG1pZ3JhdGVGbjogKHZhbHVlLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09ICdvbicgfHwgdmFsdWUgPT09ICdvZmYnKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdGlmICh2YWx1ZSA9PT0gZmFsc2UgfHwgdmFsdWUgPT09ICdvbmx5U2VsZWN0ZWRFeHRlbnNpb25zJykge1xuXHRcdFx0XHRyZXR1cm4geyB2YWx1ZTogJ29mZicgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IHZhbHVlOiAnb24nIH07XG5cdFx0fVxuXHR9XSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsYUFBYTtBQUN0QixTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLFlBQVksaUJBQThCLG9CQUFvQjtBQUN2RSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxVQUFVLGFBQWE7QUFDaEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxXQUEwQjtBQUVuQyxTQUFTLFlBQVksV0FBVyxtQkFBbUI7QUFDbkQsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFNBQXFDLFFBQVEsY0FBYyx1QkFBdUI7QUFDM0YsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQkFBa0IsdUJBQXVCO0FBQ2xELFNBQVMsY0FBYyx5QkFBeUIsMEJBQWtEO0FBQ2xHLFNBQVMsZ0JBQWdCLG9CQUFvQixxQkFBcUI7QUFDbEUsU0FBUyxnQkFBZ0IsMEJBQTBCO0FBQ25ELFNBQVMsZ0NBQWdDLDhCQUE4QixxQ0FBcUMsd0NBQW1FLHdDQUF3QztBQUN2TixTQUFTLGtDQUFrQyx3QkFBd0IsbUNBQW1DLDBCQUEwQixZQUFZLDBCQUEwQiw2QkFBNkIsMkJBQTJCLFFBQVEseUNBQXlDO0FBQy9RLFNBQVMsbUJBQW1CLHVCQUF1QjtBQUNuRCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLG1EQUFtRDtBQUM1RCxTQUFTLHNCQUFzQixxQkFBcUI7QUFDcEQsU0FBUyxzQkFB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
