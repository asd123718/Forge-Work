import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { ILanguageModelsService } from "../../common/languageModels.js";
import { IAuthenticationAccessService } from "../../../../services/authentication/browser/authenticationAccessService.js";
import { localize, localize2 } from "../../../../../nls.js";
import { INTERNAL_AUTH_PROVIDER_PREFIX } from "../../../../services/authentication/common/authentication.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { CHAT_CATEGORY } from "./chatActions.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { IExtensionsWorkbenchService } from "../../../extensions/common/extensions.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
const _ManageLanguageModelAuthenticationAction = class _ManageLanguageModelAuthenticationAction extends Action2 {
  constructor() {
    super({
      id: _ManageLanguageModelAuthenticationAction.ID,
      title: localize2("manageLanguageModelAuthentication", "Manage Language Model Access..."),
      category: CHAT_CATEGORY,
      precondition: ChatContextKeys.enabled,
      menu: [{
        id: MenuId.AccountsContext,
        order: 100
      }],
      f1: true
    });
  }
  async run(accessor) {
    const quickInputService = accessor.get(IQuickInputService);
    const languageModelsService = accessor.get(ILanguageModelsService);
    const authenticationAccessService = accessor.get(IAuthenticationAccessService);
    const dialogService = accessor.get(IDialogService);
    const extensionService = accessor.get(IExtensionService);
    const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
    const productService = accessor.get(IProductService);
    const modelIds = languageModelsService.getLanguageModelIds();
    const extensionAuth = /* @__PURE__ */ new Map();
    const ownerToAccountLabel = /* @__PURE__ */ new Map();
    for (const modelId of modelIds) {
      const model = languageModelsService.lookupLanguageModel(modelId);
      if (!model?.auth) {
        continue;
      }
      const ownerId = model.extension.value;
      if (extensionAuth.has(ownerId)) {
        continue;
      }
      try {
        const providerId = INTERNAL_AUTH_PROVIDER_PREFIX + ownerId;
        const accountLabel = model.auth.accountLabel || "Language Models";
        ownerToAccountLabel.set(ownerId, accountLabel);
        const allowedExtensions = authenticationAccessService.readAllowedExtensions(
          providerId,
          accountLabel
        ).filter((ext) => !ext.trusted);
        if (productService.trustedExtensionAuthAccess && !Array.isArray(productService.trustedExtensionAuthAccess)) {
          const trustedExtensions = productService.trustedExtensionAuthAccess[providerId];
          for (const ext of trustedExtensions) {
            const index = allowedExtensions.findIndex((a) => a.id === ext);
            if (index !== -1) {
              allowedExtensions.splice(index, 1);
            }
            const extension = await extensionService.getExtension(ext);
            if (!extension) {
              continue;
            }
            allowedExtensions.push({
              id: ext,
              name: extension.displayName || extension.name,
              allowed: true,
              // Assume trusted extensions are allowed by default
              trusted: true
              // Mark as trusted
            });
          }
        }
        const filteredExtensions = new Array();
        for (const ext of allowedExtensions) {
          if (await extensionService.getExtension(ext.id)) {
            filteredExtensions.push(ext);
          }
        }
        extensionAuth.set(ownerId, filteredExtensions);
      } catch (error) {
        if (!extensionAuth.has(ownerId)) {
          extensionAuth.set(ownerId, []);
        }
      }
    }
    if (extensionAuth.size === 0) {
      dialogService.prompt({
        type: "info",
        message: localize("noLanguageModels", "No language models requiring authentication found."),
        detail: localize("noLanguageModelsDetail", "There are currently no language models that require authentication.")
      });
      return;
    }
    const items = [];
    for (const [ownerId, allowedExtensions] of extensionAuth) {
      const extension = await extensionService.getExtension(ownerId);
      if (!extension) {
        continue;
      }
      items.push({
        type: "separator",
        id: ownerId,
        label: localize("extensionOwner", "{0}", extension.displayName || extension.name),
        buttons: [{
          iconClass: ThemeIcon.asClassName(Codicon.info),
          tooltip: localize("openExtension", "Open Extension")
        }]
      });
      let addedTrustedSeparator = false;
      if (allowedExtensions.length > 0) {
        for (const allowedExt of allowedExtensions) {
          if (allowedExt.trusted && !addedTrustedSeparator) {
            items.push({
              type: "separator",
              label: localize("trustedExtension", "Trusted by Microsoft")
            });
            addedTrustedSeparator = true;
          }
          items.push({
            label: allowedExt.name,
            ownerId,
            id: allowedExt.id,
            picked: allowedExt.allowed ?? false,
            extension: allowedExt,
            disabled: allowedExt.trusted,
            // Don't allow toggling trusted extensions
            buttons: [{
              iconClass: ThemeIcon.asClassName(Codicon.info),
              tooltip: localize("openExtension", "Open Extension")
            }]
          });
        }
      } else {
        items.push({
          label: localize("noAllowedExtensions", "No extensions have access"),
          description: localize("noAccessDescription", "No extensions are currently allowed to use models from {0}", ownerId),
          pickable: false
        });
      }
    }
    const result = await quickInputService.pick(
      items,
      {
        canPickMany: true,
        sortByLabel: true,
        onDidTriggerSeparatorButton(context) {
          const extId = context.separator.id;
          if (extId) {
            void extensionsWorkbenchService.open(extId);
          }
        },
        onDidTriggerItemButton(context) {
          const extId = context.item.id;
          if (extId) {
            void extensionsWorkbenchService.open(extId);
          }
        },
        title: localize("languageModelAuthTitle", "Manage Language Model Access"),
        placeHolder: localize("languageModelAuthPlaceholder", "Choose which extensions can access language models")
      }
    );
    if (!result) {
      return;
    }
    for (const [ownerId, allowedExtensions] of extensionAuth) {
      const allowedSet = new Set(result.filter((item) => item.ownerId === ownerId).filter((item) => !item.extension?.trusted).map((item) => item.id));
      for (const allowedExt of allowedExtensions) {
        allowedExt.allowed = allowedSet.has(allowedExt.id);
      }
      authenticationAccessService.updateAllowedExtensions(
        INTERNAL_AUTH_PROVIDER_PREFIX + ownerId,
        ownerToAccountLabel.get(ownerId) || "Language Models",
        allowedExtensions
      );
    }
  }
};
_ManageLanguageModelAuthenticationAction.ID = "workbench.action.chat.manageLanguageModelAuthentication";
let ManageLanguageModelAuthenticationAction = _ManageLanguageModelAuthenticationAction;
class ConfigureLanguageModelsGroupAction extends Action2 {
  constructor() {
    super({
      id: "lm.addLanguageModelsProviderGroup",
      title: localize("lm.configureGroup", "Add Language Models Group")
    });
  }
  async run(accessor, languageModelsProviderGroup) {
    const languageModelsService = accessor.get(ILanguageModelsService);
    if (!languageModelsProviderGroup) {
      throw new Error("Language model group is required");
    }
    const { name, vendor, ...configuration } = languageModelsProviderGroup;
    await languageModelsService.addLanguageModelsProviderGroup(name, vendor, configuration);
  }
}
class MigrateLanguageModelsGroupAction extends Action2 {
  constructor() {
    super({
      id: "lm.migrateLanguageModelsProviderGroup",
      title: localize("lm.migrateGroup", "Migrate Language Models Group")
    });
  }
  async run(accessor, languageModelsProviderGroup) {
    const languageModelsService = accessor.get(ILanguageModelsService);
    if (!languageModelsProviderGroup) {
      throw new Error("Language model group is required");
    }
    await languageModelsService.migrateLanguageModelsProviderGroup(languageModelsProviderGroup);
  }
}
function registerLanguageModelActions() {
  registerAction2(ManageLanguageModelAuthenticationAction);
  registerAction2(ConfigureLanguageModelsGroupAction);
  registerAction2(MigrateLanguageModelsGroupAction);
}
export {
  registerLanguageModelActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFjdGlvbnNcXGNoYXRMYW5ndWFnZU1vZGVsQWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtLCBRdWlja1BpY2tJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBbGxvd2VkRXh0ZW5zaW9uLCBJTlRFUk5BTF9BVVRIX1BST1ZJREVSX1BSRUZJWCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgQ0hBVF9DQVRFR09SWSB9IGZyb20gJy4vY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb24uanMnO1xuXG5jbGFzcyBNYW5hZ2VMYW5ndWFnZU1vZGVsQXV0aGVudGljYXRpb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5tYW5hZ2VMYW5ndWFnZU1vZGVsQXV0aGVudGljYXRpb24nO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNYW5hZ2VMYW5ndWFnZU1vZGVsQXV0aGVudGljYXRpb25BY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtYW5hZ2VMYW5ndWFnZU1vZGVsQXV0aGVudGljYXRpb24nLCAnTWFuYWdlIExhbmd1YWdlIE1vZGVsIEFjY2Vzcy4uLicpLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5BY2NvdW50c0NvbnRleHQsXG5cdFx0XHRcdG9yZGVyOiAxMDAsXG5cdFx0XHR9XSxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxhbmd1YWdlTW9kZWxzU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKTtcblx0XHRjb25zdCBhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZSk7XG5cdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uU2VydmljZSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKTtcblx0XHRjb25zdCBwcm9kdWN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUHJvZHVjdFNlcnZpY2UpO1xuXG5cdFx0Ly8gR2V0IGFsbCByZWdpc3RlcmVkIGxhbmd1YWdlIG1vZGVsc1xuXHRcdGNvbnN0IG1vZGVsSWRzID0gbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmdldExhbmd1YWdlTW9kZWxJZHMoKTtcblxuXHRcdC8vIEdyb3VwIG1vZGVscyBieSBvd25pbmcgZXh0ZW5zaW9uIGFuZCBjb2xsZWN0IGFsbCBhbGxvd2VkIGV4dGVuc2lvbnNcblx0XHRjb25zdCBleHRlbnNpb25BdXRoID0gbmV3IE1hcDxzdHJpbmcsIEFsbG93ZWRFeHRlbnNpb25bXT4oKTtcblxuXHRcdGNvbnN0IG93bmVyVG9BY2NvdW50TGFiZWwgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgbW9kZWxJZCBvZiBtb2RlbElkcykge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBsYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChtb2RlbElkKTtcblx0XHRcdGlmICghbW9kZWw/LmF1dGgpIHtcblx0XHRcdFx0Y29udGludWU7IC8vIFNraXAgaWYgbW9kZWwgaXMgbm90IGZvdW5kXG5cdFx0XHR9XG5cdFx0XHRjb25zdCBvd25lcklkID0gbW9kZWwuZXh0ZW5zaW9uLnZhbHVlO1xuXHRcdFx0aWYgKGV4dGVuc2lvbkF1dGguaGFzKG93bmVySWQpKSB7XG5cdFx0XHRcdC8vIElmIHRoZSBvd25lciBhbHJlYWR5IGV4aXN0cywganVzdCBjb250aW51ZVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gR2V0IGFsbG93ZWQgZXh0ZW5zaW9ucyBmb3IgdGhpcyBtb2RlbCdzIGF1dGggcHJvdmlkZXJcblx0XHRcdHRyeSB7XG5cdFx0XHRcdC8vIFVzZSBwcm92aWRlckxhYmVsIGFzIHRoZSBwcm92aWRlcklkIGFuZCBhY2NvdW50TGFiZWwgKG9yIGRlZmF1bHQpXG5cdFx0XHRcdGNvbnN0IHByb3ZpZGVySWQgPSBJTlRFUk5BTF9BVVRIX1BST1ZJREVSX1BSRUZJWCArIG93bmVySWQ7XG5cdFx0XHRcdGNvbnN0IGFjY291bnRMYWJlbCA9IG1vZGVsLmF1dGguYWNjb3VudExhYmVsIHx8ICdMYW5ndWFnZSBNb2RlbHMnO1xuXHRcdFx0XHRvd25lclRvQWNjb3VudExhYmVsLnNldChvd25lcklkLCBhY2NvdW50TGFiZWwpO1xuXHRcdFx0XHRjb25zdCBhbGxvd2VkRXh0ZW5zaW9ucyA9IGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZEV4dGVuc2lvbnMoXG5cdFx0XHRcdFx0cHJvdmlkZXJJZCxcblx0XHRcdFx0XHRhY2NvdW50TGFiZWxcblx0XHRcdFx0KS5maWx0ZXIoZXh0ID0+ICFleHQudHJ1c3RlZCk7IC8vIEZpbHRlciBvdXQgdHJ1c3RlZCBleHRlbnNpb25zIGJlY2F1c2UgdGhvc2Ugc2hvdWxkIG5vdCBiZSBtb2RpZmllZFxuXG5cdFx0XHRcdGlmIChwcm9kdWN0U2VydmljZS50cnVzdGVkRXh0ZW5zaW9uQXV0aEFjY2VzcyAmJiAhQXJyYXkuaXNBcnJheShwcm9kdWN0U2VydmljZS50cnVzdGVkRXh0ZW5zaW9uQXV0aEFjY2VzcykpIHtcblx0XHRcdFx0XHRjb25zdCB0cnVzdGVkRXh0ZW5zaW9ucyA9IHByb2R1Y3RTZXJ2aWNlLnRydXN0ZWRFeHRlbnNpb25BdXRoQWNjZXNzW3Byb3ZpZGVySWRdO1xuXHRcdFx0XHRcdC8vIElmIHRoZSBwcm92aWRlciBpcyB0cnVzdGVkLCBhZGQgYWxsIHRydXN0ZWQgZXh0ZW5zaW9ucyB0byB0aGUgYWxsb3dlZCBsaXN0XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBleHQgb2YgdHJ1c3RlZEV4dGVuc2lvbnMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gYWxsb3dlZEV4dGVuc2lvbnMuZmluZEluZGV4KGEgPT4gYS5pZCA9PT0gZXh0KTtcblx0XHRcdFx0XHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0XHRcdFx0YWxsb3dlZEV4dGVuc2lvbnMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IGF3YWl0IGV4dGVuc2lvblNlcnZpY2UuZ2V0RXh0ZW5zaW9uKGV4dCk7XG5cdFx0XHRcdFx0XHRpZiAoIWV4dGVuc2lvbikge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTsgLy8gU2tpcCBpZiB0aGUgZXh0ZW5zaW9uIGlzIG5vdCBmb3VuZFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YWxsb3dlZEV4dGVuc2lvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdGlkOiBleHQsXG5cdFx0XHRcdFx0XHRcdG5hbWU6IGV4dGVuc2lvbi5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24ubmFtZSxcblx0XHRcdFx0XHRcdFx0YWxsb3dlZDogdHJ1ZSwgLy8gQXNzdW1lIHRydXN0ZWQgZXh0ZW5zaW9ucyBhcmUgYWxsb3dlZCBieSBkZWZhdWx0XG5cdFx0XHRcdFx0XHRcdHRydXN0ZWQ6IHRydWUgLy8gTWFyayBhcyB0cnVzdGVkXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBPbmx5IGdyYWIgZXh0ZW5zaW9ucyB0aGF0IGFyZSBnZXR0YWJsZSBmcm9tIHRoZSBleHRlbnNpb24gc2VydmljZVxuXHRcdFx0XHRjb25zdCBmaWx0ZXJlZEV4dGVuc2lvbnMgPSBuZXcgQXJyYXk8QWxsb3dlZEV4dGVuc2lvbj4oKTtcblx0XHRcdFx0Zm9yIChjb25zdCBleHQgb2YgYWxsb3dlZEV4dGVuc2lvbnMpIHtcblx0XHRcdFx0XHRpZiAoYXdhaXQgZXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb24oZXh0LmlkKSkge1xuXHRcdFx0XHRcdFx0ZmlsdGVyZWRFeHRlbnNpb25zLnB1c2goZXh0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRleHRlbnNpb25BdXRoLnNldChvd25lcklkLCBmaWx0ZXJlZEV4dGVuc2lvbnMpO1xuXHRcdFx0XHQvLyBBZGQgYWxsIGFsbG93ZWQgZXh0ZW5zaW9ucyB0byB0aGUgc2V0IGZvciB0aGlzIG93bmVyXG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvLyBIYW5kbGUgZXJyb3IgYnkgZW5zdXJpbmcgdGhlIG93bmVyIGlzIGluIHRoZSBtYXBcblx0XHRcdFx0aWYgKCFleHRlbnNpb25BdXRoLmhhcyhvd25lcklkKSkge1xuXHRcdFx0XHRcdGV4dGVuc2lvbkF1dGguc2V0KG93bmVySWQsIFtdKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChleHRlbnNpb25BdXRoLnNpemUgPT09IDApIHtcblx0XHRcdGRpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdFx0dHlwZTogJ2luZm8nLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnbm9MYW5ndWFnZU1vZGVscycsICdObyBsYW5ndWFnZSBtb2RlbHMgcmVxdWlyaW5nIGF1dGhlbnRpY2F0aW9uIGZvdW5kLicpLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdub0xhbmd1YWdlTW9kZWxzRGV0YWlsJywgJ1RoZXJlIGFyZSBjdXJyZW50bHkgbm8gbGFuZ3VhZ2UgbW9kZWxzIHRoYXQgcmVxdWlyZSBhdXRoZW50aWNhdGlvbi4nKVxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbXM6IFF1aWNrUGlja0lucHV0PElRdWlja1BpY2tJdGVtICYgeyBleHRlbnNpb24/OiBBbGxvd2VkRXh0ZW5zaW9uOyBvd25lcklkPzogc3RyaW5nIH0+W10gPSBbXTtcblx0XHQvLyBDcmVhdGUgUXVpY2tQaWNrIGl0ZW1zIGdyb3VwZWQgYnkgb3duZXIgZXh0ZW5zaW9uXG5cdFx0Zm9yIChjb25zdCBbb3duZXJJZCwgYWxsb3dlZEV4dGVuc2lvbnNdIG9mIGV4dGVuc2lvbkF1dGgpIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IGF3YWl0IGV4dGVuc2lvblNlcnZpY2UuZ2V0RXh0ZW5zaW9uKG93bmVySWQpO1xuXHRcdFx0aWYgKCFleHRlbnNpb24pIHtcblx0XHRcdFx0Ly8gSWYgdGhlIGV4dGVuc2lvbiBpcyBub3QgZm91bmQsIHNraXAgaXRcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBBZGQgc2VwYXJhdG9yIGZvciB0aGUgb3duaW5nIGV4dGVuc2lvblxuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdHR5cGU6ICdzZXBhcmF0b3InLFxuXHRcdFx0XHRpZDogb3duZXJJZCxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdleHRlbnNpb25Pd25lcicsICd7MH0nLCBleHRlbnNpb24uZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uLm5hbWUpLFxuXHRcdFx0XHRidXR0b25zOiBbe1xuXHRcdFx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uaW5mbyksXG5cdFx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ29wZW5FeHRlbnNpb24nLCAnT3BlbiBFeHRlbnNpb24nKSxcblx0XHRcdFx0fV1cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBBZGQgYWxsb3dlZCBleHRlbnNpb25zIGFzIGNoZWNrYm94ZXMgKHZpc3VhbCByZXByZXNlbnRhdGlvbilcblx0XHRcdGxldCBhZGRlZFRydXN0ZWRTZXBhcmF0b3IgPSBmYWxzZTtcblx0XHRcdGlmIChhbGxvd2VkRXh0ZW5zaW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgYWxsb3dlZEV4dCBvZiBhbGxvd2VkRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRcdGlmIChhbGxvd2VkRXh0LnRydXN0ZWQgJiYgIWFkZGVkVHJ1c3RlZFNlcGFyYXRvcikge1xuXHRcdFx0XHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzZXBhcmF0b3InLFxuXHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3RydXN0ZWRFeHRlbnNpb24nLCAnVHJ1c3RlZCBieSBNaWNyb3NvZnQnKSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0YWRkZWRUcnVzdGVkU2VwYXJhdG9yID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0XHRsYWJlbDogYWxsb3dlZEV4dC5uYW1lLFxuXHRcdFx0XHRcdFx0b3duZXJJZCxcblx0XHRcdFx0XHRcdGlkOiBhbGxvd2VkRXh0LmlkLFxuXHRcdFx0XHRcdFx0cGlja2VkOiBhbGxvd2VkRXh0LmFsbG93ZWQgPz8gZmFsc2UsXG5cdFx0XHRcdFx0XHRleHRlbnNpb246IGFsbG93ZWRFeHQsXG5cdFx0XHRcdFx0XHRkaXNhYmxlZDogYWxsb3dlZEV4dC50cnVzdGVkLCAvLyBEb24ndCBhbGxvdyB0b2dnbGluZyB0cnVzdGVkIGV4dGVuc2lvbnNcblx0XHRcdFx0XHRcdGJ1dHRvbnM6IFt7XG5cdFx0XHRcdFx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uaW5mbyksXG5cdFx0XHRcdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdvcGVuRXh0ZW5zaW9uJywgJ09wZW4gRXh0ZW5zaW9uJyksXG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ25vQWxsb3dlZEV4dGVuc2lvbnMnLCAnTm8gZXh0ZW5zaW9ucyBoYXZlIGFjY2VzcycpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbm9BY2Nlc3NEZXNjcmlwdGlvbicsICdObyBleHRlbnNpb25zIGFyZSBjdXJyZW50bHkgYWxsb3dlZCB0byB1c2UgbW9kZWxzIGZyb20gezB9Jywgb3duZXJJZCksXG5cdFx0XHRcdFx0cGlja2FibGU6IGZhbHNlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFNob3cgdGhlIFF1aWNrUGlja1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soXG5cdFx0XHRpdGVtcyxcblx0XHRcdHtcblx0XHRcdFx0Y2FuUGlja01hbnk6IHRydWUsXG5cdFx0XHRcdHNvcnRCeUxhYmVsOiB0cnVlLFxuXHRcdFx0XHRvbkRpZFRyaWdnZXJTZXBhcmF0b3JCdXR0b24oY29udGV4dCkge1xuXHRcdFx0XHRcdC8vIEhhbmRsZSBzZXBhcmF0b3IgYnV0dG9uIGNsaWNrc1xuXHRcdFx0XHRcdGNvbnN0IGV4dElkID0gY29udGV4dC5zZXBhcmF0b3IuaWQ7XG5cdFx0XHRcdFx0aWYgKGV4dElkKSB7XG5cdFx0XHRcdFx0XHQvLyBPcGVuIHRoZSBleHRlbnNpb24gaW4gdGhlIGVkaXRvclxuXHRcdFx0XHRcdFx0dm9pZCBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuKGV4dElkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uRGlkVHJpZ2dlckl0ZW1CdXR0b24oY29udGV4dCkge1xuXHRcdFx0XHRcdC8vIEhhbmRsZSBpdGVtIGJ1dHRvbiBjbGlja3Ncblx0XHRcdFx0XHRjb25zdCBleHRJZCA9IGNvbnRleHQuaXRlbS5pZDtcblx0XHRcdFx0XHRpZiAoZXh0SWQpIHtcblx0XHRcdFx0XHRcdC8vIE9wZW4gdGhlIGV4dGVuc2lvbiBpbiB0aGUgZWRpdG9yXG5cdFx0XHRcdFx0XHR2b2lkIGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW4oZXh0SWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdsYW5ndWFnZU1vZGVsQXV0aFRpdGxlJywgJ01hbmFnZSBMYW5ndWFnZSBNb2RlbCBBY2Nlc3MnKSxcblx0XHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdsYW5ndWFnZU1vZGVsQXV0aFBsYWNlaG9sZGVyJywgJ0Nob29zZSB3aGljaCBleHRlbnNpb25zIGNhbiBhY2Nlc3MgbGFuZ3VhZ2UgbW9kZWxzJyksXG5cdFx0XHR9XG5cdFx0KTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgW293bmVySWQsIGFsbG93ZWRFeHRlbnNpb25zXSBvZiBleHRlbnNpb25BdXRoKSB7XG5cdFx0XHQvLyBkaWZmIHdpdGggcmVzdWx0IHRvIGZpbmQgb3V0IHdoaWNoIGV4dGVuc2lvbnMgYXJlIGFsbG93ZWQgb3Igbm90XG5cdFx0XHQvLyBidXQgd2UgbmVlZCB0byBvbmx5IGxvb2sgYXQgdGhlIHJlc3VsdCBpdGVtcyB0aGF0IGhhdmUgdGhlIG93bmVySWRcblx0XHRcdGNvbnN0IGFsbG93ZWRTZXQgPSBuZXcgU2V0KHJlc3VsdFxuXHRcdFx0XHQuZmlsdGVyKGl0ZW0gPT4gaXRlbS5vd25lcklkID09PSBvd25lcklkKVxuXHRcdFx0XHQvLyBvbmx5IHNhdmUgaXRlbXMgdGhhdCBhcmUgbm90IHRydXN0ZWQgYXV0b21hdGljYWxseVxuXHRcdFx0XHQuZmlsdGVyKGl0ZW0gPT4gIWl0ZW0uZXh0ZW5zaW9uPy50cnVzdGVkKVxuXHRcdFx0XHQubWFwKGl0ZW0gPT4gaXRlbS5pZCEpKTtcblxuXHRcdFx0Zm9yIChjb25zdCBhbGxvd2VkRXh0IG9mIGFsbG93ZWRFeHRlbnNpb25zKSB7XG5cdFx0XHRcdGFsbG93ZWRFeHQuYWxsb3dlZCA9IGFsbG93ZWRTZXQuaGFzKGFsbG93ZWRFeHQuaWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZEV4dGVuc2lvbnMoXG5cdFx0XHRcdElOVEVSTkFMX0FVVEhfUFJPVklERVJfUFJFRklYICsgb3duZXJJZCxcblx0XHRcdFx0b3duZXJUb0FjY291bnRMYWJlbC5nZXQob3duZXJJZCkgfHwgJ0xhbmd1YWdlIE1vZGVscycsXG5cdFx0XHRcdGFsbG93ZWRFeHRlbnNpb25zXG5cdFx0XHQpO1xuXHRcdH1cblxuXHR9XG59XG5cbmNsYXNzIENvbmZpZ3VyZUxhbmd1YWdlTW9kZWxzR3JvdXBBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdsbS5hZGRMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdsbS5jb25maWd1cmVHcm91cCcsICdBZGQgTGFuZ3VhZ2UgTW9kZWxzIEdyb3VwJyksXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cDogSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxhbmd1YWdlTW9kZWxzU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKTtcblxuXHRcdGlmICghbGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0xhbmd1YWdlIG1vZGVsIGdyb3VwIGlzIHJlcXVpcmVkJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBuYW1lLCB2ZW5kb3IsIC4uLmNvbmZpZ3VyYXRpb24gfSA9IGxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cDtcblx0XHRhd2FpdCBsYW5ndWFnZU1vZGVsc1NlcnZpY2UuYWRkTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKG5hbWUsIHZlbmRvciwgY29uZmlndXJhdGlvbik7XG5cdH1cbn1cblxuY2xhc3MgTWlncmF0ZUxhbmd1YWdlTW9kZWxzR3JvdXBBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdsbS5taWdyYXRlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbG0ubWlncmF0ZUdyb3VwJywgJ01pZ3JhdGUgTGFuZ3VhZ2UgTW9kZWxzIEdyb3VwJyksXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cDogSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxhbmd1YWdlTW9kZWxzU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKTtcblxuXHRcdGlmICghbGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0xhbmd1YWdlIG1vZGVsIGdyb3VwIGlzIHJlcXVpcmVkJyk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLm1pZ3JhdGVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAobGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJMYW5ndWFnZU1vZGVsQWN0aW9ucygpIHtcblx0cmVnaXN0ZXJBY3Rpb24yKE1hbmFnZUxhbmd1YWdlTW9kZWxBdXRoZW50aWNhdGlvbkFjdGlvbik7XG5cdHJlZ2lzdGVyQWN0aW9uMihDb25maWd1cmVMYW5ndWFnZU1vZGVsc0dyb3VwQWN0aW9uKTtcblx0cmVnaXN0ZXJBY3Rpb24yKE1pZ3JhdGVMYW5ndWFnZU1vZGVsc0dyb3VwQWN0aW9uKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsU0FBUyxRQUFRLHVCQUF1QjtBQUVqRCxTQUFTLDBCQUEwRDtBQUNuRSxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQTJCLHFDQUFxQztBQUNoRSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx1QkFBdUI7QUFHaEMsTUFBTSwyQ0FBTixNQUFNLGlEQUFnRCxRQUFRO0FBQUEsRUFHN0QsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUkseUNBQXdDO0FBQUEsTUFDNUMsT0FBTyxVQUFVLHFDQUFxQyxpQ0FBaUM7QUFBQSxNQUN2RixVQUFVO0FBQUEsTUFDVixjQUFjLGdCQUFnQjtBQUFBLE1BQzlCLE1BQU0sQ0FBQztBQUFBLFFBQ04sSUFBSSxPQUFPO0FBQUEsUUFDWCxPQUFPO0FBQUEsTUFDUixDQUFDO0FBQUEsTUFDRCxJQUFJO0FBQUEsSUFDTCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxJQUFJLFVBQTJDO0FBQ3BELFVBQU0sb0JBQW9CLFNBQVMsSUFBSSxrQkFBa0I7QUFDekQsVUFBTSx3QkFBd0IsU0FBUyxJQUFJLHNCQUFzQjtBQUNqRSxVQUFNLDhCQUE4QixTQUFTLElBQUksNEJBQTRCO0FBQzdFLFVBQU0sZ0JBQWdCLFNBQVMsSUFBSSxjQUFjO0FBQ2pELFVBQU0sbUJBQW1CLFNBQVMsSUFBSSxpQkFBaUI7QUFDdkQsVUFBTSw2QkFBNkIsU0FBUyxJQUFJLDJCQUEyQjtBQUMzRSxVQUFNLGlCQUFpQixTQUFTLElBQUksZUFB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
