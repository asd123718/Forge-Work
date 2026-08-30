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
import * as nls from "../../../nls.js";
import { addDisposableListener, getActiveWindow } from "../../../base/browser/dom.js";
import { createFastDomNode } from "../../../base/browser/fastDomNode.js";
import { Color } from "../../../base/common/color.js";
import { BugIndicatingError } from "../../../base/common/errors.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { observableValue, runOnChange } from "../../../base/common/observable.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { TextureAtlas } from "./atlas/textureAtlas.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { INotificationService, Severity } from "../../../platform/notification/common/notification.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { GPULifecycle } from "./gpuDisposable.js";
import { ensureNonNullable, observeDevicePixelDimensions } from "./gpuUtils.js";
import { RectangleRenderer } from "./rectangleRenderer.js";
import { DecorationCssRuleExtractor } from "./css/decorationCssRuleExtractor.js";
import { Event } from "../../../base/common/event.js";
import { EditorOption } from "../../common/config/editorOptions.js";
import { DecorationStyleCache } from "./css/decorationStyleCache.js";
import { InlineDecorationType } from "../../common/viewModel/inlineDecorations.js";
let ViewGpuContext = class extends Disposable {
  constructor(context, _instantiationService, _notificationService, configurationService, _themeService) {
    super();
    this._instantiationService = _instantiationService;
    this._notificationService = _notificationService;
    this.configurationService = configurationService;
    this._themeService = _themeService;
    /**
     * The hard cap for line columns rendered by the GPU renderer.
     */
    this.maxGpuCols = 2e3;
    this.canvas = createFastDomNode(document.createElement("canvas"));
    this.canvas.setClassName("editorCanvas");
    this._register(Event.runAndSubscribe(configurationService.onDidChangeConfiguration, (e) => {
      if (!e || e.affectsConfiguration("editor.scrollbar.verticalScrollbarSize")) {
        const verticalScrollbarSize = configurationService.getValue("editor").scrollbar?.verticalScrollbarSize ?? 14;
        this.canvas.domNode.style.boxSizing = "border-box";
        this.canvas.domNode.style.paddingRight = `${verticalScrollbarSize}px`;
      }
    }));
    this.ctx = ensureNonNullable(this.canvas.domNode.getContext("webgpu"));
    if (!ViewGpuContext.device) {
      ViewGpuContext.device = GPULifecycle.requestDevice((message) => {
        const choices = [{
          label: nls.localize("editor.dom.render", "Use DOM-based rendering"),
          run: () => this.configurationService.updateValue("editor.experimentalGpuAcceleration", "off")
        }];
        this._notificationService.prompt(Severity.Warning, message, choices);
      }).then((ref) => {
        ViewGpuContext.deviceSync = ref.object;
        if (!ViewGpuContext._atlas) {
          ViewGpuContext._atlas = this._instantiationService.createInstance(TextureAtlas, ref.object.limits.maxTextureDimension2D, void 0, ViewGpuContext.decorationStyleCache);
        }
        return ref.object;
      });
    }
    const dprObs = observableValue(this, getActiveWindow().devicePixelRatio);
    this._register(addDisposableListener(getActiveWindow(), "resize", () => {
      dprObs.set(getActiveWindow().devicePixelRatio, void 0);
    }));
    this.devicePixelRatio = dprObs;
    this._register(runOnChange(this.devicePixelRatio, () => ViewGpuContext.atlas?.clear()));
    this._register(this._themeService.onDidColorThemeChange(() => {
      ViewGpuContext.decorationCssRuleExtractor.clear();
      ViewGpuContext.atlas?.clear();
    }));
    const canvasDevicePixelDimensions = observableValue(this, { width: this.canvas.domNode.width, height: this.canvas.domNode.height });
    this._register(observeDevicePixelDimensions(
      this.canvas.domNode,
      getActiveWindow(),
      (width, height) => {
        this.canvas.domNode.width = width;
        this.canvas.domNode.height = height;
        canvasDevicePixelDimensions.set({ width, height }, void 0);
      }
    ));
    this.canvasDevicePixelDimensions = canvasDevicePixelDimensions;
    const contentLeft = observableValue(this, 0);
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      contentLeft.set(context.configuration.options.get(EditorOption.layoutInfo).contentLeft, void 0);
    }));
    this.contentLeft = contentLeft;
    this.rectangleRenderer = this._register(this._instantiationService.createInstance(RectangleRenderer, context, this.contentLeft, this.devicePixelRatio, this.canvas.domNode, this.ctx, ViewGpuContext.device));
  }
  static get decorationCssRuleExtractor() {
    return ViewGpuContext._decorationCssRuleExtractor;
  }
  static get decorationStyleCache() {
    return ViewGpuContext._decorationStyleCache;
  }
  /**
   * The shared texture atlas to use across all views.
   *
   * @throws if called before the GPU device is resolved
   */
  static get atlas() {
    if (!ViewGpuContext._atlas) {
      throw new BugIndicatingError("Cannot call ViewGpuContext.textureAtlas before device is resolved");
    }
    return ViewGpuContext._atlas;
  }
  /**
   * The shared texture atlas to use across all views. This is a convenience alias for
   * {@link ViewGpuContext.atlas}.
   *
   * @throws if called before the GPU device is resolved
   */
  get atlas() {
    return ViewGpuContext.atlas;
  }
  /**
   * This method determines which lines can be and are allowed to be rendered using the GPU
   * renderer. Eventually this should trend all lines, except maybe exceptional cases like
   * decorations that use class names.
   */
  canRender(options, viewportData, lineNumber) {
    const data = viewportData.getViewLineRenderingData(lineNumber);
    if (data.containsRTL || data.maxColumn > this.maxGpuCols) {
      return false;
    }
    if (data.inlineDecorations.length > 0) {
      let supported = true;
      for (const decoration of data.inlineDecorations) {
        if (decoration.type !== InlineDecorationType.Regular) {
          supported = false;
          break;
        }
        const styleRules = ViewGpuContext._decorationCssRuleExtractor.getStyleRules(this.canvas.domNode, decoration.inlineClassName);
        supported &&= styleRules.every((rule) => {
          if (rule.selectorText.includes(":")) {
            return false;
          }
          for (const r of rule.style) {
            if (!supportsCssRule(r, rule.style)) {
              return false;
            }
          }
          return true;
        });
        if (!supported) {
          break;
        }
      }
      return supported;
    }
    return true;
  }
  /**
   * Like {@link canRender} but returns detailed information about why the line cannot be rendered.
   */
  canRenderDetailed(options, viewportData, lineNumber) {
    const data = viewportData.getViewLineRenderingData(lineNumber);
    const reasons = [];
    if (data.containsRTL) {
      reasons.push("containsRTL");
    }
    if (data.maxColumn > this.maxGpuCols) {
      reasons.push("maxColumn > maxGpuCols");
    }
    if (data.inlineDecorations.length > 0) {
      let supported = true;
      const problemTypes = [];
      const problemSelectors = [];
      const problemRules = [];
      for (const decoration of data.inlineDecorations) {
        if (decoration.type !== InlineDecorationType.Regular) {
          problemTypes.push(decoration.type);
          supported = false;
          continue;
        }
        const styleRules = ViewGpuContext._decorationCssRuleExtractor.getStyleRules(this.canvas.domNode, decoration.inlineClassName);
        supported &&= styleRules.every((rule) => {
          if (rule.selectorText.includes(":")) {
            problemSelectors.push(rule.selectorText);
            return false;
          }
          for (const r of rule.style) {
            if (!supportsCssRule(r, rule.style)) {
              problemRules.push(`${r}: ${rule.style[r]}`);
              return false;
            }
          }
          return true;
        });
        if (!supported) {
          continue;
        }
      }
      if (problemTypes.length > 0) {
        reasons.push(`inlineDecorations with unsupported types (${problemTypes.map((e) => `\`${e}\``).join(", ")})`);
      }
      if (problemRules.length > 0) {
        reasons.push(`inlineDecorations with unsupported CSS rules (${problemRules.map((e) => `\`${e}\``).join(", ")})`);
      }
      if (problemSelectors.length > 0) {
        reasons.push(`inlineDecorations with unsupported CSS selectors (${problemSelectors.map((e) => `\`${e}\``).join(", ")})`);
      }
    }
    return reasons;
  }
};
ViewGpuContext._decorationCssRuleExtractor = new DecorationCssRuleExtractor();
ViewGpuContext._decorationStyleCache = new DecorationStyleCache();
ViewGpuContext = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IThemeService)
], ViewGpuContext);
const gpuSupportedDecorationCssRules = [
  "color",
  "font-weight",
  "opacity",
  "text-decoration",
  "text-decoration-color",
  "text-decoration-line",
  "text-decoration-style",
  "text-decoration-thickness"
];
function supportsCssRule(rule, style) {
  if (!gpuSupportedDecorationCssRules.includes(rule)) {
    return false;
  }
  switch (rule) {
    case "text-decoration":
    case "text-decoration-line": {
      const value = style.getPropertyValue(rule);
      return value === "line-through";
    }
    case "text-decoration-color": {
      const value = style.getPropertyValue(rule);
      if (/^var\(--[^,]+,\s*(?:initial|inherit)\)$/.test(value)) {
        return true;
      }
      return Color.Format.CSS.parse(value) !== null;
    }
    case "text-decoration-style": {
      const value = style.getPropertyValue(rule);
      return value === "initial";
    }
    case "text-decoration-thickness": {
      const value = style.getPropertyValue(rule);
      return value === "initial" || /^\d+(\.\d+)?px$/.test(value);
    }
    default:
      return true;
  }
}
export {
  ViewGpuContext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXGdwdVxcdmlld0dwdUNvbnRleHQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgZ2V0QWN0aXZlV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVGYXN0RG9tTm9kZSwgdHlwZSBGYXN0RG9tTm9kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9mYXN0RG9tTm9kZS5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB0eXBlIHsgVmlld3BvcnREYXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL3ZpZXdMYXlvdXQvdmlld0xpbmVzVmlld3BvcnREYXRhLmpzJztcbmltcG9ydCB0eXBlIHsgVmlld0xpbmVPcHRpb25zIH0gZnJvbSAnLi4vdmlld1BhcnRzL3ZpZXdMaW5lcy92aWV3TGluZU9wdGlvbnMuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlLCBydW5PbkNoYW5nZSwgdHlwZSBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXh0dXJlQXRsYXMgfSBmcm9tICcuL2F0bGFzL3RleHR1cmVBdGxhcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBJUHJvbXB0Q2hvaWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdQVUxpZmVjeWNsZSB9IGZyb20gJy4vZ3B1RGlzcG9zYWJsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb25OdWxsYWJsZSwgb2JzZXJ2ZURldmljZVBpeGVsRGltZW5zaW9ucyB9IGZyb20gJy4vZ3B1VXRpbHMuanMnO1xuaW1wb3J0IHsgUmVjdGFuZ2xlUmVuZGVyZXIgfSBmcm9tICcuL3JlY3RhbmdsZVJlbmRlcmVyLmpzJztcbmltcG9ydCB0eXBlIHsgVmlld0NvbnRleHQgfSBmcm9tICcuLi8uLi9jb21tb24vdmlld01vZGVsL3ZpZXdDb250ZXh0LmpzJztcbmltcG9ydCB7IERlY29yYXRpb25Dc3NSdWxlRXh0cmFjdG9yIH0gZnJvbSAnLi9jc3MvZGVjb3JhdGlvbkNzc1J1bGVFeHRyYWN0b3IuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24sIHR5cGUgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRGVjb3JhdGlvblN0eWxlQ2FjaGUgfSBmcm9tICcuL2Nzcy9kZWNvcmF0aW9uU3R5bGVDYWNoZS5qcyc7XG5pbXBvcnQgeyBJbmxpbmVEZWNvcmF0aW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvaW5saW5lRGVjb3JhdGlvbnMuanMnO1xuXG5leHBvcnQgY2xhc3MgVmlld0dwdUNvbnRleHQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0LyoqXG5cdCAqIFRoZSBoYXJkIGNhcCBmb3IgbGluZSBjb2x1bW5zIHJlbmRlcmVkIGJ5IHRoZSBHUFUgcmVuZGVyZXIuXG5cdCAqL1xuXHRyZWFkb25seSBtYXhHcHVDb2xzID0gMjAwMDtcblxuXHRyZWFkb25seSBjYW52YXM6IEZhc3REb21Ob2RlPEhUTUxDYW52YXNFbGVtZW50Pjtcblx0cmVhZG9ubHkgY3R4OiBHUFVDYW52YXNDb250ZXh0O1xuXG5cdHN0YXRpYyBkZXZpY2U6IFByb21pc2U8R1BVRGV2aWNlPjtcblx0c3RhdGljIGRldmljZVN5bmM6IEdQVURldmljZSB8IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSByZWN0YW5nbGVSZW5kZXJlcjogUmVjdGFuZ2xlUmVuZGVyZXI7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2RlY29yYXRpb25Dc3NSdWxlRXh0cmFjdG9yID0gbmV3IERlY29yYXRpb25Dc3NSdWxlRXh0cmFjdG9yKCk7XG5cdHN0YXRpYyBnZXQgZGVjb3JhdGlvbkNzc1J1bGVFeHRyYWN0b3IoKTogRGVjb3JhdGlvbkNzc1J1bGVFeHRyYWN0b3Ige1xuXHRcdHJldHVybiBWaWV3R3B1Q29udGV4dC5fZGVjb3JhdGlvbkNzc1J1bGVFeHRyYWN0b3I7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfZGVjb3JhdGlvblN0eWxlQ2FjaGUgPSBuZXcgRGVjb3JhdGlvblN0eWxlQ2FjaGUoKTtcblx0c3RhdGljIGdldCBkZWNvcmF0aW9uU3R5bGVDYWNoZSgpOiBEZWNvcmF0aW9uU3R5bGVDYWNoZSB7XG5cdFx0cmV0dXJuIFZpZXdHcHVDb250ZXh0Ll9kZWNvcmF0aW9uU3R5bGVDYWNoZTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9hdGxhczogVGV4dHVyZUF0bGFzIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBUaGUgc2hhcmVkIHRleHR1cmUgYXRsYXMgdG8gdXNlIGFjcm9zcyBhbGwgdmlld3MuXG5cdCAqXG5cdCAqIEB0aHJvd3MgaWYgY2FsbGVkIGJlZm9yZSB0aGUgR1BVIGRldmljZSBpcyByZXNvbHZlZFxuXHQgKi9cblx0c3RhdGljIGdldCBhdGxhcygpOiBUZXh0dXJlQXRsYXMge1xuXHRcdGlmICghVmlld0dwdUNvbnRleHQuX2F0bGFzKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdDYW5ub3QgY2FsbCBWaWV3R3B1Q29udGV4dC50ZXh0dXJlQXRsYXMgYmVmb3JlIGRldmljZSBpcyByZXNvbHZlZCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gVmlld0dwdUNvbnRleHQuX2F0bGFzO1xuXHR9XG5cdC8qKlxuXHQgKiBUaGUgc2hhcmVkIHRleHR1cmUgYXRsYXMgdG8gdXNlIGFjcm9zcyBhbGwgdmlld3MuIFRoaXMgaXMgYSBjb252ZW5pZW5jZSBhbGlhcyBmb3Jcblx0ICoge0BsaW5rIFZpZXdHcHVDb250ZXh0LmF0bGFzfS5cblx0ICpcblx0ICogQHRocm93cyBpZiBjYWxsZWQgYmVmb3JlIHRoZSBHUFUgZGV2aWNlIGlzIHJlc29sdmVkXG5cdCAqL1xuXHRnZXQgYXRsYXMoKTogVGV4dHVyZUF0bGFzIHtcblx0XHRyZXR1cm4gVmlld0dwdUNvbnRleHQuYXRsYXM7XG5cdH1cblxuXHRyZWFkb25seSBjYW52YXNEZXZpY2VQaXhlbERpbWVuc2lvbnM6IElPYnNlcnZhYmxlPHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfT47XG5cdHJlYWRvbmx5IGRldmljZVBpeGVsUmF0aW86IElPYnNlcnZhYmxlPG51bWJlcj47XG5cdHJlYWRvbmx5IGNvbnRlbnRMZWZ0OiBJT2JzZXJ2YWJsZTxudW1iZXI+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRleHQ6IFZpZXdDb250ZXh0LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5jYW52YXMgPSBjcmVhdGVGYXN0RG9tTm9kZShkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKSk7XG5cdFx0dGhpcy5jYW52YXMuc2V0Q2xhc3NOYW1lKCdlZGl0b3JDYW52YXMnKTtcblxuXHRcdC8vIEFkanVzdCB0aGUgY2FudmFzIHNpemUgdG8gYXZvaWQgZHJhd2luZyB1bmRlciB0aGUgc2Nyb2xsIGJhclxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZShjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4ge1xuXHRcdFx0aWYgKCFlIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5zY3JvbGxiYXIudmVydGljYWxTY3JvbGxiYXJTaXplJykpIHtcblx0XHRcdFx0Y29uc3QgdmVydGljYWxTY3JvbGxiYXJTaXplID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUVkaXRvck9wdGlvbnM+KCdlZGl0b3InKS5zY3JvbGxiYXI/LnZlcnRpY2FsU2Nyb2xsYmFyU2l6ZSA/PyAxNDtcblx0XHRcdFx0dGhpcy5jYW52YXMuZG9tTm9kZS5zdHlsZS5ib3hTaXppbmcgPSAnYm9yZGVyLWJveCc7XG5cdFx0XHRcdHRoaXMuY2FudmFzLmRvbU5vZGUuc3R5bGUucGFkZGluZ1JpZ2h0ID0gYCR7dmVydGljYWxTY3JvbGxiYXJTaXplfXB4YDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmN0eCA9IGVuc3VyZU5vbk51bGxhYmxlKHRoaXMuY2FudmFzLmRvbU5vZGUuZ2V0Q29udGV4dCgnd2ViZ3B1JykpO1xuXG5cdFx0Ly8gUmVxdWVzdCB0aGUgR1BVIGRldmljZSwgd2Ugb25seSB3YW50IHRvIGRvIHRoaXMgYSBzaW5nbGUgdGltZSBwZXIgd2luZG93IGFzIGl0J3MgYXN5bmNcblx0XHQvLyBhbmQgY2FuIGRlbGF5IHRoZSBpbml0aWFsIHJlbmRlci5cblx0XHRpZiAoIVZpZXdHcHVDb250ZXh0LmRldmljZSkge1xuXHRcdFx0Vmlld0dwdUNvbnRleHQuZGV2aWNlID0gR1BVTGlmZWN5Y2xlLnJlcXVlc3REZXZpY2UoKG1lc3NhZ2UpID0+IHtcblx0XHRcdFx0Y29uc3QgY2hvaWNlczogSVByb21wdENob2ljZVtdID0gW3tcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdlZGl0b3IuZG9tLnJlbmRlcicsIFwiVXNlIERPTS1iYXNlZCByZW5kZXJpbmdcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCdlZGl0b3IuZXhwZXJpbWVudGFsR3B1QWNjZWxlcmF0aW9uJywgJ29mZicpLFxuXHRcdFx0XHR9XTtcblx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuV2FybmluZywgbWVzc2FnZSwgY2hvaWNlcyk7XG5cdFx0XHR9KS50aGVuKHJlZiA9PiB7XG5cdFx0XHRcdFZpZXdHcHVDb250ZXh0LmRldmljZVN5bmMgPSByZWYub2JqZWN0O1xuXHRcdFx0XHRpZiAoIVZpZXdHcHVDb250ZXh0Ll9hdGxhcykge1xuXHRcdFx0XHRcdFZpZXdHcHVDb250ZXh0Ll9hdGxhcyA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHR1cmVBdGxhcywgcmVmLm9iamVjdC5saW1pdHMubWF4VGV4dHVyZURpbWVuc2lvbjJELCB1bmRlZmluZWQsIFZpZXdHcHVDb250ZXh0LmRlY29yYXRpb25TdHlsZUNhY2hlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcmVmLm9iamVjdDtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRwck9icyA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBnZXRBY3RpdmVXaW5kb3coKS5kZXZpY2VQaXhlbFJhdGlvKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIoZ2V0QWN0aXZlV2luZG93KCksICdyZXNpemUnLCAoKSA9PiB7XG5cdFx0XHRkcHJPYnMuc2V0KGdldEFjdGl2ZVdpbmRvdygpLmRldmljZVBpeGVsUmF0aW8sIHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuZGV2aWNlUGl4ZWxSYXRpbyA9IGRwck9icztcblx0XHR0aGlzLl9yZWdpc3RlcihydW5PbkNoYW5nZSh0aGlzLmRldmljZVBpeGVsUmF0aW8sICgpID0+IFZpZXdHcHVDb250ZXh0LmF0bGFzPy5jbGVhcigpKSk7XG5cblx0XHQvLyBDbGVhciBkZWNvcmF0aW9uIENTUyBjYWNoZXMgd2hlbiB0aGVtZSBjaGFuZ2VzIGFzIENTUyB2YXJpYWJsZXMgbWF5IGhhdmUgZGlmZmVyZW50IHZhbHVlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0Vmlld0dwdUNvbnRleHQuZGVjb3JhdGlvbkNzc1J1bGVFeHRyYWN0b3IuY2xlYXIoKTtcblx0XHRcdFZpZXdHcHVDb250ZXh0LmF0bGFzPy5jbGVhcigpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGNhbnZhc0RldmljZVBpeGVsRGltZW5zaW9ucyA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB7IHdpZHRoOiB0aGlzLmNhbnZhcy5kb21Ob2RlLndpZHRoLCBoZWlnaHQ6IHRoaXMuY2FudmFzLmRvbU5vZGUuaGVpZ2h0IH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG9ic2VydmVEZXZpY2VQaXhlbERpbWVuc2lvbnMoXG5cdFx0XHR0aGlzLmNhbnZhcy5kb21Ob2RlLFxuXHRcdFx0Z2V0QWN0aXZlV2luZG93KCksXG5cdFx0XHQod2lkdGgsIGhlaWdodCkgPT4ge1xuXHRcdFx0XHR0aGlzLmNhbnZhcy5kb21Ob2RlLndpZHRoID0gd2lkdGg7XG5cdFx0XHRcdHRoaXMuY2FudmFzLmRvbU5vZGUuaGVpZ2h0ID0gaGVpZ2h0O1xuXHRcdFx0XHRjYW52YXNEZXZpY2VQaXhlbERpbWVuc2lvbnMuc2V0KHsgd2lkdGgsIGhlaWdodCB9LCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdCkpO1xuXHRcdHRoaXMuY2FudmFzRGV2aWNlUGl4ZWxEaW1lbnNpb25zID0gY2FudmFzRGV2aWNlUGl4ZWxEaW1lbnNpb25zO1xuXG5cdFx0Y29uc3QgY29udGVudExlZnQgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgMCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRjb250ZW50TGVmdC5zZXQoY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvKS5jb250ZW50TGVmdCwgdW5kZWZpbmVkKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5jb250ZW50TGVmdCA9IGNvbnRlbnRMZWZ0O1xuXG5cdFx0dGhpcy5yZWN0YW5nbGVSZW5kZXJlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlY3RhbmdsZVJlbmRlcmVyLCBjb250ZXh0LCB0aGlzLmNvbnRlbnRMZWZ0LCB0aGlzLmRldmljZVBpeGVsUmF0aW8sIHRoaXMuY2FudmFzLmRvbU5vZGUsIHRoaXMuY3R4LCBWaWV3R3B1Q29udGV4dC5kZXZpY2UpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGlzIG1ldGhvZCBkZXRlcm1pbmVzIHdoaWNoIGxpbmVzIGNhbiBiZSBhbmQgYXJlIGFsbG93ZWQgdG8gYmUgcmVuZGVyZWQgdXNpbmcgdGhlIEdQVVxuXHQgKiByZW5kZXJlci4gRXZlbnR1YWxseSB0aGlzIHNob3VsZCB0cmVuZCBhbGwgbGluZXMsIGV4Y2VwdCBtYXliZSBleGNlcHRpb25hbCBjYXNlcyBsaWtlXG5cdCAqIGRlY29yYXRpb25zIHRoYXQgdXNlIGNsYXNzIG5hbWVzLlxuXHQgKi9cblx0cHVibGljIGNhblJlbmRlcihvcHRpb25zOiBWaWV3TGluZU9wdGlvbnMsIHZpZXdwb3J0RGF0YTogVmlld3BvcnREYXRhLCBsaW5lTnVtYmVyOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRjb25zdCBkYXRhID0gdmlld3BvcnREYXRhLmdldFZpZXdMaW5lUmVuZGVyaW5nRGF0YShsaW5lTnVtYmVyKTtcblxuXHRcdC8vIENoZWNrIGlmIHRoZSBsaW5lIGhhcyBzaW1wbGUgYXR0cmlidXRlcyB0aGF0IGFyZW4ndCBzdXBwb3J0ZWRcblx0XHRpZiAoXG5cdFx0XHRkYXRhLmNvbnRhaW5zUlRMIHx8XG5cdFx0XHRkYXRhLm1heENvbHVtbiA+IHRoaXMubWF4R3B1Q29sc1xuXHRcdCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIGFsbCBpbmxpbmUgZGVjb3JhdGlvbnMgYXJlIHN1cHBvcnRlZFxuXHRcdGlmIChkYXRhLmlubGluZURlY29yYXRpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGxldCBzdXBwb3J0ZWQgPSB0cnVlO1xuXHRcdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uIG9mIGRhdGEuaW5saW5lRGVjb3JhdGlvbnMpIHtcblx0XHRcdFx0aWYgKGRlY29yYXRpb24udHlwZSAhPT0gSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhcikge1xuXHRcdFx0XHRcdHN1cHBvcnRlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHN0eWxlUnVsZXMgPSBWaWV3R3B1Q29udGV4dC5fZGVjb3JhdGlvbkNzc1J1bGVFeHRyYWN0b3IuZ2V0U3R5bGVSdWxlcyh0aGlzLmNhbnZhcy5kb21Ob2RlLCBkZWNvcmF0aW9uLmlubGluZUNsYXNzTmFtZSk7XG5cdFx0XHRcdHN1cHBvcnRlZCAmJj0gc3R5bGVSdWxlcy5ldmVyeShydWxlID0+IHtcblx0XHRcdFx0XHQvLyBQc2V1ZG8gY2xhc3NlcyBhcmVuJ3Qgc3VwcG9ydGVkIGN1cnJlbnRseVxuXHRcdFx0XHRcdGlmIChydWxlLnNlbGVjdG9yVGV4dC5pbmNsdWRlcygnOicpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGZvciAoY29uc3QgciBvZiBydWxlLnN0eWxlKSB7XG5cdFx0XHRcdFx0XHRpZiAoIXN1cHBvcnRzQ3NzUnVsZShyLCBydWxlLnN0eWxlKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKCFzdXBwb3J0ZWQpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHN1cHBvcnRlZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMaWtlIHtAbGluayBjYW5SZW5kZXJ9IGJ1dCByZXR1cm5zIGRldGFpbGVkIGluZm9ybWF0aW9uIGFib3V0IHdoeSB0aGUgbGluZSBjYW5ub3QgYmUgcmVuZGVyZWQuXG5cdCAqL1xuXHRwdWJsaWMgY2FuUmVuZGVyRGV0YWlsZWQob3B0aW9uczogVmlld0xpbmVPcHRpb25zLCB2aWV3cG9ydERhdGE6IFZpZXdwb3J0RGF0YSwgbGluZU51bWJlcjogbnVtYmVyKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IGRhdGEgPSB2aWV3cG9ydERhdGEuZ2V0Vmlld0xpbmVSZW5kZXJpbmdEYXRhKGxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKGRhdGEuY29udGFpbnNSVEwpIHtcblx0XHRcdHJlYXNvbnMucHVzaCgnY29udGFpbnNSVEwnKTtcblx0XHR9XG5cdFx0aWYgKGRhdGEubWF4Q29sdW1uID4gdGhpcy5tYXhHcHVDb2xzKSB7XG5cdFx0XHRyZWFzb25zLnB1c2goJ21heENvbHVtbiA+IG1heEdwdUNvbHMnKTtcblx0XHR9XG5cdFx0aWYgKGRhdGEuaW5saW5lRGVjb3JhdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0bGV0IHN1cHBvcnRlZCA9IHRydWU7XG5cdFx0XHRjb25zdCBwcm9ibGVtVHlwZXM6IElubGluZURlY29yYXRpb25UeXBlW10gPSBbXTtcblx0XHRcdGNvbnN0IHByb2JsZW1TZWxlY3RvcnM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBwcm9ibGVtUnVsZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGRlY29yYXRpb24gb2YgZGF0YS5pbmxpbmVEZWNvcmF0aW9ucykge1xuXHRcdFx0XHRpZiAoZGVjb3JhdGlvbi50eXBlICE9PSBJbmxpbmVEZWNvcmF0aW9uVHlwZS5SZWd1bGFyKSB7XG5cdFx0XHRcdFx0cHJvYmxlbVR5cGVzLnB1c2goZGVjb3JhdGlvbi50eXBlKTtcblx0XHRcdFx0XHRzdXBwb3J0ZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzdHlsZVJ1bGVzID0gVmlld0dwdUNvbnRleHQuX2RlY29yYXRpb25Dc3NSdWxlRXh0cmFjdG9yLmdldFN0eWxlUnVsZXModGhpcy5jYW52YXMuZG9tTm9kZSwgZGVjb3JhdGlvbi5pbmxpbmVDbGFzc05hbWUpO1xuXHRcdFx0XHRzdXBwb3J0ZWQgJiY9IHN0eWxlUnVsZXMuZXZlcnkocnVsZSA9PiB7XG5cdFx0XHRcdFx0Ly8gUHNldWRvIGNsYXNzZXMgYXJlbid0IHN1cHBvcnRlZCBjdXJyZW50bHlcblx0XHRcdFx0XHRpZiAocnVsZS5zZWxlY3RvclRleHQuaW5jbHVkZXMoJzonKSkge1xuXHRcdFx0XHRcdFx0cHJvYmxlbVNlbGVjdG9ycy5wdXNoKHJ1bGUuc2VsZWN0b3JUZXh0KTtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Zm9yIChjb25zdCByIG9mIHJ1bGUuc3R5bGUpIHtcblx0XHRcdFx0XHRcdGlmICghc3VwcG9ydHNDc3NSdWxlKHIsIHJ1bGUuc3R5bGUpKSB7XG5cdFx0XHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0cywgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRcdFx0XHRcdFx0XHRwcm9ibGVtUnVsZXMucHVzaChgJHtyfTogJHtydWxlLnN0eWxlW3IgYXMgYW55XX1gKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmICghc3VwcG9ydGVkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChwcm9ibGVtVHlwZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZWFzb25zLnB1c2goYGlubGluZURlY29yYXRpb25zIHdpdGggdW5zdXBwb3J0ZWQgdHlwZXMgKCR7cHJvYmxlbVR5cGVzLm1hcChlID0+IGBcXGAke2V9XFxgYCkuam9pbignLCAnKX0pYCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJvYmxlbVJ1bGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cmVhc29ucy5wdXNoKGBpbmxpbmVEZWNvcmF0aW9ucyB3aXRoIHVuc3VwcG9ydGVkIENTUyBydWxlcyAoJHtwcm9ibGVtUnVsZXMubWFwKGUgPT4gYFxcYCR7ZX1cXGBgKS5qb2luKCcsICcpfSlgKTtcblx0XHRcdH1cblx0XHRcdGlmIChwcm9ibGVtU2VsZWN0b3JzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cmVhc29ucy5wdXNoKGBpbmxpbmVEZWNvcmF0aW9ucyB3aXRoIHVuc3VwcG9ydGVkIENTUyBzZWxlY3RvcnMgKCR7cHJvYmxlbVNlbGVjdG9ycy5tYXAoZSA9PiBgXFxgJHtlfVxcYGApLmpvaW4oJywgJyl9KWApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVhc29ucztcblx0fVxufVxuXG4vKipcbiAqIEEgbGlzdCBvZiBzdXBwb3J0ZWQgZGVjb3JhdGlvbiBDU1MgcnVsZXMgdGhhdCBjYW4gYmUgdXNlZCBpbiB0aGUgR1BVIHJlbmRlcmVyLlxuICovXG5jb25zdCBncHVTdXBwb3J0ZWREZWNvcmF0aW9uQ3NzUnVsZXMgPSBbXG5cdCdjb2xvcicsXG5cdCdmb250LXdlaWdodCcsXG5cdCdvcGFjaXR5Jyxcblx0J3RleHQtZGVjb3JhdGlvbicsXG5cdCd0ZXh0LWRlY29yYXRpb24tY29sb3InLFxuXHQndGV4dC1kZWNvcmF0aW9uLWxpbmUnLFxuXHQndGV4dC1kZWNvcmF0aW9uLXN0eWxlJyxcblx0J3RleHQtZGVjb3JhdGlvbi10aGlja25lc3MnLFxuXTtcblxuZnVuY3Rpb24gc3VwcG9ydHNDc3NSdWxlKHJ1bGU6IHN0cmluZywgc3R5bGU6IENTU1N0eWxlRGVjbGFyYXRpb24pIHtcblx0aWYgKCFncHVTdXBwb3J0ZWREZWNvcmF0aW9uQ3NzUnVsZXMuaW5jbHVkZXMocnVsZSkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Ly8gQ2hlY2sgZm9yIHZhbHVlcyB0aGF0IGFyZW4ndCBzdXBwb3J0ZWRcblx0c3dpdGNoIChydWxlKSB7XG5cdFx0Y2FzZSAndGV4dC1kZWNvcmF0aW9uJzpcblx0XHRjYXNlICd0ZXh0LWRlY29yYXRpb24tbGluZSc6IHtcblx0XHRcdGNvbnN0IHZhbHVlID0gc3R5bGUuZ2V0UHJvcGVydHlWYWx1ZShydWxlKTtcblx0XHRcdC8vIE9ubHkgbGluZS10aHJvdWdoIGlzIHN1cHBvcnRlZCBjdXJyZW50bHlcblx0XHRcdHJldHVybiB2YWx1ZSA9PT0gJ2xpbmUtdGhyb3VnaCc7XG5cdFx0fVxuXHRcdGNhc2UgJ3RleHQtZGVjb3JhdGlvbi1jb2xvcic6IHtcblx0XHRcdGNvbnN0IHZhbHVlID0gc3R5bGUuZ2V0UHJvcGVydHlWYWx1ZShydWxlKTtcblx0XHRcdC8vIFN1cHBvcnQgdmFyKC0tc29tZXRoaW5nLCBpbml0aWFsL2luaGVyaXQpIHdoaWNoIGZhbGxzIGJhY2sgdG8gY3VycmVudGNvbG9yXG5cdFx0XHRpZiAoL152YXJcXCgtLVteLF0rLFxccyooPzppbml0aWFsfGluaGVyaXQpXFwpJC8udGVzdCh2YWx1ZSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBTdXBwb3J0IHBhcnNlZCBjb2xvciB2YWx1ZXNcblx0XHRcdHJldHVybiBDb2xvci5Gb3JtYXQuQ1NTLnBhcnNlKHZhbHVlKSAhPT0gbnVsbDtcblx0XHR9XG5cdFx0Y2FzZSAndGV4dC1kZWNvcmF0aW9uLXN0eWxlJzoge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBzdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKHJ1bGUpO1xuXHRcdFx0Ly8gT25seSAnaW5pdGlhbCcgKHNvbGlkKSBpcyBzdXBwb3J0ZWRcblx0XHRcdHJldHVybiB2YWx1ZSA9PT0gJ2luaXRpYWwnO1xuXHRcdH1cblx0XHRjYXNlICd0ZXh0LWRlY29yYXRpb24tdGhpY2tuZXNzJzoge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBzdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKHJ1bGUpO1xuXHRcdFx0Ly8gT25seSBwaXhlbCB2YWx1ZXMgYW5kICdpbml0aWFsJyBhcmUgc3VwcG9ydGVkXG5cdFx0XHRyZXR1cm4gdmFsdWUgPT09ICdpbml0aWFsJyB8fCAvXlxcZCsoXFwuXFxkKyk/cHgkLy50ZXN0KHZhbHVlKTtcblx0XHR9XG5cdFx0ZGVmYXVsdDogcmV0dXJuIHRydWU7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsdUJBQXVCLHVCQUF1QjtBQUN2RCxTQUFTLHlCQUEyQztBQUNwRCxTQUFTLGFBQWE7QUFDdEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxrQkFBa0I7QUFHM0IsU0FBUyxpQkFBaUIsbUJBQXFDO0FBQy9ELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXFDLGdCQUFnQjtBQUM5RCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1CQUFtQixvQ0FBb0M7QUFDaEUsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsb0JBQXlDO0FBQ2xELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsNEJBQTRCO0FBRTlCLElBQU0saUJBQU4sY0FBNkIsV0FBVztBQUFBLEVBbUQ5QyxZQUNDLFNBQ3dDLHVCQUNELHNCQUNDLHNCQUNSLGVBQy9CO0FBQ0QsVUFBTTtBQUxrQztBQUNEO0FBQ0M7QUFDUjtBQXBEakM7QUFBQTtBQUFBO0FBQUEsU0FBUyxhQUFhO0FBd0RyQixTQUFLLFNBQVMsa0JBQWtCLFNBQVMsY0FBYyxRQUFRLENBQUM7QUFDaEUsU0FBSyxPQUFPLGFBQWEsY0FBYztBQUd2QyxTQUFLLFVBQVUsTUFBTSxnQkFBZ0IscUJBQXFCLDBCQUEwQixPQUFLO0FBQ3hGLFVBQUksQ0FBQyxLQUFLLEVBQUUscUJBQXFCLHdDQUF3QyxHQUFHO0FBQzNFLGNBQU0sd0JBQXdCLHFCQUFxQixTQUF5QixRQUFRLEVBQUUsV0FBVyx5QkFBeUI7QUFDMUgsYUFBSyxPQUFPLFFBQVEsTUFBTSxZQUFZO0FBQ3RDLGFBQUssT0FBTyxRQUFRLE1BQU0sZUFBZSxHQUFHLHFCQUFxQjtBQUFBLE1BQ2xFO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLE1BQU0sa0JBQWtCLEtBQUssT0FBTyxRQUFRLFdBQVcsUUFBUSxDQUFDO0FBSXJFLFFBQUksQ0FBQyxlQUFlLFFBQVE7QUFDM0IscUJBQWUsU0FBUyxhQUFhLGNBQWMsQ0FBQyxZQUFZO0FBQy9ELGNBQU0sVUFBMkIsQ0FBQztBQUFBLFVBQ2pDLE9BQU8sSUFBSSxTQUFTLHFCQUFxQix5QkFBeUI7QUFBQSxVQUNsRSxLQUFLLE1BQU0sS0FBSyxxQkFBcUIsWUFBWSxzQ0FBc0MsS0FBSztBQUFBLFFBQzdGLENBQUM7QUFDRCxhQUFLLHFCQUFxQixPQUFPLFNBQVMsU0FBUyxTQUFTLE9BQU87QUFBQSxNQUNwRSxDQUFDLEVBQUUsS0FBSyxTQUFPO0FBQ2QsdUJBQWUsYUFBYSxJQUFJO0FBQ2hDLFlBQUksQ0FBQyxlQUFlLFFBQVE7QUFDM0IseUJBQWUsU0FBUyxLQUFLLHNCQUFzQixlQUFlLGNBQWMsSUFBSSxPQUFPLE9BQU8sdUJBQXVCLFFBQVcsZUFBZSxvQkFBb0I7QUFBQSxRQUN4SztBQUNBLGVBQU8sSUFBSTtBQUFBLE1BQ1osQ0FBQztBQUFBLElBQ0Y7QUFFQSxVQUFNLFNBQVMsZ0JBQWdCLE1BQU0sZ0JBQWdCLEVBQUUsZ0JBQWdCO0FBQ3ZFLFNBQUssVUFBVSxzQkFBc0IsZ0JBQWdCLEdBQUcsVUFBVSxNQUFNO0FBQ3ZFLGFBQU8sSUFBSSxnQkFBZ0IsRUFBRSxrQkFBa0IsTUFBUztBQUFBLElBQ3pELENBQUMsQ0FBQztBQUNGLFNBQUssbUJBQW1CO0FBQ3hCLFNBQUssVUFBVSxZQUFZLEtBQUssa0JBQWtCLE1BQU0sZUFBZSxPQUFPLE1BQU0sQ0FBQyxDQUFDO0FBR3RGLFNBQUssVUFBVSxLQUFLLGNBQWMsc0JBQXNCLE1BQU07QUFDN0QscUJBQWUsMkJBQTJCLE1BQU07QUFDaEQscUJBQWUsT0FBTyxNQUFNO0FBQUEsSUFDN0IsQ0FBQyxDQUFDO0FBRUYsVUFBTSw4QkFBOEIsZ0JBQWdCLE1BQU0sRUFBRSxPQUFPLEtBQUssT0FBTyxRQUFRLE9BQU8sUUFBUSxLQUFLLE9BQU8sUUFBUSxPQUFPLENBQUM7QUFDbEksU0FBSyxVQUFVO0FBQUEsTUFDZCxLQUFLLE9BQU87QUFBQSxNQUNaLGdCQUFnQjtBQUFBLE1BQ2hCLENBQUMsT0FBTyxXQUFXO0FBQ2xCLGFBQUssT0FBTyxRQUFRLFFBQVE7QUFDNUIsYUFBSyxPQUFPLFFBQVEsU0FBUztBQUM3QixvQ0FBNEIsSUFBSSxFQUFFLE9BQU8sT0FBTyxHQUFHLE1BQVM7QUFBQSxNQUM3RDtBQUFBLElBQ0QsQ0FBQztBQUNELFNBQUssOEJBQThCO0FBRW5DLFVBQU0sY0FBYyxnQkFBZ0IsTUFBTSxDQUFDO0FBQzNDLFNBQUssVUFBVSxLQUFLLHFCQUFxQix5QkFBeUIsT0FBSztBQUN0RSxrQkFBWSxJQUFJLFFBQVEsY0FBYyxRQUFRLElBQUksYUFBYSxVQUFVLEVBQUUsYUFBYSxNQUFTO0FBQUEsSUFDbEcsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxjQUFjO0FBRW5CLFNBQUssb0JBQW9CLEtBQUssVUFBVSxLQUFLLHNCQUFzQixlQUFlLG1CQUFtQixTQUFTLEtBQUssYUFBYSxLQUFLLGtCQUFrQixLQUFLLE9BQU8sU0FBUyxLQUFLLEtBQUssZUFBZSxNQUFNLENBQUM7QUFBQSxFQUM3TTtBQUFBLEVBN0dBLFdBQVcsNkJBQXlEO0FBQ25FLFdBQU8sZUFBZTtBQUFBLEVBQ3ZCO0FBQUEsRUFHQSxXQUFXLHVCQUE2QztBQUN2RCxXQUFPLGVBQWU7QUFBQSxFQUN2QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVNBLFdBQVcsUUFBc0I7QUFDaEMsUUFBSSxDQUFDLGVBQWUsUUFBUTtBQUMzQixZQUFNLElBQUksbUJBQW1CLG1FQUFtRTtBQUFBLElBQ2pHO0FBQ0EsV0FBTyxlQUFlO0FBQUEsRUFDdkI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9BLElBQUksUUFBc0I7QUFDekIsV0FBTyxlQUFlO0FBQUEsRUFDdkI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFzRk8sVUFBVSxTQUEwQixjQUE0QixZQUE2QjtBQUNuRyxVQUFNLE9BQU8sYUFBYSx5QkFBeUIsVUFBVTtBQUc3RCxRQUNDLEtBQUssZUFDTCxLQUFLLFlBQVksS0FBSyxZQUNyQjtBQUNELGFBQU87QUFBQSxJQUNSO0FBR0EsUUFBSSxLQUFLLGtCQUFrQixTQUFTLEdBQUc7QUFDdEMsVUFBSSxZQUFZO0FBQ2hCLGlCQUFXLGNBQWMsS0FBSyxtQkFBbUI7QUFDaEQsWUFBSSxXQUFXLFNBQVMscUJBQXFCLFNBQVM7QUFDckQsc0JBQVk7QUFDWjtBQUFBLFFBQ0Q7QUFDQSxjQUFNLGFBQWEsZUFBZSw0QkFBNEIsY0FBYyxLQUFLLE9BQU8sU0FBUyxXQUFXLGVBQWU7QUFDM0gsc0JBQWMsV0FBVyxNQUFNLFVBQVE7QUFFdEMsY0FBSSxLQUFLLGFBQWEsU0FBUyxHQUFHLEdBQUc7QUFDcEMsbUJBQU87QUFBQSxVQUNSO0FBQ0EscUJBQVcsS0FBSyxLQUFLLE9BQU87QUFDM0IsZ0JBQUksQ0FBQyxnQkFBZ0IsR0FBRyxLQUFLLEtBQUssR0FBRztBQUNwQyxxQkFBTztBQUFBLFlBQ1I7QUFBQSxVQUNEO0FBQ0EsaUJBQU87QUFBQSxRQUNSLENBQUM7QUFDRCxZQUFJLENBQUMsV0FBVztBQUNmO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFDQSxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLTyxrQkFBa0IsU0FBMEIsY0FBNEIsWUFBOEI7QUFDNUcsVUFBTSxPQUFPLGFBQWEseUJBQXlCLFVBQVU7QUFDN0QsVUFBTSxVQUFvQixDQUFDO0FBQzNCLFFBQUksS0FBSyxhQUFhO0FBQ3JCLGNBQVEsS0FBSyxhQUFhO0FBQUEsSUFDM0I7QUFDQSxRQUFJLEtBQUssWUFBWSxLQUFLLFlBQVk7QUFDckMsY0FBUSxLQUFLLHdCQUF3QjtBQUFBLElBQ3RDO0FBQ0EsUUFBSSxLQUFLLGtCQUFrQixTQUFTLEdBQUc7QUFDdEMsVUFBSSxZQUFZO0FBQ2hCLFlBQU0sZUFBdUMsQ0FBQztBQUM5QyxZQUFNLG1CQUE2QixDQUFDO0FBQ3BDLFlBQU0sZUFBeUIsQ0FBQztBQUNoQyxpQkFBVyxjQUFjLEtBQUssbUJBQW1CO0FBQ2hELFlBQUksV0FBVyxTQUFTLHFCQUFxQixTQUFTO0FBQ3JELHVCQUFhLEtBQUssV0FBVyxJQUFJO0FBQ2pDLHNCQUFZO0FBQ1o7QUFBQSxRQUNEO0FBQ0EsY0FBTSxhQUFhLGVBQWUsNEJBQTRCLGNBQWMsS0FBSyxPQUFPLFNBQVMsV0FBVyxlQUFlO0FBQzNILHNCQUFjLFdBQVcsTUFBTSxVQUFRO0FBRXRDLGNBQUksS0FBSyxhQUFhLFNBQVMsR0FBRyxHQUFHO0FBQ3BDLDZCQUFpQixLQUFLLEtBQUssWUFBWTtBQUN2QyxtQkFBTztBQUFBLFVBQ1I7QUFDQSxxQkFBVyxLQUFLLEtBQUssT0FBTztBQUMzQixnQkFBSSxDQUFDLGdCQUFnQixHQUFHLEtBQUssS0FBSyxHQUFHO0FBRXBDLDJCQUFhLEtBQUssR0FBRyxDQUFDLEtBQUssS0FBSyxNQUFNLENBQVEsQ0FBQyxFQUFFO0FBQ2pELHFCQUFPO0FBQUEsWUFDUjtBQUFBLFVBQ0Q7QUFDQSxpQkFBTztBQUFBLFFBQ1IsQ0FBQztBQUNELFlBQUksQ0FBQyxXQUFXO0FBQ2Y7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUNBLFVBQUksYUFBYSxTQUFTLEdBQUc7QUFDNUIsZ0JBQVEsS0FBSyw2Q0FBNkMsYUFBYSxJQUFJLE9BQUssS0FBSyxDQUFDLElBQUksRUFBRSxLQUFLLElBQUksQ0FBQyxHQUFHO0FBQUEsTUFDMUc7QUFDQSxVQUFJLGFBQWEsU0FBUyxHQUFHO0FBQzVCLGdCQUFRLEtBQUssaURBQWlELGFBQWEsSUFBSSxPQUFLLEtBQUssQ0FBQyxJQUFJLEVBQUUsS0FBSyxJQUFJLENBQUMsR0FBRztBQUFBLE1BQzlHO0FBQ0EsVUFBSSxpQkFBaUIsU0FBUyxHQUFHO0FBQ2hDLGdCQUFRLEtBQUsscURBQXFELGlCQUFpQixJQUFJLE9BQUssS0FBSyxDQUFDLElBQUksRUFBRSxLQUFLLElBQUksQ0FBQyxHQUFHO0FBQUEsTUFDdEg7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQXBPYSxlQWNZLDhCQUE4QixJQUFJLDJCQUEyQjtBQWR6RSxlQW1CWSx3QkFBd0IsSUFBSSxxQkFBcUI7QUFuQjdELGlCQUFOO0FBQUEsRUFxREo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXhEVTtBQXlPYixNQUFNLGlDQUFpQztBQUFBLEVBQ3RDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUNEO0FBRUEsU0FBUyxnQkFBZ0IsTUFBYyxPQUE0QjtBQUNsRSxNQUFJLENBQUMsK0JBQStCLFNBQVMsSUFBSSxHQUFHO0FBQ25ELFdBQU87QUFBQSxFQUNSO0FBRUEsVUFBUSxNQUFNO0FBQUEsSUFDYixLQUFLO0FBQUEsSUFDTCxLQUFLLHdCQUF3QjtBQUM1QixZQUFNLFFBQVEsTUFBTSxpQkFBaUIsSUFBSTtBQUV6QyxhQUFPLFVBQVU7QUFBQSxJQUNsQjtBQUFBLElBQ0EsS0FBSyx5QkFBeUI7QUFDN0IsWUFBTSxRQUFRLE1BQU0saUJBQWlCLElBQUk7QUFFekMsVUFBSSwwQ0FBMEMsS0FBSyxLQUFLLEdBQUc7QUFDMUQsZUFBTztBQUFBLE1BQ1I7QUFFQSxhQUFPLE1BQU0sT0FBTyxJQUFJLE1BQU0sS0FBSyxNQUFNO0FBQUEsSUFDMUM7QUFBQSxJQUNBLEtBQUsseUJBQXlCO0FBQzdCLFlBQU0sUUFBUSxNQUFNLGlCQUFpQixJQUFJO0FBRXpDLGFBQU8sVUFBVTtBQUFBLElBQ2xCO0FBQUEsSUFDQSxLQUFLLDZCQUE2QjtBQUNqQyxZQUFNLFFBQVEsTUFBTSxpQkFBaUIsSUFBSTtBQUV6QyxhQUFPLFVBQVUsYUFBYSxrQkFBa0IsS0FBSyxLQUFLO0FBQUEsSUFDM0Q7QUFBQSxJQUNBO0FBQVMsYUFBTztBQUFBLEVBQ2pCO0FBQ0Q7IiwKICAibmFtZXMiOiBbXQp9Cg==
