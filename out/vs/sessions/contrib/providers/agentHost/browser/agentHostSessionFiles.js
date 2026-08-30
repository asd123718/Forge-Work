import { constObservable, derivedOpts, mapObservableArrayCached } from "../../../../../base/common/observable.js";
import { compare as strCompare } from "../../../../../base/common/strings.js";
import { getComparisonKey, isEqual, isEqualOrParent } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { normalizeFileEdit } from "../../../../../platform/agentHost/common/fileEditDiff.js";
import {
  buildDefaultChatUri,
  FileEditKind,
  ResponsePartKind,
  StateComponents,
  ToolCallStatus,
  ToolResultContentType
} from "../../../../../platform/agentHost/common/state/sessionState.js";
import { SessionFileOperation, sessionTurnFileChangesEqual } from "../../../../services/sessions/common/session.js";
import { createActiveSessionSubscriptionObs } from "./agentHostSessionChangesets.js";
function createSessionOutputObs(sessionUri, options, isActiveSessionObs, isArchivedObs, workspaceObs, cache) {
  const mapDiffUri = options.mapDiffUri;
  const enabledObs = derivedOpts({ equalsFn: (a, b) => a === b }, (reader) => isActiveSessionObs.read(reader) && !isArchivedObs.read(reader));
  const sessionStateObs = createActiveSessionSubscriptionObs(
    options,
    enabledObs,
    StateComponents.Session,
    constObservable(sessionUri)
  );
  const chatUrisObs = derivedOpts({ equalsFn: (a, b) => a.length === b.length && a.every((u, i) => isEqual(u, b[i])) }, (reader) => {
    if (!enabledObs.read(reader)) {
      return [];
    }
    const sessionState = sessionStateObs.read(reader).read(reader);
    const defaultChatUri = URI.parse(buildDefaultChatUri(sessionUri));
    if (!sessionState || sessionState instanceof Error) {
      return [defaultChatUri];
    }
    const uris = /* @__PURE__ */ new Map();
    uris.set(defaultChatUri.toString(), defaultChatUri);
    for (const chat of sessionState.chats) {
      const uri = URI.parse(chat.resource);
      uris.set(uri.toString(), uri);
    }
    return [...uris.values()];
  });
  const editsPerChatObs = mapObservableArrayCached(void 0, chatUrisObs, (chatUri) => {
    const chatStateObs = createActiveSessionSubscriptionObs(
      options,
      enabledObs,
      StateComponents.Chat,
      constObservable(chatUri)
    );
    const parse = createIncrementalChatFileEditsParser(mapDiffUri);
    return {
      chatUri,
      edits: derivedOpts({ equalsFn: chatFileEditsEqual }, (reader) => {
        const chatState = chatStateObs.read(reader).read(reader);
        if (!chatState || chatState instanceof Error) {
          return { allEdits: [], lastTurnEdits: [] };
        }
        return parse(chatState);
      })
    };
  }, (chatUri) => chatUri.toString());
  const externalFiles = derivedOpts({ equalsFn: sessionFilesEqual }, (reader) => {
    const workspace = workspaceObs.read(reader);
    const folderRoots = (workspace?.folders ?? []).map((f) => f.workingDirectory);
    const allEdits = [];
    for (const chatEdits of editsPerChatObs.read(reader)) {
      allEdits.push(...chatEdits.edits.read(reader).allEdits);
    }
    return reduceSessionFiles(allEdits, folderRoots);
  });
  const getLastTurnChanges = (chatUri) => derivedOpts({ equalsFn: sessionTurnFileChangesEqual }, (reader) => {
    const folderRoots = getWorkspaceAndWorktreeRoots(workspaceObs.read(reader));
    const chatEdits = editsPerChatObs.read(reader).find((entry) => isEqual(entry.chatUri, chatUri));
    if (chatEdits) {
      return reduceTurnChanges(chatEdits.edits.read(reader).lastTurnEdits, folderRoots, cache);
    }
    return [];
  });
  return { externalFiles, getLastTurnChanges };
}
function pushUniqueRoot(roots, root) {
  if (root && !roots.some((existing) => isEqual(existing, root))) {
    roots.push(root);
  }
}
function getWorkspaceAndWorktreeRoots(workspace) {
  const roots = [];
  for (const folder of workspace?.folders ?? []) {
    pushUniqueRoot(roots, folder.root);
    pushUniqueRoot(roots, folder.workingDirectory);
    pushUniqueRoot(roots, folder.gitRepository?.workTreeUri);
  }
  return roots;
}
function createIncrementalChatFileEditsParser(mapDiffUri, parseTurn = (responseParts) => parseResponseParts(responseParts, mapDiffUri)) {
  const completedTurnCache = /* @__PURE__ */ new Map();
  return (chatState) => {
    const allEdits = [];
    const turns = chatState.turns ?? [];
    const completedIds = new Set(turns.map((t) => t.id));
    for (const id of completedTurnCache.keys()) {
      if (!completedIds.has(id)) {
        completedTurnCache.delete(id);
      }
    }
    for (const turn of turns) {
      let parsed = completedTurnCache.get(turn.id);
      if (!parsed) {
        parsed = parseTurn(turn.responseParts);
        completedTurnCache.set(turn.id, parsed);
      }
      if (parsed.length > 0) {
        allEdits.push(...parsed);
      }
    }
    let lastTurnEdits;
    if (chatState.activeTurn) {
      lastTurnEdits = parseTurn(chatState.activeTurn.responseParts);
      allEdits.push(...lastTurnEdits);
    } else if (turns.length > 0) {
      lastTurnEdits = completedTurnCache.get(turns[turns.length - 1].id) ?? [];
    } else {
      lastTurnEdits = [];
    }
    return { allEdits, lastTurnEdits };
  };
}
function parseResponseParts(responseParts, mapDiffUri) {
  const out = [];
  for (const part of responseParts) {
    if (part.kind !== ResponsePartKind.ToolCall) {
      continue;
    }
    for (const fileEdit of getToolCallFileEdits(part.toolCall)) {
      const parsed = parseFileEdit(fileEdit, mapDiffUri);
      if (parsed) {
        out.push(parsed);
      }
    }
  }
  return out;
}
function getToolCallFileEdits(toolCall) {
  const edits = [];
  if (toolCall.status === ToolCallStatus.Running || toolCall.status === ToolCallStatus.Completed || toolCall.status === ToolCallStatus.PendingResultConfirmation) {
    for (const c of toolCall.content ?? []) {
      if (c.type === ToolResultContentType.FileEdit) {
        edits.push(c);
      }
    }
  } else if (toolCall.status === ToolCallStatus.PendingConfirmation) {
    edits.push(...toolCall.edits?.items ?? []);
  }
  return edits;
}
function parseFileEdit(fileEdit, mapDiffUri) {
  const normalized = normalizeFileEdit(fileEdit);
  if (!normalized) {
    return void 0;
  }
  const map = (uri) => uri ? mapDiffUri ? mapDiffUri(uri) : uri : void 0;
  return {
    kind: normalized.kind,
    afterUri: map(normalized.afterUri),
    beforeUri: map(normalized.beforeUri),
    beforeContentUri: map(normalized.beforeContentUri),
    afterContentUri: map(normalized.afterContentUri),
    insertions: fileEdit.diff?.added ?? 0,
    deletions: fileEdit.diff?.removed ?? 0
  };
}
function reduceSessionFiles(edits, folderRoots) {
  const byUri = /* @__PURE__ */ new Map();
  const isOutsideWorkspace = (uri) => !folderRoots.some((root) => isEqualOrParent(uri, root));
  const setCreated = (uri) => {
    if (!isOutsideWorkspace(uri)) {
      return;
    }
    byUri.set(getComparisonKey(uri), { uri, file: { operation: SessionFileOperation.Created } });
  };
  const setModified = (uri, originalUri) => {
    if (!isOutsideWorkspace(uri)) {
      return;
    }
    const existing = byUri.get(getComparisonKey(uri));
    if (existing?.file.operation === SessionFileOperation.Created) {
      return;
    }
    if (existing?.file.operation === SessionFileOperation.Modified) {
      existing.file.originalUri = existing.file.originalUri ?? originalUri;
      return;
    }
    byUri.set(getComparisonKey(uri), { uri, file: { operation: SessionFileOperation.Modified, originalUri } });
  };
  const removeFile = (uri) => {
    byUri.delete(getComparisonKey(uri));
  };
  for (const edit of edits) {
    switch (edit.kind) {
      case FileEditKind.Create:
        if (edit.afterUri) {
          setCreated(edit.afterUri);
        }
        break;
      case FileEditKind.Edit:
        if (edit.afterUri) {
          setModified(edit.afterUri, edit.beforeContentUri);
        }
        break;
      case FileEditKind.Delete:
        if (edit.beforeUri) {
          removeFile(edit.beforeUri);
        }
        break;
      case FileEditKind.Rename:
        if (edit.beforeUri) {
          removeFile(edit.beforeUri);
        }
        if (edit.afterUri) {
          setCreated(edit.afterUri);
        }
        break;
    }
  }
  const files = [...byUri.values()].map(({ uri, file }) => ({
    uri,
    operation: file.operation,
    originalUri: file.originalUri
  }));
  files.sort((a, b) => strCompare(getComparisonKey(a.uri), getComparisonKey(b.uri)));
  return files;
}
function reduceTurnChanges(edits, folderRoots = [], cache) {
  const byUri = /* @__PURE__ */ new Map();
  const isOutsideWorkspace = (resource) => {
    const cacheKey = `isOutsideWorkspace:${resource.toString()}`;
    const cached = cache?.get(cacheKey);
    if (typeof cached === "boolean") {
      return cached;
    }
    const result = !folderRoots.some((root) => isEqualOrParent(resource, root));
    cache?.set(cacheKey, result);
    return result;
  };
  const setCreated = (uri, modifiedSnapshotUri, insertions, deletions) => {
    const key = getComparisonKey(uri);
    const existing = byUri.get(key);
    if (existing) {
      existing.created = true;
      existing.modifiedUri = uri;
      existing.modifiedSnapshotUri = modifiedSnapshotUri;
      existing.originalUri = void 0;
      existing.insertions += insertions;
      existing.deletions += deletions;
      return;
    }
    byUri.set(key, { uri, modifiedUri: uri, modifiedSnapshotUri, originalUri: void 0, isOutsideWorkspace: isOutsideWorkspace(uri), created: true, insertions, deletions });
  };
  const setModified = (uri, originalUri, modifiedSnapshotUri, insertions, deletions) => {
    const key = getComparisonKey(uri);
    const existing = byUri.get(key);
    if (existing) {
      existing.insertions += insertions;
      existing.deletions += deletions;
      existing.modifiedSnapshotUri = modifiedSnapshotUri;
      if (!existing.created) {
        existing.originalUri = existing.originalUri ?? originalUri;
      }
      return;
    }
    byUri.set(key, { uri, modifiedUri: uri, modifiedSnapshotUri, originalUri, isOutsideWorkspace: isOutsideWorkspace(uri), created: false, insertions, deletions });
  };
  const setDeleted = (uri, originalUri, modifiedSnapshotUri, insertions, deletions) => {
    const key = getComparisonKey(uri);
    if (byUri.has(key)) {
      byUri.delete(key);
      return;
    }
    byUri.set(key, { uri, modifiedUri: void 0, modifiedSnapshotUri, originalUri, isOutsideWorkspace: isOutsideWorkspace(uri), created: false, insertions, deletions });
  };
  for (const edit of edits) {
    switch (edit.kind) {
      case FileEditKind.Create:
        if (edit.afterUri) {
          setCreated(edit.afterUri, edit.afterContentUri, edit.insertions, edit.deletions);
        }
        break;
      case FileEditKind.Edit:
        if (edit.afterUri) {
          setModified(edit.afterUri, edit.beforeContentUri, edit.afterContentUri, edit.insertions, edit.deletions);
        }
        break;
      case FileEditKind.Delete:
        if (edit.beforeUri) {
          setDeleted(edit.beforeUri, edit.beforeContentUri, edit.afterContentUri, edit.insertions, edit.deletions);
        }
        break;
      case FileEditKind.Rename:
        if (edit.beforeUri) {
          byUri.delete(getComparisonKey(edit.beforeUri));
        }
        if (edit.afterUri) {
          setModified(edit.afterUri, edit.beforeContentUri, edit.afterContentUri, edit.insertions, edit.deletions);
        }
        break;
    }
  }
  return [...byUri.values()].map((c) => ({
    uri: c.uri,
    modifiedUri: c.modifiedUri,
    modifiedSnapshotUri: c.modifiedSnapshotUri,
    originalUri: c.originalUri,
    isOutsideWorkspace: c.isOutsideWorkspace,
    insertions: c.insertions,
    deletions: c.deletions
  }));
}
function sessionFilesEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i].operation !== b[i].operation || !isEqual(a[i].uri, b[i].uri) || !isEqual(a[i].originalUri, b[i].originalUri)) {
      return false;
    }
  }
  return true;
}
function parsedFileEditsEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i].kind !== b[i].kind || a[i].insertions !== b[i].insertions || a[i].deletions !== b[i].deletions || !isEqual(a[i].afterUri, b[i].afterUri) || !isEqual(a[i].beforeUri, b[i].beforeUri) || !isEqual(a[i].beforeContentUri, b[i].beforeContentUri) || !isEqual(a[i].afterContentUri, b[i].afterContentUri)) {
      return false;
    }
  }
  return true;
}
function chatFileEditsEqual(a, b) {
  return parsedFileEditsEqual(a.allEdits, b.allEdits) && parsedFileEditsEqual(a.lastTurnEdits, b.lastTurnEdits);
}
export {
  createIncrementalChatFileEditsParser,
  createSessionOutputObs,
  parseResponseParts,
  reduceSessionFiles,
  reduceTurnChanges
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxhZ2VudEhvc3RcXGJyb3dzZXJcXGFnZW50SG9zdFNlc3Npb25GaWxlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgZGVyaXZlZE9wdHMsIElPYnNlcnZhYmxlLCBtYXBPYnNlcnZhYmxlQXJyYXlDYWNoZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGNvbXBhcmUgYXMgc3RyQ29tcGFyZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgZ2V0Q29tcGFyaXNvbktleSwgaXNFcXVhbCwgaXNFcXVhbE9yUGFyZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBub3JtYWxpemVGaWxlRWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vZmlsZUVkaXREaWZmLmpzJztcbmltcG9ydCB0eXBlIHsgRmlsZUVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7XG5cdGJ1aWxkRGVmYXVsdENoYXRVcmksXG5cdHR5cGUgQ2hhdFN0YXRlLFxuXHRGaWxlRWRpdEtpbmQsXG5cdFJlc3BvbnNlUGFydEtpbmQsXG5cdHR5cGUgU2Vzc2lvblN0YXRlLFxuXHRTdGF0ZUNvbXBvbmVudHMsXG5cdHR5cGUgVHVybixcblx0dHlwZSBUb29sQ2FsbFN0YXRlLFxuXHRUb29sQ2FsbFN0YXR1cyxcblx0VG9vbFJlc3VsdENvbnRlbnRUeXBlLFxufSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25GaWxlLCBJU2Vzc2lvblR1cm5GaWxlQ2hhbmdlLCBJU2Vzc2lvbldvcmtzcGFjZSwgU2Vzc2lvbkZpbGVPcGVyYXRpb24sIHNlc3Npb25UdXJuRmlsZUNoYW5nZXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IGNyZWF0ZUFjdGl2ZVNlc3Npb25TdWJzY3JpcHRpb25PYnMgfSBmcm9tICcuL2FnZW50SG9zdFNlc3Npb25DaGFuZ2VzZXRzLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RBZGFwdGVyT3B0aW9ucyB9IGZyb20gJy4vYmFzZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuXG4vKipcbiAqIEEgc2luZ2xlIGZpbGUgZWRpdCBlbWl0dGVkIGJ5IGEgdG9vbCBjYWxsLCBkZWNvZGVkIGZyb20gdGhlIHByb3RvY29sIHNvIHRoZVxuICogcmVkdWNlciBjYW4gY2xhc3NpZnkgaXQuIE9yZGVyZWQgc28gY3JlYXRpb25zIHNlZW4gYmVmb3JlIGVkaXRzIGtlZXAgdGhlXG4gKiBcImNyZWF0ZWRcIiBjbGFzc2lmaWNhdGlvbi5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJUGFyc2VkRmlsZUVkaXQge1xuXHRyZWFkb25seSBraW5kOiBGaWxlRWRpdEtpbmQ7XG5cdC8qKiBBZnRlci1zdGF0ZSBVUkkgKGNyZWF0ZS9lZGl0L3JlbmFtZSB0YXJnZXQpLiAqL1xuXHRyZWFkb25seSBhZnRlclVyaT86IFVSSTtcblx0LyoqIEJlZm9yZS1zdGF0ZSBVUkkgKGRlbGV0ZSBzb3VyY2UgLyByZW5hbWUgb3JpZ2luKS4gKi9cblx0cmVhZG9ubHkgYmVmb3JlVXJpPzogVVJJO1xuXHQvKiogQmVmb3JlLWNvbnRlbnQgVVJJLCB1c2VkIHRvIHJlbmRlciBhIGRpZmYgZm9yIG1vZGlmaWVkIGZpbGVzLiAqL1xuXHRyZWFkb25seSBiZWZvcmVDb250ZW50VXJpPzogVVJJO1xuXHQvKiogQWZ0ZXItY29udGVudCBzbmFwc2hvdCBVUkksIHJldmlzZWQgYXMgYW4gaW4tZmxpZ2h0IGVkaXQgc3RyZWFtcy4gKi9cblx0cmVhZG9ubHkgYWZ0ZXJDb250ZW50VXJpPzogVVJJO1xuXHQvKiogTGluZXMgYWRkZWQgYnkgdGhpcyBlZGl0LCBmcm9tIHRoZSBwcm90b2NvbCBkaWZmIG1ldGFkYXRhICgwIHdoZW4gYWJzZW50KS4gKi9cblx0cmVhZG9ubHkgaW5zZXJ0aW9uczogbnVtYmVyO1xuXHQvKiogTGluZXMgcmVtb3ZlZCBieSB0aGlzIGVkaXQsIGZyb20gdGhlIHByb3RvY29sIGRpZmYgbWV0YWRhdGEgKDAgd2hlbiBhYnNlbnQpLiAqL1xuXHRyZWFkb25seSBkZWxldGlvbnM6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBUaGUgb2JzZXJ2YWJsZSBvdXRwdXRzIGRlcml2ZWQgZnJvbSBhbiBhZ2VudC1ob3N0IHNlc3Npb24ncyBsaXZlIG91dHB1dFxuICogc3RyZWFtIChpdHMgY2hhdC1zdGF0ZSB0dXJucykuIEJvdGggYXJlIHBhcnNlZCBmcm9tIHRoZSBzYW1lIHVuZGVybHlpbmdcbiAqIHBlci1jaGF0IHN1YnNjcmlwdGlvbnMgc28gdGhlIHN0cmVhbSBpcyBvbmx5IHdhbGtlZCBvbmNlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uT3V0cHV0T2JzIHtcblx0LyoqXG5cdCAqIEZpbGVzIGNyZWF0ZWQsIGVkaXRlZCBvciBkZWxldGVkICoqb3V0c2lkZSoqIHRoZSBzZXNzaW9uIHdvcmtzcGFjZSBmb2xkZXJzXG5cdCAqIGR1cmluZyB0aGUgc2Vzc2lvbiAoZS5nLiBjb25maWcgZmlsZXMgaW4gdGhlIHVzZXIncyBob21lIGRpcmVjdG9yeSksXG5cdCAqIHJlZHVjZWQgYWNyb3NzIGV2ZXJ5IGNoYXQgYW5kIHR1cm4uXG5cdCAqL1xuXHRyZWFkb25seSBleHRlcm5hbEZpbGVzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVbXT47XG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBmaWxlIGNoYW5nZXMgcHJvZHVjZWQgYnkgYSBzcGVjaWZpYyBjaGF0J3MgKipsYXN0IHR1cm4qKiBvbmx5LFxuXHQgKiBrZXllZCBieSB0aGF0IGNoYXQncyBBSFAgY2hhdCBVUkkgKHRoZSBkZWZhdWx0IGNoYXQnc1xuXHQgKiB7QGxpbmsgYnVpbGREZWZhdWx0Q2hhdFVyaX0sIG9yIGEgcGVlciBjaGF0J3MgcHJvdG9jb2wgcmVzb3VyY2UpLiBSZWR1Y2VzXG5cdCAqIHRoYXQgY2hhdCdzIGxhc3QtdHVybiBlZGl0cyBpbnRvIHBlci1maWxlIHtAbGluayBJU2Vzc2lvblR1cm5GaWxlQ2hhbmdlIHxcblx0ICogY2hhbmdlc30gKHdpdGggZGlmZiBzdGF0cyBhbmQgb3duaW5nLXdvcmtzcGFjZSBjbGFzc2lmaWNhdGlvbikuXG5cdCAqIFVzZWQgYnkgdGhlIGNoYXQgaW5wdXQgc3RhdHVzIHBpbGxzIHRvIHJlZmxlY3QganVzdCB3aGF0IHRoZSBjaGF0J3MgbW9zdFxuXHQgKiByZWNlbnQgcmVxdWVzdCBwcm9kdWNlZC5cblx0ICovXG5cdGdldExhc3RUdXJuQ2hhbmdlcyhjaGF0VXJpOiBVUkkpOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvblR1cm5GaWxlQ2hhbmdlW10+O1xufVxuXG4vKipcbiAqIEJ1aWxkcyB0aGUgb2JzZXJ2YWJsZSBvdXRwdXRzIGRlcml2ZWQgZnJvbSBhIHNlc3Npb24ncyBsaXZlIG91dHB1dCBzdHJlYW0uXG4gKlxuICogVGhlIGRhdGEgaXMgcGFyc2VkIGZyb20gdGhlIGFnZW50LWhvc3QgY2hhdC1zdGF0ZSB0dXJuczogZWFjaCB0dXJuJ3MgcmVzcG9uc2VcbiAqIHBhcnRzIGFyZSBzY2FubmVkIGZvciB0b29sIGNhbGxzLCBhbmQgZWFjaCB0b29sIGNhbGwncyBmaWxlLWVkaXQgcmVzdWx0cyAoYW5kXG4gKiBwZW5kaW5nIGVkaXRzKSBhcmUgY29sbGVjdGVkLiBUd28gdmlld3MgYXJlIHByb2R1Y2VkIGZyb20gdGhlIHNhbWUgcGFyc2U6XG4gKlxuICogLSB7QGxpbmsgSVNlc3Npb25PdXRwdXRPYnMuZXh0ZXJuYWxGaWxlc306IGVkaXRzIHJlZHVjZWQgcGVyIGZpbGUgYWNyb3NzIGFsbFxuICogICBjaGF0cy90dXJucyBzbyB0aGF0IGEgZmlsZSBmaXJzdCBjcmVhdGVkIGFuZCB0aGVuIGVkaXRlZCBpcyByZXBvcnRlZCBhc1xuICogICB7QGxpbmsgU2Vzc2lvbkZpbGVPcGVyYXRpb24uQ3JlYXRlZH0gd2hpbGUgYSBkZWxldGVkIGZpbGUgaXMgcmVtb3ZlZDsgb25seVxuICogICBmaWxlcyBvdXRzaWRlIHRoZSB3b3Jrc3BhY2UgZm9sZGVycyBhcmUga2VwdC5cbiAqIC0ge0BsaW5rIElTZXNzaW9uT3V0cHV0T2JzLmdldExhc3RUdXJuQ2hhbmdlc306IGdpdmVuIGEgY2hhdCdzIEFIUCBVUkksIHRoYXRcbiAqICAgY2hhdCdzIGxhc3QgdHVybidzIGVkaXRzIHJlZHVjZWQgcGVyIGZpbGUgaW50b1xuICogICB7QGxpbmsgSVNlc3Npb25UdXJuRmlsZUNoYW5nZSB8IGNoYW5nZXN9IHdpdGggZGlmZiBzdGF0cyBhbmQgY2xhc3NpZmljYXRpb25cbiAqICAgYWdhaW5zdCB0aGUgc2Vzc2lvbiB3b3Jrc3BhY2Uvd29ya3RyZWUgcm9vdHMuXG4gKiBDb21wdXRhdGlvbiBvbmx5IGhhcHBlbnMgZm9yIHRoZSBhY3RpdmUsIG5vbi1hcmNoaXZlZCBzZXNzaW9uOiBhcmNoaXZlZFxuICogc2Vzc2lvbnMgbmV2ZXIgb3BlbiBhIGxpdmUgY2hhdC1zdGF0ZSBzdWJzY3JpcHRpb24sIHNvIG5vIHBhcnNpbmcgd29yayBpc1xuICogZG9uZSBmb3IgdGhlbS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVNlc3Npb25PdXRwdXRPYnMoXG5cdHNlc3Npb25Vcmk6IFVSSSxcblx0b3B0aW9uczogSUFnZW50SG9zdEFkYXB0ZXJPcHRpb25zLFxuXHRpc0FjdGl2ZVNlc3Npb25PYnM6IElPYnNlcnZhYmxlPGJvb2xlYW4+LFxuXHRpc0FyY2hpdmVkT2JzOiBJT2JzZXJ2YWJsZTxib29sZWFuPixcblx0d29ya3NwYWNlT2JzOiBJT2JzZXJ2YWJsZTxJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZD4sXG5cdGNhY2hlOiBNYXA8c3RyaW5nLCB1bmtub3duPixcbik6IElTZXNzaW9uT3V0cHV0T2JzIHtcblx0Y29uc3QgbWFwRGlmZlVyaSA9IG9wdGlvbnMubWFwRGlmZlVyaTtcblxuXHQvLyBTZXNzaW9uIG91dHB1dCBpcyBvbmx5IGNvbXB1dGVkIGZvciB0aGUgYWN0aXZlLCBub24tYXJjaGl2ZWQgc2Vzc2lvbi4gVGhlXG5cdC8vIHN1YnNjcmlwdGlvbnMgYW5kIHBhcnNpbmcgYmVsb3cgYXJlIGFsbCBnYXRlZCBvbiB0aGlzIHNvIGFuIGFyY2hpdmVkXG5cdC8vIHNlc3Npb24gZG9lcyBubyB3b3JrLlxuXHRjb25zdCBlbmFibGVkT2JzID0gZGVyaXZlZE9wdHM8Ym9vbGVhbj4oeyBlcXVhbHNGbjogKGEsIGIpID0+IGEgPT09IGIgfSwgcmVhZGVyID0+XG5cdFx0aXNBY3RpdmVTZXNzaW9uT2JzLnJlYWQocmVhZGVyKSAmJiAhaXNBcmNoaXZlZE9icy5yZWFkKHJlYWRlcikpO1xuXG5cdC8vIFN1YnNjcmliZSB0byB0aGUgc2Vzc2lvbiB0byBkaXNjb3ZlciBpdHMgY2hhdHMuXG5cdGNvbnN0IHNlc3Npb25TdGF0ZU9icyA9IGNyZWF0ZUFjdGl2ZVNlc3Npb25TdWJzY3JpcHRpb25PYnM8U2Vzc2lvblN0YXRlPihcblx0XHRvcHRpb25zLFxuXHRcdGVuYWJsZWRPYnMsXG5cdFx0U3RhdGVDb21wb25lbnRzLlNlc3Npb24sXG5cdFx0Y29uc3RPYnNlcnZhYmxlKHNlc3Npb25VcmkpLFxuXHQpO1xuXG5cdC8vIEFsbCBjaGF0IFVSSXMgaW4gdGhlIHNlc3Npb24gKGRlZmF1bHQgY2hhdCArIGFueSBwZWVyIGNoYXRzKS4gRmlsZSBlZGl0c1xuXHQvLyBjYW4gYmUgcHJvZHVjZWQgYnkgYW55IGNoYXQsIHNvIHdlIHVuaW9uIGVkaXRzIGFjcm9zcyBhbGwgb2YgdGhlbS5cblx0Y29uc3QgY2hhdFVyaXNPYnMgPSBkZXJpdmVkT3B0czxyZWFkb25seSBVUklbXT4oeyBlcXVhbHNGbjogKGEsIGIpID0+IGEubGVuZ3RoID09PSBiLmxlbmd0aCAmJiBhLmV2ZXJ5KCh1LCBpKSA9PiBpc0VxdWFsKHUsIGJbaV0pKSB9LCByZWFkZXIgPT4ge1xuXHRcdGlmICghZW5hYmxlZE9icy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvblN0YXRlID0gc2Vzc2lvblN0YXRlT2JzLnJlYWQocmVhZGVyKS5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgZGVmYXVsdENoYXRVcmkgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSk7XG5cdFx0aWYgKCFzZXNzaW9uU3RhdGUgfHwgc2Vzc2lvblN0YXRlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdHJldHVybiBbZGVmYXVsdENoYXRVcmldO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVyaXMgPSBuZXcgTWFwPHN0cmluZywgVVJJPigpO1xuXHRcdHVyaXMuc2V0KGRlZmF1bHRDaGF0VXJpLnRvU3RyaW5nKCksIGRlZmF1bHRDaGF0VXJpKTtcblx0XHRmb3IgKGNvbnN0IGNoYXQgb2Ygc2Vzc2lvblN0YXRlLmNoYXRzKSB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoY2hhdC5yZXNvdXJjZSk7XG5cdFx0XHR1cmlzLnNldCh1cmkudG9TdHJpbmcoKSwgdXJpKTtcblx0XHR9XG5cdFx0cmV0dXJuIFsuLi51cmlzLnZhbHVlcygpXTtcblx0fSk7XG5cblx0Ly8gT25lIG9ic2VydmFibGUgb2YgcGFyc2VkIGVkaXRzIHBlciBjaGF0LCBzdWJzY3JpYmluZyB0byB0aGF0IGNoYXQncyBzdGF0ZS5cblx0Ly9cblx0Ly8gQ29tcGxldGVkIHR1cm5zIChgY2hhdFN0YXRlLnR1cm5zYCkgYXJlIGltbXV0YWJsZSBvbmNlIGZpbmFsaXplZCwgc28gZWFjaFxuXHQvLyBpcyBwYXJzZWQgZXhhY3RseSBvbmNlIGFuZCBtZW1vaXplZCBieSB0dXJuIGlkIGluIGEgY2xvc3VyZS1zY29wZWQgY2FjaGVcblx0Ly8gdGhhdCBsaXZlcyBmb3IgdGhlIGNoYXQncyBsaWZldGltZS4gT25seSB0aGUgaW4tcHJvZ3Jlc3MgYGFjdGl2ZVR1cm5gIGlzXG5cdC8vIHJlLXBhcnNlZCBvbiBldmVyeSBzdHJlYW1lZCBkZWx0YSwgbWFraW5nIGRlbHRhIHVwZGF0ZXMgTyhhY3RpdmUgdHVybilcblx0Ly8gcmF0aGVyIHRoYW4gTyhhbGwgdHVybnMpLiBUaGUgYGVxdWFsc0ZuYCBlbnN1cmVzIHRoZSBkb3duc3RyZWFtIHJlZHVjZXJzXG5cdC8vIG9ubHkgcmUtcnVuIHdoZW4gdGhlIHBhcnNlZCBlZGl0cyBhY3R1YWxseSBjaGFuZ2UgKGUuZy4gbm90IGZvciBtYXJrZG93blxuXHQvLyBvciByZWFzb25pbmcgZGVsdGFzIHRoYXQgY2Fycnkgbm8gZmlsZSBlZGl0cykuXG5cdGNvbnN0IGVkaXRzUGVyQ2hhdE9icyA9IG1hcE9ic2VydmFibGVBcnJheUNhY2hlZCh1bmRlZmluZWQsIGNoYXRVcmlzT2JzLCAoY2hhdFVyaSkgPT4ge1xuXHRcdGNvbnN0IGNoYXRTdGF0ZU9icyA9IGNyZWF0ZUFjdGl2ZVNlc3Npb25TdWJzY3JpcHRpb25PYnM8Q2hhdFN0YXRlPihcblx0XHRcdG9wdGlvbnMsXG5cdFx0XHRlbmFibGVkT2JzLFxuXHRcdFx0U3RhdGVDb21wb25lbnRzLkNoYXQsXG5cdFx0XHRjb25zdE9ic2VydmFibGUoY2hhdFVyaSksXG5cdFx0KTtcblx0XHRjb25zdCBwYXJzZSA9IGNyZWF0ZUluY3JlbWVudGFsQ2hhdEZpbGVFZGl0c1BhcnNlcihtYXBEaWZmVXJpKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2hhdFVyaSxcblx0XHRcdGVkaXRzOiBkZXJpdmVkT3B0czxJQ2hhdEZpbGVFZGl0cz4oeyBlcXVhbHNGbjogY2hhdEZpbGVFZGl0c0VxdWFsIH0sIHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IGNoYXRTdGF0ZSA9IGNoYXRTdGF0ZU9icy5yZWFkKHJlYWRlcikucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoIWNoYXRTdGF0ZSB8fCBjaGF0U3RhdGUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0XHRcdHJldHVybiB7IGFsbEVkaXRzOiBbXSwgbGFzdFR1cm5FZGl0czogW10gfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcGFyc2UoY2hhdFN0YXRlKTtcblx0XHRcdH0pLFxuXHRcdH07XG5cdH0sIGNoYXRVcmkgPT4gY2hhdFVyaS50b1N0cmluZygpKTtcblxuXHRjb25zdCBleHRlcm5hbEZpbGVzID0gZGVyaXZlZE9wdHM8cmVhZG9ubHkgSVNlc3Npb25GaWxlW10+KHsgZXF1YWxzRm46IHNlc3Npb25GaWxlc0VxdWFsIH0sIHJlYWRlciA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gd29ya3NwYWNlT2JzLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBmb2xkZXJSb290cyA9ICh3b3Jrc3BhY2U/LmZvbGRlcnMgPz8gW10pLm1hcChmID0+IGYud29ya2luZ0RpcmVjdG9yeSk7XG5cblx0XHRjb25zdCBhbGxFZGl0czogSVBhcnNlZEZpbGVFZGl0W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNoYXRFZGl0cyBvZiBlZGl0c1BlckNoYXRPYnMucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRhbGxFZGl0cy5wdXNoKC4uLmNoYXRFZGl0cy5lZGl0cy5yZWFkKHJlYWRlcikuYWxsRWRpdHMpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZWR1Y2VTZXNzaW9uRmlsZXMoYWxsRWRpdHMsIGZvbGRlclJvb3RzKTtcblx0fSk7XG5cblx0Y29uc3QgZ2V0TGFzdFR1cm5DaGFuZ2VzID0gKGNoYXRVcmk6IFVSSSk6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uVHVybkZpbGVDaGFuZ2VbXT4gPT5cblx0XHRkZXJpdmVkT3B0czxyZWFkb25seSBJU2Vzc2lvblR1cm5GaWxlQ2hhbmdlW10+KHsgZXF1YWxzRm46IHNlc3Npb25UdXJuRmlsZUNoYW5nZXNFcXVhbCB9LCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZm9sZGVyUm9vdHMgPSBnZXRXb3Jrc3BhY2VBbmRXb3JrdHJlZVJvb3RzKHdvcmtzcGFjZU9icy5yZWFkKHJlYWRlcikpO1xuXHRcdFx0Y29uc3QgY2hhdEVkaXRzID0gZWRpdHNQZXJDaGF0T2JzLnJlYWQocmVhZGVyKS5maW5kKGVudHJ5ID0+IGlzRXF1YWwoZW50cnkuY2hhdFVyaSwgY2hhdFVyaSkpO1xuXHRcdFx0aWYgKGNoYXRFZGl0cykge1xuXHRcdFx0XHRyZXR1cm4gcmVkdWNlVHVybkNoYW5nZXMoY2hhdEVkaXRzLmVkaXRzLnJlYWQocmVhZGVyKS5sYXN0VHVybkVkaXRzLCBmb2xkZXJSb290cywgY2FjaGUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH0pO1xuXG5cdHJldHVybiB7IGV4dGVybmFsRmlsZXMsIGdldExhc3RUdXJuQ2hhbmdlcyB9O1xufVxuXG4vKipcbiAqIE1pbmltYWwgc2hhcGUgb2YgYSB0dXJuIG5lZWRlZCB0byBwYXJzZSBpdHMgZmlsZSBlZGl0cy4ge0BsaW5rIFR1cm59IGlzXG4gKiBzdHJ1Y3R1cmFsbHkgYXNzaWduYWJsZSB0byB0aGlzLCBzbyBwcm9kdWN0aW9uIHBhc3NlcyBhIHJlYWwgYENoYXRTdGF0ZWBcbiAqIHdoaWxlIHRlc3RzIGNhbiBidWlsZCBsaWdodHdlaWdodCBmaXh0dXJlcy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJRmlsZUVkaXRUdXJuIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgcmVzcG9uc2VQYXJ0czogVHVyblsncmVzcG9uc2VQYXJ0cyddO1xufVxuXG4vKiogQSBjaGF0IHN0YXRlIHJlZHVjZWQgdG8ganVzdCB0aGUgZmllbGRzIG5lZWRlZCB0byBwYXJzZSBpdHMgZmlsZSBlZGl0cy4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVFZGl0Q2hhdFN0YXRlIHtcblx0cmVhZG9ubHkgdHVybnM/OiByZWFkb25seSBJRmlsZUVkaXRUdXJuW107XG5cdHJlYWRvbmx5IGFjdGl2ZVR1cm4/OiB7IHJlYWRvbmx5IHJlc3BvbnNlUGFydHM6IFR1cm5bJ3Jlc3BvbnNlUGFydHMnXSB9O1xufVxuXG4vKiogUGFyc2VzIHRoZSBmaWxlIGVkaXRzIGNvbnRhaW5lZCBpbiBhIHNpbmdsZSB0dXJuJ3MgcmVzcG9uc2UgcGFydHMuICovXG5leHBvcnQgdHlwZSBQYXJzZVR1cm5GaWxlRWRpdHMgPSAocmVzcG9uc2VQYXJ0czogVHVyblsncmVzcG9uc2VQYXJ0cyddKSA9PiByZWFkb25seSBJUGFyc2VkRmlsZUVkaXRbXTtcblxuLyoqXG4gKiBUaGUgZmlsZSBlZGl0cyBwYXJzZWQgZnJvbSBhIGNoYXQncyBvdXRwdXQgc3RyZWFtLCBzcGxpdCBpbnRvIHRoZSBmdWxsIHNldFxuICogKGFjcm9zcyBhbGwgdHVybnMpIGFuZCB0aGUgbGFzdCB0dXJuJ3MgZWRpdHMgYWxvbmUuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRGaWxlRWRpdHMge1xuXHQvKiogQWxsIGZpbGUgZWRpdHMgYWNyb3NzIHRoZSBjaGF0J3MgdHVybnMsIGluIHN0cmVhbSBvcmRlci4gKi9cblx0cmVhZG9ubHkgYWxsRWRpdHM6IHJlYWRvbmx5IElQYXJzZWRGaWxlRWRpdFtdO1xuXHQvKipcblx0ICogRmlsZSBlZGl0cyBvZiB0aGUgY2hhdCdzIGxhc3QgdHVybiBvbmx5IFx1MjAxNCB0aGUgaW4tcHJvZ3Jlc3MgYGFjdGl2ZVR1cm5gIHdoZW5cblx0ICogcHJlc2VudCwgb3RoZXJ3aXNlIHRoZSBtb3N0IHJlY2VudGx5IGNvbXBsZXRlZCB0dXJuLlxuXHQgKi9cblx0cmVhZG9ubHkgbGFzdFR1cm5FZGl0czogcmVhZG9ubHkgSVBhcnNlZEZpbGVFZGl0W107XG59XG5cbmZ1bmN0aW9uIHB1c2hVbmlxdWVSb290KHJvb3RzOiBVUklbXSwgcm9vdDogVVJJIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdGlmIChyb290ICYmICFyb290cy5zb21lKGV4aXN0aW5nID0+IGlzRXF1YWwoZXhpc3RpbmcsIHJvb3QpKSkge1xuXHRcdHJvb3RzLnB1c2gocm9vdCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0V29ya3NwYWNlQW5kV29ya3RyZWVSb290cyh3b3Jrc3BhY2U6IElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkKTogcmVhZG9ubHkgVVJJW10ge1xuXHRjb25zdCByb290czogVVJJW10gPSBbXTtcblx0Zm9yIChjb25zdCBmb2xkZXIgb2Ygd29ya3NwYWNlPy5mb2xkZXJzID8/IFtdKSB7XG5cdFx0cHVzaFVuaXF1ZVJvb3Qocm9vdHMsIGZvbGRlci5yb290KTtcblx0XHRwdXNoVW5pcXVlUm9vdChyb290cywgZm9sZGVyLndvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdHB1c2hVbmlxdWVSb290KHJvb3RzLCBmb2xkZXIuZ2l0UmVwb3NpdG9yeT8ud29ya1RyZWVVcmkpO1xuXHR9XG5cdHJldHVybiByb290cztcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgc3RhdGVmdWwgcGFyc2VyIHRoYXQgdHVybnMgYSBjaGF0IHN0YXRlIGludG8gaXRzIGZpbGUgZWRpdHMsXG4gKiAqKnBhcnNpbmcgZWFjaCBjb21wbGV0ZWQgdHVybiBhdCBtb3N0IG9uY2UqKi5cbiAqXG4gKiBDb21wbGV0ZWQgdHVybnMgKGBjaGF0U3RhdGUudHVybnNgKSBhcmUgaW1tdXRhYmxlIG9uY2UgZmluYWxpemVkLCBzbyBlYWNoIGlzXG4gKiBwYXJzZWQgb25jZSBhbmQgbWVtb2l6ZWQgYnkgdHVybiBpZCBpbiB0aGUgcmV0dXJuZWQgY2xvc3VyZS4gT25seSB0aGVcbiAqIGluLXByb2dyZXNzIGBhY3RpdmVUdXJuYCBpcyByZS1wYXJzZWQgb24gZXZlcnkgY2FsbCwgbWFraW5nIHN0cmVhbWVkLWRlbHRhXG4gKiB1cGRhdGVzIE8oYWN0aXZlIHR1cm4pIHJhdGhlciB0aGFuIE8oYWxsIHR1cm5zKS5cbiAqXG4gKiBSZXR1cm5zIGJvdGggdGhlIGZ1bGwgZWRpdCBsaXN0IChmb3Igc2Vzc2lvbi13aWRlIHJlZHVjdGlvbnMpIGFuZCB0aGUgbGFzdFxuICogdHVybidzIGVkaXRzIGFsb25lIChmb3IgdHVybi1zY29wZWQgcmVkdWN0aW9ucyk7IHRoZSBhY3RpdmUgdHVybiBpcyBwYXJzZWRcbiAqIG9uY2UgYW5kIHJldXNlZCBmb3IgYm90aC5cbiAqXG4gKiBAcGFyYW0gbWFwRGlmZlVyaSBPcHRpb25hbCBVUkkgbWFwcGVyIGFwcGxpZWQgd2hpbGUgcGFyc2luZy5cbiAqIEBwYXJhbSBwYXJzZVR1cm4gUGVyLXR1cm4gcGFyc2UgZnVuY3Rpb24uIERlZmF1bHRzIHRvIHtAbGluayBwYXJzZVJlc3BvbnNlUGFydHN9O1xuICogICBpbmplY3RhYmxlIHNvIHRlc3RzIGNhbiBvYnNlcnZlIGhvdyBvZnRlbiBlYWNoIHR1cm4gaXMgKHJlKXBhcnNlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUluY3JlbWVudGFsQ2hhdEZpbGVFZGl0c1BhcnNlcihcblx0bWFwRGlmZlVyaT86ICh1cmk6IFVSSSkgPT4gVVJJLFxuXHRwYXJzZVR1cm46IFBhcnNlVHVybkZpbGVFZGl0cyA9IHJlc3BvbnNlUGFydHMgPT4gcGFyc2VSZXNwb25zZVBhcnRzKHJlc3BvbnNlUGFydHMsIG1hcERpZmZVcmkpLFxuKTogKGNoYXRTdGF0ZTogSUZpbGVFZGl0Q2hhdFN0YXRlKSA9PiBJQ2hhdEZpbGVFZGl0cyB7XG5cdGNvbnN0IGNvbXBsZXRlZFR1cm5DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCByZWFkb25seSBJUGFyc2VkRmlsZUVkaXRbXT4oKTtcblxuXHRyZXR1cm4gKGNoYXRTdGF0ZTogSUZpbGVFZGl0Q2hhdFN0YXRlKTogSUNoYXRGaWxlRWRpdHMgPT4ge1xuXHRcdGNvbnN0IGFsbEVkaXRzOiBJUGFyc2VkRmlsZUVkaXRbXSA9IFtdO1xuXHRcdGNvbnN0IHR1cm5zOiByZWFkb25seSBJRmlsZUVkaXRUdXJuW10gPSBjaGF0U3RhdGUudHVybnMgPz8gW107XG5cblx0XHQvLyBFdmljdCBjYWNoZSBlbnRyaWVzIGZvciB0dXJucyB0aGF0IGFyZSBubyBsb25nZXIgY29tcGxldGVkIChlLmcuIGEgdHVyblxuXHRcdC8vIHRoYXQgbW92ZWQgYmFjayB0byBgYWN0aXZlVHVybmAsIG9yIGEgZGlzY2FyZGVkIHR1cm4pIHNvIHRoZSBjYWNoZSBjYW4ndFxuXHRcdC8vIGdyb3cgdW5ib3VuZGVkIG9yIHJldHVybiBzdGFsZSBkYXRhLlxuXHRcdGNvbnN0IGNvbXBsZXRlZElkcyA9IG5ldyBTZXQodHVybnMubWFwKHQgPT4gdC5pZCkpO1xuXHRcdGZvciAoY29uc3QgaWQgb2YgY29tcGxldGVkVHVybkNhY2hlLmtleXMoKSkge1xuXHRcdFx0aWYgKCFjb21wbGV0ZWRJZHMuaGFzKGlkKSkge1xuXHRcdFx0XHRjb21wbGV0ZWRUdXJuQ2FjaGUuZGVsZXRlKGlkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHR1cm4gb2YgdHVybnMpIHtcblx0XHRcdGxldCBwYXJzZWQgPSBjb21wbGV0ZWRUdXJuQ2FjaGUuZ2V0KHR1cm4uaWQpO1xuXHRcdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdFx0cGFyc2VkID0gcGFyc2VUdXJuKHR1cm4ucmVzcG9uc2VQYXJ0cyk7XG5cdFx0XHRcdGNvbXBsZXRlZFR1cm5DYWNoZS5zZXQodHVybi5pZCwgcGFyc2VkKTtcblx0XHRcdH1cblx0XHRcdGlmIChwYXJzZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRhbGxFZGl0cy5wdXNoKC4uLnBhcnNlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIGxhc3QgdHVybiBpcyB0aGUgaW4tcHJvZ3Jlc3Mgb25lIHdoZW4gc3RyZWFtaW5nLCBlbHNlIHRoZSBtb3N0XG5cdFx0Ly8gcmVjZW50bHkgY29tcGxldGVkIHR1cm4uIFRoZSBhY3RpdmUgdHVybiBpcyBwYXJzZWQgYSBzaW5nbGUgdGltZSBhbmRcblx0XHQvLyByZXVzZWQgZm9yIGJvdGggYGFsbEVkaXRzYCBhbmQgYGxhc3RUdXJuRWRpdHNgLlxuXHRcdGxldCBsYXN0VHVybkVkaXRzOiByZWFkb25seSBJUGFyc2VkRmlsZUVkaXRbXTtcblx0XHRpZiAoY2hhdFN0YXRlLmFjdGl2ZVR1cm4pIHtcblx0XHRcdGxhc3RUdXJuRWRpdHMgPSBwYXJzZVR1cm4oY2hhdFN0YXRlLmFjdGl2ZVR1cm4ucmVzcG9uc2VQYXJ0cyk7XG5cdFx0XHRhbGxFZGl0cy5wdXNoKC4uLmxhc3RUdXJuRWRpdHMpO1xuXHRcdH0gZWxzZSBpZiAodHVybnMubGVuZ3RoID4gMCkge1xuXHRcdFx0bGFzdFR1cm5FZGl0cyA9IGNvbXBsZXRlZFR1cm5DYWNoZS5nZXQodHVybnNbdHVybnMubGVuZ3RoIC0gMV0uaWQpID8/IFtdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsYXN0VHVybkVkaXRzID0gW107XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgYWxsRWRpdHMsIGxhc3RUdXJuRWRpdHMgfTtcblx0fTtcbn1cblxuLyoqIFBhcnNlcyB0aGUgZmlsZSBlZGl0cyBjb250YWluZWQgaW4gYSB0dXJuJ3MgcmVzcG9uc2UgcGFydHMgKHN0YXRlbGVzcykuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VSZXNwb25zZVBhcnRzKHJlc3BvbnNlUGFydHM6IFR1cm5bJ3Jlc3BvbnNlUGFydHMnXSwgbWFwRGlmZlVyaT86ICh1cmk6IFVSSSkgPT4gVVJJKTogSVBhcnNlZEZpbGVFZGl0W10ge1xuXHRjb25zdCBvdXQ6IElQYXJzZWRGaWxlRWRpdFtdID0gW107XG5cdGZvciAoY29uc3QgcGFydCBvZiByZXNwb25zZVBhcnRzKSB7XG5cdFx0aWYgKHBhcnQua2luZCAhPT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgZmlsZUVkaXQgb2YgZ2V0VG9vbENhbGxGaWxlRWRpdHMocGFydC50b29sQ2FsbCkpIHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlRmlsZUVkaXQoZmlsZUVkaXQsIG1hcERpZmZVcmkpO1xuXHRcdFx0aWYgKHBhcnNlZCkge1xuXHRcdFx0XHRvdXQucHVzaChwYXJzZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gb3V0O1xufVxuXG4vKipcbiAqIGxpZmVjeWNsZSBzdGF0ZTogY29tcGxldGVkL3J1bm5pbmcgcmVzdWx0cyBjYXJyeSB0aGVtIGluIGBjb250ZW50YCwgd2hpbGUgYVxuICogdG9vbCBjYWxsIGF3YWl0aW5nIGNvbmZpcm1hdGlvbiBjYXJyaWVzIHRoZSBwbGFubmVkIGVkaXRzIGluIGBlZGl0cy5pdGVtc2AuXG4gKi9cbmZ1bmN0aW9uIGdldFRvb2xDYWxsRmlsZUVkaXRzKHRvb2xDYWxsOiBUb29sQ2FsbFN0YXRlKTogRmlsZUVkaXRbXSB7XG5cdGNvbnN0IGVkaXRzOiBGaWxlRWRpdFtdID0gW107XG5cblx0Ly8gQ29tcGxldGVkL3J1bm5pbmcgcmVzdWx0cyBjYXJyeSBmaWxlIGVkaXRzIGluIGBjb250ZW50YC4uLlxuXHRpZiAodG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nXG5cdFx0fHwgdG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWRcblx0XHR8fCB0b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdSZXN1bHRDb25maXJtYXRpb24pIHtcblx0XHRmb3IgKGNvbnN0IGMgb2YgdG9vbENhbGwuY29udGVudCA/PyBbXSkge1xuXHRcdFx0aWYgKGMudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLkZpbGVFZGl0KSB7XG5cdFx0XHRcdGVkaXRzLnB1c2goYyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2UgaWYgKHRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbikge1xuXHRcdC8vIC4uLndoaWxlIGEgdG9vbCBjYWxsIGF3YWl0aW5nIGNvbmZpcm1hdGlvbiBjYXJyaWVzIHRoZSBwbGFubmVkIGVkaXRzLlxuXHRcdGVkaXRzLnB1c2goLi4uKHRvb2xDYWxsLmVkaXRzPy5pdGVtcyA/PyBbXSkpO1xuXHR9XG5cblx0cmV0dXJuIGVkaXRzO1xufVxuXG5mdW5jdGlvbiBwYXJzZUZpbGVFZGl0KGZpbGVFZGl0OiBGaWxlRWRpdCwgbWFwRGlmZlVyaT86ICh1cmk6IFVSSSkgPT4gVVJJKTogSVBhcnNlZEZpbGVFZGl0IHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZUZpbGVFZGl0KGZpbGVFZGl0KTtcblx0aWYgKCFub3JtYWxpemVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBtYXAgPSAodXJpOiBVUkkgfCB1bmRlZmluZWQpOiBVUkkgfCB1bmRlZmluZWQgPT4gdXJpID8gKG1hcERpZmZVcmkgPyBtYXBEaWZmVXJpKHVyaSkgOiB1cmkpIDogdW5kZWZpbmVkO1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6IG5vcm1hbGl6ZWQua2luZCxcblx0XHRhZnRlclVyaTogbWFwKG5vcm1hbGl6ZWQuYWZ0ZXJVcmkpLFxuXHRcdGJlZm9yZVVyaTogbWFwKG5vcm1hbGl6ZWQuYmVmb3JlVXJpKSxcblx0XHRiZWZvcmVDb250ZW50VXJpOiBtYXAobm9ybWFsaXplZC5iZWZvcmVDb250ZW50VXJpKSxcblx0XHRhZnRlckNvbnRlbnRVcmk6IG1hcChub3JtYWxpemVkLmFmdGVyQ29udGVudFVyaSksXG5cdFx0aW5zZXJ0aW9uczogZmlsZUVkaXQuZGlmZj8uYWRkZWQgPz8gMCxcblx0XHRkZWxldGlvbnM6IGZpbGVFZGl0LmRpZmY/LnJlbW92ZWQgPz8gMCxcblx0fTtcbn1cblxuaW50ZXJmYWNlIElNdXRhYmxlU2Vzc2lvbkZpbGUge1xuXHRvcGVyYXRpb246IFNlc3Npb25GaWxlT3BlcmF0aW9uO1xuXHRvcmlnaW5hbFVyaT86IFVSSTtcbn1cblxuLyoqXG4gKiBSZWR1Y2VzIGFuIG9yZGVyZWQgbGlzdCBvZiBwYXJzZWQgZmlsZSBlZGl0cyBpbnRvIHRoZSBmaW5hbCBwZXItZmlsZSBzdGF0ZS5cbiAqXG4gKiBSdWxlczpcbiAqIC0gQSBmaWxlIGNyZWF0ZWQgZHVyaW5nIHRoZSBzZXNzaW9uIHN0YXlzIHtAbGluayBTZXNzaW9uRmlsZU9wZXJhdGlvbi5DcmVhdGVkfVxuICogICBldmVuIGlmIGVkaXRlZCBhZnRlcndhcmRzLlxuICogLSBBIGRlbGV0ZWQgZmlsZSBpcyByZW1vdmVkIGZyb20gdGhlIGxpc3QgZW50aXJlbHk6IGEgZmlsZSBjcmVhdGVkIG9yIGVkaXRlZFxuICogICBkdXJpbmcgdGhlIHNlc3Npb24gYW5kIHRoZW4gZGVsZXRlZCBuZXRzIG91dCwgYW5kIGEgcHJlLWV4aXN0aW5nIGZpbGUgdGhhdFxuICogICBpcyBkZWxldGVkIGlzIG5vdCBzdXJmYWNlZC5cbiAqIC0gUmVuYW1lcyBhcmUgbW9kZWxlZCBhcyBhIGRlbGV0ZSBvZiB0aGUgc291cmNlIHBsdXMgYSBjcmVhdGUgb2YgdGhlIHRhcmdldC5cbiAqIC0gT25seSBmaWxlcyBvdXRzaWRlIGV2ZXJ5IHdvcmtzcGFjZSBmb2xkZXIgcm9vdCBhcmUga2VwdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZHVjZVNlc3Npb25GaWxlcyhlZGl0czogcmVhZG9ubHkgSVBhcnNlZEZpbGVFZGl0W10sIGZvbGRlclJvb3RzOiByZWFkb25seSBVUklbXSk6IElTZXNzaW9uRmlsZVtdIHtcblx0Y29uc3QgYnlVcmkgPSBuZXcgTWFwPHN0cmluZywgeyB1cmk6IFVSSTsgZmlsZTogSU11dGFibGVTZXNzaW9uRmlsZSB9PigpO1xuXG5cdGNvbnN0IGlzT3V0c2lkZVdvcmtzcGFjZSA9ICh1cmk6IFVSSSk6IGJvb2xlYW4gPT5cblx0XHQhZm9sZGVyUm9vdHMuc29tZShyb290ID0+IGlzRXF1YWxPclBhcmVudCh1cmksIHJvb3QpKTtcblxuXHRjb25zdCBzZXRDcmVhdGVkID0gKHVyaTogVVJJKTogdm9pZCA9PiB7XG5cdFx0aWYgKCFpc091dHNpZGVXb3Jrc3BhY2UodXJpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRieVVyaS5zZXQoZ2V0Q29tcGFyaXNvbktleSh1cmkpLCB7IHVyaSwgZmlsZTogeyBvcGVyYXRpb246IFNlc3Npb25GaWxlT3BlcmF0aW9uLkNyZWF0ZWQgfSB9KTtcblx0fTtcblxuXHRjb25zdCBzZXRNb2RpZmllZCA9ICh1cmk6IFVSSSwgb3JpZ2luYWxVcmk6IFVSSSB8IHVuZGVmaW5lZCk6IHZvaWQgPT4ge1xuXHRcdGlmICghaXNPdXRzaWRlV29ya3NwYWNlKHVyaSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBieVVyaS5nZXQoZ2V0Q29tcGFyaXNvbktleSh1cmkpKTtcblx0XHRpZiAoZXhpc3Rpbmc/LmZpbGUub3BlcmF0aW9uID09PSBTZXNzaW9uRmlsZU9wZXJhdGlvbi5DcmVhdGVkKSB7XG5cdFx0XHRyZXR1cm47IC8vIGNyZWF0ZWQtdGhlbi1lZGl0ZWQgc3RheXMgY3JlYXRlZFxuXHRcdH1cblx0XHRpZiAoZXhpc3Rpbmc/LmZpbGUub3BlcmF0aW9uID09PSBTZXNzaW9uRmlsZU9wZXJhdGlvbi5Nb2RpZmllZCkge1xuXHRcdFx0Ly8gS2VlcCB0aGUgZWFybGllc3Qga25vd24gb3JpZ2luYWwgY29udGVudCBmb3IgdGhlIGRpZmYuXG5cdFx0XHRleGlzdGluZy5maWxlLm9yaWdpbmFsVXJpID0gZXhpc3RpbmcuZmlsZS5vcmlnaW5hbFVyaSA/PyBvcmlnaW5hbFVyaTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YnlVcmkuc2V0KGdldENvbXBhcmlzb25LZXkodXJpKSwgeyB1cmksIGZpbGU6IHsgb3BlcmF0aW9uOiBTZXNzaW9uRmlsZU9wZXJhdGlvbi5Nb2RpZmllZCwgb3JpZ2luYWxVcmkgfSB9KTtcblx0fTtcblxuXHQvLyBBIGRlbGV0ZSByZW1vdmVzIHRoZSBmaWxlIGZyb20gdGhlIGxpc3QgZW50aXJlbHkgcmF0aGVyIHRoYW4gc3VyZmFjaW5nIGl0XG5cdC8vIGFzIGEgZGVsZXRlZCBlbnRyeTogYSBjcmVhdGUvZWRpdCBmb2xsb3dlZCBieSBhIGRlbGV0ZSBuZXRzIG91dCwgYW5kIGFcblx0Ly8gcHJlLWV4aXN0aW5nIGRlbGV0ZWQgZmlsZSBzaW1wbHkgbmV2ZXIgYXBwZWFycy5cblx0Y29uc3QgcmVtb3ZlRmlsZSA9ICh1cmk6IFVSSSk6IHZvaWQgPT4ge1xuXHRcdGJ5VXJpLmRlbGV0ZShnZXRDb21wYXJpc29uS2V5KHVyaSkpO1xuXHR9O1xuXG5cdGZvciAoY29uc3QgZWRpdCBvZiBlZGl0cykge1xuXHRcdHN3aXRjaCAoZWRpdC5raW5kKSB7XG5cdFx0XHRjYXNlIEZpbGVFZGl0S2luZC5DcmVhdGU6XG5cdFx0XHRcdGlmIChlZGl0LmFmdGVyVXJpKSB7XG5cdFx0XHRcdFx0c2V0Q3JlYXRlZChlZGl0LmFmdGVyVXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgRmlsZUVkaXRLaW5kLkVkaXQ6XG5cdFx0XHRcdGlmIChlZGl0LmFmdGVyVXJpKSB7XG5cdFx0XHRcdFx0c2V0TW9kaWZpZWQoZWRpdC5hZnRlclVyaSwgZWRpdC5iZWZvcmVDb250ZW50VXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgRmlsZUVkaXRLaW5kLkRlbGV0ZTpcblx0XHRcdFx0aWYgKGVkaXQuYmVmb3JlVXJpKSB7XG5cdFx0XHRcdFx0cmVtb3ZlRmlsZShlZGl0LmJlZm9yZVVyaSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEZpbGVFZGl0S2luZC5SZW5hbWU6XG5cdFx0XHRcdGlmIChlZGl0LmJlZm9yZVVyaSkge1xuXHRcdFx0XHRcdHJlbW92ZUZpbGUoZWRpdC5iZWZvcmVVcmkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlZGl0LmFmdGVyVXJpKSB7XG5cdFx0XHRcdFx0c2V0Q3JlYXRlZChlZGl0LmFmdGVyVXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRjb25zdCBmaWxlcyA9IFsuLi5ieVVyaS52YWx1ZXMoKV0ubWFwKCh7IHVyaSwgZmlsZSB9KTogSVNlc3Npb25GaWxlID0+ICh7XG5cdFx0dXJpLFxuXHRcdG9wZXJhdGlvbjogZmlsZS5vcGVyYXRpb24sXG5cdFx0b3JpZ2luYWxVcmk6IGZpbGUub3JpZ2luYWxVcmksXG5cdH0pKTtcblxuXHRmaWxlcy5zb3J0KChhLCBiKSA9PiBzdHJDb21wYXJlKGdldENvbXBhcmlzb25LZXkoYS51cmkpLCBnZXRDb21wYXJpc29uS2V5KGIudXJpKSkpO1xuXHRyZXR1cm4gZmlsZXM7XG59XG5cbmludGVyZmFjZSBJTXV0YWJsZVR1cm5DaGFuZ2Uge1xuXHR1cmk6IFVSSTtcblx0bW9kaWZpZWRVcmk6IFVSSSB8IHVuZGVmaW5lZDtcblx0bW9kaWZpZWRTbmFwc2hvdFVyaTogVVJJIHwgdW5kZWZpbmVkO1xuXHRvcmlnaW5hbFVyaTogVVJJIHwgdW5kZWZpbmVkO1xuXHRpc091dHNpZGVXb3Jrc3BhY2U6IGJvb2xlYW47XG5cdC8qKiBXaGV0aGVyIHRoZSBmaWxlIHdhcyBjcmVhdGVkIGR1cmluZyB0aGUgdHVybiAoa2VwdCBhY3Jvc3MgbGF0ZXIgZWRpdHMpLiAqL1xuXHRjcmVhdGVkOiBib29sZWFuO1xuXHRpbnNlcnRpb25zOiBudW1iZXI7XG5cdGRlbGV0aW9uczogbnVtYmVyO1xufVxuXG4vKipcbiAqIFJlZHVjZXMgYSBzaW5nbGUgdHVybidzIHBhcnNlZCBmaWxlIGVkaXRzIGludG8gb25lIHtAbGluayBJU2Vzc2lvblR1cm5GaWxlQ2hhbmdlfVxuICogcGVyIGZpbGUsIGFnZ3JlZ2F0aW5nIGRpZmYgc3RhdHMuIE1pcnJvcnMgdGhlIFwiTGFzdCBUdXJuIENoYW5nZXNcIiBjaGFuZ2VzZXRcbiAqIHNvIGNvbnN1bWVycyAoZS5nLiB0aGUgY2hhdCBpbnB1dCBzdGF0dXMgcGlsbHMpIGNhbiByZWZsZWN0IHRoZSBsYXN0IHR1cm5cbiAqIHN0cmFpZ2h0IGZyb20gdGhlIG91dHB1dCBzdHJlYW0uXG4gKlxuICogUnVsZXM6XG4gKiAtIFJlcGVhdGVkIGVkaXRzIHRvIHRoZSBzYW1lIGZpbGUgY29sbGFwc2UgaW50byBhIHNpbmdsZSBjaGFuZ2Ugd2hvc2VcbiAqICAgaW5zZXJ0aW9ucy9kZWxldGlvbnMgYXJlIHRoZSBzdW0gb2YgdGhlIGluZGl2aWR1YWwgZWRpdHMuXG4gKiAtIEEgZmlsZSBjcmVhdGVkIGR1cmluZyB0aGUgdHVybiBzdGF5cyBhIGNyZWF0aW9uIChubyBvcmlnaW5hbCBzaWRlKSBldmVuIGlmXG4gKiAgIGVkaXRlZCBhZnRlcndhcmRzLlxuICogLSBBIGNyZWF0ZS9lZGl0IGZvbGxvd2VkIGJ5IGEgZGVsZXRlIGluIHRoZSBzYW1lIHR1cm4gbmV0cyBvdXQ7IGEgcHJlLWV4aXN0aW5nXG4gKiAgIGZpbGUgZGVsZXRlZCBkdXJpbmcgdGhlIHR1cm4gaXMgc3VyZmFjZWQgYXMgYSBkZWxldGlvbiAobm8gbW9kaWZpZWQgc2lkZSB0b1xuICogICBwcmV2aWV3KSBidXQgc3RpbGwgY291bnRlZCBpbiB0aGUgc3RhdHMuXG4gKiAtIFJlbmFtZXMgZHJvcCB0aGUgc291cmNlIGFuZCBzdXJmYWNlIHRoZSB0YXJnZXQgYXMgYW4gZWRpdCBvZiBpdHNcbiAqICAgYmVmb3JlLWNvbnRlbnQsIG1hdGNoaW5nIHRoZSBjaGFuZ2VzZXQncyBjbGFzc2lmaWNhdGlvbi5cbiAqIC0gRXZlcnkgY2hhbmdlIHJlY29yZHMgd2hldGhlciBpdHMgcmVzb3VyY2UgaXMgb3V0c2lkZSBhbGwgd29ya3NwYWNlIHJvb3RzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVkdWNlVHVybkNoYW5nZXMoXG5cdGVkaXRzOiByZWFkb25seSBJUGFyc2VkRmlsZUVkaXRbXSxcblx0Zm9sZGVyUm9vdHM6IHJlYWRvbmx5IFVSSVtdID0gW10sXG5cdGNhY2hlPzogTWFwPHN0cmluZywgdW5rbm93bj4sXG4pOiAoSUNoYXRTZXNzaW9uRmlsZUNoYW5nZTIgJiBJU2Vzc2lvblR1cm5GaWxlQ2hhbmdlKVtdIHtcblx0Y29uc3QgYnlVcmkgPSBuZXcgTWFwPHN0cmluZywgSU11dGFibGVUdXJuQ2hhbmdlPigpO1xuXG5cdGNvbnN0IGlzT3V0c2lkZVdvcmtzcGFjZSA9IChyZXNvdXJjZTogVVJJKTogYm9vbGVhbiA9PiB7XG5cdFx0Y29uc3QgY2FjaGVLZXkgPSBgaXNPdXRzaWRlV29ya3NwYWNlOiR7cmVzb3VyY2UudG9TdHJpbmcoKX1gO1xuXHRcdGNvbnN0IGNhY2hlZCA9IGNhY2hlPy5nZXQoY2FjaGVLZXkpO1xuXHRcdGlmICh0eXBlb2YgY2FjaGVkID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHJldHVybiBjYWNoZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9ICFmb2xkZXJSb290cy5zb21lKHJvb3QgPT4gaXNFcXVhbE9yUGFyZW50KHJlc291cmNlLCByb290KSk7XG5cdFx0Y2FjaGU/LnNldChjYWNoZUtleSwgcmVzdWx0KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9O1xuXG5cdGNvbnN0IHNldENyZWF0ZWQgPSAodXJpOiBVUkksIG1vZGlmaWVkU25hcHNob3RVcmk6IFVSSSB8IHVuZGVmaW5lZCwgaW5zZXJ0aW9uczogbnVtYmVyLCBkZWxldGlvbnM6IG51bWJlcik6IHZvaWQgPT4ge1xuXHRcdGNvbnN0IGtleSA9IGdldENvbXBhcmlzb25LZXkodXJpKTtcblx0XHRjb25zdCBleGlzdGluZyA9IGJ5VXJpLmdldChrZXkpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0ZXhpc3RpbmcuY3JlYXRlZCA9IHRydWU7XG5cdFx0XHRleGlzdGluZy5tb2RpZmllZFVyaSA9IHVyaTtcblx0XHRcdGV4aXN0aW5nLm1vZGlmaWVkU25hcHNob3RVcmkgPSBtb2RpZmllZFNuYXBzaG90VXJpO1xuXHRcdFx0ZXhpc3Rpbmcub3JpZ2luYWxVcmkgPSB1bmRlZmluZWQ7XG5cdFx0XHRleGlzdGluZy5pbnNlcnRpb25zICs9IGluc2VydGlvbnM7XG5cdFx0XHRleGlzdGluZy5kZWxldGlvbnMgKz0gZGVsZXRpb25zO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRieVVyaS5zZXQoa2V5LCB7IHVyaSwgbW9kaWZpZWRVcmk6IHVyaSwgbW9kaWZpZWRTbmFwc2hvdFVyaSwgb3JpZ2luYWxVcmk6IHVuZGVmaW5lZCwgaXNPdXRzaWRlV29ya3NwYWNlOiBpc091dHNpZGVXb3Jrc3BhY2UodXJpKSwgY3JlYXRlZDogdHJ1ZSwgaW5zZXJ0aW9ucywgZGVsZXRpb25zIH0pO1xuXHR9O1xuXG5cdGNvbnN0IHNldE1vZGlmaWVkID0gKHVyaTogVVJJLCBvcmlnaW5hbFVyaTogVVJJIHwgdW5kZWZpbmVkLCBtb2RpZmllZFNuYXBzaG90VXJpOiBVUkkgfCB1bmRlZmluZWQsIGluc2VydGlvbnM6IG51bWJlciwgZGVsZXRpb25zOiBudW1iZXIpOiB2b2lkID0+IHtcblx0XHRjb25zdCBrZXkgPSBnZXRDb21wYXJpc29uS2V5KHVyaSk7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBieVVyaS5nZXQoa2V5KTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdGV4aXN0aW5nLmluc2VydGlvbnMgKz0gaW5zZXJ0aW9ucztcblx0XHRcdGV4aXN0aW5nLmRlbGV0aW9ucyArPSBkZWxldGlvbnM7XG5cdFx0XHRleGlzdGluZy5tb2RpZmllZFNuYXBzaG90VXJpID0gbW9kaWZpZWRTbmFwc2hvdFVyaTtcblx0XHRcdGlmICghZXhpc3RpbmcuY3JlYXRlZCkge1xuXHRcdFx0XHQvLyBLZWVwIHRoZSBlYXJsaWVzdCBrbm93biBvcmlnaW5hbCBjb250ZW50IGZvciB0aGUgZGlmZi5cblx0XHRcdFx0ZXhpc3Rpbmcub3JpZ2luYWxVcmkgPSBleGlzdGluZy5vcmlnaW5hbFVyaSA/PyBvcmlnaW5hbFVyaTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YnlVcmkuc2V0KGtleSwgeyB1cmksIG1vZGlmaWVkVXJpOiB1cmksIG1vZGlmaWVkU25hcHNob3RVcmksIG9yaWdpbmFsVXJpLCBpc091dHNpZGVXb3Jrc3BhY2U6IGlzT3V0c2lkZVdvcmtzcGFjZSh1cmkpLCBjcmVhdGVkOiBmYWxzZSwgaW5zZXJ0aW9ucywgZGVsZXRpb25zIH0pO1xuXHR9O1xuXG5cdGNvbnN0IHNldERlbGV0ZWQgPSAodXJpOiBVUkksIG9yaWdpbmFsVXJpOiBVUkkgfCB1bmRlZmluZWQsIG1vZGlmaWVkU25hcHNob3RVcmk6IFVSSSB8IHVuZGVmaW5lZCwgaW5zZXJ0aW9uczogbnVtYmVyLCBkZWxldGlvbnM6IG51bWJlcik6IHZvaWQgPT4ge1xuXHRcdGNvbnN0IGtleSA9IGdldENvbXBhcmlzb25LZXkodXJpKTtcblx0XHRpZiAoYnlVcmkuaGFzKGtleSkpIHtcblx0XHRcdC8vIENyZWF0ZWQvZWRpdGVkIGVhcmxpZXIgaW4gdGhlIHNhbWUgdHVybiBhbmQgbm93IGRlbGV0ZWQ6IG5ldHMgb3V0LlxuXHRcdFx0YnlVcmkuZGVsZXRlKGtleSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFByZS1leGlzdGluZyBmaWxlIGRlbGV0ZWQgZHVyaW5nIHRoZSB0dXJuOiBubyBtb2RpZmllZCBzaWRlIHRvIHByZXZpZXcuXG5cdFx0YnlVcmkuc2V0KGtleSwgeyB1cmksIG1vZGlmaWVkVXJpOiB1bmRlZmluZWQsIG1vZGlmaWVkU25hcHNob3RVcmksIG9yaWdpbmFsVXJpLCBpc091dHNpZGVXb3Jrc3BhY2U6IGlzT3V0c2lkZVdvcmtzcGFjZSh1cmkpLCBjcmVhdGVkOiBmYWxzZSwgaW5zZXJ0aW9ucywgZGVsZXRpb25zIH0pO1xuXHR9O1xuXG5cdGZvciAoY29uc3QgZWRpdCBvZiBlZGl0cykge1xuXHRcdHN3aXRjaCAoZWRpdC5raW5kKSB7XG5cdFx0XHRjYXNlIEZpbGVFZGl0S2luZC5DcmVhdGU6XG5cdFx0XHRcdGlmIChlZGl0LmFmdGVyVXJpKSB7XG5cdFx0XHRcdFx0c2V0Q3JlYXRlZChlZGl0LmFmdGVyVXJpLCBlZGl0LmFmdGVyQ29udGVudFVyaSwgZWRpdC5pbnNlcnRpb25zLCBlZGl0LmRlbGV0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEZpbGVFZGl0S2luZC5FZGl0OlxuXHRcdFx0XHRpZiAoZWRpdC5hZnRlclVyaSkge1xuXHRcdFx0XHRcdHNldE1vZGlmaWVkKGVkaXQuYWZ0ZXJVcmksIGVkaXQuYmVmb3JlQ29udGVudFVyaSwgZWRpdC5hZnRlckNvbnRlbnRVcmksIGVkaXQuaW5zZXJ0aW9ucywgZWRpdC5kZWxldGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBGaWxlRWRpdEtpbmQuRGVsZXRlOlxuXHRcdFx0XHRpZiAoZWRpdC5iZWZvcmVVcmkpIHtcblx0XHRcdFx0XHRzZXREZWxldGVkKGVkaXQuYmVmb3JlVXJpLCBlZGl0LmJlZm9yZUNvbnRlbnRVcmksIGVkaXQuYWZ0ZXJDb250ZW50VXJpLCBlZGl0Lmluc2VydGlvbnMsIGVkaXQuZGVsZXRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgRmlsZUVkaXRLaW5kLlJlbmFtZTpcblx0XHRcdFx0aWYgKGVkaXQuYmVmb3JlVXJpKSB7XG5cdFx0XHRcdFx0YnlVcmkuZGVsZXRlKGdldENvbXBhcmlzb25LZXkoZWRpdC5iZWZvcmVVcmkpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZWRpdC5hZnRlclVyaSkge1xuXHRcdFx0XHRcdHNldE1vZGlmaWVkKGVkaXQuYWZ0ZXJVcmksIGVkaXQuYmVmb3JlQ29udGVudFVyaSwgZWRpdC5hZnRlckNvbnRlbnRVcmksIGVkaXQuaW5zZXJ0aW9ucywgZWRpdC5kZWxldGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBbLi4uYnlVcmkudmFsdWVzKCldLm1hcChjID0+ICh7XG5cdFx0dXJpOiBjLnVyaSxcblx0XHRtb2RpZmllZFVyaTogYy5tb2RpZmllZFVyaSxcblx0XHRtb2RpZmllZFNuYXBzaG90VXJpOiBjLm1vZGlmaWVkU25hcHNob3RVcmksXG5cdFx0b3JpZ2luYWxVcmk6IGMub3JpZ2luYWxVcmksXG5cdFx0aXNPdXRzaWRlV29ya3NwYWNlOiBjLmlzT3V0c2lkZVdvcmtzcGFjZSxcblx0XHRpbnNlcnRpb25zOiBjLmluc2VydGlvbnMsXG5cdFx0ZGVsZXRpb25zOiBjLmRlbGV0aW9ucyxcblx0fSBzYXRpc2ZpZXMgSVNlc3Npb25UdXJuRmlsZUNoYW5nZSkpO1xufVxuXG5mdW5jdGlvbiBzZXNzaW9uRmlsZXNFcXVhbChhOiByZWFkb25seSBJU2Vzc2lvbkZpbGVbXSwgYjogcmVhZG9ubHkgSVNlc3Npb25GaWxlW10pOiBib29sZWFuIHtcblx0aWYgKGEubGVuZ3RoICE9PSBiLmxlbmd0aCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRmb3IgKGxldCBpID0gMDsgaSA8IGEubGVuZ3RoOyBpKyspIHtcblx0XHRpZiAoYVtpXS5vcGVyYXRpb24gIT09IGJbaV0ub3BlcmF0aW9uXG5cdFx0XHR8fCAhaXNFcXVhbChhW2ldLnVyaSwgYltpXS51cmkpXG5cdFx0XHR8fCAhaXNFcXVhbChhW2ldLm9yaWdpbmFsVXJpLCBiW2ldLm9yaWdpbmFsVXJpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuLyoqXG4gKiBTdHJ1Y3R1cmFsIGVxdWFsaXR5IG92ZXIgcGFyc2VkIGVkaXRzLCB1c2VkICh2aWEge0BsaW5rIGNoYXRGaWxlRWRpdHNFcXVhbH0pXG4gKiBhcyB0aGUgcGVyLWNoYXQgb2JzZXJ2YWJsZSdzIGBlcXVhbHNGbmAgc28gc3RyZWFtZWQgZGVsdGFzIHRoYXQgY2Fycnkgbm9cbiAqIGZpbGUtZWRpdCBjaGFuZ2UgKGUuZy4gbWFya2Rvd24gb3IgcmVhc29uaW5nIGNvbnRlbnQpIGRvbid0IHJlLXJ1biB0aGVcbiAqIGRvd25zdHJlYW0gcmVkdWNlcnMuXG4gKi9cbmZ1bmN0aW9uIHBhcnNlZEZpbGVFZGl0c0VxdWFsKGE6IHJlYWRvbmx5IElQYXJzZWRGaWxlRWRpdFtdLCBiOiByZWFkb25seSBJUGFyc2VkRmlsZUVkaXRbXSk6IGJvb2xlYW4ge1xuXHRpZiAoYSA9PT0gYikge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGlmIChhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XG5cdFx0aWYgKGFbaV0ua2luZCAhPT0gYltpXS5raW5kXG5cdFx0XHR8fCBhW2ldLmluc2VydGlvbnMgIT09IGJbaV0uaW5zZXJ0aW9uc1xuXHRcdFx0fHwgYVtpXS5kZWxldGlvbnMgIT09IGJbaV0uZGVsZXRpb25zXG5cdFx0XHR8fCAhaXNFcXVhbChhW2ldLmFmdGVyVXJpLCBiW2ldLmFmdGVyVXJpKVxuXHRcdFx0fHwgIWlzRXF1YWwoYVtpXS5iZWZvcmVVcmksIGJbaV0uYmVmb3JlVXJpKVxuXHRcdFx0fHwgIWlzRXF1YWwoYVtpXS5iZWZvcmVDb250ZW50VXJpLCBiW2ldLmJlZm9yZUNvbnRlbnRVcmkpXG5cdFx0XHR8fCAhaXNFcXVhbChhW2ldLmFmdGVyQ29udGVudFVyaSwgYltpXS5hZnRlckNvbnRlbnRVcmkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG4vKiogU3RydWN0dXJhbCBlcXVhbGl0eSBvdmVyIGEgY2hhdCdzIHBhcnNlZCBlZGl0cyAoZnVsbCBzZXQgYW5kIGxhc3QgdHVybikuICovXG5mdW5jdGlvbiBjaGF0RmlsZUVkaXRzRXF1YWwoYTogSUNoYXRGaWxlRWRpdHMsIGI6IElDaGF0RmlsZUVkaXRzKTogYm9vbGVhbiB7XG5cdHJldHVybiBwYXJzZWRGaWxlRWRpdHNFcXVhbChhLmFsbEVkaXRzLCBiLmFsbEVkaXRzKSAmJiBwYXJzZWRGaWxlRWRpdHNFcXVhbChhLmxhc3RUdXJuRWRpdHMsIGIubGFzdFR1cm5FZGl0cyk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGlCQUFpQixhQUEwQixnQ0FBZ0M7QUFDcEYsU0FBUyxXQUFXLGtCQUFrQjtBQUN0QyxTQUFTLGtCQUFrQixTQUFTLHVCQUF1QjtBQUMzRCxTQUFTLFdBQVc7QUFDcEIsU0FBUyx5QkFBeUI7QUFFbEM7QUFBQSxFQUNDO0FBQUEsRUFFQTtBQUFBLEVBQ0E7QUFBQSxFQUVBO0FBQUEsRUFHQTtBQUFBLEVBQ0E7QUFBQSxPQUNNO0FBRVAsU0FBa0Usc0JBQXNCLG1DQUFtQztBQUMzSCxTQUFTLDBDQUEwQztBQW1FNUMsU0FBUyx1QkFDZixZQUNBLFNBQ0Esb0JBQ0EsZUFDQSxjQUNBLE9BQ29CO0FBQ3BCLFFBQU0s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
