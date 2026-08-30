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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { INotificationService, NeverShowAgainScope, Severity } from "../../../../platform/notification/common/notification.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { IChatService } from "../common/chatService/chatService.js";
import { IPluginMarketplaceService } from "../common/plugins/pluginMarketplaceService.js";
let AgentPluginRecommendations = class extends Disposable {
  constructor(_chatService, _pluginMarketplaceService, _notificationService, _extensionsWorkbenchService) {
    super();
    this._chatService = _chatService;
    this._pluginMarketplaceService = _pluginMarketplaceService;
    this._notificationService = _notificationService;
    this._extensionsWorkbenchService = _extensionsWorkbenchService;
    this._hasNotified = false;
    this._register(this._chatService.onDidSubmitRequest(() => {
      if (!this._hasNotified) {
        this._hasNotified = true;
        this._checkForRecommendedPlugins();
      }
    }));
  }
  async _checkForRecommendedPlugins() {
    const recommended = this._pluginMarketplaceService.recommendedPlugins.get();
    if (recommended.size === 0) {
      return;
    }
    const installedKeys = /* @__PURE__ */ new Set();
    for (const entry of this._pluginMarketplaceService.installedPlugins.get()) {
      const key = `${entry.plugin.name}@${entry.plugin.marketplace}`;
      installedKeys.add(key);
    }
    let fetched = this._pluginMarketplaceService.lastFetchedPlugins.get();
    if (fetched.length === 0) {
      try {
        fetched = await this._pluginMarketplaceService.fetchMarketplacePlugins(CancellationToken.None);
      } catch {
        return;
      }
    }
    const knownKeys = /* @__PURE__ */ new Set();
    for (const plugin of fetched) {
      knownKeys.add(`${plugin.name}@${plugin.marketplace}`);
    }
    let uninstalledCount = 0;
    for (const key of recommended) {
      if (!installedKeys.has(key) && knownKeys.has(key)) {
        uninstalledCount++;
      }
    }
    if (uninstalledCount === 0) {
      return;
    }
    this._notificationService.prompt(
      Severity.Info,
      uninstalledCount === 1 ? localize("agentPluginRecommendation.one", "This workspace recommends 1 agent plugin.") : localize("agentPluginRecommendation.many", "This workspace recommends {0} agent plugins.", uninstalledCount),
      [{
        label: localize("showPlugins", "Show Plugins"),
        run: () => {
          this._extensionsWorkbenchService.openSearch("@agentPlugins @recommended");
        }
      }],
      {
        neverShowAgain: {
          id: "agentPluginRecommendations.dismissed",
          scope: NeverShowAgainScope.WORKSPACE,
          isSecondary: true
        }
      }
    );
  }
};
AgentPluginRecommendations.ID = "workbench.contrib.agentPluginRecommendations";
AgentPluginRecommendations = __decorateClass([
  __decorateParam(0, IChatService),
  __decorateParam(1, IPluginMarketplaceService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IExtensionsWorkbenchService)
], AgentPluginRecommendations);
export {
  AgentPluginRecommendations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNsYXVkZVBsdWdpblJlY29tbWVuZGF0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIE5ldmVyU2hvd0FnYWluU2NvcGUsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNYXJrZXRwbGFjZVBsdWdpbiwgSVBsdWdpbk1hcmtldHBsYWNlU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9wbHVnaW5zL3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBBZ2VudFBsdWdpblJlY29tbWVuZGF0aW9ucyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmFnZW50UGx1Z2luUmVjb21tZW5kYXRpb25zJztcblxuXHRwcml2YXRlIF9oYXNOb3RpZmllZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASVBsdWdpbk1hcmtldHBsYWNlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2U6IElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYXRTZXJ2aWNlLm9uRGlkU3VibWl0UmVxdWVzdCgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2hhc05vdGlmaWVkKSB7XG5cdFx0XHRcdHRoaXMuX2hhc05vdGlmaWVkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fY2hlY2tGb3JSZWNvbW1lbmRlZFBsdWdpbnMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jaGVja0ZvclJlY29tbWVuZGVkUGx1Z2lucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZWNvbW1lbmRlZCA9IHRoaXMuX3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5yZWNvbW1lbmRlZFBsdWdpbnMuZ2V0KCk7XG5cdFx0aWYgKHJlY29tbWVuZGVkLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBCdWlsZCBhIHNldCBvZiBpbnN0YWxsZWQgcGx1Z2luIGtleXMgKFwibmFtZUBtYXJrZXRwbGFjZVwiKSBmcm9tXG5cdFx0Ly8gc3RvcmFnZSB3aXRob3V0IHRyaWdnZXJpbmcgYW55IG5ldHdvcmsgZmV0Y2guXG5cdFx0Y29uc3QgaW5zdGFsbGVkS2V5cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmluc3RhbGxlZFBsdWdpbnMuZ2V0KCkpIHtcblx0XHRcdGNvbnN0IGtleSA9IGAke2VudHJ5LnBsdWdpbi5uYW1lfUAke2VudHJ5LnBsdWdpbi5tYXJrZXRwbGFjZX1gO1xuXHRcdFx0aW5zdGFsbGVkS2V5cy5hZGQoa2V5KTtcblx0XHR9XG5cblx0XHQvLyBPbmx5IGNvdW50IHJlY29tbWVuZGF0aW9ucyB0aGF0IHJlc29sdmUgdG8gYSBrbm93biBtYXJrZXRwbGFjZVxuXHRcdC8vIHBsdWdpbi4gT3RoZXJ3aXNlIHRoZSBAcmVjb21tZW5kZWQgc2VhcmNoIHdvdWxkIGxhbmQgb24gYW4gZW1wdHlcblx0XHQvLyBsaXN0IChzZWUgbWljcm9zb2Z0L3ZzY29kZSMzMTUzNDcpLiBGYWxsIGJhY2sgdG8gYSBmcmVzaCBmZXRjaFxuXHRcdC8vIHdoZW4gdGhlIGNhY2hlIGhhc24ndCBiZWVuIHBvcHVsYXRlZCB5ZXQgc28gZmlyc3QtcnVuIHNlc3Npb25zXG5cdFx0Ly8gd2l0aCB2YWxpZCByZWNvbW1lbmRhdGlvbnMgc3RpbGwgbm90aWZ5LlxuXHRcdGxldCBmZXRjaGVkOiByZWFkb25seSBJTWFya2V0cGxhY2VQbHVnaW5bXSA9IHRoaXMuX3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5sYXN0RmV0Y2hlZFBsdWdpbnMuZ2V0KCk7XG5cdFx0aWYgKGZldGNoZWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRmZXRjaGVkID0gYXdhaXQgdGhpcy5fcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmZldGNoTWFya2V0cGxhY2VQbHVnaW5zKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3Qga25vd25LZXlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBwbHVnaW4gb2YgZmV0Y2hlZCkge1xuXHRcdFx0a25vd25LZXlzLmFkZChgJHtwbHVnaW4ubmFtZX1AJHtwbHVnaW4ubWFya2V0cGxhY2V9YCk7XG5cdFx0fVxuXG5cdFx0bGV0IHVuaW5zdGFsbGVkQ291bnQgPSAwO1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIHJlY29tbWVuZGVkKSB7XG5cdFx0XHRpZiAoIWluc3RhbGxlZEtleXMuaGFzKGtleSkgJiYga25vd25LZXlzLmhhcyhrZXkpKSB7XG5cdFx0XHRcdHVuaW5zdGFsbGVkQ291bnQrKztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodW5pbnN0YWxsZWRDb3VudCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFxuXHRcdFx0U2V2ZXJpdHkuSW5mbyxcblx0XHRcdHVuaW5zdGFsbGVkQ291bnQgPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgnYWdlbnRQbHVnaW5SZWNvbW1lbmRhdGlvbi5vbmUnLCBcIlRoaXMgd29ya3NwYWNlIHJlY29tbWVuZHMgMSBhZ2VudCBwbHVnaW4uXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2FnZW50UGx1Z2luUmVjb21tZW5kYXRpb24ubWFueScsIFwiVGhpcyB3b3Jrc3BhY2UgcmVjb21tZW5kcyB7MH0gYWdlbnQgcGx1Z2lucy5cIiwgdW5pbnN0YWxsZWRDb3VudCksXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Nob3dQbHVnaW5zJywgXCJTaG93IFBsdWdpbnNcIiksXG5cdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2V4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW5TZWFyY2goJ0BhZ2VudFBsdWdpbnMgQHJlY29tbWVuZGVkJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1dLFxuXHRcdFx0e1xuXHRcdFx0XHRuZXZlclNob3dBZ2Fpbjoge1xuXHRcdFx0XHRcdGlkOiAnYWdlbnRQbHVnaW5SZWNvbW1lbmRhdGlvbnMuZGlzbWlzc2VkJyxcblx0XHRcdFx0XHRzY29wZTogTmV2ZXJTaG93QWdhaW5TY29wZS5XT1JLU1BBQ0UsXG5cdFx0XHRcdFx0aXNTZWNvbmRhcnk6IHRydWUsXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCLHFCQUFxQixnQkFBZ0I7QUFFcEUsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBNkIsaUNBQWlDO0FBRXZELElBQU0sNkJBQU4sY0FBeUMsV0FBNkM7QUFBQSxFQUs1RixZQUNnQyxjQUNhLDJCQUNMLHNCQUNPLDZCQUM3QztBQUNELFVBQU07QUFMeUI7QUFDYTtBQUNMO0FBQ087QUFOL0MsU0FBUSxlQUFlO0FBVXRCLFNBQUssVUFBVSxLQUFLLGFBQWEsbUJBQW1CLE1BQU07QUFDekQsVUFBSSxDQUFDLEtBQUssY0FBYztBQUN2QixhQUFLLGVBQWU7QUFDcEIsYUFBSyw0QkFBNEI7QUFBQSxNQUNsQztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsTUFBYyw4QkFBNkM7QUFDMUQsVUFBTSxjQUFjLEtBQUssMEJBQTBCLG1CQUFtQixJQUFJO0FBQzFFLFFBQUksWUFBWSxTQUFTLEdBQUc7QUFDM0I7QUFBQSxJQUNEO0FBSUEsVUFBTSxnQkFBZ0Isb0JBQUksSUFBWTtBQUN0QyxlQUFXLFNBQVMsS0FBSywwQkFBMEIsaUJBQWlCLElBQUksR0FBRztBQUMxRSxZQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sSUFBSSxJQUFJLE1BQU0sT0FBTyxXQUFXO0FBQzVELG9CQUFjLElBQUksR0FBRztBQUFBLElBQ3RCO0FBT0EsUUFBSSxVQUF5QyxLQUFLLDBCQUEwQixtQkFBbUIsSUFBSTtBQUNuRyxRQUFJLFFBQVEsV0FBVyxHQUFHO0FBQ3pCLFVBQUk7QUFDSCxrQkFBVSxNQUFNLEtBQUssMEJBQTBCLHdCQUF3QixrQkFBa0IsSUFBSTtBQUFBLE1BQzlGLFFBQVE7QUFDUDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsVUFBTSxZQUFZLG9CQUFJLElBQVk7QUFDbEMsZUFBVyxVQUFVLFNBQVM7QUFDN0IsZ0JBQVUsSUFBSSxHQUFHLE9BQU8sSUFBSSxJQUFJLE9BQU8sV0FBVyxFQUFFO0FBQUEsSUFDckQ7QUFFQSxRQUFJLG1CQUFtQjtBQUN2QixlQUFXLE9BQU8sYUFBYTtBQUM5QixVQUFJLENBQUMsY0FBYyxJQUFJLEdBQUcsS0FBSyxVQUFVLElBQUksR0FBRyxHQUFHO0FBQ2xEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLHFCQUFxQixHQUFHO0FBQzNCO0FBQUEsSUFDRDtBQUVBLFNBQUsscUJBQXFCO0FBQUEsTUFDekIsU0FBUztBQUFBLE1BQ1QscUJBQXFCLElBQ2xCLFNBQVMsaUNBQWlDLDJDQUEyQyxJQUNyRixTQUFTLGtDQUFrQyxnREFBZ0QsZ0JBQWdCO0FBQUEsTUFDOUcsQ0FBQztBQUFBLFFBQ0EsT0FBTyxTQUFTLGVBQWUsY0FBYztBQUFBLFFBQzdDLEtBQUssTUFBTTtBQUNWLGVBQUssNEJBQTRCLFdBQVcsNEJBQTRCO0FBQUEsUUFDekU7QUFBQSxNQUNELENBQUM7QUFBQSxNQUNEO0FBQUEsUUFDQyxnQkFBZ0I7QUFBQSxVQUNmLElBQUk7QUFBQSxVQUNKLE9BQU8sb0JBQW9CO0FBQUEsVUFDM0IsYUFBYTtBQUFBLFFBQ2Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQXBGYSwyQkFDSSxLQUFLO0FBRFQsNkJBQU47QUFBQSxFQU1KO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FUVTsiLAogICJuYW1lcyI6IFtdCn0K
