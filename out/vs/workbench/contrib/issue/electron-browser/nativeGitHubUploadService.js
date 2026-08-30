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
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
let NativeGitHubUploadService = class extends Disposable {
  constructor(logService, nativeHostService) {
    super();
    this.logService = logService;
    this.nativeHostService = nativeHostService;
  }
  async resolveRepositoryId(owner, repo, token) {
    const headers = { "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const r = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(`Repo ID lookup failed for ${owner}/${repo}: ${r.status} ${r.statusText}${body ? ` \u2014 ${body.substring(0, 300)}` : ""}`);
    }
    const json = await r.json();
    return String(json.id);
  }
  async uploadViaMobileApi(token, repoId, files) {
    const results = [];
    for (const file of files) {
      const result = await this.nativeHostService.uploadFileViaMobileApi(
        token,
        repoId,
        file.name,
        VSBuffer.wrap(file.bytes),
        file.contentType
      );
      this.logService.info(`[GitHubUpload] Uploaded ${file.name} (${file.bytes.length} bytes) -> ${result.assetUrl}`);
      results.push(result);
    }
    return results;
  }
};
NativeGitHubUploadService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, INativeHostService)
], NativeGitHubUploadService);
export {
  NativeGitHubUploadService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGlzc3VlXFxlbGVjdHJvbi1icm93c2VyXFxuYXRpdmVHaXRIdWJVcGxvYWRTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOYXRpdmVIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IElHaXRIdWJVcGxvYWRSZXN1bHQsIElHaXRIdWJVcGxvYWRTZXJ2aWNlIH0gZnJvbSAnLi4vYnJvd3Nlci9naXRodWJVcGxvYWRTZXJ2aWNlLmpzJztcblxuLyoqXG4gKiBHaXRIdWIgdXBsb2FkIHNlcnZpY2UgdXNpbmcgdGhlIE1vYmlsZSBVcGxvYWQgQVBJLlxuICpcbiAqIFVwbG9hZHMgZmlsZXMgdmlhIHRoZSBtYWluIHByb2Nlc3MgKEVsZWN0cm9uIG5ldC5mZXRjaCkgdG8gYnlwYXNzIENPUlMuXG4gKi9cbmV4cG9ydCBjbGFzcyBOYXRpdmVHaXRIdWJVcGxvYWRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElHaXRIdWJVcGxvYWRTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElOYXRpdmVIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5hdGl2ZUhvc3RTZXJ2aWNlOiBJTmF0aXZlSG9zdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlUmVwb3NpdG9yeUlkKG93bmVyOiBzdHJpbmcsIHJlcG86IHN0cmluZywgdG9rZW4/OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7ICdBY2NlcHQnOiAnYXBwbGljYXRpb24vdm5kLmdpdGh1Yitqc29uJywgJ1gtR2l0SHViLUFwaS1WZXJzaW9uJzogJzIwMjItMTEtMjgnIH07XG5cdFx0aWYgKHRva2VuKSB7XG5cdFx0XHRoZWFkZXJzWydBdXRob3JpemF0aW9uJ10gPSBgQmVhcmVyICR7dG9rZW59YDtcblx0XHR9XG5cdFx0Y29uc3QgciA9IGF3YWl0IGZldGNoKGBodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zLyR7ZW5jb2RlVVJJQ29tcG9uZW50KG93bmVyKX0vJHtlbmNvZGVVUklDb21wb25lbnQocmVwbyl9YCwgeyBoZWFkZXJzIH0pO1xuXHRcdGlmICghci5vaykge1xuXHRcdFx0Y29uc3QgYm9keSA9IGF3YWl0IHIudGV4dCgpLmNhdGNoKCgpID0+ICcnKTtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgUmVwbyBJRCBsb29rdXAgZmFpbGVkIGZvciAke293bmVyfS8ke3JlcG99OiAke3Iuc3RhdHVzfSAke3Iuc3RhdHVzVGV4dH0ke2JvZHkgPyBgIFx1MjAxNCAke2JvZHkuc3Vic3RyaW5nKDAsIDMwMCl9YCA6ICcnfWApO1xuXHRcdH1cblx0XHRjb25zdCBqc29uID0gYXdhaXQgci5qc29uKCk7XG5cdFx0cmV0dXJuIFN0cmluZyhqc29uLmlkKTtcblx0fVxuXG5cdGFzeW5jIHVwbG9hZFZpYU1vYmlsZUFwaSh0b2tlbjogc3RyaW5nLCByZXBvSWQ6IHN0cmluZywgZmlsZXM6IHsgbmFtZTogc3RyaW5nOyBieXRlczogVWludDhBcnJheTsgY29udGVudFR5cGU6IHN0cmluZyB9W10pOiBQcm9taXNlPElHaXRIdWJVcGxvYWRSZXN1bHRbXT4ge1xuXHRcdGNvbnN0IHJlc3VsdHM6IElHaXRIdWJVcGxvYWRSZXN1bHRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5uYXRpdmVIb3N0U2VydmljZS51cGxvYWRGaWxlVmlhTW9iaWxlQXBpKFxuXHRcdFx0XHR0b2tlbiwgcmVwb0lkLCBmaWxlLm5hbWUsIFZTQnVmZmVyLndyYXAoZmlsZS5ieXRlcyksIGZpbGUuY29udGVudFR5cGVcblx0XHRcdCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgW0dpdEh1YlVwbG9hZF0gVXBsb2FkZWQgJHtmaWxlLm5hbWV9ICgke2ZpbGUuYnl0ZXMubGVuZ3RofSBieXRlcykgLT4gJHtyZXN1bHQuYXNzZXRVcmx9YCk7XG5cdFx0XHRyZXN1bHRzLnB1c2gocmVzdWx0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdHM7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywwQkFBMEI7QUFRNUIsSUFBTSw0QkFBTixjQUF3QyxXQUEyQztBQUFBLEVBSXpGLFlBQytCLFlBQ08sbUJBQ3BDO0FBQ0QsVUFBTTtBQUh3QjtBQUNPO0FBQUEsRUFHdEM7QUFBQSxFQUVBLE1BQU0sb0JBQW9CLE9BQWUsTUFBYyxPQUFpQztBQUN2RixVQUFNLFVBQWtDLEVBQUUsVUFBVSwrQkFBK0Isd0JBQXdCLGFBQWE7QUFDeEgsUUFBSSxPQUFPO0FBQ1YsY0FBUSxlQUFlLElBQUksVUFBVSxLQUFLO0FBQUEsSUFDM0M7QUFDQSxVQUFNLElBQUksTUFBTSxNQUFNLGdDQUFnQyxtQkFBbUIsS0FBSyxDQUFDLElBQUksbUJBQW1CLElBQUksQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDO0FBQzFILFFBQUksQ0FBQyxFQUFFLElBQUk7QUFDVixZQUFNLE9BQU8sTUFBTSxFQUFFLEtBQUssRUFBRSxNQUFNLE1BQU0sRUFBRTtBQUMxQyxZQUFNLElBQUksTUFBTSw2QkFBNkIsS0FBSyxJQUFJLElBQUksS0FBSyxFQUFFLE1BQU0sSUFBSSxFQUFFLFVBQVUsR0FBRyxPQUFPLFdBQU0sS0FBSyxVQUFVLEdBQUcsR0FBRyxDQUFDLEtBQUssRUFBRSxFQUFFO0FBQUEsSUFDdkk7QUFDQSxVQUFNLE9BQU8sTUFBTSxFQUFFLEtBQUs7QUFDMUIsV0FBTyxPQUFPLEtBQUssRUFBRTtBQUFBLEVBQ3RCO0FBQUEsRUFFQSxNQUFNLG1CQUFtQixPQUFlLFFBQWdCLE9BQW1HO0FBQzFKLFVBQU0sVUFBaUMsQ0FBQztBQUN4QyxlQUFXLFFBQVEsT0FBTztBQUN6QixZQUFNLFNBQVMsTUFBTSxLQUFLLGtCQUFrQjtBQUFBLFFBQzNDO0FBQUEsUUFBTztBQUFBLFFBQVEsS0FBSztBQUFBLFFBQU0sU0FBUyxLQUFLLEtBQUssS0FBSztBQUFBLFFBQUcsS0FBSztBQUFBLE1BQzNEO0FBQ0EsV0FBSyxXQUFXLEtBQUssMkJBQTJCLEtBQUssSUFBSSxLQUFLLEtBQUssTUFBTSxNQUFNLGNBQWMsT0FBTyxRQUFRLEVBQUU7QUFDOUcsY0FBUSxLQUFLLE1BQU07QUFBQSxJQUNwQjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFwQ2EsNEJBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEdBTlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
