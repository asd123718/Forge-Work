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
import { CancellationToken } from "../../../base/common/cancellation.js";
import { Event } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { ILogService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { IRequestService, isSuccess } from "../../request/common/request.js";
import { McpGalleryResourceType, McpGalleryManifestStatus } from "./mcpGalleryManifest.js";
const SUPPORTED_VERSIONS = [
  "v0.1",
  "v0"
];
let McpGalleryManifestService = class extends Disposable {
  constructor(productService, requestService, logService) {
    super();
    this.productService = productService;
    this.requestService = requestService;
    this.logService = logService;
    this.onDidChangeMcpGalleryManifest = Event.None;
    this.onDidChangeMcpGalleryManifestStatus = Event.None;
    this.versionByUrl = /* @__PURE__ */ new Map();
  }
  get mcpGalleryManifestStatus() {
    return !!this.productService.mcpGallery?.serviceUrl ? McpGalleryManifestStatus.Available : McpGalleryManifestStatus.Unavailable;
  }
  async getMcpGalleryManifest() {
    if (!this.productService.mcpGallery) {
      return null;
    }
    return this.createMcpGalleryManifest(this.productService.mcpGallery.serviceUrl, SUPPORTED_VERSIONS[0]);
  }
  async createMcpGalleryManifest(url, version) {
    url = url.endsWith("/") ? url.slice(0, -1) : url;
    if (!version) {
      let versionPromise = this.versionByUrl.get(url);
      if (!versionPromise) {
        this.versionByUrl.set(url, versionPromise = this.getVersion(url));
      }
      version = await versionPromise;
    }
    const isProductGalleryUrl = this.productService.mcpGallery?.serviceUrl === url;
    const serversUrl = `${url}/${version}/servers`;
    const resources = [
      {
        id: serversUrl,
        type: McpGalleryResourceType.McpServersQueryService
      },
      {
        id: `${serversUrl}/{name}/versions/{version}`,
        type: McpGalleryResourceType.McpServerVersionUri
      },
      {
        id: `${serversUrl}/{name}/versions/latest`,
        type: McpGalleryResourceType.McpServerLatestVersionUri
      }
    ];
    if (isProductGalleryUrl) {
      resources.push({
        id: `${serversUrl}/by-name/{name}`,
        type: McpGalleryResourceType.McpServerNamedResourceUri
      });
      resources.push({
        id: this.productService.mcpGallery.itemWebUrl,
        type: McpGalleryResourceType.McpServerWebUri
      });
      resources.push({
        id: this.productService.mcpGallery.publisherUrl,
        type: McpGalleryResourceType.PublisherUriTemplate
      });
      resources.push({
        id: this.productService.mcpGallery.supportUrl,
        type: McpGalleryResourceType.ContactSupportUri
      });
      resources.push({
        id: this.productService.mcpGallery.supportUrl,
        type: McpGalleryResourceType.ContactSupportUri
      });
      resources.push({
        id: this.productService.mcpGallery.privacyPolicyUrl,
        type: McpGalleryResourceType.PrivacyPolicyUri
      });
      resources.push({
        id: this.productService.mcpGallery.termsOfServiceUrl,
        type: McpGalleryResourceType.TermsOfServiceUri
      });
      resources.push({
        id: this.productService.mcpGallery.reportUrl,
        type: McpGalleryResourceType.ReportUri
      });
    }
    if (version === "v0") {
      resources.push({
        id: `${serversUrl}/{id}`,
        type: McpGalleryResourceType.McpServerIdUri
      });
    }
    return {
      version,
      url,
      resources
    };
  }
  async getVersion(url) {
    for (const version of SUPPORTED_VERSIONS) {
      if (await this.checkVersion(url, version)) {
        return version;
      }
    }
    return SUPPORTED_VERSIONS[0];
  }
  async checkVersion(url, version) {
    try {
      const context = await this.requestService.request({
        type: "GET",
        url: `${url}/${version}/servers?limit=1`,
        callSite: "mcpGalleryManifestService.checkVersion"
      }, CancellationToken.None);
      if (isSuccess(context)) {
        return true;
      }
      this.logService.info(`The service at ${url} does not support version ${version}. Service returned status ${context.res.statusCode}.`);
    } catch (error) {
      this.logService.error(error);
    }
    return false;
  }
};
McpGalleryManifestService = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IRequestService),
  __decorateParam(2, ILogService)
], McpGalleryManifestService);
export {
  McpGalleryManifestService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbWNwXFxjb21tb25cXG1jcEdhbGxlcnlNYW5pZmVzdFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVxdWVzdFNlcnZpY2UsIGlzU3VjY2VzcyB9IGZyb20gJy4uLy4uL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgTWNwR2FsbGVyeVJlc291cmNlVHlwZSwgSU1jcEdhbGxlcnlNYW5pZmVzdCwgSU1jcEdhbGxlcnlNYW5pZmVzdFNlcnZpY2UsIE1jcEdhbGxlcnlNYW5pZmVzdFN0YXR1cyB9IGZyb20gJy4vbWNwR2FsbGVyeU1hbmlmZXN0LmpzJztcblxuY29uc3QgU1VQUE9SVEVEX1ZFUlNJT05TID0gW1xuXHQndjAuMScsXG5cdCd2MCcsXG5dO1xuXG5leHBvcnQgY2xhc3MgTWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU1jcEdhbGxlcnlNYW5pZmVzdCA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTWNwR2FsbGVyeU1hbmlmZXN0U3RhdHVzID0gRXZlbnQuTm9uZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHZlcnNpb25CeVVybCA9IG5ldyBNYXA8c3RyaW5nLCBQcm9taXNlPHN0cmluZz4+KCk7XG5cblx0Z2V0IG1jcEdhbGxlcnlNYW5pZmVzdFN0YXR1cygpOiBNY3BHYWxsZXJ5TWFuaWZlc3RTdGF0dXMge1xuXHRcdHJldHVybiAhIXRoaXMucHJvZHVjdFNlcnZpY2UubWNwR2FsbGVyeT8uc2VydmljZVVybCA/IE1jcEdhbGxlcnlNYW5pZmVzdFN0YXR1cy5BdmFpbGFibGUgOiBNY3BHYWxsZXJ5TWFuaWZlc3RTdGF0dXMuVW5hdmFpbGFibGU7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVxdWVzdFNlcnZpY2U6IElSZXF1ZXN0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YXN5bmMgZ2V0TWNwR2FsbGVyeU1hbmlmZXN0KCk6IFByb21pc2U8SU1jcEdhbGxlcnlNYW5pZmVzdCB8IG51bGw+IHtcblx0XHRpZiAoIXRoaXMucHJvZHVjdFNlcnZpY2UubWNwR2FsbGVyeSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmNyZWF0ZU1jcEdhbGxlcnlNYW5pZmVzdCh0aGlzLnByb2R1Y3RTZXJ2aWNlLm1jcEdhbGxlcnkuc2VydmljZVVybCwgU1VQUE9SVEVEX1ZFUlNJT05TWzBdKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBjcmVhdGVNY3BHYWxsZXJ5TWFuaWZlc3QodXJsOiBzdHJpbmcsIHZlcnNpb24/OiBzdHJpbmcpOiBQcm9taXNlPElNY3BHYWxsZXJ5TWFuaWZlc3Q+IHtcblx0XHR1cmwgPSB1cmwuZW5kc1dpdGgoJy8nKSA/IHVybC5zbGljZSgwLCAtMSkgOiB1cmw7XG5cblx0XHRpZiAoIXZlcnNpb24pIHtcblx0XHRcdGxldCB2ZXJzaW9uUHJvbWlzZSA9IHRoaXMudmVyc2lvbkJ5VXJsLmdldCh1cmwpO1xuXHRcdFx0aWYgKCF2ZXJzaW9uUHJvbWlzZSkge1xuXHRcdFx0XHR0aGlzLnZlcnNpb25CeVVybC5zZXQodXJsLCB2ZXJzaW9uUHJvbWlzZSA9IHRoaXMuZ2V0VmVyc2lvbih1cmwpKTtcblx0XHRcdH1cblx0XHRcdHZlcnNpb24gPSBhd2FpdCB2ZXJzaW9uUHJvbWlzZTtcblx0XHR9XG5cblx0XHRjb25zdCBpc1Byb2R1Y3RHYWxsZXJ5VXJsID0gdGhpcy5wcm9kdWN0U2VydmljZS5tY3BHYWxsZXJ5Py5zZXJ2aWNlVXJsID09PSB1cmw7XG5cdFx0Y29uc3Qgc2VydmVyc1VybCA9IGAke3VybH0vJHt2ZXJzaW9ufS9zZXJ2ZXJzYDtcblx0XHRjb25zdCByZXNvdXJjZXMgPSBbXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBzZXJ2ZXJzVXJsLFxuXHRcdFx0XHR0eXBlOiBNY3BHYWxsZXJ5UmVzb3VyY2VUeXBlLk1jcFNlcnZlcnNRdWVyeVNlcnZpY2Vcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBgJHtzZXJ2ZXJzVXJsfS97bmFtZX0vdmVyc2lvbnMve3ZlcnNpb259YCxcblx0XHRcdFx0dHlwZTogTWNwR2FsbGVyeVJlc291cmNlVHlwZS5NY3BTZXJ2ZXJWZXJzaW9uVXJpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogYCR7c2VydmVyc1VybH0ve25hbWV9L3ZlcnNpb25zL2xhdGVzdGAsXG5cdFx0XHRcdHR5cGU6IE1jcEdhbGxlcnlSZXNvdXJjZVR5cGUuTWNwU2VydmVyTGF0ZXN0VmVyc2lvblVyaVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRpZiAoaXNQcm9kdWN0R2FsbGVyeVVybCkge1xuXHRcdFx0cmVzb3VyY2VzLnB1c2goe1xuXHRcdFx0XHRpZDogYCR7c2VydmVyc1VybH0vYnktbmFtZS97bmFtZX1gLFxuXHRcdFx0XHR0eXBlOiBNY3BHYWxsZXJ5UmVzb3VyY2VUeXBlLk1jcFNlcnZlck5hbWVkUmVzb3VyY2VVcmlcblx0XHRcdH0pO1xuXHRcdFx0cmVzb3VyY2VzLnB1c2goe1xuXHRcdFx0XHRpZDogdGhpcy5wcm9kdWN0U2VydmljZS5tY3BHYWxsZXJ5Lml0ZW1XZWJVcmwsXG5cdFx0XHRcdHR5cGU6IE1jcEdhbGxlcnlSZXNvdXJjZVR5cGUuTWNwU2VydmVyV2ViVXJpXG5cdFx0XHR9KTtcblx0XHRcdHJlc291cmNlcy5wdXNoKHtcblx0XHRcdFx0aWQ6IHRoaXMucHJvZHVjdFNlcnZpY2UubWNwR2FsbGVyeS5wdWJsaXNoZXJVcmwsXG5cdFx0XHRcdHR5cGU6IE1jcEdhbGxlcnlSZXNvdXJjZVR5cGUuUHVibGlzaGVyVXJpVGVtcGxhdGVcblx0XHRcdH0pO1xuXHRcdFx0cmVzb3VyY2VzLnB1c2goe1xuXHRcdFx0XHRpZDogdGhpcy5wcm9kdWN0U2VydmljZS5tY3BHYWxsZXJ5LnN1cHBvcnRVcmwsXG5cdFx0XHRcdHR5cGU6IE1jcEdhbGxlcnlSZXNvdXJjZVR5cGUuQ29udGFjdFN1cHBvcnRVcmlcblx0XHRcdH0pO1xuXHRcdFx0cmVzb3VyY2VzLnB1c2goe1xuXHRcdFx0XHRpZDogdGhpcy5wcm9kdWN0U2VydmljZS5tY3BHYWxsZXJ5LnN1cHBvcnRVcmwsXG5cdFx0XHRcdHR5cGU6IE1jcEdhbGxlcnlSZXNvdXJjZVR5cGUuQ29udGFjdFN1cHBvcnRVcmlcblx0XHRcdH0pO1xuXHRcdFx0cmVzb3VyY2VzLnB1c2goe1xuXHRcdFx0XHRpZDogdGhpcy5wcm9kdWN0U2VydmljZS5tY3BHYWxsZXJ5LnByaXZhY3lQb2xpY3lVcmwsXG5cdFx0XHRcdHR5cGU6IE1jcEdhbGxlcnlSZXNvdXJjZVR5cGUuUHJpdmFjeVBvbGljeVVyaVxuXHRcdFx0fSk7XG5cdFx0XHRyZXNvdXJjZXMucHVzaCh7XG5cdFx0XHRcdGlkOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLm1jcEdhbGxlcnkudGVybXNPZlNlcnZpY2VVcmwsXG5cdFx0XHRcdHR5cGU6IE1jcEdhbGxlcnlSZXNvdXJjZVR5cGUuVGVybXNPZlNlcnZpY2VVcmlcblx0XHRcdH0pO1xuXHRcdFx0cmVzb3VyY2VzLnB1c2goe1xuXHRcdFx0XHRpZDogdGhpcy5wcm9kdWN0U2VydmljZS5tY3BHYWxsZXJ5LnJlcG9ydFVybCxcblx0XHRcdFx0dHlwZTogTWNwR2FsbGVyeVJlc291cmNlVHlwZS5SZXBvcnRVcmlcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmICh2ZXJzaW9uID09PSAndjAnKSB7XG5cdFx0XHRyZXNvdXJjZXMucHVzaCh7XG5cdFx0XHRcdGlkOiBgJHtzZXJ2ZXJzVXJsfS97aWR9YCxcblx0XHRcdFx0dHlwZTogTWNwR2FsbGVyeVJlc291cmNlVHlwZS5NY3BTZXJ2ZXJJZFVyaVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHZlcnNpb24sXG5cdFx0XHR1cmwsXG5cdFx0XHRyZXNvdXJjZXNcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRWZXJzaW9uKHVybDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRmb3IgKGNvbnN0IHZlcnNpb24gb2YgU1VQUE9SVEVEX1ZFUlNJT05TKSB7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5jaGVja1ZlcnNpb24odXJsLCB2ZXJzaW9uKSkge1xuXHRcdFx0XHRyZXR1cm4gdmVyc2lvbjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFNVUFBPUlRFRF9WRVJTSU9OU1swXTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2hlY2tWZXJzaW9uKHVybDogc3RyaW5nLCB2ZXJzaW9uOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMucmVxdWVzdFNlcnZpY2UucmVxdWVzdCh7XG5cdFx0XHRcdHR5cGU6ICdHRVQnLFxuXHRcdFx0XHR1cmw6IGAke3VybH0vJHt2ZXJzaW9ufS9zZXJ2ZXJzP2xpbWl0PTFgLFxuXHRcdFx0XHRjYWxsU2l0ZTogJ21jcEdhbGxlcnlNYW5pZmVzdFNlcnZpY2UuY2hlY2tWZXJzaW9uJ1xuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRpZiAoaXNTdWNjZXNzKGNvbnRleHQpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFRoZSBzZXJ2aWNlIGF0ICR7dXJsfSBkb2VzIG5vdCBzdXBwb3J0IHZlcnNpb24gJHt2ZXJzaW9ufS4gU2VydmljZSByZXR1cm5lZCBzdGF0dXMgJHtjb250ZXh0LnJlcy5zdGF0dXNDb2RlfS5gKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0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
