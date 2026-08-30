import { localize } from "../../../../../nls.js";
function truncateLabel(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 1) + "\u2026";
}
function buildFlowGraph(events) {
  const subagentToolNames = ["runSubagent", "search_subagent"];
  function isSubagentName(name) {
    for (const toolName of subagentToolNames) {
      if (name === toolName) {
        return true;
      }
      if (name.startsWith(toolName)) {
        const nextChar = name[toolName.length];
        if (nextChar === "-" || nextChar === " " || nextChar === "(" || nextChar === ":") {
          return true;
        }
      }
    }
    return false;
  }
  const emojiPrefixRe = /^\u{1F6E0}\uFE0F?\s*/u;
  function stripToolEmoji(name) {
    return name.replace(emojiPrefixRe, "");
  }
  const completionDescsByParent = /* @__PURE__ */ new Map();
  const startedCountByParent = /* @__PURE__ */ new Map();
  for (const e of events) {
    if (e.kind === "subagentInvocation" && isSubagentName(e.agentName) && e.description && e.parentEventId) {
      let descs = completionDescsByParent.get(e.parentEventId);
      if (!descs) {
        descs = [];
        completionDescsByParent.set(e.parentEventId, descs);
      }
      descs.push(e.description);
    }
  }
  function getSubagentDescription(event) {
    if (event.kind !== "subagentInvocation" || !event.parentEventId) {
      return void 0;
    }
    const descs = completionDescsByParent.get(event.parentEventId);
    if (!descs || descs.length === 0) {
      return event.description && event.description !== event.agentName ? event.description : void 0;
    }
    const idx = startedCountByParent.get(event.parentEventId) ?? 0;
    startedCountByParent.set(event.parentEventId, idx + 1);
    return descs[idx] ?? descs[0];
  }
  const filtered = events.filter((e) => {
    if (e.kind === "subagentInvocation" && isSubagentName(e.agentName)) {
      return false;
    }
    return true;
  });
  const idToEvent = /* @__PURE__ */ new Map();
  const idToChildren = /* @__PURE__ */ new Map();
  const roots = [];
  for (const event of filtered) {
    if (event.id) {
      idToEvent.set(event.id, event);
    }
  }
  for (const event of filtered) {
    if (event.parentEventId && idToEvent.has(event.parentEventId)) {
      let children = idToChildren.get(event.parentEventId);
      if (!children) {
        children = [];
        idToChildren.set(event.parentEventId, children);
      }
      children.push(event);
    } else {
      roots.push(event);
    }
  }
  const byCreated = (a, b) => a.created.getTime() - b.created.getTime();
  roots.sort(byCreated);
  for (const children of idToChildren.values()) {
    children.sort(byCreated);
  }
  function toFlowNode(event) {
    const children = event.id ? idToChildren.get(event.id) : void 0;
    const effectiveKind = getEffectiveKind(event);
    let label = getEventLabel(event, effectiveKind);
    const sublabel = getEventSublabel(event, effectiveKind);
    let tooltip = getEventTooltip(event);
    let description;
    if (effectiveKind === "subagentInvocation") {
      description = getSubagentDescription(event);
      const cleanDesc = description?.replace(/^Subagent:\s*/i, "");
      label = cleanDesc ? localize("subagentWithDesc", "Subagent: {0}", truncateLabel(cleanDesc, 30)) : localize("subagentLabel", "Subagent");
      if (description) {
        if (tooltip && !tooltip.includes(description)) {
          const lines = tooltip.split("\n");
          lines.splice(1, 0, description);
          tooltip = lines.join("\n");
        }
      }
    }
    return {
      id: event.id ?? `event-${events.indexOf(event)}`,
      kind: effectiveKind,
      category: event.kind === "generic" ? event.category : void 0,
      label,
      sublabel,
      description,
      tooltip,
      isError: isErrorEvent(event),
      created: event.created.getTime(),
      children: children?.map(toFlowNode) ?? []
    };
  }
  const rawNodes = roots.map(toFlowNode);
  return collapseSubagentToolCalls(rawNodes);
  function collapseSubagentToolCalls(nodeList) {
    let changed = false;
    const result = [];
    for (const node of nodeList) {
      if (node.kind === "toolCall" && isSubagentName(stripToolEmoji(node.label))) {
        changed = true;
        const flatChildren = flattenChildSessionRefs(node.children);
        const subagentChildren = flatChildren.filter((c) => c.kind === "subagentInvocation");
        if (subagentChildren.length > 0) {
          const otherChildren = flatChildren.filter((c) => c.kind !== "subagentInvocation");
          for (let i = 0; i < subagentChildren.length; i++) {
            const extra = i === 0 ? otherChildren : [];
            result.push({
              ...subagentChildren[i],
              children: collapseSubagentToolCalls(
                [...subagentChildren[i].children, ...extra]
              )
            });
          }
        } else {
          result.push(...collapseSubagentToolCalls(flatChildren));
        }
      } else {
        const newChildren = collapseSubagentToolCalls(node.children);
        if (newChildren !== node.children) {
          changed = true;
          result.push({ ...node, children: newChildren });
        } else {
          result.push(node);
        }
      }
    }
    return changed ? result : nodeList;
  }
  function flattenChildSessionRefs(nodeList) {
    if (!nodeList.some((n) => n.kind === "generic" && n.category === "subagent")) {
      return nodeList;
    }
    const result = [];
    for (const node of nodeList) {
      if (node.kind === "generic" && node.category === "subagent") {
        const subagentChild = node.children.find((c) => c.kind === "subagentInvocation");
        if (subagentChild) {
          const siblings = node.children.filter((c) => c !== subagentChild);
          result.push({
            ...subagentChild,
            children: [...subagentChild.children, ...siblings]
          });
        } else {
          result.push(...node.children);
        }
      } else {
        result.push(node);
      }
    }
    return result;
  }
}
function filterFlowNodes(nodes, options) {
  let result = filterByKind(nodes, options.isKindVisible);
  if (options.textFilter) {
    result = filterByText(result, options.textFilter);
  }
  return result;
}
function filterByKind(nodes, isKindVisible) {
  const result = [];
  let changed = false;
  for (const node of nodes) {
    if (!isKindVisible(node.kind, node.category)) {
      changed = true;
      if (node.kind === "subagentInvocation") {
        continue;
      }
      result.push(...filterByKind(node.children, isKindVisible));
      continue;
    }
    const filteredChildren = filterByKind(node.children, isKindVisible);
    if (filteredChildren !== node.children) {
      changed = true;
      result.push({ ...node, children: filteredChildren });
    } else {
      result.push(node);
    }
  }
  return changed ? result : nodes;
}
function nodeMatchesText(node, text) {
  return node.label.toLowerCase().includes(text) || (node.sublabel?.toLowerCase().includes(text) ?? false) || (node.tooltip?.toLowerCase().includes(text) ?? false);
}
function filterByText(nodes, text) {
  const result = [];
  for (const node of nodes) {
    if (nodeMatchesText(node, text)) {
      result.push(node);
      continue;
    }
    const filteredChildren = filterByText(node.children, text);
    if (filteredChildren.length > 0) {
      result.push({ ...node, children: filteredChildren });
    }
  }
  return result;
}
function countNodes(nodes) {
  let count = 0;
  for (const node of nodes) {
    count += 1 + countNodes(node.children);
  }
  return count;
}
function sliceFlowNodes(nodes, maxCount) {
  const totalCount = countNodes(nodes);
  if (totalCount <= maxCount) {
    return { nodes, totalCount, shownCount: totalCount };
  }
  let remaining = maxCount;
  function sliceTree(nodeList) {
    const result = [];
    for (const node of nodeList) {
      if (remaining <= 0) {
        break;
      }
      remaining--;
      if (node.children.length === 0 || remaining <= 0) {
        result.push(node.children.length === 0 ? node : { ...node, children: [] });
      } else {
        const slicedChildren = sliceTree(node.children);
        result.push(slicedChildren !== node.children ? { ...node, children: slicedChildren } : node);
      }
    }
    return result;
  }
  const sliced = sliceTree(nodes);
  const shownCount = maxCount - remaining;
  return { nodes: sliced, totalCount, shownCount };
}
function isDiscoveryNode(node) {
  return node.kind === "generic" && node.category === "discovery";
}
function mergeDiscoveryNodes(nodes) {
  const result = [];
  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i];
    if (!isDiscoveryNode(node)) {
      const mergedChildren = mergeDiscoveryNodes(node.children);
      result.push(mergedChildren !== node.children ? { ...node, children: mergedChildren } : node);
      i++;
      continue;
    }
    const run = [node];
    let j = i + 1;
    while (j < nodes.length && isDiscoveryNode(nodes[j])) {
      run.push(nodes[j]);
      j++;
    }
    if (run.length < 2) {
      result.push(node);
      i = j;
      continue;
    }
    const mergedId = `merged-discovery:${run[0].id}`;
    const labels = run.map((n) => n.label);
    const uniqueLabels = [...new Set(labels)];
    const summaryLabel = uniqueLabels.length <= 2 ? uniqueLabels.join(", ") : localize("discoveryMergedLabel", "{0} +{1} more", uniqueLabels[0], run.length - 1);
    result.push({
      id: mergedId,
      kind: "generic",
      category: "discovery",
      label: summaryLabel,
      sublabel: localize("discoveryStepsCount", "{0} discovery steps", run.length),
      tooltip: run.map((n) => n.label + (n.sublabel ? `: ${n.sublabel}` : "")).join("\n"),
      created: run[0].created,
      children: [],
      mergedNodes: run
    });
    i = j;
  }
  return result;
}
function isToolCallNode(node) {
  return node.kind === "toolCall";
}
function getToolName(node) {
  return node.label;
}
function mergeToolCallNodes(nodes) {
  const result = [];
  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i];
    if (!isToolCallNode(node)) {
      const mergedChildren = mergeToolCallNodes(node.children);
      result.push(mergedChildren !== node.children ? { ...node, children: mergedChildren } : node);
      i++;
      continue;
    }
    const toolName = getToolName(node);
    const run = [node];
    let j = i + 1;
    while (j < nodes.length && isToolCallNode(nodes[j]) && getToolName(nodes[j]) === toolName) {
      run.push(nodes[j]);
      j++;
    }
    if (run.length < 2) {
      const mergedChildren = mergeToolCallNodes(node.children);
      result.push(mergedChildren !== node.children ? { ...node, children: mergedChildren } : node);
      i = j;
      continue;
    }
    const mergedId = `merged-toolCall:${run[0].id}`;
    result.push({
      id: mergedId,
      kind: "toolCall",
      label: toolName,
      sublabel: localize("toolCallsCount", "{0} calls", run.length),
      tooltip: run.map((n) => n.label + (n.sublabel ? `: ${n.sublabel}` : "")).join("\n"),
      created: run[0].created,
      children: [],
      mergedNodes: run
    });
    i = j;
  }
  return result;
}
function getEffectiveKind(event) {
  if (event.kind === "generic") {
    const name = event.name.toLowerCase().replace(/[\s_-]+/g, "");
    if (name === "usermessage" || name === "userprompt" || name === "user" || name.startsWith("usermessage")) {
      return "userMessage";
    }
    if (name === "response" || name.startsWith("agentresponse") || name.startsWith("assistantresponse") || name.startsWith("modelresponse")) {
      return "agentResponse";
    }
    const cat = event.category?.toLowerCase();
    if (cat === "user" || cat === "usermessage") {
      return "userMessage";
    }
    if (cat === "response" || cat === "agentresponse") {
      return "agentResponse";
    }
  }
  return event.kind;
}
function getEventLabel(event, effectiveKind) {
  const kind = effectiveKind ?? event.kind;
  switch (kind) {
    case "userMessage":
      return localize("userLabel", "User Message");
    case "modelTurn":
      return event.kind === "modelTurn" ? event.model ?? localize("modelTurnLabel", "Model Turn") : localize("modelTurnLabel", "Model Turn");
    case "toolCall":
      return event.kind === "toolCall" ? event.toolName : event.kind === "generic" ? event.name : localize("toolCallLabel", "Tool Call");
    case "subagentInvocation":
      return event.kind === "subagentInvocation" ? event.agentName : localize("subagentFallback", "Subagent");
    case "agentResponse":
      return localize("agentResponseLabel", "Agent Response");
    case "generic":
      return event.kind === "generic" ? event.name : localize("genericLabel", "Event");
  }
}
function getEventSublabel(event, effectiveKind) {
  const kind = effectiveKind ?? event.kind;
  switch (kind) {
    case "modelTurn": {
      const parts = [];
      if (event.kind === "modelTurn" && event.requestName) {
        parts.push(event.requestName);
      }
      if (event.kind === "modelTurn" && event.totalTokens) {
        parts.push(localize("tokenCount", "{0} tokens", event.totalTokens));
      }
      if (event.kind === "modelTurn" && event.durationInMillis) {
        parts.push(formatDuration(event.durationInMillis));
      }
      return parts.length > 0 ? parts.join(" \xB7 ") : void 0;
    }
    case "toolCall": {
      const parts = [];
      if (event.kind === "toolCall" && event.result) {
        parts.push(event.result);
      }
      if (event.kind === "toolCall" && event.durationInMillis) {
        parts.push(formatDuration(event.durationInMillis));
      }
      return parts.length > 0 ? parts.join(" \xB7 ") : void 0;
    }
    case "subagentInvocation": {
      const parts = [];
      if (event.kind === "subagentInvocation" && event.status) {
        parts.push(event.status);
      }
      if (event.kind === "subagentInvocation" && event.durationInMillis) {
        parts.push(formatDuration(event.durationInMillis));
      }
      return parts.length > 0 ? parts.join(" \xB7 ") : void 0;
    }
    case "userMessage":
    case "agentResponse": {
      let text;
      if (event.kind === "userMessage" || event.kind === "agentResponse") {
        text = event.message;
      } else if (event.kind === "generic") {
        text = event.details;
      }
      if (!text) {
        return void 0;
      }
      const lines = text.split("\n");
      let firstLine = "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && trimmed.length > 2) {
          firstLine = trimmed;
          break;
        }
      }
      if (!firstLine) {
        firstLine = text.replace(/\s+/g, " ").trim();
      }
      if (!firstLine) {
        return void 0;
      }
      return firstLine.length > 60 ? firstLine.substring(0, 57) + "..." : firstLine;
    }
    default:
      return void 0;
  }
}
function formatDuration(ms) {
  if (ms < 1e3) {
    return `${ms}ms`;
  }
  return `${(ms / 1e3).toFixed(1)}s`;
}
function isErrorEvent(event) {
  return event.kind === "toolCall" && event.result === "error" || event.kind === "generic" && event.level === 3 || event.kind === "subagentInvocation" && event.status === "failed";
}
const TOOLTIP_MAX_LENGTH = 500;
function getEventTooltip(event) {
  switch (event.kind) {
    case "userMessage": {
      const msg = event.message.trim();
      if (msg.length > TOOLTIP_MAX_LENGTH) {
        return msg.substring(0, TOOLTIP_MAX_LENGTH) + "\u2026";
      }
      return msg || void 0;
    }
    case "toolCall": {
      const parts = [event.toolName];
      if (event.input) {
        const input = event.input.trim();
        parts.push(localize("tooltipInput", "Input: {0}", input.length > TOOLTIP_MAX_LENGTH ? input.substring(0, TOOLTIP_MAX_LENGTH) + "\u2026" : input));
      }
      if (event.output) {
        const output = event.output.trim();
        parts.push(localize("tooltipOutput", "Output: {0}", output.length > TOOLTIP_MAX_LENGTH ? output.substring(0, TOOLTIP_MAX_LENGTH) + "\u2026" : output));
      }
      if (event.result) {
        parts.push(localize("tooltipResult", "Result: {0}", event.result));
      }
      return parts.join("\n");
    }
    case "subagentInvocation": {
      const parts = [event.agentName];
      if (event.description) {
        parts.push(event.description);
      }
      if (event.status) {
        parts.push(localize("tooltipStatus", "Status: {0}", event.status));
      }
      if (event.toolCallCount !== void 0) {
        parts.push(localize("tooltipToolCalls", "Tool calls: {0}", event.toolCallCount));
      }
      if (event.modelTurnCount !== void 0) {
        parts.push(localize("tooltipModelTurns", "Model turns: {0}", event.modelTurnCount));
      }
      return parts.join("\n");
    }
    case "generic": {
      if (event.details) {
        const details = event.details.trim();
        return details.length > TOOLTIP_MAX_LENGTH ? details.substring(0, TOOLTIP_MAX_LENGTH) + "\u2026" : details;
      }
      return void 0;
    }
    case "modelTurn": {
      const parts = [];
      if (event.model) {
        parts.push(event.model);
      }
      if (event.totalTokens !== void 0) {
        parts.push(localize("tooltipTokens", "Tokens: {0}", event.totalTokens));
      }
      if (event.inputTokens !== void 0) {
        parts.push(localize("tooltipInputTokens", "Input tokens: {0}", event.inputTokens));
      }
      if (event.outputTokens !== void 0) {
        parts.push(localize("tooltipOutputTokens", "Output tokens: {0}", event.outputTokens));
      }
      if (event.cachedTokens !== void 0) {
        parts.push(localize("tooltipCachedTokens", "Cached tokens: {0}", event.cachedTokens));
      }
      if (event.durationInMillis !== void 0) {
        parts.push(localize("tooltipDuration", "Duration: {0}", formatDuration(event.durationInMillis)));
      }
      return parts.length > 0 ? parts.join("\n") : void 0;
    }
    default:
      return void 0;
  }
}
export {
  buildFlowGraph,
  filterFlowNodes,
  mergeDiscoveryNodes,
  mergeToolCallNodes,
  sliceFlowNodes
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXREZWJ1Z1xcY2hhdERlYnVnRmxvd0dyYXBoLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNoYXREZWJ1Z0V2ZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXREZWJ1Z1NlcnZpY2UuanMnO1xuXG4vLyAtLS0tIERhdGEgbW9kZWwgLS0tLVxuXG5leHBvcnQgaW50ZXJmYWNlIEZsb3dOb2RlIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkga2luZDogSUNoYXREZWJ1Z0V2ZW50WydraW5kJ107XG5cdC8qKiBGb3IgYGdlbmVyaWNgIG5vZGVzOiB0aGUgZXZlbnQgY2F0ZWdvcnkgKGUuZy4gYCdkaXNjb3ZlcnknYCkuIFVzZWQgdG8gbmFycm93IGZpbHRlcmluZy4gKi9cblx0cmVhZG9ubHkgY2F0ZWdvcnk/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN1YmxhYmVsPzogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcblx0cmVhZG9ubHkgdG9vbHRpcD86IHN0cmluZztcblx0cmVhZG9ubHkgaXNFcnJvcj86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNyZWF0ZWQ6IG51bWJlcjtcblx0cmVhZG9ubHkgY2hpbGRyZW46IEZsb3dOb2RlW107XG5cdC8qKiBQcmVzZW50IG9uIG1lcmdlZCBkaXNjb3Zlcnkgbm9kZXM6IHRoZSBpbmRpdmlkdWFsIG5vZGVzIHRoYXQgd2VyZSBtZXJnZWQuICovXG5cdHJlYWRvbmx5IG1lcmdlZE5vZGVzPzogRmxvd05vZGVbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBGbG93RmlsdGVyT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGlzS2luZFZpc2libGU6IChraW5kOiBzdHJpbmcsIGNhdGVnb3J5Pzogc3RyaW5nKSA9PiBib29sZWFuO1xuXHRyZWFkb25seSB0ZXh0RmlsdGVyOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTGF5b3V0Tm9kZSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGtpbmQ6IElDaGF0RGVidWdFdmVudFsna2luZCddO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBzdWJsYWJlbD86IHN0cmluZztcblx0cmVhZG9ubHkgdG9vbHRpcD86IHN0cmluZztcblx0cmVhZG9ubHkgaXNFcnJvcj86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHg6IG51bWJlcjtcblx0cmVhZG9ubHkgeTogbnVtYmVyO1xuXHRyZWFkb25seSB3aWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSBoZWlnaHQ6IG51bWJlcjtcblx0LyoqIE51bWJlciBvZiBpbmRpdmlkdWFsIG5vZGVzIG1lcmdlZCBpbnRvIHRoaXMgb25lIChmb3IgZGlzY292ZXJ5IG1lcmdpbmcpLiAqL1xuXHRyZWFkb25seSBtZXJnZWRDb3VudD86IG51bWJlcjtcblx0LyoqIFdoZXRoZXIgdGhlIG1lcmdlZCBub2RlIGlzIGN1cnJlbnRseSBleHBhbmRlZCAoaW5kaXZpZHVhbCBub2RlcyBzaG93biB0byB0aGUgcmlnaHQpLiAqL1xuXHRyZWFkb25seSBpc01lcmdlZEV4cGFuZGVkPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBMYXlvdXRFZGdlIHtcblx0cmVhZG9ubHkgZnJvbUlkPzogc3RyaW5nO1xuXHRyZWFkb25seSB0b0lkPzogc3RyaW5nO1xuXHRyZWFkb25seSBmcm9tWDogbnVtYmVyO1xuXHRyZWFkb25seSBmcm9tWTogbnVtYmVyO1xuXHRyZWFkb25seSB0b1g6IG51bWJlcjtcblx0cmVhZG9ubHkgdG9ZOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3ViZ3JhcGhSZWN0IHtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgeDogbnVtYmVyO1xuXHRyZWFkb25seSB5OiBudW1iZXI7XG5cdHJlYWRvbmx5IHdpZHRoOiBudW1iZXI7XG5cdHJlYWRvbmx5IGhlaWdodDogbnVtYmVyO1xuXHRyZWFkb25seSBkZXB0aDogbnVtYmVyO1xuXHRyZWFkb25seSBub2RlSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgY29sbGFwc2VkQ2hpbGRDb3VudD86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBGbG93TGF5b3V0IHtcblx0cmVhZG9ubHkgbm9kZXM6IExheW91dE5vZGVbXTtcblx0cmVhZG9ubHkgZWRnZXM6IExheW91dEVkZ2VbXTtcblx0cmVhZG9ubHkgc3ViZ3JhcGhzOiBTdWJncmFwaFJlY3RbXTtcblx0cmVhZG9ubHkgd2lkdGg6IG51bWJlcjtcblx0cmVhZG9ubHkgaGVpZ2h0OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRmxvd0NoYXJ0UmVuZGVyUmVzdWx0IHtcblx0cmVhZG9ubHkgc3ZnOiBTVkdFbGVtZW50O1xuXHQvKiogTWFwIGZyb20gbm9kZS9zdWJncmFwaCBJRCB0byBpdHMgZm9jdXNhYmxlIFNWRyBlbGVtZW50LiAqL1xuXHRyZWFkb25seSBmb2N1c2FibGVFbGVtZW50czogTWFwPHN0cmluZywgU1ZHRWxlbWVudD47XG5cdC8qKiBBZGphY2VuY3kgbGlzdHMgZGVyaXZlZCBmcm9tIGdyYXBoIGVkZ2VzOiBzdWNjZXNzb3JzIGFuZCBwcmVkZWNlc3NvcnMgcGVyIG5vZGUgSUQuICovXG5cdHJlYWRvbmx5IGFkamFjZW5jeTogTWFwPHN0cmluZywgeyBuZXh0OiBzdHJpbmdbXTsgcHJldjogc3RyaW5nW10gfT47XG5cdC8qKiBNYXAgZnJvbSBub2RlL3N1YmdyYXBoIElEIHRvIGl0cyBsYXlvdXQgcG9zaXRpb24uICovXG5cdHJlYWRvbmx5IHBvc2l0aW9uczogTWFwPHN0cmluZywgeyB4OiBudW1iZXI7IHk6IG51bWJlciB9Pjtcbn1cblxuLy8gLS0tLSBCdWlsZCBmbG93IGdyYXBoIGZyb20gZGVidWcgZXZlbnRzIC0tLS1cblxuLyoqXG4gKiBUcnVuY2F0ZXMgYSBzdHJpbmcgdG8gYSBtYXggbGVuZ3RoLCBhcHBlbmRpbmcgYW4gZWxsaXBzaXMgaWYgdHJpbW1lZC5cbiAqL1xuZnVuY3Rpb24gdHJ1bmNhdGVMYWJlbCh0ZXh0OiBzdHJpbmcsIG1heExlbmd0aDogbnVtYmVyKTogc3RyaW5nIHtcblx0aWYgKHRleHQubGVuZ3RoIDw9IG1heExlbmd0aCkge1xuXHRcdHJldHVybiB0ZXh0O1xuXHR9XG5cdHJldHVybiB0ZXh0LnN1YnN0cmluZygwLCBtYXhMZW5ndGggLSAxKSArICdcXHUyMDI2Jztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkRmxvd0dyYXBoKGV2ZW50czogcmVhZG9ubHkgSUNoYXREZWJ1Z0V2ZW50W10pOiBGbG93Tm9kZVtdIHtcblx0Ly8gQmVmb3JlIGZpbHRlcmluZywgZXh0cmFjdCBkZXNjcmlwdGlvbiBtZXRhZGF0YSBmcm9tIHN1YmFnZW50IGV2ZW50c1xuXHQvLyB0aGF0IHdpbGwgYmUgZmlsdGVyZWQgb3V0LCBzbyB3ZSBjYW4gZW5yaWNoIHRoZSBzdXJ2aXZpbmcgc2libGluZyBldmVudHMuXG5cdGNvbnN0IHN1YmFnZW50VG9vbE5hbWVzID0gWydydW5TdWJhZ2VudCcsICdzZWFyY2hfc3ViYWdlbnQnXTtcblxuXHQvKipcblx0ICogQ2hlY2sgd2hldGhlciBhIG5hbWUgbWF0Y2hlcyBhIGtub3duIHN1YmFnZW50IHRvb2wgbmFtZS5cblx0ICogSGFuZGxlcyBleGFjdCBtYXRjaGVzIGFuZCBuYW1lcyB3aXRoIHN1ZmZpeGVzIChlLmcuXG5cdCAqIFwicnVuU3ViYWdlbnQtZGVmYXVsdFwiLCBcInJ1blN1YmFnZW50IChhZ2VudClcIiwgXCJydW5TdWJhZ2VudDogZGVzY1wiKS5cblx0ICogQ2FsbGVycyBtdXN0IHN0cmlwIGFueSBlbW9qaSBwcmVmaXggYmVmb3JlIGNhbGxpbmcuXG5cdCAqL1xuXHRmdW5jdGlvbiBpc1N1YmFnZW50TmFtZShuYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRmb3IgKGNvbnN0IHRvb2xOYW1lIG9mIHN1YmFnZW50VG9vbE5hbWVzKSB7XG5cdFx0XHRpZiAobmFtZSA9PT0gdG9vbE5hbWUpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAobmFtZS5zdGFydHNXaXRoKHRvb2xOYW1lKSkge1xuXHRcdFx0XHRjb25zdCBuZXh0Q2hhciA9IG5hbWVbdG9vbE5hbWUubGVuZ3RoXTtcblx0XHRcdFx0aWYgKG5leHRDaGFyID09PSAnLScgfHwgbmV4dENoYXIgPT09ICcgJyB8fCBuZXh0Q2hhciA9PT0gJygnIHx8IG5leHRDaGFyID09PSAnOicpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvKiogU3RyaXAgdGhlIGxlYWRpbmcgdG9vbCBlbW9qaSBwcmVmaXggaWYgcHJlc2VudC4gKi9cblx0Y29uc3QgZW1vamlQcmVmaXhSZSA9IC9eXFx1ezFGNkUwfVxcdUZFMEY/XFxzKi91O1xuXHRmdW5jdGlvbiBzdHJpcFRvb2xFbW9qaShuYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBuYW1lLnJlcGxhY2UoZW1vamlQcmVmaXhSZSwgJycpO1xuXHR9XG5cblx0Ly8gVGhlIGV4dGVuc2lvbiBtYXkgZW1pdCB0d28gc3ViYWdlbnRJbnZvY2F0aW9uIGV2ZW50cyBwZXIgc3ViYWdlbnQ6XG5cdC8vIDEuIFwic3RhcnRlZFwiIG1hcmtlciAoYWdlbnROYW1lID0gZGVzY3JpcHRpdmUgbmFtZSwgc3RhdHVzID0gcnVubmluZykgXHUyMDE0IHN1cnZpdmVzIGZpbHRlcmluZ1xuXHQvLyAyLiBjb21wbGV0aW9uIGV2ZW50IChhZ2VudE5hbWUgPSBcInJ1blN1YmFnZW50XCIgLyBcInJ1blN1YmFnZW50LSpcIiwgc3RhdHVzID0gY29tcGxldGVkKSBcdTIwMTQgZmlsdGVyZWQgb3V0XG5cdC8vIFRoZSBjb21wbGV0aW9uIGV2ZW50IGNhcnJpZXMgdGhlIHJlYWwgZGVzY3JpcHRpb24uIFdoZW4gbXVsdGlwbGUgc3ViYWdlbnRzXG5cdC8vIHJ1biB1bmRlciB0aGUgc2FtZSBwYXJlbnQsIHRoZXkgc2hhcmUgYSBwYXJlbnRFdmVudElkLCBzbyB3ZSBtYXRjaCB0aGVtXG5cdC8vIGJ5IG9yZGVyOiB0aGUgTi10aCBzdGFydGVkIG1hcmtlciBnZXRzIHRoZSBOLXRoIGNvbXBsZXRpb24ncyBkZXNjcmlwdGlvbi5cblx0Y29uc3QgY29tcGxldGlvbkRlc2NzQnlQYXJlbnQgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nW10+KCk7XG5cdGNvbnN0IHN0YXJ0ZWRDb3VudEJ5UGFyZW50ID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0Zm9yIChjb25zdCBlIG9mIGV2ZW50cykge1xuXHRcdGlmIChlLmtpbmQgPT09ICdzdWJhZ2VudEludm9jYXRpb24nICYmIGlzU3ViYWdlbnROYW1lKGUuYWdlbnROYW1lKSAmJiBlLmRlc2NyaXB0aW9uICYmIGUucGFyZW50RXZlbnRJZCkge1xuXHRcdFx0bGV0IGRlc2NzID0gY29tcGxldGlvbkRlc2NzQnlQYXJlbnQuZ2V0KGUucGFyZW50RXZlbnRJZCk7XG5cdFx0XHRpZiAoIWRlc2NzKSB7XG5cdFx0XHRcdGRlc2NzID0gW107XG5cdFx0XHRcdGNvbXBsZXRpb25EZXNjc0J5UGFyZW50LnNldChlLnBhcmVudEV2ZW50SWQsIGRlc2NzKTtcblx0XHRcdH1cblx0XHRcdGRlc2NzLnB1c2goZS5kZXNjcmlwdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0U3ViYWdlbnREZXNjcmlwdGlvbihldmVudDogSUNoYXREZWJ1Z0V2ZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoZXZlbnQua2luZCAhPT0gJ3N1YmFnZW50SW52b2NhdGlvbicgfHwgIWV2ZW50LnBhcmVudEV2ZW50SWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGRlc2NzID0gY29tcGxldGlvbkRlc2NzQnlQYXJlbnQuZ2V0KGV2ZW50LnBhcmVudEV2ZW50SWQpO1xuXHRcdGlmICghZGVzY3MgfHwgZGVzY3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZXZlbnQuZGVzY3JpcHRpb24gJiYgZXZlbnQuZGVzY3JpcHRpb24gIT09IGV2ZW50LmFnZW50TmFtZSA/IGV2ZW50LmRlc2NyaXB0aW9uIDogdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBpZHggPSBzdGFydGVkQ291bnRCeVBhcmVudC5nZXQoZXZlbnQucGFyZW50RXZlbnRJZCkgPz8gMDtcblx0XHRzdGFydGVkQ291bnRCeVBhcmVudC5zZXQoZXZlbnQucGFyZW50RXZlbnRJZCwgaWR4ICsgMSk7XG5cdFx0cmV0dXJuIGRlc2NzW2lkeF0gPz8gZGVzY3NbMF07XG5cdH1cblxuXHQvLyBGaWx0ZXIgb3V0IHN1YmFnZW50IGludm9jYXRpb24gY29tcGxldGlvbiBkdXBsaWNhdGVzIChldmVudHMgd2hvc2Vcblx0Ly8gYWdlbnROYW1lIG1hdGNoZXMgYSBrbm93biB0b29sIG5hbWUpLiBTdWJhZ2VudCB0b29sIGNhbGxzIGFyZSBrZXB0XG5cdC8vIGluIHRoZSB0cmVlIGZvciBjb3JyZWN0IHBhcmVudC1jaGlsZCBsaW5rYWdlOyB0aGV5IGFyZSBjb2xsYXBzZWRcblx0Ly8gaW50byB0aGVpciBzdWJhZ2VudCBjaGlsZCBpbiBhIHBvc3QtcHJvY2Vzc2luZyBzdGVwLlxuXHRjb25zdCBmaWx0ZXJlZCA9IGV2ZW50cy5maWx0ZXIoZSA9PiB7XG5cdFx0aWYgKGUua2luZCA9PT0gJ3N1YmFnZW50SW52b2NhdGlvbicgJiYgaXNTdWJhZ2VudE5hbWUoZS5hZ2VudE5hbWUpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9KTtcblxuXHRjb25zdCBpZFRvRXZlbnQgPSBuZXcgTWFwPHN0cmluZywgSUNoYXREZWJ1Z0V2ZW50PigpO1xuXHRjb25zdCBpZFRvQ2hpbGRyZW4gPSBuZXcgTWFwPHN0cmluZywgSUNoYXREZWJ1Z0V2ZW50W10+KCk7XG5cdGNvbnN0IHJvb3RzOiBJQ2hhdERlYnVnRXZlbnRbXSA9IFtdO1xuXG5cdGZvciAoY29uc3QgZXZlbnQgb2YgZmlsdGVyZWQpIHtcblx0XHRpZiAoZXZlbnQuaWQpIHtcblx0XHRcdGlkVG9FdmVudC5zZXQoZXZlbnQuaWQsIGV2ZW50KTtcblx0XHR9XG5cdH1cblxuXHRmb3IgKGNvbnN0IGV2ZW50IG9mIGZpbHRlcmVkKSB7XG5cdFx0aWYgKGV2ZW50LnBhcmVudEV2ZW50SWQgJiYgaWRUb0V2ZW50LmhhcyhldmVudC5wYXJlbnRFdmVudElkKSkge1xuXHRcdFx0bGV0IGNoaWxkcmVuID0gaWRUb0NoaWxkcmVuLmdldChldmVudC5wYXJlbnRFdmVudElkKTtcblx0XHRcdGlmICghY2hpbGRyZW4pIHtcblx0XHRcdFx0Y2hpbGRyZW4gPSBbXTtcblx0XHRcdFx0aWRUb0NoaWxkcmVuLnNldChldmVudC5wYXJlbnRFdmVudElkLCBjaGlsZHJlbik7XG5cdFx0XHR9XG5cdFx0XHRjaGlsZHJlbi5wdXNoKGV2ZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cm9vdHMucHVzaChldmVudCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gT3JkZXIgc2libGluZ3MgY2hyb25vbG9naWNhbGx5IHNvIHRoZSBmbG93IHJlYWRzIGluIGNhdXNhbCBvcmRlci4gRXZlbnRzXG5cdC8vIG1heSBhcnJpdmUgb3V0IG9mIG9yZGVyIFx1MjAxNCBtb3N0IG5vdGFibHkgQWdlbnQgSG9zdCBjdXN0b21pemF0aW9uL2Rpc2NvdmVyeVxuXHQvLyBldmVudHMsIHdoaWNoIGFyZSBzdXJmYWNlZCB3aXRoIGEgc2Vzc2lvbi1zdGFydCB0aW1lc3RhbXAgYnV0IGFwcGVuZGVkXG5cdC8vIGFmdGVyIHRoZSB0dXJucyBcdTIwMTQgc28gd2l0aG91dCB0aGlzIHRoZXkgd291bGQgcmVuZGVyIGFzIHRoZSBsYXN0IGJyYW5jaCBvZmZcblx0Ly8gdGhlIHNlc3Npb24tc3RhcnQgcm9vdCBpbnN0ZWFkIG9mIGF0IHRoZSBiZWdpbm5pbmcgd2hlcmUgdGhleSBiZWxvbmcuIFRoZVxuXHQvLyBzb3J0IGlzIHN0YWJsZSwgc28gZXZlbnRzIHNoYXJpbmcgYSB0aW1lc3RhbXAga2VlcCB0aGVpciBlbWl0dGVkIG9yZGVyLlxuXHRjb25zdCBieUNyZWF0ZWQgPSAoYTogSUNoYXREZWJ1Z0V2ZW50LCBiOiBJQ2hhdERlYnVnRXZlbnQpOiBudW1iZXIgPT4gYS5jcmVhdGVkLmdldFRpbWUoKSAtIGIuY3JlYXRlZC5nZXRUaW1lKCk7XG5cdHJvb3RzLnNvcnQoYnlDcmVhdGVkKTtcblx0Zm9yIChjb25zdCBjaGlsZHJlbiBvZiBpZFRvQ2hpbGRyZW4udmFsdWVzKCkpIHtcblx0XHRjaGlsZHJlbi5zb3J0KGJ5Q3JlYXRlZCk7XG5cdH1cblxuXHRmdW5jdGlvbiB0b0Zsb3dOb2RlKGV2ZW50OiBJQ2hhdERlYnVnRXZlbnQpOiBGbG93Tm9kZSB7XG5cdFx0Y29uc3QgY2hpbGRyZW4gPSBldmVudC5pZCA/IGlkVG9DaGlsZHJlbi5nZXQoZXZlbnQuaWQpIDogdW5kZWZpbmVkO1xuXG5cdFx0Ly8gUmVtYXAgZ2VuZXJpYyBldmVudHMgd2l0aCB3ZWxsLWtub3duIG5hbWVzIHRvIHRoZWlyIHByb3BlciBraW5kXG5cdFx0Ly8gc28gdGhleSBnZXQgY29ycmVjdCBzdHlsaW5nIGFuZCBzdWJsYWJlbCB0cmVhdG1lbnQuXG5cdFx0Y29uc3QgZWZmZWN0aXZlS2luZCA9IGdldEVmZmVjdGl2ZUtpbmQoZXZlbnQpO1xuXG5cdFx0Ly8gRm9yIHN1YmFnZW50IGludm9jYXRpb25zLCBlbnJpY2ggd2l0aCBkZXNjcmlwdGlvbiBmcm9tIHRoZVxuXHRcdC8vIGZpbHRlcmVkLW91dCBjb21wbGV0aW9uIHNpYmxpbmcsIG9yIGZhbGwgYmFjayB0byB0aGUgZXZlbnQncyBvd24gZmllbGQuXG5cdFx0bGV0IGxhYmVsID0gZ2V0RXZlbnRMYWJlbChldmVudCwgZWZmZWN0aXZlS2luZCk7XG5cdFx0Y29uc3Qgc3VibGFiZWwgPSBnZXRFdmVudFN1YmxhYmVsKGV2ZW50LCBlZmZlY3RpdmVLaW5kKTtcblx0XHRsZXQgdG9vbHRpcCA9IGdldEV2ZW50VG9vbHRpcChldmVudCk7XG5cdFx0bGV0IGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGVmZmVjdGl2ZUtpbmQgPT09ICdzdWJhZ2VudEludm9jYXRpb24nKSB7XG5cdFx0XHRkZXNjcmlwdGlvbiA9IGdldFN1YmFnZW50RGVzY3JpcHRpb24oZXZlbnQpO1xuXHRcdFx0Ly8gU3RyaXAgYW55IGV4aXN0aW5nIFwiU3ViYWdlbnQ6XCIgcHJlZml4IGZyb20gdGhlIGRlc2NyaXB0aW9uIHRvXG5cdFx0XHQvLyBhdm9pZCBkb3VibGUtcHJlZml4aW5nIChlLmcuIFwiU3ViYWdlbnQ6IFN1YmFnZW50OiBuYW1lXCIpLlxuXHRcdFx0Y29uc3QgY2xlYW5EZXNjID0gZGVzY3JpcHRpb24/LnJlcGxhY2UoL15TdWJhZ2VudDpcXHMqL2ksICcnKTtcblx0XHRcdC8vIFNob3cgXCJTdWJhZ2VudDogPGRlc2NyaXB0aW9uPlwiIGFzIHRoZSBsYWJlbCBzbyB1c2VycyBjYW4gaWRlbnRpZnlcblx0XHRcdC8vIHRoZXNlIG5vZGVzIGFuZCBzZWUgd2hhdCB0YXNrIHRoZXkgcGVyZm9ybS5cblx0XHRcdGxhYmVsID0gY2xlYW5EZXNjXG5cdFx0XHRcdD8gbG9jYWxpemUoJ3N1YmFnZW50V2l0aERlc2MnLCBcIlN1YmFnZW50OiB7MH1cIiwgdHJ1bmNhdGVMYWJlbChjbGVhbkRlc2MsIDMwKSlcblx0XHRcdFx0OiBsb2NhbGl6ZSgnc3ViYWdlbnRMYWJlbCcsIFwiU3ViYWdlbnRcIik7XG5cdFx0XHRpZiAoZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0Ly8gRW5zdXJlIGRlc2NyaXB0aW9uIGFwcGVhcnMgaW4gdG9vbHRpcCBpZiBub3QgYWxyZWFkeSBwcmVzZW50XG5cdFx0XHRcdGlmICh0b29sdGlwICYmICF0b29sdGlwLmluY2x1ZGVzKGRlc2NyaXB0aW9uKSkge1xuXHRcdFx0XHRcdGNvbnN0IGxpbmVzID0gdG9vbHRpcC5zcGxpdCgnXFxuJyk7XG5cdFx0XHRcdFx0bGluZXMuc3BsaWNlKDEsIDAsIGRlc2NyaXB0aW9uKTtcblx0XHRcdFx0XHR0b29sdGlwID0gbGluZXMuam9pbignXFxuJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IGV2ZW50LmlkID8/IGBldmVudC0ke2V2ZW50cy5pbmRleE9mKGV2ZW50KX1gLFxuXHRcdFx0a2luZDogZWZmZWN0aXZlS2luZCxcblx0XHRcdGNhdGVnb3J5OiBldmVudC5raW5kID09PSAnZ2VuZXJpYycgPyBldmVudC5jYXRlZ29yeSA6IHVuZGVmaW5lZCxcblx0XHRcdGxhYmVsLFxuXHRcdFx0c3VibGFiZWwsXG5cdFx0XHRkZXNjcmlwdGlvbixcblx0XHRcdHRvb2x0aXAsXG5cdFx0XHRpc0Vycm9yOiBpc0Vycm9yRXZlbnQoZXZlbnQpLFxuXHRcdFx0Y3JlYXRlZDogZXZlbnQuY3JlYXRlZC5nZXRUaW1lKCksXG5cdFx0XHRjaGlsZHJlbjogY2hpbGRyZW4/Lm1hcCh0b0Zsb3dOb2RlKSA/PyBbXSxcblx0XHR9O1xuXHR9XG5cblx0Y29uc3QgcmF3Tm9kZXMgPSByb290cy5tYXAodG9GbG93Tm9kZSk7XG5cblx0Ly8gUG9zdC1wcm9jZXNzOiBjb2xsYXBzZSBzdWJhZ2VudCB0b29sIGNhbGwgbm9kZXMgaW50byB0aGVpclxuXHQvLyBzdWJhZ2VudCBjaGlsZCwgYW5kIGZsYXR0ZW4gY2hpbGRfc2Vzc2lvbl9yZWYgcGxhY2Vob2xkZXIgbm9kZXMuXG5cdC8vIFRoaXMgcHJlc2VydmVzIHRoZSBjb3JyZWN0IHBhcmVudC1jaGlsZCBoaWVyYXJjaHkgdGhhdCB3b3VsZFxuXHQvLyBvdGhlcndpc2UgYnJlYWsgd2hlbiBmaWx0ZXJpbmcgZXZlbnRzIGJlZm9yZSB0cmVlIGNvbnN0cnVjdGlvbi5cblx0cmV0dXJuIGNvbGxhcHNlU3ViYWdlbnRUb29sQ2FsbHMocmF3Tm9kZXMpO1xuXG5cdGZ1bmN0aW9uIGNvbGxhcHNlU3ViYWdlbnRUb29sQ2FsbHMobm9kZUxpc3Q6IEZsb3dOb2RlW10pOiBGbG93Tm9kZVtdIHtcblx0XHRsZXQgY2hhbmdlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHJlc3VsdDogRmxvd05vZGVbXSA9IFtdO1xuXHRcdGZvciAoY29uc3Qgbm9kZSBvZiBub2RlTGlzdCkge1xuXHRcdFx0aWYgKG5vZGUua2luZCA9PT0gJ3Rvb2xDYWxsJyAmJiBpc1N1YmFnZW50TmFtZShzdHJpcFRvb2xFbW9qaShub2RlLmxhYmVsKSkpIHtcblx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdC8vIEZsYXR0ZW4gYW55IGNoaWxkX3Nlc3Npb25fcmVmIGludGVybWVkaWFyaWVzIGZpcnN0IHNvXG5cdFx0XHRcdC8vIHRoZSBzdWJhZ2VudEludm9jYXRpb24gYmVjb21lcyBhIGRpcmVjdCBjaGlsZC5cblx0XHRcdFx0Y29uc3QgZmxhdENoaWxkcmVuID0gZmxhdHRlbkNoaWxkU2Vzc2lvblJlZnMobm9kZS5jaGlsZHJlbik7XG5cdFx0XHRcdGNvbnN0IHN1YmFnZW50Q2hpbGRyZW4gPSBmbGF0Q2hpbGRyZW4uZmlsdGVyKGMgPT4gYy5raW5kID09PSAnc3ViYWdlbnRJbnZvY2F0aW9uJyk7XG5cdFx0XHRcdGlmIChzdWJhZ2VudENoaWxkcmVuLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBvdGhlckNoaWxkcmVuID0gZmxhdENoaWxkcmVuLmZpbHRlcihjID0+IGMua2luZCAhPT0gJ3N1YmFnZW50SW52b2NhdGlvbicpO1xuXHRcdFx0XHRcdC8vIEVhY2ggc3ViYWdlbnQgY2hpbGQgZ2V0cyBpdHMgb3duIGNoaWxkcmVuOyBub24tc3ViYWdlbnRcblx0XHRcdFx0XHQvLyBzaWJsaW5ncyAod2hpY2ggYXJlIHJhcmUpIGFyZSBhZGRlZCB0byB0aGUgZmlyc3Qgc3ViYWdlbnQuXG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzdWJhZ2VudENoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBleHRyYSA9IGkgPT09IDAgPyBvdGhlckNoaWxkcmVuIDogW107XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0XHRcdC4uLnN1YmFnZW50Q2hpbGRyZW5baV0sXG5cdFx0XHRcdFx0XHRcdGNoaWxkcmVuOiBjb2xsYXBzZVN1YmFnZW50VG9vbENhbGxzKFxuXHRcdFx0XHRcdFx0XHRcdFsuLi5zdWJhZ2VudENoaWxkcmVuW2ldLmNoaWxkcmVuLCAuLi5leHRyYV1cblx0XHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBObyBzdWJhZ2VudCBjaGlsZCBcdTIwMTQgcHJvbW90ZSBjaGlsZHJlbiBkaXJlY3RseVxuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKC4uLmNvbGxhcHNlU3ViYWdlbnRUb29sQ2FsbHMoZmxhdENoaWxkcmVuKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IG5ld0NoaWxkcmVuID0gY29sbGFwc2VTdWJhZ2VudFRvb2xDYWxscyhub2RlLmNoaWxkcmVuKTtcblx0XHRcdFx0aWYgKG5ld0NoaWxkcmVuICE9PSBub2RlLmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goeyAuLi5ub2RlLCBjaGlsZHJlbjogbmV3Q2hpbGRyZW4gfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2gobm9kZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGNoYW5nZWQgPyByZXN1bHQgOiBub2RlTGlzdDtcblx0fVxuXG5cdGZ1bmN0aW9uIGZsYXR0ZW5DaGlsZFNlc3Npb25SZWZzKG5vZGVMaXN0OiBGbG93Tm9kZVtdKTogRmxvd05vZGVbXSB7XG5cdFx0aWYgKCFub2RlTGlzdC5zb21lKG4gPT4gbi5raW5kID09PSAnZ2VuZXJpYycgJiYgbi5jYXRlZ29yeSA9PT0gJ3N1YmFnZW50JykpIHtcblx0XHRcdHJldHVybiBub2RlTGlzdDsgLy8gZmFzdCBwYXRoOiBub3RoaW5nIHRvIGZsYXR0ZW5cblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiBGbG93Tm9kZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBub2RlIG9mIG5vZGVMaXN0KSB7XG5cdFx0XHRpZiAobm9kZS5raW5kID09PSAnZ2VuZXJpYycgJiYgbm9kZS5jYXRlZ29yeSA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0XHQvLyBjaGlsZF9zZXNzaW9uX3JlZiBwbGFjZWhvbGRlciBcdTIwMTQgZmluZCB0aGUgc3ViYWdlbnRJbnZvY2F0aW9uXG5cdFx0XHRcdC8vIGFuZCBtb3ZlIGFsbCBzaWJsaW5ncyBpbnRvIGl0IGFzIGNoaWxkcmVuLlxuXHRcdFx0XHRjb25zdCBzdWJhZ2VudENoaWxkID0gbm9kZS5jaGlsZHJlbi5maW5kKGMgPT4gYy5raW5kID09PSAnc3ViYWdlbnRJbnZvY2F0aW9uJyk7XG5cdFx0XHRcdGlmIChzdWJhZ2VudENoaWxkKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2libGluZ3MgPSBub2RlLmNoaWxkcmVuLmZpbHRlcihjID0+IGMgIT09IHN1YmFnZW50Q2hpbGQpO1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRcdC4uLnN1YmFnZW50Q2hpbGQsXG5cdFx0XHRcdFx0XHRjaGlsZHJlbjogWy4uLnN1YmFnZW50Q2hpbGQuY2hpbGRyZW4sIC4uLnNpYmxpbmdzXSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBObyBzdWJhZ2VudCBjaGlsZCBcdTIwMTQgcHJvbW90ZSBhbGwgY2hpbGRyZW5cblx0XHRcdFx0XHRyZXN1bHQucHVzaCguLi5ub2RlLmNoaWxkcmVuKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0LnB1c2gobm9kZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuLy8gLS0tLSBGbG93IG5vZGUgZmlsdGVyaW5nIC0tLS1cblxuLyoqXG4gKiBGaWx0ZXJzIGEgZmxvdyBub2RlIHRyZWUgYnkga2luZCB2aXNpYmlsaXR5IGFuZCB0ZXh0IHNlYXJjaC5cbiAqIFJldHVybnMgYSBuZXcgdHJlZSBcdTIwMTQgdGhlIGlucHV0IGlzIG5vdCBtdXRhdGVkLlxuICpcbiAqIEtpbmQgZmlsdGVyaW5nOiBub2RlcyB3aG9zZSBraW5kIGlzIG5vdCB2aXNpYmxlIGFyZSByZW1vdmVkLlxuICogRm9yIGBzdWJhZ2VudEludm9jYXRpb25gIG5vZGVzLCB0aGUgZW50aXJlIHN1YmdyYXBoIGlzIHJlbW92ZWQuXG4gKiBGb3Igb3RoZXIga2luZHMsIHRoZSBub2RlIGlzIHJlbW92ZWQgYW5kIGl0cyBjaGlsZHJlbiBhcmUgcmUtcGFyZW50ZWQuXG4gKlxuICogVGV4dCBmaWx0ZXJpbmc6IG9ubHkgbm9kZXMgd2hvc2UgbGFiZWwsIHN1YmxhYmVsLCBvciB0b29sdGlwIG1hdGNoIHRoZVxuICogc2VhcmNoIHRlcm0gYXJlIGtlcHQsIGFsb25nIHdpdGggYWxsIHRoZWlyIGFuY2VzdG9ycyAocGF0aCB0byByb290KS5cbiAqIElmIGEgc3ViYWdlbnQgbGFiZWwgbWF0Y2hlcywgaXRzIGVudGlyZSBzdWJncmFwaCBpcyBrZXB0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gZmlsdGVyRmxvd05vZGVzKG5vZGVzOiBGbG93Tm9kZVtdLCBvcHRpb25zOiBGbG93RmlsdGVyT3B0aW9ucyk6IEZsb3dOb2RlW10ge1xuXHRsZXQgcmVzdWx0ID0gZmlsdGVyQnlLaW5kKG5vZGVzLCBvcHRpb25zLmlzS2luZFZpc2libGUpO1xuXHRpZiAob3B0aW9ucy50ZXh0RmlsdGVyKSB7XG5cdFx0cmVzdWx0ID0gZmlsdGVyQnlUZXh0KHJlc3VsdCwgb3B0aW9ucy50ZXh0RmlsdGVyKTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBmaWx0ZXJCeUtpbmQobm9kZXM6IEZsb3dOb2RlW10sIGlzS2luZFZpc2libGU6IChraW5kOiBzdHJpbmcsIGNhdGVnb3J5Pzogc3RyaW5nKSA9PiBib29sZWFuKTogRmxvd05vZGVbXSB7XG5cdGNvbnN0IHJlc3VsdDogRmxvd05vZGVbXSA9IFtdO1xuXHRsZXQgY2hhbmdlZCA9IGZhbHNlO1xuXHRmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHtcblx0XHRpZiAoIWlzS2luZFZpc2libGUobm9kZS5raW5kLCBub2RlLmNhdGVnb3J5KSkge1xuXHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHQvLyBGb3Igc3ViYWdlbnRzLCBkcm9wIHRoZSBlbnRpcmUgc3ViZ3JhcGhcblx0XHRcdGlmIChub2RlLmtpbmQgPT09ICdzdWJhZ2VudEludm9jYXRpb24nKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRm9yIG90aGVyIGtpbmRzLCByZS1wYXJlbnQgY2hpbGRyZW4gdXBcblx0XHRcdHJlc3VsdC5wdXNoKC4uLmZpbHRlckJ5S2luZChub2RlLmNoaWxkcmVuLCBpc0tpbmRWaXNpYmxlKSk7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgZmlsdGVyZWRDaGlsZHJlbiA9IGZpbHRlckJ5S2luZChub2RlLmNoaWxkcmVuLCBpc0tpbmRWaXNpYmxlKTtcblx0XHRpZiAoZmlsdGVyZWRDaGlsZHJlbiAhPT0gbm9kZS5jaGlsZHJlbikge1xuXHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRyZXN1bHQucHVzaCh7IC4uLm5vZGUsIGNoaWxkcmVuOiBmaWx0ZXJlZENoaWxkcmVuIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXN1bHQucHVzaChub2RlKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGNoYW5nZWQgPyByZXN1bHQgOiBub2Rlcztcbn1cblxuXG5mdW5jdGlvbiBub2RlTWF0Y2hlc1RleHQobm9kZTogRmxvd05vZGUsIHRleHQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gbm9kZS5sYWJlbC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHRleHQpIHx8XG5cdFx0KG5vZGUuc3VibGFiZWw/LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXModGV4dCkgPz8gZmFsc2UpIHx8XG5cdFx0KG5vZGUudG9vbHRpcD8udG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh0ZXh0KSA/PyBmYWxzZSk7XG59XG5cbmZ1bmN0aW9uIGZpbHRlckJ5VGV4dChub2RlczogRmxvd05vZGVbXSwgdGV4dDogc3RyaW5nKTogRmxvd05vZGVbXSB7XG5cdGNvbnN0IHJlc3VsdDogRmxvd05vZGVbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHtcblx0XHRpZiAobm9kZU1hdGNoZXNUZXh0KG5vZGUsIHRleHQpKSB7XG5cdFx0XHQvLyBOb2RlIG1hdGNoZXMgXHUyMDE0IGtlZXAgaXQgd2l0aCBhbGwgZGVzY2VuZGFudHNcblx0XHRcdHJlc3VsdC5wdXNoKG5vZGUpO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdC8vIENoZWNrIGlmIGFueSBkZXNjZW5kYW50IG1hdGNoZXNcblx0XHRjb25zdCBmaWx0ZXJlZENoaWxkcmVuID0gZmlsdGVyQnlUZXh0KG5vZGUuY2hpbGRyZW4sIHRleHQpO1xuXHRcdGlmIChmaWx0ZXJlZENoaWxkcmVuLmxlbmd0aCA+IDApIHtcblx0XHRcdC8vIEtlZXAgdGhpcyBub2RlIGFzIGFuIGFuY2VzdG9yIG9mIG1hdGNoaW5nIGRlc2NlbmRhbnRzXG5cdFx0XHRyZXN1bHQucHVzaCh7IC4uLm5vZGUsIGNoaWxkcmVuOiBmaWx0ZXJlZENoaWxkcmVuIH0pO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vLyAtLS0tIE5vZGUgc2xpY2luZyAocGFnaW5hdGlvbikgLS0tLVxuXG5leHBvcnQgaW50ZXJmYWNlIEZsb3dTbGljZVJlc3VsdCB7XG5cdHJlYWRvbmx5IG5vZGVzOiBGbG93Tm9kZVtdO1xuXHRyZWFkb25seSB0b3RhbENvdW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IHNob3duQ291bnQ6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBDb3VudHMgdGhlIHRvdGFsIG51bWJlciBvZiBub2RlcyBpbiBhIHRyZWUgKGVhY2ggbm9kZSArIGFsbCBkZXNjZW5kYW50cykuXG4gKi9cbmZ1bmN0aW9uIGNvdW50Tm9kZXMobm9kZXM6IHJlYWRvbmx5IEZsb3dOb2RlW10pOiBudW1iZXIge1xuXHRsZXQgY291bnQgPSAwO1xuXHRmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHtcblx0XHRjb3VudCArPSAxICsgY291bnROb2Rlcyhub2RlLmNoaWxkcmVuKTtcblx0fVxuXHRyZXR1cm4gY291bnQ7XG59XG5cbi8qKlxuICogU2xpY2VzIGEgZmxvdyBub2RlIHRyZWUgdG8gYXQgbW9zdCBgbWF4Q291bnRgIG5vZGVzIChwcmUtb3JkZXIgREZTKS5cbiAqXG4gKiBXaGVuIGEgc3ViYWdlbnQncyBjaGlsZHJlbiB3b3VsZCBleGNlZWQgdGhlIHJlbWFpbmluZyBidWRnZXQsIHRoZVxuICogY2hpbGRyZW4gbGlzdCBpcyB0cnVuY2F0ZWQuIFJldHVybnMgdGhlIHNsaWNlZCB0cmVlIGFsb25nIHdpdGggdG90YWxcbiAqIGFuZCBzaG93biBub2RlIGNvdW50cyBmb3IgdGhlIFwiU2hvdyBNb3JlXCIgVUkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzbGljZUZsb3dOb2Rlcyhub2RlczogcmVhZG9ubHkgRmxvd05vZGVbXSwgbWF4Q291bnQ6IG51bWJlcik6IEZsb3dTbGljZVJlc3VsdCB7XG5cdGNvbnN0IHRvdGFsQ291bnQgPSBjb3VudE5vZGVzKG5vZGVzKTtcblx0aWYgKHRvdGFsQ291bnQgPD0gbWF4Q291bnQpIHtcblx0XHRyZXR1cm4geyBub2Rlczogbm9kZXMgYXMgRmxvd05vZGVbXSwgdG90YWxDb3VudCwgc2hvd25Db3VudDogdG90YWxDb3VudCB9O1xuXHR9XG5cblx0bGV0IHJlbWFpbmluZyA9IG1heENvdW50O1xuXG5cdGZ1bmN0aW9uIHNsaWNlVHJlZShub2RlTGlzdDogcmVhZG9ubHkgRmxvd05vZGVbXSk6IEZsb3dOb2RlW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogRmxvd05vZGVbXSA9IFtdO1xuXHRcdGZvciAoY29uc3Qgbm9kZSBvZiBub2RlTGlzdCkge1xuXHRcdFx0aWYgKHJlbWFpbmluZyA8PSAwKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0cmVtYWluaW5nLS07IC8vIGNvdW50IHRoaXMgbm9kZVxuXHRcdFx0aWYgKG5vZGUuY2hpbGRyZW4ubGVuZ3RoID09PSAwIHx8IHJlbWFpbmluZyA8PSAwKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG5vZGUuY2hpbGRyZW4ubGVuZ3RoID09PSAwID8gbm9kZSA6IHsgLi4ubm9kZSwgY2hpbGRyZW46IFtdIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3Qgc2xpY2VkQ2hpbGRyZW4gPSBzbGljZVRyZWUobm9kZS5jaGlsZHJlbik7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHNsaWNlZENoaWxkcmVuICE9PSBub2RlLmNoaWxkcmVuID8geyAuLi5ub2RlLCBjaGlsZHJlbjogc2xpY2VkQ2hpbGRyZW4gfSA6IG5vZGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Y29uc3Qgc2xpY2VkID0gc2xpY2VUcmVlKG5vZGVzKTtcblx0Y29uc3Qgc2hvd25Db3VudCA9IG1heENvdW50IC0gcmVtYWluaW5nO1xuXHRyZXR1cm4geyBub2Rlczogc2xpY2VkLCB0b3RhbENvdW50LCBzaG93bkNvdW50IH07XG59XG5cbi8vIC0tLS0gRGlzY292ZXJ5IG5vZGUgbWVyZ2luZyAtLS0tXG5cbmZ1bmN0aW9uIGlzRGlzY292ZXJ5Tm9kZShub2RlOiBGbG93Tm9kZSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gbm9kZS5raW5kID09PSAnZ2VuZXJpYycgJiYgbm9kZS5jYXRlZ29yeSA9PT0gJ2Rpc2NvdmVyeSc7XG59XG5cbi8qKlxuICogTWVyZ2VzIGNvbnNlY3V0aXZlIHByb21wdC1kaXNjb3Zlcnkgbm9kZXMgKGdlbmVyaWMgZXZlbnRzIHdpdGhcbiAqIGBjYXRlZ29yeSA9PT0gJ2Rpc2NvdmVyeSdgKSBpbnRvIGEgc2luZ2xlIHN1bW1hcnkgbm9kZS5cbiAqXG4gKiBUaGUgbWVyZ2VkIG5vZGUgYWx3YXlzIHN0YXlzIGluIHRoZSBncmFwaCBhbmQgY2FycmllcyB0aGUgaW5kaXZpZHVhbFxuICogbm9kZXMgaW4gYG1lcmdlZE5vZGVzYC4gIEV4cGFuc2lvbiAoc2hvd2luZyB0aGUgaW5kaXZpZHVhbCBub2RlcyB0byB0aGVcbiAqIHJpZ2h0KSBpcyBoYW5kbGVkIGF0IHRoZSBsYXlvdXQgbGV2ZWwuXG4gKlxuICogT3BlcmF0ZXMgcmVjdXJzaXZlbHkgb24gY2hpbGRyZW4uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZURpc2NvdmVyeU5vZGVzKFxuXHRub2RlczogcmVhZG9ubHkgRmxvd05vZGVbXSxcbik6IEZsb3dOb2RlW10ge1xuXHRjb25zdCByZXN1bHQ6IEZsb3dOb2RlW10gPSBbXTtcblxuXHRsZXQgaSA9IDA7XG5cdHdoaWxlIChpIDwgbm9kZXMubGVuZ3RoKSB7XG5cdFx0Y29uc3Qgbm9kZSA9IG5vZGVzW2ldO1xuXG5cdFx0Ly8gTm9uLWRpc2NvdmVyeSBub2RlOiByZWN1cnNlIGludG8gY2hpbGRyZW4gYW5kIHBhc3MgdGhyb3VnaC5cblx0XHRpZiAoIWlzRGlzY292ZXJ5Tm9kZShub2RlKSkge1xuXHRcdFx0Y29uc3QgbWVyZ2VkQ2hpbGRyZW4gPSBtZXJnZURpc2NvdmVyeU5vZGVzKG5vZGUuY2hpbGRyZW4pO1xuXHRcdFx0cmVzdWx0LnB1c2gobWVyZ2VkQ2hpbGRyZW4gIT09IG5vZGUuY2hpbGRyZW4gPyB7IC4uLm5vZGUsIGNoaWxkcmVuOiBtZXJnZWRDaGlsZHJlbiB9IDogbm9kZSk7XG5cdFx0XHRpKys7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHQvLyBBY2N1bXVsYXRlIGEgcnVuIG9mIGNvbnNlY3V0aXZlIGRpc2NvdmVyeSBub2Rlcy5cblx0XHRjb25zdCBydW46IEZsb3dOb2RlW10gPSBbbm9kZV07XG5cdFx0bGV0IGogPSBpICsgMTtcblx0XHR3aGlsZSAoaiA8IG5vZGVzLmxlbmd0aCAmJiBpc0Rpc2NvdmVyeU5vZGUobm9kZXNbal0pKSB7XG5cdFx0XHRydW4ucHVzaChub2Rlc1tqXSk7XG5cdFx0XHRqKys7XG5cdFx0fVxuXG5cdFx0aWYgKHJ1bi5sZW5ndGggPCAyKSB7XG5cdFx0XHQvLyBTaW5nbGUgZGlzY292ZXJ5IG5vZGUgXHUyMDE0IG5vdGhpbmcgdG8gbWVyZ2UuXG5cdFx0XHRyZXN1bHQucHVzaChub2RlKTtcblx0XHRcdGkgPSBqO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Ly8gQnVpbGQgYSBzdGFibGUgaWQgZnJvbSB0aGUgZmlyc3Qgbm9kZSBzbyB0aGUgZXhwYW5kIHN0YXRlIHBlcnNpc3RzLlxuXHRcdGNvbnN0IG1lcmdlZElkID0gYG1lcmdlZC1kaXNjb3Zlcnk6JHtydW5bMF0uaWR9YDtcblxuXHRcdC8vIEJ1aWxkIGEgbWVyZ2VkIHN1bW1hcnkgbm9kZS5cblx0XHRjb25zdCBsYWJlbHMgPSBydW4ubWFwKG4gPT4gbi5sYWJlbCk7XG5cdFx0Y29uc3QgdW5pcXVlTGFiZWxzID0gWy4uLm5ldyBTZXQobGFiZWxzKV07XG5cdFx0Y29uc3Qgc3VtbWFyeUxhYmVsID0gdW5pcXVlTGFiZWxzLmxlbmd0aCA8PSAyXG5cdFx0XHQ/IHVuaXF1ZUxhYmVscy5qb2luKCcsICcpXG5cdFx0XHQ6IGxvY2FsaXplKCdkaXNjb3ZlcnlNZXJnZWRMYWJlbCcsIFwiezB9ICt7MX0gbW9yZVwiLCB1bmlxdWVMYWJlbHNbMF0sIHJ1bi5sZW5ndGggLSAxKTtcblxuXHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdGlkOiBtZXJnZWRJZCxcblx0XHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRcdGNhdGVnb3J5OiAnZGlzY292ZXJ5Jyxcblx0XHRcdGxhYmVsOiBzdW1tYXJ5TGFiZWwsXG5cdFx0XHRzdWJsYWJlbDogbG9jYWxpemUoJ2Rpc2NvdmVyeVN0ZXBzQ291bnQnLCBcInswfSBkaXNjb3Zlcnkgc3RlcHNcIiwgcnVuLmxlbmd0aCksXG5cdFx0XHR0b29sdGlwOiBydW4ubWFwKG4gPT4gbi5sYWJlbCArIChuLnN1YmxhYmVsID8gYDogJHtuLnN1YmxhYmVsfWAgOiAnJykpLmpvaW4oJ1xcbicpLFxuXHRcdFx0Y3JlYXRlZDogcnVuWzBdLmNyZWF0ZWQsXG5cdFx0XHRjaGlsZHJlbjogW10sXG5cdFx0XHRtZXJnZWROb2RlczogcnVuLFxuXHRcdH0pO1xuXHRcdGkgPSBqO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLy8gLS0tLSBUb29sIGNhbGwgbm9kZSBtZXJnaW5nIC0tLS1cblxuZnVuY3Rpb24gaXNUb29sQ2FsbE5vZGUobm9kZTogRmxvd05vZGUpOiBib29sZWFuIHtcblx0cmV0dXJuIG5vZGUua2luZCA9PT0gJ3Rvb2xDYWxsJztcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSB0b29sIG5hbWUgZnJvbSBhIHRvb2wtY2FsbCBub2RlJ3MgbGFiZWwuXG4gKiBUb29sIGNhbGwgbGFiZWxzIGFyZSBzZXQgdG8gYGV2ZW50LnRvb2xOYW1lYCAocG9zc2libHkgd2l0aCBhIGxlYWRpbmdcbiAqIGVtb2ppIHByZWZpeCBzdHJpcHBlZCksIHNvIHRoZSBsYWJlbCBpdHNlbGYgaXMgdGhlIGNhbm9uaWNhbCB0b29sIG5hbWUuXG4gKi9cbmZ1bmN0aW9uIGdldFRvb2xOYW1lKG5vZGU6IEZsb3dOb2RlKTogc3RyaW5nIHtcblx0cmV0dXJuIG5vZGUubGFiZWw7XG59XG5cbi8qKlxuICogTWVyZ2VzIGNvbnNlY3V0aXZlIHRvb2wtY2FsbCBub2RlcyB0aGF0IGludm9rZSB0aGUgc2FtZSB0b29sIGludG8gYVxuICogc2luZ2xlIHN1bW1hcnkgbm9kZS5cbiAqXG4gKiBUaGlzIG1pcnJvcnMgYG1lcmdlRGlzY292ZXJ5Tm9kZXNgOiB0aGUgbWVyZ2VkIG5vZGUgY2FycmllcyB0aGVcbiAqIGluZGl2aWR1YWwgbm9kZXMgaW4gYG1lcmdlZE5vZGVzYCBhbmQgZXhwYW5zaW9uIGlzIGhhbmRsZWQgYXQgdGhlXG4gKiBsYXlvdXQgbGV2ZWwuXG4gKlxuICogT3BlcmF0ZXMgcmVjdXJzaXZlbHkgb24gY2hpbGRyZW4uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZVRvb2xDYWxsTm9kZXMoXG5cdG5vZGVzOiByZWFkb25seSBGbG93Tm9kZVtdLFxuKTogRmxvd05vZGVbXSB7XG5cdGNvbnN0IHJlc3VsdDogRmxvd05vZGVbXSA9IFtdO1xuXG5cdGxldCBpID0gMDtcblx0d2hpbGUgKGkgPCBub2Rlcy5sZW5ndGgpIHtcblx0XHRjb25zdCBub2RlID0gbm9kZXNbaV07XG5cblx0XHQvLyBOb24tdG9vbC1jYWxsIG5vZGU6IHJlY3Vyc2UgaW50byBjaGlsZHJlbiBhbmQgcGFzcyB0aHJvdWdoLlxuXHRcdGlmICghaXNUb29sQ2FsbE5vZGUobm9kZSkpIHtcblx0XHRcdGNvbnN0IG1lcmdlZENoaWxkcmVuID0gbWVyZ2VUb29sQ2FsbE5vZGVzKG5vZGUuY2hpbGRyZW4pO1xuXHRcdFx0cmVzdWx0LnB1c2gobWVyZ2VkQ2hpbGRyZW4gIT09IG5vZGUuY2hpbGRyZW4gPyB7IC4uLm5vZGUsIGNoaWxkcmVuOiBtZXJnZWRDaGlsZHJlbiB9IDogbm9kZSk7XG5cdFx0XHRpKys7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHQvLyBBY2N1bXVsYXRlIGEgcnVuIG9mIGNvbnNlY3V0aXZlIHRvb2wtY2FsbCBub2RlcyB3aXRoIHRoZSBzYW1lIHRvb2wgbmFtZS5cblx0XHRjb25zdCB0b29sTmFtZSA9IGdldFRvb2xOYW1lKG5vZGUpO1xuXHRcdGNvbnN0IHJ1bjogRmxvd05vZGVbXSA9IFtub2RlXTtcblx0XHRsZXQgaiA9IGkgKyAxO1xuXHRcdHdoaWxlIChqIDwgbm9kZXMubGVuZ3RoICYmIGlzVG9vbENhbGxOb2RlKG5vZGVzW2pdKSAmJiBnZXRUb29sTmFtZShub2Rlc1tqXSkgPT09IHRvb2xOYW1lKSB7XG5cdFx0XHRydW4ucHVzaChub2Rlc1tqXSk7XG5cdFx0XHRqKys7XG5cdFx0fVxuXG5cdFx0aWYgKHJ1bi5sZW5ndGggPCAyKSB7XG5cdFx0XHQvLyBTaW5nbGUgdG9vbCBjYWxsIFx1MjAxNCByZWN1cnNlIGludG8gY2hpbGRyZW4sIG5vdGhpbmcgdG8gbWVyZ2UuXG5cdFx0XHRjb25zdCBtZXJnZWRDaGlsZHJlbiA9IG1lcmdlVG9vbENhbGxOb2Rlcyhub2RlLmNoaWxkcmVuKTtcblx0XHRcdHJlc3VsdC5wdXNoKG1lcmdlZENoaWxkcmVuICE9PSBub2RlLmNoaWxkcmVuID8geyAuLi5ub2RlLCBjaGlsZHJlbjogbWVyZ2VkQ2hpbGRyZW4gfSA6IG5vZGUpO1xuXHRcdFx0aSA9IGo7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHQvLyBCdWlsZCBhIHN0YWJsZSBpZCBmcm9tIHRoZSBmaXJzdCBub2RlIHNvIHRoZSBleHBhbmQgc3RhdGUgcGVyc2lzdHMuXG5cdFx0Y29uc3QgbWVyZ2VkSWQgPSBgbWVyZ2VkLXRvb2xDYWxsOiR7cnVuWzBdLmlkfWA7XG5cblx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRpZDogbWVyZ2VkSWQsXG5cdFx0XHRraW5kOiAndG9vbENhbGwnLFxuXHRcdFx0bGFiZWw6IHRvb2xOYW1lLFxuXHRcdFx0c3VibGFiZWw6IGxvY2FsaXplKCd0b29sQ2FsbHNDb3VudCcsIFwiezB9IGNhbGxzXCIsIHJ1bi5sZW5ndGgpLFxuXHRcdFx0dG9vbHRpcDogcnVuLm1hcChuID0+IG4ubGFiZWwgKyAobi5zdWJsYWJlbCA/IGA6ICR7bi5zdWJsYWJlbH1gIDogJycpKS5qb2luKCdcXG4nKSxcblx0XHRcdGNyZWF0ZWQ6IHJ1blswXS5jcmVhdGVkLFxuXHRcdFx0Y2hpbGRyZW46IFtdLFxuXHRcdFx0bWVyZ2VkTm9kZXM6IHJ1bixcblx0XHR9KTtcblx0XHRpID0gajtcblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8vIC0tLS0gRXZlbnQgaGVscGVycyAtLS0tXG5cbi8qKlxuICogUmVtYXBzIGdlbmVyaWMgZXZlbnRzIHdpdGggd2VsbC1rbm93biBuYW1lcyAoZS5nLiBcIlVzZXIgbWVzc2FnZVwiLFxuICogXCJBZ2VudCByZXNwb25zZVwiKSB0byB0aGVpciBwcm9wZXIgdHlwZWQga2luZCBzbyB0aGV5IHJlY2VpdmVcbiAqIGNvcnJlY3QgY29sb3JzLCBsYWJlbHMsIGFuZCBzdWJsYWJlbCB0cmVhdG1lbnQgaW4gdGhlIGZsb3cgY2hhcnQuXG4gKi9cbmZ1bmN0aW9uIGdldEVmZmVjdGl2ZUtpbmQoZXZlbnQ6IElDaGF0RGVidWdFdmVudCk6IElDaGF0RGVidWdFdmVudFsna2luZCddIHtcblx0aWYgKGV2ZW50LmtpbmQgPT09ICdnZW5lcmljJykge1xuXHRcdGNvbnN0IG5hbWUgPSBldmVudC5uYW1lLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvW1xcc18tXSsvZywgJycpO1xuXHRcdGlmIChuYW1lID09PSAndXNlcm1lc3NhZ2UnIHx8IG5hbWUgPT09ICd1c2VycHJvbXB0JyB8fCBuYW1lID09PSAndXNlcicgfHwgbmFtZS5zdGFydHNXaXRoKCd1c2VybWVzc2FnZScpKSB7XG5cdFx0XHRyZXR1cm4gJ3VzZXJNZXNzYWdlJztcblx0XHR9XG5cdFx0aWYgKG5hbWUgPT09ICdyZXNwb25zZScgfHwgbmFtZS5zdGFydHNXaXRoKCdhZ2VudHJlc3BvbnNlJykgfHwgbmFtZS5zdGFydHNXaXRoKCdhc3Npc3RhbnRyZXNwb25zZScpIHx8IG5hbWUuc3RhcnRzV2l0aCgnbW9kZWxyZXNwb25zZScpKSB7XG5cdFx0XHRyZXR1cm4gJ2FnZW50UmVzcG9uc2UnO1xuXHRcdH1cblx0XHRjb25zdCBjYXQgPSBldmVudC5jYXRlZ29yeT8udG9Mb3dlckNhc2UoKTtcblx0XHRpZiAoY2F0ID09PSAndXNlcicgfHwgY2F0ID09PSAndXNlcm1lc3NhZ2UnKSB7XG5cdFx0XHRyZXR1cm4gJ3VzZXJNZXNzYWdlJztcblx0XHR9XG5cdFx0aWYgKGNhdCA9PT0gJ3Jlc3BvbnNlJyB8fCBjYXQgPT09ICdhZ2VudHJlc3BvbnNlJykge1xuXHRcdFx0cmV0dXJuICdhZ2VudFJlc3BvbnNlJztcblx0XHR9XG5cdH1cblx0cmV0dXJuIGV2ZW50LmtpbmQ7XG59XG5cbmZ1bmN0aW9uIGdldEV2ZW50TGFiZWwoZXZlbnQ6IElDaGF0RGVidWdFdmVudCwgZWZmZWN0aXZlS2luZD86IElDaGF0RGVidWdFdmVudFsna2luZCddKTogc3RyaW5nIHtcblx0Y29uc3Qga2luZCA9IGVmZmVjdGl2ZUtpbmQgPz8gZXZlbnQua2luZDtcblx0c3dpdGNoIChraW5kKSB7XG5cdFx0Y2FzZSAndXNlck1lc3NhZ2UnOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd1c2VyTGFiZWwnLCBcIlVzZXIgTWVzc2FnZVwiKTtcblx0XHRjYXNlICdtb2RlbFR1cm4nOlxuXHRcdFx0cmV0dXJuIGV2ZW50LmtpbmQgPT09ICdtb2RlbFR1cm4nID8gKGV2ZW50Lm1vZGVsID8/IGxvY2FsaXplKCdtb2RlbFR1cm5MYWJlbCcsIFwiTW9kZWwgVHVyblwiKSkgOiBsb2NhbGl6ZSgnbW9kZWxUdXJuTGFiZWwnLCBcIk1vZGVsIFR1cm5cIik7XG5cdFx0Y2FzZSAndG9vbENhbGwnOlxuXHRcdFx0cmV0dXJuIGV2ZW50LmtpbmQgPT09ICd0b29sQ2FsbCcgPyBldmVudC50b29sTmFtZSA6IGV2ZW50LmtpbmQgPT09ICdnZW5lcmljJyA/IGV2ZW50Lm5hbWUgOiBsb2NhbGl6ZSgndG9vbENhbGxMYWJlbCcsIFwiVG9vbCBDYWxsXCIpO1xuXHRcdGNhc2UgJ3N1YmFnZW50SW52b2NhdGlvbic6XG5cdFx0XHRyZXR1cm4gZXZlbnQua2luZCA9PT0gJ3N1YmFnZW50SW52b2NhdGlvbicgPyBldmVudC5hZ2VudE5hbWUgOiBsb2NhbGl6ZSgnc3ViYWdlbnRGYWxsYmFjaycsIFwiU3ViYWdlbnRcIik7XG5cdFx0Y2FzZSAnYWdlbnRSZXNwb25zZSc6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FnZW50UmVzcG9uc2VMYWJlbCcsIFwiQWdlbnQgUmVzcG9uc2VcIik7XG5cdFx0Y2FzZSAnZ2VuZXJpYyc6XG5cdFx0XHRyZXR1cm4gZXZlbnQua2luZCA9PT0gJ2dlbmVyaWMnID8gZXZlbnQubmFtZSA6IGxvY2FsaXplKCdnZW5lcmljTGFiZWwnLCBcIkV2ZW50XCIpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldEV2ZW50U3VibGFiZWwoZXZlbnQ6IElDaGF0RGVidWdFdmVudCwgZWZmZWN0aXZlS2luZD86IElDaGF0RGVidWdFdmVudFsna2luZCddKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qga2luZCA9IGVmZmVjdGl2ZUtpbmQgPz8gZXZlbnQua2luZDtcblx0c3dpdGNoIChraW5kKSB7XG5cdFx0Y2FzZSAnbW9kZWxUdXJuJzoge1xuXHRcdFx0Y29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRpZiAoZXZlbnQua2luZCA9PT0gJ21vZGVsVHVybicgJiYgZXZlbnQucmVxdWVzdE5hbWUpIHtcblx0XHRcdFx0cGFydHMucHVzaChldmVudC5yZXF1ZXN0TmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXZlbnQua2luZCA9PT0gJ21vZGVsVHVybicgJiYgZXZlbnQudG90YWxUb2tlbnMpIHtcblx0XHRcdFx0cGFydHMucHVzaChsb2NhbGl6ZSgndG9rZW5Db3VudCcsIFwiezB9IHRva2Vuc1wiLCBldmVudC50b3RhbFRva2VucykpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV2ZW50LmtpbmQgPT09ICdtb2RlbFR1cm4nICYmIGV2ZW50LmR1cmF0aW9uSW5NaWxsaXMpIHtcblx0XHRcdFx0cGFydHMucHVzaChmb3JtYXREdXJhdGlvbihldmVudC5kdXJhdGlvbkluTWlsbGlzKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcGFydHMubGVuZ3RoID4gMCA/IHBhcnRzLmpvaW4oJyBcXHUwMGI3ICcpIDogdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjYXNlICd0b29sQ2FsbCc6IHtcblx0XHRcdGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0aWYgKGV2ZW50LmtpbmQgPT09ICd0b29sQ2FsbCcgJiYgZXZlbnQucmVzdWx0KSB7XG5cdFx0XHRcdHBhcnRzLnB1c2goZXZlbnQucmVzdWx0KTtcblx0XHRcdH1cblx0XHRcdGlmIChldmVudC5raW5kID09PSAndG9vbENhbGwnICYmIGV2ZW50LmR1cmF0aW9uSW5NaWxsaXMpIHtcblx0XHRcdFx0cGFydHMucHVzaChmb3JtYXREdXJhdGlvbihldmVudC5kdXJhdGlvbkluTWlsbGlzKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcGFydHMubGVuZ3RoID4gMCA/IHBhcnRzLmpvaW4oJyBcXHUwMGI3ICcpIDogdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjYXNlICdzdWJhZ2VudEludm9jYXRpb24nOiB7XG5cdFx0XHRjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcblx0XHRcdGlmIChldmVudC5raW5kID09PSAnc3ViYWdlbnRJbnZvY2F0aW9uJyAmJiBldmVudC5zdGF0dXMpIHtcblx0XHRcdFx0cGFydHMucHVzaChldmVudC5zdGF0dXMpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV2ZW50LmtpbmQgPT09ICdzdWJhZ2VudEludm9jYXRpb24nICYmIGV2ZW50LmR1cmF0aW9uSW5NaWxsaXMpIHtcblx0XHRcdFx0cGFydHMucHVzaChmb3JtYXREdXJhdGlvbihldmVudC5kdXJhdGlvbkluTWlsbGlzKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcGFydHMubGVuZ3RoID4gMCA/IHBhcnRzLmpvaW4oJyBcXHUwMGI3ICcpIDogdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjYXNlICd1c2VyTWVzc2FnZSc6XG5cdFx0Y2FzZSAnYWdlbnRSZXNwb25zZSc6IHtcblx0XHRcdC8vIFVzZSB0aGUgbWVzc2FnZSBzdW1tYXJ5IGFzIHRoZSBzdWJsYWJlbC4gRm9yIHJlbWFwcGVkIGdlbmVyaWNcblx0XHRcdC8vIGV2ZW50cywgdXNlIHRoZSBkZXRhaWxzIHByb3BlcnR5LlxuXHRcdFx0bGV0IHRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChldmVudC5raW5kID09PSAndXNlck1lc3NhZ2UnIHx8IGV2ZW50LmtpbmQgPT09ICdhZ2VudFJlc3BvbnNlJykge1xuXHRcdFx0XHR0ZXh0ID0gZXZlbnQubWVzc2FnZTtcblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQua2luZCA9PT0gJ2dlbmVyaWMnKSB7XG5cdFx0XHRcdHRleHQgPSBldmVudC5kZXRhaWxzO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0ZXh0KSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBGaW5kIHRoZSBmaXJzdCBtZWFuaW5nZnVsIGxpbmUsIHNraXBwaW5nIHRyaXZpYWwgbGluZXMgbGlrZVxuXHRcdFx0Ly8gbG9uZSBicmFja2V0cy9icmFjZXMgdGhhdCBhcHBlYXIgd2hlbiB0aGUgbWVzc2FnZSBpcyBKU09OLlxuXHRcdFx0Y29uc3QgbGluZXMgPSB0ZXh0LnNwbGl0KCdcXG4nKTtcblx0XHRcdGxldCBmaXJzdExpbmUgPSAnJztcblx0XHRcdGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuXHRcdFx0XHRjb25zdCB0cmltbWVkID0gbGluZS50cmltKCk7XG5cdFx0XHRcdGlmICh0cmltbWVkICYmIHRyaW1tZWQubGVuZ3RoID4gMikge1xuXHRcdFx0XHRcdGZpcnN0TGluZSA9IHRyaW1tZWQ7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICghZmlyc3RMaW5lKSB7XG5cdFx0XHRcdC8vIEZhbGwgYmFjayB0byB0aGUgZnVsbCB0ZXh0IGNvbGxhcHNlZCB0byBhIHNpbmdsZSBsaW5lXG5cdFx0XHRcdGZpcnN0TGluZSA9IHRleHQucmVwbGFjZSgvXFxzKy9nLCAnICcpLnRyaW0oKTtcblx0XHRcdH1cblx0XHRcdGlmICghZmlyc3RMaW5lKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmlyc3RMaW5lLmxlbmd0aCA+IDYwID8gZmlyc3RMaW5lLnN1YnN0cmluZygwLCA1NykgKyAnLi4uJyA6IGZpcnN0TGluZTtcblx0XHR9XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gZm9ybWF0RHVyYXRpb24obXM6IG51bWJlcik6IHN0cmluZyB7XG5cdGlmIChtcyA8IDEwMDApIHtcblx0XHRyZXR1cm4gYCR7bXN9bXNgO1xuXHR9XG5cdHJldHVybiBgJHsobXMgLyAxMDAwKS50b0ZpeGVkKDEpfXNgO1xufVxuXG5mdW5jdGlvbiBpc0Vycm9yRXZlbnQoZXZlbnQ6IElDaGF0RGVidWdFdmVudCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gKGV2ZW50LmtpbmQgPT09ICd0b29sQ2FsbCcgJiYgZXZlbnQucmVzdWx0ID09PSAnZXJyb3InKSB8fFxuXHRcdChldmVudC5raW5kID09PSAnZ2VuZXJpYycgJiYgZXZlbnQubGV2ZWwgPT09IDMgLyogQ2hhdERlYnVnTG9nTGV2ZWwuRXJyb3IgKi8pIHx8XG5cdFx0KGV2ZW50LmtpbmQgPT09ICdzdWJhZ2VudEludm9jYXRpb24nICYmIGV2ZW50LnN0YXR1cyA9PT0gJ2ZhaWxlZCcpO1xufVxuXG5jb25zdCBUT09MVElQX01BWF9MRU5HVEggPSA1MDA7XG5cbmZ1bmN0aW9uIGdldEV2ZW50VG9vbHRpcChldmVudDogSUNoYXREZWJ1Z0V2ZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0c3dpdGNoIChldmVudC5raW5kKSB7XG5cdFx0Y2FzZSAndXNlck1lc3NhZ2UnOiB7XG5cdFx0XHRjb25zdCBtc2cgPSBldmVudC5tZXNzYWdlLnRyaW0oKTtcblx0XHRcdGlmIChtc2cubGVuZ3RoID4gVE9PTFRJUF9NQVhfTEVOR1RIKSB7XG5cdFx0XHRcdHJldHVybiBtc2cuc3Vic3RyaW5nKDAsIFRPT0xUSVBfTUFYX0xFTkdUSCkgKyAnXFx1MjAyNic7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbXNnIHx8IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y2FzZSAndG9vbENhbGwnOiB7XG5cdFx0XHRjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbZXZlbnQudG9vbE5hbWVdO1xuXHRcdFx0aWYgKGV2ZW50LmlucHV0KSB7XG5cdFx0XHRcdGNvbnN0IGlucHV0ID0gZXZlbnQuaW5wdXQudHJpbSgpO1xuXHRcdFx0XHRwYXJ0cy5wdXNoKGxvY2FsaXplKCd0b29sdGlwSW5wdXQnLCBcIklucHV0OiB7MH1cIiwgaW5wdXQubGVuZ3RoID4gVE9PTFRJUF9NQVhfTEVOR1RIID8gaW5wdXQuc3Vic3RyaW5nKDAsIFRPT0xUSVBfTUFYX0xFTkdUSCkgKyAnXFx1MjAyNicgOiBpbnB1dCkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV2ZW50Lm91dHB1dCkge1xuXHRcdFx0XHRjb25zdCBvdXRwdXQgPSBldmVudC5vdXRwdXQudHJpbSgpO1xuXHRcdFx0XHRwYXJ0cy5wdXNoKGxvY2FsaXplKCd0b29sdGlwT3V0cHV0JywgXCJPdXRwdXQ6IHswfVwiLCBvdXRwdXQubGVuZ3RoID4gVE9PTFRJUF9NQVhfTEVOR1RIID8gb3V0cHV0LnN1YnN0cmluZygwLCBUT09MVElQX01BWF9MRU5HVEgpICsgJ1xcdTIwMjYnIDogb3V0cHV0KSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXZlbnQucmVzdWx0KSB7XG5cdFx0XHRcdHBhcnRzLnB1c2gobG9jYWxpemUoJ3Rvb2x0aXBSZXN1bHQnLCBcIlJlc3VsdDogezB9XCIsIGV2ZW50LnJlc3VsdCkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHBhcnRzLmpvaW4oJ1xcbicpO1xuXHRcdH1cblx0XHRjYXNlICdzdWJhZ2VudEludm9jYXRpb24nOiB7XG5cdFx0XHRjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbZXZlbnQuYWdlbnROYW1lXTtcblx0XHRcdGlmIChldmVudC5kZXNjcmlwdGlvbikge1xuXHRcdFx0XHRwYXJ0cy5wdXNoKGV2ZW50LmRlc2NyaXB0aW9uKTtcblx0XHRcdH1cblx0XHRcdGlmIChldmVudC5zdGF0dXMpIHtcblx0XHRcdFx0cGFydHMucHVzaChsb2NhbGl6ZSgndG9vbHRpcFN0YXR1cycsIFwiU3RhdHVzOiB7MH1cIiwgZXZlbnQuc3RhdHVzKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXZlbnQudG9vbENhbGxDb3VudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHBhcnRzLnB1c2gobG9jYWxpemUoJ3Rvb2x0aXBUb29sQ2FsbHMnLCBcIlRvb2wgY2FsbHM6IHswfVwiLCBldmVudC50b29sQ2FsbENvdW50KSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXZlbnQubW9kZWxUdXJuQ291bnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRwYXJ0cy5wdXNoKGxvY2FsaXplKCd0b29sdGlwTW9kZWxUdXJucycsIFwiTW9kZWwgdHVybnM6IHswfVwiLCBldmVudC5tb2RlbFR1cm5Db3VudCkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHBhcnRzLmpvaW4oJ1xcbicpO1xuXHRcdH1cblx0XHRjYXNlICdnZW5lcmljJzoge1xuXHRcdFx0aWYgKGV2ZW50LmRldGFpbHMpIHtcblx0XHRcdFx0Y29uc3QgZGV0YWlscyA9IGV2ZW50LmRldGFpbHMudHJpbSgpO1xuXHRcdFx0XHRyZXR1cm4gZGV0YWlscy5sZW5ndGggPiBUT09MVElQX01BWF9MRU5HVEggPyBkZXRhaWxzLnN1YnN0cmluZygwLCBUT09MVElQX01BWF9MRU5HVEgpICsgJ1xcdTIwMjYnIDogZGV0YWlscztcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNhc2UgJ21vZGVsVHVybic6IHtcblx0XHRcdGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0aWYgKGV2ZW50Lm1vZGVsKSB7XG5cdFx0XHRcdHBhcnRzLnB1c2goZXZlbnQubW9kZWwpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV2ZW50LnRvdGFsVG9rZW5zICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cGFydHMucHVzaChsb2NhbGl6ZSgndG9vbHRpcFRva2VucycsIFwiVG9rZW5zOiB7MH1cIiwgZXZlbnQudG90YWxUb2tlbnMpKTtcblx0XHRcdH1cblx0XHRcdGlmIChldmVudC5pbnB1dFRva2VucyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHBhcnRzLnB1c2gobG9jYWxpemUoJ3Rvb2x0aXBJbnB1dFRva2VucycsIFwiSW5wdXQgdG9rZW5zOiB7MH1cIiwgZXZlbnQuaW5wdXRUb2tlbnMpKTtcblx0XHRcdH1cblx0XHRcdGlmIChldmVudC5vdXRwdXRUb2tlbnMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRwYXJ0cy5wdXNoKGxvY2FsaXplKCd0b29sdGlwT3V0cHV0VG9rZW5zJywgXCJPdXRwdXQgdG9rZW5zOiB7MH1cIiwgZXZlbnQub3V0cHV0VG9rZW5zKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXZlbnQuY2FjaGVkVG9rZW5zICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cGFydHMucHVzaChsb2NhbGl6ZSgndG9vbHRpcENhY2hlZFRva2VucycsIFwiQ2FjaGVkIHRva2VuczogezB9XCIsIGV2ZW50LmNhY2hlZFRva2VucykpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV2ZW50LmR1cmF0aW9uSW5NaWxsaXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRwYXJ0cy5wdXNoKGxvY2FsaXplKCd0b29sdGlwRHVyYXRpb24nLCBcIkR1cmF0aW9uOiB7MH1cIiwgZm9ybWF0RHVyYXRpb24oZXZlbnQuZHVyYXRpb25Jbk1pbGxpcykpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBwYXJ0cy5sZW5ndGggPiAwID8gcGFydHMuam9pbignXFxuJykgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQXNGekIsU0FBUyxjQUFjLE1BQWMsV0FBMkI7QUFDL0QsTUFBSSxLQUFLLFVBQVUsV0FBVztBQUM3QixXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU8sS0FBSyxVQUFVLEdBQUcsWUFBWSxDQUFDLElBQUk7QUFDM0M7QUFFTyxTQUFTLGVBQWUsUUFBZ0Q7QUFHOUUsUUFBTSxvQkFBb0IsQ0FBQyxlQUFlLGlCQUFpQjtBQVEzRCxXQUFTLGVBQWUsTUFBdUI7QUFDOUMsZUFBVyxZQUFZLG1CQUFtQjtBQUN6QyxVQUFJLFNBQVMsVUFBVTtBQUN0QixlQUFPO0FBQUEsTUFDUjtBQUNBLFVBQUksS0FBSyxXQUFXLFFBQVEsR0FBRztBQUM5QixjQUFNLFdBQVcsS0FBSyxTQUFTLE1BQU07QUFDckMsWUFBSSxhQUFhLE9BQU8sYUFBYSxPQUFPLGFBQWEsT0FBTyxhQUFhLEtBQUs7QUFDakYsaUJBQU87QUFBQSxRQUNSO0FBQUEs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
