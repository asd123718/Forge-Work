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
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { URI } from "../../../../../base/common/uri.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { ITerminalLogService } from "../../../../../platform/terminal/common/terminal.js";
import { IEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { MAX_OUTPUT_LENGTH, truncateLargeOutput } from "./outputHelpers.js";
let LargeOutputFileWriter = class extends Disposable {
  constructor(_fileService, _logService, _environmentService) {
    super();
    this._fileService = _fileService;
    this._logService = _logService;
    this._environmentService = _environmentService;
    this._tempFiles = /* @__PURE__ */ new Set();
  }
  /**
   * If the output exceeds MAX_OUTPUT_LENGTH, writes it to a temp file and
   * returns a truncated message with the file path. Otherwise returns the
   * output unchanged.
   */
  async processOutput(output) {
    if (output.length <= MAX_OUTPUT_LENGTH) {
      return output;
    }
    const filePath = await this._writeToTempFile(output);
    if (!filePath) {
      return truncateLargeOutput(output);
    }
    return truncateLargeOutput(output, filePath);
  }
  async _writeToTempFile(output) {
    try {
      const fileName = `copilot-terminal-output-${generateUuid()}.txt`;
      const dirUri = URI.joinPath(this._environmentService.cacheHome, "copilot-terminal-output");
      const fileUri = URI.joinPath(dirUri, fileName);
      const fileContent = this._prettyPrintIfJson(output);
      await this._fileService.writeFile(fileUri, VSBuffer.fromString(fileContent));
      this._tempFiles.add(fileUri);
      this._logService.debug(`LargeOutputFileWriter: wrote ${Math.ceil(output.length / 1024)}KB to ${fileUri.fsPath}`);
      return fileUri.fsPath;
    } catch (e) {
      this._logService.debug(`LargeOutputFileWriter: failed to write temp file: ${e}`);
      return void 0;
    }
  }
  _prettyPrintIfJson(output) {
    const trimmed = output.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return output;
    }
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return output;
    }
  }
  /**
   * Cleans up all tracked temp files. Called on session end.
   */
  cleanup() {
    for (const fileUri of this._tempFiles) {
      this._fileService.del(fileUri).catch(() => {
      });
    }
    this._tempFiles.clear();
  }
  dispose() {
    this.cleanup();
    super.dispose();
  }
};
LargeOutputFileWriter = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, ITerminalLogService),
  __decorateParam(2, IEnvironmentService)
], LargeOutputFileWriter);
export {
  LargeOutputFileWriter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXGJyb3dzZXJcXGxhcmdlT3V0cHV0RmlsZVdyaXRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBNQVhfT1VUUFVUX0xFTkdUSCwgdHJ1bmNhdGVMYXJnZU91dHB1dCB9IGZyb20gJy4vb3V0cHV0SGVscGVycy5qcyc7XG5cbi8qKlxuICogV3JpdGVzIGxhcmdlIHRlcm1pbmFsIG91dHB1dCB0byB0ZW1wIGZpbGVzIHNvIHRoZSBtb2RlbCBjYW4gcmVhZCB0aGUgZnVsbFxuICogb3V0cHV0IHVzaW5nIGZpbGUtcmVhZGluZyB0b29scy4gVHJhY2tzIGNyZWF0ZWQgZmlsZXMgZm9yIGNsZWFudXAgb24gZGlzcG9zZS5cbiAqXG4gKiBNaXJyb3JzIGNvcGlsb3QtYWdlbnQtcnVudGltZSdzIGxhcmdlT3V0cHV0SGFuZGxlci50cyBwYXR0ZXJuOlxuICogLSBPdXRwdXQgZXhjZWVkaW5nIE1BWF9PVVRQVVRfTEVOR1RIIGlzIHdyaXR0ZW4gdG8gYSB0ZW1wIGZpbGVcbiAqIC0gQSB0cnVuY2F0ZWQgcHJldmlldyAoaGVhZCArIHRhaWwpIGlzIHJldHVybmVkIHdpdGggdGhlIGZpbGUgcGF0aFxuICogLSBGaWxlcyBhcmUgY2xlYW5lZCB1cCB3aGVuIHNlc3Npb25zIGVuZCBvciB0aGlzIHdyaXRlciBpcyBkaXNwb3NlZFxuICovXG5leHBvcnQgY2xhc3MgTGFyZ2VPdXRwdXRGaWxlV3JpdGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdGVtcEZpbGVzID0gbmV3IFNldDxVUkk+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElUZXJtaW5hbExvZ1NlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIElmIHRoZSBvdXRwdXQgZXhjZWVkcyBNQVhfT1VUUFVUX0xFTkdUSCwgd3JpdGVzIGl0IHRvIGEgdGVtcCBmaWxlIGFuZFxuXHQgKiByZXR1cm5zIGEgdHJ1bmNhdGVkIG1lc3NhZ2Ugd2l0aCB0aGUgZmlsZSBwYXRoLiBPdGhlcndpc2UgcmV0dXJucyB0aGVcblx0ICogb3V0cHV0IHVuY2hhbmdlZC5cblx0ICovXG5cdGFzeW5jIHByb2Nlc3NPdXRwdXQob3V0cHV0OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGlmIChvdXRwdXQubGVuZ3RoIDw9IE1BWF9PVVRQVVRfTEVOR1RIKSB7XG5cdFx0XHRyZXR1cm4gb3V0cHV0O1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbGVQYXRoID0gYXdhaXQgdGhpcy5fd3JpdGVUb1RlbXBGaWxlKG91dHB1dCk7XG5cdFx0aWYgKCFmaWxlUGF0aCkge1xuXHRcdFx0Ly8gRmlsZSB3cml0ZSBmYWlsZWQsIGZhbGwgYmFjayB0byB0cnVuY2F0aW9uIHdpdGhvdXQgZmlsZSByZWZlcmVuY2Vcblx0XHRcdHJldHVybiB0cnVuY2F0ZUxhcmdlT3V0cHV0KG91dHB1dCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydW5jYXRlTGFyZ2VPdXRwdXQob3V0cHV0LCBmaWxlUGF0aCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF93cml0ZVRvVGVtcEZpbGUob3V0cHV0OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmaWxlTmFtZSA9IGBjb3BpbG90LXRlcm1pbmFsLW91dHB1dC0ke2dlbmVyYXRlVXVpZCgpfS50eHRgO1xuXHRcdFx0Y29uc3QgZGlyVXJpID0gVVJJLmpvaW5QYXRoKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5jYWNoZUhvbWUsICdjb3BpbG90LXRlcm1pbmFsLW91dHB1dCcpO1xuXHRcdFx0Y29uc3QgZmlsZVVyaSA9IFVSSS5qb2luUGF0aChkaXJVcmksIGZpbGVOYW1lKTtcblxuXHRcdFx0Ly8gUHJldHR5LXByaW50IEpTT04gaW4gdGhlIGZpbGUgZm9yIHJlYWRhYmlsaXR5IChtYXRjaGVzIGFnZW50LXJ1bnRpbWUgYmVoYXZpb3IpXG5cdFx0XHRjb25zdCBmaWxlQ29udGVudCA9IHRoaXMuX3ByZXR0eVByaW50SWZKc29uKG91dHB1dCk7XG5cdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS53cml0ZUZpbGUoZmlsZVVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhmaWxlQ29udGVudCkpO1xuXHRcdFx0dGhpcy5fdGVtcEZpbGVzLmFkZChmaWxlVXJpKTtcblxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgTGFyZ2VPdXRwdXRGaWxlV3JpdGVyOiB3cm90ZSAke01hdGguY2VpbChvdXRwdXQubGVuZ3RoIC8gMTAyNCl9S0IgdG8gJHtmaWxlVXJpLmZzUGF0aH1gKTtcblx0XHRcdHJldHVybiBmaWxlVXJpLmZzUGF0aDtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBMYXJnZU91dHB1dEZpbGVXcml0ZXI6IGZhaWxlZCB0byB3cml0ZSB0ZW1wIGZpbGU6ICR7ZX1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcHJldHR5UHJpbnRJZkpzb24ob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHRyaW1tZWQgPSBvdXRwdXQudHJpbSgpO1xuXHRcdGlmICghdHJpbW1lZC5zdGFydHNXaXRoKCd7JykgJiYgIXRyaW1tZWQuc3RhcnRzV2l0aCgnWycpKSB7XG5cdFx0XHRyZXR1cm4gb3V0cHV0O1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KEpTT04ucGFyc2UodHJpbW1lZCksIG51bGwsIDIpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIG91dHB1dDtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ2xlYW5zIHVwIGFsbCB0cmFja2VkIHRlbXAgZmlsZXMuIENhbGxlZCBvbiBzZXNzaW9uIGVuZC5cblx0ICovXG5cdGNsZWFudXAoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBmaWxlVXJpIG9mIHRoaXMuX3RlbXBGaWxlcykge1xuXHRcdFx0dGhpcy5fZmlsZVNlcnZpY2UuZGVsKGZpbGVVcmkpLmNhdGNoKCgpID0+IHsgLyogaWdub3JlIGNsZWFudXAgZXJyb3JzICovIH0pO1xuXHRcdH1cblx0XHR0aGlzLl90ZW1wRmlsZXMuY2xlYXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5jbGVhbnVwKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG1CQUFtQiwyQkFBMkI7QUFXaEQsSUFBTSx3QkFBTixjQUFvQyxXQUFXO0FBQUEsRUFJckQsWUFDZ0MsY0FDTyxhQUNBLHFCQUNyQztBQUNELFVBQU07QUFKeUI7QUFDTztBQUNBO0FBTHZDLFNBQWlCLGFBQWEsb0JBQUksSUFBUztBQUFBLEVBUTNDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT0EsTUFBTSxjQUFjLFFBQWlDO0FBQ3BELFFBQUksT0FBTyxVQUFVLG1CQUFtQjtBQUN2QyxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sV0FBVyxNQUFNLEtBQUssaUJBQWlCLE1BQU07QUFDbkQsUUFBSSxDQUFDLFVBQVU7QUFFZCxhQUFPLG9CQUFvQixNQUFNO0FBQUEsSUFDbEM7QUFFQSxXQUFPLG9CQUFvQixRQUFRLFFBQVE7QUFBQSxFQUM1QztBQUFBLEVBRUEsTUFBYyxpQkFBaUIsUUFBNkM7QUFDM0UsUUFBSTtBQUNILFlBQU0sV0FBVywyQkFBMkIsYUFBYSxDQUFDO0FBQzFELFlBQU0sU0FBUyxJQUFJLFNBQVMsS0FBSyxvQkFBb0IsV0FBVyx5QkFBeUI7QUFDekYsWUFBTSxVQUFVLElBQUksU0FBUyxRQUFRLFFBQVE7QUFHN0MsWUFBTSxjQUFjLEtBQUssbUJBQW1CLE1BQU07QUFDbEQsWUFBTSxLQUFLLGFBQWEsVUFBVSxTQUFTLFNBQVMsV0FBVyxXQUFXLENBQUM7QUFDM0UsV0FBSyxXQUFXLElBQUksT0FBTztBQUUzQixXQUFLLFlBQVksTUFBTSxnQ0FBZ0MsS0FBSyxLQUFLLE9BQU8sU0FBUyxJQUFJLENBQUMsU0FBUyxRQUFRLE1BQU0sRUFBRTtBQUMvRyxhQUFPLFFBQVE7QUFBQSxJQUNoQixTQUFTLEdBQUc7QUFDWCxXQUFLLFlBQVksTUFBTSxxREFBcUQsQ0FBQyxFQUFFO0FBQy9FLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBLEVBRVEsbUJBQW1CLFFBQXdCO0FBQ2xELFVBQU0sVUFBVSxPQUFPLEtBQUs7QUFDNUIsUUFBSSxDQUFDLFFBQVEsV0FBVyxHQUFHLEtBQUssQ0FBQyxRQUFRLFdBQVcsR0FBRyxHQUFHO0FBQ3pELGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSTtBQUNILGFBQU8sS0FBSyxVQUFVLEtBQUssTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDO0FBQUEsSUFDbkQsUUFBUTtBQUNQLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsVUFBZ0I7QUFDZixlQUFXLFdBQVcsS0FBSyxZQUFZO0FBQ3RDLFdBQUssYUFBYSxJQUFJLE9BQU8sRUFBRSxNQUFNLE1BQU07QUFBQSxNQUE4QixDQUFDO0FBQUEsSUFDM0U7QUFDQSxTQUFLLFdBQVcsTUFBTTtBQUFBLEVBQ3ZCO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixTQUFLLFFBQVE7QUFDYixVQUFNLFFBQVE7QUFBQSxFQUNmO0FBQ0Q7QUE1RWEsd0JBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVBVOyIsCiAgIm5hbWVzIjogW10KfQo=
