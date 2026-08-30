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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { relativePath } from "../../../../base/common/resources.js";
import { linesDiffComputers } from "../../../../editor/common/diff/linesDiffComputers.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { FileOperationError, FileOperationResult } from "../../../../platform/files/common/files.js";
import { detectEncodingFromBuffer } from "../../../services/textfile/common/encoding.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IChatEntitlementService } from "../../../services/chat/common/chatEntitlementService.js";
import { ISCMService } from "../../scm/common/scm.js";
import { IChatService } from "../common/chatService/chatService.js";
import { ChatConfiguration } from "../common/constants.js";
import * as nls from "../../../../nls.js";
const MAX_CHANGES = 100;
const MAX_DIFFS_SIZE_BYTES = 900 * 1024;
const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024;
const RemoteMatcher = /^\s*url\s*=\s*(.+\S)\s*$/mg;
function getRawRemotes(text) {
  const remotes = [];
  let match;
  while (match = RemoteMatcher.exec(text)) {
    remotes.push(match[1]);
  }
  return remotes;
}
function getRemoteHost(remoteUrl) {
  try {
    const url = new URL(remoteUrl);
    return url.hostname.toLowerCase();
  } catch {
    const atIndex = remoteUrl.lastIndexOf("@");
    const hostAndPath = atIndex !== -1 ? remoteUrl.slice(atIndex + 1) : remoteUrl;
    const colonIndex = hostAndPath.indexOf(":");
    if (colonIndex !== -1) {
      const host = hostAndPath.slice(0, colonIndex);
      return host ? host.toLowerCase() : void 0;
    }
    const slashIndex = hostAndPath.indexOf("/");
    if (slashIndex !== -1) {
      const host = hostAndPath.slice(0, slashIndex);
      return host ? host.toLowerCase() : void 0;
    }
    return void 0;
  }
}
function determineChangeType(resource, groupId) {
  const contextValue = resource.contextValue?.toLowerCase() ?? "";
  const groupIdLower = groupId.toLowerCase();
  if (contextValue.includes("untracked") || contextValue.includes("add")) {
    return "added";
  }
  if (contextValue.includes("delete")) {
    return "deleted";
  }
  if (contextValue.includes("rename")) {
    return "renamed";
  }
  if (groupIdLower.includes("untracked")) {
    return "added";
  }
  if (resource.decorations.strikeThrough) {
    return "deleted";
  }
  if (!resource.multiDiffEditorOriginalUri) {
    return "added";
  }
  return "modified";
}
async function generateUnifiedDiff(fileService, relPath, originalUri, modifiedUri, changeType) {
  try {
    let originalContent = "";
    let modifiedContent = "";
    if (originalUri && changeType !== "added") {
      try {
        const originalFile = await fileService.readFile(originalUri, { limits: { size: MAX_FILE_SIZE_BYTES } });
        const detected = detectEncodingFromBuffer({ buffer: originalFile.value, bytesRead: originalFile.value.byteLength });
        if (detected.seemsBinary) {
          return void 0;
        }
        originalContent = originalFile.value.toString();
      } catch (e) {
        if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_TOO_LARGE) {
          return void 0;
        }
        if (changeType === "modified") {
          return void 0;
        }
      }
    }
    if (changeType !== "deleted") {
      try {
        const modifiedFile = await fileService.readFile(modifiedUri, { limits: { size: MAX_FILE_SIZE_BYTES } });
        const detected = detectEncodingFromBuffer({ buffer: modifiedFile.value, bytesRead: modifiedFile.value.byteLength });
        if (detected.seemsBinary) {
          return void 0;
        }
        modifiedContent = modifiedFile.value.toString();
      } catch (e) {
        if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_TOO_LARGE) {
          return void 0;
        }
        return void 0;
      }
    }
    const originalLines = originalContent.split("\n");
    const modifiedLines = modifiedContent.split("\n");
    const originalEndsWithNewline = originalContent.length > 0 && originalContent.endsWith("\n");
    const modifiedEndsWithNewline = modifiedContent.length > 0 && modifiedContent.endsWith("\n");
    if (originalEndsWithNewline && originalLines.length > 0 && originalLines[originalLines.length - 1] === "") {
      originalLines.pop();
    }
    if (modifiedEndsWithNewline && modifiedLines.length > 0 && modifiedLines[modifiedLines.length - 1] === "") {
      modifiedLines.pop();
    }
    const diffLines = [];
    const aPath = changeType === "added" ? "/dev/null" : `a/${relPath}`;
    const bPath = changeType === "deleted" ? "/dev/null" : `b/${relPath}`;
    diffLines.push(`--- ${aPath}`);
    diffLines.push(`+++ ${bPath}`);
    if (changeType === "added") {
      if (modifiedLines.length > 0) {
        diffLines.push(`@@ -0,0 +1,${modifiedLines.length} @@`);
        for (const line of modifiedLines) {
          diffLines.push(`+${line}`);
        }
        if (!modifiedEndsWithNewline) {
          diffLines.push("\\ No newline at end of file");
        }
      }
    } else if (changeType === "deleted") {
      if (originalLines.length > 0) {
        diffLines.push(`@@ -1,${originalLines.length} +0,0 @@`);
        for (const line of originalLines) {
          diffLines.push(`-${line}`);
        }
        if (!originalEndsWithNewline) {
          diffLines.push("\\ No newline at end of file");
        }
      }
    } else {
      const hunks = computeDiffHunks(originalLines, modifiedLines, originalEndsWithNewline, modifiedEndsWithNewline);
      for (const hunk of hunks) {
        diffLines.push(hunk);
      }
    }
    return diffLines.join("\n");
  } catch {
    return void 0;
  }
}
function computeDiffHunks(originalLines, modifiedLines, originalEndsWithNewline, modifiedEndsWithNewline) {
  const contextSize = 3;
  const result = [];
  const diffComputer = linesDiffComputers.getDefault();
  const diffResult = diffComputer.computeDiff(originalLines, modifiedLines, {
    ignoreTrimWhitespace: false,
    maxComputationTimeMs: 1e3,
    computeMoves: false
  });
  if (diffResult.changes.length === 0) {
    return result;
  }
  const hunkGroups = [];
  let currentGroup = [];
  for (const change of diffResult.changes) {
    if (currentGroup.length === 0) {
      currentGroup.push(change);
    } else {
      const lastChange = currentGroup[currentGroup.length - 1];
      const lastContextEnd = lastChange.original.endLineNumberExclusive - 1 + contextSize;
      const currentContextStart = change.original.startLineNumber - contextSize;
      if (currentContextStart <= lastContextEnd + 1) {
        currentGroup.push(change);
      } else {
        hunkGroups.push(currentGroup);
        currentGroup = [change];
      }
    }
  }
  if (currentGroup.length > 0) {
    hunkGroups.push(currentGroup);
  }
  for (const group of hunkGroups) {
    const firstChange = group[0];
    const lastChange = group[group.length - 1];
    const hunkOrigStart = Math.max(1, firstChange.original.startLineNumber - contextSize);
    const hunkOrigEnd = Math.min(originalLines.length, lastChange.original.endLineNumberExclusive - 1 + contextSize);
    const hunkModStart = Math.max(1, firstChange.modified.startLineNumber - contextSize);
    const hunkLines = [];
    let lastOriginalLineIndex = -1;
    let lastModifiedLineIndex = -1;
    let origLineNum = hunkOrigStart;
    let origCount = 0;
    let modCount = 0;
    for (const change of group) {
      const origStart = change.original.startLineNumber;
      const origEnd = change.original.endLineNumberExclusive;
      const modStart = change.modified.startLineNumber;
      const modEnd = change.modified.endLineNumberExclusive;
      while (origLineNum < origStart) {
        const idx = hunkLines.length;
        hunkLines.push(` ${originalLines[origLineNum - 1]}`);
        if (origLineNum === originalLines.length) {
          lastOriginalLineIndex = idx;
        }
        const modLineNum = hunkModStart + modCount;
        if (modLineNum === modifiedLines.length) {
          lastModifiedLineIndex = idx;
        }
        origLineNum++;
        origCount++;
        modCount++;
      }
      for (let i = origStart; i < origEnd; i++) {
        const idx = hunkLines.length;
        hunkLines.push(`-${originalLines[i - 1]}`);
        if (i === originalLines.length) {
          lastOriginalLineIndex = idx;
        }
        origLineNum++;
        origCount++;
      }
      for (let i = modStart; i < modEnd; i++) {
        const idx = hunkLines.length;
        hunkLines.push(`+${modifiedLines[i - 1]}`);
        if (i === modifiedLines.length) {
          lastModifiedLineIndex = idx;
        }
        modCount++;
      }
    }
    while (origLineNum <= hunkOrigEnd) {
      const idx = hunkLines.length;
      hunkLines.push(` ${originalLines[origLineNum - 1]}`);
      if (origLineNum === originalLines.length) {
        lastOriginalLineIndex = idx;
      }
      const modLineNum = hunkModStart + modCount;
      if (modLineNum === modifiedLines.length) {
        lastModifiedLineIndex = idx;
      }
      origLineNum++;
      origCount++;
      modCount++;
    }
    result.push(`@@ -${hunkOrigStart},${origCount} +${hunkModStart},${modCount} @@`);
    for (let i = 0; i < hunkLines.length; i++) {
      result.push(hunkLines[i]);
      const isLastOriginal = i === lastOriginalLineIndex;
      const isLastModified = i === lastModifiedLineIndex;
      if (isLastOriginal && isLastModified) {
        if (!originalEndsWithNewline || !modifiedEndsWithNewline) {
          result.push("\\ No newline at end of file");
        }
      } else if (isLastOriginal && !originalEndsWithNewline) {
        result.push("\\ No newline at end of file");
      } else if (isLastModified && !modifiedEndsWithNewline) {
        result.push("\\ No newline at end of file");
      }
    }
  }
  return result;
}
function captureRepoMetadata(scmService) {
  const repositories = [...scmService.repositories];
  if (repositories.length === 0) {
    return void 0;
  }
  const repository = repositories[0];
  const rootUri = repository.provider.rootUri;
  if (!rootUri) {
    return void 0;
  }
  let localBranch;
  let localHeadCommit;
  let remoteTrackingBranch;
  let remoteHeadCommit;
  let remoteBaseBranch;
  const historyProvider = repository.provider.historyProvider?.get();
  if (historyProvider) {
    const historyItemRef = historyProvider.historyItemRef.get();
    localBranch = historyItemRef?.name;
    localHeadCommit = historyItemRef?.revision;
    const historyItemRemoteRef = historyProvider.historyItemRemoteRef.get();
    if (historyItemRemoteRef) {
      remoteTrackingBranch = historyItemRemoteRef.name;
      remoteHeadCommit = historyItemRemoteRef.revision;
    }
    const historyItemBaseRef = historyProvider.historyItemBaseRef.get();
    if (historyItemBaseRef) {
      remoteBaseBranch = historyItemBaseRef.name;
    }
  }
  let workspaceType;
  let syncStatus;
  if (remoteTrackingBranch || remoteHeadCommit || remoteBaseBranch) {
    workspaceType = "remote-git";
    if (!remoteTrackingBranch) {
      syncStatus = "unpublished";
    } else if (localHeadCommit && remoteHeadCommit && localHeadCommit === remoteHeadCommit) {
      syncStatus = "synced";
    } else {
      syncStatus = "unpushed";
    }
  } else {
    workspaceType = "local-git";
    syncStatus = "local-only";
  }
  return {
    workspaceType,
    syncStatus,
    localBranch,
    remoteTrackingBranch,
    remoteBaseBranch,
    localHeadCommit,
    remoteHeadCommit,
    diffsStatus: "notCaptured"
  };
}
async function captureRepoInfo(scmService, fileService) {
  const repositories = [...scmService.repositories];
  if (repositories.length === 0) {
    return void 0;
  }
  const repository = repositories[0];
  const rootUri = repository.provider.rootUri;
  if (!rootUri) {
    return void 0;
  }
  let hasGit = false;
  try {
    const gitDirUri = rootUri.with({ path: `${rootUri.path}/.git` });
    hasGit = await fileService.exists(gitDirUri);
  } catch {
  }
  if (!hasGit) {
    return {
      workspaceType: "plain-folder",
      syncStatus: "no-git",
      diffs: void 0
    };
  }
  let remoteUrl;
  try {
    const gitConfigUri = rootUri.with({ path: `${rootUri.path}/.git/config` });
    const exists = await fileService.exists(gitConfigUri);
    if (exists) {
      const content = await fileService.readFile(gitConfigUri);
      const remotes = getRawRemotes(content.value.toString());
      remoteUrl = remotes[0];
    }
  } catch {
  }
  let localBranch;
  let localHeadCommit;
  let remoteTrackingBranch;
  let remoteHeadCommit;
  let remoteBaseBranch;
  const historyProvider = repository.provider.historyProvider?.get();
  if (historyProvider) {
    const historyItemRef = historyProvider.historyItemRef.get();
    localBranch = historyItemRef?.name;
    localHeadCommit = historyItemRef?.revision;
    const historyItemRemoteRef = historyProvider.historyItemRemoteRef.get();
    if (historyItemRemoteRef) {
      remoteTrackingBranch = historyItemRemoteRef.name;
      remoteHeadCommit = historyItemRemoteRef.revision;
    }
    const historyItemBaseRef = historyProvider.historyItemBaseRef.get();
    if (historyItemBaseRef) {
      remoteBaseBranch = historyItemBaseRef.name;
    }
  }
  let workspaceType;
  let syncStatus;
  if (!remoteUrl) {
    workspaceType = "local-git";
    syncStatus = "local-only";
  } else {
    workspaceType = "remote-git";
    if (!remoteTrackingBranch) {
      syncStatus = "unpublished";
    } else if (localHeadCommit === remoteHeadCommit) {
      syncStatus = "synced";
    } else {
      syncStatus = "unpushed";
    }
  }
  let remoteVendor;
  if (remoteUrl) {
    const host = getRemoteHost(remoteUrl);
    if (host === "github.com") {
      remoteVendor = "github";
    } else if (host === "dev.azure.com" || host && host.endsWith(".visualstudio.com")) {
      remoteVendor = "ado";
    } else {
      remoteVendor = "other";
    }
  }
  let totalChangeCount = 0;
  for (const group of repository.provider.groups) {
    totalChangeCount += group.resources.length;
  }
  const baseRepoData = {
    workspaceType,
    syncStatus,
    remoteUrl,
    remoteVendor,
    localBranch,
    remoteTrackingBranch,
    remoteBaseBranch,
    localHeadCommit,
    remoteHeadCommit
  };
  if (totalChangeCount === 0) {
    return {
      ...baseRepoData,
      diffs: void 0,
      diffsStatus: "noChanges",
      changedFileCount: 0
    };
  }
  if (totalChangeCount > MAX_CHANGES) {
    return {
      ...baseRepoData,
      diffs: void 0,
      diffsStatus: "tooManyChanges",
      changedFileCount: totalChangeCount
    };
  }
  const diffs = [];
  const diffPromises = [];
  for (const group of repository.provider.groups) {
    for (const resource of group.resources) {
      const relPath = relativePath(rootUri, resource.sourceUri) ?? resource.sourceUri.path;
      const changeType = determineChangeType(resource, group.id);
      const diffPromise = (async () => {
        const unifiedDiff = await generateUnifiedDiff(
          fileService,
          relPath,
          resource.multiDiffEditorOriginalUri,
          resource.sourceUri,
          changeType
        );
        return {
          relativePath: relPath,
          changeType,
          status: group.label || group.id,
          unifiedDiff
        };
      })();
      diffPromises.push(diffPromise);
    }
  }
  const generatedDiffs = await Promise.all(diffPromises);
  for (const diff of generatedDiffs) {
    if (diff) {
      diffs.push(diff);
    }
  }
  const diffsJson = JSON.stringify(diffs);
  const diffsSizeBytes = new TextEncoder().encode(diffsJson).length;
  if (diffsSizeBytes > MAX_DIFFS_SIZE_BYTES) {
    return {
      ...baseRepoData,
      diffs: void 0,
      diffsStatus: "tooLarge",
      changedFileCount: totalChangeCount
    };
  }
  return {
    ...baseRepoData,
    diffs,
    diffsStatus: "included",
    changedFileCount: totalChangeCount
  };
}
let ChatRepoInfoContribution = class extends Disposable {
  constructor(chatService, chatEntitlementService, scmService, logService, configurationService) {
    super();
    this.chatService = chatService;
    this.chatEntitlementService = chatEntitlementService;
    this.scmService = scmService;
    this.logService = logService;
    this.configurationService = configurationService;
    this._configurationRegistered = false;
    this.registerConfigurationIfInternal();
    this._register(this.chatEntitlementService.onDidChangeEntitlement(() => {
      this.registerConfigurationIfInternal();
    }));
    this._register(this.chatService.onDidSubmitRequest(({ chatSessionResource }) => {
      const model = this.chatService.getSession(chatSessionResource);
      if (!model) {
        return;
      }
      this.captureAndSetRepoMetadata(model);
    }));
  }
  registerConfigurationIfInternal() {
    if (this._configurationRegistered) {
      return;
    }
    if (!this.chatEntitlementService.isInternal) {
      return;
    }
    const registry = Registry.as(ConfigurationExtensions.Configuration);
    registry.registerConfiguration({
      id: "chatRepoInfo",
      title: nls.localize("chatRepoInfoConfigurationTitle", "Chat Repository Info"),
      type: "object",
      properties: {
        [ChatConfiguration.RepoInfoEnabled]: {
          type: "boolean",
          description: nls.localize("chat.repoInfo.enabled", "Controls whether lightweight repository metadata (branch, commit, remotes) is captured when a chat request is submitted for internal diagnostics."),
          default: false
        }
      }
    });
    this._configurationRegistered = true;
    this.logService.debug("[ChatRepoInfo] Configuration registered for internal user");
  }
  /**
   * Captures lightweight metadata (branch, commit, remote refs) on first message.
   * Synchronous, no file I/O. Reads only from SCM provider observables.
   */
  captureAndSetRepoMetadata(model) {
    if (!this.chatEntitlementService.isInternal) {
      return;
    }
    if (!this.configurationService.getValue(ChatConfiguration.RepoInfoEnabled)) {
      return;
    }
    if (model.repoData) {
      return;
    }
    try {
      const metadata = captureRepoMetadata(this.scmService);
      if (metadata) {
        model.setRepoData(metadata);
        if (!metadata.localHeadCommit) {
          this.logService.warn("[ChatRepoInfo] Captured repo metadata without commit hash - git history may not be ready");
        }
      } else {
        this.logService.debug("[ChatRepoInfo] No SCM repository available for chat session");
      }
    } catch (error) {
      this.logService.warn("[ChatRepoInfo] Failed to capture repo metadata:", error);
    }
  }
};
ChatRepoInfoContribution.ID = "workbench.contrib.chatRepoInfo";
ChatRepoInfoContribution = __decorateClass([
  __decorateParam(0, IChatService),
  __decorateParam(1, IChatEntitlementService),
  __decorateParam(2, ISCMService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IConfigurationService)
], ChatRepoInfoContribution);
export {
  ChatRepoInfoContribution,
  captureRepoInfo,
  captureRepoMetadata,
  generateUnifiedDiff
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRSZXBvSW5mby50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcmVsYXRpdmVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsaW5lc0RpZmZDb21wdXRlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2RpZmYvbGluZXNEaWZmQ29tcHV0ZXJzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UsIEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZU9wZXJhdGlvblJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBkZXRlY3RFbmNvZGluZ0Zyb21CdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vZW5jb2RpbmcuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTQ01TZXJ2aWNlLCBJU0NNUmVzb3VyY2UgfSBmcm9tICcuLi8uLi9zY20vY29tbW9uL3NjbS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWwsIElFeHBvcnRhYmxlUmVwb0RhdGEsIElFeHBvcnRhYmxlUmVwb0RpZmYgfSBmcm9tICcuLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuXG5jb25zdCBNQVhfQ0hBTkdFUyA9IDEwMDtcbmNvbnN0IE1BWF9ESUZGU19TSVpFX0JZVEVTID0gOTAwICogMTAyNDtcbmNvbnN0IE1BWF9GSUxFX1NJWkVfQllURVMgPSAxICogMTAyNCAqIDEwMjQ7IC8vIDEgTUIgcGVyIGZpbGVcbi8qKlxuICogUmVnZXggdG8gbWF0Y2ggYHVybCA9IDxyZW1vdGUtdXJsPmAgbGluZXMgaW4gZ2l0IGNvbmZpZy5cbiAqL1xuY29uc3QgUmVtb3RlTWF0Y2hlciA9IC9eXFxzKnVybFxccyo9XFxzKiguK1xcUylcXHMqJC9tZztcblxuLyoqXG4gKiBFeHRyYWN0cyByYXcgcmVtb3RlIFVSTHMgZnJvbSBnaXQgY29uZmlnIGNvbnRlbnQuXG4gKi9cbmZ1bmN0aW9uIGdldFJhd1JlbW90ZXModGV4dDogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRjb25zdCByZW1vdGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRsZXQgbWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cdHdoaWxlIChtYXRjaCA9IFJlbW90ZU1hdGNoZXIuZXhlYyh0ZXh0KSkge1xuXHRcdHJlbW90ZXMucHVzaChtYXRjaFsxXSk7XG5cdH1cblx0cmV0dXJuIHJlbW90ZXM7XG59XG5cbi8qKlxuICogRXh0cmFjdHMgYSBob3N0bmFtZSBmcm9tIGEgZ2l0IHJlbW90ZSBVUkwuXG4gKlxuICogU3VwcG9ydHM6XG4gKiAtIFVSTC1saWtlIHJlbW90ZXM6IGh0dHBzOi8vZ2l0aHViLmNvbS8uLi4sIHNzaDovL2dpdEBnaXRodWIuY29tLy4uLiwgZ2l0Oi8vZ2l0aHViLmNvbS8uLi5cbiAqIC0gU0NQLWxpa2UgcmVtb3RlczogZ2l0QGdpdGh1Yi5jb206b3duZXIvcmVwby5naXRcbiAqL1xuZnVuY3Rpb24gZ2V0UmVtb3RlSG9zdChyZW1vdGVVcmw6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHRyeSB7XG5cdFx0Ly8gVHJ5IHN0YW5kYXJkIFVSTCBwYXJzaW5nIGZpcnN0ICh3b3JrcyBmb3IgaHR0cHM6Ly8sIHNzaDovLywgZ2l0Oi8vKVxuXHRcdGNvbnN0IHVybCA9IG5ldyBVUkwocmVtb3RlVXJsKTtcblx0XHRyZXR1cm4gdXJsLmhvc3RuYW1lLnRvTG93ZXJDYXNlKCk7XG5cdH0gY2F0Y2gge1xuXHRcdC8vIEZhbGxiYWNrIGZvciBTQ1AtbGlrZSBzeW50YXg6IFt1c2VyQF1ob3N0OnBhdGhcblx0XHRjb25zdCBhdEluZGV4ID0gcmVtb3RlVXJsLmxhc3RJbmRleE9mKCdAJyk7XG5cdFx0Y29uc3QgaG9zdEFuZFBhdGggPSBhdEluZGV4ICE9PSAtMSA/IHJlbW90ZVVybC5zbGljZShhdEluZGV4ICsgMSkgOiByZW1vdGVVcmw7XG5cdFx0Y29uc3QgY29sb25JbmRleCA9IGhvc3RBbmRQYXRoLmluZGV4T2YoJzonKTtcblx0XHRpZiAoY29sb25JbmRleCAhPT0gLTEpIHtcblx0XHRcdGNvbnN0IGhvc3QgPSBob3N0QW5kUGF0aC5zbGljZSgwLCBjb2xvbkluZGV4KTtcblx0XHRcdHJldHVybiBob3N0ID8gaG9zdC50b0xvd2VyQ2FzZSgpIDogdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIEZhbGxiYWNrIGZvciBob3N0bmFtZS9wYXRoIGZvcm1hdCB3aXRob3V0IHNjaGVtZSAoZS5nLiwgZGV2ZGl2LnZpc3VhbHN0dWRpby5jb20vLi4uKVxuXHRcdGNvbnN0IHNsYXNoSW5kZXggPSBob3N0QW5kUGF0aC5pbmRleE9mKCcvJyk7XG5cdFx0aWYgKHNsYXNoSW5kZXggIT09IC0xKSB7XG5cdFx0XHRjb25zdCBob3N0ID0gaG9zdEFuZFBhdGguc2xpY2UoMCwgc2xhc2hJbmRleCk7XG5cdFx0XHRyZXR1cm4gaG9zdCA/IGhvc3QudG9Mb3dlckNhc2UoKSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8qKlxuICogRGV0ZXJtaW5lcyB0aGUgY2hhbmdlIHR5cGUgYmFzZWQgb24gU0NNIHJlc291cmNlIHByb3BlcnRpZXMuXG4gKi9cbmZ1bmN0aW9uIGRldGVybWluZUNoYW5nZVR5cGUocmVzb3VyY2U6IElTQ01SZXNvdXJjZSwgZ3JvdXBJZDogc3RyaW5nKTogJ2FkZGVkJyB8ICdtb2RpZmllZCcgfCAnZGVsZXRlZCcgfCAncmVuYW1lZCcge1xuXHRjb25zdCBjb250ZXh0VmFsdWUgPSByZXNvdXJjZS5jb250ZXh0VmFsdWU/LnRvTG93ZXJDYXNlKCkgPz8gJyc7XG5cdGNvbnN0IGdyb3VwSWRMb3dlciA9IGdyb3VwSWQudG9Mb3dlckNhc2UoKTtcblxuXHRpZiAoY29udGV4dFZhbHVlLmluY2x1ZGVzKCd1bnRyYWNrZWQnKSB8fCBjb250ZXh0VmFsdWUuaW5jbHVkZXMoJ2FkZCcpKSB7XG5cdFx0cmV0dXJuICdhZGRlZCc7XG5cdH1cblx0aWYgKGNvbnRleHRWYWx1ZS5pbmNsdWRlcygnZGVsZXRlJykpIHtcblx0XHRyZXR1cm4gJ2RlbGV0ZWQnO1xuXHR9XG5cdGlmIChjb250ZXh0VmFsdWUuaW5jbHVkZXMoJ3JlbmFtZScpKSB7XG5cdFx0cmV0dXJuICdyZW5hbWVkJztcblx0fVxuXHRpZiAoZ3JvdXBJZExvd2VyLmluY2x1ZGVzKCd1bnRyYWNrZWQnKSkge1xuXHRcdHJldHVybiAnYWRkZWQnO1xuXHR9XG5cdGlmIChyZXNvdXJjZS5kZWNvcmF0aW9ucy5zdHJpa2VUaHJvdWdoKSB7XG5cdFx0cmV0dXJuICdkZWxldGVkJztcblx0fVxuXHRpZiAoIXJlc291cmNlLm11bHRpRGlmZkVkaXRvck9yaWdpbmFsVXJpKSB7XG5cdFx0cmV0dXJuICdhZGRlZCc7XG5cdH1cblx0cmV0dXJuICdtb2RpZmllZCc7XG59XG5cbi8qKlxuICogR2VuZXJhdGVzIGEgdW5pZmllZCBkaWZmIHN0cmluZyBjb21wYXRpYmxlIHdpdGggYGdpdCBhcHBseWAuXG4gKlxuICogTm90ZTogVGhpcyBpbXBsZW1lbnRhdGlvbiBoYXMgYSBrbm93biBsaW1pdGF0aW9uIC0gaWYgdGhlIG9ubHkgY2hhbmdlIGJldHdlZW5cbiAqIGZpbGVzIGlzIHRoZSBwcmVzZW5jZS9hYnNlbmNlIG9mIGEgdHJhaWxpbmcgbmV3bGluZSAoY29udGVudCBvdGhlcndpc2UgaWRlbnRpY2FsKSxcbiAqIG5vIGRpZmYgd2lsbCBiZSBnZW5lcmF0ZWQgYmVjYXVzZSBWUyBDb2RlJ3MgZGlmZiBhbGdvcml0aG0gdHJlYXRzIHRoZSBsaW5lcyBhcyBlcXVhbC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlVW5pZmllZERpZmYoXG5cdGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdHJlbFBhdGg6IHN0cmluZyxcblx0b3JpZ2luYWxVcmk6IFVSSSB8IHVuZGVmaW5lZCxcblx0bW9kaWZpZWRVcmk6IFVSSSxcblx0Y2hhbmdlVHlwZTogJ2FkZGVkJyB8ICdtb2RpZmllZCcgfCAnZGVsZXRlZCcgfCAncmVuYW1lZCdcbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdHRyeSB7XG5cdFx0bGV0IG9yaWdpbmFsQ29udGVudCA9ICcnO1xuXHRcdGxldCBtb2RpZmllZENvbnRlbnQgPSAnJztcblxuXHRcdGlmIChvcmlnaW5hbFVyaSAmJiBjaGFuZ2VUeXBlICE9PSAnYWRkZWQnKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBvcmlnaW5hbEZpbGUgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShvcmlnaW5hbFVyaSwgeyBsaW1pdHM6IHsgc2l6ZTogTUFYX0ZJTEVfU0laRV9CWVRFUyB9IH0pO1xuXHRcdFx0XHRjb25zdCBkZXRlY3RlZCA9IGRldGVjdEVuY29kaW5nRnJvbUJ1ZmZlcih7IGJ1ZmZlcjogb3JpZ2luYWxGaWxlLnZhbHVlLCBieXRlc1JlYWQ6IG9yaWdpbmFsRmlsZS52YWx1ZS5ieXRlTGVuZ3RoIH0pO1xuXHRcdFx0XHRpZiAoZGV0ZWN0ZWQuc2VlbXNCaW5hcnkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBza2lwIGJpbmFyeSBmaWxlc1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9yaWdpbmFsQ29udGVudCA9IG9yaWdpbmFsRmlsZS52YWx1ZS50b1N0cmluZygpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRpZiAoZSBpbnN0YW5jZW9mIEZpbGVPcGVyYXRpb25FcnJvciAmJiBlLmZpbGVPcGVyYXRpb25SZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9UT09fTEFSR0UpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBza2lwIGZpbGVzIGV4Y2VlZGluZyBzaXplIGxpbWl0XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNoYW5nZVR5cGUgPT09ICdtb2RpZmllZCcpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGNoYW5nZVR5cGUgIT09ICdkZWxldGVkJykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgbW9kaWZpZWRGaWxlID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUobW9kaWZpZWRVcmksIHsgbGltaXRzOiB7IHNpemU6IE1BWF9GSUxFX1NJWkVfQllURVMgfSB9KTtcblx0XHRcdFx0Y29uc3QgZGV0ZWN0ZWQgPSBkZXRlY3RFbmNvZGluZ0Zyb21CdWZmZXIoeyBidWZmZXI6IG1vZGlmaWVkRmlsZS52YWx1ZSwgYnl0ZXNSZWFkOiBtb2RpZmllZEZpbGUudmFsdWUuYnl0ZUxlbmd0aCB9KTtcblx0XHRcdFx0aWYgKGRldGVjdGVkLnNlZW1zQmluYXJ5KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gc2tpcCBiaW5hcnkgZmlsZXNcblx0XHRcdFx0fVxuXHRcdFx0XHRtb2RpZmllZENvbnRlbnQgPSBtb2RpZmllZEZpbGUudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBGaWxlT3BlcmF0aW9uRXJyb3IgJiYgZS5maWxlT3BlcmF0aW9uUmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfVE9PX0xBUkdFKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gc2tpcCBmaWxlcyBleGNlZWRpbmcgc2l6ZSBsaW1pdFxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3JpZ2luYWxMaW5lcyA9IG9yaWdpbmFsQ29udGVudC5zcGxpdCgnXFxuJyk7XG5cdFx0Y29uc3QgbW9kaWZpZWRMaW5lcyA9IG1vZGlmaWVkQ29udGVudC5zcGxpdCgnXFxuJyk7XG5cblx0XHQvLyBUcmFjayB3aGV0aGVyIGZpbGVzIGVuZCB3aXRoIG5ld2xpbmUgZm9yIGdpdCBhcHBseSBjb21wYXRpYmlsaXR5XG5cdFx0Ly8gc3BsaXQoJ1xcbicpIG9uIFwibGluZTFcXG5saW5lMlxcblwiIGdpdmVzIFtcImxpbmUxXCIsIFwibGluZTJcIiwgXCJcIl1cblx0XHQvLyBzcGxpdCgnXFxuJykgb24gXCJsaW5lMVxcbmxpbmUyXCIgZ2l2ZXMgW1wibGluZTFcIiwgXCJsaW5lMlwiXVxuXHRcdGNvbnN0IG9yaWdpbmFsRW5kc1dpdGhOZXdsaW5lID0gb3JpZ2luYWxDb250ZW50Lmxlbmd0aCA+IDAgJiYgb3JpZ2luYWxDb250ZW50LmVuZHNXaXRoKCdcXG4nKTtcblx0XHRjb25zdCBtb2RpZmllZEVuZHNXaXRoTmV3bGluZSA9IG1vZGlmaWVkQ29udGVudC5sZW5ndGggPiAwICYmIG1vZGlmaWVkQ29udGVudC5lbmRzV2l0aCgnXFxuJyk7XG5cblx0XHQvLyBSZW1vdmUgdHJhaWxpbmcgZW1wdHkgZWxlbWVudCBpZiBmaWxlIGVuZHMgd2l0aCBuZXdsaW5lXG5cdFx0aWYgKG9yaWdpbmFsRW5kc1dpdGhOZXdsaW5lICYmIG9yaWdpbmFsTGluZXMubGVuZ3RoID4gMCAmJiBvcmlnaW5hbExpbmVzW29yaWdpbmFsTGluZXMubGVuZ3RoIC0gMV0gPT09ICcnKSB7XG5cdFx0XHRvcmlnaW5hbExpbmVzLnBvcCgpO1xuXHRcdH1cblx0XHRpZiAobW9kaWZpZWRFbmRzV2l0aE5ld2xpbmUgJiYgbW9kaWZpZWRMaW5lcy5sZW5ndGggPiAwICYmIG1vZGlmaWVkTGluZXNbbW9kaWZpZWRMaW5lcy5sZW5ndGggLSAxXSA9PT0gJycpIHtcblx0XHRcdG1vZGlmaWVkTGluZXMucG9wKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlmZkxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGFQYXRoID0gY2hhbmdlVHlwZSA9PT0gJ2FkZGVkJyA/ICcvZGV2L251bGwnIDogYGEvJHtyZWxQYXRofWA7XG5cdFx0Y29uc3QgYlBhdGggPSBjaGFuZ2VUeXBlID09PSAnZGVsZXRlZCcgPyAnL2Rldi9udWxsJyA6IGBiLyR7cmVsUGF0aH1gO1xuXG5cdFx0ZGlmZkxpbmVzLnB1c2goYC0tLSAke2FQYXRofWApO1xuXHRcdGRpZmZMaW5lcy5wdXNoKGArKysgJHtiUGF0aH1gKTtcblxuXHRcdGlmIChjaGFuZ2VUeXBlID09PSAnYWRkZWQnKSB7XG5cdFx0XHRpZiAobW9kaWZpZWRMaW5lcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGRpZmZMaW5lcy5wdXNoKGBAQCAtMCwwICsxLCR7bW9kaWZpZWRMaW5lcy5sZW5ndGh9IEBAYCk7XG5cdFx0XHRcdGZvciAoY29uc3QgbGluZSBvZiBtb2RpZmllZExpbmVzKSB7XG5cdFx0XHRcdFx0ZGlmZkxpbmVzLnB1c2goYCske2xpbmV9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFtb2RpZmllZEVuZHNXaXRoTmV3bGluZSkge1xuXHRcdFx0XHRcdGRpZmZMaW5lcy5wdXNoKCdcXFxcIE5vIG5ld2xpbmUgYXQgZW5kIG9mIGZpbGUnKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoY2hhbmdlVHlwZSA9PT0gJ2RlbGV0ZWQnKSB7XG5cdFx0XHRpZiAob3JpZ2luYWxMaW5lcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGRpZmZMaW5lcy5wdXNoKGBAQCAtMSwke29yaWdpbmFsTGluZXMubGVuZ3RofSArMCwwIEBAYCk7XG5cdFx0XHRcdGZvciAoY29uc3QgbGluZSBvZiBvcmlnaW5hbExpbmVzKSB7XG5cdFx0XHRcdFx0ZGlmZkxpbmVzLnB1c2goYC0ke2xpbmV9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFvcmlnaW5hbEVuZHNXaXRoTmV3bGluZSkge1xuXHRcdFx0XHRcdGRpZmZMaW5lcy5wdXNoKCdcXFxcIE5vIG5ld2xpbmUgYXQgZW5kIG9mIGZpbGUnKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBodW5rcyA9IGNvbXB1dGVEaWZmSHVua3Mob3JpZ2luYWxMaW5lcywgbW9kaWZpZWRMaW5lcywgb3JpZ2luYWxFbmRzV2l0aE5ld2xpbmUsIG1vZGlmaWVkRW5kc1dpdGhOZXdsaW5lKTtcblx0XHRcdGZvciAoY29uc3QgaHVuayBvZiBodW5rcykge1xuXHRcdFx0XHRkaWZmTGluZXMucHVzaChodW5rKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZGlmZkxpbmVzLmpvaW4oJ1xcbicpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8qKlxuICogQ29tcHV0ZXMgdW5pZmllZCBkaWZmIGh1bmtzIHVzaW5nIFZTIENvZGUncyBkaWZmIGFsZ29yaXRobS5cbiAqIE1lcmdlcyBhZGphY2VudC9vdmVybGFwcGluZyBodW5rcyB0byBwcm9kdWNlIGEgdmFsaWQgcGF0Y2guXG4gKi9cbmZ1bmN0aW9uIGNvbXB1dGVEaWZmSHVua3MoXG5cdG9yaWdpbmFsTGluZXM6IHN0cmluZ1tdLFxuXHRtb2RpZmllZExpbmVzOiBzdHJpbmdbXSxcblx0b3JpZ2luYWxFbmRzV2l0aE5ld2xpbmU6IGJvb2xlYW4sXG5cdG1vZGlmaWVkRW5kc1dpdGhOZXdsaW5lOiBib29sZWFuXG4pOiBzdHJpbmdbXSB7XG5cdGNvbnN0IGNvbnRleHRTaXplID0gMztcblx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXG5cdGNvbnN0IGRpZmZDb21wdXRlciA9IGxpbmVzRGlmZkNvbXB1dGVycy5nZXREZWZhdWx0KCk7XG5cdGNvbnN0IGRpZmZSZXN1bHQgPSBkaWZmQ29tcHV0ZXIuY29tcHV0ZURpZmYob3JpZ2luYWxMaW5lcywgbW9kaWZpZWRMaW5lcywge1xuXHRcdGlnbm9yZVRyaW1XaGl0ZXNwYWNlOiBmYWxzZSxcblx0XHRtYXhDb21wdXRhdGlvblRpbWVNczogMTAwMCxcblx0XHRjb21wdXRlTW92ZXM6IGZhbHNlXG5cdH0pO1xuXG5cdGlmIChkaWZmUmVzdWx0LmNoYW5nZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8vIEdyb3VwIGNoYW5nZXMgdGhhdCBzaG91bGQgYmUgbWVyZ2VkIGludG8gdGhlIHNhbWUgaHVua1xuXHQvLyBDaGFuZ2VzIGFyZSBtZXJnZWQgaWYgdGhlaXIgY29udGV4dCByZWdpb25zIHdvdWxkIG92ZXJsYXBcblx0dHlwZSBDaGFuZ2UgPSB0eXBlb2YgZGlmZlJlc3VsdC5jaGFuZ2VzW251bWJlcl07XG5cdGNvbnN0IGh1bmtHcm91cHM6IENoYW5nZVtdW10gPSBbXTtcblx0bGV0IGN1cnJlbnRHcm91cDogQ2hhbmdlW10gPSBbXTtcblxuXHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBkaWZmUmVzdWx0LmNoYW5nZXMpIHtcblx0XHRpZiAoY3VycmVudEdyb3VwLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Y3VycmVudEdyb3VwLnB1c2goY2hhbmdlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgbGFzdENoYW5nZSA9IGN1cnJlbnRHcm91cFtjdXJyZW50R3JvdXAubGVuZ3RoIC0gMV07XG5cdFx0XHRjb25zdCBsYXN0Q29udGV4dEVuZCA9IGxhc3RDaGFuZ2Uub3JpZ2luYWwuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSAtIDEgKyBjb250ZXh0U2l6ZTtcblx0XHRcdGNvbnN0IGN1cnJlbnRDb250ZXh0U3RhcnQgPSBjaGFuZ2Uub3JpZ2luYWwuc3RhcnRMaW5lTnVtYmVyIC0gY29udGV4dFNpemU7XG5cblx0XHRcdC8vIE1lcmdlIGlmIGNvbnRleHQgcmVnaW9ucyBvdmVybGFwIG9yIGFyZSBhZGphY2VudFxuXHRcdFx0aWYgKGN1cnJlbnRDb250ZXh0U3RhcnQgPD0gbGFzdENvbnRleHRFbmQgKyAxKSB7XG5cdFx0XHRcdGN1cnJlbnRHcm91cC5wdXNoKGNoYW5nZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRodW5rR3JvdXBzLnB1c2goY3VycmVudEdyb3VwKTtcblx0XHRcdFx0Y3VycmVudEdyb3VwID0gW2NoYW5nZV07XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdGlmIChjdXJyZW50R3JvdXAubGVuZ3RoID4gMCkge1xuXHRcdGh1bmtHcm91cHMucHVzaChjdXJyZW50R3JvdXApO1xuXHR9XG5cblx0Ly8gR2VuZXJhdGUgYSBzaW5nbGUgaHVuayBmb3IgZWFjaCBncm91cFxuXHRmb3IgKGNvbnN0IGdyb3VwIG9mIGh1bmtHcm91cHMpIHtcblx0XHRjb25zdCBmaXJzdENoYW5nZSA9IGdyb3VwWzBdO1xuXHRcdGNvbnN0IGxhc3RDaGFuZ2UgPSBncm91cFtncm91cC5sZW5ndGggLSAxXTtcblxuXHRcdGNvbnN0IGh1bmtPcmlnU3RhcnQgPSBNYXRoLm1heCgxLCBmaXJzdENoYW5nZS5vcmlnaW5hbC5zdGFydExpbmVOdW1iZXIgLSBjb250ZXh0U2l6ZSk7XG5cdFx0Y29uc3QgaHVua09yaWdFbmQgPSBNYXRoLm1pbihvcmlnaW5hbExpbmVzLmxlbmd0aCwgbGFzdENoYW5nZS5vcmlnaW5hbC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIC0gMSArIGNvbnRleHRTaXplKTtcblx0XHRjb25zdCBodW5rTW9kU3RhcnQgPSBNYXRoLm1heCgxLCBmaXJzdENoYW5nZS5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIgLSBjb250ZXh0U2l6ZSk7XG5cblx0XHRjb25zdCBodW5rTGluZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Ly8gVHJhY2sgd2hpY2ggbGluZSBpbiBodW5rTGluZXMgY29ycmVzcG9uZHMgdG8gdGhlIGxhc3QgbGluZSBvZiBlYWNoIGZpbGVcblx0XHRsZXQgbGFzdE9yaWdpbmFsTGluZUluZGV4ID0gLTE7XG5cdFx0bGV0IGxhc3RNb2RpZmllZExpbmVJbmRleCA9IC0xO1xuXG5cdFx0bGV0IG9yaWdMaW5lTnVtID0gaHVua09yaWdTdGFydDtcblx0XHRsZXQgb3JpZ0NvdW50ID0gMDtcblx0XHRsZXQgbW9kQ291bnQgPSAwO1xuXG5cdFx0Ly8gUHJvY2VzcyBlYWNoIGNoYW5nZSBpbiB0aGUgZ3JvdXAsIGVtaXR0aW5nIGNvbnRleHQgbGluZXMgYmV0d2VlbiB0aGVtXG5cdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgZ3JvdXApIHtcblx0XHRcdGNvbnN0IG9yaWdTdGFydCA9IGNoYW5nZS5vcmlnaW5hbC5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBvcmlnRW5kID0gY2hhbmdlLm9yaWdpbmFsLmVuZExpbmVOdW1iZXJFeGNsdXNpdmU7XG5cdFx0XHRjb25zdCBtb2RTdGFydCA9IGNoYW5nZS5tb2RpZmllZC5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBtb2RFbmQgPSBjaGFuZ2UubW9kaWZpZWQuZW5kTGluZU51bWJlckV4Y2x1c2l2ZTtcblxuXHRcdFx0Ly8gRW1pdCBjb250ZXh0IGxpbmVzIGJlZm9yZSB0aGlzIGNoYW5nZVxuXHRcdFx0d2hpbGUgKG9yaWdMaW5lTnVtIDwgb3JpZ1N0YXJ0KSB7XG5cdFx0XHRcdGNvbnN0IGlkeCA9IGh1bmtMaW5lcy5sZW5ndGg7XG5cdFx0XHRcdGh1bmtMaW5lcy5wdXNoKGAgJHtvcmlnaW5hbExpbmVzW29yaWdMaW5lTnVtIC0gMV19YCk7XG5cdFx0XHRcdC8vIENvbnRleHQgbGluZXMgYXJlIGluIGJvdGggZmlsZXNcblx0XHRcdFx0aWYgKG9yaWdMaW5lTnVtID09PSBvcmlnaW5hbExpbmVzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGxhc3RPcmlnaW5hbExpbmVJbmRleCA9IGlkeDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBtb2RMaW5lTnVtID0gaHVua01vZFN0YXJ0ICsgbW9kQ291bnQ7XG5cdFx0XHRcdGlmIChtb2RMaW5lTnVtID09PSBtb2RpZmllZExpbmVzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGxhc3RNb2RpZmllZExpbmVJbmRleCA9IGlkeDtcblx0XHRcdFx0fVxuXHRcdFx0XHRvcmlnTGluZU51bSsrO1xuXHRcdFx0XHRvcmlnQ291bnQrKztcblx0XHRcdFx0bW9kQ291bnQrKztcblx0XHRcdH1cblxuXHRcdFx0Ly8gRW1pdCBkZWxldGVkIGxpbmVzXG5cdFx0XHRmb3IgKGxldCBpID0gb3JpZ1N0YXJ0OyBpIDwgb3JpZ0VuZDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGlkeCA9IGh1bmtMaW5lcy5sZW5ndGg7XG5cdFx0XHRcdGh1bmtMaW5lcy5wdXNoKGAtJHtvcmlnaW5hbExpbmVzW2kgLSAxXX1gKTtcblx0XHRcdFx0aWYgKGkgPT09IG9yaWdpbmFsTGluZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0bGFzdE9yaWdpbmFsTGluZUluZGV4ID0gaWR4O1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9yaWdMaW5lTnVtKys7XG5cdFx0XHRcdG9yaWdDb3VudCsrO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBFbWl0IGFkZGVkIGxpbmVzXG5cdFx0XHRmb3IgKGxldCBpID0gbW9kU3RhcnQ7IGkgPCBtb2RFbmQ7IGkrKykge1xuXHRcdFx0XHRjb25zdCBpZHggPSBodW5rTGluZXMubGVuZ3RoO1xuXHRcdFx0XHRodW5rTGluZXMucHVzaChgKyR7bW9kaWZpZWRMaW5lc1tpIC0gMV19YCk7XG5cdFx0XHRcdGlmIChpID09PSBtb2RpZmllZExpbmVzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGxhc3RNb2RpZmllZExpbmVJbmRleCA9IGlkeDtcblx0XHRcdFx0fVxuXHRcdFx0XHRtb2RDb3VudCsrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEVtaXQgdHJhaWxpbmcgY29udGV4dCBsaW5lc1xuXHRcdHdoaWxlIChvcmlnTGluZU51bSA8PSBodW5rT3JpZ0VuZCkge1xuXHRcdFx0Y29uc3QgaWR4ID0gaHVua0xpbmVzLmxlbmd0aDtcblx0XHRcdGh1bmtMaW5lcy5wdXNoKGAgJHtvcmlnaW5hbExpbmVzW29yaWdMaW5lTnVtIC0gMV19YCk7XG5cdFx0XHQvLyBDb250ZXh0IGxpbmVzIGFyZSBpbiBib3RoIGZpbGVzXG5cdFx0XHRpZiAob3JpZ0xpbmVOdW0gPT09IG9yaWdpbmFsTGluZXMubGVuZ3RoKSB7XG5cdFx0XHRcdGxhc3RPcmlnaW5hbExpbmVJbmRleCA9IGlkeDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1vZExpbmVOdW0gPSBodW5rTW9kU3RhcnQgKyBtb2RDb3VudDtcblx0XHRcdGlmIChtb2RMaW5lTnVtID09PSBtb2RpZmllZExpbmVzLmxlbmd0aCkge1xuXHRcdFx0XHRsYXN0TW9kaWZpZWRMaW5lSW5kZXggPSBpZHg7XG5cdFx0XHR9XG5cdFx0XHRvcmlnTGluZU51bSsrO1xuXHRcdFx0b3JpZ0NvdW50Kys7XG5cdFx0XHRtb2RDb3VudCsrO1xuXHRcdH1cblxuXHRcdHJlc3VsdC5wdXNoKGBAQCAtJHtodW5rT3JpZ1N0YXJ0fSwke29yaWdDb3VudH0gKyR7aHVua01vZFN0YXJ0fSwke21vZENvdW50fSBAQGApO1xuXG5cdFx0Ly8gQWRkIFwiTm8gbmV3bGluZSBhdCBlbmQgb2YgZmlsZVwiIG1hcmtlcnMgZm9yIGdpdCBhcHBseSBjb21wYXRpYmlsaXR5XG5cdFx0Ly8gVGhlIG1hcmtlciBtdXN0IGFwcGVhciBpbW1lZGlhdGVseSBhZnRlciB0aGUgbGluZSB0aGF0IGxhY2tzIGEgbmV3bGluZVxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaHVua0xpbmVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRyZXN1bHQucHVzaChodW5rTGluZXNbaV0pO1xuXG5cdFx0XHRjb25zdCBpc0xhc3RPcmlnaW5hbCA9IGkgPT09IGxhc3RPcmlnaW5hbExpbmVJbmRleDtcblx0XHRcdGNvbnN0IGlzTGFzdE1vZGlmaWVkID0gaSA9PT0gbGFzdE1vZGlmaWVkTGluZUluZGV4O1xuXG5cdFx0XHRpZiAoaXNMYXN0T3JpZ2luYWwgJiYgaXNMYXN0TW9kaWZpZWQpIHtcblx0XHRcdFx0Ly8gQ29udGV4dCBsaW5lIGlzIHRoZSBsYXN0IGxpbmUgb2YgYm90aCBmaWxlc1xuXHRcdFx0XHQvLyBJZiBlaXRoZXIgbGFja3MgbmV3bGluZSwgd2UgbmVlZCBhIG1hcmtlciAoYnV0IG9ubHkgb25lKVxuXHRcdFx0XHRpZiAoIW9yaWdpbmFsRW5kc1dpdGhOZXdsaW5lIHx8ICFtb2RpZmllZEVuZHNXaXRoTmV3bGluZSkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKCdcXFxcIE5vIG5ld2xpbmUgYXQgZW5kIG9mIGZpbGUnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChpc0xhc3RPcmlnaW5hbCAmJiAhb3JpZ2luYWxFbmRzV2l0aE5ld2xpbmUpIHtcblx0XHRcdFx0Ly8gRGVsZXRpb24gb3IgY29udGV4dCBsaW5lIHRoYXQncyBvbmx5IHRoZSBsYXN0IG9mIG9yaWdpbmFsXG5cdFx0XHRcdHJlc3VsdC5wdXNoKCdcXFxcIE5vIG5ld2xpbmUgYXQgZW5kIG9mIGZpbGUnKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNMYXN0TW9kaWZpZWQgJiYgIW1vZGlmaWVkRW5kc1dpdGhOZXdsaW5lKSB7XG5cdFx0XHRcdC8vIEFkZGl0aW9uIG9yIGNvbnRleHQgbGluZSB0aGF0J3Mgb25seSB0aGUgbGFzdCBvZiBtb2RpZmllZFxuXHRcdFx0XHRyZXN1bHQucHVzaCgnXFxcXCBObyBuZXdsaW5lIGF0IGVuZCBvZiBmaWxlJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBDYXB0dXJlcyBsaWdodHdlaWdodCByZXBvc2l0b3J5IG1ldGFkYXRhIChicmFuY2gsIGNvbW1pdCwgcmVtb3RlKSBmcm9tIFNDTSBwcm92aWRlcnMuXG4gKiBObyBmaWxlIEkvTyBvciBkaWZmIGNvbXB1dGF0aW9uIC0gcmVhZHMgb25seSBmcm9tIGFscmVhZHktbG9hZGVkIFNDTSBvYnNlcnZhYmxlcy5cbiAqIFVzZWQgb24gY2hhdCBtZXNzYWdlIHN1Ym1pc3Npb24gdG8gcmVjb3JkIHRoZSBwb2ludC1pbi10aW1lIGNvbW1pdCBzdGF0ZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhcHR1cmVSZXBvTWV0YWRhdGEoc2NtU2VydmljZTogSVNDTVNlcnZpY2UpOiBJRXhwb3J0YWJsZVJlcG9EYXRhIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcmVwb3NpdG9yaWVzID0gWy4uLnNjbVNlcnZpY2UucmVwb3NpdG9yaWVzXTtcblx0aWYgKHJlcG9zaXRvcmllcy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgcmVwb3NpdG9yeSA9IHJlcG9zaXRvcmllc1swXTtcblx0Y29uc3Qgcm9vdFVyaSA9IHJlcG9zaXRvcnkucHJvdmlkZXIucm9vdFVyaTtcblx0aWYgKCFyb290VXJpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGxldCBsb2NhbEJyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsZXQgbG9jYWxIZWFkQ29tbWl0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxldCByZW1vdGVUcmFja2luZ0JyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsZXQgcmVtb3RlSGVhZENvbW1pdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsZXQgcmVtb3RlQmFzZUJyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0IGhpc3RvcnlQcm92aWRlciA9IHJlcG9zaXRvcnkucHJvdmlkZXIuaGlzdG9yeVByb3ZpZGVyPy5nZXQoKTtcblx0aWYgKGhpc3RvcnlQcm92aWRlcikge1xuXHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVmID0gaGlzdG9yeVByb3ZpZGVyLmhpc3RvcnlJdGVtUmVmLmdldCgpO1xuXHRcdGxvY2FsQnJhbmNoID0gaGlzdG9yeUl0ZW1SZWY/Lm5hbWU7XG5cdFx0bG9jYWxIZWFkQ29tbWl0ID0gaGlzdG9yeUl0ZW1SZWY/LnJldmlzaW9uO1xuXG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZW1vdGVSZWYgPSBoaXN0b3J5UHJvdmlkZXIuaGlzdG9yeUl0ZW1SZW1vdGVSZWYuZ2V0KCk7XG5cdFx0aWYgKGhpc3RvcnlJdGVtUmVtb3RlUmVmKSB7XG5cdFx0XHRyZW1vdGVUcmFja2luZ0JyYW5jaCA9IGhpc3RvcnlJdGVtUmVtb3RlUmVmLm5hbWU7XG5cdFx0XHRyZW1vdGVIZWFkQ29tbWl0ID0gaGlzdG9yeUl0ZW1SZW1vdGVSZWYucmV2aXNpb247XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1CYXNlUmVmID0gaGlzdG9yeVByb3ZpZGVyLmhpc3RvcnlJdGVtQmFzZVJlZi5nZXQoKTtcblx0XHRpZiAoaGlzdG9yeUl0ZW1CYXNlUmVmKSB7XG5cdFx0XHRyZW1vdGVCYXNlQnJhbmNoID0gaGlzdG9yeUl0ZW1CYXNlUmVmLm5hbWU7XG5cdFx0fVxuXHR9XG5cblx0Ly8gRGV0ZXJtaW5lIHdvcmtzcGFjZSB0eXBlIGFuZCBzeW5jIHN0YXR1cyB3aXRob3V0IGZpbGUgSS9PLlxuXHQvLyBDYW5ub3QgZGV0ZXJtaW5lIHJlbW90ZVVybC9yZW1vdGVWZW5kb3Igb3IgZGV0ZWN0IHBsYWluLWZvbGRlciBoZXJlIChyZXF1aXJlcyByZWFkaW5nIC5naXQvY29uZmlnKS5cblx0Ly8gVGhlIGZ1bGwgY2FwdHVyZVJlcG9JbmZvIGF0IGV4cG9ydCB0aW1lIHdpbGwgcHJvZHVjZSBhY2N1cmF0ZSBjbGFzc2lmaWNhdGlvbi5cblx0bGV0IHdvcmtzcGFjZVR5cGU6IElFeHBvcnRhYmxlUmVwb0RhdGFbJ3dvcmtzcGFjZVR5cGUnXTtcblx0bGV0IHN5bmNTdGF0dXM6IElFeHBvcnRhYmxlUmVwb0RhdGFbJ3N5bmNTdGF0dXMnXTtcblxuXHRpZiAocmVtb3RlVHJhY2tpbmdCcmFuY2ggfHwgcmVtb3RlSGVhZENvbW1pdCB8fCByZW1vdGVCYXNlQnJhbmNoKSB7XG5cdFx0d29ya3NwYWNlVHlwZSA9ICdyZW1vdGUtZ2l0JztcblxuXHRcdGlmICghcmVtb3RlVHJhY2tpbmdCcmFuY2gpIHtcblx0XHRcdHN5bmNTdGF0dXMgPSAndW5wdWJsaXNoZWQnO1xuXHRcdH0gZWxzZSBpZiAobG9jYWxIZWFkQ29tbWl0ICYmIHJlbW90ZUhlYWRDb21taXQgJiYgbG9jYWxIZWFkQ29tbWl0ID09PSByZW1vdGVIZWFkQ29tbWl0KSB7XG5cdFx0XHRzeW5jU3RhdHVzID0gJ3N5bmNlZCc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN5bmNTdGF0dXMgPSAndW5wdXNoZWQnO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHQvLyBObyByZW1vdGUgcmVmcyBhdmFpbGFibGU7IGNvbnNlcnZhdGl2ZWx5IGNsYXNzaWZ5IGFzIGxvY2FsLWdpdFxuXHRcdHdvcmtzcGFjZVR5cGUgPSAnbG9jYWwtZ2l0Jztcblx0XHRzeW5jU3RhdHVzID0gJ2xvY2FsLW9ubHknO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHR3b3Jrc3BhY2VUeXBlLFxuXHRcdHN5bmNTdGF0dXMsXG5cdFx0bG9jYWxCcmFuY2gsXG5cdFx0cmVtb3RlVHJhY2tpbmdCcmFuY2gsXG5cdFx0cmVtb3RlQmFzZUJyYW5jaCxcblx0XHRsb2NhbEhlYWRDb21taXQsXG5cdFx0cmVtb3RlSGVhZENvbW1pdCxcblx0XHRkaWZmc1N0YXR1czogJ25vdENhcHR1cmVkJyxcblx0fTtcbn1cblxuLyoqXG4gKiBDYXB0dXJlcyBmdWxsIHJlcG9zaXRvcnkgc3RhdGUgaW5jbHVkaW5nIHdvcmtpbmcgdHJlZSBkaWZmcy5cbiAqIFBlcmZvcm1zIGZpbGUgSS9PIGFuZCBkaWZmIGNvbXB1dGF0aW9uIC0gc2hvdWxkIG9ubHkgYmUgY2FsbGVkIG9uIGV4cGxpY2l0IHVzZXIgYWN0aW9uIChlLmcuLCBleHBvcnQpLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY2FwdHVyZVJlcG9JbmZvKHNjbVNlcnZpY2U6IElTQ01TZXJ2aWNlLCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlKTogUHJvbWlzZTxJRXhwb3J0YWJsZVJlcG9EYXRhIHwgdW5kZWZpbmVkPiB7XG5cdGNvbnN0IHJlcG9zaXRvcmllcyA9IFsuLi5zY21TZXJ2aWNlLnJlcG9zaXRvcmllc107XG5cdGlmIChyZXBvc2l0b3JpZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IHJlcG9zaXRvcnkgPSByZXBvc2l0b3JpZXNbMF07XG5cdGNvbnN0IHJvb3RVcmkgPSByZXBvc2l0b3J5LnByb3ZpZGVyLnJvb3RVcmk7XG5cdGlmICghcm9vdFVyaSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRsZXQgaGFzR2l0ID0gZmFsc2U7XG5cdHRyeSB7XG5cdFx0Y29uc3QgZ2l0RGlyVXJpID0gcm9vdFVyaS53aXRoKHsgcGF0aDogYCR7cm9vdFVyaS5wYXRofS8uZ2l0YCB9KTtcblx0XHRoYXNHaXQgPSBhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoZ2l0RGlyVXJpKTtcblx0fSBjYXRjaCB7XG5cdFx0Ly8gaWdub3JlXG5cdH1cblxuXHRpZiAoIWhhc0dpdCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHR3b3Jrc3BhY2VUeXBlOiAncGxhaW4tZm9sZGVyJyxcblx0XHRcdHN5bmNTdGF0dXM6ICduby1naXQnLFxuXHRcdFx0ZGlmZnM6IHVuZGVmaW5lZFxuXHRcdH07XG5cdH1cblxuXHRsZXQgcmVtb3RlVXJsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHRyeSB7XG5cdFx0Ly8gVE9ETzogSGFuZGxlIGdpdCB3b3JrdHJlZXMgd2hlcmUgLmdpdCBpcyBhIGZpbGUgcG9pbnRpbmcgdG8gdGhlIGFjdHVhbCBnaXQgZGlyZWN0b3J5XG5cdFx0Y29uc3QgZ2l0Q29uZmlnVXJpID0gcm9vdFVyaS53aXRoKHsgcGF0aDogYCR7cm9vdFVyaS5wYXRofS8uZ2l0L2NvbmZpZ2AgfSk7XG5cdFx0Y29uc3QgZXhpc3RzID0gYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKGdpdENvbmZpZ1VyaSk7XG5cdFx0aWYgKGV4aXN0cykge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKGdpdENvbmZpZ1VyaSk7XG5cdFx0XHRjb25zdCByZW1vdGVzID0gZ2V0UmF3UmVtb3Rlcyhjb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdFx0cmVtb3RlVXJsID0gcmVtb3Rlc1swXTtcblx0XHR9XG5cdH0gY2F0Y2gge1xuXHRcdC8vIGlnbm9yZVxuXHR9XG5cblx0bGV0IGxvY2FsQnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxldCBsb2NhbEhlYWRDb21taXQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGV0IHJlbW90ZVRyYWNraW5nQnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxldCByZW1vdGVIZWFkQ29tbWl0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxldCByZW1vdGVCYXNlQnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3QgaGlzdG9yeVByb3ZpZGVyID0gcmVwb3NpdG9yeS5wcm92aWRlci5oaXN0b3J5UHJvdmlkZXI/LmdldCgpO1xuXHRpZiAoaGlzdG9yeVByb3ZpZGVyKSB7XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZWYgPSBoaXN0b3J5UHJvdmlkZXIuaGlzdG9yeUl0ZW1SZWYuZ2V0KCk7XG5cdFx0bG9jYWxCcmFuY2ggPSBoaXN0b3J5SXRlbVJlZj8ubmFtZTtcblx0XHRsb2NhbEhlYWRDb21taXQgPSBoaXN0b3J5SXRlbVJlZj8ucmV2aXNpb247XG5cblx0XHRjb25zdCBoaXN0b3J5SXRlbVJlbW90ZVJlZiA9IGhpc3RvcnlQcm92aWRlci5oaXN0b3J5SXRlbVJlbW90ZVJlZi5nZXQoKTtcblx0XHRpZiAoaGlzdG9yeUl0ZW1SZW1vdGVSZWYpIHtcblx0XHRcdHJlbW90ZVRyYWNraW5nQnJhbmNoID0gaGlzdG9yeUl0ZW1SZW1vdGVSZWYubmFtZTtcblx0XHRcdHJlbW90ZUhlYWRDb21taXQgPSBoaXN0b3J5SXRlbVJlbW90ZVJlZi5yZXZpc2lvbjtcblx0XHR9XG5cblx0XHRjb25zdCBoaXN0b3J5SXRlbUJhc2VSZWYgPSBoaXN0b3J5UHJvdmlkZXIuaGlzdG9yeUl0ZW1CYXNlUmVmLmdldCgpO1xuXHRcdGlmIChoaXN0b3J5SXRlbUJhc2VSZWYpIHtcblx0XHRcdHJlbW90ZUJhc2VCcmFuY2ggPSBoaXN0b3J5SXRlbUJhc2VSZWYubmFtZTtcblx0XHR9XG5cdH1cblxuXHRsZXQgd29ya3NwYWNlVHlwZTogSUV4cG9ydGFibGVSZXBvRGF0YVsnd29ya3NwYWNlVHlwZSddO1xuXHRsZXQgc3luY1N0YXR1czogSUV4cG9ydGFibGVSZXBvRGF0YVsnc3luY1N0YXR1cyddO1xuXG5cdGlmICghcmVtb3RlVXJsKSB7XG5cdFx0d29ya3NwYWNlVHlwZSA9ICdsb2NhbC1naXQnO1xuXHRcdHN5bmNTdGF0dXMgPSAnbG9jYWwtb25seSc7XG5cdH0gZWxzZSB7XG5cdFx0d29ya3NwYWNlVHlwZSA9ICdyZW1vdGUtZ2l0JztcblxuXHRcdGlmICghcmVtb3RlVHJhY2tpbmdCcmFuY2gpIHtcblx0XHRcdHN5bmNTdGF0dXMgPSAndW5wdWJsaXNoZWQnO1xuXHRcdH0gZWxzZSBpZiAobG9jYWxIZWFkQ29tbWl0ID09PSByZW1vdGVIZWFkQ29tbWl0KSB7XG5cdFx0XHRzeW5jU3RhdHVzID0gJ3N5bmNlZCc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN5bmNTdGF0dXMgPSAndW5wdXNoZWQnO1xuXHRcdH1cblx0fVxuXG5cdGxldCByZW1vdGVWZW5kb3I6IElFeHBvcnRhYmxlUmVwb0RhdGFbJ3JlbW90ZVZlbmRvciddO1xuXHRpZiAocmVtb3RlVXJsKSB7XG5cdFx0Y29uc3QgaG9zdCA9IGdldFJlbW90ZUhvc3QocmVtb3RlVXJsKTtcblx0XHRpZiAoaG9zdCA9PT0gJ2dpdGh1Yi5jb20nKSB7XG5cdFx0XHRyZW1vdGVWZW5kb3IgPSAnZ2l0aHViJztcblx0XHR9IGVsc2UgaWYgKGhvc3QgPT09ICdkZXYuYXp1cmUuY29tJyB8fCAoaG9zdCAmJiBob3N0LmVuZHNXaXRoKCcudmlzdWFsc3R1ZGlvLmNvbScpKSkge1xuXHRcdFx0cmVtb3RlVmVuZG9yID0gJ2Fkbyc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlbW90ZVZlbmRvciA9ICdvdGhlcic7XG5cdFx0fVxuXHR9XG5cblx0bGV0IHRvdGFsQ2hhbmdlQ291bnQgPSAwO1xuXHRmb3IgKGNvbnN0IGdyb3VwIG9mIHJlcG9zaXRvcnkucHJvdmlkZXIuZ3JvdXBzKSB7XG5cdFx0dG90YWxDaGFuZ2VDb3VudCArPSBncm91cC5yZXNvdXJjZXMubGVuZ3RoO1xuXHR9XG5cblx0Y29uc3QgYmFzZVJlcG9EYXRhOiBPbWl0PElFeHBvcnRhYmxlUmVwb0RhdGEsICdkaWZmcycgfCAnZGlmZnNTdGF0dXMnIHwgJ2NoYW5nZWRGaWxlQ291bnQnPiA9IHtcblx0XHR3b3Jrc3BhY2VUeXBlLFxuXHRcdHN5bmNTdGF0dXMsXG5cdFx0cmVtb3RlVXJsLFxuXHRcdHJlbW90ZVZlbmRvcixcblx0XHRsb2NhbEJyYW5jaCxcblx0XHRyZW1vdGVUcmFja2luZ0JyYW5jaCxcblx0XHRyZW1vdGVCYXNlQnJhbmNoLFxuXHRcdGxvY2FsSGVhZENvbW1pdCxcblx0XHRyZW1vdGVIZWFkQ29tbWl0LFxuXHR9O1xuXG5cdGlmICh0b3RhbENoYW5nZUNvdW50ID09PSAwKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmJhc2VSZXBvRGF0YSxcblx0XHRcdGRpZmZzOiB1bmRlZmluZWQsXG5cdFx0XHRkaWZmc1N0YXR1czogJ25vQ2hhbmdlcycsXG5cdFx0XHRjaGFuZ2VkRmlsZUNvdW50OiAwXG5cdFx0fTtcblx0fVxuXG5cdGlmICh0b3RhbENoYW5nZUNvdW50ID4gTUFYX0NIQU5HRVMpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uYmFzZVJlcG9EYXRhLFxuXHRcdFx0ZGlmZnM6IHVuZGVmaW5lZCxcblx0XHRcdGRpZmZzU3RhdHVzOiAndG9vTWFueUNoYW5nZXMnLFxuXHRcdFx0Y2hhbmdlZEZpbGVDb3VudDogdG90YWxDaGFuZ2VDb3VudFxuXHRcdH07XG5cdH1cblxuXHRjb25zdCBkaWZmczogSUV4cG9ydGFibGVSZXBvRGlmZltdID0gW107XG5cdGNvbnN0IGRpZmZQcm9taXNlczogUHJvbWlzZTxJRXhwb3J0YWJsZVJlcG9EaWZmIHwgdW5kZWZpbmVkPltdID0gW107XG5cblx0Zm9yIChjb25zdCBncm91cCBvZiByZXBvc2l0b3J5LnByb3ZpZGVyLmdyb3Vwcykge1xuXHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgZ3JvdXAucmVzb3VyY2VzKSB7XG5cdFx0XHRjb25zdCByZWxQYXRoID0gcmVsYXRpdmVQYXRoKHJvb3RVcmksIHJlc291cmNlLnNvdXJjZVVyaSkgPz8gcmVzb3VyY2Uuc291cmNlVXJpLnBhdGg7XG5cdFx0XHRjb25zdCBjaGFuZ2VUeXBlID0gZGV0ZXJtaW5lQ2hhbmdlVHlwZShyZXNvdXJjZSwgZ3JvdXAuaWQpO1xuXG5cdFx0XHRjb25zdCBkaWZmUHJvbWlzZSA9IChhc3luYyAoKTogUHJvbWlzZTxJRXhwb3J0YWJsZVJlcG9EaWZmIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRcdGNvbnN0IHVuaWZpZWREaWZmID0gYXdhaXQgZ2VuZXJhdGVVbmlmaWVkRGlmZihcblx0XHRcdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdFx0XHRyZWxQYXRoLFxuXHRcdFx0XHRcdHJlc291cmNlLm11bHRpRGlmZkVkaXRvck9yaWdpbmFsVXJpLFxuXHRcdFx0XHRcdHJlc291cmNlLnNvdXJjZVVyaSxcblx0XHRcdFx0XHRjaGFuZ2VUeXBlXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRyZWxhdGl2ZVBhdGg6IHJlbFBhdGgsXG5cdFx0XHRcdFx0Y2hhbmdlVHlwZSxcblx0XHRcdFx0XHRzdGF0dXM6IGdyb3VwLmxhYmVsIHx8IGdyb3VwLmlkLFxuXHRcdFx0XHRcdHVuaWZpZWREaWZmXG5cdFx0XHRcdH07XG5cdFx0XHR9KSgpO1xuXG5cdFx0XHRkaWZmUHJvbWlzZXMucHVzaChkaWZmUHJvbWlzZSk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgZ2VuZXJhdGVkRGlmZnMgPSBhd2FpdCBQcm9taXNlLmFsbChkaWZmUHJvbWlzZXMpO1xuXHRmb3IgKGNvbnN0IGRpZmYgb2YgZ2VuZXJhdGVkRGlmZnMpIHtcblx0XHRpZiAoZGlmZikge1xuXHRcdFx0ZGlmZnMucHVzaChkaWZmKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBkaWZmc0pzb24gPSBKU09OLnN0cmluZ2lmeShkaWZmcyk7XG5cdGNvbnN0IGRpZmZzU2l6ZUJ5dGVzID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKGRpZmZzSnNvbikubGVuZ3RoO1xuXG5cdGlmIChkaWZmc1NpemVCeXRlcyA+IE1BWF9ESUZGU19TSVpFX0JZVEVTKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmJhc2VSZXBvRGF0YSxcblx0XHRcdGRpZmZzOiB1bmRlZmluZWQsXG5cdFx0XHRkaWZmc1N0YXR1czogJ3Rvb0xhcmdlJyxcblx0XHRcdGNoYW5nZWRGaWxlQ291bnQ6IHRvdGFsQ2hhbmdlQ291bnRcblx0XHR9O1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHQuLi5iYXNlUmVwb0RhdGEsXG5cdFx0ZGlmZnMsXG5cdFx0ZGlmZnNTdGF0dXM6ICdpbmNsdWRlZCcsXG5cdFx0Y2hhbmdlZEZpbGVDb3VudDogdG90YWxDaGFuZ2VDb3VudFxuXHR9O1xufVxuXG4vKipcbiAqIENhcHR1cmVzIGxpZ2h0d2VpZ2h0IHJlcG9zaXRvcnkgbWV0YWRhdGEgZm9yIGNoYXQgc2Vzc2lvbnMgb24gZmlyc3QgbWVzc2FnZS5cbiAqIE9ubHkgcmVhZHMgZnJvbSBhbHJlYWR5LWxvYWRlZCBTQ00gcHJvdmlkZXIgb2JzZXJ2YWJsZXMsIG5vIGZpbGUgSS9PLlxuICogRnVsbCBkaWZmIGNhcHR1cmUgaXMgZGVmZXJyZWQgdG8gZXhwb3J0IHRpbWUgKHNlZSBjaGF0RXhwb3J0WmlwLnRzKS5cbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRSZXBvSW5mb0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY2hhdFJlcG9JbmZvJztcblxuXHRwcml2YXRlIF9jb25maWd1cmF0aW9uUmVnaXN0ZXJlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdEVudGl0bGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJU0NNU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNjbVNlcnZpY2U6IElTQ01TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVnaXN0ZXJDb25maWd1cmF0aW9uSWZJbnRlcm5hbCgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZUVudGl0bGVtZW50KCgpID0+IHtcblx0XHRcdHRoaXMucmVnaXN0ZXJDb25maWd1cmF0aW9uSWZJbnRlcm5hbCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdFNlcnZpY2Uub25EaWRTdWJtaXRSZXF1ZXN0KCh7IGNoYXRTZXNzaW9uUmVzb3VyY2UgfSkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb24oY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuY2FwdHVyZUFuZFNldFJlcG9NZXRhZGF0YShtb2RlbCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckNvbmZpZ3VyYXRpb25JZkludGVybmFsKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb25maWd1cmF0aW9uUmVnaXN0ZXJlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmlzSW50ZXJuYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXHRcdHJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHRpZDogJ2NoYXRSZXBvSW5mbycsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdjaGF0UmVwb0luZm9Db25maWd1cmF0aW9uVGl0bGUnLCBcIkNoYXQgUmVwb3NpdG9yeSBJbmZvXCIpLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5SZXBvSW5mb0VuYWJsZWRdOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQucmVwb0luZm8uZW5hYmxlZCcsIFwiQ29udHJvbHMgd2hldGhlciBsaWdodHdlaWdodCByZXBvc2l0b3J5IG1ldGFkYXRhIChicmFuY2gsIGNvbW1pdCwgcmVtb3RlcykgaXMgY2FwdHVyZWQgd2hlbiBhIGNoYXQgcmVxdWVzdCBpcyBzdWJtaXR0ZWQgZm9yIGludGVybmFsIGRpYWdub3N0aWNzLlwiKSxcblx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fY29uZmlndXJhdGlvblJlZ2lzdGVyZWQgPSB0cnVlO1xuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0NoYXRSZXBvSW5mb10gQ29uZmlndXJhdGlvbiByZWdpc3RlcmVkIGZvciBpbnRlcm5hbCB1c2VyJyk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FwdHVyZXMgbGlnaHR3ZWlnaHQgbWV0YWRhdGEgKGJyYW5jaCwgY29tbWl0LCByZW1vdGUgcmVmcykgb24gZmlyc3QgbWVzc2FnZS5cblx0ICogU3luY2hyb25vdXMsIG5vIGZpbGUgSS9PLiBSZWFkcyBvbmx5IGZyb20gU0NNIHByb3ZpZGVyIG9ic2VydmFibGVzLlxuXHQgKi9cblx0cHJpdmF0ZSBjYXB0dXJlQW5kU2V0UmVwb01ldGFkYXRhKG1vZGVsOiBJQ2hhdE1vZGVsKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuaXNJbnRlcm5hbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5SZXBvSW5mb0VuYWJsZWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKG1vZGVsLnJlcG9EYXRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG1ldGFkYXRhID0gY2FwdHVyZVJlcG9NZXRhZGF0YSh0aGlzLnNjbVNlcnZpY2UpO1xuXHRcdFx0aWYgKG1ldGFkYXRhKSB7XG5cdFx0XHRcdG1vZGVsLnNldFJlcG9EYXRhKG1ldGFkYXRhKTtcblx0XHRcdFx0aWYgKCFtZXRhZGF0YS5sb2NhbEhlYWRDb21taXQpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignW0NoYXRSZXBvSW5mb10gQ2FwdHVyZWQgcmVwbyBtZXRhZGF0YSB3aXRob3V0IGNvbW1pdCBoYXNoIC0gZ2l0IGhpc3RvcnkgbWF5IG5vdCBiZSByZWFkeScpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tDaGF0UmVwb0luZm9dIE5vIFNDTSByZXBvc2l0b3J5IGF2YWlsYWJsZSBmb3IgY2hhdCBzZXNzaW9uJyk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbQ2hhdFJlcG9JbmZvXSBGYWlsZWQgdG8gY2FwdHVyZSByZXBvIG1ldGFkYXRhOicsIGVycm9yKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxjQUFjLCtCQUF1RDtBQUM5RSxTQUF1QixvQkFBb0IsMkJBQTJCO0FBQ3RFLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsbUJBQWlDO0FBQzFDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMseUJBQXlCO0FBRWxDLFlBQVksU0FBUztBQUVyQixNQUFNLGNBQWM7QUFDcEIsTUFBTSx1QkFBdUIsTUFBTTtBQUNuQyxNQUFNLHNCQUFzQixJQUFJ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
