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
import * as platform from "../../../../base/common/platform.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
let TestTextResourcePropertiesService = class {
  constructor(configurationService) {
    this.configurationService = configurationService;
  }
  getEOL(resource, language) {
    const eol = this.configurationService.getValue("files.eol", { overrideIdentifier: language, resource });
    if (eol && typeof eol === "string" && eol !== "auto") {
      return eol;
    }
    return platform.isLinux || platform.isMacintosh ? "\n" : "\r\n";
  }
};
TestTextResourcePropertiesService = __decorateClass([
  __decorateParam(0, IConfigurationService)
], TestTextResourcePropertiesService);
export {
  TestTextResourcePropertiesService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcc2VydmljZXNcXHRlc3RUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcblxuZXhwb3J0IGNsYXNzIFRlc3RUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSBpbXBsZW1lbnRzIElUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0Z2V0RU9MKHJlc291cmNlOiBVUkksIGxhbmd1YWdlPzogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBlb2wgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdmaWxlcy5lb2wnLCB7IG92ZXJyaWRlSWRlbnRpZmllcjogbGFuZ3VhZ2UsIHJlc291cmNlIH0pO1xuXHRcdGlmIChlb2wgJiYgdHlwZW9mIGVvbCA9PT0gJ3N0cmluZycgJiYgZW9sICE9PSAnYXV0bycpIHtcblx0XHRcdHJldHVybiBlb2w7XG5cdFx0fVxuXHRcdHJldHVybiAocGxhdGZvcm0uaXNMaW51eCB8fCBwbGF0Zm9ybS5pc01hY2ludG9zaCkgPyAnXFxuJyA6ICdcXHJcXG4nO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksY0FBYztBQUcxQixTQUFTLDZCQUE2QjtBQUUvQixJQUFNLG9DQUFOLE1BQWtGO0FBQUEsRUFJeEYsWUFDeUMsc0JBQ3ZDO0FBRHVDO0FBQUEsRUFFekM7QUFBQSxFQUVBLE9BQU8sVUFBZSxVQUEyQjtBQUNoRCxVQUFNLE1BQU0sS0FBSyxxQkFBcUIsU0FBUyxhQUFhLEVBQUUsb0JBQW9CLFVBQVUsU0FBUyxDQUFDO0FBQ3RHLFFBQUksT0FBTyxPQUFPLFFBQVEsWUFBWSxRQUFRLFFBQVE7QUFDckQsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFRLFNBQVMsV0FBVyxTQUFTLGNBQWUsT0FBTztBQUFBLEVBQzVEO0FBQ0Q7QUFoQmEsb0NBQU47QUFBQSxFQUtKO0FBQUEsR0FMVTsiLAogICJuYW1lcyI6IFtdCn0K
