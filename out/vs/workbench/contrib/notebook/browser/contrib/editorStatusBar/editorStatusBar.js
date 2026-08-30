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
import * as nls from "../../../../../../nls.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { ILanguageFeaturesService } from "../../../../../../editor/common/services/languageFeatures.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../../../common/contributions.js";
import { CENTER_ACTIVE_CELL } from "../navigation/arrow.js";
import { SELECT_KERNEL_ID } from "../../controller/coreActions.js";
import { SELECT_NOTEBOOK_INDENTATION_ID } from "../../controller/editActions.js";
import { getNotebookEditorFromEditorPane } from "../../notebookBrowser.js";
import { NotebookCellsChangeType } from "../../../common/notebookCommon.js";
import { INotebookKernelService } from "../../../common/notebookKernelService.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { IStatusbarService, StatusbarAlignment } from "../../../../../services/statusbar/browser/statusbar.js";
import { IEditorGroupsService } from "../../../../../services/editor/common/editorGroupsService.js";
import { Event } from "../../../../../../base/common/event.js";
let ImplictKernelSelector = class {
  constructor(notebook, suggested, notebookKernelService, languageFeaturesService, logService) {
    const disposables = new DisposableStore();
    this.dispose = disposables.dispose.bind(disposables);
    const selectKernel = () => {
      disposables.clear();
      notebookKernelService.selectKernelForNotebook(suggested, notebook);
    };
    disposables.add(notebook.onDidChangeContent((e) => {
      for (const event of e.rawEvents) {
        switch (event.kind) {
          case NotebookCellsChangeType.ChangeCellContent:
          case NotebookCellsChangeType.ModelChange:
          case NotebookCellsChangeType.Move:
          case NotebookCellsChangeType.ChangeCellLanguage:
            logService.trace("IMPLICIT kernel selection because of change event", event.kind);
            selectKernel();
            break;
        }
      }
    }));
    disposables.add(languageFeaturesService.hoverProvider.register({ scheme: Schemas.vscodeNotebookCell, pattern: notebook.uri.path }, {
      provideHover() {
        logService.trace("IMPLICIT kernel selection because of hover");
        selectKernel();
        return void 0;
      }
    }));
  }
};
ImplictKernelSelector = __decorateClass([
  __decorateParam(2, INotebookKernelService),
  __decorateParam(3, ILanguageFeaturesService),
  __decorateParam(4, ILogService)
], ImplictKernelSelector);
let KernelStatus = class extends Disposable {
  constructor(_editorService, _statusbarService, _notebookKernelService, _instantiationService) {
    super();
    this._editorService = _editorService;
    this._statusbarService = _statusbarService;
    this._notebookKernelService = _notebookKernelService;
    this._instantiationService = _instantiationService;
    this._editorDisposables = this._register(new DisposableStore());
    this._kernelInfoElement = this._register(new DisposableStore());
    this._register(this._editorService.onDidActiveEditorChange(() => this._updateStatusbar()));
    this._updateStatusbar();
  }
  _updateStatusbar() {
    this._editorDisposables.clear();
    const activeEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
    if (!activeEditor) {
      this._kernelInfoElement.clear();
      return;
    }
    const updateStatus = () => {
      if (activeEditor.notebookOptions.getDisplayOptions().globalToolbar) {
        this._kernelInfoElement.clear();
        return;
      }
      const notebook = activeEditor.textModel;
      if (notebook) {
        this._showKernelStatus(notebook);
      } else {
        this._kernelInfoElement.clear();
      }
    };
    this._editorDisposables.add(this._notebookKernelService.onDidAddKernel(updateStatus));
    this._editorDisposables.add(this._notebookKernelService.onDidChangeSelectedNotebooks(updateStatus));
    this._editorDisposables.add(this._notebookKernelService.onDidChangeNotebookAffinity(updateStatus));
    this._editorDisposables.add(activeEditor.onDidChangeModel(updateStatus));
    this._editorDisposables.add(activeEditor.notebookOptions.onDidChangeOptions(updateStatus));
    updateStatus();
  }
  _showKernelStatus(notebook) {
    this._kernelInfoElement.clear();
    const { selected, suggestions, all } = this._notebookKernelService.getMatchingKernel(notebook);
    const suggested = (suggestions.length === 1 ? suggestions[0] : void 0) ?? all.length === 1 ? all[0] : void 0;
    let isSuggested = false;
    if (all.length === 0) {
      return;
    } else if (selected || suggested) {
      let kernel = selected;
      if (!kernel) {
        kernel = suggested;
        isSuggested = true;
        this._kernelInfoElement.add(this._instantiationService.createInstance(ImplictKernelSelector, notebook, kernel));
      }
      const tooltip = kernel.description ?? kernel.detail ?? kernel.label;
      this._kernelInfoElement.add(this._statusbarService.addEntry(
        {
          name: nls.localize("notebook.info", "Notebook Kernel Info"),
          text: `$(notebook-kernel-select) ${kernel.label}`,
          ariaLabel: kernel.label,
          tooltip: isSuggested ? nls.localize("tooltop", "{0} (suggestion)", tooltip) : tooltip,
          command: SELECT_KERNEL_ID
        },
        SELECT_KERNEL_ID,
        StatusbarAlignment.RIGHT,
        10
      ));
      this._kernelInfoElement.add(kernel.onDidChange(() => this._showKernelStatus(notebook)));
    } else {
      this._kernelInfoElement.add(this._statusbarService.addEntry(
        {
          name: nls.localize("notebook.select", "Notebook Kernel Selection"),
          text: nls.localize("kernel.select.label", "Select Kernel"),
          ariaLabel: nls.localize("kernel.select.label", "Select Kernel"),
          command: SELECT_KERNEL_ID,
          kind: "prominent"
        },
        SELECT_KERNEL_ID,
        StatusbarAlignment.RIGHT,
        10
      ));
    }
  }
};
KernelStatus = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IStatusbarService),
  __decorateParam(2, INotebookKernelService),
  __decorateParam(3, IInstantiationService)
], KernelStatus);
let ActiveCellStatus = class extends Disposable {
  constructor(_editorService, _statusbarService) {
    super();
    this._editorService = _editorService;
    this._statusbarService = _statusbarService;
    this._itemDisposables = this._register(new DisposableStore());
    this._accessor = this._register(new MutableDisposable());
    this._register(this._editorService.onDidActiveEditorChange(() => this._update()));
    this._update();
  }
  _update() {
    this._itemDisposables.clear();
    const activeEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
    if (activeEditor) {
      this._itemDisposables.add(activeEditor.onDidChangeSelection(() => this._show(activeEditor)));
      this._itemDisposables.add(activeEditor.onDidChangeActiveCell(() => this._show(activeEditor)));
      this._show(activeEditor);
    } else {
      this._accessor.clear();
    }
  }
  _show(editor) {
    if (!editor.hasModel()) {
      this._accessor.clear();
      return;
    }
    const newText = this._getSelectionsText(editor);
    if (!newText) {
      this._accessor.clear();
      return;
    }
    const entry = {
      name: nls.localize("notebook.activeCellStatusName", "Notebook Editor Selections"),
      text: newText,
      ariaLabel: newText,
      command: CENTER_ACTIVE_CELL
    };
    if (!this._accessor.value) {
      this._accessor.value = this._statusbarService.addEntry(
        entry,
        "notebook.activeCellStatus",
        StatusbarAlignment.RIGHT,
        100
      );
    } else {
      this._accessor.value.update(entry);
    }
  }
  _getSelectionsText(editor) {
    if (!editor.hasModel()) {
      return void 0;
    }
    const activeCell = editor.getActiveCell();
    if (!activeCell) {
      return void 0;
    }
    const idxFocused = editor.getCellIndex(activeCell) + 1;
    const numSelected = editor.getSelections().reduce((prev, range) => prev + (range.end - range.start), 0);
    const totalCells = editor.getLength();
    return numSelected > 1 ? nls.localize("notebook.multiActiveCellIndicator", "Cell {0} ({1} selected)", idxFocused, numSelected) : nls.localize("notebook.singleActiveCellIndicator", "Cell {0} of {1}", idxFocused, totalCells);
  }
};
ActiveCellStatus = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IStatusbarService)
], ActiveCellStatus);
let NotebookIndentationStatus = class extends Disposable {
  constructor(_editorService, _statusbarService, _configurationService) {
    super();
    this._editorService = _editorService;
    this._statusbarService = _statusbarService;
    this._configurationService = _configurationService;
    this._itemDisposables = this._register(new DisposableStore());
    this._accessor = this._register(new MutableDisposable());
    this._register(this._editorService.onDidActiveEditorChange(() => this._update()));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor") || e.affectsConfiguration("notebook")) {
        this._update();
      }
    }));
    this._update();
  }
  _update() {
    this._itemDisposables.clear();
    const activeEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
    if (activeEditor) {
      this._show(activeEditor);
      this._itemDisposables.add(activeEditor.onDidChangeSelection(() => {
        this._accessor.clear();
        this._show(activeEditor);
      }));
    } else {
      this._accessor.clear();
    }
  }
  _show(editor) {
    if (!editor.hasModel()) {
      this._accessor.clear();
      return;
    }
    const cellOptions = editor.getActiveCell()?.textModel?.getOptions();
    if (!cellOptions) {
      this._accessor.clear();
      return;
    }
    const cellEditorOverridesRaw = editor.notebookOptions.getDisplayOptions().editorOptionsCustomizations;
    const indentSize = cellEditorOverridesRaw?.["editor.indentSize"] ?? cellOptions?.indentSize;
    const insertSpaces = cellEditorOverridesRaw?.["editor.insertSpaces"] ?? cellOptions?.insertSpaces;
    const tabSize = cellEditorOverridesRaw?.["editor.tabSize"] ?? cellOptions?.tabSize;
    const width = typeof indentSize === "number" ? indentSize : tabSize;
    const message = insertSpaces ? `Spaces: ${width}` : `Tab Size: ${width}`;
    const newText = message;
    if (!newText) {
      this._accessor.clear();
      return;
    }
    const entry = {
      name: nls.localize("notebook.indentation", "Notebook Indentation"),
      text: newText,
      ariaLabel: newText,
      tooltip: nls.localize("selectNotebookIndentation", "Select Indentation"),
      command: SELECT_NOTEBOOK_INDENTATION_ID
    };
    if (!this._accessor.value) {
      this._accessor.value = this._statusbarService.addEntry(
        entry,
        "notebook.status.indentation",
        StatusbarAlignment.RIGHT,
        100.4
      );
    } else {
      this._accessor.value.update(entry);
    }
  }
};
NotebookIndentationStatus.ID = "selectNotebookIndentation";
NotebookIndentationStatus = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IStatusbarService),
  __decorateParam(2, IConfigurationService)
], NotebookIndentationStatus);
let NotebookEditorStatusContribution = class extends Disposable {
  constructor(editorGroupService) {
    super();
    this.editorGroupService = editorGroupService;
    for (const part of editorGroupService.parts) {
      this.createNotebookStatus(part);
    }
    this._register(editorGroupService.onDidCreateAuxiliaryEditorPart((part) => this.createNotebookStatus(part)));
  }
  createNotebookStatus(part) {
    const disposables = new DisposableStore();
    Event.once(part.onWillDispose)(() => disposables.dispose());
    const scopedInstantiationService = this.editorGroupService.getScopedInstantiationService(part);
    disposables.add(scopedInstantiationService.createInstance(KernelStatus));
    disposables.add(scopedInstantiationService.createInstance(ActiveCellStatus));
    disposables.add(scopedInstantiationService.createInstance(NotebookIndentationStatus));
  }
};
NotebookEditorStatusContribution.ID = "notebook.contrib.editorStatus";
NotebookEditorStatusContribution = __decorateClass([
  __decorateParam(0, IEditorGroupsService)
], NotebookEditorStatusContribution);
registerWorkbenchContribution2(NotebookEditorStatusContribution.ID, NotebookEditorStatusContribution, WorkbenchPhase.AfterRestored);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cmliXFxlZGl0b3JTdGF0dXNCYXJcXGVkaXRvclN0YXR1c0Jhci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBDRU5URVJfQUNUSVZFX0NFTEwgfSBmcm9tICcuLi9uYXZpZ2F0aW9uL2Fycm93LmpzJztcbmltcG9ydCB7IFNFTEVDVF9LRVJORUxfSUQgfSBmcm9tICcuLi8uLi9jb250cm9sbGVyL2NvcmVBY3Rpb25zLmpzJztcbmltcG9ydCB7IFNFTEVDVF9OT1RFQk9PS19JTkRFTlRBVElPTl9JRCB9IGZyb20gJy4uLy4uL2NvbnRyb2xsZXIvZWRpdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRWRpdG9yLCBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IE5vdGVib29rVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL25vdGVib29rVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0tlcm5lbCwgSU5vdGVib29rS2VybmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0tlcm5lbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVN0YXR1c2JhckVudHJ5LCBJU3RhdHVzYmFyRW50cnlBY2Nlc3NvciwgSVN0YXR1c2JhclNlcnZpY2UsIFN0YXR1c2JhckFsaWdubWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3N0YXR1c2Jhci9icm93c2VyL3N0YXR1c2Jhci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSwgSUVkaXRvclBhcnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5cbmNsYXNzIEltcGxpY3RLZXJuZWxTZWxlY3RvciBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRyZWFkb25seSBkaXNwb3NlOiAoKSA9PiB2b2lkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG5vdGVib29rOiBOb3RlYm9va1RleHRNb2RlbCxcblx0XHRzdWdnZXN0ZWQ6IElOb3RlYm9va0tlcm5lbCxcblx0XHRASU5vdGVib29rS2VybmVsU2VydmljZSBub3RlYm9va0tlcm5lbFNlcnZpY2U6IElOb3RlYm9va0tlcm5lbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLmRpc3Bvc2UgPSBkaXNwb3NhYmxlcy5kaXNwb3NlLmJpbmQoZGlzcG9zYWJsZXMpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0S2VybmVsID0gKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdG5vdGVib29rS2VybmVsU2VydmljZS5zZWxlY3RLZXJuZWxGb3JOb3RlYm9vayhzdWdnZXN0ZWQsIG5vdGVib29rKTtcblx0XHR9O1xuXG5cdFx0Ly8gSU1QTElDSVRMWSBzZWxlY3QgYSBzdWdnZXN0ZWQga2VybmVsIHdoZW4gdGhlIG5vdGVib29rIGhhcyBiZWVuIGNoYW5nZWRcblx0XHQvLyBlLmcgY2hhbmdlIGNlbGwgc291cmNlLCBtb3ZlIGNlbGxzLCBldGNcblx0XHRkaXNwb3NhYmxlcy5hZGQobm90ZWJvb2sub25EaWRDaGFuZ2VDb250ZW50KGUgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBldmVudCBvZiBlLnJhd0V2ZW50cykge1xuXHRcdFx0XHRzd2l0Y2ggKGV2ZW50LmtpbmQpIHtcblx0XHRcdFx0XHRjYXNlIE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkNoYW5nZUNlbGxDb250ZW50OlxuXHRcdFx0XHRcdGNhc2UgTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW9kZWxDaGFuZ2U6XG5cdFx0XHRcdFx0Y2FzZSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Nb3ZlOlxuXHRcdFx0XHRcdGNhc2UgTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlQ2VsbExhbmd1YWdlOlxuXHRcdFx0XHRcdFx0bG9nU2VydmljZS50cmFjZSgnSU1QTElDSVQga2VybmVsIHNlbGVjdGlvbiBiZWNhdXNlIG9mIGNoYW5nZSBldmVudCcsIGV2ZW50LmtpbmQpO1xuXHRcdFx0XHRcdFx0c2VsZWN0S2VybmVsKCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXG5cdFx0Ly8gSU1QTElDSVRMWSBzZWxlY3QgYSBzdWdnZXN0ZWQga2VybmVsIHdoZW4gdXNlcnMgc3RhcnQgdG8gaG92ZXIuIFRoaXMgc2hvdWxkXG5cdFx0Ly8gYmUgYSBzdHJvbmcgZW5vdWdoIGhpbnQgdGhhdCB0aGUgdXNlciB3YW50cyB0byBpbnRlcmFjdCB3aXRoIHRoZSBub3RlYm9vay4gTWF5YmVcblx0XHQvLyBhZGQgbW9yZSB0cmlnZ2VycyBsaWtlIGdvdG8tcHJvdmlkZXJzIG9yIGNvbXBsZXRpb24tcHJvdmlkZXJzXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmhvdmVyUHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsLCBwYXR0ZXJuOiBub3RlYm9vay51cmkucGF0aCB9LCB7XG5cdFx0XHRwcm92aWRlSG92ZXIoKSB7XG5cdFx0XHRcdGxvZ1NlcnZpY2UudHJhY2UoJ0lNUExJQ0lUIGtlcm5lbCBzZWxlY3Rpb24gYmVjYXVzZSBvZiBob3ZlcicpO1xuXHRcdFx0XHRzZWxlY3RLZXJuZWwoKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cbn1cblxuY2xhc3MgS2VybmVsU3RhdHVzIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfa2VybmVsSW5mb0VsZW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVN0YXR1c2JhclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RhdHVzYmFyU2VydmljZTogSVN0YXR1c2JhclNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0tlcm5lbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tLZXJuZWxTZXJ2aWNlOiBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKCgpID0+IHRoaXMuX3VwZGF0ZVN0YXR1c2JhcigpKSk7XG5cdFx0dGhpcy5fdXBkYXRlU3RhdHVzYmFyKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVTdGF0dXNiYXIoKSB7XG5cdFx0dGhpcy5fZWRpdG9yRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUodGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lKTtcblx0XHRpZiAoIWFjdGl2ZUVkaXRvcikge1xuXHRcdFx0Ly8gbm90IGEgbm90ZWJvb2sgLT4gY2xlYW4tdXAsIGRvbmVcblx0XHRcdHRoaXMuX2tlcm5lbEluZm9FbGVtZW50LmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXBkYXRlU3RhdHVzID0gKCkgPT4ge1xuXHRcdFx0aWYgKGFjdGl2ZUVkaXRvci5ub3RlYm9va09wdGlvbnMuZ2V0RGlzcGxheU9wdGlvbnMoKS5nbG9iYWxUb29sYmFyKSB7XG5cdFx0XHRcdC8vIGtlcm5lbCBpbmZvIHJlbmRlcmVkIGluIHRoZSBub3RlYm9vayB0b29sYmFyIGFscmVhZHlcblx0XHRcdFx0dGhpcy5fa2VybmVsSW5mb0VsZW1lbnQuY2xlYXIoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBub3RlYm9vayA9IGFjdGl2ZUVkaXRvci50ZXh0TW9kZWw7XG5cdFx0XHRpZiAobm90ZWJvb2spIHtcblx0XHRcdFx0dGhpcy5fc2hvd0tlcm5lbFN0YXR1cyhub3RlYm9vayk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9rZXJuZWxJbmZvRWxlbWVudC5jbGVhcigpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0aGlzLl9lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLm9uRGlkQWRkS2VybmVsKHVwZGF0ZVN0YXR1cykpO1xuXHRcdHRoaXMuX2VkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2Uub25EaWRDaGFuZ2VTZWxlY3RlZE5vdGVib29rcyh1cGRhdGVTdGF0dXMpKTtcblx0XHR0aGlzLl9lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLm9uRGlkQ2hhbmdlTm90ZWJvb2tBZmZpbml0eSh1cGRhdGVTdGF0dXMpKTtcblx0XHR0aGlzLl9lZGl0b3JEaXNwb3NhYmxlcy5hZGQoYWN0aXZlRWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwodXBkYXRlU3RhdHVzKSk7XG5cdFx0dGhpcy5fZWRpdG9yRGlzcG9zYWJsZXMuYWRkKGFjdGl2ZUVkaXRvci5ub3RlYm9va09wdGlvbnMub25EaWRDaGFuZ2VPcHRpb25zKHVwZGF0ZVN0YXR1cykpO1xuXHRcdHVwZGF0ZVN0YXR1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0tlcm5lbFN0YXR1cyhub3RlYm9vazogTm90ZWJvb2tUZXh0TW9kZWwpIHtcblxuXHRcdHRoaXMuX2tlcm5lbEluZm9FbGVtZW50LmNsZWFyKCk7XG5cblx0XHRjb25zdCB7IHNlbGVjdGVkLCBzdWdnZXN0aW9ucywgYWxsIH0gPSB0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2UuZ2V0TWF0Y2hpbmdLZXJuZWwobm90ZWJvb2spO1xuXHRcdGNvbnN0IHN1Z2dlc3RlZCA9IChzdWdnZXN0aW9ucy5sZW5ndGggPT09IDEgPyBzdWdnZXN0aW9uc1swXSA6IHVuZGVmaW5lZClcblx0XHRcdD8/IChhbGwubGVuZ3RoID09PSAxKSA/IGFsbFswXSA6IHVuZGVmaW5lZDtcblx0XHRsZXQgaXNTdWdnZXN0ZWQgPSBmYWxzZTtcblxuXHRcdGlmIChhbGwubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBubyBrZXJuZWwgLT4gbm8gc3RhdHVzXG5cdFx0XHRyZXR1cm47XG5cblx0XHR9IGVsc2UgaWYgKHNlbGVjdGVkIHx8IHN1Z2dlc3RlZCkge1xuXHRcdFx0Ly8gc2VsZWN0ZWQgb3Igc2luZ2xlIGtlcm5lbFxuXHRcdFx0bGV0IGtlcm5lbCA9IHNlbGVjdGVkO1xuXG5cdFx0XHRpZiAoIWtlcm5lbCkge1xuXHRcdFx0XHQvLyBwcm9jZWVkIHdpdGggc3VnZ2VzdGVkIGtlcm5lbCAtIHNob3cgVUkgYW5kIGluc3RhbGwgaGFuZGxlciB0aGF0IHNlbGVjdHMgdGhlIGtlcm5lbFxuXHRcdFx0XHQvLyB3aGVuIG5vbiB0cml2aWFsIGludGVyYWN0aW9ucyB3aXRoIHRoZSBub3RlYm9vayBoYXBwZW4uXG5cdFx0XHRcdGtlcm5lbCA9IHN1Z2dlc3RlZCE7XG5cdFx0XHRcdGlzU3VnZ2VzdGVkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fa2VybmVsSW5mb0VsZW1lbnQuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEltcGxpY3RLZXJuZWxTZWxlY3Rvciwgbm90ZWJvb2ssIGtlcm5lbCkpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdG9vbHRpcCA9IGtlcm5lbC5kZXNjcmlwdGlvbiA/PyBrZXJuZWwuZGV0YWlsID8/IGtlcm5lbC5sYWJlbDtcblx0XHRcdHRoaXMuX2tlcm5lbEluZm9FbGVtZW50LmFkZCh0aGlzLl9zdGF0dXNiYXJTZXJ2aWNlLmFkZEVudHJ5KFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogbmxzLmxvY2FsaXplKCdub3RlYm9vay5pbmZvJywgXCJOb3RlYm9vayBLZXJuZWwgSW5mb1wiKSxcblx0XHRcdFx0XHR0ZXh0OiBgJChub3RlYm9vay1rZXJuZWwtc2VsZWN0KSAke2tlcm5lbC5sYWJlbH1gLFxuXHRcdFx0XHRcdGFyaWFMYWJlbDoga2VybmVsLmxhYmVsLFxuXHRcdFx0XHRcdHRvb2x0aXA6IGlzU3VnZ2VzdGVkID8gbmxzLmxvY2FsaXplKCd0b29sdG9wJywgXCJ7MH0gKHN1Z2dlc3Rpb24pXCIsIHRvb2x0aXApIDogdG9vbHRpcCxcblx0XHRcdFx0XHRjb21tYW5kOiBTRUxFQ1RfS0VSTkVMX0lELFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRTRUxFQ1RfS0VSTkVMX0lELFxuXHRcdFx0XHRTdGF0dXNiYXJBbGlnbm1lbnQuUklHSFQsXG5cdFx0XHRcdDEwXG5cdFx0XHQpKTtcblxuXHRcdFx0dGhpcy5fa2VybmVsSW5mb0VsZW1lbnQuYWRkKGtlcm5lbC5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLl9zaG93S2VybmVsU3RhdHVzKG5vdGVib29rKSkpO1xuXG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gbXVsdGlwbGUga2VybmVscyAtPiBzaG93IHNlbGVjdGlvbiBoaW50XG5cdFx0XHR0aGlzLl9rZXJuZWxJbmZvRWxlbWVudC5hZGQodGhpcy5fc3RhdHVzYmFyU2VydmljZS5hZGRFbnRyeShcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suc2VsZWN0JywgXCJOb3RlYm9vayBLZXJuZWwgU2VsZWN0aW9uXCIpLFxuXHRcdFx0XHRcdHRleHQ6IG5scy5sb2NhbGl6ZSgna2VybmVsLnNlbGVjdC5sYWJlbCcsIFwiU2VsZWN0IEtlcm5lbFwiKSxcblx0XHRcdFx0XHRhcmlhTGFiZWw6IG5scy5sb2NhbGl6ZSgna2VybmVsLnNlbGVjdC5sYWJlbCcsIFwiU2VsZWN0IEtlcm5lbFwiKSxcblx0XHRcdFx0XHRjb21tYW5kOiBTRUxFQ1RfS0VSTkVMX0lELFxuXHRcdFx0XHRcdGtpbmQ6ICdwcm9taW5lbnQnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdFNFTEVDVF9LRVJORUxfSUQsXG5cdFx0XHRcdFN0YXR1c2JhckFsaWdubWVudC5SSUdIVCxcblx0XHRcdFx0MTBcblx0XHRcdCkpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBBY3RpdmVDZWxsU3RhdHVzIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2l0ZW1EaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc29yID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yPigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElTdGF0dXNiYXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0YXR1c2JhclNlcnZpY2U6IElTdGF0dXNiYXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKCkgPT4gdGhpcy5fdXBkYXRlKCkpKTtcblx0XHR0aGlzLl91cGRhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZSgpIHtcblx0XHR0aGlzLl9pdGVtRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKHRoaXMuX2VkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk7XG5cdFx0aWYgKGFjdGl2ZUVkaXRvcikge1xuXHRcdFx0dGhpcy5faXRlbURpc3Bvc2FibGVzLmFkZChhY3RpdmVFZGl0b3Iub25EaWRDaGFuZ2VTZWxlY3Rpb24oKCkgPT4gdGhpcy5fc2hvdyhhY3RpdmVFZGl0b3IpKSk7XG5cdFx0XHR0aGlzLl9pdGVtRGlzcG9zYWJsZXMuYWRkKGFjdGl2ZUVkaXRvci5vbkRpZENoYW5nZUFjdGl2ZUNlbGwoKCkgPT4gdGhpcy5fc2hvdyhhY3RpdmVFZGl0b3IpKSk7XG5cdFx0XHR0aGlzLl9zaG93KGFjdGl2ZUVkaXRvcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2FjY2Vzc29yLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2hvdyhlZGl0b3I6IElOb3RlYm9va0VkaXRvcikge1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHRoaXMuX2FjY2Vzc29yLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3VGV4dCA9IHRoaXMuX2dldFNlbGVjdGlvbnNUZXh0KGVkaXRvcik7XG5cdFx0aWYgKCFuZXdUZXh0KSB7XG5cdFx0XHR0aGlzLl9hY2Nlc3Nvci5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVudHJ5OiBJU3RhdHVzYmFyRW50cnkgPSB7XG5cdFx0XHRuYW1lOiBubHMubG9jYWxpemUoJ25vdGVib29rLmFjdGl2ZUNlbGxTdGF0dXNOYW1lJywgXCJOb3RlYm9vayBFZGl0b3IgU2VsZWN0aW9uc1wiKSxcblx0XHRcdHRleHQ6IG5ld1RleHQsXG5cdFx0XHRhcmlhTGFiZWw6IG5ld1RleHQsXG5cdFx0XHRjb21tYW5kOiBDRU5URVJfQUNUSVZFX0NFTExcblx0XHR9O1xuXHRcdGlmICghdGhpcy5fYWNjZXNzb3IudmFsdWUpIHtcblx0XHRcdHRoaXMuX2FjY2Vzc29yLnZhbHVlID0gdGhpcy5fc3RhdHVzYmFyU2VydmljZS5hZGRFbnRyeShcblx0XHRcdFx0ZW50cnksXG5cdFx0XHRcdCdub3RlYm9vay5hY3RpdmVDZWxsU3RhdHVzJyxcblx0XHRcdFx0U3RhdHVzYmFyQWxpZ25tZW50LlJJR0hULFxuXHRcdFx0XHQxMDBcblx0XHRcdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2FjY2Vzc29yLnZhbHVlLnVwZGF0ZShlbnRyeSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U2VsZWN0aW9uc1RleHQoZWRpdG9yOiBJTm90ZWJvb2tFZGl0b3IpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aXZlQ2VsbCA9IGVkaXRvci5nZXRBY3RpdmVDZWxsKCk7XG5cdFx0aWYgKCFhY3RpdmVDZWxsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlkeEZvY3VzZWQgPSBlZGl0b3IuZ2V0Q2VsbEluZGV4KGFjdGl2ZUNlbGwpICsgMTtcblx0XHRjb25zdCBudW1TZWxlY3RlZCA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCkucmVkdWNlKChwcmV2LCByYW5nZSkgPT4gcHJldiArIChyYW5nZS5lbmQgLSByYW5nZS5zdGFydCksIDApO1xuXHRcdGNvbnN0IHRvdGFsQ2VsbHMgPSBlZGl0b3IuZ2V0TGVuZ3RoKCk7XG5cdFx0cmV0dXJuIG51bVNlbGVjdGVkID4gMSA/XG5cdFx0XHRubHMubG9jYWxpemUoJ25vdGVib29rLm11bHRpQWN0aXZlQ2VsbEluZGljYXRvcicsIFwiQ2VsbCB7MH0gKHsxfSBzZWxlY3RlZClcIiwgaWR4Rm9jdXNlZCwgbnVtU2VsZWN0ZWQpIDpcblx0XHRcdG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suc2luZ2xlQWN0aXZlQ2VsbEluZGljYXRvcicsIFwiQ2VsbCB7MH0gb2YgezF9XCIsIGlkeEZvY3VzZWQsIHRvdGFsQ2VsbHMpO1xuXHR9XG59XG5cbmNsYXNzIE5vdGVib29rSW5kZW50YXRpb25TdGF0dXMgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pdGVtRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJU3RhdHVzYmFyRW50cnlBY2Nlc3Nvcj4oKSk7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3NlbGVjdE5vdGVib29rSW5kZW50YXRpb24nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVN0YXR1c2JhclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RhdHVzYmFyU2VydmljZTogSVN0YXR1c2JhclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKCkgPT4gdGhpcy5fdXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yJykgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbignbm90ZWJvb2snKSkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fdXBkYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGUoKSB7XG5cdFx0dGhpcy5faXRlbURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZSh0aGlzLl9lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpO1xuXHRcdGlmIChhY3RpdmVFZGl0b3IpIHtcblx0XHRcdHRoaXMuX3Nob3coYWN0aXZlRWRpdG9yKTtcblx0XHRcdHRoaXMuX2l0ZW1EaXNwb3NhYmxlcy5hZGQoYWN0aXZlRWRpdG9yLm9uRGlkQ2hhbmdlU2VsZWN0aW9uKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fYWNjZXNzb3IuY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5fc2hvdyhhY3RpdmVFZGl0b3IpO1xuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9hY2Nlc3Nvci5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Nob3coZWRpdG9yOiBJTm90ZWJvb2tFZGl0b3IpIHtcblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHR0aGlzLl9hY2Nlc3Nvci5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNlbGxPcHRpb25zID0gZWRpdG9yLmdldEFjdGl2ZUNlbGwoKT8udGV4dE1vZGVsPy5nZXRPcHRpb25zKCk7XG5cdFx0aWYgKCFjZWxsT3B0aW9ucykge1xuXHRcdFx0dGhpcy5fYWNjZXNzb3IuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjZWxsRWRpdG9yT3ZlcnJpZGVzUmF3ID0gZWRpdG9yLm5vdGVib29rT3B0aW9ucy5nZXREaXNwbGF5T3B0aW9ucygpLmVkaXRvck9wdGlvbnNDdXN0b21pemF0aW9ucztcblx0XHRjb25zdCBpbmRlbnRTaXplID0gY2VsbEVkaXRvck92ZXJyaWRlc1Jhdz8uWydlZGl0b3IuaW5kZW50U2l6ZSddID8/IGNlbGxPcHRpb25zPy5pbmRlbnRTaXplO1xuXHRcdGNvbnN0IGluc2VydFNwYWNlcyA9IGNlbGxFZGl0b3JPdmVycmlkZXNSYXc/LlsnZWRpdG9yLmluc2VydFNwYWNlcyddID8/IGNlbGxPcHRpb25zPy5pbnNlcnRTcGFjZXM7XG5cdFx0Y29uc3QgdGFiU2l6ZSA9IGNlbGxFZGl0b3JPdmVycmlkZXNSYXc/LlsnZWRpdG9yLnRhYlNpemUnXSA/PyBjZWxsT3B0aW9ucz8udGFiU2l6ZTtcblxuXHRcdGNvbnN0IHdpZHRoID0gdHlwZW9mIGluZGVudFNpemUgPT09ICdudW1iZXInID8gaW5kZW50U2l6ZSA6IHRhYlNpemU7XG5cblx0XHRjb25zdCBtZXNzYWdlID0gaW5zZXJ0U3BhY2VzID8gYFNwYWNlczogJHt3aWR0aH1gIDogYFRhYiBTaXplOiAke3dpZHRofWA7XG5cdFx0Y29uc3QgbmV3VGV4dCA9IG1lc3NhZ2U7XG5cdFx0aWYgKCFuZXdUZXh0KSB7XG5cdFx0XHR0aGlzLl9hY2Nlc3Nvci5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVudHJ5OiBJU3RhdHVzYmFyRW50cnkgPSB7XG5cdFx0XHRuYW1lOiBubHMubG9jYWxpemUoJ25vdGVib29rLmluZGVudGF0aW9uJywgXCJOb3RlYm9vayBJbmRlbnRhdGlvblwiKSxcblx0XHRcdHRleHQ6IG5ld1RleHQsXG5cdFx0XHRhcmlhTGFiZWw6IG5ld1RleHQsXG5cdFx0XHR0b29sdGlwOiBubHMubG9jYWxpemUoJ3NlbGVjdE5vdGVib29rSW5kZW50YXRpb24nLCBcIlNlbGVjdCBJbmRlbnRhdGlvblwiKSxcblx0XHRcdGNvbW1hbmQ6IFNFTEVDVF9OT1RFQk9PS19JTkRFTlRBVElPTl9JRFxuXHRcdH07XG5cblx0XHRpZiAoIXRoaXMuX2FjY2Vzc29yLnZhbHVlKSB7XG5cdFx0XHR0aGlzLl9hY2Nlc3Nvci52YWx1ZSA9IHRoaXMuX3N0YXR1c2JhclNlcnZpY2UuYWRkRW50cnkoXG5cdFx0XHRcdGVudHJ5LFxuXHRcdFx0XHQnbm90ZWJvb2suc3RhdHVzLmluZGVudGF0aW9uJyxcblx0XHRcdFx0U3RhdHVzYmFyQWxpZ25tZW50LlJJR0hULFxuXHRcdFx0XHQxMDAuNFxuXHRcdFx0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fYWNjZXNzb3IudmFsdWUudXBkYXRlKGVudHJ5KTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgTm90ZWJvb2tFZGl0b3JTdGF0dXNDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ25vdGVib29rLmNvbnRyaWIuZWRpdG9yU3RhdHVzJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgZWRpdG9yR3JvdXBTZXJ2aWNlLnBhcnRzKSB7XG5cdFx0XHR0aGlzLmNyZWF0ZU5vdGVib29rU3RhdHVzKHBhcnQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvckdyb3VwU2VydmljZS5vbkRpZENyZWF0ZUF1eGlsaWFyeUVkaXRvclBhcnQocGFydCA9PiB0aGlzLmNyZWF0ZU5vdGVib29rU3RhdHVzKHBhcnQpKSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU5vdGVib29rU3RhdHVzKHBhcnQ6IElFZGl0b3JQYXJ0KTogdm9pZCB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0RXZlbnQub25jZShwYXJ0Lm9uV2lsbERpc3Bvc2UpKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSk7XG5cblx0XHRjb25zdCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmdldFNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlKHBhcnQpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShLZXJuZWxTdGF0dXMpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWN0aXZlQ2VsbFN0YXR1cykpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va0luZGVudGF0aW9uU3RhdHVzKSk7XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKE5vdGVib29rRWRpdG9yU3RhdHVzQ29udHJpYnV0aW9uLklELCBOb3RlYm9va0VkaXRvclN0YXR1c0NvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLFlBQVksaUJBQThCLHlCQUF5QjtBQUM1RSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBaUMsZ0JBQWdCLHNDQUFzQztBQUN2RixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHNDQUFzQztBQUMvQyxTQUEwQix1Q0FBdUM7QUFFakUsU0FBUywrQkFBK0I7QUFDeEMsU0FBMEIsOEJBQThCO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQW1ELG1CQUFtQiwwQkFBMEI7QUFDaEcsU0FBUyw0QkFBeUM7QUFDbEQsU0FBUyxhQUFhO0FBRXRCLElBQU0sd0JBQU4sTUFBbUQ7QUFBQSxFQUlsRCxZQUNDLFVBQ0EsV0FDd0IsdUJBQ0UseUJBQ2IsWUFDWjtBQUNELFVB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
