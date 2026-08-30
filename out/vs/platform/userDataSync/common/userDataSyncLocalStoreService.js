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
import { Promises } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { toLocalISOString } from "../../../base/common/date.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { joinPath } from "../../../base/common/resources.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { FileOperationResult, IFileService, toFileOperationResult } from "../../files/common/files.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { ALL_SYNC_RESOURCES, IUserDataSyncLogService } from "./userDataSync.js";
let UserDataSyncLocalStoreService = class extends Disposable {
  constructor(environmentService, fileService, configurationService, logService, userDataProfilesService) {
    super();
    this.environmentService = environmentService;
    this.fileService = fileService;
    this.configurationService = configurationService;
    this.logService = logService;
    this.userDataProfilesService = userDataProfilesService;
    this.cleanUp();
  }
  async cleanUp() {
    for (const profile of this.userDataProfilesService.profiles) {
      for (const resource of ALL_SYNC_RESOURCES) {
        try {
          await this.cleanUpBackup(this.getResourceBackupHome(resource, profile.isDefault ? void 0 : profile.id));
        } catch (error) {
          this.logService.error(error);
        }
      }
    }
    let stat;
    try {
      stat = await this.fileService.resolve(this.environmentService.userDataSyncHome);
    } catch (error) {
      if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
        this.logService.error(error);
      }
      return;
    }
    if (stat.children) {
      for (const child of stat.children) {
        if (child.isDirectory && !ALL_SYNC_RESOURCES.includes(child.name) && !this.userDataProfilesService.profiles.some((profile) => profile.id === child.name)) {
          try {
            this.logService.info("Deleting non existing profile from backup", child.resource.path);
            await this.fileService.del(child.resource, { recursive: true });
          } catch (error) {
            this.logService.error(error);
          }
        }
      }
    }
  }
  async getAllResourceRefs(resource, collection, root) {
    const folder = this.getResourceBackupHome(resource, collection, root);
    try {
      const stat = await this.fileService.resolve(folder);
      if (stat.children) {
        const all = stat.children.filter((stat2) => stat2.isFile && !stat2.name.startsWith("lastSync")).sort().reverse();
        return all.map((stat2) => ({
          ref: stat2.name,
          created: this.getCreationTime(stat2)
        }));
      }
    } catch (error) {
      if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
        throw error;
      }
    }
    return [];
  }
  async resolveResourceContent(resourceKey, ref, collection, root) {
    const folder = this.getResourceBackupHome(resourceKey, collection, root);
    const file = joinPath(folder, ref);
    try {
      const content = await this.fileService.readFile(file);
      return content.value.toString();
    } catch (error) {
      this.logService.error(error);
      return null;
    }
  }
  async writeResource(resourceKey, content, cTime, collection, root) {
    const folder = this.getResourceBackupHome(resourceKey, collection, root);
    const resource = joinPath(folder, `${toLocalISOString(cTime).replace(/-|:|\.\d+Z$/g, "")}.json`);
    try {
      await this.fileService.writeFile(resource, VSBuffer.fromString(content));
    } catch (e) {
      this.logService.error(e);
    }
  }
  getResourceBackupHome(resource, collection, root = this.environmentService.userDataSyncHome) {
    return joinPath(root, ...collection ? [collection, resource] : [resource]);
  }
  async cleanUpBackup(folder) {
    try {
      try {
        if (!await this.fileService.exists(folder)) {
          return;
        }
      } catch (e) {
        return;
      }
      const stat = await this.fileService.resolve(folder);
      if (stat.children) {
        const all = stat.children.filter((stat2) => stat2.isFile && /^\d{8}T\d{6}(\.json)?$/.test(stat2.name)).sort();
        const backUpMaxAge = 1e3 * 60 * 60 * 24 * (this.configurationService.getValue("sync.localBackupDuration") || 30);
        let toDelete = all.filter((stat2) => Date.now() - this.getCreationTime(stat2) > backUpMaxAge);
        const remaining = all.length - toDelete.length;
        if (remaining < 10) {
          toDelete = toDelete.slice(10 - remaining);
        }
        await Promises.settled(toDelete.map(async (stat2) => {
          this.logService.info("Deleting from backup", stat2.resource.path);
          await this.fileService.del(stat2.resource);
        }));
      }
    } catch (e) {
      this.logService.error(e);
    }
  }
  getCreationTime(stat) {
    return new Date(
      parseInt(stat.name.substring(0, 4)),
      parseInt(stat.name.substring(4, 6)) - 1,
      parseInt(stat.name.substring(6, 8)),
      parseInt(stat.name.substring(9, 11)),
      parseInt(stat.name.substring(11, 13)),
      parseInt(stat.name.substring(13, 15))
    ).getTime();
  }
};
UserDataSyncLocalStoreService = __decorateClass([
  __decorateParam(0, IEnvironmentService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IUserDataSyncLogService),
  __decorateParam(4, IUserDataProfilesService)
], UserDataSyncLocalStoreService);
export {
  UserDataSyncLocalStoreService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFxjb21tb25cXHVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyB0b0xvY2FsSVNPU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0ZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVTZXJ2aWNlLCBJRmlsZVN0YXQsIHRvRmlsZU9wZXJhdGlvblJlc3VsdCB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBBTExfU1lOQ19SRVNPVVJDRVMsIElSZXNvdXJjZVJlZkhhbmRsZSwgSVVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLCBJVXNlckRhdGFTeW5jTG9nU2VydmljZSwgU3luY1Jlc291cmNlIH0gZnJvbSAnLi91c2VyRGF0YVN5bmMuanMnO1xuXG5leHBvcnQgY2xhc3MgVXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlIHtcblxuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5jbGVhblVwKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNsZWFuVXAoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yIChjb25zdCBwcm9maWxlIG9mIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMpIHtcblx0XHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgQUxMX1NZTkNfUkVTT1VSQ0VTKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5jbGVhblVwQmFja3VwKHRoaXMuZ2V0UmVzb3VyY2VCYWNrdXBIb21lKHJlc291cmNlLCBwcm9maWxlLmlzRGVmYXVsdCA/IHVuZGVmaW5lZCA6IHByb2ZpbGUuaWQpKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IHN0YXQ6IElGaWxlU3RhdDtcblx0XHR0cnkge1xuXHRcdFx0c3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZSh0aGlzLmVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlcnJvcikgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoc3RhdC5jaGlsZHJlbikge1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBzdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRcdGlmIChjaGlsZC5pc0RpcmVjdG9yeSAmJiAhQUxMX1NZTkNfUkVTT1VSQ0VTLmluY2x1ZGVzKDxTeW5jUmVzb3VyY2U+Y2hpbGQubmFtZSkgJiYgIXRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMuc29tZShwcm9maWxlID0+IHByb2ZpbGUuaWQgPT09IGNoaWxkLm5hbWUpKSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdEZWxldGluZyBub24gZXhpc3RpbmcgcHJvZmlsZSBmcm9tIGJhY2t1cCcsIGNoaWxkLnJlc291cmNlLnBhdGgpO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwoY2hpbGQucmVzb3VyY2UsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldEFsbFJlc291cmNlUmVmcyhyZXNvdXJjZTogU3luY1Jlc291cmNlLCBjb2xsZWN0aW9uPzogc3RyaW5nLCByb290PzogVVJJKTogUHJvbWlzZTxJUmVzb3VyY2VSZWZIYW5kbGVbXT4ge1xuXHRcdGNvbnN0IGZvbGRlciA9IHRoaXMuZ2V0UmVzb3VyY2VCYWNrdXBIb21lKHJlc291cmNlLCBjb2xsZWN0aW9uLCByb290KTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZShmb2xkZXIpO1xuXHRcdFx0aWYgKHN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdFx0Y29uc3QgYWxsID0gc3RhdC5jaGlsZHJlbi5maWx0ZXIoc3RhdCA9PiBzdGF0LmlzRmlsZSAmJiAhc3RhdC5uYW1lLnN0YXJ0c1dpdGgoJ2xhc3RTeW5jJykpLnNvcnQoKS5yZXZlcnNlKCk7XG5cdFx0XHRcdHJldHVybiBhbGwubWFwKHN0YXQgPT4gKHtcblx0XHRcdFx0XHRyZWY6IHN0YXQubmFtZSxcblx0XHRcdFx0XHRjcmVhdGVkOiB0aGlzLmdldENyZWF0aW9uVGltZShzdGF0KVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICh0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZXJyb3IpICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRhc3luYyByZXNvbHZlUmVzb3VyY2VDb250ZW50KHJlc291cmNlS2V5OiBTeW5jUmVzb3VyY2UsIHJlZjogc3RyaW5nLCBjb2xsZWN0aW9uPzogc3RyaW5nLCByb290PzogVVJJKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG5cdFx0Y29uc3QgZm9sZGVyID0gdGhpcy5nZXRSZXNvdXJjZUJhY2t1cEhvbWUocmVzb3VyY2VLZXksIGNvbGxlY3Rpb24sIHJvb3QpO1xuXHRcdGNvbnN0IGZpbGUgPSBqb2luUGF0aChmb2xkZXIsIHJlZik7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKGZpbGUpO1xuXHRcdFx0cmV0dXJuIGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHdyaXRlUmVzb3VyY2UocmVzb3VyY2VLZXk6IFN5bmNSZXNvdXJjZSwgY29udGVudDogc3RyaW5nLCBjVGltZTogRGF0ZSwgY29sbGVjdGlvbj86IHN0cmluZywgcm9vdD86IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZvbGRlciA9IHRoaXMuZ2V0UmVzb3VyY2VCYWNrdXBIb21lKHJlc291cmNlS2V5LCBjb2xsZWN0aW9uLCByb290KTtcblx0XHRjb25zdCByZXNvdXJjZSA9IGpvaW5QYXRoKGZvbGRlciwgYCR7dG9Mb2NhbElTT1N0cmluZyhjVGltZSkucmVwbGFjZSgvLXw6fFxcLlxcZCtaJC9nLCAnJyl9Lmpzb25gKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFJlc291cmNlQmFja3VwSG9tZShyZXNvdXJjZTogU3luY1Jlc291cmNlLCBjb2xsZWN0aW9uPzogc3RyaW5nLCByb290OiBVUkkgPSB0aGlzLmVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lKTogVVJJIHtcblx0XHRyZXR1cm4gam9pblBhdGgocm9vdCwgLi4uKGNvbGxlY3Rpb24gPyBbY29sbGVjdGlvbiwgcmVzb3VyY2VdIDogW3Jlc291cmNlXSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjbGVhblVwQmFja3VwKGZvbGRlcjogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGlmICghKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKGZvbGRlcikpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUoZm9sZGVyKTtcblx0XHRcdGlmIChzdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRcdGNvbnN0IGFsbCA9IHN0YXQuY2hpbGRyZW4uZmlsdGVyKHN0YXQgPT4gc3RhdC5pc0ZpbGUgJiYgL15cXGR7OH1UXFxkezZ9KFxcLmpzb24pPyQvLnRlc3Qoc3RhdC5uYW1lKSkuc29ydCgpO1xuXHRcdFx0XHRjb25zdCBiYWNrVXBNYXhBZ2UgPSAxMDAwICogNjAgKiA2MCAqIDI0ICogKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPignc3luYy5sb2NhbEJhY2t1cER1cmF0aW9uJykgfHwgMzAgLyogRGVmYXVsdCAzMCBkYXlzICovKTtcblx0XHRcdFx0bGV0IHRvRGVsZXRlID0gYWxsLmZpbHRlcihzdGF0ID0+IERhdGUubm93KCkgLSB0aGlzLmdldENyZWF0aW9uVGltZShzdGF0KSA+IGJhY2tVcE1heEFnZSk7XG5cdFx0XHRcdGNvbnN0IHJlbWFpbmluZyA9IGFsbC5sZW5ndGggLSB0b0RlbGV0ZS5sZW5ndGg7XG5cdFx0XHRcdGlmIChyZW1haW5pbmcgPCAxMCkge1xuXHRcdFx0XHRcdHRvRGVsZXRlID0gdG9EZWxldGUuc2xpY2UoMTAgLSByZW1haW5pbmcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQodG9EZWxldGUubWFwKGFzeW5jIHN0YXQgPT4ge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdEZWxldGluZyBmcm9tIGJhY2t1cCcsIHN0YXQucmVzb3VyY2UucGF0aCk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwoc3RhdC5yZXNvdXJjZSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRDcmVhdGlvblRpbWUoc3RhdDogSUZpbGVTdGF0KSB7XG5cdFx0cmV0dXJuIG5ldyBEYXRlKFxuXHRcdFx0cGFyc2VJbnQoc3RhdC5uYW1lLnN1YnN0cmluZygwLCA0KSksXG5cdFx0XHRwYXJzZUludChzdGF0Lm5hbWUuc3Vic3RyaW5nKDQsIDYpKSAtIDEsXG5cdFx0XHRwYXJzZUludChzdGF0Lm5hbWUuc3Vic3RyaW5nKDYsIDgpKSxcblx0XHRcdHBhcnNlSW50KHN0YXQubmFtZS5zdWJzdHJpbmcoOSwgMTEpKSxcblx0XHRcdHBhcnNlSW50KHN0YXQubmFtZS5zdWJzdHJpbmcoMTEsIDEzKSksXG5cdFx0XHRwYXJzZUludChzdGF0Lm5hbWUuc3Vic3RyaW5nKDEzLCAxNSkpXG5cdFx0KS5nZXRUaW1lKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxxQkFBcUIsY0FBeUIsNkJBQTZCO0FBQ3BGLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsb0JBQXdFLCtCQUE2QztBQUV2SCxJQUFNLGdDQUFOLGNBQTRDLFdBQXFEO0FBQUEsRUFJdkcsWUFDdUMsb0JBQ1AsYUFDUyxzQkFDRSxZQUNDLHlCQUMxQztBQUNELFVBQU07QUFOZ0M7QUFDUDtBQUNTO0FBQ0U7QUFDQztBQUczQyxTQUFLLFFBQVE7QUFBQSxFQUNkO0FBQUEsRUFFQSxNQUFjLFVBQXlCO0FBQ3RDLGVBQVcsV0FBVyxLQUFLLHdCQUF3QixVQUFVO0FBQzVELGlCQUFXLFlBQVksb0JBQW9CO0FBQzFDLFlBQUk7QUFDSCxnQkFBTSxLQUFLLGNBQWMsS0FBSyxzQkFBc0IsVUFBVSxRQUFRLFlBQVksU0FBWSxRQUFRLEVBQUUsQ0FBQztBQUFBLFFBQzFHLFNBQVMsT0FBTztBQUNmLGVB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LGNBQWMsUUFBNEI7QUFDdkQsUUFBSTtBQUNILFVBQUk7QUFDSCxZQUFJLENBQUUsTUFBTSxLQUFLLFlBQVksT0FBTyxNQUFNLEdBQUk7QUFDN0M7QUFBQSxRQUNEO0FBQUEsTUFDRCxTQUFTLEdBQUc7QUFDWDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLE9BQU8sTUFBTSxLQUFLLFlBQVksUUFBUSxNQUFNO0FBQ2xELFVBQUksS0FBSyxVQUFVO0FBQ2xCLGNBQU0sTUFBTSxLQUFLLFNBQVMsT0FBTyxDQUFBQSxVQUFRQSxNQUFLLFVBQVUseUJBQXlCLEtBQUtBLE1BQUssSUFBSSxDQUFDLEVBQUUsS0FBSztBQUN2RyxjQUFNLGVBQWUsTUFBTyxLQUFLLEtBQUssTUFBTSxLQUFLLHFCQUFxQixTQUFpQiwwQkFBMEIsS0FBSztBQUN0SCxZQUFJLFdBQVcsSUFBSSxPQUFPLENBQUFBLFVBQVEsS0FBSyxJQUFJLElBQUksS0FBSyxnQkFBZ0JBLEtBQUksSUFBSSxZQUFZO0FBQ3hGLGNBQU0sWUFBWSxJQUFJLFNBQVMsU0FBUztBQUN4QyxZQUFJLFlBQVksSUFBSTtBQUNuQixxQkFBVyxTQUFTLE1BQU0sS0FBSyxTQUFTO0FBQUEsUUFDekM7QUFDQSxjQUFNLFNBQVMsUUFBUSxTQUFTLElBQUksT0FBTUEsVUFBUTtBQUNqRCxlQUFLLFdBQVcsS0FBSyx3QkFBd0JBLE1BQUssU0FBUyxJQUFJO0FBQy9ELGdCQUFNLEtBQUssWUFBWSxJQUFJQSxNQUFLLFFBQVE7QUFBQSxRQUN6QyxDQUFDLENBQUM7QUFBQSxNQUNIO0FBQUEsSUFDRCxTQUFTLEdBQUc7QUFDWCxXQUFLLFdBQVcsTUFBTSxDQUFDO0FBQUEsSUFDeEI7QUFBQSxFQUNEO0FBQUEsRUFFUSxnQkFBZ0IsTUFBaUI7QUFDeEMsV0FBTyxJQUFJO0FBQUEsTUFDVixTQUFTLEtBQUssS0FBSyxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDbEMsU0FBUyxLQUFLLEtBQUssVUFBVSxHQUFHLENBQUMsQ0FBQyxJQUFJO0FBQUEsTUFDdEMsU0FBUyxLQUFLLEtBQUssVUFBVSxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ2xDLFNBQVMsS0FBSyxLQUFLLFVBQVUsR0FBRyxFQUFFLENBQUM7QUFBQSxNQUNuQyxTQUFTLEtBQUssS0FBSyxVQUFVLElBQUksRUFBRSxDQUFDO0FBQUEsTUFDcEMsU0FBUyxLQUFLLEtBQUssVUFBVSxJQUFJLEVBQUUsQ0FBQztBQUFBLElBQ3JDLEVBQUUsUUFBUTtBQUFBLEVBQ1g7QUFDRDtBQXJJYSxnQ0FBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FUVTsiLAogICJuYW1lcyI6IFsic3RhdCJdCn0K
