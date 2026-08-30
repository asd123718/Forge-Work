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
import * as dom from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { HoverStyle } from "../../../../base/browser/ui/hover/hover.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { Action } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { basename } from "../../../../base/common/path.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { localize } from "../../../../nls.js";
import { FileKind } from "../../../../platform/files/common/files.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchObjectTree } from "../../../../platform/list/browser/listService.js";
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from "../../../../workbench/browser/labels.js";
import { IAgentFeedbackService } from "./agentFeedbackService.js";
import { editorHoverBackground } from "../../../../platform/theme/common/colorRegistry.js";
const $ = dom.$;
function isFeedbackFileElement(element) {
  return element.type === "file";
}
class FeedbackTreeDelegate {
  getHeight(_element) {
    return 22;
  }
  getTemplateId(element) {
    return isFeedbackFileElement(element) ? FeedbackFileRenderer.TEMPLATE_ID : FeedbackCommentRenderer.TEMPLATE_ID;
  }
}
const _FeedbackFileRenderer = class _FeedbackFileRenderer {
  constructor(_labels, _agentFeedbackService, _sessionResource) {
    this._labels = _labels;
    this._agentFeedbackService = _agentFeedbackService;
    this._sessionResource = _sessionResource;
    this.templateId = _FeedbackFileRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const templateDisposables = new DisposableStore();
    const label = templateDisposables.add(this._labels.create(container, { supportHighlights: true, supportIcons: true }));
    const actionBarContainer = $("div.agent-feedback-hover-action-bar");
    label.element.appendChild(actionBarContainer);
    const actionBar = templateDisposables.add(new ActionBar(actionBarContainer));
    return { label, actionBar, templateDisposables };
  }
  renderElement(node, _index, templateData) {
    const element = node.element;
    templateData.label.element.style.display = "flex";
    const name = basename(element.uri.path);
    templateData.label.setResource(
      { resource: element.uri, name },
      { fileKind: FileKind.FILE }
    );
    templateData.actionBar.clear();
    if (this._agentFeedbackService) {
      const service = this._agentFeedbackService;
      const sessionResource = this._sessionResource;
      templateData.actionBar.push(new Action(
        "agentFeedback.removeFileComments",
        localize("agentFeedbackHover.removeAll", "Remove All"),
        ThemeIcon.asClassName(Codicon.close),
        true,
        () => {
          for (const item of element.items) {
            service.removeFeedback(sessionResource, item.id);
          }
        }
      ), { icon: true, label: false });
    }
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
_FeedbackFileRenderer.TEMPLATE_ID = "feedbackFile";
let FeedbackFileRenderer = _FeedbackFileRenderer;
const _FeedbackCommentRenderer = class _FeedbackCommentRenderer {
  constructor(_agentFeedbackService, _sessionResource, _hoverService, _languageService) {
    this._agentFeedbackService = _agentFeedbackService;
    this._sessionResource = _sessionResource;
    this._hoverService = _hoverService;
    this._languageService = _languageService;
    this.templateId = _FeedbackCommentRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const templateDisposables = new DisposableStore();
    const row = dom.append(container, $("div.agent-feedback-hover-comment-row"));
    const textElement = dom.append(row, $("div.agent-feedback-hover-comment-text"));
    const actionBarContainer = dom.append(row, $("div.agent-feedback-hover-action-bar"));
    const actionBar = templateDisposables.add(new ActionBar(actionBarContainer));
    const hoverDisposable = templateDisposables.add(new MutableDisposable());
    const templateData = { textElement, row, actionBar, templateDisposables, hoverDisposable, element: void 0 };
    if (this._agentFeedbackService) {
      const service = this._agentFeedbackService;
      const sessionResource = this._sessionResource;
      templateDisposables.add(dom.addDisposableListener(row, dom.EventType.CLICK, (e) => {
        const data = templateData.element;
        if (data) {
          e.preventDefault();
          e.stopPropagation();
          service.revealFeedback(sessionResource, data.id);
        }
      }));
    }
    return templateData;
  }
  renderElement(node, _index, templateData) {
    const element = node.element;
    templateData.textElement.textContent = element.text;
    templateData.element = element;
    if (!this._agentFeedbackService) {
      templateData.hoverDisposable.value = this._hoverService.setupDelayedHover(
        templateData.row,
        () => this._buildCommentHover(element),
        { groupId: "agent-feedback-comment" }
      );
    }
    templateData.actionBar.clear();
    if (this._agentFeedbackService) {
      const service = this._agentFeedbackService;
      const sessionResource = this._sessionResource;
      templateData.actionBar.push(new Action(
        "agentFeedback.removeComment",
        localize("agentFeedbackHover.remove", "Remove"),
        ThemeIcon.asClassName(Codicon.close),
        true,
        () => {
          service.removeFeedback(sessionResource, element.id);
        }
      ), { icon: true, label: false });
    }
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
  _buildCommentHover(element) {
    const markdown = new MarkdownString("", { isTrusted: true, supportThemeIcons: true });
    markdown.appendText(element.text);
    if (element.codeSelection) {
      const languageId = this._languageService.guessLanguageIdByFilepathOrFirstLine(element.resourceUri);
      markdown.appendMarkdown("\n\n");
      markdown.appendCodeblock(languageId ?? "", element.codeSelection);
    }
    if (element.diffHunks) {
      markdown.appendMarkdown("\n\n");
      markdown.appendCodeblock("diff", element.diffHunks);
    }
    return {
      content: markdown,
      style: HoverStyle.Pointer,
      position: {
        hoverPosition: HoverPosition.RIGHT
      }
    };
  }
};
_FeedbackCommentRenderer.TEMPLATE_ID = "feedbackComment";
let FeedbackCommentRenderer = _FeedbackCommentRenderer;
let AgentFeedbackHover = class extends Disposable {
  constructor(_element, _attachment, _canDelete, _hoverService, _instantiationService, _agentFeedbackService, _languageService) {
    super();
    this._element = _element;
    this._attachment = _attachment;
    this._canDelete = _canDelete;
    this._hoverService = _hoverService;
    this._instantiationService = _instantiationService;
    this._agentFeedbackService = _agentFeedbackService;
    this._languageService = _languageService;
    this._store.add(this._hoverService.setupDelayedHover(
      this._element,
      () => this._store.add(this._buildHoverContent()),
      { groupId: "chat-attachments" }
    ));
    this._store.add(dom.addDisposableListener(this._element, dom.EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showHoverNow();
    }));
  }
  _showHoverNow() {
    const opts = this._buildHoverContent();
    this._register(opts);
    this._hoverService.showInstantHover({
      ...opts,
      target: this._element
    });
  }
  _buildHoverContent() {
    const disposables = new DisposableStore();
    const hoverElement = $("div.agent-feedback-hover");
    const treeContainer = dom.append(hoverElement, $(".results.show-file-icons.file-icon-themable-tree.agent-feedback-hover-tree"));
    const resourceLabels = disposables.add(this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
    const { children, commentElements } = this._buildTreeData();
    const tree = disposables.add(this._instantiationService.createInstance(
      WorkbenchObjectTree,
      "AgentFeedbackHoverTree",
      treeContainer,
      new FeedbackTreeDelegate(),
      [
        new FeedbackFileRenderer(resourceLabels, this._canDelete ? this._agentFeedbackService : void 0, this._attachment.sessionResource),
        new FeedbackCommentRenderer(this._canDelete ? this._agentFeedbackService : void 0, this._attachment.sessionResource, this._hoverService, this._languageService)
      ],
      {
        defaultIndent: 0,
        alwaysConsumeMouseWheel: false,
        accessibilityProvider: {
          getAriaLabel: (element) => {
            if (isFeedbackFileElement(element)) {
              return basename(element.uri.path);
            }
            return element.text;
          },
          getWidgetAriaLabel: () => localize("agentFeedbackHover.tree", "Feedback Comments")
        },
        identityProvider: {
          getId: (element) => {
            if (isFeedbackFileElement(element)) {
              return `file:${element.uri.toString()}`;
            }
            return `comment:${element.id}`;
          }
        },
        overrideStyles: {
          listFocusBackground: void 0,
          listInactiveFocusBackground: void 0,
          listActiveSelectionBackground: void 0,
          listFocusAndSelectionBackground: void 0,
          listInactiveSelectionBackground: void 0,
          listBackground: editorHoverBackground,
          listFocusForeground: void 0,
          treeStickyScrollBackground: editorHoverBackground
        }
      }
    ));
    tree.setChildren(null, children);
    const ROW_HEIGHT = 22;
    const MAX_ROWS = 8;
    const totalRows = commentElements.length + children.length;
    const treeHeight = Math.min(totalRows * ROW_HEIGHT, MAX_ROWS * ROW_HEIGHT);
    tree.layout(treeHeight, 200);
    treeContainer.style.height = `${treeHeight}px`;
    return {
      content: hoverElement,
      style: HoverStyle.Pointer,
      persistence: { hideOnHover: false },
      position: { hoverPosition: HoverPosition.ABOVE },
      trapFocus: true,
      appearance: { compact: true },
      additionalClasses: ["agent-feedback-hover-container"],
      dispose: () => disposables.dispose()
    };
  }
  _buildTreeData() {
    const byFile = /* @__PURE__ */ new Map();
    for (const item of this._attachment.feedbackItems) {
      const key = item.resourceUri.toString();
      let group = byFile.get(key);
      if (!group) {
        group = { uri: item.resourceUri, comments: [] };
        byFile.set(key, group);
      }
      group.comments.push({
        type: "comment",
        id: item.id,
        text: item.text,
        resourceUri: item.resourceUri,
        codeSelection: item.codeSelection,
        diffHunks: item.diffHunks
      });
    }
    const children = [];
    const allComments = [];
    for (const [, group] of byFile) {
      const fileElement = {
        type: "file",
        uri: group.uri,
        items: group.comments
      };
      allComments.push(...group.comments);
      children.push({
        element: fileElement,
        collapsible: true,
        collapsed: false,
        children: group.comments.map((comment) => ({
          element: comment,
          collapsible: false
        }))
      });
    }
    return { children, commentElements: allComments };
  }
};
AgentFeedbackHover = __decorateClass([
  __decorateParam(3, IHoverService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IAgentFeedbackService),
  __decorateParam(6, ILanguageService)
], AgentFeedbackHover);
export {
  AgentFeedbackHover
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYWdlbnRGZWVkYmFja1xcYnJvd3NlclxcYWdlbnRGZWVkYmFja0hvdmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSG92ZXJTdHlsZSwgSURlbGF5ZWRIb3Zlck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSG92ZXJQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSU9iamVjdFRyZWVFbGVtZW50LCBJVHJlZU5vZGUsIElUcmVlUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEZpbGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoT2JqZWN0VHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0xBQkVMU19DT05UQUlORVIsIElSZXNvdXJjZUxhYmVsLCBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRGZWVkYmFja1NlcnZpY2UgfSBmcm9tICcuL2FnZW50RmVlZGJhY2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEZlZWRiYWNrVmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgZWRpdG9ySG92ZXJCYWNrZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbi8vIC0tLSBUcmVlIEVsZW1lbnQgVHlwZXMgLS0tXG5cbmludGVyZmFjZSBJRmVlZGJhY2tGaWxlRWxlbWVudCB7XG5cdHJlYWRvbmx5IHR5cGU6ICdmaWxlJztcblx0cmVhZG9ubHkgdXJpOiBVUkk7XG5cdHJlYWRvbmx5IGl0ZW1zOiBSZWFkb25seUFycmF5PElGZWVkYmFja0NvbW1lbnRFbGVtZW50Pjtcbn1cblxuaW50ZXJmYWNlIElGZWVkYmFja0NvbW1lbnRFbGVtZW50IHtcblx0cmVhZG9ubHkgdHlwZTogJ2NvbW1lbnQnO1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSB0ZXh0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlc291cmNlVXJpOiBVUkk7XG5cdHJlYWRvbmx5IGNvZGVTZWxlY3Rpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRpZmZIdW5rcz86IHN0cmluZztcbn1cblxudHlwZSBGZWVkYmFja1RyZWVFbGVtZW50ID0gSUZlZWRiYWNrRmlsZUVsZW1lbnQgfCBJRmVlZGJhY2tDb21tZW50RWxlbWVudDtcblxuZnVuY3Rpb24gaXNGZWVkYmFja0ZpbGVFbGVtZW50KGVsZW1lbnQ6IEZlZWRiYWNrVHJlZUVsZW1lbnQpOiBlbGVtZW50IGlzIElGZWVkYmFja0ZpbGVFbGVtZW50IHtcblx0cmV0dXJuIGVsZW1lbnQudHlwZSA9PT0gJ2ZpbGUnO1xufVxuXG4vLyAtLS0gVHJlZSBEZWxlZ2F0ZSAtLS1cblxuY2xhc3MgRmVlZGJhY2tUcmVlRGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxGZWVkYmFja1RyZWVFbGVtZW50PiB7XG5cdGdldEhlaWdodChfZWxlbWVudDogRmVlZGJhY2tUcmVlRWxlbWVudCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDIyO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBGZWVkYmFja1RyZWVFbGVtZW50KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gaXNGZWVkYmFja0ZpbGVFbGVtZW50KGVsZW1lbnQpXG5cdFx0XHQ/IEZlZWRiYWNrRmlsZVJlbmRlcmVyLlRFTVBMQVRFX0lEXG5cdFx0XHQ6IEZlZWRiYWNrQ29tbWVudFJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHR9XG59XG5cbi8vIC0tLSBGaWxlIFJlbmRlcmVyIC0tLVxuXG5pbnRlcmZhY2UgSUZlZWRiYWNrRmlsZVRlbXBsYXRlIHtcblx0cmVhZG9ubHkgbGFiZWw6IElSZXNvdXJjZUxhYmVsO1xuXHRyZWFkb25seSBhY3Rpb25CYXI6IEFjdGlvbkJhcjtcblx0cmVhZG9ubHkgdGVtcGxhdGVEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5jbGFzcyBGZWVkYmFja0ZpbGVSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8SUZlZWRiYWNrRmlsZUVsZW1lbnQsIHZvaWQsIElGZWVkYmFja0ZpbGVUZW1wbGF0ZT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnZmVlZGJhY2tGaWxlJztcblx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9IEZlZWRiYWNrRmlsZVJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYWdlbnRGZWVkYmFja1NlcnZpY2U6IElBZ2VudEZlZWRiYWNrU2VydmljZSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUZlZWRiYWNrRmlsZVRlbXBsYXRlIHtcblx0XHRjb25zdCB0ZW1wbGF0ZURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgbGFiZWwgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZCh0aGlzLl9sYWJlbHMuY3JlYXRlKGNvbnRhaW5lciwgeyBzdXBwb3J0SGlnaGxpZ2h0czogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblxuXHRcdGNvbnN0IGFjdGlvbkJhckNvbnRhaW5lciA9ICQoJ2Rpdi5hZ2VudC1mZWVkYmFjay1ob3Zlci1hY3Rpb24tYmFyJyk7XG5cdFx0bGFiZWwuZWxlbWVudC5hcHBlbmRDaGlsZChhY3Rpb25CYXJDb250YWluZXIpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb25CYXIoYWN0aW9uQmFyQ29udGFpbmVyKSk7XG5cblx0XHRyZXR1cm4geyBsYWJlbCwgYWN0aW9uQmFyLCB0ZW1wbGF0ZURpc3Bvc2FibGVzIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxJRmVlZGJhY2tGaWxlRWxlbWVudCwgdm9pZD4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElGZWVkYmFja0ZpbGVUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBub2RlLmVsZW1lbnQ7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcblxuXHRcdGNvbnN0IG5hbWUgPSBiYXNlbmFtZShlbGVtZW50LnVyaS5wYXRoKTtcblxuXG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldFJlc291cmNlKFxuXHRcdFx0eyByZXNvdXJjZTogZWxlbWVudC51cmksIG5hbWUgfSxcblx0XHRcdHsgZmlsZUtpbmQ6IEZpbGVLaW5kLkZJTEUgfSxcblx0XHQpO1xuXG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5jbGVhcigpO1xuXHRcdGlmICh0aGlzLl9hZ2VudEZlZWRiYWNrU2VydmljZSkge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IHRoaXMuX2FnZW50RmVlZGJhY2tTZXJ2aWNlO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5fc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5wdXNoKG5ldyBBY3Rpb24oXG5cdFx0XHRcdCdhZ2VudEZlZWRiYWNrLnJlbW92ZUZpbGVDb21tZW50cycsXG5cdFx0XHRcdGxvY2FsaXplKCdhZ2VudEZlZWRiYWNrSG92ZXIucmVtb3ZlQWxsJywgXCJSZW1vdmUgQWxsXCIpLFxuXHRcdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jbG9zZSksXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdCgpID0+IHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgZWxlbWVudC5pdGVtcykge1xuXHRcdFx0XHRcdFx0c2VydmljZS5yZW1vdmVGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2UsIGl0ZW0uaWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0KSwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUZlZWRiYWNrRmlsZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8vIC0tLSBDb21tZW50IFJlbmRlcmVyIC0tLVxuXG5pbnRlcmZhY2UgSUZlZWRiYWNrQ29tbWVudFRlbXBsYXRlIHtcblx0cmVhZG9ubHkgdGV4dEVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSByb3c6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBhY3Rpb25CYXI6IEFjdGlvbkJhcjtcblx0cmVhZG9ubHkgdGVtcGxhdGVEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZWFkb25seSBob3ZlckRpc3Bvc2FibGU6IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPjtcblx0ZWxlbWVudDogSUZlZWRiYWNrQ29tbWVudEVsZW1lbnQgfCB1bmRlZmluZWQ7XG59XG5cbmNsYXNzIEZlZWRiYWNrQ29tbWVudFJlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxJRmVlZGJhY2tDb21tZW50RWxlbWVudCwgdm9pZCwgSUZlZWRiYWNrQ29tbWVudFRlbXBsYXRlPiB7XG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdmZWVkYmFja0NvbW1lbnQnO1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gRmVlZGJhY2tDb21tZW50UmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYWdlbnRGZWVkYmFja1NlcnZpY2U6IElBZ2VudEZlZWRiYWNrU2VydmljZSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRmVlZGJhY2tDb21tZW50VGVtcGxhdGUge1xuXHRcdGNvbnN0IHRlbXBsYXRlRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCByb3cgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnZGl2LmFnZW50LWZlZWRiYWNrLWhvdmVyLWNvbW1lbnQtcm93JykpO1xuXG5cdFx0Y29uc3QgdGV4dEVsZW1lbnQgPSBkb20uYXBwZW5kKHJvdywgJCgnZGl2LmFnZW50LWZlZWRiYWNrLWhvdmVyLWNvbW1lbnQtdGV4dCcpKTtcblxuXHRcdGNvbnN0IGFjdGlvbkJhckNvbnRhaW5lciA9IGRvbS5hcHBlbmQocm93LCAkKCdkaXYuYWdlbnQtZmVlZGJhY2staG92ZXItYWN0aW9uLWJhcicpKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uQmFyKGFjdGlvbkJhckNvbnRhaW5lcikpO1xuXG5cdFx0Y29uc3QgaG92ZXJEaXNwb3NhYmxlID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdFx0Y29uc3QgdGVtcGxhdGVEYXRhOiBJRmVlZGJhY2tDb21tZW50VGVtcGxhdGUgPSB7IHRleHRFbGVtZW50LCByb3csIGFjdGlvbkJhciwgdGVtcGxhdGVEaXNwb3NhYmxlcywgaG92ZXJEaXNwb3NhYmxlLCBlbGVtZW50OiB1bmRlZmluZWQgfTtcblxuXHRcdGlmICh0aGlzLl9hZ2VudEZlZWRiYWNrU2VydmljZSkge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IHRoaXMuX2FnZW50RmVlZGJhY2tTZXJ2aWNlO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5fc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihyb3csIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIChlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSB0ZW1wbGF0ZURhdGEuZWxlbWVudDtcblx0XHRcdFx0aWYgKGRhdGEpIHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHRzZXJ2aWNlLnJldmVhbEZlZWRiYWNrKHNlc3Npb25SZXNvdXJjZSwgZGF0YS5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGVtcGxhdGVEYXRhO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SUZlZWRiYWNrQ29tbWVudEVsZW1lbnQsIHZvaWQ+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRmVlZGJhY2tDb21tZW50VGVtcGxhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBlbGVtZW50ID0gbm9kZS5lbGVtZW50O1xuXG5cdFx0dGVtcGxhdGVEYXRhLnRleHRFbGVtZW50LnRleHRDb250ZW50ID0gZWxlbWVudC50ZXh0O1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50ID0gZWxlbWVudDtcblxuXHRcdC8vIEluIHJlYWQtb25seSBtb2RlLCBzZXQgdXAgYSByaWNoIG1hcmtkb3duIGhvdmVyIHdpdGggY29tbWVudCArIGNvZGUgc25pcHBldFxuXHRcdGlmICghdGhpcy5fYWdlbnRGZWVkYmFja1NlcnZpY2UpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5ob3ZlckRpc3Bvc2FibGUudmFsdWUgPSB0aGlzLl9ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIoXG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5yb3csXG5cdFx0XHRcdCgpID0+IHRoaXMuX2J1aWxkQ29tbWVudEhvdmVyKGVsZW1lbnQpLFxuXHRcdFx0XHR7IGdyb3VwSWQ6ICdhZ2VudC1mZWVkYmFjay1jb21tZW50JyB9XG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuY2xlYXIoKTtcblx0XHRpZiAodGhpcy5fYWdlbnRGZWVkYmFja1NlcnZpY2UpIHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSB0aGlzLl9hZ2VudEZlZWRiYWNrU2VydmljZTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuX3Nlc3Npb25SZXNvdXJjZTtcblx0XHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIucHVzaChuZXcgQWN0aW9uKFxuXHRcdFx0XHQnYWdlbnRGZWVkYmFjay5yZW1vdmVDb21tZW50Jyxcblx0XHRcdFx0bG9jYWxpemUoJ2FnZW50RmVlZGJhY2tIb3Zlci5yZW1vdmUnLCBcIlJlbW92ZVwiKSxcblx0XHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY2xvc2UpLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHQoKSA9PiB7XG5cdFx0XHRcdFx0c2VydmljZS5yZW1vdmVGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2UsIGVsZW1lbnQuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHQpLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJRmVlZGJhY2tDb21tZW50VGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9idWlsZENvbW1lbnRIb3ZlcihlbGVtZW50OiBJRmVlZGJhY2tDb21tZW50RWxlbWVudCk6IElEZWxheWVkSG92ZXJPcHRpb25zIHtcblx0XHRjb25zdCBtYXJrZG93biA9IG5ldyBNYXJrZG93blN0cmluZygnJywgeyBpc1RydXN0ZWQ6IHRydWUsIHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRcdG1hcmtkb3duLmFwcGVuZFRleHQoZWxlbWVudC50ZXh0KTtcblxuXHRcdGlmIChlbGVtZW50LmNvZGVTZWxlY3Rpb24pIHtcblx0XHRcdGNvbnN0IGxhbmd1YWdlSWQgPSB0aGlzLl9sYW5ndWFnZVNlcnZpY2UuZ3Vlc3NMYW5ndWFnZUlkQnlGaWxlcGF0aE9yRmlyc3RMaW5lKGVsZW1lbnQucmVzb3VyY2VVcmkpO1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oJ1xcblxcbicpO1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kQ29kZWJsb2NrKGxhbmd1YWdlSWQgPz8gJycsIGVsZW1lbnQuY29kZVNlbGVjdGlvbik7XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQuZGlmZkh1bmtzKSB7XG5cdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bignXFxuXFxuJyk7XG5cdFx0XHRtYXJrZG93bi5hcHBlbmRDb2RlYmxvY2soJ2RpZmYnLCBlbGVtZW50LmRpZmZIdW5rcyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQ6IG1hcmtkb3duLFxuXHRcdFx0c3R5bGU6IEhvdmVyU3R5bGUuUG9pbnRlcixcblx0XHRcdHBvc2l0aW9uOiB7XG5cdFx0XHRcdGhvdmVyUG9zaXRpb246IEhvdmVyUG9zaXRpb24uUklHSFQsXG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cbn1cblxuLy8gLS0tIEhvdmVyIC0tLVxuXG4vKipcbiAqIENyZWF0ZXMgdGhlIGN1c3RvbSBob3ZlciBjb250ZW50IGZvciB0aGUgXCJOIGNvbW1lbnRzXCIgYXR0YWNobWVudC5cbiAqIFVzZXMgYSBXb3JrYmVuY2hPYmplY3RUcmVlIHRvIHJlbmRlciBmaWxlcyBhcyBwYXJlbnQgbm9kZXMgYW5kIGNvbW1lbnRzIGFzIGNoaWxkcmVuLFxuICogd2l0aCBwZXItcm93IGFjdGlvbiBiYXJzIGZvciByZW1vdmFsLlxuICovXG5leHBvcnQgY2xhc3MgQWdlbnRGZWVkYmFja0hvdmVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWxlbWVudDogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYXR0YWNobWVudDogSUFnZW50RmVlZGJhY2tWYXJpYWJsZUVudHJ5LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NhbkRlbGV0ZTogYm9vbGVhbixcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWdlbnRGZWVkYmFja1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRGZWVkYmFja1NlcnZpY2U6IElBZ2VudEZlZWRiYWNrU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBTaG93IG9uIGhvdmVyIChkZWxheWVkKVxuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIoXG5cdFx0XHR0aGlzLl9lbGVtZW50LFxuXHRcdFx0KCkgPT4gdGhpcy5fc3RvcmUuYWRkKHRoaXMuX2J1aWxkSG92ZXJDb250ZW50KCkpLFxuXHRcdFx0eyBncm91cElkOiAnY2hhdC1hdHRhY2htZW50cycgfVxuXHRcdCkpO1xuXG5cdFx0Ly8gU2hvdyBpbW1lZGlhdGVseSBvbiBjbGlja1xuXHRcdHRoaXMuX3N0b3JlLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2VsZW1lbnQsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIChlKSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5fc2hvd0hvdmVyTm93KCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0hvdmVyTm93KCk6IHZvaWQge1xuXHRcdGNvbnN0IG9wdHMgPSB0aGlzLl9idWlsZEhvdmVyQ29udGVudCgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG9wdHMpO1xuXHRcdHRoaXMuX2hvdmVyU2VydmljZS5zaG93SW5zdGFudEhvdmVyKHtcblx0XHRcdC4uLm9wdHMsXG5cdFx0XHR0YXJnZXQ6IHRoaXMuX2VsZW1lbnQsXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9idWlsZEhvdmVyQ29udGVudCgpOiBJRGVsYXllZEhvdmVyT3B0aW9ucyAmIElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBob3ZlckVsZW1lbnQgPSAkKCdkaXYuYWdlbnQtZmVlZGJhY2staG92ZXInKTtcblxuXHRcdC8vIFRyZWUgY29udGFpbmVyXG5cdFx0Y29uc3QgdHJlZUNvbnRhaW5lciA9IGRvbS5hcHBlbmQoaG92ZXJFbGVtZW50LCAkKCcucmVzdWx0cy5zaG93LWZpbGUtaWNvbnMuZmlsZS1pY29uLXRoZW1hYmxlLXRyZWUuYWdlbnQtZmVlZGJhY2staG92ZXItdHJlZScpKTtcblxuXHRcdC8vIFJlc291cmNlIGxhYmVscyAoc2hhcmVkIGFjcm9zcyBhbGwgZmlsZSByZW5kZXJlcnMpXG5cdFx0Y29uc3QgcmVzb3VyY2VMYWJlbHMgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbHMsIERFRkFVTFRfTEFCRUxTX0NPTlRBSU5FUikpO1xuXG5cdFx0Ly8gQnVpbGQgdHJlZSBkYXRhXG5cdFx0Y29uc3QgeyBjaGlsZHJlbiwgY29tbWVudEVsZW1lbnRzIH0gPSB0aGlzLl9idWlsZFRyZWVEYXRhKCk7XG5cblx0XHQvLyBDcmVhdGUgdHJlZVxuXHRcdGNvbnN0IHRyZWUgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hPYmplY3RUcmVlPEZlZWRiYWNrVHJlZUVsZW1lbnQ+LFxuXHRcdFx0J0FnZW50RmVlZGJhY2tIb3ZlclRyZWUnLFxuXHRcdFx0dHJlZUNvbnRhaW5lcixcblx0XHRcdG5ldyBGZWVkYmFja1RyZWVEZWxlZ2F0ZSgpLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgRmVlZGJhY2tGaWxlUmVuZGVyZXIocmVzb3VyY2VMYWJlbHMsIHRoaXMuX2NhbkRlbGV0ZSA/IHRoaXMuX2FnZW50RmVlZGJhY2tTZXJ2aWNlIDogdW5kZWZpbmVkLCB0aGlzLl9hdHRhY2htZW50LnNlc3Npb25SZXNvdXJjZSksXG5cdFx0XHRcdG5ldyBGZWVkYmFja0NvbW1lbnRSZW5kZXJlcih0aGlzLl9jYW5EZWxldGUgPyB0aGlzLl9hZ2VudEZlZWRiYWNrU2VydmljZSA6IHVuZGVmaW5lZCwgdGhpcy5fYXR0YWNobWVudC5zZXNzaW9uUmVzb3VyY2UsIHRoaXMuX2hvdmVyU2VydmljZSwgdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlKSxcblx0XHRcdF0sXG5cdFx0XHR7XG5cdFx0XHRcdGRlZmF1bHRJbmRlbnQ6IDAsXG5cdFx0XHRcdGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiBmYWxzZSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0QXJpYUxhYmVsOiAoZWxlbWVudDogRmVlZGJhY2tUcmVlRWxlbWVudCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGlzRmVlZGJhY2tGaWxlRWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gYmFzZW5hbWUoZWxlbWVudC51cmkucGF0aCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC50ZXh0O1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsOiAoKSA9PiBsb2NhbGl6ZSgnYWdlbnRGZWVkYmFja0hvdmVyLnRyZWUnLCBcIkZlZWRiYWNrIENvbW1lbnRzXCIpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpZGVudGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0SWQ6IChlbGVtZW50OiBGZWVkYmFja1RyZWVFbGVtZW50KSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoaXNGZWVkYmFja0ZpbGVFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBgZmlsZToke2VsZW1lbnQudXJpLnRvU3RyaW5nKCl9YDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBgY29tbWVudDoke2VsZW1lbnQuaWR9YDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG92ZXJyaWRlU3R5bGVzOiB7XG5cdFx0XHRcdFx0bGlzdEZvY3VzQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGxpc3RJbmFjdGl2ZUZvY3VzQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGxpc3RBY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bGlzdEZvY3VzQW5kU2VsZWN0aW9uQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRsaXN0QmFja2dyb3VuZDogZWRpdG9ySG92ZXJCYWNrZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RGb2N1c0ZvcmVncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0cmVlU3RpY2t5U2Nyb2xsQmFja2dyb3VuZDogZWRpdG9ySG92ZXJCYWNrZ3JvdW5kLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KSk7XG5cblx0XHQvLyBTZXQgdHJlZSBkYXRhXG5cdFx0dHJlZS5zZXRDaGlsZHJlbihudWxsLCBjaGlsZHJlbik7XG5cblx0XHQvLyBMYXlvdXQgdHJlZTogY2xhbXAgdG8gcmVhc29uYWJsZSBoZWlnaHRcblx0XHRjb25zdCBST1dfSEVJR0hUID0gMjI7XG5cdFx0Y29uc3QgTUFYX1JPV1MgPSA4O1xuXHRcdGNvbnN0IHRvdGFsUm93cyA9IGNvbW1lbnRFbGVtZW50cy5sZW5ndGggKyBjaGlsZHJlbi5sZW5ndGg7XG5cdFx0Y29uc3QgdHJlZUhlaWdodCA9IE1hdGgubWluKHRvdGFsUm93cyAqIFJPV19IRUlHSFQsIE1BWF9ST1dTICogUk9XX0hFSUdIVCk7XG5cdFx0dHJlZS5sYXlvdXQodHJlZUhlaWdodCwgMjAwKTtcblx0XHR0cmVlQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke3RyZWVIZWlnaHR9cHhgO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQ6IGhvdmVyRWxlbWVudCxcblx0XHRcdHN0eWxlOiBIb3ZlclN0eWxlLlBvaW50ZXIsXG5cdFx0XHRwZXJzaXN0ZW5jZTogeyBoaWRlT25Ib3ZlcjogZmFsc2UgfSxcblx0XHRcdHBvc2l0aW9uOiB7IGhvdmVyUG9zaXRpb246IEhvdmVyUG9zaXRpb24uQUJPVkUgfSxcblx0XHRcdHRyYXBGb2N1czogdHJ1ZSxcblx0XHRcdGFwcGVhcmFuY2U6IHsgY29tcGFjdDogdHJ1ZSB9LFxuXHRcdFx0YWRkaXRpb25hbENsYXNzZXM6IFsnYWdlbnQtZmVlZGJhY2staG92ZXItY29udGFpbmVyJ10sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkVHJlZURhdGEoKTogeyBjaGlsZHJlbjogSU9iamVjdFRyZWVFbGVtZW50PEZlZWRiYWNrVHJlZUVsZW1lbnQ+W107IGNvbW1lbnRFbGVtZW50czogSUZlZWRiYWNrQ29tbWVudEVsZW1lbnRbXSB9IHtcblx0XHQvLyBHcm91cCBmZWVkYmFjayBpdGVtcyBieSBmaWxlXG5cdFx0Y29uc3QgYnlGaWxlID0gbmV3IE1hcDxzdHJpbmcsIHsgdXJpOiBVUkk7IGNvbW1lbnRzOiBJRmVlZGJhY2tDb21tZW50RWxlbWVudFtdIH0+KCk7XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy5fYXR0YWNobWVudC5mZWVkYmFja0l0ZW1zKSB7XG5cdFx0XHRjb25zdCBrZXkgPSBpdGVtLnJlc291cmNlVXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRsZXQgZ3JvdXAgPSBieUZpbGUuZ2V0KGtleSk7XG5cdFx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRcdGdyb3VwID0geyB1cmk6IGl0ZW0ucmVzb3VyY2VVcmksIGNvbW1lbnRzOiBbXSB9O1xuXHRcdFx0XHRieUZpbGUuc2V0KGtleSwgZ3JvdXApO1xuXHRcdFx0fVxuXHRcdFx0Z3JvdXAuY29tbWVudHMucHVzaCh7XG5cdFx0XHRcdHR5cGU6ICdjb21tZW50Jyxcblx0XHRcdFx0aWQ6IGl0ZW0uaWQsXG5cdFx0XHRcdHRleHQ6IGl0ZW0udGV4dCxcblx0XHRcdFx0cmVzb3VyY2VVcmk6IGl0ZW0ucmVzb3VyY2VVcmksXG5cdFx0XHRcdGNvZGVTZWxlY3Rpb246IGl0ZW0uY29kZVNlbGVjdGlvbixcblx0XHRcdFx0ZGlmZkh1bmtzOiBpdGVtLmRpZmZIdW5rcyxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoaWxkcmVuOiBJT2JqZWN0VHJlZUVsZW1lbnQ8RmVlZGJhY2tUcmVlRWxlbWVudD5bXSA9IFtdO1xuXHRcdGNvbnN0IGFsbENvbW1lbnRzOiBJRmVlZGJhY2tDb21tZW50RWxlbWVudFtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IFssIGdyb3VwXSBvZiBieUZpbGUpIHtcblx0XHRcdGNvbnN0IGZpbGVFbGVtZW50OiBJRmVlZGJhY2tGaWxlRWxlbWVudCA9IHtcblx0XHRcdFx0dHlwZTogJ2ZpbGUnLFxuXHRcdFx0XHR1cmk6IGdyb3VwLnVyaSxcblx0XHRcdFx0aXRlbXM6IGdyb3VwLmNvbW1lbnRzLFxuXHRcdFx0fTtcblxuXHRcdFx0YWxsQ29tbWVudHMucHVzaCguLi5ncm91cC5jb21tZW50cyk7XG5cblx0XHRcdGNoaWxkcmVuLnB1c2goe1xuXHRcdFx0XHRlbGVtZW50OiBmaWxlRWxlbWVudCxcblx0XHRcdFx0Y29sbGFwc2libGU6IHRydWUsXG5cdFx0XHRcdGNvbGxhcHNlZDogZmFsc2UsXG5cdFx0XHRcdGNoaWxkcmVuOiBncm91cC5jb21tZW50cy5tYXAoY29tbWVudCA9PiAoe1xuXHRcdFx0XHRcdGVsZW1lbnQ6IGNvbW1lbnQsXG5cdFx0XHRcdFx0Y29sbGFwc2libGU6IGZhbHNlLFxuXHRcdFx0XHR9KSksXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBjaGlsZHJlbiwgY29tbWVudEVsZW1lbnRzOiBhbGxDb21tZW50cyB9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGtCQUF3QztBQUNqRCxTQUFTLHFCQUFxQjtBQUc5QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsWUFBWSxpQkFBOEIseUJBQXlCO0FBQzVFLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQTBDLHNCQUFzQjtBQUN6RSxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLDZCQUE2QjtBQUV0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
