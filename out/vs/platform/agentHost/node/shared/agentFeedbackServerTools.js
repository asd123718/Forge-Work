import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { FEEDBACK_ANNOTATION_META_KEY, readFeedbackAnnotationMeta, VIEW_UNREVIEWED_COMMENTS_TOOL_NAME, ADD_COMMENT_TOOL_NAME } from "../../common/meta/agentFeedbackAnnotations.js";
import { buildAnnotationsUri } from "../../common/annotationsUri.js";
import { ActionType } from "../../common/state/protocol/common/actions.js";
import { parseChatUri } from "../../common/state/sessionState.js";
const addCommentToolName = ADD_COMMENT_TOOL_NAME;
const listCommentsToolName = "listComments";
const deleteCommentsToolName = "deleteComments";
const resolveCommentsToolName = "resolveComments";
const viewUnreviewedCommentsToolName = VIEW_UNREVIEWED_COMMENTS_TOOL_NAME;
const REVIEWABLE_FEEDBACK_KINDS = /* @__PURE__ */ new Set(["prReview", "codeReview"]);
const feedbackConfirmationToolNames = /* @__PURE__ */ new Set([viewUnreviewedCommentsToolName]);
function feedbackToolRequiresConfirmation(toolName) {
  return feedbackConfirmationToolNames.has(toolName);
}
const addCommentInputSchema = {
  type: "object",
  properties: {
    resourceUri: { type: "string", description: "URI of the file to add a comment to." },
    range: {
      type: "object",
      description: "One-based text range to comment on.",
      properties: {
        startLineNumber: { type: "number", description: "One-based start line number." },
        startColumn: { type: "number", description: "One-based start column." },
        endLineNumber: { type: "number", description: "One-based end line number." },
        endColumn: { type: "number", description: "One-based end column." }
      },
      required: ["startLineNumber", "startColumn", "endLineNumber", "endColumn"]
    },
    text: { type: "string", description: "Comment text to add." }
  },
  required: ["resourceUri", "range", "text"]
};
const listCommentsInputSchema = {
  type: "object",
  properties: {}
};
const viewUnreviewedCommentsInputSchema = {
  type: "object",
  properties: {}
};
const deleteCommentsInputSchema = {
  type: "object",
  properties: {
    commentIds: { type: "array", items: { type: "string" }, description: "Comment IDs to delete." }
  },
  required: ["commentIds"]
};
const resolveCommentsInputSchema = {
  type: "object",
  properties: {
    commentIds: { type: "array", items: { type: "string" }, description: "Comment IDs to update." },
    resolved: { type: "boolean", description: "Whether the comments should be marked as resolved. Defaults to true." }
  },
  required: ["commentIds"]
};
const feedbackServerToolDefinitions = [
  {
    name: addCommentToolName,
    title: "Add Comment (Agent Feedback)",
    description: "Add a comment to a file range.",
    inputSchema: addCommentInputSchema,
    annotations: { readOnlyHint: false }
  },
  {
    name: listCommentsToolName,
    title: "List Comments (Agent Feedback)",
    description: "List comments for this session.",
    inputSchema: listCommentsInputSchema,
    annotations: { readOnlyHint: true }
  },
  {
    name: deleteCommentsToolName,
    title: "Delete Comments (Agent Feedback)",
    description: "Delete comments for this session.",
    inputSchema: deleteCommentsInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: true }
  },
  {
    name: resolveCommentsToolName,
    title: "Resolve Comments (Agent Feedback)",
    description: "Mark comments for this session as resolved or unresolved.",
    inputSchema: resolveCommentsInputSchema,
    annotations: { readOnlyHint: false }
  },
  {
    name: viewUnreviewedCommentsToolName,
    title: "View Unreviewed Comments (Agent Feedback)",
    description: "View pull request or code review comments that the user has not reviewed yet. The user may be asked to choose which comments to reveal, in which case only the comments they select are returned; otherwise every unreviewed comment is returned.",
    inputSchema: viewUnreviewedCommentsInputSchema,
    annotations: { readOnlyHint: false }
  }
];
function getRequiredString(value, field, toolName) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${toolName} input: ${field} must be a non-empty string.`);
  }
  return value;
}
function getRequiredPositiveInteger(value, field, toolName) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid ${toolName} input: ${field} must be a positive integer.`);
  }
  return value;
}
function getAddCommentArgs(rawArgs) {
  const args = rawArgs ?? {};
  const resourceUri = getRequiredString(args.resourceUri, "resourceUri", addCommentToolName);
  const text = getRequiredString(args.text, "text", addCommentToolName);
  if (!args.range || typeof args.range !== "object" || Array.isArray(args.range)) {
    throw new Error(`Invalid ${addCommentToolName} input: range must be an object.`);
  }
  const range = args.range;
  return {
    resourceUri,
    text,
    range: {
      startLineNumber: getRequiredPositiveInteger(range.startLineNumber, "range.startLineNumber", addCommentToolName),
      startColumn: getRequiredPositiveInteger(range.startColumn, "range.startColumn", addCommentToolName),
      endLineNumber: getRequiredPositiveInteger(range.endLineNumber, "range.endLineNumber", addCommentToolName),
      endColumn: getRequiredPositiveInteger(range.endColumn, "range.endColumn", addCommentToolName)
    }
  };
}
function getUniqueCommentIds(value, toolName) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Invalid ${toolName} input: commentIds must be a non-empty string array.`);
  }
  const ids = [];
  for (const item of value) {
    ids.push(getRequiredString(item, "commentIds[]", toolName));
  }
  return [...new Set(ids)];
}
function getResolvedFlag(value) {
  if (value === void 0) {
    return true;
  }
  if (typeof value !== "boolean") {
    throw new Error(`Invalid ${resolveCommentsToolName} input: resolved must be a boolean.`);
  }
  return value;
}
function toTextRange(range) {
  return {
    start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
    end: { line: range.endLineNumber - 1, character: range.endColumn - 1 }
  };
}
function fromTextRange(range) {
  if (!range) {
    return { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
  }
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1
  };
}
function entryText(text) {
  return typeof text === "string" ? text : text.markdown;
}
function readMeta(annotation) {
  return readFeedbackAnnotationMeta(annotation);
}
function serializeComment(annotation) {
  const entries = annotation.entries ?? [];
  const meta = readMeta(annotation);
  const replies = entries.slice(1).map((e) => entryText(e.text));
  return {
    id: annotation.id,
    resourceUri: annotation.resource,
    range: fromTextRange(annotation.range),
    text: entries.length ? entryText(entries[0].text) : "",
    kind: meta?.kind ?? "user",
    resolved: annotation.resolved,
    ...replies.length ? { replies } : {}
  };
}
function listableAnnotations(state) {
  return state.annotations.filter((annotation) => {
    const meta = readMeta(annotation);
    if (!meta || !annotation.entries?.length) {
      return false;
    }
    const effectiveState = annotation.resolved ? "resolved" : meta.state ?? "accepted";
    return effectiveState !== "created";
  });
}
function pendingRevealAnnotations(state) {
  return state.annotations.filter((annotation) => {
    const meta = readMeta(annotation);
    if (!meta || !annotation.entries?.length) {
      return false;
    }
    return REVIEWABLE_FEEDBACK_KINDS.has(meta.kind) && meta.pendingAgentReveal === true;
  });
}
function clearPendingReveal(annotation) {
  const meta = readMeta(annotation);
  if (!meta) {
    return annotation;
  }
  const nextMeta = { ...meta, pendingAgentReveal: void 0 };
  return { ...annotation, _meta: { ...annotation._meta, [FEEDBACK_ANNOTATION_META_KEY]: nextMeta } };
}
function markSubmitted(annotation) {
  const meta = readMeta(annotation);
  if (!meta) {
    return annotation;
  }
  const nextMeta = { ...meta, state: "submitted", pendingAgentReveal: void 0 };
  return { ...annotation, _meta: { ...annotation._meta, [FEEDBACK_ANNOTATION_META_KEY]: nextMeta } };
}
function createdReviewableAnnotations(state) {
  return state.annotations.filter((annotation) => {
    const meta = readMeta(annotation);
    if (!meta || !annotation.entries?.length) {
      return false;
    }
    return REVIEWABLE_FEEDBACK_KINDS.has(meta.kind) && !annotation.resolved && (meta.state ?? "accepted") === "created";
  });
}
function hasRevealableComments(state) {
  return pendingRevealAnnotations(state).length > 0 || createdReviewableAnnotations(state).length > 0;
}
function buildUnreviewedCommentsNote(state) {
  const created = createdReviewableAnnotations(state);
  if (!created.length) {
    return void 0;
  }
  let prCount = 0;
  let codeReviewCount = 0;
  for (const annotation of created) {
    const kind = readMeta(annotation)?.kind;
    if (kind === "prReview") {
      prCount++;
    } else if (kind === "codeReview") {
      codeReviewCount++;
    }
  }
  const clauses = [];
  if (prCount > 0) {
    clauses.push(`${prCount} pull request comment${prCount === 1 ? "" : "s"}`);
  }
  if (codeReviewCount > 0) {
    clauses.push(`${codeReviewCount} code review comment${codeReviewCount === 1 ? "" : "s"}`);
  }
  const subject = clauses.join(" and ");
  const verb = created.length === 1 ? "is" : "are";
  return `There ${verb} ${subject} which the user has not reviewed yet. If the user wants you to tackle them, call the \`${viewUnreviewedCommentsToolName}\` tool to view them.`;
}
function applyFeedbackTool(state, sessionResource, toolName, rawArgs) {
  switch (toolName) {
    case addCommentToolName: {
      const { resourceUri, range, text } = getAddCommentArgs(rawArgs);
      const id = generateUuid();
      const meta = { kind: "codeReview", state: "created", sessionResource };
      const annotation = {
        id,
        turnId: "",
        resource: resourceUri,
        range: toTextRange(range),
        resolved: false,
        entries: [{ id: `${id}:0`, text }],
        _meta: { [FEEDBACK_ANNOTATION_META_KEY]: meta }
      };
      return {
        actions: [{ type: ActionType.AnnotationsSet, annotation }],
        result: "Comment added."
      };
    }
    case listCommentsToolName: {
      const payload = {
        comments: listableAnnotations(state).map(serializeComment)
      };
      const note = buildUnreviewedCommentsNote(state);
      if (note) {
        payload.note = note;
      }
      return { actions: [], result: JSON.stringify(payload, void 0, 2) };
    }
    case viewUnreviewedCommentsToolName: {
      const pending = pendingRevealAnnotations(state);
      if (!pending.length) {
        const unreviewed = createdReviewableAnnotations(state);
        return {
          actions: unreviewed.map((annotation) => ({
            type: ActionType.AnnotationsSet,
            annotation: markSubmitted(annotation)
          })),
          result: JSON.stringify({ comments: unreviewed.map(serializeComment) }, void 0, 2)
        };
      }
      const comments = pending.map(serializeComment);
      const actions = pending.map((annotation) => ({
        type: ActionType.AnnotationsSet,
        annotation: clearPendingReveal(annotation)
      }));
      return { actions, result: JSON.stringify({ comments }, void 0, 2) };
    }
    case deleteCommentsToolName: {
      const ids = getUniqueCommentIds(rawArgs?.commentIds, deleteCommentsToolName);
      const listable = listableAnnotations(state);
      const existing = new Map(listable.map((a) => [a.id, a]));
      const actions = [];
      const deleted = [];
      const notFound = [];
      for (const id of ids) {
        if (existing.has(id)) {
          actions.push({ type: ActionType.AnnotationsRemoved, annotationId: id });
          deleted.push(id);
        } else {
          notFound.push(id);
        }
      }
      const remaining = listable.filter((a) => !deleted.includes(a.id)).map(serializeComment);
      return {
        actions,
        result: JSON.stringify({ deletedCommentIds: deleted, notFoundCommentIds: notFound, remainingComments: remaining }, void 0, 2)
      };
    }
    case resolveCommentsToolName: {
      const args = rawArgs ?? {};
      const ids = getUniqueCommentIds(args.commentIds, resolveCommentsToolName);
      const resolved = getResolvedFlag(args.resolved);
      const listable = listableAnnotations(state);
      const existing = new Map(listable.map((a) => [a.id, a]));
      const actions = [];
      const updated = [];
      const notFound = [];
      for (const id of ids) {
        const annotation = existing.get(id);
        if (!annotation) {
          notFound.push(id);
          continue;
        }
        const meta = readMeta(annotation);
        const nextMeta = {
          ...meta,
          kind: meta?.kind ?? "user",
          state: resolved ? "resolved" : "submitted",
          sessionResource: meta?.sessionResource ?? sessionResource
        };
        const nextAnnotation = {
          ...annotation,
          resolved,
          _meta: { ...annotation._meta, [FEEDBACK_ANNOTATION_META_KEY]: nextMeta }
        };
        actions.push({ type: ActionType.AnnotationsSet, annotation: nextAnnotation });
        updated.push(id);
      }
      const comments = listable.map((a) => updated.includes(a.id) ? serializeComment({ ...a, resolved }) : serializeComment(a));
      return {
        actions,
        result: JSON.stringify({ resolved, updatedCommentIds: updated, notFoundCommentIds: notFound, comments }, void 0, 2)
      };
    }
    default:
      throw new Error(`Unknown feedback server tool: ${toolName}`);
  }
}
function getFeedbackToolDisplay(toolName, _args, _result) {
  switch (toolName) {
    case addCommentToolName:
      return {
        displayName: localize("toolName.addComment", "Add Comment"),
        invocationMessage: localize("toolInvoke.addComment", "Add comment")
      };
    case listCommentsToolName:
      return {
        displayName: localize("toolName.listComments", "List Comments"),
        invocationMessage: localize("toolInvoke.listComments", "List comments")
      };
    case deleteCommentsToolName:
      return {
        displayName: localize("toolName.deleteComments", "Delete Comments"),
        invocationMessage: localize("toolInvoke.deleteComments", "Delete comments")
      };
    case resolveCommentsToolName:
      return {
        displayName: localize("toolName.resolveComments", "Resolve Comments"),
        invocationMessage: localize("toolInvoke.resolveComments", "Resolve comments")
      };
    case viewUnreviewedCommentsToolName:
      return {
        displayName: localize("toolName.viewUnreviewedComments", "View Comments"),
        invocationMessage: localize("toolInvoke.viewUnreviewedComments", "View comments")
      };
    default:
      return void 0;
  }
}
const feedbackServerToolGroup = {
  definitions: feedbackServerToolDefinitions,
  isEnabled() {
    return true;
  },
  canRequireConfirmation(toolName) {
    return feedbackToolRequiresConfirmation(toolName);
  },
  requiresConfirmation(stateManager, chatUri, toolName) {
    if (!feedbackToolRequiresConfirmation(toolName)) {
      return false;
    }
    return hasRevealableComments(getFeedbackToolState(stateManager, chatUri).state);
  },
  getDisplay(toolName, args, result) {
    return getFeedbackToolDisplay(toolName, args, result);
  },
  execute(stateManager, chatUri, toolName, rawArgs) {
    const { mainSessionUri, annotationsUri, state } = getFeedbackToolState(stateManager, chatUri);
    const outcome = applyFeedbackTool(state, mainSessionUri, toolName, rawArgs);
    for (const action of outcome.actions) {
      stateManager.dispatchServerAction(annotationsUri, action);
    }
    return outcome.result;
  }
};
function getFeedbackToolState(stateManager, chatUri) {
  const mainSessionUri = parseChatUri(chatUri)?.session ?? chatUri;
  const annotationsUri = buildAnnotationsUri(mainSessionUri);
  const snapshot = stateManager.getSnapshot(annotationsUri);
  const state = snapshot?.state ?? { annotations: [] };
  return { mainSessionUri, annotationsUri, state };
}
export {
  addCommentToolName,
  applyFeedbackTool,
  deleteCommentsToolName,
  feedbackServerToolDefinitions,
  feedbackServerToolGroup,
  feedbackToolRequiresConfirmation,
  listCommentsToolName,
  resolveCommentsToolName,
  viewUnreviewedCommentsToolName
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxzaGFyZWRcXGFnZW50RmVlZGJhY2tTZXJ2ZXJUb29scy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRkVFREJBQ0tfQU5OT1RBVElPTl9NRVRBX0tFWSwgcmVhZEZlZWRiYWNrQW5ub3RhdGlvbk1ldGEsIFZJRVdfVU5SRVZJRVdFRF9DT01NRU5UU19UT09MX05BTUUsIEFERF9DT01NRU5UX1RPT0xfTkFNRSwgdHlwZSBJRmVlZGJhY2tBbm5vdGF0aW9uTWV0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tZXRhL2FnZW50RmVlZGJhY2tBbm5vdGF0aW9ucy5qcyc7XG5pbXBvcnQgeyBidWlsZEFubm90YXRpb25zVXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL2Fubm90YXRpb25zVXJpLmpzJztcbmltcG9ydCB0eXBlIHsgQW5ub3RhdGlvbnNBY3Rpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBwYXJzZUNoYXRVcmksIHR5cGUgQW5ub3RhdGlvbiwgdHlwZSBBbm5vdGF0aW9uc1N0YXRlLCB0eXBlIFN0cmluZ09yTWFya2Rvd24sIHR5cGUgVGV4dFJhbmdlLCB0eXBlIFRvb2xEZWZpbml0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IEFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4uL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgdHlwZSB7IElTZXJ2ZXJUb29sRGlzcGxheSwgSVNlcnZlclRvb2xEaXNwbGF5UmVzdWx0LCBJU2VydmVyVG9vbEdyb3VwIH0gZnJvbSAnLi9hZ2VudFNlcnZlclRvb2xIb3N0LmpzJztcblxuLyoqXG4gKiBTZXJ2ZXItc2lkZSBpbXBsZW1lbnRhdGlvbiBvZiB0aGUgYWdlbnQgZmVlZGJhY2sgKFwiY29tbWVudHNcIikgdG9vbHMuXG4gKlxuICogVGhlc2UgdG9vbHMgdXNlZCB0byBiZSByZWdpc3RlcmVkIG9uIHRoZSBjbGllbnQgKGFnZW50cyB3aW5kb3cpIGFuZCBrZXllZFxuICogb2ZmIGFuIGluLW1lbW9yeSBzdG9yZS4gRm9yIGFnZW50LWhvc3Qgc2Vzc2lvbnMgdGhleSBub3cgZXhlY3V0ZSBvbiB0aGVcbiAqIHNlcnZlciBhZ2FpbnN0IHRoZSBzZXNzaW9uJ3MgYW5ub3RhdGlvbnMgY2hhbm5lbDogZWFjaCBjb21tZW50IGlzIGFuXG4gKiB7QGxpbmsgQW5ub3RhdGlvbn0gb24gYDxzZXNzaW9uPi9hbm5vdGF0aW9uc2AsIHdpdGggZmVlZGJhY2sgc2VtYW50aWNzXG4gKiBjYXJyaWVkIGluIHtAbGluayBBbm5vdGF0aW9uLl9tZXRhfSB1bmRlciB7QGxpbmsgRkVFREJBQ0tfQU5OT1RBVElPTl9NRVRBX0tFWX1cbiAqIChzZWUgYGFnZW50RmVlZGJhY2tBbm5vdGF0aW9ucy50c2ApLiBUaGUgZnVuY3Rpb25zIGhlcmUgYXJlIHB1cmUgXHUyMDE0IHRoZXkgcmVhZFxuICogdGhlIGN1cnJlbnQge0BsaW5rIEFubm90YXRpb25zU3RhdGV9IGFuZCByZXR1cm4gdGhlIGFubm90YXRpb24gYWN0aW9ucyB0b1xuICogZGlzcGF0Y2ggcGx1cyBhIHRleHR1YWwgdG9vbCByZXN1bHQgXHUyMDE0IHNvIHRoZXkgY2FuIGJlIHVuaXQgdGVzdGVkIHdpdGhvdXQgYVxuICogcnVubmluZyBzdGF0ZSBtYW5hZ2VyLiBUaGUgaG9zdCB3aXJpbmcgKHJlYWRpbmcgdGhlIHNuYXBzaG90LCBkaXNwYXRjaGluZ1xuICogdGhlIGFjdGlvbnMpIGxpdmVzIGluIHRoZSBjYWxsZXIuXG4gKi9cblxuZXhwb3J0IGNvbnN0IGFkZENvbW1lbnRUb29sTmFtZSA9IEFERF9DT01NRU5UX1RPT0xfTkFNRTtcbmV4cG9ydCBjb25zdCBsaXN0Q29tbWVudHNUb29sTmFtZSA9ICdsaXN0Q29tbWVudHMnO1xuZXhwb3J0IGNvbnN0IGRlbGV0ZUNvbW1lbnRzVG9vbE5hbWUgPSAnZGVsZXRlQ29tbWVudHMnO1xuZXhwb3J0IGNvbnN0IHJlc29sdmVDb21tZW50c1Rvb2xOYW1lID0gJ3Jlc29sdmVDb21tZW50cyc7XG5leHBvcnQgY29uc3Qgdmlld1VucmV2aWV3ZWRDb21tZW50c1Rvb2xOYW1lID0gVklFV19VTlJFVklFV0VEX0NPTU1FTlRTX1RPT0xfTkFNRTtcblxuLyoqXG4gKiBGZWVkYmFjayBraW5kcyB0aGF0IG9yaWdpbmF0ZSBmcm9tIGEgcmV2aWV3IHRoZSB1c2VyIGlzIGV4cGVjdGVkIHRvIHRyaWFnZVxuICogKGEgcHVsbCByZXF1ZXN0IHJldmlldyBvciBhbiBpbi1wcm9kdWN0IGNvZGUgcmV2aWV3KSByYXRoZXIgdGhhbiBiZWluZ1xuICogYXV0aG9yZWQgYnkgdGhlIHVzZXIgZGlyZWN0bHkuIENvbW1lbnRzIG9mIHRoZXNlIGtpbmRzIHRoYXQgYXJlIHN0aWxsIGluIHRoZVxuICogYGNyZWF0ZWRgIHN0YXRlIGFyZSBzdXJmYWNlZCB0byB0aGUgYWdlbnQgdmlhIHRoZSB7QGxpbmsgbGlzdENvbW1lbnRzVG9vbE5hbWV9XG4gKiBub3RlIGFuZCByZXZlYWxlZCB0aHJvdWdoIHtAbGluayB2aWV3VW5yZXZpZXdlZENvbW1lbnRzVG9vbE5hbWV9LlxuICovXG5jb25zdCBSRVZJRVdBQkxFX0ZFRURCQUNLX0tJTkRTOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldChbJ3ByUmV2aWV3JywgJ2NvZGVSZXZpZXcnXSk7XG5cbi8qKlxuICogU2VydmVyIHRvb2xzIHdpdGggYSBjb25maXJtYXRpb24gVUkuIEFuIGV4cGxpY2l0IGF1dG8tYXBwcm92ZSBwb2xpY3kgY2FuXG4gKiBieXBhc3MgdGhlIFVJIGFuZCBpcyByZXBvcnRlZCB0byB0aGUgZXhlY3V0b3IgdGhyb3VnaCBpdHMgZXhlY3V0aW9uIGNvbnRleHQuXG4gKi9cbmNvbnN0IGZlZWRiYWNrQ29uZmlybWF0aW9uVG9vbE5hbWVzOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldChbdmlld1VucmV2aWV3ZWRDb21tZW50c1Rvb2xOYW1lXSk7XG5cbi8qKiBXaGV0aGVyIHRoZSBmZWVkYmFjayBzZXJ2ZXIgdG9vbCBoYXMgYSBjb25maXJtYXRpb24gVUkgd2hlbiBub3QgYXV0by1hcHByb3ZlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmZWVkYmFja1Rvb2xSZXF1aXJlc0NvbmZpcm1hdGlvbih0b29sTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBmZWVkYmFja0NvbmZpcm1hdGlvblRvb2xOYW1lcy5oYXModG9vbE5hbWUpO1xufVxuXG5jb25zdCBhZGRDb21tZW50SW5wdXRTY2hlbWE6IFRvb2xEZWZpbml0aW9uWydpbnB1dFNjaGVtYSddID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdHJlc291cmNlVXJpOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ1VSSSBvZiB0aGUgZmlsZSB0byBhZGQgYSBjb21tZW50IHRvLicgfSxcblx0XHRyYW5nZToge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ09uZS1iYXNlZCB0ZXh0IHJhbmdlIHRvIGNvbW1lbnQgb24uJyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiB7IHR5cGU6ICdudW1iZXInLCBkZXNjcmlwdGlvbjogJ09uZS1iYXNlZCBzdGFydCBsaW5lIG51bWJlci4nIH0sXG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiB7IHR5cGU6ICdudW1iZXInLCBkZXNjcmlwdGlvbjogJ09uZS1iYXNlZCBzdGFydCBjb2x1bW4uJyB9LFxuXHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB7IHR5cGU6ICdudW1iZXInLCBkZXNjcmlwdGlvbjogJ09uZS1iYXNlZCBlbmQgbGluZSBudW1iZXIuJyB9LFxuXHRcdFx0XHRlbmRDb2x1bW46IHsgdHlwZTogJ251bWJlcicsIGRlc2NyaXB0aW9uOiAnT25lLWJhc2VkIGVuZCBjb2x1bW4uJyB9LFxuXHRcdFx0fSxcblx0XHRcdHJlcXVpcmVkOiBbJ3N0YXJ0TGluZU51bWJlcicsICdzdGFydENvbHVtbicsICdlbmRMaW5lTnVtYmVyJywgJ2VuZENvbHVtbiddLFxuXHRcdH0sXG5cdFx0dGV4dDogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246ICdDb21tZW50IHRleHQgdG8gYWRkLicgfSxcblx0fSxcblx0cmVxdWlyZWQ6IFsncmVzb3VyY2VVcmknLCAncmFuZ2UnLCAndGV4dCddLFxufTtcblxuY29uc3QgbGlzdENvbW1lbnRzSW5wdXRTY2hlbWE6IFRvb2xEZWZpbml0aW9uWydpbnB1dFNjaGVtYSddID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge30sXG59O1xuXG5jb25zdCB2aWV3VW5yZXZpZXdlZENvbW1lbnRzSW5wdXRTY2hlbWE6IFRvb2xEZWZpbml0aW9uWydpbnB1dFNjaGVtYSddID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge30sXG59O1xuXG5jb25zdCBkZWxldGVDb21tZW50c0lucHV0U2NoZW1hOiBUb29sRGVmaW5pdGlvblsnaW5wdXRTY2hlbWEnXSA9IHtcblx0dHlwZTogJ29iamVjdCcsXG5cdHByb3BlcnRpZXM6IHtcblx0XHRjb21tZW50SWRzOiB7IHR5cGU6ICdhcnJheScsIGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sIGRlc2NyaXB0aW9uOiAnQ29tbWVudCBJRHMgdG8gZGVsZXRlLicgfSxcblx0fSxcblx0cmVxdWlyZWQ6IFsnY29tbWVudElkcyddLFxufTtcblxuY29uc3QgcmVzb2x2ZUNvbW1lbnRzSW5wdXRTY2hlbWE6IFRvb2xEZWZpbml0aW9uWydpbnB1dFNjaGVtYSddID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdGNvbW1lbnRJZHM6IHsgdHlwZTogJ2FycmF5JywgaXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSwgZGVzY3JpcHRpb246ICdDb21tZW50IElEcyB0byB1cGRhdGUuJyB9LFxuXHRcdHJlc29sdmVkOiB7IHR5cGU6ICdib29sZWFuJywgZGVzY3JpcHRpb246ICdXaGV0aGVyIHRoZSBjb21tZW50cyBzaG91bGQgYmUgbWFya2VkIGFzIHJlc29sdmVkLiBEZWZhdWx0cyB0byB0cnVlLicgfSxcblx0fSxcblx0cmVxdWlyZWQ6IFsnY29tbWVudElkcyddLFxufTtcblxuLyoqXG4gKiBQcm90b2NvbCB7QGxpbmsgVG9vbERlZmluaXRpb259cyBmb3IgdGhlIGZlZWRiYWNrIHNlcnZlciB0b29scywgYWR2ZXJ0aXNlZCBvblxuICoge0BsaW5rIFNlc3Npb25TdGF0ZS5zZXJ2ZXJUb29sc30gc28gY2xpZW50cyBrbm93IHRoZXNlIHRvb2xzIGFyZSBvd25lZCBhbmRcbiAqIGV4ZWN1dGVkIGJ5IHRoZSBhZ2VudCBob3N0LlxuICovXG5leHBvcnQgY29uc3QgZmVlZGJhY2tTZXJ2ZXJUb29sRGVmaW5pdGlvbnM6IFRvb2xEZWZpbml0aW9uW10gPSBbXG5cdHtcblx0XHRuYW1lOiBhZGRDb21tZW50VG9vbE5hbWUsXG5cdFx0dGl0bGU6ICdBZGQgQ29tbWVudCAoQWdlbnQgRmVlZGJhY2spJyxcblx0XHRkZXNjcmlwdGlvbjogJ0FkZCBhIGNvbW1lbnQgdG8gYSBmaWxlIHJhbmdlLicsXG5cdFx0aW5wdXRTY2hlbWE6IGFkZENvbW1lbnRJbnB1dFNjaGVtYSxcblx0XHRhbm5vdGF0aW9uczogeyByZWFkT25seUhpbnQ6IGZhbHNlIH0sXG5cdH0sXG5cdHtcblx0XHRuYW1lOiBsaXN0Q29tbWVudHNUb29sTmFtZSxcblx0XHR0aXRsZTogJ0xpc3QgQ29tbWVudHMgKEFnZW50IEZlZWRiYWNrKScsXG5cdFx0ZGVzY3JpcHRpb246ICdMaXN0IGNvbW1lbnRzIGZvciB0aGlzIHNlc3Npb24uJyxcblx0XHRpbnB1dFNjaGVtYTogbGlzdENvbW1lbnRzSW5wdXRTY2hlbWEsXG5cdFx0YW5ub3RhdGlvbnM6IHsgcmVhZE9ubHlIaW50OiB0cnVlIH0sXG5cdH0sXG5cdHtcblx0XHRuYW1lOiBkZWxldGVDb21tZW50c1Rvb2xOYW1lLFxuXHRcdHRpdGxlOiAnRGVsZXRlIENvbW1lbnRzIChBZ2VudCBGZWVkYmFjayknLFxuXHRcdGRlc2NyaXB0aW9uOiAnRGVsZXRlIGNvbW1lbnRzIGZvciB0aGlzIHNlc3Npb24uJyxcblx0XHRpbnB1dFNjaGVtYTogZGVsZXRlQ29tbWVudHNJbnB1dFNjaGVtYSxcblx0XHRhbm5vdGF0aW9uczogeyByZWFkT25seUhpbnQ6IGZhbHNlLCBkZXN0cnVjdGl2ZUhpbnQ6IHRydWUgfSxcblx0fSxcblx0e1xuXHRcdG5hbWU6IHJlc29sdmVDb21tZW50c1Rvb2xOYW1lLFxuXHRcdHRpdGxlOiAnUmVzb2x2ZSBDb21tZW50cyAoQWdlbnQgRmVlZGJhY2spJyxcblx0XHRkZXNjcmlwdGlvbjogJ01hcmsgY29tbWVudHMgZm9yIHRoaXMgc2Vzc2lvbiBhcyByZXNvbHZlZCBvciB1bnJlc29sdmVkLicsXG5cdFx0aW5wdXRTY2hlbWE6IHJlc29sdmVDb21tZW50c0lucHV0U2NoZW1hLFxuXHRcdGFubm90YXRpb25zOiB7IHJlYWRPbmx5SGludDogZmFsc2UgfSxcblx0fSxcblx0e1xuXHRcdG5hbWU6IHZpZXdVbnJldmlld2VkQ29tbWVudHNUb29sTmFtZSxcblx0XHR0aXRsZTogJ1ZpZXcgVW5yZXZpZXdlZCBDb21tZW50cyAoQWdlbnQgRmVlZGJhY2spJyxcblx0XHRkZXNjcmlwdGlvbjogJ1ZpZXcgcHVsbCByZXF1ZXN0IG9yIGNvZGUgcmV2aWV3IGNvbW1lbnRzIHRoYXQgdGhlIHVzZXIgaGFzIG5vdCByZXZpZXdlZCB5ZXQuIFRoZSB1c2VyIG1heSBiZSBhc2tlZCB0byBjaG9vc2Ugd2hpY2ggY29tbWVudHMgdG8gcmV2ZWFsLCBpbiB3aGljaCBjYXNlIG9ubHkgdGhlIGNvbW1lbnRzIHRoZXkgc2VsZWN0IGFyZSByZXR1cm5lZDsgb3RoZXJ3aXNlIGV2ZXJ5IHVucmV2aWV3ZWQgY29tbWVudCBpcyByZXR1cm5lZC4nLFxuXHRcdGlucHV0U2NoZW1hOiB2aWV3VW5yZXZpZXdlZENvbW1lbnRzSW5wdXRTY2hlbWEsXG5cdFx0YW5ub3RhdGlvbnM6IHsgcmVhZE9ubHlIaW50OiBmYWxzZSB9LFxuXHR9LFxuXTtcblxuLy8gLS0tIEFyZ3VtZW50IHZhbGlkYXRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmludGVyZmFjZSBJT25lQmFzZWRSYW5nZSB7XG5cdHJlYWRvbmx5IHN0YXJ0TGluZU51bWJlcjogbnVtYmVyO1xuXHRyZWFkb25seSBzdGFydENvbHVtbjogbnVtYmVyO1xuXHRyZWFkb25seSBlbmRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdHJlYWRvbmx5IGVuZENvbHVtbjogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSUFkZENvbW1lbnRBcmdzIHtcblx0cmVhZG9ubHkgcmVzb3VyY2VVcmk/OiB1bmtub3duO1xuXHRyZWFkb25seSByYW5nZT86IHVua25vd247XG5cdHJlYWRvbmx5IHRleHQ/OiB1bmtub3duO1xufVxuXG5pbnRlcmZhY2UgSURlbGV0ZUNvbW1lbnRzQXJncyB7XG5cdHJlYWRvbmx5IGNvbW1lbnRJZHM/OiB1bmtub3duO1xufVxuXG5pbnRlcmZhY2UgSVJlc29sdmVDb21tZW50c0FyZ3Mge1xuXHRyZWFkb25seSBjb21tZW50SWRzPzogdW5rbm93bjtcblx0cmVhZG9ubHkgcmVzb2x2ZWQ/OiB1bmtub3duO1xufVxuXG5mdW5jdGlvbiBnZXRSZXF1aXJlZFN0cmluZyh2YWx1ZTogdW5rbm93biwgZmllbGQ6IHN0cmluZywgdG9vbE5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICh0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnIHx8IHZhbHVlLmxlbmd0aCA9PT0gMCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCAke3Rvb2xOYW1lfSBpbnB1dDogJHtmaWVsZH0gbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcuYCk7XG5cdH1cblx0cmV0dXJuIHZhbHVlO1xufVxuXG5mdW5jdGlvbiBnZXRSZXF1aXJlZFBvc2l0aXZlSW50ZWdlcih2YWx1ZTogdW5rbm93biwgZmllbGQ6IHN0cmluZywgdG9vbE5hbWU6IHN0cmluZyk6IG51bWJlciB7XG5cdGlmICh0eXBlb2YgdmFsdWUgIT09ICdudW1iZXInIHx8ICFOdW1iZXIuaXNJbnRlZ2VyKHZhbHVlKSB8fCB2YWx1ZSA8IDEpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgJHt0b29sTmFtZX0gaW5wdXQ6ICR7ZmllbGR9IG11c3QgYmUgYSBwb3NpdGl2ZSBpbnRlZ2VyLmApO1xuXHR9XG5cdHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gZ2V0QWRkQ29tbWVudEFyZ3MocmF3QXJnczogdW5rbm93bik6IHsgcmVzb3VyY2VVcmk6IHN0cmluZzsgcmFuZ2U6IElPbmVCYXNlZFJhbmdlOyB0ZXh0OiBzdHJpbmcgfSB7XG5cdGNvbnN0IGFyZ3MgPSAocmF3QXJncyA/PyB7fSkgYXMgSUFkZENvbW1lbnRBcmdzO1xuXHRjb25zdCByZXNvdXJjZVVyaSA9IGdldFJlcXVpcmVkU3RyaW5nKGFyZ3MucmVzb3VyY2VVcmksICdyZXNvdXJjZVVyaScsIGFkZENvbW1lbnRUb29sTmFtZSk7XG5cdGNvbnN0IHRleHQgPSBnZXRSZXF1aXJlZFN0cmluZyhhcmdzLnRleHQsICd0ZXh0JywgYWRkQ29tbWVudFRvb2xOYW1lKTtcblx0aWYgKCFhcmdzLnJhbmdlIHx8IHR5cGVvZiBhcmdzLnJhbmdlICE9PSAnb2JqZWN0JyB8fCBBcnJheS5pc0FycmF5KGFyZ3MucmFuZ2UpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7YWRkQ29tbWVudFRvb2xOYW1lfSBpbnB1dDogcmFuZ2UgbXVzdCBiZSBhbiBvYmplY3QuYCk7XG5cdH1cblx0Y29uc3QgcmFuZ2UgPSBhcmdzLnJhbmdlIGFzIFBhcnRpYWw8SU9uZUJhc2VkUmFuZ2U+O1xuXHRyZXR1cm4ge1xuXHRcdHJlc291cmNlVXJpLFxuXHRcdHRleHQsXG5cdFx0cmFuZ2U6IHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogZ2V0UmVxdWlyZWRQb3NpdGl2ZUludGVnZXIocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAncmFuZ2Uuc3RhcnRMaW5lTnVtYmVyJywgYWRkQ29tbWVudFRvb2xOYW1lKSxcblx0XHRcdHN0YXJ0Q29sdW1uOiBnZXRSZXF1aXJlZFBvc2l0aXZlSW50ZWdlcihyYW5nZS5zdGFydENvbHVtbiwgJ3JhbmdlLnN0YXJ0Q29sdW1uJywgYWRkQ29tbWVudFRvb2xOYW1lKSxcblx0XHRcdGVuZExpbmVOdW1iZXI6IGdldFJlcXVpcmVkUG9zaXRpdmVJbnRlZ2VyKHJhbmdlLmVuZExpbmVOdW1iZXIsICdyYW5nZS5lbmRMaW5lTnVtYmVyJywgYWRkQ29tbWVudFRvb2xOYW1lKSxcblx0XHRcdGVuZENvbHVtbjogZ2V0UmVxdWlyZWRQb3NpdGl2ZUludGVnZXIocmFuZ2UuZW5kQ29sdW1uLCAncmFuZ2UuZW5kQ29sdW1uJywgYWRkQ29tbWVudFRvb2xOYW1lKSxcblx0XHR9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBnZXRVbmlxdWVDb21tZW50SWRzKHZhbHVlOiB1bmtub3duLCB0b29sTmFtZTogc3RyaW5nKTogcmVhZG9ubHkgc3RyaW5nW10ge1xuXHRpZiAoIUFycmF5LmlzQXJyYXkodmFsdWUpIHx8IHZhbHVlLmxlbmd0aCA9PT0gMCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCAke3Rvb2xOYW1lfSBpbnB1dDogY29tbWVudElkcyBtdXN0IGJlIGEgbm9uLWVtcHR5IHN0cmluZyBhcnJheS5gKTtcblx0fVxuXHRjb25zdCBpZHM6IHN0cmluZ1tdID0gW107XG5cdGZvciAoY29uc3QgaXRlbSBvZiB2YWx1ZSkge1xuXHRcdGlkcy5wdXNoKGdldFJlcXVpcmVkU3RyaW5nKGl0ZW0sICdjb21tZW50SWRzW10nLCB0b29sTmFtZSkpO1xuXHR9XG5cdHJldHVybiBbLi4ubmV3IFNldChpZHMpXTtcbn1cblxuZnVuY3Rpb24gZ2V0UmVzb2x2ZWRGbGFnKHZhbHVlOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ2Jvb2xlYW4nKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7cmVzb2x2ZUNvbW1lbnRzVG9vbE5hbWV9IGlucHV0OiByZXNvbHZlZCBtdXN0IGJlIGEgYm9vbGVhbi5gKTtcblx0fVxuXHRyZXR1cm4gdmFsdWU7XG59XG5cbi8vIC0tLSBBbm5vdGF0aW9uIDwtPiBmZWVkYmFjayBjb252ZXJzaW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiB0b1RleHRSYW5nZShyYW5nZTogSU9uZUJhc2VkUmFuZ2UpOiBUZXh0UmFuZ2Uge1xuXHRyZXR1cm4ge1xuXHRcdHN0YXJ0OiB7IGxpbmU6IHJhbmdlLnN0YXJ0TGluZU51bWJlciAtIDEsIGNoYXJhY3RlcjogcmFuZ2Uuc3RhcnRDb2x1bW4gLSAxIH0sXG5cdFx0ZW5kOiB7IGxpbmU6IHJhbmdlLmVuZExpbmVOdW1iZXIgLSAxLCBjaGFyYWN0ZXI6IHJhbmdlLmVuZENvbHVtbiAtIDEgfSxcblx0fTtcbn1cblxuZnVuY3Rpb24gZnJvbVRleHRSYW5nZShyYW5nZTogVGV4dFJhbmdlIHwgdW5kZWZpbmVkKTogSU9uZUJhc2VkUmFuZ2Uge1xuXHRpZiAoIXJhbmdlKSB7XG5cdFx0cmV0dXJuIHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiAxIH07XG5cdH1cblx0cmV0dXJuIHtcblx0XHRzdGFydExpbmVOdW1iZXI6IHJhbmdlLnN0YXJ0LmxpbmUgKyAxLFxuXHRcdHN0YXJ0Q29sdW1uOiByYW5nZS5zdGFydC5jaGFyYWN0ZXIgKyAxLFxuXHRcdGVuZExpbmVOdW1iZXI6IHJhbmdlLmVuZC5saW5lICsgMSxcblx0XHRlbmRDb2x1bW46IHJhbmdlLmVuZC5jaGFyYWN0ZXIgKyAxLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBlbnRyeVRleHQodGV4dDogU3RyaW5nT3JNYXJrZG93bik6IHN0cmluZyB7XG5cdHJldHVybiB0eXBlb2YgdGV4dCA9PT0gJ3N0cmluZycgPyB0ZXh0IDogdGV4dC5tYXJrZG93bjtcbn1cblxuZnVuY3Rpb24gcmVhZE1ldGEoYW5ub3RhdGlvbjogQW5ub3RhdGlvbik6IElGZWVkYmFja0Fubm90YXRpb25NZXRhIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHJlYWRGZWVkYmFja0Fubm90YXRpb25NZXRhKGFubm90YXRpb24pO1xufVxuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRDb21tZW50IHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgcmVzb3VyY2VVcmk6IHN0cmluZztcblx0cmVhZG9ubHkgcmFuZ2U6IElPbmVCYXNlZFJhbmdlO1xuXHRyZWFkb25seSB0ZXh0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGtpbmQ6IHN0cmluZztcblx0cmVhZG9ubHkgcmVzb2x2ZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHJlcGxpZXM/OiByZWFkb25seSBzdHJpbmdbXTtcbn1cblxuZnVuY3Rpb24gc2VyaWFsaXplQ29tbWVudChhbm5vdGF0aW9uOiBBbm5vdGF0aW9uKTogSVNlcmlhbGl6ZWRDb21tZW50IHtcblx0Y29uc3QgZW50cmllcyA9IGFubm90YXRpb24uZW50cmllcyA/PyBbXTtcblx0Y29uc3QgbWV0YSA9IHJlYWRNZXRhKGFubm90YXRpb24pO1xuXHRjb25zdCByZXBsaWVzID0gZW50cmllcy5zbGljZSgxKS5tYXAoZSA9PiBlbnRyeVRleHQoZS50ZXh0KSk7XG5cdHJldHVybiB7XG5cdFx0aWQ6IGFubm90YXRpb24uaWQsXG5cdFx0cmVzb3VyY2VVcmk6IGFubm90YXRpb24ucmVzb3VyY2UsXG5cdFx0cmFuZ2U6IGZyb21UZXh0UmFuZ2UoYW5ub3RhdGlvbi5yYW5nZSksXG5cdFx0dGV4dDogZW50cmllcy5sZW5ndGggPyBlbnRyeVRleHQoZW50cmllc1swXS50ZXh0KSA6ICcnLFxuXHRcdGtpbmQ6IG1ldGE/LmtpbmQgPz8gJ3VzZXInLFxuXHRcdHJlc29sdmVkOiBhbm5vdGF0aW9uLnJlc29sdmVkLFxuXHRcdC4uLihyZXBsaWVzLmxlbmd0aCA/IHsgcmVwbGllcyB9IDoge30pLFxuXHR9O1xufVxuXG4vKipcbiAqIENvbW1lbnRzIHZpc2libGUgdG8gdGhlIGFnZW50OiBldmVyeXRoaW5nIGV4Y2VwdCBpdGVtcyBzdGlsbCBpbiB0aGVcbiAqIGBjcmVhdGVkYCBzdGF0ZSAodGhlIGFnZW50IGFkZGVkIHRoZW0gYnV0IHRoZSB1c2VyIGhhcyBub3QgYWNjZXB0ZWQgdGhlbVxuICogeWV0KS4gTWlycm9ycyB0aGUgY2xpZW50IGBnZXRMaXN0YWJsZUZlZWRiYWNrYCBiZWhhdmlvci5cbiAqL1xuZnVuY3Rpb24gbGlzdGFibGVBbm5vdGF0aW9ucyhzdGF0ZTogQW5ub3RhdGlvbnNTdGF0ZSk6IEFubm90YXRpb25bXSB7XG5cdHJldHVybiBzdGF0ZS5hbm5vdGF0aW9ucy5maWx0ZXIoYW5ub3RhdGlvbiA9PiB7XG5cdFx0Y29uc3QgbWV0YSA9IHJlYWRNZXRhKGFubm90YXRpb24pO1xuXHRcdC8vIFRoZSBhbm5vdGF0aW9ucyBjaGFubmVsIGlzIGdlbmVyaWMgYW5kIG1heSBjYXJyeSBhbm5vdGF0aW9ucyBwcm9kdWNlZFxuXHRcdC8vIGJ5IG90aGVyIGZlYXR1cmVzLiBPbmx5IGFubm90YXRpb25zIHRoYXQgY2FycnkgZmVlZGJhY2sgbWV0YWRhdGEgYXJlXG5cdFx0Ly8gZmVlZGJhY2sgY29tbWVudHM7IHRoZSBmZWVkYmFjayB0b29scyBtdXN0IG5ldmVyIGxpc3QsIGRlbGV0ZSwgb3Jcblx0XHQvLyByZXNvbHZlIHVucmVsYXRlZCBhbm5vdGF0aW9ucy5cblx0XHRpZiAoIW1ldGEgfHwgIWFubm90YXRpb24uZW50cmllcz8ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGVmZmVjdGl2ZVN0YXRlID0gYW5ub3RhdGlvbi5yZXNvbHZlZCA/ICdyZXNvbHZlZCcgOiAobWV0YS5zdGF0ZSA/PyAnYWNjZXB0ZWQnKTtcblx0XHRyZXR1cm4gZWZmZWN0aXZlU3RhdGUgIT09ICdjcmVhdGVkJztcblx0fSk7XG59XG5cbi8qKlxuICogRmVlZGJhY2sgYW5ub3RhdGlvbnMgb2YgYSB7QGxpbmsgUkVWSUVXQUJMRV9GRUVEQkFDS19LSU5EUyByZXZpZXdhYmxlIGtpbmR9XG4gKiB0aGUgdXNlciBoYXMgZmxhZ2dlZCBmb3IgcmV2ZWFsIHRvIHRoZSBhZ2VudCAodmlhIHRoZSBjb25maXJtYXRpb24gb2YgdGhlXG4gKiB7QGxpbmsgdmlld1VucmV2aWV3ZWRDb21tZW50c1Rvb2xOYW1lfSB0b29sKS4gVGhlc2UgYXJlIHRoZSBjb21tZW50cyB0aGUgdXNlclxuICogY2hvc2UgdG8gcmV2ZWFsIGFuZCBoYXZlIG5vdCB5ZXQgYmVlbiBkZWxpdmVyZWQ7IGV2ZXJ5dGhpbmcgZWxzZVxuICogKGluY2x1ZGluZyByZXZpZXcgY29tbWVudHMgdGhhdCBoYXBwZW4gdG8gYmUgYWNjZXB0ZWQgZnJvbSBhIHByZXZpb3VzIHJldmVhbFxuICogb3IgYSBtYW51YWwgYWNjZXB0KSBpcyBleGNsdWRlZC5cbiAqL1xuZnVuY3Rpb24gcGVuZGluZ1JldmVhbEFubm90YXRpb25zKHN0YXRlOiBBbm5vdGF0aW9uc1N0YXRlKTogQW5ub3RhdGlvbltdIHtcblx0cmV0dXJuIHN0YXRlLmFubm90YXRpb25zLmZpbHRlcihhbm5vdGF0aW9uID0+IHtcblx0XHRjb25zdCBtZXRhID0gcmVhZE1ldGEoYW5ub3RhdGlvbik7XG5cdFx0aWYgKCFtZXRhIHx8ICFhbm5vdGF0aW9uLmVudHJpZXM/Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gUkVWSUVXQUJMRV9GRUVEQkFDS19LSU5EUy5oYXMobWV0YS5raW5kKSAmJiBtZXRhLnBlbmRpbmdBZ2VudFJldmVhbCA9PT0gdHJ1ZTtcblx0fSk7XG59XG5cbi8qKiBSZXR1cm5zIGEgY29weSBvZiB7QGxpbmsgYW5ub3RhdGlvbn0gd2l0aCB0aGUge0BsaW5rIElGZWVkYmFja0Fubm90YXRpb25NZXRhLnBlbmRpbmdBZ2VudFJldmVhbH0gZmxhZyBjbGVhcmVkLiAqL1xuZnVuY3Rpb24gY2xlYXJQZW5kaW5nUmV2ZWFsKGFubm90YXRpb246IEFubm90YXRpb24pOiBBbm5vdGF0aW9uIHtcblx0Y29uc3QgbWV0YSA9IHJlYWRNZXRhKGFubm90YXRpb24pO1xuXHRpZiAoIW1ldGEpIHtcblx0XHRyZXR1cm4gYW5ub3RhdGlvbjtcblx0fVxuXHRjb25zdCBuZXh0TWV0YTogSUZlZWRiYWNrQW5ub3RhdGlvbk1ldGEgPSB7IC4uLm1ldGEsIHBlbmRpbmdBZ2VudFJldmVhbDogdW5kZWZpbmVkIH07XG5cdHJldHVybiB7IC4uLmFubm90YXRpb24sIF9tZXRhOiB7IC4uLmFubm90YXRpb24uX21ldGEsIFtGRUVEQkFDS19BTk5PVEFUSU9OX01FVEFfS0VZXTogbmV4dE1ldGEgfSB9O1xufVxuXG4vKiogUmV0dXJucyBhIGNvcHkgb2Yge0BsaW5rIGFubm90YXRpb259IGluIHRoZSBzdWJtaXR0ZWQgc3RhdGUuICovXG5mdW5jdGlvbiBtYXJrU3VibWl0dGVkKGFubm90YXRpb246IEFubm90YXRpb24pOiBBbm5vdGF0aW9uIHtcblx0Y29uc3QgbWV0YSA9IHJlYWRNZXRhKGFubm90YXRpb24pO1xuXHRpZiAoIW1ldGEpIHtcblx0XHRyZXR1cm4gYW5ub3RhdGlvbjtcblx0fVxuXHRjb25zdCBuZXh0TWV0YTogSUZlZWRiYWNrQW5ub3RhdGlvbk1ldGEgPSB7IC4uLm1ldGEsIHN0YXRlOiAnc3VibWl0dGVkJywgcGVuZGluZ0FnZW50UmV2ZWFsOiB1bmRlZmluZWQgfTtcblx0cmV0dXJuIHsgLi4uYW5ub3RhdGlvbiwgX21ldGE6IHsgLi4uYW5ub3RhdGlvbi5fbWV0YSwgW0ZFRURCQUNLX0FOTk9UQVRJT05fTUVUQV9LRVldOiBuZXh0TWV0YSB9IH07XG59XG5cbi8qKlxuICogUmV2aWV3YWJsZSAoUFIgLyBjb2RlIHJldmlldykgZmVlZGJhY2sgYW5ub3RhdGlvbnMgdGhlIHVzZXIgaGFzIG5vdCByZXZpZXdlZFxuICogeWV0LCBpLmUuIHN0aWxsIGluIHRoZSBgY3JlYXRlZGAgc3RhdGUuIFVzZWQgdG8gYnVpbGQgdGhlXG4gKiB7QGxpbmsgbGlzdENvbW1lbnRzVG9vbE5hbWV9IG5vdGUuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZWRSZXZpZXdhYmxlQW5ub3RhdGlvbnMoc3RhdGU6IEFubm90YXRpb25zU3RhdGUpOiBBbm5vdGF0aW9uW10ge1xuXHRyZXR1cm4gc3RhdGUuYW5ub3RhdGlvbnMuZmlsdGVyKGFubm90YXRpb24gPT4ge1xuXHRcdGNvbnN0IG1ldGEgPSByZWFkTWV0YShhbm5vdGF0aW9uKTtcblx0XHRpZiAoIW1ldGEgfHwgIWFubm90YXRpb24uZW50cmllcz8ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBSRVZJRVdBQkxFX0ZFRURCQUNLX0tJTkRTLmhhcyhtZXRhLmtpbmQpICYmICFhbm5vdGF0aW9uLnJlc29sdmVkICYmIChtZXRhLnN0YXRlID8/ICdhY2NlcHRlZCcpID09PSAnY3JlYXRlZCc7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBoYXNSZXZlYWxhYmxlQ29tbWVudHMoc3RhdGU6IEFubm90YXRpb25zU3RhdGUpOiBib29sZWFuIHtcblx0cmV0dXJuIHBlbmRpbmdSZXZlYWxBbm5vdGF0aW9ucyhzdGF0ZSkubGVuZ3RoID4gMCB8fCBjcmVhdGVkUmV2aWV3YWJsZUFubm90YXRpb25zKHN0YXRlKS5sZW5ndGggPiAwO1xufVxuXG4vKipcbiAqIEEgc2hvcnQgbm90ZSBhcHBlbmRlZCB0byB0aGUge0BsaW5rIGxpc3RDb21tZW50c1Rvb2xOYW1lfSByZXN1bHQgd2hlbiB0aGVyZVxuICogYXJlIHJldmlld2FibGUgY29tbWVudHMgdGhlIHVzZXIgaGFzIG5vdCBhY2NlcHRlZCB5ZXQsIHBvaW50aW5nIHRoZSBhZ2VudCBhdFxuICoge0BsaW5rIHZpZXdVbnJldmlld2VkQ29tbWVudHNUb29sTmFtZX0uIFJldHVybnMgYHVuZGVmaW5lZGAgKG5vIG5vdGUpIHdoZW5cbiAqIHRoZXJlIGFyZSBubyBzdWNoIGNvbW1lbnRzLlxuICovXG5mdW5jdGlvbiBidWlsZFVucmV2aWV3ZWRDb21tZW50c05vdGUoc3RhdGU6IEFubm90YXRpb25zU3RhdGUpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBjcmVhdGVkID0gY3JlYXRlZFJldmlld2FibGVBbm5vdGF0aW9ucyhzdGF0ZSk7XG5cdGlmICghY3JlYXRlZC5sZW5ndGgpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGxldCBwckNvdW50ID0gMDtcblx0bGV0IGNvZGVSZXZpZXdDb3VudCA9IDA7XG5cdGZvciAoY29uc3QgYW5ub3RhdGlvbiBvZiBjcmVhdGVkKSB7XG5cdFx0Y29uc3Qga2luZCA9IHJlYWRNZXRhKGFubm90YXRpb24pPy5raW5kO1xuXHRcdGlmIChraW5kID09PSAncHJSZXZpZXcnKSB7XG5cdFx0XHRwckNvdW50Kys7XG5cdFx0fSBlbHNlIGlmIChraW5kID09PSAnY29kZVJldmlldycpIHtcblx0XHRcdGNvZGVSZXZpZXdDb3VudCsrO1xuXHRcdH1cblx0fVxuXHRjb25zdCBjbGF1c2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRpZiAocHJDb3VudCA+IDApIHtcblx0XHRjbGF1c2VzLnB1c2goYCR7cHJDb3VudH0gcHVsbCByZXF1ZXN0IGNvbW1lbnQke3ByQ291bnQgPT09IDEgPyAnJyA6ICdzJ31gKTtcblx0fVxuXHRpZiAoY29kZVJldmlld0NvdW50ID4gMCkge1xuXHRcdGNsYXVzZXMucHVzaChgJHtjb2RlUmV2aWV3Q291bnR9IGNvZGUgcmV2aWV3IGNvbW1lbnQke2NvZGVSZXZpZXdDb3VudCA9PT0gMSA/ICcnIDogJ3MnfWApO1xuXHR9XG5cdGNvbnN0IHN1YmplY3QgPSBjbGF1c2VzLmpvaW4oJyBhbmQgJyk7XG5cdGNvbnN0IHZlcmIgPSBjcmVhdGVkLmxlbmd0aCA9PT0gMSA/ICdpcycgOiAnYXJlJztcblx0cmV0dXJuIGBUaGVyZSAke3ZlcmJ9ICR7c3ViamVjdH0gd2hpY2ggdGhlIHVzZXIgaGFzIG5vdCByZXZpZXdlZCB5ZXQuIElmIHRoZSB1c2VyIHdhbnRzIHlvdSB0byB0YWNrbGUgdGhlbSwgY2FsbCB0aGUgXFxgJHt2aWV3VW5yZXZpZXdlZENvbW1lbnRzVG9vbE5hbWV9XFxgIHRvb2wgdG8gdmlldyB0aGVtLmA7XG59XG5cbi8vIC0tLSBUb29sIGV4ZWN1dGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgaW50ZXJmYWNlIElGZWVkYmFja1Rvb2xPdXRjb21lIHtcblx0LyoqIEFubm90YXRpb24gYWN0aW9ucyB0byBkaXNwYXRjaCBvbiB0aGUgc2Vzc2lvbidzIGFubm90YXRpb25zIGNoYW5uZWwuICovXG5cdHJlYWRvbmx5IGFjdGlvbnM6IHJlYWRvbmx5IEFubm90YXRpb25zQWN0aW9uW107XG5cdC8qKiBUZXh0dWFsIHRvb2wgcmVzdWx0IHJldHVybmVkIHRvIHRoZSBhZ2VudC4gKi9cblx0cmVhZG9ubHkgcmVzdWx0OiBzdHJpbmc7XG59XG5cbi8qKlxuICogRXhlY3V0ZXMgYSBmZWVkYmFjayBzZXJ2ZXIgdG9vbCBhZ2FpbnN0IHRoZSBjdXJyZW50IGFubm90YXRpb24gc3RhdGUuXG4gKlxuICogUHVyZTogaXQgZG9lcyBub3QgbXV0YXRlIHtAbGluayBzdGF0ZX0sIGluc3RlYWQgcmV0dXJuaW5nIHRoZSBhbm5vdGF0aW9uXG4gKiBhY3Rpb25zIHRoZSBjYWxsZXIgc2hvdWxkIGRpc3BhdGNoIChzbyB0aGUgYXV0aG9yaXRhdGl2ZSBzdGF0ZSBtYW5hZ2VyXG4gKiByZW1haW5zIHRoZSBzaW5nbGUgd3JpdGVyKSBhbG9uZyB3aXRoIHRoZSB0ZXh0dWFsIHRvb2wgcmVzdWx0LlxuICpcbiAqIEB0aHJvd3MgaWYge0BsaW5rIHRvb2xOYW1lfSBpcyB1bmtub3duIG9yIHRoZSBhcmd1bWVudHMgYXJlIGludmFsaWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhcHBseUZlZWRiYWNrVG9vbChzdGF0ZTogQW5ub3RhdGlvbnNTdGF0ZSwgc2Vzc2lvblJlc291cmNlOiBzdHJpbmcsIHRvb2xOYW1lOiBzdHJpbmcsIHJhd0FyZ3M6IHVua25vd24pOiBJRmVlZGJhY2tUb29sT3V0Y29tZSB7XG5cdHN3aXRjaCAodG9vbE5hbWUpIHtcblx0XHRjYXNlIGFkZENvbW1lbnRUb29sTmFtZToge1xuXHRcdFx0Y29uc3QgeyByZXNvdXJjZVVyaSwgcmFuZ2UsIHRleHQgfSA9IGdldEFkZENvbW1lbnRBcmdzKHJhd0FyZ3MpO1xuXHRcdFx0Y29uc3QgaWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRcdC8vIFRoZSBhZ2VudCBhZGRzIGNvbW1lbnRzIGluIHRoZSBgY3JlYXRlZGAgc3RhdGU7IHRoZSB1c2VyIGFjY2VwdHNcblx0XHRcdC8vIHRoZW0gYmVmb3JlIHRoZXkgYXJlIGFjdGVkIHVwb24uXG5cdFx0XHRjb25zdCBtZXRhOiBJRmVlZGJhY2tBbm5vdGF0aW9uTWV0YSA9IHsga2luZDogJ2NvZGVSZXZpZXcnLCBzdGF0ZTogJ2NyZWF0ZWQnLCBzZXNzaW9uUmVzb3VyY2UgfTtcblx0XHRcdGNvbnN0IGFubm90YXRpb246IEFubm90YXRpb24gPSB7XG5cdFx0XHRcdGlkLFxuXHRcdFx0XHR0dXJuSWQ6ICcnLFxuXHRcdFx0XHRyZXNvdXJjZTogcmVzb3VyY2VVcmksXG5cdFx0XHRcdHJhbmdlOiB0b1RleHRSYW5nZShyYW5nZSksXG5cdFx0XHRcdHJlc29sdmVkOiBmYWxzZSxcblx0XHRcdFx0ZW50cmllczogW3sgaWQ6IGAke2lkfTowYCwgdGV4dCB9XSxcblx0XHRcdFx0X21ldGE6IHsgW0ZFRURCQUNLX0FOTk9UQVRJT05fTUVUQV9LRVldOiBtZXRhIH0sXG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0YWN0aW9uczogW3sgdHlwZTogQWN0aW9uVHlwZS5Bbm5vdGF0aW9uc1NldCwgYW5ub3RhdGlvbiB9XSxcblx0XHRcdFx0cmVzdWx0OiAnQ29tbWVudCBhZGRlZC4nLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y2FzZSBsaXN0Q29tbWVudHNUb29sTmFtZToge1xuXHRcdFx0Y29uc3QgcGF5bG9hZDogeyBjb21tZW50czogSVNlcmlhbGl6ZWRDb21tZW50W107IG5vdGU/OiBzdHJpbmcgfSA9IHtcblx0XHRcdFx0Y29tbWVudHM6IGxpc3RhYmxlQW5ub3RhdGlvbnMoc3RhdGUpLm1hcChzZXJpYWxpemVDb21tZW50KSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBub3RlID0gYnVpbGRVbnJldmlld2VkQ29tbWVudHNOb3RlKHN0YXRlKTtcblx0XHRcdGlmIChub3RlKSB7XG5cdFx0XHRcdHBheWxvYWQubm90ZSA9IG5vdGU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBhY3Rpb25zOiBbXSwgcmVzdWx0OiBKU09OLnN0cmluZ2lmeShwYXlsb2FkLCB1bmRlZmluZWQsIDIpIH07XG5cdFx0fVxuXHRcdGNhc2Ugdmlld1VucmV2aWV3ZWRDb21tZW50c1Rvb2xOYW1lOiB7XG5cdFx0XHRjb25zdCBwZW5kaW5nID0gcGVuZGluZ1JldmVhbEFubm90YXRpb25zKHN0YXRlKTtcblx0XHRcdGlmICghcGVuZGluZy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgdW5yZXZpZXdlZCA9IGNyZWF0ZWRSZXZpZXdhYmxlQW5ub3RhdGlvbnMoc3RhdGUpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGFjdGlvbnM6IHVucmV2aWV3ZWQubWFwKGFubm90YXRpb24gPT4gKHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQW5ub3RhdGlvbnNTZXQsXG5cdFx0XHRcdFx0XHRhbm5vdGF0aW9uOiBtYXJrU3VibWl0dGVkKGFubm90YXRpb24pLFxuXHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0XHRyZXN1bHQ6IEpTT04uc3RyaW5naWZ5KHsgY29tbWVudHM6IHVucmV2aWV3ZWQubWFwKHNlcmlhbGl6ZUNvbW1lbnQpIH0sIHVuZGVmaW5lZCwgMiksXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHQvLyBUaGUgY29uZmlybWF0aW9uIGdhdGUgcnVucyBiZWZvcmUgdGhpcyBib2R5LiBXaGVuIHRoZSB1c2VyIGFjY2VwdHNcblx0XHRcdC8vIHRoZSBjb25maXJtYXRpb24sIHRoZSBjbGllbnQgZmxhZ3MgZXhhY3RseSB0aGUgY29tbWVudHMgdGhleSBjaG9zZVxuXHRcdFx0Ly8gdG8gcmV2ZWFsIHdpdGggYHBlbmRpbmdBZ2VudFJldmVhbGAgb24gdGhlIHNoYXJlZCBhbm5vdGF0aW9uc1xuXHRcdFx0Ly8gY2hhbm5lbC4gUmV0dXJuIHRob3NlIGNvbW1lbnRzIGFuZCBjbGVhciB0aGUgZmxhZyBhZnRlciBkZWxpdmVyeTtcblx0XHRcdC8vIGNvbW1lbnRzIHRoZSB1c2VyIGxlZnQgdW5jaGVja2VkIChhbmQgcmV2aWV3IGNvbW1lbnRzIGFjY2VwdGVkIGJ5XG5cdFx0XHQvLyBvdGhlciBtZWFucykgYXJlIG5vdCBmbGFnZ2VkIGFuZCBzbyBhcmUgZXhjbHVkZWQuXG5cdFx0XHRjb25zdCBjb21tZW50cyA9IHBlbmRpbmcubWFwKHNlcmlhbGl6ZUNvbW1lbnQpO1xuXHRcdFx0Y29uc3QgYWN0aW9uczogQW5ub3RhdGlvbnNBY3Rpb25bXSA9IHBlbmRpbmcubWFwKGFubm90YXRpb24gPT4gKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Bbm5vdGF0aW9uc1NldCxcblx0XHRcdFx0YW5ub3RhdGlvbjogY2xlYXJQZW5kaW5nUmV2ZWFsKGFubm90YXRpb24pLFxuXHRcdFx0fSkpO1xuXHRcdFx0cmV0dXJuIHsgYWN0aW9ucywgcmVzdWx0OiBKU09OLnN0cmluZ2lmeSh7IGNvbW1lbnRzIH0sIHVuZGVmaW5lZCwgMikgfTtcblx0XHR9XG5cdFx0Y2FzZSBkZWxldGVDb21tZW50c1Rvb2xOYW1lOiB7XG5cdFx0XHRjb25zdCBpZHMgPSBnZXRVbmlxdWVDb21tZW50SWRzKChyYXdBcmdzIGFzIElEZWxldGVDb21tZW50c0FyZ3MpPy5jb21tZW50SWRzLCBkZWxldGVDb21tZW50c1Rvb2xOYW1lKTtcblx0XHRcdGNvbnN0IGxpc3RhYmxlID0gbGlzdGFibGVBbm5vdGF0aW9ucyhzdGF0ZSk7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IG5ldyBNYXAobGlzdGFibGUubWFwKGEgPT4gW2EuaWQsIGFdKSk7XG5cdFx0XHRjb25zdCBhY3Rpb25zOiBBbm5vdGF0aW9uc0FjdGlvbltdID0gW107XG5cdFx0XHRjb25zdCBkZWxldGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgbm90Rm91bmQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGlkIG9mIGlkcykge1xuXHRcdFx0XHRpZiAoZXhpc3RpbmcuaGFzKGlkKSkge1xuXHRcdFx0XHRcdGFjdGlvbnMucHVzaCh7IHR5cGU6IEFjdGlvblR5cGUuQW5ub3RhdGlvbnNSZW1vdmVkLCBhbm5vdGF0aW9uSWQ6IGlkIH0pO1xuXHRcdFx0XHRcdGRlbGV0ZWQucHVzaChpZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bm90Rm91bmQucHVzaChpZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlbWFpbmluZyA9IGxpc3RhYmxlLmZpbHRlcihhID0+ICFkZWxldGVkLmluY2x1ZGVzKGEuaWQpKS5tYXAoc2VyaWFsaXplQ29tbWVudCk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRhY3Rpb25zLFxuXHRcdFx0XHRyZXN1bHQ6IEpTT04uc3RyaW5naWZ5KHsgZGVsZXRlZENvbW1lbnRJZHM6IGRlbGV0ZWQsIG5vdEZvdW5kQ29tbWVudElkczogbm90Rm91bmQsIHJlbWFpbmluZ0NvbW1lbnRzOiByZW1haW5pbmcgfSwgdW5kZWZpbmVkLCAyKSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNhc2UgcmVzb2x2ZUNvbW1lbnRzVG9vbE5hbWU6IHtcblx0XHRcdGNvbnN0IGFyZ3MgPSAocmF3QXJncyA/PyB7fSkgYXMgSVJlc29sdmVDb21tZW50c0FyZ3M7XG5cdFx0XHRjb25zdCBpZHMgPSBnZXRVbmlxdWVDb21tZW50SWRzKGFyZ3MuY29tbWVudElkcywgcmVzb2x2ZUNvbW1lbnRzVG9vbE5hbWUpO1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBnZXRSZXNvbHZlZEZsYWcoYXJncy5yZXNvbHZlZCk7XG5cdFx0XHRjb25zdCBsaXN0YWJsZSA9IGxpc3RhYmxlQW5ub3RhdGlvbnMoc3RhdGUpO1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSBuZXcgTWFwKGxpc3RhYmxlLm1hcChhID0+IFthLmlkLCBhXSkpO1xuXHRcdFx0Y29uc3QgYWN0aW9uczogQW5ub3RhdGlvbnNBY3Rpb25bXSA9IFtdO1xuXHRcdFx0Y29uc3QgdXBkYXRlZDogc3RyaW5nW10gPSBbXTtcblx0XHRcdGNvbnN0IG5vdEZvdW5kOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiBpZHMpIHtcblx0XHRcdFx0Y29uc3QgYW5ub3RhdGlvbiA9IGV4aXN0aW5nLmdldChpZCk7XG5cdFx0XHRcdGlmICghYW5ub3RhdGlvbikge1xuXHRcdFx0XHRcdG5vdEZvdW5kLnB1c2goaWQpO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG1ldGEgPSByZWFkTWV0YShhbm5vdGF0aW9uKTtcblx0XHRcdFx0Y29uc3QgbmV4dE1ldGE6IElGZWVkYmFja0Fubm90YXRpb25NZXRhID0ge1xuXHRcdFx0XHRcdC4uLm1ldGEsXG5cdFx0XHRcdFx0a2luZDogbWV0YT8ua2luZCA/PyAndXNlcicsXG5cdFx0XHRcdFx0c3RhdGU6IHJlc29sdmVkID8gJ3Jlc29sdmVkJyA6ICdzdWJtaXR0ZWQnLFxuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogbWV0YT8uc2Vzc2lvblJlc291cmNlID8/IHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgbmV4dEFubm90YXRpb246IEFubm90YXRpb24gPSB7XG5cdFx0XHRcdFx0Li4uYW5ub3RhdGlvbixcblx0XHRcdFx0XHRyZXNvbHZlZCxcblx0XHRcdFx0XHRfbWV0YTogeyAuLi5hbm5vdGF0aW9uLl9tZXRhLCBbRkVFREJBQ0tfQU5OT1RBVElPTl9NRVRBX0tFWV06IG5leHRNZXRhIH0sXG5cdFx0XHRcdH07XG5cdFx0XHRcdGFjdGlvbnMucHVzaCh7IHR5cGU6IEFjdGlvblR5cGUuQW5ub3RhdGlvbnNTZXQsIGFubm90YXRpb246IG5leHRBbm5vdGF0aW9uIH0pO1xuXHRcdFx0XHR1cGRhdGVkLnB1c2goaWQpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29tbWVudHMgPSBsaXN0YWJsZS5tYXAoYSA9PiB1cGRhdGVkLmluY2x1ZGVzKGEuaWQpID8gc2VyaWFsaXplQ29tbWVudCh7IC4uLmEsIHJlc29sdmVkIH0pIDogc2VyaWFsaXplQ29tbWVudChhKSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRhY3Rpb25zLFxuXHRcdFx0XHRyZXN1bHQ6IEpTT04uc3RyaW5naWZ5KHsgcmVzb2x2ZWQsIHVwZGF0ZWRDb21tZW50SWRzOiB1cGRhdGVkLCBub3RGb3VuZENvbW1lbnRJZHM6IG5vdEZvdW5kLCBjb21tZW50cyB9LCB1bmRlZmluZWQsIDIpLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biBmZWVkYmFjayBzZXJ2ZXIgdG9vbDogJHt0b29sTmFtZX1gKTtcblx0fVxufVxuXG4vKipcbiAqIERpc3BsYXkgc3RyaW5ncyBmb3IgdGhlIGZlZWRiYWNrIChcImNvbW1lbnRzXCIpIHRvb2xzLCBhdXRob3JlZCBoZXJlIHNvIGV2ZXJ5XG4gKiBwcm92aWRlciAoQ29waWxvdCwgQ2xhdWRlLCBDb2RleCwgXHUyMDI2KSByZW5kZXJzIHRoZW0gaWRlbnRpY2FsbHkgaW5zdGVhZCBvZlxuICogZWFjaCBwcm92aWRlcidzIGRpc3BsYXkgbGF5ZXIgcmUtZGVyaXZpbmcgdGhlIHN0cmluZ3MgZnJvbSB0aGUgdG9vbCBuYW1lLlxuICogUmV0dXJucyBgdW5kZWZpbmVkYCBmb3IgdG9vbHMgdGhpcyBncm91cCBkb2VzIG5vdCBvd24sIHNvIHRoZSBjYWxsZXIgZmFsbHNcbiAqIGJhY2sgdG8gaXRzIGdlbmVyaWMgZGlzcGxheS5cbiAqXG4gKiB7QGxpbmsgdG9vbE5hbWV9IGlzIHRoZSBiYXJlIHRvb2wgbmFtZSAoYW55IHRyYW5zcG9ydCBwcmVmaXggc3VjaCBhcyBDbGF1ZGUnc1xuICogYG1jcF9fPHNlcnZlcj5fX2AgaGFzIGFscmVhZHkgYmVlbiBzdHJpcHBlZCBieSB0aGUgZGlzcGF0Y2hlcikuXG4gKi9cbmZ1bmN0aW9uIGdldEZlZWRiYWNrVG9vbERpc3BsYXkodG9vbE5hbWU6IHN0cmluZywgX2FyZ3M6IHVua25vd24sIF9yZXN1bHQ/OiBJU2VydmVyVG9vbERpc3BsYXlSZXN1bHQpOiBJU2VydmVyVG9vbERpc3BsYXkgfCB1bmRlZmluZWQge1xuXHRzd2l0Y2ggKHRvb2xOYW1lKSB7XG5cdFx0Y2FzZSBhZGRDb21tZW50VG9vbE5hbWU6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ3Rvb2xOYW1lLmFkZENvbW1lbnQnLCBcIkFkZCBDb21tZW50XCIpLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ3Rvb2xJbnZva2UuYWRkQ29tbWVudCcsIFwiQWRkIGNvbW1lbnRcIiksXG5cdFx0XHR9O1xuXHRcdGNhc2UgbGlzdENvbW1lbnRzVG9vbE5hbWU6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ3Rvb2xOYW1lLmxpc3RDb21tZW50cycsIFwiTGlzdCBDb21tZW50c1wiKSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCd0b29sSW52b2tlLmxpc3RDb21tZW50cycsIFwiTGlzdCBjb21tZW50c1wiKSxcblx0XHRcdH07XG5cdFx0Y2FzZSBkZWxldGVDb21tZW50c1Rvb2xOYW1lOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCd0b29sTmFtZS5kZWxldGVDb21tZW50cycsIFwiRGVsZXRlIENvbW1lbnRzXCIpLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ3Rvb2xJbnZva2UuZGVsZXRlQ29tbWVudHMnLCBcIkRlbGV0ZSBjb21tZW50c1wiKSxcblx0XHRcdH07XG5cdFx0Y2FzZSByZXNvbHZlQ29tbWVudHNUb29sTmFtZTpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgndG9vbE5hbWUucmVzb2x2ZUNvbW1lbnRzJywgXCJSZXNvbHZlIENvbW1lbnRzXCIpLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ3Rvb2xJbnZva2UucmVzb2x2ZUNvbW1lbnRzJywgXCJSZXNvbHZlIGNvbW1lbnRzXCIpLFxuXHRcdFx0fTtcblx0XHRjYXNlIHZpZXdVbnJldmlld2VkQ29tbWVudHNUb29sTmFtZTpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgndG9vbE5hbWUudmlld1VucmV2aWV3ZWRDb21tZW50cycsIFwiVmlldyBDb21tZW50c1wiKSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCd0b29sSW52b2tlLnZpZXdVbnJldmlld2VkQ29tbWVudHMnLCBcIlZpZXcgY29tbWVudHNcIiksXG5cdFx0XHR9O1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8qKlxuICogVGhlIGZlZWRiYWNrIChcImNvbW1lbnRzXCIpIHNlcnZlci10b29sIGdyb3VwLCBjb250cmlidXRlZCB0byB0aGVcbiAqIHtAbGluayBBZ2VudFNlcnZlclRvb2xIb3N0fSBhdCBzdGFydHVwIChzZWUgYG5vZGUvYWdlbnRTZXJ2aWNlLnRzYCkuIFdyYXBzXG4gKiB0aGUgcHVyZSB7QGxpbmsgYXBwbHlGZWVkYmFja1Rvb2x9IGV4ZWN1dG9yIHdpdGggdGhlIGFubm90YXRpb25zLWNoYW5uZWwgSS9POlxuICogaXQgcmVhZHMgdGhlIHNlc3Npb24ncyBjdXJyZW50IHtAbGluayBBbm5vdGF0aW9uc1N0YXRlfSwgYXBwbGllcyB0aGUgdG9vbCxcbiAqIGFuZCBkaXNwYXRjaGVzIHRoZSByZXN1bHRpbmcgYW5ub3RhdGlvbiBhY3Rpb25zIHRocm91Z2ggdGhlIHN0YXRlIG1hbmFnZXJcbiAqICh0aGUgc2luZ2xlIHdyaXRlcikuXG4gKi9cbmV4cG9ydCBjb25zdCBmZWVkYmFja1NlcnZlclRvb2xHcm91cDogSVNlcnZlclRvb2xHcm91cCA9IHtcblx0ZGVmaW5pdGlvbnM6IGZlZWRiYWNrU2VydmVyVG9vbERlZmluaXRpb25zLFxuXHRpc0VuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH0sXG5cdGNhblJlcXVpcmVDb25maXJtYXRpb24odG9vbE5hbWUpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmVlZGJhY2tUb29sUmVxdWlyZXNDb25maXJtYXRpb24odG9vbE5hbWUpO1xuXHR9LFxuXHRyZXF1aXJlc0NvbmZpcm1hdGlvbihzdGF0ZU1hbmFnZXIsIGNoYXRVcmksIHRvb2xOYW1lKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFmZWVkYmFja1Rvb2xSZXF1aXJlc0NvbmZpcm1hdGlvbih0b29sTmFtZSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIGhhc1JldmVhbGFibGVDb21tZW50cyhnZXRGZWVkYmFja1Rvb2xTdGF0ZShzdGF0ZU1hbmFnZXIsIGNoYXRVcmkpLnN0YXRlKTtcblx0fSxcblx0Z2V0RGlzcGxheSh0b29sTmFtZSwgYXJncywgcmVzdWx0KTogSVNlcnZlclRvb2xEaXNwbGF5IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gZ2V0RmVlZGJhY2tUb29sRGlzcGxheSh0b29sTmFtZSwgYXJncywgcmVzdWx0KTtcblx0fSxcblx0ZXhlY3V0ZShzdGF0ZU1hbmFnZXIsIGNoYXRVcmksIHRvb2xOYW1lLCByYXdBcmdzKTogc3RyaW5nIHtcblx0XHRjb25zdCB7IG1haW5TZXNzaW9uVXJpLCBhbm5vdGF0aW9uc1VyaSwgc3RhdGUgfSA9IGdldEZlZWRiYWNrVG9vbFN0YXRlKHN0YXRlTWFuYWdlciwgY2hhdFVyaSk7XG5cdFx0Y29uc3Qgb3V0Y29tZSA9IGFwcGx5RmVlZGJhY2tUb29sKHN0YXRlLCBtYWluU2Vzc2lvblVyaSwgdG9vbE5hbWUsIHJhd0FyZ3MpO1xuXHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIG91dGNvbWUuYWN0aW9ucykge1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGFubm90YXRpb25zVXJpLCBhY3Rpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gb3V0Y29tZS5yZXN1bHQ7XG5cdH0sXG59O1xuXG5mdW5jdGlvbiBnZXRGZWVkYmFja1Rvb2xTdGF0ZShzdGF0ZU1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlciwgY2hhdFVyaTogc3RyaW5nKTogeyBtYWluU2Vzc2lvblVyaTogc3RyaW5nOyBhbm5vdGF0aW9uc1VyaTogc3RyaW5nOyBzdGF0ZTogQW5ub3RhdGlvbnNTdGF0ZSB9IHtcblx0Ly8gUGVlciBjaGF0cyBzaGFyZSBmZWVkYmFjayB3aXRoIHRoZWlyIG93bmluZyBzZXNzaW9uLlxuXHRjb25zdCBtYWluU2Vzc2lvblVyaSA9IHBhcnNlQ2hhdFVyaShjaGF0VXJpKT8uc2Vzc2lvbiA/PyBjaGF0VXJpO1xuXHRjb25zdCBhbm5vdGF0aW9uc1VyaSA9IGJ1aWxkQW5ub3RhdGlvbnNVcmkobWFpblNlc3Npb25VcmkpO1xuXHRjb25zdCBzbmFwc2hvdCA9IHN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChhbm5vdGF0aW9uc1VyaSk7XG5cdGNvbnN0IHN0YXRlID0gKHNuYXBzaG90Py5zdGF0ZSBhcyBBbm5vdGF0aW9uc1N0YXRlIHwgdW5kZWZpbmVkKSA/PyB7IGFubm90YXRpb25zOiBbXSB9O1xuXHRyZXR1cm4geyBtYWluU2Vzc2lvblVyaSwgYW5ub3RhdGlvbnNVcmksIHN0YXRlIH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDhCQUE4Qiw0QkFBNEIsb0NBQW9DLDZCQUEyRDtBQUNsSyxTQUFTLDJCQUEyQjtBQUVw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
