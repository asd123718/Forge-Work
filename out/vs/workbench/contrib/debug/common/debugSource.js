import * as nls from "../../../../nls.js";
import { URI } from "../../../../base/common/uri.js";
import { normalize, isAbsolute } from "../../../../base/common/path.js";
import * as resources from "../../../../base/common/resources.js";
import { DEBUG_SCHEME } from "./debug.js";
import { SIDE_GROUP, ACTIVE_GROUP } from "../../../services/editor/common/editorService.js";
import { Schemas } from "../../../../base/common/network.js";
import { isUriString } from "./debugUtils.js";
import { TextEditorSelectionRevealType } from "../../../../platform/editor/common/editor.js";
const UNKNOWN_SOURCE_LABEL = nls.localize("unknownSource", "Unknown Source");
class Source {
  constructor(raw_, sessionId, uriIdentityService, logService) {
    let path;
    if (raw_) {
      this.raw = raw_;
      path = this.raw.path || this.raw.name || "";
      this.available = true;
    } else {
      this.raw = { name: UNKNOWN_SOURCE_LABEL };
      this.available = false;
      path = `${DEBUG_SCHEME}:${UNKNOWN_SOURCE_LABEL}`;
    }
    this.uri = getUriFromSource(this.raw, path, sessionId, uriIdentityService, logService);
  }
  get name() {
    return this.raw.name || resources.basenameOrAuthority(this.uri);
  }
  get origin() {
    return this.raw.origin;
  }
  get presentationHint() {
    return this.raw.presentationHint;
  }
  get reference() {
    return this.raw.sourceReference;
  }
  get inMemory() {
    return this.uri.scheme === DEBUG_SCHEME;
  }
  openInEditor(editorService, selection, preserveFocus, sideBySide, pinned) {
    return !this.available ? Promise.resolve(void 0) : editorService.openEditor({
      resource: this.uri,
      description: this.origin,
      options: {
        preserveFocus,
        selection,
        revealIfOpened: true,
        selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport,
        pinned
      }
    }, sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
  }
  static getEncodedDebugData(modelUri) {
    let path;
    let sourceReference;
    let sessionId;
    switch (modelUri.scheme) {
      case Schemas.file:
        path = normalize(modelUri.fsPath);
        break;
      case DEBUG_SCHEME:
        path = modelUri.path;
        if (modelUri.query) {
          const keyvalues = modelUri.query.split("&");
          for (const keyvalue of keyvalues) {
            const pair = keyvalue.split("=");
            if (pair.length === 2) {
              switch (pair[0]) {
                case "session":
                  sessionId = pair[1];
                  break;
                case "ref":
                  sourceReference = parseInt(pair[1]);
                  break;
              }
            }
          }
        }
        break;
      default:
        path = modelUri.toString();
        break;
    }
    return {
      name: resources.basenameOrAuthority(modelUri),
      path,
      sourceReference,
      sessionId
    };
  }
}
function getUriFromSource(raw, path, sessionId, uriIdentityService, logService) {
  const _getUriFromSource = (path2) => {
    if (typeof raw.sourceReference === "number" && raw.sourceReference > 0) {
      return URI.from({
        scheme: DEBUG_SCHEME,
        path: path2?.replace(/^\/+/g, "/"),
        // #174054
        query: `session=${sessionId}&ref=${raw.sourceReference}`
      });
    }
    if (path2 && isUriString(path2)) {
      return uriIdentityService.asCanonicalUri(URI.parse(path2));
    }
    if (path2 && isAbsolute(path2)) {
      return uriIdentityService.asCanonicalUri(URI.file(path2));
    }
    return uriIdentityService.asCanonicalUri(URI.from({
      scheme: DEBUG_SCHEME,
      path: path2,
      query: `session=${sessionId}`
    }));
  };
  try {
    return _getUriFromSource(path);
  } catch (err) {
    logService.error("Invalid path from debug adapter: " + path);
    return _getUriFromSource("/invalidDebugSource");
  }
}
export {
  Source,
  UNKNOWN_SOURCE_LABEL,
  getUriFromSource
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxjb21tb25cXGRlYnVnU291cmNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbm9ybWFsaXplLCBpc0Fic29sdXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgKiBhcyByZXNvdXJjZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IERFQlVHX1NDSEVNRSB9IGZyb20gJy4vZGVidWcuanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlLCBTSURFX0dST1VQLCBBQ1RJVkVfR1JPVVAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgaXNVcmlTdHJpbmcgfSBmcm9tICcuL2RlYnVnVXRpbHMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IFRleHRFZGl0b3JTZWxlY3Rpb25SZXZlYWxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcblxuZXhwb3J0IGNvbnN0IFVOS05PV05fU09VUkNFX0xBQkVMID0gbmxzLmxvY2FsaXplKCd1bmtub3duU291cmNlJywgXCJVbmtub3duIFNvdXJjZVwiKTtcblxuLyoqXG4gKiBEZWJ1ZyBVUkkgZm9ybWF0XG4gKlxuICogYSBkZWJ1ZyBVUkkgcmVwcmVzZW50cyBhIFNvdXJjZSBvYmplY3QgYW5kIHRoZSBkZWJ1ZyBzZXNzaW9uIHdoZXJlIHRoZSBTb3VyY2UgY29tZXMgZnJvbS5cbiAqXG4gKiAgICAgICBkZWJ1ZzphcmJpdHJhcnlfcGF0aD9zZXNzaW9uPTEyM2U0NTY3LWU4OWItMTJkMy1hNDU2LTQyNjY1NTQ0MDAwMCZyZWY9MTAxNlxuICogICAgICAgXFxfX18vIFxcX19fX19fX19fX19fLyBcXF9fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fXy8gXFxfX19fX18vXG4gKiAgICAgICAgIHwgICAgICAgICAgfCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfCAgICAgICAgICAgICAgICAgICAgICAgICAgfFxuICogICAgICBzY2hlbWUgICBzb3VyY2UucGF0aCAgICAgICAgICAgICAgICAgICAgc2Vzc2lvbiBpZCAgICAgICAgICAgIHNvdXJjZS5yZWZlcmVuY2VcbiAqXG4gKlxuICovXG5cbmV4cG9ydCBjbGFzcyBTb3VyY2Uge1xuXG5cdHJlYWRvbmx5IHVyaTogVVJJO1xuXHRhdmFpbGFibGU6IGJvb2xlYW47XG5cdHJhdzogRGVidWdQcm90b2NvbC5Tb3VyY2U7XG5cblx0Y29uc3RydWN0b3IocmF3XzogRGVidWdQcm90b2NvbC5Tb3VyY2UgfCB1bmRlZmluZWQsIHNlc3Npb25JZDogc3RyaW5nLCB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlKSB7XG5cdFx0bGV0IHBhdGg6IHN0cmluZztcblx0XHRpZiAocmF3Xykge1xuXHRcdFx0dGhpcy5yYXcgPSByYXdfO1xuXHRcdFx0cGF0aCA9IHRoaXMucmF3LnBhdGggfHwgdGhpcy5yYXcubmFtZSB8fCAnJztcblx0XHRcdHRoaXMuYXZhaWxhYmxlID0gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yYXcgPSB7IG5hbWU6IFVOS05PV05fU09VUkNFX0xBQkVMIH07XG5cdFx0XHR0aGlzLmF2YWlsYWJsZSA9IGZhbHNlO1xuXHRcdFx0cGF0aCA9IGAke0RFQlVHX1NDSEVNRX06JHtVTktOT1dOX1NPVVJDRV9MQUJFTH1gO1xuXHRcdH1cblxuXHRcdHRoaXMudXJpID0gZ2V0VXJpRnJvbVNvdXJjZSh0aGlzLnJhdywgcGF0aCwgc2Vzc2lvbklkLCB1cmlJZGVudGl0eVNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHR9XG5cblx0Z2V0IG5hbWUoKSB7XG5cdFx0cmV0dXJuIHRoaXMucmF3Lm5hbWUgfHwgcmVzb3VyY2VzLmJhc2VuYW1lT3JBdXRob3JpdHkodGhpcy51cmkpO1xuXHR9XG5cblx0Z2V0IG9yaWdpbigpIHtcblx0XHRyZXR1cm4gdGhpcy5yYXcub3JpZ2luO1xuXHR9XG5cblx0Z2V0IHByZXNlbnRhdGlvbkhpbnQoKSB7XG5cdFx0cmV0dXJuIHRoaXMucmF3LnByZXNlbnRhdGlvbkhpbnQ7XG5cdH1cblxuXHRnZXQgcmVmZXJlbmNlKCkge1xuXHRcdHJldHVybiB0aGlzLnJhdy5zb3VyY2VSZWZlcmVuY2U7XG5cdH1cblxuXHRnZXQgaW5NZW1vcnkoKSB7XG5cdFx0cmV0dXJuIHRoaXMudXJpLnNjaGVtZSA9PT0gREVCVUdfU0NIRU1FO1xuXHR9XG5cblx0b3BlbkluRWRpdG9yKGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLCBzZWxlY3Rpb246IElSYW5nZSwgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4sIHNpZGVCeVNpZGU/OiBib29sZWFuLCBwaW5uZWQ/OiBib29sZWFuKTogUHJvbWlzZTxJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiAhdGhpcy5hdmFpbGFibGUgPyBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKSA6IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRyZXNvdXJjZTogdGhpcy51cmksXG5cdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5vcmlnaW4sXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdHByZXNlcnZlRm9jdXMsXG5cdFx0XHRcdHNlbGVjdGlvbixcblx0XHRcdFx0cmV2ZWFsSWZPcGVuZWQ6IHRydWUsXG5cdFx0XHRcdHNlbGVjdGlvblJldmVhbFR5cGU6IFRleHRFZGl0b3JTZWxlY3Rpb25SZXZlYWxUeXBlLkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0LFxuXHRcdFx0XHRwaW5uZWRcblx0XHRcdH1cblx0XHR9LCBzaWRlQnlTaWRlID8gU0lERV9HUk9VUCA6IEFDVElWRV9HUk9VUCk7XG5cdH1cblxuXHRzdGF0aWMgZ2V0RW5jb2RlZERlYnVnRGF0YShtb2RlbFVyaTogVVJJKTogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgc2Vzc2lvbklkPzogc3RyaW5nOyBzb3VyY2VSZWZlcmVuY2U/OiBudW1iZXIgfSB7XG5cdFx0bGV0IHBhdGg6IHN0cmluZztcblx0XHRsZXQgc291cmNlUmVmZXJlbmNlOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdFx0c3dpdGNoIChtb2RlbFVyaS5zY2hlbWUpIHtcblx0XHRcdGNhc2UgU2NoZW1hcy5maWxlOlxuXHRcdFx0XHRwYXRoID0gbm9ybWFsaXplKG1vZGVsVXJpLmZzUGF0aCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBERUJVR19TQ0hFTUU6XG5cdFx0XHRcdHBhdGggPSBtb2RlbFVyaS5wYXRoO1xuXHRcdFx0XHRpZiAobW9kZWxVcmkucXVlcnkpIHtcblx0XHRcdFx0XHRjb25zdCBrZXl2YWx1ZXMgPSBtb2RlbFVyaS5xdWVyeS5zcGxpdCgnJicpO1xuXHRcdFx0XHRcdGZvciAoY29uc3Qga2V5dmFsdWUgb2Yga2V5dmFsdWVzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwYWlyID0ga2V5dmFsdWUuc3BsaXQoJz0nKTtcblx0XHRcdFx0XHRcdGlmIChwYWlyLmxlbmd0aCA9PT0gMikge1xuXHRcdFx0XHRcdFx0XHRzd2l0Y2ggKHBhaXJbMF0pIHtcblx0XHRcdFx0XHRcdFx0XHRjYXNlICdzZXNzaW9uJzpcblx0XHRcdFx0XHRcdFx0XHRcdHNlc3Npb25JZCA9IHBhaXJbMV07XG5cdFx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0XHRjYXNlICdyZWYnOlxuXHRcdFx0XHRcdFx0XHRcdFx0c291cmNlUmVmZXJlbmNlID0gcGFyc2VJbnQocGFpclsxXSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHBhdGggPSBtb2RlbFVyaS50b1N0cmluZygpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogcmVzb3VyY2VzLmJhc2VuYW1lT3JBdXRob3JpdHkobW9kZWxVcmkpLFxuXHRcdFx0cGF0aCxcblx0XHRcdHNvdXJjZVJlZmVyZW5jZSxcblx0XHRcdHNlc3Npb25JZFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFVyaUZyb21Tb3VyY2UocmF3OiBEZWJ1Z1Byb3RvY29sLlNvdXJjZSwgcGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkLCBzZXNzaW9uSWQ6IHN0cmluZywgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSk6IFVSSSB7XG5cdGNvbnN0IF9nZXRVcmlGcm9tU291cmNlID0gKHBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdGlmICh0eXBlb2YgcmF3LnNvdXJjZVJlZmVyZW5jZSA9PT0gJ251bWJlcicgJiYgcmF3LnNvdXJjZVJlZmVyZW5jZSA+IDApIHtcblx0XHRcdHJldHVybiBVUkkuZnJvbSh7XG5cdFx0XHRcdHNjaGVtZTogREVCVUdfU0NIRU1FLFxuXHRcdFx0XHRwYXRoOiBwYXRoPy5yZXBsYWNlKC9eXFwvKy9nLCAnLycpLCAvLyAjMTc0MDU0XG5cdFx0XHRcdHF1ZXJ5OiBgc2Vzc2lvbj0ke3Nlc3Npb25JZH0mcmVmPSR7cmF3LnNvdXJjZVJlZmVyZW5jZX1gXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAocGF0aCAmJiBpc1VyaVN0cmluZyhwYXRoKSkge1x0Ly8gcGF0aCBsb29rcyBsaWtlIGEgdXJpXG5cdFx0XHRyZXR1cm4gdXJpSWRlbnRpdHlTZXJ2aWNlLmFzQ2Fub25pY2FsVXJpKFVSSS5wYXJzZShwYXRoKSk7XG5cdFx0fVxuXHRcdC8vIGFzc3VtZSBhIGZpbGVzeXN0ZW0gcGF0aFxuXHRcdGlmIChwYXRoICYmIGlzQWJzb2x1dGUocGF0aCkpIHtcblx0XHRcdHJldHVybiB1cmlJZGVudGl0eVNlcnZpY2UuYXNDYW5vbmljYWxVcmkoVVJJLmZpbGUocGF0aCkpO1xuXHRcdH1cblx0XHQvLyBwYXRoIGlzIHJlbGF0aXZlOiBzaW5jZSBWUyBDb2RlIGNhbm5vdCBkZWFsIHdpdGggdGhpcyBieSBpdHNlbGZcblx0XHQvLyBjcmVhdGUgYSBkZWJ1ZyB1cmwgdGhhdCB3aWxsIHJlc3VsdCBpbiBhIERBUCAnc291cmNlJyByZXF1ZXN0IHdoZW4gdGhlIHVybCBpcyByZXNvbHZlZC5cblx0XHRyZXR1cm4gdXJpSWRlbnRpdHlTZXJ2aWNlLmFzQ2Fub25pY2FsVXJpKFVSSS5mcm9tKHtcblx0XHRcdHNjaGVtZTogREVCVUdfU0NIRU1FLFxuXHRcdFx0cGF0aCxcblx0XHRcdHF1ZXJ5OiBgc2Vzc2lvbj0ke3Nlc3Npb25JZH1gXG5cdFx0fSkpO1xuXHR9O1xuXG5cblx0dHJ5IHtcblx0XHRyZXR1cm4gX2dldFVyaUZyb21Tb3VyY2UocGF0aCk7XG5cdH0gY2F0Y2ggKGVycikge1xuXHRcdGxvZ1NlcnZpY2UuZXJyb3IoJ0ludmFsaWQgcGF0aCBmcm9tIGRlYnVnIGFkYXB0ZXI6ICcgKyBwYXRoKTtcblx0XHRyZXR1cm4gX2dldFVyaUZyb21Tb3VyY2UoJy9pbnZhbGlkRGVidWdTb3VyY2UnKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsV0FBVztBQUNwQixTQUFTLFdBQVcsa0JBQWtCO0FBQ3RDLFlBQVksZUFBZTtBQUMzQixTQUFTLG9CQUFvQjtBQUU3QixTQUF5QixZQUFZLG9CQUFvQjtBQUN6RCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyxxQ0FBcUM7QUFJdkMsTUFBTSx1QkFBdUIsSUFBSSxTQUFTLGlCQUFpQixnQkFBZ0I7QUFlM0UsTUFBTSxPQUFPO0FBQUEsRUFNbkIsWUFB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
