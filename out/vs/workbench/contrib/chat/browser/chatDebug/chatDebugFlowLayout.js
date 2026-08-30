const NODE_HEIGHT = 36;
const MESSAGE_NODE_HEIGHT = 52;
const NODE_MIN_WIDTH = 140;
const NODE_MAX_WIDTH = 320;
const NODE_PADDING_H = 16;
const NODE_PADDING_V = 6;
const NODE_GAP_Y = 24;
const NODE_BORDER_RADIUS = 6;
const EDGE_STROKE_WIDTH = 1.5;
const FONT_SIZE = 12;
const SUBLABEL_FONT_SIZE = 10;
const SUBGRAPH_PADDING = 12;
const CANVAS_PADDING = 24;
const PARALLEL_GAP_X = 40;
const SUBGRAPH_HEADER_HEIGHT = 22;
const GUTTER_WIDTH = 3;
const MERGED_TOGGLE_WIDTH = 36;
const PARALLEL_TIME_THRESHOLD_MS = 5e3;
function groupChildren(children) {
  const subagentIndices = [];
  for (let i2 = 0; i2 < children.length; i2++) {
    if (children[i2].kind === "subagentInvocation") {
      subagentIndices.push(i2);
    }
  }
  if (subagentIndices.length < 2) {
    return [{ type: "sequential", children }];
  }
  const parallelClusters = [];
  let cluster = [subagentIndices[0]];
  for (let k = 1; k < subagentIndices.length; k++) {
    const prevCreated = children[subagentIndices[k - 1]].created;
    const currCreated = children[subagentIndices[k]].created;
    if (Math.abs(currCreated - prevCreated) <= PARALLEL_TIME_THRESHOLD_MS) {
      cluster.push(subagentIndices[k]);
    } else {
      if (cluster.length >= 2) {
        parallelClusters.push(cluster);
      }
      cluster = [subagentIndices[k]];
    }
  }
  if (cluster.length >= 2) {
    parallelClusters.push(cluster);
  }
  if (parallelClusters.length === 0) {
    return [{ type: "sequential", children }];
  }
  const parallelIndices = /* @__PURE__ */ new Set();
  for (const c of parallelClusters) {
    for (const idx of c) {
      parallelIndices.add(idx);
    }
  }
  const groups = [];
  let clusterIdx = 0;
  let i = 0;
  while (i < children.length) {
    if (clusterIdx < parallelClusters.length && i === parallelClusters[clusterIdx][0]) {
      const cl = parallelClusters[clusterIdx];
      const lastIdx = cl[cl.length - 1];
      const setup = [];
      const subagents = [];
      for (let j = cl[0]; j <= lastIdx; j++) {
        if (parallelIndices.has(j)) {
          subagents.push(children[j]);
        } else {
          setup.push(children[j]);
        }
      }
      if (setup.length > 0) {
        groups.push({ type: "sequential", children: setup });
      }
      groups.push({ type: "parallel", children: subagents });
      i = lastIdx + 1;
      clusterIdx++;
    } else {
      const start = i;
      const nextStart = clusterIdx < parallelClusters.length ? parallelClusters[clusterIdx][0] : children.length;
      while (i < nextStart && !parallelIndices.has(i)) {
        i++;
      }
      if (i > start) {
        groups.push({ type: "sequential", children: children.slice(start, i) });
      }
    }
  }
  return groups;
}
function isMessageKind(kind) {
  return kind === "userMessage" || kind === "agentResponse";
}
function measureNodeWidth(label, sublabel) {
  const charWidth = 7;
  const labelWidth = label.length * charWidth + NODE_PADDING_H * 2;
  const sublabelWidth = sublabel ? sublabel.length * (charWidth - 1) + NODE_PADDING_H * 2 : 0;
  return Math.min(NODE_MAX_WIDTH, Math.max(NODE_MIN_WIDTH, labelWidth, sublabelWidth));
}
function subgraphHeaderLabel(node) {
  if (node.kind === "subagentInvocation") {
    return node.label;
  }
  if (node.description && node.description !== node.label) {
    return `${node.label}: ${node.description}`;
  }
  return node.label;
}
function measureSubgraphHeaderWidth(headerLabel) {
  return headerLabel.length * 6 + SUBGRAPH_PADDING * 2 + 20;
}
function countDescendants(node) {
  let count = node.children.length;
  for (const child of node.children) {
    count += countDescendants(child);
  }
  return count;
}
function layoutGroups(groups, startX, startY, depth, prevExitNodes, result, collapsedIds, expandedMergedIds, pendingExpansions) {
  let currentY = startY;
  let maxWidth = 0;
  let exitNodes = prevExitNodes;
  for (const group of groups) {
    if (group.type === "parallel") {
      const pg = layoutParallelGroup(group.children, startX, currentY, depth, collapsedIds, expandedMergedIds, pendingExpansions);
      result.nodes.push(...pg.nodes);
      result.edges.push(...pg.edges);
      result.subgraphs.push(...pg.subgraphs);
      for (const prev of exitNodes) {
        for (const entry of pg.entryNodes) {
          result.edges.push(makeEdge(prev, entry));
        }
      }
      exitNodes = pg.exitNodes;
      maxWidth = Math.max(maxWidth, pg.width);
      currentY += pg.height + NODE_GAP_Y;
    } else {
      for (const child of group.children) {
        const sub = layoutSubtree(child, startX, currentY, depth, collapsedIds, expandedMergedIds, pendingExpansions);
        result.nodes.push(...sub.nodes);
        result.edges.push(...sub.edges);
        result.subgraphs.push(...sub.subgraphs);
        for (const prev of exitNodes) {
          result.edges.push(makeEdge(prev, sub.entryNode));
        }
        exitNodes = sub.exitNodes;
        maxWidth = Math.max(maxWidth, sub.width);
        currentY += sub.height + NODE_GAP_Y;
      }
    }
  }
  return { exitNodes, maxWidth, endY: currentY };
}
function makeEdge(from, to) {
  return {
    fromId: from.id,
    toId: to.id,
    fromX: from.x + from.width / 2,
    fromY: from.y + from.height,
    toX: to.x + to.width / 2,
    toY: to.y
  };
}
function layoutFlowGraph(roots, options) {
  if (roots.length === 0) {
    return { nodes: [], edges: [], subgraphs: [], width: 0, height: 0 };
  }
  const collapsedIds = options?.collapsedIds;
  const expandedMergedIds = options?.expandedMergedIds;
  const groups = groupChildren(roots);
  const pendingExpansions = [];
  const result = {
    nodes: [],
    edges: [],
    subgraphs: []
  };
  const { maxWidth, endY } = layoutGroups(groups, CANVAS_PADDING, CANVAS_PADDING, 0, [], result, collapsedIds, expandedMergedIds, pendingExpansions);
  resolvePendingExpansions(pendingExpansions, result);
  let width = maxWidth + CANVAS_PADDING * 2;
  let height = endY - NODE_GAP_Y + CANVAS_PADDING;
  for (const n of result.nodes) {
    width = Math.max(width, n.x + n.width + CANVAS_PADDING);
    height = Math.max(height, n.y + n.height + CANVAS_PADDING);
  }
  centerLayout(result, width / 2);
  return { nodes: result.nodes, edges: result.edges, subgraphs: result.subgraphs, width, height };
}
function resolvePendingExpansions(pendingExpansions, result) {
  for (const expansion of pendingExpansions) {
    const { mergedNode, children } = expansion;
    const childrenTotalHeight = children.length * NODE_HEIGHT + (children.length - 1) * NODE_GAP_Y;
    const rangeTop = mergedNode.y;
    const rangeBottom = mergedNode.y + childrenTotalHeight;
    let maxRightX = mergedNode.x + mergedNode.width;
    for (const n of result.nodes) {
      if (n.y + n.height > rangeTop && n.y < rangeBottom) {
        maxRightX = Math.max(maxRightX, n.x + n.width);
      }
    }
    for (const sg of result.subgraphs) {
      if (sg.y + sg.height > rangeTop && sg.y < rangeBottom) {
        maxRightX = Math.max(maxRightX, sg.x + sg.width);
      }
    }
    const expandX = maxRightX + PARALLEL_GAP_X;
    let expandY = mergedNode.y;
    let expandMaxWidth = 0;
    const childNodes = [];
    for (const child of children) {
      const childWidth = measureNodeWidth(child.label, child.sublabel);
      const childNode = {
        id: child.id,
        kind: child.kind,
        label: child.label,
        sublabel: child.sublabel,
        tooltip: child.tooltip,
        isError: child.isError,
        x: expandX,
        y: expandY,
        width: childWidth,
        height: NODE_HEIGHT
      };
      childNodes.push(childNode);
      result.nodes.push(childNode);
      expandMaxWidth = Math.max(expandMaxWidth, childWidth);
      expandY += NODE_HEIGHT + NODE_GAP_Y;
    }
    const edgeY = childNodes[0].y + childNodes[0].height / 2;
    result.edges.push({
      fromId: mergedNode.id,
      toId: childNodes[0].id,
      fromX: mergedNode.x + mergedNode.width,
      fromY: edgeY,
      toX: expandX,
      toY: edgeY
    });
    for (let k = 0; k < childNodes.length - 1; k++) {
      result.edges.push(makeEdge(childNodes[k], childNodes[k + 1]));
    }
  }
}
function layoutSubtree(node, startX, y, depth, collapsedIds, expandedMergedIds, pendingExpansions) {
  const isMerged = (node.mergedNodes?.length ?? 0) >= 2;
  const isMergedExpanded = isMerged && expandedMergedIds?.has(node.id);
  const mergedExtra = isMerged ? MERGED_TOGGLE_WIDTH : 0;
  const nodeWidth = measureNodeWidth(node.label, node.sublabel) + mergedExtra;
  const isSubagent = node.kind === "subagentInvocation";
  const isCollapsed = isSubagent && collapsedIds?.has(node.id);
  const nodeHeight = isMessageKind(node.kind) && node.sublabel ? MESSAGE_NODE_HEIGHT : NODE_HEIGHT;
  const layoutNode = {
    id: node.id,
    kind: node.kind,
    label: node.label,
    sublabel: node.sublabel,
    tooltip: node.tooltip,
    isError: node.isError,
    x: startX,
    y,
    width: nodeWidth,
    height: nodeHeight,
    mergedCount: isMerged ? node.mergedNodes.length : void 0,
    isMergedExpanded
  };
  const result = {
    nodes: [layoutNode],
    edges: [],
    subgraphs: [],
    width: nodeWidth,
    height: nodeHeight,
    entryNode: layoutNode,
    exitNodes: [layoutNode]
  };
  if (isMergedExpanded && pendingExpansions) {
    pendingExpansions.push({ mergedNode: layoutNode, children: node.mergedNodes });
    return result;
  }
  if (node.children.length === 0 && !isCollapsed) {
    return result;
  }
  if (isCollapsed) {
    const collapsedHeight = SUBGRAPH_HEADER_HEIGHT + SUBGRAPH_PADDING * 2;
    const totalChildCount = countDescendants(node);
    const sgY = y + nodeHeight + NODE_GAP_Y - NODE_GAP_Y / 2;
    const headerLabel = subgraphHeaderLabel(node);
    const sgWidth = Math.max(NODE_MIN_WIDTH, measureSubgraphHeaderWidth(headerLabel)) + SUBGRAPH_PADDING * 2;
    result.subgraphs.push({
      label: headerLabel,
      x: startX - SUBGRAPH_PADDING,
      y: sgY,
      width: sgWidth,
      height: collapsedHeight,
      depth,
      nodeId: node.id,
      collapsedChildCount: totalChildCount
    });
    result.edges.push({
      fromX: startX + nodeWidth / 2,
      fromY: y + nodeHeight,
      toX: startX - SUBGRAPH_PADDING + sgWidth / 2,
      toY: sgY
    });
    result.width = Math.max(nodeWidth, sgWidth);
    result.height = nodeHeight + NODE_GAP_Y + collapsedHeight;
    return result;
  }
  if (node.children.length === 0) {
    return result;
  }
  const childDepth = isSubagent ? depth + 1 : depth;
  const indentX = isSubagent ? SUBGRAPH_PADDING : 0;
  const groups = groupChildren(node.children);
  let childStartY = y + nodeHeight + NODE_GAP_Y;
  if (isSubagent) {
    childStartY += SUBGRAPH_HEADER_HEIGHT;
  }
  const { exitNodes, maxWidth, endY } = layoutGroups(
    groups,
    startX + indentX,
    childStartY,
    childDepth,
    [layoutNode],
    result,
    collapsedIds,
    expandedMergedIds,
    pendingExpansions
  );
  const totalChildrenHeight = endY - childStartY - NODE_GAP_Y;
  let sgContentWidth = maxWidth;
  if (isSubagent) {
    const headerLabel = subgraphHeaderLabel(node);
    sgContentWidth = Math.max(maxWidth, measureSubgraphHeaderWidth(headerLabel));
    result.subgraphs.push({
      label: headerLabel,
      x: startX - SUBGRAPH_PADDING,
      y: y + nodeHeight + NODE_GAP_Y - NODE_GAP_Y / 2,
      width: sgContentWidth + SUBGRAPH_PADDING * 2,
      height: totalChildrenHeight + SUBGRAPH_HEADER_HEIGHT + NODE_GAP_Y,
      depth,
      nodeId: node.id
    });
  }
  result.width = Math.max(nodeWidth, maxWidth + indentX * 2, isSubagent ? sgContentWidth + indentX * 2 : 0);
  result.height = nodeHeight + NODE_GAP_Y + totalChildrenHeight + (isSubagent ? SUBGRAPH_HEADER_HEIGHT : 0);
  result.exitNodes = exitNodes;
  return result;
}
function layoutParallelGroup(children, startX, y, depth, collapsedIds, expandedMergedIds, pendingExpansions) {
  const subtreeLayouts = [];
  let totalWidth = 0;
  let maxHeight = 0;
  for (const child of children) {
    const subtree = layoutSubtree(child, 0, y, depth, collapsedIds, expandedMergedIds, pendingExpansions);
    subtreeLayouts.push(subtree);
    totalWidth += subtree.width;
    maxHeight = Math.max(maxHeight, subtree.height);
  }
  totalWidth += (children.length - 1) * PARALLEL_GAP_X;
  const nodes = [];
  const edges = [];
  const subgraphs = [];
  const entryNodes = [];
  const exitNodes = [];
  let currentX = startX;
  for (const subtree of subtreeLayouts) {
    const dx = currentX;
    const offsetNodes = subtree.nodes.map((n) => ({ ...n, x: n.x + dx }));
    const offsetEdges = subtree.edges.map((e) => ({
      fromId: e.fromId,
      toId: e.toId,
      fromX: e.fromX + dx,
      fromY: e.fromY,
      toX: e.toX + dx,
      toY: e.toY
    }));
    const offsetSubgraphs = subtree.subgraphs.map((s) => ({ ...s, x: s.x + dx }));
    nodes.push(...offsetNodes);
    edges.push(...offsetEdges);
    subgraphs.push(...offsetSubgraphs);
    entryNodes.push(offsetNodes.find((n) => n.id === subtree.entryNode.id));
    const exitIds = new Set(subtree.exitNodes.map((n) => n.id));
    exitNodes.push(...offsetNodes.filter((n) => exitIds.has(n.id)));
    currentX += subtree.width + PARALLEL_GAP_X;
  }
  return { nodes, edges, subgraphs, entryNodes, exitNodes, width: totalWidth, height: maxHeight };
}
function centerLayout(layout, centerX) {
  if (layout.nodes.length === 0) {
    return;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  for (const node of layout.nodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x + node.width);
  }
  const dx = centerX - (minX + maxX) / 2;
  for (let i = 0; i < layout.nodes.length; i++) {
    const n = layout.nodes[i];
    layout.nodes[i] = { ...n, x: n.x + dx };
  }
  for (let i = 0; i < layout.edges.length; i++) {
    const e = layout.edges[i];
    layout.edges[i] = { fromId: e.fromId, toId: e.toId, fromX: e.fromX + dx, fromY: e.fromY, toX: e.toX + dx, toY: e.toY };
  }
  for (let i = 0; i < layout.subgraphs.length; i++) {
    const s = layout.subgraphs[i];
    layout.subgraphs[i] = { ...s, x: s.x + dx };
  }
}
const SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}
function getNodeColor(kind, isError) {
  if (isError) {
    return "var(--vscode-errorForeground)";
  }
  switch (kind) {
    case "userMessage":
      return "var(--vscode-textLink-foreground)";
    case "modelTurn":
      return "var(--vscode-charts-blue, var(--vscode-textLink-foreground))";
    case "toolCall":
      return "var(--vscode-testing-iconPassed, #73c991)";
    case "subagentInvocation":
      return "var(--vscode-charts-purple, #b267e6)";
    case "agentResponse":
      return "var(--vscode-foreground)";
    case "generic":
      return "var(--vscode-descriptionForeground)";
  }
}
const SUBGRAPH_COLORS = [
  "var(--vscode-charts-purple, #b267e6)",
  "var(--vscode-charts-blue, #3dc9b0)",
  "var(--vscode-charts-yellow, #e5c07b)",
  "var(--vscode-charts-orange, #d19a66)"
];
function renderFlowChartSVG(layout) {
  const focusableElements = /* @__PURE__ */ new Map();
  const svg = svgEl("svg", {
    width: layout.width,
    height: layout.height,
    viewBox: `0 0 ${layout.width} ${layout.height}`,
    role: "img",
    "aria-label": `Agent flow chart with ${layout.nodes.length} nodes`
  });
  svg.classList.add("chat-debug-flowchart-svg");
  renderSubgraphs(svg, layout.subgraphs, focusableElements);
  renderEdges(svg, layout.edges);
  renderNodes(svg, layout.nodes, focusableElements);
  const positionByKey = /* @__PURE__ */ new Map();
  for (const sg of layout.subgraphs) {
    positionByKey.set(`sg:${sg.nodeId}`, { y: sg.y, x: sg.x });
  }
  for (const node of layout.nodes) {
    positionByKey.set(node.id, { y: node.y, x: node.x });
  }
  const sortedFocusable = new Map(
    [...focusableElements.entries()].sort((a, b) => {
      const posA = positionByKey.get(a[0]);
      const posB = positionByKey.get(b[0]);
      if (!posA || !posB) {
        return 0;
      }
      return posA.y !== posB.y ? posA.y - posB.y : posA.x - posB.x;
    })
  );
  const adjacency = /* @__PURE__ */ new Map();
  for (const edge of layout.edges) {
    if (edge.fromId && edge.toId) {
      let fromEntry = adjacency.get(edge.fromId);
      if (!fromEntry) {
        fromEntry = { next: [], prev: [] };
        adjacency.set(edge.fromId, fromEntry);
      }
      fromEntry.next.push(edge.toId);
      let toEntry = adjacency.get(edge.toId);
      if (!toEntry) {
        toEntry = { next: [], prev: [] };
        adjacency.set(edge.toId, toEntry);
      }
      toEntry.prev.push(edge.fromId);
    }
  }
  return { svg, focusableElements: sortedFocusable, adjacency, positions: positionByKey };
}
function renderSubgraphs(svg, subgraphs, focusableElements) {
  for (let sgIdx = 0; sgIdx < subgraphs.length; sgIdx++) {
    const sg = subgraphs[sgIdx];
    const color = SUBGRAPH_COLORS[sg.depth % SUBGRAPH_COLORS.length];
    const isCollapsed = sg.collapsedChildCount !== void 0;
    const g = document.createElementNS(SVG_NS, "g");
    g.classList.add("chat-debug-flowchart-subgraph");
    const rectAttrs = { x: sg.x, y: sg.y, width: sg.width, height: sg.height, rx: NODE_BORDER_RADIUS, ry: NODE_BORDER_RADIUS };
    const clipId = `sg-clip-${sgIdx}`;
    const clipPath = svgEl("clipPath", { id: clipId });
    clipPath.appendChild(svgEl("rect", rectAttrs));
    svg.appendChild(clipPath);
    g.appendChild(svgEl("rect", { ...rectAttrs, fill: color, opacity: 0.06 + sg.depth * 0.02 }));
    g.appendChild(svgEl("rect", { ...rectAttrs, fill: "none", stroke: color, "stroke-width": 1, "stroke-dasharray": "6,3", opacity: 0.5 }));
    g.appendChild(svgEl("rect", { x: sg.x, y: sg.y, width: GUTTER_WIDTH, height: sg.height, fill: color, opacity: 0.7, "clip-path": `url(#${clipId})` }));
    const headerGroup = document.createElementNS(SVG_NS, "g");
    headerGroup.setAttribute("data-subgraph-id", sg.nodeId);
    headerGroup.classList.add("chat-debug-flowchart-subgraph-header");
    headerGroup.setAttribute("tabindex", "0");
    headerGroup.setAttribute("role", "button");
    headerGroup.setAttribute("aria-expanded", String(!isCollapsed));
    headerGroup.setAttribute("aria-label", `${sg.label}: ${isCollapsed ? "collapsed" : "expanded"}${isCollapsed && sg.collapsedChildCount !== void 0 ? `, ${sg.collapsedChildCount} items hidden` : ""}`);
    const headerBar = svgEl("rect", { x: sg.x, y: sg.y, width: sg.width, height: SUBGRAPH_HEADER_HEIGHT, fill: color, opacity: 0.15, "clip-path": `url(#${clipId})` });
    headerGroup.appendChild(headerBar);
    const chevron = isCollapsed ? "\u25B6" : "\u25BC";
    const headerText = svgEl("text", {
      x: sg.x + GUTTER_WIDTH + 8,
      y: sg.y + SUBGRAPH_HEADER_HEIGHT / 2 + 4,
      "font-size": SUBLABEL_FONT_SIZE,
      fill: color,
      "font-family": "var(--vscode-font-family, sans-serif)",
      "font-weight": "600"
    });
    headerText.textContent = `${chevron} ${sg.label}`;
    headerGroup.appendChild(headerText);
    g.appendChild(headerGroup);
    focusableElements.set(`sg:${sg.nodeId}`, headerGroup);
    if (isCollapsed && sg.collapsedChildCount !== void 0) {
      const badgeText = svgEl("text", {
        x: sg.x + sg.width / 2,
        y: sg.y + SUBGRAPH_HEADER_HEIGHT + SUBGRAPH_PADDING + 4,
        "font-size": SUBLABEL_FONT_SIZE,
        fill: "var(--vscode-descriptionForeground)",
        "font-family": "var(--vscode-font-family, sans-serif)",
        "font-style": "italic",
        "text-anchor": "middle"
      });
      badgeText.textContent = `+${sg.collapsedChildCount} items`;
      g.appendChild(badgeText);
    }
    svg.appendChild(g);
  }
}
function renderEdges(svg, edges) {
  const strokeAttrs = { fill: "none", stroke: "var(--vscode-descriptionForeground)", "stroke-width": EDGE_STROKE_WIDTH, "stroke-linecap": "round" };
  const r = 6;
  for (const edge of edges) {
    const midY = (edge.fromY + edge.toY) / 2;
    let d;
    const isHorizontal = edge.fromY === edge.toY;
    if (isHorizontal) {
      d = `M ${edge.fromX} ${edge.fromY} L ${edge.toX} ${edge.toY}`;
    } else if (edge.fromX === edge.toX) {
      d = `M ${edge.fromX} ${edge.fromY} L ${edge.toX} ${edge.toY}`;
    } else {
      const dx = edge.toX - edge.fromX;
      const signX = dx > 0 ? 1 : -1;
      const absDx = Math.abs(dx);
      const cr = Math.min(r, absDx / 2, (edge.toY - edge.fromY) / 4);
      d = `M ${edge.fromX} ${edge.fromY} L ${edge.fromX} ${midY - cr} Q ${edge.fromX} ${midY}, ${edge.fromX + signX * cr} ${midY} L ${edge.toX - signX * cr} ${midY} Q ${edge.toX} ${midY}, ${edge.toX} ${midY + cr} L ${edge.toX} ${edge.toY}`;
    }
    svg.appendChild(svgEl("path", { ...strokeAttrs, d }));
    const a = 5;
    let arrowD;
    if (isHorizontal) {
      const signX = edge.toX > edge.fromX ? 1 : -1;
      arrowD = `M ${edge.toX - signX * a * 1.5} ${edge.toY - a} L ${edge.toX} ${edge.toY} L ${edge.toX - signX * a * 1.5} ${edge.toY + a}`;
    } else {
      arrowD = `M ${edge.toX - a} ${edge.toY - a * 1.5} L ${edge.toX} ${edge.toY} L ${edge.toX + a} ${edge.toY - a * 1.5}`;
    }
    svg.appendChild(svgEl("path", {
      ...strokeAttrs,
      "stroke-linejoin": "round",
      d: arrowD
    }));
  }
}
function renderNodes(svg, nodes, focusableElements) {
  const fontFamily = "var(--vscode-font-family, sans-serif)";
  const nodeFill = "var(--vscode-editor-background, var(--vscode-editorWidget-background))";
  for (const node of nodes) {
    const g = document.createElementNS(SVG_NS, "g");
    g.classList.add("chat-debug-flowchart-node");
    g.setAttribute("data-node-id", node.id);
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "img");
    const ariaLabel = node.sublabel ? `${node.label}, ${node.sublabel}` : node.label;
    g.setAttribute("aria-label", ariaLabel);
    focusableElements.set(node.id, g);
    if (node.tooltip) {
      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = node.tooltip;
      g.appendChild(title);
    }
    const color = getNodeColor(node.kind, node.isError);
    const safeId = node.id.replace(/[^a-zA-Z0-9]/g, "_");
    const rectAttrs = { x: node.x, y: node.y, width: node.width, height: node.height, rx: NODE_BORDER_RADIUS, ry: NODE_BORDER_RADIUS };
    const clipId = `clip-${safeId}`;
    const clipPath = svgEl("clipPath", { id: clipId });
    clipPath.appendChild(svgEl("rect", rectAttrs));
    svg.appendChild(clipPath);
    const focusOffset = 3;
    g.appendChild(svgEl("rect", {
      class: "chat-debug-flowchart-focus-ring",
      x: node.x - focusOffset,
      y: node.y - focusOffset,
      width: node.width + focusOffset * 2,
      height: node.height + focusOffset * 2,
      rx: NODE_BORDER_RADIUS + focusOffset,
      ry: NODE_BORDER_RADIUS + focusOffset,
      fill: "none",
      stroke: "var(--vscode-focusBorder)",
      "stroke-width": 2
    }));
    g.appendChild(svgEl("rect", { ...rectAttrs, fill: nodeFill, stroke: color, "stroke-width": node.isError ? 2 : 1.5 }));
    g.appendChild(svgEl("rect", { x: node.x, y: node.y, width: 4, height: node.height, fill: color, "clip-path": `url(#${clipId})` }));
    const textX = node.x + NODE_PADDING_H;
    const isMessage = isMessageKind(node.kind);
    if (isMessage && node.sublabel) {
      const header = svgEl("text", { x: textX, y: node.y + NODE_PADDING_V + SUBLABEL_FONT_SIZE, "font-size": SUBLABEL_FONT_SIZE, fill: "var(--vscode-descriptionForeground)", "font-family": fontFamily, "clip-path": `url(#${clipId})` });
      header.textContent = node.label;
      g.appendChild(header);
      const msg = svgEl("text", { x: textX, y: node.y + node.height - NODE_PADDING_V - 2, "font-size": FONT_SIZE, fill: "var(--vscode-foreground)", "font-family": fontFamily, "clip-path": `url(#${clipId})` });
      msg.textContent = node.sublabel;
      g.appendChild(msg);
    } else if (node.sublabel) {
      const label = svgEl("text", { x: textX, y: node.y + NODE_PADDING_V + FONT_SIZE, "font-size": FONT_SIZE, fill: "var(--vscode-foreground)", "font-family": fontFamily, "clip-path": `url(#${clipId})` });
      label.textContent = node.label;
      g.appendChild(label);
      const sub = svgEl("text", { x: textX, y: node.y + node.height - NODE_PADDING_V, "font-size": SUBLABEL_FONT_SIZE, fill: "var(--vscode-descriptionForeground)", "font-family": fontFamily, "clip-path": `url(#${clipId})` });
      sub.textContent = node.sublabel;
      g.appendChild(sub);
    } else {
      const label = svgEl("text", { x: textX, y: node.y + node.height / 2 + FONT_SIZE / 2 - 1, "font-size": FONT_SIZE, fill: "var(--vscode-foreground)", "font-family": fontFamily, "clip-path": `url(#${clipId})` });
      label.textContent = node.label;
      g.appendChild(label);
    }
    if (node.mergedCount) {
      g.setAttribute("data-is-toggle", "true");
      renderMergedToggle(g, node, color, fontFamily);
    }
    svg.appendChild(g);
  }
}
function renderMergedToggle(g, node, color, fontFamily) {
  const toggleX = node.x + node.width - MERGED_TOGGLE_WIDTH;
  const toggleGroup = document.createElementNS(SVG_NS, "g");
  toggleGroup.classList.add("chat-debug-flowchart-merged-toggle");
  toggleGroup.setAttribute("data-merged-id", node.id);
  toggleGroup.appendChild(svgEl("line", {
    x1: toggleX,
    y1: node.y + 4,
    x2: toggleX,
    y2: node.y + node.height - 4,
    stroke: "var(--vscode-descriptionForeground)",
    "stroke-width": 0.5,
    opacity: 0.4
  }));
  const chevronX = toggleX + MERGED_TOGGLE_WIDTH / 2;
  const chevronY = node.y + node.height / 2;
  const chevron = svgEl("text", {
    x: chevronX,
    y: chevronY + 4,
    "font-size": 9,
    fill: color,
    "font-family": fontFamily,
    "text-anchor": "middle",
    cursor: "pointer"
  });
  chevron.textContent = node.isMergedExpanded ? "\u25C0" : "\u25B6";
  toggleGroup.appendChild(chevron);
  toggleGroup.appendChild(svgEl("rect", {
    x: toggleX,
    y: node.y,
    width: MERGED_TOGGLE_WIDTH,
    height: node.height,
    fill: "transparent",
    cursor: "pointer"
  }));
  g.appendChild(toggleGroup);
}
export {
  layoutFlowGraph,
  renderFlowChartSVG
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXREZWJ1Z1xcY2hhdERlYnVnRmxvd0xheW91dC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElDaGF0RGVidWdFdmVudCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0RGVidWdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZsb3dMYXlvdXQsIEZsb3dOb2RlLCBMYXlvdXRFZGdlLCBMYXlvdXROb2RlLCBTdWJncmFwaFJlY3QsIEZsb3dDaGFydFJlbmRlclJlc3VsdCB9IGZyb20gJy4vY2hhdERlYnVnRmxvd0dyYXBoLmpzJztcblxuLy8gLS0tLSBMYXlvdXQgY29uc3RhbnRzIC0tLS1cblxuY29uc3QgTk9ERV9IRUlHSFQgPSAzNjtcbmNvbnN0IE1FU1NBR0VfTk9ERV9IRUlHSFQgPSA1MjtcbmNvbnN0IE5PREVfTUlOX1dJRFRIID0gMTQwO1xuY29uc3QgTk9ERV9NQVhfV0lEVEggPSAzMjA7XG5jb25zdCBOT0RFX1BBRERJTkdfSCA9IDE2O1xuY29uc3QgTk9ERV9QQURESU5HX1YgPSA2O1xuY29uc3QgTk9ERV9HQVBfWSA9IDI0O1xuY29uc3QgTk9ERV9CT1JERVJfUkFESVVTID0gNjtcbmNvbnN0IEVER0VfU1RST0tFX1dJRFRIID0gMS41O1xuY29uc3QgRk9OVF9TSVpFID0gMTI7XG5jb25zdCBTVUJMQUJFTF9GT05UX1NJWkUgPSAxMDtcbmNvbnN0IFNVQkdSQVBIX1BBRERJTkcgPSAxMjtcbmNvbnN0IENBTlZBU19QQURESU5HID0gMjQ7XG5jb25zdCBQQVJBTExFTF9HQVBfWCA9IDQwO1xuY29uc3QgU1VCR1JBUEhfSEVBREVSX0hFSUdIVCA9IDIyO1xuY29uc3QgR1VUVEVSX1dJRFRIID0gMztcbmNvbnN0IE1FUkdFRF9UT0dHTEVfV0lEVEggPSAzNjtcblxuLy8gLS0tLSBMYXlvdXQgaW50ZXJuYWxzIC0tLS1cblxuaW50ZXJmYWNlIFN1YnRyZWVMYXlvdXQge1xuXHRub2RlczogTGF5b3V0Tm9kZVtdO1xuXHRlZGdlczogTGF5b3V0RWRnZVtdO1xuXHRzdWJncmFwaHM6IFN1YmdyYXBoUmVjdFtdO1xuXHR3aWR0aDogbnVtYmVyO1xuXHRoZWlnaHQ6IG51bWJlcjtcblx0ZW50cnlOb2RlOiBMYXlvdXROb2RlO1xuXHRleGl0Tm9kZXM6IExheW91dE5vZGVbXTtcbn1cblxuaW50ZXJmYWNlIENoaWxkR3JvdXAge1xuXHRyZWFkb25seSB0eXBlOiAnc2VxdWVudGlhbCcgfCAncGFyYWxsZWwnO1xuXHRyZWFkb25seSBjaGlsZHJlbjogRmxvd05vZGVbXTtcbn1cblxuLyoqIERlZmVycmVkIGV4cGFuc2lvbiBvZiBhIG1lcmdlZC1kaXNjb3Zlcnkgbm9kZSwgcmVzb2x2ZWQgaW4gcGFzcyAyLiAqL1xuaW50ZXJmYWNlIFBlbmRpbmdFeHBhbnNpb24ge1xuXHQvKiogVGhlIG1lcmdlZCBzdW1tYXJ5IExheW91dE5vZGUgKGFscmVhZHkgcGxhY2VkKS4gKi9cblx0cmVhZG9ubHkgbWVyZ2VkTm9kZTogTGF5b3V0Tm9kZTtcblx0LyoqIFRoZSBpbmRpdmlkdWFsIEZsb3dOb2RlcyB0byBleHBhbmQgdG8gdGhlIHJpZ2h0LiAqL1xuXHRyZWFkb25seSBjaGlsZHJlbjogcmVhZG9ubHkgRmxvd05vZGVbXTtcbn1cblxuLy8gLS0tLSBQYXJhbGxlbCBkZXRlY3Rpb24gLS0tLVxuXG4vKiogTWF4IHRpbWUgZ2FwIChtcykgYmV0d2VlbiBzdWJhZ2VudCBgY3JlYXRlZGAgdGltZXN0YW1wcyB0byBjb25zaWRlciB0aGVtIHBhcmFsbGVsLiAqL1xuY29uc3QgUEFSQUxMRUxfVElNRV9USFJFU0hPTERfTVMgPSA1XzAwMDtcblxuLyoqXG4gKiBHcm91cHMgYSBsaXN0IG9mIHNpYmxpbmcgbm9kZXMgaW50byBzZXF1ZW50aWFsIGFuZCBwYXJhbGxlbCBzZWdtZW50cy5cbiAqXG4gKiBTdWJhZ2VudCBpbnZvY2F0aW9ucyB3aG9zZSBgY3JlYXRlZGAgdGltZXN0YW1wcyBmYWxsIHdpdGhpblxuICoge0BsaW5rIFBBUkFMTEVMX1RJTUVfVEhSRVNIT0xEX01TfSBvZiBlYWNoIG90aGVyIGFyZSBjbHVzdGVyZWQgYXMgcGFyYWxsZWwuXG4gKiBOb24tc3ViYWdlbnQgbm9kZXMgaW50ZXJsZWF2ZWQgd2l0aGluIGEgY2x1c3RlciBhcmUgZW1pdHRlZCBhcyBhIHNlcXVlbnRpYWxcbiAqIGdyb3VwIGJlZm9yZSB0aGUgcGFyYWxsZWwgZm9yay4gIFdoZW4gZmV3ZXIgdGhhbiAyIHN1YmFnZW50cyBleGlzdCxcbiAqIGV2ZXJ5dGhpbmcgaXMgc2VxdWVudGlhbC5cbiAqL1xuZnVuY3Rpb24gZ3JvdXBDaGlsZHJlbihjaGlsZHJlbjogRmxvd05vZGVbXSk6IENoaWxkR3JvdXBbXSB7XG5cdGNvbnN0IHN1YmFnZW50SW5kaWNlczogbnVtYmVyW10gPSBbXTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuXHRcdGlmIChjaGlsZHJlbltpXS5raW5kID09PSAnc3ViYWdlbnRJbnZvY2F0aW9uJykge1xuXHRcdFx0c3ViYWdlbnRJbmRpY2VzLnB1c2goaSk7XG5cdFx0fVxuXHR9XG5cblx0aWYgKHN1YmFnZW50SW5kaWNlcy5sZW5ndGggPCAyKSB7XG5cdFx0cmV0dXJuIFt7IHR5cGU6ICdzZXF1ZW50aWFsJywgY2hpbGRyZW4gfV07XG5cdH1cblxuXHQvLyBDbHVzdGVyIHN1YmFnZW50cyB3aG9zZSBjcmVhdGVkIHRpbWVzdGFtcHMgYXJlIHdpdGhpbiB0aGUgdGhyZXNob2xkLlxuXHRjb25zdCBwYXJhbGxlbENsdXN0ZXJzOiBudW1iZXJbXVtdID0gW107XG5cdGxldCBjbHVzdGVyOiBudW1iZXJbXSA9IFtzdWJhZ2VudEluZGljZXNbMF1dO1xuXHRmb3IgKGxldCBrID0gMTsgayA8IHN1YmFnZW50SW5kaWNlcy5sZW5ndGg7IGsrKykge1xuXHRcdGNvbnN0IHByZXZDcmVhdGVkID0gY2hpbGRyZW5bc3ViYWdlbnRJbmRpY2VzW2sgLSAxXV0uY3JlYXRlZDtcblx0XHRjb25zdCBjdXJyQ3JlYXRlZCA9IGNoaWxkcmVuW3N1YmFnZW50SW5kaWNlc1trXV0uY3JlYXRlZDtcblx0XHRpZiAoTWF0aC5hYnMoY3VyckNyZWF0ZWQgLSBwcmV2Q3JlYXRlZCkgPD0gUEFSQUxMRUxfVElNRV9USFJFU0hPTERfTVMpIHtcblx0XHRcdGNsdXN0ZXIucHVzaChzdWJhZ2VudEluZGljZXNba10pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoY2x1c3Rlci5sZW5ndGggPj0gMikge1xuXHRcdFx0XHRwYXJhbGxlbENsdXN0ZXJzLnB1c2goY2x1c3Rlcik7XG5cdFx0XHR9XG5cdFx0XHRjbHVzdGVyID0gW3N1YmFnZW50SW5kaWNlc1trXV07XG5cdFx0fVxuXHR9XG5cdGlmIChjbHVzdGVyLmxlbmd0aCA+PSAyKSB7XG5cdFx0cGFyYWxsZWxDbHVzdGVycy5wdXNoKGNsdXN0ZXIpO1xuXHR9XG5cblx0aWYgKHBhcmFsbGVsQ2x1c3RlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIFt7IHR5cGU6ICdzZXF1ZW50aWFsJywgY2hpbGRyZW4gfV07XG5cdH1cblxuXHQvLyBCdWlsZCBncm91cHMgZnJvbSB0aGUgdGltZXN0YW1wLWRlcml2ZWQgY2x1c3RlcnMuXG5cdGNvbnN0IHBhcmFsbGVsSW5kaWNlcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXHRmb3IgKGNvbnN0IGMgb2YgcGFyYWxsZWxDbHVzdGVycykge1xuXHRcdGZvciAoY29uc3QgaWR4IG9mIGMpIHtcblx0XHRcdHBhcmFsbGVsSW5kaWNlcy5hZGQoaWR4KTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBncm91cHM6IENoaWxkR3JvdXBbXSA9IFtdO1xuXHRsZXQgY2x1c3RlcklkeCA9IDA7XG5cdGxldCBpID0gMDtcblx0d2hpbGUgKGkgPCBjaGlsZHJlbi5sZW5ndGgpIHtcblx0XHRpZiAoY2x1c3RlcklkeCA8IHBhcmFsbGVsQ2x1c3RlcnMubGVuZ3RoICYmIGkgPT09IHBhcmFsbGVsQ2x1c3RlcnNbY2x1c3RlcklkeF1bMF0pIHtcblx0XHRcdGNvbnN0IGNsID0gcGFyYWxsZWxDbHVzdGVyc1tjbHVzdGVySWR4XTtcblx0XHRcdGNvbnN0IGxhc3RJZHggPSBjbFtjbC5sZW5ndGggLSAxXTtcblxuXHRcdFx0Y29uc3Qgc2V0dXA6IEZsb3dOb2RlW10gPSBbXTtcblx0XHRcdGNvbnN0IHN1YmFnZW50czogRmxvd05vZGVbXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaiA9IGNsWzBdOyBqIDw9IGxhc3RJZHg7IGorKykge1xuXHRcdFx0XHRpZiAocGFyYWxsZWxJbmRpY2VzLmhhcyhqKSkge1xuXHRcdFx0XHRcdHN1YmFnZW50cy5wdXNoKGNoaWxkcmVuW2pdKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzZXR1cC5wdXNoKGNoaWxkcmVuW2pdKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHNldHVwLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Z3JvdXBzLnB1c2goeyB0eXBlOiAnc2VxdWVudGlhbCcsIGNoaWxkcmVuOiBzZXR1cCB9KTtcblx0XHRcdH1cblx0XHRcdGdyb3Vwcy5wdXNoKHsgdHlwZTogJ3BhcmFsbGVsJywgY2hpbGRyZW46IHN1YmFnZW50cyB9KTtcblx0XHRcdGkgPSBsYXN0SWR4ICsgMTtcblx0XHRcdGNsdXN0ZXJJZHgrKztcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBpO1xuXHRcdFx0Y29uc3QgbmV4dFN0YXJ0ID0gY2x1c3RlcklkeCA8IHBhcmFsbGVsQ2x1c3RlcnMubGVuZ3RoID8gcGFyYWxsZWxDbHVzdGVyc1tjbHVzdGVySWR4XVswXSA6IGNoaWxkcmVuLmxlbmd0aDtcblx0XHRcdHdoaWxlIChpIDwgbmV4dFN0YXJ0ICYmICFwYXJhbGxlbEluZGljZXMuaGFzKGkpKSB7XG5cdFx0XHRcdGkrKztcblx0XHRcdH1cblx0XHRcdGlmIChpID4gc3RhcnQpIHtcblx0XHRcdFx0Z3JvdXBzLnB1c2goeyB0eXBlOiAnc2VxdWVudGlhbCcsIGNoaWxkcmVuOiBjaGlsZHJlbi5zbGljZShzdGFydCwgaSkgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBncm91cHM7XG59XG5cbi8vIC0tLS0gTGF5b3V0IGVuZ2luZSAtLS0tXG5cbmZ1bmN0aW9uIGlzTWVzc2FnZUtpbmQoa2luZDogSUNoYXREZWJ1Z0V2ZW50WydraW5kJ10pOiBib29sZWFuIHtcblx0cmV0dXJuIGtpbmQgPT09ICd1c2VyTWVzc2FnZScgfHwga2luZCA9PT0gJ2FnZW50UmVzcG9uc2UnO1xufVxuXG5mdW5jdGlvbiBtZWFzdXJlTm9kZVdpZHRoKGxhYmVsOiBzdHJpbmcsIHN1YmxhYmVsPzogc3RyaW5nKTogbnVtYmVyIHtcblx0Y29uc3QgY2hhcldpZHRoID0gNztcblx0Y29uc3QgbGFiZWxXaWR0aCA9IGxhYmVsLmxlbmd0aCAqIGNoYXJXaWR0aCArIE5PREVfUEFERElOR19IICogMjtcblx0Y29uc3Qgc3VibGFiZWxXaWR0aCA9IHN1YmxhYmVsID8gc3VibGFiZWwubGVuZ3RoICogKGNoYXJXaWR0aCAtIDEpICsgTk9ERV9QQURESU5HX0ggKiAyIDogMDtcblx0cmV0dXJuIE1hdGgubWluKE5PREVfTUFYX1dJRFRILCBNYXRoLm1heChOT0RFX01JTl9XSURUSCwgbGFiZWxXaWR0aCwgc3VibGFiZWxXaWR0aCkpO1xufVxuXG5mdW5jdGlvbiBzdWJncmFwaEhlYWRlckxhYmVsKG5vZGU6IEZsb3dOb2RlKTogc3RyaW5nIHtcblx0Ly8gRm9yIHN1YmFnZW50IG5vZGVzLCB0aGUgbGFiZWwgYWxyZWFkeSBpbmNsdWRlcyB0aGUgZGVzY3JpcHRpb25cblx0Ly8gKGUuZy4gXCJTdWJhZ2VudDogQ291bnQgbWFya2Rvd24gZmlsZXNcIiksIHNvIGRvbid0IGFwcGVuZCBpdCBhZ2Fpbi5cblx0aWYgKG5vZGUua2luZCA9PT0gJ3N1YmFnZW50SW52b2NhdGlvbicpIHtcblx0XHRyZXR1cm4gbm9kZS5sYWJlbDtcblx0fVxuXHRpZiAobm9kZS5kZXNjcmlwdGlvbiAmJiBub2RlLmRlc2NyaXB0aW9uICE9PSBub2RlLmxhYmVsKSB7XG5cdFx0cmV0dXJuIGAke25vZGUubGFiZWx9OiAke25vZGUuZGVzY3JpcHRpb259YDtcblx0fVxuXHRyZXR1cm4gbm9kZS5sYWJlbDtcbn1cblxuZnVuY3Rpb24gbWVhc3VyZVN1YmdyYXBoSGVhZGVyV2lkdGgoaGVhZGVyTGFiZWw6IHN0cmluZyk6IG51bWJlciB7XG5cdHJldHVybiBoZWFkZXJMYWJlbC5sZW5ndGggKiA2ICsgU1VCR1JBUEhfUEFERElORyAqIDIgKyAyMDsgLy8gMjAgZm9yIGNoZXZyb25cbn1cblxuZnVuY3Rpb24gY291bnREZXNjZW5kYW50cyhub2RlOiBGbG93Tm9kZSk6IG51bWJlciB7XG5cdGxldCBjb3VudCA9IG5vZGUuY2hpbGRyZW4ubGVuZ3RoO1xuXHRmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHtcblx0XHRjb3VudCArPSBjb3VudERlc2NlbmRhbnRzKGNoaWxkKTtcblx0fVxuXHRyZXR1cm4gY291bnQ7XG59XG5cbi8qKlxuICogTGF5cyBvdXQgZ3JvdXBlZCBjaGlsZHJlbiAoc2VxdWVudGlhbCBvciBwYXJhbGxlbCkgYW5kIGNvbm5lY3RzIGVkZ2VzLlxuICogU2hhcmVkIGJ5IGJvdGggcm9vdC1sZXZlbCBsYXlvdXQgYW5kIHN1YnRyZWUtbGV2ZWwgbGF5b3V0LlxuICpcbiAqIEByZXR1cm5zIFRoZSBmaW5hbCBleGl0IG5vZGVzLCBtYXggd2lkdGgsIGFuZCB0aGUgeSBwb3NpdGlvbiBhZnRlciB0aGUgbGFzdCBub2RlLlxuICovXG5mdW5jdGlvbiBsYXlvdXRHcm91cHMoXG5cdGdyb3VwczogQ2hpbGRHcm91cFtdLFxuXHRzdGFydFg6IG51bWJlcixcblx0c3RhcnRZOiBudW1iZXIsXG5cdGRlcHRoOiBudW1iZXIsXG5cdHByZXZFeGl0Tm9kZXM6IExheW91dE5vZGVbXSxcblx0cmVzdWx0OiB7IG5vZGVzOiBMYXlvdXROb2RlW107IGVkZ2VzOiBMYXlvdXRFZGdlW107IHN1YmdyYXBoczogU3ViZ3JhcGhSZWN0W10gfSxcblx0Y29sbGFwc2VkSWRzPzogUmVhZG9ubHlTZXQ8c3RyaW5nPixcblx0ZXhwYW5kZWRNZXJnZWRJZHM/OiBSZWFkb25seVNldDxzdHJpbmc+LFxuXHRwZW5kaW5nRXhwYW5zaW9ucz86IFBlbmRpbmdFeHBhbnNpb25bXSxcbik6IHsgZXhpdE5vZGVzOiBMYXlvdXROb2RlW107IG1heFdpZHRoOiBudW1iZXI7IGVuZFk6IG51bWJlciB9IHtcblx0bGV0IGN1cnJlbnRZID0gc3RhcnRZO1xuXHRsZXQgbWF4V2lkdGggPSAwO1xuXHRsZXQgZXhpdE5vZGVzID0gcHJldkV4aXROb2RlcztcblxuXHRmb3IgKGNvbnN0IGdyb3VwIG9mIGdyb3Vwcykge1xuXHRcdGlmIChncm91cC50eXBlID09PSAncGFyYWxsZWwnKSB7XG5cdFx0XHRjb25zdCBwZyA9IGxheW91dFBhcmFsbGVsR3JvdXAoZ3JvdXAuY2hpbGRyZW4sIHN0YXJ0WCwgY3VycmVudFksIGRlcHRoLCBjb2xsYXBzZWRJZHMsIGV4cGFuZGVkTWVyZ2VkSWRzLCBwZW5kaW5nRXhwYW5zaW9ucyk7XG5cdFx0XHRyZXN1bHQubm9kZXMucHVzaCguLi5wZy5ub2Rlcyk7XG5cdFx0XHRyZXN1bHQuZWRnZXMucHVzaCguLi5wZy5lZGdlcyk7XG5cdFx0XHRyZXN1bHQuc3ViZ3JhcGhzLnB1c2goLi4ucGcuc3ViZ3JhcGhzKTtcblxuXHRcdFx0Zm9yIChjb25zdCBwcmV2IG9mIGV4aXROb2Rlcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHBnLmVudHJ5Tm9kZXMpIHtcblx0XHRcdFx0XHRyZXN1bHQuZWRnZXMucHVzaChtYWtlRWRnZShwcmV2LCBlbnRyeSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRleGl0Tm9kZXMgPSBwZy5leGl0Tm9kZXM7XG5cdFx0XHRtYXhXaWR0aCA9IE1hdGgubWF4KG1heFdpZHRoLCBwZy53aWR0aCk7XG5cdFx0XHRjdXJyZW50WSArPSBwZy5oZWlnaHQgKyBOT0RFX0dBUF9ZO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGdyb3VwLmNoaWxkcmVuKSB7XG5cdFx0XHRcdGNvbnN0IHN1YiA9IGxheW91dFN1YnRyZWUoY2hpbGQsIHN0YXJ0WCwgY3VycmVudFksIGRlcHRoLCBjb2xsYXBzZWRJZHMsIGV4cGFuZGVkTWVyZ2VkSWRzLCBwZW5kaW5nRXhwYW5zaW9ucyk7XG5cdFx0XHRcdHJlc3VsdC5ub2Rlcy5wdXNoKC4uLnN1Yi5ub2Rlcyk7XG5cdFx0XHRcdHJlc3VsdC5lZGdlcy5wdXNoKC4uLnN1Yi5lZGdlcyk7XG5cdFx0XHRcdHJlc3VsdC5zdWJncmFwaHMucHVzaCguLi5zdWIuc3ViZ3JhcGhzKTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IHByZXYgb2YgZXhpdE5vZGVzKSB7XG5cdFx0XHRcdFx0cmVzdWx0LmVkZ2VzLnB1c2gobWFrZUVkZ2UocHJldiwgc3ViLmVudHJ5Tm9kZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGV4aXROb2RlcyA9IHN1Yi5leGl0Tm9kZXM7XG5cdFx0XHRcdG1heFdpZHRoID0gTWF0aC5tYXgobWF4V2lkdGgsIHN1Yi53aWR0aCk7XG5cdFx0XHRcdGN1cnJlbnRZICs9IHN1Yi5oZWlnaHQgKyBOT0RFX0dBUF9ZO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4geyBleGl0Tm9kZXMsIG1heFdpZHRoLCBlbmRZOiBjdXJyZW50WSB9O1xufVxuXG5mdW5jdGlvbiBtYWtlRWRnZShmcm9tOiBMYXlvdXROb2RlLCB0bzogTGF5b3V0Tm9kZSk6IExheW91dEVkZ2Uge1xuXHRyZXR1cm4ge1xuXHRcdGZyb21JZDogZnJvbS5pZCxcblx0XHR0b0lkOiB0by5pZCxcblx0XHRmcm9tWDogZnJvbS54ICsgZnJvbS53aWR0aCAvIDIsXG5cdFx0ZnJvbVk6IGZyb20ueSArIGZyb20uaGVpZ2h0LFxuXHRcdHRvWDogdG8ueCArIHRvLndpZHRoIC8gMixcblx0XHR0b1k6IHRvLnksXG5cdH07XG59XG5cbi8qKlxuICogTGF5cyBvdXQgYSBsaXN0IG9mIGZsb3cgbm9kZXMgaW4gYSB0b3AtZG93biB2ZXJ0aWNhbCBmbG93LlxuICogUGFyYWxsZWwgc3ViYWdlbnQgaW52b2NhdGlvbnMgYXJlIGFycmFuZ2VkIHNpZGUgYnkgc2lkZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGxheW91dEZsb3dHcmFwaChyb290czogRmxvd05vZGVbXSwgb3B0aW9ucz86IHsgY29sbGFwc2VkSWRzPzogUmVhZG9ubHlTZXQ8c3RyaW5nPjsgZXhwYW5kZWRNZXJnZWRJZHM/OiBSZWFkb25seVNldDxzdHJpbmc+IH0pOiBGbG93TGF5b3V0IHtcblx0aWYgKHJvb3RzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB7IG5vZGVzOiBbXSwgZWRnZXM6IFtdLCBzdWJncmFwaHM6IFtdLCB3aWR0aDogMCwgaGVpZ2h0OiAwIH07XG5cdH1cblxuXHRjb25zdCBjb2xsYXBzZWRJZHMgPSBvcHRpb25zPy5jb2xsYXBzZWRJZHM7XG5cdGNvbnN0IGV4cGFuZGVkTWVyZ2VkSWRzID0gb3B0aW9ucz8uZXhwYW5kZWRNZXJnZWRJZHM7XG5cdGNvbnN0IGdyb3VwcyA9IGdyb3VwQ2hpbGRyZW4ocm9vdHMpO1xuXHRjb25zdCBwZW5kaW5nRXhwYW5zaW9uczogUGVuZGluZ0V4cGFuc2lvbltdID0gW107XG5cdGNvbnN0IHJlc3VsdDogeyBub2RlczogTGF5b3V0Tm9kZVtdOyBlZGdlczogTGF5b3V0RWRnZVtdOyBzdWJncmFwaHM6IFN1YmdyYXBoUmVjdFtdIH0gPSB7XG5cdFx0bm9kZXM6IFtdLFxuXHRcdGVkZ2VzOiBbXSxcblx0XHRzdWJncmFwaHM6IFtdLFxuXHR9O1xuXG5cdC8vIFBhc3MgMTogbGF5b3V0IHRoZSBtYWluIHZlcnRpY2FsIGZsb3c7IGV4cGFuZGVkIG1lcmdlZCBub2RlcyBvbmx5XG5cdC8vIHBsYWNlIHRoZWlyIHN1bW1hcnkgbm9kZSBhbmQgZGVmZXIgY2hpbGRyZW4gdG8gcGVuZGluZ0V4cGFuc2lvbnMuXG5cdGNvbnN0IHsgbWF4V2lkdGgsIGVuZFkgfSA9IGxheW91dEdyb3Vwcyhncm91cHMsIENBTlZBU19QQURESU5HLCBDQU5WQVNfUEFERElORywgMCwgW10sIHJlc3VsdCwgY29sbGFwc2VkSWRzLCBleHBhbmRlZE1lcmdlZElkcywgcGVuZGluZ0V4cGFuc2lvbnMpO1xuXG5cdC8vIFBhc3MgMjogcmVzb2x2ZSBkZWZlcnJlZCBleHBhbnNpb25zIFx1MjAxNCBwbGFjZSBjaGlsZHJlbiB0byB0aGUgcmlnaHQsXG5cdC8vIGZhciBlbm91Z2ggdG8gY2xlYXIgYWxsIGV4aXN0aW5nIG5vZGVzL3N1YmdyYXBocyBpbiB0aGUgWSByYW5nZS5cblx0cmVzb2x2ZVBlbmRpbmdFeHBhbnNpb25zKHBlbmRpbmdFeHBhbnNpb25zLCByZXN1bHQpO1xuXG5cdGxldCB3aWR0aCA9IG1heFdpZHRoICsgQ0FOVkFTX1BBRERJTkcgKiAyO1xuXHRsZXQgaGVpZ2h0ID0gZW5kWSAtIE5PREVfR0FQX1kgKyBDQU5WQVNfUEFERElORztcblxuXHQvLyBFeHBhbmQgY2FudmFzIHRvIGNvdmVyIGFueSBub2RlcyB0aGF0IGZsb2F0IG91dHNpZGUgdGhlIG1haW4gZmxvdy5cblx0Zm9yIChjb25zdCBuIG9mIHJlc3VsdC5ub2Rlcykge1xuXHRcdHdpZHRoID0gTWF0aC5tYXgod2lkdGgsIG4ueCArIG4ud2lkdGggKyBDQU5WQVNfUEFERElORyk7XG5cdFx0aGVpZ2h0ID0gTWF0aC5tYXgoaGVpZ2h0LCBuLnkgKyBuLmhlaWdodCArIENBTlZBU19QQURESU5HKTtcblx0fVxuXG5cdGNlbnRlckxheW91dChyZXN1bHQgYXMgRmxvd0xheW91dCAmIHsgbm9kZXM6IExheW91dE5vZGVbXTsgZWRnZXM6IExheW91dEVkZ2VbXTsgc3ViZ3JhcGhzOiBTdWJncmFwaFJlY3RbXSB9LCB3aWR0aCAvIDIpO1xuXG5cdHJldHVybiB7IG5vZGVzOiByZXN1bHQubm9kZXMsIGVkZ2VzOiByZXN1bHQuZWRnZXMsIHN1YmdyYXBoczogcmVzdWx0LnN1YmdyYXBocywgd2lkdGgsIGhlaWdodCB9O1xufVxuXG4vKipcbiAqIFBhc3MgMjogRm9yIGVhY2ggcGVuZGluZyBleHBhbnNpb24sIGNvbXB1dGUgdGhlIFkgcmFuZ2UgdGhlIGNoaWxkcmVuXG4gKiB3aWxsIG9jY3VweSwgc2NhbiBhbGwgYWxyZWFkeS1wbGFjZWQgbm9kZXMgYW5kIHN1YmdyYXBocyBmb3IgdGhlIG1heFxuICogcmlnaHQgZWRnZSBvdmVybGFwcGluZyB0aGF0IHJhbmdlLCBhbmQgcGxhY2UgdGhlIGVudGlyZSBjb2x1bW4gb2ZcbiAqIGNoaWxkcmVuIHRvIHRoZSByaWdodCBvZiB0aGF0IGVkZ2UuXG4gKi9cbmZ1bmN0aW9uIHJlc29sdmVQZW5kaW5nRXhwYW5zaW9ucyhcblx0cGVuZGluZ0V4cGFuc2lvbnM6IFBlbmRpbmdFeHBhbnNpb25bXSxcblx0cmVzdWx0OiB7IG5vZGVzOiBMYXlvdXROb2RlW107IGVkZ2VzOiBMYXlvdXRFZGdlW107IHN1YmdyYXBoczogU3ViZ3JhcGhSZWN0W10gfSxcbik6IHZvaWQge1xuXHRmb3IgKGNvbnN0IGV4cGFuc2lvbiBvZiBwZW5kaW5nRXhwYW5zaW9ucykge1xuXHRcdGNvbnN0IHsgbWVyZ2VkTm9kZSwgY2hpbGRyZW4gfSA9IGV4cGFuc2lvbjtcblxuXHRcdC8vIENvbXB1dGUgdGhlIFkgcmFuZ2UgdGhlIGNoaWxkcmVuIHdpbGwgb2NjdXB5LlxuXHRcdGNvbnN0IGNoaWxkcmVuVG90YWxIZWlnaHQgPSBjaGlsZHJlbi5sZW5ndGggKiBOT0RFX0hFSUdIVCArIChjaGlsZHJlbi5sZW5ndGggLSAxKSAqIE5PREVfR0FQX1k7XG5cdFx0Y29uc3QgcmFuZ2VUb3AgPSBtZXJnZWROb2RlLnk7XG5cdFx0Y29uc3QgcmFuZ2VCb3R0b20gPSBtZXJnZWROb2RlLnkgKyBjaGlsZHJlblRvdGFsSGVpZ2h0O1xuXG5cdFx0Ly8gRmluZCB0aGUgbWF4IHJpZ2h0IGVkZ2Ugb2YgYW55IGV4aXN0aW5nIG5vZGUgb3Igc3ViZ3JhcGhcblx0XHQvLyB0aGF0IG92ZXJsYXBzIHRoaXMgWSByYW5nZS5cblx0XHRsZXQgbWF4UmlnaHRYID0gbWVyZ2VkTm9kZS54ICsgbWVyZ2VkTm9kZS53aWR0aDtcblx0XHRmb3IgKGNvbnN0IG4gb2YgcmVzdWx0Lm5vZGVzKSB7XG5cdFx0XHRpZiAobi55ICsgbi5oZWlnaHQgPiByYW5nZVRvcCAmJiBuLnkgPCByYW5nZUJvdHRvbSkge1xuXHRcdFx0XHRtYXhSaWdodFggPSBNYXRoLm1heChtYXhSaWdodFgsIG4ueCArIG4ud2lkdGgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHNnIG9mIHJlc3VsdC5zdWJncmFwaHMpIHtcblx0XHRcdGlmIChzZy55ICsgc2cuaGVpZ2h0ID4gcmFuZ2VUb3AgJiYgc2cueSA8IHJhbmdlQm90dG9tKSB7XG5cdFx0XHRcdG1heFJpZ2h0WCA9IE1hdGgubWF4KG1heFJpZ2h0WCwgc2cueCArIHNnLndpZHRoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBleHBhbmRYID0gbWF4UmlnaHRYICsgUEFSQUxMRUxfR0FQX1g7XG5cdFx0bGV0IGV4cGFuZFkgPSBtZXJnZWROb2RlLnk7XG5cdFx0bGV0IGV4cGFuZE1heFdpZHRoID0gMDtcblxuXHRcdGNvbnN0IGNoaWxkTm9kZXM6IExheW91dE5vZGVbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcblx0XHRcdGNvbnN0IGNoaWxkV2lkdGggPSBtZWFzdXJlTm9kZVdpZHRoKGNoaWxkLmxhYmVsLCBjaGlsZC5zdWJsYWJlbCk7XG5cdFx0XHRjb25zdCBjaGlsZE5vZGU6IExheW91dE5vZGUgPSB7XG5cdFx0XHRcdGlkOiBjaGlsZC5pZCxcblx0XHRcdFx0a2luZDogY2hpbGQua2luZCxcblx0XHRcdFx0bGFiZWw6IGNoaWxkLmxhYmVsLFxuXHRcdFx0XHRzdWJsYWJlbDogY2hpbGQuc3VibGFiZWwsXG5cdFx0XHRcdHRvb2x0aXA6IGNoaWxkLnRvb2x0aXAsXG5cdFx0XHRcdGlzRXJyb3I6IGNoaWxkLmlzRXJyb3IsXG5cdFx0XHRcdHg6IGV4cGFuZFgsXG5cdFx0XHRcdHk6IGV4cGFuZFksXG5cdFx0XHRcdHdpZHRoOiBjaGlsZFdpZHRoLFxuXHRcdFx0XHRoZWlnaHQ6IE5PREVfSEVJR0hULFxuXHRcdFx0fTtcblx0XHRcdGNoaWxkTm9kZXMucHVzaChjaGlsZE5vZGUpO1xuXHRcdFx0cmVzdWx0Lm5vZGVzLnB1c2goY2hpbGROb2RlKTtcblx0XHRcdGV4cGFuZE1heFdpZHRoID0gTWF0aC5tYXgoZXhwYW5kTWF4V2lkdGgsIGNoaWxkV2lkdGgpO1xuXHRcdFx0ZXhwYW5kWSArPSBOT0RFX0hFSUdIVCArIE5PREVfR0FQX1k7XG5cdFx0fVxuXG5cdFx0Ly8gRWRnZSBmcm9tIG1lcmdlZCBub2RlIHRvIGZpcnN0IGV4cGFuZGVkIGNoaWxkLlxuXHRcdC8vIFVzZSBhIGhvcml6b250YWwgZWRnZSBhbGlnbmVkIHdpdGggdGhlIGZpcnN0IGNoaWxkJ3MgbWlkcG9pbnRcblx0XHQvLyBzbyB0aGUgb3J0aG9nb25hbCByZW5kZXJlciBkb2Vzbid0IG5lZWQgdG8gcm91dGUgdXB3YXJkLlxuXHRcdGNvbnN0IGVkZ2VZID0gY2hpbGROb2Rlc1swXS55ICsgY2hpbGROb2Rlc1swXS5oZWlnaHQgLyAyO1xuXHRcdHJlc3VsdC5lZGdlcy5wdXNoKHtcblx0XHRcdGZyb21JZDogbWVyZ2VkTm9kZS5pZCxcblx0XHRcdHRvSWQ6IGNoaWxkTm9kZXNbMF0uaWQsXG5cdFx0XHRmcm9tWDogbWVyZ2VkTm9kZS54ICsgbWVyZ2VkTm9kZS53aWR0aCxcblx0XHRcdGZyb21ZOiBlZGdlWSxcblx0XHRcdHRvWDogZXhwYW5kWCxcblx0XHRcdHRvWTogZWRnZVksXG5cdFx0fSk7XG5cblx0XHQvLyBWZXJ0aWNhbCBlZGdlcyBiZXR3ZWVuIGNvbnNlY3V0aXZlIGNoaWxkcmVuXG5cdFx0Zm9yIChsZXQgayA9IDA7IGsgPCBjaGlsZE5vZGVzLmxlbmd0aCAtIDE7IGsrKykge1xuXHRcdFx0cmVzdWx0LmVkZ2VzLnB1c2gobWFrZUVkZ2UoY2hpbGROb2Rlc1trXSwgY2hpbGROb2Rlc1trICsgMV0pKTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gbGF5b3V0U3VidHJlZShub2RlOiBGbG93Tm9kZSwgc3RhcnRYOiBudW1iZXIsIHk6IG51bWJlciwgZGVwdGg6IG51bWJlciwgY29sbGFwc2VkSWRzPzogUmVhZG9ubHlTZXQ8c3RyaW5nPiwgZXhwYW5kZWRNZXJnZWRJZHM/OiBSZWFkb25seVNldDxzdHJpbmc+LCBwZW5kaW5nRXhwYW5zaW9ucz86IFBlbmRpbmdFeHBhbnNpb25bXSk6IFN1YnRyZWVMYXlvdXQge1xuXHRjb25zdCBpc01lcmdlZCA9IChub2RlLm1lcmdlZE5vZGVzPy5sZW5ndGggPz8gMCkgPj0gMjtcblx0Y29uc3QgaXNNZXJnZWRFeHBhbmRlZCA9IGlzTWVyZ2VkICYmIGV4cGFuZGVkTWVyZ2VkSWRzPy5oYXMobm9kZS5pZCk7XG5cdGNvbnN0IG1lcmdlZEV4dHJhID0gaXNNZXJnZWQgPyBNRVJHRURfVE9HR0xFX1dJRFRIIDogMDtcblx0Y29uc3Qgbm9kZVdpZHRoID0gbWVhc3VyZU5vZGVXaWR0aChub2RlLmxhYmVsLCBub2RlLnN1YmxhYmVsKSArIG1lcmdlZEV4dHJhO1xuXHRjb25zdCBpc1N1YmFnZW50ID0gbm9kZS5raW5kID09PSAnc3ViYWdlbnRJbnZvY2F0aW9uJztcblx0Y29uc3QgaXNDb2xsYXBzZWQgPSBpc1N1YmFnZW50ICYmIGNvbGxhcHNlZElkcz8uaGFzKG5vZGUuaWQpO1xuXHRjb25zdCBub2RlSGVpZ2h0ID0gaXNNZXNzYWdlS2luZChub2RlLmtpbmQpICYmIG5vZGUuc3VibGFiZWwgPyBNRVNTQUdFX05PREVfSEVJR0hUIDogTk9ERV9IRUlHSFQ7XG5cblx0Y29uc3QgbGF5b3V0Tm9kZTogTGF5b3V0Tm9kZSA9IHtcblx0XHRpZDogbm9kZS5pZCxcblx0XHRraW5kOiBub2RlLmtpbmQsXG5cdFx0bGFiZWw6IG5vZGUubGFiZWwsXG5cdFx0c3VibGFiZWw6IG5vZGUuc3VibGFiZWwsXG5cdFx0dG9vbHRpcDogbm9kZS50b29sdGlwLFxuXHRcdGlzRXJyb3I6IG5vZGUuaXNFcnJvcixcblx0XHR4OiBzdGFydFgsXG5cdFx0eTogeSxcblx0XHR3aWR0aDogbm9kZVdpZHRoLFxuXHRcdGhlaWdodDogbm9kZUhlaWdodCxcblx0XHRtZXJnZWRDb3VudDogaXNNZXJnZWQgPyBub2RlLm1lcmdlZE5vZGVzIS5sZW5ndGggOiB1bmRlZmluZWQsXG5cdFx0aXNNZXJnZWRFeHBhbmRlZCxcblx0fTtcblxuXHRjb25zdCByZXN1bHQ6IFN1YnRyZWVMYXlvdXQgPSB7XG5cdFx0bm9kZXM6IFtsYXlvdXROb2RlXSxcblx0XHRlZGdlczogW10sXG5cdFx0c3ViZ3JhcGhzOiBbXSxcblx0XHR3aWR0aDogbm9kZVdpZHRoLFxuXHRcdGhlaWdodDogbm9kZUhlaWdodCxcblx0XHRlbnRyeU5vZGU6IGxheW91dE5vZGUsXG5cdFx0ZXhpdE5vZGVzOiBbbGF5b3V0Tm9kZV0sXG5cdH07XG5cblx0Ly8gRXhwYW5kZWQgbWVyZ2VkIGRpc2NvdmVyeTogZGVmZXIgY2hpbGQgcGxhY2VtZW50IHRvIHBhc3MgMi5cblx0Ly8gT25seSBlbWl0IHRoZSBtZXJnZWQgc3VtbWFyeSBub2RlIG5vdzsgY2hpbGRyZW4gd2lsbCBiZSBwbGFjZWRcblx0Ly8gdG8gdGhlIHJpZ2h0IGFmdGVyIGFsbCBtYWluLWZsb3cgbm9kZXMgaGF2ZSBiZWVuIHBvc2l0aW9uZWQuXG5cdGlmIChpc01lcmdlZEV4cGFuZGVkICYmIHBlbmRpbmdFeHBhbnNpb25zKSB7XG5cdFx0cGVuZGluZ0V4cGFuc2lvbnMucHVzaCh7IG1lcmdlZE5vZGU6IGxheW91dE5vZGUsIGNoaWxkcmVuOiBub2RlLm1lcmdlZE5vZGVzISB9KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0aWYgKG5vZGUuY2hpbGRyZW4ubGVuZ3RoID09PSAwICYmICFpc0NvbGxhcHNlZCkge1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvLyBDb2xsYXBzZWQgc3ViYWdlbnQ6IHNob3cganVzdCB0aGUgaGVhZGVyICsgYSBjb21wYWN0IGJhZGdlIGFyZWFcblx0aWYgKGlzQ29sbGFwc2VkKSB7XG5cdFx0Y29uc3QgY29sbGFwc2VkSGVpZ2h0ID0gU1VCR1JBUEhfSEVBREVSX0hFSUdIVCArIFNVQkdSQVBIX1BBRERJTkcgKiAyO1xuXHRcdGNvbnN0IHRvdGFsQ2hpbGRDb3VudCA9IGNvdW50RGVzY2VuZGFudHMobm9kZSk7XG5cdFx0Y29uc3Qgc2dZID0gKHkgKyBub2RlSGVpZ2h0ICsgTk9ERV9HQVBfWSkgLSBOT0RFX0dBUF9ZIC8gMjtcblx0XHRjb25zdCBoZWFkZXJMYWJlbCA9IHN1YmdyYXBoSGVhZGVyTGFiZWwobm9kZSk7XG5cdFx0Y29uc3Qgc2dXaWR0aCA9IE1hdGgubWF4KE5PREVfTUlOX1dJRFRILCBtZWFzdXJlU3ViZ3JhcGhIZWFkZXJXaWR0aChoZWFkZXJMYWJlbCkpICsgU1VCR1JBUEhfUEFERElORyAqIDI7XG5cdFx0cmVzdWx0LnN1YmdyYXBocy5wdXNoKHtcblx0XHRcdGxhYmVsOiBoZWFkZXJMYWJlbCxcblx0XHRcdHg6IHN0YXJ0WCAtIFNVQkdSQVBIX1BBRERJTkcsXG5cdFx0XHR5OiBzZ1ksXG5cdFx0XHR3aWR0aDogc2dXaWR0aCxcblx0XHRcdGhlaWdodDogY29sbGFwc2VkSGVpZ2h0LFxuXHRcdFx0ZGVwdGgsXG5cdFx0XHRub2RlSWQ6IG5vZGUuaWQsXG5cdFx0XHRjb2xsYXBzZWRDaGlsZENvdW50OiB0b3RhbENoaWxkQ291bnQsXG5cdFx0fSk7XG5cdFx0Ly8gRHJhdyBhIGNvbm5lY3RpbmcgZWRnZSBmcm9tIHRoZSBub2RlIHRvIHRoZSBjb2xsYXBzZWQgc3ViZ3JhcGhcblx0XHRyZXN1bHQuZWRnZXMucHVzaCh7XG5cdFx0XHRmcm9tWDogc3RhcnRYICsgbm9kZVdpZHRoIC8gMixcblx0XHRcdGZyb21ZOiB5ICsgbm9kZUhlaWdodCxcblx0XHRcdHRvWDogc3RhcnRYIC0gU1VCR1JBUEhfUEFERElORyArIHNnV2lkdGggLyAyLFxuXHRcdFx0dG9ZOiBzZ1ksXG5cdFx0fSk7XG5cdFx0cmVzdWx0LndpZHRoID0gTWF0aC5tYXgobm9kZVdpZHRoLCBzZ1dpZHRoKTtcblx0XHRyZXN1bHQuaGVpZ2h0ID0gbm9kZUhlaWdodCArIE5PREVfR0FQX1kgKyBjb2xsYXBzZWRIZWlnaHQ7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGlmIChub2RlLmNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRjb25zdCBjaGlsZERlcHRoID0gaXNTdWJhZ2VudCA/IGRlcHRoICsgMSA6IGRlcHRoO1xuXHRjb25zdCBpbmRlbnRYID0gaXNTdWJhZ2VudCA/IFNVQkdSQVBIX1BBRERJTkcgOiAwO1xuXHRjb25zdCBncm91cHMgPSBncm91cENoaWxkcmVuKG5vZGUuY2hpbGRyZW4pO1xuXG5cdGxldCBjaGlsZFN0YXJ0WSA9IHkgKyBub2RlSGVpZ2h0ICsgTk9ERV9HQVBfWTtcblx0aWYgKGlzU3ViYWdlbnQpIHtcblx0XHRjaGlsZFN0YXJ0WSArPSBTVUJHUkFQSF9IRUFERVJfSEVJR0hUO1xuXHR9XG5cblx0Y29uc3QgeyBleGl0Tm9kZXMsIG1heFdpZHRoLCBlbmRZIH0gPSBsYXlvdXRHcm91cHMoXG5cdFx0Z3JvdXBzLCBzdGFydFggKyBpbmRlbnRYLCBjaGlsZFN0YXJ0WSwgY2hpbGREZXB0aCwgW2xheW91dE5vZGVdLCByZXN1bHQsIGNvbGxhcHNlZElkcywgZXhwYW5kZWRNZXJnZWRJZHMsIHBlbmRpbmdFeHBhbnNpb25zLFxuXHQpO1xuXG5cdGNvbnN0IHRvdGFsQ2hpbGRyZW5IZWlnaHQgPSBlbmRZIC0gY2hpbGRTdGFydFkgLSBOT0RFX0dBUF9ZO1xuXG5cdGxldCBzZ0NvbnRlbnRXaWR0aCA9IG1heFdpZHRoO1xuXHRpZiAoaXNTdWJhZ2VudCkge1xuXHRcdGNvbnN0IGhlYWRlckxhYmVsID0gc3ViZ3JhcGhIZWFkZXJMYWJlbChub2RlKTtcblx0XHRzZ0NvbnRlbnRXaWR0aCA9IE1hdGgubWF4KG1heFdpZHRoLCBtZWFzdXJlU3ViZ3JhcGhIZWFkZXJXaWR0aChoZWFkZXJMYWJlbCkpO1xuXHRcdHJlc3VsdC5zdWJncmFwaHMucHVzaCh7XG5cdFx0XHRsYWJlbDogaGVhZGVyTGFiZWwsXG5cdFx0XHR4OiBzdGFydFggLSBTVUJHUkFQSF9QQURESU5HLFxuXHRcdFx0eTogKHkgKyBub2RlSGVpZ2h0ICsgTk9ERV9HQVBfWSkgLSBOT0RFX0dBUF9ZIC8gMixcblx0XHRcdHdpZHRoOiBzZ0NvbnRlbnRXaWR0aCArIFNVQkdSQVBIX1BBRERJTkcgKiAyLFxuXHRcdFx0aGVpZ2h0OiB0b3RhbENoaWxkcmVuSGVpZ2h0ICsgU1VCR1JBUEhfSEVBREVSX0hFSUdIVCArIE5PREVfR0FQX1ksXG5cdFx0XHRkZXB0aCxcblx0XHRcdG5vZGVJZDogbm9kZS5pZCxcblx0XHR9KTtcblx0fVxuXG5cdHJlc3VsdC53aWR0aCA9IE1hdGgubWF4KG5vZGVXaWR0aCwgbWF4V2lkdGggKyBpbmRlbnRYICogMiwgaXNTdWJhZ2VudCA/IHNnQ29udGVudFdpZHRoICsgaW5kZW50WCAqIDIgOiAwKTtcblx0cmVzdWx0LmhlaWdodCA9IG5vZGVIZWlnaHQgKyBOT0RFX0dBUF9ZICsgdG90YWxDaGlsZHJlbkhlaWdodCArIChpc1N1YmFnZW50ID8gU1VCR1JBUEhfSEVBREVSX0hFSUdIVCA6IDApO1xuXHRyZXN1bHQuZXhpdE5vZGVzID0gZXhpdE5vZGVzO1xuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGxheW91dFBhcmFsbGVsR3JvdXAoY2hpbGRyZW46IEZsb3dOb2RlW10sIHN0YXJ0WDogbnVtYmVyLCB5OiBudW1iZXIsIGRlcHRoOiBudW1iZXIsIGNvbGxhcHNlZElkcz86IFJlYWRvbmx5U2V0PHN0cmluZz4sIGV4cGFuZGVkTWVyZ2VkSWRzPzogUmVhZG9ubHlTZXQ8c3RyaW5nPiwgcGVuZGluZ0V4cGFuc2lvbnM/OiBQZW5kaW5nRXhwYW5zaW9uW10pOiB7XG5cdG5vZGVzOiBMYXlvdXROb2RlW107XG5cdGVkZ2VzOiBMYXlvdXRFZGdlW107XG5cdHN1YmdyYXBoczogU3ViZ3JhcGhSZWN0W107XG5cdGVudHJ5Tm9kZXM6IExheW91dE5vZGVbXTtcblx0ZXhpdE5vZGVzOiBMYXlvdXROb2RlW107XG5cdHdpZHRoOiBudW1iZXI7XG5cdGhlaWdodDogbnVtYmVyO1xufSB7XG5cdGNvbnN0IHN1YnRyZWVMYXlvdXRzOiBTdWJ0cmVlTGF5b3V0W10gPSBbXTtcblx0bGV0IHRvdGFsV2lkdGggPSAwO1xuXHRsZXQgbWF4SGVpZ2h0ID0gMDtcblxuXHRmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG5cdFx0Y29uc3Qgc3VidHJlZSA9IGxheW91dFN1YnRyZWUoY2hpbGQsIDAsIHksIGRlcHRoLCBjb2xsYXBzZWRJZHMsIGV4cGFuZGVkTWVyZ2VkSWRzLCBwZW5kaW5nRXhwYW5zaW9ucyk7XG5cdFx0c3VidHJlZUxheW91dHMucHVzaChzdWJ0cmVlKTtcblx0XHR0b3RhbFdpZHRoICs9IHN1YnRyZWUud2lkdGg7XG5cdFx0bWF4SGVpZ2h0ID0gTWF0aC5tYXgobWF4SGVpZ2h0LCBzdWJ0cmVlLmhlaWdodCk7XG5cdH1cblx0dG90YWxXaWR0aCArPSAoY2hpbGRyZW4ubGVuZ3RoIC0gMSkgKiBQQVJBTExFTF9HQVBfWDtcblxuXHRjb25zdCBub2RlczogTGF5b3V0Tm9kZVtdID0gW107XG5cdGNvbnN0IGVkZ2VzOiBMYXlvdXRFZGdlW10gPSBbXTtcblx0Y29uc3Qgc3ViZ3JhcGhzOiBTdWJncmFwaFJlY3RbXSA9IFtdO1xuXHRjb25zdCBlbnRyeU5vZGVzOiBMYXlvdXROb2RlW10gPSBbXTtcblx0Y29uc3QgZXhpdE5vZGVzOiBMYXlvdXROb2RlW10gPSBbXTtcblxuXHRsZXQgY3VycmVudFggPSBzdGFydFg7XG5cdGZvciAoY29uc3Qgc3VidHJlZSBvZiBzdWJ0cmVlTGF5b3V0cykge1xuXHRcdGNvbnN0IGR4ID0gY3VycmVudFg7XG5cdFx0Y29uc3Qgb2Zmc2V0Tm9kZXMgPSBzdWJ0cmVlLm5vZGVzLm1hcChuID0+ICh7IC4uLm4sIHg6IG4ueCArIGR4IH0pKTtcblx0XHRjb25zdCBvZmZzZXRFZGdlcyA9IHN1YnRyZWUuZWRnZXMubWFwKGUgPT4gKHtcblx0XHRcdGZyb21JZDogZS5mcm9tSWQsIHRvSWQ6IGUudG9JZCxcblx0XHRcdGZyb21YOiBlLmZyb21YICsgZHgsIGZyb21ZOiBlLmZyb21ZLFxuXHRcdFx0dG9YOiBlLnRvWCArIGR4LCB0b1k6IGUudG9ZLFxuXHRcdH0pKTtcblx0XHRjb25zdCBvZmZzZXRTdWJncmFwaHMgPSBzdWJ0cmVlLnN1YmdyYXBocy5tYXAocyA9PiAoeyAuLi5zLCB4OiBzLnggKyBkeCB9KSk7XG5cblx0XHRub2Rlcy5wdXNoKC4uLm9mZnNldE5vZGVzKTtcblx0XHRlZGdlcy5wdXNoKC4uLm9mZnNldEVkZ2VzKTtcblx0XHRzdWJncmFwaHMucHVzaCguLi5vZmZzZXRTdWJncmFwaHMpO1xuXHRcdGVudHJ5Tm9kZXMucHVzaChvZmZzZXROb2Rlcy5maW5kKG4gPT4gbi5pZCA9PT0gc3VidHJlZS5lbnRyeU5vZGUuaWQpISk7XG5cblx0XHRjb25zdCBleGl0SWRzID0gbmV3IFNldChzdWJ0cmVlLmV4aXROb2Rlcy5tYXAobiA9PiBuLmlkKSk7XG5cdFx0ZXhpdE5vZGVzLnB1c2goLi4ub2Zmc2V0Tm9kZXMuZmlsdGVyKG4gPT4gZXhpdElkcy5oYXMobi5pZCkpKTtcblx0XHRjdXJyZW50WCArPSBzdWJ0cmVlLndpZHRoICsgUEFSQUxMRUxfR0FQX1g7XG5cdH1cblxuXHRyZXR1cm4geyBub2RlcywgZWRnZXMsIHN1YmdyYXBocywgZW50cnlOb2RlcywgZXhpdE5vZGVzLCB3aWR0aDogdG90YWxXaWR0aCwgaGVpZ2h0OiBtYXhIZWlnaHQgfTtcbn1cblxuZnVuY3Rpb24gY2VudGVyTGF5b3V0KGxheW91dDogeyBub2RlczogTGF5b3V0Tm9kZVtdOyBlZGdlczogTGF5b3V0RWRnZVtdOyBzdWJncmFwaHM6IFN1YmdyYXBoUmVjdFtdIH0sIGNlbnRlclg6IG51bWJlcik6IHZvaWQge1xuXHRpZiAobGF5b3V0Lm5vZGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGxldCBtaW5YID0gSW5maW5pdHk7XG5cdGxldCBtYXhYID0gLUluZmluaXR5O1xuXHRmb3IgKGNvbnN0IG5vZGUgb2YgbGF5b3V0Lm5vZGVzKSB7XG5cdFx0bWluWCA9IE1hdGgubWluKG1pblgsIG5vZGUueCk7XG5cdFx0bWF4WCA9IE1hdGgubWF4KG1heFgsIG5vZGUueCArIG5vZGUud2lkdGgpO1xuXHR9XG5cdGNvbnN0IGR4ID0gY2VudGVyWCAtIChtaW5YICsgbWF4WCkgLyAyO1xuXG5cdGZvciAobGV0IGkgPSAwOyBpIDwgbGF5b3V0Lm5vZGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgbiA9IGxheW91dC5ub2Rlc1tpXTtcblx0XHQobGF5b3V0Lm5vZGVzIGFzIExheW91dE5vZGVbXSlbaV0gPSB7IC4uLm4sIHg6IG4ueCArIGR4IH07XG5cdH1cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsYXlvdXQuZWRnZXMubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBlID0gbGF5b3V0LmVkZ2VzW2ldO1xuXHRcdChsYXlvdXQuZWRnZXMgYXMgTGF5b3V0RWRnZVtdKVtpXSA9IHsgZnJvbUlkOiBlLmZyb21JZCwgdG9JZDogZS50b0lkLCBmcm9tWDogZS5mcm9tWCArIGR4LCBmcm9tWTogZS5mcm9tWSwgdG9YOiBlLnRvWCArIGR4LCB0b1k6IGUudG9ZIH07XG5cdH1cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsYXlvdXQuc3ViZ3JhcGhzLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgcyA9IGxheW91dC5zdWJncmFwaHNbaV07XG5cdFx0KGxheW91dC5zdWJncmFwaHMgYXMgU3ViZ3JhcGhSZWN0W10pW2ldID0geyAuLi5zLCB4OiBzLnggKyBkeCB9O1xuXHR9XG59XG5cbi8vIC0tLS0gU1ZHIFJlbmRlcmluZyAtLS0tXG5cbmNvbnN0IFNWR19OUyA9ICdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc7XG5cbmZ1bmN0aW9uIHN2Z0VsPEsgZXh0ZW5kcyBrZXlvZiBTVkdFbGVtZW50VGFnTmFtZU1hcD4odGFnOiBLLCBhdHRyczogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgbnVtYmVyPik6IFNWR0VsZW1lbnRUYWdOYW1lTWFwW0tdIHtcblx0Y29uc3QgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoU1ZHX05TLCB0YWcpO1xuXHRmb3IgKGNvbnN0IFtrLCB2XSBvZiBPYmplY3QuZW50cmllcyhhdHRycykpIHtcblx0XHRlbC5zZXRBdHRyaWJ1dGUoaywgU3RyaW5nKHYpKTtcblx0fVxuXHRyZXR1cm4gZWw7XG59XG5cbmZ1bmN0aW9uIGdldE5vZGVDb2xvcihraW5kOiBJQ2hhdERlYnVnRXZlbnRbJ2tpbmQnXSwgaXNFcnJvcj86IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRpZiAoaXNFcnJvcikge1xuXHRcdHJldHVybiAndmFyKC0tdnNjb2RlLWVycm9yRm9yZWdyb3VuZCknO1xuXHR9XG5cdHN3aXRjaCAoa2luZCkge1xuXHRcdGNhc2UgJ3VzZXJNZXNzYWdlJzpcblx0XHRcdHJldHVybiAndmFyKC0tdnNjb2RlLXRleHRMaW5rLWZvcmVncm91bmQpJztcblx0XHRjYXNlICdtb2RlbFR1cm4nOlxuXHRcdFx0cmV0dXJuICd2YXIoLS12c2NvZGUtY2hhcnRzLWJsdWUsIHZhcigtLXZzY29kZS10ZXh0TGluay1mb3JlZ3JvdW5kKSknO1xuXHRcdGNhc2UgJ3Rvb2xDYWxsJzpcblx0XHRcdHJldHVybiAndmFyKC0tdnNjb2RlLXRlc3RpbmctaWNvblBhc3NlZCwgIzczYzk5MSknO1xuXHRcdGNhc2UgJ3N1YmFnZW50SW52b2NhdGlvbic6XG5cdFx0XHRyZXR1cm4gJ3ZhcigtLXZzY29kZS1jaGFydHMtcHVycGxlLCAjYjI2N2U2KSc7XG5cdFx0Y2FzZSAnYWdlbnRSZXNwb25zZSc6XG5cdFx0XHRyZXR1cm4gJ3ZhcigtLXZzY29kZS1mb3JlZ3JvdW5kKSc7XG5cdFx0Y2FzZSAnZ2VuZXJpYyc6XG5cdFx0XHRyZXR1cm4gJ3ZhcigtLXZzY29kZS1kZXNjcmlwdGlvbkZvcmVncm91bmQpJztcblx0fVxufVxuXG5jb25zdCBTVUJHUkFQSF9DT0xPUlMgPSBbXG5cdCd2YXIoLS12c2NvZGUtY2hhcnRzLXB1cnBsZSwgI2IyNjdlNiknLFxuXHQndmFyKC0tdnNjb2RlLWNoYXJ0cy1ibHVlLCAjM2RjOWIwKScsXG5cdCd2YXIoLS12c2NvZGUtY2hhcnRzLXllbGxvdywgI2U1YzA3YiknLFxuXHQndmFyKC0tdnNjb2RlLWNoYXJ0cy1vcmFuZ2UsICNkMTlhNjYpJyxcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJGbG93Q2hhcnRTVkcobGF5b3V0OiBGbG93TGF5b3V0KTogRmxvd0NoYXJ0UmVuZGVyUmVzdWx0IHtcblx0Y29uc3QgZm9jdXNhYmxlRWxlbWVudHMgPSBuZXcgTWFwPHN0cmluZywgU1ZHRWxlbWVudD4oKTtcblx0Y29uc3Qgc3ZnID0gc3ZnRWwoJ3N2ZycsIHtcblx0XHR3aWR0aDogbGF5b3V0LndpZHRoLFxuXHRcdGhlaWdodDogbGF5b3V0LmhlaWdodCxcblx0XHR2aWV3Qm94OiBgMCAwICR7bGF5b3V0LndpZHRofSAke2xheW91dC5oZWlnaHR9YCxcblx0XHRyb2xlOiAnaW1nJyxcblx0XHQnYXJpYS1sYWJlbCc6IGBBZ2VudCBmbG93IGNoYXJ0IHdpdGggJHtsYXlvdXQubm9kZXMubGVuZ3RofSBub2Rlc2AsXG5cdH0pO1xuXHRzdmcuY2xhc3NMaXN0LmFkZCgnY2hhdC1kZWJ1Zy1mbG93Y2hhcnQtc3ZnJyk7XG5cblx0cmVuZGVyU3ViZ3JhcGhzKHN2ZywgbGF5b3V0LnN1YmdyYXBocywgZm9jdXNhYmxlRWxlbWVudHMpO1xuXHRyZW5kZXJFZGdlcyhzdmcsIGxheW91dC5lZGdlcyk7XG5cdHJlbmRlck5vZGVzKHN2ZywgbGF5b3V0Lm5vZGVzLCBmb2N1c2FibGVFbGVtZW50cyk7XG5cblx0Ly8gU29ydCBmb2N1c2FibGUgZWxlbWVudHMgYnkgdmlzdWFsIHBvc2l0aW9uICh0b3AtdG8tYm90dG9tLCBsZWZ0LXRvLXJpZ2h0KVxuXHQvLyBzbyBrZXlib2FyZCBuYXZpZ2F0aW9uIGZvbGxvd3MgdGhlIGZsb3cgY2hhcnQgb3JkZXIuXG5cdGNvbnN0IHBvc2l0aW9uQnlLZXkgPSBuZXcgTWFwPHN0cmluZywgeyB5OiBudW1iZXI7IHg6IG51bWJlciB9PigpO1xuXHRmb3IgKGNvbnN0IHNnIG9mIGxheW91dC5zdWJncmFwaHMpIHtcblx0XHRwb3NpdGlvbkJ5S2V5LnNldChgc2c6JHtzZy5ub2RlSWR9YCwgeyB5OiBzZy55LCB4OiBzZy54IH0pO1xuXHR9XG5cdGZvciAoY29uc3Qgbm9kZSBvZiBsYXlvdXQubm9kZXMpIHtcblx0XHRwb3NpdGlvbkJ5S2V5LnNldChub2RlLmlkLCB7IHk6IG5vZGUueSwgeDogbm9kZS54IH0pO1xuXHR9XG5cdGNvbnN0IHNvcnRlZEZvY3VzYWJsZSA9IG5ldyBNYXAoXG5cdFx0Wy4uLmZvY3VzYWJsZUVsZW1lbnRzLmVudHJpZXMoKV0uc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0Y29uc3QgcG9zQSA9IHBvc2l0aW9uQnlLZXkuZ2V0KGFbMF0pO1xuXHRcdFx0Y29uc3QgcG9zQiA9IHBvc2l0aW9uQnlLZXkuZ2V0KGJbMF0pO1xuXHRcdFx0aWYgKCFwb3NBIHx8ICFwb3NCKSB7XG5cdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHBvc0EueSAhPT0gcG9zQi55ID8gcG9zQS55IC0gcG9zQi55IDogcG9zQS54IC0gcG9zQi54O1xuXHRcdH0pXG5cdCk7XG5cblx0Ly8gQnVpbGQgYWRqYWNlbmN5IG1hcCBmcm9tIGVkZ2VzIHNvIGtleWJvYXJkIG5hdmlnYXRpb24gY2FuIGZvbGxvd1xuXHQvLyBncmFwaCBkaXJlY3Rpb25hbGl0eSBpbnN0ZWFkIG9mIHZpc3VhbCBzb3J0IG9yZGVyLlxuXHRjb25zdCBhZGphY2VuY3kgPSBuZXcgTWFwPHN0cmluZywgeyBuZXh0OiBzdHJpbmdbXTsgcHJldjogc3RyaW5nW10gfT4oKTtcblx0Zm9yIChjb25zdCBlZGdlIG9mIGxheW91dC5lZGdlcykge1xuXHRcdGlmIChlZGdlLmZyb21JZCAmJiBlZGdlLnRvSWQpIHtcblx0XHRcdGxldCBmcm9tRW50cnkgPSBhZGphY2VuY3kuZ2V0KGVkZ2UuZnJvbUlkKTtcblx0XHRcdGlmICghZnJvbUVudHJ5KSB7XG5cdFx0XHRcdGZyb21FbnRyeSA9IHsgbmV4dDogW10sIHByZXY6IFtdIH07XG5cdFx0XHRcdGFkamFjZW5jeS5zZXQoZWRnZS5mcm9tSWQsIGZyb21FbnRyeSk7XG5cdFx0XHR9XG5cdFx0XHRmcm9tRW50cnkubmV4dC5wdXNoKGVkZ2UudG9JZCk7XG5cblx0XHRcdGxldCB0b0VudHJ5ID0gYWRqYWNlbmN5LmdldChlZGdlLnRvSWQpO1xuXHRcdFx0aWYgKCF0b0VudHJ5KSB7XG5cdFx0XHRcdHRvRW50cnkgPSB7IG5leHQ6IFtdLCBwcmV2OiBbXSB9O1xuXHRcdFx0XHRhZGphY2VuY3kuc2V0KGVkZ2UudG9JZCwgdG9FbnRyeSk7XG5cdFx0XHR9XG5cdFx0XHR0b0VudHJ5LnByZXYucHVzaChlZGdlLmZyb21JZCk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHsgc3ZnLCBmb2N1c2FibGVFbGVtZW50czogc29ydGVkRm9jdXNhYmxlLCBhZGphY2VuY3ksIHBvc2l0aW9uczogcG9zaXRpb25CeUtleSB9O1xufVxuXG5mdW5jdGlvbiByZW5kZXJTdWJncmFwaHMoc3ZnOiBTVkdFbGVtZW50LCBzdWJncmFwaHM6IHJlYWRvbmx5IFN1YmdyYXBoUmVjdFtdLCBmb2N1c2FibGVFbGVtZW50czogTWFwPHN0cmluZywgU1ZHRWxlbWVudD4pOiB2b2lkIHtcblx0Zm9yIChsZXQgc2dJZHggPSAwOyBzZ0lkeCA8IHN1YmdyYXBocy5sZW5ndGg7IHNnSWR4KyspIHtcblx0XHRjb25zdCBzZyA9IHN1YmdyYXBoc1tzZ0lkeF07XG5cdFx0Y29uc3QgY29sb3IgPSBTVUJHUkFQSF9DT0xPUlNbc2cuZGVwdGggJSBTVUJHUkFQSF9DT0xPUlMubGVuZ3RoXTtcblx0XHRjb25zdCBpc0NvbGxhcHNlZCA9IHNnLmNvbGxhcHNlZENoaWxkQ291bnQgIT09IHVuZGVmaW5lZDtcblx0XHRjb25zdCBnID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFNWR19OUywgJ2cnKTtcblx0XHRnLmNsYXNzTGlzdC5hZGQoJ2NoYXQtZGVidWctZmxvd2NoYXJ0LXN1YmdyYXBoJyk7XG5cblx0XHRjb25zdCByZWN0QXR0cnMgPSB7IHg6IHNnLngsIHk6IHNnLnksIHdpZHRoOiBzZy53aWR0aCwgaGVpZ2h0OiBzZy5oZWlnaHQsIHJ4OiBOT0RFX0JPUkRFUl9SQURJVVMsIHJ5OiBOT0RFX0JPUkRFUl9SQURJVVMgfTtcblx0XHRjb25zdCBjbGlwSWQgPSBgc2ctY2xpcC0ke3NnSWR4fWA7XG5cblx0XHQvLyBDbGlwUGF0aCBmb3Igcm91bmRlZCBjb3JuZXJzXG5cdFx0Y29uc3QgY2xpcFBhdGggPSBzdmdFbCgnY2xpcFBhdGgnLCB7IGlkOiBjbGlwSWQgfSk7XG5cdFx0Y2xpcFBhdGguYXBwZW5kQ2hpbGQoc3ZnRWwoJ3JlY3QnLCByZWN0QXR0cnMpKTtcblx0XHRzdmcuYXBwZW5kQ2hpbGQoY2xpcFBhdGgpO1xuXG5cdFx0Ly8gRmlsbGVkIGJhY2tncm91bmRcblx0XHRnLmFwcGVuZENoaWxkKHN2Z0VsKCdyZWN0JywgeyAuLi5yZWN0QXR0cnMsIGZpbGw6IGNvbG9yLCBvcGFjaXR5OiAwLjA2ICsgc2cuZGVwdGggKiAwLjAyIH0pKTtcblxuXHRcdC8vIERhc2hlZCBib3JkZXJcblx0XHRnLmFwcGVuZENoaWxkKHN2Z0VsKCdyZWN0JywgeyAuLi5yZWN0QXR0cnMsIGZpbGw6ICdub25lJywgc3Ryb2tlOiBjb2xvciwgJ3N0cm9rZS13aWR0aCc6IDEsICdzdHJva2UtZGFzaGFycmF5JzogJzYsMycsIG9wYWNpdHk6IDAuNSB9KSk7XG5cblx0XHQvLyBHdXR0ZXIgbGluZVxuXHRcdGcuYXBwZW5kQ2hpbGQoc3ZnRWwoJ3JlY3QnLCB7IHg6IHNnLngsIHk6IHNnLnksIHdpZHRoOiBHVVRURVJfV0lEVEgsIGhlaWdodDogc2cuaGVpZ2h0LCBmaWxsOiBjb2xvciwgb3BhY2l0eTogMC43LCAnY2xpcC1wYXRoJzogYHVybCgjJHtjbGlwSWR9KWAgfSkpO1xuXG5cdFx0Ly8gSGVhZGVyIGdyb3VwIChjbGlja2FibGUsIGtleWJvYXJkIGFjY2Vzc2libGUpXG5cdFx0Y29uc3QgaGVhZGVyR3JvdXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoU1ZHX05TLCAnZycpO1xuXHRcdGhlYWRlckdyb3VwLnNldEF0dHJpYnV0ZSgnZGF0YS1zdWJncmFwaC1pZCcsIHNnLm5vZGVJZCk7XG5cdFx0aGVhZGVyR3JvdXAuY2xhc3NMaXN0LmFkZCgnY2hhdC1kZWJ1Zy1mbG93Y2hhcnQtc3ViZ3JhcGgtaGVhZGVyJyk7XG5cdFx0aGVhZGVyR3JvdXAuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cdFx0aGVhZGVyR3JvdXAuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdGhlYWRlckdyb3VwLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIFN0cmluZyghaXNDb2xsYXBzZWQpKTtcblx0XHRoZWFkZXJHcm91cC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBgJHtzZy5sYWJlbH06ICR7aXNDb2xsYXBzZWQgPyAnY29sbGFwc2VkJyA6ICdleHBhbmRlZCd9JHtpc0NvbGxhcHNlZCAmJiBzZy5jb2xsYXBzZWRDaGlsZENvdW50ICE9PSB1bmRlZmluZWQgPyBgLCAke3NnLmNvbGxhcHNlZENoaWxkQ291bnR9IGl0ZW1zIGhpZGRlbmAgOiAnJ31gKTtcblxuXHRcdGNvbnN0IGhlYWRlckJhciA9IHN2Z0VsKCdyZWN0JywgeyB4OiBzZy54LCB5OiBzZy55LCB3aWR0aDogc2cud2lkdGgsIGhlaWdodDogU1VCR1JBUEhfSEVBREVSX0hFSUdIVCwgZmlsbDogY29sb3IsIG9wYWNpdHk6IDAuMTUsICdjbGlwLXBhdGgnOiBgdXJsKCMke2NsaXBJZH0pYCB9KTtcblx0XHRoZWFkZXJHcm91cC5hcHBlbmRDaGlsZChoZWFkZXJCYXIpO1xuXG5cdFx0Ly8gQ2hldnJvbiArIGhlYWRlciBsYWJlbFxuXHRcdGNvbnN0IGNoZXZyb24gPSBpc0NvbGxhcHNlZCA/ICdcXHUyNUI2JyA6ICdcXHUyNUJDJztcblx0XHRjb25zdCBoZWFkZXJUZXh0ID0gc3ZnRWwoJ3RleHQnLCB7XG5cdFx0XHR4OiBzZy54ICsgR1VUVEVSX1dJRFRIICsgOCxcblx0XHRcdHk6IHNnLnkgKyBTVUJHUkFQSF9IRUFERVJfSEVJR0hUIC8gMiArIDQsXG5cdFx0XHQnZm9udC1zaXplJzogU1VCTEFCRUxfRk9OVF9TSVpFLFxuXHRcdFx0ZmlsbDogY29sb3IsXG5cdFx0XHQnZm9udC1mYW1pbHknOiAndmFyKC0tdnNjb2RlLWZvbnQtZmFtaWx5LCBzYW5zLXNlcmlmKScsXG5cdFx0XHQnZm9udC13ZWlnaHQnOiAnNjAwJyxcblx0XHR9KTtcblx0XHRoZWFkZXJUZXh0LnRleHRDb250ZW50ID0gYCR7Y2hldnJvbn0gJHtzZy5sYWJlbH1gO1xuXHRcdGhlYWRlckdyb3VwLmFwcGVuZENoaWxkKGhlYWRlclRleHQpO1xuXHRcdGcuYXBwZW5kQ2hpbGQoaGVhZGVyR3JvdXApO1xuXHRcdGZvY3VzYWJsZUVsZW1lbnRzLnNldChgc2c6JHtzZy5ub2RlSWR9YCwgaGVhZGVyR3JvdXAgYXMgdW5rbm93biBhcyBTVkdFbGVtZW50KTtcblxuXHRcdC8vIENvbGxhcHNlZCBiYWRnZVxuXHRcdGlmIChpc0NvbGxhcHNlZCAmJiBzZy5jb2xsYXBzZWRDaGlsZENvdW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IGJhZGdlVGV4dCA9IHN2Z0VsKCd0ZXh0Jywge1xuXHRcdFx0XHR4OiBzZy54ICsgc2cud2lkdGggLyAyLFxuXHRcdFx0XHR5OiBzZy55ICsgU1VCR1JBUEhfSEVBREVSX0hFSUdIVCArIFNVQkdSQVBIX1BBRERJTkcgKyA0LFxuXHRcdFx0XHQnZm9udC1zaXplJzogU1VCTEFCRUxfRk9OVF9TSVpFLFxuXHRcdFx0XHRmaWxsOiAndmFyKC0tdnNjb2RlLWRlc2NyaXB0aW9uRm9yZWdyb3VuZCknLFxuXHRcdFx0XHQnZm9udC1mYW1pbHknOiAndmFyKC0tdnNjb2RlLWZvbnQtZmFtaWx5LCBzYW5zLXNlcmlmKScsXG5cdFx0XHRcdCdmb250LXN0eWxlJzogJ2l0YWxpYycsXG5cdFx0XHRcdCd0ZXh0LWFuY2hvcic6ICdtaWRkbGUnLFxuXHRcdFx0fSk7XG5cdFx0XHRiYWRnZVRleHQudGV4dENvbnRlbnQgPSBgKyR7c2cuY29sbGFwc2VkQ2hpbGRDb3VudH0gaXRlbXNgO1xuXHRcdFx0Zy5hcHBlbmRDaGlsZChiYWRnZVRleHQpO1xuXHRcdH1cblxuXHRcdHN2Zy5hcHBlbmRDaGlsZChnKTtcblx0fVxufVxuXG5mdW5jdGlvbiByZW5kZXJFZGdlcyhzdmc6IFNWR0VsZW1lbnQsIGVkZ2VzOiByZWFkb25seSBMYXlvdXRFZGdlW10pOiB2b2lkIHtcblx0Y29uc3Qgc3Ryb2tlQXR0cnMgPSB7IGZpbGw6ICdub25lJywgc3Ryb2tlOiAndmFyKC0tdnNjb2RlLWRlc2NyaXB0aW9uRm9yZWdyb3VuZCknLCAnc3Ryb2tlLXdpZHRoJzogRURHRV9TVFJPS0VfV0lEVEgsICdzdHJva2UtbGluZWNhcCc6ICdyb3VuZCcgfTtcblx0Ly8gYWxsb3ctYW55LXVuaWNvZGUtbmV4dC1saW5lXG5cdGNvbnN0IHIgPSA2OyAvLyBjb3JuZXIgcmFkaXVzIGZvciA5MFx1MDBCMCBiZW5kc1xuXG5cdGZvciAoY29uc3QgZWRnZSBvZiBlZGdlcykge1xuXHRcdGNvbnN0IG1pZFkgPSAoZWRnZS5mcm9tWSArIGVkZ2UudG9ZKSAvIDI7XG5cdFx0bGV0IGQ6IHN0cmluZztcblx0XHRjb25zdCBpc0hvcml6b250YWwgPSBlZGdlLmZyb21ZID09PSBlZGdlLnRvWTtcblxuXHRcdGlmIChpc0hvcml6b250YWwpIHtcblx0XHRcdC8vIEhvcml6b250YWxseSBhbGlnbmVkOiBzdHJhaWdodCBsaW5lICh1c2VkIGJ5IGV4cGFuZGVkIG1lcmdlZCBub2Rlcylcblx0XHRcdGQgPSBgTSAke2VkZ2UuZnJvbVh9ICR7ZWRnZS5mcm9tWX0gTCAke2VkZ2UudG9YfSAke2VkZ2UudG9ZfWA7XG5cdFx0fSBlbHNlIGlmIChlZGdlLmZyb21YID09PSBlZGdlLnRvWCkge1xuXHRcdFx0Ly8gVmVydGljYWxseSBhbGlnbmVkOiBzdHJhaWdodCBsaW5lXG5cdFx0XHRkID0gYE0gJHtlZGdlLmZyb21YfSAke2VkZ2UuZnJvbVl9IEwgJHtlZGdlLnRvWH0gJHtlZGdlLnRvWX1gO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBhbGxvdy1hbnktdW5pY29kZS1uZXh0LWxpbmVcblx0XHRcdC8vIE9ydGhvZ29uYWwgcm91dGluZzogZG93biwgOTBcdTAwQjAgaG9yaXpvbnRhbCwgOTBcdTAwQjAgZG93blxuXHRcdFx0Y29uc3QgZHggPSBlZGdlLnRvWCAtIGVkZ2UuZnJvbVg7XG5cdFx0XHRjb25zdCBzaWduWCA9IGR4ID4gMCA/IDEgOiAtMTtcblx0XHRcdGNvbnN0IGFic0R4ID0gTWF0aC5hYnMoZHgpO1xuXHRcdFx0Y29uc3QgY3IgPSBNYXRoLm1pbihyLCBhYnNEeCAvIDIsIChlZGdlLnRvWSAtIGVkZ2UuZnJvbVkpIC8gNCk7XG5cblx0XHRcdGQgPSBgTSAke2VkZ2UuZnJvbVh9ICR7ZWRnZS5mcm9tWX1gXG5cdFx0XHRcdC8vIERvd24gdG8gZmlyc3QgYmVuZFxuXHRcdFx0XHQrIGAgTCAke2VkZ2UuZnJvbVh9ICR7bWlkWSAtIGNyfWBcblx0XHRcdFx0Ly8gYWxsb3ctYW55LXVuaWNvZGUtbmV4dC1saW5lXG5cdFx0XHRcdC8vIDkwXHUwMEIwIGFyYyB0dXJuaW5nIGhvcml6b250YWxcblx0XHRcdFx0KyBgIFEgJHtlZGdlLmZyb21YfSAke21pZFl9LCAke2VkZ2UuZnJvbVggKyBzaWduWCAqIGNyfSAke21pZFl9YFxuXHRcdFx0XHQvLyBIb3Jpem9udGFsIHRvIHNlY29uZCBiZW5kXG5cdFx0XHRcdCsgYCBMICR7ZWRnZS50b1ggLSBzaWduWCAqIGNyfSAke21pZFl9YFxuXHRcdFx0XHQvLyBhbGxvdy1hbnktdW5pY29kZS1uZXh0LWxpbmVcblx0XHRcdFx0Ly8gOTBcdTAwQjAgYXJjIHR1cm5pbmcgZG93blxuXHRcdFx0XHQrIGAgUSAke2VkZ2UudG9YfSAke21pZFl9LCAke2VkZ2UudG9YfSAke21pZFkgKyBjcn1gXG5cdFx0XHRcdC8vIERvd24gdG8gdGFyZ2V0XG5cdFx0XHRcdCsgYCBMICR7ZWRnZS50b1h9ICR7ZWRnZS50b1l9YDtcblx0XHR9XG5cblx0XHRzdmcuYXBwZW5kQ2hpbGQoc3ZnRWwoJ3BhdGgnLCB7IC4uLnN0cm9rZUF0dHJzLCBkIH0pKTtcblxuXHRcdC8vIEFycm93aGVhZDogcmlnaHQtcG9pbnRpbmcgZm9yIGhvcml6b250YWwgZWRnZXMsIGRvd24tcG9pbnRpbmcgb3RoZXJ3aXNlXG5cdFx0Y29uc3QgYSA9IDU7XG5cdFx0bGV0IGFycm93RDogc3RyaW5nO1xuXHRcdGlmIChpc0hvcml6b250YWwpIHtcblx0XHRcdGNvbnN0IHNpZ25YID0gZWRnZS50b1ggPiBlZGdlLmZyb21YID8gMSA6IC0xO1xuXHRcdFx0YXJyb3dEID0gYE0gJHtlZGdlLnRvWCAtIHNpZ25YICogYSAqIDEuNX0gJHtlZGdlLnRvWSAtIGF9IEwgJHtlZGdlLnRvWH0gJHtlZGdlLnRvWX0gTCAke2VkZ2UudG9YIC0gc2lnblggKiBhICogMS41fSAke2VkZ2UudG9ZICsgYX1gO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhcnJvd0QgPSBgTSAke2VkZ2UudG9YIC0gYX0gJHtlZGdlLnRvWSAtIGEgKiAxLjV9IEwgJHtlZGdlLnRvWH0gJHtlZGdlLnRvWX0gTCAke2VkZ2UudG9YICsgYX0gJHtlZGdlLnRvWSAtIGEgKiAxLjV9YDtcblx0XHR9XG5cdFx0c3ZnLmFwcGVuZENoaWxkKHN2Z0VsKCdwYXRoJywge1xuXHRcdFx0Li4uc3Ryb2tlQXR0cnMsXG5cdFx0XHQnc3Ryb2tlLWxpbmVqb2luJzogJ3JvdW5kJyxcblx0XHRcdGQ6IGFycm93RCxcblx0XHR9KSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gcmVuZGVyTm9kZXMoc3ZnOiBTVkdFbGVtZW50LCBub2RlczogcmVhZG9ubHkgTGF5b3V0Tm9kZVtdLCBmb2N1c2FibGVFbGVtZW50czogTWFwPHN0cmluZywgU1ZHRWxlbWVudD4pOiB2b2lkIHtcblx0Y29uc3QgZm9udEZhbWlseSA9ICd2YXIoLS12c2NvZGUtZm9udC1mYW1pbHksIHNhbnMtc2VyaWYpJztcblx0Y29uc3Qgbm9kZUZpbGwgPSAndmFyKC0tdnNjb2RlLWVkaXRvci1iYWNrZ3JvdW5kLCB2YXIoLS12c2NvZGUtZWRpdG9yV2lkZ2V0LWJhY2tncm91bmQpKSc7XG5cblx0Zm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB7XG5cdFx0Y29uc3QgZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhTVkdfTlMsICdnJyk7XG5cdFx0Zy5jbGFzc0xpc3QuYWRkKCdjaGF0LWRlYnVnLWZsb3djaGFydC1ub2RlJyk7XG5cdFx0Zy5zZXRBdHRyaWJ1dGUoJ2RhdGEtbm9kZS1pZCcsIG5vZGUuaWQpO1xuXHRcdGcuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cdFx0Zy5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnaW1nJyk7XG5cblx0XHRjb25zdCBhcmlhTGFiZWwgPSBub2RlLnN1YmxhYmVsID8gYCR7bm9kZS5sYWJlbH0sICR7bm9kZS5zdWJsYWJlbH1gIDogbm9kZS5sYWJlbDtcblx0XHRnLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGFyaWFMYWJlbCk7XG5cdFx0Zm9jdXNhYmxlRWxlbWVudHMuc2V0KG5vZGUuaWQsIGcgYXMgdW5rbm93biBhcyBTVkdFbGVtZW50KTtcblxuXHRcdGlmIChub2RlLnRvb2x0aXApIHtcblx0XHRcdGNvbnN0IHRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFNWR19OUywgJ3RpdGxlJyk7XG5cdFx0XHR0aXRsZS50ZXh0Q29udGVudCA9IG5vZGUudG9vbHRpcDtcblx0XHRcdGcuYXBwZW5kQ2hpbGQodGl0bGUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbG9yID0gZ2V0Tm9kZUNvbG9yKG5vZGUua2luZCwgbm9kZS5pc0Vycm9yKTtcblx0XHRjb25zdCBzYWZlSWQgPSBub2RlLmlkLnJlcGxhY2UoL1teYS16QS1aMC05XS9nLCAnXycpO1xuXHRcdGNvbnN0IHJlY3RBdHRycyA9IHsgeDogbm9kZS54LCB5OiBub2RlLnksIHdpZHRoOiBub2RlLndpZHRoLCBoZWlnaHQ6IG5vZGUuaGVpZ2h0LCByeDogTk9ERV9CT1JERVJfUkFESVVTLCByeTogTk9ERV9CT1JERVJfUkFESVVTIH07XG5cblx0XHQvLyBDbGlwIHBhdGggc2hhcmVkIGJ5IGd1dHRlciBiYXIgYW5kIHRleHRcblx0XHRjb25zdCBjbGlwSWQgPSBgY2xpcC0ke3NhZmVJZH1gO1xuXHRcdGNvbnN0IGNsaXBQYXRoID0gc3ZnRWwoJ2NsaXBQYXRoJywgeyBpZDogY2xpcElkIH0pO1xuXHRcdGNsaXBQYXRoLmFwcGVuZENoaWxkKHN2Z0VsKCdyZWN0JywgcmVjdEF0dHJzKSk7XG5cdFx0c3ZnLmFwcGVuZENoaWxkKGNsaXBQYXRoKTtcblxuXHRcdC8vIEZvY3VzIHJpbmcgKGhpZGRlbiBieSBkZWZhdWx0LCBzaG93biBvbiA6Zm9jdXMgdmlhIENTUylcblx0XHRjb25zdCBmb2N1c09mZnNldCA9IDM7XG5cdFx0Zy5hcHBlbmRDaGlsZChzdmdFbCgncmVjdCcsIHtcblx0XHRcdGNsYXNzOiAnY2hhdC1kZWJ1Zy1mbG93Y2hhcnQtZm9jdXMtcmluZycsXG5cdFx0XHR4OiBub2RlLnggLSBmb2N1c09mZnNldCxcblx0XHRcdHk6IG5vZGUueSAtIGZvY3VzT2Zmc2V0LFxuXHRcdFx0d2lkdGg6IG5vZGUud2lkdGggKyBmb2N1c09mZnNldCAqIDIsXG5cdFx0XHRoZWlnaHQ6IG5vZGUuaGVpZ2h0ICsgZm9jdXNPZmZzZXQgKiAyLFxuXHRcdFx0cng6IE5PREVfQk9SREVSX1JBRElVUyArIGZvY3VzT2Zmc2V0LFxuXHRcdFx0cnk6IE5PREVfQk9SREVSX1JBRElVUyArIGZvY3VzT2Zmc2V0LFxuXHRcdFx0ZmlsbDogJ25vbmUnLFxuXHRcdFx0c3Ryb2tlOiAndmFyKC0tdnNjb2RlLWZvY3VzQm9yZGVyKScsXG5cdFx0XHQnc3Ryb2tlLXdpZHRoJzogMixcblx0XHR9KSk7XG5cblx0XHQvLyBOb2RlIHJlY3RhbmdsZVxuXHRcdGcuYXBwZW5kQ2hpbGQoc3ZnRWwoJ3JlY3QnLCB7IC4uLnJlY3RBdHRycywgZmlsbDogbm9kZUZpbGwsIHN0cm9rZTogY29sb3IsICdzdHJva2Utd2lkdGgnOiBub2RlLmlzRXJyb3IgPyAyIDogMS41IH0pKTtcblxuXHRcdC8vIEtpbmQgaW5kaWNhdG9yIChjb2xvcmVkIGd1dHRlciBiYXIpXG5cdFx0Zy5hcHBlbmRDaGlsZChzdmdFbCgncmVjdCcsIHsgeDogbm9kZS54LCB5OiBub2RlLnksIHdpZHRoOiA0LCBoZWlnaHQ6IG5vZGUuaGVpZ2h0LCBmaWxsOiBjb2xvciwgJ2NsaXAtcGF0aCc6IGB1cmwoIyR7Y2xpcElkfSlgIH0pKTtcblxuXHRcdC8vIExhYmVsIHRleHRcblx0XHRjb25zdCB0ZXh0WCA9IG5vZGUueCArIE5PREVfUEFERElOR19IO1xuXHRcdGNvbnN0IGlzTWVzc2FnZSA9IGlzTWVzc2FnZUtpbmQobm9kZS5raW5kKTtcblx0XHRpZiAoaXNNZXNzYWdlICYmIG5vZGUuc3VibGFiZWwpIHtcblx0XHRcdC8vIE1lc3NhZ2Ugbm9kZXM6IHNtYWxsIGhlYWRlciBsYWJlbCArIGxhcmdlciBtZXNzYWdlIHRleHRcblx0XHRcdGNvbnN0IGhlYWRlciA9IHN2Z0VsKCd0ZXh0JywgeyB4OiB0ZXh0WCwgeTogbm9kZS55ICsgTk9ERV9QQURESU5HX1YgKyBTVUJMQUJFTF9GT05UX1NJWkUsICdmb250LXNpemUnOiBTVUJMQUJFTF9GT05UX1NJWkUsIGZpbGw6ICd2YXIoLS12c2NvZGUtZGVzY3JpcHRpb25Gb3JlZ3JvdW5kKScsICdmb250LWZhbWlseSc6IGZvbnRGYW1pbHksICdjbGlwLXBhdGgnOiBgdXJsKCMke2NsaXBJZH0pYCB9KTtcblx0XHRcdGhlYWRlci50ZXh0Q29udGVudCA9IG5vZGUubGFiZWw7XG5cdFx0XHRnLmFwcGVuZENoaWxkKGhlYWRlcik7XG5cblx0XHRcdGNvbnN0IG1zZyA9IHN2Z0VsKCd0ZXh0JywgeyB4OiB0ZXh0WCwgeTogbm9kZS55ICsgbm9kZS5oZWlnaHQgLSBOT0RFX1BBRERJTkdfViAtIDIsICdmb250LXNpemUnOiBGT05UX1NJWkUsIGZpbGw6ICd2YXIoLS12c2NvZGUtZm9yZWdyb3VuZCknLCAnZm9udC1mYW1pbHknOiBmb250RmFtaWx5LCAnY2xpcC1wYXRoJzogYHVybCgjJHtjbGlwSWR9KWAgfSk7XG5cdFx0XHRtc2cudGV4dENvbnRlbnQgPSBub2RlLnN1YmxhYmVsO1xuXHRcdFx0Zy5hcHBlbmRDaGlsZChtc2cpO1xuXHRcdH0gZWxzZSBpZiAobm9kZS5zdWJsYWJlbCkge1xuXHRcdFx0Y29uc3QgbGFiZWwgPSBzdmdFbCgndGV4dCcsIHsgeDogdGV4dFgsIHk6IG5vZGUueSArIE5PREVfUEFERElOR19WICsgRk9OVF9TSVpFLCAnZm9udC1zaXplJzogRk9OVF9TSVpFLCBmaWxsOiAndmFyKC0tdnNjb2RlLWZvcmVncm91bmQpJywgJ2ZvbnQtZmFtaWx5JzogZm9udEZhbWlseSwgJ2NsaXAtcGF0aCc6IGB1cmwoIyR7Y2xpcElkfSlgIH0pO1xuXHRcdFx0bGFiZWwudGV4dENvbnRlbnQgPSBub2RlLmxhYmVsO1xuXHRcdFx0Zy5hcHBlbmRDaGlsZChsYWJlbCk7XG5cblx0XHRcdGNvbnN0IHN1YiA9IHN2Z0VsKCd0ZXh0JywgeyB4OiB0ZXh0WCwgeTogbm9kZS55ICsgbm9kZS5oZWlnaHQgLSBOT0RFX1BBRERJTkdfViwgJ2ZvbnQtc2l6ZSc6IFNVQkxBQkVMX0ZPTlRfU0laRSwgZmlsbDogJ3ZhcigtLXZzY29kZS1kZXNjcmlwdGlvbkZvcmVncm91bmQpJywgJ2ZvbnQtZmFtaWx5JzogZm9udEZhbWlseSwgJ2NsaXAtcGF0aCc6IGB1cmwoIyR7Y2xpcElkfSlgIH0pO1xuXHRcdFx0c3ViLnRleHRDb250ZW50ID0gbm9kZS5zdWJsYWJlbDtcblx0XHRcdGcuYXBwZW5kQ2hpbGQoc3ViKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgbGFiZWwgPSBzdmdFbCgndGV4dCcsIHsgeDogdGV4dFgsIHk6IG5vZGUueSArIG5vZGUuaGVpZ2h0IC8gMiArIEZPTlRfU0laRSAvIDIgLSAxLCAnZm9udC1zaXplJzogRk9OVF9TSVpFLCBmaWxsOiAndmFyKC0tdnNjb2RlLWZvcmVncm91bmQpJywgJ2ZvbnQtZmFtaWx5JzogZm9udEZhbWlseSwgJ2NsaXAtcGF0aCc6IGB1cmwoIyR7Y2xpcElkfSlgIH0pO1xuXHRcdFx0bGFiZWwudGV4dENvbnRlbnQgPSBub2RlLmxhYmVsO1xuXHRcdFx0Zy5hcHBlbmRDaGlsZChsYWJlbCk7XG5cdFx0fVxuXG5cdFx0Ly8gTWVyZ2VkLWRpc2NvdmVyeSBleHBhbmQvY29sbGFwc2UgdG9nZ2xlIG9uIHRoZSByaWdodCBzaWRlXG5cdFx0aWYgKG5vZGUubWVyZ2VkQ291bnQpIHtcblx0XHRcdGcuc2V0QXR0cmlidXRlKCdkYXRhLWlzLXRvZ2dsZScsICd0cnVlJyk7XG5cdFx0XHRyZW5kZXJNZXJnZWRUb2dnbGUoZywgbm9kZSwgY29sb3IsIGZvbnRGYW1pbHkpO1xuXHRcdH1cblxuXHRcdHN2Zy5hcHBlbmRDaGlsZChnKTtcblx0fVxufVxuXG5mdW5jdGlvbiByZW5kZXJNZXJnZWRUb2dnbGUoZzogRWxlbWVudCwgbm9kZTogTGF5b3V0Tm9kZSwgY29sb3I6IHN0cmluZywgZm9udEZhbWlseTogc3RyaW5nKTogdm9pZCB7XG5cdGNvbnN0IHRvZ2dsZVggPSBub2RlLnggKyBub2RlLndpZHRoIC0gTUVSR0VEX1RPR0dMRV9XSURUSDtcblx0Y29uc3QgdG9nZ2xlR3JvdXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoU1ZHX05TLCAnZycpO1xuXHR0b2dnbGVHcm91cC5jbGFzc0xpc3QuYWRkKCdjaGF0LWRlYnVnLWZsb3djaGFydC1tZXJnZWQtdG9nZ2xlJyk7XG5cdHRvZ2dsZUdyb3VwLnNldEF0dHJpYnV0ZSgnZGF0YS1tZXJnZWQtaWQnLCBub2RlLmlkKTtcblxuXHQvLyBTZXBhcmF0b3IgbGluZVxuXHR0b2dnbGVHcm91cC5hcHBlbmRDaGlsZChzdmdFbCgnbGluZScsIHtcblx0XHR4MTogdG9nZ2xlWCwgeTE6IG5vZGUueSArIDQsXG5cdFx0eDI6IHRvZ2dsZVgsIHkyOiBub2RlLnkgKyBub2RlLmhlaWdodCAtIDQsXG5cdFx0c3Ryb2tlOiAndmFyKC0tdnNjb2RlLWRlc2NyaXB0aW9uRm9yZWdyb3VuZCknLFxuXHRcdCdzdHJva2Utd2lkdGgnOiAwLjUsXG5cdFx0b3BhY2l0eTogMC40LFxuXHR9KSk7XG5cblx0Ly8gYWxsb3ctYW55LXVuaWNvZGUtbmV4dC1saW5lXG5cdC8vIEV4cGFuZCBjaGV2cm9uIChcdTI1QjYgY29sbGFwc2VkLCBcdTI1QzAgZXhwYW5kZWQpXG5cdGNvbnN0IGNoZXZyb25YID0gdG9nZ2xlWCArIE1FUkdFRF9UT0dHTEVfV0lEVEggLyAyO1xuXHRjb25zdCBjaGV2cm9uWSA9IG5vZGUueSArIG5vZGUuaGVpZ2h0IC8gMjtcblx0Y29uc3QgY2hldnJvbiA9IHN2Z0VsKCd0ZXh0Jywge1xuXHRcdHg6IGNoZXZyb25YLFxuXHRcdHk6IGNoZXZyb25ZICsgNCxcblx0XHQnZm9udC1zaXplJzogOSxcblx0XHRmaWxsOiBjb2xvcixcblx0XHQnZm9udC1mYW1pbHknOiBmb250RmFtaWx5LFxuXHRcdCd0ZXh0LWFuY2hvcic6ICdtaWRkbGUnLFxuXHRcdGN1cnNvcjogJ3BvaW50ZXInLFxuXHR9KTtcblx0Ly8gYWxsb3ctYW55LXVuaWNvZGUtbmV4dC1saW5lXG5cdGNoZXZyb24udGV4dENvbnRlbnQgPSBub2RlLmlzTWVyZ2VkRXhwYW5kZWQgPyAnXFx1MjVDMCcgOiAnXFx1MjVCNic7IC8vIFx1MjVDMCBvciBcdTI1QjZcblx0dG9nZ2xlR3JvdXAuYXBwZW5kQ2hpbGQoY2hldnJvbik7XG5cblx0Ly8gSGl0IGFyZWEgZm9yIHRoZSB0b2dnbGUgXHUyMDE0IGludmlzaWJsZSByZWN0IGNvdmVyaW5nIHRoZSB0b2dnbGUgem9uZVxuXHR0b2dnbGVHcm91cC5hcHBlbmRDaGlsZChzdmdFbCgncmVjdCcsIHtcblx0XHR4OiB0b2dnbGVYLFxuXHRcdHk6IG5vZGUueSxcblx0XHR3aWR0aDogTUVSR0VEX1RPR0dMRV9XSURUSCxcblx0XHRoZWlnaHQ6IG5vZGUuaGVpZ2h0LFxuXHRcdGZpbGw6ICd0cmFuc3BhcmVudCcsXG5cdFx0Y3Vyc29yOiAncG9pbnRlcicsXG5cdH0pKTtcblxuXHRnLmFwcGVuZENoaWxkKHRvZ2dsZUdyb3VwKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQVVBLE1BQU0sY0FBYztBQUNwQixNQUFNLHNCQUFzQjtBQUM1QixNQUFNLGlCQUFpQjtBQUN2QixNQUFNLGlCQUFpQjtBQUN2QixNQUFNLGlCQUFpQjtBQUN2QixNQUFNLGlCQUFpQjtBQUN2QixNQUFNLGFBQWE7QUFDbkIsTUFBTSxxQkFBcUI7QUFDM0Is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
