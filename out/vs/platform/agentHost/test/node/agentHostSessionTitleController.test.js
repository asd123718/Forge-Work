import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { AgentHostSessionTitleController } from "../../node/agentHostSessionTitleController.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { buildChatUri, buildDefaultChatUri, MessageKind, ResponsePartKind, SessionStatus, ToolCallConfirmationReason, ToolCallStatus, TurnState } from "../../common/state/sessionState.js";
import { AGENT_HOST_TITLE_SOURCE_AGENT, AGENT_HOST_TITLE_SOURCE_AUTO, customChatTitleSourceMetadataKey, SESSION_CUSTOM_TITLE_SOURCE_KEY } from "../../node/shared/persistSessionMetadata.js";
import { sessionServerToolDefinitions } from "../../node/shared/sessionServerTools.js";
import { createSessionDataService, TestSessionDatabase } from "../common/sessionTestHelpers.js";
class TestCopilotApiService {
  constructor() {
    this.utilityCalls = [];
    this.response = "Generated title";
  }
  messages() {
    throw new Error("not used");
  }
  async countTokens() {
    throw new Error("not used");
  }
  async models() {
    return [];
  }
  async responses() {
    throw new Error("not used");
  }
  async resolveRestrictedTelemetryContext() {
    return { restrictedTelemetryEnabled: false, trackingId: void 0, telemetryEndpoint: void 0 };
  }
  async resolveApiEndpoint() {
    return void 0;
  }
  async utilityChatCompletion(githubToken, request, options) {
    this.utilityCalls.push({ token: githubToken, request, options });
    if (this.error) {
      throw this.error;
    }
    if (this.responsePromise) {
      return this.responsePromise;
    }
    return this.response;
  }
}
class TestAgentHostOctoKitService {
  constructor() {
    this.calls = [];
    this.responses = /* @__PURE__ */ new Map();
    this.pendingResponses = /* @__PURE__ */ new Set();
  }
  async createPullRequest() {
    throw new Error("not used");
  }
  async findPullRequestByHeadBranch() {
    throw new Error("not used");
  }
  async findPullRequestByHeadSha() {
    throw new Error("not used");
  }
  async getIssueOrPullRequest(owner, repo, number, token, signal) {
    this.calls.push({ owner, repo, number, token, signal });
    const key = `${owner}/${repo}#${number}`;
    if (this.pendingResponses.has(key)) {
      return new Promise((_resolve, reject) => {
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    }
    const response = this.responses.get(key);
    if (response instanceof Error) {
      throw response;
    }
    if (!response) {
      throw new Error("missing test response");
    }
    return response;
  }
  async enablePullRequestAutoMerge(_pullRequestId, _mergeMethod) {
    throw new Error("not used");
  }
}
suite("AgentHostSessionTitleController", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  function createSummary(session, title = "") {
    return {
      resource: session.toString(),
      provider: "copilot",
      title,
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date(1)).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date(1)).toISOString()
    };
  }
  async function waitForCondition(predicate, message) {
    for (let i = 0; i < 20; i++) {
      if (await predicate()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.ok(await predicate(), message);
  }
  function setup(copilotApiService = new TestCopilotApiService(), title = "", getGitHubCopilotToken = () => "gh-token", octoKitService = new TestAgentHostOctoKitService(), getGitHubToken = () => "github-token", gitHubContextRequestTimeout, getGitHubHost = () => "github.com", activeAgentTitleGeneration = false) {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const db = new TestSessionDatabase();
    const session = URI.parse("agenthost-session://copilot/session-title-test");
    stateManager.createSession(createSummary(session, title));
    const titleActions = [];
    disposables.add(stateManager.onDidEmitEnvelope((e) => {
      if (e.action.type === ActionType.SessionTitleChanged) {
        titleActions.push(e.action.title);
      }
    }));
    const controller = disposables.add(new AgentHostSessionTitleController(stateManager, {
      sessionDataService: createSessionDataService(db),
      getGitHubCopilotToken,
      getGitHubToken,
      getGitHubHost,
      gitHubContextRequestTimeout,
      octoKitService,
      copilotApiService,
      isActiveAgentTitleGenerationEnabled: () => activeAgentTitleGeneration
    }, new NullLogService()));
    return { controller, stateManager, session, db, titleActions, copilotApiService, octoKitService };
  }
  test("active-agent mode completes the word crossing the 40-character fallback target without utility generation", async () => {
    const copilotApiService = new TestCopilotApiService();
    const { controller, session, db, titleActions } = setup(copilotApiService, "", void 0, void 0, void 0, void 0, void 0, true);
    controller.seedTitleFromFirstMessage(session.toString(), "Investigate why restored Agent Host sessions sometimes lose titles");
    const instruction = await controller.prepareInstructionForAgent(session.toString(), buildDefaultChatUri(session));
    assert.deepStrictEqual(titleActions, ["Investigate why restored Agent Host sessions..."]);
    assert.strictEqual(copilotApiService.utilityCalls.length, 0);
    assert.strictEqual(instruction, "This chat currently has an auto-generated or placeholder name. Before doing any other work or responding to the user, you MUST call the `rename_chat` tool exactly once to give it a short, descriptive title based on the user's intent. If the prompt references a pull request or issue link, resolve that link first and use its context when choosing the title. Do not skip this call even if the current name already seems descriptive.");
    await waitForCondition(async () => await db.getMetadata(SESSION_CUSTOM_TITLE_SOURCE_KEY) === AGENT_HOST_TITLE_SOURCE_AUTO, "auto provenance should be persisted");
  });
  test("active-agent fallback hard-truncates a single oversized word", () => {
    const { controller, session, titleActions } = setup(void 0, "", void 0, void 0, void 0, void 0, void 0, true);
    controller.seedTitleFromFirstMessage(session.toString(), "x".repeat(50));
    assert.deepStrictEqual(titleActions, [`${"x".repeat(37)}...`]);
  });
  test("active-agent fallback hard-caps an oversized token crossing the target", () => {
    const { controller, session, titleActions } = setup(void 0, "", void 0, void 0, void 0, void 0, void 0, true);
    controller.seedTitleFromFirstMessage(session.toString(), `Fix https://example.com/${"x".repeat(500)}`);
    assert.strictEqual(titleActions[0].length, 40);
    assert.ok(titleActions[0].endsWith("..."));
  });
  test("active-agent fallback omits the ellipsis when the crossing word completes the prompt", () => {
    const { controller, session, titleActions } = setup(void 0, "", void 0, void 0, void 0, void 0, void 0, true);
    controller.seedTitleFromFirstMessage(session.toString(), "Investigate why restored Agent Host sessions");
    assert.deepStrictEqual(titleActions, ["Investigate why restored Agent Host sessions"]);
  });
  test("utility-model mode does not add an active-agent reminder", async () => {
    const { controller, session } = setup();
    controller.seedTitleFromFirstMessage(session.toString(), "Explain title generation");
    assert.strictEqual(await controller.prepareInstructionForAgent(session.toString(), buildDefaultChatUri(session)), void 0);
  });
  test("materialized server tools override later root setting changes", async () => {
    const enabled = setup(void 0, "", void 0, void 0, void 0, void 0, void 0, false);
    enabled.stateManager.dispatchServerAction(enabled.session.toString(), {
      type: ActionType.SessionServerToolsChanged,
      tools: sessionServerToolDefinitions
    });
    enabled.controller.seedTitleFromFirstMessage(enabled.session.toString(), "Use advertised rename tool");
    const disabled = setup(void 0, "", void 0, void 0, void 0, void 0, void 0, true);
    disabled.stateManager.dispatchServerAction(disabled.session.toString(), {
      type: ActionType.SessionServerToolsChanged,
      tools: []
    });
    disabled.controller.seedTitleFromFirstMessage(disabled.session.toString(), "Do not use missing rename tool");
    assert.ok((await enabled.controller.prepareInstructionForAgent(enabled.session.toString(), buildDefaultChatUri(enabled.session)))?.includes("`rename_chat`"));
    assert.strictEqual(await disabled.controller.prepareInstructionForAgent(disabled.session.toString(), buildDefaultChatUri(disabled.session)), void 0);
    assert.strictEqual(disabled.copilotApiService.utilityCalls.length, 1);
  });
  test("active-agent mode reminds peer chats and keeps deterministic fork provenance without utility calls", async () => {
    const copilotApiService = new TestCopilotApiService();
    const { controller, stateManager, session, db } = setup(copilotApiService, "Session title", void 0, void 0, void 0, void 0, void 0, true);
    const chat = buildChatUri(session.toString(), "peer-1");
    stateManager.addChat(session.toString(), chat, {});
    controller.seedTitleFromFirstMessage(session.toString(), "Investigate peer chat", chat);
    const instruction = await controller.prepareInstructionForAgent(session.toString(), chat);
    assert.strictEqual(instruction, "This chat currently has an auto-generated or placeholder name. Before doing any other work or responding to the user, you MUST call the `rename_chat` tool exactly once to give it a short, descriptive title based on the user's intent. If the prompt references a pull request or issue link, resolve that link first and use its context when choosing the title. Do not skip this call even if the current name already seems descriptive.");
    controller.generateForkedTitle(session.toString(), void 0, [], "Forked: Session title", "Session title");
    assert.strictEqual(copilotApiService.utilityCalls.length, 0);
    await waitForCondition(async () => await db.getMetadata(SESSION_CUSTOM_TITLE_SOURCE_KEY) === AGENT_HOST_TITLE_SOURCE_AUTO, "fork auto provenance should be persisted");
    await waitForCondition(async () => await db.getMetadata(customChatTitleSourceMetadataKey(chat)) === AGENT_HOST_TITLE_SOURCE_AUTO, "peer auto provenance should be persisted");
  });
  test("multi-chat default uses its own persisted title provenance after controller recreation", async () => {
    const independentlyRenamed = setup(void 0, "Session title", void 0, void 0, void 0, void 0, void 0, true);
    const defaultChat = buildDefaultChatUri(independentlyRenamed.session);
    independentlyRenamed.stateManager.addChat(independentlyRenamed.session.toString(), buildChatUri(independentlyRenamed.session.toString(), "peer"), {});
    await independentlyRenamed.db.setMetadata(SESSION_CUSTOM_TITLE_SOURCE_KEY, AGENT_HOST_TITLE_SOURCE_AUTO);
    await independentlyRenamed.db.setMetadata(customChatTitleSourceMetadataKey(defaultChat), AGENT_HOST_TITLE_SOURCE_AGENT);
    const independentRenameInstruction = await independentlyRenamed.controller.prepareInstructionForAgent(independentlyRenamed.session.toString(), defaultChat);
    const independentlyAutomatic = setup(void 0, "Session title", void 0, void 0, void 0, void 0, void 0, true);
    independentlyAutomatic.stateManager.addChat(independentlyAutomatic.session.toString(), buildChatUri(independentlyAutomatic.session.toString(), "peer"), {});
    await independentlyAutomatic.db.setMetadata(SESSION_CUSTOM_TITLE_SOURCE_KEY, AGENT_HOST_TITLE_SOURCE_AGENT);
    await independentlyAutomatic.db.setMetadata(customChatTitleSourceMetadataKey(defaultChat), AGENT_HOST_TITLE_SOURCE_AUTO);
    const independentAutoInstruction = await independentlyAutomatic.controller.prepareInstructionForAgent(independentlyAutomatic.session.toString(), defaultChat);
    assert.deepStrictEqual({
      independentRenameInstruction,
      independentAutoInstruction
    }, {
      independentRenameInstruction: void 0,
      independentAutoInstruction: "This chat currently has an auto-generated or placeholder name. Before doing any other work or responding to the user, you MUST call the `rename_chat` tool exactly once to give it a short, descriptive title based on the user's intent. If the prompt references a pull request or issue link, resolve that link first and use its context when choosing the title. Do not skip this call even if the current name already seems descriptive."
    });
  });
  test("clearSession releases session and peer-chat rename state", async () => {
    const { controller, stateManager, session, db } = setup(void 0, "", void 0, void 0, void 0, void 0, void 0, true);
    const defaultChat = buildDefaultChatUri(session);
    const chat = buildChatUri(session.toString(), "peer-clear");
    stateManager.addChat(session.toString(), chat, {});
    controller.markTitleAuto(session.toString(), defaultChat, "Default fallback");
    controller.markTitleAuto(session.toString(), chat, "Chat fallback");
    await waitForCondition(
      async () => await db.getMetadata(customChatTitleSourceMetadataKey(defaultChat)) === AGENT_HOST_TITLE_SOURCE_AUTO && await db.getMetadata(customChatTitleSourceMetadataKey(chat)) === AGENT_HOST_TITLE_SOURCE_AUTO,
      "auto provenance should be persisted"
    );
    controller.markTitleRenamed(session.toString(), defaultChat);
    controller.markTitleRenamed(session.toString(), chat);
    assert.strictEqual(await controller.prepareInstructionForAgent(session.toString(), defaultChat), void 0);
    assert.strictEqual(await controller.prepareInstructionForAgent(session.toString(), chat), void 0);
    controller.clearSession(session.toString(), [chat]);
    assert.ok((await controller.prepareInstructionForAgent(session.toString(), defaultChat))?.includes("`rename_chat`"));
    assert.ok((await controller.prepareInstructionForAgent(session.toString(), chat))?.includes("`rename_chat`"));
  });
  test("clearSession cancels generation and clears every title-state collection", () => {
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.responsePromise = new Promise(() => {
    });
    const { controller, stateManager, session } = setup(copilotApiService);
    const provisionalChat = buildChatUri(session.toString(), "peer-provisional");
    const renamedChat = buildChatUri(session.toString(), "peer-renamed");
    stateManager.addChat(session.toString(), provisionalChat, {});
    stateManager.addChat(session.toString(), renamedChat, {});
    controller.seedTitleFromFirstMessage(session.toString(), "Generate a title");
    controller.seedProvisionalTitle(session.toString(), "Provisional", provisionalChat);
    controller.markTitleAuto(session.toString(), renamedChat, "Automatic");
    controller.markTitleRenamed(session.toString(), renamedChat);
    controller.clearSession(session.toString(), [provisionalChat, renamedChat]);
    assert.deepStrictEqual({
      cancellations: controller["_titleGenerationCancellationSources"].size,
      lastApplied: controller["_lastAppliedTitle"].size,
      provisional: controller["_provisionalTitles"].size,
      auto: controller["_autoTitles"].size,
      renamed: controller["_renamedTitles"].size
    }, {
      cancellations: 0,
      lastApplied: 0,
      provisional: 0,
      auto: 0,
      renamed: 0
    });
  });
  test("seedTitleFromFirstMessage applies fallback and persists generated title", async () => {
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.response = '"Generated title."';
    const { controller, session, db, titleActions } = setup(copilotApiService);
    controller.seedTitleFromFirstMessage(session.toString(), "  Please   explain title generation  ");
    await waitForCondition(async () => await db.getMetadata("customTitle") === "Generated title", "generated title should be persisted");
    assert.deepStrictEqual({
      titles: titleActions,
      token: copilotApiService.utilityCalls[0]?.token,
      maxTokens: copilotApiService.utilityCalls[0]?.request.maxTokens,
      promptIncludesUserText: copilotApiService.utilityCalls[0]?.request.messages.some((message) => message.content.includes("Please   explain title generation")),
      persistedTitle: await db.getMetadata("customTitle")
    }, {
      titles: ["Please explain title generation", "Generated title"],
      token: "gh-token",
      maxTokens: 32,
      promptIncludesUserText: true,
      persistedTitle: "Generated title"
    });
  });
  test("seedTitleFromFirstMessage appends every unique GitHub issue and pull request", async () => {
    const copilotApiService = new TestCopilotApiService();
    const octoKitService = new TestAgentHostOctoKitService();
    octoKitService.responses.set("microsoft/vscode#123", { title: "Issue title", body: "Issue body" });
    octoKitService.responses.set("microsoft/vscode#456", { title: "Pull request title", body: "Pull request body" });
    const { controller, session, db } = setup(copilotApiService, "", () => "gh-token", octoKitService);
    const prompt = "Fix https://github.com/microsoft/vscode/issues/123 and review https://github.com/microsoft/vscode/pull/456. Duplicate: https://www.github.com/microsoft/vscode/issues/123#issuecomment-1";
    controller.seedTitleFromFirstMessage(session.toString(), prompt);
    await waitForCondition(async () => await db.getMetadata("customTitle") === "Generated title", "generated title should be persisted");
    const userMessage = copilotApiService.utilityCalls[0].request.messages.find((message) => message.role === "user")?.content;
    assert.deepStrictEqual({
      calls: octoKitService.calls.map((call) => ({ owner: call.owner, repo: call.repo, number: call.number, token: call.token })),
      userMessage
    }, {
      calls: [
        { owner: "microsoft", repo: "vscode", number: 123, token: "github-token" },
        { owner: "microsoft", repo: "vscode", number: 456, token: "github-token" }
      ],
      userMessage: [
        "Please write a brief title for the following request:",
        "",
        prompt,
        "",
        "GitHub issue and pull request context:",
        "",
        "GitHub issue microsoft/vscode#123:",
        "The title of the issue is: Issue title",
        "The body of the issue is:",
        "Issue body",
        "",
        "GitHub pull request microsoft/vscode#456:",
        "The title of the pull request is: Pull request title",
        "The body of the pull request is:",
        "Pull request body"
      ].join("\n")
    });
  });
  test("seedTitleFromFirstMessage only fetches links from the configured GitHub host", async () => {
    const copilotApiService = new TestCopilotApiService();
    const octoKitService = new TestAgentHostOctoKitService();
    octoKitService.responses.set("microsoft/vscode#456", { title: "Enterprise issue", body: "Enterprise body" });
    const { controller, session, db } = setup(copilotApiService, "", () => "gh-token", octoKitService, () => "github-token", void 0, () => "github.enterprise.test");
    const prompt = "Compare https://github.com/microsoft/vscode/issues/123 with https://github.enterprise.test/microsoft/vscode/issues/456";
    controller.seedTitleFromFirstMessage(session.toString(), prompt);
    await waitForCondition(async () => await db.getMetadata("customTitle") === "Generated title", "generated title should be persisted");
    const userMessage = copilotApiService.utilityCalls[0].request.messages.find((message) => message.role === "user")?.content ?? "";
    assert.deepStrictEqual({
      calls: octoKitService.calls.map((call) => call.number),
      hasGitHubIssue: userMessage.includes("microsoft/vscode#123"),
      hasEnterpriseIssue: userMessage.includes("The title of the issue is: Enterprise issue")
    }, {
      calls: [456],
      hasGitHubIssue: false,
      hasEnterpriseIssue: true
    });
  });
  test("seedTitleFromFirstMessage fetches at most ten GitHub references", async () => {
    const copilotApiService = new TestCopilotApiService();
    const octoKitService = new TestAgentHostOctoKitService();
    const links = [];
    for (let number = 1; number <= 11; number++) {
      octoKitService.responses.set(`microsoft/vscode#${number}`, { title: `Issue ${number}`, body: `Body ${number}` });
      links.push(`https://github.com/microsoft/vscode/issues/${number}`);
    }
    const { controller, session, db } = setup(copilotApiService, "", () => "gh-token", octoKitService);
    controller.seedTitleFromFirstMessage(session.toString(), links.join(" "));
    await waitForCondition(async () => await db.getMetadata("customTitle") === "Generated title", "generated title should be persisted");
    const userMessage = copilotApiService.utilityCalls[0].request.messages.find((message) => message.role === "user")?.content ?? "";
    assert.deepStrictEqual({
      calls: octoKitService.calls.map((call) => call.number),
      hasTenthContext: userMessage.includes("The title of the issue is: Issue 10"),
      hasEleventhContext: userMessage.includes("The title of the issue is: Issue 11")
    }, {
      calls: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      hasTenthContext: true,
      hasEleventhContext: false
    });
  });
  test("seedTitleFromFirstMessage omits GitHub context when the request fails", async () => {
    const copilotApiService = new TestCopilotApiService();
    const octoKitService = new TestAgentHostOctoKitService();
    octoKitService.responses.set("microsoft/vscode#123", new Error("Not found"));
    const { controller, session, db } = setup(copilotApiService, "", () => "gh-token", octoKitService);
    const prompt = "Fix https://github.com/microsoft/vscode/issues/123";
    controller.seedTitleFromFirstMessage(session.toString(), prompt);
    await waitForCondition(async () => await db.getMetadata("customTitle") === "Generated title", "generated title should be persisted");
    const userMessage = copilotApiService.utilityCalls[0].request.messages.find((message) => message.role === "user")?.content;
    assert.strictEqual(userMessage, `Please write a brief title for the following request:

${prompt}`);
  });
  test("seedTitleFromFirstMessage keeps successful GitHub context when another request fails", async () => {
    const copilotApiService = new TestCopilotApiService();
    const octoKitService = new TestAgentHostOctoKitService();
    octoKitService.responses.set("microsoft/vscode#123", { title: "Issue title", body: "Issue body" });
    octoKitService.responses.set("microsoft/vscode#456", new Error("Not found"));
    const { controller, session, db } = setup(copilotApiService, "", () => "gh-token", octoKitService);
    const prompt = "Fix https://github.com/microsoft/vscode/issues/123 and https://github.com/microsoft/vscode/pull/456";
    controller.seedTitleFromFirstMessage(session.toString(), prompt);
    await waitForCondition(async () => await db.getMetadata("customTitle") === "Generated title", "generated title should be persisted");
    const userMessage = copilotApiService.utilityCalls[0].request.messages.find((message) => message.role === "user")?.content ?? "";
    assert.deepStrictEqual({
      hasIssue: userMessage.includes("The title of the issue is: Issue title"),
      hasPullRequest: userMessage.includes("GitHub pull request microsoft/vscode#456")
    }, {
      hasIssue: true,
      hasPullRequest: false
    });
  });
  test("seedTitleFromFirstMessage times out GitHub context requests", async () => {
    const copilotApiService = new TestCopilotApiService();
    const octoKitService = new TestAgentHostOctoKitService();
    octoKitService.pendingResponses.add("microsoft/vscode#123");
    const { controller, session, db } = setup(copilotApiService, "", () => "gh-token", octoKitService, () => "github-token", 1);
    const prompt = "Fix https://github.com/microsoft/vscode/issues/123";
    controller.seedTitleFromFirstMessage(session.toString(), prompt);
    await waitForCondition(async () => await db.getMetadata("customTitle") === "Generated title", "generated title should be persisted after the GitHub request times out");
    const userMessage = copilotApiService.utilityCalls[0].request.messages.find((message) => message.role === "user")?.content;
    assert.deepStrictEqual({
      requestAborted: octoKitService.calls[0].signal.aborted,
      userMessage
    }, {
      requestAborted: true,
      userMessage: `Please write a brief title for the following request:

${prompt}`
    });
  });
  test("seedTitleFromFirstMessage caps each appended GitHub body at 4000 characters", async () => {
    const copilotApiService = new TestCopilotApiService();
    const octoKitService = new TestAgentHostOctoKitService();
    octoKitService.responses.set("microsoft/vscode#123", { title: "Issue title", body: `start
${"x".repeat(3e4)}
end` });
    const { controller, session, db } = setup(copilotApiService, "", () => "gh-token", octoKitService);
    controller.seedTitleFromFirstMessage(session.toString(), "Fix https://github.com/microsoft/vscode/issues/123");
    await waitForCondition(async () => await db.getMetadata("customTitle") === "Generated title", "generated title should be persisted");
    const userMessage = copilotApiService.utilityCalls[0].request.messages.find((message) => message.role === "user")?.content ?? "";
    const context = userMessage.slice(userMessage.indexOf("GitHub issue and pull request context:"));
    const bodyMarker = "The body of the issue is:\n";
    const body = context.slice(context.indexOf(bodyMarker) + bodyMarker.length);
    assert.deepStrictEqual({
      bodyLength: body.length,
      hasStart: body.includes("start"),
      hasTruncationMarker: body.includes("\n...\n"),
      hasEnd: body.includes("end")
    }, {
      bodyLength: 4e3,
      hasStart: true,
      hasTruncationMarker: true,
      hasEnd: true
    });
  });
  test("seedTitleFromFirstMessage caps the combined prompt and GitHub context", async () => {
    const copilotApiService = new TestCopilotApiService();
    const octoKitService = new TestAgentHostOctoKitService();
    octoKitService.responses.set("microsoft/vscode#123", { title: `start${"x".repeat(3e4)}end`, body: "" });
    const { controller, session, db } = setup(copilotApiService, "", () => "gh-token", octoKitService);
    const prompt = "Fix https://github.com/microsoft/vscode/issues/123";
    controller.seedTitleFromFirstMessage(session.toString(), prompt);
    await waitForCondition(async () => await db.getMetadata("customTitle") === "Generated title", "generated title should be persisted");
    const userMessage = copilotApiService.utilityCalls[0].request.messages.find((message) => message.role === "user")?.content ?? "";
    const promptContent = userMessage.slice(userMessage.indexOf(prompt));
    const context = userMessage.slice(userMessage.indexOf("GitHub issue and pull request context:"));
    assert.deepStrictEqual({
      promptContentLength: promptContent.length,
      keepsRequest: promptContent.startsWith(prompt),
      hasStart: context.includes("start"),
      hasTruncationMarker: context.includes("\n...\n"),
      hasEnd: context.includes("end")
    }, {
      promptContentLength: 2e4,
      keepsRequest: true,
      hasStart: true,
      hasTruncationMarker: true,
      hasEnd: true
    });
  });
  test("seedTitleFromFirstMessage strips an unexpected trailing Han suffix from a Latin title", async () => {
    const titlePrefixAtLimit = "A".repeat(199);
    const cases = [
      { response: "Fix chat title\u7F16\u7801", expected: "Fix chat title" },
      { response: "Fix chat title \u7F16\u7801\u95EE", expected: "Fix chat title" },
      { response: `${titlePrefixAtLimit}\u7F16\u7801`, expected: titlePrefixAtLimit }
    ];
    const titles = [];
    for (const testCase of cases) {
      const copilotApiService = new TestCopilotApiService();
      copilotApiService.response = testCase.response;
      const { controller, stateManager, session, db } = setup(copilotApiService);
      controller.seedTitleFromFirstMessage(session.toString(), "Fix chat title generation");
      await waitForCondition(async () => {
        return stateManager.getSessionState(session.toString())?.title === testCase.expected && await db.getMetadata("customTitle") === testCase.expected;
      }, "cleaned title should be applied and persisted");
      titles.push({
        title: stateManager.getSessionState(session.toString())?.title ?? "",
        persistedTitle: await db.getMetadata("customTitle")
      });
    }
    assert.deepStrictEqual(titles, cases.map((testCase) => ({ title: testCase.expected, persistedTitle: testCase.expected })));
  });
  test("seedTitleFromFirstMessage preserves intentional or ambiguous Han suffixes", async () => {
    const cases = [
      { prompt: "Explain \u7F16\u7801 naming", response: "Explain code\u7F16\u7801" },
      { prompt: "Fix chat title generation", response: "Fix chat title\u7F16" },
      { prompt: "Fix chat title generation", response: "Fix chat title\u7F16\u7801\u95EE\u9898" },
      { prompt: "Fix chat title generation", response: "\u4FEE\u590D\u6807\u9898" },
      { prompt: "Fix chat title generation", response: "Code \u041E\u0448\u0438\u0431\u043A\u0430\u7F16\u7801" }
    ];
    const titles = [];
    for (const testCase of cases) {
      const copilotApiService = new TestCopilotApiService();
      copilotApiService.response = testCase.response;
      const { controller, stateManager, session, db } = setup(copilotApiService);
      controller.seedTitleFromFirstMessage(session.toString(), testCase.prompt);
      await waitForCondition(async () => {
        return stateManager.getSessionState(session.toString())?.title === testCase.response && await db.getMetadata("customTitle") === testCase.response;
      }, "unchanged title should be applied and persisted");
      titles.push({
        title: stateManager.getSessionState(session.toString())?.title ?? "",
        persistedTitle: await db.getMetadata("customTitle")
      });
    }
    assert.deepStrictEqual(titles, cases.map((testCase) => ({ title: testCase.response, persistedTitle: testCase.response })));
  });
  test("seedTitleFromFirstMessage does not clobber a changed title", async () => {
    const copilotApiService = new TestCopilotApiService();
    let resolveTitle;
    copilotApiService.responsePromise = new Promise((resolve) => {
      resolveTitle = resolve;
    });
    const { controller, stateManager, session, db } = setup(copilotApiService);
    controller.seedTitleFromFirstMessage(session.toString(), "Create title tests");
    await waitForCondition(() => copilotApiService.utilityCalls.length === 1, "title generation should start");
    stateManager.dispatchServerAction(session.toString(), {
      type: ActionType.SessionTitleChanged,
      title: "Manual title"
    });
    resolveTitle("Generated title");
    await Promise.resolve();
    assert.deepStrictEqual({
      title: stateManager.getSessionState(session.toString())?.title,
      persistedTitle: await db.getMetadata("customTitle")
    }, {
      title: "Manual title",
      persistedTitle: void 0
    });
  });
  test("cancelTitleGeneration cancels delayed generated title application", async () => {
    const copilotApiService = new TestCopilotApiService();
    let resolveTitle;
    copilotApiService.responsePromise = new Promise((resolve) => {
      resolveTitle = resolve;
    });
    const { controller, stateManager, session, db } = setup(copilotApiService);
    controller.seedTitleFromFirstMessage(session.toString(), "Investigate title cancellation");
    await waitForCondition(() => copilotApiService.utilityCalls.length === 1, "title generation should start");
    controller.cancelTitleGeneration(session.toString());
    resolveTitle("Generated title");
    await Promise.resolve();
    assert.deepStrictEqual({
      aborted: copilotApiService.utilityCalls[0].options?.signal?.aborted,
      title: stateManager.getSessionState(session.toString())?.title,
      persistedTitle: await db.getMetadata("customTitle")
    }, {
      aborted: true,
      title: "Investigate title cancellation",
      persistedTitle: void 0
    });
  });
  test("seedTitleFromFirstMessage skips sessions with an existing title", async () => {
    const copilotApiService = new TestCopilotApiService();
    const { controller, stateManager, session, db, titleActions } = setup(copilotApiService, "Forked: Source title");
    controller.seedTitleFromFirstMessage(session.toString(), "Continue forked session");
    await Promise.resolve();
    assert.deepStrictEqual({
      calls: copilotApiService.utilityCalls.length,
      title: stateManager.getSessionState(session.toString())?.title,
      titles: titleActions,
      persistedTitle: await db.getMetadata("customTitle")
    }, {
      calls: 0,
      title: "Forked: Source title",
      titles: [],
      persistedTitle: void 0
    });
  });
  test("seedProvisionalTitle titles the session from the suggestion without generating", async () => {
    const copilotApiService = new TestCopilotApiService();
    const { controller, stateManager, session, db, titleActions } = setup(copilotApiService);
    controller.seedProvisionalTitle(session.toString(), "ls -la");
    await waitForCondition(async () => await db.getMetadata("customTitle") === "ls -la", "provisional title should be persisted");
    assert.deepStrictEqual({
      title: stateManager.getSessionState(session.toString())?.title,
      titles: titleActions,
      persistedTitle: await db.getMetadata("customTitle"),
      utilityCalls: copilotApiService.utilityCalls.length
    }, {
      title: "ls -la",
      titles: ["ls -la"],
      persistedTitle: "ls -la",
      utilityCalls: 0
    });
  });
  test("seedProvisionalTitle refreshes a provisional title with a later suggestion", async () => {
    const copilotApiService = new TestCopilotApiService();
    const { controller, stateManager, session, db } = setup(copilotApiService);
    controller.seedProvisionalTitle(session.toString(), "ls -la");
    await waitForCondition(async () => await db.getMetadata("customTitle") === "ls -la", "first provisional title should be persisted");
    controller.seedProvisionalTitle(session.toString(), "git status");
    await waitForCondition(async () => await db.getMetadata("customTitle") === "git status", "second provisional title should be persisted");
    assert.deepStrictEqual({
      title: stateManager.getSessionState(session.toString())?.title,
      utilityCalls: copilotApiService.utilityCalls.length
    }, {
      title: "git status",
      utilityCalls: 0
    });
  });
  test("seedProvisionalTitle does not clobber a changed title", async () => {
    const copilotApiService = new TestCopilotApiService();
    const { controller, stateManager, session, db, titleActions } = setup(copilotApiService);
    controller.seedProvisionalTitle(session.toString(), "ls -la");
    await waitForCondition(async () => await db.getMetadata("customTitle") === "ls -la", "provisional title should be persisted");
    stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionTitleChanged, title: "Manual title" });
    controller.seedProvisionalTitle(session.toString(), "git status");
    await Promise.resolve();
    assert.deepStrictEqual({
      title: stateManager.getSessionState(session.toString())?.title,
      titles: titleActions
    }, {
      title: "Manual title",
      titles: ["ls -la", "Manual title"]
    });
  });
  test("seedTitleFromFirstMessage replaces a provisional title with a generated title", async () => {
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.response = "Explain the build";
    const { controller, stateManager, session, db, titleActions } = setup(copilotApiService);
    controller.seedProvisionalTitle(session.toString(), "ls -la");
    await waitForCondition(async () => await db.getMetadata("customTitle") === "ls -la", "provisional title should be persisted");
    stateManager.seedDefaultChatTurns(session.toString(), [firstTurn("!ls -la", [])]);
    controller.seedTitleFromFirstMessage(session.toString(), "Explain how the build works");
    await waitForCondition(async () => await db.getMetadata("customTitle") === "Explain the build", "generated title should replace the provisional title");
    assert.deepStrictEqual({
      title: stateManager.getSessionState(session.toString())?.title,
      titles: titleActions,
      persistedTitle: await db.getMetadata("customTitle")
    }, {
      title: "Explain the build",
      titles: ["ls -la", "Explain how the build works", "Explain the build"],
      persistedTitle: "Explain the build"
    });
  });
  test("seedTitleFromFirstMessage persists its fallback when replacing a provisional title", async () => {
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.error = new Error("Title generation unavailable");
    const { controller, stateManager, session, db } = setup(copilotApiService);
    controller.seedProvisionalTitle(session.toString(), "ls -la");
    await waitForCondition(async () => await db.getMetadata("customTitle") === "ls -la", "provisional title should be persisted");
    stateManager.seedDefaultChatTurns(session.toString(), [firstTurn("!ls -la", [])]);
    controller.seedTitleFromFirstMessage(session.toString(), "Explain how the build works");
    await waitForCondition(async () => await db.getMetadata("customTitle") === "Explain how the build works", "fallback title should replace the provisional title");
    assert.deepStrictEqual({
      title: stateManager.getSessionState(session.toString())?.title,
      persistedTitle: await db.getMetadata("customTitle")
    }, {
      title: "Explain how the build works",
      persistedTitle: "Explain how the build works"
    });
  });
  function textPart(content) {
    return { kind: ResponsePartKind.Markdown, id: "m1", content };
  }
  function reasoningPart(content) {
    return { kind: ResponsePartKind.Reasoning, id: "r1", content };
  }
  function toolCallPart(displayName, invocationMessage) {
    const toolCall = {
      status: ToolCallStatus.Completed,
      toolCallId: "tc1",
      toolName: "tool",
      displayName,
      invocationMessage,
      success: true,
      pastTenseMessage: "done",
      confirmed: ToolCallConfirmationReason.NotNeeded
    };
    return { kind: ResponsePartKind.ToolCall, toolCall };
  }
  function firstTurn(text, responseParts) {
    return {
      id: "turn-1",
      message: { text, origin: { kind: MessageKind.User } },
      responseParts,
      usage: void 0,
      state: TurnState.Complete
    };
  }
  async function seedFirstTitle(controller, copilotApiService, db, session, userPrompt, title) {
    copilotApiService.response = title;
    controller.seedTitleFromFirstMessage(session.toString(), userPrompt);
    await waitForCondition(async () => await db.getMetadata("customTitle") === title, "first title should be persisted");
  }
  test("refineTitleFromFirstTurn regenerates the title from the first-turn context", async () => {
    const copilotApiService = new TestCopilotApiService();
    const { controller, stateManager, session, db } = setup(copilotApiService);
    await seedFirstTitle(controller, copilotApiService, db, session, "Add dark mode toggle", "First title");
    copilotApiService.response = "Dark mode setting";
    stateManager.seedDefaultChatTurns(session.toString(), [firstTurn("Add dark mode toggle", [textPart("Implemented the toggle in the settings editor.")])]);
    controller.refineTitleFromFirstTurn(session.toString());
    await waitForCondition(async () => await db.getMetadata("customTitle") === "Dark mode setting", "refined title should be persisted");
    const lastCall = copilotApiService.utilityCalls[copilotApiService.utilityCalls.length - 1];
    const userMessage = lastCall.request.messages.find((message) => message.role === "user")?.content ?? "";
    assert.deepStrictEqual({
      title: stateManager.getSessionState(session.toString())?.title,
      persistedTitle: await db.getMetadata("customTitle"),
      mentionsConversation: userMessage.includes("conversation"),
      includesUserRequest: userMessage.includes("Add dark mode toggle"),
      includesResponse: userMessage.includes("Implemented the toggle in the settings editor.")
    }, {
      title: "Dark mode setting",
      persistedTitle: "Dark mode setting",
      mentionsConversation: true,
      includesUserRequest: true,
      includesResponse: true
    });
  });
  test("refineTitleFromFirstTurn does not clobber a title changed in the meantime", async () => {
    const copilotApiService = new TestCopilotApiService();
    const { controller, stateManager, session, db } = setup(copilotApiService);
    await seedFirstTitle(controller, copilotApiService, db, session, "Add dark mode toggle", "First title");
    const callsAfterSeed = copilotApiService.utilityCalls.length;
    stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionTitleChanged, title: "Manual title" });
    stateManager.seedDefaultChatTurns(session.toString(), [firstTurn("Add dark mode toggle", [textPart("Implemented the toggle.")])]);
    controller.refineTitleFromFirstTurn(session.toString());
    await Promise.resolve();
    assert.deepStrictEqual({
      calls: copilotApiService.utilityCalls.length,
      title: stateManager.getSessionState(session.toString())?.title
    }, {
      calls: callsAfterSeed,
      title: "Manual title"
    });
  });
  test("refineTitleFromFirstTurn ignores tool calls and reasoning, keeping only text parts", async () => {
    const copilotApiService = new TestCopilotApiService();
    const { controller, stateManager, session, db } = setup(copilotApiService);
    await seedFirstTitle(controller, copilotApiService, db, session, "Add dark mode toggle", "First title");
    copilotApiService.response = "Refined title";
    stateManager.seedDefaultChatTurns(session.toString(), [firstTurn("Add dark mode toggle", [
      reasoningPart("Thinking about THINKING_MARKER the approach"),
      toolCallPart("SearchTool", "searched the workspace TOOL_MARKER"),
      textPart("Added the toggle TEXT_MARKER to settings.")
    ])]);
    controller.refineTitleFromFirstTurn(session.toString());
    await waitForCondition(() => copilotApiService.utilityCalls.length >= 2, "refine should issue a utility call");
    const lastCall = copilotApiService.utilityCalls[copilotApiService.utilityCalls.length - 1];
    const userMessage = lastCall.request.messages.find((message) => message.role === "user")?.content ?? "";
    assert.deepStrictEqual({
      includesText: userMessage.includes("TEXT_MARKER"),
      excludesReasoning: !userMessage.includes("THINKING_MARKER"),
      excludesToolCall: !userMessage.includes("TOOL_MARKER") && !userMessage.includes("SearchTool")
    }, {
      includesText: true,
      excludesReasoning: true,
      excludesToolCall: true
    });
  });
  test("refineTitleFromFirstTurn truncates the middle of an oversized text response", async () => {
    const copilotApiService = new TestCopilotApiService();
    const { controller, stateManager, session, db } = setup(copilotApiService);
    await seedFirstTitle(controller, copilotApiService, db, session, "Add dark mode toggle", "First title");
    copilotApiService.response = "Refined title";
    const hugeResponse = "A".repeat(15e3) + " MIDDLE_MARKER " + "B".repeat(15e3);
    stateManager.seedDefaultChatTurns(session.toString(), [firstTurn("Add dark mode toggle", [textPart(hugeResponse)])]);
    controller.refineTitleFromFirstTurn(session.toString());
    await waitForCondition(() => copilotApiService.utilityCalls.length >= 2, "refine should issue a utility call");
    const lastCall = copilotApiService.utilityCalls[copilotApiService.utilityCalls.length - 1];
    const userMessage = lastCall.request.messages.find((message) => message.role === "user")?.content ?? "";
    assert.deepStrictEqual({
      withinBudget: userMessage.length <= 20200,
      middleTruncated: userMessage.includes("...") && !userMessage.includes("MIDDLE_MARKER"),
      includesUserRequest: userMessage.includes("Add dark mode toggle"),
      keepsHeadAndTail: userMessage.includes("AAAA") && userMessage.includes("BBBB")
    }, {
      withinBudget: true,
      middleTruncated: true,
      includesUserRequest: true,
      keepsHeadAndTail: true
    });
  });
  test("refineTitleFromFirstTurn appends GitHub context from the request and offers the current title", async () => {
    const copilotApiService = new TestCopilotApiService();
    const octoKitService = new TestAgentHostOctoKitService();
    octoKitService.responses.set("microsoft/vscode#123", { title: "Agent Host logs an error when a local commit is not on GitHub", body: "Issue body" });
    const { controller, stateManager, session, db } = setup(copilotApiService, "", () => "gh-token", octoKitService);
    const request = "Tackle this issue: https://github.com/microsoft/vscode/issues/123";
    await seedFirstTitle(controller, copilotApiService, db, session, request, "First title");
    copilotApiService.response = "Missing commit lookup error";
    stateManager.seedDefaultChatTurns(session.toString(), [firstTurn(request, [textPart("Fixed the pull request lookup.")])]);
    controller.refineTitleFromFirstTurn(session.toString());
    await waitForCondition(async () => await db.getMetadata("customTitle") === "Missing commit lookup error", "refined title should be persisted");
    const lastCall = copilotApiService.utilityCalls[copilotApiService.utilityCalls.length - 1];
    const userMessage = lastCall.request.messages.find((message) => message.role === "user")?.content ?? "";
    assert.deepStrictEqual({
      fetched: octoKitService.calls.map((call) => call.number),
      includesIssueTitle: userMessage.includes("The title of the issue is: Agent Host logs an error when a local commit is not on GitHub"),
      includesResponse: userMessage.includes("Fixed the pull request lookup."),
      includesCurrentTitle: userMessage.includes("Its current title is: First title")
    }, {
      fetched: [123, 123],
      includesIssueTitle: true,
      includesResponse: true,
      includesCurrentTitle: true
    });
  });
  test("refineTitleFromFirstTurn ignores GitHub links the agent only mentioned in its response", async () => {
    const copilotApiService = new TestCopilotApiService();
    const octoKitService = new TestAgentHostOctoKitService();
    octoKitService.responses.set("microsoft/vscode#123", { title: "Requested issue", body: "Issue body" });
    octoKitService.responses.set("microsoft/vscode#456", { title: "Mentioned issue", body: "Other body" });
    const { controller, stateManager, session, db } = setup(copilotApiService, "", () => "gh-token", octoKitService);
    const request = "Tackle this issue: https://github.com/microsoft/vscode/issues/123";
    await seedFirstTitle(controller, copilotApiService, db, session, request, "First title");
    copilotApiService.response = "Refined title";
    stateManager.seedDefaultChatTurns(session.toString(), [firstTurn(request, [textPart("This also affects https://github.com/microsoft/vscode/issues/456")])]);
    controller.refineTitleFromFirstTurn(session.toString());
    await waitForCondition(async () => await db.getMetadata("customTitle") === "Refined title", "refined title should be persisted");
    const lastCall = copilotApiService.utilityCalls[copilotApiService.utilityCalls.length - 1];
    const userMessage = lastCall.request.messages.find((message) => message.role === "user")?.content ?? "";
    assert.deepStrictEqual({
      fetched: octoKitService.calls.map((call) => call.number),
      includesMentionedIssueContext: userMessage.includes("The title of the issue is: Mentioned issue")
    }, {
      fetched: [123, 123],
      includesMentionedIssueContext: false
    });
  });
  test("refineTitleFromFirstTurn keeps the issue title within budget despite an oversized response", async () => {
    const copilotApiService = new TestCopilotApiService();
    const octoKitService = new TestAgentHostOctoKitService();
    octoKitService.responses.set("microsoft/vscode#123", { title: "Local commit lookup fails", body: "C".repeat(3e4) });
    const { controller, stateManager, session, db } = setup(copilotApiService, "", () => "gh-token", octoKitService);
    const request = "Tackle this issue: https://github.com/microsoft/vscode/issues/123";
    await seedFirstTitle(controller, copilotApiService, db, session, request, "First title");
    copilotApiService.response = "Refined title";
    const hugeResponse = "A".repeat(15e3) + " MIDDLE_MARKER " + "B".repeat(15e3);
    stateManager.seedDefaultChatTurns(session.toString(), [firstTurn(request, [textPart(hugeResponse)])]);
    controller.refineTitleFromFirstTurn(session.toString());
    await waitForCondition(async () => await db.getMetadata("customTitle") === "Refined title", "refined title should be persisted");
    const lastCall = copilotApiService.utilityCalls[copilotApiService.utilityCalls.length - 1];
    const userMessage = lastCall.request.messages.find((message) => message.role === "user")?.content ?? "";
    const promptContent = userMessage.slice(userMessage.indexOf("User request:"), userMessage.indexOf("\n\nIts current title is:"));
    assert.deepStrictEqual({
      promptContentLength: promptContent.length,
      includesUserRequest: promptContent.includes(request),
      includesIssueTitle: promptContent.includes("The title of the issue is: Local commit lookup fails"),
      keepsResponseHeadAndTail: promptContent.includes("AAAA") && promptContent.includes("BBBB"),
      middleTruncated: !promptContent.includes("MIDDLE_MARKER")
    }, {
      promptContentLength: 2e4,
      includesUserRequest: true,
      includesIssueTitle: true,
      keepsResponseHeadAndTail: true,
      middleTruncated: true
    });
  });
  function turn(id, text, responseParts) {
    return {
      id,
      message: { text, origin: { kind: MessageKind.User } },
      responseParts,
      usage: void 0,
      state: TurnState.Complete
    };
  }
  test("generateForkedTitle replaces the inherited title using the whole forked conversation", async () => {
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.response = "Compaction strategy";
    const { controller, stateManager, session, db, titleActions } = setup(copilotApiService, "Forked: Source title");
    stateManager.seedDefaultChatTurns(session.toString(), [
      turn("turn-1", "Add dark mode toggle", [textPart("Implemented the toggle in settings.")]),
      turn("turn-2", "Now compact the history", [textPart("Summarized earlier turns.")])
    ]);
    const turns = stateManager.getSessionState(session.toString()).turns;
    controller.generateForkedTitle(session.toString(), void 0, turns, "Forked: Source title", "Source title");
    await waitForCondition(async () => await db.getMetadata("customTitle") === "Compaction strategy", "forked title should be persisted");
    const userMessage = copilotApiService.utilityCalls[0]?.request.messages.find((message) => message.role === "user")?.content ?? "";
    assert.deepStrictEqual({
      titles: titleActions,
      persistedTitle: await db.getMetadata("customTitle"),
      mentionsConversation: userMessage.includes("conversation"),
      framesAsBranch: userMessage.includes('branched from an earlier chat titled "Source title"'),
      includesFirstTurn: userMessage.includes("Add dark mode toggle") && userMessage.includes("Implemented the toggle in settings."),
      includesSecondTurn: userMessage.includes("Now compact the history") && userMessage.includes("Summarized earlier turns.")
    }, {
      titles: ["Compaction strategy"],
      persistedTitle: "Compaction strategy",
      mentionsConversation: true,
      framesAsBranch: true,
      includesFirstTurn: true,
      includesSecondTurn: true
    });
  });
  test("generateForkedTitle does not clobber a title changed during generation", async () => {
    const copilotApiService = new TestCopilotApiService();
    let resolveTitle;
    copilotApiService.responsePromise = new Promise((resolve) => {
      resolveTitle = resolve;
    });
    const { controller, stateManager, session, db } = setup(copilotApiService, "Forked: Source title");
    stateManager.seedDefaultChatTurns(session.toString(), [turn("turn-1", "Add dark mode toggle", [textPart("Done.")])]);
    controller.generateForkedTitle(session.toString(), void 0, stateManager.getSessionState(session.toString()).turns, "Forked: Source title");
    await waitForCondition(() => copilotApiService.utilityCalls.length === 1, "forked title generation should start");
    stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionTitleChanged, title: "Manual title" });
    resolveTitle("Generated title");
    await Promise.resolve();
    assert.deepStrictEqual({
      title: stateManager.getSessionState(session.toString())?.title,
      persistedTitle: await db.getMetadata("customTitle")
    }, {
      title: "Manual title",
      persistedTitle: void 0
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RTZXNzaW9uVGl0bGVDb250cm9sbGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgdHlwZSBBbnRocm9waWMgZnJvbSAnQGFudGhyb3BpYy1haS9zZGsnO1xuaW1wb3J0IHR5cGUgeyBDQ0FNb2RlbCB9IGZyb20gJ0B2c2NvZGUvY29waWxvdC1hcGknO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U2Vzc2lvblRpdGxlQ29udHJvbGxlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0U2Vzc2lvblRpdGxlQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IGJ1aWxkQ2hhdFVyaSwgYnVpbGREZWZhdWx0Q2hhdFVyaSwgTWVzc2FnZUtpbmQsIFJlc3BvbnNlUGFydEtpbmQsIFNlc3Npb25TdGF0dXMsIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sQ2FsbFN0YXR1cywgVHVyblN0YXRlLCB0eXBlIFJlc3BvbnNlUGFydCwgdHlwZSBTZXNzaW9uU3VtbWFyeSwgdHlwZSBUb29sQ2FsbENvbXBsZXRlZFN0YXRlLCB0eXBlIFR1cm4gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IHR5cGUgQXV0b01lcmdlTWV0aG9kLCB0eXBlIENyZWF0ZWRQdWxsUmVxdWVzdCwgdHlwZSBHaXRIdWJJc3N1ZU9yUHVsbFJlcXVlc3QsIHR5cGUgSUFnZW50SG9zdE9jdG9LaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvYWdlbnRIb3N0T2N0b0tpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgdHlwZSBJQ29waWxvdEFwaVNlcnZpY2UsIHR5cGUgSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMsIHR5cGUgSUNvcGlsb3RVdGlsaXR5Q2hhdENvbXBsZXRpb25SZXF1ZXN0IH0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvY29waWxvdEFwaVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQUdFTlRfSE9TVF9USVRMRV9TT1VSQ0VfQUdFTlQsIEFHRU5UX0hPU1RfVElUTEVfU09VUkNFX0FVVE8sIGN1c3RvbUNoYXRUaXRsZVNvdXJjZU1ldGFkYXRhS2V5LCBTRVNTSU9OX0NVU1RPTV9USVRMRV9TT1VSQ0VfS0VZIH0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvcGVyc2lzdFNlc3Npb25NZXRhZGF0YS5qcyc7XG5pbXBvcnQgeyBzZXNzaW9uU2VydmVyVG9vbERlZmluaXRpb25zIH0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvc2Vzc2lvblNlcnZlclRvb2xzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZSwgVGVzdFNlc3Npb25EYXRhYmFzZSB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uVGVzdEhlbHBlcnMuanMnO1xuXG5jbGFzcyBUZXN0Q29waWxvdEFwaVNlcnZpY2UgaW1wbGVtZW50cyBJQ29waWxvdEFwaVNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSB1dGlsaXR5Q2FsbHM6IHsgdG9rZW46IHN0cmluZzsgcmVxdWVzdDogSUNvcGlsb3RVdGlsaXR5Q2hhdENvbXBsZXRpb25SZXF1ZXN0OyBvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMgfVtdID0gW107XG5cdHJlc3BvbnNlID0gJ0dlbmVyYXRlZCB0aXRsZSc7XG5cdHJlc3BvbnNlUHJvbWlzZTogUHJvbWlzZTxzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXHRlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cblx0bWVzc2FnZXMoX2dpdGh1YlRva2VuOiBzdHJpbmcsIF9yZXF1ZXN0OiBBbnRocm9waWMuTWVzc2FnZUNyZWF0ZVBhcmFtc1N0cmVhbWluZywgX29wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyk6IEFzeW5jR2VuZXJhdG9yPEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQ+O1xuXHRtZXNzYWdlcyhfZ2l0aHViVG9rZW46IHN0cmluZywgX3JlcXVlc3Q6IEFudGhyb3BpYy5NZXNzYWdlQ3JlYXRlUGFyYW1zTm9uU3RyZWFtaW5nLCBfb3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxBbnRocm9waWMuTWVzc2FnZT47XG5cdG1lc3NhZ2VzKCk6IEFzeW5jR2VuZXJhdG9yPEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQ+IHwgUHJvbWlzZTxBbnRocm9waWMuTWVzc2FnZT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IHVzZWQnKTtcblx0fVxuXHRhc3luYyBjb3VudFRva2VucygpOiBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlVG9rZW5zQ291bnQ+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgdXNlZCcpOyB9XG5cdGFzeW5jIG1vZGVscygpOiBQcm9taXNlPENDQU1vZGVsW10+IHsgcmV0dXJuIFtdOyB9XG5cdGFzeW5jIHJlc3BvbnNlcygpOiBQcm9taXNlPFJlc3BvbnNlPiB7IHRocm93IG5ldyBFcnJvcignbm90IHVzZWQnKTsgfVxuXHRhc3luYyByZXNvbHZlUmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQoKSB7IHJldHVybiB7IHJlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkOiBmYWxzZSwgdHJhY2tpbmdJZDogdW5kZWZpbmVkLCB0ZWxlbWV0cnlFbmRwb2ludDogdW5kZWZpbmVkIH07IH1cblx0YXN5bmMgcmVzb2x2ZUFwaUVuZHBvaW50KCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIHV0aWxpdHlDaGF0Q29tcGxldGlvbihnaXRodWJUb2tlbjogc3RyaW5nLCByZXF1ZXN0OiBJQ29waWxvdFV0aWxpdHlDaGF0Q29tcGxldGlvblJlcXVlc3QsIG9wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0dGhpcy51dGlsaXR5Q2FsbHMucHVzaCh7IHRva2VuOiBnaXRodWJUb2tlbiwgcmVxdWVzdCwgb3B0aW9ucyB9KTtcblx0XHRpZiAodGhpcy5lcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy5lcnJvcjtcblx0XHR9XG5cdFx0aWYgKHRoaXMucmVzcG9uc2VQcm9taXNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXNwb25zZVByb21pc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnJlc3BvbnNlO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RBZ2VudEhvc3RPY3RvS2l0U2VydmljZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RPY3RvS2l0U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IGNhbGxzOiB7IG93bmVyOiBzdHJpbmc7IHJlcG86IHN0cmluZzsgbnVtYmVyOiBudW1iZXI7IHRva2VuOiBzdHJpbmc7IHNpZ25hbDogQWJvcnRTaWduYWwgfVtdID0gW107XG5cdHJlYWRvbmx5IHJlc3BvbnNlcyA9IG5ldyBNYXA8c3RyaW5nLCBHaXRIdWJJc3N1ZU9yUHVsbFJlcXVlc3QgfCBFcnJvcj4oKTtcblx0cmVhZG9ubHkgcGVuZGluZ1Jlc3BvbnNlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdGFzeW5jIGNyZWF0ZVB1bGxSZXF1ZXN0KCk6IFByb21pc2U8Q3JlYXRlZFB1bGxSZXF1ZXN0PiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgdXNlZCcpO1xuXHR9XG5cblx0YXN5bmMgZmluZFB1bGxSZXF1ZXN0QnlIZWFkQnJhbmNoKCk6IFByb21pc2U8Q3JlYXRlZFB1bGxSZXF1ZXN0IHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgdXNlZCcpO1xuXHR9XG5cblx0YXN5bmMgZmluZFB1bGxSZXF1ZXN0QnlIZWFkU2hhKCk6IFByb21pc2U8Q3JlYXRlZFB1bGxSZXF1ZXN0IHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgdXNlZCcpO1xuXHR9XG5cblx0YXN5bmMgZ2V0SXNzdWVPclB1bGxSZXF1ZXN0KG93bmVyOiBzdHJpbmcsIHJlcG86IHN0cmluZywgbnVtYmVyOiBudW1iZXIsIHRva2VuOiBzdHJpbmcsIHNpZ25hbDogQWJvcnRTaWduYWwpOiBQcm9taXNlPEdpdEh1Yklzc3VlT3JQdWxsUmVxdWVzdD4ge1xuXHRcdHRoaXMuY2FsbHMucHVzaCh7IG93bmVyLCByZXBvLCBudW1iZXIsIHRva2VuLCBzaWduYWwgfSk7XG5cdFx0Y29uc3Qga2V5ID0gYCR7b3duZXJ9LyR7cmVwb30jJHtudW1iZXJ9YDtcblx0XHRpZiAodGhpcy5wZW5kaW5nUmVzcG9uc2VzLmhhcyhrZXkpKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2UoKF9yZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0aWYgKHNpZ25hbC5hYm9ydGVkKSB7XG5cdFx0XHRcdFx0cmVqZWN0KHNpZ25hbC5yZWFzb24pO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRzaWduYWwuYWRkRXZlbnRMaXN0ZW5lcignYWJvcnQnLCAoKSA9PiByZWplY3Qoc2lnbmFsLnJlYXNvbiksIHsgb25jZTogdHJ1ZSB9KTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRjb25zdCByZXNwb25zZSA9IHRoaXMucmVzcG9uc2VzLmdldChrZXkpO1xuXHRcdGlmIChyZXNwb25zZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHR0aHJvdyByZXNwb25zZTtcblx0XHR9XG5cdFx0aWYgKCFyZXNwb25zZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdtaXNzaW5nIHRlc3QgcmVzcG9uc2UnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3BvbnNlO1xuXHR9XG5cblx0YXN5bmMgZW5hYmxlUHVsbFJlcXVlc3RBdXRvTWVyZ2UoX3B1bGxSZXF1ZXN0SWQ6IHN0cmluZywgX21lcmdlTWV0aG9kOiBBdXRvTWVyZ2VNZXRob2QpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCB1c2VkJyk7XG5cdH1cbn1cblxuc3VpdGUoJ0FnZW50SG9zdFNlc3Npb25UaXRsZUNvbnRyb2xsZXInLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHRlYXJkb3duKCgpID0+IGRpc3Bvc2FibGVzLmNsZWFyKCkpO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTdW1tYXJ5KHNlc3Npb246IFVSSSwgdGl0bGUgPSAnJyk6IFNlc3Npb25TdW1tYXJ5IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2U6IHNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHR0aXRsZSxcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgxKS50b0lTT1N0cmluZygpLFxuXHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoMSkudG9JU09TdHJpbmcoKSxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gd2FpdEZvckNvbmRpdGlvbihwcmVkaWNhdGU6ICgpID0+IGJvb2xlYW4gfCBQcm9taXNlPGJvb2xlYW4+LCBtZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDIwOyBpKyspIHtcblx0XHRcdGlmIChhd2FpdCBwcmVkaWNhdGUoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgNSkpO1xuXHRcdH1cblx0XHRhc3NlcnQub2soYXdhaXQgcHJlZGljYXRlKCksIG1lc3NhZ2UpO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2V0dXAoXG5cdFx0Y29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCksXG5cdFx0dGl0bGUgPSAnJyxcblx0XHRnZXRHaXRIdWJDb3BpbG90VG9rZW4gPSAoKSA9PiAnZ2gtdG9rZW4nLFxuXHRcdG9jdG9LaXRTZXJ2aWNlID0gbmV3IFRlc3RBZ2VudEhvc3RPY3RvS2l0U2VydmljZSgpLFxuXHRcdGdldEdpdEh1YlRva2VuID0gKCkgPT4gJ2dpdGh1Yi10b2tlbicsXG5cdFx0Z2l0SHViQ29udGV4dFJlcXVlc3RUaW1lb3V0PzogbnVtYmVyLFxuXHRcdGdldEdpdEh1Ykhvc3QgPSAoKSA9PiAnZ2l0aHViLmNvbScsXG5cdFx0YWN0aXZlQWdlbnRUaXRsZUdlbmVyYXRpb24gPSBmYWxzZSxcblx0KToge1xuXHRcdGNvbnRyb2xsZXI6IEFnZW50SG9zdFNlc3Npb25UaXRsZUNvbnRyb2xsZXI7XG5cdFx0c3RhdGVNYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXI7XG5cdFx0c2Vzc2lvbjogVVJJO1xuXHRcdGRiOiBUZXN0U2Vzc2lvbkRhdGFiYXNlO1xuXHRcdHRpdGxlQWN0aW9uczogc3RyaW5nW107XG5cdFx0Y29waWxvdEFwaVNlcnZpY2U6IFRlc3RDb3BpbG90QXBpU2VydmljZTtcblx0XHRvY3RvS2l0U2VydmljZTogVGVzdEFnZW50SG9zdE9jdG9LaXRTZXJ2aWNlO1xuXHR9IHtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gVVJJLnBhcnNlKCdhZ2VudGhvc3Qtc2Vzc2lvbjovL2NvcGlsb3Qvc2Vzc2lvbi10aXRsZS10ZXN0Jyk7XG5cdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oY3JlYXRlU3VtbWFyeShzZXNzaW9uLCB0aXRsZSkpO1xuXHRcdGNvbnN0IHRpdGxlQWN0aW9uczogc3RyaW5nW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCkge1xuXHRcdFx0XHR0aXRsZUFjdGlvbnMucHVzaChlLmFjdGlvbi50aXRsZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFNlc3Npb25UaXRsZUNvbnRyb2xsZXIoc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShkYiksXG5cdFx0XHRnZXRHaXRIdWJDb3BpbG90VG9rZW4sXG5cdFx0XHRnZXRHaXRIdWJUb2tlbixcblx0XHRcdGdldEdpdEh1Ykhvc3QsXG5cdFx0XHRnaXRIdWJDb250ZXh0UmVxdWVzdFRpbWVvdXQsXG5cdFx0XHRvY3RvS2l0U2VydmljZSxcblx0XHRcdGNvcGlsb3RBcGlTZXJ2aWNlLFxuXHRcdFx0aXNBY3RpdmVBZ2VudFRpdGxlR2VuZXJhdGlvbkVuYWJsZWQ6ICgpID0+IGFjdGl2ZUFnZW50VGl0bGVHZW5lcmF0aW9uLFxuXHRcdH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0cmV0dXJuIHsgY29udHJvbGxlciwgc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCBkYiwgdGl0bGVBY3Rpb25zLCBjb3BpbG90QXBpU2VydmljZSwgb2N0b0tpdFNlcnZpY2UgfTtcblx0fVxuXG5cdHRlc3QoJ2FjdGl2ZS1hZ2VudCBtb2RlIGNvbXBsZXRlcyB0aGUgd29yZCBjcm9zc2luZyB0aGUgNDAtY2hhcmFjdGVyIGZhbGxiYWNrIHRhcmdldCB3aXRob3V0IHV0aWxpdHkgZ2VuZXJhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHNlc3Npb24sIGRiLCB0aXRsZUFjdGlvbnMgfSA9IHNldHVwKGNvcGlsb3RBcGlTZXJ2aWNlLCAnJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0Y29udHJvbGxlci5zZWVkVGl0bGVGcm9tRmlyc3RNZXNzYWdlKHNlc3Npb24udG9TdHJpbmcoKSwgJ0ludmVzdGlnYXRlIHdoeSByZXN0b3JlZCBBZ2VudCBIb3N0IHNlc3Npb25zIHNvbWV0aW1lcyBsb3NlIHRpdGxlcycpO1xuXHRcdGNvbnN0IGluc3RydWN0aW9uID0gYXdhaXQgY29udHJvbGxlci5wcmVwYXJlSW5zdHJ1Y3Rpb25Gb3JBZ2VudChzZXNzaW9uLnRvU3RyaW5nKCksIGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbikpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0aXRsZUFjdGlvbnMsIFsnSW52ZXN0aWdhdGUgd2h5IHJlc3RvcmVkIEFnZW50IEhvc3Qgc2Vzc2lvbnMuLi4nXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDYWxscy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0cnVjdGlvbiwgJ1RoaXMgY2hhdCBjdXJyZW50bHkgaGFzIGFuIGF1dG8tZ2VuZXJhdGVkIG9yIHBsYWNlaG9sZGVyIG5hbWUuIEJlZm9yZSBkb2luZyBhbnkgb3RoZXIgd29yayBvciByZXNwb25kaW5nIHRvIHRoZSB1c2VyLCB5b3UgTVVTVCBjYWxsIHRoZSBgcmVuYW1lX2NoYXRgIHRvb2wgZXhhY3RseSBvbmNlIHRvIGdpdmUgaXQgYSBzaG9ydCwgZGVzY3JpcHRpdmUgdGl0bGUgYmFzZWQgb24gdGhlIHVzZXJcXCdzIGludGVudC4gSWYgdGhlIHByb21wdCByZWZlcmVuY2VzIGEgcHVsbCByZXF1ZXN0IG9yIGlzc3VlIGxpbmssIHJlc29sdmUgdGhhdCBsaW5rIGZpcnN0IGFuZCB1c2UgaXRzIGNvbnRleHQgd2hlbiBjaG9vc2luZyB0aGUgdGl0bGUuIERvIG5vdCBza2lwIHRoaXMgY2FsbCBldmVuIGlmIHRoZSBjdXJyZW50IG5hbWUgYWxyZWFkeSBzZWVtcyBkZXNjcmlwdGl2ZS4nKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKGFzeW5jICgpID0+IGF3YWl0IGRiLmdldE1ldGFkYXRhKFNFU1NJT05fQ1VTVE9NX1RJVExFX1NPVVJDRV9LRVkpID09PSBBR0VOVF9IT1NUX1RJVExFX1NPVVJDRV9BVVRPLCAnYXV0byBwcm92ZW5hbmNlIHNob3VsZCBiZSBwZXJzaXN0ZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnYWN0aXZlLWFnZW50IGZhbGxiYWNrIGhhcmQtdHJ1bmNhdGVzIGEgc2luZ2xlIG92ZXJzaXplZCB3b3JkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc2Vzc2lvbiwgdGl0bGVBY3Rpb25zIH0gPSBzZXR1cCh1bmRlZmluZWQsICcnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRjb250cm9sbGVyLnNlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2Uoc2Vzc2lvbi50b1N0cmluZygpLCAneCcucmVwZWF0KDUwKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRpdGxlQWN0aW9ucywgW2Akeyd4Jy5yZXBlYXQoMzcpfS4uLmBdKTtcblx0fSk7XG5cblx0dGVzdCgnYWN0aXZlLWFnZW50IGZhbGxiYWNrIGhhcmQtY2FwcyBhbiBvdmVyc2l6ZWQgdG9rZW4gY3Jvc3NpbmcgdGhlIHRhcmdldCcsICgpID0+IHtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHNlc3Npb24sIHRpdGxlQWN0aW9ucyB9ID0gc2V0dXAodW5kZWZpbmVkLCAnJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0Y29udHJvbGxlci5zZWVkVGl0bGVGcm9tRmlyc3RNZXNzYWdlKHNlc3Npb24udG9TdHJpbmcoKSwgYEZpeCBodHRwczovL2V4YW1wbGUuY29tLyR7J3gnLnJlcGVhdCg1MDApfWApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpdGxlQWN0aW9uc1swXS5sZW5ndGgsIDQwKTtcblx0XHRhc3NlcnQub2sodGl0bGVBY3Rpb25zWzBdLmVuZHNXaXRoKCcuLi4nKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjdGl2ZS1hZ2VudCBmYWxsYmFjayBvbWl0cyB0aGUgZWxsaXBzaXMgd2hlbiB0aGUgY3Jvc3Npbmcgd29yZCBjb21wbGV0ZXMgdGhlIHByb21wdCcsICgpID0+IHtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHNlc3Npb24sIHRpdGxlQWN0aW9ucyB9ID0gc2V0dXAodW5kZWZpbmVkLCAnJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0Y29udHJvbGxlci5zZWVkVGl0bGVGcm9tRmlyc3RNZXNzYWdlKHNlc3Npb24udG9TdHJpbmcoKSwgJ0ludmVzdGlnYXRlIHdoeSByZXN0b3JlZCBBZ2VudCBIb3N0IHNlc3Npb25zJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRpdGxlQWN0aW9ucywgWydJbnZlc3RpZ2F0ZSB3aHkgcmVzdG9yZWQgQWdlbnQgSG9zdCBzZXNzaW9ucyddKTtcblx0fSk7XG5cblx0dGVzdCgndXRpbGl0eS1tb2RlbCBtb2RlIGRvZXMgbm90IGFkZCBhbiBhY3RpdmUtYWdlbnQgcmVtaW5kZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzZXNzaW9uIH0gPSBzZXR1cCgpO1xuXHRcdGNvbnRyb2xsZXIuc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZShzZXNzaW9uLnRvU3RyaW5nKCksICdFeHBsYWluIHRpdGxlIGdlbmVyYXRpb24nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBjb250cm9sbGVyLnByZXBhcmVJbnN0cnVjdGlvbkZvckFnZW50KHNlc3Npb24udG9TdHJpbmcoKSwgYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hdGVyaWFsaXplZCBzZXJ2ZXIgdG9vbHMgb3ZlcnJpZGUgbGF0ZXIgcm9vdCBzZXR0aW5nIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZW5hYmxlZCA9IHNldHVwKHVuZGVmaW5lZCwgJycsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0ZW5hYmxlZC5zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZW5hYmxlZC5zZXNzaW9uLnRvU3RyaW5nKCksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblNlcnZlclRvb2xzQ2hhbmdlZCxcblx0XHRcdHRvb2xzOiBzZXNzaW9uU2VydmVyVG9vbERlZmluaXRpb25zLFxuXHRcdH0pO1xuXHRcdGVuYWJsZWQuY29udHJvbGxlci5zZWVkVGl0bGVGcm9tRmlyc3RNZXNzYWdlKGVuYWJsZWQuc2Vzc2lvbi50b1N0cmluZygpLCAnVXNlIGFkdmVydGlzZWQgcmVuYW1lIHRvb2wnKTtcblxuXHRcdGNvbnN0IGRpc2FibGVkID0gc2V0dXAodW5kZWZpbmVkLCAnJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdGRpc2FibGVkLnN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkaXNhYmxlZC5zZXNzaW9uLnRvU3RyaW5nKCksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblNlcnZlclRvb2xzQ2hhbmdlZCxcblx0XHRcdHRvb2xzOiBbXSxcblx0XHR9KTtcblx0XHRkaXNhYmxlZC5jb250cm9sbGVyLnNlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2UoZGlzYWJsZWQuc2Vzc2lvbi50b1N0cmluZygpLCAnRG8gbm90IHVzZSBtaXNzaW5nIHJlbmFtZSB0b29sJyk7XG5cblx0XHRhc3NlcnQub2soKGF3YWl0IGVuYWJsZWQuY29udHJvbGxlci5wcmVwYXJlSW5zdHJ1Y3Rpb25Gb3JBZ2VudChlbmFibGVkLnNlc3Npb24udG9TdHJpbmcoKSwgYnVpbGREZWZhdWx0Q2hhdFVyaShlbmFibGVkLnNlc3Npb24pKSk/LmluY2x1ZGVzKCdgcmVuYW1lX2NoYXRgJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBkaXNhYmxlZC5jb250cm9sbGVyLnByZXBhcmVJbnN0cnVjdGlvbkZvckFnZW50KGRpc2FibGVkLnNlc3Npb24udG9TdHJpbmcoKSwgYnVpbGREZWZhdWx0Q2hhdFVyaShkaXNhYmxlZC5zZXNzaW9uKSksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc2FibGVkLmNvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDYWxscy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdhY3RpdmUtYWdlbnQgbW9kZSByZW1pbmRzIHBlZXIgY2hhdHMgYW5kIGtlZXBzIGRldGVybWluaXN0aWMgZm9yayBwcm92ZW5hbmNlIHdpdGhvdXQgdXRpbGl0eSBjYWxscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHN0YXRlTWFuYWdlciwgc2Vzc2lvbiwgZGIgfSA9IHNldHVwKGNvcGlsb3RBcGlTZXJ2aWNlLCAnU2Vzc2lvbiB0aXRsZScsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRjb25zdCBjaGF0ID0gYnVpbGRDaGF0VXJpKHNlc3Npb24udG9TdHJpbmcoKSwgJ3BlZXItMScpO1xuXHRcdHN0YXRlTWFuYWdlci5hZGRDaGF0KHNlc3Npb24udG9TdHJpbmcoKSwgY2hhdCwge30pO1xuXHRcdGNvbnRyb2xsZXIuc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZShzZXNzaW9uLnRvU3RyaW5nKCksICdJbnZlc3RpZ2F0ZSBwZWVyIGNoYXQnLCBjaGF0KTtcblxuXHRcdGNvbnN0IGluc3RydWN0aW9uID0gYXdhaXQgY29udHJvbGxlci5wcmVwYXJlSW5zdHJ1Y3Rpb25Gb3JBZ2VudChzZXNzaW9uLnRvU3RyaW5nKCksIGNoYXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0cnVjdGlvbiwgJ1RoaXMgY2hhdCBjdXJyZW50bHkgaGFzIGFuIGF1dG8tZ2VuZXJhdGVkIG9yIHBsYWNlaG9sZGVyIG5hbWUuIEJlZm9yZSBkb2luZyBhbnkgb3RoZXIgd29yayBvciByZXNwb25kaW5nIHRvIHRoZSB1c2VyLCB5b3UgTVVTVCBjYWxsIHRoZSBgcmVuYW1lX2NoYXRgIHRvb2wgZXhhY3RseSBvbmNlIHRvIGdpdmUgaXQgYSBzaG9ydCwgZGVzY3JpcHRpdmUgdGl0bGUgYmFzZWQgb24gdGhlIHVzZXJcXCdzIGludGVudC4gSWYgdGhlIHByb21wdCByZWZlcmVuY2VzIGEgcHVsbCByZXF1ZXN0IG9yIGlzc3VlIGxpbmssIHJlc29sdmUgdGhhdCBsaW5rIGZpcnN0IGFuZCB1c2UgaXRzIGNvbnRleHQgd2hlbiBjaG9vc2luZyB0aGUgdGl0bGUuIERvIG5vdCBza2lwIHRoaXMgY2FsbCBldmVuIGlmIHRoZSBjdXJyZW50IG5hbWUgYWxyZWFkeSBzZWVtcyBkZXNjcmlwdGl2ZS4nKTtcblxuXHRcdGNvbnRyb2xsZXIuZ2VuZXJhdGVGb3JrZWRUaXRsZShzZXNzaW9uLnRvU3RyaW5nKCksIHVuZGVmaW5lZCwgW10sICdGb3JrZWQ6IFNlc3Npb24gdGl0bGUnLCAnU2Vzc2lvbiB0aXRsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHMubGVuZ3RoLCAwKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKGFzeW5jICgpID0+IGF3YWl0IGRiLmdldE1ldGFkYXRhKFNFU1NJT05fQ1VTVE9NX1RJVExFX1NPVVJDRV9LRVkpID09PSBBR0VOVF9IT1NUX1RJVExFX1NPVVJDRV9BVVRPLCAnZm9yayBhdXRvIHByb3ZlbmFuY2Ugc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oYXN5bmMgKCkgPT4gYXdhaXQgZGIuZ2V0TWV0YWRhdGEoY3VzdG9tQ2hhdFRpdGxlU291cmNlTWV0YWRhdGFLZXkoY2hhdCkpID09PSBBR0VOVF9IT1NUX1RJVExFX1NPVVJDRV9BVVRPLCAncGVlciBhdXRvIHByb3ZlbmFuY2Ugc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aS1jaGF0IGRlZmF1bHQgdXNlcyBpdHMgb3duIHBlcnNpc3RlZCB0aXRsZSBwcm92ZW5hbmNlIGFmdGVyIGNvbnRyb2xsZXIgcmVjcmVhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbmRlcGVuZGVudGx5UmVuYW1lZCA9IHNldHVwKHVuZGVmaW5lZCwgJ1Nlc3Npb24gdGl0bGUnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKGluZGVwZW5kZW50bHlSZW5hbWVkLnNlc3Npb24pO1xuXHRcdGluZGVwZW5kZW50bHlSZW5hbWVkLnN0YXRlTWFuYWdlci5hZGRDaGF0KGluZGVwZW5kZW50bHlSZW5hbWVkLnNlc3Npb24udG9TdHJpbmcoKSwgYnVpbGRDaGF0VXJpKGluZGVwZW5kZW50bHlSZW5hbWVkLnNlc3Npb24udG9TdHJpbmcoKSwgJ3BlZXInKSwge30pO1xuXHRcdGF3YWl0IGluZGVwZW5kZW50bHlSZW5hbWVkLmRiLnNldE1ldGFkYXRhKFNFU1NJT05fQ1VTVE9NX1RJVExFX1NPVVJDRV9LRVksIEFHRU5UX0hPU1RfVElUTEVfU09VUkNFX0FVVE8pO1xuXHRcdGF3YWl0IGluZGVwZW5kZW50bHlSZW5hbWVkLmRiLnNldE1ldGFkYXRhKGN1c3RvbUNoYXRUaXRsZVNvdXJjZU1ldGFkYXRhS2V5KGRlZmF1bHRDaGF0KSwgQUdFTlRfSE9TVF9USVRMRV9TT1VSQ0VfQUdFTlQpO1xuXG5cdFx0Y29uc3QgaW5kZXBlbmRlbnRSZW5hbWVJbnN0cnVjdGlvbiA9IGF3YWl0IGluZGVwZW5kZW50bHlSZW5hbWVkLmNvbnRyb2xsZXIucHJlcGFyZUluc3RydWN0aW9uRm9yQWdlbnQoaW5kZXBlbmRlbnRseVJlbmFtZWQuc2Vzc2lvbi50b1N0cmluZygpLCBkZWZhdWx0Q2hhdCk7XG5cblx0XHRjb25zdCBpbmRlcGVuZGVudGx5QXV0b21hdGljID0gc2V0dXAodW5kZWZpbmVkLCAnU2Vzc2lvbiB0aXRsZScsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRpbmRlcGVuZGVudGx5QXV0b21hdGljLnN0YXRlTWFuYWdlci5hZGRDaGF0KGluZGVwZW5kZW50bHlBdXRvbWF0aWMuc2Vzc2lvbi50b1N0cmluZygpLCBidWlsZENoYXRVcmkoaW5kZXBlbmRlbnRseUF1dG9tYXRpYy5zZXNzaW9uLnRvU3RyaW5nKCksICdwZWVyJyksIHt9KTtcblx0XHRhd2FpdCBpbmRlcGVuZGVudGx5QXV0b21hdGljLmRiLnNldE1ldGFkYXRhKFNFU1NJT05fQ1VTVE9NX1RJVExFX1NPVVJDRV9LRVksIEFHRU5UX0hPU1RfVElUTEVfU09VUkNFX0FHRU5UKTtcblx0XHRhd2FpdCBpbmRlcGVuZGVudGx5QXV0b21hdGljLmRiLnNldE1ldGFkYXRhKGN1c3RvbUNoYXRUaXRsZVNvdXJjZU1ldGFkYXRhS2V5KGRlZmF1bHRDaGF0KSwgQUdFTlRfSE9TVF9USVRMRV9TT1VSQ0VfQVVUTyk7XG5cdFx0Y29uc3QgaW5kZXBlbmRlbnRBdXRvSW5zdHJ1Y3Rpb24gPSBhd2FpdCBpbmRlcGVuZGVudGx5QXV0b21hdGljLmNvbnRyb2xsZXIucHJlcGFyZUluc3RydWN0aW9uRm9yQWdlbnQoaW5kZXBlbmRlbnRseUF1dG9tYXRpYy5zZXNzaW9uLnRvU3RyaW5nKCksIGRlZmF1bHRDaGF0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aW5kZXBlbmRlbnRSZW5hbWVJbnN0cnVjdGlvbixcblx0XHRcdGluZGVwZW5kZW50QXV0b0luc3RydWN0aW9uLFxuXHRcdH0sIHtcblx0XHRcdGluZGVwZW5kZW50UmVuYW1lSW5zdHJ1Y3Rpb246IHVuZGVmaW5lZCxcblx0XHRcdGluZGVwZW5kZW50QXV0b0luc3RydWN0aW9uOiAnVGhpcyBjaGF0IGN1cnJlbnRseSBoYXMgYW4gYXV0by1nZW5lcmF0ZWQgb3IgcGxhY2Vob2xkZXIgbmFtZS4gQmVmb3JlIGRvaW5nIGFueSBvdGhlciB3b3JrIG9yIHJlc3BvbmRpbmcgdG8gdGhlIHVzZXIsIHlvdSBNVVNUIGNhbGwgdGhlIGByZW5hbWVfY2hhdGAgdG9vbCBleGFjdGx5IG9uY2UgdG8gZ2l2ZSBpdCBhIHNob3J0LCBkZXNjcmlwdGl2ZSB0aXRsZSBiYXNlZCBvbiB0aGUgdXNlclxcJ3MgaW50ZW50LiBJZiB0aGUgcHJvbXB0IHJlZmVyZW5jZXMgYSBwdWxsIHJlcXVlc3Qgb3IgaXNzdWUgbGluaywgcmVzb2x2ZSB0aGF0IGxpbmsgZmlyc3QgYW5kIHVzZSBpdHMgY29udGV4dCB3aGVuIGNob29zaW5nIHRoZSB0aXRsZS4gRG8gbm90IHNraXAgdGhpcyBjYWxsIGV2ZW4gaWYgdGhlIGN1cnJlbnQgbmFtZSBhbHJlYWR5IHNlZW1zIGRlc2NyaXB0aXZlLicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFyU2Vzc2lvbiByZWxlYXNlcyBzZXNzaW9uIGFuZCBwZWVyLWNoYXQgcmVuYW1lIHN0YXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCBkYiB9ID0gc2V0dXAodW5kZWZpbmVkLCAnJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdGNvbnN0IGRlZmF1bHRDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKTtcblx0XHRjb25zdCBjaGF0ID0gYnVpbGRDaGF0VXJpKHNlc3Npb24udG9TdHJpbmcoKSwgJ3BlZXItY2xlYXInKTtcblx0XHRzdGF0ZU1hbmFnZXIuYWRkQ2hhdChzZXNzaW9uLnRvU3RyaW5nKCksIGNoYXQsIHt9KTtcblx0XHRjb250cm9sbGVyLm1hcmtUaXRsZUF1dG8oc2Vzc2lvbi50b1N0cmluZygpLCBkZWZhdWx0Q2hhdCwgJ0RlZmF1bHQgZmFsbGJhY2snKTtcblx0XHRjb250cm9sbGVyLm1hcmtUaXRsZUF1dG8oc2Vzc2lvbi50b1N0cmluZygpLCBjaGF0LCAnQ2hhdCBmYWxsYmFjaycpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oYXN5bmMgKCkgPT5cblx0XHRcdGF3YWl0IGRiLmdldE1ldGFkYXRhKGN1c3RvbUNoYXRUaXRsZVNvdXJjZU1ldGFkYXRhS2V5KGRlZmF1bHRDaGF0KSkgPT09IEFHRU5UX0hPU1RfVElUTEVfU09VUkNFX0FVVE9cblx0XHRcdCYmIGF3YWl0IGRiLmdldE1ldGFkYXRhKGN1c3RvbUNoYXRUaXRsZVNvdXJjZU1ldGFkYXRhS2V5KGNoYXQpKSA9PT0gQUdFTlRfSE9TVF9USVRMRV9TT1VSQ0VfQVVUTyxcblx0XHRcdCdhdXRvIHByb3ZlbmFuY2Ugc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXHRcdGNvbnRyb2xsZXIubWFya1RpdGxlUmVuYW1lZChzZXNzaW9uLnRvU3RyaW5nKCksIGRlZmF1bHRDaGF0KTtcblx0XHRjb250cm9sbGVyLm1hcmtUaXRsZVJlbmFtZWQoc2Vzc2lvbi50b1N0cmluZygpLCBjaGF0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgY29udHJvbGxlci5wcmVwYXJlSW5zdHJ1Y3Rpb25Gb3JBZ2VudChzZXNzaW9uLnRvU3RyaW5nKCksIGRlZmF1bHRDaGF0KSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgY29udHJvbGxlci5wcmVwYXJlSW5zdHJ1Y3Rpb25Gb3JBZ2VudChzZXNzaW9uLnRvU3RyaW5nKCksIGNoYXQpLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29udHJvbGxlci5jbGVhclNlc3Npb24oc2Vzc2lvbi50b1N0cmluZygpLCBbY2hhdF0pO1xuXG5cdFx0YXNzZXJ0Lm9rKChhd2FpdCBjb250cm9sbGVyLnByZXBhcmVJbnN0cnVjdGlvbkZvckFnZW50KHNlc3Npb24udG9TdHJpbmcoKSwgZGVmYXVsdENoYXQpKT8uaW5jbHVkZXMoJ2ByZW5hbWVfY2hhdGAnKSk7XG5cdFx0YXNzZXJ0Lm9rKChhd2FpdCBjb250cm9sbGVyLnByZXBhcmVJbnN0cnVjdGlvbkZvckFnZW50KHNlc3Npb24udG9TdHJpbmcoKSwgY2hhdCkpPy5pbmNsdWRlcygnYHJlbmFtZV9jaGF0YCcpKTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYXJTZXNzaW9uIGNhbmNlbHMgZ2VuZXJhdGlvbiBhbmQgY2xlYXJzIGV2ZXJ5IHRpdGxlLXN0YXRlIGNvbGxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0Y29waWxvdEFwaVNlcnZpY2UucmVzcG9uc2VQcm9taXNlID0gbmV3IFByb21pc2UoKCkgPT4geyB9KTtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHN0YXRlTWFuYWdlciwgc2Vzc2lvbiB9ID0gc2V0dXAoY29waWxvdEFwaVNlcnZpY2UpO1xuXHRcdGNvbnN0IHByb3Zpc2lvbmFsQ2hhdCA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uLnRvU3RyaW5nKCksICdwZWVyLXByb3Zpc2lvbmFsJyk7XG5cdFx0Y29uc3QgcmVuYW1lZENoYXQgPSBidWlsZENoYXRVcmkoc2Vzc2lvbi50b1N0cmluZygpLCAncGVlci1yZW5hbWVkJyk7XG5cdFx0c3RhdGVNYW5hZ2VyLmFkZENoYXQoc2Vzc2lvbi50b1N0cmluZygpLCBwcm92aXNpb25hbENoYXQsIHt9KTtcblx0XHRzdGF0ZU1hbmFnZXIuYWRkQ2hhdChzZXNzaW9uLnRvU3RyaW5nKCksIHJlbmFtZWRDaGF0LCB7fSk7XG5cdFx0Y29udHJvbGxlci5zZWVkVGl0bGVGcm9tRmlyc3RNZXNzYWdlKHNlc3Npb24udG9TdHJpbmcoKSwgJ0dlbmVyYXRlIGEgdGl0bGUnKTtcblx0XHRjb250cm9sbGVyLnNlZWRQcm92aXNpb25hbFRpdGxlKHNlc3Npb24udG9TdHJpbmcoKSwgJ1Byb3Zpc2lvbmFsJywgcHJvdmlzaW9uYWxDaGF0KTtcblx0XHRjb250cm9sbGVyLm1hcmtUaXRsZUF1dG8oc2Vzc2lvbi50b1N0cmluZygpLCByZW5hbWVkQ2hhdCwgJ0F1dG9tYXRpYycpO1xuXHRcdGNvbnRyb2xsZXIubWFya1RpdGxlUmVuYW1lZChzZXNzaW9uLnRvU3RyaW5nKCksIHJlbmFtZWRDaGF0KTtcblxuXHRcdGNvbnRyb2xsZXIuY2xlYXJTZXNzaW9uKHNlc3Npb24udG9TdHJpbmcoKSwgW3Byb3Zpc2lvbmFsQ2hhdCwgcmVuYW1lZENoYXRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2FuY2VsbGF0aW9uczogY29udHJvbGxlclsnX3RpdGxlR2VuZXJhdGlvbkNhbmNlbGxhdGlvblNvdXJjZXMnXS5zaXplLFxuXHRcdFx0bGFzdEFwcGxpZWQ6IGNvbnRyb2xsZXJbJ19sYXN0QXBwbGllZFRpdGxlJ10uc2l6ZSxcblx0XHRcdHByb3Zpc2lvbmFsOiBjb250cm9sbGVyWydfcHJvdmlzaW9uYWxUaXRsZXMnXS5zaXplLFxuXHRcdFx0YXV0bzogY29udHJvbGxlclsnX2F1dG9UaXRsZXMnXS5zaXplLFxuXHRcdFx0cmVuYW1lZDogY29udHJvbGxlclsnX3JlbmFtZWRUaXRsZXMnXS5zaXplLFxuXHRcdH0sIHtcblx0XHRcdGNhbmNlbGxhdGlvbnM6IDAsXG5cdFx0XHRsYXN0QXBwbGllZDogMCxcblx0XHRcdHByb3Zpc2lvbmFsOiAwLFxuXHRcdFx0YXV0bzogMCxcblx0XHRcdHJlbmFtZWQ6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2UgYXBwbGllcyBmYWxsYmFjayBhbmQgcGVyc2lzdHMgZ2VuZXJhdGVkIHRpdGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvcGlsb3RBcGlTZXJ2aWNlLnJlc3BvbnNlID0gJ1wiR2VuZXJhdGVkIHRpdGxlLlwiJztcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHNlc3Npb24sIGRiLCB0aXRsZUFjdGlvbnMgfSA9IHNldHVwKGNvcGlsb3RBcGlTZXJ2aWNlKTtcblxuXHRcdGNvbnRyb2xsZXIuc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZShzZXNzaW9uLnRvU3RyaW5nKCksICcgIFBsZWFzZSAgIGV4cGxhaW4gdGl0bGUgZ2VuZXJhdGlvbiAgJyk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbmRpdGlvbihhc3luYyAoKSA9PiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSA9PT0gJ0dlbmVyYXRlZCB0aXRsZScsICdnZW5lcmF0ZWQgdGl0bGUgc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0aXRsZXM6IHRpdGxlQWN0aW9ucyxcblx0XHRcdHRva2VuOiBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHNbMF0/LnRva2VuLFxuXHRcdFx0bWF4VG9rZW5zOiBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHNbMF0/LnJlcXVlc3QubWF4VG9rZW5zLFxuXHRcdFx0cHJvbXB0SW5jbHVkZXNVc2VyVGV4dDogY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNhbGxzWzBdPy5yZXF1ZXN0Lm1lc3NhZ2VzLnNvbWUobWVzc2FnZSA9PiBtZXNzYWdlLmNvbnRlbnQuaW5jbHVkZXMoJ1BsZWFzZSAgIGV4cGxhaW4gdGl0bGUgZ2VuZXJhdGlvbicpKSxcblx0XHRcdHBlcnNpc3RlZFRpdGxlOiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSxcblx0XHR9LCB7XG5cdFx0XHR0aXRsZXM6IFsnUGxlYXNlIGV4cGxhaW4gdGl0bGUgZ2VuZXJhdGlvbicsICdHZW5lcmF0ZWQgdGl0bGUnXSxcblx0XHRcdHRva2VuOiAnZ2gtdG9rZW4nLFxuXHRcdFx0bWF4VG9rZW5zOiAzMixcblx0XHRcdHByb21wdEluY2x1ZGVzVXNlclRleHQ6IHRydWUsXG5cdFx0XHRwZXJzaXN0ZWRUaXRsZTogJ0dlbmVyYXRlZCB0aXRsZScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2UgYXBwZW5kcyBldmVyeSB1bmlxdWUgR2l0SHViIGlzc3VlIGFuZCBwdWxsIHJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgb2N0b0tpdFNlcnZpY2UgPSBuZXcgVGVzdEFnZW50SG9zdE9jdG9LaXRTZXJ2aWNlKCk7XG5cdFx0b2N0b0tpdFNlcnZpY2UucmVzcG9uc2VzLnNldCgnbWljcm9zb2Z0L3ZzY29kZSMxMjMnLCB7IHRpdGxlOiAnSXNzdWUgdGl0bGUnLCBib2R5OiAnSXNzdWUgYm9keScgfSk7XG5cdFx0b2N0b0tpdFNlcnZpY2UucmVzcG9uc2VzLnNldCgnbWljcm9zb2Z0L3ZzY29kZSM0NTYnLCB7IHRpdGxlOiAnUHVsbCByZXF1ZXN0IHRpdGxlJywgYm9keTogJ1B1bGwgcmVxdWVzdCBib2R5JyB9KTtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHNlc3Npb24sIGRiIH0gPSBzZXR1cChjb3BpbG90QXBpU2VydmljZSwgJycsICgpID0+ICdnaC10b2tlbicsIG9jdG9LaXRTZXJ2aWNlKTtcblx0XHRjb25zdCBwcm9tcHQgPSAnRml4IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMjMgYW5kIHJldmlldyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzQ1Ni4gRHVwbGljYXRlOiBodHRwczovL3d3dy5naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyMyNpc3N1ZWNvbW1lbnQtMSc7XG5cblx0XHRjb250cm9sbGVyLnNlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2Uoc2Vzc2lvbi50b1N0cmluZygpLCBwcm9tcHQpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oYXN5bmMgKCkgPT4gYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJykgPT09ICdHZW5lcmF0ZWQgdGl0bGUnLCAnZ2VuZXJhdGVkIHRpdGxlIHNob3VsZCBiZSBwZXJzaXN0ZWQnKTtcblxuXHRcdGNvbnN0IHVzZXJNZXNzYWdlID0gY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNhbGxzWzBdLnJlcXVlc3QubWVzc2FnZXMuZmluZChtZXNzYWdlID0+IG1lc3NhZ2Uucm9sZSA9PT0gJ3VzZXInKT8uY29udGVudDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNhbGxzOiBvY3RvS2l0U2VydmljZS5jYWxscy5tYXAoY2FsbCA9PiAoeyBvd25lcjogY2FsbC5vd25lciwgcmVwbzogY2FsbC5yZXBvLCBudW1iZXI6IGNhbGwubnVtYmVyLCB0b2tlbjogY2FsbC50b2tlbiB9KSksXG5cdFx0XHR1c2VyTWVzc2FnZSxcblx0XHR9LCB7XG5cdFx0XHRjYWxsczogW1xuXHRcdFx0XHR7IG93bmVyOiAnbWljcm9zb2Z0JywgcmVwbzogJ3ZzY29kZScsIG51bWJlcjogMTIzLCB0b2tlbjogJ2dpdGh1Yi10b2tlbicgfSxcblx0XHRcdFx0eyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnLCBudW1iZXI6IDQ1NiwgdG9rZW46ICdnaXRodWItdG9rZW4nIH0sXG5cdFx0XHRdLFxuXHRcdFx0dXNlck1lc3NhZ2U6IFtcblx0XHRcdFx0J1BsZWFzZSB3cml0ZSBhIGJyaWVmIHRpdGxlIGZvciB0aGUgZm9sbG93aW5nIHJlcXVlc3Q6Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdHByb21wdCxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdHaXRIdWIgaXNzdWUgYW5kIHB1bGwgcmVxdWVzdCBjb250ZXh0OicsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnR2l0SHViIGlzc3VlIG1pY3Jvc29mdC92c2NvZGUjMTIzOicsXG5cdFx0XHRcdCdUaGUgdGl0bGUgb2YgdGhlIGlzc3VlIGlzOiBJc3N1ZSB0aXRsZScsXG5cdFx0XHRcdCdUaGUgYm9keSBvZiB0aGUgaXNzdWUgaXM6Jyxcblx0XHRcdFx0J0lzc3VlIGJvZHknLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J0dpdEh1YiBwdWxsIHJlcXVlc3QgbWljcm9zb2Z0L3ZzY29kZSM0NTY6Jyxcblx0XHRcdFx0J1RoZSB0aXRsZSBvZiB0aGUgcHVsbCByZXF1ZXN0IGlzOiBQdWxsIHJlcXVlc3QgdGl0bGUnLFxuXHRcdFx0XHQnVGhlIGJvZHkgb2YgdGhlIHB1bGwgcmVxdWVzdCBpczonLFxuXHRcdFx0XHQnUHVsbCByZXF1ZXN0IGJvZHknLFxuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZSBvbmx5IGZldGNoZXMgbGlua3MgZnJvbSB0aGUgY29uZmlndXJlZCBHaXRIdWIgaG9zdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRjb25zdCBvY3RvS2l0U2VydmljZSA9IG5ldyBUZXN0QWdlbnRIb3N0T2N0b0tpdFNlcnZpY2UoKTtcblx0XHRvY3RvS2l0U2VydmljZS5yZXNwb25zZXMuc2V0KCdtaWNyb3NvZnQvdnNjb2RlIzQ1NicsIHsgdGl0bGU6ICdFbnRlcnByaXNlIGlzc3VlJywgYm9keTogJ0VudGVycHJpc2UgYm9keScgfSk7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzZXNzaW9uLCBkYiB9ID0gc2V0dXAoY29waWxvdEFwaVNlcnZpY2UsICcnLCAoKSA9PiAnZ2gtdG9rZW4nLCBvY3RvS2l0U2VydmljZSwgKCkgPT4gJ2dpdGh1Yi10b2tlbicsIHVuZGVmaW5lZCwgKCkgPT4gJ2dpdGh1Yi5lbnRlcnByaXNlLnRlc3QnKTtcblx0XHRjb25zdCBwcm9tcHQgPSAnQ29tcGFyZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTIzIHdpdGggaHR0cHM6Ly9naXRodWIuZW50ZXJwcmlzZS50ZXN0L21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzQ1Nic7XG5cblx0XHRjb250cm9sbGVyLnNlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2Uoc2Vzc2lvbi50b1N0cmluZygpLCBwcm9tcHQpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oYXN5bmMgKCkgPT4gYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJykgPT09ICdHZW5lcmF0ZWQgdGl0bGUnLCAnZ2VuZXJhdGVkIHRpdGxlIHNob3VsZCBiZSBwZXJzaXN0ZWQnKTtcblxuXHRcdGNvbnN0IHVzZXJNZXNzYWdlID0gY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNhbGxzWzBdLnJlcXVlc3QubWVzc2FnZXMuZmluZChtZXNzYWdlID0+IG1lc3NhZ2Uucm9sZSA9PT0gJ3VzZXInKT8uY29udGVudCA/PyAnJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNhbGxzOiBvY3RvS2l0U2VydmljZS5jYWxscy5tYXAoY2FsbCA9PiBjYWxsLm51bWJlciksXG5cdFx0XHRoYXNHaXRIdWJJc3N1ZTogdXNlck1lc3NhZ2UuaW5jbHVkZXMoJ21pY3Jvc29mdC92c2NvZGUjMTIzJyksXG5cdFx0XHRoYXNFbnRlcnByaXNlSXNzdWU6IHVzZXJNZXNzYWdlLmluY2x1ZGVzKCdUaGUgdGl0bGUgb2YgdGhlIGlzc3VlIGlzOiBFbnRlcnByaXNlIGlzc3VlJyksXG5cdFx0fSwge1xuXHRcdFx0Y2FsbHM6IFs0NTZdLFxuXHRcdFx0aGFzR2l0SHViSXNzdWU6IGZhbHNlLFxuXHRcdFx0aGFzRW50ZXJwcmlzZUlzc3VlOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZWVkVGl0bGVGcm9tRmlyc3RNZXNzYWdlIGZldGNoZXMgYXQgbW9zdCB0ZW4gR2l0SHViIHJlZmVyZW5jZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgb2N0b0tpdFNlcnZpY2UgPSBuZXcgVGVzdEFnZW50SG9zdE9jdG9LaXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbGlua3M6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChsZXQgbnVtYmVyID0gMTsgbnVtYmVyIDw9IDExOyBudW1iZXIrKykge1xuXHRcdFx0b2N0b0tpdFNlcnZpY2UucmVzcG9uc2VzLnNldChgbWljcm9zb2Z0L3ZzY29kZSMke251bWJlcn1gLCB7IHRpdGxlOiBgSXNzdWUgJHtudW1iZXJ9YCwgYm9keTogYEJvZHkgJHtudW1iZXJ9YCB9KTtcblx0XHRcdGxpbmtzLnB1c2goYGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8ke251bWJlcn1gKTtcblx0XHR9XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzZXNzaW9uLCBkYiB9ID0gc2V0dXAoY29waWxvdEFwaVNlcnZpY2UsICcnLCAoKSA9PiAnZ2gtdG9rZW4nLCBvY3RvS2l0U2VydmljZSk7XG5cblx0XHRjb250cm9sbGVyLnNlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2Uoc2Vzc2lvbi50b1N0cmluZygpLCBsaW5rcy5qb2luKCcgJykpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oYXN5bmMgKCkgPT4gYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJykgPT09ICdHZW5lcmF0ZWQgdGl0bGUnLCAnZ2VuZXJhdGVkIHRpdGxlIHNob3VsZCBiZSBwZXJzaXN0ZWQnKTtcblxuXHRcdGNvbnN0IHVzZXJNZXNzYWdlID0gY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNhbGxzWzBdLnJlcXVlc3QubWVzc2FnZXMuZmluZChtZXNzYWdlID0+IG1lc3NhZ2Uucm9sZSA9PT0gJ3VzZXInKT8uY29udGVudCA/PyAnJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNhbGxzOiBvY3RvS2l0U2VydmljZS5jYWxscy5tYXAoY2FsbCA9PiBjYWxsLm51bWJlciksXG5cdFx0XHRoYXNUZW50aENvbnRleHQ6IHVzZXJNZXNzYWdlLmluY2x1ZGVzKCdUaGUgdGl0bGUgb2YgdGhlIGlzc3VlIGlzOiBJc3N1ZSAxMCcpLFxuXHRcdFx0aGFzRWxldmVudGhDb250ZXh0OiB1c2VyTWVzc2FnZS5pbmNsdWRlcygnVGhlIHRpdGxlIG9mIHRoZSBpc3N1ZSBpczogSXNzdWUgMTEnKSxcblx0XHR9LCB7XG5cdFx0XHRjYWxsczogWzEsIDIsIDMsIDQsIDUsIDYsIDcsIDgsIDksIDEwXSxcblx0XHRcdGhhc1RlbnRoQ29udGV4dDogdHJ1ZSxcblx0XHRcdGhhc0VsZXZlbnRoQ29udGV4dDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2Ugb21pdHMgR2l0SHViIGNvbnRleHQgd2hlbiB0aGUgcmVxdWVzdCBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRjb25zdCBvY3RvS2l0U2VydmljZSA9IG5ldyBUZXN0QWdlbnRIb3N0T2N0b0tpdFNlcnZpY2UoKTtcblx0XHRvY3RvS2l0U2VydmljZS5yZXNwb25zZXMuc2V0KCdtaWNyb3NvZnQvdnNjb2RlIzEyMycsIG5ldyBFcnJvcignTm90IGZvdW5kJykpO1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc2Vzc2lvbiwgZGIgfSA9IHNldHVwKGNvcGlsb3RBcGlTZXJ2aWNlLCAnJywgKCkgPT4gJ2doLXRva2VuJywgb2N0b0tpdFNlcnZpY2UpO1xuXHRcdGNvbnN0IHByb21wdCA9ICdGaXggaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyMyc7XG5cblx0XHRjb250cm9sbGVyLnNlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2Uoc2Vzc2lvbi50b1N0cmluZygpLCBwcm9tcHQpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oYXN5bmMgKCkgPT4gYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJykgPT09ICdHZW5lcmF0ZWQgdGl0bGUnLCAnZ2VuZXJhdGVkIHRpdGxlIHNob3VsZCBiZSBwZXJzaXN0ZWQnKTtcblxuXHRcdGNvbnN0IHVzZXJNZXNzYWdlID0gY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNhbGxzWzBdLnJlcXVlc3QubWVzc2FnZXMuZmluZChtZXNzYWdlID0+IG1lc3NhZ2Uucm9sZSA9PT0gJ3VzZXInKT8uY29udGVudDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXNlck1lc3NhZ2UsIGBQbGVhc2Ugd3JpdGUgYSBicmllZiB0aXRsZSBmb3IgdGhlIGZvbGxvd2luZyByZXF1ZXN0OlxcblxcbiR7cHJvbXB0fWApO1xuXHR9KTtcblxuXHR0ZXN0KCdzZWVkVGl0bGVGcm9tRmlyc3RNZXNzYWdlIGtlZXBzIHN1Y2Nlc3NmdWwgR2l0SHViIGNvbnRleHQgd2hlbiBhbm90aGVyIHJlcXVlc3QgZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgb2N0b0tpdFNlcnZpY2UgPSBuZXcgVGVzdEFnZW50SG9zdE9jdG9LaXRTZXJ2aWNlKCk7XG5cdFx0b2N0b0tpdFNlcnZpY2UucmVzcG9uc2VzLnNldCgnbWljcm9zb2Z0L3ZzY29kZSMxMjMnLCB7IHRpdGxlOiAnSXNzdWUgdGl0bGUnLCBib2R5OiAnSXNzdWUgYm9keScgfSk7XG5cdFx0b2N0b0tpdFNlcnZpY2UucmVzcG9uc2VzLnNldCgnbWljcm9zb2Z0L3ZzY29kZSM0NTYnLCBuZXcgRXJyb3IoJ05vdCBmb3VuZCcpKTtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHNlc3Npb24sIGRiIH0gPSBzZXR1cChjb3BpbG90QXBpU2VydmljZSwgJycsICgpID0+ICdnaC10b2tlbicsIG9jdG9LaXRTZXJ2aWNlKTtcblx0XHRjb25zdCBwcm9tcHQgPSAnRml4IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMjMgYW5kIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvNDU2JztcblxuXHRcdGNvbnRyb2xsZXIuc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZShzZXNzaW9uLnRvU3RyaW5nKCksIHByb21wdCk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbmRpdGlvbihhc3luYyAoKSA9PiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSA9PT0gJ0dlbmVyYXRlZCB0aXRsZScsICdnZW5lcmF0ZWQgdGl0bGUgc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXG5cdFx0Y29uc3QgdXNlck1lc3NhZ2UgPSBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHNbMF0ucmVxdWVzdC5tZXNzYWdlcy5maW5kKG1lc3NhZ2UgPT4gbWVzc2FnZS5yb2xlID09PSAndXNlcicpPy5jb250ZW50ID8/ICcnO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzSXNzdWU6IHVzZXJNZXNzYWdlLmluY2x1ZGVzKCdUaGUgdGl0bGUgb2YgdGhlIGlzc3VlIGlzOiBJc3N1ZSB0aXRsZScpLFxuXHRcdFx0aGFzUHVsbFJlcXVlc3Q6IHVzZXJNZXNzYWdlLmluY2x1ZGVzKCdHaXRIdWIgcHVsbCByZXF1ZXN0IG1pY3Jvc29mdC92c2NvZGUjNDU2JyksXG5cdFx0fSwge1xuXHRcdFx0aGFzSXNzdWU6IHRydWUsXG5cdFx0XHRoYXNQdWxsUmVxdWVzdDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2UgdGltZXMgb3V0IEdpdEh1YiBjb250ZXh0IHJlcXVlc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvbnN0IG9jdG9LaXRTZXJ2aWNlID0gbmV3IFRlc3RBZ2VudEhvc3RPY3RvS2l0U2VydmljZSgpO1xuXHRcdG9jdG9LaXRTZXJ2aWNlLnBlbmRpbmdSZXNwb25zZXMuYWRkKCdtaWNyb3NvZnQvdnNjb2RlIzEyMycpO1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc2Vzc2lvbiwgZGIgfSA9IHNldHVwKGNvcGlsb3RBcGlTZXJ2aWNlLCAnJywgKCkgPT4gJ2doLXRva2VuJywgb2N0b0tpdFNlcnZpY2UsICgpID0+ICdnaXRodWItdG9rZW4nLCAxKTtcblx0XHRjb25zdCBwcm9tcHQgPSAnRml4IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMjMnO1xuXG5cdFx0Y29udHJvbGxlci5zZWVkVGl0bGVGcm9tRmlyc3RNZXNzYWdlKHNlc3Npb24udG9TdHJpbmcoKSwgcHJvbXB0KTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKGFzeW5jICgpID0+IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpID09PSAnR2VuZXJhdGVkIHRpdGxlJywgJ2dlbmVyYXRlZCB0aXRsZSBzaG91bGQgYmUgcGVyc2lzdGVkIGFmdGVyIHRoZSBHaXRIdWIgcmVxdWVzdCB0aW1lcyBvdXQnKTtcblxuXHRcdGNvbnN0IHVzZXJNZXNzYWdlID0gY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNhbGxzWzBdLnJlcXVlc3QubWVzc2FnZXMuZmluZChtZXNzYWdlID0+IG1lc3NhZ2Uucm9sZSA9PT0gJ3VzZXInKT8uY29udGVudDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlcXVlc3RBYm9ydGVkOiBvY3RvS2l0U2VydmljZS5jYWxsc1swXS5zaWduYWwuYWJvcnRlZCxcblx0XHRcdHVzZXJNZXNzYWdlLFxuXHRcdH0sIHtcblx0XHRcdHJlcXVlc3RBYm9ydGVkOiB0cnVlLFxuXHRcdFx0dXNlck1lc3NhZ2U6IGBQbGVhc2Ugd3JpdGUgYSBicmllZiB0aXRsZSBmb3IgdGhlIGZvbGxvd2luZyByZXF1ZXN0OlxcblxcbiR7cHJvbXB0fWAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2UgY2FwcyBlYWNoIGFwcGVuZGVkIEdpdEh1YiBib2R5IGF0IDQwMDAgY2hhcmFjdGVycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRjb25zdCBvY3RvS2l0U2VydmljZSA9IG5ldyBUZXN0QWdlbnRIb3N0T2N0b0tpdFNlcnZpY2UoKTtcblx0XHRvY3RvS2l0U2VydmljZS5yZXNwb25zZXMuc2V0KCdtaWNyb3NvZnQvdnNjb2RlIzEyMycsIHsgdGl0bGU6ICdJc3N1ZSB0aXRsZScsIGJvZHk6IGBzdGFydFxcbiR7J3gnLnJlcGVhdCgzMF8wMDApfVxcbmVuZGAgfSk7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzZXNzaW9uLCBkYiB9ID0gc2V0dXAoY29waWxvdEFwaVNlcnZpY2UsICcnLCAoKSA9PiAnZ2gtdG9rZW4nLCBvY3RvS2l0U2VydmljZSk7XG5cblx0XHRjb250cm9sbGVyLnNlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2Uoc2Vzc2lvbi50b1N0cmluZygpLCAnRml4IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMjMnKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKGFzeW5jICgpID0+IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpID09PSAnR2VuZXJhdGVkIHRpdGxlJywgJ2dlbmVyYXRlZCB0aXRsZSBzaG91bGQgYmUgcGVyc2lzdGVkJyk7XG5cblx0XHRjb25zdCB1c2VyTWVzc2FnZSA9IGNvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDYWxsc1swXS5yZXF1ZXN0Lm1lc3NhZ2VzLmZpbmQobWVzc2FnZSA9PiBtZXNzYWdlLnJvbGUgPT09ICd1c2VyJyk/LmNvbnRlbnQgPz8gJyc7XG5cdFx0Y29uc3QgY29udGV4dCA9IHVzZXJNZXNzYWdlLnNsaWNlKHVzZXJNZXNzYWdlLmluZGV4T2YoJ0dpdEh1YiBpc3N1ZSBhbmQgcHVsbCByZXF1ZXN0IGNvbnRleHQ6JykpO1xuXHRcdGNvbnN0IGJvZHlNYXJrZXIgPSAnVGhlIGJvZHkgb2YgdGhlIGlzc3VlIGlzOlxcbic7XG5cdFx0Y29uc3QgYm9keSA9IGNvbnRleHQuc2xpY2UoY29udGV4dC5pbmRleE9mKGJvZHlNYXJrZXIpICsgYm9keU1hcmtlci5sZW5ndGgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Ym9keUxlbmd0aDogYm9keS5sZW5ndGgsXG5cdFx0XHRoYXNTdGFydDogYm9keS5pbmNsdWRlcygnc3RhcnQnKSxcblx0XHRcdGhhc1RydW5jYXRpb25NYXJrZXI6IGJvZHkuaW5jbHVkZXMoJ1xcbi4uLlxcbicpLFxuXHRcdFx0aGFzRW5kOiBib2R5LmluY2x1ZGVzKCdlbmQnKSxcblx0XHR9LCB7XG5cdFx0XHRib2R5TGVuZ3RoOiA0XzAwMCxcblx0XHRcdGhhc1N0YXJ0OiB0cnVlLFxuXHRcdFx0aGFzVHJ1bmNhdGlvbk1hcmtlcjogdHJ1ZSxcblx0XHRcdGhhc0VuZDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZSBjYXBzIHRoZSBjb21iaW5lZCBwcm9tcHQgYW5kIEdpdEh1YiBjb250ZXh0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvbnN0IG9jdG9LaXRTZXJ2aWNlID0gbmV3IFRlc3RBZ2VudEhvc3RPY3RvS2l0U2VydmljZSgpO1xuXHRcdG9jdG9LaXRTZXJ2aWNlLnJlc3BvbnNlcy5zZXQoJ21pY3Jvc29mdC92c2NvZGUjMTIzJywgeyB0aXRsZTogYHN0YXJ0JHsneCcucmVwZWF0KDMwXzAwMCl9ZW5kYCwgYm9keTogJycgfSk7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzZXNzaW9uLCBkYiB9ID0gc2V0dXAoY29waWxvdEFwaVNlcnZpY2UsICcnLCAoKSA9PiAnZ2gtdG9rZW4nLCBvY3RvS2l0U2VydmljZSk7XG5cdFx0Y29uc3QgcHJvbXB0ID0gJ0ZpeCBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTIzJztcblxuXHRcdGNvbnRyb2xsZXIuc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZShzZXNzaW9uLnRvU3RyaW5nKCksIHByb21wdCk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbmRpdGlvbihhc3luYyAoKSA9PiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSA9PT0gJ0dlbmVyYXRlZCB0aXRsZScsICdnZW5lcmF0ZWQgdGl0bGUgc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXG5cdFx0Y29uc3QgdXNlck1lc3NhZ2UgPSBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHNbMF0ucmVxdWVzdC5tZXNzYWdlcy5maW5kKG1lc3NhZ2UgPT4gbWVzc2FnZS5yb2xlID09PSAndXNlcicpPy5jb250ZW50ID8/ICcnO1xuXHRcdGNvbnN0IHByb21wdENvbnRlbnQgPSB1c2VyTWVzc2FnZS5zbGljZSh1c2VyTWVzc2FnZS5pbmRleE9mKHByb21wdCkpO1xuXHRcdGNvbnN0IGNvbnRleHQgPSB1c2VyTWVzc2FnZS5zbGljZSh1c2VyTWVzc2FnZS5pbmRleE9mKCdHaXRIdWIgaXNzdWUgYW5kIHB1bGwgcmVxdWVzdCBjb250ZXh0OicpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHByb21wdENvbnRlbnRMZW5ndGg6IHByb21wdENvbnRlbnQubGVuZ3RoLFxuXHRcdFx0a2VlcHNSZXF1ZXN0OiBwcm9tcHRDb250ZW50LnN0YXJ0c1dpdGgocHJvbXB0KSxcblx0XHRcdGhhc1N0YXJ0OiBjb250ZXh0LmluY2x1ZGVzKCdzdGFydCcpLFxuXHRcdFx0aGFzVHJ1bmNhdGlvbk1hcmtlcjogY29udGV4dC5pbmNsdWRlcygnXFxuLi4uXFxuJyksXG5cdFx0XHRoYXNFbmQ6IGNvbnRleHQuaW5jbHVkZXMoJ2VuZCcpLFxuXHRcdH0sIHtcblx0XHRcdHByb21wdENvbnRlbnRMZW5ndGg6IDIwXzAwMCxcblx0XHRcdGtlZXBzUmVxdWVzdDogdHJ1ZSxcblx0XHRcdGhhc1N0YXJ0OiB0cnVlLFxuXHRcdFx0aGFzVHJ1bmNhdGlvbk1hcmtlcjogdHJ1ZSxcblx0XHRcdGhhc0VuZDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZSBzdHJpcHMgYW4gdW5leHBlY3RlZCB0cmFpbGluZyBIYW4gc3VmZml4IGZyb20gYSBMYXRpbiB0aXRsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0aXRsZVByZWZpeEF0TGltaXQgPSAnQScucmVwZWF0KDE5OSk7XG5cdFx0Y29uc3QgY2FzZXMgPSBbXG5cdFx0XHR7IHJlc3BvbnNlOiAnRml4IGNoYXQgdGl0bGVcXHU3ZjE2XFx1NzgwMScsIGV4cGVjdGVkOiAnRml4IGNoYXQgdGl0bGUnIH0sXG5cdFx0XHR7IHJlc3BvbnNlOiAnRml4IGNoYXQgdGl0bGUgXFx1N2YxNlxcdTc4MDFcXHU5NWVlJywgZXhwZWN0ZWQ6ICdGaXggY2hhdCB0aXRsZScgfSxcblx0XHRcdHsgcmVzcG9uc2U6IGAke3RpdGxlUHJlZml4QXRMaW1pdH1cXHU3ZjE2XFx1NzgwMWAsIGV4cGVjdGVkOiB0aXRsZVByZWZpeEF0TGltaXQgfSxcblx0XHRdO1xuXHRcdGNvbnN0IHRpdGxlczogeyB0aXRsZTogc3RyaW5nOyBwZXJzaXN0ZWRUaXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkIH1bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCB0ZXN0Q2FzZSBvZiBjYXNlcykge1xuXHRcdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRjb3BpbG90QXBpU2VydmljZS5yZXNwb25zZSA9IHRlc3RDYXNlLnJlc3BvbnNlO1xuXHRcdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzdGF0ZU1hbmFnZXIsIHNlc3Npb24sIGRiIH0gPSBzZXR1cChjb3BpbG90QXBpU2VydmljZSk7XG5cblx0XHRcdGNvbnRyb2xsZXIuc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZShzZXNzaW9uLnRvU3RyaW5nKCksICdGaXggY2hhdCB0aXRsZSBnZW5lcmF0aW9uJyk7XG5cdFx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKGFzeW5jICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKT8udGl0bGUgPT09IHRlc3RDYXNlLmV4cGVjdGVkXG5cdFx0XHRcdFx0JiYgYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJykgPT09IHRlc3RDYXNlLmV4cGVjdGVkO1xuXHRcdFx0fSwgJ2NsZWFuZWQgdGl0bGUgc2hvdWxkIGJlIGFwcGxpZWQgYW5kIHBlcnNpc3RlZCcpO1xuXHRcdFx0dGl0bGVzLnB1c2goe1xuXHRcdFx0XHR0aXRsZTogc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpPy50aXRsZSA/PyAnJyxcblx0XHRcdFx0cGVyc2lzdGVkVGl0bGU6IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0aXRsZXMsIGNhc2VzLm1hcCh0ZXN0Q2FzZSA9PiAoeyB0aXRsZTogdGVzdENhc2UuZXhwZWN0ZWQsIHBlcnNpc3RlZFRpdGxlOiB0ZXN0Q2FzZS5leHBlY3RlZCB9KSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZWVkVGl0bGVGcm9tRmlyc3RNZXNzYWdlIHByZXNlcnZlcyBpbnRlbnRpb25hbCBvciBhbWJpZ3VvdXMgSGFuIHN1ZmZpeGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNhc2VzID0gW1xuXHRcdFx0eyBwcm9tcHQ6ICdFeHBsYWluIFxcdTdmMTZcXHU3ODAxIG5hbWluZycsIHJlc3BvbnNlOiAnRXhwbGFpbiBjb2RlXFx1N2YxNlxcdTc4MDEnIH0sXG5cdFx0XHR7IHByb21wdDogJ0ZpeCBjaGF0IHRpdGxlIGdlbmVyYXRpb24nLCByZXNwb25zZTogJ0ZpeCBjaGF0IHRpdGxlXFx1N2YxNicgfSxcblx0XHRcdHsgcHJvbXB0OiAnRml4IGNoYXQgdGl0bGUgZ2VuZXJhdGlvbicsIHJlc3BvbnNlOiAnRml4IGNoYXQgdGl0bGVcXHU3ZjE2XFx1NzgwMVxcdTk1ZWVcXHU5ODk4JyB9LFxuXHRcdFx0eyBwcm9tcHQ6ICdGaXggY2hhdCB0aXRsZSBnZW5lcmF0aW9uJywgcmVzcG9uc2U6ICdcXHU0ZmVlXFx1NTkwZFxcdTY4MDdcXHU5ODk4JyB9LFxuXHRcdFx0eyBwcm9tcHQ6ICdGaXggY2hhdCB0aXRsZSBnZW5lcmF0aW9uJywgcmVzcG9uc2U6ICdDb2RlIFxcdTA0MWVcXHUwNDQ4XFx1MDQzOFxcdTA0MzFcXHUwNDNhXFx1MDQzMFxcdTdmMTZcXHU3ODAxJyB9LFxuXHRcdF07XG5cdFx0Y29uc3QgdGl0bGVzOiB7IHRpdGxlOiBzdHJpbmc7IHBlcnNpc3RlZFRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQgfVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHRlc3RDYXNlIG9mIGNhc2VzKSB7XG5cdFx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGNvcGlsb3RBcGlTZXJ2aWNlLnJlc3BvbnNlID0gdGVzdENhc2UucmVzcG9uc2U7XG5cdFx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHN0YXRlTWFuYWdlciwgc2Vzc2lvbiwgZGIgfSA9IHNldHVwKGNvcGlsb3RBcGlTZXJ2aWNlKTtcblxuXHRcdFx0Y29udHJvbGxlci5zZWVkVGl0bGVGcm9tRmlyc3RNZXNzYWdlKHNlc3Npb24udG9TdHJpbmcoKSwgdGVzdENhc2UucHJvbXB0KTtcblx0XHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpPy50aXRsZSA9PT0gdGVzdENhc2UucmVzcG9uc2Vcblx0XHRcdFx0XHQmJiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSA9PT0gdGVzdENhc2UucmVzcG9uc2U7XG5cdFx0XHR9LCAndW5jaGFuZ2VkIHRpdGxlIHNob3VsZCBiZSBhcHBsaWVkIGFuZCBwZXJzaXN0ZWQnKTtcblx0XHRcdHRpdGxlcy5wdXNoKHtcblx0XHRcdFx0dGl0bGU6IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKT8udGl0bGUgPz8gJycsXG5cdFx0XHRcdHBlcnNpc3RlZFRpdGxlOiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGl0bGVzLCBjYXNlcy5tYXAodGVzdENhc2UgPT4gKHsgdGl0bGU6IHRlc3RDYXNlLnJlc3BvbnNlLCBwZXJzaXN0ZWRUaXRsZTogdGVzdENhc2UucmVzcG9uc2UgfSkpKTtcblx0fSk7XG5cblx0dGVzdCgnc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZSBkb2VzIG5vdCBjbG9iYmVyIGEgY2hhbmdlZCB0aXRsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRsZXQgcmVzb2x2ZVRpdGxlITogKHRpdGxlOiBzdHJpbmcpID0+IHZvaWQ7XG5cdFx0Y29waWxvdEFwaVNlcnZpY2UucmVzcG9uc2VQcm9taXNlID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7IHJlc29sdmVUaXRsZSA9IHJlc29sdmU7IH0pO1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCBkYiB9ID0gc2V0dXAoY29waWxvdEFwaVNlcnZpY2UpO1xuXG5cdFx0Y29udHJvbGxlci5zZWVkVGl0bGVGcm9tRmlyc3RNZXNzYWdlKHNlc3Npb24udG9TdHJpbmcoKSwgJ0NyZWF0ZSB0aXRsZSB0ZXN0cycpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oKCkgPT4gY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNhbGxzLmxlbmd0aCA9PT0gMSwgJ3RpdGxlIGdlbmVyYXRpb24gc2hvdWxkIHN0YXJ0Jyk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb24udG9TdHJpbmcoKSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLFxuXHRcdFx0dGl0bGU6ICdNYW51YWwgdGl0bGUnLFxuXHRcdH0pO1xuXHRcdHJlc29sdmVUaXRsZSgnR2VuZXJhdGVkIHRpdGxlJyk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRpdGxlOiBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk/LnRpdGxlLFxuXHRcdFx0cGVyc2lzdGVkVGl0bGU6IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpLFxuXHRcdH0sIHtcblx0XHRcdHRpdGxlOiAnTWFudWFsIHRpdGxlJyxcblx0XHRcdHBlcnNpc3RlZFRpdGxlOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbmNlbFRpdGxlR2VuZXJhdGlvbiBjYW5jZWxzIGRlbGF5ZWQgZ2VuZXJhdGVkIHRpdGxlIGFwcGxpY2F0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGxldCByZXNvbHZlVGl0bGUhOiAodGl0bGU6IHN0cmluZykgPT4gdm9pZDtcblx0XHRjb3BpbG90QXBpU2VydmljZS5yZXNwb25zZVByb21pc2UgPSBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHsgcmVzb2x2ZVRpdGxlID0gcmVzb2x2ZTsgfSk7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzdGF0ZU1hbmFnZXIsIHNlc3Npb24sIGRiIH0gPSBzZXR1cChjb3BpbG90QXBpU2VydmljZSk7XG5cblx0XHRjb250cm9sbGVyLnNlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2Uoc2Vzc2lvbi50b1N0cmluZygpLCAnSW52ZXN0aWdhdGUgdGl0bGUgY2FuY2VsbGF0aW9uJyk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbmRpdGlvbigoKSA9PiBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHMubGVuZ3RoID09PSAxLCAndGl0bGUgZ2VuZXJhdGlvbiBzaG91bGQgc3RhcnQnKTtcblx0XHRjb250cm9sbGVyLmNhbmNlbFRpdGxlR2VuZXJhdGlvbihzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdHJlc29sdmVUaXRsZSgnR2VuZXJhdGVkIHRpdGxlJyk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFib3J0ZWQ6IGNvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDYWxsc1swXS5vcHRpb25zPy5zaWduYWw/LmFib3J0ZWQsXG5cdFx0XHR0aXRsZTogc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpPy50aXRsZSxcblx0XHRcdHBlcnNpc3RlZFRpdGxlOiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSxcblx0XHR9LCB7XG5cdFx0XHRhYm9ydGVkOiB0cnVlLFxuXHRcdFx0dGl0bGU6ICdJbnZlc3RpZ2F0ZSB0aXRsZSBjYW5jZWxsYXRpb24nLFxuXHRcdFx0cGVyc2lzdGVkVGl0bGU6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZSBza2lwcyBzZXNzaW9ucyB3aXRoIGFuIGV4aXN0aW5nIHRpdGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCBkYiwgdGl0bGVBY3Rpb25zIH0gPSBzZXR1cChjb3BpbG90QXBpU2VydmljZSwgJ0ZvcmtlZDogU291cmNlIHRpdGxlJyk7XG5cblx0XHRjb250cm9sbGVyLnNlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2Uoc2Vzc2lvbi50b1N0cmluZygpLCAnQ29udGludWUgZm9ya2VkIHNlc3Npb24nKTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2FsbHM6IGNvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDYWxscy5sZW5ndGgsXG5cdFx0XHR0aXRsZTogc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpPy50aXRsZSxcblx0XHRcdHRpdGxlczogdGl0bGVBY3Rpb25zLFxuXHRcdFx0cGVyc2lzdGVkVGl0bGU6IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpLFxuXHRcdH0sIHtcblx0XHRcdGNhbGxzOiAwLFxuXHRcdFx0dGl0bGU6ICdGb3JrZWQ6IFNvdXJjZSB0aXRsZScsXG5cdFx0XHR0aXRsZXM6IFtdLFxuXHRcdFx0cGVyc2lzdGVkVGl0bGU6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VlZFByb3Zpc2lvbmFsVGl0bGUgdGl0bGVzIHRoZSBzZXNzaW9uIGZyb20gdGhlIHN1Z2dlc3Rpb24gd2l0aG91dCBnZW5lcmF0aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCBkYiwgdGl0bGVBY3Rpb25zIH0gPSBzZXR1cChjb3BpbG90QXBpU2VydmljZSk7XG5cblx0XHRjb250cm9sbGVyLnNlZWRQcm92aXNpb25hbFRpdGxlKHNlc3Npb24udG9TdHJpbmcoKSwgJ2xzIC1sYScpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oYXN5bmMgKCkgPT4gYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJykgPT09ICdscyAtbGEnLCAncHJvdmlzaW9uYWwgdGl0bGUgc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0aXRsZTogc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpPy50aXRsZSxcblx0XHRcdHRpdGxlczogdGl0bGVBY3Rpb25zLFxuXHRcdFx0cGVyc2lzdGVkVGl0bGU6IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpLFxuXHRcdFx0dXRpbGl0eUNhbGxzOiBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHMubGVuZ3RoLFxuXHRcdH0sIHtcblx0XHRcdHRpdGxlOiAnbHMgLWxhJyxcblx0XHRcdHRpdGxlczogWydscyAtbGEnXSxcblx0XHRcdHBlcnNpc3RlZFRpdGxlOiAnbHMgLWxhJyxcblx0XHRcdHV0aWxpdHlDYWxsczogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VlZFByb3Zpc2lvbmFsVGl0bGUgcmVmcmVzaGVzIGEgcHJvdmlzaW9uYWwgdGl0bGUgd2l0aCBhIGxhdGVyIHN1Z2dlc3Rpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzdGF0ZU1hbmFnZXIsIHNlc3Npb24sIGRiIH0gPSBzZXR1cChjb3BpbG90QXBpU2VydmljZSk7XG5cblx0XHRjb250cm9sbGVyLnNlZWRQcm92aXNpb25hbFRpdGxlKHNlc3Npb24udG9TdHJpbmcoKSwgJ2xzIC1sYScpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oYXN5bmMgKCkgPT4gYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJykgPT09ICdscyAtbGEnLCAnZmlyc3QgcHJvdmlzaW9uYWwgdGl0bGUgc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXHRcdGNvbnRyb2xsZXIuc2VlZFByb3Zpc2lvbmFsVGl0bGUoc2Vzc2lvbi50b1N0cmluZygpLCAnZ2l0IHN0YXR1cycpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oYXN5bmMgKCkgPT4gYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJykgPT09ICdnaXQgc3RhdHVzJywgJ3NlY29uZCBwcm92aXNpb25hbCB0aXRsZSBzaG91bGQgYmUgcGVyc2lzdGVkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRpdGxlOiBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk/LnRpdGxlLFxuXHRcdFx0dXRpbGl0eUNhbGxzOiBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHMubGVuZ3RoLFxuXHRcdH0sIHtcblx0XHRcdHRpdGxlOiAnZ2l0IHN0YXR1cycsXG5cdFx0XHR1dGlsaXR5Q2FsbHM6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlZWRQcm92aXNpb25hbFRpdGxlIGRvZXMgbm90IGNsb2JiZXIgYSBjaGFuZ2VkIHRpdGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCBkYiwgdGl0bGVBY3Rpb25zIH0gPSBzZXR1cChjb3BpbG90QXBpU2VydmljZSk7XG5cblx0XHRjb250cm9sbGVyLnNlZWRQcm92aXNpb25hbFRpdGxlKHNlc3Npb24udG9TdHJpbmcoKSwgJ2xzIC1sYScpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oYXN5bmMgKCkgPT4gYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJykgPT09ICdscyAtbGEnLCAncHJvdmlzaW9uYWwgdGl0bGUgc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uLnRvU3RyaW5nKCksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ01hbnVhbCB0aXRsZScgfSk7XG5cdFx0Y29udHJvbGxlci5zZWVkUHJvdmlzaW9uYWxUaXRsZShzZXNzaW9uLnRvU3RyaW5nKCksICdnaXQgc3RhdHVzJyk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRpdGxlOiBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk/LnRpdGxlLFxuXHRcdFx0dGl0bGVzOiB0aXRsZUFjdGlvbnMsXG5cdFx0fSwge1xuXHRcdFx0dGl0bGU6ICdNYW51YWwgdGl0bGUnLFxuXHRcdFx0dGl0bGVzOiBbJ2xzIC1sYScsICdNYW51YWwgdGl0bGUnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZSByZXBsYWNlcyBhIHByb3Zpc2lvbmFsIHRpdGxlIHdpdGggYSBnZW5lcmF0ZWQgdGl0bGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0Y29waWxvdEFwaVNlcnZpY2UucmVzcG9uc2UgPSAnRXhwbGFpbiB0aGUgYnVpbGQnO1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCBkYiwgdGl0bGVBY3Rpb25zIH0gPSBzZXR1cChjb3BpbG90QXBpU2VydmljZSk7XG5cblx0XHQvLyBBIGAhY29tbWFuZGAgc2VlZHMgYSBwcm92aXNpb25hbCB0aXRsZSBhbmQgcmVjb3JkcyBhIChsb2NhbCkgdHVybi5cblx0XHRjb250cm9sbGVyLnNlZWRQcm92aXNpb25hbFRpdGxlKHNlc3Npb24udG9TdHJpbmcoKSwgJ2xzIC1sYScpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oYXN5bmMgKCkgPT4gYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJykgPT09ICdscyAtbGEnLCAncHJvdmlzaW9uYWwgdGl0bGUgc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXHRcdHN0YXRlTWFuYWdlci5zZWVkRGVmYXVsdENoYXRUdXJucyhzZXNzaW9uLnRvU3RyaW5nKCksIFtmaXJzdFR1cm4oJyFscyAtbGEnLCBbXSldKTtcblxuXHRcdC8vIFRoZSBmaXJzdCByZWFsIHJlcXVlc3Qgc3VwZXJzZWRlcyBpdCB3aXRoIGEgZ2VuZXJhdGVkIHRpdGxlLlxuXHRcdGNvbnRyb2xsZXIuc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZShzZXNzaW9uLnRvU3RyaW5nKCksICdFeHBsYWluIGhvdyB0aGUgYnVpbGQgd29ya3MnKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKGFzeW5jICgpID0+IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpID09PSAnRXhwbGFpbiB0aGUgYnVpbGQnLCAnZ2VuZXJhdGVkIHRpdGxlIHNob3VsZCByZXBsYWNlIHRoZSBwcm92aXNpb25hbCB0aXRsZScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0aXRsZTogc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpPy50aXRsZSxcblx0XHRcdHRpdGxlczogdGl0bGVBY3Rpb25zLFxuXHRcdFx0cGVyc2lzdGVkVGl0bGU6IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpLFxuXHRcdH0sIHtcblx0XHRcdHRpdGxlOiAnRXhwbGFpbiB0aGUgYnVpbGQnLFxuXHRcdFx0dGl0bGVzOiBbJ2xzIC1sYScsICdFeHBsYWluIGhvdyB0aGUgYnVpbGQgd29ya3MnLCAnRXhwbGFpbiB0aGUgYnVpbGQnXSxcblx0XHRcdHBlcnNpc3RlZFRpdGxlOiAnRXhwbGFpbiB0aGUgYnVpbGQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZWVkVGl0bGVGcm9tRmlyc3RNZXNzYWdlIHBlcnNpc3RzIGl0cyBmYWxsYmFjayB3aGVuIHJlcGxhY2luZyBhIHByb3Zpc2lvbmFsIHRpdGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvcGlsb3RBcGlTZXJ2aWNlLmVycm9yID0gbmV3IEVycm9yKCdUaXRsZSBnZW5lcmF0aW9uIHVuYXZhaWxhYmxlJyk7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzdGF0ZU1hbmFnZXIsIHNlc3Npb24sIGRiIH0gPSBzZXR1cChjb3BpbG90QXBpU2VydmljZSk7XG5cblx0XHRjb250cm9sbGVyLnNlZWRQcm92aXNpb25hbFRpdGxlKHNlc3Npb24udG9TdHJpbmcoKSwgJ2xzIC1sYScpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oYXN5bmMgKCkgPT4gYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJykgPT09ICdscyAtbGEnLCAncHJvdmlzaW9uYWwgdGl0bGUgc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXHRcdHN0YXRlTWFuYWdlci5zZWVkRGVmYXVsdENoYXRUdXJucyhzZXNzaW9uLnRvU3RyaW5nKCksIFtmaXJzdFR1cm4oJyFscyAtbGEnLCBbXSldKTtcblx0XHRjb250cm9sbGVyLnNlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2Uoc2Vzc2lvbi50b1N0cmluZygpLCAnRXhwbGFpbiBob3cgdGhlIGJ1aWxkIHdvcmtzJyk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbmRpdGlvbihhc3luYyAoKSA9PiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSA9PT0gJ0V4cGxhaW4gaG93IHRoZSBidWlsZCB3b3JrcycsICdmYWxsYmFjayB0aXRsZSBzaG91bGQgcmVwbGFjZSB0aGUgcHJvdmlzaW9uYWwgdGl0bGUnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dGl0bGU6IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKT8udGl0bGUsXG5cdFx0XHRwZXJzaXN0ZWRUaXRsZTogYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJyksXG5cdFx0fSwge1xuXHRcdFx0dGl0bGU6ICdFeHBsYWluIGhvdyB0aGUgYnVpbGQgd29ya3MnLFxuXHRcdFx0cGVyc2lzdGVkVGl0bGU6ICdFeHBsYWluIGhvdyB0aGUgYnVpbGQgd29ya3MnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRmdW5jdGlvbiB0ZXh0UGFydChjb250ZW50OiBzdHJpbmcpOiBSZXNwb25zZVBhcnQge1xuXHRcdHJldHVybiB7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAnbTEnLCBjb250ZW50IH07XG5cdH1cblxuXHRmdW5jdGlvbiByZWFzb25pbmdQYXJ0KGNvbnRlbnQ6IHN0cmluZyk6IFJlc3BvbnNlUGFydCB7XG5cdFx0cmV0dXJuIHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmcsIGlkOiAncjEnLCBjb250ZW50IH07XG5cdH1cblxuXHRmdW5jdGlvbiB0b29sQ2FsbFBhcnQoZGlzcGxheU5hbWU6IHN0cmluZywgaW52b2NhdGlvbk1lc3NhZ2U6IHN0cmluZyk6IFJlc3BvbnNlUGFydCB7XG5cdFx0Y29uc3QgdG9vbENhbGw6IFRvb2xDYWxsQ29tcGxldGVkU3RhdGUgPSB7XG5cdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0YzEnLFxuXHRcdFx0dG9vbE5hbWU6ICd0b29sJyxcblx0XHRcdGRpc3BsYXlOYW1lLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ2RvbmUnLFxuXHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0fTtcblx0XHRyZXR1cm4geyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCB0b29sQ2FsbCB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gZmlyc3RUdXJuKHRleHQ6IHN0cmluZywgcmVzcG9uc2VQYXJ0czogUmVzcG9uc2VQYXJ0W10pOiBUdXJuIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6ICd0dXJuLTEnLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0LCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHRyZXNwb25zZVBhcnRzLFxuXHRcdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHNlZWRGaXJzdFRpdGxlKGNvbnRyb2xsZXI6IEFnZW50SG9zdFNlc3Npb25UaXRsZUNvbnRyb2xsZXIsIGNvcGlsb3RBcGlTZXJ2aWNlOiBUZXN0Q29waWxvdEFwaVNlcnZpY2UsIGRiOiBUZXN0U2Vzc2lvbkRhdGFiYXNlLCBzZXNzaW9uOiBVUkksIHVzZXJQcm9tcHQ6IHN0cmluZywgdGl0bGU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvcGlsb3RBcGlTZXJ2aWNlLnJlc3BvbnNlID0gdGl0bGU7XG5cdFx0Y29udHJvbGxlci5zZWVkVGl0bGVGcm9tRmlyc3RNZXNzYWdlKHNlc3Npb24udG9TdHJpbmcoKSwgdXNlclByb21wdCk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbmRpdGlvbihhc3luYyAoKSA9PiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSA9PT0gdGl0bGUsICdmaXJzdCB0aXRsZSBzaG91bGQgYmUgcGVyc2lzdGVkJyk7XG5cdH1cblxuXHR0ZXN0KCdyZWZpbmVUaXRsZUZyb21GaXJzdFR1cm4gcmVnZW5lcmF0ZXMgdGhlIHRpdGxlIGZyb20gdGhlIGZpcnN0LXR1cm4gY29udGV4dCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHN0YXRlTWFuYWdlciwgc2Vzc2lvbiwgZGIgfSA9IHNldHVwKGNvcGlsb3RBcGlTZXJ2aWNlKTtcblx0XHRhd2FpdCBzZWVkRmlyc3RUaXRsZShjb250cm9sbGVyLCBjb3BpbG90QXBpU2VydmljZSwgZGIsIHNlc3Npb24sICdBZGQgZGFyayBtb2RlIHRvZ2dsZScsICdGaXJzdCB0aXRsZScpO1xuXG5cdFx0Y29waWxvdEFwaVNlcnZpY2UucmVzcG9uc2UgPSAnRGFyayBtb2RlIHNldHRpbmcnO1xuXHRcdHN0YXRlTWFuYWdlci5zZWVkRGVmYXVsdENoYXRUdXJucyhzZXNzaW9uLnRvU3RyaW5nKCksIFtmaXJzdFR1cm4oJ0FkZCBkYXJrIG1vZGUgdG9nZ2xlJywgW3RleHRQYXJ0KCdJbXBsZW1lbnRlZCB0aGUgdG9nZ2xlIGluIHRoZSBzZXR0aW5ncyBlZGl0b3IuJyldKV0pO1xuXHRcdGNvbnRyb2xsZXIucmVmaW5lVGl0bGVGcm9tRmlyc3RUdXJuKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbmRpdGlvbihhc3luYyAoKSA9PiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSA9PT0gJ0RhcmsgbW9kZSBzZXR0aW5nJywgJ3JlZmluZWQgdGl0bGUgc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXG5cdFx0Y29uc3QgbGFzdENhbGwgPSBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHNbY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNhbGxzLmxlbmd0aCAtIDFdO1xuXHRcdGNvbnN0IHVzZXJNZXNzYWdlID0gbGFzdENhbGwucmVxdWVzdC5tZXNzYWdlcy5maW5kKG1lc3NhZ2UgPT4gbWVzc2FnZS5yb2xlID09PSAndXNlcicpPy5jb250ZW50ID8/ICcnO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dGl0bGU6IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKT8udGl0bGUsXG5cdFx0XHRwZXJzaXN0ZWRUaXRsZTogYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJyksXG5cdFx0XHRtZW50aW9uc0NvbnZlcnNhdGlvbjogdXNlck1lc3NhZ2UuaW5jbHVkZXMoJ2NvbnZlcnNhdGlvbicpLFxuXHRcdFx0aW5jbHVkZXNVc2VyUmVxdWVzdDogdXNlck1lc3NhZ2UuaW5jbHVkZXMoJ0FkZCBkYXJrIG1vZGUgdG9nZ2xlJyksXG5cdFx0XHRpbmNsdWRlc1Jlc3BvbnNlOiB1c2VyTWVzc2FnZS5pbmNsdWRlcygnSW1wbGVtZW50ZWQgdGhlIHRvZ2dsZSBpbiB0aGUgc2V0dGluZ3MgZWRpdG9yLicpLFxuXHRcdH0sIHtcblx0XHRcdHRpdGxlOiAnRGFyayBtb2RlIHNldHRpbmcnLFxuXHRcdFx0cGVyc2lzdGVkVGl0bGU6ICdEYXJrIG1vZGUgc2V0dGluZycsXG5cdFx0XHRtZW50aW9uc0NvbnZlcnNhdGlvbjogdHJ1ZSxcblx0XHRcdGluY2x1ZGVzVXNlclJlcXVlc3Q6IHRydWUsXG5cdFx0XHRpbmNsdWRlc1Jlc3BvbnNlOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWZpbmVUaXRsZUZyb21GaXJzdFR1cm4gZG9lcyBub3QgY2xvYmJlciBhIHRpdGxlIGNoYW5nZWQgaW4gdGhlIG1lYW50aW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCBkYiB9ID0gc2V0dXAoY29waWxvdEFwaVNlcnZpY2UpO1xuXHRcdGF3YWl0IHNlZWRGaXJzdFRpdGxlKGNvbnRyb2xsZXIsIGNvcGlsb3RBcGlTZXJ2aWNlLCBkYiwgc2Vzc2lvbiwgJ0FkZCBkYXJrIG1vZGUgdG9nZ2xlJywgJ0ZpcnN0IHRpdGxlJyk7XG5cdFx0Y29uc3QgY2FsbHNBZnRlclNlZWQgPSBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHMubGVuZ3RoO1xuXG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb24udG9TdHJpbmcoKSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlOiAnTWFudWFsIHRpdGxlJyB9KTtcblx0XHRzdGF0ZU1hbmFnZXIuc2VlZERlZmF1bHRDaGF0VHVybnMoc2Vzc2lvbi50b1N0cmluZygpLCBbZmlyc3RUdXJuKCdBZGQgZGFyayBtb2RlIHRvZ2dsZScsIFt0ZXh0UGFydCgnSW1wbGVtZW50ZWQgdGhlIHRvZ2dsZS4nKV0pXSk7XG5cdFx0Y29udHJvbGxlci5yZWZpbmVUaXRsZUZyb21GaXJzdFR1cm4oc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2FsbHM6IGNvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDYWxscy5sZW5ndGgsXG5cdFx0XHR0aXRsZTogc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpPy50aXRsZSxcblx0XHR9LCB7XG5cdFx0XHRjYWxsczogY2FsbHNBZnRlclNlZWQsXG5cdFx0XHR0aXRsZTogJ01hbnVhbCB0aXRsZScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZmluZVRpdGxlRnJvbUZpcnN0VHVybiBpZ25vcmVzIHRvb2wgY2FsbHMgYW5kIHJlYXNvbmluZywga2VlcGluZyBvbmx5IHRleHQgcGFydHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzdGF0ZU1hbmFnZXIsIHNlc3Npb24sIGRiIH0gPSBzZXR1cChjb3BpbG90QXBpU2VydmljZSk7XG5cdFx0YXdhaXQgc2VlZEZpcnN0VGl0bGUoY29udHJvbGxlciwgY29waWxvdEFwaVNlcnZpY2UsIGRiLCBzZXNzaW9uLCAnQWRkIGRhcmsgbW9kZSB0b2dnbGUnLCAnRmlyc3QgdGl0bGUnKTtcblxuXHRcdGNvcGlsb3RBcGlTZXJ2aWNlLnJlc3BvbnNlID0gJ1JlZmluZWQgdGl0bGUnO1xuXHRcdHN0YXRlTWFuYWdlci5zZWVkRGVmYXVsdENoYXRUdXJucyhzZXNzaW9uLnRvU3RyaW5nKCksIFtmaXJzdFR1cm4oJ0FkZCBkYXJrIG1vZGUgdG9nZ2xlJywgW1xuXHRcdFx0cmVhc29uaW5nUGFydCgnVGhpbmtpbmcgYWJvdXQgVEhJTktJTkdfTUFSS0VSIHRoZSBhcHByb2FjaCcpLFxuXHRcdFx0dG9vbENhbGxQYXJ0KCdTZWFyY2hUb29sJywgJ3NlYXJjaGVkIHRoZSB3b3Jrc3BhY2UgVE9PTF9NQVJLRVInKSxcblx0XHRcdHRleHRQYXJ0KCdBZGRlZCB0aGUgdG9nZ2xlIFRFWFRfTUFSS0VSIHRvIHNldHRpbmdzLicpLFxuXHRcdF0pXSk7XG5cdFx0Y29udHJvbGxlci5yZWZpbmVUaXRsZUZyb21GaXJzdFR1cm4oc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKCgpID0+IGNvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDYWxscy5sZW5ndGggPj0gMiwgJ3JlZmluZSBzaG91bGQgaXNzdWUgYSB1dGlsaXR5IGNhbGwnKTtcblxuXHRcdGNvbnN0IGxhc3RDYWxsID0gY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNhbGxzW2NvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDYWxscy5sZW5ndGggLSAxXTtcblx0XHRjb25zdCB1c2VyTWVzc2FnZSA9IGxhc3RDYWxsLnJlcXVlc3QubWVzc2FnZXMuZmluZChtZXNzYWdlID0+IG1lc3NhZ2Uucm9sZSA9PT0gJ3VzZXInKT8uY29udGVudCA/PyAnJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGluY2x1ZGVzVGV4dDogdXNlck1lc3NhZ2UuaW5jbHVkZXMoJ1RFWFRfTUFSS0VSJyksXG5cdFx0XHRleGNsdWRlc1JlYXNvbmluZzogIXVzZXJNZXNzYWdlLmluY2x1ZGVzKCdUSElOS0lOR19NQVJLRVInKSxcblx0XHRcdGV4Y2x1ZGVzVG9vbENhbGw6ICF1c2VyTWVzc2FnZS5pbmNsdWRlcygnVE9PTF9NQVJLRVInKSAmJiAhdXNlck1lc3NhZ2UuaW5jbHVkZXMoJ1NlYXJjaFRvb2wnKSxcblx0XHR9LCB7XG5cdFx0XHRpbmNsdWRlc1RleHQ6IHRydWUsXG5cdFx0XHRleGNsdWRlc1JlYXNvbmluZzogdHJ1ZSxcblx0XHRcdGV4Y2x1ZGVzVG9vbENhbGw6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZmluZVRpdGxlRnJvbUZpcnN0VHVybiB0cnVuY2F0ZXMgdGhlIG1pZGRsZSBvZiBhbiBvdmVyc2l6ZWQgdGV4dCByZXNwb25zZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHN0YXRlTWFuYWdlciwgc2Vzc2lvbiwgZGIgfSA9IHNldHVwKGNvcGlsb3RBcGlTZXJ2aWNlKTtcblx0XHRhd2FpdCBzZWVkRmlyc3RUaXRsZShjb250cm9sbGVyLCBjb3BpbG90QXBpU2VydmljZSwgZGIsIHNlc3Npb24sICdBZGQgZGFyayBtb2RlIHRvZ2dsZScsICdGaXJzdCB0aXRsZScpO1xuXG5cdFx0Y29waWxvdEFwaVNlcnZpY2UucmVzcG9uc2UgPSAnUmVmaW5lZCB0aXRsZSc7XG5cdFx0Y29uc3QgaHVnZVJlc3BvbnNlID0gJ0EnLnJlcGVhdCgxNTAwMCkgKyAnIE1JRERMRV9NQVJLRVIgJyArICdCJy5yZXBlYXQoMTUwMDApO1xuXHRcdHN0YXRlTWFuYWdlci5zZWVkRGVmYXVsdENoYXRUdXJucyhzZXNzaW9uLnRvU3RyaW5nKCksIFtmaXJzdFR1cm4oJ0FkZCBkYXJrIG1vZGUgdG9nZ2xlJywgW3RleHRQYXJ0KGh1Z2VSZXNwb25zZSldKV0pO1xuXHRcdGNvbnRyb2xsZXIucmVmaW5lVGl0bGVGcm9tRmlyc3RUdXJuKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbmRpdGlvbigoKSA9PiBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHMubGVuZ3RoID49IDIsICdyZWZpbmUgc2hvdWxkIGlzc3VlIGEgdXRpbGl0eSBjYWxsJyk7XG5cblx0XHRjb25zdCBsYXN0Q2FsbCA9IGNvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDYWxsc1tjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHMubGVuZ3RoIC0gMV07XG5cdFx0Y29uc3QgdXNlck1lc3NhZ2UgPSBsYXN0Q2FsbC5yZXF1ZXN0Lm1lc3NhZ2VzLmZpbmQobWVzc2FnZSA9PiBtZXNzYWdlLnJvbGUgPT09ICd1c2VyJyk/LmNvbnRlbnQgPz8gJyc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR3aXRoaW5CdWRnZXQ6IHVzZXJNZXNzYWdlLmxlbmd0aCA8PSAyMDIwMCxcblx0XHRcdG1pZGRsZVRydW5jYXRlZDogdXNlck1lc3NhZ2UuaW5jbHVkZXMoJy4uLicpICYmICF1c2VyTWVzc2FnZS5pbmNsdWRlcygnTUlERExFX01BUktFUicpLFxuXHRcdFx0aW5jbHVkZXNVc2VyUmVxdWVzdDogdXNlck1lc3NhZ2UuaW5jbHVkZXMoJ0FkZCBkYXJrIG1vZGUgdG9nZ2xlJyksXG5cdFx0XHRrZWVwc0hlYWRBbmRUYWlsOiB1c2VyTWVzc2FnZS5pbmNsdWRlcygnQUFBQScpICYmIHVzZXJNZXNzYWdlLmluY2x1ZGVzKCdCQkJCJyksXG5cdFx0fSwge1xuXHRcdFx0d2l0aGluQnVkZ2V0OiB0cnVlLFxuXHRcdFx0bWlkZGxlVHJ1bmNhdGVkOiB0cnVlLFxuXHRcdFx0aW5jbHVkZXNVc2VyUmVxdWVzdDogdHJ1ZSxcblx0XHRcdGtlZXBzSGVhZEFuZFRhaWw6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZmluZVRpdGxlRnJvbUZpcnN0VHVybiBhcHBlbmRzIEdpdEh1YiBjb250ZXh0IGZyb20gdGhlIHJlcXVlc3QgYW5kIG9mZmVycyB0aGUgY3VycmVudCB0aXRsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRjb25zdCBvY3RvS2l0U2VydmljZSA9IG5ldyBUZXN0QWdlbnRIb3N0T2N0b0tpdFNlcnZpY2UoKTtcblx0XHRvY3RvS2l0U2VydmljZS5yZXNwb25zZXMuc2V0KCdtaWNyb3NvZnQvdnNjb2RlIzEyMycsIHsgdGl0bGU6ICdBZ2VudCBIb3N0IGxvZ3MgYW4gZXJyb3Igd2hlbiBhIGxvY2FsIGNvbW1pdCBpcyBub3Qgb24gR2l0SHViJywgYm9keTogJ0lzc3VlIGJvZHknIH0pO1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCBkYiB9ID0gc2V0dXAoY29waWxvdEFwaVNlcnZpY2UsICcnLCAoKSA9PiAnZ2gtdG9rZW4nLCBvY3RvS2l0U2VydmljZSk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9ICdUYWNrbGUgdGhpcyBpc3N1ZTogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyMyc7XG5cdFx0YXdhaXQgc2VlZEZpcnN0VGl0bGUoY29udHJvbGxlciwgY29waWxvdEFwaVNlcnZpY2UsIGRiLCBzZXNzaW9uLCByZXF1ZXN0LCAnRmlyc3QgdGl0bGUnKTtcblxuXHRcdGNvcGlsb3RBcGlTZXJ2aWNlLnJlc3BvbnNlID0gJ01pc3NpbmcgY29tbWl0IGxvb2t1cCBlcnJvcic7XG5cdFx0c3RhdGVNYW5hZ2VyLnNlZWREZWZhdWx0Q2hhdFR1cm5zKHNlc3Npb24udG9TdHJpbmcoKSwgW2ZpcnN0VHVybihyZXF1ZXN0LCBbdGV4dFBhcnQoJ0ZpeGVkIHRoZSBwdWxsIHJlcXVlc3QgbG9va3VwLicpXSldKTtcblx0XHRjb250cm9sbGVyLnJlZmluZVRpdGxlRnJvbUZpcnN0VHVybihzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oYXN5bmMgKCkgPT4gYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJykgPT09ICdNaXNzaW5nIGNvbW1pdCBsb29rdXAgZXJyb3InLCAncmVmaW5lZCB0aXRsZSBzaG91bGQgYmUgcGVyc2lzdGVkJyk7XG5cblx0XHRjb25zdCBsYXN0Q2FsbCA9IGNvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDYWxsc1tjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHMubGVuZ3RoIC0gMV07XG5cdFx0Y29uc3QgdXNlck1lc3NhZ2UgPSBsYXN0Q2FsbC5yZXF1ZXN0Lm1lc3NhZ2VzLmZpbmQobWVzc2FnZSA9PiBtZXNzYWdlLnJvbGUgPT09ICd1c2VyJyk/LmNvbnRlbnQgPz8gJyc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRmZXRjaGVkOiBvY3RvS2l0U2VydmljZS5jYWxscy5tYXAoY2FsbCA9PiBjYWxsLm51bWJlciksXG5cdFx0XHRpbmNsdWRlc0lzc3VlVGl0bGU6IHVzZXJNZXNzYWdlLmluY2x1ZGVzKCdUaGUgdGl0bGUgb2YgdGhlIGlzc3VlIGlzOiBBZ2VudCBIb3N0IGxvZ3MgYW4gZXJyb3Igd2hlbiBhIGxvY2FsIGNvbW1pdCBpcyBub3Qgb24gR2l0SHViJyksXG5cdFx0XHRpbmNsdWRlc1Jlc3BvbnNlOiB1c2VyTWVzc2FnZS5pbmNsdWRlcygnRml4ZWQgdGhlIHB1bGwgcmVxdWVzdCBsb29rdXAuJyksXG5cdFx0XHRpbmNsdWRlc0N1cnJlbnRUaXRsZTogdXNlck1lc3NhZ2UuaW5jbHVkZXMoJ0l0cyBjdXJyZW50IHRpdGxlIGlzOiBGaXJzdCB0aXRsZScpLFxuXHRcdH0sIHtcblx0XHRcdGZldGNoZWQ6IFsxMjMsIDEyM10sXG5cdFx0XHRpbmNsdWRlc0lzc3VlVGl0bGU6IHRydWUsXG5cdFx0XHRpbmNsdWRlc1Jlc3BvbnNlOiB0cnVlLFxuXHRcdFx0aW5jbHVkZXNDdXJyZW50VGl0bGU6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZmluZVRpdGxlRnJvbUZpcnN0VHVybiBpZ25vcmVzIEdpdEh1YiBsaW5rcyB0aGUgYWdlbnQgb25seSBtZW50aW9uZWQgaW4gaXRzIHJlc3BvbnNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvbnN0IG9jdG9LaXRTZXJ2aWNlID0gbmV3IFRlc3RBZ2VudEhvc3RPY3RvS2l0U2VydmljZSgpO1xuXHRcdG9jdG9LaXRTZXJ2aWNlLnJlc3BvbnNlcy5zZXQoJ21pY3Jvc29mdC92c2NvZGUjMTIzJywgeyB0aXRsZTogJ1JlcXVlc3RlZCBpc3N1ZScsIGJvZHk6ICdJc3N1ZSBib2R5JyB9KTtcblx0XHRvY3RvS2l0U2VydmljZS5yZXNwb25zZXMuc2V0KCdtaWNyb3NvZnQvdnNjb2RlIzQ1NicsIHsgdGl0bGU6ICdNZW50aW9uZWQgaXNzdWUnLCBib2R5OiAnT3RoZXIgYm9keScgfSk7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzdGF0ZU1hbmFnZXIsIHNlc3Npb24sIGRiIH0gPSBzZXR1cChjb3BpbG90QXBpU2VydmljZSwgJycsICgpID0+ICdnaC10b2tlbicsIG9jdG9LaXRTZXJ2aWNlKTtcblx0XHRjb25zdCByZXF1ZXN0ID0gJ1RhY2tsZSB0aGlzIGlzc3VlOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTIzJztcblx0XHRhd2FpdCBzZWVkRmlyc3RUaXRsZShjb250cm9sbGVyLCBjb3BpbG90QXBpU2VydmljZSwgZGIsIHNlc3Npb24sIHJlcXVlc3QsICdGaXJzdCB0aXRsZScpO1xuXG5cdFx0Y29waWxvdEFwaVNlcnZpY2UucmVzcG9uc2UgPSAnUmVmaW5lZCB0aXRsZSc7XG5cdFx0c3RhdGVNYW5hZ2VyLnNlZWREZWZhdWx0Q2hhdFR1cm5zKHNlc3Npb24udG9TdHJpbmcoKSwgW2ZpcnN0VHVybihyZXF1ZXN0LCBbdGV4dFBhcnQoJ1RoaXMgYWxzbyBhZmZlY3RzIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy80NTYnKV0pXSk7XG5cdFx0Y29udHJvbGxlci5yZWZpbmVUaXRsZUZyb21GaXJzdFR1cm4oc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKGFzeW5jICgpID0+IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpID09PSAnUmVmaW5lZCB0aXRsZScsICdyZWZpbmVkIHRpdGxlIHNob3VsZCBiZSBwZXJzaXN0ZWQnKTtcblxuXHRcdGNvbnN0IGxhc3RDYWxsID0gY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNhbGxzW2NvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDYWxscy5sZW5ndGggLSAxXTtcblx0XHRjb25zdCB1c2VyTWVzc2FnZSA9IGxhc3RDYWxsLnJlcXVlc3QubWVzc2FnZXMuZmluZChtZXNzYWdlID0+IG1lc3NhZ2Uucm9sZSA9PT0gJ3VzZXInKT8uY29udGVudCA/PyAnJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZldGNoZWQ6IG9jdG9LaXRTZXJ2aWNlLmNhbGxzLm1hcChjYWxsID0+IGNhbGwubnVtYmVyKSxcblx0XHRcdGluY2x1ZGVzTWVudGlvbmVkSXNzdWVDb250ZXh0OiB1c2VyTWVzc2FnZS5pbmNsdWRlcygnVGhlIHRpdGxlIG9mIHRoZSBpc3N1ZSBpczogTWVudGlvbmVkIGlzc3VlJyksXG5cdFx0fSwge1xuXHRcdFx0ZmV0Y2hlZDogWzEyMywgMTIzXSxcblx0XHRcdGluY2x1ZGVzTWVudGlvbmVkSXNzdWVDb250ZXh0OiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVmaW5lVGl0bGVGcm9tRmlyc3RUdXJuIGtlZXBzIHRoZSBpc3N1ZSB0aXRsZSB3aXRoaW4gYnVkZ2V0IGRlc3BpdGUgYW4gb3ZlcnNpemVkIHJlc3BvbnNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvbnN0IG9jdG9LaXRTZXJ2aWNlID0gbmV3IFRlc3RBZ2VudEhvc3RPY3RvS2l0U2VydmljZSgpO1xuXHRcdG9jdG9LaXRTZXJ2aWNlLnJlc3BvbnNlcy5zZXQoJ21pY3Jvc29mdC92c2NvZGUjMTIzJywgeyB0aXRsZTogJ0xvY2FsIGNvbW1pdCBsb29rdXAgZmFpbHMnLCBib2R5OiAnQycucmVwZWF0KDMwXzAwMCkgfSk7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzdGF0ZU1hbmFnZXIsIHNlc3Npb24sIGRiIH0gPSBzZXR1cChjb3BpbG90QXBpU2VydmljZSwgJycsICgpID0+ICdnaC10b2tlbicsIG9jdG9LaXRTZXJ2aWNlKTtcblx0XHRjb25zdCByZXF1ZXN0ID0gJ1RhY2tsZSB0aGlzIGlzc3VlOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTIzJztcblx0XHRhd2FpdCBzZWVkRmlyc3RUaXRsZShjb250cm9sbGVyLCBjb3BpbG90QXBpU2VydmljZSwgZGIsIHNlc3Npb24sIHJlcXVlc3QsICdGaXJzdCB0aXRsZScpO1xuXG5cdFx0Y29waWxvdEFwaVNlcnZpY2UucmVzcG9uc2UgPSAnUmVmaW5lZCB0aXRsZSc7XG5cdFx0Y29uc3QgaHVnZVJlc3BvbnNlID0gJ0EnLnJlcGVhdCgxNV8wMDApICsgJyBNSURETEVfTUFSS0VSICcgKyAnQicucmVwZWF0KDE1XzAwMCk7XG5cdFx0c3RhdGVNYW5hZ2VyLnNlZWREZWZhdWx0Q2hhdFR1cm5zKHNlc3Npb24udG9TdHJpbmcoKSwgW2ZpcnN0VHVybihyZXF1ZXN0LCBbdGV4dFBhcnQoaHVnZVJlc3BvbnNlKV0pXSk7XG5cdFx0Y29udHJvbGxlci5yZWZpbmVUaXRsZUZyb21GaXJzdFR1cm4oc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKGFzeW5jICgpID0+IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpID09PSAnUmVmaW5lZCB0aXRsZScsICdyZWZpbmVkIHRpdGxlIHNob3VsZCBiZSBwZXJzaXN0ZWQnKTtcblxuXHRcdGNvbnN0IGxhc3RDYWxsID0gY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNhbGxzW2NvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDYWxscy5sZW5ndGggLSAxXTtcblx0XHRjb25zdCB1c2VyTWVzc2FnZSA9IGxhc3RDYWxsLnJlcXVlc3QubWVzc2FnZXMuZmluZChtZXNzYWdlID0+IG1lc3NhZ2Uucm9sZSA9PT0gJ3VzZXInKT8uY29udGVudCA/PyAnJztcblx0XHRjb25zdCBwcm9tcHRDb250ZW50ID0gdXNlck1lc3NhZ2Uuc2xpY2UodXNlck1lc3NhZ2UuaW5kZXhPZignVXNlciByZXF1ZXN0OicpLCB1c2VyTWVzc2FnZS5pbmRleE9mKCdcXG5cXG5JdHMgY3VycmVudCB0aXRsZSBpczonKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwcm9tcHRDb250ZW50TGVuZ3RoOiBwcm9tcHRDb250ZW50Lmxlbmd0aCxcblx0XHRcdGluY2x1ZGVzVXNlclJlcXVlc3Q6IHByb21wdENvbnRlbnQuaW5jbHVkZXMocmVxdWVzdCksXG5cdFx0XHRpbmNsdWRlc0lzc3VlVGl0bGU6IHByb21wdENvbnRlbnQuaW5jbHVkZXMoJ1RoZSB0aXRsZSBvZiB0aGUgaXNzdWUgaXM6IExvY2FsIGNvbW1pdCBsb29rdXAgZmFpbHMnKSxcblx0XHRcdGtlZXBzUmVzcG9uc2VIZWFkQW5kVGFpbDogcHJvbXB0Q29udGVudC5pbmNsdWRlcygnQUFBQScpICYmIHByb21wdENvbnRlbnQuaW5jbHVkZXMoJ0JCQkInKSxcblx0XHRcdG1pZGRsZVRydW5jYXRlZDogIXByb21wdENvbnRlbnQuaW5jbHVkZXMoJ01JRERMRV9NQVJLRVInKSxcblx0XHR9LCB7XG5cdFx0XHRwcm9tcHRDb250ZW50TGVuZ3RoOiAyMF8wMDAsXG5cdFx0XHRpbmNsdWRlc1VzZXJSZXF1ZXN0OiB0cnVlLFxuXHRcdFx0aW5jbHVkZXNJc3N1ZVRpdGxlOiB0cnVlLFxuXHRcdFx0a2VlcHNSZXNwb25zZUhlYWRBbmRUYWlsOiB0cnVlLFxuXHRcdFx0bWlkZGxlVHJ1bmNhdGVkOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRmdW5jdGlvbiB0dXJuKGlkOiBzdHJpbmcsIHRleHQ6IHN0cmluZywgcmVzcG9uc2VQYXJ0czogUmVzcG9uc2VQYXJ0W10pOiBUdXJuIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdHJlc3BvbnNlUGFydHMsXG5cdFx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnZ2VuZXJhdGVGb3JrZWRUaXRsZSByZXBsYWNlcyB0aGUgaW5oZXJpdGVkIHRpdGxlIHVzaW5nIHRoZSB3aG9sZSBmb3JrZWQgY29udmVyc2F0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvcGlsb3RBcGlTZXJ2aWNlLnJlc3BvbnNlID0gJ0NvbXBhY3Rpb24gc3RyYXRlZ3knO1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCBkYiwgdGl0bGVBY3Rpb25zIH0gPSBzZXR1cChjb3BpbG90QXBpU2VydmljZSwgJ0ZvcmtlZDogU291cmNlIHRpdGxlJyk7XG5cblx0XHRzdGF0ZU1hbmFnZXIuc2VlZERlZmF1bHRDaGF0VHVybnMoc2Vzc2lvbi50b1N0cmluZygpLCBbXG5cdFx0XHR0dXJuKCd0dXJuLTEnLCAnQWRkIGRhcmsgbW9kZSB0b2dnbGUnLCBbdGV4dFBhcnQoJ0ltcGxlbWVudGVkIHRoZSB0b2dnbGUgaW4gc2V0dGluZ3MuJyldKSxcblx0XHRcdHR1cm4oJ3R1cm4tMicsICdOb3cgY29tcGFjdCB0aGUgaGlzdG9yeScsIFt0ZXh0UGFydCgnU3VtbWFyaXplZCBlYXJsaWVyIHR1cm5zLicpXSksXG5cdFx0XSk7XG5cdFx0Y29uc3QgdHVybnMgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSkhLnR1cm5zO1xuXHRcdGNvbnRyb2xsZXIuZ2VuZXJhdGVGb3JrZWRUaXRsZShzZXNzaW9uLnRvU3RyaW5nKCksIHVuZGVmaW5lZCwgdHVybnMsICdGb3JrZWQ6IFNvdXJjZSB0aXRsZScsICdTb3VyY2UgdGl0bGUnKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKGFzeW5jICgpID0+IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpID09PSAnQ29tcGFjdGlvbiBzdHJhdGVneScsICdmb3JrZWQgdGl0bGUgc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXG5cdFx0Y29uc3QgdXNlck1lc3NhZ2UgPSBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHNbMF0/LnJlcXVlc3QubWVzc2FnZXMuZmluZChtZXNzYWdlID0+IG1lc3NhZ2Uucm9sZSA9PT0gJ3VzZXInKT8uY29udGVudCA/PyAnJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRpdGxlczogdGl0bGVBY3Rpb25zLFxuXHRcdFx0cGVyc2lzdGVkVGl0bGU6IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpLFxuXHRcdFx0bWVudGlvbnNDb252ZXJzYXRpb246IHVzZXJNZXNzYWdlLmluY2x1ZGVzKCdjb252ZXJzYXRpb24nKSxcblx0XHRcdGZyYW1lc0FzQnJhbmNoOiB1c2VyTWVzc2FnZS5pbmNsdWRlcygnYnJhbmNoZWQgZnJvbSBhbiBlYXJsaWVyIGNoYXQgdGl0bGVkIFwiU291cmNlIHRpdGxlXCInKSxcblx0XHRcdGluY2x1ZGVzRmlyc3RUdXJuOiB1c2VyTWVzc2FnZS5pbmNsdWRlcygnQWRkIGRhcmsgbW9kZSB0b2dnbGUnKSAmJiB1c2VyTWVzc2FnZS5pbmNsdWRlcygnSW1wbGVtZW50ZWQgdGhlIHRvZ2dsZSBpbiBzZXR0aW5ncy4nKSxcblx0XHRcdGluY2x1ZGVzU2Vjb25kVHVybjogdXNlck1lc3NhZ2UuaW5jbHVkZXMoJ05vdyBjb21wYWN0IHRoZSBoaXN0b3J5JykgJiYgdXNlck1lc3NhZ2UuaW5jbHVkZXMoJ1N1bW1hcml6ZWQgZWFybGllciB0dXJucy4nKSxcblx0XHR9LCB7XG5cdFx0XHR0aXRsZXM6IFsnQ29tcGFjdGlvbiBzdHJhdGVneSddLFxuXHRcdFx0cGVyc2lzdGVkVGl0bGU6ICdDb21wYWN0aW9uIHN0cmF0ZWd5Jyxcblx0XHRcdG1lbnRpb25zQ29udmVyc2F0aW9uOiB0cnVlLFxuXHRcdFx0ZnJhbWVzQXNCcmFuY2g6IHRydWUsXG5cdFx0XHRpbmNsdWRlc0ZpcnN0VHVybjogdHJ1ZSxcblx0XHRcdGluY2x1ZGVzU2Vjb25kVHVybjogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2VuZXJhdGVGb3JrZWRUaXRsZSBkb2VzIG5vdCBjbG9iYmVyIGEgdGl0bGUgY2hhbmdlZCBkdXJpbmcgZ2VuZXJhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRsZXQgcmVzb2x2ZVRpdGxlITogKHRpdGxlOiBzdHJpbmcpID0+IHZvaWQ7XG5cdFx0Y29waWxvdEFwaVNlcnZpY2UucmVzcG9uc2VQcm9taXNlID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7IHJlc29sdmVUaXRsZSA9IHJlc29sdmU7IH0pO1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCBkYiB9ID0gc2V0dXAoY29waWxvdEFwaVNlcnZpY2UsICdGb3JrZWQ6IFNvdXJjZSB0aXRsZScpO1xuXG5cdFx0c3RhdGVNYW5hZ2VyLnNlZWREZWZhdWx0Q2hhdFR1cm5zKHNlc3Npb24udG9TdHJpbmcoKSwgW3R1cm4oJ3R1cm4tMScsICdBZGQgZGFyayBtb2RlIHRvZ2dsZScsIFt0ZXh0UGFydCgnRG9uZS4nKV0pXSk7XG5cdFx0Y29udHJvbGxlci5nZW5lcmF0ZUZvcmtlZFRpdGxlKHNlc3Npb24udG9TdHJpbmcoKSwgdW5kZWZpbmVkLCBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSkhLnR1cm5zLCAnRm9ya2VkOiBTb3VyY2UgdGl0bGUnKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKCgpID0+IGNvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDYWxscy5sZW5ndGggPT09IDEsICdmb3JrZWQgdGl0bGUgZ2VuZXJhdGlvbiBzaG91bGQgc3RhcnQnKTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbi50b1N0cmluZygpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCwgdGl0bGU6ICdNYW51YWwgdGl0bGUnIH0pO1xuXHRcdHJlc29sdmVUaXRsZSgnR2VuZXJhdGVkIHRpdGxlJyk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRpdGxlOiBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk/LnRpdGxlLFxuXHRcdFx0cGVyc2lzdGVkVGl0bGU6IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpLFxuXHRcdH0sIHtcblx0XHRcdHRpdGxlOiAnTWFudWFsIHRpdGxlJyxc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
