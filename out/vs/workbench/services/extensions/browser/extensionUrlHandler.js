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
import { combinedDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IURLService } from "../../../../platform/url/common/url.js";
import { IHostService } from "../../host/browser/host.js";
import { ActivationKind, IExtensionService } from "../common/extensions.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IsWebContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { disposableWindowInterval } from "../../../../base/browser/dom.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { equalsIgnoreCase } from "../../../../base/common/strings.js";
const FIVE_MINUTES = 5 * 60 * 1e3;
const THIRTY_SECONDS = 30 * 1e3;
const URL_TO_HANDLE = "extensionUrlHandler.urlToHandle";
const USER_TRUSTED_EXTENSIONS_CONFIGURATION_KEY = "extensions.confirmedUriHandlerExtensionIds";
const USER_TRUSTED_EXTENSIONS_STORAGE_KEY = "extensionUrlHandler.confirmedExtensions";
function isExtensionId(value) {
  return /^[a-z0-9][a-z0-9\-]*\.[a-z0-9][a-z0-9\-]*$/i.test(value);
}
class UserTrustedExtensionIdStorage {
  constructor(storageService) {
    this.storageService = storageService;
  }
  get extensions() {
    const userTrustedExtensionIdsJson = this.storageService.get(USER_TRUSTED_EXTENSIONS_STORAGE_KEY, StorageScope.PROFILE, "[]");
    try {
      return JSON.parse(userTrustedExtensionIdsJson);
    } catch {
      return [];
    }
  }
  has(id) {
    return this.extensions.indexOf(id) > -1;
  }
  add(id) {
    this.set([...this.extensions, id]);
  }
  set(ids) {
    this.storageService.store(USER_TRUSTED_EXTENSIONS_STORAGE_KEY, JSON.stringify(ids), StorageScope.PROFILE, StorageTarget.MACHINE);
  }
}
const IExtensionUrlHandler = createDecorator("extensionUrlHandler");
class ExtensionUrlHandlerOverrideRegistry {
  static registerHandler(handler) {
    this.handlers.add(handler);
    return toDisposable(() => this.handlers.delete(handler));
  }
  static getHandler(uri) {
    for (const handler of this.handlers) {
      if (handler.canHandleURL(uri)) {
        return handler;
      }
    }
    return void 0;
  }
}
ExtensionUrlHandlerOverrideRegistry.handlers = /* @__PURE__ */ new Set();
let ExtensionUrlHandler = class {
  constructor(urlService, extensionService, dialogService, commandService, hostService, storageService, configurationService, notificationService, productService) {
    this.extensionService = extensionService;
    this.dialogService = dialogService;
    this.commandService = commandService;
    this.hostService = hostService;
    this.storageService = storageService;
    this.configurationService = configurationService;
    this.notificationService = notificationService;
    this.productService = productService;
    this.extensionHandlers = /* @__PURE__ */ new Map();
    this.uriBuffer = /* @__PURE__ */ new Map();
    this.userTrustedExtensionsStorage = new UserTrustedExtensionIdStorage(storageService);
    const interval = disposableWindowInterval(mainWindow, () => this.garbageCollect(), THIRTY_SECONDS);
    const urlToHandleValue = this.storageService.get(URL_TO_HANDLE, StorageScope.WORKSPACE);
    if (urlToHandleValue) {
      this.storageService.remove(URL_TO_HANDLE, StorageScope.WORKSPACE);
      this.handleURL(URI.revive(JSON.parse(urlToHandleValue)), { trusted: true });
    }
    const cache = ExtensionUrlBootstrapHandler.cache;
    const drainTimeout = setTimeout(() => cache.forEach(([uri, option]) => this.handleURL(uri, option)));
    this.disposable = combinedDisposable(
      urlService.registerHandler(this),
      interval,
      toDisposable(() => clearTimeout(drainTimeout))
    );
  }
  async handleURL(uri, options) {
    if (!isExtensionId(uri.authority)) {
      return false;
    }
    const overrideHandler = ExtensionUrlHandlerOverrideRegistry.getHandler(uri);
    const extensionId = uri.authority;
    const initialHandler = this.extensionHandlers.get(ExtensionIdentifier.toKey(extensionId));
    let extensionDisplayName;
    let extensionInstalled = !!initialHandler;
    if (!initialHandler) {
      const extension = await this.extensionService.getExtension(extensionId);
      extensionInstalled = !!extension;
      if (!extension && !overrideHandler) {
        await this.handleUnhandledURL(uri, extensionId, options);
        return true;
      }
      extensionDisplayName = extension?.displayName ?? extensionId;
    } else {
      extensionDisplayName = initialHandler.extensionDisplayName;
    }
    const trusted = options?.trusted || this.productService.trustedExtensionProtocolHandlers?.some((value) => equalsIgnoreCase(value, extensionId)) || this.didUserTrustExtension(ExtensionIdentifier.toKey(extensionId));
    if (!trusted) {
      const uriString = uri.toString(false);
      let uriLabel = uriString;
      if (uriLabel.length > 40) {
        uriLabel = `${uriLabel.substring(0, 30)}...${uriLabel.substring(uriLabel.length - 5)}`;
      }
      const result = await this.dialogService.confirm({
        message: localize("confirmUrl", "Allow '{0}' extension to open this URI?", extensionDisplayName),
        checkbox: {
          label: localize("rememberConfirmUrl", "Do not ask me again for this extension")
        },
        primaryButton: localize({ key: "open", comment: ["&& denotes a mnemonic"] }, "&&Open"),
        custom: {
          markdownDetails: [{
            markdown: new MarkdownString(`<div title="${uriString}" aria-label='${uriString}'>${uriLabel}</div>`, { supportHtml: true })
          }]
        }
      });
      if (!result.confirmed) {
        return true;
      }
      if (result.checkboxChecked) {
        this.userTrustedExtensionsStorage.add(ExtensionIdentifier.toKey(extensionId));
      }
    }
    if (overrideHandler) {
      const handled = await overrideHandler.handleURL(uri);
      if (handled) {
        return handled;
      }
    }
    if (!extensionInstalled) {
      await this.handleUnhandledURL(uri, extensionId, { ...options, trusted: true });
      return true;
    }
    const handler = this.extensionHandlers.get(ExtensionIdentifier.toKey(extensionId));
    if (handler) {
      if (!initialHandler) {
        return await this.handleURLByExtension(extensionId, handler, uri, options);
      }
      return false;
    }
    const timestamp = (/* @__PURE__ */ new Date()).getTime();
    let uris = this.uriBuffer.get(ExtensionIdentifier.toKey(extensionId));
    if (!uris) {
      uris = [];
      this.uriBuffer.set(ExtensionIdentifier.toKey(extensionId), uris);
    }
    uris.push({ timestamp, uri });
    await this.extensionService.activateByEvent(`onUri:${ExtensionIdentifier.toKey(extensionId)}`, ActivationKind.Immediate);
    return true;
  }
  registerExtensionHandler(extensionId, handler) {
    this.extensionHandlers.set(ExtensionIdentifier.toKey(extensionId), handler);
    const uris = this.uriBuffer.get(ExtensionIdentifier.toKey(extensionId)) || [];
    for (const { uri } of uris) {
      this.handleURLByExtension(extensionId, handler, uri);
    }
    this.uriBuffer.delete(ExtensionIdentifier.toKey(extensionId));
  }
  unregisterExtensionHandler(extensionId) {
    this.extensionHandlers.delete(ExtensionIdentifier.toKey(extensionId));
  }
  async handleURLByExtension(extensionId, handler, uri, options) {
    return await handler.handleURL(uri, options);
  }
  async handleUnhandledURL(uri, extensionId, options) {
    try {
      await this.commandService.executeCommand("workbench.extensions.installExtension", extensionId, {
        justification: {
          reason: `${localize("installDetail", "This extension wants to open a URI:")}
${uri.toString()}`,
          action: localize("openUri", "Open URI")
        },
        enable: true,
        installPreReleaseVersion: this.productService.quality !== "stable"
      });
    } catch (error) {
      if (!isCancellationError(error)) {
        this.notificationService.error(error);
      }
      return;
    }
    const extension = await this.extensionService.getExtension(extensionId);
    if (extension) {
      await this.handleURL(uri, { ...options, trusted: true });
    } else {
      const result = await this.dialogService.confirm({
        message: localize("reloadAndHandle", "Extension '{0}' is not loaded. Would you like to reload the window to load the extension and open the URL?", extensionId),
        primaryButton: localize({ key: "reloadAndOpen", comment: ["&& denotes a mnemonic"] }, "&&Reload Window and Open")
      });
      if (!result.confirmed) {
        return;
      }
      this.storageService.store(URL_TO_HANDLE, JSON.stringify(uri.toJSON()), StorageScope.WORKSPACE, StorageTarget.MACHINE);
      await this.hostService.reload();
    }
  }
  // forget about all uris buffered more than 5 minutes ago
  garbageCollect() {
    const now = (/* @__PURE__ */ new Date()).getTime();
    const uriBuffer = /* @__PURE__ */ new Map();
    this.uriBuffer.forEach((uris, extensionId) => {
      uris = uris.filter(({ timestamp }) => now - timestamp < FIVE_MINUTES);
      if (uris.length > 0) {
        uriBuffer.set(extensionId, uris);
      }
    });
    this.uriBuffer = uriBuffer;
  }
  didUserTrustExtension(id) {
    if (this.userTrustedExtensionsStorage.has(id)) {
      return true;
    }
    return this.getConfirmedTrustedExtensionIdsFromConfiguration().indexOf(id) > -1;
  }
  getConfirmedTrustedExtensionIdsFromConfiguration() {
    const trustedExtensionIds = this.configurationService.getValue(USER_TRUSTED_EXTENSIONS_CONFIGURATION_KEY);
    if (!Array.isArray(trustedExtensionIds)) {
      return [];
    }
    return trustedExtensionIds;
  }
  dispose() {
    this.disposable.dispose();
    this.extensionHandlers.clear();
    this.uriBuffer.clear();
  }
};
ExtensionUrlHandler = __decorateClass([
  __decorateParam(0, IURLService),
  __decorateParam(1, IExtensionService),
  __decorateParam(2, IDialogService),
  __decorateParam(3, ICommandService),
  __decorateParam(4, IHostService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, INotificationService),
  __decorateParam(8, IProductService)
], ExtensionUrlHandler);
registerSingleton(IExtensionUrlHandler, ExtensionUrlHandler, InstantiationType.Eager);
let ExtensionUrlBootstrapHandler = class {
  static get cache() {
    ExtensionUrlBootstrapHandler.disposable.dispose();
    const result = ExtensionUrlBootstrapHandler._cache;
    ExtensionUrlBootstrapHandler._cache = [];
    return result;
  }
  constructor(urlService) {
    ExtensionUrlBootstrapHandler.disposable = urlService.registerHandler(this);
  }
  async handleURL(uri, options) {
    if (!isExtensionId(uri.authority)) {
      return false;
    }
    ExtensionUrlBootstrapHandler._cache.push([uri, options]);
    return true;
  }
};
ExtensionUrlBootstrapHandler.ID = "workbench.contrib.extensionUrlBootstrapHandler";
ExtensionUrlBootstrapHandler._cache = [];
ExtensionUrlBootstrapHandler = __decorateClass([
  __decorateParam(0, IURLService)
], ExtensionUrlBootstrapHandler);
registerWorkbenchContribution2(
  ExtensionUrlBootstrapHandler.ID,
  ExtensionUrlBootstrapHandler,
  WorkbenchPhase.BlockRestore
  /* registration only */
);
class ManageAuthorizedExtensionURIsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.extensions.action.manageAuthorizedExtensionURIs",
      title: localize2("manage", "Manage Authorized Extension URIs..."),
      category: localize2("extensions", "Extensions"),
      menu: {
        id: MenuId.CommandPalette,
        when: IsWebContext.toNegated()
      }
    });
  }
  async run(accessor) {
    const storageService = accessor.get(IStorageService);
    const quickInputService = accessor.get(IQuickInputService);
    const storage = new UserTrustedExtensionIdStorage(storageService);
    const items = storage.extensions.map((label) => ({ label, picked: true }));
    if (items.length === 0) {
      await quickInputService.pick([{ label: localize("no", "There are currently no authorized extension URIs.") }]);
      return;
    }
    const result = await quickInputService.pick(items, { canPickMany: true });
    if (!result) {
      return;
    }
    storage.set(result.map((item) => item.label));
  }
}
registerAction2(ManageAuthorizedExtensionURIsAction);
export {
  ExtensionUrlHandlerOverrideRegistry,
  IExtensionUrlHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxleHRlbnNpb25zXFxicm93c2VyXFxleHRlbnNpb25VcmxIYW5kbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgY29tYmluZWREaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElVUkxIYW5kbGVyLCBJVVJMU2VydmljZSwgSU9wZW5VUkxPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJsL2NvbW1vbi91cmwuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgQWN0aXZhdGlvbktpbmQsIElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZSwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElzV2ViQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGRpc3Bvc2FibGVXaW5kb3dJbnRlcnZhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IGVxdWFsc0lnbm9yZUNhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcblxuY29uc3QgRklWRV9NSU5VVEVTID0gNSAqIDYwICogMTAwMDtcbmNvbnN0IFRISVJUWV9TRUNPTkRTID0gMzAgKiAxMDAwO1xuY29uc3QgVVJMX1RPX0hBTkRMRSA9ICdleHRlbnNpb25VcmxIYW5kbGVyLnVybFRvSGFuZGxlJztcbmNvbnN0IFVTRVJfVFJVU1RFRF9FWFRFTlNJT05TX0NPTkZJR1VSQVRJT05fS0VZID0gJ2V4dGVuc2lvbnMuY29uZmlybWVkVXJpSGFuZGxlckV4dGVuc2lvbklkcyc7XG5jb25zdCBVU0VSX1RSVVNURURfRVhURU5TSU9OU19TVE9SQUdFX0tFWSA9ICdleHRlbnNpb25VcmxIYW5kbGVyLmNvbmZpcm1lZEV4dGVuc2lvbnMnO1xuXG5mdW5jdGlvbiBpc0V4dGVuc2lvbklkKHZhbHVlOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIC9eW2EtejAtOV1bYS16MC05XFwtXSpcXC5bYS16MC05XVthLXowLTlcXC1dKiQvaS50ZXN0KHZhbHVlKTtcbn1cblxuY2xhc3MgVXNlclRydXN0ZWRFeHRlbnNpb25JZFN0b3JhZ2Uge1xuXG5cdGdldCBleHRlbnNpb25zKCk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCB1c2VyVHJ1c3RlZEV4dGVuc2lvbklkc0pzb24gPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChVU0VSX1RSVVNURURfRVhURU5TSU9OU19TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsICdbXScpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBKU09OLnBhcnNlKHVzZXJUcnVzdGVkRXh0ZW5zaW9uSWRzSnNvbik7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlKSB7IH1cblxuXHRoYXMoaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnMuaW5kZXhPZihpZCkgPiAtMTtcblx0fVxuXG5cdGFkZChpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5zZXQoWy4uLnRoaXMuZXh0ZW5zaW9ucywgaWRdKTtcblx0fVxuXG5cdHNldChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShVU0VSX1RSVVNURURfRVhURU5TSU9OU19TVE9SQUdFX0tFWSwgSlNPTi5zdHJpbmdpZnkoaWRzKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IElFeHRlbnNpb25VcmxIYW5kbGVyID0gY3JlYXRlRGVjb3JhdG9yPElFeHRlbnNpb25VcmxIYW5kbGVyPignZXh0ZW5zaW9uVXJsSGFuZGxlcicpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRlbnNpb25Db250cmlidXRlZFVSTEhhbmRsZXIgZXh0ZW5kcyBJVVJMSGFuZGxlciB7XG5cdGV4dGVuc2lvbkRpc3BsYXlOYW1lOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvblVybEhhbmRsZXIge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlZ2lzdGVyRXh0ZW5zaW9uSGFuZGxlcihleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgaGFuZGxlcjogSUV4dGVuc2lvbkNvbnRyaWJ1dGVkVVJMSGFuZGxlcik6IHZvaWQ7XG5cdHVucmVnaXN0ZXJFeHRlbnNpb25IYW5kbGVyKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyKTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRXh0ZW5zaW9uVXJsSGFuZGxlck92ZXJyaWRlIHtcblx0Y2FuSGFuZGxlVVJMKHVyaTogVVJJKTogYm9vbGVhbjtcblx0aGFuZGxlVVJMKHVyaTogVVJJKTogUHJvbWlzZTxib29sZWFuPjtcbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvblVybEhhbmRsZXJPdmVycmlkZVJlZ2lzdHJ5IHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBoYW5kbGVycyA9IG5ldyBTZXQ8SUV4dGVuc2lvblVybEhhbmRsZXJPdmVycmlkZT4oKTtcblxuXHRzdGF0aWMgcmVnaXN0ZXJIYW5kbGVyKGhhbmRsZXI6IElFeHRlbnNpb25VcmxIYW5kbGVyT3ZlcnJpZGUpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5oYW5kbGVycy5hZGQoaGFuZGxlcik7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuaGFuZGxlcnMuZGVsZXRlKGhhbmRsZXIpKTtcblx0fVxuXG5cdHN0YXRpYyBnZXRIYW5kbGVyKHVyaTogVVJJKTogSUV4dGVuc2lvblVybEhhbmRsZXJPdmVycmlkZSB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBoYW5kbGVyIG9mIHRoaXMuaGFuZGxlcnMpIHtcblx0XHRcdGlmIChoYW5kbGVyLmNhbkhhbmRsZVVSTCh1cmkpKSB7XG5cdFx0XHRcdHJldHVybiBoYW5kbGVyO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuLyoqXG4gKiBUaGlzIGNsYXNzIGhhbmRsZXMgVVJMcyB3aGljaCBhcmUgZGlyZWN0ZWQgdG93YXJkcyBleHRlbnNpb25zLlxuICogSWYgYSBVUkwgaXMgZGlyZWN0ZWQgdG93YXJkcyBhbiBpbmFjdGl2ZSBleHRlbnNpb24sIGl0IGJ1ZmZlcnMgaXQsXG4gKiBhY3RpdmF0ZXMgdGhlIGV4dGVuc2lvbiBhbmQgcmUtb3BlbnMgdGhlIFVSTCBvbmNlIHRoZSBleHRlbnNpb24gcmVnaXN0ZXJzXG4gKiBhIFVSTCBoYW5kbGVyLiBJZiB0aGUgZXh0ZW5zaW9uIG5ldmVyIHJlZ2lzdGVycyBhIFVSTCBoYW5kbGVyLCB0aGUgdXJsc1xuICogd2lsbCBldmVudHVhbGx5IGJlIGdhcmJhZ2UgY29sbGVjdGVkLlxuICpcbiAqIEl0IGFsc28gbWFrZXMgc3VyZSB0aGUgdXNlciBjb25maXJtcyBvcGVuaW5nIFVSTHMgZGlyZWN0ZWQgdG93YXJkcyBleHRlbnNpb25zLlxuICovXG5jbGFzcyBFeHRlbnNpb25VcmxIYW5kbGVyIGltcGxlbWVudHMgSUV4dGVuc2lvblVybEhhbmRsZXIsIElVUkxIYW5kbGVyIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBleHRlbnNpb25IYW5kbGVycyA9IG5ldyBNYXA8c3RyaW5nLCBJRXh0ZW5zaW9uQ29udHJpYnV0ZWRVUkxIYW5kbGVyPigpO1xuXHRwcml2YXRlIHVyaUJ1ZmZlciA9IG5ldyBNYXA8c3RyaW5nLCB7IHRpbWVzdGFtcDogbnVtYmVyOyB1cmk6IFVSSSB9W10+KCk7XG5cdHByaXZhdGUgdXNlclRydXN0ZWRFeHRlbnNpb25zU3RvcmFnZTogVXNlclRydXN0ZWRFeHRlbnNpb25JZFN0b3JhZ2U7XG5cdHByaXZhdGUgZGlzcG9zYWJsZTogSURpc3Bvc2FibGU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElVUkxTZXJ2aWNlIHVybFNlcnZpY2U6IElVUkxTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLnVzZXJUcnVzdGVkRXh0ZW5zaW9uc1N0b3JhZ2UgPSBuZXcgVXNlclRydXN0ZWRFeHRlbnNpb25JZFN0b3JhZ2Uoc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgaW50ZXJ2YWwgPSBkaXNwb3NhYmxlV2luZG93SW50ZXJ2YWwobWFpbldpbmRvdywgKCkgPT4gdGhpcy5nYXJiYWdlQ29sbGVjdCgpLCBUSElSVFlfU0VDT05EUyk7XG5cdFx0Y29uc3QgdXJsVG9IYW5kbGVWYWx1ZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFVSTF9UT19IQU5ETEUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdGlmICh1cmxUb0hhbmRsZVZhbHVlKSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShVUkxfVE9fSEFORExFLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRcdHRoaXMuaGFuZGxlVVJMKFVSSS5yZXZpdmUoSlNPTi5wYXJzZSh1cmxUb0hhbmRsZVZhbHVlKSksIHsgdHJ1c3RlZDogdHJ1ZSB9KTtcblx0XHR9XG5cblx0XHRjb25zdCBjYWNoZSA9IEV4dGVuc2lvblVybEJvb3RzdHJhcEhhbmRsZXIuY2FjaGU7XG5cdFx0Y29uc3QgZHJhaW5UaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiBjYWNoZS5mb3JFYWNoKChbdXJpLCBvcHRpb25dKSA9PiB0aGlzLmhhbmRsZVVSTCh1cmksIG9wdGlvbikpKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZSA9IGNvbWJpbmVkRGlzcG9zYWJsZShcblx0XHRcdHVybFNlcnZpY2UucmVnaXN0ZXJIYW5kbGVyKHRoaXMpLFxuXHRcdFx0aW50ZXJ2YWwsXG5cdFx0XHR0b0Rpc3Bvc2FibGUoKCkgPT4gY2xlYXJUaW1lb3V0KGRyYWluVGltZW91dCkpXG5cdFx0KTtcblx0fVxuXG5cdGFzeW5jIGhhbmRsZVVSTCh1cmk6IFVSSSwgb3B0aW9ucz86IElPcGVuVVJMT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICghaXNFeHRlbnNpb25JZCh1cmkuYXV0aG9yaXR5KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IG92ZXJyaWRlSGFuZGxlciA9IEV4dGVuc2lvblVybEhhbmRsZXJPdmVycmlkZVJlZ2lzdHJ5LmdldEhhbmRsZXIodXJpKTtcblx0XHRjb25zdCBleHRlbnNpb25JZCA9IHVyaS5hdXRob3JpdHk7XG5cblx0XHRjb25zdCBpbml0aWFsSGFuZGxlciA9IHRoaXMuZXh0ZW5zaW9uSGFuZGxlcnMuZ2V0KEV4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZXh0ZW5zaW9uSWQpKTtcblx0XHRsZXQgZXh0ZW5zaW9uRGlzcGxheU5hbWU6IHN0cmluZztcblx0XHRsZXQgZXh0ZW5zaW9uSW5zdGFsbGVkID0gISFpbml0aWFsSGFuZGxlcjtcblxuXHRcdGlmICghaW5pdGlhbEhhbmRsZXIpIHtcblx0XHRcdC8vIFRoZSBleHRlbnNpb24gaXMgbm90IHlldCBhY3RpdmF0ZWQsIHNvIGxldCdzIGNoZWNrIGlmIGl0IGlzIGluc3RhbGxlZCBhbmQgZW5hYmxlZFxuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gYXdhaXQgdGhpcy5leHRlbnNpb25TZXJ2aWNlLmdldEV4dGVuc2lvbihleHRlbnNpb25JZCk7XG5cdFx0XHRleHRlbnNpb25JbnN0YWxsZWQgPSAhIWV4dGVuc2lvbjtcblx0XHRcdGlmICghZXh0ZW5zaW9uICYmICFvdmVycmlkZUhhbmRsZXIpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5oYW5kbGVVbmhhbmRsZWRVUkwodXJpLCBleHRlbnNpb25JZCwgb3B0aW9ucyk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0ZXh0ZW5zaW9uRGlzcGxheU5hbWUgPSBleHRlbnNpb24/LmRpc3BsYXlOYW1lID8/IGV4dGVuc2lvbklkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRleHRlbnNpb25EaXNwbGF5TmFtZSA9IGluaXRpYWxIYW5kbGVyLmV4dGVuc2lvbkRpc3BsYXlOYW1lO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRydXN0ZWQgPSBvcHRpb25zPy50cnVzdGVkXG5cdFx0XHR8fCB0aGlzLnByb2R1Y3RTZXJ2aWNlLnRydXN0ZWRFeHRlbnNpb25Qcm90b2NvbEhhbmRsZXJzPy5zb21lKHZhbHVlID0+IGVxdWFsc0lnbm9yZUNhc2UodmFsdWUsIGV4dGVuc2lvbklkKSlcblx0XHRcdHx8IHRoaXMuZGlkVXNlclRydXN0RXh0ZW5zaW9uKEV4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZXh0ZW5zaW9uSWQpKTtcblxuXHRcdGlmICghdHJ1c3RlZCkge1xuXHRcdFx0Y29uc3QgdXJpU3RyaW5nID0gdXJpLnRvU3RyaW5nKGZhbHNlKTtcblx0XHRcdGxldCB1cmlMYWJlbCA9IHVyaVN0cmluZztcblxuXHRcdFx0aWYgKHVyaUxhYmVsLmxlbmd0aCA+IDQwKSB7XG5cdFx0XHRcdHVyaUxhYmVsID0gYCR7dXJpTGFiZWwuc3Vic3RyaW5nKDAsIDMwKX0uLi4ke3VyaUxhYmVsLnN1YnN0cmluZyh1cmlMYWJlbC5sZW5ndGggLSA1KX1gO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjb25maXJtVXJsJywgXCJBbGxvdyAnezB9JyBleHRlbnNpb24gdG8gb3BlbiB0aGlzIFVSST9cIiwgZXh0ZW5zaW9uRGlzcGxheU5hbWUpLFxuXHRcdFx0XHRjaGVja2JveDoge1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncmVtZW1iZXJDb25maXJtVXJsJywgXCJEbyBub3QgYXNrIG1lIGFnYWluIGZvciB0aGlzIGV4dGVuc2lvblwiKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICdvcGVuJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmT3BlblwiKSxcblx0XHRcdFx0Y3VzdG9tOiB7XG5cdFx0XHRcdFx0bWFya2Rvd25EZXRhaWxzOiBbe1xuXHRcdFx0XHRcdFx0bWFya2Rvd246IG5ldyBNYXJrZG93blN0cmluZyhgPGRpdiB0aXRsZT1cIiR7dXJpU3RyaW5nfVwiIGFyaWEtbGFiZWw9JyR7dXJpU3RyaW5nfSc+JHt1cmlMYWJlbH08L2Rpdj5gLCB7IHN1cHBvcnRIdG1sOiB0cnVlIH0pLFxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoIXJlc3VsdC5jb25maXJtZWQpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXN1bHQuY2hlY2tib3hDaGVja2VkKSB7XG5cdFx0XHRcdHRoaXMudXNlclRydXN0ZWRFeHRlbnNpb25zU3RvcmFnZS5hZGQoRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShleHRlbnNpb25JZCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChvdmVycmlkZUhhbmRsZXIpIHtcblx0XHRcdGNvbnN0IGhhbmRsZWQgPSBhd2FpdCBvdmVycmlkZUhhbmRsZXIuaGFuZGxlVVJMKHVyaSk7XG5cdFx0XHRpZiAoaGFuZGxlZCkge1xuXHRcdFx0XHRyZXR1cm4gaGFuZGxlZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWV4dGVuc2lvbkluc3RhbGxlZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5oYW5kbGVVbmhhbmRsZWRVUkwodXJpLCBleHRlbnNpb25JZCwgeyAuLi5vcHRpb25zLCB0cnVzdGVkOiB0cnVlIH0pO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFuZGxlciA9IHRoaXMuZXh0ZW5zaW9uSGFuZGxlcnMuZ2V0KEV4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZXh0ZW5zaW9uSWQpKTtcblxuXHRcdGlmIChoYW5kbGVyKSB7XG5cdFx0XHRpZiAoIWluaXRpYWxIYW5kbGVyKSB7XG5cdFx0XHRcdC8vIGZvcndhcmQgaXQgZGlyZWN0bHlcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuaGFuZGxlVVJMQnlFeHRlbnNpb24oZXh0ZW5zaW9uSWQsIGhhbmRsZXIsIHVyaSwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGxldCB0aGUgRXh0ZW5zaW9uVXJsSGFuZGxlciBpbnN0YW5jZSBoYW5kbGUgdGhpc1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIGNvbGxlY3QgVVJJIGZvciBldmVudHVhbCBleHRlbnNpb24gYWN0aXZhdGlvblxuXHRcdGNvbnN0IHRpbWVzdGFtcCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXHRcdGxldCB1cmlzID0gdGhpcy51cmlCdWZmZXIuZ2V0KEV4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZXh0ZW5zaW9uSWQpKTtcblxuXHRcdGlmICghdXJpcykge1xuXHRcdFx0dXJpcyA9IFtdO1xuXHRcdFx0dGhpcy51cmlCdWZmZXIuc2V0KEV4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZXh0ZW5zaW9uSWQpLCB1cmlzKTtcblx0XHR9XG5cblx0XHR1cmlzLnB1c2goeyB0aW1lc3RhbXAsIHVyaSB9KTtcblxuXHRcdC8vIGFjdGl2YXRlIHRoZSBleHRlbnNpb24gdXNpbmcgQWN0aXZhdGlvbktpbmQuSW1tZWRpYXRlIGJlY2F1c2UgVVJJIGhhbmRsaW5nIG1pZ2h0IGJlIHBhcnRcblx0XHQvLyBvZiByZXNvbHZpbmcgYXV0aG9yaXRpZXMgKHZpYSBhdXRoZW50aWNhdGlvbiBleHRlbnNpb25zKVxuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0ZUJ5RXZlbnQoYG9uVXJpOiR7RXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShleHRlbnNpb25JZCl9YCwgQWN0aXZhdGlvbktpbmQuSW1tZWRpYXRlKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHJlZ2lzdGVyRXh0ZW5zaW9uSGFuZGxlcihleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgaGFuZGxlcjogSUV4dGVuc2lvbkNvbnRyaWJ1dGVkVVJMSGFuZGxlcik6IHZvaWQge1xuXHRcdHRoaXMuZXh0ZW5zaW9uSGFuZGxlcnMuc2V0KEV4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZXh0ZW5zaW9uSWQpLCBoYW5kbGVyKTtcblxuXHRcdGNvbnN0IHVyaXMgPSB0aGlzLnVyaUJ1ZmZlci5nZXQoRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShleHRlbnNpb25JZCkpIHx8IFtdO1xuXG5cdFx0Zm9yIChjb25zdCB7IHVyaSB9IG9mIHVyaXMpIHtcblx0XHRcdHRoaXMuaGFuZGxlVVJMQnlFeHRlbnNpb24oZXh0ZW5zaW9uSWQsIGhhbmRsZXIsIHVyaSk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cmlCdWZmZXIuZGVsZXRlKEV4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZXh0ZW5zaW9uSWQpKTtcblx0fVxuXG5cdHVucmVnaXN0ZXJFeHRlbnNpb25IYW5kbGVyKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyKTogdm9pZCB7XG5cdFx0dGhpcy5leHRlbnNpb25IYW5kbGVycy5kZWxldGUoRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShleHRlbnNpb25JZCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVVUkxCeUV4dGVuc2lvbihleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciB8IHN0cmluZywgaGFuZGxlcjogSVVSTEhhbmRsZXIsIHVyaTogVVJJLCBvcHRpb25zPzogSU9wZW5VUkxPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIGF3YWl0IGhhbmRsZXIuaGFuZGxlVVJMKHVyaSwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZVVuaGFuZGxlZFVSTCh1cmk6IFVSSSwgZXh0ZW5zaW9uSWQ6IHN0cmluZywgb3B0aW9ucz86IElPcGVuVVJMT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5pbnN0YWxsRXh0ZW5zaW9uJywgZXh0ZW5zaW9uSWQsIHtcblx0XHRcdFx0anVzdGlmaWNhdGlvbjoge1xuXHRcdFx0XHRcdHJlYXNvbjogYCR7bG9jYWxpemUoJ2luc3RhbGxEZXRhaWwnLCBcIlRoaXMgZXh0ZW5zaW9uIHdhbnRzIHRvIG9wZW4gYSBVUkk6XCIpfVxcbiR7dXJpLnRvU3RyaW5nKCl9YCxcblx0XHRcdFx0XHRhY3Rpb246IGxvY2FsaXplKCdvcGVuVXJpJywgXCJPcGVuIFVSSVwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRlbmFibGU6IHRydWUsXG5cdFx0XHRcdGluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbjogdGhpcy5wcm9kdWN0U2VydmljZS5xdWFsaXR5ICE9PSAnc3RhYmxlJ1xuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlcnJvcikpIHtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb24gPSBhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2UuZ2V0RXh0ZW5zaW9uKGV4dGVuc2lvbklkKTtcblxuXHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdGF3YWl0IHRoaXMuaGFuZGxlVVJMKHVyaSwgeyAuLi5vcHRpb25zLCB0cnVzdGVkOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdC8qIEV4dGVuc2lvbiBjYW5ub3QgYmUgYWRkZWQgYW5kIHJlcXVpcmUgd2luZG93IHJlbG9hZCAqL1xuXHRcdGVsc2Uge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgncmVsb2FkQW5kSGFuZGxlJywgXCJFeHRlbnNpb24gJ3swfScgaXMgbm90IGxvYWRlZC4gV291bGQgeW91IGxpa2UgdG8gcmVsb2FkIHRoZSB3aW5kb3cgdG8gbG9hZCB0aGUgZXh0ZW5zaW9uIGFuZCBvcGVuIHRoZSBVUkw/XCIsIGV4dGVuc2lvbklkKSxcblx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICdyZWxvYWRBbmRPcGVuJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmUmVsb2FkIFdpbmRvdyBhbmQgT3BlblwiKVxuXHRcdFx0fSk7XG5cblx0XHRcdGlmICghcmVzdWx0LmNvbmZpcm1lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoVVJMX1RPX0hBTkRMRSwgSlNPTi5zdHJpbmdpZnkodXJpLnRvSlNPTigpKSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdGF3YWl0IHRoaXMuaG9zdFNlcnZpY2UucmVsb2FkKCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gZm9yZ2V0IGFib3V0IGFsbCB1cmlzIGJ1ZmZlcmVkIG1vcmUgdGhhbiA1IG1pbnV0ZXMgYWdvXG5cdHByaXZhdGUgZ2FyYmFnZUNvbGxlY3QoKTogdm9pZCB7XG5cdFx0Y29uc3Qgbm93ID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5cdFx0Y29uc3QgdXJpQnVmZmVyID0gbmV3IE1hcDxzdHJpbmcsIHsgdGltZXN0YW1wOiBudW1iZXI7IHVyaTogVVJJIH1bXT4oKTtcblxuXHRcdHRoaXMudXJpQnVmZmVyLmZvckVhY2goKHVyaXMsIGV4dGVuc2lvbklkKSA9PiB7XG5cdFx0XHR1cmlzID0gdXJpcy5maWx0ZXIoKHsgdGltZXN0YW1wIH0pID0+IG5vdyAtIHRpbWVzdGFtcCA8IEZJVkVfTUlOVVRFUyk7XG5cblx0XHRcdGlmICh1cmlzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dXJpQnVmZmVyLnNldChleHRlbnNpb25JZCwgdXJpcyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnVyaUJ1ZmZlciA9IHVyaUJ1ZmZlcjtcblx0fVxuXG5cdHByaXZhdGUgZGlkVXNlclRydXN0RXh0ZW5zaW9uKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy51c2VyVHJ1c3RlZEV4dGVuc2lvbnNTdG9yYWdlLmhhcyhpZCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmdldENvbmZpcm1lZFRydXN0ZWRFeHRlbnNpb25JZHNGcm9tQ29uZmlndXJhdGlvbigpLmluZGV4T2YoaWQpID4gLTE7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbmZpcm1lZFRydXN0ZWRFeHRlbnNpb25JZHNGcm9tQ29uZmlndXJhdGlvbigpOiBBcnJheTxzdHJpbmc+IHtcblx0XHRjb25zdCB0cnVzdGVkRXh0ZW5zaW9uSWRzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShVU0VSX1RSVVNURURfRVhURU5TSU9OU19DT05GSUdVUkFUSU9OX0tFWSk7XG5cblx0XHRpZiAoIUFycmF5LmlzQXJyYXkodHJ1c3RlZEV4dGVuc2lvbklkcykpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1c3RlZEV4dGVuc2lvbklkcztcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmV4dGVuc2lvbkhhbmRsZXJzLmNsZWFyKCk7XG5cdFx0dGhpcy51cmlCdWZmZXIuY2xlYXIoKTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJRXh0ZW5zaW9uVXJsSGFuZGxlciwgRXh0ZW5zaW9uVXJsSGFuZGxlciwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xuXG4vKipcbiAqIFRoaXMgY2xhc3MgaGFuZGxlcyBVUkxzIGJlZm9yZSBgRXh0ZW5zaW9uVXJsSGFuZGxlcmAgaXMgaW5zdGFudGlhdGVkLlxuICogTW9yZSBpbmZvOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNzMxMDFcbiAqL1xuY2xhc3MgRXh0ZW5zaW9uVXJsQm9vdHN0cmFwSGFuZGxlciBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24sIElVUkxIYW5kbGVyIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuZXh0ZW5zaW9uVXJsQm9vdHN0cmFwSGFuZGxlcic7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NhY2hlOiBbVVJJLCBJT3BlblVSTE9wdGlvbnMgfCB1bmRlZmluZWRdW10gPSBbXTtcblx0cHJpdmF0ZSBzdGF0aWMgZGlzcG9zYWJsZTogSURpc3Bvc2FibGU7XG5cblx0c3RhdGljIGdldCBjYWNoZSgpOiBbVVJJLCBJT3BlblVSTE9wdGlvbnMgfCB1bmRlZmluZWRdW10ge1xuXHRcdEV4dGVuc2lvblVybEJvb3RzdHJhcEhhbmRsZXIuZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBFeHRlbnNpb25VcmxCb290c3RyYXBIYW5kbGVyLl9jYWNoZTtcblx0XHRFeHRlbnNpb25VcmxCb290c3RyYXBIYW5kbGVyLl9jYWNoZSA9IFtdO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihASVVSTFNlcnZpY2UgdXJsU2VydmljZTogSVVSTFNlcnZpY2UpIHtcblx0XHRFeHRlbnNpb25VcmxCb290c3RyYXBIYW5kbGVyLmRpc3Bvc2FibGUgPSB1cmxTZXJ2aWNlLnJlZ2lzdGVySGFuZGxlcih0aGlzKTtcblx0fVxuXG5cdGFzeW5jIGhhbmRsZVVSTCh1cmk6IFVSSSwgb3B0aW9ucz86IElPcGVuVVJMT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICghaXNFeHRlbnNpb25JZCh1cmkuYXV0aG9yaXR5KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdEV4dGVuc2lvblVybEJvb3RzdHJhcEhhbmRsZXIuX2NhY2hlLnB1c2goW3VyaSwgb3B0aW9uc10pO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihFeHRlbnNpb25VcmxCb290c3RyYXBIYW5kbGVyLklELCBFeHRlbnNpb25VcmxCb290c3RyYXBIYW5kbGVyLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUgLyogcmVnaXN0cmF0aW9uIG9ubHkgKi8pO1xuXG5jbGFzcyBNYW5hZ2VBdXRob3JpemVkRXh0ZW5zaW9uVVJJc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLm1hbmFnZUF1dGhvcml6ZWRFeHRlbnNpb25VUklzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21hbmFnZScsICdNYW5hZ2UgQXV0aG9yaXplZCBFeHRlbnNpb24gVVJJcy4uLicpLFxuXHRcdFx0Y2F0ZWdvcnk6IGxvY2FsaXplMignZXh0ZW5zaW9ucycsICdFeHRlbnNpb25zJyksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IElzV2ViQ29udGV4dC50b05lZ2F0ZWQoKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSBuZXcgVXNlclRydXN0ZWRFeHRlbnNpb25JZFN0b3JhZ2Uoc3RvcmFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGl0ZW1zID0gc3RvcmFnZS5leHRlbnNpb25zLm1hcCgobGFiZWwpOiBJUXVpY2tQaWNrSXRlbSA9PiAoeyBsYWJlbCwgcGlja2VkOiB0cnVlIH0pKTtcblxuXHRcdGlmIChpdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soW3sgbGFiZWw6IGxvY2FsaXplKCdubycsICdUaGVyZSBhcmUgY3VycmVudGx5IG5vIGF1dGhvcml6ZWQgZXh0ZW5zaW9uIFVSSXMuJykgfV0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soaXRlbXMsIHsgY2FuUGlja01hbnk6IHRydWUgfSk7XG5cblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHN0b3JhZ2Uuc2V0KHJlc3VsdC5tYXAoaXRlbSA9PiBpdGVtLmxhYmVsKSk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKE1hbmFnZUF1dGhvcml6ZWRFeHRlbnNpb25VUklzQWN0aW9uKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFzQixvQkFBb0Isb0JBQW9CO0FBQzlELFNBQVMsV0FBVztBQUNwQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUF5QztBQUNsRCxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFzQixt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
