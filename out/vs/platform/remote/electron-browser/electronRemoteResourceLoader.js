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
import { VSBuffer, encodeBase64 } from "../../../base/common/buffer.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { getMediaOrTextMime } from "../../../base/common/mime.js";
import { Schemas } from "../../../base/common/network.js";
import { URI } from "../../../base/common/uri.js";
import { FileOperationError, FileOperationResult, IFileService } from "../../files/common/files.js";
import { IMainProcessService } from "../../ipc/common/mainProcessService.js";
import { NODE_REMOTE_RESOURCE_CHANNEL_NAME, NODE_REMOTE_RESOURCE_IPC_METHOD_NAME } from "../common/electronRemoteResources.js";
let ElectronRemoteResourceLoader = class extends Disposable {
  constructor(windowId, mainProcessService, fileService) {
    super();
    this.windowId = windowId;
    this.fileService = fileService;
    const channel = {
      listen(_, event) {
        throw new Error(`Event not found: ${event}`);
      },
      call: (_, command, arg) => {
        switch (command) {
          case NODE_REMOTE_RESOURCE_IPC_METHOD_NAME:
            return this.doRequest(URI.revive(arg[0]));
        }
        throw new Error(`Call not found: ${command}`);
      }
    };
    mainProcessService.registerChannel(NODE_REMOTE_RESOURCE_CHANNEL_NAME, channel);
  }
  async doRequest(uri) {
    let content;
    try {
      const params = new URLSearchParams(uri.query);
      const actual = uri.with({
        scheme: params.get("scheme"),
        authority: params.get("authority"),
        query: ""
      });
      content = await this.fileService.readFile(actual);
    } catch (e) {
      const str = encodeBase64(VSBuffer.fromString(e.message));
      if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
        return { statusCode: 404, body: str };
      } else {
        return { statusCode: 500, body: str };
      }
    }
    const mimeType = uri.path && getMediaOrTextMime(uri.path);
    return { statusCode: 200, body: encodeBase64(content.value), mimeType };
  }
  getResourceUriProvider() {
    return (uri) => uri.with({
      scheme: Schemas.vscodeManagedRemoteResource,
      authority: `window:${this.windowId}`,
      query: new URLSearchParams({ authority: uri.authority, scheme: uri.scheme }).toString()
    });
  }
};
ElectronRemoteResourceLoader = __decorateClass([
  __decorateParam(1, IMainProcessService),
  __decorateParam(2, IFileService)
], ElectronRemoteResourceLoader);
export {
  ElectronRemoteResourceLoader
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccmVtb3RlXFxlbGVjdHJvbi1icm93c2VyXFxlbGVjdHJvblJlbW90ZVJlc291cmNlTG9hZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVlNCdWZmZXIsIGVuY29kZUJhc2U2NCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZ2V0TWVkaWFPclRleHRNaW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWltZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVNlcnZlckNoYW5uZWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVDb250ZW50LCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSU1haW5Qcm9jZXNzU2VydmljZSB9IGZyb20gJy4uLy4uL2lwYy9jb21tb24vbWFpblByb2Nlc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5PREVfUkVNT1RFX1JFU09VUkNFX0NIQU5ORUxfTkFNRSwgTk9ERV9SRU1PVEVfUkVTT1VSQ0VfSVBDX01FVEhPRF9OQU1FLCBOb2RlUmVtb3RlUmVzb3VyY2VSZXNwb25zZSB9IGZyb20gJy4uL2NvbW1vbi9lbGVjdHJvblJlbW90ZVJlc291cmNlcy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFbGVjdHJvblJlbW90ZVJlc291cmNlTG9hZGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgd2luZG93SWQ6IG51bWJlcixcblx0XHRASU1haW5Qcm9jZXNzU2VydmljZSBtYWluUHJvY2Vzc1NlcnZpY2U6IElNYWluUHJvY2Vzc1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBjaGFubmVsOiBJU2VydmVyQ2hhbm5lbCA9IHtcblx0XHRcdGxpc3RlbjxUPihfOiB1bmtub3duLCBldmVudDogc3RyaW5nKTogRXZlbnQ8VD4ge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEV2ZW50IG5vdCBmb3VuZDogJHtldmVudH1gKTtcblx0XHRcdH0sXG5cblx0XHRcdGNhbGw6IChfOiB1bmtub3duLCBjb21tYW5kOiBzdHJpbmcsIGFyZz86IGFueSk6IFByb21pc2U8YW55PiA9PiB7XG5cdFx0XHRcdHN3aXRjaCAoY29tbWFuZCkge1xuXHRcdFx0XHRcdGNhc2UgTk9ERV9SRU1PVEVfUkVTT1VSQ0VfSVBDX01FVEhPRF9OQU1FOiByZXR1cm4gdGhpcy5kb1JlcXVlc3QoVVJJLnJldml2ZShhcmdbMF0pKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2FsbCBub3QgZm91bmQ6ICR7Y29tbWFuZH1gKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0bWFpblByb2Nlc3NTZXJ2aWNlLnJlZ2lzdGVyQ2hhbm5lbChOT0RFX1JFTU9URV9SRVNPVVJDRV9DSEFOTkVMX05BTUUsIGNoYW5uZWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1JlcXVlc3QodXJpOiBVUkkpOiBQcm9taXNlPE5vZGVSZW1vdGVSZXNvdXJjZVJlc3BvbnNlPiB7XG5cdFx0bGV0IGNvbnRlbnQ6IElGaWxlQ29udGVudDtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh1cmkucXVlcnkpO1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gdXJpLndpdGgoe1xuXHRcdFx0XHRzY2hlbWU6IHBhcmFtcy5nZXQoJ3NjaGVtZScpISxcblx0XHRcdFx0YXV0aG9yaXR5OiBwYXJhbXMuZ2V0KCdhdXRob3JpdHknKSEsXG5cdFx0XHRcdHF1ZXJ5OiAnJyxcblx0XHRcdH0pO1xuXHRcdFx0Y29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUoYWN0dWFsKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zdCBzdHIgPSBlbmNvZGVCYXNlNjQoVlNCdWZmZXIuZnJvbVN0cmluZyhlLm1lc3NhZ2UpKTtcblx0XHRcdGlmIChlIGluc3RhbmNlb2YgRmlsZU9wZXJhdGlvbkVycm9yICYmIGUuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHRyZXR1cm4geyBzdGF0dXNDb2RlOiA0MDQsIGJvZHk6IHN0ciB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHsgc3RhdHVzQ29kZTogNTAwLCBib2R5OiBzdHIgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBtaW1lVHlwZSA9IHVyaS5wYXRoICYmIGdldE1lZGlhT3JUZXh0TWltZSh1cmkucGF0aCk7XG5cdFx0cmV0dXJuIHsgc3RhdHVzQ29kZTogMjAwLCBib2R5OiBlbmNvZGVCYXNlNjQoY29udGVudC52YWx1ZSksIG1pbWVUeXBlIH07XG5cdH1cblxuXHRwdWJsaWMgZ2V0UmVzb3VyY2VVcmlQcm92aWRlcigpIHtcblx0XHRyZXR1cm4gKHVyaTogVVJJKSA9PiB1cmkud2l0aCh7XG5cdFx0XHRzY2hlbWU6IFNjaGVtYXMudnNjb2RlTWFuYWdlZFJlbW90ZVJlc291cmNlLFxuXHRcdFx0YXV0aG9yaXR5OiBgd2luZG93OiR7dGhpcy53aW5kb3dJZH1gLFxuXHRcdFx0cXVlcnk6IG5ldyBVUkxTZWFyY2hQYXJhbXMoeyBhdXRob3JpdHk6IHVyaS5hdXRob3JpdHksIHNjaGVtZTogdXJpLnNjaGVtZSB9KS50b1N0cmluZygpLFxuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsVUFBVSxvQkFBb0I7QUFFdkMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUVwQixTQUFTLG9CQUFvQixxQkFBbUMsb0JBQW9CO0FBQ3BGLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUNBQW1DLDRDQUF3RTtBQUU3RyxJQUFNLCtCQUFOLGNBQTJDLFdBQVc7QUFBQSxFQUM1RCxZQUNrQixVQUNJLG9CQUNVLGFBQzlCO0FBQ0QsVUFBTTtBQUpXO0FBRWM7QUFJL0IsVUFBTSxVQUEwQjtBQUFBLE1BQy9CLE9BQVUsR0FBWSxPQUF5QjtBQUM5QyxjQUFNLElBQUksTUFBTSxvQkFBb0IsS0FBSyxFQUFFO0FBQUEsTUFDNUM7QUFBQSxNQUVBLE1BQU0sQ0FBQyxHQUFZLFNBQWlCLFFBQTRCO0FBQy9ELGdCQUFRLFNBQVM7QUFBQSxVQUNoQixLQUFLO0FBQXNDLG1CQUFPLEtBQUssVUFBVSxJQUFJLE9BQU8sSUFBSSxDQUFDLENBQUMsQ0FBQztBQUFBLFFBQ3BGO0FBRUEsY0FBTSxJQUFJLE1BQU0sbUJBQW1CLE9BQU8sRUFBRTtBQUFBLE1BQzdDO0FBQUEsSUFDRDtBQUVBLHVCQUFtQixnQkFBZ0IsbUNBQW1DLE9BQU87QUFBQSxFQUM5RTtBQUFBLEVBRUEsTUFBYyxVQUFVLEtBQStDO0FBQ3RFLFFBQUk7QUFDSixRQUFJO0FBQ0gsWUFBTSxTQUFTLElBQUksZ0JBQWdCLElBQUksS0FBSztBQUM1QyxZQUFNLFNBQVMsSUFBSSxLQUFLO0FBQUEsUUFDdkIsUUFBUSxPQUFPLElBQUksUUFBUTtBQUFBLFFBQzNCLFdBQVcsT0FBTyxJQUFJLFdBQVc7QUFBQSxRQUNqQyxPQUFPO0FBQUEsTUFDUixDQUFDO0FBQ0QsZ0JBQVUsTUFBTSxLQUFLLFlBQVksU0FBUyxNQUFNO0FBQUEsSUFDakQsU0FBUyxHQUFHO0FBQ1gsWUFBTSxNQUFNLGFBQWEsU0FBUyxXQUFXLEVBQUUsT0FBTyxDQUFDO0FBQ3ZELFVBQUksYUFBYSxzQkFBc0IsRUFBRSx3QkFBd0Isb0JBQW9CLGdCQUFnQjtBQUNwRyxlQUFPLEVBQUUsWUFBWSxLQUFLLE1BQU0sSUFBSTtBQUFBLE1BQ3JDLE9BQU87QUFDTixlQUFPLEVBQUUsWUFBWSxLQUFLLE1BQU0sSUFBSTtBQUFBLE1BQ3JDO0FBQUEsSUFDRDtBQUVBLFVBQU0sV0FBVyxJQUFJLFFBQVEsbUJBQW1CLElBQUksSUFBSTtBQUN4RCxXQUFPLEVBQUUsWUFBWSxLQUFLLE1BQU0sYUFBYSxRQUFRLEtBQUssR0FBRyxTQUFTO0FBQUEsRUFDdkU7QUFBQSxFQUVPLHlCQUF5QjtBQUMvQixXQUFPLENBQUMsUUFBYSxJQUFJLEtBQUs7QUFBQSxNQUM3QixRQUFRLFFBQVE7QUFBQSxNQUNoQixXQUFXLFVBQVUsS0FBSyxRQUFRO0FBQUEsTUFDbEMsT0FBTyxJQUFJLGdCQUFnQixFQUFFLFdBQVcsSUFBSSxXQUFXLFFBQVEsSUFBSSxPQUFPLENBQUMsRUFBRSxTQUFTO0FBQUEsSUFDdkYsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQXZEYSwrQkFBTjtBQUFBLEVBR0o7QUFBQSxFQUNBO0FBQUEsR0FKVTsiLAogICJuYW1lcyI6IFtdCn0K
