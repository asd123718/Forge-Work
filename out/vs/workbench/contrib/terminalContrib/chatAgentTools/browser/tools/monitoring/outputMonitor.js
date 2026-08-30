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
import { timeout } from "../../../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../../../base/common/cancellation.js";
import { Emitter } from "../../../../../../../base/common/event.js";
import { Disposable, MutableDisposable, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../../../nls.js";
import { ITaskService } from "../../../../../tasks/common/taskService.js";
import { OutputMonitorState, PollingConsts } from "./types.js";
import { ITerminalLogService } from "../../../../../../../platform/terminal/common/terminal.js";
function getLastLine(output) {
  if (!output) {
    return "";
  }
  const trimmedOutput = output.replace(/[\r\n]+$/, "");
  if (!trimmedOutput) {
    return "";
  }
  const lastLineFeed = trimmedOutput.lastIndexOf("\n");
  const lastLine = lastLineFeed === -1 ? trimmedOutput : trimmedOutput.slice(lastLineFeed + 1);
  const lastCarriageReturn = lastLine.lastIndexOf("\r");
  return lastCarriageReturn === -1 ? lastLine : lastLine.slice(lastCarriageReturn + 1);
}
let OutputMonitor = class extends Disposable {
  constructor(_execution, _pollFn, invocationContext, token, command, _taskService, _logService) {
    super();
    this._execution = _execution;
    this._pollFn = _pollFn;
    this._taskService = _taskService;
    this._logService = _logService;
    this._state = OutputMonitorState.PollingForIdle;
    /**
     * Flag to track if user has inputted since idle was detected.
     * This is used to skip showing prompts if the user already provided input.
     */
    this._userInputtedSinceIdleDetected = false;
    this._userInputListener = this._register(new MutableDisposable());
    this._outputMonitorTelemetryCounters = {
      inputToolManualAcceptCount: 0,
      inputToolManualRejectCount: 0,
      inputToolManualChars: 0,
      inputToolAutoAcceptCount: 0,
      inputToolAutoChars: 0,
      inputToolManualShownCount: 0,
      inputToolFreeFormInputShownCount: 0,
      inputToolFreeFormInputCount: 0
    };
    this._onDidFinishCommand = this._register(new Emitter());
    this.onDidFinishCommand = this._onDidFinishCommand.event;
    this._onDidDetectInputNeeded = this._register(new Emitter());
    this.onDidDetectInputNeeded = this._onDidDetectInputNeeded.event;
    this._onDidDetectSensitiveInputNeeded = this._register(new Emitter());
    this.onDidDetectSensitiveInputNeeded = this._onDidDetectSensitiveInputNeeded.event;
    this._asyncMode = false;
    this._command = "";
    /**
     * Tracks whether onDidFinishCommand has fired so the event is delivered at
     * most once. The event must fire synchronously during dispose so consumers
     * awaiting `Event.toPromise(onDidFinishCommand)` are unblocked before the
     * underlying emitter is torn down by super.dispose().
     */
    this._didFinish = false;
    this._command = command;
    this._invocationContext = invocationContext;
    const cts = new CancellationTokenSource(token);
    this._currentMonitoringCts = cts;
    this._register(toDisposable(() => {
      this._currentMonitoringCts?.cancel();
      this._currentMonitoringCts?.dispose();
    }));
    timeout(0).then(() => {
      if (this._currentMonitoringCts !== cts) {
        return;
      }
      this._startMonitoring(command, invocationContext, cts.token);
    });
  }
  get state() {
    return this._state;
  }
  _formatLastLineForLog(output) {
    if (!output) {
      return "<empty>";
    }
    const lastLine = getLastLine(output).trimEnd();
    if (!lastLine) {
      return "<empty>";
    }
    if (this._isSensitivePrompt(lastLine)) {
      return "<redacted>";
    }
    return lastLine.length > 200 ? lastLine.slice(0, 200) + "\u2026" : lastLine;
  }
  get pollingResult() {
    return this._pollingResult;
  }
  get outputMonitorTelemetryCounters() {
    return this._outputMonitorTelemetryCounters;
  }
  _fireFinishedOnce() {
    if (this._didFinish) {
      return;
    }
    this._didFinish = true;
    this._onDidFinishCommand.fire();
  }
  dispose() {
    if (!this._didFinish) {
      this._pollingResult ??= {
        state: OutputMonitorState.Cancelled,
        output: this._execution.getOutput(),
        pollDurationMs: 0,
        resources: void 0
      };
    }
    this._fireFinishedOnce();
    super.dispose();
  }
  async _startMonitoring(command, invocationContext, token) {
    const pollStartTime = Date.now();
    let resources;
    let output;
    let extended = false;
    try {
      while (!token.isCancellationRequested) {
        switch (this._state) {
          case OutputMonitorState.PollingForIdle: {
            this._logService.trace(`OutputMonitor: Entering PollingForIdle (extended=${extended})`);
            this._state = await this._waitForIdle(this._execution, extended, token);
            this._logService.trace(`OutputMonitor: PollingForIdle completed -> state=${OutputMonitorState[this._state]}`);
            continue;
          }
          case OutputMonitorState.Timeout: {
            this._logService.trace(`OutputMonitor: Entering Timeout state (extended=${extended})`);
            const shouldContinuePolling = await this._handleTimeoutState(command, invocationContext, extended, token);
            if (shouldContinuePolling) {
              extended = true;
              this._state = OutputMonitorState.PollingForIdle;
              continue;
            } else if (this._asyncMode) {
              this._logService.trace("OutputMonitor: Async mode - timeout reached, waiting for new terminal data");
              extended = false;
              await this._waitForNewData(token);
              if (token.isCancellationRequested) {
                break;
              }
              this._state = OutputMonitorState.PollingForIdle;
              continue;
            } else {
              break;
            }
          }
          case OutputMonitorState.Cancelled:
            break;
          case OutputMonitorState.Idle: {
            this._logService.trace("OutputMonitor: Entering Idle handler");
            const idleResult = await this._handleIdleState(token);
            if (idleResult.shouldContinuePolling) {
              this._logService.trace("OutputMonitor: Idle handler -> continue polling");
              this._state = OutputMonitorState.PollingForIdle;
              continue;
            } else if (this._asyncMode) {
              this._logService.trace("OutputMonitor: Async mode - waiting for new terminal data before next monitoring cycle");
              await this._waitForNewData(token);
              if (token.isCancellationRequested) {
                break;
              }
              this._state = OutputMonitorState.PollingForIdle;
              continue;
            } else {
              this._logService.trace(`OutputMonitor: Idle handler -> stop polling (hasResources=${!!idleResult.resources}, outputLen=${idleResult.output?.length ?? 0})`);
              resources = idleResult.resources;
              output = idleResult.output;
            }
            break;
          }
        }
        if (this._state === OutputMonitorState.Idle || this._state === OutputMonitorState.Cancelled || this._state === OutputMonitorState.Timeout) {
          break;
        }
      }
      if (token.isCancellationRequested) {
        this._state = OutputMonitorState.Cancelled;
      }
    } finally {
      this._logService.trace(`OutputMonitor: Monitoring finished (state=${OutputMonitorState[this._state]}, duration=${Date.now() - pollStartTime}ms)`);
      this._pollingResult = {
        state: this._state,
        output: output ?? this._execution.getOutput(),
        pollDurationMs: Date.now() - pollStartTime,
        resources
      };
      this._userInputListener.clear();
      this._fireFinishedOnce();
    }
  }
  /**
   * Continues monitoring in background mode with a new cancellation token.
   * In background mode, the monitor re-polls for idle and handles prompts
   * whenever new terminal data arrives, rather than stopping after the first
   * idle detection. Resource cost is bounded because the monitor only wakes
   * on new terminal data (via {@link _waitForNewData}) and each idle cycle
   * is capped by the standard polling timeouts.
   */
  continueMonitoringAsync(token) {
    this._asyncMode = true;
    const currentMonitoringCts = this._currentMonitoringCts;
    currentMonitoringCts?.cancel();
    currentMonitoringCts?.dispose();
    this._currentMonitoringCts = new CancellationTokenSource(token);
    this._state = OutputMonitorState.PollingForIdle;
    this._startMonitoring(this._command, this._invocationContext, this._currentMonitoringCts.token);
  }
  /**
   * Waits for new terminal data or cancellation. Used in background mode
   * to avoid polling and LLM calls while the terminal is quiet.
   */
  _waitForNewData(token) {
    return new Promise((resolve) => {
      if (token.isCancellationRequested) {
        resolve();
        return;
      }
      const cleanup = () => {
        dataListener.dispose();
        tokenListener.dispose();
        disposedListener.dispose();
      };
      const dataListener = this._execution.instance.onData(() => {
        cleanup();
        resolve();
      });
      const tokenListener = token.onCancellationRequested(() => {
        cleanup();
        resolve();
      });
      const disposedListener = this._execution.instance.onDisposed(() => {
        cleanup();
        resolve();
      });
    });
  }
  async _handleIdleState(token) {
    const output = this._execution.getOutput();
    const outputTail = output.slice(-1e3);
    const outputLastLine = getLastLine(outputTail);
    this._logService.trace(`OutputMonitor: Idle output summary: len=${output.length}, lastLine=${this._formatLastLineForLog(outputTail)}`);
    if (detectsNonInteractiveHelpPattern(outputLastLine)) {
      this._logService.trace("OutputMonitor: Idle -> non-interactive help pattern detected, stopping");
      return { shouldContinuePolling: false, output };
    }
    const isTask = this._execution.task !== void 0;
    if (isTask && detectsVSCodeTaskFinishMessage(outputTail)) {
      this._logService.trace("OutputMonitor: Idle -> VS Code task finish message detected, stopping");
      return { shouldContinuePolling: false, output };
    }
    if (!isTask && detectsGenericPressAnyKeyPattern(outputTail)) {
      this._logService.trace('OutputMonitor: Idle -> generic "press any key" detected, signaling agent');
      this._onDidDetectInputNeeded.fire();
      this._cleanupIdleInputListener();
      return { shouldContinuePolling: false, output };
    }
    if (this._userInputtedSinceIdleDetected) {
      this._logService.trace("OutputMonitor: User input detected since idle; skipping prompt and continuing polling");
      this._cleanupIdleInputListener();
      return { shouldContinuePolling: true };
    }
    let shouldFireInputNeeded = detectsInputRequiredPattern(outputLastLine);
    if (!shouldFireInputNeeded && detectsLikelyInputRequiredPattern(outputLastLine)) {
      const isActive = this._execution.isActive ? await this._execution.isActive() : void 0;
      if (isActive === true) {
        shouldFireInputNeeded = true;
      }
    }
    if (shouldFireInputNeeded && this._userInputtedSinceIdleDetected) {
      this._logService.trace("OutputMonitor: User input detected during isActive await; skipping prompt and continuing polling");
      this._cleanupIdleInputListener();
      return { shouldContinuePolling: true };
    }
    if (this._asyncMode) {
      if (shouldFireInputNeeded) {
        if (this._isSensitivePrompt(outputLastLine)) {
          this._logService.trace("OutputMonitor: Async mode - sensitive input prompt detected, signaling sensitive UI");
          this._onDidDetectSensitiveInputNeeded.fire();
        } else {
          this._logService.trace("OutputMonitor: Async mode - input-required pattern detected, signaling agent");
          this._onDidDetectInputNeeded.fire();
        }
      }
      this._cleanupIdleInputListener();
      return { shouldContinuePolling: false, output };
    }
    if (shouldFireInputNeeded) {
      if (this._isSensitivePrompt(outputLastLine)) {
        this._logService.trace("OutputMonitor: Sensitive input prompt detected, signaling sensitive UI");
        this._onDidDetectSensitiveInputNeeded.fire();
      } else {
        this._logService.trace("OutputMonitor: Input-required pattern detected, signaling agent");
        this._onDidDetectInputNeeded.fire();
      }
      this._cleanupIdleInputListener();
      return { shouldContinuePolling: false, output };
    }
    this._cleanupIdleInputListener();
    const custom = await this._pollFn?.(this._execution, token, this._taskService);
    this._logService.trace(`OutputMonitor: Custom poller result: ${custom ? "provided" : "none"}`);
    const resources = custom?.resources;
    return { resources, shouldContinuePolling: false, output: custom?.output ?? output };
  }
  async _handleTimeoutState(_command, _invocationContext, _extended, _token) {
    if (_extended) {
      this._logService.info("OutputMonitor: Extended polling timeout reached after 2 minutes, signaling potential input needed");
      this._onDidDetectInputNeeded.fire();
      this._state = OutputMonitorState.Cancelled;
      return false;
    }
    return true;
  }
  /**
   * Single bounded polling pass that returns when:
   *  - terminal becomes inactive/idle, or
   *  - timeout window elapses.
   */
  async _waitForIdle(execution, extendedPolling, token) {
    const maxWaitMs = extendedPolling ? PollingConsts.ExtendedPollingMaxDuration : PollingConsts.FirstPollingMaxDuration;
    const maxInterval = PollingConsts.MaxPollingIntervalDuration;
    let currentInterval = PollingConsts.MinPollingDuration;
    let waited = 0;
    let consecutiveIdleEvents = 0;
    let hasReceivedData = false;
    const onDataDisposable = execution.instance.onData((_data) => {
      hasReceivedData = true;
    });
    try {
      while (!token.isCancellationRequested && waited < maxWaitMs) {
        const waitTime = Math.min(currentInterval, maxWaitMs - waited);
        try {
          await timeout(waitTime, token);
        } catch (err) {
          if (token.isCancellationRequested) {
            return OutputMonitorState.Cancelled;
          }
          throw err;
        }
        waited += waitTime;
        currentInterval = Math.min(currentInterval * 2, maxInterval);
        const currentOutput = execution.getOutput();
        const currentTail = currentOutput.slice(-1e3);
        const currentLastLine = getLastLine(currentTail);
        if (detectsNonInteractiveHelpPattern(currentLastLine)) {
          this._logService.trace(`OutputMonitor: waitForIdle -> non-interactive help detected (waited=${waited}ms)`);
          this._state = OutputMonitorState.Idle;
          this._setupIdleInputListener();
          return this._state;
        }
        const promptResult = detectsHighConfidenceInputPattern(currentLastLine);
        if (promptResult) {
          this._logService.trace(`OutputMonitor: waitForIdle -> high-confidence input pattern detected (waited=${waited}ms, lastLine=${this._formatLastLineForLog(currentTail)})`);
          this._state = OutputMonitorState.Idle;
          this._setupIdleInputListener();
          return this._state;
        }
        if (hasReceivedData) {
          consecutiveIdleEvents = 0;
          hasReceivedData = false;
        } else {
          consecutiveIdleEvents++;
        }
        const recentlyIdle = consecutiveIdleEvents >= PollingConsts.MinIdleEvents;
        const isActive = execution.isActive ? await execution.isActive() : void 0;
        this._logService.trace(`OutputMonitor: waitForIdle check: waited=${waited}ms, recentlyIdle=${recentlyIdle}, isActive=${isActive}`);
        if (recentlyIdle && isActive !== true) {
          this._logService.trace(`OutputMonitor: waitForIdle -> recentlyIdle && !active (waited=${waited}ms, lastLine=${this._formatLastLineForLog(currentTail)})`);
          this._state = OutputMonitorState.Idle;
          this._setupIdleInputListener();
          return this._state;
        }
        if (recentlyIdle && isActive === true && detectsLikelyInputRequiredPattern(currentLastLine)) {
          this._logService.trace(`OutputMonitor: waitForIdle -> broad input pattern detected while active+idle (waited=${waited}ms, lastLine=${this._formatLastLineForLog(currentTail)})`);
          this._state = OutputMonitorState.Idle;
          this._setupIdleInputListener();
          return this._state;
        }
      }
    } finally {
      onDataDisposable.dispose();
    }
    if (token.isCancellationRequested) {
      return OutputMonitorState.Cancelled;
    }
    return OutputMonitorState.Timeout;
  }
  /**
   * Sets up a listener for user input that triggers immediately when idle is detected.
   * This ensures we catch any input that happens between idle detection and prompt creation.
   */
  _setupIdleInputListener() {
    if (this._store.isDisposed) {
      return;
    }
    this._userInputtedSinceIdleDetected = false;
    this._logService.trace("OutputMonitor: Setting up idle input listener");
    this._userInputListener.value = this._execution.instance.onDidInputData(() => {
      this._userInputtedSinceIdleDetected = true;
      this._logService.trace("OutputMonitor: Detected user terminal input while idle");
    });
  }
  /**
   * Cleans up the idle input listener and resets the flag.
   */
  _cleanupIdleInputListener() {
    this._userInputtedSinceIdleDetected = false;
    this._userInputListener.clear();
  }
  _isSensitivePrompt(prompt) {
    if (isCanonicalSudoSPrompt(this._command, prompt)) {
      return false;
    }
    return detectsSensitiveInputPrompt(prompt);
  }
};
OutputMonitor = __decorateClass([
  __decorateParam(5, ITaskService),
  __decorateParam(6, ITerminalLogService)
], OutputMonitor);
function isCanonicalSudoSPrompt(command, prompt) {
  return /(?:^|\s)sudo\s+-S(?:\s|$)/.test(command) && /^\[sudo\]\s+password for .+:\s*$/i.test(prompt);
}
function detectsSensitiveInputPrompt(cursorLine) {
  return /(password|passphrase|token|api\s*key|secret|verification code|otp\b|one[\s-]?time (?:code|password)|2fa|mfa|pin\s*(?:code|number)?[: ]?\s*$|authentication code)/i.test(cursorLine);
}
function matchTerminalPromptOption(options, suggestedOption) {
  const normalize = (value) => value.replace(/['"`]/g, "").trim().replace(/[.,:;]+$/, "");
  const normalizedSuggestion = normalize(suggestedOption);
  if (!normalizedSuggestion) {
    return { option: void 0, index: -1 };
  }
  const candidates = [normalizedSuggestion];
  const firstWhitespaceToken = normalizedSuggestion.split(/\s+/)[0];
  if (firstWhitespaceToken && firstWhitespaceToken !== normalizedSuggestion) {
    candidates.push(firstWhitespaceToken);
  }
  const firstAlphaNum = normalizedSuggestion.match(/[A-Za-z0-9]+/);
  if (firstAlphaNum?.[0] && firstAlphaNum[0] !== normalizedSuggestion && firstAlphaNum[0] !== firstWhitespaceToken) {
    candidates.push(firstAlphaNum[0]);
  }
  for (const candidate of candidates) {
    const exactIndex = options.findIndex((opt) => normalize(opt) === candidate);
    if (exactIndex !== -1) {
      return { option: options[exactIndex], index: exactIndex };
    }
    const lowerCandidate = candidate.toLowerCase();
    const ciIndex = options.findIndex((opt) => normalize(opt).toLowerCase() === lowerCandidate);
    if (ciIndex !== -1) {
      return { option: options[ciIndex], index: ciIndex };
    }
  }
  return { option: void 0, index: -1 };
}
function detectsHighConfidenceInputPattern(cursorLine) {
  return [
    // PowerShell-style multi-option line (supports [?] Help and optional default suffix) ending
    // in whitespace.  Uses [^\[]* to match each label (everything up to the next bracket),
    // ensuring linear-time matching with no nested quantifiers that could cause ReDoS.
    /\s*(?:\[[^\]]\][^\[]*)+(?:\(default is\s+"[^"]+"\):)?\s+$/,
    // Bracketed/parenthesized yes/no pairs at end of line: (y/n), [Y/n], (yes/no), [no/yes]
    /(?:\(|\[)\s*(?:y(?:es)?\s*\/\s*n(?:o)?|n(?:o)?\s*\/\s*y(?:es)?)\s*(?:\]|\))\s+$/i,
    // Same as above but allows a preceding '?' or ':' and optional wrappers e.g.
    // "Continue? (y/n)" or "Overwrite: [yes/no]"
    /[?:]\s*(?:\(|\[)?\s*y(?:es)?\s*\/\s*n(?:o)?\s*(?:\]|\))?\s+$/i,
    // Confirmation prompts ending with (y) followed by trailing space, e.g. "Ok to proceed? (y) "
    // The trailing space indicates the cursor is positioned after the prompt awaiting input, as
    // opposed to normal command output that happens to contain "(y)" followed by a newline.
    /\(y\) +$/i,
    // Prompt with parenthesized default value e.g. "package name: (test) " or "version: (1.0.0) ".
    // REQUIRES at least one space between the colon and the opening paren (`\s+`, not `\s*`)
    // so this rule does not match git-aware shell prompts like
    // allow-any-unicode-next-line
    //   "➜  myrepo git:(main) "                    (oh-my-zsh / robbyrussell)
    //   "[user@host ~/myrepo (main)]$ "
    // where the colon abuts the paren with no separator. npm-init / yarn-init style
    // prompts always render at least one space after the colon, so this stays specific
    // without dropping the intended matches.
    /:\s+\([^)]*\) +$/,
    // Line contains (END) which is common in pagers
    /\(END\)$/,
    // Password prompt. Requires a trailing colon (e.g. "Password:", "[sudo] password for user:")
    // and tolerates zero or more trailing spaces — xterm's `translateToString(trimRight=true)`
    // strips trailing whitespace from non-wrapped buffer lines, so a real `Password: ` prompt
    // is captured from the buffer as `Password:` with no trailing space.
    /password(?: for [^:]+)?:\s*$/i,
    // "Press a key" or "Press any key"
    /press a(?:ny)? key/i,
    // Interactive prompt libraries (prompts, enquirer, inquirer) prefix the prompt with
    // '? ' at the start of the line and end with a distinctive chevron character
    // followed by optional trailing whitespace where the cursor is awaiting input.
    // Anchoring the '?' to the start of the line (after optional whitespace/ANSI
    // escapes) avoids false positives from normal output that contains both a '?'
    // allow-any-unicode-next-line
    // and a chevron (e.g. "What happened? ›").
    // Examples:
    //   "? Do you want to install jsdom? <chevron>"  (prompts)
    //   "? Pick a color <chevron> "                  (enquirer)
    // allow-any-unicode-next-line
    /^(?:\s|\x1b\[[0-9;]*m)*\?.*[›❯▸▶]\s*$/
  ].some((e) => e.test(cursorLine));
}
function detectsInputRequiredPattern(cursorLine) {
  return detectsHighConfidenceInputPattern(cursorLine);
}
function detectsLikelyInputRequiredPattern(cursorLine) {
  if (detectsHighConfidenceInputPattern(cursorLine)) {
    return true;
  }
  return [
    // Line ends with ':' followed by at least one space. The trailing space indicates a
    // waiting prompt (cursor positioned after the colon). A bare ':\n' at end of buffer is
    // usually non-prompt output (e.g. a header or log line) and must not match.
    // NOTE: This is a broad pattern — only use when the caller has independent evidence
    // (e.g. `isActive === true`) that the command is still consuming stdin. On a finished
    // command, log output like `Last Command: ` is indistinguishable from a real prompt.
    /: +$/,
    // Line ends with '?' followed by at least one space (optionally followed by a
    // parenthesized hint like "Continue? (yes/no) "). Requiring trailing space avoids
    // matching arbitrary command output where a line happens to end with '?'.
    // NOTE: This is a broad pattern — same caller-side guard required as above.
    /\? *(?:\([a-z\s]+\))? +$/i
  ].some((e) => e.test(cursorLine));
}
function detectsNonInteractiveHelpPattern(cursorLine) {
  return [
    /press [h?]\s*(?:\+\s*enter)?\s*to (?:show|open|display|get|see)\s*(?:available )?(?:help|commands|options)/i,
    /press h\s*(?:or\s*\?)?\s*(?:\+\s*enter)?\s*for (?:help|commands|options)/i,
    /press \?\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:help|commands|options|list)/i,
    /type\s*[h?]\s*(?:\+\s*enter)?\s*(?:for|to see|to show)\s*(?:help|commands|options)/i,
    /hit\s*[h?]\s*(?:\+\s*enter)?\s*(?:for|to see|to show)\s*(?:help|commands|options)/i,
    /press o\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:open|launch)(?:\s*(?:the )?(?:app|application|browser)|\s+in\s+(?:the\s+)?browser)?/i,
    /press r\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:restart|reload|refresh)(?:\s*(?:the )?(?:server|dev server|service))?/i,
    /press q\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:quit|exit|stop)(?:\s*(?:the )?(?:server|app|process))?/i,
    /press u\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:show|print|display)\s*(?:the )?(?:server )?urls?/i
  ].some((e) => e.test(cursorLine));
}
const taskFinishMessages = [
  // "Terminal will be reused by tasks, press any key to close it."
  localize("closeTerminal", "Terminal will be reused by tasks, press any key to close it."),
  localize("reuseTerminal", "Terminal will be reused by tasks, press any key to close it."),
  // "Press any key to close the terminal." (with exit code placeholder removed for matching)
  localize("exitCode.closeTerminal", "Press any key to close the terminal."),
  localize("exitCode.reuseTerminal", "Press any key to close the terminal."),
  // Punctuation variant: "The terminal will be reused by tasks. Press any key to close."
  localize("reuseTerminal.pressClose", "The terminal will be reused by tasks. Press any key to close.")
];
const normalizedTaskFinishMessages = taskFinishMessages.map(
  (msg) => msg.replace(/[\s.,:;!?"'`()[\]{}<>\-_/\\]+/g, "").toLowerCase()
);
function detectsVSCodeTaskFinishMessage(cursorLine) {
  const compact = cursorLine.replace(/[\s.,:;!?"'`()[\]{}<>\-_/\\]+/g, "").toLowerCase();
  return normalizedTaskFinishMessages.some((msg) => compact.includes(msg));
}
function detectsGenericPressAnyKeyPattern(cursorLine) {
  if (detectsVSCodeTaskFinishMessage(cursorLine)) {
    return false;
  }
  return /press a(?:ny)? key/i.test(cursorLine);
}
export {
  OutputMonitor,
  detectsGenericPressAnyKeyPattern,
  detectsHighConfidenceInputPattern,
  detectsInputRequiredPattern,
  detectsLikelyInputRequiredPattern,
  detectsNonInteractiveHelpPattern,
  detectsSensitiveInputPrompt,
  detectsVSCodeTaskFinishMessage,
  getLastLine,
  matchTerminalPromptOption
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXGJyb3dzZXJcXHRvb2xzXFxtb25pdG9yaW5nXFxvdXRwdXRNb25pdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUsIHR5cGUgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVRvb2xJbnZvY2F0aW9uQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRhc2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGFza3MvY29tbW9uL3Rhc2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaW5rTG9jYXRpb24gfSBmcm9tICcuLi8uLi90YXNrSGVscGVycy5qcyc7XG5pbXBvcnQgeyBJRXhlY3V0aW9uLCBJUG9sbGluZ1Jlc3VsdCwgT3V0cHV0TW9uaXRvclN0YXRlLCBQb2xsaW5nQ29uc3RzIH0gZnJvbSAnLi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJT3V0cHV0TW9uaXRvciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRyZWFkb25seSBwb2xsaW5nUmVzdWx0OiBJUG9sbGluZ1Jlc3VsdCAmIHsgcG9sbER1cmF0aW9uTXM6IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBvdXRwdXRNb25pdG9yVGVsZW1ldHJ5Q291bnRlcnM6IElPdXRwdXRNb25pdG9yVGVsZW1ldHJ5Q291bnRlcnM7XG5cblx0cmVhZG9ubHkgb25EaWRGaW5pc2hDb21tYW5kOiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgb25EaWREZXRlY3RJbnB1dE5lZWRlZDogRXZlbnQ8dm9pZD47XG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuIHRoZSB0ZXJtaW5hbCBpcyBkZXRlY3RlZCB0byBiZSB3YWl0aW5nIGZvciBzZW5zaXRpdmUgaW5wdXRcblx0ICogKGUuZy4gYSBwYXNzd29yZCwgcGFzc3BocmFzZSwgdG9rZW4sIHNlY3JldCBvciB2ZXJpZmljYXRpb24gY29kZSkuIFRoaXNcblx0ICogaXMgZmlyZWQgKmluc3RlYWQgb2YqIHtAbGluayBvbkRpZERldGVjdElucHV0TmVlZGVkfSBzbyBjYWxsZXJzIGNhbiBzaG93XG5cdCAqIFVJIHRoYXQgZm9jdXNlcyB0aGUgdGVybWluYWwgcmF0aGVyIHRoYW4gcm91dGluZyB0aGUgcHJvbXB0IHRocm91Z2ggdGhlXG5cdCAqIGFnZW50LlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWREZXRlY3RTZW5zaXRpdmVJbnB1dE5lZWRlZDogRXZlbnQ8dm9pZD47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU91dHB1dE1vbml0b3JUZWxlbWV0cnlDb3VudGVycyB7XG5cdGlucHV0VG9vbE1hbnVhbEFjY2VwdENvdW50OiBudW1iZXI7XG5cdGlucHV0VG9vbE1hbnVhbFJlamVjdENvdW50OiBudW1iZXI7XG5cdGlucHV0VG9vbE1hbnVhbENoYXJzOiBudW1iZXI7XG5cdGlucHV0VG9vbEF1dG9BY2NlcHRDb3VudDogbnVtYmVyO1xuXHRpbnB1dFRvb2xBdXRvQ2hhcnM6IG51bWJlcjtcblx0aW5wdXRUb29sTWFudWFsU2hvd25Db3VudDogbnVtYmVyO1xuXHRpbnB1dFRvb2xGcmVlRm9ybUlucHV0U2hvd25Db3VudDogbnVtYmVyO1xuXHRpbnB1dFRvb2xGcmVlRm9ybUlucHV0Q291bnQ6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBsYXN0IHZpc2libGUgbGluZSBmcm9tIHRlcm1pbmFsIG91dHB1dCBhZnRlciB0cmltbWluZyB0cmFpbGluZyBsaW5lIGJyZWFrcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldExhc3RMaW5lKG91dHB1dDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0aWYgKCFvdXRwdXQpIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblx0Y29uc3QgdHJpbW1lZE91dHB1dCA9IG91dHB1dC5yZXBsYWNlKC9bXFxyXFxuXSskLywgJycpO1xuXHRpZiAoIXRyaW1tZWRPdXRwdXQpIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblx0Y29uc3QgbGFzdExpbmVGZWVkID0gdHJpbW1lZE91dHB1dC5sYXN0SW5kZXhPZignXFxuJyk7XG5cdGNvbnN0IGxhc3RMaW5lID0gbGFzdExpbmVGZWVkID09PSAtMSA/IHRyaW1tZWRPdXRwdXQgOiB0cmltbWVkT3V0cHV0LnNsaWNlKGxhc3RMaW5lRmVlZCArIDEpO1xuXHRjb25zdCBsYXN0Q2FycmlhZ2VSZXR1cm4gPSBsYXN0TGluZS5sYXN0SW5kZXhPZignXFxyJyk7XG5cdHJldHVybiBsYXN0Q2FycmlhZ2VSZXR1cm4gPT09IC0xID8gbGFzdExpbmUgOiBsYXN0TGluZS5zbGljZShsYXN0Q2FycmlhZ2VSZXR1cm4gKyAxKTtcbn1cblxuZXhwb3J0IGNsYXNzIE91dHB1dE1vbml0b3IgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU91dHB1dE1vbml0b3Ige1xuXHRwcml2YXRlIF9zdGF0ZTogT3V0cHV0TW9uaXRvclN0YXRlID0gT3V0cHV0TW9uaXRvclN0YXRlLlBvbGxpbmdGb3JJZGxlO1xuXHRnZXQgc3RhdGUoKTogT3V0cHV0TW9uaXRvclN0YXRlIHsgcmV0dXJuIHRoaXMuX3N0YXRlOyB9XG5cblx0cHJpdmF0ZSBfZm9ybWF0TGFzdExpbmVGb3JMb2cob3V0cHV0OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdGlmICghb3V0cHV0KSB7XG5cdFx0XHRyZXR1cm4gJzxlbXB0eT4nO1xuXHRcdH1cblx0XHRjb25zdCBsYXN0TGluZSA9IGdldExhc3RMaW5lKG91dHB1dCkudHJpbUVuZCgpO1xuXHRcdGlmICghbGFzdExpbmUpIHtcblx0XHRcdHJldHVybiAnPGVtcHR5Pic7XG5cdFx0fVxuXHRcdC8vIEF2b2lkIGxvZ2dpbmcgcG90ZW50aWFsbHkgc2Vuc2l0aXZlIHZhbHVlcyBmcm9tIGNvbW1vbiBzZWNyZXQgcHJvbXB0cy5cblx0XHRpZiAodGhpcy5faXNTZW5zaXRpdmVQcm9tcHQobGFzdExpbmUpKSB7XG5cdFx0XHRyZXR1cm4gJzxyZWRhY3RlZD4nO1xuXHRcdH1cblx0XHQvLyBLZWVwIGxvZ3MgYm91bmRlZC5cblx0XHRyZXR1cm4gbGFzdExpbmUubGVuZ3RoID4gMjAwID8gbGFzdExpbmUuc2xpY2UoMCwgMjAwKSArICdcdTIwMjYnIDogbGFzdExpbmU7XG5cdH1cblxuXHRwcml2YXRlIF9wb2xsaW5nUmVzdWx0OiBJUG9sbGluZ1Jlc3VsdCAmIHsgcG9sbER1cmF0aW9uTXM6IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuXHRnZXQgcG9sbGluZ1Jlc3VsdCgpOiBJUG9sbGluZ1Jlc3VsdCAmIHsgcG9sbER1cmF0aW9uTXM6IG51bWJlciB9IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3BvbGxpbmdSZXN1bHQ7IH1cblxuXHQvKipcblx0ICogRmxhZyB0byB0cmFjayBpZiB1c2VyIGhhcyBpbnB1dHRlZCBzaW5jZSBpZGxlIHdhcyBkZXRlY3RlZC5cblx0ICogVGhpcyBpcyB1c2VkIHRvIHNraXAgc2hvd2luZyBwcm9tcHRzIGlmIHRoZSB1c2VyIGFscmVhZHkgcHJvdmlkZWQgaW5wdXQuXG5cdCAqL1xuXHRwcml2YXRlIF91c2VySW5wdXR0ZWRTaW5jZUlkbGVEZXRlY3RlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF91c2VySW5wdXRMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb3V0cHV0TW9uaXRvclRlbGVtZXRyeUNvdW50ZXJzOiBJT3V0cHV0TW9uaXRvclRlbGVtZXRyeUNvdW50ZXJzID0ge1xuXHRcdGlucHV0VG9vbE1hbnVhbEFjY2VwdENvdW50OiAwLFxuXHRcdGlucHV0VG9vbE1hbnVhbFJlamVjdENvdW50OiAwLFxuXHRcdGlucHV0VG9vbE1hbnVhbENoYXJzOiAwLFxuXHRcdGlucHV0VG9vbEF1dG9BY2NlcHRDb3VudDogMCxcblx0XHRpbnB1dFRvb2xBdXRvQ2hhcnM6IDAsXG5cdFx0aW5wdXRUb29sTWFudWFsU2hvd25Db3VudDogMCxcblx0XHRpbnB1dFRvb2xGcmVlRm9ybUlucHV0U2hvd25Db3VudDogMCxcblx0XHRpbnB1dFRvb2xGcmVlRm9ybUlucHV0Q291bnQ6IDAsXG5cdH07XG5cdGdldCBvdXRwdXRNb25pdG9yVGVsZW1ldHJ5Q291bnRlcnMoKTogUmVhZG9ubHk8SU91dHB1dE1vbml0b3JUZWxlbWV0cnlDb3VudGVycz4geyByZXR1cm4gdGhpcy5fb3V0cHV0TW9uaXRvclRlbGVtZXRyeUNvdW50ZXJzOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRGaW5pc2hDb21tYW5kID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRmluaXNoQ29tbWFuZDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZEZpbmlzaENvbW1hbmQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREZXRlY3RJbnB1dE5lZWRlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZERldGVjdElucHV0TmVlZGVkOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkRGV0ZWN0SW5wdXROZWVkZWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREZXRlY3RTZW5zaXRpdmVJbnB1dE5lZWRlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZERldGVjdFNlbnNpdGl2ZUlucHV0TmVlZGVkOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkRGV0ZWN0U2Vuc2l0aXZlSW5wdXROZWVkZWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfYXN5bmNNb2RlID0gZmFsc2U7XG5cdHByaXZhdGUgX2NvbW1hbmQgPSAnJztcblx0cHJpdmF0ZSBfaW52b2NhdGlvbkNvbnRleHQ6IElUb29sSW52b2NhdGlvbkNvbnRleHQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2N1cnJlbnRNb25pdG9yaW5nQ3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIFRyYWNrcyB3aGV0aGVyIG9uRGlkRmluaXNoQ29tbWFuZCBoYXMgZmlyZWQgc28gdGhlIGV2ZW50IGlzIGRlbGl2ZXJlZCBhdFxuXHQgKiBtb3N0IG9uY2UuIFRoZSBldmVudCBtdXN0IGZpcmUgc3luY2hyb25vdXNseSBkdXJpbmcgZGlzcG9zZSBzbyBjb25zdW1lcnNcblx0ICogYXdhaXRpbmcgYEV2ZW50LnRvUHJvbWlzZShvbkRpZEZpbmlzaENvbW1hbmQpYCBhcmUgdW5ibG9ja2VkIGJlZm9yZSB0aGVcblx0ICogdW5kZXJseWluZyBlbWl0dGVyIGlzIHRvcm4gZG93biBieSBzdXBlci5kaXNwb3NlKCkuXG5cdCAqL1xuXHRwcml2YXRlIF9kaWRGaW5pc2ggPSBmYWxzZTtcblxuXHRwcml2YXRlIF9maXJlRmluaXNoZWRPbmNlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kaWRGaW5pc2gpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGlkRmluaXNoID0gdHJ1ZTtcblx0XHR0aGlzLl9vbkRpZEZpbmlzaENvbW1hbmQuZmlyZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHQvLyBEZWxpdmVyIG9uRGlkRmluaXNoQ29tbWFuZCB0byBjb25zdW1lcnMgQkVGT1JFIHN1cGVyLmRpc3Bvc2UoKSB0ZWFyc1xuXHRcdC8vIGRvd24gdGhlIGVtaXR0ZXIuIEZpZWxkLWluaXRpYWxpemVkIGRpc3Bvc2FibGVzIChpbmNsdWRpbmdcblx0XHQvLyBfb25EaWRGaW5pc2hDb21tYW5kKSBhcmUgcmVnaXN0ZXJlZCBiZWZvcmUgYW55IGRpc3Bvc2FibGUgYWRkZWQgaW5cblx0XHQvLyB0aGUgY29uc3RydWN0b3IgYm9keSBhbmQgYXJlIGRpc3Bvc2VkIGZpcnN0IGJ5IERpc3Bvc2FibGVTdG9yZSBpblxuXHRcdC8vIGluc2VydGlvbiBvcmRlci4gV2l0aG91dCB0aGlzIG92ZXJyaWRlLCBjb25zdW1lcnMgYXdhaXRpbmdcblx0XHQvLyBgRXZlbnQudG9Qcm9taXNlKG9uRGlkRmluaXNoQ29tbWFuZClgIHdvdWxkIHJhY2Ugd2l0aCBlbWl0dGVyXG5cdFx0Ly8gdGVhcmRvd24gYW5kIGhhbmcgd2hlbiBkaXNwb3NlIGxhbmRzIHdoaWxlIF9zdGFydE1vbml0b3JpbmcgaXMgc3RpbGxcblx0XHQvLyBpbiBmbGlnaHQuXG5cdFx0aWYgKCF0aGlzLl9kaWRGaW5pc2gpIHtcblx0XHRcdC8vIFN5bnRoZXNpemUgYSBDYW5jZWxsZWQgcG9sbGluZ1Jlc3VsdCBzbyBjb25zdW1lcnMgdGhhdCByZWFkXG5cdFx0XHQvLyBgbW9uaXRvci5wb2xsaW5nUmVzdWx0YCBhZnRlciBhd2FpdGluZyBvbkRpZEZpbmlzaENvbW1hbmQgYWx3YXlzXG5cdFx0XHQvLyBzZWUgYSBkZWZpbmVkIHZhbHVlIHdpdGggdGhlIG91dHB1dCBjb2xsZWN0ZWQgc28gZmFyLlxuXHRcdFx0dGhpcy5fcG9sbGluZ1Jlc3VsdCA/Pz0ge1xuXHRcdFx0XHRzdGF0ZTogT3V0cHV0TW9uaXRvclN0YXRlLkNhbmNlbGxlZCxcblx0XHRcdFx0b3V0cHV0OiB0aGlzLl9leGVjdXRpb24uZ2V0T3V0cHV0KCksXG5cdFx0XHRcdHBvbGxEdXJhdGlvbk1zOiAwLFxuXHRcdFx0XHRyZXNvdXJjZXM6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0fVxuXHRcdHRoaXMuX2ZpcmVGaW5pc2hlZE9uY2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leGVjdXRpb246IElFeGVjdXRpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcG9sbEZuOiAoKGV4ZWN1dGlvbjogSUV4ZWN1dGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCB0YXNrU2VydmljZTogSVRhc2tTZXJ2aWNlKSA9PiBQcm9taXNlPElQb2xsaW5nUmVzdWx0IHwgdW5kZWZpbmVkPikgfCB1bmRlZmluZWQsXG5cdFx0aW52b2NhdGlvbkNvbnRleHQ6IElUb29sSW52b2NhdGlvbkNvbnRleHQgfCB1bmRlZmluZWQsXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHRcdGNvbW1hbmQ6IHN0cmluZyxcblx0XHRASVRhc2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rhc2tTZXJ2aWNlOiBJVGFza1NlcnZpY2UsXG5cdFx0QElUZXJtaW5hbExvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSVRlcm1pbmFsTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2NvbW1hbmQgPSBjb21tYW5kO1xuXHRcdHRoaXMuX2ludm9jYXRpb25Db250ZXh0ID0gaW52b2NhdGlvbkNvbnRleHQ7XG5cblx0XHQvLyBDcmVhdGUgdGhlIENUUyBzeW5jaHJvbm91c2x5IHNvIGl0IGlzIGF2YWlsYWJsZSBmb3IgY2FuY2VsbGF0aW9uIGlmIHRoZVxuXHRcdC8vIE91dHB1dE1vbml0b3IgaXMgZGlzcG9zZWQgYmVmb3JlIHRoZSBkZWZlcnJlZCBfc3RhcnRNb25pdG9yaW5nIGZpcmVzLlxuXHRcdC8vIFRoZSByZWdpc3RlcmVkIGRpc3Bvc2FibGUgbXVzdCBjYW5jZWwgKG5vdCBqdXN0IGRpc3Bvc2UpIHRoZSBDVFMgc28gdGhhdFxuXHRcdC8vIHRoZSBhc3luYyBtb25pdG9yaW5nIGxvb3AncyB0b2tlbiBiZWNvbWVzIGlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkPXRydWUgYW5kXG5cdFx0Ly8gdGhlIGxvb3AgZXhpdHMgcHJvbXB0bHkgXHUyMDE0IENhbmNlbGxhdGlvblRva2VuU291cmNlLmRpc3Bvc2UoKSBhbG9uZSBkb2VzXG5cdFx0Ly8gbm90IHNldCBpc0NhbmNlbGxhdGlvblJlcXVlc3RlZC5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UodG9rZW4pO1xuXHRcdHRoaXMuX2N1cnJlbnRNb25pdG9yaW5nQ3RzID0gY3RzO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jdXJyZW50TW9uaXRvcmluZ0N0cz8uY2FuY2VsKCk7XG5cdFx0XHR0aGlzLl9jdXJyZW50TW9uaXRvcmluZ0N0cz8uZGlzcG9zZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFN0YXJ0IGFzeW5jIHRvIGVuc3VyZSBsaXN0ZW5lcnMgYXJlIHNldCB1cC5cblx0XHQvLyBDYXB0dXJlIGBjdHNgIGxvY2FsbHkgc28gdGhhdCBpZiBjb250aW51ZU1vbml0b3JpbmdBc3luYyByZXBsYWNlc1xuXHRcdC8vIF9jdXJyZW50TW9uaXRvcmluZ0N0cyBiZWZvcmUgdGhpcyBmaXJlcywgd2UgZGV0ZWN0IHRoZSByZXBsYWNlbWVudFxuXHRcdC8vIGFuZCBhdm9pZCBzdGFydGluZyBhIGR1cGxpY2F0ZSBtb25pdG9yaW5nIGxvb3AuIF9zdGFydE1vbml0b3Jpbmdcblx0XHQvLyBoYW5kbGVzIGEgY2FuY2VsbGVkIHRva2VuIGNvcnJlY3RseSBieSBmaXJpbmcgb25EaWRGaW5pc2hDb21tYW5kIGluXG5cdFx0Ly8gaXRzIGZpbmFsbHkgYmxvY2ssIHNvIHdlIGFsd2F5cyBjYWxsIGl0IHdoZW4gd2UncmUgc3RpbGwgdGhlIGN1cnJlbnRcblx0XHQvLyBDVFMgKGV2ZW4gaWYgdGhlIHRva2VuIGhhcyBzaW5jZSBiZWVuIGNhbmNlbGxlZCkuXG5cdFx0dGltZW91dCgwKS50aGVuKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jdXJyZW50TW9uaXRvcmluZ0N0cyAhPT0gY3RzKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3N0YXJ0TW9uaXRvcmluZyhjb21tYW5kLCBpbnZvY2F0aW9uQ29udGV4dCwgY3RzLnRva2VuKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3N0YXJ0TW9uaXRvcmluZyhcblx0XHRjb21tYW5kOiBzdHJpbmcsXG5cdFx0aW52b2NhdGlvbkNvbnRleHQ6IElUb29sSW52b2NhdGlvbkNvbnRleHQgfCB1bmRlZmluZWQsXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHBvbGxTdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuXG5cdFx0bGV0IHJlc291cmNlcztcblx0XHRsZXQgb3V0cHV0O1xuXG5cdFx0bGV0IGV4dGVuZGVkID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdHdoaWxlICghdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0c3dpdGNoICh0aGlzLl9zdGF0ZSkge1xuXHRcdFx0XHRcdGNhc2UgT3V0cHV0TW9uaXRvclN0YXRlLlBvbGxpbmdGb3JJZGxlOiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBPdXRwdXRNb25pdG9yOiBFbnRlcmluZyBQb2xsaW5nRm9ySWRsZSAoZXh0ZW5kZWQ9JHtleHRlbmRlZH0pYCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9zdGF0ZSA9IGF3YWl0IHRoaXMuX3dhaXRGb3JJZGxlKHRoaXMuX2V4ZWN1dGlvbiwgZXh0ZW5kZWQsIHRva2VuKTtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYE91dHB1dE1vbml0b3I6IFBvbGxpbmdGb3JJZGxlIGNvbXBsZXRlZCAtPiBzdGF0ZT0ke091dHB1dE1vbml0b3JTdGF0ZVt0aGlzLl9zdGF0ZV19YCk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSBPdXRwdXRNb25pdG9yU3RhdGUuVGltZW91dDoge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgT3V0cHV0TW9uaXRvcjogRW50ZXJpbmcgVGltZW91dCBzdGF0ZSAoZXh0ZW5kZWQ9JHtleHRlbmRlZH0pYCk7XG5cdFx0XHRcdFx0XHRjb25zdCBzaG91bGRDb250aW51ZVBvbGxpbmcgPSBhd2FpdCB0aGlzLl9oYW5kbGVUaW1lb3V0U3RhdGUoY29tbWFuZCwgaW52b2NhdGlvbkNvbnRleHQsIGV4dGVuZGVkLCB0b2tlbik7XG5cdFx0XHRcdFx0XHRpZiAoc2hvdWxkQ29udGludWVQb2xsaW5nKSB7XG5cdFx0XHRcdFx0XHRcdGV4dGVuZGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fc3RhdGUgPSBPdXRwdXRNb25pdG9yU3RhdGUuUG9sbGluZ0ZvcklkbGU7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLl9hc3luY01vZGUpIHtcblx0XHRcdFx0XHRcdFx0Ly8gSW4gYXN5bmMgbW9kZSwgd2FpdCBmb3IgbmV3IGRhdGEgaW5zdGVhZCBvZiBzdG9wcGluZyBvbiB0aW1lb3V0XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ091dHB1dE1vbml0b3I6IEFzeW5jIG1vZGUgLSB0aW1lb3V0IHJlYWNoZWQsIHdhaXRpbmcgZm9yIG5ldyB0ZXJtaW5hbCBkYXRhJyk7XG5cdFx0XHRcdFx0XHRcdGV4dGVuZGVkID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX3dhaXRGb3JOZXdEYXRhKHRva2VuKTtcblx0XHRcdFx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0dGhpcy5fc3RhdGUgPSBPdXRwdXRNb25pdG9yU3RhdGUuUG9sbGluZ0ZvcklkbGU7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgT3V0cHV0TW9uaXRvclN0YXRlLkNhbmNlbGxlZDpcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgT3V0cHV0TW9uaXRvclN0YXRlLklkbGU6IHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ091dHB1dE1vbml0b3I6IEVudGVyaW5nIElkbGUgaGFuZGxlcicpO1xuXHRcdFx0XHRcdFx0Y29uc3QgaWRsZVJlc3VsdCA9IGF3YWl0IHRoaXMuX2hhbmRsZUlkbGVTdGF0ZSh0b2tlbik7XG5cdFx0XHRcdFx0XHRpZiAoaWRsZVJlc3VsdC5zaG91bGRDb250aW51ZVBvbGxpbmcpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnT3V0cHV0TW9uaXRvcjogSWRsZSBoYW5kbGVyIC0+IGNvbnRpbnVlIHBvbGxpbmcnKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fc3RhdGUgPSBPdXRwdXRNb25pdG9yU3RhdGUuUG9sbGluZ0ZvcklkbGU7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLl9hc3luY01vZGUpIHtcblx0XHRcdFx0XHRcdFx0Ly8gSW4gYXN5bmMgbW9kZSwgd2FpdCBmb3IgbmV3IHRlcm1pbmFsIGRhdGEgYmVmb3JlIG1vbml0b3JpbmcgYWdhaW4uXG5cdFx0XHRcdFx0XHRcdC8vIFRoaXMgYXZvaWRzIGV4cGVuc2l2ZSBMTE0gY2FsbHMgd2hpbGUgdGhlIHRlcm1pbmFsIHNpdHMgaWRsZS5cblx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnT3V0cHV0TW9uaXRvcjogQXN5bmMgbW9kZSAtIHdhaXRpbmcgZm9yIG5ldyB0ZXJtaW5hbCBkYXRhIGJlZm9yZSBuZXh0IG1vbml0b3JpbmcgY3ljbGUnKTtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fd2FpdEZvck5ld0RhdGEodG9rZW4pO1xuXHRcdFx0XHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR0aGlzLl9zdGF0ZSA9IE91dHB1dE1vbml0b3JTdGF0ZS5Qb2xsaW5nRm9ySWRsZTtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBPdXRwdXRNb25pdG9yOiBJZGxlIGhhbmRsZXIgLT4gc3RvcCBwb2xsaW5nIChoYXNSZXNvdXJjZXM9JHshIWlkbGVSZXN1bHQucmVzb3VyY2VzfSwgb3V0cHV0TGVuPSR7aWRsZVJlc3VsdC5vdXRwdXQ/Lmxlbmd0aCA/PyAwfSlgKTtcblx0XHRcdFx0XHRcdFx0cmVzb3VyY2VzID0gaWRsZVJlc3VsdC5yZXNvdXJjZXM7XG5cdFx0XHRcdFx0XHRcdG91dHB1dCA9IGlkbGVSZXN1bHQub3V0cHV0O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gT3V0cHV0TW9uaXRvclN0YXRlLklkbGUgfHwgdGhpcy5fc3RhdGUgPT09IE91dHB1dE1vbml0b3JTdGF0ZS5DYW5jZWxsZWQgfHwgdGhpcy5fc3RhdGUgPT09IE91dHB1dE1vbml0b3JTdGF0ZS5UaW1lb3V0KSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXRlID0gT3V0cHV0TW9uaXRvclN0YXRlLkNhbmNlbGxlZDtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgT3V0cHV0TW9uaXRvcjogTW9uaXRvcmluZyBmaW5pc2hlZCAoc3RhdGU9JHtPdXRwdXRNb25pdG9yU3RhdGVbdGhpcy5fc3RhdGVdfSwgZHVyYXRpb249JHtEYXRlLm5vdygpIC0gcG9sbFN0YXJ0VGltZX1tcylgKTtcblx0XHRcdHRoaXMuX3BvbGxpbmdSZXN1bHQgPSB7XG5cdFx0XHRcdHN0YXRlOiB0aGlzLl9zdGF0ZSxcblx0XHRcdFx0b3V0cHV0OiBvdXRwdXQgPz8gdGhpcy5fZXhlY3V0aW9uLmdldE91dHB1dCgpLFxuXHRcdFx0XHRwb2xsRHVyYXRpb25NczogRGF0ZS5ub3coKSAtIHBvbGxTdGFydFRpbWUsXG5cdFx0XHRcdHJlc291cmNlc1xuXHRcdFx0fTtcblx0XHRcdC8vIENsZWFuIHVwIGlkbGUgaW5wdXQgbGlzdGVuZXIgaWYgc3RpbGwgYWN0aXZlXG5cdFx0XHR0aGlzLl91c2VySW5wdXRMaXN0ZW5lci5jbGVhcigpO1xuXHRcdFx0Ly8gRmlyZSBhdCBtb3N0IG9uY2UuIElmIGRpc3Bvc2UoKSBhbHJlYWR5IGZpcmVkIHRoZSBldmVudCBzeW5jaHJvbm91c2x5XG5cdFx0XHQvLyAoZS5nLiB0aGUgbW9uaXRvciB3YXMgdG9ybiBkb3duIGJlZm9yZSB0aGlzIGFzeW5jIGxvb3AgcmVhY2hlZCBpdHNcblx0XHRcdC8vIGZpbmFsbHkpLCBza2lwIGZpcmluZyBvbiBhIHBvdGVudGlhbGx5IGRpc3Bvc2VkIGVtaXR0ZXIuXG5cdFx0XHR0aGlzLl9maXJlRmluaXNoZWRPbmNlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENvbnRpbnVlcyBtb25pdG9yaW5nIGluIGJhY2tncm91bmQgbW9kZSB3aXRoIGEgbmV3IGNhbmNlbGxhdGlvbiB0b2tlbi5cblx0ICogSW4gYmFja2dyb3VuZCBtb2RlLCB0aGUgbW9uaXRvciByZS1wb2xscyBmb3IgaWRsZSBhbmQgaGFuZGxlcyBwcm9tcHRzXG5cdCAqIHdoZW5ldmVyIG5ldyB0ZXJtaW5hbCBkYXRhIGFycml2ZXMsIHJhdGhlciB0aGFuIHN0b3BwaW5nIGFmdGVyIHRoZSBmaXJzdFxuXHQgKiBpZGxlIGRldGVjdGlvbi4gUmVzb3VyY2UgY29zdCBpcyBib3VuZGVkIGJlY2F1c2UgdGhlIG1vbml0b3Igb25seSB3YWtlc1xuXHQgKiBvbiBuZXcgdGVybWluYWwgZGF0YSAodmlhIHtAbGluayBfd2FpdEZvck5ld0RhdGF9KSBhbmQgZWFjaCBpZGxlIGN5Y2xlXG5cdCAqIGlzIGNhcHBlZCBieSB0aGUgc3RhbmRhcmQgcG9sbGluZyB0aW1lb3V0cy5cblx0ICovXG5cdGNvbnRpbnVlTW9uaXRvcmluZ0FzeW5jKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IHZvaWQge1xuXHRcdHRoaXMuX2FzeW5jTW9kZSA9IHRydWU7XG5cdFx0Ly8gQ2FuY2VsIGFuZCBkaXNwb3NlIGFueSBpbi1wcm9ncmVzcyBtb25pdG9yaW5nIHJ1biB0byBhdm9pZCB0d28gY29uY3VycmVudCBsb29wcy5cblx0XHQvLyBDYW5jZWwgYmVmb3JlIGRpc3Bvc2Ugc28gdGhhdCBvbkNhbmNlbGxhdGlvblJlcXVlc3RlZCBoYW5kbGVycyBmaXJlIGFuZCBwZW5kaW5nXG5cdFx0Ly8gcHJvbWlzZXMgKGUuZy4gX3dhaXRGb3JOZXdEYXRhKSByZXNvbHZlIHByb3Blcmx5LlxuXHRcdGNvbnN0IGN1cnJlbnRNb25pdG9yaW5nQ3RzID0gdGhpcy5fY3VycmVudE1vbml0b3JpbmdDdHM7XG5cdFx0Y3VycmVudE1vbml0b3JpbmdDdHM/LmNhbmNlbCgpO1xuXHRcdGN1cnJlbnRNb25pdG9yaW5nQ3RzPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fY3VycmVudE1vbml0b3JpbmdDdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UodG9rZW4pO1xuXHRcdHRoaXMuX3N0YXRlID0gT3V0cHV0TW9uaXRvclN0YXRlLlBvbGxpbmdGb3JJZGxlO1xuXHRcdHRoaXMuX3N0YXJ0TW9uaXRvcmluZyh0aGlzLl9jb21tYW5kLCB0aGlzLl9pbnZvY2F0aW9uQ29udGV4dCwgdGhpcy5fY3VycmVudE1vbml0b3JpbmdDdHMudG9rZW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdhaXRzIGZvciBuZXcgdGVybWluYWwgZGF0YSBvciBjYW5jZWxsYXRpb24uIFVzZWQgaW4gYmFja2dyb3VuZCBtb2RlXG5cdCAqIHRvIGF2b2lkIHBvbGxpbmcgYW5kIExMTSBjYWxscyB3aGlsZSB0aGUgdGVybWluYWwgaXMgcXVpZXQuXG5cdCAqL1xuXHRwcml2YXRlIF93YWl0Rm9yTmV3RGF0YSh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjbGVhbnVwID0gKCkgPT4ge1xuXHRcdFx0XHRkYXRhTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHR0b2tlbkxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0ZGlzcG9zZWRMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgZGF0YUxpc3RlbmVyID0gdGhpcy5fZXhlY3V0aW9uLmluc3RhbmNlLm9uRGF0YSgoKSA9PiB7XG5cdFx0XHRcdGNsZWFudXAoKTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB0b2tlbkxpc3RlbmVyID0gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRjbGVhbnVwKCk7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH0pO1xuXHRcdFx0Ly8gUmVzb2x2ZSB3aGVuIHRoZSB0ZXJtaW5hbCBpbnN0YW5jZSBpcyBkaXNwb3NlZCB0byBhdm9pZCB3YWl0aW5nIGZvcmV2ZXJcblx0XHRcdGNvbnN0IGRpc3Bvc2VkTGlzdGVuZXIgPSB0aGlzLl9leGVjdXRpb24uaW5zdGFuY2Uub25EaXNwb3NlZCgoKSA9PiB7XG5cdFx0XHRcdGNsZWFudXAoKTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZUlkbGVTdGF0ZSh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHsgcmVzb3VyY2VzPzogSUxpbmtMb2NhdGlvbltdOyBzaG91bGRDb250aW51ZVBvbGxpbmc6IGJvb2xlYW47IG91dHB1dD86IHN0cmluZyB9PiB7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gdGhpcy5fZXhlY3V0aW9uLmdldE91dHB1dCgpO1xuXG5cdFx0Ly8gVXNlIG9ubHkgdGhlIHRhaWwgb2YgdGhlIG91dHB1dCBmb3IgbG9nZ2luZyBhbmQgdGFzay1maW5pc2ggZGV0ZWN0aW9uLFxuXHRcdC8vIGJ1dCBrZWVwIGxpbmUtb3JpZW50ZWQgcHJvbXB0IGRldGVjdG9ycyBzY29wZWQgdG8gdGhlIGxhc3QgbGluZS5cblx0XHRjb25zdCBvdXRwdXRUYWlsID0gb3V0cHV0LnNsaWNlKC0xMDAwKTtcblx0XHRjb25zdCBvdXRwdXRMYXN0TGluZSA9IGdldExhc3RMaW5lKG91dHB1dFRhaWwpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYE91dHB1dE1vbml0b3I6IElkbGUgb3V0cHV0IHN1bW1hcnk6IGxlbj0ke291dHB1dC5sZW5ndGh9LCBsYXN0TGluZT0ke3RoaXMuX2Zvcm1hdExhc3RMaW5lRm9yTG9nKG91dHB1dFRhaWwpfWApO1xuXG5cdFx0aWYgKGRldGVjdHNOb25JbnRlcmFjdGl2ZUhlbHBQYXR0ZXJuKG91dHB1dExhc3RMaW5lKSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnT3V0cHV0TW9uaXRvcjogSWRsZSAtPiBub24taW50ZXJhY3RpdmUgaGVscCBwYXR0ZXJuIGRldGVjdGVkLCBzdG9wcGluZycpO1xuXHRcdFx0cmV0dXJuIHsgc2hvdWxkQ29udGludWVQb2xsaW5nOiBmYWxzZSwgb3V0cHV0IH07XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgZm9yIFZTIENvZGUncyB0YXNrIGZpbmlzaCBtZXNzYWdlcyAobGlrZSBcInByZXNzIGFueSBrZXkgdG8gY2xvc2UgdGhlIHRlcm1pbmFsXCIpLlxuXHRcdC8vIElmIHRoZSBleGVjdXRpb24gaXMgYSB0YXNrIGFuZCB0aGUgb3V0cHV0IGNvbnRhaW5zIGEgVlMgQ29kZSB0YXNrIGZpbmlzaCBtZXNzYWdlLFxuXHRcdC8vIGFsd2F5cyB0cmVhdCBpdCBhcyBhIHN0b3Agc2lnbmFsIHJlZ2FyZGxlc3Mgb2YgdGFzayBhY3RpdmUgc3RhdGUgKHdoaWNoIGNhbiBiZSBzdGFsZSkuXG5cdFx0Y29uc3QgaXNUYXNrID0gdGhpcy5fZXhlY3V0aW9uLnRhc2sgIT09IHVuZGVmaW5lZDtcblx0XHRpZiAoaXNUYXNrICYmIGRldGVjdHNWU0NvZGVUYXNrRmluaXNoTWVzc2FnZShvdXRwdXRUYWlsKSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnT3V0cHV0TW9uaXRvcjogSWRsZSAtPiBWUyBDb2RlIHRhc2sgZmluaXNoIG1lc3NhZ2UgZGV0ZWN0ZWQsIHN0b3BwaW5nJyk7XG5cdFx0XHQvLyBUYXNrIGlzIGZpbmlzaGVkLCBpZ25vcmUgdGhlIFwicHJlc3MgYW55IGtleSB0byBjbG9zZVwiIG1lc3NhZ2Vcblx0XHRcdHJldHVybiB7IHNob3VsZENvbnRpbnVlUG9sbGluZzogZmFsc2UsIG91dHB1dCB9O1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBnZW5lcmljIFwicHJlc3MgYW55IGtleVwiIHByb21wdHMgZnJvbSBzY3JpcHRzLlxuXHRcdC8vIE9ubHkgc2hvd24gZm9yIG5vbi10YXNrIGV4ZWN1dGlvbnMgc2luY2UgdGFzayBmaW5pc2ggbWVzc2FnZXMgYXJlIGhhbmRsZWQgYWJvdmUuXG5cdFx0aWYgKCFpc1Rhc2sgJiYgZGV0ZWN0c0dlbmVyaWNQcmVzc0FueUtleVBhdHRlcm4ob3V0cHV0VGFpbCkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ091dHB1dE1vbml0b3I6IElkbGUgLT4gZ2VuZXJpYyBcInByZXNzIGFueSBrZXlcIiBkZXRlY3RlZCwgc2lnbmFsaW5nIGFnZW50Jyk7XG5cdFx0XHR0aGlzLl9vbkRpZERldGVjdElucHV0TmVlZGVkLmZpcmUoKTtcblx0XHRcdHRoaXMuX2NsZWFudXBJZGxlSW5wdXRMaXN0ZW5lcigpO1xuXHRcdFx0cmV0dXJuIHsgc2hvdWxkQ29udGludWVQb2xsaW5nOiBmYWxzZSwgb3V0cHV0IH07XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgdXNlciBhbHJlYWR5IGlucHV0dGVkIHNpbmNlIGlkbGUgd2FzIGRldGVjdGVkIChiZWZvcmUgd2UgZXZlbiBnb3QgaGVyZSlcblx0XHRpZiAodGhpcy5fdXNlcklucHV0dGVkU2luY2VJZGxlRGV0ZWN0ZWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ091dHB1dE1vbml0b3I6IFVzZXIgaW5wdXQgZGV0ZWN0ZWQgc2luY2UgaWRsZTsgc2tpcHBpbmcgcHJvbXB0IGFuZCBjb250aW51aW5nIHBvbGxpbmcnKTtcblx0XHRcdHRoaXMuX2NsZWFudXBJZGxlSW5wdXRMaXN0ZW5lcigpO1xuXHRcdFx0cmV0dXJuIHsgc2hvdWxkQ29udGludWVQb2xsaW5nOiB0cnVlIH07XG5cdFx0fVxuXG5cdFx0Ly8gRGVjaWRlIHdoZXRoZXIgdGhlIGN1cnJlbnQgbGFzdCBsaW5lIHNob3VsZCBmaXJlIGFuIGlucHV0LW5lZWRlZCBzaWduYWwuXG5cdFx0Ly8gVHdvIGFjY2VwdGFibGUgY29uZGl0aW9uczpcblx0XHQvLyAgIDEuIFN0cmljdCBoaWdoLWNvbmZpZGVuY2UgcHJvbXB0ICh5L24sIHBhc3N3b3JkLCBcIihFTkQpXCIsIGV0Yy4pIFx1MjAxNCBzYWZlIHJlZ2FyZGxlc3Ncblx0XHQvLyAgICAgIG9mIGV4ZWN1dGlvbi1hY3RpdmUgc3RhdGUuXG5cdFx0Ly8gICAyLiBCcm9hZCBmYWxsYmFjayBwYXR0ZXJuIChiYXJlIFwiOlwiIC8gXCI/XCIgdHJhaWxlcnMpIFx1MjAxNCBvbmx5IHNhZmUgd2hlblxuXHRcdC8vICAgICAgYGV4ZWN1dGlvbi5pc0FjdGl2ZSgpID09PSB0cnVlYCwgd2hpY2ggcHJvdmlkZXMgaW5kZXBlbmRlbnQgZXZpZGVuY2UgdGhlXG5cdFx0Ly8gICAgICBjb21tYW5kIGlzIHN0aWxsIGNvbnN1bWluZyBzdGRpbi4gV2l0aG91dCB0aGF0IGd1YXJkIHRoZSBicm9hZCBwYXR0ZXJuXG5cdFx0Ly8gICAgICBwcm9kdWNlcyBmYWxzZSBwb3NpdGl2ZXMgb24gZmluaXNoZWQgY29tbWFuZHMgKGlzc3VlICMzMTU0NzYpLiBUaGUgc2FtZVxuXHRcdC8vICAgICAgYGlzQWN0aXZlID09PSB0cnVlYCBndWFyZCBpcyBlbmZvcmNlZCBpbiBgX3dhaXRGb3JJZGxlYCwgYnV0IHdlIHJlLWNoZWNrXG5cdFx0Ly8gICAgICBoZXJlIGJlY2F1c2UgKGEpIGFjdGl2aXR5IGNhbiBmbGlwIGJldHdlZW4gYF93YWl0Rm9ySWRsZWAgcmV0dXJuaW5nIGFuZFxuXHRcdC8vICAgICAgYF9oYW5kbGVJZGxlU3RhdGVgIHJ1bm5pbmcgYW5kIChiKSBgX2hhbmRsZUlkbGVTdGF0ZWAgaXMgcmVhY2hhYmxlIHZpYVxuXHRcdC8vICAgICAgcGF0aHMgdGhhdCBkaWQgbm90IGVudGVyIHRocm91Z2ggdGhlIGJyb2FkIGJyYW5jaC5cblx0XHRsZXQgc2hvdWxkRmlyZUlucHV0TmVlZGVkID0gZGV0ZWN0c0lucHV0UmVxdWlyZWRQYXR0ZXJuKG91dHB1dExhc3RMaW5lKTtcblx0XHRpZiAoIXNob3VsZEZpcmVJbnB1dE5lZWRlZCAmJiBkZXRlY3RzTGlrZWx5SW5wdXRSZXF1aXJlZFBhdHRlcm4ob3V0cHV0TGFzdExpbmUpKSB7XG5cdFx0XHRjb25zdCBpc0FjdGl2ZSA9IHRoaXMuX2V4ZWN1dGlvbi5pc0FjdGl2ZSA/IGF3YWl0IHRoaXMuX2V4ZWN1dGlvbi5pc0FjdGl2ZSgpIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGlzQWN0aXZlID09PSB0cnVlKSB7XG5cdFx0XHRcdHNob3VsZEZpcmVJbnB1dE5lZWRlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmUtY2hlY2sgdGhlIHVzZXItaW5wdXQgZ3VhcmQgYWZ0ZXIgYW55IGF3YWl0cyBhYm92ZS4gVGhlIGVhcmxpZXIgY2hlY2sgYXRcblx0XHQvLyB0aGUgdG9wIG9mIHRoaXMgbWV0aG9kIHJ1bnMgYmVmb3JlIGBhd2FpdCB0aGlzLl9leGVjdXRpb24uaXNBY3RpdmUoKWA7IGlmXG5cdFx0Ly8gdGhlIHVzZXIgdHlwZXMgZHVyaW5nIHRoYXQgYXdhaXQgdGhlIGZsYWcgZmxpcHMgdG8gdHJ1ZSBidXQgd2Ugd291bGQgc3RpbGxcblx0XHQvLyBmYWxsIHRocm91Z2ggYW5kIGZpcmUgYG9uRGlkRGV0ZWN0SW5wdXROZWVkZWRgLCB1bmRlcm1pbmluZyB0aGUgZ3VhcmQgYW5kXG5cdFx0Ly8gcG90ZW50aWFsbHkgcmUtcGF1c2luZyB0aGUgYWdlbnQgbG9vcCBhZnRlciBpbnB1dCB3YXMgYWxyZWFkeSBwcm92aWRlZC5cblx0XHRpZiAoc2hvdWxkRmlyZUlucHV0TmVlZGVkICYmIHRoaXMuX3VzZXJJbnB1dHRlZFNpbmNlSWRsZURldGVjdGVkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdPdXRwdXRNb25pdG9yOiBVc2VyIGlucHV0IGRldGVjdGVkIGR1cmluZyBpc0FjdGl2ZSBhd2FpdDsgc2tpcHBpbmcgcHJvbXB0IGFuZCBjb250aW51aW5nIHBvbGxpbmcnKTtcblx0XHRcdHRoaXMuX2NsZWFudXBJZGxlSW5wdXRMaXN0ZW5lcigpO1xuXHRcdFx0cmV0dXJuIHsgc2hvdWxkQ29udGludWVQb2xsaW5nOiB0cnVlIH07XG5cdFx0fVxuXG5cdFx0Ly8gSW4gYXN5bmMgbW9kZSwgc2lnbmFsIHRoZSBhZ2VudCBzbyBpdCBjYW4gZHJpdmUgc2VuZF90b190ZXJtaW5hbC5cblx0XHRpZiAodGhpcy5fYXN5bmNNb2RlKSB7XG5cdFx0XHRpZiAoc2hvdWxkRmlyZUlucHV0TmVlZGVkKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9pc1NlbnNpdGl2ZVByb21wdChvdXRwdXRMYXN0TGluZSkpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdPdXRwdXRNb25pdG9yOiBBc3luYyBtb2RlIC0gc2Vuc2l0aXZlIGlucHV0IHByb21wdCBkZXRlY3RlZCwgc2lnbmFsaW5nIHNlbnNpdGl2ZSBVSScpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkRGV0ZWN0U2Vuc2l0aXZlSW5wdXROZWVkZWQuZmlyZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ091dHB1dE1vbml0b3I6IEFzeW5jIG1vZGUgLSBpbnB1dC1yZXF1aXJlZCBwYXR0ZXJuIGRldGVjdGVkLCBzaWduYWxpbmcgYWdlbnQnKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZERldGVjdElucHV0TmVlZGVkLmZpcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY2xlYW51cElkbGVJbnB1dExpc3RlbmVyKCk7XG5cdFx0XHRyZXR1cm4geyBzaG91bGRDb250aW51ZVBvbGxpbmc6IGZhbHNlLCBvdXRwdXQgfTtcblx0XHR9XG5cblx0XHQvLyBJbiBmb3JlZ3JvdW5kIG1vZGUsIGZpcmUgdGhlIGV2ZW50IHNvIHRoZSByYWNlIGluIHJ1bkluVGVybWluYWxUb29sIGNhbiBwaWNrIGl0XG5cdFx0Ly8gdXAgYW5kIHJldHVybiBjb250cm9sIHRvIHRoZSBhZ2VudCAod2hpY2ggdXNlcyBzZW5kX3RvX3Rlcm1pbmFsIHRvIHByb3ZpZGUgaW5wdXQpLlxuXHRcdC8vIEZvciBzZW5zaXRpdmUgcHJvbXB0cyAocGFzc3dvcmRzLCBzZWNyZXRzLCBPVFBzLCBcdTIwMjYpIHdlIGluc3RlYWQgZmlyZSBhIHNlcGFyYXRlXG5cdFx0Ly8gZXZlbnQgc28gdGhlIHRvb2wgY2FuIHNob3cgYSBjb25maXJtYXRpb24gZGlhbG9nIHRoYXQgZm9jdXNlcyB0aGUgdGVybWluYWwgXHUyMDE0XG5cdFx0Ly8gdGhlIHNlY3JldCBtdXN0IG5ldmVyIGJlIHJvdXRlZCB0aHJvdWdoIHRoZSBtb2RlbC5cblx0XHRpZiAoc2hvdWxkRmlyZUlucHV0TmVlZGVkKSB7XG5cdFx0XHRpZiAodGhpcy5faXNTZW5zaXRpdmVQcm9tcHQob3V0cHV0TGFzdExpbmUpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ091dHB1dE1vbml0b3I6IFNlbnNpdGl2ZSBpbnB1dCBwcm9tcHQgZGV0ZWN0ZWQsIHNpZ25hbGluZyBzZW5zaXRpdmUgVUknKTtcblx0XHRcdFx0dGhpcy5fb25EaWREZXRlY3RTZW5zaXRpdmVJbnB1dE5lZWRlZC5maXJlKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdPdXRwdXRNb25pdG9yOiBJbnB1dC1yZXF1aXJlZCBwYXR0ZXJuIGRldGVjdGVkLCBzaWduYWxpbmcgYWdlbnQnKTtcblx0XHRcdFx0dGhpcy5fb25EaWREZXRlY3RJbnB1dE5lZWRlZC5maXJlKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jbGVhbnVwSWRsZUlucHV0TGlzdGVuZXIoKTtcblx0XHRcdHJldHVybiB7IHNob3VsZENvbnRpbnVlUG9sbGluZzogZmFsc2UsIG91dHB1dCB9O1xuXHRcdH1cblxuXHRcdC8vIENsZWFuIHVwIGlucHV0IGxpc3RlbmVyIGJlZm9yZSBjdXN0b20gcG9sbFxuXHRcdHRoaXMuX2NsZWFudXBJZGxlSW5wdXRMaXN0ZW5lcigpO1xuXG5cdFx0Ly8gTGV0IGN1c3RvbSBwb2xsZXIgb3ZlcnJpZGUgaWYgcHJvdmlkZWRcblx0XHRjb25zdCBjdXN0b20gPSBhd2FpdCB0aGlzLl9wb2xsRm4/Lih0aGlzLl9leGVjdXRpb24sIHRva2VuLCB0aGlzLl90YXNrU2VydmljZSk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgT3V0cHV0TW9uaXRvcjogQ3VzdG9tIHBvbGxlciByZXN1bHQ6ICR7Y3VzdG9tID8gJ3Byb3ZpZGVkJyA6ICdub25lJ31gKTtcblx0XHRjb25zdCByZXNvdXJjZXMgPSBjdXN0b20/LnJlc291cmNlcztcblx0XHRyZXR1cm4geyByZXNvdXJjZXMsIHNob3VsZENvbnRpbnVlUG9sbGluZzogZmFsc2UsIG91dHB1dDogY3VzdG9tPy5vdXRwdXQgPz8gb3V0cHV0IH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVUaW1lb3V0U3RhdGUoX2NvbW1hbmQ6IHN0cmluZywgX2ludm9jYXRpb25Db250ZXh0OiBJVG9vbEludm9jYXRpb25Db250ZXh0IHwgdW5kZWZpbmVkLCBfZXh0ZW5kZWQ6IGJvb2xlYW4sIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoX2V4dGVuZGVkKSB7XG5cdFx0XHQvLyBFeHRlbmRlZCBwb2xsaW5nICgyIG1pbnV0ZXMpIGV4cGlyZWQgd2hpbGUgdGhlIHByb2Nlc3Mgd2FzIHN0aWxsXG5cdFx0XHQvLyBydW5uaW5nLiBSYXRoZXIgdGhhbiBzaWxlbnRseSBjYW5jZWxsaW5nLCBzaWduYWwgdGhhdCBpbnB1dCBtYXkgYmVcblx0XHRcdC8vIG5lZWRlZCBzbyB0aGUgYWdlbnQgc2VlcyB0aGUgY3VycmVudCBvdXRwdXQgYW5kIGNhbiBkZWNpZGUgaG93IHRvXG5cdFx0XHQvLyBwcm9jZWVkIChlLmcuIGFuc3dlciBhbiB1bnJlY29nbmlzZWQgaW50ZXJhY3RpdmUgcHJvbXB0KS5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbygnT3V0cHV0TW9uaXRvcjogRXh0ZW5kZWQgcG9sbGluZyB0aW1lb3V0IHJlYWNoZWQgYWZ0ZXIgMiBtaW51dGVzLCBzaWduYWxpbmcgcG90ZW50aWFsIGlucHV0IG5lZWRlZCcpO1xuXHRcdFx0dGhpcy5fb25EaWREZXRlY3RJbnB1dE5lZWRlZC5maXJlKCk7XG5cdFx0XHR0aGlzLl9zdGF0ZSA9IE91dHB1dE1vbml0b3JTdGF0ZS5DYW5jZWxsZWQ7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdC8vIENvbnRpbnVlIHBvbGxpbmcgd2l0aCBleHBvbmVudGlhbCBiYWNrb2ZmXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogU2luZ2xlIGJvdW5kZWQgcG9sbGluZyBwYXNzIHRoYXQgcmV0dXJucyB3aGVuOlxuXHQgKiAgLSB0ZXJtaW5hbCBiZWNvbWVzIGluYWN0aXZlL2lkbGUsIG9yXG5cdCAqICAtIHRpbWVvdXQgd2luZG93IGVsYXBzZXMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF93YWl0Rm9ySWRsZShcblx0XHRleGVjdXRpb246IElFeGVjdXRpb24sXG5cdFx0ZXh0ZW5kZWRQb2xsaW5nOiBib29sZWFuLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0KTogUHJvbWlzZTxPdXRwdXRNb25pdG9yU3RhdGU+IHtcblxuXHRcdGNvbnN0IG1heFdhaXRNcyA9IGV4dGVuZGVkUG9sbGluZyA/IFBvbGxpbmdDb25zdHMuRXh0ZW5kZWRQb2xsaW5nTWF4RHVyYXRpb24gOiBQb2xsaW5nQ29uc3RzLkZpcnN0UG9sbGluZ01heER1cmF0aW9uO1xuXHRcdGNvbnN0IG1heEludGVydmFsID0gUG9sbGluZ0NvbnN0cy5NYXhQb2xsaW5nSW50ZXJ2YWxEdXJhdGlvbjtcblx0XHRsZXQgY3VycmVudEludGVydmFsID0gUG9sbGluZ0NvbnN0cy5NaW5Qb2xsaW5nRHVyYXRpb247XG5cdFx0bGV0IHdhaXRlZCA9IDA7XG5cdFx0bGV0IGNvbnNlY3V0aXZlSWRsZUV2ZW50cyA9IDA7XG5cdFx0bGV0IGhhc1JlY2VpdmVkRGF0YSA9IGZhbHNlO1xuXHRcdGNvbnN0IG9uRGF0YURpc3Bvc2FibGUgPSBleGVjdXRpb24uaW5zdGFuY2Uub25EYXRhKChfZGF0YSkgPT4ge1xuXHRcdFx0aGFzUmVjZWl2ZWREYXRhID0gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHR3aGlsZSAoIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkICYmIHdhaXRlZCA8IG1heFdhaXRNcykge1xuXHRcdFx0XHRjb25zdCB3YWl0VGltZSA9IE1hdGgubWluKGN1cnJlbnRJbnRlcnZhbCwgbWF4V2FpdE1zIC0gd2FpdGVkKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KHdhaXRUaW1lLCB0b2tlbik7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIE91dHB1dE1vbml0b3JTdGF0ZS5DYW5jZWxsZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRocm93IGVycjtcblx0XHRcdFx0fVxuXHRcdFx0XHR3YWl0ZWQgKz0gd2FpdFRpbWU7XG5cdFx0XHRcdGN1cnJlbnRJbnRlcnZhbCA9IE1hdGgubWluKGN1cnJlbnRJbnRlcnZhbCAqIDIsIG1heEludGVydmFsKTtcblx0XHRcdFx0Y29uc3QgY3VycmVudE91dHB1dCA9IGV4ZWN1dGlvbi5nZXRPdXRwdXQoKTtcblx0XHRcdFx0Y29uc3QgY3VycmVudFRhaWwgPSBjdXJyZW50T3V0cHV0LnNsaWNlKC0xMDAwKTtcblx0XHRcdFx0Y29uc3QgY3VycmVudExhc3RMaW5lID0gZ2V0TGFzdExpbmUoY3VycmVudFRhaWwpO1xuXG5cdFx0XHRcdGlmIChkZXRlY3RzTm9uSW50ZXJhY3RpdmVIZWxwUGF0dGVybihjdXJyZW50TGFzdExpbmUpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgT3V0cHV0TW9uaXRvcjogd2FpdEZvcklkbGUgLT4gbm9uLWludGVyYWN0aXZlIGhlbHAgZGV0ZWN0ZWQgKHdhaXRlZD0ke3dhaXRlZH1tcylgKTtcblx0XHRcdFx0XHR0aGlzLl9zdGF0ZSA9IE91dHB1dE1vbml0b3JTdGF0ZS5JZGxlO1xuXHRcdFx0XHRcdHRoaXMuX3NldHVwSWRsZUlucHV0TGlzdGVuZXIoKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fc3RhdGU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBPbmx5IGZhc3QtcGF0aCBvbiBoaWdoLWNvbmZpZGVuY2UgcGF0dGVybnMgKHkvbiwgcGFzc3dvcmQsIChFTkQpLCBldGMuKS5cblx0XHRcdFx0Ly8gQnJvYWQgcGF0dGVybnMgbGlrZSBiYXJlIFwiOlwiIG9yIFwiP1wiIGFyZSBjaGVja2VkIGxhdGVyIGluIF9oYW5kbGVJZGxlU3RhdGVcblx0XHRcdFx0Ly8gYWZ0ZXIgdGhlIHRlcm1pbmFsIGhhcyBuYXR1cmFsbHkgZ29uZSBpZGxlLCBhdm9pZGluZyBmYWxzZSBwb3NpdGl2ZXMgb25cblx0XHRcdFx0Ly8gbm9ybWFsIGNvbW1hbmQgb3V0cHV0IHRoYXQgaGFwcGVucyB0byBlbmQgd2l0aCB0aG9zZSBjaGFyYWN0ZXJzLlxuXHRcdFx0XHRjb25zdCBwcm9tcHRSZXN1bHQgPSBkZXRlY3RzSGlnaENvbmZpZGVuY2VJbnB1dFBhdHRlcm4oY3VycmVudExhc3RMaW5lKTtcblx0XHRcdFx0aWYgKHByb21wdFJlc3VsdCkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYE91dHB1dE1vbml0b3I6IHdhaXRGb3JJZGxlIC0+IGhpZ2gtY29uZmlkZW5jZSBpbnB1dCBwYXR0ZXJuIGRldGVjdGVkICh3YWl0ZWQ9JHt3YWl0ZWR9bXMsIGxhc3RMaW5lPSR7dGhpcy5fZm9ybWF0TGFzdExpbmVGb3JMb2coY3VycmVudFRhaWwpfSlgKTtcblx0XHRcdFx0XHR0aGlzLl9zdGF0ZSA9IE91dHB1dE1vbml0b3JTdGF0ZS5JZGxlO1xuXHRcdFx0XHRcdHRoaXMuX3NldHVwSWRsZUlucHV0TGlzdGVuZXIoKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fc3RhdGU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaGFzUmVjZWl2ZWREYXRhKSB7XG5cdFx0XHRcdFx0Y29uc2VjdXRpdmVJZGxlRXZlbnRzID0gMDtcblx0XHRcdFx0XHRoYXNSZWNlaXZlZERhdGEgPSBmYWxzZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zZWN1dGl2ZUlkbGVFdmVudHMrKztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJlY2VudGx5SWRsZSA9IGNvbnNlY3V0aXZlSWRsZUV2ZW50cyA+PSBQb2xsaW5nQ29uc3RzLk1pbklkbGVFdmVudHM7XG5cdFx0XHRcdGNvbnN0IGlzQWN0aXZlID0gZXhlY3V0aW9uLmlzQWN0aXZlID8gYXdhaXQgZXhlY3V0aW9uLmlzQWN0aXZlKCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYE91dHB1dE1vbml0b3I6IHdhaXRGb3JJZGxlIGNoZWNrOiB3YWl0ZWQ9JHt3YWl0ZWR9bXMsIHJlY2VudGx5SWRsZT0ke3JlY2VudGx5SWRsZX0sIGlzQWN0aXZlPSR7aXNBY3RpdmV9YCk7XG5cdFx0XHRcdGlmIChyZWNlbnRseUlkbGUgJiYgaXNBY3RpdmUgIT09IHRydWUpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBPdXRwdXRNb25pdG9yOiB3YWl0Rm9ySWRsZSAtPiByZWNlbnRseUlkbGUgJiYgIWFjdGl2ZSAod2FpdGVkPSR7d2FpdGVkfW1zLCBsYXN0TGluZT0ke3RoaXMuX2Zvcm1hdExhc3RMaW5lRm9yTG9nKGN1cnJlbnRUYWlsKX0pYCk7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdGUgPSBPdXRwdXRNb25pdG9yU3RhdGUuSWRsZTtcblx0XHRcdFx0XHR0aGlzLl9zZXR1cElkbGVJbnB1dExpc3RlbmVyKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3N0YXRlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gV2hlbiB0aGUgdGVybWluYWwgaGFzIGJlZW4gaWRsZSAobm8gbmV3IGRhdGEpIGJ1dCB0aGUgZXhlY3V0aW9uIGlzXG5cdFx0XHRcdC8vIHN0aWxsIHJlcG9ydGVkIGFzIGFjdGl2ZSAoZS5nLiB0YXNrLWJhY2tlZCBleGVjdXRpb25zKSwgY2hlY2sgdGhlXG5cdFx0XHRcdC8vIGJyb2FkZXIgaW5wdXQtcmVxdWlyZWQgaGV1cmlzdGljcy4gVGhlIGBpc0FjdGl2ZSA9PT0gdHJ1ZWAgZ3VhcmQgaXNcblx0XHRcdFx0Ly8gbG9hZC1iZWFyaW5nOiBpdCBwcm92aWRlcyBpbmRlcGVuZGVudCBldmlkZW5jZSB0aGUgY29tbWFuZCBpcyBzdGlsbFxuXHRcdFx0XHQvLyBjb25zdW1pbmcgc3RkaW4sIHdoaWNoIGlzIHRoZSBvbmx5IHNpZ25hbCB0aGF0IGRpc2FtYmlndWF0ZXMgYSByZWFsXG5cdFx0XHRcdC8vIHByb21wdCBsaWtlIGBFbnRlciB5b3VyIG5hbWU6IGAgZnJvbSBsb2cgb3V0cHV0IGxpa2UgYExhc3QgQ29tbWFuZDogYFxuXHRcdFx0XHQvLyBvbiBhIHNpbmdsZSBjdXJzb3IgbGluZS4gV2l0aG91dCB0aGF0IGd1YXJkIHRoZSBicm9hZCBwYXR0ZXJuc1xuXHRcdFx0XHQvLyBwcm9kdWNlIGZhbHNlIHBvc2l0aXZlcyBvbiBmaW5pc2hlZCBjb21tYW5kcyAoaXNzdWUgIzMxNTQ3NikuXG5cdFx0XHRcdGlmIChyZWNlbnRseUlkbGUgJiYgaXNBY3RpdmUgPT09IHRydWUgJiYgZGV0ZWN0c0xpa2VseUlucHV0UmVxdWlyZWRQYXR0ZXJuKGN1cnJlbnRMYXN0TGluZSkpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBPdXRwdXRNb25pdG9yOiB3YWl0Rm9ySWRsZSAtPiBicm9hZCBpbnB1dCBwYXR0ZXJuIGRldGVjdGVkIHdoaWxlIGFjdGl2ZStpZGxlICh3YWl0ZWQ9JHt3YWl0ZWR9bXMsIGxhc3RMaW5lPSR7dGhpcy5fZm9ybWF0TGFzdExpbmVGb3JMb2coY3VycmVudFRhaWwpfSlgKTtcblx0XHRcdFx0XHR0aGlzLl9zdGF0ZSA9IE91dHB1dE1vbml0b3JTdGF0ZS5JZGxlO1xuXHRcdFx0XHRcdHRoaXMuX3NldHVwSWRsZUlucHV0TGlzdGVuZXIoKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fc3RhdGU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0b25EYXRhRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gT3V0cHV0TW9uaXRvclN0YXRlLkNhbmNlbGxlZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gT3V0cHV0TW9uaXRvclN0YXRlLlRpbWVvdXQ7XG5cdH1cblxuXHQvKipcblx0ICogU2V0cyB1cCBhIGxpc3RlbmVyIGZvciB1c2VyIGlucHV0IHRoYXQgdHJpZ2dlcnMgaW1tZWRpYXRlbHkgd2hlbiBpZGxlIGlzIGRldGVjdGVkLlxuXHQgKiBUaGlzIGVuc3VyZXMgd2UgY2F0Y2ggYW55IGlucHV0IHRoYXQgaGFwcGVucyBiZXR3ZWVuIGlkbGUgZGV0ZWN0aW9uIGFuZCBwcm9tcHQgY3JlYXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9zZXR1cElkbGVJbnB1dExpc3RlbmVyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3VzZXJJbnB1dHRlZFNpbmNlSWRsZURldGVjdGVkID0gZmFsc2U7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnT3V0cHV0TW9uaXRvcjogU2V0dGluZyB1cCBpZGxlIGlucHV0IGxpc3RlbmVyJyk7XG5cblx0XHQvLyBTZXQgdXAgbmV3IGxpc3RlbmVyIChNdXRhYmxlRGlzcG9zYWJsZSBhdXRvLWRpc3Bvc2VzIHByZXZpb3VzKVxuXHRcdHRoaXMuX3VzZXJJbnB1dExpc3RlbmVyLnZhbHVlID0gdGhpcy5fZXhlY3V0aW9uLmluc3RhbmNlLm9uRGlkSW5wdXREYXRhKCgpID0+IHtcblx0XHRcdHRoaXMuX3VzZXJJbnB1dHRlZFNpbmNlSWRsZURldGVjdGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ091dHB1dE1vbml0b3I6IERldGVjdGVkIHVzZXIgdGVybWluYWwgaW5wdXQgd2hpbGUgaWRsZScpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIENsZWFucyB1cCB0aGUgaWRsZSBpbnB1dCBsaXN0ZW5lciBhbmQgcmVzZXRzIHRoZSBmbGFnLlxuXHQgKi9cblx0cHJpdmF0ZSBfY2xlYW51cElkbGVJbnB1dExpc3RlbmVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX3VzZXJJbnB1dHRlZFNpbmNlSWRsZURldGVjdGVkID0gZmFsc2U7XG5cdFx0dGhpcy5fdXNlcklucHV0TGlzdGVuZXIuY2xlYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzU2Vuc2l0aXZlUHJvbXB0KHByb21wdDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKGlzQ2Fub25pY2FsU3Vkb1NQcm9tcHQodGhpcy5fY29tbWFuZCwgcHJvbXB0KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiBkZXRlY3RzU2Vuc2l0aXZlSW5wdXRQcm9tcHQocHJvbXB0KTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc0Nhbm9uaWNhbFN1ZG9TUHJvbXB0KGNvbW1hbmQ6IHN0cmluZywgcHJvbXB0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIC8oPzpefFxccylzdWRvXFxzKy1TKD86XFxzfCQpLy50ZXN0KGNvbW1hbmQpICYmIC9eXFxbc3Vkb1xcXVxccytwYXNzd29yZCBmb3IgLis6XFxzKiQvaS50ZXN0KHByb21wdCk7XG59XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIHdoZW4gdGhlIHRlcm1pbmFsJ3MgbGFzdCB2aXNpYmxlIGxpbmUgbG9va3MgbGlrZSBhIHByb21wdCBmb3JcbiAqIGEgc2Vuc2l0aXZlIHNlY3JldCAocGFzc3dvcmQsIHBhc3NwaHJhc2UsIHRva2VuLCBBUEkga2V5LCBPVFAsIGV0Yy4pLiBVc2VkXG4gKiB0byBzaG9ydC1jaXJjdWl0IHRoZSBub3JtYWwgXCJpbnB1dCBuZWVkZWQgXHUyMTkyIHJldHVybiB0byBhZ2VudFwiIGZsb3cgc28gdGhhdFxuICogdGhlIHNlY3JldCBpcyBuZXZlciByb3V0ZWQgdGhyb3VnaCB0aGUgbW9kZWwgXHUyMDE0IGluc3RlYWQgdGhlIHVzZXIgaXMgYXNrZWRcbiAqIHZpYSBVSSB0byBmb2N1cyB0aGUgdGVybWluYWwgYW5kIHR5cGUgdGhlIHNlY3JldCBkaXJlY3RseS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRldGVjdHNTZW5zaXRpdmVJbnB1dFByb21wdChjdXJzb3JMaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIC8ocGFzc3dvcmR8cGFzc3BocmFzZXx0b2tlbnxhcGlcXHMqa2V5fHNlY3JldHx2ZXJpZmljYXRpb24gY29kZXxvdHBcXGJ8b25lW1xccy1dP3RpbWUgKD86Y29kZXxwYXNzd29yZCl8MmZhfG1mYXxwaW5cXHMqKD86Y29kZXxudW1iZXIpP1s6IF0/XFxzKiR8YXV0aGVudGljYXRpb24gY29kZSkvaS50ZXN0KGN1cnNvckxpbmUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWF0Y2hUZXJtaW5hbFByb21wdE9wdGlvbihvcHRpb25zOiByZWFkb25seSBzdHJpbmdbXSwgc3VnZ2VzdGVkT3B0aW9uOiBzdHJpbmcpOiB7IG9wdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkOyBpbmRleDogbnVtYmVyIH0ge1xuXHRjb25zdCBub3JtYWxpemUgPSAodmFsdWU6IHN0cmluZykgPT4gdmFsdWUucmVwbGFjZSgvWydcImBdL2csICcnKS50cmltKCkucmVwbGFjZSgvWy4sOjtdKyQvLCAnJyk7XG5cblx0Y29uc3Qgbm9ybWFsaXplZFN1Z2dlc3Rpb24gPSBub3JtYWxpemUoc3VnZ2VzdGVkT3B0aW9uKTtcblx0aWYgKCFub3JtYWxpemVkU3VnZ2VzdGlvbikge1xuXHRcdHJldHVybiB7IG9wdGlvbjogdW5kZWZpbmVkLCBpbmRleDogLTEgfTtcblx0fVxuXG5cdGNvbnN0IGNhbmRpZGF0ZXM6IHN0cmluZ1tdID0gW25vcm1hbGl6ZWRTdWdnZXN0aW9uXTtcblx0Y29uc3QgZmlyc3RXaGl0ZXNwYWNlVG9rZW4gPSBub3JtYWxpemVkU3VnZ2VzdGlvbi5zcGxpdCgvXFxzKy8pWzBdO1xuXHRpZiAoZmlyc3RXaGl0ZXNwYWNlVG9rZW4gJiYgZmlyc3RXaGl0ZXNwYWNlVG9rZW4gIT09IG5vcm1hbGl6ZWRTdWdnZXN0aW9uKSB7XG5cdFx0Y2FuZGlkYXRlcy5wdXNoKGZpcnN0V2hpdGVzcGFjZVRva2VuKTtcblx0fVxuXHRjb25zdCBmaXJzdEFscGhhTnVtID0gbm9ybWFsaXplZFN1Z2dlc3Rpb24ubWF0Y2goL1tBLVphLXowLTldKy8pO1xuXHRpZiAoZmlyc3RBbHBoYU51bT8uWzBdICYmIGZpcnN0QWxwaGFOdW1bMF0gIT09IG5vcm1hbGl6ZWRTdWdnZXN0aW9uICYmIGZpcnN0QWxwaGFOdW1bMF0gIT09IGZpcnN0V2hpdGVzcGFjZVRva2VuKSB7XG5cdFx0Y2FuZGlkYXRlcy5wdXNoKGZpcnN0QWxwaGFOdW1bMF0pO1xuXHR9XG5cblx0Zm9yIChjb25zdCBjYW5kaWRhdGUgb2YgY2FuZGlkYXRlcykge1xuXHRcdGNvbnN0IGV4YWN0SW5kZXggPSBvcHRpb25zLmZpbmRJbmRleChvcHQgPT4gbm9ybWFsaXplKG9wdCkgPT09IGNhbmRpZGF0ZSk7XG5cdFx0aWYgKGV4YWN0SW5kZXggIT09IC0xKSB7XG5cdFx0XHRyZXR1cm4geyBvcHRpb246IG9wdGlvbnNbZXhhY3RJbmRleF0sIGluZGV4OiBleGFjdEluZGV4IH07XG5cdFx0fVxuXHRcdGNvbnN0IGxvd2VyQ2FuZGlkYXRlID0gY2FuZGlkYXRlLnRvTG93ZXJDYXNlKCk7XG5cdFx0Y29uc3QgY2lJbmRleCA9IG9wdGlvbnMuZmluZEluZGV4KG9wdCA9PiBub3JtYWxpemUob3B0KS50b0xvd2VyQ2FzZSgpID09PSBsb3dlckNhbmRpZGF0ZSk7XG5cdFx0aWYgKGNpSW5kZXggIT09IC0xKSB7XG5cdFx0XHRyZXR1cm4geyBvcHRpb246IG9wdGlvbnNbY2lJbmRleF0sIGluZGV4OiBjaUluZGV4IH07XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHsgb3B0aW9uOiB1bmRlZmluZWQsIGluZGV4OiAtMSB9O1xufVxuXG4vKipcbiAqIEhpZ2gtY29uZmlkZW5jZSBwYXR0ZXJucyB0aGF0IHJlbGlhYmx5IGluZGljYXRlIHRoZSB0ZXJtaW5hbCBpcyB3YWl0aW5nIGZvclxuICogaW5wdXQuIFRoZXNlIGFyZSBzYWZlIHRvIHVzZSBhcyBhIGZhc3QtcGF0aCBpbiBgX3dhaXRGb3JJZGxlYCB0byBza2lwIG5vcm1hbFxuICogaWRsZSBkZXRlY3Rpb24sIGJlY2F1c2UgdGhleSBhcmUgc3BlY2lmaWMgZW5vdWdoIHRvIGF2b2lkIGZhbHNlIHBvc2l0aXZlcyBvblxuICogbm9ybWFsIGNvbW1hbmQgb3V0cHV0IChidWlsZCBsb2dzLCBoZWFkZXJzLCBldGMuKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRldGVjdHNIaWdoQ29uZmlkZW5jZUlucHV0UGF0dGVybihjdXJzb3JMaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIFtcblx0XHQvLyBQb3dlclNoZWxsLXN0eWxlIG11bHRpLW9wdGlvbiBsaW5lIChzdXBwb3J0cyBbP10gSGVscCBhbmQgb3B0aW9uYWwgZGVmYXVsdCBzdWZmaXgpIGVuZGluZ1xuXHRcdC8vIGluIHdoaXRlc3BhY2UuICBVc2VzIFteXFxbXSogdG8gbWF0Y2ggZWFjaCBsYWJlbCAoZXZlcnl0aGluZyB1cCB0byB0aGUgbmV4dCBicmFja2V0KSxcblx0XHQvLyBlbnN1cmluZyBsaW5lYXItdGltZSBtYXRjaGluZyB3aXRoIG5vIG5lc3RlZCBxdWFudGlmaWVycyB0aGF0IGNvdWxkIGNhdXNlIFJlRG9TLlxuXHRcdC9cXHMqKD86XFxbW15cXF1dXFxdW15cXFtdKikrKD86XFwoZGVmYXVsdCBpc1xccytcIlteXCJdK1wiXFwpOik/XFxzKyQvLFxuXHRcdC8vIEJyYWNrZXRlZC9wYXJlbnRoZXNpemVkIHllcy9ubyBwYWlycyBhdCBlbmQgb2YgbGluZTogKHkvbiksIFtZL25dLCAoeWVzL25vKSwgW25vL3llc11cblx0XHQvKD86XFwofFxcWylcXHMqKD86eSg/OmVzKT9cXHMqXFwvXFxzKm4oPzpvKT98big/Om8pP1xccypcXC9cXHMqeSg/OmVzKT8pXFxzKig/OlxcXXxcXCkpXFxzKyQvaSxcblx0XHQvLyBTYW1lIGFzIGFib3ZlIGJ1dCBhbGxvd3MgYSBwcmVjZWRpbmcgJz8nIG9yICc6JyBhbmQgb3B0aW9uYWwgd3JhcHBlcnMgZS5nLlxuXHRcdC8vIFwiQ29udGludWU/ICh5L24pXCIgb3IgXCJPdmVyd3JpdGU6IFt5ZXMvbm9dXCJcblx0XHQvWz86XVxccyooPzpcXCh8XFxbKT9cXHMqeSg/OmVzKT9cXHMqXFwvXFxzKm4oPzpvKT9cXHMqKD86XFxdfFxcKSk/XFxzKyQvaSxcblx0XHQvLyBDb25maXJtYXRpb24gcHJvbXB0cyBlbmRpbmcgd2l0aCAoeSkgZm9sbG93ZWQgYnkgdHJhaWxpbmcgc3BhY2UsIGUuZy4gXCJPayB0byBwcm9jZWVkPyAoeSkgXCJcblx0XHQvLyBUaGUgdHJhaWxpbmcgc3BhY2UgaW5kaWNhdGVzIHRoZSBjdXJzb3IgaXMgcG9zaXRpb25lZCBhZnRlciB0aGUgcHJvbXB0IGF3YWl0aW5nIGlucHV0LCBhc1xuXHRcdC8vIG9wcG9zZWQgdG8gbm9ybWFsIGNvbW1hbmQgb3V0cHV0IHRoYXQgaGFwcGVucyB0byBjb250YWluIFwiKHkpXCIgZm9sbG93ZWQgYnkgYSBuZXdsaW5lLlxuXHRcdC9cXCh5XFwpICskL2ksXG5cdFx0Ly8gUHJvbXB0IHdpdGggcGFyZW50aGVzaXplZCBkZWZhdWx0IHZhbHVlIGUuZy4gXCJwYWNrYWdlIG5hbWU6ICh0ZXN0KSBcIiBvciBcInZlcnNpb246ICgxLjAuMCkgXCIuXG5cdFx0Ly8gUkVRVUlSRVMgYXQgbGVhc3Qgb25lIHNwYWNlIGJldHdlZW4gdGhlIGNvbG9uIGFuZCB0aGUgb3BlbmluZyBwYXJlbiAoYFxccytgLCBub3QgYFxccypgKVxuXHRcdC8vIHNvIHRoaXMgcnVsZSBkb2VzIG5vdCBtYXRjaCBnaXQtYXdhcmUgc2hlbGwgcHJvbXB0cyBsaWtlXG5cdFx0Ly8gYWxsb3ctYW55LXVuaWNvZGUtbmV4dC1saW5lXG5cdFx0Ly8gICBcIlx1Mjc5QyAgbXlyZXBvIGdpdDoobWFpbikgXCIgICAgICAgICAgICAgICAgICAgIChvaC1teS16c2ggLyByb2JieXJ1c3NlbGwpXG5cdFx0Ly8gICBcIlt1c2VyQGhvc3Qgfi9teXJlcG8gKG1haW4pXSQgXCJcblx0XHQvLyB3aGVyZSB0aGUgY29sb24gYWJ1dHMgdGhlIHBhcmVuIHdpdGggbm8gc2VwYXJhdG9yLiBucG0taW5pdCAvIHlhcm4taW5pdCBzdHlsZVxuXHRcdC8vIHByb21wdHMgYWx3YXlzIHJlbmRlciBhdCBsZWFzdCBvbmUgc3BhY2UgYWZ0ZXIgdGhlIGNvbG9uLCBzbyB0aGlzIHN0YXlzIHNwZWNpZmljXG5cdFx0Ly8gd2l0aG91dCBkcm9wcGluZyB0aGUgaW50ZW5kZWQgbWF0Y2hlcy5cblx0XHQvOlxccytcXChbXildKlxcKSArJC8sXG5cdFx0Ly8gTGluZSBjb250YWlucyAoRU5EKSB3aGljaCBpcyBjb21tb24gaW4gcGFnZXJzXG5cdFx0L1xcKEVORFxcKSQvLFxuXHRcdC8vIFBhc3N3b3JkIHByb21wdC4gUmVxdWlyZXMgYSB0cmFpbGluZyBjb2xvbiAoZS5nLiBcIlBhc3N3b3JkOlwiLCBcIltzdWRvXSBwYXNzd29yZCBmb3IgdXNlcjpcIilcblx0XHQvLyBhbmQgdG9sZXJhdGVzIHplcm8gb3IgbW9yZSB0cmFpbGluZyBzcGFjZXMgXHUyMDE0IHh0ZXJtJ3MgYHRyYW5zbGF0ZVRvU3RyaW5nKHRyaW1SaWdodD10cnVlKWBcblx0XHQvLyBzdHJpcHMgdHJhaWxpbmcgd2hpdGVzcGFjZSBmcm9tIG5vbi13cmFwcGVkIGJ1ZmZlciBsaW5lcywgc28gYSByZWFsIGBQYXNzd29yZDogYCBwcm9tcHRcblx0XHQvLyBpcyBjYXB0dXJlZCBmcm9tIHRoZSBidWZmZXIgYXMgYFBhc3N3b3JkOmAgd2l0aCBubyB0cmFpbGluZyBzcGFjZS5cblx0XHQvcGFzc3dvcmQoPzogZm9yIFteOl0rKT86XFxzKiQvaSxcblx0XHQvLyBcIlByZXNzIGEga2V5XCIgb3IgXCJQcmVzcyBhbnkga2V5XCJcblx0XHQvcHJlc3MgYSg/Om55KT8ga2V5L2ksXG5cdFx0Ly8gSW50ZXJhY3RpdmUgcHJvbXB0IGxpYnJhcmllcyAocHJvbXB0cywgZW5xdWlyZXIsIGlucXVpcmVyKSBwcmVmaXggdGhlIHByb21wdCB3aXRoXG5cdFx0Ly8gJz8gJyBhdCB0aGUgc3RhcnQgb2YgdGhlIGxpbmUgYW5kIGVuZCB3aXRoIGEgZGlzdGluY3RpdmUgY2hldnJvbiBjaGFyYWN0ZXJcblx0XHQvLyBmb2xsb3dlZCBieSBvcHRpb25hbCB0cmFpbGluZyB3aGl0ZXNwYWNlIHdoZXJlIHRoZSBjdXJzb3IgaXMgYXdhaXRpbmcgaW5wdXQuXG5cdFx0Ly8gQW5jaG9yaW5nIHRoZSAnPycgdG8gdGhlIHN0YXJ0IG9mIHRoZSBsaW5lIChhZnRlciBvcHRpb25hbCB3aGl0ZXNwYWNlL0FOU0lcblx0XHQvLyBlc2NhcGVzKSBhdm9pZHMgZmFsc2UgcG9zaXRpdmVzIGZyb20gbm9ybWFsIG91dHB1dCB0aGF0IGNvbnRhaW5zIGJvdGggYSAnPydcblx0XHQvLyBhbGxvdy1hbnktdW5pY29kZS1uZXh0LWxpbmVcblx0XHQvLyBhbmQgYSBjaGV2cm9uIChlLmcuIFwiV2hhdCBoYXBwZW5lZD8gXHUyMDNBXCIpLlxuXHRcdC8vIEV4YW1wbGVzOlxuXHRcdC8vICAgXCI/IERvIHlvdSB3YW50IHRvIGluc3RhbGwganNkb20/IDxjaGV2cm9uPlwiICAocHJvbXB0cylcblx0XHQvLyAgIFwiPyBQaWNrIGEgY29sb3IgPGNoZXZyb24+IFwiICAgICAgICAgICAgICAgICAgKGVucXVpcmVyKVxuXHRcdC8vIGFsbG93LWFueS11bmljb2RlLW5leHQtbGluZVxuXHRcdC9eKD86XFxzfFxceDFiXFxbWzAtOTtdKm0pKlxcPy4qW1x1MjAzQVx1Mjc2Rlx1MjVCOFx1MjVCNl1cXHMqJC8sXG5cdF0uc29tZShlID0+IGUudGVzdChjdXJzb3JMaW5lKSk7XG59XG5cbi8qKlxuICogU3RyaWN0IGlucHV0LXJlcXVpcmVkIGRldGVjdGlvbi4gUmV0dXJucyB0cnVlIG9ubHkgZm9yIHBhdHRlcm5zIHRoYXQgYXJlXG4gKiBzcGVjaWZpYyBlbm91Z2ggdG8gYXZvaWQgZmFsc2UgcG9zaXRpdmVzIG9uIG5vcm1hbCBjb21tYW5kIG91dHB1dCAoYnVpbGRcbiAqIGxvZ3MsIHN0YXR1cyBsaW5lcywgZXJyb3IgbWVzc2FnZXMpLiBTYWZlIHRvIGNhbGwgZnJvbSBhbnkgY29kZSBwYXRoLFxuICogaW5jbHVkaW5nIHVuY29uZGl0aW9uYWxseSBvbiB0aGUgbGFzdCBsaW5lIG9mIGEgZmluaXNoZWQgY29tbWFuZC5cbiAqXG4gKiBGb3IgdGhlIGJyb2FkZXIgaGV1cmlzdGljcyAoYmFyZSBgOmAgLyBgP2Agd2l0aCB0cmFpbGluZyBzcGFjZSksIHVzZVxuICoge0BsaW5rIGRldGVjdHNMaWtlbHlJbnB1dFJlcXVpcmVkUGF0dGVybn0gXHUyMDE0IGJ1dCBvbmx5IGZyb20gYSBjYWxsIHNpdGUgdGhhdFxuICogaGFzIGluZGVwZW5kZW50IGV2aWRlbmNlIHRoZSBjb21tYW5kIGlzIHN0aWxsIHJ1bm5pbmcgYW5kIGNvbnN1bWluZyBzdGRpblxuICogKGUuZy4gYGV4ZWN1dGlvbi5pc0FjdGl2ZSgpID09PSB0cnVlYCkuIFRob3NlIGJyb2FkIHBhdHRlcm5zIGNhbm5vdFxuICogcmVsaWFibHkgZGlzdGluZ3Vpc2ggYSByZWFsIHByb21wdCBsaWtlIGBFbnRlciB5b3VyIG5hbWU6IGAgZnJvbSBsb2dcbiAqIG91dHB1dCBsaWtlIGBMYXN0IENvbW1hbmQ6IGAgb24gYSBzaW5nbGUgbGluZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRldGVjdHNJbnB1dFJlcXVpcmVkUGF0dGVybihjdXJzb3JMaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGRldGVjdHNIaWdoQ29uZmlkZW5jZUlucHV0UGF0dGVybihjdXJzb3JMaW5lKTtcbn1cblxuLyoqXG4gKiBTdHJpY3QgcGF0dGVybnMgcGx1cyBicm9hZGVyIGhldXJpc3RpY3MgKGJhcmUgYDpgIGFuZCBgP2Agd2l0aCB0cmFpbGluZ1xuICogc3BhY2UpLiBUaGVzZSBicm9hZCBwYXR0ZXJucyBtYXkgcHJvZHVjZSBmYWxzZSBwb3NpdGl2ZXMgb24gbm9ybWFsIGNvbW1hbmRcbiAqIG91dHB1dCB0aGF0IGhhcHBlbnMgdG8gZW5kIHdpdGggdGhvc2UgY2hhcmFjdGVycyAoZS5nLiBgTGFzdCBDb21tYW5kOiBgLFxuICogYFtJTkZPXSBTdGFydGluZzogYCwgYGZpbmQ6IC90bXAveDogTm8gc3VjaCBmaWxlOiBgKS4gVGhleSBhcmVcbiAqIHN5bnRhY3RpY2FsbHkgaW5kaXN0aW5ndWlzaGFibGUgZnJvbSByZWFsIHByb21wdHMgbGlrZSBgRW50ZXIgeW91ciBuYW1lOiBgXG4gKiBvbiBhIHNpbmdsZSBjdXJzb3IgbGluZS5cbiAqXG4gKiBUaGVyZWZvcmUgdGhpcyBmdW5jdGlvbiBpcyBvbmx5IHNhZmUgdG8gY2FsbCB3aGVuIHRoZSBjYWxsZXIgaGFzXG4gKiBpbmRlcGVuZGVudCBldmlkZW5jZSB0aGF0IHRoZSB0ZXJtaW5hbCBpcyBjdXJyZW50bHkgY29uc3VtaW5nIHN0ZGluIFx1MjAxNFxuICogc3BlY2lmaWNhbGx5LCBgZXhlY3V0aW9uLmlzQWN0aXZlKCkgPT09IHRydWVgIGF0IGEgbW9tZW50IHdoZW4gdGhlIG91dHB1dFxuICogc3RyZWFtIGhhcyBiZWVuIHF1aWV0IChpZGxlKSBmb3Igc2V2ZXJhbCBwb2xsIGludGVydmFscy4gYF93YWl0Rm9ySWRsZWBcbiAqIGFwcGxpZXMgdGhhdCBnYXRlOyBuZXcgY2FsbCBzaXRlcyBzaG91bGQgcHJlc2VydmUgaXQuXG4gKlxuICogRm9yIHVuY29uZGl0aW9uYWwgY2hlY2tzIChlLmcuIG9uIHRoZSBsYXN0IGxpbmUgb2YgYSBmaW5pc2hlZCBjb21tYW5kKSxcbiAqIHVzZSB7QGxpbmsgZGV0ZWN0c0lucHV0UmVxdWlyZWRQYXR0ZXJufSBpbnN0ZWFkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZGV0ZWN0c0xpa2VseUlucHV0UmVxdWlyZWRQYXR0ZXJuKGN1cnNvckxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAoZGV0ZWN0c0hpZ2hDb25maWRlbmNlSW5wdXRQYXR0ZXJuKGN1cnNvckxpbmUpKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cmV0dXJuIFtcblx0XHQvLyBMaW5lIGVuZHMgd2l0aCAnOicgZm9sbG93ZWQgYnkgYXQgbGVhc3Qgb25lIHNwYWNlLiBUaGUgdHJhaWxpbmcgc3BhY2UgaW5kaWNhdGVzIGFcblx0XHQvLyB3YWl0aW5nIHByb21wdCAoY3Vyc29yIHBvc2l0aW9uZWQgYWZ0ZXIgdGhlIGNvbG9uKS4gQSBiYXJlICc6XFxuJyBhdCBlbmQgb2YgYnVmZmVyIGlzXG5cdFx0Ly8gdXN1YWxseSBub24tcHJvbXB0IG91dHB1dCAoZS5nLiBhIGhlYWRlciBvciBsb2cgbGluZSkgYW5kIG11c3Qgbm90IG1hdGNoLlxuXHRcdC8vIE5PVEU6IFRoaXMgaXMgYSBicm9hZCBwYXR0ZXJuIFx1MjAxNCBvbmx5IHVzZSB3aGVuIHRoZSBjYWxsZXIgaGFzIGluZGVwZW5kZW50IGV2aWRlbmNlXG5cdFx0Ly8gKGUuZy4gYGlzQWN0aXZlID09PSB0cnVlYCkgdGhhdCB0aGUgY29tbWFuZCBpcyBzdGlsbCBjb25zdW1pbmcgc3RkaW4uIE9uIGEgZmluaXNoZWRcblx0XHQvLyBjb21tYW5kLCBsb2cgb3V0cHV0IGxpa2UgYExhc3QgQ29tbWFuZDogYCBpcyBpbmRpc3Rpbmd1aXNoYWJsZSBmcm9tIGEgcmVhbCBwcm9tcHQuXG5cdFx0LzogKyQvLFxuXHRcdC8vIExpbmUgZW5kcyB3aXRoICc/JyBmb2xsb3dlZCBieSBhdCBsZWFzdCBvbmUgc3BhY2UgKG9wdGlvbmFsbHkgZm9sbG93ZWQgYnkgYVxuXHRcdC8vIHBhcmVudGhlc2l6ZWQgaGludCBsaWtlIFwiQ29udGludWU/ICh5ZXMvbm8pIFwiKS4gUmVxdWlyaW5nIHRyYWlsaW5nIHNwYWNlIGF2b2lkc1xuXHRcdC8vIG1hdGNoaW5nIGFyYml0cmFyeSBjb21tYW5kIG91dHB1dCB3aGVyZSBhIGxpbmUgaGFwcGVucyB0byBlbmQgd2l0aCAnPycuXG5cdFx0Ly8gTk9URTogVGhpcyBpcyBhIGJyb2FkIHBhdHRlcm4gXHUyMDE0IHNhbWUgY2FsbGVyLXNpZGUgZ3VhcmQgcmVxdWlyZWQgYXMgYWJvdmUuXG5cdFx0L1xcPyAqKD86XFwoW2Etelxcc10rXFwpKT8gKyQvaSxcblx0XS5zb21lKGUgPT4gZS50ZXN0KGN1cnNvckxpbmUpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRldGVjdHNOb25JbnRlcmFjdGl2ZUhlbHBQYXR0ZXJuKGN1cnNvckxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gW1xuXHRcdC9wcmVzcyBbaD9dXFxzKig/OlxcK1xccyplbnRlcik/XFxzKnRvICg/OnNob3d8b3BlbnxkaXNwbGF5fGdldHxzZWUpXFxzKig/OmF2YWlsYWJsZSApPyg/OmhlbHB8Y29tbWFuZHN8b3B0aW9ucykvaSxcblx0XHQvcHJlc3MgaFxccyooPzpvclxccypcXD8pP1xccyooPzpcXCtcXHMqZW50ZXIpP1xccypmb3IgKD86aGVscHxjb21tYW5kc3xvcHRpb25zKS9pLFxuXHRcdC9wcmVzcyBcXD9cXHMqKD86XFwrXFxzKmVudGVyKT9cXHMqKD86dG98Zm9yKT9cXHMqKD86aGVscHxjb21tYW5kc3xvcHRpb25zfGxpc3QpL2ksXG5cdFx0L3R5cGVcXHMqW2g/XVxccyooPzpcXCtcXHMqZW50ZXIpP1xccyooPzpmb3J8dG8gc2VlfHRvIHNob3cpXFxzKig/OmhlbHB8Y29tbWFuZHN8b3B0aW9ucykvaSxcblx0XHQvaGl0XFxzKltoP11cXHMqKD86XFwrXFxzKmVudGVyKT9cXHMqKD86Zm9yfHRvIHNlZXx0byBzaG93KVxccyooPzpoZWxwfGNvbW1hbmRzfG9wdGlvbnMpL2ksXG5cdFx0L3ByZXNzIG9cXHMqKD86XFwrXFxzKmVudGVyKT9cXHMqKD86dG98Zm9yKT9cXHMqKD86b3BlbnxsYXVuY2gpKD86XFxzKig/OnRoZSApPyg/OmFwcHxhcHBsaWNhdGlvbnxicm93c2VyKXxcXHMraW5cXHMrKD86dGhlXFxzKyk/YnJvd3Nlcik/L2ksXG5cdFx0L3ByZXNzIHJcXHMqKD86XFwrXFxzKmVudGVyKT9cXHMqKD86dG98Zm9yKT9cXHMqKD86cmVzdGFydHxyZWxvYWR8cmVmcmVzaCkoPzpcXHMqKD86dGhlICk/KD86c2VydmVyfGRldiBzZXJ2ZXJ8c2VydmljZSkpPy9pLFxuXHRcdC9wcmVzcyBxXFxzKig/OlxcK1xccyplbnRlcik/XFxzKig/OnRvfGZvcik/XFxzKig/OnF1aXR8ZXhpdHxzdG9wKSg/OlxccyooPzp0aGUgKT8oPzpzZXJ2ZXJ8YXBwfHByb2Nlc3MpKT8vaSxcblx0XHQvcHJlc3MgdVxccyooPzpcXCtcXHMqZW50ZXIpP1xccyooPzp0b3xmb3IpP1xccyooPzpzaG93fHByaW50fGRpc3BsYXkpXFxzKig/OnRoZSApPyg/OnNlcnZlciApP3VybHM/L2lcblx0XS5zb21lKGUgPT4gZS50ZXN0KGN1cnNvckxpbmUpKTtcbn1cblxuLyoqXG4gKiBMb2NhbGl6ZWQgdGFzayBmaW5pc2ggbWVzc2FnZXMgZnJvbSBWUyBDb2RlJ3MgdGVybWluYWxUYXNrU3lzdGVtLlxuICogVGhlc2UgYXJlIHRoZSBzYW1lIHN0cmluZ3MgdXNlZCB3aGVuIHRhc2tzIGNvbXBsZXRlLlxuICovXG5jb25zdCB0YXNrRmluaXNoTWVzc2FnZXMgPSBbXG5cdC8vIFwiVGVybWluYWwgd2lsbCBiZSByZXVzZWQgYnkgdGFza3MsIHByZXNzIGFueSBrZXkgdG8gY2xvc2UgaXQuXCJcblx0bG9jYWxpemUoJ2Nsb3NlVGVybWluYWwnLCBcIlRlcm1pbmFsIHdpbGwgYmUgcmV1c2VkIGJ5IHRhc2tzLCBwcmVzcyBhbnkga2V5IHRvIGNsb3NlIGl0LlwiKSxcblx0bG9jYWxpemUoJ3JldXNlVGVybWluYWwnLCBcIlRlcm1pbmFsIHdpbGwgYmUgcmV1c2VkIGJ5IHRhc2tzLCBwcmVzcyBhbnkga2V5IHRvIGNsb3NlIGl0LlwiKSxcblx0Ly8gXCJQcmVzcyBhbnkga2V5IHRvIGNsb3NlIHRoZSB0ZXJtaW5hbC5cIiAod2l0aCBleGl0IGNvZGUgcGxhY2Vob2xkZXIgcmVtb3ZlZCBmb3IgbWF0Y2hpbmcpXG5cdGxvY2FsaXplKCdleGl0Q29kZS5jbG9zZVRlcm1pbmFsJywgXCJQcmVzcyBhbnkga2V5IHRvIGNsb3NlIHRoZSB0ZXJtaW5hbC5cIiksXG5cdGxvY2FsaXplKCdleGl0Q29kZS5yZXVzZVRlcm1pbmFsJywgXCJQcmVzcyBhbnkga2V5IHRvIGNsb3NlIHRoZSB0ZXJtaW5hbC5cIiksXG5cdC8vIFB1bmN0dWF0aW9uIHZhcmlhbnQ6IFwiVGhlIHRlcm1pbmFsIHdpbGwgYmUgcmV1c2VkIGJ5IHRhc2tzLiBQcmVzcyBhbnkga2V5IHRvIGNsb3NlLlwiXG5cdGxvY2FsaXplKCdyZXVzZVRlcm1pbmFsLnByZXNzQ2xvc2UnLCBcIlRoZSB0ZXJtaW5hbCB3aWxsIGJlIHJldXNlZCBieSB0YXNrcy4gUHJlc3MgYW55IGtleSB0byBjbG9zZS5cIiksXG5dO1xuXG5jb25zdCBub3JtYWxpemVkVGFza0ZpbmlzaE1lc3NhZ2VzID0gdGFza0ZpbmlzaE1lc3NhZ2VzLm1hcChtc2cgPT5cblx0bXNnLnJlcGxhY2UoL1tcXHMuLDo7IT9cIidgKClbXFxde308PlxcLV8vXFxcXF0rL2csICcnKS50b0xvd2VyQ2FzZSgpXG4pO1xuXG4vKipcbiAqIERldGVjdHMgVlMgQ29kZSdzIHNwZWNpZmljIHRhc2sgY29tcGxldGlvbiBtZXNzYWdlcyBsaWtlOlxuICogLSBcIlByZXNzIGFueSBrZXkgdG8gY2xvc2UgdGhlIHRlcm1pbmFsLlwiXG4gKiAtIFwiVGVybWluYWwgd2lsbCBiZSByZXVzZWQgYnkgdGFza3MsIHByZXNzIGFueSBrZXkgdG8gY2xvc2UgaXQuXCJcbiAqIFRoZXNlIGFwcGVhciB3aGVuIGEgdGFzayBmaW5pc2hlcyBhbmQgc2hvdWxkIGJlIGlnbm9yZWQgaWYgdGhlIHRhc2sgaXMgZG9uZS5cbiAqIE5vdGU6IFRoZXNlIG1lc3NhZ2VzIG1heSBiZSBwcmVmaXhlZCB3aXRoIFwiICogXCIgYnkgVlMgQ29kZSBhbmQgbWF5IGhhdmUgbGluZSB3cmFwcGluZ1xuICogdGhhdCBjYW4gc3BsaXQgd29yZHMgYWNyb3NzIGxpbmVzIChlLmcuLCBcInRcXG5vXCIgaW5zdGVhZCBvZiBcInRvXCIpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZGV0ZWN0c1ZTQ29kZVRhc2tGaW5pc2hNZXNzYWdlKGN1cnNvckxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHQvLyBCZSB0b2xlcmFudCB0byB3aGl0ZXNwYWNlLCBwdW5jdHVhdGlvbiwgYW5kIGxpbmUgd3JhcHBpbmcgdGhhdCBjYW4gc3BsaXQgd29yZHMgbWlkLXdvcmQuXG5cdGNvbnN0IGNvbXBhY3QgPSBjdXJzb3JMaW5lLnJlcGxhY2UoL1tcXHMuLDo7IT9cIidgKClbXFxde308PlxcLV8vXFxcXF0rL2csICcnKS50b0xvd2VyQ2FzZSgpO1xuXHRyZXR1cm4gbm9ybWFsaXplZFRhc2tGaW5pc2hNZXNzYWdlcy5zb21lKG1zZyA9PiBjb21wYWN0LmluY2x1ZGVzKG1zZykpO1xufVxuXG4vKipcbiAqIERldGVjdHMgZ2VuZXJpYyBcInByZXNzIGFueSBrZXlcIiBwcm9tcHRzIGZyb20gc2NyaXB0cyAobm90IFZTIENvZGUgdGFzayBtZXNzYWdlcykuXG4gKiBUaGVzZSBzaG91bGQgcHJvbXB0IHRoZSB1c2VyIHRvIGludGVyYWN0IHdpdGggdGhlIHRlcm1pbmFsLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZGV0ZWN0c0dlbmVyaWNQcmVzc0FueUtleVBhdHRlcm4oY3Vyc29yTGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdC8vIE1hdGNoIFwicHJlc3MgYW55IGtleVwiIGJ1dCBleGNsdWRlIFZTIENvZGUgdGFzay1zcGVjaWZpYyBtZXNzYWdlc1xuXHRpZiAoZGV0ZWN0c1ZTQ29kZVRhc2tGaW5pc2hNZXNzYWdlKGN1cnNvckxpbmUpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5c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QTtBQUFBO0FBQUE7QUFBQSxJQUtBO0FBQUE7QUFBQSxJQUVBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBWUE7QUFBQSxFQUNELEVBQUUsS0FBSyxPQUFLLEVBQUUsS0FBSyxVQUFVLENBQUM7QUFDL0I7QUFlTyxTQUFTLDRCQUE0QixZQUE2QjtBQUN4RSxTQUFPLGtDQUFrQyxVQUFVO0FBQ3BEO0FBbUJPLFNBQVMsa0NBQWtDLFlBQTZCO0FBQzlFLE1BQUksa0NBQWtDLFVBQVUsR0FBRztBQUNsRCxXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQU9OO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQUtBO0FBQUEsRUFDRCxFQUFFLEtBQUssT0FBSyxFQUFFLEtBQUssVUFBVSxDQUFDO0FBQy9CO0FBRU8sU0FBUyxpQ0FBaUMsWUFBNkI7QUFDN0UsU0FBTztBQUFBLElBQ047QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0QsRUFBRSxLQUFLLE9BQUssRUFBRSxLQUFLLFVBQVUsQ0FBQztBQUMvQjtBQU1BLE1BQU0scUJBQXFCO0FBQUE7QUFBQSxFQUUxQixTQUFTLGlCQUFpQiw4REFBOEQ7QUFBQSxFQUN4RixTQUFTLGlCQUFpQiw4REFBOEQ7QUFBQTtBQUFBLEVBRXhGLFNBQVMsMEJBQTBCLHNDQUFzQztBQUFBLEVBQ3pFLFNBQVMsMEJBQTBCLHNDQUFzQztBQUFBO0FBQUEsRUFFekUsU0FBUyw0QkFBNEIsK0RBQStEO0FBQ3JHO0FBRUEsTUFBTSwrQkFBK0IsbUJBQW1CO0FBQUEsRUFBSSxTQUMzRCxJQUFJLFFBQVEsa0NBQWtDLEVBQUUsRUFBRSxZQUFZO0FBQy9EO0FBVU8sU0FBUywrQkFBK0IsWUFBNkI7QUFFM0UsUUFBTSxVQUFVLFdBQVcsUUFBUSxrQ0FBa0MsRUFBRSxFQUFFLFlBQVk7QUFDckYsU0FBTyw2QkFBNkIsS0FBSyxTQUFPLFFBQVEsU0FBUyxHQUFHLENBQUM7QUFDdEU7QUFNTyxTQUFTLGlDQUFpQyxZQUE2QjtBQUU3RSxNQUFJLCtCQUErQixVQUFVLEdBQUc7QUFDL0MsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPLHNCQUFzQixLQUFLLFVBQVU7QUFDN0M7IiwKICAibmFtZXMiOiBbXQp9Cg==
