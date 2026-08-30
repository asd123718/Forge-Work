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
import { CancellationError } from "../../../../../../base/common/errors.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { hasKey } from "../../../../../../base/common/types.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { localize } from "../../../../../../nls.js";
import { IChatService, IChatToolInvocation } from "../../chatService/chatService.js";
import { ChatQuestionCarouselData } from "../../model/chatProgressTypes/chatQuestionCarouselData.js";
import { ChatConfiguration, ChatPermissionLevel } from "../../constants.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { StopWatch } from "../../../../../../base/common/stopwatch.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { ToolDataSource } from "../languageModelToolsService.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { raceCancellation } from "../../../../../../base/common/async.js";
import { TerminalToolId } from "../terminalToolIds.js";
const AUTOPILOT_ASK_USER_RESPONSE = "The user is not available to respond and will review your work later. Work autonomously and make good decisions.";
const AskQuestionsToolId = "vscode_askQuestions";
const SoftLimits = {
  header: 50,
  question: 200
};
const HardLimits = {
  header: 75
};
function truncateToLimit(value, limit) {
  if (value === void 0) {
    return void 0;
  }
  if (value.length > limit) {
    return value.slice(0, limit - 3) + "...";
  }
  return value;
}
function createAskQuestionsToolData() {
  const questionSchema = {
    type: "object",
    properties: {
      header: {
        type: "string",
        description: `Short identifier for the question. Must be unique so answers can be mapped back to the question. Maximum ${SoftLimits.header} characters.`,
        maxLength: SoftLimits.header
      },
      question: {
        type: "string",
        description: `The question text to display to the user. Keep it concise, ideally one sentence. Maximum ${SoftLimits.question} characters.`,
        maxLength: SoftLimits.question
      },
      multiSelect: {
        type: "boolean",
        description: "Allow selecting multiple options when options are provided."
      },
      allowFreeformInput: {
        type: "boolean",
        description: "Allow freeform text answers in addition to option selection. Defaults to true; set to false to restrict to predefined options only."
      },
      message: {
        type: "string",
        description: "Optional markdown message to display below the question text, providing additional context or details."
      },
      options: {
        type: "array",
        description: "Optional list of selectable answers. If omitted, the question is free text.",
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description: "Display label and value for the option."
            },
            description: {
              type: "string",
              description: "Optional secondary text shown with the option."
            },
            recommended: {
              type: "boolean",
              description: "Mark this option as the recommended default."
            }
          },
          required: ["label"]
        }
      }
    },
    required: ["header", "question"]
  };
  const inputSchema = {
    type: "object",
    properties: {
      questions: {
        type: "array",
        description: "List of questions to ask the user. Order is preserved.",
        items: questionSchema,
        minItems: 1
      }
    },
    required: ["questions"]
  };
  return {
    id: AskQuestionsToolId,
    toolReferenceName: "askQuestions",
    legacyToolReferenceFullNames: [AskQuestionsToolId, "vscode/askQuestions"],
    canBeReferencedInPrompt: false,
    icon: ThemeIcon.fromId(Codicon.question.id),
    displayName: localize("tool.askQuestions.displayName", "Ask Clarifying Questions"),
    userDescription: localize("tool.askQuestions.userDescription", "Ask structured clarifying questions using single select, multi-select, or freeform inputs to collect task requirements before proceeding."),
    modelDescription: "Use this tool to ask the user a small number of clarifying questions before proceeding. Provide the questions array with concise headers and prompts. Use options for fixed choices, set multiSelect when multiple selections are allowed. Users can always provide a freeform text answer alongside options unless you set allowFreeformInput to false.",
    source: ToolDataSource.Internal,
    inputSchema
  };
}
const AskQuestionsToolData = createAskQuestionsToolData();
let AskQuestionsTool = class extends Disposable {
  constructor(chatService, telemetryService, logService, configService) {
    super();
    this.chatService = chatService;
    this.telemetryService = telemetryService;
    this.logService = logService;
    this.configService = configService;
  }
  async invoke(invocation, _countTokens, progress, token) {
    const stopWatch = StopWatch.create(true);
    const parameters = invocation.parameters;
    const { questions } = parameters;
    this.logService.trace(`[AskQuestionsTool] Invoking with ${questions?.length ?? 0} question(s)`);
    if (!questions || questions.length === 0) {
      throw new Error(localize("askQuestionsTool.noQuestions", "No questions provided. The questions array must contain at least one question."));
    }
    const chatSessionResource = invocation.context?.sessionResource;
    const chatRequestId = invocation.chatRequestId;
    const { request, sessionResource } = this.getRequest(chatSessionResource, chatRequestId);
    if (!sessionResource || !request) {
      this.logService.warn("[AskQuestionsTool] Missing chat context; marking all questions as skipped.");
      return this.createSkippedResult(questions);
    }
    const resolveId = invocation.chatStreamToolCallId ?? invocation.callId;
    if (request.modeInfo?.permissionLevel === ChatPermissionLevel.Autopilot || this.configService.getValue(ChatConfiguration.AutoReply)) {
      const reason = request.modeInfo?.permissionLevel === ChatPermissionLevel.Autopilot ? "Autopilot mode" : "Auto-reply enabled";
      this.logService.info(`[AskQuestionsTool] ${reason}: auto-responding to questions`);
      const { carousel: carousel2, idToHeaderMap: idToHeaderMap2 } = this.toQuestionCarousel(questions, resolveId);
      carousel2.terminalId = this.extractTerminalId(request);
      carousel2.data = this.buildAutopilotCarouselAnswers(questions, carousel2, idToHeaderMap2);
      carousel2.isUsed = true;
      this.chatService.appendProgress(request, carousel2);
      return this.createAutopilotResult(questions);
    }
    const { carousel, idToHeaderMap } = this.toQuestionCarousel(questions, resolveId);
    carousel.terminalId = this.extractTerminalId(request);
    this.logService.trace(`[AskQuestionsTool] request=${request.id} terminalExecutionId=${request.terminalExecutionId ?? "undefined"} carousel.terminalId=${carousel.terminalId ?? "undefined"}`);
    this.chatService.appendProgress(request, carousel);
    const externalAnswerListener = this.chatService.onDidReceiveQuestionCarouselAnswer((event) => {
      if (event.resolveId !== carousel.resolveId || carousel.isUsed) {
        return;
      }
      carousel.dismiss(event.answers);
    });
    let answerResult;
    try {
      answerResult = await raceCancellation(carousel.completion.p, token);
    } catch (error) {
      if (error instanceof CancellationError) {
        carousel.dismiss(void 0);
      }
      throw error;
    } finally {
      externalAnswerListener.dispose();
    }
    if (!answerResult) {
      carousel.dismiss(void 0);
      throw new CancellationError();
    }
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    if (carousel.dismissedByTerminalInput && carousel.terminalId) {
      this.logService.info(`[AskQuestionsTool] Carousel dismissed because user typed directly in terminal ${carousel.terminalId}`);
      return {
        content: [{
          kind: "text",
          value: `The user is replying to the terminal prompts directly. Do not ask more questions or send input to the terminal. You will be automatically notified when the command in terminal ${carousel.terminalId} completes.`
        }]
      };
    }
    progress.report({ message: localize("askQuestionsTool.progress", "Analyzing your answers...") });
    const converted = this.convertCarouselAnswers(questions, answerResult?.answers, idToHeaderMap);
    const { answeredCount, skippedCount, freeTextCount, recommendedAvailableCount, recommendedSelectedCount } = this.collectMetrics(questions, converted);
    this.sendTelemetry(invocation.chatRequestId, questions.length, answeredCount, skippedCount, freeTextCount, recommendedAvailableCount, recommendedSelectedCount, stopWatch.elapsed());
    const toolResultJson = JSON.stringify(converted);
    this.logService.trace(`[AskQuestionsTool] Returning tool result with metrics: questions=${questions.length}, answered=${answeredCount}, skipped=${skippedCount}, freeText=${freeTextCount}, recommendedAvailable=${recommendedAvailableCount}, recommendedSelected=${recommendedSelectedCount}`);
    return {
      content: [{ kind: "text", value: toolResultJson }]
    };
  }
  async prepareToolInvocation(context, _token) {
    const parameters = context.parameters;
    const { questions } = parameters;
    if (!questions || questions.length === 0) {
      throw new Error(localize("askQuestionsTool.noQuestions", "No questions provided. The questions array must contain at least one question."));
    }
    for (const question of questions) {
      if (question.options && question.options.length === 1 && !question.allowFreeformInput) {
        throw new Error(localize("askQuestionsTool.invalidOptions", 'Question "{0}" must have at least two options, or set allowFreeformInput when providing a single option, or omit options for free text input.', question.header));
      }
    }
    const questionCount = questions.length;
    const headers = questions.map((q) => q.header).join(", ");
    const message = questionCount === 1 ? localize("askQuestionsTool.invocation.single", "Asking a question ({0})", headers) : localize("askQuestionsTool.invocation.multiple", "Asking {0} questions ({1})", questionCount, headers);
    const pastMessage = questionCount === 1 ? localize("askQuestionsTool.invocation.single.past", "Asked a question ({0})", headers) : localize("askQuestionsTool.invocation.multiple.past", "Asked {0} questions ({1})", questionCount, headers);
    return {
      invocationMessage: new MarkdownString(message),
      pastTenseMessage: new MarkdownString(pastMessage)
    };
  }
  getRequest(chatSessionResource, chatRequestId) {
    if (!chatSessionResource) {
      return { request: void 0, sessionResource: void 0 };
    }
    const model = this.chatService.getSession(chatSessionResource);
    let request;
    if (model) {
      if (chatRequestId) {
        request = model.getRequests().find((r) => r.id === chatRequestId);
      }
      if (!request) {
        request = model.getRequests().at(-1);
      }
    }
    if (!request) {
      return { request: void 0, sessionResource: chatSessionResource };
    }
    return { request, sessionResource: chatSessionResource };
  }
  /**
   * Resolves the terminal execution ID for the request.
   * Prefer structured metadata and fall back to legacy message parsing for
   * old sessions that may not carry the metadata yet.
   * As a final fallback, search completed runInTerminal tool invocations in
   * the response for the terminal ID, but only when the tool output indicates
   * the terminal is still running and waiting for input (foreground/timeout
   * path where the model calls ask_questions from the same turn as
   * runInTerminal).
   */
  extractTerminalId(request) {
    if (request.terminalExecutionId) {
      return request.terminalExecutionId;
    }
    const match = request.message.text.match(/\[Terminal (?<termId>\S+) notification:/);
    if (match?.groups?.termId) {
      return match.groups.termId;
    }
    const response = request.response;
    if (response) {
      const parts = response.response.value;
      for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        if (part.kind === "toolInvocation" && part.toolId === TerminalToolId.RunInTerminal) {
          const state = part.state.get();
          if (state.type === IChatToolInvocation.StateKind.Completed && state.contentForModel) {
            for (const item of state.contentForModel) {
              if (item.kind === "text") {
                const idMatch = item.value.match(/(?:running in terminal ID|may still be running in terminal ID) ([0-9a-fA-F-]+)/);
                if (idMatch) {
                  return idMatch[1];
                }
              }
            }
          }
        }
      }
    }
    return void 0;
  }
  toQuestionCarousel(questions, resolveId) {
    const idToHeaderMap = /* @__PURE__ */ new Map();
    const carouselResolveId = resolveId ?? generateUuid();
    const mappedQuestions = questions.map((question, index) => this.toChatQuestion(question, idToHeaderMap, carouselResolveId, index));
    return {
      carousel: new ChatQuestionCarouselData(mappedQuestions, true, carouselResolveId),
      idToHeaderMap
    };
  }
  toChatQuestion(question, idToHeaderMap, resolveId, index) {
    let type;
    if (!question.options || question.options.length === 0) {
      type = "text";
    } else if (question.multiSelect) {
      type = "multiSelect";
    } else {
      type = "singleSelect";
    }
    let defaultValue;
    if (question.options) {
      const recommendedOptions = question.options.filter((opt) => opt.recommended);
      if (recommendedOptions.length > 0) {
        defaultValue = question.multiSelect ? recommendedOptions.map((opt) => opt.label) : recommendedOptions[0].label;
      }
    }
    const internalId = `${resolveId}:${index}`;
    idToHeaderMap.set(internalId, question.header);
    const displayTitle = truncateToLimit(question.header, HardLimits.header) ?? question.header;
    return {
      id: internalId,
      type,
      title: displayTitle,
      message: question.question,
      detailedMessage: question.message,
      options: question.options?.map((opt) => ({
        id: opt.label,
        label: opt.description ? `${opt.label} - ${opt.description}` : opt.label,
        value: opt.label
      })),
      defaultValue,
      allowFreeformInput: question.allowFreeformInput ?? true
    };
  }
  convertCarouselAnswers(questions, carouselAnswers, idToHeaderMap) {
    const result = { answers: {} };
    if (carouselAnswers) {
      this.logService.trace(`[AskQuestionsTool] Carousel answer keys: ${Object.keys(carouselAnswers).join(", ")}`);
      this.logService.trace(`[AskQuestionsTool] Question headers: ${questions.map((q) => q.header).join(", ")}`);
    }
    const headerToIdMap = /* @__PURE__ */ new Map();
    for (const [internalId, originalHeader] of idToHeaderMap) {
      headerToIdMap.set(originalHeader, internalId);
    }
    for (const question of questions) {
      if (!carouselAnswers) {
        result.answers[question.header] = {
          selected: [],
          freeText: null,
          skipped: true
        };
        continue;
      }
      const internalId = headerToIdMap.get(question.header);
      const answer = internalId ? carouselAnswers[internalId] : void 0;
      this.logService.trace(`[AskQuestionsTool] Processing question "${question.header}" (internal ID: ${internalId}), raw answer: ${JSON.stringify(answer)}, type: ${typeof answer}`);
      if (answer === void 0) {
        result.answers[question.header] = {
          selected: [],
          freeText: null,
          skipped: true
        };
      } else if (typeof answer === "string") {
        if (question.options?.some((opt) => opt.label === answer)) {
          result.answers[question.header] = {
            selected: [answer],
            freeText: null,
            skipped: false
          };
        } else {
          result.answers[question.header] = {
            selected: [],
            freeText: answer,
            skipped: false
          };
        }
      } else if (Array.isArray(answer)) {
        result.answers[question.header] = {
          selected: answer.map((a) => String(a)),
          freeText: null,
          skipped: false
        };
      } else if (typeof answer === "object" && hasKey(answer, { selectedValues: true })) {
        const { selectedValues, freeformValue } = answer;
        result.answers[question.header] = {
          selected: selectedValues,
          freeText: freeformValue ?? null,
          skipped: false
        };
      } else if (typeof answer === "object" && (hasKey(answer, { selectedValue: true }) || hasKey(answer, { freeformValue: true }))) {
        const { selectedValue, freeformValue } = answer;
        if (freeformValue) {
          result.answers[question.header] = {
            selected: [],
            freeText: freeformValue,
            skipped: false
          };
        } else if (selectedValue !== void 0) {
          if (question.options?.some((opt) => opt.label === selectedValue)) {
            result.answers[question.header] = {
              selected: [selectedValue],
              freeText: null,
              skipped: false
            };
          } else {
            result.answers[question.header] = {
              selected: [],
              freeText: selectedValue,
              skipped: false
            };
          }
        } else {
          result.answers[question.header] = {
            selected: [],
            freeText: null,
            skipped: true
          };
        }
      } else {
        this.logService.warn(`[AskQuestionsTool] Unknown answer format for "${question.header}": ${JSON.stringify(answer)}`);
        result.answers[question.header] = {
          selected: [],
          freeText: null,
          skipped: true
        };
      }
    }
    return result;
  }
  collectMetrics(questions, result) {
    const answers = Object.values(result.answers);
    const answeredCount = answers.filter((a) => !a.skipped).length;
    const skippedCount = answers.filter((a) => a.skipped).length;
    const freeTextCount = answers.filter((a) => a.freeText !== null).length;
    const recommendedAvailableCount = questions.filter((q) => q.options?.some((opt) => opt.recommended)).length;
    const recommendedSelectedCount = questions.filter((q) => {
      const answer = result.answers[q.header];
      const recommendedOption = q.options?.find((opt) => opt.recommended);
      return answer && !answer.skipped && recommendedOption && answer.selected.includes(recommendedOption.label);
    }).length;
    return { answeredCount, skippedCount, freeTextCount, recommendedAvailableCount, recommendedSelectedCount };
  }
  createSkippedResult(questions) {
    const skippedAnswers = {};
    for (const question of questions) {
      skippedAnswers[question.header] = { selected: [], freeText: null, skipped: true };
    }
    return {
      content: [{ kind: "text", value: JSON.stringify({ answers: skippedAnswers }) }]
    };
  }
  createAutopilotResult(questions) {
    const answers = {};
    for (const question of questions) {
      answers[question.header] = {
        selected: [],
        freeText: AUTOPILOT_ASK_USER_RESPONSE,
        skipped: false
      };
    }
    return {
      content: [{ kind: "text", value: JSON.stringify({ answers }) }]
    };
  }
  /**
   * Build carousel answer data keyed by carousel question IDs for rendering
   * the completed summary in the UI during autopilot mode.
   */
  buildAutopilotCarouselAnswers(questions, carousel, idToHeaderMap) {
    const data = {};
    const headerToIdMap = /* @__PURE__ */ new Map();
    for (const [internalId, originalHeader] of idToHeaderMap) {
      headerToIdMap.set(originalHeader, internalId);
    }
    for (const question of questions) {
      const internalId = headerToIdMap.get(question.header);
      if (!internalId) {
        continue;
      }
      const chatQuestion = carousel.questions.find((q) => q.id === internalId);
      if (!chatQuestion) {
        continue;
      }
      if (chatQuestion.type === "multiSelect") {
        data[internalId] = { selectedValues: [], freeformValue: AUTOPILOT_ASK_USER_RESPONSE };
      } else if (chatQuestion.type === "singleSelect") {
        data[internalId] = { freeformValue: AUTOPILOT_ASK_USER_RESPONSE };
      } else {
        data[internalId] = AUTOPILOT_ASK_USER_RESPONSE;
      }
    }
    return data;
  }
  sendTelemetry(requestId, questionCount, answeredCount, skippedCount, freeTextCount, recommendedAvailableCount, recommendedSelectedCount, duration) {
    this.telemetryService.publicLog2("askQuestionsToolInvoked", {
      requestId,
      questionCount,
      answeredCount,
      skippedCount,
      freeTextCount,
      recommendedAvailableCount,
      recommendedSelectedCount,
      duration
    });
  }
};
AskQuestionsTool = __decorateClass([
  __decorateParam(0, IChatService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IConfigurationService)
], AskQuestionsTool);
export {
  AUTOPILOT_ASK_USER_RESPONSE,
  AskQuestionsTool,
  AskQuestionsToolData,
  AskQuestionsToolId,
  createAskQuestionsToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcdG9vbHNcXGJ1aWx0aW5Ub29sc1xcYXNrUXVlc3Rpb25zVG9vbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEsIElKU09OU2NoZW1hTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNoYXRRdWVzdGlvbiwgSUNoYXRRdWVzdGlvbkFuc3dlcnMsIElDaGF0UXVlc3Rpb25BbnN3ZXJWYWx1ZSwgSUNoYXRNdWx0aVNlbGVjdEFuc3dlciwgSUNoYXRTZXJ2aWNlLCBJQ2hhdFNpbmdsZVNlbGVjdEFuc3dlciwgSUNoYXRUb29sSW52b2NhdGlvbiB9IGZyb20gJy4uLy4uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YSB9IGZyb20gJy4uLy4uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRRdWVzdGlvbkNhcm91c2VsRGF0YS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RNb2RlbCB9IGZyb20gJy4uLy4uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiwgQ2hhdFBlcm1pc3Npb25MZXZlbCB9IGZyb20gJy4uLy4uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQ291bnRUb2tlbnNDYWxsYmFjaywgSVByZXBhcmVkVG9vbEludm9jYXRpb24sIElUb29sRGF0YSwgSVRvb2xJbXBsLCBJVG9vbEludm9jYXRpb24sIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgSVRvb2xSZXN1bHQsIFRvb2xEYXRhU291cmNlLCBUb29sUHJvZ3Jlc3MgfSBmcm9tICcuLi9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgcmFjZUNhbmNlbGxhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFRvb2xJZCB9IGZyb20gJy4uL3Rlcm1pbmFsVG9vbElkcy5qcyc7XG5cbi8qKlxuICogUmVzcG9uc2UgcmV0dXJuZWQgdG8gdGhlIG1vZGVsIHdoZW4gdGhlIHVzZXIgaXMgbm90IGF2YWlsYWJsZSAoYXV0b3BpbG90IG1vZGUpLlxuICovXG5leHBvcnQgY29uc3QgQVVUT1BJTE9UX0FTS19VU0VSX1JFU1BPTlNFID1cblx0J1RoZSB1c2VyIGlzIG5vdCBhdmFpbGFibGUgdG8gcmVzcG9uZCBhbmQgd2lsbCByZXZpZXcgeW91ciB3b3JrIGxhdGVyLiBXb3JrIGF1dG9ub21vdXNseSBhbmQgbWFrZSBnb29kIGRlY2lzaW9ucy4nO1xuXG4vLyBVc2UgYSBkaXN0aW5jdCBpZCB0byBhdm9pZCBjbGFzaGluZyB3aXRoIGV4dGVuc2lvbi1wcm92aWRlZCB0b29sc1xuZXhwb3J0IGNvbnN0IEFza1F1ZXN0aW9uc1Rvb2xJZCA9ICd2c2NvZGVfYXNrUXVlc3Rpb25zJztcblxuLy8gU29mdCBsaW1pdHMgYXJlIHVzZWQgaW4gdGhlIHNjaGVtYSB0byBndWlkZSB0aGUgbW9kZWxcbi8vIEhhcmQgbGltaXRzIGFyZSBtb3JlIGxlbmllbnQgYW5kIHVzZWQgdG8gdHJ1bmNhdGUgaWYgdGhlIG1vZGVsIG92ZXJzaG9vdHNcbi8vXG4vLyBFeGFtcGxlIHRleHQgYXQgZWFjaCBsaW1pdDpcbi8vIC0gaGVhZGVyIHNvZnQgKDUwIGNoYXJzKTogICAgICAgIFwiV2hpY2ggZGF0YWJhc2UgZW5naW5lIGRvIHlvdSB3YW50IHRvIHVzZSBmb3IgdGhpcz9cIlxuLy8gLSBoZWFkZXIgaGFyZCAoNzUgY2hhcnMpOiAgICAgICAgXCJXaGljaCBkYXRhYmFzZSBlbmdpbmUgYW5kIGNvbm5lY3Rpb24gcG9vbGluZyBzdHJhdGVneSBkbyB5b3Ugd2FudCB0byB1c2UgaGVyZT9cIlxuLy8gLSBxdWVzdGlvbiBzb2Z0ICgyMDAgY2hhcnMpOiAgICAgXCJXaGF0IHRlc3RpbmcgZnJhbWV3b3JrIHdvdWxkIHlvdSBsaWtlIHRvIHVzZSBmb3IgdGhpcyBwcm9qZWN0PyBDb25zaWRlciBmYWN0b3JzIGxpa2UgeW91ciB0ZWFtJ3MgZmFtaWxpYXJpdHksIGNvbW11bml0eSBzdXBwb3J0LCBhbmQgaW50ZWdyYXRpb24gd2l0aCB5b3VyIGV4aXN0aW5nIENJL0NEIHBpcGVsaW5lIHdoZW4gbWFraW5nIGEgY2hvaWNlLlwiXG5jb25zdCBTb2Z0TGltaXRzID0ge1xuXHRoZWFkZXI6IDUwLFxuXHRxdWVzdGlvbjogMjAwXG59IGFzIGNvbnN0O1xuXG5jb25zdCBIYXJkTGltaXRzID0ge1xuXHRoZWFkZXI6IDc1LFxufSBhcyBjb25zdDtcblxuZnVuY3Rpb24gdHJ1bmNhdGVUb0xpbWl0KHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQsIGxpbWl0OiBudW1iZXIpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHZhbHVlLmxlbmd0aCA+IGxpbWl0KSB7XG5cdFx0cmV0dXJuIHZhbHVlLnNsaWNlKDAsIGxpbWl0IC0gMykgKyAnLi4uJztcblx0fVxuXHRyZXR1cm4gdmFsdWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVF1ZXN0aW9uT3B0aW9uIHtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlY29tbWVuZGVkPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUXVlc3Rpb24ge1xuXHRyZWFkb25seSBoZWFkZXI6IHN0cmluZztcblx0cmVhZG9ubHkgcXVlc3Rpb246IHN0cmluZztcblx0cmVhZG9ubHkgbWVzc2FnZT86IHN0cmluZztcblx0cmVhZG9ubHkgbXVsdGlTZWxlY3Q/OiBib29sZWFuO1xuXHRyZWFkb25seSBvcHRpb25zPzogSVF1ZXN0aW9uT3B0aW9uW107XG5cdHJlYWRvbmx5IGFsbG93RnJlZWZvcm1JbnB1dD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFza1F1ZXN0aW9uc1BhcmFtcyB7XG5cdHJlYWRvbmx5IHF1ZXN0aW9uczogSVF1ZXN0aW9uW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVF1ZXN0aW9uQW5zd2VyIHtcblx0cmVhZG9ubHkgc2VsZWN0ZWQ6IHN0cmluZ1tdO1xuXHRyZWFkb25seSBmcmVlVGV4dDogc3RyaW5nIHwgbnVsbDtcblx0cmVhZG9ubHkgc2tpcHBlZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQW5zd2VyUmVzdWx0IHtcblx0cmVhZG9ubHkgYW5zd2VyczogUmVjb3JkPHN0cmluZywgSVF1ZXN0aW9uQW5zd2VyPjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUFza1F1ZXN0aW9uc1Rvb2xEYXRhKCk6IElUb29sRGF0YSB7XG5cdGNvbnN0IHF1ZXN0aW9uU2NoZW1hOiBJSlNPTlNjaGVtYSAmIHsgcHJvcGVydGllczogSUpTT05TY2hlbWFNYXAgfSA9IHtcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRoZWFkZXI6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBgU2hvcnQgaWRlbnRpZmllciBmb3IgdGhlIHF1ZXN0aW9uLiBNdXN0IGJlIHVuaXF1ZSBzbyBhbnN3ZXJzIGNhbiBiZSBtYXBwZWQgYmFjayB0byB0aGUgcXVlc3Rpb24uIE1heGltdW0gJHtTb2Z0TGltaXRzLmhlYWRlcn0gY2hhcmFjdGVycy5gLFxuXHRcdFx0XHRtYXhMZW5ndGg6IFNvZnRMaW1pdHMuaGVhZGVyXG5cdFx0XHR9LFxuXHRcdFx0cXVlc3Rpb246IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBgVGhlIHF1ZXN0aW9uIHRleHQgdG8gZGlzcGxheSB0byB0aGUgdXNlci4gS2VlcCBpdCBjb25jaXNlLCBpZGVhbGx5IG9uZSBzZW50ZW5jZS4gTWF4aW11bSAke1NvZnRMaW1pdHMucXVlc3Rpb259IGNoYXJhY3RlcnMuYCxcblx0XHRcdFx0bWF4TGVuZ3RoOiBTb2Z0TGltaXRzLnF1ZXN0aW9uXG5cdFx0XHR9LFxuXHRcdFx0bXVsdGlTZWxlY3Q6IHtcblx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ0FsbG93IHNlbGVjdGluZyBtdWx0aXBsZSBvcHRpb25zIHdoZW4gb3B0aW9ucyBhcmUgcHJvdmlkZWQuJ1xuXHRcdFx0fSxcblx0XHRcdGFsbG93RnJlZWZvcm1JbnB1dDoge1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnQWxsb3cgZnJlZWZvcm0gdGV4dCBhbnN3ZXJzIGluIGFkZGl0aW9uIHRvIG9wdGlvbiBzZWxlY3Rpb24uIERlZmF1bHRzIHRvIHRydWU7IHNldCB0byBmYWxzZSB0byByZXN0cmljdCB0byBwcmVkZWZpbmVkIG9wdGlvbnMgb25seS4nXG5cdFx0XHR9LFxuXHRcdFx0bWVzc2FnZToge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdPcHRpb25hbCBtYXJrZG93biBtZXNzYWdlIHRvIGRpc3BsYXkgYmVsb3cgdGhlIHF1ZXN0aW9uIHRleHQsIHByb3ZpZGluZyBhZGRpdGlvbmFsIGNvbnRleHQgb3IgZGV0YWlscy4nXG5cdFx0XHR9LFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ09wdGlvbmFsIGxpc3Qgb2Ygc2VsZWN0YWJsZSBhbnN3ZXJzLiBJZiBvbWl0dGVkLCB0aGUgcXVlc3Rpb24gaXMgZnJlZSB0ZXh0LicsXG5cdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0bGFiZWw6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRGlzcGxheSBsYWJlbCBhbmQgdmFsdWUgZm9yIHRoZSBvcHRpb24uJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ09wdGlvbmFsIHNlY29uZGFyeSB0ZXh0IHNob3duIHdpdGggdGhlIG9wdGlvbi4nXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0cmVjb21tZW5kZWQ6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ01hcmsgdGhpcyBvcHRpb24gYXMgdGhlIHJlY29tbWVuZGVkIGRlZmF1bHQuJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IFsnbGFiZWwnXVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRyZXF1aXJlZDogWydoZWFkZXInLCAncXVlc3Rpb24nXVxuXHR9O1xuXG5cdGNvbnN0IGlucHV0U2NoZW1hOiBJSlNPTlNjaGVtYSAmIHsgcHJvcGVydGllczogSUpTT05TY2hlbWFNYXAgfSA9IHtcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRxdWVzdGlvbnM6IHtcblx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdMaXN0IG9mIHF1ZXN0aW9ucyB0byBhc2sgdGhlIHVzZXIuIE9yZGVyIGlzIHByZXNlcnZlZC4nLFxuXHRcdFx0XHRpdGVtczogcXVlc3Rpb25TY2hlbWEsXG5cdFx0XHRcdG1pbkl0ZW1zOiAxXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRyZXF1aXJlZDogWydxdWVzdGlvbnMnXVxuXHR9O1xuXG5cdHJldHVybiB7XG5cdFx0aWQ6IEFza1F1ZXN0aW9uc1Rvb2xJZCxcblx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ2Fza1F1ZXN0aW9ucycsXG5cdFx0bGVnYWN5VG9vbFJlZmVyZW5jZUZ1bGxOYW1lczogW0Fza1F1ZXN0aW9uc1Rvb2xJZCwgJ3ZzY29kZS9hc2tRdWVzdGlvbnMnXSxcblx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogZmFsc2UsXG5cdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLnF1ZXN0aW9uLmlkKSxcblx0XHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ3Rvb2wuYXNrUXVlc3Rpb25zLmRpc3BsYXlOYW1lJywgJ0FzayBDbGFyaWZ5aW5nIFF1ZXN0aW9ucycpLFxuXHRcdHVzZXJEZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rvb2wuYXNrUXVlc3Rpb25zLnVzZXJEZXNjcmlwdGlvbicsICdBc2sgc3RydWN0dXJlZCBjbGFyaWZ5aW5nIHF1ZXN0aW9ucyB1c2luZyBzaW5nbGUgc2VsZWN0LCBtdWx0aS1zZWxlY3QsIG9yIGZyZWVmb3JtIGlucHV0cyB0byBjb2xsZWN0IHRhc2sgcmVxdWlyZW1lbnRzIGJlZm9yZSBwcm9jZWVkaW5nLicpLFxuXHRcdG1vZGVsRGVzY3JpcHRpb246ICdVc2UgdGhpcyB0b29sIHRvIGFzayB0aGUgdXNlciBhIHNtYWxsIG51bWJlciBvZiBjbGFyaWZ5aW5nIHF1ZXN0aW9ucyBiZWZvcmUgcHJvY2VlZGluZy4gUHJvdmlkZSB0aGUgcXVlc3Rpb25zIGFycmF5IHdpdGggY29uY2lzZSBoZWFkZXJzIGFuZCBwcm9tcHRzLiBVc2Ugb3B0aW9ucyBmb3IgZml4ZWQgY2hvaWNlcywgc2V0IG11bHRpU2VsZWN0IHdoZW4gbXVsdGlwbGUgc2VsZWN0aW9ucyBhcmUgYWxsb3dlZC4gVXNlcnMgY2FuIGFsd2F5cyBwcm92aWRlIGEgZnJlZWZvcm0gdGV4dCBhbnN3ZXIgYWxvbmdzaWRlIG9wdGlvbnMgdW5sZXNzIHlvdSBzZXQgYWxsb3dGcmVlZm9ybUlucHV0IHRvIGZhbHNlLicsXG5cdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRpbnB1dFNjaGVtYVxuXHR9O1xufVxuXG5leHBvcnQgY29uc3QgQXNrUXVlc3Rpb25zVG9vbERhdGE6IElUb29sRGF0YSA9IGNyZWF0ZUFza1F1ZXN0aW9uc1Rvb2xEYXRhKCk7XG5cbmV4cG9ydCBjbGFzcyBBc2tRdWVzdGlvbnNUb29sIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUb29sSW1wbCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ1NlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jIGludm9rZShpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIF9jb3VudFRva2VuczogQ291bnRUb2tlbnNDYWxsYmFjaywgcHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IHN0b3BXYXRjaCA9IFN0b3BXYXRjaC5jcmVhdGUodHJ1ZSk7XG5cdFx0Y29uc3QgcGFyYW1ldGVycyA9IGludm9jYXRpb24ucGFyYW1ldGVycyBhcyBJQXNrUXVlc3Rpb25zUGFyYW1zO1xuXHRcdGNvbnN0IHsgcXVlc3Rpb25zIH0gPSBwYXJhbWV0ZXJzO1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0Fza1F1ZXN0aW9uc1Rvb2xdIEludm9raW5nIHdpdGggJHtxdWVzdGlvbnM/Lmxlbmd0aCA/PyAwfSBxdWVzdGlvbihzKWApO1xuXG5cdFx0aWYgKCFxdWVzdGlvbnMgfHwgcXVlc3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdhc2tRdWVzdGlvbnNUb29sLm5vUXVlc3Rpb25zJywgJ05vIHF1ZXN0aW9ucyBwcm92aWRlZC4gVGhlIHF1ZXN0aW9ucyBhcnJheSBtdXN0IGNvbnRhaW4gYXQgbGVhc3Qgb25lIHF1ZXN0aW9uLicpKTtcblx0XHR9XG5cblx0XHRjb25zdCBjaGF0U2Vzc2lvblJlc291cmNlID0gaW52b2NhdGlvbi5jb250ZXh0Py5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0Y29uc3QgY2hhdFJlcXVlc3RJZCA9IGludm9jYXRpb24uY2hhdFJlcXVlc3RJZDtcblx0XHRjb25zdCB7IHJlcXVlc3QsIHNlc3Npb25SZXNvdXJjZSB9ID0gdGhpcy5nZXRSZXF1ZXN0KGNoYXRTZXNzaW9uUmVzb3VyY2UsIGNoYXRSZXF1ZXN0SWQpO1xuXG5cdFx0aWYgKCFzZXNzaW9uUmVzb3VyY2UgfHwgIXJlcXVlc3QpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbQXNrUXVlc3Rpb25zVG9vbF0gTWlzc2luZyBjaGF0IGNvbnRleHQ7IG1hcmtpbmcgYWxsIHF1ZXN0aW9ucyBhcyBza2lwcGVkLicpO1xuXHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlU2tpcHBlZFJlc3VsdChxdWVzdGlvbnMpO1xuXHRcdH1cblxuXHRcdC8vIEluIGF1dG9waWxvdCBtb2RlIG9yIHdoZW4gYXV0by1yZXBseSBpcyBlbmFibGVkLCB0aGUgdXNlciBpcyBub3QgYXZhaWxhYmxlIFx1MjAxNFxuXHRcdC8vIGF1dG8tcmVzcG9uZCBpbnN0ZWFkIG9mIGJsb2NraW5nLiBTdGlsbCBhcHBlbmQgYSBjb21wbGV0ZWQgY2Fyb3VzZWwgc28gdGhlXG5cdFx0Ly8gdXNlciBjYW4gc2VlIHdoYXQgd2FzIHNraXBwZWQuXG5cdFx0Y29uc3QgcmVzb2x2ZUlkID0gaW52b2NhdGlvbi5jaGF0U3RyZWFtVG9vbENhbGxJZCA/PyBpbnZvY2F0aW9uLmNhbGxJZDtcblx0XHRpZiAocmVxdWVzdC5tb2RlSW5mbz8ucGVybWlzc2lvbkxldmVsID09PSBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9waWxvdCB8fCB0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uQXV0b1JlcGx5KSkge1xuXHRcdFx0Y29uc3QgcmVhc29uID0gcmVxdWVzdC5tb2RlSW5mbz8ucGVybWlzc2lvbkxldmVsID09PSBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9waWxvdCA/ICdBdXRvcGlsb3QgbW9kZScgOiAnQXV0by1yZXBseSBlbmFibGVkJztcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBbQXNrUXVlc3Rpb25zVG9vbF0gJHtyZWFzb259OiBhdXRvLXJlc3BvbmRpbmcgdG8gcXVlc3Rpb25zYCk7XG5cdFx0XHRjb25zdCB7IGNhcm91c2VsLCBpZFRvSGVhZGVyTWFwIH0gPSB0aGlzLnRvUXVlc3Rpb25DYXJvdXNlbChxdWVzdGlvbnMsIHJlc29sdmVJZCk7XG5cdFx0XHRjYXJvdXNlbC50ZXJtaW5hbElkID0gdGhpcy5leHRyYWN0VGVybWluYWxJZChyZXF1ZXN0KTtcblx0XHRcdGNhcm91c2VsLmRhdGEgPSB0aGlzLmJ1aWxkQXV0b3BpbG90Q2Fyb3VzZWxBbnN3ZXJzKHF1ZXN0aW9ucywgY2Fyb3VzZWwsIGlkVG9IZWFkZXJNYXApO1xuXHRcdFx0Y2Fyb3VzZWwuaXNVc2VkID0gdHJ1ZTtcblx0XHRcdHRoaXMuY2hhdFNlcnZpY2UuYXBwZW5kUHJvZ3Jlc3MocmVxdWVzdCwgY2Fyb3VzZWwpO1xuXHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlQXV0b3BpbG90UmVzdWx0KHF1ZXN0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBjYXJvdXNlbCwgaWRUb0hlYWRlck1hcCB9ID0gdGhpcy50b1F1ZXN0aW9uQ2Fyb3VzZWwocXVlc3Rpb25zLCByZXNvbHZlSWQpO1xuXHRcdGNhcm91c2VsLnRlcm1pbmFsSWQgPSB0aGlzLmV4dHJhY3RUZXJtaW5hbElkKHJlcXVlc3QpO1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0Fza1F1ZXN0aW9uc1Rvb2xdIHJlcXVlc3Q9JHtyZXF1ZXN0LmlkfSB0ZXJtaW5hbEV4ZWN1dGlvbklkPSR7cmVxdWVzdC50ZXJtaW5hbEV4ZWN1dGlvbklkID8/ICd1bmRlZmluZWQnfSBjYXJvdXNlbC50ZXJtaW5hbElkPSR7Y2Fyb3VzZWwudGVybWluYWxJZCA/PyAndW5kZWZpbmVkJ31gKTtcblx0XHR0aGlzLmNoYXRTZXJ2aWNlLmFwcGVuZFByb2dyZXNzKHJlcXVlc3QsIGNhcm91c2VsKTtcblx0XHRjb25zdCBleHRlcm5hbEFuc3dlckxpc3RlbmVyID0gdGhpcy5jaGF0U2VydmljZS5vbkRpZFJlY2VpdmVRdWVzdGlvbkNhcm91c2VsQW5zd2VyKGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC5yZXNvbHZlSWQgIT09IGNhcm91c2VsLnJlc29sdmVJZCB8fCBjYXJvdXNlbC5pc1VzZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y2Fyb3VzZWwuZGlzbWlzcyhldmVudC5hbnN3ZXJzKTtcblx0XHR9KTtcblxuXHRcdGxldCBhbnN3ZXJSZXN1bHQ6IHsgYW5zd2VyczogSUNoYXRRdWVzdGlvbkFuc3dlcnMgfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0YW5zd2VyUmVzdWx0ID0gYXdhaXQgcmFjZUNhbmNlbGxhdGlvbihjYXJvdXNlbC5jb21wbGV0aW9uLnAsIHRva2VuKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgQ2FuY2VsbGF0aW9uRXJyb3IpIHtcblx0XHRcdFx0Y2Fyb3VzZWwuZGlzbWlzcyh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGV4dGVybmFsQW5zd2VyTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRpZiAoIWFuc3dlclJlc3VsdCkge1xuXHRcdFx0Y2Fyb3VzZWwuZGlzbWlzcyh1bmRlZmluZWQpO1xuXHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0fVxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiB0aGUgdXNlciB0eXBlZCBkaXJlY3RseSBpbiB0aGUgdGVybWluYWwgKGJ5cGFzc2luZyB0aGUgY2Fyb3VzZWwpLFxuXHRcdC8vIHRlbGwgdGhlIGFnZW50IHRvIHN0b3AgYXNraW5nIHF1ZXN0aW9ucyBhbmQgd2FpdCBmb3IgdGhlIGNvbW1hbmQgdG8gZmluaXNoLlxuXHRcdGlmIChjYXJvdXNlbC5kaXNtaXNzZWRCeVRlcm1pbmFsSW5wdXQgJiYgY2Fyb3VzZWwudGVybWluYWxJZCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFtBc2tRdWVzdGlvbnNUb29sXSBDYXJvdXNlbCBkaXNtaXNzZWQgYmVjYXVzZSB1c2VyIHR5cGVkIGRpcmVjdGx5IGluIHRlcm1pbmFsICR7Y2Fyb3VzZWwudGVybWluYWxJZH1gKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHRcdHZhbHVlOiBgVGhlIHVzZXIgaXMgcmVwbHlpbmcgdG8gdGhlIHRlcm1pbmFsIHByb21wdHMgZGlyZWN0bHkuIERvIG5vdCBhc2sgbW9yZSBxdWVzdGlvbnMgb3Igc2VuZCBpbnB1dCB0byB0aGUgdGVybWluYWwuIFlvdSB3aWxsIGJlIGF1dG9tYXRpY2FsbHkgbm90aWZpZWQgd2hlbiB0aGUgY29tbWFuZCBpbiB0ZXJtaW5hbCAke2Nhcm91c2VsLnRlcm1pbmFsSWR9IGNvbXBsZXRlcy5gXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IGxvY2FsaXplKCdhc2tRdWVzdGlvbnNUb29sLnByb2dyZXNzJywgJ0FuYWx5emluZyB5b3VyIGFuc3dlcnMuLi4nKSB9KTtcblxuXHRcdGNvbnN0IGNvbnZlcnRlZCA9IHRoaXMuY29udmVydENhcm91c2VsQW5zd2VycyhxdWVzdGlvbnMsIGFuc3dlclJlc3VsdD8uYW5zd2VycywgaWRUb0hlYWRlck1hcCk7XG5cdFx0Y29uc3QgeyBhbnN3ZXJlZENvdW50LCBza2lwcGVkQ291bnQsIGZyZWVUZXh0Q291bnQsIHJlY29tbWVuZGVkQXZhaWxhYmxlQ291bnQsIHJlY29tbWVuZGVkU2VsZWN0ZWRDb3VudCB9ID0gdGhpcy5jb2xsZWN0TWV0cmljcyhxdWVzdGlvbnMsIGNvbnZlcnRlZCk7XG5cblx0XHR0aGlzLnNlbmRUZWxlbWV0cnkoaW52b2NhdGlvbi5jaGF0UmVxdWVzdElkLCBxdWVzdGlvbnMubGVuZ3RoLCBhbnN3ZXJlZENvdW50LCBza2lwcGVkQ291bnQsIGZyZWVUZXh0Q291bnQsIHJlY29tbWVuZGVkQXZhaWxhYmxlQ291bnQsIHJlY29tbWVuZGVkU2VsZWN0ZWRDb3VudCwgc3RvcFdhdGNoLmVsYXBzZWQoKSk7XG5cblx0XHRjb25zdCB0b29sUmVzdWx0SnNvbiA9IEpTT04uc3RyaW5naWZ5KGNvbnZlcnRlZCk7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbQXNrUXVlc3Rpb25zVG9vbF0gUmV0dXJuaW5nIHRvb2wgcmVzdWx0IHdpdGggbWV0cmljczogcXVlc3Rpb25zPSR7cXVlc3Rpb25zLmxlbmd0aH0sIGFuc3dlcmVkPSR7YW5zd2VyZWRDb3VudH0sIHNraXBwZWQ9JHtza2lwcGVkQ291bnR9LCBmcmVlVGV4dD0ke2ZyZWVUZXh0Q291bnR9LCByZWNvbW1lbmRlZEF2YWlsYWJsZT0ke3JlY29tbWVuZGVkQXZhaWxhYmxlQ291bnR9LCByZWNvbW1lbmRlZFNlbGVjdGVkPSR7cmVjb21tZW5kZWRTZWxlY3RlZENvdW50fWApO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiB0b29sUmVzdWx0SnNvbiB9XVxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBwcmVwYXJlVG9vbEludm9jYXRpb24oY29udGV4dDogSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHBhcmFtZXRlcnMgPSBjb250ZXh0LnBhcmFtZXRlcnMgYXMgSUFza1F1ZXN0aW9uc1BhcmFtcztcblx0XHRjb25zdCB7IHF1ZXN0aW9ucyB9ID0gcGFyYW1ldGVycztcblxuXHRcdGlmICghcXVlc3Rpb25zIHx8IHF1ZXN0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnYXNrUXVlc3Rpb25zVG9vbC5ub1F1ZXN0aW9ucycsICdObyBxdWVzdGlvbnMgcHJvdmlkZWQuIFRoZSBxdWVzdGlvbnMgYXJyYXkgbXVzdCBjb250YWluIGF0IGxlYXN0IG9uZSBxdWVzdGlvbi4nKSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBxdWVzdGlvbiBvZiBxdWVzdGlvbnMpIHtcblx0XHRcdGlmIChxdWVzdGlvbi5vcHRpb25zICYmIHF1ZXN0aW9uLm9wdGlvbnMubGVuZ3RoID09PSAxICYmICFxdWVzdGlvbi5hbGxvd0ZyZWVmb3JtSW5wdXQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdhc2tRdWVzdGlvbnNUb29sLmludmFsaWRPcHRpb25zJywgJ1F1ZXN0aW9uIFwiezB9XCIgbXVzdCBoYXZlIGF0IGxlYXN0IHR3byBvcHRpb25zLCBvciBzZXQgYWxsb3dGcmVlZm9ybUlucHV0IHdoZW4gcHJvdmlkaW5nIGEgc2luZ2xlIG9wdGlvbiwgb3Igb21pdCBvcHRpb25zIGZvciBmcmVlIHRleHQgaW5wdXQuJywgcXVlc3Rpb24uaGVhZGVyKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcXVlc3Rpb25Db3VudCA9IHF1ZXN0aW9ucy5sZW5ndGg7XG5cdFx0Y29uc3QgaGVhZGVycyA9IHF1ZXN0aW9ucy5tYXAocSA9PiBxLmhlYWRlcikuam9pbignLCAnKTtcblx0XHRjb25zdCBtZXNzYWdlID0gcXVlc3Rpb25Db3VudCA9PT0gMVxuXHRcdFx0PyBsb2NhbGl6ZSgnYXNrUXVlc3Rpb25zVG9vbC5pbnZvY2F0aW9uLnNpbmdsZScsICdBc2tpbmcgYSBxdWVzdGlvbiAoezB9KScsIGhlYWRlcnMpXG5cdFx0XHQ6IGxvY2FsaXplKCdhc2tRdWVzdGlvbnNUb29sLmludm9jYXRpb24ubXVsdGlwbGUnLCAnQXNraW5nIHswfSBxdWVzdGlvbnMgKHsxfSknLCBxdWVzdGlvbkNvdW50LCBoZWFkZXJzKTtcblx0XHRjb25zdCBwYXN0TWVzc2FnZSA9IHF1ZXN0aW9uQ291bnQgPT09IDFcblx0XHRcdD8gbG9jYWxpemUoJ2Fza1F1ZXN0aW9uc1Rvb2wuaW52b2NhdGlvbi5zaW5nbGUucGFzdCcsICdBc2tlZCBhIHF1ZXN0aW9uICh7MH0pJywgaGVhZGVycylcblx0XHRcdDogbG9jYWxpemUoJ2Fza1F1ZXN0aW9uc1Rvb2wuaW52b2NhdGlvbi5tdWx0aXBsZS5wYXN0JywgJ0Fza2VkIHswfSBxdWVzdGlvbnMgKHsxfSknLCBxdWVzdGlvbkNvdW50LCBoZWFkZXJzKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKG1lc3NhZ2UpLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKHBhc3RNZXNzYWdlKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdldFJlcXVlc3QoY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBjaGF0UmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB7IHJlcXVlc3Q6IElDaGF0UmVxdWVzdE1vZGVsIHwgdW5kZWZpbmVkOyBzZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCB9IHtcblx0XHRpZiAoIWNoYXRTZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiB7IHJlcXVlc3Q6IHVuZGVmaW5lZCwgc2Vzc2lvblJlc291cmNlOiB1bmRlZmluZWQgfTtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRsZXQgcmVxdWVzdDogSUNoYXRSZXF1ZXN0TW9kZWwgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHQvLyBQcmVmZXIgYW4gZXhhY3QgbWF0Y2ggb24gY2hhdFJlcXVlc3RJZCB3aGVuIHBvc3NpYmxlXG5cdFx0XHRpZiAoY2hhdFJlcXVlc3RJZCkge1xuXHRcdFx0XHRyZXF1ZXN0ID0gbW9kZWwuZ2V0UmVxdWVzdHMoKS5maW5kKHIgPT4gci5pZCA9PT0gY2hhdFJlcXVlc3RJZCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBGYWxsIGJhY2sgdG8gdGhlIG1vc3QgcmVjZW50IHJlcXVlc3QgaW4gdGhlIHNlc3Npb24gaWYgd2UgY2FuJ3QgZmluZCBhIG1hdGNoXG5cdFx0XHRpZiAoIXJlcXVlc3QpIHtcblx0XHRcdFx0cmVxdWVzdCA9IG1vZGVsLmdldFJlcXVlc3RzKCkuYXQoLTEpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghcmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuIHsgcmVxdWVzdDogdW5kZWZpbmVkLCBzZXNzaW9uUmVzb3VyY2U6IGNoYXRTZXNzaW9uUmVzb3VyY2UgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyByZXF1ZXN0LCBzZXNzaW9uUmVzb3VyY2U6IGNoYXRTZXNzaW9uUmVzb3VyY2UgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyB0aGUgdGVybWluYWwgZXhlY3V0aW9uIElEIGZvciB0aGUgcmVxdWVzdC5cblx0ICogUHJlZmVyIHN0cnVjdHVyZWQgbWV0YWRhdGEgYW5kIGZhbGwgYmFjayB0byBsZWdhY3kgbWVzc2FnZSBwYXJzaW5nIGZvclxuXHQgKiBvbGQgc2Vzc2lvbnMgdGhhdCBtYXkgbm90IGNhcnJ5IHRoZSBtZXRhZGF0YSB5ZXQuXG5cdCAqIEFzIGEgZmluYWwgZmFsbGJhY2ssIHNlYXJjaCBjb21wbGV0ZWQgcnVuSW5UZXJtaW5hbCB0b29sIGludm9jYXRpb25zIGluXG5cdCAqIHRoZSByZXNwb25zZSBmb3IgdGhlIHRlcm1pbmFsIElELCBidXQgb25seSB3aGVuIHRoZSB0b29sIG91dHB1dCBpbmRpY2F0ZXNcblx0ICogdGhlIHRlcm1pbmFsIGlzIHN0aWxsIHJ1bm5pbmcgYW5kIHdhaXRpbmcgZm9yIGlucHV0IChmb3JlZ3JvdW5kL3RpbWVvdXRcblx0ICogcGF0aCB3aGVyZSB0aGUgbW9kZWwgY2FsbHMgYXNrX3F1ZXN0aW9ucyBmcm9tIHRoZSBzYW1lIHR1cm4gYXNcblx0ICogcnVuSW5UZXJtaW5hbCkuXG5cdCAqL1xuXHRwcml2YXRlIGV4dHJhY3RUZXJtaW5hbElkKHJlcXVlc3Q6IElDaGF0UmVxdWVzdE1vZGVsKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAocmVxdWVzdC50ZXJtaW5hbEV4ZWN1dGlvbklkKSB7XG5cdFx0XHRyZXR1cm4gcmVxdWVzdC50ZXJtaW5hbEV4ZWN1dGlvbklkO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1hdGNoID0gcmVxdWVzdC5tZXNzYWdlLnRleHQubWF0Y2goL1xcW1Rlcm1pbmFsICg/PHRlcm1JZD5cXFMrKSBub3RpZmljYXRpb246Lyk7XG5cdFx0aWYgKG1hdGNoPy5ncm91cHM/LnRlcm1JZCkge1xuXHRcdFx0cmV0dXJuIG1hdGNoLmdyb3Vwcy50ZXJtSWQ7XG5cdFx0fVxuXG5cdFx0Ly8gU2VhcmNoIGNvbXBsZXRlZCBydW5JblRlcm1pbmFsIHRvb2wgaW52b2NhdGlvbnMgaW4gdGhlIHJlc3BvbnNlXG5cdFx0Ly8gZm9yIHRoZSB0ZXJtaW5hbCBleGVjdXRpb24gSUQgKGNvdmVycyBmb3JlZ3JvdW5kL3RpbWVvdXQgcGF0aCkuXG5cdFx0Ly8gT25seSBtYXRjaCBvdXRwdXQgdGhhdCBleHBsaWNpdGx5IGluZGljYXRlcyB0aGUgdGVybWluYWwgaXMgc3RpbGxcblx0XHQvLyBydW5uaW5nIGFuZCB3YWl0aW5nIGZvciBpbnB1dDsgb3RoZXJ3aXNlIHRoZSBxdWVzdGlvbiBpcyB1bnJlbGF0ZWRcblx0XHQvLyB0byB0aGUgcHJpb3IgdGVybWluYWwgY29tbWFuZC5cblx0XHRjb25zdCByZXNwb25zZSA9IHJlcXVlc3QucmVzcG9uc2U7XG5cdFx0aWYgKHJlc3BvbnNlKSB7XG5cdFx0XHRjb25zdCBwYXJ0cyA9IHJlc3BvbnNlLnJlc3BvbnNlLnZhbHVlO1xuXHRcdFx0Zm9yIChsZXQgaSA9IHBhcnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdGNvbnN0IHBhcnQgPSBwYXJ0c1tpXTtcblx0XHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyAmJiBwYXJ0LnRvb2xJZCA9PT0gVGVybWluYWxUb29sSWQuUnVuSW5UZXJtaW5hbCkge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXRlID0gcGFydC5zdGF0ZS5nZXQoKTtcblx0XHRcdFx0XHRpZiAoc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ29tcGxldGVkICYmIHN0YXRlLmNvbnRlbnRGb3JNb2RlbCkge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHN0YXRlLmNvbnRlbnRGb3JNb2RlbCkge1xuXHRcdFx0XHRcdFx0XHRpZiAoaXRlbS5raW5kID09PSAndGV4dCcpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBpZE1hdGNoID0gaXRlbS52YWx1ZS5tYXRjaCgvKD86cnVubmluZyBpbiB0ZXJtaW5hbCBJRHxtYXkgc3RpbGwgYmUgcnVubmluZyBpbiB0ZXJtaW5hbCBJRCkgKFswLTlhLWZBLUYtXSspLyk7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGlkTWF0Y2gpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiBpZE1hdGNoWzFdO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHRvUXVlc3Rpb25DYXJvdXNlbChxdWVzdGlvbnM6IElRdWVzdGlvbltdLCByZXNvbHZlSWQ/OiBzdHJpbmcpOiB7IGNhcm91c2VsOiBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGE7IGlkVG9IZWFkZXJNYXA6IE1hcDxzdHJpbmcsIHN0cmluZz4gfSB7XG5cdFx0Y29uc3QgaWRUb0hlYWRlck1hcCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0Y29uc3QgY2Fyb3VzZWxSZXNvbHZlSWQgPSByZXNvbHZlSWQgPz8gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgbWFwcGVkUXVlc3Rpb25zID0gcXVlc3Rpb25zLm1hcCgocXVlc3Rpb24sIGluZGV4KSA9PiB0aGlzLnRvQ2hhdFF1ZXN0aW9uKHF1ZXN0aW9uLCBpZFRvSGVhZGVyTWFwLCBjYXJvdXNlbFJlc29sdmVJZCwgaW5kZXgpKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2Fyb3VzZWw6IG5ldyBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEobWFwcGVkUXVlc3Rpb25zLCB0cnVlLCBjYXJvdXNlbFJlc29sdmVJZCksXG5cdFx0XHRpZFRvSGVhZGVyTWFwXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgdG9DaGF0UXVlc3Rpb24ocXVlc3Rpb246IElRdWVzdGlvbiwgaWRUb0hlYWRlck1hcDogTWFwPHN0cmluZywgc3RyaW5nPiwgcmVzb2x2ZUlkOiBzdHJpbmcsIGluZGV4OiBudW1iZXIpOiBJQ2hhdFF1ZXN0aW9uIHtcblx0XHRsZXQgdHlwZTogSUNoYXRRdWVzdGlvblsndHlwZSddO1xuXHRcdGlmICghcXVlc3Rpb24ub3B0aW9ucyB8fCBxdWVzdGlvbi5vcHRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dHlwZSA9ICd0ZXh0Jztcblx0XHR9IGVsc2UgaWYgKHF1ZXN0aW9uLm11bHRpU2VsZWN0KSB7XG5cdFx0XHR0eXBlID0gJ211bHRpU2VsZWN0Jztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dHlwZSA9ICdzaW5nbGVTZWxlY3QnO1xuXHRcdH1cblxuXHRcdGxldCBkZWZhdWx0VmFsdWU6IHN0cmluZyB8IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChxdWVzdGlvbi5vcHRpb25zKSB7XG5cdFx0XHRjb25zdCByZWNvbW1lbmRlZE9wdGlvbnMgPSBxdWVzdGlvbi5vcHRpb25zLmZpbHRlcihvcHQgPT4gb3B0LnJlY29tbWVuZGVkKTtcblx0XHRcdGlmIChyZWNvbW1lbmRlZE9wdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRkZWZhdWx0VmFsdWUgPSBxdWVzdGlvbi5tdWx0aVNlbGVjdCA/IHJlY29tbWVuZGVkT3B0aW9ucy5tYXAob3B0ID0+IG9wdC5sYWJlbCkgOiByZWNvbW1lbmRlZE9wdGlvbnNbMF0ubGFiZWw7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVXNlIGEgc3RhYmxlIFVVSUQgYXMgdGhlIGludGVybmFsIElEIHRvIGF2b2lkIGNvbGxpc2lvbnMgd2hlbiB0cnVuY2F0aW5nIGhlYWRlcnNcblx0XHQvLyBUaGUgb3JpZ2luYWwgaGVhZGVyIGlzIHByZXNlcnZlZCBpbiBpZFRvSGVhZGVyTWFwIGZvciBhbnN3ZXIgY29ycmVsYXRpb25cblx0XHRjb25zdCBpbnRlcm5hbElkID0gYCR7cmVzb2x2ZUlkfToke2luZGV4fWA7XG5cdFx0aWRUb0hlYWRlck1hcC5zZXQoaW50ZXJuYWxJZCwgcXVlc3Rpb24uaGVhZGVyKTtcblxuXHRcdC8vIFRydW5jYXRlIGhlYWRlciBmb3IgZGlzcGxheSBvbmx5XG5cdFx0Y29uc3QgZGlzcGxheVRpdGxlID0gdHJ1bmNhdGVUb0xpbWl0KHF1ZXN0aW9uLmhlYWRlciwgSGFyZExpbWl0cy5oZWFkZXIpID8/IHF1ZXN0aW9uLmhlYWRlcjtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogaW50ZXJuYWxJZCxcblx0XHRcdHR5cGUsXG5cdFx0XHR0aXRsZTogZGlzcGxheVRpdGxlLFxuXHRcdFx0bWVzc2FnZTogcXVlc3Rpb24ucXVlc3Rpb24sXG5cdFx0XHRkZXRhaWxlZE1lc3NhZ2U6IHF1ZXN0aW9uLm1lc3NhZ2UsXG5cdFx0XHRvcHRpb25zOiBxdWVzdGlvbi5vcHRpb25zPy5tYXAob3B0ID0+ICh7XG5cdFx0XHRcdGlkOiBvcHQubGFiZWwsXG5cdFx0XHRcdGxhYmVsOiBvcHQuZGVzY3JpcHRpb24gPyBgJHtvcHQubGFiZWx9IC0gJHtvcHQuZGVzY3JpcHRpb259YCA6IG9wdC5sYWJlbCxcblx0XHRcdFx0dmFsdWU6IG9wdC5sYWJlbFxuXHRcdFx0fSkpLFxuXHRcdFx0ZGVmYXVsdFZhbHVlLFxuXHRcdFx0YWxsb3dGcmVlZm9ybUlucHV0OiBxdWVzdGlvbi5hbGxvd0ZyZWVmb3JtSW5wdXQgPz8gdHJ1ZVxuXHRcdH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgY29udmVydENhcm91c2VsQW5zd2VycyhxdWVzdGlvbnM6IElRdWVzdGlvbltdLCBjYXJvdXNlbEFuc3dlcnM6IElDaGF0UXVlc3Rpb25BbnN3ZXJzIHwgdW5kZWZpbmVkLCBpZFRvSGVhZGVyTWFwOiBNYXA8c3RyaW5nLCBzdHJpbmc+KTogSUFuc3dlclJlc3VsdCB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJQW5zd2VyUmVzdWx0ID0geyBhbnN3ZXJzOiB7fSB9O1xuXG5cdFx0aWYgKGNhcm91c2VsQW5zd2Vycykge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbQXNrUXVlc3Rpb25zVG9vbF0gQ2Fyb3VzZWwgYW5zd2VyIGtleXM6ICR7T2JqZWN0LmtleXMoY2Fyb3VzZWxBbnN3ZXJzKS5qb2luKCcsICcpfWApO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbQXNrUXVlc3Rpb25zVG9vbF0gUXVlc3Rpb24gaGVhZGVyczogJHtxdWVzdGlvbnMubWFwKHEgPT4gcS5oZWFkZXIpLmpvaW4oJywgJyl9YCk7XG5cdFx0fVxuXG5cdFx0Ly8gQnVpbGQgYSByZXZlcnNlIG1hcDogb3JpZ2luYWwgaGVhZGVyIC0+IGludGVybmFsIElEXG5cdFx0Y29uc3QgaGVhZGVyVG9JZE1hcCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBbaW50ZXJuYWxJZCwgb3JpZ2luYWxIZWFkZXJdIG9mIGlkVG9IZWFkZXJNYXApIHtcblx0XHRcdGhlYWRlclRvSWRNYXAuc2V0KG9yaWdpbmFsSGVhZGVyLCBpbnRlcm5hbElkKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHF1ZXN0aW9uIG9mIHF1ZXN0aW9ucykge1xuXHRcdFx0aWYgKCFjYXJvdXNlbEFuc3dlcnMpIHtcblx0XHRcdFx0cmVzdWx0LmFuc3dlcnNbcXVlc3Rpb24uaGVhZGVyXSA9IHtcblx0XHRcdFx0XHRzZWxlY3RlZDogW10sXG5cdFx0XHRcdFx0ZnJlZVRleHQ6IG51bGwsXG5cdFx0XHRcdFx0c2tpcHBlZDogdHJ1ZVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTG9vayB1cCB0aGUgYW5zd2VyIHVzaW5nIHRoZSBpbnRlcm5hbCBJRCB0aGF0IHdhcyB1c2VkIGluIHRoZSBjYXJvdXNlbFxuXHRcdFx0Y29uc3QgaW50ZXJuYWxJZCA9IGhlYWRlclRvSWRNYXAuZ2V0KHF1ZXN0aW9uLmhlYWRlcik7XG5cdFx0XHRjb25zdCBhbnN3ZXI6IElDaGF0UXVlc3Rpb25BbnN3ZXJWYWx1ZSB8IHVuZGVmaW5lZCA9IGludGVybmFsSWQgPyBjYXJvdXNlbEFuc3dlcnNbaW50ZXJuYWxJZF0gOiB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtBc2tRdWVzdGlvbnNUb29sXSBQcm9jZXNzaW5nIHF1ZXN0aW9uIFwiJHtxdWVzdGlvbi5oZWFkZXJ9XCIgKGludGVybmFsIElEOiAke2ludGVybmFsSWR9KSwgcmF3IGFuc3dlcjogJHtKU09OLnN0cmluZ2lmeShhbnN3ZXIpfSwgdHlwZTogJHt0eXBlb2YgYW5zd2VyfWApO1xuXG5cdFx0XHRpZiAoYW5zd2VyID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmVzdWx0LmFuc3dlcnNbcXVlc3Rpb24uaGVhZGVyXSA9IHtcblx0XHRcdFx0XHRzZWxlY3RlZDogW10sXG5cdFx0XHRcdFx0ZnJlZVRleHQ6IG51bGwsXG5cdFx0XHRcdFx0c2tpcHBlZDogdHJ1ZVxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgYW5zd2VyID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRpZiAocXVlc3Rpb24ub3B0aW9ucz8uc29tZShvcHQgPT4gb3B0LmxhYmVsID09PSBhbnN3ZXIpKSB7XG5cdFx0XHRcdFx0cmVzdWx0LmFuc3dlcnNbcXVlc3Rpb24uaGVhZGVyXSA9IHtcblx0XHRcdFx0XHRcdHNlbGVjdGVkOiBbYW5zd2VyXSxcblx0XHRcdFx0XHRcdGZyZWVUZXh0OiBudWxsLFxuXHRcdFx0XHRcdFx0c2tpcHBlZDogZmFsc2Vcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdC5hbnN3ZXJzW3F1ZXN0aW9uLmhlYWRlcl0gPSB7XG5cdFx0XHRcdFx0XHRzZWxlY3RlZDogW10sXG5cdFx0XHRcdFx0XHRmcmVlVGV4dDogYW5zd2VyLFxuXHRcdFx0XHRcdFx0c2tpcHBlZDogZmFsc2Vcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoYW5zd2VyKSkge1xuXHRcdFx0XHRyZXN1bHQuYW5zd2Vyc1txdWVzdGlvbi5oZWFkZXJdID0ge1xuXHRcdFx0XHRcdHNlbGVjdGVkOiBhbnN3ZXIubWFwKGEgPT4gU3RyaW5nKGEpKSxcblx0XHRcdFx0XHRmcmVlVGV4dDogbnVsbCxcblx0XHRcdFx0XHRza2lwcGVkOiBmYWxzZVxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgYW5zd2VyID09PSAnb2JqZWN0JyAmJiBoYXNLZXkoYW5zd2VyLCB7IHNlbGVjdGVkVmFsdWVzOiB0cnVlIH0pKSB7XG5cdFx0XHRcdGNvbnN0IHsgc2VsZWN0ZWRWYWx1ZXMsIGZyZWVmb3JtVmFsdWUgfSA9IGFuc3dlciBhcyBJQ2hhdE11bHRpU2VsZWN0QW5zd2VyO1xuXHRcdFx0XHRyZXN1bHQuYW5zd2Vyc1txdWVzdGlvbi5oZWFkZXJdID0ge1xuXHRcdFx0XHRcdHNlbGVjdGVkOiBzZWxlY3RlZFZhbHVlcyxcblx0XHRcdFx0XHRmcmVlVGV4dDogZnJlZWZvcm1WYWx1ZSA/PyBudWxsLFxuXHRcdFx0XHRcdHNraXBwZWQ6IGZhbHNlXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBhbnN3ZXIgPT09ICdvYmplY3QnICYmIChoYXNLZXkoYW5zd2VyLCB7IHNlbGVjdGVkVmFsdWU6IHRydWUgfSkgfHwgaGFzS2V5KGFuc3dlciwgeyBmcmVlZm9ybVZhbHVlOiB0cnVlIH0pKSkge1xuXHRcdFx0XHRjb25zdCB7IHNlbGVjdGVkVmFsdWUsIGZyZWVmb3JtVmFsdWUgfSA9IGFuc3dlciBhcyBJQ2hhdFNpbmdsZVNlbGVjdEFuc3dlcjtcblx0XHRcdFx0aWYgKGZyZWVmb3JtVmFsdWUpIHtcblx0XHRcdFx0XHRyZXN1bHQuYW5zd2Vyc1txdWVzdGlvbi5oZWFkZXJdID0ge1xuXHRcdFx0XHRcdFx0c2VsZWN0ZWQ6IFtdLFxuXHRcdFx0XHRcdFx0ZnJlZVRleHQ6IGZyZWVmb3JtVmFsdWUsXG5cdFx0XHRcdFx0XHRza2lwcGVkOiBmYWxzZVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0gZWxzZSBpZiAoc2VsZWN0ZWRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0aWYgKHF1ZXN0aW9uLm9wdGlvbnM/LnNvbWUob3B0ID0+IG9wdC5sYWJlbCA9PT0gc2VsZWN0ZWRWYWx1ZSkpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5hbnN3ZXJzW3F1ZXN0aW9uLmhlYWRlcl0gPSB7XG5cdFx0XHRcdFx0XHRcdHNlbGVjdGVkOiBbc2VsZWN0ZWRWYWx1ZV0sXG5cdFx0XHRcdFx0XHRcdGZyZWVUZXh0OiBudWxsLFxuXHRcdFx0XHRcdFx0XHRza2lwcGVkOiBmYWxzZVxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVzdWx0LmFuc3dlcnNbcXVlc3Rpb24uaGVhZGVyXSA9IHtcblx0XHRcdFx0XHRcdFx0c2VsZWN0ZWQ6IFtdLFxuXHRcdFx0XHRcdFx0XHRmcmVlVGV4dDogc2VsZWN0ZWRWYWx1ZSxcblx0XHRcdFx0XHRcdFx0c2tpcHBlZDogZmFsc2Vcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdC5hbnN3ZXJzW3F1ZXN0aW9uLmhlYWRlcl0gPSB7XG5cdFx0XHRcdFx0XHRzZWxlY3RlZDogW10sXG5cdFx0XHRcdFx0XHRmcmVlVGV4dDogbnVsbCxcblx0XHRcdFx0XHRcdHNraXBwZWQ6IHRydWVcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0Fza1F1ZXN0aW9uc1Rvb2xdIFVua25vd24gYW5zd2VyIGZvcm1hdCBmb3IgXCIke3F1ZXN0aW9uLmhlYWRlcn1cIjogJHtKU09OLnN0cmluZ2lmeShhbnN3ZXIpfWApO1xuXHRcdFx0XHRyZXN1bHQuYW5zd2Vyc1txdWVzdGlvbi5oZWFkZXJdID0ge1xuXHRcdFx0XHRcdHNlbGVjdGVkOiBbXSxcblx0XHRcdFx0XHRmcmVlVGV4dDogbnVsbCxcblx0XHRcdFx0XHRza2lwcGVkOiB0cnVlXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgY29sbGVjdE1ldHJpY3MocXVlc3Rpb25zOiBJUXVlc3Rpb25bXSwgcmVzdWx0OiBJQW5zd2VyUmVzdWx0KTogeyBhbnN3ZXJlZENvdW50OiBudW1iZXI7IHNraXBwZWRDb3VudDogbnVtYmVyOyBmcmVlVGV4dENvdW50OiBudW1iZXI7IHJlY29tbWVuZGVkQXZhaWxhYmxlQ291bnQ6IG51bWJlcjsgcmVjb21tZW5kZWRTZWxlY3RlZENvdW50OiBudW1iZXIgfSB7XG5cdFx0Y29uc3QgYW5zd2VycyA9IE9iamVjdC52YWx1ZXMocmVzdWx0LmFuc3dlcnMpO1xuXHRcdGNvbnN0IGFuc3dlcmVkQ291bnQgPSBhbnN3ZXJzLmZpbHRlcihhID0+ICFhLnNraXBwZWQpLmxlbmd0aDtcblx0XHRjb25zdCBza2lwcGVkQ291bnQgPSBhbnN3ZXJzLmZpbHRlcihhID0+IGEuc2tpcHBlZCkubGVuZ3RoO1xuXHRcdGNvbnN0IGZyZWVUZXh0Q291bnQgPSBhbnN3ZXJzLmZpbHRlcihhID0+IGEuZnJlZVRleHQgIT09IG51bGwpLmxlbmd0aDtcblx0XHRjb25zdCByZWNvbW1lbmRlZEF2YWlsYWJsZUNvdW50ID0gcXVlc3Rpb25zLmZpbHRlcihxID0+IHEub3B0aW9ucz8uc29tZShvcHQgPT4gb3B0LnJlY29tbWVuZGVkKSkubGVuZ3RoO1xuXHRcdGNvbnN0IHJlY29tbWVuZGVkU2VsZWN0ZWRDb3VudCA9IHF1ZXN0aW9ucy5maWx0ZXIocSA9PiB7XG5cdFx0XHRjb25zdCBhbnN3ZXIgPSByZXN1bHQuYW5zd2Vyc1txLmhlYWRlcl07XG5cdFx0XHRjb25zdCByZWNvbW1lbmRlZE9wdGlvbiA9IHEub3B0aW9ucz8uZmluZChvcHQgPT4gb3B0LnJlY29tbWVuZGVkKTtcblx0XHRcdHJldHVybiBhbnN3ZXIgJiYgIWFuc3dlci5za2lwcGVkICYmIHJlY29tbWVuZGVkT3B0aW9uICYmIGFuc3dlci5zZWxlY3RlZC5pbmNsdWRlcyhyZWNvbW1lbmRlZE9wdGlvbi5sYWJlbCk7XG5cdFx0fSkubGVuZ3RoO1xuXHRcdHJldHVybiB7IGFuc3dlcmVkQ291bnQsIHNraXBwZWRDb3VudCwgZnJlZVRleHRDb3VudCwgcmVjb21tZW5kZWRBdmFpbGFibGVDb3VudCwgcmVjb21tZW5kZWRTZWxlY3RlZENvdW50IH07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVNraXBwZWRSZXN1bHQocXVlc3Rpb25zOiBJUXVlc3Rpb25bXSk6IElUb29sUmVzdWx0IHtcblx0XHRjb25zdCBza2lwcGVkQW5zd2VyczogUmVjb3JkPHN0cmluZywgSVF1ZXN0aW9uQW5zd2VyPiA9IHt9O1xuXHRcdGZvciAoY29uc3QgcXVlc3Rpb24gb2YgcXVlc3Rpb25zKSB7XG5cdFx0XHRza2lwcGVkQW5zd2Vyc1txdWVzdGlvbi5oZWFkZXJdID0geyBzZWxlY3RlZDogW10sIGZyZWVUZXh0OiBudWxsLCBza2lwcGVkOiB0cnVlIH07XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiBKU09OLnN0cmluZ2lmeSh7IGFuc3dlcnM6IHNraXBwZWRBbnN3ZXJzIH0pIH1dXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQXV0b3BpbG90UmVzdWx0KHF1ZXN0aW9uczogSVF1ZXN0aW9uW10pOiBJVG9vbFJlc3VsdCB7XG5cdFx0Y29uc3QgYW5zd2VyczogUmVjb3JkPHN0cmluZywgSVF1ZXN0aW9uQW5zd2VyPiA9IHt9O1xuXHRcdGZvciAoY29uc3QgcXVlc3Rpb24gb2YgcXVlc3Rpb25zKSB7XG5cdFx0XHQvLyBJbiBhdXRvcGlsb3QgbW9kZSB0aGUgdXNlciBpcyBub3QgYXZhaWxhYmxlIHRvIHJlc3BvbmQuIERvIG5vdFxuXHRcdFx0Ly8gYXV0by1zZWxlY3QgYW55IG9wdGlvbiBcdTIwMTQgaW5zdGVhZCBpbnN0cnVjdCB0aGUgbW9kZWwgdG8gbWFrZSBpdHMgb3duXG5cdFx0XHQvLyBkZWNpc2lvbiByZWdhcmRsZXNzIG9mIHRoZSBxdWVzdGlvbiB0eXBlLlxuXHRcdFx0YW5zd2Vyc1txdWVzdGlvbi5oZWFkZXJdID0ge1xuXHRcdFx0XHRzZWxlY3RlZDogW10sXG5cdFx0XHRcdGZyZWVUZXh0OiBBVVRPUElMT1RfQVNLX1VTRVJfUkVTUE9OU0UsXG5cdFx0XHRcdHNraXBwZWQ6IGZhbHNlLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6IEpTT04uc3RyaW5naWZ5KHsgYW5zd2VycyB9IHNhdGlzZmllcyBJQW5zd2VyUmVzdWx0KSB9XVxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGQgY2Fyb3VzZWwgYW5zd2VyIGRhdGEga2V5ZWQgYnkgY2Fyb3VzZWwgcXVlc3Rpb24gSURzIGZvciByZW5kZXJpbmdcblx0ICogdGhlIGNvbXBsZXRlZCBzdW1tYXJ5IGluIHRoZSBVSSBkdXJpbmcgYXV0b3BpbG90IG1vZGUuXG5cdCAqL1xuXHRwcml2YXRlIGJ1aWxkQXV0b3BpbG90Q2Fyb3VzZWxBbnN3ZXJzKHF1ZXN0aW9uczogSVF1ZXN0aW9uW10sIGNhcm91c2VsOiBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEsIGlkVG9IZWFkZXJNYXA6IE1hcDxzdHJpbmcsIHN0cmluZz4pOiBJQ2hhdFF1ZXN0aW9uQW5zd2VycyB7XG5cdFx0Y29uc3QgZGF0YTogSUNoYXRRdWVzdGlvbkFuc3dlcnMgPSB7fTtcblx0XHQvLyBCdWlsZCByZXZlcnNlIG1hcDogb3JpZ2luYWwgaGVhZGVyIC0+IGludGVybmFsIGNhcm91c2VsIHF1ZXN0aW9uIElEXG5cdFx0Y29uc3QgaGVhZGVyVG9JZE1hcCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBbaW50ZXJuYWxJZCwgb3JpZ2luYWxIZWFkZXJdIG9mIGlkVG9IZWFkZXJNYXApIHtcblx0XHRcdGhlYWRlclRvSWRNYXAuc2V0KG9yaWdpbmFsSGVhZGVyLCBpbnRlcm5hbElkKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHF1ZXN0aW9uIG9mIHF1ZXN0aW9ucykge1xuXHRcdFx0Y29uc3QgaW50ZXJuYWxJZCA9IGhlYWRlclRvSWRNYXAuZ2V0KHF1ZXN0aW9uLmhlYWRlcik7XG5cdFx0XHRpZiAoIWludGVybmFsSWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNoYXRRdWVzdGlvbiA9IGNhcm91c2VsLnF1ZXN0aW9ucy5maW5kKHEgPT4gcS5pZCA9PT0gaW50ZXJuYWxJZCk7XG5cdFx0XHRpZiAoIWNoYXRRdWVzdGlvbikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRG8gbm90IGF1dG8tc2VsZWN0IGFueSBvcHRpb24gaW4gYXV0b3BpbG90IG1vZGUgXHUyMDE0IHNob3cgdGhlXG5cdFx0XHQvLyBcInVzZXIgaXMgbm90IGF2YWlsYWJsZVwiIHJlc3BvbnNlIGFzIHRoZSBhbnN3ZXIgZm9yIGFsbCBxdWVzdGlvbiB0eXBlcy5cblx0XHRcdGlmIChjaGF0UXVlc3Rpb24udHlwZSA9PT0gJ211bHRpU2VsZWN0Jykge1xuXHRcdFx0XHRkYXRhW2ludGVybmFsSWRdID0geyBzZWxlY3RlZFZhbHVlczogW10sIGZyZWVmb3JtVmFsdWU6IEFVVE9QSUxPVF9BU0tfVVNFUl9SRVNQT05TRSB9O1xuXHRcdFx0fSBlbHNlIGlmIChjaGF0UXVlc3Rpb24udHlwZSA9PT0gJ3NpbmdsZVNlbGVjdCcpIHtcblx0XHRcdFx0ZGF0YVtpbnRlcm5hbElkXSA9IHsgZnJlZWZvcm1WYWx1ZTogQVVUT1BJTE9UX0FTS19VU0VSX1JFU1BPTlNFIH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkYXRhW2ludGVybmFsSWRdID0gQVVUT1BJTE9UX0FTS19VU0VSX1JFU1BPTlNFO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBkYXRhO1xuXHR9XG5cblx0cHJpdmF0ZSBzZW5kVGVsZW1ldHJ5KHJlcXVlc3RJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBxdWVzdGlvbkNvdW50OiBudW1iZXIsIGFuc3dlcmVkQ291bnQ6IG51bWJlciwgc2tpcHBlZENvdW50OiBudW1iZXIsIGZyZWVUZXh0Q291bnQ6IG51bWJlciwgcmVjb21tZW5kZWRBdmFpbGFibGVDb3VudDogbnVtYmVyLCByZWNvbW1lbmRlZFNlbGVjdGVkQ291bnQ6IG51bWJlciwgZHVyYXRpb246IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEFza1F1ZXN0aW9uc1Rvb2xJbnZva2VkRXZlbnQsIEFza1F1ZXN0aW9uc1Rvb2xJbnZva2VkQ2xhc3NpZmljYXRpb24+KCdhc2tRdWVzdGlvbnNUb29sSW52b2tlZCcsIHtcblx0XHRcdHJlcXVlc3RJZCxcblx0XHRcdHF1ZXN0aW9uQ291bnQsXG5cdFx0XHRhbnN3ZXJlZENvdW50LFxuXHRcdFx0c2tpcHBlZENvdW50LFxuXHRcdFx0ZnJlZVRleHRDb3VudCxcblx0XHRcdHJlY29tbWVuZGVkQXZhaWxhYmxlQ291bnQsXG5cdFx0XHRyZWNvbW1lbmRlZFNlbGVjdGVkQ291bnQsXG5cdFx0XHRkdXJhdGlvbixcblx0XHR9KTtcblx0fVxufVxuXG50eXBlIEFza1F1ZXN0aW9uc1Rvb2xJbnZva2VkRXZlbnQgPSB7XG5cdHJlcXVlc3RJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRxdWVzdGlvbkNvdW50OiBudW1iZXI7XG5cdGFuc3dlcmVkQ291bnQ6IG51bWJlcjtcblx0c2tpcHBlZENvdW50OiBudW1iZXI7XG5cdGZyZWVUZXh0Q291bnQ6IG51bWJlcjtcblx0cmVjb21tZW5kZWRBdmFpbGFibGVDb3VudDogbnVtYmVyO1xuXHRyZWNvbW1lbmRlZFNlbGVjdGVkQ291bnQ6IG51bWJlcjtcblx0ZHVyYXRpb246IG51bWJlcjtcbn07XG5cbnR5cGUgQXNrUXVlc3Rpb25zVG9vbEludm9rZWRDbGFzc2lmaWNhdGlvbiA9IHtcblx0cmVxdWVzdElkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGlkIG9mIHRoZSBjdXJyZW50IHJlcXVlc3QgdHVybi4nIH07XG5cdHF1ZXN0aW9uQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUaGUgdG90YWwgbnVtYmVyIG9mIHF1ZXN0aW9ucyBhc2tlZCcgfTtcblx0YW5zd2VyZWRDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RoZSBudW1iZXIgb2YgcXVlc3Rpb25zIHRoYXQgd2VyZSBhbnN3ZXJlZCcgfTtcblx0c2tpcHBlZENvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnVGhlIG51bWJlciBvZiBxdWVzdGlvbnMgdGhhdCB3ZXJlIHNraXBwZWQnIH07XG5cdGZyZWVUZXh0Q291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUaGUgbnVtYmVyIG9mIHF1ZXN0aW9ucyBhbnN3ZXJlZCB3aXRoIGZyZWUgdGV4dCBpbnB1dCcgfTtcblx0cmVjb21tZW5kZWRBdmFpbGFibGVDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RoZSBudW1iZXIgb2YgcXVlc3Rpb25zIHRoYXQgaGFkIGEgcmVjb21tZW5kZWQgb3B0aW9uJyB9O1xuXHRyZWNvbW1lbmRlZFNlbGVjdGVkQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUaGUgbnVtYmVyIG9mIHF1ZXN0aW9ucyB3aGVyZSB0aGUgdXNlciBzZWxlY3RlZCB0aGUgcmVjb21tZW5kZWQgb3B0aW9uJyB9O1xuXHRkdXJhdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RoZSB0b3RhbCB0aW1lIGluIG1pbGxpc2Vjb25kcyB0byBjb21wbGV0ZSBhbGwgcXVlc3Rpb25zJyB9O1xuXHRvd25lcjogJ2RpZ2l0YXJhbGQnO1xuXHRjb21tZW50OiAnVHJhY2tzIHVzYWdlIG9mIHRoZSBBc2tRdWVzdGlvbnMgdG9vbCBmb3IgYWdlbnQgY2xhcmlmaWNhdGlvbnMnO1xufTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQWdHLGNBQXVDLDJCQUEyQjtBQUNsSyxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLG1CQUFtQiwyQkFBMkI7QUFDdkQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBOEksc0JBQW9DO0FBQ2xMLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLHNCQUFzQjtBQUt4QixNQUFNLDhCQUNaO0FBR00sTUFBTSxxQkFBcUI7QUFTbEMsTUFBTSxhQUFhO0FBQUEsRUFDbEIsUUFBUTtBQUFBLEVBQ1IsVUFBVTtBQUNYO0FBRUEsTUFBTSxhQUFhO0FBQUEsRUFDbEIsUUFBUTtBQUNUO0FBRUEsU0FBUyxnQkFBZ0IsT0FBMkIsT0FBbUM7QUFDdEYsTUFBSSxVQUFVLFFBQVc7QUFDeEIsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLE1BQU0sU0FBUyxPQUFPO0FBQ3pCLFdBQU8sTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLElBQUk7QUFBQSxFQUNwQztBQUNBLFNBQU87QUFDUjtBQStCTyxTQUFTLDZCQUF3QztBQUN2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
