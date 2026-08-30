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
import { isNonEmptyArray } from "../../../base/common/arrays.js";
import { Disposable, MutableDisposable } from "../../../base/common/lifecycle.js";
import { joinPath } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { IFileService } from "../../files/common/files.js";
import { IProductService } from "../../product/common/productService.js";
import { disposableTimeout } from "../../../base/common/async.js";
import { Event } from "../../../base/common/event.js";
import { join } from "../../../base/common/path.js";
import { isWindows } from "../../../base/common/platform.js";
import { env } from "../../../base/common/process.js";
import { areSameExtensions } from "./extensionManagementUtil.js";
import { RecommendationsNotificationResult, RecommendationSource } from "../../extensionRecommendations/common/extensionRecommendations.js";
import { ExtensionType } from "../../extensions/common/extensions.js";
import { StorageScope, StorageTarget } from "../../storage/common/storage.js";
let ExtensionTipsService = class extends Disposable {
  constructor(fileService, productService) {
    super();
    this.fileService = fileService;
    this.productService = productService;
    this.allConfigBasedTips = /* @__PURE__ */ new Map();
    if (this.productService.configBasedExtensionTips) {
      Object.entries(this.productService.configBasedExtensionTips).forEach(([, value]) => this.allConfigBasedTips.set(value.configPath, value));
    }
  }
  getConfigBasedTips(folder) {
    return this.getValidConfigBasedTips(folder);
  }
  async getImportantExecutableBasedTips() {
    return [];
  }
  async getOtherExecutableBasedTips() {
    return [];
  }
  async getValidConfigBasedTips(folder) {
    const result = [];
    for (const [configPath, tip] of this.allConfigBasedTips) {
      if (tip.configScheme && tip.configScheme !== folder.scheme) {
        continue;
      }
      try {
        const content = (await this.fileService.readFile(joinPath(folder, configPath))).value.toString();
        for (const [key, value] of Object.entries(tip.recommendations)) {
          if (!value.contentPattern || new RegExp(value.contentPattern, "mig").test(content)) {
            result.push({
              extensionId: key,
              extensionName: value.name,
              configName: tip.configName,
              important: !!value.important,
              isExtensionPack: !!value.isExtensionPack,
              whenNotInstalled: value.whenNotInstalled
            });
          }
        }
      } catch (error) {
      }
    }
    return result;
  }
};
ExtensionTipsService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IProductService)
], ExtensionTipsService);
const promptedExecutableTipsStorageKey = "extensionTips/promptedExecutableTips";
const lastPromptedMediumImpExeTimeStorageKey = "extensionTips/lastPromptedMediumImpExeTime";
class AbstractNativeExtensionTipsService extends ExtensionTipsService {
  constructor(userHome, windowEvents, telemetryService, extensionManagementService, storageService, extensionRecommendationNotificationService, fileService, productService) {
    super(fileService, productService);
    this.userHome = userHome;
    this.windowEvents = windowEvents;
    this.telemetryService = telemetryService;
    this.extensionManagementService = extensionManagementService;
    this.storageService = storageService;
    this.extensionRecommendationNotificationService = extensionRecommendationNotificationService;
    this.highImportanceExecutableTips = /* @__PURE__ */ new Map();
    this.mediumImportanceExecutableTips = /* @__PURE__ */ new Map();
    this.allOtherExecutableTips = /* @__PURE__ */ new Map();
    this.highImportanceTipsByExe = /* @__PURE__ */ new Map();
    this.mediumImportanceTipsByExe = /* @__PURE__ */ new Map();
    if (productService.exeBasedExtensionTips) {
      Object.entries(productService.exeBasedExtensionTips).forEach(([key, exeBasedExtensionTip]) => {
        const highImportanceRecommendations = [];
        const mediumImportanceRecommendations = [];
        const otherRecommendations = [];
        Object.entries(exeBasedExtensionTip.recommendations).forEach(([extensionId, value]) => {
          if (value.important) {
            if (exeBasedExtensionTip.important) {
              highImportanceRecommendations.push({ extensionId, extensionName: value.name, isExtensionPack: !!value.isExtensionPack });
            } else {
              mediumImportanceRecommendations.push({ extensionId, extensionName: value.name, isExtensionPack: !!value.isExtensionPack });
            }
          } else {
            otherRecommendations.push({ extensionId, extensionName: value.name, isExtensionPack: !!value.isExtensionPack });
          }
        });
        if (highImportanceRecommendations.length) {
          this.highImportanceExecutableTips.set(key, { exeFriendlyName: exeBasedExtensionTip.friendlyName, windowsPath: exeBasedExtensionTip.windowsPath, recommendations: highImportanceRecommendations });
        }
        if (mediumImportanceRecommendations.length) {
          this.mediumImportanceExecutableTips.set(key, { exeFriendlyName: exeBasedExtensionTip.friendlyName, windowsPath: exeBasedExtensionTip.windowsPath, recommendations: mediumImportanceRecommendations });
        }
        if (otherRecommendations.length) {
          this.allOtherExecutableTips.set(key, { exeFriendlyName: exeBasedExtensionTip.friendlyName, windowsPath: exeBasedExtensionTip.windowsPath, recommendations: otherRecommendations });
        }
      });
    }
    disposableTimeout(async () => {
      await this.collectTips();
      this.promptHighImportanceExeBasedTip();
      this.promptMediumImportanceExeBasedTip();
    }, 3e3, this._store);
  }
  async getImportantExecutableBasedTips() {
    const highImportanceExeTips = await this.getValidExecutableBasedExtensionTips(this.highImportanceExecutableTips);
    const mediumImportanceExeTips = await this.getValidExecutableBasedExtensionTips(this.mediumImportanceExecutableTips);
    return [...highImportanceExeTips, ...mediumImportanceExeTips];
  }
  getOtherExecutableBasedTips() {
    return this.getValidExecutableBasedExtensionTips(this.allOtherExecutableTips);
  }
  async collectTips() {
    const highImportanceExeTips = await this.getValidExecutableBasedExtensionTips(this.highImportanceExecutableTips);
    const mediumImportanceExeTips = await this.getValidExecutableBasedExtensionTips(this.mediumImportanceExecutableTips);
    const local = await this.extensionManagementService.getInstalled();
    this.highImportanceTipsByExe = this.groupImportantTipsByExe(highImportanceExeTips, local);
    this.mediumImportanceTipsByExe = this.groupImportantTipsByExe(mediumImportanceExeTips, local);
  }
  groupImportantTipsByExe(importantExeBasedTips, local) {
    const importantExeBasedRecommendations = /* @__PURE__ */ new Map();
    importantExeBasedTips.forEach((tip) => importantExeBasedRecommendations.set(tip.extensionId.toLowerCase(), tip));
    const { installed, uninstalled: recommendations } = this.groupByInstalled([...importantExeBasedRecommendations.keys()], local);
    for (const extensionId of installed) {
      const tip = importantExeBasedRecommendations.get(extensionId);
      if (tip) {
        this.telemetryService.publicLog2("exeExtensionRecommendations:alreadyInstalled", { extensionId, exeName: tip.exeName });
      }
    }
    for (const extensionId of recommendations) {
      const tip = importantExeBasedRecommendations.get(extensionId);
      if (tip) {
        this.telemetryService.publicLog2("exeExtensionRecommendations:notInstalled", { extensionId, exeName: tip.exeName });
      }
    }
    const promptedExecutableTips = this.getPromptedExecutableTips();
    const tipsByExe = /* @__PURE__ */ new Map();
    for (const extensionId of recommendations) {
      const tip = importantExeBasedRecommendations.get(extensionId);
      if (tip && (!promptedExecutableTips[tip.exeName] || !promptedExecutableTips[tip.exeName].includes(tip.extensionId))) {
        let tips = tipsByExe.get(tip.exeName);
        if (!tips) {
          tips = [];
          tipsByExe.set(tip.exeName, tips);
        }
        tips.push(tip);
      }
    }
    return tipsByExe;
  }
  /**
   * High importance tips are prompted once per restart session
   */
  promptHighImportanceExeBasedTip() {
    if (this.highImportanceTipsByExe.size === 0) {
      return;
    }
    const [exeName, tips] = [...this.highImportanceTipsByExe.entries()][0];
    this.promptExeRecommendations(tips).then((result) => {
      switch (result) {
        case RecommendationsNotificationResult.Accepted:
          this.addToRecommendedExecutables(tips[0].exeName, tips);
          break;
        case RecommendationsNotificationResult.Ignored:
          this.highImportanceTipsByExe.delete(exeName);
          break;
        case RecommendationsNotificationResult.IncompatibleWindow: {
          const onActiveWindowChange = Event.once(Event.latch(Event.any(this.windowEvents.onDidOpenMainWindow, this.windowEvents.onDidFocusMainWindow)));
          this._register(onActiveWindowChange(() => this.promptHighImportanceExeBasedTip()));
          break;
        }
        case RecommendationsNotificationResult.TooMany: {
          const disposable = this._register(new MutableDisposable());
          disposable.value = disposableTimeout(
            () => {
              disposable.dispose();
              this.promptHighImportanceExeBasedTip();
            },
            60 * 60 * 1e3
            /* 1 hour */
          );
          break;
        }
      }
    });
  }
  /**
   * Medium importance tips are prompted once per 7 days
   */
  promptMediumImportanceExeBasedTip() {
    if (this.mediumImportanceTipsByExe.size === 0) {
      return;
    }
    const lastPromptedMediumExeTime = this.getLastPromptedMediumExeTime();
    const timeSinceLastPrompt = Date.now() - lastPromptedMediumExeTime;
    const promptInterval = 7 * 24 * 60 * 60 * 1e3;
    if (timeSinceLastPrompt < promptInterval) {
      const disposable = this._register(new MutableDisposable());
      disposable.value = disposableTimeout(() => {
        disposable.dispose();
        this.promptMediumImportanceExeBasedTip();
      }, promptInterval - timeSinceLastPrompt);
      return;
    }
    const [exeName, tips] = [...this.mediumImportanceTipsByExe.entries()][0];
    this.promptExeRecommendations(tips).then((result) => {
      switch (result) {
        case RecommendationsNotificationResult.Accepted: {
          this.updateLastPromptedMediumExeTime(Date.now());
          this.mediumImportanceTipsByExe.delete(exeName);
          this.addToRecommendedExecutables(tips[0].exeName, tips);
          const disposable1 = this._register(new MutableDisposable());
          disposable1.value = disposableTimeout(() => {
            disposable1.dispose();
            this.promptMediumImportanceExeBasedTip();
          }, promptInterval);
          break;
        }
        case RecommendationsNotificationResult.Ignored:
          this.mediumImportanceTipsByExe.delete(exeName);
          this.promptMediumImportanceExeBasedTip();
          break;
        case RecommendationsNotificationResult.IncompatibleWindow: {
          const onActiveWindowChange = Event.once(Event.latch(Event.any(this.windowEvents.onDidOpenMainWindow, this.windowEvents.onDidFocusMainWindow)));
          this._register(onActiveWindowChange(() => this.promptMediumImportanceExeBasedTip()));
          break;
        }
        case RecommendationsNotificationResult.TooMany: {
          const disposable2 = this._register(new MutableDisposable());
          disposable2.value = disposableTimeout(
            () => {
              disposable2.dispose();
              this.promptMediumImportanceExeBasedTip();
            },
            60 * 60 * 1e3
            /* 1 hour */
          );
          break;
        }
      }
    });
  }
  async promptExeRecommendations(tips) {
    const installed = await this.extensionManagementService.getInstalled(ExtensionType.User);
    const extensions = tips.filter((tip) => !tip.whenNotInstalled || tip.whenNotInstalled.every((id) => installed.every((local) => !areSameExtensions(local.identifier, { id })))).map(({ extensionId }) => extensionId.toLowerCase());
    return this.extensionRecommendationNotificationService.promptImportantExtensionsInstallNotification({ extensions, source: RecommendationSource.EXE, name: tips[0].exeFriendlyName, searchValue: `@exe:"${tips[0].exeName}"` });
  }
  getLastPromptedMediumExeTime() {
    let value = this.storageService.getNumber(lastPromptedMediumImpExeTimeStorageKey, StorageScope.APPLICATION);
    if (!value) {
      value = Date.now();
      this.updateLastPromptedMediumExeTime(value);
    }
    return value;
  }
  updateLastPromptedMediumExeTime(value) {
    this.storageService.store(lastPromptedMediumImpExeTimeStorageKey, value, StorageScope.APPLICATION, StorageTarget.MACHINE);
  }
  getPromptedExecutableTips() {
    return JSON.parse(this.storageService.get(promptedExecutableTipsStorageKey, StorageScope.APPLICATION, "{}"));
  }
  addToRecommendedExecutables(exeName, tips) {
    const promptedExecutableTips = this.getPromptedExecutableTips();
    promptedExecutableTips[exeName] = tips.map(({ extensionId }) => extensionId.toLowerCase());
    this.storageService.store(promptedExecutableTipsStorageKey, JSON.stringify(promptedExecutableTips), StorageScope.APPLICATION, StorageTarget.USER);
  }
  groupByInstalled(recommendationsToSuggest, local) {
    const installed = [], uninstalled = [];
    const installedExtensionsIds = local.reduce((result, i) => {
      result.add(i.identifier.id.toLowerCase());
      return result;
    }, /* @__PURE__ */ new Set());
    recommendationsToSuggest.forEach((id) => {
      if (installedExtensionsIds.has(id.toLowerCase())) {
        installed.push(id);
      } else {
        uninstalled.push(id);
      }
    });
    return { installed, uninstalled };
  }
  async getValidExecutableBasedExtensionTips(executableTips) {
    const result = [];
    const checkedExecutables = /* @__PURE__ */ new Map();
    for (const exeName of executableTips.keys()) {
      const extensionTip = executableTips.get(exeName);
      if (!extensionTip || !isNonEmptyArray(extensionTip.recommendations)) {
        continue;
      }
      const exePaths = [];
      if (isWindows) {
        if (extensionTip.windowsPath) {
          exePaths.push(extensionTip.windowsPath.replace("%USERPROFILE%", () => env["USERPROFILE"]).replace("%ProgramFiles(x86)%", () => env["ProgramFiles(x86)"]).replace("%ProgramFiles%", () => env["ProgramFiles"]).replace("%APPDATA%", () => env["APPDATA"]).replace("%WINDIR%", () => env["WINDIR"]));
        }
      } else {
        exePaths.push(join("/usr/local/bin", exeName));
        exePaths.push(join("/usr/bin", exeName));
        exePaths.push(join(this.userHome.fsPath, exeName));
      }
      for (const exePath of exePaths) {
        let exists = checkedExecutables.get(exePath);
        if (exists === void 0) {
          exists = await this.fileService.exists(URI.file(exePath));
          checkedExecutables.set(exePath, exists);
        }
        if (exists) {
          for (const { extensionId, extensionName, isExtensionPack, whenNotInstalled } of extensionTip.recommendations) {
            result.push({
              extensionId,
              extensionName,
              isExtensionPack,
              exeName,
              exeFriendlyName: extensionTip.exeFriendlyName,
              windowsPath: extensionTip.windowsPath,
              whenNotInstalled
            });
          }
        }
      }
    }
    return result;
  }
}
export {
  AbstractNativeExtensionTipsService,
  ExtensionTipsService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZXh0ZW5zaW9uTWFuYWdlbWVudFxcY29tbW9uXFxleHRlbnNpb25UaXBzU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlzTm9uRW1wdHlBcnJheSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlnQmFzZWRFeHRlbnNpb25UaXAgYXMgSVJhd0NvbmZpZ0Jhc2VkRXh0ZW5zaW9uVGlwIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ0Jhc2VkRXh0ZW5zaW9uVGlwLCBJRXhlY3V0YWJsZUJhc2VkRXh0ZW5zaW9uVGlwLCBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIElFeHRlbnNpb25UaXBzU2VydmljZSwgSUxvY2FsRXh0ZW5zaW9uIH0gZnJvbSAnLi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBlbnYgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wcm9jZXNzLmpzJztcbmltcG9ydCB7IGFyZVNhbWVFeHRlbnNpb25zIH0gZnJvbSAnLi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlLCBSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25SZXN1bHQsIFJlY29tbWVuZGF0aW9uU291cmNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zL2NvbW1vbi9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uVHlwZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuXG4vLyNyZWdpb24gQmFzZSBFeHRlbnNpb24gVGlwcyBTZXJ2aWNlXG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25UaXBzU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0ZW5zaW9uVGlwc1NlcnZpY2Uge1xuXG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGFsbENvbmZpZ0Jhc2VkVGlwczogTWFwPHN0cmluZywgSVJhd0NvbmZpZ0Jhc2VkRXh0ZW5zaW9uVGlwPiA9IG5ldyBNYXA8c3RyaW5nLCBJUmF3Q29uZmlnQmFzZWRFeHRlbnNpb25UaXA+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRpZiAodGhpcy5wcm9kdWN0U2VydmljZS5jb25maWdCYXNlZEV4dGVuc2lvblRpcHMpIHtcblx0XHRcdE9iamVjdC5lbnRyaWVzKHRoaXMucHJvZHVjdFNlcnZpY2UuY29uZmlnQmFzZWRFeHRlbnNpb25UaXBzKS5mb3JFYWNoKChbLCB2YWx1ZV0pID0+IHRoaXMuYWxsQ29uZmlnQmFzZWRUaXBzLnNldCh2YWx1ZS5jb25maWdQYXRoLCB2YWx1ZSkpO1xuXHRcdH1cblx0fVxuXG5cdGdldENvbmZpZ0Jhc2VkVGlwcyhmb2xkZXI6IFVSSSk6IFByb21pc2U8SUNvbmZpZ0Jhc2VkRXh0ZW5zaW9uVGlwW10+IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRWYWxpZENvbmZpZ0Jhc2VkVGlwcyhmb2xkZXIpO1xuXHR9XG5cblx0YXN5bmMgZ2V0SW1wb3J0YW50RXhlY3V0YWJsZUJhc2VkVGlwcygpOiBQcm9taXNlPElFeGVjdXRhYmxlQmFzZWRFeHRlbnNpb25UaXBbXT4ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGFzeW5jIGdldE90aGVyRXhlY3V0YWJsZUJhc2VkVGlwcygpOiBQcm9taXNlPElFeGVjdXRhYmxlQmFzZWRFeHRlbnNpb25UaXBbXT4ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0VmFsaWRDb25maWdCYXNlZFRpcHMoZm9sZGVyOiBVUkkpOiBQcm9taXNlPElDb25maWdCYXNlZEV4dGVuc2lvblRpcFtdPiB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJQ29uZmlnQmFzZWRFeHRlbnNpb25UaXBbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW2NvbmZpZ1BhdGgsIHRpcF0gb2YgdGhpcy5hbGxDb25maWdCYXNlZFRpcHMpIHtcblx0XHRcdGlmICh0aXAuY29uZmlnU2NoZW1lICYmIHRpcC5jb25maWdTY2hlbWUgIT09IGZvbGRlci5zY2hlbWUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUoam9pblBhdGgoZm9sZGVyLCBjb25maWdQYXRoKSkpLnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHRpcC5yZWNvbW1lbmRhdGlvbnMpKSB7XG5cdFx0XHRcdFx0aWYgKCF2YWx1ZS5jb250ZW50UGF0dGVybiB8fCBuZXcgUmVnRXhwKHZhbHVlLmNvbnRlbnRQYXR0ZXJuLCAnbWlnJykudGVzdChjb250ZW50KSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdFx0XHRleHRlbnNpb25JZDoga2V5LFxuXHRcdFx0XHRcdFx0XHRleHRlbnNpb25OYW1lOiB2YWx1ZS5uYW1lLFxuXHRcdFx0XHRcdFx0XHRjb25maWdOYW1lOiB0aXAuY29uZmlnTmFtZSxcblx0XHRcdFx0XHRcdFx0aW1wb3J0YW50OiAhIXZhbHVlLmltcG9ydGFudCxcblx0XHRcdFx0XHRcdFx0aXNFeHRlbnNpb25QYWNrOiAhIXZhbHVlLmlzRXh0ZW5zaW9uUGFjayxcblx0XHRcdFx0XHRcdFx0d2hlbk5vdEluc3RhbGxlZDogdmFsdWUud2hlbk5vdEluc3RhbGxlZFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikgeyAvKiBJZ25vcmUgKi8gfVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gTmF0aXZlIEV4dGVuc2lvbiBUaXBzIFNlcnZpY2UgKGVuYWJsZXMgdW5pdCB0ZXN0aW5nIGhhdmluZyBpdCBoZXJlIGluIFwiY29tbW9uXCIpXG5cbnR5cGUgRXhlRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnc2FuZHkwODEnO1xuXHRjb21tZW50OiAnSW5mb3JtYXRpb24gYWJvdXQgZXhlY3V0YWJsZSBiYXNlZCBleHRlbnNpb24gcmVjb21tZW5kYXRpb24nO1xuXHRleHRlbnNpb25JZDogeyBjbGFzc2lmaWNhdGlvbjogJ1B1YmxpY05vblBlcnNvbmFsRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdpZCBvZiB0aGUgcmVjb21tZW5kZWQgZXh0ZW5zaW9uJyB9O1xuXHRleGVOYW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ25hbWUgb2YgdGhlIGV4ZWN1dGFibGUgZm9yIHdoaWNoIGV4dGVuc2lvbiBpcyBiZWluZyByZWNvbW1lbmRlZCcgfTtcbn07XG5cbnR5cGUgSUV4ZUJhc2VkRXh0ZW5zaW9uVGlwcyA9IHtcblx0cmVhZG9ubHkgZXhlRnJpZW5kbHlOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHdpbmRvd3NQYXRoPzogc3RyaW5nO1xuXHRyZWFkb25seSByZWNvbW1lbmRhdGlvbnM6IHsgZXh0ZW5zaW9uSWQ6IHN0cmluZzsgZXh0ZW5zaW9uTmFtZTogc3RyaW5nOyBpc0V4dGVuc2lvblBhY2s6IGJvb2xlYW47IHdoZW5Ob3RJbnN0YWxsZWQ/OiBzdHJpbmdbXSB9W107XG59O1xuXG5jb25zdCBwcm9tcHRlZEV4ZWN1dGFibGVUaXBzU3RvcmFnZUtleSA9ICdleHRlbnNpb25UaXBzL3Byb21wdGVkRXhlY3V0YWJsZVRpcHMnO1xuY29uc3QgbGFzdFByb21wdGVkTWVkaXVtSW1wRXhlVGltZVN0b3JhZ2VLZXkgPSAnZXh0ZW5zaW9uVGlwcy9sYXN0UHJvbXB0ZWRNZWRpdW1JbXBFeGVUaW1lJztcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0TmF0aXZlRXh0ZW5zaW9uVGlwc1NlcnZpY2UgZXh0ZW5kcyBFeHRlbnNpb25UaXBzU2VydmljZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBoaWdoSW1wb3J0YW5jZUV4ZWN1dGFibGVUaXBzOiBNYXA8c3RyaW5nLCBJRXhlQmFzZWRFeHRlbnNpb25UaXBzPiA9IG5ldyBNYXA8c3RyaW5nLCBJRXhlQmFzZWRFeHRlbnNpb25UaXBzPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1lZGl1bUltcG9ydGFuY2VFeGVjdXRhYmxlVGlwczogTWFwPHN0cmluZywgSUV4ZUJhc2VkRXh0ZW5zaW9uVGlwcz4gPSBuZXcgTWFwPHN0cmluZywgSUV4ZUJhc2VkRXh0ZW5zaW9uVGlwcz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBhbGxPdGhlckV4ZWN1dGFibGVUaXBzOiBNYXA8c3RyaW5nLCBJRXhlQmFzZWRFeHRlbnNpb25UaXBzPiA9IG5ldyBNYXA8c3RyaW5nLCBJRXhlQmFzZWRFeHRlbnNpb25UaXBzPigpO1xuXG5cdHByaXZhdGUgaGlnaEltcG9ydGFuY2VUaXBzQnlFeGUgPSBuZXcgTWFwPHN0cmluZywgSUV4ZWN1dGFibGVCYXNlZEV4dGVuc2lvblRpcFtdPigpO1xuXHRwcml2YXRlIG1lZGl1bUltcG9ydGFuY2VUaXBzQnlFeGUgPSBuZXcgTWFwPHN0cmluZywgSUV4ZWN1dGFibGVCYXNlZEV4dGVuc2lvblRpcFtdPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdXNlckhvbWU6IFVSSSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdpbmRvd0V2ZW50czoge1xuXHRcdFx0cmVhZG9ubHkgb25EaWRPcGVuTWFpbldpbmRvdzogRXZlbnQ8dW5rbm93bj47XG5cdFx0XHRyZWFkb25seSBvbkRpZEZvY3VzTWFpbldpbmRvdzogRXZlbnQ8dW5rbm93bj47XG5cdFx0fSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25SZWNvbW1lbmRhdGlvbk5vdGlmaWNhdGlvblNlcnZpY2U6IElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbk5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0ZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGZpbGVTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSk7XG5cdFx0aWYgKHByb2R1Y3RTZXJ2aWNlLmV4ZUJhc2VkRXh0ZW5zaW9uVGlwcykge1xuXHRcdFx0T2JqZWN0LmVudHJpZXMocHJvZHVjdFNlcnZpY2UuZXhlQmFzZWRFeHRlbnNpb25UaXBzKS5mb3JFYWNoKChba2V5LCBleGVCYXNlZEV4dGVuc2lvblRpcF0pID0+IHtcblx0XHRcdFx0Y29uc3QgaGlnaEltcG9ydGFuY2VSZWNvbW1lbmRhdGlvbnM6IHsgZXh0ZW5zaW9uSWQ6IHN0cmluZzsgZXh0ZW5zaW9uTmFtZTogc3RyaW5nOyBpc0V4dGVuc2lvblBhY2s6IGJvb2xlYW4gfVtdID0gW107XG5cdFx0XHRcdGNvbnN0IG1lZGl1bUltcG9ydGFuY2VSZWNvbW1lbmRhdGlvbnM6IHsgZXh0ZW5zaW9uSWQ6IHN0cmluZzsgZXh0ZW5zaW9uTmFtZTogc3RyaW5nOyBpc0V4dGVuc2lvblBhY2s6IGJvb2xlYW4gfVtdID0gW107XG5cdFx0XHRcdGNvbnN0IG90aGVyUmVjb21tZW5kYXRpb25zOiB7IGV4dGVuc2lvbklkOiBzdHJpbmc7IGV4dGVuc2lvbk5hbWU6IHN0cmluZzsgaXNFeHRlbnNpb25QYWNrOiBib29sZWFuIH1bXSA9IFtdO1xuXHRcdFx0XHRPYmplY3QuZW50cmllcyhleGVCYXNlZEV4dGVuc2lvblRpcC5yZWNvbW1lbmRhdGlvbnMpLmZvckVhY2goKFtleHRlbnNpb25JZCwgdmFsdWVdKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHZhbHVlLmltcG9ydGFudCkge1xuXHRcdFx0XHRcdFx0aWYgKGV4ZUJhc2VkRXh0ZW5zaW9uVGlwLmltcG9ydGFudCkge1xuXHRcdFx0XHRcdFx0XHRoaWdoSW1wb3J0YW5jZVJlY29tbWVuZGF0aW9ucy5wdXNoKHsgZXh0ZW5zaW9uSWQsIGV4dGVuc2lvbk5hbWU6IHZhbHVlLm5hbWUsIGlzRXh0ZW5zaW9uUGFjazogISF2YWx1ZS5pc0V4dGVuc2lvblBhY2sgfSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRtZWRpdW1JbXBvcnRhbmNlUmVjb21tZW5kYXRpb25zLnB1c2goeyBleHRlbnNpb25JZCwgZXh0ZW5zaW9uTmFtZTogdmFsdWUubmFtZSwgaXNFeHRlbnNpb25QYWNrOiAhIXZhbHVlLmlzRXh0ZW5zaW9uUGFjayB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0b3RoZXJSZWNvbW1lbmRhdGlvbnMucHVzaCh7IGV4dGVuc2lvbklkLCBleHRlbnNpb25OYW1lOiB2YWx1ZS5uYW1lLCBpc0V4dGVuc2lvblBhY2s6ICEhdmFsdWUuaXNFeHRlbnNpb25QYWNrIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmIChoaWdoSW1wb3J0YW5jZVJlY29tbWVuZGF0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLmhpZ2hJbXBvcnRhbmNlRXhlY3V0YWJsZVRpcHMuc2V0KGtleSwgeyBleGVGcmllbmRseU5hbWU6IGV4ZUJhc2VkRXh0ZW5zaW9uVGlwLmZyaWVuZGx5TmFtZSwgd2luZG93c1BhdGg6IGV4ZUJhc2VkRXh0ZW5zaW9uVGlwLndpbmRvd3NQYXRoLCByZWNvbW1lbmRhdGlvbnM6IGhpZ2hJbXBvcnRhbmNlUmVjb21tZW5kYXRpb25zIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChtZWRpdW1JbXBvcnRhbmNlUmVjb21tZW5kYXRpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMubWVkaXVtSW1wb3J0YW5jZUV4ZWN1dGFibGVUaXBzLnNldChrZXksIHsgZXhlRnJpZW5kbHlOYW1lOiBleGVCYXNlZEV4dGVuc2lvblRpcC5mcmllbmRseU5hbWUsIHdpbmRvd3NQYXRoOiBleGVCYXNlZEV4dGVuc2lvblRpcC53aW5kb3dzUGF0aCwgcmVjb21tZW5kYXRpb25zOiBtZWRpdW1JbXBvcnRhbmNlUmVjb21tZW5kYXRpb25zIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChvdGhlclJlY29tbWVuZGF0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLmFsbE90aGVyRXhlY3V0YWJsZVRpcHMuc2V0KGtleSwgeyBleGVGcmllbmRseU5hbWU6IGV4ZUJhc2VkRXh0ZW5zaW9uVGlwLmZyaWVuZGx5TmFtZSwgd2luZG93c1BhdGg6IGV4ZUJhc2VkRXh0ZW5zaW9uVGlwLndpbmRvd3NQYXRoLCByZWNvbW1lbmRhdGlvbnM6IG90aGVyUmVjb21tZW5kYXRpb25zIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvKlxuXHRcdFx0M3MgaGFzIGNvbWUgb3V0IHRvIGJlIHRoZSBnb29kIG51bWJlciB0byBmZXRjaCBhbmQgcHJvbXB0IGltcG9ydGFudCBleGUgYmFzZWQgcmVjb21tZW5kYXRpb25zXG5cdFx0XHRBbHNvIGZldGNoIGltcG9ydGFudCBleGUgYmFzZWQgcmVjb21tZW5kYXRpb25zIGZvciByZXBvcnRpbmcgdGVsZW1ldHJ5XG5cdFx0Ki9cblx0XHRkaXNwb3NhYmxlVGltZW91dChhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLmNvbGxlY3RUaXBzKCk7XG5cdFx0XHR0aGlzLnByb21wdEhpZ2hJbXBvcnRhbmNlRXhlQmFzZWRUaXAoKTtcblx0XHRcdHRoaXMucHJvbXB0TWVkaXVtSW1wb3J0YW5jZUV4ZUJhc2VkVGlwKCk7XG5cdFx0fSwgMzAwMCwgdGhpcy5fc3RvcmUpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgZ2V0SW1wb3J0YW50RXhlY3V0YWJsZUJhc2VkVGlwcygpOiBQcm9taXNlPElFeGVjdXRhYmxlQmFzZWRFeHRlbnNpb25UaXBbXT4ge1xuXHRcdGNvbnN0IGhpZ2hJbXBvcnRhbmNlRXhlVGlwcyA9IGF3YWl0IHRoaXMuZ2V0VmFsaWRFeGVjdXRhYmxlQmFzZWRFeHRlbnNpb25UaXBzKHRoaXMuaGlnaEltcG9ydGFuY2VFeGVjdXRhYmxlVGlwcyk7XG5cdFx0Y29uc3QgbWVkaXVtSW1wb3J0YW5jZUV4ZVRpcHMgPSBhd2FpdCB0aGlzLmdldFZhbGlkRXhlY3V0YWJsZUJhc2VkRXh0ZW5zaW9uVGlwcyh0aGlzLm1lZGl1bUltcG9ydGFuY2VFeGVjdXRhYmxlVGlwcyk7XG5cdFx0cmV0dXJuIFsuLi5oaWdoSW1wb3J0YW5jZUV4ZVRpcHMsIC4uLm1lZGl1bUltcG9ydGFuY2VFeGVUaXBzXTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldE90aGVyRXhlY3V0YWJsZUJhc2VkVGlwcygpOiBQcm9taXNlPElFeGVjdXRhYmxlQmFzZWRFeHRlbnNpb25UaXBbXT4ge1xuXHRcdHJldHVybiB0aGlzLmdldFZhbGlkRXhlY3V0YWJsZUJhc2VkRXh0ZW5zaW9uVGlwcyh0aGlzLmFsbE90aGVyRXhlY3V0YWJsZVRpcHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb2xsZWN0VGlwcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBoaWdoSW1wb3J0YW5jZUV4ZVRpcHMgPSBhd2FpdCB0aGlzLmdldFZhbGlkRXhlY3V0YWJsZUJhc2VkRXh0ZW5zaW9uVGlwcyh0aGlzLmhpZ2hJbXBvcnRhbmNlRXhlY3V0YWJsZVRpcHMpO1xuXHRcdGNvbnN0IG1lZGl1bUltcG9ydGFuY2VFeGVUaXBzID0gYXdhaXQgdGhpcy5nZXRWYWxpZEV4ZWN1dGFibGVCYXNlZEV4dGVuc2lvblRpcHModGhpcy5tZWRpdW1JbXBvcnRhbmNlRXhlY3V0YWJsZVRpcHMpO1xuXHRcdGNvbnN0IGxvY2FsID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQoKTtcblxuXHRcdHRoaXMuaGlnaEltcG9ydGFuY2VUaXBzQnlFeGUgPSB0aGlzLmdyb3VwSW1wb3J0YW50VGlwc0J5RXhlKGhpZ2hJbXBvcnRhbmNlRXhlVGlwcywgbG9jYWwpO1xuXHRcdHRoaXMubWVkaXVtSW1wb3J0YW5jZVRpcHNCeUV4ZSA9IHRoaXMuZ3JvdXBJbXBvcnRhbnRUaXBzQnlFeGUobWVkaXVtSW1wb3J0YW5jZUV4ZVRpcHMsIGxvY2FsKTtcblx0fVxuXG5cdHByaXZhdGUgZ3JvdXBJbXBvcnRhbnRUaXBzQnlFeGUoaW1wb3J0YW50RXhlQmFzZWRUaXBzOiBJRXhlY3V0YWJsZUJhc2VkRXh0ZW5zaW9uVGlwW10sIGxvY2FsOiBJTG9jYWxFeHRlbnNpb25bXSk6IE1hcDxzdHJpbmcsIElFeGVjdXRhYmxlQmFzZWRFeHRlbnNpb25UaXBbXT4ge1xuXHRcdGNvbnN0IGltcG9ydGFudEV4ZUJhc2VkUmVjb21tZW5kYXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIElFeGVjdXRhYmxlQmFzZWRFeHRlbnNpb25UaXA+KCk7XG5cdFx0aW1wb3J0YW50RXhlQmFzZWRUaXBzLmZvckVhY2godGlwID0+IGltcG9ydGFudEV4ZUJhc2VkUmVjb21tZW5kYXRpb25zLnNldCh0aXAuZXh0ZW5zaW9uSWQudG9Mb3dlckNhc2UoKSwgdGlwKSk7XG5cblx0XHRjb25zdCB7IGluc3RhbGxlZCwgdW5pbnN0YWxsZWQ6IHJlY29tbWVuZGF0aW9ucyB9ID0gdGhpcy5ncm91cEJ5SW5zdGFsbGVkKFsuLi5pbXBvcnRhbnRFeGVCYXNlZFJlY29tbWVuZGF0aW9ucy5rZXlzKCldLCBsb2NhbCk7XG5cblx0XHQvKiBMb2cgaW5zdGFsbGVkIGFuZCB1bmluc3RhbGxlZCBleGUgYmFzZWQgcmVjb21tZW5kYXRpb25zICovXG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb25JZCBvZiBpbnN0YWxsZWQpIHtcblx0XHRcdGNvbnN0IHRpcCA9IGltcG9ydGFudEV4ZUJhc2VkUmVjb21tZW5kYXRpb25zLmdldChleHRlbnNpb25JZCk7XG5cdFx0XHRpZiAodGlwKSB7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHsgZXhlTmFtZTogc3RyaW5nOyBleHRlbnNpb25JZDogc3RyaW5nIH0sIEV4ZUV4dGVuc2lvblJlY29tbWVuZGF0aW9uc0NsYXNzaWZpY2F0aW9uPignZXhlRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zOmFscmVhZHlJbnN0YWxsZWQnLCB7IGV4dGVuc2lvbklkLCBleGVOYW1lOiB0aXAuZXhlTmFtZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb25JZCBvZiByZWNvbW1lbmRhdGlvbnMpIHtcblx0XHRcdGNvbnN0IHRpcCA9IGltcG9ydGFudEV4ZUJhc2VkUmVjb21tZW5kYXRpb25zLmdldChleHRlbnNpb25JZCk7XG5cdFx0XHRpZiAodGlwKSB7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHsgZXhlTmFtZTogc3RyaW5nOyBleHRlbnNpb25JZDogc3RyaW5nIH0sIEV4ZUV4dGVuc2lvblJlY29tbWVuZGF0aW9uc0NsYXNzaWZpY2F0aW9uPignZXhlRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zOm5vdEluc3RhbGxlZCcsIHsgZXh0ZW5zaW9uSWQsIGV4ZU5hbWU6IHRpcC5leGVOYW1lIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHByb21wdGVkRXhlY3V0YWJsZVRpcHMgPSB0aGlzLmdldFByb21wdGVkRXhlY3V0YWJsZVRpcHMoKTtcblx0XHRjb25zdCB0aXBzQnlFeGUgPSBuZXcgTWFwPHN0cmluZywgSUV4ZWN1dGFibGVCYXNlZEV4dGVuc2lvblRpcFtdPigpO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uSWQgb2YgcmVjb21tZW5kYXRpb25zKSB7XG5cdFx0XHRjb25zdCB0aXAgPSBpbXBvcnRhbnRFeGVCYXNlZFJlY29tbWVuZGF0aW9ucy5nZXQoZXh0ZW5zaW9uSWQpO1xuXHRcdFx0aWYgKHRpcCAmJiAoIXByb21wdGVkRXhlY3V0YWJsZVRpcHNbdGlwLmV4ZU5hbWVdIHx8ICFwcm9tcHRlZEV4ZWN1dGFibGVUaXBzW3RpcC5leGVOYW1lXS5pbmNsdWRlcyh0aXAuZXh0ZW5zaW9uSWQpKSkge1xuXHRcdFx0XHRsZXQgdGlwcyA9IHRpcHNCeUV4ZS5nZXQodGlwLmV4ZU5hbWUpO1xuXHRcdFx0XHRpZiAoIXRpcHMpIHtcblx0XHRcdFx0XHR0aXBzID0gW107XG5cdFx0XHRcdFx0dGlwc0J5RXhlLnNldCh0aXAuZXhlTmFtZSwgdGlwcyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGlwcy5wdXNoKHRpcCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRpcHNCeUV4ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIaWdoIGltcG9ydGFuY2UgdGlwcyBhcmUgcHJvbXB0ZWQgb25jZSBwZXIgcmVzdGFydCBzZXNzaW9uXG5cdCAqL1xuXHRwcml2YXRlIHByb21wdEhpZ2hJbXBvcnRhbmNlRXhlQmFzZWRUaXAoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaGlnaEltcG9ydGFuY2VUaXBzQnlFeGUuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IFtleGVOYW1lLCB0aXBzXSA9IFsuLi50aGlzLmhpZ2hJbXBvcnRhbmNlVGlwc0J5RXhlLmVudHJpZXMoKV1bMF07XG5cdFx0dGhpcy5wcm9tcHRFeGVSZWNvbW1lbmRhdGlvbnModGlwcylcblx0XHRcdC50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdHN3aXRjaCAocmVzdWx0KSB7XG5cdFx0XHRcdFx0Y2FzZSBSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25SZXN1bHQuQWNjZXB0ZWQ6XG5cdFx0XHRcdFx0XHR0aGlzLmFkZFRvUmVjb21tZW5kZWRFeGVjdXRhYmxlcyh0aXBzWzBdLmV4ZU5hbWUsIHRpcHMpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25SZXN1bHQuSWdub3JlZDpcblx0XHRcdFx0XHRcdHRoaXMuaGlnaEltcG9ydGFuY2VUaXBzQnlFeGUuZGVsZXRlKGV4ZU5hbWUpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25SZXN1bHQuSW5jb21wYXRpYmxlV2luZG93OiB7XG5cdFx0XHRcdFx0XHQvLyBSZWNvbW1lbmRlZCBpbiBpbmNvbXBhdGlibGUgd2luZG93LiBTY2hlZHVsZSB0aGUgcHJvbXB0IGFmdGVyIGFjdGl2ZSB3aW5kb3cgY2hhbmdlXG5cdFx0XHRcdFx0XHRjb25zdCBvbkFjdGl2ZVdpbmRvd0NoYW5nZSA9IEV2ZW50Lm9uY2UoRXZlbnQubGF0Y2goRXZlbnQuYW55KHRoaXMud2luZG93RXZlbnRzLm9uRGlkT3Blbk1haW5XaW5kb3csIHRoaXMud2luZG93RXZlbnRzLm9uRGlkRm9jdXNNYWluV2luZG93KSkpO1xuXHRcdFx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIob25BY3RpdmVXaW5kb3dDaGFuZ2UoKCkgPT4gdGhpcy5wcm9tcHRIaWdoSW1wb3J0YW5jZUV4ZUJhc2VkVGlwKCkpKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlIFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvblJlc3VsdC5Ub29NYW55OiB7XG5cdFx0XHRcdFx0XHQvLyBUb28gbWFueSBub3RpZmljYXRpb25zLiBTY2hlZHVsZSB0aGUgcHJvbXB0IGFmdGVyIG9uZSBob3VyXG5cdFx0XHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZS52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHsgZGlzcG9zYWJsZS5kaXNwb3NlKCk7IHRoaXMucHJvbXB0SGlnaEltcG9ydGFuY2VFeGVCYXNlZFRpcCgpOyB9LCA2MCAqIDYwICogMTAwMCAvKiAxIGhvdXIgKi8pO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNZWRpdW0gaW1wb3J0YW5jZSB0aXBzIGFyZSBwcm9tcHRlZCBvbmNlIHBlciA3IGRheXNcblx0ICovXG5cdHByaXZhdGUgcHJvbXB0TWVkaXVtSW1wb3J0YW5jZUV4ZUJhc2VkVGlwKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLm1lZGl1bUltcG9ydGFuY2VUaXBzQnlFeGUuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhc3RQcm9tcHRlZE1lZGl1bUV4ZVRpbWUgPSB0aGlzLmdldExhc3RQcm9tcHRlZE1lZGl1bUV4ZVRpbWUoKTtcblx0XHRjb25zdCB0aW1lU2luY2VMYXN0UHJvbXB0ID0gRGF0ZS5ub3coKSAtIGxhc3RQcm9tcHRlZE1lZGl1bUV4ZVRpbWU7XG5cdFx0Y29uc3QgcHJvbXB0SW50ZXJ2YWwgPSA3ICogMjQgKiA2MCAqIDYwICogMTAwMDsgLy8gNyBEYXlzXG5cdFx0aWYgKHRpbWVTaW5jZUxhc3RQcm9tcHQgPCBwcm9tcHRJbnRlcnZhbCkge1xuXHRcdFx0Ly8gV2FpdCB1bnRpbCBpbnRlcnZhbCBhbmQgcHJvbXB0XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRcdFx0ZGlzcG9zYWJsZS52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHsgZGlzcG9zYWJsZS5kaXNwb3NlKCk7IHRoaXMucHJvbXB0TWVkaXVtSW1wb3J0YW5jZUV4ZUJhc2VkVGlwKCk7IH0sIHByb21wdEludGVydmFsIC0gdGltZVNpbmNlTGFzdFByb21wdCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgW2V4ZU5hbWUsIHRpcHNdID0gWy4uLnRoaXMubWVkaXVtSW1wb3J0YW5jZVRpcHNCeUV4ZS5lbnRyaWVzKCldWzBdO1xuXHRcdHRoaXMucHJvbXB0RXhlUmVjb21tZW5kYXRpb25zKHRpcHMpXG5cdFx0XHQudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0XHRzd2l0Y2ggKHJlc3VsdCkge1xuXHRcdFx0XHRcdGNhc2UgUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uUmVzdWx0LkFjY2VwdGVkOiB7XG5cdFx0XHRcdFx0XHQvLyBBY2NlcHRlZDogVXBkYXRlIHRoZSBsYXN0IHByb21wdGVkIHRpbWUgYW5kIGNhY2hlcy5cblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlTGFzdFByb21wdGVkTWVkaXVtRXhlVGltZShEYXRlLm5vdygpKTtcblx0XHRcdFx0XHRcdHRoaXMubWVkaXVtSW1wb3J0YW5jZVRpcHNCeUV4ZS5kZWxldGUoZXhlTmFtZSk7XG5cdFx0XHRcdFx0XHR0aGlzLmFkZFRvUmVjb21tZW5kZWRFeGVjdXRhYmxlcyh0aXBzWzBdLmV4ZU5hbWUsIHRpcHMpO1xuXG5cdFx0XHRcdFx0XHQvLyBTY2hlZHVsZSB0aGUgbmV4dCByZWNvbW1lbmRhdGlvbiBmb3IgbmV4dCBpbnRlcm52YWxcblx0XHRcdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUxID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZTEudmFsdWUgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7IGRpc3Bvc2FibGUxLmRpc3Bvc2UoKTsgdGhpcy5wcm9tcHRNZWRpdW1JbXBvcnRhbmNlRXhlQmFzZWRUaXAoKTsgfSwgcHJvbXB0SW50ZXJ2YWwpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uUmVzdWx0Lklnbm9yZWQ6XG5cdFx0XHRcdFx0XHQvLyBJZ25vcmVkOiBSZW1vdmUgZnJvbSB0aGUgY2FjaGUgYW5kIHByb21wdCBuZXh0IHJlY29tbWVuZGF0aW9uXG5cdFx0XHRcdFx0XHR0aGlzLm1lZGl1bUltcG9ydGFuY2VUaXBzQnlFeGUuZGVsZXRlKGV4ZU5hbWUpO1xuXHRcdFx0XHRcdFx0dGhpcy5wcm9tcHRNZWRpdW1JbXBvcnRhbmNlRXhlQmFzZWRUaXAoKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdFx0Y2FzZSBSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25SZXN1bHQuSW5jb21wYXRpYmxlV2luZG93OiB7XG5cdFx0XHRcdFx0XHQvLyBSZWNvbW1lbmRlZCBpbiBpbmNvbXBhdGlibGUgd2luZG93LiBTY2hlZHVsZSB0aGUgcHJvbXB0IGFmdGVyIGFjdGl2ZSB3aW5kb3cgY2hhbmdlXG5cdFx0XHRcdFx0XHRjb25zdCBvbkFjdGl2ZVdpbmRvd0NoYW5nZSA9IEV2ZW50Lm9uY2UoRXZlbnQubGF0Y2goRXZlbnQuYW55KHRoaXMud2luZG93RXZlbnRzLm9uRGlkT3Blbk1haW5XaW5kb3csIHRoaXMud2luZG93RXZlbnRzLm9uRGlkRm9jdXNNYWluV2luZG93KSkpO1xuXHRcdFx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIob25BY3RpdmVXaW5kb3dDaGFuZ2UoKCkgPT4gdGhpcy5wcm9tcHRNZWRpdW1JbXBvcnRhbmNlRXhlQmFzZWRUaXAoKSkpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uUmVzdWx0LlRvb01hbnk6IHtcblx0XHRcdFx0XHRcdC8vIFRvbyBtYW55IG5vdGlmaWNhdGlvbnMuIFNjaGVkdWxlIHRoZSBwcm9tcHQgYWZ0ZXIgb25lIGhvdXJcblx0XHRcdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZTIudmFsdWUgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7IGRpc3Bvc2FibGUyLmRpc3Bvc2UoKTsgdGhpcy5wcm9tcHRNZWRpdW1JbXBvcnRhbmNlRXhlQmFzZWRUaXAoKTsgfSwgNjAgKiA2MCAqIDEwMDAgLyogMSBob3VyICovKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHByb21wdEV4ZVJlY29tbWVuZGF0aW9ucyh0aXBzOiBJRXhlY3V0YWJsZUJhc2VkRXh0ZW5zaW9uVGlwW10pOiBQcm9taXNlPFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvblJlc3VsdD4ge1xuXHRcdGNvbnN0IGluc3RhbGxlZCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKEV4dGVuc2lvblR5cGUuVXNlcik7XG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IHRpcHNcblx0XHRcdC5maWx0ZXIodGlwID0+ICF0aXAud2hlbk5vdEluc3RhbGxlZCB8fCB0aXAud2hlbk5vdEluc3RhbGxlZC5ldmVyeShpZCA9PiBpbnN0YWxsZWQuZXZlcnkobG9jYWwgPT4gIWFyZVNhbWVFeHRlbnNpb25zKGxvY2FsLmlkZW50aWZpZXIsIHsgaWQgfSkpKSlcblx0XHRcdC5tYXAoKHsgZXh0ZW5zaW9uSWQgfSkgPT4gZXh0ZW5zaW9uSWQudG9Mb3dlckNhc2UoKSk7XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlLnByb21wdEltcG9ydGFudEV4dGVuc2lvbnNJbnN0YWxsTm90aWZpY2F0aW9uKHsgZXh0ZW5zaW9ucywgc291cmNlOiBSZWNvbW1lbmRhdGlvblNvdXJjZS5FWEUsIG5hbWU6IHRpcHNbMF0uZXhlRnJpZW5kbHlOYW1lLCBzZWFyY2hWYWx1ZTogYEBleGU6XCIke3RpcHNbMF0uZXhlTmFtZX1cImAgfSk7XG5cdH1cblxuXHRwcml2YXRlIGdldExhc3RQcm9tcHRlZE1lZGl1bUV4ZVRpbWUoKTogbnVtYmVyIHtcblx0XHRsZXQgdmFsdWUgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldE51bWJlcihsYXN0UHJvbXB0ZWRNZWRpdW1JbXBFeGVUaW1lU3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHR2YWx1ZSA9IERhdGUubm93KCk7XG5cdFx0XHR0aGlzLnVwZGF0ZUxhc3RQcm9tcHRlZE1lZGl1bUV4ZVRpbWUodmFsdWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUxhc3RQcm9tcHRlZE1lZGl1bUV4ZVRpbWUodmFsdWU6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUobGFzdFByb21wdGVkTWVkaXVtSW1wRXhlVGltZVN0b3JhZ2VLZXksIHZhbHVlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFByb21wdGVkRXhlY3V0YWJsZVRpcHMoKTogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nW10+IHtcblx0XHRyZXR1cm4gSlNPTi5wYXJzZSh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChwcm9tcHRlZEV4ZWN1dGFibGVUaXBzU3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCAne30nKSk7XG5cdH1cblxuXHRwcml2YXRlIGFkZFRvUmVjb21tZW5kZWRFeGVjdXRhYmxlcyhleGVOYW1lOiBzdHJpbmcsIHRpcHM6IElFeGVjdXRhYmxlQmFzZWRFeHRlbnNpb25UaXBbXSkge1xuXHRcdGNvbnN0IHByb21wdGVkRXhlY3V0YWJsZVRpcHMgPSB0aGlzLmdldFByb21wdGVkRXhlY3V0YWJsZVRpcHMoKTtcblx0XHRwcm9tcHRlZEV4ZWN1dGFibGVUaXBzW2V4ZU5hbWVdID0gdGlwcy5tYXAoKHsgZXh0ZW5zaW9uSWQgfSkgPT4gZXh0ZW5zaW9uSWQudG9Mb3dlckNhc2UoKSk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShwcm9tcHRlZEV4ZWN1dGFibGVUaXBzU3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkocHJvbXB0ZWRFeGVjdXRhYmxlVGlwcyksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG5cdHByaXZhdGUgZ3JvdXBCeUluc3RhbGxlZChyZWNvbW1lbmRhdGlvbnNUb1N1Z2dlc3Q6IHN0cmluZ1tdLCBsb2NhbDogSUxvY2FsRXh0ZW5zaW9uW10pOiB7IGluc3RhbGxlZDogc3RyaW5nW107IHVuaW5zdGFsbGVkOiBzdHJpbmdbXSB9IHtcblx0XHRjb25zdCBpbnN0YWxsZWQ6IHN0cmluZ1tdID0gW10sIHVuaW5zdGFsbGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGluc3RhbGxlZEV4dGVuc2lvbnNJZHMgPSBsb2NhbC5yZWR1Y2UoKHJlc3VsdCwgaSkgPT4geyByZXN1bHQuYWRkKGkuaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKTsgcmV0dXJuIHJlc3VsdDsgfSwgbmV3IFNldDxzdHJpbmc+KCkpO1xuXHRcdHJlY29tbWVuZGF0aW9uc1RvU3VnZ2VzdC5mb3JFYWNoKGlkID0+IHtcblx0XHRcdGlmIChpbnN0YWxsZWRFeHRlbnNpb25zSWRzLmhhcyhpZC50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0XHRpbnN0YWxsZWQucHVzaChpZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR1bmluc3RhbGxlZC5wdXNoKGlkKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4geyBpbnN0YWxsZWQsIHVuaW5zdGFsbGVkIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFZhbGlkRXhlY3V0YWJsZUJhc2VkRXh0ZW5zaW9uVGlwcyhleGVjdXRhYmxlVGlwczogTWFwPHN0cmluZywgSUV4ZUJhc2VkRXh0ZW5zaW9uVGlwcz4pOiBQcm9taXNlPElFeGVjdXRhYmxlQmFzZWRFeHRlbnNpb25UaXBbXT4ge1xuXHRcdGNvbnN0IHJlc3VsdDogSUV4ZWN1dGFibGVCYXNlZEV4dGVuc2lvblRpcFtdID0gW107XG5cblx0XHRjb25zdCBjaGVja2VkRXhlY3V0YWJsZXM6IE1hcDxzdHJpbmcsIGJvb2xlYW4+ID0gbmV3IE1hcDxzdHJpbmcsIGJvb2xlYW4+KCk7XG5cdFx0Zm9yIChjb25zdCBleGVOYW1lIG9mIGV4ZWN1dGFibGVUaXBzLmtleXMoKSkge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uVGlwID0gZXhlY3V0YWJsZVRpcHMuZ2V0KGV4ZU5hbWUpO1xuXHRcdFx0aWYgKCFleHRlbnNpb25UaXAgfHwgIWlzTm9uRW1wdHlBcnJheShleHRlbnNpb25UaXAucmVjb21tZW5kYXRpb25zKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZXhlUGF0aHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRcdGlmIChleHRlbnNpb25UaXAud2luZG93c1BhdGgpIHtcblx0XHRcdFx0XHRleGVQYXRocy5wdXNoKGV4dGVuc2lvblRpcC53aW5kb3dzUGF0aC5yZXBsYWNlKCclVVNFUlBST0ZJTEUlJywgKCkgPT4gZW52WydVU0VSUFJPRklMRSddISlcblx0XHRcdFx0XHRcdC5yZXBsYWNlKCclUHJvZ3JhbUZpbGVzKHg4NiklJywgKCkgPT4gZW52WydQcm9ncmFtRmlsZXMoeDg2KSddISlcblx0XHRcdFx0XHRcdC5yZXBsYWNlKCclUHJvZ3JhbUZpbGVzJScsICgpID0+IGVudlsnUHJvZ3JhbUZpbGVzJ10hKVxuXHRcdFx0XHRcdFx0LnJlcGxhY2UoJyVBUFBEQVRBJScsICgpID0+IGVudlsnQVBQREFUQSddISlcblx0XHRcdFx0XHRcdC5yZXBsYWNlKCclV0lORElSJScsICgpID0+IGVudlsnV0lORElSJ10hKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGV4ZVBhdGhzLnB1c2goam9pbignL3Vzci9sb2NhbC9iaW4nLCBleGVOYW1lKSk7XG5cdFx0XHRcdGV4ZVBhdGhzLnB1c2goam9pbignL3Vzci9iaW4nLCBleGVOYW1lKSk7XG5cdFx0XHRcdGV4ZVBhdGhzLnB1c2goam9pbih0aGlzLnVzZXJIb21lLmZzUGF0aCwgZXhlTmFtZSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGV4ZVBhdGggb2YgZXhlUGF0aHMpIHtcblx0XHRcdFx0bGV0IGV4aXN0cyA9IGNoZWNrZWRFeGVjdXRhYmxlcy5nZXQoZXhlUGF0aCk7XG5cdFx0XHRcdGlmIChleGlzdHMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGV4aXN0cyA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKFVSSS5maWxlKGV4ZVBhdGgpKTtcblx0XHRcdFx0XHRjaGVja2VkRXhlY3V0YWJsZXMuc2V0KGV4ZVBhdGgsIGV4aXN0cyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGV4aXN0cykge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgeyBleHRlbnNpb25JZCwgZXh0ZW5zaW9uTmFtZSwgaXNFeHRlbnNpb25QYWNrLCB3aGVuTm90SW5zdGFsbGVkIH0gb2YgZXh0ZW5zaW9uVGlwLnJlY29tbWVuZGF0aW9ucykge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdFx0XHRleHRlbnNpb25JZCxcblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uTmFtZSxcblx0XHRcdFx0XHRcdFx0aXNFeHRlbnNpb25QYWNrLFxuXHRcdFx0XHRcdFx0XHRleGVOYW1lLFxuXHRcdFx0XHRcdFx0XHRleGVGcmllbmRseU5hbWU6IGV4dGVuc2lvblRpcC5leGVGcmllbmRseU5hbWUsXG5cdFx0XHRcdFx0XHRcdHdpbmRvd3NQYXRoOiBleHRlbnNpb25UaXAud2luZG93c1BhdGgsXG5cdFx0XHRcdFx0XHRcdHdoZW5Ob3RJbnN0YWxsZWQ6IHdoZW5Ob3RJbnN0YWxsZWRcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsWUFBWSx5QkFBeUI7QUFFOUMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBRXBCLFNBQVMsb0JBQW9CO0FBQzdC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
