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
import { isKeyboardEvent, isMouseEvent, isPointerEvent, getActiveWindow } from "../../../../base/browser/dom.js";
import { Action } from "../../../../base/common/actions.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Schemas } from "../../../../base/common/network.js";
import { isAbsolute } from "../../../../base/common/path.js";
import { isWindows } from "../../../../base/common/platform.js";
import { dirname } from "../../../../base/common/resources.js";
import { hasKey, isObject, isString } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { EndOfLinePreference } from "../../../../editor/common/model.js";
import { getIconClasses } from "../../../../editor/common/services/getIconClasses.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { localize, localize2 } from "../../../../nls.js";
import { AccessibleViewProviderId } from "../../../../platform/accessibility/browser/accessibleView.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../platform/accessibility/common/accessibility.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { FileKind } from "../../../../platform/files/common/files.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IListService } from "../../../../platform/list/browser/listService.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { TerminalCapability } from "../../../../platform/terminal/common/capabilities/capabilities.js";
import { TerminalExitReason, TerminalLocation, TerminalSettingId } from "../../../../platform/terminal/common/terminal.js";
import { createProfileSchemaEnums } from "../../../../platform/terminal/common/terminalProfiles.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from "../../../browser/actions/workspaceCommands.js";
import { CLOSE_EDITOR_COMMAND_ID } from "../../../browser/parts/editor/editorCommands.js";
import { IConfigurationResolverService } from "../../../services/configurationResolver/common/configurationResolver.js";
import { ConfigurationResolverExpression } from "../../../services/configurationResolver/common/configurationResolverExpression.js";
import { editorGroupToColumn } from "../../../services/editor/common/editorGroupColumn.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { accessibleViewCurrentProviderId, accessibleViewIsShown, accessibleViewOnLastLine } from "../../accessibility/browser/accessibilityConfiguration.js";
import { ITerminalProfileResolverService, ITerminalProfileService, TERMINAL_VIEW_ID, TerminalCommandId } from "../common/terminal.js";
import { TerminalContextKeys } from "../common/terminalContextKey.js";
import { terminalStrings } from "../common/terminalStrings.js";
import { Direction, ITerminalConfigurationService, ITerminalEditorService, ITerminalEditingService, ITerminalGroupService, ITerminalInstanceService, ITerminalService } from "./terminal.js";
import { isAuxiliaryWindow } from "../../../../base/browser/window.js";
import { InstanceContext } from "./terminalContextMenu.js";
import { getColorClass, getIconId, getUriClasses } from "./terminalIcon.js";
import { killTerminalIcon, newTerminalIcon } from "./terminalIcons.js";
import { TerminalTabList } from "./terminalTabsList.js";
import { ResourceContextKey } from "../../../common/contextkeys.js";
import { SeparatorSelectOption } from "../../../../base/browser/ui/selectBox/selectBox.js";
const switchTerminalShowTabsTitle = localize("showTerminalTabs", "Show Tabs");
const category = terminalStrings.actionCategory;
const sharedWhenClause = (() => {
  const terminalAvailable = ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated);
  return {
    terminalAvailable,
    terminalAvailable_and_opened: ContextKeyExpr.and(terminalAvailable, TerminalContextKeys.isOpen),
    terminalAvailable_and_editorActive: ContextKeyExpr.and(terminalAvailable, TerminalContextKeys.terminalEditorActive),
    terminalAvailable_and_singularSelection: ContextKeyExpr.and(terminalAvailable, TerminalContextKeys.tabsSingularSelection),
    focusInAny_and_normalBuffer: ContextKeyExpr.and(TerminalContextKeys.focusInAny, TerminalContextKeys.altBufferActive.negate())
  };
})();
async function getCwdForSplit(instance, folders, commandService, configService) {
  switch (configService.config.splitCwd) {
    case "workspaceRoot":
      if (folders !== void 0 && commandService !== void 0) {
        if (folders.length === 1) {
          return folders[0].uri;
        } else if (folders.length > 1) {
          const options = {
            placeHolder: localize("workbench.action.terminal.newWorkspacePlaceholder", "Select current working directory for new terminal")
          };
          const workspace = await commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID, [options]);
          if (!workspace) {
            return void 0;
          }
          return Promise.resolve(workspace.uri);
        }
      }
      return "";
    case "initial":
      return instance.getInitialCwd();
    case "inherited":
      return instance.getSpeculativeCwd();
  }
}
let TerminalLaunchHelpAction = class extends Action {
  constructor(_openerService) {
    super("workbench.action.terminal.launchHelp", localize("terminalLaunchHelp", "Open Help"));
    this._openerService = _openerService;
  }
  async run() {
    this._openerService.open("https://aka.ms/vscode-troubleshoot-terminal-launch");
  }
};
TerminalLaunchHelpAction = __decorateClass([
  __decorateParam(0, IOpenerService)
], TerminalLaunchHelpAction);
function registerTerminalAction(options) {
  options.f1 = options.f1 ?? true;
  options.category = options.category ?? category;
  options.precondition = options.precondition ?? TerminalContextKeys.processSupported;
  const runFunc = options.run;
  const strictOptions = options;
  delete strictOptions["run"];
  return registerAction2(class extends Action2 {
    constructor() {
      super(strictOptions);
    }
    run(accessor, args, args2) {
      return runFunc(getTerminalServices(accessor), accessor, args, args2);
    }
  });
}
function parseActionArgs(args) {
  if (Array.isArray(args)) {
    if (args.every((e) => e instanceof InstanceContext)) {
      return args;
    }
  } else if (args instanceof InstanceContext) {
    return [args];
  }
  return void 0;
}
function registerContextualInstanceAction(options) {
  const originalRun = options.run;
  return registerTerminalAction({
    ...options,
    run: async (c, accessor, focusedInstanceArgs, allInstanceArgs) => {
      let instances = getSelectedViewInstances2(accessor, allInstanceArgs);
      if (!instances) {
        const activeInstance = (options.activeInstanceType === "view" ? c.groupService : options.activeInstanceType === "editor" ? c.editorService : c.service).activeInstance;
        if (!activeInstance) {
          return;
        }
        instances = [activeInstance];
      }
      const results = [];
      for (const instance of instances) {
        results.push(originalRun(instance, c, accessor, focusedInstanceArgs));
      }
      await Promise.all(results);
      if (options.runAfter) {
        options.runAfter(instances, c, accessor, focusedInstanceArgs);
      }
    }
  });
}
function registerActiveInstanceAction(options) {
  const originalRun = options.run;
  return registerTerminalAction({
    ...options,
    run: (c, accessor, args) => {
      const activeInstance = c.service.activeInstance;
      if (activeInstance) {
        return originalRun(activeInstance, c, accessor, args);
      }
    }
  });
}
function registerActiveXtermAction(options) {
  const originalRun = options.run;
  return registerTerminalAction({
    ...options,
    run: (c, accessor, args) => {
      const activeDetached = Iterable.find(c.service.detachedInstances, (d) => d.xterm.isFocused);
      if (activeDetached) {
        return originalRun(activeDetached.xterm, accessor, activeDetached, args);
      }
      const activeInstance = c.service.activeInstance;
      if (activeInstance?.xterm) {
        return originalRun(activeInstance.xterm, accessor, activeInstance, args);
      }
    }
  });
}
function getTerminalServices(accessor) {
  return {
    service: accessor.get(ITerminalService),
    configService: accessor.get(ITerminalConfigurationService),
    groupService: accessor.get(ITerminalGroupService),
    instanceService: accessor.get(ITerminalInstanceService),
    editorService: accessor.get(ITerminalEditorService),
    editingService: accessor.get(ITerminalEditingService),
    profileService: accessor.get(ITerminalProfileService),
    profileResolverService: accessor.get(ITerminalProfileResolverService)
  };
}
function registerTerminalActions() {
  registerTerminalAction({
    id: TerminalCommandId.NewInActiveWorkspace,
    title: localize2("workbench.action.terminal.newInActiveWorkspace", "Create New Terminal (In Active Workspace)"),
    run: async (c) => {
      if (c.service.isProcessSupportRegistered) {
        const instance = await c.service.createTerminal({ location: c.configService.defaultLocation });
        if (!instance) {
          return;
        }
        c.service.setActiveInstance(instance);
        await focusActiveTerminal(instance, c);
      }
    }
  });
  refreshTerminalActions([]);
  registerTerminalAction({
    id: TerminalCommandId.CreateTerminalEditor,
    title: localize2("workbench.action.terminal.createTerminalEditor", "Create New Terminal in Editor Area"),
    run: async (c, _, args) => {
      function isCreateTerminalOptions(obj) {
        return isObject(obj) && "location" in obj;
      }
      const options = isCreateTerminalOptions(args) ? args : { location: { viewColumn: ACTIVE_GROUP } };
      const instance = await c.service.createTerminal(options);
      await instance.focusWhenReady();
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.CreateTerminalEditorSameGroup,
    title: localize2("workbench.action.terminal.createTerminalEditor", "Create New Terminal in Editor Area"),
    f1: false,
    run: async (c, accessor, args) => {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      const instance = await c.service.createTerminal({
        location: {
          viewColumn: editorGroupToColumn(editorGroupsService, editorGroupsService.activeGroup)
        }
      });
      await instance.focusWhenReady();
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.CreateTerminalEditorSide,
    title: localize2("workbench.action.terminal.createTerminalEditorSide", "Create New Terminal in Editor Area to the Side"),
    run: async (c) => {
      const instance = await c.service.createTerminal({
        location: { viewColumn: SIDE_GROUP }
      });
      await instance.focusWhenReady();
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.NewInNewWindow,
    title: terminalStrings.newInNewWindow,
    precondition: sharedWhenClause.terminalAvailable,
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.Backquote,
      mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyMod.Alt | KeyCode.Backquote },
      weight: KeybindingWeight.WorkbenchContrib
    },
    run: async (c) => {
      const instance = await c.service.createTerminal({
        location: {
          viewColumn: AUX_WINDOW_GROUP,
          auxiliary: { compact: true }
        }
      });
      await instance.focusWhenReady();
    }
  });
  registerContextualInstanceAction({
    id: TerminalCommandId.MoveToEditor,
    title: terminalStrings.moveToEditor,
    precondition: sharedWhenClause.terminalAvailable_and_opened,
    activeInstanceType: "view",
    run: (instance, c) => c.service.moveToEditor(instance),
    runAfter: (instances) => instances.at(-1)?.focus()
  });
  registerContextualInstanceAction({
    id: TerminalCommandId.MoveIntoNewWindow,
    title: terminalStrings.moveIntoNewWindow,
    precondition: sharedWhenClause.terminalAvailable_and_opened,
    run: (instance, c) => c.service.moveIntoNewEditor(instance),
    runAfter: (instances) => instances.at(-1)?.focus()
  });
  registerTerminalAction({
    id: TerminalCommandId.MoveToTerminalPanel,
    title: terminalStrings.moveToTerminalPanel,
    precondition: sharedWhenClause.terminalAvailable_and_editorActive,
    run: (c, _, args) => {
      const source = toOptionalUri(args) ?? c.editorService.activeInstance;
      if (source) {
        c.service.moveToTerminalView(source);
      }
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.FocusPreviousPane,
    title: localize2("workbench.action.terminal.focusPreviousPane", "Focus Previous Terminal in Terminal Group"),
    keybinding: {
      primary: KeyMod.Alt | KeyCode.LeftArrow,
      secondary: [KeyMod.Alt | KeyCode.UpArrow],
      mac: {
        primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.LeftArrow,
        secondary: [KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.UpArrow]
      },
      when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.splitTerminalActive),
      // Should win over send sequence commands https://github.com/microsoft/vscode/issues/259326
      weight: KeybindingWeight.WorkbenchContrib + 1
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: async (c) => {
      c.groupService.activeGroup?.focusPreviousPane();
      await c.groupService.showPanel(true);
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.FocusNextPane,
    title: localize2("workbench.action.terminal.focusNextPane", "Focus Next Terminal in Terminal Group"),
    keybinding: {
      primary: KeyMod.Alt | KeyCode.RightArrow,
      secondary: [KeyMod.Alt | KeyCode.DownArrow],
      mac: {
        primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.RightArrow,
        secondary: [KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.DownArrow]
      },
      when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.splitTerminalActive),
      // Should win over send sequence commands https://github.com/microsoft/vscode/issues/259326
      weight: KeybindingWeight.WorkbenchContrib + 1
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: async (c) => {
      c.groupService.activeGroup?.focusNextPane();
      await c.groupService.showPanel(true);
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.ResizePaneLeft,
    title: localize2("workbench.action.terminal.resizePaneLeft", "Resize Terminal Left"),
    keybinding: {
      linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow },
      mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.LeftArrow },
      when: TerminalContextKeys.focus,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (c) => c.groupService.activeGroup?.resizePane(Direction.Left)
  });
  registerTerminalAction({
    id: TerminalCommandId.ResizePaneRight,
    title: localize2("workbench.action.terminal.resizePaneRight", "Resize Terminal Right"),
    keybinding: {
      linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow },
      mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.RightArrow },
      when: TerminalContextKeys.focus,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (c) => c.groupService.activeGroup?.resizePane(Direction.Right)
  });
  registerTerminalAction({
    id: TerminalCommandId.ResizePaneUp,
    title: localize2("workbench.action.terminal.resizePaneUp", "Resize Terminal Up"),
    keybinding: {
      mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.UpArrow },
      when: TerminalContextKeys.focus,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (c) => c.groupService.activeGroup?.resizePane(Direction.Up)
  });
  registerTerminalAction({
    id: TerminalCommandId.ResizePaneDown,
    title: localize2("workbench.action.terminal.resizePaneDown", "Resize Terminal Down"),
    keybinding: {
      mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.DownArrow },
      when: TerminalContextKeys.focus,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (c) => c.groupService.activeGroup?.resizePane(Direction.Down)
  });
  registerTerminalAction({
    id: TerminalCommandId.Focus,
    title: terminalStrings.focus,
    keybinding: {
      when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, accessibleViewOnLastLine, accessibleViewCurrentProviderId.isEqualTo(AccessibleViewProviderId.Terminal)),
      primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: async (c) => {
      const instance = c.service.activeInstance || await c.service.createTerminal({ location: TerminalLocation.Panel });
      if (!instance) {
        return;
      }
      c.service.setActiveInstance(instance);
      await focusActiveTerminal(instance, c);
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.FocusTabs,
    title: localize2("workbench.action.terminal.focus.tabsView", "Focus Terminal Tabs View"),
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backslash,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.or(TerminalContextKeys.tabsFocus, TerminalContextKeys.focus)
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (c) => c.groupService.focusTabs()
  });
  registerTerminalAction({
    id: TerminalCommandId.FocusNext,
    title: localize2("workbench.action.terminal.focusNext", "Focus Next Terminal Group"),
    precondition: sharedWhenClause.terminalAvailable,
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyCode.PageDown,
      mac: {
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketRight
      },
      when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.editorFocus.negate()),
      weight: KeybindingWeight.WorkbenchContrib
    },
    run: async (c) => {
      c.groupService.setActiveGroupToNext();
      await c.groupService.showPanel(true);
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.FocusPrevious,
    title: localize2("workbench.action.terminal.focusPrevious", "Focus Previous Terminal Group"),
    precondition: sharedWhenClause.terminalAvailable,
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyCode.PageUp,
      mac: {
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketLeft
      },
      when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.editorFocus.negate()),
      weight: KeybindingWeight.WorkbenchContrib
    },
    run: async (c) => {
      c.groupService.setActiveGroupToPrevious();
      await c.groupService.showPanel(true);
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.RunSelectedText,
    title: localize2("workbench.action.terminal.runSelectedText", "Run Selected Text In Active Terminal"),
    run: async (c, accessor) => {
      const codeEditorService = accessor.get(ICodeEditorService);
      const editor = codeEditorService.getActiveCodeEditor();
      if (!editor || !editor.hasModel()) {
        return;
      }
      const instance = await c.service.getActiveOrCreateInstance({ acceptsInput: true });
      const selection = editor.getSelection();
      let text;
      if (selection.isEmpty()) {
        text = editor.getModel().getLineContent(selection.selectionStartLineNumber).trim();
      } else {
        const endOfLinePreference = isWindows ? EndOfLinePreference.LF : EndOfLinePreference.CRLF;
        text = editor.getModel().getValueInRange(selection, endOfLinePreference);
      }
      instance.sendText(text, true, true);
      await c.service.revealActiveTerminal(true);
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.RunActiveFile,
    title: localize2("workbench.action.terminal.runActiveFile", "Run Active File In Active Terminal"),
    precondition: sharedWhenClause.terminalAvailable,
    run: async (c, accessor) => {
      const codeEditorService = accessor.get(ICodeEditorService);
      const notificationService = accessor.get(INotificationService);
      const workbenchEnvironmentService = accessor.get(IWorkbenchEnvironmentService);
      const editor = codeEditorService.getActiveCodeEditor();
      if (!editor || !editor.hasModel()) {
        return;
      }
      const instance = await c.service.getActiveOrCreateInstance({ acceptsInput: true });
      const isRemote = instance ? instance.hasRemoteAuthority : workbenchEnvironmentService.remoteAuthority ? true : false;
      const uri = editor.getModel().uri;
      if (!isRemote && uri.scheme !== Schemas.file && uri.scheme !== Schemas.vscodeUserData || isRemote && uri.scheme !== Schemas.vscodeRemote) {
        notificationService.warn(localize("workbench.action.terminal.runActiveFile.noFile", "Only files on disk can be run in the terminal"));
        return;
      }
      await instance.sendPath(uri, true);
      return c.groupService.showPanel();
    }
  });
  registerActiveXtermAction({
    id: TerminalCommandId.ScrollDownLine,
    title: localize2("workbench.action.terminal.scrollDown", "Scroll Down (Line)"),
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageDown,
      linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow },
      when: sharedWhenClause.focusInAny_and_normalBuffer,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (xterm) => xterm.scrollDownLine()
  });
  registerActiveXtermAction({
    id: TerminalCommandId.ScrollDownPage,
    title: localize2("workbench.action.terminal.scrollDownPage", "Scroll Down (Page)"),
    keybinding: {
      primary: KeyMod.Shift | KeyCode.PageDown,
      mac: { primary: KeyCode.PageDown },
      when: sharedWhenClause.focusInAny_and_normalBuffer,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (xterm) => xterm.scrollDownPage()
  });
  registerActiveXtermAction({
    id: TerminalCommandId.ScrollToBottom,
    title: localize2("workbench.action.terminal.scrollToBottom", "Scroll to Bottom"),
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyCode.End,
      linux: { primary: KeyMod.Shift | KeyCode.End },
      when: sharedWhenClause.focusInAny_and_normalBuffer,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (xterm) => xterm.scrollToBottom()
  });
  registerActiveXtermAction({
    id: TerminalCommandId.ScrollUpLine,
    title: localize2("workbench.action.terminal.scrollUp", "Scroll Up (Line)"),
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageUp,
      linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow },
      when: sharedWhenClause.focusInAny_and_normalBuffer,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (xterm) => xterm.scrollUpLine()
  });
  registerActiveXtermAction({
    id: TerminalCommandId.ScrollUpPage,
    title: localize2("workbench.action.terminal.scrollUpPage", "Scroll Up (Page)"),
    f1: true,
    keybinding: {
      primary: KeyMod.Shift | KeyCode.PageUp,
      mac: { primary: KeyCode.PageUp },
      when: sharedWhenClause.focusInAny_and_normalBuffer,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (xterm) => xterm.scrollUpPage()
  });
  registerActiveXtermAction({
    id: TerminalCommandId.ScrollToTop,
    title: localize2("workbench.action.terminal.scrollToTop", "Scroll to Top"),
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyCode.Home,
      linux: { primary: KeyMod.Shift | KeyCode.Home },
      when: sharedWhenClause.focusInAny_and_normalBuffer,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (xterm) => xterm.scrollToTop()
  });
  registerActiveXtermAction({
    id: TerminalCommandId.ClearSelection,
    title: localize2("workbench.action.terminal.clearSelection", "Clear Selection"),
    keybinding: {
      primary: KeyCode.Escape,
      when: ContextKeyExpr.and(TerminalContextKeys.focusInAny, TerminalContextKeys.textSelected, TerminalContextKeys.notFindVisible),
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (xterm) => {
      if (xterm.hasSelection()) {
        xterm.clearSelection();
      }
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.ChangeIcon,
    title: terminalStrings.changeIcon,
    precondition: sharedWhenClause.terminalAvailable,
    run: (c, _, args) => getResourceOrActiveInstance(c, args)?.changeIcon()
  });
  registerTerminalAction({
    id: TerminalCommandId.ChangeIconActiveTab,
    title: terminalStrings.changeIcon,
    f1: false,
    precondition: sharedWhenClause.terminalAvailable_and_singularSelection,
    run: async (c, accessor, args) => {
      let icon;
      if (c.groupService.lastAccessedMenu === "inline-tab") {
        getResourceOrActiveInstance(c, args)?.changeIcon();
        return;
      }
      for (const terminal of getSelectedViewInstances(accessor) ?? []) {
        icon = await terminal.changeIcon(icon);
      }
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.ChangeColor,
    title: terminalStrings.changeColor,
    precondition: sharedWhenClause.terminalAvailable,
    run: (c, _, args) => getResourceOrActiveInstance(c, args)?.changeColor()
  });
  registerTerminalAction({
    id: TerminalCommandId.ChangeColorActiveTab,
    title: terminalStrings.changeColor,
    f1: false,
    precondition: sharedWhenClause.terminalAvailable_and_singularSelection,
    run: async (c, accessor, args) => {
      let color;
      let i = 0;
      if (c.groupService.lastAccessedMenu === "inline-tab") {
        getResourceOrActiveInstance(c, args)?.changeColor();
        return;
      }
      for (const terminal of getSelectedViewInstances(accessor) ?? []) {
        const skipQuickPick = i !== 0;
        color = await terminal.changeColor(color, skipQuickPick);
        i++;
      }
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.Rename,
    title: terminalStrings.rename,
    precondition: sharedWhenClause.terminalAvailable,
    run: (c, accessor, args) => renameWithQuickPick(c, accessor, args)
  });
  registerTerminalAction({
    id: TerminalCommandId.RenameActiveTab,
    title: terminalStrings.rename,
    f1: false,
    keybinding: {
      primary: KeyCode.F2,
      mac: {
        primary: KeyCode.Enter
      },
      when: ContextKeyExpr.and(TerminalContextKeys.tabsFocus),
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable_and_singularSelection,
    run: async (c, accessor) => {
      const terminalGroupService = accessor.get(ITerminalGroupService);
      const notificationService = accessor.get(INotificationService);
      const instances = getSelectedViewInstances(accessor);
      const firstInstance = instances?.[0];
      if (!firstInstance) {
        return;
      }
      if (terminalGroupService.lastAccessedMenu === "inline-tab") {
        return renameWithQuickPick(c, accessor, firstInstance);
      }
      c.editingService.setEditingTerminal(firstInstance);
      c.editingService.setEditable(firstInstance, {
        validationMessage: (value) => validateTerminalName(value),
        onFinish: async (value, success) => {
          c.editingService.setEditable(firstInstance, null);
          c.editingService.setEditingTerminal(void 0);
          if (success) {
            const promises = [];
            for (const instance of instances) {
              promises.push((async () => {
                await instance.rename(value);
              })());
            }
            try {
              await Promise.all(promises);
            } catch (e) {
              notificationService.error(e);
            }
          }
        }
      });
    }
  });
  registerActiveInstanceAction({
    id: TerminalCommandId.DetachSession,
    title: localize2("workbench.action.terminal.detachSession", "Detach Session"),
    run: (activeInstance) => activeInstance.detachProcessAndDispose(TerminalExitReason.User)
  });
  registerTerminalAction({
    id: TerminalCommandId.AttachToSession,
    title: localize2("workbench.action.terminal.attachToSession", "Attach to Session"),
    run: async (c, accessor) => {
      const quickInputService = accessor.get(IQuickInputService);
      const labelService = accessor.get(ILabelService);
      const remoteAgentService = accessor.get(IRemoteAgentService);
      const notificationService = accessor.get(INotificationService);
      const remoteAuthority = remoteAgentService.getConnection()?.remoteAuthority ?? void 0;
      const backend = await accessor.get(ITerminalInstanceService).getBackend(remoteAuthority);
      if (!backend) {
        throw new Error(`No backend registered for remote authority '${remoteAuthority}'`);
      }
      const terms = await backend.listProcesses();
      backend.reduceConnectionGraceTime();
      const unattachedTerms = terms.filter((term) => !c.service.isAttachedToTerminal(term));
      const items = unattachedTerms.map((term) => {
        const cwdLabel = labelService.getUriLabel(URI.file(term.cwd));
        return {
          label: term.title,
          detail: term.workspaceName ? `${term.workspaceName} \u2E31 ${cwdLabel}` : cwdLabel,
          description: term.pid ? String(term.pid) : "",
          term
        };
      });
      if (items.length === 0) {
        notificationService.info(localize("noUnattachedTerminals", "There are no unattached terminals to attach to"));
        return;
      }
      const selected = await quickInputService.pick(items, { canPickMany: false });
      if (selected) {
        const instance = await c.service.createTerminal({
          config: { attachPersistentProcess: selected.term }
        });
        c.service.setActiveInstance(instance);
        await focusActiveTerminal(instance, c);
      }
    }
  });
  registerActiveInstanceAction({
    id: TerminalCommandId.ScrollToPreviousCommand,
    title: terminalStrings.scrollToPreviousCommand,
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
      when: ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    icon: Codicon.arrowUp,
    menu: [
      {
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 4,
        when: ContextKeyExpr.equals("view", TERMINAL_VIEW_ID),
        isHiddenByDefault: true
      },
      ...[MenuId.EditorTitle, MenuId.CompactWindowEditorTitle].map((id) => ({
        id,
        group: "1_shellIntegration",
        order: 4,
        when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
        isHiddenByDefault: true
      }))
    ],
    run: (activeInstance) => activeInstance.xterm?.markTracker.scrollToPreviousMark(void 0, void 0, activeInstance.capabilities.has(TerminalCapability.CommandDetection))
  });
  registerActiveInstanceAction({
    id: TerminalCommandId.ScrollToNextCommand,
    title: terminalStrings.scrollToNextCommand,
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
      when: ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    icon: Codicon.arrowDown,
    menu: [
      {
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 5,
        when: ContextKeyExpr.equals("view", TERMINAL_VIEW_ID),
        isHiddenByDefault: true
      },
      ...[MenuId.EditorTitle, MenuId.CompactWindowEditorTitle].map((id) => ({
        id,
        group: "1_shellIntegration",
        order: 5,
        when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
        isHiddenByDefault: true
      }))
    ],
    run: (activeInstance) => {
      activeInstance.xterm?.markTracker.scrollToNextMark();
      activeInstance.focus();
    }
  });
  registerActiveInstanceAction({
    id: TerminalCommandId.SelectToPreviousCommand,
    title: localize2("workbench.action.terminal.selectToPreviousCommand", "Select to Previous Command"),
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow,
      when: TerminalContextKeys.focus,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (activeInstance) => {
      activeInstance.xterm?.markTracker.selectToPreviousMark();
      activeInstance.focus();
    }
  });
  registerActiveInstanceAction({
    id: TerminalCommandId.SelectToNextCommand,
    title: localize2("workbench.action.terminal.selectToNextCommand", "Select to Next Command"),
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow,
      when: TerminalContextKeys.focus,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (activeInstance) => {
      activeInstance.xterm?.markTracker.selectToNextMark();
      activeInstance.focus();
    }
  });
  registerActiveXtermAction({
    id: TerminalCommandId.SelectToPreviousLine,
    title: localize2("workbench.action.terminal.selectToPreviousLine", "Select to Previous Line"),
    precondition: sharedWhenClause.terminalAvailable,
    run: async (xterm, _, instance) => {
      xterm.markTracker.selectToPreviousLine();
      (instance || xterm).focus();
    }
  });
  registerActiveXtermAction({
    id: TerminalCommandId.SelectToNextLine,
    title: localize2("workbench.action.terminal.selectToNextLine", "Select to Next Line"),
    precondition: sharedWhenClause.terminalAvailable,
    run: async (xterm, _, instance) => {
      xterm.markTracker.selectToNextLine();
      (instance || xterm).focus();
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.NewWithCwd,
    title: terminalStrings.newWithCwd,
    metadata: {
      description: terminalStrings.newWithCwd.value,
      args: [{
        name: "args",
        schema: {
          type: "object",
          required: ["cwd"],
          properties: {
            cwd: {
              description: localize("workbench.action.terminal.newWithCwd.cwd", "The directory to start the terminal at"),
              type: "string"
            }
          }
        }
      }]
    },
    run: async (c, _, args) => {
      const cwd = args ? toOptionalString(args.cwd) : void 0;
      const instance = await c.service.createTerminal({ cwd });
      if (!instance) {
        return;
      }
      c.service.setActiveInstance(instance);
      await focusActiveTerminal(instance, c);
    }
  });
  registerActiveInstanceAction({
    id: TerminalCommandId.RenameWithArgs,
    title: terminalStrings.renameWithArgs,
    metadata: {
      description: terminalStrings.renameWithArgs.value,
      args: [{
        name: "args",
        schema: {
          type: "object",
          required: ["name"],
          properties: {
            name: {
              description: localize("workbench.action.terminal.renameWithArg.name", "The new name for the terminal"),
              type: "string",
              minLength: 1
            }
          }
        }
      }]
    },
    precondition: sharedWhenClause.terminalAvailable,
    f1: false,
    run: async (activeInstance, c, accessor, args) => {
      const notificationService = accessor.get(INotificationService);
      const name = args ? toOptionalString(args.name) : void 0;
      if (!name) {
        notificationService.warn(localize("workbench.action.terminal.renameWithArg.noName", "No name argument provided"));
        return;
      }
      activeInstance.rename(name);
    }
  });
  registerActiveInstanceAction({
    id: TerminalCommandId.Relaunch,
    title: localize2("workbench.action.terminal.relaunch", "Relaunch Active Terminal"),
    run: (activeInstance) => activeInstance.relaunch()
  });
  registerTerminalAction({
    id: TerminalCommandId.Split,
    title: terminalStrings.split,
    precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.webExtensionContributedProfile),
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Digit5,
      weight: KeybindingWeight.WorkbenchContrib,
      mac: {
        primary: KeyMod.CtrlCmd | KeyCode.Backslash,
        secondary: [KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Digit5]
      },
      when: TerminalContextKeys.focus
    },
    icon: Codicon.splitHorizontal,
    run: async (c, accessor, args) => {
      const optionsOrProfile = isObject(args) ? args : void 0;
      const commandService = accessor.get(ICommandService);
      const workspaceContextService = accessor.get(IWorkspaceContextService);
      const options = convertOptionsOrProfileToOptions(optionsOrProfile);
      const activeInstance = (await c.service.getInstanceHost(options?.location)).activeInstance;
      if (!activeInstance) {
        return;
      }
      const cwd = await getCwdForSplit(activeInstance, workspaceContextService.getWorkspace().folders, commandService, c.configService);
      if (cwd === void 0) {
        return;
      }
      const instance = await c.service.createTerminal({ location: { parentTerminal: activeInstance }, config: options?.config, cwd });
      await focusActiveTerminal(instance, c);
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.SplitActiveTab,
    title: terminalStrings.split,
    f1: false,
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Digit5,
      mac: {
        primary: KeyMod.CtrlCmd | KeyCode.Backslash,
        secondary: [KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Digit5]
      },
      weight: KeybindingWeight.WorkbenchContrib,
      when: TerminalContextKeys.tabsFocus
    },
    run: async (c, accessor) => {
      const instances = getSelectedViewInstances(accessor);
      if (instances) {
        const promises = [];
        for (const t of instances) {
          promises.push((async () => {
            await c.service.createTerminal({ location: { parentTerminal: t } });
            await c.groupService.showPanel(true);
          })());
        }
        await Promise.all(promises);
      }
    }
  });
  registerContextualInstanceAction({
    id: TerminalCommandId.Unsplit,
    title: terminalStrings.unsplit,
    precondition: sharedWhenClause.terminalAvailable,
    run: async (instance, c) => {
      const group = c.groupService.getGroupForInstance(instance);
      if (group && group?.terminalInstances.length > 1) {
        c.groupService.unsplitInstance(instance);
      }
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.JoinActiveTab,
    title: localize2("workbench.action.terminal.joinInstance", "Join Terminals"),
    precondition: ContextKeyExpr.and(sharedWhenClause.terminalAvailable, TerminalContextKeys.tabsSingularSelection.toNegated()),
    run: async (c, accessor) => {
      const instances = getSelectedViewInstances(accessor);
      if (instances && instances.length > 1) {
        c.groupService.joinInstances(instances);
      }
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.Join,
    title: localize2("workbench.action.terminal.join", "Join Terminals..."),
    precondition: sharedWhenClause.terminalAvailable,
    run: async (c, accessor) => {
      const themeService = accessor.get(IThemeService);
      const notificationService = accessor.get(INotificationService);
      const quickInputService = accessor.get(IQuickInputService);
      const picks = [];
      if (c.groupService.instances.length <= 1) {
        notificationService.warn(localize("workbench.action.terminal.join.insufficientTerminals", "Insufficient terminals for the join action"));
        return;
      }
      const otherInstances = c.groupService.instances.filter((i) => i.instanceId !== c.groupService.activeInstance?.instanceId);
      for (const terminal of otherInstances) {
        const group = c.groupService.getGroupForInstance(terminal);
        if (group?.terminalInstances.length === 1) {
          const iconId = getIconId(accessor, terminal);
          const label = `$(${iconId}): ${terminal.title}`;
          const iconClasses = [];
          const colorClass = getColorClass(terminal);
          if (colorClass) {
            iconClasses.push(colorClass);
          }
          const uriClasses = getUriClasses(terminal, themeService.getColorTheme().type);
          if (uriClasses) {
            iconClasses.push(...uriClasses);
          }
          picks.push({
            terminal,
            label,
            iconClasses
          });
        }
      }
      if (picks.length === 0) {
        notificationService.warn(localize("workbench.action.terminal.join.onlySplits", "All terminals are joined already"));
        return;
      }
      const result = await quickInputService.pick(picks, {});
      if (result) {
        c.groupService.joinInstances([result.terminal, c.groupService.activeInstance]);
      }
    }
  });
  registerActiveInstanceAction({
    id: TerminalCommandId.SplitInActiveWorkspace,
    title: localize2("workbench.action.terminal.splitInActiveWorkspace", "Split Terminal (In Active Workspace)"),
    run: async (instance, c) => {
      const newInstance = await c.service.createTerminal({ location: { parentTerminal: instance } });
      if (newInstance?.target !== TerminalLocation.Editor) {
        await c.groupService.showPanel(true);
      }
    }
  });
  registerActiveXtermAction({
    id: TerminalCommandId.SelectAll,
    title: localize2("workbench.action.terminal.selectAll", "Select All"),
    precondition: sharedWhenClause.terminalAvailable,
    keybinding: [{
      // Don't use ctrl+a by default as that would override the common go to start
      // of prompt shell binding
      primary: 0,
      // Technically this doesn't need to be here as it will fall back to this
      // behavior anyway when handed to xterm.js, having this handled by VS Code
      // makes it easier for users to see how it works though.
      mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyA },
      weight: KeybindingWeight.WorkbenchContrib,
      when: TerminalContextKeys.focusInAny
    }],
    run: (xterm) => xterm.selectAll()
  });
  registerTerminalAction({
    id: TerminalCommandId.New,
    title: localize2("workbench.action.terminal.new", "Create New Terminal"),
    precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.webExtensionContributedProfile),
    icon: newTerminalIcon,
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backquote,
      mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Backquote },
      weight: KeybindingWeight.WorkbenchContrib
    },
    run: async (c, accessor, args) => {
      let eventOrOptions = isObject(args) ? args : void 0;
      const workspaceContextService = accessor.get(IWorkspaceContextService);
      const commandService = accessor.get(ICommandService);
      const editorGroupsService = accessor.get(IEditorGroupsService);
      const folders = workspaceContextService.getWorkspace().folders;
      if (eventOrOptions && isMouseEvent(eventOrOptions) && (eventOrOptions.altKey || eventOrOptions.ctrlKey)) {
        await c.service.createTerminal({ location: { splitActiveTerminal: true } });
        return;
      }
      if (c.service.isProcessSupportRegistered) {
        eventOrOptions = !eventOrOptions || isMouseEvent(eventOrOptions) ? {} : eventOrOptions;
        if (isAuxiliaryWindow(getActiveWindow()) && !eventOrOptions.location) {
          eventOrOptions.location = { viewColumn: editorGroupToColumn(editorGroupsService, editorGroupsService.activeGroup) };
        }
        let instance;
        if (folders.length <= 1) {
          instance = await c.service.createTerminal(eventOrOptions);
        } else {
          const cwd = (await pickTerminalCwd(accessor))?.cwd;
          if (!cwd) {
            return;
          }
          eventOrOptions.cwd = cwd;
          instance = await c.service.createTerminal(eventOrOptions);
        }
        c.service.setActiveInstance(instance);
        await focusActiveTerminal(instance, c);
      } else {
        if (c.profileService.contributedProfiles.length > 0) {
          commandService.executeCommand(TerminalCommandId.NewWithProfile);
        } else {
          commandService.executeCommand(TerminalCommandId.Toggle);
        }
      }
    }
  });
  async function killInstance(c, instance) {
    if (!instance) {
      return;
    }
    await c.service.safeDisposeTerminal(instance);
    if (c.groupService.instances.length > 0) {
      await c.groupService.showPanel(true);
    }
  }
  registerTerminalAction({
    id: TerminalCommandId.Kill,
    title: localize2("workbench.action.terminal.kill", "Kill the Active Terminal Instance"),
    precondition: ContextKeyExpr.or(sharedWhenClause.terminalAvailable, TerminalContextKeys.isOpen),
    icon: killTerminalIcon,
    run: async (c) => killInstance(c, c.groupService.activeInstance)
  });
  registerTerminalAction({
    id: TerminalCommandId.KillViewOrEditor,
    title: terminalStrings.kill,
    f1: false,
    // This is an internal command used for context menus
    precondition: ContextKeyExpr.or(sharedWhenClause.terminalAvailable, TerminalContextKeys.isOpen),
    run: async (c) => killInstance(c, c.service.activeInstance)
  });
  registerTerminalAction({
    id: TerminalCommandId.KillAll,
    title: localize2("workbench.action.terminal.killAll", "Kill All Terminals"),
    precondition: ContextKeyExpr.or(sharedWhenClause.terminalAvailable, TerminalContextKeys.isOpen),
    icon: Codicon.trash,
    run: async (c) => {
      const disposePromises = [];
      for (const instance of c.service.instances) {
        disposePromises.push(c.service.safeDisposeTerminal(instance));
      }
      await Promise.all(disposePromises);
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.KillEditor,
    title: localize2("workbench.action.terminal.killEditor", "Kill the Active Terminal in Editor Area"),
    precondition: sharedWhenClause.terminalAvailable,
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyCode.KeyW,
      win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KeyW] },
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.editorFocus)
    },
    run: (c, accessor) => accessor.get(ICommandService).executeCommand(CLOSE_EDITOR_COMMAND_ID)
  });
  registerTerminalAction({
    id: TerminalCommandId.KillActiveTab,
    title: terminalStrings.kill,
    f1: false,
    precondition: ContextKeyExpr.or(sharedWhenClause.terminalAvailable, TerminalContextKeys.isOpen),
    keybinding: {
      primary: KeyCode.Delete,
      mac: {
        primary: KeyMod.CtrlCmd | KeyCode.Backspace,
        secondary: [KeyCode.Delete]
      },
      weight: KeybindingWeight.WorkbenchContrib,
      when: TerminalContextKeys.tabsFocus
    },
    run: async (c, accessor) => {
      const disposePromises = [];
      for (const terminal of getSelectedViewInstances(accessor, true) ?? []) {
        disposePromises.push(c.service.safeDisposeTerminal(terminal));
      }
      await Promise.all(disposePromises);
      c.groupService.focusTabs();
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.FocusHover,
    title: terminalStrings.focusHover,
    precondition: ContextKeyExpr.or(sharedWhenClause.terminalAvailable, TerminalContextKeys.isOpen),
    keybinding: {
      primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyI),
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.or(TerminalContextKeys.tabsFocus, TerminalContextKeys.focus)
    },
    run: (c) => c.groupService.focusHover()
  });
  registerActiveInstanceAction({
    id: TerminalCommandId.Clear,
    title: localize2("workbench.action.terminal.clear", "Clear"),
    precondition: sharedWhenClause.terminalAvailable,
    keybinding: [{
      primary: 0,
      mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyK },
      // Weight is higher than work workbench contributions so the keybinding remains
      // highest priority when chords are registered afterwards
      weight: KeybindingWeight.WorkbenchContrib + 1,
      // Disable the keybinding when accessibility mode is enabled as chords include
      // important screen reader keybindings such as cmd+k, cmd+i to show the hover
      when: ContextKeyExpr.or(ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()), ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, accessibleViewIsShown, accessibleViewCurrentProviderId.isEqualTo(AccessibleViewProviderId.Terminal)))
    }],
    run: (activeInstance) => activeInstance.clearBuffer()
  });
  registerTerminalAction({
    id: TerminalCommandId.SelectDefaultProfile,
    title: localize2("workbench.action.terminal.selectDefaultShell", "Select Default Profile"),
    run: (c) => c.service.showProfileQuickPick("setDefault")
  });
  registerTerminalAction({
    id: TerminalCommandId.ConfigureTerminalSettings,
    title: localize2("workbench.action.terminal.openSettings", "Configure Terminal Settings"),
    precondition: sharedWhenClause.terminalAvailable,
    run: (c, accessor) => accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: "@feature:terminal" })
  });
  registerActiveInstanceAction({
    id: TerminalCommandId.SetDimensions,
    title: localize2("workbench.action.terminal.setFixedDimensions", "Set Fixed Dimensions"),
    precondition: sharedWhenClause.terminalAvailable_and_opened,
    run: (activeInstance) => activeInstance.setFixedDimensions()
  });
  registerContextualInstanceAction({
    id: TerminalCommandId.SizeToContentWidth,
    title: terminalStrings.toggleSizeToContentWidth,
    precondition: sharedWhenClause.terminalAvailable_and_opened,
    keybinding: {
      primary: KeyMod.Alt | KeyCode.KeyZ,
      weight: KeybindingWeight.WorkbenchContrib,
      when: TerminalContextKeys.focus
    },
    run: (instance) => instance.toggleSizeToContentWidth()
  });
  registerTerminalAction({
    id: TerminalCommandId.SwitchTerminal,
    title: localize2("workbench.action.terminal.switchTerminal", "Switch Terminal"),
    precondition: sharedWhenClause.terminalAvailable,
    run: async (c, accessor, args) => {
      const item = toOptionalString(args);
      if (!item) {
        return;
      }
      if (item === SeparatorSelectOption.text) {
        c.service.refreshActiveGroup();
        return;
      }
      if (item === switchTerminalShowTabsTitle) {
        accessor.get(IConfigurationService).updateValue(TerminalSettingId.TabsEnabled, true);
        return;
      }
      const terminalIndexRe = /^([0-9]+): /;
      const indexMatches = terminalIndexRe.exec(item);
      if (indexMatches) {
        c.groupService.setActiveGroupByIndex(Number(indexMatches[1]) - 1);
        return c.groupService.showPanel(true);
      }
      const quickSelectProfiles = c.profileService.availableProfiles;
      const profileSelection = item.substring(4);
      if (quickSelectProfiles) {
        const profile = quickSelectProfiles.find((profile2) => profile2.profileName === profileSelection);
        if (profile) {
          const instance = await c.service.createTerminal({
            config: profile
          });
          c.service.setActiveInstance(instance);
        } else {
          console.warn(`No profile with name "${profileSelection}"`);
        }
      } else {
        console.warn(`Unmatched terminal item: "${item}"`);
      }
    }
  });
}
function getSelectedViewInstances2(accessor, args) {
  const terminalService = accessor.get(ITerminalService);
  const result = [];
  const context = parseActionArgs(args);
  if (context && context.length > 0) {
    for (const instanceContext of context) {
      const instance = terminalService.getInstanceFromId(instanceContext.instanceId);
      if (instance) {
        result.push(instance);
      }
    }
    if (result.length > 0) {
      return result;
    }
  }
  return void 0;
}
function getSelectedViewInstances(accessor, args, args2) {
  const listService = accessor.get(IListService);
  const terminalGroupService = accessor.get(ITerminalGroupService);
  const result = [];
  const list = listService.lastFocusedList instanceof TerminalTabList ? listService.lastFocusedList : void 0;
  const selections = list?.getSelection();
  if (terminalGroupService.lastAccessedMenu === "inline-tab" && !selections?.length) {
    const instance = terminalGroupService.activeInstance;
    return instance ? [terminalGroupService.activeInstance] : void 0;
  }
  if (!list || !selections) {
    return void 0;
  }
  const focused = list.getFocus();
  const viewInstances = terminalGroupService.instances;
  if (focused.length === 1 && !selections.includes(focused[0])) {
    result.push(viewInstances[focused[0]]);
    return result;
  }
  for (const selection of selections) {
    result.push(viewInstances[selection]);
  }
  return result.filter((r) => !!r);
}
function validateTerminalName(name) {
  if (!name || name.trim().length === 0) {
    return {
      content: localize("emptyTerminalNameInfo", "Providing no name will reset it to the default value"),
      severity: Severity.Info
    };
  }
  return null;
}
function isTerminalProfile(obj) {
  return isObject(obj) && "profileName" in obj;
}
function convertOptionsOrProfileToOptions(optionsOrProfile) {
  if (isTerminalProfile(optionsOrProfile)) {
    return { config: optionsOrProfile, location: optionsOrProfile.location };
  }
  return optionsOrProfile;
}
let newWithProfileAction;
function refreshTerminalActions(detectedProfiles) {
  const profileEnum = createProfileSchemaEnums(detectedProfiles);
  newWithProfileAction?.dispose();
  newWithProfileAction = registerAction2(class extends Action2 {
    constructor() {
      super({
        id: TerminalCommandId.NewWithProfile,
        title: localize2("workbench.action.terminal.newWithProfile", "Create New Terminal (With Profile)"),
        f1: true,
        precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.webExtensionContributedProfile),
        metadata: {
          description: TerminalCommandId.NewWithProfile,
          args: [{
            name: "args",
            schema: {
              type: "object",
              required: ["profileName"],
              properties: {
                profileName: {
                  description: localize("workbench.action.terminal.newWithProfile.profileName", "The name of the profile to create"),
                  type: "string",
                  enum: profileEnum.values,
                  markdownEnumDescriptions: profileEnum.markdownDescriptions
                },
                location: {
                  description: localize("newWithProfile.location", "Where to create the terminal"),
                  type: "string",
                  enum: ["view", "editor"],
                  enumDescriptions: [
                    localize("newWithProfile.location.view", "Create the terminal in the terminal view"),
                    localize("newWithProfile.location.editor", "Create the terminal in the editor")
                  ]
                }
              }
            }
          }]
        }
      });
    }
    async run(accessor, eventOrOptionsOrProfile, profile) {
      const c = getTerminalServices(accessor);
      const workspaceContextService = accessor.get(IWorkspaceContextService);
      const commandService = accessor.get(ICommandService);
      let event;
      let options;
      let instance;
      let cwd;
      if (isObject(eventOrOptionsOrProfile) && eventOrOptionsOrProfile && hasKey(eventOrOptionsOrProfile, { profileName: true })) {
        let isSimpleArgs2 = function(obj) {
          return isObject(obj) && "location" in obj;
        };
        var isSimpleArgs = isSimpleArgs2;
        const config = c.profileService.availableProfiles.find((profile2) => profile2.profileName === eventOrOptionsOrProfile.profileName);
        if (!config) {
          throw new Error(`Could not find terminal profile "${eventOrOptionsOrProfile.profileName}"`);
        }
        options = { config };
        if (isSimpleArgs2(eventOrOptionsOrProfile)) {
          switch (eventOrOptionsOrProfile.location) {
            case "editor":
              options.location = TerminalLocation.Editor;
              break;
            case "view":
              options.location = TerminalLocation.Panel;
              break;
          }
        }
      } else if (isMouseEvent(eventOrOptionsOrProfile) || isPointerEvent(eventOrOptionsOrProfile) || isKeyboardEvent(eventOrOptionsOrProfile)) {
        event = eventOrOptionsOrProfile;
        options = profile ? { config: profile } : void 0;
      } else {
        options = convertOptionsOrProfileToOptions(eventOrOptionsOrProfile);
      }
      if (event && (event.altKey || event.ctrlKey)) {
        const parentTerminal = c.service.activeInstance;
        if (parentTerminal) {
          await c.service.createTerminal({ location: { parentTerminal }, config: options?.config });
          return;
        }
      }
      const folders = workspaceContextService.getWorkspace().folders;
      if (folders.length > 1) {
        const options2 = {
          placeHolder: localize("workbench.action.terminal.newWorkspacePlaceholder", "Select current working directory for new terminal")
        };
        const workspace = await commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID, [options2]);
        if (!workspace) {
          return;
        }
        cwd = workspace.uri;
      }
      if (options) {
        options.cwd = cwd;
        instance = await c.service.createTerminal(options);
      } else {
        instance = await c.service.showProfileQuickPick("createInstance", cwd);
      }
      if (instance) {
        c.service.setActiveInstance(instance);
        await focusActiveTerminal(instance, c);
      }
    }
  });
  return newWithProfileAction;
}
function getResourceOrActiveInstance(c, resource) {
  return c.service.getInstanceFromResource(toOptionalUri(resource)) || c.service.activeInstance;
}
async function pickTerminalCwd(accessor, cancel) {
  const quickInputService = accessor.get(IQuickInputService);
  const labelService = accessor.get(ILabelService);
  const contextService = accessor.get(IWorkspaceContextService);
  const modelService = accessor.get(IModelService);
  const languageService = accessor.get(ILanguageService);
  const configurationService = accessor.get(IConfigurationService);
  const configurationResolverService = accessor.get(IConfigurationResolverService);
  const folders = contextService.getWorkspace().folders;
  if (!folders.length) {
    return;
  }
  const folderCwdPairs = await Promise.all(folders.map((e) => resolveWorkspaceFolderCwd(e, configurationService, configurationResolverService)));
  const shrinkedPairs = shrinkWorkspaceFolderCwdPairs(folderCwdPairs);
  if (shrinkedPairs.length === 1) {
    return shrinkedPairs[0];
  }
  const folderPicks = shrinkedPairs.map((pair) => {
    const label = pair.folder.name;
    const description = pair.isOverridden ? localize("workbench.action.terminal.overriddenCwdDescription", "(Overridden) {0}", labelService.getUriLabel(pair.cwd, { relative: !pair.isAbsolute })) : labelService.getUriLabel(dirname(pair.cwd), { relative: true });
    return {
      label,
      description: description !== label ? description : void 0,
      pair,
      iconClasses: getIconClasses(modelService, languageService, pair.cwd, FileKind.ROOT_FOLDER)
    };
  });
  const options = {
    placeHolder: localize("workbench.action.terminal.newWorkspacePlaceholder", "Select current working directory for new terminal"),
    matchOnDescription: true,
    canPickMany: false
  };
  const token = cancel || CancellationToken.None;
  const pick = await quickInputService.pick(folderPicks, options, token);
  return pick?.pair;
}
async function resolveWorkspaceFolderCwd(folder, configurationService, configurationResolverService) {
  const cwdConfig = configurationService.getValue(TerminalSettingId.Cwd, { resource: folder.uri });
  if (!isString(cwdConfig) || cwdConfig.length === 0) {
    return { folder, cwd: folder.uri, isAbsolute: false, isOverridden: false };
  }
  const resolvedCwdConfig = await configurationResolverService.resolveAsync(folder, cwdConfig);
  return isAbsolute(resolvedCwdConfig) || resolvedCwdConfig.startsWith(ConfigurationResolverExpression.VARIABLE_LHS) ? { folder, isAbsolute: true, isOverridden: true, cwd: URI.from({ ...folder.uri, path: resolvedCwdConfig }) } : { folder, isAbsolute: false, isOverridden: true, cwd: URI.joinPath(folder.uri, resolvedCwdConfig) };
}
function shrinkWorkspaceFolderCwdPairs(pairs) {
  const map = /* @__PURE__ */ new Map();
  for (const pair of pairs) {
    const key = pair.cwd.toString();
    const value = map.get(key);
    if (!value || key === pair.folder.uri.toString()) {
      map.set(key, pair);
    }
  }
  const selectedPairs = new Set(map.values());
  const selectedPairsInOrder = pairs.filter((x) => selectedPairs.has(x));
  return selectedPairsInOrder;
}
async function focusActiveTerminal(instance, c) {
  const target = instance ?? c.service.activeInstance ?? c.editorService.activeInstance ?? c.groupService.activeInstance;
  if (!target) {
    if (c.groupService.instances.length > 0) {
      await c.groupService.showPanel(true);
    }
    return;
  }
  await c.service.focusInstance(target);
}
async function renameWithQuickPick(c, accessor, resource) {
  let instance = resource;
  if (!instance || !instance?.rename) {
    instance = getResourceOrActiveInstance(c, resource);
  }
  if (instance) {
    const title = await accessor.get(IQuickInputService).input({
      value: instance.title,
      prompt: localize("workbench.action.terminal.rename.prompt", "Enter terminal name")
    });
    if (title) {
      instance.rename(title);
    }
  }
}
function toOptionalUri(obj) {
  return URI.isUri(obj) ? obj : void 0;
}
function toOptionalString(obj) {
  return isString(obj) ? obj : void 0;
}
export {
  TerminalLaunchHelpAction,
  getCwdForSplit,
  refreshTerminalActions,
  registerActiveInstanceAction,
  registerActiveXtermAction,
  registerContextualInstanceAction,
  registerTerminalAction,
  registerTerminalActions,
  sharedWhenClause,
  shrinkWorkspaceFolderCwdPairs,
  switchTerminalShowTabsTitle,
  validateTerminalName
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxicm93c2VyXFx0ZXJtaW5hbEFjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpc0tleWJvYXJkRXZlbnQsIGlzTW91c2VFdmVudCwgaXNQb2ludGVyRXZlbnQsIGdldEFjdGl2ZVdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBLZXlDaG9yZCwgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgaXNBYnNvbHV0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZGlybmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBoYXNLZXksIGlzT2JqZWN0LCBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgRW5kT2ZMaW5lUHJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgZ2V0SWNvbkNsYXNzZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2dldEljb25DbGFzc2VzLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3LmpzJztcbmltcG9ydCB7IENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIElBY3Rpb24yT3B0aW9ucywgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBGaWxlS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMaXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElQaWNrT3B0aW9ucywgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsUHJvZmlsZSwgVGVybWluYWxFeGl0UmVhc29uLCBUZXJtaW5hbEljb24sIFRlcm1pbmFsTG9jYXRpb24sIFRlcm1pbmFsU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IGNyZWF0ZVByb2ZpbGVTY2hlbWFFbnVtcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbFByb2ZpbGVzLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IFBJQ0tfV09SS1NQQUNFX0ZPTERFUl9DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hY3Rpb25zL3dvcmtzcGFjZUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IENMT1NFX0VESVRPUl9DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL2NvbmZpZ3VyYXRpb25SZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uLmpzJztcbmltcG9ydCB7IGVkaXRvckdyb3VwVG9Db2x1bW4gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3VwQ29sdW1uLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFDVElWRV9HUk9VUCwgQVVYX1dJTkRPV19HUk9VUCwgU0lERV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBhY2Nlc3NpYmxlVmlld0N1cnJlbnRQcm92aWRlcklkLCBhY2Nlc3NpYmxlVmlld0lzU2hvd24sIGFjY2Vzc2libGVWaWV3T25MYXN0TGluZSB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlVGVybWluYWxBdHRhY2hUYXJnZXQsIElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UsIElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLCBURVJNSU5BTF9WSUVXX0lELCBUZXJtaW5hbENvbW1hbmRJZCB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbnRleHRLZXlzIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsQ29udGV4dEtleS5qcyc7XG5pbXBvcnQgeyB0ZXJtaW5hbFN0cmluZ3MgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWxTdHJpbmdzLmpzJztcbmltcG9ydCB7IERpcmVjdGlvbiwgSUNyZWF0ZVRlcm1pbmFsT3B0aW9ucywgSURldGFjaGVkVGVybWluYWxJbnN0YW5jZSwgSVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UsIElUZXJtaW5hbEVkaXRvclNlcnZpY2UsIElUZXJtaW5hbEVkaXRpbmdTZXJ2aWNlLCBJVGVybWluYWxHcm91cFNlcnZpY2UsIElUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxJbnN0YW5jZVNlcnZpY2UsIElUZXJtaW5hbFNlcnZpY2UsIElYdGVybVRlcm1pbmFsIH0gZnJvbSAnLi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBpc0F1eGlsaWFyeVdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgSW5zdGFuY2VDb250ZXh0IH0gZnJvbSAnLi90ZXJtaW5hbENvbnRleHRNZW51LmpzJztcbmltcG9ydCB7IGdldENvbG9yQ2xhc3MsIGdldEljb25JZCwgZ2V0VXJpQ2xhc3NlcyB9IGZyb20gJy4vdGVybWluYWxJY29uLmpzJztcbmltcG9ydCB7IGtpbGxUZXJtaW5hbEljb24sIG5ld1Rlcm1pbmFsSWNvbiB9IGZyb20gJy4vdGVybWluYWxJY29ucy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi90ZXJtaW5hbFByb2ZpbGVRdWlja3BpY2suanMnO1xuaW1wb3J0IHsgVGVybWluYWxUYWJMaXN0IH0gZnJvbSAnLi90ZXJtaW5hbFRhYnNMaXN0LmpzJztcbmltcG9ydCB7IFJlc291cmNlQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBTZXBhcmF0b3JTZWxlY3RPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2VsZWN0Qm94L3NlbGVjdEJveC5qcyc7XG5cbmV4cG9ydCBjb25zdCBzd2l0Y2hUZXJtaW5hbFNob3dUYWJzVGl0bGUgPSBsb2NhbGl6ZSgnc2hvd1Rlcm1pbmFsVGFicycsIFwiU2hvdyBUYWJzXCIpO1xuXG5jb25zdCBjYXRlZ29yeSA9IHRlcm1pbmFsU3RyaW5ncy5hY3Rpb25DYXRlZ29yeTtcblxuLy8gU29tZSB0ZXJtaW5hbCBjb250ZXh0IGtleXMgZ2V0IGNvbXBsaWNhdGVkLiBTaW5jZSBub3JtYWxpemluZyBhbmQvb3IgY29udGV4dCBrZXlzIGNhbiBiZVxuLy8gZXhwZW5zaXZlIHRoaXMgaXMgZG9uZSBvbmNlIHBlciBjb250ZXh0IGtleSBhbmQgc2hhcmVkLlxuZXhwb3J0IGNvbnN0IHNoYXJlZFdoZW5DbGF1c2UgPSAoKCkgPT4ge1xuXHRjb25zdCB0ZXJtaW5hbEF2YWlsYWJsZSA9IENvbnRleHRLZXlFeHByLm9yKFRlcm1pbmFsQ29udGV4dEtleXMucHJvY2Vzc1N1cHBvcnRlZCwgVGVybWluYWxDb250ZXh0S2V5cy50ZXJtaW5hbEhhc0JlZW5DcmVhdGVkKTtcblx0cmV0dXJuIHtcblx0XHR0ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHR0ZXJtaW5hbEF2YWlsYWJsZV9hbmRfb3BlbmVkOiBDb250ZXh0S2V5RXhwci5hbmQodGVybWluYWxBdmFpbGFibGUsIFRlcm1pbmFsQ29udGV4dEtleXMuaXNPcGVuKSxcblx0XHR0ZXJtaW5hbEF2YWlsYWJsZV9hbmRfZWRpdG9yQWN0aXZlOiBDb250ZXh0S2V5RXhwci5hbmQodGVybWluYWxBdmFpbGFibGUsIFRlcm1pbmFsQ29udGV4dEtleXMudGVybWluYWxFZGl0b3JBY3RpdmUpLFxuXHRcdHRlcm1pbmFsQXZhaWxhYmxlX2FuZF9zaW5ndWxhclNlbGVjdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKHRlcm1pbmFsQXZhaWxhYmxlLCBUZXJtaW5hbENvbnRleHRLZXlzLnRhYnNTaW5ndWxhclNlbGVjdGlvbiksXG5cdFx0Zm9jdXNJbkFueV9hbmRfbm9ybWFsQnVmZmVyOiBDb250ZXh0S2V5RXhwci5hbmQoVGVybWluYWxDb250ZXh0S2V5cy5mb2N1c0luQW55LCBUZXJtaW5hbENvbnRleHRLZXlzLmFsdEJ1ZmZlckFjdGl2ZS5uZWdhdGUoKSlcblx0fTtcbn0pKCk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ya3NwYWNlRm9sZGVyQ3dkUGFpciB7XG5cdGZvbGRlcjogSVdvcmtzcGFjZUZvbGRlcjtcblx0Y3dkOiBVUkk7XG5cdGlzQWJzb2x1dGU6IGJvb2xlYW47XG5cdGlzT3ZlcnJpZGRlbjogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldEN3ZEZvclNwbGl0KFxuXHRpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsXG5cdGZvbGRlcnM6IElXb3Jrc3BhY2VGb2xkZXJbXSB8IHVuZGVmaW5lZCxcblx0Y29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0Y29uZmlnU2VydmljZTogSVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2Vcbik6IFByb21pc2U8c3RyaW5nIHwgVVJJIHwgdW5kZWZpbmVkPiB7XG5cdHN3aXRjaCAoY29uZmlnU2VydmljZS5jb25maWcuc3BsaXRDd2QpIHtcblx0XHRjYXNlICd3b3Jrc3BhY2VSb290Jzpcblx0XHRcdGlmIChmb2xkZXJzICE9PSB1bmRlZmluZWQgJiYgY29tbWFuZFNlcnZpY2UgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRpZiAoZm9sZGVycy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRyZXR1cm4gZm9sZGVyc1swXS51cmk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZm9sZGVycy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0Ly8gT25seSBjaG9vc2UgYSBwYXRoIHdoZW4gdGhlcmUncyBtb3JlIHRoYW4gMSBmb2xkZXJcblx0XHRcdFx0XHRjb25zdCBvcHRpb25zOiBJUGlja09wdGlvbnM8SVF1aWNrUGlja0l0ZW0+ID0ge1xuXHRcdFx0XHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLm5ld1dvcmtzcGFjZVBsYWNlaG9sZGVyJywgXCJTZWxlY3QgY3VycmVudCB3b3JraW5nIGRpcmVjdG9yeSBmb3IgbmV3IHRlcm1pbmFsXCIpXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxJV29ya3NwYWNlRm9sZGVyPihQSUNLX1dPUktTUEFDRV9GT0xERVJfQ09NTUFORF9JRCwgW29wdGlvbnNdKTtcblx0XHRcdFx0XHRpZiAoIXdvcmtzcGFjZSkge1xuXHRcdFx0XHRcdFx0Ly8gRG9uJ3Qgc3BsaXQgdGhlIGluc3RhbmNlIGlmIHRoZSB3b3Jrc3BhY2UgcGlja2VyIHdhcyBjYW5jZWxlZFxuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh3b3Jrc3BhY2UudXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuICcnO1xuXHRcdGNhc2UgJ2luaXRpYWwnOlxuXHRcdFx0cmV0dXJuIGluc3RhbmNlLmdldEluaXRpYWxDd2QoKTtcblx0XHRjYXNlICdpbmhlcml0ZWQnOlxuXHRcdFx0cmV0dXJuIGluc3RhbmNlLmdldFNwZWN1bGF0aXZlQ3dkKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsTGF1bmNoSGVscEFjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmxhdW5jaEhlbHAnLCBsb2NhbGl6ZSgndGVybWluYWxMYXVuY2hIZWxwJywgXCJPcGVuIEhlbHBcIikpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX29wZW5lclNlcnZpY2Uub3BlbignaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXRyb3VibGVzaG9vdC10ZXJtaW5hbC1sYXVuY2gnKTtcblx0fVxufVxuXG4vKipcbiAqIEEgd3JhcHBlciBmdW5jdGlvbiBhcm91bmQgcmVnaXN0ZXJBY3Rpb24yIHRvIGhlbHAgbWFrZSByZWdpc3RlcmluZyB0ZXJtaW5hbCBhY3Rpb25zIG1vcmUgY29uY2lzZS5cbiAqIFRoZSBmb2xsb3dpbmcgZGVmYXVsdCBvcHRpb25zIGFyZSB1c2VkIGlmIHVuZGVmaW5lZDpcbiAqXG4gKiAtIGBmMWA6IHRydWVcbiAqIC0gYGNhdGVnb3J5YDogVGVybWluYWxcbiAqIC0gYHByZWNvbmRpdGlvbmA6IFRlcm1pbmFsQ29udGV4dEtleXMucHJvY2Vzc1N1cHBvcnRlZFxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJUZXJtaW5hbEFjdGlvbihcblx0b3B0aW9uczogSUFjdGlvbjJPcHRpb25zICYgeyBydW46IChjOiBJVGVybWluYWxTZXJ2aWNlc0NvbGxlY3Rpb24sIGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzPzogdW5rbm93biwgYXJnczI/OiB1bmtub3duKSA9PiB2b2lkIHwgUHJvbWlzZTx1bmtub3duPiB9XG4pOiBJRGlzcG9zYWJsZSB7XG5cdC8vIFNldCBkZWZhdWx0c1xuXHRvcHRpb25zLmYxID0gb3B0aW9ucy5mMSA/PyB0cnVlO1xuXHRvcHRpb25zLmNhdGVnb3J5ID0gb3B0aW9ucy5jYXRlZ29yeSA/PyBjYXRlZ29yeTtcblx0b3B0aW9ucy5wcmVjb25kaXRpb24gPSBvcHRpb25zLnByZWNvbmRpdGlvbiA/PyBUZXJtaW5hbENvbnRleHRLZXlzLnByb2Nlc3NTdXBwb3J0ZWQ7XG5cdC8vIFJlbW92ZSBydW4gZnVuY3Rpb24gZnJvbSBvcHRpb25zIHNvIGl0J3Mgbm90IHBhc3NlZCB0aHJvdWdoIHRvIHJlZ2lzdGVyQWN0aW9uMlxuXHRjb25zdCBydW5GdW5jID0gb3B0aW9ucy5ydW47XG5cdGNvbnN0IHN0cmljdE9wdGlvbnM6IElBY3Rpb24yT3B0aW9ucyAmIHsgcnVuPzogKGM6IElUZXJtaW5hbFNlcnZpY2VzQ29sbGVjdGlvbiwgYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M/OiB1bmtub3duKSA9PiB2b2lkIHwgUHJvbWlzZTx1bmtub3duPiB9ID0gb3B0aW9ucztcblx0ZGVsZXRlIChzdHJpY3RPcHRpb25zIGFzIElBY3Rpb24yT3B0aW9ucyAmIHsgcnVuPzogKGM6IElUZXJtaW5hbFNlcnZpY2VzQ29sbGVjdGlvbiwgYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M/OiB1bmtub3duKSA9PiB2b2lkIHwgUHJvbWlzZTx1bmtub3duPiB9KVsncnVuJ107XG5cdC8vIFJlZ2lzdGVyXG5cdHJldHVybiByZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHN0cmljdE9wdGlvbnMgYXMgSUFjdGlvbjJPcHRpb25zKTtcblx0XHR9XG5cdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzPzogdW5rbm93biwgYXJnczI/OiB1bmtub3duKSB7XG5cdFx0XHRyZXR1cm4gcnVuRnVuYyhnZXRUZXJtaW5hbFNlcnZpY2VzKGFjY2Vzc29yKSwgYWNjZXNzb3IsIGFyZ3MsIGFyZ3MyKTtcblx0XHR9XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBwYXJzZUFjdGlvbkFyZ3MoYXJncz86IHVua25vd24pOiBJbnN0YW5jZUNvbnRleHRbXSB8IHVuZGVmaW5lZCB7XG5cdGlmIChBcnJheS5pc0FycmF5KGFyZ3MpKSB7XG5cdFx0aWYgKGFyZ3MuZXZlcnkoZSA9PiBlIGluc3RhbmNlb2YgSW5zdGFuY2VDb250ZXh0KSkge1xuXHRcdFx0cmV0dXJuIGFyZ3MgYXMgSW5zdGFuY2VDb250ZXh0W107XG5cdFx0fVxuXHR9IGVsc2UgaWYgKGFyZ3MgaW5zdGFuY2VvZiBJbnN0YW5jZUNvbnRleHQpIHtcblx0XHRyZXR1cm4gW2FyZ3NdO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG4vKipcbiAqIEEgd3JhcHBlciBhcm91bmQge0BsaW5rIHJlZ2lzdGVyVGVybWluYWxBY3Rpb259IHRoYXQgcnVucyBhIGNhbGxiYWNrIGZvciBhbGwgY3VycmVudGx5IHNlbGVjdGVkXG4gKiBpbnN0YW5jZXMgcHJvdmlkZWQgaW4gdGhlIGFjdGlvbiBjb250ZXh0LiBUaGlzIGZhbGxzIGJhY2sgdG8gdGhlIGFjdGl2ZSBpbnN0YW5jZSBpZiB0aGVyZSBhcmUgbm9cbiAqIGNvbnRleHR1YWwgaW5zdGFuY2VzIHByb3ZpZGVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJDb250ZXh0dWFsSW5zdGFuY2VBY3Rpb24oXG5cdG9wdGlvbnM6IElBY3Rpb24yT3B0aW9ucyAmIHtcblx0XHQvKipcblx0XHQgKiBXaGVuIHNwZWNpZmllZCwgb25seSB0aGlzIHR5cGUgb2YgYWN0aXZlIGluc3RhbmNlIHdpbGwgYmUgdXNlZCB3aGVuIHRoZXJlIGFyZSBub1xuXHRcdCAqIGNvbnRleHR1YWwgaW5zdGFuY2VzLlxuXHRcdCAqL1xuXHRcdGFjdGl2ZUluc3RhbmNlVHlwZT86ICd2aWV3JyB8ICdlZGl0b3InO1xuXHRcdHJ1bjogKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSwgYzogSVRlcm1pbmFsU2VydmljZXNDb2xsZWN0aW9uLCBhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJncz86IHVua25vd24pID0+IHZvaWQgfCBQcm9taXNlPHVua25vd24+O1xuXHRcdC8qKlxuXHRcdCAqIEEgY2FsbGJhY2sgdG8gcnVuIGFmdGVyIHRoZSBgcnVuYCBjYWxsYmFja3MgaGF2ZSBjb21wbGV0ZWQuXG5cdFx0ICogQHBhcmFtIGluc3RhbmNlcyBUaGUgc2VsZWN0ZWQgaW5zdGFuY2UocykgdGhhdCB0aGUgY29tbWFuZCB3YXMgcnVuIG9uLlxuXHRcdCAqL1xuXHRcdHJ1bkFmdGVyPzogKGluc3RhbmNlczogSVRlcm1pbmFsSW5zdGFuY2VbXSwgYzogSVRlcm1pbmFsU2VydmljZXNDb2xsZWN0aW9uLCBhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJncz86IHVua25vd24pID0+IHZvaWQgfCBQcm9taXNlPHVua25vd24+O1xuXHR9XG4pOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IG9yaWdpbmFsUnVuID0gb3B0aW9ucy5ydW47XG5cdHJldHVybiByZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHQuLi5vcHRpb25zLFxuXHRcdHJ1bjogYXN5bmMgKGMsIGFjY2Vzc29yLCBmb2N1c2VkSW5zdGFuY2VBcmdzLCBhbGxJbnN0YW5jZUFyZ3MpID0+IHtcblx0XHRcdGxldCBpbnN0YW5jZXMgPSBnZXRTZWxlY3RlZFZpZXdJbnN0YW5jZXMyKGFjY2Vzc29yLCBhbGxJbnN0YW5jZUFyZ3MpO1xuXHRcdFx0aWYgKCFpbnN0YW5jZXMpIHtcblx0XHRcdFx0Y29uc3QgYWN0aXZlSW5zdGFuY2UgPSAoXG5cdFx0XHRcdFx0b3B0aW9ucy5hY3RpdmVJbnN0YW5jZVR5cGUgPT09ICd2aWV3J1xuXHRcdFx0XHRcdFx0PyBjLmdyb3VwU2VydmljZVxuXHRcdFx0XHRcdFx0OiBvcHRpb25zLmFjdGl2ZUluc3RhbmNlVHlwZSA9PT0gJ2VkaXRvcicgP1xuXHRcdFx0XHRcdFx0XHRjLmVkaXRvclNlcnZpY2Vcblx0XHRcdFx0XHRcdFx0OiBjLnNlcnZpY2Vcblx0XHRcdFx0KS5hY3RpdmVJbnN0YW5jZTtcblx0XHRcdFx0aWYgKCFhY3RpdmVJbnN0YW5jZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpbnN0YW5jZXMgPSBbYWN0aXZlSW5zdGFuY2VdO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdWx0czogKFByb21pc2U8dW5rbm93bj4gfCB2b2lkKVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGluc3RhbmNlIG9mIGluc3RhbmNlcykge1xuXHRcdFx0XHRyZXN1bHRzLnB1c2gob3JpZ2luYWxSdW4oaW5zdGFuY2UsIGMsIGFjY2Vzc29yLCBmb2N1c2VkSW5zdGFuY2VBcmdzKSk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChyZXN1bHRzKTtcblx0XHRcdGlmIChvcHRpb25zLnJ1bkFmdGVyKSB7XG5cdFx0XHRcdG9wdGlvbnMucnVuQWZ0ZXIoaW5zdGFuY2VzLCBjLCBhY2Nlc3NvciwgZm9jdXNlZEluc3RhbmNlQXJncyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcbn1cblxuLyoqXG4gKiBBIHdyYXBwZXIgYXJvdW5kIHtAbGluayByZWdpc3RlclRlcm1pbmFsQWN0aW9ufSB0aGF0IGVuc3VyZXMgYW4gYWN0aXZlIGluc3RhbmNlIGV4aXN0cyBhbmRcbiAqIHByb3ZpZGVzIGl0IHRvIHRoZSBydW4gZnVuY3Rpb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckFjdGl2ZUluc3RhbmNlQWN0aW9uKFxuXHRvcHRpb25zOiBJQWN0aW9uMk9wdGlvbnMgJiB7IHJ1bjogKGFjdGl2ZUluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSwgYzogSVRlcm1pbmFsU2VydmljZXNDb2xsZWN0aW9uLCBhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJncz86IHVua25vd24pID0+IHZvaWQgfCBQcm9taXNlPHVua25vd24+IH1cbik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3Qgb3JpZ2luYWxSdW4gPSBvcHRpb25zLnJ1bjtcblx0cmV0dXJuIHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdC4uLm9wdGlvbnMsXG5cdFx0cnVuOiAoYywgYWNjZXNzb3IsIGFyZ3MpID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZUluc3RhbmNlID0gYy5zZXJ2aWNlLmFjdGl2ZUluc3RhbmNlO1xuXHRcdFx0aWYgKGFjdGl2ZUluc3RhbmNlKSB7XG5cdFx0XHRcdHJldHVybiBvcmlnaW5hbFJ1bihhY3RpdmVJbnN0YW5jZSwgYywgYWNjZXNzb3IsIGFyZ3MpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG59XG5cbi8qKlxuICogQSB3cmFwcGVyIGFyb3VuZCB7QGxpbmsgcmVnaXN0ZXJUZXJtaW5hbEFjdGlvbn0gdGhhdCBlbnN1cmVzIGFuIGFjdGl2ZSB0ZXJtaW5hbFxuICogZXhpc3RzIGFuZCBwcm92aWRlcyBpdCB0byB0aGUgcnVuIGZ1bmN0aW9uLlxuICpcbiAqIFRoaXMgaW5jbHVkZXMgZGV0YWNoZWQgeHRlcm0gdGVybWluYWxzIHRoYXQgYXJlIG5vdCBtYW5hZ2VkIGJ5IGFuIHtAbGluayBJVGVybWluYWxJbnN0YW5jZX0uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckFjdGl2ZVh0ZXJtQWN0aW9uKFxuXHRvcHRpb25zOiBJQWN0aW9uMk9wdGlvbnMgJiB7IHJ1bjogKGFjdGl2ZVRlcm1pbmFsOiBJWHRlcm1UZXJtaW5hbCwgYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSB8IElEZXRhY2hlZFRlcm1pbmFsSW5zdGFuY2UsIGFyZ3M/OiB1bmtub3duKSA9PiB2b2lkIHwgUHJvbWlzZTx1bmtub3duPiB9XG4pOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IG9yaWdpbmFsUnVuID0gb3B0aW9ucy5ydW47XG5cdHJldHVybiByZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHQuLi5vcHRpb25zLFxuXHRcdHJ1bjogKGMsIGFjY2Vzc29yLCBhcmdzKSA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVEZXRhY2hlZCA9IEl0ZXJhYmxlLmZpbmQoYy5zZXJ2aWNlLmRldGFjaGVkSW5zdGFuY2VzLCBkID0+IGQueHRlcm0uaXNGb2N1c2VkKTtcblx0XHRcdGlmIChhY3RpdmVEZXRhY2hlZCkge1xuXHRcdFx0XHRyZXR1cm4gb3JpZ2luYWxSdW4oYWN0aXZlRGV0YWNoZWQueHRlcm0sIGFjY2Vzc29yLCBhY3RpdmVEZXRhY2hlZCwgYXJncyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFjdGl2ZUluc3RhbmNlID0gYy5zZXJ2aWNlLmFjdGl2ZUluc3RhbmNlO1xuXHRcdFx0aWYgKGFjdGl2ZUluc3RhbmNlPy54dGVybSkge1xuXHRcdFx0XHRyZXR1cm4gb3JpZ2luYWxSdW4oYWN0aXZlSW5zdGFuY2UueHRlcm0sIGFjY2Vzc29yLCBhY3RpdmVJbnN0YW5jZSwgYXJncyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVybWluYWxTZXJ2aWNlc0NvbGxlY3Rpb24ge1xuXHRzZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlO1xuXHRjb25maWdTZXJ2aWNlOiBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZTtcblx0Z3JvdXBTZXJ2aWNlOiBJVGVybWluYWxHcm91cFNlcnZpY2U7XG5cdGluc3RhbmNlU2VydmljZTogSVRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlO1xuXHRlZGl0b3JTZXJ2aWNlOiBJVGVybWluYWxFZGl0b3JTZXJ2aWNlO1xuXHRlZGl0aW5nU2VydmljZTogSVRlcm1pbmFsRWRpdGluZ1NlcnZpY2U7XG5cdHByb2ZpbGVTZXJ2aWNlOiBJVGVybWluYWxQcm9maWxlU2VydmljZTtcblx0cHJvZmlsZVJlc29sdmVyU2VydmljZTogSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZTtcbn1cblxuZnVuY3Rpb24gZ2V0VGVybWluYWxTZXJ2aWNlcyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IElUZXJtaW5hbFNlcnZpY2VzQ29sbGVjdGlvbiB7XG5cdHJldHVybiB7XG5cdFx0c2VydmljZTogYWNjZXNzb3IuZ2V0KElUZXJtaW5hbFNlcnZpY2UpLFxuXHRcdGNvbmZpZ1NlcnZpY2U6IGFjY2Vzc29yLmdldChJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSksXG5cdFx0Z3JvdXBTZXJ2aWNlOiBhY2Nlc3Nvci5nZXQoSVRlcm1pbmFsR3JvdXBTZXJ2aWNlKSxcblx0XHRpbnN0YW5jZVNlcnZpY2U6IGFjY2Vzc29yLmdldChJVGVybWluYWxJbnN0YW5jZVNlcnZpY2UpLFxuXHRcdGVkaXRvclNlcnZpY2U6IGFjY2Vzc29yLmdldChJVGVybWluYWxFZGl0b3JTZXJ2aWNlKSxcblx0XHRlZGl0aW5nU2VydmljZTogYWNjZXNzb3IuZ2V0KElUZXJtaW5hbEVkaXRpbmdTZXJ2aWNlKSxcblx0XHRwcm9maWxlU2VydmljZTogYWNjZXNzb3IuZ2V0KElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlKSxcblx0XHRwcm9maWxlUmVzb2x2ZXJTZXJ2aWNlOiBhY2Nlc3Nvci5nZXQoSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSlcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyVGVybWluYWxBY3Rpb25zKCkge1xuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuTmV3SW5BY3RpdmVXb3Jrc3BhY2UsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5uZXdJbkFjdGl2ZVdvcmtzcGFjZScsICdDcmVhdGUgTmV3IFRlcm1pbmFsIChJbiBBY3RpdmUgV29ya3NwYWNlKScpLFxuXHRcdHJ1bjogYXN5bmMgKGMpID0+IHtcblx0XHRcdGlmIChjLnNlcnZpY2UuaXNQcm9jZXNzU3VwcG9ydFJlZ2lzdGVyZWQpIHtcblx0XHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBhd2FpdCBjLnNlcnZpY2UuY3JlYXRlVGVybWluYWwoeyBsb2NhdGlvbjogYy5jb25maWdTZXJ2aWNlLmRlZmF1bHRMb2NhdGlvbiB9KTtcblx0XHRcdFx0aWYgKCFpbnN0YW5jZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjLnNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0XHRhd2FpdCBmb2N1c0FjdGl2ZVRlcm1pbmFsKGluc3RhbmNlLCBjKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdC8vIFJlZ2lzdGVyIG5ldyB3aXRoIHByb2ZpbGUgY29tbWFuZFxuXHRyZWZyZXNoVGVybWluYWxBY3Rpb25zKFtdKTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuQ3JlYXRlVGVybWluYWxFZGl0b3IsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jcmVhdGVUZXJtaW5hbEVkaXRvcicsICdDcmVhdGUgTmV3IFRlcm1pbmFsIGluIEVkaXRvciBBcmVhJyksXG5cdFx0cnVuOiBhc3luYyAoYywgXywgYXJncykgPT4ge1xuXHRcdFx0ZnVuY3Rpb24gaXNDcmVhdGVUZXJtaW5hbE9wdGlvbnMob2JqOiB1bmtub3duKTogb2JqIGlzIElDcmVhdGVUZXJtaW5hbE9wdGlvbnMge1xuXHRcdFx0XHRyZXR1cm4gaXNPYmplY3Qob2JqKSAmJiAnbG9jYXRpb24nIGluIG9iajtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG9wdGlvbnMgPSBpc0NyZWF0ZVRlcm1pbmFsT3B0aW9ucyhhcmdzKSA/IGFyZ3MgOiB7IGxvY2F0aW9uOiB7IHZpZXdDb2x1bW46IEFDVElWRV9HUk9VUCB9IH07XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IGF3YWl0IGMuc2VydmljZS5jcmVhdGVUZXJtaW5hbChvcHRpb25zKTtcblx0XHRcdGF3YWl0IGluc3RhbmNlLmZvY3VzV2hlblJlYWR5KCk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuQ3JlYXRlVGVybWluYWxFZGl0b3JTYW1lR3JvdXAsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jcmVhdGVUZXJtaW5hbEVkaXRvcicsICdDcmVhdGUgTmV3IFRlcm1pbmFsIGluIEVkaXRvciBBcmVhJyksXG5cdFx0ZjE6IGZhbHNlLFxuXHRcdHJ1bjogYXN5bmMgKGMsIGFjY2Vzc29yLCBhcmdzKSA9PiB7XG5cdFx0XHQvLyBGb3JjZSB0aGUgZWRpdG9yIGludG8gdGhlIHNhbWUgZWRpdG9yIGdyb3VwIGlmIGl0J3MgbG9ja2VkLiBUaGlzIGNvbW1hbmQgaXMgb25seSBldmVyXG5cdFx0XHQvLyBjYWxsZWQgd2hlbiBhIHRlcm1pbmFsIGlzIHRoZSBhY3RpdmUgZWRpdG9yXG5cdFx0XHRjb25zdCBlZGl0b3JHcm91cHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gYXdhaXQgYy5zZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKHtcblx0XHRcdFx0bG9jYXRpb246IHtcblx0XHRcdFx0XHR2aWV3Q29sdW1uOiBlZGl0b3JHcm91cFRvQ29sdW1uKGVkaXRvckdyb3Vwc1NlcnZpY2UsIGVkaXRvckdyb3Vwc1NlcnZpY2UuYWN0aXZlR3JvdXApLFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGluc3RhbmNlLmZvY3VzV2hlblJlYWR5KCk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuQ3JlYXRlVGVybWluYWxFZGl0b3JTaWRlLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY3JlYXRlVGVybWluYWxFZGl0b3JTaWRlJywgJ0NyZWF0ZSBOZXcgVGVybWluYWwgaW4gRWRpdG9yIEFyZWEgdG8gdGhlIFNpZGUnKSxcblx0XHRydW46IGFzeW5jIChjKSA9PiB7XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IGF3YWl0IGMuc2VydmljZS5jcmVhdGVUZXJtaW5hbCh7XG5cdFx0XHRcdGxvY2F0aW9uOiB7IHZpZXdDb2x1bW46IFNJREVfR1JPVVAgfVxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCBpbnN0YW5jZS5mb2N1c1doZW5SZWFkeSgpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLk5ld0luTmV3V2luZG93LFxuXHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MubmV3SW5OZXdXaW5kb3csXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuQmFja3F1b3RlLFxuXHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5TW9kLlNoaWZ0IHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuQmFja3F1b3RlIH0sXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdH0sXG5cdFx0cnVuOiBhc3luYyAoYykgPT4ge1xuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBhd2FpdCBjLnNlcnZpY2UuY3JlYXRlVGVybWluYWwoe1xuXHRcdFx0XHRsb2NhdGlvbjoge1xuXHRcdFx0XHRcdHZpZXdDb2x1bW46IEFVWF9XSU5ET1dfR1JPVVAsXG5cdFx0XHRcdFx0YXV4aWxpYXJ5OiB7IGNvbXBhY3Q6IHRydWUgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgaW5zdGFuY2UuZm9jdXNXaGVuUmVhZHkoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQ29udGV4dHVhbEluc3RhbmNlQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuTW92ZVRvRWRpdG9yLFxuXHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MubW92ZVRvRWRpdG9yLFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZV9hbmRfb3BlbmVkLFxuXHRcdGFjdGl2ZUluc3RhbmNlVHlwZTogJ3ZpZXcnLFxuXHRcdHJ1bjogKGluc3RhbmNlLCBjKSA9PiBjLnNlcnZpY2UubW92ZVRvRWRpdG9yKGluc3RhbmNlKSxcblx0XHRydW5BZnRlcjogKGluc3RhbmNlcykgPT4gaW5zdGFuY2VzLmF0KC0xKT8uZm9jdXMoKVxuXHR9KTtcblxuXHRyZWdpc3RlckNvbnRleHR1YWxJbnN0YW5jZUFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLk1vdmVJbnRvTmV3V2luZG93LFxuXHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MubW92ZUludG9OZXdXaW5kb3csXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlX2FuZF9vcGVuZWQsXG5cdFx0cnVuOiAoaW5zdGFuY2UsIGMpID0+IGMuc2VydmljZS5tb3ZlSW50b05ld0VkaXRvcihpbnN0YW5jZSksXG5cdFx0cnVuQWZ0ZXI6IChpbnN0YW5jZXMpID0+IGluc3RhbmNlcy5hdCgtMSk/LmZvY3VzKClcblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLk1vdmVUb1Rlcm1pbmFsUGFuZWwsXG5cdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5tb3ZlVG9UZXJtaW5hbFBhbmVsLFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZV9hbmRfZWRpdG9yQWN0aXZlLFxuXHRcdHJ1bjogKGMsIF8sIGFyZ3MpID0+IHtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IHRvT3B0aW9uYWxVcmkoYXJncykgPz8gYy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlO1xuXHRcdFx0aWYgKHNvdXJjZSkge1xuXHRcdFx0XHRjLnNlcnZpY2UubW92ZVRvVGVybWluYWxWaWV3KHNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuRm9jdXNQcmV2aW91c1BhbmUsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5mb2N1c1ByZXZpb3VzUGFuZScsICdGb2N1cyBQcmV2aW91cyBUZXJtaW5hbCBpbiBUZXJtaW5hbCBHcm91cCcpLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLkxlZnRBcnJvdyxcblx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5BbHQgfCBLZXlDb2RlLlVwQXJyb3ddLFxuXHRcdFx0bWFjOiB7XG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuTGVmdEFycm93LFxuXHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQWx0IHwgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlVwQXJyb3ddXG5cdFx0XHR9LFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXMsIFRlcm1pbmFsQ29udGV4dEtleXMuc3BsaXRUZXJtaW5hbEFjdGl2ZSksXG5cdFx0XHQvLyBTaG91bGQgd2luIG92ZXIgc2VuZCBzZXF1ZW5jZSBjb21tYW5kcyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjU5MzI2XG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDFcblx0XHR9LFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRydW46IGFzeW5jIChjKSA9PiB7XG5cdFx0XHRjLmdyb3VwU2VydmljZS5hY3RpdmVHcm91cD8uZm9jdXNQcmV2aW91c1BhbmUoKTtcblx0XHRcdGF3YWl0IGMuZ3JvdXBTZXJ2aWNlLnNob3dQYW5lbCh0cnVlKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5Gb2N1c05leHRQYW5lLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuZm9jdXNOZXh0UGFuZScsICdGb2N1cyBOZXh0IFRlcm1pbmFsIGluIFRlcm1pbmFsIEdyb3VwJyksXG5cdFx0a2V5YmluZGluZzoge1xuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuUmlnaHRBcnJvdyxcblx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5BbHQgfCBLZXlDb2RlLkRvd25BcnJvd10sXG5cdFx0XHRtYWM6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5SaWdodEFycm93LFxuXHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQWx0IHwgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvd11cblx0XHRcdH0sXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoVGVybWluYWxDb250ZXh0S2V5cy5mb2N1cywgVGVybWluYWxDb250ZXh0S2V5cy5zcGxpdFRlcm1pbmFsQWN0aXZlKSxcblx0XHRcdC8vIFNob3VsZCB3aW4gb3ZlciBzZW5kIHNlcXVlbmNlIGNvbW1hbmRzIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yNTkzMjZcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMVxuXHRcdH0sXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdHJ1bjogYXN5bmMgKGMpID0+IHtcblx0XHRcdGMuZ3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwPy5mb2N1c05leHRQYW5lKCk7XG5cdFx0XHRhd2FpdCBjLmdyb3VwU2VydmljZS5zaG93UGFuZWwodHJ1ZSk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuUmVzaXplUGFuZUxlZnQsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5yZXNpemVQYW5lTGVmdCcsICdSZXNpemUgVGVybWluYWwgTGVmdCcpLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdGxpbnV4OiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5MZWZ0QXJyb3cgfSxcblx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5MZWZ0QXJyb3cgfSxcblx0XHRcdHdoZW46IFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXMsXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdH0sXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdHJ1bjogKGMpID0+IGMuZ3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwPy5yZXNpemVQYW5lKERpcmVjdGlvbi5MZWZ0KVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuUmVzaXplUGFuZVJpZ2h0LFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucmVzaXplUGFuZVJpZ2h0JywgJ1Jlc2l6ZSBUZXJtaW5hbCBSaWdodCcpLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdGxpbnV4OiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5SaWdodEFycm93IH0sXG5cdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuUmlnaHRBcnJvdyB9LFxuXHRcdFx0d2hlbjogVGVybWluYWxDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0fSxcblx0XHRwcmVjb25kaXRpb246IHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGUsXG5cdFx0cnVuOiAoYykgPT4gYy5ncm91cFNlcnZpY2UuYWN0aXZlR3JvdXA/LnJlc2l6ZVBhbmUoRGlyZWN0aW9uLlJpZ2h0KVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuUmVzaXplUGFuZVVwLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucmVzaXplUGFuZVVwJywgJ1Jlc2l6ZSBUZXJtaW5hbCBVcCcpLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5VcEFycm93IH0sXG5cdFx0XHR3aGVuOiBUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHR9LFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRydW46IChjKSA9PiBjLmdyb3VwU2VydmljZS5hY3RpdmVHcm91cD8ucmVzaXplUGFuZShEaXJlY3Rpb24uVXApXG5cdH0pO1xuXG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5SZXNpemVQYW5lRG93bixcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnJlc2l6ZVBhbmVEb3duJywgJ1Jlc2l6ZSBUZXJtaW5hbCBEb3duJyksXG5cdFx0a2V5YmluZGluZzoge1xuXHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLkRvd25BcnJvdyB9LFxuXHRcdFx0d2hlbjogVGVybWluYWxDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0fSxcblx0XHRwcmVjb25kaXRpb246IHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGUsXG5cdFx0cnVuOiAoYykgPT4gYy5ncm91cFNlcnZpY2UuYWN0aXZlR3JvdXA/LnJlc2l6ZVBhbmUoRGlyZWN0aW9uLkRvd24pXG5cdH0pO1xuXG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5Gb2N1cyxcblx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLmZvY3VzLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVELCBhY2Nlc3NpYmxlVmlld09uTGFzdExpbmUsIGFjY2Vzc2libGVWaWV3Q3VycmVudFByb3ZpZGVySWQuaXNFcXVhbFRvKEFjY2Vzc2libGVWaWV3UHJvdmlkZXJJZC5UZXJtaW5hbCkpLFxuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0fSxcblx0XHRwcmVjb25kaXRpb246IHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGUsXG5cdFx0cnVuOiBhc3luYyAoYykgPT4ge1xuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBjLnNlcnZpY2UuYWN0aXZlSW5zdGFuY2UgfHwgYXdhaXQgYy5zZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKHsgbG9jYXRpb246IFRlcm1pbmFsTG9jYXRpb24uUGFuZWwgfSk7XG5cdFx0XHRpZiAoIWluc3RhbmNlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGMuc2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0XHRhd2FpdCBmb2N1c0FjdGl2ZVRlcm1pbmFsKGluc3RhbmNlLCBjKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5Gb2N1c1RhYnMsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5mb2N1cy50YWJzVmlldycsICdGb2N1cyBUZXJtaW5hbCBUYWJzIFZpZXcnKSxcblx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuQmFja3NsYXNoLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihUZXJtaW5hbENvbnRleHRLZXlzLnRhYnNGb2N1cywgVGVybWluYWxDb250ZXh0S2V5cy5mb2N1cyksXG5cdFx0fSxcblx0XHRwcmVjb25kaXRpb246IHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGUsXG5cdFx0cnVuOiAoYykgPT4gYy5ncm91cFNlcnZpY2UuZm9jdXNUYWJzKClcblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkZvY3VzTmV4dCxcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmZvY3VzTmV4dCcsICdGb2N1cyBOZXh0IFRlcm1pbmFsIEdyb3VwJyksXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5QYWdlRG93bixcblx0XHRcdG1hYzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuQnJhY2tldFJpZ2h0XG5cdFx0XHR9LFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXMsIFRlcm1pbmFsQ29udGV4dEtleXMuZWRpdG9yRm9jdXMubmVnYXRlKCkpLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHR9LFxuXHRcdHJ1bjogYXN5bmMgKGMpID0+IHtcblx0XHRcdGMuZ3JvdXBTZXJ2aWNlLnNldEFjdGl2ZUdyb3VwVG9OZXh0KCk7XG5cdFx0XHRhd2FpdCBjLmdyb3VwU2VydmljZS5zaG93UGFuZWwodHJ1ZSk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuRm9jdXNQcmV2aW91cyxcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmZvY3VzUHJldmlvdXMnLCAnRm9jdXMgUHJldmlvdXMgVGVybWluYWwgR3JvdXAnKSxcblx0XHRwcmVjb25kaXRpb246IHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGUsXG5cdFx0a2V5YmluZGluZzoge1xuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlBhZ2VVcCxcblx0XHRcdG1hYzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuQnJhY2tldExlZnRcblx0XHRcdH0sXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoVGVybWluYWxDb250ZXh0S2V5cy5mb2N1cywgVGVybWluYWxDb250ZXh0S2V5cy5lZGl0b3JGb2N1cy5uZWdhdGUoKSksXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdH0sXG5cdFx0cnVuOiBhc3luYyAoYykgPT4ge1xuXHRcdFx0Yy5ncm91cFNlcnZpY2Uuc2V0QWN0aXZlR3JvdXBUb1ByZXZpb3VzKCk7XG5cdFx0XHRhd2FpdCBjLmdyb3VwU2VydmljZS5zaG93UGFuZWwodHJ1ZSk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuUnVuU2VsZWN0ZWRUZXh0LFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucnVuU2VsZWN0ZWRUZXh0JywgJ1J1biBTZWxlY3RlZCBUZXh0IEluIEFjdGl2ZSBUZXJtaW5hbCcpLFxuXHRcdHJ1bjogYXN5bmMgKGMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCBjb2RlRWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZWRpdG9yID0gY29kZUVkaXRvclNlcnZpY2UuZ2V0QWN0aXZlQ29kZUVkaXRvcigpO1xuXHRcdFx0aWYgKCFlZGl0b3IgfHwgIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGluc3RhbmNlID0gYXdhaXQgYy5zZXJ2aWNlLmdldEFjdGl2ZU9yQ3JlYXRlSW5zdGFuY2UoeyBhY2NlcHRzSW5wdXQ6IHRydWUgfSk7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBlZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRsZXQgdGV4dDogc3RyaW5nO1xuXHRcdFx0aWYgKHNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdFx0dGV4dCA9IGVkaXRvci5nZXRNb2RlbCgpLmdldExpbmVDb250ZW50KHNlbGVjdGlvbi5zZWxlY3Rpb25TdGFydExpbmVOdW1iZXIpLnRyaW0oKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGVuZE9mTGluZVByZWZlcmVuY2UgPSBpc1dpbmRvd3MgPyBFbmRPZkxpbmVQcmVmZXJlbmNlLkxGIDogRW5kT2ZMaW5lUHJlZmVyZW5jZS5DUkxGO1xuXHRcdFx0XHR0ZXh0ID0gZWRpdG9yLmdldE1vZGVsKCkuZ2V0VmFsdWVJblJhbmdlKHNlbGVjdGlvbiwgZW5kT2ZMaW5lUHJlZmVyZW5jZSk7XG5cdFx0XHR9XG5cdFx0XHRpbnN0YW5jZS5zZW5kVGV4dCh0ZXh0LCB0cnVlLCB0cnVlKTtcblx0XHRcdGF3YWl0IGMuc2VydmljZS5yZXZlYWxBY3RpdmVUZXJtaW5hbCh0cnVlKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5SdW5BY3RpdmVGaWxlLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucnVuQWN0aXZlRmlsZScsICdSdW4gQWN0aXZlIEZpbGUgSW4gQWN0aXZlIFRlcm1pbmFsJyksXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdHJ1bjogYXN5bmMgKGMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCBjb2RlRWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCB3b3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSk7XG5cblx0XHRcdGNvbnN0IGVkaXRvciA9IGNvZGVFZGl0b3JTZXJ2aWNlLmdldEFjdGl2ZUNvZGVFZGl0b3IoKTtcblx0XHRcdGlmICghZWRpdG9yIHx8ICFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGluc3RhbmNlID0gYXdhaXQgYy5zZXJ2aWNlLmdldEFjdGl2ZU9yQ3JlYXRlSW5zdGFuY2UoeyBhY2NlcHRzSW5wdXQ6IHRydWUgfSk7XG5cdFx0XHRjb25zdCBpc1JlbW90ZSA9IGluc3RhbmNlID8gaW5zdGFuY2UuaGFzUmVtb3RlQXV0aG9yaXR5IDogKHdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkgPyB0cnVlIDogZmFsc2UpO1xuXHRcdFx0Y29uc3QgdXJpID0gZWRpdG9yLmdldE1vZGVsKCkudXJpO1xuXHRcdFx0aWYgKCghaXNSZW1vdGUgJiYgdXJpLnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlICYmIHVyaS5zY2hlbWUgIT09IFNjaGVtYXMudnNjb2RlVXNlckRhdGEpIHx8IChpc1JlbW90ZSAmJiB1cmkuc2NoZW1lICE9PSBTY2hlbWFzLnZzY29kZVJlbW90ZSkpIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS53YXJuKGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnJ1bkFjdGl2ZUZpbGUubm9GaWxlJywgJ09ubHkgZmlsZXMgb24gZGlzayBjYW4gYmUgcnVuIGluIHRoZSB0ZXJtaW5hbCcpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUT0RPOiBDb252ZXJ0IHRoaXMgdG8gY3RybCtjLCBjdHJsK3YgZm9yIHB3c2g/XG5cdFx0XHRhd2FpdCBpbnN0YW5jZS5zZW5kUGF0aCh1cmksIHRydWUpO1xuXHRcdFx0cmV0dXJuIGMuZ3JvdXBTZXJ2aWNlLnNob3dQYW5lbCgpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3RpdmVYdGVybUFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlNjcm9sbERvd25MaW5lLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2Nyb2xsRG93bicsICdTY3JvbGwgRG93biAoTGluZSknKSxcblx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLlBhZ2VEb3duLFxuXHRcdFx0bGludXg6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkRvd25BcnJvdyB9LFxuXHRcdFx0d2hlbjogc2hhcmVkV2hlbkNsYXVzZS5mb2N1c0luQW55X2FuZF9ub3JtYWxCdWZmZXIsXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdH0sXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdHJ1bjogKHh0ZXJtKSA9PiB4dGVybS5zY3JvbGxEb3duTGluZSgpXG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aXZlWHRlcm1BY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TY3JvbGxEb3duUGFnZSxcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNjcm9sbERvd25QYWdlJywgJ1Njcm9sbCBEb3duIChQYWdlKScpLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuUGFnZURvd24sXG5cdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5Q29kZS5QYWdlRG93biB9LFxuXHRcdFx0d2hlbjogc2hhcmVkV2hlbkNsYXVzZS5mb2N1c0luQW55X2FuZF9ub3JtYWxCdWZmZXIsXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdH0sXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdHJ1bjogKHh0ZXJtKSA9PiB4dGVybS5zY3JvbGxEb3duUGFnZSgpXG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aXZlWHRlcm1BY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TY3JvbGxUb0JvdHRvbSxcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNjcm9sbFRvQm90dG9tJywgJ1Njcm9sbCB0byBCb3R0b20nKSxcblx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRW5kLFxuXHRcdFx0bGludXg6IHsgcHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5FbmQgfSxcblx0XHRcdHdoZW46IHNoYXJlZFdoZW5DbGF1c2UuZm9jdXNJbkFueV9hbmRfbm9ybWFsQnVmZmVyLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHR9LFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRydW46ICh4dGVybSkgPT4geHRlcm0uc2Nyb2xsVG9Cb3R0b20oKVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGl2ZVh0ZXJtQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU2Nyb2xsVXBMaW5lLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2Nyb2xsVXAnLCAnU2Nyb2xsIFVwIChMaW5lKScpLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuUGFnZVVwLFxuXHRcdFx0bGludXg6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlVwQXJyb3cgfSxcblx0XHRcdHdoZW46IHNoYXJlZFdoZW5DbGF1c2UuZm9jdXNJbkFueV9hbmRfbm9ybWFsQnVmZmVyLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHR9LFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRydW46ICh4dGVybSkgPT4geHRlcm0uc2Nyb2xsVXBMaW5lKClcblx0fSk7XG5cblx0cmVnaXN0ZXJBY3RpdmVYdGVybUFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlNjcm9sbFVwUGFnZSxcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNjcm9sbFVwUGFnZScsICdTY3JvbGwgVXAgKFBhZ2UpJyksXG5cdFx0ZjE6IHRydWUsXG5cdFx0a2V5YmluZGluZzoge1xuXHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5QYWdlVXAsXG5cdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5Q29kZS5QYWdlVXAgfSxcblx0XHRcdHdoZW46IHNoYXJlZFdoZW5DbGF1c2UuZm9jdXNJbkFueV9hbmRfbm9ybWFsQnVmZmVyLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHR9LFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRydW46ICh4dGVybSkgPT4geHRlcm0uc2Nyb2xsVXBQYWdlKClcblx0fSk7XG5cblx0cmVnaXN0ZXJBY3RpdmVYdGVybUFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlNjcm9sbFRvVG9wLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2Nyb2xsVG9Ub3AnLCAnU2Nyb2xsIHRvIFRvcCcpLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Ib21lLFxuXHRcdFx0bGludXg6IHsgcHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5Ib21lIH0sXG5cdFx0XHR3aGVuOiBzaGFyZWRXaGVuQ2xhdXNlLmZvY3VzSW5BbnlfYW5kX25vcm1hbEJ1ZmZlcixcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0fSxcblx0XHRwcmVjb25kaXRpb246IHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGUsXG5cdFx0cnVuOiAoeHRlcm0pID0+IHh0ZXJtLnNjcm9sbFRvVG9wKClcblx0fSk7XG5cblx0cmVnaXN0ZXJBY3RpdmVYdGVybUFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkNsZWFyU2VsZWN0aW9uLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY2xlYXJTZWxlY3Rpb24nLCAnQ2xlYXIgU2VsZWN0aW9uJyksXG5cdFx0a2V5YmluZGluZzoge1xuXHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoVGVybWluYWxDb250ZXh0S2V5cy5mb2N1c0luQW55LCBUZXJtaW5hbENvbnRleHRLZXlzLnRleHRTZWxlY3RlZCwgVGVybWluYWxDb250ZXh0S2V5cy5ub3RGaW5kVmlzaWJsZSksXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdH0sXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdHJ1bjogKHh0ZXJtKSA9PiB7XG5cdFx0XHRpZiAoeHRlcm0uaGFzU2VsZWN0aW9uKCkpIHtcblx0XHRcdFx0eHRlcm0uY2xlYXJTZWxlY3Rpb24oKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5DaGFuZ2VJY29uLFxuXHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MuY2hhbmdlSWNvbixcblx0XHRwcmVjb25kaXRpb246IHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGUsXG5cdFx0cnVuOiAoYywgXywgYXJnczogdW5rbm93bikgPT4gZ2V0UmVzb3VyY2VPckFjdGl2ZUluc3RhbmNlKGMsIGFyZ3MpPy5jaGFuZ2VJY29uKClcblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkNoYW5nZUljb25BY3RpdmVUYWIsXG5cdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5jaGFuZ2VJY29uLFxuXHRcdGYxOiBmYWxzZSxcblx0XHRwcmVjb25kaXRpb246IHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGVfYW5kX3Npbmd1bGFyU2VsZWN0aW9uLFxuXHRcdHJ1bjogYXN5bmMgKGMsIGFjY2Vzc29yLCBhcmdzKSA9PiB7XG5cdFx0XHRsZXQgaWNvbjogVGVybWluYWxJY29uIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGMuZ3JvdXBTZXJ2aWNlLmxhc3RBY2Nlc3NlZE1lbnUgPT09ICdpbmxpbmUtdGFiJykge1xuXHRcdFx0XHRnZXRSZXNvdXJjZU9yQWN0aXZlSW5zdGFuY2UoYywgYXJncyk/LmNoYW5nZUljb24oKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCB0ZXJtaW5hbCBvZiBnZXRTZWxlY3RlZFZpZXdJbnN0YW5jZXMoYWNjZXNzb3IpID8/IFtdKSB7XG5cdFx0XHRcdGljb24gPSBhd2FpdCB0ZXJtaW5hbC5jaGFuZ2VJY29uKGljb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkNoYW5nZUNvbG9yLFxuXHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MuY2hhbmdlQ29sb3IsXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdHJ1bjogKGMsIF8sIGFyZ3MpID0+IGdldFJlc291cmNlT3JBY3RpdmVJbnN0YW5jZShjLCBhcmdzKT8uY2hhbmdlQ29sb3IoKVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuQ2hhbmdlQ29sb3JBY3RpdmVUYWIsXG5cdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5jaGFuZ2VDb2xvcixcblx0XHRmMTogZmFsc2UsXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlX2FuZF9zaW5ndWxhclNlbGVjdGlvbixcblx0XHRydW46IGFzeW5jIChjLCBhY2Nlc3NvciwgYXJncykgPT4ge1xuXHRcdFx0bGV0IGNvbG9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgaSA9IDA7XG5cdFx0XHRpZiAoYy5ncm91cFNlcnZpY2UubGFzdEFjY2Vzc2VkTWVudSA9PT0gJ2lubGluZS10YWInKSB7XG5cdFx0XHRcdGdldFJlc291cmNlT3JBY3RpdmVJbnN0YW5jZShjLCBhcmdzKT8uY2hhbmdlQ29sb3IoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCB0ZXJtaW5hbCBvZiBnZXRTZWxlY3RlZFZpZXdJbnN0YW5jZXMoYWNjZXNzb3IpID8/IFtdKSB7XG5cdFx0XHRcdGNvbnN0IHNraXBRdWlja1BpY2sgPSBpICE9PSAwO1xuXHRcdFx0XHQvLyBBbHdheXMgc2hvdyB0aGUgcXVpY2twaWNrIG9uIHRoZSBmaXJzdCBpdGVyYXRpb25cblx0XHRcdFx0Y29sb3IgPSBhd2FpdCB0ZXJtaW5hbC5jaGFuZ2VDb2xvcihjb2xvciwgc2tpcFF1aWNrUGljayk7XG5cdFx0XHRcdGkrKztcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5SZW5hbWUsXG5cdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5yZW5hbWUsXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdHJ1bjogKGMsIGFjY2Vzc29yLCBhcmdzKSA9PiByZW5hbWVXaXRoUXVpY2tQaWNrKGMsIGFjY2Vzc29yLCBhcmdzKVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuUmVuYW1lQWN0aXZlVGFiLFxuXHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MucmVuYW1lLFxuXHRcdGYxOiBmYWxzZSxcblx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkYyLFxuXHRcdFx0bWFjOiB7XG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRW50ZXJcblx0XHRcdH0sXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoVGVybWluYWxDb250ZXh0S2V5cy50YWJzRm9jdXMpLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHR9LFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZV9hbmRfc2luZ3VsYXJTZWxlY3Rpb24sXG5cdFx0cnVuOiBhc3luYyAoYywgYWNjZXNzb3IpID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsR3JvdXBTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXJtaW5hbEdyb3VwU2VydmljZSk7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGluc3RhbmNlcyA9IGdldFNlbGVjdGVkVmlld0luc3RhbmNlcyhhY2Nlc3Nvcik7XG5cdFx0XHRjb25zdCBmaXJzdEluc3RhbmNlID0gaW5zdGFuY2VzPy5bMF07XG5cdFx0XHRpZiAoIWZpcnN0SW5zdGFuY2UpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGVybWluYWxHcm91cFNlcnZpY2UubGFzdEFjY2Vzc2VkTWVudSA9PT0gJ2lubGluZS10YWInKSB7XG5cdFx0XHRcdHJldHVybiByZW5hbWVXaXRoUXVpY2tQaWNrKGMsIGFjY2Vzc29yLCBmaXJzdEluc3RhbmNlKTtcblx0XHRcdH1cblxuXHRcdFx0Yy5lZGl0aW5nU2VydmljZS5zZXRFZGl0aW5nVGVybWluYWwoZmlyc3RJbnN0YW5jZSk7XG5cdFx0XHRjLmVkaXRpbmdTZXJ2aWNlLnNldEVkaXRhYmxlKGZpcnN0SW5zdGFuY2UsIHtcblx0XHRcdFx0dmFsaWRhdGlvbk1lc3NhZ2U6IHZhbHVlID0+IHZhbGlkYXRlVGVybWluYWxOYW1lKHZhbHVlKSxcblx0XHRcdFx0b25GaW5pc2g6IGFzeW5jICh2YWx1ZSwgc3VjY2VzcykgPT4ge1xuXHRcdFx0XHRcdC8vIENhbmNlbCBlZGl0aW5nIGZpcnN0IGFzIGluc3RhbmNlLnJlbmFtZSB3aWxsIHRyaWdnZXIgYSByZXJlbmRlciBhdXRvbWF0aWNhbGx5XG5cdFx0XHRcdFx0Yy5lZGl0aW5nU2VydmljZS5zZXRFZGl0YWJsZShmaXJzdEluc3RhbmNlLCBudWxsKTtcblx0XHRcdFx0XHRjLmVkaXRpbmdTZXJ2aWNlLnNldEVkaXRpbmdUZXJtaW5hbCh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGlmIChzdWNjZXNzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwcm9taXNlczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGluc3RhbmNlIG9mIGluc3RhbmNlcykge1xuXHRcdFx0XHRcdFx0XHRwcm9taXNlcy5wdXNoKChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgaW5zdGFuY2UucmVuYW1lKHZhbHVlKTtcblx0XHRcdFx0XHRcdFx0fSkoKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aXZlSW5zdGFuY2VBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5EZXRhY2hTZXNzaW9uLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuZGV0YWNoU2Vzc2lvbicsICdEZXRhY2ggU2Vzc2lvbicpLFxuXHRcdHJ1bjogKGFjdGl2ZUluc3RhbmNlKSA9PiBhY3RpdmVJbnN0YW5jZS5kZXRhY2hQcm9jZXNzQW5kRGlzcG9zZShUZXJtaW5hbEV4aXRSZWFzb24uVXNlcilcblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkF0dGFjaFRvU2Vzc2lvbixcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmF0dGFjaFRvU2Vzc2lvbicsICdBdHRhY2ggdG8gU2Vzc2lvbicpLFxuXHRcdHJ1bjogYXN5bmMgKGMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgbGFiZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYWJlbFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgcmVtb3RlQWdlbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElSZW1vdGVBZ2VudFNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cblx0XHRcdGNvbnN0IHJlbW90ZUF1dGhvcml0eSA9IHJlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCk/LnJlbW90ZUF1dGhvcml0eSA/PyB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBiYWNrZW5kID0gYXdhaXQgYWNjZXNzb3IuZ2V0KElUZXJtaW5hbEluc3RhbmNlU2VydmljZSkuZ2V0QmFja2VuZChyZW1vdGVBdXRob3JpdHkpO1xuXG5cdFx0XHRpZiAoIWJhY2tlbmQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBiYWNrZW5kIHJlZ2lzdGVyZWQgZm9yIHJlbW90ZSBhdXRob3JpdHkgJyR7cmVtb3RlQXV0aG9yaXR5fSdgKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGVybXMgPSBhd2FpdCBiYWNrZW5kLmxpc3RQcm9jZXNzZXMoKTtcblxuXHRcdFx0YmFja2VuZC5yZWR1Y2VDb25uZWN0aW9uR3JhY2VUaW1lKCk7XG5cblx0XHRcdGNvbnN0IHVuYXR0YWNoZWRUZXJtcyA9IHRlcm1zLmZpbHRlcih0ZXJtID0+ICFjLnNlcnZpY2UuaXNBdHRhY2hlZFRvVGVybWluYWwodGVybSkpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSB1bmF0dGFjaGVkVGVybXMubWFwKHRlcm0gPT4ge1xuXHRcdFx0XHRjb25zdCBjd2RMYWJlbCA9IGxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChVUkkuZmlsZSh0ZXJtLmN3ZCkpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGxhYmVsOiB0ZXJtLnRpdGxlLFxuXHRcdFx0XHRcdGRldGFpbDogdGVybS53b3Jrc3BhY2VOYW1lID8gYCR7dGVybS53b3Jrc3BhY2VOYW1lfSBcXHUyRTMxICR7Y3dkTGFiZWx9YCA6IGN3ZExhYmVsLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB0ZXJtLnBpZCA/IFN0cmluZyh0ZXJtLnBpZCkgOiAnJyxcblx0XHRcdFx0XHR0ZXJtXG5cdFx0XHRcdH07XG5cdFx0XHR9KTtcblx0XHRcdGlmIChpdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5pbmZvKGxvY2FsaXplKCdub1VuYXR0YWNoZWRUZXJtaW5hbHMnLCAnVGhlcmUgYXJlIG5vIHVuYXR0YWNoZWQgdGVybWluYWxzIHRvIGF0dGFjaCB0bycpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2VsZWN0ZWQgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrPElSZW1vdGVUZXJtaW5hbFBpY2s+KGl0ZW1zLCB7IGNhblBpY2tNYW55OiBmYWxzZSB9KTtcblx0XHRcdGlmIChzZWxlY3RlZCkge1xuXHRcdFx0XHRjb25zdCBpbnN0YW5jZSA9IGF3YWl0IGMuc2VydmljZS5jcmVhdGVUZXJtaW5hbCh7XG5cdFx0XHRcdFx0Y29uZmlnOiB7IGF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzOiBzZWxlY3RlZC50ZXJtIH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGMuc2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0XHRcdGF3YWl0IGZvY3VzQWN0aXZlVGVybWluYWwoaW5zdGFuY2UsIGMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3RpdmVJbnN0YW5jZUFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlNjcm9sbFRvUHJldmlvdXNDb21tYW5kLFxuXHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3Muc2Nyb2xsVG9QcmV2aW91c0NvbW1hbmQsXG5cdFx0a2V5YmluZGluZzoge1xuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlVwQXJyb3csXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoVGVybWluYWxDb250ZXh0S2V5cy5mb2N1cywgQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRC5uZWdhdGUoKSksXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdH0sXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdGljb246IENvZGljb24uYXJyb3dVcCxcblx0XHRtZW51OiBbXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogNCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVEVSTUlOQUxfVklFV19JRCksXG5cdFx0XHRcdGlzSGlkZGVuQnlEZWZhdWx0OiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0Li4uW01lbnVJZC5FZGl0b3JUaXRsZSwgTWVudUlkLkNvbXBhY3RXaW5kb3dFZGl0b3JUaXRsZV0ubWFwKGlkID0+ICh7XG5cdFx0XHRcdGlkLFxuXHRcdFx0XHRncm91cDogJzFfc2hlbGxJbnRlZ3JhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiA0LFxuXHRcdFx0XHR3aGVuOiBSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhTY2hlbWFzLnZzY29kZVRlcm1pbmFsKSxcblx0XHRcdFx0aXNIaWRkZW5CeURlZmF1bHQ6IHRydWVcblx0XHRcdH0pKSxcblx0XHRdLFxuXHRcdHJ1bjogKGFjdGl2ZUluc3RhbmNlKSA9PiBhY3RpdmVJbnN0YW5jZS54dGVybT8ubWFya1RyYWNrZXIuc2Nyb2xsVG9QcmV2aW91c01hcmsodW5kZWZpbmVkLCB1bmRlZmluZWQsIGFjdGl2ZUluc3RhbmNlLmNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pKVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGl2ZUluc3RhbmNlQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU2Nyb2xsVG9OZXh0Q29tbWFuZCxcblx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLnNjcm9sbFRvTmV4dENvbW1hbmQsXG5cdFx0a2V5YmluZGluZzoge1xuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzLCBDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVELm5lZ2F0ZSgpKSxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0fSxcblx0XHRwcmVjb25kaXRpb246IHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGUsXG5cdFx0aWNvbjogQ29kaWNvbi5hcnJvd0Rvd24sXG5cdFx0bWVudTogW1xuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFRFUk1JTkFMX1ZJRVdfSUQpLFxuXHRcdFx0XHRpc0hpZGRlbkJ5RGVmYXVsdDogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdC4uLltNZW51SWQuRWRpdG9yVGl0bGUsIE1lbnVJZC5Db21wYWN0V2luZG93RWRpdG9yVGl0bGVdLm1hcChpZCA9PiAoe1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0Z3JvdXA6ICcxX3NoZWxsSW50ZWdyYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogNSxcblx0XHRcdFx0d2hlbjogUmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oU2NoZW1hcy52c2NvZGVUZXJtaW5hbCksXG5cdFx0XHRcdGlzSGlkZGVuQnlEZWZhdWx0OiB0cnVlXG5cdFx0XHR9KSksXG5cdFx0XSxcblx0XHRydW46IChhY3RpdmVJbnN0YW5jZSkgPT4ge1xuXHRcdFx0YWN0aXZlSW5zdGFuY2UueHRlcm0/Lm1hcmtUcmFja2VyLnNjcm9sbFRvTmV4dE1hcmsoKTtcblx0XHRcdGFjdGl2ZUluc3RhbmNlLmZvY3VzKCk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGl2ZUluc3RhbmNlQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU2VsZWN0VG9QcmV2aW91c0NvbW1hbmQsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zZWxlY3RUb1ByZXZpb3VzQ29tbWFuZCcsICdTZWxlY3QgdG8gUHJldmlvdXMgQ29tbWFuZCcpLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5VcEFycm93LFxuXHRcdFx0d2hlbjogVGVybWluYWxDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0fSxcblx0XHRwcmVjb25kaXRpb246IHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGUsXG5cdFx0cnVuOiAoYWN0aXZlSW5zdGFuY2UpID0+IHtcblx0XHRcdGFjdGl2ZUluc3RhbmNlLnh0ZXJtPy5tYXJrVHJhY2tlci5zZWxlY3RUb1ByZXZpb3VzTWFyaygpO1xuXHRcdFx0YWN0aXZlSW5zdGFuY2UuZm9jdXMoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aXZlSW5zdGFuY2VBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TZWxlY3RUb05leHRDb21tYW5kLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2VsZWN0VG9OZXh0Q29tbWFuZCcsICdTZWxlY3QgdG8gTmV4dCBDb21tYW5kJyksXG5cdFx0a2V5YmluZGluZzoge1xuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdHdoZW46IFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXMsXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdH0sXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdHJ1bjogKGFjdGl2ZUluc3RhbmNlKSA9PiB7XG5cdFx0XHRhY3RpdmVJbnN0YW5jZS54dGVybT8ubWFya1RyYWNrZXIuc2VsZWN0VG9OZXh0TWFyaygpO1xuXHRcdFx0YWN0aXZlSW5zdGFuY2UuZm9jdXMoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aXZlWHRlcm1BY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TZWxlY3RUb1ByZXZpb3VzTGluZSxcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNlbGVjdFRvUHJldmlvdXNMaW5lJywgJ1NlbGVjdCB0byBQcmV2aW91cyBMaW5lJyksXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdHJ1bjogYXN5bmMgKHh0ZXJtLCBfLCBpbnN0YW5jZSkgPT4ge1xuXHRcdFx0eHRlcm0ubWFya1RyYWNrZXIuc2VsZWN0VG9QcmV2aW91c0xpbmUoKTtcblx0XHRcdC8vIHByZWZlciB0byBjYWxsIGZvY3VzIG9uIHRoZSBUZXJtaW5hbEluc3RhbmNlIGZvciBhZGRpdGlvbmFsIGFjY2Vzc2liaWxpdHkgdHJpZ2dlcnNcblx0XHRcdChpbnN0YW5jZSB8fCB4dGVybSkuZm9jdXMoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aXZlWHRlcm1BY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TZWxlY3RUb05leHRMaW5lLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2VsZWN0VG9OZXh0TGluZScsICdTZWxlY3QgdG8gTmV4dCBMaW5lJyksXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdHJ1bjogYXN5bmMgKHh0ZXJtLCBfLCBpbnN0YW5jZSkgPT4ge1xuXHRcdFx0eHRlcm0ubWFya1RyYWNrZXIuc2VsZWN0VG9OZXh0TGluZSgpO1xuXHRcdFx0Ly8gcHJlZmVyIHRvIGNhbGwgZm9jdXMgb24gdGhlIFRlcm1pbmFsSW5zdGFuY2UgZm9yIGFkZGl0aW9uYWwgYWNjZXNzaWJpbGl0eSB0cmlnZ2Vyc1xuXHRcdFx0KGluc3RhbmNlIHx8IHh0ZXJtKS5mb2N1cygpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLk5ld1dpdGhDd2QsXG5cdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5uZXdXaXRoQ3dkLFxuXHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogdGVybWluYWxTdHJpbmdzLm5ld1dpdGhDd2QudmFsdWUsXG5cdFx0XHRhcmdzOiBbe1xuXHRcdFx0XHRuYW1lOiAnYXJncycsXG5cdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHJlcXVpcmVkOiBbJ2N3ZCddLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGN3ZDoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwubmV3V2l0aEN3ZC5jd2QnLCBcIlRoZSBkaXJlY3RvcnkgdG8gc3RhcnQgdGhlIHRlcm1pbmFsIGF0XCIpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1cblx0XHRcdH1dXG5cdFx0fSxcblx0XHRydW46IGFzeW5jIChjLCBfLCBhcmdzKSA9PiB7XG5cdFx0XHRjb25zdCBjd2QgPSBhcmdzID8gdG9PcHRpb25hbFN0cmluZygoPHsgY3dkPzogc3RyaW5nIH0+YXJncykuY3dkKSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gYXdhaXQgYy5zZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKHsgY3dkIH0pO1xuXHRcdFx0aWYgKCFpbnN0YW5jZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjLnNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0YXdhaXQgZm9jdXNBY3RpdmVUZXJtaW5hbChpbnN0YW5jZSwgYyk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGl2ZUluc3RhbmNlQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuUmVuYW1lV2l0aEFyZ3MsXG5cdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5yZW5hbWVXaXRoQXJncyxcblx0XHRtZXRhZGF0YToge1xuXHRcdFx0ZGVzY3JpcHRpb246IHRlcm1pbmFsU3RyaW5ncy5yZW5hbWVXaXRoQXJncy52YWx1ZSxcblx0XHRcdGFyZ3M6IFt7XG5cdFx0XHRcdG5hbWU6ICdhcmdzJyxcblx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IFsnbmFtZSddLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdG5hbWU6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnJlbmFtZVdpdGhBcmcubmFtZScsIFwiVGhlIG5ldyBuYW1lIGZvciB0aGUgdGVybWluYWxcIiksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRtaW5MZW5ndGg6IDFcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1dXG5cdFx0fSxcblx0XHRwcmVjb25kaXRpb246IHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGUsXG5cdFx0ZjE6IGZhbHNlLFxuXHRcdHJ1bjogYXN5bmMgKGFjdGl2ZUluc3RhbmNlLCBjLCBhY2Nlc3NvciwgYXJncykgPT4ge1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCBuYW1lID0gYXJncyA/IHRvT3B0aW9uYWxTdHJpbmcoKDx7IG5hbWU/OiBzdHJpbmcgfT5hcmdzKS5uYW1lKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmICghbmFtZSkge1xuXHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucmVuYW1lV2l0aEFyZy5ub05hbWUnLCBcIk5vIG5hbWUgYXJndW1lbnQgcHJvdmlkZWRcIikpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhY3RpdmVJbnN0YW5jZS5yZW5hbWUobmFtZSk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGl2ZUluc3RhbmNlQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuUmVsYXVuY2gsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5yZWxhdW5jaCcsICdSZWxhdW5jaCBBY3RpdmUgVGVybWluYWwnKSxcblx0XHRydW46IChhY3RpdmVJbnN0YW5jZSkgPT4gYWN0aXZlSW5zdGFuY2UucmVsYXVuY2goKVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU3BsaXQsXG5cdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5zcGxpdCxcblx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKFRlcm1pbmFsQ29udGV4dEtleXMucHJvY2Vzc1N1cHBvcnRlZCwgVGVybWluYWxDb250ZXh0S2V5cy53ZWJFeHRlbnNpb25Db250cmlidXRlZFByb2ZpbGUpLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5EaWdpdDUsXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdG1hYzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQmFja3NsYXNoLFxuXHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuV2luQ3RybCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRGlnaXQ1XVxuXHRcdFx0fSxcblx0XHRcdHdoZW46IFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXNcblx0XHR9LFxuXHRcdGljb246IENvZGljb24uc3BsaXRIb3Jpem9udGFsLFxuXHRcdHJ1bjogYXN5bmMgKGMsIGFjY2Vzc29yLCBhcmdzKSA9PiB7XG5cdFx0XHRjb25zdCBvcHRpb25zT3JQcm9maWxlID0gaXNPYmplY3QoYXJncykgPyBhcmdzIGFzIElDcmVhdGVUZXJtaW5hbE9wdGlvbnMgfCBJVGVybWluYWxQcm9maWxlIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cdFx0XHRjb25zdCBvcHRpb25zID0gY29udmVydE9wdGlvbnNPclByb2ZpbGVUb09wdGlvbnMob3B0aW9uc09yUHJvZmlsZSk7XG5cdFx0XHRjb25zdCBhY3RpdmVJbnN0YW5jZSA9IChhd2FpdCBjLnNlcnZpY2UuZ2V0SW5zdGFuY2VIb3N0KG9wdGlvbnM/LmxvY2F0aW9uKSkuYWN0aXZlSW5zdGFuY2U7XG5cdFx0XHRpZiAoIWFjdGl2ZUluc3RhbmNlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGN3ZCA9IGF3YWl0IGdldEN3ZEZvclNwbGl0KGFjdGl2ZUluc3RhbmNlLCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLCBjb21tYW5kU2VydmljZSwgYy5jb25maWdTZXJ2aWNlKTtcblx0XHRcdGlmIChjd2QgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IGF3YWl0IGMuc2VydmljZS5jcmVhdGVUZXJtaW5hbCh7IGxvY2F0aW9uOiB7IHBhcmVudFRlcm1pbmFsOiBhY3RpdmVJbnN0YW5jZSB9LCBjb25maWc6IG9wdGlvbnM/LmNvbmZpZywgY3dkIH0pO1xuXHRcdFx0YXdhaXQgZm9jdXNBY3RpdmVUZXJtaW5hbChpbnN0YW5jZSwgYyk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU3BsaXRBY3RpdmVUYWIsXG5cdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5zcGxpdCxcblx0XHRmMTogZmFsc2UsXG5cdFx0a2V5YmluZGluZzoge1xuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkRpZ2l0NSxcblx0XHRcdG1hYzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQmFja3NsYXNoLFxuXHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuV2luQ3RybCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRGlnaXQ1XVxuXHRcdFx0fSxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0d2hlbjogVGVybWluYWxDb250ZXh0S2V5cy50YWJzRm9jdXNcblx0XHR9LFxuXHRcdHJ1bjogYXN5bmMgKGMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCBpbnN0YW5jZXMgPSBnZXRTZWxlY3RlZFZpZXdJbnN0YW5jZXMoYWNjZXNzb3IpO1xuXHRcdFx0aWYgKGluc3RhbmNlcykge1xuXHRcdFx0XHRjb25zdCBwcm9taXNlczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgdCBvZiBpbnN0YW5jZXMpIHtcblx0XHRcdFx0XHRwcm9taXNlcy5wdXNoKChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRhd2FpdCBjLnNlcnZpY2UuY3JlYXRlVGVybWluYWwoeyBsb2NhdGlvbjogeyBwYXJlbnRUZXJtaW5hbDogdCB9IH0pO1xuXHRcdFx0XHRcdFx0YXdhaXQgYy5ncm91cFNlcnZpY2Uuc2hvd1BhbmVsKHRydWUpO1xuXHRcdFx0XHRcdH0pKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQ29udGV4dHVhbEluc3RhbmNlQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuVW5zcGxpdCxcblx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLnVuc3BsaXQsXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdHJ1bjogYXN5bmMgKGluc3RhbmNlLCBjKSA9PiB7XG5cdFx0XHRjb25zdCBncm91cCA9IGMuZ3JvdXBTZXJ2aWNlLmdldEdyb3VwRm9ySW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0aWYgKGdyb3VwICYmIGdyb3VwPy50ZXJtaW5hbEluc3RhbmNlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdGMuZ3JvdXBTZXJ2aWNlLnVuc3BsaXRJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuSm9pbkFjdGl2ZVRhYixcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmpvaW5JbnN0YW5jZScsICdKb2luIFRlcm1pbmFscycpLFxuXHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGUsIFRlcm1pbmFsQ29udGV4dEtleXMudGFic1Npbmd1bGFyU2VsZWN0aW9uLnRvTmVnYXRlZCgpKSxcblx0XHRydW46IGFzeW5jIChjLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgaW5zdGFuY2VzID0gZ2V0U2VsZWN0ZWRWaWV3SW5zdGFuY2VzKGFjY2Vzc29yKTtcblx0XHRcdGlmIChpbnN0YW5jZXMgJiYgaW5zdGFuY2VzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0Yy5ncm91cFNlcnZpY2Uuam9pbkluc3RhbmNlcyhpbnN0YW5jZXMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkpvaW4sXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5qb2luJywgJ0pvaW4gVGVybWluYWxzLi4uJyksXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdHJ1bjogYXN5bmMgKGMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCB0aGVtZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRoZW1lU2VydmljZSk7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cblx0XHRcdGNvbnN0IHBpY2tzOiBJVGVybWluYWxRdWlja1BpY2tJdGVtW10gPSBbXTtcblx0XHRcdGlmIChjLmdyb3VwU2VydmljZS5pbnN0YW5jZXMubGVuZ3RoIDw9IDEpIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS53YXJuKGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmpvaW4uaW5zdWZmaWNpZW50VGVybWluYWxzJywgJ0luc3VmZmljaWVudCB0ZXJtaW5hbHMgZm9yIHRoZSBqb2luIGFjdGlvbicpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgb3RoZXJJbnN0YW5jZXMgPSBjLmdyb3VwU2VydmljZS5pbnN0YW5jZXMuZmlsdGVyKGkgPT4gaS5pbnN0YW5jZUlkICE9PSBjLmdyb3VwU2VydmljZS5hY3RpdmVJbnN0YW5jZT8uaW5zdGFuY2VJZCk7XG5cdFx0XHRmb3IgKGNvbnN0IHRlcm1pbmFsIG9mIG90aGVySW5zdGFuY2VzKSB7XG5cdFx0XHRcdGNvbnN0IGdyb3VwID0gYy5ncm91cFNlcnZpY2UuZ2V0R3JvdXBGb3JJbnN0YW5jZSh0ZXJtaW5hbCk7XG5cdFx0XHRcdGlmIChncm91cD8udGVybWluYWxJbnN0YW5jZXMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0Y29uc3QgaWNvbklkID0gZ2V0SWNvbklkKGFjY2Vzc29yLCB0ZXJtaW5hbCk7XG5cdFx0XHRcdFx0Y29uc3QgbGFiZWwgPSBgJCgke2ljb25JZH0pOiAke3Rlcm1pbmFsLnRpdGxlfWA7XG5cdFx0XHRcdFx0Y29uc3QgaWNvbkNsYXNzZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdFx0Y29uc3QgY29sb3JDbGFzcyA9IGdldENvbG9yQ2xhc3ModGVybWluYWwpO1xuXHRcdFx0XHRcdGlmIChjb2xvckNsYXNzKSB7XG5cdFx0XHRcdFx0XHRpY29uQ2xhc3Nlcy5wdXNoKGNvbG9yQ2xhc3MpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCB1cmlDbGFzc2VzID0gZ2V0VXJpQ2xhc3Nlcyh0ZXJtaW5hbCwgdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS50eXBlKTtcblx0XHRcdFx0XHRpZiAodXJpQ2xhc3Nlcykge1xuXHRcdFx0XHRcdFx0aWNvbkNsYXNzZXMucHVzaCguLi51cmlDbGFzc2VzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cGlja3MucHVzaCh7XG5cdFx0XHRcdFx0XHR0ZXJtaW5hbCxcblx0XHRcdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHRcdFx0aWNvbkNsYXNzZXNcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHBpY2tzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuam9pbi5vbmx5U3BsaXRzJywgJ0FsbCB0ZXJtaW5hbHMgYXJlIGpvaW5lZCBhbHJlYWR5JykpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKHBpY2tzLCB7fSk7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGMuZ3JvdXBTZXJ2aWNlLmpvaW5JbnN0YW5jZXMoW3Jlc3VsdC50ZXJtaW5hbCwgYy5ncm91cFNlcnZpY2UuYWN0aXZlSW5zdGFuY2UhXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGl2ZUluc3RhbmNlQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU3BsaXRJbkFjdGl2ZVdvcmtzcGFjZSxcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNwbGl0SW5BY3RpdmVXb3Jrc3BhY2UnLCAnU3BsaXQgVGVybWluYWwgKEluIEFjdGl2ZSBXb3Jrc3BhY2UpJyksXG5cdFx0cnVuOiBhc3luYyAoaW5zdGFuY2UsIGMpID0+IHtcblx0XHRcdGNvbnN0IG5ld0luc3RhbmNlID0gYXdhaXQgYy5zZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKHsgbG9jYXRpb246IHsgcGFyZW50VGVybWluYWw6IGluc3RhbmNlIH0gfSk7XG5cdFx0XHRpZiAobmV3SW5zdGFuY2U/LnRhcmdldCAhPT0gVGVybWluYWxMb2NhdGlvbi5FZGl0b3IpIHtcblx0XHRcdFx0YXdhaXQgYy5ncm91cFNlcnZpY2Uuc2hvd1BhbmVsKHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3RpdmVYdGVybUFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlNlbGVjdEFsbCxcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNlbGVjdEFsbCcsICdTZWxlY3QgQWxsJyksXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdGtleWJpbmRpbmc6IFt7XG5cdFx0XHQvLyBEb24ndCB1c2UgY3RybCthIGJ5IGRlZmF1bHQgYXMgdGhhdCB3b3VsZCBvdmVycmlkZSB0aGUgY29tbW9uIGdvIHRvIHN0YXJ0XG5cdFx0XHQvLyBvZiBwcm9tcHQgc2hlbGwgYmluZGluZ1xuXHRcdFx0cHJpbWFyeTogMCxcblx0XHRcdC8vIFRlY2huaWNhbGx5IHRoaXMgZG9lc24ndCBuZWVkIHRvIGJlIGhlcmUgYXMgaXQgd2lsbCBmYWxsIGJhY2sgdG8gdGhpc1xuXHRcdFx0Ly8gYmVoYXZpb3IgYW55d2F5IHdoZW4gaGFuZGVkIHRvIHh0ZXJtLmpzLCBoYXZpbmcgdGhpcyBoYW5kbGVkIGJ5IFZTIENvZGVcblx0XHRcdC8vIG1ha2VzIGl0IGVhc2llciBmb3IgdXNlcnMgdG8gc2VlIGhvdyBpdCB3b3JrcyB0aG91Z2guXG5cdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUEgfSxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0d2hlbjogVGVybWluYWxDb250ZXh0S2V5cy5mb2N1c0luQW55XG5cdFx0fV0sXG5cdFx0cnVuOiAoeHRlcm0pID0+IHh0ZXJtLnNlbGVjdEFsbCgpXG5cdH0pO1xuXG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5OZXcsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5uZXcnLCAnQ3JlYXRlIE5ldyBUZXJtaW5hbCcpLFxuXHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3IoVGVybWluYWxDb250ZXh0S2V5cy5wcm9jZXNzU3VwcG9ydGVkLCBUZXJtaW5hbENvbnRleHRLZXlzLndlYkV4dGVuc2lvbkNvbnRyaWJ1dGVkUHJvZmlsZSksXG5cdFx0aWNvbjogbmV3VGVybWluYWxJY29uLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5CYWNrcXVvdGUsXG5cdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkJhY2txdW90ZSB9LFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHR9LFxuXHRcdHJ1bjogYXN5bmMgKGMsIGFjY2Vzc29yLCBhcmdzKSA9PiB7XG5cdFx0XHRsZXQgZXZlbnRPck9wdGlvbnMgPSBpc09iamVjdChhcmdzKSA/IGFyZ3MgYXMgTW91c2VFdmVudCB8IElDcmVhdGVUZXJtaW5hbE9wdGlvbnMgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZm9sZGVycyA9IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0XHRpZiAoZXZlbnRPck9wdGlvbnMgJiYgaXNNb3VzZUV2ZW50KGV2ZW50T3JPcHRpb25zKSAmJiAoZXZlbnRPck9wdGlvbnMuYWx0S2V5IHx8IGV2ZW50T3JPcHRpb25zLmN0cmxLZXkpKSB7XG5cdFx0XHRcdGF3YWl0IGMuc2VydmljZS5jcmVhdGVUZXJtaW5hbCh7IGxvY2F0aW9uOiB7IHNwbGl0QWN0aXZlVGVybWluYWw6IHRydWUgfSB9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYy5zZXJ2aWNlLmlzUHJvY2Vzc1N1cHBvcnRSZWdpc3RlcmVkKSB7XG5cdFx0XHRcdGV2ZW50T3JPcHRpb25zID0gIWV2ZW50T3JPcHRpb25zIHx8IGlzTW91c2VFdmVudChldmVudE9yT3B0aW9ucykgPyB7fSA6IGV2ZW50T3JPcHRpb25zO1xuXG5cdFx0XHRcdGlmIChpc0F1eGlsaWFyeVdpbmRvdyhnZXRBY3RpdmVXaW5kb3coKSkgJiYgIWV2ZW50T3JPcHRpb25zLmxvY2F0aW9uKSB7XG5cdFx0XHRcdFx0ZXZlbnRPck9wdGlvbnMubG9jYXRpb24gPSB7IHZpZXdDb2x1bW46IGVkaXRvckdyb3VwVG9Db2x1bW4oZWRpdG9yR3JvdXBzU2VydmljZSwgZWRpdG9yR3JvdXBzU2VydmljZS5hY3RpdmVHcm91cCkgfTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChmb2xkZXJzLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHRcdFx0Ly8gQWxsb3cgdGVybWluYWwgc2VydmljZSB0byBoYW5kbGUgdGhlIHBhdGggd2hlbiB0aGVyZSBpcyBvbmx5IGFcblx0XHRcdFx0XHQvLyBzaW5nbGUgcm9vdFxuXHRcdFx0XHRcdGluc3RhbmNlID0gYXdhaXQgYy5zZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKGV2ZW50T3JPcHRpb25zKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBjd2QgPSAoYXdhaXQgcGlja1Rlcm1pbmFsQ3dkKGFjY2Vzc29yKSk/LmN3ZDtcblx0XHRcdFx0XHRpZiAoIWN3ZCkge1xuXHRcdFx0XHRcdFx0Ly8gRG9uJ3QgY3JlYXRlIHRoZSBpbnN0YW5jZSBpZiB0aGUgd29ya3NwYWNlIHBpY2tlciB3YXMgY2FuY2VsZWRcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZXZlbnRPck9wdGlvbnMuY3dkID0gY3dkO1xuXHRcdFx0XHRcdGluc3RhbmNlID0gYXdhaXQgYy5zZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKGV2ZW50T3JPcHRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjLnNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0XHRhd2FpdCBmb2N1c0FjdGl2ZVRlcm1pbmFsKGluc3RhbmNlLCBjKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChjLnByb2ZpbGVTZXJ2aWNlLmNvbnRyaWJ1dGVkUHJvZmlsZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFRlcm1pbmFsQ29tbWFuZElkLk5ld1dpdGhQcm9maWxlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChUZXJtaW5hbENvbW1hbmRJZC5Ub2dnbGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiBraWxsSW5zdGFuY2UoYzogSVRlcm1pbmFsU2VydmljZXNDb2xsZWN0aW9uLCBpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWluc3RhbmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IGMuc2VydmljZS5zYWZlRGlzcG9zZVRlcm1pbmFsKGluc3RhbmNlKTtcblx0XHRpZiAoYy5ncm91cFNlcnZpY2UuaW5zdGFuY2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdGF3YWl0IGMuZ3JvdXBTZXJ2aWNlLnNob3dQYW5lbCh0cnVlKTtcblx0XHR9XG5cdH1cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLktpbGwsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5raWxsJywgJ0tpbGwgdGhlIEFjdGl2ZSBUZXJtaW5hbCBJbnN0YW5jZScpLFxuXHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3Ioc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSwgVGVybWluYWxDb250ZXh0S2V5cy5pc09wZW4pLFxuXHRcdGljb246IGtpbGxUZXJtaW5hbEljb24sXG5cdFx0cnVuOiBhc3luYyAoYykgPT4ga2lsbEluc3RhbmNlKGMsIGMuZ3JvdXBTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlKVxuXHR9KTtcblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLktpbGxWaWV3T3JFZGl0b3IsXG5cdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5raWxsLFxuXHRcdGYxOiBmYWxzZSwgLy8gVGhpcyBpcyBhbiBpbnRlcm5hbCBjb21tYW5kIHVzZWQgZm9yIGNvbnRleHQgbWVudXNcblx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGUsIFRlcm1pbmFsQ29udGV4dEtleXMuaXNPcGVuKSxcblx0XHRydW46IGFzeW5jIChjKSA9PiBraWxsSW5zdGFuY2UoYywgYy5zZXJ2aWNlLmFjdGl2ZUluc3RhbmNlKVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuS2lsbEFsbCxcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmtpbGxBbGwnLCAnS2lsbCBBbGwgVGVybWluYWxzJyksXG5cdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5vcihzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLCBUZXJtaW5hbENvbnRleHRLZXlzLmlzT3BlbiksXG5cdFx0aWNvbjogQ29kaWNvbi50cmFzaCxcblx0XHRydW46IGFzeW5jIChjKSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NlUHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBpbnN0YW5jZSBvZiBjLnNlcnZpY2UuaW5zdGFuY2VzKSB7XG5cdFx0XHRcdGRpc3Bvc2VQcm9taXNlcy5wdXNoKGMuc2VydmljZS5zYWZlRGlzcG9zZVRlcm1pbmFsKGluc3RhbmNlKSk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChkaXNwb3NlUHJvbWlzZXMpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLktpbGxFZGl0b3IsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5raWxsRWRpdG9yJywgJ0tpbGwgdGhlIEFjdGl2ZSBUZXJtaW5hbCBpbiBFZGl0b3IgQXJlYScpLFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Vyxcblx0XHRcdHdpbjogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRjQsIHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlXXSB9LFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoVGVybWluYWxDb250ZXh0S2V5cy5mb2N1cywgVGVybWluYWxDb250ZXh0S2V5cy5lZGl0b3JGb2N1cylcblx0XHR9LFxuXHRcdHJ1bjogKGMsIGFjY2Vzc29yKSA9PiBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKS5leGVjdXRlQ29tbWFuZChDTE9TRV9FRElUT1JfQ09NTUFORF9JRClcblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLktpbGxBY3RpdmVUYWIsXG5cdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5raWxsLFxuXHRcdGYxOiBmYWxzZSxcblx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGUsIFRlcm1pbmFsQ29udGV4dEtleXMuaXNPcGVuKSxcblx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkRlbGV0ZSxcblx0XHRcdG1hYzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQmFja3NwYWNlLFxuXHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlDb2RlLkRlbGV0ZV1cblx0XHRcdH0sXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdHdoZW46IFRlcm1pbmFsQ29udGV4dEtleXMudGFic0ZvY3VzXG5cdFx0fSxcblx0XHRydW46IGFzeW5jIChjLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zZVByb21pc2VzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgdGVybWluYWwgb2YgZ2V0U2VsZWN0ZWRWaWV3SW5zdGFuY2VzKGFjY2Vzc29yLCB0cnVlKSA/PyBbXSkge1xuXHRcdFx0XHRkaXNwb3NlUHJvbWlzZXMucHVzaChjLnNlcnZpY2Uuc2FmZURpc3Bvc2VUZXJtaW5hbCh0ZXJtaW5hbCkpO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoZGlzcG9zZVByb21pc2VzKTtcblx0XHRcdGMuZ3JvdXBTZXJ2aWNlLmZvY3VzVGFicygpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkZvY3VzSG92ZXIsXG5cdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5mb2N1c0hvdmVyLFxuXHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3Ioc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSwgVGVybWluYWxDb250ZXh0S2V5cy5pc09wZW4pLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SSksXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKFRlcm1pbmFsQ29udGV4dEtleXMudGFic0ZvY3VzLCBUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzKVxuXHRcdH0sXG5cdFx0cnVuOiAoYykgPT4gYy5ncm91cFNlcnZpY2UuZm9jdXNIb3ZlcigpXG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aXZlSW5zdGFuY2VBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5DbGVhcixcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNsZWFyJywgJ0NsZWFyJyksXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdGtleWJpbmRpbmc6IFt7XG5cdFx0XHRwcmltYXJ5OiAwLFxuXHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLIH0sXG5cdFx0XHQvLyBXZWlnaHQgaXMgaGlnaGVyIHRoYW4gd29yayB3b3JrYmVuY2ggY29udHJpYnV0aW9ucyBzbyB0aGUga2V5YmluZGluZyByZW1haW5zXG5cdFx0XHQvLyBoaWdoZXN0IHByaW9yaXR5IHdoZW4gY2hvcmRzIGFyZSByZWdpc3RlcmVkIGFmdGVyd2FyZHNcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0XHRcdC8vIERpc2FibGUgdGhlIGtleWJpbmRpbmcgd2hlbiBhY2Nlc3NpYmlsaXR5IG1vZGUgaXMgZW5hYmxlZCBhcyBjaG9yZHMgaW5jbHVkZVxuXHRcdFx0Ly8gaW1wb3J0YW50IHNjcmVlbiByZWFkZXIga2V5YmluZGluZ3Mgc3VjaCBhcyBjbWQraywgY21kK2kgdG8gc2hvdyB0aGUgaG92ZXJcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKENvbnRleHRLZXlFeHByLmFuZChUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzLCBDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVELm5lZ2F0ZSgpKSwgQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQsIGFjY2Vzc2libGVWaWV3SXNTaG93biwgYWNjZXNzaWJsZVZpZXdDdXJyZW50UHJvdmlkZXJJZC5pc0VxdWFsVG8oQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLlRlcm1pbmFsKSkpLFxuXHRcdH1dLFxuXHRcdHJ1bjogKGFjdGl2ZUluc3RhbmNlKSA9PiBhY3RpdmVJbnN0YW5jZS5jbGVhckJ1ZmZlcigpXG5cdH0pO1xuXG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TZWxlY3REZWZhdWx0UHJvZmlsZSxcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNlbGVjdERlZmF1bHRTaGVsbCcsICdTZWxlY3QgRGVmYXVsdCBQcm9maWxlJyksXG5cdFx0cnVuOiAoYykgPT4gYy5zZXJ2aWNlLnNob3dQcm9maWxlUXVpY2tQaWNrKCdzZXREZWZhdWx0Jylcblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkNvbmZpZ3VyZVRlcm1pbmFsU2V0dGluZ3MsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5vcGVuU2V0dGluZ3MnLCAnQ29uZmlndXJlIFRlcm1pbmFsIFNldHRpbmdzJyksXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdHJ1bjogKGMsIGFjY2Vzc29yKSA9PiBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSkub3BlblNldHRpbmdzKHsganNvbkVkaXRvcjogZmFsc2UsIHF1ZXJ5OiAnQGZlYXR1cmU6dGVybWluYWwnIH0pXG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aXZlSW5zdGFuY2VBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TZXREaW1lbnNpb25zLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2V0Rml4ZWREaW1lbnNpb25zJywgJ1NldCBGaXhlZCBEaW1lbnNpb25zJyksXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlX2FuZF9vcGVuZWQsXG5cdFx0cnVuOiAoYWN0aXZlSW5zdGFuY2UpID0+IGFjdGl2ZUluc3RhbmNlLnNldEZpeGVkRGltZW5zaW9ucygpXG5cdH0pO1xuXG5cdHJlZ2lzdGVyQ29udGV4dHVhbEluc3RhbmNlQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU2l6ZVRvQ29udGVudFdpZHRoLFxuXHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MudG9nZ2xlU2l6ZVRvQ29udGVudFdpZHRoLFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZV9hbmRfb3BlbmVkLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleVosXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdHdoZW46IFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXNcblx0XHR9LFxuXHRcdHJ1bjogKGluc3RhbmNlKSA9PiBpbnN0YW5jZS50b2dnbGVTaXplVG9Db250ZW50V2lkdGgoKVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU3dpdGNoVGVybWluYWwsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zd2l0Y2hUZXJtaW5hbCcsICdTd2l0Y2ggVGVybWluYWwnKSxcblx0XHRwcmVjb25kaXRpb246IHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGUsXG5cdFx0cnVuOiBhc3luYyAoYywgYWNjZXNzb3IsIGFyZ3MpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW0gPSB0b09wdGlvbmFsU3RyaW5nKGFyZ3MpO1xuXHRcdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChpdGVtID09PSBTZXBhcmF0b3JTZWxlY3RPcHRpb24udGV4dCkge1xuXHRcdFx0XHRjLnNlcnZpY2UucmVmcmVzaEFjdGl2ZUdyb3VwKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChpdGVtID09PSBzd2l0Y2hUZXJtaW5hbFNob3dUYWJzVGl0bGUpIHtcblx0XHRcdFx0YWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkudXBkYXRlVmFsdWUoVGVybWluYWxTZXR0aW5nSWQuVGFic0VuYWJsZWQsIHRydWUpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRlcm1pbmFsSW5kZXhSZSA9IC9eKFswLTldKyk6IC87XG5cdFx0XHRjb25zdCBpbmRleE1hdGNoZXMgPSB0ZXJtaW5hbEluZGV4UmUuZXhlYyhpdGVtKTtcblx0XHRcdGlmIChpbmRleE1hdGNoZXMpIHtcblx0XHRcdFx0Yy5ncm91cFNlcnZpY2Uuc2V0QWN0aXZlR3JvdXBCeUluZGV4KE51bWJlcihpbmRleE1hdGNoZXNbMV0pIC0gMSk7XG5cdFx0XHRcdHJldHVybiBjLmdyb3VwU2VydmljZS5zaG93UGFuZWwodHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHF1aWNrU2VsZWN0UHJvZmlsZXMgPSBjLnByb2ZpbGVTZXJ2aWNlLmF2YWlsYWJsZVByb2ZpbGVzO1xuXG5cdFx0XHQvLyBSZW1vdmUgJ05ldyAnIGZyb20gdGhlIHNlbGVjdGVkIGl0ZW0gdG8gZ2V0IHRoZSBwcm9maWxlIG5hbWVcblx0XHRcdGNvbnN0IHByb2ZpbGVTZWxlY3Rpb24gPSBpdGVtLnN1YnN0cmluZyg0KTtcblx0XHRcdGlmIChxdWlja1NlbGVjdFByb2ZpbGVzKSB7XG5cdFx0XHRcdGNvbnN0IHByb2ZpbGUgPSBxdWlja1NlbGVjdFByb2ZpbGVzLmZpbmQocHJvZmlsZSA9PiBwcm9maWxlLnByb2ZpbGVOYW1lID09PSBwcm9maWxlU2VsZWN0aW9uKTtcblx0XHRcdFx0aWYgKHByb2ZpbGUpIHtcblx0XHRcdFx0XHRjb25zdCBpbnN0YW5jZSA9IGF3YWl0IGMuc2VydmljZS5jcmVhdGVUZXJtaW5hbCh7XG5cdFx0XHRcdFx0XHRjb25maWc6IHByb2ZpbGVcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRjLnNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnNvbGUud2FybihgTm8gcHJvZmlsZSB3aXRoIG5hbWUgXCIke3Byb2ZpbGVTZWxlY3Rpb259XCJgKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKGBVbm1hdGNoZWQgdGVybWluYWwgaXRlbTogXCIke2l0ZW19XCJgKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xufVxuXG5pbnRlcmZhY2UgSVJlbW90ZVRlcm1pbmFsUGljayBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0dGVybTogSVJlbW90ZVRlcm1pbmFsQXR0YWNoVGFyZ2V0O1xufVxuXG5mdW5jdGlvbiBnZXRTZWxlY3RlZFZpZXdJbnN0YW5jZXMyKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzPzogdW5rbm93bik6IElUZXJtaW5hbEluc3RhbmNlW10gfCB1bmRlZmluZWQge1xuXHRjb25zdCB0ZXJtaW5hbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlcm1pbmFsU2VydmljZSk7XG5cdGNvbnN0IHJlc3VsdDogSVRlcm1pbmFsSW5zdGFuY2VbXSA9IFtdO1xuXHRjb25zdCBjb250ZXh0ID0gcGFyc2VBY3Rpb25BcmdzKGFyZ3MpO1xuXHRpZiAoY29udGV4dCAmJiBjb250ZXh0Lmxlbmd0aCA+IDApIHtcblx0XHRmb3IgKGNvbnN0IGluc3RhbmNlQ29udGV4dCBvZiBjb250ZXh0KSB7XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IHRlcm1pbmFsU2VydmljZS5nZXRJbnN0YW5jZUZyb21JZChpbnN0YW5jZUNvbnRleHQuaW5zdGFuY2VJZCk7XG5cdFx0XHRpZiAoaW5zdGFuY2UpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goaW5zdGFuY2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAocmVzdWx0Lmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGdldFNlbGVjdGVkVmlld0luc3RhbmNlcyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJncz86IHVua25vd24sIGFyZ3MyPzogdW5rbm93bik6IElUZXJtaW5hbEluc3RhbmNlW10gfCB1bmRlZmluZWQge1xuXHRjb25zdCBsaXN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpO1xuXHRjb25zdCB0ZXJtaW5hbEdyb3VwU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVybWluYWxHcm91cFNlcnZpY2UpO1xuXHRjb25zdCByZXN1bHQ6IElUZXJtaW5hbEluc3RhbmNlW10gPSBbXTtcblxuXHQvLyBBc3NpZ24gbGlzdCBvbmx5IGlmIGl0J3MgYW4gaW5zdGFuY2Ugb2YgVGVybWluYWxUYWJMaXN0ICgjMjM0NzkxKVxuXHRjb25zdCBsaXN0ID0gbGlzdFNlcnZpY2UubGFzdEZvY3VzZWRMaXN0IGluc3RhbmNlb2YgVGVybWluYWxUYWJMaXN0ID8gbGlzdFNlcnZpY2UubGFzdEZvY3VzZWRMaXN0IDogdW5kZWZpbmVkO1xuXHQvLyBHZXQgc2VsZWN0ZWQgdGFiIGxpc3QgaW5zdGFuY2Uocylcblx0Y29uc3Qgc2VsZWN0aW9ucyA9IGxpc3Q/LmdldFNlbGVjdGlvbigpO1xuXHQvLyBHZXQgaW5saW5lIHRhYiBpbnN0YW5jZSBpZiB0aGVyZSBhcmUgbm90IHRhYiBsaXN0IHNlbGVjdGlvbnMgIzE5NjU3OFxuXHRpZiAodGVybWluYWxHcm91cFNlcnZpY2UubGFzdEFjY2Vzc2VkTWVudSA9PT0gJ2lubGluZS10YWInICYmICFzZWxlY3Rpb25zPy5sZW5ndGgpIHtcblx0XHRjb25zdCBpbnN0YW5jZSA9IHRlcm1pbmFsR3JvdXBTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlO1xuXHRcdHJldHVybiBpbnN0YW5jZSA/IFt0ZXJtaW5hbEdyb3VwU2VydmljZS5hY3RpdmVJbnN0YW5jZV0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRpZiAoIWxpc3QgfHwgIXNlbGVjdGlvbnMpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGZvY3VzZWQgPSBsaXN0LmdldEZvY3VzKCk7XG5cblx0Y29uc3Qgdmlld0luc3RhbmNlcyA9IHRlcm1pbmFsR3JvdXBTZXJ2aWNlLmluc3RhbmNlcztcblx0aWYgKGZvY3VzZWQubGVuZ3RoID09PSAxICYmICFzZWxlY3Rpb25zLmluY2x1ZGVzKGZvY3VzZWRbMF0pKSB7XG5cdFx0Ly8gZm9jdXNlZCBsZW5ndGggaXMgYWx3YXlzIGEgbWF4IG9mIDFcblx0XHQvLyBpZiB0aGUgZm9jdXNlZCBvbmUgaXMgbm90IGluIHRoZSBzZWxlY3RlZCBsaXN0LCByZXR1cm4gdGhhdCBpdGVtXG5cdFx0cmVzdWx0LnB1c2godmlld0luc3RhbmNlc1tmb2N1c2VkWzBdXSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8vIG11bHRpLXNlbGVjdFxuXHRmb3IgKGNvbnN0IHNlbGVjdGlvbiBvZiBzZWxlY3Rpb25zKSB7XG5cdFx0cmVzdWx0LnB1c2godmlld0luc3RhbmNlc1tzZWxlY3Rpb25dKTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0LmZpbHRlcihyID0+ICEhcik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZVRlcm1pbmFsTmFtZShuYW1lOiBzdHJpbmcpOiB7IGNvbnRlbnQ6IHN0cmluZzsgc2V2ZXJpdHk6IFNldmVyaXR5IH0gfCBudWxsIHtcblx0aWYgKCFuYW1lIHx8IG5hbWUudHJpbSgpLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50OiBsb2NhbGl6ZSgnZW1wdHlUZXJtaW5hbE5hbWVJbmZvJywgXCJQcm92aWRpbmcgbm8gbmFtZSB3aWxsIHJlc2V0IGl0IHRvIHRoZSBkZWZhdWx0IHZhbHVlXCIpLFxuXHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkluZm9cblx0XHR9O1xuXHR9XG5cblx0cmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGlzVGVybWluYWxQcm9maWxlKG9iajogdW5rbm93bik6IG9iaiBpcyBJVGVybWluYWxQcm9maWxlIHtcblx0cmV0dXJuIGlzT2JqZWN0KG9iaikgJiYgJ3Byb2ZpbGVOYW1lJyBpbiBvYmo7XG59XG5cbmZ1bmN0aW9uIGNvbnZlcnRPcHRpb25zT3JQcm9maWxlVG9PcHRpb25zKG9wdGlvbnNPclByb2ZpbGU/OiBJQ3JlYXRlVGVybWluYWxPcHRpb25zIHwgSVRlcm1pbmFsUHJvZmlsZSk6IElDcmVhdGVUZXJtaW5hbE9wdGlvbnMgfCB1bmRlZmluZWQge1xuXHRpZiAoaXNUZXJtaW5hbFByb2ZpbGUob3B0aW9uc09yUHJvZmlsZSkpIHtcblx0XHRyZXR1cm4geyBjb25maWc6IG9wdGlvbnNPclByb2ZpbGUsIGxvY2F0aW9uOiAob3B0aW9uc09yUHJvZmlsZSBhcyBJQ3JlYXRlVGVybWluYWxPcHRpb25zKS5sb2NhdGlvbiB9O1xuXHR9XG5cdHJldHVybiBvcHRpb25zT3JQcm9maWxlO1xufVxuXG5sZXQgbmV3V2l0aFByb2ZpbGVBY3Rpb246IElEaXNwb3NhYmxlO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVmcmVzaFRlcm1pbmFsQWN0aW9ucyhkZXRlY3RlZFByb2ZpbGVzOiBJVGVybWluYWxQcm9maWxlW10pOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IHByb2ZpbGVFbnVtID0gY3JlYXRlUHJvZmlsZVNjaGVtYUVudW1zKGRldGVjdGVkUHJvZmlsZXMpO1xuXHRuZXdXaXRoUHJvZmlsZUFjdGlvbj8uZGlzcG9zZSgpO1xuXHQvLyBUT0RPOiBVc2UgbmV3IHJlZ2lzdGVyIGZ1bmN0aW9uXG5cdG5ld1dpdGhQcm9maWxlQWN0aW9uID0gcmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5OZXdXaXRoUHJvZmlsZSxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5uZXdXaXRoUHJvZmlsZScsICdDcmVhdGUgTmV3IFRlcm1pbmFsIChXaXRoIFByb2ZpbGUpJyksXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKFRlcm1pbmFsQ29udGV4dEtleXMucHJvY2Vzc1N1cHBvcnRlZCwgVGVybWluYWxDb250ZXh0S2V5cy53ZWJFeHRlbnNpb25Db250cmlidXRlZFByb2ZpbGUpLFxuXHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBUZXJtaW5hbENvbW1hbmRJZC5OZXdXaXRoUHJvZmlsZSxcblx0XHRcdFx0XHRhcmdzOiBbe1xuXHRcdFx0XHRcdFx0bmFtZTogJ2FyZ3MnLFxuXHRcdFx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRyZXF1aXJlZDogWydwcm9maWxlTmFtZSddLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0cHJvZmlsZU5hbWU6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5uZXdXaXRoUHJvZmlsZS5wcm9maWxlTmFtZScsIFwiVGhlIG5hbWUgb2YgdGhlIHByb2ZpbGUgdG8gY3JlYXRlXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0XHRlbnVtOiBwcm9maWxlRW51bS52YWx1ZXMsXG5cdFx0XHRcdFx0XHRcdFx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IHByb2ZpbGVFbnVtLm1hcmtkb3duRGVzY3JpcHRpb25zXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRsb2NhdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCduZXdXaXRoUHJvZmlsZS5sb2NhdGlvbicsIFwiV2hlcmUgdG8gY3JlYXRlIHRoZSB0ZXJtaW5hbFwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZW51bTogWyd2aWV3JywgJ2VkaXRvciddLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgnbmV3V2l0aFByb2ZpbGUubG9jYXRpb24udmlldycsICdDcmVhdGUgdGhlIHRlcm1pbmFsIGluIHRoZSB0ZXJtaW5hbCB2aWV3JyksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGxvY2FsaXplKCduZXdXaXRoUHJvZmlsZS5sb2NhdGlvbi5lZGl0b3InLCAnQ3JlYXRlIHRoZSB0ZXJtaW5hbCBpbiB0aGUgZWRpdG9yJyksXG5cdFx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRhc3luYyBydW4oXG5cdFx0XHRhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcixcblx0XHRcdGV2ZW50T3JPcHRpb25zT3JQcm9maWxlOiBNb3VzZUV2ZW50IHwgSUNyZWF0ZVRlcm1pbmFsT3B0aW9ucyB8IElUZXJtaW5hbFByb2ZpbGUgfCB7IHByb2ZpbGVOYW1lOiBzdHJpbmc7IGxvY2F0aW9uPzogJ3ZpZXcnIHwgJ2VkaXRvcicgfCB1bmtub3duIH0gfCB1bmRlZmluZWQsXG5cdFx0XHRwcm9maWxlPzogSVRlcm1pbmFsUHJvZmlsZVxuXHRcdCkge1xuXHRcdFx0Y29uc3QgYyA9IGdldFRlcm1pbmFsU2VydmljZXMoYWNjZXNzb3IpO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cblx0XHRcdGxldCBldmVudDogTW91c2VFdmVudCB8IFBvaW50ZXJFdmVudCB8IEtleWJvYXJkRXZlbnQgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgb3B0aW9uczogSUNyZWF0ZVRlcm1pbmFsT3B0aW9ucyB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgY3dkOiBzdHJpbmcgfCBVUkkgfCB1bmRlZmluZWQ7XG5cblx0XHRcdGlmIChpc09iamVjdChldmVudE9yT3B0aW9uc09yUHJvZmlsZSkgJiYgZXZlbnRPck9wdGlvbnNPclByb2ZpbGUgJiYgaGFzS2V5KGV2ZW50T3JPcHRpb25zT3JQcm9maWxlLCB7IHByb2ZpbGVOYW1lOiB0cnVlIH0pKSB7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZyA9IGMucHJvZmlsZVNlcnZpY2UuYXZhaWxhYmxlUHJvZmlsZXMuZmluZChwcm9maWxlID0+IHByb2ZpbGUucHJvZmlsZU5hbWUgPT09IGV2ZW50T3JPcHRpb25zT3JQcm9maWxlLnByb2ZpbGVOYW1lKTtcblx0XHRcdFx0aWYgKCFjb25maWcpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCBmaW5kIHRlcm1pbmFsIHByb2ZpbGUgXCIke2V2ZW50T3JPcHRpb25zT3JQcm9maWxlLnByb2ZpbGVOYW1lfVwiYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0b3B0aW9ucyA9IHsgY29uZmlnIH07XG5cdFx0XHRcdGZ1bmN0aW9uIGlzU2ltcGxlQXJncyhvYmo6IHVua25vd24pOiBvYmogaXMgeyBwcm9maWxlTmFtZTogc3RyaW5nOyBsb2NhdGlvbj86ICd2aWV3JyB8ICdlZGl0b3InIHwgdW5rbm93biB9IHtcblx0XHRcdFx0XHRyZXR1cm4gaXNPYmplY3Qob2JqKSAmJiAnbG9jYXRpb24nIGluIG9iajtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaXNTaW1wbGVBcmdzKGV2ZW50T3JPcHRpb25zT3JQcm9maWxlKSkge1xuXHRcdFx0XHRcdHN3aXRjaCAoZXZlbnRPck9wdGlvbnNPclByb2ZpbGUubG9jYXRpb24pIHtcblx0XHRcdFx0XHRcdGNhc2UgJ2VkaXRvcic6IG9wdGlvbnMubG9jYXRpb24gPSBUZXJtaW5hbExvY2F0aW9uLkVkaXRvcjsgYnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlICd2aWV3Jzogb3B0aW9ucy5sb2NhdGlvbiA9IFRlcm1pbmFsTG9jYXRpb24uUGFuZWw7IGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChpc01vdXNlRXZlbnQoZXZlbnRPck9wdGlvbnNPclByb2ZpbGUpIHx8IGlzUG9pbnRlckV2ZW50KGV2ZW50T3JPcHRpb25zT3JQcm9maWxlKSB8fCBpc0tleWJvYXJkRXZlbnQoZXZlbnRPck9wdGlvbnNPclByb2ZpbGUpKSB7XG5cdFx0XHRcdGV2ZW50ID0gZXZlbnRPck9wdGlvbnNPclByb2ZpbGU7XG5cdFx0XHRcdG9wdGlvbnMgPSBwcm9maWxlID8geyBjb25maWc6IHByb2ZpbGUgfSA6IHVuZGVmaW5lZDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG9wdGlvbnMgPSBjb252ZXJ0T3B0aW9uc09yUHJvZmlsZVRvT3B0aW9ucyhldmVudE9yT3B0aW9uc09yUHJvZmlsZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHNwbGl0IHRlcm1pbmFsXG5cdFx0XHRpZiAoZXZlbnQgJiYgKGV2ZW50LmFsdEtleSB8fCBldmVudC5jdHJsS2V5KSkge1xuXHRcdFx0XHRjb25zdCBwYXJlbnRUZXJtaW5hbCA9IGMuc2VydmljZS5hY3RpdmVJbnN0YW5jZTtcblx0XHRcdFx0aWYgKHBhcmVudFRlcm1pbmFsKSB7XG5cdFx0XHRcdFx0YXdhaXQgYy5zZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKHsgbG9jYXRpb246IHsgcGFyZW50VGVybWluYWwgfSwgY29uZmlnOiBvcHRpb25zPy5jb25maWcgfSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZvbGRlcnMgPSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzO1xuXHRcdFx0aWYgKGZvbGRlcnMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHQvLyBtdWx0aS1yb290IHdvcmtzcGFjZSwgY3JlYXRlIHJvb3QgcGlja2VyXG5cdFx0XHRcdGNvbnN0IG9wdGlvbnM6IElQaWNrT3B0aW9uczxJUXVpY2tQaWNrSXRlbT4gPSB7XG5cdFx0XHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLm5ld1dvcmtzcGFjZVBsYWNlaG9sZGVyJywgXCJTZWxlY3QgY3VycmVudCB3b3JraW5nIGRpcmVjdG9yeSBmb3IgbmV3IHRlcm1pbmFsXCIpXG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kPElXb3Jrc3BhY2VGb2xkZXI+KFBJQ0tfV09SS1NQQUNFX0ZPTERFUl9DT01NQU5EX0lELCBbb3B0aW9uc10pO1xuXHRcdFx0XHRpZiAoIXdvcmtzcGFjZSkge1xuXHRcdFx0XHRcdC8vIERvbid0IGNyZWF0ZSB0aGUgaW5zdGFuY2UgaWYgdGhlIHdvcmtzcGFjZSBwaWNrZXIgd2FzIGNhbmNlbGVkXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGN3ZCA9IHdvcmtzcGFjZS51cmk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChvcHRpb25zKSB7XG5cdFx0XHRcdG9wdGlvbnMuY3dkID0gY3dkO1xuXHRcdFx0XHRpbnN0YW5jZSA9IGF3YWl0IGMuc2VydmljZS5jcmVhdGVUZXJtaW5hbChvcHRpb25zKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGluc3RhbmNlID0gYXdhaXQgYy5zZXJ2aWNlLnNob3dQcm9maWxlUXVpY2tQaWNrKCdjcmVhdGVJbnN0YW5jZScsIGN3ZCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpbnN0YW5jZSkge1xuXHRcdFx0XHRjLnNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0XHRhd2FpdCBmb2N1c0FjdGl2ZVRlcm1pbmFsKGluc3RhbmNlLCBjKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXHRyZXR1cm4gbmV3V2l0aFByb2ZpbGVBY3Rpb247XG59XG5cbmZ1bmN0aW9uIGdldFJlc291cmNlT3JBY3RpdmVJbnN0YW5jZShjOiBJVGVybWluYWxTZXJ2aWNlc0NvbGxlY3Rpb24sIHJlc291cmNlOiB1bmtub3duKTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gYy5zZXJ2aWNlLmdldEluc3RhbmNlRnJvbVJlc291cmNlKHRvT3B0aW9uYWxVcmkocmVzb3VyY2UpKSB8fCBjLnNlcnZpY2UuYWN0aXZlSW5zdGFuY2U7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHBpY2tUZXJtaW5hbEN3ZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY2FuY2VsPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFdvcmtzcGFjZUZvbGRlckN3ZFBhaXIgfCB1bmRlZmluZWQ+IHtcblx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0Y29uc3QgbGFiZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYWJlbFNlcnZpY2UpO1xuXHRjb25zdCBjb250ZXh0U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXHRjb25zdCBtb2RlbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU1vZGVsU2VydmljZSk7XG5cdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSk7XG5cblx0Y29uc3QgZm9sZGVycyA9IGNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdGlmICghZm9sZGVycy5sZW5ndGgpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCBmb2xkZXJDd2RQYWlycyA9IGF3YWl0IFByb21pc2UuYWxsKGZvbGRlcnMubWFwKGUgPT4gcmVzb2x2ZVdvcmtzcGFjZUZvbGRlckN3ZChlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSkpKTtcblx0Y29uc3Qgc2hyaW5rZWRQYWlycyA9IHNocmlua1dvcmtzcGFjZUZvbGRlckN3ZFBhaXJzKGZvbGRlckN3ZFBhaXJzKTtcblxuXHRpZiAoc2hyaW5rZWRQYWlycy5sZW5ndGggPT09IDEpIHtcblx0XHRyZXR1cm4gc2hyaW5rZWRQYWlyc1swXTtcblx0fVxuXG5cdHR5cGUgSXRlbSA9IElRdWlja1BpY2tJdGVtICYgeyBwYWlyOiBXb3Jrc3BhY2VGb2xkZXJDd2RQYWlyIH07XG5cdGNvbnN0IGZvbGRlclBpY2tzOiBJdGVtW10gPSBzaHJpbmtlZFBhaXJzLm1hcChwYWlyID0+IHtcblx0XHRjb25zdCBsYWJlbCA9IHBhaXIuZm9sZGVyLm5hbWU7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBwYWlyLmlzT3ZlcnJpZGRlblxuXHRcdFx0PyBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5vdmVycmlkZGVuQ3dkRGVzY3JpcHRpb24nLCBcIihPdmVycmlkZGVuKSB7MH1cIiwgbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHBhaXIuY3dkLCB7IHJlbGF0aXZlOiAhcGFpci5pc0Fic29sdXRlIH0pKVxuXHRcdFx0OiBsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZGlybmFtZShwYWlyLmN3ZCksIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWwsXG5cdFx0XHRkZXNjcmlwdGlvbjogZGVzY3JpcHRpb24gIT09IGxhYmVsID8gZGVzY3JpcHRpb24gOiB1bmRlZmluZWQsXG5cdFx0XHRwYWlyOiBwYWlyLFxuXHRcdFx0aWNvbkNsYXNzZXM6IGdldEljb25DbGFzc2VzKG1vZGVsU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlLCBwYWlyLmN3ZCwgRmlsZUtpbmQuUk9PVF9GT0xERVIpXG5cdFx0fTtcblx0fSk7XG5cdGNvbnN0IG9wdGlvbnM6IElQaWNrT3B0aW9uczxJdGVtPiA9IHtcblx0XHRwbGFjZUhvbGRlcjogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwubmV3V29ya3NwYWNlUGxhY2Vob2xkZXInLCBcIlNlbGVjdCBjdXJyZW50IHdvcmtpbmcgZGlyZWN0b3J5IGZvciBuZXcgdGVybWluYWxcIiksXG5cdFx0bWF0Y2hPbkRlc2NyaXB0aW9uOiB0cnVlLFxuXHRcdGNhblBpY2tNYW55OiBmYWxzZSxcblx0fTtcblxuXHRjb25zdCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gPSBjYW5jZWwgfHwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZTtcblx0Y29uc3QgcGljayA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2s8SXRlbT4oZm9sZGVyUGlja3MsIG9wdGlvbnMsIHRva2VuKTtcblx0cmV0dXJuIHBpY2s/LnBhaXI7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlc29sdmVXb3Jrc3BhY2VGb2xkZXJDd2QoZm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyLCBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSk6IFByb21pc2U8V29ya3NwYWNlRm9sZGVyQ3dkUGFpcj4ge1xuXHRjb25zdCBjd2RDb25maWcgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbFNldHRpbmdJZC5Dd2QsIHsgcmVzb3VyY2U6IGZvbGRlci51cmkgfSk7XG5cdGlmICghaXNTdHJpbmcoY3dkQ29uZmlnKSB8fCBjd2RDb25maWcubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHsgZm9sZGVyLCBjd2Q6IGZvbGRlci51cmksIGlzQWJzb2x1dGU6IGZhbHNlLCBpc092ZXJyaWRkZW46IGZhbHNlIH07XG5cdH1cblxuXHRjb25zdCByZXNvbHZlZEN3ZENvbmZpZyA9IGF3YWl0IGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UucmVzb2x2ZUFzeW5jKGZvbGRlciwgY3dkQ29uZmlnKTtcblx0cmV0dXJuIGlzQWJzb2x1dGUocmVzb2x2ZWRDd2RDb25maWcpIHx8IHJlc29sdmVkQ3dkQ29uZmlnLnN0YXJ0c1dpdGgoQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5WQVJJQUJMRV9MSFMpXG5cdFx0PyB7IGZvbGRlciwgaXNBYnNvbHV0ZTogdHJ1ZSwgaXNPdmVycmlkZGVuOiB0cnVlLCBjd2Q6IFVSSS5mcm9tKHsgLi4uZm9sZGVyLnVyaSwgcGF0aDogcmVzb2x2ZWRDd2RDb25maWcgfSkgfVxuXHRcdDogeyBmb2xkZXIsIGlzQWJzb2x1dGU6IGZhbHNlLCBpc092ZXJyaWRkZW46IHRydWUsIGN3ZDogVVJJLmpvaW5QYXRoKGZvbGRlci51cmksIHJlc29sdmVkQ3dkQ29uZmlnKSB9O1xufVxuXG4vKipcbiAqIERyb3BzIHJlcGVhdGVkIENXRHMsIGlmIGFueSwgYnkga2VlcGluZyB0aGUgb25lIHdoaWNoIGJlc3QgbWF0Y2hlcyB0aGUgd29ya3NwYWNlIGZvbGRlci4gSXQgYWxzbyBwcmVzZXJ2ZXMgdGhlIG9yaWdpbmFsIG9yZGVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2hyaW5rV29ya3NwYWNlRm9sZGVyQ3dkUGFpcnMocGFpcnM6IFdvcmtzcGFjZUZvbGRlckN3ZFBhaXJbXSk6IFdvcmtzcGFjZUZvbGRlckN3ZFBhaXJbXSB7XG5cdGNvbnN0IG1hcCA9IG5ldyBNYXA8c3RyaW5nLCBXb3Jrc3BhY2VGb2xkZXJDd2RQYWlyPigpO1xuXHRmb3IgKGNvbnN0IHBhaXIgb2YgcGFpcnMpIHtcblx0XHRjb25zdCBrZXkgPSBwYWlyLmN3ZC50b1N0cmluZygpO1xuXHRcdGNvbnN0IHZhbHVlID0gbWFwLmdldChrZXkpO1xuXHRcdGlmICghdmFsdWUgfHwga2V5ID09PSBwYWlyLmZvbGRlci51cmkudG9TdHJpbmcoKSkge1xuXHRcdFx0bWFwLnNldChrZXksIHBhaXIpO1xuXHRcdH1cblx0fVxuXHRjb25zdCBzZWxlY3RlZFBhaXJzID0gbmV3IFNldChtYXAudmFsdWVzKCkpO1xuXHRjb25zdCBzZWxlY3RlZFBhaXJzSW5PcmRlciA9IHBhaXJzLmZpbHRlcih4ID0+IHNlbGVjdGVkUGFpcnMuaGFzKHgpKTtcblx0cmV0dXJuIHNlbGVjdGVkUGFpcnNJbk9yZGVyO1xufVxuXG5hc3luYyBmdW5jdGlvbiBmb2N1c0FjdGl2ZVRlcm1pbmFsKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZCwgYzogSVRlcm1pbmFsU2VydmljZXNDb2xsZWN0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IHRhcmdldCA9IGluc3RhbmNlXG5cdFx0Pz8gYy5zZXJ2aWNlLmFjdGl2ZUluc3RhbmNlXG5cdFx0Pz8gYy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlXG5cdFx0Pz8gYy5ncm91cFNlcnZpY2UuYWN0aXZlSW5zdGFuY2U7XG5cdGlmICghdGFyZ2V0KSB7XG5cdFx0aWYgKGMuZ3JvdXBTZXJ2aWNlLmluc3RhbmNlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRhd2FpdCBjLmdyb3VwU2VydmljZS5zaG93UGFuZWwodHJ1ZSk7XG5cdFx0fVxuXHRcdHJldHVybjtcblx0fVxuXHRhd2FpdCBjLnNlcnZpY2UuZm9jdXNJbnN0YW5jZSh0YXJnZXQpO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZW5hbWVXaXRoUXVpY2tQaWNrKGM6IElUZXJtaW5hbFNlcnZpY2VzQ29sbGVjdGlvbiwgYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJlc291cmNlPzogdW5rbm93bikge1xuXHRsZXQgaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkID0gcmVzb3VyY2UgYXMgSVRlcm1pbmFsSW5zdGFuY2U7XG5cdC8vIENoZWNrIGlmIHRoZSAnaW5zdGFuY2UnIGRvZXMgbm90IGV4aXN0IG9yIGlmICdpbnN0YW5jZS5yZW5hbWUnIGlzIG5vdCBkZWZpbmVkXG5cdGlmICghaW5zdGFuY2UgfHwgIWluc3RhbmNlPy5yZW5hbWUpIHtcblx0XHQvLyBJZiBub3QsIG9idGFpbiB0aGUgcmVzb3VyY2UgaW5zdGFuY2UgdXNpbmcgJ2dldFJlc291cmNlT3JBY3RpdmVJbnN0YW5jZSdcblx0XHRpbnN0YW5jZSA9IGdldFJlc291cmNlT3JBY3RpdmVJbnN0YW5jZShjLCByZXNvdXJjZSk7XG5cdH1cblxuXHRpZiAoaW5zdGFuY2UpIHtcblx0XHRjb25zdCB0aXRsZSA9IGF3YWl0IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpLmlucHV0KHtcblx0XHRcdHZhbHVlOiBpbnN0YW5jZS50aXRsZSxcblx0XHRcdHByb21wdDogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucmVuYW1lLnByb21wdCcsIFwiRW50ZXIgdGVybWluYWwgbmFtZVwiKSxcblx0XHR9KTtcblx0XHRpZiAodGl0bGUpIHtcblx0XHRcdGluc3RhbmNlLnJlbmFtZSh0aXRsZSk7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIHRvT3B0aW9uYWxVcmkob2JqOiB1bmtub3duKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIFVSSS5pc1VyaShvYmopID8gb2JqIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiB0b09wdGlvbmFsU3RyaW5nKG9iajogdW5rbm93bik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBpc1N0cmluZyhvYmopID8gb2JqIDogdW5kZWZpbmVkO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGlCQUFpQixjQUFjLGdCQUFnQix1QkFBdUI7QUFDL0UsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFVBQVUsU0FBUyxjQUFjO0FBRTFDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxRQUFRLFVBQVUsZ0JBQWdCO0FBQzNDLFNBQVMsV0FBVztBQUNwQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsU0FBMEIsUUFBUSx1QkFBdUI7QUFDbEUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQXVCLDBCQUEwQztBQUNqRSxTQUFTLDBCQUEwQjtBQUNuQyxTQUEyQixvQkFBa0Msa0JBQWtCLHlCQUF5QjtBQUN4RyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdDQUFrRDtBQUMzRCxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLCtCQUErQjtBQUN4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
