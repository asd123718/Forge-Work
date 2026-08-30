import { ActionType } from "../common/actions.js";
import { TurnState, ToolCallStatus, ToolCallConfirmationReason, ToolCallCancellationReason, ToolCallContributorKind, ResponsePartKind, PendingMessageKind } from "./state.js";
import { SessionStatus } from "../channels-session/state.js";
import { softAssertNever } from "../common/reducer-helpers.js";
function tcBase(tc) {
  return {
    toolCallId: tc.toolCallId,
    toolName: tc.toolName,
    displayName: tc.displayName,
    intention: tc.intention,
    contributor: tc.contributor,
    _meta: tc._meta
  };
}
function tcBaseWithMeta(tc, meta) {
  return {
    ...tcBase(tc),
    _meta: meta ?? tc._meta
  };
}
function refineToolCallContributor(current, next, log) {
  if (!next) {
    return current;
  }
  if (current?.kind === ToolCallContributorKind.Client) {
    if (next.kind === ToolCallContributorKind.Client && next.clientId === current.clientId) {
      return next;
    }
    log?.(`Ignoring contributor change for client tool call from '${current.clientId}'`);
    return current;
  }
  if (next.kind === ToolCallContributorKind.Client) {
    log?.(`Ignoring late client contributor '${next.clientId}' because client execution ownership must be established at tool call start`);
    return current;
  }
  return next;
}
function resolveSelectedOption(options, id) {
  if (!id || !options) {
    return void 0;
  }
  return options.find((o) => o.id === id);
}
function hasBlockingToolCall(state) {
  if (!state.activeTurn) {
    return false;
  }
  return state.activeTurn.responseParts.some(
    (part) => part.kind === ResponsePartKind.ToolCall && (part.toolCall.status === ToolCallStatus.PendingConfirmation || part.toolCall.status === ToolCallStatus.PendingResultConfirmation || part.toolCall.status === ToolCallStatus.AuthRequired)
  );
}
function hasOpenInputRequest(state) {
  return state.activeTurn?.responseParts.some(
    (part) => part.kind === ResponsePartKind.InputRequest && part.response === void 0
  ) ?? false;
}
function findOpenInputRequestPart(responseParts, requestId) {
  const index = responseParts.findIndex(
    (part2) => part2.kind === ResponsePartKind.InputRequest && part2.response === void 0 && part2.request.id === requestId
  );
  if (index < 0) {
    return void 0;
  }
  const part = responseParts[index];
  return part.kind === ResponsePartKind.InputRequest ? { index, part } : void 0;
}
const STATUS_ACTIVITY_MASK = (1 << 5) - 1;
function withStatusFlag(status, flag, set) {
  return set ? status | flag : status & ~flag;
}
function summaryStatus(state, terminalStatus) {
  let activity;
  if (terminalStatus) {
    activity = terminalStatus;
  } else if (hasOpenInputRequest(state) || hasBlockingToolCall(state)) {
    activity = SessionStatus.InputNeeded;
  } else if (state.activeTurn) {
    activity = SessionStatus.InProgress;
  } else {
    activity = SessionStatus.Idle;
  }
  return state.status & ~STATUS_ACTIVITY_MASK | activity;
}
function refreshSummaryStatus(state) {
  const status = summaryStatus(state);
  if (status === state.status) {
    return state;
  }
  return { ...state, status };
}
function endTurn(state, turnId, turnState, duration, terminalStatus, error) {
  if (!state.activeTurn || state.activeTurn.id !== turnId) {
    return state;
  }
  const active = state.activeTurn;
  const responseParts = active.responseParts.map((part) => {
    if (part.kind !== ResponsePartKind.ToolCall) {
      return part;
    }
    const tc = part.toolCall;
    if (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled) {
      return part;
    }
    return {
      kind: ResponsePartKind.ToolCall,
      toolCall: {
        status: ToolCallStatus.Cancelled,
        ...tcBase(tc),
        invocationMessage: tc.status === ToolCallStatus.Streaming ? tc.invocationMessage ?? "" : tc.invocationMessage,
        toolInput: tc.status === ToolCallStatus.Streaming ? void 0 : tc.toolInput,
        reason: ToolCallCancellationReason.Skipped
      }
    };
  });
  const turn = {
    id: active.id,
    startedAt: active.startedAt,
    // Defensive clamp: the duration is producer-supplied and opaque to this
    // reducer, but a negative value would be nonsensical to display.
    duration: Math.max(0, duration),
    message: active.message,
    responseParts,
    usage: active.usage,
    state: turnState,
    error
  };
  const next = {
    ...state,
    turns: [...state.turns, turn],
    activeTurn: void 0,
    modifiedAt: new Date(Date.now()).toISOString()
  };
  return {
    ...next,
    status: summaryStatus(next, terminalStatus)
  };
}
function upsertInputRequestPart(state, request) {
  const activeTurn = state.activeTurn;
  if (!activeTurn) {
    return state;
  }
  const existing = findOpenInputRequestPart(activeTurn.responseParts, request.id);
  const responseParts = [...activeTurn.responseParts];
  const part = {
    kind: ResponsePartKind.InputRequest,
    request
  };
  if (existing) {
    part.request = {
      ...request,
      answers: request.answers ?? existing.part.request.answers
    };
    responseParts[existing.index] = part;
  } else {
    responseParts.push(part);
  }
  const next = {
    ...state,
    activeTurn: {
      ...activeTurn,
      responseParts
    }
  };
  return { ...next, status: withStatusFlag(summaryStatus(next), SessionStatus.IsRead, false), modifiedAt: new Date(Date.now()).toISOString() };
}
function updateToolCallInParts(state, turnId, toolCallId, updater) {
  const activeTurn = state.activeTurn;
  if (!activeTurn || activeTurn.id !== turnId) {
    return state;
  }
  let found = false;
  const responseParts = activeTurn.responseParts.map((part) => {
    if (part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === toolCallId) {
      const updated = updater(part.toolCall);
      if (updated === part.toolCall) {
        return part;
      }
      found = true;
      return { ...part, toolCall: updated };
    }
    return part;
  });
  if (!found) {
    return state;
  }
  return {
    ...state,
    activeTurn: { ...activeTurn, responseParts }
  };
}
function updateResponsePart(state, turnId, partId, updater) {
  const activeTurn = state.activeTurn;
  if (!activeTurn || activeTurn.id !== turnId) {
    return state;
  }
  let found = false;
  const responseParts = activeTurn.responseParts.map((part) => {
    if (!found) {
      const id = part.kind === ResponsePartKind.ToolCall ? part.toolCall.toolCallId : "id" in part ? part.id : void 0;
      if (id === partId) {
        found = true;
        return updater(part);
      }
    }
    return part;
  });
  if (!found) {
    return state;
  }
  return {
    ...state,
    activeTurn: { ...activeTurn, responseParts }
  };
}
function chatReducer(state, action, log) {
  switch (action.type) {
    // ── Turn Lifecycle ────────────────────────────────────────────────────
    case ActionType.ChatTurnStarted: {
      let next = {
        ...state,
        activeTurn: {
          id: action.turnId,
          startedAt: action.startedAt,
          message: action.message,
          responseParts: [],
          usage: void 0
        }
      };
      next = {
        ...next,
        status: withStatusFlag(summaryStatus(next), SessionStatus.IsRead, false),
        modifiedAt: new Date(Date.now()).toISOString()
      };
      if (action.queuedMessageId) {
        if (next.steeringMessage?.id === action.queuedMessageId) {
          next = { ...next, steeringMessage: void 0 };
        }
        if (next.queuedMessages) {
          const filtered = next.queuedMessages.filter((m) => m.id !== action.queuedMessageId);
          next = { ...next, queuedMessages: filtered.length > 0 ? filtered : void 0 };
        }
      }
      return next;
    }
    case ActionType.ChatDelta:
      return updateResponsePart(state, action.turnId, action.partId, (part) => {
        if (part.kind === ResponsePartKind.Markdown) {
          return { ...part, content: part.content + action.content };
        }
        return part;
      });
    case ActionType.ChatResponsePart:
      if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
        return state;
      }
      return {
        ...state,
        activeTurn: {
          ...state.activeTurn,
          responseParts: [...state.activeTurn.responseParts, action.part]
        }
      };
    case ActionType.ChatTurnComplete:
      return endTurn(state, action.turnId, TurnState.Complete, action.duration);
    case ActionType.ChatTurnCancelled:
      return endTurn(state, action.turnId, TurnState.Cancelled, action.duration);
    case ActionType.ChatError:
      return endTurn(state, action.turnId, TurnState.Error, action.duration, SessionStatus.Error, action.error);
    case ActionType.ChatActivityChanged:
      return { ...state, activity: action.activity };
    // ── Working Directories ───────────────────────────────────────────────
    case ActionType.ChatWorkingDirectorySet: {
      const list = state.workingDirectories ?? [];
      if (list.includes(action.directory)) {
        return state;
      }
      return { ...state, workingDirectories: [...list, action.directory] };
    }
    case ActionType.ChatWorkingDirectoryRemoved: {
      const list = state.workingDirectories;
      if (!list) {
        return state;
      }
      const idx = list.indexOf(action.directory);
      if (idx < 0) {
        return state;
      }
      const updated = list.slice();
      updated.splice(idx, 1);
      return { ...state, workingDirectories: updated };
    }
    // ── Tool Call State Machine ───────────────────────────────────────────
    case ActionType.ChatToolCallStart:
      if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
        return state;
      }
      return {
        ...state,
        activeTurn: {
          ...state.activeTurn,
          responseParts: [
            ...state.activeTurn.responseParts,
            {
              kind: ResponsePartKind.ToolCall,
              toolCall: {
                toolCallId: action.toolCallId,
                toolName: action.toolName,
                displayName: action.displayName,
                intention: action.intention,
                contributor: action.contributor,
                _meta: action._meta,
                status: ToolCallStatus.Streaming
              }
            }
          ]
        }
      };
    case ActionType.ChatToolCallDelta:
      return updateToolCallInParts(state, action.turnId, action.toolCallId, (tc) => {
        if (tc.status !== ToolCallStatus.Streaming) {
          return tc;
        }
        return {
          ...tc,
          ...action._meta !== void 0 ? { _meta: action._meta } : {},
          ...action.content !== void 0 ? { partialInput: (tc.partialInput ?? "") + action.content } : {},
          invocationMessage: action.invocationMessage ?? tc.invocationMessage
        };
      });
    case ActionType.ChatToolCallReady:
      return refreshSummaryStatus(updateToolCallInParts(state, action.turnId, action.toolCallId, (tc) => {
        if (tc.status !== ToolCallStatus.Streaming && tc.status !== ToolCallStatus.Running && tc.status !== ToolCallStatus.PendingConfirmation) {
          return tc;
        }
        const base = {
          ...tcBaseWithMeta(tc, action._meta),
          contributor: refineToolCallContributor(tc.contributor, action.contributor, log),
          intention: action.intention ?? tc.intention
        };
        const toolInput = action.toolInput ?? (tc.status === ToolCallStatus.Streaming ? void 0 : tc.toolInput);
        if (action.confirmed) {
          return {
            status: ToolCallStatus.Running,
            ...base,
            invocationMessage: action.invocationMessage,
            toolInput,
            confirmed: action.confirmed
          };
        }
        const pending = tc.status === ToolCallStatus.PendingConfirmation ? tc : void 0;
        const options = action.options ?? pending?.options;
        return {
          status: ToolCallStatus.PendingConfirmation,
          ...base,
          invocationMessage: action.invocationMessage,
          toolInput,
          confirmationTitle: action.confirmationTitle ?? pending?.confirmationTitle,
          riskAssessment: action.riskAssessment ?? pending?.riskAssessment,
          edits: action.edits ?? pending?.edits,
          editable: action.editable ?? pending?.editable,
          ...options ? { options } : {}
        };
      }));
    case ActionType.ChatToolCallConfirmed:
      return refreshSummaryStatus(updateToolCallInParts(state, action.turnId, action.toolCallId, (tc) => {
        if (tc.status !== ToolCallStatus.PendingConfirmation) {
          return tc;
        }
        const base = tcBaseWithMeta(tc, action._meta);
        const selectedOption = resolveSelectedOption(tc.options, action.selectedOptionId);
        if (action.approved) {
          const toolInput = action.editedToolInput !== void 0 && typeof tc.toolInput === "string" ? action.editedToolInput : tc.toolInput;
          return {
            status: ToolCallStatus.Running,
            ...base,
            invocationMessage: tc.invocationMessage,
            toolInput,
            confirmed: action.confirmed,
            ...selectedOption ? { selectedOption } : {}
          };
        }
        return {
          status: ToolCallStatus.Cancelled,
          ...base,
          invocationMessage: tc.invocationMessage,
          toolInput: tc.toolInput,
          reason: action.reason,
          reasonMessage: action.reasonMessage,
          userSuggestion: action.userSuggestion,
          ...selectedOption ? { selectedOption } : {}
        };
      }));
    case ActionType.ChatToolCallComplete:
      return refreshSummaryStatus(updateToolCallInParts(state, action.turnId, action.toolCallId, (tc) => {
        if (tc.status !== ToolCallStatus.Running && tc.status !== ToolCallStatus.PendingConfirmation && tc.status !== ToolCallStatus.AuthRequired) {
          return tc;
        }
        if (tc.status === ToolCallStatus.AuthRequired && action.result.success) {
          return tc;
        }
        const base = tcBaseWithMeta(tc, action._meta);
        const confirmed = tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.AuthRequired ? tc.confirmed : ToolCallConfirmationReason.NotNeeded;
        const selectedOption = tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.AuthRequired ? tc.selectedOption : void 0;
        const preAuthContent = tc.status === ToolCallStatus.AuthRequired ? tc.content : void 0;
        if (action.requiresResultConfirmation && tc.status !== ToolCallStatus.AuthRequired) {
          return {
            status: ToolCallStatus.PendingResultConfirmation,
            ...base,
            invocationMessage: tc.invocationMessage,
            toolInput: tc.toolInput,
            confirmed,
            ...selectedOption ? { selectedOption } : {},
            ...preAuthContent ? { content: preAuthContent } : {},
            ...action.result
          };
        }
        return {
          status: ToolCallStatus.Completed,
          ...base,
          invocationMessage: tc.invocationMessage,
          toolInput: tc.toolInput,
          confirmed,
          ...selectedOption ? { selectedOption } : {},
          ...preAuthContent ? { content: preAuthContent } : {},
          ...action.result
        };
      }));
    case ActionType.ChatToolCallResultConfirmed:
      return refreshSummaryStatus(updateToolCallInParts(state, action.turnId, action.toolCallId, (tc) => {
        if (tc.status !== ToolCallStatus.PendingResultConfirmation) {
          return tc;
        }
        const base = tcBaseWithMeta(tc, action._meta);
        if (action.approved) {
          return {
            status: ToolCallStatus.Completed,
            ...base,
            invocationMessage: tc.invocationMessage,
            toolInput: tc.toolInput,
            confirmed: tc.confirmed,
            ...tc.selectedOption ? { selectedOption: tc.selectedOption } : {},
            success: tc.success,
            pastTenseMessage: tc.pastTenseMessage,
            content: tc.content,
            structuredContent: tc.structuredContent,
            error: tc.error
          };
        }
        return {
          status: ToolCallStatus.Cancelled,
          ...base,
          invocationMessage: tc.invocationMessage,
          toolInput: tc.toolInput,
          reason: ToolCallCancellationReason.ResultDenied,
          ...tc.selectedOption ? { selectedOption: tc.selectedOption } : {}
        };
      }));
    case ActionType.ChatToolCallContentChanged:
      return updateToolCallInParts(state, action.turnId, action.toolCallId, (tc) => {
        if (tc.status !== ToolCallStatus.Running) {
          return tc;
        }
        return {
          ...tc,
          ...action._meta !== void 0 ? { _meta: action._meta } : {},
          content: action.content
        };
      });
    case ActionType.ChatToolCallAuthRequired:
      return refreshSummaryStatus(updateToolCallInParts(state, action.turnId, action.toolCallId, (tc) => {
        if (tc.status !== ToolCallStatus.Running) {
          return tc;
        }
        if (!tc.contributor || tc.contributor.kind !== ToolCallContributorKind.MCP) {
          return tc;
        }
        const base = tcBaseWithMeta(tc, action._meta);
        return {
          status: ToolCallStatus.AuthRequired,
          ...base,
          contributor: tc.contributor,
          invocationMessage: tc.invocationMessage,
          toolInput: tc.toolInput,
          confirmed: tc.confirmed,
          ...tc.selectedOption ? { selectedOption: tc.selectedOption } : {},
          ...tc.content ? { content: tc.content } : {},
          auth: action.auth
        };
      }));
    case ActionType.ChatToolCallAuthResolved:
      return refreshSummaryStatus(updateToolCallInParts(state, action.turnId, action.toolCallId, (tc) => {
        if (tc.status !== ToolCallStatus.AuthRequired) {
          return tc;
        }
        const base = tcBaseWithMeta(tc, action._meta);
        return {
          status: ToolCallStatus.Running,
          ...base,
          invocationMessage: tc.invocationMessage,
          toolInput: tc.toolInput,
          confirmed: tc.confirmed,
          ...tc.selectedOption ? { selectedOption: tc.selectedOption } : {},
          ...tc.content ? { content: tc.content } : {}
        };
      }));
    case ActionType.ChatUsage:
      if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
        return state;
      }
      return {
        ...state,
        activeTurn: { ...state.activeTurn, usage: action.usage }
      };
    case ActionType.ChatReasoning:
      return updateResponsePart(state, action.turnId, action.partId, (part) => {
        if (part.kind === ResponsePartKind.Reasoning) {
          return { ...part, content: part.content + action.content };
        }
        return part;
      });
    // ── Truncation ────────────────────────────────────────────────────────
    case ActionType.ChatTruncated: {
      let turns;
      if (action.turnId === void 0) {
        turns = [];
      } else {
        const idx = state.turns.findIndex((t) => t.id === action.turnId);
        if (idx < 0) {
          return state;
        }
        turns = state.turns.slice(0, idx + 1);
      }
      const next = {
        ...state,
        turns,
        activeTurn: void 0,
        modifiedAt: new Date(Date.now()).toISOString()
      };
      if (action.turnId === void 0) {
        delete next.turnsNextCursor;
      }
      return {
        ...next,
        status: summaryStatus(next)
      };
    }
    case ActionType.ChatTurnsLoaded: {
      const existingIds = new Set(state.turns.map((turn) => turn.id));
      const olderTurns = action.turns.filter((turn) => !existingIds.has(turn.id));
      return {
        ...state,
        turns: [...olderTurns, ...state.turns],
        turnsNextCursor: action.turnsNextCursor
      };
    }
    // ── Session Input Requests ─────────────────────────────────────────────
    case ActionType.ChatInputRequested:
      return upsertInputRequestPart(state, action.request);
    case ActionType.ChatInputAnswerChanged: {
      const activeTurn = state.activeTurn;
      const existing = activeTurn ? findOpenInputRequestPart(activeTurn.responseParts, action.requestId) : void 0;
      if (!activeTurn || !existing) {
        return state;
      }
      const { index, part } = existing;
      const request = part.request;
      const answers = { ...request.answers ?? {} };
      if (action.answer === void 0) {
        delete answers[action.questionId];
      } else {
        answers[action.questionId] = action.answer;
      }
      const responseParts = [...activeTurn.responseParts];
      responseParts[index] = {
        ...part,
        request: {
          ...request,
          answers: Object.keys(answers).length > 0 ? answers : void 0
        }
      };
      return {
        ...state,
        activeTurn: {
          ...activeTurn,
          responseParts
        },
        modifiedAt: new Date(Date.now()).toISOString()
      };
    }
    case ActionType.ChatInputCompleted: {
      const activeTurn = state.activeTurn;
      const existing = activeTurn ? findOpenInputRequestPart(activeTurn.responseParts, action.requestId) : void 0;
      if (!activeTurn || !existing) {
        return state;
      }
      const { index, part } = existing;
      const finalAnswers = { ...part.request.answers ?? {}, ...action.answers ?? {} };
      const responseParts = [...activeTurn.responseParts];
      responseParts[index] = {
        ...part,
        request: {
          ...part.request,
          answers: Object.keys(finalAnswers).length > 0 ? finalAnswers : void 0
        },
        response: action.response
      };
      const next = {
        ...state,
        activeTurn: {
          ...activeTurn,
          responseParts
        }
      };
      return {
        ...next,
        status: summaryStatus(next),
        modifiedAt: new Date(Date.now()).toISOString()
      };
    }
    // ── Pending Messages ──────────────────────────────────────────────────
    case ActionType.ChatPendingMessageSet: {
      const entry = { id: action.id, message: action.message };
      if (action.kind === PendingMessageKind.Steering) {
        return { ...state, steeringMessage: entry };
      }
      const existing = state.queuedMessages ?? [];
      const idx = existing.findIndex((m) => m.id === action.id);
      if (idx >= 0) {
        const updated = [...existing];
        updated[idx] = entry;
        return { ...state, queuedMessages: updated };
      }
      return { ...state, queuedMessages: [...existing, entry] };
    }
    case ActionType.ChatPendingMessageRemoved: {
      if (action.kind === PendingMessageKind.Steering) {
        if (!state.steeringMessage || state.steeringMessage.id !== action.id) {
          return state;
        }
        return { ...state, steeringMessage: void 0 };
      }
      const existing = state.queuedMessages;
      if (!existing) {
        return state;
      }
      const filtered = existing.filter((m) => m.id !== action.id);
      return filtered.length === existing.length ? state : { ...state, queuedMessages: filtered.length > 0 ? filtered : void 0 };
    }
    case ActionType.ChatQueuedMessagesReordered: {
      const existing = state.queuedMessages;
      if (!existing) {
        return state;
      }
      const byId = new Map(existing.map((m) => [m.id, m]));
      const ordered = /* @__PURE__ */ new Set();
      const reordered = action.order.filter((id) => {
        if (byId.has(id) && !ordered.has(id)) {
          ordered.add(id);
          return true;
        }
        return false;
      }).map((id) => byId.get(id));
      for (const m of existing) {
        if (!ordered.has(m.id)) {
          reordered.push(m);
        }
      }
      return { ...state, queuedMessages: reordered };
    }
    // ── Draft ─────────────────────────────────────────────────────────────
    case ActionType.ChatDraftChanged:
      return { ...state, draft: action.draft };
    default:
      softAssertNever(action, log);
      return state;
  }
}
export {
  chatReducer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxjb21tb25cXHN0YXRlXFxwcm90b2NvbFxcY2hhbm5lbHMtY2hhdFxccmVkdWNlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8vIGFsbG93LWFueS11bmljb2RlLWNvbW1lbnQtZmlsZVxuLy8gRE8gTk9UIEVESVQgLS0gYXV0by1nZW5lcmF0ZWQgYnkgc2NyaXB0cy9zeW5jLWFnZW50LWhvc3QtcHJvdG9jb2wudHNcblxuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFR1cm5TdGF0ZSwgVG9vbENhbGxTdGF0dXMsIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sQ2FsbENhbmNlbGxhdGlvblJlYXNvbiwgVG9vbENhbGxDb250cmlidXRvcktpbmQsIFJlc3BvbnNlUGFydEtpbmQsIFBlbmRpbmdNZXNzYWdlS2luZCwgdHlwZSBDaGF0U3RhdGUsIHR5cGUgVG9vbENhbGxTdGF0ZSwgdHlwZSBSZXNwb25zZVBhcnQsIHR5cGUgVG9vbENhbGxSZXNwb25zZVBhcnQsIHR5cGUgSW5wdXRSZXF1ZXN0UmVzcG9uc2VQYXJ0LCB0eXBlIFR1cm4sIHR5cGUgUGVuZGluZ01lc3NhZ2UsIHR5cGUgQ29uZmlybWF0aW9uT3B0aW9uLCB0eXBlIFRvb2xDYWxsQ29udHJpYnV0b3IgfSBmcm9tICcuL3N0YXRlLmpzJztcbmltcG9ydCB7IFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi9jaGFubmVscy1zZXNzaW9uL3N0YXRlLmpzJztcbmltcG9ydCB0eXBlIHsgQ2hhdEFjdGlvbiB9IGZyb20gJy4uL2FjdGlvbi1vcmlnaW4uZ2VuZXJhdGVkLmpzJztcbmltcG9ydCB7IHNvZnRBc3NlcnROZXZlciB9IGZyb20gJy4uL2NvbW1vbi9yZWR1Y2VyLWhlbHBlcnMuanMnO1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgSGVscGVycyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuLyoqIEV4dHJhY3RzIHRoZSBjb21tb24gYmFzZSBmaWVsZHMgc2hhcmVkIGJ5IGFsbCB0b29sIGNhbGwgbGlmZWN5Y2xlIHN0YXRlcy4gKi9cbmZ1bmN0aW9uIHRjQmFzZSh0YzogVG9vbENhbGxTdGF0ZSkge1xuXHRyZXR1cm4ge1xuXHRcdHRvb2xDYWxsSWQ6IHRjLnRvb2xDYWxsSWQsXG5cdFx0dG9vbE5hbWU6IHRjLnRvb2xOYW1lLFxuXHRcdGRpc3BsYXlOYW1lOiB0Yy5kaXNwbGF5TmFtZSxcblx0XHRpbnRlbnRpb246IHRjLmludGVudGlvbixcblx0XHRjb250cmlidXRvcjogdGMuY29udHJpYnV0b3IsXG5cdFx0X21ldGE6IHRjLl9tZXRhLFxuXHR9O1xufVxuXG5mdW5jdGlvbiB0Y0Jhc2VXaXRoTWV0YSh0YzogVG9vbENhbGxTdGF0ZSwgbWV0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpIHtcblx0cmV0dXJuIHtcblx0XHQuLi50Y0Jhc2UodGMpLFxuXHRcdF9tZXRhOiBtZXRhID8/IHRjLl9tZXRhLFxuXHR9O1xufVxuXG5mdW5jdGlvbiByZWZpbmVUb29sQ2FsbENvbnRyaWJ1dG9yKFxuXHRjdXJyZW50OiBUb29sQ2FsbENvbnRyaWJ1dG9yIHwgdW5kZWZpbmVkLFxuXHRuZXh0OiBUb29sQ2FsbENvbnRyaWJ1dG9yIHwgdW5kZWZpbmVkLFxuXHRsb2c/OiAobXNnOiBzdHJpbmcpID0+IHZvaWQsXG4pOiBUb29sQ2FsbENvbnRyaWJ1dG9yIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFuZXh0KSB7XG5cdFx0cmV0dXJuIGN1cnJlbnQ7XG5cdH1cblx0aWYgKGN1cnJlbnQ/LmtpbmQgPT09IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCkge1xuXHRcdGlmIChuZXh0LmtpbmQgPT09IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCAmJiBuZXh0LmNsaWVudElkID09PSBjdXJyZW50LmNsaWVudElkKSB7XG5cdFx0XHRyZXR1cm4gbmV4dDtcblx0XHR9XG5cdFx0bG9nPy4oYElnbm9yaW5nIGNvbnRyaWJ1dG9yIGNoYW5nZSBmb3IgY2xpZW50IHRvb2wgY2FsbCBmcm9tICcke2N1cnJlbnQuY2xpZW50SWR9J2ApO1xuXHRcdHJldHVybiBjdXJyZW50O1xuXHR9XG5cdGlmIChuZXh0LmtpbmQgPT09IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCkge1xuXHRcdGxvZz8uKGBJZ25vcmluZyBsYXRlIGNsaWVudCBjb250cmlidXRvciAnJHtuZXh0LmNsaWVudElkfScgYmVjYXVzZSBjbGllbnQgZXhlY3V0aW9uIG93bmVyc2hpcCBtdXN0IGJlIGVzdGFibGlzaGVkIGF0IHRvb2wgY2FsbCBzdGFydGApO1xuXHRcdHJldHVybiBjdXJyZW50O1xuXHR9XG5cdHJldHVybiBuZXh0O1xufVxuXG4vKiogUmVzb2x2ZXMgYSBzZWxlY3RlZCBvcHRpb24gZnJvbSB0aGUgY29uZmlybWF0aW9uIG9wdGlvbnMgYXJyYXkgYnkgSUQuICovXG5mdW5jdGlvbiByZXNvbHZlU2VsZWN0ZWRPcHRpb24ob3B0aW9uczogQ29uZmlybWF0aW9uT3B0aW9uW10gfCB1bmRlZmluZWQsIGlkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBDb25maXJtYXRpb25PcHRpb24gfCB1bmRlZmluZWQge1xuXHRpZiAoIWlkIHx8ICFvcHRpb25zKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gb3B0aW9ucy5maW5kKG8gPT4gby5pZCA9PT0gaWQpO1xufVxuXG4vKipcbiAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBhY3RpdmUgdHVybiBoYXMgYW55IHRvb2wgY2FsbCBibG9ja2luZyBvbiBzb21ldGhpbmdcbiAqIGV4dGVybmFsIHRvIHRoZSB0dXJuIGl0c2VsZiBcdTIwMTQgYSBwZW5kaW5nIGNvbmZpcm1hdGlvbi9yZXN1bHQtY29uZmlybWF0aW9uLFxuICogb3IgYSB0b29sIGNhbGwgcGF1c2VkIG9uIE1DUCBhdXRoZW50aWNhdGlvbi5cbiAqL1xuZnVuY3Rpb24gaGFzQmxvY2tpbmdUb29sQ2FsbChzdGF0ZTogQ2hhdFN0YXRlKTogYm9vbGVhbiB7XG5cdGlmICghc3RhdGUuYWN0aXZlVHVybikge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gc3RhdGUuYWN0aXZlVHVybi5yZXNwb25zZVBhcnRzLnNvbWUocGFydCA9PlxuXHRcdHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbFxuXHRcdCYmIChwYXJ0LnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvblxuXHRcdFx0fHwgcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdSZXN1bHRDb25maXJtYXRpb25cblx0XHRcdHx8IHBhcnQudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5BdXRoUmVxdWlyZWQpLFxuXHQpO1xufVxuXG4vKiogUmV0dXJucyB3aGV0aGVyIHRoZSBhY3RpdmUgdHVybiBjb250YWlucyBhbiBpbnB1dCByZXF1ZXN0IGF3YWl0aW5nIHN1Ym1pc3Npb24uICovXG5mdW5jdGlvbiBoYXNPcGVuSW5wdXRSZXF1ZXN0KHN0YXRlOiBDaGF0U3RhdGUpOiBib29sZWFuIHtcblx0cmV0dXJuIHN0YXRlLmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuc29tZShwYXJ0ID0+XG5cdFx0cGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLklucHV0UmVxdWVzdCAmJiBwYXJ0LnJlc3BvbnNlID09PSB1bmRlZmluZWQsXG5cdCkgPz8gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGZpbmRPcGVuSW5wdXRSZXF1ZXN0UGFydChcblx0cmVzcG9uc2VQYXJ0czogcmVhZG9ubHkgUmVzcG9uc2VQYXJ0W10sXG5cdHJlcXVlc3RJZDogc3RyaW5nLFxuKTogeyBpbmRleDogbnVtYmVyOyBwYXJ0OiBJbnB1dFJlcXVlc3RSZXNwb25zZVBhcnQgfSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGluZGV4ID0gcmVzcG9uc2VQYXJ0cy5maW5kSW5kZXgocGFydCA9PlxuXHRcdHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5JbnB1dFJlcXVlc3Rcblx0XHQmJiBwYXJ0LnJlc3BvbnNlID09PSB1bmRlZmluZWRcblx0XHQmJiBwYXJ0LnJlcXVlc3QuaWQgPT09IHJlcXVlc3RJZCxcblx0KTtcblx0aWYgKGluZGV4IDwgMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgcGFydCA9IHJlc3BvbnNlUGFydHNbaW5kZXhdO1xuXHRyZXR1cm4gcGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLklucHV0UmVxdWVzdCA/IHsgaW5kZXgsIHBhcnQgfSA6IHVuZGVmaW5lZDtcbn1cblxuLyoqIEJpdG1hc2sgY292ZXJpbmcgdGhlIG11dHVhbGx5LWV4Y2x1c2l2ZSBhY3Rpdml0eSBiaXRzIChiaXRzIDBcdTIwMTM0KS4gKi9cbmNvbnN0IFNUQVRVU19BQ1RJVklUWV9NQVNLID0gKDEgPDwgNSkgLSAxO1xuXG4vKiogU2V0cyBvciBjbGVhcnMgYSBtZXRhZGF0YSBmbGFnIG9uIGEgc3RhdHVzIHZhbHVlLiAqL1xuZnVuY3Rpb24gd2l0aFN0YXR1c0ZsYWcoc3RhdHVzOiBTZXNzaW9uU3RhdHVzLCBmbGFnOiBTZXNzaW9uU3RhdHVzLCBzZXQ6IGJvb2xlYW4pOiBTZXNzaW9uU3RhdHVzIHtcblx0cmV0dXJuIHNldCA/IHN0YXR1cyB8IGZsYWcgOiBzdGF0dXMgJiB+ZmxhZztcbn1cblxuLyoqIERlcml2ZXMgdGhlIHN1bW1hcnkgc3RhdHVzIGZyb20gbGl2ZSBzZXNzaW9uIHdvcmssIHByZXNlcnZpbmcgb3J0aG9nb25hbCBmbGFncy4gKi9cbmZ1bmN0aW9uIHN1bW1hcnlTdGF0dXMoc3RhdGU6IENoYXRTdGF0ZSwgdGVybWluYWxTdGF0dXM/OiBTZXNzaW9uU3RhdHVzLkVycm9yKTogU2Vzc2lvblN0YXR1cyB7XG5cdGxldCBhY3Rpdml0eTogU2Vzc2lvblN0YXR1cztcblx0aWYgKHRlcm1pbmFsU3RhdHVzKSB7XG5cdFx0YWN0aXZpdHkgPSB0ZXJtaW5hbFN0YXR1cztcblx0fSBlbHNlIGlmIChoYXNPcGVuSW5wdXRSZXF1ZXN0KHN0YXRlKSB8fCBoYXNCbG9ja2luZ1Rvb2xDYWxsKHN0YXRlKSkge1xuXHRcdGFjdGl2aXR5ID0gU2Vzc2lvblN0YXR1cy5JbnB1dE5lZWRlZDtcblx0fSBlbHNlIGlmIChzdGF0ZS5hY3RpdmVUdXJuKSB7XG5cdFx0YWN0aXZpdHkgPSBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3M7XG5cdH0gZWxzZSB7XG5cdFx0YWN0aXZpdHkgPSBTZXNzaW9uU3RhdHVzLklkbGU7XG5cdH1cblxuXHRyZXR1cm4gc3RhdGUuc3RhdHVzICYgflNUQVRVU19BQ1RJVklUWV9NQVNLIHwgYWN0aXZpdHk7XG59XG5cbi8qKlxuICogUmV0dXJucyBhIHN0YXRlIHdpdGggYHN0YXR1c2AgcmVjb21wdXRlZC4gVXNlIHRoaXMgYWZ0ZXIgcmVkdWNlcnNcbiAqIHRoYXQgY2hhbmdlIGRhdGEgd2hpY2ggZmVlZHMgaW50byB7QGxpbmsgc3VtbWFyeVN0YXR1c30gKGUuZy4gdG9vbCBjYWxsXG4gKiBsaWZlY3ljbGUgdHJhbnNpdGlvbnMgdGhhdCBtYXkgZW50ZXIgb3IgbGVhdmUgYSBwZW5kaW5nLWNvbmZpcm1hdGlvbiBzdGF0ZSkuXG4gKi9cbmZ1bmN0aW9uIHJlZnJlc2hTdW1tYXJ5U3RhdHVzKHN0YXRlOiBDaGF0U3RhdGUpOiBDaGF0U3RhdGUge1xuXHRjb25zdCBzdGF0dXMgPSBzdW1tYXJ5U3RhdHVzKHN0YXRlKTtcblx0aWYgKHN0YXR1cyA9PT0gc3RhdGUuc3RhdHVzKSB7XG5cdFx0cmV0dXJuIHN0YXRlO1xuXHR9XG5cdHJldHVybiB7IC4uLnN0YXRlLCBzdGF0dXMgfTtcbn1cblxuLyoqXG4gKiBFbmRzIHRoZSBhY3RpdmUgdHVybiwgZmluYWxpemluZyBpdCBpbnRvIGEgY29tcGxldGVkIHR1cm4gcmVjb3JkLlxuICpcbiAqIFRvb2wgY2FsbCBwYXJ0cyB3aXRoIG5vbi10ZXJtaW5hbCBzdGF0ZXMgYXJlIGZvcmNlZCB0byBjYW5jZWxsZWQuXG4gKiBQZW5kaW5nIHBlcm1pc3Npb25zIGFyZSBzdHJpcHBlZCBmcm9tIHRvb2wgY2FsbCBwYXJ0cy5cbiAqL1xuZnVuY3Rpb24gZW5kVHVybihcblx0c3RhdGU6IENoYXRTdGF0ZSxcblx0dHVybklkOiBzdHJpbmcsXG5cdHR1cm5TdGF0ZTogVHVyblN0YXRlLFxuXHRkdXJhdGlvbjogbnVtYmVyLFxuXHR0ZXJtaW5hbFN0YXR1cz86IFNlc3Npb25TdGF0dXMuRXJyb3IsXG5cdGVycm9yPzogeyBlcnJvclR5cGU6IHN0cmluZzsgbWVzc2FnZTogc3RyaW5nOyBzdGFjaz86IHN0cmluZyB9LFxuKTogQ2hhdFN0YXRlIHtcblx0aWYgKCFzdGF0ZS5hY3RpdmVUdXJuIHx8IHN0YXRlLmFjdGl2ZVR1cm4uaWQgIT09IHR1cm5JZCkge1xuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXHRjb25zdCBhY3RpdmUgPSBzdGF0ZS5hY3RpdmVUdXJuO1xuXG5cdGNvbnN0IHJlc3BvbnNlUGFydHM6IFJlc3BvbnNlUGFydFtdID0gYWN0aXZlLnJlc3BvbnNlUGFydHMubWFwKHBhcnQgPT4ge1xuXHRcdGlmIChwYXJ0LmtpbmQgIT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpIHtcblx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdH1cblx0XHRjb25zdCB0YyA9IHBhcnQudG9vbENhbGw7XG5cdFx0aWYgKHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkIHx8IHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ2FuY2VsbGVkKSB7XG5cdFx0XHRyZXR1cm4gcGFydDtcblx0XHR9XG5cdFx0Ly8gRm9yY2Ugbm9uLXRlcm1pbmFsIHRvb2wgY2FsbHMgaW50byBjYW5jZWxsZWQgc3RhdGVcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCxcblx0XHRcdHRvb2xDYWxsOiB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ2FuY2VsbGVkIGFzIGNvbnN0LFxuXHRcdFx0XHQuLi50Y0Jhc2UodGMpLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcgPyAodGMuaW52b2NhdGlvbk1lc3NhZ2UgPz8gJycpIDogdGMuaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdHRvb2xJbnB1dDogdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcgPyB1bmRlZmluZWQgOiB0Yy50b29sSW5wdXQsXG5cdFx0XHRcdHJlYXNvbjogVG9vbENhbGxDYW5jZWxsYXRpb25SZWFzb24uU2tpcHBlZCxcblx0XHRcdH0sXG5cdFx0fTtcblx0fSk7XG5cblx0Y29uc3QgdHVybjogVHVybiA9IHtcblx0XHRpZDogYWN0aXZlLmlkLFxuXHRcdHN0YXJ0ZWRBdDogYWN0aXZlLnN0YXJ0ZWRBdCxcblx0XHQvLyBEZWZlbnNpdmUgY2xhbXA6IHRoZSBkdXJhdGlvbiBpcyBwcm9kdWNlci1zdXBwbGllZCBhbmQgb3BhcXVlIHRvIHRoaXNcblx0XHQvLyByZWR1Y2VyLCBidXQgYSBuZWdhdGl2ZSB2YWx1ZSB3b3VsZCBiZSBub25zZW5zaWNhbCB0byBkaXNwbGF5LlxuXHRcdGR1cmF0aW9uOiBNYXRoLm1heCgwLCBkdXJhdGlvbiksXG5cdFx0bWVzc2FnZTogYWN0aXZlLm1lc3NhZ2UsXG5cdFx0cmVzcG9uc2VQYXJ0cyxcblx0XHR1c2FnZTogYWN0aXZlLnVzYWdlLFxuXHRcdHN0YXRlOiB0dXJuU3RhdGUsXG5cdFx0ZXJyb3IsXG5cdH07XG5cblx0Y29uc3QgbmV4dDogQ2hhdFN0YXRlID0ge1xuXHRcdC4uLnN0YXRlLFxuXHRcdHR1cm5zOiBbLi4uc3RhdGUudHVybnMsIHR1cm5dLFxuXHRcdGFjdGl2ZVR1cm46IHVuZGVmaW5lZCxcblx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZShEYXRlLm5vdygpKS50b0lTT1N0cmluZygpLFxuXHR9O1xuXHRyZXR1cm4ge1xuXHRcdC4uLm5leHQsXG5cdFx0c3RhdHVzOiBzdW1tYXJ5U3RhdHVzKG5leHQsIHRlcm1pbmFsU3RhdHVzKSxcblx0fTtcbn1cblxuZnVuY3Rpb24gdXBzZXJ0SW5wdXRSZXF1ZXN0UGFydChzdGF0ZTogQ2hhdFN0YXRlLCByZXF1ZXN0OiBJbnB1dFJlcXVlc3RSZXNwb25zZVBhcnRbJ3JlcXVlc3QnXSk6IENoYXRTdGF0ZSB7XG5cdGNvbnN0IGFjdGl2ZVR1cm4gPSBzdGF0ZS5hY3RpdmVUdXJuO1xuXHRpZiAoIWFjdGl2ZVR1cm4pIHtcblx0XHRyZXR1cm4gc3RhdGU7XG5cdH1cblx0Y29uc3QgZXhpc3RpbmcgPSBmaW5kT3BlbklucHV0UmVxdWVzdFBhcnQoYWN0aXZlVHVybi5yZXNwb25zZVBhcnRzLCByZXF1ZXN0LmlkKTtcblx0Y29uc3QgcmVzcG9uc2VQYXJ0cyA9IFsuLi5hY3RpdmVUdXJuLnJlc3BvbnNlUGFydHNdO1xuXHRjb25zdCBwYXJ0OiBJbnB1dFJlcXVlc3RSZXNwb25zZVBhcnQgPSB7XG5cdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5JbnB1dFJlcXVlc3QsXG5cdFx0cmVxdWVzdCxcblx0fTtcblx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0cGFydC5yZXF1ZXN0ID0ge1xuXHRcdFx0Li4ucmVxdWVzdCxcblx0XHRcdGFuc3dlcnM6IHJlcXVlc3QuYW5zd2VycyA/PyBleGlzdGluZy5wYXJ0LnJlcXVlc3QuYW5zd2Vycyxcblx0XHR9O1xuXHRcdHJlc3BvbnNlUGFydHNbZXhpc3RpbmcuaW5kZXhdID0gcGFydDtcblx0fSBlbHNlIHtcblx0XHRyZXNwb25zZVBhcnRzLnB1c2gocGFydCk7XG5cdH1cblx0Y29uc3QgbmV4dDogQ2hhdFN0YXRlID0ge1xuXHRcdC4uLnN0YXRlLFxuXHRcdGFjdGl2ZVR1cm46IHtcblx0XHRcdC4uLmFjdGl2ZVR1cm4sXG5cdFx0XHRyZXNwb25zZVBhcnRzLFxuXHRcdH0sXG5cdH07XG5cdHJldHVybiB7IC4uLm5leHQsIHN0YXR1czogd2l0aFN0YXR1c0ZsYWcoc3VtbWFyeVN0YXR1cyhuZXh0KSwgU2Vzc2lvblN0YXR1cy5Jc1JlYWQsIGZhbHNlKSwgbW9kaWZpZWRBdDogbmV3IERhdGUoRGF0ZS5ub3coKSkudG9JU09TdHJpbmcoKSB9O1xufVxuXG4vKipcbiAqIEltbXV0YWJseSB1cGRhdGVzIHRoZSB0b29sIGNhbGwgaW5zaWRlIGEgYFRvb2xDYWxsYCByZXNwb25zZSBwYXJ0IGluIHRoZVxuICogYWN0aXZlIHR1cm4ncyBgcmVzcG9uc2VQYXJ0c2AgYXJyYXkuIFJldHVybnMgYHN0YXRlYCB1bmNoYW5nZWQgaWYgdGhlXG4gKiBhY3RpdmUgdHVybiBvciB0b29sIGNhbGwgZG9lc24ndCBtYXRjaC5cbiAqL1xuZnVuY3Rpb24gdXBkYXRlVG9vbENhbGxJblBhcnRzKFxuXHRzdGF0ZTogQ2hhdFN0YXRlLFxuXHR0dXJuSWQ6IHN0cmluZyxcblx0dG9vbENhbGxJZDogc3RyaW5nLFxuXHR1cGRhdGVyOiAodGM6IFRvb2xDYWxsU3RhdGUpID0+IFRvb2xDYWxsU3RhdGUsXG4pOiBDaGF0U3RhdGUge1xuXHRjb25zdCBhY3RpdmVUdXJuID0gc3RhdGUuYWN0aXZlVHVybjtcblx0aWYgKCFhY3RpdmVUdXJuIHx8IGFjdGl2ZVR1cm4uaWQgIT09IHR1cm5JZCkge1xuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXG5cdGxldCBmb3VuZCA9IGZhbHNlO1xuXHRjb25zdCByZXNwb25zZVBhcnRzID0gYWN0aXZlVHVybi5yZXNwb25zZVBhcnRzLm1hcChwYXJ0ID0+IHtcblx0XHRpZiAocGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHBhcnQudG9vbENhbGwudG9vbENhbGxJZCA9PT0gdG9vbENhbGxJZCkge1xuXHRcdFx0Y29uc3QgdXBkYXRlZCA9IHVwZGF0ZXIocGFydC50b29sQ2FsbCk7XG5cdFx0XHRpZiAodXBkYXRlZCA9PT0gcGFydC50b29sQ2FsbCkge1xuXHRcdFx0XHRyZXR1cm4gcGFydDtcblx0XHRcdH1cblx0XHRcdGZvdW5kID0gdHJ1ZTtcblx0XHRcdHJldHVybiB7IC4uLnBhcnQsIHRvb2xDYWxsOiB1cGRhdGVkIH07XG5cdFx0fVxuXHRcdHJldHVybiBwYXJ0O1xuXHR9KTtcblxuXHRpZiAoIWZvdW5kKSB7XG5cdFx0cmV0dXJuIHN0YXRlO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHQuLi5zdGF0ZSxcblx0XHRhY3RpdmVUdXJuOiB7IC4uLmFjdGl2ZVR1cm4sIHJlc3BvbnNlUGFydHMgfSxcblx0fTtcbn1cblxuLyoqXG4gKiBJbW11dGFibHkgdXBkYXRlcyBhIHJlc3BvbnNlIHBhcnQgYnkgYHBhcnRJZGAgaW4gdGhlIGFjdGl2ZSB0dXJuLlxuICogRm9yIG1hcmtkb3duL3JlYXNvbmluZyBwYXJ0cywgbWF0Y2hlcyBvbiBgaWRgLiBGb3IgdG9vbCBjYWxsIHBhcnRzLFxuICogbWF0Y2hlcyBvbiBgdG9vbENhbGwudG9vbENhbGxJZGAuXG4gKi9cbmZ1bmN0aW9uIHVwZGF0ZVJlc3BvbnNlUGFydChcblx0c3RhdGU6IENoYXRTdGF0ZSxcblx0dHVybklkOiBzdHJpbmcsXG5cdHBhcnRJZDogc3RyaW5nLFxuXHR1cGRhdGVyOiAocGFydDogUmVzcG9uc2VQYXJ0KSA9PiBSZXNwb25zZVBhcnQsXG4pOiBDaGF0U3RhdGUge1xuXHRjb25zdCBhY3RpdmVUdXJuID0gc3RhdGUuYWN0aXZlVHVybjtcblx0aWYgKCFhY3RpdmVUdXJuIHx8IGFjdGl2ZVR1cm4uaWQgIT09IHR1cm5JZCkge1xuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXG5cdGxldCBmb3VuZCA9IGZhbHNlO1xuXHRjb25zdCByZXNwb25zZVBhcnRzID0gYWN0aXZlVHVybi5yZXNwb25zZVBhcnRzLm1hcChwYXJ0ID0+IHtcblx0XHRpZiAoIWZvdW5kKSB7XG5cdFx0XHRjb25zdCBpZCA9IHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbFxuXHRcdFx0XHQ/IHBhcnQudG9vbENhbGwudG9vbENhbGxJZFxuXHRcdFx0XHQ6ICdpZCcgaW4gcGFydCA/IHBhcnQuaWQgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoaWQgPT09IHBhcnRJZCkge1xuXHRcdFx0XHRmb3VuZCA9IHRydWU7XG5cdFx0XHRcdHJldHVybiB1cGRhdGVyKHBhcnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcGFydDtcblx0fSk7XG5cblx0aWYgKCFmb3VuZCkge1xuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0Li4uc3RhdGUsXG5cdFx0YWN0aXZlVHVybjogeyAuLi5hY3RpdmVUdXJuLCByZXNwb25zZVBhcnRzIH0sXG5cdH07XG59XG5cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIENoYXQgUmVkdWNlciBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuLyoqXG4gKiBQdXJlIHJlZHVjZXIgZm9yIGNoYXQgc3RhdGUuIEhhbmRsZXMgYWxsIHtAbGluayBDaGF0QWN0aW9ufSB2YXJpYW50cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNoYXRSZWR1Y2VyKHN0YXRlOiBDaGF0U3RhdGUsIGFjdGlvbjogQ2hhdEFjdGlvbiwgbG9nPzogKG1zZzogc3RyaW5nKSA9PiB2b2lkKTogQ2hhdFN0YXRlIHtcblx0c3dpdGNoIChhY3Rpb24udHlwZSkge1xuXHRcdC8vIFx1MjUwMFx1MjUwMCBUdXJuIExpZmVjeWNsZSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQ6IHtcblx0XHRcdGxldCBuZXh0OiBDaGF0U3RhdGUgPSB7XG5cdFx0XHRcdC4uLnN0YXRlLFxuXHRcdFx0XHRhY3RpdmVUdXJuOiB7XG5cdFx0XHRcdFx0aWQ6IGFjdGlvbi50dXJuSWQsXG5cdFx0XHRcdFx0c3RhcnRlZEF0OiBhY3Rpb24uc3RhcnRlZEF0LFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGFjdGlvbi5tZXNzYWdlLFxuXHRcdFx0XHRcdHJlc3BvbnNlUGFydHM6IFtdLFxuXHRcdFx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0bmV4dCA9IHtcblx0XHRcdFx0Li4ubmV4dCxcblx0XHRcdFx0c3RhdHVzOiB3aXRoU3RhdHVzRmxhZyhzdW1tYXJ5U3RhdHVzKG5leHQpLCBTZXNzaW9uU3RhdHVzLklzUmVhZCwgZmFsc2UpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZShEYXRlLm5vdygpKS50b0lTT1N0cmluZygpLFxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gSWYgdGhpcyB0dXJuIHdhcyBhdXRvLXN0YXJ0ZWQgZnJvbSBhIHBlbmRpbmcgbWVzc2FnZSwgcmVtb3ZlIGl0XG5cdFx0XHRpZiAoYWN0aW9uLnF1ZXVlZE1lc3NhZ2VJZCkge1xuXHRcdFx0XHRpZiAobmV4dC5zdGVlcmluZ01lc3NhZ2U/LmlkID09PSBhY3Rpb24ucXVldWVkTWVzc2FnZUlkKSB7XG5cdFx0XHRcdFx0bmV4dCA9IHsgLi4ubmV4dCwgc3RlZXJpbmdNZXNzYWdlOiB1bmRlZmluZWQgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobmV4dC5xdWV1ZWRNZXNzYWdlcykge1xuXHRcdFx0XHRcdGNvbnN0IGZpbHRlcmVkID0gbmV4dC5xdWV1ZWRNZXNzYWdlcy5maWx0ZXIobSA9PiBtLmlkICE9PSBhY3Rpb24ucXVldWVkTWVzc2FnZUlkKTtcblx0XHRcdFx0XHRuZXh0ID0geyAuLi5uZXh0LCBxdWV1ZWRNZXNzYWdlczogZmlsdGVyZWQubGVuZ3RoID4gMCA/IGZpbHRlcmVkIDogdW5kZWZpbmVkIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG5leHQ7XG5cdFx0fVxuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXREZWx0YTpcblx0XHRcdHJldHVybiB1cGRhdGVSZXNwb25zZVBhcnQoc3RhdGUsIGFjdGlvbi50dXJuSWQsIGFjdGlvbi5wYXJ0SWQsIHBhcnQgPT4ge1xuXHRcdFx0XHRpZiAocGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgLi4ucGFydCwgY29udGVudDogcGFydC5jb250ZW50ICsgYWN0aW9uLmNvbnRlbnQgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcGFydDtcblx0XHRcdH0pO1xuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQ6XG5cdFx0XHRpZiAoIXN0YXRlLmFjdGl2ZVR1cm4gfHwgc3RhdGUuYWN0aXZlVHVybi5pZCAhPT0gYWN0aW9uLnR1cm5JZCkge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5zdGF0ZSxcblx0XHRcdFx0YWN0aXZlVHVybjoge1xuXHRcdFx0XHRcdC4uLnN0YXRlLmFjdGl2ZVR1cm4sXG5cdFx0XHRcdFx0cmVzcG9uc2VQYXJ0czogWy4uLnN0YXRlLmFjdGl2ZVR1cm4ucmVzcG9uc2VQYXJ0cywgYWN0aW9uLnBhcnRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlOlxuXHRcdFx0cmV0dXJuIGVuZFR1cm4oc3RhdGUsIGFjdGlvbi50dXJuSWQsIFR1cm5TdGF0ZS5Db21wbGV0ZSwgYWN0aW9uLmR1cmF0aW9uKTtcblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZDpcblx0XHRcdHJldHVybiBlbmRUdXJuKHN0YXRlLCBhY3Rpb24udHVybklkLCBUdXJuU3RhdGUuQ2FuY2VsbGVkLCBhY3Rpb24uZHVyYXRpb24pO1xuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRFcnJvcjpcblx0XHRcdHJldHVybiBlbmRUdXJuKHN0YXRlLCBhY3Rpb24udHVybklkLCBUdXJuU3RhdGUuRXJyb3IsIGFjdGlvbi5kdXJhdGlvbiwgU2Vzc2lvblN0YXR1cy5FcnJvciwgYWN0aW9uLmVycm9yKTtcblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0QWN0aXZpdHlDaGFuZ2VkOlxuXHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIGFjdGl2aXR5OiBhY3Rpb24uYWN0aXZpdHkgfTtcblxuXHRcdC8vIFx1MjUwMFx1MjUwMCBXb3JraW5nIERpcmVjdG9yaWVzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRXb3JraW5nRGlyZWN0b3J5U2V0OiB7XG5cdFx0XHRjb25zdCBsaXN0ID0gc3RhdGUud29ya2luZ0RpcmVjdG9yaWVzID8/IFtdO1xuXHRcdFx0aWYgKGxpc3QuaW5jbHVkZXMoYWN0aW9uLmRpcmVjdG9yeSkpIHtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIHdvcmtpbmdEaXJlY3RvcmllczogWy4uLmxpc3QsIGFjdGlvbi5kaXJlY3RvcnldIH07XG5cdFx0fVxuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRXb3JraW5nRGlyZWN0b3J5UmVtb3ZlZDoge1xuXHRcdFx0Y29uc3QgbGlzdCA9IHN0YXRlLndvcmtpbmdEaXJlY3Rvcmllcztcblx0XHRcdGlmICghbGlzdCkge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpZHggPSBsaXN0LmluZGV4T2YoYWN0aW9uLmRpcmVjdG9yeSk7XG5cdFx0XHRpZiAoaWR4IDwgMCkge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1cGRhdGVkID0gbGlzdC5zbGljZSgpO1xuXHRcdFx0dXBkYXRlZC5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdHJldHVybiB7IC4uLnN0YXRlLCB3b3JraW5nRGlyZWN0b3JpZXM6IHVwZGF0ZWQgfTtcblx0XHR9XG5cblx0XHQvLyBcdTI1MDBcdTI1MDAgVG9vbCBDYWxsIFN0YXRlIE1hY2hpbmUgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQ6XG5cdFx0XHRpZiAoIXN0YXRlLmFjdGl2ZVR1cm4gfHwgc3RhdGUuYWN0aXZlVHVybi5pZCAhPT0gYWN0aW9uLnR1cm5JZCkge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5zdGF0ZSxcblx0XHRcdFx0YWN0aXZlVHVybjoge1xuXHRcdFx0XHRcdC4uLnN0YXRlLmFjdGl2ZVR1cm4sXG5cdFx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW1xuXHRcdFx0XHRcdFx0Li4uc3RhdGUuYWN0aXZlVHVybi5yZXNwb25zZVBhcnRzLFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLFxuXHRcdFx0XHRcdFx0XHR0b29sQ2FsbDoge1xuXHRcdFx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6IGFjdGlvbi50b29sQ2FsbElkLFxuXHRcdFx0XHRcdFx0XHRcdHRvb2xOYW1lOiBhY3Rpb24udG9vbE5hbWUsXG5cdFx0XHRcdFx0XHRcdFx0ZGlzcGxheU5hbWU6IGFjdGlvbi5kaXNwbGF5TmFtZSxcblx0XHRcdFx0XHRcdFx0XHRpbnRlbnRpb246IGFjdGlvbi5pbnRlbnRpb24sXG5cdFx0XHRcdFx0XHRcdFx0Y29udHJpYnV0b3I6IGFjdGlvbi5jb250cmlidXRvcixcblx0XHRcdFx0XHRcdFx0XHRfbWV0YTogYWN0aW9uLl9tZXRhLFxuXHRcdFx0XHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSBzYXRpc2ZpZXMgVG9vbENhbGxSZXNwb25zZVBhcnQsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsRGVsdGE6XG5cdFx0XHRyZXR1cm4gdXBkYXRlVG9vbENhbGxJblBhcnRzKHN0YXRlLCBhY3Rpb24udHVybklkLCBhY3Rpb24udG9vbENhbGxJZCwgdGMgPT4ge1xuXHRcdFx0XHRpZiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGM7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHQuLi50Yyxcblx0XHRcdFx0XHQuLi4oYWN0aW9uLl9tZXRhICE9PSB1bmRlZmluZWQgPyB7IF9tZXRhOiBhY3Rpb24uX21ldGEgfSA6IHt9KSxcblx0XHRcdFx0XHQuLi4oYWN0aW9uLmNvbnRlbnQgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0PyB7IHBhcnRpYWxJbnB1dDogKHRjLnBhcnRpYWxJbnB1dCA/PyAnJykgKyBhY3Rpb24uY29udGVudCB9XG5cdFx0XHRcdFx0XHQ6IHt9KSxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogYWN0aW9uLmludm9jYXRpb25NZXNzYWdlID8/IHRjLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHk6XG5cdFx0XHRyZXR1cm4gcmVmcmVzaFN1bW1hcnlTdGF0dXModXBkYXRlVG9vbENhbGxJblBhcnRzKHN0YXRlLCBhY3Rpb24udHVybklkLCBhY3Rpb24udG9vbENhbGxJZCwgdGMgPT4ge1xuXHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0dGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmdcblx0XHRcdFx0XHQmJiB0Yy5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmdcblx0XHRcdFx0XHQmJiB0Yy5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb25cblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRjO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGJhc2UgPSB7XG5cdFx0XHRcdFx0Li4udGNCYXNlV2l0aE1ldGEodGMsIGFjdGlvbi5fbWV0YSksXG5cdFx0XHRcdFx0Y29udHJpYnV0b3I6IHJlZmluZVRvb2xDYWxsQ29udHJpYnV0b3IodGMuY29udHJpYnV0b3IsIGFjdGlvbi5jb250cmlidXRvciwgbG9nKSxcblx0XHRcdFx0XHRpbnRlbnRpb246IGFjdGlvbi5pbnRlbnRpb24gPz8gdGMuaW50ZW50aW9uLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCB0b29sSW5wdXQgPSBhY3Rpb24udG9vbElucHV0XG5cdFx0XHRcdFx0Pz8gKHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nID8gdW5kZWZpbmVkIDogdGMudG9vbElucHV0KTtcblx0XHRcdFx0aWYgKGFjdGlvbi5jb25maXJtZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLFxuXHRcdFx0XHRcdFx0Li4uYmFzZSxcblx0XHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBhY3Rpb24uaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdFx0XHR0b29sSW5wdXQsXG5cdFx0XHRcdFx0XHRjb25maXJtZWQ6IGFjdGlvbi5jb25maXJtZWQsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBwZW5kaW5nID0gdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uID8gdGMgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IG9wdGlvbnMgPSBhY3Rpb24ub3B0aW9ucyA/PyBwZW5kaW5nPy5vcHRpb25zO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHQuLi5iYXNlLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBhY3Rpb24uaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdFx0dG9vbElucHV0LFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiBhY3Rpb24uY29uZmlybWF0aW9uVGl0bGUgPz8gcGVuZGluZz8uY29uZmlybWF0aW9uVGl0bGUsXG5cdFx0XHRcdFx0cmlza0Fzc2Vzc21lbnQ6IGFjdGlvbi5yaXNrQXNzZXNzbWVudCA/PyBwZW5kaW5nPy5yaXNrQXNzZXNzbWVudCxcblx0XHRcdFx0XHRlZGl0czogYWN0aW9uLmVkaXRzID8/IHBlbmRpbmc/LmVkaXRzLFxuXHRcdFx0XHRcdGVkaXRhYmxlOiBhY3Rpb24uZWRpdGFibGUgPz8gcGVuZGluZz8uZWRpdGFibGUsXG5cdFx0XHRcdFx0Li4uKG9wdGlvbnMgPyB7IG9wdGlvbnMgfSA6IHt9KSxcblx0XHRcdFx0fTtcblx0XHRcdH0pKTtcblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQ6XG5cdFx0XHRyZXR1cm4gcmVmcmVzaFN1bW1hcnlTdGF0dXModXBkYXRlVG9vbENhbGxJblBhcnRzKHN0YXRlLCBhY3Rpb24udHVybklkLCBhY3Rpb24udG9vbENhbGxJZCwgdGMgPT4ge1xuXHRcdFx0XHRpZiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRjO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGJhc2UgPSB0Y0Jhc2VXaXRoTWV0YSh0YywgYWN0aW9uLl9tZXRhKTtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRPcHRpb24gPSByZXNvbHZlU2VsZWN0ZWRPcHRpb24odGMub3B0aW9ucywgYWN0aW9uLnNlbGVjdGVkT3B0aW9uSWQpO1xuXHRcdFx0XHRpZiAoYWN0aW9uLmFwcHJvdmVkKSB7XG5cdFx0XHRcdFx0Y29uc3QgdG9vbElucHV0ID0gYWN0aW9uLmVkaXRlZFRvb2xJbnB1dCAhPT0gdW5kZWZpbmVkICYmIHR5cGVvZiB0Yy50b29sSW5wdXQgPT09ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHQ/IGFjdGlvbi5lZGl0ZWRUb29sSW5wdXRcblx0XHRcdFx0XHRcdDogdGMudG9vbElucHV0O1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHRcdFx0XHQuLi5iYXNlLFxuXHRcdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHRjLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHRcdFx0dG9vbElucHV0LFxuXHRcdFx0XHRcdFx0Y29uZmlybWVkOiBhY3Rpb24uY29uZmlybWVkLFxuXHRcdFx0XHRcdFx0Li4uKHNlbGVjdGVkT3B0aW9uID8geyBzZWxlY3RlZE9wdGlvbiB9IDoge30pLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNhbmNlbGxlZCxcblx0XHRcdFx0XHQuLi5iYXNlLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiB0Yy5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdFx0XHR0b29sSW5wdXQ6IHRjLnRvb2xJbnB1dCxcblx0XHRcdFx0XHRyZWFzb246IGFjdGlvbi5yZWFzb24sXG5cdFx0XHRcdFx0cmVhc29uTWVzc2FnZTogYWN0aW9uLnJlYXNvbk1lc3NhZ2UsXG5cdFx0XHRcdFx0dXNlclN1Z2dlc3Rpb246IGFjdGlvbi51c2VyU3VnZ2VzdGlvbixcblx0XHRcdFx0XHQuLi4oc2VsZWN0ZWRPcHRpb24gPyB7IHNlbGVjdGVkT3B0aW9uIH0gOiB7fSksXG5cdFx0XHRcdH07XG5cdFx0XHR9KSk7XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGU6XG5cdFx0XHRyZXR1cm4gcmVmcmVzaFN1bW1hcnlTdGF0dXModXBkYXRlVG9vbENhbGxJblBhcnRzKHN0YXRlLCBhY3Rpb24udHVybklkLCBhY3Rpb24udG9vbENhbGxJZCwgdGMgPT4ge1xuXHRcdFx0XHRpZiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nICYmIHRjLnN0YXR1cyAhPT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbiAmJiB0Yy5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLkF1dGhSZXF1aXJlZCkge1xuXHRcdFx0XHRcdHJldHVybiB0Yztcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBBIHRvb2wgY2FsbCBpbiBgYXV0aC1yZXF1aXJlZGAgY2FuIG9ubHkgYmUgY29tcGxldGVkIHdpdGggYSBmYWlsZWRcblx0XHRcdFx0Ly8gcmVzdWx0IFx1MjAxNCB0aGF0J3MgdGhlIGNsaWVudCBjYW5jZWxsaW5nIHRoZSBpbnZvY2F0aW9uIGluc3RlYWQgb2Zcblx0XHRcdFx0Ly8gcmVzb2x2aW5nIHRoZSBwZW5kaW5nIE1DUCBhdXRoZW50aWNhdGlvbiBjaGFsbGVuZ2UuIEEgKnN1Y2Nlc3NmdWwqXG5cdFx0XHRcdC8vIGNvbXBsZXRpb24gZnJvbSBgYXV0aC1yZXF1aXJlZGAgaXMgaW52YWxpZDogZXhlY3V0aW9uIG5ldmVyXG5cdFx0XHRcdC8vIHJlc3VtZWQgYWZ0ZXIgdGhlIGNoYWxsZW5nZSwgc28gdGhlcmUncyBub3RoaW5nIHRoYXQgY291bGQgaGF2ZVxuXHRcdFx0XHQvLyBwcm9kdWNlZCBhIHJlYWwgcmVzdWx0LiBUaGUgcmVkdWNlciBpZ25vcmVzIGl0LCBsZWF2aW5nIHRoZSB0b29sXG5cdFx0XHRcdC8vIGNhbGwgaW4gYGF1dGgtcmVxdWlyZWRgOyB0aGUgY2xpZW50IG11c3QgcmVzb2x2ZSB0aGUgYXV0aFxuXHRcdFx0XHQvLyBjaGFsbGVuZ2UgKGBjaGF0L3Rvb2xDYWxsQXV0aFJlc29sdmVkYCkgYmVmb3JlIGNvbXBsZXRpbmdcblx0XHRcdFx0Ly8gc3VjY2Vzc2Z1bGx5LlxuXHRcdFx0XHRpZiAodGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5BdXRoUmVxdWlyZWQgJiYgYWN0aW9uLnJlc3VsdC5zdWNjZXNzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRjO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGJhc2UgPSB0Y0Jhc2VXaXRoTWV0YSh0YywgYWN0aW9uLl9tZXRhKTtcblx0XHRcdFx0Y29uc3QgY29uZmlybWVkID0gdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nIHx8IHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQXV0aFJlcXVpcmVkXG5cdFx0XHRcdFx0PyB0Yy5jb25maXJtZWRcblx0XHRcdFx0XHQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZDtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRPcHRpb24gPSB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcgfHwgdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5BdXRoUmVxdWlyZWRcblx0XHRcdFx0XHQ/IHRjLnNlbGVjdGVkT3B0aW9uXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdC8vIFByZXNlcnZlIGFueSBwYXJ0aWFsIGNvbnRlbnQgcHJvZHVjZWQgYmVmb3JlIHRoZSBjYWxsIHBhdXNlZCBmb3Jcblx0XHRcdFx0Ly8gYXV0aCBcdTIwMTQgYSBjbGllbnQgY2FuY2VsbGluZyBmcm9tIGBhdXRoLXJlcXVpcmVkYCB3aXRob3V0XG5cdFx0XHRcdC8vIGF1dGhlbnRpY2F0aW5nIG5ldmVyIHJlc3VtZXMgZXhlY3V0aW9uLCBzbyB0aGlzIGlzIHRoZSBvbmx5XG5cdFx0XHRcdC8vIGNvbnRlbnQgdGhlIHRvb2wgZXZlciBwcm9kdWNlZCB1bmxlc3MgYGFjdGlvbi5yZXN1bHRgIG92ZXJyaWRlcyBpdC5cblx0XHRcdFx0Y29uc3QgcHJlQXV0aENvbnRlbnQgPSB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkF1dGhSZXF1aXJlZCA/IHRjLmNvbnRlbnQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdC8vIENhbmNlbGxpbmcgZnJvbSBgYXV0aC1yZXF1aXJlZGAgYWx3YXlzIGNvbXBsZXRlcyB0ZXJtaW5hbGx5OiB0aGVcblx0XHRcdFx0Ly8gcGVuZGluZyBhdXRoIGNoYWxsZW5nZSBpc24ndCBhIFwicGVuZGluZyByZXN1bHRcIiB0aGUgY2xpZW50IGNhblxuXHRcdFx0XHQvLyByZXZpZXcsIHNvIGByZXF1aXJlc1Jlc3VsdENvbmZpcm1hdGlvbmAgaXMgaWdub3JlZCBmb3IgdGhpcyBwYXRoIFx1MjAxNFxuXHRcdFx0XHQvLyBpdCBtdXN0IG5ldmVyIGVudGVyIGBwZW5kaW5nLXJlc3VsdC1jb25maXJtYXRpb25gLlxuXHRcdFx0XHRpZiAoYWN0aW9uLnJlcXVpcmVzUmVzdWx0Q29uZmlybWF0aW9uICYmIHRjLnN0YXR1cyAhPT0gVG9vbENhbGxTdGF0dXMuQXV0aFJlcXVpcmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ1Jlc3VsdENvbmZpcm1hdGlvbixcblx0XHRcdFx0XHRcdC4uLmJhc2UsXG5cdFx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogdGMuaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdFx0XHR0b29sSW5wdXQ6IHRjLnRvb2xJbnB1dCxcblx0XHRcdFx0XHRcdGNvbmZpcm1lZCxcblx0XHRcdFx0XHRcdC4uLihzZWxlY3RlZE9wdGlvbiA/IHsgc2VsZWN0ZWRPcHRpb24gfSA6IHt9KSxcblx0XHRcdFx0XHRcdC4uLihwcmVBdXRoQ29udGVudCA/IHsgY29udGVudDogcHJlQXV0aENvbnRlbnQgfSA6IHt9KSxcblx0XHRcdFx0XHRcdC4uLmFjdGlvbi5yZXN1bHQsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRcdC4uLmJhc2UsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHRjLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHRcdHRvb2xJbnB1dDogdGMudG9vbElucHV0LFxuXHRcdFx0XHRcdGNvbmZpcm1lZCxcblx0XHRcdFx0XHQuLi4oc2VsZWN0ZWRPcHRpb24gPyB7IHNlbGVjdGVkT3B0aW9uIH0gOiB7fSksXG5cdFx0XHRcdFx0Li4uKHByZUF1dGhDb250ZW50ID8geyBjb250ZW50OiBwcmVBdXRoQ29udGVudCB9IDoge30pLFxuXHRcdFx0XHRcdC4uLmFjdGlvbi5yZXN1bHQsXG5cdFx0XHRcdH07XG5cdFx0XHR9KSk7XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVzdWx0Q29uZmlybWVkOlxuXHRcdFx0cmV0dXJuIHJlZnJlc2hTdW1tYXJ5U3RhdHVzKHVwZGF0ZVRvb2xDYWxsSW5QYXJ0cyhzdGF0ZSwgYWN0aW9uLnR1cm5JZCwgYWN0aW9uLnRvb2xDYWxsSWQsIHRjID0+IHtcblx0XHRcdFx0aWYgKHRjLnN0YXR1cyAhPT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ1Jlc3VsdENvbmZpcm1hdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiB0Yztcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBiYXNlID0gdGNCYXNlV2l0aE1ldGEodGMsIGFjdGlvbi5fbWV0YSk7XG5cdFx0XHRcdGlmIChhY3Rpb24uYXBwcm92ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdFx0XHQuLi5iYXNlLFxuXHRcdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHRjLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHRcdFx0dG9vbElucHV0OiB0Yy50b29sSW5wdXQsXG5cdFx0XHRcdFx0XHRjb25maXJtZWQ6IHRjLmNvbmZpcm1lZCxcblx0XHRcdFx0XHRcdC4uLih0Yy5zZWxlY3RlZE9wdGlvbiA/IHsgc2VsZWN0ZWRPcHRpb246IHRjLnNlbGVjdGVkT3B0aW9uIH0gOiB7fSksXG5cdFx0XHRcdFx0XHRzdWNjZXNzOiB0Yy5zdWNjZXNzLFxuXHRcdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogdGMucGFzdFRlbnNlTWVzc2FnZSxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IHRjLmNvbnRlbnQsXG5cdFx0XHRcdFx0XHRzdHJ1Y3R1cmVkQ29udGVudDogdGMuc3RydWN0dXJlZENvbnRlbnQsXG5cdFx0XHRcdFx0XHRlcnJvcjogdGMuZXJyb3IsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ2FuY2VsbGVkLFxuXHRcdFx0XHRcdC4uLmJhc2UsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHRjLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHRcdHRvb2xJbnB1dDogdGMudG9vbElucHV0LFxuXHRcdFx0XHRcdHJlYXNvbjogVG9vbENhbGxDYW5jZWxsYXRpb25SZWFzb24uUmVzdWx0RGVuaWVkLFxuXHRcdFx0XHRcdC4uLih0Yy5zZWxlY3RlZE9wdGlvbiA/IHsgc2VsZWN0ZWRPcHRpb246IHRjLnNlbGVjdGVkT3B0aW9uIH0gOiB7fSksXG5cdFx0XHRcdH07XG5cdFx0XHR9KSk7XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29udGVudENoYW5nZWQ6XG5cdFx0XHRyZXR1cm4gdXBkYXRlVG9vbENhbGxJblBhcnRzKHN0YXRlLCBhY3Rpb24udHVybklkLCBhY3Rpb24udG9vbENhbGxJZCwgdGMgPT4ge1xuXHRcdFx0XHRpZiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRjO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Li4udGMsXG5cdFx0XHRcdFx0Li4uKGFjdGlvbi5fbWV0YSAhPT0gdW5kZWZpbmVkID8geyBfbWV0YTogYWN0aW9uLl9tZXRhIH0gOiB7fSksXG5cdFx0XHRcdFx0Y29udGVudDogYWN0aW9uLmNvbnRlbnQsXG5cdFx0XHRcdH07XG5cdFx0XHR9KTtcblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxBdXRoUmVxdWlyZWQ6XG5cdFx0XHRyZXR1cm4gcmVmcmVzaFN1bW1hcnlTdGF0dXModXBkYXRlVG9vbENhbGxJblBhcnRzKHN0YXRlLCBhY3Rpb24udHVybklkLCBhY3Rpb24udG9vbENhbGxJZCwgdGMgPT4ge1xuXHRcdFx0XHRpZiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRjO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEludmFyaWFudDogYXV0aC1yZXF1aXJlZCBvbmx5IGFwcGxpZXMgdG8gTUNQLWNvbnRyaWJ1dGVkIHRvb2wgY2FsbHMuXG5cdFx0XHRcdGlmICghdGMuY29udHJpYnV0b3IgfHwgdGMuY29udHJpYnV0b3Iua2luZCAhPT0gVG9vbENhbGxDb250cmlidXRvcktpbmQuTUNQKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRjO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGJhc2UgPSB0Y0Jhc2VXaXRoTWV0YSh0YywgYWN0aW9uLl9tZXRhKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkF1dGhSZXF1aXJlZCxcblx0XHRcdFx0XHQuLi5iYXNlLFxuXHRcdFx0XHRcdGNvbnRyaWJ1dG9yOiB0Yy5jb250cmlidXRvcixcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogdGMuaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdFx0dG9vbElucHV0OiB0Yy50b29sSW5wdXQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiB0Yy5jb25maXJtZWQsXG5cdFx0XHRcdFx0Li4uKHRjLnNlbGVjdGVkT3B0aW9uID8geyBzZWxlY3RlZE9wdGlvbjogdGMuc2VsZWN0ZWRPcHRpb24gfSA6IHt9KSxcblx0XHRcdFx0XHQuLi4odGMuY29udGVudCA/IHsgY29udGVudDogdGMuY29udGVudCB9IDoge30pLFxuXHRcdFx0XHRcdGF1dGg6IGFjdGlvbi5hdXRoLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSkpO1xuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbEF1dGhSZXNvbHZlZDpcblx0XHRcdHJldHVybiByZWZyZXNoU3VtbWFyeVN0YXR1cyh1cGRhdGVUb29sQ2FsbEluUGFydHMoc3RhdGUsIGFjdGlvbi50dXJuSWQsIGFjdGlvbi50b29sQ2FsbElkLCB0YyA9PiB7XG5cdFx0XHRcdGlmICh0Yy5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLkF1dGhSZXF1aXJlZCkge1xuXHRcdFx0XHRcdHJldHVybiB0Yztcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBiYXNlID0gdGNCYXNlV2l0aE1ldGEodGMsIGFjdGlvbi5fbWV0YSk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLFxuXHRcdFx0XHRcdC4uLmJhc2UsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHRjLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHRcdHRvb2xJbnB1dDogdGMudG9vbElucHV0LFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogdGMuY29uZmlybWVkLFxuXHRcdFx0XHRcdC4uLih0Yy5zZWxlY3RlZE9wdGlvbiA/IHsgc2VsZWN0ZWRPcHRpb246IHRjLnNlbGVjdGVkT3B0aW9uIH0gOiB7fSksXG5cdFx0XHRcdFx0Li4uKHRjLmNvbnRlbnQgPyB7IGNvbnRlbnQ6IHRjLmNvbnRlbnQgfSA6IHt9KSxcblx0XHRcdFx0fTtcblx0XHRcdH0pKTtcblxuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRVc2FnZTpcblx0XHRcdGlmICghc3RhdGUuYWN0aXZlVHVybiB8fCBzdGF0ZS5hY3RpdmVUdXJuLmlkICE9PSBhY3Rpb24udHVybklkKSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLnN0YXRlLFxuXHRcdFx0XHRhY3RpdmVUdXJuOiB7IC4uLnN0YXRlLmFjdGl2ZVR1cm4sIHVzYWdlOiBhY3Rpb24udXNhZ2UgfSxcblx0XHRcdH07XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFJlYXNvbmluZzpcblx0XHRcdHJldHVybiB1cGRhdGVSZXNwb25zZVBhcnQoc3RhdGUsIGFjdGlvbi50dXJuSWQsIGFjdGlvbi5wYXJ0SWQsIHBhcnQgPT4ge1xuXHRcdFx0XHRpZiAocGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlJlYXNvbmluZykge1xuXHRcdFx0XHRcdHJldHVybiB7IC4uLnBhcnQsIGNvbnRlbnQ6IHBhcnQuY29udGVudCArIGFjdGlvbi5jb250ZW50IH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHBhcnQ7XG5cdFx0XHR9KTtcblxuXG5cdFx0Ly8gXHUyNTAwXHUyNTAwIFRydW5jYXRpb24gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRydW5jYXRlZDoge1xuXHRcdFx0bGV0IHR1cm5zOiB0eXBlb2Ygc3RhdGUudHVybnM7XG5cdFx0XHRpZiAoYWN0aW9uLnR1cm5JZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHR1cm5zID0gW107XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBpZHggPSBzdGF0ZS50dXJucy5maW5kSW5kZXgodCA9PiB0LmlkID09PSBhY3Rpb24udHVybklkKTtcblx0XHRcdFx0aWYgKGlkeCA8IDApIHtcblx0XHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dHVybnMgPSBzdGF0ZS50dXJucy5zbGljZSgwLCBpZHggKyAxKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG5leHQ6IENoYXRTdGF0ZSA9IHtcblx0XHRcdFx0Li4uc3RhdGUsXG5cdFx0XHRcdHR1cm5zLFxuXHRcdFx0XHRhY3RpdmVUdXJuOiB1bmRlZmluZWQsXG5cdFx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKERhdGUubm93KCkpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHR9O1xuXHRcdFx0aWYgKGFjdGlvbi50dXJuSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRkZWxldGUgbmV4dC50dXJuc05leHRDdXJzb3I7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5uZXh0LFxuXHRcdFx0XHRzdGF0dXM6IHN1bW1hcnlTdGF0dXMobmV4dCksXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VHVybnNMb2FkZWQ6IHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nSWRzID0gbmV3IFNldChzdGF0ZS50dXJucy5tYXAodHVybiA9PiB0dXJuLmlkKSk7XG5cdFx0XHRjb25zdCBvbGRlclR1cm5zID0gYWN0aW9uLnR1cm5zLmZpbHRlcih0dXJuID0+ICFleGlzdGluZ0lkcy5oYXModHVybi5pZCkpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4uc3RhdGUsXG5cdFx0XHRcdHR1cm5zOiBbLi4ub2xkZXJUdXJucywgLi4uc3RhdGUudHVybnNdLFxuXHRcdFx0XHR0dXJuc05leHRDdXJzb3I6IGFjdGlvbi50dXJuc05leHRDdXJzb3IsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIFx1MjUwMFx1MjUwMCBTZXNzaW9uIElucHV0IFJlcXVlc3RzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRJbnB1dFJlcXVlc3RlZDpcblx0XHRcdHJldHVybiB1cHNlcnRJbnB1dFJlcXVlc3RQYXJ0KHN0YXRlLCBhY3Rpb24ucmVxdWVzdCk7XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdElucHV0QW5zd2VyQ2hhbmdlZDoge1xuXHRcdFx0Y29uc3QgYWN0aXZlVHVybiA9IHN0YXRlLmFjdGl2ZVR1cm47XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IGFjdGl2ZVR1cm5cblx0XHRcdFx0PyBmaW5kT3BlbklucHV0UmVxdWVzdFBhcnQoYWN0aXZlVHVybi5yZXNwb25zZVBhcnRzLCBhY3Rpb24ucmVxdWVzdElkKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdGlmICghYWN0aXZlVHVybiB8fCAhZXhpc3RpbmcpIHtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgeyBpbmRleCwgcGFydCB9ID0gZXhpc3Rpbmc7XG5cdFx0XHRjb25zdCByZXF1ZXN0ID0gcGFydC5yZXF1ZXN0O1xuXHRcdFx0Y29uc3QgYW5zd2VycyA9IHsgLi4uKHJlcXVlc3QuYW5zd2VycyA/PyB7fSkgfTtcblx0XHRcdGlmIChhY3Rpb24uYW5zd2VyID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0ZGVsZXRlIGFuc3dlcnNbYWN0aW9uLnF1ZXN0aW9uSWRdO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YW5zd2Vyc1thY3Rpb24ucXVlc3Rpb25JZF0gPSBhY3Rpb24uYW5zd2VyO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzcG9uc2VQYXJ0cyA9IFsuLi5hY3RpdmVUdXJuLnJlc3BvbnNlUGFydHNdO1xuXHRcdFx0cmVzcG9uc2VQYXJ0c1tpbmRleF0gPSB7XG5cdFx0XHRcdC4uLnBhcnQsXG5cdFx0XHRcdHJlcXVlc3Q6IHtcblx0XHRcdFx0XHQuLi5yZXF1ZXN0LFxuXHRcdFx0XHRcdGFuc3dlcnM6IE9iamVjdC5rZXlzKGFuc3dlcnMpLmxlbmd0aCA+IDAgPyBhbnN3ZXJzIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLnN0YXRlLFxuXHRcdFx0XHRhY3RpdmVUdXJuOiB7XG5cdFx0XHRcdFx0Li4uYWN0aXZlVHVybixcblx0XHRcdFx0XHRyZXNwb25zZVBhcnRzLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZShEYXRlLm5vdygpKS50b0lTT1N0cmluZygpLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdElucHV0Q29tcGxldGVkOiB7XG5cdFx0XHRjb25zdCBhY3RpdmVUdXJuID0gc3RhdGUuYWN0aXZlVHVybjtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gYWN0aXZlVHVyblxuXHRcdFx0XHQ/IGZpbmRPcGVuSW5wdXRSZXF1ZXN0UGFydChhY3RpdmVUdXJuLnJlc3BvbnNlUGFydHMsIGFjdGlvbi5yZXF1ZXN0SWQpXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKCFhY3RpdmVUdXJuIHx8ICFleGlzdGluZykge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB7IGluZGV4LCBwYXJ0IH0gPSBleGlzdGluZztcblx0XHRcdGNvbnN0IGZpbmFsQW5zd2VycyA9IHsgLi4uKHBhcnQucmVxdWVzdC5hbnN3ZXJzID8/IHt9KSwgLi4uKGFjdGlvbi5hbnN3ZXJzID8/IHt9KSB9O1xuXHRcdFx0Y29uc3QgcmVzcG9uc2VQYXJ0cyA9IFsuLi5hY3RpdmVUdXJuLnJlc3BvbnNlUGFydHNdO1xuXHRcdFx0cmVzcG9uc2VQYXJ0c1tpbmRleF0gPSB7XG5cdFx0XHRcdC4uLnBhcnQsXG5cdFx0XHRcdHJlcXVlc3Q6IHtcblx0XHRcdFx0XHQuLi5wYXJ0LnJlcXVlc3QsXG5cdFx0XHRcdFx0YW5zd2VyczogT2JqZWN0LmtleXMoZmluYWxBbnN3ZXJzKS5sZW5ndGggPiAwID8gZmluYWxBbnN3ZXJzIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXNwb25zZTogYWN0aW9uLnJlc3BvbnNlLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IG5leHQ6IENoYXRTdGF0ZSA9IHtcblx0XHRcdFx0Li4uc3RhdGUsXG5cdFx0XHRcdGFjdGl2ZVR1cm46IHtcblx0XHRcdFx0XHQuLi5hY3RpdmVUdXJuLFxuXHRcdFx0XHRcdHJlc3BvbnNlUGFydHMsXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4ubmV4dCxcblx0XHRcdFx0c3RhdHVzOiBzdW1tYXJ5U3RhdHVzKG5leHQpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZShEYXRlLm5vdygpKS50b0lTT1N0cmluZygpLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBcdTI1MDBcdTI1MDAgUGVuZGluZyBNZXNzYWdlcyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VTZXQ6IHtcblx0XHRcdGNvbnN0IGVudHJ5OiBQZW5kaW5nTWVzc2FnZSA9IHsgaWQ6IGFjdGlvbi5pZCwgbWVzc2FnZTogYWN0aW9uLm1lc3NhZ2UgfTtcblx0XHRcdGlmIChhY3Rpb24ua2luZCA9PT0gUGVuZGluZ01lc3NhZ2VLaW5kLlN0ZWVyaW5nKSB7XG5cdFx0XHRcdHJldHVybiB7IC4uLnN0YXRlLCBzdGVlcmluZ01lc3NhZ2U6IGVudHJ5IH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHN0YXRlLnF1ZXVlZE1lc3NhZ2VzID8/IFtdO1xuXHRcdFx0Y29uc3QgaWR4ID0gZXhpc3RpbmcuZmluZEluZGV4KG0gPT4gbS5pZCA9PT0gYWN0aW9uLmlkKTtcblx0XHRcdGlmIChpZHggPj0gMCkge1xuXHRcdFx0XHRjb25zdCB1cGRhdGVkID0gWy4uLmV4aXN0aW5nXTtcblx0XHRcdFx0dXBkYXRlZFtpZHhdID0gZW50cnk7XG5cdFx0XHRcdHJldHVybiB7IC4uLnN0YXRlLCBxdWV1ZWRNZXNzYWdlczogdXBkYXRlZCB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIHF1ZXVlZE1lc3NhZ2VzOiBbLi4uZXhpc3RpbmcsIGVudHJ5XSB9O1xuXHRcdH1cblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VSZW1vdmVkOiB7XG5cdFx0XHRpZiAoYWN0aW9uLmtpbmQgPT09IFBlbmRpbmdNZXNzYWdlS2luZC5TdGVlcmluZykge1xuXHRcdFx0XHRpZiAoIXN0YXRlLnN0ZWVyaW5nTWVzc2FnZSB8fCBzdGF0ZS5zdGVlcmluZ01lc3NhZ2UuaWQgIT09IGFjdGlvbi5pZCkge1xuXHRcdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgc3RlZXJpbmdNZXNzYWdlOiB1bmRlZmluZWQgfTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gc3RhdGUucXVldWVkTWVzc2FnZXM7XG5cdFx0XHRpZiAoIWV4aXN0aW5nKSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZpbHRlcmVkID0gZXhpc3RpbmcuZmlsdGVyKG0gPT4gbS5pZCAhPT0gYWN0aW9uLmlkKTtcblx0XHRcdHJldHVybiBmaWx0ZXJlZC5sZW5ndGggPT09IGV4aXN0aW5nLmxlbmd0aFxuXHRcdFx0XHQ/IHN0YXRlXG5cdFx0XHRcdDogeyAuLi5zdGF0ZSwgcXVldWVkTWVzc2FnZXM6IGZpbHRlcmVkLmxlbmd0aCA+IDAgPyBmaWx0ZXJlZCA6IHVuZGVmaW5lZCB9O1xuXHRcdH1cblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0UXVldWVkTWVzc2FnZXNSZW9yZGVyZWQ6IHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gc3RhdGUucXVldWVkTWVzc2FnZXM7XG5cdFx0XHRpZiAoIWV4aXN0aW5nKSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGJ5SWQgPSBuZXcgTWFwKGV4aXN0aW5nLm1hcChtID0+IFttLmlkLCBtXSkpO1xuXHRcdFx0Y29uc3Qgb3JkZXJlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0Y29uc3QgcmVvcmRlcmVkID0gYWN0aW9uLm9yZGVyXG5cdFx0XHRcdC5maWx0ZXIoaWQgPT4ge1xuXHRcdFx0XHRcdGlmIChieUlkLmhhcyhpZCkgJiYgIW9yZGVyZWQuaGFzKGlkKSkge1xuXHRcdFx0XHRcdFx0b3JkZXJlZC5hZGQoaWQpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fSlcblx0XHRcdFx0Lm1hcChpZCA9PiBieUlkLmdldChpZCkhKTtcblx0XHRcdC8vIEFwcGVuZCBhbnkgbWVzc2FnZXMgbm90IG1lbnRpb25lZCBpbiBvcmRlciwgcHJlc2VydmluZyBvcmlnaW5hbCBvcmRlclxuXHRcdFx0Zm9yIChjb25zdCBtIG9mIGV4aXN0aW5nKSB7XG5cdFx0XHRcdGlmICghb3JkZXJlZC5oYXMobS5pZCkpIHtcblx0XHRcdFx0XHRyZW9yZGVyZWQucHVzaChtKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIHF1ZXVlZE1lc3NhZ2VzOiByZW9yZGVyZWQgfTtcblx0XHR9XG5cblx0XHQvLyBcdTI1MDBcdTI1MDAgRHJhZnQgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdERyYWZ0Q2hhbmdlZDpcblx0XHRcdHJldHVybiB7IC4uLnN0YXRlLCBkcmFmdDogYWN0aW9uLmRyYWZ0IH07XG5cblx0XHRkZWZhdWx0OlxuXHRcdFx0c29mdEFzc2VydE5ldmVyKGFjdGlvbiwgbG9nKTtcblx0XHRcdHJldHVybiBzdGF0ZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBUUEsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXLGdCQUFnQiw0QkFBNEIsNEJBQTRCLHlCQUF5QixrQkFBa0IsMEJBQThOO0FBQ3JXLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsdUJBQXVCO0FBS2hDLFNBQVMsT0FBTyxJQUFtQjtBQUNsQyxTQUFPO0FBQUEsSUFDTixZQUFZLEdBQUc7QUFBQSxJQUNmLFVBQVUsR0FBRztBQUFBLElBQ2IsYUFBYSxHQUFHO0FBQUEsSUFDaEIsV0FBVyxHQUFHO0FBQUEsSUFDZCxhQUFhLEdBQUc7QUFBQSxJQUNoQixPQUFPLEdBQUc7QUFBQSxFQUNYO0FBQ0Q7QUFFQSxTQUFTLGVBQWUsSUFBbUIsTUFBMkM7QUFDckYsU0FBTztBQUFBLElBQ04sR0FBRyxPQUFPLEVBQUU7QUFBQSxJQUNaLE9BQU8sUUFBUSxHQUFHO0FBQUEsRUFDbkI7QUFDRDtBQUVBLFNBQVMsMEJBQ1IsU0FDQSxNQUNBLEtBQ2tDO0FBQ2xDLE1BQUksQ0FBQyxNQUFNO0FBQ1YsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLFNBQVMsU0FBUyx3QkFBd0IsUUFBUTtBQUNyRCxRQUFJLEtBQUssU0FBUyx3QkFBd0IsVUFBVSxLQUFLLGFBQWEsUUFBUSxVQUFVO0FBQ3ZGLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSwwREFBMEQsUUFBUSxRQUFRLEdBQUc7QUFDbkYsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLEtBQUssU0FBUyx3QkFBd0IsUUFBUTtBQUNqRCxVQUFNLHFDQUFxQyxLQUFLLFFBQVEsNkVBQTZFO0FBQ3JJLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTztBQUNSO0FBR0EsU0FBUyxzQkFBc0IsU0FBMkMsSUFBd0Q7QUFDakksTUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTO0FBQ3BCLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTyxRQUFRLEtB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
