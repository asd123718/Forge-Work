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
import { ButtonWithIcon } from "../../../../../../base/browser/ui/button/button.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Event } from "../../../../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../../../../base/common/marshallingIds.js";
import { autorun, constObservable, isObservable } from "../../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { URI } from "../../../../../../base/common/uri.js";
import { localize } from "../../../../../../nls.js";
import { MenuWorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { FileKind } from "../../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { WorkbenchList } from "../../../../../../platform/list/browser/listService.js";
import { IThemeService } from "../../../../../../platform/theme/common/themeService.js";
import { ResourceLabels } from "../../../../../browser/labels.js";
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from "../../../../../services/editor/common/editorService.js";
import { createFileIconThemableTreeContainerScope } from "../../../../files/browser/views/explorerView.js";
import { MultiDiffEditorInput } from "../../../../multiDiffEditor/browser/multiDiffEditorInput.js";
import { MultiDiffEditorItem } from "../../../../multiDiffEditor/browser/multiDiffSourceResolverService.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { ChatEditingSnapshotTextModelContentProvider } from "../../chatEditing/chatEditingTextModelContentProviders.js";
import { ChatConfiguration } from "../../../common/constants.js";
import { getChatSessionType } from "../../../common/model/chatUri.js";
const $ = dom.$;
const ELEMENT_HEIGHT = 22;
const MAX_ITEMS_SHOWN = 6;
let ChatMultiDiffContentPart = class extends Disposable {
  constructor(content, _element, instantiationService, editorService, themeService, contextKeyService, configurationService) {
    super();
    this.content = content;
    this._element = _element;
    this.instantiationService = instantiationService;
    this.editorService = editorService;
    this.themeService = themeService;
    this.contextKeyService = contextKeyService;
    this.configurationService = configurationService;
    this.isCollapsed = false;
    this.readOnly = content.readOnly ?? false;
    this.diffData = isObservable(this.content.multiDiffData) ? this.content.multiDiffData.map((d) => d) : constObservable(this.content.multiDiffData);
    const headerDomNode = $(".checkpoint-file-changes-summary-header");
    this.domNode = $(".checkpoint-file-changes-summary", void 0, headerDomNode);
    this.domNode.tabIndex = 0;
    this.isCollapsed = content?.collapsed ?? false;
    this._register(this.renderHeader(headerDomNode));
    this._register(this.renderFilesList(this.domNode));
  }
  renderHeader(container) {
    const viewListButtonContainer = container.appendChild($(".chat-file-changes-label"));
    const viewListButton = new ButtonWithIcon(viewListButtonContainer, {});
    this._register(autorun((reader) => {
      const fileCount = this.diffData.read(reader).resources.length;
      viewListButton.label = fileCount === 1 ? localize("chatMultiDiff.oneFile", "Changed 1 file") : localize("chatMultiDiff.manyFiles", "Changed {0} files", fileCount);
    }));
    const setExpansionState = () => {
      viewListButton.icon = this.isCollapsed ? Codicon.chevronRight : Codicon.chevronDown;
      this.domNode.classList.toggle("chat-file-changes-collapsed", this.isCollapsed);
    };
    setExpansionState();
    const disposables = new DisposableStore();
    disposables.add(viewListButton);
    disposables.add(viewListButton.onDidClick(() => {
      this.isCollapsed = !this.isCollapsed;
      setExpansionState();
    }));
    if (!this.readOnly) {
      disposables.add(this.renderViewAllFileChangesButton(viewListButton.element));
    }
    disposables.add(this.renderContributedButtons(viewListButton.element));
    return toDisposable(() => disposables.dispose());
  }
  renderViewAllFileChangesButton(container) {
    const button = container.appendChild($(".chat-view-changes-icon"));
    button.classList.add(...ThemeIcon.asClassNameArray(Codicon.diffMultiple));
    button.title = localize("chatMultiDiff.openAllChanges", "Open Changes");
    return dom.addDisposableListener(button, "click", (e) => {
      const source = URI.parse(`multi-diff-editor:${(/* @__PURE__ */ new Date()).getMilliseconds().toString() + Math.random().toString()}`);
      const { title, resources } = this.diffData.get();
      const input = this.instantiationService.createInstance(
        MultiDiffEditorInput,
        source,
        title || "Multi-Diff",
        resources.map((resource) => new MultiDiffEditorItem(
          resource.originalUri,
          resource.modifiedUri,
          resource.goToFileUri
        )),
        false
      );
      const sideBySide = e.altKey;
      this.editorService.openEditor(input, sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
      dom.EventHelper.stop(e, true);
    });
  }
  renderContributedButtons(container) {
    const buttonsContainer = container.appendChild($(".chat-multidiff-contributed-buttons"));
    const disposables = new DisposableStore();
    const type = getChatSessionType(this._element.sessionResource);
    const overlay = this.contextKeyService.createOverlay([
      [ChatContextKeys.agentSessionType.key, type]
    ]);
    const nestedInsta = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, overlay])));
    const marshalledUri = {
      ...this._element.sessionResource,
      $mid: MarshalledId.Uri
    };
    disposables.add(nestedInsta.createInstance(
      MenuWorkbenchToolBar,
      buttonsContainer,
      MenuId.ChatMultiDiffContext,
      {
        menuOptions: {
          arg: marshalledUri,
          shouldForwardArgs: true
        },
        toolbarOptions: {
          primaryGroup: () => true
        }
      }
    ));
    return disposables;
  }
  renderFilesList(container) {
    const store = new DisposableStore();
    const listContainer = container.appendChild($(".chat-summary-list"));
    store.add(createFileIconThemableTreeContainerScope(listContainer, this.themeService));
    const resourceLabels = store.add(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: Event.None }));
    this.list = store.add(this.instantiationService.createInstance(
      WorkbenchList,
      "ChatMultiDiffList",
      listContainer,
      new ChatMultiDiffListDelegate(),
      [this.instantiationService.createInstance(ChatMultiDiffListRenderer, resourceLabels)],
      {
        identityProvider: {
          getId: (element) => element.uri.toString()
        },
        setRowLineHeight: true,
        horizontalScrolling: false,
        supportDynamicHeights: false,
        mouseSupport: !this.readOnly,
        alwaysConsumeMouseWheel: false,
        accessibilityProvider: {
          getAriaLabel: (element) => element.uri.path,
          getWidgetAriaLabel: () => localize("chatMultiDiffList", "File Changes")
        }
      }
    ));
    this._register(autorun((reader) => {
      const { resources } = this.diffData.read(reader);
      const items = [];
      for (const resource of resources) {
        const uri = resource.modifiedUri || resource.originalUri || resource.goToFileUri;
        if (!uri) {
          continue;
        }
        const item = { uri };
        if (resource.originalUri && resource.modifiedUri) {
          item.diff = {
            originalURI: resource.originalUri,
            modifiedURI: resource.modifiedUri,
            isFinal: true,
            quitEarly: false,
            identical: false,
            added: resource.added || 0,
            removed: resource.removed || 0,
            isBusy: false
          };
        }
        items.push(item);
      }
      this.list.splice(0, this.list.length, items);
      const height = Math.min(items.length, MAX_ITEMS_SHOWN) * ELEMENT_HEIGHT;
      this.list.layout(height);
      listContainer.style.height = `${height}px`;
    }));
    if (!this.readOnly) {
      store.add(this.list.onDidOpen((e) => {
        if (!e.element) {
          return;
        }
        const altKey = (dom.isMouseEvent(e.browserEvent) || dom.isKeyboardEvent(e.browserEvent)) && e.browserEvent.altKey;
        const openInDiffEditorByDefault = this.configurationService.getValue(ChatConfiguration.OpenChangedFileInDiffEditor);
        const openInDiffEditor = altKey ? !openInDiffEditorByDefault : openInDiffEditorByDefault;
        if (e.element.diff && !openInDiffEditor) {
          const fileURI = ChatEditingSnapshotTextModelContentProvider.getOriginalFileURI(e.element.diff.modifiedURI);
          if (fileURI) {
            this.editorService.openEditor({ resource: fileURI, options: { preserveFocus: true } });
            return;
          }
        }
        if (e.element.diff) {
          this.editorService.openEditor({
            original: { resource: e.element.diff.originalURI },
            modified: { resource: e.element.diff.modifiedURI },
            options: { preserveFocus: true }
          });
        } else {
          const fileURI = ChatEditingSnapshotTextModelContentProvider.getOriginalFileURI(e.element.uri) ?? e.element.uri;
          this.editorService.openEditor({
            resource: fileURI,
            options: { preserveFocus: true }
          });
        }
      }));
    }
    return store;
  }
  hasSameContent(other) {
    return other.kind === "multiDiffData" && this.diffData.get().resources.length === (isObservable(other.multiDiffData) ? other.multiDiffData.get().resources.length : other.multiDiffData.resources.length);
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
};
ChatMultiDiffContentPart = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IConfigurationService)
], ChatMultiDiffContentPart);
class ChatMultiDiffListDelegate {
  getHeight() {
    return 22;
  }
  getTemplateId() {
    return "chatMultiDiffItem";
  }
}
const _ChatMultiDiffListRenderer = class _ChatMultiDiffListRenderer {
  constructor(labels) {
    this.labels = labels;
    this.templateId = _ChatMultiDiffListRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const label = this.labels.create(container, { supportHighlights: true, supportIcons: true });
    return {
      label,
      dispose: () => label.dispose()
    };
  }
  renderElement(element, _index, templateData) {
    templateData.label.setFile(element.uri, {
      fileKind: FileKind.FILE,
      title: element.uri.path
    });
    const labelElement = templateData.label.element;
    templateData.changesElement?.remove();
    if (element.diff?.added || element.diff?.removed) {
      const changesSummary = labelElement.appendChild($(`.${_ChatMultiDiffListRenderer.CHANGES_SUMMARY_CLASS_NAME}`));
      const addedElement = changesSummary.appendChild($(".insertions"));
      addedElement.textContent = `+${element.diff.added}`;
      const removedElement = changesSummary.appendChild($(".deletions"));
      removedElement.textContent = `-${element.diff.removed}`;
      changesSummary.setAttribute("aria-label", localize("chatEditingSession.fileCounts", "{0} lines added, {1} lines removed", element.diff.added, element.diff.removed));
      templateData.changesElement = changesSummary;
    }
  }
  disposeTemplate(templateData) {
    templateData.dispose();
  }
};
_ChatMultiDiffListRenderer.TEMPLATE_ID = "chatMultiDiffItem";
_ChatMultiDiffListRenderer.CHANGES_SUMMARY_CLASS_NAME = "insertions-and-deletions";
let ChatMultiDiffListRenderer = _ChatMultiDiffListRenderer;
export {
  ChatMultiDiffContentPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdE11bHRpRGlmZkNvbnRlbnRQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQnV0dG9uV2l0aEljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBJTGlzdFJlbmRlcmVyLCBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGNvbnN0T2JzZXJ2YWJsZSwgSU9ic2VydmFibGUsIGlzT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEZpbGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZXNvdXJjZUxhYmVsLCBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IEFDVElWRV9HUk9VUCwgSUVkaXRvclNlcnZpY2UsIFNJREVfR1JPVVAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlRmlsZUljb25UaGVtYWJsZVRyZWVDb250YWluZXJTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL2ZpbGVzL2Jyb3dzZXIvdmlld3MvZXhwbG9yZXJWaWV3LmpzJztcbmltcG9ydCB7IE11bHRpRGlmZkVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vbXVsdGlEaWZmRWRpdG9yL2Jyb3dzZXIvbXVsdGlEaWZmRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgTXVsdGlEaWZmRWRpdG9ySXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL211bHRpRGlmZkVkaXRvci9icm93c2VyL211bHRpRGlmZlNvdXJjZVJlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUVkaXRTZXNzaW9uRW50cnlEaWZmIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nU25hcHNob3RUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIgfSBmcm9tICcuLi8uLi9jaGF0RWRpdGluZy9jaGF0RWRpdGluZ1RleHRNb2RlbENvbnRlbnRQcm92aWRlcnMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElDaGF0TXVsdGlEaWZmRGF0YSwgSUNoYXRNdWx0aURpZmZEYXRhU2VyaWFsaXplZCwgSUNoYXRNdWx0aURpZmZJbm5lckRhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgSUNoYXRSZW5kZXJlckNvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0VHJlZUl0ZW0gfSBmcm9tICcuLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbmludGVyZmFjZSBJQ2hhdE11bHRpRGlmZkl0ZW0ge1xuXHR1cmk6IFVSSTtcblx0ZGlmZj86IElFZGl0U2Vzc2lvbkVudHJ5RGlmZjtcbn1cblxuY29uc3QgRUxFTUVOVF9IRUlHSFQgPSAyMjtcbmNvbnN0IE1BWF9JVEVNU19TSE9XTiA9IDY7XG5cbmV4cG9ydCBjbGFzcyBDaGF0TXVsdGlEaWZmQ29udGVudFBhcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYXRDb250ZW50UGFydCB7XG5cdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIGxpc3QhOiBXb3JrYmVuY2hMaXN0PElDaGF0TXVsdGlEaWZmSXRlbT47XG5cdHByaXZhdGUgaXNDb2xsYXBzZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSByZWFkT25seTogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBkaWZmRGF0YTogSU9ic2VydmFibGU8SUNoYXRNdWx0aURpZmZJbm5lckRhdGE+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGVudDogSUNoYXRNdWx0aURpZmZEYXRhIHwgSUNoYXRNdWx0aURpZmZEYXRhU2VyaWFsaXplZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lbGVtZW50OiBDaGF0VHJlZUl0ZW0sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnJlYWRPbmx5ID0gY29udGVudC5yZWFkT25seSA/PyBmYWxzZTtcblx0XHR0aGlzLmRpZmZEYXRhID0gaXNPYnNlcnZhYmxlKHRoaXMuY29udGVudC5tdWx0aURpZmZEYXRhKVxuXHRcdFx0PyB0aGlzLmNvbnRlbnQubXVsdGlEaWZmRGF0YS5tYXAoZCA9PiBkKVxuXHRcdFx0OiBjb25zdE9ic2VydmFibGUodGhpcy5jb250ZW50Lm11bHRpRGlmZkRhdGEpO1xuXG5cdFx0Y29uc3QgaGVhZGVyRG9tTm9kZSA9ICQoJy5jaGVja3BvaW50LWZpbGUtY2hhbmdlcy1zdW1tYXJ5LWhlYWRlcicpO1xuXHRcdHRoaXMuZG9tTm9kZSA9ICQoJy5jaGVja3BvaW50LWZpbGUtY2hhbmdlcy1zdW1tYXJ5JywgdW5kZWZpbmVkLCBoZWFkZXJEb21Ob2RlKTtcblx0XHR0aGlzLmRvbU5vZGUudGFiSW5kZXggPSAwO1xuXHRcdHRoaXMuaXNDb2xsYXBzZWQgPSBjb250ZW50Py5jb2xsYXBzZWQgPz8gZmFsc2U7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlbmRlckhlYWRlcihoZWFkZXJEb21Ob2RlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5yZW5kZXJGaWxlc0xpc3QodGhpcy5kb21Ob2RlKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckhlYWRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHZpZXdMaXN0QnV0dG9uQ29udGFpbmVyID0gY29udGFpbmVyLmFwcGVuZENoaWxkKCQoJy5jaGF0LWZpbGUtY2hhbmdlcy1sYWJlbCcpKTtcblx0XHRjb25zdCB2aWV3TGlzdEJ1dHRvbiA9IG5ldyBCdXR0b25XaXRoSWNvbih2aWV3TGlzdEJ1dHRvbkNvbnRhaW5lciwge30pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGZpbGVDb3VudCA9IHRoaXMuZGlmZkRhdGEucmVhZChyZWFkZXIpLnJlc291cmNlcy5sZW5ndGg7XG5cdFx0XHR2aWV3TGlzdEJ1dHRvbi5sYWJlbCA9IGZpbGVDb3VudCA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0TXVsdGlEaWZmLm9uZUZpbGUnLCAnQ2hhbmdlZCAxIGZpbGUnKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0TXVsdGlEaWZmLm1hbnlGaWxlcycsICdDaGFuZ2VkIHswfSBmaWxlcycsIGZpbGVDb3VudCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc2V0RXhwYW5zaW9uU3RhdGUgPSAoKSA9PiB7XG5cdFx0XHR2aWV3TGlzdEJ1dHRvbi5pY29uID0gdGhpcy5pc0NvbGxhcHNlZCA/IENvZGljb24uY2hldnJvblJpZ2h0IDogQ29kaWNvbi5jaGV2cm9uRG93bjtcblx0XHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LWZpbGUtY2hhbmdlcy1jb2xsYXBzZWQnLCB0aGlzLmlzQ29sbGFwc2VkKTtcblx0XHR9O1xuXHRcdHNldEV4cGFuc2lvblN0YXRlKCk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodmlld0xpc3RCdXR0b24pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh2aWV3TGlzdEJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdHRoaXMuaXNDb2xsYXBzZWQgPSAhdGhpcy5pc0NvbGxhcHNlZDtcblx0XHRcdHNldEV4cGFuc2lvblN0YXRlKCk7XG5cdFx0fSkpO1xuXHRcdGlmICghdGhpcy5yZWFkT25seSkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMucmVuZGVyVmlld0FsbEZpbGVDaGFuZ2VzQnV0dG9uKHZpZXdMaXN0QnV0dG9uLmVsZW1lbnQpKTtcblx0XHR9XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMucmVuZGVyQ29udHJpYnV0ZWRCdXR0b25zKHZpZXdMaXN0QnV0dG9uLmVsZW1lbnQpKTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclZpZXdBbGxGaWxlQ2hhbmdlc0J1dHRvbihjb250YWluZXI6IEhUTUxFbGVtZW50KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGJ1dHRvbiA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCcuY2hhdC12aWV3LWNoYW5nZXMtaWNvbicpKTtcblx0XHRidXR0b24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmRpZmZNdWx0aXBsZSkpO1xuXHRcdGJ1dHRvbi50aXRsZSA9IGxvY2FsaXplKCdjaGF0TXVsdGlEaWZmLm9wZW5BbGxDaGFuZ2VzJywgJ09wZW4gQ2hhbmdlcycpO1xuXG5cdFx0cmV0dXJuIGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYnV0dG9uLCAnY2xpY2snLCAoZSkgPT4ge1xuXHRcdFx0Y29uc3Qgc291cmNlID0gVVJJLnBhcnNlKGBtdWx0aS1kaWZmLWVkaXRvcjoke25ldyBEYXRlKCkuZ2V0TWlsbGlzZWNvbmRzKCkudG9TdHJpbmcoKSArIE1hdGgucmFuZG9tKCkudG9TdHJpbmcoKX1gKTtcblx0XHRcdGNvbnN0IHsgdGl0bGUsIHJlc291cmNlcyB9ID0gdGhpcy5kaWZmRGF0YS5nZXQoKTtcblx0XHRcdGNvbnN0IGlucHV0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0TXVsdGlEaWZmRWRpdG9ySW5wdXQsXG5cdFx0XHRcdHNvdXJjZSxcblx0XHRcdFx0dGl0bGUgfHwgJ011bHRpLURpZmYnLFxuXHRcdFx0XHRyZXNvdXJjZXMubWFwKHJlc291cmNlID0+IG5ldyBNdWx0aURpZmZFZGl0b3JJdGVtKFxuXHRcdFx0XHRcdHJlc291cmNlLm9yaWdpbmFsVXJpLFxuXHRcdFx0XHRcdHJlc291cmNlLm1vZGlmaWVkVXJpLFxuXHRcdFx0XHRcdHJlc291cmNlLmdvVG9GaWxlVXJpXG5cdFx0XHRcdCkpLFxuXHRcdFx0XHRmYWxzZVxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHNpZGVCeVNpZGUgPSBlLmFsdEtleTtcblx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGlucHV0LCBzaWRlQnlTaWRlID8gU0lERV9HUk9VUCA6IEFDVElWRV9HUk9VUCk7XG5cdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ29udHJpYnV0ZWRCdXR0b25zKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgYnV0dG9uc0NvbnRhaW5lciA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCcuY2hhdC1tdWx0aWRpZmYtY29udHJpYnV0ZWQtYnV0dG9ucycpKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IHR5cGUgPSBnZXRDaGF0U2Vzc2lvblR5cGUodGhpcy5fZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IG92ZXJsYXkgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkoW1xuXHRcdFx0W0NoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25UeXBlLmtleSwgdHlwZV1cblx0XHRdKTtcblx0XHRjb25zdCBuZXN0ZWRJbnN0YSA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCBvdmVybGF5XSkpKTtcblxuXHRcdGNvbnN0IG1hcnNoYWxsZWRVcmkgPSB7XG5cdFx0XHQuLi50aGlzLl9lbGVtZW50LnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5Vcmlcblx0XHR9O1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG5lc3RlZEluc3RhLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0TWVudVdvcmtiZW5jaFRvb2xCYXIsXG5cdFx0XHRidXR0b25zQ29udGFpbmVyLFxuXHRcdFx0TWVudUlkLkNoYXRNdWx0aURpZmZDb250ZXh0LFxuXHRcdFx0e1xuXHRcdFx0XHRtZW51T3B0aW9uczoge1xuXHRcdFx0XHRcdGFyZzogbWFyc2hhbGxlZFVyaSxcblx0XHRcdFx0XHRzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0dG9vbGJhck9wdGlvbnM6IHtcblx0XHRcdFx0XHRwcmltYXJ5R3JvdXA6ICgpID0+IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0KSk7XG5cblx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckZpbGVzTGlzdChjb250YWluZXI6IEhUTUxFbGVtZW50KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgbGlzdENvbnRhaW5lciA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCcuY2hhdC1zdW1tYXJ5LWxpc3QnKSk7XG5cdFx0c3RvcmUuYWRkKGNyZWF0ZUZpbGVJY29uVGhlbWFibGVUcmVlQ29udGFpbmVyU2NvcGUobGlzdENvbnRhaW5lciwgdGhpcy50aGVtZVNlcnZpY2UpKTtcblx0XHRjb25zdCByZXNvdXJjZUxhYmVscyA9IHN0b3JlLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlTGFiZWxzLCB7IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogRXZlbnQuTm9uZSB9KSk7XG5cblx0XHR0aGlzLmxpc3QgPSBzdG9yZS5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdvcmtiZW5jaExpc3Q8SUNoYXRNdWx0aURpZmZJdGVtPixcblx0XHRcdCdDaGF0TXVsdGlEaWZmTGlzdCcsXG5cdFx0XHRsaXN0Q29udGFpbmVyLFxuXHRcdFx0bmV3IENoYXRNdWx0aURpZmZMaXN0RGVsZWdhdGUoKSxcblx0XHRcdFt0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNdWx0aURpZmZMaXN0UmVuZGVyZXIsIHJlc291cmNlTGFiZWxzKV0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRJZDogKGVsZW1lbnQ6IElDaGF0TXVsdGlEaWZmSXRlbSkgPT4gZWxlbWVudC51cmkudG9TdHJpbmcoKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRzZXRSb3dMaW5lSGVpZ2h0OiB0cnVlLFxuXHRcdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSxcblx0XHRcdFx0c3VwcG9ydER5bmFtaWNIZWlnaHRzOiBmYWxzZSxcblx0XHRcdFx0bW91c2VTdXBwb3J0OiAhdGhpcy5yZWFkT25seSxcblx0XHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IGZhbHNlLFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRBcmlhTGFiZWw6IChlbGVtZW50OiBJQ2hhdE11bHRpRGlmZkl0ZW0pID0+IGVsZW1lbnQudXJpLnBhdGgsXG5cdFx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsOiAoKSA9PiBsb2NhbGl6ZSgnY2hhdE11bHRpRGlmZkxpc3QnLCBcIkZpbGUgQ2hhbmdlc1wiKVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCB7IHJlc291cmNlcyB9ID0gdGhpcy5kaWZmRGF0YS5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGNvbnN0IGl0ZW1zOiBJQ2hhdE11bHRpRGlmZkl0ZW1bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiByZXNvdXJjZXMpIHtcblx0XHRcdFx0Y29uc3QgdXJpID0gcmVzb3VyY2UubW9kaWZpZWRVcmkgfHwgcmVzb3VyY2Uub3JpZ2luYWxVcmkgfHwgcmVzb3VyY2UuZ29Ub0ZpbGVVcmk7XG5cdFx0XHRcdGlmICghdXJpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBpdGVtOiBJQ2hhdE11bHRpRGlmZkl0ZW0gPSB7IHVyaSB9O1xuXG5cdFx0XHRcdGlmIChyZXNvdXJjZS5vcmlnaW5hbFVyaSAmJiByZXNvdXJjZS5tb2RpZmllZFVyaSkge1xuXHRcdFx0XHRcdGl0ZW0uZGlmZiA9IHtcblx0XHRcdFx0XHRcdG9yaWdpbmFsVVJJOiByZXNvdXJjZS5vcmlnaW5hbFVyaSxcblx0XHRcdFx0XHRcdG1vZGlmaWVkVVJJOiByZXNvdXJjZS5tb2RpZmllZFVyaSxcblx0XHRcdFx0XHRcdGlzRmluYWw6IHRydWUsXG5cdFx0XHRcdFx0XHRxdWl0RWFybHk6IGZhbHNlLFxuXHRcdFx0XHRcdFx0aWRlbnRpY2FsOiBmYWxzZSxcblx0XHRcdFx0XHRcdGFkZGVkOiByZXNvdXJjZS5hZGRlZCB8fCAwLFxuXHRcdFx0XHRcdFx0cmVtb3ZlZDogcmVzb3VyY2UucmVtb3ZlZCB8fCAwLFxuXHRcdFx0XHRcdFx0aXNCdXN5OiBmYWxzZSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGl0ZW1zLnB1c2goaXRlbSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMubGlzdC5zcGxpY2UoMCwgdGhpcy5saXN0Lmxlbmd0aCwgaXRlbXMpO1xuXG5cdFx0XHRjb25zdCBoZWlnaHQgPSBNYXRoLm1pbihpdGVtcy5sZW5ndGgsIE1BWF9JVEVNU19TSE9XTikgKiBFTEVNRU5UX0hFSUdIVDtcblx0XHRcdHRoaXMubGlzdC5sYXlvdXQoaGVpZ2h0KTtcblx0XHRcdGxpc3RDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblx0XHR9KSk7XG5cblxuXHRcdGlmICghdGhpcy5yZWFkT25seSkge1xuXHRcdFx0c3RvcmUuYWRkKHRoaXMubGlzdC5vbkRpZE9wZW4oKGUpID0+IHtcblx0XHRcdFx0aWYgKCFlLmVsZW1lbnQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBhbHRLZXkgPSAoZG9tLmlzTW91c2VFdmVudChlLmJyb3dzZXJFdmVudCkgfHwgZG9tLmlzS2V5Ym9hcmRFdmVudChlLmJyb3dzZXJFdmVudCkpICYmIGUuYnJvd3NlckV2ZW50LmFsdEtleTtcblx0XHRcdFx0Y29uc3Qgb3BlbkluRGlmZkVkaXRvckJ5RGVmYXVsdCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uT3BlbkNoYW5nZWRGaWxlSW5EaWZmRWRpdG9yKTtcblx0XHRcdFx0Y29uc3Qgb3BlbkluRGlmZkVkaXRvciA9IGFsdEtleSA/ICFvcGVuSW5EaWZmRWRpdG9yQnlEZWZhdWx0IDogb3BlbkluRGlmZkVkaXRvckJ5RGVmYXVsdDtcblxuXHRcdFx0XHRpZiAoZS5lbGVtZW50LmRpZmYgJiYgIW9wZW5JbkRpZmZFZGl0b3IpIHtcblx0XHRcdFx0XHRjb25zdCBmaWxlVVJJID0gQ2hhdEVkaXRpbmdTbmFwc2hvdFRleHRNb2RlbENvbnRlbnRQcm92aWRlci5nZXRPcmlnaW5hbEZpbGVVUkkoZS5lbGVtZW50LmRpZmYubW9kaWZpZWRVUkkpO1xuXHRcdFx0XHRcdGlmIChmaWxlVVJJKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBmaWxlVVJJLCBvcHRpb25zOiB7IHByZXNlcnZlRm9jdXM6IHRydWUgfSB9KTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gVGhlIGZpbGUncyBvcmlnaW4gY2Fubm90IGJlIHJlY292ZXJlZCAoZS5nLiBsZWdhY3kgc25hcHNob3QgVVJJcyk6XG5cdFx0XHRcdFx0Ly8gZmFsbCBiYWNrIHRvIHRoZSBkaWZmIGVkaXRvci5cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChlLmVsZW1lbnQuZGlmZikge1xuXHRcdFx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBlLmVsZW1lbnQuZGlmZi5vcmlnaW5hbFVSSSB9LFxuXHRcdFx0XHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IGUuZWxlbWVudC5kaWZmLm1vZGlmaWVkVVJJIH0sXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7IHByZXNlcnZlRm9jdXM6IHRydWUgfVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGZpbGVVUkkgPSBDaGF0RWRpdGluZ1NuYXBzaG90VGV4dE1vZGVsQ29udGVudFByb3ZpZGVyLmdldE9yaWdpbmFsRmlsZVVSSShlLmVsZW1lbnQudXJpKSA/PyBlLmVsZW1lbnQudXJpO1xuXHRcdFx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRcdHJlc291cmNlOiBmaWxlVVJJLFxuXHRcdFx0XHRcdFx0b3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlIH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdG9yZTtcblx0fVxuXG5cdGhhc1NhbWVDb250ZW50KG90aGVyOiBJQ2hhdFJlbmRlcmVyQ29udGVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBvdGhlci5raW5kID09PSAnbXVsdGlEaWZmRGF0YScgJiYgdGhpcy5kaWZmRGF0YS5nZXQoKS5yZXNvdXJjZXMubGVuZ3RoID09PSAoaXNPYnNlcnZhYmxlKG90aGVyLm11bHRpRGlmZkRhdGEpID8gb3RoZXIubXVsdGlEaWZmRGF0YS5nZXQoKS5yZXNvdXJjZXMubGVuZ3RoIDogb3RoZXIubXVsdGlEaWZmRGF0YS5yZXNvdXJjZXMubGVuZ3RoKTtcblx0fVxuXG5cdGFkZERpc3Bvc2FibGUoZGlzcG9zYWJsZTogSURpc3Bvc2FibGUpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihkaXNwb3NhYmxlKTtcblx0fVxufVxuXG5jbGFzcyBDaGF0TXVsdGlEaWZmTGlzdERlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8SUNoYXRNdWx0aURpZmZJdGVtPiB7XG5cdGdldEhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiAyMjtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJ2NoYXRNdWx0aURpZmZJdGVtJztcblx0fVxufVxuXG5pbnRlcmZhY2UgSUNoYXRNdWx0aURpZmZJdGVtVGVtcGxhdGUgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IGxhYmVsOiBJUmVzb3VyY2VMYWJlbDtcblx0Y2hhbmdlc0VsZW1lbnQ/OiBIVE1MRWxlbWVudDtcbn1cblxuY2xhc3MgQ2hhdE11bHRpRGlmZkxpc3RSZW5kZXJlciBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8SUNoYXRNdWx0aURpZmZJdGVtLCBJQ2hhdE11bHRpRGlmZkl0ZW1UZW1wbGF0ZT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnY2hhdE11bHRpRGlmZkl0ZW0nO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ0hBTkdFU19TVU1NQVJZX0NMQVNTX05BTUUgPSAnaW5zZXJ0aW9ucy1hbmQtZGVsZXRpb25zJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBDaGF0TXVsdGlEaWZmTGlzdFJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgbGFiZWxzOiBSZXNvdXJjZUxhYmVscykgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElDaGF0TXVsdGlEaWZmSXRlbVRlbXBsYXRlIHtcblx0XHRjb25zdCBsYWJlbCA9IHRoaXMubGFiZWxzLmNyZWF0ZShjb250YWluZXIsIHsgc3VwcG9ydEhpZ2hsaWdodHM6IHRydWUsIHN1cHBvcnRJY29uczogdHJ1ZSB9KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRsYWJlbCxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IGxhYmVsLmRpc3Bvc2UoKVxuXHRcdH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElDaGF0TXVsdGlEaWZmSXRlbSwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUNoYXRNdWx0aURpZmZJdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0RmlsZShlbGVtZW50LnVyaSwge1xuXHRcdFx0ZmlsZUtpbmQ6IEZpbGVLaW5kLkZJTEUsXG5cdFx0XHR0aXRsZTogZWxlbWVudC51cmkucGF0aFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbGFiZWxFbGVtZW50ID0gdGVtcGxhdGVEYXRhLmxhYmVsLmVsZW1lbnQ7XG5cdFx0dGVtcGxhdGVEYXRhLmNoYW5nZXNFbGVtZW50Py5yZW1vdmUoKTtcblxuXHRcdGlmIChlbGVtZW50LmRpZmY/LmFkZGVkIHx8IGVsZW1lbnQuZGlmZj8ucmVtb3ZlZCkge1xuXHRcdFx0Y29uc3QgY2hhbmdlc1N1bW1hcnkgPSBsYWJlbEVsZW1lbnQuYXBwZW5kQ2hpbGQoJChgLiR7Q2hhdE11bHRpRGlmZkxpc3RSZW5kZXJlci5DSEFOR0VTX1NVTU1BUllfQ0xBU1NfTkFNRX1gKSk7XG5cblx0XHRcdGNvbnN0IGFkZGVkRWxlbWVudCA9IGNoYW5nZXNTdW1tYXJ5LmFwcGVuZENoaWxkKCQoJy5pbnNlcnRpb25zJykpO1xuXHRcdFx0YWRkZWRFbGVtZW50LnRleHRDb250ZW50ID0gYCske2VsZW1lbnQuZGlmZi5hZGRlZH1gO1xuXG5cdFx0XHRjb25zdCByZW1vdmVkRWxlbWVudCA9IGNoYW5nZXNTdW1tYXJ5LmFwcGVuZENoaWxkKCQoJy5kZWxldGlvbnMnKSk7XG5cdFx0XHRyZW1vdmVkRWxlbWVudC50ZXh0Q29udGVudCA9IGAtJHtlbGVtZW50LmRpZmYucmVtb3ZlZH1gO1xuXG5cdFx0XHRjaGFuZ2VzU3VtbWFyeS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnY2hhdEVkaXRpbmdTZXNzaW9uLmZpbGVDb3VudHMnLCAnezB9IGxpbmVzIGFkZGVkLCB7MX0gbGluZXMgcmVtb3ZlZCcsIGVsZW1lbnQuZGlmZi5hZGRlZCwgZWxlbWVudC5kaWZmLnJlbW92ZWQpKTtcblxuXHRcdFx0dGVtcGxhdGVEYXRhLmNoYW5nZXNFbGVtZW50ID0gY2hhbmdlc1N1bW1hcnk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUNoYXRNdWx0aURpZmZJdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLHNCQUFzQjtBQUUvQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBWSxpQkFBOEIsb0JBQW9CO0FBQ3ZFLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsU0FBUyxpQkFBOEIsb0JBQW9CO0FBQ3BFLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGNBQWM7QUFDdkIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUI7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
