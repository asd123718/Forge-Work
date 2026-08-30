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
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
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
let VoiceEventStreamViewPane = class extends ViewPane {
  constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, voiceTranscriptStore, authenticationService, voiceSessionController, clipboardService, logService) {
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
    this.clipboardService = clipboardService;
    this.logService = logService;
    this.currentTurns = [];
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
    container.classList.add("voice-event-stream-view");
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.overflow = "hidden";
    this.contentContainer = DOM.append(container, $(".voice-event-stream-content"));
    this.contentContainer.style.flex = "1";
    this.contentContainer.style.overflowY = "auto";
    this.contentContainer.style.padding = "6px 12px 12px";
    this.contentContainer.style.fontSize = "12px";
    this.emptyState = DOM.append(container, $(".voice-event-stream-empty"));
    this.emptyState.style.display = "none";
    this.emptyState.style.padding = "24px 16px";
    this.emptyState.style.textAlign = "center";
    this.emptyState.style.color = "var(--vscode-descriptionForeground)";
    this.emptyState.style.fontSize = "13px";
    this.emptyState.textContent = localize(
      "voiceEventStream.empty",
      "No events yet. Start a voice conversation to populate this view."
    );
    void this.refresh();
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
  }
  async refresh() {
    if (!this.contentContainer || !this.emptyState) {
      return;
    }
    try {
      this.userLogin = await this.resolveUserLogin();
      if (!this.userLogin) {
        this.currentTurns = [];
        this.renderEmpty();
        return;
      }
      const turns = await this.voiceTranscriptStore.loadTurns(this.userLogin);
      this.currentTurns = turns;
      if (turns.length === 0) {
        this.renderEmpty();
        return;
      }
      this.renderTurns(turns);
    } catch (err) {
      this.logService.warn("[voiceEventStream] refresh failed", err);
      this.currentTurns = [];
      this.renderEmpty();
    }
  }
  async copyEventStream() {
    if (this.currentTurns.length === 0) {
      await this.refresh();
    }
    if (this.currentTurns.length === 0) {
      return;
    }
    const serialized = this.currentTurns.map((turn) => JSON.stringify(turn)).join("\n");
    await this.clipboardService.writeText(serialized);
  }
  async resolveUserLogin() {
    try {
      const sessions = await this.authenticationService.getSessions("github");
      return sessions[0]?.account.label;
    } catch (err) {
      this.logService.warn("[voiceEventStream] failed to resolve github session", err);
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
  renderTurns(turns) {
    if (!this.contentContainer || !this.emptyState) {
      return;
    }
    this.emptyState.style.display = "none";
    this.contentContainer.style.display = "block";
    DOM.clearNode(this.contentContainer);
    for (const turn of turns) {
      this.renderTurn(turn);
    }
  }
  renderTurn(turn) {
    if (!this.contentContainer) {
      return;
    }
    const row = DOM.append(this.contentContainer, $(".voice-event-stream-row"));
    row.style.padding = "8px 0";
    row.style.borderBottom = "1px solid var(--vscode-editorWhitespace-foreground)";
    const header = DOM.append(row, $(".voice-event-stream-row-header"));
    header.style.display = "flex";
    header.style.gap = "8px";
    header.style.flexWrap = "wrap";
    header.style.alignItems = "baseline";
    header.style.marginBottom = "4px";
    const time = DOM.append(header, $("span"));
    time.textContent = formatTime(turn.timestamp);
    time.style.fontSize = "11px";
    time.style.color = "var(--vscode-descriptionForeground)";
    const kind = DOM.append(header, $("span"));
    kind.textContent = turn.kind;
    kind.style.fontSize = "11px";
    kind.style.padding = "1px 6px";
    kind.style.border = "1px solid var(--vscode-editorWhitespace-foreground)";
    kind.style.borderRadius = "10px";
    kind.style.color = "var(--vscode-descriptionForeground)";
    const role = DOM.append(header, $("span"));
    role.textContent = turn.role;
    role.style.fontSize = "11px";
    role.style.color = "var(--vscode-descriptionForeground)";
    const text = DOM.append(row, $("div"));
    text.textContent = turn.text;
    text.style.fontSize = "12px";
    text.style.color = "var(--vscode-foreground)";
    text.style.whiteSpace = "pre-wrap";
    text.style.wordBreak = "break-word";
    if (turn.metadata) {
      const metadata = DOM.append(row, $("pre"));
      metadata.textContent = JSON.stringify(turn.metadata, null, 2);
      metadata.style.margin = "6px 0 0";
      metadata.style.padding = "6px 8px";
      metadata.style.background = "var(--vscode-textCodeBlock-background)";
      metadata.style.borderRadius = "4px";
      metadata.style.fontSize = "11px";
      metadata.style.lineHeight = "1.4";
      metadata.style.color = "var(--vscode-descriptionForeground)";
      metadata.style.whiteSpace = "pre-wrap";
      metadata.style.wordBreak = "break-word";
    }
  }
};
VoiceEventStreamViewPane.ID = "workbench.view.voiceEventStream";
VoiceEventStreamViewPane = __decorateClass([
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
  __decorateParam(13, IClipboardService),
  __decorateParam(14, ILogService)
], VoiceEventStreamViewPane);
function formatTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp;
  }
}
export {
  VoiceEventStreamViewPane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGFnZW50c1ZvaWNlXFxicm93c2VyXFx0cmFuc2NyaXB0c1ZpZXdcXHZvaWNlRXZlbnRTdHJlYW1WaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVmlld1BhbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElWaWV3bGV0Vmlld09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdzVmlld2xldC5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIsIHR5cGUgVm9pY2VTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC92b2ljZVNlc3Npb25Db250cm9sbGVyLmpzJztcbmltcG9ydCB7IElWb2ljZVRyYW5zY3JpcHRTdG9yZSwgSVZvaWNlVHJhbnNjcmlwdFR1cm4gfSBmcm9tICcuLi8uLi9jb21tb24vdm9pY2VUcmFuc2NyaXB0U3RvcmUuanMnO1xuXG5jb25zdCAkID0gRE9NLiQ7XG5cbi8qKlxuICogU2lkZS1wYW5lbCBkZWJ1ZyB2aWV3IHRoYXQgcmVuZGVycyB0aGUgcmF3LCBwZXJzaXN0ZWQgdm9pY2UgZXZlbnQgc3RyZWFtLlxuICogVW5saWtlIHRoZSB0cmFuc2NyaXB0IHZpZXcsIHRoaXMgaW5jbHVkZXMgbm9uLXZvaWNlIHRpbWVsaW5lIGVudHJpZXNcbiAqICh0b29sIGNhbGxzIGFuZCBjb2RpbmcgZXZlbnRzKSwgYW5kIHN1cHBvcnRzIGNvcHlpbmcgdGhlIHN0cmVhbSBhcyBKU09OTC5cbiAqL1xuZXhwb3J0IGNsYXNzIFZvaWNlRXZlbnRTdHJlYW1WaWV3UGFuZSBleHRlbmRzIFZpZXdQYW5lIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLnZpZXcudm9pY2VFdmVudFN0cmVhbSc7XG5cblx0cHJpdmF0ZSBjb250ZW50Q29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBlbXB0eVN0YXRlOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHQvKiogQ2FjaGVkIGxvZ2luIHJlc29sdmVkIG9uIGZpcnN0IHJlbmRlciwgcmVmcmVzaGVkIGxhemlseSBvbiBlYWNoIHJlZnJlc2goKS4gKi9cblx0cHJpdmF0ZSB1c2VyTG9naW46IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjdXJyZW50VHVybnM6IHJlYWRvbmx5IElWb2ljZVRyYW5zY3JpcHRUdXJuW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJVmlld2xldFZpZXdPcHRpb25zLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJVm9pY2VUcmFuc2NyaXB0U3RvcmUgcHJpdmF0ZSByZWFkb25seSB2b2ljZVRyYW5zY3JpcHRTdG9yZTogSVZvaWNlVHJhbnNjcmlwdFN0b3JlLFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdEBJVm9pY2VTZXNzaW9uQ29udHJvbGxlciBwcml2YXRlIHJlYWRvbmx5IHZvaWNlU2Vzc2lvbkNvbnRyb2xsZXI6IElWb2ljZVNlc3Npb25Db250cm9sbGVyLFxuXHRcdEBJQ2xpcGJvYXJkU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihcblx0XHRcdG9wdGlvbnMsXG5cdFx0XHRrZXliaW5kaW5nU2VydmljZSxcblx0XHRcdGNvbnRleHRNZW51U2VydmljZSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHR2aWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdG9wZW5lclNlcnZpY2UsXG5cdFx0XHR0aGVtZVNlcnZpY2UsXG5cdFx0XHRob3ZlclNlcnZpY2UsXG5cdFx0KTtcblxuXHRcdGxldCBsYXN0U3RhdGU6IFZvaWNlU3RhdGUgfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIudm9pY2VTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB3YXNNaWRUdXJuID0gbGFzdFN0YXRlID09PSAnc3BlYWtpbmcnIHx8IGxhc3RTdGF0ZSA9PT0gJ3Byb2Nlc3NpbmcnO1xuXHRcdFx0Y29uc3Qgbm93SWRsZSA9IHN0YXRlID09PSAnaWRsZScgfHwgc3RhdGUgPT09ICdsaXN0ZW5pbmcnO1xuXHRcdFx0bGFzdFN0YXRlID0gc3RhdGU7XG5cdFx0XHRpZiAod2FzTWlkVHVybiAmJiBub3dJZGxlICYmIHRoaXMuaXNCb2R5VmlzaWJsZSgpKSB7XG5cdFx0XHRcdHZvaWQgdGhpcy5yZWZyZXNoKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgndm9pY2UtZXZlbnQtc3RyZWFtLXZpZXcnKTtcblx0XHRjb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0XHRjb250YWluZXIuc3R5bGUuZmxleERpcmVjdGlvbiA9ICdjb2x1bW4nO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nO1xuXG5cdFx0dGhpcy5jb250ZW50Q29udGFpbmVyID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy52b2ljZS1ldmVudC1zdHJlYW0tY29udGVudCcpKTtcblx0XHR0aGlzLmNvbnRlbnRDb250YWluZXIuc3R5bGUuZmxleCA9ICcxJztcblx0XHR0aGlzLmNvbnRlbnRDb250YWluZXIuc3R5bGUub3ZlcmZsb3dZID0gJ2F1dG8nO1xuXHRcdHRoaXMuY29udGVudENvbnRhaW5lci5zdHlsZS5wYWRkaW5nID0gJzZweCAxMnB4IDEycHgnO1xuXHRcdHRoaXMuY29udGVudENvbnRhaW5lci5zdHlsZS5mb250U2l6ZSA9ICcxMnB4JztcblxuXHRcdHRoaXMuZW1wdHlTdGF0ZSA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcudm9pY2UtZXZlbnQtc3RyZWFtLWVtcHR5JykpO1xuXHRcdHRoaXMuZW1wdHlTdGF0ZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuZW1wdHlTdGF0ZS5zdHlsZS5wYWRkaW5nID0gJzI0cHggMTZweCc7XG5cdFx0dGhpcy5lbXB0eVN0YXRlLnN0eWxlLnRleHRBbGlnbiA9ICdjZW50ZXInO1xuXHRcdHRoaXMuZW1wdHlTdGF0ZS5zdHlsZS5jb2xvciA9ICd2YXIoLS12c2NvZGUtZGVzY3JpcHRpb25Gb3JlZ3JvdW5kKSc7XG5cdFx0dGhpcy5lbXB0eVN0YXRlLnN0eWxlLmZvbnRTaXplID0gJzEzcHgnO1xuXHRcdHRoaXMuZW1wdHlTdGF0ZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKFxuXHRcdFx0J3ZvaWNlRXZlbnRTdHJlYW0uZW1wdHknLFxuXHRcdFx0XCJObyBldmVudHMgeWV0LiBTdGFydCBhIHZvaWNlIGNvbnZlcnNhdGlvbiB0byBwb3B1bGF0ZSB0aGlzIHZpZXcuXCJcblx0XHQpO1xuXG5cdFx0dm9pZCB0aGlzLnJlZnJlc2goKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBsYXlvdXRCb2R5KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0c3VwZXIubGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdGFzeW5jIHJlZnJlc2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmNvbnRlbnRDb250YWluZXIgfHwgIXRoaXMuZW1wdHlTdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLnVzZXJMb2dpbiA9IGF3YWl0IHRoaXMucmVzb2x2ZVVzZXJMb2dpbigpO1xuXHRcdFx0aWYgKCF0aGlzLnVzZXJMb2dpbikge1xuXHRcdFx0XHR0aGlzLmN1cnJlbnRUdXJucyA9IFtdO1xuXHRcdFx0XHR0aGlzLnJlbmRlckVtcHR5KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdHVybnMgPSBhd2FpdCB0aGlzLnZvaWNlVHJhbnNjcmlwdFN0b3JlLmxvYWRUdXJucyh0aGlzLnVzZXJMb2dpbik7XG5cdFx0XHR0aGlzLmN1cnJlbnRUdXJucyA9IHR1cm5zO1xuXG5cdFx0XHRpZiAodHVybnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyRW1wdHkoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnJlbmRlclR1cm5zKHR1cm5zKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbdm9pY2VFdmVudFN0cmVhbV0gcmVmcmVzaCBmYWlsZWQnLCBlcnIpO1xuXHRcdFx0dGhpcy5jdXJyZW50VHVybnMgPSBbXTtcblx0XHRcdHRoaXMucmVuZGVyRW1wdHkoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBjb3B5RXZlbnRTdHJlYW0oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuY3VycmVudFR1cm5zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0YXdhaXQgdGhpcy5yZWZyZXNoKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY3VycmVudFR1cm5zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSB0aGlzLmN1cnJlbnRUdXJuc1xuXHRcdFx0Lm1hcCh0dXJuID0+IEpTT04uc3RyaW5naWZ5KHR1cm4pKVxuXHRcdFx0LmpvaW4oJ1xcbicpO1xuXHRcdGF3YWl0IHRoaXMuY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQoc2VyaWFsaXplZCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVVc2VyTG9naW4oKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucygnZ2l0aHViJyk7XG5cdFx0XHRyZXR1cm4gc2Vzc2lvbnNbMF0/LmFjY291bnQubGFiZWw7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignW3ZvaWNlRXZlbnRTdHJlYW1dIGZhaWxlZCB0byByZXNvbHZlIGdpdGh1YiBzZXNzaW9uJywgZXJyKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJFbXB0eSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY29udGVudENvbnRhaW5lciB8fCAhdGhpcy5lbXB0eVN0YXRlKSB7IHJldHVybjsgfVxuXHRcdERPTS5jbGVhck5vZGUodGhpcy5jb250ZW50Q29udGFpbmVyKTtcblx0XHR0aGlzLmNvbnRlbnRDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0aGlzLmVtcHR5U3RhdGUuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclR1cm5zKHR1cm5zOiByZWFkb25seSBJVm9pY2VUcmFuc2NyaXB0VHVybltdKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNvbnRlbnRDb250YWluZXIgfHwgIXRoaXMuZW1wdHlTdGF0ZSkgeyByZXR1cm47IH1cblx0XHR0aGlzLmVtcHR5U3RhdGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0aGlzLmNvbnRlbnRDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0RE9NLmNsZWFyTm9kZSh0aGlzLmNvbnRlbnRDb250YWluZXIpO1xuXG5cdFx0Zm9yIChjb25zdCB0dXJuIG9mIHR1cm5zKSB7XG5cdFx0XHR0aGlzLnJlbmRlclR1cm4odHVybik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJUdXJuKHR1cm46IElWb2ljZVRyYW5zY3JpcHRUdXJuKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNvbnRlbnRDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByb3cgPSBET00uYXBwZW5kKHRoaXMuY29udGVudENvbnRhaW5lciwgJCgnLnZvaWNlLWV2ZW50LXN0cmVhbS1yb3cnKSk7XG5cdFx0cm93LnN0eWxlLnBhZGRpbmcgPSAnOHB4IDAnO1xuXHRcdHJvdy5zdHlsZS5ib3JkZXJCb3R0b20gPSAnMXB4IHNvbGlkIHZhcigtLXZzY29kZS1lZGl0b3JXaGl0ZXNwYWNlLWZvcmVncm91bmQpJztcblxuXHRcdGNvbnN0IGhlYWRlciA9IERPTS5hcHBlbmQocm93LCAkKCcudm9pY2UtZXZlbnQtc3RyZWFtLXJvdy1oZWFkZXInKSk7XG5cdFx0aGVhZGVyLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdFx0aGVhZGVyLnN0eWxlLmdhcCA9ICc4cHgnO1xuXHRcdGhlYWRlci5zdHlsZS5mbGV4V3JhcCA9ICd3cmFwJztcblx0XHRoZWFkZXIuc3R5bGUuYWxpZ25JdGVtcyA9ICdiYXNlbGluZSc7XG5cdFx0aGVhZGVyLnN0eWxlLm1hcmdpbkJvdHRvbSA9ICc0cHgnO1xuXG5cdFx0Y29uc3QgdGltZSA9IERPTS5hcHBlbmQoaGVhZGVyLCAkKCdzcGFuJykpO1xuXHRcdHRpbWUudGV4dENvbnRlbnQgPSBmb3JtYXRUaW1lKHR1cm4udGltZXN0YW1wKTtcblx0XHR0aW1lLnN0eWxlLmZvbnRTaXplID0gJzExcHgnO1xuXHRcdHRpbWUuc3R5bGUuY29sb3IgPSAndmFyKC0tdnNjb2RlLWRlc2NyaXB0aW9uRm9yZWdyb3VuZCknO1xuXG5cdFx0Y29uc3Qga2luZCA9IERPTS5hcHBlbmQoaGVhZGVyLCAkKCdzcGFuJykpO1xuXHRcdGtpbmQudGV4dENvbnRlbnQgPSB0dXJuLmtpbmQ7XG5cdFx0a2luZC5zdHlsZS5mb250U2l6ZSA9ICcxMXB4Jztcblx0XHRraW5kLnN0eWxlLnBhZGRpbmcgPSAnMXB4IDZweCc7XG5cdFx0a2luZC5zdHlsZS5ib3JkZXIgPSAnMXB4IHNvbGlkIHZhcigtLXZzY29kZS1lZGl0b3JXaGl0ZXNwYWNlLWZvcmVncm91bmQpJztcblx0XHRraW5kLnN0eWxlLmJvcmRlclJhZGl1cyA9ICcxMHB4Jztcblx0XHRraW5kLnN0eWxlLmNvbG9yID0gJ3ZhcigtLXZzY29kZS1kZXNjcmlwdGlvbkZvcmVncm91bmQpJztcblxuXHRcdGNvbnN0IHJvbGUgPSBET00uYXBwZW5kKGhlYWRlciwgJCgnc3BhbicpKTtcblx0XHRyb2xlLnRleHRDb250ZW50ID0gdHVybi5yb2xlO1xuXHRcdHJvbGUuc3R5bGUuZm9udFNpemUgPSAnMTFweCc7XG5cdFx0cm9sZS5zdHlsZS5jb2xvciA9ICd2YXIoLS12c2NvZGUtZGVzY3JpcHRpb25Gb3JlZ3JvdW5kKSc7XG5cblx0XHRjb25zdCB0ZXh0ID0gRE9NLmFwcGVuZChyb3csICQoJ2RpdicpKTtcblx0XHR0ZXh0LnRleHRDb250ZW50ID0gdHVybi50ZXh0O1xuXHRcdHRleHQuc3R5bGUuZm9udFNpemUgPSAnMTJweCc7XG5cdFx0dGV4dC5zdHlsZS5jb2xvciA9ICd2YXIoLS12c2NvZGUtZm9yZWdyb3VuZCknO1xuXHRcdHRleHQuc3R5bGUud2hpdGVTcGFjZSA9ICdwcmUtd3JhcCc7XG5cdFx0dGV4dC5zdHlsZS53b3JkQnJlYWsgPSAnYnJlYWstd29yZCc7XG5cblx0XHRpZiAodHVybi5tZXRhZGF0YSkge1xuXHRcdFx0Y29uc3QgbWV0YWRhdGEgPSBET00uYXBwZW5kKHJvdywgJCgncHJlJykpO1xuXHRcdFx0bWV0YWRhdGEudGV4dENvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh0dXJuLm1ldGFkYXRhLCBudWxsLCAyKTtcblx0XHRcdG1ldGFkYXRhLnN0eWxlLm1hcmdpbiA9ICc2cHggMCAwJztcblx0XHRcdG1ldGFkYXRhLnN0eWxlLnBhZGRpbmcgPSAnNnB4IDhweCc7XG5cdFx0XHRtZXRhZGF0YS5zdHlsZS5iYWNrZ3JvdW5kID0gJ3ZhcigtLXZzY29kZS10ZXh0Q29kZUJsb2NrLWJhY2tncm91bmQpJztcblx0XHRcdG1ldGFkYXRhLnN0eWxlLmJvcmRlclJhZGl1cyA9ICc0cHgnO1xuXHRcdFx0bWV0YWRhdGEuc3R5bGUuZm9udFNpemUgPSAnMTFweCc7XG5cdFx0XHRtZXRhZGF0YS5zdHlsZS5saW5lSGVpZ2h0ID0gJzEuNCc7XG5cdFx0XHRtZXRhZGF0YS5zdHlsZS5jb2xvciA9ICd2YXIoLS12c2NvZGUtZGVzY3JpcHRpb25Gb3JlZ3JvdW5kKSc7XG5cdFx0XHRtZXRhZGF0YS5zdHlsZS53aGl0ZVNwYWNlID0gJ3ByZS13cmFwJztcblx0XHRcdG1ldGFkYXRhLnN0eWxlLndvcmRCcmVhayA9ICdicmVhay13b3JkJztcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gZm9ybWF0VGltZSh0aW1lc3RhbXA6IHN0cmluZyk6IHN0cmluZyB7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIG5ldyBEYXRlKHRpbWVzdGFtcCkudG9Mb2NhbGVTdHJpbmcoKTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHRpbWVzdGFtcDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsK0JBQWdEO0FBQ3pELFNBQVMsNkJBQW1EO0FBRTVELE1BQU0sSUFBSSxJQUFJO0FBT1AsSUFBTSwyQkFBTixjQUF1QyxTQUFTO0FBQUEsRUFXdEQsWUFDQyxTQUNvQixtQkFDQyxvQkFDRSxzQkFDSCxtQkFDSSx1QkFDRCxzQkFDUCxlQUNELGNBQ0EsY0FDeUIsc0JBQ0MsdUJBQ0Msd0JBQ04sa0JBQ04sWUFDN0I7QUFDRDtBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7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
