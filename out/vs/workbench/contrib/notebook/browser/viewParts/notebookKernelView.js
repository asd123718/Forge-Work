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
import { ActionViewItem } from "../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Action } from "../../../../../base/common/actions.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { NOTEBOOK_ACTIONS_CATEGORY, SELECT_KERNEL_ID } from "../controller/coreActions.js";
import { getNotebookEditorFromEditorPane } from "../notebookBrowser.js";
import { selectKernelIcon } from "../notebookIcons.js";
import { KernelPickerMRUStrategy } from "./notebookKernelQuickPickStrategy.js";
import { NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_KERNEL_COUNT } from "../../common/notebookContextKeys.js";
import { INotebookKernelHistoryService, INotebookKernelService } from "../../common/notebookKernelService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
function getEditorFromContext(editorService, context) {
  let editor;
  if (context !== void 0 && "notebookEditorId" in context) {
    const editorId = context.notebookEditorId;
    const matchingEditor = editorService.visibleEditorPanes.find((editorPane) => {
      const notebookEditor = getNotebookEditorFromEditorPane(editorPane);
      return notebookEditor?.getId() === editorId;
    });
    editor = getNotebookEditorFromEditorPane(matchingEditor);
  } else if (context !== void 0 && "notebookEditor" in context) {
    editor = context?.notebookEditor;
  } else {
    editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
  }
  return editor;
}
function shouldSkip(selected, controllerId, extensionId, context) {
  return !!(selected && (context && "skipIfAlreadySelected" in context && context.skipIfAlreadySelected || // target kernel is already selected
  controllerId && selected.id === controllerId && ExtensionIdentifier.equals(selected.extension, extensionId)));
}
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: SELECT_KERNEL_ID,
      category: NOTEBOOK_ACTIONS_CATEGORY,
      title: localize2("notebookActions.selectKernel", "Select Notebook Kernel"),
      icon: selectKernelIcon,
      f1: true,
      precondition: NOTEBOOK_IS_ACTIVE_EDITOR,
      menu: [{
        id: MenuId.EditorTitle,
        when: ContextKeyExpr.and(
          NOTEBOOK_IS_ACTIVE_EDITOR,
          ContextKeyExpr.notEquals("config.notebook.globalToolbar", true)
        ),
        group: "navigation",
        order: -10
      }, {
        id: MenuId.NotebookToolbar,
        when: ContextKeyExpr.equals("config.notebook.globalToolbar", true),
        group: "status",
        order: -10
      }, {
        id: MenuId.InteractiveToolbar,
        when: NOTEBOOK_KERNEL_COUNT.notEqualsTo(0),
        group: "status",
        order: -10
      }],
      metadata: {
        description: localize("notebookActions.selectKernel.args", "Notebook Kernel Args"),
        args: [
          {
            name: "kernelInfo",
            description: "The kernel info",
            schema: {
              "type": "object",
              "required": ["id", "extension"],
              "properties": {
                "id": {
                  "type": "string"
                },
                "extension": {
                  "type": "string"
                },
                "notebookEditorId": {
                  "type": "string"
                }
              }
            }
          }
        ]
      }
    });
  }
  async run(accessor, context) {
    const instantiationService = accessor.get(IInstantiationService);
    const editorService = accessor.get(IEditorService);
    const editor = getEditorFromContext(editorService, context);
    if (!editor || !editor.hasModel()) {
      return false;
    }
    let controllerId = context && "id" in context ? context.id : void 0;
    let extensionId = context && "extension" in context ? context.extension : void 0;
    if (controllerId && (typeof controllerId !== "string" || typeof extensionId !== "string")) {
      controllerId = void 0;
      extensionId = void 0;
    }
    const notebook = editor.textModel;
    const notebookKernelService = accessor.get(INotebookKernelService);
    const { selected } = notebookKernelService.getMatchingKernel(notebook);
    if (shouldSkip(selected, controllerId, extensionId, context)) {
      return true;
    }
    const wantedKernelId = controllerId ? `${extensionId}/${controllerId}` : void 0;
    const strategy = instantiationService.createInstance(KernelPickerMRUStrategy);
    return strategy.showQuickPick(editor, wantedKernelId);
  }
});
let NotebooKernelActionViewItem = class extends ActionViewItem {
  constructor(actualAction, _editor, options, _notebookKernelService, _notebookKernelHistoryService) {
    const action = new Action("fakeAction", void 0, ThemeIcon.asClassName(selectKernelIcon), true, (event) => actualAction.run(event));
    super(
      void 0,
      action,
      { ...options, label: false, icon: true }
    );
    this._editor = _editor;
    this._notebookKernelService = _notebookKernelService;
    this._notebookKernelHistoryService = _notebookKernelHistoryService;
    this._register(action);
    this._register(_editor.onDidChangeModel(this._update, this));
    this._register(_notebookKernelService.onDidAddKernel(this._update, this));
    this._register(_notebookKernelService.onDidRemoveKernel(this._update, this));
    this._register(_notebookKernelService.onDidChangeNotebookAffinity(this._update, this));
    this._register(_notebookKernelService.onDidChangeSelectedNotebooks(this._update, this));
    this._register(_notebookKernelService.onDidChangeSourceActions(this._update, this));
    this._register(_notebookKernelService.onDidChangeKernelDetectionTasks(this._update, this));
  }
  render(container) {
    this._update();
    super.render(container);
    container.classList.add("kernel-action-view-item");
    this._kernelLabel = document.createElement("a");
    container.appendChild(this._kernelLabel);
    this.updateLabel();
  }
  updateLabel() {
    if (this._kernelLabel) {
      this._kernelLabel.classList.add("kernel-label");
      this._kernelLabel.innerText = this._action.label;
    }
  }
  _update() {
    const notebook = this._editor.textModel;
    if (!notebook) {
      this._resetAction();
      return;
    }
    KernelPickerMRUStrategy.updateKernelStatusAction(notebook, this._action, this._notebookKernelService, this._notebookKernelHistoryService);
    this.updateClass();
  }
  _resetAction() {
    this._action.enabled = false;
    this._action.label = "";
    this._action.class = "";
  }
};
NotebooKernelActionViewItem = __decorateClass([
  __decorateParam(3, INotebookKernelService),
  __decorateParam(4, INotebookKernelHistoryService)
], NotebooKernelActionViewItem);
export {
  NotebooKernelActionViewItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3UGFydHNcXG5vdGVib29rS2VybmVsVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtLCBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IE5PVEVCT09LX0FDVElPTlNfQ0FURUdPUlksIFNFTEVDVF9LRVJORUxfSUQgfSBmcm9tICcuLi9jb250cm9sbGVyL2NvcmVBY3Rpb25zLmpzJztcbmltcG9ydCB7IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUsIElOb3RlYm9va0VkaXRvciB9IGZyb20gJy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBzZWxlY3RLZXJuZWxJY29uIH0gZnJvbSAnLi4vbm90ZWJvb2tJY29ucy5qcyc7XG5pbXBvcnQgeyBLZXJuZWxQaWNrZXJNUlVTdHJhdGVneSwgS2VybmVsUXVpY2tQaWNrQ29udGV4dCB9IGZyb20gJy4vbm90ZWJvb2tLZXJuZWxRdWlja1BpY2tTdHJhdGVneS5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1RleHRNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9ub3RlYm9va1RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBOT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SLCBOT1RFQk9PS19LRVJORUxfQ09VTlQgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tLZXJuZWwsIElOb3RlYm9va0tlcm5lbEhpc3RvcnlTZXJ2aWNlLCBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rS2VybmVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5cbmZ1bmN0aW9uIGdldEVkaXRvckZyb21Db250ZXh0KGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLCBjb250ZXh0PzogS2VybmVsUXVpY2tQaWNrQ29udGV4dCk6IElOb3RlYm9va0VkaXRvciB8IHVuZGVmaW5lZCB7XG5cdGxldCBlZGl0b3I6IElOb3RlYm9va0VkaXRvciB8IHVuZGVmaW5lZDtcblx0aWYgKGNvbnRleHQgIT09IHVuZGVmaW5lZCAmJiAnbm90ZWJvb2tFZGl0b3JJZCcgaW4gY29udGV4dCkge1xuXHRcdGNvbnN0IGVkaXRvcklkID0gY29udGV4dC5ub3RlYm9va0VkaXRvcklkO1xuXHRcdGNvbnN0IG1hdGNoaW5nRWRpdG9yID0gZWRpdG9yU2VydmljZS52aXNpYmxlRWRpdG9yUGFuZXMuZmluZCgoZWRpdG9yUGFuZSkgPT4ge1xuXHRcdFx0Y29uc3Qgbm90ZWJvb2tFZGl0b3IgPSBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKGVkaXRvclBhbmUpO1xuXHRcdFx0cmV0dXJuIG5vdGVib29rRWRpdG9yPy5nZXRJZCgpID09PSBlZGl0b3JJZDtcblx0XHR9KTtcblx0XHRlZGl0b3IgPSBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKG1hdGNoaW5nRWRpdG9yKTtcblx0fSBlbHNlIGlmIChjb250ZXh0ICE9PSB1bmRlZmluZWQgJiYgJ25vdGVib29rRWRpdG9yJyBpbiBjb250ZXh0KSB7XG5cdFx0ZWRpdG9yID0gY29udGV4dD8ubm90ZWJvb2tFZGl0b3I7XG5cdH0gZWxzZSB7XG5cdFx0ZWRpdG9yID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZShlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpO1xuXHR9XG5cblx0cmV0dXJuIGVkaXRvcjtcbn1cblxuZnVuY3Rpb24gc2hvdWxkU2tpcChcblx0c2VsZWN0ZWQ6IElOb3RlYm9va0tlcm5lbCB8IHVuZGVmaW5lZCxcblx0Y29udHJvbGxlcklkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdGV4dGVuc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdGNvbnRleHQ6IEtlcm5lbFF1aWNrUGlja0NvbnRleHQgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblxuXHRyZXR1cm4gISEoc2VsZWN0ZWQgJiYgKFxuXHRcdChjb250ZXh0ICYmICdza2lwSWZBbHJlYWR5U2VsZWN0ZWQnIGluIGNvbnRleHQgJiYgY29udGV4dC5za2lwSWZBbHJlYWR5U2VsZWN0ZWQpIHx8XG5cdFx0Ly8gdGFyZ2V0IGtlcm5lbCBpcyBhbHJlYWR5IHNlbGVjdGVkXG5cdFx0KGNvbnRyb2xsZXJJZCAmJiBzZWxlY3RlZC5pZCA9PT0gY29udHJvbGxlcklkICYmIEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKHNlbGVjdGVkLmV4dGVuc2lvbiwgZXh0ZW5zaW9uSWQpKVxuXHQpKTtcbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTRUxFQ1RfS0VSTkVMX0lELFxuXHRcdFx0Y2F0ZWdvcnk6IE5PVEVCT09LX0FDVElPTlNfQ0FURUdPUlksXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdub3RlYm9va0FjdGlvbnMuc2VsZWN0S2VybmVsJywgJ1NlbGVjdCBOb3RlYm9vayBLZXJuZWwnKSxcblx0XHRcdGljb246IHNlbGVjdEtlcm5lbEljb24sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogTk9URUJPT0tfSVNfQUNUSVZFX0VESVRPUixcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHROT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm5vdEVxdWFscygnY29uZmlnLm5vdGVib29rLmdsb2JhbFRvb2xiYXInLCB0cnVlKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogLTEwXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTm90ZWJvb2tUb29sYmFyLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5nbG9iYWxUb29sYmFyJywgdHJ1ZSksXG5cdFx0XHRcdGdyb3VwOiAnc3RhdHVzJyxcblx0XHRcdFx0b3JkZXI6IC0xMFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkludGVyYWN0aXZlVG9vbGJhcixcblx0XHRcdFx0d2hlbjogTk9URUJPT0tfS0VSTkVMX0NPVU5ULm5vdEVxdWFsc1RvKDApLFxuXHRcdFx0XHRncm91cDogJ3N0YXR1cycsXG5cdFx0XHRcdG9yZGVyOiAtMTBcblx0XHRcdH1dLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdub3RlYm9va0FjdGlvbnMuc2VsZWN0S2VybmVsLmFyZ3MnLCBcIk5vdGVib29rIEtlcm5lbCBBcmdzXCIpLFxuXHRcdFx0XHRhcmdzOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bmFtZTogJ2tlcm5lbEluZm8nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdUaGUga2VybmVsIGluZm8nLFxuXHRcdFx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdCdyZXF1aXJlZCc6IFsnaWQnLCAnZXh0ZW5zaW9uJ10sXG5cdFx0XHRcdFx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHRcdFx0XHRcdCdpZCc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdCdleHRlbnNpb24nOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHQnbm90ZWJvb2tFZGl0b3JJZCc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBLZXJuZWxRdWlja1BpY2tDb250ZXh0KTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGVkaXRvciA9IGdldEVkaXRvckZyb21Db250ZXh0KGVkaXRvclNlcnZpY2UsIGNvbnRleHQpO1xuXG5cdFx0aWYgKCFlZGl0b3IgfHwgIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0bGV0IGNvbnRyb2xsZXJJZCA9IGNvbnRleHQgJiYgJ2lkJyBpbiBjb250ZXh0ID8gY29udGV4dC5pZCA6IHVuZGVmaW5lZDtcblx0XHRsZXQgZXh0ZW5zaW9uSWQgPSBjb250ZXh0ICYmICdleHRlbnNpb24nIGluIGNvbnRleHQgPyBjb250ZXh0LmV4dGVuc2lvbiA6IHVuZGVmaW5lZDtcblxuXHRcdGlmIChjb250cm9sbGVySWQgJiYgKHR5cGVvZiBjb250cm9sbGVySWQgIT09ICdzdHJpbmcnIHx8IHR5cGVvZiBleHRlbnNpb25JZCAhPT0gJ3N0cmluZycpKSB7XG5cdFx0XHQvLyB2YWxpZGF0ZSBjb250ZXh0OiBpZCAmIGV4dGVuc2lvbiBNVVNUIGJlIHN0cmluZ3Ncblx0XHRcdGNvbnRyb2xsZXJJZCA9IHVuZGVmaW5lZDtcblx0XHRcdGV4dGVuc2lvbklkID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vdGVib29rID0gZWRpdG9yLnRleHRNb2RlbDtcblx0XHRjb25zdCBub3RlYm9va0tlcm5lbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGVib29rS2VybmVsU2VydmljZSk7XG5cdFx0Y29uc3QgeyBzZWxlY3RlZCB9ID0gbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmdldE1hdGNoaW5nS2VybmVsKG5vdGVib29rKTtcblxuXHRcdGlmIChzaG91bGRTa2lwKHNlbGVjdGVkLCBjb250cm9sbGVySWQsIGV4dGVuc2lvbklkLCBjb250ZXh0KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2FudGVkS2VybmVsSWQgPSBjb250cm9sbGVySWQgPyBgJHtleHRlbnNpb25JZH0vJHtjb250cm9sbGVySWR9YCA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzdHJhdGVneSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEtlcm5lbFBpY2tlck1SVVN0cmF0ZWd5KTtcblx0XHRyZXR1cm4gc3RyYXRlZ3kuc2hvd1F1aWNrUGljayhlZGl0b3IsIHdhbnRlZEtlcm5lbElkKTtcblx0fVxufSk7XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9vS2VybmVsQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBBY3Rpb25WaWV3SXRlbSB7XG5cblx0cHJpdmF0ZSBfa2VybmVsTGFiZWw/OiBIVE1MQW5jaG9yRWxlbWVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3R1YWxBY3Rpb246IElBY3Rpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiB7IG9uRGlkQ2hhbmdlTW9kZWw6IEV2ZW50PHZvaWQ+OyB0ZXh0TW9kZWw6IE5vdGVib29rVGV4dE1vZGVsIHwgdW5kZWZpbmVkOyBzY29wZWRDb250ZXh0S2V5U2VydmljZT86IElDb250ZXh0S2V5U2VydmljZSB9IHwgSU5vdGVib29rRWRpdG9yLFxuXHRcdG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdFx0QElOb3RlYm9va0tlcm5lbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tLZXJuZWxTZXJ2aWNlOiBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tLZXJuZWxIaXN0b3J5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0tlcm5lbEhpc3RvcnlTZXJ2aWNlOiBJTm90ZWJvb2tLZXJuZWxIaXN0b3J5U2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3QgYWN0aW9uID0gbmV3IEFjdGlvbignZmFrZUFjdGlvbicsIHVuZGVmaW5lZCwgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKHNlbGVjdEtlcm5lbEljb24pLCB0cnVlLCAoZXZlbnQpID0+IGFjdHVhbEFjdGlvbi5ydW4oZXZlbnQpKTtcblx0XHRzdXBlcihcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGFjdGlvbixcblx0XHRcdHsgLi4ub3B0aW9ucywgbGFiZWw6IGZhbHNlLCBpY29uOiB0cnVlIH1cblx0XHQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvbik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsKHRoaXMuX3VwZGF0ZSwgdGhpcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF9ub3RlYm9va0tlcm5lbFNlcnZpY2Uub25EaWRBZGRLZXJuZWwodGhpcy5fdXBkYXRlLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX25vdGVib29rS2VybmVsU2VydmljZS5vbkRpZFJlbW92ZUtlcm5lbCh0aGlzLl91cGRhdGUsIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihfbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLm9uRGlkQ2hhbmdlTm90ZWJvb2tBZmZpbml0eSh0aGlzLl91cGRhdGUsIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihfbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLm9uRGlkQ2hhbmdlU2VsZWN0ZWROb3RlYm9va3ModGhpcy5fdXBkYXRlLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX25vdGVib29rS2VybmVsU2VydmljZS5vbkRpZENoYW5nZVNvdXJjZUFjdGlvbnModGhpcy5fdXBkYXRlLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX25vdGVib29rS2VybmVsU2VydmljZS5vbkRpZENoYW5nZUtlcm5lbERldGVjdGlvblRhc2tzKHRoaXMuX3VwZGF0ZSwgdGhpcykpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl91cGRhdGUoKTtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgna2VybmVsLWFjdGlvbi12aWV3LWl0ZW0nKTtcblx0XHR0aGlzLl9rZXJuZWxMYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5fa2VybmVsTGFiZWwpO1xuXHRcdHRoaXMudXBkYXRlTGFiZWwoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVMYWJlbCgpIHtcblx0XHRpZiAodGhpcy5fa2VybmVsTGFiZWwpIHtcblx0XHRcdHRoaXMuX2tlcm5lbExhYmVsLmNsYXNzTGlzdC5hZGQoJ2tlcm5lbC1sYWJlbCcpO1xuXHRcdFx0dGhpcy5fa2VybmVsTGFiZWwuaW5uZXJUZXh0ID0gdGhpcy5fYWN0aW9uLmxhYmVsO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBfdXBkYXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IG5vdGVib29rID0gdGhpcy5fZWRpdG9yLnRleHRNb2RlbDtcblxuXHRcdGlmICghbm90ZWJvb2spIHtcblx0XHRcdHRoaXMuX3Jlc2V0QWN0aW9uKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0S2VybmVsUGlja2VyTVJVU3RyYXRlZ3kudXBkYXRlS2VybmVsU3RhdHVzQWN0aW9uKG5vdGVib29rLCB0aGlzLl9hY3Rpb24sIHRoaXMuX25vdGVib29rS2VybmVsU2VydmljZSwgdGhpcy5fbm90ZWJvb2tLZXJuZWxIaXN0b3J5U2VydmljZSk7XG5cblx0XHR0aGlzLnVwZGF0ZUNsYXNzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXNldEFjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9hY3Rpb24uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2FjdGlvbi5sYWJlbCA9ICcnO1xuXHRcdHRoaXMuX2FjdGlvbi5jbGFzcyA9ICcnO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsc0JBQThDO0FBQ3ZELFNBQVMsY0FBdUI7QUFFaEMsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQsU0FBUyxzQkFBMEM7QUFDbkQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUywyQkFBMkIsd0JBQXdCO0FBQzVELFNBQVMsdUNBQXdEO0FBQ2pFLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsK0JBQXVEO0FBRWhFLFNBQVMsMkJBQTJCLDZCQUE2QjtBQUNqRSxTQUEwQiwrQkFBK0IsOEJBQThCO0FBQ3ZGLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMscUJBQXFCLGVBQStCLFNBQStEO0FBQzNILE1BQUk7QUFDSixNQUFJLFlBQVksVUFBYSxzQkFBc0IsU0FBUztBQUMzRCxVQUFNLFdBQVcsUUFBUTtBQUN6QixVQUFNLGlCQUFpQixjQUFjLG1CQUFtQixLQUFLLENBQUMsZUFBZTtBQUM1RSxZQUFNLGlCQUFpQixnQ0FBZ0MsVUFBVTtBQUNqRSxhQUFPLGdCQUFnQixNQUFNLE1BQU07QUFBQSxJQUNwQyxDQUFDO0FBQ0QsYUFBUyxnQ0FBZ0MsY0FBYztBQUFBLEVBQ3hELFdBQVcsWUFBWSxVQUFhLG9CQUFvQixTQUFTO0FBQ2hFLGFBQVMsU0FBUztBQUFBLEVBQ25CLE9BQU87QUFDTixhQUFTLGdDQUFnQyxjQUFjLGdCQUFnQjtBQUFBLEVBQ3hFO0FBRUEsU0FBTztBQUNSO0FBRUEsU0FBUyxXQUNSLFVBQ0EsY0FDQSxhQUNBLFNBQXNEO0FBRXRELFNBQU8sQ0FBQyxFQUFFLGFBQ1IsV0FBVywyQkFBMkIsV0FBVyxRQUFRO0FBQUEsRUFFekQsZ0JBQWdCLFNBQVMsT0FBTyxnQkFBZ0Isb0JBQW9CLE9BQU8sU0FBUyxXQUFXLFdBQVc7QUFFN0c7QUFFQSxnQkFBZ0IsY0FBYyxRQUFRO0FBQUEsRUFDckMsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLFVBQVU7QUFBQSxNQUNWLE9BQU8sVUFBVSxnQ0FBZ0Msd0JBQXdCO0FBQUEsTUFDekUsTUFBTTtBQUFBLE1BQ04sSUFBSTtBQUFBLE1BQ0osY0FBYztBQUFBLE1BQ2QsTUFBTSxDQUFDO0FBQUEsUUFDTixJQUFJLE9BQU87QUFBQSxRQUNYLE1BQU0sZUFBZTtBQUFBLFVBQ3BCO0FBQUEsVUFDQSxlQUFlLFVBQVUsaUNBQWlDLElBQUk7QUFBQSxRQUMvRDtBQUFBLFFBQ0EsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLE1BQ1IsR0FBRztBQUFBLFFBQ0YsSUFBSSxPQUFPO0FBQUEsUUFDWCxNQUFNLGVBQWUsT0FBTyxpQ0FBaUMsSUFBSTtBQUFBLFFBQ2pFLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxNQUNSLEdBQUc7QUFBQSxRQUNGLElBQUksT0FBTztBQUFBLFFBQ1gsTUFBTSxzQkFBc0IsWUFBWSxDQUFDO0FBQUEsUUFDekMsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLE1BQ1IsQ0FBQztBQUFBLE1BQ0QsVUFBVTtBQUFBLFFBQ1QsYUFBYSxTQUFTLHFDQUFxQyxzQkFBc0I7QUFBQSxRQUNqRixNQUFNO0FBQUEsVUFDTDtBQUFBLFlBQ0MsTUFBTTtBQUFBLFlBQ04sYUFBYTtBQUFBLFlBQ2IsUUFBUTtBQUFBLGNBQ1AsUUFBUTtBQUFBLGNBQ1IsWUFBWSxDQUFDLE1BQU0sV0FBVztBQUFBLGNBQzlCLGNBQWM7QUFBQSxnQkFDYixNQUFNO0FBQUEsa0JBQ0wsUUFBUTtBQUFBLGdCQUNUO0FBQUEsZ0JBQ0EsYUFBYTtBQUFBLGtCQUNaLFFBQVE7QUFBQSxnQkFDVDtBQUFBLGdCQUNBLG9CQUFvQjtBQUFBLGtCQUNuQixRQUFRO0FBQUEsZ0JBQ1Q7QUFBQSxjQUNEO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUE0QixTQUFvRDtBQUN6RixVQUFNLHVCQUF1QixTQUFTLElBQUkscUJBQXFCO0FBQy9ELFVBQU0sZ0JBQWdCLFNBQVMsSUFBSSxjQUFjO0FBRWpELFVBQU0sU0FBUyxxQkFBcUIsZUFBZSxPQUFPO0FBRTFELFFBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxTQUFTLEdBQUc7QUFDbEMsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLGVBQWUsV0FBVyxRQUFRLFVBQVUsUUFBUSxLQUFLO0FBQzdELFFBQUksY0FBYyxXQUFXLGVBQWUsVUFBVSxRQUFRLFlBQVk7QUFFMUUsUUFBSSxpQkFBaUIsT0FBTyxpQkFBaUIsWUFBWSxPQUFPLGdCQUFnQixXQUFXO0FBRTFGLHFCQUFlO0FBQ2Ysb0JBQWM7QUFBQSxJQUNmO0FBRUEsVUFBTSxXQUFXLE9BQU87QUFDeEIsVUFBTSx3QkFBd0IsU0FBUyxJQUFJLHNCQUFzQjtBQUNqRSxVQUFNLEVBQUUsU0FBUyxJQUFJLHNCQUFzQixrQkFBa0IsUUFBUTtBQUVyRSxRQUFJLFdBQVcsVUFBVSxjQUFjLGFBQWEsT0FBTyxHQUFHO0FBQzdELGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxpQkFBaUIsZUFBZSxHQUFHLFdBQVcsSUFBSSxZQUFZLEtBQUs7QUFDekUsVUFBTSxXQUFXLHFCQUFxQixlQUFlLHVCQUF1QjtBQUM1RSxXQUFPLFNBQVMsY0FBYyxRQUFRLGNBQWM7QUFBQSxFQUNyRDtBQUNELENBQUM7QUFFTSxJQUFNLDhCQUFOLGNBQTBDLGVBQWU7QUFBQSxFQUkvRCxZQUNDLGNBQ2lCLFNBQ2pCLFNBQ3lDLHdCQUNPLCtCQUMvQztBQUNELFVBQU0sU0FBUyxJQUFJLE9BQU8sY0FBYyxRQUFXLFVBQVUsWUFBWSxnQkFBZ0IsR0FBRyxNQUFNLENBQUMsVUFBVSxhQUFhLElBQUksS0FBSyxDQUFDO0FBQ3BJO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxNQUNBLEVBQUUsR0FBRyxTQUFTLE9BQU8sT0FBTyxNQUFNLEtBQUs7QUFBQSxJQUN4QztBQVZpQjtBQUV3QjtBQUNPO0FBUWhELFNBQUssVUFBVSxNQUFNO0FBQ3JCLFNBQUssVUFBVSxRQUFRLGlCQUFpQixLQUFLLFNBQVMsSUFBSSxDQUFDO0FBQzNELFNBQUssVUFBVSx1QkFBdUIsZUFBZSxLQUFLLFNBQVMsSUFBSSxDQUFDO0FBQ3hFLFNBQUssVUFBVSx1QkFBdUIsa0JBQWtCLEtBQUssU0FBUyxJQUFJLENBQUM7QUFDM0UsU0FBSyxVQUFVLHVCQUF1Qiw0QkFBNEIsS0FBSyxTQUFTLElBQUksQ0FBQztBQUNyRixTQUFLLFVBQVUsdUJBQXVCLDZCQUE2QixLQUFLLFNBQVMsSUFBSSxDQUFDO0FBQ3RGLFNBQUssVUFBVSx1QkFBdUIseUJBQXlCLEtBQUssU0FBUyxJQUFJLENBQUM7QUFDbEYsU0FBSyxVQUFVLHVCQUF1QixnQ0FBZ0MsS0FBSyxTQUFTLElBQUksQ0FBQztBQUFBLEVBQzFGO0FBQUEsRUFFUyxPQUFPLFdBQThCO0FBQzdDLFNBQUssUUFBUTtBQUNiLFVBQU0sT0FBTyxTQUFTO0FBQ3RCLGNBQVUsVUFBVSxJQUFJLHlCQUF5QjtBQUNqRCxTQUFLLGVBQWUsU0FBUyxjQUFjLEdBQUc7QUFDOUMsY0FBVSxZQUFZLEtBQUssWUFBWTtBQUN2QyxTQUFLLFlBQVk7QUFBQSxFQUNsQjtBQUFBLEVBRW1CLGNBQWM7QUFDaEMsUUFBSSxLQUFLLGNBQWM7QUFDdEIsV0FBSyxhQUFhLFVBQVUsSUFBSSxjQUFjO0FBQzlDLFdBQUssYUFBYSxZQUFZLEtBQUssUUFBUTtBQUFBLElBQzVDO0FBQUEsRUFDRDtBQUFBLEVBRVUsVUFBZ0I7QUFDekIsVUFBTSxXQUFXLEtBQUssUUFBUTtBQUU5QixRQUFJLENBQUMsVUFBVTtBQUNkLFdBQUssYUFBYTtBQUNsQjtBQUFBLElBQ0Q7QUFFQSw0QkFBd0IseUJBQXlCLFVBQVUsS0FBSyxTQUFTLEtBQUssd0JBQXdCLEtBQUssNkJBQTZCO0FBRXhJLFNBQUssWUFBWTtBQUFBLEVBQ2xCO0FBQUEsRUFFUSxlQUFxQjtBQUM1QixTQUFLLFFBQVEsVUFBVTtBQUN2QixTQUFLLFFBQVEsUUFBUTtBQUNyQixTQUFLLFFBQVEsUUFBUTtBQUFBLEVBQ3RCO0FBQ0Q7QUE3RGEsOEJBQU47QUFBQSxFQVFKO0FBQUEsRUFDQTtBQUFBLEdBVFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
