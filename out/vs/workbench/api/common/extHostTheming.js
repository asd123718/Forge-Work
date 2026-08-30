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
import { ColorTheme, ColorThemeKind } from "./extHostTypes.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { Emitter } from "../../../base/common/event.js";
let ExtHostTheming = class {
  constructor(_extHostRpc) {
    this._actual = new ColorTheme(ColorThemeKind.Dark);
    this._onDidChangeActiveColorTheme = new Emitter();
  }
  get activeColorTheme() {
    return this._actual;
  }
  $onColorThemeChange(type) {
    let kind;
    switch (type) {
      case "light":
        kind = ColorThemeKind.Light;
        break;
      case "hcDark":
        kind = ColorThemeKind.HighContrast;
        break;
      case "hcLight":
        kind = ColorThemeKind.HighContrastLight;
        break;
      default:
        kind = ColorThemeKind.Dark;
    }
    this._actual = new ColorTheme(kind);
    this._onDidChangeActiveColorTheme.fire(this._actual);
  }
  get onDidChangeActiveColorTheme() {
    return this._onDidChangeActiveColorTheme.event;
  }
};
ExtHostTheming = __decorateClass([
  __decorateParam(0, IExtHostRpcService)
], ExtHostTheming);
export {
  ExtHostTheming
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0VGhlbWluZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENvbG9yVGhlbWUsIENvbG9yVGhlbWVLaW5kIH0gZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RScGNTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0UnBjU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0VGhlbWluZ1NoYXBlIH0gZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuXG5leHBvcnQgY2xhc3MgRXh0SG9zdFRoZW1pbmcgaW1wbGVtZW50cyBFeHRIb3N0VGhlbWluZ1NoYXBlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfYWN0dWFsOiBDb2xvclRoZW1lO1xuXHRwcml2YXRlIF9vbkRpZENoYW5nZUFjdGl2ZUNvbG9yVGhlbWU6IEVtaXR0ZXI8Q29sb3JUaGVtZT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRIb3N0UnBjU2VydmljZSBfZXh0SG9zdFJwYzogSUV4dEhvc3RScGNTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX2FjdHVhbCA9IG5ldyBDb2xvclRoZW1lKENvbG9yVGhlbWVLaW5kLkRhcmspO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlQ29sb3JUaGVtZSA9IG5ldyBFbWl0dGVyPENvbG9yVGhlbWU+KCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGFjdGl2ZUNvbG9yVGhlbWUoKTogQ29sb3JUaGVtZSB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdHVhbDtcblx0fVxuXG5cdCRvbkNvbG9yVGhlbWVDaGFuZ2UodHlwZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0bGV0IGtpbmQ7XG5cdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0XHRjYXNlICdsaWdodCc6IGtpbmQgPSBDb2xvclRoZW1lS2luZC5MaWdodDsgYnJlYWs7XG5cdFx0XHRjYXNlICdoY0RhcmsnOiBraW5kID0gQ29sb3JUaGVtZUtpbmQuSGlnaENvbnRyYXN0OyBicmVhaztcblx0XHRcdGNhc2UgJ2hjTGlnaHQnOiBraW5kID0gQ29sb3JUaGVtZUtpbmQuSGlnaENvbnRyYXN0TGlnaHQ7IGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0a2luZCA9IENvbG9yVGhlbWVLaW5kLkRhcms7XG5cdFx0fVxuXHRcdHRoaXMuX2FjdHVhbCA9IG5ldyBDb2xvclRoZW1lKGtpbmQpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlQ29sb3JUaGVtZS5maXJlKHRoaXMuX2FjdHVhbCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlQWN0aXZlQ29sb3JUaGVtZSgpOiBFdmVudDxDb2xvclRoZW1lPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlQ29sb3JUaGVtZS5ldmVudDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFlBQVksc0JBQXNCO0FBQzNDLFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMsZUFBc0I7QUFFeEIsSUFBTSxpQkFBTixNQUFvRDtBQUFBLEVBTzFELFlBQ3FCLGFBQ25CO0FBQ0QsU0FBSyxVQUFVLElBQUksV0FBVyxlQUFlLElBQUk7QUFDakQsU0FBSywrQkFBK0IsSUFBSSxRQUFvQjtBQUFBLEVBQzdEO0FBQUEsRUFFQSxJQUFXLG1CQUErQjtBQUN6QyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxvQkFBb0IsTUFBb0I7QUFDdkMsUUFBSTtBQUNKLFlBQVEsTUFBTTtBQUFBLE1BQ2IsS0FBSztBQUFTLGVBQU8sZUFBZTtBQUFPO0FBQUEsTUFDM0MsS0FBSztBQUFVLGVBQU8sZUFBZTtBQUFjO0FBQUEsTUFDbkQsS0FBSztBQUFXLGVBQU8sZUFBZTtBQUFtQjtBQUFBLE1BQ3pEO0FBQ0MsZUFBTyxlQUFlO0FBQUEsSUFDeEI7QUFDQSxTQUFLLFVBQVUsSUFBSSxXQUFXLElBQUk7QUFDbEMsU0FBSyw2QkFBNkIsS0FBSyxLQUFLLE9BQU87QUFBQSxFQUNwRDtBQUFBLEVBRUEsSUFBVyw4QkFBaUQ7QUFDM0QsV0FBTyxLQUFLLDZCQUE2QjtBQUFBLEVBQzFDO0FBQ0Q7QUFsQ2EsaUJBQU47QUFBQSxFQVFKO0FBQUEsR0FSVTsiLAogICJuYW1lcyI6IFtdCn0K
