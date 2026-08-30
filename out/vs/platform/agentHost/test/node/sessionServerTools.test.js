import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { SessionStatus } from "../../common/state/protocol/channels-session/state.js";
import { buildChatUri, buildDefaultChatUri, MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, TurnState, withSessionGitState, withSessionGitHubState } from "../../common/state/sessionState.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { SessionServerToolName } from "../../common/serverToolNames.js";
import { AgentServerToolHost } from "../../node/shared/agentServerToolHost.js";
import {
  applyCreateChatTool,
  applyCreateSessionTool,
  applyDeleteSessionTool,
  applyRenameChatTool,
  applySendMessageTool,
  createSessionServerToolGroup,
  getCreateChatArgs,
  getCreateSessionArgs,
  getDeleteSessionArgs,
  getRenameChatArgs,
  getSendMessageArgs,
  getSessionContextArgs,
  serializeSessionContext,
  filterSessions,
  getListSessionsArgs,
  sessionServerToolDefinitions,
  sessionToolRequiresConfirmation,
  serializeSessions
} from "../../node/shared/sessionServerTools.js";
suite("SessionServerTools", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const workspace = URI.parse("file:///workspace/app");
  const model = { provider: "copilot", id: "gpt-4o", name: "GPT-4o", supportsVision: false };
  function sessionMeta(id, status, dir) {
    return { session: URI.parse(`copilot:/${id}`), startTime: 0, modifiedTime: 0, status: status | SessionStatus.IsRead, workingDirectories: dir ? [dir] : void 0, summary: `title-${id}` };
  }
  function createAccessor(overrides) {
    const depths = overrides?.depths ?? /* @__PURE__ */ new Map();
    return {
      isActiveAgentTitleGenerationEnabled: overrides?.isActiveAgentTitleGenerationEnabled ?? (() => true),
      listSessions: overrides?.listSessions ?? (async () => [sessionMeta("s1", SessionStatus.InProgress, workspace)]),
      createSession: overrides?.createSession ?? (async (config) => {
        overrides?.onCreate?.(config);
        return URI.parse("copilot:/new");
      }),
      getModels: overrides?.getModels ?? (() => [model]),
      getCreationDefaults: overrides?.getCreationDefaults ?? (() => void 0),
      startPrompt: overrides?.startPrompt ?? (async (session, chat, prompt) => {
        overrides?.onPrompt?.(session, chat, prompt);
      }),
      createChat: overrides?.createChat ?? (async (session, chat, options) => {
        overrides?.onCreateChat?.(session, chat, options);
      }),
      renameChat: overrides?.renameChat ?? (async (session, chat, title) => {
        overrides?.onRenameChat?.(session, chat, title);
        return { title };
      }),
      deleteSession: overrides?.deleteSession ?? (async (session) => {
        overrides?.onDelete?.(session);
      }),
      getChatContext: overrides?.getChatContext ?? (async () => void 0),
      getSessionSpawnDepth: overrides?.getSessionSpawnDepth ?? ((session) => depths.get(session.toString()) ?? 0),
      setSessionSpawnDepth: overrides?.setSessionSpawnDepth ?? ((session, depth) => {
        depths.set(session.toString(), depth);
      })
    };
  }
  test("definitions and confirmation", () => {
    assert.deepStrictEqual(sessionServerToolDefinitions.map((d) => d.name), [SessionServerToolName.ListSessions, SessionServerToolName.GetCurrentSession, SessionServerToolName.CreateSession, SessionServerToolName.CreateChat, SessionServerToolName.RenameChat, SessionServerToolName.SendMessage, SessionServerToolName.GetSessionContext, SessionServerToolName.DeleteSession]);
    assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.CreateSession), true);
    assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.CreateChat), true);
    assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.SendMessage), true);
    assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.DeleteSession), true);
    assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.RenameChat), false);
    assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.ListSessions), false);
    assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.GetCurrentSession), false);
    assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.GetSessionContext), false);
    assert.deepStrictEqual(sessionServerToolDefinitions.slice(4, 5).map((def) => ({ name: def.name, required: def.inputSchema?.required })), [
      { name: SessionServerToolName.RenameChat, required: ["title"] }
    ]);
    assert.deepStrictEqual(sessionServerToolDefinitions.slice(4, 5).map((def) => def.inputSchema?.properties?.title), [
      { type: "string", maxLength: 200, description: "Short, descriptive chat title, ideally 1-4 words." }
    ]);
  });
  test("new sessions use the current setting while materialized sessions keep their advertised tools", async () => {
    let enabled = false;
    const stateManager = new AgentHostStateManager(new NullLogService());
    const disabledSession = "copilot:/s1";
    const enabledSession = "copilot:/s2";
    for (const resource of [disabledSession, enabledSession]) {
      stateManager.createSession({
        resource,
        provider: "copilot",
        title: "Session",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date(0)).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString()
      });
    }
    const accessor = createAccessor({
      isActiveAgentTitleGenerationEnabled: () => enabled,
      listSessions: async () => [
        sessionMeta("s1", SessionStatus.Idle, workspace),
        sessionMeta("s2", SessionStatus.Idle, workspace)
      ]
    });
    const host = new AgentServerToolHost(stateManager, [
      createSessionServerToolGroup(accessor)
    ]);
    host.advertise(disabledSession);
    enabled = true;
    host.advertise(enabledSession);
    await assert.rejects(
      async () => host.executeTool(buildDefaultChatUri(disabledSession), SessionServerToolName.RenameChat, { title: "Disabled" }),
      /Server tool "rename_chat" is disabled/
    );
    assert.strictEqual(
      await host.executeTool(buildDefaultChatUri(enabledSession), SessionServerToolName.RenameChat, { title: "Enabled" }),
      'Renamed chat to "Enabled".'
    );
    assert.deepStrictEqual({
      disabledTools: stateManager.getSessionState(disabledSession)?.serverTools?.map((tool) => tool.name),
      enabledTools: stateManager.getSessionState(enabledSession)?.serverTools?.map((tool) => tool.name)
    }, {
      disabledTools: [
        SessionServerToolName.ListSessions,
        SessionServerToolName.GetCurrentSession,
        SessionServerToolName.CreateSession,
        SessionServerToolName.CreateChat,
        SessionServerToolName.SendMessage,
        SessionServerToolName.GetSessionContext,
        SessionServerToolName.DeleteSession
      ],
      enabledTools: sessionServerToolDefinitions.map((tool) => tool.name)
    });
    stateManager.dispose();
  });
  test("materialized rename tools remain executable after the root setting is disabled", async () => {
    let enabled = true;
    const stateManager = new AgentHostStateManager(new NullLogService());
    const session = "copilot:/s1";
    stateManager.createSession({
      resource: session,
      provider: "copilot",
      title: "Session",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString()
    });
    const host = new AgentServerToolHost(stateManager, [
      createSessionServerToolGroup(createAccessor({ isActiveAgentTitleGenerationEnabled: () => enabled }))
    ]);
    host.advertise(session);
    enabled = false;
    assert.strictEqual(
      await host.executeTool(buildDefaultChatUri(session), SessionServerToolName.RenameChat, { title: "Still enabled" }),
      'Renamed chat to "Still enabled".'
    );
    stateManager.dispose();
  });
  test("serializeSessions produces compact metadata", () => {
    const text = serializeSessions([sessionMeta("s1", SessionStatus.InputNeeded, workspace)]);
    assert.deepStrictEqual(JSON.parse(text), {
      sessions: [{
        session: "copilot:/s1",
        status: "inputNeeded",
        workingDirectory: workspace.toString(),
        title: "title-s1"
      }]
    });
  });
  test("serializeSessions includes meaningful metadata when present", () => {
    let meta = withSessionGitState(void 0, { branchName: "feature/x", baseBranchName: "main", outgoingChanges: 2, incomingChanges: 1, uncommittedChanges: 3 });
    meta = withSessionGitHubState(meta, { owner: "microsoft", repo: "vscode", pullRequestUrls: ["https://github.com/microsoft/vscode/pull/1"] });
    const rich = {
      session: URI.parse("copilot:/rich"),
      startTime: 0,
      modifiedTime: 17e11,
      status: SessionStatus.InProgress,
      activity: "Running tests",
      workingDirectories: workspace ? [workspace] : void 0,
      project: { uri: workspace, displayName: "app" },
      summary: "Rich session",
      changes: { files: 1, additions: 2, deletions: 0 },
      _meta: meta
    };
    assert.deepStrictEqual(JSON.parse(serializeSessions([rich])), {
      sessions: [{
        session: "copilot:/rich",
        title: "Rich session",
        status: "inProgress",
        activity: "Running tests",
        workingDirectory: workspace.toString(),
        project: "app",
        unread: true,
        modifiedAt: (/* @__PURE__ */ new Date(17e11)).toISOString(),
        changes: { files: 1, additions: 2, deletions: 0 },
        git: { branch: "feature/x", baseBranch: "main", ahead: 2, behind: 1, uncommittedChanges: 3 },
        github: { owner: "microsoft", repo: "vscode", pullRequestUrl: "https://github.com/microsoft/vscode/pull/1" }
      }]
    });
  });
  test("serializeSessions reports archived status from the IsArchived status bit", () => {
    const archived = { ...sessionMeta("archived", SessionStatus.Idle | SessionStatus.IsArchived, workspace) };
    const notArchived = { ...sessionMeta("notArchived", SessionStatus.Idle, workspace) };
    const noStatus = { session: URI.parse("copilot:/noStatus"), startTime: 0, modifiedTime: 0, workingDirectories: workspace ? [workspace] : void 0 };
    assert.deepStrictEqual(JSON.parse(serializeSessions([archived, notArchived, noStatus])).sessions.map((s) => ({ session: s.session, status: s.status })), [
      { session: "copilot:/archived", status: "idle,archived" },
      { session: "copilot:/notArchived", status: "idle" },
      { session: "copilot:/noStatus", status: void 0 }
    ]);
  });
  test("only sessions known to be unread report or filter as unread", () => {
    const unknown = { session: URI.parse("copilot:/unknown"), startTime: 0, modifiedTime: 0, workingDirectories: [workspace] };
    const unread = { ...sessionMeta("unread", SessionStatus.Idle, workspace), status: SessionStatus.Idle };
    const read = sessionMeta("read", SessionStatus.Idle, workspace);
    const sessions = [unknown, unread, read];
    assert.deepStrictEqual({
      serializedUnread: JSON.parse(serializeSessions(sessions)).sessions.map((s) => ({ session: s.session, unread: s.unread })),
      filteredToUnread: filterSessions(sessions, getListSessionsArgs({ unread: true })).map((s) => s.session.toString())
    }, {
      serializedUnread: [
        { session: "copilot:/unknown", unread: void 0 },
        { session: "copilot:/unread", unread: true },
        { session: "copilot:/read", unread: void 0 }
      ],
      filteredToUnread: ["copilot:/unread"]
    });
  });
  test("getCreateSessionArgs resolves workspace by working directory and model by id/name", () => {
    const sessions = [sessionMeta("s1", SessionStatus.Idle, workspace)];
    const byId = getCreateSessionArgs({ workspace: workspace.toString(), prompt: "hi", model: "gpt-4o" }, sessions, [model]);
    assert.strictEqual(byId.workspace.toString(), workspace.toString());
    assert.strictEqual(byId.model?.id, "gpt-4o");
    const byName = getCreateSessionArgs({ workspace: workspace.toString(), prompt: "hi", model: "GPT-4o" }, sessions, [model]);
    assert.strictEqual(byName.model?.name, "GPT-4o");
  });
  test("getCreateSessionArgs accepts an absolute filesystem path as workspace", () => {
    const resolved = getCreateSessionArgs({ workspace: "/Users/me/work/repo", prompt: "hi" }, [], []);
    assert.strictEqual(resolved.workspace.scheme, "file");
    assert.strictEqual(resolved.workspace.path, "/Users/me/work/repo");
  });
  test("getCreateSessionArgs throws on invalid input", () => {
    assert.throws(() => getCreateSessionArgs({ workspace: "not a uri", prompt: "hi" }, [], []), /workspace/);
    assert.throws(() => getCreateSessionArgs({ workspace: workspace.toString(), prompt: "hi", model: "nope" }, [], [model]), /model/);
    assert.throws(() => getCreateSessionArgs({ workspace: workspace.toString() }, [], []), /prompt/);
  });
  test("create_session builds config, starts the default chat, and returns an open link", async () => {
    const store = new DisposableStore();
    const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
    let created;
    let prompted;
    const accessor = createAccessor({ onCreate: (c) => {
      created = c;
    }, onPrompt: (_s, chat, prompt) => {
      prompted = { chat, prompt };
    } });
    const group = createSessionServerToolGroup(accessor);
    const text = await group.execute(stateManager, "copilot:/caller", SessionServerToolName.CreateSession, { workspace: workspace.toString(), prompt: "do it", model: "gpt-4o" });
    assert.deepStrictEqual(created, { workingDirectories: [workspace], provider: "copilot", model: { id: "gpt-4o" } });
    assert.strictEqual(prompted?.prompt, "do it");
    assert.strictEqual(prompted?.chat.toString(), buildDefaultChatUri(URI.parse("copilot:/new")));
    assert.ok(text.includes("agent-host-session://copilot/new"), "result carries the open-session link for the pill");
    assert.ok(!text.includes("copilot:/new"), "result does not echo the raw backend session URI");
    store.dispose();
  });
  test("create_session inherits the calling chat model and permission config", async () => {
    const source = URI.parse(buildChatUri("copilot:/caller", "peer"));
    let creationSource;
    let created;
    const accessor = createAccessor({
      getCreationDefaults: (uri) => {
        creationSource = uri;
        return {
          provider: "copilot",
          model: { id: "gpt-inherited" },
          config: {
            autoApprove: "autoApprove",
            permissions: { allow: ["shell"], deny: ["write"] }
          }
        };
      },
      onCreate: (config) => {
        created = config;
      }
    });
    const group = createSessionServerToolGroup(accessor);
    const store = new DisposableStore();
    const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
    await group.execute(stateManager, source.toString(), SessionServerToolName.CreateSession, { workspace: workspace.toString(), prompt: "do it" });
    assert.deepStrictEqual({
      creationSource: creationSource?.toString(),
      created
    }, {
      creationSource: source.toString(),
      created: {
        workingDirectories: [workspace],
        provider: "copilot",
        model: { id: "gpt-inherited" },
        config: {
          autoApprove: "autoApprove",
          permissions: { allow: ["shell"], deny: ["write"] }
        }
      }
    });
    store.dispose();
  });
  test("create_session inherits the calling provider when its model is the provider default", async () => {
    let created;
    const accessor = createAccessor({
      getCreationDefaults: () => ({
        provider: "claude",
        config: { permissionMode: "acceptEdits" }
      }),
      onCreate: (config) => {
        created = config;
      }
    });
    await applyCreateSessionTool(accessor, { workspace: workspace.toString(), prompt: "do it" }, URI.parse("claude:/source"));
    assert.deepStrictEqual(created, {
      workingDirectories: [workspace],
      provider: "claude",
      config: { permissionMode: "acceptEdits" }
    });
  });
  test("list_sessions execute returns serialized sessions", async () => {
    const store = new DisposableStore();
    const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
    const group = createSessionServerToolGroup(createAccessor());
    const text = await group.execute(stateManager, "copilot:/caller", SessionServerToolName.ListSessions, {});
    assert.deepStrictEqual(JSON.parse(text).sessions.map((s) => s.session), ["copilot:/s1"]);
    store.dispose();
  });
  test("list_sessions filters by status, workspace, changes, archived and creation time", async () => {
    const store = new DisposableStore();
    const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
    const other = URI.parse("file:///workspace/other");
    const idle = { ...sessionMeta("idle", SessionStatus.Idle, workspace), startTime: 1e3, changes: { files: 2, additions: 5, deletions: 1 } };
    const needsInput = { ...sessionMeta("needsInput", SessionStatus.InputNeeded, workspace), startTime: 3e3, status: SessionStatus.InputNeeded };
    const elsewhere = { ...sessionMeta("elsewhere", SessionStatus.Idle, other), startTime: 5e3 };
    const archived = { ...sessionMeta("archived", SessionStatus.Idle | SessionStatus.IsArchived, workspace), startTime: 2e3 };
    const withPr = { ...sessionMeta("withPr", SessionStatus.Idle, workspace), startTime: 4e3, _meta: withSessionGitHubState(void 0, { pullRequestUrls: ["https://github.com/o/r/pull/2"] }) };
    const inheritedPr = { ...sessionMeta("inheritedPr", SessionStatus.Idle, workspace), startTime: 4500, _meta: withSessionGitHubState(void 0, { pullRequestUrls: ["https://github.com/o/r/pull/3"], initialPullRequestUrls: ["https://github.com/o/r/pull/3"] }) };
    const sessions = [idle, needsInput, elsewhere, archived, withPr, inheritedPr];
    const group = createSessionServerToolGroup(createAccessor({ listSessions: async () => sessions }));
    const ids = async (args) => JSON.parse(await group.execute(stateManager, "copilot:/caller", SessionServerToolName.ListSessions, args)).sessions.map((s) => s.session);
    assert.deepStrictEqual({
      byStatus: await ids({ status: ["inputNeeded"] }),
      byArchivedStatus: await ids({ status: ["archived"] }),
      byWorkspace: await ids({ workspace: workspace.toString() }),
      withChanges: await ids({ withChanges: true }),
      unread: await ids({ unread: true }),
      withPullRequest: await ids({ withPullRequest: true }),
      withArchived: await ids({ includeArchived: true }),
      createdAfter: await ids({ createdAfter: (/* @__PURE__ */ new Date(3e3)).toISOString() }),
      createdBefore: await ids({ createdBefore: (/* @__PURE__ */ new Date(3e3)).toISOString() }),
      combined: await ids({ status: ["idle"], workspace: workspace.toString(), withChanges: true }),
      all: await ids({})
    }, {
      byStatus: ["copilot:/needsInput"],
      byArchivedStatus: ["copilot:/archived"],
      byWorkspace: ["copilot:/idle", "copilot:/needsInput", "copilot:/withPr", "copilot:/inheritedPr"],
      withChanges: ["copilot:/idle"],
      unread: ["copilot:/needsInput"],
      withPullRequest: ["copilot:/withPr"],
      withArchived: ["copilot:/idle", "copilot:/needsInput", "copilot:/elsewhere", "copilot:/archived", "copilot:/withPr", "copilot:/inheritedPr"],
      createdAfter: ["copilot:/needsInput", "copilot:/elsewhere", "copilot:/withPr", "copilot:/inheritedPr"],
      createdBefore: ["copilot:/idle", "copilot:/needsInput"],
      combined: ["copilot:/idle"],
      all: ["copilot:/idle", "copilot:/needsInput", "copilot:/elsewhere", "copilot:/withPr", "copilot:/inheritedPr"]
    });
    store.dispose();
  });
  test("getListSessionsArgs validates filter input", () => {
    assert.deepStrictEqual(getListSessionsArgs({}), { session: void 0, status: void 0, workspace: void 0, withChanges: void 0, unread: void 0, withPullRequest: void 0, includeArchived: void 0, createdAfter: void 0, createdBefore: void 0 });
    assert.throws(() => getListSessionsArgs({ status: ["bogus"] }), /status/);
    assert.throws(() => getListSessionsArgs({ withChanges: "yes" }), /withChanges/);
    assert.throws(() => getListSessionsArgs({ includeArchived: "no" }), /includeArchived/);
    assert.throws(() => getListSessionsArgs({ createdAfter: "not-a-date" }), /createdAfter/);
    assert.strictEqual(filterSessions([sessionMeta("s1", SessionStatus.Idle, workspace)], getListSessionsArgs({})).length, 1);
  });
  test("list_sessions fetches a single session by URI or open link, bypassing other filters", () => {
    const archived = { ...sessionMeta("archived", SessionStatus.Idle, workspace), isArchived: true };
    const sessions = [sessionMeta("s1", SessionStatus.Idle, workspace), archived];
    const ids = (args) => filterSessions(sessions, getListSessionsArgs(args)).map((s) => s.session.toString());
    assert.deepStrictEqual({
      byUri: ids({ session: "copilot:/s1" }),
      byLink: ids({ session: "agent-host-session://copilot/s1" }),
      // A direct lookup returns an archived session even though archived are hidden by default.
      archivedByUri: ids({ session: "copilot:/archived" }),
      unknown: ids({ session: "copilot:/nope" })
    }, {
      byUri: ["copilot:/s1"],
      byLink: ["copilot:/s1"],
      archivedByUri: ["copilot:/archived"],
      unknown: []
    });
  });
  test("create_session stamps spawn depth and enforces the recursion depth limit", async () => {
    const store = new DisposableStore();
    const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
    const depths = /* @__PURE__ */ new Map();
    const group = createSessionServerToolGroup(createAccessor({ depths }));
    const args = { workspace: workspace.toString(), prompt: "go" };
    await group.execute(stateManager, "copilot:/caller", SessionServerToolName.CreateSession, args);
    assert.strictEqual(depths.get("copilot:/new"), 1);
    depths.set("copilot:/deep", 3);
    await assert.rejects(
      async () => {
        await group.execute(stateManager, "copilot:/deep", SessionServerToolName.CreateSession, args);
      },
      /recursion limit/
    );
    store.dispose();
  });
  test("create_session enforces a process-wide breadth backstop", async () => {
    const store = new DisposableStore();
    const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
    let n = 0;
    const group = createSessionServerToolGroup(createAccessor({ createSession: async () => URI.parse(`copilot:/s${n++}`) }));
    const args = { workspace: workspace.toString(), prompt: "go" };
    for (let i = 0; i < 25; i++) {
      await group.execute(stateManager, "copilot:/caller", SessionServerToolName.CreateSession, args);
    }
    await assert.rejects(async () => {
      await group.execute(stateManager, "copilot:/caller", SessionServerToolName.CreateSession, args);
    }, /more than 25 sessions/);
    store.dispose();
  });
  test("getCreateChatArgs resolves an explicit session, model, falls back to current, and validates", () => {
    const sessions = [sessionMeta("s1", SessionStatus.Idle, workspace)];
    const explicit = getCreateChatArgs({ session: "copilot:/s1", prompt: "hi", title: "My chat", model: "gpt-4o" }, sessions, [model]);
    assert.strictEqual(explicit.session.toString(), "copilot:/s1");
    assert.strictEqual(explicit.title, "My chat");
    assert.strictEqual(explicit.model?.id, "gpt-4o");
    const current = getCreateChatArgs({ prompt: "hi" }, sessions, [model], URI.parse("copilot:/s1"));
    assert.strictEqual(current.session.toString(), "copilot:/s1");
    assert.throws(() => getCreateChatArgs({ session: "copilot:/unknown", prompt: "hi" }, sessions, [model]), /session/);
    assert.throws(() => getCreateChatArgs({ prompt: "hi" }, sessions, [model]), /session/);
    assert.throws(() => getCreateChatArgs({ prompt: "hi", model: "nope" }, sessions, [model], URI.parse("copilot:/s1")), /model/);
  });
  test("create_chat adds a chat to the session, starts the prompt, and returns an open link", async () => {
    let createdChat;
    let prompted;
    const accessor = createAccessor({
      listSessions: async () => [sessionMeta("s1", SessionStatus.Idle, workspace)],
      onCreateChat: (session, chat, options) => {
        createdChat = { session, chat, options };
      },
      onPrompt: (session, chat, prompt) => {
        prompted = { session, chat, prompt };
      }
    });
    const result = await applyCreateChatTool(accessor, { session: "copilot:/s1", prompt: "do it", title: "T", model: "gpt-4o" });
    assert.strictEqual(result.session, "copilot:/s1");
    const chatId = URI.parse(result.chat).authority;
    assert.strictEqual(result.openLink, `agent-host-session://copilot/s1?chat=${chatId}`);
    assert.strictEqual(createdChat?.session.toString(), "copilot:/s1");
    assert.strictEqual(createdChat?.options?.title, "T");
    assert.strictEqual(createdChat?.options?.model?.id, "gpt-4o");
    assert.strictEqual(createdChat?.chat.toString(), result.chat);
    assert.strictEqual(prompted?.chat.toString(), result.chat);
    assert.strictEqual(prompted?.prompt, "do it");
  });
  test("rename titles normalize presentation without truncating agent input", () => {
    const session = sessionMeta("s1", SessionStatus.Idle, workspace);
    assert.deepStrictEqual({
      defaultChat: getRenameChatArgs({ chat: "agent-host-session://copilot/s1", title: "  `fix-input_flicker`  " }, [session]).title,
      peerChat: getRenameChatArgs({ chat: "agent-host-session://copilot/s1?chat=peer", title: "Don&#39;t   panic" }, [session]).title
    }, {
      defaultChat: "fix input flicker",
      peerChat: "Don't panic"
    });
  });
  test("rename titles accept 200 Unicode code points and reject 201", () => {
    const session = sessionMeta("s1", SessionStatus.Idle, workspace);
    const accepted = "\u{1F600}".repeat(200);
    const rejected = "\u{1F600}".repeat(201);
    assert.strictEqual(getRenameChatArgs({ chat: "agent-host-session://copilot/s1?chat=peer", title: accepted }, [session]).title, accepted);
    assert.throws(() => getRenameChatArgs({ chat: "agent-host-session://copilot/s1?chat=peer", title: rejected }, [session]), /must not exceed 200 characters/);
  });
  test("getRenameChatArgs resolves default and peer chats from links or the current channel", () => {
    const sessions = [sessionMeta("s1", SessionStatus.Idle, workspace), sessionMeta("s2", SessionStatus.Idle, workspace)];
    const peer = buildChatUri("copilot:/s1", "peer");
    const explicitPeer = getRenameChatArgs({ chat: "agent-host-session://copilot/s2?chat=c9", title: "Side Work" }, sessions);
    const explicitDefault = getRenameChatArgs({ chat: "agent-host-session://copilot/s2", title: "Default Work" }, sessions);
    const currentPeer = getRenameChatArgs({ title: "Current Peer" }, sessions, peer);
    const currentDefault = getRenameChatArgs({ title: "Current Default" }, sessions, buildDefaultChatUri("copilot:/s1"));
    assert.deepStrictEqual({
      explicitPeer: { session: explicitPeer.session.toString(), chat: explicitPeer.chat.toString(), title: explicitPeer.title },
      explicitDefault: { session: explicitDefault.session.toString(), chat: explicitDefault.chat.toString(), title: explicitDefault.title },
      currentPeer: { session: currentPeer.session.toString(), chat: currentPeer.chat.toString(), title: currentPeer.title },
      currentDefault: { session: currentDefault.session.toString(), chat: currentDefault.chat.toString(), title: currentDefault.title }
    }, {
      explicitPeer: { session: "copilot:/s2", chat: buildChatUri("copilot:/s2", "c9"), title: "Side Work" },
      explicitDefault: { session: "copilot:/s2", chat: buildDefaultChatUri("copilot:/s2"), title: "Default Work" },
      currentPeer: { session: "copilot:/s1", chat: peer, title: "Current Peer" },
      currentDefault: { session: "copilot:/s1", chat: buildDefaultChatUri("copilot:/s1"), title: "Current Default" }
    });
    const sessionOnly = getRenameChatArgs({ session: "copilot:/s2", title: "Only session" }, sessions);
    assert.deepStrictEqual(
      { session: sessionOnly.session.toString(), chat: sessionOnly.chat.toString(), title: sessionOnly.title },
      { session: "copilot:/s2", chat: buildDefaultChatUri("copilot:/s2"), title: "Only session" }
    );
    const sessionScope = getRenameChatArgs({ title: "Codex Scope" }, sessions, "copilot:/s1");
    assert.deepStrictEqual(
      { session: sessionScope.session.toString(), chat: sessionScope.chat.toString(), title: sessionScope.title },
      { session: "copilot:/s1", chat: buildDefaultChatUri("copilot:/s1"), title: "Codex Scope" }
    );
    assert.throws(() => getRenameChatArgs({ title: "No target" }, sessions), /known chat/);
    assert.throws(() => getRenameChatArgs({ chat: "agent-host-session://copilot/s2?chat=c9", session: "copilot:/s1", title: "Mismatch" }, sessions), /must match/);
  });
  test("rename_chat always forwards the addressed default or peer chat", async () => {
    let renamed;
    const accessor = createAccessor({
      listSessions: async () => [sessionMeta("s1", SessionStatus.Idle, workspace)],
      onRenameChat: (session, chat, title) => {
        renamed = { session, chat, title };
      }
    });
    const peer = buildChatUri("copilot:/s1", "peer");
    const defaultChat = buildDefaultChatUri("copilot:/s1");
    assert.strictEqual(await applyRenameChatTool(accessor, { title: "Default Focus" }, defaultChat), 'Renamed chat to "Default Focus".');
    assert.deepStrictEqual({ session: renamed?.session.toString(), chat: renamed?.chat.toString(), title: renamed?.title }, { session: "copilot:/s1", chat: defaultChat, title: "Default Focus" });
    assert.strictEqual(await applyRenameChatTool(accessor, { title: "Peer Focus" }, peer), 'Renamed chat to "Peer Focus".');
    assert.deepStrictEqual({ session: renamed?.session.toString(), chat: renamed?.chat.toString(), title: renamed?.title }, { session: "copilot:/s1", chat: peer, title: "Peer Focus" });
    assert.strictEqual(await applyRenameChatTool(accessor, { chat: "agent-host-session://copilot/s1?chat=peer", title: "Updated Focus" }), 'Renamed chat to "Updated Focus".');
    assert.deepStrictEqual({ session: renamed?.session.toString(), chat: renamed?.chat.toString(), title: renamed?.title }, { session: "copilot:/s1", chat: peer, title: "Updated Focus" });
    await assert.rejects(() => applyRenameChatTool(createAccessor({
      listSessions: async () => [sessionMeta("s1", SessionStatus.Idle, workspace)],
      renameChat: async () => {
        throw new Error("Invalid rename_chat input: chat must match a known non-default chat.");
      }
    }), { chat: "agent-host-session://copilot/s1?chat=missing", title: "Ignored" }), /known non-default chat/);
  });
  test("repeated rename tool calls each apply their requested title", async () => {
    let renameCalls = 0;
    const accessor = createAccessor({
      listSessions: async () => [sessionMeta("s1", SessionStatus.Idle, workspace)],
      renameChat: async (_session, _chat, title) => {
        renameCalls++;
        return { title };
      }
    });
    const first = await applyRenameChatTool(accessor, { chat: "agent-host-session://copilot/s1", title: "Named Once" });
    const second = await applyRenameChatTool(accessor, { chat: "agent-host-session://copilot/s1", title: "Renamed Again" });
    assert.deepStrictEqual({ first, second, renameCalls }, {
      first: 'Renamed chat to "Named Once".',
      second: 'Renamed chat to "Renamed Again".',
      renameCalls: 2
    });
  });
  test("create_chat inherits the calling chat model when no override is provided", async () => {
    const source = URI.parse(buildChatUri("copilot:/s1", "source"));
    let creationSource;
    let createdModel;
    const accessor = createAccessor({
      getCreationDefaults: (uri) => {
        creationSource = uri;
        return { provider: "copilot", model: { id: "gpt-inherited" } };
      },
      onCreateChat: (_session, _chat, options) => {
        createdModel = options?.model;
      }
    });
    await applyCreateChatTool(accessor, { prompt: "do it" }, source);
    assert.deepStrictEqual({
      creationSource: creationSource?.toString(),
      createdModel
    }, {
      creationSource: source.toString(),
      createdModel: { id: "gpt-inherited" }
    });
  });
  test("create_chat does not inherit a model across providers", async () => {
    let createdModel;
    const accessor = createAccessor({
      listSessions: async () => [sessionMeta("s1", SessionStatus.Idle, workspace), { ...sessionMeta("s2", SessionStatus.Idle, workspace), session: URI.parse("claude:/s2") }],
      getCreationDefaults: () => ({ provider: "copilot", model: { id: "gpt-inherited" } }),
      onCreateChat: (_session, _chat, options) => {
        createdModel = options?.model;
      }
    });
    await applyCreateChatTool(accessor, { session: "claude:/s2", prompt: "do it" }, URI.parse(buildDefaultChatUri("copilot:/s1")));
    assert.strictEqual(createdModel, void 0);
  });
  test("send_message targets the default chat / a specific chat, refuses the current chat, and validates", async () => {
    const prompts = [];
    const accessor = createAccessor({
      listSessions: async () => [sessionMeta("s1", SessionStatus.Idle, workspace), sessionMeta("s2", SessionStatus.Idle, workspace)],
      onPrompt: (session, chat, prompt) => {
        prompts.push({ session, chat, prompt });
      }
    });
    const currentChannel = buildDefaultChatUri("copilot:/s1");
    const toSession = await applySendMessageTool(accessor, { session: "copilot:/s2", message: "hi" }, currentChannel);
    assert.strictEqual(prompts.at(-1)?.session.toString(), "copilot:/s2");
    assert.strictEqual(prompts.at(-1)?.chat.toString(), buildDefaultChatUri("copilot:/s2"));
    assert.strictEqual(prompts.at(-1)?.prompt, "hi");
    assert.ok(toSession.includes("agent-host-session://copilot/s2"));
    await applySendMessageTool(accessor, { session: "agent-host-session://copilot/s2?chat=c9", message: "yo" }, currentChannel);
    assert.strictEqual(prompts.at(-1)?.chat.toString(), buildChatUri("copilot:/s2", "c9"));
    await assert.rejects(() => applySendMessageTool(accessor, { session: "copilot:/s1", message: "loop" }, currentChannel), /current chat/);
    await assert.rejects(() => applySendMessageTool(accessor, { session: "copilot:/nope", message: "x" }, currentChannel), /known session/);
    assert.throws(() => getSendMessageArgs({ message: "x" }, []), /session/);
    assert.throws(() => getSendMessageArgs({ session: "copilot:/s2" }, []), /message/);
  });
  suite("get_session_context", () => {
    const toolCall = (toolName, input) => ({
      toolCallId: "t",
      toolName,
      displayName: toolName,
      invocationMessage: "",
      toolInput: JSON.stringify(input),
      status: ToolCallStatus.Completed,
      confirmed: ToolCallConfirmationReason.NotNeeded,
      success: true,
      pastTenseMessage: ""
    });
    const md = (content) => ({ kind: ResponsePartKind.Markdown, id: "m", content });
    const toolPart = (tc) => ({ kind: ResponsePartKind.ToolCall, toolCall: tc });
    const turn = (id, user, parts, state = TurnState.Complete) => ({ id, message: { text: user, origin: { kind: MessageKind.User } }, responseParts: parts, usage: void 0, state });
    const snapshot = {
      turns: [
        turn("t1", "do the thing", [toolPart(toolCall("read_file", { path: "a.ts" })), md("Working on it.")]),
        turn("t2", "now finish it", [toolPart(toolCall("apply_patch", { patch: "@@" })), md("Here is the result.")])
      ],
      hasMoreHistory: true
    };
    test("summary returns per-turn gists (message + reply snippet), no tool calls", () => {
      assert.deepStrictEqual(JSON.parse(serializeSessionContext(URI.parse("copilot:/s1"), void 0, snapshot, "summary", 10)), {
        session: "copilot:/s1",
        openLink: "agent-host-session://copilot/s1",
        detail: "summary",
        transcript: [
          { turn: 1, state: "complete", user: "do the thing", assistant: "Working on it." },
          { turn: 2, state: "complete", user: "now finish it", assistant: "Here is the result." }
        ],
        hasMoreHistory: true,
        truncated: false
      });
    });
    test("digest adds assistant text and tool-call names", () => {
      const digest = JSON.parse(serializeSessionContext(URI.parse("copilot:/s1"), void 0, snapshot, "digest", 10));
      assert.deepStrictEqual(digest.transcript[0], { turn: 1, state: "complete", user: "do the thing", assistant: "Working on it.", toolCalls: ["read_file"] });
    });
    test("detail=full targeting a specific chat carries the chat link and tool inputs", () => {
      const full = JSON.parse(serializeSessionContext(URI.parse("copilot:/s1"), "c9", snapshot, "full", 10));
      assert.strictEqual(full.openLink, "agent-host-session://copilot/s1?chat=c9");
      assert.deepStrictEqual(full.transcript[1].toolCalls, [{ name: "apply_patch", input: '{"patch":"@@"}' }]);
    });
    test("transcriptLimit drops older turns and flags truncated", () => {
      const limited = JSON.parse(serializeSessionContext(URI.parse("copilot:/s1"), void 0, snapshot, "summary", 1));
      assert.deepStrictEqual({ turns: limited.transcript.map((t) => t.turn), truncated: limited.truncated }, { turns: [2], truncated: true });
    });
    test("execute reads from the accessor; cold session returns identity + empty transcript", async () => {
      const store = new DisposableStore();
      const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
      const sessions = [sessionMeta("s1", SessionStatus.Idle, workspace)];
      const withCtx = createSessionServerToolGroup(createAccessor({ listSessions: async () => sessions, getChatContext: async () => snapshot }));
      const live = JSON.parse(await withCtx.execute(stateManager, "copilot:/caller", SessionServerToolName.GetSessionContext, { session: "copilot:/s1" }));
      assert.strictEqual(live.transcript.length, 2);
      const cold = createSessionServerToolGroup(createAccessor({ listSessions: async () => sessions, getChatContext: async () => void 0 }));
      assert.deepStrictEqual(JSON.parse(await cold.execute(stateManager, "copilot:/caller", SessionServerToolName.GetSessionContext, { session: "copilot:/s1" })), {
        session: "copilot:/s1",
        openLink: "agent-host-session://copilot/s1",
        detail: "summary",
        transcript: [],
        hasMoreHistory: false,
        truncated: false
      });
      store.dispose();
    });
    test("getSessionContextArgs validates input", () => {
      assert.throws(() => getSessionContextArgs({}, []), /session/);
      assert.throws(() => getSessionContextArgs({ session: "copilot:/nope" }, [sessionMeta("s1", SessionStatus.Idle, workspace)]), /known session/);
      assert.throws(() => getSessionContextArgs({ session: "copilot:/s1", detail: "huge" }, [sessionMeta("s1", SessionStatus.Idle, workspace)]), /detail/);
      assert.strictEqual(getSessionContextArgs({ session: "copilot:/s1", transcriptLimit: 999 }, [sessionMeta("s1", SessionStatus.Idle, workspace)]).transcriptLimit, 50);
    });
  });
  test("get_current_session returns the current session link + metadata", async () => {
    const store = new DisposableStore();
    const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
    const group = createSessionServerToolGroup(createAccessor({ listSessions: async () => [sessionMeta("s1", SessionStatus.Idle, workspace)] }));
    const chatChannel = buildDefaultChatUri("copilot:/s1");
    const text = await group.execute(stateManager, chatChannel, SessionServerToolName.GetCurrentSession, {});
    const parsed = JSON.parse(text);
    assert.strictEqual(parsed.session, "copilot:/s1");
    assert.strictEqual(parsed.openLink, "agent-host-session://copilot/s1");
    store.dispose();
  });
  test("getDeleteSessionArgs validates and refuses the current session", () => {
    const sessions = [sessionMeta("s1", SessionStatus.Idle, workspace), sessionMeta("s2", SessionStatus.Idle, workspace)];
    assert.strictEqual(getDeleteSessionArgs({ session: "copilot:/s2" }, sessions).toString(), "copilot:/s2");
    assert.strictEqual(getDeleteSessionArgs({ session: "agent-host-session://copilot/s2" }, sessions).toString(), "copilot:/s2");
    assert.throws(() => getDeleteSessionArgs({ session: "copilot:/unknown" }, sessions), /session/);
    assert.throws(() => getDeleteSessionArgs({}, sessions), /session/);
    assert.throws(() => getDeleteSessionArgs({ session: "copilot:/s1" }, sessions, URI.parse("copilot:/s1")), /current session/);
    assert.throws(() => getDeleteSessionArgs({ session: "agent-host-session://copilot/s1" }, sessions, URI.parse("copilot:/s1")), /current session/);
  });
  test("delete_session deletes the target and returns a confirmation", async () => {
    let deleted;
    const accessor = createAccessor({
      listSessions: async () => [sessionMeta("s1", SessionStatus.Idle, workspace), sessionMeta("s2", SessionStatus.Idle, workspace)],
      onDelete: (session) => {
        deleted = session;
      }
    });
    const text = await applyDeleteSessionTool(accessor, { session: "copilot:/s2" }, URI.parse("copilot:/s1"));
    assert.strictEqual(deleted?.toString(), "copilot:/s2");
    assert.ok(text.includes("copilot:/s2"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxzZXNzaW9uU2VydmVyVG9vbHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50Q3JlYXRlU2Vzc2lvbkNvbmZpZywgSUFnZW50TW9kZWxJbmZvLCBJQWdlbnRTZXNzaW9uTWV0YWRhdGEgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnQuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jaGFubmVscy1zZXNzaW9uL3N0YXRlLmpzJztcbmltcG9ydCB7IGJ1aWxkQ2hhdFVyaSwgYnVpbGREZWZhdWx0Q2hhdFVyaSwgTWVzc2FnZUtpbmQsIFJlc3BvbnNlUGFydEtpbmQsIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sQ2FsbFN0YXR1cywgVHVyblN0YXRlLCB3aXRoU2Vzc2lvbkdpdFN0YXRlLCB3aXRoU2Vzc2lvbkdpdEh1YlN0YXRlLCB0eXBlIE1vZGVsU2VsZWN0aW9uLCB0eXBlIFJlc3BvbnNlUGFydCwgdHlwZSBUb29sQ2FsbFN0YXRlLCB0eXBlIFR1cm4gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0U3RhdGVNYW5hZ2VyLmpzJztcbmltcG9ydCB7IFNlc3Npb25TZXJ2ZXJUb29sTmFtZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXJ2ZXJUb29sTmFtZXMuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXJ2ZXJUb29sSG9zdCB9IGZyb20gJy4uLy4uL25vZGUvc2hhcmVkL2FnZW50U2VydmVyVG9vbEhvc3QuanMnO1xuaW1wb3J0IHtcblx0YXBwbHlDcmVhdGVDaGF0VG9vbCxcblx0YXBwbHlDcmVhdGVTZXNzaW9uVG9vbCxcblx0YXBwbHlEZWxldGVTZXNzaW9uVG9vbCxcblx0YXBwbHlSZW5hbWVDaGF0VG9vbCxcblx0YXBwbHlTZW5kTWVzc2FnZVRvb2wsXG5cdGNyZWF0ZVNlc3Npb25TZXJ2ZXJUb29sR3JvdXAsXG5cdGdldENyZWF0ZUNoYXRBcmdzLFxuXHRnZXRDcmVhdGVTZXNzaW9uQXJncyxcblx0Z2V0RGVsZXRlU2Vzc2lvbkFyZ3MsXG5cdGdldFJlbmFtZUNoYXRBcmdzLFxuXHRnZXRTZW5kTWVzc2FnZUFyZ3MsXG5cdGdldFNlc3Npb25Db250ZXh0QXJncyxcblx0c2VyaWFsaXplU2Vzc2lvbkNvbnRleHQsXG5cdGZpbHRlclNlc3Npb25zLFxuXHRnZXRMaXN0U2Vzc2lvbnNBcmdzLFxuXHRzZXNzaW9uU2VydmVyVG9vbERlZmluaXRpb25zLFxuXHRzZXNzaW9uVG9vbFJlcXVpcmVzQ29uZmlybWF0aW9uLFxuXHRzZXJpYWxpemVTZXNzaW9ucyxcblx0dHlwZSBJQ2hhdENvbnRleHRTbmFwc2hvdCxcblx0dHlwZSBJU2Vzc2lvblNlcnZlclRvb2xBY2Nlc3Nvcixcbn0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvc2Vzc2lvblNlcnZlclRvb2xzLmpzJztcblxuc3VpdGUoJ1Nlc3Npb25TZXJ2ZXJUb29scycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCB3b3Jrc3BhY2UgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3NwYWNlL2FwcCcpO1xuXHRjb25zdCBtb2RlbDogSUFnZW50TW9kZWxJbmZvID0geyBwcm92aWRlcjogJ2NvcGlsb3QnLCBpZDogJ2dwdC00bycsIG5hbWU6ICdHUFQtNG8nLCBzdXBwb3J0c1Zpc2lvbjogZmFsc2UgfTtcblxuXHQvKiogRGVmYXVsdHMgdG8gcmVhZDsgdGVzdHMgdGhhdCBjYXJlIGFib3V0IHVucmVhZCBjbGVhciB0aGUgYElzUmVhZGAgYml0LiAqL1xuXHRmdW5jdGlvbiBzZXNzaW9uTWV0YShpZDogc3RyaW5nLCBzdGF0dXM6IFNlc3Npb25TdGF0dXMsIGRpcjogVVJJKTogSUFnZW50U2Vzc2lvbk1ldGFkYXRhIHtcblx0XHRyZXR1cm4geyBzZXNzaW9uOiBVUkkucGFyc2UoYGNvcGlsb3Q6LyR7aWR9YCksIHN0YXJ0VGltZTogMCwgbW9kaWZpZWRUaW1lOiAwLCBzdGF0dXM6IHN0YXR1cyB8IFNlc3Npb25TdGF0dXMuSXNSZWFkLCB3b3JraW5nRGlyZWN0b3JpZXM6IGRpciA/IFtkaXJdIDogdW5kZWZpbmVkLCBzdW1tYXJ5OiBgdGl0bGUtJHtpZH1gIH07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVBY2Nlc3NvcihvdmVycmlkZXM/OiBQYXJ0aWFsPElTZXNzaW9uU2VydmVyVG9vbEFjY2Vzc29yPiAmIHsgb25DcmVhdGU/OiAoY29uZmlnOiBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnKSA9PiB2b2lkOyBvblByb21wdD86IChzZXNzaW9uOiBVUkksIGNoYXQ6IFVSSSwgcHJvbXB0OiBzdHJpbmcpID0+IHZvaWQ7IG9uQ3JlYXRlQ2hhdD86IChzZXNzaW9uOiBVUkksIGNoYXQ6IFVSSSwgb3B0aW9ucz86IHsgdGl0bGU/OiBzdHJpbmc7IG1vZGVsPzogTW9kZWxTZWxlY3Rpb24gfSkgPT4gdm9pZDsgb25SZW5hbWVDaGF0PzogKHNlc3Npb246IFVSSSwgY2hhdDogVVJJLCB0aXRsZTogc3RyaW5nKSA9PiB2b2lkOyBvbkRlbGV0ZT86IChzZXNzaW9uOiBVUkkpID0+IHZvaWQ7IGRlcHRocz86IE1hcDxzdHJpbmcsIG51bWJlcj4gfSk6IElTZXNzaW9uU2VydmVyVG9vbEFjY2Vzc29yIHtcblx0XHRjb25zdCBkZXB0aHMgPSBvdmVycmlkZXM/LmRlcHRocyA/PyBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRpc0FjdGl2ZUFnZW50VGl0bGVHZW5lcmF0aW9uRW5hYmxlZDogb3ZlcnJpZGVzPy5pc0FjdGl2ZUFnZW50VGl0bGVHZW5lcmF0aW9uRW5hYmxlZCA/PyAoKCkgPT4gdHJ1ZSksXG5cdFx0XHRsaXN0U2Vzc2lvbnM6IG92ZXJyaWRlcz8ubGlzdFNlc3Npb25zID8/IChhc3luYyAoKSA9PiBbc2Vzc2lvbk1ldGEoJ3MxJywgU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzLCB3b3Jrc3BhY2UpXSksXG5cdFx0XHRjcmVhdGVTZXNzaW9uOiBvdmVycmlkZXM/LmNyZWF0ZVNlc3Npb24gPz8gKGFzeW5jIGNvbmZpZyA9PiB7IG92ZXJyaWRlcz8ub25DcmVhdGU/Lihjb25maWcpOyByZXR1cm4gVVJJLnBhcnNlKCdjb3BpbG90Oi9uZXcnKTsgfSksXG5cdFx0XHRnZXRNb2RlbHM6IG92ZXJyaWRlcz8uZ2V0TW9kZWxzID8/ICgoKSA9PiBbbW9kZWxdKSxcblx0XHRcdGdldENyZWF0aW9uRGVmYXVsdHM6IG92ZXJyaWRlcz8uZ2V0Q3JlYXRpb25EZWZhdWx0cyA/PyAoKCkgPT4gdW5kZWZpbmVkKSxcblx0XHRcdHN0YXJ0UHJvbXB0OiBvdmVycmlkZXM/LnN0YXJ0UHJvbXB0ID8/IChhc3luYyAoc2Vzc2lvbiwgY2hhdCwgcHJvbXB0KSA9PiB7IG92ZXJyaWRlcz8ub25Qcm9tcHQ/LihzZXNzaW9uLCBjaGF0LCBwcm9tcHQpOyB9KSxcblx0XHRcdGNyZWF0ZUNoYXQ6IG92ZXJyaWRlcz8uY3JlYXRlQ2hhdCA/PyAoYXN5bmMgKHNlc3Npb24sIGNoYXQsIG9wdGlvbnMpID0+IHsgb3ZlcnJpZGVzPy5vbkNyZWF0ZUNoYXQ/LihzZXNzaW9uLCBjaGF0LCBvcHRpb25zKTsgfSksXG5cdFx0XHRyZW5hbWVDaGF0OiBvdmVycmlkZXM/LnJlbmFtZUNoYXQgPz8gKGFzeW5jIChzZXNzaW9uLCBjaGF0LCB0aXRsZSkgPT4geyBvdmVycmlkZXM/Lm9uUmVuYW1lQ2hhdD8uKHNlc3Npb24sIGNoYXQsIHRpdGxlKTsgcmV0dXJuIHsgdGl0bGUgfTsgfSksXG5cdFx0XHRkZWxldGVTZXNzaW9uOiBvdmVycmlkZXM/LmRlbGV0ZVNlc3Npb24gPz8gKGFzeW5jIHNlc3Npb24gPT4geyBvdmVycmlkZXM/Lm9uRGVsZXRlPy4oc2Vzc2lvbik7IH0pLFxuXHRcdFx0Z2V0Q2hhdENvbnRleHQ6IG92ZXJyaWRlcz8uZ2V0Q2hhdENvbnRleHQgPz8gKGFzeW5jICgpID0+IHVuZGVmaW5lZCksXG5cdFx0XHRnZXRTZXNzaW9uU3Bhd25EZXB0aDogb3ZlcnJpZGVzPy5nZXRTZXNzaW9uU3Bhd25EZXB0aCA/PyAoc2Vzc2lvbiA9PiBkZXB0aHMuZ2V0KHNlc3Npb24udG9TdHJpbmcoKSkgPz8gMCksXG5cdFx0XHRzZXRTZXNzaW9uU3Bhd25EZXB0aDogb3ZlcnJpZGVzPy5zZXRTZXNzaW9uU3Bhd25EZXB0aCA/PyAoKHNlc3Npb24sIGRlcHRoKSA9PiB7IGRlcHRocy5zZXQoc2Vzc2lvbi50b1N0cmluZygpLCBkZXB0aCk7IH0pLFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdkZWZpbml0aW9ucyBhbmQgY29uZmlybWF0aW9uJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvblNlcnZlclRvb2xEZWZpbml0aW9ucy5tYXAoZCA9PiBkLm5hbWUpLCBbU2Vzc2lvblNlcnZlclRvb2xOYW1lLkxpc3RTZXNzaW9ucywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkdldEN1cnJlbnRTZXNzaW9uLCBTZXNzaW9uU2VydmVyVG9vbE5hbWUuQ3JlYXRlU2Vzc2lvbiwgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZUNoYXQsIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5SZW5hbWVDaGF0LCBTZXNzaW9uU2VydmVyVG9vbE5hbWUuU2VuZE1lc3NhZ2UsIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5HZXRTZXNzaW9uQ29udGV4dCwgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkRlbGV0ZVNlc3Npb25dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvblRvb2xSZXF1aXJlc0NvbmZpcm1hdGlvbihTZXNzaW9uU2VydmVyVG9vbE5hbWUuQ3JlYXRlU2Vzc2lvbiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uVG9vbFJlcXVpcmVzQ29uZmlybWF0aW9uKFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5DcmVhdGVDaGF0KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25Ub29sUmVxdWlyZXNDb25maXJtYXRpb24oU2Vzc2lvblNlcnZlclRvb2xOYW1lLlNlbmRNZXNzYWdlKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25Ub29sUmVxdWlyZXNDb25maXJtYXRpb24oU2Vzc2lvblNlcnZlclRvb2xOYW1lLkRlbGV0ZVNlc3Npb24pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvblRvb2xSZXF1aXJlc0NvbmZpcm1hdGlvbihTZXNzaW9uU2VydmVyVG9vbE5hbWUuUmVuYW1lQ2hhdCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvblRvb2xSZXF1aXJlc0NvbmZpcm1hdGlvbihTZXNzaW9uU2VydmVyVG9vbE5hbWUuTGlzdFNlc3Npb25zKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uVG9vbFJlcXVpcmVzQ29uZmlybWF0aW9uKFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5HZXRDdXJyZW50U2Vzc2lvbiksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvblRvb2xSZXF1aXJlc0NvbmZpcm1hdGlvbihTZXNzaW9uU2VydmVyVG9vbE5hbWUuR2V0U2Vzc2lvbkNvbnRleHQpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uU2VydmVyVG9vbERlZmluaXRpb25zLnNsaWNlKDQsIDUpLm1hcChkZWYgPT4gKHsgbmFtZTogZGVmLm5hbWUsIHJlcXVpcmVkOiBkZWYuaW5wdXRTY2hlbWE/LnJlcXVpcmVkIH0pKSwgW1xuXHRcdFx0eyBuYW1lOiBTZXNzaW9uU2VydmVyVG9vbE5hbWUuUmVuYW1lQ2hhdCwgcmVxdWlyZWQ6IFsndGl0bGUnXSB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvblNlcnZlclRvb2xEZWZpbml0aW9ucy5zbGljZSg0LCA1KS5tYXAoZGVmID0+IGRlZi5pbnB1dFNjaGVtYT8ucHJvcGVydGllcz8udGl0bGUpLCBbXG5cdFx0XHR7IHR5cGU6ICdzdHJpbmcnLCBtYXhMZW5ndGg6IDIwMCwgZGVzY3JpcHRpb246ICdTaG9ydCwgZGVzY3JpcHRpdmUgY2hhdCB0aXRsZSwgaWRlYWxseSAxLTQgd29yZHMuJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCduZXcgc2Vzc2lvbnMgdXNlIHRoZSBjdXJyZW50IHNldHRpbmcgd2hpbGUgbWF0ZXJpYWxpemVkIHNlc3Npb25zIGtlZXAgdGhlaXIgYWR2ZXJ0aXNlZCB0b29scycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgZW5hYmxlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGRpc2FibGVkU2Vzc2lvbiA9ICdjb3BpbG90Oi9zMSc7XG5cdFx0Y29uc3QgZW5hYmxlZFNlc3Npb24gPSAnY29waWxvdDovczInO1xuXHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgW2Rpc2FibGVkU2Vzc2lvbiwgZW5hYmxlZFNlc3Npb25dKSB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0XHR0aXRsZTogJ1Nlc3Npb24nLFxuXHRcdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGNvbnN0IGFjY2Vzc29yID0gY3JlYXRlQWNjZXNzb3Ioe1xuXHRcdFx0aXNBY3RpdmVBZ2VudFRpdGxlR2VuZXJhdGlvbkVuYWJsZWQ6ICgpID0+IGVuYWJsZWQsXG5cdFx0XHRsaXN0U2Vzc2lvbnM6IGFzeW5jICgpID0+IFtcblx0XHRcdFx0c2Vzc2lvbk1ldGEoJ3MxJywgU2Vzc2lvblN0YXR1cy5JZGxlLCB3b3Jrc3BhY2UpLFxuXHRcdFx0XHRzZXNzaW9uTWV0YSgnczInLCBTZXNzaW9uU3RhdHVzLklkbGUsIHdvcmtzcGFjZSksXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGhvc3QgPSBuZXcgQWdlbnRTZXJ2ZXJUb29sSG9zdChzdGF0ZU1hbmFnZXIsIFtcblx0XHRcdGNyZWF0ZVNlc3Npb25TZXJ2ZXJUb29sR3JvdXAoYWNjZXNzb3IpLFxuXHRcdF0pO1xuXG5cdFx0aG9zdC5hZHZlcnRpc2UoZGlzYWJsZWRTZXNzaW9uKTtcblx0XHRlbmFibGVkID0gdHJ1ZTtcblx0XHRob3N0LmFkdmVydGlzZShlbmFibGVkU2Vzc2lvbik7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdGFzeW5jICgpID0+IGhvc3QuZXhlY3V0ZVRvb2woYnVpbGREZWZhdWx0Q2hhdFVyaShkaXNhYmxlZFNlc3Npb24pLCBTZXNzaW9uU2VydmVyVG9vbE5hbWUuUmVuYW1lQ2hhdCwgeyB0aXRsZTogJ0Rpc2FibGVkJyB9KSxcblx0XHRcdC9TZXJ2ZXIgdG9vbCBcInJlbmFtZV9jaGF0XCIgaXMgZGlzYWJsZWQvLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0YXdhaXQgaG9zdC5leGVjdXRlVG9vbChidWlsZERlZmF1bHRDaGF0VXJpKGVuYWJsZWRTZXNzaW9uKSwgU2Vzc2lvblNlcnZlclRvb2xOYW1lLlJlbmFtZUNoYXQsIHsgdGl0bGU6ICdFbmFibGVkJyB9KSxcblx0XHRcdCdSZW5hbWVkIGNoYXQgdG8gXCJFbmFibGVkXCIuJyxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGlzYWJsZWRUb29sczogc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShkaXNhYmxlZFNlc3Npb24pPy5zZXJ2ZXJUb29scz8ubWFwKHRvb2wgPT4gdG9vbC5uYW1lKSxcblx0XHRcdGVuYWJsZWRUb29sczogc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShlbmFibGVkU2Vzc2lvbik/LnNlcnZlclRvb2xzPy5tYXAodG9vbCA9PiB0b29sLm5hbWUpLFxuXHRcdH0sIHtcblx0XHRcdGRpc2FibGVkVG9vbHM6IFtcblx0XHRcdFx0U2Vzc2lvblNlcnZlclRvb2xOYW1lLkxpc3RTZXNzaW9ucyxcblx0XHRcdFx0U2Vzc2lvblNlcnZlclRvb2xOYW1lLkdldEN1cnJlbnRTZXNzaW9uLFxuXHRcdFx0XHRTZXNzaW9uU2VydmVyVG9vbE5hbWUuQ3JlYXRlU2Vzc2lvbixcblx0XHRcdFx0U2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZUNoYXQsXG5cdFx0XHRcdFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5TZW5kTWVzc2FnZSxcblx0XHRcdFx0U2Vzc2lvblNlcnZlclRvb2xOYW1lLkdldFNlc3Npb25Db250ZXh0LFxuXHRcdFx0XHRTZXNzaW9uU2VydmVyVG9vbE5hbWUuRGVsZXRlU2Vzc2lvbixcblx0XHRcdF0sXG5cdFx0XHRlbmFibGVkVG9vbHM6IHNlc3Npb25TZXJ2ZXJUb29sRGVmaW5pdGlvbnMubWFwKHRvb2wgPT4gdG9vbC5uYW1lKSxcblx0XHR9KTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXRlcmlhbGl6ZWQgcmVuYW1lIHRvb2xzIHJlbWFpbiBleGVjdXRhYmxlIGFmdGVyIHRoZSByb290IHNldHRpbmcgaXMgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGVuYWJsZWQgPSB0cnVlO1xuXHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSAnY29waWxvdDovczEnO1xuXHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdHJlc291cmNlOiBzZXNzaW9uLFxuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdHRpdGxlOiAnU2Vzc2lvbicsXG5cdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoMCkudG9JU09TdHJpbmcoKSxcblx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCksXG5cdFx0fSk7XG5cdFx0Y29uc3QgaG9zdCA9IG5ldyBBZ2VudFNlcnZlclRvb2xIb3N0KHN0YXRlTWFuYWdlciwgW1xuXHRcdFx0Y3JlYXRlU2Vzc2lvblNlcnZlclRvb2xHcm91cChjcmVhdGVBY2Nlc3Nvcih7IGlzQWN0aXZlQWdlbnRUaXRsZUdlbmVyYXRpb25FbmFibGVkOiAoKSA9PiBlbmFibGVkIH0pKSxcblx0XHRdKTtcblxuXHRcdGhvc3QuYWR2ZXJ0aXNlKHNlc3Npb24pO1xuXHRcdGVuYWJsZWQgPSBmYWxzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGF3YWl0IGhvc3QuZXhlY3V0ZVRvb2woYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSwgU2Vzc2lvblNlcnZlclRvb2xOYW1lLlJlbmFtZUNoYXQsIHsgdGl0bGU6ICdTdGlsbCBlbmFibGVkJyB9KSxcblx0XHRcdCdSZW5hbWVkIGNoYXQgdG8gXCJTdGlsbCBlbmFibGVkXCIuJyxcblx0XHQpO1xuXHRcdHN0YXRlTWFuYWdlci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlcmlhbGl6ZVNlc3Npb25zIHByb2R1Y2VzIGNvbXBhY3QgbWV0YWRhdGEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9IHNlcmlhbGl6ZVNlc3Npb25zKFtzZXNzaW9uTWV0YSgnczEnLCBTZXNzaW9uU3RhdHVzLklucHV0TmVlZGVkLCB3b3Jrc3BhY2UpXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChKU09OLnBhcnNlKHRleHQpLCB7XG5cdFx0XHRzZXNzaW9uczogW3tcblx0XHRcdFx0c2Vzc2lvbjogJ2NvcGlsb3Q6L3MxJyxcblx0XHRcdFx0c3RhdHVzOiAnaW5wdXROZWVkZWQnLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB3b3Jrc3BhY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0dGl0bGU6ICd0aXRsZS1zMScsXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VyaWFsaXplU2Vzc2lvbnMgaW5jbHVkZXMgbWVhbmluZ2Z1bCBtZXRhZGF0YSB3aGVuIHByZXNlbnQnLCAoKSA9PiB7XG5cdFx0bGV0IG1ldGEgPSB3aXRoU2Vzc2lvbkdpdFN0YXRlKHVuZGVmaW5lZCwgeyBicmFuY2hOYW1lOiAnZmVhdHVyZS94JywgYmFzZUJyYW5jaE5hbWU6ICdtYWluJywgb3V0Z29pbmdDaGFuZ2VzOiAyLCBpbmNvbWluZ0NoYW5nZXM6IDEsIHVuY29tbWl0dGVkQ2hhbmdlczogMyB9KTtcblx0XHRtZXRhID0gd2l0aFNlc3Npb25HaXRIdWJTdGF0ZShtZXRhLCB7IG93bmVyOiAnbWljcm9zb2Z0JywgcmVwbzogJ3ZzY29kZScsIHB1bGxSZXF1ZXN0VXJsczogWydodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEnXSB9KTtcblx0XHRjb25zdCByaWNoOiBJQWdlbnRTZXNzaW9uTWV0YWRhdGEgPSB7XG5cdFx0XHRzZXNzaW9uOiBVUkkucGFyc2UoJ2NvcGlsb3Q6L3JpY2gnKSxcblx0XHRcdHN0YXJ0VGltZTogMCxcblx0XHRcdG1vZGlmaWVkVGltZTogMTcwMDAwMDAwMDAwMCxcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzLFxuXHRcdFx0YWN0aXZpdHk6ICdSdW5uaW5nIHRlc3RzJyxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllczogd29ya3NwYWNlID8gW3dvcmtzcGFjZV0gOiB1bmRlZmluZWQsXG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogd29ya3NwYWNlLCBkaXNwbGF5TmFtZTogJ2FwcCcgfSxcblx0XHRcdHN1bW1hcnk6ICdSaWNoIHNlc3Npb24nLFxuXHRcdFx0Y2hhbmdlczogeyBmaWxlczogMSwgYWRkaXRpb25zOiAyLCBkZWxldGlvbnM6IDAgfSxcblx0XHRcdF9tZXRhOiBtZXRhLFxuXHRcdH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChKU09OLnBhcnNlKHNlcmlhbGl6ZVNlc3Npb25zKFtyaWNoXSkpLCB7XG5cdFx0XHRzZXNzaW9uczogW3tcblx0XHRcdFx0c2Vzc2lvbjogJ2NvcGlsb3Q6L3JpY2gnLFxuXHRcdFx0XHR0aXRsZTogJ1JpY2ggc2Vzc2lvbicsXG5cdFx0XHRcdHN0YXR1czogJ2luUHJvZ3Jlc3MnLFxuXHRcdFx0XHRhY3Rpdml0eTogJ1J1bm5pbmcgdGVzdHMnLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB3b3Jrc3BhY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0cHJvamVjdDogJ2FwcCcsXG5cdFx0XHRcdHVucmVhZDogdHJ1ZSxcblx0XHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoMTcwMDAwMDAwMDAwMCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0Y2hhbmdlczogeyBmaWxlczogMSwgYWRkaXRpb25zOiAyLCBkZWxldGlvbnM6IDAgfSxcblx0XHRcdFx0Z2l0OiB7IGJyYW5jaDogJ2ZlYXR1cmUveCcsIGJhc2VCcmFuY2g6ICdtYWluJywgYWhlYWQ6IDIsIGJlaGluZDogMSwgdW5jb21taXR0ZWRDaGFuZ2VzOiAzIH0sXG5cdFx0XHRcdGdpdGh1YjogeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnLCBwdWxsUmVxdWVzdFVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMScgfSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJpYWxpemVTZXNzaW9ucyByZXBvcnRzIGFyY2hpdmVkIHN0YXR1cyBmcm9tIHRoZSBJc0FyY2hpdmVkIHN0YXR1cyBiaXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXJjaGl2ZWQ6IElBZ2VudFNlc3Npb25NZXRhZGF0YSA9IHsgLi4uc2Vzc2lvbk1ldGEoJ2FyY2hpdmVkJywgU2Vzc2lvblN0YXR1cy5JZGxlIHwgU2Vzc2lvblN0YXR1cy5Jc0FyY2hpdmVkLCB3b3Jrc3BhY2UpIH07XG5cdFx0Y29uc3Qgbm90QXJjaGl2ZWQ6IElBZ2VudFNlc3Npb25NZXRhZGF0YSA9IHsgLi4uc2Vzc2lvbk1ldGEoJ25vdEFyY2hpdmVkJywgU2Vzc2lvblN0YXR1cy5JZGxlLCB3b3Jrc3BhY2UpIH07XG5cdFx0Y29uc3Qgbm9TdGF0dXM6IElBZ2VudFNlc3Npb25NZXRhZGF0YSA9IHsgc2Vzc2lvbjogVVJJLnBhcnNlKCdjb3BpbG90Oi9ub1N0YXR1cycpLCBzdGFydFRpbWU6IDAsIG1vZGlmaWVkVGltZTogMCwgd29ya2luZ0RpcmVjdG9yaWVzOiB3b3Jrc3BhY2UgPyBbd29ya3NwYWNlXSA6IHVuZGVmaW5lZCB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoSlNPTi5wYXJzZShzZXJpYWxpemVTZXNzaW9ucyhbYXJjaGl2ZWQsIG5vdEFyY2hpdmVkLCBub1N0YXR1c10pKS5zZXNzaW9ucy5tYXAoKHM6IHsgc2Vzc2lvbjogc3RyaW5nOyBzdGF0dXM/OiBzdHJpbmcgfSkgPT4gKHsgc2Vzc2lvbjogcy5zZXNzaW9uLCBzdGF0dXM6IHMuc3RhdHVzIH0pKSwgW1xuXHRcdFx0eyBzZXNzaW9uOiAnY29waWxvdDovYXJjaGl2ZWQnLCBzdGF0dXM6ICdpZGxlLGFyY2hpdmVkJyB9LFxuXHRcdFx0eyBzZXNzaW9uOiAnY29waWxvdDovbm90QXJjaGl2ZWQnLCBzdGF0dXM6ICdpZGxlJyB9LFxuXHRcdFx0eyBzZXNzaW9uOiAnY29waWxvdDovbm9TdGF0dXMnLCBzdGF0dXM6IHVuZGVmaW5lZCB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvbmx5IHNlc3Npb25zIGtub3duIHRvIGJlIHVucmVhZCByZXBvcnQgb3IgZmlsdGVyIGFzIHVucmVhZCcsICgpID0+IHtcblx0XHQvLyBBIGNvbGQgc2Vzc2lvbiBmcm9tIGFuIGFnZW50IHRoYXQgcHJvamVjdHMgbm8gc3RhdHVzIChlLmcuIENsYXVkZSkgaGFzXG5cdFx0Ly8gbm8gcmVjb3JkZWQgcmVhZCBzdGF0ZSBhbmQgbXVzdCBub3QgYmUgcmVwb3J0ZWQgYXMgdW5yZWFkLlxuXHRcdGNvbnN0IHVua25vd246IElBZ2VudFNlc3Npb25NZXRhZGF0YSA9IHsgc2Vzc2lvbjogVVJJLnBhcnNlKCdjb3BpbG90Oi91bmtub3duJyksIHN0YXJ0VGltZTogMCwgbW9kaWZpZWRUaW1lOiAwLCB3b3JraW5nRGlyZWN0b3JpZXM6IFt3b3Jrc3BhY2VdIH07XG5cdFx0Y29uc3QgdW5yZWFkOiBJQWdlbnRTZXNzaW9uTWV0YWRhdGEgPSB7IC4uLnNlc3Npb25NZXRhKCd1bnJlYWQnLCBTZXNzaW9uU3RhdHVzLklkbGUsIHdvcmtzcGFjZSksIHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlIH07XG5cdFx0Y29uc3QgcmVhZDogSUFnZW50U2Vzc2lvbk1ldGFkYXRhID0gc2Vzc2lvbk1ldGEoJ3JlYWQnLCBTZXNzaW9uU3RhdHVzLklkbGUsIHdvcmtzcGFjZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbdW5rbm93biwgdW5yZWFkLCByZWFkXTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2VyaWFsaXplZFVucmVhZDogSlNPTi5wYXJzZShzZXJpYWxpemVTZXNzaW9ucyhzZXNzaW9ucykpLnNlc3Npb25zLm1hcCgoczogeyBzZXNzaW9uOiBzdHJpbmc7IHVucmVhZD86IGJvb2xlYW4gfSkgPT4gKHsgc2Vzc2lvbjogcy5zZXNzaW9uLCB1bnJlYWQ6IHMudW5yZWFkIH0pKSxcblx0XHRcdGZpbHRlcmVkVG9VbnJlYWQ6IGZpbHRlclNlc3Npb25zKHNlc3Npb25zLCBnZXRMaXN0U2Vzc2lvbnNBcmdzKHsgdW5yZWFkOiB0cnVlIH0pKS5tYXAocyA9PiBzLnNlc3Npb24udG9TdHJpbmcoKSksXG5cdFx0fSwge1xuXHRcdFx0c2VyaWFsaXplZFVucmVhZDogW1xuXHRcdFx0XHR7IHNlc3Npb246ICdjb3BpbG90Oi91bmtub3duJywgdW5yZWFkOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0eyBzZXNzaW9uOiAnY29waWxvdDovdW5yZWFkJywgdW5yZWFkOiB0cnVlIH0sXG5cdFx0XHRcdHsgc2Vzc2lvbjogJ2NvcGlsb3Q6L3JlYWQnLCB1bnJlYWQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XSxcblx0XHRcdGZpbHRlcmVkVG9VbnJlYWQ6IFsnY29waWxvdDovdW5yZWFkJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENyZWF0ZVNlc3Npb25BcmdzIHJlc29sdmVzIHdvcmtzcGFjZSBieSB3b3JraW5nIGRpcmVjdG9yeSBhbmQgbW9kZWwgYnkgaWQvbmFtZScsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9ucyA9IFtzZXNzaW9uTWV0YSgnczEnLCBTZXNzaW9uU3RhdHVzLklkbGUsIHdvcmtzcGFjZSldO1xuXHRcdGNvbnN0IGJ5SWQgPSBnZXRDcmVhdGVTZXNzaW9uQXJncyh7IHdvcmtzcGFjZTogd29ya3NwYWNlLnRvU3RyaW5nKCksIHByb21wdDogJ2hpJywgbW9kZWw6ICdncHQtNG8nIH0sIHNlc3Npb25zLCBbbW9kZWxdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnlJZC53b3Jrc3BhY2UudG9TdHJpbmcoKSwgd29ya3NwYWNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChieUlkLm1vZGVsPy5pZCwgJ2dwdC00bycpO1xuXHRcdGNvbnN0IGJ5TmFtZSA9IGdldENyZWF0ZVNlc3Npb25BcmdzKHsgd29ya3NwYWNlOiB3b3Jrc3BhY2UudG9TdHJpbmcoKSwgcHJvbXB0OiAnaGknLCBtb2RlbDogJ0dQVC00bycgfSwgc2Vzc2lvbnMsIFttb2RlbF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChieU5hbWUubW9kZWw/Lm5hbWUsICdHUFQtNG8nKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Q3JlYXRlU2Vzc2lvbkFyZ3MgYWNjZXB0cyBhbiBhYnNvbHV0ZSBmaWxlc3lzdGVtIHBhdGggYXMgd29ya3NwYWNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc29sdmVkID0gZ2V0Q3JlYXRlU2Vzc2lvbkFyZ3MoeyB3b3Jrc3BhY2U6ICcvVXNlcnMvbWUvd29yay9yZXBvJywgcHJvbXB0OiAnaGknIH0sIFtdLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLndvcmtzcGFjZS5zY2hlbWUsICdmaWxlJyk7XG5cdFx0Ly8gQ29tcGFyZSBgcGF0aGAgKGFsd2F5cyBmb3J3YXJkLXNsYXNoKSByYXRoZXIgdGhhbiBgZnNQYXRoYCwgd2hpY2ggaXNcblx0XHQvLyBwbGF0Zm9ybS1zcGVjaWZpYyAoYmFja3NsYXNoZXMgb24gV2luZG93cykuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLndvcmtzcGFjZS5wYXRoLCAnL1VzZXJzL21lL3dvcmsvcmVwbycpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRDcmVhdGVTZXNzaW9uQXJncyB0aHJvd3Mgb24gaW52YWxpZCBpbnB1dCcsICgpID0+IHtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGdldENyZWF0ZVNlc3Npb25BcmdzKHsgd29ya3NwYWNlOiAnbm90IGEgdXJpJywgcHJvbXB0OiAnaGknIH0sIFtdLCBbXSksIC93b3Jrc3BhY2UvKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGdldENyZWF0ZVNlc3Npb25BcmdzKHsgd29ya3NwYWNlOiB3b3Jrc3BhY2UudG9TdHJpbmcoKSwgcHJvbXB0OiAnaGknLCBtb2RlbDogJ25vcGUnIH0sIFtdLCBbbW9kZWxdKSwgL21vZGVsLyk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRDcmVhdGVTZXNzaW9uQXJncyh7IHdvcmtzcGFjZTogd29ya3NwYWNlLnRvU3RyaW5nKCkgfSwgW10sIFtdKSwgL3Byb21wdC8pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVfc2Vzc2lvbiBidWlsZHMgY29uZmlnLCBzdGFydHMgdGhlIGRlZmF1bHQgY2hhdCwgYW5kIHJldHVybnMgYW4gb3BlbiBsaW5rJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IHN0b3JlLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0bGV0IGNyZWF0ZWQ6IElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHByb21wdGVkOiB7IGNoYXQ6IFVSSTsgcHJvbXB0OiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBhY2Nlc3NvciA9IGNyZWF0ZUFjY2Vzc29yKHsgb25DcmVhdGU6IGMgPT4geyBjcmVhdGVkID0gYzsgfSwgb25Qcm9tcHQ6IChfcywgY2hhdCwgcHJvbXB0KSA9PiB7IHByb21wdGVkID0geyBjaGF0LCBwcm9tcHQgfTsgfSB9KTtcblx0XHRjb25zdCBncm91cCA9IGNyZWF0ZVNlc3Npb25TZXJ2ZXJUb29sR3JvdXAoYWNjZXNzb3IpO1xuXG5cdFx0Y29uc3QgdGV4dCA9IGF3YWl0IGdyb3VwLmV4ZWN1dGUoc3RhdGVNYW5hZ2VyLCAnY29waWxvdDovY2FsbGVyJywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZVNlc3Npb24sIHsgd29ya3NwYWNlOiB3b3Jrc3BhY2UudG9TdHJpbmcoKSwgcHJvbXB0OiAnZG8gaXQnLCBtb2RlbDogJ2dwdC00bycgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNyZWF0ZWQsIHsgd29ya2luZ0RpcmVjdG9yaWVzOiBbd29ya3NwYWNlXSwgcHJvdmlkZXI6ICdjb3BpbG90JywgbW9kZWw6IHsgaWQ6ICdncHQtNG8nIH0gfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb21wdGVkPy5wcm9tcHQsICdkbyBpdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9tcHRlZD8uY2hhdC50b1N0cmluZygpLCBidWlsZERlZmF1bHRDaGF0VXJpKFVSSS5wYXJzZSgnY29waWxvdDovbmV3JykpKTtcblx0XHRhc3NlcnQub2sodGV4dC5pbmNsdWRlcygnYWdlbnQtaG9zdC1zZXNzaW9uOi8vY29waWxvdC9uZXcnKSwgJ3Jlc3VsdCBjYXJyaWVzIHRoZSBvcGVuLXNlc3Npb24gbGluayBmb3IgdGhlIHBpbGwnKTtcblx0XHRhc3NlcnQub2soIXRleHQuaW5jbHVkZXMoJ2NvcGlsb3Q6L25ldycpLCAncmVzdWx0IGRvZXMgbm90IGVjaG8gdGhlIHJhdyBiYWNrZW5kIHNlc3Npb24gVVJJJyk7XG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVfc2Vzc2lvbiBpbmhlcml0cyB0aGUgY2FsbGluZyBjaGF0IG1vZGVsIGFuZCBwZXJtaXNzaW9uIGNvbmZpZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzb3VyY2UgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKCdjb3BpbG90Oi9jYWxsZXInLCAncGVlcicpKTtcblx0XHRsZXQgY3JlYXRpb25Tb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgY3JlYXRlZDogSUFnZW50Q3JlYXRlU2Vzc2lvbkNvbmZpZyB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBhY2Nlc3NvciA9IGNyZWF0ZUFjY2Vzc29yKHtcblx0XHRcdGdldENyZWF0aW9uRGVmYXVsdHM6IHVyaSA9PiB7XG5cdFx0XHRcdGNyZWF0aW9uU291cmNlID0gdXJpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRcdFx0bW9kZWw6IHsgaWQ6ICdncHQtaW5oZXJpdGVkJyB9LFxuXHRcdFx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRcdFx0YXV0b0FwcHJvdmU6ICdhdXRvQXBwcm92ZScsXG5cdFx0XHRcdFx0XHRwZXJtaXNzaW9uczogeyBhbGxvdzogWydzaGVsbCddLCBkZW55OiBbJ3dyaXRlJ10gfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblx0XHRcdG9uQ3JlYXRlOiBjb25maWcgPT4geyBjcmVhdGVkID0gY29uZmlnOyB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZ3JvdXAgPSBjcmVhdGVTZXNzaW9uU2VydmVyVG9vbEdyb3VwKGFjY2Vzc29yKTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBzdG9yZS5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGF3YWl0IGdyb3VwLmV4ZWN1dGUoc3RhdGVNYW5hZ2VyLCBzb3VyY2UudG9TdHJpbmcoKSwgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZVNlc3Npb24sIHsgd29ya3NwYWNlOiB3b3Jrc3BhY2UudG9TdHJpbmcoKSwgcHJvbXB0OiAnZG8gaXQnIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjcmVhdGlvblNvdXJjZTogY3JlYXRpb25Tb3VyY2U/LnRvU3RyaW5nKCksXG5cdFx0XHRjcmVhdGVkLFxuXHRcdH0sIHtcblx0XHRcdGNyZWF0aW9uU291cmNlOiBzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdGNyZWF0ZWQ6IHtcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbd29ya3NwYWNlXSxcblx0XHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdFx0bW9kZWw6IHsgaWQ6ICdncHQtaW5oZXJpdGVkJyB9LFxuXHRcdFx0XHRjb25maWc6IHtcblx0XHRcdFx0XHRhdXRvQXBwcm92ZTogJ2F1dG9BcHByb3ZlJyxcblx0XHRcdFx0XHRwZXJtaXNzaW9uczogeyBhbGxvdzogWydzaGVsbCddLCBkZW55OiBbJ3dyaXRlJ10gfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVfc2Vzc2lvbiBpbmhlcml0cyB0aGUgY2FsbGluZyBwcm92aWRlciB3aGVuIGl0cyBtb2RlbCBpcyB0aGUgcHJvdmlkZXIgZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgY3JlYXRlZDogSUFnZW50Q3JlYXRlU2Vzc2lvbkNvbmZpZyB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBhY2Nlc3NvciA9IGNyZWF0ZUFjY2Vzc29yKHtcblx0XHRcdGdldENyZWF0aW9uRGVmYXVsdHM6ICgpID0+ICh7XG5cdFx0XHRcdHByb3ZpZGVyOiAnY2xhdWRlJyxcblx0XHRcdFx0Y29uZmlnOiB7IHBlcm1pc3Npb25Nb2RlOiAnYWNjZXB0RWRpdHMnIH0sXG5cdFx0XHR9KSxcblx0XHRcdG9uQ3JlYXRlOiBjb25maWcgPT4geyBjcmVhdGVkID0gY29uZmlnOyB9LFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgYXBwbHlDcmVhdGVTZXNzaW9uVG9vbChhY2Nlc3NvciwgeyB3b3Jrc3BhY2U6IHdvcmtzcGFjZS50b1N0cmluZygpLCBwcm9tcHQ6ICdkbyBpdCcgfSwgVVJJLnBhcnNlKCdjbGF1ZGU6L3NvdXJjZScpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY3JlYXRlZCwge1xuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbd29ya3NwYWNlXSxcblx0XHRcdHByb3ZpZGVyOiAnY2xhdWRlJyxcblx0XHRcdGNvbmZpZzogeyBwZXJtaXNzaW9uTW9kZTogJ2FjY2VwdEVkaXRzJyB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXN0X3Nlc3Npb25zIGV4ZWN1dGUgcmV0dXJucyBzZXJpYWxpemVkIHNlc3Npb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IHN0b3JlLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBjcmVhdGVTZXNzaW9uU2VydmVyVG9vbEdyb3VwKGNyZWF0ZUFjY2Vzc29yKCkpO1xuXHRcdGNvbnN0IHRleHQgPSBhd2FpdCBncm91cC5leGVjdXRlKHN0YXRlTWFuYWdlciwgJ2NvcGlsb3Q6L2NhbGxlcicsIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5MaXN0U2Vzc2lvbnMsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEpTT04ucGFyc2UodGV4dCkuc2Vzc2lvbnMubWFwKChzOiB7IHNlc3Npb246IHN0cmluZyB9KSA9PiBzLnNlc3Npb24pLCBbJ2NvcGlsb3Q6L3MxJ10pO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnbGlzdF9zZXNzaW9ucyBmaWx0ZXJzIGJ5IHN0YXR1cywgd29ya3NwYWNlLCBjaGFuZ2VzLCBhcmNoaXZlZCBhbmQgY3JlYXRpb24gdGltZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBzdG9yZS5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IG90aGVyID0gVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZS9vdGhlcicpO1xuXHRcdGNvbnN0IGlkbGUgPSB7IC4uLnNlc3Npb25NZXRhKCdpZGxlJywgU2Vzc2lvblN0YXR1cy5JZGxlLCB3b3Jrc3BhY2UpLCBzdGFydFRpbWU6IDEwMDAsIGNoYW5nZXM6IHsgZmlsZXM6IDIsIGFkZGl0aW9uczogNSwgZGVsZXRpb25zOiAxIH0gfTtcblx0XHRjb25zdCBuZWVkc0lucHV0ID0geyAuLi5zZXNzaW9uTWV0YSgnbmVlZHNJbnB1dCcsIFNlc3Npb25TdGF0dXMuSW5wdXROZWVkZWQsIHdvcmtzcGFjZSksIHN0YXJ0VGltZTogMzAwMCwgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLklucHV0TmVlZGVkIH07XG5cdFx0Y29uc3QgZWxzZXdoZXJlID0geyAuLi5zZXNzaW9uTWV0YSgnZWxzZXdoZXJlJywgU2Vzc2lvblN0YXR1cy5JZGxlLCBvdGhlciksIHN0YXJ0VGltZTogNTAwMCB9O1xuXHRcdGNvbnN0IGFyY2hpdmVkID0geyAuLi5zZXNzaW9uTWV0YSgnYXJjaGl2ZWQnLCBTZXNzaW9uU3RhdHVzLklkbGUgfCBTZXNzaW9uU3RhdHVzLklzQXJjaGl2ZWQsIHdvcmtzcGFjZSksIHN0YXJ0VGltZTogMjAwMCB9O1xuXHRcdGNvbnN0IHdpdGhQciA9IHsgLi4uc2Vzc2lvbk1ldGEoJ3dpdGhQcicsIFNlc3Npb25TdGF0dXMuSWRsZSwgd29ya3NwYWNlKSwgc3RhcnRUaW1lOiA0MDAwLCBfbWV0YTogd2l0aFNlc3Npb25HaXRIdWJTdGF0ZSh1bmRlZmluZWQsIHsgcHVsbFJlcXVlc3RVcmxzOiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9vL3IvcHVsbC8yJ10gfSkgfTtcblx0XHRjb25zdCBpbmhlcml0ZWRQciA9IHsgLi4uc2Vzc2lvbk1ldGEoJ2luaGVyaXRlZFByJywgU2Vzc2lvblN0YXR1cy5JZGxlLCB3b3Jrc3BhY2UpLCBzdGFydFRpbWU6IDQ1MDAsIF9tZXRhOiB3aXRoU2Vzc2lvbkdpdEh1YlN0YXRlKHVuZGVmaW5lZCwgeyBwdWxsUmVxdWVzdFVybHM6IFsnaHR0cHM6Ly9naXRodWIuY29tL28vci9wdWxsLzMnXSwgaW5pdGlhbFB1bGxSZXF1ZXN0VXJsczogWydodHRwczovL2dpdGh1Yi5jb20vby9yL3B1bGwvMyddIH0pIH07XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbaWRsZSwgbmVlZHNJbnB1dCwgZWxzZXdoZXJlLCBhcmNoaXZlZCwgd2l0aFByLCBpbmhlcml0ZWRQcl07XG5cdFx0Y29uc3QgZ3JvdXAgPSBjcmVhdGVTZXNzaW9uU2VydmVyVG9vbEdyb3VwKGNyZWF0ZUFjY2Vzc29yKHsgbGlzdFNlc3Npb25zOiBhc3luYyAoKSA9PiBzZXNzaW9ucyB9KSk7XG5cblx0XHRjb25zdCBpZHMgPSBhc3luYyAoYXJnczogb2JqZWN0KSA9PiBKU09OLnBhcnNlKGF3YWl0IGdyb3VwLmV4ZWN1dGUoc3RhdGVNYW5hZ2VyLCAnY29waWxvdDovY2FsbGVyJywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkxpc3RTZXNzaW9ucywgYXJncykpLnNlc3Npb25zLm1hcCgoczogeyBzZXNzaW9uOiBzdHJpbmcgfSkgPT4gcy5zZXNzaW9uKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YnlTdGF0dXM6IGF3YWl0IGlkcyh7IHN0YXR1czogWydpbnB1dE5lZWRlZCddIH0pLFxuXHRcdFx0YnlBcmNoaXZlZFN0YXR1czogYXdhaXQgaWRzKHsgc3RhdHVzOiBbJ2FyY2hpdmVkJ10gfSksXG5cdFx0XHRieVdvcmtzcGFjZTogYXdhaXQgaWRzKHsgd29ya3NwYWNlOiB3b3Jrc3BhY2UudG9TdHJpbmcoKSB9KSxcblx0XHRcdHdpdGhDaGFuZ2VzOiBhd2FpdCBpZHMoeyB3aXRoQ2hhbmdlczogdHJ1ZSB9KSxcblx0XHRcdHVucmVhZDogYXdhaXQgaWRzKHsgdW5yZWFkOiB0cnVlIH0pLFxuXHRcdFx0d2l0aFB1bGxSZXF1ZXN0OiBhd2FpdCBpZHMoeyB3aXRoUHVsbFJlcXVlc3Q6IHRydWUgfSksXG5cdFx0XHR3aXRoQXJjaGl2ZWQ6IGF3YWl0IGlkcyh7IGluY2x1ZGVBcmNoaXZlZDogdHJ1ZSB9KSxcblx0XHRcdGNyZWF0ZWRBZnRlcjogYXdhaXQgaWRzKHsgY3JlYXRlZEFmdGVyOiBuZXcgRGF0ZSgzMDAwKS50b0lTT1N0cmluZygpIH0pLFxuXHRcdFx0Y3JlYXRlZEJlZm9yZTogYXdhaXQgaWRzKHsgY3JlYXRlZEJlZm9yZTogbmV3IERhdGUoMzAwMCkudG9JU09TdHJpbmcoKSB9KSxcblx0XHRcdGNvbWJpbmVkOiBhd2FpdCBpZHMoeyBzdGF0dXM6IFsnaWRsZSddLCB3b3Jrc3BhY2U6IHdvcmtzcGFjZS50b1N0cmluZygpLCB3aXRoQ2hhbmdlczogdHJ1ZSB9KSxcblx0XHRcdGFsbDogYXdhaXQgaWRzKHt9KSxcblx0XHR9LCB7XG5cdFx0XHRieVN0YXR1czogWydjb3BpbG90Oi9uZWVkc0lucHV0J10sXG5cdFx0XHRieUFyY2hpdmVkU3RhdHVzOiBbJ2NvcGlsb3Q6L2FyY2hpdmVkJ10sXG5cdFx0XHRieVdvcmtzcGFjZTogWydjb3BpbG90Oi9pZGxlJywgJ2NvcGlsb3Q6L25lZWRzSW5wdXQnLCAnY29waWxvdDovd2l0aFByJywgJ2NvcGlsb3Q6L2luaGVyaXRlZFByJ10sXG5cdFx0XHR3aXRoQ2hhbmdlczogWydjb3BpbG90Oi9pZGxlJ10sXG5cdFx0XHR1bnJlYWQ6IFsnY29waWxvdDovbmVlZHNJbnB1dCddLFxuXHRcdFx0d2l0aFB1bGxSZXF1ZXN0OiBbJ2NvcGlsb3Q6L3dpdGhQciddLFxuXHRcdFx0d2l0aEFyY2hpdmVkOiBbJ2NvcGlsb3Q6L2lkbGUnLCAnY29waWxvdDovbmVlZHNJbnB1dCcsICdjb3BpbG90Oi9lbHNld2hlcmUnLCAnY29waWxvdDovYXJjaGl2ZWQnLCAnY29waWxvdDovd2l0aFByJywgJ2NvcGlsb3Q6L2luaGVyaXRlZFByJ10sXG5cdFx0XHRjcmVhdGVkQWZ0ZXI6IFsnY29waWxvdDovbmVlZHNJbnB1dCcsICdjb3BpbG90Oi9lbHNld2hlcmUnLCAnY29waWxvdDovd2l0aFByJywgJ2NvcGlsb3Q6L2luaGVyaXRlZFByJ10sXG5cdFx0XHRjcmVhdGVkQmVmb3JlOiBbJ2NvcGlsb3Q6L2lkbGUnLCAnY29waWxvdDovbmVlZHNJbnB1dCddLFxuXHRcdFx0Y29tYmluZWQ6IFsnY29waWxvdDovaWRsZSddLFxuXHRcdFx0YWxsOiBbJ2NvcGlsb3Q6L2lkbGUnLCAnY29waWxvdDovbmVlZHNJbnB1dCcsICdjb3BpbG90Oi9lbHNld2hlcmUnLCAnY29waWxvdDovd2l0aFByJywgJ2NvcGlsb3Q6L2luaGVyaXRlZFByJ10sXG5cdFx0fSk7XG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRMaXN0U2Vzc2lvbnNBcmdzIHZhbGlkYXRlcyBmaWx0ZXIgaW5wdXQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRMaXN0U2Vzc2lvbnNBcmdzKHt9KSwgeyBzZXNzaW9uOiB1bmRlZmluZWQsIHN0YXR1czogdW5kZWZpbmVkLCB3b3Jrc3BhY2U6IHVuZGVmaW5lZCwgd2l0aENoYW5nZXM6IHVuZGVmaW5lZCwgdW5yZWFkOiB1bmRlZmluZWQsIHdpdGhQdWxsUmVxdWVzdDogdW5kZWZpbmVkLCBpbmNsdWRlQXJjaGl2ZWQ6IHVuZGVmaW5lZCwgY3JlYXRlZEFmdGVyOiB1bmRlZmluZWQsIGNyZWF0ZWRCZWZvcmU6IHVuZGVmaW5lZCB9KTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGdldExpc3RTZXNzaW9uc0FyZ3MoeyBzdGF0dXM6IFsnYm9ndXMnXSB9KSwgL3N0YXR1cy8pO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZ2V0TGlzdFNlc3Npb25zQXJncyh7IHdpdGhDaGFuZ2VzOiAneWVzJyB9KSwgL3dpdGhDaGFuZ2VzLyk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRMaXN0U2Vzc2lvbnNBcmdzKHsgaW5jbHVkZUFyY2hpdmVkOiAnbm8nIH0pLCAvaW5jbHVkZUFyY2hpdmVkLyk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRMaXN0U2Vzc2lvbnNBcmdzKHsgY3JlYXRlZEFmdGVyOiAnbm90LWEtZGF0ZScgfSksIC9jcmVhdGVkQWZ0ZXIvKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyU2Vzc2lvbnMoW3Nlc3Npb25NZXRhKCdzMScsIFNlc3Npb25TdGF0dXMuSWRsZSwgd29ya3NwYWNlKV0sIGdldExpc3RTZXNzaW9uc0FyZ3Moe30pKS5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXN0X3Nlc3Npb25zIGZldGNoZXMgYSBzaW5nbGUgc2Vzc2lvbiBieSBVUkkgb3Igb3BlbiBsaW5rLCBieXBhc3Npbmcgb3RoZXIgZmlsdGVycycsICgpID0+IHtcblx0XHRjb25zdCBhcmNoaXZlZCA9IHsgLi4uc2Vzc2lvbk1ldGEoJ2FyY2hpdmVkJywgU2Vzc2lvblN0YXR1cy5JZGxlLCB3b3Jrc3BhY2UpLCBpc0FyY2hpdmVkOiB0cnVlIH07XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbc2Vzc2lvbk1ldGEoJ3MxJywgU2Vzc2lvblN0YXR1cy5JZGxlLCB3b3Jrc3BhY2UpLCBhcmNoaXZlZF07XG5cdFx0Y29uc3QgaWRzID0gKGFyZ3M6IG9iamVjdCkgPT4gZmlsdGVyU2Vzc2lvbnMoc2Vzc2lvbnMsIGdldExpc3RTZXNzaW9uc0FyZ3MoYXJncykpLm1hcChzID0+IHMuc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGJ5VXJpOiBpZHMoeyBzZXNzaW9uOiAnY29waWxvdDovczEnIH0pLFxuXHRcdFx0YnlMaW5rOiBpZHMoeyBzZXNzaW9uOiAnYWdlbnQtaG9zdC1zZXNzaW9uOi8vY29waWxvdC9zMScgfSksXG5cdFx0XHQvLyBBIGRpcmVjdCBsb29rdXAgcmV0dXJucyBhbiBhcmNoaXZlZCBzZXNzaW9uIGV2ZW4gdGhvdWdoIGFyY2hpdmVkIGFyZSBoaWRkZW4gYnkgZGVmYXVsdC5cblx0XHRcdGFyY2hpdmVkQnlVcmk6IGlkcyh7IHNlc3Npb246ICdjb3BpbG90Oi9hcmNoaXZlZCcgfSksXG5cdFx0XHR1bmtub3duOiBpZHMoeyBzZXNzaW9uOiAnY29waWxvdDovbm9wZScgfSksXG5cdFx0fSwge1xuXHRcdFx0YnlVcmk6IFsnY29waWxvdDovczEnXSxcblx0XHRcdGJ5TGluazogWydjb3BpbG90Oi9zMSddLFxuXHRcdFx0YXJjaGl2ZWRCeVVyaTogWydjb3BpbG90Oi9hcmNoaXZlZCddLFxuXHRcdFx0dW5rbm93bjogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZV9zZXNzaW9uIHN0YW1wcyBzcGF3biBkZXB0aCBhbmQgZW5mb3JjZXMgdGhlIHJlY3Vyc2lvbiBkZXB0aCBsaW1pdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBzdG9yZS5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IGRlcHRocyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBjcmVhdGVTZXNzaW9uU2VydmVyVG9vbEdyb3VwKGNyZWF0ZUFjY2Vzc29yKHsgZGVwdGhzIH0pKTtcblx0XHRjb25zdCBhcmdzID0geyB3b3Jrc3BhY2U6IHdvcmtzcGFjZS50b1N0cmluZygpLCBwcm9tcHQ6ICdnbycgfTtcblxuXHRcdC8vIEZyb20gYSB0b3AtbGV2ZWwgKGRlcHRoIDApIHNlc3Npb24sIHRoZSBjcmVhdGVkIHNlc3Npb24gaXMgc3RhbXBlZCBkZXB0aCAxLlxuXHRcdGF3YWl0IGdyb3VwLmV4ZWN1dGUoc3RhdGVNYW5hZ2VyLCAnY29waWxvdDovY2FsbGVyJywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZVNlc3Npb24sIGFyZ3MpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXB0aHMuZ2V0KCdjb3BpbG90Oi9uZXcnKSwgMSk7XG5cblx0XHQvLyBBIHNlc3Npb24gYWxyZWFkeSBhdCB0aGUgbWF4IHNwYXduIGRlcHRoIG1heSBub3QgY3JlYXRlIGZ1cnRoZXIgc2Vzc2lvbnMuXG5cdFx0ZGVwdGhzLnNldCgnY29waWxvdDovZGVlcCcsIDMpO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0YXN5bmMgKCkgPT4geyBhd2FpdCBncm91cC5leGVjdXRlKHN0YXRlTWFuYWdlciwgJ2NvcGlsb3Q6L2RlZXAnLCBTZXNzaW9uU2VydmVyVG9vbE5hbWUuQ3JlYXRlU2Vzc2lvbiwgYXJncyk7IH0sXG5cdFx0XHQvcmVjdXJzaW9uIGxpbWl0Lyxcblx0XHQpO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlX3Nlc3Npb24gZW5mb3JjZXMgYSBwcm9jZXNzLXdpZGUgYnJlYWR0aCBiYWNrc3RvcCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBzdG9yZS5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdC8vIEVhY2ggY3JlYXRlZCBzZXNzaW9uIGdldHMgYSB1bmlxdWUgVVJJIHNvIGRlcHRoIG5ldmVyIGJsb2NrcyAoYWxsIGNoaWxkcmVuIG9mIGEgZGVwdGgtMCBjYWxsZXIpLlxuXHRcdGxldCBuID0gMDtcblx0XHRjb25zdCBncm91cCA9IGNyZWF0ZVNlc3Npb25TZXJ2ZXJUb29sR3JvdXAoY3JlYXRlQWNjZXNzb3IoeyBjcmVhdGVTZXNzaW9uOiBhc3luYyAoKSA9PiBVUkkucGFyc2UoYGNvcGlsb3Q6L3Mke24rK31gKSB9KSk7XG5cdFx0Y29uc3QgYXJncyA9IHsgd29ya3NwYWNlOiB3b3Jrc3BhY2UudG9TdHJpbmcoKSwgcHJvbXB0OiAnZ28nIH07XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAyNTsgaSsrKSB7XG5cdFx0XHRhd2FpdCBncm91cC5leGVjdXRlKHN0YXRlTWFuYWdlciwgJ2NvcGlsb3Q6L2NhbGxlcicsIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5DcmVhdGVTZXNzaW9uLCBhcmdzKTtcblx0XHR9XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoYXN5bmMgKCkgPT4geyBhd2FpdCBncm91cC5leGVjdXRlKHN0YXRlTWFuYWdlciwgJ2NvcGlsb3Q6L2NhbGxlcicsIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5DcmVhdGVTZXNzaW9uLCBhcmdzKTsgfSwgL21vcmUgdGhhbiAyNSBzZXNzaW9ucy8pO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Q3JlYXRlQ2hhdEFyZ3MgcmVzb2x2ZXMgYW4gZXhwbGljaXQgc2Vzc2lvbiwgbW9kZWwsIGZhbGxzIGJhY2sgdG8gY3VycmVudCwgYW5kIHZhbGlkYXRlcycsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9ucyA9IFtzZXNzaW9uTWV0YSgnczEnLCBTZXNzaW9uU3RhdHVzLklkbGUsIHdvcmtzcGFjZSldO1xuXHRcdGNvbnN0IGV4cGxpY2l0ID0gZ2V0Q3JlYXRlQ2hhdEFyZ3MoeyBzZXNzaW9uOiAnY29waWxvdDovczEnLCBwcm9tcHQ6ICdoaScsIHRpdGxlOiAnTXkgY2hhdCcsIG1vZGVsOiAnZ3B0LTRvJyB9LCBzZXNzaW9ucywgW21vZGVsXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cGxpY2l0LnNlc3Npb24udG9TdHJpbmcoKSwgJ2NvcGlsb3Q6L3MxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cGxpY2l0LnRpdGxlLCAnTXkgY2hhdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHBsaWNpdC5tb2RlbD8uaWQsICdncHQtNG8nKTtcblx0XHRjb25zdCBjdXJyZW50ID0gZ2V0Q3JlYXRlQ2hhdEFyZ3MoeyBwcm9tcHQ6ICdoaScgfSwgc2Vzc2lvbnMsIFttb2RlbF0sIFVSSS5wYXJzZSgnY29waWxvdDovczEnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGN1cnJlbnQuc2Vzc2lvbi50b1N0cmluZygpLCAnY29waWxvdDovczEnKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGdldENyZWF0ZUNoYXRBcmdzKHsgc2Vzc2lvbjogJ2NvcGlsb3Q6L3Vua25vd24nLCBwcm9tcHQ6ICdoaScgfSwgc2Vzc2lvbnMsIFttb2RlbF0pLCAvc2Vzc2lvbi8pO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZ2V0Q3JlYXRlQ2hhdEFyZ3MoeyBwcm9tcHQ6ICdoaScgfSwgc2Vzc2lvbnMsIFttb2RlbF0pLCAvc2Vzc2lvbi8pO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZ2V0Q3JlYXRlQ2hhdEFyZ3MoeyBwcm9tcHQ6ICdoaScsIG1vZGVsOiAnbm9wZScgfSwgc2Vzc2lvbnMsIFttb2RlbF0sIFVSSS5wYXJzZSgnY29waWxvdDovczEnKSksIC9tb2RlbC8pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVfY2hhdCBhZGRzIGEgY2hhdCB0byB0aGUgc2Vzc2lvbiwgc3RhcnRzIHRoZSBwcm9tcHQsIGFuZCByZXR1cm5zIGFuIG9wZW4gbGluaycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgY3JlYXRlZENoYXQ6IHsgc2Vzc2lvbjogVVJJOyBjaGF0OiBVUkk7IG9wdGlvbnM/OiB7IHRpdGxlPzogc3RyaW5nOyBtb2RlbD86IE1vZGVsU2VsZWN0aW9uIH0gfSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcHJvbXB0ZWQ6IHsgc2Vzc2lvbjogVVJJOyBjaGF0OiBVUkk7IHByb21wdDogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYWNjZXNzb3IgPSBjcmVhdGVBY2Nlc3Nvcih7XG5cdFx0XHRsaXN0U2Vzc2lvbnM6IGFzeW5jICgpID0+IFtzZXNzaW9uTWV0YSgnczEnLCBTZXNzaW9uU3RhdHVzLklkbGUsIHdvcmtzcGFjZSldLFxuXHRcdFx0b25DcmVhdGVDaGF0OiAoc2Vzc2lvbiwgY2hhdCwgb3B0aW9ucykgPT4geyBjcmVhdGVkQ2hhdCA9IHsgc2Vzc2lvbiwgY2hhdCwgb3B0aW9ucyB9OyB9LFxuXHRcdFx0b25Qcm9tcHQ6IChzZXNzaW9uLCBjaGF0LCBwcm9tcHQpID0+IHsgcHJvbXB0ZWQgPSB7IHNlc3Npb24sIGNoYXQsIHByb21wdCB9OyB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFwcGx5Q3JlYXRlQ2hhdFRvb2woYWNjZXNzb3IsIHsgc2Vzc2lvbjogJ2NvcGlsb3Q6L3MxJywgcHJvbXB0OiAnZG8gaXQnLCB0aXRsZTogJ1QnLCBtb2RlbDogJ2dwdC00bycgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zZXNzaW9uLCAnY29waWxvdDovczEnKTtcblx0XHRjb25zdCBjaGF0SWQgPSBVUkkucGFyc2UocmVzdWx0LmNoYXQpLmF1dGhvcml0eTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm9wZW5MaW5rLCBgYWdlbnQtaG9zdC1zZXNzaW9uOi8vY29waWxvdC9zMT9jaGF0PSR7Y2hhdElkfWApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkQ2hhdD8uc2Vzc2lvbi50b1N0cmluZygpLCAnY29waWxvdDovczEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZENoYXQ/Lm9wdGlvbnM/LnRpdGxlLCAnVCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkQ2hhdD8ub3B0aW9ucz8ubW9kZWw/LmlkLCAnZ3B0LTRvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRDaGF0Py5jaGF0LnRvU3RyaW5nKCksIHJlc3VsdC5jaGF0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvbXB0ZWQ/LmNoYXQudG9TdHJpbmcoKSwgcmVzdWx0LmNoYXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9tcHRlZD8ucHJvbXB0LCAnZG8gaXQnKTtcblx0fSk7XG5cblx0dGVzdCgncmVuYW1lIHRpdGxlcyBub3JtYWxpemUgcHJlc2VudGF0aW9uIHdpdGhvdXQgdHJ1bmNhdGluZyBhZ2VudCBpbnB1dCcsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbk1ldGEoJ3MxJywgU2Vzc2lvblN0YXR1cy5JZGxlLCB3b3Jrc3BhY2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGVmYXVsdENoYXQ6IGdldFJlbmFtZUNoYXRBcmdzKHsgY2hhdDogJ2FnZW50LWhvc3Qtc2Vzc2lvbjovL2NvcGlsb3QvczEnLCB0aXRsZTogJyAgYGZpeC1pbnB1dF9mbGlja2VyYCAgJyB9LCBbc2Vzc2lvbl0pLnRpdGxlLFxuXHRcdFx0cGVlckNoYXQ6IGdldFJlbmFtZUNoYXRBcmdzKHsgY2hhdDogJ2FnZW50LWhvc3Qtc2Vzc2lvbjovL2NvcGlsb3QvczE/Y2hhdD1wZWVyJywgdGl0bGU6ICdEb24mIzM5O3QgICBwYW5pYycgfSwgW3Nlc3Npb25dKS50aXRsZSxcblx0XHR9LCB7XG5cdFx0XHRkZWZhdWx0Q2hhdDogJ2ZpeCBpbnB1dCBmbGlja2VyJyxcblx0XHRcdHBlZXJDaGF0OiAnRG9uXFwndCBwYW5pYycsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmFtZSB0aXRsZXMgYWNjZXB0IDIwMCBVbmljb2RlIGNvZGUgcG9pbnRzIGFuZCByZWplY3QgMjAxJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9uTWV0YSgnczEnLCBTZXNzaW9uU3RhdHVzLklkbGUsIHdvcmtzcGFjZSk7XG5cdFx0Y29uc3QgYWNjZXB0ZWQgPSAnXHVEODNEXHVERTAwJy5yZXBlYXQoMjAwKTtcblx0XHRjb25zdCByZWplY3RlZCA9ICdcdUQ4M0RcdURFMDAnLnJlcGVhdCgyMDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZW5hbWVDaGF0QXJncyh7IGNoYXQ6ICdhZ2VudC1ob3N0LXNlc3Npb246Ly9jb3BpbG90L3MxP2NoYXQ9cGVlcicsIHRpdGxlOiBhY2NlcHRlZCB9LCBbc2Vzc2lvbl0pLnRpdGxlLCBhY2NlcHRlZCk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRSZW5hbWVDaGF0QXJncyh7IGNoYXQ6ICdhZ2VudC1ob3N0LXNlc3Npb246Ly9jb3BpbG90L3MxP2NoYXQ9cGVlcicsIHRpdGxlOiByZWplY3RlZCB9LCBbc2Vzc2lvbl0pLCAvbXVzdCBub3QgZXhjZWVkIDIwMCBjaGFyYWN0ZXJzLyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFJlbmFtZUNoYXRBcmdzIHJlc29sdmVzIGRlZmF1bHQgYW5kIHBlZXIgY2hhdHMgZnJvbSBsaW5rcyBvciB0aGUgY3VycmVudCBjaGFubmVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25zID0gW3Nlc3Npb25NZXRhKCdzMScsIFNlc3Npb25TdGF0dXMuSWRsZSwgd29ya3NwYWNlKSwgc2Vzc2lvbk1ldGEoJ3MyJywgU2Vzc2lvblN0YXR1cy5JZGxlLCB3b3Jrc3BhY2UpXTtcblx0XHRjb25zdCBwZWVyID0gYnVpbGRDaGF0VXJpKCdjb3BpbG90Oi9zMScsICdwZWVyJyk7XG5cdFx0Y29uc3QgZXhwbGljaXRQZWVyID0gZ2V0UmVuYW1lQ2hhdEFyZ3MoeyBjaGF0OiAnYWdlbnQtaG9zdC1zZXNzaW9uOi8vY29waWxvdC9zMj9jaGF0PWM5JywgdGl0bGU6ICdTaWRlIFdvcmsnIH0sIHNlc3Npb25zKTtcblx0XHRjb25zdCBleHBsaWNpdERlZmF1bHQgPSBnZXRSZW5hbWVDaGF0QXJncyh7IGNoYXQ6ICdhZ2VudC1ob3N0LXNlc3Npb246Ly9jb3BpbG90L3MyJywgdGl0bGU6ICdEZWZhdWx0IFdvcmsnIH0sIHNlc3Npb25zKTtcblx0XHRjb25zdCBjdXJyZW50UGVlciA9IGdldFJlbmFtZUNoYXRBcmdzKHsgdGl0bGU6ICdDdXJyZW50IFBlZXInIH0sIHNlc3Npb25zLCBwZWVyKTtcblx0XHRjb25zdCBjdXJyZW50RGVmYXVsdCA9IGdldFJlbmFtZUNoYXRBcmdzKHsgdGl0bGU6ICdDdXJyZW50IERlZmF1bHQnIH0sIHNlc3Npb25zLCBidWlsZERlZmF1bHRDaGF0VXJpKCdjb3BpbG90Oi9zMScpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGV4cGxpY2l0UGVlcjogeyBzZXNzaW9uOiBleHBsaWNpdFBlZXIuc2Vzc2lvbi50b1N0cmluZygpLCBjaGF0OiBleHBsaWNpdFBlZXIuY2hhdC50b1N0cmluZygpLCB0aXRsZTogZXhwbGljaXRQZWVyLnRpdGxlIH0sXG5cdFx0XHRleHBsaWNpdERlZmF1bHQ6IHsgc2Vzc2lvbjogZXhwbGljaXREZWZhdWx0LnNlc3Npb24udG9TdHJpbmcoKSwgY2hhdDogZXhwbGljaXREZWZhdWx0LmNoYXQudG9TdHJpbmcoKSwgdGl0bGU6IGV4cGxpY2l0RGVmYXVsdC50aXRsZSB9LFxuXHRcdFx0Y3VycmVudFBlZXI6IHsgc2Vzc2lvbjogY3VycmVudFBlZXIuc2Vzc2lvbi50b1N0cmluZygpLCBjaGF0OiBjdXJyZW50UGVlci5jaGF0LnRvU3RyaW5nKCksIHRpdGxlOiBjdXJyZW50UGVlci50aXRsZSB9LFxuXHRcdFx0Y3VycmVudERlZmF1bHQ6IHsgc2Vzc2lvbjogY3VycmVudERlZmF1bHQuc2Vzc2lvbi50b1N0cmluZygpLCBjaGF0OiBjdXJyZW50RGVmYXVsdC5jaGF0LnRvU3RyaW5nKCksIHRpdGxlOiBjdXJyZW50RGVmYXVsdC50aXRsZSB9LFxuXHRcdH0sIHtcblx0XHRcdGV4cGxpY2l0UGVlcjogeyBzZXNzaW9uOiAnY29waWxvdDovczInLCBjaGF0OiBidWlsZENoYXRVcmkoJ2NvcGlsb3Q6L3MyJywgJ2M5JyksIHRpdGxlOiAnU2lkZSBXb3JrJyB9LFxuXHRcdFx0ZXhwbGljaXREZWZhdWx0OiB7IHNlc3Npb246ICdjb3BpbG90Oi9zMicsIGNoYXQ6IGJ1aWxkRGVmYXVsdENoYXRVcmkoJ2NvcGlsb3Q6L3MyJyksIHRpdGxlOiAnRGVmYXVsdCBXb3JrJyB9LFxuXHRcdFx0Y3VycmVudFBlZXI6IHsgc2Vzc2lvbjogJ2NvcGlsb3Q6L3MxJywgY2hhdDogcGVlciwgdGl0bGU6ICdDdXJyZW50IFBlZXInIH0sXG5cdFx0XHRjdXJyZW50RGVmYXVsdDogeyBzZXNzaW9uOiAnY29waWxvdDovczEnLCBjaGF0OiBidWlsZERlZmF1bHRDaGF0VXJpKCdjb3BpbG90Oi9zMScpLCB0aXRsZTogJ0N1cnJlbnQgRGVmYXVsdCcgfSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXNzaW9uT25seSA9IGdldFJlbmFtZUNoYXRBcmdzKHsgc2Vzc2lvbjogJ2NvcGlsb3Q6L3MyJywgdGl0bGU6ICdPbmx5IHNlc3Npb24nIH0sIHNlc3Npb25zKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBzZXNzaW9uOiBzZXNzaW9uT25seS5zZXNzaW9uLnRvU3RyaW5nKCksIGNoYXQ6IHNlc3Npb25Pbmx5LmNoYXQudG9TdHJpbmcoKSwgdGl0bGU6IHNlc3Npb25Pbmx5LnRpdGxlIH0sXG5cdFx0XHR7IHNlc3Npb246ICdjb3BpbG90Oi9zMicsIGNoYXQ6IGJ1aWxkRGVmYXVsdENoYXRVcmkoJ2NvcGlsb3Q6L3MyJyksIHRpdGxlOiAnT25seSBzZXNzaW9uJyB9LFxuXHRcdCk7XG5cdFx0Y29uc3Qgc2Vzc2lvblNjb3BlID0gZ2V0UmVuYW1lQ2hhdEFyZ3MoeyB0aXRsZTogJ0NvZGV4IFNjb3BlJyB9LCBzZXNzaW9ucywgJ2NvcGlsb3Q6L3MxJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgc2Vzc2lvbjogc2Vzc2lvblNjb3BlLnNlc3Npb24udG9TdHJpbmcoKSwgY2hhdDogc2Vzc2lvblNjb3BlLmNoYXQudG9TdHJpbmcoKSwgdGl0bGU6IHNlc3Npb25TY29wZS50aXRsZSB9LFxuXHRcdFx0eyBzZXNzaW9uOiAnY29waWxvdDovczEnLCBjaGF0OiBidWlsZERlZmF1bHRDaGF0VXJpKCdjb3BpbG90Oi9zMScpLCB0aXRsZTogJ0NvZGV4IFNjb3BlJyB9LFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRSZW5hbWVDaGF0QXJncyh7IHRpdGxlOiAnTm8gdGFyZ2V0JyB9LCBzZXNzaW9ucyksIC9rbm93biBjaGF0Lyk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRSZW5hbWVDaGF0QXJncyh7IGNoYXQ6ICdhZ2VudC1ob3N0LXNlc3Npb246Ly9jb3BpbG90L3MyP2NoYXQ9YzknLCBzZXNzaW9uOiAnY29waWxvdDovczEnLCB0aXRsZTogJ01pc21hdGNoJyB9LCBzZXNzaW9ucyksIC9tdXN0IG1hdGNoLyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmFtZV9jaGF0IGFsd2F5cyBmb3J3YXJkcyB0aGUgYWRkcmVzc2VkIGRlZmF1bHQgb3IgcGVlciBjaGF0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCByZW5hbWVkOiB7IHNlc3Npb246IFVSSTsgY2hhdDogVVJJOyB0aXRsZTogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYWNjZXNzb3IgPSBjcmVhdGVBY2Nlc3Nvcih7XG5cdFx0XHRsaXN0U2Vzc2lvbnM6IGFzeW5jICgpID0+IFtzZXNzaW9uTWV0YSgnczEnLCBTZXNzaW9uU3RhdHVzLklkbGUsIHdvcmtzcGFjZSldLFxuXHRcdFx0b25SZW5hbWVDaGF0OiAoc2Vzc2lvbiwgY2hhdCwgdGl0bGUpID0+IHsgcmVuYW1lZCA9IHsgc2Vzc2lvbiwgY2hhdCwgdGl0bGUgfTsgfSxcblx0XHR9KTtcblx0XHRjb25zdCBwZWVyID0gYnVpbGRDaGF0VXJpKCdjb3BpbG90Oi9zMScsICdwZWVyJyk7XG5cdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKCdjb3BpbG90Oi9zMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBhcHBseVJlbmFtZUNoYXRUb29sKGFjY2Vzc29yLCB7IHRpdGxlOiAnRGVmYXVsdCBGb2N1cycgfSwgZGVmYXVsdENoYXQpLCAnUmVuYW1lZCBjaGF0IHRvIFwiRGVmYXVsdCBGb2N1c1wiLicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBzZXNzaW9uOiByZW5hbWVkPy5zZXNzaW9uLnRvU3RyaW5nKCksIGNoYXQ6IHJlbmFtZWQ/LmNoYXQudG9TdHJpbmcoKSwgdGl0bGU6IHJlbmFtZWQ/LnRpdGxlIH0sIHsgc2Vzc2lvbjogJ2NvcGlsb3Q6L3MxJywgY2hhdDogZGVmYXVsdENoYXQsIHRpdGxlOiAnRGVmYXVsdCBGb2N1cycgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGFwcGx5UmVuYW1lQ2hhdFRvb2woYWNjZXNzb3IsIHsgdGl0bGU6ICdQZWVyIEZvY3VzJyB9LCBwZWVyKSwgJ1JlbmFtZWQgY2hhdCB0byBcIlBlZXIgRm9jdXNcIi4nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc2Vzc2lvbjogcmVuYW1lZD8uc2Vzc2lvbi50b1N0cmluZygpLCBjaGF0OiByZW5hbWVkPy5jaGF0LnRvU3RyaW5nKCksIHRpdGxlOiByZW5hbWVkPy50aXRsZSB9LCB7IHNlc3Npb246ICdjb3BpbG90Oi9zMScsIGNoYXQ6IHBlZXIsIHRpdGxlOiAnUGVlciBGb2N1cycgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGFwcGx5UmVuYW1lQ2hhdFRvb2woYWNjZXNzb3IsIHsgY2hhdDogJ2FnZW50LWhvc3Qtc2Vzc2lvbjovL2NvcGlsb3QvczE/Y2hhdD1wZWVyJywgdGl0bGU6ICdVcGRhdGVkIEZvY3VzJyB9KSwgJ1JlbmFtZWQgY2hhdCB0byBcIlVwZGF0ZWQgRm9jdXNcIi4nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc2Vzc2lvbjogcmVuYW1lZD8uc2Vzc2lvbi50b1N0cmluZygpLCBjaGF0OiByZW5hbWVkPy5jaGF0LnRvU3RyaW5nKCksIHRpdGxlOiByZW5hbWVkPy50aXRsZSB9LCB7IHNlc3Npb246ICdjb3BpbG90Oi9zMScsIGNoYXQ6IHBlZXIsIHRpdGxlOiAnVXBkYXRlZCBGb2N1cycgfSk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gYXBwbHlSZW5hbWVDaGF0VG9vbChjcmVhdGVBY2Nlc3Nvcih7XG5cdFx0XHRsaXN0U2Vzc2lvbnM6IGFzeW5jICgpID0+IFtzZXNzaW9uTWV0YSgnczEnLCBTZXNzaW9uU3RhdHVzLklkbGUsIHdvcmtzcGFjZSldLFxuXHRcdFx0cmVuYW1lQ2hhdDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgcmVuYW1lX2NoYXQgaW5wdXQ6IGNoYXQgbXVzdCBtYXRjaCBhIGtub3duIG5vbi1kZWZhdWx0IGNoYXQuJyk7IH0sXG5cdFx0fSksIHsgY2hhdDogJ2FnZW50LWhvc3Qtc2Vzc2lvbjovL2NvcGlsb3QvczE/Y2hhdD1taXNzaW5nJywgdGl0bGU6ICdJZ25vcmVkJyB9KSwgL2tub3duIG5vbi1kZWZhdWx0IGNoYXQvKTtcblx0fSk7XG5cblx0dGVzdCgncmVwZWF0ZWQgcmVuYW1lIHRvb2wgY2FsbHMgZWFjaCBhcHBseSB0aGVpciByZXF1ZXN0ZWQgdGl0bGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHJlbmFtZUNhbGxzID0gMDtcblx0XHRjb25zdCBhY2Nlc3NvciA9IGNyZWF0ZUFjY2Vzc29yKHtcblx0XHRcdGxpc3RTZXNzaW9uczogYXN5bmMgKCkgPT4gW3Nlc3Npb25NZXRhKCdzMScsIFNlc3Npb25TdGF0dXMuSWRsZSwgd29ya3NwYWNlKV0sXG5cdFx0XHRyZW5hbWVDaGF0OiBhc3luYyAoX3Nlc3Npb24sIF9jaGF0LCB0aXRsZSkgPT4ge1xuXHRcdFx0XHRyZW5hbWVDYWxscysrO1xuXHRcdFx0XHRyZXR1cm4geyB0aXRsZSB9O1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBmaXJzdCA9IGF3YWl0IGFwcGx5UmVuYW1lQ2hhdFRvb2woYWNjZXNzb3IsIHsgY2hhdDogJ2FnZW50LWhvc3Qtc2Vzc2lvbjovL2NvcGlsb3QvczEnLCB0aXRsZTogJ05hbWVkIE9uY2UnIH0pO1xuXHRcdGNvbnN0IHNlY29uZCA9IGF3YWl0IGFwcGx5UmVuYW1lQ2hhdFRvb2woYWNjZXNzb3IsIHsgY2hhdDogJ2FnZW50LWhvc3Qtc2Vzc2lvbjovL2NvcGlsb3QvczEnLCB0aXRsZTogJ1JlbmFtZWQgQWdhaW4nIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBmaXJzdCwgc2Vjb25kLCByZW5hbWVDYWxscyB9LCB7XG5cdFx0XHRmaXJzdDogJ1JlbmFtZWQgY2hhdCB0byBcIk5hbWVkIE9uY2VcIi4nLFxuXHRcdFx0c2Vjb25kOiAnUmVuYW1lZCBjaGF0IHRvIFwiUmVuYW1lZCBBZ2FpblwiLicsXG5cdFx0XHRyZW5hbWVDYWxsczogMixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlX2NoYXQgaW5oZXJpdHMgdGhlIGNhbGxpbmcgY2hhdCBtb2RlbCB3aGVuIG5vIG92ZXJyaWRlIGlzIHByb3ZpZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNvdXJjZSA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoJ2NvcGlsb3Q6L3MxJywgJ3NvdXJjZScpKTtcblx0XHRsZXQgY3JlYXRpb25Tb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgY3JlYXRlZE1vZGVsOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBhY2Nlc3NvciA9IGNyZWF0ZUFjY2Vzc29yKHtcblx0XHRcdGdldENyZWF0aW9uRGVmYXVsdHM6IHVyaSA9PiB7XG5cdFx0XHRcdGNyZWF0aW9uU291cmNlID0gdXJpO1xuXHRcdFx0XHRyZXR1cm4geyBwcm92aWRlcjogJ2NvcGlsb3QnLCBtb2RlbDogeyBpZDogJ2dwdC1pbmhlcml0ZWQnIH0gfTtcblx0XHRcdH0sXG5cdFx0XHRvbkNyZWF0ZUNoYXQ6IChfc2Vzc2lvbiwgX2NoYXQsIG9wdGlvbnMpID0+IHsgY3JlYXRlZE1vZGVsID0gb3B0aW9ucz8ubW9kZWw7IH0sXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBhcHBseUNyZWF0ZUNoYXRUb29sKGFjY2Vzc29yLCB7IHByb21wdDogJ2RvIGl0JyB9LCBzb3VyY2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjcmVhdGlvblNvdXJjZTogY3JlYXRpb25Tb3VyY2U/LnRvU3RyaW5nKCksXG5cdFx0XHRjcmVhdGVkTW9kZWwsXG5cdFx0fSwge1xuXHRcdFx0Y3JlYXRpb25Tb3VyY2U6IHNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0Y3JlYXRlZE1vZGVsOiB7IGlkOiAnZ3B0LWluaGVyaXRlZCcgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlX2NoYXQgZG9lcyBub3QgaW5oZXJpdCBhIG1vZGVsIGFjcm9zcyBwcm92aWRlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGNyZWF0ZWRNb2RlbDogTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYWNjZXNzb3IgPSBjcmVhdGVBY2Nlc3Nvcih7XG5cdFx0XHRsaXN0U2Vzc2lvbnM6IGFzeW5jICgpID0+IFtzZXNzaW9uTWV0YSgnczEnLCBTZXNzaW9uU3RhdHVzLklkbGUsIHdvcmtzcGFjZSksIHsgLi4uc2Vzc2lvbk1ldGEoJ3MyJywgU2Vzc2lvblN0YXR1cy5JZGxlLCB3b3Jrc3BhY2UpLCBzZXNzaW9uOiBVUkkucGFyc2UoJ2NsYXVkZTovczInKSB9XSxcblx0XHRcdGdldENyZWF0aW9uRGVmYXVsdHM6ICgpID0+ICh7IHByb3ZpZGVyOiAnY29waWxvdCcsIG1vZGVsOiB7IGlkOiAnZ3B0LWluaGVyaXRlZCcgfSB9KSxcblx0XHRcdG9uQ3JlYXRlQ2hhdDogKF9zZXNzaW9uLCBfY2hhdCwgb3B0aW9ucykgPT4geyBjcmVhdGVkTW9kZWwgPSBvcHRpb25zPy5tb2RlbDsgfSxcblx0XHR9KTtcblxuXHRcdGF3YWl0IGFwcGx5Q3JlYXRlQ2hhdFRvb2woYWNjZXNzb3IsIHsgc2Vzc2lvbjogJ2NsYXVkZTovczInLCBwcm9tcHQ6ICdkbyBpdCcgfSwgVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoJ2NvcGlsb3Q6L3MxJykpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZE1vZGVsLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kX21lc3NhZ2UgdGFyZ2V0cyB0aGUgZGVmYXVsdCBjaGF0IC8gYSBzcGVjaWZpYyBjaGF0LCByZWZ1c2VzIHRoZSBjdXJyZW50IGNoYXQsIGFuZCB2YWxpZGF0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvbXB0czogeyBzZXNzaW9uOiBVUkk7IGNoYXQ6IFVSSTsgcHJvbXB0OiBzdHJpbmcgfVtdID0gW107XG5cdFx0Y29uc3QgYWNjZXNzb3IgPSBjcmVhdGVBY2Nlc3Nvcih7XG5cdFx0XHRsaXN0U2Vzc2lvbnM6IGFzeW5jICgpID0+IFtzZXNzaW9uTWV0YSgnczEnLCBTZXNzaW9uU3RhdHVzLklkbGUsIHdvcmtzcGFjZSksIHNlc3Npb25NZXRhKCdzMicsIFNlc3Npb25TdGF0dXMuSWRsZSwgd29ya3NwYWNlKV0sXG5cdFx0XHRvblByb21wdDogKHNlc3Npb24sIGNoYXQsIHByb21wdCkgPT4geyBwcm9tcHRzLnB1c2goeyBzZXNzaW9uLCBjaGF0LCBwcm9tcHQgfSk7IH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgY3VycmVudENoYW5uZWwgPSBidWlsZERlZmF1bHRDaGF0VXJpKCdjb3BpbG90Oi9zMScpO1xuXG5cdFx0Ly8gRXhwbGljaXQgc2Vzc2lvbiAtPiBvd25pbmcgc2Vzc2lvbidzIGRlZmF1bHQgY2hhdC5cblx0XHRjb25zdCB0b1Nlc3Npb24gPSBhd2FpdCBhcHBseVNlbmRNZXNzYWdlVG9vbChhY2Nlc3NvciwgeyBzZXNzaW9uOiAnY29waWxvdDovczInLCBtZXNzYWdlOiAnaGknIH0sIGN1cnJlbnRDaGFubmVsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvbXB0cy5hdCgtMSk/LnNlc3Npb24udG9TdHJpbmcoKSwgJ2NvcGlsb3Q6L3MyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb21wdHMuYXQoLTEpPy5jaGF0LnRvU3RyaW5nKCksIGJ1aWxkRGVmYXVsdENoYXRVcmkoJ2NvcGlsb3Q6L3MyJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9tcHRzLmF0KC0xKT8ucHJvbXB0LCAnaGknKTtcblx0XHRhc3NlcnQub2sodG9TZXNzaW9uLmluY2x1ZGVzKCdhZ2VudC1ob3N0LXNlc3Npb246Ly9jb3BpbG90L3MyJykpO1xuXG5cdFx0Ly8gQSBjcmVhdGVfY2hhdCBvcGVuIGxpbmsgLT4gdGhhdCBzcGVjaWZpYyBjaGF0IGNoYW5uZWwuXG5cdFx0YXdhaXQgYXBwbHlTZW5kTWVzc2FnZVRvb2woYWNjZXNzb3IsIHsgc2Vzc2lvbjogJ2FnZW50LWhvc3Qtc2Vzc2lvbjovL2NvcGlsb3QvczI/Y2hhdD1jOScsIG1lc3NhZ2U6ICd5bycgfSwgY3VycmVudENoYW5uZWwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9tcHRzLmF0KC0xKT8uY2hhdC50b1N0cmluZygpLCBidWlsZENoYXRVcmkoJ2NvcGlsb3Q6L3MyJywgJ2M5JykpO1xuXG5cdFx0Ly8gUmVmdXNlcyBtZXNzYWdpbmcgdGhlIGV4YWN0IGN1cnJlbnQgY2hhdCBjaGFubmVsIChzZWxmLWxvb3AgZ3VhcmQpLlxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IGFwcGx5U2VuZE1lc3NhZ2VUb29sKGFjY2Vzc29yLCB7IHNlc3Npb246ICdjb3BpbG90Oi9zMScsIG1lc3NhZ2U6ICdsb29wJyB9LCBjdXJyZW50Q2hhbm5lbCksIC9jdXJyZW50IGNoYXQvKTtcblx0XHQvLyBVbmtub3duIHNlc3Npb24gYW5kIG1pc3Npbmcgc2Vzc2lvbi9tZXNzYWdlIGFyZSByZWplY3RlZC5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBhcHBseVNlbmRNZXNzYWdlVG9vbChhY2Nlc3NvciwgeyBzZXNzaW9uOiAnY29waWxvdDovbm9wZScsIG1lc3NhZ2U6ICd4JyB9LCBjdXJyZW50Q2hhbm5lbCksIC9rbm93biBzZXNzaW9uLyk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRTZW5kTWVzc2FnZUFyZ3MoeyBtZXNzYWdlOiAneCcgfSwgW10pLCAvc2Vzc2lvbi8pO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZ2V0U2VuZE1lc3NhZ2VBcmdzKHsgc2Vzc2lvbjogJ2NvcGlsb3Q6L3MyJyB9LCBbXSksIC9tZXNzYWdlLyk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRfc2Vzc2lvbl9jb250ZXh0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2xDYWxsID0gKHRvb2xOYW1lOiBzdHJpbmcsIGlucHV0OiBvYmplY3QpOiBUb29sQ2FsbFN0YXRlID0+ICh7XG5cdFx0XHR0b29sQ2FsbElkOiAndCcsIHRvb2xOYW1lLCBkaXNwbGF5TmFtZTogdG9vbE5hbWUsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJycsIHRvb2xJbnB1dDogSlNPTi5zdHJpbmdpZnkoaW5wdXQpLFxuXHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0c3VjY2VzczogdHJ1ZSwgcGFzdFRlbnNlTWVzc2FnZTogJycsXG5cdFx0fSk7XG5cdFx0Y29uc3QgbWQgPSAoY29udGVudDogc3RyaW5nKTogUmVzcG9uc2VQYXJ0ID0+ICh7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAnbScsIGNvbnRlbnQgfSk7XG5cdFx0Y29uc3QgdG9vbFBhcnQgPSAodGM6IFRvb2xDYWxsU3RhdGUpOiBSZXNwb25zZVBhcnQgPT4gKHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGw6IHRjIH0pO1xuXHRcdGNvbnN0IHR1cm4gPSAoaWQ6IHN0cmluZywgdXNlcjogc3RyaW5nLCBwYXJ0czogUmVzcG9uc2VQYXJ0W10sIHN0YXRlID0gVHVyblN0YXRlLkNvbXBsZXRlKTogVHVybiA9PlxuXHRcdFx0KHsgaWQsIG1lc3NhZ2U6IHsgdGV4dDogdXNlciwgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LCByZXNwb25zZVBhcnRzOiBwYXJ0cywgdXNhZ2U6IHVuZGVmaW5lZCwgc3RhdGUgfSk7XG5cblx0XHRjb25zdCBzbmFwc2hvdDogSUNoYXRDb250ZXh0U25hcHNob3QgPSB7XG5cdFx0XHR0dXJuczogW1xuXHRcdFx0XHR0dXJuKCd0MScsICdkbyB0aGUgdGhpbmcnLCBbdG9vbFBhcnQodG9vbENhbGwoJ3JlYWRfZmlsZScsIHsgcGF0aDogJ2EudHMnIH0pKSwgbWQoJ1dvcmtpbmcgb24gaXQuJyldKSxcblx0XHRcdFx0dHVybigndDInLCAnbm93IGZpbmlzaCBpdCcsIFt0b29sUGFydCh0b29sQ2FsbCgnYXBwbHlfcGF0Y2gnLCB7IHBhdGNoOiAnQEAnIH0pKSwgbWQoJ0hlcmUgaXMgdGhlIHJlc3VsdC4nKV0pLFxuXHRcdFx0XSxcblx0XHRcdGhhc01vcmVIaXN0b3J5OiB0cnVlLFxuXHRcdH07XG5cblx0XHR0ZXN0KCdzdW1tYXJ5IHJldHVybnMgcGVyLXR1cm4gZ2lzdHMgKG1lc3NhZ2UgKyByZXBseSBzbmlwcGV0KSwgbm8gdG9vbCBjYWxscycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoSlNPTi5wYXJzZShzZXJpYWxpemVTZXNzaW9uQ29udGV4dChVUkkucGFyc2UoJ2NvcGlsb3Q6L3MxJyksIHVuZGVmaW5lZCwgc25hcHNob3QsICdzdW1tYXJ5JywgMTApKSwge1xuXHRcdFx0XHRzZXNzaW9uOiAnY29waWxvdDovczEnLFxuXHRcdFx0XHRvcGVuTGluazogJ2FnZW50LWhvc3Qtc2Vzc2lvbjovL2NvcGlsb3QvczEnLFxuXHRcdFx0XHRkZXRhaWw6ICdzdW1tYXJ5Jyxcblx0XHRcdFx0dHJhbnNjcmlwdDogW1xuXHRcdFx0XHRcdHsgdHVybjogMSwgc3RhdGU6ICdjb21wbGV0ZScsIHVzZXI6ICdkbyB0aGUgdGhpbmcnLCBhc3Npc3RhbnQ6ICdXb3JraW5nIG9uIGl0LicgfSxcblx0XHRcdFx0XHR7IHR1cm46IDIsIHN0YXRlOiAnY29tcGxldGUnLCB1c2VyOiAnbm93IGZpbmlzaCBpdCcsIGFzc2lzdGFudDogJ0hlcmUgaXMgdGhlIHJlc3VsdC4nIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGhhc01vcmVIaXN0b3J5OiB0cnVlLFxuXHRcdFx0XHR0cnVuY2F0ZWQ6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaWdlc3QgYWRkcyBhc3Npc3RhbnQgdGV4dCBhbmQgdG9vbC1jYWxsIG5hbWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlnZXN0ID0gSlNPTi5wYXJzZShzZXJpYWxpemVTZXNzaW9uQ29udGV4dChVUkkucGFyc2UoJ2NvcGlsb3Q6L3MxJyksIHVuZGVmaW5lZCwgc25hcHNob3QsICdkaWdlc3QnLCAxMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaWdlc3QudHJhbnNjcmlwdFswXSwgeyB0dXJuOiAxLCBzdGF0ZTogJ2NvbXBsZXRlJywgdXNlcjogJ2RvIHRoZSB0aGluZycsIGFzc2lzdGFudDogJ1dvcmtpbmcgb24gaXQuJywgdG9vbENhbGxzOiBbJ3JlYWRfZmlsZSddIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGV0YWlsPWZ1bGwgdGFyZ2V0aW5nIGEgc3BlY2lmaWMgY2hhdCBjYXJyaWVzIHRoZSBjaGF0IGxpbmsgYW5kIHRvb2wgaW5wdXRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZnVsbCA9IEpTT04ucGFyc2Uoc2VyaWFsaXplU2Vzc2lvbkNvbnRleHQoVVJJLnBhcnNlKCdjb3BpbG90Oi9zMScpLCAnYzknLCBzbmFwc2hvdCwgJ2Z1bGwnLCAxMCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZ1bGwub3BlbkxpbmssICdhZ2VudC1ob3N0LXNlc3Npb246Ly9jb3BpbG90L3MxP2NoYXQ9YzknKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZnVsbC50cmFuc2NyaXB0WzFdLnRvb2xDYWxscywgW3sgbmFtZTogJ2FwcGx5X3BhdGNoJywgaW5wdXQ6ICd7XCJwYXRjaFwiOlwiQEBcIn0nIH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RyYW5zY3JpcHRMaW1pdCBkcm9wcyBvbGRlciB0dXJucyBhbmQgZmxhZ3MgdHJ1bmNhdGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGltaXRlZCA9IEpTT04ucGFyc2Uoc2VyaWFsaXplU2Vzc2lvbkNvbnRleHQoVVJJLnBhcnNlKCdjb3BpbG90Oi9zMScpLCB1bmRlZmluZWQsIHNuYXBzaG90LCAnc3VtbWFyeScsIDEpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyB0dXJuczogbGltaXRlZC50cmFuc2NyaXB0Lm1hcCgodDogeyB0dXJuOiBudW1iZXIgfSkgPT4gdC50dXJuKSwgdHJ1bmNhdGVkOiBsaW1pdGVkLnRydW5jYXRlZCB9LCB7IHR1cm5zOiBbMl0sIHRydW5jYXRlZDogdHJ1ZSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4ZWN1dGUgcmVhZHMgZnJvbSB0aGUgYWNjZXNzb3I7IGNvbGQgc2Vzc2lvbiByZXR1cm5zIGlkZW50aXR5ICsgZW1wdHkgdHJhbnNjcmlwdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gc3RvcmUuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW3Nlc3Npb25NZXRhKCdzMScsIFNlc3Npb25TdGF0dXMuSWRsZSwgd29ya3NwYWNlKV07XG5cdFx0XHRjb25zdCB3aXRoQ3R4ID0gY3JlYXRlU2Vzc2lvblNlcnZlclRvb2xHcm91cChjcmVhdGVBY2Nlc3Nvcih7IGxpc3RTZXNzaW9uczogYXN5bmMgKCkgPT4gc2Vzc2lvbnMsIGdldENoYXRDb250ZXh0OiBhc3luYyAoKSA9PiBzbmFwc2hvdCB9KSk7XG5cdFx0XHRjb25zdCBsaXZlID0gSlNPTi5wYXJzZShhd2FpdCB3aXRoQ3R4LmV4ZWN1dGUoc3RhdGVNYW5hZ2VyLCAnY29waWxvdDovY2FsbGVyJywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkdldFNlc3Npb25Db250ZXh0LCB7IHNlc3Npb246ICdjb3BpbG90Oi9zMScgfSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpdmUudHJhbnNjcmlwdC5sZW5ndGgsIDIpO1xuXG5cdFx0XHRjb25zdCBjb2xkID0gY3JlYXRlU2Vzc2lvblNlcnZlclRvb2xHcm91cChjcmVhdGVBY2Nlc3Nvcih7IGxpc3RTZXNzaW9uczogYXN5bmMgKCkgPT4gc2Vzc2lvbnMsIGdldENoYXRDb250ZXh0OiBhc3luYyAoKSA9PiB1bmRlZmluZWQgfSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChKU09OLnBhcnNlKGF3YWl0IGNvbGQuZXhlY3V0ZShzdGF0ZU1hbmFnZXIsICdjb3BpbG90Oi9jYWxsZXInLCBTZXNzaW9uU2VydmVyVG9vbE5hbWUuR2V0U2Vzc2lvbkNvbnRleHQsIHsgc2Vzc2lvbjogJ2NvcGlsb3Q6L3MxJyB9KSksIHtcblx0XHRcdFx0c2Vzc2lvbjogJ2NvcGlsb3Q6L3MxJywgb3Blbkxpbms6ICdhZ2VudC1ob3N0LXNlc3Npb246Ly9jb3BpbG90L3MxJywgZGV0YWlsOiAnc3VtbWFyeScsIHRyYW5zY3JpcHQ6IFtdLCBoYXNNb3JlSGlzdG9yeTogZmFsc2UsIHRydW5jYXRlZDogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFNlc3Npb25Db250ZXh0QXJncyB2YWxpZGF0ZXMgaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGdldFNlc3Npb25Db250ZXh0QXJncyh7fSwgW10pLCAvc2Vzc2lvbi8pO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRTZXNzaW9uQ29udGV4dEFyZ3MoeyBzZXNzaW9uOiAnY29waWxvdDovbm9wZScgfSwgW3Nlc3Npb25NZXRhKCdzMScsIFNlc3Npb25TdGF0dXMuSWRsZSwgd29ya3NwYWNlKV0pLCAva25vd24gc2Vzc2lvbi8pO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRTZXNzaW9uQ29udGV4dEFyZ3MoeyBzZXNzaW9uOiAnY29waWxvdDovczEnLCBkZXRhaWw6ICdodWdlJyB9LCBbc2Vzc2lvbk1ldGEoJ3MxJywgU2Vzc2lvblN0YXR1cy5JZGxlLCB3b3Jrc3BhY2UpXSksIC9kZXRhaWwvKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZXNzaW9uQ29udGV4dEFyZ3MoeyBzZXNzaW9uOiAnY29waWxvdDovczEnLCB0cmFuc2NyaXB0TGltaXQ6IDk5OSB9LCBbc2Vzc2lvbk1ldGEoJ3MxJywgU2Vzc2lvblN0YXR1cy5JZGxlLCB3b3Jrc3BhY2UpXSkudHJhbnNjcmlwdExpbWl0LCA1MCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldF9jdXJyZW50X3Nlc3Npb24gcmV0dXJucyB0aGUgY3VycmVudCBzZXNzaW9uIGxpbmsgKyBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBzdG9yZS5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IGdyb3VwID0gY3JlYXRlU2Vzc2lvblNlcnZlclRvb2xHcm91cChjcmVhdGVBY2Nlc3Nvcih7IGxpc3RTZXNzaW9uczogYXN5bmMgKCkgPT4gW3Nlc3Npb25NZXRhKCdzMScsIFNlc3Npb25TdGF0dXMuSWRsZSwgd29ya3NwYWNlKV0gfSkpO1xuXHRcdC8vIFRvb2wgY2FsbCBydW5zIG9uIHRoZSBzZXNzaW9uJ3MgZGVmYXVsdCBjaGF0IGNoYW5uZWw7IHRoZSB0b29sIHJlc29sdmVzIHRoZSBvd25pbmcgc2Vzc2lvbi5cblx0XHRjb25zdCBjaGF0Q2hhbm5lbCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoJ2NvcGlsb3Q6L3MxJyk7XG5cdFx0Y29uc3QgdGV4dCA9IGF3YWl0IGdyb3VwLmV4ZWN1dGUoc3RhdGVNYW5hZ2VyLCBjaGF0Q2hhbm5lbCwgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkdldEN1cnJlbnRTZXNzaW9uLCB7fSk7XG5cdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZSh0ZXh0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLnNlc3Npb24sICdjb3BpbG90Oi9zMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQub3BlbkxpbmssICdhZ2VudC1ob3N0LXNlc3Npb246Ly9jb3BpbG90L3MxJyk7XG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXREZWxldGVTZXNzaW9uQXJncyB2YWxpZGF0ZXMgYW5kIHJlZnVzZXMgdGhlIGN1cnJlbnQgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9ucyA9IFtzZXNzaW9uTWV0YSgnczEnLCBTZXNzaW9uU3RhdHVzLklkbGUsIHdvcmtzcGFjZSksIHNlc3Npb25NZXRhKCdzMicsIFNlc3Npb25TdGF0dXMuSWRsZSwgd29ya3NwYWNlKV07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldERlbGV0ZVNlc3Npb25BcmdzKHsgc2Vzc2lvbjogJ2NvcGlsb3Q6L3MyJyB9LCBzZXNzaW9ucykudG9TdHJpbmcoKSwgJ2NvcGlsb3Q6L3MyJyk7XG5cdFx0Ly8gQWNjZXB0cyB0aGUgYWdlbnQtaG9zdC1zZXNzaW9uOi8vIG9wZW4gbGluayBmb3JtIChhcyByZXR1cm5lZCBieSBjcmVhdGVfc2Vzc2lvbikuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldERlbGV0ZVNlc3Npb25BcmdzKHsgc2Vzc2lvbjogJ2FnZW50LWhvc3Qtc2Vzc2lvbjovL2NvcGlsb3QvczInIH0sIHNlc3Npb25zKS50b1N0cmluZygpLCAnY29waWxvdDovczInKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGdldERlbGV0ZVNlc3Npb25BcmdzKHsgc2Vzc2lvbjogJ2NvcGlsb3Q6L3Vua25vd24nIH0sIHNlc3Npb25zKSwgL3Nlc3Npb24vKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGdldERlbGV0ZVNlc3Npb25BcmdzKHt9LCBzZXNzaW9ucyksIC9zZXNzaW9uLyk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXREZWxldGVTZXNzaW9uQXJncyh7IHNlc3Npb246ICdjb3BpbG90Oi9zMScgfSwgc2Vzc2lvbnMsIFVSSS5wYXJzZSgnY29waWxvdDovczEnKSksIC9jdXJyZW50IHNlc3Npb24vKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGdldERlbGV0ZVNlc3Npb25BcmdzKHsgc2Vzc2lvbjogJ2FnZW50LWhvc3Qtc2Vzc2lvbjovL2NvcGlsb3QvczEnIH0sIHNlc3Npb25zLCBVUkkucGFyc2UoJ2NvcGlsb3Q6L3MxJykpLCAvY3VycmVudCBzZXNzaW9uLyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZV9zZXNzaW9uIGRlbGV0ZXMgdGhlIHRhcmdldCBhbmQgcmV0dXJucyBhIGNvbmZpcm1hdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgZGVsZXRlZDogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGFjY2Vzc29yID0gY3JlYXRlQWNjZXNzb3Ioe1xuXHRcdFx0bGlzdFNlc3Npb25zOiBhc3luYyAoKSA9PiBbc2Vzc2lvbk1ldGEoJ3MxJywgU2Vzc2lvblN0YXR1cy5JZGxlLCB3b3Jrc3BhY2UpLCBzZXNzaW9uTWV0YSgnczInLCBTZXNzaW9uU3RhdHVzLklkbGUsIHdvcmtzcGFjZSldLFxuXHRcdFx0b25EZWxldGU6IHNlc3Npb24gPT4geyBkZWxldGVkID0gc2Vzc2lvbjsgfSxcblx0XHR9KTtcblx0XHRjb25zdCB0ZXh0ID0gYXdhaXQgYXBwbHlEZWxldGVTZXNzaW9uVG9vbChhY2Nlc3NvciwgeyBzZXNzaW9uOiAnY29waWxvdDovczInIH0sIFVSSS5wYXJzZSgnY29waWxvdDovczEnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbGV0ZWQ/LnRvU3RyaW5nKCksICdjb3BpbG90Oi9zMicpO1xuXHRcdGFzc2VydC5vayh0ZXh0LmluY2x1ZGVzKCdjb3BpbG90Oi9zMicpKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxjQUFjLHFCQUFxQixhQUFhLGtCQUFrQiw0QkFBNEIsZ0JBQWdCLFdBQVcscUJBQXFC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
