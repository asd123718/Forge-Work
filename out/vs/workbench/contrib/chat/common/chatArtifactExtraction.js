import { match as globMatch } from "../../../../base/common/glob.js";
import { getExtensionForMimeType } from "../../../../base/common/mime.js";
import { basename as pathBasename } from "../../../../base/common/path.js";
import { basename } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { IChatToolInvocation } from "./chatService/chatService.js";
import { ChatResponseResource } from "./model/chatModel.js";
import { isToolResultInputOutputDetails } from "./tools/languageModelToolsService.js";
const CHAT_MEMORY_FILE_SCHEME = "chat-memory-file";
const MEMORY_TOOL_ID = "copilot_memory";
var ChatMemoryFileResource;
((ChatMemoryFileResource2) => {
  function createUri(memoryPath, sessionResource) {
    return URI.from({
      scheme: CHAT_MEMORY_FILE_SCHEME,
      path: memoryPath,
      query: sessionResource.toString()
    });
  }
  ChatMemoryFileResource2.createUri = createUri;
  function isChatMemoryFileUri(uri) {
    return uri.scheme === CHAT_MEMORY_FILE_SCHEME;
  }
  ChatMemoryFileResource2.isChatMemoryFileUri = isChatMemoryFileUri;
  function parse(uri) {
    return {
      memoryPath: uri.path,
      sessionResource: uri.query
    };
  }
  ChatMemoryFileResource2.parse = parse;
})(ChatMemoryFileResource || (ChatMemoryFileResource = {}));
function matchMimeType(pattern, mimeType) {
  if (pattern === mimeType) {
    return true;
  }
  const [patternType, patternSubtype] = pattern.split("/");
  const [type] = mimeType.split("/");
  return patternSubtype === "*" && patternType === type;
}
function findFilePathRule(filePath, byFilePath) {
  const fileBasename = pathBasename(filePath);
  for (const [pattern, config] of Object.entries(byFilePath)) {
    if (globMatch(pattern, filePath) || globMatch(pattern, fileBasename)) {
      return config;
    }
  }
  return void 0;
}
function findMimeTypeRule(mimeType, byMimeType) {
  for (const [pattern, config] of Object.entries(byMimeType)) {
    if (matchMimeType(pattern, mimeType)) {
      return config;
    }
  }
  return void 0;
}
function isToolResultOutputDetailsSerialized(obj) {
  return typeof obj === "object" && obj !== null && "output" in obj && typeof obj.output === "object" && obj.output?.type === "data" && typeof obj.output?.mimeType === "string";
}
function getMemoryPathFromParams(params) {
  if (typeof params !== "object" || params === null) {
    return void 0;
  }
  const path = params["path"];
  return typeof path === "string" ? path : void 0;
}
const memoryWriteCommands = /* @__PURE__ */ new Set(["create", "str_replace", "insert"]);
function isMemoryWriteCommand(params) {
  if (typeof params !== "object" || params === null) {
    return false;
  }
  const command = params["command"];
  return typeof command === "string" && memoryWriteCommands.has(command);
}
function extractArtifactsFromResponse(response, sessionResource, byMimeType, byFilePath, byMemoryFilePath = {}) {
  const artifacts = [];
  const seenUris = /* @__PURE__ */ new Set();
  for (const part of response.value) {
    if (part.kind === "codeblockUri") {
      const uri = part.uri;
      const uriStr = uri.toString();
      if (seenUris.has(uriStr)) {
        continue;
      }
      const rule = findFilePathRule(uri.path, byFilePath);
      if (rule) {
        seenUris.add(uriStr);
        artifacts.push({
          label: basename(uri),
          uri: uriStr,
          type: "plan",
          groupName: rule.groupName,
          onlyShowGroup: rule.onlyShowGroup
        });
      }
    }
    if (part.kind === "textEditGroup") {
      const uri = part.uri;
      const uriStr = uri.toString();
      if (seenUris.has(uriStr)) {
        continue;
      }
      const rule = findFilePathRule(uri.path, byFilePath);
      if (rule) {
        seenUris.add(uriStr);
        artifacts.push({
          label: basename(uri),
          uri: uriStr,
          type: "plan",
          groupName: rule.groupName,
          onlyShowGroup: rule.onlyShowGroup
        });
      }
    }
    if (part.kind === "workspaceEdit") {
      for (const edit of part.edits) {
        const uri = edit.newResource ?? edit.oldResource;
        if (!uri) {
          continue;
        }
        const uriStr = uri.toString();
        if (seenUris.has(uriStr)) {
          continue;
        }
        const rule = findFilePathRule(uri.path, byFilePath);
        if (rule) {
          seenUris.add(uriStr);
          artifacts.push({
            label: basename(uri),
            uri: uriStr,
            type: "plan",
            groupName: rule.groupName,
            onlyShowGroup: rule.onlyShowGroup
          });
        }
      }
    }
    if (part.kind === "externalEdit") {
      const uri = part.uri;
      const uriStr = uri.toString();
      if (seenUris.has(uriStr)) {
        continue;
      }
      const rule = findFilePathRule(uri.path, byFilePath);
      if (rule) {
        seenUris.add(uriStr);
        artifacts.push({
          label: basename(uri),
          uri: uriStr,
          type: "plan",
          groupName: rule.groupName,
          onlyShowGroup: rule.onlyShowGroup
        });
      }
    }
    if ((part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") && part.toolId === MEMORY_TOOL_ID) {
      const params = IChatToolInvocation.getParameters(part);
      const memoryPath = getMemoryPathFromParams(params);
      if (memoryPath && isMemoryWriteCommand(params)) {
        const rule = findFilePathRule(memoryPath, byMemoryFilePath);
        if (rule) {
          const key = `memory:${part.toolCallId}:${memoryPath}`;
          if (!seenUris.has(key)) {
            seenUris.add(key);
            artifacts.push({
              label: pathBasename(memoryPath),
              uri: ChatMemoryFileResource.createUri(memoryPath, sessionResource).toString(),
              type: "plan",
              groupName: rule.groupName,
              onlyShowGroup: rule.onlyShowGroup
            });
          }
        }
      }
    }
    if (part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") {
      const details = IChatToolInvocation.resultDetails(part);
      if (!details) {
        continue;
      }
      if (isToolResultInputOutputDetails(details)) {
        for (let i = 0; i < details.output.length; i++) {
          const outputPart = details.output[i];
          if (outputPart.type === "embed" && !outputPart.isText && outputPart.mimeType) {
            const rule = findMimeTypeRule(outputPart.mimeType, byMimeType);
            if (rule) {
              const key = `${part.toolCallId}:${i}`;
              if (!seenUris.has(key)) {
                seenUris.add(key);
                const ext = getExtensionForMimeType(outputPart.mimeType);
                const permalinkBasename = ext ? `file${ext}` : "file.bin";
                const artifactUri = ChatResponseResource.createUri(sessionResource, part.toolCallId, i, permalinkBasename);
                artifacts.push({
                  label: outputPart.uri?.path.split("/").pop() ?? `${rule.groupName} ${i + 1}`,
                  uri: artifactUri.toString(),
                  toolCallId: part.toolCallId,
                  dataPartIndex: i,
                  type: "screenshot",
                  groupName: rule.groupName,
                  onlyShowGroup: rule.onlyShowGroup
                });
              }
            }
          }
        }
      }
      if (isToolResultOutputDetailsSerialized(details)) {
        const rule = findMimeTypeRule(details.output.mimeType, byMimeType);
        if (rule) {
          const key = `${part.toolCallId}:0`;
          if (!seenUris.has(key)) {
            seenUris.add(key);
            const ext = getExtensionForMimeType(details.output.mimeType);
            const permalinkBasename = ext ? `file${ext}` : "file.bin";
            const artifactUri = ChatResponseResource.createUri(sessionResource, part.toolCallId, 0, permalinkBasename);
            artifacts.push({
              label: `${rule.groupName}`,
              uri: artifactUri.toString(),
              toolCallId: part.toolCallId,
              dataPartIndex: 0,
              type: "screenshot",
              groupName: rule.groupName,
              onlyShowGroup: rule.onlyShowGroup
            });
          }
        }
      }
    }
  }
  return artifacts;
}
export {
  ChatMemoryFileResource,
  extractArtifactsFromResponse
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcY2hhdEFydGlmYWN0RXh0cmFjdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG1hdGNoIGFzIGdsb2JNYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2dsb2IuanMnO1xuaW1wb3J0IHsgZ2V0RXh0ZW5zaW9uRm9yTWltZVR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIGFzIHBhdGhCYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDaGF0VG9vbEludm9jYXRpb24sIElUb29sUmVzdWx0T3V0cHV0RGV0YWlsc1NlcmlhbGl6ZWQgfSBmcm9tICcuL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRSZXNwb25zZVJlc291cmNlLCBJUmVzcG9uc2UgfSBmcm9tICcuL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQXJ0aWZhY3RHcm91cENvbmZpZywgSUNoYXRBcnRpZmFjdCB9IGZyb20gJy4vdG9vbHMvY2hhdEFydGlmYWN0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNUb29sUmVzdWx0SW5wdXRPdXRwdXREZXRhaWxzIH0gZnJvbSAnLi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcblxuY29uc3QgQ0hBVF9NRU1PUllfRklMRV9TQ0hFTUUgPSAnY2hhdC1tZW1vcnktZmlsZSc7XG5jb25zdCBNRU1PUllfVE9PTF9JRCA9ICdjb3BpbG90X21lbW9yeSc7XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdE1lbW9yeUZpbGVSZXNvdXJjZSB7XG5cdGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVVcmkobWVtb3J5UGF0aDogc3RyaW5nLCBzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFVSSSB7XG5cdFx0cmV0dXJuIFVSSS5mcm9tKHtcblx0XHRcdHNjaGVtZTogQ0hBVF9NRU1PUllfRklMRV9TQ0hFTUUsXG5cdFx0XHRwYXRoOiBtZW1vcnlQYXRoLFxuXHRcdFx0cXVlcnk6IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdH0pO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGlzQ2hhdE1lbW9yeUZpbGVVcmkodXJpOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdXJpLnNjaGVtZSA9PT0gQ0hBVF9NRU1PUllfRklMRV9TQ0hFTUU7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gcGFyc2UodXJpOiBVUkkpOiB7IG1lbW9yeVBhdGg6IHN0cmluZzsgc2Vzc2lvblJlc291cmNlOiBzdHJpbmcgfSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG1lbW9yeVBhdGg6IHVyaS5wYXRoLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiB1cmkucXVlcnksXG5cdFx0fTtcblx0fVxufVxuXG4vKipcbiAqIE1hdGNoZXMgYSBNSU1FIHR5cGUgYWdhaW5zdCBhIHBhdHRlcm4gc3VwcG9ydGluZyB3aWxkY2FyZHMuXG4gKiBFLmcuIGBpbWFnZS8qYCBtYXRjaGVzIGBpbWFnZS9wbmdgLCBgaW1hZ2UvanBlZ2AsIGV0Yy5cbiAqL1xuZnVuY3Rpb24gbWF0Y2hNaW1lVHlwZShwYXR0ZXJuOiBzdHJpbmcsIG1pbWVUeXBlOiBzdHJpbmcpOiBib29sZWFuIHtcblx0aWYgKHBhdHRlcm4gPT09IG1pbWVUeXBlKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0Y29uc3QgW3BhdHRlcm5UeXBlLCBwYXR0ZXJuU3VidHlwZV0gPSBwYXR0ZXJuLnNwbGl0KCcvJyk7XG5cdGNvbnN0IFt0eXBlXSA9IG1pbWVUeXBlLnNwbGl0KCcvJyk7XG5cdHJldHVybiBwYXR0ZXJuU3VidHlwZSA9PT0gJyonICYmIHBhdHRlcm5UeXBlID09PSB0eXBlO1xufVxuXG4vKipcbiAqIEZpbmRzIHRoZSBmaXJzdCBtYXRjaGluZyBydWxlIGZvciBhIGZpbGUgcGF0aCBmcm9tIGJ5RmlsZVBhdGggcnVsZXMuXG4gKi9cbmZ1bmN0aW9uIGZpbmRGaWxlUGF0aFJ1bGUoXG5cdGZpbGVQYXRoOiBzdHJpbmcsXG5cdGJ5RmlsZVBhdGg6IFJlY29yZDxzdHJpbmcsIElBcnRpZmFjdEdyb3VwQ29uZmlnPlxuKTogSUFydGlmYWN0R3JvdXBDb25maWcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBmaWxlQmFzZW5hbWUgPSBwYXRoQmFzZW5hbWUoZmlsZVBhdGgpO1xuXHRmb3IgKGNvbnN0IFtwYXR0ZXJuLCBjb25maWddIG9mIE9iamVjdC5lbnRyaWVzKGJ5RmlsZVBhdGgpKSB7XG5cdFx0aWYgKGdsb2JNYXRjaChwYXR0ZXJuLCBmaWxlUGF0aCkgfHwgZ2xvYk1hdGNoKHBhdHRlcm4sIGZpbGVCYXNlbmFtZSkpIHtcblx0XHRcdHJldHVybiBjb25maWc7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogRmluZHMgdGhlIGZpcnN0IG1hdGNoaW5nIHJ1bGUgZm9yIGEgTUlNRSB0eXBlIGZyb20gYnlNaW1lVHlwZSBydWxlcy5cbiAqL1xuZnVuY3Rpb24gZmluZE1pbWVUeXBlUnVsZShcblx0bWltZVR5cGU6IHN0cmluZyxcblx0YnlNaW1lVHlwZTogUmVjb3JkPHN0cmluZywgSUFydGlmYWN0R3JvdXBDb25maWc+XG4pOiBJQXJ0aWZhY3RHcm91cENvbmZpZyB8IHVuZGVmaW5lZCB7XG5cdGZvciAoY29uc3QgW3BhdHRlcm4sIGNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoYnlNaW1lVHlwZSkpIHtcblx0XHRpZiAobWF0Y2hNaW1lVHlwZShwYXR0ZXJuLCBtaW1lVHlwZSkpIHtcblx0XHRcdHJldHVybiBjb25maWc7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGlzVG9vbFJlc3VsdE91dHB1dERldGFpbHNTZXJpYWxpemVkKG9iajogdW5rbm93bik6IG9iaiBpcyBJVG9vbFJlc3VsdE91dHB1dERldGFpbHNTZXJpYWxpemVkIHtcblx0cmV0dXJuIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmIG9iaiAhPT0gbnVsbFxuXHRcdCYmICdvdXRwdXQnIGluIG9iaiAmJiB0eXBlb2YgKG9iaiBhcyBJVG9vbFJlc3VsdE91dHB1dERldGFpbHNTZXJpYWxpemVkKS5vdXRwdXQgPT09ICdvYmplY3QnXG5cdFx0JiYgKG9iaiBhcyBJVG9vbFJlc3VsdE91dHB1dERldGFpbHNTZXJpYWxpemVkKS5vdXRwdXQ/LnR5cGUgPT09ICdkYXRhJ1xuXHRcdCYmIHR5cGVvZiAob2JqIGFzIElUb29sUmVzdWx0T3V0cHV0RGV0YWlsc1NlcmlhbGl6ZWQpLm91dHB1dD8ubWltZVR5cGUgPT09ICdzdHJpbmcnO1xufVxuXG5mdW5jdGlvbiBnZXRNZW1vcnlQYXRoRnJvbVBhcmFtcyhwYXJhbXM6IHVua25vd24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAodHlwZW9mIHBhcmFtcyAhPT0gJ29iamVjdCcgfHwgcGFyYW1zID09PSBudWxsKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBwYXRoID0gKHBhcmFtcyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbJ3BhdGgnXTtcblx0cmV0dXJuIHR5cGVvZiBwYXRoID09PSAnc3RyaW5nJyA/IHBhdGggOiB1bmRlZmluZWQ7XG59XG5cbmNvbnN0IG1lbW9yeVdyaXRlQ29tbWFuZHMgPSBuZXcgU2V0KFsnY3JlYXRlJywgJ3N0cl9yZXBsYWNlJywgJ2luc2VydCddKTtcblxuZnVuY3Rpb24gaXNNZW1vcnlXcml0ZUNvbW1hbmQocGFyYW1zOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdGlmICh0eXBlb2YgcGFyYW1zICE9PSAnb2JqZWN0JyB8fCBwYXJhbXMgPT09IG51bGwpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3QgY29tbWFuZCA9IChwYXJhbXMgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pWydjb21tYW5kJ107XG5cdHJldHVybiB0eXBlb2YgY29tbWFuZCA9PT0gJ3N0cmluZycgJiYgbWVtb3J5V3JpdGVDb21tYW5kcy5oYXMoY29tbWFuZCk7XG59XG5cbi8qKlxuICogRXh0cmFjdHMgYXJ0aWZhY3RzIGZyb20gYSBzaW5nbGUgcmVzcG9uc2UncyBjb250ZW50IHBhcnRzLCBhcHBseWluZyB0aGUgZ2l2ZW4gcnVsZXMuXG4gKiBQdXJlIGZ1bmN0aW9uLCBubyBzaWRlIGVmZmVjdHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0QXJ0aWZhY3RzRnJvbVJlc3BvbnNlKFxuXHRyZXNwb25zZTogSVJlc3BvbnNlLFxuXHRzZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0YnlNaW1lVHlwZTogUmVjb3JkPHN0cmluZywgSUFydGlmYWN0R3JvdXBDb25maWc+LFxuXHRieUZpbGVQYXRoOiBSZWNvcmQ8c3RyaW5nLCBJQXJ0aWZhY3RHcm91cENvbmZpZz4sXG5cdGJ5TWVtb3J5RmlsZVBhdGg6IFJlY29yZDxzdHJpbmcsIElBcnRpZmFjdEdyb3VwQ29uZmlnPiA9IHt9LFxuKTogSUNoYXRBcnRpZmFjdFtdIHtcblx0Y29uc3QgYXJ0aWZhY3RzOiBJQ2hhdEFydGlmYWN0W10gPSBbXTtcblx0Y29uc3Qgc2VlblVyaXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRmb3IgKGNvbnN0IHBhcnQgb2YgcmVzcG9uc2UudmFsdWUpIHtcblx0XHQvLyBGaWxlIHdyaXRlczogY29kZWJsb2NrVXJpXG5cdFx0aWYgKHBhcnQua2luZCA9PT0gJ2NvZGVibG9ja1VyaScpIHtcblx0XHRcdGNvbnN0IHVyaSA9IHBhcnQudXJpO1xuXHRcdFx0Y29uc3QgdXJpU3RyID0gdXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRpZiAoc2VlblVyaXMuaGFzKHVyaVN0cikpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBydWxlID0gZmluZEZpbGVQYXRoUnVsZSh1cmkucGF0aCwgYnlGaWxlUGF0aCk7XG5cdFx0XHRpZiAocnVsZSkge1xuXHRcdFx0XHRzZWVuVXJpcy5hZGQodXJpU3RyKTtcblx0XHRcdFx0YXJ0aWZhY3RzLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBiYXNlbmFtZSh1cmkpLFxuXHRcdFx0XHRcdHVyaTogdXJpU3RyLFxuXHRcdFx0XHRcdHR5cGU6ICdwbGFuJyxcblx0XHRcdFx0XHRncm91cE5hbWU6IHJ1bGUuZ3JvdXBOYW1lLFxuXHRcdFx0XHRcdG9ubHlTaG93R3JvdXA6IHJ1bGUub25seVNob3dHcm91cCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRmlsZSB3cml0ZXM6IHRleHRFZGl0R3JvdXBcblx0XHRpZiAocGFydC5raW5kID09PSAndGV4dEVkaXRHcm91cCcpIHtcblx0XHRcdGNvbnN0IHVyaSA9IHBhcnQudXJpO1xuXHRcdFx0Y29uc3QgdXJpU3RyID0gdXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRpZiAoc2VlblVyaXMuaGFzKHVyaVN0cikpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBydWxlID0gZmluZEZpbGVQYXRoUnVsZSh1cmkucGF0aCwgYnlGaWxlUGF0aCk7XG5cdFx0XHRpZiAocnVsZSkge1xuXHRcdFx0XHRzZWVuVXJpcy5hZGQodXJpU3RyKTtcblx0XHRcdFx0YXJ0aWZhY3RzLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBiYXNlbmFtZSh1cmkpLFxuXHRcdFx0XHRcdHVyaTogdXJpU3RyLFxuXHRcdFx0XHRcdHR5cGU6ICdwbGFuJyxcblx0XHRcdFx0XHRncm91cE5hbWU6IHJ1bGUuZ3JvdXBOYW1lLFxuXHRcdFx0XHRcdG9ubHlTaG93R3JvdXA6IHJ1bGUub25seVNob3dHcm91cCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRmlsZSB3cml0ZXM6IHdvcmtzcGFjZUVkaXRcblx0XHRpZiAocGFydC5raW5kID09PSAnd29ya3NwYWNlRWRpdCcpIHtcblx0XHRcdGZvciAoY29uc3QgZWRpdCBvZiBwYXJ0LmVkaXRzKSB7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IGVkaXQubmV3UmVzb3VyY2UgPz8gZWRpdC5vbGRSZXNvdXJjZTtcblx0XHRcdFx0aWYgKCF1cmkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB1cmlTdHIgPSB1cmkudG9TdHJpbmcoKTtcblx0XHRcdFx0aWYgKHNlZW5VcmlzLmhhcyh1cmlTdHIpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcnVsZSA9IGZpbmRGaWxlUGF0aFJ1bGUodXJpLnBhdGgsIGJ5RmlsZVBhdGgpO1xuXHRcdFx0XHRpZiAocnVsZSkge1xuXHRcdFx0XHRcdHNlZW5VcmlzLmFkZCh1cmlTdHIpO1xuXHRcdFx0XHRcdGFydGlmYWN0cy5wdXNoKHtcblx0XHRcdFx0XHRcdGxhYmVsOiBiYXNlbmFtZSh1cmkpLFxuXHRcdFx0XHRcdFx0dXJpOiB1cmlTdHIsXG5cdFx0XHRcdFx0XHR0eXBlOiAncGxhbicsXG5cdFx0XHRcdFx0XHRncm91cE5hbWU6IHJ1bGUuZ3JvdXBOYW1lLFxuXHRcdFx0XHRcdFx0b25seVNob3dHcm91cDogcnVsZS5vbmx5U2hvd0dyb3VwLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRmlsZSB3cml0ZXM6IGV4dGVybmFsRWRpdCAoZnJvbSBhZ2VudCBob3N0IGZpbGUgZWRpdHMpXG5cdFx0aWYgKHBhcnQua2luZCA9PT0gJ2V4dGVybmFsRWRpdCcpIHtcblx0XHRcdGNvbnN0IHVyaSA9IHBhcnQudXJpO1xuXHRcdFx0Y29uc3QgdXJpU3RyID0gdXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRpZiAoc2VlblVyaXMuaGFzKHVyaVN0cikpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBydWxlID0gZmluZEZpbGVQYXRoUnVsZSh1cmkucGF0aCwgYnlGaWxlUGF0aCk7XG5cdFx0XHRpZiAocnVsZSkge1xuXHRcdFx0XHRzZWVuVXJpcy5hZGQodXJpU3RyKTtcblx0XHRcdFx0YXJ0aWZhY3RzLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBiYXNlbmFtZSh1cmkpLFxuXHRcdFx0XHRcdHVyaTogdXJpU3RyLFxuXHRcdFx0XHRcdHR5cGU6ICdwbGFuJyxcblx0XHRcdFx0XHRncm91cE5hbWU6IHJ1bGUuZ3JvdXBOYW1lLFxuXHRcdFx0XHRcdG9ubHlTaG93R3JvdXA6IHJ1bGUub25seVNob3dHcm91cCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTWVtb3J5IHRvb2wgaW52b2NhdGlvbnNcblx0XHRpZiAoKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSAmJiBwYXJ0LnRvb2xJZCA9PT0gTUVNT1JZX1RPT0xfSUQpIHtcblx0XHRcdGNvbnN0IHBhcmFtcyA9IElDaGF0VG9vbEludm9jYXRpb24uZ2V0UGFyYW1ldGVycyhwYXJ0KTtcblx0XHRcdGNvbnN0IG1lbW9yeVBhdGggPSBnZXRNZW1vcnlQYXRoRnJvbVBhcmFtcyhwYXJhbXMpO1xuXHRcdFx0aWYgKG1lbW9yeVBhdGggJiYgaXNNZW1vcnlXcml0ZUNvbW1hbmQocGFyYW1zKSkge1xuXHRcdFx0XHRjb25zdCBydWxlID0gZmluZEZpbGVQYXRoUnVsZShtZW1vcnlQYXRoLCBieU1lbW9yeUZpbGVQYXRoKTtcblx0XHRcdFx0aWYgKHJ1bGUpIHtcblx0XHRcdFx0XHRjb25zdCBrZXkgPSBgbWVtb3J5OiR7cGFydC50b29sQ2FsbElkfToke21lbW9yeVBhdGh9YDtcblx0XHRcdFx0XHRpZiAoIXNlZW5VcmlzLmhhcyhrZXkpKSB7XG5cdFx0XHRcdFx0XHRzZWVuVXJpcy5hZGQoa2V5KTtcblx0XHRcdFx0XHRcdGFydGlmYWN0cy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6IHBhdGhCYXNlbmFtZShtZW1vcnlQYXRoKSxcblx0XHRcdFx0XHRcdFx0dXJpOiBDaGF0TWVtb3J5RmlsZVJlc291cmNlLmNyZWF0ZVVyaShtZW1vcnlQYXRoLCBzZXNzaW9uUmVzb3VyY2UpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdwbGFuJyxcblx0XHRcdFx0XHRcdFx0Z3JvdXBOYW1lOiBydWxlLmdyb3VwTmFtZSxcblx0XHRcdFx0XHRcdFx0b25seVNob3dHcm91cDogcnVsZS5vbmx5U2hvd0dyb3VwLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSW1hZ2UgcmVzdWx0cyBmcm9tIHRvb2wgaW52b2NhdGlvbnNcblx0XHRpZiAocGFydC5raW5kID09PSAndG9vbEludm9jYXRpb24nIHx8IHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpIHtcblx0XHRcdGNvbnN0IGRldGFpbHMgPSBJQ2hhdFRvb2xJbnZvY2F0aW9uLnJlc3VsdERldGFpbHMocGFydCk7XG5cdFx0XHRpZiAoIWRldGFpbHMpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElUb29sUmVzdWx0SW5wdXRPdXRwdXREZXRhaWxzIFx1MjAxNCBoYXMgb3V0cHV0IGFycmF5IHdpdGggZW1iZWRkZWQgZGF0YSBwYXJ0c1xuXHRcdFx0aWYgKGlzVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscyhkZXRhaWxzKSkge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGRldGFpbHMub3V0cHV0Lmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3Qgb3V0cHV0UGFydCA9IGRldGFpbHMub3V0cHV0W2ldO1xuXHRcdFx0XHRcdGlmIChvdXRwdXRQYXJ0LnR5cGUgPT09ICdlbWJlZCcgJiYgIW91dHB1dFBhcnQuaXNUZXh0ICYmIG91dHB1dFBhcnQubWltZVR5cGUpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHJ1bGUgPSBmaW5kTWltZVR5cGVSdWxlKG91dHB1dFBhcnQubWltZVR5cGUsIGJ5TWltZVR5cGUpO1xuXHRcdFx0XHRcdFx0aWYgKHJ1bGUpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qga2V5ID0gYCR7cGFydC50b29sQ2FsbElkfToke2l9YDtcblx0XHRcdFx0XHRcdFx0aWYgKCFzZWVuVXJpcy5oYXMoa2V5KSkge1xuXHRcdFx0XHRcdFx0XHRcdHNlZW5VcmlzLmFkZChrZXkpO1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGV4dCA9IGdldEV4dGVuc2lvbkZvck1pbWVUeXBlKG91dHB1dFBhcnQubWltZVR5cGUpO1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHBlcm1hbGlua0Jhc2VuYW1lID0gZXh0ID8gYGZpbGUke2V4dH1gIDogJ2ZpbGUuYmluJztcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBhcnRpZmFjdFVyaSA9IENoYXRSZXNwb25zZVJlc291cmNlLmNyZWF0ZVVyaShzZXNzaW9uUmVzb3VyY2UsIHBhcnQudG9vbENhbGxJZCwgaSwgcGVybWFsaW5rQmFzZW5hbWUpO1xuXHRcdFx0XHRcdFx0XHRcdGFydGlmYWN0cy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBvdXRwdXRQYXJ0LnVyaT8ucGF0aC5zcGxpdCgnLycpLnBvcCgpID8/IGAke3J1bGUuZ3JvdXBOYW1lfSAke2kgKyAxfWAsXG5cdFx0XHRcdFx0XHRcdFx0XHR1cmk6IGFydGlmYWN0VXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRcdFx0XHR0b29sQ2FsbElkOiBwYXJ0LnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0XHRcdFx0XHRkYXRhUGFydEluZGV4OiBpLFxuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3NjcmVlbnNob3QnLFxuXHRcdFx0XHRcdFx0XHRcdFx0Z3JvdXBOYW1lOiBydWxlLmdyb3VwTmFtZSxcblx0XHRcdFx0XHRcdFx0XHRcdG9ubHlTaG93R3JvdXA6IHJ1bGUub25seVNob3dHcm91cCxcblx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJVG9vbFJlc3VsdE91dHB1dERldGFpbHNTZXJpYWxpemVkIFx1MjAxNCBzaW5nbGUgb3V0cHV0IHdpdGggbWltZVR5cGUgKyBiYXNlNjREYXRhXG5cdFx0XHRpZiAoaXNUb29sUmVzdWx0T3V0cHV0RGV0YWlsc1NlcmlhbGl6ZWQoZGV0YWlscykpIHtcblx0XHRcdFx0Y29uc3QgcnVsZSA9IGZpbmRNaW1lVHlwZVJ1bGUoZGV0YWlscy5vdXRwdXQubWltZVR5cGUsIGJ5TWltZVR5cGUpO1xuXHRcdFx0XHRpZiAocnVsZSkge1xuXHRcdFx0XHRcdGNvbnN0IGtleSA9IGAke3BhcnQudG9vbENhbGxJZH06MGA7XG5cdFx0XHRcdFx0aWYgKCFzZWVuVXJpcy5oYXMoa2V5KSkge1xuXHRcdFx0XHRcdFx0c2VlblVyaXMuYWRkKGtleSk7XG5cdFx0XHRcdFx0XHRjb25zdCBleHQgPSBnZXRFeHRlbnNpb25Gb3JNaW1lVHlwZShkZXRhaWxzLm91dHB1dC5taW1lVHlwZSk7XG5cdFx0XHRcdFx0XHRjb25zdCBwZXJtYWxpbmtCYXNlbmFtZSA9IGV4dCA/IGBmaWxlJHtleHR9YCA6ICdmaWxlLmJpbic7XG5cdFx0XHRcdFx0XHRjb25zdCBhcnRpZmFjdFVyaSA9IENoYXRSZXNwb25zZVJlc291cmNlLmNyZWF0ZVVyaShzZXNzaW9uUmVzb3VyY2UsIHBhcnQudG9vbENhbGxJZCwgMCwgcGVybWFsaW5rQmFzZW5hbWUpO1xuXHRcdFx0XHRcdFx0YXJ0aWZhY3RzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogYCR7cnVsZS5ncm91cE5hbWV9YCxcblx0XHRcdFx0XHRcdFx0dXJpOiBhcnRpZmFjdFVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0XHR0b29sQ2FsbElkOiBwYXJ0LnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0XHRcdGRhdGFQYXJ0SW5kZXg6IDAsXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzY3JlZW5zaG90Jyxcblx0XHRcdFx0XHRcdFx0Z3JvdXBOYW1lOiBydWxlLmdyb3VwTmFtZSxcblx0XHRcdFx0XHRcdFx0b25seVNob3dHcm91cDogcnVsZS5vbmx5U2hvd0dyb3VwLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGFydGlmYWN0cztcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsU0FBUyxpQkFBaUI7QUFDbkMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxZQUFZLG9CQUFvQjtBQUN6QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIs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
