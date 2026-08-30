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
import { localize } from "../../../../nls.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import * as platform from "../../../../base/common/platform.js";
import { IExtensionManagementService, IExtensionGalleryService, InstallOperation } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { INotificationService, NeverShowAgainScope, NotificationPriority } from "../../../../platform/notification/common/notification.js";
import Severity from "../../../../base/common/severity.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { minimumTranslatedStrings } from "./minimalTranslations.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { ILocaleService } from "../../../services/localization/common/locale.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { BaseLocalizationWorkbenchContribution } from "../common/localization.contribution.js";
let NativeLocalizationWorkbenchContribution = class extends BaseLocalizationWorkbenchContribution {
  constructor(notificationService, localeService, productService, storageService, extensionManagementService, galleryService, extensionsWorkbenchService, telemetryService) {
    super();
    this.notificationService = notificationService;
    this.localeService = localeService;
    this.productService = productService;
    this.storageService = storageService;
    this.extensionManagementService = extensionManagementService;
    this.galleryService = galleryService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.telemetryService = telemetryService;
    this.checkAndInstall();
    this._register(this.extensionManagementService.onDidInstallExtensions((e) => this.onDidInstallExtensions(e)));
    this._register(this.extensionManagementService.onDidUninstallExtension((e) => this.onDidUninstallExtension(e)));
  }
  async onDidInstallExtensions(results) {
    for (const result of results) {
      if (result.operation === InstallOperation.Install && result.local) {
        await this.onDidInstallExtension(result.local, !!result.context?.extensionsSync);
      }
    }
  }
  async onDidInstallExtension(localExtension, fromSettingsSync) {
    const localization = localExtension.manifest.contributes?.localizations?.[0];
    if (!localization || platform.language === localization.languageId) {
      return;
    }
    const { languageId, languageName } = localization;
    this.notificationService.prompt(
      Severity.Info,
      localize("updateLocale", "Would you like to change {0}'s display language to {1} and restart?", this.productService.nameLong, languageName || languageId),
      [{
        label: localize("changeAndRestart", "Change Language and Restart"),
        run: async () => {
          await this.localeService.setLocale({
            id: languageId,
            label: languageName ?? languageId,
            extensionId: localExtension.identifier.id
            // If settings sync installs the language pack, then we would have just shown the notification so no
            // need to show the dialog.
          }, true);
        }
      }],
      {
        sticky: true,
        priority: NotificationPriority.URGENT,
        neverShowAgain: { id: "langugage.update.donotask", isSecondary: true, scope: NeverShowAgainScope.APPLICATION }
      }
    );
  }
  async onDidUninstallExtension(_event) {
    if (!await this.isLocaleInstalled(platform.language)) {
      this.localeService.setLocale({
        id: "en",
        label: "English"
      });
    }
  }
  async checkAndInstall() {
    const language = platform.language;
    let locale = platform.locale ?? "";
    const languagePackSuggestionIgnoreList = JSON.parse(
      this.storageService.get(
        NativeLocalizationWorkbenchContribution.LANGUAGEPACK_SUGGESTION_IGNORE_STORAGE_KEY,
        StorageScope.APPLICATION,
        "[]"
      )
    );
    if (!this.galleryService.isEnabled()) {
      return;
    }
    if (!language || !locale || platform.Language.isDefaultVariant()) {
      return;
    }
    if (locale.startsWith(language) || languagePackSuggestionIgnoreList.includes(locale)) {
      return;
    }
    const installed = await this.isLocaleInstalled(locale);
    if (installed) {
      return;
    }
    const fullLocale = locale;
    let tagResult = await this.galleryService.query({ text: `tag:lp-${locale}` }, CancellationToken.None);
    if (tagResult.total === 0) {
      locale = locale.split("-")[0];
      tagResult = await this.galleryService.query({ text: `tag:lp-${locale}` }, CancellationToken.None);
      if (tagResult.total === 0) {
        return;
      }
    }
    const extensionToInstall = tagResult.total === 1 ? tagResult.firstPage[0] : tagResult.firstPage.find((e) => e.publisher === "MS-CEINTL" && e.name.startsWith("vscode-language-pack"));
    const extensionToFetchTranslationsFrom = extensionToInstall ?? tagResult.firstPage[0];
    if (!extensionToFetchTranslationsFrom.assets.manifest) {
      return;
    }
    const [manifest, translation] = await Promise.all([
      this.galleryService.getManifest(extensionToFetchTranslationsFrom, CancellationToken.None),
      this.galleryService.getCoreTranslation(extensionToFetchTranslationsFrom, locale)
    ]);
    const loc = manifest?.contributes?.localizations?.find((x) => locale.startsWith(x.languageId.toLowerCase()));
    const languageName = loc ? loc.languageName || locale : locale;
    const languageDisplayName = loc ? loc.localizedLanguageName || loc.languageName || locale : locale;
    const translationsFromPack = translation?.contents?.["vs/workbench/contrib/localization/electron-browser/minimalTranslations"] ?? {};
    const promptMessageKey = extensionToInstall ? "installAndRestartMessage" : "showLanguagePackExtensions";
    const useEnglish = !translationsFromPack[promptMessageKey];
    const translations = {};
    Object.keys(minimumTranslatedStrings).forEach((key) => {
      if (!translationsFromPack[key] || useEnglish) {
        translations[key] = minimumTranslatedStrings[key].replace("{0}", () => languageName);
      } else {
        translations[key] = `${translationsFromPack[key].replace("{0}", () => languageDisplayName)} (${minimumTranslatedStrings[key].replace("{0}", () => languageName)})`;
      }
    });
    const logUserReaction = (userReaction) => {
      this.telemetryService.publicLog("languagePackSuggestion:popup", { userReaction, language: locale });
    };
    const searchAction = {
      label: translations["searchMarketplace"],
      run: async () => {
        logUserReaction("search");
        await this.extensionsWorkbenchService.openSearch(`tag:lp-${locale}`);
      }
    };
    const installAndRestartAction = {
      label: translations["installAndRestart"],
      run: async () => {
        logUserReaction("installAndRestart");
        await this.localeService.setLocale({
          id: locale,
          label: languageName,
          extensionId: extensionToInstall?.identifier.id,
          galleryExtension: extensionToInstall
          // The user will be prompted if they want to install the language pack before this.
        }, true);
      }
    };
    const promptMessage = translations[promptMessageKey];
    this.notificationService.prompt(
      Severity.Info,
      promptMessage,
      [
        extensionToInstall ? installAndRestartAction : searchAction,
        {
          label: localize("neverAgain", "Don't Show Again"),
          isSecondary: true,
          run: () => {
            languagePackSuggestionIgnoreList.push(fullLocale);
            this.storageService.store(
              NativeLocalizationWorkbenchContribution.LANGUAGEPACK_SUGGESTION_IGNORE_STORAGE_KEY,
              JSON.stringify(languagePackSuggestionIgnoreList),
              StorageScope.APPLICATION,
              StorageTarget.USER
            );
            logUserReaction("neverShowAgain");
          }
        }
      ],
      {
        priority: NotificationPriority.OPTIONAL,
        onCancel: () => {
          logUserReaction("cancelled");
        }
      }
    );
  }
  async isLocaleInstalled(locale) {
    const installed = await this.extensionManagementService.getInstalled();
    return installed.some((i) => !!i.manifest.contributes?.localizations?.length && i.manifest.contributes.localizations.some((l) => locale.startsWith(l.languageId.toLowerCase())));
  }
};
NativeLocalizationWorkbenchContribution.LANGUAGEPACK_SUGGESTION_IGNORE_STORAGE_KEY = "extensionsAssistant/languagePackSuggestionIgnore";
NativeLocalizationWorkbenchContribution = __decorateClass([
  __decorateParam(0, INotificationService),
  __decorateParam(1, ILocaleService),
  __decorateParam(2, IProductService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IExtensionManagementService),
  __decorateParam(5, IExtensionGalleryService),
  __decorateParam(6, IExtensionsWorkbenchService),
  __decorateParam(7, ITelemetryService)
], NativeLocalizationWorkbenchContribution);
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(NativeLocalizationWorkbenchContribution, LifecyclePhase.Eventually);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGxvY2FsaXphdGlvblxcZWxlY3Ryb24tYnJvd3NlclxcbG9jYWxpemF0aW9uLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucywgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsIEluc3RhbGxPcGVyYXRpb24sIElMb2NhbEV4dGVuc2lvbiwgSW5zdGFsbEV4dGVuc2lvblJlc3VsdCwgRGlkVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBOZXZlclNob3dBZ2FpblNjb3BlLCBOb3RpZmljYXRpb25Qcmlvcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBtaW5pbXVtVHJhbnNsYXRlZFN0cmluZ3MgfSBmcm9tICcuL21pbmltYWxUcmFuc2xhdGlvbnMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9jYWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xvY2FsaXphdGlvbi9jb21tb24vbG9jYWxlLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEJhc2VMb2NhbGl6YXRpb25Xb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi9jb21tb24vbG9jYWxpemF0aW9uLmNvbnRyaWJ1dGlvbi5qcyc7XG5cbmNsYXNzIE5hdGl2ZUxvY2FsaXphdGlvbldvcmtiZW5jaENvbnRyaWJ1dGlvbiBleHRlbmRzIEJhc2VMb2NhbGl6YXRpb25Xb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRwcml2YXRlIHN0YXRpYyBMQU5HVUFHRVBBQ0tfU1VHR0VTVElPTl9JR05PUkVfU1RPUkFHRV9LRVkgPSAnZXh0ZW5zaW9uc0Fzc2lzdGFudC9sYW5ndWFnZVBhY2tTdWdnZXN0aW9uSWdub3JlJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUxvY2FsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2NhbGVTZXJ2aWNlOiBJTG9jYWxlU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZ2FsbGVyeVNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuY2hlY2tBbmRJbnN0YWxsKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkRpZEluc3RhbGxFeHRlbnNpb25zKGUgPT4gdGhpcy5vbkRpZEluc3RhbGxFeHRlbnNpb25zKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbihlID0+IHRoaXMub25EaWRVbmluc3RhbGxFeHRlbnNpb24oZSkpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25EaWRJbnN0YWxsRXh0ZW5zaW9ucyhyZXN1bHRzOiByZWFkb25seSBJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0W10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IHJlc3VsdCBvZiByZXN1bHRzKSB7XG5cdFx0XHRpZiAocmVzdWx0Lm9wZXJhdGlvbiA9PT0gSW5zdGFsbE9wZXJhdGlvbi5JbnN0YWxsICYmIHJlc3VsdC5sb2NhbCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLm9uRGlkSW5zdGFsbEV4dGVuc2lvbihyZXN1bHQubG9jYWwsICEhcmVzdWx0LmNvbnRleHQ/LmV4dGVuc2lvbnNTeW5jKTtcblx0XHRcdH1cblx0XHR9XG5cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25EaWRJbnN0YWxsRXh0ZW5zaW9uKGxvY2FsRXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIGZyb21TZXR0aW5nc1N5bmM6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBsb2NhbGl6YXRpb24gPSBsb2NhbEV4dGVuc2lvbi5tYW5pZmVzdC5jb250cmlidXRlcz8ubG9jYWxpemF0aW9ucz8uWzBdO1xuXHRcdGlmICghbG9jYWxpemF0aW9uIHx8IHBsYXRmb3JtLmxhbmd1YWdlID09PSBsb2NhbGl6YXRpb24ubGFuZ3VhZ2VJZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB7IGxhbmd1YWdlSWQsIGxhbmd1YWdlTmFtZSB9ID0gbG9jYWxpemF0aW9uO1xuXG5cdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFNldmVyaXR5LkluZm8sXG5cdFx0XHRsb2NhbGl6ZSgndXBkYXRlTG9jYWxlJywgXCJXb3VsZCB5b3UgbGlrZSB0byBjaGFuZ2UgezB9J3MgZGlzcGxheSBsYW5ndWFnZSB0byB7MX0gYW5kIHJlc3RhcnQ/XCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcsIGxhbmd1YWdlTmFtZSB8fCBsYW5ndWFnZUlkKSxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhbmdlQW5kUmVzdGFydCcsIFwiQ2hhbmdlIExhbmd1YWdlIGFuZCBSZXN0YXJ0XCIpLFxuXHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmxvY2FsZVNlcnZpY2Uuc2V0TG9jYWxlKHtcblx0XHRcdFx0XHRcdGlkOiBsYW5ndWFnZUlkLFxuXHRcdFx0XHRcdFx0bGFiZWw6IGxhbmd1YWdlTmFtZSA/PyBsYW5ndWFnZUlkLFxuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IGxvY2FsRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsXG5cdFx0XHRcdFx0XHQvLyBJZiBzZXR0aW5ncyBzeW5jIGluc3RhbGxzIHRoZSBsYW5ndWFnZSBwYWNrLCB0aGVuIHdlIHdvdWxkIGhhdmUganVzdCBzaG93biB0aGUgbm90aWZpY2F0aW9uIHNvIG5vXG5cdFx0XHRcdFx0XHQvLyBuZWVkIHRvIHNob3cgdGhlIGRpYWxvZy5cblx0XHRcdFx0XHR9LCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fV0sXG5cdFx0XHR7XG5cdFx0XHRcdHN0aWNreTogdHJ1ZSxcblx0XHRcdFx0cHJpb3JpdHk6IE5vdGlmaWNhdGlvblByaW9yaXR5LlVSR0VOVCxcblx0XHRcdFx0bmV2ZXJTaG93QWdhaW46IHsgaWQ6ICdsYW5ndWdhZ2UudXBkYXRlLmRvbm90YXNrJywgaXNTZWNvbmRhcnk6IHRydWUsIHNjb3BlOiBOZXZlclNob3dBZ2FpblNjb3BlLkFQUExJQ0FUSU9OIH1cblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbkRpZFVuaW5zdGFsbEV4dGVuc2lvbihfZXZlbnQ6IERpZFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFhd2FpdCB0aGlzLmlzTG9jYWxlSW5zdGFsbGVkKHBsYXRmb3JtLmxhbmd1YWdlKSkge1xuXHRcdFx0dGhpcy5sb2NhbGVTZXJ2aWNlLnNldExvY2FsZSh7XG5cdFx0XHRcdGlkOiAnZW4nLFxuXHRcdFx0XHRsYWJlbDogJ0VuZ2xpc2gnXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNoZWNrQW5kSW5zdGFsbCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBsYW5ndWFnZSA9IHBsYXRmb3JtLmxhbmd1YWdlO1xuXHRcdGxldCBsb2NhbGUgPSBwbGF0Zm9ybS5sb2NhbGUgPz8gJyc7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VQYWNrU3VnZ2VzdGlvbklnbm9yZUxpc3Q6IHN0cmluZ1tdID0gSlNPTi5wYXJzZShcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFxuXHRcdFx0XHROYXRpdmVMb2NhbGl6YXRpb25Xb3JrYmVuY2hDb250cmlidXRpb24uTEFOR1VBR0VQQUNLX1NVR0dFU1RJT05fSUdOT1JFX1NUT1JBR0VfS0VZLFxuXHRcdFx0XHRTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRcdCdbXSdcblx0XHRcdClcblx0XHQpO1xuXG5cdFx0aWYgKCF0aGlzLmdhbGxlcnlTZXJ2aWNlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghbGFuZ3VhZ2UgfHwgIWxvY2FsZSB8fCBwbGF0Zm9ybS5MYW5ndWFnZS5pc0RlZmF1bHRWYXJpYW50KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGxvY2FsZS5zdGFydHNXaXRoKGxhbmd1YWdlKSB8fCBsYW5ndWFnZVBhY2tTdWdnZXN0aW9uSWdub3JlTGlzdC5pbmNsdWRlcyhsb2NhbGUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zdGFsbGVkID0gYXdhaXQgdGhpcy5pc0xvY2FsZUluc3RhbGxlZChsb2NhbGUpO1xuXHRcdGlmIChpbnN0YWxsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmdWxsTG9jYWxlID0gbG9jYWxlO1xuXHRcdGxldCB0YWdSZXN1bHQgPSBhd2FpdCB0aGlzLmdhbGxlcnlTZXJ2aWNlLnF1ZXJ5KHsgdGV4dDogYHRhZzpscC0ke2xvY2FsZX1gIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGlmICh0YWdSZXN1bHQudG90YWwgPT09IDApIHtcblx0XHRcdC8vIFRyaW0gdGhlIGxvY2FsZSBhbmQgdHJ5IGFnYWluLlxuXHRcdFx0bG9jYWxlID0gbG9jYWxlLnNwbGl0KCctJylbMF07XG5cdFx0XHR0YWdSZXN1bHQgPSBhd2FpdCB0aGlzLmdhbGxlcnlTZXJ2aWNlLnF1ZXJ5KHsgdGV4dDogYHRhZzpscC0ke2xvY2FsZX1gIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0aWYgKHRhZ1Jlc3VsdC50b3RhbCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uVG9JbnN0YWxsID0gdGFnUmVzdWx0LnRvdGFsID09PSAxID8gdGFnUmVzdWx0LmZpcnN0UGFnZVswXSA6IHRhZ1Jlc3VsdC5maXJzdFBhZ2UuZmluZChlID0+IGUucHVibGlzaGVyID09PSAnTVMtQ0VJTlRMJyAmJiBlLm5hbWUuc3RhcnRzV2l0aCgndnNjb2RlLWxhbmd1YWdlLXBhY2snKSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uVG9GZXRjaFRyYW5zbGF0aW9uc0Zyb20gPSBleHRlbnNpb25Ub0luc3RhbGwgPz8gdGFnUmVzdWx0LmZpcnN0UGFnZVswXTtcblxuXHRcdGlmICghZXh0ZW5zaW9uVG9GZXRjaFRyYW5zbGF0aW9uc0Zyb20uYXNzZXRzLm1hbmlmZXN0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgW21hbmlmZXN0LCB0cmFuc2xhdGlvbl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHR0aGlzLmdhbGxlcnlTZXJ2aWNlLmdldE1hbmlmZXN0KGV4dGVuc2lvblRvRmV0Y2hUcmFuc2xhdGlvbnNGcm9tLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdHRoaXMuZ2FsbGVyeVNlcnZpY2UuZ2V0Q29yZVRyYW5zbGF0aW9uKGV4dGVuc2lvblRvRmV0Y2hUcmFuc2xhdGlvbnNGcm9tLCBsb2NhbGUpXG5cdFx0XSk7XG5cdFx0Y29uc3QgbG9jID0gbWFuaWZlc3Q/LmNvbnRyaWJ1dGVzPy5sb2NhbGl6YXRpb25zPy5maW5kKHggPT4gbG9jYWxlLnN0YXJ0c1dpdGgoeC5sYW5ndWFnZUlkLnRvTG93ZXJDYXNlKCkpKTtcblx0XHRjb25zdCBsYW5ndWFnZU5hbWUgPSBsb2MgPyAobG9jLmxhbmd1YWdlTmFtZSB8fCBsb2NhbGUpIDogbG9jYWxlO1xuXHRcdGNvbnN0IGxhbmd1YWdlRGlzcGxheU5hbWUgPSBsb2MgPyAobG9jLmxvY2FsaXplZExhbmd1YWdlTmFtZSB8fCBsb2MubGFuZ3VhZ2VOYW1lIHx8IGxvY2FsZSkgOiBsb2NhbGU7XG5cdFx0Y29uc3QgdHJhbnNsYXRpb25zRnJvbVBhY2s6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0gPSB0cmFuc2xhdGlvbj8uY29udGVudHM/LlsndnMvd29ya2JlbmNoL2NvbnRyaWIvbG9jYWxpemF0aW9uL2VsZWN0cm9uLWJyb3dzZXIvbWluaW1hbFRyYW5zbGF0aW9ucyddID8/IHt9O1xuXHRcdGNvbnN0IHByb21wdE1lc3NhZ2VLZXkgPSBleHRlbnNpb25Ub0luc3RhbGwgPyAnaW5zdGFsbEFuZFJlc3RhcnRNZXNzYWdlJyA6ICdzaG93TGFuZ3VhZ2VQYWNrRXh0ZW5zaW9ucyc7XG5cdFx0Y29uc3QgdXNlRW5nbGlzaCA9ICF0cmFuc2xhdGlvbnNGcm9tUGFja1twcm9tcHRNZXNzYWdlS2V5XTtcblxuXHRcdGNvbnN0IHRyYW5zbGF0aW9uczogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfSA9IHt9O1xuXHRcdE9iamVjdC5rZXlzKG1pbmltdW1UcmFuc2xhdGVkU3RyaW5ncykuZm9yRWFjaChrZXkgPT4ge1xuXHRcdFx0aWYgKCF0cmFuc2xhdGlvbnNGcm9tUGFja1trZXldIHx8IHVzZUVuZ2xpc2gpIHtcblx0XHRcdFx0dHJhbnNsYXRpb25zW2tleV0gPSBtaW5pbXVtVHJhbnNsYXRlZFN0cmluZ3Nba2V5XS5yZXBsYWNlKCd7MH0nLCAoKSA9PiBsYW5ndWFnZU5hbWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dHJhbnNsYXRpb25zW2tleV0gPSBgJHt0cmFuc2xhdGlvbnNGcm9tUGFja1trZXldLnJlcGxhY2UoJ3swfScsICgpID0+IGxhbmd1YWdlRGlzcGxheU5hbWUpfSAoJHttaW5pbXVtVHJhbnNsYXRlZFN0cmluZ3Nba2V5XS5yZXBsYWNlKCd7MH0nLCAoKSA9PiBsYW5ndWFnZU5hbWUpfSlgO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbG9nVXNlclJlYWN0aW9uID0gKHVzZXJSZWFjdGlvbjogc3RyaW5nKSA9PiB7XG5cdFx0XHQvKiBfX0dEUFJfX1xuXHRcdFx0XHRcImxhbmd1YWdlUGFja1N1Z2dlc3Rpb246cG9wdXBcIiA6IHtcblx0XHRcdFx0XHRcIm93bmVyXCI6IFwiVHlsZXJMZW9uaGFyZHRcIixcblx0XHRcdFx0XHRcInVzZXJSZWFjdGlvblwiIDogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiB9LFxuXHRcdFx0XHRcdFwibGFuZ3VhZ2VcIjogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiB9XG5cdFx0XHRcdH1cblx0XHRcdCovXG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nKCdsYW5ndWFnZVBhY2tTdWdnZXN0aW9uOnBvcHVwJywgeyB1c2VyUmVhY3Rpb24sIGxhbmd1YWdlOiBsb2NhbGUgfSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHNlYXJjaEFjdGlvbiA9IHtcblx0XHRcdGxhYmVsOiB0cmFuc2xhdGlvbnNbJ3NlYXJjaE1hcmtldHBsYWNlJ10sXG5cdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0bG9nVXNlclJlYWN0aW9uKCdzZWFyY2gnKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKGB0YWc6bHAtJHtsb2NhbGV9YCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGluc3RhbGxBbmRSZXN0YXJ0QWN0aW9uID0ge1xuXHRcdFx0bGFiZWw6IHRyYW5zbGF0aW9uc1snaW5zdGFsbEFuZFJlc3RhcnQnXSxcblx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsb2dVc2VyUmVhY3Rpb24oJ2luc3RhbGxBbmRSZXN0YXJ0Jyk7XG5cdFx0XHRcdGF3YWl0IHRoaXMubG9jYWxlU2VydmljZS5zZXRMb2NhbGUoe1xuXHRcdFx0XHRcdGlkOiBsb2NhbGUsXG5cdFx0XHRcdFx0bGFiZWw6IGxhbmd1YWdlTmFtZSxcblx0XHRcdFx0XHRleHRlbnNpb25JZDogZXh0ZW5zaW9uVG9JbnN0YWxsPy5pZGVudGlmaWVyLmlkLFxuXHRcdFx0XHRcdGdhbGxlcnlFeHRlbnNpb246IGV4dGVuc2lvblRvSW5zdGFsbFxuXHRcdFx0XHRcdC8vIFRoZSB1c2VyIHdpbGwgYmUgcHJvbXB0ZWQgaWYgdGhleSB3YW50IHRvIGluc3RhbGwgdGhlIGxhbmd1YWdlIHBhY2sgYmVmb3JlIHRoaXMuXG5cdFx0XHRcdH0sIHRydWUpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBwcm9tcHRNZXNzYWdlID0gdHJhbnNsYXRpb25zW3Byb21wdE1lc3NhZ2VLZXldO1xuXG5cdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFNldmVyaXR5LkluZm8sXG5cdFx0XHRwcm9tcHRNZXNzYWdlLFxuXHRcdFx0W2V4dGVuc2lvblRvSW5zdGFsbCA/IGluc3RhbGxBbmRSZXN0YXJ0QWN0aW9uIDogc2VhcmNoQWN0aW9uLFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ25ldmVyQWdhaW4nLCBcIkRvbid0IFNob3cgQWdhaW5cIiksXG5cdFx0XHRcdGlzU2Vjb25kYXJ5OiB0cnVlLFxuXHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRsYW5ndWFnZVBhY2tTdWdnZXN0aW9uSWdub3JlTGlzdC5wdXNoKGZ1bGxMb2NhbGUpO1xuXHRcdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoXG5cdFx0XHRcdFx0XHROYXRpdmVMb2NhbGl6YXRpb25Xb3JrYmVuY2hDb250cmlidXRpb24uTEFOR1VBR0VQQUNLX1NVR0dFU1RJT05fSUdOT1JFX1NUT1JBR0VfS0VZLFxuXHRcdFx0XHRcdFx0SlNPTi5zdHJpbmdpZnkobGFuZ3VhZ2VQYWNrU3VnZ2VzdGlvbklnbm9yZUxpc3QpLFxuXHRcdFx0XHRcdFx0U3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0XHRcdFx0U3RvcmFnZVRhcmdldC5VU0VSXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRsb2dVc2VyUmVhY3Rpb24oJ25ldmVyU2hvd0FnYWluJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1dLFxuXHRcdFx0e1xuXHRcdFx0XHRwcmlvcml0eTogTm90aWZpY2F0aW9uUHJpb3JpdHkuT1BUSU9OQUwsXG5cdFx0XHRcdG9uQ2FuY2VsOiAoKSA9PiB7XG5cdFx0XHRcdFx0bG9nVXNlclJlYWN0aW9uKCdjYW5jZWxsZWQnKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGlzTG9jYWxlSW5zdGFsbGVkKGxvY2FsZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgaW5zdGFsbGVkID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQoKTtcblx0XHRyZXR1cm4gaW5zdGFsbGVkLnNvbWUoaSA9PiAhIWkubWFuaWZlc3QuY29udHJpYnV0ZXM/LmxvY2FsaXphdGlvbnM/Lmxlbmd0aFxuXHRcdFx0JiYgaS5tYW5pZmVzdC5jb250cmlidXRlcy5sb2NhbGl6YXRpb25zLnNvbWUobCA9PiBsb2NhbGUuc3RhcnRzV2l0aChsLmxhbmd1YWdlSWQudG9Mb3dlckNhc2UoKSkpKTtcblx0fVxufVxuXG5jb25zdCB3b3JrYmVuY2hSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKTtcbndvcmtiZW5jaFJlZ2lzdHJ5LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKE5hdGl2ZUxvY2FsaXphdGlvbldvcmtiZW5jaENvbnRyaWJ1dGlvbiwgTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBYywyQkFBNEQ7QUFDbkYsU0FBUyxzQkFBc0I7QUFDL0IsWUFBWSxjQUFjO0FBQzFCLFNBQVMsNkJBQTZCLDBCQUEwQix3QkFBNkY7QUFDN0osU0FBUyxzQkFBc0IscUJBQXFCLDRCQUE0QjtBQUNoRixPQUFPLGNBQWM7QUFDckIsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2Q0FBNkM7QUFFdEQsSUFBTSwwQ0FBTixjQUFzRCxzQ0FBc0M7QUFBQSxFQUczRixZQUN3QyxxQkFDTixlQUNDLGdCQUNBLGdCQUNZLDRCQUNILGdCQUNHLDRCQUNWLGtCQUNuQztBQUNELFVBQU07QUFUaUM7QUFDTjtBQUNDO0FBQ0E7QUFDWTtBQUNIO0FBQ0c7QUFDVjtBQUlwQyxTQUFLLGdCQUFnQjtBQUNyQixTQUFLLFVBQVUsS0FBSywyQkFBMkIsdUJBQXVCLE9BQUssS0FBSyx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7QUFDMUcsU0FBSyxVQUFVLEtBQUssMkJBQTJCLHdCQUF3QixPQUFLLEtBQUssd0JBQXdCLENBQUMsQ0FBQyxDQUFDO0FBQUEsRUFDN0c7QUFBQSxFQUVBLE1BQWMsdUJBQXVCLFNBQTJEO0FBQy9GLGVBQVcsVUFBVSxTQUFTO0FBQzdCLFVBQUksT0FBTyxjQUFjLGlCQUFpQixXQUFXLE9BQU8sT0FBTztBQUNsRSxjQUFNLEtBQUssc0JBQXNCLE9BQU8sT0FBTyxDQUFDLENBQUMsT0FBTyxTQUFTLGNBQWM7QUFBQSxNQUNoRjtBQUFBLElBQ0Q7QUFBQSxFQUVEO0FBQUEsRUFFQSxNQUFjLHNCQUFzQixnQkFBaUMsa0JBQTBDO0FBQzlHLFVBQU0sZUFBZSxlQUFlLFNBQVMsYUFBYSxnQkFBZ0IsQ0FBQztBQUMzRSxRQUFJLENBQUMsZ0JBQWdCLFNBQVMsYUFBYSxhQUFhLFlBQVk7QUFDbkU7QUFBQSxJQUNEO0FBQ0EsVUFBTSxFQUFFLFlBQVksYUFBYSxJQUFJO0FBRXJDLFNBQUssb0JBQW9CO0FBQUEsTUFDeEIsU0FBUztBQUFBLE1BQ1QsU0FBUyxnQkFBZ0IsdUVBQXVFLEtBQUssZUFBZSxVQUFVLGdCQUFnQixVQUFVO0FBQUEsTUFDeEosQ0FBQztBQUFBLFFBQ0EsT0FBTyxTQUFTLG9CQUFvQiw2QkFBNkI7QUFBQSxRQUNqRSxLQUFLLFlBQVk7QUFDaEIsZ0JBQU0sS0FBSyxjQUFjLFVBQVU7QUFBQSxZQUNsQyxJQUFJO0FBQUEsWUFDSixPQUFPLGdCQUFnQjtBQUFBLFlBQ3ZCLGFBQWEsZUFBZSxXQUFXO0FBQUE7QUFBQTtBQUFBLFVBR3hDLEdBQUcsSUFBSTtBQUFBLFFBQ1I7QUFBQSxNQUNELENBQUM7QUFBQSxNQUNEO0FBQUEsUUFDQyxRQUFRO0FBQUEsUUFDUixVQUFVLHFCQUFxQjtBQUFBLFFBQy9CLGdCQUFnQixFQUFFLElBQUksNkJBQTZCLGFBQWEsTUFBTSxPQUFPLG9CQUFvQixZQUFZO0FBQUEsTUFDOUc7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyx3QkFBd0IsUUFBbUQ7QUFDeEYsUUFBSSxDQUFDLE1BQU0sS0FBSyxrQkFBa0IsU0FBUyxRQUFRLEdBQUc7QUFDckQsV0FBSyxjQUFjLFVBQVU7QUFBQSxRQUM1QixJQUFJO0FBQUEsUUFDSixPQUFPO0FBQUEsTUFDUixDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsa0JBQWlDO0FBQzlDLFVBQU0sV0FBVyxTQUFTO0FBQzFCLFFBQUksU0FBUyxTQUFTLFVBQVU7QUFDaEMsVUFBTSxtQ0FBNkMsS0FBSztBQUFBLE1BQ3ZELEtBQUssZUFBZTtBQUFBLFFBQ25CLHdDQUF3QztBQUFBLFFBQ3hDLGFBQWE7QUFBQSxRQUNiO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLENBQUMsS0FBSyxlQUFlLFVBQVUsR0FBRztBQUNyQztBQUFBLElBQ0Q7QUFDQSxRQUFJLENBQUMsWUFBWSxDQUFDLFVBQVUsU0FBUyxTQUFTLGlCQUFpQixHQUFHO0FBQ2pFO0FBQUEsSUFDRDtBQUNBLFFBQUksT0FBTyxXQUFXLFFBQVEsS0FBSyxpQ0FBaUMsU0FBUyxNQUFNLEdBQUc7QUFDckY7QUFBQSxJQUNEO0FBRUEsVUFBTSxZQUFZLE1BQU0sS0FBSyxrQkFBa0IsTUFBTTtBQUNyRCxRQUFJLFdBQVc7QUFDZDtBQUFBLElBQ0Q7QUFFQSxVQUFNLGFBQWE7QUFDbkIsUUFBSSxZQUFZLE1BQU0sS0FBSyxlQUFlLE1BQU0sRUFBRSxNQUFNLFVBQVUsTUFBTSxHQUFHLEdBQUcsa0JBQWtCLElBQUk7QUFDcEcsUUFBSSxVQUFVLFVBQVUsR0FBRztBQUUxQixlQUFTLE9BQU8sTUFBTSxHQUFHLEVBQUUsQ0FBQztBQUM1QixrQkFBWSxNQUFNLEtBQUssZUFBZSxNQUFNLEVBQUUsTUFBTSxVQUFVLE1BQU0sR0FBRyxHQUFHLGtCQUFrQixJQUFJO0FBQ2hHLFVBQUksVUFBVSxVQUFVLEdBQUc7QUFDMUI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFVBQU0scUJBQXFCLFVBQVUsVUFBVSxJQUFJLFVBQVUsVUFBVSxDQUFDLElBQUksVUFBVSxVQUFVLEtBQUssT0FBSyxFQUFFLGNBQWMsZUFBZSxFQUFFLEtBQUssV0FBVyxzQkFBc0IsQ0FBQztBQUNsTCxVQUFNLG1DQUFtQyxzQkFBc0IsVUFBVSxVQUFVLENBQUM7QUFFcEYsUUFBSSxDQUFDLGlDQUFpQyxPQUFPLFVBQVU7QUFDdEQ7QUFBQSxJQUNEO0FBRUEsVUFBTSxDQUFDLFVBQVUsV0FBVyxJQUFJLE1BQU0sUUFBUSxJQUFJO0FBQUEsTUFDakQsS0FBSyxlQUFlLFlBQVksa0NBQWtDLGtCQUFrQixJQUFJO0FBQUEsTUFDeEYsS0FBSyxlQUFlLG1CQUFtQixrQ0FBa0MsTUFBTTtBQUFBLElBQ2hGLENBQUM7QUFDRCxVQUFNLE1BQU0sVUFBVSxhQUFhLGVBQWUsS0FBSyxPQUFLLE9BQU8sV0FBVyxFQUFFLFdBQVcsWUFBWSxDQUFDLENBQUM7QUFDekcsVUFBTSxlQUFlLE1BQU8sSUFBSSxnQkFBZ0IsU0FBVTtBQUMxRCxVQUFNLHNCQUFzQixNQUFPLElBQUkseUJBQXlCLElBQUksZ0JBQWdCLFNBQVU7QUFDOUYsVUFBTSx1QkFBa0QsYUFBYSxXQUFXLHdFQUF3RSxLQUFLLENBQUM7QUFDOUosVUFBTSxtQkFBbUIscUJBQXFCLDZCQUE2QjtBQUMzRSxVQUFNLGFBQWEsQ0FBQyxxQkFBcUIsZ0JBQWdCO0FBRXpELFVBQU0sZUFBMEMsQ0FBQztBQUNqRCxXQUFPLEtBQUssd0JBQXdCLEVBQUUsUUFBUSxTQUFPO0FBQ3BELFVBQUksQ0FBQyxxQkFBcUIsR0FBRyxLQUFLLFlBQVk7QUFDN0MscUJBQWEsR0FBRyxJQUFJLHlCQUF5QixHQUFHLEVBQUUsUUFBUSxPQUFPLE1BQU0sWUFBWTtBQUFBLE1BQ3BGLE9BQU87QUFDTixxQkFBYSxHQUFHLElBQUksR0FBRyxxQkFBcUIsR0FBRyxFQUFFLFFBQVEsT0FBTyxNQUFNLG1CQUFtQixDQUFDLEtBQUsseUJBQXlCLEdBQUcsRUFBRSxRQUFRLE9BQU8sTUFBTSxZQUFZLENBQUM7QUFBQSxNQUNoSztBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sa0JBQWtCLENBQUMsaUJBQXlCO0FBUWpELFdBQUssaUJBQWlCLFVBQVUsZ0NBQWdDLEVBQUUsY0FBYyxVQUFVLE9BQU8sQ0FBQztBQUFBLElBQ25HO0FBRUEsVUFBTSxlQUFlO0FBQUEsTUFDcEIsT0FBTyxhQUFhLG1CQUFtQjtBQUFBLE1BQ3ZDLEtBQUssWUFBWTtBQUNoQix3QkFBZ0IsUUFBUTtBQUN4QixjQUFNLEtBQUssMkJBQTJCLFdBQVcsVUFBVSxNQUFNLEVBQUU7QUFBQSxNQUNwRTtBQUFBLElBQ0Q7QUFFQSxVQUFNLDBCQUEwQjtBQUFBLE1BQy9CLE9BQU8sYUFBYSxtQkFBbUI7QUFBQSxNQUN2QyxLQUFLLFlBQVk7QUFDaEIsd0JBQWdCLG1CQUFtQjtBQUNuQyxjQUFNLEtBQUssY0FBYyxVQUFVO0FBQUEsVUFDbEMsSUFBSTtBQUFBLFVBQ0osT0FBTztBQUFBLFVBQ1AsYUFBYSxvQkFBb0IsV0FBVztBQUFBLFVBQzVDLGtCQUFrQjtBQUFBO0FBQUEsUUFFbkIsR0FBRyxJQUFJO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGdCQUFnQixhQUFhLGdCQUFnQjtBQUVuRCxTQUFLLG9CQUFvQjtBQUFBLE1BQ3hCLFNBQVM7QUFBQSxNQUNUO0FBQUEsTUFDQTtBQUFBLFFBQUMscUJBQXFCLDBCQUEwQjtBQUFBLFFBQ2hEO0FBQUEsVUFDQyxPQUFPLFNBQVMsY0FBYyxrQkFBa0I7QUFBQSxVQUNoRCxhQUFhO0FBQUEsVUFDYixLQUFLLE1BQU07QUFDViw2Q0FBaUMsS0FBSyxVQUFVO0FBQ2hELGlCQUFLLGVBQWU7QUFBQSxjQUNuQix3Q0FBd0M7QUFBQSxjQUN4QyxLQUFLLFVBQVUsZ0NBQWdDO0FBQUEsY0FDL0MsYUFBYTtBQUFBLGNBQ2IsY0FBYztBQUFBLFlBQ2Y7QUFDQSw0QkFBZ0IsZ0JBQWdCO0FBQUEsVUFDakM7QUFBQSxRQUNEO0FBQUEsTUFBQztBQUFBLE1BQ0Q7QUFBQSxRQUNDLFVBQVUscUJBQXFCO0FBQUEsUUFDL0IsVUFBVSxNQUFNO0FBQ2YsMEJBQWdCLFdBQVc7QUFBQSxRQUM1QjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxrQkFBa0IsUUFBa0M7QUFDakUsVUFBTSxZQUFZLE1BQU0sS0FBSywyQkFBMkIsYUFBYTtBQUNyRSxXQUFPLFVBQVUsS0FBSyxPQUFLLENBQUMsQ0FBQyxFQUFFLFNBQVMsYUFBYSxlQUFlLFVBQ2hFLEVBQUUsU0FBUyxZQUFZLGNBQWMsS0FBSyxPQUFLLE9BQU8sV0FBVyxFQUFFLFdBQVcsWUFBWSxDQUFDLENBQUMsQ0FBQztBQUFBLEVBQ2xHO0FBQ0Q7QUF2TU0sd0NBQ1UsNkNBQTZDO0FBRHZELDBDQUFOO0FBQUEsRUFJRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVhHO0FBeU1OLE1BQU0sb0JBQW9CLFNBQVMsR0FBb0Msb0JBQW9CLFNBQVM7QUFDcEcsa0JBQWtCLDhCQUE4Qix5Q0FBeUMsZUFBZSxVQUFVOyIsCiAgIm5hbWVzIjogW10KfQo=
