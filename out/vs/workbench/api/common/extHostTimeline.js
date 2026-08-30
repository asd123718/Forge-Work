import { URI } from "../../../base/common/uri.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { MainContext } from "./extHost.protocol.js";
import { toDisposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { ThemeIcon, MarkdownString as MarkdownStringType } from "./extHostTypes.js";
import { MarkdownString } from "./extHostTypeConverters.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import { isString } from "../../../base/common/types.js";
import { isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
const IExtHostTimeline = createDecorator("IExtHostTimeline");
class ExtHostTimeline {
  constructor(mainContext, commands) {
    this._providers = /* @__PURE__ */ new Map();
    this._itemsBySourceAndUriMap = /* @__PURE__ */ new Map();
    this._proxy = mainContext.getProxy(MainContext.MainThreadTimeline);
    commands.registerArgumentProcessor({
      processArgument: (arg, extension) => {
        if (arg && arg.$mid === MarshalledId.TimelineActionContext) {
          if (this._providers.get(arg.source) && extension && isProposedApiEnabled(extension, "timeline")) {
            const uri = arg.uri === void 0 ? void 0 : URI.revive(arg.uri);
            return this._itemsBySourceAndUriMap.get(arg.source)?.get(getUriKey(uri))?.get(arg.handle);
          } else {
            return void 0;
          }
        }
        return arg;
      }
    });
  }
  async $getTimeline(id, uri, options, token) {
    const item = this._providers.get(id);
    return item?.provider.provideTimeline(URI.revive(uri), options, token);
  }
  registerTimelineProvider(scheme, provider, extensionId, commandConverter) {
    const timelineDisposables = new DisposableStore();
    const convertTimelineItem = this.convertTimelineItem(provider.id, commandConverter, timelineDisposables).bind(this);
    let disposable;
    if (provider.onDidChange) {
      disposable = provider.onDidChange((e) => this._proxy.$emitTimelineChangeEvent({ uri: void 0, reset: true, ...e, id: provider.id }), this);
    }
    const itemsBySourceAndUriMap = this._itemsBySourceAndUriMap;
    return this.registerTimelineProviderCore({
      ...provider,
      scheme,
      onDidChange: void 0,
      async provideTimeline(uri, options, token) {
        if (options?.resetCache) {
          timelineDisposables.clear();
          itemsBySourceAndUriMap.get(provider.id)?.clear();
        }
        const result = await provider.provideTimeline(uri, options, token);
        if (result === void 0 || result === null) {
          return void 0;
        }
        const convertItem = convertTimelineItem(uri, options);
        return {
          ...result,
          source: provider.id,
          items: result.items.map(convertItem)
        };
      },
      dispose() {
        for (const sourceMap of itemsBySourceAndUriMap.values()) {
          sourceMap.get(provider.id)?.clear();
        }
        disposable?.dispose();
        timelineDisposables.dispose();
      }
    }, extensionId);
  }
  convertTimelineItem(source, commandConverter, disposables) {
    return (uri, options) => {
      let items;
      if (options?.cacheResults) {
        let itemsByUri = this._itemsBySourceAndUriMap.get(source);
        if (itemsByUri === void 0) {
          itemsByUri = /* @__PURE__ */ new Map();
          this._itemsBySourceAndUriMap.set(source, itemsByUri);
        }
        const uriKey = getUriKey(uri);
        items = itemsByUri.get(uriKey);
        if (items === void 0) {
          items = /* @__PURE__ */ new Map();
          itemsByUri.set(uriKey, items);
        }
      }
      return (item) => {
        const { iconPath, ...props } = item;
        const handle = `${source}|${item.id ?? item.timestamp}`;
        items?.set(handle, item);
        let icon;
        let iconDark;
        let themeIcon;
        if (item.iconPath) {
          if (iconPath instanceof ThemeIcon) {
            themeIcon = { id: iconPath.id, color: iconPath.color };
          } else if (URI.isUri(iconPath)) {
            icon = iconPath;
            iconDark = iconPath;
          } else {
            ({ light: icon, dark: iconDark } = iconPath);
          }
        }
        let tooltip;
        if (MarkdownStringType.isMarkdownString(props.tooltip)) {
          tooltip = MarkdownString.from(props.tooltip);
        } else if (isString(props.tooltip)) {
          tooltip = props.tooltip;
        } else if (MarkdownStringType.isMarkdownString(props.detail)) {
          console.warn("Using deprecated TimelineItem.detail, migrate to TimelineItem.tooltip");
          tooltip = MarkdownString.from(props.detail);
        } else if (isString(props.detail)) {
          console.warn("Using deprecated TimelineItem.detail, migrate to TimelineItem.tooltip");
          tooltip = props.detail;
        }
        return {
          ...props,
          id: props.id ?? void 0,
          handle,
          source,
          command: item.command ? commandConverter.toInternal(item.command, disposables) : void 0,
          icon,
          iconDark,
          themeIcon,
          tooltip,
          accessibilityInformation: item.accessibilityInformation
        };
      };
    };
  }
  registerTimelineProviderCore(provider, extension) {
    const existing = this._providers.get(provider.id);
    if (existing) {
      throw new Error(`Timeline Provider ${provider.id} already exists.`);
    }
    this._proxy.$registerTimelineProvider({
      id: provider.id,
      label: provider.label,
      scheme: provider.scheme
    });
    this._providers.set(provider.id, { provider, extension });
    return toDisposable(() => {
      for (const sourceMap of this._itemsBySourceAndUriMap.values()) {
        sourceMap.get(provider.id)?.clear();
      }
      this._providers.delete(provider.id);
      this._proxy.$unregisterTimelineProvider(provider.id);
      provider.dispose();
    });
  }
}
function getUriKey(uri) {
  return uri?.toString();
}
export {
  ExtHostTimeline,
  IExtHostTimeline
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0VGltZWxpbmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IFVyaUNvbXBvbmVudHMsIFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEV4dEhvc3RUaW1lbGluZVNoYXBlLCBNYWluVGhyZWFkVGltZWxpbmVTaGFwZSwgSU1haW5Db250ZXh0LCBNYWluQ29udGV4dCB9IGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBUaW1lbGluZSwgVGltZWxpbmVJdGVtLCBUaW1lbGluZU9wdGlvbnMsIFRpbWVsaW5lUHJvdmlkZXIgfSBmcm9tICcuLi8uLi9jb250cmliL3RpbWVsaW5lL2NvbW1vbi90aW1lbGluZS5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNDb252ZXJ0ZXIsIEV4dEhvc3RDb21tYW5kcyB9IGZyb20gJy4vZXh0SG9zdENvbW1hbmRzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiwgTWFya2Rvd25TdHJpbmcgYXMgTWFya2Rvd25TdHJpbmdUeXBlIH0gZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuL2V4dEhvc3RUeXBlQ29udmVydGVycy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkSWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZ0lkcy5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGlzUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dEhvc3RUaW1lbGluZSBleHRlbmRzIEV4dEhvc3RUaW1lbGluZVNoYXBlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHQkZ2V0VGltZWxpbmUoaWQ6IHN0cmluZywgdXJpOiBVcmlDb21wb25lbnRzLCBvcHRpb25zOiB2c2NvZGUuVGltZWxpbmVPcHRpb25zLCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxUaW1lbGluZSB8IHVuZGVmaW5lZD47XG59XG5cbmV4cG9ydCBjb25zdCBJRXh0SG9zdFRpbWVsaW5lID0gY3JlYXRlRGVjb3JhdG9yPElFeHRIb3N0VGltZWxpbmU+KCdJRXh0SG9zdFRpbWVsaW5lJyk7XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0VGltZWxpbmUgaW1wbGVtZW50cyBJRXh0SG9zdFRpbWVsaW5lIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfcHJveHk6IE1haW5UaHJlYWRUaW1lbGluZVNoYXBlO1xuXG5cdHByaXZhdGUgX3Byb3ZpZGVycyA9IG5ldyBNYXA8c3RyaW5nLCB7IHByb3ZpZGVyOiBUaW1lbGluZVByb3ZpZGVyOyBleHRlbnNpb246IEV4dGVuc2lvbklkZW50aWZpZXIgfT4oKTtcblxuXHRwcml2YXRlIF9pdGVtc0J5U291cmNlQW5kVXJpTWFwID0gbmV3IE1hcDxzdHJpbmcsIE1hcDxzdHJpbmcgfCB1bmRlZmluZWQsIE1hcDxzdHJpbmcsIHZzY29kZS5UaW1lbGluZUl0ZW0+Pj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRtYWluQ29udGV4dDogSU1haW5Db250ZXh0LFxuXHRcdGNvbW1hbmRzOiBFeHRIb3N0Q29tbWFuZHMsXG5cdCkge1xuXHRcdHRoaXMuX3Byb3h5ID0gbWFpbkNvbnRleHQuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZFRpbWVsaW5lKTtcblxuXHRcdGNvbW1hbmRzLnJlZ2lzdGVyQXJndW1lbnRQcm9jZXNzb3Ioe1xuXHRcdFx0cHJvY2Vzc0FyZ3VtZW50OiAoYXJnLCBleHRlbnNpb24pID0+IHtcblx0XHRcdFx0aWYgKGFyZyAmJiBhcmcuJG1pZCA9PT0gTWFyc2hhbGxlZElkLlRpbWVsaW5lQWN0aW9uQ29udGV4dCkge1xuXHRcdFx0XHRcdGlmICh0aGlzLl9wcm92aWRlcnMuZ2V0KGFyZy5zb3VyY2UpICYmIGV4dGVuc2lvbiAmJiBpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd0aW1lbGluZScpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB1cmkgPSBhcmcudXJpID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiBVUkkucmV2aXZlKGFyZy51cmkpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2l0ZW1zQnlTb3VyY2VBbmRVcmlNYXAuZ2V0KGFyZy5zb3VyY2UpPy5nZXQoZ2V0VXJpS2V5KHVyaSkpPy5nZXQoYXJnLmhhbmRsZSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhcmc7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyAkZ2V0VGltZWxpbmUoaWQ6IHN0cmluZywgdXJpOiBVcmlDb21wb25lbnRzLCBvcHRpb25zOiB2c2NvZGUuVGltZWxpbmVPcHRpb25zLCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxUaW1lbGluZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9wcm92aWRlcnMuZ2V0KGlkKTtcblx0XHRyZXR1cm4gaXRlbT8ucHJvdmlkZXIucHJvdmlkZVRpbWVsaW5lKFVSSS5yZXZpdmUodXJpKSwgb3B0aW9ucywgdG9rZW4pO1xuXHR9XG5cblx0cmVnaXN0ZXJUaW1lbGluZVByb3ZpZGVyKHNjaGVtZTogc3RyaW5nIHwgc3RyaW5nW10sIHByb3ZpZGVyOiB2c2NvZGUuVGltZWxpbmVQcm92aWRlciwgZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIGNvbW1hbmRDb252ZXJ0ZXI6IENvbW1hbmRzQ29udmVydGVyKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHRpbWVsaW5lRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBjb252ZXJ0VGltZWxpbmVJdGVtID0gdGhpcy5jb252ZXJ0VGltZWxpbmVJdGVtKHByb3ZpZGVyLmlkLCBjb21tYW5kQ29udmVydGVyLCB0aW1lbGluZURpc3Bvc2FibGVzKS5iaW5kKHRoaXMpO1xuXG5cdFx0bGV0IGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChwcm92aWRlci5vbkRpZENoYW5nZSkge1xuXHRcdFx0ZGlzcG9zYWJsZSA9IHByb3ZpZGVyLm9uRGlkQ2hhbmdlKGUgPT4gdGhpcy5fcHJveHkuJGVtaXRUaW1lbGluZUNoYW5nZUV2ZW50KHsgdXJpOiB1bmRlZmluZWQsIHJlc2V0OiB0cnVlLCAuLi5lLCBpZDogcHJvdmlkZXIuaWQgfSksIHRoaXMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW1zQnlTb3VyY2VBbmRVcmlNYXAgPSB0aGlzLl9pdGVtc0J5U291cmNlQW5kVXJpTWFwO1xuXHRcdHJldHVybiB0aGlzLnJlZ2lzdGVyVGltZWxpbmVQcm92aWRlckNvcmUoe1xuXHRcdFx0Li4ucHJvdmlkZXIsXG5cdFx0XHRzY2hlbWU6IHNjaGVtZSxcblx0XHRcdG9uRGlkQ2hhbmdlOiB1bmRlZmluZWQsXG5cdFx0XHRhc3luYyBwcm92aWRlVGltZWxpbmUodXJpOiBVUkksIG9wdGlvbnM6IFRpbWVsaW5lT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0XHRcdGlmIChvcHRpb25zPy5yZXNldENhY2hlKSB7XG5cdFx0XHRcdFx0dGltZWxpbmVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0XHRcdFx0Ly8gRm9yIG5vdywgb25seSBhbGxvdyB0aGUgY2FjaGluZyBvZiBhIHNpbmdsZSBVcmlcblx0XHRcdFx0XHQvLyBpdGVtc0J5U291cmNlQW5kVXJpTWFwLmdldChwcm92aWRlci5pZCk/LmdldChnZXRVcmlLZXkodXJpKSk/LmNsZWFyKCk7XG5cdFx0XHRcdFx0aXRlbXNCeVNvdXJjZUFuZFVyaU1hcC5nZXQocHJvdmlkZXIuaWQpPy5jbGVhcigpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZVRpbWVsaW5lKHVyaSwgb3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0XHRpZiAocmVzdWx0ID09PSB1bmRlZmluZWQgfHwgcmVzdWx0ID09PSBudWxsKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFRPRE86IFNob3VsZCB3ZSBib3RoZXIgY29udmVydGluZyBhbGwgdGhlIGRhdGEgaWYgd2UgYXJlbid0IGNhY2hpbmc/IE1lYW5pbmcgaXQgaXMgYmVpbmcgcmVxdWVzdGVkIGJ5IGFuIGV4dGVuc2lvbj9cblxuXHRcdFx0XHRjb25zdCBjb252ZXJ0SXRlbSA9IGNvbnZlcnRUaW1lbGluZUl0ZW0odXJpLCBvcHRpb25zKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHQuLi5yZXN1bHQsXG5cdFx0XHRcdFx0c291cmNlOiBwcm92aWRlci5pZCxcblx0XHRcdFx0XHRpdGVtczogcmVzdWx0Lml0ZW1zLm1hcChjb252ZXJ0SXRlbSlcblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlKCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNvdXJjZU1hcCBvZiBpdGVtc0J5U291cmNlQW5kVXJpTWFwLnZhbHVlcygpKSB7XG5cdFx0XHRcdFx0c291cmNlTWFwLmdldChwcm92aWRlci5pZCk/LmNsZWFyKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRkaXNwb3NhYmxlPy5kaXNwb3NlKCk7XG5cdFx0XHRcdHRpbWVsaW5lRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0sIGV4dGVuc2lvbklkKTtcblx0fVxuXG5cdHByaXZhdGUgY29udmVydFRpbWVsaW5lSXRlbShzb3VyY2U6IHN0cmluZywgY29tbWFuZENvbnZlcnRlcjogQ29tbWFuZHNDb252ZXJ0ZXIsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpIHtcblx0XHRyZXR1cm4gKHVyaTogVVJJLCBvcHRpb25zPzogVGltZWxpbmVPcHRpb25zKSA9PiB7XG5cdFx0XHRsZXQgaXRlbXM6IE1hcDxzdHJpbmcsIHZzY29kZS5UaW1lbGluZUl0ZW0+IHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKG9wdGlvbnM/LmNhY2hlUmVzdWx0cykge1xuXHRcdFx0XHRsZXQgaXRlbXNCeVVyaSA9IHRoaXMuX2l0ZW1zQnlTb3VyY2VBbmRVcmlNYXAuZ2V0KHNvdXJjZSk7XG5cdFx0XHRcdGlmIChpdGVtc0J5VXJpID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRpdGVtc0J5VXJpID0gbmV3IE1hcCgpO1xuXHRcdFx0XHRcdHRoaXMuX2l0ZW1zQnlTb3VyY2VBbmRVcmlNYXAuc2V0KHNvdXJjZSwgaXRlbXNCeVVyaSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB1cmlLZXkgPSBnZXRVcmlLZXkodXJpKTtcblx0XHRcdFx0aXRlbXMgPSBpdGVtc0J5VXJpLmdldCh1cmlLZXkpO1xuXHRcdFx0XHRpZiAoaXRlbXMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGl0ZW1zID0gbmV3IE1hcCgpO1xuXHRcdFx0XHRcdGl0ZW1zQnlVcmkuc2V0KHVyaUtleSwgaXRlbXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiAoaXRlbTogdnNjb2RlLlRpbWVsaW5lSXRlbSk6IFRpbWVsaW5lSXRlbSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgaWNvblBhdGgsIC4uLnByb3BzIH0gPSBpdGVtO1xuXG5cdFx0XHRcdGNvbnN0IGhhbmRsZSA9IGAke3NvdXJjZX18JHtpdGVtLmlkID8/IGl0ZW0udGltZXN0YW1wfWA7XG5cdFx0XHRcdGl0ZW1zPy5zZXQoaGFuZGxlLCBpdGVtKTtcblxuXHRcdFx0XHRsZXQgaWNvbjtcblx0XHRcdFx0bGV0IGljb25EYXJrO1xuXHRcdFx0XHRsZXQgdGhlbWVJY29uO1xuXHRcdFx0XHRpZiAoaXRlbS5pY29uUGF0aCkge1xuXHRcdFx0XHRcdGlmIChpY29uUGF0aCBpbnN0YW5jZW9mIFRoZW1lSWNvbikge1xuXHRcdFx0XHRcdFx0dGhlbWVJY29uID0geyBpZDogaWNvblBhdGguaWQsIGNvbG9yOiBpY29uUGF0aC5jb2xvciB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlbHNlIGlmIChVUkkuaXNVcmkoaWNvblBhdGgpKSB7XG5cdFx0XHRcdFx0XHRpY29uID0gaWNvblBhdGg7XG5cdFx0XHRcdFx0XHRpY29uRGFyayA9IGljb25QYXRoO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRcdCh7IGxpZ2h0OiBpY29uLCBkYXJrOiBpY29uRGFyayB9ID0gaWNvblBhdGggYXMgeyBsaWdodDogVVJJOyBkYXJrOiBVUkkgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IHRvb2x0aXA7XG5cdFx0XHRcdGlmIChNYXJrZG93blN0cmluZ1R5cGUuaXNNYXJrZG93blN0cmluZyhwcm9wcy50b29sdGlwKSkge1xuXHRcdFx0XHRcdHRvb2x0aXAgPSBNYXJrZG93blN0cmluZy5mcm9tKHByb3BzLnRvb2x0aXApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2UgaWYgKGlzU3RyaW5nKHByb3BzLnRvb2x0aXApKSB7XG5cdFx0XHRcdFx0dG9vbHRpcCA9IHByb3BzLnRvb2x0aXA7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gVE9ETyBAamtlYXJsLCByZW1vdmUgb25jZSBtaWdyYXRpb24gY29tcGxldGUuXG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRlbHNlIGlmIChNYXJrZG93blN0cmluZ1R5cGUuaXNNYXJrZG93blN0cmluZygocHJvcHMgYXMgYW55KS5kZXRhaWwpKSB7XG5cdFx0XHRcdFx0Y29uc29sZS53YXJuKCdVc2luZyBkZXByZWNhdGVkIFRpbWVsaW5lSXRlbS5kZXRhaWwsIG1pZ3JhdGUgdG8gVGltZWxpbmVJdGVtLnRvb2x0aXAnKTtcblx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0XHR0b29sdGlwID0gTWFya2Rvd25TdHJpbmcuZnJvbSgocHJvcHMgYXMgYW55KS5kZXRhaWwpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRlbHNlIGlmIChpc1N0cmluZygocHJvcHMgYXMgYW55KS5kZXRhaWwpKSB7XG5cdFx0XHRcdFx0Y29uc29sZS53YXJuKCdVc2luZyBkZXByZWNhdGVkIFRpbWVsaW5lSXRlbS5kZXRhaWwsIG1pZ3JhdGUgdG8gVGltZWxpbmVJdGVtLnRvb2x0aXAnKTtcblx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0XHR0b29sdGlwID0gKHByb3BzIGFzIGFueSkuZGV0YWlsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHQuLi5wcm9wcyxcblx0XHRcdFx0XHRpZDogcHJvcHMuaWQgPz8gdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGhhbmRsZTogaGFuZGxlLFxuXHRcdFx0XHRcdHNvdXJjZTogc291cmNlLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IGl0ZW0uY29tbWFuZCA/IGNvbW1hbmRDb252ZXJ0ZXIudG9JbnRlcm5hbChpdGVtLmNvbW1hbmQsIGRpc3Bvc2FibGVzKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRpY29uOiBpY29uLFxuXHRcdFx0XHRcdGljb25EYXJrOiBpY29uRGFyayxcblx0XHRcdFx0XHR0aGVtZUljb246IHRoZW1lSWNvbixcblx0XHRcdFx0XHR0b29sdGlwLFxuXHRcdFx0XHRcdGFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbjogaXRlbS5hY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb25cblx0XHRcdFx0fTtcblx0XHRcdH07XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJUaW1lbGluZVByb3ZpZGVyQ29yZShwcm92aWRlcjogVGltZWxpbmVQcm92aWRlciwgZXh0ZW5zaW9uOiBFeHRlbnNpb25JZGVudGlmaWVyKTogSURpc3Bvc2FibGUge1xuXHRcdC8vIGNvbnNvbGUubG9nKGBFeHRIb3N0VGltZWxpbmUjcmVnaXN0ZXJUaW1lbGluZVByb3ZpZGVyOiBpZD0ke3Byb3ZpZGVyLmlkfWApO1xuXG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9wcm92aWRlcnMuZ2V0KHByb3ZpZGVyLmlkKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVGltZWxpbmUgUHJvdmlkZXIgJHtwcm92aWRlci5pZH0gYWxyZWFkeSBleGlzdHMuYCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyVGltZWxpbmVQcm92aWRlcih7XG5cdFx0XHRpZDogcHJvdmlkZXIuaWQsXG5cdFx0XHRsYWJlbDogcHJvdmlkZXIubGFiZWwsXG5cdFx0XHRzY2hlbWU6IHByb3ZpZGVyLnNjaGVtZVxuXHRcdH0pO1xuXHRcdHRoaXMuX3Byb3ZpZGVycy5zZXQocHJvdmlkZXIuaWQsIHsgcHJvdmlkZXIsIGV4dGVuc2lvbiB9KTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBzb3VyY2VNYXAgb2YgdGhpcy5faXRlbXNCeVNvdXJjZUFuZFVyaU1hcC52YWx1ZXMoKSkge1xuXHRcdFx0XHRzb3VyY2VNYXAuZ2V0KHByb3ZpZGVyLmlkKT8uY2xlYXIoKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fcHJvdmlkZXJzLmRlbGV0ZShwcm92aWRlci5pZCk7XG5cdFx0XHR0aGlzLl9wcm94eS4kdW5yZWdpc3RlclRpbWVsaW5lUHJvdmlkZXIocHJvdmlkZXIuaWQpO1xuXHRcdFx0cHJvdmlkZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldFVyaUtleSh1cmk6IFVSSSB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB1cmk/LnRvU3RyaW5nKCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUF3QixXQUFXO0FBQ25DLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQXNFLG1CQUFtQjtBQUV6RixTQUFzQixjQUFjLHVCQUF1QjtBQUczRCxTQUFTLFdBQVcsa0JBQWtCLDBCQUEwQjtBQUNoRSxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDRCQUE0QjtBQU85QixNQUFNLG1CQUFtQixnQkFBa0Msa0JBQWtCO0FBRTdFLE1BQU0sZ0JBQTRDO0FBQUEsRUFTeEQsWUFDQyxhQUNBLFVBQ0M7QUFQRixTQUFRLGFBQWEsb0JBQUksSUFBNEU7QUFFckcsU0FBUSwwQkFBMEIsb0JBQUksSUFBdUU7QUFNNUcsU0FBSyxTQUFTLFlBQVksU0FBUyxZQUFZLGtCQUFrQjtBQUVqRSxhQUFTLDBCQUEwQjtBQUFBLE1BQ2xDLGlCQUFpQixDQUFDLEtBQUssY0FBYztBQUNwQyxZQUFJLE9BQU8sSUFBSSxTQUFTLGFBQWEsdUJBQXVCO0FBQzNELGNBQUksS0FBSyxXQUFXLElBQUksSUFBSSxNQUFNLEtBQUssYUFBYSxxQkFBcUIsV0FBVyxVQUFVLEdBQUc7QUFDaEcsa0JBQU0sTUFBTSxJQUFJLFFBQVEsU0FBWSxTQUFZLElBQUksT0FBTyxJQUFJLEdBQUc7QUFDbEUsbUJBQU8sS0FBSyx3QkFBd0IsSUFBSSxJQUFJLE1BQU0sR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxJQUFJLE1BQU07QUFBQSxVQUN6RixPQUFPO0FBQ04sbUJBQU87QUFBQSxVQUNSO0FBQUEsUUFDRDtBQUNBLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFD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
