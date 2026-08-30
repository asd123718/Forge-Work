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
import { Iterable } from "../../../../base/common/iterator.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { parse } from "../../../../base/common/marshalling.js";
import { Schemas } from "../../../../base/common/network.js";
import { extname, isEqual } from "../../../../base/common/resources.js";
import { isFalsyOrWhitespace } from "../../../../base/common/strings.js";
import { URI } from "../../../../base/common/uri.js";
import { IBulkEditService } from "../../../../editor/browser/services/bulkEditService.js";
import { EditOperation } from "../../../../editor/common/core/editOperation.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../editor/common/languages/modesRegistry.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { peekViewBorder } from "../../../../editor/contrib/peekView/browser/peekView.js";
import { Context as SuggestContext } from "../../../../editor/contrib/suggest/browser/suggest.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { EditorActivation } from "../../../../platform/editor/common/editor.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { contrastBorder, ifDefinedThenElse, listInactiveSelectionBackground, registerColor } from "../../../../platform/theme/common/colorRegistry.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { EditorExtensions, EditorsOrder } from "../../../common/editor.js";
import { PANEL_BORDER } from "../../../common/theme.js";
import { ResourceNotebookCellEdit } from "../../bulkEdit/browser/bulkCellEdits.js";
import { ReplEditorSettings, INTERACTIVE_INPUT_CURSOR_BOUNDARY } from "./interactiveCommon.js";
import { IInteractiveDocumentService, InteractiveDocumentService } from "./interactiveDocumentService.js";
import { InteractiveEditor } from "./interactiveEditor.js";
import { InteractiveEditorInput } from "./interactiveEditorInput.js";
import { IInteractiveHistoryService, InteractiveHistoryService } from "./interactiveHistoryService.js";
import { NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT } from "../../notebook/browser/controller/coreActions.js";
import * as icons from "../../notebook/browser/notebookIcons.js";
import { INotebookEditorService } from "../../notebook/browser/services/notebookEditorService.js";
import { CellEditType, CellKind, CellUri, INTERACTIVE_WINDOW_EDITOR_ID, NotebookSetting, NotebookWorkingCopyTypeIdentifier } from "../../notebook/common/notebookCommon.js";
import { InteractiveWindowOpen, IS_COMPOSITE_NOTEBOOK, NOTEBOOK_EDITOR_FOCUSED } from "../../notebook/common/notebookContextKeys.js";
import { INotebookKernelService } from "../../notebook/common/notebookKernelService.js";
import { INotebookService } from "../../notebook/common/notebookService.js";
import { columnToEditorGroup } from "../../../services/editor/common/editorGroupColumn.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorResolverService, RegisteredEditorPriority } from "../../../services/editor/common/editorResolverService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IWorkingCopyEditorService } from "../../../services/workingCopy/common/workingCopyEditorService.js";
import { isReplEditorControl } from "../../replNotebook/browser/replEditor.js";
import { InlineChatController } from "../../inlineChat/browser/inlineChatController.js";
import { IsLinuxContext, IsWindowsContext } from "../../../../platform/contextkey/common/contextkeys.js";
const interactiveWindowCategory = localize2("interactiveWindow", "Interactive Window");
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    InteractiveEditor,
    INTERACTIVE_WINDOW_EDITOR_ID,
    "Interactive Window"
  ),
  [
    new SyncDescriptor(InteractiveEditorInput)
  ]
);
let InteractiveDocumentContribution = class extends Disposable {
  constructor(notebookService, editorResolverService, editorService, instantiationService) {
    super();
    this.instantiationService = instantiationService;
    const info = notebookService.getContributedNotebookType("interactive");
    if (!info) {
      this._register(notebookService.registerContributedNotebookType("interactive", {
        providerDisplayName: "Interactive Notebook",
        displayName: "Interactive",
        filenamePattern: ["*.interactive"],
        priority: RegisteredEditorPriority.builtin
      }));
    }
    editorResolverService.registerEditor(
      `${Schemas.vscodeInteractiveInput}:/**`,
      {
        id: "vscode-interactive-input",
        label: "Interactive Editor",
        priority: RegisteredEditorPriority.exclusive
      },
      {
        canSupportResource: (uri) => uri.scheme === Schemas.vscodeInteractiveInput,
        singlePerResource: true
      },
      {
        createEditorInput: ({ resource }) => {
          const editorInput = editorService.findEditors({
            resource,
            editorId: "interactive",
            typeId: InteractiveEditorInput.ID
          }, { order: EditorsOrder.SEQUENTIAL }).at(0);
          return editorInput;
        }
      }
    );
    editorResolverService.registerEditor(
      `*.interactive`,
      {
        id: "interactive",
        label: "Interactive Editor",
        priority: RegisteredEditorPriority.exclusive
      },
      {
        canSupportResource: (uri) => uri.scheme === Schemas.untitled && extname(uri) === ".interactive" || uri.scheme === Schemas.vscodeNotebookCell && extname(uri) === ".interactive",
        singlePerResource: true
      },
      {
        createEditorInput: ({ resource, options }) => {
          const data = CellUri.parse(resource);
          let cellOptions;
          let iwResource = resource;
          if (data) {
            cellOptions = { resource, options };
            iwResource = data.notebook;
          }
          const notebookOptions = {
            ...options,
            cellOptions,
            cellRevealType: void 0,
            cellSelections: void 0,
            isReadOnly: void 0,
            viewState: void 0,
            indexedCellOptions: void 0
          };
          const editorInput = createEditor(iwResource, this.instantiationService);
          return {
            editor: editorInput,
            options: notebookOptions
          };
        },
        createUntitledEditorInput: ({ resource, options }) => {
          if (!resource) {
            throw new Error("Interactive window editors must have a resource name");
          }
          const data = CellUri.parse(resource);
          let cellOptions;
          if (data) {
            cellOptions = { resource, options };
          }
          const notebookOptions = {
            ...options,
            cellOptions,
            cellRevealType: void 0,
            cellSelections: void 0,
            isReadOnly: void 0,
            viewState: void 0,
            indexedCellOptions: void 0
          };
          const editorInput = createEditor(resource, this.instantiationService);
          return {
            editor: editorInput,
            options: notebookOptions
          };
        }
      }
    );
  }
};
InteractiveDocumentContribution.ID = "workbench.contrib.interactiveDocument";
InteractiveDocumentContribution = __decorateClass([
  __decorateParam(0, INotebookService),
  __decorateParam(1, IEditorResolverService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IInstantiationService)
], InteractiveDocumentContribution);
let InteractiveInputContentProvider = class {
  constructor(textModelService, _modelService) {
    this._modelService = _modelService;
    this._registration = textModelService.registerTextModelContentProvider(Schemas.vscodeInteractiveInput, this);
  }
  dispose() {
    this._registration.dispose();
  }
  async provideTextContent(resource) {
    const existing = this._modelService.getModel(resource);
    if (existing) {
      return existing;
    }
    const result = this._modelService.createModel("", null, resource, false);
    return result;
  }
};
InteractiveInputContentProvider.ID = "workbench.contrib.interactiveInputContentProvider";
InteractiveInputContentProvider = __decorateClass([
  __decorateParam(0, ITextModelService),
  __decorateParam(1, IModelService)
], InteractiveInputContentProvider);
function createEditor(resource, instantiationService) {
  const counter = /\/Interactive-(\d+)/.exec(resource.path);
  const inputBoxPath = counter && counter[1] ? `/InteractiveInput-${counter[1]}` : "InteractiveInput";
  const inputUri = URI.from({ scheme: Schemas.vscodeInteractiveInput, path: inputBoxPath });
  const editorInput = InteractiveEditorInput.create(instantiationService, resource, inputUri);
  return editorInput;
}
let InteractiveWindowWorkingCopyEditorHandler = class extends Disposable {
  constructor(_instantiationService, _workingCopyEditorService, _extensionService) {
    super();
    this._instantiationService = _instantiationService;
    this._workingCopyEditorService = _workingCopyEditorService;
    this._extensionService = _extensionService;
    this._installHandler();
  }
  handles(workingCopy) {
    const viewType = this._getViewType(workingCopy);
    return !!viewType && viewType === "interactive";
  }
  isOpen(workingCopy, editor) {
    if (!this.handles(workingCopy)) {
      return false;
    }
    return editor instanceof InteractiveEditorInput && isEqual(workingCopy.resource, editor.resource);
  }
  createEditor(workingCopy) {
    return createEditor(workingCopy.resource, this._instantiationService);
  }
  async _installHandler() {
    await this._extensionService.whenInstalledExtensionsRegistered();
    this._register(this._workingCopyEditorService.registerHandler(this));
  }
  _getViewType(workingCopy) {
    return NotebookWorkingCopyTypeIdentifier.parse(workingCopy.typeId)?.viewType;
  }
};
InteractiveWindowWorkingCopyEditorHandler.ID = "workbench.contrib.interactiveWindowWorkingCopyEditorHandler";
InteractiveWindowWorkingCopyEditorHandler = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IWorkingCopyEditorService),
  __decorateParam(2, IExtensionService)
], InteractiveWindowWorkingCopyEditorHandler);
registerWorkbenchContribution2(InteractiveDocumentContribution.ID, InteractiveDocumentContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(InteractiveInputContentProvider.ID, InteractiveInputContentProvider, {
  editorTypeId: INTERACTIVE_WINDOW_EDITOR_ID
});
registerWorkbenchContribution2(InteractiveWindowWorkingCopyEditorHandler.ID, InteractiveWindowWorkingCopyEditorHandler, {
  editorTypeId: INTERACTIVE_WINDOW_EDITOR_ID
});
class InteractiveEditorSerializer {
  canSerialize(editor) {
    if (!(editor instanceof InteractiveEditorInput)) {
      return false;
    }
    return URI.isUri(editor.primary.resource) && URI.isUri(editor.inputResource);
  }
  serialize(input) {
    if (!this.canSerialize(input)) {
      return void 0;
    }
    return JSON.stringify({
      resource: input.primary.resource,
      inputResource: input.inputResource,
      name: input.getName(),
      language: input.language
    });
  }
  deserialize(instantiationService, raw) {
    const data = parse(raw);
    if (!data) {
      return void 0;
    }
    const { resource, inputResource, name, language } = data;
    if (!URI.isUri(resource) || !URI.isUri(inputResource)) {
      return void 0;
    }
    const input = InteractiveEditorInput.create(instantiationService, resource, inputResource, name, language);
    return input;
  }
}
InteractiveEditorSerializer.ID = InteractiveEditorInput.ID;
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(
  InteractiveEditorSerializer.ID,
  InteractiveEditorSerializer
);
registerSingleton(IInteractiveHistoryService, InteractiveHistoryService, InstantiationType.Delayed);
registerSingleton(IInteractiveDocumentService, InteractiveDocumentService, InstantiationType.Delayed);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "_interactive.open",
      title: localize2("interactive.open", "Open Interactive Window"),
      f1: false,
      category: interactiveWindowCategory,
      metadata: {
        description: localize("interactive.open", "Open Interactive Window"),
        args: [
          {
            name: "showOptions",
            description: "Show Options",
            schema: {
              type: "object",
              properties: {
                "viewColumn": {
                  type: "number",
                  default: -1
                },
                "preserveFocus": {
                  type: "boolean",
                  default: true
                }
              }
            }
          },
          {
            name: "resource",
            description: "Interactive resource Uri",
            isOptional: true
          },
          {
            name: "controllerId",
            description: "Notebook controller Id",
            isOptional: true
          },
          {
            name: "title",
            description: "Notebook editor title",
            isOptional: true
          }
        ]
      }
    });
  }
  async run(accessor, showOptions, resource, id, title) {
    const editorService = accessor.get(IEditorService);
    const editorGroupService = accessor.get(IEditorGroupsService);
    const historyService = accessor.get(IInteractiveHistoryService);
    const kernelService = accessor.get(INotebookKernelService);
    const logService = accessor.get(ILogService);
    const configurationService = accessor.get(IConfigurationService);
    const group = columnToEditorGroup(editorGroupService, configurationService, typeof showOptions === "number" ? showOptions : showOptions?.viewColumn);
    const editorOptions = {
      activation: EditorActivation.PRESERVE,
      preserveFocus: typeof showOptions !== "number" ? showOptions?.preserveFocus ?? false : false
    };
    if (resource && extname(resource) === ".interactive") {
      logService.debug("Open interactive window from resource:", resource.toString());
      const resourceUri = URI.revive(resource);
      const editors = editorService.findEditors(resourceUri).filter((id2) => id2.editor instanceof InteractiveEditorInput && id2.editor.resource?.toString() === resourceUri.toString());
      if (editors.length) {
        logService.debug("Find existing interactive window:", resource.toString());
        const editorInput2 = editors[0].editor;
        const currentGroup = editors[0].groupId;
        const editor = await editorService.openEditor(editorInput2, editorOptions, currentGroup);
        const editorControl2 = editor?.getControl();
        return {
          notebookUri: editorInput2.resource,
          inputUri: editorInput2.inputResource,
          notebookEditorId: editorControl2?.notebookEditor?.getId()
        };
      }
    }
    const existingNotebookDocument = /* @__PURE__ */ new Set();
    editorService.getEditors(EditorsOrder.SEQUENTIAL).forEach((editor) => {
      if (editor.editor.resource) {
        existingNotebookDocument.add(editor.editor.resource.toString());
      }
    });
    let notebookUri = void 0;
    let inputUri = void 0;
    let counter = 1;
    do {
      notebookUri = URI.from({ scheme: Schemas.untitled, path: `/Interactive-${counter}.interactive` });
      inputUri = URI.from({ scheme: Schemas.vscodeInteractiveInput, path: `/InteractiveInput-${counter}` });
      counter++;
    } while (existingNotebookDocument.has(notebookUri.toString()));
    InteractiveEditorInput.setName(notebookUri, title);
    logService.debug("Open new interactive window:", notebookUri.toString(), inputUri.toString());
    if (id) {
      const allKernels = kernelService.getMatchingKernel({ uri: notebookUri, notebookType: "interactive" }).all;
      const preferredKernel = allKernels.find((kernel) => kernel.id === id);
      if (preferredKernel) {
        kernelService.preselectKernelForNotebook(preferredKernel, { uri: notebookUri, notebookType: "interactive" });
      }
    }
    historyService.clearHistory(notebookUri);
    const editorInput = { resource: notebookUri, options: editorOptions };
    const editorPane = await editorService.openEditor(editorInput, group);
    const editorControl = editorPane?.getControl();
    logService.debug("New interactive window opened. Notebook editor id", editorControl?.notebookEditor?.getId());
    return { notebookUri, inputUri, notebookEditorId: editorControl?.notebookEditor?.getId() };
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "interactive.execute",
      title: localize2("interactive.execute", "Execute Code"),
      category: interactiveWindowCategory,
      keybinding: [{
        // when: NOTEBOOK_CELL_LIST_FOCUSED,
        when: ContextKeyExpr.and(
          IS_COMPOSITE_NOTEBOOK,
          ContextKeyExpr.equals("activeEditor", "workbench.editor.interactive")
        ),
        primary: KeyMod.CtrlCmd | KeyCode.Enter,
        weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
      }, {
        when: ContextKeyExpr.and(
          IS_COMPOSITE_NOTEBOOK,
          ContextKeyExpr.equals("activeEditor", "workbench.editor.interactive"),
          ContextKeyExpr.equals("config.interactiveWindow.executeWithShiftEnter", true)
        ),
        primary: KeyMod.Shift | KeyCode.Enter,
        weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
      }, {
        when: ContextKeyExpr.and(
          IS_COMPOSITE_NOTEBOOK,
          ContextKeyExpr.equals("activeEditor", "workbench.editor.interactive"),
          ContextKeyExpr.equals("config.interactiveWindow.executeWithShiftEnter", false)
        ),
        primary: KeyCode.Enter,
        weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
      }],
      menu: [
        {
          id: MenuId.InteractiveInputExecute
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
        if (found.editor.typeId === InteractiveEditorInput.ID) {
          const editor = await editorService.openEditor(found.editor, found.groupId);
          editorControl = editor?.getControl();
          break;
        }
      }
    } else {
      editorControl = editorService.activeEditorPane?.getControl();
    }
    if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
      const notebookDocument = editorControl.notebookEditor.textModel;
      const textModel = editorControl.activeCodeEditor?.getModel();
      const activeKernel = editorControl.notebookEditor.activeKernel;
      const language = activeKernel?.supportedLanguages[0] ?? PLAINTEXT_LANGUAGE_ID;
      if (notebookDocument && textModel && editorControl.activeCodeEditor) {
        const index = notebookDocument.length;
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
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "interactive.input.clear",
      title: localize2("interactive.input.clear", "Clear the interactive window input editor contents"),
      category: interactiveWindowCategory,
      f1: false
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const editorControl = editorService.activeEditorPane?.getControl();
    if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
      const notebookDocument = editorControl.notebookEditor.textModel;
      const editor = editorControl.activeCodeEditor;
      const range = editor?.getModel()?.getFullModelRange();
      if (notebookDocument && editor && range) {
        editor.executeEdits("", [EditOperation.replace(range, null)]);
      }
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "interactive.history.previous",
      title: localize2("interactive.history.previous", "Previous value in history"),
      category: interactiveWindowCategory,
      f1: false,
      keybinding: {
        when: ContextKeyExpr.and(
          INTERACTIVE_INPUT_CURSOR_BOUNDARY.notEqualsTo("bottom"),
          INTERACTIVE_INPUT_CURSOR_BOUNDARY.notEqualsTo("none"),
          SuggestContext.Visible.toNegated()
        ),
        primary: KeyCode.UpArrow,
        weight: KeybindingWeight.WorkbenchContrib
      },
      precondition: ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK, NOTEBOOK_EDITOR_FOCUSED.negate())
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const historyService = accessor.get(IInteractiveHistoryService);
    const editorControl = editorService.activeEditorPane?.getControl();
    if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
      const notebookDocument = editorControl.notebookEditor.textModel;
      const textModel = editorControl.activeCodeEditor?.getModel();
      if (notebookDocument && textModel) {
        const previousValue = historyService.getPreviousValue(notebookDocument.uri);
        if (previousValue) {
          textModel.setValue(previousValue);
        }
      }
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "interactive.history.next",
      title: localize2("interactive.history.next", "Next value in history"),
      category: interactiveWindowCategory,
      f1: false,
      keybinding: {
        when: ContextKeyExpr.and(
          INTERACTIVE_INPUT_CURSOR_BOUNDARY.notEqualsTo("top"),
          INTERACTIVE_INPUT_CURSOR_BOUNDARY.notEqualsTo("none"),
          SuggestContext.Visible.toNegated()
        ),
        primary: KeyCode.DownArrow,
        weight: KeybindingWeight.WorkbenchContrib
      },
      precondition: ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK, NOTEBOOK_EDITOR_FOCUSED.negate())
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const historyService = accessor.get(IInteractiveHistoryService);
    const editorControl = editorService.activeEditorPane?.getControl();
    if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
      const notebookDocument = editorControl.notebookEditor.textModel;
      const textModel = editorControl.activeCodeEditor?.getModel();
      if (notebookDocument && textModel) {
        const nextValue = historyService.getNextValue(notebookDocument.uri);
        if (nextValue !== null) {
          textModel.setValue(nextValue);
        }
      }
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "interactive.scrollToTop",
      title: localize("interactiveScrollToTop", "Scroll to Top"),
      keybinding: {
        when: ContextKeyExpr.equals("activeEditor", "workbench.editor.interactive"),
        primary: KeyMod.CtrlCmd | KeyCode.Home,
        mac: { primary: KeyMod.CtrlCmd | KeyCode.UpArrow },
        weight: KeybindingWeight.WorkbenchContrib
      },
      category: interactiveWindowCategory
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const editorControl = editorService.activeEditorPane?.getControl();
    if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
      if (editorControl.notebookEditor.getLength() === 0) {
        return;
      }
      editorControl.notebookEditor.revealCellRangeInView({ start: 0, end: 1 });
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "interactive.scrollToBottom",
      title: localize("interactiveScrollToBottom", "Scroll to Bottom"),
      keybinding: {
        when: ContextKeyExpr.equals("activeEditor", "workbench.editor.interactive"),
        primary: KeyMod.CtrlCmd | KeyCode.End,
        mac: { primary: KeyMod.CtrlCmd | KeyCode.DownArrow },
        weight: KeybindingWeight.WorkbenchContrib
      },
      category: interactiveWindowCategory
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const editorControl = editorService.activeEditorPane?.getControl();
    if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
      if (editorControl.notebookEditor.getLength() === 0) {
        return;
      }
      const len = editorControl.notebookEditor.getLength();
      editorControl.notebookEditor.revealCellRangeInView({ start: len - 1, end: len });
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "interactive.input.focus",
      title: localize2("interactive.input.focus", "Focus Input Editor"),
      category: interactiveWindowCategory,
      menu: {
        id: MenuId.CommandPalette,
        when: InteractiveWindowOpen
      }
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const editorControl = editorService.activeEditorPane?.getControl();
    if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
      editorService.activeEditorPane?.focus();
    } else {
      const openEditors = editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
      const interactiveWindow = Iterable.find(openEditors, (identifier) => {
        return identifier.editor.typeId === InteractiveEditorInput.ID;
      });
      if (interactiveWindow) {
        const editorInput = interactiveWindow.editor;
        const currentGroup = interactiveWindow.groupId;
        const editor = await editorService.openEditor(editorInput, currentGroup);
        const editorControl2 = editor?.getControl();
        if (editorControl2 && isReplEditorControl(editorControl2) && editorControl2.notebookEditor) {
          editorService.activeEditorPane?.focus();
        }
      }
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "interactive.history.focus",
      title: localize2("interactive.history.focus", "Focus History"),
      category: interactiveWindowCategory,
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.equals("activeEditor", "workbench.editor.interactive")
      },
      keybinding: [
        {
          // On mac, require that the cursor is at the top of the input, to avoid stealing cmd+up to move the cursor to the top
          when: ContextKeyExpr.and(
            INTERACTIVE_INPUT_CURSOR_BOUNDARY.notEqualsTo("bottom"),
            INTERACTIVE_INPUT_CURSOR_BOUNDARY.notEqualsTo("none")
          ),
          weight: KeybindingWeight.WorkbenchContrib + 5,
          primary: KeyMod.CtrlCmd | KeyCode.UpArrow
        },
        {
          when: ContextKeyExpr.or(IsWindowsContext, IsLinuxContext),
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyMod.CtrlCmd | KeyCode.UpArrow
        }
      ],
      precondition: ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK, NOTEBOOK_EDITOR_FOCUSED.negate())
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const editorControl = editorService.activeEditorPane?.getControl();
    if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
      editorControl.notebookEditor.focus();
    }
  }
});
registerColor("interactive.activeCodeBorder", {
  dark: ifDefinedThenElse(peekViewBorder, peekViewBorder, "#007acc"),
  light: ifDefinedThenElse(peekViewBorder, peekViewBorder, "#007acc"),
  hcDark: contrastBorder,
  hcLight: contrastBorder
}, localize("interactive.activeCodeBorder", "The border color for the current interactive code cell when the editor has focus."));
registerColor("interactive.inactiveCodeBorder", {
  //dark: theme.getColor(listInactiveSelectionBackground) ?? transparent(listInactiveSelectionBackground, 1),
  dark: ifDefinedThenElse(listInactiveSelectionBackground, listInactiveSelectionBackground, "#37373D"),
  light: ifDefinedThenElse(listInactiveSelectionBackground, listInactiveSelectionBackground, "#E4E6F1"),
  hcDark: PANEL_BORDER,
  hcLight: PANEL_BORDER
}, localize("interactive.inactiveCodeBorder", "The border color for the current interactive code cell when the editor does not have focus."));
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  id: "interactiveWindow",
  order: 100,
  type: "object",
  "properties": {
    [ReplEditorSettings.interactiveWindowAlwaysScrollOnNewCell]: {
      type: "boolean",
      default: true,
      markdownDescription: localize("interactiveWindow.alwaysScrollOnNewCell", "Automatically scroll the interactive window to show the output of the last statement executed. If this value is false, the window will only scroll if the last cell was already the one scrolled to.")
    },
    [NotebookSetting.InteractiveWindowPromptToSave]: {
      type: "boolean",
      default: false,
      markdownDescription: localize("interactiveWindow.promptToSaveOnClose", "Prompt to save the interactive window when it is closed. Only new interactive windows will be affected by this setting change.")
    },
    [ReplEditorSettings.executeWithShiftEnter]: {
      type: "boolean",
      default: false,
      markdownDescription: localize("interactiveWindow.executeWithShiftEnter", "Execute the Interactive Window (REPL) input box with shift+enter, so that enter can be used to create a newline."),
      tags: ["replExecute"]
    },
    [ReplEditorSettings.showExecutionHint]: {
      type: "boolean",
      default: true,
      markdownDescription: localize("interactiveWindow.showExecutionHint", "Display a hint in the Interactive Window (REPL) input box to indicate how to execute code."),
      tags: ["replExecute"]
    }
  }
});
export {
  InteractiveDocumentContribution,
  InteractiveEditorSerializer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGludGVyYWN0aXZlXFxicm93c2VyXFxpbnRlcmFjdGl2ZS5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHBhcnNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZXh0bmFtZSwgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBpc0ZhbHN5T3JXaGl0ZXNwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUJ1bGtFZGl0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2J1bGtFZGl0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgUExBSU5URVhUX0xBTkdVQUdFX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbW9kZXNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyLCBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHBlZWtWaWV3Qm9yZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvcGVla1ZpZXcvYnJvd3Nlci9wZWVrVmlldy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0IGFzIFN1Z2dlc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc3VnZ2VzdC9icm93c2VyL3N1Z2dlc3QuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTG9jYWxpemVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb24uanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aXZhdGlvbiwgSVRleHRSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBjb250cmFzdEJvcmRlciwgaWZEZWZpbmVkVGhlbkVsc2UsIGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQsIHJlZ2lzdGVyQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lRGVzY3JpcHRvciwgSUVkaXRvclBhbmVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JFeHRlbnNpb25zLCBFZGl0b3JzT3JkZXIsIElFZGl0b3JDb250cm9sLCBJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5LCBJRWRpdG9yU2VyaWFsaXplciwgSVVudHlwZWRFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFBBTkVMX0JPUkRFUiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU5vdGVib29rQ2VsbEVkaXQgfSBmcm9tICcuLi8uLi9idWxrRWRpdC9icm93c2VyL2J1bGtDZWxsRWRpdHMuanMnO1xuaW1wb3J0IHsgUmVwbEVkaXRvclNldHRpbmdzLCBJTlRFUkFDVElWRV9JTlBVVF9DVVJTT1JfQk9VTkRBUlkgfSBmcm9tICcuL2ludGVyYWN0aXZlQ29tbW9uLmpzJztcbmltcG9ydCB7IElJbnRlcmFjdGl2ZURvY3VtZW50U2VydmljZSwgSW50ZXJhY3RpdmVEb2N1bWVudFNlcnZpY2UgfSBmcm9tICcuL2ludGVyYWN0aXZlRG9jdW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEludGVyYWN0aXZlRWRpdG9yIH0gZnJvbSAnLi9pbnRlcmFjdGl2ZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBJbnRlcmFjdGl2ZUVkaXRvcklucHV0IH0gZnJvbSAnLi9pbnRlcmFjdGl2ZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElJbnRlcmFjdGl2ZUhpc3RvcnlTZXJ2aWNlLCBJbnRlcmFjdGl2ZUhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi9pbnRlcmFjdGl2ZUhpc3RvcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5PVEVCT09LX0VESVRPUl9XSURHRVRfQUNUSU9OX1dFSUdIVCB9IGZyb20gJy4uLy4uL25vdGVib29rL2Jyb3dzZXIvY29udHJvbGxlci9jb3JlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0ICogYXMgaWNvbnMgZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9va0ljb25zLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9icm93c2VyL3NlcnZpY2VzL25vdGVib29rRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdFR5cGUsIENlbGxLaW5kLCBDZWxsVXJpLCBJTlRFUkFDVElWRV9XSU5ET1dfRURJVE9SX0lELCBOb3RlYm9va1NldHRpbmcsIE5vdGVib29rV29ya2luZ0NvcHlUeXBlSWRlbnRpZmllciB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJbnRlcmFjdGl2ZVdpbmRvd09wZW4sIElTX0NPTVBPU0lURV9OT1RFQk9PSywgTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rS2VybmVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjb2x1bW5Ub0VkaXRvckdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cENvbHVtbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLCBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclJlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5SWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlFZGl0b3JIYW5kbGVyLCBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5RWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1JlcGxFZGl0b3JDb250cm9sLCBSZXBsRWRpdG9yQ29udHJvbCB9IGZyb20gJy4uLy4uL3JlcGxOb3RlYm9vay9icm93c2VyL3JlcGxFZGl0b3IuanMnO1xuaW1wb3J0IHsgSW5saW5lQ2hhdENvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi9pbmxpbmVDaGF0L2Jyb3dzZXIvaW5saW5lQ2hhdENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSXNMaW51eENvbnRleHQsIElzV2luZG93c0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5cbmNvbnN0IGludGVyYWN0aXZlV2luZG93Q2F0ZWdvcnk6IElMb2NhbGl6ZWRTdHJpbmcgPSBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlV2luZG93JywgXCJJbnRlcmFjdGl2ZSBXaW5kb3dcIik7XG5cblJlZ2lzdHJ5LmFzPElFZGl0b3JQYW5lUmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yUGFuZSkucmVnaXN0ZXJFZGl0b3JQYW5lKFxuXHRFZGl0b3JQYW5lRGVzY3JpcHRvci5jcmVhdGUoXG5cdFx0SW50ZXJhY3RpdmVFZGl0b3IsXG5cdFx0SU5URVJBQ1RJVkVfV0lORE9XX0VESVRPUl9JRCxcblx0XHQnSW50ZXJhY3RpdmUgV2luZG93J1xuXHQpLFxuXHRbXG5cdFx0bmV3IFN5bmNEZXNjcmlwdG9yKEludGVyYWN0aXZlRWRpdG9ySW5wdXQpXG5cdF1cbik7XG5cbmV4cG9ydCBjbGFzcyBJbnRlcmFjdGl2ZURvY3VtZW50Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5pbnRlcmFjdGl2ZURvY3VtZW50JztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU5vdGVib29rU2VydmljZSBub3RlYm9va1NlcnZpY2U6IElOb3RlYm9va1NlcnZpY2UsXG5cdFx0QElFZGl0b3JSZXNvbHZlclNlcnZpY2UgZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlOiBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgaW5mbyA9IG5vdGVib29rU2VydmljZS5nZXRDb250cmlidXRlZE5vdGVib29rVHlwZSgnaW50ZXJhY3RpdmUnKTtcblxuXHRcdC8vIFdlIG5lZWQgdG8gY29udHJpYnV0ZSBhIG5vdGVib29rIHR5cGUgZm9yIHRoZSBJbnRlcmFjdGl2ZSBXaW5kb3cgdG8gcHJvdmlkZSBub3RlYm9vayBtb2RlbHMuXG5cdFx0aWYgKCFpbmZvKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihub3RlYm9va1NlcnZpY2UucmVnaXN0ZXJDb250cmlidXRlZE5vdGVib29rVHlwZSgnaW50ZXJhY3RpdmUnLCB7XG5cdFx0XHRcdHByb3ZpZGVyRGlzcGxheU5hbWU6ICdJbnRlcmFjdGl2ZSBOb3RlYm9vaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnSW50ZXJhY3RpdmUnLFxuXHRcdFx0XHRmaWxlbmFtZVBhdHRlcm46IFsnKi5pbnRlcmFjdGl2ZSddLFxuXHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmJ1aWx0aW5cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRlZGl0b3JSZXNvbHZlclNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoXG5cdFx0XHRgJHtTY2hlbWFzLnZzY29kZUludGVyYWN0aXZlSW5wdXR9Oi8qKmAsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAndnNjb2RlLWludGVyYWN0aXZlLWlucHV0Jyxcblx0XHRcdFx0bGFiZWw6ICdJbnRlcmFjdGl2ZSBFZGl0b3InLFxuXHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmV4Y2x1c2l2ZVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Y2FuU3VwcG9ydFJlc291cmNlOiB1cmkgPT4gdXJpLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVJbnRlcmFjdGl2ZUlucHV0LFxuXHRcdFx0XHRzaW5nbGVQZXJSZXNvdXJjZTogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlIH0pID0+IHtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3JJbnB1dCA9IGVkaXRvclNlcnZpY2UuZmluZEVkaXRvcnMoe1xuXHRcdFx0XHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRlZGl0b3JJZDogJ2ludGVyYWN0aXZlJyxcblx0XHRcdFx0XHRcdHR5cGVJZDogSW50ZXJhY3RpdmVFZGl0b3JJbnB1dC5JRFxuXHRcdFx0XHRcdH0sIHsgb3JkZXI6IEVkaXRvcnNPcmRlci5TRVFVRU5USUFMIH0pLmF0KDApO1xuXHRcdFx0XHRcdHJldHVybiBlZGl0b3JJbnB1dCE7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0ZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKFxuXHRcdFx0YCouaW50ZXJhY3RpdmVgLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ2ludGVyYWN0aXZlJyxcblx0XHRcdFx0bGFiZWw6ICdJbnRlcmFjdGl2ZSBFZGl0b3InLFxuXHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmV4Y2x1c2l2ZVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Y2FuU3VwcG9ydFJlc291cmNlOiB1cmkgPT5cblx0XHRcdFx0XHQodXJpLnNjaGVtZSA9PT0gU2NoZW1hcy51bnRpdGxlZCAmJiBleHRuYW1lKHVyaSkgPT09ICcuaW50ZXJhY3RpdmUnKSB8fFxuXHRcdFx0XHRcdCh1cmkuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbCAmJiBleHRuYW1lKHVyaSkgPT09ICcuaW50ZXJhY3RpdmUnKSxcblx0XHRcdFx0c2luZ2xlUGVyUmVzb3VyY2U6IHRydWVcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUVkaXRvcklucHV0OiAoeyByZXNvdXJjZSwgb3B0aW9ucyB9KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZGF0YSA9IENlbGxVcmkucGFyc2UocmVzb3VyY2UpO1xuXHRcdFx0XHRcdGxldCBjZWxsT3B0aW9uczogSVRleHRSZXNvdXJjZUVkaXRvcklucHV0IHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGxldCBpd1Jlc291cmNlID0gcmVzb3VyY2U7XG5cblx0XHRcdFx0XHRpZiAoZGF0YSkge1xuXHRcdFx0XHRcdFx0Y2VsbE9wdGlvbnMgPSB7IHJlc291cmNlLCBvcHRpb25zIH07XG5cdFx0XHRcdFx0XHRpd1Jlc291cmNlID0gZGF0YS5ub3RlYm9vaztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBub3RlYm9va09wdGlvbnM6IElOb3RlYm9va0VkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQgPSB7XG5cdFx0XHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRcdFx0Y2VsbE9wdGlvbnMsXG5cdFx0XHRcdFx0XHRjZWxsUmV2ZWFsVHlwZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0Y2VsbFNlbGVjdGlvbnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGlzUmVhZE9ubHk6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHZpZXdTdGF0ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0aW5kZXhlZENlbGxPcHRpb25zOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0Y29uc3QgZWRpdG9ySW5wdXQgPSBjcmVhdGVFZGl0b3IoaXdSZXNvdXJjZSwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGVkaXRvcjogZWRpdG9ySW5wdXQsXG5cdFx0XHRcdFx0XHRvcHRpb25zOiBub3RlYm9va09wdGlvbnNcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRjcmVhdGVVbnRpdGxlZEVkaXRvcklucHV0OiAoeyByZXNvdXJjZSwgb3B0aW9ucyB9KSA9PiB7XG5cdFx0XHRcdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnRlcmFjdGl2ZSB3aW5kb3cgZWRpdG9ycyBtdXN0IGhhdmUgYSByZXNvdXJjZSBuYW1lJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGRhdGEgPSBDZWxsVXJpLnBhcnNlKHJlc291cmNlKTtcblx0XHRcdFx0XHRsZXQgY2VsbE9wdGlvbnM6IElUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRcdGlmIChkYXRhKSB7XG5cdFx0XHRcdFx0XHRjZWxsT3B0aW9ucyA9IHsgcmVzb3VyY2UsIG9wdGlvbnMgfTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBub3RlYm9va09wdGlvbnM6IElOb3RlYm9va0VkaXRvck9wdGlvbnMgPSB7XG5cdFx0XHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRcdFx0Y2VsbE9wdGlvbnMsXG5cdFx0XHRcdFx0XHRjZWxsUmV2ZWFsVHlwZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0Y2VsbFNlbGVjdGlvbnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGlzUmVhZE9ubHk6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHZpZXdTdGF0ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0aW5kZXhlZENlbGxPcHRpb25zOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0Y29uc3QgZWRpdG9ySW5wdXQgPSBjcmVhdGVFZGl0b3IocmVzb3VyY2UsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRlZGl0b3I6IGVkaXRvcklucHV0LFxuXHRcdFx0XHRcdFx0b3B0aW9uczogbm90ZWJvb2tPcHRpb25zXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cbn1cblxuY2xhc3MgSW50ZXJhY3RpdmVJbnB1dENvbnRlbnRQcm92aWRlciBpbXBsZW1lbnRzIElUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5pbnRlcmFjdGl2ZUlucHV0Q29udGVudFByb3ZpZGVyJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWdpc3RyYXRpb246IElEaXNwb3NhYmxlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbiA9IHRleHRNb2RlbFNlcnZpY2UucmVnaXN0ZXJUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIoU2NoZW1hcy52c2NvZGVJbnRlcmFjdGl2ZUlucHV0LCB0aGlzKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVUZXh0Q29udGVudChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJVGV4dE1vZGVsIHwgbnVsbD4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fbW9kZWxTZXJ2aWNlLmdldE1vZGVsKHJlc291cmNlKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiBJVGV4dE1vZGVsIHwgbnVsbCA9IHRoaXMuX21vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgnJywgbnVsbCwgcmVzb3VyY2UsIGZhbHNlKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUVkaXRvcihyZXNvdXJjZTogVVJJLCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogRWRpdG9ySW5wdXQge1xuXHRjb25zdCBjb3VudGVyID0gL1xcL0ludGVyYWN0aXZlLShcXGQrKS8uZXhlYyhyZXNvdXJjZS5wYXRoKTtcblx0Y29uc3QgaW5wdXRCb3hQYXRoID0gY291bnRlciAmJiBjb3VudGVyWzFdID8gYC9JbnRlcmFjdGl2ZUlucHV0LSR7Y291bnRlclsxXX1gIDogJ0ludGVyYWN0aXZlSW5wdXQnO1xuXHRjb25zdCBpbnB1dFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZUludGVyYWN0aXZlSW5wdXQsIHBhdGg6IGlucHV0Qm94UGF0aCB9KTtcblx0Y29uc3QgZWRpdG9ySW5wdXQgPSBJbnRlcmFjdGl2ZUVkaXRvcklucHV0LmNyZWF0ZShpbnN0YW50aWF0aW9uU2VydmljZSwgcmVzb3VyY2UsIGlucHV0VXJpKTtcblxuXHRyZXR1cm4gZWRpdG9ySW5wdXQ7XG59XG5cbmNsYXNzIEludGVyYWN0aXZlV2luZG93V29ya2luZ0NvcHlFZGl0b3JIYW5kbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24sIElXb3JraW5nQ29weUVkaXRvckhhbmRsZXIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5pbnRlcmFjdGl2ZVdpbmRvd1dvcmtpbmdDb3B5RWRpdG9ySGFuZGxlcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtpbmdDb3B5RWRpdG9yU2VydmljZTogSVdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9pbnN0YWxsSGFuZGxlcigpO1xuXHR9XG5cblx0aGFuZGxlcyh3b3JraW5nQ29weTogSVdvcmtpbmdDb3B5SWRlbnRpZmllcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHZpZXdUeXBlID0gdGhpcy5fZ2V0Vmlld1R5cGUod29ya2luZ0NvcHkpO1xuXHRcdHJldHVybiAhIXZpZXdUeXBlICYmIHZpZXdUeXBlID09PSAnaW50ZXJhY3RpdmUnO1xuXG5cdH1cblxuXHRpc09wZW4od29ya2luZ0NvcHk6IElXb3JraW5nQ29weUlkZW50aWZpZXIsIGVkaXRvcjogRWRpdG9ySW5wdXQpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuaGFuZGxlcyh3b3JraW5nQ29weSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZWRpdG9yIGluc3RhbmNlb2YgSW50ZXJhY3RpdmVFZGl0b3JJbnB1dCAmJiBpc0VxdWFsKHdvcmtpbmdDb3B5LnJlc291cmNlLCBlZGl0b3IucmVzb3VyY2UpO1xuXHR9XG5cblx0Y3JlYXRlRWRpdG9yKHdvcmtpbmdDb3B5OiBJV29ya2luZ0NvcHlJZGVudGlmaWVyKTogRWRpdG9ySW5wdXQge1xuXHRcdHJldHVybiBjcmVhdGVFZGl0b3Iod29ya2luZ0NvcHkucmVzb3VyY2UsIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2luc3RhbGxIYW5kbGVyKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl93b3JraW5nQ29weUVkaXRvclNlcnZpY2UucmVnaXN0ZXJIYW5kbGVyKHRoaXMpKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFZpZXdUeXBlKHdvcmtpbmdDb3B5OiBJV29ya2luZ0NvcHlJZGVudGlmaWVyKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gTm90ZWJvb2tXb3JraW5nQ29weVR5cGVJZGVudGlmaWVyLnBhcnNlKHdvcmtpbmdDb3B5LnR5cGVJZCk/LnZpZXdUeXBlO1xuXHR9XG59XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihJbnRlcmFjdGl2ZURvY3VtZW50Q29udHJpYnV0aW9uLklELCBJbnRlcmFjdGl2ZURvY3VtZW50Q29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKEludGVyYWN0aXZlSW5wdXRDb250ZW50UHJvdmlkZXIuSUQsIEludGVyYWN0aXZlSW5wdXRDb250ZW50UHJvdmlkZXIsIHtcblx0ZWRpdG9yVHlwZUlkOiBJTlRFUkFDVElWRV9XSU5ET1dfRURJVE9SX0lEXG59KTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihJbnRlcmFjdGl2ZVdpbmRvd1dvcmtpbmdDb3B5RWRpdG9ySGFuZGxlci5JRCwgSW50ZXJhY3RpdmVXaW5kb3dXb3JraW5nQ29weUVkaXRvckhhbmRsZXIsIHtcblx0ZWRpdG9yVHlwZUlkOiBJTlRFUkFDVElWRV9XSU5ET1dfRURJVE9SX0lEXG59KTtcblxudHlwZSBpbnRlcmFjdGl2ZUVkaXRvcklucHV0RGF0YSA9IHsgcmVzb3VyY2U6IFVSSTsgaW5wdXRSZXNvdXJjZTogVVJJOyBuYW1lOiBzdHJpbmc7IGxhbmd1YWdlOiBzdHJpbmcgfTtcblxuZXhwb3J0IGNsYXNzIEludGVyYWN0aXZlRWRpdG9yU2VyaWFsaXplciBpbXBsZW1lbnRzIElFZGl0b3JTZXJpYWxpemVyIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9IEludGVyYWN0aXZlRWRpdG9ySW5wdXQuSUQ7XG5cblx0Y2FuU2VyaWFsaXplKGVkaXRvcjogRWRpdG9ySW5wdXQpOiBlZGl0b3IgaXMgSW50ZXJhY3RpdmVFZGl0b3JJbnB1dCB7XG5cdFx0aWYgKCEoZWRpdG9yIGluc3RhbmNlb2YgSW50ZXJhY3RpdmVFZGl0b3JJbnB1dCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gVVJJLmlzVXJpKGVkaXRvci5wcmltYXJ5LnJlc291cmNlKSAmJiBVUkkuaXNVcmkoZWRpdG9yLmlucHV0UmVzb3VyY2UpO1xuXHR9XG5cblx0c2VyaWFsaXplKGlucHV0OiBFZGl0b3JJbnB1dCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmNhblNlcmlhbGl6ZShpbnB1dCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdHJlc291cmNlOiBpbnB1dC5wcmltYXJ5LnJlc291cmNlLFxuXHRcdFx0aW5wdXRSZXNvdXJjZTogaW5wdXQuaW5wdXRSZXNvdXJjZSxcblx0XHRcdG5hbWU6IGlucHV0LmdldE5hbWUoKSxcblx0XHRcdGxhbmd1YWdlOiBpbnB1dC5sYW5ndWFnZVxuXHRcdH0pO1xuXHR9XG5cblx0ZGVzZXJpYWxpemUoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgcmF3OiBzdHJpbmcpIHtcblx0XHRjb25zdCBkYXRhID0gPGludGVyYWN0aXZlRWRpdG9ySW5wdXREYXRhPnBhcnNlKHJhdyk7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB7IHJlc291cmNlLCBpbnB1dFJlc291cmNlLCBuYW1lLCBsYW5ndWFnZSB9ID0gZGF0YTtcblx0XHRpZiAoIVVSSS5pc1VyaShyZXNvdXJjZSkgfHwgIVVSSS5pc1VyaShpbnB1dFJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBpbnB1dCA9IEludGVyYWN0aXZlRWRpdG9ySW5wdXQuY3JlYXRlKGluc3RhbnRpYXRpb25TZXJ2aWNlLCByZXNvdXJjZSwgaW5wdXRSZXNvdXJjZSwgbmFtZSwgbGFuZ3VhZ2UpO1xuXHRcdHJldHVybiBpbnB1dDtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpXG5cdC5yZWdpc3RlckVkaXRvclNlcmlhbGl6ZXIoXG5cdFx0SW50ZXJhY3RpdmVFZGl0b3JTZXJpYWxpemVyLklELFxuXHRcdEludGVyYWN0aXZlRWRpdG9yU2VyaWFsaXplcik7XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElJbnRlcmFjdGl2ZUhpc3RvcnlTZXJ2aWNlLCBJbnRlcmFjdGl2ZUhpc3RvcnlTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElJbnRlcmFjdGl2ZURvY3VtZW50U2VydmljZSwgSW50ZXJhY3RpdmVEb2N1bWVudFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdfaW50ZXJhY3RpdmUub3BlbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZS5vcGVuJywgJ09wZW4gSW50ZXJhY3RpdmUgV2luZG93JyksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRjYXRlZ29yeTogaW50ZXJhY3RpdmVXaW5kb3dDYXRlZ29yeSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaW50ZXJhY3RpdmUub3BlbicsICdPcGVuIEludGVyYWN0aXZlIFdpbmRvdycpLFxuXHRcdFx0XHRhcmdzOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bmFtZTogJ3Nob3dPcHRpb25zJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnU2hvdyBPcHRpb25zJyxcblx0XHRcdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdCd2aWV3Q29sdW1uJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAtMVxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0J3ByZXNlcnZlRm9jdXMnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bmFtZTogJ3Jlc291cmNlJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnSW50ZXJhY3RpdmUgcmVzb3VyY2UgVXJpJyxcblx0XHRcdFx0XHRcdGlzT3B0aW9uYWw6IHRydWVcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG5hbWU6ICdjb250cm9sbGVySWQnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdOb3RlYm9vayBjb250cm9sbGVyIElkJyxcblx0XHRcdFx0XHRcdGlzT3B0aW9uYWw6IHRydWVcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG5hbWU6ICd0aXRsZScsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ05vdGVib29rIGVkaXRvciB0aXRsZScsXG5cdFx0XHRcdFx0XHRpc09wdGlvbmFsOiB0cnVlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2hvd09wdGlvbnM/OiBudW1iZXIgfCB7IHZpZXdDb2x1bW4/OiBudW1iZXI7IHByZXNlcnZlRm9jdXM/OiBib29sZWFuIH0sIHJlc291cmNlPzogVVJJLCBpZD86IHN0cmluZywgdGl0bGU/OiBzdHJpbmcpOiBQcm9taXNlPHsgbm90ZWJvb2tVcmk6IFVSSTsgaW5wdXRVcmk6IFVSSTsgbm90ZWJvb2tFZGl0b3JJZD86IHN0cmluZyB9PiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHRjb25zdCBoaXN0b3J5U2VydmljZSA9IGFjY2Vzc29yLmdldChJSW50ZXJhY3RpdmVIaXN0b3J5U2VydmljZSk7XG5cdFx0Y29uc3Qga2VybmVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlKTtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGdyb3VwID0gY29sdW1uVG9FZGl0b3JHcm91cChlZGl0b3JHcm91cFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0eXBlb2Ygc2hvd09wdGlvbnMgPT09ICdudW1iZXInID8gc2hvd09wdGlvbnMgOiBzaG93T3B0aW9ucz8udmlld0NvbHVtbik7XG5cdFx0Y29uc3QgZWRpdG9yT3B0aW9ucyA9IHtcblx0XHRcdGFjdGl2YXRpb246IEVkaXRvckFjdGl2YXRpb24uUFJFU0VSVkUsXG5cdFx0XHRwcmVzZXJ2ZUZvY3VzOiB0eXBlb2Ygc2hvd09wdGlvbnMgIT09ICdudW1iZXInID8gKHNob3dPcHRpb25zPy5wcmVzZXJ2ZUZvY3VzID8/IGZhbHNlKSA6IGZhbHNlXG5cdFx0fTtcblxuXHRcdGlmIChyZXNvdXJjZSAmJiBleHRuYW1lKHJlc291cmNlKSA9PT0gJy5pbnRlcmFjdGl2ZScpIHtcblx0XHRcdGxvZ1NlcnZpY2UuZGVidWcoJ09wZW4gaW50ZXJhY3RpdmUgd2luZG93IGZyb20gcmVzb3VyY2U6JywgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCByZXNvdXJjZVVyaSA9IFVSSS5yZXZpdmUocmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgZWRpdG9ycyA9IGVkaXRvclNlcnZpY2UuZmluZEVkaXRvcnMocmVzb3VyY2VVcmkpLmZpbHRlcihpZCA9PiBpZC5lZGl0b3IgaW5zdGFuY2VvZiBJbnRlcmFjdGl2ZUVkaXRvcklucHV0ICYmIGlkLmVkaXRvci5yZXNvdXJjZT8udG9TdHJpbmcoKSA9PT0gcmVzb3VyY2VVcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRpZiAoZWRpdG9ycy5sZW5ndGgpIHtcblx0XHRcdFx0bG9nU2VydmljZS5kZWJ1ZygnRmluZCBleGlzdGluZyBpbnRlcmFjdGl2ZSB3aW5kb3c6JywgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGNvbnN0IGVkaXRvcklucHV0ID0gZWRpdG9yc1swXS5lZGl0b3IgYXMgSW50ZXJhY3RpdmVFZGl0b3JJbnB1dDtcblx0XHRcdFx0Y29uc3QgY3VycmVudEdyb3VwID0gZWRpdG9yc1swXS5ncm91cElkO1xuXHRcdFx0XHRjb25zdCBlZGl0b3IgPSBhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoZWRpdG9ySW5wdXQsIGVkaXRvck9wdGlvbnMsIGN1cnJlbnRHcm91cCk7XG5cdFx0XHRcdGNvbnN0IGVkaXRvckNvbnRyb2wgPSBlZGl0b3I/LmdldENvbnRyb2woKSBhcyBSZXBsRWRpdG9yQ29udHJvbDtcblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG5vdGVib29rVXJpOiBlZGl0b3JJbnB1dC5yZXNvdXJjZSxcblx0XHRcdFx0XHRpbnB1dFVyaTogZWRpdG9ySW5wdXQuaW5wdXRSZXNvdXJjZSxcblx0XHRcdFx0XHRub3RlYm9va0VkaXRvcklkOiBlZGl0b3JDb250cm9sPy5ub3RlYm9va0VkaXRvcj8uZ2V0SWQoKVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGV4aXN0aW5nTm90ZWJvb2tEb2N1bWVudCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGVkaXRvclNlcnZpY2UuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCkuZm9yRWFjaChlZGl0b3IgPT4ge1xuXHRcdFx0aWYgKGVkaXRvci5lZGl0b3IucmVzb3VyY2UpIHtcblx0XHRcdFx0ZXhpc3RpbmdOb3RlYm9va0RvY3VtZW50LmFkZChlZGl0b3IuZWRpdG9yLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0bGV0IG5vdGVib29rVXJpOiBVUkkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGlucHV0VXJpOiBVUkkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGNvdW50ZXIgPSAxO1xuXHRcdGRvIHtcblx0XHRcdG5vdGVib29rVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMudW50aXRsZWQsIHBhdGg6IGAvSW50ZXJhY3RpdmUtJHtjb3VudGVyfS5pbnRlcmFjdGl2ZWAgfSk7XG5cdFx0XHRpbnB1dFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZUludGVyYWN0aXZlSW5wdXQsIHBhdGg6IGAvSW50ZXJhY3RpdmVJbnB1dC0ke2NvdW50ZXJ9YCB9KTtcblxuXHRcdFx0Y291bnRlcisrO1xuXHRcdH0gd2hpbGUgKGV4aXN0aW5nTm90ZWJvb2tEb2N1bWVudC5oYXMobm90ZWJvb2tVcmkudG9TdHJpbmcoKSkpO1xuXHRcdEludGVyYWN0aXZlRWRpdG9ySW5wdXQuc2V0TmFtZShub3RlYm9va1VyaSwgdGl0bGUpO1xuXG5cdFx0bG9nU2VydmljZS5kZWJ1ZygnT3BlbiBuZXcgaW50ZXJhY3RpdmUgd2luZG93OicsIG5vdGVib29rVXJpLnRvU3RyaW5nKCksIGlucHV0VXJpLnRvU3RyaW5nKCkpO1xuXG5cdFx0aWYgKGlkKSB7XG5cdFx0XHRjb25zdCBhbGxLZXJuZWxzID0ga2VybmVsU2VydmljZS5nZXRNYXRjaGluZ0tlcm5lbCh7IHVyaTogbm90ZWJvb2tVcmksIG5vdGVib29rVHlwZTogJ2ludGVyYWN0aXZlJyB9KS5hbGw7XG5cdFx0XHRjb25zdCBwcmVmZXJyZWRLZXJuZWwgPSBhbGxLZXJuZWxzLmZpbmQoa2VybmVsID0+IGtlcm5lbC5pZCA9PT0gaWQpO1xuXHRcdFx0aWYgKHByZWZlcnJlZEtlcm5lbCkge1xuXHRcdFx0XHRrZXJuZWxTZXJ2aWNlLnByZXNlbGVjdEtlcm5lbEZvck5vdGVib29rKHByZWZlcnJlZEtlcm5lbCwgeyB1cmk6IG5vdGVib29rVXJpLCBub3RlYm9va1R5cGU6ICdpbnRlcmFjdGl2ZScgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aGlzdG9yeVNlcnZpY2UuY2xlYXJIaXN0b3J5KG5vdGVib29rVXJpKTtcblx0XHRjb25zdCBlZGl0b3JJbnB1dDogSVVudHlwZWRFZGl0b3JJbnB1dCA9IHsgcmVzb3VyY2U6IG5vdGVib29rVXJpLCBvcHRpb25zOiBlZGl0b3JPcHRpb25zIH07XG5cdFx0Y29uc3QgZWRpdG9yUGFuZSA9IGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihlZGl0b3JJbnB1dCwgZ3JvdXApO1xuXHRcdGNvbnN0IGVkaXRvckNvbnRyb2wgPSBlZGl0b3JQYW5lPy5nZXRDb250cm9sKCkgYXMgUmVwbEVkaXRvckNvbnRyb2w7XG5cdFx0Ly8gRXh0ZW5zaW9ucyBtdXN0IHJldGFpbiByZWZlcmVuY2VzIHRvIHRoZXNlIFVSSXMgdG8gbWFuaXB1bGF0ZSB0aGUgaW50ZXJhY3RpdmUgZWRpdG9yXG5cdFx0bG9nU2VydmljZS5kZWJ1ZygnTmV3IGludGVyYWN0aXZlIHdpbmRvdyBvcGVuZWQuIE5vdGVib29rIGVkaXRvciBpZCcsIGVkaXRvckNvbnRyb2w/Lm5vdGVib29rRWRpdG9yPy5nZXRJZCgpKTtcblx0XHRyZXR1cm4geyBub3RlYm9va1VyaSwgaW5wdXRVcmksIG5vdGVib29rRWRpdG9ySWQ6IGVkaXRvckNvbnRyb2w/Lm5vdGVib29rRWRpdG9yPy5nZXRJZCgpIH07XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdpbnRlcmFjdGl2ZS5leGVjdXRlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlLmV4ZWN1dGUnLCAnRXhlY3V0ZSBDb2RlJyksXG5cdFx0XHRjYXRlZ29yeTogaW50ZXJhY3RpdmVXaW5kb3dDYXRlZ29yeSxcblx0XHRcdGtleWJpbmRpbmc6IFt7XG5cdFx0XHRcdC8vIHdoZW46IE5PVEVCT09LX0NFTExfTElTVF9GT0NVU0VELFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0SVNfQ09NUE9TSVRFX05PVEVCT09LLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnYWN0aXZlRWRpdG9yJywgJ3dvcmtiZW5jaC5lZGl0b3IuaW50ZXJhY3RpdmUnKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRW50ZXIsXG5cdFx0XHRcdHdlaWdodDogTk9URUJPT0tfRURJVE9SX1dJREdFVF9BQ1RJT05fV0VJR0hUXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRJU19DT01QT1NJVEVfTk9URUJPT0ssXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdhY3RpdmVFZGl0b3InLCAnd29ya2JlbmNoLmVkaXRvci5pbnRlcmFjdGl2ZScpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLmludGVyYWN0aXZlV2luZG93LmV4ZWN1dGVXaXRoU2hpZnRFbnRlcicsIHRydWUpXG5cdFx0XHRcdCksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRW50ZXIsXG5cdFx0XHRcdHdlaWdodDogTk9URUJPT0tfRURJVE9SX1dJREdFVF9BQ1RJT05fV0VJR0hUXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRJU19DT01QT1NJVEVfTk9URUJPT0ssXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdhY3RpdmVFZGl0b3InLCAnd29ya2JlbmNoLmVkaXRvci5pbnRlcmFjdGl2ZScpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLmludGVyYWN0aXZlV2luZG93LmV4ZWN1dGVXaXRoU2hpZnRFbnRlcicsIGZhbHNlKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyLFxuXHRcdFx0XHR3ZWlnaHQ6IE5PVEVCT09LX0VESVRPUl9XSURHRVRfQUNUSU9OX1dFSUdIVFxuXHRcdFx0fV0sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkludGVyYWN0aXZlSW5wdXRFeGVjdXRlXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0aWNvbjogaWNvbnMuZXhlY3V0ZUljb24sXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ0V4ZWN1dGUgdGhlIENvbnRlbnRzIG9mIHRoZSBJbnB1dCBCb3gnLFxuXHRcdFx0XHRhcmdzOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bmFtZTogJ3Jlc291cmNlJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnSW50ZXJhY3RpdmUgcmVzb3VyY2UgVXJpJyxcblx0XHRcdFx0XHRcdGlzT3B0aW9uYWw6IHRydWVcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IFVyaUNvbXBvbmVudHMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBidWxrRWRpdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUJ1bGtFZGl0U2VydmljZSk7XG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUludGVyYWN0aXZlSGlzdG9yeVNlcnZpY2UpO1xuXHRcdGNvbnN0IG5vdGVib29rRWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlKTtcblx0XHRsZXQgZWRpdG9yQ29udHJvbDogSUVkaXRvckNvbnRyb2wgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGNvbnRleHQpIHtcblx0XHRcdGNvbnN0IHJlc291cmNlVXJpID0gVVJJLnJldml2ZShjb250ZXh0KTtcblx0XHRcdGNvbnN0IGVkaXRvcnMgPSBlZGl0b3JTZXJ2aWNlLmZpbmRFZGl0b3JzKHJlc291cmNlVXJpKTtcblx0XHRcdGZvciAoY29uc3QgZm91bmQgb2YgZWRpdG9ycykge1xuXHRcdFx0XHRpZiAoZm91bmQuZWRpdG9yLnR5cGVJZCA9PT0gSW50ZXJhY3RpdmVFZGl0b3JJbnB1dC5JRCkge1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRvciA9IGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihmb3VuZC5lZGl0b3IsIGZvdW5kLmdyb3VwSWQpO1xuXHRcdFx0XHRcdGVkaXRvckNvbnRyb2wgPSBlZGl0b3I/LmdldENvbnRyb2woKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdGVkaXRvckNvbnRyb2wgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU/LmdldENvbnRyb2woKTtcblx0XHR9XG5cblx0XHRpZiAoZWRpdG9yQ29udHJvbCAmJiBpc1JlcGxFZGl0b3JDb250cm9sKGVkaXRvckNvbnRyb2wpICYmIGVkaXRvckNvbnRyb2wubm90ZWJvb2tFZGl0b3IpIHtcblx0XHRcdGNvbnN0IG5vdGVib29rRG9jdW1lbnQgPSBlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yLnRleHRNb2RlbDtcblx0XHRcdGNvbnN0IHRleHRNb2RlbCA9IGVkaXRvckNvbnRyb2wuYWN0aXZlQ29kZUVkaXRvcj8uZ2V0TW9kZWwoKTtcblx0XHRcdGNvbnN0IGFjdGl2ZUtlcm5lbCA9IGVkaXRvckNvbnRyb2wubm90ZWJvb2tFZGl0b3IuYWN0aXZlS2VybmVsO1xuXHRcdFx0Y29uc3QgbGFuZ3VhZ2UgPSBhY3RpdmVLZXJuZWw/LnN1cHBvcnRlZExhbmd1YWdlc1swXSA/PyBQTEFJTlRFWFRfTEFOR1VBR0VfSUQ7XG5cblx0XHRcdGlmIChub3RlYm9va0RvY3VtZW50ICYmIHRleHRNb2RlbCAmJiBlZGl0b3JDb250cm9sLmFjdGl2ZUNvZGVFZGl0b3IpIHtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSBub3RlYm9va0RvY3VtZW50Lmxlbmd0aDtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSB0ZXh0TW9kZWwuZ2V0VmFsdWUoKTtcblxuXHRcdFx0XHRpZiAoaXNGYWxzeU9yV2hpdGVzcGFjZSh2YWx1ZSkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjdHJsID0gSW5saW5lQ2hhdENvbnRyb2xsZXIuZ2V0KGVkaXRvckNvbnRyb2wuYWN0aXZlQ29kZUVkaXRvcik7XG5cdFx0XHRcdGlmIChjdHJsKSB7XG5cdFx0XHRcdFx0Y3RybC5hY2NlcHRTZXNzaW9uKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRoaXN0b3J5U2VydmljZS5yZXBsYWNlTGFzdChub3RlYm9va0RvY3VtZW50LnVyaSwgdmFsdWUpO1xuXHRcdFx0XHRoaXN0b3J5U2VydmljZS5hZGRUb0hpc3Rvcnkobm90ZWJvb2tEb2N1bWVudC51cmksICcnKTtcblx0XHRcdFx0dGV4dE1vZGVsLnNldFZhbHVlKCcnKTtcblxuXHRcdFx0XHRjb25zdCBjb2xsYXBzZVN0YXRlID0gZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvci5ub3RlYm9va09wdGlvbnMuZ2V0RGlzcGxheU9wdGlvbnMoKS5pbnRlcmFjdGl2ZVdpbmRvd0NvbGxhcHNlQ29kZUNlbGxzID09PSAnZnJvbUVkaXRvcicgP1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGlucHV0Q29sbGFwc2VkOiBmYWxzZSxcblx0XHRcdFx0XHRcdG91dHB1dENvbGxhcHNlZDogZmFsc2Vcblx0XHRcdFx0XHR9IDpcblx0XHRcdFx0XHR1bmRlZmluZWQ7XG5cblx0XHRcdFx0YXdhaXQgYnVsa0VkaXRTZXJ2aWNlLmFwcGx5KFtcblx0XHRcdFx0XHRuZXcgUmVzb3VyY2VOb3RlYm9va0NlbGxFZGl0KG5vdGVib29rRG9jdW1lbnQudXJpLFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0XHRcdGluZGV4OiBpbmRleCxcblx0XHRcdFx0XHRcdFx0Y291bnQ6IDAsXG5cdFx0XHRcdFx0XHRcdGNlbGxzOiBbe1xuXHRcdFx0XHRcdFx0XHRcdGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlLFxuXHRcdFx0XHRcdFx0XHRcdG1pbWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHRsYW5ndWFnZSxcblx0XHRcdFx0XHRcdFx0XHRzb3VyY2U6IHZhbHVlLFxuXHRcdFx0XHRcdFx0XHRcdG91dHB1dHM6IFtdLFxuXHRcdFx0XHRcdFx0XHRcdG1ldGFkYXRhOiB7fSxcblx0XHRcdFx0XHRcdFx0XHRjb2xsYXBzZVN0YXRlXG5cdFx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0KVxuXHRcdFx0XHRdKTtcblxuXHRcdFx0XHQvLyByZXZlYWwgdGhlIGNlbGwgaW50byB2aWV3IGZpcnN0XG5cdFx0XHRcdGNvbnN0IHJhbmdlID0geyBzdGFydDogaW5kZXgsIGVuZDogaW5kZXggKyAxIH07XG5cdFx0XHRcdGVkaXRvckNvbnRyb2wubm90ZWJvb2tFZGl0b3IucmV2ZWFsQ2VsbFJhbmdlSW5WaWV3KHJhbmdlKTtcblx0XHRcdFx0YXdhaXQgZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvci5leGVjdXRlTm90ZWJvb2tDZWxscyhlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yLmdldENlbGxzSW5SYW5nZSh7IHN0YXJ0OiBpbmRleCwgZW5kOiBpbmRleCArIDEgfSkpO1xuXG5cdFx0XHRcdC8vIHVwZGF0ZSB0aGUgc2VsZWN0aW9uIGFuZCBmb2N1cyBpbiB0aGUgZXh0ZW5zaW9uIGhvc3QgbW9kZWxcblx0XHRcdFx0Y29uc3QgZWRpdG9yID0gbm90ZWJvb2tFZGl0b3JTZXJ2aWNlLmdldE5vdGVib29rRWRpdG9yKGVkaXRvckNvbnRyb2wubm90ZWJvb2tFZGl0b3IuZ2V0SWQoKSk7XG5cdFx0XHRcdGlmIChlZGl0b3IpIHtcblx0XHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbcmFuZ2VdKTtcblx0XHRcdFx0XHRlZGl0b3Iuc2V0Rm9jdXMocmFuZ2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnaW50ZXJhY3RpdmUuaW5wdXQuY2xlYXInLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmUuaW5wdXQuY2xlYXInLCAnQ2xlYXIgdGhlIGludGVyYWN0aXZlIHdpbmRvdyBpbnB1dCBlZGl0b3IgY29udGVudHMnKSxcblx0XHRcdGNhdGVnb3J5OiBpbnRlcmFjdGl2ZVdpbmRvd0NhdGVnb3J5LFxuXHRcdFx0ZjE6IGZhbHNlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JDb250cm9sID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lPy5nZXRDb250cm9sKCk7XG5cblx0XHRpZiAoZWRpdG9yQ29udHJvbCAmJiBpc1JlcGxFZGl0b3JDb250cm9sKGVkaXRvckNvbnRyb2wpICYmIGVkaXRvckNvbnRyb2wubm90ZWJvb2tFZGl0b3IpIHtcblx0XHRcdGNvbnN0IG5vdGVib29rRG9jdW1lbnQgPSBlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yLnRleHRNb2RlbDtcblx0XHRcdGNvbnN0IGVkaXRvciA9IGVkaXRvckNvbnRyb2wuYWN0aXZlQ29kZUVkaXRvcjtcblx0XHRcdGNvbnN0IHJhbmdlID0gZWRpdG9yPy5nZXRNb2RlbCgpPy5nZXRGdWxsTW9kZWxSYW5nZSgpO1xuXG5cblx0XHRcdGlmIChub3RlYm9va0RvY3VtZW50ICYmIGVkaXRvciAmJiByYW5nZSkge1xuXHRcdFx0XHRlZGl0b3IuZXhlY3V0ZUVkaXRzKCcnLCBbRWRpdE9wZXJhdGlvbi5yZXBsYWNlKHJhbmdlLCBudWxsKV0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2ludGVyYWN0aXZlLmhpc3RvcnkucHJldmlvdXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmUuaGlzdG9yeS5wcmV2aW91cycsICdQcmV2aW91cyB2YWx1ZSBpbiBoaXN0b3J5JyksXG5cdFx0XHRjYXRlZ29yeTogaW50ZXJhY3RpdmVXaW5kb3dDYXRlZ29yeSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdElOVEVSQUNUSVZFX0lOUFVUX0NVUlNPUl9CT1VOREFSWS5ub3RFcXVhbHNUbygnYm90dG9tJyksXG5cdFx0XHRcdFx0SU5URVJBQ1RJVkVfSU5QVVRfQ1VSU09SX0JPVU5EQVJZLm5vdEVxdWFsc1RvKCdub25lJyksXG5cdFx0XHRcdFx0U3VnZ2VzdENvbnRleHQuVmlzaWJsZS50b05lZ2F0ZWQoKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLlVwQXJyb3csXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoSVNfQ09NUE9TSVRFX05PVEVCT09LLCBOT1RFQk9PS19FRElUT1JfRk9DVVNFRC5uZWdhdGUoKSlcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGhpc3RvcnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnRlcmFjdGl2ZUhpc3RvcnlTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JDb250cm9sID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lPy5nZXRDb250cm9sKCk7XG5cblxuXG5cdFx0aWYgKGVkaXRvckNvbnRyb2wgJiYgaXNSZXBsRWRpdG9yQ29udHJvbChlZGl0b3JDb250cm9sKSAmJiBlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yKSB7XG5cdFx0XHRjb25zdCBub3RlYm9va0RvY3VtZW50ID0gZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWw7XG5cdFx0XHRjb25zdCB0ZXh0TW9kZWwgPSBlZGl0b3JDb250cm9sLmFjdGl2ZUNvZGVFZGl0b3I/LmdldE1vZGVsKCk7XG5cblx0XHRcdGlmIChub3RlYm9va0RvY3VtZW50ICYmIHRleHRNb2RlbCkge1xuXHRcdFx0XHRjb25zdCBwcmV2aW91c1ZhbHVlID0gaGlzdG9yeVNlcnZpY2UuZ2V0UHJldmlvdXNWYWx1ZShub3RlYm9va0RvY3VtZW50LnVyaSk7XG5cdFx0XHRcdGlmIChwcmV2aW91c1ZhbHVlKSB7XG5cdFx0XHRcdFx0dGV4dE1vZGVsLnNldFZhbHVlKHByZXZpb3VzVmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnaW50ZXJhY3RpdmUuaGlzdG9yeS5uZXh0Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlLmhpc3RvcnkubmV4dCcsICdOZXh0IHZhbHVlIGluIGhpc3RvcnknKSxcblx0XHRcdGNhdGVnb3J5OiBpbnRlcmFjdGl2ZVdpbmRvd0NhdGVnb3J5LFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0SU5URVJBQ1RJVkVfSU5QVVRfQ1VSU09SX0JPVU5EQVJZLm5vdEVxdWFsc1RvKCd0b3AnKSxcblx0XHRcdFx0XHRJTlRFUkFDVElWRV9JTlBVVF9DVVJTT1JfQk9VTkRBUlkubm90RXF1YWxzVG8oJ25vbmUnKSxcblx0XHRcdFx0XHRTdWdnZXN0Q29udGV4dC5WaXNpYmxlLnRvTmVnYXRlZCgpXG5cdFx0XHRcdCksXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRG93bkFycm93LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKElTX0NPTVBPU0lURV9OT1RFQk9PSywgTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQubmVnYXRlKCkpXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBoaXN0b3J5U2VydmljZSA9IGFjY2Vzc29yLmdldChJSW50ZXJhY3RpdmVIaXN0b3J5U2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yQ29udHJvbCA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZT8uZ2V0Q29udHJvbCgpO1xuXG5cdFx0aWYgKGVkaXRvckNvbnRyb2wgJiYgaXNSZXBsRWRpdG9yQ29udHJvbChlZGl0b3JDb250cm9sKSAmJiBlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yKSB7XG5cdFx0XHRjb25zdCBub3RlYm9va0RvY3VtZW50ID0gZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWw7XG5cdFx0XHRjb25zdCB0ZXh0TW9kZWwgPSBlZGl0b3JDb250cm9sLmFjdGl2ZUNvZGVFZGl0b3I/LmdldE1vZGVsKCk7XG5cblx0XHRcdGlmIChub3RlYm9va0RvY3VtZW50ICYmIHRleHRNb2RlbCkge1xuXHRcdFx0XHRjb25zdCBuZXh0VmFsdWUgPSBoaXN0b3J5U2VydmljZS5nZXROZXh0VmFsdWUobm90ZWJvb2tEb2N1bWVudC51cmkpO1xuXHRcdFx0XHRpZiAobmV4dFZhbHVlICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0dGV4dE1vZGVsLnNldFZhbHVlKG5leHRWYWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2ludGVyYWN0aXZlLnNjcm9sbFRvVG9wJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnaW50ZXJhY3RpdmVTY3JvbGxUb1RvcCcsICdTY3JvbGwgdG8gVG9wJyksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygnYWN0aXZlRWRpdG9yJywgJ3dvcmtiZW5jaC5lZGl0b3IuaW50ZXJhY3RpdmUnKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkhvbWUsXG5cdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuVXBBcnJvdyB9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiBpbnRlcmFjdGl2ZVdpbmRvd0NhdGVnb3J5LFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yQ29udHJvbCA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZT8uZ2V0Q29udHJvbCgpO1xuXG5cdFx0aWYgKGVkaXRvckNvbnRyb2wgJiYgaXNSZXBsRWRpdG9yQ29udHJvbChlZGl0b3JDb250cm9sKSAmJiBlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yKSB7XG5cdFx0XHRpZiAoZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvci5nZXRMZW5ndGgoKSA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGVkaXRvckNvbnRyb2wubm90ZWJvb2tFZGl0b3IucmV2ZWFsQ2VsbFJhbmdlSW5WaWV3KHsgc3RhcnQ6IDAsIGVuZDogMSB9KTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdpbnRlcmFjdGl2ZS5zY3JvbGxUb0JvdHRvbScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2ludGVyYWN0aXZlU2Nyb2xsVG9Cb3R0b20nLCAnU2Nyb2xsIHRvIEJvdHRvbScpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2FjdGl2ZUVkaXRvcicsICd3b3JrYmVuY2guZWRpdG9yLmludGVyYWN0aXZlJyksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5FbmQsXG5cdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRG93bkFycm93IH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IGludGVyYWN0aXZlV2luZG93Q2F0ZWdvcnksXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JDb250cm9sID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lPy5nZXRDb250cm9sKCk7XG5cblx0XHRpZiAoZWRpdG9yQ29udHJvbCAmJiBpc1JlcGxFZGl0b3JDb250cm9sKGVkaXRvckNvbnRyb2wpICYmIGVkaXRvckNvbnRyb2wubm90ZWJvb2tFZGl0b3IpIHtcblx0XHRcdGlmIChlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yLmdldExlbmd0aCgpID09PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGVuID0gZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvci5nZXRMZW5ndGgoKTtcblx0XHRcdGVkaXRvckNvbnRyb2wubm90ZWJvb2tFZGl0b3IucmV2ZWFsQ2VsbFJhbmdlSW5WaWV3KHsgc3RhcnQ6IGxlbiAtIDEsIGVuZDogbGVuIH0pO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2ludGVyYWN0aXZlLmlucHV0LmZvY3VzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlLmlucHV0LmZvY3VzJywgJ0ZvY3VzIElucHV0IEVkaXRvcicpLFxuXHRcdFx0Y2F0ZWdvcnk6IGludGVyYWN0aXZlV2luZG93Q2F0ZWdvcnksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IEludGVyYWN0aXZlV2luZG93T3BlblxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvckNvbnRyb2wgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU/LmdldENvbnRyb2woKTtcblxuXHRcdGlmIChlZGl0b3JDb250cm9sICYmIGlzUmVwbEVkaXRvckNvbnRyb2woZWRpdG9yQ29udHJvbCkgJiYgZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvcikge1xuXHRcdFx0ZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lPy5mb2N1cygpO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdC8vIGZpbmQgYW5kIG9wZW4gdGhlIG1vc3QgcmVjZW50IGludGVyYWN0aXZlIHdpbmRvd1xuXHRcdFx0Y29uc3Qgb3BlbkVkaXRvcnMgPSBlZGl0b3JTZXJ2aWNlLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKTtcblx0XHRcdGNvbnN0IGludGVyYWN0aXZlV2luZG93ID0gSXRlcmFibGUuZmluZChvcGVuRWRpdG9ycywgaWRlbnRpZmllciA9PiB7IHJldHVybiBpZGVudGlmaWVyLmVkaXRvci50eXBlSWQgPT09IEludGVyYWN0aXZlRWRpdG9ySW5wdXQuSUQ7IH0pO1xuXHRcdFx0aWYgKGludGVyYWN0aXZlV2luZG93KSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvcklucHV0ID0gaW50ZXJhY3RpdmVXaW5kb3cuZWRpdG9yIGFzIEludGVyYWN0aXZlRWRpdG9ySW5wdXQ7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRHcm91cCA9IGludGVyYWN0aXZlV2luZG93Lmdyb3VwSWQ7XG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihlZGl0b3JJbnB1dCwgY3VycmVudEdyb3VwKTtcblx0XHRcdFx0Y29uc3QgZWRpdG9yQ29udHJvbCA9IGVkaXRvcj8uZ2V0Q29udHJvbCgpO1xuXG5cdFx0XHRcdGlmIChlZGl0b3JDb250cm9sICYmIGlzUmVwbEVkaXRvckNvbnRyb2woZWRpdG9yQ29udHJvbCkgJiYgZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvcikge1xuXHRcdFx0XHRcdGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZT8uZm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2ludGVyYWN0aXZlLmhpc3RvcnkuZm9jdXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmUuaGlzdG9yeS5mb2N1cycsICdGb2N1cyBIaXN0b3J5JyksXG5cdFx0XHRjYXRlZ29yeTogaW50ZXJhY3RpdmVXaW5kb3dDYXRlZ29yeSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdhY3RpdmVFZGl0b3InLCAnd29ya2JlbmNoLmVkaXRvci5pbnRlcmFjdGl2ZScpLFxuXHRcdFx0fSxcblx0XHRcdGtleWJpbmRpbmc6IFt7XG5cdFx0XHRcdC8vIE9uIG1hYywgcmVxdWlyZSB0aGF0IHRoZSBjdXJzb3IgaXMgYXQgdGhlIHRvcCBvZiB0aGUgaW5wdXQsIHRvIGF2b2lkIHN0ZWFsaW5nIGNtZCt1cCB0byBtb3ZlIHRoZSBjdXJzb3IgdG8gdGhlIHRvcFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0SU5URVJBQ1RJVkVfSU5QVVRfQ1VSU09SX0JPVU5EQVJZLm5vdEVxdWFsc1RvKCdib3R0b20nKSxcblx0XHRcdFx0XHRJTlRFUkFDVElWRV9JTlBVVF9DVVJTT1JfQk9VTkRBUlkubm90RXF1YWxzVG8oJ25vbmUnKSksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgNSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlVwQXJyb3dcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKElzV2luZG93c0NvbnRleHQsIElzTGludXhDb250ZXh0KSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5VcEFycm93LFxuXHRcdFx0fV0sXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChJU19DT01QT1NJVEVfTk9URUJPT0ssIE5PVEVCT09LX0VESVRPUl9GT0NVU0VELm5lZ2F0ZSgpKVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yQ29udHJvbCA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZT8uZ2V0Q29udHJvbCgpO1xuXG5cdFx0aWYgKGVkaXRvckNvbnRyb2wgJiYgaXNSZXBsRWRpdG9yQ29udHJvbChlZGl0b3JDb250cm9sKSAmJiBlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yKSB7XG5cdFx0XHRlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJDb2xvcignaW50ZXJhY3RpdmUuYWN0aXZlQ29kZUJvcmRlcicsIHtcblx0ZGFyazogaWZEZWZpbmVkVGhlbkVsc2UocGVla1ZpZXdCb3JkZXIsIHBlZWtWaWV3Qm9yZGVyLCAnIzAwN2FjYycpLFxuXHRsaWdodDogaWZEZWZpbmVkVGhlbkVsc2UocGVla1ZpZXdCb3JkZXIsIHBlZWtWaWV3Qm9yZGVyLCAnIzAwN2FjYycpLFxuXHRoY0Rhcms6IGNvbnRyYXN0Qm9yZGVyLFxuXHRoY0xpZ2h0OiBjb250cmFzdEJvcmRlclxufSwgbG9jYWxpemUoJ2ludGVyYWN0aXZlLmFjdGl2ZUNvZGVCb3JkZXInLCAnVGhlIGJvcmRlciBjb2xvciBmb3IgdGhlIGN1cnJlbnQgaW50ZXJhY3RpdmUgY29kZSBjZWxsIHdoZW4gdGhlIGVkaXRvciBoYXMgZm9jdXMuJykpO1xuXG5yZWdpc3RlckNvbG9yKCdpbnRlcmFjdGl2ZS5pbmFjdGl2ZUNvZGVCb3JkZXInLCB7XG5cdC8vZGFyazogdGhlbWUuZ2V0Q29sb3IobGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCkgPz8gdHJhbnNwYXJlbnQobGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCwgMSksXG5cdGRhcms6IGlmRGVmaW5lZFRoZW5FbHNlKGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQsIGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQsICcjMzczNzNEJyksXG5cdGxpZ2h0OiBpZkRlZmluZWRUaGVuRWxzZShsaXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kLCBsaXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kLCAnI0U0RTZGMScpLFxuXHRoY0Rhcms6IFBBTkVMX0JPUkRFUixcblx0aGNMaWdodDogUEFORUxfQk9SREVSXG59LCBsb2NhbGl6ZSgnaW50ZXJhY3RpdmUuaW5hY3RpdmVDb2RlQm9yZGVyJywgJ1RoZSBib3JkZXIgY29sb3IgZm9yIHRoZSBjdXJyZW50IGludGVyYWN0aXZlIGNvZGUgY2VsbCB3aGVuIHRoZSBlZGl0b3IgZG9lcyBub3QgaGF2ZSBmb2N1cy4nKSk7XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdGlkOiAnaW50ZXJhY3RpdmVXaW5kb3cnLFxuXHRvcmRlcjogMTAwLFxuXHR0eXBlOiAnb2JqZWN0Jyxcblx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0W1JlcGxFZGl0b3JTZXR0aW5ncy5pbnRlcmFjdGl2ZVdpbmRvd0Fsd2F5c1Njcm9sbE9uTmV3Q2VsbF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaW50ZXJhY3RpdmVXaW5kb3cuYWx3YXlzU2Nyb2xsT25OZXdDZWxsJywgXCJBdXRvbWF0aWNhbGx5IHNjcm9sbCB0aGUgaW50ZXJhY3RpdmUgd2luZG93IHRvIHNob3cgdGhlIG91dHB1dCBvZiB0aGUgbGFzdCBzdGF0ZW1lbnQgZXhlY3V0ZWQuIElmIHRoaXMgdmFsdWUgaXMgZmFsc2UsIHRoZSB3aW5kb3cgd2lsbCBvbmx5IHNjcm9sbCBpZiB0aGUgbGFzdCBjZWxsIHdhcyBhbHJlYWR5IHRoZSBvbmUgc2Nyb2xsZWQgdG8uXCIpXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLkludGVyYWN0aXZlV2luZG93UHJvbXB0VG9TYXZlXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaW50ZXJhY3RpdmVXaW5kb3cucHJvbXB0VG9TYXZlT25DbG9zZScsIFwiUHJvbXB0IHRvIHNhdmUgdGhlIGludGVyYWN0aXZlIHdpbmRvdyB3aGVuIGl0IGlzIGNsb3NlZC4gT25seSBuZXcgaW50ZXJhY3RpdmUgd2luZG93cyB3aWxsIGJlIGFmZmVjdGVkIGJ5IHRoaXMgc2V0dGluZyBjaGFuZ2UuXCIpXG5cdFx0fSxcblx0XHRbUmVwbEVkaXRvclNldHRpbmdzLmV4ZWN1dGVXaXRoU2hpZnRFbnRlcl06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ludGVyYWN0aXZlV2luZG93LmV4ZWN1dGVXaXRoU2hpZnRFbnRlcicsIFwiRXhlY3V0ZSB0aGUgSW50ZXJhY3RpdmUgV2luZG93IChSRVBMKSBpbnB1dCBib3ggd2l0aCBzaGlmdCtlbnRlciwgc28gdGhhdCBlbnRlciBjYW4gYmUgdXNlZCB0byBjcmVhdGUgYSBuZXdsaW5lLlwiKSxcblx0XHRcdHRhZ3M6IFsncmVwbEV4ZWN1dGUnXVxuXHRcdH0sXG5cdFx0W1JlcGxFZGl0b3JTZXR0aW5ncy5zaG93RXhlY3V0aW9uSGludF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaW50ZXJhY3RpdmVXaW5kb3cuc2hvd0V4ZWN1dGlvbkhpbnQnLCBcIkRpc3BsYXkgYSBoaW50IGluIHRoZSBJbnRlcmFjdGl2ZSBXaW5kb3cgKFJFUEwpIGlucHV0IGJveCB0byBpbmRpY2F0ZSBob3cgdG8gZXhlY3V0ZSBjb2RlLlwiKSxcblx0XHRcdHRhZ3M6IFsncmVw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d0IsT0FBTyxDQUFDO0FBQUEsSUFDekYsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUEyQztBQUNwRCxVQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUNqRCxVQUFNLGdCQUFnQixjQUFjLGtCQUFrQixXQUFXO0FBRWpFLFFBQUksaUJBQWlCLG9CQUFvQixhQUFhLEtBQUssY0FBYyxnQkFBZ0I7QUFDeEYsb0JBQWMsZUFBZSxNQUFNO0FBQUEsSUFDcEM7QUFBQSxFQUNEO0FBQ0QsQ0FBQztBQUVELGNBQWMsZ0NBQWdDO0FBQUEsRUFDN0MsTUFBTSxrQkFBa0IsZ0JBQWdCLGdCQUFnQixTQUFTO0FBQUEsRUFDakUsT0FBTyxrQkFBa0IsZ0JBQWdCLGdCQUFnQixTQUFTO0FBQUEsRUFDbEUsUUFBUTtBQUFBLEVBQ1IsU0FBUztBQUNWLEdBQUcsU0FBUyxnQ0FBZ0MsbUZBQW1GLENBQUM7QUFFaEksY0FBYyxrQ0FBa0M7QUFBQTtBQUFBLEVBRS9DLE1BQU0sa0JBQWtCLGlDQUFpQyxpQ0FBaUMsU0FBUztBQUFBLEVBQ25HLE9BQU8sa0JBQWtCLGlDQUFpQyxpQ0FBaUMsU0FBUztBQUFBLEVBQ3BHLFFBQVE7QUFBQSxFQUNSLFNBQVM7QUFDVixHQUFHLFNBQVMsa0NBQWtDLDZGQUE2RixDQUFDO0FBRTVJLFNBQVMsR0FBMkIsd0JBQXdCLGFBQWEsRUFBRSxzQkFBc0I7QUFBQSxFQUNoRyxJQUFJO0FBQUEsRUFDSixPQUFPO0FBQUEsRUFDUCxNQUFNO0FBQUEsRUFDTixjQUFjO0FBQUEsSUFDYixDQUFDLG1CQUFtQixzQ0FBc0MsR0FBRztBQUFBLE1BQzVELE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULHFCQUFxQixTQUFTLDJDQUEyQyxzTUFBc007QUFBQSxJQUNoUjtBQUFBLElBQ0EsQ0FBQyxnQkFBZ0IsNkJBQTZCLEdBQUc7QUFBQSxNQUNoRCxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxxQkFBcUIsU0FBUyx5Q0FBeUMsZ0lBQWdJO0FBQUEsSUFDeE07QUFBQSxJQUNBLENBQUMsbUJBQW1CLHFCQUFxQixHQUFHO0FBQUEsTUFDM0MsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QscUJBQXFCLFNBQVMsMkNBQTJDLGtIQUFrSDtBQUFBLE1BQzNMLE1BQU0sQ0FBQyxhQUFhO0FBQUEsSUFDckI7QUFBQSxJQUNBLENBQUMsbUJBQW1CLGlCQUFpQixHQUFHO0FBQUEsTUFDdkMsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QscUJBQXFCLFNBQVMsdUNBQXVDLDRGQUE0RjtBQUFBLE1BQ2pLLE1BQU0sQ0FBQyxhQUFhO0FBQUEsSUFDckI7QUFBQSxFQUNEO0FBQ0QsQ0FBQzsiLAogICJuYW1lcyI6IFsiaWQiLCAiZWRpdG9ySW5wdXQiLCAiZWRpdG9yQ29udHJvbCJdCn0K
