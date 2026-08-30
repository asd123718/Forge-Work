var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import * as DOM from "../../../../../base/browser/dom.js";
import { autorun } from "../../../../../base/common/observable.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { ViewPane } from "../../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../../common/views.js";
import { IAuthenticationService } from "../../../../services/authentication/common/authentication.js";
import { IVoiceSessionController } from "../../../chat/browser/voiceClient/voiceSessionController.js";
import { IVoiceTranscriptStore } from "../../common/voiceTranscriptStore.js";
const $ = DOM.$;
let VoiceTranscriptsViewPane = class extends ViewPane {
  constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, voiceTranscriptStore, authenticationService, voiceSessionController, logService) {
    super(
      options,
      keybindingService,
      contextMenuService,
      configurationService,
      contextKeyService,
      viewDescriptorService,
      instantiationService,
      openerService,
      themeService,
      hoverService
    );
    this.voiceTranscriptStore = voiceTranscriptStore;
    this.authenticationService = authenticationService;
    this.voiceSessionController = voiceSessionController;
    this.logService = logService;
    let lastState;
    this._register(autorun((reader) => {
      const state = this.voiceSessionController.voiceState.read(reader);
      const wasMidTurn = lastState === "speaking" || lastState === "processing";
      const nowIdle = state === "idle" || state === "listening";
      lastState = state;
      if (wasMidTurn && nowIdle && this.isBodyVisible()) {
        void this.refresh();
      }
    }));
  }
  renderBody(container) {
    super.renderBody(container);
    container.classList.add("voice-transcripts-view");
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.overflow = "hidden";
    this.contentContainer = DOM.append(container, $(".voice-transcripts-content"));
    this.contentContainer.style.flex = "1";
    this.contentContainer.style.overflowY = "auto";
    this.contentContainer.style.padding = "6px 12px 12px";
    this.contentContainer.style.fontSize = "13px";
    this.emptyState = DOM.append(container, $(".voice-transcripts-empty"));
    this.emptyState.style.display = "none";
    this.emptyState.style.padding = "24px 16px";
    this.emptyState.style.textAlign = "center";
    this.emptyState.style.color = "var(--vscode-descriptionForeground)";
    this.emptyState.style.fontSize = "13px";
    this.emptyState.textContent = localize(
      "voiceTranscripts.empty",
      "No transcripts yet. Start a voice conversation to populate this view."
    );
    void this.refresh();
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
  }
  /**
   * Re-read the transcript JSONL and re-render. Cheap; the file is text-only
   * and bounded by the user's actual usage.
   */
  async refresh() {
    if (!this.contentContainer || !this.emptyState) {
      return;
    }
    try {
      this.userLogin = await this.resolveUserLogin();
      if (!this.userLogin) {
        this.renderEmpty();
        return;
      }
      const turns = await this.voiceTranscriptStore.loadTurns(this.userLogin);
      const indexEntry = this.voiceTranscriptStore.getIndexEntry(this.userLogin);
      const archiveCutoff = indexEntry?.archivedBefore;
      const spoken = turns.filter((t) => t.kind === "user_voice" || t.kind === "agent_voice");
      const visible = archiveCutoff ? spoken.filter((t) => t.timestamp >= archiveCutoff) : spoken;
      const archivedCount = spoken.length - visible.length;
      if (visible.length === 0 && archivedCount === 0) {
        this.renderEmpty();
        return;
      }
      this.renderTurns(visible, archivedCount);
    } catch (err) {
      this.logService.warn("[voiceTranscripts] refresh failed", err);
      this.renderEmpty();
    }
  }
  async archiveAll() {
    if (!this.userLogin) {
      this.userLogin = await this.resolveUserLogin();
    }
    if (!this.userLogin) {
      return;
    }
    const cutoff = (/* @__PURE__ */ new Date()).toISOString();
    try {
      await this.voiceTranscriptStore.archiveUpTo(this.userLogin, cutoff);
    } catch (err) {
      this.logService.warn("[voiceTranscripts] archiveUpTo failed", err);
    }
    await this.refresh();
  }
  async deleteAll() {
    if (!this.userLogin) {
      this.userLogin = await this.resolveUserLogin();
    }
    if (!this.userLogin) {
      return;
    }
    try {
      await this.voiceTranscriptStore.deleteAll(this.userLogin);
    } catch (err) {
      this.logService.warn("[voiceTranscripts] deleteAll failed", err);
    }
    await this.refresh();
  }
  // --- Internals ---
  async resolveUserLogin() {
    try {
      const sessions = await this.authenticationService.getSessions("github");
      return sessions[0]?.account.label;
    } catch (err) {
      this.logService.warn("[voiceTranscripts] failed to resolve github session", err);
      return void 0;
    }
  }
  renderEmpty() {
    if (!this.contentContainer || !this.emptyState) {
      return;
    }
    DOM.clearNode(this.contentContainer);
    this.contentContainer.style.display = "none";
    this.emptyState.style.display = "block";
  }
  renderTurns(turns, archivedCount) {
    if (!this.contentContainer || !this.emptyState) {
      return;
    }
    this.emptyState.style.display = "none";
    this.contentContainer.style.display = "block";
    DOM.clearNode(this.contentContainer);
    const groups = groupTurnsByTime(turns).filter((g) => g.pairs.length > 0);
    for (const group of groups) {
      this.renderGroup(group);
    }
    if (archivedCount > 0) {
      const archived = DOM.append(this.contentContainer, $(".voice-transcripts-archived-note"));
      archived.style.marginTop = "12px";
      archived.style.fontSize = "11px";
      archived.style.color = "var(--vscode-descriptionForeground)";
      archived.style.fontStyle = "italic";
      archived.textContent = localize(
        "voiceTranscripts.archivedNote",
        "{0} archived turn{1} hidden.",
        archivedCount,
        archivedCount === 1 ? "" : "s"
      );
    }
  }
  renderGroup(group) {
    if (!this.contentContainer) {
      return;
    }
    const groupEl = DOM.append(this.contentContainer, $(".voice-transcripts-group"));
    groupEl.style.marginBottom = "14px";
    const heading = DOM.append(groupEl, $(".voice-transcripts-group-heading"));
    heading.textContent = group.label;
    heading.style.fontSize = "11px";
    heading.style.fontWeight = "600";
    heading.style.textTransform = "uppercase";
    heading.style.letterSpacing = "0.5px";
    heading.style.color = "var(--vscode-descriptionForeground)";
    heading.style.padding = "4px 0 6px";
    heading.style.borderBottom = "1px solid var(--vscode-editorWhitespace-foreground)";
    heading.style.marginBottom = "4px";
    for (const pair of group.pairs) {
      this.renderPair(groupEl, pair);
    }
  }
  renderPair(parent, pair) {
    const pairEl = DOM.append(parent, $(".voice-transcripts-pair"));
    pairEl.style.padding = "6px 0";
    pairEl.style.borderBottom = "1px solid var(--vscode-editorWhitespace-foreground)";
    const time = DOM.append(pairEl, $(".voice-transcripts-time"));
    time.textContent = formatTime(pair.timestamp);
    time.style.fontSize = "10px";
    time.style.color = "var(--vscode-descriptionForeground)";
    time.style.marginBottom = "4px";
    if (pair.user) {
      this.renderRow(pairEl, "You", pair.user.text);
    }
    if (pair.assistant) {
      this.renderRow(pairEl, "Voice", pair.assistant.text);
    }
  }
  renderRow(parent, label, text) {
    const row = DOM.append(parent, $(".voice-transcripts-row"));
    row.style.display = "flex";
    row.style.gap = "6px";
    row.style.alignItems = "baseline";
    row.style.marginBottom = "3px";
    row.style.lineHeight = "1.4";
    const labelEl = DOM.append(row, $("span"));
    labelEl.textContent = `${label}:`;
    labelEl.style.fontSize = "11px";
    labelEl.style.fontWeight = "600";
    labelEl.style.color = "var(--vscode-descriptionForeground)";
    labelEl.style.flex = "0 0 auto";
    labelEl.style.minWidth = "32px";
    const textEl = DOM.append(row, $("span"));
    textEl.textContent = text;
    textEl.style.fontSize = "13px";
    textEl.style.color = "var(--vscode-foreground)";
    textEl.style.whiteSpace = "pre-wrap";
    textEl.style.wordBreak = "break-word";
  }
};
VoiceTranscriptsViewPane.ID = "workbench.view.voiceTranscripts";
VoiceTranscriptsViewPane = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IVoiceTranscriptStore),
  __decorateParam(11, IAuthenticationService),
  __decorateParam(12, IVoiceSessionController),
  __decorateParam(13, ILogService)
], VoiceTranscriptsViewPane);
function formatTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString(void 0, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function groupTurnsByTime(turns) {
  if (turns.length === 0) {
    return [];
  }
  const now = /* @__PURE__ */ new Date();
  const today = startOfDay(now);
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1e3);
  const weekStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1e3);
  const monthStart = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1e3);
  const buckets = [
    { label: localize("voiceTranscripts.today", "Today"), pairs: [] },
    { label: localize("voiceTranscripts.yesterday", "Yesterday"), pairs: [] },
    { label: localize("voiceTranscripts.earlierWeek", "Earlier this week"), pairs: [] },
    { label: localize("voiceTranscripts.earlierMonth", "Earlier this month"), pairs: [] },
    { label: localize("voiceTranscripts.older", "Older"), pairs: [] }
  ];
  for (const turn of turns) {
    const ts = new Date(turn.timestamp);
    let bucket;
    if (ts >= today) {
      bucket = buckets[0];
    } else if (ts >= yesterday) {
      bucket = buckets[1];
    } else if (ts >= weekStart) {
      bucket = buckets[2];
    } else if (ts >= monthStart) {
      bucket = buckets[3];
    } else {
      bucket = buckets[4];
    }
    const last = bucket.pairs[bucket.pairs.length - 1];
    if (turn.role === "user") {
      bucket.pairs.push({ user: turn, timestamp: turn.timestamp });
    } else if (last && !last.assistant) {
      last.assistant = turn;
    } else {
      bucket.pairs.push({ assistant: turn, timestamp: turn.timestamp });
    }
  }
  return buckets;
}
export {
  VoiceTranscriptsViewPane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGFnZW50c1ZvaWNlXFxicm93c2VyXFx0cmFuc2NyaXB0c1ZpZXdcXHZvaWNlVHJhbnNjcmlwdHNWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVmlld1BhbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElWaWV3bGV0Vmlld09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdzVmlld2xldC5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIsIHR5cGUgVm9pY2VTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC92b2ljZVNlc3Npb25Db250cm9sbGVyLmpzJztcbmltcG9ydCB7IElWb2ljZVRyYW5zY3JpcHRTdG9yZSwgSVZvaWNlVHJhbnNjcmlwdFR1cm4gfSBmcm9tICcuLi8uLi9jb21tb24vdm9pY2VUcmFuc2NyaXB0U3RvcmUuanMnO1xuXG5jb25zdCAkID0gRE9NLiQ7XG5cbnR5cGUgUGFpciA9IHsgdXNlcj86IElWb2ljZVRyYW5zY3JpcHRUdXJuOyBhc3Npc3RhbnQ/OiBJVm9pY2VUcmFuc2NyaXB0VHVybjsgdGltZXN0YW1wOiBzdHJpbmcgfTtcbnR5cGUgR3JvdXAgPSB7IGxhYmVsOiBzdHJpbmc7IHBhaXJzOiBQYWlyW10gfTtcblxuLyoqXG4gKiBTaWRlLXBhbmVsIHZpZXcgdGhhdCBsaXN0cyB0aGUgdXNlcidzIHBlcnNpc3RlZCB2b2ljZS1jb252ZXJzYXRpb24gdHVybnMsXG4gKiBncm91cGVkIGJ5IHJlbGF0aXZlIHRpbWUgYnVja2V0LiBEaXNwbGF5LW9ubHkgXHUyMDE0IHJlYWQgZnJvbSB0aGUgbG9jYWxcbiAqIHZvaWNlVHJhbnNjcmlwdFN0b3JlIChKU09OTCBvbiBkaXNrKS5cbiAqL1xuZXhwb3J0IGNsYXNzIFZvaWNlVHJhbnNjcmlwdHNWaWV3UGFuZSBleHRlbmRzIFZpZXdQYW5lIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLnZpZXcudm9pY2VUcmFuc2NyaXB0cyc7XG5cblx0cHJpdmF0ZSBjb250ZW50Q29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBlbXB0eVN0YXRlOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHQvKiogQ2FjaGVkIGxvZ2luIHJlc29sdmVkIG9uIGZpcnN0IHJlbmRlciwgcmVmcmVzaGVkIGxhemlseSBvbiBlYWNoIHJlZnJlc2goKS4gKi9cblx0cHJpdmF0ZSB1c2VyTG9naW46IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJVmlld2xldFZpZXdPcHRpb25zLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJVm9pY2VUcmFuc2NyaXB0U3RvcmUgcHJpdmF0ZSByZWFkb25seSB2b2ljZVRyYW5zY3JpcHRTdG9yZTogSVZvaWNlVHJhbnNjcmlwdFN0b3JlLFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdEBJVm9pY2VTZXNzaW9uQ29udHJvbGxlciBwcml2YXRlIHJlYWRvbmx5IHZvaWNlU2Vzc2lvbkNvbnRyb2xsZXI6IElWb2ljZVNlc3Npb25Db250cm9sbGVyLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihcblx0XHRcdG9wdGlvbnMsXG5cdFx0XHRrZXliaW5kaW5nU2VydmljZSxcblx0XHRcdGNvbnRleHRNZW51U2VydmljZSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHR2aWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdG9wZW5lclNlcnZpY2UsXG5cdFx0XHR0aGVtZVNlcnZpY2UsXG5cdFx0XHRob3ZlclNlcnZpY2UsXG5cdFx0KTtcblxuXHRcdC8vIEF1dG8tcmVmcmVzaCB3aGVuIGEgdm9pY2UgdHVybiBjb21wbGV0ZXM6IHN0YXRlIGdvZXMgZnJvbSBhXG5cdFx0Ly8gbWlkLXR1cm4gdmFsdWUgKHNwZWFraW5nL3Byb2Nlc3NpbmcpIGJhY2sgdG8gaWRsZS9saXN0ZW5pbmcuIFRoZVxuXHRcdC8vIHRyYW5zY3JpcHQgc3RvcmUgaGFzIGJlZW4gd3JpdHRlbiBieSB0aGVuLlxuXHRcdGxldCBsYXN0U3RhdGU6IFZvaWNlU3RhdGUgfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIudm9pY2VTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB3YXNNaWRUdXJuID0gbGFzdFN0YXRlID09PSAnc3BlYWtpbmcnIHx8IGxhc3RTdGF0ZSA9PT0gJ3Byb2Nlc3NpbmcnO1xuXHRcdFx0Y29uc3Qgbm93SWRsZSA9IHN0YXRlID09PSAnaWRsZScgfHwgc3RhdGUgPT09ICdsaXN0ZW5pbmcnO1xuXHRcdFx0bGFzdFN0YXRlID0gc3RhdGU7XG5cdFx0XHRpZiAod2FzTWlkVHVybiAmJiBub3dJZGxlICYmIHRoaXMuaXNCb2R5VmlzaWJsZSgpKSB7XG5cdFx0XHRcdHZvaWQgdGhpcy5yZWZyZXNoKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgndm9pY2UtdHJhbnNjcmlwdHMtdmlldycpO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5mbGV4RGlyZWN0aW9uID0gJ2NvbHVtbic7XG5cdFx0Y29udGFpbmVyLnN0eWxlLm92ZXJmbG93ID0gJ2hpZGRlbic7XG5cblx0XHR0aGlzLmNvbnRlbnRDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnZvaWNlLXRyYW5zY3JpcHRzLWNvbnRlbnQnKSk7XG5cdFx0dGhpcy5jb250ZW50Q29udGFpbmVyLnN0eWxlLmZsZXggPSAnMSc7XG5cdFx0dGhpcy5jb250ZW50Q29udGFpbmVyLnN0eWxlLm92ZXJmbG93WSA9ICdhdXRvJztcblx0XHR0aGlzLmNvbnRlbnRDb250YWluZXIuc3R5bGUucGFkZGluZyA9ICc2cHggMTJweCAxMnB4Jztcblx0XHR0aGlzLmNvbnRlbnRDb250YWluZXIuc3R5bGUuZm9udFNpemUgPSAnMTNweCc7XG5cblx0XHR0aGlzLmVtcHR5U3RhdGUgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnZvaWNlLXRyYW5zY3JpcHRzLWVtcHR5JykpO1xuXHRcdHRoaXMuZW1wdHlTdGF0ZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuZW1wdHlTdGF0ZS5zdHlsZS5wYWRkaW5nID0gJzI0cHggMTZweCc7XG5cdFx0dGhpcy5lbXB0eVN0YXRlLnN0eWxlLnRleHRBbGlnbiA9ICdjZW50ZXInO1xuXHRcdHRoaXMuZW1wdHlTdGF0ZS5zdHlsZS5jb2xvciA9ICd2YXIoLS12c2NvZGUtZGVzY3JpcHRpb25Gb3JlZ3JvdW5kKSc7XG5cdFx0dGhpcy5lbXB0eVN0YXRlLnN0eWxlLmZvbnRTaXplID0gJzEzcHgnO1xuXHRcdHRoaXMuZW1wdHlTdGF0ZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKFxuXHRcdFx0J3ZvaWNlVHJhbnNjcmlwdHMuZW1wdHknLFxuXHRcdFx0XCJObyB0cmFuc2NyaXB0cyB5ZXQuIFN0YXJ0IGEgdm9pY2UgY29udmVyc2F0aW9uIHRvIHBvcHVsYXRlIHRoaXMgdmlldy5cIlxuXHRcdCk7XG5cblx0XHR2b2lkIHRoaXMucmVmcmVzaCgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGxheW91dEJvZHkoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5sYXlvdXRCb2R5KGhlaWdodCwgd2lkdGgpO1xuXHRcdC8vIE5hdGl2ZSBWaWV3UGFuZSBoYW5kbGVzIG91dGVyIGNocm9tZSBcdTIwMTQgb3VyIGNvbnRlbnQgaXMgbmF0dXJhbGx5IHNjcm9sbGFibGUuXG5cdH1cblxuXHQvKipcblx0ICogUmUtcmVhZCB0aGUgdHJhbnNjcmlwdCBKU09OTCBhbmQgcmUtcmVuZGVyLiBDaGVhcDsgdGhlIGZpbGUgaXMgdGV4dC1vbmx5XG5cdCAqIGFuZCBib3VuZGVkIGJ5IHRoZSB1c2VyJ3MgYWN0dWFsIHVzYWdlLlxuXHQgKi9cblx0YXN5bmMgcmVmcmVzaCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuY29udGVudENvbnRhaW5lciB8fCAhdGhpcy5lbXB0eVN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMudXNlckxvZ2luID0gYXdhaXQgdGhpcy5yZXNvbHZlVXNlckxvZ2luKCk7XG5cdFx0XHRpZiAoIXRoaXMudXNlckxvZ2luKSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyRW1wdHkoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdHVybnMgPSBhd2FpdCB0aGlzLnZvaWNlVHJhbnNjcmlwdFN0b3JlLmxvYWRUdXJucyh0aGlzLnVzZXJMb2dpbik7XG5cdFx0XHRjb25zdCBpbmRleEVudHJ5ID0gdGhpcy52b2ljZVRyYW5zY3JpcHRTdG9yZS5nZXRJbmRleEVudHJ5KHRoaXMudXNlckxvZ2luKTtcblx0XHRcdGNvbnN0IGFyY2hpdmVDdXRvZmYgPSBpbmRleEVudHJ5Py5hcmNoaXZlZEJlZm9yZTtcblx0XHRcdC8vIE9ubHkgdm9pY2Utc3Bva2VuIGVudHJpZXMgYXJlIHVzZXItdmlzaWJsZS4gYGBhZ2VudF90b29sX2NhbGxgYCBhbmRcblx0XHRcdC8vIGBgY29kaW5nX2V2ZW50YGAgcm93cyBsaXZlIGluIHRoZSBzYW1lIEpTT05MIHNvIHRoZXkgY2FuIGJlXG5cdFx0XHQvLyByZXBsYXllZCB0byB0aGUgYmFja2VuZCBhcyBjcm9zcy1zZXNzaW9uIGNvbnRleHQsIGJ1dCB0aGV5XG5cdFx0XHQvLyB3b3VsZCBjbHV0dGVyIHRoZSB0cmFuc2NyaXB0IHZpZXcgKGFuZCBhIHVzZXIgcmVhZGluZyB0aGVcblx0XHRcdC8vIHRyYW5zY3JpcHQgZXhwZWN0cyBvbmx5IHRoZSBzcG9rZW4gY29udmVyc2F0aW9uKS5cblx0XHRcdGNvbnN0IHNwb2tlbiA9IHR1cm5zLmZpbHRlcih0ID0+IHQua2luZCA9PT0gJ3VzZXJfdm9pY2UnIHx8IHQua2luZCA9PT0gJ2FnZW50X3ZvaWNlJyk7XG5cdFx0XHRjb25zdCB2aXNpYmxlID0gYXJjaGl2ZUN1dG9mZlxuXHRcdFx0XHQ/IHNwb2tlbi5maWx0ZXIodCA9PiB0LnRpbWVzdGFtcCA+PSBhcmNoaXZlQ3V0b2ZmKVxuXHRcdFx0XHQ6IHNwb2tlbjtcblx0XHRcdGNvbnN0IGFyY2hpdmVkQ291bnQgPSBzcG9rZW4ubGVuZ3RoIC0gdmlzaWJsZS5sZW5ndGg7XG5cblx0XHRcdGlmICh2aXNpYmxlLmxlbmd0aCA9PT0gMCAmJiBhcmNoaXZlZENvdW50ID09PSAwKSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyRW1wdHkoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnJlbmRlclR1cm5zKHZpc2libGUsIGFyY2hpdmVkQ291bnQpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ1t2b2ljZVRyYW5zY3JpcHRzXSByZWZyZXNoIGZhaWxlZCcsIGVycik7XG5cdFx0XHR0aGlzLnJlbmRlckVtcHR5KCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgYXJjaGl2ZUFsbCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMudXNlckxvZ2luKSB7XG5cdFx0XHR0aGlzLnVzZXJMb2dpbiA9IGF3YWl0IHRoaXMucmVzb2x2ZVVzZXJMb2dpbigpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMudXNlckxvZ2luKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGN1dG9mZiA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy52b2ljZVRyYW5zY3JpcHRTdG9yZS5hcmNoaXZlVXBUbyh0aGlzLnVzZXJMb2dpbiwgY3V0b2ZmKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbdm9pY2VUcmFuc2NyaXB0c10gYXJjaGl2ZVVwVG8gZmFpbGVkJywgZXJyKTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5yZWZyZXNoKCk7XG5cdH1cblxuXHRhc3luYyBkZWxldGVBbGwoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnVzZXJMb2dpbikge1xuXHRcdFx0dGhpcy51c2VyTG9naW4gPSBhd2FpdCB0aGlzLnJlc29sdmVVc2VyTG9naW4oKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLnVzZXJMb2dpbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy52b2ljZVRyYW5zY3JpcHRTdG9yZS5kZWxldGVBbGwodGhpcy51c2VyTG9naW4pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ1t2b2ljZVRyYW5zY3JpcHRzXSBkZWxldGVBbGwgZmFpbGVkJywgZXJyKTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5yZWZyZXNoKCk7XG5cdH1cblxuXHQvLyAtLS0gSW50ZXJuYWxzIC0tLVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZVVzZXJMb2dpbigpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFNlc3Npb25zKCdnaXRodWInKTtcblx0XHRcdHJldHVybiBzZXNzaW9uc1swXT8uYWNjb3VudC5sYWJlbDtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbdm9pY2VUcmFuc2NyaXB0c10gZmFpbGVkIHRvIHJlc29sdmUgZ2l0aHViIHNlc3Npb24nLCBlcnIpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckVtcHR5KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jb250ZW50Q29udGFpbmVyIHx8ICF0aGlzLmVtcHR5U3RhdGUpIHsgcmV0dXJuOyB9XG5cdFx0RE9NLmNsZWFyTm9kZSh0aGlzLmNvbnRlbnRDb250YWluZXIpO1xuXHRcdHRoaXMuY29udGVudENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuZW1wdHlTdGF0ZS5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyVHVybnModHVybnM6IHJlYWRvbmx5IElWb2ljZVRyYW5zY3JpcHRUdXJuW10sIGFyY2hpdmVkQ291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jb250ZW50Q29udGFpbmVyIHx8ICF0aGlzLmVtcHR5U3RhdGUpIHsgcmV0dXJuOyB9XG5cdFx0dGhpcy5lbXB0eVN0YXRlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5jb250ZW50Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuXHRcdERPTS5jbGVhck5vZGUodGhpcy5jb250ZW50Q29udGFpbmVyKTtcblxuXHRcdGNvbnN0IGdyb3VwcyA9IGdyb3VwVHVybnNCeVRpbWUodHVybnMpLmZpbHRlcihnID0+IGcucGFpcnMubGVuZ3RoID4gMCk7XG5cblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIGdyb3Vwcykge1xuXHRcdFx0dGhpcy5yZW5kZXJHcm91cChncm91cCk7XG5cdFx0fVxuXG5cdFx0aWYgKGFyY2hpdmVkQ291bnQgPiAwKSB7XG5cdFx0XHRjb25zdCBhcmNoaXZlZCA9IERPTS5hcHBlbmQodGhpcy5jb250ZW50Q29udGFpbmVyLCAkKCcudm9pY2UtdHJhbnNjcmlwdHMtYXJjaGl2ZWQtbm90ZScpKTtcblx0XHRcdGFyY2hpdmVkLnN0eWxlLm1hcmdpblRvcCA9ICcxMnB4Jztcblx0XHRcdGFyY2hpdmVkLnN0eWxlLmZvbnRTaXplID0gJzExcHgnO1xuXHRcdFx0YXJjaGl2ZWQuc3R5bGUuY29sb3IgPSAndmFyKC0tdnNjb2RlLWRlc2NyaXB0aW9uRm9yZWdyb3VuZCknO1xuXHRcdFx0YXJjaGl2ZWQuc3R5bGUuZm9udFN0eWxlID0gJ2l0YWxpYyc7XG5cdFx0XHRhcmNoaXZlZC50ZXh0Q29udGVudCA9IGxvY2FsaXplKFxuXHRcdFx0XHQndm9pY2VUcmFuc2NyaXB0cy5hcmNoaXZlZE5vdGUnLFxuXHRcdFx0XHRcInswfSBhcmNoaXZlZCB0dXJuezF9IGhpZGRlbi5cIixcblx0XHRcdFx0YXJjaGl2ZWRDb3VudCxcblx0XHRcdFx0YXJjaGl2ZWRDb3VudCA9PT0gMSA/ICcnIDogJ3MnXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyR3JvdXAoZ3JvdXA6IEdyb3VwKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNvbnRlbnRDb250YWluZXIpIHsgcmV0dXJuOyB9XG5cdFx0Y29uc3QgZ3JvdXBFbCA9IERPTS5hcHBlbmQodGhpcy5jb250ZW50Q29udGFpbmVyLCAkKCcudm9pY2UtdHJhbnNjcmlwdHMtZ3JvdXAnKSk7XG5cdFx0Z3JvdXBFbC5zdHlsZS5tYXJnaW5Cb3R0b20gPSAnMTRweCc7XG5cblx0XHRjb25zdCBoZWFkaW5nID0gRE9NLmFwcGVuZChncm91cEVsLCAkKCcudm9pY2UtdHJhbnNjcmlwdHMtZ3JvdXAtaGVhZGluZycpKTtcblx0XHRoZWFkaW5nLnRleHRDb250ZW50ID0gZ3JvdXAubGFiZWw7XG5cdFx0aGVhZGluZy5zdHlsZS5mb250U2l6ZSA9ICcxMXB4Jztcblx0XHRoZWFkaW5nLnN0eWxlLmZvbnRXZWlnaHQgPSAnNjAwJztcblx0XHRoZWFkaW5nLnN0eWxlLnRleHRUcmFuc2Zvcm0gPSAndXBwZXJjYXNlJztcblx0XHRoZWFkaW5nLnN0eWxlLmxldHRlclNwYWNpbmcgPSAnMC41cHgnO1xuXHRcdGhlYWRpbmcuc3R5bGUuY29sb3IgPSAndmFyKC0tdnNjb2RlLWRlc2NyaXB0aW9uRm9yZWdyb3VuZCknO1xuXHRcdGhlYWRpbmcuc3R5bGUucGFkZGluZyA9ICc0cHggMCA2cHgnO1xuXHRcdGhlYWRpbmcuc3R5bGUuYm9yZGVyQm90dG9tID0gJzFweCBzb2xpZCB2YXIoLS12c2NvZGUtZWRpdG9yV2hpdGVzcGFjZS1mb3JlZ3JvdW5kKSc7XG5cdFx0aGVhZGluZy5zdHlsZS5tYXJnaW5Cb3R0b20gPSAnNHB4JztcblxuXHRcdGZvciAoY29uc3QgcGFpciBvZiBncm91cC5wYWlycykge1xuXHRcdFx0dGhpcy5yZW5kZXJQYWlyKGdyb3VwRWwsIHBhaXIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyUGFpcihwYXJlbnQ6IEhUTUxFbGVtZW50LCBwYWlyOiBQYWlyKTogdm9pZCB7XG5cdFx0Y29uc3QgcGFpckVsID0gRE9NLmFwcGVuZChwYXJlbnQsICQoJy52b2ljZS10cmFuc2NyaXB0cy1wYWlyJykpO1xuXHRcdHBhaXJFbC5zdHlsZS5wYWRkaW5nID0gJzZweCAwJztcblx0XHRwYWlyRWwuc3R5bGUuYm9yZGVyQm90dG9tID0gJzFweCBzb2xpZCB2YXIoLS12c2NvZGUtZWRpdG9yV2hpdGVzcGFjZS1mb3JlZ3JvdW5kKSc7XG5cblx0XHRjb25zdCB0aW1lID0gRE9NLmFwcGVuZChwYWlyRWwsICQoJy52b2ljZS10cmFuc2NyaXB0cy10aW1lJykpO1xuXHRcdHRpbWUudGV4dENvbnRlbnQgPSBmb3JtYXRUaW1lKHBhaXIudGltZXN0YW1wKTtcblx0XHR0aW1lLnN0eWxlLmZvbnRTaXplID0gJzEwcHgnO1xuXHRcdHRpbWUuc3R5bGUuY29sb3IgPSAndmFyKC0tdnNjb2RlLWRlc2NyaXB0aW9uRm9yZWdyb3VuZCknO1xuXHRcdHRpbWUuc3R5bGUubWFyZ2luQm90dG9tID0gJzRweCc7XG5cblx0XHRpZiAocGFpci51c2VyKSB7XG5cdFx0XHR0aGlzLnJlbmRlclJvdyhwYWlyRWwsICdZb3UnLCBwYWlyLnVzZXIudGV4dCk7XG5cdFx0fVxuXHRcdGlmIChwYWlyLmFzc2lzdGFudCkge1xuXHRcdFx0dGhpcy5yZW5kZXJSb3cocGFpckVsLCAnVm9pY2UnLCBwYWlyLmFzc2lzdGFudC50ZXh0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclJvdyhwYXJlbnQ6IEhUTUxFbGVtZW50LCBsYWJlbDogc3RyaW5nLCB0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCByb3cgPSBET00uYXBwZW5kKHBhcmVudCwgJCgnLnZvaWNlLXRyYW5zY3JpcHRzLXJvdycpKTtcblx0XHRyb3cuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0XHRyb3cuc3R5bGUuZ2FwID0gJzZweCc7XG5cdFx0cm93LnN0eWxlLmFsaWduSXRlbXMgPSAnYmFzZWxpbmUnO1xuXHRcdHJvdy5zdHlsZS5tYXJnaW5Cb3R0b20gPSAnM3B4Jztcblx0XHRyb3cuc3R5bGUubGluZUhlaWdodCA9ICcxLjQnO1xuXG5cdFx0Y29uc3QgbGFiZWxFbCA9IERPTS5hcHBlbmQocm93LCAkKCdzcGFuJykpO1xuXHRcdGxhYmVsRWwudGV4dENvbnRlbnQgPSBgJHtsYWJlbH06YDtcblx0XHRsYWJlbEVsLnN0eWxlLmZvbnRTaXplID0gJzExcHgnO1xuXHRcdGxhYmVsRWwuc3R5bGUuZm9udFdlaWdodCA9ICc2MDAnO1xuXHRcdGxhYmVsRWwuc3R5bGUuY29sb3IgPSAndmFyKC0tdnNjb2RlLWRlc2NyaXB0aW9uRm9yZWdyb3VuZCknO1xuXHRcdGxhYmVsRWwuc3R5bGUuZmxleCA9ICcwIDAgYXV0byc7XG5cdFx0bGFiZWxFbC5zdHlsZS5taW5XaWR0aCA9ICczMnB4JztcblxuXHRcdGNvbnN0IHRleHRFbCA9IERPTS5hcHBlbmQocm93LCAkKCdzcGFuJykpO1xuXHRcdHRleHRFbC50ZXh0Q29udGVudCA9IHRleHQ7XG5cdFx0dGV4dEVsLnN0eWxlLmZvbnRTaXplID0gJzEzcHgnO1xuXHRcdHRleHRFbC5zdHlsZS5jb2xvciA9ICd2YXIoLS12c2NvZGUtZm9yZWdyb3VuZCknO1xuXHRcdHRleHRFbC5zdHlsZS53aGl0ZVNwYWNlID0gJ3ByZS13cmFwJztcblx0XHR0ZXh0RWwuc3R5bGUud29yZEJyZWFrID0gJ2JyZWFrLXdvcmQnO1xuXHR9XG59XG5cbi8vIC0tLSBIZWxwZXJzIC0tLVxuXG5mdW5jdGlvbiBmb3JtYXRUaW1lKHRpbWVzdGFtcDogc3RyaW5nKTogc3RyaW5nIHtcblx0dHJ5IHtcblx0XHRyZXR1cm4gbmV3IERhdGUodGltZXN0YW1wKS50b0xvY2FsZVRpbWVTdHJpbmcodW5kZWZpbmVkLCB7IGhvdXI6ICcyLWRpZ2l0JywgbWludXRlOiAnMi1kaWdpdCcgfSk7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiAnJztcblx0fVxufVxuXG5mdW5jdGlvbiBzdGFydE9mRGF5KGQ6IERhdGUpOiBEYXRlIHtcblx0cmV0dXJuIG5ldyBEYXRlKGQuZ2V0RnVsbFllYXIoKSwgZC5nZXRNb250aCgpLCBkLmdldERhdGUoKSk7XG59XG5cbi8qKlxuICogR3JvdXAgYSBmbGF0IGNocm9ub2xvZ2ljYWwgdHVybiBsaXN0IGludG8gcmVsYXRpdmUtdGltZSBidWNrZXRzLCBwYWlyaW5nXG4gKiBlYWNoIHVzZXIgdHVybiB3aXRoIHRoZSBzdWJzZXF1ZW50IGFzc2lzdGFudCB0dXJuIChhbmQgdmljZS12ZXJzYSBmb3JcbiAqIG9ycGhhbmVkIGFzc2lzdGFudC1vbmx5IHR1cm5zIHByb2R1Y2VkIGJ5IHByb2FjdGl2ZSBuYXJyYXRpb24pLlxuICovXG5mdW5jdGlvbiBncm91cFR1cm5zQnlUaW1lKHR1cm5zOiByZWFkb25seSBJVm9pY2VUcmFuc2NyaXB0VHVybltdKTogR3JvdXBbXSB7XG5cdGlmICh0dXJucy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuXHRjb25zdCB0b2RheSA9IHN0YXJ0T2ZEYXkobm93KTtcblx0Y29uc3QgeWVzdGVyZGF5ID0gbmV3IERhdGUodG9kYXkuZ2V0VGltZSgpIC0gMjQgKiA2MCAqIDYwICogMTAwMCk7XG5cdGNvbnN0IHdlZWtTdGFydCA9IG5ldyBEYXRlKHRvZGF5LmdldFRpbWUoKSAtIDcgKiAyNCAqIDYwICogNjAgKiAxMDAwKTtcblx0Y29uc3QgbW9udGhTdGFydCA9IG5ldyBEYXRlKHRvZGF5LmdldFRpbWUoKSAtIDMwICogMjQgKiA2MCAqIDYwICogMTAwMCk7XG5cblx0Y29uc3QgYnVja2V0czogR3JvdXBbXSA9IFtcblx0XHR7IGxhYmVsOiBsb2NhbGl6ZSgndm9pY2VUcmFuc2NyaXB0cy50b2RheScsIFwiVG9kYXlcIiksIHBhaXJzOiBbXSB9LFxuXHRcdHsgbGFiZWw6IGxvY2FsaXplKCd2b2ljZVRyYW5zY3JpcHRzLnllc3RlcmRheScsIFwiWWVzdGVyZGF5XCIpLCBwYWlyczogW10gfSxcblx0XHR7IGxhYmVsOiBsb2NhbGl6ZSgndm9pY2VUcmFuc2NyaXB0cy5lYXJsaWVyV2VlaycsIFwiRWFybGllciB0aGlzIHdlZWtcIiksIHBhaXJzOiBbXSB9LFxuXHRcdHsgbGFiZWw6IGxvY2FsaXplKCd2b2ljZVRyYW5zY3JpcHRzLmVhcmxpZXJNb250aCcsIFwiRWFybGllciB0aGlzIG1vbnRoXCIpLCBwYWlyczogW10gfSxcblx0XHR7IGxhYmVsOiBsb2NhbGl6ZSgndm9pY2VUcmFuc2NyaXB0cy5vbGRlcicsIFwiT2xkZXJcIiksIHBhaXJzOiBbXSB9LFxuXHRdO1xuXG5cdGZvciAoY29uc3QgdHVybiBvZiB0dXJucykge1xuXHRcdGNvbnN0IHRzID0gbmV3IERhdGUodHVybi50aW1lc3RhbXApO1xuXHRcdGxldCBidWNrZXQ6IEdyb3VwO1xuXHRcdGlmICh0cyA+PSB0b2RheSkge1xuXHRcdFx0YnVja2V0ID0gYnVja2V0c1swXTtcblx0XHR9IGVsc2UgaWYgKHRzID49IHllc3RlcmRheSkge1xuXHRcdFx0YnVja2V0ID0gYnVja2V0c1sxXTtcblx0XHR9IGVsc2UgaWYgKHRzID49IHdlZWtTdGFydCkge1xuXHRcdFx0YnVja2V0ID0gYnVja2V0c1syXTtcblx0XHR9IGVsc2UgaWYgKHRzID49IG1vbnRoU3RhcnQpIHtcblx0XHRcdGJ1Y2tldCA9IGJ1Y2tldHNbM107XG5cdFx0fSBlbHNlIHtcblx0XHRcdGJ1Y2tldCA9IGJ1Y2tldHNbNF07XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFzdCA9IGJ1Y2tldC5wYWlyc1tidWNrZXQucGFpcnMubGVuZ3RoIC0gMV07XG5cdFx0aWYgKHR1cm4ucm9sZSA9PT0gJ3VzZXInKSB7XG5cdFx0XHRidWNrZXQucGFpcnMucHVzaCh7IHVzZXI6IHR1cm4sIHRpbWVzdGFtcDogdHVybi50aW1lc3RhbXAgfSk7XG5cdFx0fSBlbHNlIGlmIChsYXN0ICYmICFsYXN0LmFzc2lzdGFudCkge1xuXHRcdFx0bGFzdC5hc3Npc3RhbnQgPSB0dXJuO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRidWNrZXQucGFpcnMucHVzaCh7IGFzc2lzdGFudDogdHVybiwgdGltZXN0YW1wOiB0dXJuLnRpbWVzdGFtcCB9KTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gYnVja2V0cztcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLCtCQUFnRDtBQUN6RCxTQUFTLDZCQUFtRDtBQUU1RCxNQUFNLElBQUksSUFBSTtBQVVQLElBQU0sMkJBQU4sY0FBdUMsU0FBUztBQUFBLEVBVXRELFlBQ0MsU0FDb0IsbUJBQ0Msb0JBQ0Usc0JBQ0gsbUJBQ0ksdUJBQ0Qsc0JBQ1AsZUFDRCxjQUNBLGNBQ3lCLHNCQUNDLHVCQUNDLHdCQUNaLFlBQzdCO0FBQ0Q7QUFBQSxNQUNDO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQWhCd0M7QUFDQztBQUNDO0FBQ1o7QUFrQjlCLFFBQUk7QUFDSixTQUFLLFVBQVUsUUFBUSxZQUFV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
