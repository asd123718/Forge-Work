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
import "./share.css";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../common/editor.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { Severity } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { WorkspaceFolderCountContext } from "../../../common/contextkeys.js";
import { Extensions } from "../../../common/contributions.js";
import { ShareProviderCountContext, ShareService } from "./shareService.js";
import { IShareService } from "../common/share.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { workbenchConfigurationNodeBase } from "../../../common/configuration.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
const targetMenus = [
  MenuId.EditorContextShare,
  MenuId.SCMResourceContextShare,
  MenuId.OpenEditorsContextShare,
  MenuId.EditorTitleContextShare,
  MenuId.MenubarShare,
  // MenuId.EditorLineNumberContext, // todo@joyceerhl add share
  MenuId.ExplorerContextShare
];
let ShareWorkbenchContribution = class extends Disposable {
  constructor(shareService, configurationService) {
    super();
    this.shareService = shareService;
    this.configurationService = configurationService;
    if (this.configurationService.getValue(ShareWorkbenchContribution.SHARE_ENABLED_SETTING)) {
      this.registerActions();
    }
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ShareWorkbenchContribution.SHARE_ENABLED_SETTING)) {
        const settingValue = this.configurationService.getValue(ShareWorkbenchContribution.SHARE_ENABLED_SETTING);
        if (settingValue === true && this._disposables === void 0) {
          this.registerActions();
        } else if (settingValue === false && this._disposables !== void 0) {
          this._disposables?.clear();
          this._disposables = void 0;
        }
      }
    }));
  }
  dispose() {
    super.dispose();
    this._disposables?.dispose();
  }
  registerActions() {
    var _a;
    if (!this._disposables) {
      this._disposables = new DisposableStore();
    }
    this._disposables.add(
      registerAction2((_a = class extends Action2 {
        constructor() {
          super({
            id: _a.ID,
            title: _a.LABEL,
            f1: true,
            icon: Codicon.linkExternal,
            precondition: ContextKeyExpr.and(ShareProviderCountContext.notEqualsTo(0), WorkspaceFolderCountContext.notEqualsTo(0)),
            keybinding: {
              weight: KeybindingWeight.WorkbenchContrib,
              primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.KeyS
            },
            menu: [
              { id: MenuId.CommandCenter, order: 3 }
            ]
          });
        }
        async run(accessor, ...args) {
          const shareService = accessor.get(IShareService);
          const activeEditor = accessor.get(IEditorService)?.activeEditor;
          const resourceUri = (activeEditor && EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY })) ?? accessor.get(IWorkspaceContextService).getWorkspace().folders[0].uri;
          const clipboardService = accessor.get(IClipboardService);
          const dialogService = accessor.get(IDialogService);
          const urlService = accessor.get(IOpenerService);
          const progressService = accessor.get(IProgressService);
          const selection = accessor.get(ICodeEditorService).getActiveCodeEditor()?.getSelection() ?? void 0;
          const result = await progressService.withProgress({
            location: ProgressLocation.Window,
            detail: localize("generating link", "Generating link...")
          }, async () => shareService.provideShare({ resourceUri, selection }, CancellationToken.None));
          if (result) {
            const uriText = result.toString();
            const isResultText = typeof result === "string";
            await clipboardService.writeText(uriText);
            dialogService.prompt(
              {
                type: Severity.Info,
                message: isResultText ? localize("shareTextSuccess", "Copied text to clipboard!") : localize("shareSuccess", "Copied link to clipboard!"),
                custom: {
                  icon: Codicon.check,
                  markdownDetails: [{
                    markdown: new MarkdownString(`<div aria-label='${uriText}'>${uriText}</div>`, { supportHtml: true }),
                    classes: [isResultText ? "share-dialog-input-text" : "share-dialog-input-link"]
                  }]
                },
                cancelButton: localize("close", "Close"),
                buttons: isResultText ? [] : [{ label: localize("open link", "Open Link"), run: () => {
                  urlService.open(result, { openExternal: true });
                } }]
              }
            );
          }
        }
      }, _a.ID = "workbench.action.share", _a.LABEL = localize2("share", "Share..."), _a))
    );
    const actions = this.shareService.getShareActions();
    for (const menuId of targetMenus) {
      for (const action of actions) {
        this._disposables.add(MenuRegistry.appendMenuItem(menuId, action));
      }
    }
  }
};
ShareWorkbenchContribution.SHARE_ENABLED_SETTING = "workbench.experimental.share.enabled";
ShareWorkbenchContribution = __decorateClass([
  __decorateParam(0, IShareService),
  __decorateParam(1, IConfigurationService)
], ShareWorkbenchContribution);
registerSingleton(IShareService, ShareService, InstantiationType.Delayed);
const workbenchContributionsRegistry = Registry.as(Extensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(ShareWorkbenchContribution, LifecyclePhase.Eventually);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  ...workbenchConfigurationNodeBase,
  properties: {
    "workbench.experimental.share.enabled": {
      type: "boolean",
      default: false,
      tags: ["experimental"],
      markdownDescription: localize("experimental.share.enabled", "Controls whether to render the Share action next to the command center when {0} is {1}.", "`#window.commandCenter#`", "`true`"),
      restricted: false
    }
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNoYXJlXFxicm93c2VyXFxzaGFyZS5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vc2hhcmUuY3NzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgU2lkZUJ5U2lkZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZUZvbGRlckNvdW50Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgU2hhcmVQcm92aWRlckNvdW50Q29udGV4dCwgU2hhcmVTZXJ2aWNlIH0gZnJvbSAnLi9zaGFyZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNoYXJlU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zaGFyZS5qcyc7XG5pbXBvcnQgeyBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UsIFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hDb25maWd1cmF0aW9uTm9kZUJhc2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG5jb25zdCB0YXJnZXRNZW51cyA9IFtcblx0TWVudUlkLkVkaXRvckNvbnRleHRTaGFyZSxcblx0TWVudUlkLlNDTVJlc291cmNlQ29udGV4dFNoYXJlLFxuXHRNZW51SWQuT3BlbkVkaXRvcnNDb250ZXh0U2hhcmUsXG5cdE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHRTaGFyZSxcblx0TWVudUlkLk1lbnViYXJTaGFyZSxcblx0Ly8gTWVudUlkLkVkaXRvckxpbmVOdW1iZXJDb250ZXh0LCAvLyB0b2RvQGpveWNlZXJobCBhZGQgc2hhcmVcblx0TWVudUlkLkV4cGxvcmVyQ29udGV4dFNoYXJlXG5dO1xuXG5jbGFzcyBTaGFyZVdvcmtiZW5jaENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHN0YXRpYyBTSEFSRV9FTkFCTEVEX1NFVFRJTkcgPSAnd29ya2JlbmNoLmV4cGVyaW1lbnRhbC5zaGFyZS5lbmFibGVkJztcblxuXHRwcml2YXRlIF9kaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU2hhcmVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2hhcmVTZXJ2aWNlOiBJU2hhcmVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihTaGFyZVdvcmtiZW5jaENvbnRyaWJ1dGlvbi5TSEFSRV9FTkFCTEVEX1NFVFRJTkcpKSB7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyQWN0aW9ucygpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFNoYXJlV29ya2JlbmNoQ29udHJpYnV0aW9uLlNIQVJFX0VOQUJMRURfU0VUVElORykpIHtcblx0XHRcdFx0Y29uc3Qgc2V0dGluZ1ZhbHVlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihTaGFyZVdvcmtiZW5jaENvbnRyaWJ1dGlvbi5TSEFSRV9FTkFCTEVEX1NFVFRJTkcpO1xuXHRcdFx0XHRpZiAoc2V0dGluZ1ZhbHVlID09PSB0cnVlICYmIHRoaXMuX2Rpc3Bvc2FibGVzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLnJlZ2lzdGVyQWN0aW9ucygpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHNldHRpbmdWYWx1ZSA9PT0gZmFsc2UgJiYgdGhpcy5fZGlzcG9zYWJsZXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVzPy5jbGVhcigpO1xuXHRcdFx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXM/LmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJBY3Rpb25zKCkge1xuXHRcdGlmICghdGhpcy5fZGlzcG9zYWJsZXMpIHtcblx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChcblx0XHRcdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTaGFyZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0XHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5zaGFyZSc7XG5cdFx0XHRcdHN0YXRpYyByZWFkb25seSBMQUJFTCA9IGxvY2FsaXplMignc2hhcmUnLCAnU2hhcmUuLi4nKTtcblxuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0XHRpZDogU2hhcmVBY3Rpb24uSUQsXG5cdFx0XHRcdFx0XHR0aXRsZTogU2hhcmVBY3Rpb24uTEFCRUwsXG5cdFx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0XHRcdGljb246IENvZGljb24ubGlua0V4dGVybmFsLFxuXHRcdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoU2hhcmVQcm92aWRlckNvdW50Q29udGV4dC5ub3RFcXVhbHNUbygwKSwgV29ya3NwYWNlRm9sZGVyQ291bnRDb250ZXh0Lm5vdEVxdWFsc1RvKDApKSxcblx0XHRcdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Uyxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRtZW51OiBbXG5cdFx0XHRcdFx0XHRcdHsgaWQ6IE1lbnVJZC5Db21tYW5kQ2VudGVyLCBvcmRlcjogMyB9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdGNvbnN0IHNoYXJlU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2hhcmVTZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpPy5hY3RpdmVFZGl0b3I7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2VVcmkgPSAoYWN0aXZlRWRpdG9yICYmIEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoYWN0aXZlRWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSkpXG5cdFx0XHRcdFx0XHQ/PyBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzWzBdLnVyaTtcblx0XHRcdFx0XHRjb25zdCBjbGlwYm9hcmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCB1cmxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElPcGVuZXJTZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCBwcm9ncmVzc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByb2dyZXNzU2VydmljZSk7XG5cdFx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gYWNjZXNzb3IuZ2V0KElDb2RlRWRpdG9yU2VydmljZSkuZ2V0QWN0aXZlQ29kZUVkaXRvcigpPy5nZXRTZWxlY3Rpb24oKSA/PyB1bmRlZmluZWQ7XG5cblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHtcblx0XHRcdFx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLldpbmRvdyxcblx0XHRcdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2dlbmVyYXRpbmcgbGluaycsICdHZW5lcmF0aW5nIGxpbmsuLi4nKVxuXHRcdFx0XHRcdH0sIGFzeW5jICgpID0+IHNoYXJlU2VydmljZS5wcm92aWRlU2hhcmUoeyByZXNvdXJjZVVyaSwgc2VsZWN0aW9uIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKTtcblxuXHRcdFx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHVyaVRleHQgPSByZXN1bHQudG9TdHJpbmcoKTtcblx0XHRcdFx0XHRcdGNvbnN0IGlzUmVzdWx0VGV4dCA9IHR5cGVvZiByZXN1bHQgPT09ICdzdHJpbmcnO1xuXHRcdFx0XHRcdFx0YXdhaXQgY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQodXJpVGV4dCk7XG5cblx0XHRcdFx0XHRcdGRpYWxvZ1NlcnZpY2UucHJvbXB0KFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHRcdFx0XHRtZXNzYWdlOiBpc1Jlc3VsdFRleHQgPyBsb2NhbGl6ZSgnc2hhcmVUZXh0U3VjY2VzcycsICdDb3BpZWQgdGV4dCB0byBjbGlwYm9hcmQhJykgOiBsb2NhbGl6ZSgnc2hhcmVTdWNjZXNzJywgJ0NvcGllZCBsaW5rIHRvIGNsaXBib2FyZCEnKSxcblx0XHRcdFx0XHRcdFx0XHRjdXN0b206IHtcblx0XHRcdFx0XHRcdFx0XHRcdGljb246IENvZGljb24uY2hlY2ssXG5cdFx0XHRcdFx0XHRcdFx0XHRtYXJrZG93bkRldGFpbHM6IFt7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdG1hcmtkb3duOiBuZXcgTWFya2Rvd25TdHJpbmcoYDxkaXYgYXJpYS1sYWJlbD0nJHt1cmlUZXh0fSc+JHt1cmlUZXh0fTwvZGl2PmAsIHsgc3VwcG9ydEh0bWw6IHRydWUgfSksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNsYXNzZXM6IFtpc1Jlc3VsdFRleHQgPyAnc2hhcmUtZGlhbG9nLWlucHV0LXRleHQnIDogJ3NoYXJlLWRpYWxvZy1pbnB1dC1saW5rJ11cblx0XHRcdFx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRjYW5jZWxCdXR0b246IGxvY2FsaXplKCdjbG9zZScsICdDbG9zZScpLFxuXHRcdFx0XHRcdFx0XHRcdGJ1dHRvbnM6IGlzUmVzdWx0VGV4dCA/IFtdIDogW3sgbGFiZWw6IGxvY2FsaXplKCdvcGVuIGxpbmsnLCAnT3BlbiBMaW5rJyksIHJ1bjogKCkgPT4geyB1cmxTZXJ2aWNlLm9wZW4ocmVzdWx0LCB7IG9wZW5FeHRlcm5hbDogdHJ1ZSB9KTsgfSB9XVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IHRoaXMuc2hhcmVTZXJ2aWNlLmdldFNoYXJlQWN0aW9ucygpO1xuXHRcdGZvciAoY29uc3QgbWVudUlkIG9mIHRhcmdldE1lbnVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zKSB7XG5cdFx0XHRcdC8vIHRvZG9Aam95Y2VlcmhsIGF2b2lkIGR1cGxpY2F0ZXNcblx0XHRcdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShtZW51SWQsIGFjdGlvbikpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJU2hhcmVTZXJ2aWNlLCBTaGFyZVNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuY29uc3Qgd29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpO1xud29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKFNoYXJlV29ya2JlbmNoQ29udHJpYnV0aW9uLCBMaWZlY3ljbGVQaGFzZS5FdmVudHVhbGx5KTtcblxuUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0Li4ud29ya2JlbmNoQ29uZmlndXJhdGlvbk5vZGVCYXNlLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0J3dvcmtiZW5jaC5leHBlcmltZW50YWwuc2hhcmUuZW5hYmxlZCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdleHBlcmltZW50YWwuc2hhcmUuZW5hYmxlZCcsIFwiQ29udHJvbHMgd2hldGhlciB0byByZW5kZXIgdGhlIFNoYXJlIGFjdGlvbiBuZXh0IHRvIHRoZSBjb21tYW5kIGNlbnRlciB3aGVuIHswfSBpcyB7MX0uXCIsICdgI3dpbmRvdy5jb21tYW5kQ2VudGVyI2AnLCAnYHRydWVgJyksXG5cdFx0XHRyZXN0cmljdGVkOiBmYWxzZSxcblx0XHR9XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxTQUFTLFFBQVEsY0FBYyx1QkFBdUI7QUFDL0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx3QkFBd0Isd0JBQXdCO0FBQ3pELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUVyRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLGtCQUFtRDtBQUM1RCxTQUFTLDJCQUEyQixvQkFBb0I7QUFDeEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxrQkFBa0Isd0JBQXdCO0FBQ25ELFNBQVMsMEJBQTBCO0FBQ25DLFNBQWlDLGNBQWMsK0JBQStCO0FBQzlFLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsWUFBWSx1QkFBdUI7QUFFNUMsTUFBTSxjQUFjO0FBQUEsRUFDbkIsT0FBTztBQUFBLEVBQ1AsT0FBTztBQUFBLEVBQ1AsT0FBTztBQUFBLEVBQ1AsT0FBTztBQUFBLEVBQ1AsT0FBTztBQUFBO0FBQUEsRUFFUCxPQUFPO0FBQ1I7QUFFQSxJQUFNLDZCQUFOLGNBQXlDLFdBQVc7QUFBQSxFQUtuRCxZQUNpQyxjQUNRLHNCQUN2QztBQUNELFVBQU07QUFIMEI7QUFDUTtBQUl4QyxRQUFJLEtBQUsscUJBQXFCLFNBQWtCLDJCQUEyQixxQkFBcUIsR0FBRztBQUNsRyxXQUFLLGdCQUFnQjtBQUFBLElBQ3RCO0FBQ0EsU0FBSyxVQUFVLEtBQUsscUJBQXFCLHlCQUF5QixPQUFLO0FBQ3RFLFVBQUksRUFBRSxxQkFBcUIsMkJBQTJCLHFCQUFxQixHQUFHO0FBQzdFLGNBQU0sZUFBZSxLQUFLLHFCQUFxQixTQUFrQiwyQkFBMkIscUJBQXFCO0FBQ2pILFlBQUksaUJBQWlCLFFBQVEsS0FBSyxpQkFBaUIsUUFBVztBQUM3RCxlQUFLLGdCQUFnQjtBQUFBLFFBQ3RCLFdBQVcsaUJBQWlCLFNBQVMsS0FBSyxpQkFBaUIsUUFBVztBQUNyRSxlQUFLLGNBQWMsTUFBTTtBQUN6QixlQUFLLGVBQWU7QUFBQSxRQUNyQjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFVBQU0sUUFBUTtBQUNkLFNBQUssY0FBYyxRQUFRO0FBQUEsRUFDNUI7QUFBQSxFQUVRLGtCQUFrQjtBQTlFM0I7QUErRUUsUUFBSSxDQUFDLEtBQUssY0FBYztBQUN2QixXQUFLLGVBQWUsSUFBSSxnQkFBZ0I7QUFBQSxJQUN6QztBQUVBLFNBQUssYUFBYTtBQUFBLE1BQ2pCLGlCQUFnQixtQkFBMEIsUUFBUTtBQUFBLFFBSWpELGNBQWM7QUFDYixnQkFBTTtBQUFBLFlBQ0wsSUFBSSxHQUFZO0FBQUEsWUFDaEIsT0FBTyxHQUFZO0FBQUEsWUFDbkIsSUFBSTtBQUFBLFlBQ0osTUFBTSxRQUFRO0FBQUEsWUFDZCxjQUFjLGVBQWUsSUFBSSwwQkFBMEIsWUFBWSxDQUFDLEdBQUcsNEJBQTRCLFlBQVksQ0FBQyxDQUFDO0FBQUEsWUFDckgsWUFBWTtBQUFBLGNBQ1gsUUFBUSxpQkFBaUI7QUFBQSxjQUN6QixTQUFTLE9BQU8sTUFBTSxPQUFPLFVBQVUsUUFBUTtBQUFBLFlBQ2hEO0FBQUEsWUFDQSxNQUFNO0FBQUEsY0FDTCxFQUFFLElBQUksT0FBTyxlQUFlLE9BQU8sRUFBRTtBQUFBLFlBQ3RDO0FBQUEsVUFDRCxDQUFDO0FBQUEsUUFDRjtBQUFBLFFBRUEsTUFBZSxJQUFJLGFBQStCLE1BQWdDO0FBQ2pGLGdCQUFNLGVBQWUsU0FBUyxJQUFJLGFBQWE7QUFDL0MsZ0JBQU0sZUFBZSxTQUFTLElBQUksY0FBYyxHQUFHO0FBQ25ELGdCQUFNLGVBQWUsZ0JBQWdCLHVCQUF1QixlQUFlLGNBQWMsRUFBRSxtQkFBbUIsaUJBQWlCLFFBQVEsQ0FBQyxNQUNwSSxTQUFTLElBQUksd0JBQXdCLEVBQUUsYUFBYSxFQUFFLFFBQVEsQ0FBQyxFQUFFO0FBQ3JFLGdCQUFNLG1CQUFtQixTQUFTLElBQUksaUJBQWlCO0FBQ3ZELGdCQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUNqRCxnQkFBTSxhQUFhLFNBQVMsSUFBSSxjQUFjO0FBQzlDLGdCQUFNLGtCQUFrQixTQUFTLElBQUksZ0JBQWdCO0FBQ3JELGdCQUFNLFlBQVksU0FBUyxJQUFJLGtCQUFrQixFQUFFLG9CQUFvQixHQUFHLGFBQWEsS0FBSztBQUU1RixnQkFBTSxTQUFTLE1BQU0sZ0JBQWdCLGFBQWE7QUFBQSxZQUNqRCxVQUFVLGlCQUFpQjtBQUFBLFlBQzNCLFFBQVEsU0FBUyxtQkFBbUIsb0JBQW9CO0FBQUEsVUFDekQsR0FBRyxZQUFZLGFBQWEsYUFBYSxFQUFFLGFBQWEsVUFBVSxHQUFHLGtCQUFrQixJQUFJLENBQUM7QUFFNUYsY0FBSSxRQUFRO0FBQ1gsa0JBQU0sVUFBVSxPQUFPLFNBQVM7QUFDaEMsa0JBQU0sZUFBZSxPQUFPLFdBQVc7QUFDdkMsa0JBQU0saUJBQWlCLFVBQVUsT0FBTztBQUV4QywwQkFBYztBQUFBLGNBQ2I7QUFBQSxnQkFDQyxNQUFNLFNBQVM7QUFBQSxnQkFDZixTQUFTLGVBQWUsU0FBUyxvQkFBb0IsMkJBQTJCLElBQUksU0FBUyxnQkFBZ0IsMkJBQTJCO0FBQUEsZ0JBQ3hJLFFBQVE7QUFBQSxrQkFDUCxNQUFNLFFBQVE7QUFBQSxrQkFDZCxpQkFBaUIsQ0FBQztBQUFBLG9CQUNqQixVQUFVLElBQUksZUFBZSxvQkFBb0IsT0FBTyxLQUFLLE9BQU8sVUFBVSxFQUFFLGFBQWEsS0FBSyxDQUFDO0FBQUEsb0JBQ25HLFNBQVMsQ0FBQyxlQUFlLDRCQUE0Qix5QkFBeUI7QUFBQSxrQkFDL0UsQ0FBQztBQUFBLGdCQUNGO0FBQUEsZ0JBQ0EsY0FBYyxTQUFTLFNBQVMsT0FBTztBQUFBLGdCQUN2QyxTQUFTLGVBQWUsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLFNBQVMsYUFBYSxXQUFXLEdBQUcsS0FBSyxNQUFNO0FBQUUsNkJBQVcsS0FBSyxRQUFRLEVBQUUsY0FBYyxLQUFLLENBQUM7QUFBQSxnQkFBRyxFQUFFLENBQUM7QUFBQSxjQUM3STtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsR0EzRGdCLEdBQ0MsS0FBSywwQkFETixHQUVDLFFBQVEsVUFBVSxTQUFTLFVBQVUsR0FGdEMsR0EyRGY7QUFBQSxJQUNGO0FBRUEsVUFBTSxVQUFVLEtBQUssYUFBYSxnQkFBZ0I7QUFDbEQsZUFBVyxVQUFVLGFBQWE7QUFDakMsaUJBQVcsVUFBVSxTQUFTO0FBRTdCLGFBQUssYUFBYSxJQUFJLGFBQWEsZUFBZSxRQUFRLE1BQU0sQ0FBQztBQUFBLE1BQ2xFO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQTVHTSwyQkFDVSx3QkFBd0I7QUFEbEMsNkJBQU47QUFBQSxFQU1HO0FBQUEsRUFDQTtBQUFBLEdBUEc7QUE4R04sa0JBQWtCLGVBQWUsY0FBYyxrQkFBa0IsT0FBTztBQUN4RSxNQUFNLGlDQUFpQyxTQUFTLEdBQW9DLFdBQVcsU0FBUztBQUN4RywrQkFBK0IsOEJBQThCLDRCQUE0QixlQUFlLFVBQVU7QUFFbEgsU0FBUyxHQUEyQix3QkFBd0IsYUFBYSxFQUFFLHNCQUFzQjtBQUFBLEVBQ2hHLEdBQUc7QUFBQSxFQUNILFlBQVk7QUFBQSxJQUNYLHdDQUF3QztBQUFBLE1BQ3ZDLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxjQUFjO0FBQUEsTUFDckIscUJBQXFCLFNBQVMsOEJBQThCLDJGQUEyRiw0QkFBNEIsUUFBUTtBQUFBLE1BQzNMLFlBQVk7QUFBQSxJQUNiO0FBQUEsRUFDRDtBQUNELENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
