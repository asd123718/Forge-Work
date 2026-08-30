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
import { Event } from "../../../../base/common/event.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { parse } from "../../../../base/common/marshalling.js";
import { isEqual } from "../../../../base/common/resources.js";
import { isFalsyOrWhitespace } from "../../../../base/common/strings.js";
import { assertType } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { IBulkEditService } from "../../../../editor/browser/services/bulkEditService.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../editor/common/languages/modesRegistry.js";
import { localize2 } from "../../../../nls.js";
import { AccessibleViewRegistry } from "../../../../platform/accessibility/browser/accessibleViewRegistry.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { EditorExtensions } from "../../../common/editor.js";
import { IEditorResolverService, RegisteredEditorPriority } from "../../../services/editor/common/editorResolverService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { IWorkingCopyEditorService } from "../../../services/workingCopy/common/workingCopyEditorService.js";
import { ResourceNotebookCellEdit } from "../../bulkEdit/browser/bulkCellEdits.js";
import { getReplView } from "../../debug/browser/repl.js";
import { REPL_VIEW_ID } from "../../debug/common/debug.js";
import { InlineChatController } from "../../inlineChat/browser/inlineChatController.js";
import { IInteractiveHistoryService } from "../../interactive/browser/interactiveHistoryService.js";
import { NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT } from "../../notebook/browser/controller/coreActions.js";
import * as icons from "../../notebook/browser/notebookIcons.js";
import { ReplEditorAccessibleView } from "../../notebook/browser/replEditorAccessibleView.js";
import { INotebookEditorService } from "../../notebook/browser/services/notebookEditorService.js";
import { CellEditType, CellKind, NotebookSetting, NotebookWorkingCopyTypeIdentifier, REPL_EDITOR_ID } from "../../notebook/common/notebookCommon.js";
import { IS_COMPOSITE_NOTEBOOK, MOST_RECENT_REPL_EDITOR, NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_EDITOR_FOCUSED } from "../../notebook/common/notebookContextKeys.js";
import { INotebookEditorModelResolverService } from "../../notebook/common/notebookEditorModelResolverService.js";
import { INotebookService } from "../../notebook/common/notebookService.js";
import { isReplEditorControl, ReplEditor } from "./replEditor.js";
import { ReplEditorHistoryAccessibilityHelp, ReplEditorInputAccessibilityHelp } from "./replEditorAccessibilityHelp.js";
import { ReplEditorInput } from "./replEditorInput.js";
class ReplEditorSerializer {
  canSerialize(input) {
    return input.typeId === ReplEditorInput.ID;
  }
  serialize(input) {
    assertType(input instanceof ReplEditorInput);
    const data = {
      resource: input.resource,
      preferredResource: input.preferredResource,
      viewType: input.viewType,
      options: input.options,
      label: input.getName()
    };
    return JSON.stringify(data);
  }
  deserialize(instantiationService, raw) {
    const data = parse(raw);
    if (!data) {
      return void 0;
    }
    const { resource, viewType } = data;
    if (!data || !URI.isUri(resource) || typeof viewType !== "string") {
      return void 0;
    }
    const input = instantiationService.createInstance(ReplEditorInput, resource, data.label);
    return input;
  }
}
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    ReplEditor,
    REPL_EDITOR_ID,
    "REPL Editor"
  ),
  [
    new SyncDescriptor(ReplEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(
  ReplEditorInput.ID,
  ReplEditorSerializer
);
let ReplDocumentContribution = class extends Disposable {
  constructor(notebookService, editorResolverService, notebookEditorModelResolverService, instantiationService, configurationService) {
    super();
    this.notebookEditorModelResolverService = notebookEditorModelResolverService;
    this.instantiationService = instantiationService;
    this.configurationService = configurationService;
    this.editorInputCache = new ResourceMap();
    editorResolverService.registerEditor(
      // don't match anything, we don't need to support re-opening files as REPL editor at this point
      ` `,
      {
        id: "repl",
        label: "repl Editor",
        priority: RegisteredEditorPriority.option
      },
      {
        // We want to support all notebook types which could have any file extension,
        // so we just check if the resource corresponds to a notebook
        canSupportResource: (uri) => notebookService.getNotebookTextModel(uri) !== void 0,
        singlePerResource: true
      },
      {
        createUntitledEditorInput: async ({ resource, options }) => {
          if (resource) {
            const editor2 = this.editorInputCache.get(resource);
            if (editor2 && !editor2.isDisposed()) {
              return { editor: editor2, options };
            } else if (editor2) {
              this.editorInputCache.delete(resource);
            }
          }
          const scratchpad = this.configurationService.getValue(NotebookSetting.InteractiveWindowPromptToSave) !== true;
          const ref = await this.notebookEditorModelResolverService.resolve({ untitledResource: resource }, "jupyter-notebook", { scratchpad, viewType: "repl" });
          const notebookUri = ref.object.notebook.uri;
          Event.once(ref.object.notebook.onWillDispose)(() => {
            ref.dispose();
          });
          const label = options?.label ?? void 0;
          const editor = this.instantiationService.createInstance(ReplEditorInput, notebookUri, label);
          this.editorInputCache.set(notebookUri, editor);
          Event.once(editor.onWillDispose)(() => this.editorInputCache.delete(notebookUri));
          return { editor, options };
        },
        createEditorInput: async ({ resource, options }) => {
          if (this.editorInputCache.has(resource)) {
            return { editor: this.editorInputCache.get(resource), options };
          }
          const label = options?.label ?? void 0;
          const editor = this.instantiationService.createInstance(ReplEditorInput, resource, label);
          this.editorInputCache.set(resource, editor);
          Event.once(editor.onWillDispose)(() => this.editorInputCache.delete(resource));
          return { editor, options };
        }
      }
    );
  }
};
ReplDocumentContribution.ID = "workbench.contrib.replDocument";
ReplDocumentContribution = __decorateClass([
  __decorateParam(0, INotebookService),
  __decorateParam(1, IEditorResolverService),
  __decorateParam(2, INotebookEditorModelResolverService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IConfigurationService)
], ReplDocumentContribution);
let ReplWindowWorkingCopyEditorHandler = class extends Disposable {
  constructor(instantiationService, workingCopyEditorService, extensionService, notebookService) {
    super();
    this.instantiationService = instantiationService;
    this.workingCopyEditorService = workingCopyEditorService;
    this.extensionService = extensionService;
    this.notebookService = notebookService;
    this._installHandler();
  }
  async handles(workingCopy) {
    const notebookType = this._getNotebookType(workingCopy);
    if (!notebookType) {
      return false;
    }
    return !!notebookType && notebookType.viewType === "repl" && await this.notebookService.canResolve(notebookType.notebookType);
  }
  isOpen(workingCopy, editor) {
    if (!this.handles(workingCopy)) {
      return false;
    }
    return editor instanceof ReplEditorInput && isEqual(workingCopy.resource, editor.resource);
  }
  createEditor(workingCopy) {
    return this.instantiationService.createInstance(ReplEditorInput, workingCopy.resource, void 0);
  }
  async _installHandler() {
    await this.extensionService.whenInstalledExtensionsRegistered();
    this._register(this.workingCopyEditorService.registerHandler(this));
  }
  _getNotebookType(workingCopy) {
    return NotebookWorkingCopyTypeIdentifier.parse(workingCopy.typeId);
  }
};
ReplWindowWorkingCopyEditorHandler.ID = "workbench.contrib.replWorkingCopyEditorHandler";
ReplWindowWorkingCopyEditorHandler = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IWorkingCopyEditorService),
  __decorateParam(2, IExtensionService),
  __decorateParam(3, INotebookService)
], ReplWindowWorkingCopyEditorHandler);
registerWorkbenchContribution2(ReplWindowWorkingCopyEditorHandler.ID, ReplWindowWorkingCopyEditorHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ReplDocumentContribution.ID, ReplDocumentContribution, WorkbenchPhase.BlockRestore);
AccessibleViewRegistry.register(new ReplEditorInputAccessibilityHelp());
AccessibleViewRegistry.register(new ReplEditorHistoryAccessibilityHelp());
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "repl.focusLastItemExecuted",
      title: localize2("repl.focusLastReplOutput", "Focus Most Recent REPL Execution"),
      category: "REPL",
      menu: {
        id: MenuId.CommandPalette,
        when: MOST_RECENT_REPL_EDITOR
      },
      keybinding: [{
        primary: KeyChord(KeyMod.Alt | KeyCode.End, KeyMod.Alt | KeyCode.End),
        weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT,
        when: ContextKeyExpr.or(IS_COMPOSITE_NOTEBOOK, NOTEBOOK_CELL_LIST_FOCUSED.negate())
      }],
      precondition: MOST_RECENT_REPL_EDITOR
    });
  }
  async run(accessor, context) {
    const editorService = accessor.get(IEditorService);
    const editorControl = editorService.activeEditorPane?.getControl();
    const contextKeyService = accessor.get(IContextKeyService);
    let notebookEditor;
    if (editorControl && isReplEditorControl(editorControl)) {
      notebookEditor = editorControl.notebookEditor;
    } else {
      const uriString = MOST_RECENT_REPL_EDITOR.getValue(contextKeyService);
      const uri = uriString ? URI.parse(uriString) : void 0;
      if (!uri) {
        return;
      }
      const replEditor = editorService.findEditors(uri)[0];
      if (replEditor) {
        const editor = await editorService.openEditor(replEditor.editor, replEditor.groupId);
        const editorControl2 = editor?.getControl();
        if (editorControl2 && isReplEditorControl(editorControl2)) {
          notebookEditor = editorControl2.notebookEditor;
        }
      }
    }
    const viewModel = notebookEditor?.getViewModel();
    if (notebookEditor && viewModel) {
      const lastCellIndex = viewModel.length - 1;
      if (lastCellIndex >= 0) {
        const cell = viewModel.viewCells[lastCellIndex];
        notebookEditor.focusNotebookCell(cell, "container");
      }
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "repl.input.focus",
      title: localize2("repl.input.focus", "Focus Input Editor"),
      category: "REPL",
      menu: {
        id: MenuId.CommandPalette,
        when: MOST_RECENT_REPL_EDITOR
      },
      keybinding: [{
        when: ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK, NOTEBOOK_EDITOR_FOCUSED),
        weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT,
        primary: KeyMod.CtrlCmd | KeyCode.DownArrow
      }, {
        when: ContextKeyExpr.and(MOST_RECENT_REPL_EDITOR),
        weight: KeybindingWeight.WorkbenchContrib + 5,
        primary: KeyChord(KeyMod.Alt | KeyCode.Home, KeyMod.Alt | KeyCode.Home)
      }]
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const editorControl = editorService.activeEditorPane?.getControl();
    const contextKeyService = accessor.get(IContextKeyService);
    if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
      editorService.activeEditorPane?.focus();
    } else {
      const uriString = MOST_RECENT_REPL_EDITOR.getValue(contextKeyService);
      const uri = uriString ? URI.parse(uriString) : void 0;
      if (!uri) {
        return;
      }
      const replEditor = editorService.findEditors(uri)[0];
      if (replEditor) {
        await editorService.openEditor({ resource: uri, options: { preserveFocus: false } }, replEditor.groupId);
      }
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "repl.execute",
      title: localize2("repl.execute", "Execute REPL input"),
      category: "REPL",
      keybinding: [{
        when: ContextKeyExpr.and(
          IS_COMPOSITE_NOTEBOOK,
          ContextKeyExpr.equals("activeEditor", "workbench.editor.repl"),
          NOTEBOOK_CELL_LIST_FOCUSED.negate()
        ),
        primary: KeyMod.CtrlCmd | KeyCode.Enter,
        weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
      }, {
        when: ContextKeyExpr.and(
          IS_COMPOSITE_NOTEBOOK,
          ContextKeyExpr.equals("activeEditor", "workbench.editor.repl"),
          ContextKeyExpr.equals("config.interactiveWindow.executeWithShiftEnter", true),
          NOTEBOOK_CELL_LIST_FOCUSED.negate()
        ),
        primary: KeyMod.Shift | KeyCode.Enter,
        weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
      }, {
        when: ContextKeyExpr.and(
          IS_COMPOSITE_NOTEBOOK,
          ContextKeyExpr.equals("activeEditor", "workbench.editor.repl"),
          ContextKeyExpr.equals("config.interactiveWindow.executeWithShiftEnter", false),
          NOTEBOOK_CELL_LIST_FOCUSED.negate()
        ),
        primary: KeyCode.Enter,
        weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
      }],
      menu: [
        {
          id: MenuId.ReplInputExecute
        }
      ],
      icon: icons.executeIcon,
      f1: false,
      metadata: {
        description: "Execute the Contents of the Input Box",
        args: [
          {
            name: "resource",
            description: "Interactive resource Uri",
            isOptional: true
          }
        ]
      }
    });
  }
  async run(accessor, context) {
    const editorService = accessor.get(IEditorService);
    const bulkEditService = accessor.get(IBulkEditService);
    const historyService = accessor.get(IInteractiveHistoryService);
    const notebookEditorService = accessor.get(INotebookEditorService);
    let editorControl;
    if (context) {
      const resourceUri = URI.revive(context);
      const editors = editorService.findEditors(resourceUri);
      for (const found of editors) {
        if (found.editor.typeId === ReplEditorInput.ID) {
          const editor = await editorService.openEditor(found.editor, found.groupId);
          editorControl = editor?.getControl();
          break;
        }
      }
    } else {
      editorControl = editorService.activeEditorPane?.getControl();
    }
    if (isReplEditorControl(editorControl)) {
      executeReplInput(bulkEditService, historyService, notebookEditorService, editorControl);
    }
  }
});
async function executeReplInput(bulkEditService, historyService, notebookEditorService, editorControl) {
  if (editorControl && editorControl.notebookEditor && editorControl.activeCodeEditor) {
    const notebookDocument = editorControl.notebookEditor.textModel;
    const textModel = editorControl.activeCodeEditor.getModel();
    const activeKernel = editorControl.notebookEditor.activeKernel;
    const language = activeKernel?.supportedLanguages[0] ?? PLAINTEXT_LANGUAGE_ID;
    if (notebookDocument && textModel) {
      const index = notebookDocument.length - 1;
      const value = textModel.getValue();
      if (isFalsyOrWhitespace(value)) {
        return;
      }
      const ctrl = InlineChatController.get(editorControl.activeCodeEditor);
      if (ctrl) {
        ctrl.acceptSession();
      }
      historyService.replaceLast(notebookDocument.uri, value);
      historyService.addToHistory(notebookDocument.uri, "");
      textModel.setValue("");
      notebookDocument.cells[index].resetTextBuffer(textModel.getTextBuffer());
      const collapseState = editorControl.notebookEditor.notebookOptions.getDisplayOptions().interactiveWindowCollapseCodeCells === "fromEditor" ? {
        inputCollapsed: false,
        outputCollapsed: false
      } : void 0;
      await bulkEditService.apply([
        new ResourceNotebookCellEdit(
          notebookDocument.uri,
          {
            editType: CellEditType.Replace,
            index,
            count: 0,
            cells: [{
              cellKind: CellKind.Code,
              mime: void 0,
              language,
              source: value,
              outputs: [],
              metadata: {},
              collapseState
            }]
          }
        )
      ]);
      const range = { start: index, end: index + 1 };
      editorControl.notebookEditor.revealCellRangeInView(range);
      await editorControl.notebookEditor.executeNotebookCells(editorControl.notebookEditor.getCellsInRange({ start: index, end: index + 1 }));
      const editor = notebookEditorService.getNotebookEditor(editorControl.notebookEditor.getId());
      if (editor) {
        editor.setSelections([range]);
        editor.setFocus(range);
      }
    }
  }
}
AccessibleViewRegistry.register(new ReplEditorAccessibleView());
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.find.replInputFocus",
  weight: KeybindingWeight.WorkbenchContrib + 1,
  when: ContextKeyExpr.equals("view", REPL_VIEW_ID),
  primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyF,
  secondary: [KeyCode.F3],
  handler: (accessor) => {
    getReplView(accessor.get(IViewsService))?.openFind();
  }
});
export {
  ReplDocumentContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHJlcGxOb3RlYm9va1xcYnJvd3NlclxccmVwbC5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEtleUNob3JkLCBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IHBhcnNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBpc0ZhbHN5T3JXaGl0ZXNwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElCdWxrRWRpdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9idWxrRWRpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2NvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgUExBSU5URVhUX0xBTkdVQUdFX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbW9kZXNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJsZVZpZXdSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc1JlZ2lzdHJ5LCBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lRGVzY3JpcHRvciwgSUVkaXRvclBhbmVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JFeHRlbnNpb25zLCBJRWRpdG9yQ29udHJvbCwgSUVkaXRvckZhY3RvcnlSZWdpc3RyeSwgSUVkaXRvclNlcmlhbGl6ZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLCBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclJlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5SWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlFZGl0b3JIYW5kbGVyLCBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5RWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU5vdGVib29rQ2VsbEVkaXQgfSBmcm9tICcuLi8uLi9idWxrRWRpdC9icm93c2VyL2J1bGtDZWxsRWRpdHMuanMnO1xuaW1wb3J0IHsgZ2V0UmVwbFZpZXcgfSBmcm9tICcuLi8uLi9kZWJ1Zy9icm93c2VyL3JlcGwuanMnO1xuaW1wb3J0IHsgUkVQTF9WSUVXX0lEIH0gZnJvbSAnLi4vLi4vZGVidWcvY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IElubGluZUNoYXRDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vaW5saW5lQ2hhdC9icm93c2VyL2lubGluZUNoYXRDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IElJbnRlcmFjdGl2ZUhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaW50ZXJhY3RpdmUvYnJvd3Nlci9pbnRlcmFjdGl2ZUhpc3RvcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5PVEVCT09LX0VESVRPUl9XSURHRVRfQUNUSU9OX1dFSUdIVCB9IGZyb20gJy4uLy4uL25vdGVib29rL2Jyb3dzZXIvY29udHJvbGxlci9jb3JlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9icm93c2VyL25vdGVib29rRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCAqIGFzIGljb25zIGZyb20gJy4uLy4uL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tJY29ucy5qcyc7XG5pbXBvcnQgeyBSZXBsRWRpdG9yQWNjZXNzaWJsZVZpZXcgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9icm93c2VyL3JlcGxFZGl0b3JBY2Nlc3NpYmxlVmlldy5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9zZXJ2aWNlcy9ub3RlYm9va0VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRUeXBlLCBDZWxsS2luZCwgTm90ZWJvb2tTZXR0aW5nLCBOb3RlYm9va1dvcmtpbmdDb3B5VHlwZUlkZW50aWZpZXIsIFJFUExfRURJVE9SX0lEIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElTX0NPTVBPU0lURV9OT1RFQk9PSywgTU9TVF9SRUNFTlRfUkVQTF9FRElUT1IsIE5PVEVCT09LX0NFTExfTElTVF9GT0NVU0VELCBOT1RFQk9PS19FRElUT1JfRk9DVVNFRCB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IE5vdGVib29rRWRpdG9ySW5wdXRPcHRpb25zIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRWRpdG9yTW9kZWxSZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1JlcGxFZGl0b3JDb250cm9sLCBSZXBsRWRpdG9yLCBSZXBsRWRpdG9yQ29udHJvbCB9IGZyb20gJy4vcmVwbEVkaXRvci5qcyc7XG5pbXBvcnQgeyBSZXBsRWRpdG9ySGlzdG9yeUFjY2Vzc2liaWxpdHlIZWxwLCBSZXBsRWRpdG9ySW5wdXRBY2Nlc3NpYmlsaXR5SGVscCB9IGZyb20gJy4vcmVwbEVkaXRvckFjY2Vzc2liaWxpdHlIZWxwLmpzJztcbmltcG9ydCB7IFJlcGxFZGl0b3JJbnB1dCB9IGZyb20gJy4vcmVwbEVkaXRvcklucHV0LmpzJztcblxudHlwZSBTZXJpYWxpemVkTm90ZWJvb2tFZGl0b3JEYXRhID0geyByZXNvdXJjZTogVVJJOyBwcmVmZXJyZWRSZXNvdXJjZTogVVJJOyB2aWV3VHlwZTogc3RyaW5nOyBvcHRpb25zPzogTm90ZWJvb2tFZGl0b3JJbnB1dE9wdGlvbnM7IGxhYmVsPzogc3RyaW5nIH07XG5jbGFzcyBSZXBsRWRpdG9yU2VyaWFsaXplciBpbXBsZW1lbnRzIElFZGl0b3JTZXJpYWxpemVyIHtcblx0Y2FuU2VyaWFsaXplKGlucHV0OiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpbnB1dC50eXBlSWQgPT09IFJlcGxFZGl0b3JJbnB1dC5JRDtcblx0fVxuXHRzZXJpYWxpemUoaW5wdXQ6IEVkaXRvcklucHV0KTogc3RyaW5nIHtcblx0XHRhc3NlcnRUeXBlKGlucHV0IGluc3RhbmNlb2YgUmVwbEVkaXRvcklucHV0KTtcblx0XHRjb25zdCBkYXRhOiBTZXJpYWxpemVkTm90ZWJvb2tFZGl0b3JEYXRhID0ge1xuXHRcdFx0cmVzb3VyY2U6IGlucHV0LnJlc291cmNlLFxuXHRcdFx0cHJlZmVycmVkUmVzb3VyY2U6IGlucHV0LnByZWZlcnJlZFJlc291cmNlLFxuXHRcdFx0dmlld1R5cGU6IGlucHV0LnZpZXdUeXBlLFxuXHRcdFx0b3B0aW9uczogaW5wdXQub3B0aW9ucyxcblx0XHRcdGxhYmVsOiBpbnB1dC5nZXROYW1lKClcblx0XHR9O1xuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeShkYXRhKTtcblx0fVxuXHRkZXNlcmlhbGl6ZShpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCByYXc6IHN0cmluZykge1xuXHRcdGNvbnN0IGRhdGEgPSA8U2VyaWFsaXplZE5vdGVib29rRWRpdG9yRGF0YT5wYXJzZShyYXcpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgeyByZXNvdXJjZSwgdmlld1R5cGUgfSA9IGRhdGE7XG5cdFx0aWYgKCFkYXRhIHx8ICFVUkkuaXNVcmkocmVzb3VyY2UpIHx8IHR5cGVvZiB2aWV3VHlwZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5wdXQgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXBsRWRpdG9ySW5wdXQsIHJlc291cmNlLCBkYXRhLmxhYmVsKTtcblx0XHRyZXR1cm4gaW5wdXQ7XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SUVkaXRvclBhbmVSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JQYW5lKS5yZWdpc3RlckVkaXRvclBhbmUoXG5cdEVkaXRvclBhbmVEZXNjcmlwdG9yLmNyZWF0ZShcblx0XHRSZXBsRWRpdG9yLFxuXHRcdFJFUExfRURJVE9SX0lELFxuXHRcdCdSRVBMIEVkaXRvcidcblx0KSxcblx0W1xuXHRcdG5ldyBTeW5jRGVzY3JpcHRvcihSZXBsRWRpdG9ySW5wdXQpXG5cdF1cbik7XG5cblJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSkucmVnaXN0ZXJFZGl0b3JTZXJpYWxpemVyKFxuXHRSZXBsRWRpdG9ySW5wdXQuSUQsXG5cdFJlcGxFZGl0b3JTZXJpYWxpemVyXG4pO1xuXG5leHBvcnQgY2xhc3MgUmVwbERvY3VtZW50Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5yZXBsRG9jdW1lbnQnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9ySW5wdXRDYWNoZSA9IG5ldyBSZXNvdXJjZU1hcDxSZXBsRWRpdG9ySW5wdXQ+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElOb3RlYm9va1NlcnZpY2Ugbm90ZWJvb2tTZXJ2aWNlOiBJTm90ZWJvb2tTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIGVkaXRvclJlc29sdmVyU2VydmljZTogSUVkaXRvclJlc29sdmVyU2VydmljZSxcblx0XHRASU5vdGVib29rRWRpdG9yTW9kZWxSZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlOiBJTm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0ZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKFxuXHRcdFx0Ly8gZG9uJ3QgbWF0Y2ggYW55dGhpbmcsIHdlIGRvbid0IG5lZWQgdG8gc3VwcG9ydCByZS1vcGVuaW5nIGZpbGVzIGFzIFJFUEwgZWRpdG9yIGF0IHRoaXMgcG9pbnRcblx0XHRcdGAgYCxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdyZXBsJyxcblx0XHRcdFx0bGFiZWw6ICdyZXBsIEVkaXRvcicsXG5cdFx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkub3B0aW9uXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHQvLyBXZSB3YW50IHRvIHN1cHBvcnQgYWxsIG5vdGVib29rIHR5cGVzIHdoaWNoIGNvdWxkIGhhdmUgYW55IGZpbGUgZXh0ZW5zaW9uLFxuXHRcdFx0XHQvLyBzbyB3ZSBqdXN0IGNoZWNrIGlmIHRoZSByZXNvdXJjZSBjb3JyZXNwb25kcyB0byBhIG5vdGVib29rXG5cdFx0XHRcdGNhblN1cHBvcnRSZXNvdXJjZTogdXJpID0+IG5vdGVib29rU2VydmljZS5nZXROb3RlYm9va1RleHRNb2RlbCh1cmkpICE9PSB1bmRlZmluZWQsXG5cdFx0XHRcdHNpbmdsZVBlclJlc291cmNlOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVVbnRpdGxlZEVkaXRvcklucHV0OiBhc3luYyAoeyByZXNvdXJjZSwgb3B0aW9ucyB9KSA9PiB7XG5cdFx0XHRcdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLmVkaXRvcklucHV0Q2FjaGUuZ2V0KHJlc291cmNlKTtcblx0XHRcdFx0XHRcdGlmIChlZGl0b3IgJiYgIWVkaXRvci5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgZWRpdG9yLCBvcHRpb25zIH07XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGVkaXRvcikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmVkaXRvcklucHV0Q2FjaGUuZGVsZXRlKHJlc291cmNlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3Qgc2NyYXRjaHBhZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLkludGVyYWN0aXZlV2luZG93UHJvbXB0VG9TYXZlKSAhPT0gdHJ1ZTtcblx0XHRcdFx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLm5vdGVib29rRWRpdG9yTW9kZWxSZXNvbHZlclNlcnZpY2UucmVzb2x2ZSh7IHVudGl0bGVkUmVzb3VyY2U6IHJlc291cmNlIH0sICdqdXB5dGVyLW5vdGVib29rJywgeyBzY3JhdGNocGFkLCB2aWV3VHlwZTogJ3JlcGwnIH0pO1xuXG5cdFx0XHRcdFx0Y29uc3Qgbm90ZWJvb2tVcmkgPSByZWYub2JqZWN0Lm5vdGVib29rLnVyaTtcblxuXHRcdFx0XHRcdC8vIHVudGl0bGVkIG5vdGVib29rcyBhcmUgZGlzcG9zZWQgd2hlbiB0aGV5IGdldCBzYXZlZC4gd2Ugc2hvdWxkIG5vdCBob2xkIGEgcmVmZXJlbmNlXG5cdFx0XHRcdFx0Ly8gdG8gc3VjaCBhIGRpc3Bvc2VkIG5vdGVib29rIGFuZCB0aGVyZWZvcmUgZGlzcG9zZSB0aGUgcmVmZXJlbmNlIGFzIHdlbGxcblx0XHRcdFx0XHRFdmVudC5vbmNlKHJlZi5vYmplY3Qubm90ZWJvb2sub25XaWxsRGlzcG9zZSkoKCkgPT4ge1xuXHRcdFx0XHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRjb25zdCBsYWJlbCA9IChvcHRpb25zIGFzIElOb3RlYm9va0VkaXRvck9wdGlvbnMpPy5sYWJlbCA/PyB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXBsRWRpdG9ySW5wdXQsIG5vdGVib29rVXJpLCBsYWJlbCk7XG5cdFx0XHRcdFx0dGhpcy5lZGl0b3JJbnB1dENhY2hlLnNldChub3RlYm9va1VyaSwgZWRpdG9yKTtcblx0XHRcdFx0XHRFdmVudC5vbmNlKGVkaXRvci5vbldpbGxEaXNwb3NlKSgoKSA9PiB0aGlzLmVkaXRvcklucHV0Q2FjaGUuZGVsZXRlKG5vdGVib29rVXJpKSk7XG5cblx0XHRcdFx0XHRyZXR1cm4geyBlZGl0b3IsIG9wdGlvbnMgfTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6IGFzeW5jICh7IHJlc291cmNlLCBvcHRpb25zIH0pID0+IHtcblx0XHRcdFx0XHRpZiAodGhpcy5lZGl0b3JJbnB1dENhY2hlLmhhcyhyZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGVkaXRvcjogdGhpcy5lZGl0b3JJbnB1dENhY2hlLmdldChyZXNvdXJjZSkhLCBvcHRpb25zIH07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgbGFiZWwgPSAob3B0aW9ucyBhcyBJTm90ZWJvb2tFZGl0b3JPcHRpb25zKT8ubGFiZWwgPz8gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVwbEVkaXRvcklucHV0LCByZXNvdXJjZSwgbGFiZWwpO1xuXHRcdFx0XHRcdHRoaXMuZWRpdG9ySW5wdXRDYWNoZS5zZXQocmVzb3VyY2UsIGVkaXRvcik7XG5cdFx0XHRcdFx0RXZlbnQub25jZShlZGl0b3Iub25XaWxsRGlzcG9zZSkoKCkgPT4gdGhpcy5lZGl0b3JJbnB1dENhY2hlLmRlbGV0ZShyZXNvdXJjZSkpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIHsgZWRpdG9yLCBvcHRpb25zIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXHR9XG59XG5cbmNsYXNzIFJlcGxXaW5kb3dXb3JraW5nQ29weUVkaXRvckhhbmRsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgSVdvcmtpbmdDb3B5RWRpdG9ySGFuZGxlciB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnJlcGxXb3JraW5nQ29weUVkaXRvckhhbmRsZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlOiBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tTZXJ2aWNlOiBJTm90ZWJvb2tTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9pbnN0YWxsSGFuZGxlcigpO1xuXHR9XG5cblx0YXN5bmMgaGFuZGxlcyh3b3JraW5nQ29weTogSVdvcmtpbmdDb3B5SWRlbnRpZmllcikge1xuXHRcdGNvbnN0IG5vdGVib29rVHlwZSA9IHRoaXMuX2dldE5vdGVib29rVHlwZSh3b3JraW5nQ29weSk7XG5cdFx0aWYgKCFub3RlYm9va1R5cGUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gISFub3RlYm9va1R5cGUgJiYgbm90ZWJvb2tUeXBlLnZpZXdUeXBlID09PSAncmVwbCcgJiYgYXdhaXQgdGhpcy5ub3RlYm9va1NlcnZpY2UuY2FuUmVzb2x2ZShub3RlYm9va1R5cGUubm90ZWJvb2tUeXBlKTtcblx0fVxuXG5cdGlzT3Blbih3b3JraW5nQ29weTogSVdvcmtpbmdDb3B5SWRlbnRpZmllciwgZWRpdG9yOiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5oYW5kbGVzKHdvcmtpbmdDb3B5KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiBlZGl0b3IgaW5zdGFuY2VvZiBSZXBsRWRpdG9ySW5wdXQgJiYgaXNFcXVhbCh3b3JraW5nQ29weS5yZXNvdXJjZSwgZWRpdG9yLnJlc291cmNlKTtcblx0fVxuXG5cdGNyZWF0ZUVkaXRvcih3b3JraW5nQ29weTogSVdvcmtpbmdDb3B5SWRlbnRpZmllcik6IEVkaXRvcklucHV0IHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXBsRWRpdG9ySW5wdXQsIHdvcmtpbmdDb3B5LnJlc291cmNlLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaW5zdGFsbEhhbmRsZXIoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3JraW5nQ29weUVkaXRvclNlcnZpY2UucmVnaXN0ZXJIYW5kbGVyKHRoaXMpKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE5vdGVib29rVHlwZSh3b3JraW5nQ29weTogSVdvcmtpbmdDb3B5SWRlbnRpZmllcikge1xuXHRcdHJldHVybiBOb3RlYm9va1dvcmtpbmdDb3B5VHlwZUlkZW50aWZpZXIucGFyc2Uod29ya2luZ0NvcHkudHlwZUlkKTtcblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoUmVwbFdpbmRvd1dvcmtpbmdDb3B5RWRpdG9ySGFuZGxlci5JRCwgUmVwbFdpbmRvd1dvcmtpbmdDb3B5RWRpdG9ySGFuZGxlciwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihSZXBsRG9jdW1lbnRDb250cmlidXRpb24uSUQsIFJlcGxEb2N1bWVudENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcblxuQWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5yZWdpc3RlcihuZXcgUmVwbEVkaXRvcklucHV0QWNjZXNzaWJpbGl0eUhlbHAoKSk7XG5BY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5LnJlZ2lzdGVyKG5ldyBSZXBsRWRpdG9ySGlzdG9yeUFjY2Vzc2liaWxpdHlIZWxwKCkpO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdyZXBsLmZvY3VzTGFzdEl0ZW1FeGVjdXRlZCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdyZXBsLmZvY3VzTGFzdFJlcGxPdXRwdXQnLCAnRm9jdXMgTW9zdCBSZWNlbnQgUkVQTCBFeGVjdXRpb24nKSxcblx0XHRcdGNhdGVnb3J5OiAnUkVQTCcsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IE1PU1RfUkVDRU5UX1JFUExfRURJVE9SLFxuXHRcdFx0fSxcblx0XHRcdGtleWJpbmRpbmc6IFt7XG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5BbHQgfCBLZXlDb2RlLkVuZCwgS2V5TW9kLkFsdCB8IEtleUNvZGUuRW5kKSxcblx0XHRcdFx0d2VpZ2h0OiBOT1RFQk9PS19FRElUT1JfV0lER0VUX0FDVElPTl9XRUlHSFQsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKElTX0NPTVBPU0lURV9OT1RFQk9PSywgTk9URUJPT0tfQ0VMTF9MSVNUX0ZPQ1VTRUQubmVnYXRlKCkpXG5cdFx0XHR9XSxcblx0XHRcdHByZWNvbmRpdGlvbjogTU9TVF9SRUNFTlRfUkVQTF9FRElUT1Jcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IFVyaUNvbXBvbmVudHMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JDb250cm9sID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lPy5nZXRDb250cm9sKCk7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGxldCBub3RlYm9va0VkaXRvcjogTm90ZWJvb2tFZGl0b3JXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGVkaXRvckNvbnRyb2wgJiYgaXNSZXBsRWRpdG9yQ29udHJvbChlZGl0b3JDb250cm9sKSkge1xuXHRcdFx0bm90ZWJvb2tFZGl0b3IgPSBlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB1cmlTdHJpbmcgPSBNT1NUX1JFQ0VOVF9SRVBMX0VESVRPUi5nZXRWYWx1ZShjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRjb25zdCB1cmkgPSB1cmlTdHJpbmcgPyBVUkkucGFyc2UodXJpU3RyaW5nKSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKCF1cmkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVwbEVkaXRvciA9IGVkaXRvclNlcnZpY2UuZmluZEVkaXRvcnModXJpKVswXTtcblxuXHRcdFx0aWYgKHJlcGxFZGl0b3IpIHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yID0gYXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHJlcGxFZGl0b3IuZWRpdG9yLCByZXBsRWRpdG9yLmdyb3VwSWQpO1xuXHRcdFx0XHRjb25zdCBlZGl0b3JDb250cm9sID0gZWRpdG9yPy5nZXRDb250cm9sKCk7XG5cblx0XHRcdFx0aWYgKGVkaXRvckNvbnRyb2wgJiYgaXNSZXBsRWRpdG9yQ29udHJvbChlZGl0b3JDb250cm9sKSkge1xuXHRcdFx0XHRcdG5vdGVib29rRWRpdG9yID0gZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IG5vdGVib29rRWRpdG9yPy5nZXRWaWV3TW9kZWwoKTtcblx0XHRpZiAobm90ZWJvb2tFZGl0b3IgJiYgdmlld01vZGVsKSB7XG5cdFx0XHQvLyBsYXN0IGNlbGwgb2YgdGhlIHZpZXdtb2RlbCBpcyB0aGUgbGFzdCBjZWxsIGhpc3Rvcnlcblx0XHRcdGNvbnN0IGxhc3RDZWxsSW5kZXggPSB2aWV3TW9kZWwubGVuZ3RoIC0gMTtcblx0XHRcdGlmIChsYXN0Q2VsbEluZGV4ID49IDApIHtcblx0XHRcdFx0Y29uc3QgY2VsbCA9IHZpZXdNb2RlbC52aWV3Q2VsbHNbbGFzdENlbGxJbmRleF07XG5cdFx0XHRcdG5vdGVib29rRWRpdG9yLmZvY3VzTm90ZWJvb2tDZWxsKGNlbGwsICdjb250YWluZXInKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdyZXBsLmlucHV0LmZvY3VzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3JlcGwuaW5wdXQuZm9jdXMnLCAnRm9jdXMgSW5wdXQgRWRpdG9yJyksXG5cdFx0XHRjYXRlZ29yeTogJ1JFUEwnLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBNT1NUX1JFQ0VOVF9SRVBMX0VESVRPUixcblx0XHRcdH0sXG5cdFx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSVNfQ09NUE9TSVRFX05PVEVCT09LLCBOT1RFQk9PS19FRElUT1JfRk9DVVNFRCksXG5cdFx0XHRcdHdlaWdodDogTk9URUJPT0tfRURJVE9SX1dJREdFVF9BQ1RJT05fV0VJR0hULFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRG93bkFycm93XG5cdFx0XHR9LCB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChNT1NUX1JFQ0VOVF9SRVBMX0VESVRPUiksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgNSxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkFsdCB8IEtleUNvZGUuSG9tZSwgS2V5TW9kLkFsdCB8IEtleUNvZGUuSG9tZSksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yQ29udHJvbCA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZT8uZ2V0Q29udHJvbCgpO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRpZiAoZWRpdG9yQ29udHJvbCAmJiBpc1JlcGxFZGl0b3JDb250cm9sKGVkaXRvckNvbnRyb2wpICYmIGVkaXRvckNvbnRyb2wubm90ZWJvb2tFZGl0b3IpIHtcblx0XHRcdGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZT8uZm9jdXMoKTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRjb25zdCB1cmlTdHJpbmcgPSBNT1NUX1JFQ0VOVF9SRVBMX0VESVRPUi5nZXRWYWx1ZShjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRjb25zdCB1cmkgPSB1cmlTdHJpbmcgPyBVUkkucGFyc2UodXJpU3RyaW5nKSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKCF1cmkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVwbEVkaXRvciA9IGVkaXRvclNlcnZpY2UuZmluZEVkaXRvcnModXJpKVswXTtcblxuXHRcdFx0aWYgKHJlcGxFZGl0b3IpIHtcblx0XHRcdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IHVyaSwgb3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzOiBmYWxzZSB9IH0sIHJlcGxFZGl0b3IuZ3JvdXBJZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAncmVwbC5leGVjdXRlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3JlcGwuZXhlY3V0ZScsICdFeGVjdXRlIFJFUEwgaW5wdXQnKSxcblx0XHRcdGNhdGVnb3J5OiAnUkVQTCcsXG5cdFx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0SVNfQ09NUE9TSVRFX05PVEVCT09LLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnYWN0aXZlRWRpdG9yJywgJ3dvcmtiZW5jaC5lZGl0b3IucmVwbCcpLFxuXHRcdFx0XHRcdE5PVEVCT09LX0NFTExfTElTVF9GT0NVU0VELm5lZ2F0ZSgpXG5cdFx0XHRcdCksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0d2VpZ2h0OiBOT1RFQk9PS19FRElUT1JfV0lER0VUX0FDVElPTl9XRUlHSFRcblx0XHRcdH0sIHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdElTX0NPTVBPU0lURV9OT1RFQk9PSyxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2FjdGl2ZUVkaXRvcicsICd3b3JrYmVuY2guZWRpdG9yLnJlcGwnKSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5pbnRlcmFjdGl2ZVdpbmRvdy5leGVjdXRlV2l0aFNoaWZ0RW50ZXInLCB0cnVlKSxcblx0XHRcdFx0XHROT1RFQk9PS19DRUxMX0xJU1RfRk9DVVNFRC5uZWdhdGUoKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkVudGVyLFxuXHRcdFx0XHR3ZWlnaHQ6IE5PVEVCT09LX0VESVRPUl9XSURHRVRfQUNUSU9OX1dFSUdIVFxuXHRcdFx0fSwge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0SVNfQ09NUE9TSVRFX05PVEVCT09LLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnYWN0aXZlRWRpdG9yJywgJ3dvcmtiZW5jaC5lZGl0b3IucmVwbCcpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLmludGVyYWN0aXZlV2luZG93LmV4ZWN1dGVXaXRoU2hpZnRFbnRlcicsIGZhbHNlKSxcblx0XHRcdFx0XHROT1RFQk9PS19DRUxMX0xJU1RfRk9DVVNFRC5uZWdhdGUoKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyLFxuXHRcdFx0XHR3ZWlnaHQ6IE5PVEVCT09LX0VESVRPUl9XSURHRVRfQUNUSU9OX1dFSUdIVFxuXHRcdFx0fV0sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLlJlcGxJbnB1dEV4ZWN1dGVcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHRcdGljb246IGljb25zLmV4ZWN1dGVJY29uLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdFeGVjdXRlIHRoZSBDb250ZW50cyBvZiB0aGUgSW5wdXQgQm94Jyxcblx0XHRcdFx0YXJnczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG5hbWU6ICdyZXNvdXJjZScsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0ludGVyYWN0aXZlIHJlc291cmNlIFVyaScsXG5cdFx0XHRcdFx0XHRpc09wdGlvbmFsOiB0cnVlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBVcmlDb21wb25lbnRzKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgYnVsa0VkaXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElCdWxrRWRpdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGhpc3RvcnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnRlcmFjdGl2ZUhpc3RvcnlTZXJ2aWNlKTtcblx0XHRjb25zdCBub3RlYm9va0VkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGVib29rRWRpdG9yU2VydmljZSk7XG5cdFx0bGV0IGVkaXRvckNvbnRyb2w6IElFZGl0b3JDb250cm9sIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChjb250ZXh0KSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZVVyaSA9IFVSSS5yZXZpdmUoY29udGV4dCk7XG5cdFx0XHRjb25zdCBlZGl0b3JzID0gZWRpdG9yU2VydmljZS5maW5kRWRpdG9ycyhyZXNvdXJjZVVyaSk7XG5cdFx0XHRmb3IgKGNvbnN0IGZvdW5kIG9mIGVkaXRvcnMpIHtcblx0XHRcdFx0aWYgKGZvdW5kLmVkaXRvci50eXBlSWQgPT09IFJlcGxFZGl0b3JJbnB1dC5JRCkge1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRvciA9IGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihmb3VuZC5lZGl0b3IsIGZvdW5kLmdyb3VwSWQpO1xuXHRcdFx0XHRcdGVkaXRvckNvbnRyb2wgPSBlZGl0b3I/LmdldENvbnRyb2woKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdGVkaXRvckNvbnRyb2wgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU/LmdldENvbnRyb2woKSBhcyB7IG5vdGVib29rRWRpdG9yOiBOb3RlYm9va0VkaXRvcldpZGdldCB8IHVuZGVmaW5lZDsgY29kZUVkaXRvcjogQ29kZUVkaXRvcldpZGdldCB9IHwgdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChpc1JlcGxFZGl0b3JDb250cm9sKGVkaXRvckNvbnRyb2wpKSB7XG5cdFx0XHRleGVjdXRlUmVwbElucHV0KGJ1bGtFZGl0U2VydmljZSwgaGlzdG9yeVNlcnZpY2UsIG5vdGVib29rRWRpdG9yU2VydmljZSwgZWRpdG9yQ29udHJvbCk7XG5cdFx0fVxuXHR9XG59KTtcblxuYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZVJlcGxJbnB1dChcblx0YnVsa0VkaXRTZXJ2aWNlOiBJQnVsa0VkaXRTZXJ2aWNlLFxuXHRoaXN0b3J5U2VydmljZTogSUludGVyYWN0aXZlSGlzdG9yeVNlcnZpY2UsXG5cdG5vdGVib29rRWRpdG9yU2VydmljZTogSU5vdGVib29rRWRpdG9yU2VydmljZSxcblx0ZWRpdG9yQ29udHJvbDogUmVwbEVkaXRvckNvbnRyb2wpIHtcblxuXHRpZiAoZWRpdG9yQ29udHJvbCAmJiBlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yICYmIGVkaXRvckNvbnRyb2wuYWN0aXZlQ29kZUVkaXRvcikge1xuXHRcdGNvbnN0IG5vdGVib29rRG9jdW1lbnQgPSBlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yLnRleHRNb2RlbDtcblx0XHRjb25zdCB0ZXh0TW9kZWwgPSBlZGl0b3JDb250cm9sLmFjdGl2ZUNvZGVFZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBhY3RpdmVLZXJuZWwgPSBlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yLmFjdGl2ZUtlcm5lbDtcblx0XHRjb25zdCBsYW5ndWFnZSA9IGFjdGl2ZUtlcm5lbD8uc3VwcG9ydGVkTGFuZ3VhZ2VzWzBdID8/IFBMQUlOVEVYVF9MQU5HVUFHRV9JRDtcblxuXHRcdGlmIChub3RlYm9va0RvY3VtZW50ICYmIHRleHRNb2RlbCkge1xuXHRcdFx0Y29uc3QgaW5kZXggPSBub3RlYm9va0RvY3VtZW50Lmxlbmd0aCAtIDE7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHRleHRNb2RlbC5nZXRWYWx1ZSgpO1xuXG5cdFx0XHRpZiAoaXNGYWxzeU9yV2hpdGVzcGFjZSh2YWx1ZSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBKdXN0IGFjY2VwdCBhbnkgZXhpc3RpbmcgaW5saW5lIGNoYXQgaHVua1xuXHRcdFx0Y29uc3QgY3RybCA9IElubGluZUNoYXRDb250cm9sbGVyLmdldChlZGl0b3JDb250cm9sLmFjdGl2ZUNvZGVFZGl0b3IpO1xuXHRcdFx0aWYgKGN0cmwpIHtcblx0XHRcdFx0Y3RybC5hY2NlcHRTZXNzaW9uKCk7XG5cdFx0XHR9XG5cblx0XHRcdGhpc3RvcnlTZXJ2aWNlLnJlcGxhY2VMYXN0KG5vdGVib29rRG9jdW1lbnQudXJpLCB2YWx1ZSk7XG5cdFx0XHRoaXN0b3J5U2VydmljZS5hZGRUb0hpc3Rvcnkobm90ZWJvb2tEb2N1bWVudC51cmksICcnKTtcblx0XHRcdHRleHRNb2RlbC5zZXRWYWx1ZSgnJyk7XG5cdFx0XHRub3RlYm9va0RvY3VtZW50LmNlbGxzW2luZGV4XS5yZXNldFRleHRCdWZmZXIodGV4dE1vZGVsLmdldFRleHRCdWZmZXIoKSk7XG5cblx0XHRcdGNvbnN0IGNvbGxhcHNlU3RhdGUgPSBlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yLm5vdGVib29rT3B0aW9ucy5nZXREaXNwbGF5T3B0aW9ucygpLmludGVyYWN0aXZlV2luZG93Q29sbGFwc2VDb2RlQ2VsbHMgPT09ICdmcm9tRWRpdG9yJyA/XG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpbnB1dENvbGxhcHNlZDogZmFsc2UsXG5cdFx0XHRcdFx0b3V0cHV0Q29sbGFwc2VkOiBmYWxzZVxuXHRcdFx0XHR9IDpcblx0XHRcdFx0dW5kZWZpbmVkO1xuXG5cdFx0XHRhd2FpdCBidWxrRWRpdFNlcnZpY2UuYXBwbHkoW1xuXHRcdFx0XHRuZXcgUmVzb3VyY2VOb3RlYm9va0NlbGxFZGl0KG5vdGVib29rRG9jdW1lbnQudXJpLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSxcblx0XHRcdFx0XHRcdGluZGV4OiBpbmRleCxcblx0XHRcdFx0XHRcdGNvdW50OiAwLFxuXHRcdFx0XHRcdFx0Y2VsbHM6IFt7XG5cdFx0XHRcdFx0XHRcdGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlLFxuXHRcdFx0XHRcdFx0XHRtaW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGxhbmd1YWdlLFxuXHRcdFx0XHRcdFx0XHRzb3VyY2U6IHZhbHVlLFxuXHRcdFx0XHRcdFx0XHRvdXRwdXRzOiBbXSxcblx0XHRcdFx0XHRcdFx0bWV0YWRhdGE6IHt9LFxuXHRcdFx0XHRcdFx0XHRjb2xsYXBzZVN0YXRlXG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0KVxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIHJldmVhbCB0aGUgY2VsbCBpbnRvIHZpZXcgZmlyc3Rcblx0XHRcdGNvbnN0IHJhbmdlID0geyBzdGFydDogaW5kZXgsIGVuZDogaW5kZXggKyAxIH07XG5cdFx0XHRlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yLnJldmVhbENlbGxSYW5nZUluVmlldyhyYW5nZSk7XG5cdFx0XHRhd2FpdCBlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yLmV4ZWN1dGVOb3RlYm9va0NlbGxzKGVkaXRvckNvbnRyb2wubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbHNJblJhbmdlKHsgc3RhcnQ6IGluZGV4LCBlbmQ6IGluZGV4ICsgMSB9KSk7XG5cblx0XHRcdC8vIHVwZGF0ZSB0aGUgc2VsZWN0aW9uIGFuZCBmb2N1cyBpbiB0aGUgZXh0ZW5zaW9uIGhvc3QgbW9kZWxcblx0XHRcdGNvbnN0IGVkaXRvciA9IG5vdGVib29rRWRpdG9yU2VydmljZS5nZXROb3RlYm9va0VkaXRvcihlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yLmdldElkKCkpO1xuXHRcdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbcmFuZ2VdKTtcblx0XHRcdFx0ZWRpdG9yLnNldEZvY3VzKHJhbmdlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuQWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5yZWdpc3RlcihuZXcgUmVwbEVkaXRvckFjY2Vzc2libGVWaWV3KCkpO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdsaXN0LmZpbmQucmVwbElucHV0Rm9jdXMnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFJFUExfVklFV19JRCksXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5Rixcblx0c2Vjb25kYXJ5OiBbS2V5Q29kZS5GM10sXG5cdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdGdldFJlcGxWaWV3KGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKSk/Lm9wZW5GaW5kKCk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxVQUFVLFNBQVMsY0FBYztBQUMxQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsV0FBMEI7QUFDbkMsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxTQUFTLFFBQVEsdUJBQXVCO0FBQ2pELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQWdCLDBCQUEwQjtBQUNuRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDZCQUErQztBQUN4RCxTQUFTLHFCQUFxQix3QkFBd0I7QUFDdEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw0QkFBaUQ7QUFDMUQsU0FBaUMsZ0NBQWdDLHNCQUFzQjtBQUN2RixTQUFTLHdCQUFtRjtBQUU1RixTQUFTLHdCQUF3QixnQ0FBZ0M7QUFDakUsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUI7QUFFOUIsU0FBb0MsaUNBQWlDO0FBQ3JFLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsNENBQTRDO0FBR3JELFlBQVksV0FBVztBQUN2QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGNBQWMsVUFBVSxpQkFBaUIsbUNBQW1DLHNC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QUUsQ0FBQyxDQUFDO0FBR3RJLFlBQU0sU0FBUyxzQkFBc0Isa0JBQWtCLGNBQWMsZUFBZSxNQUFNLENBQUM7QUFDM0YsVUFBSSxRQUFRO0FBQ1gsZUFBTyxjQUFjLENBQUMsS0FBSyxDQUFDO0FBQzVCLGVBQU8sU0FBUyxLQUFLO0FBQUEsTUFDdEI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBRUEsdUJBQXVCLFNBQVMsSUFBSSx5QkFBeUIsQ0FBQztBQUU5RCxvQkFBb0IsaUNBQWlDO0FBQUEsRUFDcEQsSUFBSTtBQUFBLEVBQ0osUUFBUSxpQkFBaUIsbUJBQW1CO0FBQUEsRUFDNUMsTUFBTSxlQUFlLE9BQU8sUUFBUSxZQUFZO0FBQUEsRUFDaEQsU0FBUyxPQUFPLFVBQVUsT0FBTyxNQUFNLFFBQVE7QUFBQSxFQUMvQyxXQUFXLENBQUMsUUFBUSxFQUFFO0FBQUEsRUFDdEIsU0FBUyxDQUFDLGFBQWE7QUFDdEIsZ0JBQVksU0FBUyxJQUFJLGFBQWEsQ0FBQyxHQUFHLFNBQVM7QUFBQSxFQUNwRDtBQUNELENBQUM7IiwKICAibmFtZXMiOiBbImVkaXRvciIsICJlZGl0b3JDb250cm9sIl0KfQo=
