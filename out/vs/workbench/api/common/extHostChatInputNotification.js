import * as extHostProtocol from "./extHost.protocol.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
class ExtHostChatInputNotification {
  constructor(mainContext) {
    this._items = /* @__PURE__ */ new Map();
    this._proxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadChatInputNotification);
  }
  createInputNotification(extension, id) {
    const internalId = asNotificationIdentifier(extension.identifier, id);
    if (this._items.has(internalId)) {
      throw new Error(`Chat input notification '${id}' already exists`);
    }
    const state = {
      id: internalId,
      severity: extHostProtocol.ChatInputNotificationSeverityDto.Info,
      message: "",
      description: void 0,
      actions: [],
      dismissible: true,
      autoDismissOnMessage: false,
      sessionTypes: void 0
    };
    let disposed = false;
    let visible = false;
    const syncState = () => {
      if (disposed) {
        throw new Error("Chat input notification is disposed");
      }
      if (!visible) {
        return;
      }
      this._proxy.$setNotification({ ...state });
    };
    const item = Object.freeze({
      id,
      get severity() {
        return state.severity;
      },
      set severity(value) {
        state.severity = value;
        syncState();
      },
      get message() {
        return state.message;
      },
      set message(value) {
        state.message = value;
        syncState();
      },
      get description() {
        return state.description;
      },
      set description(value) {
        state.description = value;
        syncState();
      },
      get actions() {
        return state.actions;
      },
      set actions(value) {
        state.actions = value.map((a) => ({ label: a.label, commandId: a.commandId, commandArgs: a.commandArgs }));
        syncState();
      },
      get dismissible() {
        return state.dismissible;
      },
      set dismissible(value) {
        state.dismissible = value;
        syncState();
      },
      get autoDismissOnMessage() {
        return state.autoDismissOnMessage;
      },
      set autoDismissOnMessage(value) {
        state.autoDismissOnMessage = value;
        syncState();
      },
      get sessionTypes() {
        return state.sessionTypes;
      },
      set sessionTypes(value) {
        state.sessionTypes = value;
        syncState();
      },
      show: () => {
        visible = true;
        syncState();
      },
      hide: () => {
        if (disposed) {
          return;
        }
        visible = false;
        this._proxy.$disposeNotification(internalId);
      },
      dispose: () => {
        if (disposed) {
          return;
        }
        disposed = true;
        visible = false;
        this._proxy.$disposeNotification(internalId);
        this._items.delete(internalId);
      }
    });
    this._items.set(internalId, item);
    return item;
  }
}
function asNotificationIdentifier(extension, id) {
  return `${ExtensionIdentifier.toKey(extension)}.${id}`;
}
export {
  ExtHostChatInputNotification
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0Q2hhdElucHV0Tm90aWZpY2F0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCAqIGFzIGV4dEhvc3RQcm90b2NvbCBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciwgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0Q2hhdElucHV0Tm90aWZpY2F0aW9uIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogZXh0SG9zdFByb3RvY29sLk1haW5UaHJlYWRDaGF0SW5wdXROb3RpZmljYXRpb25TaGFwZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pdGVtcyA9IG5ldyBNYXA8c3RyaW5nLCB2c2NvZGUuQ2hhdElucHV0Tm90aWZpY2F0aW9uPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1haW5Db250ZXh0OiBleHRIb3N0UHJvdG9jb2wuSU1haW5Db250ZXh0XG5cdCkge1xuXHRcdHRoaXMuX3Byb3h5ID0gbWFpbkNvbnRleHQuZ2V0UHJveHkoZXh0SG9zdFByb3RvY29sLk1haW5Db250ZXh0Lk1haW5UaHJlYWRDaGF0SW5wdXROb3RpZmljYXRpb24pO1xuXHR9XG5cblx0Y3JlYXRlSW5wdXROb3RpZmljYXRpb24oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGlkOiBzdHJpbmcpOiB2c2NvZGUuQ2hhdElucHV0Tm90aWZpY2F0aW9uIHtcblx0XHRjb25zdCBpbnRlcm5hbElkID0gYXNOb3RpZmljYXRpb25JZGVudGlmaWVyKGV4dGVuc2lvbi5pZGVudGlmaWVyLCBpZCk7XG5cdFx0aWYgKHRoaXMuX2l0ZW1zLmhhcyhpbnRlcm5hbElkKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDaGF0IGlucHV0IG5vdGlmaWNhdGlvbiAnJHtpZH0nIGFscmVhZHkgZXhpc3RzYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhdGU6IGV4dEhvc3RQcm90b2NvbC5DaGF0SW5wdXROb3RpZmljYXRpb25EdG8gPSB7XG5cdFx0XHRpZDogaW50ZXJuYWxJZCxcblx0XHRcdHNldmVyaXR5OiBleHRIb3N0UHJvdG9jb2wuQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHlEdG8uSW5mbyxcblx0XHRcdG1lc3NhZ2U6ICcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRcdGFjdGlvbnM6IFtdLFxuXHRcdFx0ZGlzbWlzc2libGU6IHRydWUsXG5cdFx0XHRhdXRvRGlzbWlzc09uTWVzc2FnZTogZmFsc2UsXG5cdFx0XHRzZXNzaW9uVHlwZXM6IHVuZGVmaW5lZCxcblx0XHR9O1xuXG5cdFx0bGV0IGRpc3Bvc2VkID0gZmFsc2U7XG5cdFx0bGV0IHZpc2libGUgPSBmYWxzZTtcblx0XHRjb25zdCBzeW5jU3RhdGUgPSAoKSA9PiB7XG5cdFx0XHRpZiAoZGlzcG9zZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDaGF0IGlucHV0IG5vdGlmaWNhdGlvbiBpcyBkaXNwb3NlZCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXZpc2libGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9wcm94eS4kc2V0Tm90aWZpY2F0aW9uKHsgLi4uc3RhdGUgfSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGl0ZW0gPSBPYmplY3QuZnJlZXplPHZzY29kZS5DaGF0SW5wdXROb3RpZmljYXRpb24+KHtcblx0XHRcdGlkLFxuXG5cdFx0XHRnZXQgc2V2ZXJpdHkoKTogdnNjb2RlLkNoYXRJbnB1dE5vdGlmaWNhdGlvblNldmVyaXR5IHtcblx0XHRcdFx0cmV0dXJuIHN0YXRlLnNldmVyaXR5IGFzIG51bWJlciBhcyB2c2NvZGUuQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHk7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IHNldmVyaXR5KHZhbHVlOiB2c2NvZGUuQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHkpIHtcblx0XHRcdFx0c3RhdGUuc2V2ZXJpdHkgPSB2YWx1ZSBhcyBudW1iZXIgYXMgZXh0SG9zdFByb3RvY29sLkNoYXRJbnB1dE5vdGlmaWNhdGlvblNldmVyaXR5RHRvO1xuXHRcdFx0XHRzeW5jU3RhdGUoKTtcblx0XHRcdH0sXG5cblx0XHRcdGdldCBtZXNzYWdlKCk6IHN0cmluZyB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZS5tZXNzYWdlO1xuXHRcdFx0fSxcblx0XHRcdHNldCBtZXNzYWdlKHZhbHVlOiBzdHJpbmcpIHtcblx0XHRcdFx0c3RhdGUubWVzc2FnZSA9IHZhbHVlO1xuXHRcdFx0XHRzeW5jU3RhdGUoKTtcblx0XHRcdH0sXG5cblx0XHRcdGdldCBkZXNjcmlwdGlvbigpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGUuZGVzY3JpcHRpb247XG5cdFx0XHR9LFxuXHRcdFx0c2V0IGRlc2NyaXB0aW9uKHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRcdFx0c3RhdGUuZGVzY3JpcHRpb24gPSB2YWx1ZTtcblx0XHRcdFx0c3luY1N0YXRlKCk7XG5cdFx0XHR9LFxuXG5cdFx0XHRnZXQgYWN0aW9ucygpOiB2c2NvZGUuQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uW10ge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGUuYWN0aW9ucztcblx0XHRcdH0sXG5cdFx0XHRzZXQgYWN0aW9ucyh2YWx1ZTogdnNjb2RlLkNoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbltdKSB7XG5cdFx0XHRcdHN0YXRlLmFjdGlvbnMgPSB2YWx1ZS5tYXAoYSA9PiAoeyBsYWJlbDogYS5sYWJlbCwgY29tbWFuZElkOiBhLmNvbW1hbmRJZCwgY29tbWFuZEFyZ3M6IGEuY29tbWFuZEFyZ3MgfSkpO1xuXHRcdFx0XHRzeW5jU3RhdGUoKTtcblx0XHRcdH0sXG5cblx0XHRcdGdldCBkaXNtaXNzaWJsZSgpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIHN0YXRlLmRpc21pc3NpYmxlO1xuXHRcdFx0fSxcblx0XHRcdHNldCBkaXNtaXNzaWJsZSh2YWx1ZTogYm9vbGVhbikge1xuXHRcdFx0XHRzdGF0ZS5kaXNtaXNzaWJsZSA9IHZhbHVlO1xuXHRcdFx0XHRzeW5jU3RhdGUoKTtcblx0XHRcdH0sXG5cblx0XHRcdGdldCBhdXRvRGlzbWlzc09uTWVzc2FnZSgpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIHN0YXRlLmF1dG9EaXNtaXNzT25NZXNzYWdlO1xuXHRcdFx0fSxcblx0XHRcdHNldCBhdXRvRGlzbWlzc09uTWVzc2FnZSh2YWx1ZTogYm9vbGVhbikge1xuXHRcdFx0XHRzdGF0ZS5hdXRvRGlzbWlzc09uTWVzc2FnZSA9IHZhbHVlO1xuXHRcdFx0XHRzeW5jU3RhdGUoKTtcblx0XHRcdH0sXG5cblx0XHRcdGdldCBzZXNzaW9uVHlwZXMoKTogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGUuc2Vzc2lvblR5cGVzO1xuXHRcdFx0fSxcblx0XHRcdHNldCBzZXNzaW9uVHlwZXModmFsdWU6IHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHN0YXRlLnNlc3Npb25UeXBlcyA9IHZhbHVlO1xuXHRcdFx0XHRzeW5jU3RhdGUoKTtcblx0XHRcdH0sXG5cblx0XHRcdHNob3c6ICgpID0+IHtcblx0XHRcdFx0dmlzaWJsZSA9IHRydWU7XG5cdFx0XHRcdHN5bmNTdGF0ZSgpO1xuXHRcdFx0fSxcblx0XHRcdGhpZGU6ICgpID0+IHtcblx0XHRcdFx0aWYgKGRpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHZpc2libGUgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5fcHJveHkuJGRpc3Bvc2VOb3RpZmljYXRpb24oaW50ZXJuYWxJZCk7XG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRpZiAoZGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGlzcG9zZWQgPSB0cnVlO1xuXHRcdFx0XHR2aXNpYmxlID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRkaXNwb3NlTm90aWZpY2F0aW9uKGludGVybmFsSWQpO1xuXHRcdFx0XHR0aGlzLl9pdGVtcy5kZWxldGUoaW50ZXJuYWxJZCk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0dGhpcy5faXRlbXMuc2V0KGludGVybmFsSWQsIGl0ZW0pO1xuXHRcdHJldHVybiBpdGVtO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGFzTm90aWZpY2F0aW9uSWRlbnRpZmllcihleHRlbnNpb246IEV4dGVuc2lvbklkZW50aWZpZXIsIGlkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7RXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShleHRlbnNpb24pfS4ke2lkfWA7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxZQUFZLHFCQUFxQjtBQUNqQyxTQUFTLDJCQUFrRDtBQUVwRCxNQUFNLDZCQUE2QjtBQUFBLEVBTXpDLFlBQ0MsYUFDQztBQUpGLFNBQWlCLFNBQVMsb0JBQUksSUFBMEM7QUFLdkUsU0FBSyxTQUFTLFlBQVksU0FBUyxnQkFBZ0IsWUFBWSwrQkFBK0I7QUFBQSxFQUMvRjtBQUFBLEVBRUEsd0JBQXdCLFdBQWtDLElBQTBDO0FBQ25HLFVBQU0sYUFBYSx5QkFBeUIsVUFBVSxZQUFZLEVBQUU7QUFDcEUsUUFBSSxLQUFLLE9BQU8sSUFBSSxVQUFVLEdBQUc7QUFDaEMsWUFBTSxJQUFJLE1BQU0sNEJBQTRCLEVBQUUsa0JBQWtCO0FBQUEsSUFDakU7QUFFQSxVQUFNLFFBQWtEO0FBQUEsTUFDdkQsSUFBSTtBQUFBLE1BQ0osVUFBVSxnQkFBZ0IsaUNBQWlDO0FBQUEsTUFDM0QsU0FBUztBQUFBLE1BQ1QsYUFBYTtBQUFBLE1BQ2IsU0FBUyxDQUFDO0FBQUEsTUFDVixhQUFhO0FBQUEsTUFDYixzQkFBc0I7QUFBQSxNQUN0QixjQUFjO0FBQUEsSUFDZjtBQUVBLFFBQUksV0FBVztBQUNmLFFBQUksVUFBVTtBQUNkLFVBQU0sWUFBWSxNQUFNO0FBQ3ZCLFVBQUksVUFBVTtBQUNiLGNBQU0sSUFBSSxNQUFNLHFDQUFxQztBQUFBLE1BQ3REO0FBRUEsVUFBSSxDQUFDLFNBQVM7QUFDYjtBQUFBLE1BQ0Q7QUFFQSxXQUFLLE9BQU8saUJBQWlCLEVBQUUsR0FBRyxNQUFNLENBQUM7QUFBQSxJQUMxQztBQUVBLFVBQU0sT0FBTyxPQUFPLE9BQXFDO0FBQUEsTUFDeEQ7QUFBQSxNQUVBLElBQUksV0FBaUQ7QUFDcEQsZUFBTyxNQUFNO0FBQUEsTUFDZDtBQUFBLE1BQ0EsSUFBSSxTQUFTLE9BQTZDO0FBQ3pELGNBQU0sV0FBVztBQUNqQixrQkFBVTtBQUFBLE1BQ1g7QUFBQSxNQUVBLElBQUksVUFBa0I7QUFDckIsZUFBTyxNQUFNO0FBQUEsTUFDZDtBQUFBLE1BQ0EsSUFBSSxRQUFRLE9BQWU7QUFDMUIsY0FBTSxVQUFVO0FBQ2hCLGtCQUFVO0FBQUEsTUFDWDtBQUFBLE1BRUEsSUFBSSxjQUFrQztBQUNyQyxlQUFPLE1BQU07QUFBQSxNQUNkO0FBQUEsTUFDQSxJQUFJLFlBQVksT0FBMkI7QUFDMUMsY0FBTSxjQUFjO0FBQ3BCLGtCQUFVO0FBQUEsTUFDWDtBQUFBLE1BRUEsSUFBSSxVQUFnRDtBQUNuRCxlQUFPLE1BQU07QUFBQSxNQUNkO0FBQUEsTUFDQSxJQUFJLFFBQVEsT0FBNkM7QUFDeEQsY0FBTSxVQUFVLE1BQU0sSUFBSSxRQUFNLEVBQUUsT0FBTyxFQUFFLE9BQU8sV0FBVyxFQUFFLFdBQVcsYUFBYSxFQUFFLFlBQVksRUFBRTtBQUN2RyxrQkFBVTtBQUFBLE1BQ1g7QUFBQSxNQUVBLElBQUksY0FBdUI7QUFDMUIsZUFBTyxNQUFNO0FBQUEsTUFDZDtBQUFBLE1BQ0EsSUFBSSxZQUFZLE9BQWdCO0FBQy9CLGNBQU0sY0FBYztBQUNwQixrQkFBVTtBQUFBLE1BQ1g7QUFBQSxNQUVBLElBQUksdUJBQWdDO0FBQ25DLGVBQU8sTUFBTTtBQUFBLE1BQ2Q7QUFBQSxNQUNBLElBQUkscUJBQXFCLE9BQWdCO0FBQ3hDLGNBQU0sdUJBQXVCO0FBQzdCLGtCQUFVO0FBQUEsTUFDWDtBQUFBLE1BRUEsSUFBSSxlQUE4QztBQUNqRCxlQUFPLE1BQU07QUFBQSxNQUNkO0FBQUEsTUFDQSxJQUFJLGFBQWEsT0FBc0M7QUFDdEQsY0FBTSxlQUFlO0FBQ3JCLGtCQUFVO0FBQUEsTUFDWDtBQUFBLE1BRUEsTUFBTSxNQUFNO0FBQ1gsa0JBQVU7QUFDVixrQkFBVTtBQUFBLE1BQ1g7QUFBQSxNQUNBLE1BQU0sTUFBTTtBQUNYLFlBQUksVUFBVTtBQUNiO0FBQUEsUUFDRDtBQUNBLGtCQUFVO0FBQ1YsYUFBSyxPQUFPLHFCQUFxQixVQUFVO0FBQUEsTUFDNUM7QUFBQSxNQUNBLFNBQVMsTUFBTTtBQUNkLFlBQUksVUFBVTtBQUNiO0FBQUEsUUFDRDtBQUNBLG1CQUFXO0FBQ1gsa0JBQVU7QUFDVixhQUFLLE9BQU8scUJBQXFCLFVBQVU7QUFDM0MsYUFBSyxPQUFPLE9BQU8sVUFBVTtBQUFBLE1BQzlCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxPQUFPLElBQUksWUFBWSxJQUFJO0FBQ2hDLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFFQSxTQUFTLHlCQUF5QixXQUFnQyxJQUFvQjtBQUNyRixTQUFPLEdBQUcsb0JBQW9CLE1BQU0sU0FBUyxDQUFDLElBQUksRUFBRTtBQUNyRDsiLAogICJuYW1lcyI6IFtdCn0K
