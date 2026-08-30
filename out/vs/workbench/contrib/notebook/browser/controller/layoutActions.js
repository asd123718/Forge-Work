import { Codicon } from "../../../../../base/common/codicons.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Categories } from "../../../../../platform/action/common/actionCommonCategories.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { NOTEBOOK_ACTIONS_CATEGORY } from "./coreActions.js";
import { getNotebookEditorFromEditorPane } from "../notebookBrowser.js";
import { INotebookEditorService } from "../services/notebookEditorService.js";
import { NotebookSetting } from "../../common/notebookCommon.js";
import { NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR } from "../../common/notebookContextKeys.js";
import { INotebookService } from "../../common/notebookService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IPreferencesService } from "../../../../services/preferences/common/preferences.js";
registerAction2(class NotebookConfigureLayoutAction extends Action2 {
  constructor() {
    super({
      id: "workbench.notebook.layout.select",
      title: localize2("workbench.notebook.layout.select.label", "Select between Notebook Layouts"),
      f1: true,
      precondition: ContextKeyExpr.equals(`config.${NotebookSetting.openGettingStarted}`, true),
      category: NOTEBOOK_ACTIONS_CATEGORY,
      menu: [
        {
          id: MenuId.EditorTitle,
          group: "notebookLayout",
          when: ContextKeyExpr.and(
            NOTEBOOK_IS_ACTIVE_EDITOR,
            ContextKeyExpr.notEquals("config.notebook.globalToolbar", true),
            ContextKeyExpr.equals(`config.${NotebookSetting.openGettingStarted}`, true)
          ),
          order: 0
        },
        {
          id: MenuId.NotebookToolbar,
          group: "notebookLayout",
          when: ContextKeyExpr.and(
            ContextKeyExpr.equals("config.notebook.globalToolbar", true),
            ContextKeyExpr.equals(`config.${NotebookSetting.openGettingStarted}`, true)
          ),
          order: 0
        }
      ]
    });
  }
  run(accessor) {
    accessor.get(ICommandService).executeCommand("workbench.action.openWalkthrough", { category: "notebooks", step: "notebookProfile" }, true);
  }
});
registerAction2(class NotebookConfigureLayoutAction2 extends Action2 {
  constructor() {
    super({
      id: "workbench.notebook.layout.configure",
      title: localize2("workbench.notebook.layout.configure.label", "Customize Notebook Layout"),
      f1: true,
      category: NOTEBOOK_ACTIONS_CATEGORY,
      menu: [
        {
          id: MenuId.NotebookToolbar,
          group: "notebookLayout",
          when: ContextKeyExpr.equals("config.notebook.globalToolbar", true),
          order: 1
        }
      ]
    });
  }
  run(accessor) {
    accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: "@tag:notebookLayout" });
  }
});
registerAction2(class NotebookConfigureLayoutFromEditorTitle extends Action2 {
  constructor() {
    super({
      id: "workbench.notebook.layout.configure.editorTitle",
      title: localize2("workbench.notebook.layout.configure.label", "Customize Notebook Layout"),
      f1: false,
      category: NOTEBOOK_ACTIONS_CATEGORY,
      menu: [
        {
          id: MenuId.NotebookEditorLayoutConfigure,
          group: "notebookLayout",
          when: NOTEBOOK_IS_ACTIVE_EDITOR,
          order: 1
        }
      ]
    });
  }
  run(accessor) {
    accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: "@tag:notebookLayout" });
  }
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
  submenu: MenuId.NotebookEditorLayoutConfigure,
  title: localize2("customizeNotebook", "Customize Notebook..."),
  icon: Codicon.gear,
  group: "navigation",
  order: -1,
  when: NOTEBOOK_IS_ACTIVE_EDITOR
});
registerAction2(class ToggleLineNumberFromEditorTitle extends Action2 {
  constructor() {
    super({
      id: "notebook.toggleLineNumbersFromEditorTitle",
      title: localize2("notebook.toggleLineNumbers", "Toggle Notebook Line Numbers"),
      shortTitle: localize2("notebook.toggleLineNumbers.short", "Line Numbers"),
      precondition: NOTEBOOK_EDITOR_FOCUSED,
      menu: [
        {
          id: MenuId.NotebookEditorLayoutConfigure,
          group: "notebookLayoutDetails",
          order: 1,
          when: NOTEBOOK_IS_ACTIVE_EDITOR
        }
      ],
      category: NOTEBOOK_ACTIONS_CATEGORY,
      f1: true,
      toggled: {
        condition: ContextKeyExpr.notEquals("config.notebook.lineNumbers", "off"),
        title: localize("notebook.showLineNumbers", "Line Numbers")
      }
    });
  }
  async run(accessor) {
    return accessor.get(ICommandService).executeCommand("notebook.toggleLineNumbers");
  }
});
registerAction2(class ToggleCellToolbarPositionFromEditorTitle extends Action2 {
  constructor() {
    super({
      id: "notebook.toggleCellToolbarPositionFromEditorTitle",
      title: localize2("notebook.toggleCellToolbarPosition", "Toggle Cell Toolbar Position"),
      menu: [{
        id: MenuId.NotebookEditorLayoutConfigure,
        group: "notebookLayoutDetails",
        order: 3
      }],
      category: NOTEBOOK_ACTIONS_CATEGORY,
      f1: false
    });
  }
  async run(accessor, ...args) {
    return accessor.get(ICommandService).executeCommand("notebook.toggleCellToolbarPosition", ...args);
  }
});
registerAction2(class ToggleBreadcrumbFromEditorTitle extends Action2 {
  constructor() {
    super({
      id: "breadcrumbs.toggleFromEditorTitle",
      title: localize2("notebook.toggleBreadcrumb", "Toggle Breadcrumbs"),
      shortTitle: localize2("notebook.toggleBreadcrumb.short", "Breadcrumbs"),
      toggled: {
        condition: ContextKeyExpr.equals("config.breadcrumbs.enabled", true),
        title: localize("cmd.toggle2", "Breadcrumbs")
      },
      menu: [{
        id: MenuId.NotebookEditorLayoutConfigure,
        group: "notebookLayoutDetails",
        order: 2
      }],
      category: NOTEBOOK_ACTIONS_CATEGORY,
      f1: false
    });
  }
  async run(accessor) {
    return accessor.get(ICommandService).executeCommand("breadcrumbs.toggle");
  }
});
registerAction2(class SaveMimeTypeDisplayOrder extends Action2 {
  constructor() {
    super({
      id: "notebook.saveMimeTypeOrder",
      title: localize2("notebook.saveMimeTypeOrder", "Save Mimetype Display Order"),
      f1: true,
      category: NOTEBOOK_ACTIONS_CATEGORY,
      precondition: NOTEBOOK_IS_ACTIVE_EDITOR
    });
  }
  run(accessor) {
    const service = accessor.get(INotebookService);
    const disposables = new DisposableStore();
    const qp = disposables.add(accessor.get(IQuickInputService).createQuickPick());
    qp.placeholder = localize("notebook.placeholder", "Settings file to save in");
    qp.items = [
      { target: ConfigurationTarget.USER, label: localize("saveTarget.machine", "User Settings") },
      { target: ConfigurationTarget.WORKSPACE, label: localize("saveTarget.workspace", "Workspace Settings") }
    ];
    disposables.add(qp.onDidAccept(() => {
      const target = qp.selectedItems[0]?.target;
      if (target !== void 0) {
        service.saveMimeDisplayOrder(target);
      }
      qp.dispose();
    }));
    disposables.add(qp.onDidHide(() => disposables.dispose()));
    qp.show();
  }
});
registerAction2(class NotebookWebviewResetAction extends Action2 {
  constructor() {
    super({
      id: "workbench.notebook.layout.webview.reset",
      title: localize2("workbench.notebook.layout.webview.reset.label", "Reset Notebook Webview"),
      f1: false,
      category: NOTEBOOK_ACTIONS_CATEGORY
    });
  }
  run(accessor, args) {
    const editorService = accessor.get(IEditorService);
    if (args) {
      const uri = URI.revive(args);
      const notebookEditorService = accessor.get(INotebookEditorService);
      const widgets = notebookEditorService.listNotebookEditors().filter((widget) => widget.hasModel() && widget.textModel.uri.toString() === uri.toString());
      for (const widget of widgets) {
        if (widget.hasModel()) {
          widget.getInnerWebview()?.reload();
        }
      }
    } else {
      const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
      if (!editor) {
        return;
      }
      editor.getInnerWebview()?.reload();
    }
  }
});
registerAction2(class ToggleNotebookStickyScroll extends Action2 {
  constructor() {
    super({
      id: "notebook.action.toggleNotebookStickyScroll",
      title: {
        ...localize2("toggleStickyScroll", "Toggle Notebook Sticky Scroll"),
        mnemonicTitle: localize({ key: "mitoggleNotebookStickyScroll", comment: ["&& denotes a mnemonic"] }, "&&Sticky Scroll")
      },
      shortTitle: localize2("toggleStickyScroll.short", "Sticky Scroll"),
      category: Categories.View,
      toggled: {
        condition: ContextKeyExpr.equals("config.notebook.stickyScroll.enabled", true),
        title: localize("notebookStickyScroll", "Sticky Scroll"),
        mnemonicTitle: localize({ key: "mitoggleNotebookStickyScroll", comment: ["&& denotes a mnemonic"] }, "&&Sticky Scroll")
      },
      menu: [
        { id: MenuId.CommandPalette },
        { id: MenuId.NotebookStickyScrollContext, group: "notebookView", order: 2 },
        { id: MenuId.NotebookToolbarContext, group: "notebookView", order: 2 }
      ]
    });
  }
  async run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    const newValue = !configurationService.getValue("notebook.stickyScroll.enabled");
    return configurationService.updateValue("notebook.stickyScroll.enabled", newValue);
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cm9sbGVyXFxsYXlvdXRBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgTWVudVJlZ2lzdHJ5LCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBOT1RFQk9PS19BQ1RJT05TX0NBVEVHT1JZIH0gZnJvbSAnLi9jb3JlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lIH0gZnJvbSAnLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvclNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy9ub3RlYm9va0VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tTZXR0aW5nIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBOT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBOb3RlYm9va0NvbmZpZ3VyZUxheW91dEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5ub3RlYm9vay5sYXlvdXQuc2VsZWN0Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5ub3RlYm9vay5sYXlvdXQuc2VsZWN0LmxhYmVsJywgXCJTZWxlY3QgYmV0d2VlbiBOb3RlYm9vayBMYXlvdXRzXCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Tm90ZWJvb2tTZXR0aW5nLm9wZW5HZXR0aW5nU3RhcnRlZH1gLCB0cnVlKSxcblx0XHRcdGNhdGVnb3J5OiBOT1RFQk9PS19BQ1RJT05TX0NBVEVHT1JZLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0XHRncm91cDogJ25vdGVib29rTGF5b3V0Jyxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHROT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIubm90RXF1YWxzKCdjb25maWcubm90ZWJvb2suZ2xvYmFsVG9vbGJhcicsIHRydWUpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtOb3RlYm9va1NldHRpbmcub3BlbkdldHRpbmdTdGFydGVkfWAsIHRydWUpXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRvcmRlcjogMFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va1Rvb2xiYXIsXG5cdFx0XHRcdFx0Z3JvdXA6ICdub3RlYm9va0xheW91dCcsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcubm90ZWJvb2suZ2xvYmFsVG9vbGJhcicsIHRydWUpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtOb3RlYm9va1NldHRpbmcub3BlbkdldHRpbmdTdGFydGVkfWAsIHRydWUpXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRvcmRlcjogMFxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0YWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbldhbGt0aHJvdWdoJywgeyBjYXRlZ29yeTogJ25vdGVib29rcycsIHN0ZXA6ICdub3RlYm9va1Byb2ZpbGUnIH0sIHRydWUpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE5vdGVib29rQ29uZmlndXJlTGF5b3V0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLm5vdGVib29rLmxheW91dC5jb25maWd1cmUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLm5vdGVib29rLmxheW91dC5jb25maWd1cmUubGFiZWwnLCBcIkN1c3RvbWl6ZSBOb3RlYm9vayBMYXlvdXRcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBOT1RFQk9PS19BQ1RJT05TX0NBVEVHT1JZLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va1Rvb2xiYXIsXG5cdFx0XHRcdFx0Z3JvdXA6ICdub3RlYm9va0xheW91dCcsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcubm90ZWJvb2suZ2xvYmFsVG9vbGJhcicsIHRydWUpLFxuXHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSkub3BlblNldHRpbmdzKHsganNvbkVkaXRvcjogZmFsc2UsIHF1ZXJ5OiAnQHRhZzpub3RlYm9va0xheW91dCcgfSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgTm90ZWJvb2tDb25maWd1cmVMYXlvdXRGcm9tRWRpdG9yVGl0bGUgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2gubm90ZWJvb2subGF5b3V0LmNvbmZpZ3VyZS5lZGl0b3JUaXRsZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2gubm90ZWJvb2subGF5b3V0LmNvbmZpZ3VyZS5sYWJlbCcsIFwiQ3VzdG9taXplIE5vdGVib29rIExheW91dFwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGNhdGVnb3J5OiBOT1RFQk9PS19BQ1RJT05TX0NBVEVHT1JZLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va0VkaXRvckxheW91dENvbmZpZ3VyZSxcblx0XHRcdFx0XHRncm91cDogJ25vdGVib29rTGF5b3V0Jyxcblx0XHRcdFx0XHR3aGVuOiBOT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SLFxuXHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSkub3BlblNldHRpbmdzKHsganNvbkVkaXRvcjogZmFsc2UsIHF1ZXJ5OiAnQHRhZzpub3RlYm9va0xheW91dCcgfSk7XG5cdH1cbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRpdGxlLCB7XG5cdHN1Ym1lbnU6IE1lbnVJZC5Ob3RlYm9va0VkaXRvckxheW91dENvbmZpZ3VyZSxcblx0dGl0bGU6IGxvY2FsaXplMignY3VzdG9taXplTm90ZWJvb2snLCBcIkN1c3RvbWl6ZSBOb3RlYm9vay4uLlwiKSxcblx0aWNvbjogQ29kaWNvbi5nZWFyLFxuXHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRvcmRlcjogLTEsXG5cdHdoZW46IE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1Jcbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgVG9nZ2xlTGluZU51bWJlckZyb21FZGl0b3JUaXRsZSBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ25vdGVib29rLnRvZ2dsZUxpbmVOdW1iZXJzRnJvbUVkaXRvclRpdGxlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25vdGVib29rLnRvZ2dsZUxpbmVOdW1iZXJzJywgJ1RvZ2dsZSBOb3RlYm9vayBMaW5lIE51bWJlcnMnKSxcblx0XHRcdHNob3J0VGl0bGU6IGxvY2FsaXplMignbm90ZWJvb2sudG9nZ2xlTGluZU51bWJlcnMuc2hvcnQnLCAnTGluZSBOdW1iZXJzJyksXG5cdFx0XHRwcmVjb25kaXRpb246IE5PVEVCT09LX0VESVRPUl9GT0NVU0VELFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va0VkaXRvckxheW91dENvbmZpZ3VyZSxcblx0XHRcdFx0XHRncm91cDogJ25vdGVib29rTGF5b3V0RGV0YWlscycsXG5cdFx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdFx0d2hlbjogTk9URUJPT0tfSVNfQUNUSVZFX0VESVRPUlxuXHRcdFx0XHR9XSxcblx0XHRcdGNhdGVnb3J5OiBOT1RFQk9PS19BQ1RJT05TX0NBVEVHT1JZLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHR0b2dnbGVkOiB7XG5cdFx0XHRcdGNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIubm90RXF1YWxzKCdjb25maWcubm90ZWJvb2subGluZU51bWJlcnMnLCAnb2ZmJyksXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbm90ZWJvb2suc2hvd0xpbmVOdW1iZXJzJywgXCJMaW5lIE51bWJlcnNcIiksXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQoJ25vdGVib29rLnRvZ2dsZUxpbmVOdW1iZXJzJyk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgVG9nZ2xlQ2VsbFRvb2xiYXJQb3NpdGlvbkZyb21FZGl0b3JUaXRsZSBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ25vdGVib29rLnRvZ2dsZUNlbGxUb29sYmFyUG9zaXRpb25Gcm9tRWRpdG9yVGl0bGUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbm90ZWJvb2sudG9nZ2xlQ2VsbFRvb2xiYXJQb3NpdGlvbicsICdUb2dnbGUgQ2VsbCBUb29sYmFyIFBvc2l0aW9uJyksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLk5vdGVib29rRWRpdG9yTGF5b3V0Q29uZmlndXJlLFxuXHRcdFx0XHRncm91cDogJ25vdGVib29rTGF5b3V0RGV0YWlscycsXG5cdFx0XHRcdG9yZGVyOiAzXG5cdFx0XHR9XSxcblx0XHRcdGNhdGVnb3J5OiBOT1RFQk9PS19BQ1RJT05TX0NBVEVHT1JZLFxuXHRcdFx0ZjE6IGZhbHNlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKS5leGVjdXRlQ29tbWFuZCgnbm90ZWJvb2sudG9nZ2xlQ2VsbFRvb2xiYXJQb3NpdGlvbicsIC4uLmFyZ3MpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFRvZ2dsZUJyZWFkY3J1bWJGcm9tRWRpdG9yVGl0bGUgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdicmVhZGNydW1icy50b2dnbGVGcm9tRWRpdG9yVGl0bGUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbm90ZWJvb2sudG9nZ2xlQnJlYWRjcnVtYicsICdUb2dnbGUgQnJlYWRjcnVtYnMnKSxcblx0XHRcdHNob3J0VGl0bGU6IGxvY2FsaXplMignbm90ZWJvb2sudG9nZ2xlQnJlYWRjcnVtYi5zaG9ydCcsICdCcmVhZGNydW1icycpLFxuXHRcdFx0dG9nZ2xlZDoge1xuXHRcdFx0XHRjb25kaXRpb246IENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLmJyZWFkY3J1bWJzLmVuYWJsZWQnLCB0cnVlKSxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjbWQudG9nZ2xlMicsIFwiQnJlYWRjcnVtYnNcIilcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLk5vdGVib29rRWRpdG9yTGF5b3V0Q29uZmlndXJlLFxuXHRcdFx0XHRncm91cDogJ25vdGVib29rTGF5b3V0RGV0YWlscycsXG5cdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHR9XSxcblx0XHRcdGNhdGVnb3J5OiBOT1RFQk9PS19BQ1RJT05TX0NBVEVHT1JZLFxuXHRcdFx0ZjE6IGZhbHNlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQoJ2JyZWFkY3J1bWJzLnRvZ2dsZScpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFNhdmVNaW1lVHlwZURpc3BsYXlPcmRlciBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ25vdGVib29rLnNhdmVNaW1lVHlwZU9yZGVyJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25vdGVib29rLnNhdmVNaW1lVHlwZU9yZGVyJywgXCJTYXZlIE1pbWV0eXBlIERpc3BsYXkgT3JkZXJcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBOT1RFQk9PS19BQ1RJT05TX0NBVEVHT1JZLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBOT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SLFxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90ZWJvb2tTZXJ2aWNlKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBxcCA9IGRpc3Bvc2FibGVzLmFkZChhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKS5jcmVhdGVRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0gJiB7IHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCB9PigpKTtcblx0XHRxcC5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdub3RlYm9vay5wbGFjZWhvbGRlcicsICdTZXR0aW5ncyBmaWxlIHRvIHNhdmUgaW4nKTtcblx0XHRxcC5pdGVtcyA9IFtcblx0XHRcdHsgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsIGxhYmVsOiBsb2NhbGl6ZSgnc2F2ZVRhcmdldC5tYWNoaW5lJywgJ1VzZXIgU2V0dGluZ3MnKSB9LFxuXHRcdFx0eyB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFLCBsYWJlbDogbG9jYWxpemUoJ3NhdmVUYXJnZXQud29ya3NwYWNlJywgJ1dvcmtzcGFjZSBTZXR0aW5ncycpIH0sXG5cdFx0XTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChxcC5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBxcC5zZWxlY3RlZEl0ZW1zWzBdPy50YXJnZXQ7XG5cdFx0XHRpZiAodGFyZ2V0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0c2VydmljZS5zYXZlTWltZURpc3BsYXlPcmRlcih0YXJnZXQpO1xuXHRcdFx0fVxuXHRcdFx0cXAuZGlzcG9zZSgpO1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChxcC5vbkRpZEhpZGUoKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKSk7XG5cblx0XHRxcC5zaG93KCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgTm90ZWJvb2tXZWJ2aWV3UmVzZXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2gubm90ZWJvb2subGF5b3V0LndlYnZpZXcucmVzZXQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLm5vdGVib29rLmxheW91dC53ZWJ2aWV3LnJlc2V0LmxhYmVsJywgXCJSZXNldCBOb3RlYm9vayBXZWJ2aWV3XCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0Y2F0ZWdvcnk6IE5PVEVCT09LX0FDVElPTlNfQ0FURUdPUllcblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M/OiBVcmlDb21wb25lbnRzKTogdm9pZCB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cblx0XHRpZiAoYXJncykge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLnJldml2ZShhcmdzKTtcblx0XHRcdGNvbnN0IG5vdGVib29rRWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHdpZGdldHMgPSBub3RlYm9va0VkaXRvclNlcnZpY2UubGlzdE5vdGVib29rRWRpdG9ycygpLmZpbHRlcih3aWRnZXQgPT4gd2lkZ2V0Lmhhc01vZGVsKCkgJiYgd2lkZ2V0LnRleHRNb2RlbC51cmkudG9TdHJpbmcoKSA9PT0gdXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0Zm9yIChjb25zdCB3aWRnZXQgb2Ygd2lkZ2V0cykge1xuXHRcdFx0XHRpZiAod2lkZ2V0Lmhhc01vZGVsKCkpIHtcblx0XHRcdFx0XHR3aWRnZXQuZ2V0SW5uZXJXZWJ2aWV3KCk/LnJlbG9hZCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGVkaXRvciA9IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lKTtcblx0XHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0ZWRpdG9yLmdldElubmVyV2VidmlldygpPy5yZWxvYWQoKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgVG9nZ2xlTm90ZWJvb2tTdGlja3lTY3JvbGwgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdub3RlYm9vay5hY3Rpb24udG9nZ2xlTm90ZWJvb2tTdGlja3lTY3JvbGwnLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubG9jYWxpemUyKCd0b2dnbGVTdGlja3lTY3JvbGwnLCBcIlRvZ2dsZSBOb3RlYm9vayBTdGlja3kgU2Nyb2xsXCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pdG9nZ2xlTm90ZWJvb2tTdGlja3lTY3JvbGwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZTdGlja3kgU2Nyb2xsXCIpLFxuXHRcdFx0fSxcblx0XHRcdHNob3J0VGl0bGU6IGxvY2FsaXplMigndG9nZ2xlU3RpY2t5U2Nyb2xsLnNob3J0JywgXCJTdGlja3kgU2Nyb2xsXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdHRvZ2dsZWQ6IHtcblx0XHRcdFx0Y29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5zdGlja3lTY3JvbGwuZW5hYmxlZCcsIHRydWUpLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ25vdGVib29rU3RpY2t5U2Nyb2xsJywgXCJTdGlja3kgU2Nyb2xsXCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pdG9nZ2xlTm90ZWJvb2tTdGlja3lTY3JvbGwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZTdGlja3kgU2Nyb2xsXCIpLFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0eyBpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlIH0sXG5cdFx0XHRcdHsgaWQ6IE1lbnVJZC5Ob3RlYm9va1N0aWNreVNjcm9sbENvbnRleHQsIGdyb3VwOiAnbm90ZWJvb2tWaWV3Jywgb3JkZXI6IDIgfSxcblx0XHRcdFx0eyBpZDogTWVudUlkLk5vdGVib29rVG9vbGJhckNvbnRleHQsIGdyb3VwOiAnbm90ZWJvb2tWaWV3Jywgb3JkZXI6IDIgfVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBuZXdWYWx1ZSA9ICFjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnbm90ZWJvb2suc3RpY2t5U2Nyb2xsLmVuYWJsZWQnKTtcblx0XHRyZXR1cm4gY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ25vdGVib29rLnN0aWNreVNjcm9sbC5lbmFibGVkJywgbmV3VmFsdWUpO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQTBCO0FBQ25DLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFTLFFBQVEsY0FBYyx1QkFBdUI7QUFDL0QsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxxQkFBcUIsNkJBQTZCO0FBQzNELFNBQVMsc0JBQXNCO0FB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
