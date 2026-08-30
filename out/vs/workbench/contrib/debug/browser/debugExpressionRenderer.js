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
import * as dom from "../../../../base/browser/dom.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { Expression, ExpressionContainer, Variable } from "../common/debugModel.js";
import { ReplEvaluationResult } from "../common/replModel.js";
import { splitExpressionOrScopeHighlights } from "./baseDebugView.js";
import { handleANSIOutput } from "./debugANSIHandling.js";
import { COPY_EVALUATE_PATH_ID, COPY_VALUE_ID } from "./debugCommands.js";
import { DebugLinkHoverBehavior, LinkDetector } from "./linkDetector.js";
const MAX_VALUE_RENDER_LENGTH_IN_VIEWLET = 1024;
const booleanRegex = /^(true|false)$/i;
const stringRegex = /^(['"]).*\1$/;
var Cls = /* @__PURE__ */ ((Cls2) => {
  Cls2["Value"] = "value";
  Cls2["Unavailable"] = "unavailable";
  Cls2["Error"] = "error";
  Cls2["Changed"] = "changed";
  Cls2["Boolean"] = "boolean";
  Cls2["String"] = "string";
  Cls2["Number"] = "number";
  return Cls2;
})(Cls || {});
const allClasses = Object.keys({
  ["value" /* Value */]: 0,
  ["unavailable" /* Unavailable */]: 0,
  ["error" /* Error */]: 0,
  ["changed" /* Changed */]: 0,
  ["boolean" /* Boolean */]: 0,
  ["string" /* String */]: 0,
  ["number" /* Number */]: 0
});
let DebugExpressionRenderer = class {
  constructor(commandService, configurationService, instantiationService, hoverService) {
    this.commandService = commandService;
    this.hoverService = hoverService;
    this.linkDetector = instantiationService.createInstance(LinkDetector);
    this.displayType = observableConfigValue("debug.showVariableTypes", false, configurationService);
  }
  renderVariable(data, variable, options = {}) {
    const displayType = this.displayType.get();
    const highlights = splitExpressionOrScopeHighlights(variable, options.highlights || []);
    if (variable.available) {
      data.type.textContent = "";
      let text = variable.name;
      if (variable.value && typeof variable.name === "string") {
        if (variable.type && displayType) {
          text += ": ";
          data.type.textContent = variable.type + " =";
        } else {
          text += " =";
        }
      }
      data.label.set(text, highlights.name, variable.type && !displayType ? variable.type : variable.name);
      data.name.classList.toggle("virtual", variable.presentationHint?.kind === "virtual");
      data.name.classList.toggle("internal", variable.presentationHint?.visibility === "internal");
    } else if (variable.value && typeof variable.name === "string" && variable.name) {
      data.label.set(":");
    }
    data.expression.classList.toggle("lazy", !!variable.presentationHint?.lazy);
    const commands = [
      { id: COPY_VALUE_ID, args: [variable, [variable]] }
    ];
    if (variable.evaluateName) {
      commands.push({ id: COPY_EVALUATE_PATH_ID, args: [{ variable }] });
    }
    return this.renderValue(data.value, variable, {
      showChanged: options.showChanged,
      maxValueLength: MAX_VALUE_RENDER_LENGTH_IN_VIEWLET,
      hover: { commands },
      highlights: highlights.value,
      colorize: true,
      session: variable.getSession()
    });
  }
  renderValue(container, expressionOrValue, options = {}) {
    const store = new DisposableStore();
    const supportsANSI = options.session?.rememberedCapabilities?.supportsANSIStyling ?? options.wasANSI ?? false;
    let value = typeof expressionOrValue === "string" ? expressionOrValue : expressionOrValue.value;
    for (const cls of allClasses) {
      container.classList.remove(cls);
    }
    container.classList.add("value" /* Value */);
    if (value === null || (expressionOrValue instanceof Expression || expressionOrValue instanceof Variable || expressionOrValue instanceof ReplEvaluationResult) && !expressionOrValue.available) {
      container.classList.add("unavailable" /* Unavailable */);
      if (value !== Expression.DEFAULT_VALUE) {
        container.classList.add("error" /* Error */);
      }
    } else {
      if (typeof expressionOrValue !== "string" && options.showChanged && expressionOrValue.valueChanged && value !== Expression.DEFAULT_VALUE) {
        container.classList.add("changed" /* Changed */);
        expressionOrValue.valueChanged = false;
      }
      if (options.colorize && typeof expressionOrValue !== "string") {
        if (expressionOrValue.type === "number" || expressionOrValue.type === "boolean" || expressionOrValue.type === "string") {
          container.classList.add(expressionOrValue.type);
        } else if (!isNaN(+value)) {
          container.classList.add("number" /* Number */);
        } else if (booleanRegex.test(value)) {
          container.classList.add("boolean" /* Boolean */);
        } else if (stringRegex.test(value)) {
          container.classList.add("string" /* String */);
        }
      }
    }
    if (options.maxValueLength && value && value.length > options.maxValueLength) {
      value = value.substring(0, options.maxValueLength) + "...";
    }
    if (!value) {
      value = "";
    }
    const session = options.session ?? (expressionOrValue instanceof ExpressionContainer ? expressionOrValue.getSession() : void 0);
    const hoverBehavior = options.hover === false ? { type: DebugLinkHoverBehavior.Rich, store } : { type: DebugLinkHoverBehavior.None, store };
    dom.clearNode(container);
    const locationReference = options.locationReference ?? (expressionOrValue instanceof ExpressionContainer && expressionOrValue.valueLocationReference);
    let linkDetector = this.linkDetector;
    if (locationReference && session) {
      linkDetector = this.linkDetector.makeReferencedLinkDetector(locationReference, session);
    }
    if (supportsANSI) {
      container.appendChild(handleANSIOutput(value, linkDetector, session ? session.root : void 0, options.highlights, hoverBehavior));
    } else {
      container.appendChild(linkDetector.linkify(value, hoverBehavior, false, session?.root, true, options.highlights));
    }
    if (options.hover !== false) {
      const { commands = [] } = options.hover || {};
      store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), container, () => {
        const container2 = dom.$("div");
        const markdownHoverElement = dom.$("div.hover-row");
        const hoverContentsElement = dom.append(markdownHoverElement, dom.$("div.hover-contents"));
        const hoverContentsPre = dom.append(hoverContentsElement, dom.$("pre.debug-var-hover-pre"));
        if (supportsANSI) {
          hoverContentsPre.appendChild(handleANSIOutput(value, this.linkDetector, session ? session.root : void 0, options.highlights, hoverBehavior));
        } else {
          hoverContentsPre.textContent = value;
        }
        container2.appendChild(markdownHoverElement);
        return container2;
      }, {
        actions: commands.map(({ id, args }) => {
          const description = CommandsRegistry.getCommand(id)?.metadata?.description;
          return {
            label: typeof description === "string" ? description : description ? description.value : id,
            commandId: id,
            run: () => this.commandService.executeCommand(id, ...args)
          };
        })
      }));
    }
    return store;
  }
};
DebugExpressionRenderer = __decorateClass([
  __decorateParam(0, ICommandService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IHoverService)
], DebugExpressionRenderer);
export {
  DebugExpressionRenderer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxkZWJ1Z0V4cHJlc3Npb25SZW5kZXJlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElIaWdobGlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaGlnaGxpZ2h0ZWRsYWJlbC9oaWdobGlnaHRlZExhYmVsLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHsgSURlYnVnU2Vzc2lvbiwgSUV4cHJlc3Npb25WYWx1ZSB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBFeHByZXNzaW9uLCBFeHByZXNzaW9uQ29udGFpbmVyLCBWYXJpYWJsZSB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z01vZGVsLmpzJztcbmltcG9ydCB7IFJlcGxFdmFsdWF0aW9uUmVzdWx0IH0gZnJvbSAnLi4vY29tbW9uL3JlcGxNb2RlbC5qcyc7XG5pbXBvcnQgeyBJVmFyaWFibGVUZW1wbGF0ZURhdGEsIHNwbGl0RXhwcmVzc2lvbk9yU2NvcGVIaWdobGlnaHRzIH0gZnJvbSAnLi9iYXNlRGVidWdWaWV3LmpzJztcbmltcG9ydCB7IGhhbmRsZUFOU0lPdXRwdXQgfSBmcm9tICcuL2RlYnVnQU5TSUhhbmRsaW5nLmpzJztcbmltcG9ydCB7IENPUFlfRVZBTFVBVEVfUEFUSF9JRCwgQ09QWV9WQUxVRV9JRCB9IGZyb20gJy4vZGVidWdDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBEZWJ1Z0xpbmtIb3ZlckJlaGF2aW9yLCBEZWJ1Z0xpbmtIb3ZlckJlaGF2aW9yVHlwZURhdGEsIElMaW5rRGV0ZWN0b3IsIExpbmtEZXRlY3RvciB9IGZyb20gJy4vbGlua0RldGVjdG9yLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJVmFsdWVIb3Zlck9wdGlvbnMge1xuXHQvKiogQ29tbWFuZHMgdG8gc2hvdyBpbiB0aGUgaG92ZXIgZm9vdGVyLiAqL1xuXHRjb21tYW5kcz86IHsgaWQ6IHN0cmluZzsgYXJnczogdW5rbm93bltdIH1bXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVuZGVyVmFsdWVPcHRpb25zIHtcblx0c2hvd0NoYW5nZWQ/OiBib29sZWFuO1xuXHRtYXhWYWx1ZUxlbmd0aD86IG51bWJlcjtcblx0LyoqIElmIG5vdCBmYWxzZSwgYSByaWNoIGhvdmVyIHdpbGwgYmUgc2hvd24gb24gdGhlIGVsZW1lbnQuICovXG5cdGhvdmVyPzogZmFsc2UgfCBJVmFsdWVIb3Zlck9wdGlvbnM7XG5cdGNvbG9yaXplPzogYm9vbGVhbjtcblx0aGlnaGxpZ2h0cz86IElIaWdobGlnaHRbXTtcblxuXHQvKipcblx0ICogSW5kaWNhdGVzIGFyZWFzIHdoZXJlIFZTIENvZGUgaW1wbGljaXRseSBhbHdheXMgc3VwcG9ydGVkIEFOU0kgZXNjYXBlXG5cdCAqIHNlcXVlbmNlcy4gVGhlc2Ugc2hvdWxkIGJlIHJlbmRlcmVkIGFzIEFOU0kgd2hlbiB0aGUgREEgZG9lcyBub3Qgc3BlY2lmeVxuXHQgKiBhbnkgdmFsdWUgb2YgYHN1cHBvcnRzQU5TSVN0eWxpbmdgLlxuXHQgKiBAZGVwcmVjYXRlZFxuXHQgKi9cblx0d2FzQU5TST86IGJvb2xlYW47XG5cdHNlc3Npb24/OiBJRGVidWdTZXNzaW9uO1xuXHRsb2NhdGlvblJlZmVyZW5jZT86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVuZGVyVmFyaWFibGVPcHRpb25zIHtcblx0c2hvd0NoYW5nZWQ/OiBib29sZWFuO1xuXHRoaWdobGlnaHRzPzogSUhpZ2hsaWdodFtdO1xufVxuXG5cbmNvbnN0IE1BWF9WQUxVRV9SRU5ERVJfTEVOR1RIX0lOX1ZJRVdMRVQgPSAxMDI0O1xuY29uc3QgYm9vbGVhblJlZ2V4ID0gL14odHJ1ZXxmYWxzZSkkL2k7XG5jb25zdCBzdHJpbmdSZWdleCA9IC9eKFsnXCJdKS4qXFwxJC87XG5cbmNvbnN0IGVudW0gQ2xzIHtcblx0VmFsdWUgPSAndmFsdWUnLFxuXHRVbmF2YWlsYWJsZSA9ICd1bmF2YWlsYWJsZScsXG5cdEVycm9yID0gJ2Vycm9yJyxcblx0Q2hhbmdlZCA9ICdjaGFuZ2VkJyxcblx0Qm9vbGVhbiA9ICdib29sZWFuJyxcblx0U3RyaW5nID0gJ3N0cmluZycsXG5cdE51bWJlciA9ICdudW1iZXInLFxufVxuXG5jb25zdCBhbGxDbGFzc2VzOiByZWFkb25seSBDbHNbXSA9IE9iamVjdC5rZXlzKHtcblx0W0Nscy5WYWx1ZV06IDAsXG5cdFtDbHMuVW5hdmFpbGFibGVdOiAwLFxuXHRbQ2xzLkVycm9yXTogMCxcblx0W0Nscy5DaGFuZ2VkXTogMCxcblx0W0Nscy5Cb29sZWFuXTogMCxcblx0W0Nscy5TdHJpbmddOiAwLFxuXHRbQ2xzLk51bWJlcl06IDAsXG59IHNhdGlzZmllcyB7IFtrZXkgaW4gQ2xzXTogdW5rbm93biB9KSBhcyBDbHNbXTtcblxuZXhwb3J0IGNsYXNzIERlYnVnRXhwcmVzc2lvblJlbmRlcmVyIHtcblx0cHJpdmF0ZSBkaXNwbGF5VHlwZTogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgbGlua0RldGVjdG9yOiBMaW5rRGV0ZWN0b3I7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5saW5rRGV0ZWN0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMaW5rRGV0ZWN0b3IpO1xuXHRcdHRoaXMuZGlzcGxheVR5cGUgPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWUoJ2RlYnVnLnNob3dWYXJpYWJsZVR5cGVzJywgZmFsc2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0fVxuXG5cdHJlbmRlclZhcmlhYmxlKGRhdGE6IElWYXJpYWJsZVRlbXBsYXRlRGF0YSwgdmFyaWFibGU6IFZhcmlhYmxlLCBvcHRpb25zOiBJUmVuZGVyVmFyaWFibGVPcHRpb25zID0ge30pOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcGxheVR5cGUgPSB0aGlzLmRpc3BsYXlUeXBlLmdldCgpO1xuXHRcdGNvbnN0IGhpZ2hsaWdodHMgPSBzcGxpdEV4cHJlc3Npb25PclNjb3BlSGlnaGxpZ2h0cyh2YXJpYWJsZSwgb3B0aW9ucy5oaWdobGlnaHRzIHx8IFtdKTtcblxuXHRcdGlmICh2YXJpYWJsZS5hdmFpbGFibGUpIHtcblx0XHRcdGRhdGEudHlwZS50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0bGV0IHRleHQgPSB2YXJpYWJsZS5uYW1lO1xuXHRcdFx0aWYgKHZhcmlhYmxlLnZhbHVlICYmIHR5cGVvZiB2YXJpYWJsZS5uYW1lID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRpZiAodmFyaWFibGUudHlwZSAmJiBkaXNwbGF5VHlwZSkge1xuXHRcdFx0XHRcdHRleHQgKz0gJzogJztcblx0XHRcdFx0XHRkYXRhLnR5cGUudGV4dENvbnRlbnQgPSB2YXJpYWJsZS50eXBlICsgJyA9Jztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0ZXh0ICs9ICcgPSc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0ZGF0YS5sYWJlbC5zZXQodGV4dCwgaGlnaGxpZ2h0cy5uYW1lLCB2YXJpYWJsZS50eXBlICYmICFkaXNwbGF5VHlwZSA/IHZhcmlhYmxlLnR5cGUgOiB2YXJpYWJsZS5uYW1lKTtcblx0XHRcdGRhdGEubmFtZS5jbGFzc0xpc3QudG9nZ2xlKCd2aXJ0dWFsJywgdmFyaWFibGUucHJlc2VudGF0aW9uSGludD8ua2luZCA9PT0gJ3ZpcnR1YWwnKTtcblx0XHRcdGRhdGEubmFtZS5jbGFzc0xpc3QudG9nZ2xlKCdpbnRlcm5hbCcsIHZhcmlhYmxlLnByZXNlbnRhdGlvbkhpbnQ/LnZpc2liaWxpdHkgPT09ICdpbnRlcm5hbCcpO1xuXHRcdH0gZWxzZSBpZiAodmFyaWFibGUudmFsdWUgJiYgdHlwZW9mIHZhcmlhYmxlLm5hbWUgPT09ICdzdHJpbmcnICYmIHZhcmlhYmxlLm5hbWUpIHtcblx0XHRcdGRhdGEubGFiZWwuc2V0KCc6Jyk7XG5cdFx0fVxuXG5cdFx0ZGF0YS5leHByZXNzaW9uLmNsYXNzTGlzdC50b2dnbGUoJ2xhenknLCAhIXZhcmlhYmxlLnByZXNlbnRhdGlvbkhpbnQ/LmxhenkpO1xuXHRcdGNvbnN0IGNvbW1hbmRzID0gW1xuXHRcdFx0eyBpZDogQ09QWV9WQUxVRV9JRCwgYXJnczogW3ZhcmlhYmxlLCBbdmFyaWFibGVdXSBhcyB1bmtub3duW10gfVxuXHRcdF07XG5cdFx0aWYgKHZhcmlhYmxlLmV2YWx1YXRlTmFtZSkge1xuXHRcdFx0Y29tbWFuZHMucHVzaCh7IGlkOiBDT1BZX0VWQUxVQVRFX1BBVEhfSUQsIGFyZ3M6IFt7IHZhcmlhYmxlIH1dIH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnJlbmRlclZhbHVlKGRhdGEudmFsdWUsIHZhcmlhYmxlLCB7XG5cdFx0XHRzaG93Q2hhbmdlZDogb3B0aW9ucy5zaG93Q2hhbmdlZCxcblx0XHRcdG1heFZhbHVlTGVuZ3RoOiBNQVhfVkFMVUVfUkVOREVSX0xFTkdUSF9JTl9WSUVXTEVULFxuXHRcdFx0aG92ZXI6IHsgY29tbWFuZHMgfSxcblx0XHRcdGhpZ2hsaWdodHM6IGhpZ2hsaWdodHMudmFsdWUsXG5cdFx0XHRjb2xvcml6ZTogdHJ1ZSxcblx0XHRcdHNlc3Npb246IHZhcmlhYmxlLmdldFNlc3Npb24oKSxcblx0XHR9KTtcblx0fVxuXG5cdHJlbmRlclZhbHVlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGV4cHJlc3Npb25PclZhbHVlOiBJRXhwcmVzc2lvblZhbHVlIHwgc3RyaW5nLCBvcHRpb25zOiBJUmVuZGVyVmFsdWVPcHRpb25zID0ge30pOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Ly8gVXNlIHJlbWVtYmVyZWQgY2FwYWJpbGl0aWVzIHNvIFJFUEwgZWxlbWVudHMgY2FuIHJlbmRlciBldmVuIG9uY2UgYSBzZXNzaW9uIGVuZHNcblx0XHRjb25zdCBzdXBwb3J0c0FOU0k6IGJvb2xlYW4gPSBvcHRpb25zLnNlc3Npb24/LnJlbWVtYmVyZWRDYXBhYmlsaXRpZXM/LnN1cHBvcnRzQU5TSVN0eWxpbmcgPz8gb3B0aW9ucy53YXNBTlNJID8/IGZhbHNlO1xuXG5cdFx0bGV0IHZhbHVlID0gdHlwZW9mIGV4cHJlc3Npb25PclZhbHVlID09PSAnc3RyaW5nJyA/IGV4cHJlc3Npb25PclZhbHVlIDogZXhwcmVzc2lvbk9yVmFsdWUudmFsdWU7XG5cblx0XHQvLyByZW1vdmUgc3RhbGUgY2xhc3Nlc1xuXHRcdGZvciAoY29uc3QgY2xzIG9mIGFsbENsYXNzZXMpIHtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKGNscyk7XG5cdFx0fVxuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKENscy5WYWx1ZSk7XG5cdFx0Ly8gd2hlbiByZXNvbHZpbmcgZXhwcmVzc2lvbnMgd2UgcmVwcmVzZW50IGVycm9ycyBmcm9tIHRoZSBzZXJ2ZXIgYXMgYSB2YXJpYWJsZSB3aXRoIG5hbWUgPT09IG51bGwuXG5cdFx0aWYgKHZhbHVlID09PSBudWxsIHx8ICgoZXhwcmVzc2lvbk9yVmFsdWUgaW5zdGFuY2VvZiBFeHByZXNzaW9uIHx8IGV4cHJlc3Npb25PclZhbHVlIGluc3RhbmNlb2YgVmFyaWFibGUgfHwgZXhwcmVzc2lvbk9yVmFsdWUgaW5zdGFuY2VvZiBSZXBsRXZhbHVhdGlvblJlc3VsdCkgJiYgIWV4cHJlc3Npb25PclZhbHVlLmF2YWlsYWJsZSkpIHtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKENscy5VbmF2YWlsYWJsZSk7XG5cdFx0XHRpZiAodmFsdWUgIT09IEV4cHJlc3Npb24uREVGQVVMVF9WQUxVRSkge1xuXHRcdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZChDbHMuRXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodHlwZW9mIGV4cHJlc3Npb25PclZhbHVlICE9PSAnc3RyaW5nJyAmJiBvcHRpb25zLnNob3dDaGFuZ2VkICYmIGV4cHJlc3Npb25PclZhbHVlLnZhbHVlQ2hhbmdlZCAmJiB2YWx1ZSAhPT0gRXhwcmVzc2lvbi5ERUZBVUxUX1ZBTFVFKSB7XG5cdFx0XHRcdC8vIHZhbHVlIGNoYW5nZWQgY29sb3IgaGFzIHByaW9yaXR5IG92ZXIgb3RoZXIgY29sb3JzLlxuXHRcdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZChDbHMuQ2hhbmdlZCk7XG5cdFx0XHRcdGV4cHJlc3Npb25PclZhbHVlLnZhbHVlQ2hhbmdlZCA9IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAob3B0aW9ucy5jb2xvcml6ZSAmJiB0eXBlb2YgZXhwcmVzc2lvbk9yVmFsdWUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGlmIChleHByZXNzaW9uT3JWYWx1ZS50eXBlID09PSAnbnVtYmVyJyB8fCBleHByZXNzaW9uT3JWYWx1ZS50eXBlID09PSAnYm9vbGVhbicgfHwgZXhwcmVzc2lvbk9yVmFsdWUudHlwZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZChleHByZXNzaW9uT3JWYWx1ZS50eXBlKTtcblx0XHRcdFx0fSBlbHNlIGlmICghaXNOYU4oK3ZhbHVlKSkge1xuXHRcdFx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKENscy5OdW1iZXIpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGJvb2xlYW5SZWdleC50ZXN0KHZhbHVlKSkge1xuXHRcdFx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKENscy5Cb29sZWFuKTtcblx0XHRcdFx0fSBlbHNlIGlmIChzdHJpbmdSZWdleC50ZXN0KHZhbHVlKSkge1xuXHRcdFx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKENscy5TdHJpbmcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMubWF4VmFsdWVMZW5ndGggJiYgdmFsdWUgJiYgdmFsdWUubGVuZ3RoID4gb3B0aW9ucy5tYXhWYWx1ZUxlbmd0aCkge1xuXHRcdFx0dmFsdWUgPSB2YWx1ZS5zdWJzdHJpbmcoMCwgb3B0aW9ucy5tYXhWYWx1ZUxlbmd0aCkgKyAnLi4uJztcblx0XHR9XG5cdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0dmFsdWUgPSAnJztcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uID0gb3B0aW9ucy5zZXNzaW9uID8/ICgoZXhwcmVzc2lvbk9yVmFsdWUgaW5zdGFuY2VvZiBFeHByZXNzaW9uQ29udGFpbmVyKSA/IGV4cHJlc3Npb25PclZhbHVlLmdldFNlc3Npb24oKSA6IHVuZGVmaW5lZCk7XG5cdFx0Ly8gT25seSB1c2UgaG92ZXJzIGZvciBsaW5rcyBpZiB0aHJlJ3Mgbm90IGdvaW5nIHRvIGJlIGEgaG92ZXIgZm9yIHRoZSB2YWx1ZS5cblx0XHRjb25zdCBob3ZlckJlaGF2aW9yOiBEZWJ1Z0xpbmtIb3ZlckJlaGF2aW9yVHlwZURhdGEgPSBvcHRpb25zLmhvdmVyID09PSBmYWxzZSA/IHsgdHlwZTogRGVidWdMaW5rSG92ZXJCZWhhdmlvci5SaWNoLCBzdG9yZSB9IDogeyB0eXBlOiBEZWJ1Z0xpbmtIb3ZlckJlaGF2aW9yLk5vbmUsIHN0b3JlIH07XG5cdFx0ZG9tLmNsZWFyTm9kZShjb250YWluZXIpO1xuXHRcdGNvbnN0IGxvY2F0aW9uUmVmZXJlbmNlID0gb3B0aW9ucy5sb2NhdGlvblJlZmVyZW5jZSA/PyAoZXhwcmVzc2lvbk9yVmFsdWUgaW5zdGFuY2VvZiBFeHByZXNzaW9uQ29udGFpbmVyICYmIGV4cHJlc3Npb25PclZhbHVlLnZhbHVlTG9jYXRpb25SZWZlcmVuY2UpO1xuXG5cdFx0bGV0IGxpbmtEZXRlY3RvcjogSUxpbmtEZXRlY3RvciA9IHRoaXMubGlua0RldGVjdG9yO1xuXHRcdGlmIChsb2NhdGlvblJlZmVyZW5jZSAmJiBzZXNzaW9uKSB7XG5cdFx0XHRsaW5rRGV0ZWN0b3IgPSB0aGlzLmxpbmtEZXRlY3Rvci5tYWtlUmVmZXJlbmNlZExpbmtEZXRlY3Rvcihsb2NhdGlvblJlZmVyZW5jZSwgc2Vzc2lvbik7XG5cdFx0fVxuXG5cdFx0aWYgKHN1cHBvcnRzQU5TSSkge1xuXHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGhhbmRsZUFOU0lPdXRwdXQodmFsdWUsIGxpbmtEZXRlY3Rvciwgc2Vzc2lvbiA/IHNlc3Npb24ucm9vdCA6IHVuZGVmaW5lZCwgb3B0aW9ucy5oaWdobGlnaHRzLCBob3ZlckJlaGF2aW9yKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChsaW5rRGV0ZWN0b3IubGlua2lmeSh2YWx1ZSwgaG92ZXJCZWhhdmlvciwgZmFsc2UsIHNlc3Npb24/LnJvb3QsIHRydWUsIG9wdGlvbnMuaGlnaGxpZ2h0cykpO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLmhvdmVyICE9PSBmYWxzZSkge1xuXHRcdFx0Y29uc3QgeyBjb21tYW5kcyA9IFtdIH0gPSBvcHRpb25zLmhvdmVyIHx8IHt9O1xuXHRcdFx0c3RvcmUuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBjb250YWluZXIsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udGFpbmVyID0gZG9tLiQoJ2RpdicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZG93bkhvdmVyRWxlbWVudCA9IGRvbS4kKCdkaXYuaG92ZXItcm93Jyk7XG5cdFx0XHRcdGNvbnN0IGhvdmVyQ29udGVudHNFbGVtZW50ID0gZG9tLmFwcGVuZChtYXJrZG93bkhvdmVyRWxlbWVudCwgZG9tLiQoJ2Rpdi5ob3Zlci1jb250ZW50cycpKTtcblx0XHRcdFx0Y29uc3QgaG92ZXJDb250ZW50c1ByZSA9IGRvbS5hcHBlbmQoaG92ZXJDb250ZW50c0VsZW1lbnQsIGRvbS4kKCdwcmUuZGVidWctdmFyLWhvdmVyLXByZScpKTtcblx0XHRcdFx0aWYgKHN1cHBvcnRzQU5TSSkge1xuXHRcdFx0XHRcdC8vIG5vdGU6IGludGVudGlvbmFsbHkgdXNpbmcgYHRoaXMubGlua0RldGVjdG9yYCBzbyB3ZSBkb24ndCBibGluZGx5IGxpbmtpZnkgdGhlXG5cdFx0XHRcdFx0Ly8gZW50aXJlIGNvbnRlbnRzIGFuZCBpbnN0ZWFkIG9ubHkgbGluayBmaWxlIHBhdGhzIHRoYXQgaXQgY29udGFpbnMuXG5cdFx0XHRcdFx0aG92ZXJDb250ZW50c1ByZS5hcHBlbmRDaGlsZChoYW5kbGVBTlNJT3V0cHV0KHZhbHVlLCB0aGlzLmxpbmtEZXRlY3Rvciwgc2Vzc2lvbiA/IHNlc3Npb24ucm9vdCA6IHVuZGVmaW5lZCwgb3B0aW9ucy5oaWdobGlnaHRzLCBob3ZlckJlaGF2aW9yKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aG92ZXJDb250ZW50c1ByZS50ZXh0Q29udGVudCA9IHZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChtYXJrZG93bkhvdmVyRWxlbWVudCk7XG5cdFx0XHRcdHJldHVybiBjb250YWluZXI7XG5cdFx0XHR9LCB7XG5cdFx0XHRcdGFjdGlvbnM6IGNvbW1hbmRzLm1hcCgoeyBpZCwgYXJncyB9KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoaWQpPy5tZXRhZGF0YT8uZGVzY3JpcHRpb247XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGxhYmVsOiB0eXBlb2YgZGVzY3JpcHRpb24gPT09ICdzdHJpbmcnID8gZGVzY3JpcHRpb24gOiBkZXNjcmlwdGlvbiA/IGRlc2NyaXB0aW9uLnZhbHVlIDogaWQsXG5cdFx0XHRcdFx0XHRjb21tYW5kSWQ6IGlkLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGlkLCAuLi5hcmdzKSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9KVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdG9yZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFFckIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx1QkFBb0M7QUFFN0MsU0FBUyxrQkFBa0IsdUJBQXVCO0FBQ2xELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsWUFBWSxxQkFBcUIsZ0JBQWdCO0FBQzFELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQWdDLHdDQUF3QztBQUN4RSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHVCQUF1QixxQkFBcUI7QUFDckQsU0FBUyx3QkFBdUUsb0JBQW9CO0FBZ0NwRyxNQUFNLHFDQUFxQztBQUMzQyxNQUFNLGVB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
