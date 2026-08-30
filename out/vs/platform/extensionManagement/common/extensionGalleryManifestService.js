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
import { Event } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { IProductService } from "../../product/common/productService.js";
import { ExtensionGalleryResourceType, Flag, ExtensionGalleryManifestStatus } from "./extensionGalleryManifest.js";
import { FilterType, SortBy } from "./extensionManagement.js";
let ExtensionGalleryManifestService = class extends Disposable {
  constructor(productService) {
    super();
    this.productService = productService;
    this.onDidChangeExtensionGalleryManifest = Event.None;
    this.onDidChangeExtensionGalleryManifestStatus = Event.None;
  }
  get extensionGalleryManifestStatus() {
    return !!this.productService.extensionsGallery?.serviceUrl ? ExtensionGalleryManifestStatus.Available : ExtensionGalleryManifestStatus.Unavailable;
  }
  async getExtensionGalleryManifest() {
    const extensionsGallery = this.productService.extensionsGallery;
    if (!extensionsGallery?.serviceUrl) {
      return null;
    }
    const resources = [
      {
        id: `${extensionsGallery.serviceUrl}/extensionquery`,
        type: ExtensionGalleryResourceType.ExtensionQueryService
      },
      {
        id: `${extensionsGallery.serviceUrl}/vscode/{publisher}/{name}/latest`,
        type: ExtensionGalleryResourceType.ExtensionLatestVersionUri
      },
      {
        id: `${extensionsGallery.serviceUrl}/publishers/{publisher}/extensions/{name}/{version}/stats?statType={statTypeName}`,
        type: ExtensionGalleryResourceType.ExtensionStatisticsUri
      }
    ];
    if (extensionsGallery.publisherUrl) {
      resources.push({
        id: `${extensionsGallery.publisherUrl}/{publisher}`,
        type: ExtensionGalleryResourceType.PublisherViewUri
      });
    }
    if (extensionsGallery.itemUrl) {
      resources.push({
        id: `${extensionsGallery.itemUrl}?itemName={publisher}.{name}`,
        type: ExtensionGalleryResourceType.ExtensionDetailsViewUri
      });
      resources.push({
        id: `${extensionsGallery.itemUrl}?itemName={publisher}.{name}&ssr=false#review-details`,
        type: ExtensionGalleryResourceType.ExtensionRatingViewUri
      });
    }
    if (extensionsGallery.resourceUrlTemplate) {
      resources.push({
        id: extensionsGallery.resourceUrlTemplate,
        type: ExtensionGalleryResourceType.ExtensionResourceUri
      });
    }
    const filtering = [
      {
        name: FilterType.Tag,
        value: 1
      },
      {
        name: FilterType.ExtensionId,
        value: 4
      },
      {
        name: FilterType.Category,
        value: 5
      },
      {
        name: FilterType.ExtensionName,
        value: 7
      },
      {
        name: FilterType.Target,
        value: 8
      },
      {
        name: FilterType.Featured,
        value: 9
      },
      {
        name: FilterType.SearchText,
        value: 10
      },
      {
        name: FilterType.ExcludeWithFlags,
        value: 12
      }
    ];
    const sorting = [
      {
        name: SortBy.NoneOrRelevance,
        value: 0
      },
      {
        name: SortBy.LastUpdatedDate,
        value: 1
      },
      {
        name: SortBy.Title,
        value: 2
      },
      {
        name: SortBy.PublisherName,
        value: 3
      },
      {
        name: SortBy.InstallCount,
        value: 4
      },
      {
        name: SortBy.AverageRating,
        value: 6
      },
      {
        name: SortBy.PublishedDate,
        value: 10
      },
      {
        name: SortBy.WeightedRating,
        value: 12
      }
    ];
    const flags = [
      {
        name: Flag.None,
        value: 0
      },
      {
        name: Flag.IncludeVersions,
        value: 1
      },
      {
        name: Flag.IncludeFiles,
        value: 2
      },
      {
        name: Flag.IncludeCategoryAndTags,
        value: 4
      },
      {
        name: Flag.IncludeSharedAccounts,
        value: 8
      },
      {
        name: Flag.IncludeVersionProperties,
        value: 16
      },
      {
        name: Flag.ExcludeNonValidated,
        value: 32
      },
      {
        name: Flag.IncludeInstallationTargets,
        value: 64
      },
      {
        name: Flag.IncludeAssetUri,
        value: 128
      },
      {
        name: Flag.IncludeStatistics,
        value: 256
      },
      {
        name: Flag.IncludeLatestVersionOnly,
        value: 512
      },
      {
        name: Flag.Unpublished,
        value: 4096
      },
      {
        name: Flag.IncludeNameConflictInfo,
        value: 32768
      },
      {
        name: Flag.IncludeLatestPrereleaseAndStableVersionOnly,
        value: 65536
      }
    ];
    return {
      version: "",
      resources,
      capabilities: {
        extensionQuery: {
          filtering,
          sorting,
          flags
        },
        signing: {
          allPublicRepositorySigned: true
        }
      }
    };
  }
};
ExtensionGalleryManifestService = __decorateClass([
  __decorateParam(0, IProductService)
], ExtensionGalleryManifestService);
export {
  ExtensionGalleryManifestService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZXh0ZW5zaW9uTWFuYWdlbWVudFxcY29tbW9uXFxleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZVR5cGUsIEZsYWcsIElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLCBFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTdGF0dXMgfSBmcm9tICcuL2V4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdC5qcyc7XG5pbXBvcnQgeyBGaWx0ZXJUeXBlLCBTb3J0QnkgfSBmcm9tICcuL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuXG50eXBlIEV4dGVuc2lvbkdhbGxlcnlDb25maWcgPSB7XG5cdHJlYWRvbmx5IHNlcnZpY2VVcmw6IHN0cmluZztcblx0cmVhZG9ubHkgaXRlbVVybDogc3RyaW5nO1xuXHRyZWFkb25seSBwdWJsaXNoZXJVcmw6IHN0cmluZztcblx0cmVhZG9ubHkgcmVzb3VyY2VVcmxUZW1wbGF0ZTogc3RyaW5nO1xuXHRyZWFkb25seSBleHRlbnNpb25VcmxUZW1wbGF0ZTogc3RyaW5nO1xuXHRyZWFkb25seSBjb250cm9sVXJsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG5sc0Jhc2VVcmw6IHN0cmluZztcbn07XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTdGF0dXMgPSBFdmVudC5Ob25lO1xuXG5cdGdldCBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTdGF0dXMoKTogRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzIHtcblx0XHRyZXR1cm4gISF0aGlzLnByb2R1Y3RTZXJ2aWNlLmV4dGVuc2lvbnNHYWxsZXJ5Py5zZXJ2aWNlVXJsID8gRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzLkF2YWlsYWJsZSA6IEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFN0YXR1cy5VbmF2YWlsYWJsZTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhc3luYyBnZXRFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QoKTogUHJvbWlzZTxJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0IHwgbnVsbD4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNHYWxsZXJ5ID0gdGhpcy5wcm9kdWN0U2VydmljZS5leHRlbnNpb25zR2FsbGVyeSBhcyBFeHRlbnNpb25HYWxsZXJ5Q29uZmlnIHwgdW5kZWZpbmVkO1xuXHRcdGlmICghZXh0ZW5zaW9uc0dhbGxlcnk/LnNlcnZpY2VVcmwpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc291cmNlcyA9IFtcblx0XHRcdHtcblx0XHRcdFx0aWQ6IGAke2V4dGVuc2lvbnNHYWxsZXJ5LnNlcnZpY2VVcmx9L2V4dGVuc2lvbnF1ZXJ5YCxcblx0XHRcdFx0dHlwZTogRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlVHlwZS5FeHRlbnNpb25RdWVyeVNlcnZpY2Vcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBgJHtleHRlbnNpb25zR2FsbGVyeS5zZXJ2aWNlVXJsfS92c2NvZGUve3B1Ymxpc2hlcn0ve25hbWV9L2xhdGVzdGAsXG5cdFx0XHRcdHR5cGU6IEV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZVR5cGUuRXh0ZW5zaW9uTGF0ZXN0VmVyc2lvblVyaVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IGAke2V4dGVuc2lvbnNHYWxsZXJ5LnNlcnZpY2VVcmx9L3B1Ymxpc2hlcnMve3B1Ymxpc2hlcn0vZXh0ZW5zaW9ucy97bmFtZX0ve3ZlcnNpb259L3N0YXRzP3N0YXRUeXBlPXtzdGF0VHlwZU5hbWV9YCxcblx0XHRcdFx0dHlwZTogRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlVHlwZS5FeHRlbnNpb25TdGF0aXN0aWNzVXJpXG5cdFx0XHR9LFxuXHRcdF07XG5cblx0XHRpZiAoZXh0ZW5zaW9uc0dhbGxlcnkucHVibGlzaGVyVXJsKSB7XG5cdFx0XHRyZXNvdXJjZXMucHVzaCh7XG5cdFx0XHRcdGlkOiBgJHtleHRlbnNpb25zR2FsbGVyeS5wdWJsaXNoZXJVcmx9L3twdWJsaXNoZXJ9YCxcblx0XHRcdFx0dHlwZTogRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlVHlwZS5QdWJsaXNoZXJWaWV3VXJpXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoZXh0ZW5zaW9uc0dhbGxlcnkuaXRlbVVybCkge1xuXHRcdFx0cmVzb3VyY2VzLnB1c2goe1xuXHRcdFx0XHRpZDogYCR7ZXh0ZW5zaW9uc0dhbGxlcnkuaXRlbVVybH0/aXRlbU5hbWU9e3B1Ymxpc2hlcn0ue25hbWV9YCxcblx0XHRcdFx0dHlwZTogRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlVHlwZS5FeHRlbnNpb25EZXRhaWxzVmlld1VyaVxuXHRcdFx0fSk7XG5cdFx0XHRyZXNvdXJjZXMucHVzaCh7XG5cdFx0XHRcdGlkOiBgJHtleHRlbnNpb25zR2FsbGVyeS5pdGVtVXJsfT9pdGVtTmFtZT17cHVibGlzaGVyfS57bmFtZX0mc3NyPWZhbHNlI3Jldmlldy1kZXRhaWxzYCxcblx0XHRcdFx0dHlwZTogRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlVHlwZS5FeHRlbnNpb25SYXRpbmdWaWV3VXJpXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoZXh0ZW5zaW9uc0dhbGxlcnkucmVzb3VyY2VVcmxUZW1wbGF0ZSkge1xuXHRcdFx0cmVzb3VyY2VzLnB1c2goe1xuXHRcdFx0XHRpZDogZXh0ZW5zaW9uc0dhbGxlcnkucmVzb3VyY2VVcmxUZW1wbGF0ZSxcblx0XHRcdFx0dHlwZTogRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlVHlwZS5FeHRlbnNpb25SZXNvdXJjZVVyaVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlsdGVyaW5nID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBGaWx0ZXJUeXBlLlRhZyxcblx0XHRcdFx0dmFsdWU6IDEsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBGaWx0ZXJUeXBlLkV4dGVuc2lvbklkLFxuXHRcdFx0XHR2YWx1ZTogNCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IEZpbHRlclR5cGUuQ2F0ZWdvcnksXG5cdFx0XHRcdHZhbHVlOiA1LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogRmlsdGVyVHlwZS5FeHRlbnNpb25OYW1lLFxuXHRcdFx0XHR2YWx1ZTogNyxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IEZpbHRlclR5cGUuVGFyZ2V0LFxuXHRcdFx0XHR2YWx1ZTogOCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IEZpbHRlclR5cGUuRmVhdHVyZWQsXG5cdFx0XHRcdHZhbHVlOiA5LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogRmlsdGVyVHlwZS5TZWFyY2hUZXh0LFxuXHRcdFx0XHR2YWx1ZTogMTAsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBGaWx0ZXJUeXBlLkV4Y2x1ZGVXaXRoRmxhZ3MsXG5cdFx0XHRcdHZhbHVlOiAxMixcblx0XHRcdH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHNvcnRpbmcgPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IFNvcnRCeS5Ob25lT3JSZWxldmFuY2UsXG5cdFx0XHRcdHZhbHVlOiAwLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogU29ydEJ5Lkxhc3RVcGRhdGVkRGF0ZSxcblx0XHRcdFx0dmFsdWU6IDEsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBTb3J0QnkuVGl0bGUsXG5cdFx0XHRcdHZhbHVlOiAyLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogU29ydEJ5LlB1Ymxpc2hlck5hbWUsXG5cdFx0XHRcdHZhbHVlOiAzLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogU29ydEJ5Lkluc3RhbGxDb3VudCxcblx0XHRcdFx0dmFsdWU6IDQsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBTb3J0QnkuQXZlcmFnZVJhdGluZyxcblx0XHRcdFx0dmFsdWU6IDYsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBTb3J0QnkuUHVibGlzaGVkRGF0ZSxcblx0XHRcdFx0dmFsdWU6IDEwLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogU29ydEJ5LldlaWdodGVkUmF0aW5nLFxuXHRcdFx0XHR2YWx1ZTogMTIsXG5cdFx0XHR9LFxuXHRcdF07XG5cblx0XHRjb25zdCBmbGFncyA9IFtcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogRmxhZy5Ob25lLFxuXHRcdFx0XHR2YWx1ZTogMHgwLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogRmxhZy5JbmNsdWRlVmVyc2lvbnMsXG5cdFx0XHRcdHZhbHVlOiAweDEsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBGbGFnLkluY2x1ZGVGaWxlcyxcblx0XHRcdFx0dmFsdWU6IDB4Mixcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IEZsYWcuSW5jbHVkZUNhdGVnb3J5QW5kVGFncyxcblx0XHRcdFx0dmFsdWU6IDB4NCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IEZsYWcuSW5jbHVkZVNoYXJlZEFjY291bnRzLFxuXHRcdFx0XHR2YWx1ZTogMHg4LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogRmxhZy5JbmNsdWRlVmVyc2lvblByb3BlcnRpZXMsXG5cdFx0XHRcdHZhbHVlOiAweDEwLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogRmxhZy5FeGNsdWRlTm9uVmFsaWRhdGVkLFxuXHRcdFx0XHR2YWx1ZTogMHgyMCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IEZsYWcuSW5jbHVkZUluc3RhbGxhdGlvblRhcmdldHMsXG5cdFx0XHRcdHZhbHVlOiAweDQwLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogRmxhZy5JbmNsdWRlQXNzZXRVcmksXG5cdFx0XHRcdHZhbHVlOiAweDgwLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogRmxhZy5JbmNsdWRlU3RhdGlzdGljcyxcblx0XHRcdFx0dmFsdWU6IDB4MTAwLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogRmxhZy5JbmNsdWRlTGF0ZXN0VmVyc2lvbk9ubHksXG5cdFx0XHRcdHZhbHVlOiAweDIwMCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IEZsYWcuVW5wdWJsaXNoZWQsXG5cdFx0XHRcdHZhbHVlOiAweDEwMDAsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBGbGFnLkluY2x1ZGVOYW1lQ29uZmxpY3RJbmZvLFxuXHRcdFx0XHR2YWx1ZTogMHg4MDAwLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogRmxhZy5JbmNsdWRlTGF0ZXN0UHJlcmVsZWFzZUFuZFN0YWJsZVZlcnNpb25Pbmx5LFxuXHRcdFx0XHR2YWx1ZTogMHgxMDAwMCxcblx0XHRcdH0sXG5cdFx0XTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHR2ZXJzaW9uOiAnJyxcblx0XHRcdHJlc291cmNlcyxcblx0XHRcdGNhcGFiaWxpdGllczoge1xuXHRcdFx0XHRleHRlbnNpb25RdWVyeToge1xuXHRcdFx0XHRcdGZpbHRlcmluZyxcblx0XHRcdFx0XHRzb3J0aW5nLFxuXHRcdFx0XHRcdGZsYWdzLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRzaWduaW5nOiB7XG5cdFx0XHRcdFx0YWxsUHVibGljUmVwb3NpdG9yeVNpZ25lZDogdHJ1ZSxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsOEJBQThCLE1BQW1FLHNDQUFzQztBQUNoSixTQUFTLFlBQVksY0FBYztBQVk1QixJQUFNLGtDQUFOLGNBQThDLFdBQXVEO0FBQUEsRUFVM0csWUFDcUMsZ0JBQ25DO0FBQ0QsVUFBTTtBQUY4QjtBQVJyQyxTQUFTLHNDQUFzQyxNQUFNO0FBQ3JELFNBQVMsNENBQTRDLE1BQU07QUFBQSxFQVUzRDtBQUFBLEVBUkEsSUFBSSxpQ0FBaUU7QUFDcEUsV0FBTyxDQUFDLENBQUMsS0FBSyxlQUFlLG1CQUFtQixhQUFhLCtCQUErQixZQUFZLCtCQUErQjtBQUFBLEVBQ3hJO0FBQUEsRUFRQSxNQUFNLDhCQUF5RTtBQUM5RSxVQUFNLG9CQUFvQixLQUFLLGVBQWU7QUFDOUMsUUFBSSxDQUFDLG1CQUFtQixZQUFZO0FBQ25DLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxZQUFZO0FBQUEsTUFDakI7QUFBQSxRQUNDLElBQUksR0FBRyxrQkFBa0IsVUFBVTtBQUFBLFFBQ25DLE1BQU0sNkJBQTZCO0FBQUEsTUFDcEM7QUFBQSxNQUNBO0FBQUEsUUFDQyxJQUFJLEdBQUcsa0JBQWtCLFVBQVU7QUFBQSxRQUNuQyxNQUFNLDZCQUE2QjtBQUFBLE1BQ3BDO0FBQUEsTUFDQTtBQUFBLFFBQ0MsSUFBSSxHQUFHLGtCQUFrQixVQUFVO0FBQUEsUUFDbkMsTUFBTSw2QkFBNkI7QUFBQSxNQUNwQztBQUFBLElBQ0Q7QUFFQSxRQUFJLGtCQUFrQixjQUFjO0FBQ25DLGdCQUFVLEtBQUs7QUFBQSxRQUNkLElBQUksR0FBRyxrQkFBa0IsWUFBWTtBQUFBLFFBQ3JDLE1BQU0sNkJBQTZCO0FBQUEsTUFDcEMsQ0FBQztBQUFBLElBQ0Y7QUFFQSxRQUFJLGtCQUFrQixTQUFTO0FBQzlCLGdCQUFVLEtBQUs7QUFBQSxRQUNkLElBQUksR0FBRyxrQkFBa0IsT0FBTztBQUFBLFFBQ2hDLE1BQU0sNkJBQTZCO0FBQUEsTUFDcEMsQ0FBQztBQUNELGdCQUFVLEtBQUs7QUFBQSxRQUNkLElBQUksR0FBRyxrQkFBa0IsT0FBTztBQUFBLFFBQ2hDLE1BQU0sNkJBQTZCO0FBQUEsTUFDcEMsQ0FBQztBQUFBLElBQ0Y7QUFFQSxRQUFJLGtCQUFrQixxQkFBcUI7QUFDMUMsZ0JBQVUsS0FBSztBQUFBLFFBQ2QsSUFBSSxrQkFBa0I7QUFBQSxRQUN0QixNQUFNLDZCQUE2QjtBQUFBLE1BQ3BDLENBQUM7QUFBQSxJQUNGO0FBRUEsVUFBTSxZQUFZO0FBQUEsTUFDakI7QUFBQSxRQUNDLE1BQU0sV0FBVztBQUFBLFFBQ2pCLE9BQU87QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLFFBQ0MsTUFBTSxXQUFXO0FBQUEsUUFDakIsT0FBTztBQUFBLE1BQ1I7QUFBQSxNQUNBO0FBQUEsUUFDQyxNQUFNLFdBQVc7QUFBQSxRQUNqQixPQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU0sV0FBVztBQUFBLFFBQ2pCLE9BQU87QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLFFBQ0MsTUFBTSxXQUFXO0FBQUEsUUFDakIsT0FBTztBQUFBLE1BQ1I7QUFBQSxNQUNBO0FBQUEsUUFDQyxNQUFNLFdBQVc7QUFBQSxRQUNqQixPQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU0sV0FBVztBQUFBLFFBQ2pCLE9BQU87QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLFFBQ0MsTUFBTSxXQUFXO0FBQUEsUUFDakIsT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsVUFBTSxVQUFVO0FBQUEsTUFDZjtBQUFBLFFBQ0MsTUFBTSxPQUFPO0FBQUEsUUFDYixPQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU0sT0FBTztBQUFBLFFBQ2IsT0FBTztBQUFBLE1BQ1I7QUFBQSxNQUNBO0FBQUEsUUFDQyxNQUFNLE9BQU87QUFBQSxRQUNiLE9BQU87QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLFFBQ0MsTUFBTSxPQUFPO0FBQUEsUUFDYixPQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU0sT0FBTztBQUFBLFFBQ2IsT0FBTztBQUFBLE1BQ1I7QUFBQSxNQUNBO0FBQUEsUUFDQyxNQUFNLE9BQU87QUFBQSxRQUNiLE9BQU87QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLFFBQ0MsTUFBTSxPQUFPO0FBQUEsUUFDYixPQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU0sT0FBTztBQUFBLFFBQ2IsT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsVUFBTSxRQUFRO0FBQUEsTUFDYjtBQUFBLFFBQ0MsTUFBTSxLQUFLO0FBQUEsUUFDWCxPQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU0sS0FBSztBQUFBLFFBQ1gsT0FBTztBQUFBLE1BQ1I7QUFBQSxNQUNBO0FBQUEsUUFDQyxNQUFNLEtBQUs7QUFBQSxRQUNYLE9BQU87QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLFFBQ0MsTUFBTSxLQUFLO0FBQUEsUUFDWCxPQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU0sS0FBSztBQUFBLFFBQ1gsT0FBTztBQUFBLE1BQ1I7QUFBQSxNQUNBO0FBQUEsUUFDQyxNQUFNLEtBQUs7QUFBQSxRQUNYLE9BQU87QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLFFBQ0MsTUFBTSxLQUFLO0FBQUEsUUFDWCxPQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU0sS0FBSztBQUFBLFFBQ1gsT0FBTztBQUFBLE1BQ1I7QUFBQSxNQUNBO0FBQUEsUUFDQyxNQUFNLEtBQUs7QUFBQSxRQUNYLE9BQU87QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLFFBQ0MsTUFBTSxLQUFLO0FBQUEsUUFDWCxPQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU0sS0FBSztBQUFBLFFBQ1gsT0FBTztBQUFBLE1BQ1I7QUFBQSxNQUNBO0FBQUEsUUFDQyxNQUFNLEtBQUs7QUFBQSxRQUNYLE9BQU87QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLFFBQ0MsTUFBTSxLQUFLO0FBQUEsUUFDWCxPQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU0sS0FBSztBQUFBLFFBQ1gsT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1Q7QUFBQSxNQUNBLGNBQWM7QUFBQSxRQUNiLGdCQUFnQjtBQUFBLFVBQ2Y7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxRQUNBLFNBQVM7QUFBQSxVQUNSLDJCQUEyQjtBQUFBLFFBQzVCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUE5TWEsa0NBQU47QUFBQSxFQVdKO0FBQUEsR0FYVTsiLAogICJuYW1lcyI6IFtdCn0K
