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
import { createHash } from "crypto";
import { listenStream } from "../../../base/common/stream.js";
import { IFileService } from "../../files/common/files.js";
let ChecksumService = class {
  constructor(fileService) {
    this.fileService = fileService;
  }
  async checksum(resource) {
    const stream = (await this.fileService.readFileStream(resource)).value;
    return new Promise((resolve, reject) => {
      const hash = createHash("sha256");
      listenStream(stream, {
        onData: (data) => hash.update(data.buffer),
        onError: (error) => reject(error),
        onEnd: () => resolve(hash.digest("base64").replace(/=+$/, ""))
      });
    });
  }
};
ChecksumService = __decorateClass([
  __decorateParam(0, IFileService)
], ChecksumService);
export {
  ChecksumService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcY2hlY2tzdW1cXG5vZGVcXGNoZWNrc3VtU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNyZWF0ZUhhc2ggfSBmcm9tICdjcnlwdG8nO1xuaW1wb3J0IHsgbGlzdGVuU3RyZWFtIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyZWFtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ2hlY2tzdW1TZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2NoZWNrc3VtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuXG5leHBvcnQgY2xhc3MgQ2hlY2tzdW1TZXJ2aWNlIGltcGxlbWVudHMgSUNoZWNrc3VtU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoQElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UpIHsgfVxuXG5cdGFzeW5jIGNoZWNrc3VtKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IHN0cmVhbSA9IChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlU3RyZWFtKHJlc291cmNlKSkudmFsdWU7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHN0cmluZz4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29uc3QgaGFzaCA9IGNyZWF0ZUhhc2goJ3NoYTI1NicpO1xuXG5cdFx0XHRsaXN0ZW5TdHJlYW0oc3RyZWFtLCB7XG5cdFx0XHRcdG9uRGF0YTogZGF0YSA9PiBoYXNoLnVwZGF0ZShkYXRhLmJ1ZmZlciksXG5cdFx0XHRcdG9uRXJyb3I6IGVycm9yID0+IHJlamVjdChlcnJvciksXG5cdFx0XHRcdG9uRW5kOiAoKSA9PiByZXNvbHZlKGhhc2guZGlnZXN0KCdiYXNlNjQnKS5yZXBsYWNlKC89KyQvLCAnJykpXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG9CQUFvQjtBQUc3QixTQUFTLG9CQUFvQjtBQUV0QixJQUFNLGtCQUFOLE1BQWtEO0FBQUEsRUFJeEQsWUFBMkMsYUFBMkI7QUFBM0I7QUFBQSxFQUE2QjtBQUFBLEVBRXhFLE1BQU0sU0FBUyxVQUFnQztBQUM5QyxVQUFNLFVBQVUsTUFBTSxLQUFLLFlBQVksZUFBZSxRQUFRLEdBQUc7QUFDakUsV0FBTyxJQUFJLFFBQWdCLENBQUMsU0FBUyxXQUFXO0FBQy9DLFlBQU0sT0FBTyxXQUFXLFFBQVE7QUFFaEMsbUJBQWEsUUFBUTtBQUFBLFFBQ3BCLFFBQVEsVUFBUSxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQUEsUUFDdkMsU0FBUyxXQUFTLE9BQU8sS0FBSztBQUFBLFFBQzlCLE9BQU8sTUFBTSxRQUFRLEtBQUssT0FBTyxRQUFRLEVBQUUsUUFBUSxPQUFPLEVBQUUsQ0FBQztBQUFBLE1BQzlELENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUFsQmEsa0JBQU47QUFBQSxFQUlPO0FBQUEsR0FKRDsiLAogICJuYW1lcyI6IFtdCn0K
