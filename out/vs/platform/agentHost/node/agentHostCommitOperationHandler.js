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
import { basename } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { IAgentService } from "../common/agentService.js";
import { IAgentHostGitHubEndpointService } from "./agentHostGitHubEndpointService.js";
import { parseChangesetUri } from "../common/changesetUri.js";
import { AHP_AUTH_REQUIRED, AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from "../common/state/sessionProtocol.js";
import { readSessionGitState } from "../common/state/sessionState.js";
import { ILogService } from "../../log/common/log.js";
import { IAgentHostGitService } from "../common/agentHostGitService.js";
import { CopilotApiError, ICopilotApiService } from "./shared/copilotApiService.js";
const MAX_CHANGE_SUMMARY_PROMPT_CHARS = 2e4;
let AgentHostCommitOperationHandler = class {
  constructor(_getSessionState, _onCommitted, _agentService, _gitHubEndpointService, _gitService, _copilotApiService, _logService) {
    this._getSessionState = _getSessionState;
    this._onCommitted = _onCommitted;
    this._agentService = _agentService;
    this._gitHubEndpointService = _gitHubEndpointService;
    this._gitService = _gitService;
    this._copilotApiService = _copilotApiService;
    this._logService = _logService;
  }
  async invoke(params, token) {
    const abortController = new AbortController();
    if (token.isCancellationRequested) {
      abortController.abort();
    }
    const cancellationListener = token.onCancellationRequested(() => abortController.abort());
    try {
      return await this._invoke(params, token, abortController.signal);
    } finally {
      cancellationListener.dispose();
    }
  }
  async _invoke(params, token, signal) {
    const parsed = parseChangesetUri(params.channel);
    if (!parsed) {
      throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Not an uncommitted changeset URI: ${params.channel}`);
    }
    this._throwIfCancelled(token);
    const sessionUri = parsed.sessionUri;
    const sessionState = this._getSessionState(sessionUri);
    if (!sessionState) {
      throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${sessionUri}`);
    }
    const workingDirectoryStr = sessionState.workingDirectories?.[0];
    if (!workingDirectoryStr) {
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Session has no working directory: ${sessionUri}`);
    }
    const workingDirectory = URI.parse(workingDirectoryStr);
    const gitState = readSessionGitState(sessionState._meta);
    if (!gitState) {
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Session's working directory is not a git repo: ${sessionUri}`);
    }
    const hasUncommitted = await this._gitService.hasUncommittedChanges(workingDirectory);
    if (!hasUncommitted) {
      return { message: { markdown: localize("agentHost.changeset.commit.noChanges", "No uncommitted changes to commit.") } };
    }
    this._throwIfCancelled(token);
    const copilotResource = this._gitHubEndpointService.getCopilotResource();
    const authToken = this._agentService.getAuthToken({
      resource: copilotResource.resource,
      scopes: copilotResource.scopes_supported
    });
    if (!authToken) {
      throw new ProtocolError(
        AHP_AUTH_REQUIRED,
        localize("agentHost.changeset.commit.authRequired", "Sign in to GitHub Copilot to generate a commit message."),
        [copilotResource]
      );
    }
    const diffs = await this._gitService.computeSessionFileDiffs(workingDirectory, { sessionUri });
    if (!diffs || diffs.length === 0) {
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize("agentHost.changeset.commit.diffFailed", "Could not compute uncommitted changes to generate a commit message."));
    }
    this._throwIfCancelled(token);
    let message;
    try {
      message = this._cleanCommitMessage(await this._copilotApiService.utilityChatCompletion(authToken, {
        messages: this._buildCommitMessagePrompt(workingDirectory, gitState.branchName, diffs)
      }, { signal }));
    } catch (err) {
      this._throwIfCancelled(token);
      if (this._isAuthFailure(err)) {
        throw new ProtocolError(
          AHP_AUTH_REQUIRED,
          localize("agentHost.changeset.commit.authExpired", "Authentication is required to generate a commit message. Please sign in to GitHub Copilot and try again."),
          [copilotResource]
        );
      }
      throw err;
    }
    if (!message) {
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize("agentHost.changeset.commit.emptyMessage", "Generated commit message was empty."));
    }
    this._throwIfCancelled(token);
    this._logService.info(`[AgentHostCommitOperationHandler] Committing uncommitted changes for session ${sessionUri}`);
    try {
      await this._gitService.commitAll(workingDirectory, message);
    } catch (err) {
      this._throwIfCancelled(token);
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Failed to commit changes: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      await this._onCommitted(sessionUri);
    } catch (err) {
      this._logService.warn(`[AgentHostCommitOperationHandler] Post-commit refresh failed for session ${sessionUri}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { message: { markdown: localize("agentHost.changeset.commit.committed", "Committed changes with message: `{0}`", message.split("\n")[0]) } };
  }
  _buildCommitMessagePrompt(workingDirectory, branchName, diffs) {
    const changeSummary = this._summarizeDiffsForPrompt(diffs);
    return [
      {
        role: "system",
        content: [
          "You generate concise Git commit messages.",
          "Return only the commit message text, with no markdown or code fences.",
          "Use imperative mood. Keep the subject line under 72 characters.",
          "Add a body only when it helps explain multiple related changes."
        ].join(" ")
      },
      {
        role: "user",
        content: [
          `Repository: ${basename(workingDirectory)}`,
          `Branch: ${branchName ?? "unknown"}`,
          "Changed files:",
          changeSummary
        ].join("\n")
      }
    ];
  }
  _summarizeDiffsForPrompt(diffs) {
    const lines = [];
    for (const diff of diffs) {
      const before = diff.before?.uri;
      const after = diff.after?.uri;
      const path = after ?? before ?? "(unknown)";
      let kind = "Edit";
      if (!before && after) {
        kind = "Create";
      } else if (before && !after) {
        kind = "Delete";
      } else if (before && after && before !== after) {
        kind = "Rename";
      }
      lines.push(`- ${kind}: ${this._displayUri(path)} (+${diff.diff?.added ?? 0} -${diff.diff?.removed ?? 0})`);
      if (lines.join("\n").length > MAX_CHANGE_SUMMARY_PROMPT_CHARS) {
        lines.push("[file list truncated]");
        break;
      }
    }
    return lines.join("\n");
  }
  _displayUri(uri) {
    try {
      const parsed = URI.parse(uri);
      return parsed.scheme === "file" ? parsed.fsPath : parsed.path || uri;
    } catch {
      return uri;
    }
  }
  _cleanCommitMessage(raw) {
    let text = raw.trim().replace(/\r\n/g, "\n");
    const fenced = /^```(?:text|gitcommit)?\s*([\s\S]*?)\s*```$/i.exec(text);
    if (fenced) {
      text = fenced[1].trim();
    }
    return text;
  }
  _isAuthFailure(err) {
    if (err instanceof CopilotApiError) {
      return err.status === 401 || err.status === 403;
    }
    const message = err instanceof Error ? err.message : String(err);
    return /\b(401|403)\b/.test(message) && /\b(auth|authorization|unauthorized|forbidden|token|copilot endpoint discovery|copilot session token mint)\b/i.test(message);
  }
  _throwIfCancelled(token) {
    if (token.isCancellationRequested) {
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize("agentHost.changeset.commit.cancelled", "Commit operation was cancelled."));
    }
  }
};
AgentHostCommitOperationHandler.OPERATION_COMMIT = "commit";
AgentHostCommitOperationHandler = __decorateClass([
  __decorateParam(2, IAgentService),
  __decorateParam(3, IAgentHostGitHubEndpointService),
  __decorateParam(4, IAgentHostGitService),
  __decorateParam(5, ICopilotApiService),
  __decorateParam(6, ILogService)
], AgentHostCommitOperationHandler);
export {
  AgentHostCommitOperationHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxhZ2VudEhvc3RDb21taXRPcGVyYXRpb25IYW5kbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBwYXJzZUNoYW5nZXNldFVyaSB9IGZyb20gJy4uL2NvbW1vbi9jaGFuZ2VzZXRVcmkuanMnO1xuaW1wb3J0IHsgdHlwZSBJQ2hhbmdlc2V0T3BlcmF0aW9uSGFuZGxlciB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RDaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uUGFyYW1zLCBJbnZva2VDaGFuZ2VzZXRPcGVyYXRpb25SZXN1bHQgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtY2hhbmdlc2V0L2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFIUF9BVVRIX1JFUVVJUkVELCBBSFBfU0VTU0lPTl9OT1RfRk9VTkQsIEpzb25ScGNFcnJvckNvZGVzLCBQcm90b2NvbEVycm9yIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25Qcm90b2NvbC5qcyc7XG5pbXBvcnQgeyByZWFkU2Vzc2lvbkdpdFN0YXRlLCB0eXBlIElTZXNzaW9uRmlsZURpZmYsIHR5cGUgU2Vzc2lvblN0YXRlIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RHaXRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdEdpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29waWxvdEFwaUVycm9yLCBJQ29waWxvdEFwaVNlcnZpY2UgfSBmcm9tICcuL3NoYXJlZC9jb3BpbG90QXBpU2VydmljZS5qcyc7XG5cbmNvbnN0IE1BWF9DSEFOR0VfU1VNTUFSWV9QUk9NUFRfQ0hBUlMgPSAyMF8wMDA7XG5cbmV4cG9ydCBjbGFzcyBBZ2VudEhvc3RDb21taXRPcGVyYXRpb25IYW5kbGVyIGltcGxlbWVudHMgSUNoYW5nZXNldE9wZXJhdGlvbkhhbmRsZXIge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgT1BFUkFUSU9OX0NPTU1JVCA9ICdjb21taXQnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldFNlc3Npb25TdGF0ZTogKHNlc3Npb25LZXk6IHN0cmluZykgPT4gU2Vzc2lvblN0YXRlIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uQ29tbWl0dGVkOiAoc2Vzc2lvbktleTogc3RyaW5nKSA9PiBQcm9taXNlPHZvaWQ+LFxuXHRcdEBJQWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50U2VydmljZTogSUFnZW50U2VydmljZSxcblx0XHRASUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9naXRIdWJFbmRwb2ludFNlcnZpY2U6IElBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RHaXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2dpdFNlcnZpY2U6IElBZ2VudEhvc3RHaXRTZXJ2aWNlLFxuXHRcdEBJQ29waWxvdEFwaVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29waWxvdEFwaVNlcnZpY2U6IElDb3BpbG90QXBpU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgaW52b2tlKHBhcmFtczogSW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uUGFyYW1zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEludm9rZUNoYW5nZXNldE9wZXJhdGlvblJlc3VsdD4ge1xuXHRcdGNvbnN0IGFib3J0Q29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdGFib3J0Q29udHJvbGxlci5hYm9ydCgpO1xuXHRcdH1cblx0XHRjb25zdCBjYW5jZWxsYXRpb25MaXN0ZW5lciA9IHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IGFib3J0Q29udHJvbGxlci5hYm9ydCgpKTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2ludm9rZShwYXJhbXMsIHRva2VuLCBhYm9ydENvbnRyb2xsZXIuc2lnbmFsKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2FuY2VsbGF0aW9uTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ludm9rZShwYXJhbXM6IEludm9rZUNoYW5nZXNldE9wZXJhdGlvblBhcmFtcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBzaWduYWw6IEFib3J0U2lnbmFsKTogUHJvbWlzZTxJbnZva2VDaGFuZ2VzZXRPcGVyYXRpb25SZXN1bHQ+IHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNoYW5nZXNldFVyaShwYXJhbXMuY2hhbm5lbCk7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEpzb25ScGNFcnJvckNvZGVzLkludmFsaWRQYXJhbXMsIGBOb3QgYW4gdW5jb21taXR0ZWQgY2hhbmdlc2V0IFVSSTogJHtwYXJhbXMuY2hhbm5lbH1gKTtcblx0XHR9XG5cdFx0dGhpcy5fdGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gcGFyc2VkLnNlc3Npb25Vcmk7XG5cdFx0Y29uc3Qgc2Vzc2lvblN0YXRlID0gdGhpcy5fZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpO1xuXHRcdGlmICghc2Vzc2lvblN0YXRlKSB7XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBSFBfU0VTU0lPTl9OT1RfRk9VTkQsIGBTZXNzaW9uIG5vdCBmb3VuZDogJHtzZXNzaW9uVXJpfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnlTdHIgPSBzZXNzaW9uU3RhdGUud29ya2luZ0RpcmVjdG9yaWVzPy5bMF07XG5cdFx0aWYgKCF3b3JraW5nRGlyZWN0b3J5U3RyKSB7XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihKc29uUnBjRXJyb3JDb2Rlcy5JbnRlcm5hbEVycm9yLCBgU2Vzc2lvbiBoYXMgbm8gd29ya2luZyBkaXJlY3Rvcnk6ICR7c2Vzc2lvblVyaX1gKTtcblx0XHR9XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IFVSSS5wYXJzZSh3b3JraW5nRGlyZWN0b3J5U3RyKTtcblxuXHRcdGNvbnN0IGdpdFN0YXRlID0gcmVhZFNlc3Npb25HaXRTdGF0ZShzZXNzaW9uU3RhdGUuX21ldGEpO1xuXHRcdGlmICghZ2l0U3RhdGUpIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEpzb25ScGNFcnJvckNvZGVzLkludGVybmFsRXJyb3IsIGBTZXNzaW9uJ3Mgd29ya2luZyBkaXJlY3RvcnkgaXMgbm90IGEgZ2l0IHJlcG86ICR7c2Vzc2lvblVyaX1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBoYXNVbmNvbW1pdHRlZCA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuaGFzVW5jb21taXR0ZWRDaGFuZ2VzKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGlmICghaGFzVW5jb21taXR0ZWQpIHtcblx0XHRcdHJldHVybiB7IG1lc3NhZ2U6IHsgbWFya2Rvd246IGxvY2FsaXplKCdhZ2VudEhvc3QuY2hhbmdlc2V0LmNvbW1pdC5ub0NoYW5nZXMnLCBcIk5vIHVuY29tbWl0dGVkIGNoYW5nZXMgdG8gY29tbWl0LlwiKSB9IH07XG5cdFx0fVxuXHRcdHRoaXMuX3Rocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXG5cdFx0Y29uc3QgY29waWxvdFJlc291cmNlID0gdGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldENvcGlsb3RSZXNvdXJjZSgpO1xuXHRcdGNvbnN0IGF1dGhUb2tlbiA9IHRoaXMuX2FnZW50U2VydmljZS5nZXRBdXRoVG9rZW4oe1xuXHRcdFx0cmVzb3VyY2U6IGNvcGlsb3RSZXNvdXJjZS5yZXNvdXJjZSxcblx0XHRcdHNjb3BlczogY29waWxvdFJlc291cmNlLnNjb3Blc19zdXBwb3J0ZWQsXG5cdFx0fSk7XG5cdFx0aWYgKCFhdXRoVG9rZW4pIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKFxuXHRcdFx0XHRBSFBfQVVUSF9SRVFVSVJFRCxcblx0XHRcdFx0bG9jYWxpemUoJ2FnZW50SG9zdC5jaGFuZ2VzZXQuY29tbWl0LmF1dGhSZXF1aXJlZCcsIFwiU2lnbiBpbiB0byBHaXRIdWIgQ29waWxvdCB0byBnZW5lcmF0ZSBhIGNvbW1pdCBtZXNzYWdlLlwiKSxcblx0XHRcdFx0W2NvcGlsb3RSZXNvdXJjZV0sXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpZmZzID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5jb21wdXRlU2Vzc2lvbkZpbGVEaWZmcyh3b3JraW5nRGlyZWN0b3J5LCB7IHNlc3Npb25VcmkgfSk7XG5cdFx0aWYgKCFkaWZmcyB8fCBkaWZmcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEpzb25ScGNFcnJvckNvZGVzLkludGVybmFsRXJyb3IsIGxvY2FsaXplKCdhZ2VudEhvc3QuY2hhbmdlc2V0LmNvbW1pdC5kaWZmRmFpbGVkJywgXCJDb3VsZCBub3QgY29tcHV0ZSB1bmNvbW1pdHRlZCBjaGFuZ2VzIHRvIGdlbmVyYXRlIGEgY29tbWl0IG1lc3NhZ2UuXCIpKTtcblx0XHR9XG5cdFx0dGhpcy5fdGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cblx0XHRsZXQgbWVzc2FnZTogc3RyaW5nO1xuXHRcdHRyeSB7XG5cdFx0XHRtZXNzYWdlID0gdGhpcy5fY2xlYW5Db21taXRNZXNzYWdlKGF3YWl0IHRoaXMuX2NvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDaGF0Q29tcGxldGlvbihhdXRoVG9rZW4sIHtcblx0XHRcdFx0bWVzc2FnZXM6IHRoaXMuX2J1aWxkQ29tbWl0TWVzc2FnZVByb21wdCh3b3JraW5nRGlyZWN0b3J5LCBnaXRTdGF0ZS5icmFuY2hOYW1lLCBkaWZmcyksXG5cdFx0XHR9LCB7IHNpZ25hbCB9KSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl90aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblx0XHRcdGlmICh0aGlzLl9pc0F1dGhGYWlsdXJlKGVycikpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoXG5cdFx0XHRcdFx0QUhQX0FVVEhfUkVRVUlSRUQsXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2FnZW50SG9zdC5jaGFuZ2VzZXQuY29tbWl0LmF1dGhFeHBpcmVkJywgXCJBdXRoZW50aWNhdGlvbiBpcyByZXF1aXJlZCB0byBnZW5lcmF0ZSBhIGNvbW1pdCBtZXNzYWdlLiBQbGVhc2Ugc2lnbiBpbiB0byBHaXRIdWIgQ29waWxvdCBhbmQgdHJ5IGFnYWluLlwiKSxcblx0XHRcdFx0XHRbY29waWxvdFJlc291cmNlXSxcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cdFx0aWYgKCFtZXNzYWdlKSB7XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihKc29uUnBjRXJyb3JDb2Rlcy5JbnRlcm5hbEVycm9yLCBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNoYW5nZXNldC5jb21taXQuZW1wdHlNZXNzYWdlJywgXCJHZW5lcmF0ZWQgY29tbWl0IG1lc3NhZ2Ugd2FzIGVtcHR5LlwiKSk7XG5cdFx0fVxuXHRcdHRoaXMuX3Rocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRIb3N0Q29tbWl0T3BlcmF0aW9uSGFuZGxlcl0gQ29tbWl0dGluZyB1bmNvbW1pdHRlZCBjaGFuZ2VzIGZvciBzZXNzaW9uICR7c2Vzc2lvblVyaX1gKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fZ2l0U2VydmljZS5jb21taXRBbGwod29ya2luZ0RpcmVjdG9yeSwgbWVzc2FnZSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl90aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEpzb25ScGNFcnJvckNvZGVzLkludGVybmFsRXJyb3IsIGBGYWlsZWQgdG8gY29tbWl0IGNoYW5nZXM6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9vbkNvbW1pdHRlZChzZXNzaW9uVXJpKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdENvbW1pdE9wZXJhdGlvbkhhbmRsZXJdIFBvc3QtY29tbWl0IHJlZnJlc2ggZmFpbGVkIGZvciBzZXNzaW9uICR7c2Vzc2lvblVyaX06ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IG1lc3NhZ2U6IHsgbWFya2Rvd246IGxvY2FsaXplKCdhZ2VudEhvc3QuY2hhbmdlc2V0LmNvbW1pdC5jb21taXR0ZWQnLCBcIkNvbW1pdHRlZCBjaGFuZ2VzIHdpdGggbWVzc2FnZTogYHswfWBcIiwgbWVzc2FnZS5zcGxpdCgnXFxuJylbMF0pIH0gfTtcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkQ29tbWl0TWVzc2FnZVByb21wdCh3b3JraW5nRGlyZWN0b3J5OiBVUkksIGJyYW5jaE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGlmZnM6IHJlYWRvbmx5IElTZXNzaW9uRmlsZURpZmZbXSk6IHsgcm9sZTogJ3N5c3RlbScgfCAndXNlcic7IGNvbnRlbnQ6IHN0cmluZyB9W10ge1xuXHRcdGNvbnN0IGNoYW5nZVN1bW1hcnkgPSB0aGlzLl9zdW1tYXJpemVEaWZmc0ZvclByb21wdChkaWZmcyk7XG5cdFx0cmV0dXJuIFtcblx0XHRcdHtcblx0XHRcdFx0cm9sZTogJ3N5c3RlbScsXG5cdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHQnWW91IGdlbmVyYXRlIGNvbmNpc2UgR2l0IGNvbW1pdCBtZXNzYWdlcy4nLFxuXHRcdFx0XHRcdCdSZXR1cm4gb25seSB0aGUgY29tbWl0IG1lc3NhZ2UgdGV4dCwgd2l0aCBubyBtYXJrZG93biBvciBjb2RlIGZlbmNlcy4nLFxuXHRcdFx0XHRcdCdVc2UgaW1wZXJhdGl2ZSBtb29kLiBLZWVwIHRoZSBzdWJqZWN0IGxpbmUgdW5kZXIgNzIgY2hhcmFjdGVycy4nLFxuXHRcdFx0XHRcdCdBZGQgYSBib2R5IG9ubHkgd2hlbiBpdCBoZWxwcyBleHBsYWluIG11bHRpcGxlIHJlbGF0ZWQgY2hhbmdlcy4nLFxuXHRcdFx0XHRdLmpvaW4oJyAnKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHJvbGU6ICd1c2VyJyxcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdGBSZXBvc2l0b3J5OiAke2Jhc2VuYW1lKHdvcmtpbmdEaXJlY3RvcnkpfWAsXG5cdFx0XHRcdFx0YEJyYW5jaDogJHticmFuY2hOYW1lID8/ICd1bmtub3duJ31gLFxuXHRcdFx0XHRcdCdDaGFuZ2VkIGZpbGVzOicsXG5cdFx0XHRcdFx0Y2hhbmdlU3VtbWFyeSxcblx0XHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdH0sXG5cdFx0XTtcblx0fVxuXG5cdHByaXZhdGUgX3N1bW1hcml6ZURpZmZzRm9yUHJvbXB0KGRpZmZzOiByZWFkb25seSBJU2Vzc2lvbkZpbGVEaWZmW10pOiBzdHJpbmcge1xuXHRcdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZGlmZiBvZiBkaWZmcykge1xuXHRcdFx0Y29uc3QgYmVmb3JlID0gZGlmZi5iZWZvcmU/LnVyaTtcblx0XHRcdGNvbnN0IGFmdGVyID0gZGlmZi5hZnRlcj8udXJpO1xuXHRcdFx0Y29uc3QgcGF0aCA9IGFmdGVyID8/IGJlZm9yZSA/PyAnKHVua25vd24pJztcblx0XHRcdGxldCBraW5kID0gJ0VkaXQnO1xuXHRcdFx0aWYgKCFiZWZvcmUgJiYgYWZ0ZXIpIHtcblx0XHRcdFx0a2luZCA9ICdDcmVhdGUnO1xuXHRcdFx0fSBlbHNlIGlmIChiZWZvcmUgJiYgIWFmdGVyKSB7XG5cdFx0XHRcdGtpbmQgPSAnRGVsZXRlJztcblx0XHRcdH0gZWxzZSBpZiAoYmVmb3JlICYmIGFmdGVyICYmIGJlZm9yZSAhPT0gYWZ0ZXIpIHtcblx0XHRcdFx0a2luZCA9ICdSZW5hbWUnO1xuXHRcdFx0fVxuXHRcdFx0bGluZXMucHVzaChgLSAke2tpbmR9OiAke3RoaXMuX2Rpc3BsYXlVcmkocGF0aCl9ICgrJHtkaWZmLmRpZmY/LmFkZGVkID8/IDB9IC0ke2RpZmYuZGlmZj8ucmVtb3ZlZCA/PyAwfSlgKTtcblx0XHRcdGlmIChsaW5lcy5qb2luKCdcXG4nKS5sZW5ndGggPiBNQVhfQ0hBTkdFX1NVTU1BUllfUFJPTVBUX0NIQVJTKSB7XG5cdFx0XHRcdGxpbmVzLnB1c2goJ1tmaWxlIGxpc3QgdHJ1bmNhdGVkXScpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlzcGxheVVyaSh1cmk6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IFVSSS5wYXJzZSh1cmkpO1xuXHRcdFx0cmV0dXJuIHBhcnNlZC5zY2hlbWUgPT09ICdmaWxlJyA/IHBhcnNlZC5mc1BhdGggOiBwYXJzZWQucGF0aCB8fCB1cmk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdXJpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NsZWFuQ29tbWl0TWVzc2FnZShyYXc6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0bGV0IHRleHQgPSByYXcudHJpbSgpLnJlcGxhY2UoL1xcclxcbi9nLCAnXFxuJyk7XG5cdFx0Y29uc3QgZmVuY2VkID0gL15gYGAoPzp0ZXh0fGdpdGNvbW1pdCk/XFxzKihbXFxzXFxTXSo/KVxccypgYGAkL2kuZXhlYyh0ZXh0KTtcblx0XHRpZiAoZmVuY2VkKSB7XG5cdFx0XHR0ZXh0ID0gZmVuY2VkWzFdLnRyaW0oKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRleHQ7XG5cdH1cblxuXHRwcml2YXRlIF9pc0F1dGhGYWlsdXJlKGVycjogdW5rbm93bik6IGJvb2xlYW4ge1xuXHRcdGlmIChlcnIgaW5zdGFuY2VvZiBDb3BpbG90QXBpRXJyb3IpIHtcblx0XHRcdHJldHVybiBlcnIuc3RhdHVzID09PSA0MDEgfHwgZXJyLnN0YXR1cyA9PT0gNDAzO1xuXHRcdH1cblx0XHRjb25zdCBtZXNzYWdlID0gZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpO1xuXHRcdHJldHVybiAvXFxiKDQwMXw0MDMpXFxiLy50ZXN0KG1lc3NhZ2UpXG5cdFx0XHQmJiAvXFxiKGF1dGh8YXV0aG9yaXphdGlvbnx1bmF1dGhvcml6ZWR8Zm9yYmlkZGVufHRva2VufGNvcGlsb3QgZW5kcG9pbnQgZGlzY292ZXJ5fGNvcGlsb3Qgc2Vzc2lvbiB0b2tlbiBtaW50KVxcYi9pLnRlc3QobWVzc2FnZSk7XG5cdH1cblxuXHRwcml2YXRlIF90aHJvd0lmQ2FuY2VsbGVkKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IHZvaWQge1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoSnNvblJwY0Vycm9yQ29kZXMuSW50ZXJuYWxFcnJvciwgbG9jYWxpemUoJ2FnZW50SG9zdC5jaGFuZ2VzZXQuY29tbWl0LmNhbmNlbGxlZCcsIFwiQ29tbWl0IG9wZXJhdGlvbiB3YXMgY2FuY2VsbGVkLlwiKSk7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
