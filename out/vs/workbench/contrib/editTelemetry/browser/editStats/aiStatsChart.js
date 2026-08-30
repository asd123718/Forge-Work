import { $ } from "../../../../../base/browser/dom.js";
import { localize } from "../../../../../nls.js";
import { asCssVariable } from "../../../../../platform/theme/common/colorUtils.js";
import { chartsBlue, chartsForeground, chartsLines } from "../../../../../platform/theme/common/colorRegistry.js";
function aggregateSessionsByDay(sessions) {
  const dayMap = /* @__PURE__ */ new Map();
  for (const session of sessions) {
    const date = new Date(session.startTime);
    const isoDate = date.toISOString().split("T")[0];
    const displayDate = date.toLocaleDateString(void 0, { month: "short", day: "numeric" });
    let aggregate = dayMap.get(isoDate);
    if (!aggregate) {
      aggregate = {
        date: isoDate,
        displayDate,
        aiRate: 0,
        totalAiChars: 0,
        totalTypedChars: 0,
        inlineSuggestions: 0,
        chatEdits: 0,
        sessionCount: 0
      };
      dayMap.set(isoDate, aggregate);
    }
    aggregate.totalAiChars += session.aiCharacters;
    aggregate.totalTypedChars += session.typedCharacters;
    aggregate.inlineSuggestions += session.acceptedInlineSuggestions ?? 0;
    aggregate.chatEdits += session.chatEditCount ?? 0;
    aggregate.sessionCount += 1;
  }
  for (const aggregate of dayMap.values()) {
    const total = aggregate.totalAiChars + aggregate.totalTypedChars;
    aggregate.aiRate = total > 0 ? aggregate.totalAiChars / total : 0;
  }
  return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}
function createAiStatsChart(options) {
  const { sessions: sessionsData, viewMode: mode } = options;
  const width = 280;
  const height = 100;
  const margin = { top: 10, right: 10, bottom: 25, left: 30 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const container = $(".ai-stats-chart-container");
  container.style.position = "relative";
  container.style.marginTop = "8px";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", `${width}px`);
  svg.setAttribute("height", `${height}px`);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.style.display = "block";
  container.appendChild(svg);
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("transform", `translate(${margin.left},${margin.top})`);
  svg.appendChild(g);
  if (sessionsData.length === 0) {
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", `${innerWidth / 2}`);
    text.setAttribute("y", `${innerHeight / 2}`);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("fill", asCssVariable(chartsForeground));
    text.setAttribute("font-size", "11px");
    text.textContent = localize("noData", "No data yet");
    g.appendChild(text);
    return container;
  }
  const xAxisLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
  xAxisLine.setAttribute("x1", "0");
  xAxisLine.setAttribute("y1", `${innerHeight}`);
  xAxisLine.setAttribute("x2", `${innerWidth}`);
  xAxisLine.setAttribute("y2", `${innerHeight}`);
  xAxisLine.setAttribute("stroke", asCssVariable(chartsLines));
  xAxisLine.setAttribute("stroke-width", "1px");
  g.appendChild(xAxisLine);
  const yAxisLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
  yAxisLine.setAttribute("x1", "0");
  yAxisLine.setAttribute("y1", "0");
  yAxisLine.setAttribute("x2", "0");
  yAxisLine.setAttribute("y2", `${innerHeight}`);
  yAxisLine.setAttribute("stroke", asCssVariable(chartsLines));
  yAxisLine.setAttribute("stroke-width", "1px");
  g.appendChild(yAxisLine);
  for (const pct of [0, 50, 100]) {
    const y = innerHeight - pct / 100 * innerHeight;
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", "-4");
    label.setAttribute("y", `${y + 3}`);
    label.setAttribute("text-anchor", "end");
    label.setAttribute("fill", asCssVariable(chartsForeground));
    label.setAttribute("font-size", "9px");
    label.textContent = `${pct}%`;
    g.appendChild(label);
    if (pct > 0) {
      const gridLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      gridLine.setAttribute("x1", "0");
      gridLine.setAttribute("y1", `${y}`);
      gridLine.setAttribute("x2", `${innerWidth}`);
      gridLine.setAttribute("y2", `${y}`);
      gridLine.setAttribute("stroke", asCssVariable(chartsLines));
      gridLine.setAttribute("stroke-width", "0.5px");
      gridLine.setAttribute("stroke-dasharray", "2,2");
      g.appendChild(gridLine);
    }
  }
  if (mode === "days") {
    renderDaysView();
  } else {
    renderSessionsView();
  }
  function renderDaysView() {
    const dailyData = aggregateSessionsByDay(sessionsData);
    const barCount = dailyData.length;
    const barWidth = Math.min(20, (innerWidth - (barCount - 1) * 2) / barCount);
    const gap = 2;
    const totalBarSpace = barCount * barWidth + (barCount - 1) * gap;
    const startX = (innerWidth - totalBarSpace) / 2;
    const minLabelSpacing = 40;
    const totalWidth = totalBarSpace;
    const maxLabels = Math.max(2, Math.floor(totalWidth / minLabelSpacing));
    const labelStep = Math.max(1, Math.ceil(barCount / maxLabels));
    dailyData.forEach((day, i) => {
      const x = startX + i * (barWidth + gap);
      const barHeight = day.aiRate * innerHeight;
      const y = innerHeight - barHeight;
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", `${x}`);
      rect.setAttribute("y", `${y}`);
      rect.setAttribute("width", `${barWidth}`);
      rect.setAttribute("height", `${Math.max(1, barHeight)}`);
      rect.setAttribute("fill", asCssVariable(chartsBlue));
      rect.setAttribute("rx", "2");
      g.appendChild(rect);
      const isFirst = i === 0;
      const isLast = i === barCount - 1;
      const isAtInterval = i % labelStep === 0;
      if (isFirst || isLast || isAtInterval && barCount > 2) {
        if (!isFirst && !isLast) {
          const distFromFirst = i * (barWidth + gap);
          const distFromLast = (barCount - 1 - i) * (barWidth + gap);
          if (distFromFirst < minLabelSpacing || distFromLast < minLabelSpacing) {
            return;
          }
        }
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", `${x + barWidth / 2}`);
        label.setAttribute("y", `${innerHeight + 12}`);
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("fill", asCssVariable(chartsForeground));
        label.setAttribute("font-size", "8px");
        label.textContent = day.displayDate;
        g.appendChild(label);
      }
    });
  }
  function renderSessionsView() {
    const sessionCount = sessionsData.length;
    const barWidth = Math.min(8, (innerWidth - (sessionCount - 1) * 1) / sessionCount);
    const gap = 1;
    const totalBarSpace = sessionCount * barWidth + (sessionCount - 1) * gap;
    const startX = (innerWidth - totalBarSpace) / 2;
    sessionsData.forEach((session, i) => {
      const total = session.aiCharacters + session.typedCharacters;
      const aiRate = total > 0 ? session.aiCharacters / total : 0;
      const x = startX + i * (barWidth + gap);
      const barHeight = aiRate * innerHeight;
      const y = innerHeight - barHeight;
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", `${x}`);
      rect.setAttribute("y", `${y}`);
      rect.setAttribute("width", `${barWidth}`);
      rect.setAttribute("height", `${Math.max(1, barHeight)}`);
      rect.setAttribute("fill", asCssVariable(chartsBlue));
      rect.setAttribute("rx", "1");
      g.appendChild(rect);
    });
    const minLabelSpacing = 40;
    if (sessionCount === 0) {
      return;
    }
    const firstSession = sessionsData[0];
    const firstX = startX;
    const firstDate = new Date(firstSession.startTime);
    const firstLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    firstLabel.setAttribute("x", `${firstX + barWidth / 2}`);
    firstLabel.setAttribute("y", `${innerHeight + 12}`);
    firstLabel.setAttribute("text-anchor", "start");
    firstLabel.setAttribute("fill", asCssVariable(chartsForeground));
    firstLabel.setAttribute("font-size", "8px");
    firstLabel.textContent = firstDate.toLocaleDateString(void 0, { month: "short", day: "numeric" });
    g.appendChild(firstLabel);
    if (sessionCount > 1 && totalBarSpace >= minLabelSpacing) {
      const lastSession = sessionsData[sessionCount - 1];
      const lastX = startX + (sessionCount - 1) * (barWidth + gap);
      const lastDate = new Date(lastSession.startTime);
      const lastLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
      lastLabel.setAttribute("x", `${lastX + barWidth / 2}`);
      lastLabel.setAttribute("y", `${innerHeight + 12}`);
      lastLabel.setAttribute("text-anchor", "end");
      lastLabel.setAttribute("fill", asCssVariable(chartsForeground));
      lastLabel.setAttribute("font-size", "8px");
      lastLabel.textContent = lastDate.toLocaleDateString(void 0, { month: "short", day: "numeric" });
      g.appendChild(lastLabel);
    }
  }
  return container;
}
export {
  aggregateSessionsByDay,
  createAiStatsChart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGVkaXRUZWxlbWV0cnlcXGJyb3dzZXJcXGVkaXRTdGF0c1xcYWlTdGF0c0NoYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgJCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclV0aWxzLmpzJztcbmltcG9ydCB7IGNoYXJ0c0JsdWUsIGNoYXJ0c0ZvcmVncm91bmQsIGNoYXJ0c0xpbmVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uRGF0YSB7XG5cdHN0YXJ0VGltZTogbnVtYmVyO1xuXHR0eXBlZENoYXJhY3RlcnM6IG51bWJlcjtcblx0YWlDaGFyYWN0ZXJzOiBudW1iZXI7XG5cdGFjY2VwdGVkSW5saW5lU3VnZ2VzdGlvbnM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0Y2hhdEVkaXRDb3VudDogbnVtYmVyIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEYWlseUFnZ3JlZ2F0ZSB7XG5cdGRhdGU6IHN0cmluZzsgLy8gSVNPIGRhdGUgc3RyaW5nIChZWVlZLU1NLUREKVxuXHRkaXNwbGF5RGF0ZTogc3RyaW5nOyAvLyBGb3JtYXR0ZWQgZm9yIGRpc3BsYXlcblx0YWlSYXRlOiBudW1iZXI7XG5cdHRvdGFsQWlDaGFyczogbnVtYmVyO1xuXHR0b3RhbFR5cGVkQ2hhcnM6IG51bWJlcjtcblx0aW5saW5lU3VnZ2VzdGlvbnM6IG51bWJlcjtcblx0Y2hhdEVkaXRzOiBudW1iZXI7XG5cdHNlc3Npb25Db3VudDogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBDaGFydFZpZXdNb2RlID0gJ2RheXMnIHwgJ3Nlc3Npb25zJztcblxuZXhwb3J0IGZ1bmN0aW9uIGFnZ3JlZ2F0ZVNlc3Npb25zQnlEYXkoc2Vzc2lvbnM6IHJlYWRvbmx5IElTZXNzaW9uRGF0YVtdKTogSURhaWx5QWdncmVnYXRlW10ge1xuXHRjb25zdCBkYXlNYXAgPSBuZXcgTWFwPHN0cmluZywgSURhaWx5QWdncmVnYXRlPigpO1xuXG5cdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuXHRcdGNvbnN0IGRhdGUgPSBuZXcgRGF0ZShzZXNzaW9uLnN0YXJ0VGltZSk7XG5cdFx0Y29uc3QgaXNvRGF0ZSA9IGRhdGUudG9JU09TdHJpbmcoKS5zcGxpdCgnVCcpWzBdO1xuXHRcdGNvbnN0IGRpc3BsYXlEYXRlID0gZGF0ZS50b0xvY2FsZURhdGVTdHJpbmcodW5kZWZpbmVkLCB7IG1vbnRoOiAnc2hvcnQnLCBkYXk6ICdudW1lcmljJyB9KTtcblxuXHRcdGxldCBhZ2dyZWdhdGUgPSBkYXlNYXAuZ2V0KGlzb0RhdGUpO1xuXHRcdGlmICghYWdncmVnYXRlKSB7XG5cdFx0XHRhZ2dyZWdhdGUgPSB7XG5cdFx0XHRcdGRhdGU6IGlzb0RhdGUsXG5cdFx0XHRcdGRpc3BsYXlEYXRlLFxuXHRcdFx0XHRhaVJhdGU6IDAsXG5cdFx0XHRcdHRvdGFsQWlDaGFyczogMCxcblx0XHRcdFx0dG90YWxUeXBlZENoYXJzOiAwLFxuXHRcdFx0XHRpbmxpbmVTdWdnZXN0aW9uczogMCxcblx0XHRcdFx0Y2hhdEVkaXRzOiAwLFxuXHRcdFx0XHRzZXNzaW9uQ291bnQ6IDAsXG5cdFx0XHR9O1xuXHRcdFx0ZGF5TWFwLnNldChpc29EYXRlLCBhZ2dyZWdhdGUpO1xuXHRcdH1cblxuXHRcdGFnZ3JlZ2F0ZS50b3RhbEFpQ2hhcnMgKz0gc2Vzc2lvbi5haUNoYXJhY3RlcnM7XG5cdFx0YWdncmVnYXRlLnRvdGFsVHlwZWRDaGFycyArPSBzZXNzaW9uLnR5cGVkQ2hhcmFjdGVycztcblx0XHRhZ2dyZWdhdGUuaW5saW5lU3VnZ2VzdGlvbnMgKz0gc2Vzc2lvbi5hY2NlcHRlZElubGluZVN1Z2dlc3Rpb25zID8/IDA7XG5cdFx0YWdncmVnYXRlLmNoYXRFZGl0cyArPSBzZXNzaW9uLmNoYXRFZGl0Q291bnQgPz8gMDtcblx0XHRhZ2dyZWdhdGUuc2Vzc2lvbkNvdW50ICs9IDE7XG5cdH1cblxuXHQvLyBDYWxjdWxhdGUgQUkgcmF0ZSBmb3IgZWFjaCBkYXlcblx0Zm9yIChjb25zdCBhZ2dyZWdhdGUgb2YgZGF5TWFwLnZhbHVlcygpKSB7XG5cdFx0Y29uc3QgdG90YWwgPSBhZ2dyZWdhdGUudG90YWxBaUNoYXJzICsgYWdncmVnYXRlLnRvdGFsVHlwZWRDaGFycztcblx0XHRhZ2dyZWdhdGUuYWlSYXRlID0gdG90YWwgPiAwID8gYWdncmVnYXRlLnRvdGFsQWlDaGFycyAvIHRvdGFsIDogMDtcblx0fVxuXG5cdC8vIFNvcnQgYnkgZGF0ZVxuXHRyZXR1cm4gQXJyYXkuZnJvbShkYXlNYXAudmFsdWVzKCkpLnNvcnQoKGEsIGIpID0+IGEuZGF0ZS5sb2NhbGVDb21wYXJlKGIuZGF0ZSkpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBaVN0YXRzQ2hhcnRPcHRpb25zIHtcblx0c2Vzc2lvbnM6IHJlYWRvbmx5IElTZXNzaW9uRGF0YVtdO1xuXHR2aWV3TW9kZTogQ2hhcnRWaWV3TW9kZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUFpU3RhdHNDaGFydChcblx0b3B0aW9uczogSUFpU3RhdHNDaGFydE9wdGlvbnNcbik6IEhUTUxFbGVtZW50IHtcblx0Y29uc3QgeyBzZXNzaW9uczogc2Vzc2lvbnNEYXRhLCB2aWV3TW9kZTogbW9kZSB9ID0gb3B0aW9ucztcblxuXHRjb25zdCB3aWR0aCA9IDI4MDtcblx0Y29uc3QgaGVpZ2h0ID0gMTAwO1xuXHRjb25zdCBtYXJnaW4gPSB7IHRvcDogMTAsIHJpZ2h0OiAxMCwgYm90dG9tOiAyNSwgbGVmdDogMzAgfTtcblx0Y29uc3QgaW5uZXJXaWR0aCA9IHdpZHRoIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHQ7XG5cdGNvbnN0IGlubmVySGVpZ2h0ID0gaGVpZ2h0IC0gbWFyZ2luLnRvcCAtIG1hcmdpbi5ib3R0b207XG5cblx0Y29uc3QgY29udGFpbmVyID0gJCgnLmFpLXN0YXRzLWNoYXJ0LWNvbnRhaW5lcicpO1xuXHRjb250YWluZXIuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXHRjb250YWluZXIuc3R5bGUubWFyZ2luVG9wID0gJzhweCc7XG5cblx0Y29uc3Qgc3ZnID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKCdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZycsICdzdmcnKTtcblx0c3ZnLnNldEF0dHJpYnV0ZSgnd2lkdGgnLCBgJHt3aWR0aH1weGApO1xuXHRzdmcuc2V0QXR0cmlidXRlKCdoZWlnaHQnLCBgJHtoZWlnaHR9cHhgKTtcblx0c3ZnLnNldEF0dHJpYnV0ZSgndmlld0JveCcsIGAwIDAgJHt3aWR0aH0gJHtoZWlnaHR9YCk7XG5cdHN2Zy5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHN2Zyk7XG5cblx0Y29uc3QgZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAnZycpO1xuXHRnLnNldEF0dHJpYnV0ZSgndHJhbnNmb3JtJywgYHRyYW5zbGF0ZSgke21hcmdpbi5sZWZ0fSwke21hcmdpbi50b3B9KWApO1xuXHRzdmcuYXBwZW5kQ2hpbGQoZyk7XG5cblx0aWYgKHNlc3Npb25zRGF0YS5sZW5ndGggPT09IDApIHtcblx0XHRjb25zdCB0ZXh0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKCdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZycsICd0ZXh0Jyk7XG5cdFx0dGV4dC5zZXRBdHRyaWJ1dGUoJ3gnLCBgJHtpbm5lcldpZHRoIC8gMn1gKTtcblx0XHR0ZXh0LnNldEF0dHJpYnV0ZSgneScsIGAke2lubmVySGVpZ2h0IC8gMn1gKTtcblx0XHR0ZXh0LnNldEF0dHJpYnV0ZSgndGV4dC1hbmNob3InLCAnbWlkZGxlJyk7XG5cdFx0dGV4dC5zZXRBdHRyaWJ1dGUoJ2ZpbGwnLCBhc0Nzc1ZhcmlhYmxlKGNoYXJ0c0ZvcmVncm91bmQpKTtcblx0XHR0ZXh0LnNldEF0dHJpYnV0ZSgnZm9udC1zaXplJywgJzExcHgnKTtcblx0XHR0ZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ25vRGF0YScsIFwiTm8gZGF0YSB5ZXRcIik7XG5cdFx0Zy5hcHBlbmRDaGlsZCh0ZXh0KTtcblx0XHRyZXR1cm4gY29udGFpbmVyO1xuXHR9XG5cblx0Ly8gRHJhdyBheGVzXG5cdGNvbnN0IHhBeGlzTGluZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAnbGluZScpO1xuXHR4QXhpc0xpbmUuc2V0QXR0cmlidXRlKCd4MScsICcwJyk7XG5cdHhBeGlzTGluZS5zZXRBdHRyaWJ1dGUoJ3kxJywgYCR7aW5uZXJIZWlnaHR9YCk7XG5cdHhBeGlzTGluZS5zZXRBdHRyaWJ1dGUoJ3gyJywgYCR7aW5uZXJXaWR0aH1gKTtcblx0eEF4aXNMaW5lLnNldEF0dHJpYnV0ZSgneTInLCBgJHtpbm5lckhlaWdodH1gKTtcblx0eEF4aXNMaW5lLnNldEF0dHJpYnV0ZSgnc3Ryb2tlJywgYXNDc3NWYXJpYWJsZShjaGFydHNMaW5lcykpO1xuXHR4QXhpc0xpbmUuc2V0QXR0cmlidXRlKCdzdHJva2Utd2lkdGgnLCAnMXB4Jyk7XG5cdGcuYXBwZW5kQ2hpbGQoeEF4aXNMaW5lKTtcblxuXHRjb25zdCB5QXhpc0xpbmUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJywgJ2xpbmUnKTtcblx0eUF4aXNMaW5lLnNldEF0dHJpYnV0ZSgneDEnLCAnMCcpO1xuXHR5QXhpc0xpbmUuc2V0QXR0cmlidXRlKCd5MScsICcwJyk7XG5cdHlBeGlzTGluZS5zZXRBdHRyaWJ1dGUoJ3gyJywgJzAnKTtcblx0eUF4aXNMaW5lLnNldEF0dHJpYnV0ZSgneTInLCBgJHtpbm5lckhlaWdodH1gKTtcblx0eUF4aXNMaW5lLnNldEF0dHJpYnV0ZSgnc3Ryb2tlJywgYXNDc3NWYXJpYWJsZShjaGFydHNMaW5lcykpO1xuXHR5QXhpc0xpbmUuc2V0QXR0cmlidXRlKCdzdHJva2Utd2lkdGgnLCAnMXB4Jyk7XG5cdGcuYXBwZW5kQ2hpbGQoeUF4aXNMaW5lKTtcblxuXHQvLyBZLWF4aXMgbGFiZWxzICgwJSwgNTAlLCAxMDAlKVxuXHRmb3IgKGNvbnN0IHBjdCBvZiBbMCwgNTAsIDEwMF0pIHtcblx0XHRjb25zdCB5ID0gaW5uZXJIZWlnaHQgLSAocGN0IC8gMTAwKSAqIGlubmVySGVpZ2h0O1xuXHRcdGNvbnN0IGxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKCdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZycsICd0ZXh0Jyk7XG5cdFx0bGFiZWwuc2V0QXR0cmlidXRlKCd4JywgJy00Jyk7XG5cdFx0bGFiZWwuc2V0QXR0cmlidXRlKCd5JywgYCR7eSArIDN9YCk7XG5cdFx0bGFiZWwuc2V0QXR0cmlidXRlKCd0ZXh0LWFuY2hvcicsICdlbmQnKTtcblx0XHRsYWJlbC5zZXRBdHRyaWJ1dGUoJ2ZpbGwnLCBhc0Nzc1ZhcmlhYmxlKGNoYXJ0c0ZvcmVncm91bmQpKTtcblx0XHRsYWJlbC5zZXRBdHRyaWJ1dGUoJ2ZvbnQtc2l6ZScsICc5cHgnKTtcblx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGAke3BjdH0lYDtcblx0XHRnLmFwcGVuZENoaWxkKGxhYmVsKTtcblxuXHRcdGlmIChwY3QgPiAwKSB7XG5cdFx0XHRjb25zdCBncmlkTGluZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAnbGluZScpO1xuXHRcdFx0Z3JpZExpbmUuc2V0QXR0cmlidXRlKCd4MScsICcwJyk7XG5cdFx0XHRncmlkTGluZS5zZXRBdHRyaWJ1dGUoJ3kxJywgYCR7eX1gKTtcblx0XHRcdGdyaWRMaW5lLnNldEF0dHJpYnV0ZSgneDInLCBgJHtpbm5lcldpZHRofWApO1xuXHRcdFx0Z3JpZExpbmUuc2V0QXR0cmlidXRlKCd5MicsIGAke3l9YCk7XG5cdFx0XHRncmlkTGluZS5zZXRBdHRyaWJ1dGUoJ3N0cm9rZScsIGFzQ3NzVmFyaWFibGUoY2hhcnRzTGluZXMpKTtcblx0XHRcdGdyaWRMaW5lLnNldEF0dHJpYnV0ZSgnc3Ryb2tlLXdpZHRoJywgJzAuNXB4Jyk7XG5cdFx0XHRncmlkTGluZS5zZXRBdHRyaWJ1dGUoJ3N0cm9rZS1kYXNoYXJyYXknLCAnMiwyJyk7XG5cdFx0XHRnLmFwcGVuZENoaWxkKGdyaWRMaW5lKTtcblx0XHR9XG5cdH1cblxuXHRpZiAobW9kZSA9PT0gJ2RheXMnKSB7XG5cdFx0cmVuZGVyRGF5c1ZpZXcoKTtcblx0fSBlbHNlIHtcblx0XHRyZW5kZXJTZXNzaW9uc1ZpZXcoKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHJlbmRlckRheXNWaWV3KCkge1xuXHRcdGNvbnN0IGRhaWx5RGF0YSA9IGFnZ3JlZ2F0ZVNlc3Npb25zQnlEYXkoc2Vzc2lvbnNEYXRhKTtcblx0XHRjb25zdCBiYXJDb3VudCA9IGRhaWx5RGF0YS5sZW5ndGg7XG5cdFx0Y29uc3QgYmFyV2lkdGggPSBNYXRoLm1pbigyMCwgKGlubmVyV2lkdGggLSAoYmFyQ291bnQgLSAxKSAqIDIpIC8gYmFyQ291bnQpO1xuXHRcdGNvbnN0IGdhcCA9IDI7XG5cdFx0Y29uc3QgdG90YWxCYXJTcGFjZSA9IGJhckNvdW50ICogYmFyV2lkdGggKyAoYmFyQ291bnQgLSAxKSAqIGdhcDtcblx0XHRjb25zdCBzdGFydFggPSAoaW5uZXJXaWR0aCAtIHRvdGFsQmFyU3BhY2UpIC8gMjtcblxuXHRcdC8vIENhbGN1bGF0ZSB3aGljaCBsYWJlbHMgdG8gc2hvdyBiYXNlZCBvbiBhdmFpbGFibGUgc3BhY2Vcblx0XHQvLyBFYWNoIGxhYmVsIG5lZWRzIHJvdWdobHkgNDBweCBvZiBzcGFjZSB0byBub3Qgb3ZlcmxhcFxuXHRcdGNvbnN0IG1pbkxhYmVsU3BhY2luZyA9IDQwO1xuXHRcdGNvbnN0IHRvdGFsV2lkdGggPSB0b3RhbEJhclNwYWNlO1xuXHRcdGNvbnN0IG1heExhYmVscyA9IE1hdGgubWF4KDIsIE1hdGguZmxvb3IodG90YWxXaWR0aCAvIG1pbkxhYmVsU3BhY2luZykpO1xuXHRcdGNvbnN0IGxhYmVsU3RlcCA9IE1hdGgubWF4KDEsIE1hdGguY2VpbChiYXJDb3VudCAvIG1heExhYmVscykpO1xuXG5cdFx0ZGFpbHlEYXRhLmZvckVhY2goKGRheSwgaSkgPT4ge1xuXHRcdFx0Y29uc3QgeCA9IHN0YXJ0WCArIGkgKiAoYmFyV2lkdGggKyBnYXApO1xuXHRcdFx0Y29uc3QgYmFySGVpZ2h0ID0gZGF5LmFpUmF0ZSAqIGlubmVySGVpZ2h0O1xuXHRcdFx0Y29uc3QgeSA9IGlubmVySGVpZ2h0IC0gYmFySGVpZ2h0O1xuXG5cdFx0XHQvLyBCYXIgZm9yIEFJIHJhdGVcblx0XHRcdGNvbnN0IHJlY3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJywgJ3JlY3QnKTtcblx0XHRcdHJlY3Quc2V0QXR0cmlidXRlKCd4JywgYCR7eH1gKTtcblx0XHRcdHJlY3Quc2V0QXR0cmlidXRlKCd5JywgYCR7eX1gKTtcblx0XHRcdHJlY3Quc2V0QXR0cmlidXRlKCd3aWR0aCcsIGAke2JhcldpZHRofWApO1xuXHRcdFx0cmVjdC5zZXRBdHRyaWJ1dGUoJ2hlaWdodCcsIGAke01hdGgubWF4KDEsIGJhckhlaWdodCl9YCk7XG5cdFx0XHRyZWN0LnNldEF0dHJpYnV0ZSgnZmlsbCcsIGFzQ3NzVmFyaWFibGUoY2hhcnRzQmx1ZSkpO1xuXHRcdFx0cmVjdC5zZXRBdHRyaWJ1dGUoJ3J4JywgJzInKTtcblx0XHRcdGcuYXBwZW5kQ2hpbGQocmVjdCk7XG5cblx0XHRcdC8vIFgtYXhpcyBsYWJlbCAtIG9ubHkgc2hvdyBhdCBjYWxjdWxhdGVkIGludGVydmFscyB0byBhdm9pZCBvdmVybGFwXG5cdFx0XHRjb25zdCBpc0ZpcnN0ID0gaSA9PT0gMDtcblx0XHRcdGNvbnN0IGlzTGFzdCA9IGkgPT09IGJhckNvdW50IC0gMTtcblx0XHRcdGNvbnN0IGlzQXRJbnRlcnZhbCA9IGkgJSBsYWJlbFN0ZXAgPT09IDA7XG5cblx0XHRcdGlmIChpc0ZpcnN0IHx8IGlzTGFzdCB8fCAoaXNBdEludGVydmFsICYmIGJhckNvdW50ID4gMikpIHtcblx0XHRcdFx0Ly8gU2tpcCBtaWRkbGUgbGFiZWxzIGlmIHRoZXkgd291bGQgYmUgdG9vIGNsb3NlIHRvIGZpcnN0L2xhc3Rcblx0XHRcdFx0aWYgKCFpc0ZpcnN0ICYmICFpc0xhc3QpIHtcblx0XHRcdFx0XHRjb25zdCBkaXN0RnJvbUZpcnN0ID0gaSAqIChiYXJXaWR0aCArIGdhcCk7XG5cdFx0XHRcdFx0Y29uc3QgZGlzdEZyb21MYXN0ID0gKGJhckNvdW50IC0gMSAtIGkpICogKGJhcldpZHRoICsgZ2FwKTtcblx0XHRcdFx0XHRpZiAoZGlzdEZyb21GaXJzdCA8IG1pbkxhYmVsU3BhY2luZyB8fCBkaXN0RnJvbUxhc3QgPCBtaW5MYWJlbFNwYWNpbmcpIHtcblx0XHRcdFx0XHRcdHJldHVybjsgLy8gU2tpcCB0aGlzIGxhYmVsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJywgJ3RleHQnKTtcblx0XHRcdFx0bGFiZWwuc2V0QXR0cmlidXRlKCd4JywgYCR7eCArIGJhcldpZHRoIC8gMn1gKTtcblx0XHRcdFx0bGFiZWwuc2V0QXR0cmlidXRlKCd5JywgYCR7aW5uZXJIZWlnaHQgKyAxMn1gKTtcblx0XHRcdFx0bGFiZWwuc2V0QXR0cmlidXRlKCd0ZXh0LWFuY2hvcicsICdtaWRkbGUnKTtcblx0XHRcdFx0bGFiZWwuc2V0QXR0cmlidXRlKCdmaWxsJywgYXNDc3NWYXJpYWJsZShjaGFydHNGb3JlZ3JvdW5kKSk7XG5cdFx0XHRcdGxhYmVsLnNldEF0dHJpYnV0ZSgnZm9udC1zaXplJywgJzhweCcpO1xuXHRcdFx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGRheS5kaXNwbGF5RGF0ZTtcblx0XHRcdFx0Zy5hcHBlbmRDaGlsZChsYWJlbCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiByZW5kZXJTZXNzaW9uc1ZpZXcoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbkNvdW50ID0gc2Vzc2lvbnNEYXRhLmxlbmd0aDtcblx0XHRjb25zdCBiYXJXaWR0aCA9IE1hdGgubWluKDgsIChpbm5lcldpZHRoIC0gKHNlc3Npb25Db3VudCAtIDEpICogMSkgLyBzZXNzaW9uQ291bnQpO1xuXHRcdGNvbnN0IGdhcCA9IDE7XG5cdFx0Y29uc3QgdG90YWxCYXJTcGFjZSA9IHNlc3Npb25Db3VudCAqIGJhcldpZHRoICsgKHNlc3Npb25Db3VudCAtIDEpICogZ2FwO1xuXHRcdGNvbnN0IHN0YXJ0WCA9IChpbm5lcldpZHRoIC0gdG90YWxCYXJTcGFjZSkgLyAyO1xuXG5cdFx0c2Vzc2lvbnNEYXRhLmZvckVhY2goKHNlc3Npb24sIGkpID0+IHtcblx0XHRcdGNvbnN0IHRvdGFsID0gc2Vzc2lvbi5haUNoYXJhY3RlcnMgKyBzZXNzaW9uLnR5cGVkQ2hhcmFjdGVycztcblx0XHRcdGNvbnN0IGFpUmF0ZSA9IHRvdGFsID4gMCA/IHNlc3Npb24uYWlDaGFyYWN0ZXJzIC8gdG90YWwgOiAwO1xuXHRcdFx0Y29uc3QgeCA9IHN0YXJ0WCArIGkgKiAoYmFyV2lkdGggKyBnYXApO1xuXHRcdFx0Y29uc3QgYmFySGVpZ2h0ID0gYWlSYXRlICogaW5uZXJIZWlnaHQ7XG5cdFx0XHRjb25zdCB5ID0gaW5uZXJIZWlnaHQgLSBiYXJIZWlnaHQ7XG5cblx0XHRcdC8vIEJhciBmb3IgQUkgcmF0ZVxuXHRcdFx0Y29uc3QgcmVjdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAncmVjdCcpO1xuXHRcdFx0cmVjdC5zZXRBdHRyaWJ1dGUoJ3gnLCBgJHt4fWApO1xuXHRcdFx0cmVjdC5zZXRBdHRyaWJ1dGUoJ3knLCBgJHt5fWApO1xuXHRcdFx0cmVjdC5zZXRBdHRyaWJ1dGUoJ3dpZHRoJywgYCR7YmFyV2lkdGh9YCk7XG5cdFx0XHRyZWN0LnNldEF0dHJpYnV0ZSgnaGVpZ2h0JywgYCR7TWF0aC5tYXgoMSwgYmFySGVpZ2h0KX1gKTtcblx0XHRcdHJlY3Quc2V0QXR0cmlidXRlKCdmaWxsJywgYXNDc3NWYXJpYWJsZShjaGFydHNCbHVlKSk7XG5cdFx0XHRyZWN0LnNldEF0dHJpYnV0ZSgncngnLCAnMScpO1xuXHRcdFx0Zy5hcHBlbmRDaGlsZChyZWN0KTtcblx0XHR9KTtcblxuXHRcdC8vIFgtYXhpcyBsYWJlbHM6IG9ubHkgc2hvdyBmaXJzdCBhbmQgbGFzdCB0byBhdm9pZCBvdmVybGFwXG5cdFx0Ly8gRWFjaCBsYWJlbCBpcyByb3VnaGx5IDQwcHggd2lkZSAoZS5nLiwgXCJKYW4gMTVcIilcblx0XHRjb25zdCBtaW5MYWJlbFNwYWNpbmcgPSA0MDtcblxuXHRcdGlmIChzZXNzaW9uQ291bnQgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBBbHdheXMgc2hvdyBmaXJzdCBsYWJlbFxuXHRcdGNvbnN0IGZpcnN0U2Vzc2lvbiA9IHNlc3Npb25zRGF0YVswXTtcblx0XHRjb25zdCBmaXJzdFggPSBzdGFydFg7XG5cdFx0Y29uc3QgZmlyc3REYXRlID0gbmV3IERhdGUoZmlyc3RTZXNzaW9uLnN0YXJ0VGltZSk7XG5cdFx0Y29uc3QgZmlyc3RMYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAndGV4dCcpO1xuXHRcdGZpcnN0TGFiZWwuc2V0QXR0cmlidXRlKCd4JywgYCR7Zmlyc3RYICsgYmFyV2lkdGggLyAyfWApO1xuXHRcdGZpcnN0TGFiZWwuc2V0QXR0cmlidXRlKCd5JywgYCR7aW5uZXJIZWlnaHQgKyAxMn1gKTtcblx0XHRmaXJzdExhYmVsLnNldEF0dHJpYnV0ZSgndGV4dC1hbmNob3InLCAnc3RhcnQnKTtcblx0XHRmaXJzdExhYmVsLnNldEF0dHJpYnV0ZSgnZmlsbCcsIGFzQ3NzVmFyaWFibGUoY2hhcnRzRm9yZWdyb3VuZCkpO1xuXHRcdGZpcnN0TGFiZWwuc2V0QXR0cmlidXRlKCdmb250LXNpemUnLCAnOHB4Jyk7XG5cdFx0Zmlyc3RMYWJlbC50ZXh0Q29udGVudCA9IGZpcnN0RGF0ZS50b0xvY2FsZURhdGVTdHJpbmcodW5kZWZpbmVkLCB7IG1vbnRoOiAnc2hvcnQnLCBkYXk6ICdudW1lcmljJyB9KTtcblx0XHRnLmFwcGVuZENoaWxkKGZpcnN0TGFiZWwpO1xuXG5cdFx0Ly8gU2hvdyBsYXN0IGxhYmVsIGlmIHRoZXJlJ3MgZW5vdWdoIHNwYWNlIGFuZCBtb3JlIHRoYW4gMSBzZXNzaW9uXG5cdFx0aWYgKHNlc3Npb25Db3VudCA+IDEgJiYgdG90YWxCYXJTcGFjZSA+PSBtaW5MYWJlbFNwYWNpbmcpIHtcblx0XHRcdGNvbnN0IGxhc3RTZXNzaW9uID0gc2Vzc2lvbnNEYXRhW3Nlc3Npb25Db3VudCAtIDFdO1xuXHRcdFx0Y29uc3QgbGFzdFggPSBzdGFydFggKyAoc2Vzc2lvbkNvdW50IC0gMSkgKiAoYmFyV2lkdGggKyBnYXApO1xuXHRcdFx0Y29uc3QgbGFzdERhdGUgPSBuZXcgRGF0ZShsYXN0U2Vzc2lvbi5zdGFydFRpbWUpO1xuXHRcdFx0Y29uc3QgbGFzdExhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKCdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZycsICd0ZXh0Jyk7XG5cdFx0XHRsYXN0TGFiZWwuc2V0QXR0cmlidXRlKCd4JywgYCR7bGFzdFggKyBiYXJXaWR0aCAvIDJ9YCk7XG5cdFx0XHRsYXN0TGFiZWwuc2V0QXR0cmlidXRlKCd5JywgYCR7aW5uZXJIZWlnaHQgKyAxMn1gKTtcblx0XHRcdGxhc3RMYWJlbC5zZXRBdHRyaWJ1dGUoJ3RleHQtYW5jaG9yJywgJ2VuZCcpO1xuXHRcdFx0bGFzdExhYmVsLnNldEF0dHJpYnV0ZSgnZmlsbCcsIGFzQ3NzVmFyaWFibGUoY2hhcnRzRm9yZWdyb3VuZCkpO1xuXHRcdFx0bGFzdExhYmVsLnNldEF0dHJpYnV0ZSgnZm9udC1zaXplJywgJzhweCcpO1xuXHRcdFx0bGFzdExhYmVsLnRleHRDb250ZW50ID0gbGFzdERhdGUudG9Mb2NhbGVEYXRlU3RyaW5nKHVuZGVmaW5lZCwgeyBtb250aDogJ3Nob3J0JywgZGF5OiAnbnVtZXJpYycgfSk7XG5cdFx0XHRnLmFwcGVuZENoaWxkKGxhc3RMYWJlbCk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGNvbnRhaW5lcjtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsU0FBUztBQUNsQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLFlBQVksa0JB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
