function buildHistoryFromTasks(tasks, startTime, logs = []) {
  const rootByTrace = /* @__PURE__ */ new Map();
  const roots = [];
  const eventByTrace = /* @__PURE__ */ new Map();
  const taskEvents = [];
  for (const task of tasks) {
    const trace = task.trace;
    if (!trace) {
      continue;
    }
    let root = rootByTrace.get(trace.root);
    if (!root) {
      root = { label: trace.root.label };
      rootByTrace.set(trace.root, root);
      roots.push(root);
    }
    let parentEvent;
    for (let p = trace.parent; p; p = p.parent) {
      const e = eventByTrace.get(p);
      if (e) {
        parentEvent = e;
        break;
      }
    }
    const event = {
      time: task.time - startTime,
      label: `${task.source}`,
      root,
      parent: parentEvent,
      detail: extractCallerFrame(task.source.stackTrace)
    };
    eventByTrace.set(trace, event);
    taskEvents.push(event);
  }
  const logsByParent = /* @__PURE__ */ new Map();
  for (const entry of logs) {
    let parentEvent;
    for (let p = entry.trace; p; p = p.parent) {
      const e = eventByTrace.get(p);
      if (e) {
        parentEvent = e;
        break;
      }
    }
    if (!parentEvent) {
      continue;
    }
    const logEvent = {
      time: parentEvent.time,
      label: `log: ${entry.message}`,
      root: parentEvent.root,
      parent: parentEvent
    };
    const bucket = logsByParent.get(parentEvent);
    if (bucket) {
      bucket.push(logEvent);
    } else {
      logsByParent.set(parentEvent, [logEvent]);
    }
  }
  const events = [];
  for (const e of taskEvents) {
    events.push(e);
    const ls = logsByParent.get(e);
    if (ls) {
      events.push(...ls);
    }
  }
  return { roots, events };
}
const _skipFramePatterns = [
  /[\\/]virtualScheduling[\\/]/,
  /[\\/]vs[\\/]base[\\/]common[\\/]async\./,
  /timeTravelScheduler|traceableTimeApi/,
  /RunOnceScheduler\.schedule/,
  /scheduleAtNextAnimationFrame/,
  /TimeoutTimer\.cancelAndSet/,
  /TimeoutTimer\.setIfNotSet/,
  /timeoutDeferred/,
  /createTimeout/
];
const MAX_DETAIL_FRAMES = 5;
function extractCallerFrame(stackTrace) {
  if (!stackTrace) {
    return void 0;
  }
  const frames = [];
  for (const line of stackTrace.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("at ")) {
      continue;
    }
    if (_skipFramePatterns.some((p) => p.test(trimmed))) {
      continue;
    }
    frames.push(trimmed.slice(3));
    if (frames.length >= MAX_DETAIL_FRAMES) {
      break;
    }
  }
  return frames.length === 0 ? void 0 : frames.join("\n");
}
function renderSwimlanes(history) {
  const { roots, events } = history;
  if (events.length === 0) {
    return "(empty history)";
  }
  if (roots.length === 0) {
    return events.map((e) => `[+${e.time}ms] ${e.label}`).join("\n");
  }
  const n = events.length;
  const parentOf = new Array(n).fill(-1);
  const childrenOf = Array.from({ length: n }, () => []);
  const indexOfEvent = /* @__PURE__ */ new Map();
  for (let i = 0; i < n; i++) {
    indexOfEvent.set(events[i], i);
  }
  for (let i = 0; i < n; i++) {
    const p = events[i].parent;
    if (p) {
      const pi = indexOfEvent.get(p);
      if (pi !== void 0) {
        parentOf[i] = pi;
        childrenOf[pi].push(i);
      }
    }
  }
  const isLastChild = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const p = parentOf[i];
    if (p >= 0 && childrenOf[p][childrenOf[p].length - 1] === i) {
      isLastChild[i] = true;
    }
  }
  const COLLAPSE_DEPTH_THRESHOLD = 6;
  const depthOf = new Array(n).fill(0);
  const slotOf = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const p = parentOf[i];
    if (p >= 0) {
      depthOf[i] = depthOf[p] + 1;
      const collapse = isLastChild[i] && depthOf[i] >= COLLAPSE_DEPTH_THRESHOLD;
      slotOf[i] = slotOf[p] + (collapse ? 0 : 1);
    }
  }
  const displayLabelOf = new Array(n);
  const detailLinesOf = new Array(n);
  for (let i = 0; i < n; i++) {
    const e = events[i];
    const frames = e.detail ? e.detail.split("\n") : [];
    displayLabelOf[i] = frames.length > 0 ? `${e.label} \xB7 ${frames[0]}` : e.label;
    detailLinesOf[i] = frames.slice(1);
  }
  const widthOf = /* @__PURE__ */ new Map();
  for (const r of roots) {
    widthOf.set(r, r.label.length);
  }
  for (let i = 0; i < n; i++) {
    const baseIndent = slotOf[i] * 3 + 3;
    const maxLen = Math.max(displayLabelOf[i].length, ...detailLinesOf[i].map((l) => l.length + 2));
    const w = baseIndent + maxLen;
    const cur = widthOf.get(events[i].root) ?? 0;
    if (w > cur) {
      widthOf.set(events[i].root, w);
    }
  }
  const maxTime = n > 0 ? Math.max(...events.map((e) => Math.round(e.time))) : 0;
  const timeColWidth = `+${maxTime}ms`.length;
  const lines = [];
  const header = [];
  for (const r of roots) {
    const w = widthOf.get(r);
    header.push(r.label.padStart(Math.ceil((w + r.label.length) / 2)).padEnd(w));
  }
  lines.push(`${" ".repeat(timeColWidth)} ${header.join("  ")}`.trimEnd());
  const lastChildOf = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const kids = childrenOf[i];
    if (kids.length > 0) {
      lastChildOf[i] = kids[kids.length - 1];
    }
  }
  const laneStacks = /* @__PURE__ */ new Map();
  for (const r of roots) {
    laneStacks.set(r, /* @__PURE__ */ new Set());
  }
  for (let i = 0; i < n; i++) {
    const event = events[i];
    const timeStr = `+${Math.round(event.time)}ms`.padStart(timeColWidth);
    const parts = [];
    for (const r of roots) {
      const w = widthOf.get(r);
      const stack2 = laneStacks.get(r);
      if (r === event.root) {
        const slot = slotOf[i];
        const indent = [];
        for (let s = 0; s < slot; s++) {
          let hasActive = false;
          for (const a of stack2) {
            if (slotOf[a] === s && lastChildOf[a] > i) {
              hasActive = true;
              break;
            }
          }
          indent.push(hasActive ? "\u2502  " : "   ");
        }
        const prefix = isLastChild[i] ? "\u2514\u2500 " : "\u251C\u2500 ";
        parts.push(`${indent.join("")}${prefix}${displayLabelOf[i]}`.padEnd(w));
      } else {
        const activeSlots = [];
        for (const a of stack2) {
          if (lastChildOf[a] > i) {
            activeSlots.push(slotOf[a]);
          }
        }
        const maxSlot = Math.max(...activeSlots, -1);
        const chars = new Array(Math.max(maxSlot + 1, 0)).fill("   ");
        for (const s of activeSlots) {
          chars[s] = "\u2502  ";
        }
        let nextJ = -1;
        for (let j = i + 1; j < n; j++) {
          if (events[j].root === r) {
            nextJ = j;
            break;
          }
        }
        if (nextJ >= 0 && parentOf[nextJ] >= 0) {
          const s = slotOf[nextJ];
          if (!isLastChild[nextJ]) {
            while (chars.length <= s) {
              chars.push("   ");
            }
            if (chars[s] === "   ") {
              chars[s] = "|  ";
            }
          }
        }
        while (chars.length > 0 && chars[chars.length - 1] === "   ") {
          chars.pop();
        }
        parts.push(chars.join("").padEnd(w));
      }
    }
    lines.push(`${timeStr} ${parts.join("  ")}`.trimEnd());
    const extras = detailLinesOf[i];
    if (extras.length > 0) {
      const slot = slotOf[i];
      const stackForExtras = laneStacks.get(event.root);
      const hasOpenChildren = childrenOf[i].length > 0;
      const extraIndent = [];
      for (let s = 0; s < slot; s++) {
        let hasActive = false;
        for (const a of stackForExtras) {
          if (slotOf[a] === s && lastChildOf[a] > i) {
            hasActive = true;
            break;
          }
        }
        extraIndent.push(hasActive ? "\u2502  " : "   ");
      }
      extraIndent.push(hasOpenChildren ? "\u2502  " : "   ");
      for (const extra of extras) {
        const extrasParts = [];
        for (const r of roots) {
          const w = widthOf.get(r);
          if (r === event.root) {
            extrasParts.push(`${extraIndent.join("")}${extra}`.padEnd(w));
          } else {
            const otherStack = laneStacks.get(r);
            const activeSlots = [];
            for (const a of otherStack) {
              if (lastChildOf[a] > i) {
                activeSlots.push(slotOf[a]);
              }
            }
            const maxSlot = Math.max(...activeSlots, -1);
            const chars = new Array(Math.max(maxSlot + 1, 0)).fill("   ");
            for (const s of activeSlots) {
              chars[s] = "\u2502  ";
            }
            while (chars.length > 0 && chars[chars.length - 1] === "   ") {
              chars.pop();
            }
            extrasParts.push(chars.join("").padEnd(w));
          }
        }
        const timePad = " ".repeat(timeColWidth);
        lines.push(`${timePad} ${extrasParts.join("  ")}`.trimEnd());
      }
    }
    const stack = laneStacks.get(event.root);
    if (childrenOf[i].length > 0) {
      stack.add(i);
    }
    let cur = i;
    while (isLastChild[cur]) {
      const p = parentOf[cur];
      if (p < 0) {
        break;
      }
      stack.delete(p);
      cur = p;
    }
  }
  return lines.join("\n");
}
function renderLaneGraph(history) {
  const { events } = history;
  if (events.length === 0) {
    return "";
  }
  const nodes = [];
  const syntheticForRoot = /* @__PURE__ */ new Map();
  const nodeByEvent = /* @__PURE__ */ new Map();
  const rootsWithChildren = /* @__PURE__ */ new Set();
  for (const e of events) {
    if (!e.parent) {
      rootsWithChildren.add(e.root);
    }
  }
  for (const e of events) {
    if (rootsWithChildren.has(e.root) && !syntheticForRoot.has(e.root)) {
      const syn = { label: `+${e.root.label}`, parent: void 0, isSynthetic: true };
      syntheticForRoot.set(e.root, syn);
      nodes.push(syn);
    }
    const timeStr = `+${e.time}ms`.padStart(7);
    const parent = e.parent ? nodeByEvent.get(e.parent) : syntheticForRoot.get(e.root);
    const node = { label: `[${timeStr}] ${e.label}`, parent, isSynthetic: false };
    nodeByEvent.set(e, node);
    nodes.push(node);
  }
  const n = nodes.length;
  const parentOf = new Array(n).fill(-1);
  const childrenOf = Array.from({ length: n }, () => []);
  const indexOfNode = /* @__PURE__ */ new Map();
  for (let i = 0; i < n; i++) {
    indexOfNode.set(nodes[i], i);
  }
  for (let i = 0; i < n; i++) {
    const p = nodes[i].parent;
    if (p) {
      const pi = indexOfNode.get(p);
      if (pi !== void 0) {
        parentOf[i] = pi;
        childrenOf[pi].push(i);
      }
    }
  }
  const colOf = new Array(n).fill(-1);
  let totalCols = 0;
  for (let i = 0; i < n; i++) {
    if (childrenOf[i].length > 0) {
      colOf[i] = totalCols++;
    }
  }
  if (totalCols === 0) {
    return events.map((e) => `[+${`${e.time}ms`.padStart(5)}] ${e.label}`).join("\n");
  }
  const active = new Array(totalCols).fill(-1);
  const lines = [];
  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    const pIdx = parentOf[i];
    const connectCol = pIdx >= 0 ? colOf[pIdx] : -1;
    const last = pIdx >= 0 && childrenOf[pIdx][childrenOf[pIdx].length - 1] === i;
    const opensCol = childrenOf[i].length > 0 ? colOf[i] : -1;
    const horizEnd = pIdx >= 0 ? opensCol >= 0 ? opensCol : totalCols : -1;
    const chars = [];
    for (let c = 0; c < totalCols; c++) {
      const isActive = active[c] >= 0;
      const isConnect = c === connectCol;
      const isOpen = c === opensCol && !isConnect;
      const inHoriz = connectCol >= 0 && c > connectCol && c < horizEnd;
      let g, s;
      if (isConnect) {
        g = last ? "\u2514" : "\u251C";
        s = "\u2500";
      } else if (isOpen && node.isSynthetic) {
        g = "+";
        s = node.label.slice(1, 2) || "?";
      } else if (isOpen && connectCol >= 0) {
        g = "\u2577";
        s = "\u2500";
      } else if (isOpen) {
        g = "\u2577";
        s = " ";
      } else if (inHoriz && isActive) {
        g = "\u253C";
        s = "\u2500";
      } else if (inHoriz) {
        g = "\u2500";
        s = "\u2500";
      } else if (isActive) {
        g = "\u2502";
        s = " ";
      } else {
        g = " ";
        s = " ";
      }
      chars.push(g, s);
    }
    if (last) {
      active[colOf[pIdx]] = -1;
    }
    if (opensCol >= 0) {
      active[opensCol] = i;
    }
    if (node.isSynthetic) {
      lines.push(chars.join("").trimEnd());
    } else {
      lines.push(`${chars.join("")}${node.label}`);
    }
  }
  return lines.join("\n");
}
export {
  buildHistoryFromTasks,
  renderLaneGraph,
  renderSwimlanes
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGV4ZWN1dGlvbkdyYXBoLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLyoqXG4gKiBQbGFpbiwgcmVuZGVyZXItZnJpZW5kbHkgZGVzY3JpcHRpb24gb2YgYW4gZXhlY3V0aW9uIGhpc3RvcnkgcHJvZHVjZWQgYnkgYVxuICogdHJhY2VkIHNjaGVkdWxlci4gVGhlc2UgdHlwZXMgaGF2ZSBubyBkZXBlbmRlbmN5IG9uIHRoZSB0cmFjaW5nIG9yXG4gKiBzY2hlZHVsaW5nIGltcGxlbWVudGF0aW9uIFx1MjAxNCB0aGV5IGNhbiBiZSBidWlsdCBieSBoYW5kIGluIHRlc3RzIG9yIGJ5IHRoZVxuICogYGJ1aWxkSGlzdG9yeUZyb21UYXNrc2AgYWRhcHRlciBiZWxvdy5cbiAqL1xuXG5leHBvcnQgaW50ZXJmYWNlIEV4ZWN1dGlvblJvb3Qge1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEV4ZWN1dGlvbkV2ZW50IHtcblx0LyoqIFJlbGF0aXZlIHRpbWUgKGUuZy4gbXMgc2luY2Ugc3RhcnRUaW1lKS4gTXVzdCBiZSA+PSAwIGFuZCBub24tZGVjcmVhc2luZyBpbiBoaXN0b3J5IG9yZGVyLiAqL1xuXHRyZWFkb25seSB0aW1lOiBudW1iZXI7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJvb3Q6IEV4ZWN1dGlvblJvb3Q7XG5cdC8qKiBgdW5kZWZpbmVkYCBtZWFucyB0aGlzIGV2ZW50IGlzIGEgZGlyZWN0IGNoaWxkIG9mIGl0cyByb290LiAqL1xuXHRyZWFkb25seSBwYXJlbnQ6IEV4ZWN1dGlvbkV2ZW50IHwgdW5kZWZpbmVkO1xuXHQvKiogQ2FsbGVyIGZyYW1lIGV4dHJhY3RlZCBmcm9tIHRoZSBzY2hlZHVsaW5nIHN0YWNrIHRyYWNlLiAqL1xuXHRyZWFkb25seSBkZXRhaWw/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRXhlY3V0aW9uSGlzdG9yeSB7XG5cdC8qKiBSb290cyBpbiBmaXJzdC1hcHBlYXJhbmNlIG9yZGVyIChjb2x1bW4gb3JkZXIgZm9yIHJlbmRlcmVycykuICovXG5cdHJlYWRvbmx5IHJvb3RzOiByZWFkb25seSBFeGVjdXRpb25Sb290W107XG5cdC8qKiBFdmVudHMgaW4gdGltZSBvcmRlci4gKi9cblx0cmVhZG9ubHkgZXZlbnRzOiByZWFkb25seSBFeGVjdXRpb25FdmVudFtdO1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gQWRhcHRlcjogU2NoZWR1bGVkVGFza1tdIC0+IEV4ZWN1dGlvbkhpc3Rvcnlcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmludGVyZmFjZSBUcmFjZUxpa2Uge1xuXHRyZWFkb25seSBwYXJlbnQ6IFRyYWNlTGlrZSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcm9vdDogeyByZWFkb25seSBsYWJlbDogc3RyaW5nIH07XG59XG5cbmludGVyZmFjZSBTY2hlZHVsZWRUYXNrTGlrZSB7XG5cdHJlYWRvbmx5IHRpbWU6IG51bWJlcjtcblx0cmVhZG9ubHkgc291cmNlOiB7IHRvU3RyaW5nKCk6IHN0cmluZzsgcmVhZG9ubHkgc3RhY2tUcmFjZT86IHN0cmluZyB9O1xuXHRyZWFkb25seSB0cmFjZT86IFRyYWNlTGlrZTtcbn1cblxuLyoqXG4gKiBBIGxvZyBlbnRyeSB0byB3ZWF2ZSBpbnRvIHRoZSBoaXN0b3J5IGFsb25nc2lkZSBzY2hlZHVsZWQgdGFza3MuIEVhY2ggbG9nIGlzXG4gKiB0YWdnZWQgd2l0aCB0aGUgdHJhY2UgdGhhdCB3YXMgY3VycmVudCB3aGVuIGl0IHdhcyBlbWl0dGVkLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIExvZ0VudHJ5TGlrZSB7XG5cdHJlYWRvbmx5IHRyYWNlOiBUcmFjZUxpa2U7XG5cdHJlYWRvbmx5IG1lc3NhZ2U6IHN0cmluZztcbn1cblxuLyoqXG4gKiBDb252ZXJ0IGEgbGlzdCBvZiBzY2hlZHVsZWQgdGFza3MgKGVhY2ggY2FycnlpbmcgYSBjYXVzYWwgYHRyYWNlYCkgaW50byBhXG4gKiBwbGFpbiBgRXhlY3V0aW9uSGlzdG9yeWAuIFVudHJhY2VkIHRhc2tzIGFyZSBkcm9wcGVkLiBBIHRhc2sncyBwYXJlbnQgZXZlbnRcbiAqIGlzIHRoZSBtb3N0IHJlY2VudCBlYXJsaWVyIHRhc2sgd2hvc2UgYHRyYWNlYCBpcyBgdGFzay50cmFjZS5wYXJlbnRgOyBpZlxuICogYHRhc2sudHJhY2UucGFyZW50YCBpcyB0aGUgdHJhY2Ugcm9vdCBpdHNlbGYsIHRoZSBldmVudCBoYXMgbm8gcGFyZW50IGV2ZW50XG4gKiAoaXQgaXMgYSBkaXJlY3QgY2hpbGQgb2YgdGhlIHJvb3QpLlxuICpcbiAqIGBsb2dzYCAoaWYgZ2l2ZW4pIGFyZSBpbnRlcmxlYXZlZCBhcyBzeW50aGV0aWMgZXZlbnRzOiBlYWNoIGxvZydzIHBhcmVudCBpc1xuICogdGhlIHRhc2sgZXZlbnQgd2hvc2UgdHJhY2UgbWF0Y2hlcyB0aGUgbG9nJ3MgY3VycmVudCB0cmFjZSBhdCBlbWlzc2lvblxuICogdGltZSAob3IgdGhlIG5lYXJlc3QgYW5jZXN0b3IgdGFzayBldmVudCksIGFuZCBpdHMgdGltZSBpcyBpbmhlcml0ZWQgZnJvbVxuICogdGhhdCBwYXJlbnQuIFdpdGhpbiBhIHNpbmdsZSBwYXJlbnQgdGFzaywgbG9ncyBhcmUga2VwdCBpbiBlbWlzc2lvbiBvcmRlclxuICogYW5kIGluc2VydGVkIGRpcmVjdGx5IGFmdGVyIHRoZSBwYXJlbnQgZXZlbnQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZEhpc3RvcnlGcm9tVGFza3MoXG5cdHRhc2tzOiByZWFkb25seSBTY2hlZHVsZWRUYXNrTGlrZVtdLFxuXHRzdGFydFRpbWU6IG51bWJlcixcblx0bG9nczogcmVhZG9ubHkgTG9nRW50cnlMaWtlW10gPSBbXSxcbik6IEV4ZWN1dGlvbkhpc3Rvcnkge1xuXHRjb25zdCByb290QnlUcmFjZSA9IG5ldyBNYXA8dW5rbm93biwgRXhlY3V0aW9uUm9vdD4oKTtcblx0Y29uc3Qgcm9vdHM6IEV4ZWN1dGlvblJvb3RbXSA9IFtdO1xuXHRjb25zdCBldmVudEJ5VHJhY2UgPSBuZXcgTWFwPHVua25vd24sIEV4ZWN1dGlvbkV2ZW50PigpO1xuXHRjb25zdCB0YXNrRXZlbnRzOiBFeGVjdXRpb25FdmVudFtdID0gW107XG5cblx0Zm9yIChjb25zdCB0YXNrIG9mIHRhc2tzKSB7XG5cdFx0Y29uc3QgdHJhY2UgPSB0YXNrLnRyYWNlO1xuXHRcdGlmICghdHJhY2UpIHsgY29udGludWU7IH1cblxuXHRcdGxldCByb290ID0gcm9vdEJ5VHJhY2UuZ2V0KHRyYWNlLnJvb3QpO1xuXHRcdGlmICghcm9vdCkge1xuXHRcdFx0cm9vdCA9IHsgbGFiZWw6IHRyYWNlLnJvb3QubGFiZWwgfTtcblx0XHRcdHJvb3RCeVRyYWNlLnNldCh0cmFjZS5yb290LCByb290KTtcblx0XHRcdHJvb3RzLnB1c2gocm9vdCk7XG5cdFx0fVxuXG5cdFx0Ly8gRmluZCB0aGUgcGFyZW50IGV2ZW50IGJ5IHdhbGtpbmcgdXAgdGhlIHRyYWNlIGNoYWluIHVudGlsIHdlIGhpdFxuXHRcdC8vIGVpdGhlciBhIHRyYWNlIHdob3NlIGV2ZW50IHdlIGtub3csIG9yIHRoZSB0cmFjZSByb290LlxuXHRcdGxldCBwYXJlbnRFdmVudDogRXhlY3V0aW9uRXZlbnQgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChsZXQgcCA9IHRyYWNlLnBhcmVudDsgcDsgcCA9IHAucGFyZW50KSB7XG5cdFx0XHRjb25zdCBlID0gZXZlbnRCeVRyYWNlLmdldChwKTtcblx0XHRcdGlmIChlKSB7IHBhcmVudEV2ZW50ID0gZTsgYnJlYWs7IH1cblx0XHR9XG5cblx0XHRjb25zdCBldmVudDogRXhlY3V0aW9uRXZlbnQgPSB7XG5cdFx0XHR0aW1lOiB0YXNrLnRpbWUgLSBzdGFydFRpbWUsXG5cdFx0XHRsYWJlbDogYCR7dGFzay5zb3VyY2V9YCxcblx0XHRcdHJvb3QsXG5cdFx0XHRwYXJlbnQ6IHBhcmVudEV2ZW50LFxuXHRcdFx0ZGV0YWlsOiBleHRyYWN0Q2FsbGVyRnJhbWUodGFzay5zb3VyY2Uuc3RhY2tUcmFjZSksXG5cdFx0fTtcblx0XHRldmVudEJ5VHJhY2Uuc2V0KHRyYWNlLCBldmVudCk7XG5cdFx0dGFza0V2ZW50cy5wdXNoKGV2ZW50KTtcblx0fVxuXG5cdC8vIEdyb3VwIGxvZyBlbnRyaWVzIGJ5IHRoZWlyIHBhcmVudCB0YXNrIGV2ZW50LCBwcmVzZXJ2aW5nIGVtaXNzaW9uXG5cdC8vIG9yZGVyIHdpdGhpbiBlYWNoIGdyb3VwLiBBIGxvZyB3aXRob3V0IGFuIGVuY2xvc2luZyB0YXNrIGV2ZW50IGlzXG5cdC8vIGRyb3BwZWQgKGUuZy4gbG9ncyBlbWl0dGVkIGF0IHJvb3QgYmVmb3JlIGFueSB0YXNrIHJhbikuXG5cdGNvbnN0IGxvZ3NCeVBhcmVudCA9IG5ldyBNYXA8RXhlY3V0aW9uRXZlbnQsIEV4ZWN1dGlvbkV2ZW50W10+KCk7XG5cdGZvciAoY29uc3QgZW50cnkgb2YgbG9ncykge1xuXHRcdGxldCBwYXJlbnRFdmVudDogRXhlY3V0aW9uRXZlbnQgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChsZXQgcDogVHJhY2VMaWtlIHwgdW5kZWZpbmVkID0gZW50cnkudHJhY2U7IHA7IHAgPSBwLnBhcmVudCkge1xuXHRcdFx0Y29uc3QgZSA9IGV2ZW50QnlUcmFjZS5nZXQocCk7XG5cdFx0XHRpZiAoZSkgeyBwYXJlbnRFdmVudCA9IGU7IGJyZWFrOyB9XG5cdFx0fVxuXHRcdGlmICghcGFyZW50RXZlbnQpIHsgY29udGludWU7IH1cblxuXHRcdGNvbnN0IGxvZ0V2ZW50OiBFeGVjdXRpb25FdmVudCA9IHtcblx0XHRcdHRpbWU6IHBhcmVudEV2ZW50LnRpbWUsXG5cdFx0XHRsYWJlbDogYGxvZzogJHtlbnRyeS5tZXNzYWdlfWAsXG5cdFx0XHRyb290OiBwYXJlbnRFdmVudC5yb290LFxuXHRcdFx0cGFyZW50OiBwYXJlbnRFdmVudCxcblx0XHR9O1xuXHRcdGNvbnN0IGJ1Y2tldCA9IGxvZ3NCeVBhcmVudC5nZXQocGFyZW50RXZlbnQpO1xuXHRcdGlmIChidWNrZXQpIHsgYnVja2V0LnB1c2gobG9nRXZlbnQpOyB9XG5cdFx0ZWxzZSB7IGxvZ3NCeVBhcmVudC5zZXQocGFyZW50RXZlbnQsIFtsb2dFdmVudF0pOyB9XG5cdH1cblxuXHQvLyBJbnRlcmxlYXZlOiBlYWNoIHRhc2sgZXZlbnQgZm9sbG93ZWQgYnkgaXRzIGxvZ3MgaW4gZW1pc3Npb24gb3JkZXIuXG5cdGNvbnN0IGV2ZW50czogRXhlY3V0aW9uRXZlbnRbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGUgb2YgdGFza0V2ZW50cykge1xuXHRcdGV2ZW50cy5wdXNoKGUpO1xuXHRcdGNvbnN0IGxzID0gbG9nc0J5UGFyZW50LmdldChlKTtcblx0XHRpZiAobHMpIHsgZXZlbnRzLnB1c2goLi4ubHMpOyB9XG5cdH1cblxuXHRyZXR1cm4geyByb290cywgZXZlbnRzIH07XG59XG5cbi8qKlxuICogRXh0cmFjdCB1cCB0byB7QGxpbmsgTUFYX0RFVEFJTF9GUkFNRVN9IHN0YWNrIGZyYW1lcyB0aGF0IGFyZSBub3QgZnJvbVxuICogdGhlIHNjaGVkdWxlci90cmFjaW5nIGluZnJhc3RydWN0dXJlLiBSZXR1cm5zIHRoZSBmcmFtZXMgam9pbmVkIGJ5XG4gKiBuZXdsaW5lIChjYWxsZXJzIG1heSByZW5kZXIgdGhlbSBzdGFja2VkKSBvciBgdW5kZWZpbmVkYCB3aGVuIG5vbmUuXG4gKi9cbmNvbnN0IF9za2lwRnJhbWVQYXR0ZXJucyA9IFtcblx0L1tcXFxcL112aXJ0dWFsU2NoZWR1bGluZ1tcXFxcL10vLFxuXHQvW1xcXFwvXXZzW1xcXFwvXWJhc2VbXFxcXC9dY29tbW9uW1xcXFwvXWFzeW5jXFwuLyxcblx0L3RpbWVUcmF2ZWxTY2hlZHVsZXJ8dHJhY2VhYmxlVGltZUFwaS8sXG5cdC9SdW5PbmNlU2NoZWR1bGVyXFwuc2NoZWR1bGUvLFxuXHQvc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZS8sXG5cdC9UaW1lb3V0VGltZXJcXC5jYW5jZWxBbmRTZXQvLFxuXHQvVGltZW91dFRpbWVyXFwuc2V0SWZOb3RTZXQvLFxuXHQvdGltZW91dERlZmVycmVkLyxcblx0L2NyZWF0ZVRpbWVvdXQvLFxuXTtcblxuY29uc3QgTUFYX0RFVEFJTF9GUkFNRVMgPSA1O1xuXG5mdW5jdGlvbiBleHRyYWN0Q2FsbGVyRnJhbWUoc3RhY2tUcmFjZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFzdGFja1RyYWNlKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0Y29uc3QgZnJhbWVzOiBzdHJpbmdbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGxpbmUgb2Ygc3RhY2tUcmFjZS5zcGxpdCgnXFxuJykpIHtcblx0XHRjb25zdCB0cmltbWVkID0gbGluZS50cmltKCk7XG5cdFx0aWYgKCF0cmltbWVkLnN0YXJ0c1dpdGgoJ2F0ICcpKSB7IGNvbnRpbnVlOyB9XG5cdFx0aWYgKF9za2lwRnJhbWVQYXR0ZXJucy5zb21lKHAgPT4gcC50ZXN0KHRyaW1tZWQpKSkgeyBjb250aW51ZTsgfVxuXHRcdGZyYW1lcy5wdXNoKHRyaW1tZWQuc2xpY2UoMykpO1xuXHRcdGlmIChmcmFtZXMubGVuZ3RoID49IE1BWF9ERVRBSUxfRlJBTUVTKSB7IGJyZWFrOyB9XG5cdH1cblx0cmV0dXJuIGZyYW1lcy5sZW5ndGggPT09IDAgPyB1bmRlZmluZWQgOiBmcmFtZXMuam9pbignXFxuJyk7XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBSZW5kZXJlcjogc3dpbWxhbmUgKG9uZSBjb2x1bW4gcGVyIHJvb3QpXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIFJlbmRlciBgaGlzdG9yeWAgYXMgYSBzd2ltbGFuZSBkaWFncmFtOiBvbmUgY29sdW1uIHBlciByb290LCBldmVudHMgaW4gdGhlXG4gKiBjb2x1bW4gb2YgdGhlaXIgcm9vdCwgcGFyZW50XHUyMTkyY2hpbGQgc2hvd24gdmlhIGBcdTI1MUNcdTI1MDBgL2BcdTI1MTRcdTI1MDBgIGluZGVudGF0aW9uLCBhY3RpdmVcbiAqIGFuY2VzdG9ycyBzaG93biB2aWEgYFx1MjUwMmAgY29udGludWF0aW9uIGxpbmVzLlxuICpcbiAqIEV4YW1wbGU6XG4gKiBgYGBcbiAqICAgICAgICAgICAgICAgICAgQSAgICAgICAgICAgQlxuICogICArMG1zIFx1MjUxQ1x1MjUwMCBzZXRUaW1lb3V0XG4gKiAgKzEwbXMgXHUyNTAyICAgICAgICAgICBcdTI1MUNcdTI1MDAgc2V0VGltZW91dFxuICogICsxNm1zIFx1MjUxQ1x1MjUwMCByQUYgICAgICBcdTI1MDJcbiAqICArNTBtcyBcdTI1MTRcdTI1MDAgc2V0VGltZW91dFxuICogYGBgXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJTd2ltbGFuZXMoaGlzdG9yeTogRXhlY3V0aW9uSGlzdG9yeSk6IHN0cmluZyB7XG5cdGNvbnN0IHsgcm9vdHMsIGV2ZW50cyB9ID0gaGlzdG9yeTtcblx0aWYgKGV2ZW50cy5sZW5ndGggPT09IDApIHsgcmV0dXJuICcoZW1wdHkgaGlzdG9yeSknOyB9XG5cdGlmIChyb290cy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gZXZlbnRzLm1hcChlID0+IGBbKyR7ZS50aW1lfW1zXSAke2UubGFiZWx9YCkuam9pbignXFxuJyk7XG5cdH1cblxuXHRjb25zdCBuID0gZXZlbnRzLmxlbmd0aDtcblxuXHQvLyBQYXJlbnQgaW5kZXggcGVyIGV2ZW50ICgtMSA9IGRpcmVjdCBjaGlsZCBvZiByb290KS5cblx0Y29uc3QgcGFyZW50T2YgPSBuZXcgQXJyYXk8bnVtYmVyPihuKS5maWxsKC0xKTtcblx0Y29uc3QgY2hpbGRyZW5PZjogbnVtYmVyW11bXSA9IEFycmF5LmZyb20oeyBsZW5ndGg6IG4gfSwgKCkgPT4gW10pO1xuXHRjb25zdCBpbmRleE9mRXZlbnQgPSBuZXcgTWFwPEV4ZWN1dGlvbkV2ZW50LCBudW1iZXI+KCk7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7IGluZGV4T2ZFdmVudC5zZXQoZXZlbnRzW2ldLCBpKTsgfVxuXHRmb3IgKGxldCBpID0gMDsgaSA8IG47IGkrKykge1xuXHRcdGNvbnN0IHAgPSBldmVudHNbaV0ucGFyZW50O1xuXHRcdGlmIChwKSB7XG5cdFx0XHRjb25zdCBwaSA9IGluZGV4T2ZFdmVudC5nZXQocCk7XG5cdFx0XHRpZiAocGkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRwYXJlbnRPZltpXSA9IHBpO1xuXHRcdFx0XHRjaGlsZHJlbk9mW3BpXS5wdXNoKGkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIElzIHRoaXMgZXZlbnQgdGhlIGxhc3QgY2hpbGQgb2YgaXRzIHBhcmVudCBldmVudD9cblx0Y29uc3QgaXNMYXN0Q2hpbGQgPSBuZXcgQXJyYXk8Ym9vbGVhbj4obikuZmlsbChmYWxzZSk7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG5cdFx0Y29uc3QgcCA9IHBhcmVudE9mW2ldO1xuXHRcdGlmIChwID49IDAgJiYgY2hpbGRyZW5PZltwXVtjaGlsZHJlbk9mW3BdLmxlbmd0aCAtIDFdID09PSBpKSB7IGlzTGFzdENoaWxkW2ldID0gdHJ1ZTsgfVxuXHR9XG5cblx0Ly8gU2xvdCA9IHZpc3VhbCBjb2x1bW4gaW5kZXggZm9yIGluZGVudGF0aW9uLiBCeSBkZWZhdWx0IGV2ZXJ5IGNoaWxkXG5cdC8vIGdldHMgaXRzIG93biBjb2x1bW4gKHNsb3QgPSBwYXJlbnQuc2xvdCArIDEpIHNvIHB1cmUgbGFzdC1jaGlsZCBjaGFpbnNcblx0Ly8gc3RpbGwgc2hvdyB0aGVpciBkZXB0aCBzdHJ1Y3R1cmUuIE9uY2Ugd2UgcGFzcyB0aGUgZGVwdGggdGhyZXNob2xkLFxuXHQvLyBsYXN0LWNoaWxkcmVuIGNvbGxhcHNlIGludG8gdGhlaXIgcGFyZW50J3Mgc2xvdCB0byBrZWVwIGRlZXBseSBuZXN0ZWRcblx0Ly8gdHJhY2VzIGZyb20gd2Fsa2luZyBvZmYgdGhlIHNjcmVlbi5cblx0Y29uc3QgQ09MTEFQU0VfREVQVEhfVEhSRVNIT0xEID0gNjtcblx0Y29uc3QgZGVwdGhPZiA9IG5ldyBBcnJheTxudW1iZXI+KG4pLmZpbGwoMCk7XG5cdGNvbnN0IHNsb3RPZiA9IG5ldyBBcnJheTxudW1iZXI+KG4pLmZpbGwoMCk7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG5cdFx0Y29uc3QgcCA9IHBhcmVudE9mW2ldO1xuXHRcdGlmIChwID49IDApIHtcblx0XHRcdGRlcHRoT2ZbaV0gPSBkZXB0aE9mW3BdICsgMTtcblx0XHRcdGNvbnN0IGNvbGxhcHNlID0gaXNMYXN0Q2hpbGRbaV0gJiYgZGVwdGhPZltpXSA+PSBDT0xMQVBTRV9ERVBUSF9USFJFU0hPTEQ7XG5cdFx0XHRzbG90T2ZbaV0gPSBzbG90T2ZbcF0gKyAoY29sbGFwc2UgPyAwIDogMSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gRGlzcGxheSBsYWJlbCA9IGxhYmVsIHBsdXMgdGhlIGNhbGxlciBzdGFjayBmcmFtZSB3aGVuIHByZXNlbnQsXG5cdC8vIGUuZy4gYHNldFRpbWVvdXQgXHUwMEI3IE15Q2xhc3MuZm9vIChmaWxlLnRzOjQyKWAuIENvbXB1dGVkIG9uY2Ugc28gd2lkdGhcblx0Ly8gbWF0aCBhbmQgdGhlIHBlci1yb3cgcmVuZGVyIGFncmVlLiBgZGV0YWlsTGluZXNgIGhvbGRzIGFueSBhZGRpdGlvbmFsXG5cdC8vIHN0YWNrIGZyYW1lcyBiZXlvbmQgdGhlIGZpcnN0OyB0aGV5IGFyZSByZW5kZXJlZCBhcyBjb250aW51YXRpb24gcm93cy5cblx0Y29uc3QgZGlzcGxheUxhYmVsT2YgPSBuZXcgQXJyYXk8c3RyaW5nPihuKTtcblx0Y29uc3QgZGV0YWlsTGluZXNPZiA9IG5ldyBBcnJheTxyZWFkb25seSBzdHJpbmdbXT4obik7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG5cdFx0Y29uc3QgZSA9IGV2ZW50c1tpXTtcblx0XHRjb25zdCBmcmFtZXMgPSBlLmRldGFpbCA/IGUuZGV0YWlsLnNwbGl0KCdcXG4nKSA6IFtdO1xuXHRcdGRpc3BsYXlMYWJlbE9mW2ldID0gZnJhbWVzLmxlbmd0aCA+IDAgPyBgJHtlLmxhYmVsfSBcdTAwQjcgJHtmcmFtZXNbMF19YCA6IGUubGFiZWw7XG5cdFx0ZGV0YWlsTGluZXNPZltpXSA9IGZyYW1lcy5zbGljZSgxKTtcblx0fVxuXG5cdC8vIENvbHVtbiB3aWR0aCBwZXIgcm9vdDogaW5kZW50YXRpb24gdXNlcyBzbG90cyAobGFzdC1jaGlsZHJlbiBjb2xsYXBzZVxuXHQvLyBpbnRvIHRoZWlyIHBhcmVudCdzIHNsb3QpLCBzbyB3aWR0aCBtdXN0IGJlIHNsb3QtYmFzZWQgdG8gYXZvaWRcblx0Ly8gcmVzZXJ2aW5nIGVtcHR5IHNwYWNlIGZvciBkZWdlbmVyYXRlIGxhc3QtY2hpbGQgY2hhaW5zLlxuXHRjb25zdCB3aWR0aE9mID0gbmV3IE1hcDxFeGVjdXRpb25Sb290LCBudW1iZXI+KCk7XG5cdGZvciAoY29uc3QgciBvZiByb290cykgeyB3aWR0aE9mLnNldChyLCByLmxhYmVsLmxlbmd0aCk7IH1cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBuOyBpKyspIHtcblx0XHRjb25zdCBiYXNlSW5kZW50ID0gc2xvdE9mW2ldICogMyArIDM7XG5cdFx0Y29uc3QgbWF4TGVuID0gTWF0aC5tYXgoZGlzcGxheUxhYmVsT2ZbaV0ubGVuZ3RoLCAuLi5kZXRhaWxMaW5lc09mW2ldLm1hcChsID0+IGwubGVuZ3RoICsgMikpO1xuXHRcdGNvbnN0IHcgPSBiYXNlSW5kZW50ICsgbWF4TGVuO1xuXHRcdGNvbnN0IGN1ciA9IHdpZHRoT2YuZ2V0KGV2ZW50c1tpXS5yb290KSA/PyAwO1xuXHRcdGlmICh3ID4gY3VyKSB7IHdpZHRoT2Yuc2V0KGV2ZW50c1tpXS5yb290LCB3KTsgfVxuXHR9XG5cblx0Ly8gQ29tcHV0ZSB0aW1lIGNvbHVtbiB3aWR0aCBiYXNlZCBvbiBtYXggdGltZSAocm91bmRlZCkuXG5cdGNvbnN0IG1heFRpbWUgPSBuID4gMCA/IE1hdGgubWF4KC4uLmV2ZW50cy5tYXAoZSA9PiBNYXRoLnJvdW5kKGUudGltZSkpKSA6IDA7XG5cdGNvbnN0IHRpbWVDb2xXaWR0aCA9IGArJHttYXhUaW1lfW1zYC5sZW5ndGg7XG5cblx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cblx0Ly8gSGVhZGVyOiByb290IGxhYmVscyBjZW50ZXJlZCBpbiB0aGVpciBjb2x1bW5zLlxuXHRjb25zdCBoZWFkZXI6IHN0cmluZ1tdID0gW107XG5cdGZvciAoY29uc3QgciBvZiByb290cykge1xuXHRcdGNvbnN0IHcgPSB3aWR0aE9mLmdldChyKSE7XG5cdFx0aGVhZGVyLnB1c2goci5sYWJlbC5wYWRTdGFydChNYXRoLmNlaWwoKHcgKyByLmxhYmVsLmxlbmd0aCkgLyAyKSkucGFkRW5kKHcpKTtcblx0fVxuXHRsaW5lcy5wdXNoKGAkeycgJy5yZXBlYXQodGltZUNvbFdpZHRoKX0gJHtoZWFkZXIuam9pbignICAnKX1gLnRyaW1FbmQoKSk7XG5cblx0Ly8gQ29tcHV0ZSBsYXN0Q2hpbGQgaW5kZXggZm9yIGVhY2ggZXZlbnQgKGZvciBkcmF3aW5nIGNvbnRpbnVhdGlvbiBsaW5lcykuXG5cdGNvbnN0IGxhc3RDaGlsZE9mID0gbmV3IEFycmF5PG51bWJlcj4obikuZmlsbCgtMSk7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG5cdFx0Y29uc3Qga2lkcyA9IGNoaWxkcmVuT2ZbaV07XG5cdFx0aWYgKGtpZHMubGVuZ3RoID4gMCkgeyBsYXN0Q2hpbGRPZltpXSA9IGtpZHNba2lkcy5sZW5ndGggLSAxXTsgfVxuXHR9XG5cblx0Ly8gUGVyLXJvb3Q6IHNldCBvZiBcImFjdGl2ZSBhbmNlc3RvclwiIGV2ZW50IGluZGljZXMgKGV2ZW50cyB3aXRoIGNoaWxkcmVuXG5cdC8vIHdob3NlIGxhc3QgY2hpbGQgaGFzIG5vdCB5ZXQgYmVlbiByZW5kZXJlZCwgaS5lLiBsYXN0Q2hpbGRPZlthXSA+IGkpLlxuXHRjb25zdCBsYW5lU3RhY2tzID0gbmV3IE1hcDxFeGVjdXRpb25Sb290LCBTZXQ8bnVtYmVyPj4oKTtcblx0Zm9yIChjb25zdCByIG9mIHJvb3RzKSB7IGxhbmVTdGFja3Muc2V0KHIsIG5ldyBTZXQoKSk7IH1cblxuXHRmb3IgKGxldCBpID0gMDsgaSA8IG47IGkrKykge1xuXHRcdGNvbnN0IGV2ZW50ID0gZXZlbnRzW2ldO1xuXHRcdGNvbnN0IHRpbWVTdHIgPSBgKyR7TWF0aC5yb3VuZChldmVudC50aW1lKX1tc2AucGFkU3RhcnQodGltZUNvbFdpZHRoKTtcblxuXHRcdGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgciBvZiByb290cykge1xuXHRcdFx0Y29uc3QgdyA9IHdpZHRoT2YuZ2V0KHIpITtcblx0XHRcdGNvbnN0IHN0YWNrID0gbGFuZVN0YWNrcy5nZXQocikhO1xuXG5cdFx0XHRpZiAociA9PT0gZXZlbnQucm9vdCkge1xuXHRcdFx0XHQvLyBFdmVudCBsaW5lOiBzbG90LWJhc2VkIGluZGVudGF0aW9uLCB0aGVuIGBcdTI1MUNcdTI1MDBgL2BcdTI1MTRcdTI1MDBgICsgbGFiZWwuXG5cdFx0XHRcdC8vIEZvciBlYWNoIHNsb3QgcyBpbiAwLi4oc2xvdC0xKSwgc2hvdyBgXHUyNTAyICBgIGlmIGFuIGFuY2VzdG9yXG5cdFx0XHRcdC8vIGF0IHNsb3QgcyBpcyBzdGlsbCBhY3RpdmUgKGxhc3RDaGlsZCA+IGN1cnJlbnQpLCBlbHNlIGAgICBgLlxuXHRcdFx0XHRjb25zdCBzbG90ID0gc2xvdE9mW2ldO1xuXHRcdFx0XHRjb25zdCBpbmRlbnQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdGZvciAobGV0IHMgPSAwOyBzIDwgc2xvdDsgcysrKSB7XG5cdFx0XHRcdFx0bGV0IGhhc0FjdGl2ZSA9IGZhbHNlO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgYSBvZiBzdGFjaykge1xuXHRcdFx0XHRcdFx0aWYgKHNsb3RPZlthXSA9PT0gcyAmJiBsYXN0Q2hpbGRPZlthXSA+IGkpIHsgaGFzQWN0aXZlID0gdHJ1ZTsgYnJlYWs7IH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aW5kZW50LnB1c2goaGFzQWN0aXZlID8gJ1x1MjUwMiAgJyA6ICcgICAnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBwcmVmaXggPSBpc0xhc3RDaGlsZFtpXSA/ICdcdTI1MTRcdTI1MDAgJyA6ICdcdTI1MUNcdTI1MDAgJztcblx0XHRcdFx0cGFydHMucHVzaChgJHtpbmRlbnQuam9pbignJyl9JHtwcmVmaXh9JHtkaXNwbGF5TGFiZWxPZltpXX1gLnBhZEVuZCh3KSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBDcm9zcy1sYW5lIGNvbnRpbnVhdGlvbi4gRHJhdyBgXHUyNTAyYCBhdCBlYWNoIHNsb3Qgb2NjdXBpZWQgYnlcblx0XHRcdFx0Ly8gYW4gYWN0aXZlIGFuY2VzdG9yIChsYXN0Q2hpbGQgPiBpKS4gQWxzbyBzaG93IGEgYHxgIHBsYWNlaG9sZGVyXG5cdFx0XHRcdC8vIGF0IHRoZSBzbG90IG9mIHRoZSBuZXh0IHVwY29taW5nIGV2ZW50IGlmIGl0J3MgYSBub24tbGFzdCBjaGlsZC5cblx0XHRcdFx0Y29uc3QgYWN0aXZlU2xvdHM6IG51bWJlcltdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgYSBvZiBzdGFjaykge1xuXHRcdFx0XHRcdGlmIChsYXN0Q2hpbGRPZlthXSA+IGkpIHsgYWN0aXZlU2xvdHMucHVzaChzbG90T2ZbYV0pOyB9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbWF4U2xvdCA9IE1hdGgubWF4KC4uLmFjdGl2ZVNsb3RzLCAtMSk7XG5cdFx0XHRcdGNvbnN0IGNoYXJzOiBzdHJpbmdbXSA9IG5ldyBBcnJheShNYXRoLm1heChtYXhTbG90ICsgMSwgMCkpLmZpbGwoJyAgICcpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHMgb2YgYWN0aXZlU2xvdHMpIHsgY2hhcnNbc10gPSAnXHUyNTAyICAnOyB9XG5cblx0XHRcdFx0Ly8gRmluZCB0aGUgbmV4dCBldmVudCBpbiByb290IHIgc3RyaWN0bHkgYWZ0ZXIgaS5cblx0XHRcdFx0bGV0IG5leHRKID0gLTE7XG5cdFx0XHRcdGZvciAobGV0IGogPSBpICsgMTsgaiA8IG47IGorKykge1xuXHRcdFx0XHRcdGlmIChldmVudHNbal0ucm9vdCA9PT0gcikgeyBuZXh0SiA9IGo7IGJyZWFrOyB9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG5leHRKID49IDAgJiYgcGFyZW50T2ZbbmV4dEpdID49IDApIHtcblx0XHRcdFx0XHRjb25zdCBzID0gc2xvdE9mW25leHRKXTtcblx0XHRcdFx0XHQvLyBSZXNlcnZlIHNsb3QgaWYgbmV4dCBldmVudCB3aWxsIG9wZW4gYSBuZXcgYnJhbmNoIChcdTI1MUNcdTI1MDApLlxuXHRcdFx0XHRcdGlmICghaXNMYXN0Q2hpbGRbbmV4dEpdKSB7XG5cdFx0XHRcdFx0XHR3aGlsZSAoY2hhcnMubGVuZ3RoIDw9IHMpIHsgY2hhcnMucHVzaCgnICAgJyk7IH1cblx0XHRcdFx0XHRcdGlmIChjaGFyc1tzXSA9PT0gJyAgICcpIHsgY2hhcnNbc10gPSAnfCAgJzsgfVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFRyaW0gdHJhaWxpbmcgZW1wdHkgY2VsbHMuXG5cdFx0XHRcdHdoaWxlIChjaGFycy5sZW5ndGggPiAwICYmIGNoYXJzW2NoYXJzLmxlbmd0aCAtIDFdID09PSAnICAgJykgeyBjaGFycy5wb3AoKTsgfVxuXHRcdFx0XHRwYXJ0cy5wdXNoKGNoYXJzLmpvaW4oJycpLnBhZEVuZCh3KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGluZXMucHVzaChgJHt0aW1lU3RyfSAke3BhcnRzLmpvaW4oJyAgJyl9YC50cmltRW5kKCkpO1xuXG5cdFx0Ly8gQ29udGludWF0aW9uIGxpbmVzIGZvciBhbnkgZXh0cmEgc3RhY2sgZnJhbWVzLiBJbmRlbnRlZCB1bmRlciB0aGVcblx0XHQvLyBsYWJlbCwgd2l0aCBubyB0aW1lIGNvbHVtbiwgbm8gYFx1MjUxQ1x1MjUwMGAvYFx1MjUxNFx1MjUwMGAgZ2x5cGgsIGFuZCBgXHUyNTAyICBgXG5cdFx0Ly8gY29udGludWF0aW9ucyBmb3IgYWN0aXZlIGFuY2VzdG9yIGxhbmVzIChpbmNsdWRpbmcgdGhpcyBldmVudCBpdHNlbGZcblx0XHQvLyB3aGVuIGl0IGhhcyBjaGlsZHJlbiB0aGF0IGhhdmVuJ3QgYmVlbiByZW5kZXJlZCB5ZXQpLlxuXHRcdGNvbnN0IGV4dHJhcyA9IGRldGFpbExpbmVzT2ZbaV07XG5cdFx0aWYgKGV4dHJhcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBzbG90ID0gc2xvdE9mW2ldO1xuXHRcdFx0Y29uc3Qgc3RhY2tGb3JFeHRyYXMgPSBsYW5lU3RhY2tzLmdldChldmVudC5yb290KSE7XG5cdFx0XHQvLyBQcmV0ZW5kIHRoaXMgZXZlbnQgaXMgYWxyZWFkeSBvbiB0aGUgbGFuZSBzdGFjayBzbyBpdHMgY29sdW1uXG5cdFx0XHQvLyBnZXRzIGEgY29udGludWF0aW9uIGdseXBoIGJlbmVhdGggdGhlIGBcdTI1MUNcdTI1MDBgL2BcdTI1MTRcdTI1MDBgLlxuXHRcdFx0Y29uc3QgaGFzT3BlbkNoaWxkcmVuID0gY2hpbGRyZW5PZltpXS5sZW5ndGggPiAwO1xuXHRcdFx0Y29uc3QgZXh0cmFJbmRlbnQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRmb3IgKGxldCBzID0gMDsgcyA8IHNsb3Q7IHMrKykge1xuXHRcdFx0XHRsZXQgaGFzQWN0aXZlID0gZmFsc2U7XG5cdFx0XHRcdGZvciAoY29uc3QgYSBvZiBzdGFja0ZvckV4dHJhcykge1xuXHRcdFx0XHRcdGlmIChzbG90T2ZbYV0gPT09IHMgJiYgbGFzdENoaWxkT2ZbYV0gPiBpKSB7IGhhc0FjdGl2ZSA9IHRydWU7IGJyZWFrOyB9XG5cdFx0XHRcdH1cblx0XHRcdFx0ZXh0cmFJbmRlbnQucHVzaChoYXNBY3RpdmUgPyAnXHUyNTAyICAnIDogJyAgICcpO1xuXHRcdFx0fVxuXHRcdFx0ZXh0cmFJbmRlbnQucHVzaChoYXNPcGVuQ2hpbGRyZW4gPyAnXHUyNTAyICAnIDogJyAgICcpO1xuXHRcdFx0Zm9yIChjb25zdCBleHRyYSBvZiBleHRyYXMpIHtcblx0XHRcdFx0Y29uc3QgZXh0cmFzUGFydHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgciBvZiByb290cykge1xuXHRcdFx0XHRcdGNvbnN0IHcgPSB3aWR0aE9mLmdldChyKSE7XG5cdFx0XHRcdFx0aWYgKHIgPT09IGV2ZW50LnJvb3QpIHtcblx0XHRcdFx0XHRcdGV4dHJhc1BhcnRzLnB1c2goYCR7ZXh0cmFJbmRlbnQuam9pbignJyl9JHtleHRyYX1gLnBhZEVuZCh3KSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIFJldXNlIHRoZSBzYW1lIGNvbnRpbnVhdGlvbiBsb2dpYzogYW55IGFjdGl2ZSBsYW5lIG9uXG5cdFx0XHRcdFx0XHQvLyBvdGhlciByb290cyBuZWVkcyBgXHUyNTAyYCBnbHlwaHMuXG5cdFx0XHRcdFx0XHRjb25zdCBvdGhlclN0YWNrID0gbGFuZVN0YWNrcy5nZXQocikhO1xuXHRcdFx0XHRcdFx0Y29uc3QgYWN0aXZlU2xvdHM6IG51bWJlcltdID0gW107XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGEgb2Ygb3RoZXJTdGFjaykge1xuXHRcdFx0XHRcdFx0XHRpZiAobGFzdENoaWxkT2ZbYV0gPiBpKSB7IGFjdGl2ZVNsb3RzLnB1c2goc2xvdE9mW2FdKTsgfVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgbWF4U2xvdCA9IE1hdGgubWF4KC4uLmFjdGl2ZVNsb3RzLCAtMSk7XG5cdFx0XHRcdFx0XHRjb25zdCBjaGFyczogc3RyaW5nW10gPSBuZXcgQXJyYXkoTWF0aC5tYXgobWF4U2xvdCArIDEsIDApKS5maWxsKCcgICAnKTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgcyBvZiBhY3RpdmVTbG90cykgeyBjaGFyc1tzXSA9ICdcdTI1MDIgICc7IH1cblx0XHRcdFx0XHRcdHdoaWxlIChjaGFycy5sZW5ndGggPiAwICYmIGNoYXJzW2NoYXJzLmxlbmd0aCAtIDFdID09PSAnICAgJykgeyBjaGFycy5wb3AoKTsgfVxuXHRcdFx0XHRcdFx0ZXh0cmFzUGFydHMucHVzaChjaGFycy5qb2luKCcnKS5wYWRFbmQodykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB0aW1lUGFkID0gJyAnLnJlcGVhdCh0aW1lQ29sV2lkdGgpO1xuXHRcdFx0XHRsaW5lcy5wdXNoKGAke3RpbWVQYWR9ICR7ZXh0cmFzUGFydHMuam9pbignICAnKX1gLnRyaW1FbmQoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU3RhY2sgbWFpbnRlbmFuY2U6IHB1c2ggdGhpcyBldmVudCBpZiBpdCBoYXMgY2hpbGRyZW4sIHRoZW4gcG9wXG5cdFx0Ly8gYW55IGFuY2VzdG9ycyB3aG9zZSBsYXN0IGNoaWxkIHdhcyBqdXN0IHJlbmRlcmVkIChwcm9wYWdhdGluZyB1cCkuXG5cdFx0Y29uc3Qgc3RhY2sgPSBsYW5lU3RhY2tzLmdldChldmVudC5yb290KSE7XG5cdFx0aWYgKGNoaWxkcmVuT2ZbaV0ubGVuZ3RoID4gMCkgeyBzdGFjay5hZGQoaSk7IH1cblx0XHRsZXQgY3VyID0gaTtcblx0XHR3aGlsZSAoaXNMYXN0Q2hpbGRbY3VyXSkge1xuXHRcdFx0Y29uc3QgcCA9IHBhcmVudE9mW2N1cl07XG5cdFx0XHRpZiAocCA8IDApIHsgYnJlYWs7IH1cblx0XHRcdHN0YWNrLmRlbGV0ZShwKTtcblx0XHRcdGN1ciA9IHA7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gUmVuZGVyZXI6IGludGVybGVhdmVkIGxhbmUgZ3JhcGggKGdpdC1sb2cgc3R5bGUpXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIFJlbmRlciBgaGlzdG9yeWAgYXMgYW4gaW50ZXJsZWF2ZWQtbGFuZSBcImdpdCBsb2dcIiBzdHlsZSBncmFwaC4gRWFjaCBwYXJlbnRcbiAqIGV2ZW50IGdldHMgYSBjb2x1bW47IGNvbHVtbnMgYXJlIGxhaWQgb3V0IGxlZnQtdG8tcmlnaHQgaW4gZXZlbnQgb3JkZXIuXG4gKiBUcmFjZSByb290cyB3aXRoIGF0IGxlYXN0IG9uZSBkaXJlY3QgY2hpbGQgYmVjb21lIHN5bnRoZXRpYyBgK2xhYmVsYCByb3dzXG4gKiBpbnNlcnRlZCBiZWZvcmUgdGhlaXIgZmlyc3QgY2hpbGQuXG4gKlxuICogR2x5cGhzOlxuICogICBgXHUyNTc3YCAgbGFuZSBvcmlnaW4gKHRoaXMgbm9kZSBpcyBhIHBhcmVudClcbiAqICAgYFx1MjUwMmAgIGxhbmUgcGFzc2VzIHRocm91Z2hcbiAqICAgYFx1MjUxQ1x1MjUwMGAgY2hpbGQgY29ubmVjdHM7IGxhbmUgY29udGludWVzXG4gKiAgIGBcdTI1MTRcdTI1MDBgIGxhc3QgY2hpbGQgY29ubmVjdHM7IGxhbmUgY2xvc2VzXG4gKiAgIGBcdTI1M0NcdTI1MDBgIGhvcml6b250YWwgY29ubmVjdG9yIGNyb3NzZXMgYW4gYWN0aXZlIGxhbmVcbiAqICAgYFx1MjUwMFx1MjUwMGAgaG9yaXpvbnRhbCBjb25uZWN0b3IgY3Jvc3NlcyBhbiBlbXB0eSBjb2x1bW5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckxhbmVHcmFwaChoaXN0b3J5OiBFeGVjdXRpb25IaXN0b3J5KTogc3RyaW5nIHtcblx0Y29uc3QgeyBldmVudHMgfSA9IGhpc3Rvcnk7XG5cdGlmIChldmVudHMubGVuZ3RoID09PSAwKSB7IHJldHVybiAnJzsgfVxuXG5cdGludGVyZmFjZSBOb2RlIHtcblx0XHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHBhcmVudDogTm9kZSB8IHVuZGVmaW5lZDtcblx0XHRyZWFkb25seSBpc1N5bnRoZXRpYzogYm9vbGVhbjtcblx0fVxuXG5cdC8vIEluc2VydCBzeW50aGV0aWMgcm9vdCBub2RlcyBiZWZvcmUgdGhlaXIgZmlyc3QgY2hpbGQuXG5cdGNvbnN0IG5vZGVzOiBOb2RlW10gPSBbXTtcblx0Y29uc3Qgc3ludGhldGljRm9yUm9vdCA9IG5ldyBNYXA8RXhlY3V0aW9uUm9vdCwgTm9kZT4oKTtcblx0Y29uc3Qgbm9kZUJ5RXZlbnQgPSBuZXcgTWFwPEV4ZWN1dGlvbkV2ZW50LCBOb2RlPigpO1xuXG5cdC8vIFdoaWNoIHJvb3RzIGhhdmUgYXQgbGVhc3Qgb25lIGRpcmVjdCBjaGlsZCBldmVudD9cblx0Y29uc3Qgcm9vdHNXaXRoQ2hpbGRyZW4gPSBuZXcgU2V0PEV4ZWN1dGlvblJvb3Q+KCk7XG5cdGZvciAoY29uc3QgZSBvZiBldmVudHMpIHsgaWYgKCFlLnBhcmVudCkgeyByb290c1dpdGhDaGlsZHJlbi5hZGQoZS5yb290KTsgfSB9XG5cblx0Zm9yIChjb25zdCBlIG9mIGV2ZW50cykge1xuXHRcdGlmIChyb290c1dpdGhDaGlsZHJlbi5oYXMoZS5yb290KSAmJiAhc3ludGhldGljRm9yUm9vdC5oYXMoZS5yb290KSkge1xuXHRcdFx0Y29uc3Qgc3luOiBOb2RlID0geyBsYWJlbDogYCske2Uucm9vdC5sYWJlbH1gLCBwYXJlbnQ6IHVuZGVmaW5lZCwgaXNTeW50aGV0aWM6IHRydWUgfTtcblx0XHRcdHN5bnRoZXRpY0ZvclJvb3Quc2V0KGUucm9vdCwgc3luKTtcblx0XHRcdG5vZGVzLnB1c2goc3luKTtcblx0XHR9XG5cdFx0Y29uc3QgdGltZVN0ciA9IGArJHtlLnRpbWV9bXNgLnBhZFN0YXJ0KDcpO1xuXHRcdGNvbnN0IHBhcmVudCA9IGUucGFyZW50ID8gbm9kZUJ5RXZlbnQuZ2V0KGUucGFyZW50KSEgOiBzeW50aGV0aWNGb3JSb290LmdldChlLnJvb3QpO1xuXHRcdGNvbnN0IG5vZGU6IE5vZGUgPSB7IGxhYmVsOiBgWyR7dGltZVN0cn1dICR7ZS5sYWJlbH1gLCBwYXJlbnQsIGlzU3ludGhldGljOiBmYWxzZSB9O1xuXHRcdG5vZGVCeUV2ZW50LnNldChlLCBub2RlKTtcblx0XHRub2Rlcy5wdXNoKG5vZGUpO1xuXHR9XG5cblx0Y29uc3QgbiA9IG5vZGVzLmxlbmd0aDtcblx0Y29uc3QgcGFyZW50T2YgPSBuZXcgQXJyYXk8bnVtYmVyPihuKS5maWxsKC0xKTtcblx0Y29uc3QgY2hpbGRyZW5PZjogbnVtYmVyW11bXSA9IEFycmF5LmZyb20oeyBsZW5ndGg6IG4gfSwgKCkgPT4gW10pO1xuXHRjb25zdCBpbmRleE9mTm9kZSA9IG5ldyBNYXA8Tm9kZSwgbnVtYmVyPigpO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IG47IGkrKykgeyBpbmRleE9mTm9kZS5zZXQobm9kZXNbaV0sIGkpOyB9XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG5cdFx0Y29uc3QgcCA9IG5vZGVzW2ldLnBhcmVudDtcblx0XHRpZiAocCkge1xuXHRcdFx0Y29uc3QgcGkgPSBpbmRleE9mTm9kZS5nZXQocCk7XG5cdFx0XHRpZiAocGkgIT09IHVuZGVmaW5lZCkgeyBwYXJlbnRPZltpXSA9IHBpOyBjaGlsZHJlbk9mW3BpXS5wdXNoKGkpOyB9XG5cdFx0fVxuXHR9XG5cblx0Ly8gQXNzaWduIGNvbHVtbnM6IGV2ZXJ5IG5vZGUgd2l0aCBjaGlsZHJlbiBnZXRzIGl0cyBvd24gY29sdW1uLlxuXHRjb25zdCBjb2xPZiA9IG5ldyBBcnJheTxudW1iZXI+KG4pLmZpbGwoLTEpO1xuXHRsZXQgdG90YWxDb2xzID0gMDtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBuOyBpKyspIHtcblx0XHRpZiAoY2hpbGRyZW5PZltpXS5sZW5ndGggPiAwKSB7IGNvbE9mW2ldID0gdG90YWxDb2xzKys7IH1cblx0fVxuXG5cdGlmICh0b3RhbENvbHMgPT09IDApIHtcblx0XHRyZXR1cm4gZXZlbnRzLm1hcChlID0+IGBbKyR7YCR7ZS50aW1lfW1zYC5wYWRTdGFydCg1KX1dICR7ZS5sYWJlbH1gKS5qb2luKCdcXG4nKTtcblx0fVxuXG5cdGNvbnN0IGFjdGl2ZSA9IG5ldyBBcnJheTxudW1iZXI+KHRvdGFsQ29scykuZmlsbCgtMSk7XG5cdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG5cdFx0Y29uc3Qgbm9kZSA9IG5vZGVzW2ldO1xuXHRcdGNvbnN0IHBJZHggPSBwYXJlbnRPZltpXTtcblx0XHRjb25zdCBjb25uZWN0Q29sID0gcElkeCA+PSAwID8gY29sT2ZbcElkeF0gOiAtMTtcblx0XHRjb25zdCBsYXN0ID0gcElkeCA+PSAwICYmIGNoaWxkcmVuT2ZbcElkeF1bY2hpbGRyZW5PZltwSWR4XS5sZW5ndGggLSAxXSA9PT0gaTtcblx0XHRjb25zdCBvcGVuc0NvbCA9IGNoaWxkcmVuT2ZbaV0ubGVuZ3RoID4gMCA/IGNvbE9mW2ldIDogLTE7XG5cdFx0Y29uc3QgaG9yaXpFbmQgPSBwSWR4ID49IDAgPyAob3BlbnNDb2wgPj0gMCA/IG9wZW5zQ29sIDogdG90YWxDb2xzKSA6IC0xO1xuXG5cdFx0Y29uc3QgY2hhcnM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChsZXQgYyA9IDA7IGMgPCB0b3RhbENvbHM7IGMrKykge1xuXHRcdFx0Y29uc3QgaXNBY3RpdmUgPSBhY3RpdmVbY10gPj0gMDtcblx0XHRcdGNvbnN0IGlzQ29ubmVjdCA9IGMgPT09IGNvbm5lY3RDb2w7XG5cdFx0XHRjb25zdCBpc09wZW4gPSBjID09PSBvcGVuc0NvbCAmJiAhaXNDb25uZWN0O1xuXHRcdFx0Y29uc3QgaW5Ib3JpeiA9IGNvbm5lY3RDb2wgPj0gMCAmJiBjID4gY29ubmVjdENvbCAmJiBjIDwgaG9yaXpFbmQ7XG5cblx0XHRcdGxldCBnOiBzdHJpbmcsIHM6IHN0cmluZztcblx0XHRcdGlmIChpc0Nvbm5lY3QpIHtcblx0XHRcdFx0ZyA9IGxhc3QgPyAnXHUyNTE0JyA6ICdcdTI1MUMnO1xuXHRcdFx0XHRzID0gJ1x1MjUwMCc7XG5cdFx0XHR9IGVsc2UgaWYgKGlzT3BlbiAmJiBub2RlLmlzU3ludGhldGljKSB7XG5cdFx0XHRcdGcgPSAnKyc7XG5cdFx0XHRcdHMgPSBub2RlLmxhYmVsLnNsaWNlKDEsIDIpIHx8ICc/Jztcblx0XHRcdH0gZWxzZSBpZiAoaXNPcGVuICYmIGNvbm5lY3RDb2wgPj0gMCkge1xuXHRcdFx0XHRnID0gJ1x1MjU3Nyc7IHMgPSAnXHUyNTAwJztcblx0XHRcdH0gZWxzZSBpZiAoaXNPcGVuKSB7XG5cdFx0XHRcdGcgPSAnXHUyNTc3JzsgcyA9ICcgJztcblx0XHRcdH0gZWxzZSBpZiAoaW5Ib3JpeiAmJiBpc0FjdGl2ZSkge1xuXHRcdFx0XHRnID0gJ1x1MjUzQyc7IHMgPSAnXHUyNTAwJztcblx0XHRcdH0gZWxzZSBpZiAoaW5Ib3Jpeikge1xuXHRcdFx0XHRnID0gJ1x1MjUwMCc7IHMgPSAnXHUyNTAwJztcblx0XHRcdH0gZWxzZSBpZiAoaXNBY3RpdmUpIHtcblx0XHRcdFx0ZyA9ICdcdTI1MDInOyBzID0gJyAnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZyA9ICcgJzsgcyA9ICcgJztcblx0XHRcdH1cblx0XHRcdGNoYXJzLnB1c2goZywgcyk7XG5cdFx0fVxuXG5cdFx0aWYgKGxhc3QpIHsgYWN0aXZlW2NvbE9mW3BJZHhdXSA9IC0xOyB9XG5cdFx0aWYgKG9wZW5zQ29sID49IDApIHsgYWN0aXZlW29wZW5zQ29sXSA9IGk7IH1cblxuXHRcdGlmIChub2RlLmlzU3ludGhldGljKSB7XG5cdFx0XHRsaW5lcy5wdXNoKGNoYXJzLmpvaW4oJycpLnRyaW1FbmQoKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxpbmVzLnB1c2goYCR7Y2hhcnMuam9pbignJyl9JHtub2RlLmxhYmVsfWApO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQXVFTyxTQUFTLHNCQUNmLE9BQ0EsV0FDQSxPQUFnQyxDQUFDLEdBQ2Q7QUFDbkIsUUFBTSxjQUFjLG9CQUFJLElBQTRCO0FBQ3BELFFBQU0sUUFBeUIsQ0FBQztBQUNoQyxRQUFNLGVBQWUsb0JBQUksSUFBNkI7QUFDdEQsUUFBTSxhQUErQixDQUFDO0FBRXRDLGFBQVcsUUFBUSxPQUFPO0FBQ3pCLFVBQU0sUUFBUSxLQUFLO0FBQ25CLFFBQUksQ0FBQyxPQUFPO0FBQUU7QUFBQSxJQUFVO0FBRXhCLFFBQUksT0FBTyxZQUFZLElBQUksTUFBTSxJQUFJO0FBQ3JDLFFBQUksQ0FBQyxNQUFNO0FBQ1YsYUFBTyxFQUFFLE9BQU8sTUFBTSxLQUFLLE1BQU07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QixVQUFNLGFBQWEsUUFBUSxJQUFJLE1BQU0sSUFBSSxJQUFJO0FBQzdDLFVBQU0sT0FBTyxRQUFRLEtBQUssV0FBVyxJQUFJLEVBQUUsV0FBVyxJQUFJLEVBQUUsU0FBUyxDQUFDLE1BQU07QUFDNUUsVUFBTSxXQUFXLFdBQVcsQ0FBQyxFQUFFLFNBQVMsSUFBSSxNQUFNLENBQUMsSUFBSTtBQUN2RCxVQUFNLFdBQVcsUUFBUSxJQUFLLFlBQVksSUFBSSxXQUFXLFlBQWE7QUFFdEUsVUFBTSxRQUFrQixDQUFDO0FBQ3pCLGFBQVMsSUFBSSxHQUFHLElBQUksV0FBVyxLQUFLO0FBQ25DLFlBQU0sV0FBVyxPQUFPLENBQUMsS0FBSztBQUM5QixZQUFNLFlBQVksTUFBTTtBQUN4QixZQUFNLFNBQVMsTUFBTSxZQUFZLENBQUM7QUFDbEMsWUFBTSxVQUFVLGNBQWMsS0FBSyxJQUFJLGNBQWMsSUFBSTtBQUV6RCxVQUFJLEdBQVc7QUFDZixVQUFJLFdBQVc7QUFDZCxZQUFJLE9BQU8sV0FBTTtBQUNqQixZQUFJO0FBQUEsTUFDTCxXQUFXLFVBQVUsS0FBSyxhQUFhO0FBQ3RDLFlBQUk7QUFDSixZQUFJLEtBQUssTUFBTSxNQUFNLEdBQUcsQ0FBQyxLQUFLO0FBQUEsTUFDL0IsV0FBVyxVQUFVLGNBQWMsR0FBRztBQUNyQyxZQUFJO0FBQUssWUFBSTtBQUFBLE1BQ2QsV0FBVyxRQUFRO0FBQ2xCLFlBQUk7QUFBSyxZQUFJO0FBQUEsTUFDZCxXQUFXLFdBQVcsVUFBVTtBQUMvQixZQUFJO0FBQUssWUFBSTtBQUFBLE1BQ2QsV0FBVyxTQUFTO0FBQ25CLFlBQUk7QUFBSyxZQUFJO0FBQUEsTUFDZCxXQUFXLFVBQVU7QUFDcEIsWUFBSTtBQUFLLFlBQUk7QUFBQSxNQUNkLE9BQU87QUFDTixZQUFJO0FBQUssWUFBSTtBQUFBLE1BQ2Q7QUFDQSxZQUFNLEtBQUssR0FBRyxDQUFDO0FBQUEsSUFDaEI7QUFFQSxRQUFJLE1BQU07QUFBRSxhQUFPLE1BQU0sSUFBSSxDQUFDLElBQUk7QUFBQSxJQUFJO0FBQ3RDLFFBQUksWUFBWSxHQUFHO0FBQUUsYUFBTyxRQUFRLElBQUk7QUFBQSxJQUFHO0FBRTNDLFFBQUksS0FBSyxhQUFhO0FBQ3JCLFlBQU0sS0FBSyxNQUFNLEtBQUssRUFBRSxFQUFFLFFBQVEsQ0FBQztBQUFBLElBQ3BDLE9BQU87QUFDTixZQUFNLEtBQUssR0FBRyxNQUFNLEtBQUssRUFBRSxDQUFDLEdBQUcsS0FBSyxLQUFLLEVBQUU7QUFBQSxJQUM1QztBQUFBLEVBQ0Q7QUFFQSxTQUFPLE1BQU0sS0FBSyxJQUFJO0FBQ3ZCOyIsCiAgIm5hbWVzIjogWyJzdGFjayJdCn0K
