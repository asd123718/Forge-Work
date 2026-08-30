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
import { $, addDisposableListener, getActiveWindow } from "../../../../../base/browser/dom.js";
import { renderFormattedText } from "../../../../../base/browser/formattedTextRenderer.js";
import { StandardMouseEvent } from "../../../../../base/browser/mouseEvent.js";
import { status } from "../../../../../base/browser/ui/aria/aria.js";
import { Event } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { ContentWidgetPositionPreference } from "../../../../../editor/browser/editorBrowser.js";
import { EditorContributionInstantiation, registerEditorContribution } from "../../../../../editor/browser/editorExtensions.js";
import { EditorOption } from "../../../../../editor/common/config/editorOptions.js";
import { Position } from "../../../../../editor/common/core/position.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../../editor/common/languages/modesRegistry.js";
import { localize } from "../../../../../nls.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { ChangeLanguageAction } from "../../../../browser/parts/editor/editorStatus.js";
import { LOG_MODE_ID, OUTPUT_MODE_ID } from "../../../../services/output/common/output.js";
import { SEARCH_RESULT_LANGUAGE_ID } from "../../../../services/search/common/search.js";
import { AccessibilityVerbositySettingId } from "../../../accessibility/browser/accessibilityConfiguration.js";
import { IChatAgentService } from "../../../chat/common/participants/chatAgents.js";
import { ChatAgentLocation } from "../../../chat/common/constants.js";
import { IInlineChatSessionService } from "../../../inlineChat/browser/inlineChatSessionService.js";
import { EmptyTextEditorHintContributionId } from "./emptyTextEditorHintTypes.js";
import "./emptyTextEditorHint.css";
const emptyTextEditorHintSetting = "workbench.editor.empty.hint";
let EmptyTextEditorHintContribution = class extends Disposable {
  constructor(editor, configurationService, inlineChatSessionService, chatAgentService, instantiationService) {
    super();
    this.editor = editor;
    this.configurationService = configurationService;
    this.inlineChatSessionService = inlineChatSessionService;
    this.chatAgentService = chatAgentService;
    this.instantiationService = instantiationService;
    this._register(this.editor.onDidChangeModel(() => this.update()));
    this._register(this.editor.onDidChangeModelLanguage(() => this.update()));
    this._register(this.editor.onDidChangeModelContent(() => this.update()));
    this._register(this.chatAgentService.onDidChangeAgents(() => this.update()));
    this._register(this.editor.onDidChangeModelDecorations(() => this.update()));
    this._register(this.editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.readOnly)) {
        this.update();
      }
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(emptyTextEditorHintSetting)) {
        this.update();
      }
    }));
    this._register(inlineChatSessionService.onWillStartSession((editor2) => {
      if (this.editor === editor2) {
        this.disposeHint();
      }
    }));
    this._register(inlineChatSessionService.onDidChangeSessions(() => {
      this.update();
    }));
  }
  shouldRenderHint() {
    const configValue = this.configurationService.getValue(emptyTextEditorHintSetting);
    if (configValue === "hidden") {
      return false;
    }
    if (this.editor.getOption(EditorOption.readOnly)) {
      return false;
    }
    const model = this.editor.getModel();
    const languageId = model?.getLanguageId();
    if (!model || languageId === OUTPUT_MODE_ID || languageId === LOG_MODE_ID || languageId === SEARCH_RESULT_LANGUAGE_ID) {
      return false;
    }
    if (this.inlineChatSessionService.getSessionByTextModel(model.uri)) {
      return false;
    }
    if (this.editor.getModel()?.getValueLength()) {
      return false;
    }
    const hasConflictingDecorations = Boolean(this.editor.getLineDecorations(1)?.find(
      (d) => d.options.beforeContentClassName || d.options.afterContentClassName || d.options.before?.content || d.options.after?.content
    ));
    if (hasConflictingDecorations) {
      return false;
    }
    const hasEditorAgents = Boolean(this.chatAgentService.getDefaultAgent(ChatAgentLocation.EditorInline));
    const shouldRenderDefaultHint = model?.uri.scheme === Schemas.untitled && languageId === PLAINTEXT_LANGUAGE_ID;
    return hasEditorAgents || shouldRenderDefaultHint;
  }
  update() {
    const shouldRenderHint = this.shouldRenderHint();
    if (shouldRenderHint && !this.textHintContentWidget) {
      this.textHintContentWidget = this.instantiationService.createInstance(EmptyTextEditorHintContentWidget, this.editor);
    } else if (!shouldRenderHint && this.textHintContentWidget) {
      this.disposeHint();
    }
  }
  disposeHint() {
    this.textHintContentWidget?.dispose();
    this.textHintContentWidget = void 0;
  }
  dispose() {
    super.dispose();
    this.disposeHint();
  }
};
EmptyTextEditorHintContribution.ID = EmptyTextEditorHintContributionId;
EmptyTextEditorHintContribution = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IInlineChatSessionService),
  __decorateParam(3, IChatAgentService),
  __decorateParam(4, IInstantiationService)
], EmptyTextEditorHintContribution);
let EmptyTextEditorHintContentWidget = class extends Disposable {
  constructor(editor, commandService, configurationService, keybindingService, chatAgentService, telemetryService, contextMenuService) {
    super();
    this.editor = editor;
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.keybindingService = keybindingService;
    this.chatAgentService = chatAgentService;
    this.telemetryService = telemetryService;
    this.contextMenuService = contextMenuService;
    this.isVisible = false;
    this.ariaLabel = "";
    this._register(this.editor.onDidChangeConfiguration((e) => {
      if (this.domNode && e.hasChanged(EditorOption.fontInfo)) {
        this.editor.applyFontInfo(this.domNode);
      }
    }));
    const onDidFocusEditorText = Event.debounce(this.editor.onDidFocusEditorText, () => void 0, 500);
    this._register(onDidFocusEditorText(() => {
      if (this.editor.hasTextFocus() && this.isVisible && this.ariaLabel && this.configurationService.getValue(AccessibilityVerbositySettingId.EmptyEditorHint)) {
        status(this.ariaLabel);
      }
    }));
    this.editor.addContentWidget(this);
  }
  getId() {
    return EmptyTextEditorHintContentWidget.ID;
  }
  disableHint(e) {
    const disableHint = () => {
      this.configurationService.updateValue(emptyTextEditorHintSetting, "hidden");
      this.dispose();
      this.editor.focus();
    };
    if (!e) {
      disableHint();
      return;
    }
    this.contextMenuService.showContextMenu({
      getAnchor: () => {
        return new StandardMouseEvent(getActiveWindow(), e);
      },
      getActions: () => {
        return [
          {
            id: "workench.action.disableEmptyEditorHint",
            label: localize("disableEditorEmptyHint", "Disable Empty Editor Hint"),
            tooltip: localize("disableEditorEmptyHint", "Disable Empty Editor Hint"),
            enabled: true,
            class: void 0,
            run: () => {
              disableHint();
            }
          }
        ];
      }
    });
  }
  getHint() {
    const hasInlineChatProvider = this.chatAgentService.getActivatedAgents().filter((candidate) => candidate.locations.includes(ChatAgentLocation.EditorInline)).length > 0;
    const hintHandler = {
      disposables: this._store,
      callback: (index, event) => {
        switch (index) {
          case "0":
            hasInlineChatProvider ? askSomething(event.browserEvent) : languageOnClickOrTap(event.browserEvent);
            break;
          case "1":
            hasInlineChatProvider ? languageOnClickOrTap(event.browserEvent) : this.disableHint();
            break;
          case "2":
            this.disableHint();
            break;
        }
      }
    };
    const askSomethingCommandId = "inlineChat.start";
    const askSomething = async (e) => {
      e.stopPropagation();
      this.telemetryService.publicLog2("workbenchActionExecuted", {
        id: askSomethingCommandId,
        from: "hint"
      });
      await this.commandService.executeCommand(askSomethingCommandId, { from: "hint" });
    };
    const languageOnClickOrTap = async (e) => {
      e.stopPropagation();
      this.editor.focus();
      this.telemetryService.publicLog2("workbenchActionExecuted", {
        id: ChangeLanguageAction.ID,
        from: "hint"
      });
      await this.commandService.executeCommand(ChangeLanguageAction.ID);
      this.editor.focus();
    };
    const keybindingsLookup = [askSomethingCommandId, ChangeLanguageAction.ID];
    const keybindingLabels = keybindingsLookup.map((id) => this.keybindingService.lookupKeybinding(id)?.getLabel());
    const hintMsg = (hasInlineChatProvider ? localize({
      key: "emptyTextEditorHintWithInlineChat",
      comment: [
        "Preserve double-square brackets and their order",
        "language refers to a programming language"
      ]
    }, "[[Generate code]] ({0}), or [[select a language]] ({1}). Start typing to dismiss or [[don't show]] this again.", keybindingLabels.at(0) ?? "", keybindingLabels.at(1) ?? "") : localize({
      key: "emptyTextEditorHintWithoutInlineChat",
      comment: [
        "Preserve double-square brackets and their order",
        "language refers to a programming language"
      ]
    }, "[[Select a language]] ({0}) to get started. Start typing to dismiss or [[don't show]] this again.", keybindingLabels.at(1) ?? "")).replaceAll(" ()", "");
    const hintElement = renderFormattedText(hintMsg, {
      actionHandler: hintHandler,
      renderCodeSegments: false
    });
    hintElement.style.fontStyle = "italic";
    const ariaLabel = hasInlineChatProvider ? localize("defaultHintAriaLabelWithInlineChat", "Execute {0} to ask a question, execute {1} to select a language and get started. Start typing to dismiss.", ...keybindingLabels) : localize("defaultHintAriaLabelWithoutInlineChat", "Execute {0} to select a language and get started. Start typing to dismiss.", ...keybindingLabels);
    for (const anchor of hintElement.querySelectorAll("a")) {
      anchor.style.cursor = "pointer";
    }
    return { hintElement, ariaLabel };
  }
  getDomNode() {
    if (!this.domNode) {
      this.domNode = $(".empty-editor-hint");
      this.domNode.style.width = "max-content";
      this.domNode.style.paddingLeft = "4px";
      const { hintElement, ariaLabel } = this.getHint();
      this.domNode.append(hintElement);
      this.ariaLabel = ariaLabel.concat(localize("disableHint", " Toggle {0} in settings to disable this hint.", AccessibilityVerbositySettingId.EmptyEditorHint));
      this._register(addDisposableListener(this.domNode, "click", () => {
        this.editor.focus();
      }));
      this.editor.applyFontInfo(this.domNode);
      const lineHeight = this.editor.getLineHeightForPosition(new Position(1, 1));
      this.domNode.style.lineHeight = lineHeight + "px";
    }
    return this.domNode;
  }
  getPosition() {
    return {
      position: { lineNumber: 1, column: 1 },
      preference: [ContentWidgetPositionPreference.EXACT]
    };
  }
  dispose() {
    super.dispose();
    this.editor.removeContentWidget(this);
  }
};
EmptyTextEditorHintContentWidget.ID = "editor.widget.emptyHint";
EmptyTextEditorHintContentWidget = __decorateClass([
  __decorateParam(1, ICommandService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IChatAgentService),
  __decorateParam(5, ITelemetryService),
  __decorateParam(6, IContextMenuService)
], EmptyTextEditorHintContentWidget);
registerEditorContribution(EmptyTextEditorHintContribution.ID, EmptyTextEditorHintContribution, EditorContributionInstantiation.Eager);
export {
  EmptyTextEditorHintContribution,
  emptyTextEditorHintSetting
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvZGVFZGl0b3JcXGJyb3dzZXJcXGVtcHR5VGV4dEVkaXRvckhpbnRcXGVtcHR5VGV4dEVkaXRvckhpbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGdldEFjdGl2ZVdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUNvbnRlbnRBY3Rpb25IYW5kbGVyLCByZW5kZXJGb3JtYXR0ZWRUZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Zvcm1hdHRlZFRleHRSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBzdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24sIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLCBJQ29kZUVkaXRvciwgSUNvbnRlbnRXaWRnZXQsIElDb250ZW50V2lkZ2V0UG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24sIHJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50LCBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL21vZGVzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQ2hhbmdlTGFuZ3VhZ2VBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JTdGF0dXMuanMnO1xuaW1wb3J0IHsgTE9HX01PREVfSUQsIE9VVFBVVF9NT0RFX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvb3V0cHV0L2NvbW1vbi9vdXRwdXQuanMnO1xuaW1wb3J0IHsgU0VBUkNIX1JFU1VMVF9MQU5HVUFHRV9JRCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJSW5saW5lQ2hhdFNlc3Npb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5saW5lQ2hhdC9icm93c2VyL2lubGluZUNoYXRTZXNzaW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFbXB0eVRleHRFZGl0b3JIaW50Q29udHJpYnV0aW9uSWQsIElFbXB0eVRleHRFZGl0b3JIaW50Q29udHJpYnV0aW9uIH0gZnJvbSAnLi9lbXB0eVRleHRFZGl0b3JIaW50VHlwZXMuanMnO1xuaW1wb3J0ICcuL2VtcHR5VGV4dEVkaXRvckhpbnQuY3NzJztcblxuZXhwb3J0IGNvbnN0IGVtcHR5VGV4dEVkaXRvckhpbnRTZXR0aW5nID0gJ3dvcmtiZW5jaC5lZGl0b3IuZW1wdHkuaGludCc7XG5leHBvcnQgY2xhc3MgRW1wdHlUZXh0RWRpdG9ySGludENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRW1wdHlUZXh0RWRpdG9ySGludENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gRW1wdHlUZXh0RWRpdG9ySGludENvbnRyaWJ1dGlvbklkO1xuXG5cdHByaXZhdGUgdGV4dEhpbnRDb250ZW50V2lkZ2V0OiBFbXB0eVRleHRFZGl0b3JIaW50Q29udGVudFdpZGdldCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUlubGluZUNoYXRTZXNzaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGlubGluZUNoYXRTZXNzaW9uU2VydmljZTogSUlubGluZUNoYXRTZXNzaW9uU2VydmljZSxcblx0XHRASUNoYXRBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0QWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB0aGlzLnVwZGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlKCgpID0+IHRoaXMudXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoKSA9PiB0aGlzLnVwZGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0QWdlbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQWdlbnRzKCgpID0+IHRoaXMudXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvci5vbkRpZENoYW5nZU1vZGVsRGVjb3JhdGlvbnMoKCkgPT4gdGhpcy51cGRhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoZTogQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24ucmVhZE9ubHkpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oZW1wdHlUZXh0RWRpdG9ySGludFNldHRpbmcpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGlubGluZUNoYXRTZXNzaW9uU2VydmljZS5vbldpbGxTdGFydFNlc3Npb24oZWRpdG9yID0+IHtcblx0XHRcdGlmICh0aGlzLmVkaXRvciA9PT0gZWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMuZGlzcG9zZUhpbnQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaW5saW5lQ2hhdFNlc3Npb25TZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoKCkgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgc2hvdWxkUmVuZGVySGludCgpIHtcblx0XHRjb25zdCBjb25maWdWYWx1ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoZW1wdHlUZXh0RWRpdG9ySGludFNldHRpbmcpO1xuXHRcdGlmIChjb25maWdWYWx1ZSA9PT0gJ2hpZGRlbicpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5yZWFkT25seSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IG1vZGVsPy5nZXRMYW5ndWFnZUlkKCk7XG5cdFx0aWYgKCFtb2RlbCB8fCBsYW5ndWFnZUlkID09PSBPVVRQVVRfTU9ERV9JRCB8fCBsYW5ndWFnZUlkID09PSBMT0dfTU9ERV9JRCB8fCBsYW5ndWFnZUlkID09PSBTRUFSQ0hfUkVTVUxUX0xBTkdVQUdFX0lEKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaW5saW5lQ2hhdFNlc3Npb25TZXJ2aWNlLmdldFNlc3Npb25CeVRleHRNb2RlbChtb2RlbC51cmkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZWRpdG9yLmdldE1vZGVsKCk/LmdldFZhbHVlTGVuZ3RoKCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBoYXNDb25mbGljdGluZ0RlY29yYXRpb25zID0gQm9vbGVhbih0aGlzLmVkaXRvci5nZXRMaW5lRGVjb3JhdGlvbnMoMSk/LmZpbmQoKGQpID0+XG5cdFx0XHRkLm9wdGlvbnMuYmVmb3JlQ29udGVudENsYXNzTmFtZVxuXHRcdFx0fHwgZC5vcHRpb25zLmFmdGVyQ29udGVudENsYXNzTmFtZVxuXHRcdFx0fHwgZC5vcHRpb25zLmJlZm9yZT8uY29udGVudFxuXHRcdFx0fHwgZC5vcHRpb25zLmFmdGVyPy5jb250ZW50XG5cdFx0KSk7XG5cdFx0aWYgKGhhc0NvbmZsaWN0aW5nRGVjb3JhdGlvbnMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBoYXNFZGl0b3JBZ2VudHMgPSBCb29sZWFuKHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXREZWZhdWx0QWdlbnQoQ2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lKSk7XG5cdFx0Y29uc3Qgc2hvdWxkUmVuZGVyRGVmYXVsdEhpbnQgPSBtb2RlbD8udXJpLnNjaGVtZSA9PT0gU2NoZW1hcy51bnRpdGxlZCAmJiBsYW5ndWFnZUlkID09PSBQTEFJTlRFWFRfTEFOR1VBR0VfSUQ7XG5cdFx0cmV0dXJuIGhhc0VkaXRvckFnZW50cyB8fCBzaG91bGRSZW5kZXJEZWZhdWx0SGludDtcblx0fVxuXG5cdHByb3RlY3RlZCB1cGRhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2hvdWxkUmVuZGVySGludCA9IHRoaXMuc2hvdWxkUmVuZGVySGludCgpO1xuXHRcdGlmIChzaG91bGRSZW5kZXJIaW50ICYmICF0aGlzLnRleHRIaW50Q29udGVudFdpZGdldCkge1xuXHRcdFx0dGhpcy50ZXh0SGludENvbnRlbnRXaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVtcHR5VGV4dEVkaXRvckhpbnRDb250ZW50V2lkZ2V0LCB0aGlzLmVkaXRvcik7XG5cdFx0fSBlbHNlIGlmICghc2hvdWxkUmVuZGVySGludCAmJiB0aGlzLnRleHRIaW50Q29udGVudFdpZGdldCkge1xuXHRcdFx0dGhpcy5kaXNwb3NlSGludCgpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VIaW50KCk6IHZvaWQge1xuXHRcdHRoaXMudGV4dEhpbnRDb250ZW50V2lkZ2V0Py5kaXNwb3NlKCk7XG5cdFx0dGhpcy50ZXh0SGludENvbnRlbnRXaWRnZXQgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMuZGlzcG9zZUhpbnQoKTtcblx0fVxufVxuXG5jbGFzcyBFbXB0eVRleHRFZGl0b3JIaW50Q29udGVudFdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ29udGVudFdpZGdldCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLndpZGdldC5lbXB0eUhpbnQnO1xuXG5cdHByaXZhdGUgZG9tTm9kZTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaXNWaXNpYmxlID0gZmFsc2U7XG5cdHByaXZhdGUgYXJpYUxhYmVsOiBzdHJpbmcgPSAnJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDaGF0QWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKGU6IENvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQpID0+IHtcblx0XHRcdGlmICh0aGlzLmRvbU5vZGUgJiYgZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5mb250SW5mbykpIHtcblx0XHRcdFx0dGhpcy5lZGl0b3IuYXBwbHlGb250SW5mbyh0aGlzLmRvbU5vZGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRjb25zdCBvbkRpZEZvY3VzRWRpdG9yVGV4dCA9IEV2ZW50LmRlYm91bmNlKHRoaXMuZWRpdG9yLm9uRGlkRm9jdXNFZGl0b3JUZXh0LCAoKSA9PiB1bmRlZmluZWQsIDUwMCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRGb2N1c0VkaXRvclRleHQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuZWRpdG9yLmhhc1RleHRGb2N1cygpICYmIHRoaXMuaXNWaXNpYmxlICYmIHRoaXMuYXJpYUxhYmVsICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5FbXB0eUVkaXRvckhpbnQpKSB7XG5cdFx0XHRcdHN0YXR1cyh0aGlzLmFyaWFMYWJlbCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuZWRpdG9yLmFkZENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdH1cblxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBFbXB0eVRleHRFZGl0b3JIaW50Q29udGVudFdpZGdldC5JRDtcblx0fVxuXG5cdHByaXZhdGUgZGlzYWJsZUhpbnQoZT86IE1vdXNlRXZlbnQpIHtcblx0XHRjb25zdCBkaXNhYmxlSGludCA9ICgpID0+IHtcblx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoZW1wdHlUZXh0RWRpdG9ySGludFNldHRpbmcsICdoaWRkZW4nKTtcblx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5lZGl0b3IuZm9jdXMoKTtcblx0XHR9O1xuXG5cdFx0aWYgKCFlKSB7XG5cdFx0XHRkaXNhYmxlSGludCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IHsgcmV0dXJuIG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoZ2V0QWN0aXZlV2luZG93KCksIGUpOyB9LFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRpZDogJ3dvcmtlbmNoLmFjdGlvbi5kaXNhYmxlRW1wdHlFZGl0b3JIaW50Jyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2Rpc2FibGVFZGl0b3JFbXB0eUhpbnQnLCBcIkRpc2FibGUgRW1wdHkgRWRpdG9yIEhpbnRcIiksXG5cdFx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2Rpc2FibGVFZGl0b3JFbXB0eUhpbnQnLCBcIkRpc2FibGUgRW1wdHkgRWRpdG9yIEhpbnRcIiksXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0ZGlzYWJsZUhpbnQoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0XTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SGludCgpIHtcblx0XHRjb25zdCBoYXNJbmxpbmVDaGF0UHJvdmlkZXIgPSB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0QWN0aXZhdGVkQWdlbnRzKCkuZmlsdGVyKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUubG9jYXRpb25zLmluY2x1ZGVzKENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZSkpLmxlbmd0aCA+IDA7XG5cblx0XHRjb25zdCBoaW50SGFuZGxlcjogSUNvbnRlbnRBY3Rpb25IYW5kbGVyID0ge1xuXHRcdFx0ZGlzcG9zYWJsZXM6IHRoaXMuX3N0b3JlLFxuXHRcdFx0Y2FsbGJhY2s6IChpbmRleCwgZXZlbnQpID0+IHtcblx0XHRcdFx0c3dpdGNoIChpbmRleCkge1xuXHRcdFx0XHRcdGNhc2UgJzAnOlxuXHRcdFx0XHRcdFx0aGFzSW5saW5lQ2hhdFByb3ZpZGVyID8gYXNrU29tZXRoaW5nKGV2ZW50LmJyb3dzZXJFdmVudCkgOiBsYW5ndWFnZU9uQ2xpY2tPclRhcChldmVudC5icm93c2VyRXZlbnQpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnMSc6XG5cdFx0XHRcdFx0XHRoYXNJbmxpbmVDaGF0UHJvdmlkZXIgPyBsYW5ndWFnZU9uQ2xpY2tPclRhcChldmVudC5icm93c2VyRXZlbnQpIDogdGhpcy5kaXNhYmxlSGludCgpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnMic6XG5cdFx0XHRcdFx0XHR0aGlzLmRpc2FibGVIaW50KCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyB0aGUgYWN0dWFsIGNvbW1hbmQgaGFuZGxlcnMuLi5cblx0XHRjb25zdCBhc2tTb21ldGhpbmdDb21tYW5kSWQgPSAnaW5saW5lQ2hhdC5zdGFydCc7XG5cdFx0Y29uc3QgYXNrU29tZXRoaW5nID0gYXN5bmMgKGU6IFVJRXZlbnQpID0+IHtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7XG5cdFx0XHRcdGlkOiBhc2tTb21ldGhpbmdDb21tYW5kSWQsXG5cdFx0XHRcdGZyb206ICdoaW50J1xuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGFza1NvbWV0aGluZ0NvbW1hbmRJZCwgeyBmcm9tOiAnaGludCcgfSk7XG5cdFx0fTtcblx0XHRjb25zdCBsYW5ndWFnZU9uQ2xpY2tPclRhcCA9IGFzeW5jIChlOiBVSUV2ZW50KSA9PiB7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0Ly8gTmVlZCB0byBmb2N1cyBlZGl0b3IgYmVmb3JlIHNvIGN1cnJlbnQgZWRpdG9yIGJlY29tZXMgYWN0aXZlIGFuZCB0aGUgY29tbWFuZCBpcyBwcm9wZXJseSBleGVjdXRlZFxuXHRcdFx0dGhpcy5lZGl0b3IuZm9jdXMoKTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsIHtcblx0XHRcdFx0aWQ6IENoYW5nZUxhbmd1YWdlQWN0aW9uLklELFxuXHRcdFx0XHRmcm9tOiAnaGludCdcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChDaGFuZ2VMYW5ndWFnZUFjdGlvbi5JRCk7XG5cdFx0XHR0aGlzLmVkaXRvci5mb2N1cygpO1xuXHRcdH07XG5cblx0XHRjb25zdCBrZXliaW5kaW5nc0xvb2t1cCA9IFthc2tTb21ldGhpbmdDb21tYW5kSWQsIENoYW5nZUxhbmd1YWdlQWN0aW9uLklEXTtcblx0XHRjb25zdCBrZXliaW5kaW5nTGFiZWxzID0ga2V5YmluZGluZ3NMb29rdXAubWFwKGlkID0+IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhpZCk/LmdldExhYmVsKCkpO1xuXG5cdFx0Y29uc3QgaGludE1zZyA9IChoYXNJbmxpbmVDaGF0UHJvdmlkZXIgPyBsb2NhbGl6ZSh7XG5cdFx0XHRrZXk6ICdlbXB0eVRleHRFZGl0b3JIaW50V2l0aElubGluZUNoYXQnLFxuXHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHQnUHJlc2VydmUgZG91YmxlLXNxdWFyZSBicmFja2V0cyBhbmQgdGhlaXIgb3JkZXInLFxuXHRcdFx0XHQnbGFuZ3VhZ2UgcmVmZXJzIHRvIGEgcHJvZ3JhbW1pbmcgbGFuZ3VhZ2UnXG5cdFx0XHRdXG5cdFx0fSwgJ1tbR2VuZXJhdGUgY29kZV1dICh7MH0pLCBvciBbW3NlbGVjdCBhIGxhbmd1YWdlXV0gKHsxfSkuIFN0YXJ0IHR5cGluZyB0byBkaXNtaXNzIG9yIFtbZG9uXFwndCBzaG93XV0gdGhpcyBhZ2Fpbi4nLCBrZXliaW5kaW5nTGFiZWxzLmF0KDApID8/ICcnLCBrZXliaW5kaW5nTGFiZWxzLmF0KDEpID8/ICcnKSA6IGxvY2FsaXplKHtcblx0XHRcdGtleTogJ2VtcHR5VGV4dEVkaXRvckhpbnRXaXRob3V0SW5saW5lQ2hhdCcsXG5cdFx0XHRjb21tZW50OiBbXG5cdFx0XHRcdCdQcmVzZXJ2ZSBkb3VibGUtc3F1YXJlIGJyYWNrZXRzIGFuZCB0aGVpciBvcmRlcicsXG5cdFx0XHRcdCdsYW5ndWFnZSByZWZlcnMgdG8gYSBwcm9ncmFtbWluZyBsYW5ndWFnZSdcblx0XHRcdF1cblx0XHR9LCAnW1tTZWxlY3QgYSBsYW5ndWFnZV1dICh7MH0pIHRvIGdldCBzdGFydGVkLiBTdGFydCB0eXBpbmcgdG8gZGlzbWlzcyBvciBbW2RvblxcJ3Qgc2hvd11dIHRoaXMgYWdhaW4uJywga2V5YmluZGluZ0xhYmVscy5hdCgxKSA/PyAnJykpLnJlcGxhY2VBbGwoJyAoKScsICcnKTtcblx0XHRjb25zdCBoaW50RWxlbWVudCA9IHJlbmRlckZvcm1hdHRlZFRleHQoaGludE1zZywge1xuXHRcdFx0YWN0aW9uSGFuZGxlcjogaGludEhhbmRsZXIsXG5cdFx0XHRyZW5kZXJDb2RlU2VnbWVudHM6IGZhbHNlLFxuXHRcdH0pO1xuXHRcdGhpbnRFbGVtZW50LnN0eWxlLmZvbnRTdHlsZSA9ICdpdGFsaWMnO1xuXG5cdFx0Y29uc3QgYXJpYUxhYmVsID0gaGFzSW5saW5lQ2hhdFByb3ZpZGVyID9cblx0XHRcdGxvY2FsaXplKCdkZWZhdWx0SGludEFyaWFMYWJlbFdpdGhJbmxpbmVDaGF0JywgJ0V4ZWN1dGUgezB9IHRvIGFzayBhIHF1ZXN0aW9uLCBleGVjdXRlIHsxfSB0byBzZWxlY3QgYSBsYW5ndWFnZSBhbmQgZ2V0IHN0YXJ0ZWQuIFN0YXJ0IHR5cGluZyB0byBkaXNtaXNzLicsIC4uLmtleWJpbmRpbmdMYWJlbHMpIDpcblx0XHRcdGxvY2FsaXplKCdkZWZhdWx0SGludEFyaWFMYWJlbFdpdGhvdXRJbmxpbmVDaGF0JywgJ0V4ZWN1dGUgezB9IHRvIHNlbGVjdCBhIGxhbmd1YWdlIGFuZCBnZXQgc3RhcnRlZC4gU3RhcnQgdHlwaW5nIHRvIGRpc21pc3MuJywgLi4ua2V5YmluZGluZ0xhYmVscyk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Zm9yIChjb25zdCBhbmNob3Igb2YgaGludEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnYScpKSB7XG5cdFx0XHRhbmNob3Iuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGhpbnRFbGVtZW50LCBhcmlhTGFiZWwgfTtcblx0fVxuXG5cdGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdGlmICghdGhpcy5kb21Ob2RlKSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUgPSAkKCcuZW1wdHktZWRpdG9yLWhpbnQnKTtcblx0XHRcdHRoaXMuZG9tTm9kZS5zdHlsZS53aWR0aCA9ICdtYXgtY29udGVudCc7XG5cdFx0XHR0aGlzLmRvbU5vZGUuc3R5bGUucGFkZGluZ0xlZnQgPSAnNHB4JztcblxuXHRcdFx0Y29uc3QgeyBoaW50RWxlbWVudCwgYXJpYUxhYmVsIH0gPSB0aGlzLmdldEhpbnQoKTtcblx0XHRcdHRoaXMuZG9tTm9kZS5hcHBlbmQoaGludEVsZW1lbnQpO1xuXHRcdFx0dGhpcy5hcmlhTGFiZWwgPSBhcmlhTGFiZWwuY29uY2F0KGxvY2FsaXplKCdkaXNhYmxlSGludCcsICcgVG9nZ2xlIHswfSBpbiBzZXR0aW5ncyB0byBkaXNhYmxlIHRoaXMgaGludC4nLCBBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLkVtcHR5RWRpdG9ySGludCkpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuZWRpdG9yLmFwcGx5Rm9udEluZm8odGhpcy5kb21Ob2RlKTtcblx0XHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLmVkaXRvci5nZXRMaW5lSGVpZ2h0Rm9yUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5saW5lSGVpZ2h0ID0gbGluZUhlaWdodCArICdweCc7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZG9tTm9kZTtcblx0fVxuXG5cdGdldFBvc2l0aW9uKCk6IElDb250ZW50V2lkZ2V0UG9zaXRpb24gfCBudWxsIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cG9zaXRpb246IHsgbGluZU51bWJlcjogMSwgY29sdW1uOiAxIH0sXG5cdFx0XHRwcmVmZXJlbmNlOiBbQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5FWEFDVF1cblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLmVkaXRvci5yZW1vdmVDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHR9XG59XG5cbnJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uKEVtcHR5VGV4dEVkaXRvckhpbnRDb250cmlidXRpb24uSUQsIEVtcHR5VGV4dEVkaXRvckhpbnRDb250cmlidXRpb24sIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24uRWFnZXIpOyAvLyBlYWdlciBiZWNhdXNlIGl0IG5lZWRzIHRvIHJlbmRlciBhIGhlbHAgbWVzc2FnZVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLEdBQUcsdUJBQXVCLHVCQUF1QjtBQUMxRCxTQUFnQywyQkFBMkI7QUFDM0QsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxjQUFjO0FBRXZCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyx1Q0FBNEY7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
