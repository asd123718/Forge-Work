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
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { language } from "../../../base/common/platform.js";
import { localize } from "../../../nls.js";
import { IExtensionGalleryService } from "../../extensionManagement/common/extensionManagement.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
function getLocale(extension) {
  return extension.tags.find((t) => t.startsWith("lp-"))?.split("lp-")[1];
}
const ILanguagePackService = createDecorator("languagePackService");
let LanguagePackBaseService = class extends Disposable {
  constructor(extensionGalleryService) {
    super();
    this.extensionGalleryService = extensionGalleryService;
  }
  async getAvailableLanguages() {
    const timeout = new CancellationTokenSource();
    setTimeout(() => timeout.cancel(), 1e3);
    let result;
    try {
      result = await this.extensionGalleryService.query({
        text: 'category:"language packs"',
        pageSize: 20
      }, timeout.token);
    } catch (_) {
      return [];
    }
    const languagePackExtensions = result.firstPage.filter((e) => e.properties.localizedLanguages?.length && e.tags.some((t) => t.startsWith("lp-")));
    const allFromMarketplace = languagePackExtensions.map((lp) => {
      const languageName = lp.properties.localizedLanguages?.[0];
      const locale = getLocale(lp);
      const baseQuickPick = this.createQuickPickItem(locale, languageName, lp);
      return {
        ...baseQuickPick,
        extensionId: lp.identifier.id,
        galleryExtension: lp
      };
    });
    allFromMarketplace.push(this.createQuickPickItem("en", "English"));
    return allFromMarketplace;
  }
  createQuickPickItem(locale, languageName, languagePack) {
    const label = languageName ?? locale;
    let description;
    if (label !== locale) {
      description = `(${locale})`;
    }
    if (locale.toLowerCase() === language.toLowerCase()) {
      description ??= "";
      description += localize("currentDisplayLanguage", " (Current)");
    }
    if (languagePack?.installCount) {
      description ??= "";
      const count = languagePack.installCount;
      let countLabel;
      if (count > 1e6) {
        countLabel = `${Math.floor(count / 1e5) / 10}M`;
      } else if (count > 1e3) {
        countLabel = `${Math.floor(count / 1e3)}K`;
      } else {
        countLabel = String(count);
      }
      description += ` $(cloud-download) ${countLabel}`;
    }
    return {
      id: locale,
      label,
      description
    };
  }
};
LanguagePackBaseService = __decorateClass([
  __decorateParam(0, IExtensionGalleryService)
], LanguagePackBaseService);
export {
  ILanguagePackService,
  LanguagePackBaseService,
  getLocale
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbGFuZ3VhZ2VQYWNrc1xcY29tbW9uXFxsYW5ndWFnZVBhY2tzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsYW5ndWFnZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLCBJR2FsbGVyeUV4dGVuc2lvbiB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRMb2NhbGUoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBleHRlbnNpb24udGFncy5maW5kKHQgPT4gdC5zdGFydHNXaXRoKCdscC0nKSk/LnNwbGl0KCdscC0nKVsxXTtcbn1cblxuZXhwb3J0IGNvbnN0IElMYW5ndWFnZVBhY2tTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElMYW5ndWFnZVBhY2tTZXJ2aWNlPignbGFuZ3VhZ2VQYWNrU2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElMYW5ndWFnZVBhY2tJdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRyZWFkb25seSBleHRlbnNpb25JZD86IHN0cmluZztcblx0cmVhZG9ubHkgZ2FsbGVyeUV4dGVuc2lvbj86IElHYWxsZXJ5RXh0ZW5zaW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMYW5ndWFnZVBhY2tTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRnZXRBdmFpbGFibGVMYW5ndWFnZXMoKTogUHJvbWlzZTxBcnJheTxJTGFuZ3VhZ2VQYWNrSXRlbT4+O1xuXHRnZXRJbnN0YWxsZWRMYW5ndWFnZXMoKTogUHJvbWlzZTxBcnJheTxJTGFuZ3VhZ2VQYWNrSXRlbT4+O1xuXHRnZXRCdWlsdEluRXh0ZW5zaW9uVHJhbnNsYXRpb25zVXJpKGlkOiBzdHJpbmcsIGxhbmd1YWdlOiBzdHJpbmcpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD47XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBMYW5ndWFnZVBhY2tCYXNlU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTGFuZ3VhZ2VQYWNrU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKEBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YWJzdHJhY3QgZ2V0QnVpbHRJbkV4dGVuc2lvblRyYW5zbGF0aW9uc1VyaShpZDogc3RyaW5nLCBsYW5ndWFnZTogc3RyaW5nKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+O1xuXG5cdGFic3RyYWN0IGdldEluc3RhbGxlZExhbmd1YWdlcygpOiBQcm9taXNlPEFycmF5PElMYW5ndWFnZVBhY2tJdGVtPj47XG5cblx0YXN5bmMgZ2V0QXZhaWxhYmxlTGFuZ3VhZ2VzKCk6IFByb21pc2U8SUxhbmd1YWdlUGFja0l0ZW1bXT4ge1xuXHRcdGNvbnN0IHRpbWVvdXQgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRzZXRUaW1lb3V0KCgpID0+IHRpbWVvdXQuY2FuY2VsKCksIDEwMDApO1xuXG5cdFx0bGV0IHJlc3VsdDtcblx0XHR0cnkge1xuXHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5xdWVyeSh7XG5cdFx0XHRcdHRleHQ6ICdjYXRlZ29yeTpcImxhbmd1YWdlIHBhY2tzXCInLFxuXHRcdFx0XHRwYWdlU2l6ZTogMjBcblx0XHRcdH0sIHRpbWVvdXQudG9rZW4pO1xuXHRcdH0gY2F0Y2ggKF8pIHtcblx0XHRcdC8vIFRoaXMgbWV0aG9kIGlzIGJlc3QgZWZmb3J0LiBTbywgd2UgaWdub3JlIGFueSBlcnJvcnMuXG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFuZ3VhZ2VQYWNrRXh0ZW5zaW9ucyA9IHJlc3VsdC5maXJzdFBhZ2UuZmlsdGVyKGUgPT4gZS5wcm9wZXJ0aWVzLmxvY2FsaXplZExhbmd1YWdlcz8ubGVuZ3RoICYmIGUudGFncy5zb21lKHQgPT4gdC5zdGFydHNXaXRoKCdscC0nKSkpO1xuXHRcdGNvbnN0IGFsbEZyb21NYXJrZXRwbGFjZTogSUxhbmd1YWdlUGFja0l0ZW1bXSA9IGxhbmd1YWdlUGFja0V4dGVuc2lvbnMubWFwKGxwID0+IHtcblx0XHRcdGNvbnN0IGxhbmd1YWdlTmFtZSA9IGxwLnByb3BlcnRpZXMubG9jYWxpemVkTGFuZ3VhZ2VzPy5bMF07XG5cdFx0XHRjb25zdCBsb2NhbGUgPSBnZXRMb2NhbGUobHApITtcblx0XHRcdGNvbnN0IGJhc2VRdWlja1BpY2sgPSB0aGlzLmNyZWF0ZVF1aWNrUGlja0l0ZW0obG9jYWxlLCBsYW5ndWFnZU5hbWUsIGxwKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLmJhc2VRdWlja1BpY2ssXG5cdFx0XHRcdGV4dGVuc2lvbklkOiBscC5pZGVudGlmaWVyLmlkLFxuXHRcdFx0XHRnYWxsZXJ5RXh0ZW5zaW9uOiBscFxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdGFsbEZyb21NYXJrZXRwbGFjZS5wdXNoKHRoaXMuY3JlYXRlUXVpY2tQaWNrSXRlbSgnZW4nLCAnRW5nbGlzaCcpKTtcblxuXHRcdHJldHVybiBhbGxGcm9tTWFya2V0cGxhY2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlUXVpY2tQaWNrSXRlbShsb2NhbGU6IHN0cmluZywgbGFuZ3VhZ2VOYW1lPzogc3RyaW5nLCBsYW5ndWFnZVBhY2s/OiBJR2FsbGVyeUV4dGVuc2lvbik6IElRdWlja1BpY2tJdGVtIHtcblx0XHRjb25zdCBsYWJlbCA9IGxhbmd1YWdlTmFtZSA/PyBsb2NhbGU7XG5cdFx0bGV0IGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGxhYmVsICE9PSBsb2NhbGUpIHtcblx0XHRcdGRlc2NyaXB0aW9uID0gYCgke2xvY2FsZX0pYDtcblx0XHR9XG5cblx0XHRpZiAobG9jYWxlLnRvTG93ZXJDYXNlKCkgPT09IGxhbmd1YWdlLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRcdGRlc2NyaXB0aW9uID8/PSAnJztcblx0XHRcdGRlc2NyaXB0aW9uICs9IGxvY2FsaXplKCdjdXJyZW50RGlzcGxheUxhbmd1YWdlJywgXCIgKEN1cnJlbnQpXCIpO1xuXHRcdH1cblxuXHRcdGlmIChsYW5ndWFnZVBhY2s/Lmluc3RhbGxDb3VudCkge1xuXHRcdFx0ZGVzY3JpcHRpb24gPz89ICcnO1xuXG5cdFx0XHRjb25zdCBjb3VudCA9IGxhbmd1YWdlUGFjay5pbnN0YWxsQ291bnQ7XG5cdFx0XHRsZXQgY291bnRMYWJlbDogc3RyaW5nO1xuXHRcdFx0aWYgKGNvdW50ID4gMTAwMDAwMCkge1xuXHRcdFx0XHRjb3VudExhYmVsID0gYCR7TWF0aC5mbG9vcihjb3VudCAvIDEwMDAwMCkgLyAxMH1NYDtcblx0XHRcdH0gZWxzZSBpZiAoY291bnQgPiAxMDAwKSB7XG5cdFx0XHRcdGNvdW50TGFiZWwgPSBgJHtNYXRoLmZsb29yKGNvdW50IC8gMTAwMCl9S2A7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb3VudExhYmVsID0gU3RyaW5nKGNvdW50KTtcblx0XHRcdH1cblx0XHRcdGRlc2NyaXB0aW9uICs9IGAgJChjbG91ZC1kb3dubG9hZCkgJHtjb3VudExhYmVsfWA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiBsb2NhbGUsXG5cdFx0XHRsYWJlbCxcblx0XHRcdGRlc2NyaXB0aW9uXG5cdFx0fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFnQjtBQUd6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdDQUFtRDtBQUM1RCxTQUFTLHVCQUF1QjtBQUV6QixTQUFTLFVBQVUsV0FBa0Q7QUFDM0UsU0FBTyxVQUFVLEtBQUssS0FBSyxPQUFLLEVBQUUsV0FBVyxLQUFLLENBQUMsR0FBRyxNQUFNLEtBQUssRUFBRSxDQUFDO0FBQ3JFO0FBRU8sTUFBTSx1QkFBdUIsZ0JBQXNDLHFCQUFxQjtBQWN4RixJQUFlLDBCQUFmLGNBQStDLFdBQTJDO0FBQUEsRUFHaEcsWUFBeUQseUJBQW1EO0FBQzNHLFVBQU07QUFEa0Q7QUFBQSxFQUV6RDtBQUFBLEVBTUEsTUFBTSx3QkFBc0Q7QUFDM0QsVUFBTSxVQUFVLElBQUksd0JBQXdCO0FBQzVDLGVBQVcsTUFBTSxRQUFRLE9BQU8sR0FBRyxHQUFJO0FBRXZDLFFBQUk7QUFDSixRQUFJO0FBQ0gsZUFBUyxNQUFNLEtBQUssd0JBQXdCLE1BQU07QUFBQSxRQUNqRCxNQUFNO0FBQUEsUUFDTixVQUFVO0FBQUEsTUFDWCxHQUFHLFFBQVEsS0FBSztBQUFBLElBQ2pCLFNBQVMsR0FBRztBQUVYLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFFQSxVQUFNLHlCQUF5QixPQUFPLFVBQVUsT0FBTyxPQUFLLEVBQUUsV0FBVyxvQkFBb0IsVUFBVSxFQUFFLEtBQUssS0FBSyxPQUFLLEVBQUUsV0FBVyxLQUFLLENBQUMsQ0FBQztBQUM1SSxVQUFNLHFCQUEwQyx1QkFBdUIsSUFBSSxRQUFNO0FBQ2hGLFlBQU0sZUFBZSxHQUFHLFdBQVcscUJBQXFCLENBQUM7QUFDekQsWUFBTSxTQUFTLFVBQVUsRUFBRTtBQUMzQixZQUFNLGdCQUFnQixLQUFLLG9CQUFvQixRQUFRLGNBQWMsRUFBRTtBQUN2RSxhQUFPO0FBQUEsUUFDTixHQUFHO0FBQUEsUUFDSCxhQUFhLEdBQUcsV0FBVztBQUFBLFFBQzNCLGtCQUFrQjtBQUFBLE1BQ25CO0FBQUEsSUFDRCxDQUFDO0FBRUQsdUJBQW1CLEtBQUssS0FBSyxvQkFBb0IsTUFBTSxTQUFTLENBQUM7QUFFakUsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVVLG9CQUFvQixRQUFnQixjQUF1QixjQUFrRDtBQUN0SCxVQUFNLFFBQVEsZ0JBQWdCO0FBQzlCLFFBQUk7QUFDSixRQUFJLFVBQVUsUUFBUTtBQUNyQixvQkFBYyxJQUFJLE1BQU07QUFBQSxJQUN6QjtBQUVBLFFBQUksT0FBTyxZQUFZLE1BQU0sU0FBUyxZQUFZLEdBQUc7QUFDcEQsc0JBQWdCO0FBQ2hCLHFCQUFlLFNBQVMsMEJBQTBCLFlBQVk7QUFBQSxJQUMvRDtBQUVBLFFBQUksY0FBYyxjQUFjO0FBQy9CLHNCQUFnQjtBQUVoQixZQUFNLFFBQVEsYUFBYTtBQUMzQixVQUFJO0FBQ0osVUFBSSxRQUFRLEtBQVM7QUFDcEIscUJBQWEsR0FBRyxLQUFLLE1BQU0sUUFBUSxHQUFNLElBQUksRUFBRTtBQUFBLE1BQ2hELFdBQVcsUUFBUSxLQUFNO0FBQ3hCLHFCQUFhLEdBQUcsS0FBSyxNQUFNLFFBQVEsR0FBSSxDQUFDO0FBQUEsTUFDekMsT0FBTztBQUNOLHFCQUFhLE9BQU8sS0FBSztBQUFBLE1BQzFCO0FBQ0EscUJBQWUsc0JBQXNCLFVBQVU7QUFBQSxJQUNoRDtBQUVBLFdBQU87QUFBQSxNQUNOLElBQUk7QUFBQSxNQUNKO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUE1RXNCLDBCQUFmO0FBQUEsRUFHTztBQUFBLEdBSFE7IiwKICAibmFtZXMiOiBbXQp9Cg==
