import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { AgentSession } from "../../common/agent.js";
import { SessionStatus } from "../../common/state/protocol/channels-session/state.js";
import { buildChatUri, buildDefaultChatUri, getInlineToolInput, getSessionRelatedPullRequestUrls, isDefaultChatUri, isSessionStatusArchived, isSessionStatusRead, parseChatUri, readSessionGitState, readSessionGitHubState, ResponsePartKind, ToolCallStatus, TurnState } from "../../common/state/sessionState.js";
import { buildOpenSessionLinkUri, parseOpenSessionLinkChatId, parseOpenSessionLinkUri } from "../../common/openSessionLink.js";
import { SessionServerToolName } from "../../common/serverToolNames.js";
import { generateUuid } from "../../../../base/common/uuid.js";
const maxSessionSpawnDepth = 3;
const maxCreatedSessions = 25;
const maxCreatedChats = 25;
const maxSentMessages = 50;
const sessionConfirmationToolNames = /* @__PURE__ */ new Set([SessionServerToolName.CreateSession, SessionServerToolName.CreateChat, SessionServerToolName.SendMessage, SessionServerToolName.DeleteSession]);
function sessionToolRequiresConfirmation(toolName) {
  return sessionConfirmationToolNames.has(toolName);
}
const listSessionsStatusValues = ["idle", "inProgress", "inputNeeded", "error", "archived"];
const listSessionsInputSchema = {
  type: "object",
  properties: {
    session: { type: "string", description: "Return only the session with this URI or `agent-host-session://` link (a direct lookup that ignores the other filters). Use this to fetch one known session's metadata." },
    status: {
      type: "array",
      items: { type: "string", enum: [...listSessionsStatusValues] },
      description: "Only return sessions whose status matches one of these (e.g. `inputNeeded` for sessions awaiting a reply, `inProgress` for running ones, `archived` for sessions marked Done/completed \u2014 implies `includeArchived`). Omit to return every status."
    },
    workspace: { type: "string", description: "Only return sessions whose working directory is this folder \u2014 an absolute path or a workspace URI." },
    withChanges: { type: "boolean", description: "When true, only return sessions that have pending worktree changes." },
    unread: { type: "boolean", description: "When true, only return sessions with updates the user has not seen yet." },
    withPullRequest: { type: "boolean", description: "When true, only return sessions that have a linked GitHub pull request." },
    includeArchived: { type: "boolean", description: "Whether to include archived sessions. Defaults to false; set true to also return archived sessions." },
    createdAfter: { type: "string", description: "Only return sessions created at or after this time (ISO-8601 timestamp, e.g. `2025-01-31T00:00:00Z`)." },
    createdBefore: { type: "string", description: "Only return sessions created at or before this time (ISO-8601 timestamp)." }
  }
};
const createSessionInputSchema = {
  type: "object",
  properties: {
    workspace: { type: "string", description: "Absolute folder path, workspace URI, or a working directory from an existing session." },
    prompt: { type: "string", description: "Initial prompt to send to the new session." },
    model: { type: "string", description: "Optional model ID or display name. Defaults to the current chat's model." }
  },
  required: ["workspace", "prompt"]
};
const getCurrentSessionInputSchema = {
  type: "object",
  properties: {}
};
const createChatInputSchema = {
  type: "object",
  properties: {
    session: { type: "string", description: "Optional session to add the chat to: a session URI from `list_sessions` or an `agent-host-session://` link. Defaults to the current session when omitted." },
    prompt: { type: "string", description: "Initial prompt to send to the new chat." },
    title: { type: "string", description: "Optional title for the new chat." },
    model: { type: "string", description: "Optional model ID or display name. Defaults to the current chat's model." }
  },
  required: ["prompt"]
};
const renameChatInputSchema = {
  type: "object",
  properties: {
    session: { type: "string", description: "Optional owning session: a session URI from `list_sessions` or an `agent-host-session://` link. When provided with `chat`, it must match that chat's session." },
    chat: { type: "string", description: "The chat to rename: pass an `agent-host-session://` session or chat link. Omit when renaming the chat in which this tool is running, or when `session` identifies that session so its default chat should be renamed." },
    title: { type: "string", maxLength: 200, description: "Short, descriptive chat title, ideally 1-4 words." }
  },
  required: ["title"]
};
const deleteSessionInputSchema = {
  type: "object",
  properties: {
    session: { type: "string", description: "The session to delete: a session URI from `list_sessions` or an `agent-host-session://` link (e.g. from `create_session`)." }
  },
  required: ["session"]
};
const sendMessageInputSchema = {
  type: "object",
  properties: {
    session: { type: "string", description: "The session or chat to message: a session URI from `list_sessions`, or an `agent-host-session://` link (from `create_session`/`create_chat`; a `create_chat` link targets that specific chat)." },
    message: { type: "string", description: "The message to send." }
  },
  required: ["session", "message"]
};
const sessionContextDetailValues = ["summary", "digest", "full"];
const getSessionContextInputSchema = {
  type: "object",
  properties: {
    session: { type: "string", description: "The session or chat to read: a session URI from `list_sessions`, or an `agent-host-session://` link (a `create_chat` link targets that specific chat)." },
    detail: {
      type: "string",
      enum: [...sessionContextDetailValues],
      description: "How much conversation detail to return. `summary` (default): status and a short per-turn gist (the message plus a compact snippet of the reply). `digest`: adds the full assistant reply text and tool-call names. `full`: adds tool-call inputs. Higher levels return more tokens."
    },
    transcriptLimit: { type: "number", description: "Maximum number of most-recent turns to include. Defaults to 10; capped at 50." }
  },
  required: ["session"]
};
const sessionServerToolDefinitions = [
  {
    name: SessionServerToolName.ListSessions,
    title: "List Sessions",
    description: "List sessions and their compact metadata (status, activity, working directory, project, worktree changes, git/GitHub info, timestamps). Pass `session` to fetch a single known session by URI. By default archived sessions are omitted. Optionally filter by `status`, `workspace`, `withChanges`, `unread`, `withPullRequest`, `includeArchived`, `createdAfter`, or `createdBefore`.",
    inputSchema: listSessionsInputSchema,
    annotations: { readOnlyHint: true }
  },
  {
    name: SessionServerToolName.GetCurrentSession,
    title: "Get Current Session",
    description: "Get metadata and the open link for the session this conversation is running in. Use this to reference the current session (for example before adding a chat to it).",
    inputSchema: getCurrentSessionInputSchema,
    annotations: { readOnlyHint: true }
  },
  {
    name: SessionServerToolName.CreateSession,
    title: "Create Session",
    description: 'Create a session in a workspace and start it with an initial prompt. The UI shows a "Session Created" confirmation with a button to open it, so reply with a single short sentence confirming the session was created and do NOT print the session URL or tell the user to click a button.',
    inputSchema: createSessionInputSchema,
    annotations: { readOnlyHint: false }
  },
  {
    name: SessionServerToolName.CreateChat,
    title: "Create Chat",
    description: 'Add a new chat to an existing session and start it with an initial prompt. Omit `session` to add the chat to the current session; otherwise pass a session URI from `list_sessions`. Optionally pass a `model` to use for the chat (defaults to the current chat\'s model). The UI shows a "Chat Created" confirmation with a button to open the session, so reply with a single short sentence and do NOT print the session URL or tell the user to click a button.',
    inputSchema: createChatInputSchema,
    annotations: { readOnlyHint: false }
  },
  {
    name: SessionServerToolName.RenameChat,
    title: "Rename Chat",
    description: "Rename one specific chat so it is easy to find later. When a session has only its default chat, renaming that chat also names the session. Once the session has multiple chats, only the targeted chat is renamed. Use a short, human-friendly chat name in sentence case (1-4 words). Pass an `agent-host-session://` session or chat link to target another chat, or omit `chat` to rename the chat in which this tool is running. If `chat` is omitted, a session URI from `get_current_session`/`list_sessions` also renames that session's default chat. Name a fresh chat once its scope is clear, typically soon after `create_chat` or early in that chat. Call this tool again whenever the user explicitly asks to rename the chat; every invocation replaces the current title.",
    inputSchema: renameChatInputSchema,
    annotations: { readOnlyHint: false }
  },
  {
    name: SessionServerToolName.SendMessage,
    title: "Send Message",
    description: "Send a message to an existing session or chat, starting a new turn there. Provide a session URI from `list_sessions` or an `agent-host-session://` link (a `create_chat` link targets that specific chat). The message is delivered asynchronously \u2014 this tool does not wait for or return the reply. The UI shows a confirmation with a button to open the target, so reply with a single short sentence and do NOT print the URL or tell the user to click a button.",
    inputSchema: sendMessageInputSchema,
    annotations: { readOnlyHint: false }
  },
  {
    name: SessionServerToolName.GetSessionContext,
    title: "Get Session Context",
    description: 'Read the recent conversation of an existing session or chat: a compacted transcript of its turns (messages, replies, and tool calls). Use this to see what a session you created is doing, or to gather context before sending it a message. Returns a compacted summary by default (`detail: "summary"`); request `digest` or `full` for more detail. For session metadata (status, working directory, changes, \u2026) use `list_sessions` with the `session` argument.',
    inputSchema: getSessionContextInputSchema,
    annotations: { readOnlyHint: true }
  },
  {
    name: SessionServerToolName.DeleteSession,
    title: "Delete Session",
    description: "Permanently delete a session (identified by a session URI from `list_sessions`), including its stored data. This cannot be undone. Refuses to delete the current session.",
    inputSchema: deleteSessionInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: true }
  }
];
function currentSessionUri(toolCallChannel) {
  const owning = parseChatUri(toolCallChannel) ?? void 0;
  return URI.parse(owning?.session ?? toolCallChannel);
}
function getRequiredString(value, field, toolName) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${toolName} input: ${field} must be a non-empty string.`);
  }
  return value;
}
function getOptionalString(value, field, toolName) {
  if (value === void 0) {
    return void 0;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${toolName} input: ${field} must be a non-empty string.`);
  }
  return value;
}
function decodeHtmlEntities(value) {
  const namedEntities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: "\xA0",
    quot: '"'
  };
  return value.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (match, decimal, hexadecimal, named) => {
    const numeric = decimal ?? hexadecimal;
    if (numeric !== void 0) {
      const codePoint = Number.parseInt(numeric, decimal !== void 0 ? 10 : 16);
      return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 1114111 ? String.fromCodePoint(codePoint) : match;
    }
    return named ? namedEntities[named.toLowerCase()] ?? match : match;
  });
}
function normalizeGeneralChatTitle(title) {
  return decodeHtmlEntities(title).trim().replace(/\s+/g, " ");
}
function normalizeProjectSessionTitle(title) {
  const trimmed = decodeHtmlEntities(title).trim().replace(/^["'`]+|["'`]+$/g, "").trim().replace(/^[.,;:!?\-\u2014]+|[.,;:!?\-\u2014]+$/g, "").trim();
  const humanized = !/\s/.test(trimmed) && /[/_-]/.test(trimmed) ? trimmed.replace(/[/_\-\s]+/g, " ") : trimmed;
  return humanized.replace(/\s+/g, " ").trim();
}
function validateRenameTitle(title, toolName) {
  if (Array.from(title).length > 200) {
    throw new Error(`Invalid ${toolName} input: title must not exceed 200 characters.`);
  }
}
function parseWorkspaceUri(workspace) {
  if (/^(\/|[a-zA-Z]:[\\/]|\\\\)/.test(workspace)) {
    return URI.file(workspace);
  }
  try {
    const parsed = URI.parse(workspace, true);
    return parsed.scheme ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function resolveWorkspace(workspace, sessions) {
  for (const session of sessions) {
    const match = session.workingDirectories?.find((d) => d.toString() === workspace || d.fsPath === workspace);
    if (match) {
      return match;
    }
  }
  const parsed = parseWorkspaceUri(workspace);
  if (!parsed) {
    throw new Error(`Invalid ${SessionServerToolName.CreateSession} input: workspace must match a known session workingDirectory, an absolute path, or a valid URI string.`);
  }
  return parsed;
}
function resolveModel(modelName, models) {
  if (modelName === void 0) {
    return void 0;
  }
  const model = models.find((candidate) => candidate.id === modelName || candidate.name === modelName);
  if (!model) {
    throw new Error(`Invalid ${SessionServerToolName.CreateSession} input: model must match an available model id or name.`);
  }
  return model;
}
function getCreateSessionArgs(rawArgs, sessions, models) {
  const args = rawArgs ?? {};
  const workspace = getRequiredString(args.workspace, "workspace", SessionServerToolName.CreateSession);
  const prompt = getRequiredString(args.prompt, "prompt", SessionServerToolName.CreateSession);
  const modelName = getOptionalString(args.model, "model", SessionServerToolName.CreateSession);
  return {
    workspace: resolveWorkspace(workspace, sessions),
    prompt,
    model: resolveModel(modelName, models)
  };
}
function describeSessionStatusBits(status) {
  const names = [];
  if ((status & SessionStatus.InputNeeded) === SessionStatus.InputNeeded) {
    names.push("inputNeeded");
  } else if (status & SessionStatus.InProgress) {
    names.push("inProgress");
  } else if (status & SessionStatus.Idle) {
    names.push("idle");
  }
  if (status & SessionStatus.Error) {
    names.push("error");
  }
  if (status & SessionStatus.IsArchived) {
    names.push("archived");
  }
  return names;
}
function describeSessionStatusNames(session) {
  return session.status !== void 0 ? describeSessionStatusBits(session.status) : [];
}
function describeSessionStatus(session) {
  const names = describeSessionStatusNames(session);
  if (names.length > 0) {
    return names.join(",");
  }
  return session.status !== void 0 ? "unknown" : void 0;
}
function getOptionalBoolean(value, field, toolName) {
  if (value === void 0) {
    return void 0;
  }
  if (typeof value !== "boolean") {
    throw new Error(`Invalid ${toolName} input: ${field} must be a boolean.`);
  }
  return value;
}
function getOptionalTimestamp(value, field, toolName) {
  if (value === void 0) {
    return void 0;
  }
  if (typeof value !== "string") {
    throw new Error(`Invalid ${toolName} input: ${field} must be an ISO-8601 timestamp string.`);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid ${toolName} input: ${field} must be a valid ISO-8601 timestamp (e.g. 2025-01-31T00:00:00Z).`);
  }
  return parsed;
}
function getListSessionsArgs(rawArgs) {
  const args = rawArgs ?? {};
  let status;
  if (args.status !== void 0) {
    if (!Array.isArray(args.status) || args.status.some((value) => typeof value !== "string")) {
      throw new Error(`Invalid ${SessionServerToolName.ListSessions} input: status must be an array of status names.`);
    }
    const invalid = args.status.filter((value) => !listSessionsStatusValues.includes(value));
    if (invalid.length > 0) {
      throw new Error(`Invalid ${SessionServerToolName.ListSessions} input: unknown status value(s) ${invalid.join(", ")}. Valid values: ${listSessionsStatusValues.join(", ")}.`);
    }
    status = new Set(args.status);
  }
  return {
    session: getOptionalString(args.session, "session", SessionServerToolName.ListSessions),
    status,
    workspace: getOptionalString(args.workspace, "workspace", SessionServerToolName.ListSessions),
    withChanges: getOptionalBoolean(args.withChanges, "withChanges", SessionServerToolName.ListSessions),
    unread: getOptionalBoolean(args.unread, "unread", SessionServerToolName.ListSessions),
    withPullRequest: getOptionalBoolean(args.withPullRequest, "withPullRequest", SessionServerToolName.ListSessions),
    includeArchived: getOptionalBoolean(args.includeArchived, "includeArchived", SessionServerToolName.ListSessions),
    createdAfter: getOptionalTimestamp(args.createdAfter, "createdAfter", SessionServerToolName.ListSessions),
    createdBefore: getOptionalTimestamp(args.createdBefore, "createdBefore", SessionServerToolName.ListSessions)
  };
}
function sessionHasChanges(session) {
  const changes = session.changes;
  return !!changes && ((changes.files ?? 0) > 0 || (changes.additions ?? 0) > 0 || (changes.deletions ?? 0) > 0);
}
function sessionIsArchived(session) {
  return isSessionStatusArchived(session.status);
}
function sessionIsUnread(session) {
  return session.status !== void 0 && !isSessionStatusRead(session.status);
}
function sessionMatchesWorkspace(session, workspace) {
  const dirs = session.workingDirectories;
  if (!dirs || dirs.length === 0) {
    return false;
  }
  const parsed = parseWorkspaceUri(workspace);
  return dirs.some((dir) => dir.toString() === workspace || dir.fsPath === workspace || !!parsed && parsed.toString() === dir.toString());
}
function filterSessions(sessions, args) {
  if (args.session !== void 0) {
    const target = parseOpenSessionLinkUri(args.session)?.toString() ?? args.session;
    return sessions.filter((session) => session.session.toString() === target);
  }
  return sessions.filter((session) => {
    if (args.status) {
      const names = describeSessionStatusNames(session);
      if (!names.some((name) => args.status.has(name))) {
        return false;
      }
    }
    if (args.workspace !== void 0 && !sessionMatchesWorkspace(session, args.workspace)) {
      return false;
    }
    if (args.withChanges && !sessionHasChanges(session)) {
      return false;
    }
    if (args.unread && !sessionIsUnread(session)) {
      return false;
    }
    if (args.withPullRequest && getSessionRelatedPullRequestUrls(readSessionGitHubState(session._meta)).length === 0) {
      return false;
    }
    if (args.includeArchived !== true && !args.status?.has("archived") && sessionIsArchived(session)) {
      return false;
    }
    if (args.createdAfter !== void 0 && session.startTime < args.createdAfter) {
      return false;
    }
    if (args.createdBefore !== void 0 && session.startTime > args.createdBefore) {
      return false;
    }
    return true;
  });
}
function serializeGitState(session) {
  const git = readSessionGitState(session._meta);
  if (!git) {
    return void 0;
  }
  const result = {};
  if (git.branchName !== void 0) {
    result.branch = git.branchName;
  }
  if (git.baseBranchName !== void 0) {
    result.baseBranch = git.baseBranchName;
  }
  if (git.upstreamBranchName !== void 0) {
    result.upstreamBranch = git.upstreamBranchName;
  }
  if (git.outgoingChanges !== void 0) {
    result.ahead = git.outgoingChanges;
  }
  if (git.incomingChanges !== void 0) {
    result.behind = git.incomingChanges;
  }
  if (git.uncommittedChanges !== void 0) {
    result.uncommittedChanges = git.uncommittedChanges;
  }
  return Object.keys(result).length > 0 ? result : void 0;
}
function serializeGitHubState(session) {
  const github = readSessionGitHubState(session._meta);
  if (!github) {
    return void 0;
  }
  const result = {};
  if (github.owner !== void 0) {
    result.owner = github.owner;
  }
  if (github.repo !== void 0) {
    result.repo = github.repo;
  }
  const pullRequestUrl = getSessionRelatedPullRequestUrls(github)[0];
  if (pullRequestUrl !== void 0) {
    result.pullRequestUrl = pullRequestUrl;
  }
  return Object.keys(result).length > 0 ? result : void 0;
}
function serializeSession(session) {
  const git = serializeGitState(session);
  const github = serializeGitHubState(session);
  const status = describeSessionStatus(session);
  return {
    session: session.session.toString(),
    ...session.summary !== void 0 ? { title: session.summary } : {},
    ...status !== void 0 ? { status } : {},
    ...session.activity !== void 0 ? { activity: session.activity } : {},
    ...session.workingDirectories?.[0] !== void 0 ? { workingDirectory: session.workingDirectories[0].toString() } : {},
    ...session.project !== void 0 ? { project: session.project.displayName } : {},
    ...sessionIsUnread(session) ? { unread: true } : {},
    ...session.startTime > 0 ? { createdAt: new Date(session.startTime).toISOString() } : {},
    ...session.modifiedTime > 0 ? { modifiedAt: new Date(session.modifiedTime).toISOString() } : {},
    ...session.changes !== void 0 ? { changes: session.changes } : {},
    ...session.changesets !== void 0 ? {
      changesets: session.changesets.map((changeset) => ({
        label: changeset.label,
        changeKind: changeset.changeKind,
        uriTemplate: changeset.uriTemplate,
        ...changeset.description !== void 0 ? { description: changeset.description } : {}
      }))
    } : {},
    ...git !== void 0 ? { git } : {},
    ...github !== void 0 ? { github } : {}
  };
}
function serializeSessions(sessions) {
  return JSON.stringify({ sessions: sessions.map(serializeSession) });
}
async function applyCreateSessionTool(accessor, rawArgs, source) {
  const currentSession = source ? currentSessionUri(source.toString()) : void 0;
  const parentDepth = currentSession ? accessor.getSessionSpawnDepth(currentSession) : 0;
  if (parentDepth >= maxSessionSpawnDepth) {
    throw new Error(`Refusing to create a session: recursion limit reached (max spawn depth ${maxSessionSpawnDepth}). This session was itself created ${parentDepth} level(s) deep.`);
  }
  const sessions = await accessor.listSessions();
  const args = getCreateSessionArgs(rawArgs, sessions, accessor.getModels());
  const defaults = source ? accessor.getCreationDefaults(source) : void 0;
  const provider = args.model?.provider ?? defaults?.provider;
  const inheritsSourceProvider = provider !== void 0 && provider === defaults?.provider;
  const config = {
    workingDirectories: args.workspace ? [args.workspace] : void 0,
    ...provider !== void 0 ? { provider } : {},
    ...args.model !== void 0 ? { model: { id: args.model.id } } : defaults?.model !== void 0 ? { model: defaults.model } : {},
    ...inheritsSourceProvider && defaults?.config !== void 0 ? { config: defaults.config } : {}
  };
  const session = await accessor.createSession(config);
  accessor.setSessionSpawnDepth(session, parentDepth + 1);
  const chat = URI.parse(buildDefaultChatUri(session));
  await accessor.startPrompt(session, chat, args.prompt);
  return { session: session.toString(), chat: chat.toString(), openLink: buildOpenSessionLinkUri(session) };
}
function formatCreateSessionResult(result) {
  return `Session created (${result.openLink}). Reply with one short sentence confirming the session was created; do not print the URL or mention a button.`;
}
function resolveKnownSession(sessionInput, sessions) {
  const fromLink = parseOpenSessionLinkUri(sessionInput);
  const candidate = fromLink?.toString() ?? sessionInput;
  const match = sessions.find((s) => s.session.toString() === candidate);
  return match?.session;
}
function resolveChatSession(sessionInput, sessions) {
  const session = resolveKnownSession(sessionInput, sessions);
  if (!session) {
    throw new Error(`Invalid ${SessionServerToolName.CreateChat} input: session must match the URI of a known session (see list_sessions).`);
  }
  return session;
}
function getCreateChatArgs(rawArgs, sessions, models, currentSession) {
  const args = rawArgs ?? {};
  const prompt = getRequiredString(args.prompt, "prompt", SessionServerToolName.CreateChat);
  const title = getOptionalString(args.title, "title", SessionServerToolName.CreateChat);
  const modelName = getOptionalString(args.model, "model", SessionServerToolName.CreateChat);
  const model = resolveModel(modelName, models);
  const sessionInput = getOptionalString(args.session, "session", SessionServerToolName.CreateChat);
  let session;
  if (sessionInput !== void 0) {
    session = resolveChatSession(sessionInput, sessions);
  } else if (currentSession) {
    session = currentSession;
  } else {
    throw new Error(`Invalid ${SessionServerToolName.CreateChat} input: no session provided and the current session could not be determined.`);
  }
  return { session, prompt, ...title !== void 0 ? { title } : {}, ...model !== void 0 ? { model } : {} };
}
async function applyCreateChatTool(accessor, rawArgs, source) {
  const sessions = await accessor.listSessions();
  const currentSession = source ? currentSessionUri(source.toString()) : void 0;
  const args = getCreateChatArgs(rawArgs, sessions, accessor.getModels(), currentSession);
  const defaults = source ? accessor.getCreationDefaults(source) : void 0;
  const targetProvider = AgentSession.provider(args.session);
  const model = args.model !== void 0 ? { id: args.model.id } : targetProvider === defaults?.provider ? defaults?.model : void 0;
  const chatId = generateUuid();
  const chat = URI.parse(buildChatUri(args.session.toString(), chatId));
  await accessor.createChat(args.session, chat, { title: args.title, model });
  await accessor.startPrompt(args.session, chat, args.prompt);
  return { session: args.session.toString(), chat: chat.toString(), openLink: buildOpenSessionLinkUri(args.session, chatId) };
}
function formatCreateChatResult(result) {
  return `Chat created (${result.openLink}). Reply with one short sentence confirming the chat was created; do not print the URL or mention a button.`;
}
function currentChatUri(toolCallChannel) {
  if (!toolCallChannel) {
    return void 0;
  }
  const parsed = parseChatUri(toolCallChannel);
  if (!parsed) {
    return void 0;
  }
  return URI.parse(toolCallChannel);
}
function normalizeRenameChatTitle(requestedTitle, sessions, session, chat) {
  const metadata = sessions.find((candidate) => candidate.session.toString() === session.toString());
  const title = isDefaultChatUri(chat) && metadata?.workingDirectories?.length ? normalizeProjectSessionTitle(requestedTitle) : normalizeGeneralChatTitle(requestedTitle);
  if (!title) {
    throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: title must contain non-whitespace characters.`);
  }
  validateRenameTitle(title, SessionServerToolName.RenameChat);
  return title;
}
function getRenameChatArgs(rawArgs, sessions, currentChannel) {
  const args = rawArgs ?? {};
  const requestedTitle = getRequiredString(args.title, "title", SessionServerToolName.RenameChat);
  const sessionInput = getOptionalString(args.session, "session", SessionServerToolName.RenameChat);
  const chatInput = getOptionalString(args.chat, "chat", SessionServerToolName.RenameChat);
  if (chatInput !== void 0) {
    const session2 = resolveKnownSession(chatInput, sessions);
    const chatId = parseOpenSessionLinkChatId(chatInput);
    if (!session2) {
      throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: chat must be an agent-host-session:// link targeting a known chat.`);
    }
    if (sessionInput !== void 0) {
      const explicitSession2 = resolveKnownSession(sessionInput, sessions);
      if (!explicitSession2) {
        throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: session must match the URI of a known session (see list_sessions).`);
      }
      if (explicitSession2.toString() !== session2.toString()) {
        throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: session must match the owning session of chat.`);
      }
    }
    const chat2 = URI.parse(chatId ? buildChatUri(session2.toString(), chatId) : buildDefaultChatUri(session2.toString()));
    const parsed2 = parseChatUri(chat2);
    if (!parsed2) {
      throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: chat must target a known chat.`);
    }
    const title2 = normalizeRenameChatTitle(requestedTitle, sessions, session2, chat2);
    return { session: session2, chat: chat2, title: title2, chatId: parsed2.chatId };
  }
  const currentChat = currentChatUri(currentChannel);
  if (currentChat && currentChannel) {
    const session2 = currentSessionUri(currentChannel);
    if (sessionInput !== void 0) {
      const explicitSession2 = resolveKnownSession(sessionInput, sessions);
      if (!explicitSession2) {
        throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: session must match the URI of a known session (see list_sessions).`);
      }
      if (explicitSession2.toString() !== session2.toString()) {
        throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: session must match the current chat's owning session.`);
      }
    }
    const parsed2 = parseChatUri(currentChat.toString());
    if (!parsed2) {
      throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: current channel is not a chat.`);
    }
    const title2 = normalizeRenameChatTitle(requestedTitle, sessions, session2, currentChat);
    return { session: session2, chat: currentChat, title: title2, chatId: parsed2.chatId };
  }
  const explicitSession = sessionInput !== void 0 ? resolveKnownSession(sessionInput, sessions) : void 0;
  if (sessionInput !== void 0 && !explicitSession) {
    throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: session must match the URI of a known session (see list_sessions).`);
  }
  const sessionFromChannel = currentChannel ? currentSessionUri(currentChannel) : void 0;
  if (explicitSession && sessionFromChannel && explicitSession.toString() !== sessionFromChannel.toString()) {
    const channelIsKnownSession = sessions.some((candidate) => candidate.session.toString() === sessionFromChannel.toString());
    if (channelIsKnownSession) {
      throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: session must match the current chat's owning session.`);
    }
  }
  const session = explicitSession ?? sessionFromChannel;
  if (!session) {
    throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: chat must target a known chat, or the tool must run inside that chat.`);
  }
  const chat = URI.parse(buildDefaultChatUri(session.toString()));
  const parsed = parseChatUri(chat);
  if (!parsed) {
    throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: chat must target a known chat.`);
  }
  const title = normalizeRenameChatTitle(requestedTitle, sessions, session, chat);
  return { session, chat, title, chatId: parsed.chatId };
}
async function applyRenameChatTool(accessor, rawArgs, currentChannel) {
  const sessions = await accessor.listSessions();
  const { session, chat, title } = getRenameChatArgs(rawArgs, sessions, currentChannel);
  const result = await accessor.renameChat(session, chat, title);
  return `Renamed chat to "${result.title}".`;
}
function getSendMessageArgs(rawArgs, sessions) {
  const args = rawArgs ?? {};
  const message = getRequiredString(args.message, "message", SessionServerToolName.SendMessage);
  const sessionInput = getRequiredString(args.session, "session", SessionServerToolName.SendMessage);
  const session = resolveKnownSession(sessionInput, sessions);
  if (!session) {
    throw new Error(`Invalid ${SessionServerToolName.SendMessage} input: session must match the URI of a known session (see list_sessions).`);
  }
  const chatId = parseOpenSessionLinkChatId(sessionInput);
  const chat = URI.parse(chatId ? buildChatUri(session.toString(), chatId) : buildDefaultChatUri(session.toString()));
  return { session, chat, message, ...chatId !== void 0 ? { chatId } : {} };
}
async function applySendMessageTool(accessor, rawArgs, currentChannel) {
  const sessions = await accessor.listSessions();
  const { session, chat, chatId, message } = getSendMessageArgs(rawArgs, sessions);
  if (currentChannel && chat.toString() === URI.parse(currentChannel).toString()) {
    throw new Error(`Invalid ${SessionServerToolName.SendMessage} input: refusing to send a message to the current chat.`);
  }
  await accessor.startPrompt(session, chat, message);
  return formatSendMessageResult(buildOpenSessionLinkUri(session, chatId));
}
function formatSendMessageResult(openLink) {
  return `Message sent (${openLink}). Reply with one short sentence confirming the message was sent; do not print the URL or mention a button.`;
}
const defaultTranscriptLimit = 10;
const maxTranscriptLimit = 50;
const contextCaps = {
  // `summary` still carries a short assistant gist per turn so the reader sees
  // what each turn actually did, not just what was asked.
  summary: { user: 160, assistant: 140, toolInput: 0 },
  digest: { user: 300, assistant: 800, toolInput: 0 },
  full: { user: 1e3, assistant: 2e3, toolInput: 200 }
};
function getSessionContextArgs(rawArgs, sessions) {
  const args = rawArgs ?? {};
  const sessionInput = getRequiredString(args.session, "session", SessionServerToolName.GetSessionContext);
  const session = resolveKnownSession(sessionInput, sessions);
  if (!session) {
    throw new Error(`Invalid ${SessionServerToolName.GetSessionContext} input: session must match the URI of a known session (see list_sessions).`);
  }
  let detail = "summary";
  if (args.detail !== void 0) {
    if (typeof args.detail !== "string" || !sessionContextDetailValues.includes(args.detail)) {
      throw new Error(`Invalid ${SessionServerToolName.GetSessionContext} input: detail must be one of ${sessionContextDetailValues.join(", ")}.`);
    }
    detail = args.detail;
  }
  let transcriptLimit = defaultTranscriptLimit;
  if (args.transcriptLimit !== void 0) {
    if (typeof args.transcriptLimit !== "number" || !Number.isFinite(args.transcriptLimit) || args.transcriptLimit < 1) {
      throw new Error(`Invalid ${SessionServerToolName.GetSessionContext} input: transcriptLimit must be a positive number.`);
    }
    transcriptLimit = Math.min(Math.floor(args.transcriptLimit), maxTranscriptLimit);
  }
  const chatId = parseOpenSessionLinkChatId(sessionInput);
  return { session, detail, transcriptLimit, ...chatId !== void 0 ? { chatId } : {} };
}
function truncateText(text, max) {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return { text: trimmed, truncated: false };
  }
  return { text: `${trimmed.slice(0, Math.max(0, max - 1))}\u2026`, truncated: true };
}
function toolCallsOf(parts) {
  return parts.filter((p) => p.kind === ResponsePartKind.ToolCall).map((p) => p.toolCall);
}
function assistantTextOf(parts) {
  return parts.filter((p) => p.kind === ResponsePartKind.Markdown).map((p) => p.content).join("").trim();
}
function describeTurnState(state) {
  switch (state) {
    case TurnState.Complete:
      return "complete";
    case TurnState.Cancelled:
      return "cancelled";
    case TurnState.Error:
      return "error";
    default:
      return "inProgress";
  }
}
function serializeSessionContext(session, chatId, snapshot, detail, transcriptLimit) {
  const caps = contextCaps[detail];
  let truncated = false;
  const trunc = (text, max) => {
    if (max <= 0 || !text) {
      return void 0;
    }
    const result = truncateText(text, max);
    truncated = truncated || result.truncated;
    return result.text || void 0;
  };
  const entries = snapshot.turns.map((t) => ({ message: t.message, parts: t.responseParts, state: t.state }));
  if (snapshot.activeTurn) {
    entries.push({ message: snapshot.activeTurn.message, parts: snapshot.activeTurn.responseParts, state: "inProgress" });
  }
  if (entries.length > transcriptLimit) {
    truncated = true;
  }
  const windowStart = Math.max(0, entries.length - transcriptLimit);
  const windowed = entries.slice(windowStart);
  const transcript = windowed.map((entry, index) => {
    const user = trunc(entry.message.text, caps.user);
    const assistant = trunc(assistantTextOf(entry.parts), caps.assistant);
    const toolCalls = toolCallsOf(entry.parts);
    let serializedToolCalls;
    if (detail !== "summary" && toolCalls.length > 0) {
      serializedToolCalls = toolCalls.map((tc) => {
        if (caps.toolInput > 0) {
          const input = trunc(tc.status === ToolCallStatus.Streaming ? "" : getInlineToolInput(tc.toolInput) ?? "", caps.toolInput);
          return input !== void 0 ? { name: tc.toolName, input } : { name: tc.toolName };
        }
        return tc.toolName;
      });
    }
    return {
      turn: windowStart + index + 1,
      state: describeTurnState(entry.state),
      ...user !== void 0 ? { user } : {},
      ...assistant !== void 0 ? { assistant } : {},
      ...serializedToolCalls ? { toolCalls: serializedToolCalls } : {}
    };
  });
  const payload = {
    session: session.toString(),
    openLink: buildOpenSessionLinkUri(session, chatId),
    detail,
    transcript,
    hasMoreHistory: snapshot.hasMoreHistory,
    truncated
  };
  return JSON.stringify(payload);
}
async function applyGetSessionContextTool(accessor, rawArgs) {
  const sessions = await accessor.listSessions();
  const { session, chatId, detail, transcriptLimit } = getSessionContextArgs(rawArgs, sessions);
  const snapshot = await accessor.getChatContext(session, chatId);
  if (!snapshot) {
    return JSON.stringify({
      session: session.toString(),
      openLink: buildOpenSessionLinkUri(session, chatId),
      detail,
      transcript: [],
      hasMoreHistory: false,
      truncated: false
    });
  }
  return serializeSessionContext(session, chatId, snapshot, detail, transcriptLimit);
}
function serializeCurrentSession(currentSession, sessions) {
  const meta = sessions.find((s) => s.session.toString() === currentSession.toString());
  return JSON.stringify({
    session: currentSession.toString(),
    openLink: buildOpenSessionLinkUri(currentSession),
    ...meta ? serializeSession(meta) : {}
  });
}
function getDeleteSessionArgs(rawArgs, sessions, currentSession) {
  const args = rawArgs ?? {};
  const sessionInput = getRequiredString(args.session, "session", SessionServerToolName.DeleteSession);
  const session = resolveKnownSession(sessionInput, sessions);
  if (!session) {
    throw new Error(`Invalid ${SessionServerToolName.DeleteSession} input: session must match the URI of a known session (see list_sessions).`);
  }
  if (currentSession && session.toString() === currentSession.toString()) {
    throw new Error(`Invalid ${SessionServerToolName.DeleteSession} input: refusing to delete the current session.`);
  }
  return session;
}
async function applyDeleteSessionTool(accessor, rawArgs, currentSession) {
  const sessions = await accessor.listSessions();
  const session = getDeleteSessionArgs(rawArgs, sessions, currentSession);
  await accessor.deleteSession(session);
  return `Deleted session ${session.toString()}. Reply with one short sentence confirming the session was deleted.`;
}
function getSessionToolDisplay(toolName, _args, _result) {
  switch (toolName) {
    case SessionServerToolName.ListSessions:
      return {
        displayName: localize("toolName.listSessions", "List Sessions"),
        invocationMessage: localize("toolInvoke.listSessions", "List sessions")
      };
    case SessionServerToolName.CreateSession:
      return {
        displayName: localize("toolName.createSession", "Create Session"),
        invocationMessage: localize("toolInvoke.createSession", "Creating session"),
        pastTenseMessage: localize("toolComplete.createSession", "Created session")
      };
    case SessionServerToolName.CreateChat:
      return {
        displayName: localize("toolName.createChat", "Create Chat"),
        invocationMessage: localize("toolInvoke.createChat", "Create chat")
      };
    case SessionServerToolName.RenameChat:
      return {
        displayName: localize("toolName.renameChat", "Rename Chat"),
        invocationMessage: localize("toolInvoke.renameChat", "Renaming chat"),
        pastTenseMessage: localize("toolComplete.renameChat", "Updated chat name")
      };
    case SessionServerToolName.SendMessage:
      return {
        displayName: localize("toolName.sendMessage", "Send Message"),
        invocationMessage: localize("toolInvoke.sendMessage", "Send message")
      };
    case SessionServerToolName.GetSessionContext:
      return {
        displayName: localize("toolName.getSessionContext", "Get Session Context"),
        invocationMessage: localize("toolInvoke.getSessionContext", "Read session context")
      };
    case SessionServerToolName.GetCurrentSession:
      return {
        displayName: localize("toolName.getCurrentSession", "Get Current Session"),
        invocationMessage: localize("toolInvoke.getCurrentSession", "Get current session")
      };
    case SessionServerToolName.DeleteSession:
      return {
        displayName: localize("toolName.deleteSession", "Delete Session"),
        invocationMessage: localize("toolInvoke.deleteSession", "Deleting session"),
        pastTenseMessage: localize("toolComplete.deleteSession", "Deleted session")
      };
    default:
      return void 0;
  }
}
function createSessionServerToolGroup(accessor) {
  let createdSessionCount = 0;
  let createdChatCount = 0;
  let sentMessageCount = 0;
  const group = {
    definitions: sessionServerToolDefinitions,
    isEnabled(toolName) {
      return toolName !== SessionServerToolName.RenameChat || accessor?.isActiveAgentTitleGenerationEnabled() !== false;
    },
    canRequireConfirmation(toolName) {
      return sessionToolRequiresConfirmation(toolName);
    },
    getDisplay(toolName, args, result) {
      return getSessionToolDisplay(toolName, args, result);
    },
    async execute(_stateManager, sessionUri, toolName, rawArgs) {
      if (!accessor) {
        throw new Error(`Session server tool "${toolName}" cannot run: the group was built without a session accessor.`);
      }
      switch (toolName) {
        case SessionServerToolName.ListSessions:
          return serializeSessions(filterSessions(await accessor.listSessions(), getListSessionsArgs(rawArgs)));
        case SessionServerToolName.GetCurrentSession:
          return serializeCurrentSession(currentSessionUri(sessionUri), await accessor.listSessions());
        case SessionServerToolName.CreateSession: {
          if (createdSessionCount >= maxCreatedSessions) {
            throw new Error(`Refusing to create more than ${maxCreatedSessions} sessions from server tools in this process.`);
          }
          const result = await applyCreateSessionTool(accessor, rawArgs, URI.parse(sessionUri));
          createdSessionCount++;
          return formatCreateSessionResult(result);
        }
        case SessionServerToolName.CreateChat: {
          if (createdChatCount >= maxCreatedChats) {
            throw new Error(`Refusing to create more than ${maxCreatedChats} chats from server tools in this process.`);
          }
          const result = await applyCreateChatTool(accessor, rawArgs, URI.parse(sessionUri));
          createdChatCount++;
          return formatCreateChatResult(result);
        }
        case SessionServerToolName.RenameChat:
          return applyRenameChatTool(accessor, rawArgs, sessionUri);
        case SessionServerToolName.SendMessage: {
          if (sentMessageCount >= maxSentMessages) {
            throw new Error(`Refusing to send more than ${maxSentMessages} messages from server tools in this process.`);
          }
          const result = await applySendMessageTool(accessor, rawArgs, sessionUri);
          sentMessageCount++;
          return result;
        }
        case SessionServerToolName.GetSessionContext:
          return applyGetSessionContextTool(accessor, rawArgs);
        case SessionServerToolName.DeleteSession:
          return applyDeleteSessionTool(accessor, rawArgs, currentSessionUri(sessionUri));
        default:
          throw new Error(`Unknown session server tool: ${toolName}`);
      }
    }
  };
  return group;
}
export {
  applyCreateChatTool,
  applyCreateSessionTool,
  applyDeleteSessionTool,
  applyGetSessionContextTool,
  applyRenameChatTool,
  applySendMessageTool,
  createSessionServerToolGroup,
  currentSessionUri,
  filterSessions,
  formatCreateChatResult,
  formatCreateSessionResult,
  formatSendMessageResult,
  getCreateChatArgs,
  getCreateSessionArgs,
  getDeleteSessionArgs,
  getListSessionsArgs,
  getRenameChatArgs,
  getSendMessageArgs,
  getSessionContextArgs,
  serializeCurrentSession,
  serializeSessionContext,
  serializeSessions,
  sessionServerToolDefinitions,
  sessionToolRequiresConfirmation,
  validateRenameTitle
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxzaGFyZWRcXHNlc3Npb25TZXJ2ZXJUb29scy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgdHlwZSB7IE11dGFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24sIHR5cGUgQWdlbnRQcm92aWRlciwgdHlwZSBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnLCB0eXBlIElBZ2VudE1vZGVsSW5mbywgdHlwZSBJQWdlbnRTZXNzaW9uTWV0YWRhdGEgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnQuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jaGFubmVscy1zZXNzaW9uL3N0YXRlLmpzJztcbmltcG9ydCB7IGJ1aWxkQ2hhdFVyaSwgYnVpbGREZWZhdWx0Q2hhdFVyaSwgZ2V0SW5saW5lVG9vbElucHV0LCBnZXRTZXNzaW9uUmVsYXRlZFB1bGxSZXF1ZXN0VXJscywgaXNEZWZhdWx0Q2hhdFVyaSwgaXNTZXNzaW9uU3RhdHVzQXJjaGl2ZWQsIGlzU2Vzc2lvblN0YXR1c1JlYWQsIHBhcnNlQ2hhdFVyaSwgcmVhZFNlc3Npb25HaXRTdGF0ZSwgcmVhZFNlc3Npb25HaXRIdWJTdGF0ZSwgUmVzcG9uc2VQYXJ0S2luZCwgVG9vbENhbGxTdGF0dXMsIFR1cm5TdGF0ZSwgdHlwZSBNZXNzYWdlLCB0eXBlIE1vZGVsU2VsZWN0aW9uLCB0eXBlIFJlc3BvbnNlUGFydCwgdHlwZSBUb29sQ2FsbFN0YXRlLCB0eXBlIFRvb2xEZWZpbml0aW9uLCB0eXBlIFR1cm4sIHR5cGUgVVJJIGFzIFByb3RvY29sVVJJIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBidWlsZE9wZW5TZXNzaW9uTGlua1VyaSwgcGFyc2VPcGVuU2Vzc2lvbkxpbmtDaGF0SWQsIHBhcnNlT3BlblNlc3Npb25MaW5rVXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL29wZW5TZXNzaW9uTGluay5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uU2VydmVyVG9vbE5hbWUgfSBmcm9tICcuLi8uLi9jb21tb24vc2VydmVyVG9vbE5hbWVzLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHR5cGUgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuLi9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHR5cGUgeyBJU2VydmVyVG9vbERpc3BsYXksIElTZXJ2ZXJUb29sRGlzcGxheVJlc3VsdCwgSVNlcnZlclRvb2xHcm91cCB9IGZyb20gJy4vYWdlbnRTZXJ2ZXJUb29sSG9zdC5qcyc7XG5cbi8qKlxuICogTWF4aW11bSBgY3JlYXRlX3Nlc3Npb25gIHJlY3Vyc2lvbiBkZXB0aC4gQSB1c2VyL3RvcC1sZXZlbCBzZXNzaW9uIGlzIGRlcHRoIDA7XG4gKiBhIHNlc3Npb24gY3JlYXRlZCBieSBgY3JlYXRlX3Nlc3Npb25gIGZyb20gd2l0aGluIGEgZGVwdGgtTiBzZXNzaW9uIGlzIGRlcHRoXG4gKiBOKzEuIE9uY2UgYSBzZXNzaW9uIHJlYWNoZXMgdGhpcyBkZXB0aCwgaXRzIGFnZW50IG1heSBub3QgY3JlYXRlIGZ1cnRoZXJcbiAqIHNlc3Npb25zIFx1MjAxNCB0aGlzIGJvdW5kcyByZWN1cnNpdmUgc3Bhd24gKmNoYWlucyogKEFcdTIxOTJCXHUyMTkyQ1x1MjE5Mlx1MjAyNikuIEJyZWFkdGggaXMgYm91bmRlZFxuICogc2VwYXJhdGVseSBieSB7QGxpbmsgbWF4Q3JlYXRlZFNlc3Npb25zfSBwbHVzIHRoZSBwZXItY2FsbCB1c2VyIGNvbmZpcm1hdGlvbi5cbiAqL1xuY29uc3QgbWF4U2Vzc2lvblNwYXduRGVwdGggPSAzO1xuXG4vKiogUHJvY2Vzcy13aWRlIGJhY2tzdG9wIGFnYWluc3QgcnVuYXdheSBzcGF3bmluZyAoYnJlYWR0aCksIGluZGVwZW5kZW50IG9mIGRlcHRoLiAqL1xuY29uc3QgbWF4Q3JlYXRlZFNlc3Npb25zID0gMjU7XG5jb25zdCBtYXhDcmVhdGVkQ2hhdHMgPSAyNTtcblxuLyoqIFByb2Nlc3Mtd2lkZSBiYWNrc3RvcCBhZ2FpbnN0IHJ1bmF3YXkgYHNlbmRfbWVzc2FnZWAgZmFuLW91dC4gKi9cbmNvbnN0IG1heFNlbnRNZXNzYWdlcyA9IDUwO1xuXG5jb25zdCBzZXNzaW9uQ29uZmlybWF0aW9uVG9vbE5hbWVzOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldChbU2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZVNlc3Npb24sIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5DcmVhdGVDaGF0LCBTZXNzaW9uU2VydmVyVG9vbE5hbWUuU2VuZE1lc3NhZ2UsIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5EZWxldGVTZXNzaW9uXSk7XG5cbi8qKiBXaGV0aGVyIHRoZSBnaXZlbiBzZXNzaW9uIHNlcnZlciB0b29sIHJlcXVpcmVzIHVzZXIgY29uZmlybWF0aW9uIGJlZm9yZSBpdCBydW5zLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNlc3Npb25Ub29sUmVxdWlyZXNDb25maXJtYXRpb24odG9vbE5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gc2Vzc2lvbkNvbmZpcm1hdGlvblRvb2xOYW1lcy5oYXModG9vbE5hbWUpO1xufVxuXG5jb25zdCBsaXN0U2Vzc2lvbnNTdGF0dXNWYWx1ZXMgPSBbJ2lkbGUnLCAnaW5Qcm9ncmVzcycsICdpbnB1dE5lZWRlZCcsICdlcnJvcicsICdhcmNoaXZlZCddIGFzIGNvbnN0O1xuXG5jb25zdCBsaXN0U2Vzc2lvbnNJbnB1dFNjaGVtYTogVG9vbERlZmluaXRpb25bJ2lucHV0U2NoZW1hJ10gPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0c2Vzc2lvbjogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246ICdSZXR1cm4gb25seSB0aGUgc2Vzc2lvbiB3aXRoIHRoaXMgVVJJIG9yIGBhZ2VudC1ob3N0LXNlc3Npb246Ly9gIGxpbmsgKGEgZGlyZWN0IGxvb2t1cCB0aGF0IGlnbm9yZXMgdGhlIG90aGVyIGZpbHRlcnMpLiBVc2UgdGhpcyB0byBmZXRjaCBvbmUga25vd24gc2Vzc2lvblxcJ3MgbWV0YWRhdGEuJyB9LFxuXHRcdHN0YXR1czoge1xuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnLCBlbnVtOiBbLi4ubGlzdFNlc3Npb25zU3RhdHVzVmFsdWVzXSB9LFxuXHRcdFx0ZGVzY3JpcHRpb246ICdPbmx5IHJldHVybiBzZXNzaW9ucyB3aG9zZSBzdGF0dXMgbWF0Y2hlcyBvbmUgb2YgdGhlc2UgKGUuZy4gYGlucHV0TmVlZGVkYCBmb3Igc2Vzc2lvbnMgYXdhaXRpbmcgYSByZXBseSwgYGluUHJvZ3Jlc3NgIGZvciBydW5uaW5nIG9uZXMsIGBhcmNoaXZlZGAgZm9yIHNlc3Npb25zIG1hcmtlZCBEb25lL2NvbXBsZXRlZCBcdTIwMTQgaW1wbGllcyBgaW5jbHVkZUFyY2hpdmVkYCkuIE9taXQgdG8gcmV0dXJuIGV2ZXJ5IHN0YXR1cy4nLFxuXHRcdH0sXG5cdFx0d29ya3NwYWNlOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ09ubHkgcmV0dXJuIHNlc3Npb25zIHdob3NlIHdvcmtpbmcgZGlyZWN0b3J5IGlzIHRoaXMgZm9sZGVyIFx1MjAxNCBhbiBhYnNvbHV0ZSBwYXRoIG9yIGEgd29ya3NwYWNlIFVSSS4nIH0sXG5cdFx0d2l0aENoYW5nZXM6IHsgdHlwZTogJ2Jvb2xlYW4nLCBkZXNjcmlwdGlvbjogJ1doZW4gdHJ1ZSwgb25seSByZXR1cm4gc2Vzc2lvbnMgdGhhdCBoYXZlIHBlbmRpbmcgd29ya3RyZWUgY2hhbmdlcy4nIH0sXG5cdFx0dW5yZWFkOiB7IHR5cGU6ICdib29sZWFuJywgZGVzY3JpcHRpb246ICdXaGVuIHRydWUsIG9ubHkgcmV0dXJuIHNlc3Npb25zIHdpdGggdXBkYXRlcyB0aGUgdXNlciBoYXMgbm90IHNlZW4geWV0LicgfSxcblx0XHR3aXRoUHVsbFJlcXVlc3Q6IHsgdHlwZTogJ2Jvb2xlYW4nLCBkZXNjcmlwdGlvbjogJ1doZW4gdHJ1ZSwgb25seSByZXR1cm4gc2Vzc2lvbnMgdGhhdCBoYXZlIGEgbGlua2VkIEdpdEh1YiBwdWxsIHJlcXVlc3QuJyB9LFxuXHRcdGluY2x1ZGVBcmNoaXZlZDogeyB0eXBlOiAnYm9vbGVhbicsIGRlc2NyaXB0aW9uOiAnV2hldGhlciB0byBpbmNsdWRlIGFyY2hpdmVkIHNlc3Npb25zLiBEZWZhdWx0cyB0byBmYWxzZTsgc2V0IHRydWUgdG8gYWxzbyByZXR1cm4gYXJjaGl2ZWQgc2Vzc2lvbnMuJyB9LFxuXHRcdGNyZWF0ZWRBZnRlcjogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246ICdPbmx5IHJldHVybiBzZXNzaW9ucyBjcmVhdGVkIGF0IG9yIGFmdGVyIHRoaXMgdGltZSAoSVNPLTg2MDEgdGltZXN0YW1wLCBlLmcuIGAyMDI1LTAxLTMxVDAwOjAwOjAwWmApLicgfSxcblx0XHRjcmVhdGVkQmVmb3JlOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ09ubHkgcmV0dXJuIHNlc3Npb25zIGNyZWF0ZWQgYXQgb3IgYmVmb3JlIHRoaXMgdGltZSAoSVNPLTg2MDEgdGltZXN0YW1wKS4nIH0sXG5cdH0sXG59O1xuXG5jb25zdCBjcmVhdGVTZXNzaW9uSW5wdXRTY2hlbWE6IFRvb2xEZWZpbml0aW9uWydpbnB1dFNjaGVtYSddID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdHdvcmtzcGFjZTogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246ICdBYnNvbHV0ZSBmb2xkZXIgcGF0aCwgd29ya3NwYWNlIFVSSSwgb3IgYSB3b3JraW5nIGRpcmVjdG9yeSBmcm9tIGFuIGV4aXN0aW5nIHNlc3Npb24uJyB9LFxuXHRcdHByb21wdDogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246ICdJbml0aWFsIHByb21wdCB0byBzZW5kIHRvIHRoZSBuZXcgc2Vzc2lvbi4nIH0sXG5cdFx0bW9kZWw6IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiAnT3B0aW9uYWwgbW9kZWwgSUQgb3IgZGlzcGxheSBuYW1lLiBEZWZhdWx0cyB0byB0aGUgY3VycmVudCBjaGF0XFwncyBtb2RlbC4nIH0sXG5cdH0sXG5cdHJlcXVpcmVkOiBbJ3dvcmtzcGFjZScsICdwcm9tcHQnXSxcbn07XG5cbmNvbnN0IGdldEN1cnJlbnRTZXNzaW9uSW5wdXRTY2hlbWE6IFRvb2xEZWZpbml0aW9uWydpbnB1dFNjaGVtYSddID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge30sXG59O1xuXG5jb25zdCBjcmVhdGVDaGF0SW5wdXRTY2hlbWE6IFRvb2xEZWZpbml0aW9uWydpbnB1dFNjaGVtYSddID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdHNlc3Npb246IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiAnT3B0aW9uYWwgc2Vzc2lvbiB0byBhZGQgdGhlIGNoYXQgdG86IGEgc2Vzc2lvbiBVUkkgZnJvbSBgbGlzdF9zZXNzaW9uc2Agb3IgYW4gYGFnZW50LWhvc3Qtc2Vzc2lvbjovL2AgbGluay4gRGVmYXVsdHMgdG8gdGhlIGN1cnJlbnQgc2Vzc2lvbiB3aGVuIG9taXR0ZWQuJyB9LFxuXHRcdHByb21wdDogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246ICdJbml0aWFsIHByb21wdCB0byBzZW5kIHRvIHRoZSBuZXcgY2hhdC4nIH0sXG5cdFx0dGl0bGU6IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiAnT3B0aW9uYWwgdGl0bGUgZm9yIHRoZSBuZXcgY2hhdC4nIH0sXG5cdFx0bW9kZWw6IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiAnT3B0aW9uYWwgbW9kZWwgSUQgb3IgZGlzcGxheSBuYW1lLiBEZWZhdWx0cyB0byB0aGUgY3VycmVudCBjaGF0XFwncyBtb2RlbC4nIH0sXG5cdH0sXG5cdHJlcXVpcmVkOiBbJ3Byb21wdCddLFxufTtcblxuY29uc3QgcmVuYW1lQ2hhdElucHV0U2NoZW1hOiBUb29sRGVmaW5pdGlvblsnaW5wdXRTY2hlbWEnXSA9IHtcblx0dHlwZTogJ29iamVjdCcsXG5cdHByb3BlcnRpZXM6IHtcblx0XHRzZXNzaW9uOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ09wdGlvbmFsIG93bmluZyBzZXNzaW9uOiBhIHNlc3Npb24gVVJJIGZyb20gYGxpc3Rfc2Vzc2lvbnNgIG9yIGFuIGBhZ2VudC1ob3N0LXNlc3Npb246Ly9gIGxpbmsuIFdoZW4gcHJvdmlkZWQgd2l0aCBgY2hhdGAsIGl0IG11c3QgbWF0Y2ggdGhhdCBjaGF0XFwncyBzZXNzaW9uLicgfSxcblx0XHRjaGF0OiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ1RoZSBjaGF0IHRvIHJlbmFtZTogcGFzcyBhbiBgYWdlbnQtaG9zdC1zZXNzaW9uOi8vYCBzZXNzaW9uIG9yIGNoYXQgbGluay4gT21pdCB3aGVuIHJlbmFtaW5nIHRoZSBjaGF0IGluIHdoaWNoIHRoaXMgdG9vbCBpcyBydW5uaW5nLCBvciB3aGVuIGBzZXNzaW9uYCBpZGVudGlmaWVzIHRoYXQgc2Vzc2lvbiBzbyBpdHMgZGVmYXVsdCBjaGF0IHNob3VsZCBiZSByZW5hbWVkLicgfSxcblx0XHR0aXRsZTogeyB0eXBlOiAnc3RyaW5nJywgbWF4TGVuZ3RoOiAyMDAsIGRlc2NyaXB0aW9uOiAnU2hvcnQsIGRlc2NyaXB0aXZlIGNoYXQgdGl0bGUsIGlkZWFsbHkgMS00IHdvcmRzLicgfSxcblx0fSxcblx0cmVxdWlyZWQ6IFsndGl0bGUnXSxcbn07XG5cbmNvbnN0IGRlbGV0ZVNlc3Npb25JbnB1dFNjaGVtYTogVG9vbERlZmluaXRpb25bJ2lucHV0U2NoZW1hJ10gPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0c2Vzc2lvbjogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246ICdUaGUgc2Vzc2lvbiB0byBkZWxldGU6IGEgc2Vzc2lvbiBVUkkgZnJvbSBgbGlzdF9zZXNzaW9uc2Agb3IgYW4gYGFnZW50LWhvc3Qtc2Vzc2lvbjovL2AgbGluayAoZS5nLiBmcm9tIGBjcmVhdGVfc2Vzc2lvbmApLicgfSxcblx0fSxcblx0cmVxdWlyZWQ6IFsnc2Vzc2lvbiddLFxufTtcblxuY29uc3Qgc2VuZE1lc3NhZ2VJbnB1dFNjaGVtYTogVG9vbERlZmluaXRpb25bJ2lucHV0U2NoZW1hJ10gPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0c2Vzc2lvbjogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246ICdUaGUgc2Vzc2lvbiBvciBjaGF0IHRvIG1lc3NhZ2U6IGEgc2Vzc2lvbiBVUkkgZnJvbSBgbGlzdF9zZXNzaW9uc2AsIG9yIGFuIGBhZ2VudC1ob3N0LXNlc3Npb246Ly9gIGxpbmsgKGZyb20gYGNyZWF0ZV9zZXNzaW9uYC9gY3JlYXRlX2NoYXRgOyBhIGBjcmVhdGVfY2hhdGAgbGluayB0YXJnZXRzIHRoYXQgc3BlY2lmaWMgY2hhdCkuJyB9LFxuXHRcdG1lc3NhZ2U6IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiAnVGhlIG1lc3NhZ2UgdG8gc2VuZC4nIH0sXG5cdH0sXG5cdHJlcXVpcmVkOiBbJ3Nlc3Npb24nLCAnbWVzc2FnZSddLFxufTtcblxuY29uc3Qgc2Vzc2lvbkNvbnRleHREZXRhaWxWYWx1ZXMgPSBbJ3N1bW1hcnknLCAnZGlnZXN0JywgJ2Z1bGwnXSBhcyBjb25zdDtcblxuY29uc3QgZ2V0U2Vzc2lvbkNvbnRleHRJbnB1dFNjaGVtYTogVG9vbERlZmluaXRpb25bJ2lucHV0U2NoZW1hJ10gPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0c2Vzc2lvbjogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246ICdUaGUgc2Vzc2lvbiBvciBjaGF0IHRvIHJlYWQ6IGEgc2Vzc2lvbiBVUkkgZnJvbSBgbGlzdF9zZXNzaW9uc2AsIG9yIGFuIGBhZ2VudC1ob3N0LXNlc3Npb246Ly9gIGxpbmsgKGEgYGNyZWF0ZV9jaGF0YCBsaW5rIHRhcmdldHMgdGhhdCBzcGVjaWZpYyBjaGF0KS4nIH0sXG5cdFx0ZGV0YWlsOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsuLi5zZXNzaW9uQ29udGV4dERldGFpbFZhbHVlc10sXG5cdFx0XHRkZXNjcmlwdGlvbjogJ0hvdyBtdWNoIGNvbnZlcnNhdGlvbiBkZXRhaWwgdG8gcmV0dXJuLiBgc3VtbWFyeWAgKGRlZmF1bHQpOiBzdGF0dXMgYW5kIGEgc2hvcnQgcGVyLXR1cm4gZ2lzdCAodGhlIG1lc3NhZ2UgcGx1cyBhIGNvbXBhY3Qgc25pcHBldCBvZiB0aGUgcmVwbHkpLiBgZGlnZXN0YDogYWRkcyB0aGUgZnVsbCBhc3Npc3RhbnQgcmVwbHkgdGV4dCBhbmQgdG9vbC1jYWxsIG5hbWVzLiBgZnVsbGA6IGFkZHMgdG9vbC1jYWxsIGlucHV0cy4gSGlnaGVyIGxldmVscyByZXR1cm4gbW9yZSB0b2tlbnMuJyxcblx0XHR9LFxuXHRcdHRyYW5zY3JpcHRMaW1pdDogeyB0eXBlOiAnbnVtYmVyJywgZGVzY3JpcHRpb246ICdNYXhpbXVtIG51bWJlciBvZiBtb3N0LXJlY2VudCB0dXJucyB0byBpbmNsdWRlLiBEZWZhdWx0cyB0byAxMDsgY2FwcGVkIGF0IDUwLicgfSxcblx0fSxcblx0cmVxdWlyZWQ6IFsnc2Vzc2lvbiddLFxufTtcblxuLyoqIFByb3RvY29sIHRvb2wgZGVmaW5pdGlvbnMgZm9yIHRoZSBzZXNzaW9uLW1hbmFnZW1lbnQgc2VydmVyIHRvb2xzLiAqL1xuZXhwb3J0IGNvbnN0IHNlc3Npb25TZXJ2ZXJUb29sRGVmaW5pdGlvbnM6IFRvb2xEZWZpbml0aW9uW10gPSBbXG5cdHtcblx0XHRuYW1lOiBTZXNzaW9uU2VydmVyVG9vbE5hbWUuTGlzdFNlc3Npb25zLFxuXHRcdHRpdGxlOiAnTGlzdCBTZXNzaW9ucycsXG5cdFx0ZGVzY3JpcHRpb246ICdMaXN0IHNlc3Npb25zIGFuZCB0aGVpciBjb21wYWN0IG1ldGFkYXRhIChzdGF0dXMsIGFjdGl2aXR5LCB3b3JraW5nIGRpcmVjdG9yeSwgcHJvamVjdCwgd29ya3RyZWUgY2hhbmdlcywgZ2l0L0dpdEh1YiBpbmZvLCB0aW1lc3RhbXBzKS4gUGFzcyBgc2Vzc2lvbmAgdG8gZmV0Y2ggYSBzaW5nbGUga25vd24gc2Vzc2lvbiBieSBVUkkuIEJ5IGRlZmF1bHQgYXJjaGl2ZWQgc2Vzc2lvbnMgYXJlIG9taXR0ZWQuIE9wdGlvbmFsbHkgZmlsdGVyIGJ5IGBzdGF0dXNgLCBgd29ya3NwYWNlYCwgYHdpdGhDaGFuZ2VzYCwgYHVucmVhZGAsIGB3aXRoUHVsbFJlcXVlc3RgLCBgaW5jbHVkZUFyY2hpdmVkYCwgYGNyZWF0ZWRBZnRlcmAsIG9yIGBjcmVhdGVkQmVmb3JlYC4nLFxuXHRcdGlucHV0U2NoZW1hOiBsaXN0U2Vzc2lvbnNJbnB1dFNjaGVtYSxcblx0XHRhbm5vdGF0aW9uczogeyByZWFkT25seUhpbnQ6IHRydWUgfSxcblx0fSxcblx0e1xuXHRcdG5hbWU6IFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5HZXRDdXJyZW50U2Vzc2lvbixcblx0XHR0aXRsZTogJ0dldCBDdXJyZW50IFNlc3Npb24nLFxuXHRcdGRlc2NyaXB0aW9uOiAnR2V0IG1ldGFkYXRhIGFuZCB0aGUgb3BlbiBsaW5rIGZvciB0aGUgc2Vzc2lvbiB0aGlzIGNvbnZlcnNhdGlvbiBpcyBydW5uaW5nIGluLiBVc2UgdGhpcyB0byByZWZlcmVuY2UgdGhlIGN1cnJlbnQgc2Vzc2lvbiAoZm9yIGV4YW1wbGUgYmVmb3JlIGFkZGluZyBhIGNoYXQgdG8gaXQpLicsXG5cdFx0aW5wdXRTY2hlbWE6IGdldEN1cnJlbnRTZXNzaW9uSW5wdXRTY2hlbWEsXG5cdFx0YW5ub3RhdGlvbnM6IHsgcmVhZE9ubHlIaW50OiB0cnVlIH0sXG5cdH0sXG5cdHtcblx0XHRuYW1lOiBTZXNzaW9uU2VydmVyVG9vbE5hbWUuQ3JlYXRlU2Vzc2lvbixcblx0XHR0aXRsZTogJ0NyZWF0ZSBTZXNzaW9uJyxcblx0XHRkZXNjcmlwdGlvbjogJ0NyZWF0ZSBhIHNlc3Npb24gaW4gYSB3b3Jrc3BhY2UgYW5kIHN0YXJ0IGl0IHdpdGggYW4gaW5pdGlhbCBwcm9tcHQuIFRoZSBVSSBzaG93cyBhIFwiU2Vzc2lvbiBDcmVhdGVkXCIgY29uZmlybWF0aW9uIHdpdGggYSBidXR0b24gdG8gb3BlbiBpdCwgc28gcmVwbHkgd2l0aCBhIHNpbmdsZSBzaG9ydCBzZW50ZW5jZSBjb25maXJtaW5nIHRoZSBzZXNzaW9uIHdhcyBjcmVhdGVkIGFuZCBkbyBOT1QgcHJpbnQgdGhlIHNlc3Npb24gVVJMIG9yIHRlbGwgdGhlIHVzZXIgdG8gY2xpY2sgYSBidXR0b24uJyxcblx0XHRpbnB1dFNjaGVtYTogY3JlYXRlU2Vzc2lvbklucHV0U2NoZW1hLFxuXHRcdGFubm90YXRpb25zOiB7IHJlYWRPbmx5SGludDogZmFsc2UgfSxcblx0fSxcblx0e1xuXHRcdG5hbWU6IFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5DcmVhdGVDaGF0LFxuXHRcdHRpdGxlOiAnQ3JlYXRlIENoYXQnLFxuXHRcdGRlc2NyaXB0aW9uOiAnQWRkIGEgbmV3IGNoYXQgdG8gYW4gZXhpc3Rpbmcgc2Vzc2lvbiBhbmQgc3RhcnQgaXQgd2l0aCBhbiBpbml0aWFsIHByb21wdC4gT21pdCBgc2Vzc2lvbmAgdG8gYWRkIHRoZSBjaGF0IHRvIHRoZSBjdXJyZW50IHNlc3Npb247IG90aGVyd2lzZSBwYXNzIGEgc2Vzc2lvbiBVUkkgZnJvbSBgbGlzdF9zZXNzaW9uc2AuIE9wdGlvbmFsbHkgcGFzcyBhIGBtb2RlbGAgdG8gdXNlIGZvciB0aGUgY2hhdCAoZGVmYXVsdHMgdG8gdGhlIGN1cnJlbnQgY2hhdFxcJ3MgbW9kZWwpLiBUaGUgVUkgc2hvd3MgYSBcIkNoYXQgQ3JlYXRlZFwiIGNvbmZpcm1hdGlvbiB3aXRoIGEgYnV0dG9uIHRvIG9wZW4gdGhlIHNlc3Npb24sIHNvIHJlcGx5IHdpdGggYSBzaW5nbGUgc2hvcnQgc2VudGVuY2UgYW5kIGRvIE5PVCBwcmludCB0aGUgc2Vzc2lvbiBVUkwgb3IgdGVsbCB0aGUgdXNlciB0byBjbGljayBhIGJ1dHRvbi4nLFxuXHRcdGlucHV0U2NoZW1hOiBjcmVhdGVDaGF0SW5wdXRTY2hlbWEsXG5cdFx0YW5ub3RhdGlvbnM6IHsgcmVhZE9ubHlIaW50OiBmYWxzZSB9LFxuXHR9LFxuXHR7XG5cdFx0bmFtZTogU2Vzc2lvblNlcnZlclRvb2xOYW1lLlJlbmFtZUNoYXQsXG5cdFx0dGl0bGU6ICdSZW5hbWUgQ2hhdCcsXG5cdFx0ZGVzY3JpcHRpb246ICdSZW5hbWUgb25lIHNwZWNpZmljIGNoYXQgc28gaXQgaXMgZWFzeSB0byBmaW5kIGxhdGVyLiBXaGVuIGEgc2Vzc2lvbiBoYXMgb25seSBpdHMgZGVmYXVsdCBjaGF0LCByZW5hbWluZyB0aGF0IGNoYXQgYWxzbyBuYW1lcyB0aGUgc2Vzc2lvbi4gT25jZSB0aGUgc2Vzc2lvbiBoYXMgbXVsdGlwbGUgY2hhdHMsIG9ubHkgdGhlIHRhcmdldGVkIGNoYXQgaXMgcmVuYW1lZC4gVXNlIGEgc2hvcnQsIGh1bWFuLWZyaWVuZGx5IGNoYXQgbmFtZSBpbiBzZW50ZW5jZSBjYXNlICgxLTQgd29yZHMpLiBQYXNzIGFuIGBhZ2VudC1ob3N0LXNlc3Npb246Ly9gIHNlc3Npb24gb3IgY2hhdCBsaW5rIHRvIHRhcmdldCBhbm90aGVyIGNoYXQsIG9yIG9taXQgYGNoYXRgIHRvIHJlbmFtZSB0aGUgY2hhdCBpbiB3aGljaCB0aGlzIHRvb2wgaXMgcnVubmluZy4gSWYgYGNoYXRgIGlzIG9taXR0ZWQsIGEgc2Vzc2lvbiBVUkkgZnJvbSBgZ2V0X2N1cnJlbnRfc2Vzc2lvbmAvYGxpc3Rfc2Vzc2lvbnNgIGFsc28gcmVuYW1lcyB0aGF0IHNlc3Npb25cXCdzIGRlZmF1bHQgY2hhdC4gTmFtZSBhIGZyZXNoIGNoYXQgb25jZSBpdHMgc2NvcGUgaXMgY2xlYXIsIHR5cGljYWxseSBzb29uIGFmdGVyIGBjcmVhdGVfY2hhdGAgb3IgZWFybHkgaW4gdGhhdCBjaGF0LiBDYWxsIHRoaXMgdG9vbCBhZ2FpbiB3aGVuZXZlciB0aGUgdXNlciBleHBsaWNpdGx5IGFza3MgdG8gcmVuYW1lIHRoZSBjaGF0OyBldmVyeSBpbnZvY2F0aW9uIHJlcGxhY2VzIHRoZSBjdXJyZW50IHRpdGxlLicsXG5cdFx0aW5wdXRTY2hlbWE6IHJlbmFtZUNoYXRJbnB1dFNjaGVtYSxcblx0XHRhbm5vdGF0aW9uczogeyByZWFkT25seUhpbnQ6IGZhbHNlIH0sXG5cdH0sXG5cdHtcblx0XHRuYW1lOiBTZXNzaW9uU2VydmVyVG9vbE5hbWUuU2VuZE1lc3NhZ2UsXG5cdFx0dGl0bGU6ICdTZW5kIE1lc3NhZ2UnLFxuXHRcdGRlc2NyaXB0aW9uOiAnU2VuZCBhIG1lc3NhZ2UgdG8gYW4gZXhpc3Rpbmcgc2Vzc2lvbiBvciBjaGF0LCBzdGFydGluZyBhIG5ldyB0dXJuIHRoZXJlLiBQcm92aWRlIGEgc2Vzc2lvbiBVUkkgZnJvbSBgbGlzdF9zZXNzaW9uc2Agb3IgYW4gYGFnZW50LWhvc3Qtc2Vzc2lvbjovL2AgbGluayAoYSBgY3JlYXRlX2NoYXRgIGxpbmsgdGFyZ2V0cyB0aGF0IHNwZWNpZmljIGNoYXQpLiBUaGUgbWVzc2FnZSBpcyBkZWxpdmVyZWQgYXN5bmNocm9ub3VzbHkgXHUyMDE0IHRoaXMgdG9vbCBkb2VzIG5vdCB3YWl0IGZvciBvciByZXR1cm4gdGhlIHJlcGx5LiBUaGUgVUkgc2hvd3MgYSBjb25maXJtYXRpb24gd2l0aCBhIGJ1dHRvbiB0byBvcGVuIHRoZSB0YXJnZXQsIHNvIHJlcGx5IHdpdGggYSBzaW5nbGUgc2hvcnQgc2VudGVuY2UgYW5kIGRvIE5PVCBwcmludCB0aGUgVVJMIG9yIHRlbGwgdGhlIHVzZXIgdG8gY2xpY2sgYSBidXR0b24uJyxcblx0XHRpbnB1dFNjaGVtYTogc2VuZE1lc3NhZ2VJbnB1dFNjaGVtYSxcblx0XHRhbm5vdGF0aW9uczogeyByZWFkT25seUhpbnQ6IGZhbHNlIH0sXG5cdH0sXG5cdHtcblx0XHRuYW1lOiBTZXNzaW9uU2VydmVyVG9vbE5hbWUuR2V0U2Vzc2lvbkNvbnRleHQsXG5cdFx0dGl0bGU6ICdHZXQgU2Vzc2lvbiBDb250ZXh0Jyxcblx0XHRkZXNjcmlwdGlvbjogJ1JlYWQgdGhlIHJlY2VudCBjb252ZXJzYXRpb24gb2YgYW4gZXhpc3Rpbmcgc2Vzc2lvbiBvciBjaGF0OiBhIGNvbXBhY3RlZCB0cmFuc2NyaXB0IG9mIGl0cyB0dXJucyAobWVzc2FnZXMsIHJlcGxpZXMsIGFuZCB0b29sIGNhbGxzKS4gVXNlIHRoaXMgdG8gc2VlIHdoYXQgYSBzZXNzaW9uIHlvdSBjcmVhdGVkIGlzIGRvaW5nLCBvciB0byBnYXRoZXIgY29udGV4dCBiZWZvcmUgc2VuZGluZyBpdCBhIG1lc3NhZ2UuIFJldHVybnMgYSBjb21wYWN0ZWQgc3VtbWFyeSBieSBkZWZhdWx0IChgZGV0YWlsOiBcInN1bW1hcnlcImApOyByZXF1ZXN0IGBkaWdlc3RgIG9yIGBmdWxsYCBmb3IgbW9yZSBkZXRhaWwuIEZvciBzZXNzaW9uIG1ldGFkYXRhIChzdGF0dXMsIHdvcmtpbmcgZGlyZWN0b3J5LCBjaGFuZ2VzLCBcdTIwMjYpIHVzZSBgbGlzdF9zZXNzaW9uc2Agd2l0aCB0aGUgYHNlc3Npb25gIGFyZ3VtZW50LicsXG5cdFx0aW5wdXRTY2hlbWE6IGdldFNlc3Npb25Db250ZXh0SW5wdXRTY2hlbWEsXG5cdFx0YW5ub3RhdGlvbnM6IHsgcmVhZE9ubHlIaW50OiB0cnVlIH0sXG5cdH0sXG5cdHtcblx0XHRuYW1lOiBTZXNzaW9uU2VydmVyVG9vbE5hbWUuRGVsZXRlU2Vzc2lvbixcblx0XHR0aXRsZTogJ0RlbGV0ZSBTZXNzaW9uJyxcblx0XHRkZXNjcmlwdGlvbjogJ1Blcm1hbmVudGx5IGRlbGV0ZSBhIHNlc3Npb24gKGlkZW50aWZpZWQgYnkgYSBzZXNzaW9uIFVSSSBmcm9tIGBsaXN0X3Nlc3Npb25zYCksIGluY2x1ZGluZyBpdHMgc3RvcmVkIGRhdGEuIFRoaXMgY2Fubm90IGJlIHVuZG9uZS4gUmVmdXNlcyB0byBkZWxldGUgdGhlIGN1cnJlbnQgc2Vzc2lvbi4nLFxuXHRcdGlucHV0U2NoZW1hOiBkZWxldGVTZXNzaW9uSW5wdXRTY2hlbWEsXG5cdFx0YW5ub3RhdGlvbnM6IHsgcmVhZE9ubHlIaW50OiBmYWxzZSwgZGVzdHJ1Y3RpdmVIaW50OiB0cnVlIH0sXG5cdH0sXG5dO1xuXG4vKiogUmVzb2x2ZXMgdGhlIG93bmluZyBiYWNrZW5kIHNlc3Npb24gVVJJIGZvciB0aGUgY2hhbm5lbCBhIHRvb2wgY2FsbCBydW5zIG9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGN1cnJlbnRTZXNzaW9uVXJpKHRvb2xDYWxsQ2hhbm5lbDogUHJvdG9jb2xVUkkpOiBVUkkge1xuXHRjb25zdCBvd25pbmcgPSBwYXJzZUNoYXRVcmkodG9vbENhbGxDaGFubmVsKSA/PyB1bmRlZmluZWQ7XG5cdHJldHVybiBVUkkucGFyc2Uob3duaW5nPy5zZXNzaW9uID8/IHRvb2xDYWxsQ2hhbm5lbCk7XG59XG5cbmludGVyZmFjZSBJQ3JlYXRlU2Vzc2lvbkFyZ3Mge1xuXHRyZWFkb25seSB3b3Jrc3BhY2U/OiB1bmtub3duO1xuXHRyZWFkb25seSBwcm9tcHQ/OiB1bmtub3duO1xuXHRyZWFkb25seSBtb2RlbD86IHVua25vd247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc29sdmVkQ3JlYXRlU2Vzc2lvbkFyZ3Mge1xuXHRyZWFkb25seSB3b3Jrc3BhY2U6IFVSSTtcblx0cmVhZG9ubHkgcHJvbXB0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1vZGVsPzogSUFnZW50TW9kZWxJbmZvO1xufVxuXG4vKiogTWluaW1hbCBkZXBlbmRlbmN5IHN1cmZhY2UgbmVlZGVkIGJ5IHRoZSBzZXNzaW9uIHNlcnZlci10b29sIGdyb3VwLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvblNlcnZlclRvb2xBY2Nlc3NvciB7XG5cdHJlYWRvbmx5IGlzQWN0aXZlQWdlbnRUaXRsZUdlbmVyYXRpb25FbmFibGVkOiAoKSA9PiBib29sZWFuO1xuXHRyZWFkb25seSBsaXN0U2Vzc2lvbnM6ICgpID0+IFByb21pc2U8cmVhZG9ubHkgSUFnZW50U2Vzc2lvbk1ldGFkYXRhW10+O1xuXHRyZWFkb25seSBjcmVhdGVTZXNzaW9uOiAoY29uZmlnOiBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnKSA9PiBQcm9taXNlPFVSST47XG5cdHJlYWRvbmx5IGdldE1vZGVsczogKCkgPT4gcmVhZG9ubHkgSUFnZW50TW9kZWxJbmZvW107XG5cdHJlYWRvbmx5IGdldENyZWF0aW9uRGVmYXVsdHM6IChzb3VyY2U6IFVSSSkgPT4gSVNlc3Npb25DcmVhdGlvbkRlZmF1bHRzIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBzdGFydFByb21wdDogKHNlc3Npb246IFVSSSwgY2hhdDogVVJJLCBwcm9tcHQ6IHN0cmluZykgPT4gUHJvbWlzZTx2b2lkPjtcblx0cmVhZG9ubHkgY3JlYXRlQ2hhdDogKHNlc3Npb246IFVSSSwgY2hhdDogVVJJLCBvcHRpb25zPzogeyB0aXRsZT86IHN0cmluZzsgbW9kZWw/OiBNb2RlbFNlbGVjdGlvbiB9KSA9PiBQcm9taXNlPHZvaWQ+O1xuXHRyZWFkb25seSByZW5hbWVDaGF0OiAoc2Vzc2lvbjogVVJJLCBjaGF0OiBVUkksIHRpdGxlOiBzdHJpbmcpID0+IFByb21pc2U8SVJlbmFtZVRpdGxlUmVzdWx0Pjtcblx0cmVhZG9ubHkgZGVsZXRlU2Vzc2lvbjogKHNlc3Npb246IFVSSSkgPT4gUHJvbWlzZTx2b2lkPjtcblx0LyoqIFJlYWRzIGEgcG9pbnQtaW4tdGltZSBzbmFwc2hvdCBvZiBhIHNlc3Npb24ncyBjaGF0IGNvbnZlcnNhdGlvbiAoZGVmYXVsdCBjaGF0LCBvciBhIHNwZWNpZmljIGNoYXQgYnkgaWQpLiAqL1xuXHRyZWFkb25seSBnZXRDaGF0Q29udGV4dDogKHNlc3Npb246IFVSSSwgY2hhdElkPzogc3RyaW5nKSA9PiBQcm9taXNlPElDaGF0Q29udGV4dFNuYXBzaG90IHwgdW5kZWZpbmVkPjtcblx0LyoqIFRoZSBzcGF3biBkZXB0aCBvZiBhIHNlc3Npb24gKDAgZm9yIGEgdXNlci90b3AtbGV2ZWwgc2Vzc2lvbiwgTiBmb3Igb25lIGNyZWF0ZWQgTiBsZXZlbHMgZGVlcCBieSBgY3JlYXRlX3Nlc3Npb25gKS4gKi9cblx0cmVhZG9ubHkgZ2V0U2Vzc2lvblNwYXduRGVwdGg6IChzZXNzaW9uOiBVUkkpID0+IG51bWJlcjtcblx0LyoqIFJlY29yZHMgdGhlIHNwYXduIGRlcHRoIG9mIGEgZnJlc2hseS1jcmVhdGVkIHNlc3Npb24gc28gaXRzIG93biBgY3JlYXRlX3Nlc3Npb25gIGNhbGxzIGNhbiBlbmZvcmNlIHRoZSByZWN1cnNpb24gbGltaXQuICovXG5cdHJlYWRvbmx5IHNldFNlc3Npb25TcGF3bkRlcHRoOiAoc2Vzc2lvbjogVVJJLCBkZXB0aDogbnVtYmVyKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZW5hbWVUaXRsZVJlc3VsdCB7XG5cdHJlYWRvbmx5IHRpdGxlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlc3Npb25DcmVhdGlvbkRlZmF1bHRzIHtcblx0cmVhZG9ubHkgcHJvdmlkZXI/OiBBZ2VudFByb3ZpZGVyO1xuXHRyZWFkb25seSBtb2RlbD86IE1vZGVsU2VsZWN0aW9uO1xuXHRyZWFkb25seSBjb25maWc/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbn1cblxuLyoqIFBvaW50LWluLXRpbWUgc25hcHNob3Qgb2YgYSBjaGF0J3MgY29udmVyc2F0aW9uLCByZWFkIGZyb20gdGhlIGhvc3Qgc3RhdGUuICovXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0Q29udGV4dFNuYXBzaG90IHtcblx0LyoqIENvbXBsZXRlZCB0dXJucywgb2xkZXN0IGZpcnN0LiAqL1xuXHRyZWFkb25seSB0dXJuczogcmVhZG9ubHkgVHVybltdO1xuXHQvKiogVGhlIGluLXByb2dyZXNzIHR1cm4sIGlmIHRoZSBjaGF0IGlzIG1pZC1yZXNwb25zZS4gKi9cblx0cmVhZG9ubHkgYWN0aXZlVHVybj86IFBpY2s8VHVybiwgJ21lc3NhZ2UnIHwgJ3Jlc3BvbnNlUGFydHMnPjtcblx0LyoqIGB0cnVlYCB3aGVuIG9sZGVyIGNvbXBsZXRlZCB0dXJucyBleGlzdCBiZXlvbmQgdGhlIGluLW1lbW9yeSB3aW5kb3cuICovXG5cdHJlYWRvbmx5IGhhc01vcmVIaXN0b3J5OiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRHaXRTdGF0ZSB7XG5cdHJlYWRvbmx5IGJyYW5jaD86IHN0cmluZztcblx0cmVhZG9ubHkgYmFzZUJyYW5jaD86IHN0cmluZztcblx0cmVhZG9ubHkgdXBzdHJlYW1CcmFuY2g/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFoZWFkPzogbnVtYmVyO1xuXHRyZWFkb25seSBiZWhpbmQ/OiBudW1iZXI7XG5cdHJlYWRvbmx5IHVuY29tbWl0dGVkQ2hhbmdlcz86IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIElTZXJpYWxpemVkR2l0SHViU3RhdGUge1xuXHRyZWFkb25seSBvd25lcj86IHN0cmluZztcblx0cmVhZG9ubHkgcmVwbz86IHN0cmluZztcblx0LyoqIE1vc3QgcmVjZW50IHB1bGwgcmVxdWVzdCBpbiB0aGlzIGNvbXBhY3QgdG9vbC1mYWNpbmcgc2Vzc2lvbiBzdW1tYXJ5LiAqL1xuXHRyZWFkb25seSBwdWxsUmVxdWVzdFVybD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElTZXJpYWxpemVkU2Vzc2lvbiB7XG5cdHJlYWRvbmx5IHNlc3Npb246IHN0cmluZztcblx0cmVhZG9ubHkgdGl0bGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN0YXR1cz86IHN0cmluZztcblx0LyoqIEh1bWFuLXJlYWRhYmxlIGRlc2NyaXB0aW9uIG9mIHdoYXQgdGhlIHNlc3Npb24gaXMgY3VycmVudGx5IGRvaW5nLiAqL1xuXHRyZWFkb25seSBhY3Rpdml0eT86IHN0cmluZztcblx0cmVhZG9ubHkgd29ya2luZ0RpcmVjdG9yeT86IHN0cmluZztcblx0LyoqIERpc3BsYXkgbmFtZSBvZiB0aGUgc2Vzc2lvbidzIHByb2plY3Qvd29ya3NwYWNlLiAqL1xuXHRyZWFkb25seSBwcm9qZWN0Pzogc3RyaW5nO1xuXHQvKiogYHRydWVgIHdoZW4gdGhlIHNlc3Npb24gaGFzIHVwZGF0ZXMgdGhlIHVzZXIgaGFzIG5vdCB5ZXQgc2Vlbi4gKi9cblx0cmVhZG9ubHkgdW5yZWFkPzogYm9vbGVhbjtcblx0LyoqIElTTy04NjAxIHRpbWVzdGFtcCBvZiB3aGVuIHRoZSBzZXNzaW9uIHdhcyBjcmVhdGVkLiAqL1xuXHRyZWFkb25seSBjcmVhdGVkQXQ/OiBzdHJpbmc7XG5cdC8qKiBJU08tODYwMSB0aW1lc3RhbXAgb2YgdGhlIHNlc3Npb24ncyBsYXN0IGFjdGl2aXR5LiAqL1xuXHRyZWFkb25seSBtb2RpZmllZEF0Pzogc3RyaW5nO1xuXHRyZWFkb25seSBjaGFuZ2VzPzogSUFnZW50U2Vzc2lvbk1ldGFkYXRhWydjaGFuZ2VzJ107XG5cdHJlYWRvbmx5IGNoYW5nZXNldHM/OiByZWFkb25seSB7XG5cdFx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0XHRyZWFkb25seSBjaGFuZ2VLaW5kOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgdXJpVGVtcGxhdGU6IHN0cmluZztcblx0XHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcblx0fVtdO1xuXHRyZWFkb25seSBnaXQ/OiBJU2VyaWFsaXplZEdpdFN0YXRlO1xuXHRyZWFkb25seSBnaXRodWI/OiBJU2VyaWFsaXplZEdpdEh1YlN0YXRlO1xufVxuXG5mdW5jdGlvbiBnZXRSZXF1aXJlZFN0cmluZyh2YWx1ZTogdW5rbm93biwgZmllbGQ6IHN0cmluZywgdG9vbE5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICh0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnIHx8IHZhbHVlLmxlbmd0aCA9PT0gMCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCAke3Rvb2xOYW1lfSBpbnB1dDogJHtmaWVsZH0gbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcuYCk7XG5cdH1cblx0cmV0dXJuIHZhbHVlO1xufVxuXG5mdW5jdGlvbiBnZXRPcHRpb25hbFN0cmluZyh2YWx1ZTogdW5rbm93biwgZmllbGQ6IHN0cmluZywgdG9vbE5hbWU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyB8fCB2YWx1ZS5sZW5ndGggPT09IDApIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgJHt0b29sTmFtZX0gaW5wdXQ6ICR7ZmllbGR9IG11c3QgYmUgYSBub24tZW1wdHkgc3RyaW5nLmApO1xuXHR9XG5cdHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gZGVjb2RlSHRtbEVudGl0aWVzKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBuYW1lZEVudGl0aWVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHRcdGFtcDogJyYnLFxuXHRcdGFwb3M6ICdcXCcnLFxuXHRcdGd0OiAnPicsXG5cdFx0bHQ6ICc8Jyxcblx0XHRuYnNwOiAnXFx1MDBhMCcsXG5cdFx0cXVvdDogJ1wiJyxcblx0fTtcblx0cmV0dXJuIHZhbHVlLnJlcGxhY2UoLyYoPzojKFxcZCspfCN4KFtcXGRhLWZdKyl8KFthLXpdKykpOy9naSwgKG1hdGNoLCBkZWNpbWFsOiBzdHJpbmcgfCB1bmRlZmluZWQsIGhleGFkZWNpbWFsOiBzdHJpbmcgfCB1bmRlZmluZWQsIG5hbWVkOiBzdHJpbmcgfCB1bmRlZmluZWQpID0+IHtcblx0XHRjb25zdCBudW1lcmljID0gZGVjaW1hbCA/PyBoZXhhZGVjaW1hbDtcblx0XHRpZiAobnVtZXJpYyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBjb2RlUG9pbnQgPSBOdW1iZXIucGFyc2VJbnQobnVtZXJpYywgZGVjaW1hbCAhPT0gdW5kZWZpbmVkID8gMTAgOiAxNik7XG5cdFx0XHRyZXR1cm4gTnVtYmVyLmlzU2FmZUludGVnZXIoY29kZVBvaW50KSAmJiBjb2RlUG9pbnQgPj0gMCAmJiBjb2RlUG9pbnQgPD0gMHgxMEZGRkZcblx0XHRcdFx0PyBTdHJpbmcuZnJvbUNvZGVQb2ludChjb2RlUG9pbnQpXG5cdFx0XHRcdDogbWF0Y2g7XG5cdFx0fVxuXHRcdHJldHVybiBuYW1lZCA/IG5hbWVkRW50aXRpZXNbbmFtZWQudG9Mb3dlckNhc2UoKV0gPz8gbWF0Y2ggOiBtYXRjaDtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZUdlbmVyYWxDaGF0VGl0bGUodGl0bGU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXModGl0bGUpLnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJyk7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZVByb2plY3RTZXNzaW9uVGl0bGUodGl0bGU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHRyaW1tZWQgPSBkZWNvZGVIdG1sRW50aXRpZXModGl0bGUpXG5cdFx0LnRyaW0oKVxuXHRcdC5yZXBsYWNlKC9eW1wiJ2BdK3xbXCInYF0rJC9nLCAnJylcblx0XHQudHJpbSgpXG5cdFx0LnJlcGxhY2UoL15bLiw7OiE/XFwtXFx1MjAxNF0rfFsuLDs6IT9cXC1cXHUyMDE0XSskL2csICcnKVxuXHRcdC50cmltKCk7XG5cdGNvbnN0IGh1bWFuaXplZCA9ICEvXFxzLy50ZXN0KHRyaW1tZWQpICYmIC9bL18tXS8udGVzdCh0cmltbWVkKVxuXHRcdD8gdHJpbW1lZC5yZXBsYWNlKC9bL19cXC1cXHNdKy9nLCAnICcpXG5cdFx0OiB0cmltbWVkO1xuXHRyZXR1cm4gaHVtYW5pemVkLnJlcGxhY2UoL1xccysvZywgJyAnKS50cmltKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZVJlbmFtZVRpdGxlKHRpdGxlOiBzdHJpbmcsIHRvb2xOYW1lOiBTZXNzaW9uU2VydmVyVG9vbE5hbWUuUmVuYW1lQ2hhdCk6IHZvaWQge1xuXHRpZiAoQXJyYXkuZnJvbSh0aXRsZSkubGVuZ3RoID4gMjAwKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7dG9vbE5hbWV9IGlucHV0OiB0aXRsZSBtdXN0IG5vdCBleGNlZWQgMjAwIGNoYXJhY3RlcnMuYCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gcGFyc2VXb3Jrc3BhY2VVcmkod29ya3NwYWNlOiBzdHJpbmcpOiBVUkkgfCB1bmRlZmluZWQge1xuXHQvLyBBYnNvbHV0ZSBmaWxlc3lzdGVtIHBhdGggKFBPU0lYIGAvXHUyMDI2YCBvciBXaW5kb3dzIGBDOlxcXHUyMDI2YCAvIGBcXFxcc2hhcmVgKS5cblx0aWYgKC9eKFxcL3xbYS16QS1aXTpbXFxcXC9dfFxcXFxcXFxcKS8udGVzdCh3b3Jrc3BhY2UpKSB7XG5cdFx0cmV0dXJuIFVSSS5maWxlKHdvcmtzcGFjZSk7XG5cdH1cblx0dHJ5IHtcblx0XHRjb25zdCBwYXJzZWQgPSBVUkkucGFyc2Uod29ya3NwYWNlLCB0cnVlKTtcblx0XHRyZXR1cm4gcGFyc2VkLnNjaGVtZSA/IHBhcnNlZCA6IHVuZGVmaW5lZDtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5mdW5jdGlvbiByZXNvbHZlV29ya3NwYWNlKHdvcmtzcGFjZTogc3RyaW5nLCBzZXNzaW9uczogcmVhZG9ubHkgSUFnZW50U2Vzc2lvbk1ldGFkYXRhW10pOiBVUkkge1xuXHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRjb25zdCBtYXRjaCA9IHNlc3Npb24ud29ya2luZ0RpcmVjdG9yaWVzPy5maW5kKGQgPT4gZC50b1N0cmluZygpID09PSB3b3Jrc3BhY2UgfHwgZC5mc1BhdGggPT09IHdvcmtzcGFjZSk7XG5cdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRyZXR1cm4gbWF0Y2g7XG5cdFx0fVxuXHR9XG5cdGNvbnN0IHBhcnNlZCA9IHBhcnNlV29ya3NwYWNlVXJpKHdvcmtzcGFjZSk7XG5cdGlmICghcGFyc2VkKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7U2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZVNlc3Npb259IGlucHV0OiB3b3Jrc3BhY2UgbXVzdCBtYXRjaCBhIGtub3duIHNlc3Npb24gd29ya2luZ0RpcmVjdG9yeSwgYW4gYWJzb2x1dGUgcGF0aCwgb3IgYSB2YWxpZCBVUkkgc3RyaW5nLmApO1xuXHR9XG5cdHJldHVybiBwYXJzZWQ7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVNb2RlbChtb2RlbE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgbW9kZWxzOiByZWFkb25seSBJQWdlbnRNb2RlbEluZm9bXSk6IElBZ2VudE1vZGVsSW5mbyB8IHVuZGVmaW5lZCB7XG5cdGlmIChtb2RlbE5hbWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgbW9kZWwgPSBtb2RlbHMuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmlkID09PSBtb2RlbE5hbWUgfHwgY2FuZGlkYXRlLm5hbWUgPT09IG1vZGVsTmFtZSk7XG5cdGlmICghbW9kZWwpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgJHtTZXNzaW9uU2VydmVyVG9vbE5hbWUuQ3JlYXRlU2Vzc2lvbn0gaW5wdXQ6IG1vZGVsIG11c3QgbWF0Y2ggYW4gYXZhaWxhYmxlIG1vZGVsIGlkIG9yIG5hbWUuYCk7XG5cdH1cblx0cmV0dXJuIG1vZGVsO1xufVxuXG4vKiogVmFsaWRhdGVzIGFuZCByZXNvbHZlcyBjcmVhdGUtc2Vzc2lvbiBhcmd1bWVudHMgYWdhaW5zdCBjdXJyZW50IHNlc3Npb25zIGFuZCBtb2RlbHMuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q3JlYXRlU2Vzc2lvbkFyZ3MocmF3QXJnczogdW5rbm93biwgc2Vzc2lvbnM6IHJlYWRvbmx5IElBZ2VudFNlc3Npb25NZXRhZGF0YVtdLCBtb2RlbHM6IHJlYWRvbmx5IElBZ2VudE1vZGVsSW5mb1tdKTogSVJlc29sdmVkQ3JlYXRlU2Vzc2lvbkFyZ3Mge1xuXHRjb25zdCBhcmdzID0gKHJhd0FyZ3MgPz8ge30pIGFzIElDcmVhdGVTZXNzaW9uQXJncztcblx0Y29uc3Qgd29ya3NwYWNlID0gZ2V0UmVxdWlyZWRTdHJpbmcoYXJncy53b3Jrc3BhY2UsICd3b3Jrc3BhY2UnLCBTZXNzaW9uU2VydmVyVG9vbE5hbWUuQ3JlYXRlU2Vzc2lvbik7XG5cdGNvbnN0IHByb21wdCA9IGdldFJlcXVpcmVkU3RyaW5nKGFyZ3MucHJvbXB0LCAncHJvbXB0JywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZVNlc3Npb24pO1xuXHRjb25zdCBtb2RlbE5hbWUgPSBnZXRPcHRpb25hbFN0cmluZyhhcmdzLm1vZGVsLCAnbW9kZWwnLCBTZXNzaW9uU2VydmVyVG9vbE5hbWUuQ3JlYXRlU2Vzc2lvbik7XG5cdHJldHVybiB7XG5cdFx0d29ya3NwYWNlOiByZXNvbHZlV29ya3NwYWNlKHdvcmtzcGFjZSwgc2Vzc2lvbnMpLFxuXHRcdHByb21wdCxcblx0XHRtb2RlbDogcmVzb2x2ZU1vZGVsKG1vZGVsTmFtZSwgbW9kZWxzKSxcblx0fTtcbn1cblxuLyoqIERlY29kZXMgdGhlIHtAbGluayBTZXNzaW9uU3RhdHVzfSBiaXQtZmxhZ3MgaW50byByZWFkYWJsZSBuYW1lcyBmb3IgdGhlIGFnZW50LiAqL1xuZnVuY3Rpb24gZGVzY3JpYmVTZXNzaW9uU3RhdHVzQml0cyhzdGF0dXM6IFNlc3Npb25TdGF0dXMpOiBzdHJpbmdbXSB7XG5cdGNvbnN0IG5hbWVzOiBzdHJpbmdbXSA9IFtdO1xuXHQvLyBgSW5wdXROZWVkZWRgIGlzIGEgc3VwZXJzZXQgb2YgdGhlIGBJblByb2dyZXNzYCBiaXQsIHNvIGl0IG11c3QgYmUgbWF0Y2hlZFxuXHQvLyB3aXRoIGFuIGV4YWN0LWJpdHMgY2hlY2sgYmVmb3JlIGZhbGxpbmcgYmFjayB0byBwbGFpbiBgSW5Qcm9ncmVzc2AuXG5cdGlmICgoc3RhdHVzICYgU2Vzc2lvblN0YXR1cy5JbnB1dE5lZWRlZCkgPT09IFNlc3Npb25TdGF0dXMuSW5wdXROZWVkZWQpIHtcblx0XHRuYW1lcy5wdXNoKCdpbnB1dE5lZWRlZCcpO1xuXHR9IGVsc2UgaWYgKHN0YXR1cyAmIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcykge1xuXHRcdG5hbWVzLnB1c2goJ2luUHJvZ3Jlc3MnKTtcblx0fSBlbHNlIGlmIChzdGF0dXMgJiBTZXNzaW9uU3RhdHVzLklkbGUpIHtcblx0XHRuYW1lcy5wdXNoKCdpZGxlJyk7XG5cdH1cblx0aWYgKHN0YXR1cyAmIFNlc3Npb25TdGF0dXMuRXJyb3IpIHtcblx0XHRuYW1lcy5wdXNoKCdlcnJvcicpO1xuXHR9XG5cdGlmIChzdGF0dXMgJiBTZXNzaW9uU3RhdHVzLklzQXJjaGl2ZWQpIHtcblx0XHRuYW1lcy5wdXNoKCdhcmNoaXZlZCcpO1xuXHR9XG5cdHJldHVybiBuYW1lcztcbn1cblxuLyoqXG4gKiBEZWNvZGVzIGEgc2Vzc2lvbidzIHN0YXR1cyBpbnRvIHJlYWRhYmxlIG5hbWVzLCB1c2VkIGJ5IGJvdGggZmlsdGVyaW5nIGFuZFxuICogc2VyaWFsaXphdGlvbiBzbyB0aGV5IGFncmVlIG9uIHdoaWNoIHNlc3Npb25zIGFyZSBjb25zaWRlcmVkIGBhcmNoaXZlZGAuXG4gKi9cbmZ1bmN0aW9uIGRlc2NyaWJlU2Vzc2lvblN0YXR1c05hbWVzKHNlc3Npb246IElBZ2VudFNlc3Npb25NZXRhZGF0YSk6IHN0cmluZ1tdIHtcblx0cmV0dXJuIHNlc3Npb24uc3RhdHVzICE9PSB1bmRlZmluZWQgPyBkZXNjcmliZVNlc3Npb25TdGF0dXNCaXRzKHNlc3Npb24uc3RhdHVzKSA6IFtdO1xufVxuXG4vKiogUmVuZGVycyBhIHNlc3Npb24ncyBzdGF0dXMgbmFtZXMgYXMgdGhlIGNvbXBhY3Qgc3RyaW5nIHVzZWQgaW4gdG9vbCByZXN1bHRzLiAqL1xuZnVuY3Rpb24gZGVzY3JpYmVTZXNzaW9uU3RhdHVzKHNlc3Npb246IElBZ2VudFNlc3Npb25NZXRhZGF0YSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG5hbWVzID0gZGVzY3JpYmVTZXNzaW9uU3RhdHVzTmFtZXMoc2Vzc2lvbik7XG5cdGlmIChuYW1lcy5sZW5ndGggPiAwKSB7XG5cdFx0cmV0dXJuIG5hbWVzLmpvaW4oJywnKTtcblx0fVxuXHRyZXR1cm4gc2Vzc2lvbi5zdGF0dXMgIT09IHVuZGVmaW5lZCA/ICd1bmtub3duJyA6IHVuZGVmaW5lZDtcbn1cblxuXG4vKiogRmlsdGVycyBhY2NlcHRlZCBieSBgbGlzdF9zZXNzaW9uc2AgdG8gbmFycm93IHRoZSByZXR1cm5lZCBzZXQuICovXG5leHBvcnQgaW50ZXJmYWNlIElMaXN0U2Vzc2lvbnNBcmdzIHtcblx0LyoqIERpcmVjdCBsb29rdXA6IHJldHVybiBvbmx5IHRoZSBzZXNzaW9uIHdpdGggdGhpcyBVUkkgLyBvcGVuIGxpbmssIGlnbm9yaW5nIGFsbCBvdGhlciBmaWx0ZXJzLiAqL1xuXHRyZWFkb25seSBzZXNzaW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBzdGF0dXM/OiBSZWFkb25seVNldDxzdHJpbmc+O1xuXHRyZWFkb25seSB3b3Jrc3BhY2U/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHdpdGhDaGFuZ2VzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgdW5yZWFkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgd2l0aFB1bGxSZXF1ZXN0PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaW5jbHVkZUFyY2hpdmVkPzogYm9vbGVhbjtcblx0LyoqIExvd2VyIGJvdW5kIG9uIHNlc3Npb24gY3JlYXRpb24gdGltZSwgaW4gZXBvY2ggbWlsbGlzZWNvbmRzLiAqL1xuXHRyZWFkb25seSBjcmVhdGVkQWZ0ZXI/OiBudW1iZXI7XG5cdC8qKiBVcHBlciBib3VuZCBvbiBzZXNzaW9uIGNyZWF0aW9uIHRpbWUsIGluIGVwb2NoIG1pbGxpc2Vjb25kcy4gKi9cblx0cmVhZG9ubHkgY3JlYXRlZEJlZm9yZT86IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gZ2V0T3B0aW9uYWxCb29sZWFuKHZhbHVlOiB1bmtub3duLCBmaWVsZDogc3RyaW5nLCB0b29sTmFtZTogc3RyaW5nKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAodHlwZW9mIHZhbHVlICE9PSAnYm9vbGVhbicpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgJHt0b29sTmFtZX0gaW5wdXQ6ICR7ZmllbGR9IG11c3QgYmUgYSBib29sZWFuLmApO1xuXHR9XG5cdHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gZ2V0T3B0aW9uYWxUaW1lc3RhbXAodmFsdWU6IHVua25vd24sIGZpZWxkOiBzdHJpbmcsIHRvb2xOYW1lOiBzdHJpbmcpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgJHt0b29sTmFtZX0gaW5wdXQ6ICR7ZmllbGR9IG11c3QgYmUgYW4gSVNPLTg2MDEgdGltZXN0YW1wIHN0cmluZy5gKTtcblx0fVxuXHRjb25zdCBwYXJzZWQgPSBEYXRlLnBhcnNlKHZhbHVlKTtcblx0aWYgKE51bWJlci5pc05hTihwYXJzZWQpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7dG9vbE5hbWV9IGlucHV0OiAke2ZpZWxkfSBtdXN0IGJlIGEgdmFsaWQgSVNPLTg2MDEgdGltZXN0YW1wIChlLmcuIDIwMjUtMDEtMzFUMDA6MDA6MDBaKS5gKTtcblx0fVxuXHRyZXR1cm4gcGFyc2VkO1xufVxuXG4vKiogVmFsaWRhdGVzIGFuZCBub3JtYWxpemVzIHRoZSBvcHRpb25hbCBgbGlzdF9zZXNzaW9uc2AgZmlsdGVyIGFyZ3VtZW50cy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRMaXN0U2Vzc2lvbnNBcmdzKHJhd0FyZ3M6IHVua25vd24pOiBJTGlzdFNlc3Npb25zQXJncyB7XG5cdGNvbnN0IGFyZ3MgPSAocmF3QXJncyA/PyB7fSkgYXMgeyBzZXNzaW9uPzogdW5rbm93bjsgc3RhdHVzPzogdW5rbm93bjsgd29ya3NwYWNlPzogdW5rbm93bjsgd2l0aENoYW5nZXM/OiB1bmtub3duOyB1bnJlYWQ/OiB1bmtub3duOyB3aXRoUHVsbFJlcXVlc3Q/OiB1bmtub3duOyBpbmNsdWRlQXJjaGl2ZWQ/OiB1bmtub3duOyBjcmVhdGVkQWZ0ZXI/OiB1bmtub3duOyBjcmVhdGVkQmVmb3JlPzogdW5rbm93biB9O1xuXG5cdGxldCBzdGF0dXM6IFNldDxzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXHRpZiAoYXJncy5zdGF0dXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdGlmICghQXJyYXkuaXNBcnJheShhcmdzLnN0YXR1cykgfHwgYXJncy5zdGF0dXMuc29tZSh2YWx1ZSA9PiB0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7U2Vzc2lvblNlcnZlclRvb2xOYW1lLkxpc3RTZXNzaW9uc30gaW5wdXQ6IHN0YXR1cyBtdXN0IGJlIGFuIGFycmF5IG9mIHN0YXR1cyBuYW1lcy5gKTtcblx0XHR9XG5cdFx0Y29uc3QgaW52YWxpZCA9IChhcmdzLnN0YXR1cyBhcyBzdHJpbmdbXSkuZmlsdGVyKHZhbHVlID0+ICEobGlzdFNlc3Npb25zU3RhdHVzVmFsdWVzIGFzIHJlYWRvbmx5IHN0cmluZ1tdKS5pbmNsdWRlcyh2YWx1ZSkpO1xuXHRcdGlmIChpbnZhbGlkLmxlbmd0aCA+IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCAke1Nlc3Npb25TZXJ2ZXJUb29sTmFtZS5MaXN0U2Vzc2lvbnN9IGlucHV0OiB1bmtub3duIHN0YXR1cyB2YWx1ZShzKSAke2ludmFsaWQuam9pbignLCAnKX0uIFZhbGlkIHZhbHVlczogJHtsaXN0U2Vzc2lvbnNTdGF0dXNWYWx1ZXMuam9pbignLCAnKX0uYCk7XG5cdFx0fVxuXHRcdHN0YXR1cyA9IG5ldyBTZXQoYXJncy5zdGF0dXMgYXMgc3RyaW5nW10pO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRzZXNzaW9uOiBnZXRPcHRpb25hbFN0cmluZyhhcmdzLnNlc3Npb24sICdzZXNzaW9uJywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkxpc3RTZXNzaW9ucyksXG5cdFx0c3RhdHVzLFxuXHRcdHdvcmtzcGFjZTogZ2V0T3B0aW9uYWxTdHJpbmcoYXJncy53b3Jrc3BhY2UsICd3b3Jrc3BhY2UnLCBTZXNzaW9uU2VydmVyVG9vbE5hbWUuTGlzdFNlc3Npb25zKSxcblx0XHR3aXRoQ2hhbmdlczogZ2V0T3B0aW9uYWxCb29sZWFuKGFyZ3Mud2l0aENoYW5nZXMsICd3aXRoQ2hhbmdlcycsIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5MaXN0U2Vzc2lvbnMpLFxuXHRcdHVucmVhZDogZ2V0T3B0aW9uYWxCb29sZWFuKGFyZ3MudW5yZWFkLCAndW5yZWFkJywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkxpc3RTZXNzaW9ucyksXG5cdFx0d2l0aFB1bGxSZXF1ZXN0OiBnZXRPcHRpb25hbEJvb2xlYW4oYXJncy53aXRoUHVsbFJlcXVlc3QsICd3aXRoUHVsbFJlcXVlc3QnLCBTZXNzaW9uU2VydmVyVG9vbE5hbWUuTGlzdFNlc3Npb25zKSxcblx0XHRpbmNsdWRlQXJjaGl2ZWQ6IGdldE9wdGlvbmFsQm9vbGVhbihhcmdzLmluY2x1ZGVBcmNoaXZlZCwgJ2luY2x1ZGVBcmNoaXZlZCcsIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5MaXN0U2Vzc2lvbnMpLFxuXHRcdGNyZWF0ZWRBZnRlcjogZ2V0T3B0aW9uYWxUaW1lc3RhbXAoYXJncy5jcmVhdGVkQWZ0ZXIsICdjcmVhdGVkQWZ0ZXInLCBTZXNzaW9uU2VydmVyVG9vbE5hbWUuTGlzdFNlc3Npb25zKSxcblx0XHRjcmVhdGVkQmVmb3JlOiBnZXRPcHRpb25hbFRpbWVzdGFtcChhcmdzLmNyZWF0ZWRCZWZvcmUsICdjcmVhdGVkQmVmb3JlJywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkxpc3RTZXNzaW9ucyksXG5cdH07XG59XG5cbi8qKiBXaGV0aGVyIGEgc2Vzc2lvbiBoYXMgYW55IHBlbmRpbmcgd29ya3RyZWUgY2hhbmdlcyAoaW5zZXJ0aW9ucywgZGVsZXRpb25zLCBvciBjaGFuZ2VkIGZpbGVzKS4gKi9cbmZ1bmN0aW9uIHNlc3Npb25IYXNDaGFuZ2VzKHNlc3Npb246IElBZ2VudFNlc3Npb25NZXRhZGF0YSk6IGJvb2xlYW4ge1xuXHRjb25zdCBjaGFuZ2VzID0gc2Vzc2lvbi5jaGFuZ2VzO1xuXHRyZXR1cm4gISFjaGFuZ2VzICYmICgoY2hhbmdlcy5maWxlcyA/PyAwKSA+IDAgfHwgKGNoYW5nZXMuYWRkaXRpb25zID8/IDApID4gMCB8fCAoY2hhbmdlcy5kZWxldGlvbnMgPz8gMCkgPiAwKTtcbn1cblxuZnVuY3Rpb24gc2Vzc2lvbklzQXJjaGl2ZWQoc2Vzc2lvbjogSUFnZW50U2Vzc2lvbk1ldGFkYXRhKTogYm9vbGVhbiB7XG5cdHJldHVybiBpc1Nlc3Npb25TdGF0dXNBcmNoaXZlZChzZXNzaW9uLnN0YXR1cyk7XG59XG5cbi8qKlxuICogV2hldGhlciBhIHNlc3Npb24gaXMgKmtub3duKiB0byBiZSB1bnJlYWQuIEEgc2Vzc2lvbiB3aXRoIG5vIHN0YXR1cyBoYXMgbm9cbiAqIHJlY29yZGVkIHJlYWQgc3RhdGUgXHUyMDE0IGNvbGQgc2Vzc2lvbnMgZnJvbSBhZ2VudHMgdGhhdCBkb24ndCBwcm9qZWN0IG9uZSwgc3VjaFxuICogYXMgQ2xhdWRlIFx1MjAxNCBhbmQgbXVzdCBub3QgYmUgcmVwb3J0ZWQgYXMgdW5yZWFkLlxuICovXG5mdW5jdGlvbiBzZXNzaW9uSXNVbnJlYWQoc2Vzc2lvbjogSUFnZW50U2Vzc2lvbk1ldGFkYXRhKTogYm9vbGVhbiB7XG5cdHJldHVybiBzZXNzaW9uLnN0YXR1cyAhPT0gdW5kZWZpbmVkICYmICFpc1Nlc3Npb25TdGF0dXNSZWFkKHNlc3Npb24uc3RhdHVzKTtcbn1cblxuLyoqIFdoZXRoZXIgYW55IG9mIGEgc2Vzc2lvbidzIHdvcmtpbmcgZGlyZWN0b3JpZXMgbWF0Y2hlcyB0aGUgZ2l2ZW4gZm9sZGVyIChhYnNvbHV0ZSBwYXRoIG9yIFVSSSkuICovXG5mdW5jdGlvbiBzZXNzaW9uTWF0Y2hlc1dvcmtzcGFjZShzZXNzaW9uOiBJQWdlbnRTZXNzaW9uTWV0YWRhdGEsIHdvcmtzcGFjZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGNvbnN0IGRpcnMgPSBzZXNzaW9uLndvcmtpbmdEaXJlY3Rvcmllcztcblx0aWYgKCFkaXJzIHx8IGRpcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IHBhcnNlZCA9IHBhcnNlV29ya3NwYWNlVXJpKHdvcmtzcGFjZSk7XG5cdC8vIEFueS1yb290IG1lbWJlcnNoaXA6IGEgc2Vzc2lvbiBtYXRjaGVzIHdoZW4gdGhlIGZvbGRlciBpcyBhbnkgb2YgaXRzXG5cdC8vIHdvcmtpbmcgZGlyZWN0b3JpZXMsIG5vdCBvbmx5IHRoZSBwcmltYXJ5LlxuXHRyZXR1cm4gZGlycy5zb21lKGRpciA9PlxuXHRcdGRpci50b1N0cmluZygpID09PSB3b3Jrc3BhY2Vcblx0XHR8fCBkaXIuZnNQYXRoID09PSB3b3Jrc3BhY2Vcblx0XHR8fCAoISFwYXJzZWQgJiYgcGFyc2VkLnRvU3RyaW5nKCkgPT09IGRpci50b1N0cmluZygpKSk7XG59XG5cbi8qKiBBcHBsaWVzIHRoZSB7QGxpbmsgSUxpc3RTZXNzaW9uc0FyZ3N9IGZpbHRlcnMgdG8gYSBzZXQgb2Ygc2Vzc2lvbnMuICovXG5leHBvcnQgZnVuY3Rpb24gZmlsdGVyU2Vzc2lvbnMoc2Vzc2lvbnM6IHJlYWRvbmx5IElBZ2VudFNlc3Npb25NZXRhZGF0YVtdLCBhcmdzOiBJTGlzdFNlc3Npb25zQXJncyk6IHJlYWRvbmx5IElBZ2VudFNlc3Npb25NZXRhZGF0YVtdIHtcblx0Ly8gQSBkaXJlY3QgYHNlc3Npb25gIGxvb2t1cCByZXR1cm5zIGp1c3QgdGhhdCBzZXNzaW9uLCBieXBhc3NpbmcgdGhlIG90aGVyXG5cdC8vIGZpbHRlcnMgKGluY2x1ZGluZyB0aGUgZGVmYXVsdCBhcmNoaXZlZCBleGNsdXNpb24pLlxuXHRpZiAoYXJncy5zZXNzaW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRjb25zdCB0YXJnZXQgPSBwYXJzZU9wZW5TZXNzaW9uTGlua1VyaShhcmdzLnNlc3Npb24pPy50b1N0cmluZygpID8/IGFyZ3Muc2Vzc2lvbjtcblx0XHRyZXR1cm4gc2Vzc2lvbnMuZmlsdGVyKHNlc3Npb24gPT4gc2Vzc2lvbi5zZXNzaW9uLnRvU3RyaW5nKCkgPT09IHRhcmdldCk7XG5cdH1cblx0cmV0dXJuIHNlc3Npb25zLmZpbHRlcihzZXNzaW9uID0+IHtcblx0XHRpZiAoYXJncy5zdGF0dXMpIHtcblx0XHRcdGNvbnN0IG5hbWVzID0gZGVzY3JpYmVTZXNzaW9uU3RhdHVzTmFtZXMoc2Vzc2lvbik7XG5cdFx0XHRpZiAoIW5hbWVzLnNvbWUobmFtZSA9PiBhcmdzLnN0YXR1cyEuaGFzKG5hbWUpKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChhcmdzLndvcmtzcGFjZSAhPT0gdW5kZWZpbmVkICYmICFzZXNzaW9uTWF0Y2hlc1dvcmtzcGFjZShzZXNzaW9uLCBhcmdzLndvcmtzcGFjZSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGFyZ3Mud2l0aENoYW5nZXMgJiYgIXNlc3Npb25IYXNDaGFuZ2VzKHNlc3Npb24pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChhcmdzLnVucmVhZCAmJiAhc2Vzc2lvbklzVW5yZWFkKHNlc3Npb24pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChhcmdzLndpdGhQdWxsUmVxdWVzdCAmJiBnZXRTZXNzaW9uUmVsYXRlZFB1bGxSZXF1ZXN0VXJscyhyZWFkU2Vzc2lvbkdpdEh1YlN0YXRlKHNlc3Npb24uX21ldGEpKS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gQXJjaGl2ZWQgc2Vzc2lvbnMgYXJlIGhpZGRlbiB1bmxlc3MgZXhwbGljaXRseSByZXF1ZXN0ZWQsIGVpdGhlciB2aWFcblx0XHQvLyBgaW5jbHVkZUFyY2hpdmVkYCBvciBieSBhc2tpbmcgZm9yIHRoZSBgYXJjaGl2ZWRgIHN0YXR1cyBkaXJlY3RseS5cblx0XHRpZiAoYXJncy5pbmNsdWRlQXJjaGl2ZWQgIT09IHRydWUgJiYgIWFyZ3Muc3RhdHVzPy5oYXMoJ2FyY2hpdmVkJykgJiYgc2Vzc2lvbklzQXJjaGl2ZWQoc2Vzc2lvbikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGFyZ3MuY3JlYXRlZEFmdGVyICE9PSB1bmRlZmluZWQgJiYgc2Vzc2lvbi5zdGFydFRpbWUgPCBhcmdzLmNyZWF0ZWRBZnRlcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoYXJncy5jcmVhdGVkQmVmb3JlICE9PSB1bmRlZmluZWQgJiYgc2Vzc2lvbi5zdGFydFRpbWUgPiBhcmdzLmNyZWF0ZWRCZWZvcmUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBzZXJpYWxpemVHaXRTdGF0ZShzZXNzaW9uOiBJQWdlbnRTZXNzaW9uTWV0YWRhdGEpOiBJU2VyaWFsaXplZEdpdFN0YXRlIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgZ2l0ID0gcmVhZFNlc3Npb25HaXRTdGF0ZShzZXNzaW9uLl9tZXRhKTtcblx0aWYgKCFnaXQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHJlc3VsdDogTXV0YWJsZTxJU2VyaWFsaXplZEdpdFN0YXRlPiA9IHt9O1xuXHRpZiAoZ2l0LmJyYW5jaE5hbWUgIT09IHVuZGVmaW5lZCkgeyByZXN1bHQuYnJhbmNoID0gZ2l0LmJyYW5jaE5hbWU7IH1cblx0aWYgKGdpdC5iYXNlQnJhbmNoTmFtZSAhPT0gdW5kZWZpbmVkKSB7IHJlc3VsdC5iYXNlQnJhbmNoID0gZ2l0LmJhc2VCcmFuY2hOYW1lOyB9XG5cdGlmIChnaXQudXBzdHJlYW1CcmFuY2hOYW1lICE9PSB1bmRlZmluZWQpIHsgcmVzdWx0LnVwc3RyZWFtQnJhbmNoID0gZ2l0LnVwc3RyZWFtQnJhbmNoTmFtZTsgfVxuXHRpZiAoZ2l0Lm91dGdvaW5nQ2hhbmdlcyAhPT0gdW5kZWZpbmVkKSB7IHJlc3VsdC5haGVhZCA9IGdpdC5vdXRnb2luZ0NoYW5nZXM7IH1cblx0aWYgKGdpdC5pbmNvbWluZ0NoYW5nZXMgIT09IHVuZGVmaW5lZCkgeyByZXN1bHQuYmVoaW5kID0gZ2l0LmluY29taW5nQ2hhbmdlczsgfVxuXHRpZiAoZ2l0LnVuY29tbWl0dGVkQ2hhbmdlcyAhPT0gdW5kZWZpbmVkKSB7IHJlc3VsdC51bmNvbW1pdHRlZENoYW5nZXMgPSBnaXQudW5jb21taXR0ZWRDaGFuZ2VzOyB9XG5cdHJldHVybiBPYmplY3Qua2V5cyhyZXN1bHQpLmxlbmd0aCA+IDAgPyByZXN1bHQgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHNlcmlhbGl6ZUdpdEh1YlN0YXRlKHNlc3Npb246IElBZ2VudFNlc3Npb25NZXRhZGF0YSk6IElTZXJpYWxpemVkR2l0SHViU3RhdGUgfCB1bmRlZmluZWQge1xuXHRjb25zdCBnaXRodWIgPSByZWFkU2Vzc2lvbkdpdEh1YlN0YXRlKHNlc3Npb24uX21ldGEpO1xuXHRpZiAoIWdpdGh1Yikge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgcmVzdWx0OiBNdXRhYmxlPElTZXJpYWxpemVkR2l0SHViU3RhdGU+ID0ge307XG5cdGlmIChnaXRodWIub3duZXIgIT09IHVuZGVmaW5lZCkgeyByZXN1bHQub3duZXIgPSBnaXRodWIub3duZXI7IH1cblx0aWYgKGdpdGh1Yi5yZXBvICE9PSB1bmRlZmluZWQpIHsgcmVzdWx0LnJlcG8gPSBnaXRodWIucmVwbzsgfVxuXHRjb25zdCBwdWxsUmVxdWVzdFVybCA9IGdldFNlc3Npb25SZWxhdGVkUHVsbFJlcXVlc3RVcmxzKGdpdGh1YilbMF07XG5cdGlmIChwdWxsUmVxdWVzdFVybCAhPT0gdW5kZWZpbmVkKSB7IHJlc3VsdC5wdWxsUmVxdWVzdFVybCA9IHB1bGxSZXF1ZXN0VXJsOyB9XG5cdHJldHVybiBPYmplY3Qua2V5cyhyZXN1bHQpLmxlbmd0aCA+IDAgPyByZXN1bHQgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHNlcmlhbGl6ZVNlc3Npb24oc2Vzc2lvbjogSUFnZW50U2Vzc2lvbk1ldGFkYXRhKTogSVNlcmlhbGl6ZWRTZXNzaW9uIHtcblx0Y29uc3QgZ2l0ID0gc2VyaWFsaXplR2l0U3RhdGUoc2Vzc2lvbik7XG5cdGNvbnN0IGdpdGh1YiA9IHNlcmlhbGl6ZUdpdEh1YlN0YXRlKHNlc3Npb24pO1xuXHRjb25zdCBzdGF0dXMgPSBkZXNjcmliZVNlc3Npb25TdGF0dXMoc2Vzc2lvbik7XG5cdHJldHVybiB7XG5cdFx0c2Vzc2lvbjogc2Vzc2lvbi5zZXNzaW9uLnRvU3RyaW5nKCksXG5cdFx0Li4uKHNlc3Npb24uc3VtbWFyeSAhPT0gdW5kZWZpbmVkID8geyB0aXRsZTogc2Vzc2lvbi5zdW1tYXJ5IH0gOiB7fSksXG5cdFx0Li4uKHN0YXR1cyAhPT0gdW5kZWZpbmVkID8geyBzdGF0dXMgfSA6IHt9KSxcblx0XHQuLi4oc2Vzc2lvbi5hY3Rpdml0eSAhPT0gdW5kZWZpbmVkID8geyBhY3Rpdml0eTogc2Vzc2lvbi5hY3Rpdml0eSB9IDoge30pLFxuXHRcdC4uLihzZXNzaW9uLndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdICE9PSB1bmRlZmluZWQgPyB7IHdvcmtpbmdEaXJlY3Rvcnk6IHNlc3Npb24ud29ya2luZ0RpcmVjdG9yaWVzWzBdLnRvU3RyaW5nKCkgfSA6IHt9KSxcblx0XHQuLi4oc2Vzc2lvbi5wcm9qZWN0ICE9PSB1bmRlZmluZWQgPyB7IHByb2plY3Q6IHNlc3Npb24ucHJvamVjdC5kaXNwbGF5TmFtZSB9IDoge30pLFxuXHRcdC4uLihzZXNzaW9uSXNVbnJlYWQoc2Vzc2lvbikgPyB7IHVucmVhZDogdHJ1ZSB9IDoge30pLFxuXHRcdC4uLihzZXNzaW9uLnN0YXJ0VGltZSA+IDAgPyB7IGNyZWF0ZWRBdDogbmV3IERhdGUoc2Vzc2lvbi5zdGFydFRpbWUpLnRvSVNPU3RyaW5nKCkgfSA6IHt9KSxcblx0XHQuLi4oc2Vzc2lvbi5tb2RpZmllZFRpbWUgPiAwID8geyBtb2RpZmllZEF0OiBuZXcgRGF0ZShzZXNzaW9uLm1vZGlmaWVkVGltZSkudG9JU09TdHJpbmcoKSB9IDoge30pLFxuXHRcdC4uLihzZXNzaW9uLmNoYW5nZXMgIT09IHVuZGVmaW5lZCA/IHsgY2hhbmdlczogc2Vzc2lvbi5jaGFuZ2VzIH0gOiB7fSksXG5cdFx0Li4uKHNlc3Npb24uY2hhbmdlc2V0cyAhPT0gdW5kZWZpbmVkID8ge1xuXHRcdFx0Y2hhbmdlc2V0czogc2Vzc2lvbi5jaGFuZ2VzZXRzLm1hcChjaGFuZ2VzZXQgPT4gKHtcblx0XHRcdFx0bGFiZWw6IGNoYW5nZXNldC5sYWJlbCxcblx0XHRcdFx0Y2hhbmdlS2luZDogY2hhbmdlc2V0LmNoYW5nZUtpbmQsXG5cdFx0XHRcdHVyaVRlbXBsYXRlOiBjaGFuZ2VzZXQudXJpVGVtcGxhdGUsXG5cdFx0XHRcdC4uLihjaGFuZ2VzZXQuZGVzY3JpcHRpb24gIT09IHVuZGVmaW5lZCA/IHsgZGVzY3JpcHRpb246IGNoYW5nZXNldC5kZXNjcmlwdGlvbiB9IDoge30pLFxuXHRcdFx0fSkpLFxuXHRcdH0gOiB7fSksXG5cdFx0Li4uKGdpdCAhPT0gdW5kZWZpbmVkID8geyBnaXQgfSA6IHt9KSxcblx0XHQuLi4oZ2l0aHViICE9PSB1bmRlZmluZWQgPyB7IGdpdGh1YiB9IDoge30pLFxuXHR9O1xufVxuXG4vKiogU2VyaWFsaXplcyBzZXNzaW9uIG1ldGFkYXRhIGludG8gdGhlIGNvbXBhY3QgdG9vbC1yZXN1bHQgSlNPTiBwYXlsb2FkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNlcmlhbGl6ZVNlc3Npb25zKHNlc3Npb25zOiByZWFkb25seSBJQWdlbnRTZXNzaW9uTWV0YWRhdGFbXSk6IHN0cmluZyB7XG5cdHJldHVybiBKU09OLnN0cmluZ2lmeSh7IHNlc3Npb25zOiBzZXNzaW9ucy5tYXAoc2VyaWFsaXplU2Vzc2lvbikgfSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNyZWF0ZVNlc3Npb25SZXN1bHQge1xuXHRyZWFkb25seSBzZXNzaW9uOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNoYXQ6IHN0cmluZztcblx0LyoqIENsaWNrYWJsZSB7QGxpbmsgQUdFTlRfSE9TVF9TRVNTSU9OX0xJTktfU0NIRU1FfSBVUkkgdGhhdCBvcGVucyB0aGUgc2Vzc2lvbiBpbiB0aGUgQWdlbnRzIHdpbmRvdy4gKi9cblx0cmVhZG9ubHkgb3Blbkxpbms6IHN0cmluZztcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgc2Vzc2lvbiwgc2VuZHMgaXRzIGluaXRpYWwgcHJvbXB0LCBhbmQgcmV0dXJucyB0aGUgY3JlYXRlZCBjaGFubmVscy5cbiAqIEVuZm9yY2VzIHRoZSB7QGxpbmsgbWF4U2Vzc2lvblNwYXduRGVwdGggcmVjdXJzaW9uIGxpbWl0fSBhZ2FpbnN0XG4gKiB7QGxpbmsgY3VycmVudFNlc3Npb259ICh0aGUgc2Vzc2lvbiB0aGUgdG9vbCBydW5zIGluKSBhbmQgc3RhbXBzIHRoZSBuZXdcbiAqIHNlc3Npb24gb25lIGxldmVsIGRlZXBlciBzbyBpdHMgb3duIGBjcmVhdGVfc2Vzc2lvbmAgY2FsbHMgYXJlIGJvdW5kZWQgdG9vLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYXBwbHlDcmVhdGVTZXNzaW9uVG9vbChhY2Nlc3NvcjogSVNlc3Npb25TZXJ2ZXJUb29sQWNjZXNzb3IsIHJhd0FyZ3M6IHVua25vd24sIHNvdXJjZT86IFVSSSk6IFByb21pc2U8SUNyZWF0ZVNlc3Npb25SZXN1bHQ+IHtcblx0Y29uc3QgY3VycmVudFNlc3Npb24gPSBzb3VyY2UgPyBjdXJyZW50U2Vzc2lvblVyaShzb3VyY2UudG9TdHJpbmcoKSkgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IHBhcmVudERlcHRoID0gY3VycmVudFNlc3Npb24gPyBhY2Nlc3Nvci5nZXRTZXNzaW9uU3Bhd25EZXB0aChjdXJyZW50U2Vzc2lvbikgOiAwO1xuXHRpZiAocGFyZW50RGVwdGggPj0gbWF4U2Vzc2lvblNwYXduRGVwdGgpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYFJlZnVzaW5nIHRvIGNyZWF0ZSBhIHNlc3Npb246IHJlY3Vyc2lvbiBsaW1pdCByZWFjaGVkIChtYXggc3Bhd24gZGVwdGggJHttYXhTZXNzaW9uU3Bhd25EZXB0aH0pLiBUaGlzIHNlc3Npb24gd2FzIGl0c2VsZiBjcmVhdGVkICR7cGFyZW50RGVwdGh9IGxldmVsKHMpIGRlZXAuYCk7XG5cdH1cblx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBhY2Nlc3Nvci5saXN0U2Vzc2lvbnMoKTtcblx0Y29uc3QgYXJncyA9IGdldENyZWF0ZVNlc3Npb25BcmdzKHJhd0FyZ3MsIHNlc3Npb25zLCBhY2Nlc3Nvci5nZXRNb2RlbHMoKSk7XG5cdGNvbnN0IGRlZmF1bHRzID0gc291cmNlID8gYWNjZXNzb3IuZ2V0Q3JlYXRpb25EZWZhdWx0cyhzb3VyY2UpIDogdW5kZWZpbmVkO1xuXHRjb25zdCBwcm92aWRlciA9IGFyZ3MubW9kZWw/LnByb3ZpZGVyID8/IGRlZmF1bHRzPy5wcm92aWRlcjtcblx0Y29uc3QgaW5oZXJpdHNTb3VyY2VQcm92aWRlciA9IHByb3ZpZGVyICE9PSB1bmRlZmluZWQgJiYgcHJvdmlkZXIgPT09IGRlZmF1bHRzPy5wcm92aWRlcjtcblx0Y29uc3QgY29uZmlnOiBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnID0ge1xuXHRcdHdvcmtpbmdEaXJlY3RvcmllczogYXJncy53b3Jrc3BhY2UgPyBbYXJncy53b3Jrc3BhY2VdIDogdW5kZWZpbmVkLFxuXHRcdC4uLihwcm92aWRlciAhPT0gdW5kZWZpbmVkID8geyBwcm92aWRlciB9IDoge30pLFxuXHRcdC4uLihhcmdzLm1vZGVsICE9PSB1bmRlZmluZWQgPyB7IG1vZGVsOiB7IGlkOiBhcmdzLm1vZGVsLmlkIH0gfSA6IGRlZmF1bHRzPy5tb2RlbCAhPT0gdW5kZWZpbmVkID8geyBtb2RlbDogZGVmYXVsdHMubW9kZWwgfSA6IHt9KSxcblx0XHQuLi4oaW5oZXJpdHNTb3VyY2VQcm92aWRlciAmJiBkZWZhdWx0cz8uY29uZmlnICE9PSB1bmRlZmluZWQgPyB7IGNvbmZpZzogZGVmYXVsdHMuY29uZmlnIH0gOiB7fSksXG5cdH07XG5cdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBhY2Nlc3Nvci5jcmVhdGVTZXNzaW9uKGNvbmZpZyk7XG5cdGFjY2Vzc29yLnNldFNlc3Npb25TcGF3bkRlcHRoKHNlc3Npb24sIHBhcmVudERlcHRoICsgMSk7XG5cdGNvbnN0IGNoYXQgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSk7XG5cdGF3YWl0IGFjY2Vzc29yLnN0YXJ0UHJvbXB0KHNlc3Npb24sIGNoYXQsIGFyZ3MucHJvbXB0KTtcblx0cmV0dXJuIHsgc2Vzc2lvbjogc2Vzc2lvbi50b1N0cmluZygpLCBjaGF0OiBjaGF0LnRvU3RyaW5nKCksIG9wZW5MaW5rOiBidWlsZE9wZW5TZXNzaW9uTGlua1VyaShzZXNzaW9uKSB9O1xufVxuXG4vKipcbiAqIEJ1aWxkcyB0aGUgbW9kZWwtZmFjaW5nIGBjcmVhdGVfc2Vzc2lvbmAgcmVzdWx0LiBLZWVwcyB0aGUgbWFjaGluZS1yZWFkYWJsZVxuICogYGFnZW50LWhvc3Qtc2Vzc2lvbjovL2AgbGluayAocGFyc2VkIGNsaWVudC1zaWRlIHRvIHJlbmRlciB0aGUgZGV0ZXJtaW5pc3RpY1xuICogXCJTZXNzaW9uIENyZWF0ZWRcIiBjb25maXJtYXRpb24gKyBidXR0b24pIGJ1dCBvbWl0cyB0aGUgcmF3IGJhY2tlbmQgc2Vzc2lvblxuICogVVJJIHNvIHRoZSBtb2RlbCBoYXMgbm90aGluZyB1Z2x5IHRvIGVjaG8sIGFuZCB0ZWxscyBpdCB0byByZXBseSBicmllZmx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0Q3JlYXRlU2Vzc2lvblJlc3VsdChyZXN1bHQ6IElDcmVhdGVTZXNzaW9uUmVzdWx0KTogc3RyaW5nIHtcblx0cmV0dXJuIGBTZXNzaW9uIGNyZWF0ZWQgKCR7cmVzdWx0Lm9wZW5MaW5rfSkuIFJlcGx5IHdpdGggb25lIHNob3J0IHNlbnRlbmNlIGNvbmZpcm1pbmcgdGhlIHNlc3Npb24gd2FzIGNyZWF0ZWQ7IGRvIG5vdCBwcmludCB0aGUgVVJMIG9yIG1lbnRpb24gYSBidXR0b24uYDtcbn1cblxuaW50ZXJmYWNlIElDcmVhdGVDaGF0QXJncyB7XG5cdHJlYWRvbmx5IHNlc3Npb24/OiB1bmtub3duO1xuXHRyZWFkb25seSBwcm9tcHQ/OiB1bmtub3duO1xuXHRyZWFkb25seSB0aXRsZT86IHVua25vd247XG5cdHJlYWRvbmx5IG1vZGVsPzogdW5rbm93bjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ3JlYXRlQ2hhdFJlc3VsdCB7XG5cdHJlYWRvbmx5IHNlc3Npb246IHN0cmluZztcblx0cmVhZG9ubHkgY2hhdDogc3RyaW5nO1xuXHQvKiogQ2xpY2thYmxlIHtAbGluayBBR0VOVF9IT1NUX1NFU1NJT05fTElOS19TQ0hFTUV9IFVSSSB0aGF0IG9wZW5zIHRoZSBjcmVhdGVkIGNoYXQuICovXG5cdHJlYWRvbmx5IG9wZW5MaW5rOiBzdHJpbmc7XG59XG5cbi8qKlxuICogUmVzb2x2ZXMgYSBzZXNzaW9uIGlkZW50aWZpZXIgXHUyMDE0IGFjY2VwdGluZyBlaXRoZXIgYSBiYWNrZW5kIHNlc3Npb24gVVJJXG4gKiAoYGNvcGlsb3RjbGk6L1x1MjAyNmAgZnJvbSBgbGlzdF9zZXNzaW9uc2ApIG9yIGFuIGBhZ2VudC1ob3N0LXNlc3Npb246Ly9cdTIwMjZgIG9wZW5cbiAqIGxpbmsgKGFzIHJldHVybmVkIGJ5IGBjcmVhdGVfc2Vzc2lvbmAvYGdldF9jdXJyZW50X3Nlc3Npb25gKSBcdTIwMTQgYWdhaW5zdCB0aGVcbiAqIHNldCBvZiBrbm93biBzZXNzaW9ucy4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIGl0IG1hdGNoZXMgbm8ga25vd24gc2Vzc2lvbi5cbiAqL1xuZnVuY3Rpb24gcmVzb2x2ZUtub3duU2Vzc2lvbihzZXNzaW9uSW5wdXQ6IHN0cmluZywgc2Vzc2lvbnM6IHJlYWRvbmx5IElBZ2VudFNlc3Npb25NZXRhZGF0YVtdKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0Ly8gTm9ybWFsaXplIGFuIG9wZW4tc2Vzc2lvbiBsaW5rIGJhY2sgdG8gaXRzIGJhY2tlbmQgc2Vzc2lvbiBVUkkuXG5cdGNvbnN0IGZyb21MaW5rID0gcGFyc2VPcGVuU2Vzc2lvbkxpbmtVcmkoc2Vzc2lvbklucHV0KTtcblx0Y29uc3QgY2FuZGlkYXRlID0gZnJvbUxpbms/LnRvU3RyaW5nKCkgPz8gc2Vzc2lvbklucHV0O1xuXHRjb25zdCBtYXRjaCA9IHNlc3Npb25zLmZpbmQocyA9PiBzLnNlc3Npb24udG9TdHJpbmcoKSA9PT0gY2FuZGlkYXRlKTtcblx0cmV0dXJuIG1hdGNoPy5zZXNzaW9uO1xufVxuXG4vKiogUmVzb2x2ZXMgdGhlIHRhcmdldCBzZXNzaW9uIFVSSSBmb3IgYGNyZWF0ZV9jaGF0YCBhZ2FpbnN0IHRoZSBrbm93biBzZXNzaW9ucy4gKi9cbmZ1bmN0aW9uIHJlc29sdmVDaGF0U2Vzc2lvbihzZXNzaW9uSW5wdXQ6IHN0cmluZywgc2Vzc2lvbnM6IHJlYWRvbmx5IElBZ2VudFNlc3Npb25NZXRhZGF0YVtdKTogVVJJIHtcblx0Y29uc3Qgc2Vzc2lvbiA9IHJlc29sdmVLbm93blNlc3Npb24oc2Vzc2lvbklucHV0LCBzZXNzaW9ucyk7XG5cdGlmICghc2Vzc2lvbikge1xuXHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCAke1Nlc3Npb25TZXJ2ZXJUb29sTmFtZS5DcmVhdGVDaGF0fSBpbnB1dDogc2Vzc2lvbiBtdXN0IG1hdGNoIHRoZSBVUkkgb2YgYSBrbm93biBzZXNzaW9uIChzZWUgbGlzdF9zZXNzaW9ucykuYCk7XG5cdH1cblx0cmV0dXJuIHNlc3Npb247XG59XG5cbi8qKiBWYWxpZGF0ZXMgYW5kIHJlc29sdmVzIGNyZWF0ZS1jaGF0IGFyZ3VtZW50czsgZGVmYXVsdHMgdGhlIHNlc3Npb24gdG8ge0BsaW5rIGN1cnJlbnRTZXNzaW9ufSB3aGVuIG9taXR0ZWQuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q3JlYXRlQ2hhdEFyZ3MocmF3QXJnczogdW5rbm93biwgc2Vzc2lvbnM6IHJlYWRvbmx5IElBZ2VudFNlc3Npb25NZXRhZGF0YVtdLCBtb2RlbHM6IHJlYWRvbmx5IElBZ2VudE1vZGVsSW5mb1tdLCBjdXJyZW50U2Vzc2lvbj86IFVSSSk6IHsgc2Vzc2lvbjogVVJJOyBwcm9tcHQ6IHN0cmluZzsgdGl0bGU/OiBzdHJpbmc7IG1vZGVsPzogSUFnZW50TW9kZWxJbmZvIH0ge1xuXHRjb25zdCBhcmdzID0gKHJhd0FyZ3MgPz8ge30pIGFzIElDcmVhdGVDaGF0QXJncztcblx0Y29uc3QgcHJvbXB0ID0gZ2V0UmVxdWlyZWRTdHJpbmcoYXJncy5wcm9tcHQsICdwcm9tcHQnLCBTZXNzaW9uU2VydmVyVG9vbE5hbWUuQ3JlYXRlQ2hhdCk7XG5cdGNvbnN0IHRpdGxlID0gZ2V0T3B0aW9uYWxTdHJpbmcoYXJncy50aXRsZSwgJ3RpdGxlJywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZUNoYXQpO1xuXHRjb25zdCBtb2RlbE5hbWUgPSBnZXRPcHRpb25hbFN0cmluZyhhcmdzLm1vZGVsLCAnbW9kZWwnLCBTZXNzaW9uU2VydmVyVG9vbE5hbWUuQ3JlYXRlQ2hhdCk7XG5cdGNvbnN0IG1vZGVsID0gcmVzb2x2ZU1vZGVsKG1vZGVsTmFtZSwgbW9kZWxzKTtcblx0Y29uc3Qgc2Vzc2lvbklucHV0ID0gZ2V0T3B0aW9uYWxTdHJpbmcoYXJncy5zZXNzaW9uLCAnc2Vzc2lvbicsIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5DcmVhdGVDaGF0KTtcblx0bGV0IHNlc3Npb246IFVSSTtcblx0aWYgKHNlc3Npb25JbnB1dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0c2Vzc2lvbiA9IHJlc29sdmVDaGF0U2Vzc2lvbihzZXNzaW9uSW5wdXQsIHNlc3Npb25zKTtcblx0fSBlbHNlIGlmIChjdXJyZW50U2Vzc2lvbikge1xuXHRcdHNlc3Npb24gPSBjdXJyZW50U2Vzc2lvbjtcblx0fSBlbHNlIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgJHtTZXNzaW9uU2VydmVyVG9vbE5hbWUuQ3JlYXRlQ2hhdH0gaW5wdXQ6IG5vIHNlc3Npb24gcHJvdmlkZWQgYW5kIHRoZSBjdXJyZW50IHNlc3Npb24gY291bGQgbm90IGJlIGRldGVybWluZWQuYCk7XG5cdH1cblx0cmV0dXJuIHsgc2Vzc2lvbiwgcHJvbXB0LCAuLi4odGl0bGUgIT09IHVuZGVmaW5lZCA/IHsgdGl0bGUgfSA6IHt9KSwgLi4uKG1vZGVsICE9PSB1bmRlZmluZWQgPyB7IG1vZGVsIH0gOiB7fSkgfTtcbn1cblxuLyoqIEFkZHMgYSBjaGF0IHRvIGEgc2Vzc2lvbiwgc2VuZHMgaXRzIGluaXRpYWwgcHJvbXB0LCBhbmQgcmV0dXJucyB0aGUgY3JlYXRlZCBjaGFubmVscy4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhcHBseUNyZWF0ZUNoYXRUb29sKGFjY2Vzc29yOiBJU2Vzc2lvblNlcnZlclRvb2xBY2Nlc3NvciwgcmF3QXJnczogdW5rbm93biwgc291cmNlPzogVVJJKTogUHJvbWlzZTxJQ3JlYXRlQ2hhdFJlc3VsdD4ge1xuXHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IGFjY2Vzc29yLmxpc3RTZXNzaW9ucygpO1xuXHRjb25zdCBjdXJyZW50U2Vzc2lvbiA9IHNvdXJjZSA/IGN1cnJlbnRTZXNzaW9uVXJpKHNvdXJjZS50b1N0cmluZygpKSA6IHVuZGVmaW5lZDtcblx0Y29uc3QgYXJncyA9IGdldENyZWF0ZUNoYXRBcmdzKHJhd0FyZ3MsIHNlc3Npb25zLCBhY2Nlc3Nvci5nZXRNb2RlbHMoKSwgY3VycmVudFNlc3Npb24pO1xuXHRjb25zdCBkZWZhdWx0cyA9IHNvdXJjZSA/IGFjY2Vzc29yLmdldENyZWF0aW9uRGVmYXVsdHMoc291cmNlKSA6IHVuZGVmaW5lZDtcblx0Y29uc3QgdGFyZ2V0UHJvdmlkZXIgPSBBZ2VudFNlc3Npb24ucHJvdmlkZXIoYXJncy5zZXNzaW9uKTtcblx0Y29uc3QgbW9kZWwgPSBhcmdzLm1vZGVsICE9PSB1bmRlZmluZWQgPyB7IGlkOiBhcmdzLm1vZGVsLmlkIH0gOiB0YXJnZXRQcm92aWRlciA9PT0gZGVmYXVsdHM/LnByb3ZpZGVyID8gZGVmYXVsdHM/Lm1vZGVsIDogdW5kZWZpbmVkO1xuXHRjb25zdCBjaGF0SWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0Y29uc3QgY2hhdCA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoYXJncy5zZXNzaW9uLnRvU3RyaW5nKCksIGNoYXRJZCkpO1xuXHRhd2FpdCBhY2Nlc3Nvci5jcmVhdGVDaGF0KGFyZ3Muc2Vzc2lvbiwgY2hhdCwgeyB0aXRsZTogYXJncy50aXRsZSwgbW9kZWwgfSk7XG5cdGF3YWl0IGFjY2Vzc29yLnN0YXJ0UHJvbXB0KGFyZ3Muc2Vzc2lvbiwgY2hhdCwgYXJncy5wcm9tcHQpO1xuXHRyZXR1cm4geyBzZXNzaW9uOiBhcmdzLnNlc3Npb24udG9TdHJpbmcoKSwgY2hhdDogY2hhdC50b1N0cmluZygpLCBvcGVuTGluazogYnVpbGRPcGVuU2Vzc2lvbkxpbmtVcmkoYXJncy5zZXNzaW9uLCBjaGF0SWQpIH07XG59XG5cbi8qKiBCdWlsZHMgdGhlIG1vZGVsLWZhY2luZyBgY3JlYXRlX2NoYXRgIHJlc3VsdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXRDcmVhdGVDaGF0UmVzdWx0KHJlc3VsdDogSUNyZWF0ZUNoYXRSZXN1bHQpOiBzdHJpbmcge1xuXHRyZXR1cm4gYENoYXQgY3JlYXRlZCAoJHtyZXN1bHQub3Blbkxpbmt9KS4gUmVwbHkgd2l0aCBvbmUgc2hvcnQgc2VudGVuY2UgY29uZmlybWluZyB0aGUgY2hhdCB3YXMgY3JlYXRlZDsgZG8gbm90IHByaW50IHRoZSBVUkwgb3IgbWVudGlvbiBhIGJ1dHRvbi5gO1xufVxuXG5pbnRlcmZhY2UgSVJlbmFtZUNoYXRBcmdzIHtcblx0cmVhZG9ubHkgc2Vzc2lvbj86IHVua25vd247XG5cdHJlYWRvbmx5IGNoYXQ/OiB1bmtub3duO1xuXHRyZWFkb25seSB0aXRsZT86IHVua25vd247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc29sdmVkUmVuYW1lQ2hhdEFyZ3Mge1xuXHRyZWFkb25seSBzZXNzaW9uOiBVUkk7XG5cdHJlYWRvbmx5IGNoYXQ6IFVSSTtcblx0cmVhZG9ubHkgdGl0bGU6IHN0cmluZztcblx0cmVhZG9ubHkgY2hhdElkOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGN1cnJlbnRDaGF0VXJpKHRvb2xDYWxsQ2hhbm5lbD86IFByb3RvY29sVVJJKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0aWYgKCF0b29sQ2FsbENoYW5uZWwpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ2hhdFVyaSh0b29sQ2FsbENoYW5uZWwpO1xuXHRpZiAoIXBhcnNlZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIFVSSS5wYXJzZSh0b29sQ2FsbENoYW5uZWwpO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVSZW5hbWVDaGF0VGl0bGUocmVxdWVzdGVkVGl0bGU6IHN0cmluZywgc2Vzc2lvbnM6IHJlYWRvbmx5IElBZ2VudFNlc3Npb25NZXRhZGF0YVtdLCBzZXNzaW9uOiBVUkksIGNoYXQ6IFVSSSk6IHN0cmluZyB7XG5cdGNvbnN0IG1ldGFkYXRhID0gc2Vzc2lvbnMuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLnNlc3Npb24udG9TdHJpbmcoKSA9PT0gc2Vzc2lvbi50b1N0cmluZygpKTtcblx0Y29uc3QgdGl0bGUgPSBpc0RlZmF1bHRDaGF0VXJpKGNoYXQpICYmIG1ldGFkYXRhPy53b3JraW5nRGlyZWN0b3JpZXM/Lmxlbmd0aFxuXHRcdD8gbm9ybWFsaXplUHJvamVjdFNlc3Npb25UaXRsZShyZXF1ZXN0ZWRUaXRsZSlcblx0XHQ6IG5vcm1hbGl6ZUdlbmVyYWxDaGF0VGl0bGUocmVxdWVzdGVkVGl0bGUpO1xuXHRpZiAoIXRpdGxlKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7U2Vzc2lvblNlcnZlclRvb2xOYW1lLlJlbmFtZUNoYXR9IGlucHV0OiB0aXRsZSBtdXN0IGNvbnRhaW4gbm9uLXdoaXRlc3BhY2UgY2hhcmFjdGVycy5gKTtcblx0fVxuXHR2YWxpZGF0ZVJlbmFtZVRpdGxlKHRpdGxlLCBTZXNzaW9uU2VydmVyVG9vbE5hbWUuUmVuYW1lQ2hhdCk7XG5cdHJldHVybiB0aXRsZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlbmFtZUNoYXRBcmdzKHJhd0FyZ3M6IHVua25vd24sIHNlc3Npb25zOiByZWFkb25seSBJQWdlbnRTZXNzaW9uTWV0YWRhdGFbXSwgY3VycmVudENoYW5uZWw/OiBQcm90b2NvbFVSSSk6IElSZXNvbHZlZFJlbmFtZUNoYXRBcmdzIHtcblx0Y29uc3QgYXJncyA9IChyYXdBcmdzID8/IHt9KSBhcyBJUmVuYW1lQ2hhdEFyZ3M7XG5cdGNvbnN0IHJlcXVlc3RlZFRpdGxlID0gZ2V0UmVxdWlyZWRTdHJpbmcoYXJncy50aXRsZSwgJ3RpdGxlJywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLlJlbmFtZUNoYXQpO1xuXHRjb25zdCBzZXNzaW9uSW5wdXQgPSBnZXRPcHRpb25hbFN0cmluZyhhcmdzLnNlc3Npb24sICdzZXNzaW9uJywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLlJlbmFtZUNoYXQpO1xuXHRjb25zdCBjaGF0SW5wdXQgPSBnZXRPcHRpb25hbFN0cmluZyhhcmdzLmNoYXQsICdjaGF0JywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLlJlbmFtZUNoYXQpO1xuXG5cdGlmIChjaGF0SW5wdXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IHNlc3Npb24gPSByZXNvbHZlS25vd25TZXNzaW9uKGNoYXRJbnB1dCwgc2Vzc2lvbnMpO1xuXHRcdGNvbnN0IGNoYXRJZCA9IHBhcnNlT3BlblNlc3Npb25MaW5rQ2hhdElkKGNoYXRJbnB1dCk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgJHtTZXNzaW9uU2VydmVyVG9vbE5hbWUuUmVuYW1lQ2hhdH0gaW5wdXQ6IGNoYXQgbXVzdCBiZSBhbiBhZ2VudC1ob3N0LXNlc3Npb246Ly8gbGluayB0YXJnZXRpbmcgYSBrbm93biBjaGF0LmApO1xuXHRcdH1cblx0XHRpZiAoc2Vzc2lvbklucHV0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IGV4cGxpY2l0U2Vzc2lvbiA9IHJlc29sdmVLbm93blNlc3Npb24oc2Vzc2lvbklucHV0LCBzZXNzaW9ucyk7XG5cdFx0XHRpZiAoIWV4cGxpY2l0U2Vzc2lvbikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgJHtTZXNzaW9uU2VydmVyVG9vbE5hbWUuUmVuYW1lQ2hhdH0gaW5wdXQ6IHNlc3Npb24gbXVzdCBtYXRjaCB0aGUgVVJJIG9mIGEga25vd24gc2Vzc2lvbiAoc2VlIGxpc3Rfc2Vzc2lvbnMpLmApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV4cGxpY2l0U2Vzc2lvbi50b1N0cmluZygpICE9PSBzZXNzaW9uLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7U2Vzc2lvblNlcnZlclRvb2xOYW1lLlJlbmFtZUNoYXR9IGlucHV0OiBzZXNzaW9uIG11c3QgbWF0Y2ggdGhlIG93bmluZyBzZXNzaW9uIG9mIGNoYXQuYCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGNoYXQgPSBVUkkucGFyc2UoY2hhdElkID8gYnVpbGRDaGF0VXJpKHNlc3Npb24udG9TdHJpbmcoKSwgY2hhdElkKSA6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKSk7XG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDaGF0VXJpKGNoYXQpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgJHtTZXNzaW9uU2VydmVyVG9vbE5hbWUuUmVuYW1lQ2hhdH0gaW5wdXQ6IGNoYXQgbXVzdCB0YXJnZXQgYSBrbm93biBjaGF0LmApO1xuXHRcdH1cblx0XHRjb25zdCB0aXRsZSA9IG5vcm1hbGl6ZVJlbmFtZUNoYXRUaXRsZShyZXF1ZXN0ZWRUaXRsZSwgc2Vzc2lvbnMsIHNlc3Npb24sIGNoYXQpO1xuXHRcdHJldHVybiB7IHNlc3Npb24sIGNoYXQsIHRpdGxlLCBjaGF0SWQ6IHBhcnNlZC5jaGF0SWQgfTtcblx0fVxuXG5cdGNvbnN0IGN1cnJlbnRDaGF0ID0gY3VycmVudENoYXRVcmkoY3VycmVudENoYW5uZWwpO1xuXHRpZiAoY3VycmVudENoYXQgJiYgY3VycmVudENoYW5uZWwpIHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3VycmVudFNlc3Npb25VcmkoY3VycmVudENoYW5uZWwpO1xuXHRcdGlmIChzZXNzaW9uSW5wdXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgZXhwbGljaXRTZXNzaW9uID0gcmVzb2x2ZUtub3duU2Vzc2lvbihzZXNzaW9uSW5wdXQsIHNlc3Npb25zKTtcblx0XHRcdGlmICghZXhwbGljaXRTZXNzaW9uKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCAke1Nlc3Npb25TZXJ2ZXJUb29sTmFtZS5SZW5hbWVDaGF0fSBpbnB1dDogc2Vzc2lvbiBtdXN0IG1hdGNoIHRoZSBVUkkgb2YgYSBrbm93biBzZXNzaW9uIChzZWUgbGlzdF9zZXNzaW9ucykuYCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXhwbGljaXRTZXNzaW9uLnRvU3RyaW5nKCkgIT09IHNlc3Npb24udG9TdHJpbmcoKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgJHtTZXNzaW9uU2VydmVyVG9vbE5hbWUuUmVuYW1lQ2hhdH0gaW5wdXQ6IHNlc3Npb24gbXVzdCBtYXRjaCB0aGUgY3VycmVudCBjaGF0J3Mgb3duaW5nIHNlc3Npb24uYCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ2hhdFVyaShjdXJyZW50Q2hhdC50b1N0cmluZygpKTtcblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7U2Vzc2lvblNlcnZlclRvb2xOYW1lLlJlbmFtZUNoYXR9IGlucHV0OiBjdXJyZW50IGNoYW5uZWwgaXMgbm90IGEgY2hhdC5gKTtcblx0XHR9XG5cdFx0Y29uc3QgdGl0bGUgPSBub3JtYWxpemVSZW5hbWVDaGF0VGl0bGUocmVxdWVzdGVkVGl0bGUsIHNlc3Npb25zLCBzZXNzaW9uLCBjdXJyZW50Q2hhdCk7XG5cdFx0cmV0dXJuIHsgc2Vzc2lvbiwgY2hhdDogY3VycmVudENoYXQsIHRpdGxlLCBjaGF0SWQ6IHBhcnNlZC5jaGF0SWQgfTtcblx0fVxuXG5cdC8vIENvZGV4IHJ1bnMgc2VydmVyIHRvb2xzIHVuZGVyIHRoZSBzZXNzaW9uL2NvbmZpZyBzY29wZSAoYGNvZGV4Oi9cdTIwMjZgKSwgbm90XG5cdC8vIHRoZSBgYWhwLWNoYXQ6Ly9gIGNoYW5uZWwuIFRyZWF0IHRoYXQgc2NvcGUgXHUyMDE0IG9yIGFuIGV4cGxpY2l0IHNlc3Npb25cblx0Ly8gYXJndW1lbnQgd2l0aG91dCBgY2hhdGAgXHUyMDE0IGFzIFwicmVuYW1lIHRoaXMgc2Vzc2lvbidzIGRlZmF1bHQgY2hhdFwiLlxuXHRjb25zdCBleHBsaWNpdFNlc3Npb24gPSBzZXNzaW9uSW5wdXQgIT09IHVuZGVmaW5lZCA/IHJlc29sdmVLbm93blNlc3Npb24oc2Vzc2lvbklucHV0LCBzZXNzaW9ucykgOiB1bmRlZmluZWQ7XG5cdGlmIChzZXNzaW9uSW5wdXQgIT09IHVuZGVmaW5lZCAmJiAhZXhwbGljaXRTZXNzaW9uKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7U2Vzc2lvblNlcnZlclRvb2xOYW1lLlJlbmFtZUNoYXR9IGlucHV0OiBzZXNzaW9uIG11c3QgbWF0Y2ggdGhlIFVSSSBvZiBhIGtub3duIHNlc3Npb24gKHNlZSBsaXN0X3Nlc3Npb25zKS5gKTtcblx0fVxuXHRjb25zdCBzZXNzaW9uRnJvbUNoYW5uZWwgPSBjdXJyZW50Q2hhbm5lbCA/IGN1cnJlbnRTZXNzaW9uVXJpKGN1cnJlbnRDaGFubmVsKSA6IHVuZGVmaW5lZDtcblx0aWYgKGV4cGxpY2l0U2Vzc2lvbiAmJiBzZXNzaW9uRnJvbUNoYW5uZWwgJiYgZXhwbGljaXRTZXNzaW9uLnRvU3RyaW5nKCkgIT09IHNlc3Npb25Gcm9tQ2hhbm5lbC50b1N0cmluZygpKSB7XG5cdFx0Y29uc3QgY2hhbm5lbElzS25vd25TZXNzaW9uID0gc2Vzc2lvbnMuc29tZShjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLnNlc3Npb24udG9TdHJpbmcoKSA9PT0gc2Vzc2lvbkZyb21DaGFubmVsLnRvU3RyaW5nKCkpO1xuXHRcdGlmIChjaGFubmVsSXNLbm93blNlc3Npb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCAke1Nlc3Npb25TZXJ2ZXJUb29sTmFtZS5SZW5hbWVDaGF0fSBpbnB1dDogc2Vzc2lvbiBtdXN0IG1hdGNoIHRoZSBjdXJyZW50IGNoYXQncyBvd25pbmcgc2Vzc2lvbi5gKTtcblx0XHR9XG5cdH1cblx0Y29uc3Qgc2Vzc2lvbiA9IGV4cGxpY2l0U2Vzc2lvbiA/PyBzZXNzaW9uRnJvbUNoYW5uZWw7XG5cdGlmICghc2Vzc2lvbikge1xuXHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCAke1Nlc3Npb25TZXJ2ZXJUb29sTmFtZS5SZW5hbWVDaGF0fSBpbnB1dDogY2hhdCBtdXN0IHRhcmdldCBhIGtub3duIGNoYXQsIG9yIHRoZSB0b29sIG11c3QgcnVuIGluc2lkZSB0aGF0IGNoYXQuYCk7XG5cdH1cblx0Y29uc3QgY2hhdCA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24udG9TdHJpbmcoKSkpO1xuXHRjb25zdCBwYXJzZWQgPSBwYXJzZUNoYXRVcmkoY2hhdCk7XG5cdGlmICghcGFyc2VkKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7U2Vzc2lvblNlcnZlclRvb2xOYW1lLlJlbmFtZUNoYXR9IGlucHV0OiBjaGF0IG11c3QgdGFyZ2V0IGEga25vd24gY2hhdC5gKTtcblx0fVxuXHRjb25zdCB0aXRsZSA9IG5vcm1hbGl6ZVJlbmFtZUNoYXRUaXRsZShyZXF1ZXN0ZWRUaXRsZSwgc2Vzc2lvbnMsIHNlc3Npb24sIGNoYXQpO1xuXHRyZXR1cm4geyBzZXNzaW9uLCBjaGF0LCB0aXRsZSwgY2hhdElkOiBwYXJzZWQuY2hhdElkIH07XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhcHBseVJlbmFtZUNoYXRUb29sKGFjY2Vzc29yOiBJU2Vzc2lvblNlcnZlclRvb2xBY2Nlc3NvciwgcmF3QXJnczogdW5rbm93biwgY3VycmVudENoYW5uZWw/OiBQcm90b2NvbFVSSSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgYWNjZXNzb3IubGlzdFNlc3Npb25zKCk7XG5cdGNvbnN0IHsgc2Vzc2lvbiwgY2hhdCwgdGl0bGUgfSA9IGdldFJlbmFtZUNoYXRBcmdzKHJhd0FyZ3MsIHNlc3Npb25zLCBjdXJyZW50Q2hhbm5lbCk7XG5cdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFjY2Vzc29yLnJlbmFtZUNoYXQoc2Vzc2lvbiwgY2hhdCwgdGl0bGUpO1xuXHRyZXR1cm4gYFJlbmFtZWQgY2hhdCB0byBcIiR7cmVzdWx0LnRpdGxlfVwiLmA7XG59XG5cbmludGVyZmFjZSBJU2VuZE1lc3NhZ2VBcmdzIHtcblx0cmVhZG9ubHkgc2Vzc2lvbj86IHVua25vd247XG5cdHJlYWRvbmx5IG1lc3NhZ2U/OiB1bmtub3duO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZXNvbHZlZFNlbmRNZXNzYWdlQXJncyB7XG5cdC8qKiBUaGUgb3duaW5nIGJhY2tlbmQgc2Vzc2lvbiBVUkkgb2YgdGhlIHRhcmdldCBjaGF0LiAqL1xuXHRyZWFkb25seSBzZXNzaW9uOiBVUkk7XG5cdC8qKiBUaGUgY2hhdCBjaGFubmVsIHRvIGRlbGl2ZXIgdGhlIG1lc3NhZ2Ugb24gKGRlZmF1bHQgY2hhdCwgb3IgYSBzcGVjaWZpYyBjaGF0IHdoZW4gdGhlIGxpbmsgY2FycmllZCBvbmUpLiAqL1xuXHRyZWFkb25seSBjaGF0OiBVUkk7XG5cdC8qKiBUaGUgY2hhdCBpZCB3aGVuIGEgc3BlY2lmaWMgY2hhdCB3YXMgdGFyZ2V0ZWQgKGZyb20gYSBgY3JlYXRlX2NoYXRgIGxpbmspLiAqL1xuXHRyZWFkb25seSBjaGF0SWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1lc3NhZ2U6IHN0cmluZztcbn1cblxuLyoqXG4gKiBWYWxpZGF0ZXMgYW5kIHJlc29sdmVzIHNlbmQtbWVzc2FnZSBhcmd1bWVudHMuIFdoZW4gdGhlIGBzZXNzaW9uYCBpbnB1dCBpcyBhXG4gKiBgY3JlYXRlX2NoYXRgIG9wZW4gbGluayAoY2FycnlpbmcgYSBjaGF0IGlkKSwgdGhlIG1lc3NhZ2UgaXMgdGFyZ2V0ZWQgYXQgdGhhdFxuICogc3BlY2lmaWMgY2hhdCByYXRoZXIgdGhhbiB0aGUgc2Vzc2lvbidzIGRlZmF1bHQgY2hhdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFNlbmRNZXNzYWdlQXJncyhyYXdBcmdzOiB1bmtub3duLCBzZXNzaW9uczogcmVhZG9ubHkgSUFnZW50U2Vzc2lvbk1ldGFkYXRhW10pOiBJUmVzb2x2ZWRTZW5kTWVzc2FnZUFyZ3Mge1xuXHRjb25zdCBhcmdzID0gKHJhd0FyZ3MgPz8ge30pIGFzIElTZW5kTWVzc2FnZUFyZ3M7XG5cdGNvbnN0IG1lc3NhZ2UgPSBnZXRSZXF1aXJlZFN0cmluZyhhcmdzLm1lc3NhZ2UsICdtZXNzYWdlJywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLlNlbmRNZXNzYWdlKTtcblx0Y29uc3Qgc2Vzc2lvbklucHV0ID0gZ2V0UmVxdWlyZWRTdHJpbmcoYXJncy5zZXNzaW9uLCAnc2Vzc2lvbicsIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5TZW5kTWVzc2FnZSk7XG5cdGNvbnN0IHNlc3Npb24gPSByZXNvbHZlS25vd25TZXNzaW9uKHNlc3Npb25JbnB1dCwgc2Vzc2lvbnMpO1xuXHRpZiAoIXNlc3Npb24pIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgJHtTZXNzaW9uU2VydmVyVG9vbE5hbWUuU2VuZE1lc3NhZ2V9IGlucHV0OiBzZXNzaW9uIG11c3QgbWF0Y2ggdGhlIFVSSSBvZiBhIGtub3duIHNlc3Npb24gKHNlZSBsaXN0X3Nlc3Npb25zKS5gKTtcblx0fVxuXHRjb25zdCBjaGF0SWQgPSBwYXJzZU9wZW5TZXNzaW9uTGlua0NoYXRJZChzZXNzaW9uSW5wdXQpO1xuXHRjb25zdCBjaGF0ID0gVVJJLnBhcnNlKGNoYXRJZCA/IGJ1aWxkQ2hhdFVyaShzZXNzaW9uLnRvU3RyaW5nKCksIGNoYXRJZCkgOiBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24udG9TdHJpbmcoKSkpO1xuXHRyZXR1cm4geyBzZXNzaW9uLCBjaGF0LCBtZXNzYWdlLCAuLi4oY2hhdElkICE9PSB1bmRlZmluZWQgPyB7IGNoYXRJZCB9IDoge30pIH07XG59XG5cbi8qKlxuICogU2VuZHMgYSBtZXNzYWdlIHRvIGFuIGV4aXN0aW5nIHNlc3Npb24vY2hhdCwgc3RhcnRpbmcgYSBuZXcgdHVybiB0aGVyZS5cbiAqIFJlZnVzZXMgdG8gdGFyZ2V0IHtAbGluayBjdXJyZW50Q2hhbm5lbH0gKHRoZSBjaGF0IGNoYW5uZWwgdGhlIHRvb2wgcnVucyBvbilcbiAqIHRvIGF2b2lkIGEgc2Vzc2lvbiB0cml2aWFsbHkgbWVzc2FnaW5nIGl0c2VsZiBpbiBhIGxvb3AuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhcHBseVNlbmRNZXNzYWdlVG9vbChhY2Nlc3NvcjogSVNlc3Npb25TZXJ2ZXJUb29sQWNjZXNzb3IsIHJhd0FyZ3M6IHVua25vd24sIGN1cnJlbnRDaGFubmVsPzogUHJvdG9jb2xVUkkpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IGFjY2Vzc29yLmxpc3RTZXNzaW9ucygpO1xuXHRjb25zdCB7IHNlc3Npb24sIGNoYXQsIGNoYXRJZCwgbWVzc2FnZSB9ID0gZ2V0U2VuZE1lc3NhZ2VBcmdzKHJhd0FyZ3MsIHNlc3Npb25zKTtcblx0aWYgKGN1cnJlbnRDaGFubmVsICYmIGNoYXQudG9TdHJpbmcoKSA9PT0gVVJJLnBhcnNlKGN1cnJlbnRDaGFubmVsKS50b1N0cmluZygpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7U2Vzc2lvblNlcnZlclRvb2xOYW1lLlNlbmRNZXNzYWdlfSBpbnB1dDogcmVmdXNpbmcgdG8gc2VuZCBhIG1lc3NhZ2UgdG8gdGhlIGN1cnJlbnQgY2hhdC5gKTtcblx0fVxuXHRhd2FpdCBhY2Nlc3Nvci5zdGFydFByb21wdChzZXNzaW9uLCBjaGF0LCBtZXNzYWdlKTtcblx0cmV0dXJuIGZvcm1hdFNlbmRNZXNzYWdlUmVzdWx0KGJ1aWxkT3BlblNlc3Npb25MaW5rVXJpKHNlc3Npb24sIGNoYXRJZCkpO1xufVxuXG4vKiogQnVpbGRzIHRoZSBtb2RlbC1mYWNpbmcgYHNlbmRfbWVzc2FnZWAgcmVzdWx0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdFNlbmRNZXNzYWdlUmVzdWx0KG9wZW5MaW5rOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gYE1lc3NhZ2Ugc2VudCAoJHtvcGVuTGlua30pLiBSZXBseSB3aXRoIG9uZSBzaG9ydCBzZW50ZW5jZSBjb25maXJtaW5nIHRoZSBtZXNzYWdlIHdhcyBzZW50OyBkbyBub3QgcHJpbnQgdGhlIFVSTCBvciBtZW50aW9uIGEgYnV0dG9uLmA7XG59XG5cbi8vIC0tLSBnZXRfc2Vzc2lvbl9jb250ZXh0IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbnR5cGUgU2Vzc2lvbkNvbnRleHREZXRhaWwgPSAodHlwZW9mIHNlc3Npb25Db250ZXh0RGV0YWlsVmFsdWVzKVtudW1iZXJdO1xuXG5jb25zdCBkZWZhdWx0VHJhbnNjcmlwdExpbWl0ID0gMTA7XG5jb25zdCBtYXhUcmFuc2NyaXB0TGltaXQgPSA1MDtcblxuLyoqIFBlci1kZXRhaWwgdHJ1bmNhdGlvbiBjYXBzIChjaGFyYWN0ZXJzKTsgYSB2YWx1ZSBvZiAwIG9taXRzIHRoZSBmaWVsZC4gKi9cbmNvbnN0IGNvbnRleHRDYXBzOiBSZWNvcmQ8U2Vzc2lvbkNvbnRleHREZXRhaWwsIHsgdXNlcjogbnVtYmVyOyBhc3Npc3RhbnQ6IG51bWJlcjsgdG9vbElucHV0OiBudW1iZXIgfT4gPSB7XG5cdC8vIGBzdW1tYXJ5YCBzdGlsbCBjYXJyaWVzIGEgc2hvcnQgYXNzaXN0YW50IGdpc3QgcGVyIHR1cm4gc28gdGhlIHJlYWRlciBzZWVzXG5cdC8vIHdoYXQgZWFjaCB0dXJuIGFjdHVhbGx5IGRpZCwgbm90IGp1c3Qgd2hhdCB3YXMgYXNrZWQuXG5cdHN1bW1hcnk6IHsgdXNlcjogMTYwLCBhc3Npc3RhbnQ6IDE0MCwgdG9vbElucHV0OiAwIH0sXG5cdGRpZ2VzdDogeyB1c2VyOiAzMDAsIGFzc2lzdGFudDogODAwLCB0b29sSW5wdXQ6IDAgfSxcblx0ZnVsbDogeyB1c2VyOiAxMDAwLCBhc3Npc3RhbnQ6IDIwMDAsIHRvb2xJbnB1dDogMjAwIH0sXG59O1xuXG5pbnRlcmZhY2UgSVNlc3Npb25Db250ZXh0QXJncyB7XG5cdHJlYWRvbmx5IHNlc3Npb24/OiB1bmtub3duO1xuXHRyZWFkb25seSBkZXRhaWw/OiB1bmtub3duO1xuXHRyZWFkb25seSB0cmFuc2NyaXB0TGltaXQ/OiB1bmtub3duO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZXNvbHZlZFNlc3Npb25Db250ZXh0QXJncyB7XG5cdHJlYWRvbmx5IHNlc3Npb246IFVSSTtcblx0cmVhZG9ubHkgY2hhdElkPzogc3RyaW5nO1xuXHRyZWFkb25seSBkZXRhaWw6IFNlc3Npb25Db250ZXh0RGV0YWlsO1xuXHRyZWFkb25seSB0cmFuc2NyaXB0TGltaXQ6IG51bWJlcjtcbn1cblxuLyoqIFZhbGlkYXRlcyBhbmQgcmVzb2x2ZXMgZ2V0LXNlc3Npb24tY29udGV4dCBhcmd1bWVudHMgYWdhaW5zdCB0aGUga25vd24gc2Vzc2lvbnMuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2Vzc2lvbkNvbnRleHRBcmdzKHJhd0FyZ3M6IHVua25vd24sIHNlc3Npb25zOiByZWFkb25seSBJQWdlbnRTZXNzaW9uTWV0YWRhdGFbXSk6IElSZXNvbHZlZFNlc3Npb25Db250ZXh0QXJncyB7XG5cdGNvbnN0IGFyZ3MgPSAocmF3QXJncyA/PyB7fSkgYXMgSVNlc3Npb25Db250ZXh0QXJncztcblx0Y29uc3Qgc2Vzc2lvbklucHV0ID0gZ2V0UmVxdWlyZWRTdHJpbmcoYXJncy5zZXNzaW9uLCAnc2Vzc2lvbicsIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5HZXRTZXNzaW9uQ29udGV4dCk7XG5cdGNvbnN0IHNlc3Npb24gPSByZXNvbHZlS25vd25TZXNzaW9uKHNlc3Npb25JbnB1dCwgc2Vzc2lvbnMpO1xuXHRpZiAoIXNlc3Npb24pIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgJHtTZXNzaW9uU2VydmVyVG9vbE5hbWUuR2V0U2Vzc2lvbkNvbnRleHR9IGlucHV0OiBzZXNzaW9uIG11c3QgbWF0Y2ggdGhlIFVSSSBvZiBhIGtub3duIHNlc3Npb24gKHNlZSBsaXN0X3Nlc3Npb25zKS5gKTtcblx0fVxuXHRsZXQgZGV0YWlsOiBTZXNzaW9uQ29udGV4dERldGFpbCA9ICdzdW1tYXJ5Jztcblx0aWYgKGFyZ3MuZGV0YWlsICE9PSB1bmRlZmluZWQpIHtcblx0XHRpZiAodHlwZW9mIGFyZ3MuZGV0YWlsICE9PSAnc3RyaW5nJyB8fCAhKHNlc3Npb25Db250ZXh0RGV0YWlsVmFsdWVzIGFzIHJlYWRvbmx5IHN0cmluZ1tdKS5pbmNsdWRlcyhhcmdzLmRldGFpbCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCAke1Nlc3Npb25TZXJ2ZXJUb29sTmFtZS5HZXRTZXNzaW9uQ29udGV4dH0gaW5wdXQ6IGRldGFpbCBtdXN0IGJlIG9uZSBvZiAke3Nlc3Npb25Db250ZXh0RGV0YWlsVmFsdWVzLmpvaW4oJywgJyl9LmApO1xuXHRcdH1cblx0XHRkZXRhaWwgPSBhcmdzLmRldGFpbCBhcyBTZXNzaW9uQ29udGV4dERldGFpbDtcblx0fVxuXHRsZXQgdHJhbnNjcmlwdExpbWl0ID0gZGVmYXVsdFRyYW5zY3JpcHRMaW1pdDtcblx0aWYgKGFyZ3MudHJhbnNjcmlwdExpbWl0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRpZiAodHlwZW9mIGFyZ3MudHJhbnNjcmlwdExpbWl0ICE9PSAnbnVtYmVyJyB8fCAhTnVtYmVyLmlzRmluaXRlKGFyZ3MudHJhbnNjcmlwdExpbWl0KSB8fCBhcmdzLnRyYW5zY3JpcHRMaW1pdCA8IDEpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCAke1Nlc3Npb25TZXJ2ZXJUb29sTmFtZS5HZXRTZXNzaW9uQ29udGV4dH0gaW5wdXQ6IHRyYW5zY3JpcHRMaW1pdCBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyLmApO1xuXHRcdH1cblx0XHR0cmFuc2NyaXB0TGltaXQgPSBNYXRoLm1pbihNYXRoLmZsb29yKGFyZ3MudHJhbnNjcmlwdExpbWl0KSwgbWF4VHJhbnNjcmlwdExpbWl0KTtcblx0fVxuXHRjb25zdCBjaGF0SWQgPSBwYXJzZU9wZW5TZXNzaW9uTGlua0NoYXRJZChzZXNzaW9uSW5wdXQpO1xuXHRyZXR1cm4geyBzZXNzaW9uLCBkZXRhaWwsIHRyYW5zY3JpcHRMaW1pdCwgLi4uKGNoYXRJZCAhPT0gdW5kZWZpbmVkID8geyBjaGF0SWQgfSA6IHt9KSB9O1xufVxuXG4vKiogVHJ1bmNhdGVzIHtAbGluayB0ZXh0fSB0byB7QGxpbmsgbWF4fSBjaGFyYWN0ZXJzLCBhcHBlbmRpbmcgYW4gZWxsaXBzaXMgd2hlbiBjdXQuICovXG5mdW5jdGlvbiB0cnVuY2F0ZVRleHQodGV4dDogc3RyaW5nLCBtYXg6IG51bWJlcik6IHsgdGV4dDogc3RyaW5nOyB0cnVuY2F0ZWQ6IGJvb2xlYW4gfSB7XG5cdGNvbnN0IHRyaW1tZWQgPSB0ZXh0LnRyaW0oKTtcblx0aWYgKHRyaW1tZWQubGVuZ3RoIDw9IG1heCkge1xuXHRcdHJldHVybiB7IHRleHQ6IHRyaW1tZWQsIHRydW5jYXRlZDogZmFsc2UgfTtcblx0fVxuXHRyZXR1cm4geyB0ZXh0OiBgJHt0cmltbWVkLnNsaWNlKDAsIE1hdGgubWF4KDAsIG1heCAtIDEpKX1cdTIwMjZgLCB0cnVuY2F0ZWQ6IHRydWUgfTtcbn1cblxuLyoqIFJlYWRzIHRoZSB0b29sLWNhbGwgcGFydHMgb2YgYSB0dXJuLCBuZXdlc3QtZW1pdHRlZCBsYXN0LiAqL1xuZnVuY3Rpb24gdG9vbENhbGxzT2YocGFydHM6IHJlYWRvbmx5IFJlc3BvbnNlUGFydFtdKTogVG9vbENhbGxTdGF0ZVtdIHtcblx0cmV0dXJuIHBhcnRzLmZpbHRlcigocCk6IHAgaXMgRXh0cmFjdDxSZXNwb25zZVBhcnQsIHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCB9PiA9PiBwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpLm1hcChwID0+IHAudG9vbENhbGwpO1xufVxuXG4vKiogQ29uY2F0ZW5hdGVkIG1hcmtkb3duIHRleHQgb2YgYSB0dXJuJ3MgcmVzcG9uc2UsIGluIHN0cmVhbSBvcmRlci4gKi9cbmZ1bmN0aW9uIGFzc2lzdGFudFRleHRPZihwYXJ0czogcmVhZG9ubHkgUmVzcG9uc2VQYXJ0W10pOiBzdHJpbmcge1xuXHRyZXR1cm4gcGFydHMuZmlsdGVyKChwKTogcCBpcyBFeHRyYWN0PFJlc3BvbnNlUGFydCwgeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duIH0+ID0+IHAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93bikubWFwKHAgPT4gcC5jb250ZW50KS5qb2luKCcnKS50cmltKCk7XG59XG5cbmludGVyZmFjZSBJU2VyaWFsaXplZENvbnRleHRUdXJuIHtcblx0cmVhZG9ubHkgdHVybjogbnVtYmVyO1xuXHRyZWFkb25seSBzdGF0ZTogc3RyaW5nO1xuXHRyZWFkb25seSB1c2VyPzogc3RyaW5nO1xuXHRyZWFkb25seSBhc3Npc3RhbnQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRvb2xDYWxscz86IHJlYWRvbmx5IChzdHJpbmcgfCB7IHJlYWRvbmx5IG5hbWU6IHN0cmluZzsgcmVhZG9ubHkgaW5wdXQ/OiBzdHJpbmcgfSlbXTtcbn1cblxuLyoqIE1hcHMgYSB7QGxpbmsgVHVyblN0YXRlfSAob3IgdGhlIGluLXByb2dyZXNzIGFjdGl2ZSB0dXJuKSB0byBhIGRpc3BsYXkgc3RyaW5nLiAqL1xuZnVuY3Rpb24gZGVzY3JpYmVUdXJuU3RhdGUoc3RhdGU6IFR1cm5TdGF0ZSB8ICdpblByb2dyZXNzJyk6IHN0cmluZyB7XG5cdHN3aXRjaCAoc3RhdGUpIHtcblx0XHRjYXNlIFR1cm5TdGF0ZS5Db21wbGV0ZTogcmV0dXJuICdjb21wbGV0ZSc7XG5cdFx0Y2FzZSBUdXJuU3RhdGUuQ2FuY2VsbGVkOiByZXR1cm4gJ2NhbmNlbGxlZCc7XG5cdFx0Y2FzZSBUdXJuU3RhdGUuRXJyb3I6IHJldHVybiAnZXJyb3InO1xuXHRcdGRlZmF1bHQ6IHJldHVybiAnaW5Qcm9ncmVzcyc7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElTZXJpYWxpemVkU2Vzc2lvbkNvbnRleHQge1xuXHRyZWFkb25seSBzZXNzaW9uOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG9wZW5MaW5rOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRldGFpbDogU2Vzc2lvbkNvbnRleHREZXRhaWw7XG5cdHJlYWRvbmx5IHRyYW5zY3JpcHQ6IHJlYWRvbmx5IElTZXJpYWxpemVkQ29udGV4dFR1cm5bXTtcblx0cmVhZG9ubHkgaGFzTW9yZUhpc3Rvcnk6IGJvb2xlYW47XG5cdC8qKiBgdHJ1ZWAgd2hlbiB0dXJucyB3ZXJlIGRyb3BwZWQgZnJvbSB0aGUgd2luZG93IG9yIGFueSBmaWVsZCB3YXMgc2hvcnRlbmVkLiAqL1xuXHRyZWFkb25seSB0cnVuY2F0ZWQ6IGJvb2xlYW47XG59XG5cbi8qKiBCdWlsZHMgdGhlIGNvbXBhY3RlZCwgbW9kZWwtZmFjaW5nIHNlc3Npb24tY29udGV4dCBwYXlsb2FkIGZyb20gYSBzbmFwc2hvdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXJpYWxpemVTZXNzaW9uQ29udGV4dChzZXNzaW9uOiBVUkksIGNoYXRJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBzbmFwc2hvdDogSUNoYXRDb250ZXh0U25hcHNob3QsIGRldGFpbDogU2Vzc2lvbkNvbnRleHREZXRhaWwsIHRyYW5zY3JpcHRMaW1pdDogbnVtYmVyKTogc3RyaW5nIHtcblx0Y29uc3QgY2FwcyA9IGNvbnRleHRDYXBzW2RldGFpbF07XG5cdGxldCB0cnVuY2F0ZWQgPSBmYWxzZTtcblx0Y29uc3QgdHJ1bmMgPSAodGV4dDogc3RyaW5nLCBtYXg6IG51bWJlcik6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0aWYgKG1heCA8PSAwIHx8ICF0ZXh0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSB0cnVuY2F0ZVRleHQodGV4dCwgbWF4KTtcblx0XHR0cnVuY2F0ZWQgPSB0cnVuY2F0ZWQgfHwgcmVzdWx0LnRydW5jYXRlZDtcblx0XHRyZXR1cm4gcmVzdWx0LnRleHQgfHwgdW5kZWZpbmVkO1xuXHR9O1xuXG5cdGNvbnN0IGVudHJpZXM6IHsgbWVzc2FnZTogTWVzc2FnZTsgcGFydHM6IHJlYWRvbmx5IFJlc3BvbnNlUGFydFtdOyBzdGF0ZTogVHVyblN0YXRlIHwgJ2luUHJvZ3Jlc3MnIH1bXSA9XG5cdFx0c25hcHNob3QudHVybnMubWFwKHQgPT4gKHsgbWVzc2FnZTogdC5tZXNzYWdlLCBwYXJ0czogdC5yZXNwb25zZVBhcnRzLCBzdGF0ZTogdC5zdGF0ZSB9KSk7XG5cdGlmIChzbmFwc2hvdC5hY3RpdmVUdXJuKSB7XG5cdFx0ZW50cmllcy5wdXNoKHsgbWVzc2FnZTogc25hcHNob3QuYWN0aXZlVHVybi5tZXNzYWdlLCBwYXJ0czogc25hcHNob3QuYWN0aXZlVHVybi5yZXNwb25zZVBhcnRzLCBzdGF0ZTogJ2luUHJvZ3Jlc3MnIH0pO1xuXHR9XG5cdGlmIChlbnRyaWVzLmxlbmd0aCA+IHRyYW5zY3JpcHRMaW1pdCkge1xuXHRcdHRydW5jYXRlZCA9IHRydWU7XG5cdH1cblx0Y29uc3Qgd2luZG93U3RhcnQgPSBNYXRoLm1heCgwLCBlbnRyaWVzLmxlbmd0aCAtIHRyYW5zY3JpcHRMaW1pdCk7XG5cdGNvbnN0IHdpbmRvd2VkID0gZW50cmllcy5zbGljZSh3aW5kb3dTdGFydCk7XG5cblx0Y29uc3QgdHJhbnNjcmlwdDogSVNlcmlhbGl6ZWRDb250ZXh0VHVybltdID0gd2luZG93ZWQubWFwKChlbnRyeSwgaW5kZXgpOiBJU2VyaWFsaXplZENvbnRleHRUdXJuID0+IHtcblx0XHRjb25zdCB1c2VyID0gdHJ1bmMoZW50cnkubWVzc2FnZS50ZXh0LCBjYXBzLnVzZXIpO1xuXHRcdGNvbnN0IGFzc2lzdGFudCA9IHRydW5jKGFzc2lzdGFudFRleHRPZihlbnRyeS5wYXJ0cyksIGNhcHMuYXNzaXN0YW50KTtcblx0XHRjb25zdCB0b29sQ2FsbHMgPSB0b29sQ2FsbHNPZihlbnRyeS5wYXJ0cyk7XG5cdFx0bGV0IHNlcmlhbGl6ZWRUb29sQ2FsbHM6IChzdHJpbmcgfCB7IG5hbWU6IHN0cmluZzsgaW5wdXQ/OiBzdHJpbmcgfSlbXSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoZGV0YWlsICE9PSAnc3VtbWFyeScgJiYgdG9vbENhbGxzLmxlbmd0aCA+IDApIHtcblx0XHRcdHNlcmlhbGl6ZWRUb29sQ2FsbHMgPSB0b29sQ2FsbHMubWFwKHRjID0+IHtcblx0XHRcdFx0aWYgKGNhcHMudG9vbElucHV0ID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IGlucHV0ID0gdHJ1bmModGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcgPyAnJyA6IGdldElubGluZVRvb2xJbnB1dCh0Yy50b29sSW5wdXQpID8/ICcnLCBjYXBzLnRvb2xJbnB1dCk7XG5cdFx0XHRcdFx0cmV0dXJuIGlucHV0ICE9PSB1bmRlZmluZWQgPyB7IG5hbWU6IHRjLnRvb2xOYW1lLCBpbnB1dCB9IDogeyBuYW1lOiB0Yy50b29sTmFtZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0Yy50b29sTmFtZTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0dHVybjogd2luZG93U3RhcnQgKyBpbmRleCArIDEsXG5cdFx0XHRzdGF0ZTogZGVzY3JpYmVUdXJuU3RhdGUoZW50cnkuc3RhdGUpLFxuXHRcdFx0Li4uKHVzZXIgIT09IHVuZGVmaW5lZCA/IHsgdXNlciB9IDoge30pLFxuXHRcdFx0Li4uKGFzc2lzdGFudCAhPT0gdW5kZWZpbmVkID8geyBhc3Npc3RhbnQgfSA6IHt9KSxcblx0XHRcdC4uLihzZXJpYWxpemVkVG9vbENhbGxzID8geyB0b29sQ2FsbHM6IHNlcmlhbGl6ZWRUb29sQ2FsbHMgfSA6IHt9KSxcblx0XHR9O1xuXHR9KTtcblxuXHRjb25zdCBwYXlsb2FkOiBJU2VyaWFsaXplZFNlc3Npb25Db250ZXh0ID0ge1xuXHRcdHNlc3Npb246IHNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRvcGVuTGluazogYnVpbGRPcGVuU2Vzc2lvbkxpbmtVcmkoc2Vzc2lvbiwgY2hhdElkKSxcblx0XHRkZXRhaWwsXG5cdFx0dHJhbnNjcmlwdCxcblx0XHRoYXNNb3JlSGlzdG9yeTogc25hcHNob3QuaGFzTW9yZUhpc3RvcnksXG5cdFx0dHJ1bmNhdGVkLFxuXHR9O1xuXHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkocGF5bG9hZCk7XG59XG5cbi8qKiBSZWFkcyBhbmQgc2VyaWFsaXplcyB0aGUgY29udGV4dCBvZiBhbiBleGlzdGluZyBzZXNzaW9uL2NoYXQuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYXBwbHlHZXRTZXNzaW9uQ29udGV4dFRvb2woYWNjZXNzb3I6IElTZXNzaW9uU2VydmVyVG9vbEFjY2Vzc29yLCByYXdBcmdzOiB1bmtub3duKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBhY2Nlc3Nvci5saXN0U2Vzc2lvbnMoKTtcblx0Y29uc3QgeyBzZXNzaW9uLCBjaGF0SWQsIGRldGFpbCwgdHJhbnNjcmlwdExpbWl0IH0gPSBnZXRTZXNzaW9uQ29udGV4dEFyZ3MocmF3QXJncywgc2Vzc2lvbnMpO1xuXHRjb25zdCBzbmFwc2hvdCA9IGF3YWl0IGFjY2Vzc29yLmdldENoYXRDb250ZXh0KHNlc3Npb24sIGNoYXRJZCk7XG5cdGlmICghc25hcHNob3QpIHtcblx0XHQvLyBObyBsaXZlIGNvbnZlcnNhdGlvbiBzdGF0ZSAoZS5nLiBhIGNvbGQvdW5zdWJzY3JpYmVkIHNlc3Npb24pOiByZXR1cm4gdGhlXG5cdFx0Ly8gaWRlbnRpdHkgKyBhbiBlbXB0eSB0cmFuc2NyaXB0LiBNZXRhZGF0YSBpcyBhdmFpbGFibGUgdmlhIGxpc3Rfc2Vzc2lvbnMuXG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdHNlc3Npb246IHNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdG9wZW5MaW5rOiBidWlsZE9wZW5TZXNzaW9uTGlua1VyaShzZXNzaW9uLCBjaGF0SWQpLFxuXHRcdFx0ZGV0YWlsLFxuXHRcdFx0dHJhbnNjcmlwdDogW10sXG5cdFx0XHRoYXNNb3JlSGlzdG9yeTogZmFsc2UsXG5cdFx0XHR0cnVuY2F0ZWQ6IGZhbHNlLFxuXHRcdH0gc2F0aXNmaWVzIElTZXJpYWxpemVkU2Vzc2lvbkNvbnRleHQpO1xuXHR9XG5cdHJldHVybiBzZXJpYWxpemVTZXNzaW9uQ29udGV4dChzZXNzaW9uLCBjaGF0SWQsIHNuYXBzaG90LCBkZXRhaWwsIHRyYW5zY3JpcHRMaW1pdCk7XG59XG5cblxuLyoqIFNlcmlhbGl6ZXMgdGhlIGN1cnJlbnQgc2Vzc2lvbidzIG1ldGFkYXRhICsgb3BlbiBsaW5rIGFzIHRoZSBgZ2V0X2N1cnJlbnRfc2Vzc2lvbmAgcmVzdWx0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNlcmlhbGl6ZUN1cnJlbnRTZXNzaW9uKGN1cnJlbnRTZXNzaW9uOiBVUkksIHNlc3Npb25zOiByZWFkb25seSBJQWdlbnRTZXNzaW9uTWV0YWRhdGFbXSk6IHN0cmluZyB7XG5cdGNvbnN0IG1ldGEgPSBzZXNzaW9ucy5maW5kKHMgPT4gcy5zZXNzaW9uLnRvU3RyaW5nKCkgPT09IGN1cnJlbnRTZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdHNlc3Npb246IGN1cnJlbnRTZXNzaW9uLnRvU3RyaW5nKCksXG5cdFx0b3Blbkxpbms6IGJ1aWxkT3BlblNlc3Npb25MaW5rVXJpKGN1cnJlbnRTZXNzaW9uKSxcblx0XHQuLi4obWV0YSA/IHNlcmlhbGl6ZVNlc3Npb24obWV0YSkgOiB7fSksXG5cdH0pO1xufVxuXG5pbnRlcmZhY2UgSURlbGV0ZVNlc3Npb25BcmdzIHtcblx0cmVhZG9ubHkgc2Vzc2lvbj86IHVua25vd247XG59XG5cbi8qKlxuICogVmFsaWRhdGVzIGRlbGV0ZS1zZXNzaW9uIGFyZ3VtZW50cyBhZ2FpbnN0IGN1cnJlbnQgc2Vzc2lvbnMgYW5kIHJlZnVzZXMgdG9cbiAqIGRlbGV0ZSB7QGxpbmsgY3VycmVudFNlc3Npb259IChkZWxldGluZyB0aGUgc2Vzc2lvbiB0aGUgdG9vbCBydW5zIGluIHdvdWxkXG4gKiB0ZWFyIGRvd24gaXRzIG93biBjb252ZXJzYXRpb24pLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0RGVsZXRlU2Vzc2lvbkFyZ3MocmF3QXJnczogdW5rbm93biwgc2Vzc2lvbnM6IHJlYWRvbmx5IElBZ2VudFNlc3Npb25NZXRhZGF0YVtdLCBjdXJyZW50U2Vzc2lvbj86IFVSSSk6IFVSSSB7XG5cdGNvbnN0IGFyZ3MgPSAocmF3QXJncyA/PyB7fSkgYXMgSURlbGV0ZVNlc3Npb25BcmdzO1xuXHRjb25zdCBzZXNzaW9uSW5wdXQgPSBnZXRSZXF1aXJlZFN0cmluZyhhcmdzLnNlc3Npb24sICdzZXNzaW9uJywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkRlbGV0ZVNlc3Npb24pO1xuXHRjb25zdCBzZXNzaW9uID0gcmVzb2x2ZUtub3duU2Vzc2lvbihzZXNzaW9uSW5wdXQsIHNlc3Npb25zKTtcblx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7U2Vzc2lvblNlcnZlclRvb2xOYW1lLkRlbGV0ZVNlc3Npb259IGlucHV0OiBzZXNzaW9uIG11c3QgbWF0Y2ggdGhlIFVSSSBvZiBhIGtub3duIHNlc3Npb24gKHNlZSBsaXN0X3Nlc3Npb25zKS5gKTtcblx0fVxuXHRpZiAoY3VycmVudFNlc3Npb24gJiYgc2Vzc2lvbi50b1N0cmluZygpID09PSBjdXJyZW50U2Vzc2lvbi50b1N0cmluZygpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7U2Vzc2lvblNlcnZlclRvb2xOYW1lLkRlbGV0ZVNlc3Npb259IGlucHV0OiByZWZ1c2luZyB0byBkZWxldGUgdGhlIGN1cnJlbnQgc2Vzc2lvbi5gKTtcblx0fVxuXHRyZXR1cm4gc2Vzc2lvbjtcbn1cblxuLyoqIERlbGV0ZXMgYSBzZXNzaW9uIGFuZCByZXR1cm5zIHRoZSBtb2RlbC1mYWNpbmcgY29uZmlybWF0aW9uLiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFwcGx5RGVsZXRlU2Vzc2lvblRvb2woYWNjZXNzb3I6IElTZXNzaW9uU2VydmVyVG9vbEFjY2Vzc29yLCByYXdBcmdzOiB1bmtub3duLCBjdXJyZW50U2Vzc2lvbj86IFVSSSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgYWNjZXNzb3IubGlzdFNlc3Npb25zKCk7XG5cdGNvbnN0IHNlc3Npb24gPSBnZXREZWxldGVTZXNzaW9uQXJncyhyYXdBcmdzLCBzZXNzaW9ucywgY3VycmVudFNlc3Npb24pO1xuXHRhd2FpdCBhY2Nlc3Nvci5kZWxldGVTZXNzaW9uKHNlc3Npb24pO1xuXHRyZXR1cm4gYERlbGV0ZWQgc2Vzc2lvbiAke3Nlc3Npb24udG9TdHJpbmcoKX0uIFJlcGx5IHdpdGggb25lIHNob3J0IHNlbnRlbmNlIGNvbmZpcm1pbmcgdGhlIHNlc3Npb24gd2FzIGRlbGV0ZWQuYDtcbn1cblxuZnVuY3Rpb24gZ2V0U2Vzc2lvblRvb2xEaXNwbGF5KHRvb2xOYW1lOiBzdHJpbmcsIF9hcmdzOiB1bmtub3duLCBfcmVzdWx0PzogSVNlcnZlclRvb2xEaXNwbGF5UmVzdWx0KTogSVNlcnZlclRvb2xEaXNwbGF5IHwgdW5kZWZpbmVkIHtcblx0c3dpdGNoICh0b29sTmFtZSkge1xuXHRcdGNhc2UgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkxpc3RTZXNzaW9uczpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgndG9vbE5hbWUubGlzdFNlc3Npb25zJywgXCJMaXN0IFNlc3Npb25zXCIpLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ3Rvb2xJbnZva2UubGlzdFNlc3Npb25zJywgXCJMaXN0IHNlc3Npb25zXCIpLFxuXHRcdFx0fTtcblx0XHRjYXNlIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5DcmVhdGVTZXNzaW9uOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCd0b29sTmFtZS5jcmVhdGVTZXNzaW9uJywgXCJDcmVhdGUgU2Vzc2lvblwiKSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCd0b29sSW52b2tlLmNyZWF0ZVNlc3Npb24nLCBcIkNyZWF0aW5nIHNlc3Npb25cIiksXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGxvY2FsaXplKCd0b29sQ29tcGxldGUuY3JlYXRlU2Vzc2lvbicsIFwiQ3JlYXRlZCBzZXNzaW9uXCIpLFxuXHRcdFx0fTtcblx0XHRjYXNlIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5DcmVhdGVDaGF0OlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCd0b29sTmFtZS5jcmVhdGVDaGF0JywgXCJDcmVhdGUgQ2hhdFwiKSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCd0b29sSW52b2tlLmNyZWF0ZUNoYXQnLCBcIkNyZWF0ZSBjaGF0XCIpLFxuXHRcdFx0fTtcblx0XHRjYXNlIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5SZW5hbWVDaGF0OlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCd0b29sTmFtZS5yZW5hbWVDaGF0JywgXCJSZW5hbWUgQ2hhdFwiKSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCd0b29sSW52b2tlLnJlbmFtZUNoYXQnLCBcIlJlbmFtaW5nIGNoYXRcIiksXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGxvY2FsaXplKCd0b29sQ29tcGxldGUucmVuYW1lQ2hhdCcsIFwiVXBkYXRlZCBjaGF0IG5hbWVcIiksXG5cdFx0XHR9O1xuXHRcdGNhc2UgU2Vzc2lvblNlcnZlclRvb2xOYW1lLlNlbmRNZXNzYWdlOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCd0b29sTmFtZS5zZW5kTWVzc2FnZScsIFwiU2VuZCBNZXNzYWdlXCIpLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ3Rvb2xJbnZva2Uuc2VuZE1lc3NhZ2UnLCBcIlNlbmQgbWVzc2FnZVwiKSxcblx0XHRcdH07XG5cdFx0Y2FzZSBTZXNzaW9uU2VydmVyVG9vbE5hbWUuR2V0U2Vzc2lvbkNvbnRleHQ6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ3Rvb2xOYW1lLmdldFNlc3Npb25Db250ZXh0JywgXCJHZXQgU2Vzc2lvbiBDb250ZXh0XCIpLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ3Rvb2xJbnZva2UuZ2V0U2Vzc2lvbkNvbnRleHQnLCBcIlJlYWQgc2Vzc2lvbiBjb250ZXh0XCIpLFxuXHRcdFx0fTtcblx0XHRjYXNlIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5HZXRDdXJyZW50U2Vzc2lvbjpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgndG9vbE5hbWUuZ2V0Q3VycmVudFNlc3Npb24nLCBcIkdldCBDdXJyZW50IFNlc3Npb25cIiksXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgndG9vbEludm9rZS5nZXRDdXJyZW50U2Vzc2lvbicsIFwiR2V0IGN1cnJlbnQgc2Vzc2lvblwiKSxcblx0XHRcdH07XG5cdFx0Y2FzZSBTZXNzaW9uU2VydmVyVG9vbE5hbWUuRGVsZXRlU2Vzc2lvbjpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgndG9vbE5hbWUuZGVsZXRlU2Vzc2lvbicsIFwiRGVsZXRlIFNlc3Npb25cIiksXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgndG9vbEludm9rZS5kZWxldGVTZXNzaW9uJywgXCJEZWxldGluZyBzZXNzaW9uXCIpLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBsb2NhbGl6ZSgndG9vbENvbXBsZXRlLmRlbGV0ZVNlc3Npb24nLCBcIkRlbGV0ZWQgc2Vzc2lvblwiKSxcblx0XHRcdH07XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuLyoqXG4gKiBDcmVhdGVzIHRoZSBzZXNzaW9uIHNlcnZlci10b29sIGdyb3VwIHdpdGggcHJvY2Vzcy1sb2NhbCByZWN1cnNpb24gcHJvdGVjdGlvbi5cbiAqXG4gKiBUaGUge0BsaW5rIGFjY2Vzc29yfSBpcyBvcHRpb25hbCBzbyB0aGUgZ3JvdXAgY2FuIGFsc28gYmFjayB0aGUgcHVyZSBkaXNwbGF5XG4gKiBwYXRoIChgZ2V0U2VydmVyVG9vbERpc3BsYXlgKSwgd2hpY2ggb25seSBuZWVkcyB7QGxpbmsgSVNlcnZlclRvb2xHcm91cC5kZWZpbml0aW9uc30sXG4gKiB7QGxpbmsgSVNlcnZlclRvb2xHcm91cC5nZXREaXNwbGF5fSBhbmQge0BsaW5rIElTZXJ2ZXJUb29sR3JvdXAuY2FuUmVxdWlyZUNvbmZpcm1hdGlvbn1cbiAqIGFuZCBuZXZlciBpbnZva2VzIHtAbGluayBJU2VydmVyVG9vbEdyb3VwLmV4ZWN1dGV9LiBgZXhlY3V0ZWAgdGhyb3dzIHdoZW4gbm9cbiAqIGFjY2Vzc29yIHdhcyBwcm92aWRlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVNlc3Npb25TZXJ2ZXJUb29sR3JvdXAoYWNjZXNzb3I/OiBJU2Vzc2lvblNlcnZlclRvb2xBY2Nlc3Nvcik6IElTZXJ2ZXJUb29sR3JvdXAge1xuXHRsZXQgY3JlYXRlZFNlc3Npb25Db3VudCA9IDA7XG5cdGxldCBjcmVhdGVkQ2hhdENvdW50ID0gMDtcblx0bGV0IHNlbnRNZXNzYWdlQ291bnQgPSAwO1xuXHRjb25zdCBncm91cDogSVNlcnZlclRvb2xHcm91cCA9IHtcblx0XHRkZWZpbml0aW9uczogc2Vzc2lvblNlcnZlclRvb2xEZWZpbml0aW9ucyxcblx0XHRpc0VuYWJsZWQodG9vbE5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdFx0cmV0dXJuIHRvb2xOYW1lICE9PSBTZXNzaW9uU2VydmVyVG9vbE5hbWUuUmVuYW1lQ2hhdCB8fCBhY2Nlc3Nvcj8uaXNBY3RpdmVBZ2VudFRpdGxlR2VuZXJhdGlvbkVuYWJsZWQoKSAhPT0gZmFsc2U7XG5cdFx0fSxcblx0XHRjYW5SZXF1aXJlQ29uZmlybWF0aW9uKHRvb2xOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRcdHJldHVybiBzZXNzaW9uVG9vbFJlcXVpcmVzQ29uZmlybWF0aW9uKHRvb2xOYW1lKTtcblx0XHR9LFxuXHRcdGdldERpc3BsYXkodG9vbE5hbWU6IHN0cmluZywgYXJnczogdW5rbm93biwgcmVzdWx0PzogSVNlcnZlclRvb2xEaXNwbGF5UmVzdWx0KTogSVNlcnZlclRvb2xEaXNwbGF5IHwgdW5kZWZpbmVkIHtcblx0XHRcdHJldHVybiBnZXRTZXNzaW9uVG9vbERpc3BsYXkodG9vbE5hbWUsIGFyZ3MsIHJlc3VsdCk7XG5cdFx0fSxcblx0XHRhc3luYyBleGVjdXRlKF9zdGF0ZU1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlciwgc2Vzc2lvblVyaTogUHJvdG9jb2xVUkksIHRvb2xOYW1lOiBzdHJpbmcsIHJhd0FyZ3M6IHVua25vd24pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdFx0aWYgKCFhY2Nlc3Nvcikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gc2VydmVyIHRvb2wgXCIke3Rvb2xOYW1lfVwiIGNhbm5vdCBydW46IHRoZSBncm91cCB3YXMgYnVpbHQgd2l0aG91dCBhIHNlc3Npb24gYWNjZXNzb3IuYCk7XG5cdFx0XHR9XG5cdFx0XHRzd2l0Y2ggKHRvb2xOYW1lKSB7XG5cdFx0XHRcdGNhc2UgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkxpc3RTZXNzaW9uczpcblx0XHRcdFx0XHRyZXR1cm4gc2VyaWFsaXplU2Vzc2lvbnMoZmlsdGVyU2Vzc2lvbnMoYXdhaXQgYWNjZXNzb3IubGlzdFNlc3Npb25zKCksIGdldExpc3RTZXNzaW9uc0FyZ3MocmF3QXJncykpKTtcblx0XHRcdFx0Y2FzZSBTZXNzaW9uU2VydmVyVG9vbE5hbWUuR2V0Q3VycmVudFNlc3Npb246XG5cdFx0XHRcdFx0cmV0dXJuIHNlcmlhbGl6ZUN1cnJlbnRTZXNzaW9uKGN1cnJlbnRTZXNzaW9uVXJpKHNlc3Npb25VcmkpLCBhd2FpdCBhY2Nlc3Nvci5saXN0U2Vzc2lvbnMoKSk7XG5cdFx0XHRcdGNhc2UgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZVNlc3Npb246IHtcblx0XHRcdFx0XHRpZiAoY3JlYXRlZFNlc3Npb25Db3VudCA+PSBtYXhDcmVhdGVkU2Vzc2lvbnMpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgUmVmdXNpbmcgdG8gY3JlYXRlIG1vcmUgdGhhbiAke21heENyZWF0ZWRTZXNzaW9uc30gc2Vzc2lvbnMgZnJvbSBzZXJ2ZXIgdG9vbHMgaW4gdGhpcyBwcm9jZXNzLmApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhcHBseUNyZWF0ZVNlc3Npb25Ub29sKGFjY2Vzc29yLCByYXdBcmdzLCBVUkkucGFyc2Uoc2Vzc2lvblVyaSkpO1xuXHRcdFx0XHRcdGNyZWF0ZWRTZXNzaW9uQ291bnQrKztcblx0XHRcdFx0XHRyZXR1cm4gZm9ybWF0Q3JlYXRlU2Vzc2lvblJlc3VsdChyZXN1bHQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZUNoYXQ6IHtcblx0XHRcdFx0XHRpZiAoY3JlYXRlZENoYXRDb3VudCA+PSBtYXhDcmVhdGVkQ2hhdHMpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgUmVmdXNpbmcgdG8gY3JlYXRlIG1vcmUgdGhhbiAke21heENyZWF0ZWRDaGF0c30gY2hhdHMgZnJvbSBzZXJ2ZXIgdG9vbHMgaW4gdGhpcyBwcm9jZXNzLmApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhcHBseUNyZWF0ZUNoYXRUb29sKGFjY2Vzc29yLCByYXdBcmdzLCBVUkkucGFyc2Uoc2Vzc2lvblVyaSkpO1xuXHRcdFx0XHRcdGNyZWF0ZWRDaGF0Q291bnQrKztcblx0XHRcdFx0XHRyZXR1cm4gZm9ybWF0Q3JlYXRlQ2hhdFJlc3VsdChyZXN1bHQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgU2Vzc2lvblNlcnZlclRvb2xOYW1lLlJlbmFtZUNoYXQ6XG5cdFx0XHRcdFx0cmV0dXJuIGFwcGx5UmVuYW1lQ2hhdFRvb2woYWNjZXNzb3IsIHJhd0FyZ3MsIHNlc3Npb25VcmkpO1xuXHRcdFx0XHRjYXNlIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5TZW5kTWVzc2FnZToge1xuXHRcdFx0XHRcdGlmIChzZW50TWVzc2FnZUNvdW50ID49IG1heFNlbnRNZXNzYWdlcykge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBSZWZ1c2luZyB0byBzZW5kIG1vcmUgdGhhbiAke21heFNlbnRNZXNzYWdlc30gbWVzc2FnZXMgZnJvbSBzZXJ2ZXIgdG9vbHMgaW4gdGhpcyBwcm9jZXNzLmApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhcHBseVNlbmRNZXNzYWdlVG9vbChhY2Nlc3NvciwgcmF3QXJncywgc2Vzc2lvblVyaSk7XG5cdFx0XHRcdFx0c2VudE1lc3NhZ2VDb3VudCsrO1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBTZXNzaW9uU2VydmVyVG9vbE5hbWUuR2V0U2Vzc2lvbkNvbnRleHQ6XG5cdFx0XHRcdFx0cmV0dXJuIGFwcGx5R2V0U2Vzc2lvbkNvbnRleHRUb29sKGFjY2Vzc29yLCByYXdBcmdzKTtcblx0XHRcdFx0Y2FzZSBTZXNzaW9uU2VydmVyVG9vbE5hbWUuRGVsZXRlU2Vzc2lvbjpcblx0XHRcdFx0XHRyZXR1cm4gYXBwbHlEZWxldGVTZXNzaW9uVG9vbChhY2Nlc3NvciwgcmF3QXJncywgY3VycmVudFNlc3Npb25Vcmkoc2Vzc2lvblVyaSkpO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biBzZXNzaW9uIHNlcnZlciB0b29sOiAke3Rvb2xOYW1lfWApO1xuXHRcdFx0fVxuXHRcdH0sXG5cdH07XG5cdHJldHVybiBncm91cDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsV0FBVztBQUVwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG9CQUEwSDtBQUNuSSxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGNBQWMscUJBQXFCLG9CQUFvQixrQ0FBa0Msa0JBQWtCLHlCQUF5QixxQkFBcUIsY0FBYyxxQkFBcUIsd0JBQXdCLGtCQUFrQixnQkFBZ0IsaUJBQW9KO0FBQ25aLFNBQVMseUJBQXlCLDRCQUE0QiwrQkFBK0I7QUFD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
