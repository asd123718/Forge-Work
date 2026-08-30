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
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { getMediaOrTextMime } from "../../../../base/common/mime.js";
import { URI } from "../../../../base/common/uri.js";
import { FileOperationError, FileOperationResult, IFileService } from "../../../../platform/files/common/files.js";
let BrowserRemoteResourceLoader = class extends Disposable {
  constructor(fileService, provider) {
    super();
    this.provider = provider;
    this._register(provider.onDidReceiveRequest(async (request) => {
      let uri;
      try {
        uri = JSON.parse(decodeURIComponent(request.uri.query));
      } catch {
        return request.respondWith(404, new Uint8Array(), {});
      }
      let content;
      try {
        content = await fileService.readFile(URI.from(uri, true));
      } catch (e) {
        const str = VSBuffer.fromString(e.message).buffer;
        if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
          return request.respondWith(404, str, {});
        } else {
          return request.respondWith(500, str, {});
        }
      }
      const mime = uri.path && getMediaOrTextMime(uri.path);
      request.respondWith(200, content.value.buffer, mime ? { "content-type": mime } : {});
    }));
  }
  getResourceUriProvider() {
    const baseUri = URI.parse(document.location.href);
    return (uri) => baseUri.with({
      path: this.provider.path,
      query: JSON.stringify(uri)
    });
  }
};
BrowserRemoteResourceLoader = __decorateClass([
  __decorateParam(0, IFileService)
], BrowserRemoteResourceLoader);
export {
  BrowserRemoteResourceLoader
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxyZW1vdGVcXGJyb3dzZXJcXGJyb3dzZXJSZW1vdGVSZXNvdXJjZUhhbmRsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGdldE1lZGlhT3JUZXh0TWltZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21pbWUuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVDb250ZW50LCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVJlbW90ZVJlc291cmNlUHJvdmlkZXIsIElSZXNvdXJjZVVyaVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci93ZWIuYXBpLmpzJztcblxuZXhwb3J0IGNsYXNzIEJyb3dzZXJSZW1vdGVSZXNvdXJjZUxvYWRlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwcm92aWRlcjogSVJlbW90ZVJlc291cmNlUHJvdmlkZXIsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihwcm92aWRlci5vbkRpZFJlY2VpdmVSZXF1ZXN0KGFzeW5jIHJlcXVlc3QgPT4ge1xuXHRcdFx0bGV0IHVyaTogVXJpQ29tcG9uZW50cztcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHVyaSA9IEpTT04ucGFyc2UoZGVjb2RlVVJJQ29tcG9uZW50KHJlcXVlc3QudXJpLnF1ZXJ5KSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0cmV0dXJuIHJlcXVlc3QucmVzcG9uZFdpdGgoNDA0LCBuZXcgVWludDhBcnJheSgpLCB7fSk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBjb250ZW50OiBJRmlsZUNvbnRlbnQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb250ZW50ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmZyb20odXJpLCB0cnVlKSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGNvbnN0IHN0ciA9IFZTQnVmZmVyLmZyb21TdHJpbmcoZS5tZXNzYWdlKS5idWZmZXI7XG5cdFx0XHRcdGlmIChlIGluc3RhbmNlb2YgRmlsZU9wZXJhdGlvbkVycm9yICYmIGUuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHRcdHJldHVybiByZXF1ZXN0LnJlc3BvbmRXaXRoKDQwNCwgc3RyLCB7fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlcXVlc3QucmVzcG9uZFdpdGgoNTAwLCBzdHIsIHt9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtaW1lID0gdXJpLnBhdGggJiYgZ2V0TWVkaWFPclRleHRNaW1lKHVyaS5wYXRoKTtcblx0XHRcdHJlcXVlc3QucmVzcG9uZFdpdGgoMjAwLCBjb250ZW50LnZhbHVlLmJ1ZmZlciwgbWltZSA/IHsgJ2NvbnRlbnQtdHlwZSc6IG1pbWUgfSA6IHt9KTtcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UmVzb3VyY2VVcmlQcm92aWRlcigpOiBJUmVzb3VyY2VVcmlQcm92aWRlciB7XG5cdFx0Y29uc3QgYmFzZVVyaSA9IFVSSS5wYXJzZShkb2N1bWVudC5sb2NhdGlvbi5ocmVmKTtcblx0XHRyZXR1cm4gdXJpID0+IGJhc2VVcmkud2l0aCh7XG5cdFx0XHRwYXRoOiB0aGlzLnByb3ZpZGVyLnBhdGgsXG5cdFx0XHRxdWVyeTogSlNPTi5zdHJpbmdpZnkodXJpKSxcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLFdBQTBCO0FBQ25DLFNBQVMsb0JBQW9CLHFCQUFtQyxvQkFBb0I7QUFHN0UsSUFBTSw4QkFBTixjQUEwQyxXQUFXO0FBQUEsRUFDM0QsWUFDZSxhQUNHLFVBQ2hCO0FBQ0QsVUFBTTtBQUZXO0FBSWpCLFNBQUssVUFBVSxTQUFTLG9CQUFvQixPQUFNLFlBQVc7QUFDNUQsVUFBSTtBQUNKLFVBQUk7QUFDSCxjQUFNLEtBQUssTUFBTSxtQkFBbUIsUUFBUSxJQUFJLEtBQUssQ0FBQztBQUFBLE1BQ3ZELFFBQVE7QUFDUCxlQUFPLFFBQVEsWUFBWSxLQUFLLElBQUksV0FBVyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ3JEO0FBRUEsVUFBSTtBQUNKLFVBQUk7QUFDSCxrQkFBVSxNQUFNLFlBQVksU0FBUyxJQUFJLEtBQUssS0FBSyxJQUFJLENBQUM7QUFBQSxNQUN6RCxTQUFTLEdBQUc7QUFDWCxjQUFNLE1BQU0sU0FBUyxXQUFXLEVBQUUsT0FBTyxFQUFFO0FBQzNDLFlBQUksYUFBYSxzQkFBc0IsRUFBRSx3QkFBd0Isb0JBQW9CLGdCQUFnQjtBQUNwRyxpQkFBTyxRQUFRLFlBQVksS0FBSyxLQUFLLENBQUMsQ0FBQztBQUFBLFFBQ3hDLE9BQU87QUFDTixpQkFBTyxRQUFRLFlBQVksS0FBSyxLQUFLLENBQUMsQ0FBQztBQUFBLFFBQ3hDO0FBQUEsTUFDRDtBQUVBLFlBQU0sT0FBTyxJQUFJLFFBQVEsbUJBQW1CLElBQUksSUFBSTtBQUNwRCxjQUFRLFlBQVksS0FBSyxRQUFRLE1BQU0sUUFBUSxPQUFPLEVBQUUsZ0JBQWdCLEtBQUssSUFBSSxDQUFDLENBQUM7QUFBQSxJQUNwRixDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFTyx5QkFBK0M7QUFDckQsVUFBTSxVQUFVLElBQUksTUFBTSxTQUFTLFNBQVMsSUFBSTtBQUNoRCxXQUFPLFNBQU8sUUFBUSxLQUFLO0FBQUEsTUFDMUIsTUFBTSxLQUFLLFNBQVM7QUFBQSxNQUNwQixPQUFPLEtBQUssVUFBVSxHQUFHO0FBQUEsSUFDMUIsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQXZDYSw4QkFBTjtBQUFBLEVBRUo7QUFBQSxHQUZVOyIsCiAgIm5hbWVzIjogW10KfQo=
