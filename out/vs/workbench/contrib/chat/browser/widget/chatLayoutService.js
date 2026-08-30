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
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { derived } from "../../../../../base/common/observable.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { observableConfigValue } from "../../../../../platform/observable/common/platformObservableUtils.js";
const FONT_SIZE = 13;
let ChatLayoutService = class extends Disposable {
  constructor(configurationService) {
    super();
    const chatFontFamily = observableConfigValue("chat.fontFamily", "default", configurationService);
    this.fontFamily = derived((reader) => {
      const fontFamily = chatFontFamily.read(reader);
      return fontFamily === "default" ? null : fontFamily;
    });
    this.fontSize = observableConfigValue("chat.fontSize", FONT_SIZE, configurationService);
  }
};
ChatLayoutService = __decorateClass([
  __decorateParam(0, IConfigurationService)
], ChatLayoutService);
export {
  ChatLayoutService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdExheW91dFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGRlcml2ZWQsIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVDb25maWdWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL3BsYXRmb3JtT2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCB7IElDaGF0TGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi93aWRnZXQvY2hhdExheW91dFNlcnZpY2UuanMnO1xuXG5jb25zdCBGT05UX1NJWkUgPSAxMztcblxuZXhwb3J0IGNsYXNzIENoYXRMYXlvdXRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0TGF5b3V0U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IGZvbnRGYW1pbHk6IElPYnNlcnZhYmxlPHN0cmluZyB8IG51bGw+O1xuXHRyZWFkb25seSBmb250U2l6ZTogSU9ic2VydmFibGU8bnVtYmVyPjtcblxuXHRjb25zdHJ1Y3RvcihASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgY2hhdEZvbnRGYW1pbHkgPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWU8c3RyaW5nPignY2hhdC5mb250RmFtaWx5JywgJ2RlZmF1bHQnLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5mb250RmFtaWx5ID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZm9udEZhbWlseSA9IGNoYXRGb250RmFtaWx5LnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBmb250RmFtaWx5ID09PSAnZGVmYXVsdCcgPyBudWxsIDogZm9udEZhbWlseTtcblx0XHR9KTtcblxuXHRcdHRoaXMuZm9udFNpemUgPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWU8bnVtYmVyPignY2hhdC5mb250U2l6ZScsIEZPTlRfU0laRSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBNEI7QUFDckMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFHdEMsTUFBTSxZQUFZO0FBRVgsSUFBTSxvQkFBTixjQUFnQyxXQUF5QztBQUFBLEVBTS9FLFlBQW1DLHNCQUE2QztBQUMvRSxVQUFNO0FBRU4sVUFBTSxpQkFBaUIsc0JBQThCLG1CQUFtQixXQUFXLG9CQUFvQjtBQUN2RyxTQUFLLGFBQWEsUUFBUSxZQUFVO0FBQ25DLFlBQU0sYUFBYSxlQUFlLEtBQUssTUFBTTtBQUM3QyxhQUFPLGVBQWUsWUFBWSxPQUFPO0FBQUEsSUFDMUMsQ0FBQztBQUVELFNBQUssV0FBVyxzQkFBOEIsaUJBQWlCLFdBQVcsb0JBQW9CO0FBQUEsRUFDL0Y7QUFDRDtBQWpCYSxvQkFBTjtBQUFBLEVBTU87QUFBQSxHQU5EOyIsCiAgIm5hbWVzIjogW10KfQo=
