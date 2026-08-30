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
import "./media/sessionFilesWidget.css";
import * as dom from "../../../../base/browser/dom.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { Gesture, EventType as TouchEventType } from "../../../../base/browser/touch.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { toAction } from "../../../../base/common/actions.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { basename } from "../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { WorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { FileKind, IFileService } from "../../../../platform/files/common/files.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { WorkbenchList } from "../../../../platform/list/browser/listService.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from "../../../../workbench/browser/labels.js";
import { createFileIconThemableTreeContainerScope } from "../../../../workbench/contrib/files/browser/views/explorerView.js";
import { ACTIVE_GROUP, IEditorService } from "../../../../workbench/services/editor/common/editorService.js";
import { SessionFileOperation } from "../../../services/sessions/common/session.js";
const $ = dom.$;
const _SessionFileListDelegate = class _SessionFileListDelegate {
  getHeight(_element) {
    return _SessionFileListDelegate.ITEM_HEIGHT;
  }
  getTemplateId(_element) {
    return SessionFileListRenderer.TEMPLATE_ID;
  }
};
_SessionFileListDelegate.ITEM_HEIGHT = 22;
let SessionFileListDelegate = _SessionFileListDelegate;
let SessionFileListRenderer = class {
  constructor(_labels, _onOpenFile, _labelService, _instantiationService) {
    this._labels = _labels;
    this._onOpenFile = _onOpenFile;
    this._labelService = _labelService;
    this._instantiationService = _instantiationService;
    this.templateId = SessionFileListRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const templateDisposables = new DisposableStore();
    const row = dom.append(container, $(".session-files-widget-file"));
    const label = templateDisposables.add(this._labels.create(row));
    const actionBarContainer = $(".chat-collapsible-list-action-bar");
    const toolbar = templateDisposables.add(this._instantiationService.createInstance(WorkbenchToolBar, actionBarContainer, void 0));
    label.element.appendChild(actionBarContainer);
    return { label, toolbar, templateDisposables };
  }
  renderElement(element, _index, templateData) {
    templateData.label.setResource({
      resource: element.uri,
      name: basename(element.uri)
    }, {
      fileKind: FileKind.FILE,
      fileDecorations: void 0,
      strikethrough: element.operation === SessionFileOperation.Deleted,
      title: getSessionFileTitle(element, this._labelService)
    });
    templateData.toolbar.setActions([toAction({
      id: "sessionFiles.openFile",
      label: localize("sessionFiles.openFileAction", "Open File"),
      class: ThemeIcon.asClassName(Codicon.goToFile),
      run: () => this._onOpenFile(element)
    })]);
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
SessionFileListRenderer.TEMPLATE_ID = "sessionFile";
SessionFileListRenderer = __decorateClass([
  __decorateParam(2, ILabelService),
  __decorateParam(3, IInstantiationService)
], SessionFileListRenderer);
let SessionFilesWidget = class extends Disposable {
  constructor(container, _instantiationService, _labelService, _editorService, _hoverService, _fileService, _themeService) {
    super();
    this._instantiationService = _instantiationService;
    this._labelService = _labelService;
    this._editorService = _editorService;
    this._hoverService = _hoverService;
    this._fileService = _fileService;
    this._themeService = _themeService;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this._onDidToggleCollapsed = this._register(new Emitter());
    this.onDidToggleCollapsed = this._onDidToggleCollapsed.event;
    this._fileCount = 0;
    this._collapsed = false;
    this._labels = this._register(this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
    this._domNode = dom.append(container, $(".session-files-widget"));
    this._domNode.style.display = "none";
    this._register(createFileIconThemableTreeContainerScope(this._domNode, this._themeService));
    this._headerNode = dom.append(this._domNode, $(".session-files-widget-header"));
    this._titleNode = dom.append(this._headerNode, $(".session-files-widget-title"));
    this._titleLabelNode = dom.append(this._titleNode, $(".session-files-widget-title-label"));
    this._titleLabelNode.textContent = localize("sessionFiles.label", "Other Files");
    this._countNode = dom.append(this._headerNode, $(".session-files-widget-count.hidden"));
    this._chevronNode = dom.append(this._headerNode, $(".group-chevron"));
    this._chevronNode.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));
    this._headerNode.setAttribute("role", "button");
    this._headerNode.setAttribute("aria-label", localize("sessionFiles.toggle", "Toggle Other Files"));
    this._headerNode.setAttribute("aria-expanded", "true");
    this._headerNode.tabIndex = 0;
    this._register(this._hoverService.setupManagedHover(
      getDefaultHoverDelegate("mouse"),
      this._headerNode,
      localize("sessionFiles.hover", "Files created, edited, or deleted outside the workspace during this session. These files are not part of the workspace and won't be committed.")
    ));
    this._register(Gesture.addTarget(this._headerNode));
    for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
      this._register(dom.addDisposableListener(this._headerNode, eventType, () => {
        this._toggleCollapsed();
      }));
    }
    this._register(dom.addDisposableListener(this._headerNode, dom.EventType.KEY_DOWN, (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target === this._headerNode) {
        e.preventDefault();
        this._toggleCollapsed();
      }
    }));
    const bodyId = "session-files-widget-body";
    this._bodyNode = dom.append(this._domNode, $(`.${bodyId}`));
    this._bodyNode.id = bodyId;
    this._headerNode.setAttribute("aria-controls", bodyId);
    const listContainer = $(".session-files-widget-list");
    this._list = this._register(this._instantiationService.createInstance(
      WorkbenchList,
      "SessionFilesWidget",
      listContainer,
      new SessionFileListDelegate(),
      [this._instantiationService.createInstance(SessionFileListRenderer, this._labels, (file) => this._openFilePlain(file))],
      {
        multipleSelectionSupport: false,
        openOnSingleClick: true,
        accessibilityProvider: {
          getWidgetAriaLabel: () => localize("sessionFiles.listAriaLabel", "Other Files"),
          getAriaLabel: (item) => localize("sessionFiles.fileAriaLabel", "{0}, {1}", basename(item.uri), getSessionFileOperationLabel(item.operation))
        },
        keyboardNavigationLabelProvider: {
          getKeyboardNavigationLabel: (item) => basename(item.uri)
        }
      }
    ));
    this._bodyNode.appendChild(listContainer);
    this._register(this._list.onDidOpen((e) => {
      if (e.element) {
        void this._openFile(e.element, !!e.editorOptions?.preserveFocus, !!e.editorOptions?.pinned);
      }
    }));
  }
  get element() {
    return this._domNode;
  }
  /** The full content height the widget would like (header + all files). */
  get desiredHeight() {
    if (this._fileCount === 0) {
      return 0;
    }
    if (this._collapsed) {
      return SessionFilesWidget.HEADER_HEIGHT;
    }
    return SessionFilesWidget.HEADER_HEIGHT + this._fileCount * SessionFileListDelegate.ITEM_HEIGHT;
  }
  /** Whether the widget is currently visible (has files to show). */
  get visible() {
    return this._fileCount > 0;
  }
  /** Whether the body is collapsed (header-only). */
  get collapsed() {
    return this._collapsed;
  }
  setInput(input) {
    return autorun((reader) => {
      const files = input.sessionFilesObs.read(reader);
      const oldCount = this._fileCount;
      this._fileCount = files.length;
      if (files.length === 0) {
        this._renderBody([]);
        this._domNode.style.display = "none";
        if (oldCount !== 0) {
          this._onDidChangeHeight.fire();
        }
        return;
      }
      this._domNode.style.display = "";
      this._renderBody(files);
      this._renderCount();
      if (this._fileCount !== oldCount) {
        this._onDidChangeHeight.fire();
      }
    });
  }
  /**
   * Layout the widget body list to the given height.
   * Called by the parent view after computing available space.
   */
  layout(height) {
    if (this._collapsed) {
      this._bodyNode.style.display = "none";
      return;
    }
    this._bodyNode.style.display = "";
    this._list.layout(height);
  }
  _toggleCollapsed() {
    this.setCollapsed(!this._collapsed);
  }
  /** Sets the collapsed state and notifies the SplitView layout. */
  setCollapsed(collapsed) {
    if (this._collapsed === collapsed) {
      return;
    }
    this._setCollapsed(collapsed);
    this._onDidToggleCollapsed.fire(collapsed);
    this._onDidChangeHeight.fire();
  }
  /**
   * Expand the body if it is currently collapsed, notifying listeners so the
   * parent pane restores its size. No-op when already expanded.
   */
  expand() {
    this.setCollapsed(false);
  }
  /**
   * Move keyboard focus into the files list. Falls back to the header when the
   * body is collapsed or there is nothing to focus.
   */
  focus() {
    if (this._collapsed || this._fileCount === 0) {
      this._headerNode.focus();
      return;
    }
    this._list.domFocus();
    if (this._list.length > 0 && this._list.getFocus().length === 0) {
      this._list.setFocus([0]);
    }
  }
  _setCollapsed(collapsed) {
    this._collapsed = collapsed;
    this._updateChevron();
    this._headerNode.classList.toggle("collapsed", collapsed);
    this._headerNode.setAttribute("aria-expanded", String(!collapsed));
    this._renderCount();
  }
  /** Show the file count in the header only while collapsed. */
  _renderCount() {
    this._countNode.textContent = this._fileCount > 0 ? `${this._fileCount}` : "";
    this._countNode.classList.toggle("hidden", !this._collapsed || this._fileCount === 0);
  }
  _updateChevron() {
    this._chevronNode.className = "group-chevron";
    this._chevronNode.classList.add(
      ...ThemeIcon.asClassNameArray(
        this._collapsed ? Codicon.chevronRight : Codicon.chevronDown
      )
    );
  }
  _renderBody(files) {
    this._list.splice(0, this._list.length, files);
  }
  async _openFile(file, preserveFocus, pinned) {
    if (file.operation === SessionFileOperation.Modified && file.originalUri && await this._hasContent(file.originalUri)) {
      await this._editorService.openEditor({
        original: { resource: file.originalUri },
        modified: { resource: file.uri },
        label: getDiffEditorLabel(file.uri, this._labelService),
        options: { preserveFocus, pinned }
      }, ACTIVE_GROUP);
      return;
    }
    await this._editorService.openEditor({
      resource: file.uri,
      options: { preserveFocus, pinned }
    }, ACTIVE_GROUP);
  }
  async _hasContent(resource) {
    try {
      const content = await this._fileService.readFile(resource);
      return content.value.byteLength > 0;
    } catch {
      return false;
    }
  }
  /** Open the file in a normal editor, ignoring the pre-session diff. */
  _openFilePlain(file) {
    void this._editorService.openEditor({ resource: file.uri }, ACTIVE_GROUP);
  }
};
SessionFilesWidget.HEADER_HEIGHT = 34;
// 6px header margin-top + 8px header padding + 20px header min-height
SessionFilesWidget.MIN_BODY_HEIGHT = 3 * SessionFileListDelegate.ITEM_HEIGHT;
SessionFilesWidget.PREFERRED_BODY_HEIGHT = 3 * SessionFileListDelegate.ITEM_HEIGHT;
SessionFilesWidget.MAX_BODY_HEIGHT = 240;
SessionFilesWidget = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILabelService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IThemeService)
], SessionFilesWidget);
function getSessionFileOperationLabel(operation) {
  switch (operation) {
    case SessionFileOperation.Created:
      return localize("sessionFiles.created", "Created");
    case SessionFileOperation.Modified:
      return localize("sessionFiles.modified", "Modified");
    case SessionFileOperation.Deleted:
      return localize("sessionFiles.deleted", "Deleted");
  }
}
function getSessionFileTitle(file, labelService) {
  const path = labelService.getUriLabel(file.uri);
  return localize("sessionFiles.title", "{0} ({1})", path, getSessionFileOperationLabel(file.operation));
}
function getDiffEditorLabel(uri, labelService) {
  return localize("sessionFiles.diffLabel", "{0} (Session Changes)", basename(uri) || labelService.getUriLabel(uri));
}
export {
  SessionFilesWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhbmdlc1xcYnJvd3Nlclxcc2Vzc2lvbkZpbGVzV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3Nlc3Npb25GaWxlc1dpZGdldC5jc3MnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSUxpc3RSZW5kZXJlciwgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IEdlc3R1cmUsIEV2ZW50VHlwZSBhcyBUb3VjaEV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBGaWxlS2luZCwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERFRkFVTFRfTEFCRUxTX0NPTlRBSU5FUiwgSVJlc291cmNlTGFiZWwsIFJlc291cmNlTGFiZWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUZpbGVJY29uVGhlbWFibGVUcmVlQ29udGFpbmVyU2NvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9maWxlcy9icm93c2VyL3ZpZXdzL2V4cGxvcmVyVmlldy5qcyc7XG5pbXBvcnQgeyBBQ1RJVkVfR1JPVVAsIElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkZpbGUsIFNlc3Npb25GaWxlT3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbi8qKiBNaW5pbWFsIGlucHV0IGNvbnRyYWN0IGZvciB7QGxpbmsgU2Vzc2lvbkZpbGVzV2lkZ2V0LnNldElucHV0fS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlc3Npb25GaWxlc0lucHV0IHtcblx0cmVhZG9ubHkgc2Vzc2lvbkZpbGVzT2JzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVbXT47XG59XG5cbmNsYXNzIFNlc3Npb25GaWxlTGlzdERlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8SVNlc3Npb25GaWxlPiB7XG5cdHN0YXRpYyByZWFkb25seSBJVEVNX0hFSUdIVCA9IDIyO1xuXG5cdGdldEhlaWdodChfZWxlbWVudDogSVNlc3Npb25GaWxlKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gU2Vzc2lvbkZpbGVMaXN0RGVsZWdhdGUuSVRFTV9IRUlHSFQ7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKF9lbGVtZW50OiBJU2Vzc2lvbkZpbGUpOiBzdHJpbmcge1xuXHRcdHJldHVybiBTZXNzaW9uRmlsZUxpc3RSZW5kZXJlci5URU1QTEFURV9JRDtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVNlc3Npb25GaWxlVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgbGFiZWw6IElSZXNvdXJjZUxhYmVsO1xuXHRyZWFkb25seSB0b29sYmFyOiBXb3JrYmVuY2hUb29sQmFyO1xuXHRyZWFkb25seSB0ZW1wbGF0ZURpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmNsYXNzIFNlc3Npb25GaWxlTGlzdFJlbmRlcmVyIGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxJU2Vzc2lvbkZpbGUsIElTZXNzaW9uRmlsZVRlbXBsYXRlRGF0YT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnc2Vzc2lvbkZpbGUnO1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gU2Vzc2lvbkZpbGVMaXN0UmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGFiZWxzOiBSZXNvdXJjZUxhYmVscyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbk9wZW5GaWxlOiAoZmlsZTogSVNlc3Npb25GaWxlKSA9PiB2b2lkLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElTZXNzaW9uRmlsZVRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgdGVtcGxhdGVEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCByb3cgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNlc3Npb24tZmlsZXMtd2lkZ2V0LWZpbGUnKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZCh0aGlzLl9sYWJlbHMuY3JlYXRlKHJvdykpO1xuXG5cdFx0Y29uc3QgYWN0aW9uQmFyQ29udGFpbmVyID0gJCgnLmNoYXQtY29sbGFwc2libGUtbGlzdC1hY3Rpb24tYmFyJyk7XG5cdFx0Y29uc3QgdG9vbGJhciA9IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaFRvb2xCYXIsIGFjdGlvbkJhckNvbnRhaW5lciwgdW5kZWZpbmVkKSk7XG5cdFx0bGFiZWwuZWxlbWVudC5hcHBlbmRDaGlsZChhY3Rpb25CYXJDb250YWluZXIpO1xuXG5cdFx0cmV0dXJuIHsgbGFiZWwsIHRvb2xiYXIsIHRlbXBsYXRlRGlzcG9zYWJsZXMgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSVNlc3Npb25GaWxlLCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJU2Vzc2lvbkZpbGVUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0UmVzb3VyY2Uoe1xuXHRcdFx0cmVzb3VyY2U6IGVsZW1lbnQudXJpLFxuXHRcdFx0bmFtZTogYmFzZW5hbWUoZWxlbWVudC51cmkpLFxuXHRcdH0sIHtcblx0XHRcdGZpbGVLaW5kOiBGaWxlS2luZC5GSUxFLFxuXHRcdFx0ZmlsZURlY29yYXRpb25zOiB1bmRlZmluZWQsXG5cdFx0XHRzdHJpa2V0aHJvdWdoOiBlbGVtZW50Lm9wZXJhdGlvbiA9PT0gU2Vzc2lvbkZpbGVPcGVyYXRpb24uRGVsZXRlZCxcblx0XHRcdHRpdGxlOiBnZXRTZXNzaW9uRmlsZVRpdGxlKGVsZW1lbnQsIHRoaXMuX2xhYmVsU2VydmljZSksXG5cdFx0fSk7XG5cblx0XHR0ZW1wbGF0ZURhdGEudG9vbGJhci5zZXRBY3Rpb25zKFt0b0FjdGlvbih7XG5cdFx0XHRpZDogJ3Nlc3Npb25GaWxlcy5vcGVuRmlsZScsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Nlc3Npb25GaWxlcy5vcGVuRmlsZUFjdGlvbicsIFwiT3BlbiBGaWxlXCIpLFxuXHRcdFx0Y2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmdvVG9GaWxlKSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5fb25PcGVuRmlsZShlbGVtZW50KSxcblx0XHR9KV0pO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSVNlc3Npb25GaWxlVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8qKlxuICogQSB3aWRnZXQgdGhhdCBsaXN0cyB0aGUgZmlsZXMgY3JlYXRlZCwgZWRpdGVkIG9yIGRlbGV0ZWQgKipvdXRzaWRlKiogdGhlXG4gKiBzZXNzaW9uIHdvcmtzcGFjZSBkdXJpbmcgdGhlIHNlc3Npb24uIFJlbmRlcmVkIGJldHdlZW4gdGhlIGNoYW5nZXMgdHJlZSBhbmRcbiAqIHRoZSBDSSBjaGVja3Mgd2lkZ2V0IGluIHRoZSBjaGFuZ2VzIHZpZXcgYXMgYSByZXNpemFibGUgU3BsaXRWaWV3IHBhbmUuXG4gKlxuICogVGhlIGNvbGxhcHNlL3Jlc2l6ZSBiZWhhdmlvdXIgbWlycm9ycyB7QGxpbmsgQ0lTdGF0dXNXaWRnZXR9LlxuICovXG5leHBvcnQgY2xhc3MgU2Vzc2lvbkZpbGVzV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IEhFQURFUl9IRUlHSFQgPSAzNDsgLy8gNnB4IGhlYWRlciBtYXJnaW4tdG9wICsgOHB4IGhlYWRlciBwYWRkaW5nICsgMjBweCBoZWFkZXIgbWluLWhlaWdodFxuXHRzdGF0aWMgcmVhZG9ubHkgTUlOX0JPRFlfSEVJR0hUID0gMyAqIFNlc3Npb25GaWxlTGlzdERlbGVnYXRlLklURU1fSEVJR0hUO1xuXHRzdGF0aWMgcmVhZG9ubHkgUFJFRkVSUkVEX0JPRFlfSEVJR0hUID0gMyAqIFNlc3Npb25GaWxlTGlzdERlbGVnYXRlLklURU1fSEVJR0hUO1xuXHRzdGF0aWMgcmVhZG9ubHkgTUFYX0JPRFlfSEVJR0hUID0gMjQwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oZWFkZXJOb2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdGl0bGVOb2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdGl0bGVMYWJlbE5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb3VudE5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGV2cm9uTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2JvZHlOb2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfbGlzdDogV29ya2JlbmNoTGlzdDxJU2Vzc2lvbkZpbGU+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYWJlbHM6IFJlc291cmNlTGFiZWxzO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSGVpZ2h0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGVpZ2h0ID0gdGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRUb2dnbGVDb2xsYXBzZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25EaWRUb2dnbGVDb2xsYXBzZWQgPSB0aGlzLl9vbkRpZFRvZ2dsZUNvbGxhcHNlZC5ldmVudDtcblxuXHRwcml2YXRlIF9maWxlQ291bnQgPSAwO1xuXHRwcml2YXRlIF9jb2xsYXBzZWQgPSBmYWxzZTtcblxuXHRnZXQgZWxlbWVudCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2RvbU5vZGU7XG5cdH1cblxuXHQvKiogVGhlIGZ1bGwgY29udGVudCBoZWlnaHQgdGhlIHdpZGdldCB3b3VsZCBsaWtlIChoZWFkZXIgKyBhbGwgZmlsZXMpLiAqL1xuXHRnZXQgZGVzaXJlZEhlaWdodCgpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLl9maWxlQ291bnQgPT09IDApIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY29sbGFwc2VkKSB7XG5cdFx0XHRyZXR1cm4gU2Vzc2lvbkZpbGVzV2lkZ2V0LkhFQURFUl9IRUlHSFQ7XG5cdFx0fVxuXHRcdHJldHVybiBTZXNzaW9uRmlsZXNXaWRnZXQuSEVBREVSX0hFSUdIVCArIHRoaXMuX2ZpbGVDb3VudCAqIFNlc3Npb25GaWxlTGlzdERlbGVnYXRlLklURU1fSEVJR0hUO1xuXHR9XG5cblx0LyoqIFdoZXRoZXIgdGhlIHdpZGdldCBpcyBjdXJyZW50bHkgdmlzaWJsZSAoaGFzIGZpbGVzIHRvIHNob3cpLiAqL1xuXHRnZXQgdmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZmlsZUNvdW50ID4gMDtcblx0fVxuXG5cdC8qKiBXaGV0aGVyIHRoZSBib2R5IGlzIGNvbGxhcHNlZCAoaGVhZGVyLW9ubHkpLiAqL1xuXHRnZXQgY29sbGFwc2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb2xsYXBzZWQ7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2xhYmVscyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlTGFiZWxzLCBERUZBVUxUX0xBQkVMU19DT05UQUlORVIpKTtcblxuXHRcdHRoaXMuX2RvbU5vZGUgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNlc3Npb24tZmlsZXMtd2lkZ2V0JykpO1xuXHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdC8vIEVuYWJsZSBmaWxlIGljb25zIGZyb20gdGhlIGFjdGl2ZSBmaWxlIGljb24gdGhlbWUgZm9yIHRoZSByZXNvdXJjZVxuXHRcdC8vIGxhYmVscyByZW5kZXJlZCBpbiB0aGlzIHdpZGdldCdzIGxpc3QuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY3JlYXRlRmlsZUljb25UaGVtYWJsZVRyZWVDb250YWluZXJTY29wZSh0aGlzLl9kb21Ob2RlLCB0aGlzLl90aGVtZVNlcnZpY2UpKTtcblxuXHRcdC8vIEhlYWRlciAoYWx3YXlzIHZpc2libGUsIGNsaWNrIHRvIGNvbGxhcHNlL2V4cGFuZClcblx0XHR0aGlzLl9oZWFkZXJOb2RlID0gZG9tLmFwcGVuZCh0aGlzLl9kb21Ob2RlLCAkKCcuc2Vzc2lvbi1maWxlcy13aWRnZXQtaGVhZGVyJykpO1xuXHRcdHRoaXMuX3RpdGxlTm9kZSA9IGRvbS5hcHBlbmQodGhpcy5faGVhZGVyTm9kZSwgJCgnLnNlc3Npb24tZmlsZXMtd2lkZ2V0LXRpdGxlJykpO1xuXHRcdHRoaXMuX3RpdGxlTGFiZWxOb2RlID0gZG9tLmFwcGVuZCh0aGlzLl90aXRsZU5vZGUsICQoJy5zZXNzaW9uLWZpbGVzLXdpZGdldC10aXRsZS1sYWJlbCcpKTtcblx0XHR0aGlzLl90aXRsZUxhYmVsTm9kZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdzZXNzaW9uRmlsZXMubGFiZWwnLCBcIk90aGVyIEZpbGVzXCIpO1xuXHRcdC8vIEZpbGUgY291bnQgc2hvd24gaW4gdGhlIGhlYWRlciBvbmx5IHdoaWxlIGNvbGxhcHNlZCAobWlycm9ycyB0aGVcblx0XHQvLyBjdXN0b21pemF0aW9ucyBzZWN0aW9uIGluIHRoZSBzZXNzaW9ucyB2aWV3KS5cblx0XHR0aGlzLl9jb3VudE5vZGUgPSBkb20uYXBwZW5kKHRoaXMuX2hlYWRlck5vZGUsICQoJy5zZXNzaW9uLWZpbGVzLXdpZGdldC1jb3VudC5oaWRkZW4nKSk7XG5cdFx0dGhpcy5fY2hldnJvbk5vZGUgPSBkb20uYXBwZW5kKHRoaXMuX2hlYWRlck5vZGUsICQoJy5ncm91cC1jaGV2cm9uJykpO1xuXHRcdHRoaXMuX2NoZXZyb25Ob2RlLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5jaGV2cm9uRG93bikpO1xuXG5cdFx0dGhpcy5faGVhZGVyTm9kZS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0dGhpcy5faGVhZGVyTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnc2Vzc2lvbkZpbGVzLnRvZ2dsZScsIFwiVG9nZ2xlIE90aGVyIEZpbGVzXCIpKTtcblx0XHR0aGlzLl9oZWFkZXJOb2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICd0cnVlJyk7XG5cdFx0dGhpcy5faGVhZGVyTm9kZS50YWJJbmRleCA9IDA7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoXG5cdFx0XHRnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSxcblx0XHRcdHRoaXMuX2hlYWRlck5vZGUsXG5cdFx0XHRsb2NhbGl6ZSgnc2Vzc2lvbkZpbGVzLmhvdmVyJywgXCJGaWxlcyBjcmVhdGVkLCBlZGl0ZWQsIG9yIGRlbGV0ZWQgb3V0c2lkZSB0aGUgd29ya3NwYWNlIGR1cmluZyB0aGlzIHNlc3Npb24uIFRoZXNlIGZpbGVzIGFyZSBub3QgcGFydCBvZiB0aGUgd29ya3NwYWNlIGFuZCB3b24ndCBiZSBjb21taXR0ZWQuXCIpLFxuXHRcdCkpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgdGhlIGdlc3R1cmUgdGFyZ2V0IHNvIHRoZSB0b2dnbGUgd29ya3Mgb24gdG91Y2ggcGxhdGZvcm1zXG5cdFx0Ly8gKG5vdGFibHkgaU9TKSBpbiB0aGUgU2Vzc2lvbnMgd2luZG93LCB0aGVuIGhhbmRsZSBib3RoIG1vdXNlIGNsaWNrIGFuZFxuXHRcdC8vIHRvdWNoIHRhcC5cblx0XHR0aGlzLl9yZWdpc3RlcihHZXN0dXJlLmFkZFRhcmdldCh0aGlzLl9oZWFkZXJOb2RlKSk7XG5cdFx0Zm9yIChjb25zdCBldmVudFR5cGUgb2YgW2RvbS5FdmVudFR5cGUuQ0xJQ0ssIFRvdWNoRXZlbnRUeXBlLlRhcF0pIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5faGVhZGVyTm9kZSwgZXZlbnRUeXBlLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3RvZ2dsZUNvbGxhcHNlZCgpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2hlYWRlck5vZGUsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0aWYgKChlLmtleSA9PT0gJ0VudGVyJyB8fCBlLmtleSA9PT0gJyAnKSAmJiBlLnRhcmdldCA9PT0gdGhpcy5faGVhZGVyTm9kZSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHRoaXMuX3RvZ2dsZUNvbGxhcHNlZCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEJvZHkgKGxpc3Qgb2YgZmlsZXMpXG5cdFx0Y29uc3QgYm9keUlkID0gJ3Nlc3Npb24tZmlsZXMtd2lkZ2V0LWJvZHknO1xuXHRcdHRoaXMuX2JvZHlOb2RlID0gZG9tLmFwcGVuZCh0aGlzLl9kb21Ob2RlLCAkKGAuJHtib2R5SWR9YCkpO1xuXHRcdHRoaXMuX2JvZHlOb2RlLmlkID0gYm9keUlkO1xuXHRcdHRoaXMuX2hlYWRlck5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWNvbnRyb2xzJywgYm9keUlkKTtcblxuXHRcdGNvbnN0IGxpc3RDb250YWluZXIgPSAkKCcuc2Vzc2lvbi1maWxlcy13aWRnZXQtbGlzdCcpO1xuXHRcdHRoaXMuX2xpc3QgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdvcmtiZW5jaExpc3Q8SVNlc3Npb25GaWxlPixcblx0XHRcdCdTZXNzaW9uRmlsZXNXaWRnZXQnLFxuXHRcdFx0bGlzdENvbnRhaW5lcixcblx0XHRcdG5ldyBTZXNzaW9uRmlsZUxpc3REZWxlZ2F0ZSgpLFxuXHRcdFx0W3RoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25GaWxlTGlzdFJlbmRlcmVyLCB0aGlzLl9sYWJlbHMsIChmaWxlOiBJU2Vzc2lvbkZpbGUpID0+IHRoaXMuX29wZW5GaWxlUGxhaW4oZmlsZSkpXSxcblx0XHRcdHtcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0b3Blbk9uU2luZ2xlQ2xpY2s6IHRydWUsXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbG9jYWxpemUoJ3Nlc3Npb25GaWxlcy5saXN0QXJpYUxhYmVsJywgXCJPdGhlciBGaWxlc1wiKSxcblx0XHRcdFx0XHRnZXRBcmlhTGFiZWw6IGl0ZW0gPT4gbG9jYWxpemUoJ3Nlc3Npb25GaWxlcy5maWxlQXJpYUxhYmVsJywgXCJ7MH0sIHsxfVwiLCBiYXNlbmFtZShpdGVtLnVyaSksIGdldFNlc3Npb25GaWxlT3BlcmF0aW9uTGFiZWwoaXRlbS5vcGVyYXRpb24pKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0a2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsOiBpdGVtID0+IGJhc2VuYW1lKGl0ZW0udXJpKSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0KSk7XG5cdFx0dGhpcy5fYm9keU5vZGUuYXBwZW5kQ2hpbGQobGlzdENvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9saXN0Lm9uRGlkT3BlbihlID0+IHtcblx0XHRcdGlmIChlLmVsZW1lbnQpIHtcblx0XHRcdFx0dm9pZCB0aGlzLl9vcGVuRmlsZShlLmVsZW1lbnQsICEhZS5lZGl0b3JPcHRpb25zPy5wcmVzZXJ2ZUZvY3VzLCAhIWUuZWRpdG9yT3B0aW9ucz8ucGlubmVkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRzZXRJbnB1dChpbnB1dDogSVNlc3Npb25GaWxlc0lucHV0KTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBmaWxlcyA9IGlucHV0LnNlc3Npb25GaWxlc09icy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGNvbnN0IG9sZENvdW50ID0gdGhpcy5fZmlsZUNvdW50O1xuXHRcdFx0dGhpcy5fZmlsZUNvdW50ID0gZmlsZXMubGVuZ3RoO1xuXG5cdFx0XHRpZiAoZmlsZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX3JlbmRlckJvZHkoW10pO1xuXHRcdFx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdGlmIChvbGRDb3VudCAhPT0gMCkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0dGhpcy5fcmVuZGVyQm9keShmaWxlcyk7XG5cdFx0XHR0aGlzLl9yZW5kZXJDb3VudCgpO1xuXG5cdFx0XHRpZiAodGhpcy5fZmlsZUNvdW50ICE9PSBvbGRDb3VudCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogTGF5b3V0IHRoZSB3aWRnZXQgYm9keSBsaXN0IHRvIHRoZSBnaXZlbiBoZWlnaHQuXG5cdCAqIENhbGxlZCBieSB0aGUgcGFyZW50IHZpZXcgYWZ0ZXIgY29tcHV0aW5nIGF2YWlsYWJsZSBzcGFjZS5cblx0ICovXG5cdGxheW91dChoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb2xsYXBzZWQpIHtcblx0XHRcdHRoaXMuX2JvZHlOb2RlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2JvZHlOb2RlLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR0aGlzLl9saXN0LmxheW91dChoZWlnaHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9nZ2xlQ29sbGFwc2VkKCk6IHZvaWQge1xuXHRcdHRoaXMuc2V0Q29sbGFwc2VkKCF0aGlzLl9jb2xsYXBzZWQpO1xuXHR9XG5cblx0LyoqIFNldHMgdGhlIGNvbGxhcHNlZCBzdGF0ZSBhbmQgbm90aWZpZXMgdGhlIFNwbGl0VmlldyBsYXlvdXQuICovXG5cdHNldENvbGxhcHNlZChjb2xsYXBzZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29sbGFwc2VkID09PSBjb2xsYXBzZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2V0Q29sbGFwc2VkKGNvbGxhcHNlZCk7XG5cdFx0dGhpcy5fb25EaWRUb2dnbGVDb2xsYXBzZWQuZmlyZShjb2xsYXBzZWQpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFeHBhbmQgdGhlIGJvZHkgaWYgaXQgaXMgY3VycmVudGx5IGNvbGxhcHNlZCwgbm90aWZ5aW5nIGxpc3RlbmVycyBzbyB0aGVcblx0ICogcGFyZW50IHBhbmUgcmVzdG9yZXMgaXRzIHNpemUuIE5vLW9wIHdoZW4gYWxyZWFkeSBleHBhbmRlZC5cblx0ICovXG5cdGV4cGFuZCgpOiB2b2lkIHtcblx0XHR0aGlzLnNldENvbGxhcHNlZChmYWxzZSk7XG5cdH1cblxuXHQvKipcblx0ICogTW92ZSBrZXlib2FyZCBmb2N1cyBpbnRvIHRoZSBmaWxlcyBsaXN0LiBGYWxscyBiYWNrIHRvIHRoZSBoZWFkZXIgd2hlbiB0aGVcblx0ICogYm9keSBpcyBjb2xsYXBzZWQgb3IgdGhlcmUgaXMgbm90aGluZyB0byBmb2N1cy5cblx0ICovXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb2xsYXBzZWQgfHwgdGhpcy5fZmlsZUNvdW50ID09PSAwKSB7XG5cdFx0XHR0aGlzLl9oZWFkZXJOb2RlLmZvY3VzKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2xpc3QuZG9tRm9jdXMoKTtcblx0XHRpZiAodGhpcy5fbGlzdC5sZW5ndGggPiAwICYmIHRoaXMuX2xpc3QuZ2V0Rm9jdXMoKS5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX2xpc3Quc2V0Rm9jdXMoWzBdKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXRDb2xsYXBzZWQoY29sbGFwc2VkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fY29sbGFwc2VkID0gY29sbGFwc2VkO1xuXHRcdHRoaXMuX3VwZGF0ZUNoZXZyb24oKTtcblx0XHR0aGlzLl9oZWFkZXJOb2RlLmNsYXNzTGlzdC50b2dnbGUoJ2NvbGxhcHNlZCcsIGNvbGxhcHNlZCk7XG5cdFx0dGhpcy5faGVhZGVyTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCBTdHJpbmcoIWNvbGxhcHNlZCkpO1xuXHRcdHRoaXMuX3JlbmRlckNvdW50KCk7XG5cdH1cblxuXHQvKiogU2hvdyB0aGUgZmlsZSBjb3VudCBpbiB0aGUgaGVhZGVyIG9ubHkgd2hpbGUgY29sbGFwc2VkLiAqL1xuXHRwcml2YXRlIF9yZW5kZXJDb3VudCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb3VudE5vZGUudGV4dENvbnRlbnQgPSB0aGlzLl9maWxlQ291bnQgPiAwID8gYCR7dGhpcy5fZmlsZUNvdW50fWAgOiAnJztcblx0XHR0aGlzLl9jb3VudE5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIXRoaXMuX2NvbGxhcHNlZCB8fCB0aGlzLl9maWxlQ291bnQgPT09IDApO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ2hldnJvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9jaGV2cm9uTm9kZS5jbGFzc05hbWUgPSAnZ3JvdXAtY2hldnJvbic7XG5cdFx0dGhpcy5fY2hldnJvbk5vZGUuY2xhc3NMaXN0LmFkZChcblx0XHRcdC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KFxuXHRcdFx0XHR0aGlzLl9jb2xsYXBzZWQgPyBDb2RpY29uLmNoZXZyb25SaWdodCA6IENvZGljb24uY2hldnJvbkRvd25cblx0XHRcdClcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyQm9keShmaWxlczogcmVhZG9ubHkgSVNlc3Npb25GaWxlW10pOiB2b2lkIHtcblx0XHR0aGlzLl9saXN0LnNwbGljZSgwLCB0aGlzLl9saXN0Lmxlbmd0aCwgZmlsZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfb3BlbkZpbGUoZmlsZTogSVNlc3Npb25GaWxlLCBwcmVzZXJ2ZUZvY3VzOiBib29sZWFuLCBwaW5uZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBDcmVhdGVkIGFuZCBkZWxldGVkIGZpbGVzIG9wZW4gbm9ybWFsbHk7IG1vZGlmaWVkIGZpbGVzIG9wZW4gYSBkaWZmXG5cdFx0Ly8gYWdhaW5zdCB0aGVpciBwcmUtc2Vzc2lvbiBjb250ZW50IHdoZW4gaXQgaXMgYXZhaWxhYmxlIGFuZCBub24tZW1wdHkuXG5cdFx0aWYgKGZpbGUub3BlcmF0aW9uID09PSBTZXNzaW9uRmlsZU9wZXJhdGlvbi5Nb2RpZmllZCAmJiBmaWxlLm9yaWdpbmFsVXJpICYmIGF3YWl0IHRoaXMuX2hhc0NvbnRlbnQoZmlsZS5vcmlnaW5hbFVyaSkpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBmaWxlLm9yaWdpbmFsVXJpIH0sXG5cdFx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBmaWxlLnVyaSB9LFxuXHRcdFx0XHRsYWJlbDogZ2V0RGlmZkVkaXRvckxhYmVsKGZpbGUudXJpLCB0aGlzLl9sYWJlbFNlcnZpY2UpLFxuXHRcdFx0XHRvcHRpb25zOiB7IHByZXNlcnZlRm9jdXMsIHBpbm5lZCB9LFxuXHRcdFx0fSwgQUNUSVZFX0dST1VQKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2U6IGZpbGUudXJpLFxuXHRcdFx0b3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzLCBwaW5uZWQgfSxcblx0XHR9LCBBQ1RJVkVfR1JPVVApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFzQ29udGVudChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSk7XG5cdFx0XHRyZXR1cm4gY29udGVudC52YWx1ZS5ieXRlTGVuZ3RoID4gMDtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHQvKiogT3BlbiB0aGUgZmlsZSBpbiBhIG5vcm1hbCBlZGl0b3IsIGlnbm9yaW5nIHRoZSBwcmUtc2Vzc2lvbiBkaWZmLiAqL1xuXHRwcml2YXRlIF9vcGVuRmlsZVBsYWluKGZpbGU6IElTZXNzaW9uRmlsZSk6IHZvaWQge1xuXHRcdHZvaWQgdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IGZpbGUudXJpIH0sIEFDVElWRV9HUk9VUCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0U2Vzc2lvbkZpbGVPcGVyYXRpb25MYWJlbChvcGVyYXRpb246IFNlc3Npb25GaWxlT3BlcmF0aW9uKTogc3RyaW5nIHtcblx0c3dpdGNoIChvcGVyYXRpb24pIHtcblx0XHRjYXNlIFNlc3Npb25GaWxlT3BlcmF0aW9uLkNyZWF0ZWQ6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Nlc3Npb25GaWxlcy5jcmVhdGVkJywgXCJDcmVhdGVkXCIpO1xuXHRcdGNhc2UgU2Vzc2lvbkZpbGVPcGVyYXRpb24uTW9kaWZpZWQ6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Nlc3Npb25GaWxlcy5tb2RpZmllZCcsIFwiTW9kaWZpZWRcIik7XG5cdFx0Y2FzZSBTZXNzaW9uRmlsZU9wZXJhdGlvbi5EZWxldGVkOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzZXNzaW9uRmlsZXMuZGVsZXRlZCcsIFwiRGVsZXRlZFwiKTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRTZXNzaW9uRmlsZVRpdGxlKGZpbGU6IElTZXNzaW9uRmlsZSwgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlKTogc3RyaW5nIHtcblx0Y29uc3QgcGF0aCA9IGxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChmaWxlLnVyaSk7XG5cdHJldHVybiBsb2NhbGl6ZSgnc2Vzc2lvbkZpbGVzLnRpdGxlJywgXCJ7MH0gKHsxfSlcIiwgcGF0aCwgZ2V0U2Vzc2lvbkZpbGVPcGVyYXRpb25MYWJlbChmaWxlLm9wZXJhdGlvbikpO1xufVxuXG5mdW5jdGlvbiBnZXREaWZmRWRpdG9yTGFiZWwodXJpOiBVUkksIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSk6IHN0cmluZyB7XG5cdHJldHVybiBsb2NhbGl6ZSgnc2Vzc2lvbkZpbGVzLmRpZmZMYWJlbCcsIFwiezB9IChTZXNzaW9uIENoYW5nZXMpXCIsIGJhc2VuYW1lKHVyaSkgfHwgbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHVyaSkpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsK0JBQStCO0FBRXhDLFNBQVMsU0FBUyxhQUFhLHNCQUFzQjtBQUNyRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSx1QkFBb0M7QUFDekQsU0FBUyxlQUE0QjtBQUNyQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQjtBQUUxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFVBQVUsb0JBQW9CO0FBQ3ZDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMEJBQTBDLHNCQUFzQjtBQUN6RSxTQUFTLGdEQUFnRDtBQUN6RCxTQUFTLGNBQWMsc0JBQXNCO0FBQzdDLFNBQXVCLDRCQUE0QjtBQUVuRCxNQUFNLElBQUksSUFBSTtBQU9kLE1BQU0sMkJBQU4sTUFBTSx5QkFBc0U7QUFBQSxFQUczRSxVQUFVLFVBQWdDO0FBQ3pDLFdBQU8seUJBQXdCO0FBQUEsRUFDaEM7QUFBQSxFQUVBLGNBQWMsVUFBZ0M7QUFDN0MsV0FBTyx3QkFBd0I7QUFBQSxFQUNoQztBQUNEO0FBVk0seUJBQ1csY0FBYztBQUQvQixJQUFNLDBCQUFOO0FBa0JBLElBQU0sMEJBQU4sTUFBK0Y7QUFBQSxFQUk5RixZQUNrQixTQUNBLGFBQ2UsZUFDUSx1QkFDdkM7QUFKZ0I7QUFDQTtBQUNlO0FBQ1E7QUFOekMsU0FBUyxhQUFhLHdCQUF3QjtBQUFBLEVBTzFDO0FBQUEsRUFFSixlQUFlLFdBQWtEO0FBQ2hFLFVBQU0sc0JBQXNCLElBQUksZ0JBQWdCO0FBQ2hELFVBQU0sTUFBTSxJQUFJLE9BQU8sV0FBVyxFQUFFLDRCQUE0QixDQUFDO0FBQ2pFLFVBQU0sUUFBUSxvQkFBb0IsSUFBSSxLQUFLLFFBQVEsT0FBTyxHQUFHLENBQUM7QUFFOUQsVUFBTSxxQkFBcUIsRUFBRSxtQ0FBbUM7QUFDaEUsVUFBTSxVQUFVLG9CQUFvQixJQUFJLEtBQUssc0JBQXNCLGVBQWUsa0JBQWtCLG9CQUFvQixNQUFTLENBQUM7QUFDbEksVUFBTSxRQUFRLFlBQVksa0JBQWtCO0FBRTVDLFdBQU8sRUFBRSxPQUFPLFNBQVMsb0JBQW9CO0FBQUEsRUFDOUM7QUFBQSxFQUVBLGNBQWMsU0FBdUIsUUFBZ0IsY0FBOEM7QUFDbEcsaUJBQWEsTUFBTSxZQUFZO0FBQUEsTUFDOUIsVUFBVSxRQUFRO0FBQUEsTUFDbEIsTUFBTSxTQUFTLFFBQVEsR0FBRztBQUFBLElBQzNCLEdBQUc7QUFBQSxNQUNGLFVBQVUsU0FBUztBQUFBLE1BQ25CLGlCQUFpQjtBQUFBLE1BQ2pCLGVBQWUsUUFBUSxjQUFjLHFCQUFxQjtBQUFBLE1BQzFELE9BQU8sb0JBQW9CLFNBQVMsS0FBSyxhQUFhO0FBQUEsSUFDdkQsQ0FBQztBQUVELGlCQUFhLFFBQVEsV0FBVyxDQUFDLFNBQVM7QUFBQSxNQUN6QyxJQUFJO0FBQUEsTUFDSixPQUFPLFNBQVMsK0JBQStCLFdBQVc7QUFBQSxNQUMxRCxPQUFPLFVBQVUsWUFBWSxRQUFRLFFBQVE7QUFBQSxNQUM3QyxLQUFLLE1BQU0sS0FBSyxZQUFZLE9BQU87QUFBQSxJQUNwQyxDQUFDLENBQUMsQ0FBQztBQUFBLEVBQ0o7QUFBQSxFQUVBLGdCQUFnQixjQUE4QztBQUM3RCxpQkFBYSxvQkFBb0IsUUFBUTtBQUFBLEVBQzFDO0FBQ0Q7QUE3Q00sd0JBQ1csY0FBYztBQUR6QiwwQkFBTjtBQUFBLEVBT0c7QUFBQSxFQUNBO0FBQUEsR0FSRztBQXNEQyxJQUFNLHFCQUFOLGNBQWlDLFdBQVc7QUFBQSxFQW1EbEQsWUFDQyxXQUN3Qyx1QkFDUixlQUNDLGdCQUNELGVBQ0QsY0FDQyxlQUMvQjtBQUNELFVBQU07QUFQa0M7QUFDUjtBQUNDO0FBQ0Q7QUFDRDtBQUNDO0FBekNqQyxTQUFpQixxQkFBcUIsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ3hFLFNBQVMsb0JBQW9CLEtBQUssbUJBQW1CO0FBRXJELFNBQWlCLHdCQUF3QixLQUFLLFVBQVUsSUFBSSxRQUFpQixDQUFDO0FBQzlFLFNBQVMsdUJBQXVCLEtBQUssc0JBQXNCO0FBRTNELFNBQVEsYUFBYTtBQUNyQixTQUFRLGFBQWE7QUFxQ3BCLFNBQUssVUFBVSxLQUFLLFVBQVUsS0FBSyxzQkFBc0IsZUFBZSxnQkFBZ0Isd0JBQXdCLENBQUM7QUFFakgsU0FBSyxXQUFXLElBQUksT0FBTyxXQUFXLEVBQUUsdUJBQXVCLENBQUM7QUFDaEUsU0FBSyxTQUFTLE1BQU0sVUFBVTtBQUk5QixTQUFLLFVBQVUseUNBQXlDLEtBQUssVUFBVSxLQUFLLGFBQWEsQ0FBQztBQUcxRixTQUFLLGNBQWMsSUFBSSxPQUFPLEtBQUssVUFBVSxFQUFFLDhCQUE4QixDQUFDO0FBQzlFLFNBQUssYUFBYSxJQUFJLE9BQU8sS0FBSyxhQUFhLEVBQUUsNkJBQTZCLENBQUM7QUFDL0UsU0FBSyxrQkFBa0IsSUFBSSxPQUFPLEtBQUssWUFBWSxFQUFFLG1DQUFtQyxDQUFDO0FBQ3pGLFNBQUssZ0JBQWdCLGNBQWMsU0FBUyxzQkFBc0IsYUFBYTtBQUcvRSxTQUFLLGFBQWEsSUFBSSxPQUFPLEtBQUssYUFBYSxFQUFFLG9DQUFvQyxDQUFDO0FBQ3RGLFNBQUssZUFBZSxJQUFJLE9BQU8sS0FBSyxhQUFhLEVBQUUsZ0JBQWdCLENBQUM7QUFDcEUsU0FBSyxhQUFhLFVBQVUsSUFBSSxHQUFHLFVBQVUsaUJBQWlCLFFBQVEsV0FBVyxDQUFDO0FBRWxGLFNBQUssWUFBWSxhQUFhLFFBQVEsUUFBUTtBQUM5QyxTQUFLLFlBQVksYUFBYSxjQUFjLFNBQVMsdUJBQXVCLG9CQUFvQixDQUFDO0FBQ2pHLFNBQUssWUFBWSxhQUFhLGlCQUFpQixNQUFNO0FBQ3JELFNBQUssWUFBWSxXQUFXO0FBRTVCLFNBQUssVUFBVSxLQUFLLGNBQWM7QUFBQSxNQUNqQyx3QkFBd0IsT0FBTztBQUFBLE1BQy9CLEtBQUs7QUFBQSxNQUNMLFNBQVMsc0JBQXNCLGdKQUFnSjtBQUFBLElBQ2hMLENBQUM7QUFLRCxTQUFLLFVBQVUsUUFBUSxVQUFVLEtBQUssV0FBVyxDQUFDO0FBQ2xELGVBQVcsYUFBYSxDQUFDLElBQUksVUFBVSxPQUFPLGVBQWUsR0FBRyxHQUFHO0FBQ2xFLFdBQUssVUFBVSxJQUFJLHNCQUFzQixLQUFLLGFBQWEsV0FBVyxNQUFNO0FBQzNFLGFBQUssaUJBQWlCO0FBQUEsTUFDdkIsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUNBLFNBQUssVUFBVSxJQUFJLHNCQUFzQixLQUFLLGFBQWEsSUFBSSxVQUFVLFVBQVUsT0FBSztBQUN2RixXQUFLLEVBQUUsUUFBUSxXQUFXLEVBQUUsUUFBUSxRQUFRLEVBQUUsV0FBVyxLQUFLLGFBQWE7QUFDMUUsVUFBRSxlQUFlO0FBQ2pCLGFBQUssaUJBQWlCO0FBQUEsTUFDdkI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUdGLFVBQU0sU0FBUztBQUNmLFNBQUssWUFBWSxJQUFJLE9BQU8sS0FBSyxVQUFVLEVBQUUsSUFBSSxNQUFNLEVBQUUsQ0FBQztBQUMxRCxTQUFLLFVBQVUsS0FBSztBQUNwQixTQUFLLFlBQVksYUFBYSxpQkFBaUIsTUFBTTtBQUVyRCxVQUFNLGdCQUFnQixFQUFFLDRCQUE0QjtBQUNwRCxTQUFLLFFBQVEsS0FBSyxVQUFVLEtBQUssc0JBQXNCO0FBQUEsTUFDdEQ7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsSUFBSSx3QkFBd0I7QUFBQSxNQUM1QixDQUFDLEtBQUssc0JBQXNCLGVBQWUseUJBQXlCLEtBQUssU0FBUyxDQUFDLFNBQXVCLEtBQUssZUFBZSxJQUFJLENBQUMsQ0FBQztBQUFBLE1BQ3BJO0FBQUEsUUFDQywwQkFBMEI7QUFBQSxRQUMxQixtQkFBbUI7QUFBQSxRQUNuQix1QkFBdUI7QUFBQSxVQUN0QixvQkFBb0IsTUFBTSxTQUFTLDhCQUE4QixhQUFhO0FBQUEsVUFDOUUsY0FBYyxVQUFRLFNBQVMsOEJBQThCLFlBQVksU0FBUyxLQUFLLEdBQUcsR0FBRyw2QkFBNkIsS0FBSyxTQUFTLENBQUM7QUFBQSxRQUMxSTtBQUFBLFFBQ0EsaUNBQWlDO0FBQUEsVUFDaEMsNEJBQTRCLFVBQVEsU0FBUyxLQUFLLEdBQUc7QUFBQSxRQUN0RDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFDRCxTQUFLLFVBQVUsWUFBWSxhQUFhO0FBRXhDLFNBQUssVUFBVSxLQUFLLE1BQU0sVUFBVSxPQUFLO0FBQ3hDLFVBQUksRUFBRSxTQUFTO0FBQ2QsYUFBSyxLQUFLLFVBQVUsRUFBRSxTQUFTLENBQUMsQ0FBQyxFQUFFLGVBQWUsZUFBZSxDQUFDLENBQUMsRUFBRSxlQUFlLE1BQU07QUFBQSxNQUMzRjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBbEhBLElBQUksVUFBdUI7QUFDMUIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBO0FBQUEsRUFHQSxJQUFJLGdCQUF3QjtBQUMzQixRQUFJLEtBQUssZUFBZSxHQUFHO0FBQzFCLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxLQUFLLFlBQVk7QUFDcEIsYUFBTyxtQkFBbUI7QUFBQSxJQUMzQjtBQUNBLFdBQU8sbUJBQW1CLGdCQUFnQixLQUFLLGFBQWEsd0JBQXdCO0FBQUEsRUFDckY7QUFBQTtBQUFBLEVBR0EsSUFBSSxVQUFtQjtBQUN0QixXQUFPLEtBQUssYUFBYTtBQUFBLEVBQzFCO0FBQUE7QUFBQSxFQUdBLElBQUksWUFBcUI7QUFDeEIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBNkZBLFNBQVMsT0FBd0M7QUFDaEQsV0FBTyxRQUFRLFlBQVU7QUFDeEIsWUFBTSxRQUFRLE1BQU0sZ0JBQWdCLEtBQUssTUFBTTtBQUUvQyxZQUFNLFdBQVcsS0FBSztBQUN0QixXQUFLLGFBQWEsTUFBTTtBQUV4QixVQUFJLE1BQU0sV0FBVyxHQUFHO0FBQ3ZCLGFBQUssWUFBWSxDQUFDLENBQUM7QUFDbkIsYUFBSyxTQUFTLE1BQU0sVUFBVTtBQUM5QixZQUFJLGFBQWEsR0FBRztBQUNuQixlQUFLLG1CQUFtQixLQUFLO0FBQUEsUUFDOUI7QUFDQTtBQUFBLE1BQ0Q7QUFFQSxXQUFLLFNBQVMsTUFBTSxVQUFVO0FBQzlCLFdBQUssWUFBWSxLQUFLO0FBQ3RCLFdBQUssYUFBYTtBQUVsQixVQUFJLEtBQUssZUFBZSxVQUFVO0FBQ2pDLGFBQUssbUJBQW1CLEtBQUs7QUFBQSxNQUM5QjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsT0FBTyxRQUFzQjtBQUM1QixRQUFJLEtBQUssWUFBWTtBQUNwQixXQUFLLFVBQVUsTUFBTSxVQUFVO0FBQy9CO0FBQUEsSUFDRDtBQUNBLFNBQUssVUFBVSxNQUFNLFVBQVU7QUFDL0IsU0FBSyxNQUFNLE9BQU8sTUFBTTtBQUFBLEVBQ3pCO0FBQUEsRUFFUSxtQkFBeUI7QUFDaEMsU0FBSyxhQUFhLENBQUMsS0FBSyxVQUFVO0FBQUEsRUFDbkM7QUFBQTtBQUFBLEVBR0EsYUFBYSxXQUEwQjtBQUN0QyxRQUFJLEtBQUssZUFBZSxXQUFXO0FBQ2xDO0FBQUEsSUFDRDtBQUNBLFNBQUssY0FBYyxTQUFTO0FBQzVCLFNBQUssc0JBQXNCLEtBQUssU0FBUztBQUN6QyxTQUFLLG1CQUFtQixLQUFLO0FBQUEsRUFDOUI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsU0FBZTtBQUNkLFNBQUssYUFBYSxLQUFLO0FBQUEsRUFDeEI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsUUFBYztBQUNiLFFBQUksS0FBSyxjQUFjLEtBQUssZUFBZSxHQUFHO0FBQzdDLFdBQUssWUFBWSxNQUFNO0FBQ3ZCO0FBQUEsSUFDRDtBQUNBLFNBQUssTUFBTSxTQUFTO0FBQ3BCLFFBQUksS0FBSyxNQUFNLFNBQVMsS0FBSyxLQUFLLE1BQU0sU0FBUyxFQUFFLFdBQVcsR0FBRztBQUNoRSxXQUFLLE1BQU0sU0FBUyxDQUFDLENBQUMsQ0FBQztBQUFBLElBQ3hCO0FBQUEsRUFDRDtBQUFBLEVBRVEsY0FBYyxXQUEwQjtBQUMvQyxTQUFLLGFBQWE7QUFDbEIsU0FBSyxlQUFlO0FBQ3BCLFNBQUssWUFBWSxVQUFVLE9BQU8sYUFBYSxTQUFTO0FBQ3hELFNBQUssWUFBWSxhQUFhLGlCQUFpQixPQUFPLENBQUMsU0FBUyxDQUFDO0FBQ2pFLFNBQUssYUFBYTtBQUFBLEVBQ25CO0FBQUE7QUFBQSxFQUdRLGVBQXFCO0FBQzVCLFNBQUssV0FBVyxjQUFjLEtBQUssYUFBYSxJQUFJLEdBQUcsS0FBSyxVQUFVLEtBQUs7QUFDM0UsU0FBSyxXQUFXLFVBQVUsT0FBTyxVQUFVLENBQUMsS0FBSyxjQUFjLEtBQUssZUFBZSxDQUFDO0FBQUEsRUFDckY7QUFBQSxFQUVRLGlCQUF1QjtBQUM5QixTQUFLLGFBQWEsWUFBWTtBQUM5QixTQUFLLGFBQWEsVUFBVTtBQUFBLE1BQzNCLEdBQUcsVUFBVTtBQUFBLFFBQ1osS0FBSyxhQUFhLFFBQVEsZUFBZSxRQUFRO0FBQUEsTUFDbEQ7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsWUFBWSxPQUFzQztBQUN6RCxTQUFLLE1BQU0sT0FBTyxHQUFHLEtBQUssTUFBTSxRQUFRLEtBQUs7QUFBQSxFQUM5QztBQUFBLEVBRUEsTUFBYyxVQUFVLE1BQW9CLGVBQXdCLFFBQWdDO0FBR25HLFFBQUksS0FBSyxjQUFjLHFCQUFxQixZQUFZLEtBQUssZUFBZSxNQUFNLEtBQUssWUFBWSxLQUFLLFdBQVcsR0FBRztBQUNySCxZQUFNLEtBQUssZUFBZSxXQUFXO0FBQUEsUUFDcEMsVUFBVSxFQUFFLFVBQVUsS0FBSyxZQUFZO0FBQUEsUUFDdkMsVUFBVSxFQUFFLFVBQVUsS0FBSyxJQUFJO0FBQUEsUUFDL0IsT0FBTyxtQkFBbUIsS0FBSyxLQUFLLEtBQUssYUFBYTtBQUFBLFFBQ3RELFNBQVMsRUFBRSxlQUFlLE9BQU87QUFBQSxNQUNsQyxHQUFHLFlBQVk7QUFDZjtBQUFBLElBQ0Q7QUFFQSxVQUFNLEtBQUssZUFBZSxXQUFXO0FBQUEsTUFDcEMsVUFBVSxLQUFLO0FBQUEsTUFDZixTQUFTLEVBQUUsZUFBZSxPQUFPO0FBQUEsSUFDbEMsR0FBRyxZQUFZO0FBQUEsRUFDaEI7QUFBQSxFQUVBLE1BQWMsWUFBWSxVQUFpQztBQUMxRCxRQUFJO0FBQ0gsWUFBTSxVQUFVLE1BQU0sS0FBSyxhQUFhLFNBQVMsUUFBUTtBQUN6RCxhQUFPLFFBQVEsTUFBTSxhQUFhO0FBQUEsSUFDbkMsUUFBUTtBQUNQLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBO0FBQUEsRUFHUSxlQUFlLE1BQTBCO0FBQ2hELFNBQUssS0FBSyxlQUFlLFdBQVcsRUFBRSxVQUFVLEtBQUssSUFBSSxHQUFHLFlBQVk7QUFBQSxFQUN6RTtBQUNEO0FBclJhLG1CQUVJLGdCQUFnQjtBQUFBO0FBRnBCLG1CQUdJLGtCQUFrQixJQUFJLHdCQUF3QjtBQUhsRCxtQkFJSSx3QkFBd0IsSUFBSSx3QkFBd0I7QUFKeEQsbUJBS0ksa0JBQWtCO0FBTHRCLHFCQUFOO0FBQUEsRUFxREo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBMURVO0FBdVJiLFNBQVMsNkJBQTZCLFdBQXlDO0FBQzlFLFVBQVEsV0FBVztBQUFBLElBQ2xCLEtBQUsscUJBQXFCO0FBQ3pCLGFBQU8sU0FBUyx3QkFBd0IsU0FBUztBQUFBLElBQ2xELEtBQUsscUJBQXFCO0FBQ3pCLGFBQU8sU0FBUyx5QkFBeUIsVUFBVTtBQUFBLElBQ3BELEtBQUsscUJBQXFCO0FBQ3pCLGFBQU8sU0FBUyx3QkFBd0IsU0FBUztBQUFBLEVBQ25EO0FBQ0Q7QUFFQSxTQUFTLG9CQUFvQixNQUFvQixjQUFxQztBQUNyRixRQUFNLE9BQU8sYUFBYSxZQUFZLEtBQUssR0FBRztBQUM5QyxTQUFPLFNBQVMsc0JBQXNCLGFBQWEsTUFBTSw2QkFBNkIsS0FBSyxTQUFTLENBQUM7QUFDdEc7QUFFQSxTQUFTLG1CQUFtQixLQUFVLGNBQXFDO0FBQzFFLFNBQU8sU0FBUywwQkFBMEIseUJBQXlCLFNBQVMsR0FBRyxLQUFLLGFBQWEsWUFBWSxHQUFHLENBQUM7QUFDbEg7IiwKICAibmFtZXMiOiBbXQp9Cg==
