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
import * as dom from "../../../../../../base/browser/dom.js";
import { $ } from "../../../../../../base/browser/dom.js";
import { ActionBar } from "../../../../../../base/browser/ui/actionbar/actionbar.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Iterable } from "../../../../../../base/common/iterator.js";
import { combinedDisposable, Disposable, DisposableStore, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../../base/common/observable.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { URI } from "../../../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../../../nls.js";
import { FileKind } from "../../../../../../platform/files/common/files.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchList } from "../../../../../../platform/list/browser/listService.js";
import { IThemeService } from "../../../../../../platform/theme/common/themeService.js";
import { ResourceLabels } from "../../../../../browser/labels.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { createFileIconThemableTreeContainerScope } from "../../../../files/browser/views/explorerView.js";
import { MultiDiffEditorInput } from "../../../../multiDiffEditor/browser/multiDiffEditorInput.js";
import { MultiDiffEditorItem } from "../../../../multiDiffEditor/browser/multiDiffSourceResolverService.js";
import { ChatEditingSnapshotTextModelContentProvider } from "../../chatEditing/chatEditingTextModelContentProviders.js";
import { ChatConfiguration } from "../../../common/constants.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { IChatResponseFileChangesService } from "../../chatResponseFileChangesService.js";
import { ChatCollapsibleContentPart } from "./chatCollapsibleContentPart.js";
import { ResourcePool } from "./chatCollections.js";
const CHANGES_SUMMARY_ELEMENT_HEIGHT = 22;
const CHANGES_SUMMARY_MAX_ITEMS_SHOWN = 6;
function renderChangesSummaryFileList(container, diffs, instantiationService, editorService, configurationService, options) {
  const store = new DisposableStore();
  const columnWidths = { insertions: 2, deletions: 2 };
  const list = store.add(instantiationService.createInstance(CollapsibleChangesSummaryListPool, options, columnWidths)).get();
  const listNode = list.getHTMLElement();
  container.appendChild(listNode.parentElement);
  store.add(list.onDidOpen((item) => {
    const diff = item.element;
    if (!diff) {
      return;
    }
    const altKey = (dom.isMouseEvent(item.browserEvent) || dom.isKeyboardEvent(item.browserEvent)) && item.browserEvent.altKey;
    const openInDiffEditorByDefault = configurationService.getValue(ChatConfiguration.OpenChangedFileInDiffEditor);
    const openInDiffEditor = altKey ? !openInDiffEditorByDefault : openInDiffEditorByDefault;
    if (!openInDiffEditor) {
      const fileURI = ChatEditingSnapshotTextModelContentProvider.getOriginalFileURI(diff.modifiedURI);
      if (fileURI) {
        editorService.openEditor({ resource: fileURI, options: { preserveFocus: true } });
        return;
      }
    }
    editorService.openEditor({
      original: { resource: diff.originalURI },
      modified: { resource: diff.modifiedURI },
      options: { preserveFocus: true }
    });
  }));
  store.add(list.onContextMenu((e) => {
    dom.EventHelper.stop(e.browserEvent, true);
  }));
  store.add(autorun((r) => {
    const currentDiffs = diffs.read(r);
    let insertionsColumnCharacters = 2;
    let deletionsColumnCharacters = 2;
    for (const diff of currentDiffs) {
      if (!diff.identical && !diff.isBusy) {
        insertionsColumnCharacters = Math.max(insertionsColumnCharacters, String(diff.added).length + 1);
        deletionsColumnCharacters = Math.max(deletionsColumnCharacters, String(diff.removed).length + 1);
      }
    }
    columnWidths.insertions = insertionsColumnCharacters;
    columnWidths.deletions = deletionsColumnCharacters;
    const itemsShown = Math.min(currentDiffs.length, CHANGES_SUMMARY_MAX_ITEMS_SHOWN);
    const height = itemsShown * CHANGES_SUMMARY_ELEMENT_HEIGHT;
    list.layout(height);
    listNode.style.height = height + "px";
    list.splice(0, list.length, currentDiffs);
  }));
  return store;
}
let ChatCheckpointFileChangesSummaryContentPart = class extends Disposable {
  constructor(content, context, hoverService, chatService, editorService, configurationService, instantiationService, chatResponseFileChangesService) {
    super();
    this.content = content;
    this.hoverService = hoverService;
    this.chatService = chatService;
    this.editorService = editorService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.chatResponseFileChangesService = chatResponseFileChangesService;
    this.diffsBetweenRequests = /* @__PURE__ */ new Map();
    this.fileChangesDiffsObservable = this.computeFileChangesDiffs(content);
    this.domNode = $(".checkpoint-file-changes-summary.checkpoint-file-changes-compact");
    this.detailsElement = document.createElement("details");
    this.detailsElement.classList.add("checkpoint-file-changes-disclosure");
    this.domNode.appendChild(this.detailsElement);
    const headerDomNode = this.detailsElement.appendChild(document.createElement("summary"));
    headerDomNode.classList.add("checkpoint-file-changes-summary-header");
    this._register(autorun((r) => {
      const hasChanges = this.fileChangesDiffsObservable.read(r).length > 0;
      this.domNode.style.display = hasChanges ? "" : "none";
    }));
    this._register(this.renderHeader(headerDomNode));
    this._register(this.renderFilesList(this.detailsElement));
    this._register(dom.addDisposableListener(headerDomNode, "click", () => {
      this.domNode.dispatchEvent(new CustomEvent(ChatCollapsibleContentPart.userToggleEvent, { bubbles: true }));
    }));
  }
  computeFileChangesDiffs({ requestId, sessionResource }) {
    const fromProvider = this.chatResponseFileChangesService.getChangesForRequest(sessionResource, requestId);
    if (fromProvider) {
      return fromProvider;
    }
    return this.chatService.chatModels.map((models) => Iterable.find(models, (m) => isEqual(m.sessionResource, sessionResource))).map((model) => model?.editingSession?.getDiffsForFilesInRequest(requestId)).map((diffs, r) => diffs?.read(r) || Iterable.empty());
  }
  getCachedEntryDiffBetweenRequests(editSession, uri, startRequestId, stopRequestId) {
    const key = `${uri}\0${startRequestId}\0${stopRequestId}`;
    let observable = this.diffsBetweenRequests.get(key);
    if (!observable) {
      observable = editSession.getEntryDiffBetweenRequests(uri, startRequestId, stopRequestId);
      this.diffsBetweenRequests.set(key, observable);
    }
    return observable;
  }
  renderHeader(container) {
    const filesLabel = container.appendChild($("span.chat-file-changes-label"));
    const counts = container.appendChild($("span.chat-file-changes-counts", { "aria-hidden": "true" }));
    const addedLabel = counts.appendChild($("span.insertions"));
    const removedLabel = counts.appendChild($("span.deletions"));
    const disposables = new DisposableStore();
    disposables.add(this.renderViewAllFileChangesButton(container));
    const chevron = container.appendChild($("span.chat-file-changes-chevron.chat-collapsible-hover-chevron", { "aria-hidden": "true" }));
    chevron.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRight));
    this._register(autorun((r) => {
      const diffs = this.fileChangesDiffsObservable.read(r);
      const fileCountLabel = diffs.length === 1 ? localize("chat.fileChanges.oneFile", "1 file changed") : localize("chat.fileChanges.manyFiles", "{0} files changed", diffs.length);
      const additions = diffs.reduce((total, diff) => total + diff.added, 0);
      const deletions = diffs.reduce((total, diff) => total + diff.removed, 0);
      filesLabel.textContent = fileCountLabel;
      addedLabel.textContent = `+${additions}`;
      removedLabel.textContent = `-${deletions}`;
      container.setAttribute("aria-label", localize(
        "chat.fileChanges.accessibleSummary",
        "{0}, {1} lines added, {2} lines deleted",
        fileCountLabel,
        additions,
        deletions
      ));
    }));
    const setExpansionState = () => {
      container.setAttribute("aria-expanded", String(this.detailsElement.open));
      chevron.classList.toggle("expanded", this.detailsElement.open);
    };
    setExpansionState();
    disposables.add(dom.addDisposableListener(this.detailsElement, "toggle", setExpansionState));
    return toDisposable(() => disposables.dispose());
  }
  renderViewAllFileChangesButton(container) {
    const button = container.appendChild(document.createElement("button"));
    button.classList.add("chat-view-changes-icon");
    button.type = "button";
    const hoverDisposable = this.hoverService.setupDelayedHover(button, () => ({
      content: localize2("chat.viewFileChangesSummary", "View All File Changes")
    }));
    button.classList.add(...ThemeIcon.asClassNameArray(Codicon.diffMultiple));
    button.setAttribute("aria-label", localize("chat.viewFileChangesSummary", "View All File Changes"));
    return combinedDisposable(hoverDisposable, dom.addDisposableListener(button, "click", (e) => {
      const resources = this.fileChangesDiffsObservable.get().map((diff) => ({
        originalUri: diff.originalURI,
        modifiedUri: diff.modifiedURI
      }));
      const source = URI.parse(`multi-diff-editor:${(/* @__PURE__ */ new Date()).getMilliseconds().toString() + Math.random().toString()}`);
      const input = this.instantiationService.createInstance(
        MultiDiffEditorInput,
        source,
        localize("chat.checkpointFileChanges", "Checkpoint File Changes"),
        resources.map((resource) => {
          return new MultiDiffEditorItem(
            resource.originalUri,
            resource.modifiedUri,
            void 0
          );
        }),
        false
      );
      this.editorService.openEditor(input);
      dom.EventHelper.stop(e, true);
    }));
  }
  renderFilesList(container) {
    return renderChangesSummaryFileList(container, this.fileChangesDiffsObservable, this.instantiationService, this.editorService, this.configurationService);
  }
  hasSameContent(other, followingContent, element) {
    return other.kind === "changesSummary" && other.requestId === this.content.requestId;
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
};
ChatCheckpointFileChangesSummaryContentPart = __decorateClass([
  __decorateParam(2, IHoverService),
  __decorateParam(3, IChatService),
  __decorateParam(4, IEditorService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IChatResponseFileChangesService)
], ChatCheckpointFileChangesSummaryContentPart);
let CollapsibleChangesSummaryListPool = class extends Disposable {
  constructor(options, columnWidths, instantiationService, themeService) {
    super();
    this.options = options;
    this.columnWidths = columnWidths;
    this.instantiationService = instantiationService;
    this.themeService = themeService;
    this._resourcePool = this._register(new ResourcePool(() => this.listFactory()));
  }
  listFactory() {
    const container = $(".chat-summary-list");
    const store = new DisposableStore();
    store.add(createFileIconThemableTreeContainerScope(container, this.themeService));
    const resourceLabels = store.add(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: () => Disposable.None }));
    const list = store.add(this.instantiationService.createInstance(
      WorkbenchList,
      "ChatListRenderer",
      container,
      new CollapsibleChangesSummaryListDelegate(),
      [new CollapsibleChangesSummaryListRenderer(resourceLabels, this.options, this.columnWidths)],
      {
        alwaysConsumeMouseWheel: false
      }
    ));
    return {
      list,
      dispose: () => {
        store.dispose();
      }
    };
  }
  get() {
    return this._resourcePool.get().list;
  }
};
CollapsibleChangesSummaryListPool = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IThemeService)
], CollapsibleChangesSummaryListPool);
class CollapsibleChangesSummaryListDelegate {
  getHeight(element) {
    return CHANGES_SUMMARY_ELEMENT_HEIGHT;
  }
  getTemplateId(element) {
    return CollapsibleChangesSummaryListRenderer.TEMPLATE_ID;
  }
}
const _CollapsibleChangesSummaryListRenderer = class _CollapsibleChangesSummaryListRenderer {
  constructor(labels, options, columnWidths) {
    this.labels = labels;
    this.options = options;
    this.columnWidths = columnWidths;
    this.templateId = _CollapsibleChangesSummaryListRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const label = this.labels.create(container, { supportHighlights: true, supportIcons: true });
    let actionBar;
    if (this.options?.getRowActions) {
      container.classList.add("chat-summary-list-row-with-actions");
      const actionsContainer = container.appendChild($(".chat-summary-list-actions"));
      actionBar = new ActionBar(actionsContainer);
    }
    return {
      label,
      actionBar,
      changesContainer: actionBar ? container : label.element,
      dispose: () => {
        label.dispose();
        actionBar?.dispose();
      }
    };
  }
  renderElement(data, index, templateData) {
    const label = templateData.label;
    label.setFile(data.modifiedURI, {
      fileKind: FileKind.FILE,
      title: data.modifiedURI.path
    });
    templateData.changesElement?.remove();
    if (!data.identical && !data.isBusy) {
      const changesSummary = templateData.changesContainer.appendChild($(`.${_CollapsibleChangesSummaryListRenderer.CHANGES_SUMMARY_CLASS_NAME}`));
      const added = changesSummary.appendChild($(`.insertions`));
      added.textContent = `+${data.added}`;
      added.style.width = `${this.columnWidths.insertions}ch`;
      const removed = changesSummary.appendChild($(`.deletions`));
      removed.textContent = `-${data.removed}`;
      removed.style.width = `${this.columnWidths.deletions}ch`;
      templateData.changesElement = changesSummary;
    }
    if (templateData.actionBar && this.options?.getRowActions) {
      templateData.actionBar.clear();
      templateData.actionBar.push(this.options.getRowActions(data), { icon: false, label: true });
    }
  }
  disposeTemplate(templateData) {
    templateData.dispose();
  }
};
_CollapsibleChangesSummaryListRenderer.TEMPLATE_ID = "collapsibleChangesSummaryListRenderer";
_CollapsibleChangesSummaryListRenderer.CHANGES_SUMMARY_CLASS_NAME = "insertions-and-deletions";
let CollapsibleChangesSummaryListRenderer = _CollapsibleChangesSummaryListRenderer;
export {
  ChatCheckpointFileChangesSummaryContentPart,
  renderChangesSummaryFileList
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdENoYW5nZXNTdW1tYXJ5UGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7ICQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IElMaXN0UmVuZGVyZXIsIElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBjb21iaW5lZERpc3Bvc2FibGUsIERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRmlsZUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlc291cmNlTGFiZWwsIFJlc291cmNlTGFiZWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9sYWJlbHMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlRmlsZUljb25UaGVtYWJsZVRyZWVDb250YWluZXJTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL2ZpbGVzL2Jyb3dzZXIvdmlld3MvZXhwbG9yZXJWaWV3LmpzJztcbmltcG9ydCB7IE11bHRpRGlmZkVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vbXVsdGlEaWZmRWRpdG9yL2Jyb3dzZXIvbXVsdGlEaWZmRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgTXVsdGlEaWZmRWRpdG9ySXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL211bHRpRGlmZkVkaXRvci9icm93c2VyL211bHRpRGlmZlNvdXJjZVJlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRpbmdTZXNzaW9uLCBJRWRpdFNlc3Npb25FbnRyeURpZmYgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRpbmdTbmFwc2hvdFRleHRNb2RlbENvbnRlbnRQcm92aWRlciB9IGZyb20gJy4uLy4uL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nVGV4dE1vZGVsQ29udGVudFByb3ZpZGVycy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0Q2hhbmdlc1N1bW1hcnlQYXJ0IGFzIElDaGF0RmlsZUNoYW5nZXNTdW1tYXJ5UGFydCwgSUNoYXRSZW5kZXJlckNvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29sbGFwc2libGVDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0VHJlZUl0ZW0gfSBmcm9tICcuLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IFJlc291cmNlUG9vbCB9IGZyb20gJy4vY2hhdENvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnQsIElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzLmpzJztcblxuY29uc3QgQ0hBTkdFU19TVU1NQVJZX0VMRU1FTlRfSEVJR0hUID0gMjI7XG5jb25zdCBDSEFOR0VTX1NVTU1BUllfTUFYX0lURU1TX1NIT1dOID0gNjtcblxuLyoqIE9wdGlvbnMgY29udHJvbGxpbmcgaG93IHtAbGluayByZW5kZXJDaGFuZ2VzU3VtbWFyeUZpbGVMaXN0fSByZW5kZXJzIGVhY2ggcm93LiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ2hhbmdlc1N1bW1hcnlGaWxlTGlzdE9wdGlvbnMge1xuXHQvKipcblx0ICogUHJvdmlkZXMgdGhlIGFjdGlvbnMgc2hvd24gaW4gYSBwZXItcm93IGFjdGlvbiBiYXIgKHJpZ2h0LWFsaWduZWQpLiBSZXR1cm5cblx0ICogYW4gZW1wdHkgYXJyYXkgZm9yIHJvd3MgdGhhdCBzaG91bGQgaGF2ZSBubyBhY3Rpb25zLiBXaGVuIG9taXR0ZWQsIG5vIGFjdGlvblxuXHQgKiBiYXIgaXMgcmVuZGVyZWQuXG5cdCAqL1xuXHRyZWFkb25seSBnZXRSb3dBY3Rpb25zPzogKGRpZmY6IElFZGl0U2Vzc2lvbkVudHJ5RGlmZikgPT4gSUFjdGlvbltdO1xufVxuXG4vKipcbiAqIFJlbmRlcnMgdGhlIGNvbGxhcHNpYmxlIGxpc3Qgb2YgY2hhbmdlZCBmaWxlcyAob25lIHJvdyBwZXIge0BsaW5rIElFZGl0U2Vzc2lvbkVudHJ5RGlmZn0sXG4gKiBzaG93aW5nIHRoZSBmaWxlJ3MgcmVzb3VyY2UgbGFiZWwgYW5kIGl0cyArYWRkZWQvLXJlbW92ZWQgY291bnRzKSBpbnRvIGBjb250YWluZXJgLFxuICoga2VlcGluZyBpdCBpbiBzeW5jIHdpdGggYGRpZmZzYC4gUm93cyBvcGVuIHRoZSBmaWxlIG9yIGl0cyBkaWZmIG9uIGFjdGl2YXRpb24uXG4gKiBTaGFyZWQgYnkgdGhlIGNoZWNrcG9pbnQgZmlsZSBjaGFuZ2VzIHN1bW1hcnkgYW5kIHRoZSBhZ2VudCB0dXJuIGNoYW5nZXMgc3VtbWFyeVxuICogc28gYm90aCByZW5kZXIgYW4gaWRlbnRpY2FsIGxpc3QuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJDaGFuZ2VzU3VtbWFyeUZpbGVMaXN0KFxuXHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRkaWZmczogSU9ic2VydmFibGU8cmVhZG9ubHkgSUVkaXRTZXNzaW9uRW50cnlEaWZmW10+LFxuXHRpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0Y29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0b3B0aW9ucz86IElDaGFuZ2VzU3VtbWFyeUZpbGVMaXN0T3B0aW9ucyxcbik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IGNvbHVtbldpZHRoczogSUNoYW5nZXNTdW1tYXJ5Q29sdW1uV2lkdGhzID0geyBpbnNlcnRpb25zOiAyLCBkZWxldGlvbnM6IDIgfTtcblx0Y29uc3QgbGlzdCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb2xsYXBzaWJsZUNoYW5nZXNTdW1tYXJ5TGlzdFBvb2wsIG9wdGlvbnMsIGNvbHVtbldpZHRocykpLmdldCgpO1xuXHRjb25zdCBsaXN0Tm9kZSA9IGxpc3QuZ2V0SFRNTEVsZW1lbnQoKTtcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGxpc3ROb2RlLnBhcmVudEVsZW1lbnQhKTtcblxuXHRzdG9yZS5hZGQobGlzdC5vbkRpZE9wZW4oKGl0ZW0pID0+IHtcblx0XHRjb25zdCBkaWZmID0gaXRlbS5lbGVtZW50O1xuXHRcdGlmICghZGlmZikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFsdEtleSA9IChkb20uaXNNb3VzZUV2ZW50KGl0ZW0uYnJvd3NlckV2ZW50KSB8fCBkb20uaXNLZXlib2FyZEV2ZW50KGl0ZW0uYnJvd3NlckV2ZW50KSkgJiYgaXRlbS5icm93c2VyRXZlbnQuYWx0S2V5O1xuXHRcdGNvbnN0IG9wZW5JbkRpZmZFZGl0b3JCeURlZmF1bHQgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5PcGVuQ2hhbmdlZEZpbGVJbkRpZmZFZGl0b3IpO1xuXHRcdGNvbnN0IG9wZW5JbkRpZmZFZGl0b3IgPSBhbHRLZXkgPyAhb3BlbkluRGlmZkVkaXRvckJ5RGVmYXVsdCA6IG9wZW5JbkRpZmZFZGl0b3JCeURlZmF1bHQ7XG5cblx0XHRpZiAoIW9wZW5JbkRpZmZFZGl0b3IpIHtcblx0XHRcdGNvbnN0IGZpbGVVUkkgPSBDaGF0RWRpdGluZ1NuYXBzaG90VGV4dE1vZGVsQ29udGVudFByb3ZpZGVyLmdldE9yaWdpbmFsRmlsZVVSSShkaWZmLm1vZGlmaWVkVVJJKTtcblx0XHRcdGlmIChmaWxlVVJJKSB7XG5cdFx0XHRcdGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBmaWxlVVJJLCBvcHRpb25zOiB7IHByZXNlcnZlRm9jdXM6IHRydWUgfSB9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVGhlIGZpbGUncyBvcmlnaW4gY2Fubm90IGJlIHJlY292ZXJlZCAoZS5nLiBsZWdhY3kgc25hcHNob3QgVVJJcyk6XG5cdFx0XHQvLyBmYWxsIGJhY2sgdG8gdGhlIGRpZmYgZWRpdG9yLlxuXHRcdH1cblxuXHRcdGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogZGlmZi5vcmlnaW5hbFVSSSB9LFxuXHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IGRpZmYubW9kaWZpZWRVUkkgfSxcblx0XHRcdG9wdGlvbnM6IHsgcHJlc2VydmVGb2N1czogdHJ1ZSB9XG5cdFx0fSk7XG5cdH0pKTtcblxuXHRzdG9yZS5hZGQobGlzdC5vbkNvbnRleHRNZW51KGUgPT4ge1xuXHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUuYnJvd3NlckV2ZW50LCB0cnVlKTtcblx0fSkpO1xuXG5cdHN0b3JlLmFkZChhdXRvcnVuKChyKSA9PiB7XG5cdFx0Y29uc3QgY3VycmVudERpZmZzID0gZGlmZnMucmVhZChyKTtcblx0XHRsZXQgaW5zZXJ0aW9uc0NvbHVtbkNoYXJhY3RlcnMgPSAyO1xuXHRcdGxldCBkZWxldGlvbnNDb2x1bW5DaGFyYWN0ZXJzID0gMjtcblx0XHQvLyBXaWR0aHMgYXJlIHNoYXJlZCBieSB0aGUgbGlzdCBzbyBlYWNoIHJvdyB1c2VzIHRoZSBzYW1lIGNvdW50IGNvbHVtbnMuXG5cdFx0Zm9yIChjb25zdCBkaWZmIG9mIGN1cnJlbnREaWZmcykge1xuXHRcdFx0aWYgKCFkaWZmLmlkZW50aWNhbCAmJiAhZGlmZi5pc0J1c3kpIHtcblx0XHRcdFx0aW5zZXJ0aW9uc0NvbHVtbkNoYXJhY3RlcnMgPSBNYXRoLm1heChpbnNlcnRpb25zQ29sdW1uQ2hhcmFjdGVycywgU3RyaW5nKGRpZmYuYWRkZWQpLmxlbmd0aCArIDEpO1xuXHRcdFx0XHRkZWxldGlvbnNDb2x1bW5DaGFyYWN0ZXJzID0gTWF0aC5tYXgoZGVsZXRpb25zQ29sdW1uQ2hhcmFjdGVycywgU3RyaW5nKGRpZmYucmVtb3ZlZCkubGVuZ3RoICsgMSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbHVtbldpZHRocy5pbnNlcnRpb25zID0gaW5zZXJ0aW9uc0NvbHVtbkNoYXJhY3RlcnM7XG5cdFx0Y29sdW1uV2lkdGhzLmRlbGV0aW9ucyA9IGRlbGV0aW9uc0NvbHVtbkNoYXJhY3RlcnM7XG5cblx0XHRjb25zdCBpdGVtc1Nob3duID0gTWF0aC5taW4oY3VycmVudERpZmZzLmxlbmd0aCwgQ0hBTkdFU19TVU1NQVJZX01BWF9JVEVNU19TSE9XTik7XG5cdFx0Y29uc3QgaGVpZ2h0ID0gaXRlbXNTaG93biAqIENIQU5HRVNfU1VNTUFSWV9FTEVNRU5UX0hFSUdIVDtcblx0XHRsaXN0LmxheW91dChoZWlnaHQpO1xuXHRcdGxpc3ROb2RlLnN0eWxlLmhlaWdodCA9IGhlaWdodCArICdweCc7XG5cblx0XHRsaXN0LnNwbGljZSgwLCBsaXN0Lmxlbmd0aCwgY3VycmVudERpZmZzKTtcblx0fSkpO1xuXG5cdHJldHVybiBzdG9yZTtcbn1cblxuXG5leHBvcnQgY2xhc3MgQ2hhdENoZWNrcG9pbnRGaWxlQ2hhbmdlc1N1bW1hcnlDb250ZW50UGFydCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhdENvbnRlbnRQYXJ0IHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaWZmc0JldHdlZW5SZXF1ZXN0cyA9IG5ldyBNYXA8c3RyaW5nLCBJT2JzZXJ2YWJsZTxJRWRpdFNlc3Npb25FbnRyeURpZmYgfCB1bmRlZmluZWQ+PigpO1xuXG5cdHByaXZhdGUgZmlsZUNoYW5nZXNEaWZmc09ic2VydmFibGU6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElFZGl0U2Vzc2lvbkVudHJ5RGlmZltdPjtcblx0cHJpdmF0ZSByZWFkb25seSBkZXRhaWxzRWxlbWVudDogSFRNTERldGFpbHNFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGVudDogSUNoYXRGaWxlQ2hhbmdlc1N1bW1hcnlQYXJ0LFxuXHRcdGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlOiBJQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5maWxlQ2hhbmdlc0RpZmZzT2JzZXJ2YWJsZSA9IHRoaXMuY29tcHV0ZUZpbGVDaGFuZ2VzRGlmZnMoY29udGVudCk7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSAkKCcuY2hlY2twb2ludC1maWxlLWNoYW5nZXMtc3VtbWFyeS5jaGVja3BvaW50LWZpbGUtY2hhbmdlcy1jb21wYWN0Jyk7XG5cdFx0dGhpcy5kZXRhaWxzRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RldGFpbHMnKTtcblx0XHR0aGlzLmRldGFpbHNFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoZWNrcG9pbnQtZmlsZS1jaGFuZ2VzLWRpc2Nsb3N1cmUnKTtcblx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5kZXRhaWxzRWxlbWVudCk7XG5cdFx0Y29uc3QgaGVhZGVyRG9tTm9kZSA9IHRoaXMuZGV0YWlsc0VsZW1lbnQuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3VtbWFyeScpKTtcblx0XHRoZWFkZXJEb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NoZWNrcG9pbnQtZmlsZS1jaGFuZ2VzLXN1bW1hcnktaGVhZGVyJyk7XG5cblx0XHQvLyBIaWRlIHRoZSB3aG9sZSBzdW1tYXJ5IHdoZW4gdGhlcmUgYXJlIG5vIGNoYW5nZXMgdG8gc2hvdy4gVGhlIHBhcnQgaXNcblx0XHQvLyBjcmVhdGVkIGVhZ2VybHkgZm9yIGNvbXBsZXRlZCByZXNwb25zZXMsIGJ1dCBzZXNzaW9uIHR5cGVzIHdob3NlXG5cdFx0Ly8gY2hhbmdlcyBhcmUgY29tcHV0ZWQgYXN5bmNocm9ub3VzbHkgKGUuZy4gYWdlbnQgaG9zdCB0dXJuIGNoYW5nZXNldHMpXG5cdFx0Ly8gb25seSBrbm93IHdoZXRoZXIgYSB0dXJuIHByb2R1Y2VkIGVkaXRzIG9uY2UgdGhlIGRpZmZzIHJlc29sdmUuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IGhhc0NoYW5nZXMgPSB0aGlzLmZpbGVDaGFuZ2VzRGlmZnNPYnNlcnZhYmxlLnJlYWQocikubGVuZ3RoID4gMDtcblx0XHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gaGFzQ2hhbmdlcyA/ICcnIDogJ25vbmUnO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVuZGVySGVhZGVyKGhlYWRlckRvbU5vZGUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlbmRlckZpbGVzTGlzdCh0aGlzLmRldGFpbHNFbGVtZW50KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihoZWFkZXJEb21Ob2RlLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoQ2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQudXNlclRvZ2dsZUV2ZW50LCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZUZpbGVDaGFuZ2VzRGlmZnMoeyByZXF1ZXN0SWQsIHNlc3Npb25SZXNvdXJjZSB9OiBJQ2hhdEZpbGVDaGFuZ2VzU3VtbWFyeVBhcnQpIHtcblx0XHQvLyBQcmVmZXIgYSBzZXNzaW9uLXR5cGUtc3BlY2lmaWMgcHJvdmlkZXIgKHRoZSBhdXRob3JpdGF0aXZlIHNvdXJjZSBmb3Jcblx0XHQvLyBzZXNzaW9uIHR5cGVzIHRoYXQgb3duIHRoZWlyIG93biBjaGFuZ2UgY29tcHV0YXRpb24pOyBvdGhlcndpc2UgZmFsbFxuXHRcdC8vIGJhY2sgdG8gdGhlIGNoYXQgZWRpdGluZyBzZXNzaW9uJ3MgcGVyLXJlcXVlc3QgZGlmZnMuXG5cdFx0Y29uc3QgZnJvbVByb3ZpZGVyID0gdGhpcy5jaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UuZ2V0Q2hhbmdlc0ZvclJlcXVlc3Qoc2Vzc2lvblJlc291cmNlLCByZXF1ZXN0SWQpO1xuXHRcdGlmIChmcm9tUHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiBmcm9tUHJvdmlkZXI7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmNoYXRTZXJ2aWNlLmNoYXRNb2RlbHNcblx0XHRcdC5tYXAobW9kZWxzID0+IEl0ZXJhYmxlLmZpbmQobW9kZWxzLCBtID0+IGlzRXF1YWwobS5zZXNzaW9uUmVzb3VyY2UsIHNlc3Npb25SZXNvdXJjZSkpKVxuXHRcdFx0Lm1hcChtb2RlbCA9PiBtb2RlbD8uZWRpdGluZ1Nlc3Npb24/LmdldERpZmZzRm9yRmlsZXNJblJlcXVlc3QocmVxdWVzdElkKSlcblx0XHRcdC5tYXAoKGRpZmZzLCByKSA9PiBkaWZmcz8ucmVhZChyKSB8fCBJdGVyYWJsZS5lbXB0eSgpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDYWNoZWRFbnRyeURpZmZCZXR3ZWVuUmVxdWVzdHMoZWRpdFNlc3Npb246IElDaGF0RWRpdGluZ1Nlc3Npb24sIHVyaTogVVJJLCBzdGFydFJlcXVlc3RJZDogc3RyaW5nLCBzdG9wUmVxdWVzdElkOiBzdHJpbmcpOiBJT2JzZXJ2YWJsZTxJRWRpdFNlc3Npb25FbnRyeURpZmYgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBrZXkgPSBgJHt1cml9XFwwJHtzdGFydFJlcXVlc3RJZH1cXDAke3N0b3BSZXF1ZXN0SWR9YDtcblx0XHRsZXQgb2JzZXJ2YWJsZSA9IHRoaXMuZGlmZnNCZXR3ZWVuUmVxdWVzdHMuZ2V0KGtleSk7XG5cdFx0aWYgKCFvYnNlcnZhYmxlKSB7XG5cdFx0XHRvYnNlcnZhYmxlID0gZWRpdFNlc3Npb24uZ2V0RW50cnlEaWZmQmV0d2VlblJlcXVlc3RzKHVyaSwgc3RhcnRSZXF1ZXN0SWQsIHN0b3BSZXF1ZXN0SWQpO1xuXHRcdFx0dGhpcy5kaWZmc0JldHdlZW5SZXF1ZXN0cy5zZXQoa2V5LCBvYnNlcnZhYmxlKTtcblx0XHR9XG5cdFx0cmV0dXJuIG9ic2VydmFibGU7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckhlYWRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGZpbGVzTGFiZWwgPSBjb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnc3Bhbi5jaGF0LWZpbGUtY2hhbmdlcy1sYWJlbCcpKTtcblx0XHRjb25zdCBjb3VudHMgPSBjb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnc3Bhbi5jaGF0LWZpbGUtY2hhbmdlcy1jb3VudHMnLCB7ICdhcmlhLWhpZGRlbic6ICd0cnVlJyB9KSk7XG5cdFx0Y29uc3QgYWRkZWRMYWJlbCA9IGNvdW50cy5hcHBlbmRDaGlsZCgkKCdzcGFuLmluc2VydGlvbnMnKSk7XG5cdFx0Y29uc3QgcmVtb3ZlZExhYmVsID0gY291bnRzLmFwcGVuZENoaWxkKCQoJ3NwYW4uZGVsZXRpb25zJykpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLnJlbmRlclZpZXdBbGxGaWxlQ2hhbmdlc0J1dHRvbihjb250YWluZXIpKTtcblx0XHRjb25zdCBjaGV2cm9uID0gY29udGFpbmVyLmFwcGVuZENoaWxkKCQoJ3NwYW4uY2hhdC1maWxlLWNoYW5nZXMtY2hldnJvbi5jaGF0LWNvbGxhcHNpYmxlLWhvdmVyLWNoZXZyb24nLCB7ICdhcmlhLWhpZGRlbic6ICd0cnVlJyB9KSk7XG5cdFx0Y2hldnJvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uY2hldnJvblJpZ2h0KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHIgPT4ge1xuXHRcdFx0Y29uc3QgZGlmZnMgPSB0aGlzLmZpbGVDaGFuZ2VzRGlmZnNPYnNlcnZhYmxlLnJlYWQocik7XG5cdFx0XHRjb25zdCBmaWxlQ291bnRMYWJlbCA9IGRpZmZzLmxlbmd0aCA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0LmZpbGVDaGFuZ2VzLm9uZUZpbGUnLCAnMSBmaWxlIGNoYW5nZWQnKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0LmZpbGVDaGFuZ2VzLm1hbnlGaWxlcycsICd7MH0gZmlsZXMgY2hhbmdlZCcsIGRpZmZzLmxlbmd0aCk7XG5cdFx0XHRjb25zdCBhZGRpdGlvbnMgPSBkaWZmcy5yZWR1Y2UoKHRvdGFsLCBkaWZmKSA9PiB0b3RhbCArIGRpZmYuYWRkZWQsIDApO1xuXHRcdFx0Y29uc3QgZGVsZXRpb25zID0gZGlmZnMucmVkdWNlKCh0b3RhbCwgZGlmZikgPT4gdG90YWwgKyBkaWZmLnJlbW92ZWQsIDApO1xuXHRcdFx0ZmlsZXNMYWJlbC50ZXh0Q29udGVudCA9IGZpbGVDb3VudExhYmVsO1xuXHRcdFx0YWRkZWRMYWJlbC50ZXh0Q29udGVudCA9IGArJHthZGRpdGlvbnN9YDtcblx0XHRcdHJlbW92ZWRMYWJlbC50ZXh0Q29udGVudCA9IGAtJHtkZWxldGlvbnN9YDtcblx0XHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZShcblx0XHRcdFx0J2NoYXQuZmlsZUNoYW5nZXMuYWNjZXNzaWJsZVN1bW1hcnknLFxuXHRcdFx0XHQnezB9LCB7MX0gbGluZXMgYWRkZWQsIHsyfSBsaW5lcyBkZWxldGVkJyxcblx0XHRcdFx0ZmlsZUNvdW50TGFiZWwsXG5cdFx0XHRcdGFkZGl0aW9ucyxcblx0XHRcdFx0ZGVsZXRpb25zXG5cdFx0XHQpKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZXRFeHBhbnNpb25TdGF0ZSA9ICgpID0+IHtcblx0XHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCBTdHJpbmcodGhpcy5kZXRhaWxzRWxlbWVudC5vcGVuKSk7XG5cdFx0XHRjaGV2cm9uLmNsYXNzTGlzdC50b2dnbGUoJ2V4cGFuZGVkJywgdGhpcy5kZXRhaWxzRWxlbWVudC5vcGVuKTtcblx0XHR9O1xuXHRcdHNldEV4cGFuc2lvblN0YXRlKCk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRldGFpbHNFbGVtZW50LCAndG9nZ2xlJywgc2V0RXhwYW5zaW9uU3RhdGUpKTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclZpZXdBbGxGaWxlQ2hhbmdlc0J1dHRvbihjb250YWluZXI6IEhUTUxFbGVtZW50KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGJ1dHRvbiA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKSk7XG5cdFx0YnV0dG9uLmNsYXNzTGlzdC5hZGQoJ2NoYXQtdmlldy1jaGFuZ2VzLWljb24nKTtcblx0XHRidXR0b24udHlwZSA9ICdidXR0b24nO1xuXHRcdGNvbnN0IGhvdmVyRGlzcG9zYWJsZSA9IHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKGJ1dHRvbiwgKCkgPT4gKHtcblx0XHRcdGNvbnRlbnQ6IGxvY2FsaXplMignY2hhdC52aWV3RmlsZUNoYW5nZXNTdW1tYXJ5JywgJ1ZpZXcgQWxsIEZpbGUgQ2hhbmdlcycpXG5cdFx0fSkpO1xuXHRcdGJ1dHRvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uZGlmZk11bHRpcGxlKSk7XG5cdFx0YnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdjaGF0LnZpZXdGaWxlQ2hhbmdlc1N1bW1hcnknLCAnVmlldyBBbGwgRmlsZSBDaGFuZ2VzJykpO1xuXG5cdFx0cmV0dXJuIGNvbWJpbmVkRGlzcG9zYWJsZShob3ZlckRpc3Bvc2FibGUsIGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYnV0dG9uLCAnY2xpY2snLCAoZSkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VzOiB7IG9yaWdpbmFsVXJpOiBVUkk7IG1vZGlmaWVkVXJpPzogVVJJIH1bXSA9IHRoaXMuZmlsZUNoYW5nZXNEaWZmc09ic2VydmFibGUuZ2V0KCkubWFwKGRpZmYgPT4gKHtcblx0XHRcdFx0b3JpZ2luYWxVcmk6IGRpZmYub3JpZ2luYWxVUkksXG5cdFx0XHRcdG1vZGlmaWVkVXJpOiBkaWZmLm1vZGlmaWVkVVJJXG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IHNvdXJjZSA9IFVSSS5wYXJzZShgbXVsdGktZGlmZi1lZGl0b3I6JHtuZXcgRGF0ZSgpLmdldE1pbGxpc2Vjb25kcygpLnRvU3RyaW5nKCkgKyBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRjb25zdCBpbnB1dCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdE11bHRpRGlmZkVkaXRvcklucHV0LFxuXHRcdFx0XHRzb3VyY2UsXG5cdFx0XHRcdGxvY2FsaXplKCdjaGF0LmNoZWNrcG9pbnRGaWxlQ2hhbmdlcycsICdDaGVja3BvaW50IEZpbGUgQ2hhbmdlcycpLFxuXHRcdFx0XHRyZXNvdXJjZXMubWFwKHJlc291cmNlID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IE11bHRpRGlmZkVkaXRvckl0ZW0oXG5cdFx0XHRcdFx0XHRyZXNvdXJjZS5vcmlnaW5hbFVyaSxcblx0XHRcdFx0XHRcdHJlc291cmNlLm1vZGlmaWVkVXJpLFxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRmYWxzZVxuXHRcdFx0KTtcblx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGlucHV0KTtcblx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRmlsZXNMaXN0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHJlbmRlckNoYW5nZXNTdW1tYXJ5RmlsZUxpc3QoY29udGFpbmVyLCB0aGlzLmZpbGVDaGFuZ2VzRGlmZnNPYnNlcnZhYmxlLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGlzLmVkaXRvclNlcnZpY2UsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHR9XG5cblx0aGFzU2FtZUNvbnRlbnQob3RoZXI6IElDaGF0UmVuZGVyZXJDb250ZW50LCBmb2xsb3dpbmdDb250ZW50OiBJQ2hhdFJlbmRlcmVyQ29udGVudFtdLCBlbGVtZW50OiBDaGF0VHJlZUl0ZW0pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gb3RoZXIua2luZCA9PT0gJ2NoYW5nZXNTdW1tYXJ5JyAmJiBvdGhlci5yZXF1ZXN0SWQgPT09IHRoaXMuY29udGVudC5yZXF1ZXN0SWQ7XG5cdH1cblxuXHRhZGREaXNwb3NhYmxlKGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZGlzcG9zYWJsZSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElDaGF0RmlsZUNoYW5nZXNTdW1tYXJ5TGlzdFdyYXBwZXIgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdGxpc3Q6IFdvcmtiZW5jaExpc3Q8SUVkaXRTZXNzaW9uRW50cnlEaWZmPjtcbn1cblxuaW50ZXJmYWNlIElDaGFuZ2VzU3VtbWFyeUNvbHVtbldpZHRocyB7XG5cdGluc2VydGlvbnM6IG51bWJlcjtcblx0ZGVsZXRpb25zOiBudW1iZXI7XG59XG5cbmNsYXNzIENvbGxhcHNpYmxlQ2hhbmdlc1N1bW1hcnlMaXN0UG9vbCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgX3Jlc291cmNlUG9vbDogUmVzb3VyY2VQb29sPElDaGF0RmlsZUNoYW5nZXNTdW1tYXJ5TGlzdFdyYXBwZXI+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogSUNoYW5nZXNTdW1tYXJ5RmlsZUxpc3RPcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29sdW1uV2lkdGhzOiBJQ2hhbmdlc1N1bW1hcnlDb2x1bW5XaWR0aHMsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZXNvdXJjZVBvb2wgPSB0aGlzLl9yZWdpc3RlcihuZXcgUmVzb3VyY2VQb29sKCgpID0+IHRoaXMubGlzdEZhY3RvcnkoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBsaXN0RmFjdG9yeSgpOiBJQ2hhdEZpbGVDaGFuZ2VzU3VtbWFyeUxpc3RXcmFwcGVyIHtcblx0XHRjb25zdCBjb250YWluZXIgPSAkKCcuY2hhdC1zdW1tYXJ5LWxpc3QnKTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzdG9yZS5hZGQoY3JlYXRlRmlsZUljb25UaGVtYWJsZVRyZWVDb250YWluZXJTY29wZShjb250YWluZXIsIHRoaXMudGhlbWVTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2VMYWJlbHMgPSBzdG9yZS5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUxhYmVscywgeyBvbkRpZENoYW5nZVZpc2liaWxpdHk6ICgpID0+IERpc3Bvc2FibGUuTm9uZSB9KSk7XG5cdFx0Y29uc3QgbGlzdCA9IHN0b3JlLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0V29ya2JlbmNoTGlzdDxJRWRpdFNlc3Npb25FbnRyeURpZmY+LFxuXHRcdFx0J0NoYXRMaXN0UmVuZGVyZXInLFxuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0bmV3IENvbGxhcHNpYmxlQ2hhbmdlc1N1bW1hcnlMaXN0RGVsZWdhdGUoKSxcblx0XHRcdFtuZXcgQ29sbGFwc2libGVDaGFuZ2VzU3VtbWFyeUxpc3RSZW5kZXJlcihyZXNvdXJjZUxhYmVscywgdGhpcy5vcHRpb25zLCB0aGlzLmNvbHVtbldpZHRocyldLFxuXHRcdFx0e1xuXHRcdFx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogZmFsc2Vcblx0XHRcdH1cblx0XHQpKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGlzdDogbGlzdCxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRnZXQoKTogV29ya2JlbmNoTGlzdDxJRWRpdFNlc3Npb25FbnRyeURpZmY+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVzb3VyY2VQb29sLmdldCgpLmxpc3Q7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElDb2xsYXBzaWJsZUNoYW5nZXNTdW1tYXJ5TGlzdFRlbXBsYXRlIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRyZWFkb25seSBsYWJlbDogSVJlc291cmNlTGFiZWw7XG5cdHJlYWRvbmx5IGFjdGlvbkJhcj86IEFjdGlvbkJhcjtcblx0cmVhZG9ubHkgY2hhbmdlc0NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGNoYW5nZXNFbGVtZW50PzogSFRNTEVsZW1lbnQ7XG59XG5cbmNsYXNzIENvbGxhcHNpYmxlQ2hhbmdlc1N1bW1hcnlMaXN0RGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxJRWRpdFNlc3Npb25FbnRyeURpZmY+IHtcblxuXHRnZXRIZWlnaHQoZWxlbWVudDogSUVkaXRTZXNzaW9uRW50cnlEaWZmKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gQ0hBTkdFU19TVU1NQVJZX0VMRU1FTlRfSEVJR0hUO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBJRWRpdFNlc3Npb25FbnRyeURpZmYpOiBzdHJpbmcge1xuXHRcdHJldHVybiBDb2xsYXBzaWJsZUNoYW5nZXNTdW1tYXJ5TGlzdFJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHR9XG59XG5cbmNsYXNzIENvbGxhcHNpYmxlQ2hhbmdlc1N1bW1hcnlMaXN0UmVuZGVyZXIgaW1wbGVtZW50cyBJTGlzdFJlbmRlcmVyPElFZGl0U2Vzc2lvbkVudHJ5RGlmZiwgSUNvbGxhcHNpYmxlQ2hhbmdlc1N1bW1hcnlMaXN0VGVtcGxhdGU+IHtcblxuXHRzdGF0aWMgVEVNUExBVEVfSUQgPSAnY29sbGFwc2libGVDaGFuZ2VzU3VtbWFyeUxpc3RSZW5kZXJlcic7XG5cdHN0YXRpYyBDSEFOR0VTX1NVTU1BUllfQ0xBU1NfTkFNRSA9ICdpbnNlcnRpb25zLWFuZC1kZWxldGlvbnMnO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9IENvbGxhcHNpYmxlQ2hhbmdlc1N1bW1hcnlMaXN0UmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBsYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogSUNoYW5nZXNTdW1tYXJ5RmlsZUxpc3RPcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29sdW1uV2lkdGhzOiBJQ2hhbmdlc1N1bW1hcnlDb2x1bW5XaWR0aHMsXG5cdCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElDb2xsYXBzaWJsZUNoYW5nZXNTdW1tYXJ5TGlzdFRlbXBsYXRlIHtcblx0XHRjb25zdCBsYWJlbCA9IHRoaXMubGFiZWxzLmNyZWF0ZShjb250YWluZXIsIHsgc3VwcG9ydEhpZ2hsaWdodHM6IHRydWUsIHN1cHBvcnRJY29uczogdHJ1ZSB9KTtcblx0XHQvLyBPbmx5IHdoZW4gYSByb3ctYWN0aW9uIHByb3ZpZGVyIGlzIHN1cHBsaWVkIGRvIHdlIGFkZCBhbiBhY3Rpb24gYmFyXG5cdFx0Ly8gYmV0d2VlbiB0aGUgZmlsZSBsYWJlbCBhbmQgdGhlIHRyYWlsaW5nIGNoYW5nZSBjb3VudHMuXG5cdFx0bGV0IGFjdGlvbkJhcjogQWN0aW9uQmFyIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLm9wdGlvbnM/LmdldFJvd0FjdGlvbnMpIHtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGF0LXN1bW1hcnktbGlzdC1yb3ctd2l0aC1hY3Rpb25zJyk7XG5cdFx0XHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gY29udGFpbmVyLmFwcGVuZENoaWxkKCQoJy5jaGF0LXN1bW1hcnktbGlzdC1hY3Rpb25zJykpO1xuXHRcdFx0YWN0aW9uQmFyID0gbmV3IEFjdGlvbkJhcihhY3Rpb25zQ29udGFpbmVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsLFxuXHRcdFx0YWN0aW9uQmFyLFxuXHRcdFx0Y2hhbmdlc0NvbnRhaW5lcjogYWN0aW9uQmFyID8gY29udGFpbmVyIDogbGFiZWwuZWxlbWVudCxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0bGFiZWwuZGlzcG9zZSgpO1xuXHRcdFx0XHRhY3Rpb25CYXI/LmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChkYXRhOiBJRWRpdFNlc3Npb25FbnRyeURpZmYsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUNvbGxhcHNpYmxlQ2hhbmdlc1N1bW1hcnlMaXN0VGVtcGxhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBsYWJlbCA9IHRlbXBsYXRlRGF0YS5sYWJlbDtcblx0XHRsYWJlbC5zZXRGaWxlKGRhdGEubW9kaWZpZWRVUkksIHtcblx0XHRcdGZpbGVLaW5kOiBGaWxlS2luZC5GSUxFLFxuXHRcdFx0dGl0bGU6IGRhdGEubW9kaWZpZWRVUkkucGF0aFxuXHRcdH0pO1xuXG5cdFx0dGVtcGxhdGVEYXRhLmNoYW5nZXNFbGVtZW50Py5yZW1vdmUoKTtcblxuXHRcdGlmICghZGF0YS5pZGVudGljYWwgJiYgIWRhdGEuaXNCdXN5KSB7XG5cdFx0XHRjb25zdCBjaGFuZ2VzU3VtbWFyeSA9IHRlbXBsYXRlRGF0YS5jaGFuZ2VzQ29udGFpbmVyLmFwcGVuZENoaWxkKCQoYC4ke0NvbGxhcHNpYmxlQ2hhbmdlc1N1bW1hcnlMaXN0UmVuZGVyZXIuQ0hBTkdFU19TVU1NQVJZX0NMQVNTX05BTUV9YCkpO1xuXG5cdFx0XHRjb25zdCBhZGRlZCA9IGNoYW5nZXNTdW1tYXJ5LmFwcGVuZENoaWxkKCQoYC5pbnNlcnRpb25zYCkpO1xuXHRcdFx0YWRkZWQudGV4dENvbnRlbnQgPSBgKyR7ZGF0YS5hZGRlZH1gO1xuXHRcdFx0YWRkZWQuc3R5bGUud2lkdGggPSBgJHt0aGlzLmNvbHVtbldpZHRocy5pbnNlcnRpb25zfWNoYDtcblxuXHRcdFx0Y29uc3QgcmVtb3ZlZCA9IGNoYW5nZXNTdW1tYXJ5LmFwcGVuZENoaWxkKCQoYC5kZWxldGlvbnNgKSk7XG5cdFx0XHRyZW1vdmVkLnRleHRDb250ZW50ID0gYC0ke2RhdGEucmVtb3ZlZH1gO1xuXHRcdFx0cmVtb3ZlZC5zdHlsZS53aWR0aCA9IGAke3RoaXMuY29sdW1uV2lkdGhzLmRlbGV0aW9uc31jaGA7XG5cblx0XHRcdHRlbXBsYXRlRGF0YS5jaGFuZ2VzRWxlbWVudCA9IGNoYW5nZXNTdW1tYXJ5O1xuXHRcdH1cblxuXHRcdGlmICh0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyICYmIHRoaXMub3B0aW9ucz8uZ2V0Um93QWN0aW9ucykge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5jbGVhcigpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5wdXNoKHRoaXMub3B0aW9ucy5nZXRSb3dBY3Rpb25zKGRhdGEpLCB7IGljb246IGZhbHNlLCBsYWJlbDogdHJ1ZSB9KTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJQ29sbGFwc2libGVDaGFuZ2VzU3VtbWFyeUxpc3RUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsU0FBUztBQUNsQixTQUFTLGlCQUFpQjtBQUcxQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0IsWUFBWSxpQkFBOEIsb0JBQW9CO0FBQzNGLFNBQVMsZUFBNEI7QUFDckMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMscUJBQXFCO0FBQzlCLFNBQXlCLHNCQUFzQjtBQUMvQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdEQUFnRDtBQUN6RCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLG1EQUFtRDtBQUM1RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLHVDQUF1QztBQUNoRCxTQUFTLGtDQUFrQztBQUUzQyxTQUFTLG9CQUFvQjtBQUc3QixNQUFNLGlDQUFpQztBQUN2QyxNQUFNLGtDQUFrQztBQW1CakMsU0FBUyw2QkFDZixXQUNBLE9BQ0Esc0JBQ0EsZUFDQSxzQkFDQSxTQUNjO0FBQ2QsUUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBQ2xDLFFBQU0sZUFBNEMsRUFBRSxZQUFZLEdBQUcsV0FBVyxFQUFFO0FBQ2hGLFFBQU0sT0FBTyxNQUFNLElBQUkscUJBQXFCLGVB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
