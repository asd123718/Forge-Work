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
import { importAMDNodeModule, resolveAmdNodeModulePath } from "../../../amdX.js";
import { WindowIntervalTimer } from "../../../base/browser/dom.js";
import { mainWindow } from "../../../base/browser/window.js";
import { memoize } from "../../../base/common/decorators.js";
import { IProductService } from "../../product/common/productService.js";
import { AbstractSignService } from "../common/abstractSignService.js";
const KEY_SIZE = 32;
const IV_SIZE = 16;
const STEP_SIZE = KEY_SIZE + IV_SIZE;
let SignService = class extends AbstractSignService {
  constructor(productService) {
    super();
    this.productService = productService;
  }
  getValidator() {
    return this.vsda().then((vsda) => {
      const v = new vsda.validator();
      return {
        createNewMessage: (arg) => v.createNewMessage(arg),
        validate: (arg) => v.validate(arg),
        dispose: () => v.free()
      };
    });
  }
  signValue(arg) {
    return this.vsda().then((vsda) => vsda.sign(arg));
  }
  async vsda() {
    const checkInterval = new WindowIntervalTimer();
    let [wasm] = await Promise.all([
      this.getWasmBytes(),
      new Promise((resolve, reject) => {
        importAMDNodeModule("vsda", "rust/web/vsda.js").then(() => resolve(), reject);
        checkInterval.cancelAndSet(() => {
          if (typeof vsda_web !== "undefined") {
            resolve();
          }
        }, 50, mainWindow);
      }).finally(() => checkInterval.dispose())
    ]);
    const keyBytes = new TextEncoder().encode(this.productService.serverLicense?.join("\n") || "");
    for (let i = 0; i + STEP_SIZE < keyBytes.length; i += STEP_SIZE) {
      const key = await crypto.subtle.importKey("raw", keyBytes.slice(i + IV_SIZE, i + IV_SIZE + KEY_SIZE), { name: "AES-CBC" }, false, ["decrypt"]);
      wasm = await crypto.subtle.decrypt({ name: "AES-CBC", iv: keyBytes.slice(i, i + IV_SIZE) }, key, wasm);
    }
    await vsda_web.default(wasm);
    return vsda_web;
  }
  async getWasmBytes() {
    const url = resolveAmdNodeModulePath("vsda", "rust/web/vsda_bg.wasm");
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("error loading vsda");
    }
    return response.arrayBuffer();
  }
};
__decorateClass([
  memoize
], SignService.prototype, "vsda", 1);
SignService = __decorateClass([
  __decorateParam(0, IProductService)
], SignService);
export {
  SignService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcc2lnblxcYnJvd3Nlclxcc2lnblNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpbXBvcnRBTUROb2RlTW9kdWxlLCByZXNvbHZlQW1kTm9kZU1vZHVsZVBhdGggfSBmcm9tICcuLi8uLi8uLi9hbWRYLmpzJztcbmltcG9ydCB7IFdpbmRvd0ludGVydmFsVGltZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IG1lbW9pemUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFic3RyYWN0U2lnblNlcnZpY2UsIElWc2RhVmFsaWRhdG9yIH0gZnJvbSAnLi4vY29tbW9uL2Fic3RyYWN0U2lnblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNpZ25TZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3NpZ24uanMnO1xuXG5kZWNsYXJlIG5hbWVzcGFjZSB2c2RhV2ViIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHNpZ24oc2FsdGVkX21lc3NhZ2U6IHN0cmluZyk6IHN0cmluZztcblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25hbWluZy1jb252ZW50aW9uXG5cdGV4cG9ydCBjbGFzcyB2YWxpZGF0b3Ige1xuXHRcdGZyZWUoKTogdm9pZDtcblx0XHRjb25zdHJ1Y3RvcigpO1xuXHRcdGNyZWF0ZU5ld01lc3NhZ2Uob3JpZ2luYWw6IHN0cmluZyk6IHN0cmluZztcblx0XHR2YWxpZGF0ZShzaWduZWRfbWVzc2FnZTogc3RyaW5nKTogJ29rJyB8ICdlcnJvcic7XG5cdH1cblxuXHRleHBvcnQgdHlwZSBJbml0SW5wdXQgPSBSZXF1ZXN0SW5mbyB8IFVSTCB8IFJlc3BvbnNlIHwgQnVmZmVyU291cmNlIHwgV2ViQXNzZW1ibHkuTW9kdWxlO1xuXHRleHBvcnQgZnVuY3Rpb24gaW5pdChtb2R1bGVfb3JfcGF0aD86IEluaXRJbnB1dCB8IFByb21pc2U8SW5pdElucHV0Pik6IFByb21pc2U8dW5rbm93bj47XG59XG5cbi8vIEluaXRpYWxpemVkIGlmL3doZW4gdnNkYSBpcyBsb2FkZWRcbmRlY2xhcmUgY29uc3QgdnNkYV93ZWI6IHtcblx0ZGVmYXVsdDogdHlwZW9mIHZzZGFXZWIuaW5pdDtcblx0c2lnbjogdHlwZW9mIHZzZGFXZWIuc2lnbjtcblx0dmFsaWRhdG9yOiB0eXBlb2YgdnNkYVdlYi52YWxpZGF0b3I7XG59O1xuXG5jb25zdCBLRVlfU0laRSA9IDMyO1xuY29uc3QgSVZfU0laRSA9IDE2O1xuY29uc3QgU1RFUF9TSVpFID0gS0VZX1NJWkUgKyBJVl9TSVpFO1xuXG5leHBvcnQgY2xhc3MgU2lnblNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdFNpZ25TZXJ2aWNlIGltcGxlbWVudHMgSVNpZ25TZXJ2aWNlIHtcblx0Y29uc3RydWN0b3IoQElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRWYWxpZGF0b3IoKTogUHJvbWlzZTxJVnNkYVZhbGlkYXRvcj4ge1xuXHRcdHJldHVybiB0aGlzLnZzZGEoKS50aGVuKHZzZGEgPT4ge1xuXHRcdFx0Y29uc3QgdiA9IG5ldyB2c2RhLnZhbGlkYXRvcigpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y3JlYXRlTmV3TWVzc2FnZTogYXJnID0+IHYuY3JlYXRlTmV3TWVzc2FnZShhcmcpLFxuXHRcdFx0XHR2YWxpZGF0ZTogYXJnID0+IHYudmFsaWRhdGUoYXJnKSxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4gdi5mcmVlKCksXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNpZ25WYWx1ZShhcmc6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMudnNkYSgpLnRoZW4odnNkYSA9PiB2c2RhLnNpZ24oYXJnKSk7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRwcml2YXRlIGFzeW5jIHZzZGEoKTogUHJvbWlzZTx0eXBlb2YgdnNkYV93ZWI+IHtcblx0XHRjb25zdCBjaGVja0ludGVydmFsID0gbmV3IFdpbmRvd0ludGVydmFsVGltZXIoKTtcblx0XHRsZXQgW3dhc21dID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0dGhpcy5nZXRXYXNtQnl0ZXMoKSxcblx0XHRcdG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0aW1wb3J0QU1ETm9kZU1vZHVsZSgndnNkYScsICdydXN0L3dlYi92c2RhLmpzJykudGhlbigoKSA9PiByZXNvbHZlKCksIHJlamVjdCk7XG5cblx0XHRcdFx0Ly8gdG9kb0Bjb25ub3I0MzEyOiB0aGVyZSBzZWVtcyB0byBiZSBhIGJ1Zyg/KSBpbiB2c2NvZGUtbG9hZGVyIHdpdGhcblx0XHRcdFx0Ly8gcmVxdWlyZSgpIG5vdCByZXNvbHZpbmcgaW4gd2ViIG9uY2UgdGhlIHNjcmlwdCBsb2Fkcywgc28gY2hlY2sgbWFudWFsbHlcblx0XHRcdFx0Y2hlY2tJbnRlcnZhbC5jYW5jZWxBbmRTZXQoKCkgPT4ge1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgdnNkYV93ZWIgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCA1MCwgbWFpbldpbmRvdyk7XG5cdFx0XHR9KS5maW5hbGx5KCgpID0+IGNoZWNrSW50ZXJ2YWwuZGlzcG9zZSgpKSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IGtleUJ5dGVzID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKHRoaXMucHJvZHVjdFNlcnZpY2Uuc2VydmVyTGljZW5zZT8uam9pbignXFxuJykgfHwgJycpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpICsgU1RFUF9TSVpFIDwga2V5Qnl0ZXMubGVuZ3RoOyBpICs9IFNURVBfU0laRSkge1xuXHRcdFx0Y29uc3Qga2V5ID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5pbXBvcnRLZXkoJ3JhdycsIGtleUJ5dGVzLnNsaWNlKGkgKyBJVl9TSVpFLCBpICsgSVZfU0laRSArIEtFWV9TSVpFKSwgeyBuYW1lOiAnQUVTLUNCQycgfSwgZmFsc2UsIFsnZGVjcnlwdCddKTtcblx0XHRcdHdhc20gPSBhd2FpdCBjcnlwdG8uc3VidGxlLmRlY3J5cHQoeyBuYW1lOiAnQUVTLUNCQycsIGl2OiBrZXlCeXRlcy5zbGljZShpLCBpICsgSVZfU0laRSkgfSwga2V5LCB3YXNtKTtcblx0XHR9XG5cblx0XHRhd2FpdCB2c2RhX3dlYi5kZWZhdWx0KHdhc20pO1xuXG5cdFx0cmV0dXJuIHZzZGFfd2ViO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRXYXNtQnl0ZXMoKTogUHJvbWlzZTxBcnJheUJ1ZmZlcj4ge1xuXHRcdGNvbnN0IHVybCA9IHJlc29sdmVBbWROb2RlTW9kdWxlUGF0aCgndnNkYScsICdydXN0L3dlYi92c2RhX2JnLndhc20nKTtcblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCk7XG5cdFx0aWYgKCFyZXNwb25zZS5vaykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdlcnJvciBsb2FkaW5nIHZzZGEnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzcG9uc2UuYXJyYXlCdWZmZXIoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHFCQUFxQixnQ0FBZ0M7QUFDOUQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMkJBQTJDO0FBeUJwRCxNQUFNLFdBQVc7QUFDakIsTUFBTSxVQUFVO0FBQ2hCLE1BQU0sWUFBWSxXQUFXO0FBRXRCLElBQU0sY0FBTixjQUEwQixvQkFBNEM7QUFBQSxFQUM1RSxZQUE4QyxnQkFBaUM7QUFDOUUsVUFBTTtBQUR1QztBQUFBLEVBRTlDO0FBQUEsRUFDbUIsZUFBd0M7QUFDMUQsV0FBTyxLQUFLLEtBQUssRUFBRSxLQUFLLFVBQVE7QUFDL0IsWUFBTSxJQUFJLElBQUksS0FBSyxVQUFVO0FBQzdCLGFBQU87QUFBQSxRQUNOLGtCQUFrQixTQUFPLEVBQUUsaUJBQWlCLEdBQUc7QUFBQSxRQUMvQyxVQUFVLFNBQU8sRUFBRSxTQUFTLEdBQUc7QUFBQSxRQUMvQixTQUFTLE1BQU0sRUFBRSxLQUFLO0FBQUEsTUFDdkI7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFbUIsVUFBVSxLQUE4QjtBQUMxRCxXQUFPLEtBQUssS0FBSyxFQUFFLEtBQUssVUFBUSxLQUFLLEtBQUssR0FBRyxDQUFDO0FBQUEsRUFDL0M7QUFBQSxFQUdBLE1BQWMsT0FBaUM7QUFDOUMsVUFBTSxnQkFBZ0IsSUFBSSxvQkFBb0I7QUFDOUMsUUFBSSxDQUFDLElBQUksSUFBSSxNQUFNLFFBQVEsSUFBSTtBQUFBLE1BQzlCLEtBQUssYUFBYTtBQUFBLE1BQ2xCLElBQUksUUFBYyxDQUFDLFNBQVMsV0FBVztBQUN0Qyw0QkFBb0IsUUFBUSxrQkFBa0IsRUFBRSxLQUFLLE1BQU0sUUFBUSxHQUFHLE1BQU07QUFJNUUsc0JBQWMsYUFBYSxNQUFNO0FBQ2hDLGNBQUksT0FBTyxhQUFhLGFBQWE7QUFDcEMsb0JBQVE7QUFBQSxVQUNUO0FBQUEsUUFDRCxHQUFHLElBQUksVUFBVTtBQUFBLE1BQ2xCLENBQUMsRUFBRSxRQUFRLE1BQU0sY0FBYyxRQUFRLENBQUM7QUFBQSxJQUN6QyxDQUFDO0FBRUQsVUFBTSxXQUFXLElBQUksWUFBWSxFQUFFLE9BQU8sS0FBSyxlQUFlLGVBQWUsS0FBSyxJQUFJLEtBQUssRUFBRTtBQUM3RixhQUFTLElBQUksR0FBRyxJQUFJLFlBQVksU0FBUyxRQUFRLEtBQUssV0FBVztBQUNoRSxZQUFNLE1BQU0sTUFBTSxPQUFPLE9BQU8sVUFBVSxPQUFPLFNBQVMsTUFBTSxJQUFJLFNBQVMsSUFBSSxVQUFVLFFBQVEsR0FBRyxFQUFFLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUM7QUFDN0ksYUFBTyxNQUFNLE9BQU8sT0FBTyxRQUFRLEVBQUUsTUFBTSxXQUFXLElBQUksU0FBUyxNQUFNLEdBQUcsSUFBSSxPQUFPLEVBQUUsR0FBRyxLQUFLLElBQUk7QUFBQSxJQUN0RztBQUVBLFVBQU0sU0FBUyxRQUFRLElBQUk7QUFFM0IsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMsZUFBcUM7QUFDbEQsVUFBTSxNQUFNLHlCQUF5QixRQUFRLHVCQUF1QjtBQUNwRSxVQUFNLFdBQVcsTUFBTSxNQUFNLEdBQUc7QUFDaEMsUUFBSSxDQUFDLFNBQVMsSUFBSTtBQUNqQixZQUFNLElBQUksTUFBTSxvQkFBb0I7QUFBQSxJQUNyQztBQUVBLFdBQU8sU0FBUyxZQUFZO0FBQUEsRUFDN0I7QUFDRDtBQXJDZTtBQUFBLEVBRGI7QUFBQSxHQW5CVyxZQW9CRTtBQXBCRixjQUFOO0FBQUEsRUFDTztBQUFBLEdBREQ7IiwKICAibmFtZXMiOiBbXQp9Cg==
