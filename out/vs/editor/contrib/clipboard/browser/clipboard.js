import * as browser from "../../../../base/browser/browser.js";
import { getActiveDocument, getActiveWindow } from "../../../../base/browser/dom.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import * as platform from "../../../../base/common/platform.js";
import * as nls from "../../../../nls.js";
import { MenuId, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { CopyOptions, generateDataToCopyAndStoreInMemory, InMemoryClipboardMetadataManager } from "../../../browser/controller/editContext/clipboardUtils.js";
import { NativeEditContextRegistry } from "../../../browser/controller/editContext/native/nativeEditContextRegistry.js";
import { EditorAction, MultiCommand, registerEditorAction } from "../../../browser/editorExtensions.js";
import { ICodeEditorService } from "../../../browser/services/codeEditorService.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Handler } from "../../../common/editorCommon.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { CopyPasteController } from "../../dropOrPasteInto/browser/copyPasteController.js";
const CLIPBOARD_CONTEXT_MENU_GROUP = "9_cutcopypaste";
const supportsCut = platform.isNative || document.queryCommandSupported && document.queryCommandSupported("cut");
const supportsCopy = platform.isNative || document.queryCommandSupported && document.queryCommandSupported("copy");
const supportsPaste = typeof navigator.clipboard === "undefined" || browser.isFirefox ? document.queryCommandSupported && document.queryCommandSupported("paste") : true;
function registerCommand(command) {
  command.register();
  return command;
}
const CutAction = supportsCut ? registerCommand(new MultiCommand({
  id: "editor.action.clipboardCutAction",
  precondition: void 0,
  kbOpts: (
    // Do not bind cut keybindings in the browser,
    // since browsers do that for us and it avoids security prompts
    platform.isNative ? {
      primary: KeyMod.CtrlCmd | KeyCode.KeyX,
      win: { primary: KeyMod.CtrlCmd | KeyCode.KeyX, secondary: [KeyMod.Shift | KeyCode.Delete] },
      weight: KeybindingWeight.EditorContrib
    } : void 0
  ),
  menuOpts: [{
    menuId: MenuId.MenubarEditMenu,
    group: "2_ccp",
    title: nls.localize({ key: "miCut", comment: ["&& denotes a mnemonic"] }, "Cu&&t"),
    order: 1
  }, {
    menuId: MenuId.EditorContext,
    group: CLIPBOARD_CONTEXT_MENU_GROUP,
    title: nls.localize("actions.clipboard.cutLabel", "Cut"),
    when: EditorContextKeys.writable,
    order: 1
  }, {
    menuId: MenuId.CommandPalette,
    group: "",
    title: nls.localize("actions.clipboard.cutLabel", "Cut"),
    order: 1
  }, {
    menuId: MenuId.SimpleEditorContext,
    group: CLIPBOARD_CONTEXT_MENU_GROUP,
    title: nls.localize("actions.clipboard.cutLabel", "Cut"),
    when: EditorContextKeys.writable,
    order: 1
  }]
})) : void 0;
const CopyAction = supportsCopy ? registerCommand(new MultiCommand({
  id: "editor.action.clipboardCopyAction",
  precondition: void 0,
  kbOpts: (
    // Do not bind copy keybindings in the browser,
    // since browsers do that for us and it avoids security prompts
    platform.isNative ? {
      primary: KeyMod.CtrlCmd | KeyCode.KeyC,
      win: { primary: KeyMod.CtrlCmd | KeyCode.KeyC, secondary: [KeyMod.CtrlCmd | KeyCode.Insert] },
      weight: KeybindingWeight.EditorContrib
    } : void 0
  ),
  menuOpts: [{
    menuId: MenuId.MenubarEditMenu,
    group: "2_ccp",
    title: nls.localize({ key: "miCopy", comment: ["&& denotes a mnemonic"] }, "&&Copy"),
    order: 2
  }, {
    menuId: MenuId.EditorContext,
    group: CLIPBOARD_CONTEXT_MENU_GROUP,
    title: nls.localize("actions.clipboard.copyLabel", "Copy"),
    order: 2
  }, {
    menuId: MenuId.CommandPalette,
    group: "",
    title: nls.localize("actions.clipboard.copyLabel", "Copy"),
    order: 1
  }, {
    menuId: MenuId.SimpleEditorContext,
    group: CLIPBOARD_CONTEXT_MENU_GROUP,
    title: nls.localize("actions.clipboard.copyLabel", "Copy"),
    order: 2
  }]
})) : void 0;
MenuRegistry.appendMenuItem(MenuId.MenubarEditMenu, { submenu: MenuId.MenubarCopy, title: nls.localize2("copy as", "Copy As"), group: "2_ccp", order: 3 });
MenuRegistry.appendMenuItem(MenuId.EditorContext, { submenu: MenuId.EditorContextCopy, title: nls.localize2("copy as", "Copy As"), group: CLIPBOARD_CONTEXT_MENU_GROUP, order: 3 });
MenuRegistry.appendMenuItem(MenuId.EditorContext, { submenu: MenuId.EditorContextShare, title: nls.localize2("share", "Share"), group: "11_share", order: -1, when: ContextKeyExpr.and(ContextKeyExpr.notEquals("resourceScheme", "output"), EditorContextKeys.editorTextFocus) });
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, { submenu: MenuId.ExplorerContextShare, title: nls.localize2("share", "Share"), group: "11_share", order: -1 });
const PasteAction = supportsPaste ? registerCommand(new MultiCommand({
  id: "editor.action.clipboardPasteAction",
  precondition: void 0,
  kbOpts: (
    // Do not bind paste keybindings in the browser,
    // since browsers do that for us and it avoids security prompts
    platform.isNative ? {
      primary: KeyMod.CtrlCmd | KeyCode.KeyV,
      win: { primary: KeyMod.CtrlCmd | KeyCode.KeyV, secondary: [KeyMod.Shift | KeyCode.Insert] },
      linux: { primary: KeyMod.CtrlCmd | KeyCode.KeyV, secondary: [KeyMod.Shift | KeyCode.Insert] },
      weight: KeybindingWeight.EditorContrib
    } : void 0
  ),
  menuOpts: [{
    menuId: MenuId.MenubarEditMenu,
    group: "2_ccp",
    title: nls.localize({ key: "miPaste", comment: ["&& denotes a mnemonic"] }, "&&Paste"),
    order: 4
  }, {
    menuId: MenuId.EditorContext,
    group: CLIPBOARD_CONTEXT_MENU_GROUP,
    title: nls.localize("actions.clipboard.pasteLabel", "Paste"),
    when: EditorContextKeys.writable,
    order: 4
  }, {
    menuId: MenuId.CommandPalette,
    group: "",
    title: nls.localize("actions.clipboard.pasteLabel", "Paste"),
    order: 1
  }, {
    menuId: MenuId.SimpleEditorContext,
    group: CLIPBOARD_CONTEXT_MENU_GROUP,
    title: nls.localize("actions.clipboard.pasteLabel", "Paste"),
    when: EditorContextKeys.writable,
    order: 4
  }]
})) : void 0;
class ExecCommandCopyWithSyntaxHighlightingAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.clipboardCopyWithSyntaxHighlightingAction",
      label: nls.localize2("actions.clipboard.copyWithSyntaxHighlightingLabel", "Copy with Syntax Highlighting"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.textInputFocus,
        primary: 0,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(accessor, editor) {
    const logService = accessor.get(ILogService);
    const clipboardService = accessor.get(IClipboardService);
    logService.trace("ExecCommandCopyWithSyntaxHighlightingAction#run");
    if (!editor.hasModel()) {
      return;
    }
    const emptySelectionClipboard = editor.getOption(EditorOption.emptySelectionClipboard);
    if (!emptySelectionClipboard && editor.getSelection().isEmpty()) {
      return;
    }
    CopyOptions.forceCopyWithSyntaxHighlighting = true;
    editor.focus();
    logService.trace("ExecCommandCopyWithSyntaxHighlightingAction (before execCommand copy)");
    executeClipboardCopyWithWorkaround(editor, clipboardService);
    logService.trace("ExecCommandCopyWithSyntaxHighlightingAction (after execCommand copy)");
    CopyOptions.forceCopyWithSyntaxHighlighting = false;
  }
}
function executeClipboardCopyWithWorkaround(editor, clipboardService) {
  CopyOptions.electronBugWorkaroundCopyEventHasFired = false;
  editor.getContainerDomNode().ownerDocument.execCommand("copy");
  if (platform.isNative && CopyOptions.electronBugWorkaroundCopyEventHasFired === false) {
    const { dataToCopy } = generateDataToCopyAndStoreInMemory(editor._getViewModel(), void 0, browser.isFirefox);
    clipboardService.writeText(dataToCopy.text);
  }
}
function registerExecCommandImpl(target, browserCommand) {
  if (!target) {
    return;
  }
  target.addImplementation(1e4, "code-editor", (accessor, args) => {
    const logService = accessor.get(ILogService);
    const clipboardService = accessor.get(IClipboardService);
    logService.trace("registerExecCommandImpl (addImplementation code-editor for : ", browserCommand, ")");
    const focusedEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
    if (focusedEditor && focusedEditor.hasTextFocus() && focusedEditor.hasModel()) {
      const emptySelectionClipboard = focusedEditor.getOption(EditorOption.emptySelectionClipboard);
      const selection = focusedEditor.getSelection();
      if (selection && selection.isEmpty() && !emptySelectionClipboard) {
        return true;
      }
      if (focusedEditor.getOption(EditorOption.effectiveEditContext) && browserCommand === "cut") {
        logCopyCommand(focusedEditor);
        logService.trace("registerExecCommandImpl (before execCommand copy)");
        executeClipboardCopyWithWorkaround(focusedEditor, clipboardService);
        focusedEditor.trigger(void 0, Handler.Cut, void 0);
        logService.trace("registerExecCommandImpl (after execCommand copy)");
      } else {
        logCopyCommand(focusedEditor);
        logService.trace("registerExecCommandImpl (before execCommand " + browserCommand + ")");
        if (browserCommand === "copy") {
          executeClipboardCopyWithWorkaround(focusedEditor, clipboardService);
        } else {
          focusedEditor.getContainerDomNode().ownerDocument.execCommand(browserCommand);
        }
        logService.trace("registerExecCommandImpl (after execCommand " + browserCommand + ")");
      }
      return true;
    }
    return false;
  });
  target.addImplementation(0, "generic-dom", (accessor, args) => {
    const logService = accessor.get(ILogService);
    logService.trace("registerExecCommandImpl (addImplementation generic-dom for : ", browserCommand, ")");
    logService.trace("registerExecCommandImpl (before execCommand " + browserCommand + ")");
    getActiveDocument().execCommand(browserCommand);
    logService.trace("registerExecCommandImpl (after execCommand " + browserCommand + ")");
    return true;
  });
}
function logCopyCommand(editor) {
  const editContextEnabled = editor.getOption(EditorOption.effectiveEditContext);
  if (editContextEnabled) {
    const nativeEditContext = NativeEditContextRegistry.get(editor.getId());
    if (nativeEditContext) {
      nativeEditContext.handleWillCopy();
    }
  }
}
registerExecCommandImpl(CutAction, "cut");
registerExecCommandImpl(CopyAction, "copy");
if (PasteAction) {
  PasteAction.addImplementation(1e4, "code-editor", (accessor, args) => {
    const logService = accessor.get(ILogService);
    logService.trace("registerExecCommandImpl (addImplementation code-editor for : paste)");
    const codeEditorService = accessor.get(ICodeEditorService);
    const clipboardService = accessor.get(IClipboardService);
    const focusedEditor = codeEditorService.getFocusedCodeEditor();
    if (focusedEditor && focusedEditor.hasModel() && focusedEditor.hasTextFocus()) {
      const editContextEnabled = focusedEditor.getOption(EditorOption.effectiveEditContext);
      if (editContextEnabled) {
        const nativeEditContext = NativeEditContextRegistry.get(focusedEditor.getId());
        if (nativeEditContext) {
          nativeEditContext.handleWillPaste();
        }
      }
      logService.trace("registerExecCommandImpl (before triggerPaste)");
      const triggerPaste = clipboardService.triggerPaste(getActiveWindow().vscodeWindowId);
      if (triggerPaste) {
        logService.trace("registerExecCommandImpl (triggerPaste defined)");
        return triggerPaste.then(async () => {
          logService.trace("registerExecCommandImpl (after triggerPaste)");
          return CopyPasteController.get(focusedEditor)?.finishedPaste() ?? Promise.resolve();
        });
      } else {
        logService.trace("registerExecCommandImpl (triggerPaste undefined)");
      }
      if (platform.isWeb) {
        logService.trace("registerExecCommandImpl (Paste handling on web)");
        return (async () => {
          const clipboardText = await clipboardService.readText();
          if (clipboardText !== "") {
            const metadata = InMemoryClipboardMetadataManager.INSTANCE.get(clipboardText);
            let pasteOnNewLine = false;
            let multicursorText = null;
            let mode = null;
            if (metadata) {
              pasteOnNewLine = focusedEditor.getOption(EditorOption.emptySelectionClipboard) && !!metadata.isFromEmptySelection;
              multicursorText = typeof metadata.multicursorText !== "undefined" ? metadata.multicursorText : null;
              mode = metadata.mode;
            }
            logService.trace("registerExecCommandImpl (clipboardText.length : ", clipboardText.length, " id : ", metadata?.id, ")");
            focusedEditor.trigger("keyboard", Handler.Paste, {
              text: clipboardText,
              pasteOnNewLine,
              multicursorText,
              mode
            });
          }
        })();
      }
      return true;
    }
    return false;
  });
  PasteAction.addImplementation(0, "generic-dom", (accessor, args) => {
    const logService = accessor.get(ILogService);
    logService.trace("registerExecCommandImpl (addImplementation generic-dom for : paste)");
    const triggerPaste = accessor.get(IClipboardService).triggerPaste(getActiveWindow().vscodeWindowId);
    return triggerPaste ?? false;
  });
}
if (supportsCopy) {
  registerEditorAction(ExecCommandCopyWithSyntaxHighlightingAction);
}
export {
  CopyAction,
  CutAction,
  PasteAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGNsaXBib2FyZFxcYnJvd3NlclxcY2xpcGJvYXJkLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYnJvd3NlciBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvYnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBnZXRBY3RpdmVEb2N1bWVudCwgZ2V0QWN0aXZlV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1lbnVJZCwgTWVudVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBDb3B5T3B0aW9ucywgZ2VuZXJhdGVEYXRhVG9Db3B5QW5kU3RvcmVJbk1lbW9yeSwgSW5NZW1vcnlDbGlwYm9hcmRNZXRhZGF0YU1hbmFnZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NvbnRyb2xsZXIvZWRpdENvbnRleHQvY2xpcGJvYXJkVXRpbHMuanMnO1xuaW1wb3J0IHsgTmF0aXZlRWRpdENvbnRleHRSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY29udHJvbGxlci9lZGl0Q29udGV4dC9uYXRpdmUvbmF0aXZlRWRpdENvbnRleHRSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlQ29kZUVkaXRvciwgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgQ29tbWFuZCwgRWRpdG9yQWN0aW9uLCBNdWx0aUNvbW1hbmQsIHJlZ2lzdGVyRWRpdG9yQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENvcHlQYXN0ZUNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi9kcm9wT3JQYXN0ZUludG8vYnJvd3Nlci9jb3B5UGFzdGVDb250cm9sbGVyLmpzJztcblxuY29uc3QgQ0xJUEJPQVJEX0NPTlRFWFRfTUVOVV9HUk9VUCA9ICc5X2N1dGNvcHlwYXN0ZSc7XG5cbmNvbnN0IHN1cHBvcnRzQ3V0ID0gKHBsYXRmb3JtLmlzTmF0aXZlIHx8IChkb2N1bWVudC5xdWVyeUNvbW1hbmRTdXBwb3J0ZWQgJiYgZG9jdW1lbnQucXVlcnlDb21tYW5kU3VwcG9ydGVkKCdjdXQnKSkpO1xuY29uc3Qgc3VwcG9ydHNDb3B5ID0gKHBsYXRmb3JtLmlzTmF0aXZlIHx8IChkb2N1bWVudC5xdWVyeUNvbW1hbmRTdXBwb3J0ZWQgJiYgZG9jdW1lbnQucXVlcnlDb21tYW5kU3VwcG9ydGVkKCdjb3B5JykpKTtcbi8vIEZpcmVmb3ggb25seSBzdXBwb3J0cyBuYXZpZ2F0b3IuY2xpcGJvYXJkLnJlYWRUZXh0KCkgaW4gYnJvd3NlciBleHRlbnNpb25zLlxuLy8gU2VlIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9DbGlwYm9hcmQvcmVhZFRleHQjQnJvd3Nlcl9jb21wYXRpYmlsaXR5XG4vLyBXaGVuIGxvYWRpbmcgb3ZlciBodHRwLCBuYXZpZ2F0b3IuY2xpcGJvYXJkIGNhbiBiZSB1bmRlZmluZWQuIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L21vbmFjby1lZGl0b3IvaXNzdWVzLzIzMTNcbmNvbnN0IHN1cHBvcnRzUGFzdGUgPSAodHlwZW9mIG5hdmlnYXRvci5jbGlwYm9hcmQgPT09ICd1bmRlZmluZWQnIHx8IGJyb3dzZXIuaXNGaXJlZm94KSA/IGRvY3VtZW50LnF1ZXJ5Q29tbWFuZFN1cHBvcnRlZCAmJiBkb2N1bWVudC5xdWVyeUNvbW1hbmRTdXBwb3J0ZWQoJ3Bhc3RlJykgOiB0cnVlO1xuXG5mdW5jdGlvbiByZWdpc3RlckNvbW1hbmQ8VCBleHRlbmRzIENvbW1hbmQ+KGNvbW1hbmQ6IFQpOiBUIHtcblx0Y29tbWFuZC5yZWdpc3RlcigpO1xuXHRyZXR1cm4gY29tbWFuZDtcbn1cblxuZXhwb3J0IGNvbnN0IEN1dEFjdGlvbiA9IHN1cHBvcnRzQ3V0ID8gcmVnaXN0ZXJDb21tYW5kKG5ldyBNdWx0aUNvbW1hbmQoe1xuXHRpZDogJ2VkaXRvci5hY3Rpb24uY2xpcGJvYXJkQ3V0QWN0aW9uJyxcblx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdGtiT3B0czogKFxuXHRcdC8vIERvIG5vdCBiaW5kIGN1dCBrZXliaW5kaW5ncyBpbiB0aGUgYnJvd3Nlcixcblx0XHQvLyBzaW5jZSBicm93c2VycyBkbyB0aGF0IGZvciB1cyBhbmQgaXQgYXZvaWRzIHNlY3VyaXR5IHByb21wdHNcblx0XHRwbGF0Zm9ybS5pc05hdGl2ZSA/IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlYLFxuXHRcdFx0d2luOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlYLCBzZWNvbmRhcnk6IFtLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkRlbGV0ZV0gfSxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0fSA6IHVuZGVmaW5lZFxuXHQpLFxuXHRtZW51T3B0czogW3tcblx0XHRtZW51SWQ6IE1lbnVJZC5NZW51YmFyRWRpdE1lbnUsXG5cdFx0Z3JvdXA6ICcyX2NjcCcsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pQ3V0JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkN1JiZ0XCIpLFxuXHRcdG9yZGVyOiAxXG5cdH0sIHtcblx0XHRtZW51SWQ6IE1lbnVJZC5FZGl0b3JDb250ZXh0LFxuXHRcdGdyb3VwOiBDTElQQk9BUkRfQ09OVEVYVF9NRU5VX0dST1VQLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2FjdGlvbnMuY2xpcGJvYXJkLmN1dExhYmVsJywgXCJDdXRcIiksXG5cdFx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0b3JkZXI6IDEsXG5cdH0sIHtcblx0XHRtZW51SWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRncm91cDogJycsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnYWN0aW9ucy5jbGlwYm9hcmQuY3V0TGFiZWwnLCBcIkN1dFwiKSxcblx0XHRvcmRlcjogMVxuXHR9LCB7XG5cdFx0bWVudUlkOiBNZW51SWQuU2ltcGxlRWRpdG9yQ29udGV4dCxcblx0XHRncm91cDogQ0xJUEJPQVJEX0NPTlRFWFRfTUVOVV9HUk9VUCxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdhY3Rpb25zLmNsaXBib2FyZC5jdXRMYWJlbCcsIFwiQ3V0XCIpLFxuXHRcdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdG9yZGVyOiAxLFxuXHR9XVxufSkpIDogdW5kZWZpbmVkO1xuXG5leHBvcnQgY29uc3QgQ29weUFjdGlvbiA9IHN1cHBvcnRzQ29weSA/IHJlZ2lzdGVyQ29tbWFuZChuZXcgTXVsdGlDb21tYW5kKHtcblx0aWQ6ICdlZGl0b3IuYWN0aW9uLmNsaXBib2FyZENvcHlBY3Rpb24nLFxuXHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0a2JPcHRzOiAoXG5cdFx0Ly8gRG8gbm90IGJpbmQgY29weSBrZXliaW5kaW5ncyBpbiB0aGUgYnJvd3Nlcixcblx0XHQvLyBzaW5jZSBicm93c2VycyBkbyB0aGF0IGZvciB1cyBhbmQgaXQgYXZvaWRzIHNlY3VyaXR5IHByb21wdHNcblx0XHRwbGF0Zm9ybS5pc05hdGl2ZSA/IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlDLFxuXHRcdFx0d2luOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlDLCBzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuSW5zZXJ0XSB9LFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHR9IDogdW5kZWZpbmVkXG5cdCksXG5cdG1lbnVPcHRzOiBbe1xuXHRcdG1lbnVJZDogTWVudUlkLk1lbnViYXJFZGl0TWVudSxcblx0XHRncm91cDogJzJfY2NwJyxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlDb3B5JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQ29weVwiKSxcblx0XHRvcmRlcjogMlxuXHR9LCB7XG5cdFx0bWVudUlkOiBNZW51SWQuRWRpdG9yQ29udGV4dCxcblx0XHRncm91cDogQ0xJUEJPQVJEX0NPTlRFWFRfTUVOVV9HUk9VUCxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdhY3Rpb25zLmNsaXBib2FyZC5jb3B5TGFiZWwnLCBcIkNvcHlcIiksXG5cdFx0b3JkZXI6IDIsXG5cdH0sIHtcblx0XHRtZW51SWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRncm91cDogJycsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnYWN0aW9ucy5jbGlwYm9hcmQuY29weUxhYmVsJywgXCJDb3B5XCIpLFxuXHRcdG9yZGVyOiAxXG5cdH0sIHtcblx0XHRtZW51SWQ6IE1lbnVJZC5TaW1wbGVFZGl0b3JDb250ZXh0LFxuXHRcdGdyb3VwOiBDTElQQk9BUkRfQ09OVEVYVF9NRU5VX0dST1VQLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2FjdGlvbnMuY2xpcGJvYXJkLmNvcHlMYWJlbCcsIFwiQ29weVwiKSxcblx0XHRvcmRlcjogMixcblx0fV1cbn0pKSA6IHVuZGVmaW5lZDtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyRWRpdE1lbnUsIHsgc3VibWVudTogTWVudUlkLk1lbnViYXJDb3B5LCB0aXRsZTogbmxzLmxvY2FsaXplMignY29weSBhcycsIFwiQ29weSBBc1wiKSwgZ3JvdXA6ICcyX2NjcCcsIG9yZGVyOiAzIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JDb250ZXh0LCB7IHN1Ym1lbnU6IE1lbnVJZC5FZGl0b3JDb250ZXh0Q29weSwgdGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2NvcHkgYXMnLCBcIkNvcHkgQXNcIiksIGdyb3VwOiBDTElQQk9BUkRfQ09OVEVYVF9NRU5VX0dST1VQLCBvcmRlcjogMyB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yQ29udGV4dCwgeyBzdWJtZW51OiBNZW51SWQuRWRpdG9yQ29udGV4dFNoYXJlLCB0aXRsZTogbmxzLmxvY2FsaXplMignc2hhcmUnLCBcIlNoYXJlXCIpLCBncm91cDogJzExX3NoYXJlJywgb3JkZXI6IC0xLCB3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIubm90RXF1YWxzKCdyZXNvdXJjZVNjaGVtZScsICdvdXRwdXQnKSwgRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzKSB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRXhwbG9yZXJDb250ZXh0LCB7IHN1Ym1lbnU6IE1lbnVJZC5FeHBsb3JlckNvbnRleHRTaGFyZSwgdGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3NoYXJlJywgXCJTaGFyZVwiKSwgZ3JvdXA6ICcxMV9zaGFyZScsIG9yZGVyOiAtMSB9KTtcblxuZXhwb3J0IGNvbnN0IFBhc3RlQWN0aW9uID0gc3VwcG9ydHNQYXN0ZSA/IHJlZ2lzdGVyQ29tbWFuZChuZXcgTXVsdGlDb21tYW5kKHtcblx0aWQ6ICdlZGl0b3IuYWN0aW9uLmNsaXBib2FyZFBhc3RlQWN0aW9uJyxcblx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdGtiT3B0czogKFxuXHRcdC8vIERvIG5vdCBiaW5kIHBhc3RlIGtleWJpbmRpbmdzIGluIHRoZSBicm93c2VyLFxuXHRcdC8vIHNpbmNlIGJyb3dzZXJzIGRvIHRoYXQgZm9yIHVzIGFuZCBpdCBhdm9pZHMgc2VjdXJpdHkgcHJvbXB0c1xuXHRcdHBsYXRmb3JtLmlzTmF0aXZlID8ge1xuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVYsXG5cdFx0XHR3aW46IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVYsIHNlY29uZGFyeTogW0tleU1vZC5TaGlmdCB8IEtleUNvZGUuSW5zZXJ0XSB9LFxuXHRcdFx0bGludXg6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVYsIHNlY29uZGFyeTogW0tleU1vZC5TaGlmdCB8IEtleUNvZGUuSW5zZXJ0XSB9LFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHR9IDogdW5kZWZpbmVkXG5cdCksXG5cdG1lbnVPcHRzOiBbe1xuXHRcdG1lbnVJZDogTWVudUlkLk1lbnViYXJFZGl0TWVudSxcblx0XHRncm91cDogJzJfY2NwJyxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlQYXN0ZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlBhc3RlXCIpLFxuXHRcdG9yZGVyOiA0XG5cdH0sIHtcblx0XHRtZW51SWQ6IE1lbnVJZC5FZGl0b3JDb250ZXh0LFxuXHRcdGdyb3VwOiBDTElQQk9BUkRfQ09OVEVYVF9NRU5VX0dST1VQLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2FjdGlvbnMuY2xpcGJvYXJkLnBhc3RlTGFiZWwnLCBcIlBhc3RlXCIpLFxuXHRcdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdG9yZGVyOiA0LFxuXHR9LCB7XG5cdFx0bWVudUlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0Z3JvdXA6ICcnLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2FjdGlvbnMuY2xpcGJvYXJkLnBhc3RlTGFiZWwnLCBcIlBhc3RlXCIpLFxuXHRcdG9yZGVyOiAxXG5cdH0sIHtcblx0XHRtZW51SWQ6IE1lbnVJZC5TaW1wbGVFZGl0b3JDb250ZXh0LFxuXHRcdGdyb3VwOiBDTElQQk9BUkRfQ09OVEVYVF9NRU5VX0dST1VQLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2FjdGlvbnMuY2xpcGJvYXJkLnBhc3RlTGFiZWwnLCBcIlBhc3RlXCIpLFxuXHRcdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdG9yZGVyOiA0LFxuXHR9XVxufSkpIDogdW5kZWZpbmVkO1xuXG5jbGFzcyBFeGVjQ29tbWFuZENvcHlXaXRoU3ludGF4SGlnaGxpZ2h0aW5nQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uY2xpcGJvYXJkQ29weVdpdGhTeW50YXhIaWdobGlnaHRpbmdBY3Rpb24nLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2FjdGlvbnMuY2xpcGJvYXJkLmNvcHlXaXRoU3ludGF4SGlnaGxpZ2h0aW5nTGFiZWwnLCBcIkNvcHkgd2l0aCBTeW50YXggSGlnaGxpZ2h0aW5nXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogMCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBjbGlwYm9hcmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKTtcblx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdFeGVjQ29tbWFuZENvcHlXaXRoU3ludGF4SGlnaGxpZ2h0aW5nQWN0aW9uI3J1bicpO1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlbXB0eVNlbGVjdGlvbkNsaXBib2FyZCA9IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkKTtcblxuXHRcdGlmICghZW1wdHlTZWxlY3Rpb25DbGlwYm9hcmQgJiYgZWRpdG9yLmdldFNlbGVjdGlvbigpLmlzRW1wdHkoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdENvcHlPcHRpb25zLmZvcmNlQ29weVdpdGhTeW50YXhIaWdobGlnaHRpbmcgPSB0cnVlO1xuXHRcdGVkaXRvci5mb2N1cygpO1xuXHRcdGxvZ1NlcnZpY2UudHJhY2UoJ0V4ZWNDb21tYW5kQ29weVdpdGhTeW50YXhIaWdobGlnaHRpbmdBY3Rpb24gKGJlZm9yZSBleGVjQ29tbWFuZCBjb3B5KScpO1xuXHRcdGV4ZWN1dGVDbGlwYm9hcmRDb3B5V2l0aFdvcmthcm91bmQoZWRpdG9yLCBjbGlwYm9hcmRTZXJ2aWNlKTtcblx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdFeGVjQ29tbWFuZENvcHlXaXRoU3ludGF4SGlnaGxpZ2h0aW5nQWN0aW9uIChhZnRlciBleGVjQ29tbWFuZCBjb3B5KScpO1xuXHRcdENvcHlPcHRpb25zLmZvcmNlQ29weVdpdGhTeW50YXhIaWdobGlnaHRpbmcgPSBmYWxzZTtcblx0fVxufVxuXG5mdW5jdGlvbiBleGVjdXRlQ2xpcGJvYXJkQ29weVdpdGhXb3JrYXJvdW5kKGVkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IsIGNsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlKSB7XG5cdC8vICEhISEhXG5cdC8vIFRoaXMgaXMgYSB3b3JrYXJvdW5kIGZvciB3aGF0IHdlIHRoaW5rIGlzIGFuIEVsZWN0cm9uIGJ1ZyB3aGVyZVxuXHQvLyBleGVjQ29tbWFuZCgnY29weScpIGRvZXMgbm90IGFsd2F5cyB3b3JrIChpdCBkb2VzIG5vdCBmaXJlIGEgY2xpcGJvYXJkIGV2ZW50KVxuXHQvLyBXZSB3aWxsIHVzZSB0aGlzIGFzIGEgc2lnbmFsIHRoYXQgd2UgaGF2ZSBleGVjdXRlZCBhIGNvcHkgY29tbWFuZFxuXHQvLyAhISEhIVxuXHRDb3B5T3B0aW9ucy5lbGVjdHJvbkJ1Z1dvcmthcm91bmRDb3B5RXZlbnRIYXNGaXJlZCA9IGZhbHNlO1xuXHRlZGl0b3IuZ2V0Q29udGFpbmVyRG9tTm9kZSgpLm93bmVyRG9jdW1lbnQuZXhlY0NvbW1hbmQoJ2NvcHknKTtcblx0aWYgKHBsYXRmb3JtLmlzTmF0aXZlICYmIENvcHlPcHRpb25zLmVsZWN0cm9uQnVnV29ya2Fyb3VuZENvcHlFdmVudEhhc0ZpcmVkID09PSBmYWxzZSkge1xuXHRcdC8vIFdlIGhhdmUgZW5jb3VudGVyZWQgdGhlIEVsZWN0cm9uIGJ1ZyFcblx0XHQvLyBBcyBhIHdvcmthcm91bmQsIHdlIHdpbGwgd3JpdGUgKG9ubHkgdGhlIHBsYWludGV4dCBkYXRhKSB0byB0aGUgY2xpcGJvYXJkIGluIGEgZGlmZmVyZW50IHdheVxuXHRcdC8vIFdlIHdpbGwgdXNlIHRoZSBjbGlwYm9hcmQgc2VydmljZSAod2hpY2ggaW4gdGhlIG5hdGl2ZSBjYXNlIHdpbGwgZ28gdG8gZWxlY3Ryb24ncyBjbGlwYm9hcmQgQVBJKVxuXHRcdGNvbnN0IHsgZGF0YVRvQ29weSB9ID0gZ2VuZXJhdGVEYXRhVG9Db3B5QW5kU3RvcmVJbk1lbW9yeShlZGl0b3IuX2dldFZpZXdNb2RlbCgpLCB1bmRlZmluZWQsIGJyb3dzZXIuaXNGaXJlZm94KTtcblx0XHRjbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChkYXRhVG9Db3B5LnRleHQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlZ2lzdGVyRXhlY0NvbW1hbmRJbXBsKHRhcmdldDogTXVsdGlDb21tYW5kIHwgdW5kZWZpbmVkLCBicm93c2VyQ29tbWFuZDogJ2N1dCcgfCAnY29weScpOiB2b2lkIHtcblx0aWYgKCF0YXJnZXQpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyAxLiBoYW5kbGUgY2FzZSB3aGVuIGZvY3VzIGlzIGluIGVkaXRvci5cblx0dGFyZ2V0LmFkZEltcGxlbWVudGF0aW9uKDEwMDAwLCAnY29kZS1lZGl0b3InLCAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M6IHVua25vd24pID0+IHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBjbGlwYm9hcmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKTtcblx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdyZWdpc3RlckV4ZWNDb21tYW5kSW1wbCAoYWRkSW1wbGVtZW50YXRpb24gY29kZS1lZGl0b3IgZm9yIDogJywgYnJvd3NlckNvbW1hbmQsICcpJyk7XG5cdFx0Ly8gT25seSBpZiBlZGl0b3IgdGV4dCBmb2N1cyAoaS5lLiBub3QgaWYgZWRpdG9yIGhhcyB3aWRnZXQgZm9jdXMpLlxuXHRcdGNvbnN0IGZvY3VzZWRFZGl0b3IgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKS5nZXRGb2N1c2VkQ29kZUVkaXRvcigpO1xuXHRcdGlmIChmb2N1c2VkRWRpdG9yICYmIGZvY3VzZWRFZGl0b3IuaGFzVGV4dEZvY3VzKCkgJiYgZm9jdXNlZEVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHQvLyBEbyBub3QgZXhlY3V0ZSBpZiB0aGVyZSBpcyBubyBzZWxlY3Rpb24gYW5kIGVtcHR5IHNlbGVjdGlvbiBjbGlwYm9hcmQgaXMgb2ZmXG5cdFx0XHRjb25zdCBlbXB0eVNlbGVjdGlvbkNsaXBib2FyZCA9IGZvY3VzZWRFZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5lbXB0eVNlbGVjdGlvbkNsaXBib2FyZCk7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBmb2N1c2VkRWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdFx0aWYgKHNlbGVjdGlvbiAmJiBzZWxlY3Rpb24uaXNFbXB0eSgpICYmICFlbXB0eVNlbGVjdGlvbkNsaXBib2FyZCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdC8vIFRPRE8gdGhpcyBpcyB2ZXJ5IHVnbHkuIFRoZSBlbnRpcmUgY29weS9wYXN0ZS9jdXQgc3lzdGVtIG5lZWRzIGEgY29tcGxldGUgcmVmYWN0b3JpbmcuXG5cdFx0XHRpZiAoZm9jdXNlZEVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmVmZmVjdGl2ZUVkaXRDb250ZXh0KSAmJiBicm93c2VyQ29tbWFuZCA9PT0gJ2N1dCcpIHtcblx0XHRcdFx0bG9nQ29weUNvbW1hbmQoZm9jdXNlZEVkaXRvcik7XG5cdFx0XHRcdC8vIGV4ZWNDb21tYW5kKGNvcHkpIHdvcmtzIGZvciBlZGl0IGNvbnRleHQsIGJ1dCBub3QgZXhlY0NvbW1hbmQoY3V0KS5cblx0XHRcdFx0bG9nU2VydmljZS50cmFjZSgncmVnaXN0ZXJFeGVjQ29tbWFuZEltcGwgKGJlZm9yZSBleGVjQ29tbWFuZCBjb3B5KScpO1xuXHRcdFx0XHRleGVjdXRlQ2xpcGJvYXJkQ29weVdpdGhXb3JrYXJvdW5kKGZvY3VzZWRFZGl0b3IsIGNsaXBib2FyZFNlcnZpY2UpO1xuXHRcdFx0XHRmb2N1c2VkRWRpdG9yLnRyaWdnZXIodW5kZWZpbmVkLCBIYW5kbGVyLkN1dCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0bG9nU2VydmljZS50cmFjZSgncmVnaXN0ZXJFeGVjQ29tbWFuZEltcGwgKGFmdGVyIGV4ZWNDb21tYW5kIGNvcHkpJyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsb2dDb3B5Q29tbWFuZChmb2N1c2VkRWRpdG9yKTtcblx0XHRcdFx0bG9nU2VydmljZS50cmFjZSgncmVnaXN0ZXJFeGVjQ29tbWFuZEltcGwgKGJlZm9yZSBleGVjQ29tbWFuZCAnICsgYnJvd3NlckNvbW1hbmQgKyAnKScpO1xuXHRcdFx0XHRpZiAoYnJvd3NlckNvbW1hbmQgPT09ICdjb3B5Jykge1xuXHRcdFx0XHRcdGV4ZWN1dGVDbGlwYm9hcmRDb3B5V2l0aFdvcmthcm91bmQoZm9jdXNlZEVkaXRvciwgY2xpcGJvYXJkU2VydmljZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Zm9jdXNlZEVkaXRvci5nZXRDb250YWluZXJEb21Ob2RlKCkub3duZXJEb2N1bWVudC5leGVjQ29tbWFuZChicm93c2VyQ29tbWFuZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bG9nU2VydmljZS50cmFjZSgncmVnaXN0ZXJFeGVjQ29tbWFuZEltcGwgKGFmdGVyIGV4ZWNDb21tYW5kICcgKyBicm93c2VyQ29tbWFuZCArICcpJyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9KTtcblxuXHQvLyAyLiAoZGVmYXVsdCkgaGFuZGxlIGNhc2Ugd2hlbiBmb2N1cyBpcyBzb21ld2hlcmUgZWxzZS5cblx0dGFyZ2V0LmFkZEltcGxlbWVudGF0aW9uKDAsICdnZW5lcmljLWRvbScsIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJnczogdW5rbm93bikgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRcdGxvZ1NlcnZpY2UudHJhY2UoJ3JlZ2lzdGVyRXhlY0NvbW1hbmRJbXBsIChhZGRJbXBsZW1lbnRhdGlvbiBnZW5lcmljLWRvbSBmb3IgOiAnLCBicm93c2VyQ29tbWFuZCwgJyknKTtcblx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdyZWdpc3RlckV4ZWNDb21tYW5kSW1wbCAoYmVmb3JlIGV4ZWNDb21tYW5kICcgKyBicm93c2VyQ29tbWFuZCArICcpJyk7XG5cdFx0Z2V0QWN0aXZlRG9jdW1lbnQoKS5leGVjQ29tbWFuZChicm93c2VyQ29tbWFuZCk7XG5cdFx0bG9nU2VydmljZS50cmFjZSgncmVnaXN0ZXJFeGVjQ29tbWFuZEltcGwgKGFmdGVyIGV4ZWNDb21tYW5kICcgKyBicm93c2VyQ29tbWFuZCArICcpJyk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBsb2dDb3B5Q29tbWFuZChlZGl0b3I6IElDb2RlRWRpdG9yKSB7XG5cdGNvbnN0IGVkaXRDb250ZXh0RW5hYmxlZCA9IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmVmZmVjdGl2ZUVkaXRDb250ZXh0KTtcblx0aWYgKGVkaXRDb250ZXh0RW5hYmxlZCkge1xuXHRcdGNvbnN0IG5hdGl2ZUVkaXRDb250ZXh0ID0gTmF0aXZlRWRpdENvbnRleHRSZWdpc3RyeS5nZXQoZWRpdG9yLmdldElkKCkpO1xuXHRcdGlmIChuYXRpdmVFZGl0Q29udGV4dCkge1xuXHRcdFx0bmF0aXZlRWRpdENvbnRleHQuaGFuZGxlV2lsbENvcHkoKTtcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJFeGVjQ29tbWFuZEltcGwoQ3V0QWN0aW9uLCAnY3V0Jyk7XG5yZWdpc3RlckV4ZWNDb21tYW5kSW1wbChDb3B5QWN0aW9uLCAnY29weScpO1xuXG5pZiAoUGFzdGVBY3Rpb24pIHtcblx0Ly8gMS4gUGFzdGU6IGhhbmRsZSBjYXNlIHdoZW4gZm9jdXMgaXMgaW4gZWRpdG9yLlxuXHRQYXN0ZUFjdGlvbi5hZGRJbXBsZW1lbnRhdGlvbigxMDAwMCwgJ2NvZGUtZWRpdG9yJywgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzOiB1bmtub3duKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cdFx0bG9nU2VydmljZS50cmFjZSgncmVnaXN0ZXJFeGVjQ29tbWFuZEltcGwgKGFkZEltcGxlbWVudGF0aW9uIGNvZGUtZWRpdG9yIGZvciA6IHBhc3RlKScpO1xuXHRcdGNvbnN0IGNvZGVFZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb2RlRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cblx0XHQvLyBPbmx5IGlmIGVkaXRvciB0ZXh0IGZvY3VzIChpLmUuIG5vdCBpZiBlZGl0b3IgaGFzIHdpZGdldCBmb2N1cykuXG5cdFx0Y29uc3QgZm9jdXNlZEVkaXRvciA9IGNvZGVFZGl0b3JTZXJ2aWNlLmdldEZvY3VzZWRDb2RlRWRpdG9yKCk7XG5cdFx0aWYgKGZvY3VzZWRFZGl0b3IgJiYgZm9jdXNlZEVkaXRvci5oYXNNb2RlbCgpICYmIGZvY3VzZWRFZGl0b3IuaGFzVGV4dEZvY3VzKCkpIHtcblx0XHRcdC8vIGV4ZWNDb21tYW5kKHBhc3RlKSBkb2VzIG5vdCB3b3JrIHdpdGggZWRpdCBjb250ZXh0XG5cdFx0XHRjb25zdCBlZGl0Q29udGV4dEVuYWJsZWQgPSBmb2N1c2VkRWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZWZmZWN0aXZlRWRpdENvbnRleHQpO1xuXHRcdFx0aWYgKGVkaXRDb250ZXh0RW5hYmxlZCkge1xuXHRcdFx0XHRjb25zdCBuYXRpdmVFZGl0Q29udGV4dCA9IE5hdGl2ZUVkaXRDb250ZXh0UmVnaXN0cnkuZ2V0KGZvY3VzZWRFZGl0b3IuZ2V0SWQoKSk7XG5cdFx0XHRcdGlmIChuYXRpdmVFZGl0Q29udGV4dCkge1xuXHRcdFx0XHRcdG5hdGl2ZUVkaXRDb250ZXh0LmhhbmRsZVdpbGxQYXN0ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGxvZ1NlcnZpY2UudHJhY2UoJ3JlZ2lzdGVyRXhlY0NvbW1hbmRJbXBsIChiZWZvcmUgdHJpZ2dlclBhc3RlKScpO1xuXHRcdFx0Y29uc3QgdHJpZ2dlclBhc3RlID0gY2xpcGJvYXJkU2VydmljZS50cmlnZ2VyUGFzdGUoZ2V0QWN0aXZlV2luZG93KCkudnNjb2RlV2luZG93SWQpO1xuXHRcdFx0aWYgKHRyaWdnZXJQYXN0ZSkge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdyZWdpc3RlckV4ZWNDb21tYW5kSW1wbCAodHJpZ2dlclBhc3RlIGRlZmluZWQpJyk7XG5cdFx0XHRcdHJldHVybiB0cmlnZ2VyUGFzdGUudGhlbihhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0bG9nU2VydmljZS50cmFjZSgncmVnaXN0ZXJFeGVjQ29tbWFuZEltcGwgKGFmdGVyIHRyaWdnZXJQYXN0ZSknKTtcblx0XHRcdFx0XHRyZXR1cm4gQ29weVBhc3RlQ29udHJvbGxlci5nZXQoZm9jdXNlZEVkaXRvcik/LmZpbmlzaGVkUGFzdGUoKSA/PyBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdyZWdpc3RlckV4ZWNDb21tYW5kSW1wbCAodHJpZ2dlclBhc3RlIHVuZGVmaW5lZCknKTtcblx0XHRcdH1cblx0XHRcdGlmIChwbGF0Zm9ybS5pc1dlYikge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdyZWdpc3RlckV4ZWNDb21tYW5kSW1wbCAoUGFzdGUgaGFuZGxpbmcgb24gd2ViKScpO1xuXHRcdFx0XHQvLyBVc2UgdGhlIGNsaXBib2FyZCBzZXJ2aWNlIGlmIGRvY3VtZW50LmV4ZWNDb21tYW5kKCdwYXN0ZScpIHdhcyBub3Qgc3VjY2Vzc2Z1bFxuXHRcdFx0XHRyZXR1cm4gKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBjbGlwYm9hcmRUZXh0ID0gYXdhaXQgY2xpcGJvYXJkU2VydmljZS5yZWFkVGV4dCgpO1xuXHRcdFx0XHRcdGlmIChjbGlwYm9hcmRUZXh0ICE9PSAnJykge1xuXHRcdFx0XHRcdFx0Y29uc3QgbWV0YWRhdGEgPSBJbk1lbW9yeUNsaXBib2FyZE1ldGFkYXRhTWFuYWdlci5JTlNUQU5DRS5nZXQoY2xpcGJvYXJkVGV4dCk7XG5cdFx0XHRcdFx0XHRsZXQgcGFzdGVPbk5ld0xpbmUgPSBmYWxzZTtcblx0XHRcdFx0XHRcdGxldCBtdWx0aWN1cnNvclRleHQ6IHN0cmluZ1tdIHwgbnVsbCA9IG51bGw7XG5cdFx0XHRcdFx0XHRsZXQgbW9kZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdFx0XHRcdFx0XHRpZiAobWV0YWRhdGEpIHtcblx0XHRcdFx0XHRcdFx0cGFzdGVPbk5ld0xpbmUgPSAoZm9jdXNlZEVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkKSAmJiAhIW1ldGFkYXRhLmlzRnJvbUVtcHR5U2VsZWN0aW9uKTtcblx0XHRcdFx0XHRcdFx0bXVsdGljdXJzb3JUZXh0ID0gKHR5cGVvZiBtZXRhZGF0YS5tdWx0aWN1cnNvclRleHQgIT09ICd1bmRlZmluZWQnID8gbWV0YWRhdGEubXVsdGljdXJzb3JUZXh0IDogbnVsbCk7XG5cdFx0XHRcdFx0XHRcdG1vZGUgPSBtZXRhZGF0YS5tb2RlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0bG9nU2VydmljZS50cmFjZSgncmVnaXN0ZXJFeGVjQ29tbWFuZEltcGwgKGNsaXBib2FyZFRleHQubGVuZ3RoIDogJywgY2xpcGJvYXJkVGV4dC5sZW5ndGgsICcgaWQgOiAnLCBtZXRhZGF0YT8uaWQsICcpJyk7XG5cdFx0XHRcdFx0XHRmb2N1c2VkRWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5QYXN0ZSwge1xuXHRcdFx0XHRcdFx0XHR0ZXh0OiBjbGlwYm9hcmRUZXh0LFxuXHRcdFx0XHRcdFx0XHRwYXN0ZU9uTmV3TGluZSxcblx0XHRcdFx0XHRcdFx0bXVsdGljdXJzb3JUZXh0LFxuXHRcdFx0XHRcdFx0XHRtb2RlXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9KTtcblxuXHQvLyAyLiBQYXN0ZTogKGRlZmF1bHQpIGhhbmRsZSBjYXNlIHdoZW4gZm9jdXMgaXMgc29tZXdoZXJlIGVsc2UuXG5cdFBhc3RlQWN0aW9uLmFkZEltcGxlbWVudGF0aW9uKDAsICdnZW5lcmljLWRvbScsIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJnczogdW5rbm93bikgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRcdGxvZ1NlcnZpY2UudHJhY2UoJ3JlZ2lzdGVyRXhlY0NvbW1hbmRJbXBsIChhZGRJbXBsZW1lbnRhdGlvbiBnZW5lcmljLWRvbSBmb3IgOiBwYXN0ZSknKTtcblx0XHRjb25zdCB0cmlnZ2VyUGFzdGUgPSBhY2Nlc3Nvci5nZXQoSUNsaXBib2FyZFNlcnZpY2UpLnRyaWdnZXJQYXN0ZShnZXRBY3RpdmVXaW5kb3coKS52c2NvZGVXaW5kb3dJZCk7XG5cdFx0cmV0dXJuIHRyaWdnZXJQYXN0ZSA/PyBmYWxzZTtcblx0fSk7XG59XG5cbmlmIChzdXBwb3J0c0NvcHkpIHtcblx0cmVnaXN0ZXJFZGl0b3JBY3Rpb24oRXhlY0NvbW1hbmRDb3B5V2l0aFN5bnRheEhpZ2hsaWdodGluZ0FjdGlvbik7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
