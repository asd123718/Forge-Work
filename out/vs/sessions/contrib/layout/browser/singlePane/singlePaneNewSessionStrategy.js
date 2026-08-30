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
import { mainWindow } from "../../../../../base/browser/window.js";
import { onUnexpectedError } from "../../../../../base/common/errors.js";
import { Event } from "../../../../../base/common/event.js";
import {
  autorun,
  observableFromEvent,
  observableSignalFromEvent
} from "../../../../../base/common/observable.js";
import { EditorActivation } from "../../../../../platform/editor/common/editor.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { BrowserEditorInput } from "../../../../../workbench/contrib/browserView/common/browserEditorInput.js";
import {
  IEditorGroupsService
} from "../../../../../workbench/services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../../workbench/services/editor/common/editorService.js";
import { Parts } from "../../../../../workbench/services/layout/browser/layoutService.js";
import { IAgentWorkbenchLayoutService } from "../../../../browser/workbench.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { ISessionChangesService } from "../../../changes/browser/sessionChangesService.js";
import { EmptyFileEditorInput } from "../../../editor/browser/emptyFileEditorInput.js";
import {
  DetailPanelTarget
} from "./singlePaneDetailPanelCoordinator.js";
import {
  isChangesEditorInput,
  isFileEditorInput,
  isMainPartEmpty
} from "./singlePaneSharedHelpers.js";
import {
  SinglePaneLayoutStrategy
} from "./singlePaneLayoutStrategy.js";
let SinglePaneNewSessionStrategy = class extends SinglePaneLayoutStrategy {
  constructor(ctx, _detailPanel, _layoutService, _sessionsService, _editorService, _editorGroupsService, _sessionChangesService, _instantiationService) {
    super(ctx);
    this._detailPanel = _detailPanel;
    this._layoutService = _layoutService;
    this._sessionsService = _sessionsService;
    this._editorService = _editorService;
    this._editorGroupsService = _editorGroupsService;
    this._sessionChangesService = _sessionChangesService;
    this._instantiationService = _instantiationService;
    this._detailHiddenTransiently = false;
    this._registerEntryEditorHide();
    this._registerSidePaneOpenEditorHide();
    this._registerEmptyFilesCloseFallback();
    this._registerDetailPanel();
  }
  // --- Editor visibility ---------------------------------------------------------------
  _registerEntryEditorHide() {
    const editorSetChanged = observableSignalFromEvent(
      this,
      Event.any(
        this._editorService.onDidActiveEditorChange,
        this._editorService.onDidEditorsChange,
        this._editorService.onDidCloseEditor,
        this._ctx.onDidEndSessionLayoutRestore
      )
    );
    let activeNewSessionKey;
    this._register(
      this._editorService.onWillOpenEditor((event) => {
        if (!this._getActiveNewSessionKey()) {
          return;
        }
        if (!(event.editor instanceof EmptyFileEditorInput)) {
          this._pendingEntryHideSessionKey = void 0;
        }
      })
    );
    const applyPendingEntry = () => {
      const pendingSessionKey = this._pendingEntryHideSessionKey;
      if (!pendingSessionKey || this._ctx.isRestoringSessionLayout) {
        return;
      }
      if (this._getActiveNewSessionKey() !== pendingSessionKey) {
        this._pendingEntryHideSessionKey = void 0;
        return;
      }
      const editors = this._getMainPartEditors();
      if (editors.length === 0) {
        return;
      }
      if (!editors.every((editor) => editor instanceof EmptyFileEditorInput)) {
        return;
      }
      this._pendingEntryHideSessionKey = void 0;
      if (!this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
        return;
      }
      const suppression = this._layoutService.suppressEditorPartAutoVisibility();
      try {
        this._layoutService.setPartHidden(true, Parts.EDITOR_PART);
      } finally {
        suppression.dispose();
      }
    };
    this._register(
      autorun((reader) => {
        editorSetChanged.read(reader);
        const sessionKey = this._readActiveNewSessionKey(reader);
        if (!sessionKey) {
          activeNewSessionKey = void 0;
          this._pendingEntryHideSessionKey = void 0;
          return;
        }
        if (activeNewSessionKey !== sessionKey) {
          activeNewSessionKey = sessionKey;
          this._pendingSidePaneOpenHideSessionKey = void 0;
          this._pendingEntryHideSessionKey = sessionKey;
        }
        applyPendingEntry();
      })
    );
  }
  _registerSidePaneOpenEditorHide() {
    const applyPendingSidePaneOpen = () => {
      const pendingSessionKey = this._pendingSidePaneOpenHideSessionKey;
      if (!pendingSessionKey || this._ctx.isRestoringSessionLayout) {
        return;
      }
      if (this._getActiveNewSessionKey() !== pendingSessionKey) {
        this._pendingSidePaneOpenHideSessionKey = void 0;
        return;
      }
      const editors = this._getMainPartEditors();
      if (editors.length === 0) {
        return;
      }
      this._pendingSidePaneOpenHideSessionKey = void 0;
      if (editors.length !== 1 || !(editors[0] instanceof EmptyFileEditorInput)) {
        return;
      }
      const suppression = this._layoutService.suppressEditorPartAutoVisibility();
      try {
        if (!this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
          this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
        }
        if (this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
          this._layoutService.setPartHidden(true, Parts.EDITOR_PART);
        }
      } finally {
        suppression.dispose();
      }
    };
    this._register(
      this._editorService.onWillOpenEditor((event) => {
        if (!this._getActiveNewSessionKey()) {
          return;
        }
        if (!(event.editor instanceof EmptyFileEditorInput)) {
          this._pendingSidePaneOpenHideSessionKey = void 0;
        }
      })
    );
    this._register(
      Event.any(
        this._editorService.onDidActiveEditorChange,
        this._editorService.onDidEditorsChange,
        this._editorService.onDidCloseEditor,
        this._ctx.onDidEndSessionLayoutRestore
      )(applyPendingSidePaneOpen)
    );
    this._register(
      this._layoutService.onDidToggleSidePane(({ before, after }) => {
        const sessionKey = this._getActiveNewSessionKey();
        if (!sessionKey) {
          return;
        }
        const opened = !before.editor && !before.auxiliaryBar && (after.editor || after.auxiliaryBar);
        if (!opened) {
          this._pendingSidePaneOpenHideSessionKey = void 0;
          return;
        }
        this._pendingEntryHideSessionKey = void 0;
        this._pendingSidePaneOpenHideSessionKey = sessionKey;
        applyPendingSidePaneOpen();
      })
    );
    this._register(
      autorun((reader) => {
        const activeSessionKey = this._readActiveNewSessionKey(reader);
        if (this._pendingSidePaneOpenHideSessionKey && this._pendingSidePaneOpenHideSessionKey !== activeSessionKey) {
          this._pendingSidePaneOpenHideSessionKey = void 0;
        }
      })
    );
  }
  _registerEmptyFilesCloseFallback() {
    this._register(
      this._editorService.onDidCloseEditor((event) => {
        const sessionKey = this._getActiveNewSessionKey();
        if (!sessionKey || this._ctx.multipleSessionsVisibleObs.get() || this._ctx.isRestoringSessionLayout || this._layoutService.isEditorPartAutoVisibilitySuppressed() || !isMainPartEmpty(this._editorGroupsService)) {
          return;
        }
        this._pendingEntryHideSessionKey = void 0;
        this._pendingSidePaneOpenHideSessionKey = void 0;
        if (event.editor instanceof EmptyFileEditorInput) {
          this._hideSidePane();
          return;
        }
        const group = this._editorGroupsService.mainPart.getGroup(
          event.groupId
        );
        if (!group) {
          return;
        }
        const suppression = this._layoutService.suppressEditorPartAutoVisibility();
        void this._openEmptyFiles(
          group,
          sessionKey,
          this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)
        ).finally(() => suppression.dispose()).catch(onUnexpectedError);
      })
    );
  }
  _hideSidePane() {
    this._layoutService.hideSidePane();
  }
  async _openEmptyFiles(group, sessionKey, editorVisible) {
    const session = this._sessionsService.activeSession.get();
    const workspace = session?.workspace.get();
    if (!session || this._getActiveNewSessionKey() !== sessionKey || !workspace || !isMainPartEmpty(this._editorGroupsService)) {
      return;
    }
    await this._editorService.openEditor(
      this._instantiationService.createInstance(
        EmptyFileEditorInput,
        workspace
      ),
      {
        pinned: true,
        inactive: true,
        preserveFocus: true,
        activation: EditorActivation.PRESERVE,
        isExplicit: false
      },
      group
    );
    if (this._getActiveNewSessionKey() !== sessionKey) {
      return;
    }
    if (this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow) !== editorVisible) {
      this._layoutService.setPartHidden(!editorVisible, Parts.EDITOR_PART);
    }
    if (!this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
      this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
    }
    this._detailPanel.sync(DetailPanelTarget.FilesForced);
  }
  _getMainPartEditors() {
    return this._editorGroupsService.mainPart.groups.flatMap((group) => [
      ...group.editors
    ]);
  }
  _getActiveNewSessionKey() {
    const session = this._sessionsService.activeSession.get();
    if (!session || session.isCreated.get() || session.isQuickChat?.get() || !session.workspace.get() || this._ctx.multipleSessionsVisibleObs.get()) {
      return void 0;
    }
    return session.resource.toString();
  }
  _readActiveNewSessionKey(reader) {
    const session = this._sessionsService.activeSession.read(reader);
    if (!session || session.isCreated.read(reader) || (session.isQuickChat?.read(reader) ?? false) || !session.workspace.read(reader) || this._ctx.multipleSessionsVisibleObs.read(reader)) {
      return void 0;
    }
    return session.resource.toString();
  }
  // --- Detail panel ----------------------------------------------------------------------
  _registerDetailPanel() {
    const activeEditorObs = observableFromEvent(
      this,
      this._editorService.onDidActiveEditorChange,
      () => this._editorService.activeEditor
    );
    const editorPartVisibleObs = observableFromEvent(
      this,
      this._layoutService.onDidChangePartVisibility,
      () => this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)
    );
    const editorMaximizedObs = observableFromEvent(
      this,
      this._layoutService.onDidChangeEditorMaximized,
      () => this._layoutService.isEditorMaximized()
    );
    this._register(
      autorun((reader) => {
        const activeSession = this._sessionsService.activeSession.read(reader);
        if (!activeSession) {
          return;
        }
        const isQuickChat = activeSession.isQuickChat?.read(reader) ?? false;
        const workspace = activeSession.workspace.read(reader);
        if (isQuickChat || !workspace || activeSession.isCreated.read(reader)) {
          return;
        }
        const activeEditor = activeEditorObs.read(reader);
        const target = this._computeTarget(
          reader,
          activeEditor,
          editorMaximizedObs,
          editorPartVisibleObs
        );
        const revealOnly = this._ctx.multipleSessionsVisibleObs.read(reader);
        this._syncDetailVisibility(target, revealOnly);
        this._detailPanel.sync(target);
      })
    );
    this._register(
      this._layoutService.onDidChangePartVisibility((event) => {
        if (event.partId === Parts.AUXILIARYBAR_PART && event.source !== "resize") {
          this._detailHiddenTransiently = false;
        }
      })
    );
  }
  _syncDetailVisibility(target, revealOnly) {
    if (this._ctx.isRestoringSessionLayout || target === DetailPanelTarget.Preserve) {
      return;
    }
    const detailVisible = this._layoutService.isVisible(
      Parts.AUXILIARYBAR_PART
    );
    if (target === DetailPanelTarget.Hidden || target === DetailPanelTarget.BrowserHidden) {
      if (!revealOnly && detailVisible) {
        this._detailHiddenTransiently = true;
        this._layoutService.setAuxiliaryBarHiddenForResize(true);
      }
      return;
    }
    if (!this._detailHiddenTransiently || revealOnly || !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
      return;
    }
    this._detailHiddenTransiently = false;
    this._layoutService.setAuxiliaryBarHiddenForResize(false);
  }
  _computeTarget(reader, activeEditor, editorMaximizedObs, editorPartVisibleObs) {
    if (editorMaximizedObs.read(reader)) {
      return DetailPanelTarget.Changes;
    }
    if (!activeEditor) {
      return DetailPanelTarget.Files;
    }
    if (activeEditor instanceof BrowserEditorInput) {
      if (editorPartVisibleObs.read(reader)) {
        return DetailPanelTarget.BrowserHidden;
      }
      return DetailPanelTarget.Files;
    }
    if (isChangesEditorInput(activeEditor, this._sessionChangesService)) {
      return DetailPanelTarget.ChangesForced;
    }
    if (isFileEditorInput(activeEditor)) {
      return DetailPanelTarget.FilesForced;
    }
    return DetailPanelTarget.Preserve;
  }
};
SinglePaneNewSessionStrategy = __decorateClass([
  __decorateParam(2, IAgentWorkbenchLayoutService),
  __decorateParam(3, ISessionsService),
  __decorateParam(4, IEditorService),
  __decorateParam(5, IEditorGroupsService),
  __decorateParam(6, ISessionChangesService),
  __decorateParam(7, IInstantiationService)
], SinglePaneNewSessionStrategy);
export {
  SinglePaneNewSessionStrategy
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcbGF5b3V0XFxicm93c2VyXFxzaW5nbGVQYW5lXFxzaW5nbGVQYW5lTmV3U2Vzc2lvblN0cmF0ZWd5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQge1xuXHRhdXRvcnVuLFxuXHRJT2JzZXJ2YWJsZSxcblx0SVJlYWRlcixcblx0b2JzZXJ2YWJsZUZyb21FdmVudCxcblx0b2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCxcbn0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3RpdmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEJyb3dzZXJFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHtcblx0SUVkaXRvckdyb3VwLFxuXHRJRWRpdG9yR3JvdXBzU2VydmljZSxcbn0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUGFydHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93b3JrYmVuY2guanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uQ2hhbmdlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jaGFuZ2VzL2Jyb3dzZXIvc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVtcHR5RmlsZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZW1wdHlGaWxlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHtcblx0RGV0YWlsUGFuZWxUYXJnZXQsXG5cdFNpbmdsZVBhbmVEZXRhaWxQYW5lbENvb3JkaW5hdG9yLFxufSBmcm9tICcuL3NpbmdsZVBhbmVEZXRhaWxQYW5lbENvb3JkaW5hdG9yLmpzJztcbmltcG9ydCB7XG5cdGlzQ2hhbmdlc0VkaXRvcklucHV0LFxuXHRpc0ZpbGVFZGl0b3JJbnB1dCxcblx0aXNNYWluUGFydEVtcHR5LFxufSBmcm9tICcuL3NpbmdsZVBhbmVTaGFyZWRIZWxwZXJzLmpzJztcbmltcG9ydCB7XG5cdElTaW5nbGVQYW5lTGF5b3V0Q29udGV4dCxcblx0U2luZ2xlUGFuZUxheW91dFN0cmF0ZWd5LFxufSBmcm9tICcuL3NpbmdsZVBhbmVMYXlvdXRTdHJhdGVneS5qcyc7XG5cbi8qKlxuICogT3ducyB0aGUgaW5kZXBlbmRlbnQgZW50cnksIHNpZGUtcGFuZS10b2dnbGUsIGNsb3NlLWZhbGxiYWNrLCBhbmQgZGV0YWlsIHRyYW5zaXRpb25zIGZvciBOZXcgU2Vzc2lvbnMuXG4gKi9cbmV4cG9ydCBjbGFzcyBTaW5nbGVQYW5lTmV3U2Vzc2lvblN0cmF0ZWd5IGV4dGVuZHMgU2luZ2xlUGFuZUxheW91dFN0cmF0ZWd5IHtcblx0cHJpdmF0ZSBfcGVuZGluZ0VudHJ5SGlkZVNlc3Npb25LZXk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcGVuZGluZ1NpZGVQYW5lT3BlbkhpZGVTZXNzaW9uS2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2RldGFpbEhpZGRlblRyYW5zaWVudGx5ID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y3R4OiBJU2luZ2xlUGFuZUxheW91dENvbnRleHQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGV0YWlsUGFuZWw6IFNpbmdsZVBhbmVEZXRhaWxQYW5lbENvb3JkaW5hdG9yLFxuXHRcdEBJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGF5b3V0U2VydmljZTogSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASVNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZVxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvckdyb3Vwc1NlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlOiBJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihjdHgpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXJFbnRyeUVkaXRvckhpZGUoKTtcblx0XHR0aGlzLl9yZWdpc3RlclNpZGVQYW5lT3BlbkVkaXRvckhpZGUoKTtcblx0XHR0aGlzLl9yZWdpc3RlckVtcHR5RmlsZXNDbG9zZUZhbGxiYWNrKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJEZXRhaWxQYW5lbCgpO1xuXHR9XG5cblx0Ly8gLS0tIEVkaXRvciB2aXNpYmlsaXR5IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyRW50cnlFZGl0b3JIaWRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRvclNldENoYW5nZWQgPSBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50KFxuXHRcdFx0dGhpcyxcblx0XHRcdEV2ZW50LmFueShcblx0XHRcdFx0dGhpcy5fZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSxcblx0XHRcdFx0dGhpcy5fZWRpdG9yU2VydmljZS5vbkRpZEVkaXRvcnNDaGFuZ2UsXG5cdFx0XHRcdHRoaXMuX2VkaXRvclNlcnZpY2Uub25EaWRDbG9zZUVkaXRvcixcblx0XHRcdFx0dGhpcy5fY3R4Lm9uRGlkRW5kU2Vzc2lvbkxheW91dFJlc3RvcmUsXG5cdFx0XHQpLFxuXHRcdCk7XG5cdFx0bGV0IGFjdGl2ZU5ld1Nlc3Npb25LZXk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0dGhpcy5fZWRpdG9yU2VydmljZS5vbldpbGxPcGVuRWRpdG9yKChldmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuX2dldEFjdGl2ZU5ld1Nlc3Npb25LZXkoKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIShldmVudC5lZGl0b3IgaW5zdGFuY2VvZiBFbXB0eUZpbGVFZGl0b3JJbnB1dCkpIHtcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nRW50cnlIaWRlU2Vzc2lvbktleSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0KTtcblxuXHRcdGNvbnN0IGFwcGx5UGVuZGluZ0VudHJ5ID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGVuZGluZ1Nlc3Npb25LZXkgPSB0aGlzLl9wZW5kaW5nRW50cnlIaWRlU2Vzc2lvbktleTtcblx0XHRcdGlmICghcGVuZGluZ1Nlc3Npb25LZXkgfHwgdGhpcy5fY3R4LmlzUmVzdG9yaW5nU2Vzc2lvbkxheW91dCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fZ2V0QWN0aXZlTmV3U2Vzc2lvbktleSgpICE9PSBwZW5kaW5nU2Vzc2lvbktleSkge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nRW50cnlIaWRlU2Vzc2lvbktleSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlZGl0b3JzID0gdGhpcy5fZ2V0TWFpblBhcnRFZGl0b3JzKCk7XG5cdFx0XHRpZiAoZWRpdG9ycy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFlZGl0b3JzLmV2ZXJ5KChlZGl0b3IpID0+IGVkaXRvciBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3BlbmRpbmdFbnRyeUhpZGVTZXNzaW9uS2V5ID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKCF0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgbWFpbldpbmRvdykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdXBwcmVzc2lvbiA9XG5cdFx0XHRcdHRoaXMuX2xheW91dFNlcnZpY2Uuc3VwcHJlc3NFZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHkoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX2xheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbih0cnVlLCBQYXJ0cy5FRElUT1JfUEFSVCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRzdXBwcmVzc2lvbi5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0YXV0b3J1bigocmVhZGVyKSA9PiB7XG5cdFx0XHRcdGVkaXRvclNldENoYW5nZWQucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uS2V5ID0gdGhpcy5fcmVhZEFjdGl2ZU5ld1Nlc3Npb25LZXkocmVhZGVyKTtcblx0XHRcdFx0aWYgKCFzZXNzaW9uS2V5KSB7XG5cdFx0XHRcdFx0YWN0aXZlTmV3U2Vzc2lvbktleSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nRW50cnlIaWRlU2Vzc2lvbktleSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoYWN0aXZlTmV3U2Vzc2lvbktleSAhPT0gc2Vzc2lvbktleSkge1xuXHRcdFx0XHRcdGFjdGl2ZU5ld1Nlc3Npb25LZXkgPSBzZXNzaW9uS2V5O1xuXHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdTaWRlUGFuZU9wZW5IaWRlU2Vzc2lvbktleSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nRW50cnlIaWRlU2Vzc2lvbktleSA9IHNlc3Npb25LZXk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXBwbHlQZW5kaW5nRW50cnkoKTtcblx0XHRcdH0pLFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlclNpZGVQYW5lT3BlbkVkaXRvckhpZGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgYXBwbHlQZW5kaW5nU2lkZVBhbmVPcGVuID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGVuZGluZ1Nlc3Npb25LZXkgPSB0aGlzLl9wZW5kaW5nU2lkZVBhbmVPcGVuSGlkZVNlc3Npb25LZXk7XG5cdFx0XHRpZiAoIXBlbmRpbmdTZXNzaW9uS2V5IHx8IHRoaXMuX2N0eC5pc1Jlc3RvcmluZ1Nlc3Npb25MYXlvdXQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2dldEFjdGl2ZU5ld1Nlc3Npb25LZXkoKSAhPT0gcGVuZGluZ1Nlc3Npb25LZXkpIHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1NpZGVQYW5lT3BlbkhpZGVTZXNzaW9uS2V5ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGVkaXRvcnMgPSB0aGlzLl9nZXRNYWluUGFydEVkaXRvcnMoKTtcblx0XHRcdGlmIChlZGl0b3JzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wZW5kaW5nU2lkZVBhbmVPcGVuSGlkZVNlc3Npb25LZXkgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdGVkaXRvcnMubGVuZ3RoICE9PSAxIHx8XG5cdFx0XHRcdCEoZWRpdG9yc1swXSBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KVxuXHRcdFx0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3VwcHJlc3Npb24gPVxuXHRcdFx0XHR0aGlzLl9sYXlvdXRTZXJ2aWNlLnN1cHByZXNzRWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5KCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAoIXRoaXMuX2xheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSkge1xuXHRcdFx0XHRcdHRoaXMuX2xheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbihmYWxzZSwgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgbWFpbldpbmRvdykpIHtcblx0XHRcdFx0XHR0aGlzLl9sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4odHJ1ZSwgUGFydHMuRURJVE9SX1BBUlQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRzdXBwcmVzc2lvbi5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0dGhpcy5fZWRpdG9yU2VydmljZS5vbldpbGxPcGVuRWRpdG9yKChldmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuX2dldEFjdGl2ZU5ld1Nlc3Npb25LZXkoKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIShldmVudC5lZGl0b3IgaW5zdGFuY2VvZiBFbXB0eUZpbGVFZGl0b3JJbnB1dCkpIHtcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nU2lkZVBhbmVPcGVuSGlkZVNlc3Npb25LZXkgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0pLFxuXHRcdCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHRFdmVudC5hbnkoXG5cdFx0XHRcdHRoaXMuX2VkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UsXG5cdFx0XHRcdHRoaXMuX2VkaXRvclNlcnZpY2Uub25EaWRFZGl0b3JzQ2hhbmdlLFxuXHRcdFx0XHR0aGlzLl9lZGl0b3JTZXJ2aWNlLm9uRGlkQ2xvc2VFZGl0b3IsXG5cdFx0XHRcdHRoaXMuX2N0eC5vbkRpZEVuZFNlc3Npb25MYXlvdXRSZXN0b3JlLFxuXHRcdFx0KShhcHBseVBlbmRpbmdTaWRlUGFuZU9wZW4pLFxuXHRcdCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHR0aGlzLl9sYXlvdXRTZXJ2aWNlLm9uRGlkVG9nZ2xlU2lkZVBhbmUoKHsgYmVmb3JlLCBhZnRlciB9KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25LZXkgPSB0aGlzLl9nZXRBY3RpdmVOZXdTZXNzaW9uS2V5KCk7XG5cdFx0XHRcdGlmICghc2Vzc2lvbktleSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBvcGVuZWQgPVxuXHRcdFx0XHRcdCFiZWZvcmUuZWRpdG9yICYmXG5cdFx0XHRcdFx0IWJlZm9yZS5hdXhpbGlhcnlCYXIgJiZcblx0XHRcdFx0XHQoYWZ0ZXIuZWRpdG9yIHx8IGFmdGVyLmF1eGlsaWFyeUJhcik7XG5cdFx0XHRcdGlmICghb3BlbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZ1NpZGVQYW5lT3BlbkhpZGVTZXNzaW9uS2V5ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdFbnRyeUhpZGVTZXNzaW9uS2V5ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nU2lkZVBhbmVPcGVuSGlkZVNlc3Npb25LZXkgPSBzZXNzaW9uS2V5O1xuXHRcdFx0XHRhcHBseVBlbmRpbmdTaWRlUGFuZU9wZW4oKTtcblx0XHRcdH0pLFxuXHRcdCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHRhdXRvcnVuKChyZWFkZXIpID0+IHtcblx0XHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbktleSA9IHRoaXMuX3JlYWRBY3RpdmVOZXdTZXNzaW9uS2V5KHJlYWRlcik7XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nU2lkZVBhbmVPcGVuSGlkZVNlc3Npb25LZXkgJiZcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nU2lkZVBhbmVPcGVuSGlkZVNlc3Npb25LZXkgIT09IGFjdGl2ZVNlc3Npb25LZXlcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZ1NpZGVQYW5lT3BlbkhpZGVTZXNzaW9uS2V5ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSxcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJFbXB0eUZpbGVzQ2xvc2VGYWxsYmFjaygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcihcblx0XHRcdHRoaXMuX2VkaXRvclNlcnZpY2Uub25EaWRDbG9zZUVkaXRvcigoZXZlbnQpID0+IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbktleSA9IHRoaXMuX2dldEFjdGl2ZU5ld1Nlc3Npb25LZXkoKTtcblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdCFzZXNzaW9uS2V5IHx8XG5cdFx0XHRcdFx0dGhpcy5fY3R4Lm11bHRpcGxlU2Vzc2lvbnNWaXNpYmxlT2JzLmdldCgpIHx8XG5cdFx0XHRcdFx0dGhpcy5fY3R4LmlzUmVzdG9yaW5nU2Vzc2lvbkxheW91dCB8fFxuXHRcdFx0XHRcdHRoaXMuX2xheW91dFNlcnZpY2UuaXNFZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHlTdXBwcmVzc2VkKCkgfHxcblx0XHRcdFx0XHQhaXNNYWluUGFydEVtcHR5KHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UpXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9wZW5kaW5nRW50cnlIaWRlU2Vzc2lvbktleSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1NpZGVQYW5lT3BlbkhpZGVTZXNzaW9uS2V5ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoZXZlbnQuZWRpdG9yIGluc3RhbmNlb2YgRW1wdHlGaWxlRWRpdG9ySW5wdXQpIHtcblx0XHRcdFx0XHR0aGlzLl9oaWRlU2lkZVBhbmUoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLl9lZGl0b3JHcm91cHNTZXJ2aWNlLm1haW5QYXJ0LmdldEdyb3VwKFxuXHRcdFx0XHRcdGV2ZW50Lmdyb3VwSWQsXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGlmICghZ3JvdXApIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc3VwcHJlc3Npb24gPVxuXHRcdFx0XHRcdHRoaXMuX2xheW91dFNlcnZpY2Uuc3VwcHJlc3NFZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHkoKTtcblx0XHRcdFx0dm9pZCB0aGlzLl9vcGVuRW1wdHlGaWxlcyhcblx0XHRcdFx0XHRncm91cCxcblx0XHRcdFx0XHRzZXNzaW9uS2V5LFxuXHRcdFx0XHRcdHRoaXMuX2xheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJULCBtYWluV2luZG93KSxcblx0XHRcdFx0KVxuXHRcdFx0XHRcdC5maW5hbGx5KCgpID0+IHN1cHByZXNzaW9uLmRpc3Bvc2UoKSlcblx0XHRcdFx0XHQuY2F0Y2gob25VbmV4cGVjdGVkRXJyb3IpO1xuXHRcdFx0fSksXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX2hpZGVTaWRlUGFuZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9sYXlvdXRTZXJ2aWNlLmhpZGVTaWRlUGFuZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfb3BlbkVtcHR5RmlsZXMoXG5cdFx0Z3JvdXA6IElFZGl0b3JHcm91cCxcblx0XHRzZXNzaW9uS2V5OiBzdHJpbmcsXG5cdFx0ZWRpdG9yVmlzaWJsZTogYm9vbGVhbixcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHNlc3Npb24/LndvcmtzcGFjZS5nZXQoKTtcblx0XHRpZiAoXG5cdFx0XHQhc2Vzc2lvbiB8fFxuXHRcdFx0dGhpcy5fZ2V0QWN0aXZlTmV3U2Vzc2lvbktleSgpICE9PSBzZXNzaW9uS2V5IHx8XG5cdFx0XHQhd29ya3NwYWNlIHx8XG5cdFx0XHQhaXNNYWluUGFydEVtcHR5KHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UpXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihcblx0XHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRFbXB0eUZpbGVFZGl0b3JJbnB1dCxcblx0XHRcdFx0d29ya3NwYWNlLFxuXHRcdFx0KSxcblx0XHRcdHtcblx0XHRcdFx0cGlubmVkOiB0cnVlLFxuXHRcdFx0XHRpbmFjdGl2ZTogdHJ1ZSxcblx0XHRcdFx0cHJlc2VydmVGb2N1czogdHJ1ZSxcblx0XHRcdFx0YWN0aXZhdGlvbjogRWRpdG9yQWN0aXZhdGlvbi5QUkVTRVJWRSxcblx0XHRcdFx0aXNFeHBsaWNpdDogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdFx0Z3JvdXAsXG5cdFx0KTtcblx0XHRpZiAodGhpcy5fZ2V0QWN0aXZlTmV3U2Vzc2lvbktleSgpICE9PSBzZXNzaW9uS2V5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChcblx0XHRcdHRoaXMuX2xheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJULCBtYWluV2luZG93KSAhPT1cblx0XHRcdGVkaXRvclZpc2libGVcblx0XHQpIHtcblx0XHRcdHRoaXMuX2xheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbighZWRpdG9yVmlzaWJsZSwgUGFydHMuRURJVE9SX1BBUlQpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2xheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSkge1xuXHRcdFx0dGhpcy5fbGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKGZhbHNlLCBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCk7XG5cdFx0fVxuXHRcdHRoaXMuX2RldGFpbFBhbmVsLnN5bmMoRGV0YWlsUGFuZWxUYXJnZXQuRmlsZXNGb3JjZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TWFpblBhcnRFZGl0b3JzKCk6IEVkaXRvcklucHV0W10ge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0b3JHcm91cHNTZXJ2aWNlLm1haW5QYXJ0Lmdyb3Vwcy5mbGF0TWFwKChncm91cCkgPT4gW1xuXHRcdFx0Li4uZ3JvdXAuZWRpdG9ycyxcblx0XHRdKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEFjdGl2ZU5ld1Nlc3Npb25LZXkoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKFxuXHRcdFx0IXNlc3Npb24gfHxcblx0XHRcdHNlc3Npb24uaXNDcmVhdGVkLmdldCgpIHx8XG5cdFx0XHRzZXNzaW9uLmlzUXVpY2tDaGF0Py5nZXQoKSB8fFxuXHRcdFx0IXNlc3Npb24ud29ya3NwYWNlLmdldCgpIHx8XG5cdFx0XHR0aGlzLl9jdHgubXVsdGlwbGVTZXNzaW9uc1Zpc2libGVPYnMuZ2V0KClcblx0XHQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWFkQWN0aXZlTmV3U2Vzc2lvbktleShyZWFkZXI6IElSZWFkZXIpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKFxuXHRcdFx0IXNlc3Npb24gfHxcblx0XHRcdHNlc3Npb24uaXNDcmVhdGVkLnJlYWQocmVhZGVyKSB8fFxuXHRcdFx0KHNlc3Npb24uaXNRdWlja0NoYXQ/LnJlYWQocmVhZGVyKSA/PyBmYWxzZSkgfHxcblx0XHRcdCFzZXNzaW9uLndvcmtzcGFjZS5yZWFkKHJlYWRlcikgfHxcblx0XHRcdHRoaXMuX2N0eC5tdWx0aXBsZVNlc3Npb25zVmlzaWJsZU9icy5yZWFkKHJlYWRlcilcblx0XHQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdH1cblxuXHQvLyAtLS0gRGV0YWlsIHBhbmVsIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9yZWdpc3RlckRldGFpbFBhbmVsKCk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvck9icyA9IG9ic2VydmFibGVGcm9tRXZlbnQoXG5cdFx0XHR0aGlzLFxuXHRcdFx0dGhpcy5fZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSxcblx0XHRcdCgpID0+IHRoaXMuX2VkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yLFxuXHRcdCk7XG5cdFx0Y29uc3QgZWRpdG9yUGFydFZpc2libGVPYnMgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KFxuXHRcdFx0dGhpcyxcblx0XHRcdHRoaXMuX2xheW91dFNlcnZpY2Uub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eSxcblx0XHRcdCgpID0+IHRoaXMuX2xheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJULCBtYWluV2luZG93KSxcblx0XHQpO1xuXHRcdGNvbnN0IGVkaXRvck1heGltaXplZE9icyA9IG9ic2VydmFibGVGcm9tRXZlbnQoXG5cdFx0XHR0aGlzLFxuXHRcdFx0dGhpcy5fbGF5b3V0U2VydmljZS5vbkRpZENoYW5nZUVkaXRvck1heGltaXplZCxcblx0XHRcdCgpID0+IHRoaXMuX2xheW91dFNlcnZpY2UuaXNFZGl0b3JNYXhpbWl6ZWQoKSxcblx0XHQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHRhdXRvcnVuKChyZWFkZXIpID0+IHtcblx0XHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKCFhY3RpdmVTZXNzaW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGlzUXVpY2tDaGF0ID0gYWN0aXZlU2Vzc2lvbi5pc1F1aWNrQ2hhdD8ucmVhZChyZWFkZXIpID8/IGZhbHNlO1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBhY3RpdmVTZXNzaW9uLndvcmtzcGFjZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChpc1F1aWNrQ2hhdCB8fCAhd29ya3NwYWNlIHx8IGFjdGl2ZVNlc3Npb24uaXNDcmVhdGVkLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGFjdGl2ZUVkaXRvck9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX2NvbXB1dGVUYXJnZXQoXG5cdFx0XHRcdFx0cmVhZGVyLFxuXHRcdFx0XHRcdGFjdGl2ZUVkaXRvcixcblx0XHRcdFx0XHRlZGl0b3JNYXhpbWl6ZWRPYnMsXG5cdFx0XHRcdFx0ZWRpdG9yUGFydFZpc2libGVPYnMsXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGNvbnN0IHJldmVhbE9ubHkgPSB0aGlzLl9jdHgubXVsdGlwbGVTZXNzaW9uc1Zpc2libGVPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHR0aGlzLl9zeW5jRGV0YWlsVmlzaWJpbGl0eSh0YXJnZXQsIHJldmVhbE9ubHkpO1xuXHRcdFx0XHR0aGlzLl9kZXRhaWxQYW5lbC5zeW5jKHRhcmdldCk7XG5cdFx0XHR9KSxcblx0XHQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0dGhpcy5fbGF5b3V0U2VydmljZS5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5KChldmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0ZXZlbnQucGFydElkID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJlxuXHRcdFx0XHRcdGV2ZW50LnNvdXJjZSAhPT0gJ3Jlc2l6ZSdcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0dGhpcy5fZGV0YWlsSGlkZGVuVHJhbnNpZW50bHkgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX3N5bmNEZXRhaWxWaXNpYmlsaXR5KFxuXHRcdHRhcmdldDogRGV0YWlsUGFuZWxUYXJnZXQsXG5cdFx0cmV2ZWFsT25seTogYm9vbGVhbixcblx0KTogdm9pZCB7XG5cdFx0aWYgKFxuXHRcdFx0dGhpcy5fY3R4LmlzUmVzdG9yaW5nU2Vzc2lvbkxheW91dCB8fFxuXHRcdFx0dGFyZ2V0ID09PSBEZXRhaWxQYW5lbFRhcmdldC5QcmVzZXJ2ZVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRldGFpbFZpc2libGUgPSB0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShcblx0XHRcdFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULFxuXHRcdCk7XG5cdFx0aWYgKFxuXHRcdFx0dGFyZ2V0ID09PSBEZXRhaWxQYW5lbFRhcmdldC5IaWRkZW4gfHxcblx0XHRcdHRhcmdldCA9PT0gRGV0YWlsUGFuZWxUYXJnZXQuQnJvd3NlckhpZGRlblxuXHRcdCkge1xuXHRcdFx0aWYgKCFyZXZlYWxPbmx5ICYmIGRldGFpbFZpc2libGUpIHtcblx0XHRcdFx0dGhpcy5fZGV0YWlsSGlkZGVuVHJhbnNpZW50bHkgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9sYXlvdXRTZXJ2aWNlLnNldEF1eGlsaWFyeUJhckhpZGRlbkZvclJlc2l6ZSh0cnVlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoXG5cdFx0XHQhdGhpcy5fZGV0YWlsSGlkZGVuVHJhbnNpZW50bHkgfHxcblx0XHRcdHJldmVhbE9ubHkgfHxcblx0XHRcdCF0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgbWFpbldpbmRvdylcblx0XHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGV0YWlsSGlkZGVuVHJhbnNpZW50bHkgPSBmYWxzZTtcblx0XHR0aGlzLl9sYXlvdXRTZXJ2aWNlLnNldEF1eGlsaWFyeUJhckhpZGRlbkZvclJlc2l6ZShmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlVGFyZ2V0KFxuXHRcdHJlYWRlcjogSVJlYWRlcixcblx0XHRhY3RpdmVFZGl0b3I6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkLFxuXHRcdGVkaXRvck1heGltaXplZE9iczogSU9ic2VydmFibGU8Ym9vbGVhbj4sXG5cdFx0ZWRpdG9yUGFydFZpc2libGVPYnM6IElPYnNlcnZhYmxlPGJvb2xlYW4+LFxuXHQpOiBEZXRhaWxQYW5lbFRhcmdldCB7XG5cdFx0Ly8gQSBOZXcgU2Vzc2lvbidzIGVtcHR5IGVkaXRvciBncm91cCBpcyBub3JtYWwgKHRoZSBGaWxlcyBkZXRhaWwgaXMgb3duZWQgYnkgdGhlXG5cdFx0Ly8gbWFuYWdlZC10YWJzIHJlY29uY2lsZSB3aGlsZSBpdHMgRmlsZXMgdGFiIGlzIChyZSllbnN1cmVkKSwgdW5saWtlIGFuIEV4aXN0aW5nXG5cdFx0Ly8gU2Vzc2lvbiB3aGVyZSBhbiBlbXB0eSBncm91cCBtZWFucyB0aGUgd2hvbGUgc2lkZSBwYW5lIHdhcyBjbG9zZWQgXHUyMDE0IHNvLCB1bmxpa2Vcblx0XHQvLyBFeGlzdGluZywgTmV3IG5ldmVyIGhpZGVzIG9uIGFuIGVtcHR5IGdyb3VwLlxuXG5cdFx0aWYgKGVkaXRvck1heGltaXplZE9icy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdHJldHVybiBEZXRhaWxQYW5lbFRhcmdldC5DaGFuZ2VzO1xuXHRcdH1cblxuXHRcdGlmICghYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gRGV0YWlsUGFuZWxUYXJnZXQuRmlsZXM7XG5cdFx0fVxuXG5cdFx0aWYgKGFjdGl2ZUVkaXRvciBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3JJbnB1dCkge1xuXHRcdFx0Ly8gQnJvd3NlciBoYXMgbm8gZGV0YWlsIG9mIGl0cyBvd24sIHNvIGl0IG9ubHkgaGlkZXMgdGhlIHBhbmVsIHdoaWxlIHRoZSBlZGl0b3Jcblx0XHRcdC8vIGFyZWEgaXMgdmlzaWJsZTsgb25jZSBoaWRkZW4sIGZhbGwgYmFjayB0byBGaWxlcyBpbnN0ZWFkIG9mIGxlYXZpbmcgaXQgYmxhbmsuXG5cdFx0XHRpZiAoZWRpdG9yUGFydFZpc2libGVPYnMucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHJldHVybiBEZXRhaWxQYW5lbFRhcmdldC5Ccm93c2VySGlkZGVuO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIERldGFpbFBhbmVsVGFyZ2V0LkZpbGVzO1xuXHRcdH1cblxuXHRcdGlmIChpc0NoYW5nZXNFZGl0b3JJbnB1dChhY3RpdmVFZGl0b3IsIHRoaXMuX3Nlc3Npb25DaGFuZ2VzU2VydmljZSkpIHtcblx0XHRcdHJldHVybiBEZXRhaWxQYW5lbFRhcmdldC5DaGFuZ2VzRm9yY2VkO1xuXHRcdH1cblxuXHRcdGlmIChpc0ZpbGVFZGl0b3JJbnB1dChhY3RpdmVFZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm4gRGV0YWlsUGFuZWxUYXJnZXQuRmlsZXNGb3JjZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIERldGFpbFBhbmVsVGFyZ2V0LlByZXNlcnZlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsYUFBYTtBQUN0QjtBQUFBLEVBQ0M7QUFBQSxFQUdBO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFDUCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLDBCQUEwQjtBQUNuQztBQUFBLEVBRUM7QUFBQSxPQUNNO0FBQ1AsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsNEJBQTRCO0FBQ3JDO0FBQUEsRUFDQztBQUFBLE9BRU07QUFDUDtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFDUDtBQUFBLEVBRUM7QUFBQSxPQUNNO0FBS0EsSUFBTSwrQkFBTixjQUEyQyx5QkFBeUI7QUFBQSxFQUsxRSxZQUNDLEtBQ2lCLGNBRUEsZ0JBQ2tCLGtCQUNGLGdCQUVoQixzQkFFQSx3QkFFQSx1QkFDaEI7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
