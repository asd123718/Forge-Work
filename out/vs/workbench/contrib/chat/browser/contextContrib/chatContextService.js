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
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { score } from "../../../../../editor/common/languageSelector.js";
import { createDecorator } from "../../../../../platform/instantiation/common/instantiation.js";
import { IChatContextPickService } from "../attachments/chatContextPickService.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { InstantiationType, registerSingleton } from "../../../../../platform/instantiation/common/extensions.js";
import { Disposable, DisposableMap } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { basename } from "../../../../../base/common/resources.js";
const IChatContextService = createDecorator("chatContextService");
function isViewTypeTabSelector(selector) {
  return selector.viewType !== void 0;
}
let ChatContextService = class extends Disposable {
  constructor(_contextPickService, _extensionService) {
    super();
    this._contextPickService = _contextPickService;
    this._extensionService = _extensionService;
    this._providers = /* @__PURE__ */ new Map();
    this._workspaceContext = /* @__PURE__ */ new Map();
    this._registeredPickers = this._register(new DisposableMap());
    this._lastResourceContext = /* @__PURE__ */ new Map();
  }
  setExecuteCommandCallback(callback) {
    this._executeCommandCallback = callback;
  }
  async executeChatContextItemCommand(handle) {
    if (!this._executeCommandCallback) {
      return;
    }
    await this._executeCommandCallback(handle);
  }
  setChatContextProvider(id, picker) {
    const providerEntry = this._providers.get(id) ?? {};
    providerEntry.picker = picker;
    this._providers.set(id, providerEntry);
    this._registerWithPickService(id);
  }
  _registerWithPickService(id) {
    const providerEntry = this._providers.get(id);
    if (!providerEntry || !providerEntry.picker || !providerEntry.explicitProvider) {
      return;
    }
    const title = `${providerEntry.picker.title.replace(/\.+$/, "")}...`;
    this._registeredPickers.set(id, this._contextPickService.registerChatContextItem(this._asPicker(title, providerEntry.picker.icon, id)));
  }
  registerChatWorkspaceContextProvider(id, provider) {
    const providerEntry = this._providers.get(id) ?? {};
    providerEntry.workspaceProvider = provider;
    this._providers.set(id, providerEntry);
  }
  registerChatExplicitContextProvider(id, provider) {
    const providerEntry = this._providers.get(id) ?? {};
    providerEntry.explicitProvider = provider;
    this._providers.set(id, providerEntry);
    this._registerWithPickService(id);
  }
  registerChatResourceContextProvider(id, selector, provider) {
    const providerEntry = this._providers.get(id) ?? {};
    providerEntry.resourceProvider = { selector, provider };
    this._providers.set(id, providerEntry);
  }
  unregisterChatContextProvider(id) {
    this._providers.delete(id);
    this._registeredPickers.deleteAndDispose(id);
  }
  updateWorkspaceContextItems(id, items) {
    this._workspaceContext.set(id, items);
  }
  getWorkspaceContextItems() {
    const items = [];
    for (const workspaceContexts of this._workspaceContext.values()) {
      for (const item of workspaceContexts) {
        if (!item.value) {
          continue;
        }
        const derivedLabel = item.label ?? (item.resourceUri ? basename(item.resourceUri) : "Unknown");
        items.push({
          value: item.value,
          name: derivedLabel,
          modelDescription: item.modelDescription,
          id: derivedLabel,
          kind: "workspace"
        });
      }
    }
    return items;
  }
  async contextForResource(uri, language, viewType) {
    return this._contextForResource(uri, false, language, viewType);
  }
  async _contextForResource(uri, withValue, language, viewType) {
    const scoredProviders = [];
    for (const providerEntry of this._providers.values()) {
      if (!providerEntry.resourceProvider) {
        continue;
      }
      const selector = providerEntry.resourceProvider.selector;
      const matchScore = isViewTypeTabSelector(selector) ? viewType !== void 0 && selector.viewType === viewType ? 10 : 0 : score(selector.uri, uri, language ?? "", true, void 0, void 0);
      scoredProviders.push({ score: matchScore, provider: providerEntry.resourceProvider.provider });
    }
    scoredProviders.sort((a, b) => b.score - a.score);
    if (scoredProviders.length === 0 || scoredProviders[0].score <= 0) {
      return;
    }
    const provider = scoredProviders[0].provider;
    const context = await provider.provideChatContext(uri, withValue, viewType, CancellationToken.None);
    if (!context) {
      return;
    }
    const effectiveResourceUri = context.resourceUri ?? uri;
    const derivedLabel = context.label ?? basename(effectiveResourceUri);
    const contextValue = {
      value: void 0,
      name: derivedLabel,
      iconPath: context.iconPath,
      uri,
      resourceUri: context.resourceUri,
      modelDescription: context.modelDescription,
      tooltip: context.tooltip,
      commandId: context.command?.id,
      handle: context.handle
    };
    this._lastResourceContext.clear();
    this._lastResourceContext.set(contextValue, { originalItem: context, provider });
    return contextValue;
  }
  async resolveChatContext(context, language) {
    if (context.value !== void 0) {
      return context;
    }
    const item = this._lastResourceContext.get(context);
    if (!item) {
      const resolved = await this._contextForResource(context.uri, true, language);
      context.value = resolved?.value;
      context.modelDescription = resolved?.modelDescription;
      context.tooltip = resolved?.tooltip;
      return context;
    } else {
      const resolved = await item.provider.resolveChatContext(item.originalItem, CancellationToken.None);
      if (resolved) {
        context.value = resolved.value;
        context.modelDescription = resolved.modelDescription;
        context.tooltip = resolved.tooltip;
        return context;
      }
    }
    return context;
  }
  _asPicker(title, icon, id) {
    const asPicker = () => {
      let providerEntry = this._providers.get(id);
      if (!providerEntry) {
        throw new Error("No chat context provider registered");
      }
      const picks = async () => {
        if (providerEntry && !providerEntry.explicitProvider) {
          await this._extensionService.activateByEvent(`onChatContextProvider:${id}`);
          providerEntry = this._providers.get(id);
          if (!providerEntry?.explicitProvider) {
            return [];
          }
        }
        const results = await providerEntry?.explicitProvider.provideChatContext(CancellationToken.None);
        return results || [];
      };
      return {
        picks: picks().then((items) => {
          return items.map((item) => {
            const derivedLabel = item.label ?? (item.resourceUri ? basename(item.resourceUri) : "Unknown");
            const iconPath = item.iconPath;
            const isThemeIcon = ThemeIcon.isThemeIcon(iconPath);
            return {
              label: derivedLabel,
              iconClass: isThemeIcon ? ThemeIcon.asClassName(iconPath) : void 0,
              iconPath: !isThemeIcon && iconPath ? URI.isUri(iconPath) ? { dark: iconPath, light: iconPath } : { dark: iconPath.dark, light: iconPath.light } : void 0,
              asAttachment: async () => {
                let contextValue = item;
                if (contextValue.value === void 0 && providerEntry?.explicitProvider) {
                  contextValue = await providerEntry.explicitProvider.resolveChatContext(item, CancellationToken.None);
                }
                const resolvedLabel = contextValue.label ?? (contextValue.resourceUri ? basename(contextValue.resourceUri) : "Unknown");
                return {
                  kind: "generic",
                  id: resolvedLabel,
                  name: resolvedLabel,
                  iconPath: contextValue.iconPath ?? item.iconPath,
                  value: contextValue.value,
                  tooltip: contextValue.tooltip ?? item.tooltip
                };
              }
            };
          });
        }),
        placeholder: title
      };
    };
    const picker = {
      asPicker,
      type: "pickerPick",
      label: title,
      icon
    };
    return picker;
  }
};
ChatContextService = __decorateClass([
  __decorateParam(0, IChatContextPickService),
  __decorateParam(1, IExtensionService)
], ChatContextService);
registerSingleton(IChatContextService, ChatContextService, InstantiationType.Delayed);
export {
  ChatContextService,
  IChatContextService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNvbnRleHRDb250cmliXFxjaGF0Q29udGV4dFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VTZWxlY3Rvciwgc2NvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlU2VsZWN0b3IuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRleHRQaWNrZXIsIElDaGF0Q29udGV4dFBpY2tlckl0ZW0sIElDaGF0Q29udGV4dFBpY2tTZXJ2aWNlIH0gZnJvbSAnLi4vYXR0YWNobWVudHMvY2hhdENvbnRleHRQaWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRleHRJdGVtLCBJQ2hhdEV4cGxpY2l0Q29udGV4dFByb3ZpZGVyLCBJQ2hhdFJlc291cmNlQ29udGV4dFByb3ZpZGVyLCBJQ2hhdFdvcmtzcGFjZUNvbnRleHRQcm92aWRlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb250ZXh0Q29udHJpYi9jaGF0Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RXb3Jrc3BhY2VWYXJpYWJsZUVudHJ5LCBJR2VuZXJpY0NoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSwgU3RyaW5nQ2hhdENvbnRleHRWYWx1ZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5cbmV4cG9ydCBjb25zdCBJQ2hhdENvbnRleHRTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElDaGF0Q29udGV4dFNlcnZpY2U+KCdjaGF0Q29udGV4dFNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdENvbnRleHRTZXJ2aWNlIGV4dGVuZHMgQ2hhdENvbnRleHRTZXJ2aWNlIHsgfVxuXG4vKipcbiAqIEEgc2VsZWN0b3IgZGVzY3JpYmluZyB3aGljaCB0YWJzIGEgcmVzb3VyY2UgY29udGV4dCBwcm92aWRlciBhcHBsaWVzIHRvLiBFaXRoZXIgYVxuICoge0BsaW5rIExhbmd1YWdlU2VsZWN0b3J9IG1hdGNoZWQgYWdhaW5zdCBhIHJlc291cmNlJ3MgVVJJLCBvciBhIHdlYnZpZXcgYHZpZXdUeXBlYC5cbiAqL1xuZXhwb3J0IHR5cGUgQ2hhdFRhYlNlbGVjdG9yID0geyB1cmk6IExhbmd1YWdlU2VsZWN0b3IgfSB8IHsgdmlld1R5cGU6IHN0cmluZyB9O1xuXG5mdW5jdGlvbiBpc1ZpZXdUeXBlVGFiU2VsZWN0b3Ioc2VsZWN0b3I6IENoYXRUYWJTZWxlY3Rvcik6IHNlbGVjdG9yIGlzIHsgdmlld1R5cGU6IHN0cmluZyB9IHtcblx0cmV0dXJuIChzZWxlY3RvciBhcyB7IHZpZXdUeXBlPzogc3RyaW5nIH0pLnZpZXdUeXBlICE9PSB1bmRlZmluZWQ7XG59XG5cbmludGVyZmFjZSBJQ2hhdENvbnRleHRQcm92aWRlckVudHJ5IHtcblx0cGlja2VyPzogeyB0aXRsZTogc3RyaW5nOyBpY29uOiBUaGVtZUljb24gfTtcblx0d29ya3NwYWNlUHJvdmlkZXI/OiBJQ2hhdFdvcmtzcGFjZUNvbnRleHRQcm92aWRlcjtcblx0ZXhwbGljaXRQcm92aWRlcj86IElDaGF0RXhwbGljaXRDb250ZXh0UHJvdmlkZXI7XG5cdHJlc291cmNlUHJvdmlkZXI/OiB7XG5cdFx0c2VsZWN0b3I6IENoYXRUYWJTZWxlY3Rvcjtcblx0XHRwcm92aWRlcjogSUNoYXRSZXNvdXJjZUNvbnRleHRQcm92aWRlcjtcblx0fTtcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRDb250ZXh0U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJzID0gbmV3IE1hcDxzdHJpbmcsIElDaGF0Q29udGV4dFByb3ZpZGVyRW50cnk+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZUNvbnRleHQgPSBuZXcgTWFwPHN0cmluZywgSUNoYXRDb250ZXh0SXRlbVtdPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWdpc3RlcmVkUGlja2VycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgSURpc3Bvc2FibGU+KCkpO1xuXHRwcml2YXRlIF9sYXN0UmVzb3VyY2VDb250ZXh0OiBNYXA8U3RyaW5nQ2hhdENvbnRleHRWYWx1ZSwgeyBvcmlnaW5hbEl0ZW06IElDaGF0Q29udGV4dEl0ZW07IHByb3ZpZGVyOiBJQ2hhdFJlc291cmNlQ29udGV4dFByb3ZpZGVyIH0+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIF9leGVjdXRlQ29tbWFuZENhbGxiYWNrOiAoKGl0ZW1IYW5kbGU6IG51bWJlcikgPT4gUHJvbWlzZTx2b2lkPikgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0Q29udGV4dFBpY2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRQaWNrU2VydmljZTogSUNoYXRDb250ZXh0UGlja1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRzZXRFeGVjdXRlQ29tbWFuZENhbGxiYWNrKGNhbGxiYWNrOiAoaXRlbUhhbmRsZTogbnVtYmVyKSA9PiBQcm9taXNlPHZvaWQ+KTogdm9pZCB7XG5cdFx0dGhpcy5fZXhlY3V0ZUNvbW1hbmRDYWxsYmFjayA9IGNhbGxiYWNrO1xuXHR9XG5cblx0YXN5bmMgZXhlY3V0ZUNoYXRDb250ZXh0SXRlbUNvbW1hbmQoaGFuZGxlOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX2V4ZWN1dGVDb21tYW5kQ2FsbGJhY2spIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fZXhlY3V0ZUNvbW1hbmRDYWxsYmFjayhoYW5kbGUpO1xuXHR9XG5cblx0c2V0Q2hhdENvbnRleHRQcm92aWRlcihpZDogc3RyaW5nLCBwaWNrZXI6IHsgdGl0bGU6IHN0cmluZzsgaWNvbjogVGhlbWVJY29uIH0pOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlckVudHJ5ID0gdGhpcy5fcHJvdmlkZXJzLmdldChpZCkgPz8ge307XG5cdFx0cHJvdmlkZXJFbnRyeS5waWNrZXIgPSBwaWNrZXI7XG5cdFx0dGhpcy5fcHJvdmlkZXJzLnNldChpZCwgcHJvdmlkZXJFbnRyeSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJXaXRoUGlja1NlcnZpY2UoaWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJXaXRoUGlja1NlcnZpY2UoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyRW50cnkgPSB0aGlzLl9wcm92aWRlcnMuZ2V0KGlkKTtcblx0XHRpZiAoIXByb3ZpZGVyRW50cnkgfHwgIXByb3ZpZGVyRW50cnkucGlja2VyIHx8ICFwcm92aWRlckVudHJ5LmV4cGxpY2l0UHJvdmlkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGl0bGUgPSBgJHtwcm92aWRlckVudHJ5LnBpY2tlci50aXRsZS5yZXBsYWNlKC9cXC4rJC8sICcnKX0uLi5gO1xuXHRcdHRoaXMuX3JlZ2lzdGVyZWRQaWNrZXJzLnNldChpZCwgdGhpcy5fY29udGV4dFBpY2tTZXJ2aWNlLnJlZ2lzdGVyQ2hhdENvbnRleHRJdGVtKHRoaXMuX2FzUGlja2VyKHRpdGxlLCBwcm92aWRlckVudHJ5LnBpY2tlci5pY29uLCBpZCkpKTtcblx0fVxuXG5cdHJlZ2lzdGVyQ2hhdFdvcmtzcGFjZUNvbnRleHRQcm92aWRlcihpZDogc3RyaW5nLCBwcm92aWRlcjogSUNoYXRXb3Jrc3BhY2VDb250ZXh0UHJvdmlkZXIpOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlckVudHJ5ID0gdGhpcy5fcHJvdmlkZXJzLmdldChpZCkgPz8ge307XG5cdFx0cHJvdmlkZXJFbnRyeS53b3Jrc3BhY2VQcm92aWRlciA9IHByb3ZpZGVyO1xuXHRcdHRoaXMuX3Byb3ZpZGVycy5zZXQoaWQsIHByb3ZpZGVyRW50cnkpO1xuXHR9XG5cblx0cmVnaXN0ZXJDaGF0RXhwbGljaXRDb250ZXh0UHJvdmlkZXIoaWQ6IHN0cmluZywgcHJvdmlkZXI6IElDaGF0RXhwbGljaXRDb250ZXh0UHJvdmlkZXIpOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlckVudHJ5ID0gdGhpcy5fcHJvdmlkZXJzLmdldChpZCkgPz8ge307XG5cdFx0cHJvdmlkZXJFbnRyeS5leHBsaWNpdFByb3ZpZGVyID0gcHJvdmlkZXI7XG5cdFx0dGhpcy5fcHJvdmlkZXJzLnNldChpZCwgcHJvdmlkZXJFbnRyeSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJXaXRoUGlja1NlcnZpY2UoaWQpO1xuXHR9XG5cblx0cmVnaXN0ZXJDaGF0UmVzb3VyY2VDb250ZXh0UHJvdmlkZXIoaWQ6IHN0cmluZywgc2VsZWN0b3I6IENoYXRUYWJTZWxlY3RvciwgcHJvdmlkZXI6IElDaGF0UmVzb3VyY2VDb250ZXh0UHJvdmlkZXIpOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlckVudHJ5ID0gdGhpcy5fcHJvdmlkZXJzLmdldChpZCkgPz8ge307XG5cdFx0cHJvdmlkZXJFbnRyeS5yZXNvdXJjZVByb3ZpZGVyID0geyBzZWxlY3RvciwgcHJvdmlkZXIgfTtcblx0XHR0aGlzLl9wcm92aWRlcnMuc2V0KGlkLCBwcm92aWRlckVudHJ5KTtcblx0fVxuXG5cdHVucmVnaXN0ZXJDaGF0Q29udGV4dFByb3ZpZGVyKGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9wcm92aWRlcnMuZGVsZXRlKGlkKTtcblx0XHR0aGlzLl9yZWdpc3RlcmVkUGlja2Vycy5kZWxldGVBbmREaXNwb3NlKGlkKTtcblx0fVxuXG5cdHVwZGF0ZVdvcmtzcGFjZUNvbnRleHRJdGVtcyhpZDogc3RyaW5nLCBpdGVtczogSUNoYXRDb250ZXh0SXRlbVtdKTogdm9pZCB7XG5cdFx0dGhpcy5fd29ya3NwYWNlQ29udGV4dC5zZXQoaWQsIGl0ZW1zKTtcblx0fVxuXG5cdGdldFdvcmtzcGFjZUNvbnRleHRJdGVtcygpOiBJQ2hhdFJlcXVlc3RXb3Jrc3BhY2VWYXJpYWJsZUVudHJ5W10ge1xuXHRcdGNvbnN0IGl0ZW1zOiBJQ2hhdFJlcXVlc3RXb3Jrc3BhY2VWYXJpYWJsZUVudHJ5W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHdvcmtzcGFjZUNvbnRleHRzIG9mIHRoaXMuX3dvcmtzcGFjZUNvbnRleHQudmFsdWVzKCkpIHtcblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiB3b3Jrc3BhY2VDb250ZXh0cykge1xuXHRcdFx0XHRpZiAoIWl0ZW0udmFsdWUpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBEZXJpdmUgbGFiZWwgZnJvbSByZXNvdXJjZVVyaSBpZiBsYWJlbCBpcyBub3Qgc2V0XG5cdFx0XHRcdGNvbnN0IGRlcml2ZWRMYWJlbCA9IGl0ZW0ubGFiZWwgPz8gKGl0ZW0ucmVzb3VyY2VVcmkgPyBiYXNlbmFtZShpdGVtLnJlc291cmNlVXJpKSA6ICdVbmtub3duJyk7XG5cdFx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdHZhbHVlOiBpdGVtLnZhbHVlLFxuXHRcdFx0XHRcdG5hbWU6IGRlcml2ZWRMYWJlbCxcblx0XHRcdFx0XHRtb2RlbERlc2NyaXB0aW9uOiBpdGVtLm1vZGVsRGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0aWQ6IGRlcml2ZWRMYWJlbCxcblx0XHRcdFx0XHRraW5kOiAnd29ya3NwYWNlJ1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGl0ZW1zO1xuXHR9XG5cblx0YXN5bmMgY29udGV4dEZvclJlc291cmNlKHVyaTogVVJJLCBsYW5ndWFnZT86IHN0cmluZywgdmlld1R5cGU/OiBzdHJpbmcpOiBQcm9taXNlPFN0cmluZ0NoYXRDb250ZXh0VmFsdWUgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGV4dEZvclJlc291cmNlKHVyaSwgZmFsc2UsIGxhbmd1YWdlLCB2aWV3VHlwZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb250ZXh0Rm9yUmVzb3VyY2UodXJpOiBVUkksIHdpdGhWYWx1ZTogYm9vbGVhbiwgbGFuZ3VhZ2U/OiBzdHJpbmcsIHZpZXdUeXBlPzogc3RyaW5nKTogUHJvbWlzZTxTdHJpbmdDaGF0Q29udGV4dFZhbHVlIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgc2NvcmVkUHJvdmlkZXJzOiBBcnJheTx7IHNjb3JlOiBudW1iZXI7IHByb3ZpZGVyOiBJQ2hhdFJlc291cmNlQ29udGV4dFByb3ZpZGVyIH0+ID0gW107XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlckVudHJ5IG9mIHRoaXMuX3Byb3ZpZGVycy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKCFwcm92aWRlckVudHJ5LnJlc291cmNlUHJvdmlkZXIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZWxlY3RvciA9IHByb3ZpZGVyRW50cnkucmVzb3VyY2VQcm92aWRlci5zZWxlY3Rvcjtcblx0XHRcdGNvbnN0IG1hdGNoU2NvcmUgPSBpc1ZpZXdUeXBlVGFiU2VsZWN0b3Ioc2VsZWN0b3IpXG5cdFx0XHRcdD8gKHZpZXdUeXBlICE9PSB1bmRlZmluZWQgJiYgc2VsZWN0b3Iudmlld1R5cGUgPT09IHZpZXdUeXBlID8gMTAgOiAwKVxuXHRcdFx0XHQ6IHNjb3JlKHNlbGVjdG9yLnVyaSwgdXJpLCBsYW5ndWFnZSA/PyAnJywgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0c2NvcmVkUHJvdmlkZXJzLnB1c2goeyBzY29yZTogbWF0Y2hTY29yZSwgcHJvdmlkZXI6IHByb3ZpZGVyRW50cnkucmVzb3VyY2VQcm92aWRlci5wcm92aWRlciB9KTtcblx0XHR9XG5cdFx0c2NvcmVkUHJvdmlkZXJzLnNvcnQoKGEsIGIpID0+IGIuc2NvcmUgLSBhLnNjb3JlKTtcblx0XHRpZiAoc2NvcmVkUHJvdmlkZXJzLmxlbmd0aCA9PT0gMCB8fCBzY29yZWRQcm92aWRlcnNbMF0uc2NvcmUgPD0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwcm92aWRlciA9IHNjb3JlZFByb3ZpZGVyc1swXS5wcm92aWRlcjtcblx0XHRjb25zdCBjb250ZXh0ID0gKGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDaGF0Q29udGV4dCh1cmksIHdpdGhWYWx1ZSwgdmlld1R5cGUsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKTtcblx0XHRpZiAoIWNvbnRleHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gRGVyaXZlIGxhYmVsIGZyb20gcmVzb3VyY2VVcmkgaWYgbGFiZWwgaXMgbm90IHNldFxuXHRcdGNvbnN0IGVmZmVjdGl2ZVJlc291cmNlVXJpID0gY29udGV4dC5yZXNvdXJjZVVyaSA/PyB1cmk7XG5cdFx0Y29uc3QgZGVyaXZlZExhYmVsID0gY29udGV4dC5sYWJlbCA/PyBiYXNlbmFtZShlZmZlY3RpdmVSZXNvdXJjZVVyaSk7XG5cdFx0Y29uc3QgY29udGV4dFZhbHVlOiBTdHJpbmdDaGF0Q29udGV4dFZhbHVlID0ge1xuXHRcdFx0dmFsdWU6IHVuZGVmaW5lZCxcblx0XHRcdG5hbWU6IGRlcml2ZWRMYWJlbCxcblx0XHRcdGljb25QYXRoOiBjb250ZXh0Lmljb25QYXRoLFxuXHRcdFx0dXJpOiB1cmksXG5cdFx0XHRyZXNvdXJjZVVyaTogY29udGV4dC5yZXNvdXJjZVVyaSxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246IGNvbnRleHQubW9kZWxEZXNjcmlwdGlvbixcblx0XHRcdHRvb2x0aXA6IGNvbnRleHQudG9vbHRpcCxcblx0XHRcdGNvbW1hbmRJZDogY29udGV4dC5jb21tYW5kPy5pZCxcblx0XHRcdGhhbmRsZTogY29udGV4dC5oYW5kbGVcblx0XHR9O1xuXHRcdHRoaXMuX2xhc3RSZXNvdXJjZUNvbnRleHQuY2xlYXIoKTtcblx0XHR0aGlzLl9sYXN0UmVzb3VyY2VDb250ZXh0LnNldChjb250ZXh0VmFsdWUsIHsgb3JpZ2luYWxJdGVtOiBjb250ZXh0LCBwcm92aWRlciB9KTtcblx0XHRyZXR1cm4gY29udGV4dFZhbHVlO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZUNoYXRDb250ZXh0KGNvbnRleHQ6IFN0cmluZ0NoYXRDb250ZXh0VmFsdWUsIGxhbmd1YWdlPzogc3RyaW5nKTogUHJvbWlzZTxTdHJpbmdDaGF0Q29udGV4dFZhbHVlPiB7XG5cdFx0aWYgKGNvbnRleHQudmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGNvbnRleHQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbSA9IHRoaXMuX2xhc3RSZXNvdXJjZUNvbnRleHQuZ2V0KGNvbnRleHQpO1xuXHRcdGlmICghaXRlbSkge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCB0aGlzLl9jb250ZXh0Rm9yUmVzb3VyY2UoY29udGV4dC51cmksIHRydWUsIGxhbmd1YWdlKTtcblx0XHRcdGNvbnRleHQudmFsdWUgPSByZXNvbHZlZD8udmFsdWU7XG5cdFx0XHRjb250ZXh0Lm1vZGVsRGVzY3JpcHRpb24gPSByZXNvbHZlZD8ubW9kZWxEZXNjcmlwdGlvbjtcblx0XHRcdGNvbnRleHQudG9vbHRpcCA9IHJlc29sdmVkPy50b29sdGlwO1xuXHRcdFx0cmV0dXJuIGNvbnRleHQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgaXRlbS5wcm92aWRlci5yZXNvbHZlQ2hhdENvbnRleHQoaXRlbS5vcmlnaW5hbEl0ZW0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0aWYgKHJlc29sdmVkKSB7XG5cdFx0XHRcdGNvbnRleHQudmFsdWUgPSByZXNvbHZlZC52YWx1ZTtcblx0XHRcdFx0Y29udGV4dC5tb2RlbERlc2NyaXB0aW9uID0gcmVzb2x2ZWQubW9kZWxEZXNjcmlwdGlvbjtcblx0XHRcdFx0Y29udGV4dC50b29sdGlwID0gcmVzb2x2ZWQudG9vbHRpcDtcblx0XHRcdFx0cmV0dXJuIGNvbnRleHQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjb250ZXh0O1xuXHR9XG5cblx0cHJpdmF0ZSBfYXNQaWNrZXIodGl0bGU6IHN0cmluZywgaWNvbjogVGhlbWVJY29uLCBpZDogc3RyaW5nKTogSUNoYXRDb250ZXh0UGlja2VySXRlbSB7XG5cdFx0Y29uc3QgYXNQaWNrZXIgPSAoKTogSUNoYXRDb250ZXh0UGlja2VyID0+IHtcblx0XHRcdGxldCBwcm92aWRlckVudHJ5ID0gdGhpcy5fcHJvdmlkZXJzLmdldChpZCk7XG5cdFx0XHRpZiAoIXByb3ZpZGVyRW50cnkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBjaGF0IGNvbnRleHQgcHJvdmlkZXIgcmVnaXN0ZXJlZCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwaWNrcyA9IGFzeW5jICgpOiBQcm9taXNlPElDaGF0Q29udGV4dEl0ZW1bXT4gPT4ge1xuXHRcdFx0XHRpZiAocHJvdmlkZXJFbnRyeSAmJiAhcHJvdmlkZXJFbnRyeS5leHBsaWNpdFByb3ZpZGVyKSB7XG5cdFx0XHRcdFx0Ly8gQWN0aXZhdGUgdGhlIGV4dGVuc2lvbiBwcm92aWRpbmcgdGhlIGNoYXQgY29udGV4dCBwcm92aWRlclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGBvbkNoYXRDb250ZXh0UHJvdmlkZXI6JHtpZH1gKTtcblx0XHRcdFx0XHRwcm92aWRlckVudHJ5ID0gdGhpcy5fcHJvdmlkZXJzLmdldChpZCk7XG5cdFx0XHRcdFx0aWYgKCFwcm92aWRlckVudHJ5Py5leHBsaWNpdFByb3ZpZGVyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBwcm92aWRlckVudHJ5Py5leHBsaWNpdFByb3ZpZGVyIS5wcm92aWRlQ2hhdENvbnRleHQoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdHJldHVybiByZXN1bHRzIHx8IFtdO1xuXHRcdFx0fTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cGlja3M6IHBpY2tzKCkudGhlbihpdGVtcyA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIGl0ZW1zLm1hcChpdGVtID0+IHtcblx0XHRcdFx0XHRcdC8vIERlcml2ZSBsYWJlbCBmcm9tIHJlc291cmNlVXJpIGlmIGxhYmVsIGlzIG5vdCBzZXRcblx0XHRcdFx0XHRcdGNvbnN0IGRlcml2ZWRMYWJlbCA9IGl0ZW0ubGFiZWwgPz8gKGl0ZW0ucmVzb3VyY2VVcmkgPyBiYXNlbmFtZShpdGVtLnJlc291cmNlVXJpKSA6ICdVbmtub3duJyk7XG5cdFx0XHRcdFx0XHRjb25zdCBpY29uUGF0aCA9IGl0ZW0uaWNvblBhdGg7XG5cdFx0XHRcdFx0XHRjb25zdCBpc1RoZW1lSWNvbiA9IFRoZW1lSWNvbi5pc1RoZW1lSWNvbihpY29uUGF0aCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogZGVyaXZlZExhYmVsLFxuXHRcdFx0XHRcdFx0XHRpY29uQ2xhc3M6IGlzVGhlbWVJY29uID8gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb25QYXRoKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0aWNvblBhdGg6ICghaXNUaGVtZUljb24gJiYgaWNvblBhdGgpXG5cdFx0XHRcdFx0XHRcdFx0PyAoVVJJLmlzVXJpKGljb25QYXRoKSA/IHsgZGFyazogaWNvblBhdGgsIGxpZ2h0OiBpY29uUGF0aCB9IDogeyBkYXJrOiBpY29uUGF0aC5kYXJrLCBsaWdodDogaWNvblBhdGgubGlnaHQgfSlcblx0XHRcdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0YXNBdHRhY2htZW50OiBhc3luYyAoKTogUHJvbWlzZTxJR2VuZXJpY0NoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeT4gPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGxldCBjb250ZXh0VmFsdWUgPSBpdGVtO1xuXHRcdFx0XHRcdFx0XHRcdGlmICgoY29udGV4dFZhbHVlLnZhbHVlID09PSB1bmRlZmluZWQpICYmIHByb3ZpZGVyRW50cnk/LmV4cGxpY2l0UHJvdmlkZXIpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnRleHRWYWx1ZSA9IGF3YWl0IHByb3ZpZGVyRW50cnkuZXhwbGljaXRQcm92aWRlci5yZXNvbHZlQ2hhdENvbnRleHQoaXRlbSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdC8vIERlcml2ZSBsYWJlbCBmcm9tIHJlc291cmNlVXJpIGlmIGxhYmVsIGlzIG5vdCBzZXRcblx0XHRcdFx0XHRcdFx0XHRjb25zdCByZXNvbHZlZExhYmVsID0gY29udGV4dFZhbHVlLmxhYmVsID8/IChjb250ZXh0VmFsdWUucmVzb3VyY2VVcmkgPyBiYXNlbmFtZShjb250ZXh0VmFsdWUucmVzb3VyY2VVcmkpIDogJ1Vua25vd24nKTtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLFxuXHRcdFx0XHRcdFx0XHRcdFx0aWQ6IHJlc29sdmVkTGFiZWwsXG5cdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiByZXNvbHZlZExhYmVsLFxuXHRcdFx0XHRcdFx0XHRcdFx0aWNvblBhdGg6IGNvbnRleHRWYWx1ZS5pY29uUGF0aCA/PyBpdGVtLmljb25QYXRoLFxuXHRcdFx0XHRcdFx0XHRcdFx0dmFsdWU6IGNvbnRleHRWYWx1ZS52YWx1ZSxcblx0XHRcdFx0XHRcdFx0XHRcdHRvb2x0aXA6IGNvbnRleHRWYWx1ZS50b29sdGlwID8/IGl0ZW0udG9vbHRpcCxcblx0XHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KSxcblx0XHRcdFx0cGxhY2Vob2xkZXI6IHRpdGxlXG5cdFx0XHR9O1xuXHRcdH07XG5cblx0XHRjb25zdCBwaWNrZXI6IElDaGF0Q29udGV4dFBpY2tlckl0ZW0gPSB7XG5cdFx0XHRhc1BpY2tlcixcblx0XHRcdHR5cGU6ICdwaWNrZXJQaWNrJyxcblx0XHRcdGxhYmVsOiB0aXRsZSxcblx0XHRcdGljb25cblx0XHR9O1xuXG5cdFx0cmV0dXJuIHBpY2tlcjtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdENvbnRleHRTZXJ2aWNlLCBDaGF0Q29udGV4dFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGlCQUFpQjtBQUMxQixTQUEyQixhQUFhO0FBQ3hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQXFELCtCQUErQjtBQUVwRixTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyxZQUFZLHFCQUFrQztBQUN2RCxTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFFbEIsTUFBTSxzQkFBc0IsZ0JBQXFDLG9CQUFvQjtBQVU1RixTQUFTLHNCQUFzQixVQUE2RDtBQUMzRixTQUFRLFNBQW1DLGFBQWE7QUFDekQ7QUFZTyxJQUFNLHFCQUFOLGNBQWlDLFdBQVc7QUFBQSxFQVNsRCxZQUMyQyxxQkFDTixtQkFDbkM7QUFDRCxVQUFNO0FBSG9DO0FBQ047QUFSckMsU0FBaUIsYUFB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
