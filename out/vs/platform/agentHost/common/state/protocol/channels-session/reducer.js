import { ActionType } from "../common/actions.js";
import { SessionLifecycle, SessionStatus, SessionInputRequestKind, CustomizationType, McpServerStatus } from "./state.js";
import { softAssertNever } from "../common/reducer-helpers.js";
const STATUS_ACTIVITY_MASK = (1 << 5) - 1;
function withStatusFlag(status, flag, set) {
  return set ? status | flag : status & ~flag;
}
function awaitsUser(request) {
  return request.kind !== SessionInputRequestKind.ToolClientExecution;
}
function withInputNeededStatus(status, inputNeeded) {
  if (inputNeeded.some(awaitsUser)) {
    return status & ~STATUS_ACTIVITY_MASK | SessionStatus.InputNeeded;
  }
  return status & ~(SessionStatus.InputNeeded & ~SessionStatus.InProgress);
}
function updateMcpServerCustomization(state, id, update) {
  const list = state.customizations;
  if (!list) {
    return state;
  }
  const topIdx = list.findIndex((c) => c.id === id);
  if (topIdx >= 0) {
    const entry = list[topIdx];
    if (entry.type !== CustomizationType.McpServer) {
      return state;
    }
    const updated2 = list.slice();
    updated2[topIdx] = update(entry);
    return { ...state, customizations: updated2 };
  }
  let changed = false;
  const updated = list.map((container) => {
    if (container.type === CustomizationType.McpServer) {
      return container;
    }
    const children = container.children;
    if (!children) {
      return container;
    }
    const childIdx = children.findIndex((c) => c.id === id);
    if (childIdx < 0) {
      return container;
    }
    const child = children[childIdx];
    if (child.type !== CustomizationType.McpServer) {
      return container;
    }
    changed = true;
    const newChildren = children.slice();
    newChildren[childIdx] = update(child);
    return { ...container, children: newChildren };
  });
  if (!changed) {
    return state;
  }
  return { ...state, customizations: updated };
}
function applyCustomizationEnablement(customization, enablement) {
  switch (customization.type) {
    case CustomizationType.Plugin:
    case CustomizationType.McpServer: {
      if (enablement.length > 0) {
        return { ...customization, enablement: [...enablement] };
      }
      const { enablement: _enablement, ...withoutEnablement } = customization;
      return withoutEnablement;
    }
    default:
      return { ...customization, enabled: enablement[0]?.enabled ?? true };
  }
}
function sessionReducer(state, action, log) {
  switch (action.type) {
    // ── Lifecycle ──────────────────────────────────────────────────────────
    case ActionType.SessionReady:
      return { ...state, lifecycle: SessionLifecycle.Ready };
    case ActionType.SessionCreationFailed:
      return {
        ...state,
        lifecycle: SessionLifecycle.CreationFailed,
        creationError: action.error
      };
    case ActionType.SessionChatAdded: {
      const list = state.chats;
      const idx = list.findIndex((c) => c.resource === action.summary.resource);
      if (idx < 0) {
        return { ...state, chats: [...list, action.summary] };
      }
      const updated = list.slice();
      updated[idx] = action.summary;
      return { ...state, chats: updated };
    }
    case ActionType.SessionChatRemoved: {
      const list = state.chats;
      const idx = list.findIndex((c) => c.resource === action.chat);
      if (idx < 0) {
        return state;
      }
      const updated = list.slice();
      updated.splice(idx, 1);
      const next = { ...state, chats: updated };
      if (state.defaultChat === action.chat) {
        delete next.defaultChat;
      }
      return next;
    }
    case ActionType.SessionChatUpdated: {
      const list = state.chats;
      const idx = list.findIndex((c) => c.resource === action.chat);
      if (idx < 0) {
        return state;
      }
      const { resource: _ignored, ...changes } = action.changes;
      const updated = list.slice();
      updated[idx] = { ...list[idx], ...changes };
      return { ...state, chats: updated };
    }
    case ActionType.SessionDefaultChatChanged:
      return { ...state, defaultChat: action.defaultChat };
    // ── Metadata ──────────────────────────────────────────────────────────
    case ActionType.SessionTitleChanged:
      return { ...state, title: action.title };
    case ActionType.SessionIsReadChanged:
      return {
        ...state,
        status: withStatusFlag(state.status, SessionStatus.IsRead, action.isRead)
      };
    case ActionType.SessionIsArchivedChanged:
      return {
        ...state,
        status: withStatusFlag(state.status, SessionStatus.IsArchived, action.isArchived)
      };
    case ActionType.SessionActivityChanged:
      return { ...state, activity: action.activity };
    case ActionType.SessionChangesetsChanged: {
      const { changesets: _omit, ...stateWithoutChangesets } = state;
      return action.changesets ? { ...stateWithoutChangesets, changesets: action.changesets } : stateWithoutChangesets;
    }
    case ActionType.SessionConfigChanged:
      if (!state.config) {
        return state;
      }
      return {
        ...state,
        config: {
          ...state.config,
          values: action.replace ? { ...action.config } : { ...state.config.values, ...action.config }
        }
      };
    case ActionType.SessionMetaChanged:
      return { ...state, _meta: action._meta };
    case ActionType.SessionServerToolsChanged:
      return { ...state, serverTools: action.tools };
    case ActionType.SessionActiveClientSet: {
      const list = state.activeClients;
      const idx = list.findIndex((c) => c.clientId === action.activeClient.clientId);
      if (idx < 0) {
        return { ...state, activeClients: [...list, action.activeClient] };
      }
      const updated = list.slice();
      updated[idx] = action.activeClient;
      return { ...state, activeClients: updated };
    }
    case ActionType.SessionActiveClientRemoved: {
      const list = state.activeClients;
      const idx = list.findIndex((c) => c.clientId === action.clientId);
      if (idx < 0) {
        return state;
      }
      const updated = list.slice();
      updated.splice(idx, 1);
      return { ...state, activeClients: updated };
    }
    // ── Working Directories ─────────────────────────────────────────────
    case ActionType.SessionWorkingDirectorySet: {
      const list = state.workingDirectories ?? [];
      if (list.includes(action.directory)) {
        return state;
      }
      return { ...state, workingDirectories: [...list, action.directory] };
    }
    case ActionType.SessionWorkingDirectoryRemoved: {
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
    // ── Input Needed ────────────────────────────────────────────────────
    case ActionType.SessionInputNeededSet: {
      const list = state.inputNeeded ?? [];
      const idx = list.findIndex((r) => r.id === action.request.id);
      const inputNeeded = idx < 0 ? [...list, action.request] : list.slice();
      if (idx >= 0) {
        inputNeeded[idx] = action.request;
      }
      return { ...state, inputNeeded, status: withInputNeededStatus(state.status, inputNeeded) };
    }
    case ActionType.SessionInputNeededRemoved: {
      const list = state.inputNeeded;
      if (!list) {
        return state;
      }
      const idx = list.findIndex((r) => r.id === action.id);
      if (idx < 0) {
        return state;
      }
      const remaining = list.slice();
      remaining.splice(idx, 1);
      const next = { ...state, status: withInputNeededStatus(state.status, remaining) };
      if (remaining.length > 0) {
        next.inputNeeded = remaining;
      } else {
        delete next.inputNeeded;
      }
      return next;
    }
    // ── Customizations ──────────────────────────────────────────────────
    case ActionType.SessionCustomizationsChanged:
      return { ...state, customizations: action.customizations };
    case ActionType.SessionCustomizationToggled: {
      const list = state.customizations;
      if (!list) {
        return state;
      }
      const topIdx = list.findIndex((c) => c.id === action.id);
      if (topIdx >= 0) {
        const updated = list.slice();
        updated[topIdx] = applyCustomizationEnablement(list[topIdx], action.enablement);
        return { ...state, customizations: updated };
      }
      for (let i = 0; i < list.length; i++) {
        const container = list[i];
        if (container.type === CustomizationType.McpServer) {
          continue;
        }
        const children = container.children;
        if (!children) {
          continue;
        }
        const childIdx = children.findIndex((c) => c.id === action.id);
        if (childIdx < 0) {
          continue;
        }
        const newChildren = children.slice();
        newChildren[childIdx] = applyCustomizationEnablement(children[childIdx], action.enablement);
        const updated = list.slice();
        updated[i] = { ...container, children: newChildren };
        return { ...state, customizations: updated };
      }
      return state;
    }
    case ActionType.SessionCustomizationUpdated: {
      const list = state.customizations ?? [];
      const idx = list.findIndex((c) => c.id === action.customization.id);
      if (idx < 0) {
        return { ...state, customizations: [...list, action.customization] };
      }
      const updated = [...list];
      updated[idx] = action.customization;
      return { ...state, customizations: updated };
    }
    case ActionType.SessionCustomizationRemoved: {
      const list = state.customizations;
      if (!list) {
        return state;
      }
      const topIdx = list.findIndex((c) => c.id === action.id);
      if (topIdx >= 0) {
        const updated2 = list.slice();
        updated2.splice(topIdx, 1);
        return { ...state, customizations: updated2 };
      }
      let changed = false;
      const updated = list.map((container) => {
        if (container.type === CustomizationType.McpServer) {
          return container;
        }
        const children = container.children;
        if (!children) {
          return container;
        }
        const childIdx = children.findIndex((c) => c.id === action.id);
        if (childIdx < 0) {
          return container;
        }
        changed = true;
        const newChildren = children.slice();
        newChildren.splice(childIdx, 1);
        return { ...container, children: newChildren };
      });
      if (!changed) {
        return state;
      }
      return { ...state, customizations: updated };
    }
    case ActionType.SessionMcpServerStateChanged: {
      return updateMcpServerCustomization(state, action.id, (entry) => ({
        ...entry,
        state: action.state,
        channel: action.channel
      }));
    }
    case ActionType.SessionMcpServerStartRequested: {
      return updateMcpServerCustomization(state, action.id, (entry) => ({
        ...entry,
        state: { kind: McpServerStatus.Starting },
        channel: void 0
      }));
    }
    case ActionType.SessionMcpServerStopRequested: {
      return updateMcpServerCustomization(state, action.id, (entry) => ({
        ...entry,
        state: { kind: McpServerStatus.Stopped },
        channel: void 0
      }));
    }
    default:
      softAssertNever(action, log);
      return state;
  }
}
export {
  sessionReducer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxjb21tb25cXHN0YXRlXFxwcm90b2NvbFxcY2hhbm5lbHMtc2Vzc2lvblxccmVkdWNlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8vIGFsbG93LWFueS11bmljb2RlLWNvbW1lbnQtZmlsZVxuLy8gRE8gTk9UIEVESVQgLS0gYXV0by1nZW5lcmF0ZWQgYnkgc2NyaXB0cy9zeW5jLWFnZW50LWhvc3QtcHJvdG9jb2wudHNcblxuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFNlc3Npb25MaWZlY3ljbGUsIFNlc3Npb25TdGF0dXMsIFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLCBDdXN0b21pemF0aW9uVHlwZSwgTWNwU2VydmVyU3RhdHVzLCB0eXBlIENoaWxkQ3VzdG9taXphdGlvbiwgdHlwZSBDdXN0b21pemF0aW9uLCB0eXBlIEN1c3RvbWl6YXRpb25FbmFibGVtZW50LCB0eXBlIFNlc3Npb25TdGF0ZSwgdHlwZSBTZXNzaW9uSW5wdXRSZXF1ZXN0LCB0eXBlIE1jcFNlcnZlckN1c3RvbWl6YXRpb24gfSBmcm9tICcuL3N0YXRlLmpzJztcbmltcG9ydCB0eXBlIHsgU2Vzc2lvbkFjdGlvbiB9IGZyb20gJy4uL2FjdGlvbi1vcmlnaW4uZ2VuZXJhdGVkLmpzJztcbmltcG9ydCB7IHNvZnRBc3NlcnROZXZlciB9IGZyb20gJy4uL2NvbW1vbi9yZWR1Y2VyLWhlbHBlcnMuanMnO1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgSGVscGVycyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuLyoqIEJpdG1hc2sgY292ZXJpbmcgdGhlIG11dHVhbGx5LWV4Y2x1c2l2ZSBhY3Rpdml0eSBiaXRzIChiaXRzIDBcdTIwMTM0KS4gKi9cbmNvbnN0IFNUQVRVU19BQ1RJVklUWV9NQVNLID0gKDEgPDwgNSkgLSAxO1xuXG4vKiogU2V0cyBvciBjbGVhcnMgYSBtZXRhZGF0YSBmbGFnIG9uIGEgc3RhdHVzIHZhbHVlLiAqL1xuZnVuY3Rpb24gd2l0aFN0YXR1c0ZsYWcoc3RhdHVzOiBTZXNzaW9uU3RhdHVzLCBmbGFnOiBTZXNzaW9uU3RhdHVzLCBzZXQ6IGJvb2xlYW4pOiBTZXNzaW9uU3RhdHVzIHtcblx0cmV0dXJuIHNldCA/IHN0YXR1cyB8IGZsYWcgOiBzdGF0dXMgJiB+ZmxhZztcbn1cblxuLyoqXG4gKiBXaGV0aGVyIGFuIGVudHJ5IGJsb2NrcyBvbiB0aGUgKnVzZXIqLlxuICpcbiAqIHtAbGluayBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZC5Ub29sQ2xpZW50RXhlY3V0aW9ufSBpcyB3b3JrIGRlbGVnYXRlZCB0byBhXG4gKiBjbGllbnQsIG5vdCBhIHByb21wdDogdGhlIGNhbGwgaGFzIGFscmVhZHkgY2xlYXJlZCBpdHMgY29uZmlybWF0aW9uIGdhdGUgYW5kXG4gKiBpcyBzaW1wbHkgcnVubmluZyBzb21ld2hlcmUgZWxzZS4gQ291bnRpbmcgaXQgd291bGQgcmVwb3J0IGEgc2Vzc2lvbiBhc1xuICogYXdhaXRpbmcgdGhlIHVzZXIgZm9yIHRoZSBlbnRpcmUgZHVyYXRpb24gb2YgZXZlcnkgY2xpZW50IHRvb2wgY2FsbC5cbiAqL1xuZnVuY3Rpb24gYXdhaXRzVXNlcihyZXF1ZXN0OiBTZXNzaW9uSW5wdXRSZXF1ZXN0KTogYm9vbGVhbiB7XG5cdHJldHVybiByZXF1ZXN0LmtpbmQgIT09IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xDbGllbnRFeGVjdXRpb247XG59XG5cbi8qKlxuICogUmVmbGVjdHMgdGhlIHNlc3Npb24tbGV2ZWwge0BsaW5rIFNlc3Npb25TdGF0ZS5pbnB1dE5lZWRlZCB8IGlucHV0IHF1ZXVlfVxuICogaW50byB0aGUgYWN0aXZpdHkgYml0cyBvZiBgc3RhdHVzYC4gQSBxdWV1ZSBob2xkaW5nIGFueSB1c2VyLWJsb2NraW5nIGVudHJ5XG4gKiBwcm9tb3RlcyB0aGUgYWN0aXZpdHkgdG8ge0BsaW5rIFNlc3Npb25TdGF0dXMuSW5wdXROZWVkZWR9OyBkcmFpbmluZyB0aG9zZVxuICogZW50cmllcyBjbGVhcnMgdGhlIGlucHV0LW5lZWRlZC1zcGVjaWZpYyBiaXQuIFNpbmNlIGBJbnB1dE5lZWRlZGAgaW1wbGllc1xuICoge0BsaW5rIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzc30sIGFuIHVuYmxvY2tlZCB0dXJuIGZhbGxzIGJhY2sgdG9cbiAqIGBJblByb2dyZXNzYCB3aGlsZSBhbiBhbHJlYWR5LWlkbGUgc2Vzc2lvbiBzdGF5cyBpZGxlLiBPcnRob2dvbmFsIGZsYWdzXG4gKiAoYElzUmVhZGAgLyBgSXNBcmNoaXZlZGApIGFyZSBwcmVzZXJ2ZWQuXG4gKi9cbmZ1bmN0aW9uIHdpdGhJbnB1dE5lZWRlZFN0YXR1cyhzdGF0dXM6IFNlc3Npb25TdGF0dXMsIGlucHV0TmVlZGVkOiByZWFkb25seSBTZXNzaW9uSW5wdXRSZXF1ZXN0W10pOiBTZXNzaW9uU3RhdHVzIHtcblx0aWYgKGlucHV0TmVlZGVkLnNvbWUoYXdhaXRzVXNlcikpIHtcblx0XHRyZXR1cm4gKHN0YXR1cyAmIH5TVEFUVVNfQUNUSVZJVFlfTUFTSykgfCBTZXNzaW9uU3RhdHVzLklucHV0TmVlZGVkO1xuXHR9XG5cdHJldHVybiBzdGF0dXMgJiB+KFNlc3Npb25TdGF0dXMuSW5wdXROZWVkZWQgJiB+U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlTWNwU2VydmVyQ3VzdG9taXphdGlvbihcblx0c3RhdGU6IFNlc3Npb25TdGF0ZSxcblx0aWQ6IHN0cmluZyxcblx0dXBkYXRlOiAoZW50cnk6IE1jcFNlcnZlckN1c3RvbWl6YXRpb24pID0+IE1jcFNlcnZlckN1c3RvbWl6YXRpb24sXG4pOiBTZXNzaW9uU3RhdGUge1xuXHRjb25zdCBsaXN0ID0gc3RhdGUuY3VzdG9taXphdGlvbnM7XG5cdGlmICghbGlzdCkge1xuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXHRjb25zdCB0b3BJZHggPSBsaXN0LmZpbmRJbmRleChjID0+IGMuaWQgPT09IGlkKTtcblx0aWYgKHRvcElkeCA+PSAwKSB7XG5cdFx0Y29uc3QgZW50cnkgPSBsaXN0W3RvcElkeF07XG5cdFx0aWYgKGVudHJ5LnR5cGUgIT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcikge1xuXHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdH1cblx0XHRjb25zdCB1cGRhdGVkID0gbGlzdC5zbGljZSgpO1xuXHRcdHVwZGF0ZWRbdG9wSWR4XSA9IHVwZGF0ZShlbnRyeSk7XG5cdFx0cmV0dXJuIHsgLi4uc3RhdGUsIGN1c3RvbWl6YXRpb25zOiB1cGRhdGVkIH07XG5cdH1cblx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0Y29uc3QgdXBkYXRlZCA9IGxpc3QubWFwKGNvbnRhaW5lciA9PiB7XG5cdFx0aWYgKGNvbnRhaW5lci50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiBjb250YWluZXI7XG5cdFx0fVxuXHRcdGNvbnN0IGNoaWxkcmVuID0gY29udGFpbmVyLmNoaWxkcmVuO1xuXHRcdGlmICghY2hpbGRyZW4pIHtcblx0XHRcdHJldHVybiBjb250YWluZXI7XG5cdFx0fVxuXHRcdGNvbnN0IGNoaWxkSWR4ID0gY2hpbGRyZW4uZmluZEluZGV4KGMgPT4gYy5pZCA9PT0gaWQpO1xuXHRcdGlmIChjaGlsZElkeCA8IDApIHtcblx0XHRcdHJldHVybiBjb250YWluZXI7XG5cdFx0fVxuXHRcdGNvbnN0IGNoaWxkID0gY2hpbGRyZW5bY2hpbGRJZHhdO1xuXHRcdGlmIChjaGlsZC50eXBlICE9PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiBjb250YWluZXI7XG5cdFx0fVxuXHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdGNvbnN0IG5ld0NoaWxkcmVuID0gY2hpbGRyZW4uc2xpY2UoKTtcblx0XHRuZXdDaGlsZHJlbltjaGlsZElkeF0gPSB1cGRhdGUoY2hpbGQpO1xuXHRcdHJldHVybiB7IC4uLmNvbnRhaW5lciwgY2hpbGRyZW46IG5ld0NoaWxkcmVuIH07XG5cdH0pO1xuXHRpZiAoIWNoYW5nZWQpIHtcblx0XHRyZXR1cm4gc3RhdGU7XG5cdH1cblx0cmV0dXJuIHsgLi4uc3RhdGUsIGN1c3RvbWl6YXRpb25zOiB1cGRhdGVkIH07XG59XG5cbi8qKlxuICogUmVwbGFjZXMgZXhwbGljaXQgZGVjaXNpb25zIGZvciBwbHVnaW5zIGFuZCBNQ1Agc2VydmVyczsgb3RoZXIgY3VzdG9taXphdGlvbnNcbiAqIHJldGFpbiB0aGVpciBsZWdhY3kgYGVuYWJsZWRgIGZpZWxkLCBkZXJpdmVkIGZyb20gdGhlIGluY29taW5nIGRlY2lzaW9ucy5cbiAqL1xuZnVuY3Rpb24gYXBwbHlDdXN0b21pemF0aW9uRW5hYmxlbWVudDxUIGV4dGVuZHMgQ3VzdG9taXphdGlvbiB8IENoaWxkQ3VzdG9taXphdGlvbj4oY3VzdG9taXphdGlvbjogVCwgZW5hYmxlbWVudDogcmVhZG9ubHkgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRbXSk6IFQge1xuXHRzd2l0Y2ggKGN1c3RvbWl6YXRpb24udHlwZSkge1xuXHRcdGNhc2UgQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luOlxuXHRcdGNhc2UgQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyOiB7XG5cdFx0XHRpZiAoZW5hYmxlbWVudC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJldHVybiB7IC4uLmN1c3RvbWl6YXRpb24sIGVuYWJsZW1lbnQ6IFsuLi5lbmFibGVtZW50XSB9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgeyBlbmFibGVtZW50OiBfZW5hYmxlbWVudCwgLi4ud2l0aG91dEVuYWJsZW1lbnQgfSA9IGN1c3RvbWl6YXRpb247XG5cdFx0XHRyZXR1cm4gd2l0aG91dEVuYWJsZW1lbnQgYXMgVDtcblx0XHR9XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiB7IC4uLmN1c3RvbWl6YXRpb24sIGVuYWJsZWQ6IGVuYWJsZW1lbnRbMF0/LmVuYWJsZWQgPz8gdHJ1ZSB9O1xuXHR9XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBTZXNzaW9uIFJlZHVjZXIgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbi8qKlxuICogUHVyZSByZWR1Y2VyIGZvciBzZXNzaW9uIHN0YXRlLiBIYW5kbGVzIGFsbCB7QGxpbmsgU2Vzc2lvbkFjdGlvbn0gdmFyaWFudHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXNzaW9uUmVkdWNlcihzdGF0ZTogU2Vzc2lvblN0YXRlLCBhY3Rpb246IFNlc3Npb25BY3Rpb24sIGxvZz86IChtc2c6IHN0cmluZykgPT4gdm9pZCk6IFNlc3Npb25TdGF0ZSB7XG5cdHN3aXRjaCAoYWN0aW9uLnR5cGUpIHtcblx0XHQvLyBcdTI1MDBcdTI1MDAgTGlmZWN5Y2xlIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeTpcblx0XHRcdC8vIGBTZXNzaW9uUmVhZHlgIGlzIHB1cmVseSBhIGxpZmVjeWNsZSB0cmFuc2l0aW9uIChDcmVhdGluZyAtPlxuXHRcdFx0Ly8gUmVhZHkpLiBJdCBtdXN0IG5vdCB0b3VjaCBgc3RhdHVzYDogZm9yIHByb3Zpc2lvbmFsIHNlc3Npb25zIHRoZVxuXHRcdFx0Ly8gZmlyc3QgdHVybiBjYW4gc3RhcnQgYmVmb3JlIG1hdGVyaWFsaXphdGlvbiBjb21wbGV0ZXMsIHNvIGFuXG5cdFx0XHQvLyBgYWN0aXZlVHVybmAgbWF5IGFscmVhZHkgYmUgc2V0IHdoZW4gdGhpcyBhY3Rpb24gaXMgZGlzcGF0Y2hlZFxuXHRcdFx0Ly8gKGUuZy4gZnJvbSBhIG1hdGVyaWFsaXplLXNlc3Npb24gaGFuZGxlcikuIE90aGVyIHJlZHVjZXJzIGtlZXBcblx0XHRcdC8vIGBzdGF0dXNgIGluIHN5bmMgd2l0aCB0aGUgYWN0aXZpdHkgc3RhdGUsIHNvIGxlYXZpbmcgaXQgYWxvbmUgaGVyZVxuXHRcdFx0Ly8gaXMgY29ycmVjdC5cblx0XHRcdHJldHVybiB7IC4uLnN0YXRlLCBsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHkgfTtcblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uQ3JlYXRpb25GYWlsZWQ6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5zdGF0ZSxcblx0XHRcdFx0bGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLkNyZWF0aW9uRmFpbGVkLFxuXHRcdFx0XHRjcmVhdGlvbkVycm9yOiBhY3Rpb24uZXJyb3IsXG5cdFx0XHR9O1xuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25DaGF0QWRkZWQ6IHtcblx0XHRcdGNvbnN0IGxpc3QgPSBzdGF0ZS5jaGF0cztcblx0XHRcdGNvbnN0IGlkeCA9IGxpc3QuZmluZEluZGV4KGMgPT4gYy5yZXNvdXJjZSA9PT0gYWN0aW9uLnN1bW1hcnkucmVzb3VyY2UpO1xuXHRcdFx0aWYgKGlkeCA8IDApIHtcblx0XHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIGNoYXRzOiBbLi4ubGlzdCwgYWN0aW9uLnN1bW1hcnldIH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1cGRhdGVkID0gbGlzdC5zbGljZSgpO1xuXHRcdFx0dXBkYXRlZFtpZHhdID0gYWN0aW9uLnN1bW1hcnk7XG5cdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgY2hhdHM6IHVwZGF0ZWQgfTtcblx0XHR9XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbkNoYXRSZW1vdmVkOiB7XG5cdFx0XHRjb25zdCBsaXN0ID0gc3RhdGUuY2hhdHM7XG5cdFx0XHRjb25zdCBpZHggPSBsaXN0LmZpbmRJbmRleChjID0+IGMucmVzb3VyY2UgPT09IGFjdGlvbi5jaGF0KTtcblx0XHRcdGlmIChpZHggPCAwKSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHVwZGF0ZWQgPSBsaXN0LnNsaWNlKCk7XG5cdFx0XHR1cGRhdGVkLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0Y29uc3QgbmV4dDogU2Vzc2lvblN0YXRlID0geyAuLi5zdGF0ZSwgY2hhdHM6IHVwZGF0ZWQgfTtcblx0XHRcdGlmIChzdGF0ZS5kZWZhdWx0Q2hhdCA9PT0gYWN0aW9uLmNoYXQpIHtcblx0XHRcdFx0ZGVsZXRlIG5leHQuZGVmYXVsdENoYXQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbmV4dDtcblx0XHR9XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbkNoYXRVcGRhdGVkOiB7XG5cdFx0XHRjb25zdCBsaXN0ID0gc3RhdGUuY2hhdHM7XG5cdFx0XHRjb25zdCBpZHggPSBsaXN0LmZpbmRJbmRleChjID0+IGMucmVzb3VyY2UgPT09IGFjdGlvbi5jaGF0KTtcblx0XHRcdGlmIChpZHggPCAwKSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHsgcmVzb3VyY2U6IF9pZ25vcmVkLCAuLi5jaGFuZ2VzIH0gPSBhY3Rpb24uY2hhbmdlcztcblx0XHRcdGNvbnN0IHVwZGF0ZWQgPSBsaXN0LnNsaWNlKCk7XG5cdFx0XHR1cGRhdGVkW2lkeF0gPSB7IC4uLmxpc3RbaWR4XSwgLi4uY2hhbmdlcyB9O1xuXHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIGNoYXRzOiB1cGRhdGVkIH07XG5cdFx0fVxuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25EZWZhdWx0Q2hhdENoYW5nZWQ6XG5cdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgZGVmYXVsdENoYXQ6IGFjdGlvbi5kZWZhdWx0Q2hhdCB9O1xuXG5cdFx0Ly8gXHUyNTAwXHUyNTAwIE1ldGFkYXRhIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQ6XG5cdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgdGl0bGU6IGFjdGlvbi50aXRsZSB9O1xuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25Jc1JlYWRDaGFuZ2VkOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4uc3RhdGUsXG5cdFx0XHRcdHN0YXR1czogd2l0aFN0YXR1c0ZsYWcoc3RhdGUuc3RhdHVzLCBTZXNzaW9uU3RhdHVzLklzUmVhZCwgYWN0aW9uLmlzUmVhZCksXG5cdFx0XHR9O1xuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25Jc0FyY2hpdmVkQ2hhbmdlZDpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLnN0YXRlLFxuXHRcdFx0XHRzdGF0dXM6IHdpdGhTdGF0dXNGbGFnKHN0YXRlLnN0YXR1cywgU2Vzc2lvblN0YXR1cy5Jc0FyY2hpdmVkLCBhY3Rpb24uaXNBcmNoaXZlZCksXG5cdFx0XHR9O1xuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25BY3Rpdml0eUNoYW5nZWQ6XG5cdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgYWN0aXZpdHk6IGFjdGlvbi5hY3Rpdml0eSB9O1xuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25DaGFuZ2VzZXRzQ2hhbmdlZDoge1xuXHRcdFx0Y29uc3QgeyBjaGFuZ2VzZXRzOiBfb21pdCwgLi4uc3RhdGVXaXRob3V0Q2hhbmdlc2V0cyB9ID0gc3RhdGU7XG5cdFx0XHRyZXR1cm4gYWN0aW9uLmNoYW5nZXNldHNcblx0XHRcdFx0PyB7IC4uLnN0YXRlV2l0aG91dENoYW5nZXNldHMsIGNoYW5nZXNldHM6IGFjdGlvbi5jaGFuZ2VzZXRzIH1cblx0XHRcdFx0OiBzdGF0ZVdpdGhvdXRDaGFuZ2VzZXRzO1xuXHRcdH1cblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZDpcblx0XHRcdGlmICghc3RhdGUuY29uZmlnKSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLnN0YXRlLFxuXHRcdFx0XHRjb25maWc6IHtcblx0XHRcdFx0XHQuLi5zdGF0ZS5jb25maWcsXG5cdFx0XHRcdFx0dmFsdWVzOiBhY3Rpb24ucmVwbGFjZSA/IHsgLi4uYWN0aW9uLmNvbmZpZyB9IDogeyAuLi5zdGF0ZS5jb25maWcudmFsdWVzLCAuLi5hY3Rpb24uY29uZmlnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25NZXRhQ2hhbmdlZDpcblx0XHRcdHJldHVybiB7IC4uLnN0YXRlLCBfbWV0YTogYWN0aW9uLl9tZXRhIH07XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvblNlcnZlclRvb2xzQ2hhbmdlZDpcblx0XHRcdHJldHVybiB7IC4uLnN0YXRlLCBzZXJ2ZXJUb29sczogYWN0aW9uLnRvb2xzIH07XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldDoge1xuXHRcdFx0Y29uc3QgbGlzdCA9IHN0YXRlLmFjdGl2ZUNsaWVudHM7XG5cdFx0XHRjb25zdCBpZHggPSBsaXN0LmZpbmRJbmRleChjID0+IGMuY2xpZW50SWQgPT09IGFjdGlvbi5hY3RpdmVDbGllbnQuY2xpZW50SWQpO1xuXHRcdFx0aWYgKGlkeCA8IDApIHtcblx0XHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIGFjdGl2ZUNsaWVudHM6IFsuLi5saXN0LCBhY3Rpb24uYWN0aXZlQ2xpZW50XSB9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdXBkYXRlZCA9IGxpc3Quc2xpY2UoKTtcblx0XHRcdHVwZGF0ZWRbaWR4XSA9IGFjdGlvbi5hY3RpdmVDbGllbnQ7XG5cdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgYWN0aXZlQ2xpZW50czogdXBkYXRlZCB9O1xuXHRcdH1cblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50UmVtb3ZlZDoge1xuXHRcdFx0Y29uc3QgbGlzdCA9IHN0YXRlLmFjdGl2ZUNsaWVudHM7XG5cdFx0XHRjb25zdCBpZHggPSBsaXN0LmZpbmRJbmRleChjID0+IGMuY2xpZW50SWQgPT09IGFjdGlvbi5jbGllbnRJZCk7XG5cdFx0XHRpZiAoaWR4IDwgMCkge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1cGRhdGVkID0gbGlzdC5zbGljZSgpO1xuXHRcdFx0dXBkYXRlZC5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdHJldHVybiB7IC4uLnN0YXRlLCBhY3RpdmVDbGllbnRzOiB1cGRhdGVkIH07XG5cdFx0fVxuXG5cdFx0Ly8gXHUyNTAwXHUyNTAwIFdvcmtpbmcgRGlyZWN0b3JpZXMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTZXQ6IHtcblx0XHRcdGNvbnN0IGxpc3QgPSBzdGF0ZS53b3JraW5nRGlyZWN0b3JpZXMgPz8gW107XG5cdFx0XHRpZiAobGlzdC5pbmNsdWRlcyhhY3Rpb24uZGlyZWN0b3J5KSkge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgd29ya2luZ0RpcmVjdG9yaWVzOiBbLi4ubGlzdCwgYWN0aW9uLmRpcmVjdG9yeV0gfTtcblx0XHR9XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZW1vdmVkOiB7XG5cdFx0XHRjb25zdCBsaXN0ID0gc3RhdGUud29ya2luZ0RpcmVjdG9yaWVzO1xuXHRcdFx0aWYgKCFsaXN0KSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlkeCA9IGxpc3QuaW5kZXhPZihhY3Rpb24uZGlyZWN0b3J5KTtcblx0XHRcdGlmIChpZHggPCAwKSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHVwZGF0ZWQgPSBsaXN0LnNsaWNlKCk7XG5cdFx0XHR1cGRhdGVkLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIHdvcmtpbmdEaXJlY3RvcmllczogdXBkYXRlZCB9O1xuXHRcdH1cblxuXHRcdC8vIFx1MjUwMFx1MjUwMCBJbnB1dCBOZWVkZWQgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbklucHV0TmVlZGVkU2V0OiB7XG5cdFx0XHRjb25zdCBsaXN0ID0gc3RhdGUuaW5wdXROZWVkZWQgPz8gW107XG5cdFx0XHRjb25zdCBpZHggPSBsaXN0LmZpbmRJbmRleChyID0+IHIuaWQgPT09IGFjdGlvbi5yZXF1ZXN0LmlkKTtcblx0XHRcdGNvbnN0IGlucHV0TmVlZGVkID0gaWR4IDwgMCA/IFsuLi5saXN0LCBhY3Rpb24ucmVxdWVzdF0gOiBsaXN0LnNsaWNlKCk7XG5cdFx0XHRpZiAoaWR4ID49IDApIHtcblx0XHRcdFx0aW5wdXROZWVkZWRbaWR4XSA9IGFjdGlvbi5yZXF1ZXN0O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIGlucHV0TmVlZGVkLCBzdGF0dXM6IHdpdGhJbnB1dE5lZWRlZFN0YXR1cyhzdGF0ZS5zdGF0dXMsIGlucHV0TmVlZGVkKSB9O1xuXHRcdH1cblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uSW5wdXROZWVkZWRSZW1vdmVkOiB7XG5cdFx0XHRjb25zdCBsaXN0ID0gc3RhdGUuaW5wdXROZWVkZWQ7XG5cdFx0XHRpZiAoIWxpc3QpIHtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaWR4ID0gbGlzdC5maW5kSW5kZXgociA9PiByLmlkID09PSBhY3Rpb24uaWQpO1xuXHRcdFx0aWYgKGlkeCA8IDApIHtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVtYWluaW5nID0gbGlzdC5zbGljZSgpO1xuXHRcdFx0cmVtYWluaW5nLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0Y29uc3QgbmV4dDogU2Vzc2lvblN0YXRlID0geyAuLi5zdGF0ZSwgc3RhdHVzOiB3aXRoSW5wdXROZWVkZWRTdGF0dXMoc3RhdGUuc3RhdHVzLCByZW1haW5pbmcpIH07XG5cdFx0XHRpZiAocmVtYWluaW5nLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0bmV4dC5pbnB1dE5lZWRlZCA9IHJlbWFpbmluZztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRlbGV0ZSBuZXh0LmlucHV0TmVlZGVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5leHQ7XG5cdFx0fVxuXG5cdFx0Ly8gXHUyNTAwXHUyNTAwIEN1c3RvbWl6YXRpb25zIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQ6XG5cdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgY3VzdG9taXphdGlvbnM6IGFjdGlvbi5jdXN0b21pemF0aW9ucyB9O1xuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVG9nZ2xlZDoge1xuXHRcdFx0Y29uc3QgbGlzdCA9IHN0YXRlLmN1c3RvbWl6YXRpb25zO1xuXHRcdFx0aWYgKCFsaXN0KSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRvcElkeCA9IGxpc3QuZmluZEluZGV4KGMgPT4gYy5pZCA9PT0gYWN0aW9uLmlkKTtcblx0XHRcdGlmICh0b3BJZHggPj0gMCkge1xuXHRcdFx0XHRjb25zdCB1cGRhdGVkID0gbGlzdC5zbGljZSgpO1xuXHRcdFx0XHR1cGRhdGVkW3RvcElkeF0gPSBhcHBseUN1c3RvbWl6YXRpb25FbmFibGVtZW50KGxpc3RbdG9wSWR4XSwgYWN0aW9uLmVuYWJsZW1lbnQpO1xuXHRcdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgY3VzdG9taXphdGlvbnM6IHVwZGF0ZWQgfTtcblx0XHRcdH1cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBjb250YWluZXIgPSBsaXN0W2ldO1xuXHRcdFx0XHRpZiAoY29udGFpbmVyLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNoaWxkcmVuID0gY29udGFpbmVyLmNoaWxkcmVuO1xuXHRcdFx0XHRpZiAoIWNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY2hpbGRJZHggPSBjaGlsZHJlbi5maW5kSW5kZXgoYyA9PiBjLmlkID09PSBhY3Rpb24uaWQpO1xuXHRcdFx0XHRpZiAoY2hpbGRJZHggPCAwKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbmV3Q2hpbGRyZW4gPSBjaGlsZHJlbi5zbGljZSgpO1xuXHRcdFx0XHRuZXdDaGlsZHJlbltjaGlsZElkeF0gPSBhcHBseUN1c3RvbWl6YXRpb25FbmFibGVtZW50KGNoaWxkcmVuW2NoaWxkSWR4XSwgYWN0aW9uLmVuYWJsZW1lbnQpO1xuXHRcdFx0XHRjb25zdCB1cGRhdGVkID0gbGlzdC5zbGljZSgpO1xuXHRcdFx0XHR1cGRhdGVkW2ldID0geyAuLi5jb250YWluZXIsIGNoaWxkcmVuOiBuZXdDaGlsZHJlbiB9O1xuXHRcdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgY3VzdG9taXphdGlvbnM6IHVwZGF0ZWQgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHR9XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25VcGRhdGVkOiB7XG5cdFx0XHRjb25zdCBsaXN0ID0gc3RhdGUuY3VzdG9taXphdGlvbnMgPz8gW107XG5cdFx0XHRjb25zdCBpZHggPSBsaXN0LmZpbmRJbmRleChjID0+IGMuaWQgPT09IGFjdGlvbi5jdXN0b21pemF0aW9uLmlkKTtcblx0XHRcdGlmIChpZHggPCAwKSB7XG5cdFx0XHRcdHJldHVybiB7IC4uLnN0YXRlLCBjdXN0b21pemF0aW9uczogWy4uLmxpc3QsIGFjdGlvbi5jdXN0b21pemF0aW9uXSB9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdXBkYXRlZCA9IFsuLi5saXN0XTtcblx0XHRcdHVwZGF0ZWRbaWR4XSA9IGFjdGlvbi5jdXN0b21pemF0aW9uO1xuXHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIGN1c3RvbWl6YXRpb25zOiB1cGRhdGVkIH07XG5cdFx0fVxuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uUmVtb3ZlZDoge1xuXHRcdFx0Y29uc3QgbGlzdCA9IHN0YXRlLmN1c3RvbWl6YXRpb25zO1xuXHRcdFx0aWYgKCFsaXN0KSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRvcElkeCA9IGxpc3QuZmluZEluZGV4KGMgPT4gYy5pZCA9PT0gYWN0aW9uLmlkKTtcblx0XHRcdGlmICh0b3BJZHggPj0gMCkge1xuXHRcdFx0XHRjb25zdCB1cGRhdGVkID0gbGlzdC5zbGljZSgpO1xuXHRcdFx0XHR1cGRhdGVkLnNwbGljZSh0b3BJZHgsIDEpO1xuXHRcdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgY3VzdG9taXphdGlvbnM6IHVwZGF0ZWQgfTtcblx0XHRcdH1cblx0XHRcdGxldCBjaGFuZ2VkID0gZmFsc2U7XG5cdFx0XHRjb25zdCB1cGRhdGVkID0gbGlzdC5tYXAoY29udGFpbmVyID0+IHtcblx0XHRcdFx0aWYgKGNvbnRhaW5lci50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gY29udGFpbmVyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNoaWxkcmVuID0gY29udGFpbmVyLmNoaWxkcmVuO1xuXHRcdFx0XHRpZiAoIWNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGNvbnRhaW5lcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjaGlsZElkeCA9IGNoaWxkcmVuLmZpbmRJbmRleChjID0+IGMuaWQgPT09IGFjdGlvbi5pZCk7XG5cdFx0XHRcdGlmIChjaGlsZElkeCA8IDApIHtcblx0XHRcdFx0XHRyZXR1cm4gY29udGFpbmVyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0XHRjb25zdCBuZXdDaGlsZHJlbiA9IGNoaWxkcmVuLnNsaWNlKCk7XG5cdFx0XHRcdG5ld0NoaWxkcmVuLnNwbGljZShjaGlsZElkeCwgMSk7XG5cdFx0XHRcdHJldHVybiB7IC4uLmNvbnRhaW5lciwgY2hpbGRyZW46IG5ld0NoaWxkcmVuIH07XG5cdFx0XHR9KTtcblx0XHRcdGlmICghY2hhbmdlZCkge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgY3VzdG9taXphdGlvbnM6IHVwZGF0ZWQgfTtcblx0XHR9XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbk1jcFNlcnZlclN0YXRlQ2hhbmdlZDoge1xuXHRcdFx0cmV0dXJuIHVwZGF0ZU1jcFNlcnZlckN1c3RvbWl6YXRpb24oc3RhdGUsIGFjdGlvbi5pZCwgZW50cnkgPT4gKHtcblx0XHRcdFx0Li4uZW50cnksXG5cdFx0XHRcdHN0YXRlOiBhY3Rpb24uc3RhdGUsXG5cdFx0XHRcdGNoYW5uZWw6IGFjdGlvbi5jaGFubmVsLFxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uTWNwU2VydmVyU3RhcnRSZXF1ZXN0ZWQ6IHtcblx0XHRcdHJldHVybiB1cGRhdGVNY3BTZXJ2ZXJDdXN0b21pemF0aW9uKHN0YXRlLCBhY3Rpb24uaWQsIGVudHJ5ID0+ICh7XG5cdFx0XHRcdC4uLmVudHJ5LFxuXHRcdFx0XHRzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuU3RhcnRpbmcgfSxcblx0XHRcdFx0Y2hhbm5lbDogdW5kZWZpbmVkLFxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uTWNwU2VydmVyU3RvcFJlcXVlc3RlZDoge1xuXHRcdFx0cmV0dXJuIHVwZGF0ZU1jcFNlcnZlckN1c3RvbWl6YXRpb24oc3RhdGUsIGFjdGlvbi5pZCwgZW50cnkgPT4gKHtcblx0XHRcdFx0Li4uZW50cnksXG5cdFx0XHRcdHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5TdG9wcGVkIH0sXG5cdFx0XHRcdGNoYW5uZWw6IHVuZGVmaW5lZCxcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRkZWZhdWx0OlxuXHRcdFx0c29mdEFzc2VydE5ldmVyKGFjdGlvbiwgbG9nKTtcblx0XHRcdHJldHVybiBzdGF0ZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBUUEsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxrQkFBa0IsZUFBZSx5QkFBeUIsbUJBQW1CLHVCQUE0SztBQUVsUSxTQUFTLHVCQUF1QjtBQUtoQyxNQUFNLHdCQUF3QixLQUFLLEtBQUs7QUFHeEMsU0FBUyxlQUFlLFFBQXVCLE1BQXFCLEtBQTZCO0FBQ2hHLFNBQU8sTUFBTSxTQUFTLE9BQU8sU0FBUyxDQUFDO0FBQ3hDO0FBVUEsU0FBUyxXQUFXLFNBQXVDO0FBQzFELFNBQU8sUUFBUSxTQUFTLHdCQUF3QjtBQUNqRDtBQVdBLFNBQVMsc0JBQXNCLFFBQXVCLGFBQTREO0FBQ2pILE1BQUksWUFBWSxLQUFLLFVBQVUsR0FBRztBQUNqQyxXQUFRLFNBQVMsQ0FBQyx1QkFBd0IsY0FBYztBQUFBLEVBQ3pEO0FBQ0EsU0FBTyxTQUFTLEVBQUUsY0FBYyxjQUFjLENBQUMsY0FBYztBQUM5RDtBQUVBLFNBQVMsNkJBQ1IsT0FDQSxJQUNBLFFBQ2U7QUFDZixRQUFNLE9BQU8sTUFBTTtBQUNuQixNQUFJLENBQUMsTUFBTTtBQUNWLFdBQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxTQUFTLEtBQUssVUFBVSxPQUFLLEVBQUUsT0FBTyxFQUFFO0FBQzlDLE1BQUksVUFBVSxHQUFHO0FBQ2hCLFVBQU0sUUFBUSxLQUFLLE1BQU07QUFDekIsUUFBSSxNQUFNLFNBQVMsa0JBQWtCLFdBQVc7QUFDL0MsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNQSxXQUFVLEtBQUssTUFBTTtBQUMzQixJQUFBQSxTQUFRLE1BQU0sSUFBSSxPQUFPLEtBQUs7QUFDOUIsV0FBTyxFQUFFLEdBQUcsT0FBTyxnQkFBZ0JBLFNBQVE7QUFBQSxFQUM1QztBQUNBLE1BQUksVUFBVTtBQUNkLFFBQU0sVUFBVSxLQUFLLElBQUksZUFB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
