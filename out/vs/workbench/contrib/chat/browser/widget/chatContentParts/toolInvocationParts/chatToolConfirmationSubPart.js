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
import * as dom from "../../../../../../../base/browser/dom.js";
import { Separator } from "../../../../../../../base/common/actions.js";
import { RunOnceScheduler } from "../../../../../../../base/common/async.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { count } from "../../../../../../../base/common/strings.js";
import { isEmptyObject } from "../../../../../../../base/common/types.js";
import { generateUuid } from "../../../../../../../base/common/uuid.js";
import { ElementSizeObserver } from "../../../../../../../editor/browser/config/elementSizeObserver.js";
import { ILanguageService } from "../../../../../../../editor/common/languages/language.js";
import { localize } from "../../../../../../../nls.js";
import { ICommandService } from "../../../../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../../../platform/keybinding/common/keybinding.js";
import { IMarkerService, MarkerSeverity } from "../../../../../../../platform/markers/common/markers.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../../common/chatService/chatService.js";
import { createToolSchemaUri, ILanguageModelToolsService } from "../../../../common/tools/languageModelToolsService.js";
import { ILanguageModelToolsConfirmationService } from "../../../../common/tools/languageModelToolsConfirmationService.js";
import { AcceptToolConfirmationActionId, SkipToolConfirmationActionId } from "../../../actions/chatToolActions.js";
import { IChatWidgetService } from "../../../chat.js";
import { IChatToolRiskAssessmentService } from "../../../tools/chatToolRiskAssessmentService.js";
import { renderFileWidgets } from "../chatInlineAnchorWidget.js";
import { CodeBlockPart } from "../codeBlockPart.js";
import { IChatMarkdownAnchorService } from "../chatMarkdownAnchorService.js";
import { ChatMarkdownContentPart } from "../chatMarkdownContentPart.js";
import { AbstractToolConfirmationSubPart } from "./abstractToolConfirmationSubPart.js";
const SHOW_MORE_MESSAGE_HEIGHT_TRIGGER = 100;
let ToolConfirmationSubPart = class extends AbstractToolConfirmationSubPart {
  constructor(toolInvocation, context, renderer, editorPool, currentWidthDelegate, codeBlockStartIndex, instantiationService, keybindingService, languageService, contextKeyService, chatWidgetService, commandService, markerService, languageModelToolsService, chatMarkdownAnchorService, confirmationService, riskAssessmentService) {
    const state = toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation || !state.confirmationMessages?.title) {
      throw new Error("Confirmation messages are missing");
    }
    super(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService, riskAssessmentService);
    this.renderer = renderer;
    this.editorPool = editorPool;
    this.currentWidthDelegate = currentWidthDelegate;
    this.codeBlockStartIndex = codeBlockStartIndex;
    this.languageService = languageService;
    this.commandService = commandService;
    this.markerService = markerService;
    this.chatMarkdownAnchorService = chatMarkdownAnchorService;
    this.confirmationService = confirmationService;
    this.markdownParts = [];
    this.render({
      allowActionId: AcceptToolConfirmationActionId,
      skipActionId: SkipToolConfirmationActionId,
      allowLabel: state.confirmationMessages.confirmResults ? localize("allowReview", "Allow and Review Once") : localize("allow", "Allow Once"),
      skipLabel: localize("skip.detail", "Proceed without running this tool"),
      partType: "chatToolConfirmation",
      subtitle: typeof toolInvocation.originMessage === "string" ? toolInvocation.originMessage : toolInvocation.originMessage?.value
    });
  }
  get codeblocks() {
    return this.markdownParts.flatMap((part) => part.codeblocks);
  }
  additionalPrimaryActions() {
    const actions = super.additionalPrimaryActions();
    const state = this.toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
      return actions;
    }
    if (state.confirmationMessages?.allowAutoConfirm !== false) {
      const approveCombination = state.confirmationMessages?.approveCombination;
      const combination = approveCombination ? {
        label: typeof approveCombination.label === "string" ? approveCombination.label : approveCombination.label.value,
        key: approveCombination.key,
        arguments: approveCombination.arguments
      } : void 0;
      const confirmActions = this.confirmationService.getPreConfirmActions({
        toolId: this.toolInvocation.toolId,
        source: this.toolInvocation.source,
        parameters: state.parameters,
        chatSessionResource: this.context.element.sessionResource,
        combination
      });
      for (const action of confirmActions) {
        if (action.divider) {
          actions.push(new Separator());
        }
        actions.push({
          label: action.label,
          tooltip: action.detail,
          scope: action.scope,
          data: async () => {
            const shouldConfirm = await action.select();
            if (shouldConfirm) {
              this.confirmWith(this.toolInvocation, { type: ToolConfirmKind.UserAction });
            }
          }
        });
      }
    }
    if (state.confirmationMessages?.confirmResults) {
      actions.unshift(
        {
          label: localize("allowSkip", "Allow and Skip Reviewing Result"),
          data: () => {
            state.confirmationMessages.confirmResults = void 0;
            this.confirmWith(this.toolInvocation, { type: ToolConfirmKind.UserAction });
          }
        },
        new Separator()
      );
    }
    return actions;
  }
  useAllowOnceAsPrimary() {
    const state = this.toolInvocation.state.get();
    if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
      return !!state.confirmationMessages?.approveCombination;
    }
    return false;
  }
  createContentElement() {
    const state = this.toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
      return "";
    }
    const { message, disclaimer } = state.confirmationMessages;
    const toolInvocation = this.toolInvocation;
    if (typeof message === "string" && !disclaimer) {
      return message;
    } else {
      const codeBlockRenderOptions = {
        hideToolbar: true,
        reserveWidth: 19,
        verticalPadding: 5,
        editorOptions: {
          tabFocusMode: true,
          ariaLabel: this.getTitle()
        }
      };
      const elements = dom.h("div", [
        dom.h(".message@messageContainer", [
          dom.h(".message-wrapper@message"),
          dom.h(".see-more@showMore", [
            dom.h("a", [localize("showMore", "Show More")])
          ])
        ]),
        dom.h(".editor@editor"),
        dom.h(".disclaimer@disclaimer")
      ]);
      if (toolInvocation.toolSpecificData?.kind === "input" && toolInvocation.toolSpecificData.rawInput && !isEmptyObject(toolInvocation.toolSpecificData.rawInput)) {
        const titleEl = document.createElement("h3");
        titleEl.textContent = localize("chat.input", "Input");
        elements.editor.appendChild(titleEl);
        const inputData = toolInvocation.toolSpecificData;
        const codeBlockRenderOptions2 = {
          hideToolbar: true,
          reserveWidth: 19,
          maxHeightInLines: 13,
          verticalPadding: 5,
          editorOptions: {
            wordWrap: "off",
            readOnly: false,
            ariaLabel: this.getTitle()
          }
        };
        const langId = this.languageService.getLanguageIdByLanguageName("json");
        const rawJsonInput = JSON.stringify(inputData.rawInput ?? {}, null, 1);
        const canSeeMore = count(rawJsonInput, "\n") > 2;
        const initialText = rawJsonInput.replace(/\n */g, " ");
        const key = CodeBlockPart.poolKey(this.context.element.id, this.codeBlockStartIndex);
        const editor = this._register(this.editorPool.get(key));
        editor.object.render({
          codeBlockIndex: this.codeBlockStartIndex,
          element: this.context.element,
          languageId: langId ?? "json",
          text: initialText,
          renderOptions: codeBlockRenderOptions2,
          chatSessionResource: this.context.element.sessionResource
        }, this.currentWidthDelegate());
        const model = editor.object.editor.getModel();
        const markerOwner = generateUuid();
        const schemaUri = createToolSchemaUri(toolInvocation.toolId);
        const validator = new RunOnceScheduler(async () => {
          const newMarker = [];
          const result = await this.commandService.executeCommand("json.validate", schemaUri, model.getValue());
          for (const item of result ?? []) {
            if (item.range && item.message) {
              newMarker.push({
                severity: item.severity === "Error" ? MarkerSeverity.Error : MarkerSeverity.Warning,
                message: item.message,
                startLineNumber: item.range[0].line + 1,
                startColumn: item.range[0].character + 1,
                endLineNumber: item.range[1].line + 1,
                endColumn: item.range[1].character + 1,
                code: item.code ? String(item.code) : void 0
              });
            }
          }
          this.markerService.changeOne(markerOwner, model.uri, newMarker);
        }, 500);
        validator.schedule();
        this._register(model.onDidChangeContent(() => validator.schedule()));
        this._register(toDisposable(() => this.markerService.remove(markerOwner, [model.uri])));
        this._register(validator);
        this.codeblocks.push({
          codeBlockIndex: this.codeBlockStartIndex,
          codemapperUri: void 0,
          elementId: this.context.element.id,
          focus: () => editor.object.focus(),
          ownerMarkdownPartId: this.codeblocksPartId,
          uri: model.uri,
          chatSessionResource: this.context.element.sessionResource
        });
        this._register(model.onDidChangeContent((e) => {
          try {
            inputData.rawInput = JSON.parse(model.getValue());
          } catch {
          }
        }));
        elements.editor.append(editor.object.element);
        if (canSeeMore) {
          const seeMore = dom.h("div.see-more", [dom.h("a@link")]);
          seeMore.link.textContent = localize("seeMore", "See more");
          this._register(dom.addDisposableGenericMouseDownListener(seeMore.link, () => {
            try {
              const parsed = JSON.parse(model.getValue());
              model.setValue(JSON.stringify(parsed, null, 2));
              editor.object.editor.updateOptions({ tabFocusMode: false });
              editor.object.editor.updateOptions({ wordWrap: "on" });
            } catch {
            }
            seeMore.root.remove();
          }));
          elements.editor.append(seeMore.root);
        }
      }
      const mdPart = this._makeMarkdownPart(elements.message, message, codeBlockRenderOptions);
      const messageSeeMoreObserver = this._register(new ElementSizeObserver(mdPart.domNode, void 0));
      const updateSeeMoreDisplayed = () => {
        const show = messageSeeMoreObserver.getHeight() > SHOW_MORE_MESSAGE_HEIGHT_TRIGGER;
        if (elements.messageContainer.classList.contains("can-see-more") !== show) {
          elements.messageContainer.classList.toggle("can-see-more", show);
        }
      };
      this._register(dom.addDisposableListener(elements.showMore, "click", () => {
        elements.messageContainer.classList.toggle("can-see-more", false);
        messageSeeMoreObserver.dispose();
      }));
      this._register(messageSeeMoreObserver.onDidChange(updateSeeMoreDisplayed));
      messageSeeMoreObserver.startObserving();
      if (disclaimer) {
        this._makeMarkdownPart(elements.disclaimer, disclaimer, codeBlockRenderOptions);
      } else {
        elements.disclaimer.remove();
      }
      return elements.root;
    }
  }
  getTitle() {
    const state = this.toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
      return "";
    }
    const title = state.confirmationMessages?.title;
    if (!title) {
      return "";
    }
    return typeof title === "string" ? title : title.value;
  }
  _makeMarkdownPart(container, message, codeBlockRenderOptions) {
    const part = this._register(this.instantiationService.createInstance(
      ChatMarkdownContentPart,
      {
        kind: "markdownContent",
        content: typeof message === "string" ? new MarkdownString().appendMarkdown(message) : message
      },
      this.context,
      this.editorPool,
      false,
      this.codeBlockStartIndex,
      this.renderer,
      void 0,
      this.currentWidthDelegate(),
      { codeBlockRenderOptions }
    ));
    renderFileWidgets(part.domNode, this.instantiationService, this.chatMarkdownAnchorService, this._store, this.openedEditors.fileWidgetOptions);
    container.append(part.domNode);
    return part;
  }
};
ToolConfirmationSubPart = __decorateClass([
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, ILanguageService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IChatWidgetService),
  __decorateParam(11, ICommandService),
  __decorateParam(12, IMarkerService),
  __decorateParam(13, ILanguageModelToolsService),
  __decorateParam(14, IChatMarkdownAnchorService),
  __decorateParam(15, ILanguageModelToolsConfirmationService),
  __decorateParam(16, IChatToolRiskAssessmentService)
], ToolConfirmationSubPart);
export {
  ToolConfirmationSubPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcdG9vbEludm9jYXRpb25QYXJ0c1xcY2hhdFRvb2xDb25maXJtYXRpb25TdWJQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjb3VudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgaXNFbXB0eU9iamVjdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgRWxlbWVudFNpemVPYnNlcnZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2NvbmZpZy9lbGVtZW50U2l6ZU9ic2VydmVyLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSU1hcmtlckRhdGEsIElNYXJrZXJTZXJ2aWNlLCBNYXJrZXJTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgSUNoYXRUb29sSW52b2NhdGlvbiwgVG9vbENvbmZpcm1LaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRvb2xTY2hlbWFVcmksIElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBJVG9vbENvbmZpcm1hdGlvbk1lc3NhZ2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY2NlcHRUb29sQ29uZmlybWF0aW9uQWN0aW9uSWQsIFNraXBUb29sQ29uZmlybWF0aW9uQWN0aW9uSWQgfSBmcm9tICcuLi8uLi8uLi9hY3Rpb25zL2NoYXRUb29sQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvZGVCbG9ja0luZm8sIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdG9vbHMvY2hhdFRvb2xSaXNrQXNzZXNzbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcmVuZGVyRmlsZVdpZGdldHMgfSBmcm9tICcuLi9jaGF0SW5saW5lQW5jaG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IENvZGVCbG9ja1BhcnQsIElDb2RlQmxvY2tSZW5kZXJPcHRpb25zIH0gZnJvbSAnLi4vY29kZUJsb2NrUGFydC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCB9IGZyb20gJy4uL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgSUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UgfSBmcm9tICcuLi9jaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRNYXJrZG93bkNvbnRlbnRQYXJ0IH0gZnJvbSAnLi4vY2hhdE1hcmtkb3duQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RUb29sQ29uZmlybWF0aW9uU3ViUGFydCB9IGZyb20gJy4vYWJzdHJhY3RUb29sQ29uZmlybWF0aW9uU3ViUGFydC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQb29sIH0gZnJvbSAnLi4vY2hhdENvbnRlbnRDb2RlUG9vbHMuanMnO1xuXG5jb25zdCBTSE9XX01PUkVfTUVTU0FHRV9IRUlHSFRfVFJJR0dFUiA9IDEwMDtcblxuZXhwb3J0IGNsYXNzIFRvb2xDb25maXJtYXRpb25TdWJQYXJ0IGV4dGVuZHMgQWJzdHJhY3RUb29sQ29uZmlybWF0aW9uU3ViUGFydCB7XG5cdHByaXZhdGUgbWFya2Rvd25QYXJ0czogQ2hhdE1hcmtkb3duQ29udGVudFBhcnRbXSA9IFtdO1xuXHRwdWJsaWMgZ2V0IGNvZGVibG9ja3MoKTogSUNoYXRDb2RlQmxvY2tJbmZvW10ge1xuXHRcdHJldHVybiB0aGlzLm1hcmtkb3duUGFydHMuZmxhdE1hcChwYXJ0ID0+IHBhcnQuY29kZWJsb2Nrcyk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbixcblx0XHRjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlbmRlcmVyOiBJTWFya2Rvd25SZW5kZXJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvclBvb2w6IEVkaXRvclBvb2wsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjdXJyZW50V2lkdGhEZWxlZ2F0ZTogKCkgPT4gbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29kZUJsb2NrU3RhcnRJbmRleDogbnVtYmVyLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU1hcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYXJrZXJTZXJ2aWNlOiBJTWFya2VyU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdFx0QElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdE1hcmtkb3duQW5jaG9yU2VydmljZTogSUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlybWF0aW9uU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZSByaXNrQXNzZXNzbWVudFNlcnZpY2U6IElDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0b29sSW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblx0XHRpZiAoc3RhdGUudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiB8fCAhc3RhdGUuY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NvbmZpcm1hdGlvbiBtZXNzYWdlcyBhcmUgbWlzc2luZycpO1xuXHRcdH1cblxuXHRcdHN1cGVyKHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0LCBpbnN0YW50aWF0aW9uU2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCBjaGF0V2lkZ2V0U2VydmljZSwgbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgcmlza0Fzc2Vzc21lbnRTZXJ2aWNlKTtcblxuXHRcdHRoaXMucmVuZGVyKHtcblx0XHRcdGFsbG93QWN0aW9uSWQ6IEFjY2VwdFRvb2xDb25maXJtYXRpb25BY3Rpb25JZCxcblx0XHRcdHNraXBBY3Rpb25JZDogU2tpcFRvb2xDb25maXJtYXRpb25BY3Rpb25JZCxcblx0XHRcdGFsbG93TGFiZWw6IHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLmNvbmZpcm1SZXN1bHRzID8gbG9jYWxpemUoJ2FsbG93UmV2aWV3JywgXCJBbGxvdyBhbmQgUmV2aWV3IE9uY2VcIikgOiBsb2NhbGl6ZSgnYWxsb3cnLCBcIkFsbG93IE9uY2VcIiksXG5cdFx0XHRza2lwTGFiZWw6IGxvY2FsaXplKCdza2lwLmRldGFpbCcsICdQcm9jZWVkIHdpdGhvdXQgcnVubmluZyB0aGlzIHRvb2wnKSxcblx0XHRcdHBhcnRUeXBlOiAnY2hhdFRvb2xDb25maXJtYXRpb24nLFxuXHRcdFx0c3VidGl0bGU6IHR5cGVvZiB0b29sSW52b2NhdGlvbi5vcmlnaW5NZXNzYWdlID09PSAnc3RyaW5nJyA/IHRvb2xJbnZvY2F0aW9uLm9yaWdpbk1lc3NhZ2UgOiB0b29sSW52b2NhdGlvbi5vcmlnaW5NZXNzYWdlPy52YWx1ZSxcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhZGRpdGlvbmFsUHJpbWFyeUFjdGlvbnMoKSB7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IHN1cGVyLmFkZGl0aW9uYWxQcmltYXJ5QWN0aW9ucygpO1xuXG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLnRvb2xJbnZvY2F0aW9uLnN0YXRlLmdldCgpO1xuXHRcdGlmIChzdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRyZXR1cm4gYWN0aW9ucztcblx0XHR9XG5cblx0XHRpZiAoc3RhdGUuY29uZmlybWF0aW9uTWVzc2FnZXM/LmFsbG93QXV0b0NvbmZpcm0gIT09IGZhbHNlKSB7XG5cdFx0XHQvLyBHZXQgY29tYmluYXRpb24gbGFiZWwgYW5kIHByZWNvbXB1dGVkIGtleSBpZiBwcmVzZW50XG5cdFx0XHRjb25zdCBhcHByb3ZlQ29tYmluYXRpb24gPSBzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcz8uYXBwcm92ZUNvbWJpbmF0aW9uO1xuXHRcdFx0Y29uc3QgY29tYmluYXRpb24gPSBhcHByb3ZlQ29tYmluYXRpb25cblx0XHRcdFx0PyB7XG5cdFx0XHRcdFx0bGFiZWw6IHR5cGVvZiBhcHByb3ZlQ29tYmluYXRpb24ubGFiZWwgPT09ICdzdHJpbmcnID8gYXBwcm92ZUNvbWJpbmF0aW9uLmxhYmVsIDogYXBwcm92ZUNvbWJpbmF0aW9uLmxhYmVsLnZhbHVlLFxuXHRcdFx0XHRcdGtleTogYXBwcm92ZUNvbWJpbmF0aW9uLmtleSxcblx0XHRcdFx0XHRhcmd1bWVudHM6IGFwcHJvdmVDb21iaW5hdGlvbi5hcmd1bWVudHMsXG5cdFx0XHRcdH1cblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRcdC8vIEdldCBhY3Rpb25zIGZyb20gY29uZmlybWF0aW9uIHNlcnZpY2Vcblx0XHRcdGNvbnN0IGNvbmZpcm1BY3Rpb25zID0gdGhpcy5jb25maXJtYXRpb25TZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb25zKHtcblx0XHRcdFx0dG9vbElkOiB0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xJZCxcblx0XHRcdFx0c291cmNlOiB0aGlzLnRvb2xJbnZvY2F0aW9uLnNvdXJjZSxcblx0XHRcdFx0cGFyYW1ldGVyczogc3RhdGUucGFyYW1ldGVycyxcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogdGhpcy5jb250ZXh0LmVsZW1lbnQuc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRjb21iaW5hdGlvbixcblx0XHRcdH0pO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBjb25maXJtQWN0aW9ucykge1xuXHRcdFx0XHRpZiAoYWN0aW9uLmRpdmlkZXIpIHtcblx0XHRcdFx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBhY3Rpb24ubGFiZWwsXG5cdFx0XHRcdFx0dG9vbHRpcDogYWN0aW9uLmRldGFpbCxcblx0XHRcdFx0XHRzY29wZTogYWN0aW9uLnNjb3BlLFxuXHRcdFx0XHRcdGRhdGE6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHNob3VsZENvbmZpcm0gPSBhd2FpdCBhY3Rpb24uc2VsZWN0KCk7XG5cdFx0XHRcdFx0XHRpZiAoc2hvdWxkQ29uZmlybSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmNvbmZpcm1XaXRoKHRoaXMudG9vbEludm9jYXRpb24sIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5jb25maXJtUmVzdWx0cykge1xuXHRcdFx0YWN0aW9ucy51bnNoaWZ0KFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhbGxvd1NraXAnLCAnQWxsb3cgYW5kIFNraXAgUmV2aWV3aW5nIFJlc3VsdCcpLFxuXHRcdFx0XHRcdGRhdGE6ICgpID0+IHtcblx0XHRcdFx0XHRcdChzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcyBhcyBJVG9vbENvbmZpcm1hdGlvbk1lc3NhZ2VzKS5jb25maXJtUmVzdWx0cyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdHRoaXMuY29uZmlybVdpdGgodGhpcy50b29sSW52b2NhdGlvbiwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbiB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG5ldyBTZXBhcmF0b3IoKSxcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFjdGlvbnM7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXNlQWxsb3dPbmNlQXNQcmltYXJ5KCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy50b29sSW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblx0XHRpZiAoc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikge1xuXHRcdFx0cmV0dXJuICEhc3RhdGUuY29uZmlybWF0aW9uTWVzc2FnZXM/LmFwcHJvdmVDb21iaW5hdGlvbjtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUNvbnRlbnRFbGVtZW50KCk6IEhUTUxFbGVtZW50IHwgc3RyaW5nIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMudG9vbEludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cdFx0aWYgKHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24pIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0Y29uc3QgeyBtZXNzYWdlLCBkaXNjbGFpbWVyIH0gPSBzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcyE7XG5cdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSB0aGlzLnRvb2xJbnZvY2F0aW9uIGFzIElDaGF0VG9vbEludm9jYXRpb247XG5cblx0XHRpZiAodHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnICYmICFkaXNjbGFpbWVyKSB7XG5cdFx0XHRyZXR1cm4gbWVzc2FnZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgY29kZUJsb2NrUmVuZGVyT3B0aW9uczogSUNvZGVCbG9ja1JlbmRlck9wdGlvbnMgPSB7XG5cdFx0XHRcdGhpZGVUb29sYmFyOiB0cnVlLFxuXHRcdFx0XHRyZXNlcnZlV2lkdGg6IDE5LFxuXHRcdFx0XHR2ZXJ0aWNhbFBhZGRpbmc6IDUsXG5cdFx0XHRcdGVkaXRvck9wdGlvbnM6IHtcblx0XHRcdFx0XHR0YWJGb2N1c01vZGU6IHRydWUsXG5cdFx0XHRcdFx0YXJpYUxhYmVsOiB0aGlzLmdldFRpdGxlKCksXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBlbGVtZW50cyA9IGRvbS5oKCdkaXYnLCBbXG5cdFx0XHRcdGRvbS5oKCcubWVzc2FnZUBtZXNzYWdlQ29udGFpbmVyJywgW1xuXHRcdFx0XHRcdGRvbS5oKCcubWVzc2FnZS13cmFwcGVyQG1lc3NhZ2UnKSxcblx0XHRcdFx0XHRkb20uaCgnLnNlZS1tb3JlQHNob3dNb3JlJywgW1xuXHRcdFx0XHRcdFx0ZG9tLmgoJ2EnLCBbbG9jYWxpemUoJ3Nob3dNb3JlJywgXCJTaG93IE1vcmVcIildKVxuXHRcdFx0XHRcdF0pLFxuXHRcdFx0XHRdKSxcblx0XHRcdFx0ZG9tLmgoJy5lZGl0b3JAZWRpdG9yJyksXG5cdFx0XHRcdGRvbS5oKCcuZGlzY2xhaW1lckBkaXNjbGFpbWVyJyksXG5cdFx0XHRdKTtcblxuXHRcdFx0aWYgKHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdpbnB1dCcgJiYgdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5yYXdJbnB1dCAmJiAhaXNFbXB0eU9iamVjdCh0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLnJhd0lucHV0KSkge1xuXG5cdFx0XHRcdGNvbnN0IHRpdGxlRWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdoMycpO1xuXHRcdFx0XHR0aXRsZUVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXQuaW5wdXQnLCBcIklucHV0XCIpO1xuXHRcdFx0XHRlbGVtZW50cy5lZGl0b3IuYXBwZW5kQ2hpbGQodGl0bGVFbCk7XG5cblx0XHRcdFx0Y29uc3QgaW5wdXREYXRhID0gdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YTtcblxuXHRcdFx0XHRjb25zdCBjb2RlQmxvY2tSZW5kZXJPcHRpb25zOiBJQ29kZUJsb2NrUmVuZGVyT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRoaWRlVG9vbGJhcjogdHJ1ZSxcblx0XHRcdFx0XHRyZXNlcnZlV2lkdGg6IDE5LFxuXHRcdFx0XHRcdG1heEhlaWdodEluTGluZXM6IDEzLFxuXHRcdFx0XHRcdHZlcnRpY2FsUGFkZGluZzogNSxcblx0XHRcdFx0XHRlZGl0b3JPcHRpb25zOiB7XG5cdFx0XHRcdFx0XHR3b3JkV3JhcDogJ29mZicsXG5cdFx0XHRcdFx0XHRyZWFkT25seTogZmFsc2UsXG5cdFx0XHRcdFx0XHRhcmlhTGFiZWw6IHRoaXMuZ2V0VGl0bGUoKSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgbGFuZ0lkID0gdGhpcy5sYW5ndWFnZVNlcnZpY2UuZ2V0TGFuZ3VhZ2VJZEJ5TGFuZ3VhZ2VOYW1lKCdqc29uJyk7XG5cdFx0XHRcdGNvbnN0IHJhd0pzb25JbnB1dCA9IEpTT04uc3RyaW5naWZ5KGlucHV0RGF0YS5yYXdJbnB1dCA/PyB7fSwgbnVsbCwgMSk7XG5cdFx0XHRcdGNvbnN0IGNhblNlZU1vcmUgPSBjb3VudChyYXdKc29uSW5wdXQsICdcXG4nKSA+IDI7IC8vIGlmIG1vcmUgdGhhbiBvbmUga2V5OnZhbHVlXG5cdFx0XHRcdC8vIFZpZXcgYSBzaW5nbGUgSlNPTiBsaW5lIGJ5IGRlZmF1bHQgdW50aWwgdGhleSAnc2VlIG1vcmUnXG5cdFx0XHRcdGNvbnN0IGluaXRpYWxUZXh0ID0gcmF3SnNvbklucHV0LnJlcGxhY2UoL1xcbiAqL2csICcgJyk7XG5cblx0XHRcdFx0Y29uc3Qga2V5ID0gQ29kZUJsb2NrUGFydC5wb29sS2V5KHRoaXMuY29udGV4dC5lbGVtZW50LmlkLCB0aGlzLmNvZGVCbG9ja1N0YXJ0SW5kZXgpO1xuXHRcdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvclBvb2wuZ2V0KGtleSkpO1xuXHRcdFx0XHRlZGl0b3Iub2JqZWN0LnJlbmRlcih7XG5cdFx0XHRcdFx0Y29kZUJsb2NrSW5kZXg6IHRoaXMuY29kZUJsb2NrU3RhcnRJbmRleCxcblx0XHRcdFx0XHRlbGVtZW50OiB0aGlzLmNvbnRleHQuZWxlbWVudCxcblx0XHRcdFx0XHRsYW5ndWFnZUlkOiBsYW5nSWQgPz8gJ2pzb24nLFxuXHRcdFx0XHRcdHRleHQ6IGluaXRpYWxUZXh0LFxuXHRcdFx0XHRcdHJlbmRlck9wdGlvbnM6IGNvZGVCbG9ja1JlbmRlck9wdGlvbnMsXG5cdFx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogdGhpcy5jb250ZXh0LmVsZW1lbnQuc2Vzc2lvblJlc291cmNlXG5cdFx0XHRcdH0sIHRoaXMuY3VycmVudFdpZHRoRGVsZWdhdGUoKSk7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLm9iamVjdC5lZGl0b3IuZ2V0TW9kZWwoKSE7XG5cblx0XHRcdFx0Y29uc3QgbWFya2VyT3duZXIgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRcdFx0Y29uc3Qgc2NoZW1hVXJpID0gY3JlYXRlVG9vbFNjaGVtYVVyaSh0b29sSW52b2NhdGlvbi50b29sSWQpO1xuXHRcdFx0XHRjb25zdCB2YWxpZGF0b3IgPSBuZXcgUnVuT25jZVNjaGVkdWxlcihhc3luYyAoKSA9PiB7XG5cblx0XHRcdFx0XHRjb25zdCBuZXdNYXJrZXI6IElNYXJrZXJEYXRhW10gPSBbXTtcblxuXHRcdFx0XHRcdHR5cGUgSnNvbkRpYWdub3N0aWMgPSB7XG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBzdHJpbmc7XG5cdFx0XHRcdFx0XHRyYW5nZTogeyBsaW5lOiBudW1iZXI7IGNoYXJhY3RlcjogbnVtYmVyIH1bXTtcblx0XHRcdFx0XHRcdHNldmVyaXR5OiBzdHJpbmc7XG5cdFx0XHRcdFx0XHRjb2RlPzogc3RyaW5nIHwgbnVtYmVyO1xuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kPEpzb25EaWFnbm9zdGljW10+KCdqc29uLnZhbGlkYXRlJywgc2NoZW1hVXJpLCBtb2RlbC5nZXRWYWx1ZSgpKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgcmVzdWx0ID8/IFtdKSB7XG5cdFx0XHRcdFx0XHRpZiAoaXRlbS5yYW5nZSAmJiBpdGVtLm1lc3NhZ2UpIHtcblx0XHRcdFx0XHRcdFx0bmV3TWFya2VyLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdHNldmVyaXR5OiBpdGVtLnNldmVyaXR5ID09PSAnRXJyb3InID8gTWFya2VyU2V2ZXJpdHkuRXJyb3IgOiBNYXJrZXJTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IGl0ZW0ubWVzc2FnZSxcblx0XHRcdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IGl0ZW0ucmFuZ2VbMF0ubGluZSArIDEsXG5cdFx0XHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IGl0ZW0ucmFuZ2VbMF0uY2hhcmFjdGVyICsgMSxcblx0XHRcdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBpdGVtLnJhbmdlWzFdLmxpbmUgKyAxLFxuXHRcdFx0XHRcdFx0XHRcdGVuZENvbHVtbjogaXRlbS5yYW5nZVsxXS5jaGFyYWN0ZXIgKyAxLFxuXHRcdFx0XHRcdFx0XHRcdGNvZGU6IGl0ZW0uY29kZSA/IFN0cmluZyhpdGVtLmNvZGUpIDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMubWFya2VyU2VydmljZS5jaGFuZ2VPbmUobWFya2VyT3duZXIsIG1vZGVsLnVyaSwgbmV3TWFya2VyKTtcblx0XHRcdFx0fSwgNTAwKTtcblxuXHRcdFx0XHR2YWxpZGF0b3Iuc2NoZWR1bGUoKTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIobW9kZWwub25EaWRDaGFuZ2VDb250ZW50KCgpID0+IHZhbGlkYXRvci5zY2hlZHVsZSgpKSk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLm1hcmtlclNlcnZpY2UucmVtb3ZlKG1hcmtlck93bmVyLCBbbW9kZWwudXJpXSkpKTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodmFsaWRhdG9yKTtcblxuXHRcdFx0XHR0aGlzLmNvZGVibG9ja3MucHVzaCh7XG5cdFx0XHRcdFx0Y29kZUJsb2NrSW5kZXg6IHRoaXMuY29kZUJsb2NrU3RhcnRJbmRleCxcblx0XHRcdFx0XHRjb2RlbWFwcGVyVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZWxlbWVudElkOiB0aGlzLmNvbnRleHQuZWxlbWVudC5pZCxcblx0XHRcdFx0XHRmb2N1czogKCkgPT4gZWRpdG9yLm9iamVjdC5mb2N1cygpLFxuXHRcdFx0XHRcdG93bmVyTWFya2Rvd25QYXJ0SWQ6IHRoaXMuY29kZWJsb2Nrc1BhcnRJZCxcblx0XHRcdFx0XHR1cmk6IG1vZGVsLnVyaSxcblx0XHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiB0aGlzLmNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2Vcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKG1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudChlID0+IHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0aW5wdXREYXRhLnJhd0lucHV0ID0gSlNPTi5wYXJzZShtb2RlbC5nZXRWYWx1ZSgpKTtcblx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdGVsZW1lbnRzLmVkaXRvci5hcHBlbmQoZWRpdG9yLm9iamVjdC5lbGVtZW50KTtcblxuXHRcdFx0XHRpZiAoY2FuU2VlTW9yZSkge1xuXHRcdFx0XHRcdGNvbnN0IHNlZU1vcmUgPSBkb20uaCgnZGl2LnNlZS1tb3JlJywgW2RvbS5oKCdhQGxpbmsnKV0pO1xuXHRcdFx0XHRcdHNlZU1vcmUubGluay50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdzZWVNb3JlJywgXCJTZWUgbW9yZVwiKTtcblx0XHRcdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZURvd25MaXN0ZW5lcihzZWVNb3JlLmxpbmssICgpID0+IHtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UobW9kZWwuZ2V0VmFsdWUoKSk7XG5cdFx0XHRcdFx0XHRcdG1vZGVsLnNldFZhbHVlKEpTT04uc3RyaW5naWZ5KHBhcnNlZCwgbnVsbCwgMikpO1xuXHRcdFx0XHRcdFx0XHRlZGl0b3Iub2JqZWN0LmVkaXRvci51cGRhdGVPcHRpb25zKHsgdGFiRm9jdXNNb2RlOiBmYWxzZSB9KTtcblx0XHRcdFx0XHRcdFx0ZWRpdG9yLm9iamVjdC5lZGl0b3IudXBkYXRlT3B0aW9ucyh7IHdvcmRXcmFwOiAnb24nIH0pO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHRcdC8vIGlnbm9yZWRcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHNlZU1vcmUucm9vdC5yZW1vdmUoKTtcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0ZWxlbWVudHMuZWRpdG9yLmFwcGVuZChzZWVNb3JlLnJvb3QpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1kUGFydCA9IHRoaXMuX21ha2VNYXJrZG93blBhcnQoZWxlbWVudHMubWVzc2FnZSwgbWVzc2FnZSEsIGNvZGVCbG9ja1JlbmRlck9wdGlvbnMpO1xuXG5cdFx0XHRjb25zdCBtZXNzYWdlU2VlTW9yZU9ic2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVsZW1lbnRTaXplT2JzZXJ2ZXIobWRQYXJ0LmRvbU5vZGUsIHVuZGVmaW5lZCkpO1xuXHRcdFx0Y29uc3QgdXBkYXRlU2VlTW9yZURpc3BsYXllZCA9ICgpID0+IHtcblx0XHRcdFx0Y29uc3Qgc2hvdyA9IG1lc3NhZ2VTZWVNb3JlT2JzZXJ2ZXIuZ2V0SGVpZ2h0KCkgPiBTSE9XX01PUkVfTUVTU0FHRV9IRUlHSFRfVFJJR0dFUjtcblx0XHRcdFx0aWYgKGVsZW1lbnRzLm1lc3NhZ2VDb250YWluZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCdjYW4tc2VlLW1vcmUnKSAhPT0gc2hvdykge1xuXHRcdFx0XHRcdGVsZW1lbnRzLm1lc3NhZ2VDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY2FuLXNlZS1tb3JlJywgc2hvdyk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudHMuc2hvd01vcmUsICdjbGljaycsICgpID0+IHtcblx0XHRcdFx0ZWxlbWVudHMubWVzc2FnZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjYW4tc2VlLW1vcmUnLCBmYWxzZSk7XG5cdFx0XHRcdG1lc3NhZ2VTZWVNb3JlT2JzZXJ2ZXIuZGlzcG9zZSgpO1xuXHRcdFx0fSkpO1xuXG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKG1lc3NhZ2VTZWVNb3JlT2JzZXJ2ZXIub25EaWRDaGFuZ2UodXBkYXRlU2VlTW9yZURpc3BsYXllZCkpO1xuXHRcdFx0bWVzc2FnZVNlZU1vcmVPYnNlcnZlci5zdGFydE9ic2VydmluZygpO1xuXG5cdFx0XHRpZiAoZGlzY2xhaW1lcikge1xuXHRcdFx0XHR0aGlzLl9tYWtlTWFya2Rvd25QYXJ0KGVsZW1lbnRzLmRpc2NsYWltZXIsIGRpc2NsYWltZXIsIGNvZGVCbG9ja1JlbmRlck9wdGlvbnMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZWxlbWVudHMuZGlzY2xhaW1lci5yZW1vdmUoKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGVsZW1lbnRzLnJvb3Q7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGdldFRpdGxlKCk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLnRvb2xJbnZvY2F0aW9uLnN0YXRlLmdldCgpO1xuXHRcdGlmIChzdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdGNvbnN0IHRpdGxlID0gc3RhdGUuY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlO1xuXHRcdGlmICghdGl0bGUpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0cmV0dXJuIHR5cGVvZiB0aXRsZSA9PT0gJ3N0cmluZycgPyB0aXRsZSA6IHRpdGxlLnZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWFrZU1hcmtkb3duUGFydChjb250YWluZXI6IEhUTUxFbGVtZW50LCBtZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcsIGNvZGVCbG9ja1JlbmRlck9wdGlvbnM6IElDb2RlQmxvY2tSZW5kZXJPcHRpb25zKSB7XG5cdFx0Y29uc3QgcGFydCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1hcmtkb3duQ29udGVudFBhcnQsXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLFxuXHRcdFx0XHRjb250ZW50OiB0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycgPyBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRNYXJrZG93bihtZXNzYWdlKSA6IG1lc3NhZ2UsXG5cdFx0XHR9LFxuXHRcdFx0dGhpcy5jb250ZXh0LFxuXHRcdFx0dGhpcy5lZGl0b3JQb29sLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHR0aGlzLmNvZGVCbG9ja1N0YXJ0SW5kZXgsXG5cdFx0XHR0aGlzLnJlbmRlcmVyLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dGhpcy5jdXJyZW50V2lkdGhEZWxlZ2F0ZSgpLFxuXHRcdFx0eyBjb2RlQmxvY2tSZW5kZXJPcHRpb25zIH0sXG5cdFx0KSk7XG5cdFx0cmVuZGVyRmlsZVdpZGdldHMocGFydC5kb21Ob2RlLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGlzLmNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UsIHRoaXMuX3N0b3JlLCB0aGlzLm9wZW5lZEVkaXRvcnMuZmlsZVdpZGdldE9wdGlvbnMpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmQocGFydC5kb21Ob2RlKTtcblxuXHRcdHJldHVybiBwYXJ0O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FB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
