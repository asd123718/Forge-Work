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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { localize } from "../../../../nls.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { SimpleButton } from "../../find/browser/findWidget.js";
import { status } from "../../../../base/browser/ui/aria/aria.js";
let HoverCopyButton = class extends Disposable {
  constructor(_container, _getContent, _clipboardService, _hoverService) {
    super();
    this._container = _container;
    this._getContent = _getContent;
    this._clipboardService = _clipboardService;
    this._hoverService = _hoverService;
    this._container.classList.add("hover-row-with-copy");
    this._button = this._register(new SimpleButton({
      label: localize("hover.copy", "Copy"),
      icon: Codicon.copy,
      onTrigger: () => this._copyContent(),
      className: "hover-copy-button"
    }, this._hoverService));
    this._container.appendChild(this._button.domNode);
  }
  async _copyContent() {
    const content = this._getContent();
    if (content) {
      await this._clipboardService.writeText(content);
      status(localize("hover.copied", "Copied to clipboard"));
    }
  }
};
HoverCopyButton = __decorateClass([
  __decorateParam(2, IClipboardService),
  __decorateParam(3, IHoverService)
], HoverCopyButton);
export {
  HoverCopyButton
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGhvdmVyXFxicm93c2VyXFxob3ZlckNvcHlCdXR0b24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBTaW1wbGVCdXR0b24gfSBmcm9tICcuLi8uLi9maW5kL2Jyb3dzZXIvZmluZFdpZGdldC5qcyc7XG5pbXBvcnQgeyBzdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcblxuLyoqXG4gKiBBIGJ1dHRvbiB0aGF0IGFwcGVhcnMgaW4gaG92ZXIgcGFydHMgdG8gY29weSB0aGVpciBjb250ZW50IHRvIHRoZSBjbGlwYm9hcmQuXG4gKi9cbmV4cG9ydCBjbGFzcyBIb3ZlckNvcHlCdXR0b24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9idXR0b246IFNpbXBsZUJ1dHRvbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldENvbnRlbnQ6ICgpID0+IHN0cmluZyxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2hvdmVyLXJvdy13aXRoLWNvcHknKTtcblxuXHRcdHRoaXMuX2J1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTaW1wbGVCdXR0b24oe1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdob3Zlci5jb3B5JywgXCJDb3B5XCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jb3B5LFxuXHRcdFx0b25UcmlnZ2VyOiAoKSA9PiB0aGlzLl9jb3B5Q29udGVudCgpLFxuXHRcdFx0Y2xhc3NOYW1lOiAnaG92ZXItY29weS1idXR0b24nLFxuXHRcdH0sIHRoaXMuX2hvdmVyU2VydmljZSkpO1xuXG5cdFx0dGhpcy5fY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX2J1dHRvbi5kb21Ob2RlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NvcHlDb250ZW50KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSB0aGlzLl9nZXRDb250ZW50KCk7XG5cdFx0aWYgKGNvbnRlbnQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2NsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KGNvbnRlbnQpO1xuXHRcdFx0c3RhdHVzKGxvY2FsaXplKCdob3Zlci5jb3BpZWQnLCBcIkNvcGllZCB0byBjbGlwYm9hcmRcIikpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxjQUFjO0FBS2hCLElBQU0sa0JBQU4sY0FBOEIsV0FBVztBQUFBLEVBSS9DLFlBQ2tCLFlBQ0EsYUFDbUIsbUJBQ0osZUFDL0I7QUFDRCxVQUFNO0FBTFc7QUFDQTtBQUNtQjtBQUNKO0FBSWhDLFNBQUssV0FBVyxVQUFVLElBQUkscUJBQXFCO0FBRW5ELFNBQUssVUFBVSxLQUFLLFVBQVUsSUFBSSxhQUFhO0FBQUEsTUFDOUMsT0FBTyxTQUFTLGNBQWMsTUFBTTtBQUFBLE1BQ3BDLE1BQU0sUUFBUTtBQUFBLE1BQ2QsV0FBVyxNQUFNLEtBQUssYUFBYTtBQUFBLE1BQ25DLFdBQVc7QUFBQSxJQUNaLEdBQUcsS0FBSyxhQUFhLENBQUM7QUFFdEIsU0FBSyxXQUFXLFlBQVksS0FBSyxRQUFRLE9BQU87QUFBQSxFQUNqRDtBQUFBLEVBRUEsTUFBYyxlQUE4QjtBQUMzQyxVQUFNLFVBQVUsS0FBSyxZQUFZO0FBQ2pDLFFBQUksU0FBUztBQUNaLFlBQU0sS0FBSyxrQkFBa0IsVUFBVSxPQUFPO0FBQzlDLGFBQU8sU0FBUyxnQkFBZ0IscUJBQXFCLENBQUM7QUFBQSxJQUN2RDtBQUFBLEVBQ0Q7QUFDRDtBQS9CYSxrQkFBTjtBQUFBLEVBT0o7QUFBQSxFQUNBO0FBQUEsR0FSVTsiLAogICJuYW1lcyI6IFtdCn0K
