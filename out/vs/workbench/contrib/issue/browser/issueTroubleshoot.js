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
import { localize, localize2 } from "../../../../nls.js";
import { IExtensionManagementService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { ExtensionType } from "../../../../platform/extensions/common/extensions.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IWorkbenchIssueService } from "../common/issue.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IUserDataProfileImportExportService, IUserDataProfileManagementService, IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IExtensionBisectService } from "../../../services/extensionManagement/browser/extensionBisect.js";
import { INotificationService, NotificationPriority, Severity } from "../../../../platform/notification/common/notification.js";
import { IWorkbenchExtensionEnablementService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions } from "../../../common/contributions.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { URI } from "../../../../base/common/uri.js";
import { RemoteNameContext } from "../../../common/contextkeys.js";
import { IsWebContext } from "../../../../platform/contextkey/common/contextkeys.js";
const ITroubleshootIssueService = createDecorator("ITroubleshootIssueService");
var TroubleshootStage = /* @__PURE__ */ ((TroubleshootStage2) => {
  TroubleshootStage2[TroubleshootStage2["EXTENSIONS"] = 1] = "EXTENSIONS";
  TroubleshootStage2[TroubleshootStage2["WORKBENCH"] = 2] = "WORKBENCH";
  return TroubleshootStage2;
})(TroubleshootStage || {});
class TroubleShootState {
  constructor(stage, profile) {
    this.stage = stage;
    this.profile = profile;
  }
  static fromJSON(raw) {
    if (!raw) {
      return void 0;
    }
    try {
      const data = JSON.parse(raw);
      if ((data.stage === 1 /* EXTENSIONS */ || data.stage === 2 /* WORKBENCH */) && typeof data.profile === "string") {
        return new TroubleShootState(data.stage, data.profile);
      }
    } catch {
    }
    return void 0;
  }
}
let TroubleshootIssueService = class extends Disposable {
  constructor(userDataProfileService, userDataProfilesService, userDataProfileManagementService, userDataProfileImportExportService, dialogService, extensionBisectService, notificationService, extensionManagementService, extensionEnablementService, issueService, productService, hostService, storageService, openerService) {
    super();
    this.userDataProfileService = userDataProfileService;
    this.userDataProfilesService = userDataProfilesService;
    this.userDataProfileManagementService = userDataProfileManagementService;
    this.userDataProfileImportExportService = userDataProfileImportExportService;
    this.dialogService = dialogService;
    this.extensionBisectService = extensionBisectService;
    this.notificationService = notificationService;
    this.extensionManagementService = extensionManagementService;
    this.extensionEnablementService = extensionEnablementService;
    this.issueService = issueService;
    this.productService = productService;
    this.hostService = hostService;
    this.storageService = storageService;
    this.openerService = openerService;
  }
  isActive() {
    return this.state !== void 0;
  }
  async start() {
    if (this.isActive()) {
      throw new Error("invalid state");
    }
    const res = await this.dialogService.confirm({
      message: localize("troubleshoot issue", "Troubleshoot Issue"),
      detail: localize("detail.start", "Issue troubleshooting is a process to help you identify the cause for an issue. The cause for an issue can be a misconfiguration, due to an extension, or be {0} itself.\n\nDuring the process the window reloads repeatedly. Each time you must confirm if you are still seeing the issue.", this.productService.nameLong),
      primaryButton: localize({ key: "msg", comment: ["&& denotes a mnemonic"] }, "&&Troubleshoot Issue"),
      custom: true
    });
    if (!res.confirmed) {
      return;
    }
    const originalProfile = this.userDataProfileService.currentProfile;
    await this.userDataProfileImportExportService.createTroubleshootProfile();
    this.state = new TroubleShootState(1 /* EXTENSIONS */, originalProfile.id);
    await this.resume();
  }
  async resume() {
    if (!this.isActive()) {
      return;
    }
    if (this.state?.stage === 1 /* EXTENSIONS */ && !this.extensionBisectService.isActive) {
      await this.reproduceIssueWithExtensionsDisabled();
    }
    if (this.state?.stage === 2 /* WORKBENCH */) {
      await this.reproduceIssueWithEmptyProfile();
    }
    await this.stop();
  }
  async stop() {
    if (!this.isActive()) {
      return;
    }
    if (this.notificationHandle) {
      this.notificationHandle.close();
      this.notificationHandle = void 0;
    }
    if (this.extensionBisectService.isActive) {
      await this.extensionBisectService.reset();
    }
    const profile = this.userDataProfilesService.profiles.find((p) => p.id === this.state?.profile) ?? this.userDataProfilesService.defaultProfile;
    this.state = void 0;
    await this.userDataProfileManagementService.switchProfile(profile);
  }
  async reproduceIssueWithExtensionsDisabled() {
    if (!(await this.extensionManagementService.getInstalled(ExtensionType.User)).length) {
      this.state = new TroubleShootState(2 /* WORKBENCH */, this.state.profile);
      return;
    }
    const result = await this.askToReproduceIssue(localize("profile.extensions.disabled", "Issue troubleshooting is active and has temporarily disabled all installed extensions. Check if you can still reproduce the problem and proceed by selecting from these options."));
    if (result === "good") {
      const profile = this.userDataProfilesService.profiles.find((p) => p.id === this.state.profile) ?? this.userDataProfilesService.defaultProfile;
      await this.reproduceIssueWithExtensionsBisect(profile);
    }
    if (result === "bad") {
      this.state = new TroubleShootState(2 /* WORKBENCH */, this.state.profile);
    }
    if (result === "stop") {
      await this.stop();
    }
  }
  async reproduceIssueWithEmptyProfile() {
    await this.userDataProfileManagementService.createAndEnterTransientProfile();
    this.updateState(this.state);
    const result = await this.askToReproduceIssue(localize("empty.profile", "Issue troubleshooting is active and has temporarily reset your configurations to defaults. Check if you can still reproduce the problem and proceed by selecting from these options."));
    if (result === "stop") {
      await this.stop();
    }
    if (result === "good") {
      await this.askToReportIssue(localize("issue is with configuration", 'Issue troubleshooting has identified that the issue is caused by your configurations. Please report the issue by exporting your configurations using "Export Profile" command and share the file in the issue report.'));
    }
    if (result === "bad") {
      await this.askToReportIssue(localize("issue is in core", "Issue troubleshooting has identified that the issue is with {0}.", this.productService.nameLong));
    }
  }
  async reproduceIssueWithExtensionsBisect(profile) {
    await this.userDataProfileManagementService.switchProfile(profile);
    const extensions = (await this.extensionManagementService.getInstalled(ExtensionType.User)).filter((ext) => this.extensionEnablementService.isEnabled(ext));
    await this.extensionBisectService.start(extensions);
    await this.hostService.reload();
  }
  askToReproduceIssue(message) {
    return new Promise((c, e) => {
      const goodPrompt = {
        label: localize("I cannot reproduce", "I Can't Reproduce"),
        run: () => c("good")
      };
      const badPrompt = {
        label: localize("This is Bad", "I Can Reproduce"),
        run: () => c("bad")
      };
      const stop = {
        label: localize("Stop", "Stop"),
        run: () => c("stop")
      };
      this.notificationHandle = this.notificationService.prompt(
        Severity.Info,
        message,
        [goodPrompt, badPrompt, stop],
        { sticky: true, priority: NotificationPriority.URGENT }
      );
    });
  }
  async askToReportIssue(message) {
    let isCheckedInInsiders = false;
    if (this.productService.quality === "stable") {
      const res = await this.askToReproduceIssueWithInsiders();
      if (res === "good") {
        await this.dialogService.prompt({
          type: Severity.Info,
          message: localize("troubleshoot issue", "Troubleshoot Issue"),
          detail: localize("use insiders", "This likely means that the issue has been addressed already and will be available in an upcoming release. You can safely use {0} insiders until the new stable version is available.", this.productService.nameLong),
          custom: true
        });
        return;
      }
      if (res === "stop") {
        await this.stop();
        return;
      }
      if (res === "bad") {
        isCheckedInInsiders = true;
      }
    }
    await this.issueService.openReporter({
      issueBody: `> ${message} ${isCheckedInInsiders ? `It is confirmed that the issue exists in ${this.productService.nameLong} Insiders` : ""}`
    });
  }
  async askToReproduceIssueWithInsiders() {
    const confirmRes = await this.dialogService.confirm({
      type: "info",
      message: localize("troubleshoot issue", "Troubleshoot Issue"),
      primaryButton: localize("download insiders", "Download {0} Insiders", this.productService.nameLong),
      cancelButton: localize("report anyway", "Report Issue Anyway"),
      detail: localize("ask to download insiders", "Please try to download and reproduce the issue in {0} insiders.", this.productService.nameLong),
      custom: {
        disableCloseAction: true
      }
    });
    if (!confirmRes.confirmed) {
      return void 0;
    }
    const opened = await this.openerService.open(URI.parse("https://aka.ms/vscode-insiders"));
    if (!opened) {
      return void 0;
    }
    const res = await this.dialogService.prompt({
      type: "info",
      message: localize("troubleshoot issue", "Troubleshoot Issue"),
      buttons: [{
        label: localize("good", "I can't reproduce"),
        run: () => "good"
      }, {
        label: localize("bad", "I can reproduce"),
        run: () => "bad"
      }],
      cancelButton: {
        label: localize("stop", "Stop"),
        run: () => "stop"
      },
      detail: localize("ask to reproduce issue", "Please try to reproduce the issue in {0} insiders and confirm if the issue exists there.", this.productService.nameLong),
      custom: {
        disableCloseAction: true
      }
    });
    return res.result;
  }
  get state() {
    if (this._state === void 0) {
      const raw = this.storageService.get(TroubleshootIssueService.storageKey, StorageScope.PROFILE);
      this._state = TroubleShootState.fromJSON(raw);
    }
    return this._state || void 0;
  }
  set state(state) {
    this._state = state ?? null;
    this.updateState(state);
  }
  updateState(state) {
    if (state) {
      this.storageService.store(TroubleshootIssueService.storageKey, JSON.stringify(state), StorageScope.PROFILE, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(TroubleshootIssueService.storageKey, StorageScope.PROFILE);
    }
  }
};
TroubleshootIssueService.storageKey = "issueTroubleshootState";
TroubleshootIssueService = __decorateClass([
  __decorateParam(0, IUserDataProfileService),
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IUserDataProfileManagementService),
  __decorateParam(3, IUserDataProfileImportExportService),
  __decorateParam(4, IDialogService),
  __decorateParam(5, IExtensionBisectService),
  __decorateParam(6, INotificationService),
  __decorateParam(7, IExtensionManagementService),
  __decorateParam(8, IWorkbenchExtensionEnablementService),
  __decorateParam(9, IWorkbenchIssueService),
  __decorateParam(10, IProductService),
  __decorateParam(11, IHostService),
  __decorateParam(12, IStorageService),
  __decorateParam(13, IOpenerService)
], TroubleshootIssueService);
let IssueTroubleshootUi = class extends Disposable {
  constructor(contextKeyService, troubleshootIssueService, storageService) {
    super();
    this.contextKeyService = contextKeyService;
    this.troubleshootIssueService = troubleshootIssueService;
    this.updateContext();
    if (troubleshootIssueService.isActive()) {
      troubleshootIssueService.resume();
    }
    this._register(storageService.onDidChangeValue(StorageScope.PROFILE, TroubleshootIssueService.storageKey, this._store)(() => {
      this.updateContext();
    }));
  }
  updateContext() {
    IssueTroubleshootUi.ctxIsTroubleshootActive.bindTo(this.contextKeyService).set(this.troubleshootIssueService.isActive());
  }
};
IssueTroubleshootUi.ctxIsTroubleshootActive = new RawContextKey("isIssueTroubleshootActive", false);
IssueTroubleshootUi = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, ITroubleshootIssueService),
  __decorateParam(2, IStorageService)
], IssueTroubleshootUi);
Registry.as(Extensions.Workbench).registerWorkbenchContribution(IssueTroubleshootUi, LifecyclePhase.Restored);
registerAction2(class TroubleshootIssueAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.troubleshootIssue.start",
      title: localize2("troubleshootIssue", "Troubleshoot Issue..."),
      category: Categories.Help,
      f1: true,
      precondition: ContextKeyExpr.and(IssueTroubleshootUi.ctxIsTroubleshootActive.negate(), RemoteNameContext.isEqualTo(""), IsWebContext.negate())
    });
  }
  run(accessor) {
    return accessor.get(ITroubleshootIssueService).start();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.troubleshootIssue.stop",
      title: localize2("title.stop", "Stop Troubleshoot Issue"),
      category: Categories.Help,
      f1: true,
      precondition: IssueTroubleshootUi.ctxIsTroubleshootActive
    });
  }
  async run(accessor) {
    return accessor.get(ITroubleshootIssueService).stop();
  }
});
registerSingleton(ITroubleshootIssueService, TroubleshootIssueService, InstantiationType.Delayed);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGlzc3VlXFxicm93c2VyXFxpc3N1ZVRyb3VibGVzaG9vdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoSXNzdWVTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2lzc3VlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlSW1wb3J0RXhwb3J0U2VydmljZSwgSVVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlLCBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uQmlzZWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvYnJvd3Nlci9leHRlbnNpb25CaXNlY3QuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvbkhhbmRsZSwgSU5vdGlmaWNhdGlvblNlcnZpY2UsIElQcm9tcHRDaG9pY2UsIE5vdGlmaWNhdGlvblByaW9yaXR5LCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZSwgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciwgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFJlbW90ZU5hbWVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElzV2ViQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcblxuY29uc3QgSVRyb3VibGVzaG9vdElzc3VlU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJVHJvdWJsZXNob290SXNzdWVTZXJ2aWNlPignSVRyb3VibGVzaG9vdElzc3VlU2VydmljZScpO1xuXG5pbnRlcmZhY2UgSVRyb3VibGVzaG9vdElzc3VlU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0aXNBY3RpdmUoKTogYm9vbGVhbjtcblx0c3RhcnQoKTogUHJvbWlzZTx2b2lkPjtcblx0cmVzdW1lKCk6IFByb21pc2U8dm9pZD47XG5cdHN0b3AoKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZW51bSBUcm91Ymxlc2hvb3RTdGFnZSB7XG5cdEVYVEVOU0lPTlMgPSAxLFxuXHRXT1JLQkVOQ0gsXG59XG5cbnR5cGUgVHJvdWJsZVNob290UmVzdWx0ID0gJ2dvb2QnIHwgJ2JhZCcgfCAnc3RvcCc7XG5cbmNsYXNzIFRyb3VibGVTaG9vdFN0YXRlIHtcblxuXHRzdGF0aWMgZnJvbUpTT04ocmF3OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBUcm91YmxlU2hvb3RTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFyYXcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRpbnRlcmZhY2UgUmF3IGV4dGVuZHMgVHJvdWJsZVNob290U3RhdGUgeyB9XG5cdFx0XHRjb25zdCBkYXRhOiBSYXcgPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdChkYXRhLnN0YWdlID09PSBUcm91Ymxlc2hvb3RTdGFnZS5FWFRFTlNJT05TIHx8IGRhdGEuc3RhZ2UgPT09IFRyb3VibGVzaG9vdFN0YWdlLldPUktCRU5DSClcblx0XHRcdFx0JiYgdHlwZW9mIGRhdGEucHJvZmlsZSA9PT0gJ3N0cmluZydcblx0XHRcdCkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFRyb3VibGVTaG9vdFN0YXRlKGRhdGEuc3RhZ2UsIGRhdGEucHJvZmlsZSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHN0YWdlOiBUcm91Ymxlc2hvb3RTdGFnZSxcblx0XHRyZWFkb25seSBwcm9maWxlOiBzdHJpbmcsXG5cdCkgeyB9XG59XG5cbmNsYXNzIFRyb3VibGVzaG9vdElzc3VlU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVHJvdWJsZXNob290SXNzdWVTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0c3RhdGljIHJlYWRvbmx5IHN0b3JhZ2VLZXkgPSAnaXNzdWVUcm91Ymxlc2hvb3RTdGF0ZSc7XG5cblx0cHJpdmF0ZSBub3RpZmljYXRpb25IYW5kbGU6IElOb3RpZmljYXRpb25IYW5kbGUgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVJbXBvcnRFeHBvcnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlSW1wb3J0RXhwb3J0U2VydmljZTogSVVzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25CaXNlY3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uQmlzZWN0U2VydmljZTogSUV4dGVuc2lvbkJpc2VjdFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hJc3N1ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpc3N1ZVNlcnZpY2U6IElXb3JrYmVuY2hJc3N1ZVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRpc0FjdGl2ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5zdGF0ZSAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgc3RhcnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuaXNBY3RpdmUoKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIHN0YXRlJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3Ryb3VibGVzaG9vdCBpc3N1ZScsIFwiVHJvdWJsZXNob290IElzc3VlXCIpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnZGV0YWlsLnN0YXJ0JywgXCJJc3N1ZSB0cm91Ymxlc2hvb3RpbmcgaXMgYSBwcm9jZXNzIHRvIGhlbHAgeW91IGlkZW50aWZ5IHRoZSBjYXVzZSBmb3IgYW4gaXNzdWUuIFRoZSBjYXVzZSBmb3IgYW4gaXNzdWUgY2FuIGJlIGEgbWlzY29uZmlndXJhdGlvbiwgZHVlIHRvIGFuIGV4dGVuc2lvbiwgb3IgYmUgezB9IGl0c2VsZi5cXG5cXG5EdXJpbmcgdGhlIHByb2Nlc3MgdGhlIHdpbmRvdyByZWxvYWRzIHJlcGVhdGVkbHkuIEVhY2ggdGltZSB5b3UgbXVzdCBjb25maXJtIGlmIHlvdSBhcmUgc3RpbGwgc2VlaW5nIHRoZSBpc3N1ZS5cIiwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZyksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ21zZycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlRyb3VibGVzaG9vdCBJc3N1ZVwiKSxcblx0XHRcdGN1c3RvbTogdHJ1ZVxuXHRcdH0pO1xuXG5cdFx0aWYgKCFyZXMuY29uZmlybWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3JpZ2luYWxQcm9maWxlID0gdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlO1xuXHRcdGF3YWl0IHRoaXMudXNlckRhdGFQcm9maWxlSW1wb3J0RXhwb3J0U2VydmljZS5jcmVhdGVUcm91Ymxlc2hvb3RQcm9maWxlKCk7XG5cdFx0dGhpcy5zdGF0ZSA9IG5ldyBUcm91YmxlU2hvb3RTdGF0ZShUcm91Ymxlc2hvb3RTdGFnZS5FWFRFTlNJT05TLCBvcmlnaW5hbFByb2ZpbGUuaWQpO1xuXHRcdGF3YWl0IHRoaXMucmVzdW1lKCk7XG5cdH1cblxuXHRhc3luYyByZXN1bWUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmlzQWN0aXZlKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zdGF0ZT8uc3RhZ2UgPT09IFRyb3VibGVzaG9vdFN0YWdlLkVYVEVOU0lPTlMgJiYgIXRoaXMuZXh0ZW5zaW9uQmlzZWN0U2VydmljZS5pc0FjdGl2ZSkge1xuXHRcdFx0YXdhaXQgdGhpcy5yZXByb2R1Y2VJc3N1ZVdpdGhFeHRlbnNpb25zRGlzYWJsZWQoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zdGF0ZT8uc3RhZ2UgPT09IFRyb3VibGVzaG9vdFN0YWdlLldPUktCRU5DSCkge1xuXHRcdFx0YXdhaXQgdGhpcy5yZXByb2R1Y2VJc3N1ZVdpdGhFbXB0eVByb2ZpbGUoKTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLnN0b3AoKTtcblx0fVxuXG5cdGFzeW5jIHN0b3AoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmlzQWN0aXZlKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5ub3RpZmljYXRpb25IYW5kbGUpIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uSGFuZGxlLmNsb3NlKCk7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvbkhhbmRsZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5leHRlbnNpb25CaXNlY3RTZXJ2aWNlLmlzQWN0aXZlKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbkJpc2VjdFNlcnZpY2UucmVzZXQoKTtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9maWxlID0gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcy5maW5kKHAgPT4gcC5pZCA9PT0gdGhpcy5zdGF0ZT8ucHJvZmlsZSkgPz8gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZTtcblx0XHR0aGlzLnN0YXRlID0gdW5kZWZpbmVkO1xuXHRcdGF3YWl0IHRoaXMudXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2Uuc3dpdGNoUHJvZmlsZShwcm9maWxlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVwcm9kdWNlSXNzdWVXaXRoRXh0ZW5zaW9uc0Rpc2FibGVkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghKGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKEV4dGVuc2lvblR5cGUuVXNlcikpLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5zdGF0ZSA9IG5ldyBUcm91YmxlU2hvb3RTdGF0ZShUcm91Ymxlc2hvb3RTdGFnZS5XT1JLQkVOQ0gsIHRoaXMuc3RhdGUhLnByb2ZpbGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuYXNrVG9SZXByb2R1Y2VJc3N1ZShsb2NhbGl6ZSgncHJvZmlsZS5leHRlbnNpb25zLmRpc2FibGVkJywgXCJJc3N1ZSB0cm91Ymxlc2hvb3RpbmcgaXMgYWN0aXZlIGFuZCBoYXMgdGVtcG9yYXJpbHkgZGlzYWJsZWQgYWxsIGluc3RhbGxlZCBleHRlbnNpb25zLiBDaGVjayBpZiB5b3UgY2FuIHN0aWxsIHJlcHJvZHVjZSB0aGUgcHJvYmxlbSBhbmQgcHJvY2VlZCBieSBzZWxlY3RpbmcgZnJvbSB0aGVzZSBvcHRpb25zLlwiKSk7XG5cdFx0aWYgKHJlc3VsdCA9PT0gJ2dvb2QnKSB7XG5cdFx0XHRjb25zdCBwcm9maWxlID0gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcy5maW5kKHAgPT4gcC5pZCA9PT0gdGhpcy5zdGF0ZSEucHJvZmlsZSkgPz8gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZTtcblx0XHRcdGF3YWl0IHRoaXMucmVwcm9kdWNlSXNzdWVXaXRoRXh0ZW5zaW9uc0Jpc2VjdChwcm9maWxlKTtcblx0XHR9XG5cdFx0aWYgKHJlc3VsdCA9PT0gJ2JhZCcpIHtcblx0XHRcdHRoaXMuc3RhdGUgPSBuZXcgVHJvdWJsZVNob290U3RhdGUoVHJvdWJsZXNob290U3RhZ2UuV09SS0JFTkNILCB0aGlzLnN0YXRlIS5wcm9maWxlKTtcblx0XHR9XG5cdFx0aWYgKHJlc3VsdCA9PT0gJ3N0b3AnKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnN0b3AoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlcHJvZHVjZUlzc3VlV2l0aEVtcHR5UHJvZmlsZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlLmNyZWF0ZUFuZEVudGVyVHJhbnNpZW50UHJvZmlsZSgpO1xuXHRcdHRoaXMudXBkYXRlU3RhdGUodGhpcy5zdGF0ZSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5hc2tUb1JlcHJvZHVjZUlzc3VlKGxvY2FsaXplKCdlbXB0eS5wcm9maWxlJywgXCJJc3N1ZSB0cm91Ymxlc2hvb3RpbmcgaXMgYWN0aXZlIGFuZCBoYXMgdGVtcG9yYXJpbHkgcmVzZXQgeW91ciBjb25maWd1cmF0aW9ucyB0byBkZWZhdWx0cy4gQ2hlY2sgaWYgeW91IGNhbiBzdGlsbCByZXByb2R1Y2UgdGhlIHByb2JsZW0gYW5kIHByb2NlZWQgYnkgc2VsZWN0aW5nIGZyb20gdGhlc2Ugb3B0aW9ucy5cIikpO1xuXHRcdGlmIChyZXN1bHQgPT09ICdzdG9wJykge1xuXHRcdFx0YXdhaXQgdGhpcy5zdG9wKCk7XG5cdFx0fVxuXHRcdGlmIChyZXN1bHQgPT09ICdnb29kJykge1xuXHRcdFx0YXdhaXQgdGhpcy5hc2tUb1JlcG9ydElzc3VlKGxvY2FsaXplKCdpc3N1ZSBpcyB3aXRoIGNvbmZpZ3VyYXRpb24nLCBcIklzc3VlIHRyb3VibGVzaG9vdGluZyBoYXMgaWRlbnRpZmllZCB0aGF0IHRoZSBpc3N1ZSBpcyBjYXVzZWQgYnkgeW91ciBjb25maWd1cmF0aW9ucy4gUGxlYXNlIHJlcG9ydCB0aGUgaXNzdWUgYnkgZXhwb3J0aW5nIHlvdXIgY29uZmlndXJhdGlvbnMgdXNpbmcgXFxcIkV4cG9ydCBQcm9maWxlXFxcIiBjb21tYW5kIGFuZCBzaGFyZSB0aGUgZmlsZSBpbiB0aGUgaXNzdWUgcmVwb3J0LlwiKSk7XG5cdFx0fVxuXHRcdGlmIChyZXN1bHQgPT09ICdiYWQnKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmFza1RvUmVwb3J0SXNzdWUobG9jYWxpemUoJ2lzc3VlIGlzIGluIGNvcmUnLCBcIklzc3VlIHRyb3VibGVzaG9vdGluZyBoYXMgaWRlbnRpZmllZCB0aGF0IHRoZSBpc3N1ZSBpcyB3aXRoIHswfS5cIiwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZykpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVwcm9kdWNlSXNzdWVXaXRoRXh0ZW5zaW9uc0Jpc2VjdChwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZS5zd2l0Y2hQcm9maWxlKHByb2ZpbGUpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnMgPSAoYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQoRXh0ZW5zaW9uVHlwZS5Vc2VyKSkuZmlsdGVyKGV4dCA9PiB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZChleHQpKTtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbkJpc2VjdFNlcnZpY2Uuc3RhcnQoZXh0ZW5zaW9ucyk7XG5cdFx0YXdhaXQgdGhpcy5ob3N0U2VydmljZS5yZWxvYWQoKTtcblx0fVxuXG5cdHByaXZhdGUgYXNrVG9SZXByb2R1Y2VJc3N1ZShtZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPFRyb3VibGVTaG9vdFJlc3VsdD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgoYywgZSkgPT4ge1xuXHRcdFx0Y29uc3QgZ29vZFByb21wdDogSVByb21wdENob2ljZSA9IHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdJIGNhbm5vdCByZXByb2R1Y2UnLCBcIkkgQ2FuJ3QgUmVwcm9kdWNlXCIpLFxuXHRcdFx0XHRydW46ICgpID0+IGMoJ2dvb2QnKVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGJhZFByb21wdDogSVByb21wdENob2ljZSA9IHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdUaGlzIGlzIEJhZCcsIFwiSSBDYW4gUmVwcm9kdWNlXCIpLFxuXHRcdFx0XHRydW46ICgpID0+IGMoJ2JhZCcpXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgc3RvcDogSVByb21wdENob2ljZSA9IHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdTdG9wJywgXCJTdG9wXCIpLFxuXHRcdFx0XHRydW46ICgpID0+IGMoJ3N0b3AnKVxuXHRcdFx0fTtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uSGFuZGxlID0gdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFx0U2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0bWVzc2FnZSxcblx0XHRcdFx0W2dvb2RQcm9tcHQsIGJhZFByb21wdCwgc3RvcF0sXG5cdFx0XHRcdHsgc3RpY2t5OiB0cnVlLCBwcmlvcml0eTogTm90aWZpY2F0aW9uUHJpb3JpdHkuVVJHRU5UIH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFza1RvUmVwb3J0SXNzdWUobWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IGlzQ2hlY2tlZEluSW5zaWRlcnMgPSBmYWxzZTtcblx0XHRpZiAodGhpcy5wcm9kdWN0U2VydmljZS5xdWFsaXR5ID09PSAnc3RhYmxlJykge1xuXHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgdGhpcy5hc2tUb1JlcHJvZHVjZUlzc3VlV2l0aEluc2lkZXJzKCk7XG5cdFx0XHRpZiAocmVzID09PSAnZ29vZCcpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHRcdFx0dHlwZTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgndHJvdWJsZXNob290IGlzc3VlJywgXCJUcm91Ymxlc2hvb3QgSXNzdWVcIiksXG5cdFx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgndXNlIGluc2lkZXJzJywgXCJUaGlzIGxpa2VseSBtZWFucyB0aGF0IHRoZSBpc3N1ZSBoYXMgYmVlbiBhZGRyZXNzZWQgYWxyZWFkeSBhbmQgd2lsbCBiZSBhdmFpbGFibGUgaW4gYW4gdXBjb21pbmcgcmVsZWFzZS4gWW91IGNhbiBzYWZlbHkgdXNlIHswfSBpbnNpZGVycyB1bnRpbCB0aGUgbmV3IHN0YWJsZSB2ZXJzaW9uIGlzIGF2YWlsYWJsZS5cIiwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZyksXG5cdFx0XHRcdFx0Y3VzdG9tOiB0cnVlXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzID09PSAnc3RvcCcpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5zdG9wKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChyZXMgPT09ICdiYWQnKSB7XG5cdFx0XHRcdGlzQ2hlY2tlZEluSW5zaWRlcnMgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuaXNzdWVTZXJ2aWNlLm9wZW5SZXBvcnRlcih7XG5cdFx0XHRpc3N1ZUJvZHk6IGA+ICR7bWVzc2FnZX0gJHtpc0NoZWNrZWRJbkluc2lkZXJzID8gYEl0IGlzIGNvbmZpcm1lZCB0aGF0IHRoZSBpc3N1ZSBleGlzdHMgaW4gJHt0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nfSBJbnNpZGVyc2AgOiAnJ31gLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhc2tUb1JlcHJvZHVjZUlzc3VlV2l0aEluc2lkZXJzKCk6IFByb21pc2U8VHJvdWJsZVNob290UmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY29uZmlybVJlcyA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdHR5cGU6ICdpbmZvJyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCd0cm91Ymxlc2hvb3QgaXNzdWUnLCBcIlRyb3VibGVzaG9vdCBJc3N1ZVwiKSxcblx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKCdkb3dubG9hZCBpbnNpZGVycycsIFwiRG93bmxvYWQgezB9IEluc2lkZXJzXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpLFxuXHRcdFx0Y2FuY2VsQnV0dG9uOiBsb2NhbGl6ZSgncmVwb3J0IGFueXdheScsIFwiUmVwb3J0IElzc3VlIEFueXdheVwiKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2FzayB0byBkb3dubG9hZCBpbnNpZGVycycsIFwiUGxlYXNlIHRyeSB0byBkb3dubG9hZCBhbmQgcmVwcm9kdWNlIHRoZSBpc3N1ZSBpbiB7MH0gaW5zaWRlcnMuXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpLFxuXHRcdFx0Y3VzdG9tOiB7XG5cdFx0XHRcdGRpc2FibGVDbG9zZUFjdGlvbjogdHJ1ZSxcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmICghY29uZmlybVJlcy5jb25maXJtZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3BlbmVkID0gYXdhaXQgdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKCdodHRwczovL2FrYS5tcy92c2NvZGUtaW5zaWRlcnMnKSk7XG5cdFx0aWYgKCFvcGVuZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdDxUcm91YmxlU2hvb3RSZXN1bHQ+KHtcblx0XHRcdHR5cGU6ICdpbmZvJyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCd0cm91Ymxlc2hvb3QgaXNzdWUnLCBcIlRyb3VibGVzaG9vdCBJc3N1ZVwiKSxcblx0XHRcdGJ1dHRvbnM6IFt7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZ29vZCcsIFwiSSBjYW4ndCByZXByb2R1Y2VcIiksXG5cdFx0XHRcdHJ1bjogKCkgPT4gJ2dvb2QnXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYmFkJywgXCJJIGNhbiByZXByb2R1Y2VcIiksXG5cdFx0XHRcdHJ1bjogKCkgPT4gJ2JhZCdcblx0XHRcdH1dLFxuXHRcdFx0Y2FuY2VsQnV0dG9uOiB7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc3RvcCcsIFwiU3RvcFwiKSxcblx0XHRcdFx0cnVuOiAoKSA9PiAnc3RvcCdcblx0XHRcdH0sXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdhc2sgdG8gcmVwcm9kdWNlIGlzc3VlJywgXCJQbGVhc2UgdHJ5IHRvIHJlcHJvZHVjZSB0aGUgaXNzdWUgaW4gezB9IGluc2lkZXJzIGFuZCBjb25maXJtIGlmIHRoZSBpc3N1ZSBleGlzdHMgdGhlcmUuXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpLFxuXHRcdFx0Y3VzdG9tOiB7XG5cdFx0XHRcdGRpc2FibGVDbG9zZUFjdGlvbjogdHJ1ZSxcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiByZXMucmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RhdGU6IFRyb3VibGVTaG9vdFN0YXRlIHwgdW5kZWZpbmVkIHwgbnVsbDtcblx0Z2V0IHN0YXRlKCk6IFRyb3VibGVTaG9vdFN0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fc3RhdGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgcmF3ID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoVHJvdWJsZXNob290SXNzdWVTZXJ2aWNlLnN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRcdHRoaXMuX3N0YXRlID0gVHJvdWJsZVNob290U3RhdGUuZnJvbUpTT04ocmF3KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXRlIHx8IHVuZGVmaW5lZDtcblx0fVxuXG5cdHNldCBzdGF0ZShzdGF0ZTogVHJvdWJsZVNob290U3RhdGUgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9zdGF0ZSA9IHN0YXRlID8/IG51bGw7XG5cdFx0dGhpcy51cGRhdGVTdGF0ZShzdGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVN0YXRlKHN0YXRlOiBUcm91YmxlU2hvb3RTdGF0ZSB8IHVuZGVmaW5lZCkge1xuXHRcdGlmIChzdGF0ZSkge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShUcm91Ymxlc2hvb3RJc3N1ZVNlcnZpY2Uuc3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkoc3RhdGUpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoVHJvdWJsZXNob290SXNzdWVTZXJ2aWNlLnN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgSXNzdWVUcm91Ymxlc2hvb3RVaSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHN0YXRpYyBjdHhJc1Ryb3VibGVzaG9vdEFjdGl2ZSA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdpc0lzc3VlVHJvdWJsZXNob290QWN0aXZlJywgZmFsc2UpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVHJvdWJsZXNob290SXNzdWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdHJvdWJsZXNob290SXNzdWVTZXJ2aWNlOiBJVHJvdWJsZXNob290SXNzdWVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnVwZGF0ZUNvbnRleHQoKTtcblx0XHRpZiAodHJvdWJsZXNob290SXNzdWVTZXJ2aWNlLmlzQWN0aXZlKCkpIHtcblx0XHRcdHRyb3VibGVzaG9vdElzc3VlU2VydmljZS5yZXN1bWUoKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuUFJPRklMRSwgVHJvdWJsZXNob290SXNzdWVTZXJ2aWNlLnN0b3JhZ2VLZXksIHRoaXMuX3N0b3JlKSgoKSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZUNvbnRleHQoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbnRleHQoKTogdm9pZCB7XG5cdFx0SXNzdWVUcm91Ymxlc2hvb3RVaS5jdHhJc1Ryb3VibGVzaG9vdEFjdGl2ZS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSkuc2V0KHRoaXMudHJvdWJsZXNob290SXNzdWVTZXJ2aWNlLmlzQWN0aXZlKCkpO1xuXHR9XG5cbn1cblxuUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpLnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKElzc3VlVHJvdWJsZXNob290VWksIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFRyb3VibGVzaG9vdElzc3VlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50cm91Ymxlc2hvb3RJc3N1ZS5zdGFydCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0cm91Ymxlc2hvb3RJc3N1ZScsICdUcm91Ymxlc2hvb3QgSXNzdWUuLi4nKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkhlbHAsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKElzc3VlVHJvdWJsZXNob290VWkuY3R4SXNUcm91Ymxlc2hvb3RBY3RpdmUubmVnYXRlKCksIFJlbW90ZU5hbWVDb250ZXh0LmlzRXF1YWxUbygnJyksIElzV2ViQ29udGV4dC5uZWdhdGUoKSksXG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJVHJvdWJsZXNob290SXNzdWVTZXJ2aWNlKS5zdGFydCgpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50cm91Ymxlc2hvb3RJc3N1ZS5zdG9wJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3RpdGxlLnN0b3AnLCAnU3RvcCBUcm91Ymxlc2hvb3QgSXNzdWUnKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkhlbHAsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogSXNzdWVUcm91Ymxlc2hvb3RVaS5jdHhJc1Ryb3VibGVzaG9vdEFjdGl2ZVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJVHJvdWJsZXNob290SXNzdWVTZXJ2aWNlKS5zdG9wKCk7XG5cdH1cbn0pO1xuXG5cbnJlZ2lzdGVyU2luZ2xldG9uKElUcm91Ymxlc2hvb3RJc3N1ZVNlcnZpY2UsIFRyb3VibGVzaG9vdElzc3VlU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLHFDQUFxQyxtQ0FBbUMsK0JBQStCO0FBQ2hILFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsK0JBQStCO0FBQ3hDLFNBQThCLHNCQUFxQyxzQkFBc0IsZ0JBQWdCO0FBQ3pHLFNBQVMsNENBQTRDO0FBQ3JELFNBQVMsb0JBQW9CO0FBQzdCLFNBQTJCLGdDQUFnQztBQUMzRCxTQUEyQix1QkFBdUI7QUFDbEQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsZ0JBQWdCLG9CQUFvQixxQkFBcUI7QUFDbEUsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQkFBbUQ7QUFDNUQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsb0JBQW9CO0FBRTdCLE1BQU0sNEJBQTRCLGdCQUEyQywyQkFBMkI7QUFVeEcsSUFBSyxvQkFBTCxrQkFBS0EsdUJBQUw7QUFDQyxFQUFBQSxzQ0FBQSxnQkFBYSxLQUFiO0FBQ0EsRUFBQUEsc0NBQUE7QUFGSSxTQUFBQTtBQUFBLEdBQUE7QUFPTCxNQUFNLGtCQUFrQjtBQUFBLEVBbUJ2QixZQUNVLE9BQ0EsU0FDUjtBQUZRO0FBQ0E7QUFBQSxFQUNOO0FBQUEsRUFwQkosT0FBTyxTQUFTLEtBQXdEO0FBQ3ZFLFFBQUksQ0FBQyxLQUFLO0FBQ1QsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJO0FBRUgsWUFBTSxPQUFZLEtBQUssTUFBTSxHQUFHO0FBQ2hDLFdBQ0UsS0FBSyxVQUFVLHNCQUFnQyxLQUFLLFVBQVUsc0JBQzVELE9BQU8sS0FBSyxZQUFZLFVBQzFCO0FBQ0QsZUFBTyxJQUFJLGtCQUFrQixLQUFLLE9BQU8sS0FBSyxPQUFPO0FBQUEsTUFDdEQ7QUFBQSxJQUNELFFBQVE7QUFBQSxJQUFlO0FBQ3ZCLFdBQU87QUFBQSxFQUNSO0FBTUQ7QUFFQSxJQUFNLDJCQUFOLGNBQXVDLFdBQWdEO0FBQUEsRUFRdEYsWUFDMkMsd0JBQ0MseUJBQ1Msa0NBQ0Usb0NBQ3JCLGVBQ1Msd0JBQ0gscUJBQ08sNEJBQ1MsNEJBQ2QsY0FDUCxnQkFDSCxhQUNHLGdCQUNELGVBQ2hDO0FBQ0QsVUFBTTtBQWZvQztBQUNDO0FBQ1M7QUFDRTtBQUNyQjtBQUNTO0FBQ0g7QUFDTztBQUNTO0FBQ2Q7QUFDUDtBQUNIO0FBQ0c7QUFDRDtBQUFBLEVBR2xDO0FBQUEsRUFFQSxXQUFvQjtBQUNuQixXQUFPLEtBQUssVUFBVTtBQUFBLEVBQ3ZCO0FBQUEsRUFFQSxNQUFNLFFBQXVCO0FBQzVCLFFBQUksS0FBSyxTQUFTLEdBQUc7QUFDcEIsWUFBTSxJQUFJLE1BQU0sZUFBZTtBQUFBLElBQ2hDO0FBRUEsVUFBTSxNQUFNLE1BQU0sS0FBSyxjQUFjLFFBQVE7QUFBQSxNQUM1QyxTQUFTLFNBQVMsc0JBQXNCLG9CQUFvQjtBQUFBLE1BQzVELFFBQVEsU0FBUyxnQkFBZ0IsK1JBQStSLEtBQUssZUFBZSxRQUFRO0FBQUEsTUFDNVYsZUFBZSxTQUFTLEVBQUUsS0FBSyxPQUFPLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLHNCQUFzQjtBQUFBLE1BQ2xHLFFBQVE7QUFBQSxJQUNULENBQUM7QUFFRCxRQUFJLENBQUMsSUFBSSxXQUFXO0FBQ25CO0FBQUEsSUFDRDtBQUVBLFVBQU0sa0JBQWtCLEtBQUssdUJBQXVCO0FBQ3BELFVBQU0sS0FBSyxtQ0FBbUMsMEJBQTBCO0FBQ3hFLFNBQUssUUFBUSxJQUFJLGtCQUFrQixvQkFBOEIsZ0JBQWdCLEVBQUU7QUFDbkYsVUFBTSxLQUFLLE9BQU87QUFBQSxFQUNuQjtBQUFBLEVBRUEsTUFBTSxTQUF3QjtBQUM3QixRQUFJLENBQUMsS0FBSyxTQUFTLEdBQUc7QUFDckI7QUFBQSxJQUNEO0FBRUEsUUFBSSxLQUFLLE9BQU8sVUFBVSxzQkFBZ0MsQ0FBQyxLQUFLLHVCQUF1QixVQUFVO0FBQ2hHLFlBQU0sS0FBSyxxQ0FBcUM7QUFBQSxJQUNqRDtBQUVBLFFBQUksS0FBSyxPQUFPLFVBQVUsbUJBQTZCO0FBQ3RELFlBQU0sS0FBSywrQkFBK0I7QUFBQSxJQUMzQztBQUVBLFVBQU0sS0FBSyxLQUFLO0FBQUEsRUFDakI7QUFBQSxFQUVBLE1BQU0sT0FBc0I7QUFDM0IsUUFBSSxDQUFDLEtBQUssU0FBUyxHQUFHO0FBQ3JCO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxvQkFBb0I7QUFDNUIsV0FBSyxtQkFBbUIsTUFBTTtBQUM5QixXQUFLLHFCQUFxQjtBQUFBLElBQzNCO0FBRUEsUUFBSSxLQUFLLHVCQUF1QixVQUFVO0FBQ3pDLFlBQU0sS0FBSyx1QkFBdUIsTUFBTTtBQUFBLElBQ3pDO0FBRUEsVUFBTSxVQUFVLEtBQUssd0JBQXdCLFNBQVMsS0FBSyxPQUFLLEVBQUUsT0FBTyxLQUFLLE9BQU8sT0FBTyxLQUFLLEtBQUssd0JBQXdCO0FBQzlILFNBQUssUUFBUTtBQUNiLFVBQU0sS0FBSyxpQ0FBaUMsY0FBYyxPQUFPO0FBQUEsRUFDbEU7QUFBQSxFQUVBLE1BQWMsdUNBQXNEO0FBQ25FLFFBQUksRUFBRSxNQUFNLEtBQUssMkJBQTJCLGFBQWEsY0FBYyxJQUFJLEdBQUcsUUFBUTtBQUNyRixXQUFLLFFBQVEsSUFBSSxrQkFBa0IsbUJBQTZCLEtBQUssTUFBTyxPQUFPO0FBQ25GO0FBQUEsSUFDRDtBQUVBLFVBQU0sU0FBUyxNQUFNLEtBQUssb0JBQW9CLFNBQVMsK0JBQStCLGtMQUFrTCxDQUFDO0FBQ3pRLFFBQUksV0FBVyxRQUFRO0FBQ3RCLFlBQU0sVUFBVSxLQUFLLHdCQUF3QixTQUFTLEtBQUssT0FBSyxFQUFFLE9BQU8sS0FBSyxNQUFPLE9BQU8sS0FBSyxLQUFLLHdCQUF3QjtBQUM5SCxZQUFNLEtBQUssbUNBQW1DLE9BQU87QUFBQSxJQUN0RDtBQUNBLFFBQUksV0FBVyxPQUFPO0FBQ3JCLFdBQUssUUFBUSxJQUFJLGtCQUFrQixtQkFBNkIsS0FBSyxNQUFPLE9BQU87QUFBQSxJQUNwRjtBQUNBLFFBQUksV0FBVyxRQUFRO0FBQ3RCLFlBQU0sS0FBSyxLQUFLO0FBQUEsSUFDakI7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLGlDQUFnRDtBQUM3RCxVQUFNLEtBQUssaUNBQWlDLCtCQUErQjtBQUMzRSxTQUFLLFlBQVksS0FBSyxLQUFLO0FBQzNCLFVBQU0sU0FBUyxNQUFNLEtBQUssb0JBQW9CLFNBQVMsaUJBQWlCLHNMQUFzTCxDQUFDO0FBQy9QLFFBQUksV0FBVyxRQUFRO0FBQ3RCLFlBQU0sS0FBSyxLQUFLO0FBQUEsSUFDakI7QUFDQSxRQUFJLFdBQVcsUUFBUTtBQUN0QixZQUFNLEtBQUssaUJBQWlCLFNBQVMsK0JBQStCLHVOQUF5TixDQUFDO0FBQUEsSUFDL1I7QUFDQSxRQUFJLFdBQVcsT0FBTztBQUNyQixZQUFNLEtBQUssaUJBQWlCLFNBQVMsb0JBQW9CLG9FQUFvRSxLQUFLLGVBQWUsUUFBUSxDQUFDO0FBQUEsSUFDM0o7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLG1DQUFtQyxTQUEwQztBQUMxRixVQUFNLEtBQUssaUNBQWlDLGNBQWMsT0FBTztBQUNqRSxVQUFNLGNBQWMsTUFBTSxLQUFLLDJCQUEyQixhQUFhLGNBQWMsSUFBSSxHQUFHLE9BQU8sU0FBTyxLQUFLLDJCQUEyQixVQUFVLEdBQUcsQ0FBQztBQUN4SixVQUFNLEtBQUssdUJBQXVCLE1BQU0sVUFBVTtBQUNsRCxVQUFNLEtBQUssWUFBWSxPQUFPO0FBQUEsRUFDL0I7QUFBQSxFQUVRLG9CQUFvQixTQUE4QztBQUN6RSxXQUFPLElBQUksUUFBUSxDQUFDLEdBQUcsTUFBTTtBQUM1QixZQUFNLGFBQTRCO0FBQUEsUUFDakMsT0FBTyxTQUFTLHNCQUFzQixtQkFBbUI7QUFBQSxRQUN6RCxLQUFLLE1BQU0sRUFBRSxNQUFNO0FBQUEsTUFDcEI7QUFDQSxZQUFNLFlBQTJCO0FBQUEsUUFDaEMsT0FBTyxTQUFTLGVBQWUsaUJBQWlCO0FBQUEsUUFDaEQsS0FBSyxNQUFNLEVBQUUsS0FBSztBQUFBLE1BQ25CO0FBQ0EsWUFBTSxPQUFzQjtBQUFBLFFBQzNCLE9BQU8sU0FBUyxRQUFRLE1BQU07QUFBQSxRQUM5QixLQUFLLE1BQU0sRUFBRSxNQUFNO0FBQUEsTUFDcEI7QUFDQSxXQUFLLHFCQUFxQixLQUFLLG9CQUFvQjtBQUFBLFFBQ2xELFNBQVM7QUFBQSxRQUNUO0FBQUEsUUFDQSxDQUFDLFlBQVksV0FBVyxJQUFJO0FBQUEsUUFDNUIsRUFBRSxRQUFRLE1BQU0sVUFBVSxxQkFBcUIsT0FBTztBQUFBLE1BQ3ZEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYyxpQkFBaUIsU0FBZ0M7QUFDOUQsUUFBSSxzQkFBc0I7QUFDMUIsUUFBSSxLQUFLLGVBQWUsWUFBWSxVQUFVO0FBQzdDLFlBQU0sTUFBTSxNQUFNLEtBQUssZ0NBQWdDO0FBQ3ZELFVBQUksUUFBUSxRQUFRO0FBQ25CLGNBQU0sS0FBSyxjQUFjLE9BQU87QUFBQSxVQUMvQixNQUFNLFNBQVM7QUFBQSxVQUNmLFNBQVMsU0FBUyxzQkFBc0Isb0JBQW9CO0FBQUEsVUFDNUQsUUFBUSxTQUFTLGdCQUFnQix3TEFBd0wsS0FBSyxlQUFlLFFBQVE7QUFBQSxVQUNyUCxRQUFRO0FBQUEsUUFDVCxDQUFDO0FBQ0Q7QUFBQSxNQUNEO0FBQ0EsVUFBSSxRQUFRLFFBQVE7QUFDbkIsY0FBTSxLQUFLLEtBQUs7QUFDaEI7QUFBQSxNQUNEO0FBQ0EsVUFBSSxRQUFRLE9BQU87QUFDbEIsOEJBQXNCO0FBQUEsTUFDdkI7QUFBQSxJQUNEO0FBRUEsVUFBTSxLQUFLLGFBQWEsYUFBYTtBQUFBLE1BQ3BDLFdBQVcsS0FBSyxPQUFPLElBQUksc0JBQXNCLDRDQUE0QyxLQUFLLGVBQWUsUUFBUSxjQUFjLEVBQUU7QUFBQSxJQUMxSSxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYyxrQ0FBMkU7QUFDeEYsVUFBTSxhQUFhLE1BQU0sS0FBSyxjQUFjLFFBQVE7QUFBQSxNQUNuRCxNQUFNO0FBQUEsTUFDTixTQUFTLFNBQVMsc0JBQXNCLG9CQUFvQjtBQUFBLE1BQzVELGVBQWUsU0FBUyxxQkFBcUIseUJBQXlCLEtBQUssZUFBZSxRQUFRO0FBQUEsTUFDbEcsY0FBYyxTQUFTLGlCQUFpQixxQkFBcUI7QUFBQSxNQUM3RCxRQUFRLFNBQVMsNEJBQTRCLG1FQUFtRSxLQUFLLGVBQWUsUUFBUTtBQUFBLE1BQzVJLFFBQVE7QUFBQSxRQUNQLG9CQUFvQjtBQUFBLE1BQ3JCO0FBQUEsSUFDRCxDQUFDO0FBRUQsUUFBSSxDQUFDLFdBQVcsV0FBVztBQUMxQixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sU0FBUyxNQUFNLEtBQUssY0FBYyxLQUFLLElBQUksTUFBTSxnQ0FBZ0MsQ0FBQztBQUN4RixRQUFJLENBQUMsUUFBUTtBQUNaLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxNQUFNLE1BQU0sS0FBSyxjQUFjLE9BQTJCO0FBQUEsTUFDL0QsTUFBTTtBQUFBLE1BQ04sU0FBUyxTQUFTLHNCQUFzQixvQkFBb0I7QUFBQSxNQUM1RCxTQUFTLENBQUM7QUFBQSxRQUNULE9BQU8sU0FBUyxRQUFRLG1CQUFtQjtBQUFBLFFBQzNDLEtBQUssTUFBTTtBQUFBLE1BQ1osR0FBRztBQUFBLFFBQ0YsT0FBTyxTQUFTLE9BQU8saUJBQWlCO0FBQUEsUUFDeEMsS0FBSyxNQUFNO0FBQUEsTUFDWixDQUFDO0FBQUEsTUFDRCxjQUFjO0FBQUEsUUFDYixPQUFPLFNBQVMsUUFBUSxNQUFNO0FBQUEsUUFDOUIsS0FBSyxNQUFNO0FBQUEsTUFDWjtBQUFBLE1BQ0EsUUFBUSxTQUFTLDBCQUEwQiw0RkFBNEYsS0FBSyxlQUFlLFFBQVE7QUFBQSxNQUNuSyxRQUFRO0FBQUEsUUFDUCxvQkFBb0I7QUFBQSxNQUNyQjtBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU8sSUFBSTtBQUFBLEVBQ1o7QUFBQSxFQUdBLElBQUksUUFBdUM7QUFDMUMsUUFBSSxLQUFLLFdBQVcsUUFBVztBQUM5QixZQUFNLE1BQU0sS0FBSyxlQUFlLElBQUkseUJBQXlCLFlBQVksYUFBYSxPQUFPO0FBQzdGLFdBQUssU0FBUyxrQkFBa0IsU0FBUyxHQUFHO0FBQUEsSUFDN0M7QUFDQSxXQUFPLEtBQUssVUFBVTtBQUFBLEVBQ3ZCO0FBQUEsRUFFQSxJQUFJLE1BQU0sT0FBc0M7QUFDL0MsU0FBSyxTQUFTLFNBQVM7QUFDdkIsU0FBSyxZQUFZLEtBQUs7QUFBQSxFQUN2QjtBQUFBLEVBRVEsWUFBWSxPQUFzQztBQUN6RCxRQUFJLE9BQU87QUFDVixXQUFLLGVBQWUsTUFBTSx5QkFBeUIsWUFBWSxLQUFLLFVBQVUsS0FBSyxHQUFHLGFBQWEsU0FBUyxjQUFjLE9BQU87QUFBQSxJQUNsSSxPQUFPO0FBQ04sV0FBSyxlQUFlLE9BQU8seUJBQXlCLFlBQVksYUFBYSxPQUFPO0FBQUEsSUFDckY7QUFBQSxFQUNEO0FBQ0Q7QUFwUE0seUJBSVcsYUFBYTtBQUp4QiwyQkFBTjtBQUFBLEVBU0c7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F0Qkc7QUFzUE4sSUFBTSxzQkFBTixjQUFrQyxXQUFXO0FBQUEsRUFJNUMsWUFDc0MsbUJBQ08sMEJBQzNCLGdCQUNoQjtBQUNELFVBQU07QUFKK0I7QUFDTztBQUk1QyxTQUFLLGNBQWM7QUFDbkIsUUFBSSx5QkFBeUIsU0FBUyxHQUFHO0FBQ3hDLCtCQUF5QixPQUFPO0FBQUEsSUFDakM7QUFDQSxTQUFLLFVBQVUsZUFBZSxpQkFBaUIsYUFBYSxTQUFTLHlCQUF5QixZQUFZLEtBQUssTUFBTSxFQUFFLE1BQU07QUFDNUgsV0FBSyxjQUFjO0FBQUEsSUFDcEIsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEsZ0JBQXNCO0FBQzdCLHdCQUFvQix3QkFBd0IsT0FBTyxLQUFLLGlCQUFpQixFQUFFLElBQUksS0FBSyx5QkFBeUIsU0FBUyxDQUFDO0FBQUEsRUFDeEg7QUFFRDtBQXZCTSxvQkFFRSwwQkFBMEIsSUFBSSxjQUF1Qiw2QkFBNkIsS0FBSztBQUZ6RixzQkFBTjtBQUFBLEVBS0c7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUEc7QUF5Qk4sU0FBUyxHQUFvQyxXQUFXLFNBQVMsRUFBRSw4QkFBOEIscUJBQXFCLGVBQWUsUUFBUTtBQUU3SSxnQkFBZ0IsTUFBTSxnQ0FBZ0MsUUFBUTtBQUFBLEVBQzdELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUscUJBQXFCLHVCQUF1QjtBQUFBLE1BQzdELFVBQVUsV0FBVztBQUFBLE1BQ3JCLElBQUk7QUFBQSxNQUNKLGNBQWMsZUFBZSxJQUFJLG9CQUFvQix3QkFBd0IsT0FBTyxHQUFHLGtCQUFrQixVQUFVLEVBQUUsR0FBRyxhQUFhLE9BQU8sQ0FBQztBQUFBLElBQzlJLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFDQSxJQUFJLFVBQTJDO0FBQzlDLFdBQU8sU0FBUyxJQUFJLHlCQUF5QixFQUFFLE1BQU07QUFBQSxFQUN0RDtBQUNELENBQUM7QUFFRCxnQkFBZ0IsY0FBYyxRQUFRO0FBQUEsRUFDckMsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSxjQUFjLHlCQUF5QjtBQUFBLE1BQ3hELFVBQVUsV0FBVztBQUFBLE1BQ3JCLElBQUk7QUFBQSxNQUNKLGNBQWMsb0JBQW9CO0FBQUEsSUFDbkMsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUEyQztBQUNwRCxXQUFPLFNBQVMsSUFBSSx5QkFBeUIsRUFBRSxLQUFLO0FBQUEsRUFDckQ7QUFDRCxDQUFDO0FBR0Qsa0JBQWtCLDJCQUEyQiwwQkFBMEIsa0JBQWtCLE9BQU87IiwKICAibmFtZXMiOiBbIlRyb3VibGVzaG9vdFN0YWdlIl0KfQo=
