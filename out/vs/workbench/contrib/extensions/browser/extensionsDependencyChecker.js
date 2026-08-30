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
import { IExtensionsWorkbenchService } from "../common/extensions.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { MenuRegistry, MenuId } from "../../../../platform/actions/common/actions.js";
import { localize } from "../../../../nls.js";
import { areSameExtensions } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { Action } from "../../../../base/common/actions.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Promises } from "../../../../base/common/async.js";
let ExtensionDependencyChecker = class extends Disposable {
  constructor(extensionService, extensionsWorkbenchService, notificationService, hostService) {
    super();
    this.extensionService = extensionService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.notificationService = notificationService;
    this.hostService = hostService;
    CommandsRegistry.registerCommand("workbench.extensions.installMissingDependencies", () => this.installMissingDependencies());
    MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
      command: {
        id: "workbench.extensions.installMissingDependencies",
        category: localize("extensions", "Extensions"),
        title: localize("auto install missing deps", "Install Missing Dependencies")
      }
    });
  }
  async getUninstalledMissingDependencies() {
    const allMissingDependencies = await this.getAllMissingDependencies();
    const localExtensions = await this.extensionsWorkbenchService.queryLocal();
    return allMissingDependencies.filter((id) => localExtensions.every((l) => !areSameExtensions(l.identifier, { id })));
  }
  async getAllMissingDependencies() {
    await this.extensionService.whenInstalledExtensionsRegistered();
    const runningExtensionsIds = this.extensionService.extensions.reduce((result, r) => {
      result.add(r.identifier.value.toLowerCase());
      return result;
    }, /* @__PURE__ */ new Set());
    const missingDependencies = /* @__PURE__ */ new Set();
    for (const extension of this.extensionService.extensions) {
      if (extension.extensionDependencies) {
        extension.extensionDependencies.forEach((dep) => {
          if (!runningExtensionsIds.has(dep.toLowerCase())) {
            missingDependencies.add(dep);
          }
        });
      }
    }
    return [...missingDependencies.values()];
  }
  async installMissingDependencies() {
    const missingDependencies = await this.getUninstalledMissingDependencies();
    if (missingDependencies.length) {
      const extensions = await this.extensionsWorkbenchService.getExtensions(missingDependencies.map((id) => ({ id })), CancellationToken.None);
      if (extensions.length) {
        await Promises.settled(extensions.map((extension) => this.extensionsWorkbenchService.install(extension)));
        this.notificationService.notify({
          severity: Severity.Info,
          message: localize("finished installing missing deps", "Finished installing missing dependencies. Please reload the window now."),
          actions: {
            primary: [new Action(
              "realod",
              localize("reload", "Reload Window"),
              "",
              true,
              () => this.hostService.reload()
            )]
          }
        });
      }
    } else {
      this.notificationService.info(localize("no missing deps", "There are no missing dependencies to install."));
    }
  }
};
ExtensionDependencyChecker = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IHostService)
], ExtensionDependencyChecker);
export {
  ExtensionDependencyChecker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXGJyb3dzZXJcXGV4dGVuc2lvbnNEZXBlbmRlbmN5Q2hlY2tlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBNZW51UmVnaXN0cnksIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgYXJlU2FtZUV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25EZXBlbmRlbmN5Q2hlY2tlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5pbnN0YWxsTWlzc2luZ0RlcGVuZGVuY2llcycsICgpID0+IHRoaXMuaW5zdGFsbE1pc3NpbmdEZXBlbmRlbmNpZXMoKSk7XG5cdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwge1xuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmluc3RhbGxNaXNzaW5nRGVwZW5kZW5jaWVzJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IGxvY2FsaXplKCdleHRlbnNpb25zJywgXCJFeHRlbnNpb25zXCIpLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2F1dG8gaW5zdGFsbCBtaXNzaW5nIGRlcHMnLCBcIkluc3RhbGwgTWlzc2luZyBEZXBlbmRlbmNpZXNcIilcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0VW5pbnN0YWxsZWRNaXNzaW5nRGVwZW5kZW5jaWVzKCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRjb25zdCBhbGxNaXNzaW5nRGVwZW5kZW5jaWVzID0gYXdhaXQgdGhpcy5nZXRBbGxNaXNzaW5nRGVwZW5kZW5jaWVzKCk7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5xdWVyeUxvY2FsKCk7XG5cdFx0cmV0dXJuIGFsbE1pc3NpbmdEZXBlbmRlbmNpZXMuZmlsdGVyKGlkID0+IGxvY2FsRXh0ZW5zaW9ucy5ldmVyeShsID0+ICFhcmVTYW1lRXh0ZW5zaW9ucyhsLmlkZW50aWZpZXIsIHsgaWQgfSkpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0QWxsTWlzc2luZ0RlcGVuZGVuY2llcygpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXHRcdGNvbnN0IHJ1bm5pbmdFeHRlbnNpb25zSWRzOiBTZXQ8c3RyaW5nPiA9IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zLnJlZHVjZSgocmVzdWx0LCByKSA9PiB7IHJlc3VsdC5hZGQoci5pZGVudGlmaWVyLnZhbHVlLnRvTG93ZXJDYXNlKCkpOyByZXR1cm4gcmVzdWx0OyB9LCBuZXcgU2V0PHN0cmluZz4oKSk7XG5cdFx0Y29uc3QgbWlzc2luZ0RlcGVuZGVuY2llczogU2V0PHN0cmluZz4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiB0aGlzLmV4dGVuc2lvblNlcnZpY2UuZXh0ZW5zaW9ucykge1xuXHRcdFx0aWYgKGV4dGVuc2lvbi5leHRlbnNpb25EZXBlbmRlbmNpZXMpIHtcblx0XHRcdFx0ZXh0ZW5zaW9uLmV4dGVuc2lvbkRlcGVuZGVuY2llcy5mb3JFYWNoKGRlcCA9PiB7XG5cdFx0XHRcdFx0aWYgKCFydW5uaW5nRXh0ZW5zaW9uc0lkcy5oYXMoZGVwLnRvTG93ZXJDYXNlKCkpKSB7XG5cdFx0XHRcdFx0XHRtaXNzaW5nRGVwZW5kZW5jaWVzLmFkZChkZXApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBbLi4ubWlzc2luZ0RlcGVuZGVuY2llcy52YWx1ZXMoKV07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGluc3RhbGxNaXNzaW5nRGVwZW5kZW5jaWVzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1pc3NpbmdEZXBlbmRlbmNpZXMgPSBhd2FpdCB0aGlzLmdldFVuaW5zdGFsbGVkTWlzc2luZ0RlcGVuZGVuY2llcygpO1xuXHRcdGlmIChtaXNzaW5nRGVwZW5kZW5jaWVzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhtaXNzaW5nRGVwZW5kZW5jaWVzLm1hcChpZCA9PiAoeyBpZCB9KSksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0aWYgKGV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQoZXh0ZW5zaW9ucy5tYXAoZXh0ZW5zaW9uID0+IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuaW5zdGFsbChleHRlbnNpb24pKSk7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdmaW5pc2hlZCBpbnN0YWxsaW5nIG1pc3NpbmcgZGVwcycsIFwiRmluaXNoZWQgaW5zdGFsbGluZyBtaXNzaW5nIGRlcGVuZGVuY2llcy4gUGxlYXNlIHJlbG9hZCB0aGUgd2luZG93IG5vdy5cIiksXG5cdFx0XHRcdFx0YWN0aW9uczoge1xuXHRcdFx0XHRcdFx0cHJpbWFyeTogW25ldyBBY3Rpb24oJ3JlYWxvZCcsIGxvY2FsaXplKCdyZWxvYWQnLCBcIlJlbG9hZCBXaW5kb3dcIiksICcnLCB0cnVlLFxuXHRcdFx0XHRcdFx0XHQoKSA9PiB0aGlzLmhvc3RTZXJ2aWNlLnJlbG9hZCgpKV1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhsb2NhbGl6ZSgnbm8gbWlzc2luZyBkZXBzJywgXCJUaGVyZSBhcmUgbm8gbWlzc2luZyBkZXBlbmRlbmNpZXMgdG8gaW5zdGFsbC5cIikpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG1DQUFtQztBQUU1QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGNBQWMsY0FBYztBQUNyQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNCQUFzQixnQkFBZ0I7QUFDL0MsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0JBQWdCO0FBRWxCLElBQU0sNkJBQU4sY0FBeUMsV0FBNkM7QUFBQSxFQUU1RixZQUNxQyxrQkFDVSw0QkFDUCxxQkFDUixhQUM5QjtBQUNELFVBQU07QUFMOEI7QUFDVTtBQUNQO0FBQ1I7QUFHL0IscUJBQWlCLGdCQUFnQixtREFBbUQsTUFBTSxLQUFLLDJCQUEyQixDQUFDO0FBQzNILGlCQUFhLGVBQWUsT0FBTyxnQkFBZ0I7QUFBQSxNQUNsRCxTQUFTO0FBQUEsUUFDUixJQUFJO0FBQUEsUUFDSixVQUFVLFNBQVMsY0FBYyxZQUFZO0FBQUEsUUFDN0MsT0FBTyxTQUFTLDZCQUE2Qiw4QkFBOEI7QUFBQSxNQUM1RTtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsb0NBQXVEO0FBQ3BFLFVBQU0seUJBQXlCLE1BQU0sS0FBSywwQkFBMEI7QUFDcEUsVUFBTSxrQkFBa0IsTUFBTSxLQUFLLDJCQUEyQixXQUFXO0FBQ3pFLFdBQU8sdUJBQXVCLE9BQU8sUUFBTSxnQkFBZ0IsTUFBTSxPQUFLLENBQUMsa0JBQWtCLEVBQUUsWUFBWSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFBQSxFQUNoSDtBQUFBLEVBRUEsTUFBYyw0QkFBK0M7QUFDNUQsVUFBTSxLQUFLLGlCQUFpQixrQ0FBa0M7QUFDOUQsVUFBTSx1QkFBb0MsS0FBSyxpQkFBaUIsV0FBVyxPQUFPLENBQUMsUUFBUSxNQUFNO0FBQUUsYUFBTyxJQUFJLEVBQUUsV0FBVyxNQUFNLFlBQVksQ0FBQztBQUFHLGFBQU87QUFBQSxJQUFRLEdBQUcsb0JBQUksSUFBWSxDQUFDO0FBQ3BMLFVBQU0sc0JBQW1DLG9CQUFJLElBQVk7QUFDekQsZUFBVyxhQUFhLEtBQUssaUJBQWlCLFlBQVk7QUFDekQsVUFBSSxVQUFVLHVCQUF1QjtBQUNwQyxrQkFBVSxzQkFBc0IsUUFBUSxTQUFPO0FBQzlDLGNBQUksQ0FBQyxxQkFBcUIsSUFBSSxJQUFJLFlBQVksQ0FBQyxHQUFHO0FBQ2pELGdDQUFvQixJQUFJLEdBQUc7QUFBQSxVQUM1QjtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBQ0EsV0FBTyxDQUFDLEdBQUcsb0JBQW9CLE9BQU8sQ0FBQztBQUFBLEVBQ3hDO0FBQUEsRUFFQSxNQUFjLDZCQUE0QztBQUN6RCxVQUFNLHNCQUFzQixNQUFNLEtBQUssa0NBQWtDO0FBQ3pFLFFBQUksb0JBQW9CLFFBQVE7QUFDL0IsWUFBTSxhQUFhLE1BQU0sS0FBSywyQkFBMkIsY0FBYyxvQkFBb0IsSUFBSSxTQUFPLEVBQUUsR0FBRyxFQUFFLEdBQUcsa0JBQWtCLElBQUk7QUFDdEksVUFBSSxXQUFXLFFBQVE7QUFDdEIsY0FBTSxTQUFTLFFBQVEsV0FBVyxJQUFJLGVBQWEsS0FBSywyQkFBMkIsUUFBUSxTQUFTLENBQUMsQ0FBQztBQUN0RyxhQUFLLG9CQUFvQixPQUFPO0FBQUEsVUFDL0IsVUFBVSxTQUFTO0FBQUEsVUFDbkIsU0FBUyxTQUFTLG9DQUFvQyx5RUFBeUU7QUFBQSxVQUMvSCxTQUFTO0FBQUEsWUFDUixTQUFTLENBQUMsSUFBSTtBQUFBLGNBQU87QUFBQSxjQUFVLFNBQVMsVUFBVSxlQUFlO0FBQUEsY0FBRztBQUFBLGNBQUk7QUFBQSxjQUN2RSxNQUFNLEtBQUssWUFBWSxPQUFPO0FBQUEsWUFBQyxDQUFDO0FBQUEsVUFDbEM7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxPQUFPO0FBQ04sV0FBSyxvQkFBb0IsS0FBSyxTQUFTLG1CQUFtQiwrQ0FBK0MsQ0FBQztBQUFBLElBQzNHO0FBQUEsRUFDRDtBQUNEO0FBNURhLDZCQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBTlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
