import * as extHostProtocol from "./extHost.protocol.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
class ExtHostChatStatus {
  constructor(mainContext) {
    this._items = /* @__PURE__ */ new Map();
    this._proxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadChatStatus);
  }
  createChatStatusItem(extension, id) {
    const internalId = asChatItemIdentifier(extension.identifier, id);
    if (this._items.has(internalId)) {
      throw new Error(`Chat status item '${id}' already exists`);
    }
    const state = {
      id: internalId,
      title: "",
      description: "",
      detail: "",
      tooltip: void 0
    };
    let disposed = false;
    let visible = false;
    const syncState = () => {
      if (disposed) {
        throw new Error("Chat status item is disposed");
      }
      if (!visible) {
        return;
      }
      this._proxy.$setEntry(id, state);
    };
    const item = Object.freeze({
      id,
      get title() {
        return state.title;
      },
      set title(value) {
        state.title = value;
        syncState();
      },
      get description() {
        return state.description;
      },
      set description(value) {
        state.description = value;
        syncState();
      },
      get detail() {
        return state.detail;
      },
      set detail(value) {
        state.detail = value;
        syncState();
      },
      get tooltip() {
        return state.tooltip;
      },
      set tooltip(value) {
        state.tooltip = value;
        syncState();
      },
      show: () => {
        visible = true;
        syncState();
      },
      hide: () => {
        visible = false;
        this._proxy.$disposeEntry(id);
      },
      dispose: () => {
        disposed = true;
        this._proxy.$disposeEntry(id);
        this._items.delete(internalId);
      }
    });
    this._items.set(internalId, item);
    return item;
  }
}
function asChatItemIdentifier(extension, id) {
  return `${ExtensionIdentifier.toKey(extension)}.${id}`;
}
export {
  ExtHostChatStatus
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0Q2hhdFN0YXR1cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgKiBhcyBleHRIb3N0UHJvdG9jb2wgZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIsIElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuXG5leHBvcnQgY2xhc3MgRXh0SG9zdENoYXRTdGF0dXMge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBleHRIb3N0UHJvdG9jb2wuTWFpblRocmVhZENoYXRTdGF0dXNTaGFwZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pdGVtcyA9IG5ldyBNYXA8c3RyaW5nLCB2c2NvZGUuQ2hhdFN0YXR1c0l0ZW0+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bWFpbkNvbnRleHQ6IGV4dEhvc3RQcm90b2NvbC5JTWFpbkNvbnRleHRcblx0KSB7XG5cdFx0dGhpcy5fcHJveHkgPSBtYWluQ29udGV4dC5nZXRQcm94eShleHRIb3N0UHJvdG9jb2wuTWFpbkNvbnRleHQuTWFpblRocmVhZENoYXRTdGF0dXMpO1xuXHR9XG5cblx0Y3JlYXRlQ2hhdFN0YXR1c0l0ZW0oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGlkOiBzdHJpbmcpOiB2c2NvZGUuQ2hhdFN0YXR1c0l0ZW0ge1xuXHRcdGNvbnN0IGludGVybmFsSWQgPSBhc0NoYXRJdGVtSWRlbnRpZmllcihleHRlbnNpb24uaWRlbnRpZmllciwgaWQpO1xuXHRcdGlmICh0aGlzLl9pdGVtcy5oYXMoaW50ZXJuYWxJZCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2hhdCBzdGF0dXMgaXRlbSAnJHtpZH0nIGFscmVhZHkgZXhpc3RzYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhdGU6IGV4dEhvc3RQcm90b2NvbC5DaGF0U3RhdHVzSXRlbUR0byA9IHtcblx0XHRcdGlkOiBpbnRlcm5hbElkLFxuXHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdFx0ZGV0YWlsOiAnJyxcblx0XHRcdHRvb2x0aXA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXG5cdFx0bGV0IGRpc3Bvc2VkID0gZmFsc2U7XG5cdFx0bGV0IHZpc2libGUgPSBmYWxzZTtcblx0XHRjb25zdCBzeW5jU3RhdGUgPSAoKSA9PiB7XG5cdFx0XHRpZiAoZGlzcG9zZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDaGF0IHN0YXR1cyBpdGVtIGlzIGRpc3Bvc2VkJyk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdmlzaWJsZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3Byb3h5LiRzZXRFbnRyeShpZCwgc3RhdGUpO1xuXHRcdH07XG5cblx0XHRjb25zdCBpdGVtID0gT2JqZWN0LmZyZWV6ZTx2c2NvZGUuQ2hhdFN0YXR1c0l0ZW0+KHtcblx0XHRcdGlkOiBpZCxcblxuXHRcdFx0Z2V0IHRpdGxlKCk6IHN0cmluZyB8IHsgbGFiZWw6IHN0cmluZzsgbGluazogc3RyaW5nOyBoZWxwVGV4dD86IHN0cmluZyB9IHtcblx0XHRcdFx0cmV0dXJuIHN0YXRlLnRpdGxlO1xuXHRcdFx0fSxcblx0XHRcdHNldCB0aXRsZSh2YWx1ZTogc3RyaW5nIHwgeyBsYWJlbDogc3RyaW5nOyBsaW5rOiBzdHJpbmc7IGhlbHBUZXh0Pzogc3RyaW5nIH0pIHtcblx0XHRcdFx0c3RhdGUudGl0bGUgPSB2YWx1ZTtcblx0XHRcdFx0c3luY1N0YXRlKCk7XG5cdFx0XHR9LFxuXG5cdFx0XHRnZXQgZGVzY3JpcHRpb24oKTogc3RyaW5nIHtcblx0XHRcdFx0cmV0dXJuIHN0YXRlLmRlc2NyaXB0aW9uO1xuXHRcdFx0fSxcblx0XHRcdHNldCBkZXNjcmlwdGlvbih2YWx1ZTogc3RyaW5nKSB7XG5cdFx0XHRcdHN0YXRlLmRlc2NyaXB0aW9uID0gdmFsdWU7XG5cdFx0XHRcdHN5bmNTdGF0ZSgpO1xuXHRcdFx0fSxcblxuXHRcdFx0Z2V0IGRldGFpbCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGUuZGV0YWlsO1xuXHRcdFx0fSxcblx0XHRcdHNldCBkZXRhaWwodmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRzdGF0ZS5kZXRhaWwgPSB2YWx1ZTtcblx0XHRcdFx0c3luY1N0YXRlKCk7XG5cdFx0XHR9LFxuXG5cdFx0XHRnZXQgdG9vbHRpcCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGUudG9vbHRpcDtcblx0XHRcdH0sXG5cdFx0XHRzZXQgdG9vbHRpcCh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHN0YXRlLnRvb2x0aXAgPSB2YWx1ZTtcblx0XHRcdFx0c3luY1N0YXRlKCk7XG5cdFx0XHR9LFxuXG5cdFx0XHRzaG93OiAoKSA9PiB7XG5cdFx0XHRcdHZpc2libGUgPSB0cnVlO1xuXHRcdFx0XHRzeW5jU3RhdGUoKTtcblx0XHRcdH0sXG5cdFx0XHRoaWRlOiAoKSA9PiB7XG5cdFx0XHRcdHZpc2libGUgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5fcHJveHkuJGRpc3Bvc2VFbnRyeShpZCk7XG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRkaXNwb3NlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRkaXNwb3NlRW50cnkoaWQpO1xuXHRcdFx0XHR0aGlzLl9pdGVtcy5kZWxldGUoaW50ZXJuYWxJZCk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0dGhpcy5faXRlbXMuc2V0KGludGVybmFsSWQsIGl0ZW0pO1xuXHRcdHJldHVybiBpdGVtO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGFzQ2hhdEl0ZW1JZGVudGlmaWVyKGV4dGVuc2lvbjogRXh0ZW5zaW9uSWRlbnRpZmllciwgaWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBgJHtFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KGV4dGVuc2lvbil9LiR7aWR9YDtcbn1cblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsWUFBWSxxQkFBcUI7QUFDakMsU0FBUywyQkFBa0Q7QUFFcEQsTUFBTSxrQkFBa0I7QUFBQSxFQU05QixZQUNDLGFBQ0M7QUFKRixTQUFpQixTQUFTLG9CQUFJLElBQW1DO0FBS2hFLFNBQUssU0FBUyxZQUFZLFNBQVMsZ0JBQWdCLFlBQVksb0JBQW9CO0FBQUEsRUFDcEY7QUFBQSxFQUVBLHFCQUFxQixXQUFrQyxJQUFtQztBQUN6RixVQUFNLGFBQWEscUJBQXFCLFVBQVUsWUFBWSxFQUFFO0FBQ2hFLFFBQUksS0FBSyxPQUFPLElBQUksVUFBVSxHQUFHO0FBQ2hDLFlBQU0sSUFBSSxNQUFNLHFCQUFxQixFQUFFLGtCQUFrQjtBQUFBLElBQzFEO0FBRUEsVUFBTSxRQUEyQztBQUFBLE1BQ2hELElBQUk7QUFBQSxNQUNKLE9BQU87QUFBQSxNQUNQLGFBQWE7QUFBQSxNQUNiLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxJQUNWO0FBRUEsUUFBSSxXQUFXO0FBQ2YsUUFBSSxVQUFVO0FBQ2QsVUFBTSxZQUFZLE1BQU07QUFDdkIsVUFBSSxVQUFVO0FBQ2IsY0FBTSxJQUFJLE1BQU0sOEJBQThCO0FBQUEsTUFDL0M7QUFFQSxVQUFJLENBQUMsU0FBUztBQUNiO0FBQUEsTUFDRDtBQUVBLFdBQUssT0FBTyxVQUFVLElBQUksS0FBSztBQUFBLElBQ2hDO0FBRUEsVUFBTSxPQUFPLE9BQU8sT0FBOEI7QUFBQSxNQUNqRDtBQUFBLE1BRUEsSUFBSSxRQUFxRTtBQUN4RSxlQUFPLE1BQU07QUFBQSxNQUNkO0FBQUEsTUFDQSxJQUFJLE1BQU0sT0FBb0U7QUFDN0UsY0FBTSxRQUFRO0FBQ2Qsa0JBQVU7QUFBQSxNQUNYO0FBQUEsTUFFQSxJQUFJLGNBQXNCO0FBQ3pCLGVBQU8sTUFBTTtBQUFBLE1BQ2Q7QUFBQSxNQUNBLElBQUksWUFBWSxPQUFlO0FBQzlCLGNBQU0sY0FBYztBQUNwQixrQkFBVTtBQUFBLE1BQ1g7QUFBQSxNQUVBLElBQUksU0FBNkI7QUFDaEMsZUFBTyxNQUFNO0FBQUEsTUFDZDtBQUFBLE1BQ0EsSUFBSSxPQUFPLE9BQTJCO0FBQ3JDLGNBQU0sU0FBUztBQUNmLGtCQUFVO0FBQUEsTUFDWDtBQUFBLE1BRUEsSUFBSSxVQUE4QjtBQUNqQyxlQUFPLE1BQU07QUFBQSxNQUNkO0FBQUEsTUFDQSxJQUFJLFFBQVEsT0FBMkI7QUFDdEMsY0FBTSxVQUFVO0FBQ2hCLGtCQUFVO0FBQUEsTUFDWDtBQUFBLE1BRUEsTUFBTSxNQUFNO0FBQ1gsa0JBQVU7QUFDVixrQkFBVTtBQUFBLE1BQ1g7QUFBQSxNQUNBLE1BQU0sTUFBTTtBQUNYLGtCQUFVO0FBQ1YsYUFBSyxPQUFPLGNBQWMsRUFBRTtBQUFBLE1BQzdCO0FBQUEsTUFDQSxTQUFTLE1BQU07QUFDZCxtQkFBVztBQUNYLGFBQUssT0FBTyxjQUFjLEVBQUU7QUFDNUIsYUFBSyxPQUFPLE9BQU8sVUFBVTtBQUFBLE1BQzlCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxPQUFPLElBQUksWUFBWSxJQUFJO0FBQ2hDLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFFQSxTQUFTLHFCQUFxQixXQUFnQyxJQUFvQjtBQUNqRixTQUFPLEdBQUcsb0JBQW9CLE1BQU0sU0FBUyxDQUFDLElBQUksRUFBRTtBQUNyRDsiLAogICJuYW1lcyI6IFtdCn0K
