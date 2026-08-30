import { localize } from "../../../../nls.js";
import { deepClone } from "../../../../base/common/objects.js";
import { badgeBackground, chartsBlue, chartsPurple, foreground } from "../../../../platform/theme/common/colorRegistry.js";
import { asCssVariable, registerColor } from "../../../../platform/theme/common/colorUtils.js";
import { SCMIncomingHistoryItemId, SCMOutgoingHistoryItemId } from "../common/history.js";
import { rot } from "../../../../base/common/numbers.js";
import { $, svgElem } from "../../../../base/browser/dom.js";
import { PANEL_BACKGROUND } from "../../../common/theme.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { isEmptyMarkdownString, isMarkdownString, MarkdownString } from "../../../../base/common/htmlContent.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { findLastIdx } from "../../../../base/common/arraysFind.js";
const SWIMLANE_HEIGHT = 22;
const SWIMLANE_WIDTH = 11;
const SWIMLANE_CURVE_RADIUS = 5;
const CIRCLE_RADIUS = 4;
const CIRCLE_STROKE_WIDTH = 2;
const historyItemRefColor = registerColor("scmGraph.historyItemRefColor", chartsBlue, localize("scmGraphHistoryItemRefColor", "History item reference color."));
const historyItemRemoteRefColor = registerColor("scmGraph.historyItemRemoteRefColor", chartsPurple, localize("scmGraphHistoryItemRemoteRefColor", "History item remote reference color."));
const historyItemBaseRefColor = registerColor("scmGraph.historyItemBaseRefColor", "#EA5C00", localize("scmGraphHistoryItemBaseRefColor", "History item base reference color."));
const historyItemHoverDefaultLabelForeground = registerColor("scmGraph.historyItemHoverDefaultLabelForeground", foreground, localize("scmGraphHistoryItemHoverDefaultLabelForeground", "History item hover default label foreground color."));
const historyItemHoverDefaultLabelBackground = registerColor("scmGraph.historyItemHoverDefaultLabelBackground", badgeBackground, localize("scmGraphHistoryItemHoverDefaultLabelBackground", "History item hover default label background color."));
const historyItemHoverLabelForeground = registerColor("scmGraph.historyItemHoverLabelForeground", PANEL_BACKGROUND, localize("scmGraphHistoryItemHoverLabelForeground", "History item hover label foreground color."));
const historyItemHoverAdditionsForeground = registerColor("scmGraph.historyItemHoverAdditionsForeground", { light: "#587C0C", dark: "#81B88B", hcDark: "#A1E3AD", hcLight: "#374E06" }, localize("scmGraph.HistoryItemHoverAdditionsForeground", "History item hover additions foreground color."));
const historyItemHoverDeletionsForeground = registerColor("scmGraph.historyItemHoverDeletionsForeground", { light: "#AD0707", dark: "#C74E39", hcDark: "#C74E39", hcLight: "#AD0707" }, localize("scmGraph.HistoryItemHoverDeletionsForeground", "History item hover deletions foreground color."));
const colorRegistry = [
  registerColor("scmGraph.foreground1", "#FFB000", localize("scmGraphForeground1", "Source control graph foreground color (1).")),
  registerColor("scmGraph.foreground2", "#DC267F", localize("scmGraphForeground2", "Source control graph foreground color (2).")),
  registerColor("scmGraph.foreground3", "#994F00", localize("scmGraphForeground3", "Source control graph foreground color (3).")),
  registerColor("scmGraph.foreground4", "#40B0A6", localize("scmGraphForeground4", "Source control graph foreground color (4).")),
  registerColor("scmGraph.foreground5", "#B66DFF", localize("scmGraphForeground5", "Source control graph foreground color (5)."))
];
function getLabelColorIdentifier(historyItem, colorMap) {
  if (historyItem.id === SCMIncomingHistoryItemId) {
    return historyItemRemoteRefColor;
  } else if (historyItem.id === SCMOutgoingHistoryItemId) {
    return historyItemRefColor;
  } else {
    for (const ref of historyItem.references ?? []) {
      const colorIdentifier = colorMap.get(ref.id);
      if (colorIdentifier !== void 0) {
        return colorIdentifier;
      }
    }
  }
  return void 0;
}
function createPath(colorIdentifier, strokeWidth = 1) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke-width", `${strokeWidth}px`);
  path.setAttribute("stroke-linecap", "round");
  path.style.stroke = asCssVariable(colorIdentifier);
  return path;
}
function drawCircle(index, radius, strokeWidth, colorIdentifier) {
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", `${SWIMLANE_WIDTH * (index + 1)}`);
  circle.setAttribute("cy", `${SWIMLANE_WIDTH}`);
  circle.setAttribute("r", `${radius}`);
  circle.style.strokeWidth = `${strokeWidth}px`;
  if (colorIdentifier) {
    circle.style.fill = asCssVariable(colorIdentifier);
  }
  return circle;
}
function drawDashedCircle(index, radius, strokeWidth, colorIdentifier) {
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", `${SWIMLANE_WIDTH * (index + 1)}`);
  circle.setAttribute("cy", `${SWIMLANE_WIDTH}`);
  circle.setAttribute("r", `${CIRCLE_RADIUS + 1}`);
  circle.style.stroke = asCssVariable(colorIdentifier);
  circle.style.strokeWidth = `${strokeWidth}px`;
  circle.style.strokeDasharray = "4,2";
  return circle;
}
function drawVerticalLine(x1, y1, y2, color, strokeWidth = 1) {
  const path = createPath(color, strokeWidth);
  path.setAttribute("d", `M ${x1} ${y1} V ${y2}`);
  return path;
}
function findLastIndex(nodes, id) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i].id === id) {
      return i;
    }
  }
  return -1;
}
function renderSCMHistoryItemGraph(historyItemViewModel) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("graph");
  const historyItem = historyItemViewModel.historyItem;
  const inputSwimlanes = historyItemViewModel.inputSwimlanes;
  const outputSwimlanes = historyItemViewModel.outputSwimlanes;
  const inputIndex = inputSwimlanes.findIndex((node) => node.id === historyItem.id);
  const circleIndex = inputIndex !== -1 ? inputIndex : inputSwimlanes.length;
  const circleColor = circleIndex < outputSwimlanes.length ? outputSwimlanes[circleIndex].color : circleIndex < inputSwimlanes.length ? inputSwimlanes[circleIndex].color : historyItemRefColor;
  let outputSwimlaneIndex = 0;
  for (let index = 0; index < inputSwimlanes.length; index++) {
    const color = inputSwimlanes[index].color;
    if (inputSwimlanes[index].id === historyItem.id) {
      if (index !== circleIndex) {
        const d = [];
        const path = createPath(color);
        d.push(`M ${SWIMLANE_WIDTH * (index + 1)} 0`);
        d.push(`A ${SWIMLANE_WIDTH} ${SWIMLANE_WIDTH} 0 0 1 ${SWIMLANE_WIDTH * index} ${SWIMLANE_WIDTH}`);
        d.push(`H ${SWIMLANE_WIDTH * (circleIndex + 1)}`);
        path.setAttribute("d", d.join(" "));
        svg.append(path);
      } else {
        outputSwimlaneIndex++;
      }
    } else {
      if (outputSwimlaneIndex < outputSwimlanes.length && inputSwimlanes[index].id === outputSwimlanes[outputSwimlaneIndex].id) {
        if (index === outputSwimlaneIndex) {
          const path = drawVerticalLine(SWIMLANE_WIDTH * (index + 1), 0, SWIMLANE_HEIGHT, color);
          svg.append(path);
        } else {
          const d = [];
          const path = createPath(color);
          d.push(`M ${SWIMLANE_WIDTH * (index + 1)} 0`);
          d.push(`V 6`);
          d.push(`A ${SWIMLANE_CURVE_RADIUS} ${SWIMLANE_CURVE_RADIUS} 0 0 1 ${SWIMLANE_WIDTH * (index + 1) - SWIMLANE_CURVE_RADIUS} ${SWIMLANE_HEIGHT / 2}`);
          d.push(`H ${SWIMLANE_WIDTH * (outputSwimlaneIndex + 1) + SWIMLANE_CURVE_RADIUS}`);
          d.push(`A ${SWIMLANE_CURVE_RADIUS} ${SWIMLANE_CURVE_RADIUS} 0 0 0 ${SWIMLANE_WIDTH * (outputSwimlaneIndex + 1)} ${SWIMLANE_HEIGHT / 2 + SWIMLANE_CURVE_RADIUS}`);
          d.push(`V ${SWIMLANE_HEIGHT}`);
          path.setAttribute("d", d.join(" "));
          svg.append(path);
        }
        outputSwimlaneIndex++;
      }
    }
  }
  for (let i = 1; i < historyItem.parentIds.length; i++) {
    const parentOutputIndex = findLastIndex(outputSwimlanes, historyItem.parentIds[i]);
    if (parentOutputIndex === -1) {
      continue;
    }
    const d = [];
    const path = createPath(outputSwimlanes[parentOutputIndex].color);
    d.push(`M ${SWIMLANE_WIDTH * parentOutputIndex} ${SWIMLANE_HEIGHT / 2}`);
    d.push(`A ${SWIMLANE_WIDTH} ${SWIMLANE_WIDTH} 0 0 1 ${SWIMLANE_WIDTH * (parentOutputIndex + 1)} ${SWIMLANE_HEIGHT}`);
    d.push(`M ${SWIMLANE_WIDTH * parentOutputIndex} ${SWIMLANE_HEIGHT / 2}`);
    d.push(`H ${SWIMLANE_WIDTH * (circleIndex + 1)} `);
    path.setAttribute("d", d.join(" "));
    svg.append(path);
  }
  if (inputIndex !== -1) {
    const path = drawVerticalLine(SWIMLANE_WIDTH * (circleIndex + 1), 0, SWIMLANE_HEIGHT / 2, inputSwimlanes[inputIndex].color);
    svg.append(path);
  }
  if (historyItem.parentIds.length > 0) {
    const path = drawVerticalLine(SWIMLANE_WIDTH * (circleIndex + 1), SWIMLANE_HEIGHT / 2, SWIMLANE_HEIGHT, circleColor);
    svg.append(path);
  }
  if (historyItemViewModel.kind === "HEAD") {
    const outerCircle = drawCircle(circleIndex, CIRCLE_RADIUS + 3, CIRCLE_STROKE_WIDTH, circleColor);
    svg.append(outerCircle);
    const innerCircle = drawCircle(circleIndex, CIRCLE_STROKE_WIDTH, CIRCLE_RADIUS);
    svg.append(innerCircle);
  } else if (historyItemViewModel.kind === "incoming-changes" || historyItemViewModel.kind === "outgoing-changes") {
    const outerCircle = drawCircle(circleIndex, CIRCLE_RADIUS + 3, CIRCLE_STROKE_WIDTH, circleColor);
    svg.append(outerCircle);
    const innerCircle = drawCircle(circleIndex, CIRCLE_RADIUS + 1, CIRCLE_STROKE_WIDTH + 1);
    svg.append(innerCircle);
    const dashedCircle = drawDashedCircle(circleIndex, CIRCLE_RADIUS + 1, CIRCLE_STROKE_WIDTH - 1, circleColor);
    svg.append(dashedCircle);
  } else {
    if (historyItem.parentIds.length > 1) {
      const circleOuter = drawCircle(circleIndex, CIRCLE_RADIUS + 2, CIRCLE_STROKE_WIDTH, circleColor);
      svg.append(circleOuter);
      const circleInner = drawCircle(circleIndex, CIRCLE_RADIUS - 1, CIRCLE_STROKE_WIDTH, circleColor);
      svg.append(circleInner);
    } else {
      const circle = drawCircle(circleIndex, CIRCLE_RADIUS + 1, CIRCLE_STROKE_WIDTH, circleColor);
      svg.append(circle);
    }
  }
  svg.style.height = `${SWIMLANE_HEIGHT}px`;
  svg.style.width = `${SWIMLANE_WIDTH * (Math.max(inputSwimlanes.length, outputSwimlanes.length, 1) + 1)}px`;
  return svg;
}
function renderSCMHistoryGraphPlaceholder(columns, highlightIndex) {
  const elements = svgElem("svg", {
    style: { height: `${SWIMLANE_HEIGHT}px`, width: `${SWIMLANE_WIDTH * (columns.length + 1)}px` }
  });
  for (let index = 0; index < columns.length; index++) {
    const strokeWidth = index === highlightIndex ? 3 : 1;
    const path = drawVerticalLine(SWIMLANE_WIDTH * (index + 1), 0, SWIMLANE_HEIGHT, columns[index].color, strokeWidth);
    elements.root.append(path);
  }
  return elements.root;
}
function toISCMHistoryItemViewModelArray(historyItems, colorMap = /* @__PURE__ */ new Map(), currentHistoryItemRef, currentHistoryItemRemoteRef, currentHistoryItemBaseRef, addIncomingChanges, addOutgoingChanges, mergeBase) {
  let colorIndex = -1;
  const viewModels = [];
  for (let index = 0; index < historyItems.length; index++) {
    const historyItem = historyItems[index];
    const kind = historyItem.id === currentHistoryItemRef?.revision ? "HEAD" : "node";
    const outputSwimlanesFromPreviousItem = viewModels.at(-1)?.outputSwimlanes ?? [];
    const inputSwimlanes = outputSwimlanesFromPreviousItem.map((i) => deepClone(i));
    const outputSwimlanes = [];
    let firstParentAdded = false;
    if (historyItem.parentIds.length > 0) {
      for (const node of inputSwimlanes) {
        if (node.id === historyItem.id) {
          if (!firstParentAdded) {
            outputSwimlanes.push({
              id: historyItem.parentIds[0],
              color: getLabelColorIdentifier(historyItem, colorMap) ?? node.color
            });
            firstParentAdded = true;
          }
          continue;
        }
        outputSwimlanes.push(deepClone(node));
      }
    }
    for (let i = firstParentAdded ? 1 : 0; i < historyItem.parentIds.length; i++) {
      let colorIdentifier;
      if (i === 0) {
        colorIdentifier = getLabelColorIdentifier(historyItem, colorMap);
      } else {
        const historyItemParent = historyItems.find((h) => h.id === historyItem.parentIds[i]);
        colorIdentifier = historyItemParent ? getLabelColorIdentifier(historyItemParent, colorMap) : void 0;
      }
      if (!colorIdentifier) {
        colorIndex = rot(colorIndex + 1, colorRegistry.length);
        colorIdentifier = colorRegistry[colorIndex];
      }
      outputSwimlanes.push({
        id: historyItem.parentIds[i],
        color: colorIdentifier
      });
    }
    const references = (historyItem.references ?? []).map((ref) => {
      let color = colorMap.get(ref.id);
      if (colorMap.has(ref.id) && color === void 0) {
        const inputIndex = inputSwimlanes.findIndex((node) => node.id === historyItem.id);
        const circleIndex = inputIndex !== -1 ? inputIndex : inputSwimlanes.length;
        color = circleIndex < outputSwimlanes.length ? outputSwimlanes[circleIndex].color : circleIndex < inputSwimlanes.length ? inputSwimlanes[circleIndex].color : historyItemRefColor;
      }
      return { ...ref, color };
    });
    references.sort((ref1, ref2) => compareHistoryItemRefs(ref1, ref2, currentHistoryItemRef, currentHistoryItemRemoteRef, currentHistoryItemBaseRef));
    viewModels.push({
      historyItem: {
        ...historyItem,
        references
      },
      kind,
      inputSwimlanes,
      outputSwimlanes
    });
  }
  addIncomingOutgoingChangesHistoryItems(
    viewModels,
    currentHistoryItemRef,
    currentHistoryItemRemoteRef,
    addIncomingChanges,
    addOutgoingChanges,
    mergeBase
  );
  return viewModels;
}
function getHistoryItemIndex(historyItemViewModel) {
  const historyItem = historyItemViewModel.historyItem;
  const inputSwimlanes = historyItemViewModel.inputSwimlanes;
  const inputIndex = inputSwimlanes.findIndex((node) => node.id === historyItem.id);
  return inputIndex !== -1 ? inputIndex : inputSwimlanes.length;
}
function addIncomingOutgoingChangesHistoryItems(viewModels, currentHistoryItemRef, currentHistoryItemRemoteRef, addIncomingChanges, addOutgoingChanges, mergeBase) {
  if (currentHistoryItemRef?.revision !== currentHistoryItemRemoteRef?.revision && mergeBase) {
    if (addIncomingChanges && currentHistoryItemRemoteRef && currentHistoryItemRemoteRef.revision !== mergeBase) {
      const beforeHistoryItemIndex = findLastIdx(viewModels, (vm) => vm.outputSwimlanes.some((node) => node.id === mergeBase));
      const afterHistoryItemIndex = viewModels.findIndex((vm) => vm.historyItem.id === mergeBase);
      if (beforeHistoryItemIndex !== -1 && afterHistoryItemIndex !== -1) {
        const incomingChangeMerged = viewModels[beforeHistoryItemIndex].historyItem.parentIds.length === 2 && viewModels[beforeHistoryItemIndex].historyItem.parentIds.includes(mergeBase);
        if (!incomingChangeMerged) {
          viewModels[beforeHistoryItemIndex] = {
            ...viewModels[beforeHistoryItemIndex],
            inputSwimlanes: viewModels[beforeHistoryItemIndex].inputSwimlanes.map((node) => {
              return node.id === mergeBase && node.color === historyItemRemoteRefColor ? { ...node, id: SCMIncomingHistoryItemId } : node;
            }),
            outputSwimlanes: viewModels[beforeHistoryItemIndex].outputSwimlanes.map((node) => {
              return node.id === mergeBase && node.color === historyItemRemoteRefColor ? { ...node, id: SCMIncomingHistoryItemId } : node;
            })
          };
          const inputSwimlanes = viewModels[beforeHistoryItemIndex].outputSwimlanes.map((i) => deepClone(i));
          const outputSwimlanes = viewModels[afterHistoryItemIndex].inputSwimlanes.map((i) => deepClone(i));
          const displayIdLength = viewModels[0].historyItem.displayId?.length ?? 0;
          const incomingChangesHistoryItem = {
            id: SCMIncomingHistoryItemId,
            displayId: "0".repeat(displayIdLength),
            parentIds: [mergeBase],
            author: currentHistoryItemRemoteRef?.name,
            subject: localize("incomingChanges", "Incoming Changes"),
            message: ""
          };
          viewModels.splice(afterHistoryItemIndex, 0, {
            historyItem: incomingChangesHistoryItem,
            kind: "incoming-changes",
            inputSwimlanes,
            outputSwimlanes
          });
        }
      }
    }
    if (addOutgoingChanges && currentHistoryItemRef?.revision && currentHistoryItemRef.revision !== mergeBase) {
      const currentHistoryItemRefIndex = viewModels.findIndex((vm) => vm.kind === "HEAD" && vm.historyItem.id === currentHistoryItemRef.revision);
      if (currentHistoryItemRefIndex !== -1) {
        const outgoingChangesHistoryItem = {
          id: SCMOutgoingHistoryItemId,
          displayId: viewModels[0].historyItem.displayId ? "0".repeat(viewModels[0].historyItem.displayId.length) : void 0,
          parentIds: [currentHistoryItemRef.revision],
          author: currentHistoryItemRef?.name,
          subject: localize("outgoingChanges", "Outgoing Changes"),
          message: ""
        };
        const inputSwimlanes = viewModels[currentHistoryItemRefIndex].inputSwimlanes.slice(0);
        const outputSwimlanes = inputSwimlanes.slice(0).concat({
          id: currentHistoryItemRef.revision,
          color: historyItemRefColor
        });
        viewModels.splice(currentHistoryItemRefIndex, 0, {
          historyItem: outgoingChangesHistoryItem,
          kind: "outgoing-changes",
          inputSwimlanes,
          outputSwimlanes
        });
        viewModels[currentHistoryItemRefIndex + 1].inputSwimlanes.push({
          id: currentHistoryItemRef.revision,
          color: historyItemRefColor
        });
      }
    }
  }
}
function compareHistoryItemRefs(ref1, ref2, currentHistoryItemRef, currentHistoryItemRemoteRef, currentHistoryItemBaseRef) {
  const getHistoryItemRefOrder = (ref) => {
    if (ref.id === currentHistoryItemRef?.id) {
      return 1;
    } else if (ref.id === currentHistoryItemRemoteRef?.id) {
      return 2;
    } else if (ref.id === currentHistoryItemBaseRef?.id) {
      return 3;
    } else if (ref.color !== void 0) {
      return 4;
    }
    return 99;
  };
  const ref1Order = getHistoryItemRefOrder(ref1);
  const ref2Order = getHistoryItemRefOrder(ref2);
  return ref1Order - ref2Order;
}
function toHistoryItemHoverContent(markdownRendererService, historyItem, includeReferences) {
  const disposables = new DisposableStore();
  if (historyItem.tooltip === void 0) {
    return { content: historyItem.message, disposables };
  }
  if (isMarkdownString(historyItem.tooltip)) {
    return { content: historyItem.tooltip, disposables };
  }
  const tooltipSections = historyItem.tooltip.slice();
  if (includeReferences && historyItem.references?.length) {
    const markdownString = new MarkdownString("", { supportHtml: true, supportThemeIcons: true });
    for (const reference of historyItem.references) {
      const labelIconId = ThemeIcon.isThemeIcon(reference.icon) ? reference.icon.id : "";
      const labelBackgroundColor = reference.color ? asCssVariable(reference.color) : asCssVariable(historyItemHoverDefaultLabelBackground);
      const labelForegroundColor = reference.color ? asCssVariable(historyItemHoverLabelForeground) : asCssVariable(historyItemHoverDefaultLabelForeground);
      markdownString.appendMarkdown(`<span style="color:${labelForegroundColor};background-color:${labelBackgroundColor};border-radius:10px;">&nbsp;$(${labelIconId})&nbsp;`);
      markdownString.appendText(reference.name);
      markdownString.appendMarkdown("&nbsp;&nbsp;</span>");
    }
    markdownString.appendMarkdown(`

---

`);
    tooltipSections.splice(tooltipSections.length - 1, 0, markdownString);
  }
  const hoverContainer = $(".history-item-hover-container");
  for (const markdownString of tooltipSections) {
    if (isEmptyMarkdownString(markdownString)) {
      continue;
    }
    const renderedContent = markdownRendererService.render(markdownString);
    hoverContainer.appendChild(renderedContent.element);
    disposables.add(renderedContent);
  }
  return { content: hoverContainer, disposables };
}
export {
  SWIMLANE_HEIGHT,
  SWIMLANE_WIDTH,
  colorRegistry,
  compareHistoryItemRefs,
  getHistoryItemIndex,
  historyItemBaseRefColor,
  historyItemHoverAdditionsForeground,
  historyItemHoverDefaultLabelBackground,
  historyItemHoverDefaultLabelForeground,
  historyItemHoverDeletionsForeground,
  historyItemHoverLabelForeground,
  historyItemRefColor,
  historyItemRemoteRefColor,
  renderSCMHistoryGraphPlaceholder,
  renderSCMHistoryItemGraph,
  toHistoryItemHoverContent,
  toISCMHistoryItemViewModelArray
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNjbVxcYnJvd3Nlclxcc2NtSGlzdG9yeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGRlZXBDbG9uZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgYmFkZ2VCYWNrZ3JvdW5kLCBjaGFydHNCbHVlLCBjaGFydHNQdXJwbGUsIGZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlLCBDb2xvcklkZW50aWZpZXIsIHJlZ2lzdGVyQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JVdGlscy5qcyc7XG5pbXBvcnQgeyBJU0NNSGlzdG9yeUl0ZW0sIElTQ01IaXN0b3J5SXRlbUdyYXBoTm9kZSwgSVNDTUhpc3RvcnlJdGVtUmVmLCBJU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWwsIFNDTUluY29taW5nSGlzdG9yeUl0ZW1JZCwgU0NNT3V0Z29pbmdIaXN0b3J5SXRlbUlkIH0gZnJvbSAnLi4vY29tbW9uL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgcm90IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbnVtYmVycy5qcyc7XG5pbXBvcnQgeyAkLCBzdmdFbGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBQQU5FTF9CQUNLR1JPVU5EIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBpc0VtcHR5TWFya2Rvd25TdHJpbmcsIGlzTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBmaW5kTGFzdElkeCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5c0ZpbmQuanMnO1xuXG5leHBvcnQgY29uc3QgU1dJTUxBTkVfSEVJR0hUID0gMjI7XG5leHBvcnQgY29uc3QgU1dJTUxBTkVfV0lEVEggPSAxMTtcbmNvbnN0IFNXSU1MQU5FX0NVUlZFX1JBRElVUyA9IDU7XG5jb25zdCBDSVJDTEVfUkFESVVTID0gNDtcbmNvbnN0IENJUkNMRV9TVFJPS0VfV0lEVEggPSAyO1xuXG4vKipcbiAqIEhpc3RvcnkgaXRlbSByZWZlcmVuY2UgY29sb3JzIChsb2NhbCwgcmVtb3RlLCBiYXNlKVxuICovXG5leHBvcnQgY29uc3QgaGlzdG9yeUl0ZW1SZWZDb2xvciA9IHJlZ2lzdGVyQ29sb3IoJ3NjbUdyYXBoLmhpc3RvcnlJdGVtUmVmQ29sb3InLCBjaGFydHNCbHVlLCBsb2NhbGl6ZSgnc2NtR3JhcGhIaXN0b3J5SXRlbVJlZkNvbG9yJywgXCJIaXN0b3J5IGl0ZW0gcmVmZXJlbmNlIGNvbG9yLlwiKSk7XG5leHBvcnQgY29uc3QgaGlzdG9yeUl0ZW1SZW1vdGVSZWZDb2xvciA9IHJlZ2lzdGVyQ29sb3IoJ3NjbUdyYXBoLmhpc3RvcnlJdGVtUmVtb3RlUmVmQ29sb3InLCBjaGFydHNQdXJwbGUsIGxvY2FsaXplKCdzY21HcmFwaEhpc3RvcnlJdGVtUmVtb3RlUmVmQ29sb3InLCBcIkhpc3RvcnkgaXRlbSByZW1vdGUgcmVmZXJlbmNlIGNvbG9yLlwiKSk7XG5leHBvcnQgY29uc3QgaGlzdG9yeUl0ZW1CYXNlUmVmQ29sb3IgPSByZWdpc3RlckNvbG9yKCdzY21HcmFwaC5oaXN0b3J5SXRlbUJhc2VSZWZDb2xvcicsICcjRUE1QzAwJywgbG9jYWxpemUoJ3NjbUdyYXBoSGlzdG9yeUl0ZW1CYXNlUmVmQ29sb3InLCBcIkhpc3RvcnkgaXRlbSBiYXNlIHJlZmVyZW5jZSBjb2xvci5cIikpO1xuXG4vKipcbiAqIEhpc3RvcnkgaXRlbSBob3ZlciBjb2xvclxuICovXG5leHBvcnQgY29uc3QgaGlzdG9yeUl0ZW1Ib3ZlckRlZmF1bHRMYWJlbEZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdzY21HcmFwaC5oaXN0b3J5SXRlbUhvdmVyRGVmYXVsdExhYmVsRm9yZWdyb3VuZCcsIGZvcmVncm91bmQsIGxvY2FsaXplKCdzY21HcmFwaEhpc3RvcnlJdGVtSG92ZXJEZWZhdWx0TGFiZWxGb3JlZ3JvdW5kJywgXCJIaXN0b3J5IGl0ZW0gaG92ZXIgZGVmYXVsdCBsYWJlbCBmb3JlZ3JvdW5kIGNvbG9yLlwiKSk7XG5leHBvcnQgY29uc3QgaGlzdG9yeUl0ZW1Ib3ZlckRlZmF1bHRMYWJlbEJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdzY21HcmFwaC5oaXN0b3J5SXRlbUhvdmVyRGVmYXVsdExhYmVsQmFja2dyb3VuZCcsIGJhZGdlQmFja2dyb3VuZCwgbG9jYWxpemUoJ3NjbUdyYXBoSGlzdG9yeUl0ZW1Ib3ZlckRlZmF1bHRMYWJlbEJhY2tncm91bmQnLCBcIkhpc3RvcnkgaXRlbSBob3ZlciBkZWZhdWx0IGxhYmVsIGJhY2tncm91bmQgY29sb3IuXCIpKTtcbmV4cG9ydCBjb25zdCBoaXN0b3J5SXRlbUhvdmVyTGFiZWxGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignc2NtR3JhcGguaGlzdG9yeUl0ZW1Ib3ZlckxhYmVsRm9yZWdyb3VuZCcsIFBBTkVMX0JBQ0tHUk9VTkQsIGxvY2FsaXplKCdzY21HcmFwaEhpc3RvcnlJdGVtSG92ZXJMYWJlbEZvcmVncm91bmQnLCBcIkhpc3RvcnkgaXRlbSBob3ZlciBsYWJlbCBmb3JlZ3JvdW5kIGNvbG9yLlwiKSk7XG5leHBvcnQgY29uc3QgaGlzdG9yeUl0ZW1Ib3ZlckFkZGl0aW9uc0ZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdzY21HcmFwaC5oaXN0b3J5SXRlbUhvdmVyQWRkaXRpb25zRm9yZWdyb3VuZCcsIHsgbGlnaHQ6ICcjNTg3QzBDJywgZGFyazogJyM4MUI4OEInLCBoY0Rhcms6ICcjQTFFM0FEJywgaGNMaWdodDogJyMzNzRFMDYnIH0sIGxvY2FsaXplKCdzY21HcmFwaC5IaXN0b3J5SXRlbUhvdmVyQWRkaXRpb25zRm9yZWdyb3VuZCcsIFwiSGlzdG9yeSBpdGVtIGhvdmVyIGFkZGl0aW9ucyBmb3JlZ3JvdW5kIGNvbG9yLlwiKSk7XG5leHBvcnQgY29uc3QgaGlzdG9yeUl0ZW1Ib3ZlckRlbGV0aW9uc0ZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdzY21HcmFwaC5oaXN0b3J5SXRlbUhvdmVyRGVsZXRpb25zRm9yZWdyb3VuZCcsIHsgbGlnaHQ6ICcjQUQwNzA3JywgZGFyazogJyNDNzRFMzknLCBoY0Rhcms6ICcjQzc0RTM5JywgaGNMaWdodDogJyNBRDA3MDcnIH0sIGxvY2FsaXplKCdzY21HcmFwaC5IaXN0b3J5SXRlbUhvdmVyRGVsZXRpb25zRm9yZWdyb3VuZCcsIFwiSGlzdG9yeSBpdGVtIGhvdmVyIGRlbGV0aW9ucyBmb3JlZ3JvdW5kIGNvbG9yLlwiKSk7XG5cbi8qKlxuICogSGlzdG9yeSBncmFwaCBjb2xvciByZWdpc3RyeVxuICovXG5leHBvcnQgY29uc3QgY29sb3JSZWdpc3RyeTogQ29sb3JJZGVudGlmaWVyW10gPSBbXG5cdHJlZ2lzdGVyQ29sb3IoJ3NjbUdyYXBoLmZvcmVncm91bmQxJywgJyNGRkIwMDAnLCBsb2NhbGl6ZSgnc2NtR3JhcGhGb3JlZ3JvdW5kMScsIFwiU291cmNlIGNvbnRyb2wgZ3JhcGggZm9yZWdyb3VuZCBjb2xvciAoMSkuXCIpKSxcblx0cmVnaXN0ZXJDb2xvcignc2NtR3JhcGguZm9yZWdyb3VuZDInLCAnI0RDMjY3RicsIGxvY2FsaXplKCdzY21HcmFwaEZvcmVncm91bmQyJywgXCJTb3VyY2UgY29udHJvbCBncmFwaCBmb3JlZ3JvdW5kIGNvbG9yICgyKS5cIikpLFxuXHRyZWdpc3RlckNvbG9yKCdzY21HcmFwaC5mb3JlZ3JvdW5kMycsICcjOTk0RjAwJywgbG9jYWxpemUoJ3NjbUdyYXBoRm9yZWdyb3VuZDMnLCBcIlNvdXJjZSBjb250cm9sIGdyYXBoIGZvcmVncm91bmQgY29sb3IgKDMpLlwiKSksXG5cdHJlZ2lzdGVyQ29sb3IoJ3NjbUdyYXBoLmZvcmVncm91bmQ0JywgJyM0MEIwQTYnLCBsb2NhbGl6ZSgnc2NtR3JhcGhGb3JlZ3JvdW5kNCcsIFwiU291cmNlIGNvbnRyb2wgZ3JhcGggZm9yZWdyb3VuZCBjb2xvciAoNCkuXCIpKSxcblx0cmVnaXN0ZXJDb2xvcignc2NtR3JhcGguZm9yZWdyb3VuZDUnLCAnI0I2NkRGRicsIGxvY2FsaXplKCdzY21HcmFwaEZvcmVncm91bmQ1JywgXCJTb3VyY2UgY29udHJvbCBncmFwaCBmb3JlZ3JvdW5kIGNvbG9yICg1KS5cIikpLFxuXTtcblxuZnVuY3Rpb24gZ2V0TGFiZWxDb2xvcklkZW50aWZpZXIoaGlzdG9yeUl0ZW06IElTQ01IaXN0b3J5SXRlbSwgY29sb3JNYXA6IE1hcDxzdHJpbmcsIENvbG9ySWRlbnRpZmllciB8IHVuZGVmaW5lZD4pOiBDb2xvcklkZW50aWZpZXIgfCB1bmRlZmluZWQge1xuXHRpZiAoaGlzdG9yeUl0ZW0uaWQgPT09IFNDTUluY29taW5nSGlzdG9yeUl0ZW1JZCkge1xuXHRcdHJldHVybiBoaXN0b3J5SXRlbVJlbW90ZVJlZkNvbG9yO1xuXHR9IGVsc2UgaWYgKGhpc3RvcnlJdGVtLmlkID09PSBTQ01PdXRnb2luZ0hpc3RvcnlJdGVtSWQpIHtcblx0XHRyZXR1cm4gaGlzdG9yeUl0ZW1SZWZDb2xvcjtcblx0fSBlbHNlIHtcblx0XHRmb3IgKGNvbnN0IHJlZiBvZiBoaXN0b3J5SXRlbS5yZWZlcmVuY2VzID8/IFtdKSB7XG5cdFx0XHRjb25zdCBjb2xvcklkZW50aWZpZXIgPSBjb2xvck1hcC5nZXQocmVmLmlkKTtcblx0XHRcdGlmIChjb2xvcklkZW50aWZpZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gY29sb3JJZGVudGlmaWVyO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVBhdGgoY29sb3JJZGVudGlmaWVyOiBzdHJpbmcsIHN0cm9rZVdpZHRoID0gMSk6IFNWR1BhdGhFbGVtZW50IHtcblx0Y29uc3QgcGF0aCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAncGF0aCcpO1xuXHRwYXRoLnNldEF0dHJpYnV0ZSgnZmlsbCcsICdub25lJyk7XG5cdHBhdGguc2V0QXR0cmlidXRlKCdzdHJva2Utd2lkdGgnLCBgJHtzdHJva2VXaWR0aH1weGApO1xuXHRwYXRoLnNldEF0dHJpYnV0ZSgnc3Ryb2tlLWxpbmVjYXAnLCAncm91bmQnKTtcblx0cGF0aC5zdHlsZS5zdHJva2UgPSBhc0Nzc1ZhcmlhYmxlKGNvbG9ySWRlbnRpZmllcik7XG5cblx0cmV0dXJuIHBhdGg7XG59XG5cbmZ1bmN0aW9uIGRyYXdDaXJjbGUoaW5kZXg6IG51bWJlciwgcmFkaXVzOiBudW1iZXIsIHN0cm9rZVdpZHRoOiBudW1iZXIsIGNvbG9ySWRlbnRpZmllcj86IHN0cmluZyk6IFNWR0NpcmNsZUVsZW1lbnQge1xuXHRjb25zdCBjaXJjbGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJywgJ2NpcmNsZScpO1xuXHRjaXJjbGUuc2V0QXR0cmlidXRlKCdjeCcsIGAke1NXSU1MQU5FX1dJRFRIICogKGluZGV4ICsgMSl9YCk7XG5cdGNpcmNsZS5zZXRBdHRyaWJ1dGUoJ2N5JywgYCR7U1dJTUxBTkVfV0lEVEh9YCk7XG5cdGNpcmNsZS5zZXRBdHRyaWJ1dGUoJ3InLCBgJHtyYWRpdXN9YCk7XG5cblx0Y2lyY2xlLnN0eWxlLnN0cm9rZVdpZHRoID0gYCR7c3Ryb2tlV2lkdGh9cHhgO1xuXHRpZiAoY29sb3JJZGVudGlmaWVyKSB7XG5cdFx0Y2lyY2xlLnN0eWxlLmZpbGwgPSBhc0Nzc1ZhcmlhYmxlKGNvbG9ySWRlbnRpZmllcik7XG5cdH1cblxuXHRyZXR1cm4gY2lyY2xlO1xufVxuXG5mdW5jdGlvbiBkcmF3RGFzaGVkQ2lyY2xlKGluZGV4OiBudW1iZXIsIHJhZGl1czogbnVtYmVyLCBzdHJva2VXaWR0aDogbnVtYmVyLCBjb2xvcklkZW50aWZpZXI6IHN0cmluZyk6IFNWR0NpcmNsZUVsZW1lbnQge1xuXHRjb25zdCBjaXJjbGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJywgJ2NpcmNsZScpO1xuXHRjaXJjbGUuc2V0QXR0cmlidXRlKCdjeCcsIGAke1NXSU1MQU5FX1dJRFRIICogKGluZGV4ICsgMSl9YCk7XG5cdGNpcmNsZS5zZXRBdHRyaWJ1dGUoJ2N5JywgYCR7U1dJTUxBTkVfV0lEVEh9YCk7XG5cdGNpcmNsZS5zZXRBdHRyaWJ1dGUoJ3InLCBgJHtDSVJDTEVfUkFESVVTICsgMX1gKTtcblxuXHRjaXJjbGUuc3R5bGUuc3Ryb2tlID0gYXNDc3NWYXJpYWJsZShjb2xvcklkZW50aWZpZXIpO1xuXHRjaXJjbGUuc3R5bGUuc3Ryb2tlV2lkdGggPSBgJHtzdHJva2VXaWR0aH1weGA7XG5cdGNpcmNsZS5zdHlsZS5zdHJva2VEYXNoYXJyYXkgPSAnNCwyJztcblxuXHRyZXR1cm4gY2lyY2xlO1xufVxuXG5mdW5jdGlvbiBkcmF3VmVydGljYWxMaW5lKHgxOiBudW1iZXIsIHkxOiBudW1iZXIsIHkyOiBudW1iZXIsIGNvbG9yOiBzdHJpbmcsIHN0cm9rZVdpZHRoID0gMSk6IFNWR1BhdGhFbGVtZW50IHtcblx0Y29uc3QgcGF0aCA9IGNyZWF0ZVBhdGgoY29sb3IsIHN0cm9rZVdpZHRoKTtcblx0cGF0aC5zZXRBdHRyaWJ1dGUoJ2QnLCBgTSAke3gxfSAke3kxfSBWICR7eTJ9YCk7XG5cblx0cmV0dXJuIHBhdGg7XG59XG5cbmZ1bmN0aW9uIGZpbmRMYXN0SW5kZXgobm9kZXM6IElTQ01IaXN0b3J5SXRlbUdyYXBoTm9kZVtdLCBpZDogc3RyaW5nKTogbnVtYmVyIHtcblx0Zm9yIChsZXQgaSA9IG5vZGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0aWYgKG5vZGVzW2ldLmlkID09PSBpZCkge1xuXHRcdFx0cmV0dXJuIGk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIC0xO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyU0NNSGlzdG9yeUl0ZW1HcmFwaChoaXN0b3J5SXRlbVZpZXdNb2RlbDogSVNDTUhpc3RvcnlJdGVtVmlld01vZGVsKTogU1ZHRWxlbWVudCB7XG5cdGNvbnN0IHN2ZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAnc3ZnJyk7XG5cdHN2Zy5jbGFzc0xpc3QuYWRkKCdncmFwaCcpO1xuXG5cdGNvbnN0IGhpc3RvcnlJdGVtID0gaGlzdG9yeUl0ZW1WaWV3TW9kZWwuaGlzdG9yeUl0ZW07XG5cdGNvbnN0IGlucHV0U3dpbWxhbmVzID0gaGlzdG9yeUl0ZW1WaWV3TW9kZWwuaW5wdXRTd2ltbGFuZXM7XG5cdGNvbnN0IG91dHB1dFN3aW1sYW5lcyA9IGhpc3RvcnlJdGVtVmlld01vZGVsLm91dHB1dFN3aW1sYW5lcztcblxuXHQvLyBGaW5kIHRoZSBoaXN0b3J5IGl0ZW0gaW4gdGhlIGlucHV0IHN3aW1sYW5lc1xuXHRjb25zdCBpbnB1dEluZGV4ID0gaW5wdXRTd2ltbGFuZXMuZmluZEluZGV4KG5vZGUgPT4gbm9kZS5pZCA9PT0gaGlzdG9yeUl0ZW0uaWQpO1xuXG5cdC8vIENpcmNsZSBpbmRleCAtIHVzZSB0aGUgaW5wdXQgc3dpbWxhbmUgaW5kZXggaWYgcHJlc2VudCwgb3RoZXJ3aXNlIGFkZCBpdCB0byB0aGUgZW5kXG5cdGNvbnN0IGNpcmNsZUluZGV4ID0gaW5wdXRJbmRleCAhPT0gLTEgPyBpbnB1dEluZGV4IDogaW5wdXRTd2ltbGFuZXMubGVuZ3RoO1xuXG5cdC8vIENpcmNsZSBjb2xvciAtIHVzZSB0aGUgb3V0cHV0IHN3aW1sYW5lIGNvbG9yIGlmIHByZXNlbnQsIG90aGVyd2lzZSB0aGUgaW5wdXQgc3dpbWxhbmUgY29sb3Jcblx0Y29uc3QgY2lyY2xlQ29sb3IgPSBjaXJjbGVJbmRleCA8IG91dHB1dFN3aW1sYW5lcy5sZW5ndGggPyBvdXRwdXRTd2ltbGFuZXNbY2lyY2xlSW5kZXhdLmNvbG9yIDpcblx0XHRjaXJjbGVJbmRleCA8IGlucHV0U3dpbWxhbmVzLmxlbmd0aCA/IGlucHV0U3dpbWxhbmVzW2NpcmNsZUluZGV4XS5jb2xvciA6IGhpc3RvcnlJdGVtUmVmQ29sb3I7XG5cblx0bGV0IG91dHB1dFN3aW1sYW5lSW5kZXggPSAwO1xuXHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgaW5wdXRTd2ltbGFuZXMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0Y29uc3QgY29sb3IgPSBpbnB1dFN3aW1sYW5lc1tpbmRleF0uY29sb3I7XG5cblx0XHQvLyBDdXJyZW50IGNvbW1pdFxuXHRcdGlmIChpbnB1dFN3aW1sYW5lc1tpbmRleF0uaWQgPT09IGhpc3RvcnlJdGVtLmlkKSB7XG5cdFx0XHQvLyBCYXNlIGNvbW1pdFxuXHRcdFx0aWYgKGluZGV4ICE9PSBjaXJjbGVJbmRleCkge1xuXHRcdFx0XHRjb25zdCBkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRjb25zdCBwYXRoID0gY3JlYXRlUGF0aChjb2xvcik7XG5cblx0XHRcdFx0Ly8gRHJhdyAvXG5cdFx0XHRcdGQucHVzaChgTSAke1NXSU1MQU5FX1dJRFRIICogKGluZGV4ICsgMSl9IDBgKTtcblx0XHRcdFx0ZC5wdXNoKGBBICR7U1dJTUxBTkVfV0lEVEh9ICR7U1dJTUxBTkVfV0lEVEh9IDAgMCAxICR7U1dJTUxBTkVfV0lEVEggKiAoaW5kZXgpfSAke1NXSU1MQU5FX1dJRFRIfWApO1xuXG5cdFx0XHRcdC8vIERyYXcgLVxuXHRcdFx0XHRkLnB1c2goYEggJHtTV0lNTEFORV9XSURUSCAqIChjaXJjbGVJbmRleCArIDEpfWApO1xuXG5cdFx0XHRcdHBhdGguc2V0QXR0cmlidXRlKCdkJywgZC5qb2luKCcgJykpO1xuXHRcdFx0XHRzdmcuYXBwZW5kKHBhdGgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b3V0cHV0U3dpbWxhbmVJbmRleCsrO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBOb3QgdGhlIGN1cnJlbnQgY29tbWl0XG5cdFx0XHRpZiAob3V0cHV0U3dpbWxhbmVJbmRleCA8IG91dHB1dFN3aW1sYW5lcy5sZW5ndGggJiZcblx0XHRcdFx0aW5wdXRTd2ltbGFuZXNbaW5kZXhdLmlkID09PSBvdXRwdXRTd2ltbGFuZXNbb3V0cHV0U3dpbWxhbmVJbmRleF0uaWQpIHtcblx0XHRcdFx0aWYgKGluZGV4ID09PSBvdXRwdXRTd2ltbGFuZUluZGV4KSB7XG5cdFx0XHRcdFx0Ly8gRHJhdyB8XG5cdFx0XHRcdFx0Y29uc3QgcGF0aCA9IGRyYXdWZXJ0aWNhbExpbmUoU1dJTUxBTkVfV0lEVEggKiAoaW5kZXggKyAxKSwgMCwgU1dJTUxBTkVfSEVJR0hULCBjb2xvcik7XG5cdFx0XHRcdFx0c3ZnLmFwcGVuZChwYXRoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRcdGNvbnN0IHBhdGggPSBjcmVhdGVQYXRoKGNvbG9yKTtcblxuXHRcdFx0XHRcdC8vIERyYXcgfFxuXHRcdFx0XHRcdGQucHVzaChgTSAke1NXSU1MQU5FX1dJRFRIICogKGluZGV4ICsgMSl9IDBgKTtcblx0XHRcdFx0XHRkLnB1c2goYFYgNmApO1xuXG5cdFx0XHRcdFx0Ly8gRHJhdyAvXG5cdFx0XHRcdFx0ZC5wdXNoKGBBICR7U1dJTUxBTkVfQ1VSVkVfUkFESVVTfSAke1NXSU1MQU5FX0NVUlZFX1JBRElVU30gMCAwIDEgJHsoU1dJTUxBTkVfV0lEVEggKiAoaW5kZXggKyAxKSkgLSBTV0lNTEFORV9DVVJWRV9SQURJVVN9ICR7U1dJTUxBTkVfSEVJR0hUIC8gMn1gKTtcblxuXHRcdFx0XHRcdC8vIERyYXcgLVxuXHRcdFx0XHRcdGQucHVzaChgSCAkeyhTV0lNTEFORV9XSURUSCAqIChvdXRwdXRTd2ltbGFuZUluZGV4ICsgMSkpICsgU1dJTUxBTkVfQ1VSVkVfUkFESVVTfWApO1xuXG5cdFx0XHRcdFx0Ly8gRHJhdyAvXG5cdFx0XHRcdFx0ZC5wdXNoKGBBICR7U1dJTUxBTkVfQ1VSVkVfUkFESVVTfSAke1NXSU1MQU5FX0NVUlZFX1JBRElVU30gMCAwIDAgJHtTV0lNTEFORV9XSURUSCAqIChvdXRwdXRTd2ltbGFuZUluZGV4ICsgMSl9ICR7KFNXSU1MQU5FX0hFSUdIVCAvIDIpICsgU1dJTUxBTkVfQ1VSVkVfUkFESVVTfWApO1xuXG5cdFx0XHRcdFx0Ly8gRHJhdyB8XG5cdFx0XHRcdFx0ZC5wdXNoKGBWICR7U1dJTUxBTkVfSEVJR0hUfWApO1xuXG5cdFx0XHRcdFx0cGF0aC5zZXRBdHRyaWJ1dGUoJ2QnLCBkLmpvaW4oJyAnKSk7XG5cdFx0XHRcdFx0c3ZnLmFwcGVuZChwYXRoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG91dHB1dFN3aW1sYW5lSW5kZXgrKztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyBBZGQgcmVtYWluaW5nIHBhcmVudChzKVxuXHRmb3IgKGxldCBpID0gMTsgaSA8IGhpc3RvcnlJdGVtLnBhcmVudElkcy5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IHBhcmVudE91dHB1dEluZGV4ID0gZmluZExhc3RJbmRleChvdXRwdXRTd2ltbGFuZXMsIGhpc3RvcnlJdGVtLnBhcmVudElkc1tpXSk7XG5cdFx0aWYgKHBhcmVudE91dHB1dEluZGV4ID09PSAtMSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Ly8gRHJhdyAtXFxcblx0XHRjb25zdCBkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHBhdGggPSBjcmVhdGVQYXRoKG91dHB1dFN3aW1sYW5lc1twYXJlbnRPdXRwdXRJbmRleF0uY29sb3IpO1xuXG5cdFx0Ly8gRHJhdyBcXFxuXHRcdGQucHVzaChgTSAke1NXSU1MQU5FX1dJRFRIICogcGFyZW50T3V0cHV0SW5kZXh9ICR7U1dJTUxBTkVfSEVJR0hUIC8gMn1gKTtcblx0XHRkLnB1c2goYEEgJHtTV0lNTEFORV9XSURUSH0gJHtTV0lNTEFORV9XSURUSH0gMCAwIDEgJHtTV0lNTEFORV9XSURUSCAqIChwYXJlbnRPdXRwdXRJbmRleCArIDEpfSAke1NXSU1MQU5FX0hFSUdIVH1gKTtcblxuXHRcdC8vIERyYXcgLVxuXHRcdGQucHVzaChgTSAke1NXSU1MQU5FX1dJRFRIICogcGFyZW50T3V0cHV0SW5kZXh9ICR7U1dJTUxBTkVfSEVJR0hUIC8gMn1gKTtcblx0XHRkLnB1c2goYEggJHtTV0lNTEFORV9XSURUSCAqIChjaXJjbGVJbmRleCArIDEpfSBgKTtcblxuXHRcdHBhdGguc2V0QXR0cmlidXRlKCdkJywgZC5qb2luKCcgJykpO1xuXHRcdHN2Zy5hcHBlbmQocGF0aCk7XG5cdH1cblxuXHQvLyBEcmF3IHwgdG8gKlxuXHRpZiAoaW5wdXRJbmRleCAhPT0gLTEpIHtcblx0XHRjb25zdCBwYXRoID0gZHJhd1ZlcnRpY2FsTGluZShTV0lNTEFORV9XSURUSCAqIChjaXJjbGVJbmRleCArIDEpLCAwLCBTV0lNTEFORV9IRUlHSFQgLyAyLCBpbnB1dFN3aW1sYW5lc1tpbnB1dEluZGV4XS5jb2xvcik7XG5cdFx0c3ZnLmFwcGVuZChwYXRoKTtcblx0fVxuXG5cdC8vIERyYXcgfCBmcm9tICpcblx0aWYgKGhpc3RvcnlJdGVtLnBhcmVudElkcy5sZW5ndGggPiAwKSB7XG5cdFx0Y29uc3QgcGF0aCA9IGRyYXdWZXJ0aWNhbExpbmUoU1dJTUxBTkVfV0lEVEggKiAoY2lyY2xlSW5kZXggKyAxKSwgU1dJTUxBTkVfSEVJR0hUIC8gMiwgU1dJTUxBTkVfSEVJR0hULCBjaXJjbGVDb2xvcik7XG5cdFx0c3ZnLmFwcGVuZChwYXRoKTtcblx0fVxuXG5cdC8vIERyYXcgKlxuXHRpZiAoaGlzdG9yeUl0ZW1WaWV3TW9kZWwua2luZCA9PT0gJ0hFQUQnKSB7XG5cdFx0Ly8gSEVBRFxuXHRcdGNvbnN0IG91dGVyQ2lyY2xlID0gZHJhd0NpcmNsZShjaXJjbGVJbmRleCwgQ0lSQ0xFX1JBRElVUyArIDMsIENJUkNMRV9TVFJPS0VfV0lEVEgsIGNpcmNsZUNvbG9yKTtcblx0XHRzdmcuYXBwZW5kKG91dGVyQ2lyY2xlKTtcblxuXHRcdGNvbnN0IGlubmVyQ2lyY2xlID0gZHJhd0NpcmNsZShjaXJjbGVJbmRleCwgQ0lSQ0xFX1NUUk9LRV9XSURUSCwgQ0lSQ0xFX1JBRElVUyk7XG5cdFx0c3ZnLmFwcGVuZChpbm5lckNpcmNsZSk7XG5cdH0gZWxzZSBpZiAoaGlzdG9yeUl0ZW1WaWV3TW9kZWwua2luZCA9PT0gJ2luY29taW5nLWNoYW5nZXMnIHx8IGhpc3RvcnlJdGVtVmlld01vZGVsLmtpbmQgPT09ICdvdXRnb2luZy1jaGFuZ2VzJykge1xuXHRcdC8vIEluY29taW5nL091dGdvaW5nIGNoYW5nZXNcblx0XHRjb25zdCBvdXRlckNpcmNsZSA9IGRyYXdDaXJjbGUoY2lyY2xlSW5kZXgsIENJUkNMRV9SQURJVVMgKyAzLCBDSVJDTEVfU1RST0tFX1dJRFRILCBjaXJjbGVDb2xvcik7XG5cdFx0c3ZnLmFwcGVuZChvdXRlckNpcmNsZSk7XG5cblx0XHRjb25zdCBpbm5lckNpcmNsZSA9IGRyYXdDaXJjbGUoY2lyY2xlSW5kZXgsIENJUkNMRV9SQURJVVMgKyAxLCBDSVJDTEVfU1RST0tFX1dJRFRIICsgMSk7XG5cdFx0c3ZnLmFwcGVuZChpbm5lckNpcmNsZSk7XG5cblx0XHRjb25zdCBkYXNoZWRDaXJjbGUgPSBkcmF3RGFzaGVkQ2lyY2xlKGNpcmNsZUluZGV4LCBDSVJDTEVfUkFESVVTICsgMSwgQ0lSQ0xFX1NUUk9LRV9XSURUSCAtIDEsIGNpcmNsZUNvbG9yKTtcblx0XHRzdmcuYXBwZW5kKGRhc2hlZENpcmNsZSk7XG5cdH0gZWxzZSB7XG5cdFx0aWYgKGhpc3RvcnlJdGVtLnBhcmVudElkcy5sZW5ndGggPiAxKSB7XG5cdFx0XHQvLyBNdWx0aS1wYXJlbnQgbm9kZVxuXHRcdFx0Y29uc3QgY2lyY2xlT3V0ZXIgPSBkcmF3Q2lyY2xlKGNpcmNsZUluZGV4LCBDSVJDTEVfUkFESVVTICsgMiwgQ0lSQ0xFX1NUUk9LRV9XSURUSCwgY2lyY2xlQ29sb3IpO1xuXHRcdFx0c3ZnLmFwcGVuZChjaXJjbGVPdXRlcik7XG5cblx0XHRcdGNvbnN0IGNpcmNsZUlubmVyID0gZHJhd0NpcmNsZShjaXJjbGVJbmRleCwgQ0lSQ0xFX1JBRElVUyAtIDEsIENJUkNMRV9TVFJPS0VfV0lEVEgsIGNpcmNsZUNvbG9yKTtcblx0XHRcdHN2Zy5hcHBlbmQoY2lyY2xlSW5uZXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBOb2RlXG5cdFx0XHRjb25zdCBjaXJjbGUgPSBkcmF3Q2lyY2xlKGNpcmNsZUluZGV4LCBDSVJDTEVfUkFESVVTICsgMSwgQ0lSQ0xFX1NUUk9LRV9XSURUSCwgY2lyY2xlQ29sb3IpO1xuXHRcdFx0c3ZnLmFwcGVuZChjaXJjbGUpO1xuXHRcdH1cblx0fVxuXG5cdC8vIFNldCBkaW1lbnNpb25zXG5cdHN2Zy5zdHlsZS5oZWlnaHQgPSBgJHtTV0lNTEFORV9IRUlHSFR9cHhgO1xuXHRzdmcuc3R5bGUud2lkdGggPSBgJHtTV0lNTEFORV9XSURUSCAqIChNYXRoLm1heChpbnB1dFN3aW1sYW5lcy5sZW5ndGgsIG91dHB1dFN3aW1sYW5lcy5sZW5ndGgsIDEpICsgMSl9cHhgO1xuXG5cdHJldHVybiBzdmc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJTQ01IaXN0b3J5R3JhcGhQbGFjZWhvbGRlcihjb2x1bW5zOiBJU0NNSGlzdG9yeUl0ZW1HcmFwaE5vZGVbXSwgaGlnaGxpZ2h0SW5kZXg/OiBudW1iZXIpOiBIVE1MRWxlbWVudCB7XG5cdGNvbnN0IGVsZW1lbnRzID0gc3ZnRWxlbSgnc3ZnJywge1xuXHRcdHN0eWxlOiB7IGhlaWdodDogYCR7U1dJTUxBTkVfSEVJR0hUfXB4YCwgd2lkdGg6IGAke1NXSU1MQU5FX1dJRFRIICogKGNvbHVtbnMubGVuZ3RoICsgMSl9cHhgLCB9XG5cdH0pO1xuXG5cdC8vIERyYXcgfFxuXHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgY29sdW1ucy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRjb25zdCBzdHJva2VXaWR0aCA9IGluZGV4ID09PSBoaWdobGlnaHRJbmRleCA/IDMgOiAxO1xuXHRcdGNvbnN0IHBhdGggPSBkcmF3VmVydGljYWxMaW5lKFNXSU1MQU5FX1dJRFRIICogKGluZGV4ICsgMSksIDAsIFNXSU1MQU5FX0hFSUdIVCwgY29sdW1uc1tpbmRleF0uY29sb3IsIHN0cm9rZVdpZHRoKTtcblx0XHRlbGVtZW50cy5yb290LmFwcGVuZChwYXRoKTtcblx0fVxuXG5cdHJldHVybiBlbGVtZW50cy5yb290O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9JU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxBcnJheShcblx0aGlzdG9yeUl0ZW1zOiBJU0NNSGlzdG9yeUl0ZW1bXSxcblx0Y29sb3JNYXAgPSBuZXcgTWFwPHN0cmluZywgQ29sb3JJZGVudGlmaWVyIHwgdW5kZWZpbmVkPigpLFxuXHRjdXJyZW50SGlzdG9yeUl0ZW1SZWY/OiBJU0NNSGlzdG9yeUl0ZW1SZWYsXG5cdGN1cnJlbnRIaXN0b3J5SXRlbVJlbW90ZVJlZj86IElTQ01IaXN0b3J5SXRlbVJlZixcblx0Y3VycmVudEhpc3RvcnlJdGVtQmFzZVJlZj86IElTQ01IaXN0b3J5SXRlbVJlZixcblx0YWRkSW5jb21pbmdDaGFuZ2VzPzogYm9vbGVhbixcblx0YWRkT3V0Z29pbmdDaGFuZ2VzPzogYm9vbGVhbixcblx0bWVyZ2VCYXNlPzogc3RyaW5nXG4pOiBJU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxbXSB7XG5cdGxldCBjb2xvckluZGV4ID0gLTE7XG5cdGNvbnN0IHZpZXdNb2RlbHM6IElTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFtdID0gW107XG5cblx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGhpc3RvcnlJdGVtcy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRjb25zdCBoaXN0b3J5SXRlbSA9IGhpc3RvcnlJdGVtc1tpbmRleF07XG5cblx0XHRjb25zdCBraW5kID0gaGlzdG9yeUl0ZW0uaWQgPT09IGN1cnJlbnRIaXN0b3J5SXRlbVJlZj8ucmV2aXNpb24gPyAnSEVBRCcgOiAnbm9kZSc7XG5cdFx0Y29uc3Qgb3V0cHV0U3dpbWxhbmVzRnJvbVByZXZpb3VzSXRlbSA9IHZpZXdNb2RlbHMuYXQoLTEpPy5vdXRwdXRTd2ltbGFuZXMgPz8gW107XG5cdFx0Y29uc3QgaW5wdXRTd2ltbGFuZXMgPSBvdXRwdXRTd2ltbGFuZXNGcm9tUHJldmlvdXNJdGVtLm1hcChpID0+IGRlZXBDbG9uZShpKSk7XG5cdFx0Y29uc3Qgb3V0cHV0U3dpbWxhbmVzOiBJU0NNSGlzdG9yeUl0ZW1HcmFwaE5vZGVbXSA9IFtdO1xuXG5cdFx0bGV0IGZpcnN0UGFyZW50QWRkZWQgPSBmYWxzZTtcblxuXHRcdC8vIEFkZCBmaXJzdCBwYXJlbnQgdG8gdGhlIG91dHB1dFxuXHRcdGlmIChoaXN0b3J5SXRlbS5wYXJlbnRJZHMubGVuZ3RoID4gMCkge1xuXHRcdFx0Zm9yIChjb25zdCBub2RlIG9mIGlucHV0U3dpbWxhbmVzKSB7XG5cdFx0XHRcdGlmIChub2RlLmlkID09PSBoaXN0b3J5SXRlbS5pZCkge1xuXHRcdFx0XHRcdGlmICghZmlyc3RQYXJlbnRBZGRlZCkge1xuXHRcdFx0XHRcdFx0b3V0cHV0U3dpbWxhbmVzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRpZDogaGlzdG9yeUl0ZW0ucGFyZW50SWRzWzBdLFxuXHRcdFx0XHRcdFx0XHRjb2xvcjogZ2V0TGFiZWxDb2xvcklkZW50aWZpZXIoaGlzdG9yeUl0ZW0sIGNvbG9yTWFwKSA/PyBub2RlLmNvbG9yXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdGZpcnN0UGFyZW50QWRkZWQgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0b3V0cHV0U3dpbWxhbmVzLnB1c2goZGVlcENsb25lKG5vZGUpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBZGQgdW5wcm9jZXNzZWQgcGFyZW50KHMpIHRvIHRoZSBvdXRwdXRcblx0XHRmb3IgKGxldCBpID0gZmlyc3RQYXJlbnRBZGRlZCA/IDEgOiAwOyBpIDwgaGlzdG9yeUl0ZW0ucGFyZW50SWRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHQvLyBDb2xvciBpbmRleCAobGFiZWwgLT4gbmV4dCBjb2xvcilcblx0XHRcdGxldCBjb2xvcklkZW50aWZpZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKGkgPT09IDApIHtcblx0XHRcdFx0Y29sb3JJZGVudGlmaWVyID0gZ2V0TGFiZWxDb2xvcklkZW50aWZpZXIoaGlzdG9yeUl0ZW0sIGNvbG9yTWFwKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtUGFyZW50ID0gaGlzdG9yeUl0ZW1zXG5cdFx0XHRcdFx0LmZpbmQoaCA9PiBoLmlkID09PSBoaXN0b3J5SXRlbS5wYXJlbnRJZHNbaV0pO1xuXHRcdFx0XHRjb2xvcklkZW50aWZpZXIgPSBoaXN0b3J5SXRlbVBhcmVudCA/IGdldExhYmVsQ29sb3JJZGVudGlmaWVyKGhpc3RvcnlJdGVtUGFyZW50LCBjb2xvck1hcCkgOiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghY29sb3JJZGVudGlmaWVyKSB7XG5cdFx0XHRcdGNvbG9ySW5kZXggPSByb3QoY29sb3JJbmRleCArIDEsIGNvbG9yUmVnaXN0cnkubGVuZ3RoKTtcblx0XHRcdFx0Y29sb3JJZGVudGlmaWVyID0gY29sb3JSZWdpc3RyeVtjb2xvckluZGV4XTtcblx0XHRcdH1cblxuXHRcdFx0b3V0cHV0U3dpbWxhbmVzLnB1c2goe1xuXHRcdFx0XHRpZDogaGlzdG9yeUl0ZW0ucGFyZW50SWRzW2ldLFxuXHRcdFx0XHRjb2xvcjogY29sb3JJZGVudGlmaWVyXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBBZGQgY29sb3JzIHRvIHJlZmVyZW5jZXNcblx0XHRjb25zdCByZWZlcmVuY2VzID0gKGhpc3RvcnlJdGVtLnJlZmVyZW5jZXMgPz8gW10pXG5cdFx0XHQubWFwKHJlZiA9PiB7XG5cdFx0XHRcdGxldCBjb2xvciA9IGNvbG9yTWFwLmdldChyZWYuaWQpO1xuXHRcdFx0XHRpZiAoY29sb3JNYXAuaGFzKHJlZi5pZCkgJiYgY29sb3IgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdC8vIEZpbmQgdGhlIGhpc3RvcnkgaXRlbSBpbiB0aGUgaW5wdXQgc3dpbWxhbmVzXG5cdFx0XHRcdFx0Y29uc3QgaW5wdXRJbmRleCA9IGlucHV0U3dpbWxhbmVzLmZpbmRJbmRleChub2RlID0+IG5vZGUuaWQgPT09IGhpc3RvcnlJdGVtLmlkKTtcblxuXHRcdFx0XHRcdC8vIENpcmNsZSBpbmRleCAtIHVzZSB0aGUgaW5wdXQgc3dpbWxhbmUgaW5kZXggaWYgcHJlc2VudCwgb3RoZXJ3aXNlIGFkZCBpdCB0byB0aGUgZW5kXG5cdFx0XHRcdFx0Y29uc3QgY2lyY2xlSW5kZXggPSBpbnB1dEluZGV4ICE9PSAtMSA/IGlucHV0SW5kZXggOiBpbnB1dFN3aW1sYW5lcy5sZW5ndGg7XG5cblx0XHRcdFx0XHQvLyBDaXJjbGUgY29sb3IgLSB1c2UgdGhlIG91dHB1dCBzd2ltbGFuZSBjb2xvciBpZiBwcmVzZW50LCBvdGhlcndpc2UgdGhlIGlucHV0IHN3aW1sYW5lIGNvbG9yXG5cdFx0XHRcdFx0Y29sb3IgPSBjaXJjbGVJbmRleCA8IG91dHB1dFN3aW1sYW5lcy5sZW5ndGggPyBvdXRwdXRTd2ltbGFuZXNbY2lyY2xlSW5kZXhdLmNvbG9yIDpcblx0XHRcdFx0XHRcdGNpcmNsZUluZGV4IDwgaW5wdXRTd2ltbGFuZXMubGVuZ3RoID8gaW5wdXRTd2ltbGFuZXNbY2lyY2xlSW5kZXhdLmNvbG9yIDogaGlzdG9yeUl0ZW1SZWZDb2xvcjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB7IC4uLnJlZiwgY29sb3IgfTtcblx0XHRcdH0pO1xuXG5cdFx0Ly8gU29ydCByZWZlcmVuY2VzXG5cdFx0cmVmZXJlbmNlcy5zb3J0KChyZWYxLCByZWYyKSA9PlxuXHRcdFx0Y29tcGFyZUhpc3RvcnlJdGVtUmVmcyhyZWYxLCByZWYyLCBjdXJyZW50SGlzdG9yeUl0ZW1SZWYsIGN1cnJlbnRIaXN0b3J5SXRlbVJlbW90ZVJlZiwgY3VycmVudEhpc3RvcnlJdGVtQmFzZVJlZikpO1xuXG5cdFx0dmlld01vZGVscy5wdXNoKHtcblx0XHRcdGhpc3RvcnlJdGVtOiB7XG5cdFx0XHRcdC4uLmhpc3RvcnlJdGVtLFxuXHRcdFx0XHRyZWZlcmVuY2VzXG5cdFx0XHR9LFxuXHRcdFx0a2luZCxcblx0XHRcdGlucHV0U3dpbWxhbmVzLFxuXHRcdFx0b3V0cHV0U3dpbWxhbmVzXG5cdFx0fSBzYXRpc2ZpZXMgSVNDTUhpc3RvcnlJdGVtVmlld01vZGVsKTtcblx0fVxuXG5cdC8vIEFkZCBpbmNvbWluZy9vdXRnb2luZyBjaGFuZ2VzIGhpc3RvcnkgaXRlbSB2aWV3IG1vZGVscy4gV2hpbGUgd29ya2luZ1xuXHQvLyB3aXRoIHRoZSB2aWV3IG1vZGVscyBpcyBhIGxpdHRsZSBiaXQgbW9yZSBjb21wbGV4LCB3ZSBhcmUgZG9pbmcgdGhpc1xuXHQvLyBhZnRlciBjcmVhdGluZyB0aGUgdmlldyBtb2RlbHMgc28gdGhhdCB3ZSBjYW4gdXNlIHRoZSBzd2ltbGFuZSBjb2xvcnNcblx0Ly8gdG8gYWRkIHRoZSBpbmNvbWluZy9vdXRnb2luZyBjaGFuZ2VzIGhpc3RvcnkgaXRlbXMgdmlldyBtb2RlbHMgdG8gdGhlXG5cdC8vIGNvcnJlY3Qgc3dpbWxhbmVzLlxuXHRhZGRJbmNvbWluZ091dGdvaW5nQ2hhbmdlc0hpc3RvcnlJdGVtcyhcblx0XHR2aWV3TW9kZWxzLFxuXHRcdGN1cnJlbnRIaXN0b3J5SXRlbVJlZixcblx0XHRjdXJyZW50SGlzdG9yeUl0ZW1SZW1vdGVSZWYsXG5cdFx0YWRkSW5jb21pbmdDaGFuZ2VzLFxuXHRcdGFkZE91dGdvaW5nQ2hhbmdlcyxcblx0XHRtZXJnZUJhc2Vcblx0KTtcblxuXHRyZXR1cm4gdmlld01vZGVscztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEhpc3RvcnlJdGVtSW5kZXgoaGlzdG9yeUl0ZW1WaWV3TW9kZWw6IElTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbCk6IG51bWJlciB7XG5cdGNvbnN0IGhpc3RvcnlJdGVtID0gaGlzdG9yeUl0ZW1WaWV3TW9kZWwuaGlzdG9yeUl0ZW07XG5cdGNvbnN0IGlucHV0U3dpbWxhbmVzID0gaGlzdG9yeUl0ZW1WaWV3TW9kZWwuaW5wdXRTd2ltbGFuZXM7XG5cblx0Ly8gRmluZCB0aGUgaGlzdG9yeSBpdGVtIGluIHRoZSBpbnB1dCBzd2ltbGFuZXNcblx0Y29uc3QgaW5wdXRJbmRleCA9IGlucHV0U3dpbWxhbmVzLmZpbmRJbmRleChub2RlID0+IG5vZGUuaWQgPT09IGhpc3RvcnlJdGVtLmlkKTtcblxuXHQvLyBDaXJjbGUgaW5kZXggLSB1c2UgdGhlIGlucHV0IHN3aW1sYW5lIGluZGV4IGlmIHByZXNlbnQsIG90aGVyd2lzZSBhZGQgaXQgdG8gdGhlIGVuZFxuXHRyZXR1cm4gaW5wdXRJbmRleCAhPT0gLTEgPyBpbnB1dEluZGV4IDogaW5wdXRTd2ltbGFuZXMubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiBhZGRJbmNvbWluZ091dGdvaW5nQ2hhbmdlc0hpc3RvcnlJdGVtcyhcblx0dmlld01vZGVsczogSVNDTUhpc3RvcnlJdGVtVmlld01vZGVsW10sXG5cdGN1cnJlbnRIaXN0b3J5SXRlbVJlZj86IElTQ01IaXN0b3J5SXRlbVJlZixcblx0Y3VycmVudEhpc3RvcnlJdGVtUmVtb3RlUmVmPzogSVNDTUhpc3RvcnlJdGVtUmVmLFxuXHRhZGRJbmNvbWluZ0NoYW5nZXM/OiBib29sZWFuLFxuXHRhZGRPdXRnb2luZ0NoYW5nZXM/OiBib29sZWFuLFxuXHRtZXJnZUJhc2U/OiBzdHJpbmdcbik6IHZvaWQge1xuXHRpZiAoY3VycmVudEhpc3RvcnlJdGVtUmVmPy5yZXZpc2lvbiAhPT0gY3VycmVudEhpc3RvcnlJdGVtUmVtb3RlUmVmPy5yZXZpc2lvbiAmJiBtZXJnZUJhc2UpIHtcblx0XHQvLyBJbmNvbWluZyBjaGFuZ2VzIG5vZGVcblx0XHRpZiAoYWRkSW5jb21pbmdDaGFuZ2VzICYmIGN1cnJlbnRIaXN0b3J5SXRlbVJlbW90ZVJlZiAmJiBjdXJyZW50SGlzdG9yeUl0ZW1SZW1vdGVSZWYucmV2aXNpb24gIT09IG1lcmdlQmFzZSkge1xuXHRcdFx0Ly8gRmluZCB0aGUgYmVmb3JlL2FmdGVyIGluZGljZXMgdXNpbmcgdGhlIG1lcmdlIGJhc2UgKG1pZ2h0IG5vdCBiZSBwcmVzZW50IGlmIHRoZSBtZXJnZSBiYXNlIGhpc3RvcnkgaXRlbSBpcyBub3QgbG9hZGVkIHlldClcblx0XHRcdGNvbnN0IGJlZm9yZUhpc3RvcnlJdGVtSW5kZXggPSBmaW5kTGFzdElkeCh2aWV3TW9kZWxzLCB2bSA9PiB2bS5vdXRwdXRTd2ltbGFuZXMuc29tZShub2RlID0+IG5vZGUuaWQgPT09IG1lcmdlQmFzZSkpO1xuXHRcdFx0Y29uc3QgYWZ0ZXJIaXN0b3J5SXRlbUluZGV4ID0gdmlld01vZGVscy5maW5kSW5kZXgodm0gPT4gdm0uaGlzdG9yeUl0ZW0uaWQgPT09IG1lcmdlQmFzZSk7XG5cblx0XHRcdGlmIChiZWZvcmVIaXN0b3J5SXRlbUluZGV4ICE9PSAtMSAmJiBhZnRlckhpc3RvcnlJdGVtSW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdC8vIFRoZXJlIGlzIGEga25vd24gZWRnZSBjYXNlIGluIHdoaWNoIHRoZSBpbmNvbWluZyBjaGFuZ2VzIGhhdmUgYWxyZWFkeVxuXHRcdFx0XHQvLyBiZWVuIG1lcmdlZC4gRm9yIHRoaXMgc2NlbmFyaW8sIHdlIHdpbGwgbm90IGJlIHNob3dpbmcgdGhlIGluY29taW5nXG5cdFx0XHRcdC8vIGNoYW5nZXMgaGlzdG9yeSBpdGVtLiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjc2MDY0XG5cdFx0XHRcdGNvbnN0IGluY29taW5nQ2hhbmdlTWVyZ2VkID0gdmlld01vZGVsc1tiZWZvcmVIaXN0b3J5SXRlbUluZGV4XS5oaXN0b3J5SXRlbS5wYXJlbnRJZHMubGVuZ3RoID09PSAyICYmXG5cdFx0XHRcdFx0dmlld01vZGVsc1tiZWZvcmVIaXN0b3J5SXRlbUluZGV4XS5oaXN0b3J5SXRlbS5wYXJlbnRJZHMuaW5jbHVkZXMobWVyZ2VCYXNlKTtcblxuXHRcdFx0XHRpZiAoIWluY29taW5nQ2hhbmdlTWVyZ2VkKSB7XG5cdFx0XHRcdFx0Ly8gVXBkYXRlIHRoZSBiZWZvcmUgbm9kZSBzbyB0aGF0IHRoZSBpbmNvbWluZyBhbmQgb3V0Z29pbmcgc3dpbWxhbmVzXG5cdFx0XHRcdFx0Ly8gcG9pbnQgdG8gdGhlIGBpbmNvbWluZy1jaGFuZ2VzYCBub2RlIGluc3RlYWQgb2YgdGhlIG1lcmdlIGJhc2Vcblx0XHRcdFx0XHR2aWV3TW9kZWxzW2JlZm9yZUhpc3RvcnlJdGVtSW5kZXhdID0ge1xuXHRcdFx0XHRcdFx0Li4udmlld01vZGVsc1tiZWZvcmVIaXN0b3J5SXRlbUluZGV4XSxcblx0XHRcdFx0XHRcdGlucHV0U3dpbWxhbmVzOiB2aWV3TW9kZWxzW2JlZm9yZUhpc3RvcnlJdGVtSW5kZXhdLmlucHV0U3dpbWxhbmVzXG5cdFx0XHRcdFx0XHRcdC5tYXAobm9kZSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIG5vZGUuaWQgPT09IG1lcmdlQmFzZSAmJiBub2RlLmNvbG9yID09PSBoaXN0b3J5SXRlbVJlbW90ZVJlZkNvbG9yXG5cdFx0XHRcdFx0XHRcdFx0XHQ/IHsgLi4ubm9kZSwgaWQ6IFNDTUluY29taW5nSGlzdG9yeUl0ZW1JZCB9XG5cdFx0XHRcdFx0XHRcdFx0XHQ6IG5vZGU7XG5cdFx0XHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdFx0b3V0cHV0U3dpbWxhbmVzOiB2aWV3TW9kZWxzW2JlZm9yZUhpc3RvcnlJdGVtSW5kZXhdLm91dHB1dFN3aW1sYW5lc1xuXHRcdFx0XHRcdFx0XHQubWFwKG5vZGUgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBub2RlLmlkID09PSBtZXJnZUJhc2UgJiYgbm9kZS5jb2xvciA9PT0gaGlzdG9yeUl0ZW1SZW1vdGVSZWZDb2xvclxuXHRcdFx0XHRcdFx0XHRcdFx0PyB7IC4uLm5vZGUsIGlkOiBTQ01JbmNvbWluZ0hpc3RvcnlJdGVtSWQgfVxuXHRcdFx0XHRcdFx0XHRcdFx0OiBub2RlO1xuXHRcdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHQvLyBDcmVhdGUgaW5jb21pbmcgY2hhbmdlcyBub2RlXG5cdFx0XHRcdFx0Y29uc3QgaW5wdXRTd2ltbGFuZXMgPSB2aWV3TW9kZWxzW2JlZm9yZUhpc3RvcnlJdGVtSW5kZXhdLm91dHB1dFN3aW1sYW5lcy5tYXAoaSA9PiBkZWVwQ2xvbmUoaSkpO1xuXHRcdFx0XHRcdGNvbnN0IG91dHB1dFN3aW1sYW5lcyA9IHZpZXdNb2RlbHNbYWZ0ZXJIaXN0b3J5SXRlbUluZGV4XS5pbnB1dFN3aW1sYW5lcy5tYXAoaSA9PiBkZWVwQ2xvbmUoaSkpO1xuXHRcdFx0XHRcdGNvbnN0IGRpc3BsYXlJZExlbmd0aCA9IHZpZXdNb2RlbHNbMF0uaGlzdG9yeUl0ZW0uZGlzcGxheUlkPy5sZW5ndGggPz8gMDtcblxuXHRcdFx0XHRcdGNvbnN0IGluY29taW5nQ2hhbmdlc0hpc3RvcnlJdGVtID0ge1xuXHRcdFx0XHRcdFx0aWQ6IFNDTUluY29taW5nSGlzdG9yeUl0ZW1JZCxcblx0XHRcdFx0XHRcdGRpc3BsYXlJZDogJzAnLnJlcGVhdChkaXNwbGF5SWRMZW5ndGgpLFxuXHRcdFx0XHRcdFx0cGFyZW50SWRzOiBbbWVyZ2VCYXNlXSxcblx0XHRcdFx0XHRcdGF1dGhvcjogY3VycmVudEhpc3RvcnlJdGVtUmVtb3RlUmVmPy5uYW1lLFxuXHRcdFx0XHRcdFx0c3ViamVjdDogbG9jYWxpemUoJ2luY29taW5nQ2hhbmdlcycsICdJbmNvbWluZyBDaGFuZ2VzJyksXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiAnJ1xuXHRcdFx0XHRcdH0gc2F0aXNmaWVzIElTQ01IaXN0b3J5SXRlbTtcblxuXHRcdFx0XHRcdC8vIEluc2VydCBpbmNvbWluZyBjaGFuZ2VzIG5vZGVcblx0XHRcdFx0XHR2aWV3TW9kZWxzLnNwbGljZShhZnRlckhpc3RvcnlJdGVtSW5kZXgsIDAsIHtcblx0XHRcdFx0XHRcdGhpc3RvcnlJdGVtOiBpbmNvbWluZ0NoYW5nZXNIaXN0b3J5SXRlbSxcblx0XHRcdFx0XHRcdGtpbmQ6ICdpbmNvbWluZy1jaGFuZ2VzJyxcblx0XHRcdFx0XHRcdGlucHV0U3dpbWxhbmVzLFxuXHRcdFx0XHRcdFx0b3V0cHV0U3dpbWxhbmVzXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBPdXRnb2luZyBjaGFuZ2VzIG5vZGVcblx0XHRpZiAoYWRkT3V0Z29pbmdDaGFuZ2VzICYmIGN1cnJlbnRIaXN0b3J5SXRlbVJlZj8ucmV2aXNpb24gJiYgY3VycmVudEhpc3RvcnlJdGVtUmVmLnJldmlzaW9uICE9PSBtZXJnZUJhc2UpIHtcblx0XHRcdC8vIEZpbmQgdGhlIGluZGV4IG9mIHRoZSBjdXJyZW50IGhpc3RvcnkgaXRlbSB2aWV3IG1vZGVsIChtaWdodCBub3QgYmUgcHJlc2VudCBpZiB0aGUgY3VycmVudCBoaXN0b3J5IGl0ZW0gaXMgbm90IGxvYWRlZCB5ZXQpXG5cdFx0XHRjb25zdCBjdXJyZW50SGlzdG9yeUl0ZW1SZWZJbmRleCA9IHZpZXdNb2RlbHMuZmluZEluZGV4KHZtID0+IHZtLmtpbmQgPT09ICdIRUFEJyAmJiB2bS5oaXN0b3J5SXRlbS5pZCA9PT0gY3VycmVudEhpc3RvcnlJdGVtUmVmLnJldmlzaW9uKTtcblxuXHRcdFx0aWYgKGN1cnJlbnRIaXN0b3J5SXRlbVJlZkluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHQvLyBDcmVhdGUgb3V0Z29pbmcgY2hhbmdlcyBub2RlXG5cdFx0XHRcdGNvbnN0IG91dGdvaW5nQ2hhbmdlc0hpc3RvcnlJdGVtID0ge1xuXHRcdFx0XHRcdGlkOiBTQ01PdXRnb2luZ0hpc3RvcnlJdGVtSWQsXG5cdFx0XHRcdFx0ZGlzcGxheUlkOiB2aWV3TW9kZWxzWzBdLmhpc3RvcnlJdGVtLmRpc3BsYXlJZFxuXHRcdFx0XHRcdFx0PyAnMCcucmVwZWF0KHZpZXdNb2RlbHNbMF0uaGlzdG9yeUl0ZW0uZGlzcGxheUlkLmxlbmd0aClcblx0XHRcdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHBhcmVudElkczogW2N1cnJlbnRIaXN0b3J5SXRlbVJlZi5yZXZpc2lvbl0sXG5cdFx0XHRcdFx0YXV0aG9yOiBjdXJyZW50SGlzdG9yeUl0ZW1SZWY/Lm5hbWUsXG5cdFx0XHRcdFx0c3ViamVjdDogbG9jYWxpemUoJ291dGdvaW5nQ2hhbmdlcycsICdPdXRnb2luZyBDaGFuZ2VzJyksXG5cdFx0XHRcdFx0bWVzc2FnZTogJydcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSVNDTUhpc3RvcnlJdGVtO1xuXG5cdFx0XHRcdC8vIENvcHkgdGhlIGlucHV0IHN3aW1sYW5lcyBmcm9tIHRoZSBjdXJyZW50IGhpc3RvcnkgaXRlbSByZWZcblx0XHRcdFx0Y29uc3QgaW5wdXRTd2ltbGFuZXMgPSB2aWV3TW9kZWxzW2N1cnJlbnRIaXN0b3J5SXRlbVJlZkluZGV4XS5pbnB1dFN3aW1sYW5lcy5zbGljZSgwKTtcblxuXHRcdFx0XHQvLyBDb3B5IHRoZSBpbnB1dCBzd2ltbGFuZXMgYW5kIGFkZCB0aGUgY3VycmVudCBoaXN0b3J5IGl0ZW0gcmVmXG5cdFx0XHRcdGNvbnN0IG91dHB1dFN3aW1sYW5lcyA9IGlucHV0U3dpbWxhbmVzLnNsaWNlKDApLmNvbmNhdCh7XG5cdFx0XHRcdFx0aWQ6IGN1cnJlbnRIaXN0b3J5SXRlbVJlZi5yZXZpc2lvbixcblx0XHRcdFx0XHRjb2xvcjogaGlzdG9yeUl0ZW1SZWZDb2xvclxuXHRcdFx0XHR9IHNhdGlzZmllcyBJU0NNSGlzdG9yeUl0ZW1HcmFwaE5vZGUpO1xuXG5cdFx0XHRcdC8vIEluc2VydCBvdXRnb2luZyBjaGFuZ2VzIG5vZGVcblx0XHRcdFx0dmlld01vZGVscy5zcGxpY2UoY3VycmVudEhpc3RvcnlJdGVtUmVmSW5kZXgsIDAsIHtcblx0XHRcdFx0XHRoaXN0b3J5SXRlbTogb3V0Z29pbmdDaGFuZ2VzSGlzdG9yeUl0ZW0sXG5cdFx0XHRcdFx0a2luZDogJ291dGdvaW5nLWNoYW5nZXMnLFxuXHRcdFx0XHRcdGlucHV0U3dpbWxhbmVzLFxuXHRcdFx0XHRcdG91dHB1dFN3aW1sYW5lc1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBVcGRhdGUgdGhlIGlucHV0IHN3aW1sYW5lIGZvciB0aGUgY3VycmVudCBoaXN0b3J5IGl0ZW1cblx0XHRcdFx0Ly8gcmVmIHNvIHRoYXQgaXQgY29ubmVjdHMgd2l0aCB0aGUgb3V0Z29pbmcgY2hhbmdlcyBub2RlXG5cdFx0XHRcdHZpZXdNb2RlbHNbY3VycmVudEhpc3RvcnlJdGVtUmVmSW5kZXggKyAxXS5pbnB1dFN3aW1sYW5lcy5wdXNoKHtcblx0XHRcdFx0XHRpZDogY3VycmVudEhpc3RvcnlJdGVtUmVmLnJldmlzaW9uLFxuXHRcdFx0XHRcdGNvbG9yOiBoaXN0b3J5SXRlbVJlZkNvbG9yXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElTQ01IaXN0b3J5SXRlbUdyYXBoTm9kZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb21wYXJlSGlzdG9yeUl0ZW1SZWZzKFxuXHRyZWYxOiBJU0NNSGlzdG9yeUl0ZW1SZWYsXG5cdHJlZjI6IElTQ01IaXN0b3J5SXRlbVJlZixcblx0Y3VycmVudEhpc3RvcnlJdGVtUmVmPzogSVNDTUhpc3RvcnlJdGVtUmVmLFxuXHRjdXJyZW50SGlzdG9yeUl0ZW1SZW1vdGVSZWY/OiBJU0NNSGlzdG9yeUl0ZW1SZWYsXG5cdGN1cnJlbnRIaXN0b3J5SXRlbUJhc2VSZWY/OiBJU0NNSGlzdG9yeUl0ZW1SZWZcbik6IG51bWJlciB7XG5cdGNvbnN0IGdldEhpc3RvcnlJdGVtUmVmT3JkZXIgPSAocmVmOiBJU0NNSGlzdG9yeUl0ZW1SZWYpID0+IHtcblx0XHRpZiAocmVmLmlkID09PSBjdXJyZW50SGlzdG9yeUl0ZW1SZWY/LmlkKSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9IGVsc2UgaWYgKHJlZi5pZCA9PT0gY3VycmVudEhpc3RvcnlJdGVtUmVtb3RlUmVmPy5pZCkge1xuXHRcdFx0cmV0dXJuIDI7XG5cdFx0fSBlbHNlIGlmIChyZWYuaWQgPT09IGN1cnJlbnRIaXN0b3J5SXRlbUJhc2VSZWY/LmlkKSB7XG5cdFx0XHRyZXR1cm4gMztcblx0XHR9IGVsc2UgaWYgKHJlZi5jb2xvciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gNDtcblx0XHR9XG5cblx0XHRyZXR1cm4gOTk7XG5cdH07XG5cblx0Ly8gQXNzaWduIG9yZGVyIChjdXJyZW50ID4gcmVtb3RlID4gYmFzZSA+IGNvbG9yKVxuXHRjb25zdCByZWYxT3JkZXIgPSBnZXRIaXN0b3J5SXRlbVJlZk9yZGVyKHJlZjEpO1xuXHRjb25zdCByZWYyT3JkZXIgPSBnZXRIaXN0b3J5SXRlbVJlZk9yZGVyKHJlZjIpO1xuXG5cdHJldHVybiByZWYxT3JkZXIgLSByZWYyT3JkZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0hpc3RvcnlJdGVtSG92ZXJDb250ZW50KG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsIGhpc3RvcnlJdGVtOiBJU0NNSGlzdG9yeUl0ZW0sIGluY2x1ZGVSZWZlcmVuY2VzOiBib29sZWFuKTogeyBjb250ZW50OiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCBIVE1MRWxlbWVudDsgZGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlIH0ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRpZiAoaGlzdG9yeUl0ZW0udG9vbHRpcCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHsgY29udGVudDogaGlzdG9yeUl0ZW0ubWVzc2FnZSwgZGlzcG9zYWJsZXMgfTtcblx0fVxuXG5cdGlmIChpc01hcmtkb3duU3RyaW5nKGhpc3RvcnlJdGVtLnRvb2x0aXApKSB7XG5cdFx0cmV0dXJuIHsgY29udGVudDogaGlzdG9yeUl0ZW0udG9vbHRpcCwgZGlzcG9zYWJsZXMgfTtcblx0fVxuXG5cdC8vIFJlZmVyZW5jZXMgYXMgXCJpbmplY3RlZFwiIGludG8gdGhlIGhvdmVyIGhlcmUgc2luY2UgdGhlIGV4dGVuc2lvbiBkb2VzXG5cdC8vIG5vdCBrbm93IHRoYXQgY29sb3IgdXNlZCBpbiB0aGUgZ3JhcGggdG8gcmVuZGVyIHRoZSBoaXN0b3J5IGl0ZW0gYXQgd2hpY2hcblx0Ly8gdGhlIHJlZmVyZW5jZSBpcyBwb2ludGluZyB0by4gVGhleSBhcmUgYmVpbmcgYWRkZWQgYmVmb3JlIHRoZSBsYXN0IGVsZW1lbnRcblx0Ly8gb2YgdGhlIGFycmF5IHdoaWNoIGlzIGFzc3VtZWQgdG8gY29udGFpbiB0aGUgaG92ZXIgY29tbWFuZHMuXG5cdGNvbnN0IHRvb2x0aXBTZWN0aW9ucyA9IGhpc3RvcnlJdGVtLnRvb2x0aXAuc2xpY2UoKTtcblxuXHRpZiAoaW5jbHVkZVJlZmVyZW5jZXMgJiYgaGlzdG9yeUl0ZW0ucmVmZXJlbmNlcz8ubGVuZ3RoKSB7XG5cdFx0Y29uc3QgbWFya2Rvd25TdHJpbmcgPSBuZXcgTWFya2Rvd25TdHJpbmcoJycsIHsgc3VwcG9ydEh0bWw6IHRydWUsIHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXG5cdFx0Zm9yIChjb25zdCByZWZlcmVuY2Ugb2YgaGlzdG9yeUl0ZW0ucmVmZXJlbmNlcykge1xuXHRcdFx0Y29uc3QgbGFiZWxJY29uSWQgPSBUaGVtZUljb24uaXNUaGVtZUljb24ocmVmZXJlbmNlLmljb24pID8gcmVmZXJlbmNlLmljb24uaWQgOiAnJztcblxuXHRcdFx0Y29uc3QgbGFiZWxCYWNrZ3JvdW5kQ29sb3IgPSByZWZlcmVuY2UuY29sb3IgPyBhc0Nzc1ZhcmlhYmxlKHJlZmVyZW5jZS5jb2xvcikgOiBhc0Nzc1ZhcmlhYmxlKGhpc3RvcnlJdGVtSG92ZXJEZWZhdWx0TGFiZWxCYWNrZ3JvdW5kKTtcblx0XHRcdGNvbnN0IGxhYmVsRm9yZWdyb3VuZENvbG9yID0gcmVmZXJlbmNlLmNvbG9yID8gYXNDc3NWYXJpYWJsZShoaXN0b3J5SXRlbUhvdmVyTGFiZWxGb3JlZ3JvdW5kKSA6IGFzQ3NzVmFyaWFibGUoaGlzdG9yeUl0ZW1Ib3ZlckRlZmF1bHRMYWJlbEZvcmVncm91bmQpO1xuXHRcdFx0bWFya2Rvd25TdHJpbmcuYXBwZW5kTWFya2Rvd24oYDxzcGFuIHN0eWxlPVwiY29sb3I6JHtsYWJlbEZvcmVncm91bmRDb2xvcn07YmFja2dyb3VuZC1jb2xvcjoke2xhYmVsQmFja2dyb3VuZENvbG9yfTtib3JkZXItcmFkaXVzOjEwcHg7XCI+Jm5ic3A7JCgke2xhYmVsSWNvbklkfSkmbmJzcDtgKTtcblx0XHRcdG1hcmtkb3duU3RyaW5nLmFwcGVuZFRleHQocmVmZXJlbmNlLm5hbWUpO1xuXHRcdFx0bWFya2Rvd25TdHJpbmcuYXBwZW5kTWFya2Rvd24oJyZuYnNwOyZuYnNwOzwvc3Bhbj4nKTtcblx0XHR9XG5cblx0XHRtYXJrZG93blN0cmluZy5hcHBlbmRNYXJrZG93bihgXFxuXFxuLS0tXFxuXFxuYCk7XG5cdFx0dG9vbHRpcFNlY3Rpb25zLnNwbGljZSh0b29sdGlwU2VjdGlvbnMubGVuZ3RoIC0gMSwgMCwgbWFya2Rvd25TdHJpbmcpO1xuXHR9XG5cblx0Ly8gUmVuZGVyIHRvb2x0aXAgY29udGVudFxuXHRjb25zdCBob3ZlckNvbnRhaW5lciA9ICQoJy5oaXN0b3J5LWl0ZW0taG92ZXItY29udGFpbmVyJyk7XG5cdGZvciAoY29uc3QgbWFya2Rvd25TdHJpbmcgb2YgdG9vbHRpcFNlY3Rpb25zKSB7XG5cdFx0aWYgKGlzRW1wdHlNYXJrZG93blN0cmluZyhtYXJrZG93blN0cmluZykpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlbmRlcmVkQ29udGVudCA9IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihtYXJrZG93blN0cmluZyk7XG5cdFx0aG92ZXJDb250YWluZXIuYXBwZW5kQ2hpbGQocmVuZGVyZWRDb250ZW50LmVsZW1lbnQpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZW5kZXJlZENvbnRlbnQpO1xuXHR9XG5cblx0cmV0dXJuIHsgY29udGVudDogaG92ZXJDb250YWluZXIsIGRpc3Bvc2FibGVzIH07XG59XG4iXSwK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
