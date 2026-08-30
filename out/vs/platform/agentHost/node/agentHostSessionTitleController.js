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
import { Limiter } from "../../../base/common/async.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { ILogService } from "../../log/common/log.js";
import { SessionServerToolName } from "../common/serverToolNames.js";
import { ActionType } from "../common/state/sessionActions.js";
import { buildDefaultChatUri, isAhpChatChannel, isDefaultChatUri } from "../common/state/sessionState.js";
import { buildConversationContext, renderResponseMarkdown, truncateMiddle } from "../common/agentHostConversationContext.js";
import { AGENT_HOST_TITLE_SOURCE_AGENT, AGENT_HOST_TITLE_SOURCE_AUTO, AGENT_HOST_TITLE_SOURCE_USER, customChatTitleMetadataKey, customChatTitleSourceMetadataKey, persistSessionMetadata, SESSION_CUSTOM_TITLE_KEY, SESSION_CUSTOM_TITLE_SOURCE_KEY } from "./shared/persistSessionMetadata.js";
const MAX_TITLE_LENGTH = 200;
const MAX_ACTIVE_AGENT_FALLBACK_TITLE_LENGTH = 40;
const MAX_TITLE_TOKENS = 32;
const GITHUB_CONTEXT_REQUEST_TIMEOUT = 5e3;
const MAX_CONCURRENT_GITHUB_CONTEXT_REQUESTS = 5;
const MAX_GITHUB_CONTEXT_BODY_CHARS = 4e3;
const MAX_GITHUB_CONTEXT_REFERENCES = 10;
const MAX_TRAILING_HAN_SUFFIX_CODE_UNITS = 6;
const MIN_LATIN_LETTERS_BEFORE_HAN_SUFFIX = 4;
const MIN_LATIN_LETTER_RATIO = 0.8;
const HAN_CHARACTER = /\p{sc=Han}/u;
const TRAILING_HAN_SUFFIX = /(?<!\p{sc=Han})\p{sc=Han}{2,3}$/u;
const GITHUB_ISSUE_OR_PULL_REQUEST_URL_PATTERN = /\bhttps?:\/\/(?<host>[\w.-]+)\/(?<owner>[\w.-]+)\/(?<repo>[\w.-]+)\/(?<kind>issues|pull)\/(?<number>\d+)\b/gi;
const CHAT_RENAME_REMINDER = "This chat currently has an auto-generated or placeholder name. Before doing any other work or responding to the user, you MUST call the `rename_chat` tool exactly once to give it a short, descriptive title based on the user's intent. If the prompt references a pull request or issue link, resolve that link first and use its context when choosing the title. Do not skip this call even if the current name already seems descriptive.";
const MAX_TITLE_CONTEXT_CHARS = 2e4;
const MIN_GITHUB_CONTEXT_CHARS = 4e3;
let AgentHostSessionTitleController = class extends Disposable {
  constructor(_stateManager, _options, _logService) {
    super();
    this._stateManager = _stateManager;
    this._options = _options;
    this._logService = _logService;
    this._titleGenerationCancellationSources = /* @__PURE__ */ new Map();
    /**
     * The most recent title this controller applied for a given session/chat
     * key. Used to detect whether the title was changed (e.g. a manual
     * `/rename` or user edit) since we last set it, so we never clobber a
     * deliberate title with an auto-generated one.
     */
    this._lastAppliedTitle = /* @__PURE__ */ new Map();
    /**
     * Session/chat keys whose current title is a provisional placeholder set by
     * {@link seedProvisionalTitle} (e.g. from a `!command`). Such a title does
     * not describe the session's topic, so the first subsequent request that
     * carries real intent replaces it with a generated title via
     * {@link seedTitleFromFirstMessage}.
     */
    this._provisionalTitles = /* @__PURE__ */ new Set();
    this._autoTitles = /* @__PURE__ */ new Set();
    this._renamedTitles = /* @__PURE__ */ new Set();
  }
  seedTitleFromFirstMessage(channel, userPrompt, chatChannel) {
    const activeAgentTitleGenerationEnabled = this._isActiveAgentTitleGenerationEnabled(channel);
    const fallbackTitle = activeAgentTitleGenerationEnabled ? this._normalizeActiveAgentFallbackTitle(userPrompt) : this._normalizeTitle(userPrompt);
    if (!fallbackTitle) {
      return;
    }
    const independentChat = this._independentChatChannel(channel, chatChannel);
    const key = independentChat ?? channel;
    const state = independentChat ? this._stateManager.getChatState(independentChat) : this._stateManager.getSessionState(channel);
    if (!state || !this._canSeedFirstMessageTitle(key, state.turns.length, state.title)) {
      return;
    }
    const replacesProvisionalTitle = this._provisionalTitles.has(key);
    this._provisionalTitles.delete(key);
    this._applySeedTitle(channel, independentChat, fallbackTitle);
    if (activeAgentTitleGenerationEnabled) {
      this.markTitleAuto(channel, independentChat, fallbackTitle);
      return;
    }
    if (replacesProvisionalTitle) {
      this._persistAutoTitle(channel, independentChat, fallbackTitle);
    }
    this._generateTitleSoon(
      key,
      { content: userPrompt, isConversation: false, gitHubReferenceSource: userPrompt },
      fallbackTitle,
      (title) => this._applySeedTitle(channel, independentChat, title),
      () => this._currentSeedTitle(channel, independentChat) === this._lastAppliedTitle.get(key),
      (title) => this._persistAutoTitle(channel, independentChat, title)
    );
  }
  /** Seeds and persists a provisional title suggested by a locally handled command. */
  seedProvisionalTitle(channel, suggestedTitle, chatChannel) {
    const title = this._normalizeTitle(suggestedTitle, this._isActiveAgentTitleGenerationEnabled(channel) ? MAX_ACTIVE_AGENT_FALLBACK_TITLE_LENGTH : MAX_TITLE_LENGTH);
    if (!title) {
      return;
    }
    const independentChat = this._independentChatChannel(channel, chatChannel);
    const key = independentChat ?? channel;
    const state = independentChat ? this._stateManager.getChatState(independentChat) : this._stateManager.getSessionState(channel);
    if (!state || !this._canSeedProvisionalTitle(key, state.title)) {
      return;
    }
    this._provisionalTitles.add(key);
    this._applySeedTitle(channel, independentChat, title);
    this._persistAutoTitle(channel, independentChat, title);
  }
  /** Trims, collapses whitespace, and length-caps a candidate title. */
  _normalizeTitle(text, maxLength = MAX_TITLE_LENGTH) {
    return Array.from(text.trim().replace(/\s+/g, " ")).slice(0, maxLength).join("").trim();
  }
  _normalizeActiveAgentFallbackTitle(text) {
    const normalized = text.trim().replace(/\s+/g, " ");
    const characters = Array.from(normalized);
    if (characters.length <= MAX_ACTIVE_AGENT_FALLBACK_TITLE_LENGTH) {
      return normalized;
    }
    const limited = characters.slice(0, MAX_ACTIVE_AGENT_FALLBACK_TITLE_LENGTH).join("");
    if (!limited.includes(" ")) {
      return `${Array.from(limited).slice(0, MAX_ACTIVE_AGENT_FALLBACK_TITLE_LENGTH - 3).join("")}...`;
    }
    const remaining = characters.slice(MAX_ACTIVE_AGENT_FALLBACK_TITLE_LENGTH).join("");
    const nextWordBoundary = remaining.indexOf(" ");
    const completedWord = nextWordBoundary >= 0 ? remaining.slice(0, nextWordBoundary) : remaining;
    if (Array.from(completedWord).length > MAX_ACTIVE_AGENT_FALLBACK_TITLE_LENGTH) {
      return `${Array.from(limited).slice(0, MAX_ACTIVE_AGENT_FALLBACK_TITLE_LENGTH - 3).join("")}...`;
    }
    return nextWordBoundary >= 0 ? `${limited}${completedWord}...` : normalized;
  }
  /**
   * The independently titled chat a seed should target, or `undefined` to
   * title the session-backed sole default chat.
   */
  _independentChatChannel(channel, chatChannel) {
    if (!chatChannel || !isAhpChatChannel(chatChannel)) {
      return void 0;
    }
    return !isDefaultChatUri(chatChannel) || (this._stateManager.getSessionState(channel)?.chats.length ?? 1) > 1 ? chatChannel : void 0;
  }
  /**
   * Applies `title` to the independently titled chat (`independentChat`) or, when
   * that is `undefined`, to the session itself, recording it as last-applied.
   */
  _applySeedTitle(channel, independentChat, title) {
    if (independentChat) {
      this._applyTitle(independentChat, title, (t) => this._stateManager.updateChatTitle(channel, independentChat, t));
      this._persistAutoTitleSource(channel, independentChat);
    } else {
      this._applyTitle(channel, title, (t) => this._stateManager.dispatchServerAction(channel, {
        type: ActionType.SessionTitleChanged,
        title: t
      }));
      this._persistAutoTitleSource(channel, void 0);
    }
  }
  /** Persists `title` as the custom title of the addressed independent chat or session. */
  _persistAutoTitle(channel, independentChat, title) {
    if (independentChat) {
      this._persistSessionFlag(channel, customChatTitleMetadataKey(independentChat), title);
      this._persistSessionFlag(channel, customChatTitleSourceMetadataKey(independentChat), AGENT_HOST_TITLE_SOURCE_AUTO);
      return;
    }
    this._persistSessionFlag(channel, SESSION_CUSTOM_TITLE_KEY, title);
    this._persistSessionFlag(channel, SESSION_CUSTOM_TITLE_SOURCE_KEY, AGENT_HOST_TITLE_SOURCE_AUTO);
  }
  _persistAutoTitleSource(channel, independentChat) {
    this._persistSessionFlag(channel, independentChat ? customChatTitleSourceMetadataKey(independentChat) : SESSION_CUSTOM_TITLE_SOURCE_KEY, AGENT_HOST_TITLE_SOURCE_AUTO);
  }
  /** The live title of the addressed independent chat or session. */
  _currentSeedTitle(channel, independentChat) {
    return independentChat ? this._stateManager.getChatState(independentChat)?.title : this._stateManager.getSessionState(channel)?.title;
  }
  /**
   * Whether {@link seedTitleFromFirstMessage} may (re)title `key`: true for a
   * fresh, untitled target (its first message) or when its title is a
   * provisional placeholder we applied and no one has changed it since — the
   * first real request supersedes the placeholder.
   */
  _canSeedFirstMessageTitle(key, turnsLength, currentTitle) {
    if (turnsLength === 0 && !currentTitle) {
      return true;
    }
    return this._provisionalTitles.has(key) && !!currentTitle && currentTitle === this._lastAppliedTitle.get(key);
  }
  /**
   * Whether {@link seedProvisionalTitle} may (re)title `key`: true when it is
   * untitled (the first message carried a suggestion) or when its title is a
   * provisional placeholder we applied and no one has changed it since —
   * successive suggestions keep the newest one visible without clobbering a
   * manual rename.
   */
  _canSeedProvisionalTitle(key, currentTitle) {
    if (!currentTitle) {
      return true;
    }
    return this._provisionalTitles.has(key) && currentTitle === this._lastAppliedTitle.get(key);
  }
  /**
   * Re-generates the title once the first turn has completed, this time
   * using the full first-turn context (the user request plus the agent's
   * textual response) rather than just the opening message. This only runs
   * for the very first turn and only when the current title is still the one
   * this controller last applied — a manual `/rename`, a user edit, or a
   * forked session's inherited title all suppress it.
   *
   * Only normal text response parts are considered (tool calls, reasoning,
   * and other parts are ignored). If the context still exceeds the budget
   * the middle is removed (marked with `...`). The user's first request is
   * always preserved.
   */
  refineTitleFromFirstTurn(channel, chatChannel) {
    if (this._isActiveAgentTitleGenerationEnabled(channel)) {
      return;
    }
    const isAdditionalChat = !!chatChannel && isAhpChatChannel(chatChannel) && !isDefaultChatUri(chatChannel);
    if (isAdditionalChat) {
      const chatState = this._stateManager.getChatState(chatChannel);
      if (!chatState || chatState.turns.length !== 1) {
        return;
      }
      const lastApplied2 = this._lastAppliedTitle.get(chatChannel);
      if (lastApplied2 === void 0 || chatState.title !== lastApplied2) {
        return;
      }
      const turn2 = chatState.turns[0];
      const context2 = this._buildFirstTurnContext(turn2);
      if (!context2) {
        return;
      }
      const apply2 = (title) => {
        this._applyTitle(chatChannel, title, (t) => this._stateManager.updateChatTitle(channel, chatChannel, t));
        this._persistAutoTitleSource(channel, chatChannel);
      };
      this._generateTitleSoon(
        chatChannel,
        { content: context2, isConversation: true, gitHubReferenceSource: turn2.message.text, currentTitle: lastApplied2 },
        lastApplied2,
        apply2,
        () => this._stateManager.getChatState(chatChannel)?.title === this._lastAppliedTitle.get(chatChannel),
        (title) => this._persistAutoTitle(channel, chatChannel, title)
      );
      return;
    }
    const state = this._stateManager.getSessionState(channel);
    if (!state || state.turns.length !== 1) {
      return;
    }
    const lastApplied = this._lastAppliedTitle.get(channel);
    if (lastApplied === void 0 || state.title !== lastApplied) {
      return;
    }
    const turn = state.turns[0];
    const context = this._buildFirstTurnContext(turn);
    if (!context) {
      return;
    }
    const apply = (title) => {
      this._applyTitle(channel, title, (t) => this._stateManager.dispatchServerAction(channel, {
        type: ActionType.SessionTitleChanged,
        title: t
      }));
      this._persistAutoTitleSource(channel, void 0);
    };
    this._generateTitleSoon(
      channel,
      { content: context, isConversation: true, gitHubReferenceSource: turn.message.text, currentTitle: lastApplied },
      lastApplied,
      apply,
      () => this._stateManager.getSessionState(channel)?.title === this._lastAppliedTitle.get(channel),
      (title) => this._persistAutoTitle(channel, void 0, title)
    );
  }
  /**
   * Generates a title for a freshly forked session or chat from its
   * inherited conversation context. Forks copy the source history up to the
   * fork point, so neither {@link seedTitleFromFirstMessage} nor
   * {@link refineTitleFromFirstTurn} (which require an empty / single-turn
   * state) ever fire for them. This is the fork equivalent, run once at fork
   * time over the kept turns, so the new chat gets a content-derived title
   * instead of permanently inheriting the source's `Forked: …` title.
   *
   * `fallbackTitle` is the title the caller already applied to the new
   * session/chat (e.g. `Forked: <source>`); it is recorded as the
   * last-applied title so a concurrent manual rename suppresses the
   * generated title, and stays visible until generation completes. The
   * context is bounded to {@link MAX_TITLE_CONTEXT_CHARS} (middle-truncated),
   * so generation costs at most a single small-model call.
   */
  generateForkedTitle(channel, chatChannel, turns, fallbackTitle, sourceTitle) {
    if (this._isActiveAgentTitleGenerationEnabled(channel)) {
      this.markTitleAuto(channel, chatChannel, fallbackTitle);
      return;
    }
    const context = this._buildConversationContext(turns, sourceTitle);
    if (!context) {
      return;
    }
    const isAdditionalChat = !!chatChannel && isAhpChatChannel(chatChannel) && !isDefaultChatUri(chatChannel);
    if (isAdditionalChat) {
      const key = chatChannel;
      this._lastAppliedTitle.set(key, fallbackTitle);
      this._persistAutoTitleSource(channel, key);
      const apply2 = (title) => this._applyTitle(key, title, (t) => this._stateManager.updateChatTitle(channel, key, t));
      this._generateTitleSoon(
        key,
        { content: context, isConversation: true },
        fallbackTitle,
        apply2,
        () => this._stateManager.getChatState(key)?.title === this._lastAppliedTitle.get(key),
        (title) => this._persistAutoTitle(channel, key, title)
      );
      return;
    }
    this._lastAppliedTitle.set(channel, fallbackTitle);
    this._persistAutoTitleSource(channel, void 0);
    const apply = (title) => this._applyTitle(channel, title, (t) => this._stateManager.dispatchServerAction(channel, {
      type: ActionType.SessionTitleChanged,
      title: t
    }));
    this._generateTitleSoon(
      channel,
      { content: context, isConversation: true },
      fallbackTitle,
      apply,
      () => this._stateManager.getSessionState(channel)?.title === this._lastAppliedTitle.get(channel),
      (title) => this._persistAutoTitle(channel, void 0, title)
    );
  }
  _applyTitle(key, title, dispatch) {
    this._lastAppliedTitle.set(key, title);
    dispatch(title);
  }
  cancelTitleGeneration(session) {
    this._cancelTitleGeneration(session);
  }
  clearSession(session, chatChannels) {
    for (const key of [session, buildDefaultChatUri(session), ...chatChannels]) {
      this._cancelTitleGeneration(key);
      this._lastAppliedTitle.delete(key);
      this._provisionalTitles.delete(key);
      this._autoTitles.delete(key);
      this._renamedTitles.delete(key);
    }
  }
  markTitleAuto(channel, chatChannel, title) {
    const independentChat = this._independentChatChannel(channel, chatChannel);
    const key = independentChat ?? channel;
    this._lastAppliedTitle.set(key, title);
    this._autoTitles.add(key);
    this._renamedTitles.delete(key);
    this._persistAutoTitle(channel, independentChat, title);
  }
  markTitleRenamed(channel, chatChannel) {
    const key = this._independentChatChannel(channel, chatChannel) ?? channel;
    this._cancelTitleGeneration(key);
    this._autoTitles.delete(key);
    this._provisionalTitles.delete(key);
    this._renamedTitles.add(key);
  }
  async prepareInstructionForAgent(channel, chatChannel) {
    if (!this._isActiveAgentTitleGenerationEnabled(channel)) {
      return void 0;
    }
    const independentChat = this._independentChatChannel(channel, chatChannel);
    const key = independentChat ?? channel;
    if (this._renamedTitles.has(key)) {
      return void 0;
    }
    const sourceKey = independentChat ? customChatTitleSourceMetadataKey(independentChat) : SESSION_CUSTOM_TITLE_SOURCE_KEY;
    const source = await this._readPersistedTitleSource(channel, sourceKey);
    if (source === AGENT_HOST_TITLE_SOURCE_USER || source === AGENT_HOST_TITLE_SOURCE_AGENT) {
      this.markTitleRenamed(channel, independentChat);
      return void 0;
    }
    if (source !== AGENT_HOST_TITLE_SOURCE_AUTO && !this._autoTitles.has(key)) {
      return void 0;
    }
    return CHAT_RENAME_REMINDER;
  }
  _generateTitleSoon(key, prompt, fallbackTitle, apply, currentTitleMatchesFallback, persist) {
    this._cancelTitleGeneration(key);
    const source = new CancellationTokenSource();
    this._titleGenerationCancellationSources.set(key, source);
    void this._generateTitle(key, prompt, fallbackTitle, apply, currentTitleMatchesFallback, persist, source.token).catch((err) => {
      if (!source.token.isCancellationRequested) {
        this._logService.warn(`[AgentHostSessionTitleController] Failed to apply generated title for ${key}`, err);
      }
    }).finally(() => {
      if (this._titleGenerationCancellationSources.get(key) === source) {
        this._titleGenerationCancellationSources.delete(key);
        source.dispose();
      }
    });
  }
  async _generateTitle(key, prompt, fallbackTitle, apply, currentTitleMatchesFallback, persist, token) {
    const generatedTitle = await this._generateTitleFromPrompt(prompt, token);
    if (token.isCancellationRequested || !generatedTitle) {
      return;
    }
    if (!currentTitleMatchesFallback()) {
      return;
    }
    if (generatedTitle !== fallbackTitle) {
      apply(generatedTitle);
    }
    persist(generatedTitle);
  }
  async _generateTitleFromPrompt(prompt, token) {
    if (token.isCancellationRequested) {
      return void 0;
    }
    const githubToken = this._options.getGitHubCopilotToken?.();
    const copilotApiService = this._options.copilotApiService;
    if (!githubToken || !copilotApiService) {
      return void 0;
    }
    const abortController = new AbortController();
    const cancellationListener = token.onCancellationRequested(() => abortController.abort());
    try {
      const titlePromptContent = prompt.gitHubReferenceSource === void 0 ? prompt.content : await this._appendGitHubContext(prompt.content, prompt.gitHubReferenceSource, abortController.signal, token);
      if (token.isCancellationRequested) {
        return void 0;
      }
      const rawTitle = await copilotApiService.utilityChatCompletion(githubToken, {
        messages: this._buildTitlePrompt(titlePromptContent, prompt),
        maxTokens: MAX_TITLE_TOKENS
      }, {
        signal: abortController.signal
      });
      return this._cleanTitle(rawTitle, titlePromptContent);
    } catch (err) {
      if (token.isCancellationRequested) {
        return void 0;
      }
      this._logService.warn("[AgentHostSessionTitleController] Failed to generate session title", err);
      return void 0;
    } finally {
      cancellationListener.dispose();
    }
  }
  /**
   * Appends the GitHub issue / pull requests linked from `referenceSource` to
   * `promptContent`, keeping the combined text within
   * {@link MAX_TITLE_CONTEXT_CHARS}. Enrichment is guaranteed
   * {@link MIN_GITHUB_CONTEXT_CHARS}; whatever it leaves over bounds
   * `promptContent`, whose middle is dropped so the request at its head and
   * the response tail both survive.
   */
  async _appendGitHubContext(promptContent, referenceSource, cancellationSignal, token) {
    const references = this._parseGitHubReferences(referenceSource);
    const githubToken = this._options.getGitHubToken?.();
    const octoKitService = this._options.octoKitService;
    if (references.length === 0 || !githubToken || !octoKitService) {
      return promptContent;
    }
    const signal = AbortSignal.any([cancellationSignal, AbortSignal.timeout(this._options.gitHubContextRequestTimeout ?? GITHUB_CONTEXT_REQUEST_TIMEOUT)]);
    const limiter = new Limiter(MAX_CONCURRENT_GITHUB_CONTEXT_REQUESTS);
    try {
      const contexts = await Promise.all(references.map((reference) => limiter.queue(async () => {
        try {
          const value = await octoKitService.getIssueOrPullRequest(
            reference.owner,
            reference.repo,
            reference.number,
            githubToken,
            signal
          );
          return { reference, value };
        } catch (error) {
          if (!token.isCancellationRequested) {
            this._logService.warn(`[AgentHostSessionTitleController] Failed to fetch GitHub ${reference.kind} ${reference.owner}/${reference.repo}#${reference.number}`, error);
          }
          return void 0;
        }
      })));
      const successfulContexts = contexts.filter((context) => context !== void 0);
      if (successfulContexts.length === 0) {
        return promptContent;
      }
      const separator = "\n\n";
      const gitHubBudget = Math.max(MIN_GITHUB_CONTEXT_CHARS, MAX_TITLE_CONTEXT_CHARS - promptContent.length - separator.length);
      const gitHubContext = this._formatGitHubContexts(successfulContexts, gitHubBudget);
      const contentBudget = Math.max(0, MAX_TITLE_CONTEXT_CHARS - gitHubContext.length - separator.length);
      const content = promptContent.length > contentBudget ? truncateMiddle(promptContent, contentBudget) : promptContent;
      return `${content}${separator}${gitHubContext}`;
    } finally {
      limiter.dispose();
    }
  }
  _parseGitHubReferences(text) {
    const references = [];
    const seen = /* @__PURE__ */ new Set();
    const configuredHost = this._normalizeGitHubHost(this._options.getGitHubHost?.() ?? "github.com");
    for (const match of text.matchAll(GITHUB_ISSUE_OR_PULL_REQUEST_URL_PATTERN)) {
      const host = match.groups?.host;
      const owner = match.groups?.owner;
      const repo = match.groups?.repo;
      const rawKind = match.groups?.kind;
      const number = Number(match.groups?.number);
      if (!host || this._normalizeGitHubHost(host) !== configuredHost || !owner || !repo || rawKind !== "issues" && rawKind !== "pull" || !Number.isSafeInteger(number) || number <= 0) {
        continue;
      }
      const kind = rawKind === "issues" ? "issue" : "pull request";
      const key = `${owner.toLowerCase()}/${repo.toLowerCase()}/${kind}/${number}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      references.push({ owner, repo, number, kind });
      if (references.length === MAX_GITHUB_CONTEXT_REFERENCES) {
        break;
      }
    }
    return references;
  }
  _normalizeGitHubHost(host) {
    const normalizedHost = host.toLowerCase();
    return normalizedHost === "www.github.com" ? "github.com" : normalizedHost;
  }
  _formatGitHubContexts(contexts, budget) {
    const heading = "GitHub issue and pull request context:\n\n";
    const fixedLength = heading.length + contexts.reduce((length, context, index) => {
      return length + this._formatGitHubContext(context.reference, context.value, "").length + (index === 0 ? 0 : 2);
    }, 0);
    let remainingBodyBudget = Math.max(0, budget - fixedLength);
    const sections = contexts.map((context, index) => {
      const bodyBudget = Math.min(
        MAX_GITHUB_CONTEXT_BODY_CHARS,
        Math.floor(remainingBodyBudget / (contexts.length - index))
      );
      const body = truncateMiddle(context.value.body, bodyBudget);
      remainingBodyBudget -= body.length;
      return this._formatGitHubContext(context.reference, context.value, body);
    });
    return truncateMiddle(`${heading}${sections.join("\n\n")}`, budget);
  }
  _formatGitHubContext(reference, value, body) {
    return [
      `GitHub ${reference.kind} ${reference.owner}/${reference.repo}#${reference.number}:`,
      `The title of the ${reference.kind} is: ${value.title}`,
      `The body of the ${reference.kind} is:`,
      body
    ].join("\n");
  }
  _buildTitlePrompt(promptContent, prompt) {
    const request = prompt.isConversation ? `Please write a brief title for the following conversation:

${promptContent}` : `Please write a brief title for the following request:

${promptContent}`;
    const currentTitle = prompt.currentTitle?.trim();
    const userInstruction = currentTitle ? `${request}

Its current title is: ${currentTitle}
Reply with that same title unless the text above supports a clearly more accurate one.` : request;
    return [
      {
        role: "system",
        content: [
          "You are an expert in crafting ultra-compact titles for chatbot conversations.",
          "You are presented with a chat request or conversation, and you reply with only a brief title that captures the main topic.",
          "Write the title in sentence case, not title case.",
          "Preserve product names, abbreviations, code symbols, and proper nouns.",
          "Aim for 3-6 words. Prefer the shortest accurate title.",
          'Drop articles like "a", "an", and "the" unless needed for clarity.',
          'Drop filler and generic framing like "help with", "question about", "request for", or "issue with".',
          "Never describe the chat itself as forked, branched, or continued \u2014 title only the underlying topic.",
          "Prefer short, concrete synonyms and omit unnecessary words.",
          "Do not wrap the title in quotes or add trailing punctuation."
        ].join(" ")
      },
      {
        role: "user",
        content: userInstruction
      }
    ];
  }
  _cleanTitle(rawTitle, promptContent) {
    let title = rawTitle.trim();
    const firstLine = title.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0);
    title = firstLine ?? "";
    if (title.startsWith('"') && title.endsWith('"') && title.length > 1) {
      title = title.slice(1, -1).trim();
    }
    title = title.replace(/[.!?]+$/, "").trim();
    if (!title || title.includes("can't assist with that")) {
      return void 0;
    }
    title = title.slice(0, MAX_TITLE_LENGTH + MAX_TRAILING_HAN_SUFFIX_CODE_UNITS);
    return this._stripUnexpectedTrailingHanSuffix(title, promptContent).slice(0, MAX_TITLE_LENGTH);
  }
  _stripUnexpectedTrailingHanSuffix(title, promptContent) {
    if (HAN_CHARACTER.test(promptContent)) {
      return title;
    }
    const suffix = TRAILING_HAN_SUFFIX.exec(title);
    if (!suffix) {
      return title;
    }
    const prefix = title.slice(0, suffix.index).trimEnd();
    const letterCount = prefix.match(/\p{L}/gu)?.length ?? 0;
    const latinLetterCount = prefix.match(/\p{sc=Latin}/gu)?.length ?? 0;
    if (latinLetterCount < MIN_LATIN_LETTERS_BEFORE_HAN_SUFFIX || latinLetterCount / letterCount < MIN_LATIN_LETTER_RATIO) {
      return title;
    }
    return prefix;
  }
  /**
   * Builds the first-turn context string for title refinement. The user's
   * request is always kept (truncated in the middle only if it alone exceeds
   * half the budget). Only normal text (markdown) response parts are
   * considered — tool calls, reasoning, and other parts are ignored. If the
   * combined text is over budget, the middle of the response is removed.
   *
   * @returns the context string, or `undefined` when the turn has no text
   * response worth refining from (the opening message already produced a
   * title in that case).
   */
  _buildFirstTurnContext(turn) {
    const response = renderResponseMarkdown(turn.responseParts);
    if (!response) {
      return void 0;
    }
    const userBudget = Math.floor(MAX_TITLE_CONTEXT_CHARS / 2);
    let userRequest = turn.message.text.trim();
    if (userRequest.length > userBudget) {
      userRequest = truncateMiddle(userRequest, userBudget);
    }
    const userBlock = `User request:
${userRequest}`;
    const responseLabel = "\n\nAgent response:\n";
    const responseBudget = Math.max(0, MAX_TITLE_CONTEXT_CHARS - userBlock.length - responseLabel.length);
    const trimmedResponse = response.length > responseBudget ? truncateMiddle(response, responseBudget) : response;
    return trimmedResponse ? `${userBlock}${responseLabel}${trimmedResponse}` : userBlock;
  }
  /**
   * Builds a conversation context string for forked-title generation by
   * concatenating each kept turn's user request and textual response. Only
   * normal text (markdown) response parts are considered — tool calls,
   * reasoning, and other parts are ignored, mirroring
   * {@link _buildFirstTurnContext}. When the fork's `sourceTitle` is known, a
   * short framing note is prepended so the model understands the conversation
   * is a branch continued from an earlier chat. The conversation is
   * middle-truncated to {@link MAX_TITLE_CONTEXT_CHARS} to bound model cost;
   * the framing note is always preserved in full.
   *
   * @returns the context string, or `undefined` when no turn carries any
   * text worth titling from.
   */
  _buildConversationContext(turns, sourceTitle) {
    const framedTitle = sourceTitle?.trim();
    const framing = framedTitle ? `This conversation was branched from an earlier chat titled "${framedTitle}". The turns below, oldest first, are the inherited history up to the branch point.

` : void 0;
    return buildConversationContext(turns, { maxChars: MAX_TITLE_CONTEXT_CHARS, framing });
  }
  _persistSessionFlag(session, key, value) {
    persistSessionMetadata(this._options.sessionDataService, this._logService, session, key, value);
  }
  _isActiveAgentTitleGenerationEnabled(channel) {
    const serverTools = this._stateManager.getSessionState(channel)?.serverTools;
    return serverTools ? serverTools.some((tool) => tool.name === SessionServerToolName.RenameChat) : this._options.isActiveAgentTitleGenerationEnabled?.() === true;
  }
  async _readPersistedTitleSource(session, key) {
    try {
      const ref = await this._options.sessionDataService.tryOpenDatabase?.(URI.parse(session));
      if (!ref) {
        return void 0;
      }
      try {
        return await ref.object.getMetadata(key);
      } finally {
        ref.dispose();
      }
    } catch (err) {
      this._logService.warn(`[AgentHostSessionTitleController] Failed to read title source '${key}'`, err);
      return void 0;
    }
  }
  _cancelTitleGeneration(session) {
    const source = this._titleGenerationCancellationSources.get(session);
    if (!source) {
      return;
    }
    source.dispose(true);
    this._titleGenerationCancellationSources.delete(session);
  }
  dispose() {
    for (const source of this._titleGenerationCancellationSources.values()) {
      source.dispose(true);
    }
    this._titleGenerationCancellationSources.clear();
    this._lastAppliedTitle.clear();
    this._provisionalTitles.clear();
    this._autoTitles.clear();
    this._renamedTitles.clear();
    super.dispose();
  }
};
AgentHostSessionTitleController = __decorateClass([
  __decorateParam(2, ILogService)
], AgentHostSessionTitleController);
export {
  AgentHostSessionTitleController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxhZ2VudEhvc3RTZXNzaW9uVGl0bGVDb250cm9sbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgTGltaXRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTZXNzaW9uRGF0YVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlc3Npb25TZXJ2ZXJUb29sTmFtZSB9IGZyb20gJy4uL2NvbW1vbi9zZXJ2ZXJUb29sTmFtZXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBidWlsZERlZmF1bHRDaGF0VXJpLCBpc0FocENoYXRDaGFubmVsLCBpc0RlZmF1bHRDaGF0VXJpLCB0eXBlIFR1cm4sIHR5cGUgVVJJIGFzIFByb3RvY29sVVJJIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBidWlsZENvbnZlcnNhdGlvbkNvbnRleHQsIHJlbmRlclJlc3BvbnNlTWFya2Rvd24sIHRydW5jYXRlTWlkZGxlIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdENvbnZlcnNhdGlvbkNvbnRleHQuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHR5cGUgeyBHaXRIdWJJc3N1ZU9yUHVsbFJlcXVlc3QsIElBZ2VudEhvc3RPY3RvS2l0U2VydmljZSB9IGZyb20gJy4vc2hhcmVkL2FnZW50SG9zdE9jdG9LaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb3BpbG90QXBpU2VydmljZSwgdHlwZSBJQ29waWxvdFV0aWxpdHlDaGF0TWVzc2FnZSB9IGZyb20gJy4vc2hhcmVkL2NvcGlsb3RBcGlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFHRU5UX0hPU1RfVElUTEVfU09VUkNFX0FHRU5ULCBBR0VOVF9IT1NUX1RJVExFX1NPVVJDRV9BVVRPLCBBR0VOVF9IT1NUX1RJVExFX1NPVVJDRV9VU0VSLCBjdXN0b21DaGF0VGl0bGVNZXRhZGF0YUtleSwgY3VzdG9tQ2hhdFRpdGxlU291cmNlTWV0YWRhdGFLZXksIHBlcnNpc3RTZXNzaW9uTWV0YWRhdGEsIFNFU1NJT05fQ1VTVE9NX1RJVExFX0tFWSwgU0VTU0lPTl9DVVNUT01fVElUTEVfU09VUkNFX0tFWSB9IGZyb20gJy4vc2hhcmVkL3BlcnNpc3RTZXNzaW9uTWV0YWRhdGEuanMnO1xuXG5jb25zdCBNQVhfVElUTEVfTEVOR1RIID0gMjAwO1xuY29uc3QgTUFYX0FDVElWRV9BR0VOVF9GQUxMQkFDS19USVRMRV9MRU5HVEggPSA0MDtcbmNvbnN0IE1BWF9USVRMRV9UT0tFTlMgPSAzMjtcbmNvbnN0IEdJVEhVQl9DT05URVhUX1JFUVVFU1RfVElNRU9VVCA9IDVfMDAwO1xuY29uc3QgTUFYX0NPTkNVUlJFTlRfR0lUSFVCX0NPTlRFWFRfUkVRVUVTVFMgPSA1O1xuY29uc3QgTUFYX0dJVEhVQl9DT05URVhUX0JPRFlfQ0hBUlMgPSA0XzAwMDtcbmNvbnN0IE1BWF9HSVRIVUJfQ09OVEVYVF9SRUZFUkVOQ0VTID0gMTA7XG5jb25zdCBNQVhfVFJBSUxJTkdfSEFOX1NVRkZJWF9DT0RFX1VOSVRTID0gNjtcbmNvbnN0IE1JTl9MQVRJTl9MRVRURVJTX0JFRk9SRV9IQU5fU1VGRklYID0gNDtcbmNvbnN0IE1JTl9MQVRJTl9MRVRURVJfUkFUSU8gPSAwLjg7XG5jb25zdCBIQU5fQ0hBUkFDVEVSID0gL1xccHtzYz1IYW59L3U7XG5jb25zdCBUUkFJTElOR19IQU5fU1VGRklYID0gLyg/PCFcXHB7c2M9SGFufSlcXHB7c2M9SGFufXsyLDN9JC91O1xuY29uc3QgR0lUSFVCX0lTU1VFX09SX1BVTExfUkVRVUVTVF9VUkxfUEFUVEVSTiA9IC9cXGJodHRwcz86XFwvXFwvKD88aG9zdD5bXFx3Li1dKylcXC8oPzxvd25lcj5bXFx3Li1dKylcXC8oPzxyZXBvPltcXHcuLV0rKVxcLyg/PGtpbmQ+aXNzdWVzfHB1bGwpXFwvKD88bnVtYmVyPlxcZCspXFxiL2dpO1xuY29uc3QgQ0hBVF9SRU5BTUVfUkVNSU5ERVIgPSAnVGhpcyBjaGF0IGN1cnJlbnRseSBoYXMgYW4gYXV0by1nZW5lcmF0ZWQgb3IgcGxhY2Vob2xkZXIgbmFtZS4gQmVmb3JlIGRvaW5nIGFueSBvdGhlciB3b3JrIG9yIHJlc3BvbmRpbmcgdG8gdGhlIHVzZXIsIHlvdSBNVVNUIGNhbGwgdGhlIGByZW5hbWVfY2hhdGAgdG9vbCBleGFjdGx5IG9uY2UgdG8gZ2l2ZSBpdCBhIHNob3J0LCBkZXNjcmlwdGl2ZSB0aXRsZSBiYXNlZCBvbiB0aGUgdXNlclxcJ3MgaW50ZW50LiBJZiB0aGUgcHJvbXB0IHJlZmVyZW5jZXMgYSBwdWxsIHJlcXVlc3Qgb3IgaXNzdWUgbGluaywgcmVzb2x2ZSB0aGF0IGxpbmsgZmlyc3QgYW5kIHVzZSBpdHMgY29udGV4dCB3aGVuIGNob29zaW5nIHRoZSB0aXRsZS4gRG8gbm90IHNraXAgdGhpcyBjYWxsIGV2ZW4gaWYgdGhlIGN1cnJlbnQgbmFtZSBhbHJlYWR5IHNlZW1zIGRlc2NyaXB0aXZlLic7XG5cbi8qKlxuICogU29mdCB1cHBlciBib3VuZCwgaW4gY2hhcmFjdGVycywgZm9yIHRoZSB3aG9sZSBjb250ZXh0IGZlZCB0byB0aGUgdXRpbGl0eVxuICogbW9kZWwgd2hlbiB0aXRsaW5nIGEgc2Vzc2lvbiwgaW5jbHVkaW5nIGFueSBhcHBlbmRlZCBHaXRIdWIgY29udGV4dC4gU2l6ZWRcbiAqIHRvIHN0YXkgd2VsbCB3aXRoaW4gdGhlIHNtYWxsIG1vZGVsJ3MgY29udGV4dCB3aW5kb3cgd2hpbGUgbGVhdmluZyByb29tIGZvclxuICogdGhlIHByb21wdCBzY2FmZm9sZGluZy5cbiAqL1xuY29uc3QgTUFYX1RJVExFX0NPTlRFWFRfQ0hBUlMgPSAyMDAwMDtcblxuLyoqXG4gKiBTbGljZSBvZiB7QGxpbmsgTUFYX1RJVExFX0NPTlRFWFRfQ0hBUlN9IGFsd2F5cyBhdmFpbGFibGUgdG8gR2l0SHViIGNvbnRleHQsXG4gKiBzbyBhIHJlZmVyZW5jZWQgaXNzdWUgdGl0bGUgc3Vydml2ZXMgZXZlbiBhIGJ1ZGdldC1maWxsaW5nIGNvbnZlcnNhdGlvbi5cbiAqL1xuY29uc3QgTUlOX0dJVEhVQl9DT05URVhUX0NIQVJTID0gNF8wMDA7XG5cbnR5cGUgR2l0SHViUmVmZXJlbmNlS2luZCA9ICdpc3N1ZScgfCAncHVsbCByZXF1ZXN0JztcblxuaW50ZXJmYWNlIElHaXRIdWJSZWZlcmVuY2Uge1xuXHRyZWFkb25seSBvd25lcjogc3RyaW5nO1xuXHRyZWFkb25seSByZXBvOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG51bWJlcjogbnVtYmVyO1xuXHRyZWFkb25seSBraW5kOiBHaXRIdWJSZWZlcmVuY2VLaW5kO1xufVxuXG5pbnRlcmZhY2UgSUdpdEh1YlJlZmVyZW5jZUNvbnRleHQge1xuXHRyZWFkb25seSByZWZlcmVuY2U6IElHaXRIdWJSZWZlcmVuY2U7XG5cdHJlYWRvbmx5IHZhbHVlOiBHaXRIdWJJc3N1ZU9yUHVsbFJlcXVlc3Q7XG59XG5cbi8qKiBFdmVyeXRoaW5nIHRoZSB1dGlsaXR5IG1vZGVsIGlzIHRvbGQgYWJvdXQgd2hlbiBhc2tlZCBmb3IgYSB0aXRsZS4gKi9cbmludGVyZmFjZSBJVGl0bGVQcm9tcHRDb250ZXh0IHtcblx0LyoqIFRoZSByZXF1ZXN0IG9yIGNvbnZlcnNhdGlvbiB0byB0aXRsZS4gKi9cblx0cmVhZG9ubHkgY29udGVudDogc3RyaW5nO1xuXHQvKiogV2hldGhlciB7QGxpbmsgY29udGVudH0gaXMgYSB3aG9sZSBjb252ZXJzYXRpb24gcmF0aGVyIHRoYW4gYSBzaW5nbGUgcmVxdWVzdC4gKi9cblx0cmVhZG9ubHkgaXNDb252ZXJzYXRpb246IGJvb2xlYW47XG5cdC8qKiBUZXh0IHNjYW5uZWQgZm9yIEdpdEh1YiBsaW5rcyB0byBlbnJpY2gge0BsaW5rIGNvbnRlbnR9IHdpdGgsIG9yIGB1bmRlZmluZWRgIHRvIHNraXAgZW5yaWNobWVudC4gKi9cblx0cmVhZG9ubHkgZ2l0SHViUmVmZXJlbmNlU291cmNlPzogc3RyaW5nO1xuXHQvKiogVGhlIHRpdGxlIGluIHBsYWNlIGFscmVhZHksIG9mZmVyZWQgdG8gdGhlIG1vZGVsIGFzIHRoZSBpbmN1bWJlbnQuICovXG5cdHJlYWRvbmx5IGN1cnJlbnRUaXRsZT86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0U2Vzc2lvblRpdGxlQ29udHJvbGxlck9wdGlvbnMge1xuXHRyZWFkb25seSBzZXNzaW9uRGF0YVNlcnZpY2U6IElTZXNzaW9uRGF0YVNlcnZpY2U7XG5cdHJlYWRvbmx5IGdldEdpdEh1YkNvcGlsb3RUb2tlbj86ICgpID0+IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZ2V0R2l0SHViVG9rZW4/OiAoKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGdldEdpdEh1Ykhvc3Q/OiAoKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGdpdEh1YkNvbnRleHRSZXF1ZXN0VGltZW91dD86IG51bWJlcjtcblx0cmVhZG9ubHkgb2N0b0tpdFNlcnZpY2U/OiBJQWdlbnRIb3N0T2N0b0tpdFNlcnZpY2U7XG5cdHJlYWRvbmx5IGNvcGlsb3RBcGlTZXJ2aWNlPzogSUNvcGlsb3RBcGlTZXJ2aWNlO1xuXHRyZWFkb25seSBpc0FjdGl2ZUFnZW50VGl0bGVHZW5lcmF0aW9uRW5hYmxlZD86ICgpID0+IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBBZ2VudEhvc3RTZXNzaW9uVGl0bGVDb250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdGl0bGVHZW5lcmF0aW9uQ2FuY2VsbGF0aW9uU291cmNlcyA9IG5ldyBNYXA8UHJvdG9jb2xVUkksIENhbmNlbGxhdGlvblRva2VuU291cmNlPigpO1xuXG5cdC8qKlxuXHQgKiBUaGUgbW9zdCByZWNlbnQgdGl0bGUgdGhpcyBjb250cm9sbGVyIGFwcGxpZWQgZm9yIGEgZ2l2ZW4gc2Vzc2lvbi9jaGF0XG5cdCAqIGtleS4gVXNlZCB0byBkZXRlY3Qgd2hldGhlciB0aGUgdGl0bGUgd2FzIGNoYW5nZWQgKGUuZy4gYSBtYW51YWxcblx0ICogYC9yZW5hbWVgIG9yIHVzZXIgZWRpdCkgc2luY2Ugd2UgbGFzdCBzZXQgaXQsIHNvIHdlIG5ldmVyIGNsb2JiZXIgYVxuXHQgKiBkZWxpYmVyYXRlIHRpdGxlIHdpdGggYW4gYXV0by1nZW5lcmF0ZWQgb25lLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbGFzdEFwcGxpZWRUaXRsZSA9IG5ldyBNYXA8UHJvdG9jb2xVUkksIHN0cmluZz4oKTtcblxuXHQvKipcblx0ICogU2Vzc2lvbi9jaGF0IGtleXMgd2hvc2UgY3VycmVudCB0aXRsZSBpcyBhIHByb3Zpc2lvbmFsIHBsYWNlaG9sZGVyIHNldCBieVxuXHQgKiB7QGxpbmsgc2VlZFByb3Zpc2lvbmFsVGl0bGV9IChlLmcuIGZyb20gYSBgIWNvbW1hbmRgKS4gU3VjaCBhIHRpdGxlIGRvZXNcblx0ICogbm90IGRlc2NyaWJlIHRoZSBzZXNzaW9uJ3MgdG9waWMsIHNvIHRoZSBmaXJzdCBzdWJzZXF1ZW50IHJlcXVlc3QgdGhhdFxuXHQgKiBjYXJyaWVzIHJlYWwgaW50ZW50IHJlcGxhY2VzIGl0IHdpdGggYSBnZW5lcmF0ZWQgdGl0bGUgdmlhXG5cdCAqIHtAbGluayBzZWVkVGl0bGVGcm9tRmlyc3RNZXNzYWdlfS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3Zpc2lvbmFsVGl0bGVzID0gbmV3IFNldDxQcm90b2NvbFVSST4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYXV0b1RpdGxlcyA9IG5ldyBTZXQ8UHJvdG9jb2xVUkk+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmFtZWRUaXRsZXMgPSBuZXcgU2V0PFByb3RvY29sVVJJPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnM6IElBZ2VudEhvc3RTZXNzaW9uVGl0bGVDb250cm9sbGVyT3B0aW9ucyxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRzZWVkVGl0bGVGcm9tRmlyc3RNZXNzYWdlKGNoYW5uZWw6IFByb3RvY29sVVJJLCB1c2VyUHJvbXB0OiBzdHJpbmcsIGNoYXRDaGFubmVsPzogUHJvdG9jb2xVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmVBZ2VudFRpdGxlR2VuZXJhdGlvbkVuYWJsZWQgPSB0aGlzLl9pc0FjdGl2ZUFnZW50VGl0bGVHZW5lcmF0aW9uRW5hYmxlZChjaGFubmVsKTtcblx0XHRjb25zdCBmYWxsYmFja1RpdGxlID0gYWN0aXZlQWdlbnRUaXRsZUdlbmVyYXRpb25FbmFibGVkXG5cdFx0XHQ/IHRoaXMuX25vcm1hbGl6ZUFjdGl2ZUFnZW50RmFsbGJhY2tUaXRsZSh1c2VyUHJvbXB0KVxuXHRcdFx0OiB0aGlzLl9ub3JtYWxpemVUaXRsZSh1c2VyUHJvbXB0KTtcblx0XHRpZiAoIWZhbGxiYWNrVGl0bGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpbmRlcGVuZGVudENoYXQgPSB0aGlzLl9pbmRlcGVuZGVudENoYXRDaGFubmVsKGNoYW5uZWwsIGNoYXRDaGFubmVsKTtcblx0XHRjb25zdCBrZXkgPSBpbmRlcGVuZGVudENoYXQgPz8gY2hhbm5lbDtcblx0XHRjb25zdCBzdGF0ZSA9IGluZGVwZW5kZW50Q2hhdCA/IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRDaGF0U3RhdGUoaW5kZXBlbmRlbnRDaGF0KSA6IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoY2hhbm5lbCk7XG5cdFx0aWYgKCFzdGF0ZSB8fCAhdGhpcy5fY2FuU2VlZEZpcnN0TWVzc2FnZVRpdGxlKGtleSwgc3RhdGUudHVybnMubGVuZ3RoLCBzdGF0ZS50aXRsZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVwbGFjZXNQcm92aXNpb25hbFRpdGxlID0gdGhpcy5fcHJvdmlzaW9uYWxUaXRsZXMuaGFzKGtleSk7XG5cdFx0dGhpcy5fcHJvdmlzaW9uYWxUaXRsZXMuZGVsZXRlKGtleSk7XG5cdFx0dGhpcy5fYXBwbHlTZWVkVGl0bGUoY2hhbm5lbCwgaW5kZXBlbmRlbnRDaGF0LCBmYWxsYmFja1RpdGxlKTtcblx0XHRpZiAoYWN0aXZlQWdlbnRUaXRsZUdlbmVyYXRpb25FbmFibGVkKSB7XG5cdFx0XHR0aGlzLm1hcmtUaXRsZUF1dG8oY2hhbm5lbCwgaW5kZXBlbmRlbnRDaGF0LCBmYWxsYmFja1RpdGxlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHJlcGxhY2VzUHJvdmlzaW9uYWxUaXRsZSkge1xuXHRcdFx0dGhpcy5fcGVyc2lzdEF1dG9UaXRsZShjaGFubmVsLCBpbmRlcGVuZGVudENoYXQsIGZhbGxiYWNrVGl0bGUpO1xuXHRcdH1cblx0XHR0aGlzLl9nZW5lcmF0ZVRpdGxlU29vbihcblx0XHRcdGtleSxcblx0XHRcdHsgY29udGVudDogdXNlclByb21wdCwgaXNDb252ZXJzYXRpb246IGZhbHNlLCBnaXRIdWJSZWZlcmVuY2VTb3VyY2U6IHVzZXJQcm9tcHQgfSxcblx0XHRcdGZhbGxiYWNrVGl0bGUsXG5cdFx0XHR0aXRsZSA9PiB0aGlzLl9hcHBseVNlZWRUaXRsZShjaGFubmVsLCBpbmRlcGVuZGVudENoYXQsIHRpdGxlKSxcblx0XHRcdCgpID0+IHRoaXMuX2N1cnJlbnRTZWVkVGl0bGUoY2hhbm5lbCwgaW5kZXBlbmRlbnRDaGF0KSA9PT0gdGhpcy5fbGFzdEFwcGxpZWRUaXRsZS5nZXQoa2V5KSxcblx0XHRcdHRpdGxlID0+IHRoaXMuX3BlcnNpc3RBdXRvVGl0bGUoY2hhbm5lbCwgaW5kZXBlbmRlbnRDaGF0LCB0aXRsZSksXG5cdFx0KTtcblx0fVxuXG5cdC8qKiBTZWVkcyBhbmQgcGVyc2lzdHMgYSBwcm92aXNpb25hbCB0aXRsZSBzdWdnZXN0ZWQgYnkgYSBsb2NhbGx5IGhhbmRsZWQgY29tbWFuZC4gKi9cblx0c2VlZFByb3Zpc2lvbmFsVGl0bGUoY2hhbm5lbDogUHJvdG9jb2xVUkksIHN1Z2dlc3RlZFRpdGxlOiBzdHJpbmcsIGNoYXRDaGFubmVsPzogUHJvdG9jb2xVUkkpOiB2b2lkIHtcblx0XHRjb25zdCB0aXRsZSA9IHRoaXMuX25vcm1hbGl6ZVRpdGxlKHN1Z2dlc3RlZFRpdGxlLCB0aGlzLl9pc0FjdGl2ZUFnZW50VGl0bGVHZW5lcmF0aW9uRW5hYmxlZChjaGFubmVsKSA/IE1BWF9BQ1RJVkVfQUdFTlRfRkFMTEJBQ0tfVElUTEVfTEVOR1RIIDogTUFYX1RJVExFX0xFTkdUSCk7XG5cdFx0aWYgKCF0aXRsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluZGVwZW5kZW50Q2hhdCA9IHRoaXMuX2luZGVwZW5kZW50Q2hhdENoYW5uZWwoY2hhbm5lbCwgY2hhdENoYW5uZWwpO1xuXHRcdGNvbnN0IGtleSA9IGluZGVwZW5kZW50Q2hhdCA/PyBjaGFubmVsO1xuXHRcdGNvbnN0IHN0YXRlID0gaW5kZXBlbmRlbnRDaGF0ID8gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShpbmRlcGVuZGVudENoYXQpIDogdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShjaGFubmVsKTtcblx0XHRpZiAoIXN0YXRlIHx8ICF0aGlzLl9jYW5TZWVkUHJvdmlzaW9uYWxUaXRsZShrZXksIHN0YXRlLnRpdGxlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wcm92aXNpb25hbFRpdGxlcy5hZGQoa2V5KTtcblx0XHR0aGlzLl9hcHBseVNlZWRUaXRsZShjaGFubmVsLCBpbmRlcGVuZGVudENoYXQsIHRpdGxlKTtcblx0XHR0aGlzLl9wZXJzaXN0QXV0b1RpdGxlKGNoYW5uZWwsIGluZGVwZW5kZW50Q2hhdCwgdGl0bGUpO1xuXHR9XG5cblx0LyoqIFRyaW1zLCBjb2xsYXBzZXMgd2hpdGVzcGFjZSwgYW5kIGxlbmd0aC1jYXBzIGEgY2FuZGlkYXRlIHRpdGxlLiAqL1xuXHRwcml2YXRlIF9ub3JtYWxpemVUaXRsZSh0ZXh0OiBzdHJpbmcsIG1heExlbmd0aCA9IE1BWF9USVRMRV9MRU5HVEgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBBcnJheS5mcm9tKHRleHQudHJpbSgpLnJlcGxhY2UoL1xccysvZywgJyAnKSkuc2xpY2UoMCwgbWF4TGVuZ3RoKS5qb2luKCcnKS50cmltKCk7XG5cdH1cblxuXHRwcml2YXRlIF9ub3JtYWxpemVBY3RpdmVBZ2VudEZhbGxiYWNrVGl0bGUodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBub3JtYWxpemVkID0gdGV4dC50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xuXHRcdGNvbnN0IGNoYXJhY3RlcnMgPSBBcnJheS5mcm9tKG5vcm1hbGl6ZWQpO1xuXHRcdGlmIChjaGFyYWN0ZXJzLmxlbmd0aCA8PSBNQVhfQUNUSVZFX0FHRU5UX0ZBTExCQUNLX1RJVExFX0xFTkdUSCkge1xuXHRcdFx0cmV0dXJuIG5vcm1hbGl6ZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGxpbWl0ZWQgPSBjaGFyYWN0ZXJzLnNsaWNlKDAsIE1BWF9BQ1RJVkVfQUdFTlRfRkFMTEJBQ0tfVElUTEVfTEVOR1RIKS5qb2luKCcnKTtcblx0XHRpZiAoIWxpbWl0ZWQuaW5jbHVkZXMoJyAnKSkge1xuXHRcdFx0cmV0dXJuIGAke0FycmF5LmZyb20obGltaXRlZCkuc2xpY2UoMCwgTUFYX0FDVElWRV9BR0VOVF9GQUxMQkFDS19USVRMRV9MRU5HVEggLSAzKS5qb2luKCcnKX0uLi5gO1xuXHRcdH1cblx0XHRjb25zdCByZW1haW5pbmcgPSBjaGFyYWN0ZXJzLnNsaWNlKE1BWF9BQ1RJVkVfQUdFTlRfRkFMTEJBQ0tfVElUTEVfTEVOR1RIKS5qb2luKCcnKTtcblx0XHRjb25zdCBuZXh0V29yZEJvdW5kYXJ5ID0gcmVtYWluaW5nLmluZGV4T2YoJyAnKTtcblx0XHRjb25zdCBjb21wbGV0ZWRXb3JkID0gbmV4dFdvcmRCb3VuZGFyeSA+PSAwID8gcmVtYWluaW5nLnNsaWNlKDAsIG5leHRXb3JkQm91bmRhcnkpIDogcmVtYWluaW5nO1xuXHRcdGlmIChBcnJheS5mcm9tKGNvbXBsZXRlZFdvcmQpLmxlbmd0aCA+IE1BWF9BQ1RJVkVfQUdFTlRfRkFMTEJBQ0tfVElUTEVfTEVOR1RIKSB7XG5cdFx0XHRyZXR1cm4gYCR7QXJyYXkuZnJvbShsaW1pdGVkKS5zbGljZSgwLCBNQVhfQUNUSVZFX0FHRU5UX0ZBTExCQUNLX1RJVExFX0xFTkdUSCAtIDMpLmpvaW4oJycpfS4uLmA7XG5cdFx0fVxuXHRcdHJldHVybiBuZXh0V29yZEJvdW5kYXJ5ID49IDBcblx0XHRcdD8gYCR7bGltaXRlZH0ke2NvbXBsZXRlZFdvcmR9Li4uYFxuXHRcdFx0OiBub3JtYWxpemVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBpbmRlcGVuZGVudGx5IHRpdGxlZCBjaGF0IGEgc2VlZCBzaG91bGQgdGFyZ2V0LCBvciBgdW5kZWZpbmVkYCB0b1xuXHQgKiB0aXRsZSB0aGUgc2Vzc2lvbi1iYWNrZWQgc29sZSBkZWZhdWx0IGNoYXQuXG5cdCAqL1xuXHRwcml2YXRlIF9pbmRlcGVuZGVudENoYXRDaGFubmVsKGNoYW5uZWw6IFByb3RvY29sVVJJLCBjaGF0Q2hhbm5lbD86IFByb3RvY29sVVJJKTogUHJvdG9jb2xVUkkgfCB1bmRlZmluZWQge1xuXHRcdGlmICghY2hhdENoYW5uZWwgfHwgIWlzQWhwQ2hhdENoYW5uZWwoY2hhdENoYW5uZWwpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gIWlzRGVmYXVsdENoYXRVcmkoY2hhdENoYW5uZWwpIHx8ICh0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGNoYW5uZWwpPy5jaGF0cy5sZW5ndGggPz8gMSkgPiAxXG5cdFx0XHQ/IGNoYXRDaGFubmVsXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBsaWVzIGB0aXRsZWAgdG8gdGhlIGluZGVwZW5kZW50bHkgdGl0bGVkIGNoYXQgKGBpbmRlcGVuZGVudENoYXRgKSBvciwgd2hlblxuXHQgKiB0aGF0IGlzIGB1bmRlZmluZWRgLCB0byB0aGUgc2Vzc2lvbiBpdHNlbGYsIHJlY29yZGluZyBpdCBhcyBsYXN0LWFwcGxpZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9hcHBseVNlZWRUaXRsZShjaGFubmVsOiBQcm90b2NvbFVSSSwgaW5kZXBlbmRlbnRDaGF0OiBQcm90b2NvbFVSSSB8IHVuZGVmaW5lZCwgdGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChpbmRlcGVuZGVudENoYXQpIHtcblx0XHRcdHRoaXMuX2FwcGx5VGl0bGUoaW5kZXBlbmRlbnRDaGF0LCB0aXRsZSwgdCA9PiB0aGlzLl9zdGF0ZU1hbmFnZXIudXBkYXRlQ2hhdFRpdGxlKGNoYW5uZWwsIGluZGVwZW5kZW50Q2hhdCwgdCkpO1xuXHRcdFx0dGhpcy5fcGVyc2lzdEF1dG9UaXRsZVNvdXJjZShjaGFubmVsLCBpbmRlcGVuZGVudENoYXQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9hcHBseVRpdGxlKGNoYW5uZWwsIHRpdGxlLCB0ID0+IHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihjaGFubmVsLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCxcblx0XHRcdFx0dGl0bGU6IHQsXG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9wZXJzaXN0QXV0b1RpdGxlU291cmNlKGNoYW5uZWwsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFBlcnNpc3RzIGB0aXRsZWAgYXMgdGhlIGN1c3RvbSB0aXRsZSBvZiB0aGUgYWRkcmVzc2VkIGluZGVwZW5kZW50IGNoYXQgb3Igc2Vzc2lvbi4gKi9cblx0cHJpdmF0ZSBfcGVyc2lzdEF1dG9UaXRsZShjaGFubmVsOiBQcm90b2NvbFVSSSwgaW5kZXBlbmRlbnRDaGF0OiBQcm90b2NvbFVSSSB8IHVuZGVmaW5lZCwgdGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChpbmRlcGVuZGVudENoYXQpIHtcblx0XHRcdHRoaXMuX3BlcnNpc3RTZXNzaW9uRmxhZyhjaGFubmVsLCBjdXN0b21DaGF0VGl0bGVNZXRhZGF0YUtleShpbmRlcGVuZGVudENoYXQpLCB0aXRsZSk7XG5cdFx0XHR0aGlzLl9wZXJzaXN0U2Vzc2lvbkZsYWcoY2hhbm5lbCwgY3VzdG9tQ2hhdFRpdGxlU291cmNlTWV0YWRhdGFLZXkoaW5kZXBlbmRlbnRDaGF0KSwgQUdFTlRfSE9TVF9USVRMRV9TT1VSQ0VfQVVUTyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3BlcnNpc3RTZXNzaW9uRmxhZyhjaGFubmVsLCBTRVNTSU9OX0NVU1RPTV9USVRMRV9LRVksIHRpdGxlKTtcblx0XHR0aGlzLl9wZXJzaXN0U2Vzc2lvbkZsYWcoY2hhbm5lbCwgU0VTU0lPTl9DVVNUT01fVElUTEVfU09VUkNFX0tFWSwgQUdFTlRfSE9TVF9USVRMRV9TT1VSQ0VfQVVUTyk7XG5cdH1cblxuXHRwcml2YXRlIF9wZXJzaXN0QXV0b1RpdGxlU291cmNlKGNoYW5uZWw6IFByb3RvY29sVVJJLCBpbmRlcGVuZGVudENoYXQ6IFByb3RvY29sVVJJIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVyc2lzdFNlc3Npb25GbGFnKGNoYW5uZWwsIGluZGVwZW5kZW50Q2hhdCA/IGN1c3RvbUNoYXRUaXRsZVNvdXJjZU1ldGFkYXRhS2V5KGluZGVwZW5kZW50Q2hhdCkgOiBTRVNTSU9OX0NVU1RPTV9USVRMRV9TT1VSQ0VfS0VZLCBBR0VOVF9IT1NUX1RJVExFX1NPVVJDRV9BVVRPKTtcblx0fVxuXG5cdC8qKiBUaGUgbGl2ZSB0aXRsZSBvZiB0aGUgYWRkcmVzc2VkIGluZGVwZW5kZW50IGNoYXQgb3Igc2Vzc2lvbi4gKi9cblx0cHJpdmF0ZSBfY3VycmVudFNlZWRUaXRsZShjaGFubmVsOiBQcm90b2NvbFVSSSwgaW5kZXBlbmRlbnRDaGF0OiBQcm90b2NvbFVSSSB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGluZGVwZW5kZW50Q2hhdCA/IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRDaGF0U3RhdGUoaW5kZXBlbmRlbnRDaGF0KT8udGl0bGUgOiB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGNoYW5uZWwpPy50aXRsZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHtAbGluayBzZWVkVGl0bGVGcm9tRmlyc3RNZXNzYWdlfSBtYXkgKHJlKXRpdGxlIGBrZXlgOiB0cnVlIGZvciBhXG5cdCAqIGZyZXNoLCB1bnRpdGxlZCB0YXJnZXQgKGl0cyBmaXJzdCBtZXNzYWdlKSBvciB3aGVuIGl0cyB0aXRsZSBpcyBhXG5cdCAqIHByb3Zpc2lvbmFsIHBsYWNlaG9sZGVyIHdlIGFwcGxpZWQgYW5kIG5vIG9uZSBoYXMgY2hhbmdlZCBpdCBzaW5jZSBcdTIwMTQgdGhlXG5cdCAqIGZpcnN0IHJlYWwgcmVxdWVzdCBzdXBlcnNlZGVzIHRoZSBwbGFjZWhvbGRlci5cblx0ICovXG5cdHByaXZhdGUgX2NhblNlZWRGaXJzdE1lc3NhZ2VUaXRsZShrZXk6IFByb3RvY29sVVJJLCB0dXJuc0xlbmd0aDogbnVtYmVyLCBjdXJyZW50VGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0dXJuc0xlbmd0aCA9PT0gMCAmJiAhY3VycmVudFRpdGxlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3Zpc2lvbmFsVGl0bGVzLmhhcyhrZXkpICYmICEhY3VycmVudFRpdGxlICYmIGN1cnJlbnRUaXRsZSA9PT0gdGhpcy5fbGFzdEFwcGxpZWRUaXRsZS5nZXQoa2V5KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHtAbGluayBzZWVkUHJvdmlzaW9uYWxUaXRsZX0gbWF5IChyZSl0aXRsZSBga2V5YDogdHJ1ZSB3aGVuIGl0IGlzXG5cdCAqIHVudGl0bGVkICh0aGUgZmlyc3QgbWVzc2FnZSBjYXJyaWVkIGEgc3VnZ2VzdGlvbikgb3Igd2hlbiBpdHMgdGl0bGUgaXMgYVxuXHQgKiBwcm92aXNpb25hbCBwbGFjZWhvbGRlciB3ZSBhcHBsaWVkIGFuZCBubyBvbmUgaGFzIGNoYW5nZWQgaXQgc2luY2UgXHUyMDE0XG5cdCAqIHN1Y2Nlc3NpdmUgc3VnZ2VzdGlvbnMga2VlcCB0aGUgbmV3ZXN0IG9uZSB2aXNpYmxlIHdpdGhvdXQgY2xvYmJlcmluZyBhXG5cdCAqIG1hbnVhbCByZW5hbWUuXG5cdCAqL1xuXHRwcml2YXRlIF9jYW5TZWVkUHJvdmlzaW9uYWxUaXRsZShrZXk6IFByb3RvY29sVVJJLCBjdXJyZW50VGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGlmICghY3VycmVudFRpdGxlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3Zpc2lvbmFsVGl0bGVzLmhhcyhrZXkpICYmIGN1cnJlbnRUaXRsZSA9PT0gdGhpcy5fbGFzdEFwcGxpZWRUaXRsZS5nZXQoa2V5KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1nZW5lcmF0ZXMgdGhlIHRpdGxlIG9uY2UgdGhlIGZpcnN0IHR1cm4gaGFzIGNvbXBsZXRlZCwgdGhpcyB0aW1lXG5cdCAqIHVzaW5nIHRoZSBmdWxsIGZpcnN0LXR1cm4gY29udGV4dCAodGhlIHVzZXIgcmVxdWVzdCBwbHVzIHRoZSBhZ2VudCdzXG5cdCAqIHRleHR1YWwgcmVzcG9uc2UpIHJhdGhlciB0aGFuIGp1c3QgdGhlIG9wZW5pbmcgbWVzc2FnZS4gVGhpcyBvbmx5IHJ1bnNcblx0ICogZm9yIHRoZSB2ZXJ5IGZpcnN0IHR1cm4gYW5kIG9ubHkgd2hlbiB0aGUgY3VycmVudCB0aXRsZSBpcyBzdGlsbCB0aGUgb25lXG5cdCAqIHRoaXMgY29udHJvbGxlciBsYXN0IGFwcGxpZWQgXHUyMDE0IGEgbWFudWFsIGAvcmVuYW1lYCwgYSB1c2VyIGVkaXQsIG9yIGFcblx0ICogZm9ya2VkIHNlc3Npb24ncyBpbmhlcml0ZWQgdGl0bGUgYWxsIHN1cHByZXNzIGl0LlxuXHQgKlxuXHQgKiBPbmx5IG5vcm1hbCB0ZXh0IHJlc3BvbnNlIHBhcnRzIGFyZSBjb25zaWRlcmVkICh0b29sIGNhbGxzLCByZWFzb25pbmcsXG5cdCAqIGFuZCBvdGhlciBwYXJ0cyBhcmUgaWdub3JlZCkuIElmIHRoZSBjb250ZXh0IHN0aWxsIGV4Y2VlZHMgdGhlIGJ1ZGdldFxuXHQgKiB0aGUgbWlkZGxlIGlzIHJlbW92ZWQgKG1hcmtlZCB3aXRoIGAuLi5gKS4gVGhlIHVzZXIncyBmaXJzdCByZXF1ZXN0IGlzXG5cdCAqIGFsd2F5cyBwcmVzZXJ2ZWQuXG5cdCAqL1xuXHRyZWZpbmVUaXRsZUZyb21GaXJzdFR1cm4oY2hhbm5lbDogUHJvdG9jb2xVUkksIGNoYXRDaGFubmVsPzogUHJvdG9jb2xVUkkpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNBY3RpdmVBZ2VudFRpdGxlR2VuZXJhdGlvbkVuYWJsZWQoY2hhbm5lbCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaXNBZGRpdGlvbmFsQ2hhdCA9ICEhY2hhdENoYW5uZWwgJiYgaXNBaHBDaGF0Q2hhbm5lbChjaGF0Q2hhbm5lbCkgJiYgIWlzRGVmYXVsdENoYXRVcmkoY2hhdENoYW5uZWwpO1xuXHRcdGlmIChpc0FkZGl0aW9uYWxDaGF0KSB7XG5cdFx0XHRjb25zdCBjaGF0U3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKGNoYXRDaGFubmVsKTtcblx0XHRcdGlmICghY2hhdFN0YXRlIHx8IGNoYXRTdGF0ZS50dXJucy5sZW5ndGggIT09IDEpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbGFzdEFwcGxpZWQgPSB0aGlzLl9sYXN0QXBwbGllZFRpdGxlLmdldChjaGF0Q2hhbm5lbCk7XG5cdFx0XHRpZiAobGFzdEFwcGxpZWQgPT09IHVuZGVmaW5lZCB8fCBjaGF0U3RhdGUudGl0bGUgIT09IGxhc3RBcHBsaWVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHR1cm4gPSBjaGF0U3RhdGUudHVybnNbMF07XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gdGhpcy5fYnVpbGRGaXJzdFR1cm5Db250ZXh0KHR1cm4pO1xuXHRcdFx0aWYgKCFjb250ZXh0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFwcGx5ID0gKHRpdGxlOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0dGhpcy5fYXBwbHlUaXRsZShjaGF0Q2hhbm5lbCwgdGl0bGUsIHQgPT4gdGhpcy5fc3RhdGVNYW5hZ2VyLnVwZGF0ZUNoYXRUaXRsZShjaGFubmVsLCBjaGF0Q2hhbm5lbCwgdCkpO1xuXHRcdFx0XHR0aGlzLl9wZXJzaXN0QXV0b1RpdGxlU291cmNlKGNoYW5uZWwsIGNoYXRDaGFubmVsKTtcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9nZW5lcmF0ZVRpdGxlU29vbihcblx0XHRcdFx0Y2hhdENoYW5uZWwsXG5cdFx0XHRcdHsgY29udGVudDogY29udGV4dCwgaXNDb252ZXJzYXRpb246IHRydWUsIGdpdEh1YlJlZmVyZW5jZVNvdXJjZTogdHVybi5tZXNzYWdlLnRleHQsIGN1cnJlbnRUaXRsZTogbGFzdEFwcGxpZWQgfSxcblx0XHRcdFx0bGFzdEFwcGxpZWQsXG5cdFx0XHRcdGFwcGx5LFxuXHRcdFx0XHQoKSA9PiB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKGNoYXRDaGFubmVsKT8udGl0bGUgPT09IHRoaXMuX2xhc3RBcHBsaWVkVGl0bGUuZ2V0KGNoYXRDaGFubmVsKSxcblx0XHRcdFx0dGl0bGUgPT4gdGhpcy5fcGVyc2lzdEF1dG9UaXRsZShjaGFubmVsLCBjaGF0Q2hhbm5lbCwgdGl0bGUpLFxuXHRcdFx0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoY2hhbm5lbCk7XG5cdFx0aWYgKCFzdGF0ZSB8fCBzdGF0ZS50dXJucy5sZW5ndGggIT09IDEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGFzdEFwcGxpZWQgPSB0aGlzLl9sYXN0QXBwbGllZFRpdGxlLmdldChjaGFubmVsKTtcblx0XHRpZiAobGFzdEFwcGxpZWQgPT09IHVuZGVmaW5lZCB8fCBzdGF0ZS50aXRsZSAhPT0gbGFzdEFwcGxpZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdHVybiA9IHN0YXRlLnR1cm5zWzBdO1xuXHRcdGNvbnN0IGNvbnRleHQgPSB0aGlzLl9idWlsZEZpcnN0VHVybkNvbnRleHQodHVybik7XG5cdFx0aWYgKCFjb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGFwcGx5ID0gKHRpdGxlOiBzdHJpbmcpID0+IHtcblx0XHRcdHRoaXMuX2FwcGx5VGl0bGUoY2hhbm5lbCwgdGl0bGUsIHQgPT4gdGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGNoYW5uZWwsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLFxuXHRcdFx0XHR0aXRsZTogdCxcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3BlcnNpc3RBdXRvVGl0bGVTb3VyY2UoY2hhbm5lbCwgdW5kZWZpbmVkKTtcblx0XHR9O1xuXHRcdHRoaXMuX2dlbmVyYXRlVGl0bGVTb29uKFxuXHRcdFx0Y2hhbm5lbCxcblx0XHRcdHsgY29udGVudDogY29udGV4dCwgaXNDb252ZXJzYXRpb246IHRydWUsIGdpdEh1YlJlZmVyZW5jZVNvdXJjZTogdHVybi5tZXNzYWdlLnRleHQsIGN1cnJlbnRUaXRsZTogbGFzdEFwcGxpZWQgfSxcblx0XHRcdGxhc3RBcHBsaWVkLFxuXHRcdFx0YXBwbHksXG5cdFx0XHQoKSA9PiB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGNoYW5uZWwpPy50aXRsZSA9PT0gdGhpcy5fbGFzdEFwcGxpZWRUaXRsZS5nZXQoY2hhbm5lbCksXG5cdFx0XHR0aXRsZSA9PiB0aGlzLl9wZXJzaXN0QXV0b1RpdGxlKGNoYW5uZWwsIHVuZGVmaW5lZCwgdGl0bGUpLFxuXHRcdCk7XG5cdH1cblxuXHQvKipcblx0ICogR2VuZXJhdGVzIGEgdGl0bGUgZm9yIGEgZnJlc2hseSBmb3JrZWQgc2Vzc2lvbiBvciBjaGF0IGZyb20gaXRzXG5cdCAqIGluaGVyaXRlZCBjb252ZXJzYXRpb24gY29udGV4dC4gRm9ya3MgY29weSB0aGUgc291cmNlIGhpc3RvcnkgdXAgdG8gdGhlXG5cdCAqIGZvcmsgcG9pbnQsIHNvIG5laXRoZXIge0BsaW5rIHNlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2V9IG5vclxuXHQgKiB7QGxpbmsgcmVmaW5lVGl0bGVGcm9tRmlyc3RUdXJufSAod2hpY2ggcmVxdWlyZSBhbiBlbXB0eSAvIHNpbmdsZS10dXJuXG5cdCAqIHN0YXRlKSBldmVyIGZpcmUgZm9yIHRoZW0uIFRoaXMgaXMgdGhlIGZvcmsgZXF1aXZhbGVudCwgcnVuIG9uY2UgYXQgZm9ya1xuXHQgKiB0aW1lIG92ZXIgdGhlIGtlcHQgdHVybnMsIHNvIHRoZSBuZXcgY2hhdCBnZXRzIGEgY29udGVudC1kZXJpdmVkIHRpdGxlXG5cdCAqIGluc3RlYWQgb2YgcGVybWFuZW50bHkgaW5oZXJpdGluZyB0aGUgc291cmNlJ3MgYEZvcmtlZDogXHUyMDI2YCB0aXRsZS5cblx0ICpcblx0ICogYGZhbGxiYWNrVGl0bGVgIGlzIHRoZSB0aXRsZSB0aGUgY2FsbGVyIGFscmVhZHkgYXBwbGllZCB0byB0aGUgbmV3XG5cdCAqIHNlc3Npb24vY2hhdCAoZS5nLiBgRm9ya2VkOiA8c291cmNlPmApOyBpdCBpcyByZWNvcmRlZCBhcyB0aGVcblx0ICogbGFzdC1hcHBsaWVkIHRpdGxlIHNvIGEgY29uY3VycmVudCBtYW51YWwgcmVuYW1lIHN1cHByZXNzZXMgdGhlXG5cdCAqIGdlbmVyYXRlZCB0aXRsZSwgYW5kIHN0YXlzIHZpc2libGUgdW50aWwgZ2VuZXJhdGlvbiBjb21wbGV0ZXMuIFRoZVxuXHQgKiBjb250ZXh0IGlzIGJvdW5kZWQgdG8ge0BsaW5rIE1BWF9USVRMRV9DT05URVhUX0NIQVJTfSAobWlkZGxlLXRydW5jYXRlZCksXG5cdCAqIHNvIGdlbmVyYXRpb24gY29zdHMgYXQgbW9zdCBhIHNpbmdsZSBzbWFsbC1tb2RlbCBjYWxsLlxuXHQgKi9cblx0Z2VuZXJhdGVGb3JrZWRUaXRsZShjaGFubmVsOiBQcm90b2NvbFVSSSwgY2hhdENoYW5uZWw6IFByb3RvY29sVVJJIHwgdW5kZWZpbmVkLCB0dXJuczogcmVhZG9ubHkgVHVybltdLCBmYWxsYmFja1RpdGxlOiBzdHJpbmcsIHNvdXJjZVRpdGxlPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzQWN0aXZlQWdlbnRUaXRsZUdlbmVyYXRpb25FbmFibGVkKGNoYW5uZWwpKSB7XG5cdFx0XHR0aGlzLm1hcmtUaXRsZUF1dG8oY2hhbm5lbCwgY2hhdENoYW5uZWwsIGZhbGxiYWNrVGl0bGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb250ZXh0ID0gdGhpcy5fYnVpbGRDb252ZXJzYXRpb25Db250ZXh0KHR1cm5zLCBzb3VyY2VUaXRsZSk7XG5cdFx0aWYgKCFjb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNBZGRpdGlvbmFsQ2hhdCA9ICEhY2hhdENoYW5uZWwgJiYgaXNBaHBDaGF0Q2hhbm5lbChjaGF0Q2hhbm5lbCkgJiYgIWlzRGVmYXVsdENoYXRVcmkoY2hhdENoYW5uZWwpO1xuXHRcdGlmIChpc0FkZGl0aW9uYWxDaGF0KSB7XG5cdFx0XHRjb25zdCBrZXkgPSBjaGF0Q2hhbm5lbDtcblx0XHRcdHRoaXMuX2xhc3RBcHBsaWVkVGl0bGUuc2V0KGtleSwgZmFsbGJhY2tUaXRsZSk7XG5cdFx0XHR0aGlzLl9wZXJzaXN0QXV0b1RpdGxlU291cmNlKGNoYW5uZWwsIGtleSk7XG5cdFx0XHRjb25zdCBhcHBseSA9ICh0aXRsZTogc3RyaW5nKSA9PiB0aGlzLl9hcHBseVRpdGxlKGtleSwgdGl0bGUsIHQgPT4gdGhpcy5fc3RhdGVNYW5hZ2VyLnVwZGF0ZUNoYXRUaXRsZShjaGFubmVsLCBrZXksIHQpKTtcblx0XHRcdHRoaXMuX2dlbmVyYXRlVGl0bGVTb29uKFxuXHRcdFx0XHRrZXksXG5cdFx0XHRcdHsgY29udGVudDogY29udGV4dCwgaXNDb252ZXJzYXRpb246IHRydWUgfSxcblx0XHRcdFx0ZmFsbGJhY2tUaXRsZSxcblx0XHRcdFx0YXBwbHksXG5cdFx0XHRcdCgpID0+IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRDaGF0U3RhdGUoa2V5KT8udGl0bGUgPT09IHRoaXMuX2xhc3RBcHBsaWVkVGl0bGUuZ2V0KGtleSksXG5cdFx0XHRcdHRpdGxlID0+IHRoaXMuX3BlcnNpc3RBdXRvVGl0bGUoY2hhbm5lbCwga2V5LCB0aXRsZSksXG5cdFx0XHQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xhc3RBcHBsaWVkVGl0bGUuc2V0KGNoYW5uZWwsIGZhbGxiYWNrVGl0bGUpO1xuXHRcdHRoaXMuX3BlcnNpc3RBdXRvVGl0bGVTb3VyY2UoY2hhbm5lbCwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBhcHBseSA9ICh0aXRsZTogc3RyaW5nKSA9PiB0aGlzLl9hcHBseVRpdGxlKGNoYW5uZWwsIHRpdGxlLCB0ID0+IHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihjaGFubmVsLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsXG5cdFx0XHR0aXRsZTogdCxcblx0XHR9KSk7XG5cdFx0dGhpcy5fZ2VuZXJhdGVUaXRsZVNvb24oXG5cdFx0XHRjaGFubmVsLFxuXHRcdFx0eyBjb250ZW50OiBjb250ZXh0LCBpc0NvbnZlcnNhdGlvbjogdHJ1ZSB9LFxuXHRcdFx0ZmFsbGJhY2tUaXRsZSxcblx0XHRcdGFwcGx5LFxuXHRcdFx0KCkgPT4gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShjaGFubmVsKT8udGl0bGUgPT09IHRoaXMuX2xhc3RBcHBsaWVkVGl0bGUuZ2V0KGNoYW5uZWwpLFxuXHRcdFx0dGl0bGUgPT4gdGhpcy5fcGVyc2lzdEF1dG9UaXRsZShjaGFubmVsLCB1bmRlZmluZWQsIHRpdGxlKSxcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlUaXRsZShrZXk6IFByb3RvY29sVVJJLCB0aXRsZTogc3RyaW5nLCBkaXNwYXRjaDogKHRpdGxlOiBzdHJpbmcpID0+IHZvaWQpOiB2b2lkIHtcblx0XHR0aGlzLl9sYXN0QXBwbGllZFRpdGxlLnNldChrZXksIHRpdGxlKTtcblx0XHRkaXNwYXRjaCh0aXRsZSk7XG5cdH1cblxuXHRjYW5jZWxUaXRsZUdlbmVyYXRpb24oc2Vzc2lvbjogUHJvdG9jb2xVUkkpOiB2b2lkIHtcblx0XHR0aGlzLl9jYW5jZWxUaXRsZUdlbmVyYXRpb24oc2Vzc2lvbik7XG5cdH1cblxuXHRjbGVhclNlc3Npb24oc2Vzc2lvbjogUHJvdG9jb2xVUkksIGNoYXRDaGFubmVsczogcmVhZG9ubHkgUHJvdG9jb2xVUklbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIFtzZXNzaW9uLCBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pLCAuLi5jaGF0Q2hhbm5lbHNdKSB7XG5cdFx0XHR0aGlzLl9jYW5jZWxUaXRsZUdlbmVyYXRpb24oa2V5KTtcblx0XHRcdHRoaXMuX2xhc3RBcHBsaWVkVGl0bGUuZGVsZXRlKGtleSk7XG5cdFx0XHR0aGlzLl9wcm92aXNpb25hbFRpdGxlcy5kZWxldGUoa2V5KTtcblx0XHRcdHRoaXMuX2F1dG9UaXRsZXMuZGVsZXRlKGtleSk7XG5cdFx0XHR0aGlzLl9yZW5hbWVkVGl0bGVzLmRlbGV0ZShrZXkpO1xuXHRcdH1cblx0fVxuXG5cdG1hcmtUaXRsZUF1dG8oY2hhbm5lbDogUHJvdG9jb2xVUkksIGNoYXRDaGFubmVsOiBQcm90b2NvbFVSSSB8IHVuZGVmaW5lZCwgdGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGluZGVwZW5kZW50Q2hhdCA9IHRoaXMuX2luZGVwZW5kZW50Q2hhdENoYW5uZWwoY2hhbm5lbCwgY2hhdENoYW5uZWwpO1xuXHRcdGNvbnN0IGtleSA9IGluZGVwZW5kZW50Q2hhdCA/PyBjaGFubmVsO1xuXHRcdHRoaXMuX2xhc3RBcHBsaWVkVGl0bGUuc2V0KGtleSwgdGl0bGUpO1xuXHRcdHRoaXMuX2F1dG9UaXRsZXMuYWRkKGtleSk7XG5cdFx0dGhpcy5fcmVuYW1lZFRpdGxlcy5kZWxldGUoa2V5KTtcblx0XHR0aGlzLl9wZXJzaXN0QXV0b1RpdGxlKGNoYW5uZWwsIGluZGVwZW5kZW50Q2hhdCwgdGl0bGUpO1xuXHR9XG5cblx0bWFya1RpdGxlUmVuYW1lZChjaGFubmVsOiBQcm90b2NvbFVSSSwgY2hhdENoYW5uZWw/OiBQcm90b2NvbFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuX2luZGVwZW5kZW50Q2hhdENoYW5uZWwoY2hhbm5lbCwgY2hhdENoYW5uZWwpID8/IGNoYW5uZWw7XG5cdFx0dGhpcy5fY2FuY2VsVGl0bGVHZW5lcmF0aW9uKGtleSk7XG5cdFx0dGhpcy5fYXV0b1RpdGxlcy5kZWxldGUoa2V5KTtcblx0XHR0aGlzLl9wcm92aXNpb25hbFRpdGxlcy5kZWxldGUoa2V5KTtcblx0XHR0aGlzLl9yZW5hbWVkVGl0bGVzLmFkZChrZXkpO1xuXHR9XG5cblx0YXN5bmMgcHJlcGFyZUluc3RydWN0aW9uRm9yQWdlbnQoY2hhbm5lbDogUHJvdG9jb2xVUkksIGNoYXRDaGFubmVsOiBQcm90b2NvbFVSSSk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLl9pc0FjdGl2ZUFnZW50VGl0bGVHZW5lcmF0aW9uRW5hYmxlZChjaGFubmVsKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgaW5kZXBlbmRlbnRDaGF0ID0gdGhpcy5faW5kZXBlbmRlbnRDaGF0Q2hhbm5lbChjaGFubmVsLCBjaGF0Q2hhbm5lbCk7XG5cdFx0Y29uc3Qga2V5ID0gaW5kZXBlbmRlbnRDaGF0ID8/IGNoYW5uZWw7XG5cdFx0aWYgKHRoaXMuX3JlbmFtZWRUaXRsZXMuaGFzKGtleSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNvdXJjZUtleSA9IGluZGVwZW5kZW50Q2hhdCA/IGN1c3RvbUNoYXRUaXRsZVNvdXJjZU1ldGFkYXRhS2V5KGluZGVwZW5kZW50Q2hhdCkgOiBTRVNTSU9OX0NVU1RPTV9USVRMRV9TT1VSQ0VfS0VZO1xuXHRcdGNvbnN0IHNvdXJjZSA9IGF3YWl0IHRoaXMuX3JlYWRQZXJzaXN0ZWRUaXRsZVNvdXJjZShjaGFubmVsLCBzb3VyY2VLZXkpO1xuXHRcdGlmIChzb3VyY2UgPT09IEFHRU5UX0hPU1RfVElUTEVfU09VUkNFX1VTRVIgfHwgc291cmNlID09PSBBR0VOVF9IT1NUX1RJVExFX1NPVVJDRV9BR0VOVCkge1xuXHRcdFx0dGhpcy5tYXJrVGl0bGVSZW5hbWVkKGNoYW5uZWwsIGluZGVwZW5kZW50Q2hhdCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoc291cmNlICE9PSBBR0VOVF9IT1NUX1RJVExFX1NPVVJDRV9BVVRPICYmICF0aGlzLl9hdXRvVGl0bGVzLmhhcyhrZXkpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBDSEFUX1JFTkFNRV9SRU1JTkRFUjtcblx0fVxuXG5cdHByaXZhdGUgX2dlbmVyYXRlVGl0bGVTb29uKFxuXHRcdGtleTogUHJvdG9jb2xVUkksXG5cdFx0cHJvbXB0OiBJVGl0bGVQcm9tcHRDb250ZXh0LFxuXHRcdGZhbGxiYWNrVGl0bGU6IHN0cmluZyxcblx0XHRhcHBseTogKHRpdGxlOiBzdHJpbmcpID0+IHZvaWQsXG5cdFx0Y3VycmVudFRpdGxlTWF0Y2hlc0ZhbGxiYWNrOiAoKSA9PiBib29sZWFuLFxuXHRcdHBlcnNpc3Q6ICh0aXRsZTogc3RyaW5nKSA9PiB2b2lkLFxuXHQpOiB2b2lkIHtcblx0XHR0aGlzLl9jYW5jZWxUaXRsZUdlbmVyYXRpb24oa2V5KTtcblx0XHRjb25zdCBzb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLl90aXRsZUdlbmVyYXRpb25DYW5jZWxsYXRpb25Tb3VyY2VzLnNldChrZXksIHNvdXJjZSk7XG5cdFx0dm9pZCB0aGlzLl9nZW5lcmF0ZVRpdGxlKGtleSwgcHJvbXB0LCBmYWxsYmFja1RpdGxlLCBhcHBseSwgY3VycmVudFRpdGxlTWF0Y2hlc0ZhbGxiYWNrLCBwZXJzaXN0LCBzb3VyY2UudG9rZW4pLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRpZiAoIXNvdXJjZS50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RTZXNzaW9uVGl0bGVDb250cm9sbGVyXSBGYWlsZWQgdG8gYXBwbHkgZ2VuZXJhdGVkIHRpdGxlIGZvciAke2tleX1gLCBlcnIpO1xuXHRcdFx0fVxuXHRcdH0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3RpdGxlR2VuZXJhdGlvbkNhbmNlbGxhdGlvblNvdXJjZXMuZ2V0KGtleSkgPT09IHNvdXJjZSkge1xuXHRcdFx0XHR0aGlzLl90aXRsZUdlbmVyYXRpb25DYW5jZWxsYXRpb25Tb3VyY2VzLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHRzb3VyY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2VuZXJhdGVUaXRsZShcblx0XHRrZXk6IFByb3RvY29sVVJJLFxuXHRcdHByb21wdDogSVRpdGxlUHJvbXB0Q29udGV4dCxcblx0XHRmYWxsYmFja1RpdGxlOiBzdHJpbmcsXG5cdFx0YXBwbHk6ICh0aXRsZTogc3RyaW5nKSA9PiB2b2lkLFxuXHRcdGN1cnJlbnRUaXRsZU1hdGNoZXNGYWxsYmFjazogKCkgPT4gYm9vbGVhbixcblx0XHRwZXJzaXN0OiAodGl0bGU6IHN0cmluZykgPT4gdm9pZCxcblx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGdlbmVyYXRlZFRpdGxlID0gYXdhaXQgdGhpcy5fZ2VuZXJhdGVUaXRsZUZyb21Qcm9tcHQocHJvbXB0LCB0b2tlbik7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICFnZW5lcmF0ZWRUaXRsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghY3VycmVudFRpdGxlTWF0Y2hlc0ZhbGxiYWNrKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZ2VuZXJhdGVkVGl0bGUgIT09IGZhbGxiYWNrVGl0bGUpIHtcblx0XHRcdGFwcGx5KGdlbmVyYXRlZFRpdGxlKTtcblx0XHR9XG5cdFx0cGVyc2lzdChnZW5lcmF0ZWRUaXRsZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZW5lcmF0ZVRpdGxlRnJvbVByb21wdChwcm9tcHQ6IElUaXRsZVByb21wdENvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGdpdGh1YlRva2VuID0gdGhpcy5fb3B0aW9ucy5nZXRHaXRIdWJDb3BpbG90VG9rZW4/LigpO1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gdGhpcy5fb3B0aW9ucy5jb3BpbG90QXBpU2VydmljZTtcblx0XHRpZiAoIWdpdGh1YlRva2VuIHx8ICFjb3BpbG90QXBpU2VydmljZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBhYm9ydENvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG5cdFx0Y29uc3QgY2FuY2VsbGF0aW9uTGlzdGVuZXIgPSB0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiBhYm9ydENvbnRyb2xsZXIuYWJvcnQoKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHRpdGxlUHJvbXB0Q29udGVudCA9IHByb21wdC5naXRIdWJSZWZlcmVuY2VTb3VyY2UgPT09IHVuZGVmaW5lZFxuXHRcdFx0XHQ/IHByb21wdC5jb250ZW50XG5cdFx0XHRcdDogYXdhaXQgdGhpcy5fYXBwZW5kR2l0SHViQ29udGV4dChwcm9tcHQuY29udGVudCwgcHJvbXB0LmdpdEh1YlJlZmVyZW5jZVNvdXJjZSwgYWJvcnRDb250cm9sbGVyLnNpZ25hbCwgdG9rZW4pO1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByYXdUaXRsZSA9IGF3YWl0IGNvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDaGF0Q29tcGxldGlvbihnaXRodWJUb2tlbiwge1xuXHRcdFx0XHRtZXNzYWdlczogdGhpcy5fYnVpbGRUaXRsZVByb21wdCh0aXRsZVByb21wdENvbnRlbnQsIHByb21wdCksXG5cdFx0XHRcdG1heFRva2VuczogTUFYX1RJVExFX1RPS0VOUyxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2lnbmFsOiBhYm9ydENvbnRyb2xsZXIuc2lnbmFsLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2xlYW5UaXRsZShyYXdUaXRsZSwgdGl0bGVQcm9tcHRDb250ZW50KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbQWdlbnRIb3N0U2Vzc2lvblRpdGxlQ29udHJvbGxlcl0gRmFpbGVkIHRvIGdlbmVyYXRlIHNlc3Npb24gdGl0bGUnLCBlcnIpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2FuY2VsbGF0aW9uTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBlbmRzIHRoZSBHaXRIdWIgaXNzdWUgLyBwdWxsIHJlcXVlc3RzIGxpbmtlZCBmcm9tIGByZWZlcmVuY2VTb3VyY2VgIHRvXG5cdCAqIGBwcm9tcHRDb250ZW50YCwga2VlcGluZyB0aGUgY29tYmluZWQgdGV4dCB3aXRoaW5cblx0ICoge0BsaW5rIE1BWF9USVRMRV9DT05URVhUX0NIQVJTfS4gRW5yaWNobWVudCBpcyBndWFyYW50ZWVkXG5cdCAqIHtAbGluayBNSU5fR0lUSFVCX0NPTlRFWFRfQ0hBUlN9OyB3aGF0ZXZlciBpdCBsZWF2ZXMgb3ZlciBib3VuZHNcblx0ICogYHByb21wdENvbnRlbnRgLCB3aG9zZSBtaWRkbGUgaXMgZHJvcHBlZCBzbyB0aGUgcmVxdWVzdCBhdCBpdHMgaGVhZCBhbmRcblx0ICogdGhlIHJlc3BvbnNlIHRhaWwgYm90aCBzdXJ2aXZlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfYXBwZW5kR2l0SHViQ29udGV4dChwcm9tcHRDb250ZW50OiBzdHJpbmcsIHJlZmVyZW5jZVNvdXJjZTogc3RyaW5nLCBjYW5jZWxsYXRpb25TaWduYWw6IEFib3J0U2lnbmFsLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IHJlZmVyZW5jZXMgPSB0aGlzLl9wYXJzZUdpdEh1YlJlZmVyZW5jZXMocmVmZXJlbmNlU291cmNlKTtcblx0XHRjb25zdCBnaXRodWJUb2tlbiA9IHRoaXMuX29wdGlvbnMuZ2V0R2l0SHViVG9rZW4/LigpO1xuXHRcdGNvbnN0IG9jdG9LaXRTZXJ2aWNlID0gdGhpcy5fb3B0aW9ucy5vY3RvS2l0U2VydmljZTtcblx0XHRpZiAocmVmZXJlbmNlcy5sZW5ndGggPT09IDAgfHwgIWdpdGh1YlRva2VuIHx8ICFvY3RvS2l0U2VydmljZSkge1xuXHRcdFx0cmV0dXJuIHByb21wdENvbnRlbnQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2lnbmFsID0gQWJvcnRTaWduYWwuYW55KFtjYW5jZWxsYXRpb25TaWduYWwsIEFib3J0U2lnbmFsLnRpbWVvdXQodGhpcy5fb3B0aW9ucy5naXRIdWJDb250ZXh0UmVxdWVzdFRpbWVvdXQgPz8gR0lUSFVCX0NPTlRFWFRfUkVRVUVTVF9USU1FT1VUKV0pO1xuXHRcdGNvbnN0IGxpbWl0ZXIgPSBuZXcgTGltaXRlcjxJR2l0SHViUmVmZXJlbmNlQ29udGV4dCB8IHVuZGVmaW5lZD4oTUFYX0NPTkNVUlJFTlRfR0lUSFVCX0NPTlRFWFRfUkVRVUVTVFMpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb250ZXh0cyA9IGF3YWl0IFByb21pc2UuYWxsKHJlZmVyZW5jZXMubWFwKHJlZmVyZW5jZSA9PiBsaW1pdGVyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IG9jdG9LaXRTZXJ2aWNlLmdldElzc3VlT3JQdWxsUmVxdWVzdChcblx0XHRcdFx0XHRcdHJlZmVyZW5jZS5vd25lcixcblx0XHRcdFx0XHRcdHJlZmVyZW5jZS5yZXBvLFxuXHRcdFx0XHRcdFx0cmVmZXJlbmNlLm51bWJlcixcblx0XHRcdFx0XHRcdGdpdGh1YlRva2VuLFxuXHRcdFx0XHRcdFx0c2lnbmFsLFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgcmVmZXJlbmNlLCB2YWx1ZSB9O1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdGlmICghdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFNlc3Npb25UaXRsZUNvbnRyb2xsZXJdIEZhaWxlZCB0byBmZXRjaCBHaXRIdWIgJHtyZWZlcmVuY2Uua2luZH0gJHtyZWZlcmVuY2Uub3duZXJ9LyR7cmVmZXJlbmNlLnJlcG99IyR7cmVmZXJlbmNlLm51bWJlcn1gLCBlcnJvcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0pKSk7XG5cdFx0XHRjb25zdCBzdWNjZXNzZnVsQ29udGV4dHMgPSBjb250ZXh0cy5maWx0ZXIoY29udGV4dCA9PiBjb250ZXh0ICE9PSB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKHN1Y2Nlc3NmdWxDb250ZXh0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIHByb21wdENvbnRlbnQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZXBhcmF0b3IgPSAnXFxuXFxuJztcblx0XHRcdGNvbnN0IGdpdEh1YkJ1ZGdldCA9IE1hdGgubWF4KE1JTl9HSVRIVUJfQ09OVEVYVF9DSEFSUywgTUFYX1RJVExFX0NPTlRFWFRfQ0hBUlMgLSBwcm9tcHRDb250ZW50Lmxlbmd0aCAtIHNlcGFyYXRvci5sZW5ndGgpO1xuXHRcdFx0Y29uc3QgZ2l0SHViQ29udGV4dCA9IHRoaXMuX2Zvcm1hdEdpdEh1YkNvbnRleHRzKHN1Y2Nlc3NmdWxDb250ZXh0cywgZ2l0SHViQnVkZ2V0KTtcblx0XHRcdGNvbnN0IGNvbnRlbnRCdWRnZXQgPSBNYXRoLm1heCgwLCBNQVhfVElUTEVfQ09OVEVYVF9DSEFSUyAtIGdpdEh1YkNvbnRleHQubGVuZ3RoIC0gc2VwYXJhdG9yLmxlbmd0aCk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gcHJvbXB0Q29udGVudC5sZW5ndGggPiBjb250ZW50QnVkZ2V0ID8gdHJ1bmNhdGVNaWRkbGUocHJvbXB0Q29udGVudCwgY29udGVudEJ1ZGdldCkgOiBwcm9tcHRDb250ZW50O1xuXHRcdFx0cmV0dXJuIGAke2NvbnRlbnR9JHtzZXBhcmF0b3J9JHtnaXRIdWJDb250ZXh0fWA7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGxpbWl0ZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3BhcnNlR2l0SHViUmVmZXJlbmNlcyh0ZXh0OiBzdHJpbmcpOiBJR2l0SHViUmVmZXJlbmNlW10ge1xuXHRcdGNvbnN0IHJlZmVyZW5jZXM6IElHaXRIdWJSZWZlcmVuY2VbXSA9IFtdO1xuXHRcdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCBjb25maWd1cmVkSG9zdCA9IHRoaXMuX25vcm1hbGl6ZUdpdEh1Ykhvc3QodGhpcy5fb3B0aW9ucy5nZXRHaXRIdWJIb3N0Py4oKSA/PyAnZ2l0aHViLmNvbScpO1xuXHRcdGZvciAoY29uc3QgbWF0Y2ggb2YgdGV4dC5tYXRjaEFsbChHSVRIVUJfSVNTVUVfT1JfUFVMTF9SRVFVRVNUX1VSTF9QQVRURVJOKSkge1xuXHRcdFx0Y29uc3QgaG9zdCA9IG1hdGNoLmdyb3Vwcz8uaG9zdDtcblx0XHRcdGNvbnN0IG93bmVyID0gbWF0Y2guZ3JvdXBzPy5vd25lcjtcblx0XHRcdGNvbnN0IHJlcG8gPSBtYXRjaC5ncm91cHM/LnJlcG87XG5cdFx0XHRjb25zdCByYXdLaW5kID0gbWF0Y2guZ3JvdXBzPy5raW5kO1xuXHRcdFx0Y29uc3QgbnVtYmVyID0gTnVtYmVyKG1hdGNoLmdyb3Vwcz8ubnVtYmVyKTtcblx0XHRcdGlmICghaG9zdCB8fCB0aGlzLl9ub3JtYWxpemVHaXRIdWJIb3N0KGhvc3QpICE9PSBjb25maWd1cmVkSG9zdCB8fCAhb3duZXIgfHwgIXJlcG8gfHwgKHJhd0tpbmQgIT09ICdpc3N1ZXMnICYmIHJhd0tpbmQgIT09ICdwdWxsJykgfHwgIU51bWJlci5pc1NhZmVJbnRlZ2VyKG51bWJlcikgfHwgbnVtYmVyIDw9IDApIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBraW5kOiBHaXRIdWJSZWZlcmVuY2VLaW5kID0gcmF3S2luZCA9PT0gJ2lzc3VlcycgPyAnaXNzdWUnIDogJ3B1bGwgcmVxdWVzdCc7XG5cdFx0XHRjb25zdCBrZXkgPSBgJHtvd25lci50b0xvd2VyQ2FzZSgpfS8ke3JlcG8udG9Mb3dlckNhc2UoKX0vJHtraW5kfS8ke251bWJlcn1gO1xuXHRcdFx0aWYgKHNlZW4uaGFzKGtleSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRzZWVuLmFkZChrZXkpO1xuXHRcdFx0cmVmZXJlbmNlcy5wdXNoKHsgb3duZXIsIHJlcG8sIG51bWJlciwga2luZCB9KTtcblx0XHRcdGlmIChyZWZlcmVuY2VzLmxlbmd0aCA9PT0gTUFYX0dJVEhVQl9DT05URVhUX1JFRkVSRU5DRVMpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZWZlcmVuY2VzO1xuXHR9XG5cblx0cHJpdmF0ZSBfbm9ybWFsaXplR2l0SHViSG9zdChob3N0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWRIb3N0ID0gaG9zdC50b0xvd2VyQ2FzZSgpO1xuXHRcdHJldHVybiBub3JtYWxpemVkSG9zdCA9PT0gJ3d3dy5naXRodWIuY29tJyA/ICdnaXRodWIuY29tJyA6IG5vcm1hbGl6ZWRIb3N0O1xuXHR9XG5cblx0cHJpdmF0ZSBfZm9ybWF0R2l0SHViQ29udGV4dHMoY29udGV4dHM6IHJlYWRvbmx5IElHaXRIdWJSZWZlcmVuY2VDb250ZXh0W10sIGJ1ZGdldDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRjb25zdCBoZWFkaW5nID0gJ0dpdEh1YiBpc3N1ZSBhbmQgcHVsbCByZXF1ZXN0IGNvbnRleHQ6XFxuXFxuJztcblx0XHRjb25zdCBmaXhlZExlbmd0aCA9IGhlYWRpbmcubGVuZ3RoICsgY29udGV4dHMucmVkdWNlKChsZW5ndGgsIGNvbnRleHQsIGluZGV4KSA9PiB7XG5cdFx0XHRyZXR1cm4gbGVuZ3RoICsgdGhpcy5fZm9ybWF0R2l0SHViQ29udGV4dChjb250ZXh0LnJlZmVyZW5jZSwgY29udGV4dC52YWx1ZSwgJycpLmxlbmd0aCArIChpbmRleCA9PT0gMCA/IDAgOiAyKTtcblx0XHR9LCAwKTtcblx0XHRsZXQgcmVtYWluaW5nQm9keUJ1ZGdldCA9IE1hdGgubWF4KDAsIGJ1ZGdldCAtIGZpeGVkTGVuZ3RoKTtcblx0XHRjb25zdCBzZWN0aW9ucyA9IGNvbnRleHRzLm1hcCgoY29udGV4dCwgaW5kZXgpID0+IHtcblx0XHRcdGNvbnN0IGJvZHlCdWRnZXQgPSBNYXRoLm1pbihcblx0XHRcdFx0TUFYX0dJVEhVQl9DT05URVhUX0JPRFlfQ0hBUlMsXG5cdFx0XHRcdE1hdGguZmxvb3IocmVtYWluaW5nQm9keUJ1ZGdldCAvIChjb250ZXh0cy5sZW5ndGggLSBpbmRleCkpLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGJvZHkgPSB0cnVuY2F0ZU1pZGRsZShjb250ZXh0LnZhbHVlLmJvZHksIGJvZHlCdWRnZXQpO1xuXHRcdFx0cmVtYWluaW5nQm9keUJ1ZGdldCAtPSBib2R5Lmxlbmd0aDtcblx0XHRcdHJldHVybiB0aGlzLl9mb3JtYXRHaXRIdWJDb250ZXh0KGNvbnRleHQucmVmZXJlbmNlLCBjb250ZXh0LnZhbHVlLCBib2R5KTtcblx0XHR9KTtcblx0XHRyZXR1cm4gdHJ1bmNhdGVNaWRkbGUoYCR7aGVhZGluZ30ke3NlY3Rpb25zLmpvaW4oJ1xcblxcbicpfWAsIGJ1ZGdldCk7XG5cdH1cblxuXHRwcml2YXRlIF9mb3JtYXRHaXRIdWJDb250ZXh0KHJlZmVyZW5jZTogSUdpdEh1YlJlZmVyZW5jZSwgdmFsdWU6IEdpdEh1Yklzc3VlT3JQdWxsUmVxdWVzdCwgYm9keTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gW1xuXHRcdFx0YEdpdEh1YiAke3JlZmVyZW5jZS5raW5kfSAke3JlZmVyZW5jZS5vd25lcn0vJHtyZWZlcmVuY2UucmVwb30jJHtyZWZlcmVuY2UubnVtYmVyfTpgLFxuXHRcdFx0YFRoZSB0aXRsZSBvZiB0aGUgJHtyZWZlcmVuY2Uua2luZH0gaXM6ICR7dmFsdWUudGl0bGV9YCxcblx0XHRcdGBUaGUgYm9keSBvZiB0aGUgJHtyZWZlcmVuY2Uua2luZH0gaXM6YCxcblx0XHRcdGJvZHksXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkVGl0bGVQcm9tcHQocHJvbXB0Q29udGVudDogc3RyaW5nLCBwcm9tcHQ6IElUaXRsZVByb21wdENvbnRleHQpOiBJQ29waWxvdFV0aWxpdHlDaGF0TWVzc2FnZVtdIHtcblx0XHRjb25zdCByZXF1ZXN0ID0gcHJvbXB0LmlzQ29udmVyc2F0aW9uXG5cdFx0XHQ/IGBQbGVhc2Ugd3JpdGUgYSBicmllZiB0aXRsZSBmb3IgdGhlIGZvbGxvd2luZyBjb252ZXJzYXRpb246XFxuXFxuJHtwcm9tcHRDb250ZW50fWBcblx0XHRcdDogYFBsZWFzZSB3cml0ZSBhIGJyaWVmIHRpdGxlIGZvciB0aGUgZm9sbG93aW5nIHJlcXVlc3Q6XFxuXFxuJHtwcm9tcHRDb250ZW50fWA7XG5cdFx0Y29uc3QgY3VycmVudFRpdGxlID0gcHJvbXB0LmN1cnJlbnRUaXRsZT8udHJpbSgpO1xuXHRcdGNvbnN0IHVzZXJJbnN0cnVjdGlvbiA9IGN1cnJlbnRUaXRsZVxuXHRcdFx0PyBgJHtyZXF1ZXN0fVxcblxcbkl0cyBjdXJyZW50IHRpdGxlIGlzOiAke2N1cnJlbnRUaXRsZX1cXG5SZXBseSB3aXRoIHRoYXQgc2FtZSB0aXRsZSB1bmxlc3MgdGhlIHRleHQgYWJvdmUgc3VwcG9ydHMgYSBjbGVhcmx5IG1vcmUgYWNjdXJhdGUgb25lLmBcblx0XHRcdDogcmVxdWVzdDtcblx0XHRyZXR1cm4gW1xuXHRcdFx0e1xuXHRcdFx0XHRyb2xlOiAnc3lzdGVtJyxcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdCdZb3UgYXJlIGFuIGV4cGVydCBpbiBjcmFmdGluZyB1bHRyYS1jb21wYWN0IHRpdGxlcyBmb3IgY2hhdGJvdCBjb252ZXJzYXRpb25zLicsXG5cdFx0XHRcdFx0J1lvdSBhcmUgcHJlc2VudGVkIHdpdGggYSBjaGF0IHJlcXVlc3Qgb3IgY29udmVyc2F0aW9uLCBhbmQgeW91IHJlcGx5IHdpdGggb25seSBhIGJyaWVmIHRpdGxlIHRoYXQgY2FwdHVyZXMgdGhlIG1haW4gdG9waWMuJyxcblx0XHRcdFx0XHQnV3JpdGUgdGhlIHRpdGxlIGluIHNlbnRlbmNlIGNhc2UsIG5vdCB0aXRsZSBjYXNlLicsXG5cdFx0XHRcdFx0J1ByZXNlcnZlIHByb2R1Y3QgbmFtZXMsIGFiYnJldmlhdGlvbnMsIGNvZGUgc3ltYm9scywgYW5kIHByb3BlciBub3Vucy4nLFxuXHRcdFx0XHRcdCdBaW0gZm9yIDMtNiB3b3Jkcy4gUHJlZmVyIHRoZSBzaG9ydGVzdCBhY2N1cmF0ZSB0aXRsZS4nLFxuXHRcdFx0XHRcdCdEcm9wIGFydGljbGVzIGxpa2UgXCJhXCIsIFwiYW5cIiwgYW5kIFwidGhlXCIgdW5sZXNzIG5lZWRlZCBmb3IgY2xhcml0eS4nLFxuXHRcdFx0XHRcdCdEcm9wIGZpbGxlciBhbmQgZ2VuZXJpYyBmcmFtaW5nIGxpa2UgXCJoZWxwIHdpdGhcIiwgXCJxdWVzdGlvbiBhYm91dFwiLCBcInJlcXVlc3QgZm9yXCIsIG9yIFwiaXNzdWUgd2l0aFwiLicsXG5cdFx0XHRcdFx0J05ldmVyIGRlc2NyaWJlIHRoZSBjaGF0IGl0c2VsZiBhcyBmb3JrZWQsIGJyYW5jaGVkLCBvciBjb250aW51ZWQgXHUyMDE0IHRpdGxlIG9ubHkgdGhlIHVuZGVybHlpbmcgdG9waWMuJyxcblx0XHRcdFx0XHQnUHJlZmVyIHNob3J0LCBjb25jcmV0ZSBzeW5vbnltcyBhbmQgb21pdCB1bm5lY2Vzc2FyeSB3b3Jkcy4nLFxuXHRcdFx0XHRcdCdEbyBub3Qgd3JhcCB0aGUgdGl0bGUgaW4gcXVvdGVzIG9yIGFkZCB0cmFpbGluZyBwdW5jdHVhdGlvbi4nLFxuXHRcdFx0XHRdLmpvaW4oJyAnKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHJvbGU6ICd1c2VyJyxcblx0XHRcdFx0Y29udGVudDogdXNlckluc3RydWN0aW9uLFxuXHRcdFx0fSxcblx0XHRdO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYW5UaXRsZShyYXdUaXRsZTogc3RyaW5nLCBwcm9tcHRDb250ZW50OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGxldCB0aXRsZSA9IHJhd1RpdGxlLnRyaW0oKTtcblx0XHRjb25zdCBmaXJzdExpbmUgPSB0aXRsZS5zcGxpdCgvXFxyP1xcbi8pLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKS5maW5kKGxpbmUgPT4gbGluZS5sZW5ndGggPiAwKTtcblx0XHR0aXRsZSA9IGZpcnN0TGluZSA/PyAnJztcblx0XHRpZiAodGl0bGUuc3RhcnRzV2l0aCgnXCInKSAmJiB0aXRsZS5lbmRzV2l0aCgnXCInKSAmJiB0aXRsZS5sZW5ndGggPiAxKSB7XG5cdFx0XHR0aXRsZSA9IHRpdGxlLnNsaWNlKDEsIC0xKS50cmltKCk7XG5cdFx0fVxuXHRcdHRpdGxlID0gdGl0bGUucmVwbGFjZSgvWy4hP10rJC8sICcnKS50cmltKCk7XG5cblx0XHRpZiAoIXRpdGxlIHx8IHRpdGxlLmluY2x1ZGVzKCdjYW5cXCd0IGFzc2lzdCB3aXRoIHRoYXQnKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGl0bGUgPSB0aXRsZS5zbGljZSgwLCBNQVhfVElUTEVfTEVOR1RIICsgTUFYX1RSQUlMSU5HX0hBTl9TVUZGSVhfQ09ERV9VTklUUyk7XG5cdFx0cmV0dXJuIHRoaXMuX3N0cmlwVW5leHBlY3RlZFRyYWlsaW5nSGFuU3VmZml4KHRpdGxlLCBwcm9tcHRDb250ZW50KS5zbGljZSgwLCBNQVhfVElUTEVfTEVOR1RIKTtcblx0fVxuXG5cdHByaXZhdGUgX3N0cmlwVW5leHBlY3RlZFRyYWlsaW5nSGFuU3VmZml4KHRpdGxlOiBzdHJpbmcsIHByb21wdENvbnRlbnQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0aWYgKEhBTl9DSEFSQUNURVIudGVzdChwcm9tcHRDb250ZW50KSkge1xuXHRcdFx0cmV0dXJuIHRpdGxlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN1ZmZpeCA9IFRSQUlMSU5HX0hBTl9TVUZGSVguZXhlYyh0aXRsZSk7XG5cdFx0aWYgKCFzdWZmaXgpIHtcblx0XHRcdHJldHVybiB0aXRsZTtcblx0XHR9XG5cblx0XHRjb25zdCBwcmVmaXggPSB0aXRsZS5zbGljZSgwLCBzdWZmaXguaW5kZXgpLnRyaW1FbmQoKTtcblx0XHRjb25zdCBsZXR0ZXJDb3VudCA9IHByZWZpeC5tYXRjaCgvXFxwe0x9L2d1KT8ubGVuZ3RoID8/IDA7XG5cdFx0Y29uc3QgbGF0aW5MZXR0ZXJDb3VudCA9IHByZWZpeC5tYXRjaCgvXFxwe3NjPUxhdGlufS9ndSk/Lmxlbmd0aCA/PyAwO1xuXHRcdGlmIChsYXRpbkxldHRlckNvdW50IDwgTUlOX0xBVElOX0xFVFRFUlNfQkVGT1JFX0hBTl9TVUZGSVggfHwgbGF0aW5MZXR0ZXJDb3VudCAvIGxldHRlckNvdW50IDwgTUlOX0xBVElOX0xFVFRFUl9SQVRJTykge1xuXHRcdFx0cmV0dXJuIHRpdGxlO1xuXHRcdH1cblxuXHRcdHJldHVybiBwcmVmaXg7XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGRzIHRoZSBmaXJzdC10dXJuIGNvbnRleHQgc3RyaW5nIGZvciB0aXRsZSByZWZpbmVtZW50LiBUaGUgdXNlcidzXG5cdCAqIHJlcXVlc3QgaXMgYWx3YXlzIGtlcHQgKHRydW5jYXRlZCBpbiB0aGUgbWlkZGxlIG9ubHkgaWYgaXQgYWxvbmUgZXhjZWVkc1xuXHQgKiBoYWxmIHRoZSBidWRnZXQpLiBPbmx5IG5vcm1hbCB0ZXh0IChtYXJrZG93bikgcmVzcG9uc2UgcGFydHMgYXJlXG5cdCAqIGNvbnNpZGVyZWQgXHUyMDE0IHRvb2wgY2FsbHMsIHJlYXNvbmluZywgYW5kIG90aGVyIHBhcnRzIGFyZSBpZ25vcmVkLiBJZiB0aGVcblx0ICogY29tYmluZWQgdGV4dCBpcyBvdmVyIGJ1ZGdldCwgdGhlIG1pZGRsZSBvZiB0aGUgcmVzcG9uc2UgaXMgcmVtb3ZlZC5cblx0ICpcblx0ICogQHJldHVybnMgdGhlIGNvbnRleHQgc3RyaW5nLCBvciBgdW5kZWZpbmVkYCB3aGVuIHRoZSB0dXJuIGhhcyBubyB0ZXh0XG5cdCAqIHJlc3BvbnNlIHdvcnRoIHJlZmluaW5nIGZyb20gKHRoZSBvcGVuaW5nIG1lc3NhZ2UgYWxyZWFkeSBwcm9kdWNlZCBhXG5cdCAqIHRpdGxlIGluIHRoYXQgY2FzZSkuXG5cdCAqL1xuXHRwcml2YXRlIF9idWlsZEZpcnN0VHVybkNvbnRleHQodHVybjogVHVybik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSByZW5kZXJSZXNwb25zZU1hcmtkb3duKHR1cm4ucmVzcG9uc2VQYXJ0cyk7XG5cdFx0aWYgKCFyZXNwb25zZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCB1c2VyQnVkZ2V0ID0gTWF0aC5mbG9vcihNQVhfVElUTEVfQ09OVEVYVF9DSEFSUyAvIDIpO1xuXHRcdGxldCB1c2VyUmVxdWVzdCA9IHR1cm4ubWVzc2FnZS50ZXh0LnRyaW0oKTtcblx0XHRpZiAodXNlclJlcXVlc3QubGVuZ3RoID4gdXNlckJ1ZGdldCkge1xuXHRcdFx0dXNlclJlcXVlc3QgPSB0cnVuY2F0ZU1pZGRsZSh1c2VyUmVxdWVzdCwgdXNlckJ1ZGdldCk7XG5cdFx0fVxuXHRcdGNvbnN0IHVzZXJCbG9jayA9IGBVc2VyIHJlcXVlc3Q6XFxuJHt1c2VyUmVxdWVzdH1gO1xuXHRcdGNvbnN0IHJlc3BvbnNlTGFiZWwgPSAnXFxuXFxuQWdlbnQgcmVzcG9uc2U6XFxuJztcblxuXHRcdGNvbnN0IHJlc3BvbnNlQnVkZ2V0ID0gTWF0aC5tYXgoMCwgTUFYX1RJVExFX0NPTlRFWFRfQ0hBUlMgLSB1c2VyQmxvY2subGVuZ3RoIC0gcmVzcG9uc2VMYWJlbC5sZW5ndGgpO1xuXHRcdGNvbnN0IHRyaW1tZWRSZXNwb25zZSA9IHJlc3BvbnNlLmxlbmd0aCA+IHJlc3BvbnNlQnVkZ2V0ID8gdHJ1bmNhdGVNaWRkbGUocmVzcG9uc2UsIHJlc3BvbnNlQnVkZ2V0KSA6IHJlc3BvbnNlO1xuXG5cdFx0cmV0dXJuIHRyaW1tZWRSZXNwb25zZSA/IGAke3VzZXJCbG9ja30ke3Jlc3BvbnNlTGFiZWx9JHt0cmltbWVkUmVzcG9uc2V9YCA6IHVzZXJCbG9jaztcblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZHMgYSBjb252ZXJzYXRpb24gY29udGV4dCBzdHJpbmcgZm9yIGZvcmtlZC10aXRsZSBnZW5lcmF0aW9uIGJ5XG5cdCAqIGNvbmNhdGVuYXRpbmcgZWFjaCBrZXB0IHR1cm4ncyB1c2VyIHJlcXVlc3QgYW5kIHRleHR1YWwgcmVzcG9uc2UuIE9ubHlcblx0ICogbm9ybWFsIHRleHQgKG1hcmtkb3duKSByZXNwb25zZSBwYXJ0cyBhcmUgY29uc2lkZXJlZCBcdTIwMTQgdG9vbCBjYWxscyxcblx0ICogcmVhc29uaW5nLCBhbmQgb3RoZXIgcGFydHMgYXJlIGlnbm9yZWQsIG1pcnJvcmluZ1xuXHQgKiB7QGxpbmsgX2J1aWxkRmlyc3RUdXJuQ29udGV4dH0uIFdoZW4gdGhlIGZvcmsncyBgc291cmNlVGl0bGVgIGlzIGtub3duLCBhXG5cdCAqIHNob3J0IGZyYW1pbmcgbm90ZSBpcyBwcmVwZW5kZWQgc28gdGhlIG1vZGVsIHVuZGVyc3RhbmRzIHRoZSBjb252ZXJzYXRpb25cblx0ICogaXMgYSBicmFuY2ggY29udGludWVkIGZyb20gYW4gZWFybGllciBjaGF0LiBUaGUgY29udmVyc2F0aW9uIGlzXG5cdCAqIG1pZGRsZS10cnVuY2F0ZWQgdG8ge0BsaW5rIE1BWF9USVRMRV9DT05URVhUX0NIQVJTfSB0byBib3VuZCBtb2RlbCBjb3N0O1xuXHQgKiB0aGUgZnJhbWluZyBub3RlIGlzIGFsd2F5cyBwcmVzZXJ2ZWQgaW4gZnVsbC5cblx0ICpcblx0ICogQHJldHVybnMgdGhlIGNvbnRleHQgc3RyaW5nLCBvciBgdW5kZWZpbmVkYCB3aGVuIG5vIHR1cm4gY2FycmllcyBhbnlcblx0ICogdGV4dCB3b3J0aCB0aXRsaW5nIGZyb20uXG5cdCAqL1xuXHRwcml2YXRlIF9idWlsZENvbnZlcnNhdGlvbkNvbnRleHQodHVybnM6IHJlYWRvbmx5IFR1cm5bXSwgc291cmNlVGl0bGU/OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGZyYW1lZFRpdGxlID0gc291cmNlVGl0bGU/LnRyaW0oKTtcblx0XHRjb25zdCBmcmFtaW5nID0gZnJhbWVkVGl0bGVcblx0XHRcdD8gYFRoaXMgY29udmVyc2F0aW9uIHdhcyBicmFuY2hlZCBmcm9tIGFuIGVhcmxpZXIgY2hhdCB0aXRsZWQgXCIke2ZyYW1lZFRpdGxlfVwiLiBUaGUgdHVybnMgYmVsb3csIG9sZGVzdCBmaXJzdCwgYXJlIHRoZSBpbmhlcml0ZWQgaGlzdG9yeSB1cCB0byB0aGUgYnJhbmNoIHBvaW50LlxcblxcbmBcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiBidWlsZENvbnZlcnNhdGlvbkNvbnRleHQodHVybnMsIHsgbWF4Q2hhcnM6IE1BWF9USVRMRV9DT05URVhUX0NIQVJTLCBmcmFtaW5nIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGVyc2lzdFNlc3Npb25GbGFnKHNlc3Npb246IFByb3RvY29sVVJJLCBrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHBlcnNpc3RTZXNzaW9uTWV0YWRhdGEodGhpcy5fb3B0aW9ucy5zZXNzaW9uRGF0YVNlcnZpY2UsIHRoaXMuX2xvZ1NlcnZpY2UsIHNlc3Npb24sIGtleSwgdmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNBY3RpdmVBZ2VudFRpdGxlR2VuZXJhdGlvbkVuYWJsZWQoY2hhbm5lbDogUHJvdG9jb2xVUkkpOiBib29sZWFuIHtcblx0XHRjb25zdCBzZXJ2ZXJUb29scyA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoY2hhbm5lbCk/LnNlcnZlclRvb2xzO1xuXHRcdHJldHVybiBzZXJ2ZXJUb29sc1xuXHRcdFx0PyBzZXJ2ZXJUb29scy5zb21lKHRvb2wgPT4gdG9vbC5uYW1lID09PSBTZXNzaW9uU2VydmVyVG9vbE5hbWUuUmVuYW1lQ2hhdClcblx0XHRcdDogdGhpcy5fb3B0aW9ucy5pc0FjdGl2ZUFnZW50VGl0bGVHZW5lcmF0aW9uRW5hYmxlZD8uKCkgPT09IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWFkUGVyc2lzdGVkVGl0bGVTb3VyY2Uoc2Vzc2lvbjogUHJvdG9jb2xVUkksIGtleTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5fb3B0aW9ucy5zZXNzaW9uRGF0YVNlcnZpY2UudHJ5T3BlbkRhdGFiYXNlPy4oVVJJLnBhcnNlKHNlc3Npb24pKTtcblx0XHRcdGlmICghcmVmKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgcmVmLm9iamVjdC5nZXRNZXRhZGF0YShrZXkpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFNlc3Npb25UaXRsZUNvbnRyb2xsZXJdIEZhaWxlZCB0byByZWFkIHRpdGxlIHNvdXJjZSAnJHtrZXl9J2AsIGVycik7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NhbmNlbFRpdGxlR2VuZXJhdGlvbihzZXNzaW9uOiBQcm90b2NvbFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IHNvdXJjZSA9IHRoaXMuX3RpdGxlR2VuZXJhdGlvbkNhbmNlbGxhdGlvblNvdXJjZXMuZ2V0KHNlc3Npb24pO1xuXHRcdGlmICghc291cmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHNvdXJjZS5kaXNwb3NlKHRydWUpO1xuXHRcdHRoaXMuX3RpdGxlR2VuZXJhdGlvbkNhbmNlbGxhdGlvblNvdXJjZXMuZGVsZXRlKHNlc3Npb24pO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHNvdXJjZSBvZiB0aGlzLl90aXRsZUdlbmVyYXRpb25DYW5jZWxsYXRpb25Tb3VyY2VzLnZhbHVlcygpKSB7XG5cdFx0XHRzb3VyY2UuZGlzcG9zZSh0cnVlKTtcblx0XHR9XG5cdFx0dGhpcy5fdGl0bGVHZW5lcmF0aW9uQ2FuY2VsbGF0aW9uU291cmNlcy5jbGVhcigpO1xuXHRcdHRoaXMuX2xhc3RBcHBsaWVkVGl0bGUuY2xlYXIoKTtcblx0XHR0aGlzLl9wcm92aXNpb25hbFRpdGxlcy5jbGVhcigpO1xuXHRcdHRoaXMuX2F1dG9UaXRsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9yZW5hbWVkVGl0bGVzLmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMscUJBQXFCLGtCQUFrQix3QkFBNEQ7QUFDNUcsU0FBUywwQkFBMEIsd0JBQXdCLHNCQUFzQjtBQUlqRixTQUFTLCtCQUErQiw4QkFBOEIsOEJBQThCLDRCQUE0QixrQ0FBa0Msd0JBQXdCLDBCQUEwQix1Q0FBdUM7QUFFM1AsTUFBTSxtQkFBbUI7QUFDekIsTUFBTSx5Q0FBeUM7QUFDL0MsTUFBTSxtQkFBbUI7QUFDekIsTUFBTSxpQ0FBaUM7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QUFNLFVBQVUsY0FDYiwrREFBK0QsV0FBVztBQUFBO0FBQUEsSUFDMUU7QUFDSCxXQUFPLHlCQUF5QixPQUFPLEVBQUUsVUFBVSx5QkFBeUIsUUFBUSxDQUFDO0FBQUEsRUFDdEY7QUFBQSxFQUVRLG9CQUFvQixTQUFzQixLQUFhLE9BQXFCO0FBQ25GLDJCQUF1QixLQUFLLFNBQVMsb0JBQW9CLEtBQUssYUFBYSxTQUFTLEtBQUssS0FBSztBQUFBLEVBQy9GO0FBQUEsRUFFUSxxQ0FBcUMsU0FBK0I7QUFDM0UsVUFBTSxjQUFjLEtBQUssY0FBYyxnQkFBZ0IsT0FBTyxHQUFHO0FBQ2pFLFdBQU8sY0FDSixZQUFZLEtBQUssVUFBUSxLQUFLLFNBQVMsc0JBQXNCLFVBQVUsSUFDdkUsS0FBSyxTQUFTLHNDQUFzQyxNQUFNO0FBQUEsRUFDOUQ7QUFBQSxFQUVBLE1BQWMsMEJBQTBCLFNBQXNCLEtBQTBDO0FBQ3ZHLFFBQUk7QUFDSCxZQUFNLE1BQU0sTUFBTSxLQUFLLFNBQVMsbUJBQW1CLGtCQUFrQixJQUFJLE1BQU0sT0FBTyxDQUFDO0FBQ3ZGLFVBQUksQ0FBQyxLQUFLO0FBQ1QsZUFBTztBQUFBLE1BQ1I7QUFDQSxVQUFJO0FBQ0gsZUFBTyxNQUFNLElBQUksT0FBTyxZQUFZLEdBQUc7QUFBQSxNQUN4QyxVQUFFO0FBQ0QsWUFBSSxRQUFRO0FBQUEsTUFDYjtBQUFBLElBQ0QsU0FBUyxLQUFLO0FBQ2IsV0FBSyxZQUFZLEtBQUssa0VBQWtFLEdBQUcsS0FBSyxHQUFHO0FBQ25HLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBLEVBRVEsdUJBQXVCLFNBQTRCO0FBQzFELFVBQU0sU0FBUyxLQUFLLG9DQUFvQyxJQUFJLE9BQU87QUFDbkUsUUFBSSxDQUFDLFFBQVE7QUFDWjtBQUFBLElBQ0Q7QUFDQSxXQUFPLFFBQVEsSUFBSTtBQUNuQixTQUFLLG9DQUFvQyxPQUFPLE9BQU87QUFBQSxFQUN4RDtBQUFBLEVBRVMsVUFBZ0I7QUFDeEIsZUFBVyxVQUFVLEtBQUssb0NBQW9DLE9BQU8sR0FBRztBQUN2RSxhQUFPLFFBQVEsSUFBSTtBQUFBLElBQ3BCO0FBQ0EsU0FBSyxvQ0FBb0MsTUFBTTtBQUMvQyxTQUFLLGtCQUFrQixNQUFNO0FBQzdCLFNBQUssbUJBQW1CLE1BQU07QUFDOUIsU0FBSyxZQUFZLE1BQU07QUFDdkIsU0FBSyxlQUFlLE1BQU07QUFDMUIsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUNEO0FBeHVCYSxrQ0FBTjtBQUFBLEVBMEJKO0FBQUEsR0ExQlU7IiwKICAibmFtZXMiOiBbImxhc3RBcHBsaWVkIiwgInR1cm4iLCAiY29udGV4dCIsICJhcHBseSJdCn0K
