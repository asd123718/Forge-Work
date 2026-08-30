import { safeIntl } from "../../../../../base/common/date.js";
import { localize } from "../../../../../nls.js";
import { CacheDiffKind } from "./chatDebugCacheDiff.js";
const numberFormatter = safeIntl.NumberFormat();
function fmt(n) {
  return numberFormatter.value.format(n);
}
var CacheInsightSeverity = /* @__PURE__ */ ((CacheInsightSeverity2) => {
  CacheInsightSeverity2["Ok"] = "ok";
  CacheInsightSeverity2["Info"] = "info";
  CacheInsightSeverity2["Warning"] = "warning";
  CacheInsightSeverity2["Critical"] = "critical";
  return CacheInsightSeverity2;
})(CacheInsightSeverity || {});
var CacheBreakCategory = /* @__PURE__ */ ((CacheBreakCategory2) => {
  CacheBreakCategory2["Healthy"] = "healthy";
  CacheBreakCategory2["Expiration"] = "expiration";
  CacheBreakCategory2["Model"] = "model";
  CacheBreakCategory2["Tools"] = "tools";
  CacheBreakCategory2["System"] = "system";
  CacheBreakCategory2["Options"] = "options";
  CacheBreakCategory2["History"] = "history";
  CacheBreakCategory2["Unknown"] = "unknown";
  return CacheBreakCategory2;
})(CacheBreakCategory || {});
var StringDivergenceShape = /* @__PURE__ */ ((StringDivergenceShape2) => {
  StringDivergenceShape2["LeadingRemoved"] = "leadingRemoved";
  StringDivergenceShape2["LeadingAdded"] = "leadingAdded";
  StringDivergenceShape2["TrailingRemoved"] = "trailingRemoved";
  StringDivergenceShape2["TrailingAdded"] = "trailingAdded";
  StringDivergenceShape2["InnerEdit"] = "innerEdit";
  return StringDivergenceShape2;
})(StringDivergenceShape || {});
const CHANGED_EXCERPT_CAP = 120;
function analyzeStringDivergence(a, b) {
  if (a === b) {
    return void 0;
  }
  const aLength = a.length;
  const bLength = b.length;
  const minLength = Math.min(aLength, bLength);
  let commonPrefix = 0;
  while (commonPrefix < minLength && a.charCodeAt(commonPrefix) === b.charCodeAt(commonPrefix)) {
    commonPrefix++;
  }
  let commonSuffix = 0;
  while (commonSuffix < minLength - commonPrefix && a.charCodeAt(aLength - 1 - commonSuffix) === b.charCodeAt(bLength - 1 - commonSuffix)) {
    commonSuffix++;
  }
  let shape;
  if (commonPrefix === bLength && bLength < aLength) {
    shape = "trailingRemoved" /* TrailingRemoved */;
  } else if (commonPrefix === aLength && aLength < bLength) {
    shape = "trailingAdded" /* TrailingAdded */;
  } else if (commonSuffix === bLength && bLength < aLength) {
    shape = "leadingRemoved" /* LeadingRemoved */;
  } else if (commonSuffix === aLength && aLength < bLength) {
    shape = "leadingAdded" /* LeadingAdded */;
  } else {
    shape = "innerEdit" /* InnerEdit */;
  }
  return {
    shape,
    commonPrefix,
    commonSuffix,
    aLength,
    bLength,
    aChanged: a.substring(commonPrefix, aLength - commonSuffix).slice(0, CHANGED_EXCERPT_CAP),
    bChanged: b.substring(commonPrefix, bLength - commonSuffix).slice(0, CHANGED_EXCERPT_CAP)
  };
}
function describeStringDivergence(d) {
  switch (d.shape) {
    case "trailingAdded" /* TrailingAdded */:
      return localize("chatDebug.cache.div.appended", "{0} chars appended \u2014 the previous content survives as a shared prefix", fmt(d.bLength - d.aLength));
    case "trailingRemoved" /* TrailingRemoved */:
      return localize("chatDebug.cache.div.truncated", "last {0} chars removed \u2014 the remaining content still matches the previous bytes", fmt(d.aLength - d.bLength));
    case "leadingAdded" /* LeadingAdded */:
      return localize("chatDebug.cache.div.prepended", "{0} chars prepended \u2014 this block no longer starts with the same bytes", fmt(d.bLength - d.aLength));
    case "leadingRemoved" /* LeadingRemoved */:
      return localize("chatDebug.cache.div.leadingRemoved", "first {0} chars removed \u2014 this block no longer starts with the same bytes", fmt(d.aLength - d.bLength));
    case "innerEdit" /* InnerEdit */:
      return localize("chatDebug.cache.div.innerEdit", "edited in place \u2014 first difference at char {0} ({1} leading and {2} trailing chars unchanged)", fmt(d.commonPrefix), fmt(d.commonPrefix), fmt(d.commonSuffix));
  }
}
var VolatileValueKind = /* @__PURE__ */ ((VolatileValueKind2) => {
  VolatileValueKind2["Timestamp"] = "timestamp";
  VolatileValueKind2["Uuid"] = "uuid";
  VolatileValueKind2["Counter"] = "counter";
  return VolatileValueKind2;
})(VolatileValueKind || {});
const VOLATILE_PATTERNS = [
  { kind: "uuid" /* Uuid */, re: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/ },
  { kind: "timestamp" /* Timestamp */, re: /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?\b/ },
  { kind: "timestamp" /* Timestamp */, re: /\b\d{1,2}:\d{2}:\d{2}\b/ },
  { kind: "counter" /* Counter */, re: /\b\d{10,13}\b/ }
];
function detectVolatileValue(aChanged, bChanged) {
  for (const { kind, re } of VOLATILE_PATTERNS) {
    const aMatch = re.exec(aChanged)?.[0];
    const bMatch = re.exec(bChanged)?.[0];
    if (aMatch !== void 0 && bMatch !== void 0 && aMatch !== bMatch) {
      return kind;
    }
  }
  return void 0;
}
const VOLATILE_CONTEXT = 24;
const VOLATILE_WINDOW_CAP = 240;
function detectVolatileValueAround(a, b, dv) {
  const start = Math.max(0, dv.commonPrefix - VOLATILE_CONTEXT);
  const aWindow = a.substring(start, Math.min(dv.aLength - dv.commonSuffix + VOLATILE_CONTEXT, start + VOLATILE_WINDOW_CAP));
  const bWindow = b.substring(start, Math.min(dv.bLength - dv.commonSuffix + VOLATILE_CONTEXT, start + VOLATILE_WINDOW_CAP));
  return detectVolatileValue(aWindow, bWindow);
}
function volatileValueLabel(kind) {
  switch (kind) {
    case "timestamp" /* Timestamp */:
      return localize("chatDebug.cache.volatile.timestamp", "timestamp");
    case "uuid" /* Uuid */:
      return localize("chatDebug.cache.volatile.uuid", "unique id (UUID)");
    case "counter" /* Counter */:
      return localize("chatDebug.cache.volatile.counter", "large changing number");
  }
}
function parseToolList(toolsJson) {
  if (!toolsJson) {
    return void 0;
  }
  let raw;
  try {
    raw = JSON.parse(toolsJson);
  } catch {
    return void 0;
  }
  if (!Array.isArray(raw)) {
    return void 0;
  }
  const out = /* @__PURE__ */ new Map();
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const name = item && typeof item.name === "string" && item.name || item && item.function && typeof item.function.name === "string" && item.function.name || item && typeof item.type === "string" && item.type || `#${i}`;
    let serialized;
    try {
      serialized = JSON.stringify(item);
    } catch {
      serialized = String(item);
    }
    out.set(name, (out.get(name) ?? "") + serialized);
  }
  return out;
}
function analyzeToolCatalog(aTools, bTools) {
  const a = parseToolList(aTools);
  const b = parseToolList(bTools);
  if (!a || !b) {
    return void 0;
  }
  const added = [];
  const removed = [];
  const modified = [];
  for (const [name, def] of b) {
    const aDef = a.get(name);
    if (aDef === void 0) {
      added.push(name);
    } else if (aDef !== def) {
      modified.push(name);
    }
  }
  for (const name of a.keys()) {
    if (!b.has(name)) {
      removed.push(name);
    }
  }
  return {
    added,
    removed,
    modified,
    reorderedOnly: added.length === 0 && removed.length === 0 && modified.length === 0,
    aCount: a.size,
    bCount: b.size
  };
}
const severityRank = {
  ["ok" /* Ok */]: 0,
  ["info" /* Info */]: 1,
  ["warning" /* Warning */]: 2,
  ["critical" /* Critical */]: 3
};
function maxInsightSeverity(insights) {
  let max = "ok" /* Ok */;
  for (const i of insights) {
    if (severityRank[i.severity] > severityRank[max]) {
      max = i.severity;
    }
  }
  return max;
}
function primaryInsight(insights) {
  return insights.find((i) => i.severity === "critical" /* Critical */) ?? insights.find((i) => i.severity === "warning" /* Warning */);
}
const EFFECTIVE_MISS_PCT = 1;
const TYPICAL_TTL_MINUTES = 5;
const LOOKBACK_WINDOW_BLOCKS = 20;
const MIN_CACHEABLE_TOKENS = 4096;
function computeCacheInsights(input) {
  const out = [];
  const modelChanged = input.aModel !== input.bModel;
  const toolsChanged = (input.aTools ?? "") !== (input.bTools ?? "");
  const systemChanged = (input.aSystem ?? "") !== (input.bSystem ?? "");
  if (modelChanged) {
    out.push({
      severity: "critical" /* Critical */,
      title: localize("chatDebug.cache.insight.model.title", "Model changed"),
      detail: localize("chatDebug.cache.insight.model.detail", "{0} \u2192 {1}", input.aModel ?? "\u2014", input.bModel ?? "\u2014"),
      hint: localize("chatDebug.cache.insight.model.hint", "Prompt caches are scoped to a model \u2014 switching models recomputes the entire prompt. Route sub-tasks that need a different model through a separate request chain so the main loop keeps its cache."),
      category: "model" /* Model */
    });
  }
  if (toolsChanged) {
    out.push(toolsInsight(input.aTools, input.bTools));
  }
  if (systemChanged) {
    out.push(systemInsight(input.aSystem, input.bSystem));
  }
  if (input.optionsDiff.length > 0) {
    out.push({
      severity: "warning" /* Warning */,
      title: localize("chatDebug.cache.insight.options.title", "Request options changed"),
      detail: input.optionsDiff.map((d) => `${d.key}: ${d.previousLabel} \u2192 ${d.currentLabel}`).join(" \xB7 "),
      hint: localize("chatDebug.cache.insight.options.hint", "Options are part of the cache key on most providers. Keep per-request options stable when cache reuse matters."),
      category: "options" /* Options */
    });
  }
  if (input.compareInputMessages) {
    out.push(...messageInsights(input, modelChanged || toolsChanged || systemChanged));
    if (!modelChanged && !toolsChanged && !systemChanged && input.optionsDiff.length === 0 && !input.diff.break) {
      out.push(stablePrefixInsight(input));
    }
  } else if (input.isContinuation) {
    out.push({
      severity: "info" /* Info */,
      title: localize("chatDebug.cache.insight.continuation.title", "Responses API continuation"),
      detail: localize("chatDebug.cache.insight.continuation.detail", "Only the wire delta is captured for this request; prior context is referenced by previous_response_id and reconstructed provider-side. Analysis is limited to system, tools, and request options."),
      category: "unknown" /* Unknown */
    });
  } else if (input.previousIsContinuation) {
    out.push({
      severity: "info" /* Info */,
      title: localize("chatDebug.cache.insight.prevContinuation.title", "Message comparison suppressed"),
      detail: localize("chatDebug.cache.insight.prevContinuation.detail", "The previous request was a Responses API continuation (delta-only wire input); positionally diffing this full request against it would be misleading."),
      category: "unknown" /* Unknown */
    });
  }
  return out;
}
function toolsInsight(aTools, bTools) {
  const delta = analyzeToolCatalog(aTools, bTools);
  const component = "tools";
  if (delta?.reorderedOnly) {
    return {
      severity: "critical" /* Critical */,
      title: localize("chatDebug.cache.insight.toolsReorder.title", "Tool definitions reordered"),
      detail: localize("chatDebug.cache.insight.toolsReorder.detail", "Same {0} tools with identical definitions, sent in a different order.", fmt(delta.bCount)),
      hint: localize("chatDebug.cache.insight.toolsReorder.hint", "Tools render at the very start of the prompt \u2014 a pure reorder still changes the bytes and invalidates the entire cache. Serialize the tool list deterministically (e.g. sort by name)."),
      component,
      category: "tools" /* Tools */
    };
  }
  if (delta && (delta.added.length > 0 || delta.removed.length > 0)) {
    const parts = [];
    if (delta.added.length > 0) {
      parts.push(localize("chatDebug.cache.insight.toolsAdded", "added: {0}", delta.added.join(", ")));
    }
    if (delta.removed.length > 0) {
      parts.push(localize("chatDebug.cache.insight.toolsRemoved", "removed: {0}", delta.removed.join(", ")));
    }
    if (delta.modified.length > 0) {
      parts.push(localize("chatDebug.cache.insight.toolsModified", "modified: {0}", delta.modified.join(", ")));
    }
    return {
      severity: "critical" /* Critical */,
      title: localize("chatDebug.cache.insight.toolsSet.title", "Tool catalog changed ({0} \u2192 {1} tools)", fmt(delta.aCount), fmt(delta.bCount)),
      detail: parts.join(" \xB7 "),
      hint: localize("chatDebug.cache.insight.toolsSet.hint", "Tool definitions render before everything else, so adding or removing a tool mid-session invalidates the whole prompt. Keep the tool set stable for the life of a session, or use deferred/appended tool loading instead of swapping the catalog."),
      component,
      category: "tools" /* Tools */
    };
  }
  if (delta && delta.modified.length > 0) {
    return {
      severity: "critical" /* Critical */,
      title: localize("chatDebug.cache.insight.toolsDef.title", "Tool definitions modified"),
      detail: localize("chatDebug.cache.insight.toolsDef.detail", "changed: {0}", delta.modified.join(", ")),
      hint: localize("chatDebug.cache.insight.toolsDef.hint", "A changed tool description or schema rewrites the prompt from the tools block onward. Check for dynamic content (counts, paths, timestamps) inside tool descriptions."),
      component,
      category: "tools" /* Tools */
    };
  }
  const dv = analyzeStringDivergence(aTools ?? "", bTools ?? "");
  return {
    severity: "critical" /* Critical */,
    title: localize("chatDebug.cache.insight.tools.title", "Tool catalog changed"),
    detail: dv ? describeStringDivergence(dv) : void 0,
    hint: localize("chatDebug.cache.insight.tools.hint", "The tool catalog is the first block of the prompt \u2014 any byte change here invalidates the entire cache."),
    component,
    category: "tools" /* Tools */
  };
}
function systemInsight(aSystem, bSystem) {
  const dv = analyzeStringDivergence(aSystem ?? "", bSystem ?? "");
  const volatile = dv ? detectVolatileValueAround(aSystem ?? "", bSystem ?? "", dv) : void 0;
  return {
    severity: "critical" /* Critical */,
    title: localize("chatDebug.cache.insight.system.title", "System prompt changed"),
    detail: dv ? localize("chatDebug.cache.insight.system.detail", "{0} \u2192 {1} chars \xB7 {2}", fmt(dv.aLength), fmt(dv.bLength), describeStringDivergence(dv)) : void 0,
    hint: volatile ? localize("chatDebug.cache.insight.system.volatileHint", "The changed region looks like a {0} \u2014 volatile values interpolated into the system prompt break the cache on every request. Move dynamic content after the conversation history or drop it.", volatileValueLabel(volatile)) : localize("chatDebug.cache.insight.system.hint", "A system prompt change invalidates everything after the tools block. Keep the system prompt byte-stable for the life of a session and inject per-turn context into the newest message instead."),
    component: "system",
    category: "system" /* System */
  };
}
function messageInsights(input, hasEarlierBreak) {
  const { diff } = input;
  if (!diff.break) {
    return [];
  }
  const out = [];
  const idx = diff.break.index;
  const component = `messages[${idx}]`;
  const counts = diff.counts;
  if (diff.break.kind === CacheDiffKind.OnlyInB) {
    out.push({
      // Downgrade to Info when an earlier tier already broke the cache:
      // the append is still fine, but it isn't the story of this request.
      severity: hasEarlierBreak ? "info" /* Info */ : "ok" /* Ok */,
      title: localize("chatDebug.cache.insight.append.title", "New messages appended \u2014 expected growth"),
      detail: localize("chatDebug.cache.insight.append.detail", "{0} new message(s) after {1} unchanged \u2014 the shared prefix was extended, not broken. The uncached tokens are the new suffix being written to the cache for the next request.", fmt(counts.onlyInB), fmt(counts.identical)),
      component,
      category: "healthy" /* Healthy */
    });
    if (counts.onlyInB > LOOKBACK_WINDOW_BLOCKS) {
      out.push({
        severity: "warning" /* Warning */,
        title: localize("chatDebug.cache.insight.lookback.title", "{0} blocks appended \u2014 beyond the typical cache lookback window", fmt(counts.onlyInB)),
        detail: localize("chatDebug.cache.insight.lookback.detail", "Providers typically look back ~{0} content blocks for a prior cache entry; a turn that appends more can silently miss it even though the prefix matches.", LOOKBACK_WINDOW_BLOCKS),
        hint: localize("chatDebug.cache.insight.lookback.hint", "During long tool loops, place intermediate cache breakpoints every ~15 blocks so the next request can still find a cache entry.")
      });
    }
    return out;
  }
  if (diff.break.kind === CacheDiffKind.OnlyInA) {
    out.push({
      severity: "critical" /* Critical */,
      title: localize("chatDebug.cache.insight.truncated.title", "History truncated at messages[{0}]", idx),
      detail: localize("chatDebug.cache.insight.truncated.detail", "{0} message(s) present in the previous request are missing from this one.", fmt(counts.onlyInA)),
      hint: localize("chatDebug.cache.insight.truncated.hint", "History slicing or compaction shortens the prefix \u2014 the cache can only match up to the cut, and everything after it is recomputed."),
      component,
      category: "history" /* History */
    });
    return out;
  }
  const tok = diff.signature.find((t) => t.index === idx);
  const role = tok?.bRole ?? tok?.aRole ?? "message";
  const aMsg = input.aMessages[idx];
  const bMsg = input.bMessages[idx];
  const dv = aMsg && bMsg ? analyzeStringDivergence(aMsg.text, bMsg.text) : void 0;
  const volatile = dv && aMsg && bMsg ? detectVolatileValueAround(aMsg.text, bMsg.text, dv) : void 0;
  const detailParts = [];
  if (aMsg && bMsg) {
    detailParts.push(localize("chatDebug.cache.insight.drift.sizes", "{0} message, {1} \u2192 {2} chars", role, fmt(aMsg.charLength), fmt(bMsg.charLength)));
  }
  if (dv) {
    detailParts.push(describeStringDivergence(dv));
  }
  out.push({
    severity: "critical" /* Critical */,
    title: localize("chatDebug.cache.insight.drift.title", "History rewritten at messages[{0}]", idx),
    detail: detailParts.join(" \xB7 "),
    hint: volatile ? localize("chatDebug.cache.insight.drift.volatileHint", "The changed region looks like a {0} \u2014 a volatile value re-rendered into the conversation history breaks the prefix on every request.", volatileValueLabel(volatile)) : localize("chatDebug.cache.insight.drift.hint", "Conversation history must be byte-identical between requests to reuse the cached prefix. A re-serialized {0} turn \u2014 trimmed whitespace, dropped reasoning or preamble text, reformatted tool calls \u2014 silently invalidates everything after it.", role),
    component,
    category: "history" /* History */
  });
  const changedAfterBreak = counts.contentDrift + counts.lengthChange + counts.onlyInA + counts.onlyInB - 1;
  if (changedAfterBreak > 0) {
    out.push({
      severity: "info" /* Info */,
      title: localize("chatDebug.cache.insight.afterBreak.title", "{0} more changed position(s) after the break", fmt(changedAfterBreak)),
      detail: localize("chatDebug.cache.insight.afterBreak.detail", "Once the prefix breaks at messages[{0}], everything after it is recomputed regardless \u2014 fix the first break first.", idx)
    });
  }
  return out;
}
function stablePrefixInsight(input) {
  if (input.hitPct < EFFECTIVE_MISS_PCT) {
    if (input.inputTokens > 0 && input.inputTokens < MIN_CACHEABLE_TOKENS) {
      return {
        severity: "warning" /* Warning */,
        title: localize("chatDebug.cache.insight.tooSmall.title", "Prompt may be below the minimum cacheable size"),
        detail: localize("chatDebug.cache.insight.tooSmall.detail", "{0} input tokens \u2014 providers only cache prompts above a minimum prefix size (roughly 1,024-4,096 tokens depending on model), and smaller prompts silently never cache.", fmt(input.inputTokens)),
        hint: localize("chatDebug.cache.insight.tooSmall.hint", "Small utility requests (titles, summaries) often sit below the threshold; a 0% hit on them is normal and not worth optimizing."),
        category: "expiration" /* Expiration */
      };
    }
    const minutes = input.minutesSincePrevious;
    const gap = minutes !== void 0 && minutes >= 1 ? localize("chatDebug.cache.insight.expired.gap", " {0} minute(s) elapsed since the previous request.", fmt(Math.round(minutes))) : "";
    return {
      severity: "warning" /* Warning */,
      title: localize("chatDebug.cache.insight.expired.title", "Likely cache expiration"),
      detail: localize("chatDebug.cache.insight.expired.detail", "The prompt is byte-identical to the previous request but only {0}% was served from cache.{1}", input.hitPct.toFixed(2), gap),
      hint: localize("chatDebug.cache.insight.expired.hint", "Provider prompt caches expire after a few minutes of inactivity (typically ~{0} min). Long gaps between requests recompute the full prompt even when nothing changed.", TYPICAL_TTL_MINUTES),
      category: "expiration" /* Expiration */
    };
  }
  return {
    severity: "ok" /* Ok */,
    title: localize("chatDebug.cache.insight.stable.title", "Prompt prefix fully stable"),
    detail: localize("chatDebug.cache.insight.stable.detail", "No divergence detected \u2014 {0}% of input tokens were served from cache.", input.hitPct.toFixed(2)),
    category: "healthy" /* Healthy */
  };
}
function categorizeCacheBreak(insights) {
  const primary = primaryInsight(insights);
  if (primary?.category) {
    return primary.category;
  }
  for (const i of insights) {
    if (i.category) {
      return i.category;
    }
  }
  return "unknown" /* Unknown */;
}
function cacheBreakCategoryLabel(category) {
  switch (category) {
    case "healthy" /* Healthy */:
      return localize("chatDebug.cache.category.healthy", "healthy growth");
    case "expiration" /* Expiration */:
      return localize("chatDebug.cache.category.expiration", "expiration / not cacheable");
    case "model" /* Model */:
      return localize("chatDebug.cache.category.model", "model changed");
    case "tools" /* Tools */:
      return localize("chatDebug.cache.category.tools", "tool catalog changed");
    case "system" /* System */:
      return localize("chatDebug.cache.category.system", "system prompt changed");
    case "options" /* Options */:
      return localize("chatDebug.cache.category.options", "request options changed");
    case "history" /* History */:
      return localize("chatDebug.cache.category.history", "history rewritten");
    case "unknown" /* Unknown */:
      return localize("chatDebug.cache.category.unknown", "not classified");
  }
}
const AVOIDABLE_CATEGORIES = [
  "model" /* Model */,
  "tools" /* Tools */,
  "system" /* System */,
  "options" /* Options */,
  "history" /* History */
];
const RECURRING_THRESHOLD = 2;
function buildSessionCacheReport(pairs, turnTokens = []) {
  let overallInput = 0;
  let overallCached = 0;
  let overallTurns = 0;
  for (const t of turnTokens) {
    if (t.inputTokens > 0) {
      overallInput += t.inputTokens;
      overallCached += Math.min(t.cachedTokens, t.inputTokens);
      overallTurns++;
    }
  }
  const overall = overallInput > 0 ? { inputTokens: overallInput, cachedTokens: overallCached, hitPct: overallCached / overallInput * 100, turnCount: overallTurns } : void 0;
  const stats = /* @__PURE__ */ new Map();
  const causeByTurnIndex = /* @__PURE__ */ new Map();
  let healthyCount = 0;
  let avoidableLostTokens = 0;
  for (const pair of pairs) {
    causeByTurnIndex.set(pair.turnIndex, pair.category);
    if (pair.category === "healthy" /* Healthy */) {
      healthyCount++;
      continue;
    }
    const stat = stats.get(pair.category) ?? { count: 0, lostTokens: 0 };
    stat.count++;
    stat.lostTokens += pair.lostTokens;
    stats.set(pair.category, stat);
    if (AVOIDABLE_CATEGORIES.includes(pair.category)) {
      avoidableLostTokens += pair.lostTokens;
    }
  }
  const byCategory = [...stats.entries()].map(([category, s]) => ({ category, count: s.count, lostTokens: s.lostTokens })).sort((a, b) => b.lostTokens - a.lostTokens);
  const findings = [];
  for (const stat of byCategory) {
    if (stat.count < RECURRING_THRESHOLD) {
      continue;
    }
    if (AVOIDABLE_CATEGORIES.includes(stat.category)) {
      findings.push({
        severity: "critical" /* Critical */,
        title: localize("chatDebug.cache.session.recurring.title", "Recurring invalidator: {0} in {1} of {2} request pairs", cacheBreakCategoryLabel(stat.category), fmt(stat.count), fmt(pairs.length)),
        detail: localize("chatDebug.cache.session.recurring.detail", "~{0} tokens recomputed across those requests. A break that repeats is systemic \u2014 look for the same root cause on every occurrence.", fmt(stat.lostTokens)),
        category: stat.category
      });
    } else if (stat.category === "expiration" /* Expiration */) {
      findings.push({
        severity: "warning" /* Warning */,
        title: localize("chatDebug.cache.session.expiration.title", "Cache likely expired {0} times", fmt(stat.count)),
        detail: localize("chatDebug.cache.session.expiration.detail", "~{0} tokens recomputed after idle gaps or on prompts below the cacheable minimum.", fmt(stat.lostTokens)),
        hint: localize("chatDebug.cache.session.expiration.hint", "If long gaps are inherent to the workflow, consider a longer-TTL cache or pre-warming before the user returns."),
        category: stat.category
      });
    }
  }
  if (findings.length === 0 && pairs.length > 0 && healthyCount === pairs.length) {
    findings.push({
      severity: "ok" /* Ok */,
      title: localize("chatDebug.cache.session.allHealthy.title", "All request pairs grew the prefix cleanly"),
      detail: localize("chatDebug.cache.session.allHealthy.detail", "Every request either appended new messages or matched the previous prompt exactly \u2014 no avoidable cache breaks in this session."),
      category: "healthy" /* Healthy */
    });
  }
  return { pairCount: pairs.length, healthyCount, avoidableLostTokens, overall, byCategory, causeByTurnIndex, findings };
}
export {
  CacheBreakCategory,
  CacheInsightSeverity,
  StringDivergenceShape,
  VolatileValueKind,
  analyzeStringDivergence,
  analyzeToolCatalog,
  buildSessionCacheReport,
  cacheBreakCategoryLabel,
  categorizeCacheBreak,
  computeCacheInsights,
  describeStringDivergence,
  detectVolatileValue,
  maxInsightSeverity,
  primaryInsight
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXREZWJ1Z1xcY2hhdERlYnVnQ2FjaGVJbnNpZ2h0cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8qKlxuICogSGV1cmlzdGljcyBlbmdpbmUgZm9yIHRoZSBDYWNoZSBFeHBsb3Jlci4gVGFrZXMgdGhlIHJhdyBkaWZmIGJldHdlZW4gdHdvXG4gKiByZXF1ZXN0cyAoQSA9IHByZXZpb3VzLCBCID0gY3VycmVudCkgYW5kIHByb2R1Y2VzIGFuIG9yZGVyZWQgbGlzdCBvZlxuICogaHVtYW4tcmVhZGFibGUgZmluZGluZ3MgZXhwbGFpbmluZyAqd2h5KiB0aGUgcHJvbXB0IGNhY2hlIGJlaGF2ZWQgdGhlIHdheVxuICogaXQgZGlkIGFuZCB3aGF0IFx1MjAxNCBpZiBhbnl0aGluZyBcdTIwMTQgY2FuIGJlIGRvbmUgYWJvdXQgaXQuXG4gKlxuICogVGhlIGhldXJpc3RpY3MgbWlycm9yIGhvdyBwcm92aWRlcnMga2V5IHByZWZpeCBjYWNoZXMuIFRoZSBwcm9tcHQgcmVuZGVyc1xuICogYXMgYHRvb2xzIFx1MjE5MiBzeXN0ZW0gXHUyMTkyIG1lc3NhZ2VzYCwgYW5kIGEgYnl0ZSBjaGFuZ2UgYW55d2hlcmUgaW52YWxpZGF0ZXNcbiAqIGV2ZXJ5dGhpbmcgYWZ0ZXIgaXQuIFNvIGZpbmRpbmdzIGFyZSBlbWl0dGVkIGluIGNhY2hlLWtleSBvcmRlcjogdGhlIGZpcnN0XG4gKiBub24tT0sgZmluZGluZyBpcyB0aGUgZWFybGllc3QgKGFuZCB0aGVyZWZvcmUgdGhlIHJlYWwpIGNhY2hlIGJyZWFrZXIuXG4gKlxuICogQWxsIGZ1bmN0aW9ucyBhcmUgcHVyZSBcdTIwMTQgbm8gRE9NLCBubyBzZXJ2aWNlcyBcdTIwMTQgc28gdGhleSBjYW4gYmUgdW5pdCB0ZXN0ZWRcbiAqIGluIGlzb2xhdGlvbi5cbiAqL1xuXG5pbXBvcnQgeyBzYWZlSW50bCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ2FjaGVEaWZmS2luZCwgSUNhY2hlRGlmZlJlc3VsdCwgSU5vcm1hbGl6ZWRNZXNzYWdlIH0gZnJvbSAnLi9jaGF0RGVidWdDYWNoZURpZmYuanMnO1xuXG5jb25zdCBudW1iZXJGb3JtYXR0ZXIgPSBzYWZlSW50bC5OdW1iZXJGb3JtYXQoKTtcblxuZnVuY3Rpb24gZm10KG46IG51bWJlcik6IHN0cmluZyB7XG5cdHJldHVybiBudW1iZXJGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KG4pO1xufVxuXG4vKiogU2V2ZXJpdHkgb2YgYSBzaW5nbGUgY2FjaGUgZmluZGluZy4gUmVuZGVyZWQgYXMgYSBjb2RpY29uICsgY29sb3IuICovXG5leHBvcnQgY29uc3QgZW51bSBDYWNoZUluc2lnaHRTZXZlcml0eSB7XG5cdC8qKiBFeHBlY3RlZCwgaGVhbHRoeSBiZWhhdmlvciAoZS5nLiBuZXcgdHVybiBhcHBlbmRlZCkuICovXG5cdE9rID0gJ29rJyxcblx0LyoqIENvbnRleHQgdGhhdCBoZWxwcyBpbnRlcnByZXRhdGlvbiBidXQgaXNuJ3QgYWN0aW9uYWJsZS4gKi9cblx0SW5mbyA9ICdpbmZvJyxcblx0LyoqIFN1c3BpY2lvdXMgYnV0IG5vdCBkZWZpbml0aXZlbHkgYXZvaWRhYmxlIChlLmcuIGxpa2VseSBleHBpcmF0aW9uKS4gKi9cblx0V2FybmluZyA9ICd3YXJuaW5nJyxcblx0LyoqIEFuIGF2b2lkYWJsZSBjYWNoZSBicmVhayB0aGUgdXNlciBzaG91bGQgaW52ZXN0aWdhdGUuICovXG5cdENyaXRpY2FsID0gJ2NyaXRpY2FsJyxcbn1cblxuLyoqXG4gKiBDb2Fyc2UgY2xhc3NpZmljYXRpb24gb2Ygd2hhdCBicm9rZSAob3IgZGlkbid0IGJyZWFrKSB0aGUgY2FjaGUgZm9yIG9uZVxuICogcmVxdWVzdCBwYWlyLiBVc2VkIGZvciByYWlsIGNoaXBzIGFuZCBjcm9zcy10dXJuIGFnZ3JlZ2F0aW9uLlxuICovXG5leHBvcnQgY29uc3QgZW51bSBDYWNoZUJyZWFrQ2F0ZWdvcnkge1xuXHQvKiogUHVyZSBhcHBlbmQgb3IgZnVsbHkgc3RhYmxlIHByZWZpeCBcdTIwMTQgdGhlIGNhY2hlIGJlaGF2ZWQgYXMgZGVzaWduZWQuICovXG5cdEhlYWx0aHkgPSAnaGVhbHRoeScsXG5cdC8qKiBQcmVmaXggYnl0ZS1pZGVudGljYWwgYnV0IHRoZSBjYWNoZSBzdGlsbCBtaXNzZWQgXHUyMDE0IFRUTC9ldmljdGlvbi4gKi9cblx0RXhwaXJhdGlvbiA9ICdleHBpcmF0aW9uJyxcblx0TW9kZWwgPSAnbW9kZWwnLFxuXHRUb29scyA9ICd0b29scycsXG5cdFN5c3RlbSA9ICdzeXN0ZW0nLFxuXHRPcHRpb25zID0gJ29wdGlvbnMnLFxuXHQvKiogQ29udmVyc2F0aW9uIGhpc3RvcnkgcmV3cml0dGVuIG9yIHRydW5jYXRlZCBpbiBwbGFjZS4gKi9cblx0SGlzdG9yeSA9ICdoaXN0b3J5Jyxcblx0LyoqIENvbnRpbnVhdGlvbnMgYW5kIG90aGVyIHBhaXJzIHdlIGNhbid0IGNsYXNzaWZ5LiAqL1xuXHRVbmtub3duID0gJ3Vua25vd24nLFxufVxuXG4vKiogT25lIGh1bWFuLXJlYWRhYmxlIGZpbmRpbmcgYWJvdXQgdGhlIGNhY2hlIGJlaGF2aW9yIG9mIHRoZSBjdXJyZW50IHJlcXVlc3QuICovXG5leHBvcnQgaW50ZXJmYWNlIElDYWNoZUluc2lnaHQge1xuXHRyZWFkb25seSBzZXZlcml0eTogQ2FjaGVJbnNpZ2h0U2V2ZXJpdHk7XG5cdC8qKiBTaG9ydCwgc2Nhbm5hYmxlIHN1bW1hcnkgXHUyMDE0IGRvdWJsZXMgYXMgdGhlIGhlYWRsaW5lIHZlcmRpY3QgZm9yIHRoZSBmaXJzdCBub24tT0sgZmluZGluZy4gKi9cblx0cmVhZG9ubHkgdGl0bGU6IHN0cmluZztcblx0LyoqIEV2aWRlbmNlOiB3aGF0IGV4YWN0bHkgZGlmZmVycyBhbmQgYnkgaG93IG11Y2guICovXG5cdHJlYWRvbmx5IGRldGFpbD86IHN0cmluZztcblx0LyoqIEFjdGlvbmFibGUgZ3VpZGFuY2UgZGVyaXZlZCBmcm9tIGhvdyBwcmVmaXggY2FjaGVzIHdvcmsuICovXG5cdHJlYWRvbmx5IGhpbnQ/OiBzdHJpbmc7XG5cdC8qKiBOYW1lIG9mIHRoZSBDb21wb25lbnRzIGVudHJ5IHRoaXMgZmluZGluZyByZWZlcnMgdG8gKGUuZy4gYHN5c3RlbWAsIGB0b29sc2AsIGBtZXNzYWdlc1s3XWApLiAqL1xuXHRyZWFkb25seSBjb21wb25lbnQ/OiBzdHJpbmc7XG5cdC8qKiBCcmVhayBjYXRlZ29yeSB0aGlzIGZpbmRpbmcgY29udHJpYnV0ZXMgdG8sIGZvciBjcm9zcy10dXJuIGFnZ3JlZ2F0aW9uLiAqL1xuXHRyZWFkb25seSBjYXRlZ29yeT86IENhY2hlQnJlYWtDYXRlZ29yeTtcbn1cblxuLyoqIEEgcmVxdWVzdC1vcHRpb24gY2hhbmdlLCBwcmUtZm9ybWF0dGVkIGJ5IHRoZSBjYWxsZXIgZm9yIGRpc3BsYXkuICovXG5leHBvcnQgaW50ZXJmYWNlIElDYWNoZUluc2lnaHRPcHRpb25EZWx0YSB7XG5cdHJlYWRvbmx5IGtleTogc3RyaW5nO1xuXHRyZWFkb25seSBwcmV2aW91c0xhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGN1cnJlbnRMYWJlbDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDYWNoZUluc2lnaHRzSW5wdXQge1xuXHRyZWFkb25seSBhTW9kZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgYk1vZGVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGFTeXN0ZW06IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgYlN5c3RlbTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBhVG9vbHM6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgYlRvb2xzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGFNZXNzYWdlczogcmVhZG9ubHkgSU5vcm1hbGl6ZWRNZXNzYWdlW107XG5cdHJlYWRvbmx5IGJNZXNzYWdlczogcmVhZG9ubHkgSU5vcm1hbGl6ZWRNZXNzYWdlW107XG5cdHJlYWRvbmx5IGRpZmY6IElDYWNoZURpZmZSZXN1bHQ7XG5cdHJlYWRvbmx5IG9wdGlvbnNEaWZmOiByZWFkb25seSBJQ2FjaGVJbnNpZ2h0T3B0aW9uRGVsdGFbXTtcblx0LyoqIENhY2hlIGhpdCBwZXJjZW50YWdlICgwLTEwMCkgcmVwb3J0ZWQgZm9yIHRoZSBjdXJyZW50IHJlcXVlc3QuICovXG5cdHJlYWRvbmx5IGhpdFBjdDogbnVtYmVyO1xuXHQvKiogVG90YWwgaW5wdXQgdG9rZW5zIHJlcG9ydGVkIGZvciB0aGUgY3VycmVudCByZXF1ZXN0ICgwIHdoZW4gdW5rbm93bikuICovXG5cdHJlYWRvbmx5IGlucHV0VG9rZW5zOiBudW1iZXI7XG5cdC8qKiBNaW51dGVzIGVsYXBzZWQgYmV0d2VlbiB0aGUgc3RhcnQgb2YgdGhlIHByZXZpb3VzIGFuZCB0aGUgY3VycmVudCByZXF1ZXN0LiAqL1xuXHRyZWFkb25seSBtaW51dGVzU2luY2VQcmV2aW91czogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHQvKiogVHJ1ZSB3aGVuIHRoZSBjdXJyZW50IHJlcXVlc3QgaXMgYSBSZXNwb25zZXMgQVBJIGNvbnRpbnVhdGlvbiAoZGVsdGEtb25seSB3aXJlIGlucHV0KS4gKi9cblx0cmVhZG9ubHkgaXNDb250aW51YXRpb246IGJvb2xlYW47XG5cdC8qKiBUcnVlIHdoZW4gdGhlIHByZXZpb3VzIHJlcXVlc3QgaXMgYSBSZXNwb25zZXMgQVBJIGNvbnRpbnVhdGlvbi4gKi9cblx0cmVhZG9ubHkgcHJldmlvdXNJc0NvbnRpbnVhdGlvbjogYm9vbGVhbjtcblx0LyoqIEZhbHNlIHdoZW4gbWVzc2FnZS1sZXZlbCBwb3NpdGlvbmFsIGRpZmZpbmcgaXMgc3VwcHJlc3NlZCAoZWl0aGVyIHNpZGUgaXMgYSBjb250aW51YXRpb24pLiAqL1xuXHRyZWFkb25seSBjb21wYXJlSW5wdXRNZXNzYWdlczogYm9vbGVhbjtcbn1cblxuLyoqIEhvdyB0d28gdW5lcXVhbCBzdHJpbmdzIHJlbGF0ZSB0byBlYWNoIG90aGVyIHN0cnVjdHVyYWxseS4gKi9cbmV4cG9ydCBjb25zdCBlbnVtIFN0cmluZ0RpdmVyZ2VuY2VTaGFwZSB7XG5cdC8qKiBCIGlzIGEgc3RyaWN0IHN1ZmZpeCBvZiBBIFx1MjAxNCBsZWFkaW5nIGJ5dGVzIHdlcmUgcmVtb3ZlZC4gKi9cblx0TGVhZGluZ1JlbW92ZWQgPSAnbGVhZGluZ1JlbW92ZWQnLFxuXHQvKiogQSBpcyBhIHN0cmljdCBzdWZmaXggb2YgQiBcdTIwMTQgYnl0ZXMgd2VyZSBwcmVwZW5kZWQuICovXG5cdExlYWRpbmdBZGRlZCA9ICdsZWFkaW5nQWRkZWQnLFxuXHQvKiogQiBpcyBhIHN0cmljdCBwcmVmaXggb2YgQSBcdTIwMTQgdHJhaWxpbmcgYnl0ZXMgd2VyZSByZW1vdmVkLiAqL1xuXHRUcmFpbGluZ1JlbW92ZWQgPSAndHJhaWxpbmdSZW1vdmVkJyxcblx0LyoqIEEgaXMgYSBzdHJpY3QgcHJlZml4IG9mIEIgXHUyMDE0IGJ5dGVzIHdlcmUgYXBwZW5kZWQuICovXG5cdFRyYWlsaW5nQWRkZWQgPSAndHJhaWxpbmdBZGRlZCcsXG5cdC8qKiBUaGUgY2hhbmdlIGhhcHBlbnMgc29tZXdoZXJlIGluIHRoZSBtaWRkbGUuICovXG5cdElubmVyRWRpdCA9ICdpbm5lckVkaXQnLFxufVxuXG4vKiogTWF4aW11bSBleGNlcnB0IGxlbmd0aCBjYXB0dXJlZCBmb3IgdGhlIGNoYW5nZWQgcmVnaW9uIG9uIGVhY2ggc2lkZS4gKi9cbmNvbnN0IENIQU5HRURfRVhDRVJQVF9DQVAgPSAxMjA7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN0cmluZ0RpdmVyZ2VuY2Uge1xuXHRyZWFkb25seSBzaGFwZTogU3RyaW5nRGl2ZXJnZW5jZVNoYXBlO1xuXHQvKiogTnVtYmVyIG9mIGxlYWRpbmcgY2hhcnMgc2hhcmVkIGJ5IGJvdGggc2lkZXMuICovXG5cdHJlYWRvbmx5IGNvbW1vblByZWZpeDogbnVtYmVyO1xuXHQvKiogTnVtYmVyIG9mIHRyYWlsaW5nIGNoYXJzIHNoYXJlZCBieSBib3RoIHNpZGVzIChkaXNqb2ludCBmcm9tIHRoZSBwcmVmaXgpLiAqL1xuXHRyZWFkb25seSBjb21tb25TdWZmaXg6IG51bWJlcjtcblx0cmVhZG9ubHkgYUxlbmd0aDogbnVtYmVyO1xuXHRyZWFkb25seSBiTGVuZ3RoOiBudW1iZXI7XG5cdC8qKiBFeGNlcnB0IG9mIHRoZSBjaGFuZ2VkIHJlZ2lvbiBvbiB0aGUgQSBzaWRlIChjYXBwZWQpLiAqL1xuXHRyZWFkb25seSBhQ2hhbmdlZDogc3RyaW5nO1xuXHQvKiogRXhjZXJwdCBvZiB0aGUgY2hhbmdlZCByZWdpb24gb24gdGhlIEIgc2lkZSAoY2FwcGVkKS4gKi9cblx0cmVhZG9ubHkgYkNoYW5nZWQ6IHN0cmluZztcbn1cblxuLyoqXG4gKiBMb2NhdGUgd2hlcmUgdHdvIHN0cmluZ3MgZGl2ZXJnZTogdGhlIHNoYXJlZCBsZWFkaW5nL3RyYWlsaW5nIHNwYW5zIGFuZFxuICogdGhlIGNoYW5nZWQgcmVnaW9uIGluIGJldHdlZW4uIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgc3RyaW5ncyBhcmVcbiAqIGVxdWFsLiBUaGUgY29tbW9uIHByZWZpeCBhbmQgc3VmZml4IG5ldmVyIG92ZXJsYXAsIHNvXG4gKiBgY29tbW9uUHJlZml4ICsgY29tbW9uU3VmZml4IDw9IG1pbihhTGVuZ3RoLCBiTGVuZ3RoKWAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhbmFseXplU3RyaW5nRGl2ZXJnZW5jZShhOiBzdHJpbmcsIGI6IHN0cmluZyk6IElTdHJpbmdEaXZlcmdlbmNlIHwgdW5kZWZpbmVkIHtcblx0aWYgKGEgPT09IGIpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGFMZW5ndGggPSBhLmxlbmd0aDtcblx0Y29uc3QgYkxlbmd0aCA9IGIubGVuZ3RoO1xuXHRjb25zdCBtaW5MZW5ndGggPSBNYXRoLm1pbihhTGVuZ3RoLCBiTGVuZ3RoKTtcblx0bGV0IGNvbW1vblByZWZpeCA9IDA7XG5cdHdoaWxlIChjb21tb25QcmVmaXggPCBtaW5MZW5ndGggJiYgYS5jaGFyQ29kZUF0KGNvbW1vblByZWZpeCkgPT09IGIuY2hhckNvZGVBdChjb21tb25QcmVmaXgpKSB7XG5cdFx0Y29tbW9uUHJlZml4Kys7XG5cdH1cblx0bGV0IGNvbW1vblN1ZmZpeCA9IDA7XG5cdHdoaWxlIChjb21tb25TdWZmaXggPCBtaW5MZW5ndGggLSBjb21tb25QcmVmaXggJiYgYS5jaGFyQ29kZUF0KGFMZW5ndGggLSAxIC0gY29tbW9uU3VmZml4KSA9PT0gYi5jaGFyQ29kZUF0KGJMZW5ndGggLSAxIC0gY29tbW9uU3VmZml4KSkge1xuXHRcdGNvbW1vblN1ZmZpeCsrO1xuXHR9XG5cblx0bGV0IHNoYXBlOiBTdHJpbmdEaXZlcmdlbmNlU2hhcGU7XG5cdGlmIChjb21tb25QcmVmaXggPT09IGJMZW5ndGggJiYgYkxlbmd0aCA8IGFMZW5ndGgpIHtcblx0XHRzaGFwZSA9IFN0cmluZ0RpdmVyZ2VuY2VTaGFwZS5UcmFpbGluZ1JlbW92ZWQ7XG5cdH0gZWxzZSBpZiAoY29tbW9uUHJlZml4ID09PSBhTGVuZ3RoICYmIGFMZW5ndGggPCBiTGVuZ3RoKSB7XG5cdFx0c2hhcGUgPSBTdHJpbmdEaXZlcmdlbmNlU2hhcGUuVHJhaWxpbmdBZGRlZDtcblx0fSBlbHNlIGlmIChjb21tb25TdWZmaXggPT09IGJMZW5ndGggJiYgYkxlbmd0aCA8IGFMZW5ndGgpIHtcblx0XHRzaGFwZSA9IFN0cmluZ0RpdmVyZ2VuY2VTaGFwZS5MZWFkaW5nUmVtb3ZlZDtcblx0fSBlbHNlIGlmIChjb21tb25TdWZmaXggPT09IGFMZW5ndGggJiYgYUxlbmd0aCA8IGJMZW5ndGgpIHtcblx0XHRzaGFwZSA9IFN0cmluZ0RpdmVyZ2VuY2VTaGFwZS5MZWFkaW5nQWRkZWQ7XG5cdH0gZWxzZSB7XG5cdFx0c2hhcGUgPSBTdHJpbmdEaXZlcmdlbmNlU2hhcGUuSW5uZXJFZGl0O1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRzaGFwZSxcblx0XHRjb21tb25QcmVmaXgsXG5cdFx0Y29tbW9uU3VmZml4LFxuXHRcdGFMZW5ndGgsXG5cdFx0Ykxlbmd0aCxcblx0XHRhQ2hhbmdlZDogYS5zdWJzdHJpbmcoY29tbW9uUHJlZml4LCBhTGVuZ3RoIC0gY29tbW9uU3VmZml4KS5zbGljZSgwLCBDSEFOR0VEX0VYQ0VSUFRfQ0FQKSxcblx0XHRiQ2hhbmdlZDogYi5zdWJzdHJpbmcoY29tbW9uUHJlZml4LCBiTGVuZ3RoIC0gY29tbW9uU3VmZml4KS5zbGljZSgwLCBDSEFOR0VEX0VYQ0VSUFRfQ0FQKSxcblx0fTtcbn1cblxuLyoqIE9uZS1saW5lIGh1bWFuLXJlYWRhYmxlIGRlc2NyaXB0aW9uIG9mIGEgc3RyaW5nIGRpdmVyZ2VuY2UuICovXG5leHBvcnQgZnVuY3Rpb24gZGVzY3JpYmVTdHJpbmdEaXZlcmdlbmNlKGQ6IElTdHJpbmdEaXZlcmdlbmNlKTogc3RyaW5nIHtcblx0c3dpdGNoIChkLnNoYXBlKSB7XG5cdFx0Y2FzZSBTdHJpbmdEaXZlcmdlbmNlU2hhcGUuVHJhaWxpbmdBZGRlZDpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmRpdi5hcHBlbmRlZCcsIFwiezB9IGNoYXJzIGFwcGVuZGVkIFx1MjAxNCB0aGUgcHJldmlvdXMgY29udGVudCBzdXJ2aXZlcyBhcyBhIHNoYXJlZCBwcmVmaXhcIiwgZm10KGQuYkxlbmd0aCAtIGQuYUxlbmd0aCkpO1xuXHRcdGNhc2UgU3RyaW5nRGl2ZXJnZW5jZVNoYXBlLlRyYWlsaW5nUmVtb3ZlZDpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmRpdi50cnVuY2F0ZWQnLCBcImxhc3QgezB9IGNoYXJzIHJlbW92ZWQgXHUyMDE0IHRoZSByZW1haW5pbmcgY29udGVudCBzdGlsbCBtYXRjaGVzIHRoZSBwcmV2aW91cyBieXRlc1wiLCBmbXQoZC5hTGVuZ3RoIC0gZC5iTGVuZ3RoKSk7XG5cdFx0Y2FzZSBTdHJpbmdEaXZlcmdlbmNlU2hhcGUuTGVhZGluZ0FkZGVkOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuZGl2LnByZXBlbmRlZCcsIFwiezB9IGNoYXJzIHByZXBlbmRlZCBcdTIwMTQgdGhpcyBibG9jayBubyBsb25nZXIgc3RhcnRzIHdpdGggdGhlIHNhbWUgYnl0ZXNcIiwgZm10KGQuYkxlbmd0aCAtIGQuYUxlbmd0aCkpO1xuXHRcdGNhc2UgU3RyaW5nRGl2ZXJnZW5jZVNoYXBlLkxlYWRpbmdSZW1vdmVkOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuZGl2LmxlYWRpbmdSZW1vdmVkJywgXCJmaXJzdCB7MH0gY2hhcnMgcmVtb3ZlZCBcdTIwMTQgdGhpcyBibG9jayBubyBsb25nZXIgc3RhcnRzIHdpdGggdGhlIHNhbWUgYnl0ZXNcIiwgZm10KGQuYUxlbmd0aCAtIGQuYkxlbmd0aCkpO1xuXHRcdGNhc2UgU3RyaW5nRGl2ZXJnZW5jZVNoYXBlLklubmVyRWRpdDpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmRpdi5pbm5lckVkaXQnLCBcImVkaXRlZCBpbiBwbGFjZSBcdTIwMTQgZmlyc3QgZGlmZmVyZW5jZSBhdCBjaGFyIHswfSAoezF9IGxlYWRpbmcgYW5kIHsyfSB0cmFpbGluZyBjaGFycyB1bmNoYW5nZWQpXCIsIGZtdChkLmNvbW1vblByZWZpeCksIGZtdChkLmNvbW1vblByZWZpeCksIGZtdChkLmNvbW1vblN1ZmZpeCkpO1xuXHR9XG59XG5cbi8qKiBDYXRlZ29yaWVzIG9mIHZvbGF0aWxlIHZhbHVlcyB0aGF0IGNsYXNzaWNhbGx5IGJyZWFrIHByb21wdCBjYWNoZXMuICovXG5leHBvcnQgY29uc3QgZW51bSBWb2xhdGlsZVZhbHVlS2luZCB7XG5cdFRpbWVzdGFtcCA9ICd0aW1lc3RhbXAnLFxuXHRVdWlkID0gJ3V1aWQnLFxuXHRDb3VudGVyID0gJ2NvdW50ZXInLFxufVxuXG5pbnRlcmZhY2UgSVZvbGF0aWxlUGF0dGVybiB7XG5cdHJlYWRvbmx5IGtpbmQ6IFZvbGF0aWxlVmFsdWVLaW5kO1xuXHRyZWFkb25seSByZTogUmVnRXhwO1xufVxuXG5jb25zdCBWT0xBVElMRV9QQVRURVJOUzogcmVhZG9ubHkgSVZvbGF0aWxlUGF0dGVybltdID0gW1xuXHR7IGtpbmQ6IFZvbGF0aWxlVmFsdWVLaW5kLlV1aWQsIHJlOiAvXFxiWzAtOWEtZkEtRl17OH0tWzAtOWEtZkEtRl17NH0tWzAtOWEtZkEtRl17NH0tWzAtOWEtZkEtRl17NH0tWzAtOWEtZkEtRl17MTJ9XFxiLyB9LFxuXHR7IGtpbmQ6IFZvbGF0aWxlVmFsdWVLaW5kLlRpbWVzdGFtcCwgcmU6IC9cXGJcXGR7NH0tXFxkezJ9LVxcZHsyfSg/OltUIF1cXGR7Mn06XFxkezJ9KD86OlxcZHsyfSk/KT9cXGIvIH0sXG5cdHsga2luZDogVm9sYXRpbGVWYWx1ZUtpbmQuVGltZXN0YW1wLCByZTogL1xcYlxcZHsxLDJ9OlxcZHsyfTpcXGR7Mn1cXGIvIH0sXG5cdHsga2luZDogVm9sYXRpbGVWYWx1ZUtpbmQuQ291bnRlciwgcmU6IC9cXGJcXGR7MTAsMTN9XFxiLyB9LFxuXTtcblxuLyoqXG4gKiBEZXRlY3Qgd2hldGhlciB0aGUgY2hhbmdlZCByZWdpb24gb24gYm90aCBzaWRlcyBjYXJyaWVzIHRoZSAqc2FtZSBraW5kKiBvZlxuICogdm9sYXRpbGUgdmFsdWUgKHRpbWVzdGFtcCwgVVVJRCwgZXBvY2gtbGlrZSBjb3VudGVyKSB3aXRoICpkaWZmZXJlbnQqXG4gKiBjb250ZW50cyBcdTIwMTQgdGhlIGNsYXNzaWMgc2lsZW50IGNhY2hlIGludmFsaWRhdG9yOiBgZGF0ZXRpbWUubm93KClgIG9yIGFcbiAqIHJlcXVlc3QgaWQgaW50ZXJwb2xhdGVkIGludG8gdGhlIHByb21wdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRldGVjdFZvbGF0aWxlVmFsdWUoYUNoYW5nZWQ6IHN0cmluZywgYkNoYW5nZWQ6IHN0cmluZyk6IFZvbGF0aWxlVmFsdWVLaW5kIHwgdW5kZWZpbmVkIHtcblx0Zm9yIChjb25zdCB7IGtpbmQsIHJlIH0gb2YgVk9MQVRJTEVfUEFUVEVSTlMpIHtcblx0XHRjb25zdCBhTWF0Y2ggPSByZS5leGVjKGFDaGFuZ2VkKT8uWzBdO1xuXHRcdGNvbnN0IGJNYXRjaCA9IHJlLmV4ZWMoYkNoYW5nZWQpPy5bMF07XG5cdFx0aWYgKGFNYXRjaCAhPT0gdW5kZWZpbmVkICYmIGJNYXRjaCAhPT0gdW5kZWZpbmVkICYmIGFNYXRjaCAhPT0gYk1hdGNoKSB7XG5cdFx0XHRyZXR1cm4ga2luZDtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuLyoqIENvbnRleHQga2VwdCBhcm91bmQgdGhlIGNoYW5nZWQgcmVnaW9uIHdoZW4gc2Nhbm5pbmcgZm9yIHZvbGF0aWxlIHZhbHVlcy4gKi9cbmNvbnN0IFZPTEFUSUxFX0NPTlRFWFQgPSAyNDtcbi8qKiBDYXAgb24gdGhlIHNjYW5uZWQgd2luZG93IHNvIGh1Z2UgZWRpdHMgc3RheSBjaGVhcCB0byByZWdleC4gKi9cbmNvbnN0IFZPTEFUSUxFX1dJTkRPV19DQVAgPSAyNDA7XG5cbi8qKlxuICogUnVuIHZvbGF0aWxlLXZhbHVlIGRldGVjdGlvbiBvbiBhIHdpbmRvdyAqYXJvdW5kKiB0aGUgY2hhbmdlZCByZWdpb24gb2ZcbiAqIGVhY2ggc2lkZS4gVGhlIHNoYXJlZCBwcmVmaXggb2Z0ZW4gZWF0cyB0aGUgaGVhZCBvZiBhIHZvbGF0aWxlIHZhbHVlXG4gKiAoYDA5OjE1OjAwYCB2cyBgMDk6MjE6NDJgIGRpdmVyZ2VzIGFmdGVyIGAwOTpgKSwgc28gbWF0Y2hpbmcgb25seSB0aGVcbiAqIGNoYW5nZWQgYnl0ZXMgd291bGQgbWlzcyB0aGUgcGF0dGVybjsgdGhlIHN1cnJvdW5kaW5nIGNvbnRleHQgcmVzdG9yZXMgaXQuXG4gKiBJZGVudGljYWwgdmFsdWVzIGluc2lkZSB0aGUgY29udGV4dCAoZS5nLiB0aGUgc2FtZSBkYXRlIG9uIGJvdGggc2lkZXMpXG4gKiBhcmUgaWdub3JlZCBiZWNhdXNlIHtAbGluayBkZXRlY3RWb2xhdGlsZVZhbHVlfSByZXF1aXJlcyB0aGUgbWF0Y2hlZFxuICogdmFsdWVzIHRvIGRpZmZlci5cbiAqL1xuZnVuY3Rpb24gZGV0ZWN0Vm9sYXRpbGVWYWx1ZUFyb3VuZChhOiBzdHJpbmcsIGI6IHN0cmluZywgZHY6IElTdHJpbmdEaXZlcmdlbmNlKTogVm9sYXRpbGVWYWx1ZUtpbmQgfCB1bmRlZmluZWQge1xuXHRjb25zdCBzdGFydCA9IE1hdGgubWF4KDAsIGR2LmNvbW1vblByZWZpeCAtIFZPTEFUSUxFX0NPTlRFWFQpO1xuXHRjb25zdCBhV2luZG93ID0gYS5zdWJzdHJpbmcoc3RhcnQsIE1hdGgubWluKGR2LmFMZW5ndGggLSBkdi5jb21tb25TdWZmaXggKyBWT0xBVElMRV9DT05URVhULCBzdGFydCArIFZPTEFUSUxFX1dJTkRPV19DQVApKTtcblx0Y29uc3QgYldpbmRvdyA9IGIuc3Vic3RyaW5nKHN0YXJ0LCBNYXRoLm1pbihkdi5iTGVuZ3RoIC0gZHYuY29tbW9uU3VmZml4ICsgVk9MQVRJTEVfQ09OVEVYVCwgc3RhcnQgKyBWT0xBVElMRV9XSU5ET1dfQ0FQKSk7XG5cdHJldHVybiBkZXRlY3RWb2xhdGlsZVZhbHVlKGFXaW5kb3csIGJXaW5kb3cpO1xufVxuXG5mdW5jdGlvbiB2b2xhdGlsZVZhbHVlTGFiZWwoa2luZDogVm9sYXRpbGVWYWx1ZUtpbmQpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKGtpbmQpIHtcblx0XHRjYXNlIFZvbGF0aWxlVmFsdWVLaW5kLlRpbWVzdGFtcDogcmV0dXJuIGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUudm9sYXRpbGUudGltZXN0YW1wJywgXCJ0aW1lc3RhbXBcIik7XG5cdFx0Y2FzZSBWb2xhdGlsZVZhbHVlS2luZC5VdWlkOiByZXR1cm4gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS52b2xhdGlsZS51dWlkJywgXCJ1bmlxdWUgaWQgKFVVSUQpXCIpO1xuXHRcdGNhc2UgVm9sYXRpbGVWYWx1ZUtpbmQuQ291bnRlcjogcmV0dXJuIGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUudm9sYXRpbGUuY291bnRlcicsIFwibGFyZ2UgY2hhbmdpbmcgbnVtYmVyXCIpO1xuXHR9XG59XG5cbi8qKiBTdHJ1Y3R1cmVkIGNvbXBhcmlzb24gb2YgdHdvIEpTT04gdG9vbCBjYXRhbG9ncy4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVRvb2xDYXRhbG9nRGVsdGEge1xuXHRyZWFkb25seSBhZGRlZDogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IHJlbW92ZWQ6IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHQvKiogVG9vbHMgcHJlc2VudCBvbiBib3RoIHNpZGVzIHdob3NlIGRlZmluaXRpb24gYnl0ZXMgZGlmZmVyLiAqL1xuXHRyZWFkb25seSBtb2RpZmllZDogcmVhZG9ubHkgc3RyaW5nW107XG5cdC8qKiBUcnVlIHdoZW4gdGhlIHNldCBhbmQgZXZlcnkgZGVmaW5pdGlvbiBtYXRjaCBcdTIwMTQgb25seSB0aGUgb3JkZXIgZGlmZmVycy4gKi9cblx0cmVhZG9ubHkgcmVvcmRlcmVkT25seTogYm9vbGVhbjtcblx0cmVhZG9ubHkgYUNvdW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IGJDb3VudDogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBwYXJzZVRvb2xMaXN0KHRvb2xzSnNvbjogc3RyaW5nIHwgdW5kZWZpbmVkKTogTWFwPHN0cmluZywgc3RyaW5nPiB8IHVuZGVmaW5lZCB7XG5cdGlmICghdG9vbHNKc29uKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRsZXQgcmF3OiB1bmtub3duO1xuXHR0cnkge1xuXHRcdHJhdyA9IEpTT04ucGFyc2UodG9vbHNKc29uKTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAoIUFycmF5LmlzQXJyYXkocmF3KSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3Qgb3V0ID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCByYXcubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBpdGVtID0gcmF3W2ldIGFzIHsgbmFtZT86IHVua25vd247IHR5cGU/OiB1bmtub3duOyBmdW5jdGlvbj86IHsgbmFtZT86IHVua25vd24gfSB9IHwgbnVsbDtcblx0XHRjb25zdCBuYW1lID1cblx0XHRcdChpdGVtICYmIHR5cGVvZiBpdGVtLm5hbWUgPT09ICdzdHJpbmcnICYmIGl0ZW0ubmFtZSkgfHxcblx0XHRcdChpdGVtICYmIGl0ZW0uZnVuY3Rpb24gJiYgdHlwZW9mIGl0ZW0uZnVuY3Rpb24ubmFtZSA9PT0gJ3N0cmluZycgJiYgaXRlbS5mdW5jdGlvbi5uYW1lKSB8fFxuXHRcdFx0KGl0ZW0gJiYgdHlwZW9mIGl0ZW0udHlwZSA9PT0gJ3N0cmluZycgJiYgaXRlbS50eXBlKSB8fFxuXHRcdFx0YCMke2l9YDtcblx0XHRsZXQgc2VyaWFsaXplZDogc3RyaW5nO1xuXHRcdHRyeSB7XG5cdFx0XHRzZXJpYWxpemVkID0gSlNPTi5zdHJpbmdpZnkoaXRlbSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRzZXJpYWxpemVkID0gU3RyaW5nKGl0ZW0pO1xuXHRcdH1cblx0XHQvLyBDb2xsaXNpb25zIChkdXBsaWNhdGUgbmFtZXMpIGNvbmNhdGVuYXRlIHNvIGEgZHVwbGljYXRlZCBlbnRyeSBzdGlsbFxuXHRcdC8vIHJlYWRzIGFzIGEgbW9kaWZpY2F0aW9uIHJhdGhlciB0aGFuIHNpbGVudGx5IG1hdGNoaW5nLlxuXHRcdG91dC5zZXQobmFtZSwgKG91dC5nZXQobmFtZSkgPz8gJycpICsgc2VyaWFsaXplZCk7XG5cdH1cblx0cmV0dXJuIG91dDtcbn1cblxuLyoqXG4gKiBDb21wYXJlIHR3byB0b29sIGNhdGFsb2dzIGF0IHRoZSB0b29sIGxldmVsOiB3aGljaCB0b29scyB3ZXJlIGFkZGVkLFxuICogcmVtb3ZlZCwgb3IgaGFkIHRoZWlyIGRlZmluaXRpb24gY2hhbmdlIFx1MjAxNCBvciB3aGV0aGVyIHRoZSBjYXRhbG9nIHdhc1xuICogbWVyZWx5IHJlb3JkZXJlZCAoc2FtZSB0b29scywgc2FtZSBieXRlcywgZGlmZmVyZW50IG9yZGVyKS4gUmV0dXJuc1xuICogYHVuZGVmaW5lZGAgd2hlbiBlaXRoZXIgc2lkZSBpc24ndCBhIHBhcnNlYWJsZSBKU09OIGFycmF5LCBpbiB3aGljaCBjYXNlXG4gKiBjYWxsZXJzIHNob3VsZCBmYWxsIGJhY2sgdG8gYnl0ZS1sZXZlbCBkaXZlcmdlbmNlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYW5hbHl6ZVRvb2xDYXRhbG9nKGFUb29sczogc3RyaW5nIHwgdW5kZWZpbmVkLCBiVG9vbHM6IHN0cmluZyB8IHVuZGVmaW5lZCk6IElUb29sQ2F0YWxvZ0RlbHRhIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgYSA9IHBhcnNlVG9vbExpc3QoYVRvb2xzKTtcblx0Y29uc3QgYiA9IHBhcnNlVG9vbExpc3QoYlRvb2xzKTtcblx0aWYgKCFhIHx8ICFiKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBhZGRlZDogc3RyaW5nW10gPSBbXTtcblx0Y29uc3QgcmVtb3ZlZDogc3RyaW5nW10gPSBbXTtcblx0Y29uc3QgbW9kaWZpZWQ6IHN0cmluZ1tdID0gW107XG5cdGZvciAoY29uc3QgW25hbWUsIGRlZl0gb2YgYikge1xuXHRcdGNvbnN0IGFEZWYgPSBhLmdldChuYW1lKTtcblx0XHRpZiAoYURlZiA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRhZGRlZC5wdXNoKG5hbWUpO1xuXHRcdH0gZWxzZSBpZiAoYURlZiAhPT0gZGVmKSB7XG5cdFx0XHRtb2RpZmllZC5wdXNoKG5hbWUpO1xuXHRcdH1cblx0fVxuXHRmb3IgKGNvbnN0IG5hbWUgb2YgYS5rZXlzKCkpIHtcblx0XHRpZiAoIWIuaGFzKG5hbWUpKSB7XG5cdFx0XHRyZW1vdmVkLnB1c2gobmFtZSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB7XG5cdFx0YWRkZWQsXG5cdFx0cmVtb3ZlZCxcblx0XHRtb2RpZmllZCxcblx0XHRyZW9yZGVyZWRPbmx5OiBhZGRlZC5sZW5ndGggPT09IDAgJiYgcmVtb3ZlZC5sZW5ndGggPT09IDAgJiYgbW9kaWZpZWQubGVuZ3RoID09PSAwLFxuXHRcdGFDb3VudDogYS5zaXplLFxuXHRcdGJDb3VudDogYi5zaXplLFxuXHR9O1xufVxuXG5jb25zdCBzZXZlcml0eVJhbms6IFJlY29yZDxDYWNoZUluc2lnaHRTZXZlcml0eSwgbnVtYmVyPiA9IHtcblx0W0NhY2hlSW5zaWdodFNldmVyaXR5Lk9rXTogMCxcblx0W0NhY2hlSW5zaWdodFNldmVyaXR5LkluZm9dOiAxLFxuXHRbQ2FjaGVJbnNpZ2h0U2V2ZXJpdHkuV2FybmluZ106IDIsXG5cdFtDYWNoZUluc2lnaHRTZXZlcml0eS5Dcml0aWNhbF06IDMsXG59O1xuXG4vKiogVGhlIGhpZ2hlc3Qgc2V2ZXJpdHkgcHJlc2VudCBpbiBhIGZpbmRpbmdzIGxpc3QgKE9rIHdoZW4gZW1wdHkpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1heEluc2lnaHRTZXZlcml0eShpbnNpZ2h0czogcmVhZG9ubHkgSUNhY2hlSW5zaWdodFtdKTogQ2FjaGVJbnNpZ2h0U2V2ZXJpdHkge1xuXHRsZXQgbWF4ID0gQ2FjaGVJbnNpZ2h0U2V2ZXJpdHkuT2s7XG5cdGZvciAoY29uc3QgaSBvZiBpbnNpZ2h0cykge1xuXHRcdGlmIChzZXZlcml0eVJhbmtbaS5zZXZlcml0eV0gPiBzZXZlcml0eVJhbmtbbWF4XSkge1xuXHRcdFx0bWF4ID0gaS5zZXZlcml0eTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIG1heDtcbn1cblxuLyoqIFRoZSBmaXJzdCB3YXJuaW5nLW9yLXdvcnNlIGZpbmRpbmcgXHUyMDE0IHRoZSBoZWFkbGluZSB2ZXJkaWN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByaW1hcnlJbnNpZ2h0KGluc2lnaHRzOiByZWFkb25seSBJQ2FjaGVJbnNpZ2h0W10pOiBJQ2FjaGVJbnNpZ2h0IHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIGluc2lnaHRzLmZpbmQoaSA9PiBpLnNldmVyaXR5ID09PSBDYWNoZUluc2lnaHRTZXZlcml0eS5Dcml0aWNhbClcblx0XHQ/PyBpbnNpZ2h0cy5maW5kKGkgPT4gaS5zZXZlcml0eSA9PT0gQ2FjaGVJbnNpZ2h0U2V2ZXJpdHkuV2FybmluZyk7XG59XG5cbi8qKiBDYWNoZSBoaXQgYmVsb3cgdGhpcyBpcyB0cmVhdGVkIGFzIFwidGhlIGNhY2hlIGVmZmVjdGl2ZWx5IG1pc3NlZFwiLiAqL1xuY29uc3QgRUZGRUNUSVZFX01JU1NfUENUID0gMTtcbi8qKiBUeXBpY2FsIHByb3ZpZGVyIHByb21wdC1jYWNoZSBUVEwsIHVzZWQgaW4gdGhlIGV4cGlyYXRpb24gaGludC4gKi9cbmNvbnN0IFRZUElDQUxfVFRMX01JTlVURVMgPSA1O1xuLyoqXG4gKiBNb3N0IHByb3ZpZGVycyBvbmx5IHdhbGsgYmFjayBhIGJvdW5kZWQgbnVtYmVyIG9mIGNvbnRlbnQgYmxvY2tzIHRvIGZpbmRcbiAqIGEgcHJpb3IgY2FjaGUgZW50cnkgKH4yMCBvbiBBbnRocm9waWMpOyBhcHBlbmRpbmcgbW9yZSB0aGFuIHRoaXMgaW4gb25lXG4gKiB0dXJuIGNhbiBzaWxlbnRseSBtaXNzIHRoZSBjYWNoZS5cbiAqL1xuY29uc3QgTE9PS0JBQ0tfV0lORE9XX0JMT0NLUyA9IDIwO1xuLyoqXG4gKiBVcHBlciBib3VuZCBvZiB0aGUgcGVyLW1vZGVsIG1pbmltdW0gY2FjaGVhYmxlIHByZWZpeCBzaXplICgxLDAyNC00LDA5NlxuICogdG9rZW5zIGRlcGVuZGluZyBvbiBtb2RlbCkuIFByb21wdHMgYmVsb3cgdGhpcyBtYXkgc2lsZW50bHkgbmV2ZXIgY2FjaGUuXG4gKi9cbmNvbnN0IE1JTl9DQUNIRUFCTEVfVE9LRU5TID0gNDA5NjtcblxuLyoqXG4gKiBQcm9kdWNlIHRoZSBvcmRlcmVkIGZpbmRpbmdzIGxpc3QgZm9yIGFuIEFcdTIxOTJCIHJlcXVlc3QgY29tcGFyaXNvbi5cbiAqXG4gKiBGaW5kaW5ncyBhcmUgZW1pdHRlZCBpbiBwcm92aWRlciBjYWNoZS1rZXkgb3JkZXIgKG1vZGVsLCB0b29scywgc3lzdGVtLFxuICogb3B0aW9ucywgbWVzc2FnZXMpIHNvIHRoZSBmaXJzdCBjcml0aWNhbCBmaW5kaW5nIGlzIHRoZSBlYXJsaWVzdCBieXRlXG4gKiBjaGFuZ2UgXHUyMDE0IHRoZSBvbmUgdGhhdCBhY3R1YWxseSBicm9rZSB0aGUgY2FjaGU7IGxhdGVyIGNoYW5nZXMgYXJlXG4gKiByZWNvbXB1dGVkIHJlZ2FyZGxlc3MuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21wdXRlQ2FjaGVJbnNpZ2h0cyhpbnB1dDogSUNhY2hlSW5zaWdodHNJbnB1dCk6IElDYWNoZUluc2lnaHRbXSB7XG5cdGNvbnN0IG91dDogSUNhY2hlSW5zaWdodFtdID0gW107XG5cdGNvbnN0IG1vZGVsQ2hhbmdlZCA9IGlucHV0LmFNb2RlbCAhPT0gaW5wdXQuYk1vZGVsO1xuXHRjb25zdCB0b29sc0NoYW5nZWQgPSAoaW5wdXQuYVRvb2xzID8/ICcnKSAhPT0gKGlucHV0LmJUb29scyA/PyAnJyk7XG5cdGNvbnN0IHN5c3RlbUNoYW5nZWQgPSAoaW5wdXQuYVN5c3RlbSA/PyAnJykgIT09IChpbnB1dC5iU3lzdGVtID8/ICcnKTtcblxuXHRpZiAobW9kZWxDaGFuZ2VkKSB7XG5cdFx0b3V0LnB1c2goe1xuXHRcdFx0c2V2ZXJpdHk6IENhY2hlSW5zaWdodFNldmVyaXR5LkNyaXRpY2FsLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuaW5zaWdodC5tb2RlbC50aXRsZScsIFwiTW9kZWwgY2hhbmdlZFwiKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5pbnNpZ2h0Lm1vZGVsLmRldGFpbCcsIFwiezB9IFx1MjE5MiB7MX1cIiwgaW5wdXQuYU1vZGVsID8/ICdcdTIwMTQnLCBpbnB1dC5iTW9kZWwgPz8gJ1x1MjAxNCcpLFxuXHRcdFx0aGludDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5pbnNpZ2h0Lm1vZGVsLmhpbnQnLCBcIlByb21wdCBjYWNoZXMgYXJlIHNjb3BlZCB0byBhIG1vZGVsIFx1MjAxNCBzd2l0Y2hpbmcgbW9kZWxzIHJlY29tcHV0ZXMgdGhlIGVudGlyZSBwcm9tcHQuIFJvdXRlIHN1Yi10YXNrcyB0aGF0IG5lZWQgYSBkaWZmZXJlbnQgbW9kZWwgdGhyb3VnaCBhIHNlcGFyYXRlIHJlcXVlc3QgY2hhaW4gc28gdGhlIG1haW4gbG9vcCBrZWVwcyBpdHMgY2FjaGUuXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhY2hlQnJlYWtDYXRlZ29yeS5Nb2RlbCxcblx0XHR9KTtcblx0fVxuXG5cdGlmICh0b29sc0NoYW5nZWQpIHtcblx0XHRvdXQucHVzaCh0b29sc0luc2lnaHQoaW5wdXQuYVRvb2xzLCBpbnB1dC5iVG9vbHMpKTtcblx0fVxuXG5cdGlmIChzeXN0ZW1DaGFuZ2VkKSB7XG5cdFx0b3V0LnB1c2goc3lzdGVtSW5zaWdodChpbnB1dC5hU3lzdGVtLCBpbnB1dC5iU3lzdGVtKSk7XG5cdH1cblxuXHRpZiAoaW5wdXQub3B0aW9uc0RpZmYubGVuZ3RoID4gMCkge1xuXHRcdG91dC5wdXNoKHtcblx0XHRcdHNldmVyaXR5OiBDYWNoZUluc2lnaHRTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuaW5zaWdodC5vcHRpb25zLnRpdGxlJywgXCJSZXF1ZXN0IG9wdGlvbnMgY2hhbmdlZFwiKSxcblx0XHRcdGRldGFpbDogaW5wdXQub3B0aW9uc0RpZmYubWFwKGQgPT4gYCR7ZC5rZXl9OiAke2QucHJldmlvdXNMYWJlbH0gXHUyMTkyICR7ZC5jdXJyZW50TGFiZWx9YCkuam9pbignIFx1MDBCNyAnKSxcblx0XHRcdGhpbnQ6IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuaW5zaWdodC5vcHRpb25zLmhpbnQnLCBcIk9wdGlvbnMgYXJlIHBhcnQgb2YgdGhlIGNhY2hlIGtleSBvbiBtb3N0IHByb3ZpZGVycy4gS2VlcCBwZXItcmVxdWVzdCBvcHRpb25zIHN0YWJsZSB3aGVuIGNhY2hlIHJldXNlIG1hdHRlcnMuXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhY2hlQnJlYWtDYXRlZ29yeS5PcHRpb25zLFxuXHRcdH0pO1xuXHR9XG5cblx0aWYgKGlucHV0LmNvbXBhcmVJbnB1dE1lc3NhZ2VzKSB7XG5cdFx0b3V0LnB1c2goLi4ubWVzc2FnZUluc2lnaHRzKGlucHV0LCBtb2RlbENoYW5nZWQgfHwgdG9vbHNDaGFuZ2VkIHx8IHN5c3RlbUNoYW5nZWQpKTtcblx0XHRpZiAoIW1vZGVsQ2hhbmdlZCAmJiAhdG9vbHNDaGFuZ2VkICYmICFzeXN0ZW1DaGFuZ2VkICYmIGlucHV0Lm9wdGlvbnNEaWZmLmxlbmd0aCA9PT0gMCAmJiAhaW5wdXQuZGlmZi5icmVhaykge1xuXHRcdFx0b3V0LnB1c2goc3RhYmxlUHJlZml4SW5zaWdodChpbnB1dCkpO1xuXHRcdH1cblx0fSBlbHNlIGlmIChpbnB1dC5pc0NvbnRpbnVhdGlvbikge1xuXHRcdG91dC5wdXNoKHtcblx0XHRcdHNldmVyaXR5OiBDYWNoZUluc2lnaHRTZXZlcml0eS5JbmZvLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuaW5zaWdodC5jb250aW51YXRpb24udGl0bGUnLCBcIlJlc3BvbnNlcyBBUEkgY29udGludWF0aW9uXCIpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmluc2lnaHQuY29udGludWF0aW9uLmRldGFpbCcsIFwiT25seSB0aGUgd2lyZSBkZWx0YSBpcyBjYXB0dXJlZCBmb3IgdGhpcyByZXF1ZXN0OyBwcmlvciBjb250ZXh0IGlzIHJlZmVyZW5jZWQgYnkgcHJldmlvdXNfcmVzcG9uc2VfaWQgYW5kIHJlY29uc3RydWN0ZWQgcHJvdmlkZXItc2lkZS4gQW5hbHlzaXMgaXMgbGltaXRlZCB0byBzeXN0ZW0sIHRvb2xzLCBhbmQgcmVxdWVzdCBvcHRpb25zLlwiKSxcblx0XHRcdGNhdGVnb3J5OiBDYWNoZUJyZWFrQ2F0ZWdvcnkuVW5rbm93bixcblx0XHR9KTtcblx0fSBlbHNlIGlmIChpbnB1dC5wcmV2aW91c0lzQ29udGludWF0aW9uKSB7XG5cdFx0b3V0LnB1c2goe1xuXHRcdFx0c2V2ZXJpdHk6IENhY2hlSW5zaWdodFNldmVyaXR5LkluZm8sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5pbnNpZ2h0LnByZXZDb250aW51YXRpb24udGl0bGUnLCBcIk1lc3NhZ2UgY29tcGFyaXNvbiBzdXBwcmVzc2VkXCIpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmluc2lnaHQucHJldkNvbnRpbnVhdGlvbi5kZXRhaWwnLCBcIlRoZSBwcmV2aW91cyByZXF1ZXN0IHdhcyBhIFJlc3BvbnNlcyBBUEkgY29udGludWF0aW9uIChkZWx0YS1vbmx5IHdpcmUgaW5wdXQpOyBwb3NpdGlvbmFsbHkgZGlmZmluZyB0aGlzIGZ1bGwgcmVxdWVzdCBhZ2FpbnN0IGl0IHdvdWxkIGJlIG1pc2xlYWRpbmcuXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhY2hlQnJlYWtDYXRlZ29yeS5Vbmtub3duLFxuXHRcdH0pO1xuXHR9XG5cblx0cmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gdG9vbHNJbnNpZ2h0KGFUb29sczogc3RyaW5nIHwgdW5kZWZpbmVkLCBiVG9vbHM6IHN0cmluZyB8IHVuZGVmaW5lZCk6IElDYWNoZUluc2lnaHQge1xuXHRjb25zdCBkZWx0YSA9IGFuYWx5emVUb29sQ2F0YWxvZyhhVG9vbHMsIGJUb29scyk7XG5cdGNvbnN0IGNvbXBvbmVudCA9ICd0b29scyc7XG5cdGlmIChkZWx0YT8ucmVvcmRlcmVkT25seSkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXZlcml0eTogQ2FjaGVJbnNpZ2h0U2V2ZXJpdHkuQ3JpdGljYWwsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5pbnNpZ2h0LnRvb2xzUmVvcmRlci50aXRsZScsIFwiVG9vbCBkZWZpbml0aW9ucyByZW9yZGVyZWRcIiksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuaW5zaWdodC50b29sc1Jlb3JkZXIuZGV0YWlsJywgXCJTYW1lIHswfSB0b29scyB3aXRoIGlkZW50aWNhbCBkZWZpbml0aW9ucywgc2VudCBpbiBhIGRpZmZlcmVudCBvcmRlci5cIiwgZm10KGRlbHRhLmJDb3VudCkpLFxuXHRcdFx0aGludDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5pbnNpZ2h0LnRvb2xzUmVvcmRlci5oaW50JywgXCJUb29scyByZW5kZXIgYXQgdGhlIHZlcnkgc3RhcnQgb2YgdGhlIHByb21wdCBcdTIwMTQgYSBwdXJlIHJlb3JkZXIgc3RpbGwgY2hhbmdlcyB0aGUgYnl0ZXMgYW5kIGludmFsaWRhdGVzIHRoZSBlbnRpcmUgY2FjaGUuIFNlcmlhbGl6ZSB0aGUgdG9vbCBsaXN0IGRldGVybWluaXN0aWNhbGx5IChlLmcuIHNvcnQgYnkgbmFtZSkuXCIpLFxuXHRcdFx0Y29tcG9uZW50LFxuXHRcdFx0Y2F0ZWdvcnk6IENhY2hlQnJlYWtDYXRlZ29yeS5Ub29scyxcblx0XHR9O1xuXHR9XG5cdGlmIChkZWx0YSAmJiAoZGVsdGEuYWRkZWQubGVuZ3RoID4gMCB8fCBkZWx0YS5yZW1vdmVkLmxlbmd0aCA+IDApKSB7XG5cdFx0Y29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKGRlbHRhLmFkZGVkLmxlbmd0aCA+IDApIHtcblx0XHRcdHBhcnRzLnB1c2gobG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5pbnNpZ2h0LnRvb2xzQWRkZWQnLCBcImFkZGVkOiB7MH1cIiwgZGVsdGEuYWRkZWQuam9pbignLCAnKSkpO1xuXHRcdH1cblx0XHRpZiAoZGVsdGEucmVtb3ZlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRwYXJ0cy5wdXNoKGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuaW5zaWdodC50b29sc1JlbW92ZWQnLCBcInJlbW92ZWQ6IHswfVwiLCBkZWx0YS5yZW1vdmVkLmpvaW4oJywgJykpKTtcblx0XHR9XG5cdFx0aWYgKGRlbHRhLm1vZGlmaWVkLmxlbmd0aCA+IDApIHtcblx0XHRcdHBhcnRzLnB1c2gobG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5pbnNpZ2h0LnRvb2xzTW9kaWZpZWQnLCBcIm1vZGlmaWVkOiB7MH1cIiwgZGVsdGEubW9kaWZpZWQuam9pbignLCAnKSkpO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0c2V2ZXJpdHk6IENhY2hlSW5zaWdodFNldmVyaXR5LkNyaXRpY2FsLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuaW5zaWdodC50b29sc1NldC50aXRsZScsIFwiVG9vbCBjYXRhbG9nIGNoYW5nZWQgKHswfSBcdTIxOTIgezF9IHRvb2xzKVwiLCBmbXQoZGVsdGEuYUNvdW50KSwgZm10KGRlbHRhLmJDb3VudCkpLFxuXHRcdFx0ZGV0YWlsOiBwYXJ0cy5qb2luKCcgXHUwMEI3ICcpLFxuXHRcdFx0aGludDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5pbnNpZ2h0LnRvb2xzU2V0LmhpbnQnLCBcIlRvb2wgZGVmaW5pdGlvbnMgcmVuZGVyIGJlZm9yZSBldmVyeXRoaW5nIGVsc2UsIHNvIGFkZGluZyBvciByZW1vdmluZyBhIHRvb2wgbWlkLXNlc3Npb24gaW52YWxpZGF0ZXMgdGhlIHdob2xlIHByb21wdC4gS2VlcCB0aGUgdG9vbCBzZXQgc3RhYmxlIGZvciB0aGUgbGlmZSBvZiBhIHNlc3Npb24sIG9yIHVzZSBkZWZlcnJlZC9hcHBlbmRlZCB0b29sIGxvYWRpbmcgaW5zdGVhZCBvZiBzd2FwcGluZyB0aGUgY2F0YWxvZy5cIiksXG5cdFx0XHRjb21wb25lbnQsXG5cdFx0XHRjYXRlZ29yeTogQ2FjaGVCcmVha0NhdGVnb3J5LlRvb2xzLFxuXHRcdH07XG5cdH1cblx0aWYgKGRlbHRhICYmIGRlbHRhLm1vZGlmaWVkLmxlbmd0aCA+IDApIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2V2ZXJpdHk6IENhY2hlSW5zaWdodFNldmVyaXR5LkNyaXRpY2FsLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuaW5zaWdodC50b29sc0RlZi50aXRsZScsIFwiVG9vbCBkZWZpbml0aW9ucyBtb2RpZmllZFwiKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5pbnNpZ2h0LnRvb2xzRGVmLmRldGFpbCcsIFwiY2hhbmdlZDogezB9XCIsIGRlbHRhLm1vZGlmaWVkLmpvaW4oJywgJykpLFxuXHRcdFx0aGludDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5pbnNpZ2h0LnRvb2xzRGVmLmhpbnQnLCBcIkEgY2hhbmdlZCB0b29sIGRlc2NyaXB0aW9uIG9yIHNjaGVtYSByZXdyaXRlcyB0aGUgcHJvbXB0IGZyb20gdGhlIHRvb2xzIGJsb2NrIG9ud2FyZC4gQ2hlY2sgZm9yIGR5bmFtaWMgY29udGVudCAoY291bnRzLCBwYXRocywgdGltZXN0YW1wcykgaW5zaWRlIHRvb2wgZGVzY3JpcHRpb25zLlwiKSxcblx0XHRcdGNvbXBvbmVudCxcblx0XHRcdGNhdGVnb3J5OiBDYWNoZUJyZWFrQ2F0ZWdvcnkuVG9vbHMsXG5cdFx0fTtcblx0fVxuXHQvLyBOb3QgcGFyc2VhYmxlIGFzIEpTT04gYXJyYXlzIFx1MjAxNCBmYWxsIGJhY2sgdG8gYnl0ZS1sZXZlbCBkaXZlcmdlbmNlLlxuXHRjb25zdCBkdiA9IGFuYWx5emVTdHJpbmdEaXZlcmdlbmNlKGFUb29scyA/PyAnJywgYlRvb2xzID8/ICcnKTtcblx0cmV0dXJuIHtcblx0XHRzZXZlcml0eTogQ2FjaGVJbnNpZ2h0U2V2ZXJpdHkuQ3JpdGljYWwsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuaW5zaWdodC50b29scy50aXRsZScsIFwiVG9vbCBjYXRhbG9nIGNoYW5nZWRcIiksXG5cdFx0ZGV0YWlsOiBkdiA/IGRlc2NyaWJlU3RyaW5nRGl2ZXJnZW5jZShkdikgOiB1bmRlZmluZWQsXG5cdFx0aGludDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5pbnNpZ2h0LnRvb2xzLmhpbnQnLCBcIlRoZSB0b29sIGNhdGFsb2cgaXMgdGhlIGZpcnN0IGJsb2NrIG9mIHRoZSBwcm9tcHQgXHUyMDE0IGFueSBieXRlIGNoYW5nZSBoZXJlIGludmFsaWRhdGVzIHRoZSBlbnRpcmUgY2FjaGUuXCIpLFxuXHRcdGNvbXBvbmVudCxcblx0XHRjYXRlZ29yeTogQ2FjaGVCcmVha0NhdGVnb3J5LlRvb2xzLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBzeXN0ZW1JbnNpZ2h0KGFTeXN0ZW06IHN0cmluZyB8IHVuZGVmaW5lZCwgYlN5c3RlbTogc3RyaW5nIHwgdW5kZWZpbmVkKTogSUNhY2hlSW5zaWdodCB7XG5cdGNvbnN0IGR2ID0gYW5hbHl6ZVN0cmluZ0RpdmVyZ2VuY2UoYVN5c3RlbSA/PyAnJywgYlN5c3RlbSA/PyAnJyk7XG5cdGNvbnN0IHZvbGF0aWxlID0gZHYgPyBkZXRlY3RWb2xhdGlsZVZhbHVlQXJvdW5kKGFTeXN0ZW0gPz8gJycsIGJTeXN0ZW0gPz8gJycsIGR2KSA6IHVuZGVmaW5lZDtcblx0cmV0dXJuIHtcblx0XHRzZXZlcml0eTogQ2FjaGVJbnNpZ2h0U2V2ZXJpdHkuQ3JpdGljYWwsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuaW5zaWdodC5zeXN0ZW0udGl0bGUnLCBcIlN5c3RlbSBwcm9tcHQgY2hhbmdlZFwiKSxcblx0XHRkZXRhaWw6IGR2XG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuaW5zaWdodC5zeXN0ZW0uZGV0YWlsJywgXCJ7MH0gXHUyMTkyIHsxfSBjaGFycyBcdTAwQjcgezJ9XCIsIGZtdChkdi5hTGVuZ3RoKSwgZm10KGR2LmJMZW5ndGgpLCBkZXNjcmliZVN0cmluZ0RpdmVyZ2VuY2UoZHYpKVxuXHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0aGludDogdm9sYXRpbGVcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5pbnNpZ2h0LnN5c3RlbS52b2xhdGlsZUhpbnQnLCBcIlRoZSBjaGFuZ2VkIHJlZ2lvbiBsb29rcyBsaWtlIGEgezB9IFx1MjAxNCB2b2xhdGlsZSB2YWx1ZXMgaW50ZXJwb2xhdGVkIGludG8gdGhlIHN5c3RlbSBwcm9tcHQgYnJlYWsgdGhlIGNhY2hlIG9uIGV2ZXJ5IHJlcXVlc3QuIE1vdmUgZHluYW1pYyBjb250ZW50IGFmdGVyIHRoZSBjb252ZXJzYXRpb24gaGlzdG9yeSBvciBkcm9wIGl0LlwiLCB2b2xhdGlsZVZhbHVlTGFiZWwodm9sYXRpbGUpKVxuXHRcdFx0OiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmluc2lnaHQuc3lzdGVtLmhpbnQnLCBcIkEgc3lzdGVtIHByb21wdCBjaGFuZ2UgaW52YWxpZGF0ZXMgZXZlcnl0aGluZyBhZnRlciB0aGUgdG9vbHMgYmxvY2suIEtlZXAgdGhlIHN5c3RlbSBwcm9tcHQgYnl0ZS1zdGFibGUgZm9yIHRoZSBsaWZlIG9mIGEgc2Vzc2lvbiBhbmQgaW5qZWN0IHBlci10dXJuIGNvbnRleHQgaW50byB0aGUgbmV3ZXN0IG1lc3NhZ2UgaW5zdGVhZC5cIiksXG5cdFx0Y29tcG9uZW50OiAnc3lzdGVtJyxcblx0XHRjYXRlZ29yeTogQ2FjaGVCcmVha0NhdGVnb3J5LlN5c3RlbSxcblx0fTtcbn1cblxuZnVuY3Rpb24gbWVzc2FnZUluc2lnaHRzKGlucHV0OiBJQ2FjaGVJbnNpZ2h0c0lucHV0LCBoYXNFYXJsaWVyQnJlYWs6IGJvb2xlYW4pOiBJQ2FjaGVJbnNpZ2h0W10ge1xuXHRjb25zdCB7IGRpZmYgfSA9IGlucHV0O1xuXHRpZiAoIWRpZmYuYnJlYWspIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0Y29uc3Qgb3V0OiBJQ2FjaGVJbnNpZ2h0W10gPSBbXTtcblx0Y29uc3QgaWR4ID0gZGlmZi5icmVhay5pbmRleDtcblx0Y29uc3QgY29tcG9uZW50ID0gYG1lc3NhZ2VzWyR7aWR4fV1gO1xuXHRjb25zdCBjb3VudHMgPSBkaWZmLmNvdW50cztcblxuXHRpZiAoZGlmZi5icmVhay5raW5kID09PSBDYWNoZURpZmZLaW5kLk9ubHlJbkIpIHtcblx0XHQvLyBUaGUgZmlyc3QgZGl2ZXJnZW5jZSBpcyBhIG1lc3NhZ2UgYXBwZW5kZWQgcGFzdCB0aGUgZW5kIG9mIHRoZVxuXHRcdC8vIHByZXZpb3VzIHJlcXVlc3QgXHUyMDE0IHRoZSBoZWFsdGh5IGdyb3d0aCBwYXR0ZXJuLiAoQSBwb3NpdGlvbmFsIHppcFxuXHRcdC8vIGNhbiBvbmx5IHJlcG9ydCBPbmx5SW5CIGFzIHRoZSAqZmlyc3QqIGRpdmVyZ2VuY2Ugd2hlbiBldmVyeXRoaW5nXG5cdFx0Ly8gYmVmb3JlIGl0IHdhcyBpZGVudGljYWwuKVxuXHRcdG91dC5wdXNoKHtcblx0XHRcdC8vIERvd25ncmFkZSB0byBJbmZvIHdoZW4gYW4gZWFybGllciB0aWVyIGFscmVhZHkgYnJva2UgdGhlIGNhY2hlOlxuXHRcdFx0Ly8gdGhlIGFwcGVuZCBpcyBzdGlsbCBmaW5lLCBidXQgaXQgaXNuJ3QgdGhlIHN0b3J5IG9mIHRoaXMgcmVxdWVzdC5cblx0XHRcdHNldmVyaXR5OiBoYXNFYXJsaWVyQnJlYWsgPyBDYWNoZUluc2lnaHRTZXZlcml0eS5JbmZvIDogQ2FjaGVJbnNpZ2h0U2V2ZXJpdHkuT2ssXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5pbnNpZ2h0LmFwcGVuZC50aXRsZScsIFwiTmV3IG1lc3NhZ2VzIGFwcGVuZGVkIFx1MjAxNCBleHBlY3RlZCBncm93dGhcIiksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuaW5zaWdodC5hcHBlbmQuZGV0YWlsJywgXCJ7MH0gbmV3IG1lc3NhZ2UocykgYWZ0ZXIgezF9IHVuY2hhbmdlZCBcdTIwMTQgdGhlIHNoYXJlZCBwcmVmaXggd2FzIGV4dGVuZGVkLCBub3QgYnJva2VuLiBUaGUgdW5jYWNoZWQgdG9rZW5zIGFyZSB0aGUgbmV3IHN1ZmZpeCBiZWluZyB3cml0dGVuIHRvIHRoZSBjYWNoZSBmb3IgdGhlIG5leHQgcmVxdWVzdC5cIiwgZm10KGNvdW50cy5vbmx5SW5CKSwgZm10KGNvdW50cy5pZGVudGljYWwpKSxcblx0XHRcdGNvbXBvbmVudCxcblx0XHRcdGNhdGVnb3J5OiBDYWNoZUJyZWFrQ2F0ZWdvcnkuSGVhbHRoeSxcblx0XHR9KTtcblx0XHQvLyBDYWNoZSBsb29rYmFjayB3aW5kb3c6IHByb3ZpZGVycyB3YWxrIGJhY2sgYSBib3VuZGVkIG51bWJlciBvZlxuXHRcdC8vIGNvbnRlbnQgYmxvY2tzICh+MjApIHRvIGZpbmQgYSBwcmlvciBjYWNoZSBlbnRyeS4gQSBzaW5nbGUgdHVyblxuXHRcdC8vIHRoYXQgYXBwZW5kcyBtb3JlIHRoYW4gdGhhdCBjYW4gbWlzcyB0aGUgcHJldmlvdXMgZW50cnkgZXZlblxuXHRcdC8vIHRob3VnaCB0aGUgcHJlZml4IGlzIGJ5dGUtaWRlbnRpY2FsLlxuXHRcdGlmIChjb3VudHMub25seUluQiA+IExPT0tCQUNLX1dJTkRPV19CTE9DS1MpIHtcblx0XHRcdG91dC5wdXNoKHtcblx0XHRcdFx0c2V2ZXJpdHk6IENhY2hlSW5zaWdodFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmluc2lnaHQubG9va2JhY2sudGl0bGUnLCBcInswfSBibG9ja3MgYXBwZW5kZWQgXHUyMDE0IGJleW9uZCB0aGUgdHlwaWNhbCBjYWNoZSBsb29rYmFjayB3aW5kb3dcIiwgZm10KGNvdW50cy5vbmx5SW5CKSksXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5pbnNpZ2h0Lmxvb2tiYWNrLmRldGFpbCcsIFwiUHJvdmlkZXJzIHR5cGljYWxseSBsb29rIGJhY2sgfnswfSBjb250ZW50IGJsb2NrcyBmb3IgYSBwcmlvciBjYWNoZSBlbnRyeTsgYSB0dXJuIHRoYXQgYXBwZW5kcyBtb3JlIGNhbiBzaWxlbnRseSBtaXNzIGl0IGV2ZW4gdGhvdWdoIHRoZSBwcmVmaXggbWF0Y2hlcy5cIiwgTE9PS0JBQ0tfV0lORE9XX0JMT0NLUyksXG5cdFx0XHRcdGhpbnQ6IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuaW5zaWdodC5sb29rYmFjay5oaW50JywgXCJEdXJpbmcgbG9uZyB0b29sIGxvb3BzLCBwbGFjZSBpbnRlcm1lZGlhdGUgY2FjaGUgYnJlYWtwb2ludHMgZXZlcnkgfjE1IGJsb2NrcyBzbyB0aGUgbmV4dCByZXF1ZXN0IGNhbiBzdGlsbCBmaW5kIGEgY2FjaGUgZW50cnkuXCIpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiBvdXQ7XG5cdH1cblxuXHRpZiAoZGlmZi5icmVhay5raW5kID09PSBDYWNoZURpZmZLaW5kLk9ubHlJbkEpIHtcblx0XHRvdXQucHVzaCh7XG5cdFx0XHRzZXZlcml0eTogQ2FjaGVJbnNpZ2h0U2V2ZXJpdHkuQ3JpdGljYWwsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5pbnNpZ2h0LnRydW5jYXRlZC50aXRsZScsIFwiSGlzdG9yeSB0cnVuY2F0ZWQgYXQgbWVzc2FnZXNbezB9XVwiLCBpZHgpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmluc2lnaHQudHJ1bmNhdGVkLmRldGFpbCcsIFwiezB9IG1lc3NhZ2UocykgcHJlc2VudCBpbiB0aGUgcHJldmlvdXMgcmVxdWVzdCBhcmUgbWlzc2luZyBmcm9tIHRoaXMgb25lLlwiLCBmbXQoY291bnRzLm9ubHlJbkEpKSxcblx0XHRcdGhpbnQ6IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuaW5zaWdodC50cnVuY2F0ZWQuaGludCcsIFwiSGlzdG9yeSBzbGljaW5nIG9yIGNvbXBhY3Rpb24gc2hvcnRlbnMgdGhlIHByZWZpeCBcdTIwMTQgdGhlIGNhY2hlIGNhbiBvbmx5IG1hdGNoIHVwIHRvIHRoZSBjdXQsIGFuZCBldmVyeXRoaW5nIGFmdGVyIGl0IGlzIHJlY29tcHV0ZWQuXCIpLFxuXHRcdFx0Y29tcG9uZW50LFxuXHRcdFx0Y2F0ZWdvcnk6IENhY2hlQnJlYWtDYXRlZ29yeS5IaXN0b3J5LFxuXHRcdH0pO1xuXHRcdHJldHVybiBvdXQ7XG5cdH1cblxuXHQvLyBJbi1wbGFjZSBjaGFuZ2UgKGNvbnRlbnQgZHJpZnQgb3IgbGVuZ3RoIGNoYW5nZSkgaW5zaWRlIHNoYXJlZCBoaXN0b3J5LlxuXHRjb25zdCB0b2sgPSBkaWZmLnNpZ25hdHVyZS5maW5kKHQgPT4gdC5pbmRleCA9PT0gaWR4KTtcblx0Y29uc3Qgcm9sZSA9IHRvaz8uYlJvbGUgPz8gdG9rPy5hUm9sZSA/PyAnbWVzc2FnZSc7XG5cdGNvbnN0IGFNc2cgPSBpbnB1dC5hTWVzc2FnZXNbaWR4XTtcblx0Y29uc3QgYk1zZyA9IGlucHV0LmJNZXNzYWdlc1tpZHhdO1xuXHRjb25zdCBkdiA9IGFNc2cgJiYgYk1zZyA/IGFuYWx5emVTdHJpbmdEaXZlcmdlbmNlKGFNc2cudGV4dCwgYk1zZy50ZXh0KSA6IHVuZGVmaW5lZDtcblx0Y29uc3Qgdm9sYXRpbGUgPSBkdiAmJiBhTXNnICYmIGJNc2cgPyBkZXRlY3RWb2xhdGlsZVZhbHVlQXJvdW5kKGFNc2cudGV4dCwgYk1zZy50ZXh0LCBkdikgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IGRldGFpbFBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRpZiAoYU1zZyAmJiBiTXNnKSB7XG5cdFx0ZGV0YWlsUGFydHMucHVzaChsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmluc2lnaHQuZHJpZnQuc2l6ZXMnLCBcInswfSBtZXNzYWdlLCB7MX0gXHUyMTkyIHsyfSBjaGFyc1wiLCByb2xlLCBmbXQoYU1zZy5jaGFyTGVuZ3RoKSwgZm10KGJNc2cuY2hhckxlbmd0aCkpKTtcblx0fVxuXHRpZiAoZHYpIHtcblx0XHRkZXRhaWxQYXJ0cy5wdXNoKGRlc2NyaWJlU3RyaW5nRGl2ZXJnZW5jZShkdikpO1xuXHR9XG5cdG91dC5wdXNoKHtcblx0XHRzZXZlcml0eTogQ2FjaGVJbnNpZ2h0U2V2ZXJpdHkuQ3JpdGljYWwsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuaW5zaWdodC5kcmlmdC50aXRsZScsIFwiSGlzdG9yeSByZXdyaXR0ZW4gYXQgbWVzc2FnZXNbezB9XVwiLCBpZHgpLFxuXHRcdGRldGFpbDogZGV0YWlsUGFydHMuam9pbignIFx1MDBCNyAnKSxcblx0XHRoaW50OiB2b2xhdGlsZVxuXHRcdFx0PyBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmluc2lnaHQuZHJpZnQudm9sYXRpbGVIaW50JywgXCJUaGUgY2hhbmdlZCByZWdpb24gbG9va3MgbGlrZSBhIHswfSBcdTIwMTQgYSB2b2xhdGlsZSB2YWx1ZSByZS1yZW5kZXJlZCBpbnRvIHRoZSBjb252ZXJzYXRpb24gaGlzdG9yeSBicmVha3MgdGhlIHByZWZpeCBvbiBldmVyeSByZXF1ZXN0LlwiLCB2b2xhdGlsZVZhbHVlTGFiZWwodm9sYXRpbGUpKVxuXHRcdFx0OiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmluc2lnaHQuZHJpZnQuaGludCcsIFwiQ29udmVyc2F0aW9uIGhpc3RvcnkgbXVzdCBiZSBieXRlLWlkZW50aWNhbCBiZXR3ZWVuIHJlcXVlc3RzIHRvIHJldXNlIHRoZSBjYWNoZWQgcHJlZml4LiBBIHJlLXNlcmlhbGl6ZWQgezB9IHR1cm4gXHUyMDE0IHRyaW1tZWQgd2hpdGVzcGFjZSwgZHJvcHBlZCByZWFzb25pbmcgb3IgcHJlYW1ibGUgdGV4dCwgcmVmb3JtYXR0ZWQgdG9vbCBjYWxscyBcdTIwMTQgc2lsZW50bHkgaW52YWxpZGF0ZXMgZXZlcnl0aGluZyBhZnRlciBpdC5cIiwgcm9sZSksXG5cdFx0Y29tcG9uZW50LFxuXHRcdGNhdGVnb3J5OiBDYWNoZUJyZWFrQ2F0ZWdvcnkuSGlzdG9yeSxcblx0fSk7XG5cblx0Y29uc3QgY2hhbmdlZEFmdGVyQnJlYWsgPSBjb3VudHMuY29udGVudERyaWZ0ICsgY291bnRzLmxlbmd0aENoYW5nZSArIGNvdW50cy5vbmx5SW5BICsgY291bnRzLm9ubHlJbkIgLSAxO1xuXHRpZiAoY2hhbmdlZEFmdGVyQnJlYWsgPiAwKSB7XG5cdFx0b3V0LnB1c2goe1xuXHRcdFx0c2V2ZXJpdHk6IENhY2hlSW5zaWdodFNldmVyaXR5LkluZm8sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5pbnNpZ2h0LmFmdGVyQnJlYWsudGl0bGUnLCBcInswfSBtb3JlIGNoYW5nZWQgcG9zaXRpb24ocykgYWZ0ZXIgdGhlIGJyZWFrXCIsIGZtdChjaGFuZ2VkQWZ0ZXJCcmVhaykpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmluc2lnaHQuYWZ0ZXJCcmVhay5kZXRhaWwnLCBcIk9uY2UgdGhlIHByZWZpeCBicmVha3MgYXQgbWVzc2FnZXNbezB9XSwgZXZlcnl0aGluZyBhZnRlciBpdCBpcyByZWNvbXB1dGVkIHJlZ2FyZGxlc3MgXHUyMDE0IGZpeCB0aGUgZmlyc3QgYnJlYWsgZmlyc3QuXCIsIGlkeCksXG5cdFx0fSk7XG5cdH1cblx0cmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gc3RhYmxlUHJlZml4SW5zaWdodChpbnB1dDogSUNhY2hlSW5zaWdodHNJbnB1dCk6IElDYWNoZUluc2lnaHQge1xuXHRpZiAoaW5wdXQuaGl0UGN0IDwgRUZGRUNUSVZFX01JU1NfUENUKSB7XG5cdFx0Ly8gQnl0ZS1pZGVudGljYWwgcHJlZml4LCBub3RoaW5nIGNoYW5nZWQsIHlldCB+MCUgc2VydmVkIGZyb20gY2FjaGUuXG5cdFx0Ly8gVHdvIGNhbmRpZGF0ZSBleHBsYW5hdGlvbnMgd2UgY2FuIHRlbGwgYXBhcnQgZnJvbSB0aGUgZGF0YSB3ZSBoYXZlOlxuXHRcdC8vIGEgcHJvbXB0IGJlbG93IHRoZSBwcm92aWRlcidzIG1pbmltdW0gY2FjaGVhYmxlIHByZWZpeCBzaXplIG5ldmVyXG5cdFx0Ly8gY2FjaGVzIGF0IGFsbDsgb3RoZXJ3aXNlIHRoZSBlbnRyeSBhbG1vc3QgY2VydGFpbmx5IGV4cGlyZWQgb3Igd2FzXG5cdFx0Ly8gZXZpY3RlZC4gV2UgY2FuJ3Qgb2JzZXJ2ZSB0aGUgcHJvdmlkZXIgY2FjaGUgZGlyZWN0bHksIHNvIGJvdGhcblx0XHQvLyBzdGF5IFwibGlrZWx5XCIvXCJtYXlcIi5cblx0XHRpZiAoaW5wdXQuaW5wdXRUb2tlbnMgPiAwICYmIGlucHV0LmlucHV0VG9rZW5zIDwgTUlOX0NBQ0hFQUJMRV9UT0tFTlMpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHNldmVyaXR5OiBDYWNoZUluc2lnaHRTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5pbnNpZ2h0LnRvb1NtYWxsLnRpdGxlJywgXCJQcm9tcHQgbWF5IGJlIGJlbG93IHRoZSBtaW5pbXVtIGNhY2hlYWJsZSBzaXplXCIpLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuaW5zaWdodC50b29TbWFsbC5kZXRhaWwnLCBcInswfSBpbnB1dCB0b2tlbnMgXHUyMDE0IHByb3ZpZGVycyBvbmx5IGNhY2hlIHByb21wdHMgYWJvdmUgYSBtaW5pbXVtIHByZWZpeCBzaXplIChyb3VnaGx5IDEsMDI0LTQsMDk2IHRva2VucyBkZXBlbmRpbmcgb24gbW9kZWwpLCBhbmQgc21hbGxlciBwcm9tcHRzIHNpbGVudGx5IG5ldmVyIGNhY2hlLlwiLCBmbXQoaW5wdXQuaW5wdXRUb2tlbnMpKSxcblx0XHRcdFx0aGludDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5pbnNpZ2h0LnRvb1NtYWxsLmhpbnQnLCBcIlNtYWxsIHV0aWxpdHkgcmVxdWVzdHMgKHRpdGxlcywgc3VtbWFyaWVzKSBvZnRlbiBzaXQgYmVsb3cgdGhlIHRocmVzaG9sZDsgYSAwJSBoaXQgb24gdGhlbSBpcyBub3JtYWwgYW5kIG5vdCB3b3J0aCBvcHRpbWl6aW5nLlwiKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENhY2hlQnJlYWtDYXRlZ29yeS5FeHBpcmF0aW9uLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y29uc3QgbWludXRlcyA9IGlucHV0Lm1pbnV0ZXNTaW5jZVByZXZpb3VzO1xuXHRcdGNvbnN0IGdhcCA9IG1pbnV0ZXMgIT09IHVuZGVmaW5lZCAmJiBtaW51dGVzID49IDFcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5pbnNpZ2h0LmV4cGlyZWQuZ2FwJywgXCIgezB9IG1pbnV0ZShzKSBlbGFwc2VkIHNpbmNlIHRoZSBwcmV2aW91cyByZXF1ZXN0LlwiLCBmbXQoTWF0aC5yb3VuZChtaW51dGVzKSkpXG5cdFx0XHQ6ICcnO1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXZlcml0eTogQ2FjaGVJbnNpZ2h0U2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmluc2lnaHQuZXhwaXJlZC50aXRsZScsIFwiTGlrZWx5IGNhY2hlIGV4cGlyYXRpb25cIiksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuaW5zaWdodC5leHBpcmVkLmRldGFpbCcsIFwiVGhlIHByb21wdCBpcyBieXRlLWlkZW50aWNhbCB0byB0aGUgcHJldmlvdXMgcmVxdWVzdCBidXQgb25seSB7MH0lIHdhcyBzZXJ2ZWQgZnJvbSBjYWNoZS57MX1cIiwgaW5wdXQuaGl0UGN0LnRvRml4ZWQoMiksIGdhcCksXG5cdFx0XHRoaW50OiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmluc2lnaHQuZXhwaXJlZC5oaW50JywgXCJQcm92aWRlciBwcm9tcHQgY2FjaGVzIGV4cGlyZSBhZnRlciBhIGZldyBtaW51dGVzIG9mIGluYWN0aXZpdHkgKHR5cGljYWxseSB+ezB9IG1pbikuIExvbmcgZ2FwcyBiZXR3ZWVuIHJlcXVlc3RzIHJlY29tcHV0ZSB0aGUgZnVsbCBwcm9tcHQgZXZlbiB3aGVuIG5vdGhpbmcgY2hhbmdlZC5cIiwgVFlQSUNBTF9UVExfTUlOVVRFUyksXG5cdFx0XHRjYXRlZ29yeTogQ2FjaGVCcmVha0NhdGVnb3J5LkV4cGlyYXRpb24sXG5cdFx0fTtcblx0fVxuXHRyZXR1cm4ge1xuXHRcdHNldmVyaXR5OiBDYWNoZUluc2lnaHRTZXZlcml0eS5Payxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5pbnNpZ2h0LnN0YWJsZS50aXRsZScsIFwiUHJvbXB0IHByZWZpeCBmdWxseSBzdGFibGVcIiksXG5cdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmluc2lnaHQuc3RhYmxlLmRldGFpbCcsIFwiTm8gZGl2ZXJnZW5jZSBkZXRlY3RlZCBcdTIwMTQgezB9JSBvZiBpbnB1dCB0b2tlbnMgd2VyZSBzZXJ2ZWQgZnJvbSBjYWNoZS5cIiwgaW5wdXQuaGl0UGN0LnRvRml4ZWQoMikpLFxuXHRcdGNhdGVnb3J5OiBDYWNoZUJyZWFrQ2F0ZWdvcnkuSGVhbHRoeSxcblx0fTtcbn1cblxuLyoqIFJlc29sdmUgdGhlIGJyZWFrIGNhdGVnb3J5IGZvciBvbmUgcmVxdWVzdCBwYWlyIGZyb20gaXRzIGZpbmRpbmdzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhdGVnb3JpemVDYWNoZUJyZWFrKGluc2lnaHRzOiByZWFkb25seSBJQ2FjaGVJbnNpZ2h0W10pOiBDYWNoZUJyZWFrQ2F0ZWdvcnkge1xuXHRjb25zdCBwcmltYXJ5ID0gcHJpbWFyeUluc2lnaHQoaW5zaWdodHMpO1xuXHRpZiAocHJpbWFyeT8uY2F0ZWdvcnkpIHtcblx0XHRyZXR1cm4gcHJpbWFyeS5jYXRlZ29yeTtcblx0fVxuXHRmb3IgKGNvbnN0IGkgb2YgaW5zaWdodHMpIHtcblx0XHRpZiAoaS5jYXRlZ29yeSkge1xuXHRcdFx0cmV0dXJuIGkuY2F0ZWdvcnk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBDYWNoZUJyZWFrQ2F0ZWdvcnkuVW5rbm93bjtcbn1cblxuLyoqIEh1bWFuLXJlYWRhYmxlIGxhYmVsIGZvciBhIGJyZWFrIGNhdGVnb3J5LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhY2hlQnJlYWtDYXRlZ29yeUxhYmVsKGNhdGVnb3J5OiBDYWNoZUJyZWFrQ2F0ZWdvcnkpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKGNhdGVnb3J5KSB7XG5cdFx0Y2FzZSBDYWNoZUJyZWFrQ2F0ZWdvcnkuSGVhbHRoeTogcmV0dXJuIGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuY2F0ZWdvcnkuaGVhbHRoeScsIFwiaGVhbHRoeSBncm93dGhcIik7XG5cdFx0Y2FzZSBDYWNoZUJyZWFrQ2F0ZWdvcnkuRXhwaXJhdGlvbjogcmV0dXJuIGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuY2F0ZWdvcnkuZXhwaXJhdGlvbicsIFwiZXhwaXJhdGlvbiAvIG5vdCBjYWNoZWFibGVcIik7XG5cdFx0Y2FzZSBDYWNoZUJyZWFrQ2F0ZWdvcnkuTW9kZWw6IHJldHVybiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmNhdGVnb3J5Lm1vZGVsJywgXCJtb2RlbCBjaGFuZ2VkXCIpO1xuXHRcdGNhc2UgQ2FjaGVCcmVha0NhdGVnb3J5LlRvb2xzOiByZXR1cm4gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5jYXRlZ29yeS50b29scycsIFwidG9vbCBjYXRhbG9nIGNoYW5nZWRcIik7XG5cdFx0Y2FzZSBDYWNoZUJyZWFrQ2F0ZWdvcnkuU3lzdGVtOiByZXR1cm4gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5jYXRlZ29yeS5zeXN0ZW0nLCBcInN5c3RlbSBwcm9tcHQgY2hhbmdlZFwiKTtcblx0XHRjYXNlIENhY2hlQnJlYWtDYXRlZ29yeS5PcHRpb25zOiByZXR1cm4gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5jYXRlZ29yeS5vcHRpb25zJywgXCJyZXF1ZXN0IG9wdGlvbnMgY2hhbmdlZFwiKTtcblx0XHRjYXNlIENhY2hlQnJlYWtDYXRlZ29yeS5IaXN0b3J5OiByZXR1cm4gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5jYXRlZ29yeS5oaXN0b3J5JywgXCJoaXN0b3J5IHJld3JpdHRlblwiKTtcblx0XHRjYXNlIENhY2hlQnJlYWtDYXRlZ29yeS5Vbmtub3duOiByZXR1cm4gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5jYXRlZ29yeS51bmtub3duJywgXCJub3QgY2xhc3NpZmllZFwiKTtcblx0fVxufVxuXG4vKiogQnJlYWsgY2F0ZWdvcmllcyB0aGF0IGFyZSBhdm9pZGFibGUgb24gdGhlIGNsaWVudCBzaWRlLiAqL1xuY29uc3QgQVZPSURBQkxFX0NBVEVHT1JJRVM6IHJlYWRvbmx5IENhY2hlQnJlYWtDYXRlZ29yeVtdID0gW1xuXHRDYWNoZUJyZWFrQ2F0ZWdvcnkuTW9kZWwsXG5cdENhY2hlQnJlYWtDYXRlZ29yeS5Ub29scyxcblx0Q2FjaGVCcmVha0NhdGVnb3J5LlN5c3RlbSxcblx0Q2FjaGVCcmVha0NhdGVnb3J5Lk9wdGlvbnMsXG5cdENhY2hlQnJlYWtDYXRlZ29yeS5IaXN0b3J5LFxuXTtcblxuLyoqIFRoZSBvdXRjb21lIG9mIGFuYWx5emluZyBvbmUgY29uc2VjdXRpdmUgcmVxdWVzdCBwYWlyIGluIGEgc2Vzc2lvbi4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlc3Npb25QYWlyT3V0Y29tZSB7XG5cdC8qKiBJbmRleCBvZiB0aGUgY3VycmVudCAoQikgdHVybiBpbiB0aGUgc2Vzc2lvbidzIHR1cm4gbGlzdC4gKi9cblx0cmVhZG9ubHkgdHVybkluZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IGNhdGVnb3J5OiBDYWNoZUJyZWFrQ2F0ZWdvcnk7XG5cdC8qKiBJbnB1dCB0b2tlbnMgb2YgdGhlIEIgcmVxdWVzdCB0aGF0IHdlcmUgbm90IHNlcnZlZCBmcm9tIGNhY2hlLiAqL1xuXHRyZWFkb25seSBsb3N0VG9rZW5zOiBudW1iZXI7XG59XG5cbi8qKiBBZ2dyZWdhdGUgc3RhdHMgZm9yIG9uZSBicmVhayBjYXRlZ29yeSBhY3Jvc3MgYSBzZXNzaW9uLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvbkNhdGVnb3J5U3RhdCB7XG5cdHJlYWRvbmx5IGNhdGVnb3J5OiBDYWNoZUJyZWFrQ2F0ZWdvcnk7XG5cdHJlYWRvbmx5IGNvdW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IGxvc3RUb2tlbnM6IG51bWJlcjtcbn1cblxuLyoqIFRva2VuIGNvdW50cyBmb3Igb25lIHR1cm4sIHVzZWQgZm9yIHRoZSB0b2tlbi13ZWlnaHRlZCBvdmVyYWxsIGhpdCByYXRlLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvblR1cm5Ub2tlbnMge1xuXHRyZWFkb25seSBpbnB1dFRva2VuczogbnVtYmVyO1xuXHRyZWFkb25seSBjYWNoZWRUb2tlbnM6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBUb2tlbi13ZWlnaHRlZCBjYWNoZSBoaXQgYWNyb3NzIGEgd2hvbGUgc2Vzc2lvbi4gUGVyLXJlcXVlc3QgcGVyY2VudGFnZXNcbiAqIG92ZXJ3ZWlnaHQgc21hbGwgdXRpbGl0eSBjYWxsczsgd2VpZ2h0aW5nIGJ5IGlucHV0IHRva2VucyBzaG93cyB0aGUgcmVhbFxuICogY29zdCBwaWN0dXJlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uT3ZlcmFsbEhpdCB7XG5cdHJlYWRvbmx5IGlucHV0VG9rZW5zOiBudW1iZXI7XG5cdHJlYWRvbmx5IGNhY2hlZFRva2VuczogbnVtYmVyO1xuXHQvKiogYGNhY2hlZFRva2VucyAvIGlucHV0VG9rZW5zYCBhcyBhIHBlcmNlbnRhZ2UgKDAtMTAwKS4gKi9cblx0cmVhZG9ubHkgaGl0UGN0OiBudW1iZXI7XG5cdC8qKiBOdW1iZXIgb2YgdHVybnMgdGhhdCByZXBvcnRlZCB0b2tlbiB1c2FnZS4gKi9cblx0cmVhZG9ubHkgdHVybkNvdW50OiBudW1iZXI7XG59XG5cbi8qKiBDcm9zcy10dXJuIGNhY2hlIGhlYWx0aCByZXBvcnQgZm9yIGEgd2hvbGUgc2Vzc2lvbi4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlc3Npb25DYWNoZVJlcG9ydCB7XG5cdHJlYWRvbmx5IHBhaXJDb3VudDogbnVtYmVyO1xuXHRyZWFkb25seSBoZWFsdGh5Q291bnQ6IG51bWJlcjtcblx0LyoqIFVuY2FjaGVkIHRva2VucyBhY3Jvc3MgcGFpcnMgd2hvc2UgYnJlYWsgd2FzIGF2b2lkYWJsZS4gKi9cblx0cmVhZG9ubHkgYXZvaWRhYmxlTG9zdFRva2VuczogbnVtYmVyO1xuXHQvKiogVG9rZW4td2VpZ2h0ZWQgb3ZlcmFsbCBoaXQgcmF0ZTsgdW5kZWZpbmVkIHdoZW4gbm8gdHVybiByZXBvcnRlZCB1c2FnZS4gKi9cblx0cmVhZG9ubHkgb3ZlcmFsbDogSVNlc3Npb25PdmVyYWxsSGl0IHwgdW5kZWZpbmVkO1xuXHQvKiogUGVyLWNhdGVnb3J5IHN0YXRzLCBzb3J0ZWQgYnkgbG9zdCB0b2tlbnMgZGVzY2VuZGluZyAoaGVhbHRoeSBleGNsdWRlZCkuICovXG5cdHJlYWRvbmx5IGJ5Q2F0ZWdvcnk6IHJlYWRvbmx5IElTZXNzaW9uQ2F0ZWdvcnlTdGF0W107XG5cdC8qKiBQZXItdHVybiBjYXRlZ29yeSwgZm9yIHJhaWwgZGVjb3JhdGlvbi4gKi9cblx0cmVhZG9ubHkgY2F1c2VCeVR1cm5JbmRleDogUmVhZG9ubHlNYXA8bnVtYmVyLCBDYWNoZUJyZWFrQ2F0ZWdvcnk+O1xuXHQvKiogU2Vzc2lvbi1sZXZlbCBmaW5kaW5nczogcmVjdXJyaW5nIGludmFsaWRhdG9ycyBhbmQgdGhlIG92ZXJhbGwgdmVyZGljdC4gKi9cblx0cmVhZG9ubHkgZmluZGluZ3M6IHJlYWRvbmx5IElDYWNoZUluc2lnaHRbXTtcbn1cblxuLyoqIEEgcmVjdXJyaW5nIGJyZWFrIGNhdGVnb3J5IG5lZWRzIGF0IGxlYXN0IHRoaXMgbWFueSBvY2N1cnJlbmNlcy4gKi9cbmNvbnN0IFJFQ1VSUklOR19USFJFU0hPTEQgPSAyO1xuXG4vKipcbiAqIEFnZ3JlZ2F0ZSBwZXItcGFpciBvdXRjb21lcyBpbnRvIGEgc2Vzc2lvbi1sZXZlbCByZXBvcnQ6IHdoaWNoIGJyZWFrXG4gKiBjYXRlZ29yaWVzIHJlY3VyIChhIG9uZS1vZmYgYnJlYWsgaXMgYSBjdXJpb3NpdHk7IGEgcmVjdXJyaW5nIG9uZSBpcyBhXG4gKiBidWcpLCBob3cgbWFueSB0b2tlbnMgZWFjaCBjb3N0LCBhbmQgdGhlIHRva2VuLXdlaWdodGVkIG92ZXJhbGwgaGl0IHJhdGVcbiAqIGFjcm9zcyBhbGwgdHVybnMgKGB0dXJuVG9rZW5zYCBjb3ZlcnMgZXZlcnkgdHVybiwgaW5jbHVkaW5nIHRoZSBmaXJzdCxcbiAqIHdoaWNoIGhhcyBubyBwYWlyKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkU2Vzc2lvbkNhY2hlUmVwb3J0KHBhaXJzOiByZWFkb25seSBJU2Vzc2lvblBhaXJPdXRjb21lW10sIHR1cm5Ub2tlbnM6IHJlYWRvbmx5IElTZXNzaW9uVHVyblRva2Vuc1tdID0gW10pOiBJU2Vzc2lvbkNhY2hlUmVwb3J0IHtcblx0bGV0IG92ZXJhbGxJbnB1dCA9IDA7XG5cdGxldCBvdmVyYWxsQ2FjaGVkID0gMDtcblx0bGV0IG92ZXJhbGxUdXJucyA9IDA7XG5cdGZvciAoY29uc3QgdCBvZiB0dXJuVG9rZW5zKSB7XG5cdFx0aWYgKHQuaW5wdXRUb2tlbnMgPiAwKSB7XG5cdFx0XHRvdmVyYWxsSW5wdXQgKz0gdC5pbnB1dFRva2Vucztcblx0XHRcdG92ZXJhbGxDYWNoZWQgKz0gTWF0aC5taW4odC5jYWNoZWRUb2tlbnMsIHQuaW5wdXRUb2tlbnMpO1xuXHRcdFx0b3ZlcmFsbFR1cm5zKys7XG5cdFx0fVxuXHR9XG5cdGNvbnN0IG92ZXJhbGw6IElTZXNzaW9uT3ZlcmFsbEhpdCB8IHVuZGVmaW5lZCA9IG92ZXJhbGxJbnB1dCA+IDBcblx0XHQ/IHsgaW5wdXRUb2tlbnM6IG92ZXJhbGxJbnB1dCwgY2FjaGVkVG9rZW5zOiBvdmVyYWxsQ2FjaGVkLCBoaXRQY3Q6IChvdmVyYWxsQ2FjaGVkIC8gb3ZlcmFsbElucHV0KSAqIDEwMCwgdHVybkNvdW50OiBvdmVyYWxsVHVybnMgfVxuXHRcdDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0IHN0YXRzID0gbmV3IE1hcDxDYWNoZUJyZWFrQ2F0ZWdvcnksIHsgY291bnQ6IG51bWJlcjsgbG9zdFRva2VuczogbnVtYmVyIH0+KCk7XG5cdGNvbnN0IGNhdXNlQnlUdXJuSW5kZXggPSBuZXcgTWFwPG51bWJlciwgQ2FjaGVCcmVha0NhdGVnb3J5PigpO1xuXHRsZXQgaGVhbHRoeUNvdW50ID0gMDtcblx0bGV0IGF2b2lkYWJsZUxvc3RUb2tlbnMgPSAwO1xuXHRmb3IgKGNvbnN0IHBhaXIgb2YgcGFpcnMpIHtcblx0XHRjYXVzZUJ5VHVybkluZGV4LnNldChwYWlyLnR1cm5JbmRleCwgcGFpci5jYXRlZ29yeSk7XG5cdFx0aWYgKHBhaXIuY2F0ZWdvcnkgPT09IENhY2hlQnJlYWtDYXRlZ29yeS5IZWFsdGh5KSB7XG5cdFx0XHRoZWFsdGh5Q291bnQrKztcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCBzdGF0ID0gc3RhdHMuZ2V0KHBhaXIuY2F0ZWdvcnkpID8/IHsgY291bnQ6IDAsIGxvc3RUb2tlbnM6IDAgfTtcblx0XHRzdGF0LmNvdW50Kys7XG5cdFx0c3RhdC5sb3N0VG9rZW5zICs9IHBhaXIubG9zdFRva2Vucztcblx0XHRzdGF0cy5zZXQocGFpci5jYXRlZ29yeSwgc3RhdCk7XG5cdFx0aWYgKEFWT0lEQUJMRV9DQVRFR09SSUVTLmluY2x1ZGVzKHBhaXIuY2F0ZWdvcnkpKSB7XG5cdFx0XHRhdm9pZGFibGVMb3N0VG9rZW5zICs9IHBhaXIubG9zdFRva2Vucztcblx0XHR9XG5cdH1cblxuXHRjb25zdCBieUNhdGVnb3J5ID0gWy4uLnN0YXRzLmVudHJpZXMoKV1cblx0XHQubWFwKChbY2F0ZWdvcnksIHNdKSA9PiAoeyBjYXRlZ29yeSwgY291bnQ6IHMuY291bnQsIGxvc3RUb2tlbnM6IHMubG9zdFRva2VucyB9KSlcblx0XHQuc29ydCgoYSwgYikgPT4gYi5sb3N0VG9rZW5zIC0gYS5sb3N0VG9rZW5zKTtcblxuXHRjb25zdCBmaW5kaW5nczogSUNhY2hlSW5zaWdodFtdID0gW107XG5cdGZvciAoY29uc3Qgc3RhdCBvZiBieUNhdGVnb3J5KSB7XG5cdFx0aWYgKHN0YXQuY291bnQgPCBSRUNVUlJJTkdfVEhSRVNIT0xEKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKEFWT0lEQUJMRV9DQVRFR09SSUVTLmluY2x1ZGVzKHN0YXQuY2F0ZWdvcnkpKSB7XG5cdFx0XHRmaW5kaW5ncy5wdXNoKHtcblx0XHRcdFx0c2V2ZXJpdHk6IENhY2hlSW5zaWdodFNldmVyaXR5LkNyaXRpY2FsLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5zZXNzaW9uLnJlY3VycmluZy50aXRsZScsIFwiUmVjdXJyaW5nIGludmFsaWRhdG9yOiB7MH0gaW4gezF9IG9mIHsyfSByZXF1ZXN0IHBhaXJzXCIsIGNhY2hlQnJlYWtDYXRlZ29yeUxhYmVsKHN0YXQuY2F0ZWdvcnkpLCBmbXQoc3RhdC5jb3VudCksIGZtdChwYWlycy5sZW5ndGgpKSxcblx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnNlc3Npb24ucmVjdXJyaW5nLmRldGFpbCcsIFwifnswfSB0b2tlbnMgcmVjb21wdXRlZCBhY3Jvc3MgdGhvc2UgcmVxdWVzdHMuIEEgYnJlYWsgdGhhdCByZXBlYXRzIGlzIHN5c3RlbWljIFx1MjAxNCBsb29rIGZvciB0aGUgc2FtZSByb290IGNhdXNlIG9uIGV2ZXJ5IG9jY3VycmVuY2UuXCIsIGZtdChzdGF0Lmxvc3RUb2tlbnMpKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IHN0YXQuY2F0ZWdvcnksXG5cdFx0XHR9KTtcblx0XHR9IGVsc2UgaWYgKHN0YXQuY2F0ZWdvcnkgPT09IENhY2hlQnJlYWtDYXRlZ29yeS5FeHBpcmF0aW9uKSB7XG5cdFx0XHRmaW5kaW5ncy5wdXNoKHtcblx0XHRcdFx0c2V2ZXJpdHk6IENhY2hlSW5zaWdodFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnNlc3Npb24uZXhwaXJhdGlvbi50aXRsZScsIFwiQ2FjaGUgbGlrZWx5IGV4cGlyZWQgezB9IHRpbWVzXCIsIGZtdChzdGF0LmNvdW50KSksXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5zZXNzaW9uLmV4cGlyYXRpb24uZGV0YWlsJywgXCJ+ezB9IHRva2VucyByZWNvbXB1dGVkIGFmdGVyIGlkbGUgZ2FwcyBvciBvbiBwcm9tcHRzIGJlbG93IHRoZSBjYWNoZWFibGUgbWluaW11bS5cIiwgZm10KHN0YXQubG9zdFRva2VucykpLFxuXHRcdFx0XHRoaW50OiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnNlc3Npb24uZXhwaXJhdGlvbi5oaW50JywgXCJJZiBsb25nIGdhcHMgYXJlIGluaGVyZW50IHRvIHRoZSB3b3JrZmxvdywgY29uc2lkZXIgYSBsb25nZXItVFRMIGNhY2hlIG9yIHByZS13YXJtaW5nIGJlZm9yZSB0aGUgdXNlciByZXR1cm5zLlwiKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IHN0YXQuY2F0ZWdvcnksXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblx0aWYgKGZpbmRpbmdzLmxlbmd0aCA9PT0gMCAmJiBwYWlycy5sZW5ndGggPiAwICYmIGhlYWx0aHlDb3VudCA9PT0gcGFpcnMubGVuZ3RoKSB7XG5cdFx0ZmluZGluZ3MucHVzaCh7XG5cdFx0XHRzZXZlcml0eTogQ2FjaGVJbnNpZ2h0U2V2ZXJpdHkuT2ssXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5zZXNzaW9uLmFsbEhlYWx0aHkudGl0bGUnLCBcIkFsbCByZXF1ZXN0IHBhaXJzIGdyZXcgdGhlIHByZWZpeCBjbGVhbmx5XCIpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnNlc3Npb24uYWxsSGVhbHRoeS5kZXRhaWwnLCBcIkV2ZXJ5IHJlcXVlc3QgZWl0aGVyIGFwcGVuZGVkIG5ldyBtZXNzYWdlcyBvciBtYXRjaGVkIHRoZSBwcmV2aW91cyBwcm9tcHQgZXhhY3RseSBcdTIwMTQgbm8gYXZvaWRhYmxlIGNhY2hlIGJyZWFrcyBpbiB0aGlzIHNlc3Npb24uXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhY2hlQnJlYWtDYXRlZ29yeS5IZWFsdGh5LFxuXHRcdH0pO1xuXHR9XG5cblx0cmV0dXJuIHsgcGFpckNvdW50OiBwYWlycy5sZW5ndGgsIGhlYWx0aHlDb3VudCwgYXZvaWRhYmxlTG9zdFRva2Vucywgb3ZlcmFsbCwgYnlDYXRlZ29yeSwgY2F1c2VCeVR1cm5JbmRleCwgZmluZGluZ3MgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQW9CQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUEyRDtBQUVwRSxNQUFNLGtCQUFrQixTQUFTLGFBQWE7QUFFOUMsU0FBUyxJQUFJLEdBQW1CO0FBQy9CLFNBQU8sZ0JBQWdCLE1BQU0sT0FBTyxDQUFDO0FBQ3RDO0FBR08sSUFBVyx1QkFBWCxrQkFBV0EsMEJBQVg7QUFFTixFQUFBQSxzQkFBQSxRQUFLO0FBRUws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R0FBRyxNQUFNLFFBQVEsQ0FBQyxFQUNwQyxJQUFJLENBQUMsQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFLFVBQVUsT0FBTyxFQUFFLE9BQU8sWUFBWSxFQUFFLFdBQVcsRUFBRSxFQUMvRSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsYUFBYSxFQUFFLFVBQVU7QUFFNUMsUUFBTSxXQUE0QixDQUFDO0FBQ25DLGFBQVcsUUFBUSxZQUFZO0FBQzlCLFFBQUksS0FBSyxRQUFRLHFCQUFxQjtBQUNyQztBQUFBLElBQ0Q7QUFDQSxRQUFJLHFCQUFxQixTQUFTLEtBQUssUUFBUSxHQUFHO0FBQ2pELGVBQVMsS0FBSztBQUFBLFFBQ2IsVUFBVTtBQUFBLFFBQ1YsT0FBTyxTQUFTLDJDQUEyQywwREFBMEQsd0JBQXdCLEtBQUssUUFBUSxHQUFHLElBQUksS0FBSyxLQUFLLEdBQUcsSUFBSSxNQUFNLE1BQU0sQ0FBQztBQUFBLFFBQy9MLFFBQVEsU0FBUyw0Q0FBNEMsMklBQXNJLElBQUksS0FBSyxVQUFVLENBQUM7QUFBQSxRQUN2TixVQUFVLEtBQUs7QUFBQSxNQUNoQixDQUFDO0FBQUEsSUFDRixXQUFXLEtBQUssYUFBYSwrQkFBK0I7QUFDM0QsZUFBUyxLQUFLO0FBQUEsUUFDYixVQUFVO0FBQUEsUUFDVixPQUFPLFNBQVMsNENBQTRDLGtDQUFrQyxJQUFJLEtBQUssS0FBSyxDQUFDO0FBQUEsUUFDN0csUUFBUSxTQUFTLDZDQUE2QyxxRkFBcUYsSUFBSSxLQUFLLFVBQVUsQ0FBQztBQUFBLFFBQ3ZLLE1BQU0sU0FBUywyQ0FBMkMsZ0hBQWdIO0FBQUEsUUFDMUssVUFBVSxLQUFLO0FBQUEsTUFDaEIsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQ0EsTUFBSSxTQUFTLFdBQVcsS0FBSyxNQUFNLFNBQVMsS0FBSyxpQkFBaUIsTUFBTSxRQUFRO0FBQy9FLGFBQVMsS0FBSztBQUFBLE1BQ2IsVUFBVTtBQUFBLE1BQ1YsT0FBTyxTQUFTLDRDQUE0QywyQ0FBMkM7QUFBQSxNQUN2RyxRQUFRLFNBQVMsNkNBQTZDLHFJQUFnSTtBQUFBLE1BQzlMLFVBQVU7QUFBQSxJQUNYLENBQUM7QUFBQSxFQUNGO0FBRUEsU0FBTyxFQUFFLFdBQVcsTUFBTSxRQUFRLGNBQWMscUJBQXFCLFNBQVMsWUFBWSxrQkFBa0IsU0FBUztBQUN0SDsiLAogICJuYW1lcyI6IFsiQ2FjaGVJbnNpZ2h0U2V2ZXJpdHkiLCAiQ2FjaGVCcmVha0NhdGVnb3J5IiwgIlN0cmluZ0RpdmVyZ2VuY2VTaGFwZSIsICJWb2xhdGlsZVZhbHVlS2luZCJdCn0K
