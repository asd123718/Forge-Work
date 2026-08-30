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
import { getClientArea, getTopLeftOffset, isHTMLDivElement, isHTMLTextAreaElement } from "../../../../base/browser/dom.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { language, locale } from "../../../../base/common/platform.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import localizedStrings from "../../../../platform/languagePacks/common/localizedStrings.js";
import { getLogs } from "../../../../platform/log/browser/log.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { ILifecycleService, LifecyclePhase } from "../../lifecycle/common/lifecycle.js";
let BrowserWindowDriver = class {
  constructor(fileService, environmentService, lifecycleService, logService) {
    this.fileService = fileService;
    this.environmentService = environmentService;
    this.lifecycleService = lifecycleService;
    this.logService = logService;
  }
  async getLogs() {
    return getLogs(this.fileService, this.environmentService);
  }
  async whenWorkbenchRestored() {
    this.logService.info("[driver] Waiting for restored lifecycle phase...");
    await this.lifecycleService.when(LifecyclePhase.Restored);
    this.logService.info("[driver] Restored lifecycle phase reached. Waiting for contributions...");
    await Registry.as(WorkbenchExtensions.Workbench).whenRestored;
    this.logService.info("[driver] Workbench contributions created.");
  }
  async setValue(selector, text) {
    const element = mainWindow.document.querySelector(selector);
    if (!element) {
      return Promise.reject(new Error(`Element not found: ${selector}`));
    }
    const inputElement = element;
    inputElement.value = text;
    const event = new Event("input", { bubbles: true, cancelable: true });
    inputElement.dispatchEvent(event);
  }
  async isActiveElement(selector) {
    const element = mainWindow.document.querySelector(selector);
    if (element !== mainWindow.document.activeElement) {
      const chain = [];
      let el = mainWindow.document.activeElement;
      while (el) {
        const tagName = el.tagName;
        const id = el.id ? `#${el.id}` : "";
        const classes = coalesce(el.className.split(/\s+/g).map((c) => c.trim())).map((c) => `.${c}`).join("");
        chain.unshift(`${tagName}${id}${classes}`);
        el = el.parentElement;
      }
      throw new Error(`Active element not found. Current active element is '${chain.join(" > ")}'. Looking for ${selector}`);
    }
    return true;
  }
  async getElements(selector, recursive) {
    const query = mainWindow.document.querySelectorAll(selector);
    const result = [];
    for (let i = 0; i < query.length; i++) {
      const element = query.item(i);
      result.push(this.serializeElement(element, recursive));
    }
    return result;
  }
  serializeElement(element, recursive) {
    const attributes = /* @__PURE__ */ Object.create(null);
    for (let j = 0; j < element.attributes.length; j++) {
      const attr = element.attributes.item(j);
      if (attr) {
        attributes[attr.name] = attr.value;
      }
    }
    const children = [];
    if (recursive) {
      for (let i = 0; i < element.children.length; i++) {
        const child = element.children.item(i);
        if (child) {
          children.push(this.serializeElement(child, true));
        }
      }
    }
    const { left, top } = getTopLeftOffset(element);
    return {
      tagName: element.tagName,
      className: element.className,
      textContent: element.textContent || "",
      attributes,
      children,
      left,
      top
    };
  }
  async getElementXY(selector, xoffset, yoffset) {
    const offset = typeof xoffset === "number" && typeof yoffset === "number" ? { x: xoffset, y: yoffset } : void 0;
    return this._getElementXY(selector, offset);
  }
  async typeInEditor(selector, text) {
    const element = mainWindow.document.querySelector(selector);
    if (!element) {
      throw new Error(`Editor not found: ${selector}`);
    }
    if (isHTMLDivElement(element)) {
      const editContext = element.editContext;
      if (!editContext) {
        throw new Error(`Edit context not found: ${selector}`);
      }
      const selectionStart = editContext.selectionStart;
      const selectionEnd = editContext.selectionEnd;
      const event = new TextUpdateEvent("textupdate", {
        updateRangeStart: selectionStart,
        updateRangeEnd: selectionEnd,
        text,
        selectionStart: selectionStart + text.length,
        selectionEnd: selectionStart + text.length,
        compositionStart: 0,
        compositionEnd: 0
      });
      editContext.dispatchEvent(event);
    } else if (isHTMLTextAreaElement(element)) {
      const start = element.selectionStart;
      const newStart = start + text.length;
      const value = element.value;
      const newValue = value.substr(0, start) + text + value.substr(start);
      element.value = newValue;
      element.setSelectionRange(newStart, newStart);
      const event = new Event("input", { "bubbles": true, "cancelable": true });
      element.dispatchEvent(event);
    }
  }
  async getEditorSelection(selector) {
    const element = mainWindow.document.querySelector(selector);
    if (!element) {
      throw new Error(`Editor not found: ${selector}`);
    }
    if (isHTMLDivElement(element)) {
      const editContext = element.editContext;
      if (!editContext) {
        throw new Error(`Edit context not found: ${selector}`);
      }
      return { selectionStart: editContext.selectionStart, selectionEnd: editContext.selectionEnd };
    } else if (isHTMLTextAreaElement(element)) {
      return { selectionStart: element.selectionStart, selectionEnd: element.selectionEnd };
    } else {
      throw new Error(`Unknown type of element: ${selector}`);
    }
  }
  async getTerminalBuffer(selector) {
    const element = mainWindow.document.querySelector(selector);
    if (!element) {
      throw new Error(`Terminal not found: ${selector}`);
    }
    const xterm = element.xterm;
    if (!xterm) {
      throw new Error(`Xterm not found: ${selector}`);
    }
    const lines = [];
    for (let i = 0; i < xterm.buffer.active.length; i++) {
      lines.push(xterm.buffer.active.getLine(i).translateToString(true));
    }
    return lines;
  }
  async writeInTerminal(selector, text) {
    const element = mainWindow.document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    const xterm = element.xterm;
    if (!xterm) {
      throw new Error(`Xterm not found: ${selector}`);
    }
    xterm.input(text);
  }
  getLocaleInfo() {
    return Promise.resolve({
      language,
      locale
    });
  }
  getLocalizedStrings() {
    return Promise.resolve({
      open: localizedStrings.open,
      close: localizedStrings.close,
      find: localizedStrings.find
    });
  }
  async _getElementXY(selector, offset) {
    const element = mainWindow.document.querySelector(selector);
    if (!element) {
      return Promise.reject(new Error(`Element not found: ${selector}`));
    }
    const { left, top } = getTopLeftOffset(element);
    const { width, height } = getClientArea(element);
    let x, y;
    if (offset) {
      x = left + offset.x;
      y = top + offset.y;
    } else {
      x = left + width / 2;
      y = top + height / 2;
    }
    x = Math.round(x);
    y = Math.round(y);
    return { x, y };
  }
};
BrowserWindowDriver = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IEnvironmentService),
  __decorateParam(2, ILifecycleService),
  __decorateParam(3, ILogService)
], BrowserWindowDriver);
function registerWindowDriver(instantiationService) {
  Object.assign(mainWindow, { driver: instantiationService.createInstance(BrowserWindowDriver) });
}
export {
  BrowserWindowDriver,
  registerWindowDriver
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxkcml2ZXJcXGJyb3dzZXJcXGRyaXZlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGdldENsaWVudEFyZWEsIGdldFRvcExlZnRPZmZzZXQsIGlzSFRNTERpdkVsZW1lbnQsIGlzSFRNTFRleHRBcmVhRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgbGFuZ3VhZ2UsIGxvY2FsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IGxvY2FsaXplZFN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFuZ3VhZ2VQYWNrcy9jb21tb24vbG9jYWxpemVkU3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJTG9nRmlsZSwgZ2V0TG9ncyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9icm93c2VyL2xvZy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElXaW5kb3dEcml2ZXIsIElFbGVtZW50LCBJTG9jYWxlSW5mbywgSUxvY2FsaXplZFN0cmluZ3MgfSBmcm9tICcuLi9jb21tb24vZHJpdmVyLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB0eXBlIHsgVGVybWluYWwgYXMgWHRlcm1UZXJtaW5hbCB9IGZyb20gJ0B4dGVybS94dGVybSc7XG5cbmV4cG9ydCBjbGFzcyBCcm93c2VyV2luZG93RHJpdmVyIGltcGxlbWVudHMgSVdpbmRvd0RyaXZlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdH1cblxuXHRhc3luYyBnZXRMb2dzKCk6IFByb21pc2U8SUxvZ0ZpbGVbXT4ge1xuXHRcdHJldHVybiBnZXRMb2dzKHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0fVxuXG5cdGFzeW5jIHdoZW5Xb3JrYmVuY2hSZXN0b3JlZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnW2RyaXZlcl0gV2FpdGluZyBmb3IgcmVzdG9yZWQgbGlmZWN5Y2xlIHBoYXNlLi4uJyk7XG5cdFx0YXdhaXQgdGhpcy5saWZlY3ljbGVTZXJ2aWNlLndoZW4oTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpO1xuXHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbZHJpdmVyXSBSZXN0b3JlZCBsaWZlY3ljbGUgcGhhc2UgcmVhY2hlZC4gV2FpdGluZyBmb3IgY29udHJpYnV0aW9ucy4uLicpO1xuXHRcdGF3YWl0IFJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKS53aGVuUmVzdG9yZWQ7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tkcml2ZXJdIFdvcmtiZW5jaCBjb250cmlidXRpb25zIGNyZWF0ZWQuJyk7XG5cdH1cblxuXHRhc3luYyBzZXRWYWx1ZShzZWxlY3Rvcjogc3RyaW5nLCB0ZXh0OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBlbGVtZW50ID0gbWFpbldpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcblxuXHRcdGlmICghZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihgRWxlbWVudCBub3QgZm91bmQ6ICR7c2VsZWN0b3J9YCkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlucHV0RWxlbWVudCA9IGVsZW1lbnQgYXMgSFRNTElucHV0RWxlbWVudDtcblx0XHRpbnB1dEVsZW1lbnQudmFsdWUgPSB0ZXh0O1xuXG5cdFx0Y29uc3QgZXZlbnQgPSBuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pO1xuXHRcdGlucHV0RWxlbWVudC5kaXNwYXRjaEV2ZW50KGV2ZW50KTtcblx0fVxuXG5cdGFzeW5jIGlzQWN0aXZlRWxlbWVudChzZWxlY3Rvcjogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZWxlbWVudCA9IG1haW5XaW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG5cblx0XHRpZiAoZWxlbWVudCAhPT0gbWFpbldpbmRvdy5kb2N1bWVudC5hY3RpdmVFbGVtZW50KSB7XG5cdFx0XHRjb25zdCBjaGFpbjogc3RyaW5nW10gPSBbXTtcblx0XHRcdGxldCBlbCA9IG1haW5XaW5kb3cuZG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcblxuXHRcdFx0d2hpbGUgKGVsKSB7XG5cdFx0XHRcdGNvbnN0IHRhZ05hbWUgPSBlbC50YWdOYW1lO1xuXHRcdFx0XHRjb25zdCBpZCA9IGVsLmlkID8gYCMke2VsLmlkfWAgOiAnJztcblx0XHRcdFx0Y29uc3QgY2xhc3NlcyA9IGNvYWxlc2NlKGVsLmNsYXNzTmFtZS5zcGxpdCgvXFxzKy9nKS5tYXAoYyA9PiBjLnRyaW0oKSkpLm1hcChjID0+IGAuJHtjfWApLmpvaW4oJycpO1xuXHRcdFx0XHRjaGFpbi51bnNoaWZ0KGAke3RhZ05hbWV9JHtpZH0ke2NsYXNzZXN9YCk7XG5cblx0XHRcdFx0ZWwgPSBlbC5wYXJlbnRFbGVtZW50O1xuXHRcdFx0fVxuXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEFjdGl2ZSBlbGVtZW50IG5vdCBmb3VuZC4gQ3VycmVudCBhY3RpdmUgZWxlbWVudCBpcyAnJHtjaGFpbi5qb2luKCcgPiAnKX0nLiBMb29raW5nIGZvciAke3NlbGVjdG9yfWApO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0YXN5bmMgZ2V0RWxlbWVudHMoc2VsZWN0b3I6IHN0cmluZywgcmVjdXJzaXZlOiBib29sZWFuKTogUHJvbWlzZTxJRWxlbWVudFtdPiB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgcXVlcnkgPSBtYWluV2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpO1xuXHRcdGNvbnN0IHJlc3VsdDogSUVsZW1lbnRbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcXVlcnkubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBxdWVyeS5pdGVtKGkpO1xuXHRcdFx0cmVzdWx0LnB1c2godGhpcy5zZXJpYWxpemVFbGVtZW50KGVsZW1lbnQsIHJlY3Vyc2l2ZSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHNlcmlhbGl6ZUVsZW1lbnQoZWxlbWVudDogRWxlbWVudCwgcmVjdXJzaXZlOiBib29sZWFuKTogSUVsZW1lbnQge1xuXHRcdGNvbnN0IGF0dHJpYnV0ZXMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG5cdFx0Zm9yIChsZXQgaiA9IDA7IGogPCBlbGVtZW50LmF0dHJpYnV0ZXMubGVuZ3RoOyBqKyspIHtcblx0XHRcdGNvbnN0IGF0dHIgPSBlbGVtZW50LmF0dHJpYnV0ZXMuaXRlbShqKTtcblx0XHRcdGlmIChhdHRyKSB7XG5cdFx0XHRcdGF0dHJpYnV0ZXNbYXR0ci5uYW1lXSA9IGF0dHIudmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hpbGRyZW46IElFbGVtZW50W10gPSBbXTtcblxuXHRcdGlmIChyZWN1cnNpdmUpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZWxlbWVudC5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBjaGlsZCA9IGVsZW1lbnQuY2hpbGRyZW4uaXRlbShpKTtcblx0XHRcdFx0aWYgKGNoaWxkKSB7XG5cdFx0XHRcdFx0Y2hpbGRyZW4ucHVzaCh0aGlzLnNlcmlhbGl6ZUVsZW1lbnQoY2hpbGQsIHRydWUpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHsgbGVmdCwgdG9wIH0gPSBnZXRUb3BMZWZ0T2Zmc2V0KGVsZW1lbnQgYXMgSFRNTEVsZW1lbnQpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHRhZ05hbWU6IGVsZW1lbnQudGFnTmFtZSxcblx0XHRcdGNsYXNzTmFtZTogZWxlbWVudC5jbGFzc05hbWUsXG5cdFx0XHR0ZXh0Q29udGVudDogZWxlbWVudC50ZXh0Q29udGVudCB8fCAnJyxcblx0XHRcdGF0dHJpYnV0ZXMsXG5cdFx0XHRjaGlsZHJlbixcblx0XHRcdGxlZnQsXG5cdFx0XHR0b3Bcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgZ2V0RWxlbWVudFhZKHNlbGVjdG9yOiBzdHJpbmcsIHhvZmZzZXQ/OiBudW1iZXIsIHlvZmZzZXQ/OiBudW1iZXIpOiBQcm9taXNlPHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfT4ge1xuXHRcdGNvbnN0IG9mZnNldCA9IHR5cGVvZiB4b2Zmc2V0ID09PSAnbnVtYmVyJyAmJiB0eXBlb2YgeW9mZnNldCA9PT0gJ251bWJlcicgPyB7IHg6IHhvZmZzZXQsIHk6IHlvZmZzZXQgfSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0RWxlbWVudFhZKHNlbGVjdG9yLCBvZmZzZXQpO1xuXHR9XG5cblx0YXN5bmMgdHlwZUluRWRpdG9yKHNlbGVjdG9yOiBzdHJpbmcsIHRleHQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGVsZW1lbnQgPSBtYWluV2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuXG5cdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEVkaXRvciBub3QgZm91bmQ6ICR7c2VsZWN0b3J9YCk7XG5cdFx0fVxuXHRcdGlmIChpc0hUTUxEaXZFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHQvLyBFZGl0IGNvbnRleHQgaXMgZW5hYmxlZFxuXHRcdFx0Y29uc3QgZWRpdENvbnRleHQgPSBlbGVtZW50LmVkaXRDb250ZXh0O1xuXHRcdFx0aWYgKCFlZGl0Q29udGV4dCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEVkaXQgY29udGV4dCBub3QgZm91bmQ6ICR7c2VsZWN0b3J9YCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZWxlY3Rpb25TdGFydCA9IGVkaXRDb250ZXh0LnNlbGVjdGlvblN0YXJ0O1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uRW5kID0gZWRpdENvbnRleHQuc2VsZWN0aW9uRW5kO1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgVGV4dFVwZGF0ZUV2ZW50KCd0ZXh0dXBkYXRlJywge1xuXHRcdFx0XHR1cGRhdGVSYW5nZVN0YXJ0OiBzZWxlY3Rpb25TdGFydCxcblx0XHRcdFx0dXBkYXRlUmFuZ2VFbmQ6IHNlbGVjdGlvbkVuZCxcblx0XHRcdFx0dGV4dCxcblx0XHRcdFx0c2VsZWN0aW9uU3RhcnQ6IHNlbGVjdGlvblN0YXJ0ICsgdGV4dC5sZW5ndGgsXG5cdFx0XHRcdHNlbGVjdGlvbkVuZDogc2VsZWN0aW9uU3RhcnQgKyB0ZXh0Lmxlbmd0aCxcblx0XHRcdFx0Y29tcG9zaXRpb25TdGFydDogMCxcblx0XHRcdFx0Y29tcG9zaXRpb25FbmQ6IDBcblx0XHRcdH0pO1xuXHRcdFx0ZWRpdENvbnRleHQuZGlzcGF0Y2hFdmVudChldmVudCk7XG5cdFx0fSBlbHNlIGlmIChpc0hUTUxUZXh0QXJlYUVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gZWxlbWVudC5zZWxlY3Rpb25TdGFydDtcblx0XHRcdGNvbnN0IG5ld1N0YXJ0ID0gc3RhcnQgKyB0ZXh0Lmxlbmd0aDtcblx0XHRcdGNvbnN0IHZhbHVlID0gZWxlbWVudC52YWx1ZTtcblx0XHRcdGNvbnN0IG5ld1ZhbHVlID0gdmFsdWUuc3Vic3RyKDAsIHN0YXJ0KSArIHRleHQgKyB2YWx1ZS5zdWJzdHIoc3RhcnQpO1xuXG5cdFx0XHRlbGVtZW50LnZhbHVlID0gbmV3VmFsdWU7XG5cdFx0XHRlbGVtZW50LnNldFNlbGVjdGlvblJhbmdlKG5ld1N0YXJ0LCBuZXdTdGFydCk7XG5cblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IEV2ZW50KCdpbnB1dCcsIHsgJ2J1YmJsZXMnOiB0cnVlLCAnY2FuY2VsYWJsZSc6IHRydWUgfSk7XG5cdFx0XHRlbGVtZW50LmRpc3BhdGNoRXZlbnQoZXZlbnQpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldEVkaXRvclNlbGVjdGlvbihzZWxlY3Rvcjogc3RyaW5nKTogUHJvbWlzZTx7IHNlbGVjdGlvblN0YXJ0OiBudW1iZXI7IHNlbGVjdGlvbkVuZDogbnVtYmVyIH0+IHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBlbGVtZW50ID0gbWFpbldpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcblx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgRWRpdG9yIG5vdCBmb3VuZDogJHtzZWxlY3Rvcn1gKTtcblx0XHR9XG5cdFx0aWYgKGlzSFRNTERpdkVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IGVkaXRDb250ZXh0ID0gZWxlbWVudC5lZGl0Q29udGV4dDtcblx0XHRcdGlmICghZWRpdENvbnRleHQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBFZGl0IGNvbnRleHQgbm90IGZvdW5kOiAke3NlbGVjdG9yfWApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgc2VsZWN0aW9uU3RhcnQ6IGVkaXRDb250ZXh0LnNlbGVjdGlvblN0YXJ0LCBzZWxlY3Rpb25FbmQ6IGVkaXRDb250ZXh0LnNlbGVjdGlvbkVuZCB9O1xuXHRcdH0gZWxzZSBpZiAoaXNIVE1MVGV4dEFyZWFFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4geyBzZWxlY3Rpb25TdGFydDogZWxlbWVudC5zZWxlY3Rpb25TdGFydCwgc2VsZWN0aW9uRW5kOiBlbGVtZW50LnNlbGVjdGlvbkVuZCB9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gdHlwZSBvZiBlbGVtZW50OiAke3NlbGVjdG9yfWApO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldFRlcm1pbmFsQnVmZmVyKHNlbGVjdG9yOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZWxlbWVudCA9IG1haW5XaW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG5cblx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVGVybWluYWwgbm90IGZvdW5kOiAke3NlbGVjdG9yfWApO1xuXHRcdH1cblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0cywgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRcdGNvbnN0IHh0ZXJtID0gKGVsZW1lbnQgYXMgYW55KS54dGVybTtcblxuXHRcdGlmICgheHRlcm0pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgWHRlcm0gbm90IGZvdW5kOiAke3NlbGVjdG9yfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgeHRlcm0uYnVmZmVyLmFjdGl2ZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0bGluZXMucHVzaCh4dGVybS5idWZmZXIuYWN0aXZlLmdldExpbmUoaSkhLnRyYW5zbGF0ZVRvU3RyaW5nKHRydWUpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbGluZXM7XG5cdH1cblxuXHRhc3luYyB3cml0ZUluVGVybWluYWwoc2VsZWN0b3I6IHN0cmluZywgdGV4dDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZWxlbWVudCA9IG1haW5XaW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG5cblx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgRWxlbWVudCBub3QgZm91bmQ6ICR7c2VsZWN0b3J9YCk7XG5cdFx0fVxuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0Y29uc3QgeHRlcm0gPSAoZWxlbWVudCBhcyBhbnkpLnh0ZXJtIGFzIChYdGVybVRlcm1pbmFsIHwgdW5kZWZpbmVkKTtcblxuXHRcdGlmICgheHRlcm0pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgWHRlcm0gbm90IGZvdW5kOiAke3NlbGVjdG9yfWApO1xuXHRcdH1cblxuXHRcdHh0ZXJtLmlucHV0KHRleHQpO1xuXHR9XG5cblx0Z2V0TG9jYWxlSW5mbygpOiBQcm9taXNlPElMb2NhbGVJbmZvPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRsYW5ndWFnZTogbGFuZ3VhZ2UsXG5cdFx0XHRsb2NhbGU6IGxvY2FsZVxuXHRcdH0pO1xuXHR9XG5cblx0Z2V0TG9jYWxpemVkU3RyaW5ncygpOiBQcm9taXNlPElMb2NhbGl6ZWRTdHJpbmdzPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRvcGVuOiBsb2NhbGl6ZWRTdHJpbmdzLm9wZW4sXG5cdFx0XHRjbG9zZTogbG9jYWxpemVkU3RyaW5ncy5jbG9zZSxcblx0XHRcdGZpbmQ6IGxvY2FsaXplZFN0cmluZ3MuZmluZFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9nZXRFbGVtZW50WFkoc2VsZWN0b3I6IHN0cmluZywgb2Zmc2V0PzogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogUHJvbWlzZTx7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0+IHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBlbGVtZW50ID0gbWFpbldpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcblxuXHRcdGlmICghZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihgRWxlbWVudCBub3QgZm91bmQ6ICR7c2VsZWN0b3J9YCkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgbGVmdCwgdG9wIH0gPSBnZXRUb3BMZWZ0T2Zmc2V0KGVsZW1lbnQgYXMgSFRNTEVsZW1lbnQpO1xuXHRcdGNvbnN0IHsgd2lkdGgsIGhlaWdodCB9ID0gZ2V0Q2xpZW50QXJlYShlbGVtZW50IGFzIEhUTUxFbGVtZW50KTtcblx0XHRsZXQgeDogbnVtYmVyLCB5OiBudW1iZXI7XG5cblx0XHRpZiAob2Zmc2V0KSB7XG5cdFx0XHR4ID0gbGVmdCArIG9mZnNldC54O1xuXHRcdFx0eSA9IHRvcCArIG9mZnNldC55O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR4ID0gbGVmdCArICh3aWR0aCAvIDIpO1xuXHRcdFx0eSA9IHRvcCArIChoZWlnaHQgLyAyKTtcblx0XHR9XG5cblx0XHR4ID0gTWF0aC5yb3VuZCh4KTtcblx0XHR5ID0gTWF0aC5yb3VuZCh5KTtcblxuXHRcdHJldHVybiB7IHgsIHkgfTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJXaW5kb3dEcml2ZXIoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IHZvaWQge1xuXHRPYmplY3QuYXNzaWduKG1haW5XaW5kb3csIHsgZHJpdmVyOiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShCcm93c2VyV2luZG93RHJpdmVyKSB9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlLGtCQUFrQixrQkFBa0IsNkJBQTZCO0FBQ3pGLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsVUFBVSxjQUFjO0FBQ2pDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CO0FBRTdCLE9BQU8sc0JBQXNCO0FBQzdCLFNBQW1CLGVBQWU7QUFDbEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBMEMsY0FBYywyQkFBMkI7QUFFbkYsU0FB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
