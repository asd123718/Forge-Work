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
import { Emitter } from "../../../../base/common/event.js";
import { parse as parseGlob } from "../../../../base/common/glob.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { isAbsolute, parse as parsePath, dirname } from "../../../../base/common/path.js";
import { dirname as resourceDirname, relativePath as getRelativePath } from "../../../../base/common/resources.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { MRUCache } from "../../../../base/common/map.js";
let CustomEditorLabelService = class extends Disposable {
  constructor(configurationService, workspaceContextService) {
    super();
    this.configurationService = configurationService;
    this.workspaceContextService = workspaceContextService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.patterns = [];
    this.enabled = true;
    this.cache = new MRUCache(1e3);
    this._templateRegexValidation = /[a-zA-Z0-9]/;
    this._parsedTemplateExpression = /\$\{(dirname|filename|extname|extname\((?<extnameN>[-+]?\d+)\)|dirname\((?<dirnameN>[-+]?\d+)\))\}/g;
    this._filenameCaptureExpression = /(?<filename>^\.*[^.]*)/;
    this.storeEnablementState();
    this.storeCustomPatterns();
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CustomEditorLabelService.SETTING_ID_ENABLED)) {
        const oldEnablement = this.enabled;
        this.storeEnablementState();
        if (oldEnablement !== this.enabled && this.patterns.length > 0) {
          this._onDidChange.fire();
        }
      } else if (e.affectsConfiguration(CustomEditorLabelService.SETTING_ID_PATTERNS)) {
        this.cache.clear();
        this.storeCustomPatterns();
        this._onDidChange.fire();
      }
    }));
  }
  storeEnablementState() {
    this.enabled = this.configurationService.getValue(CustomEditorLabelService.SETTING_ID_ENABLED);
  }
  storeCustomPatterns() {
    this.patterns = [];
    const customLabelPatterns = this.configurationService.getValue(CustomEditorLabelService.SETTING_ID_PATTERNS);
    for (const pattern in customLabelPatterns) {
      const template = customLabelPatterns[pattern];
      if (!this._templateRegexValidation.test(template)) {
        continue;
      }
      const isAbsolutePath = isAbsolute(pattern);
      const parsedPattern = parseGlob(pattern, { ignoreCase: true });
      this.patterns.push({ pattern, template, isAbsolutePath, parsedPattern });
    }
    this.patterns.sort((a, b) => this.patternWeight(b.pattern) - this.patternWeight(a.pattern));
  }
  patternWeight(pattern) {
    let weight = 0;
    for (const fragment of pattern.split("/")) {
      if (fragment === "**") {
        weight += 1;
      } else if (fragment === "*") {
        weight += 10;
      } else if (fragment.includes("*") || fragment.includes("?")) {
        weight += 50;
      } else if (fragment !== "") {
        weight += 100;
      }
    }
    return weight;
  }
  getName(resource) {
    if (!this.enabled || this.patterns.length === 0) {
      return void 0;
    }
    const key = resource.toString();
    const cached = this.cache.get(key);
    if (cached !== void 0) {
      return cached ?? void 0;
    }
    const result = this.applyPatterns(resource);
    this.cache.set(key, result ?? null);
    return result;
  }
  applyPatterns(resource) {
    const root = this.workspaceContextService.getWorkspaceFolder(resource);
    let relativePath;
    for (const pattern of this.patterns) {
      let relevantPath;
      if (root && !pattern.isAbsolutePath) {
        if (!relativePath) {
          relativePath = getRelativePath(resourceDirname(root.uri), resource) ?? resource.path;
        }
        relevantPath = relativePath;
      } else {
        relevantPath = resource.path;
      }
      if (pattern.parsedPattern(relevantPath)) {
        return this.applyTemplate(pattern.template, resource, relevantPath);
      }
    }
    return void 0;
  }
  applyTemplate(template, resource, relevantPath) {
    let parsedPath;
    return template.replace(this._parsedTemplateExpression, (match, variable, ...args) => {
      parsedPath = parsedPath ?? parsePath(resource.path);
      const { dirnameN = "0", extnameN = "0" } = args.pop();
      if (variable === "filename") {
        const { filename } = this._filenameCaptureExpression.exec(parsedPath.base)?.groups ?? {};
        if (filename) {
          return filename;
        }
      } else if (variable === "extname") {
        const extension = this.getExtnames(parsedPath.base);
        if (extension) {
          return extension;
        }
      } else if (variable.startsWith("extname")) {
        const n = parseInt(extnameN);
        const nthExtname = this.getNthExtname(parsedPath.base, n);
        if (nthExtname) {
          return nthExtname;
        }
      } else if (variable.startsWith("dirname")) {
        const n = parseInt(dirnameN);
        const nthDir = this.getNthDirname(dirname(relevantPath), n);
        if (nthDir) {
          return nthDir;
        }
      }
      return match;
    });
  }
  removeLeadingDot(path) {
    let withoutLeadingDot = path;
    while (withoutLeadingDot.startsWith(".")) {
      withoutLeadingDot = withoutLeadingDot.slice(1);
    }
    return withoutLeadingDot;
  }
  getNthDirname(path, n) {
    path = path.startsWith("/") ? path.slice(1) : path;
    const pathFragments = path.split("/");
    return this.getNthFragment(pathFragments, n);
  }
  getExtnames(fullFileName) {
    return this.removeLeadingDot(fullFileName).split(".").slice(1).join(".");
  }
  getNthExtname(fullFileName, n) {
    const extensionNameFragments = this.removeLeadingDot(fullFileName).split(".");
    extensionNameFragments.shift();
    return this.getNthFragment(extensionNameFragments, n);
  }
  getNthFragment(fragments, n) {
    const length = fragments.length;
    let nth;
    if (n < 0) {
      nth = Math.abs(n) - 1;
    } else {
      nth = length - n - 1;
    }
    const nthFragment = fragments[nth];
    if (nthFragment === void 0 || nthFragment === "") {
      return void 0;
    }
    return nthFragment;
  }
};
CustomEditorLabelService.SETTING_ID_PATTERNS = "workbench.editor.customLabels.patterns";
CustomEditorLabelService.SETTING_ID_ENABLED = "workbench.editor.customLabels.enabled";
CustomEditorLabelService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IWorkspaceContextService)
], CustomEditorLabelService);
const ICustomEditorLabelService = createDecorator("ICustomEditorLabelService");
registerSingleton(ICustomEditorLabelService, CustomEditorLabelService, InstantiationType.Delayed);
export {
  CustomEditorLabelService,
  ICustomEditorLabelService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxlZGl0b3JcXGNvbW1vblxcY3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBQYXJzZWRQYXR0ZXJuLCBwYXJzZSBhcyBwYXJzZUdsb2IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNBYnNvbHV0ZSwgcGFyc2UgYXMgcGFyc2VQYXRoLCBQYXJzZWRQYXRoLCBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lIGFzIHJlc291cmNlRGlybmFtZSwgcmVsYXRpdmVQYXRoIGFzIGdldFJlbGF0aXZlUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgTVJVQ2FjaGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuXG5pbnRlcmZhY2UgSUN1c3RvbUVkaXRvckxhYmVsT2JqZWN0IHtcblx0cmVhZG9ubHkgW2tleTogc3RyaW5nXTogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSUN1c3RvbUVkaXRvckxhYmVsUGF0dGVybiB7XG5cdHJlYWRvbmx5IHBhdHRlcm46IHN0cmluZztcblx0cmVhZG9ubHkgdGVtcGxhdGU6IHN0cmluZztcblxuXHRyZWFkb25seSBpc0Fic29sdXRlUGF0aDogYm9vbGVhbjtcblx0cmVhZG9ubHkgcGFyc2VkUGF0dGVybjogUGFyc2VkUGF0dGVybjtcbn1cblxuZXhwb3J0IGNsYXNzIEN1c3RvbUVkaXRvckxhYmVsU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0c3RhdGljIHJlYWRvbmx5IFNFVFRJTkdfSURfUEFUVEVSTlMgPSAnd29ya2JlbmNoLmVkaXRvci5jdXN0b21MYWJlbHMucGF0dGVybnMnO1xuXHRzdGF0aWMgcmVhZG9ubHkgU0VUVElOR19JRF9FTkFCTEVEID0gJ3dvcmtiZW5jaC5lZGl0b3IuY3VzdG9tTGFiZWxzLmVuYWJsZWQnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBwYXR0ZXJuczogSUN1c3RvbUVkaXRvckxhYmVsUGF0dGVybltdID0gW107XG5cdHByaXZhdGUgZW5hYmxlZCA9IHRydWU7XG5cblx0cHJpdmF0ZSBjYWNoZSA9IG5ldyBNUlVDYWNoZTxzdHJpbmcsIHN0cmluZyB8IG51bGw+KDEwMDApO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5zdG9yZUVuYWJsZW1lbnRTdGF0ZSgpO1xuXHRcdHRoaXMuc3RvcmVDdXN0b21QYXR0ZXJucygpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdC8vIENhY2hlIHRoZSBlbmFibGVkIHN0YXRlXG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UuU0VUVElOR19JRF9FTkFCTEVEKSkge1xuXHRcdFx0XHRjb25zdCBvbGRFbmFibGVtZW50ID0gdGhpcy5lbmFibGVkO1xuXHRcdFx0XHR0aGlzLnN0b3JlRW5hYmxlbWVudFN0YXRlKCk7XG5cdFx0XHRcdGlmIChvbGRFbmFibGVtZW50ICE9PSB0aGlzLmVuYWJsZWQgJiYgdGhpcy5wYXR0ZXJucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIENhY2hlIHRoZSBwYXR0ZXJuc1xuXHRcdFx0ZWxzZSBpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UuU0VUVElOR19JRF9QQVRURVJOUykpIHtcblx0XHRcdFx0dGhpcy5jYWNoZS5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLnN0b3JlQ3VzdG9tUGF0dGVybnMoKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgc3RvcmVFbmFibGVtZW50U3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UuU0VUVElOR19JRF9FTkFCTEVEKTtcblx0fVxuXG5cdHByaXZhdGUgX3RlbXBsYXRlUmVnZXhWYWxpZGF0aW9uID0gL1thLXpBLVowLTldLztcblx0cHJpdmF0ZSBzdG9yZUN1c3RvbVBhdHRlcm5zKCk6IHZvaWQge1xuXHRcdHRoaXMucGF0dGVybnMgPSBbXTtcblx0XHRjb25zdCBjdXN0b21MYWJlbFBhdHRlcm5zID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJQ3VzdG9tRWRpdG9yTGFiZWxPYmplY3Q+KEN1c3RvbUVkaXRvckxhYmVsU2VydmljZS5TRVRUSU5HX0lEX1BBVFRFUk5TKTtcblx0XHRmb3IgKGNvbnN0IHBhdHRlcm4gaW4gY3VzdG9tTGFiZWxQYXR0ZXJucykge1xuXHRcdFx0Y29uc3QgdGVtcGxhdGUgPSBjdXN0b21MYWJlbFBhdHRlcm5zW3BhdHRlcm5dO1xuXG5cdFx0XHRpZiAoIXRoaXMuX3RlbXBsYXRlUmVnZXhWYWxpZGF0aW9uLnRlc3QodGVtcGxhdGUpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpc0Fic29sdXRlUGF0aCA9IGlzQWJzb2x1dGUocGF0dGVybik7XG5cdFx0XHRjb25zdCBwYXJzZWRQYXR0ZXJuID0gcGFyc2VHbG9iKHBhdHRlcm4sIHsgaWdub3JlQ2FzZTogdHJ1ZSB9KTtcblxuXHRcdFx0dGhpcy5wYXR0ZXJucy5wdXNoKHsgcGF0dGVybiwgdGVtcGxhdGUsIGlzQWJzb2x1dGVQYXRoLCBwYXJzZWRQYXR0ZXJuIH0pO1xuXHRcdH1cblxuXHRcdHRoaXMucGF0dGVybnMuc29ydCgoYSwgYikgPT4gdGhpcy5wYXR0ZXJuV2VpZ2h0KGIucGF0dGVybikgLSB0aGlzLnBhdHRlcm5XZWlnaHQoYS5wYXR0ZXJuKSk7XG5cdH1cblxuXHRwcml2YXRlIHBhdHRlcm5XZWlnaHQocGF0dGVybjogc3RyaW5nKTogbnVtYmVyIHtcblx0XHRsZXQgd2VpZ2h0ID0gMDtcblx0XHRmb3IgKGNvbnN0IGZyYWdtZW50IG9mIHBhdHRlcm4uc3BsaXQoJy8nKSkge1xuXHRcdFx0aWYgKGZyYWdtZW50ID09PSAnKionKSB7XG5cdFx0XHRcdHdlaWdodCArPSAxO1xuXHRcdFx0fSBlbHNlIGlmIChmcmFnbWVudCA9PT0gJyonKSB7XG5cdFx0XHRcdHdlaWdodCArPSAxMDtcblx0XHRcdH0gZWxzZSBpZiAoZnJhZ21lbnQuaW5jbHVkZXMoJyonKSB8fCBmcmFnbWVudC5pbmNsdWRlcygnPycpKSB7XG5cdFx0XHRcdHdlaWdodCArPSA1MDtcblx0XHRcdH0gZWxzZSBpZiAoZnJhZ21lbnQgIT09ICcnKSB7XG5cdFx0XHRcdHdlaWdodCArPSAxMDA7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHdlaWdodDtcblx0fVxuXG5cdGdldE5hbWUocmVzb3VyY2U6IFVSSSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmVuYWJsZWQgfHwgdGhpcy5wYXR0ZXJucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qga2V5ID0gcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLmNhY2hlLmdldChrZXkpO1xuXHRcdGlmIChjYWNoZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGNhY2hlZCA/PyB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5hcHBseVBhdHRlcm5zKHJlc291cmNlKTtcblx0XHR0aGlzLmNhY2hlLnNldChrZXksIHJlc3VsdCA/PyBudWxsKTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFwcGx5UGF0dGVybnMocmVzb3VyY2U6IFVSSSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgcm9vdCA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHJlc291cmNlKTtcblx0XHRsZXQgcmVsYXRpdmVQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0XHRmb3IgKGNvbnN0IHBhdHRlcm4gb2YgdGhpcy5wYXR0ZXJucykge1xuXHRcdFx0bGV0IHJlbGV2YW50UGF0aDogc3RyaW5nO1xuXHRcdFx0aWYgKHJvb3QgJiYgIXBhdHRlcm4uaXNBYnNvbHV0ZVBhdGgpIHtcblx0XHRcdFx0aWYgKCFyZWxhdGl2ZVBhdGgpIHtcblx0XHRcdFx0XHRyZWxhdGl2ZVBhdGggPSBnZXRSZWxhdGl2ZVBhdGgocmVzb3VyY2VEaXJuYW1lKHJvb3QudXJpKSwgcmVzb3VyY2UpID8/IHJlc291cmNlLnBhdGg7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVsZXZhbnRQYXRoID0gcmVsYXRpdmVQYXRoO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVsZXZhbnRQYXRoID0gcmVzb3VyY2UucGF0aDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHBhdHRlcm4ucGFyc2VkUGF0dGVybihyZWxldmFudFBhdGgpKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmFwcGx5VGVtcGxhdGUocGF0dGVybi50ZW1wbGF0ZSwgcmVzb3VyY2UsIHJlbGV2YW50UGF0aCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BhcnNlZFRlbXBsYXRlRXhwcmVzc2lvbiA9IC9cXCRcXHsoZGlybmFtZXxmaWxlbmFtZXxleHRuYW1lfGV4dG5hbWVcXCgoPzxleHRuYW1lTj5bLStdP1xcZCspXFwpfGRpcm5hbWVcXCgoPzxkaXJuYW1lTj5bLStdP1xcZCspXFwpKVxcfS9nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9maWxlbmFtZUNhcHR1cmVFeHByZXNzaW9uID0gLyg/PGZpbGVuYW1lPl5cXC4qW14uXSopLztcblx0cHJpdmF0ZSBhcHBseVRlbXBsYXRlKHRlbXBsYXRlOiBzdHJpbmcsIHJlc291cmNlOiBVUkksIHJlbGV2YW50UGF0aDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRsZXQgcGFyc2VkUGF0aDogdW5kZWZpbmVkIHwgUGFyc2VkUGF0aDtcblx0XHRyZXR1cm4gdGVtcGxhdGUucmVwbGFjZSh0aGlzLl9wYXJzZWRUZW1wbGF0ZUV4cHJlc3Npb24sIChtYXRjaDogc3RyaW5nLCB2YXJpYWJsZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pID0+IHtcblx0XHRcdHBhcnNlZFBhdGggPSBwYXJzZWRQYXRoID8/IHBhcnNlUGF0aChyZXNvdXJjZS5wYXRoKTtcblx0XHRcdC8vIG5hbWVkIGdyb3VwIG1hdGNoZXNcblx0XHRcdGNvbnN0IHsgZGlybmFtZU4gPSAnMCcsIGV4dG5hbWVOID0gJzAnIH0gPSBhcmdzLnBvcCgpIGFzIHsgZGlybmFtZU4/OiBzdHJpbmc7IGV4dG5hbWVOPzogc3RyaW5nIH07XG5cblx0XHRcdGlmICh2YXJpYWJsZSA9PT0gJ2ZpbGVuYW1lJykge1xuXHRcdFx0XHRjb25zdCB7IGZpbGVuYW1lIH0gPSB0aGlzLl9maWxlbmFtZUNhcHR1cmVFeHByZXNzaW9uLmV4ZWMocGFyc2VkUGF0aC5iYXNlKT8uZ3JvdXBzID8/IHt9O1xuXHRcdFx0XHRpZiAoZmlsZW5hbWUpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmlsZW5hbWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAodmFyaWFibGUgPT09ICdleHRuYW1lJykge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSB0aGlzLmdldEV4dG5hbWVzKHBhcnNlZFBhdGguYmFzZSk7XG5cdFx0XHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gZXh0ZW5zaW9uO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHZhcmlhYmxlLnN0YXJ0c1dpdGgoJ2V4dG5hbWUnKSkge1xuXHRcdFx0XHRjb25zdCBuID0gcGFyc2VJbnQoZXh0bmFtZU4pO1xuXHRcdFx0XHRjb25zdCBudGhFeHRuYW1lID0gdGhpcy5nZXROdGhFeHRuYW1lKHBhcnNlZFBhdGguYmFzZSwgbik7XG5cdFx0XHRcdGlmIChudGhFeHRuYW1lKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG50aEV4dG5hbWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAodmFyaWFibGUuc3RhcnRzV2l0aCgnZGlybmFtZScpKSB7XG5cdFx0XHRcdGNvbnN0IG4gPSBwYXJzZUludChkaXJuYW1lTik7XG5cdFx0XHRcdGNvbnN0IG50aERpciA9IHRoaXMuZ2V0TnRoRGlybmFtZShkaXJuYW1lKHJlbGV2YW50UGF0aCksIG4pO1xuXHRcdFx0XHRpZiAobnRoRGlyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG50aERpcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbWF0Y2g7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZUxlYWRpbmdEb3QocGF0aDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRsZXQgd2l0aG91dExlYWRpbmdEb3QgPSBwYXRoO1xuXHRcdHdoaWxlICh3aXRob3V0TGVhZGluZ0RvdC5zdGFydHNXaXRoKCcuJykpIHtcblx0XHRcdHdpdGhvdXRMZWFkaW5nRG90ID0gd2l0aG91dExlYWRpbmdEb3Quc2xpY2UoMSk7XG5cdFx0fVxuXHRcdHJldHVybiB3aXRob3V0TGVhZGluZ0RvdDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TnRoRGlybmFtZShwYXRoOiBzdHJpbmcsIG46IG51bWJlcik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gZ3JhbmQtcGFyZW50L3BhcmVudC9maWxlbmFtZS5leHQxLmV4dDIgLT4gW2dyYW5kLXBhcmVudCwgcGFyZW50XVxuXHRcdHBhdGggPSBwYXRoLnN0YXJ0c1dpdGgoJy8nKSA/IHBhdGguc2xpY2UoMSkgOiBwYXRoO1xuXHRcdGNvbnN0IHBhdGhGcmFnbWVudHMgPSBwYXRoLnNwbGl0KCcvJyk7XG5cblx0XHRyZXR1cm4gdGhpcy5nZXROdGhGcmFnbWVudChwYXRoRnJhZ21lbnRzLCBuKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RXh0bmFtZXMoZnVsbEZpbGVOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnJlbW92ZUxlYWRpbmdEb3QoZnVsbEZpbGVOYW1lKS5zcGxpdCgnLicpLnNsaWNlKDEpLmpvaW4oJy4nKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TnRoRXh0bmFtZShmdWxsRmlsZU5hbWU6IHN0cmluZywgbjogbnVtYmVyKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBmaWxlLmV4dDEuZXh0Mi5leHQzIC0+IFtmaWxlLCBleHQxLCBleHQyLCBleHQzXVxuXHRcdGNvbnN0IGV4dGVuc2lvbk5hbWVGcmFnbWVudHMgPSB0aGlzLnJlbW92ZUxlYWRpbmdEb3QoZnVsbEZpbGVOYW1lKS5zcGxpdCgnLicpO1xuXHRcdGV4dGVuc2lvbk5hbWVGcmFnbWVudHMuc2hpZnQoKTsgLy8gcmVtb3ZlIHRoZSBmaXJzdCBlbGVtZW50IHdoaWNoIGlzIHRoZSBmaWxlIG5hbWVcblxuXHRcdHJldHVybiB0aGlzLmdldE50aEZyYWdtZW50KGV4dGVuc2lvbk5hbWVGcmFnbWVudHMsIG4pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXROdGhGcmFnbWVudChmcmFnbWVudHM6IHN0cmluZ1tdLCBuOiBudW1iZXIpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGxlbmd0aCA9IGZyYWdtZW50cy5sZW5ndGg7XG5cblx0XHRsZXQgbnRoO1xuXHRcdGlmIChuIDwgMCkge1xuXHRcdFx0bnRoID0gTWF0aC5hYnMobikgLSAxO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRudGggPSBsZW5ndGggLSBuIC0gMTtcblx0XHR9XG5cblx0XHRjb25zdCBudGhGcmFnbWVudCA9IGZyYWdtZW50c1tudGhdO1xuXHRcdGlmIChudGhGcmFnbWVudCA9PT0gdW5kZWZpbmVkIHx8IG50aEZyYWdtZW50ID09PSAnJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIG50aEZyYWdtZW50O1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBJQ3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2U+KCdJQ3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUN1c3RvbUVkaXRvckxhYmVsU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHZvaWQ+O1xuXHRnZXROYW1lKHJlc291cmNlOiBVUkkpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UsIEN1c3RvbUVkaXRvckxhYmVsU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBc0I7QUFDL0IsU0FBd0IsU0FBUyxpQkFBaUI7QUFDbEQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxZQUFZLFNBQVMsV0FBdUIsZUFBZTtBQUNwRSxTQUFTLFdBQVcsaUJBQWlCLGdCQUFnQix1QkFBdUI7QUFFNUUsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0JBQWdCO0FBY2xCLElBQU0sMkJBQU4sY0FBdUMsV0FBZ0Q7QUFBQSxFQWU3RixZQUN5QyxzQkFDRyx5QkFDMUM7QUFDRCxVQUFNO0FBSGtDO0FBQ0c7QUFWNUMsU0FBaUIsZUFBZSxLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDbEUsU0FBUyxjQUFjLEtBQUssYUFBYTtBQUV6QyxTQUFRLFdBQXdDLENBQUM7QUFDakQsU0FBUSxVQUFVO0FBRWxCLFNBQVEsUUFBUSxJQUFJLFNBQWdDLEdBQUk7QUFzQ3hELFNBQVEsMkJBQTJCO0FBNkVuQyxTQUFpQiw0QkFBNEI7QUFDN0MsU0FBaUIsNkJBQTZCO0FBNUc3QyxTQUFLLHFCQUFxQjtBQUMxQixTQUFLLG9CQUFvQjtBQUV6QixTQUFLLGtCQUFrQjtBQUFBLEVBQ3hCO0FBQUEsRUFFUSxvQkFBMEI7QUFD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
