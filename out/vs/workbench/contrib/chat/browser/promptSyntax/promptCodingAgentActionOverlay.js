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
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { OverlayWidgetPositionPreference } from "../../../../../editor/browser/editorBrowser.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { IRemoteCodingAgentsService } from "../../../remoteCodingAgents/common/remoteCodingAgentsService.js";
import { localize } from "../../../../../nls.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { PROMPT_LANGUAGE_ID } from "../../common/promptSyntax/promptTypes.js";
import { $ } from "../../../../../base/browser/dom.js";
import { IPromptsService } from "../../common/promptSyntax/service/promptsService.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
let PromptCodingAgentActionOverlayWidget = class extends Disposable {
  constructor(_editor, _commandService, _contextKeyService, _remoteCodingAgentService, _promptsService) {
    super();
    this._editor = _editor;
    this._commandService = _commandService;
    this._contextKeyService = _contextKeyService;
    this._remoteCodingAgentService = _remoteCodingAgentService;
    this._promptsService = _promptsService;
    this._isVisible = false;
    this._domNode = $(".prompt-coding-agent-action-overlay");
    this._button = this._register(new Button(this._domNode, {
      supportIcons: true,
      title: localize("runPromptWithCodingAgent", "Run prompt file in a remote coding agent")
    }));
    this._button.element.style.background = "var(--vscode-button-background)";
    this._button.element.style.color = "var(--vscode-button-foreground)";
    this._button.label = localize("runWithCodingAgent.label", "{0} Delegate to Copilot coding agent", "$(cloud-upload)");
    this._register(this._button.onDidClick(async () => {
      await this._execute();
    }));
    this._register(this._contextKeyService.onDidChangeContext(() => {
      this._updateVisibility();
    }));
    this._register(this._editor.onDidChangeModel(() => {
      this._updateVisibility();
    }));
    this._register(this._editor.onDidLayoutChange(() => {
      if (this._isVisible) {
        this._editor.layoutOverlayWidget(this);
      }
    }));
    this._updateVisibility();
  }
  getId() {
    return PromptCodingAgentActionOverlayWidget.ID;
  }
  getDomNode() {
    return this._domNode;
  }
  getPosition() {
    if (!this._isVisible) {
      return null;
    }
    return {
      preference: OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER
    };
  }
  _updateVisibility() {
    const enableRemoteCodingAgentPromptFileOverlay = ChatContextKeys.enableRemoteCodingAgentPromptFileOverlay.getValue(this._contextKeyService);
    const hasRemoteCodingAgent = ChatContextKeys.hasRemoteCodingAgent.getValue(this._contextKeyService);
    const model = this._editor.getModel();
    const isPromptFile = model?.getLanguageId() === PROMPT_LANGUAGE_ID;
    const shouldBeVisible = !!(isPromptFile && enableRemoteCodingAgentPromptFileOverlay && hasRemoteCodingAgent);
    if (shouldBeVisible !== this._isVisible) {
      this._isVisible = shouldBeVisible;
      if (this._isVisible) {
        this._editor.addOverlayWidget(this);
      } else {
        this._editor.removeOverlayWidget(this);
      }
    }
  }
  async _execute() {
    const model = this._editor.getModel();
    if (!model) {
      return;
    }
    this._button.enabled = false;
    try {
      const promptContent = model.getValue();
      const promptName = await this._promptsService.getPromptSlashCommandName(model.uri, CancellationToken.None);
      const agents = this._remoteCodingAgentService.getAvailableAgents();
      const agent = agents[0];
      if (!agent) {
        return;
      }
      await this._commandService.executeCommand(agent.command, {
        userPrompt: promptName,
        summary: promptContent,
        source: "prompt"
      });
    } finally {
      this._button.enabled = true;
    }
  }
  dispose() {
    if (this._isVisible) {
      this._editor.removeOverlayWidget(this);
    }
    super.dispose();
  }
};
PromptCodingAgentActionOverlayWidget.ID = "promptCodingAgentActionOverlay";
PromptCodingAgentActionOverlayWidget = __decorateClass([
  __decorateParam(1, ICommandService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IRemoteCodingAgentsService),
  __decorateParam(4, IPromptsService)
], PromptCodingAgentActionOverlayWidget);
export {
  PromptCodingAgentActionOverlayWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHByb21wdFN5bnRheFxccHJvbXB0Q29kaW5nQWdlbnRBY3Rpb25PdmVybGF5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgSU92ZXJsYXlXaWRnZXQsIElPdmVybGF5V2lkZ2V0UG9zaXRpb24sIE92ZXJsYXlXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQ29kaW5nQWdlbnRzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3JlbW90ZUNvZGluZ0FnZW50cy9jb21tb24vcmVtb3RlQ29kaW5nQWdlbnRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBQUk9NUFRfTEFOR1VBR0VfSUQgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7ICQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElQcm9tcHRzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5cbmV4cG9ydCBjbGFzcyBQcm9tcHRDb2RpbmdBZ2VudEFjdGlvbk92ZXJsYXlXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU92ZXJsYXlXaWRnZXQge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IElEID0gJ3Byb21wdENvZGluZ0FnZW50QWN0aW9uT3ZlcmxheSc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2J1dHRvbjogQnV0dG9uO1xuXHRwcml2YXRlIF9pc1Zpc2libGU6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElSZW1vdGVDb2RpbmdBZ2VudHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3JlbW90ZUNvZGluZ0FnZW50U2VydmljZTogSVJlbW90ZUNvZGluZ0FnZW50c1NlcnZpY2UsXG5cdFx0QElQcm9tcHRzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9tcHRzU2VydmljZTogSVByb21wdHNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fZG9tTm9kZSA9ICQoJy5wcm9tcHQtY29kaW5nLWFnZW50LWFjdGlvbi1vdmVybGF5Jyk7XG5cblx0XHR0aGlzLl9idXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKHRoaXMuX2RvbU5vZGUsIHtcblx0XHRcdHN1cHBvcnRJY29uczogdHJ1ZSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncnVuUHJvbXB0V2l0aENvZGluZ0FnZW50JywgXCJSdW4gcHJvbXB0IGZpbGUgaW4gYSByZW1vdGUgY29kaW5nIGFnZW50XCIpXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuc3R5bGUuYmFja2dyb3VuZCA9ICd2YXIoLS12c2NvZGUtYnV0dG9uLWJhY2tncm91bmQpJztcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5zdHlsZS5jb2xvciA9ICd2YXIoLS12c2NvZGUtYnV0dG9uLWZvcmVncm91bmQpJztcblx0XHR0aGlzLl9idXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgncnVuV2l0aENvZGluZ0FnZW50LmxhYmVsJywgXCJ7MH0gRGVsZWdhdGUgdG8gQ29waWxvdCBjb2RpbmcgYWdlbnRcIiwgJyQoY2xvdWQtdXBsb2FkKScpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYnV0dG9uLm9uRGlkQ2xpY2soYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy5fZXhlY3V0ZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlVmlzaWJpbGl0eSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVWaXNpYmlsaXR5KCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZExheW91dENoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMuX2VkaXRvci5sYXlvdXRPdmVybGF5V2lkZ2V0KHRoaXMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIGluaXRpYWwgdmlzaWJpbGl0eVxuXHRcdHRoaXMuX3VwZGF0ZVZpc2liaWxpdHkoKTtcblx0fVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFByb21wdENvZGluZ0FnZW50QWN0aW9uT3ZlcmxheVdpZGdldC5JRDtcblx0fVxuXG5cdGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9kb21Ob2RlO1xuXHR9XG5cblx0Z2V0UG9zaXRpb24oKTogSU92ZXJsYXlXaWRnZXRQb3NpdGlvbiB8IG51bGwge1xuXHRcdGlmICghdGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cHJlZmVyZW5jZTogT3ZlcmxheVdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5CT1RUT01fUklHSFRfQ09STkVSLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVWaXNpYmlsaXR5KCk6IHZvaWQge1xuXHRcdGNvbnN0IGVuYWJsZVJlbW90ZUNvZGluZ0FnZW50UHJvbXB0RmlsZU92ZXJsYXkgPSBDaGF0Q29udGV4dEtleXMuZW5hYmxlUmVtb3RlQ29kaW5nQWdlbnRQcm9tcHRGaWxlT3ZlcmxheS5nZXRWYWx1ZSh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgaGFzUmVtb3RlQ29kaW5nQWdlbnQgPSBDaGF0Q29udGV4dEtleXMuaGFzUmVtb3RlQ29kaW5nQWdlbnQuZ2V0VmFsdWUodGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgaXNQcm9tcHRGaWxlID0gbW9kZWw/LmdldExhbmd1YWdlSWQoKSA9PT0gUFJPTVBUX0xBTkdVQUdFX0lEO1xuXHRcdGNvbnN0IHNob3VsZEJlVmlzaWJsZSA9ICEhKGlzUHJvbXB0RmlsZSAmJiBlbmFibGVSZW1vdGVDb2RpbmdBZ2VudFByb21wdEZpbGVPdmVybGF5ICYmIGhhc1JlbW90ZUNvZGluZ0FnZW50KTtcblxuXHRcdGlmIChzaG91bGRCZVZpc2libGUgIT09IHRoaXMuX2lzVmlzaWJsZSkge1xuXHRcdFx0dGhpcy5faXNWaXNpYmxlID0gc2hvdWxkQmVWaXNpYmxlO1xuXHRcdFx0aWYgKHRoaXMuX2lzVmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLl9lZGl0b3IuYWRkT3ZlcmxheVdpZGdldCh0aGlzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2VkaXRvci5yZW1vdmVPdmVybGF5V2lkZ2V0KHRoaXMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2V4ZWN1dGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fYnV0dG9uLmVuYWJsZWQgPSBmYWxzZTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcHJvbXB0Q29udGVudCA9IG1vZGVsLmdldFZhbHVlKCk7XG5cdFx0XHRjb25zdCBwcm9tcHROYW1lID0gYXdhaXQgdGhpcy5fcHJvbXB0c1NlcnZpY2UuZ2V0UHJvbXB0U2xhc2hDb21tYW5kTmFtZShtb2RlbC51cmksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRjb25zdCBhZ2VudHMgPSB0aGlzLl9yZW1vdGVDb2RpbmdBZ2VudFNlcnZpY2UuZ2V0QXZhaWxhYmxlQWdlbnRzKCk7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGFnZW50c1swXTsgLy8gVXNlIHRoZSBmaXJzdCBhdmFpbGFibGUgYWdlbnRcblx0XHRcdGlmICghYWdlbnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChhZ2VudC5jb21tYW5kLCB7XG5cdFx0XHRcdHVzZXJQcm9tcHQ6IHByb21wdE5hbWUsXG5cdFx0XHRcdHN1bW1hcnk6IHByb21wdENvbnRlbnQsXG5cdFx0XHRcdHNvdXJjZTogJ3Byb21wdCcsXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fYnV0dG9uLmVuYWJsZWQgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzVmlzaWJsZSkge1xuXHRcdFx0dGhpcy5fZWRpdG9yLnJlbW92ZU92ZXJsYXlXaWRnZXQodGhpcyk7XG5cdFx0fVxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0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
