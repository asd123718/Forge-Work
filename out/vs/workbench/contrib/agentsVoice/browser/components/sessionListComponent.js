import * as dom from "../../../../../base/browser/dom.js";
import { localize } from "../../../../../nls.js";
import { FONT_SIZE, addKeyboardActivation } from "./tokens.js";
function getSessionListNavigationIndex(index, direction, count) {
  if (count === 0) {
    return void 0;
  }
  const delta = direction === "up" ? -1 : 1;
  return (index + delta + count) % count;
}
function hoverIcon(className, ariaLabel) {
  const el = dom.$(`span.codicon.${className}`);
  el.role = "button";
  el.tabIndex = 0;
  el.ariaLabel = ariaLabel;
  el.style.cssText = `font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);cursor:pointer;-webkit-app-region:no-drag;padding:1px;`;
  el.addEventListener("mouseenter", () => {
    el.style.color = "var(--vscode-foreground)";
  });
  el.addEventListener("mouseleave", () => {
    el.style.color = "var(--vscode-descriptionForeground)";
  });
  addKeyboardActivation(el);
  return el;
}
function createSessionRow(session, props) {
  const isSelected = props.selectedTarget?.toString() === session.resource.toString();
  const dotColor = session.needsInput ? "var(--vscode-editorWarning-foreground)" : session.isActive ? "var(--vscode-charts-green)" : "var(--vscode-editorWhitespace-foreground)";
  const effectiveDotColor = session.isSpeaking ? "var(--vscode-agentsVoice-speakingForeground)" : dotColor;
  const shouldPulse = session.isActive || session.isSpeaking;
  const labelColor = session.isSpeaking ? "var(--vscode-agentsVoice-speakingForeground)" : session.isIdle ? "var(--vscode-descriptionForeground)" : "var(--vscode-foreground)";
  const labelWeight = session.isSpeaking ? "500" : "normal";
  const rowBg = isSelected ? "background:var(--vscode-list-activeSelectionBackground);border-radius:4px;" : "";
  const rowLabelColor = isSelected ? "var(--vscode-list-activeSelectionForeground)" : labelColor;
  const row = dom.$("div");
  row.role = "option";
  row.tabIndex = 0;
  row.ariaLabel = session.label || "Untitled session";
  row.setAttribute("aria-selected", String(isSelected));
  row.style.cssText = `display:flex;align-items:center;gap:6px;height:28px;padding:0 4px;border-bottom:1px solid var(--vscode-editorGroup-border);flex-shrink:0;cursor:pointer;${rowBg}`;
  row.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSelected) {
      props.onSelectTarget(void 0);
    } else {
      props.onSelectTarget(session.resource);
    }
  });
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      row.click();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const container = row.parentElement?.parentElement;
      const rows = Array.from(container?.children ?? []).map((child) => child.firstElementChild).filter((child) => dom.isHTMLElement(child) && child.role === "option");
      const nextIndex = getSessionListNavigationIndex(rows.indexOf(row), e.key === "ArrowUp" ? "up" : "down", rows.length);
      if (nextIndex !== void 0) {
        rows[nextIndex].focus();
        if (rows[nextIndex].getAttribute("aria-selected") !== "true") {
          rows[nextIndex].click();
        }
      }
    }
  });
  const showActions = () => {
    if (stats) {
      stats.style.display = "none";
    }
    if (actions) {
      actions.style.display = "flex";
    }
  };
  const hideActions = () => {
    if (stats) {
      stats.style.display = "flex";
    }
    if (actions) {
      actions.style.display = "none";
    }
  };
  row.addEventListener("mouseenter", showActions);
  row.addEventListener("mouseleave", hideActions);
  row.addEventListener("focusin", showActions);
  row.addEventListener("focusout", (e) => {
    if (!row.contains(e.relatedTarget)) {
      hideActions();
    }
  });
  if (isSelected) {
    const check = dom.$("span.codicon.codicon-check");
    check.style.cssText = `font-size:10px;color:${rowLabelColor};flex-shrink:0;`;
    row.append(check);
  } else {
    const dot = dom.$("span");
    dot.style.cssText = `width:7px;height:7px;border-radius:50%;background:${effectiveDotColor};flex-shrink:0;${shouldPulse ? "animation:agents-voice-pulse 1.4s ease-in-out infinite;" : ""}`;
    row.append(dot);
  }
  const label = dom.$("span");
  label.style.cssText = `font-size:${FONT_SIZE.body};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${rowLabelColor};font-weight:${labelWeight};`;
  label.textContent = session.label || "Untitled session";
  row.append(label);
  const actionsContainer = dom.$("div");
  actionsContainer.style.cssText = "display:flex;align-items:center;gap:4px;flex-shrink:0;";
  const stats = dom.$("span");
  stats.setAttribute("data-role", "stats");
  stats.style.cssText = `display:flex;gap:4px;font-size:${FONT_SIZE.body};`;
  if (session.insertions > 0) {
    const ins = dom.$("span");
    ins.style.color = "var(--vscode-charts-green)";
    ins.textContent = `+${session.insertions}`;
    stats.append(ins);
  }
  if (session.deletions > 0) {
    const del = dom.$("span");
    del.style.color = "var(--vscode-editorError-foreground)";
    del.textContent = `-${session.deletions}`;
    stats.append(del);
  }
  const actions = dom.$("span");
  actions.setAttribute("data-role", "actions");
  actions.style.cssText = "display:none;gap:4px;align-items:center;";
  if (!session.isIdle) {
    const stopBtn = hoverIcon("codicon-debug-stop", localize("agentsVoice.stopSessionAction", "Stop session"));
    stopBtn.addEventListener("mouseenter", () => {
      stopBtn.style.color = "var(--vscode-editorError-foreground)";
    });
    stopBtn.addEventListener("mouseleave", () => {
      stopBtn.style.color = "var(--vscode-descriptionForeground)";
    });
    stopBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      props.onStopSession(session.resource);
    });
    actions.append(stopBtn);
  }
  actionsContainer.append(stats, actions);
  row.append(actionsContainer);
  const wrapper = dom.$("div");
  wrapper.append(row);
  if (session.toolConfirmation) {
    const tc = session.toolConfirmation;
    const confRow = dom.$("div");
    confRow.style.cssText = "display:flex;flex-direction:column;gap:3px;padding:2px 2px 6px 15px;border-bottom:1px solid var(--vscode-panel-border);";
    const confDesc = dom.$("span");
    confDesc.style.cssText = `font-size:${FONT_SIZE.body};color:var(--vscode-editorWarning-foreground);`;
    confDesc.textContent = tc.description;
    const confBtns = dom.$("div");
    confBtns.style.cssText = "display:flex;gap:6px;";
    const btnStyle = `-webkit-app-region:no-drag;border:none;color:var(--vscode-button-foreground);font-size:${FONT_SIZE.body};padding:2px 8px;border-radius:3px;cursor:pointer;`;
    if (tc.type === "approval") {
      const approveBtn = dom.$("button");
      approveBtn.style.cssText = `${btnStyle}background:var(--vscode-charts-green);`;
      approveBtn.textContent = localize("agentsVoice.approve", "Approve");
      approveBtn.addEventListener("click", () => tc.approve());
      const denyBtn = dom.$("button");
      denyBtn.style.cssText = `${btnStyle}background:var(--vscode-button-secondaryBackground);color:var(--vscode-foreground);`;
      denyBtn.textContent = localize("agentsVoice.deny", "Deny");
      denyBtn.addEventListener("click", () => tc.deny());
      const stopBtn = dom.$("button");
      stopBtn.style.cssText = `${btnStyle}background:var(--vscode-button-secondaryBackground);color:var(--vscode-foreground);`;
      stopBtn.textContent = localize("agentsVoice.stop", "Stop");
      stopBtn.addEventListener("click", () => props.onCancelSession(session.resource));
      confBtns.append(approveBtn, denyBtn, stopBtn);
    } else {
      const openInVSCode = dom.$("button");
      openInVSCode.style.cssText = `${btnStyle}background:var(--vscode-button-background);`;
      openInVSCode.textContent = localize("agentsVoice.openInVSCode", "Open in VS Code");
      openInVSCode.addEventListener("click", () => props.onOpenSession(session.resource));
      confBtns.append(openInVSCode);
    }
    confRow.append(confDesc, confBtns);
    wrapper.append(confRow);
  }
  return wrapper;
}
function createSessionList() {
  const container = dom.$("div.voice-session-list");
  container.style.cssText = "display:flex;flex-direction:column;min-height:84px;max-height:320px;overflow-y:auto;margin:0 -14px 0 0;padding-right:8px;";
  const style = dom.$("style");
  style.textContent = `
		@keyframes agents-voice-pulse{0%,100%{opacity:1}50%{opacity:0.4}}
		.voice-session-list::-webkit-scrollbar{width:6px;background:transparent;}
		.voice-session-list::-webkit-scrollbar-thumb{background:var(--vscode-scrollbarSlider-activeBackground);border-radius:3px;}
		.voice-session-list::-webkit-scrollbar-thumb:hover{background:var(--vscode-scrollbarSlider-activeBackground);}
		.voice-session-list > div:last-of-type{border-bottom:none !important;}
	`;
  return {
    element: container,
    update(props) {
      dom.clearNode(container);
      const hasGroups = props.groups && props.groups.length > 0;
      const hasSessions = props.sessions.length > 0;
      const headerRow = dom.$("div");
      headerRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:2px 2px 4px;border-bottom:1px solid var(--vscode-editorGroup-border);";
      const headerLabel = dom.$("span");
      headerLabel.style.cssText = `font-size:${FONT_SIZE.micro};color:var(--vscode-disabledForeground);text-transform:uppercase;letter-spacing:0.5px;font-weight:500;`;
      headerLabel.textContent = props.selectedTarget ? localize("agentsVoice.sendTo", "Send to") : localize("agentsVoice.sendToActive", "Send to (active)");
      const addBtn = hoverIcon("codicon-add", localize("agentsVoice.newSession", "New session"));
      addBtn.title = localize("agentsVoice.newSession", "New session");
      addBtn.style.cssText += "padding:1px 2px;";
      addBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        props.onNewSession();
      });
      headerRow.append(headerLabel, addBtn);
      container.append(headerRow);
      if (!hasGroups && !hasSessions) {
        const empty = dom.$("div");
        empty.style.cssText = "display:flex;align-items:center;justify-content:center;height:60px;";
        const emptyText = dom.$("span");
        emptyText.style.cssText = `font-size:${FONT_SIZE.body};color:var(--vscode-foreground);`;
        emptyText.textContent = localize("agentsVoice.noActiveSessions", "No active sessions");
        empty.append(emptyText);
        container.append(empty);
      } else if (hasGroups) {
        for (const group of props.groups) {
          const groupHeader = dom.$("div");
          groupHeader.style.cssText = "padding:4px 2px 2px;";
          const groupLabel = dom.$("span");
          groupLabel.style.cssText = `font-size:${FONT_SIZE.micro};color:var(--vscode-disabledForeground);text-transform:uppercase;letter-spacing:0.5px;font-weight:500;`;
          groupLabel.textContent = group.label;
          groupHeader.append(groupLabel);
          container.append(groupHeader);
          for (const session of group.sessions) {
            container.append(createSessionRow(session, props));
          }
        }
      } else {
        for (const session of props.sessions) {
          container.append(createSessionRow(session, props));
        }
      }
      container.append(style);
    }
  };
}
export {
  createSessionList,
  getSessionListNavigationIndex
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGFnZW50c1ZvaWNlXFxicm93c2VyXFxjb21wb25lbnRzXFxzZXNzaW9uTGlzdENvbXBvbmVudC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB0eXBlIHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB0eXBlIHsgSVBlbmRpbmdUb29sQ29uZmlybWF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgRk9OVF9TSVpFLCBhZGRLZXlib2FyZEFjdGl2YXRpb24gfSBmcm9tICcuL3Rva2Vucy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2Vzc2lvblJvd0RhdGEge1xuXHRyZWFkb25seSByZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBpc0FjdGl2ZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgbmVlZHNJbnB1dDogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNJZGxlOiBib29sZWFuO1xuXHRyZWFkb25seSBpc1NwZWFraW5nOiBib29sZWFuO1xuXHRyZWFkb25seSBpbnNlcnRpb25zOiBudW1iZXI7XG5cdHJlYWRvbmx5IGRlbGV0aW9uczogbnVtYmVyO1xuXHRyZWFkb25seSB0b29sQ29uZmlybWF0aW9uOiBJUGVuZGluZ1Rvb2xDb25maXJtYXRpb24gfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2Vzc2lvbkdyb3VwRGF0YSB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlc3Npb25zOiByZWFkb25seSBTZXNzaW9uUm93RGF0YVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNlc3Npb25MaXN0UHJvcHMge1xuXHRyZWFkb25seSBzZXNzaW9uczogcmVhZG9ubHkgU2Vzc2lvblJvd0RhdGFbXTtcblx0cmVhZG9ubHkgZ3JvdXBzPzogcmVhZG9ubHkgU2Vzc2lvbkdyb3VwRGF0YVtdO1xuXHRyZWFkb25seSBzZWxlY3RlZFRhcmdldD86IFVSSTtcblx0cmVhZG9ubHkgb25PcGVuU2Vzc2lvbjogKHJlc291cmNlOiBVUkkpID0+IHZvaWQ7XG5cdHJlYWRvbmx5IG9uU3RvcFNlc3Npb246IChyZXNvdXJjZTogVVJJKSA9PiB2b2lkO1xuXHRyZWFkb25seSBvbkNhbmNlbFNlc3Npb246IChyZXNvdXJjZTogVVJJKSA9PiB2b2lkO1xuXHRyZWFkb25seSBvblNlbGVjdFRhcmdldDogKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpID0+IHZvaWQ7XG5cdHJlYWRvbmx5IG9uTmV3U2Vzc2lvbjogKCkgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFNlc3Npb25MaXN0TmF2aWdhdGlvbkluZGV4KGluZGV4OiBudW1iZXIsIGRpcmVjdGlvbjogJ3VwJyB8ICdkb3duJywgY291bnQ6IG51bWJlcik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdGlmIChjb3VudCA9PT0gMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgZGVsdGEgPSBkaXJlY3Rpb24gPT09ICd1cCcgPyAtMSA6IDE7XG5cdHJldHVybiAoaW5kZXggKyBkZWx0YSArIGNvdW50KSAlIGNvdW50O1xufVxuXG5mdW5jdGlvbiBob3Zlckljb24oY2xhc3NOYW1lOiBzdHJpbmcsIGFyaWFMYWJlbDogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xuXHRjb25zdCBlbCA9IGRvbS4kKGBzcGFuLmNvZGljb24uJHtjbGFzc05hbWV9YCk7XG5cdGVsLnJvbGUgPSAnYnV0dG9uJztcblx0ZWwudGFiSW5kZXggPSAwO1xuXHRlbC5hcmlhTGFiZWwgPSBhcmlhTGFiZWw7XG5cdGVsLnN0eWxlLmNzc1RleHQgPSBgZm9udC1zaXplOiR7Rk9OVF9TSVpFLmljb25TbX07Y29sb3I6dmFyKC0tdnNjb2RlLWRlc2NyaXB0aW9uRm9yZWdyb3VuZCk7Y3Vyc29yOnBvaW50ZXI7LXdlYmtpdC1hcHAtcmVnaW9uOm5vLWRyYWc7cGFkZGluZzoxcHg7YDtcblx0ZWwuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsICgpID0+IHsgZWwuc3R5bGUuY29sb3IgPSAndmFyKC0tdnNjb2RlLWZvcmVncm91bmQpJzsgfSk7XG5cdGVsLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB7IGVsLnN0eWxlLmNvbG9yID0gJ3ZhcigtLXZzY29kZS1kZXNjcmlwdGlvbkZvcmVncm91bmQpJzsgfSk7XG5cdGFkZEtleWJvYXJkQWN0aXZhdGlvbihlbCk7XG5cdHJldHVybiBlbDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlU2Vzc2lvblJvdyhzZXNzaW9uOiBTZXNzaW9uUm93RGF0YSwgcHJvcHM6IFNlc3Npb25MaXN0UHJvcHMpOiBIVE1MRWxlbWVudCB7XG5cdGNvbnN0IGlzU2VsZWN0ZWQgPSBwcm9wcy5zZWxlY3RlZFRhcmdldD8udG9TdHJpbmcoKSA9PT0gc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpO1xuXHRjb25zdCBkb3RDb2xvciA9IHNlc3Npb24ubmVlZHNJbnB1dCA/ICd2YXIoLS12c2NvZGUtZWRpdG9yV2FybmluZy1mb3JlZ3JvdW5kKSdcblx0XHQ6IHNlc3Npb24uaXNBY3RpdmUgPyAndmFyKC0tdnNjb2RlLWNoYXJ0cy1ncmVlbiknXG5cdFx0XHQ6ICd2YXIoLS12c2NvZGUtZWRpdG9yV2hpdGVzcGFjZS1mb3JlZ3JvdW5kKSc7XG5cdGNvbnN0IGVmZmVjdGl2ZURvdENvbG9yID0gc2Vzc2lvbi5pc1NwZWFraW5nID8gJ3ZhcigtLXZzY29kZS1hZ2VudHNWb2ljZS1zcGVha2luZ0ZvcmVncm91bmQpJyA6IGRvdENvbG9yO1xuXHRjb25zdCBzaG91bGRQdWxzZSA9IHNlc3Npb24uaXNBY3RpdmUgfHwgc2Vzc2lvbi5pc1NwZWFraW5nO1xuXG5cdGNvbnN0IGxhYmVsQ29sb3IgPSBzZXNzaW9uLmlzU3BlYWtpbmcgPyAndmFyKC0tdnNjb2RlLWFnZW50c1ZvaWNlLXNwZWFraW5nRm9yZWdyb3VuZCknXG5cdFx0OiBzZXNzaW9uLmlzSWRsZSA/ICd2YXIoLS12c2NvZGUtZGVzY3JpcHRpb25Gb3JlZ3JvdW5kKSdcblx0XHRcdDogJ3ZhcigtLXZzY29kZS1mb3JlZ3JvdW5kKSc7XG5cdGNvbnN0IGxhYmVsV2VpZ2h0ID0gc2Vzc2lvbi5pc1NwZWFraW5nID8gJzUwMCcgOiAnbm9ybWFsJztcblx0Y29uc3Qgcm93QmcgPSBpc1NlbGVjdGVkID8gJ2JhY2tncm91bmQ6dmFyKC0tdnNjb2RlLWxpc3QtYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCk7Ym9yZGVyLXJhZGl1czo0cHg7JyA6ICcnO1xuXHRjb25zdCByb3dMYWJlbENvbG9yID0gaXNTZWxlY3RlZCA/ICd2YXIoLS12c2NvZGUtbGlzdC1hY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kKScgOiBsYWJlbENvbG9yO1xuXG5cdGNvbnN0IHJvdyA9IGRvbS4kKCdkaXYnKTtcblx0cm93LnJvbGUgPSAnb3B0aW9uJztcblx0cm93LnRhYkluZGV4ID0gMDtcblx0cm93LmFyaWFMYWJlbCA9IHNlc3Npb24ubGFiZWwgfHwgJ1VudGl0bGVkIHNlc3Npb24nO1xuXHRyb3cuc2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJywgU3RyaW5nKGlzU2VsZWN0ZWQpKTtcblx0cm93LnN0eWxlLmNzc1RleHQgPSBgZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2hlaWdodDoyOHB4O3BhZGRpbmc6MCA0cHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tdnNjb2RlLWVkaXRvckdyb3VwLWJvcmRlcik7ZmxleC1zaHJpbms6MDtjdXJzb3I6cG9pbnRlcjske3Jvd0JnfWA7XG5cblx0cm93LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcblx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRpZiAoaXNTZWxlY3RlZCkge1xuXHRcdFx0cHJvcHMub25TZWxlY3RUYXJnZXQodW5kZWZpbmVkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cHJvcHMub25TZWxlY3RUYXJnZXQoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0fVxuXHR9KTtcblx0cm93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZSkgPT4ge1xuXHRcdGlmIChlLmtleSA9PT0gJ0VudGVyJyB8fCBlLmtleSA9PT0gJyAnKSB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRyb3cuY2xpY2soKTtcblx0XHR9IGVsc2UgaWYgKGUua2V5ID09PSAnQXJyb3dVcCcgfHwgZS5rZXkgPT09ICdBcnJvd0Rvd24nKSB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRjb25zdCBjb250YWluZXIgPSByb3cucGFyZW50RWxlbWVudD8ucGFyZW50RWxlbWVudDtcblx0XHRcdGNvbnN0IHJvd3MgPSBBcnJheS5mcm9tKGNvbnRhaW5lcj8uY2hpbGRyZW4gPz8gW10pXG5cdFx0XHRcdC5tYXAoY2hpbGQgPT4gY2hpbGQuZmlyc3RFbGVtZW50Q2hpbGQpXG5cdFx0XHRcdC5maWx0ZXIoKGNoaWxkKTogY2hpbGQgaXMgSFRNTEVsZW1lbnQgPT4gZG9tLmlzSFRNTEVsZW1lbnQoY2hpbGQpICYmIGNoaWxkLnJvbGUgPT09ICdvcHRpb24nKTtcblx0XHRcdGNvbnN0IG5leHRJbmRleCA9IGdldFNlc3Npb25MaXN0TmF2aWdhdGlvbkluZGV4KHJvd3MuaW5kZXhPZihyb3cpLCBlLmtleSA9PT0gJ0Fycm93VXAnID8gJ3VwJyA6ICdkb3duJywgcm93cy5sZW5ndGgpO1xuXHRcdFx0aWYgKG5leHRJbmRleCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJvd3NbbmV4dEluZGV4XS5mb2N1cygpO1xuXHRcdFx0XHRpZiAocm93c1tuZXh0SW5kZXhdLmdldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcpICE9PSAndHJ1ZScpIHtcblx0XHRcdFx0XHRyb3dzW25leHRJbmRleF0uY2xpY2soKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0Y29uc3Qgc2hvd0FjdGlvbnMgPSAoKSA9PiB7XG5cdFx0aWYgKHN0YXRzKSB7IHN0YXRzLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7IH1cblx0XHRpZiAoYWN0aW9ucykgeyBhY3Rpb25zLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7IH1cblx0fTtcblx0Y29uc3QgaGlkZUFjdGlvbnMgPSAoKSA9PiB7XG5cdFx0aWYgKHN0YXRzKSB7IHN0YXRzLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7IH1cblx0XHRpZiAoYWN0aW9ucykgeyBhY3Rpb25zLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7IH1cblx0fTtcblx0cm93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCBzaG93QWN0aW9ucyk7XG5cdHJvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgaGlkZUFjdGlvbnMpO1xuXHRyb3cuYWRkRXZlbnRMaXN0ZW5lcignZm9jdXNpbicsIHNob3dBY3Rpb25zKTtcblx0cm93LmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3Vzb3V0JywgKGUpID0+IHtcblx0XHRpZiAoIXJvdy5jb250YWlucygoZSBhcyBGb2N1c0V2ZW50KS5yZWxhdGVkVGFyZ2V0IGFzIE5vZGUgfCBudWxsKSkge1xuXHRcdFx0aGlkZUFjdGlvbnMoKTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIERvdCBvciBjaGVja1xuXHRpZiAoaXNTZWxlY3RlZCkge1xuXHRcdGNvbnN0IGNoZWNrID0gZG9tLiQoJ3NwYW4uY29kaWNvbi5jb2RpY29uLWNoZWNrJyk7XG5cdFx0Y2hlY2suc3R5bGUuY3NzVGV4dCA9IGBmb250LXNpemU6MTBweDtjb2xvcjoke3Jvd0xhYmVsQ29sb3J9O2ZsZXgtc2hyaW5rOjA7YDtcblx0XHRyb3cuYXBwZW5kKGNoZWNrKTtcblx0fSBlbHNlIHtcblx0XHRjb25zdCBkb3QgPSBkb20uJCgnc3BhbicpO1xuXHRcdGRvdC5zdHlsZS5jc3NUZXh0ID0gYHdpZHRoOjdweDtoZWlnaHQ6N3B4O2JvcmRlci1yYWRpdXM6NTAlO2JhY2tncm91bmQ6JHtlZmZlY3RpdmVEb3RDb2xvcn07ZmxleC1zaHJpbms6MDske3Nob3VsZFB1bHNlID8gJ2FuaW1hdGlvbjphZ2VudHMtdm9pY2UtcHVsc2UgMS40cyBlYXNlLWluLW91dCBpbmZpbml0ZTsnIDogJyd9YDtcblx0XHRyb3cuYXBwZW5kKGRvdCk7XG5cdH1cblxuXHQvLyBMYWJlbFxuXHRjb25zdCBsYWJlbCA9IGRvbS4kKCdzcGFuJyk7XG5cdGxhYmVsLnN0eWxlLmNzc1RleHQgPSBgZm9udC1zaXplOiR7Rk9OVF9TSVpFLmJvZHl9O2ZsZXg6MTtvdmVyZmxvdzpoaWRkZW47dGV4dC1vdmVyZmxvdzplbGxpcHNpczt3aGl0ZS1zcGFjZTpub3dyYXA7Y29sb3I6JHtyb3dMYWJlbENvbG9yfTtmb250LXdlaWdodDoke2xhYmVsV2VpZ2h0fTtgO1xuXHRsYWJlbC50ZXh0Q29udGVudCA9IHNlc3Npb24ubGFiZWwgfHwgJ1VudGl0bGVkIHNlc3Npb24nO1xuXHRyb3cuYXBwZW5kKGxhYmVsKTtcblxuXHQvLyBBY3Rpb25zIGNvbnRhaW5lclxuXHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gZG9tLiQoJ2RpdicpO1xuXHRhY3Rpb25zQ29udGFpbmVyLnN0eWxlLmNzc1RleHQgPSAnZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NHB4O2ZsZXgtc2hyaW5rOjA7JztcblxuXHRjb25zdCBzdGF0cyA9IGRvbS4kKCdzcGFuJyk7XG5cdHN0YXRzLnNldEF0dHJpYnV0ZSgnZGF0YS1yb2xlJywgJ3N0YXRzJyk7XG5cdHN0YXRzLnN0eWxlLmNzc1RleHQgPSBgZGlzcGxheTpmbGV4O2dhcDo0cHg7Zm9udC1zaXplOiR7Rk9OVF9TSVpFLmJvZHl9O2A7XG5cdGlmIChzZXNzaW9uLmluc2VydGlvbnMgPiAwKSB7XG5cdFx0Y29uc3QgaW5zID0gZG9tLiQoJ3NwYW4nKTtcblx0XHRpbnMuc3R5bGUuY29sb3IgPSAndmFyKC0tdnNjb2RlLWNoYXJ0cy1ncmVlbiknO1xuXHRcdGlucy50ZXh0Q29udGVudCA9IGArJHtzZXNzaW9uLmluc2VydGlvbnN9YDtcblx0XHRzdGF0cy5hcHBlbmQoaW5zKTtcblx0fVxuXHRpZiAoc2Vzc2lvbi5kZWxldGlvbnMgPiAwKSB7XG5cdFx0Y29uc3QgZGVsID0gZG9tLiQoJ3NwYW4nKTtcblx0XHRkZWwuc3R5bGUuY29sb3IgPSAndmFyKC0tdnNjb2RlLWVkaXRvckVycm9yLWZvcmVncm91bmQpJztcblx0XHRkZWwudGV4dENvbnRlbnQgPSBgLSR7c2Vzc2lvbi5kZWxldGlvbnN9YDtcblx0XHRzdGF0cy5hcHBlbmQoZGVsKTtcblx0fVxuXG5cdGNvbnN0IGFjdGlvbnMgPSBkb20uJCgnc3BhbicpO1xuXHRhY3Rpb25zLnNldEF0dHJpYnV0ZSgnZGF0YS1yb2xlJywgJ2FjdGlvbnMnKTtcblx0YWN0aW9ucy5zdHlsZS5jc3NUZXh0ID0gJ2Rpc3BsYXk6bm9uZTtnYXA6NHB4O2FsaWduLWl0ZW1zOmNlbnRlcjsnO1xuXG5cdGlmICghc2Vzc2lvbi5pc0lkbGUpIHtcblx0XHRjb25zdCBzdG9wQnRuID0gaG92ZXJJY29uKCdjb2RpY29uLWRlYnVnLXN0b3AnLCBsb2NhbGl6ZSgnYWdlbnRzVm9pY2Uuc3RvcFNlc3Npb25BY3Rpb24nLCBcIlN0b3Agc2Vzc2lvblwiKSk7XG5cdFx0c3RvcEJ0bi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgKCkgPT4geyBzdG9wQnRuLnN0eWxlLmNvbG9yID0gJ3ZhcigtLXZzY29kZS1lZGl0b3JFcnJvci1mb3JlZ3JvdW5kKSc7IH0pO1xuXHRcdHN0b3BCdG4uYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsICgpID0+IHsgc3RvcEJ0bi5zdHlsZS5jb2xvciA9ICd2YXIoLS12c2NvZGUtZGVzY3JpcHRpb25Gb3JlZ3JvdW5kKSc7IH0pO1xuXHRcdHN0b3BCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4geyBlLnByZXZlbnREZWZhdWx0KCk7IGUuc3RvcFByb3BhZ2F0aW9uKCk7IHByb3BzLm9uU3RvcFNlc3Npb24oc2Vzc2lvbi5yZXNvdXJjZSk7IH0pO1xuXHRcdGFjdGlvbnMuYXBwZW5kKHN0b3BCdG4pO1xuXHR9XG5cblx0YWN0aW9uc0NvbnRhaW5lci5hcHBlbmQoc3RhdHMsIGFjdGlvbnMpO1xuXHRyb3cuYXBwZW5kKGFjdGlvbnNDb250YWluZXIpO1xuXG5cdGNvbnN0IHdyYXBwZXIgPSBkb20uJCgnZGl2Jyk7XG5cdHdyYXBwZXIuYXBwZW5kKHJvdyk7XG5cblx0Ly8gVG9vbCBjb25maXJtYXRpb25cblx0aWYgKHNlc3Npb24udG9vbENvbmZpcm1hdGlvbikge1xuXHRcdGNvbnN0IHRjID0gc2Vzc2lvbi50b29sQ29uZmlybWF0aW9uO1xuXHRcdGNvbnN0IGNvbmZSb3cgPSBkb20uJCgnZGl2Jyk7XG5cdFx0Y29uZlJvdy5zdHlsZS5jc3NUZXh0ID0gJ2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjNweDtwYWRkaW5nOjJweCAycHggNnB4IDE1cHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tdnNjb2RlLXBhbmVsLWJvcmRlcik7JztcblxuXHRcdGNvbnN0IGNvbmZEZXNjID0gZG9tLiQoJ3NwYW4nKTtcblx0XHRjb25mRGVzYy5zdHlsZS5jc3NUZXh0ID0gYGZvbnQtc2l6ZToke0ZPTlRfU0laRS5ib2R5fTtjb2xvcjp2YXIoLS12c2NvZGUtZWRpdG9yV2FybmluZy1mb3JlZ3JvdW5kKTtgO1xuXHRcdGNvbmZEZXNjLnRleHRDb250ZW50ID0gdGMuZGVzY3JpcHRpb247XG5cblx0XHRjb25zdCBjb25mQnRucyA9IGRvbS4kKCdkaXYnKTtcblx0XHRjb25mQnRucy5zdHlsZS5jc3NUZXh0ID0gJ2Rpc3BsYXk6ZmxleDtnYXA6NnB4Oyc7XG5cblx0XHRjb25zdCBidG5TdHlsZSA9IGAtd2Via2l0LWFwcC1yZWdpb246bm8tZHJhZztib3JkZXI6bm9uZTtjb2xvcjp2YXIoLS12c2NvZGUtYnV0dG9uLWZvcmVncm91bmQpO2ZvbnQtc2l6ZToke0ZPTlRfU0laRS5ib2R5fTtwYWRkaW5nOjJweCA4cHg7Ym9yZGVyLXJhZGl1czozcHg7Y3Vyc29yOnBvaW50ZXI7YDtcblxuXHRcdGlmICh0Yy50eXBlID09PSAnYXBwcm92YWwnKSB7XG5cdFx0XHRjb25zdCBhcHByb3ZlQnRuID0gZG9tLiQoJ2J1dHRvbicpO1xuXHRcdFx0YXBwcm92ZUJ0bi5zdHlsZS5jc3NUZXh0ID0gYCR7YnRuU3R5bGV9YmFja2dyb3VuZDp2YXIoLS12c2NvZGUtY2hhcnRzLWdyZWVuKTtgO1xuXHRcdFx0YXBwcm92ZUJ0bi50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdhZ2VudHNWb2ljZS5hcHByb3ZlJywgXCJBcHByb3ZlXCIpO1xuXHRcdFx0YXBwcm92ZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHRjLmFwcHJvdmUoKSk7XG5cblx0XHRcdGNvbnN0IGRlbnlCdG4gPSBkb20uJCgnYnV0dG9uJyk7XG5cdFx0XHRkZW55QnRuLnN0eWxlLmNzc1RleHQgPSBgJHtidG5TdHlsZX1iYWNrZ3JvdW5kOnZhcigtLXZzY29kZS1idXR0b24tc2Vjb25kYXJ5QmFja2dyb3VuZCk7Y29sb3I6dmFyKC0tdnNjb2RlLWZvcmVncm91bmQpO2A7XG5cdFx0XHRkZW55QnRuLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2FnZW50c1ZvaWNlLmRlbnknLCBcIkRlbnlcIik7XG5cdFx0XHRkZW55QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGMuZGVueSgpKTtcblxuXHRcdFx0Y29uc3Qgc3RvcEJ0biA9IGRvbS4kKCdidXR0b24nKTtcblx0XHRcdHN0b3BCdG4uc3R5bGUuY3NzVGV4dCA9IGAke2J0blN0eWxlfWJhY2tncm91bmQ6dmFyKC0tdnNjb2RlLWJ1dHRvbi1zZWNvbmRhcnlCYWNrZ3JvdW5kKTtjb2xvcjp2YXIoLS12c2NvZGUtZm9yZWdyb3VuZCk7YDtcblx0XHRcdHN0b3BCdG4udGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnYWdlbnRzVm9pY2Uuc3RvcCcsIFwiU3RvcFwiKTtcblx0XHRcdHN0b3BCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBwcm9wcy5vbkNhbmNlbFNlc3Npb24oc2Vzc2lvbi5yZXNvdXJjZSkpO1xuXG5cdFx0XHRjb25mQnRucy5hcHBlbmQoYXBwcm92ZUJ0biwgZGVueUJ0biwgc3RvcEJ0bik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG9wZW5JblZTQ29kZSA9IGRvbS4kKCdidXR0b24nKTtcblx0XHRcdG9wZW5JblZTQ29kZS5zdHlsZS5jc3NUZXh0ID0gYCR7YnRuU3R5bGV9YmFja2dyb3VuZDp2YXIoLS12c2NvZGUtYnV0dG9uLWJhY2tncm91bmQpO2A7XG5cdFx0XHRvcGVuSW5WU0NvZGUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnYWdlbnRzVm9pY2Uub3BlbkluVlNDb2RlJywgXCJPcGVuIGluIFZTIENvZGVcIik7XG5cdFx0XHRvcGVuSW5WU0NvZGUuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBwcm9wcy5vbk9wZW5TZXNzaW9uKHNlc3Npb24ucmVzb3VyY2UpKTtcblx0XHRcdGNvbmZCdG5zLmFwcGVuZChvcGVuSW5WU0NvZGUpO1xuXHRcdH1cblxuXHRcdGNvbmZSb3cuYXBwZW5kKGNvbmZEZXNjLCBjb25mQnRucyk7XG5cdFx0d3JhcHBlci5hcHBlbmQoY29uZlJvdyk7XG5cdH1cblxuXHRyZXR1cm4gd3JhcHBlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTZXNzaW9uTGlzdENvbXBvbmVudCB7XG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHR1cGRhdGUocHJvcHM6IFNlc3Npb25MaXN0UHJvcHMpOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbkxpc3QoKTogU2Vzc2lvbkxpc3RDb21wb25lbnQge1xuXHRjb25zdCBjb250YWluZXIgPSBkb20uJCgnZGl2LnZvaWNlLXNlc3Npb24tbGlzdCcpO1xuXHRjb250YWluZXIuc3R5bGUuY3NzVGV4dCA9ICdkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO21pbi1oZWlnaHQ6ODRweDttYXgtaGVpZ2h0OjMyMHB4O292ZXJmbG93LXk6YXV0bzttYXJnaW46MCAtMTRweCAwIDA7cGFkZGluZy1yaWdodDo4cHg7JztcblxuXHRjb25zdCBzdHlsZSA9IGRvbS4kKCdzdHlsZScpO1xuXHRzdHlsZS50ZXh0Q29udGVudCA9IGBcblx0XHRAa2V5ZnJhbWVzIGFnZW50cy12b2ljZS1wdWxzZXswJSwxMDAle29wYWNpdHk6MX01MCV7b3BhY2l0eTowLjR9fVxuXHRcdC52b2ljZS1zZXNzaW9uLWxpc3Q6Oi13ZWJraXQtc2Nyb2xsYmFye3dpZHRoOjZweDtiYWNrZ3JvdW5kOnRyYW5zcGFyZW50O31cblx0XHQudm9pY2Utc2Vzc2lvbi1saXN0Ojotd2Via2l0LXNjcm9sbGJhci10aHVtYntiYWNrZ3JvdW5kOnZhcigtLXZzY29kZS1zY3JvbGxiYXJTbGlkZXItYWN0aXZlQmFja2dyb3VuZCk7Ym9yZGVyLXJhZGl1czozcHg7fVxuXHRcdC52b2ljZS1zZXNzaW9uLWxpc3Q6Oi13ZWJraXQtc2Nyb2xsYmFyLXRodW1iOmhvdmVye2JhY2tncm91bmQ6dmFyKC0tdnNjb2RlLXNjcm9sbGJhclNsaWRlci1hY3RpdmVCYWNrZ3JvdW5kKTt9XG5cdFx0LnZvaWNlLXNlc3Npb24tbGlzdCA+IGRpdjpsYXN0LW9mLXR5cGV7Ym9yZGVyLWJvdHRvbTpub25lICFpbXBvcnRhbnQ7fVxuXHRgO1xuXG5cdHJldHVybiB7XG5cdFx0ZWxlbWVudDogY29udGFpbmVyLFxuXHRcdHVwZGF0ZShwcm9wczogU2Vzc2lvbkxpc3RQcm9wcykge1xuXHRcdFx0ZG9tLmNsZWFyTm9kZShjb250YWluZXIpO1xuXG5cdFx0XHRjb25zdCBoYXNHcm91cHMgPSBwcm9wcy5ncm91cHMgJiYgcHJvcHMuZ3JvdXBzLmxlbmd0aCA+IDA7XG5cdFx0XHRjb25zdCBoYXNTZXNzaW9ucyA9IHByb3BzLnNlc3Npb25zLmxlbmd0aCA+IDA7XG5cblx0XHRcdC8vIEhlYWRlciByb3dcblx0XHRcdGNvbnN0IGhlYWRlclJvdyA9IGRvbS4kKCdkaXYnKTtcblx0XHRcdGhlYWRlclJvdy5zdHlsZS5jc3NUZXh0ID0gJ2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7anVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47cGFkZGluZzoycHggMnB4IDRweDtib3JkZXItYm90dG9tOjFweCBzb2xpZCB2YXIoLS12c2NvZGUtZWRpdG9yR3JvdXAtYm9yZGVyKTsnO1xuXG5cdFx0XHRjb25zdCBoZWFkZXJMYWJlbCA9IGRvbS4kKCdzcGFuJyk7XG5cdFx0XHRoZWFkZXJMYWJlbC5zdHlsZS5jc3NUZXh0ID0gYGZvbnQtc2l6ZToke0ZPTlRfU0laRS5taWNyb307Y29sb3I6dmFyKC0tdnNjb2RlLWRpc2FibGVkRm9yZWdyb3VuZCk7dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2xldHRlci1zcGFjaW5nOjAuNXB4O2ZvbnQtd2VpZ2h0OjUwMDtgO1xuXHRcdFx0aGVhZGVyTGFiZWwudGV4dENvbnRlbnQgPSBwcm9wcy5zZWxlY3RlZFRhcmdldCA/IGxvY2FsaXplKCdhZ2VudHNWb2ljZS5zZW5kVG8nLCBcIlNlbmQgdG9cIikgOiBsb2NhbGl6ZSgnYWdlbnRzVm9pY2Uuc2VuZFRvQWN0aXZlJywgXCJTZW5kIHRvIChhY3RpdmUpXCIpO1xuXG5cdFx0XHRjb25zdCBhZGRCdG4gPSBob3Zlckljb24oJ2NvZGljb24tYWRkJywgbG9jYWxpemUoJ2FnZW50c1ZvaWNlLm5ld1Nlc3Npb24nLCBcIk5ldyBzZXNzaW9uXCIpKTtcblx0XHRcdGFkZEJ0bi50aXRsZSA9IGxvY2FsaXplKCdhZ2VudHNWb2ljZS5uZXdTZXNzaW9uJywgXCJOZXcgc2Vzc2lvblwiKTtcblx0XHRcdGFkZEJ0bi5zdHlsZS5jc3NUZXh0ICs9ICdwYWRkaW5nOjFweCAycHg7Jztcblx0XHRcdGFkZEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgZS5zdG9wUHJvcGFnYXRpb24oKTsgcHJvcHMub25OZXdTZXNzaW9uKCk7IH0pO1xuXG5cdFx0XHRoZWFkZXJSb3cuYXBwZW5kKGhlYWRlckxhYmVsLCBhZGRCdG4pO1xuXHRcdFx0Y29udGFpbmVyLmFwcGVuZChoZWFkZXJSb3cpO1xuXG5cdFx0XHRpZiAoIWhhc0dyb3VwcyAmJiAhaGFzU2Vzc2lvbnMpIHtcblx0XHRcdFx0Y29uc3QgZW1wdHkgPSBkb20uJCgnZGl2Jyk7XG5cdFx0XHRcdGVtcHR5LnN0eWxlLmNzc1RleHQgPSAnZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO2hlaWdodDo2MHB4Oyc7XG5cdFx0XHRcdGNvbnN0IGVtcHR5VGV4dCA9IGRvbS4kKCdzcGFuJyk7XG5cdFx0XHRcdGVtcHR5VGV4dC5zdHlsZS5jc3NUZXh0ID0gYGZvbnQtc2l6ZToke0ZPTlRfU0laRS5ib2R5fTtjb2xvcjp2YXIoLS12c2NvZGUtZm9yZWdyb3VuZCk7YDtcblx0XHRcdFx0ZW1wdHlUZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2FnZW50c1ZvaWNlLm5vQWN0aXZlU2Vzc2lvbnMnLCBcIk5vIGFjdGl2ZSBzZXNzaW9uc1wiKTtcblx0XHRcdFx0ZW1wdHkuYXBwZW5kKGVtcHR5VGV4dCk7XG5cdFx0XHRcdGNvbnRhaW5lci5hcHBlbmQoZW1wdHkpO1xuXHRcdFx0fSBlbHNlIGlmIChoYXNHcm91cHMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiBwcm9wcy5ncm91cHMhKSB7XG5cdFx0XHRcdFx0Y29uc3QgZ3JvdXBIZWFkZXIgPSBkb20uJCgnZGl2Jyk7XG5cdFx0XHRcdFx0Z3JvdXBIZWFkZXIuc3R5bGUuY3NzVGV4dCA9ICdwYWRkaW5nOjRweCAycHggMnB4Oyc7XG5cdFx0XHRcdFx0Y29uc3QgZ3JvdXBMYWJlbCA9IGRvbS4kKCdzcGFuJyk7XG5cdFx0XHRcdFx0Z3JvdXBMYWJlbC5zdHlsZS5jc3NUZXh0ID0gYGZvbnQtc2l6ZToke0ZPTlRfU0laRS5taWNyb307Y29sb3I6dmFyKC0tdnNjb2RlLWRpc2FibGVkRm9yZWdyb3VuZCk7dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2xldHRlci1zcGFjaW5nOjAuNXB4O2ZvbnQtd2VpZ2h0OjUwMDtgO1xuXHRcdFx0XHRcdGdyb3VwTGFiZWwudGV4dENvbnRlbnQgPSBncm91cC5sYWJlbDtcblx0XHRcdFx0XHRncm91cEhlYWRlci5hcHBlbmQoZ3JvdXBMYWJlbCk7XG5cdFx0XHRcdFx0Y29udGFpbmVyLmFwcGVuZChncm91cEhlYWRlcik7XG5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgZ3JvdXAuc2Vzc2lvbnMpIHtcblx0XHRcdFx0XHRcdGNvbnRhaW5lci5hcHBlbmQoY3JlYXRlU2Vzc2lvblJvdyhzZXNzaW9uLCBwcm9wcykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHByb3BzLnNlc3Npb25zKSB7XG5cdFx0XHRcdFx0Y29udGFpbmVyLmFwcGVuZChjcmVhdGVTZXNzaW9uUm93KHNlc3Npb24sIHByb3BzKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29udGFpbmVyLmFwcGVuZChzdHlsZSk7XG5cdFx0fVxuXHR9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBRXJCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsV0FBVyw2QkFBNkI7QUE4QjFDLFNBQVMsOEJBQThCLE9BQWUsV0FBMEIsT0FBbUM7QUFDekgsTUFBSSxVQUFVLEdBQUc7QUFDaEIsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLFFBQVEsY0FBYyxPQUFPLEtBQUs7QUFDeEMsVUFBUSxRQUFRLFFBQVEsU0FBUztBQUNsQztBQUVBLFNBQVMsVUFBVSxXQUFtQixXQUFnQztBQUNyRSxRQUFNLEtBQUssSUFBSSxFQUFFLGdCQUFnQixTQUFTLEVBQUU7QUFDNUMsS0FBRyxPQUFPO0FBQ1YsS0FBRyxXQUFXO0FBQ2QsS0FBRyxZQUFZO0FBQ2YsS0FBRyxNQUFNLFVBQVUsYUFBYSxVQUFVLE1BQU07QUFDaEQsS0FBRyxpQkFBaUIsY0FBYyxNQUFNO0FBQUUsT0FBRyxNQUFNLFFBQVE7QUFBQSxFQUE0QixDQUFDO0FBQ3hGLEtBQUcsaUJBQWlCLGNBQWMsTUFBTTtBQUFFLE9BQUcsTUFBTSxRQUFRO0FBQUEsRUFBdUMsQ0FBQztBQUNuRyx3QkFBc0IsRUFBRTtBQUN4QixTQUFPO0FBQ1I7QUFFQSxTQUFTLGlCQUFpQixTQUF5QixPQUFzQztBQUN4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
