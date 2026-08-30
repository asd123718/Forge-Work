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
import { Button, ButtonWithIcon } from "../../../../../../../base/browser/ui/button/button.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { basename, isEqual } from "../../../../../../../base/common/resources.js";
import { hasKey } from "../../../../../../../base/common/types.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { localize } from "../../../../../../../nls.js";
import { ICommandService } from "../../../../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../../../platform/keybinding/common/keybinding.js";
import { IMarkdownRendererService } from "../../../../../../../platform/markdown/browser/markdownRenderer.js";
import { defaultButtonStyles } from "../../../../../../../platform/theme/browser/defaultStyles.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../../common/chatService/chatService.js";
import { ILanguageModelToolsService } from "../../../../common/tools/languageModelToolsService.js";
import { ModifiedFileEntryState } from "../../../../common/editing/chatEditingService.js";
import { ChatContextKeys } from "../../../../common/actions/chatContextKeys.js";
import { IChatWidgetService } from "../../../chat.js";
import { IChatToolRiskAssessmentService } from "../../../tools/chatToolRiskAssessmentService.js";
import { ChatCustomConfirmationWidget } from "../chatConfirmationWidget.js";
import { renderFileWidgets } from "../chatInlineAnchorWidget.js";
import { IChatMarkdownAnchorService } from "../chatMarkdownAnchorService.js";
import { IEditorService } from "../../../../../../services/editor/common/editorService.js";
import { AbstractToolConfirmationSubPart } from "./abstractToolConfirmationSubPart.js";
import { createApprovalReasonBadge } from "./toolRiskBadgeHelper.js";
function isCreatedFile(file) {
  return file.editKind === "create" || file.editKind === void 0 && !file.originalUri && !file.originalContentUri && !!file.modifiedContentUri;
}
function findModifiedFileConfirmationEntry(modifiedFiles, resource) {
  return modifiedFiles.find((file) => isEqual(URI.revive(file.uri), resource));
}
function getModifiedFilesSummaryLabel(modifiedFiles) {
  const allFilesCreated = modifiedFiles.length > 0 && modifiedFiles.every(isCreatedFile);
  if (allFilesCreated) {
    return modifiedFiles.length === 1 ? localize("oneFileCreated", "1 file created") : localize("manyFilesCreated", "{0} files created", modifiedFiles.length);
  }
  return modifiedFiles.length === 1 ? localize("oneFileChanged", "1 file changed") : localize("manyFilesChanged", "{0} files changed", modifiedFiles.length);
}
function createModifiedFilePreviewEditorInput(resource, originalUri, modifiedContentUri, title, options) {
  const modifiedUri = modifiedContentUri ?? resource;
  if (originalUri) {
    return {
      original: { resource: originalUri },
      modified: { resource: modifiedUri },
      options
    };
  }
  if (modifiedContentUri) {
    return {
      label: title ?? basename(resource),
      original: { resource: void 0, contents: "" },
      modified: { resource: modifiedContentUri },
      options
    };
  }
  return { resource, options };
}
let ChatModifiedFilesConfirmationSubPart = class extends AbstractToolConfirmationSubPart {
  constructor(toolInvocation, context, listPool, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService, markdownRendererService, chatMarkdownAnchorService, editorService, commandService, riskAssessmentService) {
    super(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService, riskAssessmentService);
    this.listPool = listPool;
    this.markdownRendererService = markdownRendererService;
    this.chatMarkdownAnchorService = chatMarkdownAnchorService;
    this.editorService = editorService;
    this.commandService = commandService;
    this.codeblocks = [];
    const state = toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation || !state.confirmationMessages?.title) {
      throw new Error("Modified files confirmation messages are missing");
    }
    const data = toolInvocation.toolSpecificData;
    if (!data || data.kind !== "modifiedFilesConfirmation") {
      throw new Error("Modified files confirmation data is missing");
    }
    const tool = languageModelToolsService.getTool(toolInvocation.toolId);
    const confirmWidget = this._register(this.instantiationService.createInstance(
      ChatCustomConfirmationWidget,
      this.context,
      {
        title: this.getTitle(),
        icon: tool?.icon && hasKey(tool.icon, { id: true }) ? tool.icon : Codicon.tools,
        subtitle: typeof toolInvocation.originMessage === "string" ? toolInvocation.originMessage : toolInvocation.originMessage?.value,
        buttons: this.createButtons(data.options),
        message: this.createWidgetContentElement(state.confirmationMessages.message, data),
        footerBanner: createApprovalReasonBadge(this._store, this.instantiationService, state.confirmationMessages.approvalReason)?.domNode ?? this.createRiskBadgeDomNode(state.parameters)
      }
    ));
    const hasToolConfirmation = ChatContextKeys.Editing.hasToolConfirmation.bindTo(this.contextKeyService);
    hasToolConfirmation.set(true);
    this._register(confirmWidget.onDidClick(({ button, isTouchClick }) => {
      button.data();
      if (!isTouchClick) {
        this.chatWidgetService.getWidgetBySessionResource(this.context.element.sessionResource)?.focusInput();
      }
    }));
    this._register(toDisposable(() => hasToolConfirmation.reset()));
    this.domNode = confirmWidget.domNode;
  }
  createButtons(options) {
    const [primaryOption, ...secondaryOptions] = options;
    return [
      {
        label: primaryOption,
        data: () => this.confirmWith(this.toolInvocation, { type: ToolConfirmKind.UserAction, selectedButton: primaryOption }),
        moreActions: secondaryOptions.map((option) => ({
          label: option,
          data: () => this.confirmWith(this.toolInvocation, { type: ToolConfirmKind.UserAction, selectedButton: option })
        }))
      }
    ];
  }
  createWidgetContentElement(message, data) {
    const container = dom.$(".chat-modified-files-confirmation");
    if (message) {
      const renderedMessage = this._register(this.markdownRendererService.render(typeof message === "string" ? new MarkdownString(message) : message));
      renderFileWidgets(renderedMessage.element, this.instantiationService, this.chatMarkdownAnchorService, this._store, {
        ...this.openedEditors.fileWidgetOptions,
        openResource: (resource, editorOptions) => this.openModifiedFilePreview(data, resource, editorOptions)
      });
      container.append(renderedMessage.element);
    }
    container.append(this.createModifiedFilesElement(data));
    return container;
  }
  createModifiedFilesElement(data) {
    const container = dom.$(".chat-modified-files-confirmation-list.chat-editing-session-container.show-file-icons");
    const overview = dom.append(container, dom.$(".chat-editing-session-overview"));
    const title = dom.append(overview, dom.$(".working-set-title"));
    const titleButton = this._register(new ButtonWithIcon(title, {
      buttonBackground: void 0,
      buttonBorder: void 0,
      buttonForeground: void 0,
      buttonHoverBackground: void 0,
      buttonSecondaryBackground: void 0,
      buttonSecondaryForeground: void 0,
      buttonSecondaryHoverBackground: void 0,
      buttonSeparator: void 0,
      supportIcons: true
    }));
    const actions = dom.append(overview, dom.$(".chat-editing-session-actions"));
    const countsContainer = dom.$(".working-set-line-counts");
    const addedSpan = dom.append(countsContainer, dom.$(".working-set-lines-added"));
    const removedSpan = dom.append(countsContainer, dom.$(".working-set-lines-removed"));
    titleButton.element.appendChild(countsContainer);
    const filesLabel = getModifiedFilesSummaryLabel(data.modifiedFiles);
    titleButton.label = filesLabel;
    let added = 0;
    let removed = 0;
    let hasDiffStats = false;
    for (const file of data.modifiedFiles) {
      if (typeof file.insertions === "number" || typeof file.deletions === "number") {
        hasDiffStats = true;
        added += file.insertions ?? 0;
        removed += file.deletions ?? 0;
      }
    }
    if (hasDiffStats) {
      addedSpan.textContent = `+${added}`;
      removedSpan.textContent = `-${removed}`;
      titleButton.element.setAttribute("aria-label", localize("modifiedFilesSummaryWithCounts", "{0}, {1} lines added, {2} lines removed", filesLabel, added, removed));
      countsContainer.setAttribute("aria-label", localize("modifiedFilesCounts", "{0} lines added, {1} lines removed", added, removed));
    } else {
      countsContainer.remove();
      titleButton.element.setAttribute("aria-label", filesLabel);
    }
    const viewAllChangesButton = this._register(new Button(actions, {
      ...defaultButtonStyles,
      secondary: true,
      small: true,
      supportIcons: true,
      ariaLabel: localize("viewAllChanges", "View All Changes"),
      title: localize("viewAllChanges", "View All Changes")
    }));
    viewAllChangesButton.element.classList.add("default-colors");
    viewAllChangesButton.icon = Codicon.diffMultiple;
    viewAllChangesButton.label = " ";
    this._register(viewAllChangesButton.onDidClick(async () => {
      await this.openAllChanges(data);
    }));
    const listReference = this._register(this.listPool.get());
    const list = listReference.object;
    const listItems = data.modifiedFiles.map((file) => {
      const resource = URI.revive(file.uri);
      const originalUri = file.originalUri ? URI.revive(file.originalUri) : void 0;
      const modifiedContentUri = file.modifiedContentUri ? URI.revive(file.modifiedContentUri) : void 0;
      const originalContentUri = file.originalContentUri ? URI.revive(file.originalContentUri) : void 0;
      return {
        kind: "reference",
        reference: resource,
        title: file.title,
        description: file.description,
        state: ModifiedFileEntryState.Accepted,
        showModifiedState: true,
        options: {
          diffMeta: typeof file.insertions === "number" || typeof file.deletions === "number" ? {
            added: file.insertions ?? 0,
            removed: file.deletions ?? 0
          } : void 0,
          originalUri: originalContentUri ?? originalUri,
          modifiedUri: modifiedContentUri,
          status: void 0
        }
      };
    });
    this._register(list.onDidOpen(async (e) => {
      if (e.element?.kind !== "reference" || !URI.isUri(e.element.reference)) {
        return;
      }
      const options = e.element.options;
      await this.editorService.openEditor(createModifiedFilePreviewEditorInput(
        e.element.reference,
        options?.originalUri,
        options?.modifiedUri,
        e.element.title,
        e.editorOptions
      ));
    }));
    const maxItemsShown = 6;
    const itemsShown = Math.min(listItems.length, maxItemsShown);
    const height = itemsShown * 22;
    const workingSetContainer = dom.append(container, dom.$(".chat-editing-session-list.collapsed"));
    list.layout(height);
    list.getHTMLElement().style.height = `${height}px`;
    list.splice(0, list.length, listItems);
    workingSetContainer.append(list.getHTMLElement());
    let isCollapsed = true;
    const setExpansionState = () => {
      titleButton.icon = isCollapsed ? Codicon.chevronRight : Codicon.chevronDown;
      workingSetContainer.classList.toggle("collapsed", isCollapsed);
    };
    setExpansionState();
    const toggleWorkingSet = () => {
      isCollapsed = !isCollapsed;
      setExpansionState();
    };
    this._register(titleButton.onDidClick(toggleWorkingSet));
    this._register(dom.addDisposableListener(overview, "click", (e) => {
      if (e.defaultPrevented) {
        return;
      }
      const target = e.target;
      if (target.closest(".monaco-button")) {
        return;
      }
      toggleWorkingSet();
    }));
    return container;
  }
  async openModifiedFilePreview(data, resource, editorOptions) {
    const file = findModifiedFileConfirmationEntry(data.modifiedFiles, resource);
    if (!file) {
      return false;
    }
    await this.editorService.openEditor(createModifiedFilePreviewEditorInput(
      resource,
      file.originalContentUri ? URI.revive(file.originalContentUri) : file.originalUri ? URI.revive(file.originalUri) : void 0,
      file.modifiedContentUri ? URI.revive(file.modifiedContentUri) : void 0,
      file.title,
      editorOptions
    ));
    return true;
  }
  async openAllChanges(data) {
    await this.commandService.executeCommand("_workbench.openMultiDiffEditor", {
      title: localize("modifiedFilesAllChangesTitle", "All Changes"),
      resources: data.modifiedFiles.map((file) => ({
        originalUri: file.originalContentUri ? URI.revive(file.originalContentUri) : file.originalUri ? URI.revive(file.originalUri) : void 0,
        modifiedUri: file.modifiedContentUri ? URI.revive(file.modifiedContentUri) : URI.revive(file.uri)
      }))
    });
  }
  createContentElement() {
    throw new Error("Not used");
  }
  getTitle() {
    const state = this.toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
      return "";
    }
    const title = state.confirmationMessages?.title;
    return typeof title === "string" ? title : title?.value ?? "";
  }
};
ChatModifiedFilesConfirmationSubPart = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IChatWidgetService),
  __decorateParam(7, ILanguageModelToolsService),
  __decorateParam(8, IMarkdownRendererService),
  __decorateParam(9, IChatMarkdownAnchorService),
  __decorateParam(10, IEditorService),
  __decorateParam(11, ICommandService),
  __decorateParam(12, IChatToolRiskAssessmentService)
], ChatModifiedFilesConfirmationSubPart);
export {
  ChatModifiedFilesConfirmationSubPart,
  createModifiedFilePreviewEditorInput,
  findModifiedFileConfirmationEntry,
  getModifiedFilesSummaryLabel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcdG9vbEludm9jYXRpb25QYXJ0c1xcY2hhdE1vZGlmaWVkRmlsZXNDb25maXJtYXRpb25TdWJQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQnV0dG9uLCBCdXR0b25XaXRoSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGlmaWVkRmlsZXNDb25maXJtYXRpb25EYXRhLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBUb29sQ29uZmlybUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNb2RpZmllZEZpbGVFbnRyeVN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvZGVCbG9ja0luZm8sIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdG9vbHMvY2hhdFRvb2xSaXNrQXNzZXNzbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuLi9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IENoYXRDdXN0b21Db25maXJtYXRpb25XaWRnZXQsIElDaGF0Q29uZmlybWF0aW9uQnV0dG9uIH0gZnJvbSAnLi4vY2hhdENvbmZpcm1hdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyByZW5kZXJGaWxlV2lkZ2V0cyB9IGZyb20gJy4uL2NoYXRJbmxpbmVBbmNob3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UgfSBmcm9tICcuLi9jaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbGxhcHNpYmxlTGlzdFBvb2wsIElDaGF0Q29sbGFwc2libGVMaXN0SXRlbSB9IGZyb20gJy4uL2NoYXRSZWZlcmVuY2VzQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgSVVudHlwZWRFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RUb29sQ29uZmlybWF0aW9uU3ViUGFydCB9IGZyb20gJy4vYWJzdHJhY3RUb29sQ29uZmlybWF0aW9uU3ViUGFydC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBcHByb3ZhbFJlYXNvbkJhZGdlIH0gZnJvbSAnLi90b29sUmlza0JhZGdlSGVscGVyLmpzJztcblxudHlwZSBNb2RpZmllZEZpbGVDb25maXJtYXRpb25FbnRyeSA9IElDaGF0TW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvbkRhdGFbJ21vZGlmaWVkRmlsZXMnXVtudW1iZXJdO1xuXG5mdW5jdGlvbiBpc0NyZWF0ZWRGaWxlKGZpbGU6IE1vZGlmaWVkRmlsZUNvbmZpcm1hdGlvbkVudHJ5KTogYm9vbGVhbiB7XG5cdHJldHVybiBmaWxlLmVkaXRLaW5kID09PSAnY3JlYXRlJyB8fCAoZmlsZS5lZGl0S2luZCA9PT0gdW5kZWZpbmVkICYmICFmaWxlLm9yaWdpbmFsVXJpICYmICFmaWxlLm9yaWdpbmFsQ29udGVudFVyaSAmJiAhIWZpbGUubW9kaWZpZWRDb250ZW50VXJpKTtcbn1cblxuLyoqIFJldHVybnMgdGhlIHBlbmRpbmcgZmlsZSBlbnRyeSByZWZlcmVuY2VkIGJ5IGEgY29uZmlybWF0aW9uLW1lc3NhZ2UgbGluay4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5kTW9kaWZpZWRGaWxlQ29uZmlybWF0aW9uRW50cnkobW9kaWZpZWRGaWxlczogcmVhZG9ubHkgTW9kaWZpZWRGaWxlQ29uZmlybWF0aW9uRW50cnlbXSwgcmVzb3VyY2U6IFVSSSk6IE1vZGlmaWVkRmlsZUNvbmZpcm1hdGlvbkVudHJ5IHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIG1vZGlmaWVkRmlsZXMuZmluZChmaWxlID0+IGlzRXF1YWwoVVJJLnJldml2ZShmaWxlLnVyaSksIHJlc291cmNlKSk7XG59XG5cbi8qKiBSZXR1cm5zIHRoZSBzdW1tYXJ5IHNob3duIGFib3ZlIHBlbmRpbmcgZmlsZSBjaGFuZ2VzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldE1vZGlmaWVkRmlsZXNTdW1tYXJ5TGFiZWwobW9kaWZpZWRGaWxlczogcmVhZG9ubHkgTW9kaWZpZWRGaWxlQ29uZmlybWF0aW9uRW50cnlbXSk6IHN0cmluZyB7XG5cdGNvbnN0IGFsbEZpbGVzQ3JlYXRlZCA9IG1vZGlmaWVkRmlsZXMubGVuZ3RoID4gMCAmJiBtb2RpZmllZEZpbGVzLmV2ZXJ5KGlzQ3JlYXRlZEZpbGUpO1xuXHRpZiAoYWxsRmlsZXNDcmVhdGVkKSB7XG5cdFx0cmV0dXJuIG1vZGlmaWVkRmlsZXMubGVuZ3RoID09PSAxXG5cdFx0XHQ/IGxvY2FsaXplKCdvbmVGaWxlQ3JlYXRlZCcsICcxIGZpbGUgY3JlYXRlZCcpXG5cdFx0XHQ6IGxvY2FsaXplKCdtYW55RmlsZXNDcmVhdGVkJywgJ3swfSBmaWxlcyBjcmVhdGVkJywgbW9kaWZpZWRGaWxlcy5sZW5ndGgpO1xuXHR9XG5cblx0cmV0dXJuIG1vZGlmaWVkRmlsZXMubGVuZ3RoID09PSAxXG5cdFx0PyBsb2NhbGl6ZSgnb25lRmlsZUNoYW5nZWQnLCAnMSBmaWxlIGNoYW5nZWQnKVxuXHRcdDogbG9jYWxpemUoJ21hbnlGaWxlc0NoYW5nZWQnLCAnezB9IGZpbGVzIGNoYW5nZWQnLCBtb2RpZmllZEZpbGVzLmxlbmd0aCk7XG59XG5cbi8qKiBDcmVhdGVzIHRoZSBlZGl0b3IgaW5wdXQgdXNlZCB0byBwcmV2aWV3IGEgcGVuZGluZyBmaWxlIGNoYW5nZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNb2RpZmllZEZpbGVQcmV2aWV3RWRpdG9ySW5wdXQocmVzb3VyY2U6IFVSSSwgb3JpZ2luYWxVcmk6IFVSSSB8IHVuZGVmaW5lZCwgbW9kaWZpZWRDb250ZW50VXJpOiBVUkkgfCB1bmRlZmluZWQsIHRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQsIG9wdGlvbnM6IElFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkKTogSVVudHlwZWRFZGl0b3JJbnB1dCB7XG5cdGNvbnN0IG1vZGlmaWVkVXJpID0gbW9kaWZpZWRDb250ZW50VXJpID8/IHJlc291cmNlO1xuXHRpZiAob3JpZ2luYWxVcmkpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IG9yaWdpbmFsVXJpIH0sXG5cdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogbW9kaWZpZWRVcmkgfSxcblx0XHRcdG9wdGlvbnMsXG5cdFx0fTtcblx0fVxuXG5cdGlmIChtb2RpZmllZENvbnRlbnRVcmkpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWw6IHRpdGxlID8/IGJhc2VuYW1lKHJlc291cmNlKSxcblx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiB1bmRlZmluZWQsIGNvbnRlbnRzOiAnJyB9LFxuXHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IG1vZGlmaWVkQ29udGVudFVyaSB9LFxuXHRcdFx0b3B0aW9ucyxcblx0XHR9O1xuXHR9XG5cblx0cmV0dXJuIHsgcmVzb3VyY2UsIG9wdGlvbnMgfTtcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRNb2RpZmllZEZpbGVzQ29uZmlybWF0aW9uU3ViUGFydCBleHRlbmRzIEFic3RyYWN0VG9vbENvbmZpcm1hdGlvblN1YlBhcnQge1xuXHRwdWJsaWMgb3ZlcnJpZGUgcmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHB1YmxpYyBvdmVycmlkZSByZWFkb25seSBjb2RlYmxvY2tzOiBJQ2hhdENvZGVCbG9ja0luZm9bXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLFxuXHRcdGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbGlzdFBvb2w6IENvbGxhcHNpYmxlTGlzdFBvb2wsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRASUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlOiBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlIHJpc2tBc3Nlc3NtZW50U2VydmljZTogSUNoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih0b29sSW52b2NhdGlvbiwgY29udGV4dCwgaW5zdGFudGlhdGlvblNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgY2hhdFdpZGdldFNlcnZpY2UsIGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIHJpc2tBc3Nlc3NtZW50U2VydmljZSk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IHRvb2xJbnZvY2F0aW9uLnN0YXRlLmdldCgpO1xuXHRcdGlmIChzdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uIHx8ICFzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTW9kaWZpZWQgZmlsZXMgY29uZmlybWF0aW9uIG1lc3NhZ2VzIGFyZSBtaXNzaW5nJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGF0YSA9IHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE7XG5cdFx0aWYgKCFkYXRhIHx8IGRhdGEua2luZCAhPT0gJ21vZGlmaWVkRmlsZXNDb25maXJtYXRpb24nKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ01vZGlmaWVkIGZpbGVzIGNvbmZpcm1hdGlvbiBkYXRhIGlzIG1pc3NpbmcnKTtcblx0XHR9XG5cblx0XHRjb25zdCB0b29sID0gbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5nZXRUb29sKHRvb2xJbnZvY2F0aW9uLnRvb2xJZCk7XG5cdFx0Y29uc3QgY29uZmlybVdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0Q3VzdG9tQ29uZmlybWF0aW9uV2lkZ2V0PCgpID0+IHZvaWQ+LFxuXHRcdFx0dGhpcy5jb250ZXh0LFxuXHRcdFx0e1xuXHRcdFx0XHR0aXRsZTogdGhpcy5nZXRUaXRsZSgpLFxuXHRcdFx0XHRpY29uOiB0b29sPy5pY29uICYmIGhhc0tleSh0b29sLmljb24sIHsgaWQ6IHRydWUgfSkgPyB0b29sLmljb24gOiBDb2RpY29uLnRvb2xzLFxuXHRcdFx0XHRzdWJ0aXRsZTogdHlwZW9mIHRvb2xJbnZvY2F0aW9uLm9yaWdpbk1lc3NhZ2UgPT09ICdzdHJpbmcnID8gdG9vbEludm9jYXRpb24ub3JpZ2luTWVzc2FnZSA6IHRvb2xJbnZvY2F0aW9uLm9yaWdpbk1lc3NhZ2U/LnZhbHVlLFxuXHRcdFx0XHRidXR0b25zOiB0aGlzLmNyZWF0ZUJ1dHRvbnMoZGF0YS5vcHRpb25zKSxcblx0XHRcdFx0bWVzc2FnZTogdGhpcy5jcmVhdGVXaWRnZXRDb250ZW50RWxlbWVudChzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcy5tZXNzYWdlLCBkYXRhKSxcblx0XHRcdFx0Zm9vdGVyQmFubmVyOiBjcmVhdGVBcHByb3ZhbFJlYXNvbkJhZGdlKHRoaXMuX3N0b3JlLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcy5hcHByb3ZhbFJlYXNvbik/LmRvbU5vZGVcblx0XHRcdFx0XHQ/PyB0aGlzLmNyZWF0ZVJpc2tCYWRnZURvbU5vZGUoc3RhdGUucGFyYW1ldGVycyksXG5cdFx0XHR9XG5cdFx0KSk7XG5cblx0XHRjb25zdCBoYXNUb29sQ29uZmlybWF0aW9uID0gQ2hhdENvbnRleHRLZXlzLkVkaXRpbmcuaGFzVG9vbENvbmZpcm1hdGlvbi5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aGFzVG9vbENvbmZpcm1hdGlvbi5zZXQodHJ1ZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihjb25maXJtV2lkZ2V0Lm9uRGlkQ2xpY2soKHsgYnV0dG9uLCBpc1RvdWNoQ2xpY2sgfSkgPT4ge1xuXHRcdFx0YnV0dG9uLmRhdGEoKTtcblx0XHRcdGlmICghaXNUb3VjaENsaWNrKSB7XG5cdFx0XHRcdHRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UodGhpcy5jb250ZXh0LmVsZW1lbnQuc2Vzc2lvblJlc291cmNlKT8uZm9jdXNJbnB1dCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiBoYXNUb29sQ29uZmlybWF0aW9uLnJlc2V0KCkpKTtcblx0XHR0aGlzLmRvbU5vZGUgPSBjb25maXJtV2lkZ2V0LmRvbU5vZGU7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUJ1dHRvbnMob3B0aW9uczogcmVhZG9ubHkgc3RyaW5nW10pOiBJQ2hhdENvbmZpcm1hdGlvbkJ1dHRvbjwoKSA9PiB2b2lkPltdIHtcblx0XHRjb25zdCBbcHJpbWFyeU9wdGlvbiwgLi4uc2Vjb25kYXJ5T3B0aW9uc10gPSBvcHRpb25zO1xuXHRcdHJldHVybiBbXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiBwcmltYXJ5T3B0aW9uLFxuXHRcdFx0XHRkYXRhOiAoKSA9PiB0aGlzLmNvbmZpcm1XaXRoKHRoaXMudG9vbEludm9jYXRpb24sIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24sIHNlbGVjdGVkQnV0dG9uOiBwcmltYXJ5T3B0aW9uIH0pLFxuXHRcdFx0XHRtb3JlQWN0aW9uczogc2Vjb25kYXJ5T3B0aW9ucy5tYXAob3B0aW9uID0+ICh7XG5cdFx0XHRcdFx0bGFiZWw6IG9wdGlvbixcblx0XHRcdFx0XHRkYXRhOiAoKSA9PiB0aGlzLmNvbmZpcm1XaXRoKHRoaXMudG9vbEludm9jYXRpb24sIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24sIHNlbGVjdGVkQnV0dG9uOiBvcHRpb24gfSksXG5cdFx0XHRcdH0pKVxuXHRcdFx0fVxuXHRcdF07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVdpZGdldENvbnRlbnRFbGVtZW50KG1lc3NhZ2U6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCwgZGF0YTogSUNoYXRNb2RpZmllZEZpbGVzQ29uZmlybWF0aW9uRGF0YSk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb20uJCgnLmNoYXQtbW9kaWZpZWQtZmlsZXMtY29uZmlybWF0aW9uJyk7XG5cblx0XHRpZiAobWVzc2FnZSkge1xuXHRcdFx0Y29uc3QgcmVuZGVyZWRNZXNzYWdlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIodHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnID8gbmV3IE1hcmtkb3duU3RyaW5nKG1lc3NhZ2UpIDogbWVzc2FnZSkpO1xuXHRcdFx0cmVuZGVyRmlsZVdpZGdldHMocmVuZGVyZWRNZXNzYWdlLmVsZW1lbnQsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIHRoaXMuY2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSwgdGhpcy5fc3RvcmUsIHtcblx0XHRcdFx0Li4udGhpcy5vcGVuZWRFZGl0b3JzLmZpbGVXaWRnZXRPcHRpb25zLFxuXHRcdFx0XHRvcGVuUmVzb3VyY2U6IChyZXNvdXJjZSwgZWRpdG9yT3B0aW9ucykgPT4gdGhpcy5vcGVuTW9kaWZpZWRGaWxlUHJldmlldyhkYXRhLCByZXNvdXJjZSwgZWRpdG9yT3B0aW9ucyksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnRhaW5lci5hcHBlbmQocmVuZGVyZWRNZXNzYWdlLmVsZW1lbnQpO1xuXHRcdH1cblxuXHRcdGNvbnRhaW5lci5hcHBlbmQodGhpcy5jcmVhdGVNb2RpZmllZEZpbGVzRWxlbWVudChkYXRhKSk7XG5cdFx0cmV0dXJuIGNvbnRhaW5lcjtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlTW9kaWZpZWRGaWxlc0VsZW1lbnQoZGF0YTogSUNoYXRNb2RpZmllZEZpbGVzQ29uZmlybWF0aW9uRGF0YSk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb20uJCgnLmNoYXQtbW9kaWZpZWQtZmlsZXMtY29uZmlybWF0aW9uLWxpc3QuY2hhdC1lZGl0aW5nLXNlc3Npb24tY29udGFpbmVyLnNob3ctZmlsZS1pY29ucycpO1xuXHRcdGNvbnN0IG92ZXJ2aWV3ID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuY2hhdC1lZGl0aW5nLXNlc3Npb24tb3ZlcnZpZXcnKSk7XG5cdFx0Y29uc3QgdGl0bGUgPSBkb20uYXBwZW5kKG92ZXJ2aWV3LCBkb20uJCgnLndvcmtpbmctc2V0LXRpdGxlJykpO1xuXHRcdGNvbnN0IHRpdGxlQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbldpdGhJY29uKHRpdGxlLCB7XG5cdFx0XHRidXR0b25CYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25Cb3JkZXI6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvbkZvcmVncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvbkhvdmVyQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0YnV0dG9uU2Vjb25kYXJ5QmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0YnV0dG9uU2Vjb25kYXJ5Rm9yZWdyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0YnV0dG9uU2Vjb25kYXJ5SG92ZXJCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25TZXBhcmF0b3I6IHVuZGVmaW5lZCxcblx0XHRcdHN1cHBvcnRJY29uczogdHJ1ZSxcblx0XHR9KSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGRvbS5hcHBlbmQob3ZlcnZpZXcsIGRvbS4kKCcuY2hhdC1lZGl0aW5nLXNlc3Npb24tYWN0aW9ucycpKTtcblx0XHRjb25zdCBjb3VudHNDb250YWluZXIgPSBkb20uJCgnLndvcmtpbmctc2V0LWxpbmUtY291bnRzJyk7XG5cdFx0Y29uc3QgYWRkZWRTcGFuID0gZG9tLmFwcGVuZChjb3VudHNDb250YWluZXIsIGRvbS4kKCcud29ya2luZy1zZXQtbGluZXMtYWRkZWQnKSk7XG5cdFx0Y29uc3QgcmVtb3ZlZFNwYW4gPSBkb20uYXBwZW5kKGNvdW50c0NvbnRhaW5lciwgZG9tLiQoJy53b3JraW5nLXNldC1saW5lcy1yZW1vdmVkJykpO1xuXHRcdHRpdGxlQnV0dG9uLmVsZW1lbnQuYXBwZW5kQ2hpbGQoY291bnRzQ29udGFpbmVyKTtcblxuXHRcdGNvbnN0IGZpbGVzTGFiZWwgPSBnZXRNb2RpZmllZEZpbGVzU3VtbWFyeUxhYmVsKGRhdGEubW9kaWZpZWRGaWxlcyk7XG5cdFx0dGl0bGVCdXR0b24ubGFiZWwgPSBmaWxlc0xhYmVsO1xuXG5cdFx0bGV0IGFkZGVkID0gMDtcblx0XHRsZXQgcmVtb3ZlZCA9IDA7XG5cdFx0bGV0IGhhc0RpZmZTdGF0cyA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgZmlsZSBvZiBkYXRhLm1vZGlmaWVkRmlsZXMpIHtcblx0XHRcdGlmICh0eXBlb2YgZmlsZS5pbnNlcnRpb25zID09PSAnbnVtYmVyJyB8fCB0eXBlb2YgZmlsZS5kZWxldGlvbnMgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdGhhc0RpZmZTdGF0cyA9IHRydWU7XG5cdFx0XHRcdGFkZGVkICs9IGZpbGUuaW5zZXJ0aW9ucyA/PyAwO1xuXHRcdFx0XHRyZW1vdmVkICs9IGZpbGUuZGVsZXRpb25zID8/IDA7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGhhc0RpZmZTdGF0cykge1xuXHRcdFx0YWRkZWRTcGFuLnRleHRDb250ZW50ID0gYCske2FkZGVkfWA7XG5cdFx0XHRyZW1vdmVkU3Bhbi50ZXh0Q29udGVudCA9IGAtJHtyZW1vdmVkfWA7XG5cdFx0XHR0aXRsZUJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdtb2RpZmllZEZpbGVzU3VtbWFyeVdpdGhDb3VudHMnLCAnezB9LCB7MX0gbGluZXMgYWRkZWQsIHsyfSBsaW5lcyByZW1vdmVkJywgZmlsZXNMYWJlbCwgYWRkZWQsIHJlbW92ZWQpKTtcblx0XHRcdGNvdW50c0NvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnbW9kaWZpZWRGaWxlc0NvdW50cycsICd7MH0gbGluZXMgYWRkZWQsIHsxfSBsaW5lcyByZW1vdmVkJywgYWRkZWQsIHJlbW92ZWQpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y291bnRzQ29udGFpbmVyLnJlbW92ZSgpO1xuXHRcdFx0dGl0bGVCdXR0b24uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBmaWxlc0xhYmVsKTtcblx0XHR9XG5cblx0XHRjb25zdCB2aWV3QWxsQ2hhbmdlc0J1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24oYWN0aW9ucywge1xuXHRcdFx0Li4uZGVmYXVsdEJ1dHRvblN0eWxlcyxcblx0XHRcdHNlY29uZGFyeTogdHJ1ZSxcblx0XHRcdHNtYWxsOiB0cnVlLFxuXHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgndmlld0FsbENoYW5nZXMnLCAnVmlldyBBbGwgQ2hhbmdlcycpLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCd2aWV3QWxsQ2hhbmdlcycsICdWaWV3IEFsbCBDaGFuZ2VzJyksXG5cdFx0fSkpO1xuXHRcdHZpZXdBbGxDaGFuZ2VzQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZGVmYXVsdC1jb2xvcnMnKTtcblx0XHR2aWV3QWxsQ2hhbmdlc0J1dHRvbi5pY29uID0gQ29kaWNvbi5kaWZmTXVsdGlwbGU7XG5cdFx0dmlld0FsbENoYW5nZXNCdXR0b24ubGFiZWwgPSAnICc7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodmlld0FsbENoYW5nZXNCdXR0b24ub25EaWRDbGljayhhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLm9wZW5BbGxDaGFuZ2VzKGRhdGEpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGxpc3RSZWZlcmVuY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmxpc3RQb29sLmdldCgpKTtcblx0XHRjb25zdCBsaXN0ID0gbGlzdFJlZmVyZW5jZS5vYmplY3Q7XG5cdFx0Y29uc3QgbGlzdEl0ZW1zID0gZGF0YS5tb2RpZmllZEZpbGVzLm1hcDxJQ2hhdENvbGxhcHNpYmxlTGlzdEl0ZW0+KGZpbGUgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucmV2aXZlKGZpbGUudXJpKTtcblx0XHRcdGNvbnN0IG9yaWdpbmFsVXJpID0gZmlsZS5vcmlnaW5hbFVyaSA/IFVSSS5yZXZpdmUoZmlsZS5vcmlnaW5hbFVyaSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBtb2RpZmllZENvbnRlbnRVcmkgPSBmaWxlLm1vZGlmaWVkQ29udGVudFVyaSA/IFVSSS5yZXZpdmUoZmlsZS5tb2RpZmllZENvbnRlbnRVcmkpIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxDb250ZW50VXJpID0gZmlsZS5vcmlnaW5hbENvbnRlbnRVcmkgPyBVUkkucmV2aXZlKGZpbGUub3JpZ2luYWxDb250ZW50VXJpKSA6IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6ICdyZWZlcmVuY2UnLFxuXHRcdFx0XHRyZWZlcmVuY2U6IHJlc291cmNlLFxuXHRcdFx0XHR0aXRsZTogZmlsZS50aXRsZSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGZpbGUuZGVzY3JpcHRpb24sXG5cdFx0XHRcdHN0YXRlOiBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLkFjY2VwdGVkLFxuXHRcdFx0XHRzaG93TW9kaWZpZWRTdGF0ZTogdHJ1ZSxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdGRpZmZNZXRhOiB0eXBlb2YgZmlsZS5pbnNlcnRpb25zID09PSAnbnVtYmVyJyB8fCB0eXBlb2YgZmlsZS5kZWxldGlvbnMgPT09ICdudW1iZXInID8ge1xuXHRcdFx0XHRcdFx0YWRkZWQ6IGZpbGUuaW5zZXJ0aW9ucyA/PyAwLFxuXHRcdFx0XHRcdFx0cmVtb3ZlZDogZmlsZS5kZWxldGlvbnMgPz8gMCxcblx0XHRcdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG9yaWdpbmFsVXJpOiBvcmlnaW5hbENvbnRlbnRVcmkgPz8gb3JpZ2luYWxVcmksXG5cdFx0XHRcdFx0bW9kaWZpZWRVcmk6IG1vZGlmaWVkQ29udGVudFVyaSxcblx0XHRcdFx0XHRzdGF0dXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGxpc3Qub25EaWRPcGVuKGFzeW5jIGUgPT4ge1xuXHRcdFx0aWYgKGUuZWxlbWVudD8ua2luZCAhPT0gJ3JlZmVyZW5jZScgfHwgIVVSSS5pc1VyaShlLmVsZW1lbnQucmVmZXJlbmNlKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG9wdGlvbnMgPSBlLmVsZW1lbnQub3B0aW9ucztcblx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGNyZWF0ZU1vZGlmaWVkRmlsZVByZXZpZXdFZGl0b3JJbnB1dChcblx0XHRcdFx0ZS5lbGVtZW50LnJlZmVyZW5jZSxcblx0XHRcdFx0b3B0aW9ucz8ub3JpZ2luYWxVcmksXG5cdFx0XHRcdG9wdGlvbnM/Lm1vZGlmaWVkVXJpLFxuXHRcdFx0XHRlLmVsZW1lbnQudGl0bGUsXG5cdFx0XHRcdGUuZWRpdG9yT3B0aW9ucyxcblx0XHRcdCkpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG1heEl0ZW1zU2hvd24gPSA2O1xuXHRcdGNvbnN0IGl0ZW1zU2hvd24gPSBNYXRoLm1pbihsaXN0SXRlbXMubGVuZ3RoLCBtYXhJdGVtc1Nob3duKTtcblx0XHRjb25zdCBoZWlnaHQgPSBpdGVtc1Nob3duICogMjI7XG5cdFx0Y29uc3Qgd29ya2luZ1NldENvbnRhaW5lciA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLmNoYXQtZWRpdGluZy1zZXNzaW9uLWxpc3QuY29sbGFwc2VkJykpO1xuXHRcdGxpc3QubGF5b3V0KGhlaWdodCk7XG5cdFx0bGlzdC5nZXRIVE1MRWxlbWVudCgpLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0bGlzdC5zcGxpY2UoMCwgbGlzdC5sZW5ndGgsIGxpc3RJdGVtcyk7XG5cdFx0d29ya2luZ1NldENvbnRhaW5lci5hcHBlbmQobGlzdC5nZXRIVE1MRWxlbWVudCgpKTtcblxuXHRcdGxldCBpc0NvbGxhcHNlZCA9IHRydWU7XG5cdFx0Y29uc3Qgc2V0RXhwYW5zaW9uU3RhdGUgPSAoKSA9PiB7XG5cdFx0XHR0aXRsZUJ1dHRvbi5pY29uID0gaXNDb2xsYXBzZWQgPyBDb2RpY29uLmNoZXZyb25SaWdodCA6IENvZGljb24uY2hldnJvbkRvd247XG5cdFx0XHR3b3JraW5nU2V0Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2NvbGxhcHNlZCcsIGlzQ29sbGFwc2VkKTtcblx0XHR9O1xuXHRcdHNldEV4cGFuc2lvblN0YXRlKCk7XG5cblx0XHRjb25zdCB0b2dnbGVXb3JraW5nU2V0ID0gKCkgPT4ge1xuXHRcdFx0aXNDb2xsYXBzZWQgPSAhaXNDb2xsYXBzZWQ7XG5cdFx0XHRzZXRFeHBhbnNpb25TdGF0ZSgpO1xuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aXRsZUJ1dHRvbi5vbkRpZENsaWNrKHRvZ2dsZVdvcmtpbmdTZXQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG92ZXJ2aWV3LCAnY2xpY2snLCBlID0+IHtcblx0XHRcdGlmIChlLmRlZmF1bHRQcmV2ZW50ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGlmICh0YXJnZXQuY2xvc2VzdCgnLm1vbmFjby1idXR0b24nKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRvZ2dsZVdvcmtpbmdTZXQoKTtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gY29udGFpbmVyO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuTW9kaWZpZWRGaWxlUHJldmlldyhkYXRhOiBJQ2hhdE1vZGlmaWVkRmlsZXNDb25maXJtYXRpb25EYXRhLCByZXNvdXJjZTogVVJJLCBlZGl0b3JPcHRpb25zOiBJRWRpdG9yT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGZpbGUgPSBmaW5kTW9kaWZpZWRGaWxlQ29uZmlybWF0aW9uRW50cnkoZGF0YS5tb2RpZmllZEZpbGVzLCByZXNvdXJjZSk7XG5cdFx0aWYgKCFmaWxlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoY3JlYXRlTW9kaWZpZWRGaWxlUHJldmlld0VkaXRvcklucHV0KFxuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRmaWxlLm9yaWdpbmFsQ29udGVudFVyaSA/IFVSSS5yZXZpdmUoZmlsZS5vcmlnaW5hbENvbnRlbnRVcmkpIDogZmlsZS5vcmlnaW5hbFVyaSA/IFVSSS5yZXZpdmUoZmlsZS5vcmlnaW5hbFVyaSkgOiB1bmRlZmluZWQsXG5cdFx0XHRmaWxlLm1vZGlmaWVkQ29udGVudFVyaSA/IFVSSS5yZXZpdmUoZmlsZS5tb2RpZmllZENvbnRlbnRVcmkpIDogdW5kZWZpbmVkLFxuXHRcdFx0ZmlsZS50aXRsZSxcblx0XHRcdGVkaXRvck9wdGlvbnMsXG5cdFx0KSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5BbGxDaGFuZ2VzKGRhdGE6IElDaGF0TW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvbkRhdGEpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdfd29ya2JlbmNoLm9wZW5NdWx0aURpZmZFZGl0b3InLCB7XG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ21vZGlmaWVkRmlsZXNBbGxDaGFuZ2VzVGl0bGUnLCAnQWxsIENoYW5nZXMnKSxcblx0XHRcdHJlc291cmNlczogZGF0YS5tb2RpZmllZEZpbGVzLm1hcChmaWxlID0+ICh7XG5cdFx0XHRcdG9yaWdpbmFsVXJpOiBmaWxlLm9yaWdpbmFsQ29udGVudFVyaSA/IFVSSS5yZXZpdmUoZmlsZS5vcmlnaW5hbENvbnRlbnRVcmkpIDogZmlsZS5vcmlnaW5hbFVyaSA/IFVSSS5yZXZpdmUoZmlsZS5vcmlnaW5hbFVyaSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdG1vZGlmaWVkVXJpOiBmaWxlLm1vZGlmaWVkQ29udGVudFVyaSA/IFVSSS5yZXZpdmUoZmlsZS5tb2RpZmllZENvbnRlbnRVcmkpIDogVVJJLnJldml2ZShmaWxlLnVyaSksXG5cdFx0XHR9KSlcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVDb250ZW50RWxlbWVudCgpOiBIVE1MRWxlbWVudCB8IHN0cmluZyB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdOb3QgdXNlZCcpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFRpdGxlKCk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLnRvb2xJbnZvY2F0aW9uLnN0YXRlLmdldCgpO1xuXHRcdGlmIChzdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGl0bGUgPSBzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGU7XG5cdFx0cmV0dXJuIHR5cGVvZiB0aXRsZSA9PT0gJ3N0cmluZycgPyB0aXRsZSA6IHRpdGxlPy52YWx1ZSA/PyAnJztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxRQUFRLHNCQUFzQjtBQUN2QyxTQUFTLGVBQWU7QUFDeEIsU0FBMEIsc0JBQXNCO0FBQ2hELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsVUFBVSxlQUFlO0FBQ2xDLFNBQVMsY0FBYztBQUN2QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywyQkFBMkI7QUFDcEMsU0FBNkMscUJBQXFCLHVCQUF1QjtBQUN6RixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUE2QiwwQkFBMEI7QUFDdkQsU0FBUyxzQ0FBc0M7QUFFL0MsU0FBUyxvQ0FBNkQ7QUFDdEUsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQ0FBa0M7QUFHM0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyxpQ0FBaUM7QUFJMUMsU0FBUyxjQUFjLE1BQThDO0FBQ3BFLFNBQU8sS0FBSyxhQUFhLFlBQWEsS0FBSyxhQUFhLFVBQWEsQ0FBQyxLQUFLLGVBQWUsQ0FBQyxLQUFLLHNCQUFzQixDQUFDLENBQUMsS0FBSztBQUM5SDtBQUdPLFNBQVMsa0NBQWtDLGVBQXlELFVBQTBEO0FBQ3BLLFNBQU8sY0FBYyxLQUFLLFVBQVEsUUFBUSxJQUFJLE9BQU8sS0FBSyxHQUFHLEdBQUcsUUFBUSxDQUFDO0FBQzFFO0FBR08sU0FBUyw2QkFBNkIsZUFBaUU7QUFDN0csUUFBTSxrQkFBa0IsY0FBYyxTQUFTLEtBQUssY0FBYyxNQUFNLGFBQWE7QUFDckYsTUFBSSxpQkFBaUI7QUFDcEIsV0FBTyxjQUFjLFdBQVcsSUFDN0IsU0FBUyxrQkFBa0IsZ0JBQWdCLElBQzNDLFNBQVMsb0JBQW9CLHFCQUFxQixjQUFjLE1BQU07QUFBQSxFQUMxRTtBQUVBLFNBQU8sY0FBYyxXQUFXLElBQzdCLFNBQVMsa0JBQWtCLGdCQUFnQixJQUMzQyxTQUFTLG9CQUFvQixxQkFBcUIsY0FBYyxNQUFNO0FBQzFFO0FBR08sU0FBUyxxQ0FBcUMsVUFBZSxhQUE4QixvQkFBcUMsT0FBMkIsU0FBMEQ7QUFDM04sUUFBTSxjQUFjLHNCQUFzQjtBQUMxQyxNQUFJLGFBQWE7QUFDaEIsV0FBTztBQUFBLE1BQ04sVUFBVSxFQUFFLFVBQVUsWUFBWTtBQUFBLE1BQ2xDLFVBQVUsRUFBRSxVQUFVLFlBQVk7QUFBQSxNQUNsQztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsTUFBSSxvQkFBb0I7QUFDdkIsV0FBTztBQUFBLE1BQ04sT0FBTyxTQUFTLFNBQVMsUUFBUTtBQUFBLE1BQ2pDLFVBQVUsRUFBRSxVQUFVLFFBQVcsVUFBVSxHQUFHO0FBQUEsTUFDOUMsVUFBVSxFQUFFLFVBQVUsbUJBQW1CO0FBQUEsTUFDekM7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLFNBQU8sRUFBRSxVQUFVLFFBQVE7QUFDNUI7QUFFTyxJQUFNLHVDQUFOLGNBQW1ELGdDQUFnQztBQUFBLEVBSXpGLFlBQ0MsZ0JBQ0EsU0FDaUIsVUFDTSxzQkFDSCxtQkFDQSxtQkFDQSxtQkFDUSwyQkFDZSx5QkFDRSwyQkFDWixlQUNDLGdCQUNGLHVCQUMvQjtBQUNELFVBQU0sZ0JBQWdCLFNBQVMsc0JBQXNCLG1CQUFtQixtQkFBbUIsbUJBQW1CLDJCQUEyQixxQkFBcUI7QUFaN0k7QUFNMEI7QUFDRTtBQUNaO0FBQ0M7QUFkbkMsU0FBeUIsYUFBbUMsQ0FBQztBQW1CNUQsVUFBTSxRQUFRLGVBQWUsTUFBTSxJQUFJO0FBQ3ZDLFFBQUksTUFBTSxTQUFTLG9CQUFvQixVQUFVLDBCQUEwQixDQUFDLE1BQU0sc0JBQXNCLE9BQU87QUFDOUcsWUFBTSxJQUFJLE1BQU0sa0RBQWtEO0FBQUEsSUFDbkU7QUFFQSxVQUFNLE9BQU8sZUFBZTtBQUM1QixRQUFJLENBQUMsUUFBUSxLQUFLLFNBQVMsNkJBQTZCO0FBQ3ZELFlBQU0sSUFBSSxNQUFNLDZDQUE2QztBQUFBLElBQzlEO0FBRUEsVUFBTSxPQUFPLDBCQUEwQixRQUFRLGVBQWUsTUFBTTtBQUNwRSxVQUFNLGdCQUFnQixLQUFLLFVBQVUsS0FBSyxxQkFBcUI7QUFBQSxNQUM5RDtBQUFBLE1BQ0EsS0FBSztBQUFBLE1BQ0w7QUFBQSxRQUNDLE9BQU8sS0FBSyxTQUFTO0FBQUEsUUFDckIsTUFBTSxNQUFNLFFBQVEsT0FBTyxLQUFLLE1BQU0sRUFBRSxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssT0FBTyxRQUFRO0FBQUEsUUFDMUUsVUFBVSxPQUFPLGVBQWUsa0JBQWtCLFdBQVcsZUFBZSxnQkFBZ0IsZUFBZSxlQUFlO0FBQUEsUUFDMUgsU0FBUyxLQUFLLGNBQWMsS0FBSyxPQUFPO0FBQUEsUUFDeEMsU0FBUyxLQUFLLDJCQUEyQixNQUFNLHFCQUFxQixTQUFTLElBQUk7QUFBQSxRQUNqRixjQUFjLDBCQUEwQixLQUFLLFFBQVEsS0FBSyxzQkFBc0IsTUFBTSxxQkFBcUIsY0FBYyxHQUFHLFdBQ3hILEtBQUssdUJBQXVCLE1BQU0sVUFBVTtBQUFBLE1BQ2pEO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSxzQkFBc0IsZ0JBQWdCLFFBQVEsb0JBQW9CLE9BQU8sS0FBSyxpQkFBaUI7QUFDckcsd0JBQW9CLElBQUksSUFBSTtBQUU1QixTQUFLLFVBQVUsY0FBYyxXQUFXLENBQUMsRUFBRSxRQUFRLGFBQWEsTUFBTTtBQUNyRSxhQUFPLEtBQUs7QUFDWixVQUFJLENBQUMsY0FBYztBQUNsQixhQUFLLGtCQUFrQiwyQkFBMkIsS0FBSyxRQUFRLFFBQVEsZUFBZSxHQUFHLFdBQVc7QUFBQSxNQUNyRztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLGFBQWEsTUFBTSxvQkFBb0IsTUFBTSxDQUFDLENBQUM7QUFDOUQsU0FBSyxVQUFVLGNBQWM7QUFBQSxFQUM5QjtBQUFBLEVBRVEsY0FBYyxTQUFtRTtBQUN4RixVQUFNLENBQUMsZUFBZSxHQUFHLGdCQUFnQixJQUFJO0FBQzdDLFdBQU87QUFBQSxNQUNOO0FBQUEsUUFDQyxPQUFPO0FBQUEsUUFDUCxNQUFNLE1BQU0sS0FBSyxZQUFZLEtBQUssZ0JBQWdCLEVBQUUsTUFBTSxnQkFBZ0IsWUFBWSxnQkFBZ0IsY0FBYyxDQUFDO0FBQUEsUUFDckgsYUFBYSxpQkFBaUIsSUFBSSxhQUFXO0FBQUEsVUFDNUMsT0FBTztBQUFBLFVBQ1AsTUFBTSxNQUFNLEtBQUssWUFBWSxLQUFLLGdCQUFnQixFQUFFLE1BQU0sZ0JBQWdCLFlBQVksZ0JBQWdCLE9BQU8sQ0FBQztBQUFBLFFBQy9HLEVBQUU7QUFBQSxNQUNIO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDJCQUEyQixTQUErQyxNQUF1RDtBQUN4SSxVQUFNLFlBQVksSUFBSSxFQUFFLG1DQUFtQztBQUUzRCxRQUFJLFNBQVM7QUFDWixZQUFNLGtCQUFrQixLQUFLLFVBQVUsS0FBSyx3QkFBd0IsT0FBTyxPQUFPLFlBQVksV0FBVyxJQUFJLGVBQWUsT0FBTyxJQUFJLE9BQU8sQ0FBQztBQUMvSSx3QkFBa0IsZ0JBQWdCLFNBQVMsS0FBSyxzQkFBc0IsS0FBSywyQkFBMkIsS0FBSyxRQUFRO0FBQUEsUUFDbEgsR0FBRyxLQUFLLGNBQWM7QUFBQSxRQUN0QixjQUFjLENBQUMsVUFBVSxrQkFBa0IsS0FBSyx3QkFBd0IsTUFBTSxVQUFVLGFBQWE7QUFBQSxNQUN0RyxDQUFDO0FBQ0QsZ0JBQVUsT0FBTyxnQkFBZ0IsT0FBTztBQUFBLElBQ3pDO0FBRUEsY0FBVSxPQUFPLEtBQUssMkJBQTJCLElBQUksQ0FBQztBQUN0RCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsMkJBQTJCLE1BQXVEO0FBQ3pGLFVBQU0sWUFBWSxJQUFJLEVBQUUsdUZBQXVGO0FBQy9HLFVBQU0sV0FBVyxJQUFJLE9BQU8sV0FBVyxJQUFJLEVBQUUsZ0NBQWdDLENBQUM7QUFDOUUsVUFBTSxRQUFRLElBQUksT0FBTyxVQUFVLElBQUksRUFBRSxvQkFBb0IsQ0FBQztBQUM5RCxVQUFNLGNBQWMsS0FBSyxVQUFVLElBQUksZUFBZSxPQUFPO0FBQUEsTUFDNUQsa0JBQWtCO0FBQUEsTUFDbEIsY0FBYztBQUFBLE1BQ2Qsa0JBQWtCO0FBQUEsTUFDbEIsdUJBQXVCO0FBQUEsTUFDdkIsMkJBQTJCO0FBQUEsTUFDM0IsMkJBQTJCO0FBQUEsTUFDM0IsZ0NBQWdDO0FBQUEsTUFDaEMsaUJBQWlCO0FBQUEsTUFDakIsY0FBYztBQUFBLElBQ2YsQ0FBQyxDQUFDO0FBQ0YsVUFBTSxVQUFVLElBQUksT0FBTyxVQUFVLElBQUksRUFBRSwrQkFBK0IsQ0FBQztBQUMzRSxVQUFNLGtCQUFrQixJQUFJLEVBQUUsMEJBQTBCO0FBQ3hELFVBQU0sWUFBWSxJQUFJLE9BQU8saUJBQWlCLElBQUksRUFBRSwwQkFBMEIsQ0FBQztBQUMvRSxVQUFNLGNBQWMsSUFBSSxPQUFPLGlCQUFpQixJQUFJLEVBQUUsNEJBQTRCLENBQUM7QUFDbkYsZ0JBQVksUUFBUSxZQUFZLGVBQWU7QUFFL0MsVUFBTSxhQUFhLDZCQUE2QixLQUFLLGFBQWE7QUFDbEUsZ0JBQVksUUFBUTtBQUVwQixRQUFJLFFBQVE7QUFDWixRQUFJLFVBQVU7QUFDZCxRQUFJLGVBQWU7QUFDbkIsZUFBVyxRQUFRLEtBQUssZUFBZTtBQUN0QyxVQUFJLE9BQU8sS0FBSyxlQUFlLFlBQVksT0FBTyxLQUFLLGNBQWMsVUFBVTtBQUM5RSx1QkFBZTtBQUNmLGlCQUFTLEtBQUssY0FBYztBQUM1QixtQkFBVyxLQUFLLGFBQWE7QUFBQSxNQUM5QjtBQUFBLElBQ0Q7QUFFQSxRQUFJLGNBQWM7QUFDakIsZ0JBQVUsY0FBYyxJQUFJLEtBQUs7QUFDakMsa0JBQVksY0FBYyxJQUFJLE9BQU87QUFDckMsa0JBQVksUUFBUSxhQUFhLGNBQWMsU0FBUyxrQ0FBa0MsMkNBQTJDLFlBQVksT0FBTyxPQUFPLENBQUM7QUFDaEssc0JBQWdCLGFBQWEsY0FBYyxTQUFTLHVCQUF1QixzQ0FBc0MsT0FBTyxPQUFPLENBQUM7QUFBQSxJQUNqSSxPQUFPO0FBQ04sc0JBQWdCLE9BQU87QUFDdkIsa0JBQVksUUFBUSxhQUFhLGNBQWMsVUFBVTtBQUFBLElBQzFEO0FBRUEsVUFBTSx1QkFBdUIsS0FBSyxVQUFVLElBQUksT0FBTyxTQUFTO0FBQUEsTUFDL0QsR0FBRztBQUFBLE1BQ0gsV0FBVztBQUFBLE1BQ1gsT0FBTztBQUFBLE1BQ1AsY0FBYztBQUFBLE1BQ2QsV0FBVyxTQUFTLGtCQUFrQixrQkFBa0I7QUFBQSxNQUN4RCxPQUFPLFNBQVMsa0JBQWtCLGtCQUFrQjtBQUFBLElBQ3JELENBQUMsQ0FBQztBQUNGLHlCQUFxQixRQUFRLFVBQVUsSUFBSSxnQkFBZ0I7QUFDM0QseUJBQXFCLE9BQU8sUUFBUTtBQUNwQyx5QkFBcUIsUUFBUTtBQUM3QixTQUFLLFVBQVUscUJBQXFCLFdBQVcsWUFBWTtBQUMxRCxZQUFNLEtBQUssZUFBZSxJQUFJO0FBQUEsSUFDL0IsQ0FBQyxDQUFDO0FBRUYsVUFBTSxnQkFBZ0IsS0FBSyxVQUFVLEtBQUssU0FBUyxJQUFJLENBQUM7QUFDeEQsVUFBTSxPQUFPLGNBQWM7QUFDM0IsVUFBTSxZQUFZLEtBQUssY0FBYyxJQUE4QixVQUFRO0FBQzFFLFlBQU0sV0FBVyxJQUFJLE9BQU8sS0FBSyxHQUFHO0FBQ3BDLFlBQU0sY0FBYyxLQUFLLGNBQWMsSUFBSSxPQUFPLEtBQUssV0FBVyxJQUFJO0FBQ3RFLFlBQU0scUJBQXFCLEtBQUsscUJBQXFCLElBQUksT0FBTyxLQUFLLGtCQUFrQixJQUFJO0FBQzNGLFlBQU0scUJBQXFCLEtBQUsscUJBQXFCLElBQUksT0FBTyxLQUFLLGtCQUFrQixJQUFJO0FBQzNGLGFBQU87QUFBQSxRQUNOLE1BQU07QUFBQSxRQUNOLFdBQVc7QUFBQSxRQUNYLE9BQU8sS0FBSztBQUFBLFFBQ1osYUFBYSxLQUFLO0FBQUEsUUFDbEIsT0FBTyx1QkFBdUI7QUFBQSxRQUM5QixtQkFBbUI7QUFBQSxRQUNuQixTQUFTO0FBQUEsVUFDUixVQUFVLE9BQU8sS0FBSyxlQUFlLFlBQVksT0FBTyxLQUFLLGNBQWMsV0FBVztBQUFBLFlBQ3JGLE9BQU8sS0FBSyxjQUFjO0FBQUEsWUFDMUIsU0FBUyxLQUFLLGFBQWE7QUFBQSxVQUM1QixJQUFJO0FBQUEsVUFDSixhQUFhLHNCQUFzQjtBQUFBLFVBQ25DLGFBQWE7QUFBQSxVQUNiLFFBQVE7QUFBQSxRQUNUO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssVUFBVSxLQUFLLFVBQVUsT0FBTSxNQUFLO0FBQ3hDLFVBQUksRUFBRSxTQUFTLFNBQVMsZUFBZSxDQUFDLElBQUksTUFBTSxFQUFFLFFBQVEsU0FBUyxHQUFHO0FBQ3ZFO0FBQUEsTUFDRDtBQUVBLFlBQU0sVUFBVSxFQUFFLFFBQVE7QUFDMUIsWUFBTSxLQUFLLGNBQWMsV0FBVztBQUFBLFFBQ25DLEVBQUUsUUFBUTtBQUFBLFFBQ1YsU0FBUztBQUFBLFFBQ1QsU0FBUztBQUFBLFFBQ1QsRUFBRSxRQUFRO0FBQUEsUUFDVixFQUFFO0FBQUEsTUFDSCxDQUFDO0FBQUEsSUFDRixDQUFDLENBQUM7QUFFRixVQUFNLGdCQUFnQjtBQUN0QixVQUFNLGFBQWEsS0FBSyxJQUFJLFVBQVUsUUFBUSxhQUFhO0FBQzNELFVBQU0sU0FBUyxhQUFhO0FBQzVCLFVBQU0sc0JBQXNCLElBQUksT0FBTyxXQUFXLElBQUksRUFBRSxzQ0FBc0MsQ0FBQztBQUMvRixTQUFLLE9BQU8sTUFBTTtBQUNsQixTQUFLLGVBQWUsRUFBRSxNQUFNLFNBQVMsR0FBRyxNQUFNO0FBQzlDLFNBQUssT0FBTyxHQUFHLEtBQUssUUFBUSxTQUFTO0FBQ3JDLHdCQUFvQixPQUFPLEtBQUssZUFBZSxDQUFDO0FBRWhELFFBQUksY0FBYztBQUNsQixVQUFNLG9CQUFvQixNQUFNO0FBQy9CLGtCQUFZLE9BQU8sY0FBYyxRQUFRLGVBQWUsUUFBUTtBQUNoRSwwQkFBb0IsVUFBVSxPQUFPLGFBQWEsV0FBVztBQUFBLElBQzlEO0FBQ0Esc0JBQWtCO0FBRWxCLFVBQU0sbUJBQW1CLE1BQU07QUFDOUIsb0JBQWMsQ0FBQztBQUNmLHdCQUFrQjtBQUFBLElBQ25CO0FBRUEsU0FBSyxVQUFVLFlBQVksV0FBVyxnQkFBZ0IsQ0FBQztBQUN2RCxTQUFLLFVBQVUsSUFBSSxzQkFBc0IsVUFBVSxTQUFTLE9BQUs7QUFDaEUsVUFBSSxFQUFFLGtCQUFrQjtBQUN2QjtBQUFBLE1BQ0Q7QUFFQSxZQUFNLFNBQVMsRUFBRTtBQUNqQixVQUFJLE9BQU8sUUFBUSxnQkFBZ0IsR0FBRztBQUNyQztBQUFBLE1BQ0Q7QUFFQSx1QkFBaUI7QUFBQSxJQUNsQixDQUFDLENBQUM7QUFFRixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYyx3QkFBd0IsTUFBMEMsVUFBZSxlQUFpRDtBQUMvSSxVQUFNLE9BQU8sa0NBQWtDLEtBQUssZUFBZSxRQUFRO0FBQzNFLFFBQUksQ0FBQyxNQUFNO0FBQ1YsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLEtBQUssY0FBYyxXQUFXO0FBQUEsTUFDbkM7QUFBQSxNQUNBLEtBQUsscUJBQXFCLElBQUksT0FBTyxLQUFLLGtCQUFrQixJQUFJLEtBQUssY0FBYyxJQUFJLE9BQU8sS0FBSyxXQUFXLElBQUk7QUFBQSxNQUNsSCxLQUFLLHFCQUFxQixJQUFJLE9BQU8sS0FBSyxrQkFBa0IsSUFBSTtBQUFBLE1BQ2hFLEtBQUs7QUFBQSxNQUNMO0FBQUEsSUFDRCxDQUFDO0FBQ0QsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMsZUFBZSxNQUF5RDtBQUNyRixVQUFNLEtBQUssZUFBZSxlQUFlLGtDQUFrQztBQUFBLE1BQzFFLE9BQU8sU0FBUyxnQ0FBZ0MsYUFBYTtBQUFBLE1BQzdELFdBQVcsS0FBSyxjQUFjLElBQUksV0FBUztBQUFBLFFBQzFDLGFBQWEsS0FBSyxxQkFBcUIsSUFBSSxPQUFPLEtBQUssa0JBQWtCLElBQUksS0FBSyxjQUFjLElBQUksT0FBTyxLQUFLLFdBQVcsSUFBSTtBQUFBLFFBQy9ILGFBQWEsS0FBSyxxQkFBcUIsSUFBSSxPQUFPLEtBQUssa0JBQWtCLElBQUksSUFBSSxPQUFPLEtBQUssR0FBRztBQUFBLE1BQ2pHLEVBQUU7QUFBQSxJQUNILENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFVSx1QkFBNkM7QUFDdEQsVUFBTSxJQUFJLE1BQU0sVUFBVTtBQUFBLEVBQzNCO0FBQUEsRUFFVSxXQUFtQjtBQUM1QixVQUFNLFFBQVEsS0FBSyxlQUFlLE1BQU0sSUFBSTtBQUM1QyxRQUFJLE1BQU0sU0FBUyxvQkFBb0IsVUFBVSx3QkFBd0I7QUFDeEUsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFFBQVEsTUFBTSxzQkFBc0I7QUFDMUMsV0FBTyxPQUFPLFVBQVUsV0FBVyxRQUFRLE9BQU8sU0FBUztBQUFBLEVBQzVEO0FBQ0Q7QUE1UWEsdUNBQU47QUFBQSxFQVFKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FqQlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
