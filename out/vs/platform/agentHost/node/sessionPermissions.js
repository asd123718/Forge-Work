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
import { realpath as fsRealpath } from "fs";
import { homedir } from "os";
import { promisify } from "util";
import { firstParallel } from "../../../base/common/async.js";
import { match as globMatch } from "../../../base/common/glob.js";
import { untildify } from "../../../base/common/labels.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import * as path from "../../../base/common/path.js";
import { isMacintosh, isWindows } from "../../../base/common/platform.js";
import { extUri, extUriBiasedIgnorePathCase, normalizePath } from "../../../base/common/resources.js";
import { isDefined } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { ALWAYS_CHECKED_EDIT_PATTERNS, DEFAULT_EDIT_AUTO_APPROVE_PATTERNS } from "../../chat/common/chatSettings.js";
import { ILogService } from "../../log/common/log.js";
import { containsCmdDelayedExpansion } from "../../terminal/common/autoApprove/cmdDelayedExpansion.js";
import { AgentHostEditAutoApprovePatternsConfigKey, AgentHostGlobalAutoApproveEnabledConfigKey, AgentHostTerminalAutoApproveEnabledConfigKey, AgentHostTerminalAutoApproveRulesConfigKey, platformRootSchema, platformSessionSchema } from "../common/agentHostSchema.js";
import { ISessionDataService, isSessionAttachmentPath } from "../common/sessionDataService.js";
import { SessionConfigKey } from "../common/sessionConfigKeys.js";
import { ConfirmationOptionKind } from "../common/state/protocol/state.js";
import { ActionType } from "../common/state/sessionActions.js";
import {
  isAhpChatChannel,
  parseRequiredSessionUriFromChatUri,
  ResponsePartKind,
  ToolCallConfirmationReason
} from "../common/state/sessionState.js";
import { getEffectiveWorkingDirectories, IAgentConfigurationService } from "./agentConfigurationService.js";
import { CommandAutoApprover } from "./commandAutoApprover.js";
const ALLOW_SESSION_OPTION_ID = "allow-session";
const ALLOW_ONCE_OPTION = { id: "allow-once", label: localize("sessionPermissions.allowOnce", "Allow Once"), kind: ConfirmationOptionKind.Approve };
const SKIP_OPTION = { id: "skip", label: localize("sessionPermissions.skip", "Skip"), kind: ConfirmationOptionKind.Deny, group: 2 };
const CONFIRMATION_OPTIONS = [
  { id: ALLOW_SESSION_OPTION_ID, label: localize("sessionPermissions.allowSession", "Allow in this Session"), kind: ConfirmationOptionKind.Approve, group: 1 },
  ALLOW_ONCE_OPTION,
  SKIP_OPTION
];
const MANAGED_CONFIRMATION_OPTIONS = [ALLOW_ONCE_OPTION, SKIP_OPTION];
const HOME_DIR = URI.file(homedir());
const PLATFORM_RESTRICTED_DIRS = (isWindows ? [process.env.APPDATA, process.env.LOCALAPPDATA] : isMacintosh ? [homedir() + "/Library"] : []).filter(isDefined);
const realpath = promisify(fsRealpath);
function assertPathIsSafe(fsPath, _isWindows = isWindows) {
  if (fsPath.includes("\0")) {
    throw new Error(`Path contains null bytes: ${fsPath}`);
  }
  if (!_isWindows) {
    return;
  }
  const colonIndex = fsPath.indexOf(":", 2);
  if (colonIndex !== -1) {
    throw new Error(`Path contains invalid characters (alternate data stream): ${fsPath}`);
  }
  const invalidChars = /[<>"|?*]/;
  const pathAfterDrive = fsPath.length > 2 ? fsPath.substring(2) : fsPath;
  if (invalidChars.test(pathAfterDrive)) {
    throw new Error(`Path contains invalid characters: ${fsPath}`);
  }
  if (fsPath.startsWith("\\\\.") || fsPath.startsWith("\\\\?")) {
    throw new Error(`Path is a reserved device path: ${fsPath}`);
  }
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
  const parts = fsPath.split("\\");
  for (const part of parts) {
    if (part.length === 0) {
      continue;
    }
    if (reserved.test(part)) {
      throw new Error(`Reserved device name in path: ${fsPath}`);
    }
    if (part.endsWith(".") || part.endsWith(" ")) {
      throw new Error(`Path contains invalid trailing characters: ${fsPath}`);
    }
    const tildeIndex = part.indexOf("~");
    if (tildeIndex !== -1) {
      const afterTilde = part.substring(tildeIndex + 1);
      if (afterTilde.length > 0 && /^\d/.test(afterTilde)) {
        throw new Error(`Path appears to use short filename format (8.3 names): ${fsPath}. Please use the full path.`);
      }
    }
  }
}
async function resolveRealPathForNonexistent(resource, realpath2) {
  const fsPath = resource.fsPath;
  try {
    return URI.file(await realpath2(fsPath));
  } catch (e) {
    if (e.code !== "ENOENT") {
      throw e;
    }
  }
  const tail = [path.basename(fsPath)];
  let current = path.dirname(fsPath);
  while (true) {
    const parent = path.dirname(current);
    if (parent === current) {
      return resource;
    }
    try {
      const resolved = await realpath2(current);
      return URI.file(path.join(resolved, ...tail));
    } catch (e) {
      const code = e.code;
      if (code !== "ENOENT" && code !== "ENOTDIR") {
        throw e;
      }
    }
    tail.unshift(path.basename(current));
    current = parent;
  }
}
let SessionPermissionManager = class extends Disposable {
  constructor(_stateManager, options, _configService, _logService, _sessionDataService) {
    super();
    this._stateManager = _stateManager;
    this._configService = _configService;
    this._logService = _logService;
    this._sessionDataService = _sessionDataService;
    this._realpath = options?.realpath ?? realpath;
    this._commandAutoApprover = this._register(new CommandAutoApprover(this._logService));
  }
  /**
   * Initializes async resources (tree-sitter WASM) used for shell command
   * auto-approval. Await this before any session events can arrive so that
   * shell command parsing within {@link getAutoApproval} is synchronous.
   */
  initialize() {
    return this._commandAutoApprover.initialize();
  }
  // ---- Auto-approval (analogous to getPreConfirmAction) -------------------
  /**
   * Checks whether a `tool_ready` event should be auto-approved. Returns a
   * {@link ToolCallConfirmationReason} when the tool call should proceed
   * without user interaction, or `undefined` when user confirmation is
   * required.
   *
   * Checks are evaluated in order:
   * 1. Global auto-approve setting (`chat.tools.global.autoApprove`)
   * 2. Session-level bypass (`autoApprove` config)
   * 3. Per-tool session permissions (`permissions.allow`)
   * 4. Read path rules (within working directory)
   * 5. Write path rules (within working directory + glob patterns)
   * 6. Shell command rules (tree-sitter parsed, default allow/deny)
   */
  async getAutoApproval(e, sessionKey) {
    const workDirs = getEffectiveWorkingDirectories(this._stateManager, sessionKey);
    const workingDirectories = workDirs?.map((d) => URI.parse(d));
    if (e.requestSandboxBypass) {
      return void 0;
    }
    if (this.isGlobalAutoApproveEnabled()) {
      return ToolCallConfirmationReason.Setting;
    }
    if (this.isSessionAutoApproveEnabled(sessionKey)) {
      return ToolCallConfirmationReason.Setting;
    }
    if (this._isToolAllowedByPermissions(sessionKey, e.toolCallId)) {
      return ToolCallConfirmationReason.Setting;
    }
    if (e.permissionKind === "read" && e.permissionPath) {
      const sessionUri = URI.parse(isAhpChatChannel(sessionKey) ? parseRequiredSessionUriFromChatUri(sessionKey) : sessionKey);
      if (isSessionAttachmentPath(this._sessionDataService, sessionUri, e.permissionPath)) {
        this._logService.trace(`[SessionPermissionManager] Auto-approving session attachment read of ${e.permissionPath}`);
        return ToolCallConfirmationReason.NotNeeded;
      }
      if (await this._isReadAutoApproved(URI.file(e.permissionPath), workingDirectories)) {
        this._logService.trace(`[SessionPermissionManager] Auto-approving read of ${e.permissionPath}`);
        return ToolCallConfirmationReason.NotNeeded;
      }
      return void 0;
    }
    if (e.permissionKind === "write" && e.permissionPath) {
      if (await this._isEditAutoApproved(URI.file(e.permissionPath), workingDirectories)) {
        this._logService.trace(`[SessionPermissionManager] Auto-approving write to ${e.permissionPath}`);
        return ToolCallConfirmationReason.NotNeeded;
      }
      return void 0;
    }
    if (e.permissionKind === "shell" && e.toolInput) {
      if (!e.shellLanguage) {
        this._logService.trace("[SessionPermissionManager] Shell language is missing, requiring confirmation");
        return void 0;
      }
      if (this._configService.getRootValue(platformRootSchema, AgentHostTerminalAutoApproveEnabledConfigKey) === false) {
        return void 0;
      }
      const result = this._commandAutoApprover.shouldAutoApprove(e.toolInput, {
        autoApproveRules: this._configService.getRootValue(platformRootSchema, AgentHostTerminalAutoApproveRulesConfigKey),
        isWriteDestApproved: (dest) => this._isShellWriteDestApproved(dest, workingDirectories),
        language: e.shellLanguage
      });
      if (result === "approved") {
        this._logService.trace("[SessionPermissionManager] Auto-approving shell command");
        return ToolCallConfirmationReason.NotNeeded;
      }
      if (result === "denied") {
        this._logService.trace("[SessionPermissionManager] Shell command denied by rule");
      }
      return void 0;
    }
    return void 0;
  }
  /** Whether adding a persistent terminal auto-approve rule can suppress future prompts for this shell event. */
  isAutoApproveRuleResolvable(e, sessionKey) {
    if (e.permissionKind !== "shell" || !e.toolInput || e.requestSandboxBypass || !e.shellLanguage) {
      return false;
    }
    if (this._configService.getRootValue(platformRootSchema, AgentHostTerminalAutoApproveEnabledConfigKey) === false) {
      return false;
    }
    const workDirs = getEffectiveWorkingDirectories(this._stateManager, sessionKey);
    const workingDirectories = workDirs?.map((d) => URI.parse(d));
    return this._commandAutoApprover.evaluate(e.toolInput, {
      autoApproveRules: this._configService.getRootValue(platformRootSchema, AgentHostTerminalAutoApproveRulesConfigKey),
      isWriteDestApproved: (dest) => this._isShellWriteDestApproved(dest, workingDirectories),
      language: e.shellLanguage
    }).autoApproveRuleResolvable;
  }
  /**
   * Returns whether VS Code's global auto-approve setting (`chat.tools.global.autoApprove`) is enabled.
   * When enabled, every tool call is auto-approved without changing the session's approval level in the permissions picker.
   */
  isGlobalAutoApproveEnabled() {
    return this._configService.getRootValue(platformRootSchema, AgentHostGlobalAutoApproveEnabledConfigKey) === true;
  }
  getEffectiveApprovalLevel(sessionKey) {
    return this._configService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.AutoApprove) ?? "default";
  }
  isSessionAutoApproveEnabled(sessionKey) {
    return this.getEffectiveApprovalLevel(sessionKey) === "autoApprove";
  }
  // ---- Action construction (analogous to getPreConfirmActions) -------------
  /**
   * Constructs a `ChatToolCallReady` action from an agent
   * `pending_confirmation` signal. When the tool needs user confirmation
   * (the protocol state carries `confirmationTitle`), the standard
   * confirmation options are baked in so clients can render them directly.
   */
  createToolReadyAction(e, _sessionKey, turnId) {
    const state = e.state;
    if (state.confirmationTitle) {
      return {
        type: ActionType.ChatToolCallReady,
        turnId,
        toolCallId: state.toolCallId,
        ...state.contributor ? { contributor: state.contributor } : {},
        ...state.intention !== void 0 ? { intention: state.intention } : {},
        invocationMessage: state.invocationMessage,
        toolInput: state.toolInput,
        confirmationTitle: state.confirmationTitle,
        riskAssessment: state.riskAssessment,
        edits: state.edits,
        editable: state.editable,
        ...state._meta ? { _meta: state._meta } : {},
        // Managed asks are one-time only. Other agents can supply tool-specific
        // buttons (e.g. ExitPlanMode's `Approve`/`Deny`) via `state.options`;
        // otherwise the standard session/once/skip set is used.
        options: e.managedApprovalRequired ? MANAGED_CONFIRMATION_OPTIONS.slice() : state.options ? state.options.slice() : CONFIRMATION_OPTIONS.slice()
      };
    }
    return {
      type: ActionType.ChatToolCallReady,
      turnId,
      toolCallId: state.toolCallId,
      ...state.contributor ? { contributor: state.contributor } : {},
      ...state.intention !== void 0 ? { intention: state.intention } : {},
      invocationMessage: state.invocationMessage,
      toolInput: state.toolInput,
      confirmed: ToolCallConfirmationReason.NotNeeded,
      ...state._meta ? { _meta: state._meta } : {}
    };
  }
  // ---- Post-confirmation side effects -------------------------------------
  /**
   * Handles the side effect of a `ChatToolCallConfirmed` action when the
   * user selected "Allow in this Session". Adds the tool to the session's
   * permission allow list so future calls are auto-approved.
   */
  handleToolCallConfirmed(chatChannel, toolCallId, selectedOptionId) {
    if (!isAhpChatChannel(chatChannel)) {
      throw new Error(`Tool call confirmations must be handled on an AHP chat channel: ${chatChannel}`);
    }
    const sessionKey = parseRequiredSessionUriFromChatUri(chatChannel);
    if (selectedOptionId === ALLOW_SESSION_OPTION_ID) {
      const toolName = this._getToolNameForToolCall(chatChannel, toolCallId);
      if (toolName) {
        this._addToolToSessionPermissions(sessionKey, toolName);
      }
    }
  }
  // ---- Internal helpers ---------------------------------------------------
  /**
   * Whether a read of `resource` auto-approves against the session's working
   * directories: it must be contained by **at least one** root. The read's
   * symlink-resolved real path is compared too, so a symlink that crosses
   * from one root into another is *not* auto-approved (fail-closed). With a
   * single root this is identical to the previous behaviour.
   */
  async _isReadAutoApproved(resource, workingDirectories) {
    if (!workingDirectories || workingDirectories.length === 0) {
      return false;
    }
    const resourcesToCheck = this._resolveResourcesForApproval(resource);
    const match = await firstParallel(
      workingDirectories.map((directory) => this._isReadContainedByRoot(resourcesToCheck, directory)),
      (approved) => approved
    );
    return match === true;
  }
  /** Whether every resolved read candidate is contained by `workingDirectory` (or its real path). */
  async _isReadContainedByRoot(resourcesToCheckPromise, workingDirectory) {
    const [resourcesToCheck, workingDirectories] = await Promise.all([resourcesToCheckPromise, this._resolveResourcesForApproval(workingDirectory)]);
    return resourcesToCheck !== void 0 && workingDirectories !== void 0 && resourcesToCheck.every((candidate) => workingDirectories.some((directory) => this._isResourceInDirectory(candidate, directory)));
  }
  _isResourceInWorkingDirectory(resource, workingDirectory) {
    return workingDirectory !== void 0 && this._isResourceInDirectory(resource, workingDirectory);
  }
  _isResourceInDirectory(resource, directory) {
    return extUriBiasedIgnorePathCase.isEqualOrParent(normalizePath(resource), normalizePath(directory));
  }
  /**
   * Checks whether a shell write-redirection destination (e.g. the `out.txt`
   * in `echo hi > out.txt`) should be auto-approved by reusing the same
   * rules that govern write tool calls: the destination must resolve to a
   * path inside the working directory and must not match a denied glob.
   */
  _isShellWriteDestApproved(dest, workingDirectories) {
    const resource = this._resolveShellRedirectResource(dest, workingDirectories?.[0]);
    if (!resource) {
      return false;
    }
    return (workingDirectories ?? []).some((workingDirectory) => this._checkWriteResource(resource, workingDirectory));
  }
  /**
   * Resolves the raw text of a shell redirect destination to an absolute
   * filesystem path. `~` is expanded to the user's home directory; the
   * downstream working-directory check rejects paths that end up outside
   * the workspace. Returns `undefined` when resolution would require a
   * working directory that isn't configured, or when the destination expands
   * at runtime and therefore cannot be resolved from its text alone.
   */
  _resolveShellRedirectResource(dest, workingDirectory) {
    const trimmed = untildify(dest.trim(), homedir());
    if (!trimmed) {
      return void 0;
    }
    if (SessionPermissionManager._dynamicRedirectDestRegex.test(trimmed) || containsCmdDelayedExpansion(trimmed)) {
      this._logService.trace(`[SessionPermissionManager] Redirect destination expands at runtime, requiring confirmation: ${dest}`);
      return void 0;
    }
    if (path.isAbsolute(trimmed)) {
      return URI.file(trimmed);
    }
    if (!workingDirectory) {
      return void 0;
    }
    return URI.file(path.resolve(workingDirectory.fsPath, trimmed));
  }
  /**
   * Determines whether a write to `resource` can be auto-approved. Mirrors the
   * checks performed by the workbench edit-confirmation pipeline:
   *
   * 1. The path is resolved through any symlinks (following ancestors that do
   *    not yet exist) so a link can't redirect an edit outside the working
   *    directory. Both the literal and resolved paths must pass every check.
   * 2. The path must be free of suspicious characters (see {@link assertPathIsSafe}).
   * 3. The path must live inside the working directory.
   * 4. The path must not target a platform-restricted location (home dotfiles,
   *    `~/Library`, `%APPDATA%`, ...).
   * 5. The path must match the edit auto-approve glob rules.
   */
  async _isEditAutoApproved(resource, workingDirectories) {
    if (!workingDirectories || workingDirectories.length === 0) {
      return false;
    }
    const resourcesToCheck = await this._resolveResourcesForApproval(resource);
    if (resourcesToCheck === void 0) {
      return false;
    }
    return workingDirectories.some((workingDirectory) => resourcesToCheck.every((candidate) => this._checkWriteResource(candidate, workingDirectory)));
  }
  /**
   * Returns the literal path plus, for absolute paths, the symlink-resolved
   * real path. Returns `undefined` when the path cannot be resolved due to
   * missing permissions, signalling that confirmation is required.
   */
  async _resolveResourcesForApproval(resource) {
    const resourcesToCheck = [resource];
    if (resource.scheme !== Schemas.file) {
      return resourcesToCheck;
    }
    try {
      const resolved = await resolveRealPathForNonexistent(resource, this._realpath);
      if (!extUri.isEqual(resolved, resource)) {
        resourcesToCheck.push(resolved);
      }
    } catch (e) {
      const code = e.code;
      if (code === "EPERM" || code === "EACCES") {
        return void 0;
      }
    }
    return resourcesToCheck;
  }
  /** Runs the write checks for a single (already symlink-resolved) resource. */
  _checkWriteResource(resource, workingDirectory) {
    try {
      assertPathIsSafe(resource.fsPath);
    } catch {
      return false;
    }
    if (!this._isResourceInWorkingDirectory(resource, workingDirectory)) {
      return false;
    }
    if (this._isPlatformRestrictedResource(resource, workingDirectory)) {
      return false;
    }
    return this._matchesEditAutoApprovePatterns(resource);
  }
  /**
   * Returns whether `resource` targets a platform-restricted location that
   * should always require confirmation. Edits within home-directory dotfiles
   * are never auto-approved. Edits within platform config directories are
   * allowed only when the working directory itself lives inside them.
   */
  _isPlatformRestrictedResource(resource, workingDirectory) {
    const relativeToHome = extUriBiasedIgnorePathCase.relativePath(HOME_DIR, resource);
    const topLevelName = relativeToHome?.split("/")[0];
    if (extUriBiasedIgnorePathCase.isEqualOrParent(resource, HOME_DIR) && topLevelName?.startsWith(".")) {
      return true;
    }
    for (const restricted of PLATFORM_RESTRICTED_DIRS) {
      const parentURI = URI.file(restricted);
      if (extUriBiasedIgnorePathCase.isEqualOrParent(resource, parentURI)) {
        return !(workingDirectory && extUriBiasedIgnorePathCase.isEqualOrParent(workingDirectory, parentURI));
      }
    }
    return false;
  }
  _matchesEditAutoApprovePatterns(resource) {
    let approved = true;
    const patterns = this._configService.getRootValue(platformRootSchema, AgentHostEditAutoApprovePatternsConfigKey) ?? DEFAULT_EDIT_AUTO_APPROVE_PATTERNS;
    const ignoreCase = extUriBiasedIgnorePathCase.ignorePathCasing(resource);
    for (const patternSet of [patterns, ALWAYS_CHECKED_EDIT_PATTERNS]) {
      for (const [pattern, configuredApproval] of Object.entries(patternSet)) {
        const isApproved = configuredApproval === true;
        if (isApproved !== approved && globMatch(pattern, resource.fsPath, { ignoreCase })) {
          approved = isApproved;
        }
      }
    }
    return approved;
  }
  _isToolAllowedByPermissions(sessionKey, toolCallId) {
    const toolName = this._getToolNameForToolCall(sessionKey, toolCallId);
    if (!toolName) {
      return false;
    }
    const permissions = this._configService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.Permissions);
    const allowed = permissions?.allow.includes(toolName) ?? false;
    if (allowed) {
      this._logService.trace(`[SessionPermissionManager] Auto-approving "${toolName}" via permissions`);
    }
    return allowed;
  }
  _getToolNameForToolCall(sessionKey, toolCallId) {
    const sessionState = this._stateManager.getSessionState(sessionKey);
    const parts = sessionState?.activeTurn?.responseParts;
    if (!parts) {
      return void 0;
    }
    for (const rp of parts) {
      if (rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === toolCallId) {
        return rp.toolCall.toolName;
      }
    }
    return void 0;
  }
  _addToolToSessionPermissions(sessionKey, toolName) {
    const permissions = this._configService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.Permissions) ?? { allow: [], deny: [] };
    if (permissions.allow.includes(toolName)) {
      return;
    }
    this._configService.updateSessionConfig(sessionKey, {
      [SessionConfigKey.Permissions]: {
        allow: [...permissions.allow, toolName],
        deny: [...permissions.deny]
      }
    });
    this._logService.info(`[SessionPermissionManager] Added "${toolName}" to session permissions for ${sessionKey}`);
  }
};
/**
 * Matches redirect destinations whose final path is decided by the shell
 * rather than by the text: variable expansions (`$HOME/x`, `$env:TEMP/x`,
 * `%APPDATA%\x`, `!APPDATA!\x`), command substitutions (`$(pwd)/x`,
 * `` `pwd`/x ``), brace expansions, and `~` in a position {@link untildify}
 * does not handle.
 * Mirrors the workbench's file-write analyzer guard.
 *
 * See https://github.com/microsoft/vscode/issues/274166 and
 * https://github.com/microsoft/vscode/issues/274167
 */
SessionPermissionManager._dynamicRedirectDestRegex = /[$(){}`~%]/;
SessionPermissionManager = __decorateClass([
  __decorateParam(2, IAgentConfigurationService),
  __decorateParam(3, ILogService),
  __decorateParam(4, ISessionDataService)
], SessionPermissionManager);
export {
  SessionPermissionManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxzZXNzaW9uUGVybWlzc2lvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyByZWFscGF0aCBhcyBmc1JlYWxwYXRoIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgaG9tZWRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IHByb21pc2lmeSB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHsgZmlyc3RQYXJhbGxlbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IG1hdGNoIGFzIGdsb2JNYXRjaCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2dsb2IuanMnO1xuaW1wb3J0IHsgdW50aWxkaWZ5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGFiZWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBleHRVcmksIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLCBub3JtYWxpemVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBTFdBWVNfQ0hFQ0tFRF9FRElUX1BBVFRFUk5TLCBERUZBVUxUX0VESVRfQVVUT19BUFBST1ZFX1BBVFRFUk5TIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vY2hhdFNldHRpbmdzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgY29udGFpbnNDbWREZWxheWVkRXhwYW5zaW9uIH0gZnJvbSAnLi4vLi4vdGVybWluYWwvY29tbW9uL2F1dG9BcHByb3ZlL2NtZERlbGF5ZWRFeHBhbnNpb24uanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0RWRpdEF1dG9BcHByb3ZlUGF0dGVybnNDb25maWdLZXksIEFnZW50SG9zdEdsb2JhbEF1dG9BcHByb3ZlRW5hYmxlZENvbmZpZ0tleSwgQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZUVuYWJsZWRDb25maWdLZXksIEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlc0NvbmZpZ0tleSwgcGxhdGZvcm1Sb290U2NoZW1hLCBwbGF0Zm9ybVNlc3Npb25TY2hlbWEgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50VG9vbFBlbmRpbmdDb25maXJtYXRpb25TaWduYWwgfSBmcm9tICcuLi9jb21tb24vYWdlbnQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25EYXRhU2VydmljZSwgaXNTZXNzaW9uQXR0YWNobWVudFBhdGggfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlc3Npb25Db25maWdLZXkgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvbkNvbmZpZ0tleXMuanMnO1xuaW1wb3J0IHsgQ29uZmlybWF0aW9uT3B0aW9uS2luZCwgdHlwZSBDb25maXJtYXRpb25PcHRpb24gfSBmcm9tICcuLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgdHlwZSBJVG9vbENhbGxSZWFkeUFjdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQge1xuXHRpc0FocENoYXRDaGFubmVsLFxuXHRwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpLFxuXHRSZXNwb25zZVBhcnRLaW5kLFxuXHRUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbixcblx0dHlwZSBVUkkgYXMgUHJvdG9jb2xVUkksXG59IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgZ2V0RWZmZWN0aXZlV29ya2luZ0RpcmVjdG9yaWVzLCBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4vYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBDb21tYW5kQXV0b0FwcHJvdmVyIH0gZnJvbSAnLi9jb21tYW5kQXV0b0FwcHJvdmVyLmpzJztcblxuLyoqXG4gKiBFdmVudCBmaWVsZHMgbmVlZGVkIGZvciBhdXRvLWFwcHJvdmFsIGRlY2lzaW9ucy5cbiAqIE1hdGNoZXMgdGhlIHN1YnNldCBvZiB7QGxpbmsgSUFnZW50VG9vbFBlbmRpbmdDb25maXJtYXRpb25TaWduYWx9IHVzZWQgYnkgdGhlXG4gKiBhcHByb3ZhbCBwaXBlbGluZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVG9vbEFwcHJvdmFsRXZlbnQge1xuXHRyZWFkb25seSB0b29sQ2FsbElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlc3Npb246IFVSSTtcblx0cmVhZG9ubHkgcGVybWlzc2lvbktpbmQ/OiBJQWdlbnRUb29sUGVuZGluZ0NvbmZpcm1hdGlvblNpZ25hbFsncGVybWlzc2lvbktpbmQnXTtcblx0cmVhZG9ubHkgcGVybWlzc2lvblBhdGg/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRvb2xJbnB1dD86IHN0cmluZztcblx0cmVhZG9ubHkgcmVxdWVzdFNhbmRib3hCeXBhc3M/OiBib29sZWFuO1xuXHRyZWFkb25seSBzaGVsbExhbmd1YWdlPzogSUFnZW50VG9vbFBlbmRpbmdDb25maXJtYXRpb25TaWduYWxbJ3NoZWxsTGFuZ3VhZ2UnXTtcbn1cblxuLyoqIFN0YW5kYXJkIHBlci10b29sIGNvbmZpcm1hdGlvbiBvcHRpb25zIHByZXNlbnRlZCB0byB0aGUgdXNlci4gKi9cbmNvbnN0IEFMTE9XX1NFU1NJT05fT1BUSU9OX0lEID0gJ2FsbG93LXNlc3Npb24nO1xuY29uc3QgQUxMT1dfT05DRV9PUFRJT046IENvbmZpcm1hdGlvbk9wdGlvbiA9IHsgaWQ6ICdhbGxvdy1vbmNlJywgbGFiZWw6IGxvY2FsaXplKCdzZXNzaW9uUGVybWlzc2lvbnMuYWxsb3dPbmNlJywgXCJBbGxvdyBPbmNlXCIpLCBraW5kOiBDb25maXJtYXRpb25PcHRpb25LaW5kLkFwcHJvdmUgfTtcbmNvbnN0IFNLSVBfT1BUSU9OOiBDb25maXJtYXRpb25PcHRpb24gPSB7IGlkOiAnc2tpcCcsIGxhYmVsOiBsb2NhbGl6ZSgnc2Vzc2lvblBlcm1pc3Npb25zLnNraXAnLCBcIlNraXBcIiksIGtpbmQ6IENvbmZpcm1hdGlvbk9wdGlvbktpbmQuRGVueSwgZ3JvdXA6IDIgfTtcbmNvbnN0IENPTkZJUk1BVElPTl9PUFRJT05TOiByZWFkb25seSBDb25maXJtYXRpb25PcHRpb25bXSA9IFtcblx0eyBpZDogQUxMT1dfU0VTU0lPTl9PUFRJT05fSUQsIGxhYmVsOiBsb2NhbGl6ZSgnc2Vzc2lvblBlcm1pc3Npb25zLmFsbG93U2Vzc2lvbicsIFwiQWxsb3cgaW4gdGhpcyBTZXNzaW9uXCIpLCBraW5kOiBDb25maXJtYXRpb25PcHRpb25LaW5kLkFwcHJvdmUsIGdyb3VwOiAxIH0sXG5cdEFMTE9XX09OQ0VfT1BUSU9OLFxuXHRTS0lQX09QVElPTixcbl07XG5jb25zdCBNQU5BR0VEX0NPTkZJUk1BVElPTl9PUFRJT05TOiByZWFkb25seSBDb25maXJtYXRpb25PcHRpb25bXSA9IFtBTExPV19PTkNFX09QVElPTiwgU0tJUF9PUFRJT05dO1xuXG5jb25zdCBIT01FX0RJUiA9IFVSSS5maWxlKGhvbWVkaXIoKSk7XG5cbi8qKlxuICogQWJzb2x1dGUgZGlyZWN0b3J5IHByZWZpeGVzIHdob3NlIGNvbnRlbnRzIGFyZSBwbGF0Zm9ybSBjb25maWd1cmF0aW9uIGRhdGFcbiAqIChlLmcuIGB+L0xpYnJhcnlgLCBgJUFQUERBVEElYCkuIFdyaXRlcyB1bmRlciB0aGVzZSByZXF1aXJlIGNvbmZpcm1hdGlvblxuICogdW5sZXNzIHRoZSB3b3JraW5nIGRpcmVjdG9yeSBpdHNlbGYgbGl2ZXMgaW5zaWRlIHRoZSByZXN0cmljdGVkIGRpcmVjdG9yeS5cbiAqL1xuY29uc3QgUExBVEZPUk1fUkVTVFJJQ1RFRF9ESVJTOiByZWFkb25seSBzdHJpbmdbXSA9IChcblx0aXNXaW5kb3dzXG5cdFx0PyBbcHJvY2Vzcy5lbnYuQVBQREFUQSwgcHJvY2Vzcy5lbnYuTE9DQUxBUFBEQVRBXVxuXHRcdDogaXNNYWNpbnRvc2hcblx0XHRcdD8gW2hvbWVkaXIoKSArICcvTGlicmFyeSddXG5cdFx0XHQ6IFtdXG4pLmZpbHRlcihpc0RlZmluZWQpO1xuXG5jb25zdCByZWFscGF0aCA9IHByb21pc2lmeShmc1JlYWxwYXRoKTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhhdCBhIHBhdGggZG9lc24ndCBjb250YWluIHN1c3BpY2lvdXMgY2hhcmFjdGVycyB0aGF0IGNvdWxkIGJlXG4gKiB1c2VkIHRvIGJ5cGFzcyBzZWN1cml0eSBjaGVja3Mgb24gV2luZG93cyAoZS5nLiBOVEZTIEFsdGVybmF0ZSBEYXRhIFN0cmVhbXMsXG4gKiBpbnZhbGlkIGNoYXJhY3RlcnMsIHJlc2VydmVkIGRldmljZSBuYW1lcykuIFRocm93cyBpZiB0aGUgcGF0aCBpcyBzdXNwaWNpb3VzLlxuICovXG5mdW5jdGlvbiBhc3NlcnRQYXRoSXNTYWZlKGZzUGF0aDogc3RyaW5nLCBfaXNXaW5kb3dzID0gaXNXaW5kb3dzKTogdm9pZCB7XG5cdGlmIChmc1BhdGguaW5jbHVkZXMoJ1xcMCcpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBQYXRoIGNvbnRhaW5zIG51bGwgYnl0ZXM6ICR7ZnNQYXRofWApO1xuXHR9XG5cblx0aWYgKCFfaXNXaW5kb3dzKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Ly8gQ2hlY2sgZm9yIE5URlMgQWx0ZXJuYXRlIERhdGEgU3RyZWFtcyAoQURTKVxuXHRjb25zdCBjb2xvbkluZGV4ID0gZnNQYXRoLmluZGV4T2YoJzonLCAyKTtcblx0aWYgKGNvbG9uSW5kZXggIT09IC0xKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBQYXRoIGNvbnRhaW5zIGludmFsaWQgY2hhcmFjdGVycyAoYWx0ZXJuYXRlIGRhdGEgc3RyZWFtKTogJHtmc1BhdGh9YCk7XG5cdH1cblxuXHQvLyBDaGVjayBmb3IgaW52YWxpZCBXaW5kb3dzIGZpbGVuYW1lIGNoYXJhY3RlcnNcblx0Y29uc3QgaW52YWxpZENoYXJzID0gL1s8PlwifD8qXS87XG5cdGNvbnN0IHBhdGhBZnRlckRyaXZlID0gZnNQYXRoLmxlbmd0aCA+IDIgPyBmc1BhdGguc3Vic3RyaW5nKDIpIDogZnNQYXRoO1xuXHRpZiAoaW52YWxpZENoYXJzLnRlc3QocGF0aEFmdGVyRHJpdmUpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBQYXRoIGNvbnRhaW5zIGludmFsaWQgY2hhcmFjdGVyczogJHtmc1BhdGh9YCk7XG5cdH1cblxuXHQvLyBDaGVjayBmb3IgbmFtZWQgcGlwZXMgb3IgZGV2aWNlIHBhdGhzXG5cdGlmIChmc1BhdGguc3RhcnRzV2l0aCgnXFxcXFxcXFwuJykgfHwgZnNQYXRoLnN0YXJ0c1dpdGgoJ1xcXFxcXFxcPycpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBQYXRoIGlzIGEgcmVzZXJ2ZWQgZGV2aWNlIHBhdGg6ICR7ZnNQYXRofWApO1xuXHR9XG5cblx0Y29uc3QgcmVzZXJ2ZWQgPSAvXihDT058UFJOfEFVWHxOVUx8Q09NWzEtOV18TFBUWzEtOV0pKFxcLnwkKS9pO1xuXG5cdC8vIENoZWNrIGZvciB0cmFpbGluZyBkb3RzIGFuZCBzcGFjZXMgb24gcGF0aCBjb21wb25lbnRzIChXaW5kb3dzIHF1aXJrKVxuXHRjb25zdCBwYXJ0cyA9IGZzUGF0aC5zcGxpdCgnXFxcXCcpO1xuXHRmb3IgKGNvbnN0IHBhcnQgb2YgcGFydHMpIHtcblx0XHRpZiAocGFydC5sZW5ndGggPT09IDApIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGlmIChyZXNlcnZlZC50ZXN0KHBhcnQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFJlc2VydmVkIGRldmljZSBuYW1lIGluIHBhdGg6ICR7ZnNQYXRofWApO1xuXHRcdH1cblxuXHRcdGlmIChwYXJ0LmVuZHNXaXRoKCcuJykgfHwgcGFydC5lbmRzV2l0aCgnICcpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFBhdGggY29udGFpbnMgaW52YWxpZCB0cmFpbGluZyBjaGFyYWN0ZXJzOiAke2ZzUGF0aH1gKTtcblx0XHR9XG5cblx0XHRjb25zdCB0aWxkZUluZGV4ID0gcGFydC5pbmRleE9mKCd+Jyk7XG5cdFx0aWYgKHRpbGRlSW5kZXggIT09IC0xKSB7XG5cdFx0XHRjb25zdCBhZnRlclRpbGRlID0gcGFydC5zdWJzdHJpbmcodGlsZGVJbmRleCArIDEpO1xuXHRcdFx0aWYgKGFmdGVyVGlsZGUubGVuZ3RoID4gMCAmJiAvXlxcZC8udGVzdChhZnRlclRpbGRlKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFBhdGggYXBwZWFycyB0byB1c2Ugc2hvcnQgZmlsZW5hbWUgZm9ybWF0ICg4LjMgbmFtZXMpOiAke2ZzUGF0aH0uIFBsZWFzZSB1c2UgdGhlIGZ1bGwgcGF0aC5gKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBSZXNvbHZlcyB0aGUgcmVhbCBwYXRoIG9mIGByZXNvdXJjZWAsIHdhbGtpbmcgdXAgdGhlIHBhcmVudCBjaGFpbiB3aGVuIHRoZSBwYXRoXG4gKiAob3IgaXRzIGFuY2VzdG9ycykgZG9lcyBub3QgeWV0IGV4aXN0IG9uIGRpc2suIFRoaXMgZW5zdXJlcyBhIHN5bWxpbmsgYXQgYW55XG4gKiBhbmNlc3RvciBpcyBmb2xsb3dlZCBldmVuIGZvciBmaWxlcyB0aGF0IGFyZSBhYm91dCB0byBiZSBjcmVhdGVkLlxuICovXG5hc3luYyBmdW5jdGlvbiByZXNvbHZlUmVhbFBhdGhGb3JOb25leGlzdGVudChyZXNvdXJjZTogVVJJLCByZWFscGF0aDogKGZzUGF0aDogc3RyaW5nKSA9PiBQcm9taXNlPHN0cmluZz4pOiBQcm9taXNlPFVSST4ge1xuXHRjb25zdCBmc1BhdGggPSByZXNvdXJjZS5mc1BhdGg7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIFVSSS5maWxlKGF3YWl0IHJlYWxwYXRoKGZzUGF0aCkpO1xuXHR9IGNhdGNoIChlKSB7XG5cdFx0aWYgKChlIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbikuY29kZSAhPT0gJ0VOT0VOVCcpIHtcblx0XHRcdHRocm93IGU7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgdGFpbDogc3RyaW5nW10gPSBbcGF0aC5iYXNlbmFtZShmc1BhdGgpXTtcblx0bGV0IGN1cnJlbnQgPSBwYXRoLmRpcm5hbWUoZnNQYXRoKTtcblx0d2hpbGUgKHRydWUpIHtcblx0XHRjb25zdCBwYXJlbnQgPSBwYXRoLmRpcm5hbWUoY3VycmVudCk7XG5cdFx0aWYgKHBhcmVudCA9PT0gY3VycmVudCkge1xuXHRcdFx0Ly8gUmVhY2hlZCB0aGUgZmlsZXN5c3RlbSByb290IHdpdGhvdXQgZmluZGluZyBhbiBleGlzdGluZyBhbmNlc3Rvci5cblx0XHRcdHJldHVybiByZXNvdXJjZTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgcmVhbHBhdGgoY3VycmVudCk7XG5cdFx0XHRyZXR1cm4gVVJJLmZpbGUocGF0aC5qb2luKHJlc29sdmVkLCAuLi50YWlsKSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc3QgY29kZSA9IChlIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbikuY29kZTtcblx0XHRcdGlmIChjb2RlICE9PSAnRU5PRU5UJyAmJiBjb2RlICE9PSAnRU5PVERJUicpIHtcblx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGFpbC51bnNoaWZ0KHBhdGguYmFzZW5hbWUoY3VycmVudCkpO1xuXHRcdGN1cnJlbnQgPSBwYXJlbnQ7XG5cdH1cbn1cblxuLyoqXG4gKiBTaW5nbGUgZW50cnkgcG9pbnQgZm9yIGFsbCB0b29sLWNhbGwgYXBwcm92YWwgbG9naWMgaW4gdGhlIGFnZW50IGhvc3QuXG4gKlxuICogTW9kZWxlZCBhZnRlciB7QGxpbmsgSUxhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2V9IGluIHRoZVxuICogd29ya2JlbmNoIGxheWVyLCB0aGlzIG1hbmFnZXIgb3duczpcbiAqXG4gKiAtICoqQXV0by1hcHByb3ZhbCoqIChgZ2V0QXV0b0FwcHJvdmFsYCkgXHUyMDE0IGNoZWNrcyBzZXNzaW9uLWxldmVsIGNvbmZpZyxcbiAqICAgcGVyLXRvb2wgc2Vzc2lvbiBwZXJtaXNzaW9ucywgcmVhZC93cml0ZSBwYXRoIHJ1bGVzLCBhbmQgc2hlbGxcbiAqICAgY29tbWFuZCBydWxlcy4gUmV0dXJucyBhIHtAbGluayBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbn0gd2hlblxuICogICB0aGUgdG9vbCBzaG91bGQgYmUgYXV0by1hcHByb3ZlZCwgb3IgYHVuZGVmaW5lZGAgd2hlbiB1c2VyXG4gKiAgIGNvbmZpcm1hdGlvbiBpcyBuZWVkZWQuXG4gKlxuICogLSAqKkNvbmZpcm1hdGlvbiBvcHRpb25zKiogKGBjcmVhdGVUb29sUmVhZHlBY3Rpb25gKSBcdTIwMTQgY29uc3RydWN0cyB0aGVcbiAqICAgcHJvdG9jb2wgYWN0aW9uIHdpdGggdGhlIHN0YW5kYXJkIFwiQWxsb3cgT25jZSAvIEFsbG93IGluIHRoaXNcbiAqICAgU2Vzc2lvbiAvIFNraXBcIiBvcHRpb25zIGJha2VkIGluLlxuICpcbiAqIC0gKipQb3N0LWNvbmZpcm1hdGlvbiBzaWRlIGVmZmVjdHMqKiAoYGhhbmRsZVRvb2xDYWxsQ29uZmlybWVkYCkgXHUyMDE0XG4gKiAgIHBlcnNpc3RzIHRoZSB1c2VyJ3MgY2hvaWNlIChlLmcuIGFkZGluZyBhIHRvb2wgdG8gdGhlIHNlc3Npb25cbiAqICAgcGVybWlzc2lvbnMgbGlzdCkuXG4gKi9cbmV4cG9ydCBjbGFzcyBTZXNzaW9uUGVybWlzc2lvbk1hbmFnZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHQvLyAtLS0tIEVkaXQgYXV0by1hcHByb3ZlIHBhdHRlcm5zIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWFuZEF1dG9BcHByb3ZlcjogQ29tbWFuZEF1dG9BcHByb3Zlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVhbHBhdGg6IChmc1BhdGg6IHN0cmluZykgPT4gUHJvbWlzZTxzdHJpbmc+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLFxuXHRcdG9wdGlvbnM6IHsgcmVhbHBhdGg/OiAoZnNQYXRoOiBzdHJpbmcpID0+IFByb21pc2U8c3RyaW5nPiB9LFxuXHRcdEBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWdTZXJ2aWNlOiBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElTZXNzaW9uRGF0YVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkRhdGFTZXJ2aWNlOiBJU2Vzc2lvbkRhdGFTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlYWxwYXRoID0gb3B0aW9ucz8ucmVhbHBhdGggPz8gcmVhbHBhdGg7XG5cdFx0dGhpcy5fY29tbWFuZEF1dG9BcHByb3ZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDb21tYW5kQXV0b0FwcHJvdmVyKHRoaXMuX2xvZ1NlcnZpY2UpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbml0aWFsaXplcyBhc3luYyByZXNvdXJjZXMgKHRyZWUtc2l0dGVyIFdBU00pIHVzZWQgZm9yIHNoZWxsIGNvbW1hbmRcblx0ICogYXV0by1hcHByb3ZhbC4gQXdhaXQgdGhpcyBiZWZvcmUgYW55IHNlc3Npb24gZXZlbnRzIGNhbiBhcnJpdmUgc28gdGhhdFxuXHQgKiBzaGVsbCBjb21tYW5kIHBhcnNpbmcgd2l0aGluIHtAbGluayBnZXRBdXRvQXBwcm92YWx9IGlzIHN5bmNocm9ub3VzLlxuXHQgKi9cblx0aW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fY29tbWFuZEF1dG9BcHByb3Zlci5pbml0aWFsaXplKCk7XG5cdH1cblxuXHQvLyAtLS0tIEF1dG8tYXBwcm92YWwgKGFuYWxvZ291cyB0byBnZXRQcmVDb25maXJtQWN0aW9uKSAtLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIENoZWNrcyB3aGV0aGVyIGEgYHRvb2xfcmVhZHlgIGV2ZW50IHNob3VsZCBiZSBhdXRvLWFwcHJvdmVkLiBSZXR1cm5zIGFcblx0ICoge0BsaW5rIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29ufSB3aGVuIHRoZSB0b29sIGNhbGwgc2hvdWxkIHByb2NlZWRcblx0ICogd2l0aG91dCB1c2VyIGludGVyYWN0aW9uLCBvciBgdW5kZWZpbmVkYCB3aGVuIHVzZXIgY29uZmlybWF0aW9uIGlzXG5cdCAqIHJlcXVpcmVkLlxuXHQgKlxuXHQgKiBDaGVja3MgYXJlIGV2YWx1YXRlZCBpbiBvcmRlcjpcblx0ICogMS4gR2xvYmFsIGF1dG8tYXBwcm92ZSBzZXR0aW5nIChgY2hhdC50b29scy5nbG9iYWwuYXV0b0FwcHJvdmVgKVxuXHQgKiAyLiBTZXNzaW9uLWxldmVsIGJ5cGFzcyAoYGF1dG9BcHByb3ZlYCBjb25maWcpXG5cdCAqIDMuIFBlci10b29sIHNlc3Npb24gcGVybWlzc2lvbnMgKGBwZXJtaXNzaW9ucy5hbGxvd2ApXG5cdCAqIDQuIFJlYWQgcGF0aCBydWxlcyAod2l0aGluIHdvcmtpbmcgZGlyZWN0b3J5KVxuXHQgKiA1LiBXcml0ZSBwYXRoIHJ1bGVzICh3aXRoaW4gd29ya2luZyBkaXJlY3RvcnkgKyBnbG9iIHBhdHRlcm5zKVxuXHQgKiA2LiBTaGVsbCBjb21tYW5kIHJ1bGVzICh0cmVlLXNpdHRlciBwYXJzZWQsIGRlZmF1bHQgYWxsb3cvZGVueSlcblx0ICovXG5cdGFzeW5jIGdldEF1dG9BcHByb3ZhbChlOiBJVG9vbEFwcHJvdmFsRXZlbnQsIHNlc3Npb25LZXk6IFByb3RvY29sVVJJKTogUHJvbWlzZTxUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIGBzZXNzaW9uS2V5YCBpcyB0aGUgY2hhdCBjaGFubmVsIFVSSSAoc2VlIGBfaGFuZGxlVG9vbFJlYWR5YCksIHNvIHRoZVxuXHRcdC8vIHN0YXRlIG1hbmFnZXIgcmV0dXJucyB0aGF0IGNoYXQncyAqZWZmZWN0aXZlKiB3b3JraW5nLWRpcmVjdG9yeSBzZXRcblx0XHQvLyAoaXRzIG93biBzdWJzZXQgb3ZlcnJpZGUgd2hlbiBwcmVzZW50LCBlbHNlIHRoZSBzZXNzaW9uJ3MgZnVsbCBzZXQgXHUyMDE0XG5cdFx0Ly8gcGVlciBjaGF0cyBpbmhlcml0KS4gQSByZWFkL3dyaXRlL3NoZWxsIGRlc3RpbmF0aW9uIGF1dG8tYXBwcm92ZXMgd2hlblxuXHRcdC8vIGNvbnRhaW5lZCBieSAqYW55KiByb290LiBUb2RheSB0aGUgc2V0IGhhcyBleGFjdGx5IG9uZSBlbnRyeSAodGhlXG5cdFx0Ly8gY3JlYXRlLXRpbWUgbGVuZ3RoIGd1YXJkKSwgc28gdGhpcyBpcyBiZWhhdmlvdXItaWRlbnRpY2FsIHRvIHRoZVxuXHRcdC8vIHByZXZpb3VzIHNpbmdsZS1kaXJlY3RvcnkgbG9naWMuXG5cdFx0Y29uc3Qgd29ya0RpcnMgPSBnZXRFZmZlY3RpdmVXb3JraW5nRGlyZWN0b3JpZXModGhpcy5fc3RhdGVNYW5hZ2VyLCBzZXNzaW9uS2V5KTtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3JpZXMgPSB3b3JrRGlycz8ubWFwKGQgPT4gVVJJLnBhcnNlKGQpKTtcblxuXHRcdC8vIDAuIFNhbmRib3ggYnlwYXNzOiBhIHNoZWxsIGNvbW1hbmQgdGhhdCBvcHRlZCBvdXQgb2YgdGhlXG5cdFx0Ly8gc2FuZGJveCAoYHJlcXVlc3RTYW5kYm94QnlwYXNzYCkgZXNjYXBlcyB0aGUgc2FuZGJveCdzXG5cdFx0Ly8gY29udGFpbm1lbnQuXG5cdFx0aWYgKGUucmVxdWVzdFNhbmRib3hCeXBhc3MpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gMS4gR2xvYmFsIGF1dG8tYXBwcm92ZSBzZXR0aW5nXG5cdFx0aWYgKHRoaXMuaXNHbG9iYWxBdXRvQXBwcm92ZUVuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlNldHRpbmc7XG5cdFx0fVxuXG5cdFx0Ly8gMi4gU2Vzc2lvbi1sZXZlbCBhdXRvLWFwcHJvdmVcblx0XHRpZiAodGhpcy5pc1Nlc3Npb25BdXRvQXBwcm92ZUVuYWJsZWQoc2Vzc2lvbktleSkpIHtcblx0XHRcdHJldHVybiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5TZXR0aW5nO1xuXHRcdH1cblxuXHRcdC8vIDMuIFBlci10b29sIHNlc3Npb24gcGVybWlzc2lvbnNcblx0XHRpZiAodGhpcy5faXNUb29sQWxsb3dlZEJ5UGVybWlzc2lvbnMoc2Vzc2lvbktleSwgZS50b29sQ2FsbElkKSkge1xuXHRcdFx0cmV0dXJuIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlNldHRpbmc7XG5cdFx0fVxuXG5cdFx0Ly8gNC4gUmVhZCBhdXRvLWFwcHJvdmFsXG5cdFx0aWYgKGUucGVybWlzc2lvbktpbmQgPT09ICdyZWFkJyAmJiBlLnBlcm1pc3Npb25QYXRoKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLnBhcnNlKGlzQWhwQ2hhdENoYW5uZWwoc2Vzc2lvbktleSkgPyBwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpKHNlc3Npb25LZXkpIDogc2Vzc2lvbktleSk7XG5cdFx0XHRpZiAoaXNTZXNzaW9uQXR0YWNobWVudFBhdGgodGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLCBzZXNzaW9uVXJpLCBlLnBlcm1pc3Npb25QYXRoKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbU2Vzc2lvblBlcm1pc3Npb25NYW5hZ2VyXSBBdXRvLWFwcHJvdmluZyBzZXNzaW9uIGF0dGFjaG1lbnQgcmVhZCBvZiAke2UucGVybWlzc2lvblBhdGh9YCk7XG5cdFx0XHRcdHJldHVybiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5faXNSZWFkQXV0b0FwcHJvdmVkKFVSSS5maWxlKGUucGVybWlzc2lvblBhdGgpLCB3b3JraW5nRGlyZWN0b3JpZXMpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtTZXNzaW9uUGVybWlzc2lvbk1hbmFnZXJdIEF1dG8tYXBwcm92aW5nIHJlYWQgb2YgJHtlLnBlcm1pc3Npb25QYXRofWApO1xuXHRcdFx0XHRyZXR1cm4gVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyA1LiBXcml0ZSBhdXRvLWFwcHJvdmFsXG5cdFx0aWYgKGUucGVybWlzc2lvbktpbmQgPT09ICd3cml0ZScgJiYgZS5wZXJtaXNzaW9uUGF0aCkge1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMuX2lzRWRpdEF1dG9BcHByb3ZlZChVUkkuZmlsZShlLnBlcm1pc3Npb25QYXRoKSwgd29ya2luZ0RpcmVjdG9yaWVzKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbU2Vzc2lvblBlcm1pc3Npb25NYW5hZ2VyXSBBdXRvLWFwcHJvdmluZyB3cml0ZSB0byAke2UucGVybWlzc2lvblBhdGh9YCk7XG5cdFx0XHRcdHJldHVybiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIDYuIFNoZWxsIGF1dG8tYXBwcm92YWxcblx0XHRpZiAoZS5wZXJtaXNzaW9uS2luZCA9PT0gJ3NoZWxsJyAmJiBlLnRvb2xJbnB1dCkge1xuXHRcdFx0Ly8gVGVybWluYWwtcnVsZSBhbmFseXNpcyBuZWVkcyBhbiBleHBsaWNpdCBzaGVsbCBkaWFsZWN0LiBQcm9kdWNlcnNcblx0XHRcdC8vIHRoYXQgb21pdCBgc2hlbGxMYW5ndWFnZWAgKG9yIGZhaWwgdG8gY29ycmVsYXRlIG9uZSkgbXVzdCBwcm9tcHQuXG5cdFx0XHRpZiAoIWUuc2hlbGxMYW5ndWFnZSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdbU2Vzc2lvblBlcm1pc3Npb25NYW5hZ2VyXSBTaGVsbCBsYW5ndWFnZSBpcyBtaXNzaW5nLCByZXF1aXJpbmcgY29uZmlybWF0aW9uJyk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fY29uZmlnU2VydmljZS5nZXRSb290VmFsdWUocGxhdGZvcm1Sb290U2NoZW1hLCBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlRW5hYmxlZENvbmZpZ0tleSkgPT09IGZhbHNlKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9jb21tYW5kQXV0b0FwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKGUudG9vbElucHV0LCB7XG5cdFx0XHRcdGF1dG9BcHByb3ZlUnVsZXM6IHRoaXMuX2NvbmZpZ1NlcnZpY2UuZ2V0Um9vdFZhbHVlKHBsYXRmb3JtUm9vdFNjaGVtYSwgQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzQ29uZmlnS2V5KSxcblx0XHRcdFx0aXNXcml0ZURlc3RBcHByb3ZlZDogZGVzdCA9PiB0aGlzLl9pc1NoZWxsV3JpdGVEZXN0QXBwcm92ZWQoZGVzdCwgd29ya2luZ0RpcmVjdG9yaWVzKSxcblx0XHRcdFx0bGFuZ3VhZ2U6IGUuc2hlbGxMYW5ndWFnZSxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKHJlc3VsdCA9PT0gJ2FwcHJvdmVkJykge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdbU2Vzc2lvblBlcm1pc3Npb25NYW5hZ2VyXSBBdXRvLWFwcHJvdmluZyBzaGVsbCBjb21tYW5kJyk7XG5cdFx0XHRcdHJldHVybiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzdWx0ID09PSAnZGVuaWVkJykge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdbU2Vzc2lvblBlcm1pc3Npb25NYW5hZ2VyXSBTaGVsbCBjb21tYW5kIGRlbmllZCBieSBydWxlJyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKiogV2hldGhlciBhZGRpbmcgYSBwZXJzaXN0ZW50IHRlcm1pbmFsIGF1dG8tYXBwcm92ZSBydWxlIGNhbiBzdXBwcmVzcyBmdXR1cmUgcHJvbXB0cyBmb3IgdGhpcyBzaGVsbCBldmVudC4gKi9cblx0aXNBdXRvQXBwcm92ZVJ1bGVSZXNvbHZhYmxlKGU6IElUb29sQXBwcm92YWxFdmVudCwgc2Vzc2lvbktleTogUHJvdG9jb2xVUkkpOiBib29sZWFuIHtcblx0XHRpZiAoZS5wZXJtaXNzaW9uS2luZCAhPT0gJ3NoZWxsJyB8fCAhZS50b29sSW5wdXQgfHwgZS5yZXF1ZXN0U2FuZGJveEJ5cGFzcyB8fCAhZS5zaGVsbExhbmd1YWdlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jb25maWdTZXJ2aWNlLmdldFJvb3RWYWx1ZShwbGF0Zm9ybVJvb3RTY2hlbWEsIEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVFbmFibGVkQ29uZmlnS2V5KSA9PT0gZmFsc2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3Qgd29ya0RpcnMgPSBnZXRFZmZlY3RpdmVXb3JraW5nRGlyZWN0b3JpZXModGhpcy5fc3RhdGVNYW5hZ2VyLCBzZXNzaW9uS2V5KTtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3JpZXMgPSB3b3JrRGlycz8ubWFwKGQgPT4gVVJJLnBhcnNlKGQpKTtcblx0XHRyZXR1cm4gdGhpcy5fY29tbWFuZEF1dG9BcHByb3Zlci5ldmFsdWF0ZShlLnRvb2xJbnB1dCwge1xuXHRcdFx0YXV0b0FwcHJvdmVSdWxlczogdGhpcy5fY29uZmlnU2VydmljZS5nZXRSb290VmFsdWUocGxhdGZvcm1Sb290U2NoZW1hLCBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXNDb25maWdLZXkpLFxuXHRcdFx0aXNXcml0ZURlc3RBcHByb3ZlZDogZGVzdCA9PiB0aGlzLl9pc1NoZWxsV3JpdGVEZXN0QXBwcm92ZWQoZGVzdCwgd29ya2luZ0RpcmVjdG9yaWVzKSxcblx0XHRcdGxhbmd1YWdlOiBlLnNoZWxsTGFuZ3VhZ2UsXG5cdFx0fSkuYXV0b0FwcHJvdmVSdWxlUmVzb2x2YWJsZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgVlMgQ29kZSdzIGdsb2JhbCBhdXRvLWFwcHJvdmUgc2V0dGluZyAoYGNoYXQudG9vbHMuZ2xvYmFsLmF1dG9BcHByb3ZlYCkgaXMgZW5hYmxlZC5cblx0ICogV2hlbiBlbmFibGVkLCBldmVyeSB0b29sIGNhbGwgaXMgYXV0by1hcHByb3ZlZCB3aXRob3V0IGNoYW5naW5nIHRoZSBzZXNzaW9uJ3MgYXBwcm92YWwgbGV2ZWwgaW4gdGhlIHBlcm1pc3Npb25zIHBpY2tlci5cblx0ICovXG5cdGlzR2xvYmFsQXV0b0FwcHJvdmVFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWdTZXJ2aWNlLmdldFJvb3RWYWx1ZShwbGF0Zm9ybVJvb3RTY2hlbWEsIEFnZW50SG9zdEdsb2JhbEF1dG9BcHByb3ZlRW5hYmxlZENvbmZpZ0tleSkgPT09IHRydWU7XG5cdH1cblxuXHRnZXRFZmZlY3RpdmVBcHByb3ZhbExldmVsKHNlc3Npb25LZXk6IFByb3RvY29sVVJJKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlnU2VydmljZS5nZXRFZmZlY3RpdmVWYWx1ZShzZXNzaW9uS2V5LCBwbGF0Zm9ybVNlc3Npb25TY2hlbWEsIFNlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmUpID8/ICdkZWZhdWx0Jztcblx0fVxuXG5cdGlzU2Vzc2lvbkF1dG9BcHByb3ZlRW5hYmxlZChzZXNzaW9uS2V5OiBQcm90b2NvbFVSSSk6IGJvb2xlYW4ge1xuXHRcdC8vIGBhdXRvQXBwcm92ZWAgKEFsbG93IEFsbCkgYXV0by1hcHByb3ZlcyBldmVyeSB0b29sIGNhbGwuXG5cdFx0cmV0dXJuIHRoaXMuZ2V0RWZmZWN0aXZlQXBwcm92YWxMZXZlbChzZXNzaW9uS2V5KSA9PT0gJ2F1dG9BcHByb3ZlJztcblx0fVxuXG5cdC8vIC0tLS0gQWN0aW9uIGNvbnN0cnVjdGlvbiAoYW5hbG9nb3VzIHRvIGdldFByZUNvbmZpcm1BY3Rpb25zKSAtLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIENvbnN0cnVjdHMgYSBgQ2hhdFRvb2xDYWxsUmVhZHlgIGFjdGlvbiBmcm9tIGFuIGFnZW50XG5cdCAqIGBwZW5kaW5nX2NvbmZpcm1hdGlvbmAgc2lnbmFsLiBXaGVuIHRoZSB0b29sIG5lZWRzIHVzZXIgY29uZmlybWF0aW9uXG5cdCAqICh0aGUgcHJvdG9jb2wgc3RhdGUgY2FycmllcyBgY29uZmlybWF0aW9uVGl0bGVgKSwgdGhlIHN0YW5kYXJkXG5cdCAqIGNvbmZpcm1hdGlvbiBvcHRpb25zIGFyZSBiYWtlZCBpbiBzbyBjbGllbnRzIGNhbiByZW5kZXIgdGhlbSBkaXJlY3RseS5cblx0ICovXG5cdGNyZWF0ZVRvb2xSZWFkeUFjdGlvbihlOiBJQWdlbnRUb29sUGVuZGluZ0NvbmZpcm1hdGlvblNpZ25hbCwgX3Nlc3Npb25LZXk6IFByb3RvY29sVVJJLCB0dXJuSWQ6IHN0cmluZyk6IElUb29sQ2FsbFJlYWR5QWN0aW9uIHtcblx0XHRjb25zdCBzdGF0ZSA9IGUuc3RhdGU7XG5cdFx0aWYgKHN0YXRlLmNvbmZpcm1hdGlvblRpdGxlKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IHN0YXRlLnRvb2xDYWxsSWQsXG5cdFx0XHRcdC4uLihzdGF0ZS5jb250cmlidXRvciA/IHsgY29udHJpYnV0b3I6IHN0YXRlLmNvbnRyaWJ1dG9yIH0gOiB7fSksXG5cdFx0XHRcdC4uLihzdGF0ZS5pbnRlbnRpb24gIT09IHVuZGVmaW5lZCA/IHsgaW50ZW50aW9uOiBzdGF0ZS5pbnRlbnRpb24gfSA6IHt9KSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHN0YXRlLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHR0b29sSW5wdXQ6IHN0YXRlLnRvb2xJbnB1dCxcblx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6IHN0YXRlLmNvbmZpcm1hdGlvblRpdGxlLFxuXHRcdFx0XHRyaXNrQXNzZXNzbWVudDogc3RhdGUucmlza0Fzc2Vzc21lbnQsXG5cdFx0XHRcdGVkaXRzOiBzdGF0ZS5lZGl0cyxcblx0XHRcdFx0ZWRpdGFibGU6IHN0YXRlLmVkaXRhYmxlLFxuXHRcdFx0XHQuLi4oc3RhdGUuX21ldGEgPyB7IF9tZXRhOiBzdGF0ZS5fbWV0YSB9IDoge30pLFxuXHRcdFx0XHQvLyBNYW5hZ2VkIGFza3MgYXJlIG9uZS10aW1lIG9ubHkuIE90aGVyIGFnZW50cyBjYW4gc3VwcGx5IHRvb2wtc3BlY2lmaWNcblx0XHRcdFx0Ly8gYnV0dG9ucyAoZS5nLiBFeGl0UGxhbk1vZGUncyBgQXBwcm92ZWAvYERlbnlgKSB2aWEgYHN0YXRlLm9wdGlvbnNgO1xuXHRcdFx0XHQvLyBvdGhlcndpc2UgdGhlIHN0YW5kYXJkIHNlc3Npb24vb25jZS9za2lwIHNldCBpcyB1c2VkLlxuXHRcdFx0XHRvcHRpb25zOiBlLm1hbmFnZWRBcHByb3ZhbFJlcXVpcmVkXG5cdFx0XHRcdFx0PyBNQU5BR0VEX0NPTkZJUk1BVElPTl9PUFRJT05TLnNsaWNlKClcblx0XHRcdFx0XHQ6IHN0YXRlLm9wdGlvbnNcblx0XHRcdFx0XHRcdD8gc3RhdGUub3B0aW9ucy5zbGljZSgpXG5cdFx0XHRcdFx0XHQ6IENPTkZJUk1BVElPTl9PUFRJT05TLnNsaWNlKCksXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdHR1cm5JZCxcblx0XHRcdHRvb2xDYWxsSWQ6IHN0YXRlLnRvb2xDYWxsSWQsXG5cdFx0XHQuLi4oc3RhdGUuY29udHJpYnV0b3IgPyB7IGNvbnRyaWJ1dG9yOiBzdGF0ZS5jb250cmlidXRvciB9IDoge30pLFxuXHRcdFx0Li4uKHN0YXRlLmludGVudGlvbiAhPT0gdW5kZWZpbmVkID8geyBpbnRlbnRpb246IHN0YXRlLmludGVudGlvbiB9IDoge30pLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHN0YXRlLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0dG9vbElucHV0OiBzdGF0ZS50b29sSW5wdXQsXG5cdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdC4uLihzdGF0ZS5fbWV0YSA/IHsgX21ldGE6IHN0YXRlLl9tZXRhIH0gOiB7fSksXG5cdFx0fTtcblx0fVxuXG5cdC8vIC0tLS0gUG9zdC1jb25maXJtYXRpb24gc2lkZSBlZmZlY3RzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogSGFuZGxlcyB0aGUgc2lkZSBlZmZlY3Qgb2YgYSBgQ2hhdFRvb2xDYWxsQ29uZmlybWVkYCBhY3Rpb24gd2hlbiB0aGVcblx0ICogdXNlciBzZWxlY3RlZCBcIkFsbG93IGluIHRoaXMgU2Vzc2lvblwiLiBBZGRzIHRoZSB0b29sIHRvIHRoZSBzZXNzaW9uJ3Ncblx0ICogcGVybWlzc2lvbiBhbGxvdyBsaXN0IHNvIGZ1dHVyZSBjYWxscyBhcmUgYXV0by1hcHByb3ZlZC5cblx0ICovXG5cdGhhbmRsZVRvb2xDYWxsQ29uZmlybWVkKGNoYXRDaGFubmVsOiBQcm90b2NvbFVSSSwgdG9vbENhbGxJZDogc3RyaW5nLCBzZWxlY3RlZE9wdGlvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIWlzQWhwQ2hhdENoYW5uZWwoY2hhdENoYW5uZWwpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFRvb2wgY2FsbCBjb25maXJtYXRpb25zIG11c3QgYmUgaGFuZGxlZCBvbiBhbiBBSFAgY2hhdCBjaGFubmVsOiAke2NoYXRDaGFubmVsfWApO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShjaGF0Q2hhbm5lbCk7XG5cdFx0aWYgKHNlbGVjdGVkT3B0aW9uSWQgPT09IEFMTE9XX1NFU1NJT05fT1BUSU9OX0lEKSB7XG5cdFx0XHRjb25zdCB0b29sTmFtZSA9IHRoaXMuX2dldFRvb2xOYW1lRm9yVG9vbENhbGwoY2hhdENoYW5uZWwsIHRvb2xDYWxsSWQpO1xuXHRcdFx0aWYgKHRvb2xOYW1lKSB7XG5cdFx0XHRcdHRoaXMuX2FkZFRvb2xUb1Nlc3Npb25QZXJtaXNzaW9ucyhzZXNzaW9uS2V5LCB0b29sTmFtZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tLSBJbnRlcm5hbCBoZWxwZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIGEgcmVhZCBvZiBgcmVzb3VyY2VgIGF1dG8tYXBwcm92ZXMgYWdhaW5zdCB0aGUgc2Vzc2lvbidzIHdvcmtpbmdcblx0ICogZGlyZWN0b3JpZXM6IGl0IG11c3QgYmUgY29udGFpbmVkIGJ5ICoqYXQgbGVhc3Qgb25lKiogcm9vdC4gVGhlIHJlYWQnc1xuXHQgKiBzeW1saW5rLXJlc29sdmVkIHJlYWwgcGF0aCBpcyBjb21wYXJlZCB0b28sIHNvIGEgc3ltbGluayB0aGF0IGNyb3NzZXNcblx0ICogZnJvbSBvbmUgcm9vdCBpbnRvIGFub3RoZXIgaXMgKm5vdCogYXV0by1hcHByb3ZlZCAoZmFpbC1jbG9zZWQpLiBXaXRoIGFcblx0ICogc2luZ2xlIHJvb3QgdGhpcyBpcyBpZGVudGljYWwgdG8gdGhlIHByZXZpb3VzIGJlaGF2aW91ci5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2lzUmVhZEF1dG9BcHByb3ZlZChyZXNvdXJjZTogVVJJLCB3b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKCF3b3JraW5nRGlyZWN0b3JpZXMgfHwgd29ya2luZ0RpcmVjdG9yaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBSZXNvbHZlIHRoZSByZWFkIHRhcmdldCBvbmNlIChsaXRlcmFsICsgc3ltbGluayByZWFsIHBhdGgpOyBhIGRlbmllZFxuXHRcdC8vIHJlc29sdXRpb24gcmVxdWlyZXMgY29uZmlybWF0aW9uLlxuXHRcdGNvbnN0IHJlc291cmNlc1RvQ2hlY2sgPSB0aGlzLl9yZXNvbHZlUmVzb3VyY2VzRm9yQXBwcm92YWwocmVzb3VyY2UpO1xuXHRcdC8vIFJlc29sdmUgZWFjaCByb290J3MgcmVhbCBwYXRoIGluIHBhcmFsbGVsIGFuZCBzdG9wIGF0IHRoZSBmaXJzdCByb290XG5cdFx0Ly8gdGhhdCBjb250YWlucyB0aGUgdGFyZ2V0LlxuXHRcdGNvbnN0IG1hdGNoID0gYXdhaXQgZmlyc3RQYXJhbGxlbChcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllcy5tYXAoZGlyZWN0b3J5ID0+IHRoaXMuX2lzUmVhZENvbnRhaW5lZEJ5Um9vdChyZXNvdXJjZXNUb0NoZWNrLCBkaXJlY3RvcnkpKSxcblx0XHRcdGFwcHJvdmVkID0+IGFwcHJvdmVkLFxuXHRcdCk7XG5cdFx0cmV0dXJuIG1hdGNoID09PSB0cnVlO1xuXHR9XG5cblx0LyoqIFdoZXRoZXIgZXZlcnkgcmVzb2x2ZWQgcmVhZCBjYW5kaWRhdGUgaXMgY29udGFpbmVkIGJ5IGB3b3JraW5nRGlyZWN0b3J5YCAob3IgaXRzIHJlYWwgcGF0aCkuICovXG5cdHByaXZhdGUgYXN5bmMgX2lzUmVhZENvbnRhaW5lZEJ5Um9vdChyZXNvdXJjZXNUb0NoZWNrUHJvbWlzZTogUHJvbWlzZTxyZWFkb25seSBVUklbXSB8IHVuZGVmaW5lZD4sIHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IFtyZXNvdXJjZXNUb0NoZWNrLCB3b3JraW5nRGlyZWN0b3JpZXNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW3Jlc291cmNlc1RvQ2hlY2tQcm9taXNlLCB0aGlzLl9yZXNvbHZlUmVzb3VyY2VzRm9yQXBwcm92YWwod29ya2luZ0RpcmVjdG9yeSldKTtcblx0XHRyZXR1cm4gcmVzb3VyY2VzVG9DaGVjayAhPT0gdW5kZWZpbmVkXG5cdFx0XHQmJiB3b3JraW5nRGlyZWN0b3JpZXMgIT09IHVuZGVmaW5lZFxuXHRcdFx0JiYgcmVzb3VyY2VzVG9DaGVjay5ldmVyeShjYW5kaWRhdGUgPT4gd29ya2luZ0RpcmVjdG9yaWVzLnNvbWUoZGlyZWN0b3J5ID0+IHRoaXMuX2lzUmVzb3VyY2VJbkRpcmVjdG9yeShjYW5kaWRhdGUsIGRpcmVjdG9yeSkpKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzUmVzb3VyY2VJbldvcmtpbmdEaXJlY3RvcnkocmVzb3VyY2U6IFVSSSwgd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHdvcmtpbmdEaXJlY3RvcnkgIT09IHVuZGVmaW5lZCAmJiB0aGlzLl9pc1Jlc291cmNlSW5EaXJlY3RvcnkocmVzb3VyY2UsIHdvcmtpbmdEaXJlY3RvcnkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNSZXNvdXJjZUluRGlyZWN0b3J5KHJlc291cmNlOiBVUkksIGRpcmVjdG9yeTogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWxPclBhcmVudChub3JtYWxpemVQYXRoKHJlc291cmNlKSwgbm9ybWFsaXplUGF0aChkaXJlY3RvcnkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDaGVja3Mgd2hldGhlciBhIHNoZWxsIHdyaXRlLXJlZGlyZWN0aW9uIGRlc3RpbmF0aW9uIChlLmcuIHRoZSBgb3V0LnR4dGBcblx0ICogaW4gYGVjaG8gaGkgPiBvdXQudHh0YCkgc2hvdWxkIGJlIGF1dG8tYXBwcm92ZWQgYnkgcmV1c2luZyB0aGUgc2FtZVxuXHQgKiBydWxlcyB0aGF0IGdvdmVybiB3cml0ZSB0b29sIGNhbGxzOiB0aGUgZGVzdGluYXRpb24gbXVzdCByZXNvbHZlIHRvIGFcblx0ICogcGF0aCBpbnNpZGUgdGhlIHdvcmtpbmcgZGlyZWN0b3J5IGFuZCBtdXN0IG5vdCBtYXRjaCBhIGRlbmllZCBnbG9iLlxuXHQgKi9cblx0cHJpdmF0ZSBfaXNTaGVsbFdyaXRlRGVzdEFwcHJvdmVkKGRlc3Q6IHN0cmluZywgd29ya2luZ0RpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdC8vIEEgc2hlbGwgY29tbWFuZCBydW5zIGluIGV4YWN0bHkgb25lIHByb2Nlc3MgY3dkID0gdGhlIHByaW1hcnkgcm9vdFxuXHRcdC8vIChpbmRleCAwKSwgc28gYSAqcmVsYXRpdmUqIHJlZGlyZWN0IGNhbiBvbmx5IHJlc29sdmUgYWdhaW5zdCB0aGF0IGN3ZC5cblx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMuX3Jlc29sdmVTaGVsbFJlZGlyZWN0UmVzb3VyY2UoZGVzdCwgd29ya2luZ0RpcmVjdG9yaWVzPy5bMF0pO1xuXHRcdGlmICghcmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gVGhlIHJlc29sdmVkIChhYnNvbHV0ZSkgZGVzdGluYXRpb24gYXV0by1hcHByb3ZlcyB3aGVuIGNvbnRhaW5lZCBieVxuXHRcdC8vIGFueSByb290IFx1MjAxNCB0aGUgc2FtZSBcImFueSByb290XCIgcnVsZSBhcyByZWFkL3dyaXRlLiBVbmxpa2UgcmVhZC93cml0ZSxcblx0XHQvLyB0aGlzIHBhdGggaXMgc3luY2hyb25vdXMgYW5kIGRvZXMgbm90IHJlc29sdmUgc3ltbGlua3Mgb24gdGhlXG5cdFx0Ly8gZGVzdGluYXRpb24gKHByZS1leGlzdGluZyBiZWhhdmlvdXIsIHVuY2hhbmdlZCBoZXJlKS5cblx0XHRyZXR1cm4gKHdvcmtpbmdEaXJlY3RvcmllcyA/PyBbXSkuc29tZSh3b3JraW5nRGlyZWN0b3J5ID0+IHRoaXMuX2NoZWNrV3JpdGVSZXNvdXJjZShyZXNvdXJjZSwgd29ya2luZ0RpcmVjdG9yeSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1hdGNoZXMgcmVkaXJlY3QgZGVzdGluYXRpb25zIHdob3NlIGZpbmFsIHBhdGggaXMgZGVjaWRlZCBieSB0aGUgc2hlbGxcblx0ICogcmF0aGVyIHRoYW4gYnkgdGhlIHRleHQ6IHZhcmlhYmxlIGV4cGFuc2lvbnMgKGAkSE9NRS94YCwgYCRlbnY6VEVNUC94YCxcblx0ICogYCVBUFBEQVRBJVxceGAsIGAhQVBQREFUQSFcXHhgKSwgY29tbWFuZCBzdWJzdGl0dXRpb25zIChgJChwd2QpL3hgLFxuXHQgKiBgYCBgcHdkYC94IGBgKSwgYnJhY2UgZXhwYW5zaW9ucywgYW5kIGB+YCBpbiBhIHBvc2l0aW9uIHtAbGluayB1bnRpbGRpZnl9XG5cdCAqIGRvZXMgbm90IGhhbmRsZS5cblx0ICogTWlycm9ycyB0aGUgd29ya2JlbmNoJ3MgZmlsZS13cml0ZSBhbmFseXplciBndWFyZC5cblx0ICpcblx0ICogU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yNzQxNjYgYW5kXG5cdCAqIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yNzQxNjdcblx0ICovXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9keW5hbWljUmVkaXJlY3REZXN0UmVnZXggPSAvWyQoKXt9YH4lXS87XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSByYXcgdGV4dCBvZiBhIHNoZWxsIHJlZGlyZWN0IGRlc3RpbmF0aW9uIHRvIGFuIGFic29sdXRlXG5cdCAqIGZpbGVzeXN0ZW0gcGF0aC4gYH5gIGlzIGV4cGFuZGVkIHRvIHRoZSB1c2VyJ3MgaG9tZSBkaXJlY3Rvcnk7IHRoZVxuXHQgKiBkb3duc3RyZWFtIHdvcmtpbmctZGlyZWN0b3J5IGNoZWNrIHJlamVjdHMgcGF0aHMgdGhhdCBlbmQgdXAgb3V0c2lkZVxuXHQgKiB0aGUgd29ya3NwYWNlLiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gcmVzb2x1dGlvbiB3b3VsZCByZXF1aXJlIGFcblx0ICogd29ya2luZyBkaXJlY3RvcnkgdGhhdCBpc24ndCBjb25maWd1cmVkLCBvciB3aGVuIHRoZSBkZXN0aW5hdGlvbiBleHBhbmRzXG5cdCAqIGF0IHJ1bnRpbWUgYW5kIHRoZXJlZm9yZSBjYW5ub3QgYmUgcmVzb2x2ZWQgZnJvbSBpdHMgdGV4dCBhbG9uZS5cblx0ICovXG5cdHByaXZhdGUgX3Jlc29sdmVTaGVsbFJlZGlyZWN0UmVzb3VyY2UoZGVzdDogc3RyaW5nLCB3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHRyaW1tZWQgPSB1bnRpbGRpZnkoZGVzdC50cmltKCksIGhvbWVkaXIoKSk7XG5cdFx0aWYgKCF0cmltbWVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHQvLyBBIGRlc3RpbmF0aW9uIHRoZSBzaGVsbCBleHBhbmRzIChlLmcuIGAkSE9NRS94LnR4dGApIHdvdWxkIG90aGVyd2lzZSBiZVxuXHRcdC8vIHRyZWF0ZWQgYXMgYSBsaXRlcmFsIHJlbGF0aXZlIHBhdGggYW5kIHJlc29sdmUgKmluc2lkZSogdGhlIHdvcmtpbmdcblx0XHQvLyBkaXJlY3RvcnksIGF1dG8tYXBwcm92aW5nIGEgd3JpdGUgdGhhdCBhY3R1YWxseSBsYW5kcyBlbHNld2hlcmUuXG5cdFx0aWYgKFNlc3Npb25QZXJtaXNzaW9uTWFuYWdlci5fZHluYW1pY1JlZGlyZWN0RGVzdFJlZ2V4LnRlc3QodHJpbW1lZCkgfHwgY29udGFpbnNDbWREZWxheWVkRXhwYW5zaW9uKHRyaW1tZWQpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbU2Vzc2lvblBlcm1pc3Npb25NYW5hZ2VyXSBSZWRpcmVjdCBkZXN0aW5hdGlvbiBleHBhbmRzIGF0IHJ1bnRpbWUsIHJlcXVpcmluZyBjb25maXJtYXRpb246ICR7ZGVzdH1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChwYXRoLmlzQWJzb2x1dGUodHJpbW1lZCkpIHtcblx0XHRcdHJldHVybiBVUkkuZmlsZSh0cmltbWVkKTtcblx0XHR9XG5cdFx0aWYgKCF3b3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gVVJJLmZpbGUocGF0aC5yZXNvbHZlKHdvcmtpbmdEaXJlY3RvcnkuZnNQYXRoLCB0cmltbWVkKSk7XG5cdH1cblxuXHQvKipcblx0ICogRGV0ZXJtaW5lcyB3aGV0aGVyIGEgd3JpdGUgdG8gYHJlc291cmNlYCBjYW4gYmUgYXV0by1hcHByb3ZlZC4gTWlycm9ycyB0aGVcblx0ICogY2hlY2tzIHBlcmZvcm1lZCBieSB0aGUgd29ya2JlbmNoIGVkaXQtY29uZmlybWF0aW9uIHBpcGVsaW5lOlxuXHQgKlxuXHQgKiAxLiBUaGUgcGF0aCBpcyByZXNvbHZlZCB0aHJvdWdoIGFueSBzeW1saW5rcyAoZm9sbG93aW5nIGFuY2VzdG9ycyB0aGF0IGRvXG5cdCAqICAgIG5vdCB5ZXQgZXhpc3QpIHNvIGEgbGluayBjYW4ndCByZWRpcmVjdCBhbiBlZGl0IG91dHNpZGUgdGhlIHdvcmtpbmdcblx0ICogICAgZGlyZWN0b3J5LiBCb3RoIHRoZSBsaXRlcmFsIGFuZCByZXNvbHZlZCBwYXRocyBtdXN0IHBhc3MgZXZlcnkgY2hlY2suXG5cdCAqIDIuIFRoZSBwYXRoIG11c3QgYmUgZnJlZSBvZiBzdXNwaWNpb3VzIGNoYXJhY3RlcnMgKHNlZSB7QGxpbmsgYXNzZXJ0UGF0aElzU2FmZX0pLlxuXHQgKiAzLiBUaGUgcGF0aCBtdXN0IGxpdmUgaW5zaWRlIHRoZSB3b3JraW5nIGRpcmVjdG9yeS5cblx0ICogNC4gVGhlIHBhdGggbXVzdCBub3QgdGFyZ2V0IGEgcGxhdGZvcm0tcmVzdHJpY3RlZCBsb2NhdGlvbiAoaG9tZSBkb3RmaWxlcyxcblx0ICogICAgYH4vTGlicmFyeWAsIGAlQVBQREFUQSVgLCAuLi4pLlxuXHQgKiA1LiBUaGUgcGF0aCBtdXN0IG1hdGNoIHRoZSBlZGl0IGF1dG8tYXBwcm92ZSBnbG9iIHJ1bGVzLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfaXNFZGl0QXV0b0FwcHJvdmVkKHJlc291cmNlOiBVUkksIHdvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoIXdvcmtpbmdEaXJlY3RvcmllcyB8fCB3b3JraW5nRGlyZWN0b3JpZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBBIHdyaXRlIGlzIG5ldmVyIGF1dG8tYXBwcm92ZWQgd2l0aG91dCBhIHdvcmtpbmcgZGlyZWN0b3J5IHRvXG5cdFx0XHQvLyBjb250YWluIGl0IChtYXRjaGVzIHRoZSBwcmV2aW91cyBiZWhhdmlvdXIpLlxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBSZXNvbHZlIHRoZSB3cml0ZSB0YXJnZXQgb25jZSAobGl0ZXJhbCArIHN5bWxpbmsgcmVhbCBwYXRoKTsgYSBkZW5pZWRcblx0XHQvLyByZXNvbHV0aW9uIHJlcXVpcmVzIGNvbmZpcm1hdGlvbi5cblx0XHRjb25zdCByZXNvdXJjZXNUb0NoZWNrID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVJlc291cmNlc0ZvckFwcHJvdmFsKHJlc291cmNlKTtcblx0XHRpZiAocmVzb3VyY2VzVG9DaGVjayA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdC8vIEFwcHJvdmUgaWYgQU5ZIHJvb3QgY2xlYXJzIHRoZSB3cml0ZSBjaGVja3MgZm9yIGV2ZXJ5IHJlc291cmNlXG5cdFx0Ly8gY2FuZGlkYXRlLiBgX2NoZWNrV3JpdGVSZXNvdXJjZWAgaXMgc3luY2hyb25vdXMsIHNvIGEgcGxhaW4gYC5zb21lYFxuXHRcdC8vIGFscmVhZHkgc2hvcnQtY2lyY3VpdHMgXHUyMDE0IHRoZXJlIGlzIG5vIHBlci1yb290IGFzeW5jIHdvcmsgdG8gcGFyYWxsZWxpemUuXG5cdFx0cmV0dXJuIHdvcmtpbmdEaXJlY3Rvcmllcy5zb21lKHdvcmtpbmdEaXJlY3RvcnkgPT4gcmVzb3VyY2VzVG9DaGVjay5ldmVyeShjYW5kaWRhdGUgPT4gdGhpcy5fY2hlY2tXcml0ZVJlc291cmNlKGNhbmRpZGF0ZSwgd29ya2luZ0RpcmVjdG9yeSkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBsaXRlcmFsIHBhdGggcGx1cywgZm9yIGFic29sdXRlIHBhdGhzLCB0aGUgc3ltbGluay1yZXNvbHZlZFxuXHQgKiByZWFsIHBhdGguIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgcGF0aCBjYW5ub3QgYmUgcmVzb2x2ZWQgZHVlIHRvXG5cdCAqIG1pc3NpbmcgcGVybWlzc2lvbnMsIHNpZ25hbGxpbmcgdGhhdCBjb25maXJtYXRpb24gaXMgcmVxdWlyZWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlUmVzb3VyY2VzRm9yQXBwcm92YWwocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8VVJJW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZXNvdXJjZXNUb0NoZWNrID0gW3Jlc291cmNlXTtcblx0XHRpZiAocmVzb3VyY2Uuc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdHJldHVybiByZXNvdXJjZXNUb0NoZWNrO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCByZXNvbHZlUmVhbFBhdGhGb3JOb25leGlzdGVudChyZXNvdXJjZSwgdGhpcy5fcmVhbHBhdGgpO1xuXHRcdFx0aWYgKCFleHRVcmkuaXNFcXVhbChyZXNvbHZlZCwgcmVzb3VyY2UpKSB7XG5cdFx0XHRcdHJlc291cmNlc1RvQ2hlY2sucHVzaChyZXNvbHZlZCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc3QgY29kZSA9IChlIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbikuY29kZTtcblx0XHRcdGlmIChjb2RlID09PSAnRVBFUk0nIHx8IGNvZGUgPT09ICdFQUNDRVMnKSB7XG5cdFx0XHRcdC8vIE5vIHBlcm1pc3Npb24gdG8gcmVzb2x2ZSB0aGUgcGF0aCBcdTIwMTQgcmVxdWlyZSBjb25maXJtYXRpb24uXG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBPdGhlcndpc2UgZmFsbCBiYWNrIHRvIGNoZWNraW5nIHRoZSBsaXRlcmFsIHJlc291cmNlIG9ubHkuXG5cdFx0fVxuXHRcdHJldHVybiByZXNvdXJjZXNUb0NoZWNrO1xuXHR9XG5cblx0LyoqIFJ1bnMgdGhlIHdyaXRlIGNoZWNrcyBmb3IgYSBzaW5nbGUgKGFscmVhZHkgc3ltbGluay1yZXNvbHZlZCkgcmVzb3VyY2UuICovXG5cdHByaXZhdGUgX2NoZWNrV3JpdGVSZXNvdXJjZShyZXNvdXJjZTogVVJJLCB3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHR0cnkge1xuXHRcdFx0YXNzZXJ0UGF0aElzU2FmZShyZXNvdXJjZS5mc1BhdGgpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2lzUmVzb3VyY2VJbldvcmtpbmdEaXJlY3RvcnkocmVzb3VyY2UsIHdvcmtpbmdEaXJlY3RvcnkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9pc1BsYXRmb3JtUmVzdHJpY3RlZFJlc291cmNlKHJlc291cmNlLCB3b3JraW5nRGlyZWN0b3J5KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbWF0Y2hlc0VkaXRBdXRvQXBwcm92ZVBhdHRlcm5zKHJlc291cmNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgYHJlc291cmNlYCB0YXJnZXRzIGEgcGxhdGZvcm0tcmVzdHJpY3RlZCBsb2NhdGlvbiB0aGF0XG5cdCAqIHNob3VsZCBhbHdheXMgcmVxdWlyZSBjb25maXJtYXRpb24uIEVkaXRzIHdpdGhpbiBob21lLWRpcmVjdG9yeSBkb3RmaWxlc1xuXHQgKiBhcmUgbmV2ZXIgYXV0by1hcHByb3ZlZC4gRWRpdHMgd2l0aGluIHBsYXRmb3JtIGNvbmZpZyBkaXJlY3RvcmllcyBhcmVcblx0ICogYWxsb3dlZCBvbmx5IHdoZW4gdGhlIHdvcmtpbmcgZGlyZWN0b3J5IGl0c2VsZiBsaXZlcyBpbnNpZGUgdGhlbS5cblx0ICovXG5cdHByaXZhdGUgX2lzUGxhdGZvcm1SZXN0cmljdGVkUmVzb3VyY2UocmVzb3VyY2U6IFVSSSwgd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcmVsYXRpdmVUb0hvbWUgPSBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5yZWxhdGl2ZVBhdGgoSE9NRV9ESVIsIHJlc291cmNlKTtcblx0XHRjb25zdCB0b3BMZXZlbE5hbWUgPSByZWxhdGl2ZVRvSG9tZT8uc3BsaXQoJy8nKVswXTtcblx0XHRpZiAoZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbE9yUGFyZW50KHJlc291cmNlLCBIT01FX0RJUikgJiYgdG9wTGV2ZWxOYW1lPy5zdGFydHNXaXRoKCcuJykpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgcmVzdHJpY3RlZCBvZiBQTEFURk9STV9SRVNUUklDVEVEX0RJUlMpIHtcblx0XHRcdGNvbnN0IHBhcmVudFVSSSA9IFVSSS5maWxlKHJlc3RyaWN0ZWQpO1xuXHRcdFx0aWYgKGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWxPclBhcmVudChyZXNvdXJjZSwgcGFyZW50VVJJKSkge1xuXHRcdFx0XHQvLyBBbGxvdyBlZGl0cyB3aGVuIHRoZSB3b3JraW5nIGRpcmVjdG9yeSBpcyBvcGVuZWQgaW5zaWRlIHRoZSByZXN0cmljdGVkIGFyZWEuXG5cdFx0XHRcdHJldHVybiAhKHdvcmtpbmdEaXJlY3RvcnkgJiYgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbE9yUGFyZW50KHdvcmtpbmdEaXJlY3RvcnksIHBhcmVudFVSSSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9tYXRjaGVzRWRpdEF1dG9BcHByb3ZlUGF0dGVybnMocmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGxldCBhcHByb3ZlZCA9IHRydWU7XG5cdFx0Y29uc3QgcGF0dGVybnMgPSB0aGlzLl9jb25maWdTZXJ2aWNlLmdldFJvb3RWYWx1ZShwbGF0Zm9ybVJvb3RTY2hlbWEsIEFnZW50SG9zdEVkaXRBdXRvQXBwcm92ZVBhdHRlcm5zQ29uZmlnS2V5KSA/PyBERUZBVUxUX0VESVRfQVVUT19BUFBST1ZFX1BBVFRFUk5TO1xuXHRcdGNvbnN0IGlnbm9yZUNhc2UgPSBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pZ25vcmVQYXRoQ2FzaW5nKHJlc291cmNlKTtcblx0XHRmb3IgKGNvbnN0IHBhdHRlcm5TZXQgb2YgW3BhdHRlcm5zLCBBTFdBWVNfQ0hFQ0tFRF9FRElUX1BBVFRFUk5TXSkge1xuXHRcdFx0Zm9yIChjb25zdCBbcGF0dGVybiwgY29uZmlndXJlZEFwcHJvdmFsXSBvZiBPYmplY3QuZW50cmllcyhwYXR0ZXJuU2V0KSkge1xuXHRcdFx0XHRjb25zdCBpc0FwcHJvdmVkID0gY29uZmlndXJlZEFwcHJvdmFsID09PSB0cnVlO1xuXHRcdFx0XHRpZiAoaXNBcHByb3ZlZCAhPT0gYXBwcm92ZWQgJiYgZ2xvYk1hdGNoKHBhdHRlcm4sIHJlc291cmNlLmZzUGF0aCwgeyBpZ25vcmVDYXNlIH0pKSB7XG5cdFx0XHRcdFx0YXBwcm92ZWQgPSBpc0FwcHJvdmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBhcHByb3ZlZDtcblx0fVxuXG5cdHByaXZhdGUgX2lzVG9vbEFsbG93ZWRCeVBlcm1pc3Npb25zKHNlc3Npb25LZXk6IFByb3RvY29sVVJJLCB0b29sQ2FsbElkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCB0b29sTmFtZSA9IHRoaXMuX2dldFRvb2xOYW1lRm9yVG9vbENhbGwoc2Vzc2lvbktleSwgdG9vbENhbGxJZCk7XG5cdFx0aWYgKCF0b29sTmFtZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBgZ2V0RWZmZWN0aXZlVmFsdWVgIHdhbGtzIHNlc3Npb24gXHUyMTkyIHBhcmVudCBcdTIxOTIgaG9zdCwgc28gc2Vzc2lvbnNcblx0XHQvLyB0aGF0IGhhdmVuJ3QgbWF0ZXJpYWxpemVkIHRoZWlyIG93biBgcGVybWlzc2lvbnNgIHlldCB0cmFuc3BhcmVudGx5XG5cdFx0Ly8gaW5oZXJpdCBmcm9tIHRoZSBob3N0LWxldmVsIGFsbG93L2RlbnkgbGlzdHMuXG5cdFx0Y29uc3QgcGVybWlzc2lvbnMgPSB0aGlzLl9jb25maWdTZXJ2aWNlLmdldEVmZmVjdGl2ZVZhbHVlKHNlc3Npb25LZXksIHBsYXRmb3JtU2Vzc2lvblNjaGVtYSwgU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9ucyk7XG5cdFx0Y29uc3QgYWxsb3dlZCA9IHBlcm1pc3Npb25zPy5hbGxvdy5pbmNsdWRlcyh0b29sTmFtZSkgPz8gZmFsc2U7XG5cdFx0aWYgKGFsbG93ZWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtTZXNzaW9uUGVybWlzc2lvbk1hbmFnZXJdIEF1dG8tYXBwcm92aW5nIFwiJHt0b29sTmFtZX1cIiB2aWEgcGVybWlzc2lvbnNgKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFsbG93ZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUb29sTmFtZUZvclRvb2xDYWxsKHNlc3Npb25LZXk6IFByb3RvY29sVVJJLCB0b29sQ2FsbElkOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlc3Npb25TdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbktleSk7XG5cdFx0Y29uc3QgcGFydHMgPSBzZXNzaW9uU3RhdGU/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHM7XG5cdFx0aWYgKCFwYXJ0cykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBycCBvZiBwYXJ0cykge1xuXHRcdFx0aWYgKHJwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcnAudG9vbENhbGwudG9vbENhbGxJZCA9PT0gdG9vbENhbGxJZCkge1xuXHRcdFx0XHRyZXR1cm4gcnAudG9vbENhbGwudG9vbE5hbWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9hZGRUb29sVG9TZXNzaW9uUGVybWlzc2lvbnMoc2Vzc2lvbktleTogUHJvdG9jb2xVUkksIHRvb2xOYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBwZXJtaXNzaW9ucyA9IHRoaXMuX2NvbmZpZ1NlcnZpY2UuZ2V0RWZmZWN0aXZlVmFsdWUoc2Vzc2lvbktleSwgcGxhdGZvcm1TZXNzaW9uU2NoZW1hLCBTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zKVxuXHRcdFx0Pz8geyBhbGxvdzogW10sIGRlbnk6IFtdIH07XG5cdFx0aWYgKHBlcm1pc3Npb25zLmFsbG93LmluY2x1ZGVzKHRvb2xOYW1lKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jb25maWdTZXJ2aWNlLnVwZGF0ZVNlc3Npb25Db25maWcoc2Vzc2lvbktleSwge1xuXHRcdFx0W1Nlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbnNdOiB7XG5cdFx0XHRcdGFsbG93OiBbLi4ucGVybWlzc2lvbnMuYWxsb3csIHRvb2xOYW1lXSxcblx0XHRcdFx0ZGVueTogWy4uLnBlcm1pc3Npb25zLmRlbnldLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtTZXNzaW9uUGVybWlzc2lvbk1hbmFnZXJdIEFkZGVkIFwiJHt0b29sTmFtZX1cIiB0byBzZXNzaW9uIHBlcm1pc3Npb25zIGZvciAke3Nlc3Npb25LZXl9YCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZLGtCQUFrQjtBQUN2QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxTQUFTLGlCQUFpQjtBQUNuQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsWUFBWSxVQUFVO0FBQ3RCLFNBQVMsYUFBYSxpQkFBaUI7QUFDdkMsU0FBUyxRQUFRLDRCQUE0QixxQkFBcUI7QUFDbEUsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsOEJBQThCLDBDQUEwQztBQUNqRixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDJDQUEyQyw0Q0FBNEMsOENBQThDLDRDQUE0QyxvQkFBb0IsNkJBQTZCO0FBRTNPLFNBQVMscUJBQXFC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
