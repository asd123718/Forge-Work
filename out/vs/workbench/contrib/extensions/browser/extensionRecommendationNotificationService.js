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
import { distinct } from "../../../../base/common/arrays.js";
import { createCancelablePromise, Promises, raceCancellablePromises, raceCancellation, timeout } from "../../../../base/common/async.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { isString } from "../../../../base/common/types.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { areSameExtensions } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { RecommendationsNotificationResult, RecommendationSource, RecommendationSourceToString } from "../../../../platform/extensionRecommendations/common/extensionRecommendations.js";
import { INotificationService, NotificationPriority, Severity } from "../../../../platform/notification/common/notification.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IUserDataSyncEnablementService, SyncResource } from "../../../../platform/userDataSync/common/userDataSync.js";
import { IExtensionsWorkbenchService } from "../common/extensions.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { EnablementState, IWorkbenchExtensionManagementService, IWorkbenchExtensionEnablementService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { IExtensionIgnoredRecommendationsService } from "../../../services/extensionRecommendations/common/extensionRecommendations.js";
const ignoreImportantExtensionRecommendationStorageKey = "extensionsAssistant/importantRecommendationsIgnore";
const donotShowWorkspaceRecommendationsStorageKey = "extensionsAssistant/workspaceRecommendationsIgnore";
class RecommendationsNotification extends Disposable {
  constructor(severity, message, choices, notificationService) {
    super();
    this.severity = severity;
    this.message = message;
    this.choices = choices;
    this.notificationService = notificationService;
    this._onDidClose = this._register(new Emitter());
    this.onDidClose = this._onDidClose.event;
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this.cancelled = false;
    this.onDidCloseDisposable = this._register(new MutableDisposable());
    this.onDidChangeVisibilityDisposable = this._register(new MutableDisposable());
  }
  show() {
    if (!this.notificationHandle) {
      this.updateNotificationHandle(this.notificationService.prompt(this.severity, this.message, this.choices, { sticky: true, priority: NotificationPriority.OPTIONAL, onCancel: () => this.cancelled = true }));
    }
  }
  hide() {
    if (this.notificationHandle) {
      this.onDidCloseDisposable.clear();
      this.notificationHandle.close();
      this.cancelled = false;
      this.updateNotificationHandle(this.notificationService.prompt(this.severity, this.message, this.choices, { priority: NotificationPriority.SILENT, onCancel: () => this.cancelled = true }));
    }
  }
  isCancelled() {
    return this.cancelled;
  }
  updateNotificationHandle(notificationHandle) {
    this.onDidCloseDisposable.clear();
    this.onDidChangeVisibilityDisposable.clear();
    this.notificationHandle = notificationHandle;
    this.onDidCloseDisposable.value = this.notificationHandle.onDidClose(() => {
      this.onDidCloseDisposable.dispose();
      this.onDidChangeVisibilityDisposable.dispose();
      this._onDidClose.fire();
      this._onDidClose.dispose();
      this._onDidChangeVisibility.dispose();
    });
    this.onDidChangeVisibilityDisposable.value = this.notificationHandle.onDidChangeVisibility((e) => this._onDidChangeVisibility.fire(e));
  }
}
let ExtensionRecommendationNotificationService = class extends Disposable {
  constructor(configurationService, storageService, notificationService, telemetryService, extensionsWorkbenchService, extensionManagementService, extensionEnablementService, extensionIgnoredRecommendationsService, userDataSyncEnablementService, workbenchEnvironmentService, uriIdentityService) {
    super();
    this.configurationService = configurationService;
    this.storageService = storageService;
    this.notificationService = notificationService;
    this.telemetryService = telemetryService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionManagementService = extensionManagementService;
    this.extensionEnablementService = extensionEnablementService;
    this.extensionIgnoredRecommendationsService = extensionIgnoredRecommendationsService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.workbenchEnvironmentService = workbenchEnvironmentService;
    this.uriIdentityService = uriIdentityService;
    this.recommendedExtensions = [];
    this.recommendationSources = [];
    this.pendingNotificaitons = [];
  }
  // Ignored Important Recommendations
  get ignoredRecommendations() {
    return distinct([...JSON.parse(this.storageService.get(ignoreImportantExtensionRecommendationStorageKey, StorageScope.PROFILE, "[]"))].map((i) => i.toLowerCase()));
  }
  hasToIgnoreRecommendationNotifications() {
    const config = this.configurationService.getValue("extensions");
    return config.ignoreRecommendations || !!config.showRecommendationsOnlyOnDemand;
  }
  async promptImportantExtensionsInstallNotification(extensionRecommendations) {
    const ignoredRecommendations = [...this.extensionIgnoredRecommendationsService.ignoredRecommendations, ...this.ignoredRecommendations];
    const extensions = extensionRecommendations.extensions.filter((id) => !ignoredRecommendations.includes(id));
    if (!extensions.length) {
      return RecommendationsNotificationResult.Ignored;
    }
    return this.promptRecommendationsNotification({ ...extensionRecommendations, extensions }, {
      onDidInstallRecommendedExtensions: (extensions2) => extensions2.forEach((extension) => this.telemetryService.publicLog2("extensionRecommendations:popup", { userReaction: "install", extensionId: extension.identifier.id, source: RecommendationSourceToString(extensionRecommendations.source) })),
      onDidShowRecommendedExtensions: (extensions2) => extensions2.forEach((extension) => this.telemetryService.publicLog2("extensionRecommendations:popup", { userReaction: "show", extensionId: extension.identifier.id, source: RecommendationSourceToString(extensionRecommendations.source) })),
      onDidCancelRecommendedExtensions: (extensions2) => extensions2.forEach((extension) => this.telemetryService.publicLog2("extensionRecommendations:popup", { userReaction: "cancelled", extensionId: extension.identifier.id, source: RecommendationSourceToString(extensionRecommendations.source) })),
      onDidNeverShowRecommendedExtensionsAgain: (extensions2) => {
        for (const extension of extensions2) {
          this.addToImportantRecommendationsIgnore(extension.identifier.id);
          this.telemetryService.publicLog2("extensionRecommendations:popup", { userReaction: "neverShowAgain", extensionId: extension.identifier.id, source: RecommendationSourceToString(extensionRecommendations.source) });
        }
        this.notificationService.prompt(
          Severity.Info,
          localize("ignoreExtensionRecommendations", "Do you want to ignore all extension recommendations?"),
          [{
            label: localize("ignoreAll", "Yes, Ignore All"),
            run: () => this.setIgnoreRecommendationsConfig(true)
          }, {
            label: localize("no", "No"),
            run: () => this.setIgnoreRecommendationsConfig(false)
          }]
        );
      }
    });
  }
  async promptWorkspaceRecommendations(recommendations) {
    if (this.storageService.getBoolean(donotShowWorkspaceRecommendationsStorageKey, StorageScope.WORKSPACE, false)) {
      return;
    }
    let installed = await this.extensionManagementService.getInstalled();
    installed = installed.filter((l) => this.extensionEnablementService.getEnablementState(l) !== EnablementState.DisabledByExtensionKind);
    recommendations = recommendations.filter((recommendation) => installed.every(
      (local) => isString(recommendation) ? !areSameExtensions({ id: recommendation }, local.identifier) : !this.uriIdentityService.extUri.isEqual(recommendation, local.location)
    ));
    if (!recommendations.length) {
      return;
    }
    await this.promptRecommendationsNotification({ extensions: recommendations, source: RecommendationSource.WORKSPACE, name: localize({ key: "this repository", comment: ["this repository means the current repository that is opened"] }, "this repository") }, {
      onDidInstallRecommendedExtensions: () => this.telemetryService.publicLog2("extensionWorkspaceRecommendations:popup", { userReaction: "install" }),
      onDidShowRecommendedExtensions: () => this.telemetryService.publicLog2("extensionWorkspaceRecommendations:popup", { userReaction: "show" }),
      onDidCancelRecommendedExtensions: () => this.telemetryService.publicLog2("extensionWorkspaceRecommendations:popup", { userReaction: "cancelled" }),
      onDidNeverShowRecommendedExtensionsAgain: () => {
        this.telemetryService.publicLog2("extensionWorkspaceRecommendations:popup", { userReaction: "neverShowAgain" });
        this.storageService.store(donotShowWorkspaceRecommendationsStorageKey, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
      }
    });
  }
  async promptRecommendationsNotification({ extensions: extensionIds, source, name, searchValue }, recommendationsNotificationActions) {
    if (this.hasToIgnoreRecommendationNotifications()) {
      return RecommendationsNotificationResult.Ignored;
    }
    if (source === RecommendationSource.EXE && this.workbenchEnvironmentService.remoteAuthority) {
      return RecommendationsNotificationResult.IncompatibleWindow;
    }
    if (source === RecommendationSource.EXE && (this.recommendationSources.includes(RecommendationSource.EXE) || this.recommendationSources.length >= 2)) {
      return RecommendationsNotificationResult.TooMany;
    }
    this.recommendationSources.push(source);
    if (source === RecommendationSource.EXE && extensionIds.every((id) => isString(id) && this.recommendedExtensions.includes(id))) {
      return RecommendationsNotificationResult.Ignored;
    }
    const extensions = await this.getInstallableExtensions(extensionIds);
    if (!extensions.length) {
      return RecommendationsNotificationResult.Ignored;
    }
    this.recommendedExtensions = distinct([...this.recommendedExtensions, ...extensionIds.filter(isString)]);
    let extensionsMessage = "";
    if (extensions.length === 1) {
      extensionsMessage = localize("extensionFromPublisher", "'{0}' extension from {1}", extensions[0].displayName, extensions[0].publisherDisplayName);
    } else {
      const publishers = [...extensions.reduce((result, extension) => result.add(extension.publisherDisplayName), /* @__PURE__ */ new Set())];
      if (publishers.length > 2) {
        extensionsMessage = localize("extensionsFromMultiplePublishers", "extensions from {0}, {1} and others", publishers[0], publishers[1]);
      } else if (publishers.length === 2) {
        extensionsMessage = localize("extensionsFromPublishers", "extensions from {0} and {1}", publishers[0], publishers[1]);
      } else {
        extensionsMessage = localize("extensionsFromPublisher", "extensions from {0}", publishers[0]);
      }
    }
    let message = localize("recommended", "Do you want to install the recommended {0} for {1}?", extensionsMessage, name);
    if (source === RecommendationSource.EXE) {
      message = localize({ key: "exeRecommended", comment: ["Placeholder string is the name of the software that is installed."] }, "You have {0} installed on your system. Do you want to install the recommended {1} for it?", name, extensionsMessage);
    }
    if (!searchValue) {
      searchValue = source === RecommendationSource.WORKSPACE ? "@recommended" : extensions.map((extensionId) => `@id:${extensionId.identifier.id}`).join(" ");
    }
    const donotShowAgainLabel = source === RecommendationSource.WORKSPACE ? localize("donotShowAgain", "Don't Show Again for this Repository") : extensions.length > 1 ? localize("donotShowAgainExtension", "Don't Show Again for these Extensions") : localize("donotShowAgainExtensionSingle", "Don't Show Again for this Extension");
    return raceCancellablePromises([
      this._registerP(this.showRecommendationsNotification(extensions, message, searchValue, donotShowAgainLabel, source, recommendationsNotificationActions)),
      this._registerP(this.waitUntilRecommendationsAreInstalled(extensions))
    ]);
  }
  showRecommendationsNotification(extensions, message, searchValue, donotShowAgainLabel, source, { onDidInstallRecommendedExtensions, onDidShowRecommendedExtensions, onDidCancelRecommendedExtensions, onDidNeverShowRecommendedExtensionsAgain }) {
    return createCancelablePromise(async (token) => {
      let accepted = false;
      const choices = [];
      const installExtensions = async (isMachineScoped) => {
        this.extensionsWorkbenchService.openSearch(searchValue);
        onDidInstallRecommendedExtensions(extensions);
        const galleryExtensions = [], resourceExtensions = [];
        for (const extension of extensions) {
          if (extension.gallery) {
            galleryExtensions.push(extension.gallery);
          } else if (extension.resourceExtension) {
            resourceExtensions.push(extension);
          }
        }
        await Promises.settled([
          Promises.settled(extensions.map((extension) => this.extensionsWorkbenchService.open(extension, { pinned: true }))),
          galleryExtensions.length ? this.extensionManagementService.installGalleryExtensions(galleryExtensions.map((e) => ({ extension: e, options: { isMachineScoped } }))) : Promise.resolve(),
          resourceExtensions.length ? Promise.allSettled(resourceExtensions.map((r) => this.extensionsWorkbenchService.install(r))) : Promise.resolve()
        ]);
      };
      choices.push({
        label: localize("install", "Install"),
        run: () => installExtensions(false),
        menu: this.userDataSyncEnablementService.isEnabled() && this.userDataSyncEnablementService.isResourceEnabled(SyncResource.Extensions) ? [{
          label: localize("install and do no sync", "Install (Do not sync)"),
          run: () => installExtensions(true)
        }] : void 0
      });
      choices.push(...[{
        label: localize("show recommendations", "Show Recommendations"),
        run: async () => {
          onDidShowRecommendedExtensions(extensions);
          for (const extension of extensions) {
            this.extensionsWorkbenchService.open(extension, { pinned: true });
          }
          this.extensionsWorkbenchService.openSearch(searchValue);
        }
      }, {
        label: donotShowAgainLabel,
        isSecondary: true,
        run: () => {
          onDidNeverShowRecommendedExtensionsAgain(extensions);
        }
      }]);
      try {
        accepted = await this.doShowRecommendationsNotification(Severity.Info, message, choices, source, token);
      } catch (error) {
        if (!isCancellationError(error)) {
          throw error;
        }
      }
      if (accepted) {
        return RecommendationsNotificationResult.Accepted;
      } else {
        onDidCancelRecommendedExtensions(extensions);
        return RecommendationsNotificationResult.Cancelled;
      }
    });
  }
  waitUntilRecommendationsAreInstalled(extensions) {
    const installedExtensions = [];
    const disposables = new DisposableStore();
    return createCancelablePromise(async (token) => {
      disposables.add(token.onCancellationRequested((e) => disposables.dispose()));
      return new Promise((c, e) => {
        disposables.add(this.extensionManagementService.onInstallExtension((e2) => {
          installedExtensions.push(e2.identifier.id.toLowerCase());
          if (extensions.every((e3) => installedExtensions.includes(e3.identifier.id.toLowerCase()))) {
            c(RecommendationsNotificationResult.Accepted);
          }
        }));
      });
    });
  }
  /**
   * Show recommendations in Queue
   * At any time only one recommendation is shown
   * If a new recommendation comes in
   * 		=> If no recommendation is visible, show it immediately
   *		=> Otherwise, add to the pending queue
   * 			=> If it is not exe based and has higher or same priority as current, hide the current notification after showing it for 3s.
   * 			=> Otherwise wait until the current notification is hidden.
   */
  async doShowRecommendationsNotification(severity, message, choices, source, token) {
    const disposables = new DisposableStore();
    try {
      const recommendationsNotification = disposables.add(new RecommendationsNotification(severity, message, choices, this.notificationService));
      disposables.add(Event.once(Event.filter(recommendationsNotification.onDidChangeVisibility, (e) => !e))(() => this.showNextNotification()));
      if (this.visibleNotification) {
        const index = this.pendingNotificaitons.length;
        disposables.add(token.onCancellationRequested(() => this.pendingNotificaitons.splice(index, 1)));
        this.pendingNotificaitons.push({ recommendationsNotification, source, token });
        if (source !== RecommendationSource.EXE && source <= this.visibleNotification.source) {
          this.hideVisibleNotification(3e3);
        }
      } else {
        this.visibleNotification = { recommendationsNotification, source, from: Date.now() };
        recommendationsNotification.show();
      }
      await raceCancellation(new Promise((c) => disposables.add(Event.once(recommendationsNotification.onDidClose)(c))), token);
      return !recommendationsNotification.isCancelled();
    } finally {
      disposables.dispose();
    }
  }
  showNextNotification() {
    const index = this.getNextPendingNotificationIndex();
    const [nextNotificaiton] = index > -1 ? this.pendingNotificaitons.splice(index, 1) : [];
    timeout(nextNotificaiton ? 500 : 0).then(() => {
      this.unsetVisibileNotification();
      if (nextNotificaiton) {
        this.visibleNotification = { recommendationsNotification: nextNotificaiton.recommendationsNotification, source: nextNotificaiton.source, from: Date.now() };
        nextNotificaiton.recommendationsNotification.show();
      }
    });
  }
  /**
   * Return the recent high priroity pending notification
   */
  getNextPendingNotificationIndex() {
    let index = this.pendingNotificaitons.length - 1;
    if (this.pendingNotificaitons.length) {
      for (let i = 0; i < this.pendingNotificaitons.length; i++) {
        if (this.pendingNotificaitons[i].source <= this.pendingNotificaitons[index].source) {
          index = i;
        }
      }
    }
    return index;
  }
  hideVisibleNotification(timeInMillis) {
    if (this.visibleNotification && !this.hideVisibleNotificationPromise) {
      const visibleNotification = this.visibleNotification;
      this.hideVisibleNotificationPromise = timeout(Math.max(timeInMillis - (Date.now() - visibleNotification.from), 0));
      this.hideVisibleNotificationPromise.then(() => visibleNotification.recommendationsNotification.hide());
    }
  }
  unsetVisibileNotification() {
    this.hideVisibleNotificationPromise?.cancel();
    this.hideVisibleNotificationPromise = void 0;
    this.visibleNotification = void 0;
  }
  async getInstallableExtensions(recommendations) {
    const result = [];
    if (recommendations.length) {
      const galleryExtensions = [];
      const resourceExtensions = [];
      for (const recommendation of recommendations) {
        if (typeof recommendation === "string") {
          galleryExtensions.push(recommendation);
        } else {
          resourceExtensions.push(recommendation);
        }
      }
      if (galleryExtensions.length) {
        const extensions = await this.extensionsWorkbenchService.getExtensions(galleryExtensions.map((id) => ({ id })), { source: "install-recommendations" }, CancellationToken.None);
        for (const extension of extensions) {
          if (extension.gallery && await this.extensionManagementService.canInstall(extension.gallery) === true) {
            result.push(extension);
          }
        }
      }
      if (resourceExtensions.length) {
        const extensions = await this.extensionsWorkbenchService.getResourceExtensions(resourceExtensions, true);
        for (const extension of extensions) {
          if (await this.extensionsWorkbenchService.canInstall(extension) === true) {
            result.push(extension);
          }
        }
      }
    }
    return result;
  }
  addToImportantRecommendationsIgnore(id) {
    const importantRecommendationsIgnoreList = [...this.ignoredRecommendations];
    if (!importantRecommendationsIgnoreList.includes(id.toLowerCase())) {
      importantRecommendationsIgnoreList.push(id.toLowerCase());
      this.storageService.store(ignoreImportantExtensionRecommendationStorageKey, JSON.stringify(importantRecommendationsIgnoreList), StorageScope.PROFILE, StorageTarget.USER);
    }
  }
  setIgnoreRecommendationsConfig(configVal) {
    this.configurationService.updateValue("extensions.ignoreRecommendations", configVal);
  }
  _registerP(o) {
    this._register(toDisposable(() => o.cancel()));
    return o;
  }
};
ExtensionRecommendationNotificationService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IExtensionsWorkbenchService),
  __decorateParam(5, IWorkbenchExtensionManagementService),
  __decorateParam(6, IWorkbenchExtensionEnablementService),
  __decorateParam(7, IExtensionIgnoredRecommendationsService),
  __decorateParam(8, IUserDataSyncEnablementService),
  __decorateParam(9, IWorkbenchEnvironmentService),
  __decorateParam(10, IUriIdentityService)
], ExtensionRecommendationNotificationService);
export {
  ExtensionRecommendationNotificationService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXGJyb3dzZXJcXGV4dGVuc2lvblJlY29tbWVuZGF0aW9uTm90aWZpY2F0aW9uU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRpc3RpbmN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSwgUHJvbWlzZXMsIHJhY2VDYW5jZWxsYWJsZVByb21pc2VzLCByYWNlQ2FuY2VsbGF0aW9uLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElHYWxsZXJ5RXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBhcmVTYW1lRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbk5vdGlmaWNhdGlvblNlcnZpY2UsIElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnMsIFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvblJlc3VsdCwgUmVjb21tZW5kYXRpb25Tb3VyY2UsIFJlY29tbWVuZGF0aW9uU291cmNlVG9TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMvY29tbW9uL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uSGFuZGxlLCBJTm90aWZpY2F0aW9uU2VydmljZSwgSVByb21wdENob2ljZSwgSVByb21wdENob2ljZVdpdGhNZW51LCBOb3RpZmljYXRpb25Qcmlvcml0eSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSwgU3luY1Jlc291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbiwgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRW5hYmxlbWVudFN0YXRlLCBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zL2NvbW1vbi9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMuanMnO1xuXG50eXBlIEV4dGVuc2lvblJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbkNsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ3NhbmR5MDgxJztcblx0Y29tbWVudDogJ1Jlc3BvbnNlIGluZm9ybWF0aW9uIHdoZW4gYW4gZXh0ZW5zaW9uIGlzIHJlY29tbWVuZGVkJztcblx0dXNlclJlYWN0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVXNlciByZWFjdGlvbiBhZnRlciBzaG93aW5nIHRoZSByZWNvbW1lbmRhdGlvbiBwcm9tcHQuIEVnLiwgaW5zdGFsbCwgY2FuY2VsLCBzaG93LCBuZXZlclNob3dBZ2FpbicgfTtcblx0ZXh0ZW5zaW9uSWQ/OiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0lkIG9mIHRoZSBleHRlbnNpb24gdGhhdCBpcyByZWNvbW1lbmRlZCcgfTtcblx0c291cmNlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHNvdXJjZSBmcm9tIHdoaWNoIHRoaXMgcmVjb21tZW5kYXRpb24gaXMgY29taW5nIGZyb20uIEVnLiwgZmlsZSwgZXhlLiwnIH07XG59O1xuXG50eXBlIEV4dGVuc2lvbldvcmtzcGFjZVJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbkNsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ3NhbmR5MDgxJztcblx0Y29tbWVudDogJ1Jlc3BvbnNlIGluZm9ybWF0aW9uIHdoZW4gYSByZWNvbW1lbmRhdGlvbiBmcm9tIHdvcmtzcGFjZSBpcyByZWNvbW1lbmRlZCc7XG5cdHVzZXJSZWFjdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1VzZXIgcmVhY3Rpb24gYWZ0ZXIgc2hvd2luZyB0aGUgcmVjb21tZW5kYXRpb24gcHJvbXB0LiBFZy4sIGluc3RhbGwsIGNhbmNlbCwgc2hvdywgbmV2ZXJTaG93QWdhaW4nIH07XG59O1xuXG5jb25zdCBpZ25vcmVJbXBvcnRhbnRFeHRlbnNpb25SZWNvbW1lbmRhdGlvblN0b3JhZ2VLZXkgPSAnZXh0ZW5zaW9uc0Fzc2lzdGFudC9pbXBvcnRhbnRSZWNvbW1lbmRhdGlvbnNJZ25vcmUnO1xuY29uc3QgZG9ub3RTaG93V29ya3NwYWNlUmVjb21tZW5kYXRpb25zU3RvcmFnZUtleSA9ICdleHRlbnNpb25zQXNzaXN0YW50L3dvcmtzcGFjZVJlY29tbWVuZGF0aW9uc0lnbm9yZSc7XG5cbnR5cGUgUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uQWN0aW9ucyA9IHtcblx0b25EaWRJbnN0YWxsUmVjb21tZW5kZWRFeHRlbnNpb25zKGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSk6IHZvaWQ7XG5cdG9uRGlkU2hvd1JlY29tbWVuZGVkRXh0ZW5zaW9ucyhleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10pOiB2b2lkO1xuXHRvbkRpZENhbmNlbFJlY29tbWVuZGVkRXh0ZW5zaW9ucyhleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10pOiB2b2lkO1xuXHRvbkRpZE5ldmVyU2hvd1JlY29tbWVuZGVkRXh0ZW5zaW9uc0FnYWluKGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSk6IHZvaWQ7XG59O1xuXG50eXBlIEV4dGVuc2lvblJlY29tbWVuZGF0aW9ucyA9IE9taXQ8SUV4dGVuc2lvblJlY29tbWVuZGF0aW9ucywgJ2V4dGVuc2lvbnMnPiAmIHsgZXh0ZW5zaW9uczogQXJyYXk8c3RyaW5nIHwgVVJJPiB9O1xuXG5jbGFzcyBSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9vbkRpZENsb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xvc2UgPSB0aGlzLl9vbkRpZENsb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlVmlzaWJpbGl0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpc2liaWxpdHkgPSB0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZXZlbnQ7XG5cblx0cHJpdmF0ZSBub3RpZmljYXRpb25IYW5kbGU6IElOb3RpZmljYXRpb25IYW5kbGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY2FuY2VsbGVkOiBib29sZWFuID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzZXZlcml0eTogU2V2ZXJpdHksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtZXNzYWdlOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjaG9pY2VzOiBJUHJvbXB0Q2hvaWNlW10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0c2hvdygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubm90aWZpY2F0aW9uSGFuZGxlKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZU5vdGlmaWNhdGlvbkhhbmRsZSh0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KHRoaXMuc2V2ZXJpdHksIHRoaXMubWVzc2FnZSwgdGhpcy5jaG9pY2VzLCB7IHN0aWNreTogdHJ1ZSwgcHJpb3JpdHk6IE5vdGlmaWNhdGlvblByaW9yaXR5Lk9QVElPTkFMLCBvbkNhbmNlbDogKCkgPT4gdGhpcy5jYW5jZWxsZWQgPSB0cnVlIH0pKTtcblx0XHR9XG5cdH1cblxuXHRoaWRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLm5vdGlmaWNhdGlvbkhhbmRsZSkge1xuXHRcdFx0dGhpcy5vbkRpZENsb3NlRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25IYW5kbGUuY2xvc2UoKTtcblx0XHRcdHRoaXMuY2FuY2VsbGVkID0gZmFsc2U7XG5cdFx0XHR0aGlzLnVwZGF0ZU5vdGlmaWNhdGlvbkhhbmRsZSh0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KHRoaXMuc2V2ZXJpdHksIHRoaXMubWVzc2FnZSwgdGhpcy5jaG9pY2VzLCB7IHByaW9yaXR5OiBOb3RpZmljYXRpb25Qcmlvcml0eS5TSUxFTlQsIG9uQ2FuY2VsOiAoKSA9PiB0aGlzLmNhbmNlbGxlZCA9IHRydWUgfSkpO1xuXHRcdH1cblx0fVxuXG5cdGlzQ2FuY2VsbGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNhbmNlbGxlZDtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRDbG9zZURpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VWaXNpYmlsaXR5RGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSB1cGRhdGVOb3RpZmljYXRpb25IYW5kbGUobm90aWZpY2F0aW9uSGFuZGxlOiBJTm90aWZpY2F0aW9uSGFuZGxlKSB7XG5cdFx0dGhpcy5vbkRpZENsb3NlRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VWaXNpYmlsaXR5RGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdHRoaXMubm90aWZpY2F0aW9uSGFuZGxlID0gbm90aWZpY2F0aW9uSGFuZGxlO1xuXG5cdFx0dGhpcy5vbkRpZENsb3NlRGlzcG9zYWJsZS52YWx1ZSA9IHRoaXMubm90aWZpY2F0aW9uSGFuZGxlLm9uRGlkQ2xvc2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5vbkRpZENsb3NlRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlVmlzaWJpbGl0eURpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXG5cdFx0XHR0aGlzLl9vbkRpZENsb3NlLmZpcmUoKTtcblxuXHRcdFx0dGhpcy5fb25EaWRDbG9zZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VWaXNpYmlsaXR5RGlzcG9zYWJsZS52YWx1ZSA9IHRoaXMubm90aWZpY2F0aW9uSGFuZGxlLm9uRGlkQ2hhbmdlVmlzaWJpbGl0eSgoZSkgPT4gdGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmZpcmUoZSkpO1xuXHR9XG59XG5cbnR5cGUgUGVuZGluZ1JlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbiA9IHsgcmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uOiBSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb247IHNvdXJjZTogUmVjb21tZW5kYXRpb25Tb3VyY2U7IHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiB9O1xudHlwZSBWaXNpYmxlUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uID0geyByZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb246IFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbjsgc291cmNlOiBSZWNvbW1lbmRhdGlvblNvdXJjZTsgZnJvbTogbnVtYmVyIH07XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25SZWNvbW1lbmRhdGlvbk5vdGlmaWNhdGlvblNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dGVuc2lvblJlY29tbWVuZGF0aW9uTm90aWZpY2F0aW9uU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Ly8gSWdub3JlZCBJbXBvcnRhbnQgUmVjb21tZW5kYXRpb25zXG5cdGdldCBpZ25vcmVkUmVjb21tZW5kYXRpb25zKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gZGlzdGluY3QoWy4uLig8c3RyaW5nW10+SlNPTi5wYXJzZSh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChpZ25vcmVJbXBvcnRhbnRFeHRlbnNpb25SZWNvbW1lbmRhdGlvblN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCAnW10nKSkpXS5tYXAoaSA9PiBpLnRvTG93ZXJDYXNlKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVjb21tZW5kZWRFeHRlbnNpb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRwcml2YXRlIHJlY29tbWVuZGF0aW9uU291cmNlczogUmVjb21tZW5kYXRpb25Tb3VyY2VbXSA9IFtdO1xuXG5cdHByaXZhdGUgaGlkZVZpc2libGVOb3RpZmljYXRpb25Qcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB2aXNpYmxlTm90aWZpY2F0aW9uOiBWaXNpYmxlUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHBlbmRpbmdOb3RpZmljYWl0b25zOiBQZW5kaW5nUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uSWdub3JlZFJlY29tbWVuZGF0aW9uc1NlcnZpY2U6IElFeHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGhhc1RvSWdub3JlUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25zKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8eyBpZ25vcmVSZWNvbW1lbmRhdGlvbnM6IGJvb2xlYW47IHNob3dSZWNvbW1lbmRhdGlvbnNPbmx5T25EZW1hbmQ/OiBib29sZWFuIH0+KCdleHRlbnNpb25zJyk7XG5cdFx0cmV0dXJuIGNvbmZpZy5pZ25vcmVSZWNvbW1lbmRhdGlvbnMgfHwgISFjb25maWcuc2hvd1JlY29tbWVuZGF0aW9uc09ubHlPbkRlbWFuZDtcblx0fVxuXG5cdGFzeW5jIHByb21wdEltcG9ydGFudEV4dGVuc2lvbnNJbnN0YWxsTm90aWZpY2F0aW9uKGV4dGVuc2lvblJlY29tbWVuZGF0aW9uczogSUV4dGVuc2lvblJlY29tbWVuZGF0aW9ucyk6IFByb21pc2U8UmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uUmVzdWx0PiB7XG5cdFx0Y29uc3QgaWdub3JlZFJlY29tbWVuZGF0aW9ucyA9IFsuLi50aGlzLmV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLmlnbm9yZWRSZWNvbW1lbmRhdGlvbnMsIC4uLnRoaXMuaWdub3JlZFJlY29tbWVuZGF0aW9uc107XG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGV4dGVuc2lvblJlY29tbWVuZGF0aW9ucy5leHRlbnNpb25zLmZpbHRlcihpZCA9PiAhaWdub3JlZFJlY29tbWVuZGF0aW9ucy5pbmNsdWRlcyhpZCkpO1xuXHRcdGlmICghZXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25SZXN1bHQuSWdub3JlZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5wcm9tcHRSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb24oeyAuLi5leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMsIGV4dGVuc2lvbnMgfSwge1xuXHRcdFx0b25EaWRJbnN0YWxsUmVjb21tZW5kZWRFeHRlbnNpb25zOiAoZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdKSA9PiBleHRlbnNpb25zLmZvckVhY2goZXh0ZW5zaW9uID0+IHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHsgdXNlclJlYWN0aW9uOiBzdHJpbmc7IGV4dGVuc2lvbklkOiBzdHJpbmc7IHNvdXJjZTogc3RyaW5nIH0sIEV4dGVuc2lvblJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbkNsYXNzaWZpY2F0aW9uPignZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zOnBvcHVwJywgeyB1c2VyUmVhY3Rpb246ICdpbnN0YWxsJywgZXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBzb3VyY2U6IFJlY29tbWVuZGF0aW9uU291cmNlVG9TdHJpbmcoZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLnNvdXJjZSkgfSkpLFxuXHRcdFx0b25EaWRTaG93UmVjb21tZW5kZWRFeHRlbnNpb25zOiAoZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdKSA9PiBleHRlbnNpb25zLmZvckVhY2goZXh0ZW5zaW9uID0+IHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHsgdXNlclJlYWN0aW9uOiBzdHJpbmc7IGV4dGVuc2lvbklkOiBzdHJpbmc7IHNvdXJjZTogc3RyaW5nIH0sIEV4dGVuc2lvblJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbkNsYXNzaWZpY2F0aW9uPignZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zOnBvcHVwJywgeyB1c2VyUmVhY3Rpb246ICdzaG93JywgZXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBzb3VyY2U6IFJlY29tbWVuZGF0aW9uU291cmNlVG9TdHJpbmcoZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLnNvdXJjZSkgfSkpLFxuXHRcdFx0b25EaWRDYW5jZWxSZWNvbW1lbmRlZEV4dGVuc2lvbnM6IChleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10pID0+IGV4dGVuc2lvbnMuZm9yRWFjaChleHRlbnNpb24gPT4gdGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8eyB1c2VyUmVhY3Rpb246IHN0cmluZzsgZXh0ZW5zaW9uSWQ6IHN0cmluZzsgc291cmNlOiBzdHJpbmcgfSwgRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uQ2xhc3NpZmljYXRpb24+KCdleHRlbnNpb25SZWNvbW1lbmRhdGlvbnM6cG9wdXAnLCB7IHVzZXJSZWFjdGlvbjogJ2NhbmNlbGxlZCcsIGV4dGVuc2lvbklkOiBleHRlbnNpb24uaWRlbnRpZmllci5pZCwgc291cmNlOiBSZWNvbW1lbmRhdGlvblNvdXJjZVRvU3RyaW5nKGV4dGVuc2lvblJlY29tbWVuZGF0aW9ucy5zb3VyY2UpIH0pKSxcblx0XHRcdG9uRGlkTmV2ZXJTaG93UmVjb21tZW5kZWRFeHRlbnNpb25zQWdhaW46IChleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10pID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRcdHRoaXMuYWRkVG9JbXBvcnRhbnRSZWNvbW1lbmRhdGlvbnNJZ25vcmUoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHsgdXNlclJlYWN0aW9uOiBzdHJpbmc7IGV4dGVuc2lvbklkOiBzdHJpbmc7IHNvdXJjZTogc3RyaW5nIH0sIEV4dGVuc2lvblJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbkNsYXNzaWZpY2F0aW9uPignZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zOnBvcHVwJywgeyB1c2VyUmVhY3Rpb246ICduZXZlclNob3dBZ2FpbicsIGV4dGVuc2lvbklkOiBleHRlbnNpb24uaWRlbnRpZmllci5pZCwgc291cmNlOiBSZWNvbW1lbmRhdGlvblNvdXJjZVRvU3RyaW5nKGV4dGVuc2lvblJlY29tbWVuZGF0aW9ucy5zb3VyY2UpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFx0U2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnaWdub3JlRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zJywgXCJEbyB5b3Ugd2FudCB0byBpZ25vcmUgYWxsIGV4dGVuc2lvbiByZWNvbW1lbmRhdGlvbnM/XCIpLFxuXHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2lnbm9yZUFsbCcsIFwiWWVzLCBJZ25vcmUgQWxsXCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLnNldElnbm9yZVJlY29tbWVuZGF0aW9uc0NvbmZpZyh0cnVlKVxuXHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbm8nLCBcIk5vXCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLnNldElnbm9yZVJlY29tbWVuZGF0aW9uc0NvbmZpZyhmYWxzZSlcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHByb21wdFdvcmtzcGFjZVJlY29tbWVuZGF0aW9ucyhyZWNvbW1lbmRhdGlvbnM6IEFycmF5PHN0cmluZyB8IFVSST4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKGRvbm90U2hvd1dvcmtzcGFjZVJlY29tbWVuZGF0aW9uc1N0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIGZhbHNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBpbnN0YWxsZWQgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZCgpO1xuXHRcdGluc3RhbGxlZCA9IGluc3RhbGxlZC5maWx0ZXIobCA9PiB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmdldEVuYWJsZW1lbnRTdGF0ZShsKSAhPT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlFeHRlbnNpb25LaW5kKTsgLy8gRmlsdGVyIGV4dGVuc2lvbnMgZGlzYWJsZWQgYnkga2luZFxuXHRcdHJlY29tbWVuZGF0aW9ucyA9IHJlY29tbWVuZGF0aW9ucy5maWx0ZXIocmVjb21tZW5kYXRpb24gPT4gaW5zdGFsbGVkLmV2ZXJ5KGxvY2FsID0+XG5cdFx0XHRpc1N0cmluZyhyZWNvbW1lbmRhdGlvbikgPyAhYXJlU2FtZUV4dGVuc2lvbnMoeyBpZDogcmVjb21tZW5kYXRpb24gfSwgbG9jYWwuaWRlbnRpZmllcikgOiAhdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwocmVjb21tZW5kYXRpb24sIGxvY2FsLmxvY2F0aW9uKVxuXHRcdCkpO1xuXHRcdGlmICghcmVjb21tZW5kYXRpb25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMucHJvbXB0UmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uKHsgZXh0ZW5zaW9uczogcmVjb21tZW5kYXRpb25zLCBzb3VyY2U6IFJlY29tbWVuZGF0aW9uU291cmNlLldPUktTUEFDRSwgbmFtZTogbG9jYWxpemUoeyBrZXk6ICd0aGlzIHJlcG9zaXRvcnknLCBjb21tZW50OiBbJ3RoaXMgcmVwb3NpdG9yeSBtZWFucyB0aGUgY3VycmVudCByZXBvc2l0b3J5IHRoYXQgaXMgb3BlbmVkJ10gfSwgXCJ0aGlzIHJlcG9zaXRvcnlcIikgfSwge1xuXHRcdFx0b25EaWRJbnN0YWxsUmVjb21tZW5kZWRFeHRlbnNpb25zOiAoKSA9PiB0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7IHVzZXJSZWFjdGlvbjogc3RyaW5nIH0sIEV4dGVuc2lvbldvcmtzcGFjZVJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbkNsYXNzaWZpY2F0aW9uPignZXh0ZW5zaW9uV29ya3NwYWNlUmVjb21tZW5kYXRpb25zOnBvcHVwJywgeyB1c2VyUmVhY3Rpb246ICdpbnN0YWxsJyB9KSxcblx0XHRcdG9uRGlkU2hvd1JlY29tbWVuZGVkRXh0ZW5zaW9uczogKCkgPT4gdGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8eyB1c2VyUmVhY3Rpb246IHN0cmluZyB9LCBFeHRlbnNpb25Xb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25DbGFzc2lmaWNhdGlvbj4oJ2V4dGVuc2lvbldvcmtzcGFjZVJlY29tbWVuZGF0aW9uczpwb3B1cCcsIHsgdXNlclJlYWN0aW9uOiAnc2hvdycgfSksXG5cdFx0XHRvbkRpZENhbmNlbFJlY29tbWVuZGVkRXh0ZW5zaW9uczogKCkgPT4gdGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8eyB1c2VyUmVhY3Rpb246IHN0cmluZyB9LCBFeHRlbnNpb25Xb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25DbGFzc2lmaWNhdGlvbj4oJ2V4dGVuc2lvbldvcmtzcGFjZVJlY29tbWVuZGF0aW9uczpwb3B1cCcsIHsgdXNlclJlYWN0aW9uOiAnY2FuY2VsbGVkJyB9KSxcblx0XHRcdG9uRGlkTmV2ZXJTaG93UmVjb21tZW5kZWRFeHRlbnNpb25zQWdhaW46ICgpID0+IHtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8eyB1c2VyUmVhY3Rpb246IHN0cmluZyB9LCBFeHRlbnNpb25Xb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25DbGFzc2lmaWNhdGlvbj4oJ2V4dGVuc2lvbldvcmtzcGFjZVJlY29tbWVuZGF0aW9uczpwb3B1cCcsIHsgdXNlclJlYWN0aW9uOiAnbmV2ZXJTaG93QWdhaW4nIH0pO1xuXHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKGRvbm90U2hvd1dvcmtzcGFjZVJlY29tbWVuZGF0aW9uc1N0b3JhZ2VLZXksIHRydWUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHByb21wdFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbih7IGV4dGVuc2lvbnM6IGV4dGVuc2lvbklkcywgc291cmNlLCBuYW1lLCBzZWFyY2hWYWx1ZSB9OiBFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnMsIHJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbkFjdGlvbnM6IFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbkFjdGlvbnMpOiBQcm9taXNlPFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvblJlc3VsdD4ge1xuXG5cdFx0aWYgKHRoaXMuaGFzVG9JZ25vcmVSZWNvbW1lbmRhdGlvbk5vdGlmaWNhdGlvbnMoKSkge1xuXHRcdFx0cmV0dXJuIFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvblJlc3VsdC5JZ25vcmVkO1xuXHRcdH1cblxuXHRcdC8vIERvIG5vdCBzaG93IGV4ZSBiYXNlZCByZWNvbW1lbmRhdGlvbnMgaW4gcmVtb3RlIHdpbmRvd1xuXHRcdGlmIChzb3VyY2UgPT09IFJlY29tbWVuZGF0aW9uU291cmNlLkVYRSAmJiB0aGlzLndvcmtiZW5jaEVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdHJldHVybiBSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25SZXN1bHQuSW5jb21wYXRpYmxlV2luZG93O1xuXHRcdH1cblxuXHRcdC8vIElnbm9yZSBleGUgcmVjb21tZW5kYXRpb24gaWYgdGhlIHdpbmRvd1xuXHRcdC8vIFx0XHQ9PiBoYXMgc2hvd24gYW4gZXhlIGJhc2VkIHJlY29tbWVuZGF0aW9uIGFscmVhZHlcblx0XHQvLyBcdFx0PT4gb3IgaGFzIHNob3duIGFueSB0d28gcmVjb21tZW5kYXRpb25zIGFscmVhZHlcblx0XHRpZiAoc291cmNlID09PSBSZWNvbW1lbmRhdGlvblNvdXJjZS5FWEUgJiYgKHRoaXMucmVjb21tZW5kYXRpb25Tb3VyY2VzLmluY2x1ZGVzKFJlY29tbWVuZGF0aW9uU291cmNlLkVYRSkgfHwgdGhpcy5yZWNvbW1lbmRhdGlvblNvdXJjZXMubGVuZ3RoID49IDIpKSB7XG5cdFx0XHRyZXR1cm4gUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uUmVzdWx0LlRvb01hbnk7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZWNvbW1lbmRhdGlvblNvdXJjZXMucHVzaChzb3VyY2UpO1xuXG5cdFx0Ly8gSWdub3JlIGV4ZSByZWNvbW1lbmRhdGlvbiBpZiByZWNvbW1lbmRhdGlvbnMgYXJlIGFscmVhZHkgc2hvd25cblx0XHRpZiAoc291cmNlID09PSBSZWNvbW1lbmRhdGlvblNvdXJjZS5FWEUgJiYgZXh0ZW5zaW9uSWRzLmV2ZXJ5KGlkID0+IGlzU3RyaW5nKGlkKSAmJiB0aGlzLnJlY29tbWVuZGVkRXh0ZW5zaW9ucy5pbmNsdWRlcyhpZCkpKSB7XG5cdFx0XHRyZXR1cm4gUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uUmVzdWx0Lklnbm9yZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZ2V0SW5zdGFsbGFibGVFeHRlbnNpb25zKGV4dGVuc2lvbklkcyk7XG5cdFx0aWYgKCFleHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvblJlc3VsdC5JZ25vcmVkO1xuXHRcdH1cblxuXHRcdHRoaXMucmVjb21tZW5kZWRFeHRlbnNpb25zID0gZGlzdGluY3QoWy4uLnRoaXMucmVjb21tZW5kZWRFeHRlbnNpb25zLCAuLi5leHRlbnNpb25JZHMuZmlsdGVyKGlzU3RyaW5nKV0pO1xuXG5cdFx0bGV0IGV4dGVuc2lvbnNNZXNzYWdlID0gJyc7XG5cdFx0aWYgKGV4dGVuc2lvbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRleHRlbnNpb25zTWVzc2FnZSA9IGxvY2FsaXplKCdleHRlbnNpb25Gcm9tUHVibGlzaGVyJywgXCInezB9JyBleHRlbnNpb24gZnJvbSB7MX1cIiwgZXh0ZW5zaW9uc1swXS5kaXNwbGF5TmFtZSwgZXh0ZW5zaW9uc1swXS5wdWJsaXNoZXJEaXNwbGF5TmFtZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHB1Ymxpc2hlcnMgPSBbLi4uZXh0ZW5zaW9ucy5yZWR1Y2UoKHJlc3VsdCwgZXh0ZW5zaW9uKSA9PiByZXN1bHQuYWRkKGV4dGVuc2lvbi5wdWJsaXNoZXJEaXNwbGF5TmFtZSksIG5ldyBTZXQ8c3RyaW5nPigpKV07XG5cdFx0XHRpZiAocHVibGlzaGVycy5sZW5ndGggPiAyKSB7XG5cdFx0XHRcdGV4dGVuc2lvbnNNZXNzYWdlID0gbG9jYWxpemUoJ2V4dGVuc2lvbnNGcm9tTXVsdGlwbGVQdWJsaXNoZXJzJywgXCJleHRlbnNpb25zIGZyb20gezB9LCB7MX0gYW5kIG90aGVyc1wiLCBwdWJsaXNoZXJzWzBdLCBwdWJsaXNoZXJzWzFdKTtcblx0XHRcdH0gZWxzZSBpZiAocHVibGlzaGVycy5sZW5ndGggPT09IDIpIHtcblx0XHRcdFx0ZXh0ZW5zaW9uc01lc3NhZ2UgPSBsb2NhbGl6ZSgnZXh0ZW5zaW9uc0Zyb21QdWJsaXNoZXJzJywgXCJleHRlbnNpb25zIGZyb20gezB9IGFuZCB7MX1cIiwgcHVibGlzaGVyc1swXSwgcHVibGlzaGVyc1sxXSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRleHRlbnNpb25zTWVzc2FnZSA9IGxvY2FsaXplKCdleHRlbnNpb25zRnJvbVB1Ymxpc2hlcicsIFwiZXh0ZW5zaW9ucyBmcm9tIHswfVwiLCBwdWJsaXNoZXJzWzBdKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgbWVzc2FnZSA9IGxvY2FsaXplKCdyZWNvbW1lbmRlZCcsIFwiRG8geW91IHdhbnQgdG8gaW5zdGFsbCB0aGUgcmVjb21tZW5kZWQgezB9IGZvciB7MX0/XCIsIGV4dGVuc2lvbnNNZXNzYWdlLCBuYW1lKTtcblx0XHRpZiAoc291cmNlID09PSBSZWNvbW1lbmRhdGlvblNvdXJjZS5FWEUpIHtcblx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSh7IGtleTogJ2V4ZVJlY29tbWVuZGVkJywgY29tbWVudDogWydQbGFjZWhvbGRlciBzdHJpbmcgaXMgdGhlIG5hbWUgb2YgdGhlIHNvZnR3YXJlIHRoYXQgaXMgaW5zdGFsbGVkLiddIH0sIFwiWW91IGhhdmUgezB9IGluc3RhbGxlZCBvbiB5b3VyIHN5c3RlbS4gRG8geW91IHdhbnQgdG8gaW5zdGFsbCB0aGUgcmVjb21tZW5kZWQgezF9IGZvciBpdD9cIiwgbmFtZSwgZXh0ZW5zaW9uc01lc3NhZ2UpO1xuXHRcdH1cblx0XHRpZiAoIXNlYXJjaFZhbHVlKSB7XG5cdFx0XHRzZWFyY2hWYWx1ZSA9IHNvdXJjZSA9PT0gUmVjb21tZW5kYXRpb25Tb3VyY2UuV09SS1NQQUNFID8gJ0ByZWNvbW1lbmRlZCcgOiBleHRlbnNpb25zLm1hcChleHRlbnNpb25JZCA9PiBgQGlkOiR7ZXh0ZW5zaW9uSWQuaWRlbnRpZmllci5pZH1gKS5qb2luKCcgJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZG9ub3RTaG93QWdhaW5MYWJlbCA9IHNvdXJjZSA9PT0gUmVjb21tZW5kYXRpb25Tb3VyY2UuV09SS1NQQUNFID8gbG9jYWxpemUoJ2Rvbm90U2hvd0FnYWluJywgXCJEb24ndCBTaG93IEFnYWluIGZvciB0aGlzIFJlcG9zaXRvcnlcIilcblx0XHRcdDogZXh0ZW5zaW9ucy5sZW5ndGggPiAxID8gbG9jYWxpemUoJ2Rvbm90U2hvd0FnYWluRXh0ZW5zaW9uJywgXCJEb24ndCBTaG93IEFnYWluIGZvciB0aGVzZSBFeHRlbnNpb25zXCIpIDogbG9jYWxpemUoJ2Rvbm90U2hvd0FnYWluRXh0ZW5zaW9uU2luZ2xlJywgXCJEb24ndCBTaG93IEFnYWluIGZvciB0aGlzIEV4dGVuc2lvblwiKTtcblxuXHRcdHJldHVybiByYWNlQ2FuY2VsbGFibGVQcm9taXNlcyhbXG5cdFx0XHR0aGlzLl9yZWdpc3RlclAodGhpcy5zaG93UmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uKGV4dGVuc2lvbnMsIG1lc3NhZ2UsIHNlYXJjaFZhbHVlLCBkb25vdFNob3dBZ2FpbkxhYmVsLCBzb3VyY2UsIHJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbkFjdGlvbnMpKSxcblx0XHRcdHRoaXMuX3JlZ2lzdGVyUCh0aGlzLndhaXRVbnRpbFJlY29tbWVuZGF0aW9uc0FyZUluc3RhbGxlZChleHRlbnNpb25zKSlcblx0XHRdKTtcblxuXHR9XG5cblx0cHJpdmF0ZSBzaG93UmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uKGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSwgbWVzc2FnZTogc3RyaW5nLCBzZWFyY2hWYWx1ZTogc3RyaW5nLCBkb25vdFNob3dBZ2FpbkxhYmVsOiBzdHJpbmcsIHNvdXJjZTogUmVjb21tZW5kYXRpb25Tb3VyY2UsXG5cdFx0eyBvbkRpZEluc3RhbGxSZWNvbW1lbmRlZEV4dGVuc2lvbnMsIG9uRGlkU2hvd1JlY29tbWVuZGVkRXh0ZW5zaW9ucywgb25EaWRDYW5jZWxSZWNvbW1lbmRlZEV4dGVuc2lvbnMsIG9uRGlkTmV2ZXJTaG93UmVjb21tZW5kZWRFeHRlbnNpb25zQWdhaW4gfTogUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uQWN0aW9ucyk6IENhbmNlbGFibGVQcm9taXNlPFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvblJlc3VsdD4ge1xuXHRcdHJldHVybiBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZTxSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25SZXN1bHQ+KGFzeW5jIHRva2VuID0+IHtcblx0XHRcdGxldCBhY2NlcHRlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgY2hvaWNlczogKElQcm9tcHRDaG9pY2UgfCBJUHJvbXB0Q2hvaWNlV2l0aE1lbnUpW10gPSBbXTtcblx0XHRcdGNvbnN0IGluc3RhbGxFeHRlbnNpb25zID0gYXN5bmMgKGlzTWFjaGluZVNjb3BlZDogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHR0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW5TZWFyY2goc2VhcmNoVmFsdWUpO1xuXHRcdFx0XHRvbkRpZEluc3RhbGxSZWNvbW1lbmRlZEV4dGVuc2lvbnMoZXh0ZW5zaW9ucyk7XG5cdFx0XHRcdGNvbnN0IGdhbGxlcnlFeHRlbnNpb25zOiBJR2FsbGVyeUV4dGVuc2lvbltdID0gW10sIHJlc291cmNlRXh0ZW5zaW9uczogSUV4dGVuc2lvbltdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdFx0XHRpZiAoZXh0ZW5zaW9uLmdhbGxlcnkpIHtcblx0XHRcdFx0XHRcdGdhbGxlcnlFeHRlbnNpb25zLnB1c2goZXh0ZW5zaW9uLmdhbGxlcnkpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZXh0ZW5zaW9uLnJlc291cmNlRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZUV4dGVuc2lvbnMucHVzaChleHRlbnNpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkPGFueT4oW1xuXHRcdFx0XHRcdFByb21pc2VzLnNldHRsZWQoZXh0ZW5zaW9ucy5tYXAoZXh0ZW5zaW9uID0+IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlbihleHRlbnNpb24sIHsgcGlubmVkOiB0cnVlIH0pKSksXG5cdFx0XHRcdFx0Z2FsbGVyeUV4dGVuc2lvbnMubGVuZ3RoID8gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsR2FsbGVyeUV4dGVuc2lvbnMoZ2FsbGVyeUV4dGVuc2lvbnMubWFwKGUgPT4gKHsgZXh0ZW5zaW9uOiBlLCBvcHRpb25zOiB7IGlzTWFjaGluZVNjb3BlZCB9IH0pKSkgOiBQcm9taXNlLnJlc29sdmUoKSxcblx0XHRcdFx0XHRyZXNvdXJjZUV4dGVuc2lvbnMubGVuZ3RoID8gUHJvbWlzZS5hbGxTZXR0bGVkKHJlc291cmNlRXh0ZW5zaW9ucy5tYXAociA9PiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmluc3RhbGwocikpKSA6IFByb21pc2UucmVzb2x2ZSgpXG5cdFx0XHRcdF0pO1xuXHRcdFx0fTtcblx0XHRcdGNob2ljZXMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnaW5zdGFsbCcsIFwiSW5zdGFsbFwiKSxcblx0XHRcdFx0cnVuOiAoKSA9PiBpbnN0YWxsRXh0ZW5zaW9ucyhmYWxzZSksXG5cdFx0XHRcdG1lbnU6IHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKCkgJiYgdGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc1Jlc291cmNlRW5hYmxlZChTeW5jUmVzb3VyY2UuRXh0ZW5zaW9ucykgPyBbe1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnaW5zdGFsbCBhbmQgZG8gbm8gc3luYycsIFwiSW5zdGFsbCAoRG8gbm90IHN5bmMpXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gaW5zdGFsbEV4dGVuc2lvbnModHJ1ZSlcblx0XHRcdFx0fV0gOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHRcdGNob2ljZXMucHVzaCguLi5be1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Nob3cgcmVjb21tZW5kYXRpb25zJywgXCJTaG93IFJlY29tbWVuZGF0aW9uc1wiKSxcblx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0b25EaWRTaG93UmVjb21tZW5kZWRFeHRlbnNpb25zKGV4dGVuc2lvbnMpO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdFx0XHRcdHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlbihleHRlbnNpb24sIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW5TZWFyY2goc2VhcmNoVmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCB7XG5cdFx0XHRcdGxhYmVsOiBkb25vdFNob3dBZ2FpbkxhYmVsLFxuXHRcdFx0XHRpc1NlY29uZGFyeTogdHJ1ZSxcblx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0b25EaWROZXZlclNob3dSZWNvbW1lbmRlZEV4dGVuc2lvbnNBZ2FpbihleHRlbnNpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0fV0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YWNjZXB0ZWQgPSBhd2FpdCB0aGlzLmRvU2hvd1JlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbihTZXZlcml0eS5JbmZvLCBtZXNzYWdlLCBjaG9pY2VzLCBzb3VyY2UsIHRva2VuKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlcnJvcikpIHtcblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYWNjZXB0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvblJlc3VsdC5BY2NlcHRlZDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG9uRGlkQ2FuY2VsUmVjb21tZW5kZWRFeHRlbnNpb25zKGV4dGVuc2lvbnMpO1xuXHRcdFx0XHRyZXR1cm4gUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uUmVzdWx0LkNhbmNlbGxlZDtcblx0XHRcdH1cblxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB3YWl0VW50aWxSZWNvbW1lbmRhdGlvbnNBcmVJbnN0YWxsZWQoZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdKTogQ2FuY2VsYWJsZVByb21pc2U8UmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uUmVzdWx0LkFjY2VwdGVkPiB7XG5cdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9uczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRyZXR1cm4gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoYXN5bmMgdG9rZW4gPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKGUgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKSk7XG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8UmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uUmVzdWx0LkFjY2VwdGVkPigoYywgZSkgPT4ge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkluc3RhbGxFeHRlbnNpb24oZSA9PiB7XG5cdFx0XHRcdFx0aW5zdGFsbGVkRXh0ZW5zaW9ucy5wdXNoKGUuaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdFx0XHRpZiAoZXh0ZW5zaW9ucy5ldmVyeShlID0+IGluc3RhbGxlZEV4dGVuc2lvbnMuaW5jbHVkZXMoZS5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpKSkge1xuXHRcdFx0XHRcdFx0YyhSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25SZXN1bHQuQWNjZXB0ZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogU2hvdyByZWNvbW1lbmRhdGlvbnMgaW4gUXVldWVcblx0ICogQXQgYW55IHRpbWUgb25seSBvbmUgcmVjb21tZW5kYXRpb24gaXMgc2hvd25cblx0ICogSWYgYSBuZXcgcmVjb21tZW5kYXRpb24gY29tZXMgaW5cblx0ICogXHRcdD0+IElmIG5vIHJlY29tbWVuZGF0aW9uIGlzIHZpc2libGUsIHNob3cgaXQgaW1tZWRpYXRlbHlcblx0ICpcdFx0PT4gT3RoZXJ3aXNlLCBhZGQgdG8gdGhlIHBlbmRpbmcgcXVldWVcblx0ICogXHRcdFx0PT4gSWYgaXQgaXMgbm90IGV4ZSBiYXNlZCBhbmQgaGFzIGhpZ2hlciBvciBzYW1lIHByaW9yaXR5IGFzIGN1cnJlbnQsIGhpZGUgdGhlIGN1cnJlbnQgbm90aWZpY2F0aW9uIGFmdGVyIHNob3dpbmcgaXQgZm9yIDNzLlxuXHQgKiBcdFx0XHQ9PiBPdGhlcndpc2Ugd2FpdCB1bnRpbCB0aGUgY3VycmVudCBub3RpZmljYXRpb24gaXMgaGlkZGVuLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBkb1Nob3dSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb24oc2V2ZXJpdHk6IFNldmVyaXR5LCBtZXNzYWdlOiBzdHJpbmcsIGNob2ljZXM6IElQcm9tcHRDaG9pY2VbXSwgc291cmNlOiBSZWNvbW1lbmRhdGlvblNvdXJjZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uKHNldmVyaXR5LCBtZXNzYWdlLCBjaG9pY2VzLCB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5vbmNlKEV2ZW50LmZpbHRlcihyZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb24ub25EaWRDaGFuZ2VWaXNpYmlsaXR5LCBlID0+ICFlKSkoKCkgPT4gdGhpcy5zaG93TmV4dE5vdGlmaWNhdGlvbigpKSk7XG5cdFx0XHRpZiAodGhpcy52aXNpYmxlTm90aWZpY2F0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5wZW5kaW5nTm90aWZpY2FpdG9ucy5sZW5ndGg7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB0aGlzLnBlbmRpbmdOb3RpZmljYWl0b25zLnNwbGljZShpbmRleCwgMSkpKTtcblx0XHRcdFx0dGhpcy5wZW5kaW5nTm90aWZpY2FpdG9ucy5wdXNoKHsgcmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uLCBzb3VyY2UsIHRva2VuIH0pO1xuXHRcdFx0XHRpZiAoc291cmNlICE9PSBSZWNvbW1lbmRhdGlvblNvdXJjZS5FWEUgJiYgc291cmNlIDw9IHRoaXMudmlzaWJsZU5vdGlmaWNhdGlvbi5zb3VyY2UpIHtcblx0XHRcdFx0XHR0aGlzLmhpZGVWaXNpYmxlTm90aWZpY2F0aW9uKDMwMDApO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnZpc2libGVOb3RpZmljYXRpb24gPSB7IHJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbiwgc291cmNlLCBmcm9tOiBEYXRlLm5vdygpIH07XG5cdFx0XHRcdHJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbi5zaG93KCk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCByYWNlQ2FuY2VsbGF0aW9uKG5ldyBQcm9taXNlKGMgPT4gZGlzcG9zYWJsZXMuYWRkKEV2ZW50Lm9uY2UocmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uLm9uRGlkQ2xvc2UpKGMpKSksIHRva2VuKTtcblx0XHRcdHJldHVybiAhcmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uLmlzQ2FuY2VsbGVkKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNob3dOZXh0Tm90aWZpY2F0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5nZXROZXh0UGVuZGluZ05vdGlmaWNhdGlvbkluZGV4KCk7XG5cdFx0Y29uc3QgW25leHROb3RpZmljYWl0b25dID0gaW5kZXggPiAtMSA/IHRoaXMucGVuZGluZ05vdGlmaWNhaXRvbnMuc3BsaWNlKGluZGV4LCAxKSA6IFtdO1xuXG5cdFx0Ly8gU2hvdyB0aGUgbmV4dCBub3RpZmljYXRpb24gYWZ0ZXIgYSBkZWxheSBvZiA1MDBtcyAoYWZ0ZXIgdGhlIGN1cnJlbnQgbm90aWZpY2F0aW9uIGlzIGRpc21pc3NlZClcblx0XHR0aW1lb3V0KG5leHROb3RpZmljYWl0b24gPyA1MDAgOiAwKVxuXHRcdFx0LnRoZW4oKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnVuc2V0VmlzaWJpbGVOb3RpZmljYXRpb24oKTtcblx0XHRcdFx0aWYgKG5leHROb3RpZmljYWl0b24pIHtcblx0XHRcdFx0XHR0aGlzLnZpc2libGVOb3RpZmljYXRpb24gPSB7IHJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbjogbmV4dE5vdGlmaWNhaXRvbi5yZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb24sIHNvdXJjZTogbmV4dE5vdGlmaWNhaXRvbi5zb3VyY2UsIGZyb206IERhdGUubm93KCkgfTtcblx0XHRcdFx0XHRuZXh0Tm90aWZpY2FpdG9uLnJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbi5zaG93KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybiB0aGUgcmVjZW50IGhpZ2ggcHJpcm9pdHkgcGVuZGluZyBub3RpZmljYXRpb25cblx0ICovXG5cdHByaXZhdGUgZ2V0TmV4dFBlbmRpbmdOb3RpZmljYXRpb25JbmRleCgpOiBudW1iZXIge1xuXHRcdGxldCBpbmRleCA9IHRoaXMucGVuZGluZ05vdGlmaWNhaXRvbnMubGVuZ3RoIC0gMTtcblx0XHRpZiAodGhpcy5wZW5kaW5nTm90aWZpY2FpdG9ucy5sZW5ndGgpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5wZW5kaW5nTm90aWZpY2FpdG9ucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAodGhpcy5wZW5kaW5nTm90aWZpY2FpdG9uc1tpXS5zb3VyY2UgPD0gdGhpcy5wZW5kaW5nTm90aWZpY2FpdG9uc1tpbmRleF0uc291cmNlKSB7XG5cdFx0XHRcdFx0aW5kZXggPSBpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBpbmRleDtcblx0fVxuXG5cdHByaXZhdGUgaGlkZVZpc2libGVOb3RpZmljYXRpb24odGltZUluTWlsbGlzOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy52aXNpYmxlTm90aWZpY2F0aW9uICYmICF0aGlzLmhpZGVWaXNpYmxlTm90aWZpY2F0aW9uUHJvbWlzZSkge1xuXHRcdFx0Y29uc3QgdmlzaWJsZU5vdGlmaWNhdGlvbiA9IHRoaXMudmlzaWJsZU5vdGlmaWNhdGlvbjtcblx0XHRcdHRoaXMuaGlkZVZpc2libGVOb3RpZmljYXRpb25Qcm9taXNlID0gdGltZW91dChNYXRoLm1heCh0aW1lSW5NaWxsaXMgLSAoRGF0ZS5ub3coKSAtIHZpc2libGVOb3RpZmljYXRpb24uZnJvbSksIDApKTtcblx0XHRcdHRoaXMuaGlkZVZpc2libGVOb3RpZmljYXRpb25Qcm9taXNlLnRoZW4oKCkgPT4gdmlzaWJsZU5vdGlmaWNhdGlvbi5yZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb24uaGlkZSgpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVuc2V0VmlzaWJpbGVOb3RpZmljYXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5oaWRlVmlzaWJsZU5vdGlmaWNhdGlvblByb21pc2U/LmNhbmNlbCgpO1xuXHRcdHRoaXMuaGlkZVZpc2libGVOb3RpZmljYXRpb25Qcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMudmlzaWJsZU5vdGlmaWNhdGlvbiA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0SW5zdGFsbGFibGVFeHRlbnNpb25zKHJlY29tbWVuZGF0aW9uczogQXJyYXk8c3RyaW5nIHwgVVJJPik6IFByb21pc2U8SUV4dGVuc2lvbltdPiB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRpZiAocmVjb21tZW5kYXRpb25zLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgZ2FsbGVyeUV4dGVuc2lvbnM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCByZXNvdXJjZUV4dGVuc2lvbnM6IFVSSVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHJlY29tbWVuZGF0aW9uIG9mIHJlY29tbWVuZGF0aW9ucykge1xuXHRcdFx0XHRpZiAodHlwZW9mIHJlY29tbWVuZGF0aW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGdhbGxlcnlFeHRlbnNpb25zLnB1c2gocmVjb21tZW5kYXRpb24pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc291cmNlRXh0ZW5zaW9ucy5wdXNoKHJlY29tbWVuZGF0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGdhbGxlcnlFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5nZXRFeHRlbnNpb25zKGdhbGxlcnlFeHRlbnNpb25zLm1hcChpZCA9PiAoeyBpZCB9KSksIHsgc291cmNlOiAnaW5zdGFsbC1yZWNvbW1lbmRhdGlvbnMnIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdFx0aWYgKGV4dGVuc2lvbi5nYWxsZXJ5ICYmIGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuY2FuSW5zdGFsbChleHRlbnNpb24uZ2FsbGVyeSkgPT09IHRydWUpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKGV4dGVuc2lvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzb3VyY2VFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5nZXRSZXNvdXJjZUV4dGVuc2lvbnMocmVzb3VyY2VFeHRlbnNpb25zLCB0cnVlKTtcblx0XHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRcdGlmIChhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmNhbkluc3RhbGwoZXh0ZW5zaW9uKSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYWRkVG9JbXBvcnRhbnRSZWNvbW1lbmRhdGlvbnNJZ25vcmUoaWQ6IHN0cmluZykge1xuXHRcdGNvbnN0IGltcG9ydGFudFJlY29tbWVuZGF0aW9uc0lnbm9yZUxpc3QgPSBbLi4udGhpcy5pZ25vcmVkUmVjb21tZW5kYXRpb25zXTtcblx0XHRpZiAoIWltcG9ydGFudFJlY29tbWVuZGF0aW9uc0lnbm9yZUxpc3QuaW5jbHVkZXMoaWQudG9Mb3dlckNhc2UoKSkpIHtcblx0XHRcdGltcG9ydGFudFJlY29tbWVuZGF0aW9uc0lnbm9yZUxpc3QucHVzaChpZC50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoaWdub3JlSW1wb3J0YW50RXh0ZW5zaW9uUmVjb21tZW5kYXRpb25TdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeShpbXBvcnRhbnRSZWNvbW1lbmRhdGlvbnNJZ25vcmVMaXN0KSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRJZ25vcmVSZWNvbW1lbmRhdGlvbnNDb25maWcoY29uZmlnVmFsOiBib29sZWFuKSB7XG5cdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSgnZXh0ZW5zaW9ucy5pZ25vcmVSZWNvbW1lbmRhdGlvbnMnLCBjb25maWdWYWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJQPFQ+KG86IENhbmNlbGFibGVQcm9taXNlPFQ+KTogQ2FuY2VsYWJsZVByb21pc2U8VD4ge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiBvLmNhbmNlbCgpKSk7XG5cdFx0cmV0dXJuIG87XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBNEIseUJBQXlCLFVBQVUseUJBQXlCLGtCQUFrQixlQUFlO0FBQ3pILFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsWUFBWSxpQkFBaUIsbUJBQW1CLG9CQUFvQjtBQUM3RSxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFpRixtQ0FBbUMsc0JBQXNCLG9DQUFvQztBQUM5SyxTQUE4QixzQkFBNEQsc0JBQXNCLGdCQUFnQjtBQUNoSSxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGdDQUFnQyxvQkFBb0I7QUFDN0QsU0FBcUIsbUNBQW1DO0FBQ3hELFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsaUJBQWlCLHNDQUFzQyw0Q0FBNEM7QUFDNUcsU0FBUywrQ0FBK0M7QUFnQnhELE1BQU0s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
