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
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { basename, dirname, extUriBiasedIgnorePathCase, isEqual, relativePath } from "../../../../base/common/resources.js";
import { ResourceTree } from "../../../../base/common/resourceTree.js";
import { URI } from "../../../../base/common/uri.js";
import { MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { FileKind } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { bindContextKey } from "../../../../platform/observable/common/platformObservableUtils.js";
import { ChatContextKeys } from "../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { isIChatSessionFileChange2 } from "../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { ModifiedFileEntryState } from "../../../../workbench/contrib/chat/common/editing/chatEditingService.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { GITHUB_REMOTE_FILE_SCHEME } from "../../../services/sessions/common/session.js";
import { ActiveSessionContextKeys, ChangesContextKeys, ChangesViewMode } from "../common/changes.js";
import { IChangesViewService } from "../common/changesViewService.js";
const $ = dom.$;
function getChangesFileUri(change) {
  return isIChatSessionFileChange2(change) ? change.uri : change.modifiedUri;
}
function isChangesFileResource(change, resource) {
  return isEqual(change.originalUri, resource) || isEqual(change.modifiedUri, resource) || isEqual(getChangesFileUri(change), resource);
}
function toIChangesFileItem(changes) {
  return changes.map((change) => {
    const isAddition = change.originalUri === void 0;
    const isDeletion = change.modifiedUri === void 0;
    const uri = getChangesFileUri(change);
    return {
      type: "file",
      uri,
      originalUri: change.originalUri,
      isDeletion,
      state: ModifiedFileEntryState.Accepted,
      changeType: isAddition ? "added" : isDeletion ? "deleted" : "modified",
      linesAdded: change.insertions,
      linesRemoved: change.deletions
    };
  });
}
function isChangesFileItem(element) {
  return !ResourceTree.isResourceNode(element) && element.type === "file";
}
function isChangesRootItem(element) {
  return !ResourceTree.isResourceNode(element) && element.type === "root";
}
function buildTreeChildren(items, treeRootInfo) {
  if (items.length === 0) {
    return [];
  }
  let rootUri = treeRootInfo?.resourceTreeRootUri ?? URI.file("/");
  if (!treeRootInfo && items[0].uri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
    const parts = items[0].uri.path.split("/").filter(Boolean);
    if (parts.length >= 3) {
      rootUri = items[0].uri.with({ path: "/" + parts.slice(0, 3).join("/") });
    }
  }
  const resourceTree = new ResourceTree(void 0, rootUri, extUriBiasedIgnorePathCase);
  for (const item of items) {
    resourceTree.add(item.uri, item);
  }
  function convertChildren(parent) {
    const result = [];
    for (const child of parent.children) {
      if (child.element && child.childrenCount === 0) {
        result.push({
          element: child.element,
          collapsible: false,
          incompressible: true
        });
      } else {
        result.push({
          element: child,
          children: convertChildren(child),
          incompressible: parent === resourceTree.root,
          collapsible: true,
          collapsed: false
        });
      }
    }
    return result;
  }
  const children = convertChildren(resourceTree.root);
  if (!treeRootInfo) {
    return children;
  }
  return [{
    element: treeRootInfo.root,
    children,
    collapsible: true,
    collapsed: false,
    incompressible: true
  }];
}
let ChangesTreeRenderer = class {
  constructor(labels, actionRunner, getRootUri, instantiationService, changesViewService, contextKeyService, labelService, sessionsService) {
    this.labels = labels;
    this.actionRunner = actionRunner;
    this.getRootUri = getRootUri;
    this.instantiationService = instantiationService;
    this.changesViewService = changesViewService;
    this.contextKeyService = contextKeyService;
    this.labelService = labelService;
    this.sessionsService = sessionsService;
    this.templateId = ChangesTreeRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const templateDisposables = new DisposableStore();
    const label = templateDisposables.add(this.labels.create(container, { supportHighlights: true, supportIcons: true }));
    const reviewCommentsBadge = dom.$(".changes-review-comments-badge");
    label.element.appendChild(reviewCommentsBadge);
    const agentFeedbackBadge = dom.$(".changes-agent-feedback-badge");
    label.element.appendChild(agentFeedbackBadge);
    const lineCountsContainer = $(".working-set-line-counts");
    const addedSpan = dom.$(".working-set-lines-added");
    const removedSpan = dom.$(".working-set-lines-removed");
    lineCountsContainer.appendChild(addedSpan);
    lineCountsContainer.appendChild(removedSpan);
    label.element.appendChild(lineCountsContainer);
    const actionBarContainer = $(".chat-collapsible-list-action-bar");
    const contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(actionBarContainer));
    const scopedInstantiationService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
    const toolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.AgentsChangeInlineToolbar, {
      menuOptions: { shouldForwardArgs: true, arg: void 0 },
      actionRunner: this.actionRunner
    }));
    label.element.appendChild(actionBarContainer);
    templateDisposables.add(bindContextKey(ChatContextKeys.agentSessionType, contextKeyService, (reader) => {
      const activeSession = this.sessionsService.activeSession.read(reader);
      return activeSession?.sessionType ?? "";
    }));
    templateDisposables.add(bindContextKey(ActiveSessionContextKeys.HasGitRepository, contextKeyService, (reader) => {
      return this.changesViewService.activeSessionHasGitRepositoryObs.read(reader);
    }));
    templateDisposables.add(bindContextKey(ChangesContextKeys.VersionMode, contextKeyService, (reader) => {
      return this.changesViewService.activeSessionChangesetObs.read(reader)?.id ?? "";
    }));
    const changeKindContextKey = ChangesContextKeys.ChangeKind.bindTo(contextKeyService);
    const decorationBadge = dom.$(".changes-decoration-badge");
    label.element.appendChild(decorationBadge);
    return { label, toolbar, changeKindContextKey, reviewCommentsBadge, agentFeedbackBadge, decorationBadge, addedSpan, removedSpan, lineCountsContainer, elementDisposables: new DisposableStore(), templateDisposables };
  }
  renderElement(node, _index, templateData) {
    const element = node.element;
    templateData.label.element.style.display = "flex";
    if (isChangesRootItem(element)) {
      this.renderRootElement(element, templateData);
    } else if (ResourceTree.isResourceNode(element)) {
      this.renderFolderElement(element, templateData);
    } else {
      this.renderFileElement(element, templateData);
    }
  }
  renderCompressedElements(node, _index, templateData) {
    const compressed = node.element;
    const folder = compressed.elements[compressed.elements.length - 1];
    templateData.label.element.style.display = "flex";
    const label = compressed.elements.map((e) => e.name);
    templateData.label.setResource({ resource: folder.uri, name: label }, {
      fileKind: FileKind.FOLDER,
      separator: this.labelService.getSeparator(folder.uri.scheme)
    });
    templateData.reviewCommentsBadge.style.display = "none";
    templateData.agentFeedbackBadge.style.display = "none";
    templateData.decorationBadge.style.display = "none";
    templateData.lineCountsContainer.style.display = "none";
    if (templateData.toolbar) {
      templateData.toolbar.context = folder;
    }
    templateData.changeKindContextKey.set("folder");
  }
  renderFileElement(data, templateData) {
    const root = this.getRootUri();
    const viewMode = this.changesViewService.viewModeObs.get();
    templateData.label.setResource({
      resource: data.uri,
      name: basename(data.uri),
      description: viewMode === ChangesViewMode.List ? root ? relativePath(root, dirname(data.uri)) : void 0 : void 0
    }, {
      fileKind: FileKind.FILE,
      fileDecorations: void 0,
      strikethrough: data.changeType === "deleted"
    });
    const showChangeDecorations = data.changeType !== "none";
    templateData.lineCountsContainer.style.display = showChangeDecorations ? "" : "none";
    templateData.decorationBadge.style.display = showChangeDecorations ? "" : "none";
    templateData.elementDisposables.add(autorun((reader) => {
      const reviewCommentByFile = this.changesViewService.activeSessionReviewCommentCountByFileObs.read(reader);
      const reviewCommentCount = reviewCommentByFile?.get(data.uri.fsPath) ?? 0;
      if (reviewCommentCount > 0) {
        templateData.reviewCommentsBadge.style.display = "";
        templateData.reviewCommentsBadge.className = "changes-review-comments-badge";
        templateData.reviewCommentsBadge.replaceChildren(
          dom.$(".codicon.codicon-comment-unresolved"),
          dom.$("span", void 0, `${reviewCommentCount}`)
        );
      } else {
        templateData.reviewCommentsBadge.style.display = "none";
        templateData.reviewCommentsBadge.replaceChildren();
      }
    }));
    templateData.elementDisposables.add(autorun((reader) => {
      const agentFeedbackByFile = this.changesViewService.activeSessionAgentFeedbackCountByFileObs.read(reader);
      const agentFeedbackCount = agentFeedbackByFile?.get(data.uri.fsPath) ?? 0;
      if (agentFeedbackCount > 0) {
        templateData.agentFeedbackBadge.style.display = "";
        templateData.agentFeedbackBadge.className = "changes-agent-feedback-badge";
        templateData.agentFeedbackBadge.replaceChildren(
          dom.$(".codicon.codicon-comment"),
          dom.$("span", void 0, `${agentFeedbackCount}`)
        );
      } else {
        templateData.agentFeedbackBadge.style.display = "none";
        templateData.agentFeedbackBadge.replaceChildren();
      }
    }));
    const badge = templateData.decorationBadge;
    badge.className = "changes-decoration-badge";
    if (showChangeDecorations) {
      switch (data.changeType) {
        case "added":
          badge.textContent = "A";
          badge.classList.add("added");
          break;
        case "deleted":
          badge.textContent = "D";
          badge.classList.add("deleted");
          break;
        case "modified":
        default:
          badge.textContent = "M";
          badge.classList.add("modified");
          break;
      }
      templateData.addedSpan.textContent = `+${data.linesAdded}`;
      templateData.removedSpan.textContent = `-${data.linesRemoved}`;
      templateData.label.element.querySelector(".monaco-icon-name-container")?.classList.add("modified");
    } else {
      badge.textContent = "";
      templateData.label.element.querySelector(".monaco-icon-name-container")?.classList.remove("modified");
    }
    templateData.toolbar.context = data;
    templateData.changeKindContextKey.set("file");
  }
  renderRootElement(data, templateData) {
    templateData.label.setResource({
      resource: data.uri,
      name: data.name
    }, {
      fileKind: FileKind.ROOT_FOLDER,
      separator: this.labelService.getSeparator(data.uri.scheme, data.uri.authority)
    });
    templateData.reviewCommentsBadge.style.display = "none";
    templateData.agentFeedbackBadge.style.display = "none";
    templateData.decorationBadge.style.display = "none";
    templateData.lineCountsContainer.style.display = "none";
    templateData.toolbar.context = data.uri;
    templateData.changeKindContextKey.set("root");
  }
  renderFolderElement(node, templateData) {
    templateData.label.setFile(node.uri, {
      fileKind: FileKind.FOLDER,
      hidePath: true
    });
    templateData.reviewCommentsBadge.style.display = "none";
    templateData.agentFeedbackBadge.style.display = "none";
    templateData.decorationBadge.style.display = "none";
    templateData.lineCountsContainer.style.display = "none";
    templateData.toolbar.context = node;
    templateData.changeKindContextKey.set("folder");
  }
  disposeElement(_element, _index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeCompressedElements(_element, _index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.templateDisposables.dispose();
  }
};
ChangesTreeRenderer.TEMPLATE_ID = "changesTreeRenderer";
ChangesTreeRenderer = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IChangesViewService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, ILabelService),
  __decorateParam(7, ISessionsService)
], ChangesTreeRenderer);
export {
  ChangesTreeRenderer,
  buildTreeChildren,
  isChangesFileItem,
  isChangesFileResource,
  isChangesRootItem,
  toIChangesFileItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhbmdlc1xcYnJvd3NlclxcY2hhbmdlc1ZpZXdSZW5kZXJlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElDb21wcmVzc2VkVHJlZUVsZW1lbnQsIElDb21wcmVzc2VkVHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9jb21wcmVzc2VkT2JqZWN0VHJlZU1vZGVsLmpzJztcbmltcG9ydCB7IElDb21wcmVzc2libGVUcmVlUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9vYmplY3RUcmVlLmpzJztcbmltcG9ydCB7IElUcmVlTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgQWN0aW9uUnVubmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUsIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLCBpc0VxdWFsLCByZWxhdGl2ZVBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSVJlc291cmNlTm9kZSwgUmVzb3VyY2VUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VUcmVlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgRmlsZUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgYmluZENvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9wbGF0Zm9ybU9ic2VydmFibGVVdGlscy5qcyc7XG5pbXBvcnQgeyBJUmVzb3VyY2VMYWJlbCwgUmVzb3VyY2VMYWJlbHMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9sYWJlbHMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgaXNJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlMiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBHSVRIVUJfUkVNT1RFX0ZJTEVfU0NIRU1FLCBJU2Vzc2lvbkZpbGVDaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBBY3RpdmVTZXNzaW9uQ29udGV4dEtleXMsIENoYW5nZXNDb250ZXh0S2V5cywgQ2hhbmdlc1ZpZXdNb2RlIH0gZnJvbSAnLi4vY29tbW9uL2NoYW5nZXMuanMnO1xuaW1wb3J0IHsgSUNoYW5nZXNWaWV3U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9jaGFuZ2VzVmlld1NlcnZpY2UuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbmZ1bmN0aW9uIGdldENoYW5nZXNGaWxlVXJpKGNoYW5nZTogSVNlc3Npb25GaWxlQ2hhbmdlKTogVVJJIHtcblx0cmV0dXJuIGlzSUNoYXRTZXNzaW9uRmlsZUNoYW5nZTIoY2hhbmdlKSA/IGNoYW5nZS51cmkgOiBjaGFuZ2UubW9kaWZpZWRVcmk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0NoYW5nZXNGaWxlUmVzb3VyY2UoY2hhbmdlOiBJU2Vzc2lvbkZpbGVDaGFuZ2UsIHJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0cmV0dXJuIGlzRXF1YWwoY2hhbmdlLm9yaWdpbmFsVXJpLCByZXNvdXJjZSlcblx0XHR8fCBpc0VxdWFsKGNoYW5nZS5tb2RpZmllZFVyaSwgcmVzb3VyY2UpXG5cdFx0fHwgaXNFcXVhbChnZXRDaGFuZ2VzRmlsZVVyaShjaGFuZ2UpLCByZXNvdXJjZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0lDaGFuZ2VzRmlsZUl0ZW0oY2hhbmdlczogcmVhZG9ubHkgSVNlc3Npb25GaWxlQ2hhbmdlW10pOiBJQ2hhbmdlc0ZpbGVJdGVtW10ge1xuXHRyZXR1cm4gY2hhbmdlcy5tYXAoY2hhbmdlID0+IHtcblx0XHRjb25zdCBpc0FkZGl0aW9uID0gY2hhbmdlLm9yaWdpbmFsVXJpID09PSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaXNEZWxldGlvbiA9IGNoYW5nZS5tb2RpZmllZFVyaSA9PT0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHVyaSA9IGdldENoYW5nZXNGaWxlVXJpKGNoYW5nZSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ2ZpbGUnLFxuXHRcdFx0dXJpLFxuXHRcdFx0b3JpZ2luYWxVcmk6IGNoYW5nZS5vcmlnaW5hbFVyaSxcblx0XHRcdGlzRGVsZXRpb24sXG5cdFx0XHRzdGF0ZTogTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5BY2NlcHRlZCxcblx0XHRcdGNoYW5nZVR5cGU6IGlzQWRkaXRpb25cblx0XHRcdFx0PyAnYWRkZWQnXG5cdFx0XHRcdDogaXNEZWxldGlvblxuXHRcdFx0XHRcdD8gJ2RlbGV0ZWQnXG5cdFx0XHRcdFx0OiAnbW9kaWZpZWQnLFxuXHRcdFx0bGluZXNBZGRlZDogY2hhbmdlLmluc2VydGlvbnMsXG5cdFx0XHRsaW5lc1JlbW92ZWQ6IGNoYW5nZS5kZWxldGlvbnNcblx0XHR9IHNhdGlzZmllcyBJQ2hhbmdlc0ZpbGVJdGVtO1xuXHR9KTtcbn1cblxudHlwZSBDaGFuZ2VUeXBlID0gJ2FkZGVkJyB8ICdtb2RpZmllZCcgfCAnZGVsZXRlZCcgfCAnbm9uZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYW5nZXNGaWxlSXRlbSB7XG5cdHJlYWRvbmx5IHR5cGU6ICdmaWxlJztcblx0cmVhZG9ubHkgdXJpOiBVUkk7XG5cdHJlYWRvbmx5IG9yaWdpbmFsVXJpPzogVVJJO1xuXHRyZWFkb25seSBzdGF0ZTogTW9kaWZpZWRGaWxlRW50cnlTdGF0ZTtcblx0cmVhZG9ubHkgaXNEZWxldGlvbjogYm9vbGVhbjtcblx0cmVhZG9ubHkgY2hhbmdlVHlwZTogQ2hhbmdlVHlwZTtcblx0cmVhZG9ubHkgbGluZXNBZGRlZDogbnVtYmVyO1xuXHRyZWFkb25seSBsaW5lc1JlbW92ZWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhbmdlc1Jvb3RJdGVtIHtcblx0cmVhZG9ubHkgdHlwZTogJ3Jvb3QnO1xuXHRyZWFkb25seSB1cmk6IFVSSTtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGFuZ2VzVHJlZVJvb3RJbmZvIHtcblx0cmVhZG9ubHkgcm9vdDogSUNoYW5nZXNSb290SXRlbTtcblx0cmVhZG9ubHkgcmVzb3VyY2VUcmVlUm9vdFVyaTogVVJJO1xufVxuXG5leHBvcnQgdHlwZSBDaGFuZ2VzVHJlZUVsZW1lbnQgPSBJQ2hhbmdlc1Jvb3RJdGVtIHwgSUNoYW5nZXNGaWxlSXRlbSB8IElSZXNvdXJjZU5vZGU8SUNoYW5nZXNGaWxlSXRlbSwgdW5kZWZpbmVkPjtcblxuZXhwb3J0IGZ1bmN0aW9uIGlzQ2hhbmdlc0ZpbGVJdGVtKGVsZW1lbnQ6IENoYW5nZXNUcmVlRWxlbWVudCk6IGVsZW1lbnQgaXMgSUNoYW5nZXNGaWxlSXRlbSB7XG5cdHJldHVybiAhUmVzb3VyY2VUcmVlLmlzUmVzb3VyY2VOb2RlKGVsZW1lbnQpICYmIGVsZW1lbnQudHlwZSA9PT0gJ2ZpbGUnO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNDaGFuZ2VzUm9vdEl0ZW0oZWxlbWVudDogQ2hhbmdlc1RyZWVFbGVtZW50KTogZWxlbWVudCBpcyBJQ2hhbmdlc1Jvb3RJdGVtIHtcblx0cmV0dXJuICFSZXNvdXJjZVRyZWUuaXNSZXNvdXJjZU5vZGUoZWxlbWVudCkgJiYgZWxlbWVudC50eXBlID09PSAncm9vdCc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFRyZWVDaGlsZHJlbihpdGVtczogSUNoYW5nZXNGaWxlSXRlbVtdLCB0cmVlUm9vdEluZm8/OiBJQ2hhbmdlc1RyZWVSb290SW5mbyk6IElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8Q2hhbmdlc1RyZWVFbGVtZW50PltdIHtcblx0aWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGxldCByb290VXJpID0gdHJlZVJvb3RJbmZvPy5yZXNvdXJjZVRyZWVSb290VXJpID8/IFVSSS5maWxlKCcvJyk7XG5cblx0Ly8gRm9yIGdpdGh1Yi1yZW1vdGUtZmlsZSBVUklzLCBzZXQgdGhlIHJvb3QgdG8gL3tvd25lcn0ve3JlcG99L3tyZWZ9XG5cdC8vIHNvIHRoZSB0cmVlIHNob3dzIHJlcG8tcmVsYXRpdmUgcGF0aHMgaW5zdGVhZCBvZiBpbnRlcm5hbCBVUkkgc2VnbWVudHMuXG5cdGlmICghdHJlZVJvb3RJbmZvICYmIGl0ZW1zWzBdLnVyaS5zY2hlbWUgPT09IEdJVEhVQl9SRU1PVEVfRklMRV9TQ0hFTUUpIHtcblx0XHRjb25zdCBwYXJ0cyA9IGl0ZW1zWzBdLnVyaS5wYXRoLnNwbGl0KCcvJykuZmlsdGVyKEJvb2xlYW4pO1xuXHRcdGlmIChwYXJ0cy5sZW5ndGggPj0gMykge1xuXHRcdFx0cm9vdFVyaSA9IGl0ZW1zWzBdLnVyaS53aXRoKHsgcGF0aDogJy8nICsgcGFydHMuc2xpY2UoMCwgMykuam9pbignLycpIH0pO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IHJlc291cmNlVHJlZSA9IG5ldyBSZXNvdXJjZVRyZWU8SUNoYW5nZXNGaWxlSXRlbSwgdW5kZWZpbmVkPih1bmRlZmluZWQsIHJvb3RVcmksIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlKTtcblx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0cmVzb3VyY2VUcmVlLmFkZChpdGVtLnVyaSwgaXRlbSk7XG5cdH1cblxuXHRmdW5jdGlvbiBjb252ZXJ0Q2hpbGRyZW4ocGFyZW50OiBJUmVzb3VyY2VOb2RlPElDaGFuZ2VzRmlsZUl0ZW0sIHVuZGVmaW5lZD4pOiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PENoYW5nZXNUcmVlRWxlbWVudD5bXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PENoYW5nZXNUcmVlRWxlbWVudD5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY2hpbGQgb2YgcGFyZW50LmNoaWxkcmVuKSB7XG5cdFx0XHRpZiAoY2hpbGQuZWxlbWVudCAmJiBjaGlsZC5jaGlsZHJlbkNvdW50ID09PSAwKSB7XG5cdFx0XHRcdC8vIExlYWYgbm9kZSBcdTIwMTQganVzdCB0aGUgZmlsZSBpdGVtXG5cdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRlbGVtZW50OiBjaGlsZC5lbGVtZW50LFxuXHRcdFx0XHRcdGNvbGxhcHNpYmxlOiBmYWxzZSxcblx0XHRcdFx0XHRpbmNvbXByZXNzaWJsZTogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBGb2xkZXIgbm9kZS4gRW5zdXJlIHRoYXQgdGhlIGZpcnN0IGxldmVsIG9mIGZvbGRlcnMgdW5kZXJcblx0XHRcdFx0Ly8gdGhlIHJvb3QgZm9sZGVyIGFyZSBub3QgYmVpbmcgY29sbGFwc2VkIHdpdGggdGhlIHJvb3QgZm9sZGVyXG5cdFx0XHRcdC8vIGFzIHRoYXQgaXMgYSBzcGVjaWFsIG5vZGUgc2hvd2luZyB0aGUgd29ya3NwYWNlIGZvbGRlciBhbmRcblx0XHRcdFx0Ly8gYnJhbmNoIGluZm9ybWF0aW9uLlxuXHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0ZWxlbWVudDogY2hpbGQsXG5cdFx0XHRcdFx0Y2hpbGRyZW46IGNvbnZlcnRDaGlsZHJlbihjaGlsZCksXG5cdFx0XHRcdFx0aW5jb21wcmVzc2libGU6IHBhcmVudCA9PT0gcmVzb3VyY2VUcmVlLnJvb3QsXG5cdFx0XHRcdFx0Y29sbGFwc2libGU6IHRydWUsXG5cdFx0XHRcdFx0Y29sbGFwc2VkOiBmYWxzZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRjb25zdCBjaGlsZHJlbiA9IGNvbnZlcnRDaGlsZHJlbihyZXNvdXJjZVRyZWUucm9vdCk7XG5cdGlmICghdHJlZVJvb3RJbmZvKSB7XG5cdFx0cmV0dXJuIGNoaWxkcmVuO1xuXHR9XG5cblx0cmV0dXJuIFt7XG5cdFx0ZWxlbWVudDogdHJlZVJvb3RJbmZvLnJvb3QsXG5cdFx0Y2hpbGRyZW4sXG5cdFx0Y29sbGFwc2libGU6IHRydWUsXG5cdFx0Y29sbGFwc2VkOiBmYWxzZSxcblx0XHRpbmNvbXByZXNzaWJsZTogdHJ1ZSxcblx0fV07XG59XG5cbmludGVyZmFjZSBJQ2hhbmdlc1RyZWVUZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IGxhYmVsOiBJUmVzb3VyY2VMYWJlbDtcblx0cmVhZG9ubHkgdG9vbGJhcjogTWVudVdvcmtiZW5jaFRvb2xCYXI7XG5cdHJlYWRvbmx5IGNoYW5nZUtpbmRDb250ZXh0S2V5OiBJQ29udGV4dEtleTwncm9vdCcgfCAnZm9sZGVyJyB8ICdmaWxlJz47XG5cdHJlYWRvbmx5IHJldmlld0NvbW1lbnRzQmFkZ2U6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBhZ2VudEZlZWRiYWNrQmFkZ2U6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBkZWNvcmF0aW9uQmFkZ2U6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBhZGRlZFNwYW46IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSByZW1vdmVkU3BhbjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGxpbmVDb3VudHNDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cmVhZG9ubHkgdGVtcGxhdGVEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhbmdlc1RyZWVSZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8Q2hhbmdlc1RyZWVFbGVtZW50LCB2b2lkLCBJQ2hhbmdlc1RyZWVUZW1wbGF0ZT4ge1xuXHRzdGF0aWMgVEVNUExBVEVfSUQgPSAnY2hhbmdlc1RyZWVSZW5kZXJlcic7XG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9IENoYW5nZXNUcmVlUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBsYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdHByaXZhdGUgYWN0aW9uUnVubmVyOiBBY3Rpb25SdW5uZXIgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSBnZXRSb290VXJpOiAoKSA9PiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDaGFuZ2VzVmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGFuZ2VzVmlld1NlcnZpY2U6IElDaGFuZ2VzVmlld1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElDaGFuZ2VzVHJlZVRlbXBsYXRlIHtcblx0XHRjb25zdCB0ZW1wbGF0ZURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGxhYmVsID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQodGhpcy5sYWJlbHMuY3JlYXRlKGNvbnRhaW5lciwgeyBzdXBwb3J0SGlnaGxpZ2h0czogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblxuXHRcdGNvbnN0IHJldmlld0NvbW1lbnRzQmFkZ2UgPSBkb20uJCgnLmNoYW5nZXMtcmV2aWV3LWNvbW1lbnRzLWJhZGdlJyk7XG5cdFx0bGFiZWwuZWxlbWVudC5hcHBlbmRDaGlsZChyZXZpZXdDb21tZW50c0JhZGdlKTtcblxuXHRcdGNvbnN0IGFnZW50RmVlZGJhY2tCYWRnZSA9IGRvbS4kKCcuY2hhbmdlcy1hZ2VudC1mZWVkYmFjay1iYWRnZScpO1xuXHRcdGxhYmVsLmVsZW1lbnQuYXBwZW5kQ2hpbGQoYWdlbnRGZWVkYmFja0JhZGdlKTtcblxuXHRcdGNvbnN0IGxpbmVDb3VudHNDb250YWluZXIgPSAkKCcud29ya2luZy1zZXQtbGluZS1jb3VudHMnKTtcblx0XHRjb25zdCBhZGRlZFNwYW4gPSBkb20uJCgnLndvcmtpbmctc2V0LWxpbmVzLWFkZGVkJyk7XG5cdFx0Y29uc3QgcmVtb3ZlZFNwYW4gPSBkb20uJCgnLndvcmtpbmctc2V0LWxpbmVzLXJlbW92ZWQnKTtcblx0XHRsaW5lQ291bnRzQ29udGFpbmVyLmFwcGVuZENoaWxkKGFkZGVkU3Bhbik7XG5cdFx0bGluZUNvdW50c0NvbnRhaW5lci5hcHBlbmRDaGlsZChyZW1vdmVkU3Bhbik7XG5cdFx0bGFiZWwuZWxlbWVudC5hcHBlbmRDaGlsZChsaW5lQ291bnRzQ29udGFpbmVyKTtcblxuXHRcdGNvbnN0IGFjdGlvbkJhckNvbnRhaW5lciA9ICQoJy5jaGF0LWNvbGxhcHNpYmxlLWxpc3QtYWN0aW9uLWJhcicpO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQoYWN0aW9uQmFyQ29udGFpbmVyKSk7XG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZV0pKSk7XG5cdFx0Y29uc3QgdG9vbGJhciA9IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCBhY3Rpb25CYXJDb250YWluZXIsIE1lbnVJZC5BZ2VudHNDaGFuZ2VJbmxpbmVUb29sYmFyLCB7XG5cdFx0XHRtZW51T3B0aW9uczogeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSwgYXJnOiB1bmRlZmluZWQgfSwgYWN0aW9uUnVubmVyOiB0aGlzLmFjdGlvblJ1bm5lclxuXHRcdH0pKTtcblx0XHRsYWJlbC5lbGVtZW50LmFwcGVuZENoaWxkKGFjdGlvbkJhckNvbnRhaW5lcik7XG5cblx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChiaW5kQ29udGV4dEtleShDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uVHlwZSwgY29udGV4dEtleVNlcnZpY2UsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gYWN0aXZlU2Vzc2lvbj8uc2Vzc2lvblR5cGUgPz8gJyc7XG5cdFx0fSkpO1xuXG5cdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoYmluZENvbnRleHRLZXkoQWN0aXZlU2Vzc2lvbkNvbnRleHRLZXlzLkhhc0dpdFJlcG9zaXRvcnksIGNvbnRleHRLZXlTZXJ2aWNlLCByZWFkZXIgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25IYXNHaXRSZXBvc2l0b3J5T2JzLnJlYWQocmVhZGVyKTtcblx0XHR9KSk7XG5cblx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChiaW5kQ29udGV4dEtleShDaGFuZ2VzQ29udGV4dEtleXMuVmVyc2lvbk1vZGUsIGNvbnRleHRLZXlTZXJ2aWNlLCByZWFkZXIgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRPYnMucmVhZChyZWFkZXIpPy5pZCA/PyAnJztcblx0XHR9KSk7XG5cblx0XHRjb25zdCBjaGFuZ2VLaW5kQ29udGV4dEtleSA9IENoYW5nZXNDb250ZXh0S2V5cy5DaGFuZ2VLaW5kLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRjb25zdCBkZWNvcmF0aW9uQmFkZ2UgPSBkb20uJCgnLmNoYW5nZXMtZGVjb3JhdGlvbi1iYWRnZScpO1xuXHRcdGxhYmVsLmVsZW1lbnQuYXBwZW5kQ2hpbGQoZGVjb3JhdGlvbkJhZGdlKTtcblxuXHRcdHJldHVybiB7IGxhYmVsLCB0b29sYmFyLCBjaGFuZ2VLaW5kQ29udGV4dEtleSwgcmV2aWV3Q29tbWVudHNCYWRnZSwgYWdlbnRGZWVkYmFja0JhZGdlLCBkZWNvcmF0aW9uQmFkZ2UsIGFkZGVkU3BhbiwgcmVtb3ZlZFNwYW4sIGxpbmVDb3VudHNDb250YWluZXIsIGVsZW1lbnREaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVTdG9yZSgpLCB0ZW1wbGF0ZURpc3Bvc2FibGVzIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxDaGFuZ2VzVHJlZUVsZW1lbnQsIHZvaWQ+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQ2hhbmdlc1RyZWVUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBub2RlLmVsZW1lbnQ7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcblxuXHRcdGlmIChpc0NoYW5nZXNSb290SXRlbShlbGVtZW50KSkge1xuXHRcdFx0Ly8gUm9vdCBlbGVtZW50XG5cdFx0XHR0aGlzLnJlbmRlclJvb3RFbGVtZW50KGVsZW1lbnQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0fSBlbHNlIGlmIChSZXNvdXJjZVRyZWUuaXNSZXNvdXJjZU5vZGUoZWxlbWVudCkpIHtcblx0XHRcdC8vIEZvbGRlciBlbGVtZW50XG5cdFx0XHR0aGlzLnJlbmRlckZvbGRlckVsZW1lbnQoZWxlbWVudCwgdGVtcGxhdGVEYXRhKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRmlsZSBlbGVtZW50XG5cdFx0XHR0aGlzLnJlbmRlckZpbGVFbGVtZW50KGVsZW1lbnQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0fVxuXHR9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPENoYW5nZXNUcmVlRWxlbWVudD4sIHZvaWQ+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQ2hhbmdlc1RyZWVUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbXByZXNzZWQgPSBub2RlLmVsZW1lbnQgYXMgSUNvbXByZXNzZWRUcmVlTm9kZTxJUmVzb3VyY2VOb2RlPElDaGFuZ2VzRmlsZUl0ZW0sIHVuZGVmaW5lZD4+O1xuXHRcdGNvbnN0IGZvbGRlciA9IGNvbXByZXNzZWQuZWxlbWVudHNbY29tcHJlc3NlZC5lbGVtZW50cy5sZW5ndGggLSAxXTtcblxuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cblx0XHRjb25zdCBsYWJlbCA9IGNvbXByZXNzZWQuZWxlbWVudHMubWFwKGUgPT4gZS5uYW1lKTtcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0UmVzb3VyY2UoeyByZXNvdXJjZTogZm9sZGVyLnVyaSwgbmFtZTogbGFiZWwgfSwge1xuXHRcdFx0ZmlsZUtpbmQ6IEZpbGVLaW5kLkZPTERFUixcblx0XHRcdHNlcGFyYXRvcjogdGhpcy5sYWJlbFNlcnZpY2UuZ2V0U2VwYXJhdG9yKGZvbGRlci51cmkuc2NoZW1lKSxcblx0XHR9KTtcblxuXHRcdC8vIEhpZGUgZmlsZS1zcGVjaWZpYyBkZWNvcmF0aW9ucyBmb3IgZm9sZGVyc1xuXHRcdHRlbXBsYXRlRGF0YS5yZXZpZXdDb21tZW50c0JhZGdlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGVtcGxhdGVEYXRhLmFnZW50RmVlZGJhY2tCYWRnZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRlbXBsYXRlRGF0YS5kZWNvcmF0aW9uQmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0ZW1wbGF0ZURhdGEubGluZUNvdW50c0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0aWYgKHRlbXBsYXRlRGF0YS50b29sYmFyKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEudG9vbGJhci5jb250ZXh0ID0gZm9sZGVyO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS5jaGFuZ2VLaW5kQ29udGV4dEtleS5zZXQoJ2ZvbGRlcicpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJGaWxlRWxlbWVudChkYXRhOiBJQ2hhbmdlc0ZpbGVJdGVtLCB0ZW1wbGF0ZURhdGE6IElDaGFuZ2VzVHJlZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Y29uc3Qgcm9vdCA9IHRoaXMuZ2V0Um9vdFVyaSgpO1xuXHRcdGNvbnN0IHZpZXdNb2RlID0gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2Uudmlld01vZGVPYnMuZ2V0KCk7XG5cblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0UmVzb3VyY2Uoe1xuXHRcdFx0cmVzb3VyY2U6IGRhdGEudXJpLFxuXHRcdFx0bmFtZTogYmFzZW5hbWUoZGF0YS51cmkpLFxuXHRcdFx0ZGVzY3JpcHRpb246IHZpZXdNb2RlID09PSBDaGFuZ2VzVmlld01vZGUuTGlzdFxuXHRcdFx0XHQ/IHJvb3Rcblx0XHRcdFx0XHQ/IHJlbGF0aXZlUGF0aChyb290LCBkaXJuYW1lKGRhdGEudXJpKSlcblx0XHRcdFx0XHQ6IHVuZGVmaW5lZFxuXHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHR9LCB7XG5cdFx0XHRmaWxlS2luZDogRmlsZUtpbmQuRklMRSxcblx0XHRcdGZpbGVEZWNvcmF0aW9uczogdW5kZWZpbmVkLFxuXHRcdFx0c3RyaWtldGhyb3VnaDogZGF0YS5jaGFuZ2VUeXBlID09PSAnZGVsZXRlZCdcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNob3dDaGFuZ2VEZWNvcmF0aW9ucyA9IGRhdGEuY2hhbmdlVHlwZSAhPT0gJ25vbmUnO1xuXG5cdFx0Ly8gU2hvdyBmaWxlLXNwZWNpZmljIGRlY29yYXRpb25zIGZvciBjaGFuZ2VkIGZpbGVzIG9ubHlcblx0XHR0ZW1wbGF0ZURhdGEubGluZUNvdW50c0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gc2hvd0NoYW5nZURlY29yYXRpb25zID8gJycgOiAnbm9uZSc7XG5cdFx0dGVtcGxhdGVEYXRhLmRlY29yYXRpb25CYWRnZS5zdHlsZS5kaXNwbGF5ID0gc2hvd0NoYW5nZURlY29yYXRpb25zID8gJycgOiAnbm9uZSc7XG5cblx0XHQvLyBSZXZpZXcgY29tbWVudHNcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCByZXZpZXdDb21tZW50QnlGaWxlID0gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvblJldmlld0NvbW1lbnRDb3VudEJ5RmlsZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCByZXZpZXdDb21tZW50Q291bnQgPSByZXZpZXdDb21tZW50QnlGaWxlPy5nZXQoZGF0YS51cmkuZnNQYXRoKSA/PyAwO1xuXG5cdFx0XHRpZiAocmV2aWV3Q29tbWVudENvdW50ID4gMCkge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEucmV2aWV3Q29tbWVudHNCYWRnZS5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5yZXZpZXdDb21tZW50c0JhZGdlLmNsYXNzTmFtZSA9ICdjaGFuZ2VzLXJldmlldy1jb21tZW50cy1iYWRnZSc7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5yZXZpZXdDb21tZW50c0JhZGdlLnJlcGxhY2VDaGlsZHJlbihcblx0XHRcdFx0XHRkb20uJCgnLmNvZGljb24uY29kaWNvbi1jb21tZW50LXVucmVzb2x2ZWQnKSxcblx0XHRcdFx0XHRkb20uJCgnc3BhbicsIHVuZGVmaW5lZCwgYCR7cmV2aWV3Q29tbWVudENvdW50fWApXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEucmV2aWV3Q29tbWVudHNCYWRnZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEucmV2aWV3Q29tbWVudHNCYWRnZS5yZXBsYWNlQ2hpbGRyZW4oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBBZ2VudCBmZWVkYmFja1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFnZW50RmVlZGJhY2tCeUZpbGUgPSB0aGlzLmNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uQWdlbnRGZWVkYmFja0NvdW50QnlGaWxlT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGFnZW50RmVlZGJhY2tDb3VudCA9IGFnZW50RmVlZGJhY2tCeUZpbGU/LmdldChkYXRhLnVyaS5mc1BhdGgpID8/IDA7XG5cblx0XHRcdGlmIChhZ2VudEZlZWRiYWNrQ291bnQgPiAwKSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5hZ2VudEZlZWRiYWNrQmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuYWdlbnRGZWVkYmFja0JhZGdlLmNsYXNzTmFtZSA9ICdjaGFuZ2VzLWFnZW50LWZlZWRiYWNrLWJhZGdlJztcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmFnZW50RmVlZGJhY2tCYWRnZS5yZXBsYWNlQ2hpbGRyZW4oXG5cdFx0XHRcdFx0ZG9tLiQoJy5jb2RpY29uLmNvZGljb24tY29tbWVudCcpLFxuXHRcdFx0XHRcdGRvbS4kKCdzcGFuJywgdW5kZWZpbmVkLCBgJHthZ2VudEZlZWRiYWNrQ291bnR9YClcblx0XHRcdFx0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5hZ2VudEZlZWRiYWNrQmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmFnZW50RmVlZGJhY2tCYWRnZS5yZXBsYWNlQ2hpbGRyZW4oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBiYWRnZSA9IHRlbXBsYXRlRGF0YS5kZWNvcmF0aW9uQmFkZ2U7XG5cdFx0YmFkZ2UuY2xhc3NOYW1lID0gJ2NoYW5nZXMtZGVjb3JhdGlvbi1iYWRnZSc7XG5cdFx0aWYgKHNob3dDaGFuZ2VEZWNvcmF0aW9ucykge1xuXHRcdFx0Ly8gVXBkYXRlIGRlY29yYXRpb24gYmFkZ2UgKEEvTS9EKVxuXHRcdFx0c3dpdGNoIChkYXRhLmNoYW5nZVR5cGUpIHtcblx0XHRcdFx0Y2FzZSAnYWRkZWQnOlxuXHRcdFx0XHRcdGJhZGdlLnRleHRDb250ZW50ID0gJ0EnO1xuXHRcdFx0XHRcdGJhZGdlLmNsYXNzTGlzdC5hZGQoJ2FkZGVkJyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2RlbGV0ZWQnOlxuXHRcdFx0XHRcdGJhZGdlLnRleHRDb250ZW50ID0gJ0QnO1xuXHRcdFx0XHRcdGJhZGdlLmNsYXNzTGlzdC5hZGQoJ2RlbGV0ZWQnKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnbW9kaWZpZWQnOlxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdGJhZGdlLnRleHRDb250ZW50ID0gJ00nO1xuXHRcdFx0XHRcdGJhZGdlLmNsYXNzTGlzdC5hZGQoJ21vZGlmaWVkJyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdHRlbXBsYXRlRGF0YS5hZGRlZFNwYW4udGV4dENvbnRlbnQgPSBgKyR7ZGF0YS5saW5lc0FkZGVkfWA7XG5cdFx0XHR0ZW1wbGF0ZURhdGEucmVtb3ZlZFNwYW4udGV4dENvbnRlbnQgPSBgLSR7ZGF0YS5saW5lc1JlbW92ZWR9YDtcblxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWljb24tbmFtZS1jb250YWluZXInKT8uY2xhc3NMaXN0LmFkZCgnbW9kaWZpZWQnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YmFkZ2UudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLmVsZW1lbnQucXVlcnlTZWxlY3RvcignLm1vbmFjby1pY29uLW5hbWUtY29udGFpbmVyJyk/LmNsYXNzTGlzdC5yZW1vdmUoJ21vZGlmaWVkJyk7XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLnRvb2xiYXIuY29udGV4dCA9IGRhdGE7XG5cdFx0dGVtcGxhdGVEYXRhLmNoYW5nZUtpbmRDb250ZXh0S2V5LnNldCgnZmlsZScpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJSb290RWxlbWVudChkYXRhOiBJQ2hhbmdlc1Jvb3RJdGVtLCB0ZW1wbGF0ZURhdGE6IElDaGFuZ2VzVHJlZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldFJlc291cmNlKHtcblx0XHRcdHJlc291cmNlOiBkYXRhLnVyaSxcblx0XHRcdG5hbWU6IGRhdGEubmFtZSxcblx0XHR9LCB7XG5cdFx0XHRmaWxlS2luZDogRmlsZUtpbmQuUk9PVF9GT0xERVIsXG5cdFx0XHRzZXBhcmF0b3I6IHRoaXMubGFiZWxTZXJ2aWNlLmdldFNlcGFyYXRvcihkYXRhLnVyaS5zY2hlbWUsIGRhdGEudXJpLmF1dGhvcml0eSksXG5cdFx0fSk7XG5cblx0XHR0ZW1wbGF0ZURhdGEucmV2aWV3Q29tbWVudHNCYWRnZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRlbXBsYXRlRGF0YS5hZ2VudEZlZWRiYWNrQmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0ZW1wbGF0ZURhdGEuZGVjb3JhdGlvbkJhZGdlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGVtcGxhdGVEYXRhLmxpbmVDb3VudHNDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdHRlbXBsYXRlRGF0YS50b29sYmFyLmNvbnRleHQgPSBkYXRhLnVyaTtcblx0XHR0ZW1wbGF0ZURhdGEuY2hhbmdlS2luZENvbnRleHRLZXkuc2V0KCdyb290Jyk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckZvbGRlckVsZW1lbnQobm9kZTogSVJlc291cmNlTm9kZTxJQ2hhbmdlc0ZpbGVJdGVtLCB1bmRlZmluZWQ+LCB0ZW1wbGF0ZURhdGE6IElDaGFuZ2VzVHJlZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldEZpbGUobm9kZS51cmksIHtcblx0XHRcdGZpbGVLaW5kOiBGaWxlS2luZC5GT0xERVIsXG5cdFx0XHRoaWRlUGF0aDogdHJ1ZSxcblx0XHR9KTtcblxuXHRcdC8vIEhpZGUgZmlsZS1zcGVjaWZpYyBkZWNvcmF0aW9ucyBmb3IgZm9sZGVyc1xuXHRcdHRlbXBsYXRlRGF0YS5yZXZpZXdDb21tZW50c0JhZGdlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGVtcGxhdGVEYXRhLmFnZW50RmVlZGJhY2tCYWRnZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRlbXBsYXRlRGF0YS5kZWNvcmF0aW9uQmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0ZW1wbGF0ZURhdGEubGluZUNvdW50c0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0dGVtcGxhdGVEYXRhLnRvb2xiYXIuY29udGV4dCA9IG5vZGU7XG5cdFx0dGVtcGxhdGVEYXRhLmNoYW5nZUtpbmRDb250ZXh0S2V5LnNldCgnZm9sZGVyJyk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChfZWxlbWVudDogSVRyZWVOb2RlPENoYW5nZXNUcmVlRWxlbWVudCwgdm9pZD4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElDaGFuZ2VzVHJlZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZUNvbXByZXNzZWRFbGVtZW50cyhfZWxlbWVudDogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8Q2hhbmdlc1RyZWVFbGVtZW50Piwgdm9pZD4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElDaGFuZ2VzVHJlZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUNoYW5nZXNUcmVlVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBS3JCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFVBQVUsU0FBUyw0QkFBNEIsU0FBUyxvQkFBb0I7QUFDckYsU0FBd0Isb0JBQW9CO0FBQzVDLFNBQVMsV0FBVztBQUNwQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGNBQWM7QUFDdkIsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsaUNBQXFEO0FBQzlELFNBQVMsMEJBQTBCLG9CQUFvQix1QkFBdUI7QUFDOUUsU0FBUywyQkFBMkI7QUFFcEMsTUFBTSxJ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
