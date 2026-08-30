import { createRequire } from "module";
import { readFileSync, realpathSync, writeFileSync } from "fs";
import { FileAccess } from "../../../../../../base/common/network.js";
import { dirname, win32 } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { scrubUserName } from "./userNameScrub.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { assertSnapshot } from "../../../../../../base/test/common/snapshot.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallContributorKind, ToolResultContentType, buildDefaultChatUri } from "../../../../common/state/sessionState.js";
const nodeRequire = createRequire(import.meta.url);
const yamlModule = nodeRequire("js-yaml");
const PLACEHOLDER_RE = /^\$\{(?<kind>[a-zA-Z]+)_(?<index>\d+)\}$/;
const AgentHostUpdateAhpSnapshotsEnvVar = "AGENT_HOST_UPDATE_AHP_SNAPSHOTS";
const AgentHostUpdateSnapshotsEnvVar = "AGENT_HOST_UPDATE_SNAPSHOTS";
const UPDATE_AHP_SNAPSHOTS = process.env[AgentHostUpdateAhpSnapshotsEnvVar] === "1";
const UPDATE_ALL_SNAPSHOTS = process.env[AgentHostUpdateSnapshotsEnvVar] === "1";
class AhpSnapshotRecorder {
  constructor() {
    this._messages = [];
    this._roundStarts = [];
  }
  setNormalization(normalization) {
    this._normalization = normalization;
  }
  record(direction, message) {
    this._messages.push({ direction, message });
  }
  beginRound() {
    this._roundStarts.push(this._messages.length);
  }
  clear() {
    this._messages.length = 0;
    this._roundStarts.length = 0;
  }
  serialize(options = {}) {
    const profile = options.profile ?? "protocol";
    const clientRequests = /* @__PURE__ */ new Map();
    const serverRequests = /* @__PURE__ */ new Map();
    const channels = /* @__PURE__ */ new Map();
    const channelCounts = /* @__PURE__ */ new Map();
    const turns = /* @__PURE__ */ new Map();
    const toolCalls = /* @__PURE__ */ new Map();
    const toolCallNames = /* @__PURE__ */ new Map();
    const responseParts = /* @__PURE__ */ new Map();
    const roundStarts = this._roundStarts.length > 0 ? this._roundStarts : [0];
    const rounds = roundStarts.map(() => ({ clientToServer: [], serverToClient: [] }));
    let roundIndex = 0;
    for (let messageIndex = 0; messageIndex < this._messages.length; messageIndex++) {
      while (roundIndex + 1 < roundStarts.length && messageIndex >= roundStarts[roundIndex + 1]) {
        roundIndex++;
      }
      const { direction, message } = this._messages[messageIndex];
      let projected;
      if (isMethodMessage(message)) {
        if (message.id !== void 0) {
          (direction === "c2s" ? clientRequests : serverRequests).set(message.id, message.method);
        }
        if (message.method === "root/sessionSummaryChanged" || message.method === "notifications/tools/list_changed") {
          continue;
        }
        if (message.method === "dispatchAction" || message.method === "action") {
          const params = asRecord(message.params);
          const action = params?.action;
          if (action) {
            if (options.ignoredActionTypes?.includes(action.type)) {
              continue;
            }
            if (action.type === ActionType.SessionCustomizationUpdated) {
              continue;
            }
            if (profile === "behavior" && isBehaviorSnapshotNoise(action.type)) {
              continue;
            }
            const channel = typeof params?.channel === "string" ? params.channel : "";
            const projectedAction = projectAction(action, turns, toolCalls, toolCallNames, responseParts, channel, profile, new Set(options.omitToolCallSuccessForToolNames));
            if (!projectedAction) {
              continue;
            }
            projected = {
              channel: normalizeChannel(params?.channel, channels, channelCounts),
              action: projectedAction
            };
          } else {
            projected = { method: message.method };
          }
        } else {
          projected = { method: message.method };
        }
      } else if (isResponseMessage(message)) {
        const requests = direction === "c2s" ? serverRequests : clientRequests;
        projected = {
          responseTo: requests.get(message.id) ?? `request-${message.id}`,
          ...message.error ? { error: { code: message.error.code, message: message.error.message } } : { result: "success" }
        };
      } else {
        projected = { message: "unparsed" };
      }
      (direction === "c2s" ? rounds[roundIndex].clientToServer : rounds[roundIndex].serverToClient).push(projected);
    }
    for (const round of rounds) {
      round.serverToClient = dropReasoning(round.serverToClient);
      normalizeSnapshotObjects(round.clientToServer, this._normalization);
      normalizeSnapshotObjects(round.serverToClient, this._normalization);
    }
    return serializeFixture({ version: 1, rounds });
  }
}
async function assertRecordedAhpSnapshot(test, client, options) {
  const actual = client.serializeAhpSnapshot(options);
  if (UPDATE_AHP_SNAPSHOTS || UPDATE_ALL_SNAPSHOTS) {
    writeFileSync(snapshotPathForTest(test, "traffic", "ahp.yaml"), actual);
    return;
  }
  await assertSnapshot(actual, { name: "traffic", extension: "ahp.yaml" });
}
class AhpSnapshotScenario {
  constructor(_fixturePath, _fixture) {
    this._fixturePath = _fixturePath;
    this._fixture = _fixture;
  }
  static load(test) {
    const fixturePath = snapshotPathForTest(test, "traffic", "ahp.yaml");
    return new AhpSnapshotScenario(fixturePath, parseFixture(yamlModule.load(readFileSync(fixturePath, "utf8")), fixturePath));
  }
  get clientId() {
    for (const round of this._fixture.rounds) {
      for (const entry of round.clientToServer) {
        if (entry.action?.type === ActionType.SessionActiveClientSet) {
          return readString(readRecord(entry.action.activeClient, "activeClient"), "clientId");
        }
      }
    }
    throw new Error("[ahp-snapshot] scenario must set an active client so its client id can initialize the session");
  }
  async run(client, sessionUri, options) {
    const bindings = /* @__PURE__ */ new Map([
      ["${session_0}", sessionUri],
      ["${chat_0}", buildDefaultChatUri(sessionUri)]
    ]);
    const seenPrerequisites = /* @__PURE__ */ new Set();
    let clientSeq = 1;
    for (const round of this._fixture.rounds) {
      const notificationsBeforeRound = new Set(client.receivedNotifications());
      client.beginAhpSnapshotRound();
      for (const entry of round.clientToServer) {
        if (!entry.channel || !entry.action) {
          throw new Error("[ahp-snapshot] clientToServer entries must be dispatch actions");
        }
        await bindPrerequisites(client, entry.action, bindings, seenPrerequisites);
        bindGeneratedIdentifiers(entry.action, bindings);
        client.dispatch({
          channel: resolvePlaceholder(entry.channel, bindings),
          clientSeq: clientSeq++,
          action: parseClientAction(resolvePlaceholders(entry.action, bindings))
        });
      }
      await waitForFinalServerMessage(client, round.serverToClient, notificationsBeforeRound, bindings);
    }
    const actual = client.serializeAhpSnapshot(options);
    if (UPDATE_AHP_SNAPSHOTS || UPDATE_ALL_SNAPSHOTS) {
      const actualFixture = parseFixture(yamlModule.load(actual), "recorded AHP traffic");
      if (actualFixture.rounds.length !== this._fixture.rounds.length) {
        throw new Error(`[ahp-snapshot] expected ${this._fixture.rounds.length} recorded rounds, got ${actualFixture.rounds.length}`);
      }
      writeFileSync(this._fixturePath, serializeFixture({
        version: 1,
        rounds: this._fixture.rounds.map((round, index) => ({
          clientToServer: round.clientToServer,
          serverToClient: actualFixture.rounds[index].serverToClient
        }))
      }));
    } else {
      await assertSnapshot(actual, { name: "traffic", extension: "ahp.yaml" });
    }
  }
}
function isMethodMessage(message) {
  return "method" in message && typeof message.method === "string";
}
function isResponseMessage(message) {
  return "id" in message && typeof message.id === "number" && !("method" in message);
}
function asRecord(value) {
  return value !== null && typeof value === "object" ? value : void 0;
}
function normalizeChannel(value, channels, channelCounts) {
  if (typeof value !== "string") {
    return "${channel}";
  }
  const existing = channels.get(value);
  if (existing) {
    return existing;
  }
  let kind = "channel";
  try {
    const scheme = URI.parse(value).scheme;
    if (scheme === "agenthost") {
      return value;
    }
    kind = scheme === "ahp-chat" ? "chat" : scheme.includes("terminal") ? "terminal" : "session";
  } catch {
  }
  const index = channelCounts.get(kind) ?? 0;
  channelCounts.set(kind, index + 1);
  const normalized = `\${${kind}_${index}}`;
  channels.set(value, normalized);
  return normalized;
}
function projectAction(action, turns, toolCalls, toolCallNames, responseParts, channel, profile, omitToolCallSuccessForToolNames) {
  switch (action.type) {
    case ActionType.SessionActiveClientSet:
      return {
        type: action.type,
        activeClient: {
          clientId: action.activeClient.clientId,
          displayName: action.activeClient.displayName,
          tools: action.activeClient.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          }))
        }
      };
    case ActionType.ChatTurnStarted:
      return {
        type: action.type,
        turnId: normalizeIdentifier(action.turnId, "turn", turns),
        message: {
          text: action.message.text,
          origin: { kind: action.message.origin.kind },
          ...action.message.model ? { model: { id: action.message.model.id } } : {}
        }
      };
    case ActionType.ChatResponsePart: {
      if (action.part.kind === ResponsePartKind.Markdown || action.part.kind === ResponsePartKind.Reasoning) {
        const part = { kind: action.part.kind, content: action.part.content };
        responseParts.set(responsePartKey(channel, action.part.id), part);
        return {
          type: action.type,
          turnId: normalizeIdentifier(action.turnId, "turn", turns),
          part
        };
      }
      return {
        type: action.type,
        turnId: normalizeIdentifier(action.turnId, "turn", turns),
        part: { kind: action.part.kind }
      };
    }
    case ActionType.ChatDelta: {
      const part = responseParts.get(responsePartKey(channel, action.partId));
      if (part) {
        part.content += action.content;
        return void 0;
      }
      return {
        type: action.type,
        turnId: normalizeIdentifier(action.turnId, "turn", turns),
        content: action.content
      };
    }
    case ActionType.ChatToolCallStart: {
      const toolName = normalizeShellToolName(action.toolName);
      toolCallNames.set(action.toolCallId, action.toolName);
      return {
        type: action.type,
        turnId: normalizeIdentifier(action.turnId, "turn", turns),
        toolCallId: normalizeIdentifier(action.toolCallId, "toolCall", toolCalls),
        toolName,
        ...profile === "protocol" ? {
          displayName: action.displayName,
          contributor: projectContributor(action.contributor)
        } : {}
      };
    }
    case ActionType.ChatToolCallReady:
      return {
        type: action.type,
        turnId: normalizeIdentifier(action.turnId, "turn", turns),
        toolCallId: normalizeIdentifier(action.toolCallId, "toolCall", toolCalls),
        invocationMessage: projectStringOrMarkdown(action.invocationMessage),
        toolInput: action.toolInput,
        confirmed: action.confirmed
      };
    case ActionType.ChatToolCallConfirmed:
      return {
        type: action.type,
        turnId: normalizeIdentifier(action.turnId, "turn", turns),
        toolCallId: normalizeIdentifier(action.toolCallId, "toolCall", toolCalls),
        approved: action.approved,
        ...action.approved ? { confirmed: action.confirmed } : { reason: action.reason }
      };
    case ActionType.ChatToolCallComplete:
      return {
        type: action.type,
        turnId: normalizeIdentifier(action.turnId, "turn", turns),
        toolCallId: normalizeIdentifier(action.toolCallId, "toolCall", toolCalls),
        ...profile === "protocol" || !omitToolCallSuccessForToolNames.has(toolCallNames.get(action.toolCallId) ?? "") ? {
          result: {
            success: action.result.success,
            ...profile === "protocol" ? {
              pastTenseMessage: projectStringOrMarkdown(action.result.pastTenseMessage),
              content: action.result.content?.map((content) => content.type === ToolResultContentType.Text ? { type: content.type, text: content.text } : { type: content.type })
            } : {}
          }
        } : {}
      };
    case ActionType.ChatError:
      return profile === "behavior" ? {
        type: action.type,
        turnId: normalizeIdentifier(action.turnId, "turn", turns),
        error: {
          errorType: action.error.errorType,
          message: action.error.message
        }
      } : { type: action.type };
    case ActionType.ChatUsage:
    case ActionType.ChatTurnComplete:
      return { type: action.type, turnId: normalizeIdentifier(action.turnId, "turn", turns) };
    default:
      return { type: action.type };
  }
}
function dropReasoning(actions) {
  return actions.filter((entry) => {
    const action = entry.action;
    return action?.type !== ActionType.ChatReasoning && !(action?.type === ActionType.ChatResponsePart && action.part?.kind === ResponsePartKind.Reasoning);
  });
}
function normalizeShellToolName(toolName) {
  const shellToolPlaceholders = {
    bash: "${shell}",
    powershell: "${shell}",
    read_bash: "${read_shell}",
    read_powershell: "${read_shell}",
    write_bash: "${write_shell}",
    write_powershell: "${write_shell}",
    stop_bash: "${stop_shell}",
    stop_powershell: "${stop_shell}",
    bash_shutdown: "${shell_shutdown}",
    powershell_shutdown: "${shell_shutdown}",
    list_bash: "${list_shell}",
    list_powershell: "${list_shell}"
  };
  return shellToolPlaceholders[toolName] ?? toolName;
}
function isBehaviorSnapshotNoise(type) {
  switch (type) {
    case ActionType.SessionChatUpdated:
    case ActionType.SessionServerToolsChanged:
    case ActionType.SessionInputNeededSet:
    case ActionType.SessionInputNeededRemoved:
    case ActionType.SessionCustomizationsChanged:
    case ActionType.SessionChangesetsChanged:
    case ActionType.SessionMetaChanged:
    case ActionType.SessionActivityChanged:
    case ActionType.ChatActivityChanged:
    case ActionType.ChatUsage:
    case ActionType.ChatToolCallDelta:
    case ActionType.ChatToolCallReady:
    case ActionType.ChatToolCallConfirmed:
    case ActionType.ChatToolCallContentChanged:
      return true;
    default:
      return false;
  }
}
function responsePartKey(channel, partId) {
  return `${channel}\0${partId}`;
}
function normalizeIdentifier(value, kind, identifiers) {
  let normalized = identifiers.get(value);
  if (!normalized) {
    normalized = `\${${kind}_${identifiers.size}}`;
    identifiers.set(value, normalized);
  }
  return normalized;
}
function projectContributor(contributor) {
  if (!contributor) {
    return void 0;
  }
  return contributor.kind === ToolCallContributorKind.Client ? { kind: contributor.kind, clientId: contributor.clientId } : { kind: contributor.kind, customizationId: contributor.customizationId };
}
function projectStringOrMarkdown(value) {
  return typeof value === "string" ? value : value.markdown;
}
function normalizeSnapshotObjects(values, normalization) {
  if (!normalization) {
    return;
  }
  for (let index = 0; index < values.length; index++) {
    values[index] = normalizeSnapshotObject(values[index], normalization);
  }
}
function normalizeSnapshotObject(value, normalization) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeSnapshotValue(item, normalization));
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = normalizeSnapshotValue(item, normalization);
  }
  return result;
}
function normalizeSnapshotValue(value, normalization) {
  if (typeof value === "string") {
    return normalizeSnapshotText(value, normalization);
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeSnapshotValue(item, normalization));
  }
  if (value && typeof value === "object") {
    return normalizeSnapshotObject(value, normalization);
  }
  return value;
}
function normalizeSnapshotText(value, normalization) {
  const workDirs = /* @__PURE__ */ new Set([normalization.workingDirectory]);
  try {
    workDirs.add(realpathSync.native(normalization.workingDirectory));
  } catch {
  }
  let normalized = value;
  normalized = normalized.replaceAll("\r\n", "\n").replaceAll("\\r\\n", "\\n");
  for (const workDir of [...workDirs].sort((a, b) => b.length - a.length)) {
    normalized = normalized.replaceAll(JSON.stringify(workDir).slice(1, -1), "${workdir}").replaceAll(workDir, "${workdir}").replaceAll(URI.file(workDir).toString(), "${workdir}");
  }
  normalized = normalized.replaceAll("/private${workdir}", "${workdir}");
  const tempRoots = new Set([...workDirs].flatMap((workDir) => [dirname(workDir), win32.dirname(workDir)]).filter((root) => root !== "."));
  for (const tempRoot of tempRoots) {
    const win32FileUri = win32.isAbsolute(tempRoot) ? `file:///${tempRoot.replaceAll("\\", "/")}` : void 0;
    const rootVariants = /* @__PURE__ */ new Set([
      tempRoot,
      JSON.stringify(tempRoot).slice(1, -1),
      URI.file(tempRoot).toString(),
      ...win32FileUri ? [win32FileUri] : []
    ]);
    for (const rootVariant of [...rootVariants].sort((a, b) => b.length - a.length)) {
      const escapedRoot = escapeRegExpCharacters(rootVariant);
      normalized = normalized.replace(new RegExp(`${escapedRoot}(?:/|\\\\|\\\\\\\\)ahp-coverage-[^\\s\`"')]*`, "g"), "${workdir}");
    }
  }
  normalized = normalized.replaceAll(normalization.homeDirectory, "${homedir}").replaceAll(URI.file(normalization.homeDirectory).toString(), "${homedir}");
  normalized = scrubUserName(normalized, normalization.userName);
  if (!normalized.includes("${temp}")) {
    normalized = normalized.replace(/ahp-coverage-([a-z-]+)-[A-Za-z0-9]{6}/g, "ahp-coverage-$1-${temp}");
  }
  normalized = normalized.replace(/<shellId: \d+/g, "<shellId: ${shellId}");
  return normalized.replace(/^[dlcbps-][rwxStTs-]{9}[+@.]?\s+\d+\s+\S+\s+\S+\s+\d+\s+\w{3}\s+\d{1,2}\s+(?:\d{2}:\d{2}|\d{4})\s+/gm, "${listing} ");
}
function escapeRegExpCharacters(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function snapshotPathForTest(test, name, extension) {
  if (!test.file) {
    throw new Error("[ahp-snapshot] current test file is not set");
  }
  const src = URI.joinPath(FileAccess.asFileUri(""), "../src");
  const parts = test.file.split(/[/\\]/g);
  const snapshotsDir = URI.joinPath(src, ...parts.slice(0, -1), "__snapshots__");
  const fileName = `${sanitizeName(test.fullTitle())}.${sanitizeName(name)}.${extension}`;
  return URI.joinPath(snapshotsDir, fileName).fsPath;
}
function sanitizeName(name) {
  return name.replace(/[^a-z0-9_-]/gi, "_");
}
function parseFixture(value, fixturePath) {
  const fixture = readRecord(value, "fixture");
  if (fixture.version !== 1) {
    throw new Error(`[ahp-snapshot] unsupported fixture version in ${fixturePath}`);
  }
  if (!Array.isArray(fixture.rounds) || fixture.rounds.length === 0) {
    throw new Error(`[ahp-snapshot] rounds must be a non-empty array in ${fixturePath}`);
  }
  return {
    version: 1,
    rounds: fixture.rounds.map((value2, index) => {
      const round = readRecord(value2, `rounds[${index}]`);
      return {
        clientToServer: readEntries(round.clientToServer, `rounds[${index}].clientToServer`),
        serverToClient: readEntries(round.serverToClient, `rounds[${index}].serverToClient`)
      };
    })
  };
}
function serializeFixture(fixture) {
  return yamlModule.dump(fixture, { lineWidth: -1, noRefs: true });
}
function readEntries(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(`[ahp-snapshot] ${name} must be an array`);
  }
  return value.map((item, index) => {
    const entry = readRecord(item, `${name}[${index}]`);
    return {
      channel: readOptionalString(entry, "channel"),
      action: entry.action === void 0 ? void 0 : readRecord(entry.action, `${name}[${index}].action`),
      method: readOptionalString(entry, "method")
    };
  });
}
async function bindPrerequisites(client, action, bindings, seenNotifications) {
  const actionType = readString(action, "type");
  if (actionType !== ActionType.ChatToolCallConfirmed) {
    return;
  }
  const notification = await client.waitForNotification((candidate) => {
    if (seenNotifications.has(candidate) || candidate.method !== "action") {
      return false;
    }
    const action2 = candidate.params.action;
    return action2.type === ActionType.ChatToolCallReady || action2.type === ActionType.ChatError;
  }, 9e4);
  seenNotifications.add(notification);
  const readyAction = notification.params.action;
  if (readyAction.type === ActionType.ChatError) {
    const replayError = client.takeReplayError();
    if (replayError) {
      throw replayError;
    }
    throw new Error(`[ahp-snapshot] turn failed before chat/toolCallReady: ${readyAction.error.errorType}: ${readyAction.error.message}`);
  }
  if (readyAction.type !== ActionType.ChatToolCallReady) {
    throw new Error("[ahp-snapshot] expected chat/toolCallReady prerequisite");
  }
  bindFieldPlaceholder(action, "toolCallId", readyAction.toolCallId, bindings);
}
function bindFieldPlaceholder(record, key, actual, bindings) {
  const expected = readString(record, key);
  if (!PLACEHOLDER_RE.test(expected)) {
    if (expected !== actual) {
      throw new Error(`[ahp-snapshot] expected ${key} ${expected}, got ${actual}`);
    }
    return;
  }
  const existing = bindings.get(expected);
  if (existing !== void 0 && existing !== actual) {
    throw new Error(`[ahp-snapshot] ${expected} was already bound to ${existing}, got ${actual}`);
  }
  bindings.set(expected, actual);
}
function bindGeneratedIdentifiers(value, bindings) {
  if (typeof value === "string") {
    const match = PLACEHOLDER_RE.exec(value);
    if (match?.groups?.kind === "turn" && !bindings.has(value)) {
      bindings.set(value, generateUuid());
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      bindGeneratedIdentifiers(item, bindings);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      bindGeneratedIdentifiers(item, bindings);
    }
  }
}
function resolvePlaceholders(value, bindings) {
  if (typeof value === "string") {
    return resolvePlaceholder(value, bindings);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolvePlaceholders(item, bindings));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolvePlaceholders(item, bindings)]));
  }
  return value;
}
function resolvePlaceholder(value, bindings) {
  if (!PLACEHOLDER_RE.test(value)) {
    return value;
  }
  const resolved = bindings.get(value);
  if (resolved === void 0) {
    throw new Error(`[ahp-snapshot] no value is bound for ${value}`);
  }
  return resolved;
}
function parseClientAction(value) {
  const action = readRecord(value, "action");
  switch (readString(action, "type")) {
    case ActionType.SessionActiveClientSet: {
      const activeClient = readRecord(action.activeClient, "activeClient");
      return {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: readString(activeClient, "clientId"),
          displayName: readOptionalString(activeClient, "displayName"),
          tools: readTools(activeClient.tools)
        }
      };
    }
    case ActionType.ChatTurnStarted: {
      const message = readRecord(action.message, "message");
      const origin = readRecord(message.origin, "message.origin");
      const model = message.model === void 0 ? void 0 : readRecord(message.model, "message.model");
      const originKind = readString(origin, "kind");
      if (originKind !== MessageKind.User) {
        throw new Error(`[ahp-snapshot] client turn origin must be ${MessageKind.User}`);
      }
      return {
        type: ActionType.ChatTurnStarted,
        turnId: readString(action, "turnId"),
        startedAt: (/* @__PURE__ */ new Date()).toISOString(),
        message: {
          text: readString(message, "text"),
          origin: { kind: MessageKind.User },
          ...model ? { model: { id: readString(model, "id") } } : {}
        }
      };
    }
    case ActionType.ChatToolCallConfirmed:
      if (action.approved !== true || action.confirmed !== ToolCallConfirmationReason.UserAction) {
        throw new Error("[ahp-snapshot] executable tool confirmations currently require user approval");
      }
      return {
        type: ActionType.ChatToolCallConfirmed,
        turnId: readString(action, "turnId"),
        toolCallId: readString(action, "toolCallId"),
        approved: true,
        confirmed: ToolCallConfirmationReason.UserAction
      };
    case ActionType.ChatToolCallComplete: {
      const result = readRecord(action.result, "result");
      return {
        type: ActionType.ChatToolCallComplete,
        turnId: readString(action, "turnId"),
        toolCallId: readString(action, "toolCallId"),
        result: {
          success: readBoolean(result, "success"),
          pastTenseMessage: readString(result, "pastTenseMessage"),
          content: readToolResultContent(result.content)
        }
      };
    }
    default:
      throw new Error(`[ahp-snapshot] unsupported executable client action: ${readString(action, "type")}`);
  }
}
function readTools(value) {
  if (!Array.isArray(value)) {
    throw new Error("[ahp-snapshot] activeClient.tools must be an array");
  }
  return value.map((item, index) => {
    const tool = readRecord(item, `tools[${index}]`);
    const inputSchema = tool.inputSchema === void 0 ? void 0 : readRecord(tool.inputSchema, `tools[${index}].inputSchema`);
    if (inputSchema && inputSchema.type !== "object") {
      throw new Error(`[ahp-snapshot] tools[${index}].inputSchema.type must be object`);
    }
    const properties = inputSchema?.properties === void 0 ? void 0 : readObjectProperties(inputSchema.properties, `tools[${index}].inputSchema.properties`);
    const required = inputSchema?.required === void 0 ? void 0 : readStringArray(inputSchema.required, `tools[${index}].inputSchema.required`);
    return {
      name: readString(tool, "name"),
      description: readOptionalString(tool, "description"),
      ...inputSchema ? { inputSchema: { type: "object", properties, required } } : {}
    };
  });
}
function readToolResultContent(value) {
  if (value === void 0) {
    return void 0;
  }
  if (!Array.isArray(value)) {
    throw new Error("[ahp-snapshot] tool result content must be an array");
  }
  return value.map((item, index) => {
    const content = readRecord(item, `result.content[${index}]`);
    if (content.type !== ToolResultContentType.Text) {
      throw new Error(`[ahp-snapshot] unsupported executable tool result content: ${String(content.type)}`);
    }
    return { type: ToolResultContentType.Text, text: readString(content, "text") };
  });
}
function readObjectProperties(value, name) {
  const properties = readRecord(value, name);
  for (const [key, property] of Object.entries(properties)) {
    if (!property || typeof property !== "object") {
      throw new Error(`[ahp-snapshot] ${name}.${key} must be an object`);
    }
  }
  return properties;
}
function readStringArray(value, name) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`[ahp-snapshot] ${name} must be a string array`);
  }
  return value;
}
async function waitForFinalServerMessage(client, entries, seenNotifications, bindings) {
  const finalEntry = entries.at(-1);
  if (!finalEntry) {
    throw new Error("[ahp-snapshot] serverToClient must not be empty");
  }
  const finalActionType = finalEntry.action ? readString(finalEntry.action, "type") : void 0;
  const finalChannel = finalEntry.channel ? resolvePlaceholder(finalEntry.channel, bindings) : void 0;
  const finalTurnIdPlaceholder = finalEntry.action ? readOptionalString(finalEntry.action, "turnId") : void 0;
  const finalTurnId = finalTurnIdPlaceholder ? resolvePlaceholder(finalTurnIdPlaceholder, bindings) : void 0;
  const notification = await client.waitForNotification((candidate) => {
    if (seenNotifications.has(candidate)) {
      return false;
    }
    if (candidate.method === "action") {
      const envelope = candidate.params;
      if (finalChannel && envelope.channel !== finalChannel) {
        return false;
      }
      const action = envelope.action;
      if (action.type === ActionType.ChatError) {
        return finalTurnId === void 0 || action.turnId === finalTurnId;
      }
      return action.type === finalActionType && (finalTurnId === void 0 || action.turnId === finalTurnId);
    }
    return candidate.method === finalEntry.method;
  }, 9e4);
  seenNotifications.add(notification);
  if (notification.method === "action") {
    const action = notification.params.action;
    if (action.type === ActionType.ChatError && finalActionType !== ActionType.ChatError) {
      const replayError = client.takeReplayError();
      if (replayError) {
        throw replayError;
      }
      throw new Error(`[ahp-snapshot] round failed before ${finalActionType}: ${action.error.errorType}: ${action.error.message}`);
    }
  }
}
function readRecord(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`[ahp-snapshot] ${name} must be an object`);
  }
  return value;
}
function readString(record, key) {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`[ahp-snapshot] ${key} must be a string`);
  }
  return value;
}
function readOptionalString(record, key) {
  const value = record[key];
  if (value !== void 0 && typeof value !== "string") {
    throw new Error(`[ahp-snapshot] ${key} must be a string`);
  }
  return value;
}
function readBoolean(record, key) {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`[ahp-snapshot] ${key} must be a boolean`);
  }
  return value;
}
export {
  AgentHostUpdateAhpSnapshotsEnvVar,
  AgentHostUpdateSnapshotsEnvVar,
  AhpSnapshotRecorder,
  AhpSnapshotScenario,
  assertRecordedAhpSnapshot,
  snapshotPathForTest
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxlMmVcXGhhcm5lc3NcXGFocFNuYXBzaG90LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgY3JlYXRlUmVxdWlyZSB9IGZyb20gJ21vZHVsZSc7XG5pbXBvcnQgeyByZWFkRmlsZVN5bmMsIHJlYWxwYXRoU3luYywgd3JpdGVGaWxlU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGRpcm5hbWUsIHdpbjMyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgc2NydWJVc2VyTmFtZSB9IGZyb20gJy4vdXNlck5hbWVTY3J1Yi5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGFzc2VydFNuYXBzaG90IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9zbmFwc2hvdC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlLCB0eXBlIEFjdGlvbkVudmVsb3BlLCB0eXBlIFN0YXRlQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgRGlzcGF0Y2hBY3Rpb25QYXJhbXMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHR5cGUgeyBBaHBOb3RpZmljYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VLaW5kLCBSZXNwb25zZVBhcnRLaW5kLCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiwgVG9vbENhbGxDb250cmlidXRvcktpbmQsIFRvb2xSZXN1bHRDb250ZW50VHlwZSwgYnVpbGREZWZhdWx0Q2hhdFVyaSwgdHlwZSBTdHJpbmdPck1hcmtkb3duLCB0eXBlIFRvb2xDYWxsQ29udHJpYnV0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcblxuY29uc3Qgbm9kZVJlcXVpcmUgPSBjcmVhdGVSZXF1aXJlKGltcG9ydC5tZXRhLnVybCk7XG5jb25zdCB5YW1sTW9kdWxlID0gbm9kZVJlcXVpcmUoJ2pzLXlhbWwnKSBhcyB7IGxvYWQoaW5wdXQ6IHN0cmluZyk6IHVua25vd247IGR1bXAob2JqOiB1bmtub3duLCBvcHRzPzogeyBsaW5lV2lkdGg/OiBudW1iZXI7IG5vUmVmcz86IGJvb2xlYW4gfSk6IHN0cmluZyB9O1xuY29uc3QgUExBQ0VIT0xERVJfUkUgPSAvXlxcJFxceyg/PGtpbmQ+W2EtekEtWl0rKV8oPzxpbmRleD5cXGQrKVxcfSQvO1xuXG5leHBvcnQgY29uc3QgQWdlbnRIb3N0VXBkYXRlQWhwU25hcHNob3RzRW52VmFyID0gJ0FHRU5UX0hPU1RfVVBEQVRFX0FIUF9TTkFQU0hPVFMnO1xuZXhwb3J0IGNvbnN0IEFnZW50SG9zdFVwZGF0ZVNuYXBzaG90c0VudlZhciA9ICdBR0VOVF9IT1NUX1VQREFURV9TTkFQU0hPVFMnO1xuXG5jb25zdCBVUERBVEVfQUhQX1NOQVBTSE9UUyA9IHByb2Nlc3MuZW52W0FnZW50SG9zdFVwZGF0ZUFocFNuYXBzaG90c0VudlZhcl0gPT09ICcxJztcbmNvbnN0IFVQREFURV9BTExfU05BUFNIT1RTID0gcHJvY2Vzcy5lbnZbQWdlbnRIb3N0VXBkYXRlU25hcHNob3RzRW52VmFyXSA9PT0gJzEnO1xuXG50eXBlIEFocFNuYXBzaG90RGlyZWN0aW9uID0gJ2MycycgfCAnczJjJztcblxuaW50ZXJmYWNlIElDYXB0dXJlZEFocE1lc3NhZ2Uge1xuXHRyZWFkb25seSBkaXJlY3Rpb246IEFocFNuYXBzaG90RGlyZWN0aW9uO1xuXHRyZWFkb25seSBtZXNzYWdlOiBvYmplY3Q7XG59XG5cbmludGVyZmFjZSBJTWV0aG9kTWVzc2FnZSB7XG5cdHJlYWRvbmx5IG1ldGhvZDogc3RyaW5nO1xuXHRyZWFkb25seSBpZD86IG51bWJlcjtcblx0cmVhZG9ubHkgcGFyYW1zPzogdW5rbm93bjtcbn1cblxuaW50ZXJmYWNlIElSZXNwb25zZU1lc3NhZ2Uge1xuXHRyZWFkb25seSBpZDogbnVtYmVyO1xuXHRyZWFkb25seSByZXN1bHQ/OiB1bmtub3duO1xuXHRyZWFkb25seSBlcnJvcj86IHtcblx0XHRyZWFkb25seSBjb2RlOiBudW1iZXI7XG5cdFx0cmVhZG9ubHkgbWVzc2FnZTogc3RyaW5nO1xuXHR9O1xufVxuXG5pbnRlcmZhY2UgSUFocFNuYXBzaG90RW50cnkge1xuXHRyZWFkb25seSBjaGFubmVsPzogc3RyaW5nO1xuXHRyZWFkb25seSBhY3Rpb24/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0cmVhZG9ubHkgbWV0aG9kPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSUFocFNuYXBzaG90Um91bmQge1xuXHRyZWFkb25seSBjbGllbnRUb1NlcnZlcjogcmVhZG9ubHkgSUFocFNuYXBzaG90RW50cnlbXTtcblx0cmVhZG9ubHkgc2VydmVyVG9DbGllbnQ6IHJlYWRvbmx5IElBaHBTbmFwc2hvdEVudHJ5W107XG59XG5cbmludGVyZmFjZSBJQWhwU25hcHNob3RGaXh0dXJlIHtcblx0cmVhZG9ubHkgdmVyc2lvbjogMTtcblx0cmVhZG9ubHkgcm91bmRzOiByZWFkb25seSBJQWhwU25hcHNob3RSb3VuZFtdO1xufVxuXG5pbnRlcmZhY2UgSUFocFNuYXBzaG90Q2xpZW50IHtcblx0YmVnaW5BaHBTbmFwc2hvdFJvdW5kKCk6IHZvaWQ7XG5cdGRpc3BhdGNoKHBhcmFtczogRGlzcGF0Y2hBY3Rpb25QYXJhbXMpOiB2b2lkO1xuXHRyZWNlaXZlZE5vdGlmaWNhdGlvbnMoKTogQWhwTm90aWZpY2F0aW9uW107XG5cdHdhaXRGb3JOb3RpZmljYXRpb24ocHJlZGljYXRlOiAobm90aWZpY2F0aW9uOiBBaHBOb3RpZmljYXRpb24pID0+IGJvb2xlYW4sIHRpbWVvdXRNcz86IG51bWJlcik6IFByb21pc2U8QWhwTm90aWZpY2F0aW9uPjtcblx0c2VyaWFsaXplQWhwU25hcHNob3Qob3B0aW9ucz86IElBaHBTbmFwc2hvdE9wdGlvbnMpOiBzdHJpbmc7XG5cdHRha2VSZXBsYXlFcnJvcigpOiBFcnJvciB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWhwU25hcHNob3RPcHRpb25zIHtcblx0cmVhZG9ubHkgcHJvZmlsZT86ICdwcm90b2NvbCcgfCAnYmVoYXZpb3InO1xuXHRyZWFkb25seSBpZ25vcmVkQWN0aW9uVHlwZXM/OiByZWFkb25seSBBY3Rpb25UeXBlW107XG5cdC8qKiBQcm92aWRlciB0b29sIG5hbWVzIHdob3NlIGNvbXBsZXRpb24gc3VjY2VzcyBpcyBvbWl0dGVkIGJlZm9yZSBzbmFwc2hvdCBuYW1lIG5vcm1hbGl6YXRpb24uICovXG5cdHJlYWRvbmx5IG9taXRUb29sQ2FsbFN1Y2Nlc3NGb3JUb29sTmFtZXM/OiByZWFkb25seSBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWhwU25hcHNob3ROb3JtYWxpemF0aW9uIHtcblx0cmVhZG9ubHkgd29ya2luZ0RpcmVjdG9yeTogc3RyaW5nO1xuXHRyZWFkb25seSBob21lRGlyZWN0b3J5OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHVzZXJOYW1lOiBzdHJpbmc7XG59XG5cbi8qKiBDYXB0dXJlcyBBSFAgd2lyZSBtZXNzYWdlcyBhbmQgc2VyaWFsaXplcyBhIHN0YWJsZSBzZW1hbnRpYyBwcm9qZWN0aW9uIGZvciBzbmFwc2hvdHMuICovXG5leHBvcnQgY2xhc3MgQWhwU25hcHNob3RSZWNvcmRlciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21lc3NhZ2VzOiBJQ2FwdHVyZWRBaHBNZXNzYWdlW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfcm91bmRTdGFydHM6IG51bWJlcltdID0gW107XG5cdHByaXZhdGUgX25vcm1hbGl6YXRpb246IElBaHBTbmFwc2hvdE5vcm1hbGl6YXRpb24gfCB1bmRlZmluZWQ7XG5cblx0c2V0Tm9ybWFsaXphdGlvbihub3JtYWxpemF0aW9uOiBJQWhwU25hcHNob3ROb3JtYWxpemF0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fbm9ybWFsaXphdGlvbiA9IG5vcm1hbGl6YXRpb247XG5cdH1cblxuXHRyZWNvcmQoZGlyZWN0aW9uOiBBaHBTbmFwc2hvdERpcmVjdGlvbiwgbWVzc2FnZTogb2JqZWN0KTogdm9pZCB7XG5cdFx0dGhpcy5fbWVzc2FnZXMucHVzaCh7IGRpcmVjdGlvbiwgbWVzc2FnZSB9KTtcblx0fVxuXG5cdGJlZ2luUm91bmQoKTogdm9pZCB7XG5cdFx0dGhpcy5fcm91bmRTdGFydHMucHVzaCh0aGlzLl9tZXNzYWdlcy5sZW5ndGgpO1xuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fbWVzc2FnZXMubGVuZ3RoID0gMDtcblx0XHR0aGlzLl9yb3VuZFN0YXJ0cy5sZW5ndGggPSAwO1xuXHR9XG5cblx0c2VyaWFsaXplKG9wdGlvbnM6IElBaHBTbmFwc2hvdE9wdGlvbnMgPSB7fSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgcHJvZmlsZSA9IG9wdGlvbnMucHJvZmlsZSA/PyAncHJvdG9jb2wnO1xuXHRcdGNvbnN0IGNsaWVudFJlcXVlc3RzID0gbmV3IE1hcDxudW1iZXIsIHN0cmluZz4oKTtcblx0XHRjb25zdCBzZXJ2ZXJSZXF1ZXN0cyA9IG5ldyBNYXA8bnVtYmVyLCBzdHJpbmc+KCk7XG5cdFx0Y29uc3QgY2hhbm5lbHMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGNvbnN0IGNoYW5uZWxDb3VudHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdGNvbnN0IHR1cm5zID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRjb25zdCB0b29sQ2FsbHMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGNvbnN0IHRvb2xDYWxsTmFtZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGNvbnN0IHJlc3BvbnNlUGFydHMgPSBuZXcgTWFwPHN0cmluZywgeyBjb250ZW50OiBzdHJpbmcgfT4oKTtcblx0XHRjb25zdCByb3VuZFN0YXJ0cyA9IHRoaXMuX3JvdW5kU3RhcnRzLmxlbmd0aCA+IDAgPyB0aGlzLl9yb3VuZFN0YXJ0cyA6IFswXTtcblx0XHRjb25zdCByb3VuZHMgPSByb3VuZFN0YXJ0cy5tYXAoKCkgPT4gKHsgY2xpZW50VG9TZXJ2ZXI6IFtdIGFzIG9iamVjdFtdLCBzZXJ2ZXJUb0NsaWVudDogW10gYXMgb2JqZWN0W10gfSkpO1xuXHRcdGxldCByb3VuZEluZGV4ID0gMDtcblxuXHRcdGZvciAobGV0IG1lc3NhZ2VJbmRleCA9IDA7IG1lc3NhZ2VJbmRleCA8IHRoaXMuX21lc3NhZ2VzLmxlbmd0aDsgbWVzc2FnZUluZGV4KyspIHtcblx0XHRcdHdoaWxlIChyb3VuZEluZGV4ICsgMSA8IHJvdW5kU3RhcnRzLmxlbmd0aCAmJiBtZXNzYWdlSW5kZXggPj0gcm91bmRTdGFydHNbcm91bmRJbmRleCArIDFdKSB7XG5cdFx0XHRcdHJvdW5kSW5kZXgrKztcblx0XHRcdH1cblx0XHRcdGNvbnN0IHsgZGlyZWN0aW9uLCBtZXNzYWdlIH0gPSB0aGlzLl9tZXNzYWdlc1ttZXNzYWdlSW5kZXhdO1xuXHRcdFx0bGV0IHByb2plY3RlZDogb2JqZWN0O1xuXHRcdFx0aWYgKGlzTWV0aG9kTWVzc2FnZShtZXNzYWdlKSkge1xuXHRcdFx0XHRpZiAobWVzc2FnZS5pZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0KGRpcmVjdGlvbiA9PT0gJ2MycycgPyBjbGllbnRSZXF1ZXN0cyA6IHNlcnZlclJlcXVlc3RzKS5zZXQobWVzc2FnZS5pZCwgbWVzc2FnZS5tZXRob2QpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIG5vdGlmaWNhdGlvbnMvdG9vbHMvbGlzdF9jaGFuZ2VkIGlzIGxlZ2l0aW1hdGUgYmVoYXZpb3IgKENvcGlsb3QgPj0gMS4wLjcyXG5cdFx0XHRcdC8vIGVtaXRzIHNlc3Npb24udG9vbHNfdXBkYXRlZCksIGJ1dCBpdCBpcyBvbmx5IGZvcndhcmRlZCBmb3IgTUNQIHNlcnZlcnNcblx0XHRcdFx0Ly8gaW4gdGhlIFJlYWR5IHN0YXRlLiBUaGUgaGFybmVzcyBydW5zIGFnYWluc3QgdGhlIHJlYWwgaG9tZWRpciwgc28gdGhlXG5cdFx0XHRcdC8vIG5vdGlmaWNhdGlvbiBhcHBlYXJzIHdoZW4gdGhlIGRldmVsb3BlcidzIH4vLmNvcGlsb3QgY29uZmlndXJlcyBNQ1Bcblx0XHRcdFx0Ly8gc2VydmVycyBhbmQgaXMgYWJzZW50IG9uIGNsZWFuIENJIHJ1bm5lcnMgXHUyMDE0IGl0IGNhbm5vdCBsaXZlIGluIGFcblx0XHRcdFx0Ly8gbWFjaGluZS1pbmRlcGVuZGVudCBzbmFwc2hvdC5cblx0XHRcdFx0aWYgKG1lc3NhZ2UubWV0aG9kID09PSAncm9vdC9zZXNzaW9uU3VtbWFyeUNoYW5nZWQnIHx8IG1lc3NhZ2UubWV0aG9kID09PSAnbm90aWZpY2F0aW9ucy90b29scy9saXN0X2NoYW5nZWQnKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG1lc3NhZ2UubWV0aG9kID09PSAnZGlzcGF0Y2hBY3Rpb24nIHx8IG1lc3NhZ2UubWV0aG9kID09PSAnYWN0aW9uJykge1xuXHRcdFx0XHRcdGNvbnN0IHBhcmFtcyA9IGFzUmVjb3JkKG1lc3NhZ2UucGFyYW1zKTtcblx0XHRcdFx0XHRjb25zdCBhY3Rpb24gPSBwYXJhbXM/LmFjdGlvbiBhcyBTdGF0ZUFjdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAoYWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRpZiAob3B0aW9ucy5pZ25vcmVkQWN0aW9uVHlwZXM/LmluY2x1ZGVzKGFjdGlvbi50eXBlKSkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWQpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAocHJvZmlsZSA9PT0gJ2JlaGF2aW9yJyAmJiBpc0JlaGF2aW9yU25hcHNob3ROb2lzZShhY3Rpb24udHlwZSkpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBjaGFubmVsID0gdHlwZW9mIHBhcmFtcz8uY2hhbm5lbCA9PT0gJ3N0cmluZycgPyBwYXJhbXMuY2hhbm5lbCA6ICcnO1xuXHRcdFx0XHRcdFx0Y29uc3QgcHJvamVjdGVkQWN0aW9uID0gcHJvamVjdEFjdGlvbihhY3Rpb24sIHR1cm5zLCB0b29sQ2FsbHMsIHRvb2xDYWxsTmFtZXMsIHJlc3BvbnNlUGFydHMsIGNoYW5uZWwsIHByb2ZpbGUsIG5ldyBTZXQob3B0aW9ucy5vbWl0VG9vbENhbGxTdWNjZXNzRm9yVG9vbE5hbWVzKSk7XG5cdFx0XHRcdFx0XHRpZiAoIXByb2plY3RlZEFjdGlvbikge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHByb2plY3RlZCA9IHtcblx0XHRcdFx0XHRcdFx0Y2hhbm5lbDogbm9ybWFsaXplQ2hhbm5lbChwYXJhbXM/LmNoYW5uZWwsIGNoYW5uZWxzLCBjaGFubmVsQ291bnRzKSxcblx0XHRcdFx0XHRcdFx0YWN0aW9uOiBwcm9qZWN0ZWRBY3Rpb24sXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRwcm9qZWN0ZWQgPSB7IG1ldGhvZDogbWVzc2FnZS5tZXRob2QgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cHJvamVjdGVkID0geyBtZXRob2Q6IG1lc3NhZ2UubWV0aG9kIH07XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoaXNSZXNwb25zZU1lc3NhZ2UobWVzc2FnZSkpIHtcblx0XHRcdFx0Y29uc3QgcmVxdWVzdHMgPSBkaXJlY3Rpb24gPT09ICdjMnMnID8gc2VydmVyUmVxdWVzdHMgOiBjbGllbnRSZXF1ZXN0cztcblx0XHRcdFx0cHJvamVjdGVkID0ge1xuXHRcdFx0XHRcdHJlc3BvbnNlVG86IHJlcXVlc3RzLmdldChtZXNzYWdlLmlkKSA/PyBgcmVxdWVzdC0ke21lc3NhZ2UuaWR9YCxcblx0XHRcdFx0XHQuLi4obWVzc2FnZS5lcnJvciA/IHsgZXJyb3I6IHsgY29kZTogbWVzc2FnZS5lcnJvci5jb2RlLCBtZXNzYWdlOiBtZXNzYWdlLmVycm9yLm1lc3NhZ2UgfSB9IDogeyByZXN1bHQ6ICdzdWNjZXNzJyB9KSxcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHByb2plY3RlZCA9IHsgbWVzc2FnZTogJ3VucGFyc2VkJyB9O1xuXHRcdFx0fVxuXG5cdFx0XHQoZGlyZWN0aW9uID09PSAnYzJzJyA/IHJvdW5kc1tyb3VuZEluZGV4XS5jbGllbnRUb1NlcnZlciA6IHJvdW5kc1tyb3VuZEluZGV4XS5zZXJ2ZXJUb0NsaWVudCkucHVzaChwcm9qZWN0ZWQpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgcm91bmQgb2Ygcm91bmRzKSB7XG5cdFx0XHRyb3VuZC5zZXJ2ZXJUb0NsaWVudCA9IGRyb3BSZWFzb25pbmcocm91bmQuc2VydmVyVG9DbGllbnQpO1xuXHRcdFx0bm9ybWFsaXplU25hcHNob3RPYmplY3RzKHJvdW5kLmNsaWVudFRvU2VydmVyLCB0aGlzLl9ub3JtYWxpemF0aW9uKTtcblx0XHRcdG5vcm1hbGl6ZVNuYXBzaG90T2JqZWN0cyhyb3VuZC5zZXJ2ZXJUb0NsaWVudCwgdGhpcy5fbm9ybWFsaXphdGlvbik7XG5cdFx0fVxuXHRcdHJldHVybiBzZXJpYWxpemVGaXh0dXJlKHsgdmVyc2lvbjogMSwgcm91bmRzIH0pO1xuXHR9XG59XG5cbi8qKiBSZWNvcmRzIGNvZGUtZHJpdmVuIEFIUCB0cmFmZmljIGR1cmluZyBzbmFwc2hvdCB1cGRhdGVzIGFuZCBhc3NlcnRzIGl0IGR1cmluZyByZXBsYXkuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYXNzZXJ0UmVjb3JkZWRBaHBTbmFwc2hvdCh0ZXN0OiBNb2NoYS5SdW5uYWJsZSwgY2xpZW50OiBJQWhwU25hcHNob3RDbGllbnQsIG9wdGlvbnM/OiBJQWhwU25hcHNob3RPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IGFjdHVhbCA9IGNsaWVudC5zZXJpYWxpemVBaHBTbmFwc2hvdChvcHRpb25zKTtcblx0aWYgKFVQREFURV9BSFBfU05BUFNIT1RTIHx8IFVQREFURV9BTExfU05BUFNIT1RTKSB7XG5cdFx0d3JpdGVGaWxlU3luYyhzbmFwc2hvdFBhdGhGb3JUZXN0KHRlc3QsICd0cmFmZmljJywgJ2FocC55YW1sJyksIGFjdHVhbCk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbCwgeyBuYW1lOiAndHJhZmZpYycsIGV4dGVuc2lvbjogJ2FocC55YW1sJyB9KTtcbn1cblxuLyoqIExvYWRzIGNsaWVudCBhY3Rpb25zIGZyb20gYW4gQUhQIHNuYXBzaG90LCBkaXNwYXRjaGVzIHRoZW0sIGFuZCBhc3NlcnRzIHRoZSByZXN1bHRpbmcgdHJhZmZpYy4gKi9cbmV4cG9ydCBjbGFzcyBBaHBTbmFwc2hvdFNjZW5hcmlvIHtcblx0cHJpdmF0ZSBjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9maXh0dXJlUGF0aDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2ZpeHR1cmU6IElBaHBTbmFwc2hvdEZpeHR1cmUsXG5cdCkgeyB9XG5cblx0c3RhdGljIGxvYWQodGVzdDogTW9jaGEuUnVubmFibGUpOiBBaHBTbmFwc2hvdFNjZW5hcmlvIHtcblx0XHRjb25zdCBmaXh0dXJlUGF0aCA9IHNuYXBzaG90UGF0aEZvclRlc3QodGVzdCwgJ3RyYWZmaWMnLCAnYWhwLnlhbWwnKTtcblx0XHRyZXR1cm4gbmV3IEFocFNuYXBzaG90U2NlbmFyaW8oZml4dHVyZVBhdGgsIHBhcnNlRml4dHVyZSh5YW1sTW9kdWxlLmxvYWQocmVhZEZpbGVTeW5jKGZpeHR1cmVQYXRoLCAndXRmOCcpKSwgZml4dHVyZVBhdGgpKTtcblx0fVxuXG5cdGdldCBjbGllbnRJZCgpOiBzdHJpbmcge1xuXHRcdGZvciAoY29uc3Qgcm91bmQgb2YgdGhpcy5fZml4dHVyZS5yb3VuZHMpIHtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2Ygcm91bmQuY2xpZW50VG9TZXJ2ZXIpIHtcblx0XHRcdFx0aWYgKGVudHJ5LmFjdGlvbj8udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlYWRTdHJpbmcocmVhZFJlY29yZChlbnRyeS5hY3Rpb24uYWN0aXZlQ2xpZW50LCAnYWN0aXZlQ2xpZW50JyksICdjbGllbnRJZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRocm93IG5ldyBFcnJvcignW2FocC1zbmFwc2hvdF0gc2NlbmFyaW8gbXVzdCBzZXQgYW4gYWN0aXZlIGNsaWVudCBzbyBpdHMgY2xpZW50IGlkIGNhbiBpbml0aWFsaXplIHRoZSBzZXNzaW9uJyk7XG5cdH1cblxuXHRhc3luYyBydW4oY2xpZW50OiBJQWhwU25hcHNob3RDbGllbnQsIHNlc3Npb25Vcmk6IHN0cmluZywgb3B0aW9ucz86IElBaHBTbmFwc2hvdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBiaW5kaW5ncyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KFtcblx0XHRcdFsnJHtzZXNzaW9uXzB9Jywgc2Vzc2lvblVyaV0sXG5cdFx0XHRbJyR7Y2hhdF8wfScsIGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSldLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHNlZW5QcmVyZXF1aXNpdGVzID0gbmV3IFNldDxvYmplY3Q+KCk7XG5cdFx0bGV0IGNsaWVudFNlcSA9IDE7XG5cblx0XHRmb3IgKGNvbnN0IHJvdW5kIG9mIHRoaXMuX2ZpeHR1cmUucm91bmRzKSB7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25zQmVmb3JlUm91bmQgPSBuZXcgU2V0PG9iamVjdD4oY2xpZW50LnJlY2VpdmVkTm90aWZpY2F0aW9ucygpKTtcblx0XHRcdGNsaWVudC5iZWdpbkFocFNuYXBzaG90Um91bmQoKTtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2Ygcm91bmQuY2xpZW50VG9TZXJ2ZXIpIHtcblx0XHRcdFx0aWYgKCFlbnRyeS5jaGFubmVsIHx8ICFlbnRyeS5hY3Rpb24pIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1thaHAtc25hcHNob3RdIGNsaWVudFRvU2VydmVyIGVudHJpZXMgbXVzdCBiZSBkaXNwYXRjaCBhY3Rpb25zJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhd2FpdCBiaW5kUHJlcmVxdWlzaXRlcyhjbGllbnQsIGVudHJ5LmFjdGlvbiwgYmluZGluZ3MsIHNlZW5QcmVyZXF1aXNpdGVzKTtcblx0XHRcdFx0YmluZEdlbmVyYXRlZElkZW50aWZpZXJzKGVudHJ5LmFjdGlvbiwgYmluZGluZ3MpO1xuXHRcdFx0XHRjbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0XHRcdGNoYW5uZWw6IHJlc29sdmVQbGFjZWhvbGRlcihlbnRyeS5jaGFubmVsLCBiaW5kaW5ncyksXG5cdFx0XHRcdFx0Y2xpZW50U2VxOiBjbGllbnRTZXErKyxcblx0XHRcdFx0XHRhY3Rpb246IHBhcnNlQ2xpZW50QWN0aW9uKHJlc29sdmVQbGFjZWhvbGRlcnMoZW50cnkuYWN0aW9uLCBiaW5kaW5ncykpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHdhaXRGb3JGaW5hbFNlcnZlck1lc3NhZ2UoY2xpZW50LCByb3VuZC5zZXJ2ZXJUb0NsaWVudCwgbm90aWZpY2F0aW9uc0JlZm9yZVJvdW5kLCBiaW5kaW5ncyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0dWFsID0gY2xpZW50LnNlcmlhbGl6ZUFocFNuYXBzaG90KG9wdGlvbnMpO1xuXHRcdGlmIChVUERBVEVfQUhQX1NOQVBTSE9UUyB8fCBVUERBVEVfQUxMX1NOQVBTSE9UUykge1xuXHRcdFx0Y29uc3QgYWN0dWFsRml4dHVyZSA9IHBhcnNlRml4dHVyZSh5YW1sTW9kdWxlLmxvYWQoYWN0dWFsKSwgJ3JlY29yZGVkIEFIUCB0cmFmZmljJyk7XG5cdFx0XHRpZiAoYWN0dWFsRml4dHVyZS5yb3VuZHMubGVuZ3RoICE9PSB0aGlzLl9maXh0dXJlLnJvdW5kcy5sZW5ndGgpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbYWhwLXNuYXBzaG90XSBleHBlY3RlZCAke3RoaXMuX2ZpeHR1cmUucm91bmRzLmxlbmd0aH0gcmVjb3JkZWQgcm91bmRzLCBnb3QgJHthY3R1YWxGaXh0dXJlLnJvdW5kcy5sZW5ndGh9YCk7XG5cdFx0XHR9XG5cdFx0XHR3cml0ZUZpbGVTeW5jKHRoaXMuX2ZpeHR1cmVQYXRoLCBzZXJpYWxpemVGaXh0dXJlKHtcblx0XHRcdFx0dmVyc2lvbjogMSxcblx0XHRcdFx0cm91bmRzOiB0aGlzLl9maXh0dXJlLnJvdW5kcy5tYXAoKHJvdW5kLCBpbmRleCkgPT4gKHtcblx0XHRcdFx0XHRjbGllbnRUb1NlcnZlcjogcm91bmQuY2xpZW50VG9TZXJ2ZXIsXG5cdFx0XHRcdFx0c2VydmVyVG9DbGllbnQ6IGFjdHVhbEZpeHR1cmUucm91bmRzW2luZGV4XS5zZXJ2ZXJUb0NsaWVudCxcblx0XHRcdFx0fSkpLFxuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwsIHsgbmFtZTogJ3RyYWZmaWMnLCBleHRlbnNpb246ICdhaHAueWFtbCcgfSk7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGlzTWV0aG9kTWVzc2FnZShtZXNzYWdlOiBvYmplY3QpOiBtZXNzYWdlIGlzIElNZXRob2RNZXNzYWdlIHtcblx0cmV0dXJuICdtZXRob2QnIGluIG1lc3NhZ2UgJiYgdHlwZW9mIG1lc3NhZ2UubWV0aG9kID09PSAnc3RyaW5nJztcbn1cblxuZnVuY3Rpb24gaXNSZXNwb25zZU1lc3NhZ2UobWVzc2FnZTogb2JqZWN0KTogbWVzc2FnZSBpcyBJUmVzcG9uc2VNZXNzYWdlIHtcblx0cmV0dXJuICdpZCcgaW4gbWVzc2FnZSAmJiB0eXBlb2YgbWVzc2FnZS5pZCA9PT0gJ251bWJlcicgJiYgISgnbWV0aG9kJyBpbiBtZXNzYWdlKTtcbn1cblxuZnVuY3Rpb24gYXNSZWNvcmQodmFsdWU6IHVua25vd24pOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB2YWx1ZSAhPT0gbnVsbCAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnID8gdmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZUNoYW5uZWwodmFsdWU6IHVua25vd24sIGNoYW5uZWxzOiBNYXA8c3RyaW5nLCBzdHJpbmc+LCBjaGFubmVsQ291bnRzOiBNYXA8c3RyaW5nLCBudW1iZXI+KTogc3RyaW5nIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gJyR7Y2hhbm5lbH0nO1xuXHR9XG5cblx0Y29uc3QgZXhpc3RpbmcgPSBjaGFubmVscy5nZXQodmFsdWUpO1xuXHRpZiAoZXhpc3RpbmcpIHtcblx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdH1cblxuXHRsZXQga2luZCA9ICdjaGFubmVsJztcblx0dHJ5IHtcblx0XHRjb25zdCBzY2hlbWUgPSBVUkkucGFyc2UodmFsdWUpLnNjaGVtZTtcblx0XHRpZiAoc2NoZW1lID09PSAnYWdlbnRob3N0Jykge1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0XHRraW5kID0gc2NoZW1lID09PSAnYWhwLWNoYXQnID8gJ2NoYXQnIDogc2NoZW1lLmluY2x1ZGVzKCd0ZXJtaW5hbCcpID8gJ3Rlcm1pbmFsJyA6ICdzZXNzaW9uJztcblx0fSBjYXRjaCB7XG5cdFx0Ly8gS2VlcCB0aGUgZ2VuZXJpYyBjaGFubmVsIGtpbmQgZm9yIG5vbi1VUkkgdmFsdWVzLlxuXHR9XG5cblx0Y29uc3QgaW5kZXggPSBjaGFubmVsQ291bnRzLmdldChraW5kKSA/PyAwO1xuXHRjaGFubmVsQ291bnRzLnNldChraW5kLCBpbmRleCArIDEpO1xuXHRjb25zdCBub3JtYWxpemVkID0gYFxcJHske2tpbmR9XyR7aW5kZXh9fWA7XG5cdGNoYW5uZWxzLnNldCh2YWx1ZSwgbm9ybWFsaXplZCk7XG5cdHJldHVybiBub3JtYWxpemVkO1xufVxuXG5mdW5jdGlvbiBwcm9qZWN0QWN0aW9uKFxuXHRhY3Rpb246IFN0YXRlQWN0aW9uLFxuXHR0dXJuczogTWFwPHN0cmluZywgc3RyaW5nPixcblx0dG9vbENhbGxzOiBNYXA8c3RyaW5nLCBzdHJpbmc+LFxuXHR0b29sQ2FsbE5hbWVzOiBNYXA8c3RyaW5nLCBzdHJpbmc+LFxuXHRyZXNwb25zZVBhcnRzOiBNYXA8c3RyaW5nLCB7IGNvbnRlbnQ6IHN0cmluZyB9Pixcblx0Y2hhbm5lbDogc3RyaW5nLFxuXHRwcm9maWxlOiBOb25OdWxsYWJsZTxJQWhwU25hcHNob3RPcHRpb25zWydwcm9maWxlJ10+LFxuXHRvbWl0VG9vbENhbGxTdWNjZXNzRm9yVG9vbE5hbWVzOiBSZWFkb25seVNldDxzdHJpbmc+LFxuKTogb2JqZWN0IHwgdW5kZWZpbmVkIHtcblx0c3dpdGNoIChhY3Rpb24udHlwZSkge1xuXHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0OlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogYWN0aW9uLnR5cGUsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkOiBhY3Rpb24uYWN0aXZlQ2xpZW50LmNsaWVudElkLFxuXHRcdFx0XHRcdGRpc3BsYXlOYW1lOiBhY3Rpb24uYWN0aXZlQ2xpZW50LmRpc3BsYXlOYW1lLFxuXHRcdFx0XHRcdHRvb2xzOiBhY3Rpb24uYWN0aXZlQ2xpZW50LnRvb2xzLm1hcCh0b29sID0+ICh7XG5cdFx0XHRcdFx0XHRuYW1lOiB0b29sLm5hbWUsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogdG9vbC5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdGlucHV0U2NoZW1hOiB0b29sLmlucHV0U2NoZW1hLFxuXHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZDpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6IGFjdGlvbi50eXBlLFxuXHRcdFx0XHR0dXJuSWQ6IG5vcm1hbGl6ZUlkZW50aWZpZXIoYWN0aW9uLnR1cm5JZCwgJ3R1cm4nLCB0dXJucyksXG5cdFx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0XHR0ZXh0OiBhY3Rpb24ubWVzc2FnZS50ZXh0LFxuXHRcdFx0XHRcdG9yaWdpbjogeyBraW5kOiBhY3Rpb24ubWVzc2FnZS5vcmlnaW4ua2luZCB9LFxuXHRcdFx0XHRcdC4uLihhY3Rpb24ubWVzc2FnZS5tb2RlbCA/IHsgbW9kZWw6IHsgaWQ6IGFjdGlvbi5tZXNzYWdlLm1vZGVsLmlkIH0gfSA6IHt9KSxcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQ6IHtcblx0XHRcdGlmIChhY3Rpb24ucGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duIHx8IGFjdGlvbi5wYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nKSB7XG5cdFx0XHRcdGNvbnN0IHBhcnQgPSB7IGtpbmQ6IGFjdGlvbi5wYXJ0LmtpbmQsIGNvbnRlbnQ6IGFjdGlvbi5wYXJ0LmNvbnRlbnQgfTtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0cy5zZXQocmVzcG9uc2VQYXJ0S2V5KGNoYW5uZWwsIGFjdGlvbi5wYXJ0LmlkKSwgcGFydCk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dHlwZTogYWN0aW9uLnR5cGUsXG5cdFx0XHRcdFx0dHVybklkOiBub3JtYWxpemVJZGVudGlmaWVyKGFjdGlvbi50dXJuSWQsICd0dXJuJywgdHVybnMpLFxuXHRcdFx0XHRcdHBhcnQsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBhY3Rpb24udHlwZSxcblx0XHRcdFx0dHVybklkOiBub3JtYWxpemVJZGVudGlmaWVyKGFjdGlvbi50dXJuSWQsICd0dXJuJywgdHVybnMpLFxuXHRcdFx0XHRwYXJ0OiB7IGtpbmQ6IGFjdGlvbi5wYXJ0LmtpbmQgfSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0RGVsdGE6IHtcblx0XHRcdGNvbnN0IHBhcnQgPSByZXNwb25zZVBhcnRzLmdldChyZXNwb25zZVBhcnRLZXkoY2hhbm5lbCwgYWN0aW9uLnBhcnRJZCkpO1xuXHRcdFx0aWYgKHBhcnQpIHtcblx0XHRcdFx0cGFydC5jb250ZW50ICs9IGFjdGlvbi5jb250ZW50O1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogYWN0aW9uLnR5cGUsXG5cdFx0XHRcdHR1cm5JZDogbm9ybWFsaXplSWRlbnRpZmllcihhY3Rpb24udHVybklkLCAndHVybicsIHR1cm5zKSxcblx0XHRcdFx0Y29udGVudDogYWN0aW9uLmNvbnRlbnQsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQ6IHtcblx0XHRcdGNvbnN0IHRvb2xOYW1lID0gbm9ybWFsaXplU2hlbGxUb29sTmFtZShhY3Rpb24udG9vbE5hbWUpO1xuXHRcdFx0dG9vbENhbGxOYW1lcy5zZXQoYWN0aW9uLnRvb2xDYWxsSWQsIGFjdGlvbi50b29sTmFtZSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBhY3Rpb24udHlwZSxcblx0XHRcdFx0dHVybklkOiBub3JtYWxpemVJZGVudGlmaWVyKGFjdGlvbi50dXJuSWQsICd0dXJuJywgdHVybnMpLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBub3JtYWxpemVJZGVudGlmaWVyKGFjdGlvbi50b29sQ2FsbElkLCAndG9vbENhbGwnLCB0b29sQ2FsbHMpLFxuXHRcdFx0XHR0b29sTmFtZSxcblx0XHRcdFx0Li4uKHByb2ZpbGUgPT09ICdwcm90b2NvbCcgPyB7XG5cdFx0XHRcdFx0ZGlzcGxheU5hbWU6IGFjdGlvbi5kaXNwbGF5TmFtZSxcblx0XHRcdFx0XHRjb250cmlidXRvcjogcHJvamVjdENvbnRyaWJ1dG9yKGFjdGlvbi5jb250cmlidXRvciksXG5cdFx0XHRcdH0gOiB7fSksXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHk6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBhY3Rpb24udHlwZSxcblx0XHRcdFx0dHVybklkOiBub3JtYWxpemVJZGVudGlmaWVyKGFjdGlvbi50dXJuSWQsICd0dXJuJywgdHVybnMpLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBub3JtYWxpemVJZGVudGlmaWVyKGFjdGlvbi50b29sQ2FsbElkLCAndG9vbENhbGwnLCB0b29sQ2FsbHMpLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogcHJvamVjdFN0cmluZ09yTWFya2Rvd24oYWN0aW9uLmludm9jYXRpb25NZXNzYWdlKSxcblx0XHRcdFx0dG9vbElucHV0OiBhY3Rpb24udG9vbElucHV0LFxuXHRcdFx0XHRjb25maXJtZWQ6IGFjdGlvbi5jb25maXJtZWQsXG5cdFx0XHR9O1xuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQ6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBhY3Rpb24udHlwZSxcblx0XHRcdFx0dHVybklkOiBub3JtYWxpemVJZGVudGlmaWVyKGFjdGlvbi50dXJuSWQsICd0dXJuJywgdHVybnMpLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBub3JtYWxpemVJZGVudGlmaWVyKGFjdGlvbi50b29sQ2FsbElkLCAndG9vbENhbGwnLCB0b29sQ2FsbHMpLFxuXHRcdFx0XHRhcHByb3ZlZDogYWN0aW9uLmFwcHJvdmVkLFxuXHRcdFx0XHQuLi4oYWN0aW9uLmFwcHJvdmVkID8geyBjb25maXJtZWQ6IGFjdGlvbi5jb25maXJtZWQgfSA6IHsgcmVhc29uOiBhY3Rpb24ucmVhc29uIH0pLFxuXHRcdFx0fTtcblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGU6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBhY3Rpb24udHlwZSxcblx0XHRcdFx0dHVybklkOiBub3JtYWxpemVJZGVudGlmaWVyKGFjdGlvbi50dXJuSWQsICd0dXJuJywgdHVybnMpLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBub3JtYWxpemVJZGVudGlmaWVyKGFjdGlvbi50b29sQ2FsbElkLCAndG9vbENhbGwnLCB0b29sQ2FsbHMpLFxuXHRcdFx0XHQuLi4ocHJvZmlsZSA9PT0gJ3Byb3RvY29sJyB8fCAhb21pdFRvb2xDYWxsU3VjY2Vzc0ZvclRvb2xOYW1lcy5oYXModG9vbENhbGxOYW1lcy5nZXQoYWN0aW9uLnRvb2xDYWxsSWQpID8/ICcnKSA/IHtcblx0XHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRcdHN1Y2Nlc3M6IGFjdGlvbi5yZXN1bHQuc3VjY2Vzcyxcblx0XHRcdFx0XHRcdC4uLihwcm9maWxlID09PSAncHJvdG9jb2wnID8ge1xuXHRcdFx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBwcm9qZWN0U3RyaW5nT3JNYXJrZG93bihhY3Rpb24ucmVzdWx0LnBhc3RUZW5zZU1lc3NhZ2UpLFxuXHRcdFx0XHRcdFx0XHRjb250ZW50OiBhY3Rpb24ucmVzdWx0LmNvbnRlbnQ/Lm1hcChjb250ZW50ID0+IGNvbnRlbnQudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHRcblx0XHRcdFx0XHRcdFx0XHQ/IHsgdHlwZTogY29udGVudC50eXBlLCB0ZXh0OiBjb250ZW50LnRleHQgfVxuXHRcdFx0XHRcdFx0XHRcdDogeyB0eXBlOiBjb250ZW50LnR5cGUgfSksXG5cdFx0XHRcdFx0XHR9IDoge30pLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0gOiB7fSksXG5cdFx0XHR9O1xuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0RXJyb3I6XG5cdFx0XHRyZXR1cm4gcHJvZmlsZSA9PT0gJ2JlaGF2aW9yJyA/IHtcblx0XHRcdFx0dHlwZTogYWN0aW9uLnR5cGUsXG5cdFx0XHRcdHR1cm5JZDogbm9ybWFsaXplSWRlbnRpZmllcihhY3Rpb24udHVybklkLCAndHVybicsIHR1cm5zKSxcblx0XHRcdFx0ZXJyb3I6IHtcblx0XHRcdFx0XHRlcnJvclR5cGU6IGFjdGlvbi5lcnJvci5lcnJvclR5cGUsXG5cdFx0XHRcdFx0bWVzc2FnZTogYWN0aW9uLmVycm9yLm1lc3NhZ2UsXG5cdFx0XHRcdH0sXG5cdFx0XHR9IDogeyB0eXBlOiBhY3Rpb24udHlwZSB9O1xuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VXNhZ2U6XG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGU6XG5cdFx0XHRyZXR1cm4geyB0eXBlOiBhY3Rpb24udHlwZSwgdHVybklkOiBub3JtYWxpemVJZGVudGlmaWVyKGFjdGlvbi50dXJuSWQsICd0dXJuJywgdHVybnMpIH07XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiB7IHR5cGU6IGFjdGlvbi50eXBlIH07XG5cdH1cbn1cblxuLyoqXG4gKiBEcm9wcyByZWFzb25pbmcgdHJhZmZpYyBmcm9tIHRoZSBzbmFwc2hvdC5cbiAqXG4gKiBSZWFzb25pbmcgY2Fubm90IHN1cnZpdmUgdGhlIGNhcHR1cmUgcm91bmQtdHJpcDogYGNhcGlXaXJlQ29kZWNgIGRyb3BzXG4gKiByZWFzb25pbmcgaXRlbXMgd2hlbiBhZ2dyZWdhdGluZyBhIHJlc3BvbnNlLCBiZWNhdXNlIHRoZWlyIGNvbnRlbnQgaXMgb3BhcXVlXG4gKiBhbmQgcHJvdmlkZXItZW5jcnlwdGVkLiBSZXBsYXkgdGhlcmVmb3JlIHJlYnVpbGRzIHRoZSBzdHJlYW0gZnJvbSBhIGZpeHR1cmVcbiAqIHRoYXQgaGFzIG5vIHJlYXNvbmluZyBpbiBpdCwgYW5kIGFueSByZWFzb25pbmcgdGhlIGxpdmUgcmVjb3JkaW5nIG9ic2VydmVkIFx1MjAxNFxuICogd2hldGhlciBhbiBlbXB0eSBwYXJ0IHRoZSBwcm92aWRlciBvcGVuZWQgYW5kIGNsb3NlZCB3aXRob3V0IGEgZGVsdGEsIG9yIGFcbiAqIHBhcnRpYWwgb25lIGNhcnJ5aW5nIGEgZmV3IGNoYXJhY3RlcnMgXHUyMDE0IGNhbiBuZXZlciBiZSByZXByb2R1Y2VkLlxuICpcbiAqIEtlZXBpbmcgaXQgd291bGQgbWFrZSBhIHNuYXBzaG90IHBlcm1hbmVudGx5IHVucmVwbGF5YWJsZSBkZXBlbmRpbmcgb25cbiAqIHdoZXRoZXIgdGhlIHByb3ZpZGVyIGhhcHBlbmVkIHRvIGVtaXQgcmVhc29uaW5nIGR1cmluZyB0aGUgcmVjb3JkaW5nLCB3aGljaFxuICogc2F5cyBub3RoaW5nIGFib3V0IHRoZSBiZWhhdmlvciB1bmRlciB0ZXN0LlxuICpcbiAqIFJ1bnMgYWZ0ZXIgcHJvamVjdGlvbiBiZWNhdXNlIGBDaGF0RGVsdGFgIGZpbGxzIGluIGEgcGFydCdzIGNvbnRlbnQgYnlcbiAqIG11dGF0aW5nIHRoZSBvYmplY3QgcmVjb3JkZWQgaGVyZSwgc28gdGhlIGZpbmFsIGNvbnRlbnQgaXMgb25seSBrbm93biBvbmNlXG4gKiBldmVyeSBtZXNzYWdlIGhhcyBiZWVuIHByb2plY3RlZC5cbiAqL1xuZnVuY3Rpb24gZHJvcFJlYXNvbmluZyhhY3Rpb25zOiBvYmplY3RbXSk6IG9iamVjdFtdIHtcblx0cmV0dXJuIGFjdGlvbnMuZmlsdGVyKGVudHJ5ID0+IHtcblx0XHRjb25zdCBhY3Rpb24gPSAoZW50cnkgYXMgeyBhY3Rpb24/OiB7IHR5cGU/OiBzdHJpbmc7IHBhcnQ/OiB7IGtpbmQ/OiBzdHJpbmcgfSB9IH0pLmFjdGlvbjtcblx0XHRyZXR1cm4gYWN0aW9uPy50eXBlICE9PSBBY3Rpb25UeXBlLkNoYXRSZWFzb25pbmdcblx0XHRcdCYmICEoYWN0aW9uPy50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQgJiYgYWN0aW9uLnBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nKTtcblx0fSk7XG59XG5cbi8qKlxuICogQ29sbGFwc2VzIHRoZSBwbGF0Zm9ybS1zcGVjaWZpYyBDb3BpbG90IHNoZWxsIHRvb2wgbmFtZXMgdG8gc3RhYmxlXG4gKiBwbGFjZWhvbGRlcnMuXG4gKlxuICogVGhlIENvcGlsb3QgQ0xJIG5hbWVzIGl0cyBzaGVsbCB0b29scyBhZnRlciB0aGUgc2hlbGwgaXQgcnVuczogYGJhc2hgIGFuZFxuICogZnJpZW5kcyBvbiBQT1NJWCwgYHBvd2Vyc2hlbGxgIGFuZCBmcmllbmRzIG9uIFdpbmRvd3MuIFRoYXQgbmFtZSByZWFjaGVzIHRoZVxuICogY2xpZW50IHZlcmJhdGltIGluIGBjaGF0L3Rvb2xDYWxsU3RhcnRgLCBzbyBhIHNuYXBzaG90IHJlY29yZGVkIG9uIG1hY09TIG9yXG4gKiBMaW51eCBjYW4gbmV2ZXIgbWF0Y2ggdGhlIHNhbWUgYmVoYXZpb3Igb24gV2luZG93cyBldmVuIHdoZW4gdGhlIHJlY29yZGVkXG4gKiBjb21tYW5kIGl0c2VsZiBpcyBwb3J0YWJsZS5cbiAqXG4gKiBPbmx5IHRoZSBuYW1lcyB0aGF0IGFjdHVhbGx5IHZhcnkgYnkgcGxhdGZvcm0gYXJlIG1hcHBlZC4gQ2xhdWRlJ3MgYEJhc2hgIGFuZFxuICogQ29kZXgncyBgc2hlbGxgIGFyZSBmaXhlZCBzdHJpbmdzIHRoZWlyIFNES3MgdXNlIGV2ZXJ5d2hlcmUsIHNvIHRoZXkgYXJlIGxlZnRcbiAqIGFsb25lIFx1MjAxNCByZXdyaXRpbmcgdGhlbSB3b3VsZCBoaWRlIGEgZ2VudWluZSBwcm92aWRlciBjaGFuZ2UuXG4gKi9cbmZ1bmN0aW9uIG5vcm1hbGl6ZVNoZWxsVG9vbE5hbWUodG9vbE5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHNoZWxsVG9vbFBsYWNlaG9sZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcblx0XHRiYXNoOiAnJHtzaGVsbH0nLCBwb3dlcnNoZWxsOiAnJHtzaGVsbH0nLFxuXHRcdHJlYWRfYmFzaDogJyR7cmVhZF9zaGVsbH0nLCByZWFkX3Bvd2Vyc2hlbGw6ICcke3JlYWRfc2hlbGx9Jyxcblx0XHR3cml0ZV9iYXNoOiAnJHt3cml0ZV9zaGVsbH0nLCB3cml0ZV9wb3dlcnNoZWxsOiAnJHt3cml0ZV9zaGVsbH0nLFxuXHRcdHN0b3BfYmFzaDogJyR7c3RvcF9zaGVsbH0nLCBzdG9wX3Bvd2Vyc2hlbGw6ICcke3N0b3Bfc2hlbGx9Jyxcblx0XHRiYXNoX3NodXRkb3duOiAnJHtzaGVsbF9zaHV0ZG93bn0nLCBwb3dlcnNoZWxsX3NodXRkb3duOiAnJHtzaGVsbF9zaHV0ZG93bn0nLFxuXHRcdGxpc3RfYmFzaDogJyR7bGlzdF9zaGVsbH0nLCBsaXN0X3Bvd2Vyc2hlbGw6ICcke2xpc3Rfc2hlbGx9Jyxcblx0fTtcblx0cmV0dXJuIHNoZWxsVG9vbFBsYWNlaG9sZGVyc1t0b29sTmFtZV0gPz8gdG9vbE5hbWU7XG59XG5cbmZ1bmN0aW9uIGlzQmVoYXZpb3JTbmFwc2hvdE5vaXNlKHR5cGU6IEFjdGlvblR5cGUpOiBib29sZWFuIHtcblx0c3dpdGNoICh0eXBlKSB7XG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25DaGF0VXBkYXRlZDpcblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvblNlcnZlclRvb2xzQ2hhbmdlZDpcblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbklucHV0TmVlZGVkU2V0OlxuXHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uSW5wdXROZWVkZWRSZW1vdmVkOlxuXHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkOlxuXHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uQ2hhbmdlc2V0c0NoYW5nZWQ6XG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25NZXRhQ2hhbmdlZDpcblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2aXR5Q2hhbmdlZDpcblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdEFjdGl2aXR5Q2hhbmdlZDpcblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFVzYWdlOlxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YTpcblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHk6XG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZDpcblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29udGVudENoYW5nZWQ6XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlc3BvbnNlUGFydEtleShjaGFubmVsOiBzdHJpbmcsIHBhcnRJZDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGAke2NoYW5uZWx9XFwwJHtwYXJ0SWR9YDtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplSWRlbnRpZmllcih2YWx1ZTogc3RyaW5nLCBraW5kOiBzdHJpbmcsIGlkZW50aWZpZXJzOiBNYXA8c3RyaW5nLCBzdHJpbmc+KTogc3RyaW5nIHtcblx0bGV0IG5vcm1hbGl6ZWQgPSBpZGVudGlmaWVycy5nZXQodmFsdWUpO1xuXHRpZiAoIW5vcm1hbGl6ZWQpIHtcblx0XHRub3JtYWxpemVkID0gYFxcJHske2tpbmR9XyR7aWRlbnRpZmllcnMuc2l6ZX19YDtcblx0XHRpZGVudGlmaWVycy5zZXQodmFsdWUsIG5vcm1hbGl6ZWQpO1xuXHR9XG5cdHJldHVybiBub3JtYWxpemVkO1xufVxuXG5mdW5jdGlvbiBwcm9qZWN0Q29udHJpYnV0b3IoY29udHJpYnV0b3I6IFRvb2xDYWxsQ29udHJpYnV0b3IgfCB1bmRlZmluZWQpOiBvYmplY3QgfCB1bmRlZmluZWQge1xuXHRpZiAoIWNvbnRyaWJ1dG9yKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gY29udHJpYnV0b3Iua2luZCA9PT0gVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50XG5cdFx0PyB7IGtpbmQ6IGNvbnRyaWJ1dG9yLmtpbmQsIGNsaWVudElkOiBjb250cmlidXRvci5jbGllbnRJZCB9XG5cdFx0OiB7IGtpbmQ6IGNvbnRyaWJ1dG9yLmtpbmQsIGN1c3RvbWl6YXRpb25JZDogY29udHJpYnV0b3IuY3VzdG9taXphdGlvbklkIH07XG59XG5cbmZ1bmN0aW9uIHByb2plY3RTdHJpbmdPck1hcmtkb3duKHZhbHVlOiBTdHJpbmdPck1hcmtkb3duKTogc3RyaW5nIHtcblx0cmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgPyB2YWx1ZSA6IHZhbHVlLm1hcmtkb3duO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVTbmFwc2hvdE9iamVjdHModmFsdWVzOiBvYmplY3RbXSwgbm9ybWFsaXphdGlvbjogSUFocFNuYXBzaG90Tm9ybWFsaXphdGlvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRpZiAoIW5vcm1hbGl6YXRpb24pIHtcblx0XHRyZXR1cm47XG5cdH1cblx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHZhbHVlcy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHR2YWx1ZXNbaW5kZXhdID0gbm9ybWFsaXplU25hcHNob3RPYmplY3QodmFsdWVzW2luZGV4XSwgbm9ybWFsaXphdGlvbik7XG5cdH1cbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplU25hcHNob3RPYmplY3QodmFsdWU6IG9iamVjdCwgbm9ybWFsaXphdGlvbjogSUFocFNuYXBzaG90Tm9ybWFsaXphdGlvbik6IG9iamVjdCB7XG5cdGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdHJldHVybiB2YWx1ZS5tYXAoaXRlbSA9PiBub3JtYWxpemVTbmFwc2hvdFZhbHVlKGl0ZW0sIG5vcm1hbGl6YXRpb24pKTtcblx0fVxuXHRjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG5cdGZvciAoY29uc3QgW2tleSwgaXRlbV0gb2YgT2JqZWN0LmVudHJpZXModmFsdWUpKSB7XG5cdFx0cmVzdWx0W2tleV0gPSBub3JtYWxpemVTbmFwc2hvdFZhbHVlKGl0ZW0sIG5vcm1hbGl6YXRpb24pO1xuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZVNuYXBzaG90VmFsdWUodmFsdWU6IHVua25vd24sIG5vcm1hbGl6YXRpb246IElBaHBTbmFwc2hvdE5vcm1hbGl6YXRpb24pOiB1bmtub3duIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gbm9ybWFsaXplU25hcHNob3RUZXh0KHZhbHVlLCBub3JtYWxpemF0aW9uKTtcblx0fVxuXHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gdmFsdWUubWFwKGl0ZW0gPT4gbm9ybWFsaXplU25hcHNob3RWYWx1ZShpdGVtLCBub3JtYWxpemF0aW9uKSk7XG5cdH1cblx0aWYgKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcblx0XHRyZXR1cm4gbm9ybWFsaXplU25hcHNob3RPYmplY3QodmFsdWUsIG5vcm1hbGl6YXRpb24pO1xuXHR9XG5cdHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplU25hcHNob3RUZXh0KHZhbHVlOiBzdHJpbmcsIG5vcm1hbGl6YXRpb246IElBaHBTbmFwc2hvdE5vcm1hbGl6YXRpb24pOiBzdHJpbmcge1xuXHRjb25zdCB3b3JrRGlycyA9IG5ldyBTZXQoW25vcm1hbGl6YXRpb24ud29ya2luZ0RpcmVjdG9yeV0pO1xuXHR0cnkge1xuXHRcdHdvcmtEaXJzLmFkZChyZWFscGF0aFN5bmMubmF0aXZlKG5vcm1hbGl6YXRpb24ud29ya2luZ0RpcmVjdG9yeSkpO1xuXHR9IGNhdGNoIHtcblx0XHQvLyBUaGUgd29ya3NwYWNlIGNhbiBiZSBkZWxldGVkIGR1cmluZyB0ZWFyZG93biBhZnRlciB0aGUgdHJhZmZpYyB3YXMgY2FwdHVyZWQuXG5cdH1cblx0bGV0IG5vcm1hbGl6ZWQgPSB2YWx1ZTtcblx0Ly8gTGluZSBlbmRpbmdzIGZpcnN0LCBzbyBldmVyeSBsaW5lLWFuY2hvcmVkIHBhdHRlcm4gYmVsb3cgc2VlcyBMRi1vbmx5XG5cdC8vIHRleHQuIFdpbmRvd3MgcHJvZHVjZXMgQ1JMRiBmb3IgdGhlIHNhbWUgYmVoYXZpb3IgYSBQT1NJWCBob3N0IHJlcG9ydHNcblx0Ly8gd2l0aCBMRiwgd2hpY2ggd291bGQgb3RoZXJ3aXNlIGZhaWwgYSBzbmFwc2hvdCByZWNvcmRlZCBvbiBtYWNPUy9MaW51eFxuXHQvLyBmb3IgYSByZWFzb24gdW5yZWxhdGVkIHRvIHRoZSBiZWhhdmlvciB1bmRlciB0ZXN0LiBUaGUgZXNjYXBlZCBmb3JtIGlzXG5cdC8vIG5vcm1hbGl6ZWQgdG9vIGJlY2F1c2UgdG9vbCBpbnB1dHMgYXJlIG9mdGVuIGVtYmVkZGVkIEpTT04sIHdoZXJlIHRoZVxuXHQvLyBjYXJyaWFnZSByZXR1cm4gc3Vydml2ZXMgYXMgYSBsaXRlcmFsIGBcXHJgIGVzY2FwZSByYXRoZXIgdGhhbiBhIGNvbnRyb2xcblx0Ly8gY2hhcmFjdGVyLlxuXHRub3JtYWxpemVkID0gbm9ybWFsaXplZC5yZXBsYWNlQWxsKCdcXHJcXG4nLCAnXFxuJykucmVwbGFjZUFsbCgnXFxcXHJcXFxcbicsICdcXFxcbicpO1xuXHRmb3IgKGNvbnN0IHdvcmtEaXIgb2YgWy4uLndvcmtEaXJzXS5zb3J0KChhLCBiKSA9PiBiLmxlbmd0aCAtIGEubGVuZ3RoKSkge1xuXHRcdG5vcm1hbGl6ZWQgPSBub3JtYWxpemVkXG5cdFx0XHQucmVwbGFjZUFsbChKU09OLnN0cmluZ2lmeSh3b3JrRGlyKS5zbGljZSgxLCAtMSksICcke3dvcmtkaXJ9Jylcblx0XHRcdC5yZXBsYWNlQWxsKHdvcmtEaXIsICcke3dvcmtkaXJ9Jylcblx0XHRcdC5yZXBsYWNlQWxsKFVSSS5maWxlKHdvcmtEaXIpLnRvU3RyaW5nKCksICcke3dvcmtkaXJ9Jyk7XG5cdH1cblx0bm9ybWFsaXplZCA9IG5vcm1hbGl6ZWQucmVwbGFjZUFsbCgnL3ByaXZhdGUke3dvcmtkaXJ9JywgJyR7d29ya2Rpcn0nKTtcblx0Y29uc3QgdGVtcFJvb3RzID0gbmV3IFNldChbLi4ud29ya0RpcnNdLmZsYXRNYXAod29ya0RpciA9PiBbZGlybmFtZSh3b3JrRGlyKSwgd2luMzIuZGlybmFtZSh3b3JrRGlyKV0pLmZpbHRlcihyb290ID0+IHJvb3QgIT09ICcuJykpO1xuXHRmb3IgKGNvbnN0IHRlbXBSb290IG9mIHRlbXBSb290cykge1xuXHRcdGNvbnN0IHdpbjMyRmlsZVVyaSA9IHdpbjMyLmlzQWJzb2x1dGUodGVtcFJvb3QpID8gYGZpbGU6Ly8vJHt0ZW1wUm9vdC5yZXBsYWNlQWxsKCdcXFxcJywgJy8nKX1gIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJvb3RWYXJpYW50cyA9IG5ldyBTZXQoW1xuXHRcdFx0dGVtcFJvb3QsXG5cdFx0XHRKU09OLnN0cmluZ2lmeSh0ZW1wUm9vdCkuc2xpY2UoMSwgLTEpLFxuXHRcdFx0VVJJLmZpbGUodGVtcFJvb3QpLnRvU3RyaW5nKCksXG5cdFx0XHQuLi4od2luMzJGaWxlVXJpID8gW3dpbjMyRmlsZVVyaV0gOiBbXSksXG5cdFx0XSk7XG5cdFx0Zm9yIChjb25zdCByb290VmFyaWFudCBvZiBbLi4ucm9vdFZhcmlhbnRzXS5zb3J0KChhLCBiKSA9PiBiLmxlbmd0aCAtIGEubGVuZ3RoKSkge1xuXHRcdFx0Y29uc3QgZXNjYXBlZFJvb3QgPSBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzKHJvb3RWYXJpYW50KTtcblx0XHRcdG5vcm1hbGl6ZWQgPSBub3JtYWxpemVkLnJlcGxhY2UobmV3IFJlZ0V4cChgJHtlc2NhcGVkUm9vdH0oPzovfFxcXFxcXFxcfFxcXFxcXFxcXFxcXFxcXFwpYWhwLWNvdmVyYWdlLVteXFxcXHNcXGBcIicpXSpgLCAnZycpLCAnJHt3b3JrZGlyfScpO1xuXHRcdH1cblx0fVxuXHRub3JtYWxpemVkID0gbm9ybWFsaXplZFxuXHRcdC5yZXBsYWNlQWxsKG5vcm1hbGl6YXRpb24uaG9tZURpcmVjdG9yeSwgJyR7aG9tZWRpcn0nKVxuXHRcdC5yZXBsYWNlQWxsKFVSSS5maWxlKG5vcm1hbGl6YXRpb24uaG9tZURpcmVjdG9yeSkudG9TdHJpbmcoKSwgJyR7aG9tZWRpcn0nKTtcblx0bm9ybWFsaXplZCA9IHNjcnViVXNlck5hbWUobm9ybWFsaXplZCwgbm9ybWFsaXphdGlvbi51c2VyTmFtZSk7XG5cdGlmICghbm9ybWFsaXplZC5pbmNsdWRlcygnJHt0ZW1wfScpKSB7XG5cdFx0bm9ybWFsaXplZCA9IG5vcm1hbGl6ZWQucmVwbGFjZSgvYWhwLWNvdmVyYWdlLShbYS16LV0rKS1bQS1aYS16MC05XXs2fS9nLCAnYWhwLWNvdmVyYWdlLSQxLSR7dGVtcH0nKTtcblx0fVxuXHRub3JtYWxpemVkID0gbm9ybWFsaXplZC5yZXBsYWNlKC88c2hlbGxJZDogXFxkKy9nLCAnPHNoZWxsSWQ6ICR7c2hlbGxJZH0nKTtcblx0cmV0dXJuIG5vcm1hbGl6ZWQucmVwbGFjZSgvXltkbGNicHMtXVtyd3hTdFRzLV17OX1bK0AuXT9cXHMrXFxkK1xccytcXFMrXFxzK1xcUytcXHMrXFxkK1xccytcXHd7M31cXHMrXFxkezEsMn1cXHMrKD86XFxkezJ9OlxcZHsyfXxcXGR7NH0pXFxzKy9nbSwgJyR7bGlzdGluZ30gJyk7XG59XG5cbmZ1bmN0aW9uIGVzY2FwZVJlZ0V4cENoYXJhY3RlcnModmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgJ1xcXFwkJicpO1xufVxuXG4vKipcbiAqIFJlc29sdmVzIHRoZSBmaWxlIHtAbGluayBhc3NlcnRTbmFwc2hvdH0gd291bGQgY29tcGFyZSBhZ2FpbnN0LCBzbyBhbiB1cGRhdGVcbiAqIHJ1biB3cml0ZXMgdGhlIHBhdGggdGhlIGFzc2VydCBydW4gcmVhZHMuIE1pcnJvcnMgYFNuYXBzaG90Q29udGV4dGA6IHRoZVxuICogc25hcHNob3Qgc2l0cyBuZXh0IHRvIHRoZSB0ZXN0J3MgKnNvdXJjZSosIHRob3VnaCB0aGUgdGVzdCBydW5zIGZyb20gYG91dC9gLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc25hcHNob3RQYXRoRm9yVGVzdCh0ZXN0OiBNb2NoYS5SdW5uYWJsZSwgbmFtZTogc3RyaW5nLCBleHRlbnNpb246IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghdGVzdC5maWxlKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdbYWhwLXNuYXBzaG90XSBjdXJyZW50IHRlc3QgZmlsZSBpcyBub3Qgc2V0Jyk7XG5cdH1cblx0Y29uc3Qgc3JjID0gVVJJLmpvaW5QYXRoKEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCcnKSwgJy4uL3NyYycpO1xuXHRjb25zdCBwYXJ0cyA9IHRlc3QuZmlsZS5zcGxpdCgvWy9cXFxcXS9nKTtcblx0Y29uc3Qgc25hcHNob3RzRGlyID0gVVJJLmpvaW5QYXRoKHNyYywgLi4ucGFydHMuc2xpY2UoMCwgLTEpLCAnX19zbmFwc2hvdHNfXycpO1xuXHRjb25zdCBmaWxlTmFtZSA9IGAke3Nhbml0aXplTmFtZSh0ZXN0LmZ1bGxUaXRsZSgpKX0uJHtzYW5pdGl6ZU5hbWUobmFtZSl9LiR7ZXh0ZW5zaW9ufWA7XG5cdHJldHVybiBVUkkuam9pblBhdGgoc25hcHNob3RzRGlyLCBmaWxlTmFtZSkuZnNQYXRoO1xufVxuXG5mdW5jdGlvbiBzYW5pdGl6ZU5hbWUobmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIG5hbWUucmVwbGFjZSgvW15hLXowLTlfLV0vZ2ksICdfJyk7XG59XG5cbmZ1bmN0aW9uIHBhcnNlRml4dHVyZSh2YWx1ZTogdW5rbm93biwgZml4dHVyZVBhdGg6IHN0cmluZyk6IElBaHBTbmFwc2hvdEZpeHR1cmUge1xuXHRjb25zdCBmaXh0dXJlID0gcmVhZFJlY29yZCh2YWx1ZSwgJ2ZpeHR1cmUnKTtcblx0aWYgKGZpeHR1cmUudmVyc2lvbiAhPT0gMSkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgW2FocC1zbmFwc2hvdF0gdW5zdXBwb3J0ZWQgZml4dHVyZSB2ZXJzaW9uIGluICR7Zml4dHVyZVBhdGh9YCk7XG5cdH1cblx0aWYgKCFBcnJheS5pc0FycmF5KGZpeHR1cmUucm91bmRzKSB8fCBmaXh0dXJlLnJvdW5kcy5sZW5ndGggPT09IDApIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYFthaHAtc25hcHNob3RdIHJvdW5kcyBtdXN0IGJlIGEgbm9uLWVtcHR5IGFycmF5IGluICR7Zml4dHVyZVBhdGh9YCk7XG5cdH1cblx0cmV0dXJuIHtcblx0XHR2ZXJzaW9uOiAxLFxuXHRcdHJvdW5kczogZml4dHVyZS5yb3VuZHMubWFwKCh2YWx1ZSwgaW5kZXgpID0+IHtcblx0XHRcdGNvbnN0IHJvdW5kID0gcmVhZFJlY29yZCh2YWx1ZSwgYHJvdW5kc1ske2luZGV4fV1gKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNsaWVudFRvU2VydmVyOiByZWFkRW50cmllcyhyb3VuZC5jbGllbnRUb1NlcnZlciwgYHJvdW5kc1ske2luZGV4fV0uY2xpZW50VG9TZXJ2ZXJgKSxcblx0XHRcdFx0c2VydmVyVG9DbGllbnQ6IHJlYWRFbnRyaWVzKHJvdW5kLnNlcnZlclRvQ2xpZW50LCBgcm91bmRzWyR7aW5kZXh9XS5zZXJ2ZXJUb0NsaWVudGApLFxuXHRcdFx0fTtcblx0XHR9KSxcblx0fTtcbn1cblxuZnVuY3Rpb24gc2VyaWFsaXplRml4dHVyZShmaXh0dXJlOiBJQWhwU25hcHNob3RGaXh0dXJlKTogc3RyaW5nIHtcblx0cmV0dXJuIHlhbWxNb2R1bGUuZHVtcChmaXh0dXJlLCB7IGxpbmVXaWR0aDogLTEsIG5vUmVmczogdHJ1ZSB9KTtcbn1cblxuZnVuY3Rpb24gcmVhZEVudHJpZXModmFsdWU6IHVua25vd24sIG5hbWU6IHN0cmluZyk6IElBaHBTbmFwc2hvdEVudHJ5W10ge1xuXHRpZiAoIUFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBbYWhwLXNuYXBzaG90XSAke25hbWV9IG11c3QgYmUgYW4gYXJyYXlgKTtcblx0fVxuXHRyZXR1cm4gdmFsdWUubWFwKChpdGVtLCBpbmRleCkgPT4ge1xuXHRcdGNvbnN0IGVudHJ5ID0gcmVhZFJlY29yZChpdGVtLCBgJHtuYW1lfVske2luZGV4fV1gKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2hhbm5lbDogcmVhZE9wdGlvbmFsU3RyaW5nKGVudHJ5LCAnY2hhbm5lbCcpLFxuXHRcdFx0YWN0aW9uOiBlbnRyeS5hY3Rpb24gPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IHJlYWRSZWNvcmQoZW50cnkuYWN0aW9uLCBgJHtuYW1lfVske2luZGV4fV0uYWN0aW9uYCksXG5cdFx0XHRtZXRob2Q6IHJlYWRPcHRpb25hbFN0cmluZyhlbnRyeSwgJ21ldGhvZCcpLFxuXHRcdH07XG5cdH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBiaW5kUHJlcmVxdWlzaXRlcyhcblx0Y2xpZW50OiBJQWhwU25hcHNob3RDbGllbnQsXG5cdGFjdGlvbjogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG5cdGJpbmRpbmdzOiBNYXA8c3RyaW5nLCBzdHJpbmc+LFxuXHRzZWVuTm90aWZpY2F0aW9uczogU2V0PG9iamVjdD4sXG4pOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgYWN0aW9uVHlwZSA9IHJlYWRTdHJpbmcoYWN0aW9uLCAndHlwZScpO1xuXHRpZiAoYWN0aW9uVHlwZSAhPT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCBub3RpZmljYXRpb24gPSBhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihjYW5kaWRhdGUgPT4ge1xuXHRcdGlmIChzZWVuTm90aWZpY2F0aW9ucy5oYXMoY2FuZGlkYXRlIGFzIG9iamVjdCkgfHwgY2FuZGlkYXRlLm1ldGhvZCAhPT0gJ2FjdGlvbicpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgYWN0aW9uID0gKGNhbmRpZGF0ZS5wYXJhbXMgYXMgQWN0aW9uRW52ZWxvcGUpLmFjdGlvbjtcblx0XHRyZXR1cm4gYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHkgfHwgYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdEVycm9yO1xuXHR9LCA5MF8wMDApO1xuXHRzZWVuTm90aWZpY2F0aW9ucy5hZGQobm90aWZpY2F0aW9uIGFzIG9iamVjdCk7XG5cblx0Y29uc3QgcmVhZHlBY3Rpb24gPSAobm90aWZpY2F0aW9uLnBhcmFtcyBhcyBBY3Rpb25FbnZlbG9wZSkuYWN0aW9uO1xuXHRpZiAocmVhZHlBY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0RXJyb3IpIHtcblx0XHRjb25zdCByZXBsYXlFcnJvciA9IGNsaWVudC50YWtlUmVwbGF5RXJyb3IoKTtcblx0XHRpZiAocmVwbGF5RXJyb3IpIHtcblx0XHRcdHRocm93IHJlcGxheUVycm9yO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoYFthaHAtc25hcHNob3RdIHR1cm4gZmFpbGVkIGJlZm9yZSBjaGF0L3Rvb2xDYWxsUmVhZHk6ICR7cmVhZHlBY3Rpb24uZXJyb3IuZXJyb3JUeXBlfTogJHtyZWFkeUFjdGlvbi5lcnJvci5tZXNzYWdlfWApO1xuXHR9XG5cdGlmIChyZWFkeUFjdGlvbi50eXBlICE9PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5KSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdbYWhwLXNuYXBzaG90XSBleHBlY3RlZCBjaGF0L3Rvb2xDYWxsUmVhZHkgcHJlcmVxdWlzaXRlJyk7XG5cdH1cblx0YmluZEZpZWxkUGxhY2Vob2xkZXIoYWN0aW9uLCAndG9vbENhbGxJZCcsIHJlYWR5QWN0aW9uLnRvb2xDYWxsSWQsIGJpbmRpbmdzKTtcbn1cblxuZnVuY3Rpb24gYmluZEZpZWxkUGxhY2Vob2xkZXIocmVjb3JkOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwga2V5OiBzdHJpbmcsIGFjdHVhbDogc3RyaW5nLCBiaW5kaW5nczogTWFwPHN0cmluZywgc3RyaW5nPik6IHZvaWQge1xuXHRjb25zdCBleHBlY3RlZCA9IHJlYWRTdHJpbmcocmVjb3JkLCBrZXkpO1xuXHRpZiAoIVBMQUNFSE9MREVSX1JFLnRlc3QoZXhwZWN0ZWQpKSB7XG5cdFx0aWYgKGV4cGVjdGVkICE9PSBhY3R1YWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgW2FocC1zbmFwc2hvdF0gZXhwZWN0ZWQgJHtrZXl9ICR7ZXhwZWN0ZWR9LCBnb3QgJHthY3R1YWx9YCk7XG5cdFx0fVxuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCBleGlzdGluZyA9IGJpbmRpbmdzLmdldChleHBlY3RlZCk7XG5cdGlmIChleGlzdGluZyAhPT0gdW5kZWZpbmVkICYmIGV4aXN0aW5nICE9PSBhY3R1YWwpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYFthaHAtc25hcHNob3RdICR7ZXhwZWN0ZWR9IHdhcyBhbHJlYWR5IGJvdW5kIHRvICR7ZXhpc3Rpbmd9LCBnb3QgJHthY3R1YWx9YCk7XG5cdH1cblx0YmluZGluZ3Muc2V0KGV4cGVjdGVkLCBhY3R1YWwpO1xufVxuXG5mdW5jdGlvbiBiaW5kR2VuZXJhdGVkSWRlbnRpZmllcnModmFsdWU6IHVua25vd24sIGJpbmRpbmdzOiBNYXA8c3RyaW5nLCBzdHJpbmc+KTogdm9pZCB7XG5cdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0Y29uc3QgbWF0Y2ggPSBQTEFDRUhPTERFUl9SRS5leGVjKHZhbHVlKTtcblx0XHRpZiAobWF0Y2g/Lmdyb3Vwcz8ua2luZCA9PT0gJ3R1cm4nICYmICFiaW5kaW5ncy5oYXModmFsdWUpKSB7XG5cdFx0XHRiaW5kaW5ncy5zZXQodmFsdWUsIGdlbmVyYXRlVXVpZCgpKTtcblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiB2YWx1ZSkge1xuXHRcdFx0YmluZEdlbmVyYXRlZElkZW50aWZpZXJzKGl0ZW0sIGJpbmRpbmdzKTtcblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIE9iamVjdC52YWx1ZXModmFsdWUpKSB7XG5cdFx0XHRiaW5kR2VuZXJhdGVkSWRlbnRpZmllcnMoaXRlbSwgYmluZGluZ3MpO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiByZXNvbHZlUGxhY2Vob2xkZXJzKHZhbHVlOiB1bmtub3duLCBiaW5kaW5nczogTWFwPHN0cmluZywgc3RyaW5nPik6IHVua25vd24ge1xuXHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiByZXNvbHZlUGxhY2Vob2xkZXIodmFsdWUsIGJpbmRpbmdzKTtcblx0fVxuXHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gdmFsdWUubWFwKGl0ZW0gPT4gcmVzb2x2ZVBsYWNlaG9sZGVycyhpdGVtLCBiaW5kaW5ncykpO1xuXHR9XG5cdGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG5cdFx0cmV0dXJuIE9iamVjdC5mcm9tRW50cmllcyhPYmplY3QuZW50cmllcyh2YWx1ZSkubWFwKChba2V5LCBpdGVtXSkgPT4gW2tleSwgcmVzb2x2ZVBsYWNlaG9sZGVycyhpdGVtLCBiaW5kaW5ncyldKSk7XG5cdH1cblx0cmV0dXJuIHZhbHVlO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlUGxhY2Vob2xkZXIodmFsdWU6IHN0cmluZywgYmluZGluZ3M6IE1hcDxzdHJpbmcsIHN0cmluZz4pOiBzdHJpbmcge1xuXHRpZiAoIVBMQUNFSE9MREVSX1JFLnRlc3QodmFsdWUpKSB7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cdGNvbnN0IHJlc29sdmVkID0gYmluZGluZ3MuZ2V0KHZhbHVlKTtcblx0aWYgKHJlc29sdmVkID09PSB1bmRlZmluZWQpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYFthaHAtc25hcHNob3RdIG5vIHZhbHVlIGlzIGJvdW5kIGZvciAke3ZhbHVlfWApO1xuXHR9XG5cdHJldHVybiByZXNvbHZlZDtcbn1cblxuZnVuY3Rpb24gcGFyc2VDbGllbnRBY3Rpb24odmFsdWU6IHVua25vd24pOiBTdGF0ZUFjdGlvbiB7XG5cdGNvbnN0IGFjdGlvbiA9IHJlYWRSZWNvcmQodmFsdWUsICdhY3Rpb24nKTtcblx0c3dpdGNoIChyZWFkU3RyaW5nKGFjdGlvbiwgJ3R5cGUnKSkge1xuXHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0OiB7XG5cdFx0XHRjb25zdCBhY3RpdmVDbGllbnQgPSByZWFkUmVjb3JkKGFjdGlvbi5hY3RpdmVDbGllbnQsICdhY3RpdmVDbGllbnQnKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdFx0YWN0aXZlQ2xpZW50OiB7XG5cdFx0XHRcdFx0Y2xpZW50SWQ6IHJlYWRTdHJpbmcoYWN0aXZlQ2xpZW50LCAnY2xpZW50SWQnKSxcblx0XHRcdFx0XHRkaXNwbGF5TmFtZTogcmVhZE9wdGlvbmFsU3RyaW5nKGFjdGl2ZUNsaWVudCwgJ2Rpc3BsYXlOYW1lJyksXG5cdFx0XHRcdFx0dG9vbHM6IHJlYWRUb29scyhhY3RpdmVDbGllbnQudG9vbHMpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZDoge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IHJlYWRSZWNvcmQoYWN0aW9uLm1lc3NhZ2UsICdtZXNzYWdlJyk7XG5cdFx0XHRjb25zdCBvcmlnaW4gPSByZWFkUmVjb3JkKG1lc3NhZ2Uub3JpZ2luLCAnbWVzc2FnZS5vcmlnaW4nKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gbWVzc2FnZS5tb2RlbCA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogcmVhZFJlY29yZChtZXNzYWdlLm1vZGVsLCAnbWVzc2FnZS5tb2RlbCcpO1xuXHRcdFx0Y29uc3Qgb3JpZ2luS2luZCA9IHJlYWRTdHJpbmcob3JpZ2luLCAna2luZCcpO1xuXHRcdFx0aWYgKG9yaWdpbktpbmQgIT09IE1lc3NhZ2VLaW5kLlVzZXIpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbYWhwLXNuYXBzaG90XSBjbGllbnQgdHVybiBvcmlnaW4gbXVzdCBiZSAke01lc3NhZ2VLaW5kLlVzZXJ9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiByZWFkU3RyaW5nKGFjdGlvbiwgJ3R1cm5JZCcpLFxuXHRcdFx0XHRzdGFydGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0bWVzc2FnZToge1xuXHRcdFx0XHRcdHRleHQ6IHJlYWRTdHJpbmcobWVzc2FnZSwgJ3RleHQnKSxcblx0XHRcdFx0XHRvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LFxuXHRcdFx0XHRcdC4uLihtb2RlbCA/IHsgbW9kZWw6IHsgaWQ6IHJlYWRTdHJpbmcobW9kZWwsICdpZCcpIH0gfSA6IHt9KSxcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQ6XG5cdFx0XHRpZiAoYWN0aW9uLmFwcHJvdmVkICE9PSB0cnVlIHx8IGFjdGlvbi5jb25maXJtZWQgIT09IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlVzZXJBY3Rpb24pIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdbYWhwLXNuYXBzaG90XSBleGVjdXRhYmxlIHRvb2wgY29uZmlybWF0aW9ucyBjdXJyZW50bHkgcmVxdWlyZSB1c2VyIGFwcHJvdmFsJyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCxcblx0XHRcdFx0dHVybklkOiByZWFkU3RyaW5nKGFjdGlvbiwgJ3R1cm5JZCcpLFxuXHRcdFx0XHR0b29sQ2FsbElkOiByZWFkU3RyaW5nKGFjdGlvbiwgJ3Rvb2xDYWxsSWQnKSxcblx0XHRcdFx0YXBwcm92ZWQ6IHRydWUsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uVXNlckFjdGlvbixcblx0XHRcdH07XG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlOiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSByZWFkUmVjb3JkKGFjdGlvbi5yZXN1bHQsICdyZXN1bHQnKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZDogcmVhZFN0cmluZyhhY3Rpb24sICd0dXJuSWQnKSxcblx0XHRcdFx0dG9vbENhbGxJZDogcmVhZFN0cmluZyhhY3Rpb24sICd0b29sQ2FsbElkJyksXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdHN1Y2Nlc3M6IHJlYWRCb29sZWFuKHJlc3VsdCwgJ3N1Y2Nlc3MnKSxcblx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiByZWFkU3RyaW5nKHJlc3VsdCwgJ3Bhc3RUZW5zZU1lc3NhZ2UnKSxcblx0XHRcdFx0XHRjb250ZW50OiByZWFkVG9vbFJlc3VsdENvbnRlbnQocmVzdWx0LmNvbnRlbnQpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHRocm93IG5ldyBFcnJvcihgW2FocC1zbmFwc2hvdF0gdW5zdXBwb3J0ZWQgZXhlY3V0YWJsZSBjbGllbnQgYWN0aW9uOiAke3JlYWRTdHJpbmcoYWN0aW9uLCAndHlwZScpfWApO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlYWRUb29scyh2YWx1ZTogdW5rbm93bik6IHsgbmFtZTogc3RyaW5nOyBkZXNjcmlwdGlvbj86IHN0cmluZzsgaW5wdXRTY2hlbWE/OiB7IHR5cGU6ICdvYmplY3QnOyBwcm9wZXJ0aWVzPzogUmVjb3JkPHN0cmluZywgb2JqZWN0PjsgcmVxdWlyZWQ/OiBzdHJpbmdbXSB9IH1bXSB7XG5cdGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1thaHAtc25hcHNob3RdIGFjdGl2ZUNsaWVudC50b29scyBtdXN0IGJlIGFuIGFycmF5Jyk7XG5cdH1cblx0cmV0dXJuIHZhbHVlLm1hcCgoaXRlbSwgaW5kZXgpID0+IHtcblx0XHRjb25zdCB0b29sID0gcmVhZFJlY29yZChpdGVtLCBgdG9vbHNbJHtpbmRleH1dYCk7XG5cdFx0Y29uc3QgaW5wdXRTY2hlbWEgPSB0b29sLmlucHV0U2NoZW1hID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiByZWFkUmVjb3JkKHRvb2wuaW5wdXRTY2hlbWEsIGB0b29sc1ske2luZGV4fV0uaW5wdXRTY2hlbWFgKTtcblx0XHRpZiAoaW5wdXRTY2hlbWEgJiYgaW5wdXRTY2hlbWEudHlwZSAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgW2FocC1zbmFwc2hvdF0gdG9vbHNbJHtpbmRleH1dLmlucHV0U2NoZW1hLnR5cGUgbXVzdCBiZSBvYmplY3RgKTtcblx0XHR9XG5cdFx0Y29uc3QgcHJvcGVydGllcyA9IGlucHV0U2NoZW1hPy5wcm9wZXJ0aWVzID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiByZWFkT2JqZWN0UHJvcGVydGllcyhpbnB1dFNjaGVtYS5wcm9wZXJ0aWVzLCBgdG9vbHNbJHtpbmRleH1dLmlucHV0U2NoZW1hLnByb3BlcnRpZXNgKTtcblx0XHRjb25zdCByZXF1aXJlZCA9IGlucHV0U2NoZW1hPy5yZXF1aXJlZCA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogcmVhZFN0cmluZ0FycmF5KGlucHV0U2NoZW1hLnJlcXVpcmVkLCBgdG9vbHNbJHtpbmRleH1dLmlucHV0U2NoZW1hLnJlcXVpcmVkYCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6IHJlYWRTdHJpbmcodG9vbCwgJ25hbWUnKSxcblx0XHRcdGRlc2NyaXB0aW9uOiByZWFkT3B0aW9uYWxTdHJpbmcodG9vbCwgJ2Rlc2NyaXB0aW9uJyksXG5cdFx0XHQuLi4oaW5wdXRTY2hlbWEgPyB7IGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzLCByZXF1aXJlZCB9IH0gOiB7fSksXG5cdFx0fTtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIHJlYWRUb29sUmVzdWx0Q29udGVudCh2YWx1ZTogdW5rbm93bik6IHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQ7IHRleHQ6IHN0cmluZyB9W10gfCB1bmRlZmluZWQge1xuXHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKCFBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdHRocm93IG5ldyBFcnJvcignW2FocC1zbmFwc2hvdF0gdG9vbCByZXN1bHQgY29udGVudCBtdXN0IGJlIGFuIGFycmF5Jyk7XG5cdH1cblx0cmV0dXJuIHZhbHVlLm1hcCgoaXRlbSwgaW5kZXgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gcmVhZFJlY29yZChpdGVtLCBgcmVzdWx0LmNvbnRlbnRbJHtpbmRleH1dYCk7XG5cdFx0aWYgKGNvbnRlbnQudHlwZSAhPT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgW2FocC1zbmFwc2hvdF0gdW5zdXBwb3J0ZWQgZXhlY3V0YWJsZSB0b29sIHJlc3VsdCBjb250ZW50OiAke1N0cmluZyhjb250ZW50LnR5cGUpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4geyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogcmVhZFN0cmluZyhjb250ZW50LCAndGV4dCcpIH07XG5cdH0pO1xufVxuXG5mdW5jdGlvbiByZWFkT2JqZWN0UHJvcGVydGllcyh2YWx1ZTogdW5rbm93biwgbmFtZTogc3RyaW5nKTogUmVjb3JkPHN0cmluZywgb2JqZWN0PiB7XG5cdGNvbnN0IHByb3BlcnRpZXMgPSByZWFkUmVjb3JkKHZhbHVlLCBuYW1lKTtcblx0Zm9yIChjb25zdCBba2V5LCBwcm9wZXJ0eV0gb2YgT2JqZWN0LmVudHJpZXMocHJvcGVydGllcykpIHtcblx0XHRpZiAoIXByb3BlcnR5IHx8IHR5cGVvZiBwcm9wZXJ0eSAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgW2FocC1zbmFwc2hvdF0gJHtuYW1lfS4ke2tleX0gbXVzdCBiZSBhbiBvYmplY3RgKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHByb3BlcnRpZXMgYXMgUmVjb3JkPHN0cmluZywgb2JqZWN0Pjtcbn1cblxuZnVuY3Rpb24gcmVhZFN0cmluZ0FycmF5KHZhbHVlOiB1bmtub3duLCBuYW1lOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZSkgfHwgIXZhbHVlLmV2ZXJ5KGl0ZW0gPT4gdHlwZW9mIGl0ZW0gPT09ICdzdHJpbmcnKSkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgW2FocC1zbmFwc2hvdF0gJHtuYW1lfSBtdXN0IGJlIGEgc3RyaW5nIGFycmF5YCk7XG5cdH1cblx0cmV0dXJuIHZhbHVlO1xufVxuXG5hc3luYyBmdW5jdGlvbiB3YWl0Rm9yRmluYWxTZXJ2ZXJNZXNzYWdlKGNsaWVudDogSUFocFNuYXBzaG90Q2xpZW50LCBlbnRyaWVzOiByZWFkb25seSBJQWhwU25hcHNob3RFbnRyeVtdLCBzZWVuTm90aWZpY2F0aW9uczogU2V0PG9iamVjdD4sIGJpbmRpbmdzOiBNYXA8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IGZpbmFsRW50cnkgPSBlbnRyaWVzLmF0KC0xKTtcblx0aWYgKCFmaW5hbEVudHJ5KSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdbYWhwLXNuYXBzaG90XSBzZXJ2ZXJUb0NsaWVudCBtdXN0IG5vdCBiZSBlbXB0eScpO1xuXHR9XG5cdGNvbnN0IGZpbmFsQWN0aW9uVHlwZSA9IGZpbmFsRW50cnkuYWN0aW9uID8gcmVhZFN0cmluZyhmaW5hbEVudHJ5LmFjdGlvbiwgJ3R5cGUnKSA6IHVuZGVmaW5lZDtcblx0Y29uc3QgZmluYWxDaGFubmVsID0gZmluYWxFbnRyeS5jaGFubmVsID8gcmVzb2x2ZVBsYWNlaG9sZGVyKGZpbmFsRW50cnkuY2hhbm5lbCwgYmluZGluZ3MpIDogdW5kZWZpbmVkO1xuXHRjb25zdCBmaW5hbFR1cm5JZFBsYWNlaG9sZGVyID0gZmluYWxFbnRyeS5hY3Rpb24gPyByZWFkT3B0aW9uYWxTdHJpbmcoZmluYWxFbnRyeS5hY3Rpb24sICd0dXJuSWQnKSA6IHVuZGVmaW5lZDtcblx0Y29uc3QgZmluYWxUdXJuSWQgPSBmaW5hbFR1cm5JZFBsYWNlaG9sZGVyID8gcmVzb2x2ZVBsYWNlaG9sZGVyKGZpbmFsVHVybklkUGxhY2Vob2xkZXIsIGJpbmRpbmdzKSA6IHVuZGVmaW5lZDtcblx0Y29uc3Qgbm90aWZpY2F0aW9uID0gYXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24oY2FuZGlkYXRlID0+IHtcblx0XHRpZiAoc2Vlbk5vdGlmaWNhdGlvbnMuaGFzKGNhbmRpZGF0ZSBhcyBvYmplY3QpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChjYW5kaWRhdGUubWV0aG9kID09PSAnYWN0aW9uJykge1xuXHRcdFx0Y29uc3QgZW52ZWxvcGUgPSBjYW5kaWRhdGUucGFyYW1zIGFzIEFjdGlvbkVudmVsb3BlO1xuXHRcdFx0aWYgKGZpbmFsQ2hhbm5lbCAmJiBlbnZlbG9wZS5jaGFubmVsICE9PSBmaW5hbENoYW5uZWwpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWN0aW9uID0gZW52ZWxvcGUuYWN0aW9uO1xuXHRcdFx0aWYgKGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRFcnJvcikge1xuXHRcdFx0XHRyZXR1cm4gZmluYWxUdXJuSWQgPT09IHVuZGVmaW5lZCB8fCBhY3Rpb24udHVybklkID09PSBmaW5hbFR1cm5JZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhY3Rpb24udHlwZSA9PT0gZmluYWxBY3Rpb25UeXBlXG5cdFx0XHRcdCYmIChmaW5hbFR1cm5JZCA9PT0gdW5kZWZpbmVkIHx8IChhY3Rpb24gYXMgeyB0dXJuSWQ/OiBzdHJpbmcgfSkudHVybklkID09PSBmaW5hbFR1cm5JZCk7XG5cdFx0fVxuXHRcdHJldHVybiBjYW5kaWRhdGUubWV0aG9kID09PSBmaW5hbEVudHJ5Lm1ldGhvZDtcblx0fSwgOTBfMDAwKTtcblx0c2Vlbk5vdGlmaWNhdGlvbnMuYWRkKG5vdGlmaWNhdGlvbiBhcyBvYmplY3QpO1xuXHRpZiAobm90aWZpY2F0aW9uLm1ldGhvZCA9PT0gJ2FjdGlvbicpIHtcblx0XHRjb25zdCBhY3Rpb24gPSAobm90aWZpY2F0aW9uLnBhcmFtcyBhcyBBY3Rpb25FbnZlbG9wZSkuYWN0aW9uO1xuXHRcdGlmIChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0RXJyb3IgJiYgZmluYWxBY3Rpb25UeXBlICE9PSBBY3Rpb25UeXBlLkNoYXRFcnJvcikge1xuXHRcdFx0Y29uc3QgcmVwbGF5RXJyb3IgPSBjbGllbnQudGFrZVJlcGxheUVycm9yKCk7XG5cdFx0XHRpZiAocmVwbGF5RXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgcmVwbGF5RXJyb3I7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFthaHAtc25hcHNob3RdIHJvdW5kIGZhaWxlZCBiZWZvcmUgJHtmaW5hbEFjdGlvblR5cGV9OiAke2FjdGlvbi5lcnJvci5lcnJvclR5cGV9OiAke2FjdGlvbi5lcnJvci5tZXNzYWdlfWApO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiByZWFkUmVjb3JkKHZhbHVlOiB1bmtub3duLCBuYW1lOiBzdHJpbmcpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XG5cdGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0JyB8fCBBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgW2FocC1zbmFwc2hvdF0gJHtuYW1lfSBtdXN0IGJlIGFuIG9iamVjdGApO1xuXHR9XG5cdHJldHVybiB2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbn1cblxuZnVuY3Rpb24gcmVhZFN0cmluZyhyZWNvcmQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBrZXk6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHZhbHVlID0gcmVjb3JkW2tleV07XG5cdGlmICh0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBbYWhwLXNuYXBzaG90XSAke2tleX0gbXVzdCBiZSBhIHN0cmluZ2ApO1xuXHR9XG5cdHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gcmVhZE9wdGlvbmFsU3RyaW5nKHJlY29yZDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIGtleTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdmFsdWUgPSByZWNvcmRba2V5XTtcblx0aWYgKHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykge1xuXHRcdHRocm93IG5ldyBFcnJvcihgW2FocC1zbmFwc2hvdF0gJHtrZXl9IG11c3QgYmUgYSBzdHJpbmdgKTtcblx0fVxuXHRyZXR1cm4gdmFsdWU7XG59XG5cbmZ1bmN0aW9uIHJlYWRCb29sZWFuKHJlY29yZDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIGtleTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGNvbnN0IHZhbHVlID0gcmVjb3JkW2tleV07XG5cdGlmICh0eXBlb2YgdmFsdWUgIT09ICdib29sZWFuJykge1xuXHRcdHRocm93IG5ldyBFcnJvcihgW2FocC1zbmFwc2hvdF0gJHtrZXl9IG11c3Qg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
