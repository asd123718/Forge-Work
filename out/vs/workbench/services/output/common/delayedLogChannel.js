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
import { ILoggerService, log } from "../../../../platform/log/common/log.js";
let DelayedLogChannel = class {
  constructor(id, name, file, loggerService) {
    this.file = file;
    this.loggerService = loggerService;
    this.logger = loggerService.createLogger(file, { name, id, hidden: true });
  }
  log(level, message) {
    this.loggerService.setVisibility(this.file, true);
    log(this.logger, level, message);
  }
};
DelayedLogChannel = __decorateClass([
  __decorateParam(3, ILoggerService)
], DelayedLogChannel);
export {
  DelayedLogChannel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxvdXRwdXRcXGNvbW1vblxcZGVsYXllZExvZ0NoYW5uZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJTG9nZ2VyLCBJTG9nZ2VyU2VydmljZSwgbG9nLCBMb2dMZXZlbCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBEZWxheWVkTG9nQ2hhbm5lbCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBsb2dnZXI6IElMb2dnZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aWQ6IHN0cmluZywgbmFtZTogc3RyaW5nLCBwcml2YXRlIHJlYWRvbmx5IGZpbGU6IFVSSSxcblx0XHRASUxvZ2dlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dnZXJTZXJ2aWNlOiBJTG9nZ2VyU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5sb2dnZXIgPSBsb2dnZXJTZXJ2aWNlLmNyZWF0ZUxvZ2dlcihmaWxlLCB7IG5hbWUsIGlkLCBoaWRkZW46IHRydWUgfSk7XG5cdH1cblxuXHRsb2cobGV2ZWw6IExvZ0xldmVsLCBtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmxvZ2dlclNlcnZpY2Uuc2V0VmlzaWJpbGl0eSh0aGlzLmZpbGUsIHRydWUpO1xuXHRcdGxvZyh0aGlzLmxvZ2dlciwgbGV2ZWwsIG1lc3NhZ2UpO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBa0IsZ0JBQWdCLFdBQXFCO0FBR2hELElBQU0sb0JBQU4sTUFBd0I7QUFBQSxFQUk5QixZQUNDLElBQVksTUFBK0IsTUFDVixlQUNoQztBQUYwQztBQUNWO0FBRWpDLFNBQUssU0FBUyxjQUFjLGFBQWEsTUFBTSxFQUFFLE1BQU0sSUFBSSxRQUFRLEtBQUssQ0FBQztBQUFBLEVBQzFFO0FBQUEsRUFFQSxJQUFJLE9BQWlCLFNBQXVCO0FBQzNDLFNBQUssY0FBYyxjQUFjLEtBQUssTUFBTSxJQUFJO0FBQ2hELFFBQUksS0FBSyxRQUFRLE9BQU8sT0FBTztBQUFBLEVBQ2hDO0FBRUQ7QUFoQmEsb0JBQU47QUFBQSxFQU1KO0FBQUEsR0FOVTsiLAogICJuYW1lcyI6IFtdCn0K
