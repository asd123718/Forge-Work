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
import { Codicon } from "../../../../../base/common/codicons.js";
import { TimeoutTimer } from "../../../../../base/common/async.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { localize2 } from "../../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { IExtensionGalleryService } from "../../../../../platform/extensionManagement/common/extensionManagement.js";
import { ICommandService, CommandsRegistry } from "../../../../../platform/commands/common/commands.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { IWorkbenchExtensionManagementService } from "../../../../services/extensionManagement/common/extensionManagement.js";
import { CHAT_CATEGORY } from "./chatActions.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { ChatAgentLocation } from "../../common/constants.js";
import { IChatService } from "../../common/chatService/chatService.js";
const INSTALL_CONTEXT_PREFIX = "chat.installRecommendationAvailable";
let ChatAgentRecommendation = class extends Disposable {
  constructor(productService, extensionGalleryService, extensionManagementService, contextKeyService) {
    super();
    this.productService = productService;
    this.extensionGalleryService = extensionGalleryService;
    this.extensionManagementService = extensionManagementService;
    this.contextKeyService = contextKeyService;
    this.availabilityContextKeys = /* @__PURE__ */ new Map();
    this.refreshRequestId = 0;
    const recommendations = this.productService.chatSessionRecommendations;
    if (!recommendations?.length || !this.extensionGalleryService.isEnabled()) {
      return;
    }
    for (const recommendation of recommendations) {
      this.registerRecommendation(recommendation);
    }
    const refresh = () => this.refreshInstallAvailability();
    this._register(this.extensionManagementService.onProfileAwareDidInstallExtensions(refresh));
    this._register(this.extensionManagementService.onProfileAwareDidUninstallExtension(refresh));
    this._register(this.extensionManagementService.onDidChangeProfile(refresh));
    this.refreshInstallAvailability();
  }
  registerRecommendation(recommendation) {
    const extensionKey = ExtensionIdentifier.toKey(recommendation.extensionId);
    const commandId = `chat.installRecommendation.${extensionKey}.${recommendation.name}`;
    const availabilityContextId = `${INSTALL_CONTEXT_PREFIX}.${extensionKey}`;
    const availabilityContext = new RawContextKey(availabilityContextId, false).bindTo(this.contextKeyService);
    this.availabilityContextKeys.set(extensionKey, availabilityContext);
    const title = localize2("chat.installRecommendation", "New {0}", recommendation.displayName);
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: commandId,
          title,
          tooltip: recommendation.description,
          f1: false,
          category: CHAT_CATEGORY,
          icon: Codicon.extensions,
          menu: [
            {
              id: MenuId.ChatNewMenu,
              group: "4_recommendations",
              when: ContextKeyExpr.equals(availabilityContextId, true)
            }
          ]
        });
      }
      async run(accessor) {
        const commandService = accessor.get(ICommandService);
        const productService = accessor.get(IProductService);
        const chatService = accessor.get(IChatService);
        const installPreReleaseVersion = productService.quality !== "stable";
        await commandService.executeCommand("workbench.extensions.installExtension", recommendation.extensionId, {
          installPreReleaseVersion
        });
        await runPostInstallCommand(commandService, chatService, recommendation.postInstallCommand);
      }
    }));
  }
  refreshInstallAvailability() {
    if (!this.availabilityContextKeys.size) {
      return;
    }
    const currentRequest = ++this.refreshRequestId;
    this.extensionManagementService.getInstalled().then((installedExtensions) => {
      if (currentRequest !== this.refreshRequestId) {
        return;
      }
      const installed = new Set(installedExtensions.map((ext) => ExtensionIdentifier.toKey(ext.identifier.id)));
      for (const [extensionKey, context] of this.availabilityContextKeys) {
        context.set(!installed.has(extensionKey));
      }
    }, () => {
      if (currentRequest !== this.refreshRequestId) {
        return;
      }
      for (const [, context] of this.availabilityContextKeys) {
        context.set(false);
      }
    });
  }
};
ChatAgentRecommendation.ID = "workbench.contrib.chatAgentRecommendation";
ChatAgentRecommendation = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IExtensionGalleryService),
  __decorateParam(2, IWorkbenchExtensionManagementService),
  __decorateParam(3, IContextKeyService)
], ChatAgentRecommendation);
async function runPostInstallCommand(commandService, chatService, commandId) {
  if (!commandId) {
    return;
  }
  await waitForCommandRegistration(commandId);
  await chatService.activateDefaultAgent(ChatAgentLocation.Chat);
  try {
    await commandService.executeCommand(commandId);
  } catch {
  }
}
function waitForCommandRegistration(commandId) {
  if (CommandsRegistry.getCommands().has(commandId)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = new TimeoutTimer();
    const listener = CommandsRegistry.onDidRegisterCommand((id) => {
      if (id === commandId) {
        listener.dispose();
        timer.dispose();
        resolve();
      }
    });
    timer.cancelAndSet(() => {
      listener.dispose();
      resolve();
    }, 1e4);
  });
}
export {
  ChatAgentRecommendation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFjdGlvbnNcXGNoYXRBZ2VudFJlY29tbWVuZGF0aW9uQWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaW1lb3V0VGltZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlLCBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IENIQVRfQ0FURUdPUlkgfSBmcm9tICcuL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvblJlY29tbWVuZGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcblxuY29uc3QgSU5TVEFMTF9DT05URVhUX1BSRUZJWCA9ICdjaGF0Lmluc3RhbGxSZWNvbW1lbmRhdGlvbkF2YWlsYWJsZSc7XG5cbmV4cG9ydCBjbGFzcyBDaGF0QWdlbnRSZWNvbW1lbmRhdGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmNoYXRBZ2VudFJlY29tbWVuZGF0aW9uJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGF2YWlsYWJpbGl0eUNvbnRleHRLZXlzID0gbmV3IE1hcDxzdHJpbmcsIElDb250ZXh0S2V5PGJvb2xlYW4+PigpO1xuXHRwcml2YXRlIHJlZnJlc2hSZXF1ZXN0SWQgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25HYWxsZXJ5U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IHJlY29tbWVuZGF0aW9ucyA9IHRoaXMucHJvZHVjdFNlcnZpY2UuY2hhdFNlc3Npb25SZWNvbW1lbmRhdGlvbnM7XG5cdFx0aWYgKCFyZWNvbW1lbmRhdGlvbnM/Lmxlbmd0aCB8fCAhdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgcmVjb21tZW5kYXRpb24gb2YgcmVjb21tZW5kYXRpb25zKSB7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyUmVjb21tZW5kYXRpb24ocmVjb21tZW5kYXRpb24pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlZnJlc2ggPSAoKSA9PiB0aGlzLnJlZnJlc2hJbnN0YWxsQXZhaWxhYmlsaXR5KCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vblByb2ZpbGVBd2FyZURpZEluc3RhbGxFeHRlbnNpb25zKHJlZnJlc2gpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uUHJvZmlsZUF3YXJlRGlkVW5pbnN0YWxsRXh0ZW5zaW9uKHJlZnJlc2gpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlUHJvZmlsZShyZWZyZXNoKSk7XG5cblx0XHR0aGlzLnJlZnJlc2hJbnN0YWxsQXZhaWxhYmlsaXR5KCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyUmVjb21tZW5kYXRpb24ocmVjb21tZW5kYXRpb246IElDaGF0U2Vzc2lvblJlY29tbWVuZGF0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uS2V5ID0gRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShyZWNvbW1lbmRhdGlvbi5leHRlbnNpb25JZCk7XG5cdFx0Y29uc3QgY29tbWFuZElkID0gYGNoYXQuaW5zdGFsbFJlY29tbWVuZGF0aW9uLiR7ZXh0ZW5zaW9uS2V5fS4ke3JlY29tbWVuZGF0aW9uLm5hbWV9YDtcblx0XHRjb25zdCBhdmFpbGFiaWxpdHlDb250ZXh0SWQgPSBgJHtJTlNUQUxMX0NPTlRFWFRfUFJFRklYfS4ke2V4dGVuc2lvbktleX1gO1xuXHRcdGNvbnN0IGF2YWlsYWJpbGl0eUNvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPihhdmFpbGFiaWxpdHlDb250ZXh0SWQsIGZhbHNlKS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5hdmFpbGFiaWxpdHlDb250ZXh0S2V5cy5zZXQoZXh0ZW5zaW9uS2V5LCBhdmFpbGFiaWxpdHlDb250ZXh0KTtcblxuXHRcdGNvbnN0IHRpdGxlID0gbG9jYWxpemUyKCdjaGF0Lmluc3RhbGxSZWNvbW1lbmRhdGlvbicsIFwiTmV3IHswfVwiLCByZWNvbW1lbmRhdGlvbi5kaXNwbGF5TmFtZSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGNvbW1hbmRJZCxcblx0XHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0XHR0b29sdGlwOiByZWNvbW1lbmRhdGlvbi5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5leHRlbnNpb25zLFxuXHRcdFx0XHRcdG1lbnU6IFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0TmV3TWVudSxcblx0XHRcdFx0XHRcdFx0Z3JvdXA6ICc0X3JlY29tbWVuZGF0aW9ucycsXG5cdFx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscyhhdmFpbGFiaWxpdHlDb250ZXh0SWQsIHRydWUpXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcm9kdWN0U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGNoYXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0U2VydmljZSk7XG5cblx0XHRcdFx0Y29uc3QgaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uID0gcHJvZHVjdFNlcnZpY2UucXVhbGl0eSAhPT0gJ3N0YWJsZSc7XG5cdFx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5pbnN0YWxsRXh0ZW5zaW9uJywgcmVjb21tZW5kYXRpb24uZXh0ZW5zaW9uSWQsIHtcblx0XHRcdFx0XHRpbnN0YWxsUHJlUmVsZWFzZVZlcnNpb25cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IHJ1blBvc3RJbnN0YWxsQ29tbWFuZChjb21tYW5kU2VydmljZSwgY2hhdFNlcnZpY2UsIHJlY29tbWVuZGF0aW9uLnBvc3RJbnN0YWxsQ29tbWFuZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoSW5zdGFsbEF2YWlsYWJpbGl0eSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuYXZhaWxhYmlsaXR5Q29udGV4dEtleXMuc2l6ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN1cnJlbnRSZXF1ZXN0ID0gKyt0aGlzLnJlZnJlc2hSZXF1ZXN0SWQ7XG5cdFx0dGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQoKS50aGVuKGluc3RhbGxlZEV4dGVuc2lvbnMgPT4ge1xuXHRcdFx0aWYgKGN1cnJlbnRSZXF1ZXN0ICE9PSB0aGlzLnJlZnJlc2hSZXF1ZXN0SWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpbnN0YWxsZWQgPSBuZXcgU2V0KGluc3RhbGxlZEV4dGVuc2lvbnMubWFwKGV4dCA9PiBFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KGV4dC5pZGVudGlmaWVyLmlkKSkpO1xuXHRcdFx0Zm9yIChjb25zdCBbZXh0ZW5zaW9uS2V5LCBjb250ZXh0XSBvZiB0aGlzLmF2YWlsYWJpbGl0eUNvbnRleHRLZXlzKSB7XG5cdFx0XHRcdGNvbnRleHQuc2V0KCFpbnN0YWxsZWQuaGFzKGV4dGVuc2lvbktleSkpO1xuXHRcdFx0fVxuXHRcdH0sICgpID0+IHtcblx0XHRcdGlmIChjdXJyZW50UmVxdWVzdCAhPT0gdGhpcy5yZWZyZXNoUmVxdWVzdElkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBbLCBjb250ZXh0XSBvZiB0aGlzLmF2YWlsYWJpbGl0eUNvbnRleHRLZXlzKSB7XG5cdFx0XHRcdGNvbnRleHQuc2V0KGZhbHNlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiBydW5Qb3N0SW5zdGFsbENvbW1hbmQoY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSwgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSwgY29tbWFuZElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0aWYgKCFjb21tYW5kSWQpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0YXdhaXQgd2FpdEZvckNvbW1hbmRSZWdpc3RyYXRpb24oY29tbWFuZElkKTtcblx0YXdhaXQgY2hhdFNlcnZpY2UuYWN0aXZhdGVEZWZhdWx0QWdlbnQoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdHRyeSB7XG5cdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZElkKTtcblx0fSBjYXRjaCB7XG5cdFx0Ly8gQ29tbWFuZCBmYWlsZWQgb3Igd2FzIGNhbmNlbGxlZDsgaWdub3JlLlxuXHR9XG59XG5cbmZ1bmN0aW9uIHdhaXRGb3JDb21tYW5kUmVnaXN0cmF0aW9uKGNvbW1hbmRJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdGlmIChDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmRzKCkuaGFzKGNvbW1hbmRJZCkpIHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblxuXHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0Y29uc3QgdGltZXIgPSBuZXcgVGltZW91dFRpbWVyKCk7XG5cdFx0Y29uc3QgbGlzdGVuZXIgPSBDb21tYW5kc1JlZ2lzdHJ5Lm9uRGlkUmVnaXN0ZXJDb21tYW5kKChpZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRpZiAoaWQgPT09IGNvbW1hbmRJZCkge1xuXHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdHRpbWVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRpbWVyLmNhbmNlbEFuZFNldCgoKSA9PiB7XG5cdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRyZXNvbHZlKCk7XG5cdFx0fSwgMTBfMDAwKTtcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFNB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
