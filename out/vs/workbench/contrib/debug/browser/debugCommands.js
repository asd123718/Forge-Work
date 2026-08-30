import { getWindowId } from "../../../../base/browser/dom.js";
import { List } from "../../../../base/browser/ui/list/listWidget.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { deepClone } from "../../../../base/common/objects.js";
import { isWeb, isWindows } from "../../../../base/common/platform.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { ITextResourcePropertiesService } from "../../../../editor/common/services/textResourceConfiguration.js";
import * as nls from "../../../../nls.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { InputFocusedContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { IExtensionHostDebugService } from "../../../../platform/debug/common/extensionHostDebug.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IListService } from "../../../../platform/list/browser/listService.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ActiveEditorContext, PanelFocusContext, ResourceContextKey } from "../../../common/contextkeys.js";
import { ViewContainerLocation } from "../../../common/views.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IPaneCompositePartService } from "../../../services/panecomposite/browser/panecomposite.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { TEXT_FILE_EDITOR_ID } from "../../files/common/files.js";
import { CONTEXT_BREAKPOINT_INPUT_FOCUSED, CONTEXT_BREAKPOINTS_FOCUSED, CONTEXT_DEBUG_STATE, CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DISASSEMBLY_VIEW_FOCUS, CONTEXT_EXPRESSION_SELECTED, CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_IN_DEBUG_MODE, CONTEXT_IN_DEBUG_REPL, CONTEXT_JUMP_TO_CURSOR_SUPPORTED, CONTEXT_STEP_INTO_TARGETS_SUPPORTED, CONTEXT_VARIABLES_FOCUSED, CONTEXT_WATCH_EXPRESSIONS_FOCUSED, DataBreakpointSetType, EDITOR_CONTRIBUTION_ID, getStateLabel, IDebugService, isFrameDeemphasized, REPL_VIEW_ID, State, VIEWLET_ID } from "../common/debug.js";
import { Breakpoint, DataBreakpoint, Expression, FunctionBreakpoint, Variable } from "../common/debugModel.js";
import { saveAllBeforeDebugStart, resolveChildSession } from "../common/debugUtils.js";
import { showLoadedScriptMenu } from "../common/loadedScriptsPicker.js";
import { openBreakpointSource } from "./breakpointsView.js";
import { showDebugSessionMenu } from "./debugSessionPicker.js";
const ADD_CONFIGURATION_ID = "debug.addConfiguration";
const COPY_ADDRESS_ID = "editor.debug.action.copyAddress";
const TOGGLE_BREAKPOINT_ID = "editor.debug.action.toggleBreakpoint";
const TOGGLE_INLINE_BREAKPOINT_ID = "editor.debug.action.toggleInlineBreakpoint";
const COPY_STACK_TRACE_ID = "debug.copyStackTrace";
const REVERSE_CONTINUE_ID = "workbench.action.debug.reverseContinue";
const STEP_BACK_ID = "workbench.action.debug.stepBack";
const RESTART_SESSION_ID = "workbench.action.debug.restart";
const TERMINATE_THREAD_ID = "workbench.action.debug.terminateThread";
const STEP_OVER_ID = "workbench.action.debug.stepOver";
const STEP_INTO_ID = "workbench.action.debug.stepInto";
const STEP_INTO_TARGET_ID = "workbench.action.debug.stepIntoTarget";
const STEP_OUT_ID = "workbench.action.debug.stepOut";
const PAUSE_ID = "workbench.action.debug.pause";
const DISCONNECT_ID = "workbench.action.debug.disconnect";
const DISCONNECT_AND_SUSPEND_ID = "workbench.action.debug.disconnectAndSuspend";
const STOP_ID = "workbench.action.debug.stop";
const RESTART_FRAME_ID = "workbench.action.debug.restartFrame";
const CONTINUE_ID = "workbench.action.debug.continue";
const FOCUS_REPL_ID = "workbench.debug.action.focusRepl";
const JUMP_TO_CURSOR_ID = "debug.jumpToCursor";
const FOCUS_SESSION_ID = "workbench.action.debug.focusProcess";
const SELECT_AND_START_ID = "workbench.action.debug.selectandstart";
const SELECT_DEBUG_CONSOLE_ID = "workbench.action.debug.selectDebugConsole";
const SELECT_DEBUG_SESSION_ID = "workbench.action.debug.selectDebugSession";
const DEBUG_CONFIGURE_COMMAND_ID = "workbench.action.debug.configure";
const DEBUG_START_COMMAND_ID = "workbench.action.debug.start";
const DEBUG_RUN_COMMAND_ID = "workbench.action.debug.run";
const EDIT_EXPRESSION_COMMAND_ID = "debug.renameWatchExpression";
const COPY_WATCH_EXPRESSION_COMMAND_ID = "debug.copyWatchExpression";
const SET_EXPRESSION_COMMAND_ID = "debug.setWatchExpression";
const REMOVE_EXPRESSION_COMMAND_ID = "debug.removeWatchExpression";
const NEXT_DEBUG_CONSOLE_ID = "workbench.action.debug.nextConsole";
const PREV_DEBUG_CONSOLE_ID = "workbench.action.debug.prevConsole";
const SHOW_LOADED_SCRIPTS_ID = "workbench.action.debug.showLoadedScripts";
const CALLSTACK_TOP_ID = "workbench.action.debug.callStackTop";
const CALLSTACK_BOTTOM_ID = "workbench.action.debug.callStackBottom";
const CALLSTACK_UP_ID = "workbench.action.debug.callStackUp";
const CALLSTACK_DOWN_ID = "workbench.action.debug.callStackDown";
const ADD_TO_WATCH_ID = "debug.addToWatchExpressions";
const COPY_EVALUATE_PATH_ID = "debug.copyEvaluatePath";
const COPY_VALUE_ID = "workbench.debug.viewlet.action.copyValue";
const BREAK_WHEN_VALUE_CHANGES_ID = "debug.breakWhenValueChanges";
const BREAK_WHEN_VALUE_IS_ACCESSED_ID = "debug.breakWhenValueIsAccessed";
const BREAK_WHEN_VALUE_IS_READ_ID = "debug.breakWhenValueIsRead";
const TOGGLE_EXCEPTION_BREAKPOINTS_ID = "debug.toggleExceptionBreakpoints";
const ATTACH_TO_CURRENT_CODE_RENDERER = "debug.attachToCurrentCodeRenderer";
const DEBUG_COMMAND_CATEGORY = nls.localize2("debug", "Debug");
const RESTART_LABEL = nls.localize2("restartDebug", "Restart");
const STEP_OVER_LABEL = nls.localize2("stepOverDebug", "Step Over");
const STEP_INTO_LABEL = nls.localize2("stepIntoDebug", "Step Into");
const STEP_INTO_TARGET_LABEL = nls.localize2("stepIntoTargetDebug", "Step Into Target");
const STEP_OUT_LABEL = nls.localize2("stepOutDebug", "Step Out");
const PAUSE_LABEL = nls.localize2("pauseDebug", "Pause");
const DISCONNECT_LABEL = nls.localize2("disconnect", "Disconnect");
const DISCONNECT_AND_SUSPEND_LABEL = nls.localize2("disconnectSuspend", "Disconnect and Suspend");
const STOP_LABEL = nls.localize2("stop", "Stop");
const CONTINUE_LABEL = nls.localize2("continueDebug", "Continue");
const FOCUS_SESSION_LABEL = nls.localize2("focusSession", "Focus Session");
const SELECT_AND_START_LABEL = nls.localize2("selectAndStartDebugging", "Select and Start Debugging");
const DEBUG_CONFIGURE_LABEL = nls.localize("openLaunchJson", "Open '{0}'", "launch.json");
const DEBUG_START_LABEL = nls.localize2("startDebug", "Start Debugging");
const DEBUG_RUN_LABEL = nls.localize2("startWithoutDebugging", "Start Without Debugging");
const NEXT_DEBUG_CONSOLE_LABEL = nls.localize2("nextDebugConsole", "Focus Next Debug Console");
const PREV_DEBUG_CONSOLE_LABEL = nls.localize2("prevDebugConsole", "Focus Previous Debug Console");
const OPEN_LOADED_SCRIPTS_LABEL = nls.localize2("openLoadedScript", "Open Loaded Script...");
const CALLSTACK_TOP_LABEL = nls.localize2("callStackTop", "Navigate to Top of Call Stack");
const CALLSTACK_BOTTOM_LABEL = nls.localize2("callStackBottom", "Navigate to Bottom of Call Stack");
const CALLSTACK_UP_LABEL = nls.localize2("callStackUp", "Navigate Up Call Stack");
const CALLSTACK_DOWN_LABEL = nls.localize2("callStackDown", "Navigate Down Call Stack");
const COPY_EVALUATE_PATH_LABEL = nls.localize2("copyAsExpression", "Copy as Expression");
const COPY_VALUE_LABEL = nls.localize2("copyValue", "Copy Value");
const COPY_ADDRESS_LABEL = nls.localize2("copyAddress", "Copy Address");
const ADD_TO_WATCH_LABEL = nls.localize2("addToWatchExpressions", "Add to Watch");
const SELECT_DEBUG_CONSOLE_LABEL = nls.localize2("selectDebugConsole", "Select Debug Console");
const SELECT_DEBUG_SESSION_LABEL = nls.localize2("selectDebugSession", "Select Debug Session");
const DEBUG_QUICK_ACCESS_PREFIX = "debug ";
const DEBUG_CONSOLE_QUICK_ACCESS_PREFIX = "debug consoles ";
let dataBreakpointInfoResponse;
function setDataBreakpointInfoResponse(resp) {
  dataBreakpointInfoResponse = resp;
}
function isThreadContext(obj) {
  return obj && typeof obj.sessionId === "string" && typeof obj.threadId === "string";
}
async function getThreadAndRun(accessor, sessionAndThreadId, run) {
  const debugService = accessor.get(IDebugService);
  let thread;
  if (isThreadContext(sessionAndThreadId)) {
    const session = debugService.getModel().getSession(sessionAndThreadId.sessionId);
    if (session) {
      thread = session.getAllThreads().find((t) => t.getId() === sessionAndThreadId.threadId);
    }
  } else if (isSessionContext(sessionAndThreadId)) {
    const session = debugService.getModel().getSession(sessionAndThreadId.sessionId);
    if (session) {
      const threads = session.getAllThreads();
      thread = threads.length > 0 ? threads[0] : void 0;
    }
  }
  if (!thread) {
    thread = debugService.getViewModel().focusedThread;
    if (!thread) {
      const focusedSession = debugService.getViewModel().focusedSession;
      const threads = focusedSession ? focusedSession.getAllThreads() : void 0;
      thread = threads && threads.length ? threads[0] : void 0;
    }
  }
  if (thread) {
    await run(thread);
  }
}
function isStackFrameContext(obj) {
  return obj && typeof obj.sessionId === "string" && typeof obj.threadId === "string" && typeof obj.frameId === "string";
}
function getFrame(debugService, context) {
  if (isStackFrameContext(context)) {
    const session = debugService.getModel().getSession(context.sessionId);
    if (session) {
      const thread = session.getAllThreads().find((t) => t.getId() === context.threadId);
      if (thread) {
        return thread.getCallStack().find((sf) => sf.getId() === context.frameId);
      }
    }
  } else {
    return debugService.getViewModel().focusedStackFrame;
  }
  return void 0;
}
function isSessionContext(obj) {
  return obj && typeof obj.sessionId === "string";
}
async function changeDebugConsoleFocus(accessor, next) {
  const debugService = accessor.get(IDebugService);
  const viewsService = accessor.get(IViewsService);
  const sessions = debugService.getModel().getSessions(true).filter((s) => s.hasSeparateRepl());
  let currSession = debugService.getViewModel().focusedSession;
  let nextIndex = 0;
  if (sessions.length > 0 && currSession) {
    while (currSession && !currSession.hasSeparateRepl()) {
      currSession = currSession.parentSession;
    }
    if (currSession) {
      const currIndex = sessions.indexOf(currSession);
      if (next) {
        nextIndex = currIndex === sessions.length - 1 ? 0 : currIndex + 1;
      } else {
        nextIndex = currIndex === 0 ? sessions.length - 1 : currIndex - 1;
      }
    }
  }
  await debugService.focusStackFrame(void 0, void 0, sessions[nextIndex], { explicit: true });
  if (!viewsService.isViewVisible(REPL_VIEW_ID)) {
    await viewsService.openView(REPL_VIEW_ID, true);
  }
}
async function navigateCallStack(debugService, down) {
  const frame = debugService.getViewModel().focusedStackFrame;
  if (frame) {
    let callStack = frame.thread.getCallStack();
    let index = callStack.findIndex((elem) => elem.frameId === frame.frameId);
    let nextVisibleFrame;
    if (down) {
      if (index >= callStack.length - 1) {
        if (frame.thread.reachedEndOfCallStack) {
          goToTopOfCallStack(debugService);
          return;
        } else {
          await debugService.getModel().fetchCallstack(frame.thread, 20);
          callStack = frame.thread.getCallStack();
          index = callStack.findIndex((elem) => elem.frameId === frame.frameId);
        }
      }
      nextVisibleFrame = findNextVisibleFrame(true, callStack, index);
    } else {
      if (index <= 0) {
        goToBottomOfCallStack(debugService);
        return;
      }
      nextVisibleFrame = findNextVisibleFrame(false, callStack, index);
    }
    if (nextVisibleFrame) {
      debugService.focusStackFrame(nextVisibleFrame, void 0, void 0, { preserveFocus: false });
    }
  }
}
async function goToBottomOfCallStack(debugService) {
  const thread = debugService.getViewModel().focusedThread;
  if (thread) {
    await debugService.getModel().fetchCallstack(thread);
    const callStack = thread.getCallStack();
    if (callStack.length > 0) {
      const nextVisibleFrame = findNextVisibleFrame(false, callStack, 0);
      if (nextVisibleFrame) {
        debugService.focusStackFrame(nextVisibleFrame, void 0, void 0, { preserveFocus: false });
      }
    }
  }
}
function goToTopOfCallStack(debugService) {
  const thread = debugService.getViewModel().focusedThread;
  if (thread) {
    debugService.focusStackFrame(thread.getTopStackFrame(), void 0, void 0, { preserveFocus: false });
  }
}
function findNextVisibleFrame(down, callStack, startIndex) {
  if (startIndex >= callStack.length) {
    startIndex = callStack.length - 1;
  } else if (startIndex < 0) {
    startIndex = 0;
  }
  let index = startIndex;
  let currFrame;
  do {
    if (down) {
      if (index === callStack.length - 1) {
        index = 0;
      } else {
        index++;
      }
    } else {
      if (index === 0) {
        index = callStack.length - 1;
      } else {
        index--;
      }
    }
    currFrame = callStack[index];
    if (!isFrameDeemphasized(currFrame)) {
      return currFrame;
    }
  } while (index !== startIndex);
  return void 0;
}
CommandsRegistry.registerCommand({
  id: COPY_STACK_TRACE_ID,
  handler: async (accessor, _, context) => {
    const textResourcePropertiesService = accessor.get(ITextResourcePropertiesService);
    const clipboardService = accessor.get(IClipboardService);
    const debugService = accessor.get(IDebugService);
    const frame = getFrame(debugService, context);
    if (frame) {
      const eol = textResourcePropertiesService.getEOL(frame.source.uri);
      await clipboardService.writeText(frame.thread.getCallStack().map((sf) => sf.toString()).join(eol));
    }
  }
});
CommandsRegistry.registerCommand({
  id: REVERSE_CONTINUE_ID,
  handler: async (accessor, _, context) => {
    await getThreadAndRun(accessor, context, (thread) => thread.reverseContinue());
  }
});
CommandsRegistry.registerCommand({
  id: STEP_BACK_ID,
  handler: async (accessor, _, context) => {
    const contextKeyService = accessor.get(IContextKeyService);
    if (CONTEXT_DISASSEMBLY_VIEW_FOCUS.getValue(contextKeyService)) {
      await getThreadAndRun(accessor, context, (thread) => thread.stepBack("instruction"));
    } else {
      await getThreadAndRun(accessor, context, (thread) => thread.stepBack());
    }
  }
});
CommandsRegistry.registerCommand({
  id: TERMINATE_THREAD_ID,
  handler: async (accessor, _, context) => {
    await getThreadAndRun(accessor, context, (thread) => thread.terminate());
  }
});
CommandsRegistry.registerCommand({
  id: JUMP_TO_CURSOR_ID,
  handler: async (accessor) => {
    const debugService = accessor.get(IDebugService);
    const stackFrame = debugService.getViewModel().focusedStackFrame;
    const editorService = accessor.get(IEditorService);
    const activeEditorControl = editorService.activeTextEditorControl;
    const notificationService = accessor.get(INotificationService);
    const quickInputService = accessor.get(IQuickInputService);
    if (stackFrame && isCodeEditor(activeEditorControl) && activeEditorControl.hasModel()) {
      const position = activeEditorControl.getPosition();
      const resource = activeEditorControl.getModel().uri;
      const source = stackFrame.thread.session.getSourceForUri(resource);
      if (source) {
        const response = await stackFrame.thread.session.gotoTargets(source.raw, position.lineNumber, position.column);
        const targets = response?.body.targets;
        if (targets && targets.length) {
          let id = targets[0].id;
          if (targets.length > 1) {
            const picks = targets.map((t) => ({ label: t.label, _id: t.id }));
            const pick = await quickInputService.pick(picks, { placeHolder: nls.localize("chooseLocation", "Choose the specific location") });
            if (!pick) {
              return;
            }
            id = pick._id;
          }
          return await stackFrame.thread.session.goto(stackFrame.thread.threadId, id).catch((e) => notificationService.warn(e));
        }
      }
    }
    return notificationService.warn(nls.localize("noExecutableCode", "No executable code is associated at the current cursor position."));
  }
});
CommandsRegistry.registerCommand({
  id: CALLSTACK_TOP_ID,
  handler: async (accessor, _, context) => {
    const debugService = accessor.get(IDebugService);
    goToTopOfCallStack(debugService);
  }
});
CommandsRegistry.registerCommand({
  id: CALLSTACK_BOTTOM_ID,
  handler: async (accessor, _, context) => {
    const debugService = accessor.get(IDebugService);
    await goToBottomOfCallStack(debugService);
  }
});
CommandsRegistry.registerCommand({
  id: CALLSTACK_UP_ID,
  handler: async (accessor, _, context) => {
    const debugService = accessor.get(IDebugService);
    navigateCallStack(debugService, false);
  }
});
CommandsRegistry.registerCommand({
  id: CALLSTACK_DOWN_ID,
  handler: async (accessor, _, context) => {
    const debugService = accessor.get(IDebugService);
    navigateCallStack(debugService, true);
  }
});
MenuRegistry.appendMenuItem(MenuId.EditorContext, {
  command: {
    id: JUMP_TO_CURSOR_ID,
    title: nls.localize("jumpToCursor", "Jump to Cursor"),
    category: DEBUG_COMMAND_CATEGORY
  },
  when: ContextKeyExpr.and(CONTEXT_JUMP_TO_CURSOR_SUPPORTED, EditorContextKeys.editorTextFocus),
  group: "debug",
  order: 3
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: NEXT_DEBUG_CONSOLE_ID,
  weight: KeybindingWeight.WorkbenchContrib + 1,
  when: CONTEXT_IN_DEBUG_REPL,
  primary: KeyMod.CtrlCmd | KeyCode.PageDown,
  mac: { primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.BracketRight },
  handler: async (accessor, _, context) => {
    changeDebugConsoleFocus(accessor, true);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: PREV_DEBUG_CONSOLE_ID,
  weight: KeybindingWeight.WorkbenchContrib + 1,
  when: CONTEXT_IN_DEBUG_REPL,
  primary: KeyMod.CtrlCmd | KeyCode.PageUp,
  mac: { primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.BracketLeft },
  handler: async (accessor, _, context) => {
    changeDebugConsoleFocus(accessor, false);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: RESTART_SESSION_ID,
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.F5,
  when: CONTEXT_IN_DEBUG_MODE,
  handler: async (accessor, _, context) => {
    const debugService = accessor.get(IDebugService);
    const configurationService = accessor.get(IConfigurationService);
    let session;
    if (isSessionContext(context)) {
      session = debugService.getModel().getSession(context.sessionId);
    } else {
      session = debugService.getViewModel().focusedSession;
    }
    if (!session) {
      const { launch, name } = debugService.getConfigurationManager().selectedConfiguration;
      await debugService.startDebugging(launch, name, { noDebug: false, startedByUser: true });
    } else {
      const showSubSessions = configurationService.getValue("debug").showSubSessionsInToolBar;
      while (!showSubSessions && session.lifecycleManagedByParent && session.parentSession) {
        session = session.parentSession;
      }
      session.removeReplExpressions();
      await debugService.restartSession(session);
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: STEP_OVER_ID,
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyCode.F10,
  when: CONTEXT_DEBUG_STATE.isEqualTo("stopped"),
  handler: async (accessor, _, context) => {
    const contextKeyService = accessor.get(IContextKeyService);
    if (CONTEXT_DISASSEMBLY_VIEW_FOCUS.getValue(contextKeyService)) {
      await getThreadAndRun(accessor, context, (thread) => thread.next("instruction"));
    } else {
      await getThreadAndRun(accessor, context, (thread) => thread.next());
    }
  }
});
const STEP_INTO_KEYBINDING = isWeb && isWindows ? KeyMod.Alt | KeyCode.F11 : KeyCode.F11;
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: STEP_INTO_ID,
  weight: KeybindingWeight.WorkbenchContrib + 10,
  // Have a stronger weight to have priority over full screen when debugging
  primary: STEP_INTO_KEYBINDING,
  // Use a more flexible when clause to not allow full screen command to take over when F11 pressed a lot of times
  when: CONTEXT_DEBUG_STATE.notEqualsTo("inactive"),
  handler: async (accessor, _, context) => {
    const contextKeyService = accessor.get(IContextKeyService);
    if (CONTEXT_DISASSEMBLY_VIEW_FOCUS.getValue(contextKeyService)) {
      await getThreadAndRun(accessor, context, (thread) => thread.stepIn("instruction"));
    } else {
      await getThreadAndRun(accessor, context, (thread) => thread.stepIn());
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: STEP_OUT_ID,
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyMod.Shift | KeyCode.F11,
  when: CONTEXT_DEBUG_STATE.isEqualTo("stopped"),
  handler: async (accessor, _, context) => {
    const contextKeyService = accessor.get(IContextKeyService);
    if (CONTEXT_DISASSEMBLY_VIEW_FOCUS.getValue(contextKeyService)) {
      await getThreadAndRun(accessor, context, (thread) => thread.stepOut("instruction"));
    } else {
      await getThreadAndRun(accessor, context, (thread) => thread.stepOut());
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: PAUSE_ID,
  weight: KeybindingWeight.WorkbenchContrib + 2,
  // take priority over focus next part while we are debugging
  primary: KeyCode.F6,
  when: CONTEXT_DEBUG_STATE.isEqualTo("running"),
  handler: async (accessor, _, context) => {
    await getThreadAndRun(accessor, context, (thread) => thread.pause());
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: STEP_INTO_TARGET_ID,
  primary: STEP_INTO_KEYBINDING | KeyMod.CtrlCmd,
  when: ContextKeyExpr.and(CONTEXT_STEP_INTO_TARGETS_SUPPORTED, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo("stopped")),
  weight: KeybindingWeight.WorkbenchContrib,
  handler: async (accessor, _, context) => {
    const quickInputService = accessor.get(IQuickInputService);
    const debugService = accessor.get(IDebugService);
    const session = debugService.getViewModel().focusedSession;
    const frame = debugService.getViewModel().focusedStackFrame;
    if (!frame || !session) {
      return;
    }
    const editor = await accessor.get(IEditorService).openEditor({
      resource: frame.source.uri,
      options: { revealIfOpened: true }
    });
    let codeEditor;
    if (editor) {
      const ctrl = editor?.getControl();
      if (isCodeEditor(ctrl)) {
        codeEditor = ctrl;
      }
    }
    const disposables = new DisposableStore();
    const qp = disposables.add(quickInputService.createQuickPick());
    qp.busy = true;
    qp.show();
    disposables.add(qp.onDidChangeActive(([item]) => {
      if (codeEditor && item && item.target.line !== void 0) {
        codeEditor.revealLineInCenterIfOutsideViewport(item.target.line);
        codeEditor.setSelection({
          startLineNumber: item.target.line,
          startColumn: item.target.column || 1,
          endLineNumber: item.target.endLine || item.target.line,
          endColumn: item.target.endColumn || item.target.column || 1
        });
      }
    }));
    disposables.add(qp.onDidAccept(() => {
      if (qp.activeItems.length) {
        session.stepIn(frame.thread.threadId, qp.activeItems[0].target.id);
      }
    }));
    disposables.add(qp.onDidHide(() => disposables.dispose()));
    session.stepInTargets(frame.frameId).then((targets) => {
      qp.busy = false;
      if (targets?.length) {
        qp.items = targets?.map((target) => ({ target, label: target.label }));
      } else {
        qp.placeholder = nls.localize("editor.debug.action.stepIntoTargets.none", "No step targets available");
      }
    });
  }
});
async function stopHandler(accessor, _, context, disconnect, suspend) {
  const debugService = accessor.get(IDebugService);
  let session;
  if (isSessionContext(context)) {
    session = debugService.getModel().getSession(context.sessionId);
  } else {
    session = debugService.getViewModel().focusedSession;
  }
  const configurationService = accessor.get(IConfigurationService);
  const showSubSessions = configurationService.getValue("debug").showSubSessionsInToolBar;
  while (!showSubSessions && session && session.lifecycleManagedByParent && session.parentSession) {
    session = session.parentSession;
  }
  await debugService.stopSession(session, disconnect, suspend);
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: DISCONNECT_ID,
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyMod.Shift | KeyCode.F5,
  when: ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_IN_DEBUG_MODE),
  handler: (accessor, _, context) => stopHandler(accessor, _, context, true)
});
CommandsRegistry.registerCommand({
  id: DISCONNECT_AND_SUSPEND_ID,
  handler: (accessor, _, context) => stopHandler(accessor, _, context, true, true)
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: STOP_ID,
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyMod.Shift | KeyCode.F5,
  when: ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), CONTEXT_IN_DEBUG_MODE),
  handler: (accessor, _, context) => stopHandler(accessor, _, context, false)
});
CommandsRegistry.registerCommand({
  id: RESTART_FRAME_ID,
  handler: async (accessor, _, context) => {
    const debugService = accessor.get(IDebugService);
    const notificationService = accessor.get(INotificationService);
    const frame = getFrame(debugService, context);
    if (frame) {
      try {
        await frame.restart();
      } catch (e) {
        notificationService.error(e);
      }
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: CONTINUE_ID,
  weight: KeybindingWeight.WorkbenchContrib + 10,
  // Use a stronger weight to get priority over start debugging F5 shortcut
  primary: KeyCode.F5,
  when: CONTEXT_DEBUG_STATE.isEqualTo("stopped"),
  handler: async (accessor, _, context) => {
    await getThreadAndRun(accessor, context, (thread) => thread.continue());
  }
});
CommandsRegistry.registerCommand({
  id: SHOW_LOADED_SCRIPTS_ID,
  handler: async (accessor) => {
    await showLoadedScriptMenu(accessor);
  }
});
CommandsRegistry.registerCommand({
  id: "debug.startFromConfig",
  handler: async (accessor, config) => {
    const debugService = accessor.get(IDebugService);
    await debugService.startDebugging(void 0, config);
  }
});
CommandsRegistry.registerCommand({
  id: FOCUS_SESSION_ID,
  handler: async (accessor, session) => {
    const debugService = accessor.get(IDebugService);
    const editorService = accessor.get(IEditorService);
    session = resolveChildSession(session, debugService.getModel().getSessions());
    await debugService.focusStackFrame(void 0, void 0, session, { explicit: true });
    const stackFrame = debugService.getViewModel().focusedStackFrame;
    if (stackFrame) {
      await stackFrame.openInEditor(editorService, true);
    }
  }
});
CommandsRegistry.registerCommand({
  id: SELECT_AND_START_ID,
  handler: async (accessor, debugType, debugStartOptions) => {
    const quickInputService = accessor.get(IQuickInputService);
    const debugService = accessor.get(IDebugService);
    if (debugType) {
      const configManager = debugService.getConfigurationManager();
      const dynamicProviders = await configManager.getDynamicProviders();
      for (const provider of dynamicProviders) {
        if (provider.type === debugType) {
          const pick = await provider.pick();
          if (pick) {
            await configManager.selectConfiguration(pick.launch, pick.config.name, pick.config, { type: provider.type });
            debugService.startDebugging(pick.launch, pick.config, { noDebug: debugStartOptions?.noDebug, startedByUser: true });
            return;
          }
        }
      }
    }
    quickInputService.quickAccess.show(DEBUG_QUICK_ACCESS_PREFIX);
  }
});
CommandsRegistry.registerCommand({
  id: SELECT_DEBUG_CONSOLE_ID,
  handler: async (accessor) => {
    const quickInputService = accessor.get(IQuickInputService);
    quickInputService.quickAccess.show(DEBUG_CONSOLE_QUICK_ACCESS_PREFIX);
  }
});
CommandsRegistry.registerCommand({
  id: SELECT_DEBUG_SESSION_ID,
  handler: async (accessor) => {
    showDebugSessionMenu(accessor, SELECT_AND_START_ID);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: DEBUG_START_COMMAND_ID,
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyCode.F5,
  when: ContextKeyExpr.and(CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_STATE.isEqualTo("inactive")),
  handler: async (accessor, debugStartOptions) => {
    const debugService = accessor.get(IDebugService);
    await saveAllBeforeDebugStart(accessor.get(IConfigurationService), accessor.get(IEditorService));
    const { launch, name, getConfig } = debugService.getConfigurationManager().selectedConfiguration;
    const config = await getConfig();
    const configOrName = config ? Object.assign(deepClone(config), debugStartOptions?.config) : name;
    await debugService.startDebugging(launch, configOrName, { noDebug: debugStartOptions?.noDebug, startedByUser: true }, false);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: DEBUG_RUN_COMMAND_ID,
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyMod.CtrlCmd | KeyCode.F5,
  mac: { primary: KeyMod.WinCtrl | KeyCode.F5 },
  when: ContextKeyExpr.and(CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_STATE.notEqualsTo(getStateLabel(State.Initializing))),
  handler: async (accessor) => {
    const commandService = accessor.get(ICommandService);
    await commandService.executeCommand(DEBUG_START_COMMAND_ID, { noDebug: true });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "debug.toggleBreakpoint",
  weight: KeybindingWeight.WorkbenchContrib + 5,
  when: ContextKeyExpr.and(CONTEXT_BREAKPOINTS_FOCUSED, InputFocusedContext.toNegated()),
  primary: KeyCode.Space,
  handler: (accessor) => {
    const listService = accessor.get(IListService);
    const debugService = accessor.get(IDebugService);
    const list = listService.lastFocusedList;
    if (list instanceof List) {
      const focused = list.getFocusedElements();
      if (focused && focused.length) {
        debugService.enableOrDisableBreakpoints(!focused[0].enabled, focused[0]);
      }
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "debug.enableOrDisableBreakpoint",
  weight: KeybindingWeight.WorkbenchContrib,
  primary: void 0,
  when: EditorContextKeys.editorTextFocus,
  handler: (accessor) => {
    const debugService = accessor.get(IDebugService);
    const editorService = accessor.get(IEditorService);
    const control = editorService.activeTextEditorControl;
    if (isCodeEditor(control)) {
      const model = control.getModel();
      if (model) {
        const position = control.getPosition();
        if (position) {
          const bps = debugService.getModel().getBreakpoints({ uri: model.uri, lineNumber: position.lineNumber });
          if (bps.length) {
            debugService.enableOrDisableBreakpoints(!bps[0].enabled, bps[0]);
          }
        }
      }
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: EDIT_EXPRESSION_COMMAND_ID,
  weight: KeybindingWeight.WorkbenchContrib + 5,
  when: CONTEXT_WATCH_EXPRESSIONS_FOCUSED,
  primary: KeyCode.F2,
  mac: { primary: KeyCode.Enter },
  handler: (accessor, expression) => {
    const debugService = accessor.get(IDebugService);
    if (!(expression instanceof Expression)) {
      const listService = accessor.get(IListService);
      const focused = listService.lastFocusedList;
      if (focused) {
        const elements = focused.getFocus();
        if (Array.isArray(elements) && elements[0] instanceof Expression) {
          expression = elements[0];
        }
      }
    }
    if (expression instanceof Expression) {
      debugService.getViewModel().setSelectedExpression(expression, false);
    }
  }
});
CommandsRegistry.registerCommand({
  id: SET_EXPRESSION_COMMAND_ID,
  handler: async (accessor, expression) => {
    const debugService = accessor.get(IDebugService);
    if (expression instanceof Expression || expression instanceof Variable) {
      debugService.getViewModel().setSelectedExpression(expression, true);
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "debug.setVariable",
  weight: KeybindingWeight.WorkbenchContrib + 5,
  when: CONTEXT_VARIABLES_FOCUSED,
  primary: KeyCode.F2,
  mac: { primary: KeyCode.Enter },
  handler: (accessor) => {
    const listService = accessor.get(IListService);
    const debugService = accessor.get(IDebugService);
    const focused = listService.lastFocusedList;
    if (focused) {
      const elements = focused.getFocus();
      if (Array.isArray(elements) && elements[0] instanceof Variable) {
        debugService.getViewModel().setSelectedExpression(elements[0], false);
      }
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: REMOVE_EXPRESSION_COMMAND_ID,
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(CONTEXT_WATCH_EXPRESSIONS_FOCUSED, CONTEXT_EXPRESSION_SELECTED.toNegated()),
  primary: KeyCode.Delete,
  mac: { primary: KeyMod.CtrlCmd | KeyCode.Backspace },
  handler: (accessor, expression) => {
    const debugService = accessor.get(IDebugService);
    if (expression instanceof Expression) {
      debugService.removeWatchExpressions(expression.getId());
      return;
    }
    const listService = accessor.get(IListService);
    const focused = listService.lastFocusedList;
    if (focused) {
      let elements = focused.getFocus();
      if (Array.isArray(elements) && elements[0] instanceof Expression) {
        const selection = focused.getSelection();
        if (selection && selection.indexOf(elements[0]) >= 0) {
          elements = selection;
        }
        elements.forEach((e) => debugService.removeWatchExpressions(e.getId()));
      }
    }
  }
});
CommandsRegistry.registerCommand({
  id: BREAK_WHEN_VALUE_CHANGES_ID,
  handler: async (accessor) => {
    const debugService = accessor.get(IDebugService);
    if (dataBreakpointInfoResponse) {
      await debugService.addDataBreakpoint({ description: dataBreakpointInfoResponse.description, src: { type: DataBreakpointSetType.Variable, dataId: dataBreakpointInfoResponse.dataId }, canPersist: !!dataBreakpointInfoResponse.canPersist, accessTypes: dataBreakpointInfoResponse.accessTypes, accessType: "write" });
    }
  }
});
CommandsRegistry.registerCommand({
  id: BREAK_WHEN_VALUE_IS_ACCESSED_ID,
  handler: async (accessor) => {
    const debugService = accessor.get(IDebugService);
    if (dataBreakpointInfoResponse) {
      await debugService.addDataBreakpoint({ description: dataBreakpointInfoResponse.description, src: { type: DataBreakpointSetType.Variable, dataId: dataBreakpointInfoResponse.dataId }, canPersist: !!dataBreakpointInfoResponse.canPersist, accessTypes: dataBreakpointInfoResponse.accessTypes, accessType: "readWrite" });
    }
  }
});
CommandsRegistry.registerCommand({
  id: BREAK_WHEN_VALUE_IS_READ_ID,
  handler: async (accessor) => {
    const debugService = accessor.get(IDebugService);
    if (dataBreakpointInfoResponse) {
      await debugService.addDataBreakpoint({ description: dataBreakpointInfoResponse.description, src: { type: DataBreakpointSetType.Variable, dataId: dataBreakpointInfoResponse.dataId }, canPersist: !!dataBreakpointInfoResponse.canPersist, accessTypes: dataBreakpointInfoResponse.accessTypes, accessType: "read" });
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "debug.removeBreakpoint",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(CONTEXT_BREAKPOINTS_FOCUSED, CONTEXT_BREAKPOINT_INPUT_FOCUSED.toNegated()),
  primary: KeyCode.Delete,
  mac: { primary: KeyMod.CtrlCmd | KeyCode.Backspace },
  handler: (accessor) => {
    const listService = accessor.get(IListService);
    const debugService = accessor.get(IDebugService);
    const list = listService.lastFocusedList;
    if (list instanceof List) {
      const focused = list.getFocusedElements();
      const element = focused.length ? focused[0] : void 0;
      if (element instanceof Breakpoint) {
        debugService.removeBreakpoints(element.getId());
      } else if (element instanceof FunctionBreakpoint) {
        debugService.removeFunctionBreakpoints(element.getId());
      } else if (element instanceof DataBreakpoint) {
        debugService.removeDataBreakpoints(element.getId());
      }
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "debug.installAdditionalDebuggers",
  weight: KeybindingWeight.WorkbenchContrib,
  when: void 0,
  primary: void 0,
  handler: async (accessor, query) => {
    const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
    let searchFor = `@category:debuggers`;
    if (typeof query === "string") {
      searchFor += ` ${query}`;
    }
    return extensionsWorkbenchService.openSearch(searchFor);
  }
});
registerAction2(class AddConfigurationAction extends Action2 {
  constructor() {
    super({
      id: ADD_CONFIGURATION_ID,
      title: nls.localize2("addConfiguration", "Add Configuration..."),
      category: DEBUG_COMMAND_CATEGORY,
      f1: true,
      menu: {
        id: MenuId.EditorContent,
        when: ContextKeyExpr.and(
          ContextKeyExpr.regex(ResourceContextKey.Path.key, /\.vscode[/\\]launch\.json$/),
          ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID)
        )
      }
    });
  }
  async run(accessor, launchUri) {
    const manager = accessor.get(IDebugService).getConfigurationManager();
    const launch = manager.getLaunches().find((l) => l.uri.toString() === launchUri) || manager.selectedConfiguration.launch;
    if (launch) {
      const { editor, created } = await launch.openConfigFile({ preserveFocus: false });
      if (editor && !created) {
        const codeEditor = editor.getControl();
        if (codeEditor) {
          await codeEditor.getContribution(EDITOR_CONTRIBUTION_ID)?.addLaunchConfiguration();
        }
      }
    }
  }
});
const inlineBreakpointHandler = (accessor) => {
  const debugService = accessor.get(IDebugService);
  const editorService = accessor.get(IEditorService);
  const control = editorService.activeTextEditorControl;
  if (isCodeEditor(control)) {
    const position = control.getPosition();
    if (position && control.hasModel() && debugService.canSetBreakpointsIn(control.getModel())) {
      const modelUri = control.getModel().uri;
      const breakpointAlreadySet = debugService.getModel().getBreakpoints({ lineNumber: position.lineNumber, uri: modelUri }).some((bp) => bp.sessionAgnosticData.column === position.column || !bp.column && position.column <= 1);
      if (!breakpointAlreadySet) {
        debugService.addBreakpoints(modelUri, [{ lineNumber: position.lineNumber, column: position.column > 1 ? position.column : void 0 }]);
      }
    }
  }
};
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyMod.Shift | KeyCode.F9,
  when: EditorContextKeys.editorTextFocus,
  id: TOGGLE_INLINE_BREAKPOINT_ID,
  handler: inlineBreakpointHandler
});
MenuRegistry.appendMenuItem(MenuId.EditorContext, {
  command: {
    id: TOGGLE_INLINE_BREAKPOINT_ID,
    title: nls.localize("addInlineBreakpoint", "Add Inline Breakpoint"),
    category: DEBUG_COMMAND_CATEGORY
  },
  when: ContextKeyExpr.and(
    CONTEXT_IN_DEBUG_MODE,
    PanelFocusContext.toNegated(),
    EditorContextKeys.editorTextFocus,
    ChatContextKeys.inChatSession.toNegated()
  ),
  group: "debug",
  order: 1
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "debug.openBreakpointToSide",
  weight: KeybindingWeight.WorkbenchContrib,
  when: CONTEXT_BREAKPOINTS_FOCUSED,
  primary: KeyMod.CtrlCmd | KeyCode.Enter,
  secondary: [KeyMod.Alt | KeyCode.Enter],
  handler: (accessor) => {
    const listService = accessor.get(IListService);
    const list = listService.lastFocusedList;
    if (list instanceof List) {
      const focus = list.getFocusedElements();
      if (focus.length && focus[0] instanceof Breakpoint) {
        return openBreakpointSource(focus[0], true, false, true, accessor.get(IDebugService), accessor.get(IEditorService));
      }
    }
    return void 0;
  }
});
registerAction2(class ToggleExceptionBreakpointsAction extends Action2 {
  constructor() {
    super({
      id: TOGGLE_EXCEPTION_BREAKPOINTS_ID,
      title: nls.localize2("toggleExceptionBreakpoints", "Toggle Exception Breakpoints"),
      category: DEBUG_COMMAND_CATEGORY,
      f1: true,
      precondition: CONTEXT_DEBUGGERS_AVAILABLE
    });
  }
  async run(accessor) {
    const debugService = accessor.get(IDebugService);
    const quickInputService = accessor.get(IQuickInputService);
    const debugModel = debugService.getModel();
    const session = debugService.getViewModel().focusedSession || debugModel.getSessions()[0];
    const exceptionBreakpoints = session ? debugModel.getExceptionBreakpointsForSession(session.getId()) : debugModel.getExceptionBreakpoints();
    if (exceptionBreakpoints.length === 0) {
      return;
    }
    if (exceptionBreakpoints.length === 1) {
      const breakpoint = exceptionBreakpoints[0];
      await debugService.enableOrDisableBreakpoints(!breakpoint.enabled, breakpoint);
      return;
    }
    const disposables = new DisposableStore();
    const quickPick = disposables.add(quickInputService.createQuickPick());
    quickPick.placeholder = nls.localize("selectExceptionBreakpointsPlaceholder", "Pick enabled exception breakpoints");
    quickPick.canSelectMany = true;
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    quickPick.items = exceptionBreakpoints.map((bp) => ({
      label: bp.label,
      description: bp.description,
      picked: bp.enabled,
      breakpoint: bp
    }));
    quickPick.selectedItems = quickPick.items.filter((item) => item.picked);
    disposables.add(quickPick.onDidAccept(() => {
      const selectedItems = quickPick.selectedItems;
      const toEnable = [];
      const toDisable = [];
      for (const bp of exceptionBreakpoints) {
        const isSelected = selectedItems.some((item) => item.breakpoint === bp);
        if (isSelected && !bp.enabled) {
          toEnable.push(bp);
        } else if (!isSelected && bp.enabled) {
          toDisable.push(bp);
        }
      }
      const promises = [];
      for (const bp of toEnable) {
        promises.push(debugService.enableOrDisableBreakpoints(true, bp));
      }
      for (const bp of toDisable) {
        promises.push(debugService.enableOrDisableBreakpoints(false, bp));
      }
      Promise.all(promises).then(() => disposables.dispose());
    }));
    disposables.add(quickPick.onDidHide(() => disposables.dispose()));
    quickPick.show();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "debug.openView",
  weight: KeybindingWeight.WorkbenchContrib,
  when: CONTEXT_DEBUGGERS_AVAILABLE.toNegated(),
  primary: KeyCode.F5,
  secondary: [KeyMod.CtrlCmd | KeyCode.F5],
  handler: async (accessor) => {
    const paneCompositeService = accessor.get(IPaneCompositePartService);
    await paneCompositeService.openPaneComposite(VIEWLET_ID, ViewContainerLocation.Sidebar, true);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: ATTACH_TO_CURRENT_CODE_RENDERER,
      title: nls.localize2("attachToCurrentCodeRenderer", "Attach to Current Code Renderer")
    });
  }
  async run(accessor) {
    const env = accessor.get(IEnvironmentService);
    if (!env.isExtensionDevelopment && !env.extensionTestsLocationURI) {
      throw new Error("Refusing to attach to renderer outside of development context");
    }
    const windowId = getWindowId(mainWindow);
    const extDebugService = accessor.get(IExtensionHostDebugService);
    const result = await extDebugService.attachToCurrentWindowRenderer(windowId);
    return result;
  }
});
export {
  ADD_CONFIGURATION_ID,
  ADD_TO_WATCH_ID,
  ADD_TO_WATCH_LABEL,
  ATTACH_TO_CURRENT_CODE_RENDERER,
  BREAK_WHEN_VALUE_CHANGES_ID,
  BREAK_WHEN_VALUE_IS_ACCESSED_ID,
  BREAK_WHEN_VALUE_IS_READ_ID,
  CALLSTACK_BOTTOM_ID,
  CALLSTACK_BOTTOM_LABEL,
  CALLSTACK_DOWN_ID,
  CALLSTACK_DOWN_LABEL,
  CALLSTACK_TOP_ID,
  CALLSTACK_TOP_LABEL,
  CALLSTACK_UP_ID,
  CALLSTACK_UP_LABEL,
  CONTINUE_ID,
  CONTINUE_LABEL,
  COPY_ADDRESS_ID,
  COPY_ADDRESS_LABEL,
  COPY_EVALUATE_PATH_ID,
  COPY_EVALUATE_PATH_LABEL,
  COPY_STACK_TRACE_ID,
  COPY_VALUE_ID,
  COPY_VALUE_LABEL,
  COPY_WATCH_EXPRESSION_COMMAND_ID,
  DEBUG_COMMAND_CATEGORY,
  DEBUG_CONFIGURE_COMMAND_ID,
  DEBUG_CONFIGURE_LABEL,
  DEBUG_CONSOLE_QUICK_ACCESS_PREFIX,
  DEBUG_QUICK_ACCESS_PREFIX,
  DEBUG_RUN_COMMAND_ID,
  DEBUG_RUN_LABEL,
  DEBUG_START_COMMAND_ID,
  DEBUG_START_LABEL,
  DISCONNECT_AND_SUSPEND_ID,
  DISCONNECT_AND_SUSPEND_LABEL,
  DISCONNECT_ID,
  DISCONNECT_LABEL,
  EDIT_EXPRESSION_COMMAND_ID,
  FOCUS_REPL_ID,
  FOCUS_SESSION_ID,
  FOCUS_SESSION_LABEL,
  JUMP_TO_CURSOR_ID,
  NEXT_DEBUG_CONSOLE_ID,
  NEXT_DEBUG_CONSOLE_LABEL,
  OPEN_LOADED_SCRIPTS_LABEL,
  PAUSE_ID,
  PAUSE_LABEL,
  PREV_DEBUG_CONSOLE_ID,
  PREV_DEBUG_CONSOLE_LABEL,
  REMOVE_EXPRESSION_COMMAND_ID,
  RESTART_FRAME_ID,
  RESTART_LABEL,
  RESTART_SESSION_ID,
  REVERSE_CONTINUE_ID,
  SELECT_AND_START_ID,
  SELECT_AND_START_LABEL,
  SELECT_DEBUG_CONSOLE_ID,
  SELECT_DEBUG_CONSOLE_LABEL,
  SELECT_DEBUG_SESSION_ID,
  SELECT_DEBUG_SESSION_LABEL,
  SET_EXPRESSION_COMMAND_ID,
  SHOW_LOADED_SCRIPTS_ID,
  STEP_BACK_ID,
  STEP_INTO_ID,
  STEP_INTO_LABEL,
  STEP_INTO_TARGET_ID,
  STEP_INTO_TARGET_LABEL,
  STEP_OUT_ID,
  STEP_OUT_LABEL,
  STEP_OVER_ID,
  STEP_OVER_LABEL,
  STOP_ID,
  STOP_LABEL,
  TERMINATE_THREAD_ID,
  TOGGLE_BREAKPOINT_ID,
  TOGGLE_EXCEPTION_BREAKPOINTS_ID,
  TOGGLE_INLINE_BREAKPOINT_ID,
  setDataBreakpointInfoResponse
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxkZWJ1Z0NvbW1hbmRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZ2V0V2luZG93SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBkZWVwQ2xvbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IGlzV2ViLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgaXNDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUxvY2FsaXplZFN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgTWVudVJlZ2lzdHJ5LCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElucHV0Rm9jdXNlZENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uSG9zdERlYnVnU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RlYnVnL2NvbW1vbi9leHRlbnNpb25Ib3N0RGVidWcuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc1JlZ2lzdHJ5LCBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBBY3RpdmVFZGl0b3JDb250ZXh0LCBQYW5lbEZvY3VzQ29udGV4dCwgUmVzb3VyY2VDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcGFuZWNvbXBvc2l0ZS9icm93c2VyL3BhbmVjb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBURVhUX0ZJTEVfRURJVE9SX0lEIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IENPTlRFWFRfQlJFQUtQT0lOVF9JTlBVVF9GT0NVU0VELCBDT05URVhUX0JSRUFLUE9JTlRTX0ZPQ1VTRUQsIENPTlRFWFRfREVCVUdfU1RBVEUsIENPTlRFWFRfREVCVUdHRVJTX0FWQUlMQUJMRSwgQ09OVEVYVF9ESVNBU1NFTUJMWV9WSUVXX0ZPQ1VTLCBDT05URVhUX0VYUFJFU1NJT05fU0VMRUNURUQsIENPTlRFWFRfRk9DVVNFRF9TRVNTSU9OX0lTX0FUVEFDSCwgQ09OVEVYVF9JTl9ERUJVR19NT0RFLCBDT05URVhUX0lOX0RFQlVHX1JFUEwsIENPTlRFWFRfSlVNUF9UT19DVVJTT1JfU1VQUE9SVEVELCBDT05URVhUX1NURVBfSU5UT19UQVJHRVRTX1NVUFBPUlRFRCwgQ09OVEVYVF9WQVJJQUJMRVNfRk9DVVNFRCwgQ09OVEVYVF9XQVRDSF9FWFBSRVNTSU9OU19GT0NVU0VELCBEYXRhQnJlYWtwb2ludFNldFR5cGUsIEVESVRPUl9DT05UUklCVVRJT05fSUQsIGdldFN0YXRlTGFiZWwsIElDb25maWcsIElEYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZSwgSURlYnVnQ29uZmlndXJhdGlvbiwgSURlYnVnRWRpdG9yQ29udHJpYnV0aW9uLCBJRGVidWdTZXJ2aWNlLCBJRGVidWdTZXNzaW9uLCBJRW5hYmxlbWVudCwgSUV4Y2VwdGlvbkJyZWFrcG9pbnQsIGlzRnJhbWVEZWVtcGhhc2l6ZWQsIElTdGFja0ZyYW1lLCBJVGhyZWFkLCBSRVBMX1ZJRVdfSUQsIFN0YXRlLCBWSUVXTEVUX0lEIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IEJyZWFrcG9pbnQsIERhdGFCcmVha3BvaW50LCBFeHByZXNzaW9uLCBGdW5jdGlvbkJyZWFrcG9pbnQsIFRocmVhZCwgVmFyaWFibGUgfSBmcm9tICcuLi9jb21tb24vZGVidWdNb2RlbC5qcyc7XG5pbXBvcnQgeyBzYXZlQWxsQmVmb3JlRGVidWdTdGFydCwgcmVzb2x2ZUNoaWxkU2Vzc2lvbiB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z1V0aWxzLmpzJztcbmltcG9ydCB7IHNob3dMb2FkZWRTY3JpcHRNZW51IH0gZnJvbSAnLi4vY29tbW9uL2xvYWRlZFNjcmlwdHNQaWNrZXIuanMnO1xuaW1wb3J0IHsgb3BlbkJyZWFrcG9pbnRTb3VyY2UgfSBmcm9tICcuL2JyZWFrcG9pbnRzVmlldy5qcyc7XG5pbXBvcnQgeyBzaG93RGVidWdTZXNzaW9uTWVudSB9IGZyb20gJy4vZGVidWdTZXNzaW9uUGlja2VyLmpzJztcblxuZXhwb3J0IGNvbnN0IEFERF9DT05GSUdVUkFUSU9OX0lEID0gJ2RlYnVnLmFkZENvbmZpZ3VyYXRpb24nO1xuZXhwb3J0IGNvbnN0IENPUFlfQUREUkVTU19JRCA9ICdlZGl0b3IuZGVidWcuYWN0aW9uLmNvcHlBZGRyZXNzJztcbmV4cG9ydCBjb25zdCBUT0dHTEVfQlJFQUtQT0lOVF9JRCA9ICdlZGl0b3IuZGVidWcuYWN0aW9uLnRvZ2dsZUJyZWFrcG9pbnQnO1xuZXhwb3J0IGNvbnN0IFRPR0dMRV9JTkxJTkVfQlJFQUtQT0lOVF9JRCA9ICdlZGl0b3IuZGVidWcuYWN0aW9uLnRvZ2dsZUlubGluZUJyZWFrcG9pbnQnO1xuZXhwb3J0IGNvbnN0IENPUFlfU1RBQ0tfVFJBQ0VfSUQgPSAnZGVidWcuY29weVN0YWNrVHJhY2UnO1xuZXhwb3J0IGNvbnN0IFJFVkVSU0VfQ09OVElOVUVfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5yZXZlcnNlQ29udGludWUnO1xuZXhwb3J0IGNvbnN0IFNURVBfQkFDS19JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLnN0ZXBCYWNrJztcbmV4cG9ydCBjb25zdCBSRVNUQVJUX1NFU1NJT05fSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5yZXN0YXJ0JztcbmV4cG9ydCBjb25zdCBURVJNSU5BVEVfVEhSRUFEX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcudGVybWluYXRlVGhyZWFkJztcbmV4cG9ydCBjb25zdCBTVEVQX09WRVJfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5zdGVwT3Zlcic7XG5leHBvcnQgY29uc3QgU1RFUF9JTlRPX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcuc3RlcEludG8nO1xuZXhwb3J0IGNvbnN0IFNURVBfSU5UT19UQVJHRVRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5zdGVwSW50b1RhcmdldCc7XG5leHBvcnQgY29uc3QgU1RFUF9PVVRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5zdGVwT3V0JztcbmV4cG9ydCBjb25zdCBQQVVTRV9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLnBhdXNlJztcbmV4cG9ydCBjb25zdCBESVNDT05ORUNUX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcuZGlzY29ubmVjdCc7XG5leHBvcnQgY29uc3QgRElTQ09OTkVDVF9BTkRfU1VTUEVORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLmRpc2Nvbm5lY3RBbmRTdXNwZW5kJztcbmV4cG9ydCBjb25zdCBTVE9QX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcuc3RvcCc7XG5leHBvcnQgY29uc3QgUkVTVEFSVF9GUkFNRV9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLnJlc3RhcnRGcmFtZSc7XG5leHBvcnQgY29uc3QgQ09OVElOVUVfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5jb250aW51ZSc7XG5leHBvcnQgY29uc3QgRk9DVVNfUkVQTF9JRCA9ICd3b3JrYmVuY2guZGVidWcuYWN0aW9uLmZvY3VzUmVwbCc7XG5leHBvcnQgY29uc3QgSlVNUF9UT19DVVJTT1JfSUQgPSAnZGVidWcuanVtcFRvQ3Vyc29yJztcbmV4cG9ydCBjb25zdCBGT0NVU19TRVNTSU9OX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcuZm9jdXNQcm9jZXNzJztcbmV4cG9ydCBjb25zdCBTRUxFQ1RfQU5EX1NUQVJUX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcuc2VsZWN0YW5kc3RhcnQnO1xuZXhwb3J0IGNvbnN0IFNFTEVDVF9ERUJVR19DT05TT0xFX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcuc2VsZWN0RGVidWdDb25zb2xlJztcbmV4cG9ydCBjb25zdCBTRUxFQ1RfREVCVUdfU0VTU0lPTl9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLnNlbGVjdERlYnVnU2Vzc2lvbic7XG5leHBvcnQgY29uc3QgREVCVUdfQ09ORklHVVJFX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5jb25maWd1cmUnO1xuZXhwb3J0IGNvbnN0IERFQlVHX1NUQVJUX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5zdGFydCc7XG5leHBvcnQgY29uc3QgREVCVUdfUlVOX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5ydW4nO1xuZXhwb3J0IGNvbnN0IEVESVRfRVhQUkVTU0lPTl9DT01NQU5EX0lEID0gJ2RlYnVnLnJlbmFtZVdhdGNoRXhwcmVzc2lvbic7XG5leHBvcnQgY29uc3QgQ09QWV9XQVRDSF9FWFBSRVNTSU9OX0NPTU1BTkRfSUQgPSAnZGVidWcuY29weVdhdGNoRXhwcmVzc2lvbic7XG5leHBvcnQgY29uc3QgU0VUX0VYUFJFU1NJT05fQ09NTUFORF9JRCA9ICdkZWJ1Zy5zZXRXYXRjaEV4cHJlc3Npb24nO1xuZXhwb3J0IGNvbnN0IFJFTU9WRV9FWFBSRVNTSU9OX0NPTU1BTkRfSUQgPSAnZGVidWcucmVtb3ZlV2F0Y2hFeHByZXNzaW9uJztcbmV4cG9ydCBjb25zdCBORVhUX0RFQlVHX0NPTlNPTEVfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5uZXh0Q29uc29sZSc7XG5leHBvcnQgY29uc3QgUFJFVl9ERUJVR19DT05TT0xFX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcucHJldkNvbnNvbGUnO1xuZXhwb3J0IGNvbnN0IFNIT1dfTE9BREVEX1NDUklQVFNfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5zaG93TG9hZGVkU2NyaXB0cyc7XG5leHBvcnQgY29uc3QgQ0FMTFNUQUNLX1RPUF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLmNhbGxTdGFja1RvcCc7XG5leHBvcnQgY29uc3QgQ0FMTFNUQUNLX0JPVFRPTV9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLmNhbGxTdGFja0JvdHRvbSc7XG5leHBvcnQgY29uc3QgQ0FMTFNUQUNLX1VQX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcuY2FsbFN0YWNrVXAnO1xuZXhwb3J0IGNvbnN0IENBTExTVEFDS19ET1dOX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcuY2FsbFN0YWNrRG93bic7XG5leHBvcnQgY29uc3QgQUREX1RPX1dBVENIX0lEID0gJ2RlYnVnLmFkZFRvV2F0Y2hFeHByZXNzaW9ucyc7XG5leHBvcnQgY29uc3QgQ09QWV9FVkFMVUFURV9QQVRIX0lEID0gJ2RlYnVnLmNvcHlFdmFsdWF0ZVBhdGgnO1xuZXhwb3J0IGNvbnN0IENPUFlfVkFMVUVfSUQgPSAnd29ya2JlbmNoLmRlYnVnLnZpZXdsZXQuYWN0aW9uLmNvcHlWYWx1ZSc7XG5leHBvcnQgY29uc3QgQlJFQUtfV0hFTl9WQUxVRV9DSEFOR0VTX0lEID0gJ2RlYnVnLmJyZWFrV2hlblZhbHVlQ2hhbmdlcyc7XG5leHBvcnQgY29uc3QgQlJFQUtfV0hFTl9WQUxVRV9JU19BQ0NFU1NFRF9JRCA9ICdkZWJ1Zy5icmVha1doZW5WYWx1ZUlzQWNjZXNzZWQnO1xuZXhwb3J0IGNvbnN0IEJSRUFLX1dIRU5fVkFMVUVfSVNfUkVBRF9JRCA9ICdkZWJ1Zy5icmVha1doZW5WYWx1ZUlzUmVhZCc7XG5leHBvcnQgY29uc3QgVE9HR0xFX0VYQ0VQVElPTl9CUkVBS1BPSU5UU19JRCA9ICdkZWJ1Zy50b2dnbGVFeGNlcHRpb25CcmVha3BvaW50cyc7XG5leHBvcnQgY29uc3QgQVRUQUNIX1RPX0NVUlJFTlRfQ09ERV9SRU5ERVJFUiA9ICdkZWJ1Zy5hdHRhY2hUb0N1cnJlbnRDb2RlUmVuZGVyZXInO1xuXG5leHBvcnQgY29uc3QgREVCVUdfQ09NTUFORF9DQVRFR09SWTogSUxvY2FsaXplZFN0cmluZyA9IG5scy5sb2NhbGl6ZTIoJ2RlYnVnJywgJ0RlYnVnJyk7XG5leHBvcnQgY29uc3QgUkVTVEFSVF9MQUJFTCA9IG5scy5sb2NhbGl6ZTIoJ3Jlc3RhcnREZWJ1ZycsIFwiUmVzdGFydFwiKTtcbmV4cG9ydCBjb25zdCBTVEVQX09WRVJfTEFCRUwgPSBubHMubG9jYWxpemUyKCdzdGVwT3ZlckRlYnVnJywgXCJTdGVwIE92ZXJcIik7XG5leHBvcnQgY29uc3QgU1RFUF9JTlRPX0xBQkVMID0gbmxzLmxvY2FsaXplMignc3RlcEludG9EZWJ1ZycsIFwiU3RlcCBJbnRvXCIpO1xuZXhwb3J0IGNvbnN0IFNURVBfSU5UT19UQVJHRVRfTEFCRUwgPSBubHMubG9jYWxpemUyKCdzdGVwSW50b1RhcmdldERlYnVnJywgXCJTdGVwIEludG8gVGFyZ2V0XCIpO1xuZXhwb3J0IGNvbnN0IFNURVBfT1VUX0xBQkVMID0gbmxzLmxvY2FsaXplMignc3RlcE91dERlYnVnJywgXCJTdGVwIE91dFwiKTtcbmV4cG9ydCBjb25zdCBQQVVTRV9MQUJFTCA9IG5scy5sb2NhbGl6ZTIoJ3BhdXNlRGVidWcnLCBcIlBhdXNlXCIpO1xuZXhwb3J0IGNvbnN0IERJU0NPTk5FQ1RfTEFCRUwgPSBubHMubG9jYWxpemUyKCdkaXNjb25uZWN0JywgXCJEaXNjb25uZWN0XCIpO1xuZXhwb3J0IGNvbnN0IERJU0NPTk5FQ1RfQU5EX1NVU1BFTkRfTEFCRUwgPSBubHMubG9jYWxpemUyKCdkaXNjb25uZWN0U3VzcGVuZCcsIFwiRGlzY29ubmVjdCBhbmQgU3VzcGVuZFwiKTtcbmV4cG9ydCBjb25zdCBTVE9QX0xBQkVMID0gbmxzLmxvY2FsaXplMignc3RvcCcsIFwiU3RvcFwiKTtcbmV4cG9ydCBjb25zdCBDT05USU5VRV9MQUJFTCA9IG5scy5sb2NhbGl6ZTIoJ2NvbnRpbnVlRGVidWcnLCBcIkNvbnRpbnVlXCIpO1xuZXhwb3J0IGNvbnN0IEZPQ1VTX1NFU1NJT05fTEFCRUwgPSBubHMubG9jYWxpemUyKCdmb2N1c1Nlc3Npb24nLCBcIkZvY3VzIFNlc3Npb25cIik7XG5leHBvcnQgY29uc3QgU0VMRUNUX0FORF9TVEFSVF9MQUJFTCA9IG5scy5sb2NhbGl6ZTIoJ3NlbGVjdEFuZFN0YXJ0RGVidWdnaW5nJywgXCJTZWxlY3QgYW5kIFN0YXJ0IERlYnVnZ2luZ1wiKTtcbmV4cG9ydCBjb25zdCBERUJVR19DT05GSUdVUkVfTEFCRUwgPSBubHMubG9jYWxpemUoJ29wZW5MYXVuY2hKc29uJywgXCJPcGVuICd7MH0nXCIsICdsYXVuY2guanNvbicpO1xuZXhwb3J0IGNvbnN0IERFQlVHX1NUQVJUX0xBQkVMID0gbmxzLmxvY2FsaXplMignc3RhcnREZWJ1ZycsIFwiU3RhcnQgRGVidWdnaW5nXCIpO1xuZXhwb3J0IGNvbnN0IERFQlVHX1JVTl9MQUJFTCA9IG5scy5sb2NhbGl6ZTIoJ3N0YXJ0V2l0aG91dERlYnVnZ2luZycsIFwiU3RhcnQgV2l0aG91dCBEZWJ1Z2dpbmdcIik7XG5leHBvcnQgY29uc3QgTkVYVF9ERUJVR19DT05TT0xFX0xBQkVMID0gbmxzLmxvY2FsaXplMignbmV4dERlYnVnQ29uc29sZScsIFwiRm9jdXMgTmV4dCBEZWJ1ZyBDb25zb2xlXCIpO1xuZXhwb3J0IGNvbnN0IFBSRVZfREVCVUdfQ09OU09MRV9MQUJFTCA9IG5scy5sb2NhbGl6ZTIoJ3ByZXZEZWJ1Z0NvbnNvbGUnLCBcIkZvY3VzIFByZXZpb3VzIERlYnVnIENvbnNvbGVcIik7XG5leHBvcnQgY29uc3QgT1BFTl9MT0FERURfU0NSSVBUU19MQUJFTCA9IG5scy5sb2NhbGl6ZTIoJ29wZW5Mb2FkZWRTY3JpcHQnLCBcIk9wZW4gTG9hZGVkIFNjcmlwdC4uLlwiKTtcbmV4cG9ydCBjb25zdCBDQUxMU1RBQ0tfVE9QX0xBQkVMID0gbmxzLmxvY2FsaXplMignY2FsbFN0YWNrVG9wJywgXCJOYXZpZ2F0ZSB0byBUb3Agb2YgQ2FsbCBTdGFja1wiKTtcbmV4cG9ydCBjb25zdCBDQUxMU1RBQ0tfQk9UVE9NX0xBQkVMID0gbmxzLmxvY2FsaXplMignY2FsbFN0YWNrQm90dG9tJywgXCJOYXZpZ2F0ZSB0byBCb3R0b20gb2YgQ2FsbCBTdGFja1wiKTtcbmV4cG9ydCBjb25zdCBDQUxMU1RBQ0tfVVBfTEFCRUwgPSBubHMubG9jYWxpemUyKCdjYWxsU3RhY2tVcCcsIFwiTmF2aWdhdGUgVXAgQ2FsbCBTdGFja1wiKTtcbmV4cG9ydCBjb25zdCBDQUxMU1RBQ0tfRE9XTl9MQUJFTCA9IG5scy5sb2NhbGl6ZTIoJ2NhbGxTdGFja0Rvd24nLCBcIk5hdmlnYXRlIERvd24gQ2FsbCBTdGFja1wiKTtcbmV4cG9ydCBjb25zdCBDT1BZX0VWQUxVQVRFX1BBVEhfTEFCRUwgPSBubHMubG9jYWxpemUyKCdjb3B5QXNFeHByZXNzaW9uJywgXCJDb3B5IGFzIEV4cHJlc3Npb25cIik7XG5leHBvcnQgY29uc3QgQ09QWV9WQUxVRV9MQUJFTCA9IG5scy5sb2NhbGl6ZTIoJ2NvcHlWYWx1ZScsIFwiQ29weSBWYWx1ZVwiKTtcbmV4cG9ydCBjb25zdCBDT1BZX0FERFJFU1NfTEFCRUwgPSBubHMubG9jYWxpemUyKCdjb3B5QWRkcmVzcycsIFwiQ29weSBBZGRyZXNzXCIpO1xuZXhwb3J0IGNvbnN0IEFERF9UT19XQVRDSF9MQUJFTCA9IG5scy5sb2NhbGl6ZTIoJ2FkZFRvV2F0Y2hFeHByZXNzaW9ucycsIFwiQWRkIHRvIFdhdGNoXCIpO1xuXG5leHBvcnQgY29uc3QgU0VMRUNUX0RFQlVHX0NPTlNPTEVfTEFCRUwgPSBubHMubG9jYWxpemUyKCdzZWxlY3REZWJ1Z0NvbnNvbGUnLCBcIlNlbGVjdCBEZWJ1ZyBDb25zb2xlXCIpO1xuZXhwb3J0IGNvbnN0IFNFTEVDVF9ERUJVR19TRVNTSU9OX0xBQkVMID0gbmxzLmxvY2FsaXplMignc2VsZWN0RGVidWdTZXNzaW9uJywgXCJTZWxlY3QgRGVidWcgU2Vzc2lvblwiKTtcblxuZXhwb3J0IGNvbnN0IERFQlVHX1FVSUNLX0FDQ0VTU19QUkVGSVggPSAnZGVidWcgJztcbmV4cG9ydCBjb25zdCBERUJVR19DT05TT0xFX1FVSUNLX0FDQ0VTU19QUkVGSVggPSAnZGVidWcgY29uc29sZXMgJztcblxubGV0IGRhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlOiBJRGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UgfCB1bmRlZmluZWQ7XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXREYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZShyZXNwOiBJRGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UgfCB1bmRlZmluZWQpIHtcblx0ZGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UgPSByZXNwO1xufVxuXG5pbnRlcmZhY2UgQ2FsbFN0YWNrQ29udGV4dCB7XG5cdHNlc3Npb25JZDogc3RyaW5nO1xuXHR0aHJlYWRJZDogc3RyaW5nO1xuXHRmcmFtZUlkOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGlzVGhyZWFkQ29udGV4dChvYmo6IGFueSk6IG9iaiBpcyBDYWxsU3RhY2tDb250ZXh0IHtcblx0cmV0dXJuIG9iaiAmJiB0eXBlb2Ygb2JqLnNlc3Npb25JZCA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIG9iai50aHJlYWRJZCA9PT0gJ3N0cmluZyc7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFRocmVhZEFuZFJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2Vzc2lvbkFuZFRocmVhZElkOiBDYWxsU3RhY2tDb250ZXh0IHwgdW5rbm93biwgcnVuOiAodGhyZWFkOiBJVGhyZWFkKSA9PiBQcm9taXNlPHZvaWQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0bGV0IHRocmVhZDogSVRocmVhZCB8IHVuZGVmaW5lZDtcblx0aWYgKGlzVGhyZWFkQ29udGV4dChzZXNzaW9uQW5kVGhyZWFkSWQpKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldFNlc3Npb24oc2Vzc2lvbkFuZFRocmVhZElkLnNlc3Npb25JZCk7XG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdHRocmVhZCA9IHNlc3Npb24uZ2V0QWxsVGhyZWFkcygpLmZpbmQodCA9PiB0LmdldElkKCkgPT09IHNlc3Npb25BbmRUaHJlYWRJZC50aHJlYWRJZCk7XG5cdFx0fVxuXHR9IGVsc2UgaWYgKGlzU2Vzc2lvbkNvbnRleHQoc2Vzc2lvbkFuZFRocmVhZElkKSkge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBkZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9uKHNlc3Npb25BbmRUaHJlYWRJZC5zZXNzaW9uSWQpO1xuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRjb25zdCB0aHJlYWRzID0gc2Vzc2lvbi5nZXRBbGxUaHJlYWRzKCk7XG5cdFx0XHR0aHJlYWQgPSB0aHJlYWRzLmxlbmd0aCA+IDAgPyB0aHJlYWRzWzBdIDogdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGlmICghdGhyZWFkKSB7XG5cdFx0dGhyZWFkID0gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRUaHJlYWQ7XG5cdFx0aWYgKCF0aHJlYWQpIHtcblx0XHRcdGNvbnN0IGZvY3VzZWRTZXNzaW9uID0gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uO1xuXHRcdFx0Y29uc3QgdGhyZWFkcyA9IGZvY3VzZWRTZXNzaW9uID8gZm9jdXNlZFNlc3Npb24uZ2V0QWxsVGhyZWFkcygpIDogdW5kZWZpbmVkO1xuXHRcdFx0dGhyZWFkID0gdGhyZWFkcyAmJiB0aHJlYWRzLmxlbmd0aCA/IHRocmVhZHNbMF0gOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0aWYgKHRocmVhZCkge1xuXHRcdGF3YWl0IHJ1bih0aHJlYWQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzU3RhY2tGcmFtZUNvbnRleHQob2JqOiBhbnkpOiBvYmogaXMgQ2FsbFN0YWNrQ29udGV4dCB7XG5cdHJldHVybiBvYmogJiYgdHlwZW9mIG9iai5zZXNzaW9uSWQgPT09ICdzdHJpbmcnICYmIHR5cGVvZiBvYmoudGhyZWFkSWQgPT09ICdzdHJpbmcnICYmIHR5cGVvZiBvYmouZnJhbWVJZCA9PT0gJ3N0cmluZyc7XG59XG5cbmZ1bmN0aW9uIGdldEZyYW1lKGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSwgY29udGV4dDogQ2FsbFN0YWNrQ29udGV4dCB8IHVua25vd24pOiBJU3RhY2tGcmFtZSB8IHVuZGVmaW5lZCB7XG5cdGlmIChpc1N0YWNrRnJhbWVDb250ZXh0KGNvbnRleHQpKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldFNlc3Npb24oY29udGV4dC5zZXNzaW9uSWQpO1xuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRjb25zdCB0aHJlYWQgPSBzZXNzaW9uLmdldEFsbFRocmVhZHMoKS5maW5kKHQgPT4gdC5nZXRJZCgpID09PSBjb250ZXh0LnRocmVhZElkKTtcblx0XHRcdGlmICh0aHJlYWQpIHtcblx0XHRcdFx0cmV0dXJuIHRocmVhZC5nZXRDYWxsU3RhY2soKS5maW5kKHNmID0+IHNmLmdldElkKCkgPT09IGNvbnRleHQuZnJhbWVJZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBkZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFN0YWNrRnJhbWU7XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBpc1Nlc3Npb25Db250ZXh0KG9iajogYW55KTogb2JqIGlzIENhbGxTdGFja0NvbnRleHQge1xuXHRyZXR1cm4gb2JqICYmIHR5cGVvZiBvYmouc2Vzc2lvbklkID09PSAnc3RyaW5nJztcbn1cblxuYXN5bmMgZnVuY3Rpb24gY2hhbmdlRGVidWdDb25zb2xlRm9jdXMoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG5leHQ6IGJvb2xlYW4pIHtcblx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdGNvbnN0IHNlc3Npb25zID0gZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0U2Vzc2lvbnModHJ1ZSkuZmlsdGVyKHMgPT4gcy5oYXNTZXBhcmF0ZVJlcGwoKSk7XG5cdGxldCBjdXJyU2Vzc2lvbiA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbjtcblxuXHRsZXQgbmV4dEluZGV4ID0gMDtcblx0aWYgKHNlc3Npb25zLmxlbmd0aCA+IDAgJiYgY3VyclNlc3Npb24pIHtcblx0XHR3aGlsZSAoY3VyclNlc3Npb24gJiYgIWN1cnJTZXNzaW9uLmhhc1NlcGFyYXRlUmVwbCgpKSB7XG5cdFx0XHRjdXJyU2Vzc2lvbiA9IGN1cnJTZXNzaW9uLnBhcmVudFNlc3Npb247XG5cdFx0fVxuXG5cdFx0aWYgKGN1cnJTZXNzaW9uKSB7XG5cdFx0XHRjb25zdCBjdXJySW5kZXggPSBzZXNzaW9ucy5pbmRleE9mKGN1cnJTZXNzaW9uKTtcblx0XHRcdGlmIChuZXh0KSB7XG5cdFx0XHRcdG5leHRJbmRleCA9IChjdXJySW5kZXggPT09IChzZXNzaW9ucy5sZW5ndGggLSAxKSA/IDAgOiAoY3VyckluZGV4ICsgMSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bmV4dEluZGV4ID0gKGN1cnJJbmRleCA9PT0gMCA/IChzZXNzaW9ucy5sZW5ndGggLSAxKSA6IChjdXJySW5kZXggLSAxKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdGF3YWl0IGRlYnVnU2VydmljZS5mb2N1c1N0YWNrRnJhbWUodW5kZWZpbmVkLCB1bmRlZmluZWQsIHNlc3Npb25zW25leHRJbmRleF0sIHsgZXhwbGljaXQ6IHRydWUgfSk7XG5cblx0aWYgKCF2aWV3c1NlcnZpY2UuaXNWaWV3VmlzaWJsZShSRVBMX1ZJRVdfSUQpKSB7XG5cdFx0YXdhaXQgdmlld3NTZXJ2aWNlLm9wZW5WaWV3KFJFUExfVklFV19JRCwgdHJ1ZSk7XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gbmF2aWdhdGVDYWxsU3RhY2soZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLCBkb3duOiBib29sZWFuKSB7XG5cdGNvbnN0IGZyYW1lID0gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTdGFja0ZyYW1lO1xuXHRpZiAoZnJhbWUpIHtcblxuXHRcdGxldCBjYWxsU3RhY2sgPSBmcmFtZS50aHJlYWQuZ2V0Q2FsbFN0YWNrKCk7XG5cdFx0bGV0IGluZGV4ID0gY2FsbFN0YWNrLmZpbmRJbmRleChlbGVtID0+IGVsZW0uZnJhbWVJZCA9PT0gZnJhbWUuZnJhbWVJZCk7XG5cdFx0bGV0IG5leHRWaXNpYmxlRnJhbWU7XG5cdFx0aWYgKGRvd24pIHtcblx0XHRcdGlmIChpbmRleCA+PSBjYWxsU3RhY2subGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRpZiAoKDxUaHJlYWQ+ZnJhbWUudGhyZWFkKS5yZWFjaGVkRW5kT2ZDYWxsU3RhY2spIHtcblx0XHRcdFx0XHRnb1RvVG9wT2ZDYWxsU3RhY2soZGVidWdTZXJ2aWNlKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXdhaXQgZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZmV0Y2hDYWxsc3RhY2soZnJhbWUudGhyZWFkLCAyMCk7XG5cdFx0XHRcdFx0Y2FsbFN0YWNrID0gZnJhbWUudGhyZWFkLmdldENhbGxTdGFjaygpO1xuXHRcdFx0XHRcdGluZGV4ID0gY2FsbFN0YWNrLmZpbmRJbmRleChlbGVtID0+IGVsZW0uZnJhbWVJZCA9PT0gZnJhbWUuZnJhbWVJZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdG5leHRWaXNpYmxlRnJhbWUgPSBmaW5kTmV4dFZpc2libGVGcmFtZSh0cnVlLCBjYWxsU3RhY2ssIGluZGV4KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGluZGV4IDw9IDApIHtcblx0XHRcdFx0Z29Ub0JvdHRvbU9mQ2FsbFN0YWNrKGRlYnVnU2VydmljZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdG5leHRWaXNpYmxlRnJhbWUgPSBmaW5kTmV4dFZpc2libGVGcmFtZShmYWxzZSwgY2FsbFN0YWNrLCBpbmRleCk7XG5cdFx0fVxuXG5cdFx0aWYgKG5leHRWaXNpYmxlRnJhbWUpIHtcblx0XHRcdGRlYnVnU2VydmljZS5mb2N1c1N0YWNrRnJhbWUobmV4dFZpc2libGVGcmFtZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHsgcHJlc2VydmVGb2N1czogZmFsc2UgfSk7XG5cdFx0fVxuXHR9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdvVG9Cb3R0b21PZkNhbGxTdGFjayhkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UpIHtcblx0Y29uc3QgdGhyZWFkID0gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRUaHJlYWQ7XG5cdGlmICh0aHJlYWQpIHtcblx0XHRhd2FpdCBkZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5mZXRjaENhbGxzdGFjayh0aHJlYWQpO1xuXHRcdGNvbnN0IGNhbGxTdGFjayA9IHRocmVhZC5nZXRDYWxsU3RhY2soKTtcblx0XHRpZiAoY2FsbFN0YWNrLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IG5leHRWaXNpYmxlRnJhbWUgPSBmaW5kTmV4dFZpc2libGVGcmFtZShmYWxzZSwgY2FsbFN0YWNrLCAwKTsgLy8gbXVzdCBjb25zaWRlciB0aGUgbmV4dCBmcmFtZSB1cCBmaXJzdCwgd2hpY2ggd2lsbCBiZSB0aGUgbGFzdCBmcmFtZVxuXHRcdFx0aWYgKG5leHRWaXNpYmxlRnJhbWUpIHtcblx0XHRcdFx0ZGVidWdTZXJ2aWNlLmZvY3VzU3RhY2tGcmFtZShuZXh0VmlzaWJsZUZyYW1lLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgeyBwcmVzZXJ2ZUZvY3VzOiBmYWxzZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gZ29Ub1RvcE9mQ2FsbFN0YWNrKGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSkge1xuXHRjb25zdCB0aHJlYWQgPSBkZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFRocmVhZDtcblxuXHRpZiAodGhyZWFkKSB7XG5cdFx0ZGVidWdTZXJ2aWNlLmZvY3VzU3RhY2tGcmFtZSh0aHJlYWQuZ2V0VG9wU3RhY2tGcmFtZSgpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgeyBwcmVzZXJ2ZUZvY3VzOiBmYWxzZSB9KTtcblx0fVxufVxuXG4vKipcbiAqIEZpbmRzIG5leHQgZnJhbWUgdGhhdCBpcyBub3Qgc2tpcHBlZCBieSBTa2lwRmlsZXMuIFNraXBzIGZyYW1lIGF0IGluZGV4IGFuZCBzdGFydHMgc2VhcmNoaW5nIGF0IG5leHQuXG4gKiBNdXN0IHNhdGlzZnkgYDAgPD0gc3RhcnRJbmRleCA8PSBjYWxsU3RhY2sgLSAxYFxuICogQHBhcmFtIGRvd24gc3BlY2lmaWVzIHdoZXRoZXIgdG8gc2VhcmNoIGRvd253YXJkcyBpZiB0aGUgY3VycmVudCBmaWxlIGlzIHNraXBwZWQuXG4gKiBAcGFyYW0gY2FsbFN0YWNrIHRoZSBjYWxsIHN0YWNrIHRvIHNlYXJjaFxuICogQHBhcmFtIHN0YXJ0SW5kZXggdGhlIGluZGV4IHRvIHN0YXJ0IHRoZSBzZWFyY2ggYXRcbiAqL1xuZnVuY3Rpb24gZmluZE5leHRWaXNpYmxlRnJhbWUoZG93bjogYm9vbGVhbiwgY2FsbFN0YWNrOiByZWFkb25seSBJU3RhY2tGcmFtZVtdLCBzdGFydEluZGV4OiBudW1iZXIpIHtcblxuXHRpZiAoc3RhcnRJbmRleCA+PSBjYWxsU3RhY2subGVuZ3RoKSB7XG5cdFx0c3RhcnRJbmRleCA9IGNhbGxTdGFjay5sZW5ndGggLSAxO1xuXHR9IGVsc2UgaWYgKHN0YXJ0SW5kZXggPCAwKSB7XG5cdFx0c3RhcnRJbmRleCA9IDA7XG5cdH1cblxuXHRsZXQgaW5kZXggPSBzdGFydEluZGV4O1xuXG5cdGxldCBjdXJyRnJhbWU7XG5cdGRvIHtcblx0XHRpZiAoZG93bikge1xuXHRcdFx0aWYgKGluZGV4ID09PSBjYWxsU3RhY2subGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRpbmRleCA9IDA7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpbmRleCsrO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoaW5kZXggPT09IDApIHtcblx0XHRcdFx0aW5kZXggPSBjYWxsU3RhY2subGVuZ3RoIC0gMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGluZGV4LS07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y3VyckZyYW1lID0gY2FsbFN0YWNrW2luZGV4XTtcblx0XHRpZiAoIWlzRnJhbWVEZWVtcGhhc2l6ZWQoY3VyckZyYW1lKSkge1xuXHRcdFx0cmV0dXJuIGN1cnJGcmFtZTtcblx0XHR9XG5cdH0gd2hpbGUgKGluZGV4ICE9PSBzdGFydEluZGV4KTsgLy8gZW5kIGxvb3Agd2hlbiB3ZSd2ZSBqdXN0IGNoZWNrZWQgdGhlIHN0YXJ0IGluZGV4LCBzaW5jZSB0aGF0IHNob3VsZCBiZSB0aGUgbGFzdCBvbmUgY2hlY2tlZFxuXG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8vIFRoZXNlIGNvbW1hbmRzIGFyZSB1c2VkIGluIGNhbGwgc3RhY2sgY29udGV4dCBtZW51LCBjYWxsIHN0YWNrIGlubGluZSBhY3Rpb25zLCBjb21tYW5kIHBhbGV0dGUsIGRlYnVnIHRvb2xiYXIsIG1hYyBuYXRpdmUgdG91Y2ggYmFyXG4vLyBXaGVuIHRoZSBjb21tYW5kIGlzIGV4ZWN0dWVkIGluIHRoZSBjb250ZXh0IG9mIGEgdGhyZWFkKGNvbnRleHQgbWVudSBvbiBhIHRocmVhZCwgaW5saW5lIGNhbGwgc3RhY2sgYWN0aW9uKSB3ZSBwYXNzIHRoZSB0aHJlYWQgaWRcbi8vIE90aGVyd2lzZSB3aGVuIGl0IGlzIGV4ZWN1dGVkIFwiZ2xvYmFseVwiKHVzaW5nIHRoZSB0b3VjaCBiYXIsIGRlYnVnIHRvb2xiYXIsIGNvbW1hbmQgcGFsZXR0ZSkgd2UgZG8gbm90IHBhc3MgYW55IGlkIGFuZCBqdXN0IHRha2Ugd2hhdGV2ZXIgaXMgdGhlIGZvY3Vzc2VkIHRocmVhZFxuLy8gU2FtZSBmb3Igc3RhY2tGcmFtZSBjb21tYW5kcyBhbmQgc2Vzc2lvbiBjb21tYW5kcy5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6IENPUFlfU1RBQ0tfVFJBQ0VfSUQsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgXzogc3RyaW5nLCBjb250ZXh0OiBDYWxsU3RhY2tDb250ZXh0IHwgdW5rbm93bikgPT4ge1xuXHRcdGNvbnN0IHRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSk7XG5cdFx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGNvbnN0IGZyYW1lID0gZ2V0RnJhbWUoZGVidWdTZXJ2aWNlLCBjb250ZXh0KTtcblx0XHRpZiAoZnJhbWUpIHtcblx0XHRcdGNvbnN0IGVvbCA9IHRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlLmdldEVPTChmcmFtZS5zb3VyY2UudXJpKTtcblx0XHRcdGF3YWl0IGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KGZyYW1lLnRocmVhZC5nZXRDYWxsU3RhY2soKS5tYXAoc2YgPT4gc2YudG9TdHJpbmcoKSkuam9pbihlb2wpKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiBSRVZFUlNFX0NPTlRJTlVFX0lELFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIF86IHN0cmluZywgY29udGV4dDogQ2FsbFN0YWNrQ29udGV4dCB8IHVua25vd24pID0+IHtcblx0XHRhd2FpdCBnZXRUaHJlYWRBbmRSdW4oYWNjZXNzb3IsIGNvbnRleHQsIHRocmVhZCA9PiB0aHJlYWQucmV2ZXJzZUNvbnRpbnVlKCkpO1xuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogU1RFUF9CQUNLX0lELFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIF86IHN0cmluZywgY29udGV4dDogQ2FsbFN0YWNrQ29udGV4dCB8IHVua25vd24pID0+IHtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGlmIChDT05URVhUX0RJU0FTU0VNQkxZX1ZJRVdfRk9DVVMuZ2V0VmFsdWUoY29udGV4dEtleVNlcnZpY2UpKSB7XG5cdFx0XHRhd2FpdCBnZXRUaHJlYWRBbmRSdW4oYWNjZXNzb3IsIGNvbnRleHQsICh0aHJlYWQ6IElUaHJlYWQpID0+IHRocmVhZC5zdGVwQmFjaygnaW5zdHJ1Y3Rpb24nKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IGdldFRocmVhZEFuZFJ1bihhY2Nlc3NvciwgY29udGV4dCwgKHRocmVhZDogSVRocmVhZCkgPT4gdGhyZWFkLnN0ZXBCYWNrKCkpO1xuXHRcdH1cblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6IFRFUk1JTkFURV9USFJFQURfSUQsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgXzogc3RyaW5nLCBjb250ZXh0OiBDYWxsU3RhY2tDb250ZXh0IHwgdW5rbm93bikgPT4ge1xuXHRcdGF3YWl0IGdldFRocmVhZEFuZFJ1bihhY2Nlc3NvciwgY29udGV4dCwgdGhyZWFkID0+IHRocmVhZC50ZXJtaW5hdGUoKSk7XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiBKVU1QX1RPX0NVUlNPUl9JRCxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGNvbnN0IHN0YWNrRnJhbWUgPSBkZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFN0YWNrRnJhbWU7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yQ29udHJvbCA9IGVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2w7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblxuXHRcdGlmIChzdGFja0ZyYW1lICYmIGlzQ29kZUVkaXRvcihhY3RpdmVFZGl0b3JDb250cm9sKSAmJiBhY3RpdmVFZGl0b3JDb250cm9sLmhhc01vZGVsKCkpIHtcblx0XHRcdGNvbnN0IHBvc2l0aW9uID0gYWN0aXZlRWRpdG9yQ29udHJvbC5nZXRQb3NpdGlvbigpO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBhY3RpdmVFZGl0b3JDb250cm9sLmdldE1vZGVsKCkudXJpO1xuXHRcdFx0Y29uc3Qgc291cmNlID0gc3RhY2tGcmFtZS50aHJlYWQuc2Vzc2lvbi5nZXRTb3VyY2VGb3JVcmkocmVzb3VyY2UpO1xuXHRcdFx0aWYgKHNvdXJjZSkge1xuXHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHN0YWNrRnJhbWUudGhyZWFkLnNlc3Npb24uZ290b1RhcmdldHMoc291cmNlLnJhdywgcG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKTtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0cyA9IHJlc3BvbnNlPy5ib2R5LnRhcmdldHM7XG5cdFx0XHRcdGlmICh0YXJnZXRzICYmIHRhcmdldHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0bGV0IGlkID0gdGFyZ2V0c1swXS5pZDtcblx0XHRcdFx0XHRpZiAodGFyZ2V0cy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwaWNrcyA9IHRhcmdldHMubWFwKHQgPT4gKHsgbGFiZWw6IHQubGFiZWwsIF9pZDogdC5pZCB9KSk7XG5cdFx0XHRcdFx0XHRjb25zdCBwaWNrID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhwaWNrcywgeyBwbGFjZUhvbGRlcjogbmxzLmxvY2FsaXplKCdjaG9vc2VMb2NhdGlvbicsIFwiQ2hvb3NlIHRoZSBzcGVjaWZpYyBsb2NhdGlvblwiKSB9KTtcblx0XHRcdFx0XHRcdGlmICghcGljaykge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlkID0gcGljay5faWQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIGF3YWl0IHN0YWNrRnJhbWUudGhyZWFkLnNlc3Npb24uZ290byhzdGFja0ZyYW1lLnRocmVhZC50aHJlYWRJZCwgaWQpLmNhdGNoKGUgPT4gbm90aWZpY2F0aW9uU2VydmljZS53YXJuKGUpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obmxzLmxvY2FsaXplKCdub0V4ZWN1dGFibGVDb2RlJywgXCJObyBleGVjdXRhYmxlIGNvZGUgaXMgYXNzb2NpYXRlZCBhdCB0aGUgY3VycmVudCBjdXJzb3IgcG9zaXRpb24uXCIpKTtcblx0fVxufSk7XG5cblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogQ0FMTFNUQUNLX1RPUF9JRCxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfOiBzdHJpbmcsIGNvbnRleHQ6IENhbGxTdGFja0NvbnRleHQgfCB1bmtub3duKSA9PiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGdvVG9Ub3BPZkNhbGxTdGFjayhkZWJ1Z1NlcnZpY2UpO1xuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogQ0FMTFNUQUNLX0JPVFRPTV9JRCxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfOiBzdHJpbmcsIGNvbnRleHQ6IENhbGxTdGFja0NvbnRleHQgfCB1bmtub3duKSA9PiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGF3YWl0IGdvVG9Cb3R0b21PZkNhbGxTdGFjayhkZWJ1Z1NlcnZpY2UpO1xuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogQ0FMTFNUQUNLX1VQX0lELFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIF86IHN0cmluZywgY29udGV4dDogQ2FsbFN0YWNrQ29udGV4dCB8IHVua25vd24pID0+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0bmF2aWdhdGVDYWxsU3RhY2soZGVidWdTZXJ2aWNlLCBmYWxzZSk7XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiBDQUxMU1RBQ0tfRE9XTl9JRCxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfOiBzdHJpbmcsIGNvbnRleHQ6IENhbGxTdGFja0NvbnRleHQgfCB1bmtub3duKSA9PiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdG5hdmlnYXRlQ2FsbFN0YWNrKGRlYnVnU2VydmljZSwgdHJ1ZSk7XG5cdH1cbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvckNvbnRleHQsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBKVU1QX1RPX0NVUlNPUl9JRCxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdqdW1wVG9DdXJzb3InLCBcIkp1bXAgdG8gQ3Vyc29yXCIpLFxuXHRcdGNhdGVnb3J5OiBERUJVR19DT01NQU5EX0NBVEVHT1JZXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0pVTVBfVE9fQ1VSU09SX1NVUFBPUlRFRCwgRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzKSxcblx0Z3JvdXA6ICdkZWJ1ZycsXG5cdG9yZGVyOiAzXG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBORVhUX0RFQlVHX0NPTlNPTEVfSUQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0d2hlbjogQ09OVEVYVF9JTl9ERUJVR19SRVBMLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuUGFnZURvd24sXG5cdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQnJhY2tldFJpZ2h0IH0sXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgXzogc3RyaW5nLCBjb250ZXh0OiBDYWxsU3RhY2tDb250ZXh0IHwgdW5rbm93bikgPT4ge1xuXHRcdGNoYW5nZURlYnVnQ29uc29sZUZvY3VzKGFjY2Vzc29yLCB0cnVlKTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogUFJFVl9ERUJVR19DT05TT0xFX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdHdoZW46IENPTlRFWFRfSU5fREVCVUdfUkVQTCxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlBhZ2VVcCxcblx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5CcmFja2V0TGVmdCB9LFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIF86IHN0cmluZywgY29udGV4dDogQ2FsbFN0YWNrQ29udGV4dCB8IHVua25vd24pID0+IHtcblx0XHRjaGFuZ2VEZWJ1Z0NvbnNvbGVGb2N1cyhhY2Nlc3NvciwgZmFsc2UpO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBSRVNUQVJUX1NFU1NJT05fSUQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRjUsXG5cdHdoZW46IENPTlRFWFRfSU5fREVCVUdfTU9ERSxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfOiBzdHJpbmcsIGNvbnRleHQ6IENhbGxTdGFja0NvbnRleHQgfCB1bmtub3duKSA9PiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0bGV0IHNlc3Npb246IElEZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGlzU2Vzc2lvbkNvbnRleHQoY29udGV4dCkpIHtcblx0XHRcdHNlc3Npb24gPSBkZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9uKGNvbnRleHQuc2Vzc2lvbklkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c2Vzc2lvbiA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbjtcblx0XHR9XG5cblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdGNvbnN0IHsgbGF1bmNoLCBuYW1lIH0gPSBkZWJ1Z1NlcnZpY2UuZ2V0Q29uZmlndXJhdGlvbk1hbmFnZXIoKS5zZWxlY3RlZENvbmZpZ3VyYXRpb247XG5cdFx0XHRhd2FpdCBkZWJ1Z1NlcnZpY2Uuc3RhcnREZWJ1Z2dpbmcobGF1bmNoLCBuYW1lLCB7IG5vRGVidWc6IGZhbHNlLCBzdGFydGVkQnlVc2VyOiB0cnVlIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBzaG93U3ViU2Vzc2lvbnMgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKS5zaG93U3ViU2Vzc2lvbnNJblRvb2xCYXI7XG5cdFx0XHQvLyBTdG9wIHNob3VsZCBiZSBzZW50IHRvIHRoZSByb290IHBhcmVudCBzZXNzaW9uXG5cdFx0XHR3aGlsZSAoIXNob3dTdWJTZXNzaW9ucyAmJiBzZXNzaW9uLmxpZmVjeWNsZU1hbmFnZWRCeVBhcmVudCAmJiBzZXNzaW9uLnBhcmVudFNlc3Npb24pIHtcblx0XHRcdFx0c2Vzc2lvbiA9IHNlc3Npb24ucGFyZW50U2Vzc2lvbjtcblx0XHRcdH1cblx0XHRcdHNlc3Npb24ucmVtb3ZlUmVwbEV4cHJlc3Npb25zKCk7XG5cdFx0XHRhd2FpdCBkZWJ1Z1NlcnZpY2UucmVzdGFydFNlc3Npb24oc2Vzc2lvbik7XG5cdFx0fVxuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBTVEVQX09WRVJfSUQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRwcmltYXJ5OiBLZXlDb2RlLkYxMCxcblx0d2hlbjogQ09OVEVYVF9ERUJVR19TVEFURS5pc0VxdWFsVG8oJ3N0b3BwZWQnKSxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfOiBzdHJpbmcsIGNvbnRleHQ6IENhbGxTdGFja0NvbnRleHQgfCB1bmtub3duKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRpZiAoQ09OVEVYVF9ESVNBU1NFTUJMWV9WSUVXX0ZPQ1VTLmdldFZhbHVlKGNvbnRleHRLZXlTZXJ2aWNlKSkge1xuXHRcdFx0YXdhaXQgZ2V0VGhyZWFkQW5kUnVuKGFjY2Vzc29yLCBjb250ZXh0LCAodGhyZWFkOiBJVGhyZWFkKSA9PiB0aHJlYWQubmV4dCgnaW5zdHJ1Y3Rpb24nKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IGdldFRocmVhZEFuZFJ1bihhY2Nlc3NvciwgY29udGV4dCwgKHRocmVhZDogSVRocmVhZCkgPT4gdGhyZWFkLm5leHQoKSk7XG5cdFx0fVxuXHR9XG59KTtcblxuLy8gV2luZG93cyBicm93c2VycyB1c2UgRjExIGZvciBmdWxsIHNjcmVlbiwgdGh1cyB1c2UgYWx0K0YxMSBhcyB0aGUgZGVmYXVsdCBzaG9ydGN1dFxuY29uc3QgU1RFUF9JTlRPX0tFWUJJTkRJTkcgPSAoaXNXZWIgJiYgaXNXaW5kb3dzKSA/IChLZXlNb2QuQWx0IHwgS2V5Q29kZS5GMTEpIDogS2V5Q29kZS5GMTE7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogU1RFUF9JTlRPX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEwLCAvLyBIYXZlIGEgc3Ryb25nZXIgd2VpZ2h0IHRvIGhhdmUgcHJpb3JpdHkgb3ZlciBmdWxsIHNjcmVlbiB3aGVuIGRlYnVnZ2luZ1xuXHRwcmltYXJ5OiBTVEVQX0lOVE9fS0VZQklORElORyxcblx0Ly8gVXNlIGEgbW9yZSBmbGV4aWJsZSB3aGVuIGNsYXVzZSB0byBub3QgYWxsb3cgZnVsbCBzY3JlZW4gY29tbWFuZCB0byB0YWtlIG92ZXIgd2hlbiBGMTEgcHJlc3NlZCBhIGxvdCBvZiB0aW1lc1xuXHR3aGVuOiBDT05URVhUX0RFQlVHX1NUQVRFLm5vdEVxdWFsc1RvKCdpbmFjdGl2ZScpLFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIF86IHN0cmluZywgY29udGV4dDogQ2FsbFN0YWNrQ29udGV4dCB8IHVua25vd24pID0+IHtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGlmIChDT05URVhUX0RJU0FTU0VNQkxZX1ZJRVdfRk9DVVMuZ2V0VmFsdWUoY29udGV4dEtleVNlcnZpY2UpKSB7XG5cdFx0XHRhd2FpdCBnZXRUaHJlYWRBbmRSdW4oYWNjZXNzb3IsIGNvbnRleHQsICh0aHJlYWQ6IElUaHJlYWQpID0+IHRocmVhZC5zdGVwSW4oJ2luc3RydWN0aW9uJykpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCBnZXRUaHJlYWRBbmRSdW4oYWNjZXNzb3IsIGNvbnRleHQsICh0aHJlYWQ6IElUaHJlYWQpID0+IHRocmVhZC5zdGVwSW4oKSk7XG5cdFx0fVxuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBTVEVQX09VVF9JRCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRjExLFxuXHR3aGVuOiBDT05URVhUX0RFQlVHX1NUQVRFLmlzRXF1YWxUbygnc3RvcHBlZCcpLFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIF86IHN0cmluZywgY29udGV4dDogQ2FsbFN0YWNrQ29udGV4dCB8IHVua25vd24pID0+IHtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGlmIChDT05URVhUX0RJU0FTU0VNQkxZX1ZJRVdfRk9DVVMuZ2V0VmFsdWUoY29udGV4dEtleVNlcnZpY2UpKSB7XG5cdFx0XHRhd2FpdCBnZXRUaHJlYWRBbmRSdW4oYWNjZXNzb3IsIGNvbnRleHQsICh0aHJlYWQ6IElUaHJlYWQpID0+IHRocmVhZC5zdGVwT3V0KCdpbnN0cnVjdGlvbicpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgZ2V0VGhyZWFkQW5kUnVuKGFjY2Vzc29yLCBjb250ZXh0LCAodGhyZWFkOiBJVGhyZWFkKSA9PiB0aHJlYWQuc3RlcE91dCgpKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IFBBVVNFX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDIsIC8vIHRha2UgcHJpb3JpdHkgb3ZlciBmb2N1cyBuZXh0IHBhcnQgd2hpbGUgd2UgYXJlIGRlYnVnZ2luZ1xuXHRwcmltYXJ5OiBLZXlDb2RlLkY2LFxuXHR3aGVuOiBDT05URVhUX0RFQlVHX1NUQVRFLmlzRXF1YWxUbygncnVubmluZycpLFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIF86IHN0cmluZywgY29udGV4dDogQ2FsbFN0YWNrQ29udGV4dCB8IHVua25vd24pID0+IHtcblx0XHRhd2FpdCBnZXRUaHJlYWRBbmRSdW4oYWNjZXNzb3IsIGNvbnRleHQsIHRocmVhZCA9PiB0aHJlYWQucGF1c2UoKSk7XG5cdH1cbn0pO1xuXG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogU1RFUF9JTlRPX1RBUkdFVF9JRCxcblx0cHJpbWFyeTogU1RFUF9JTlRPX0tFWUJJTkRJTkcgfCBLZXlNb2QuQ3RybENtZCxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfU1RFUF9JTlRPX1RBUkdFVFNfU1VQUE9SVEVELCBDT05URVhUX0lOX0RFQlVHX01PREUsIENPTlRFWFRfREVCVUdfU1RBVEUuaXNFcXVhbFRvKCdzdG9wcGVkJykpLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfOiBzdHJpbmcsIGNvbnRleHQ6IENhbGxTdGFja0NvbnRleHQgfCB1bmtub3duKSA9PiB7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbjtcblx0XHRjb25zdCBmcmFtZSA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU3RhY2tGcmFtZTtcblx0XHRpZiAoIWZyYW1lIHx8ICFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdG9yID0gYXdhaXQgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5vcGVuRWRpdG9yKHtcblx0XHRcdHJlc291cmNlOiBmcmFtZS5zb3VyY2UudXJpLFxuXHRcdFx0b3B0aW9uczogeyByZXZlYWxJZk9wZW5lZDogdHJ1ZSB9XG5cdFx0fSk7XG5cblx0XHRsZXQgY29kZUVkaXRvcjogSUNvZGVFZGl0b3IgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0Y29uc3QgY3RybCA9IGVkaXRvcj8uZ2V0Q29udHJvbCgpO1xuXHRcdFx0aWYgKGlzQ29kZUVkaXRvcihjdHJsKSkge1xuXHRcdFx0XHRjb2RlRWRpdG9yID0gY3RybDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpbnRlcmZhY2UgSVRhcmdldEl0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdFx0XHR0YXJnZXQ6IERlYnVnUHJvdG9jb2wuU3RlcEluVGFyZ2V0O1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHFwID0gZGlzcG9zYWJsZXMuYWRkKHF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxJVGFyZ2V0SXRlbT4oKSk7XG5cdFx0cXAuYnVzeSA9IHRydWU7XG5cdFx0cXAuc2hvdygpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHFwLm9uRGlkQ2hhbmdlQWN0aXZlKChbaXRlbV0pID0+IHtcblx0XHRcdGlmIChjb2RlRWRpdG9yICYmIGl0ZW0gJiYgaXRlbS50YXJnZXQubGluZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvZGVFZGl0b3IucmV2ZWFsTGluZUluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQoaXRlbS50YXJnZXQubGluZSk7XG5cdFx0XHRcdGNvZGVFZGl0b3Iuc2V0U2VsZWN0aW9uKHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IGl0ZW0udGFyZ2V0LmxpbmUsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IGl0ZW0udGFyZ2V0LmNvbHVtbiB8fCAxLFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IGl0ZW0udGFyZ2V0LmVuZExpbmUgfHwgaXRlbS50YXJnZXQubGluZSxcblx0XHRcdFx0XHRlbmRDb2x1bW46IGl0ZW0udGFyZ2V0LmVuZENvbHVtbiB8fCBpdGVtLnRhcmdldC5jb2x1bW4gfHwgMSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHFwLm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdGlmIChxcC5hY3RpdmVJdGVtcy5sZW5ndGgpIHtcblx0XHRcdFx0c2Vzc2lvbi5zdGVwSW4oZnJhbWUudGhyZWFkLnRocmVhZElkLCBxcC5hY3RpdmVJdGVtc1swXS50YXJnZXQuaWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChxcC5vbkRpZEhpZGUoKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKSk7XG5cblx0XHRzZXNzaW9uLnN0ZXBJblRhcmdldHMoZnJhbWUuZnJhbWVJZCkudGhlbih0YXJnZXRzID0+IHtcblx0XHRcdHFwLmJ1c3kgPSBmYWxzZTtcblx0XHRcdGlmICh0YXJnZXRzPy5sZW5ndGgpIHtcblx0XHRcdFx0cXAuaXRlbXMgPSB0YXJnZXRzPy5tYXAodGFyZ2V0ID0+ICh7IHRhcmdldCwgbGFiZWw6IHRhcmdldC5sYWJlbCB9KSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRxcC5wbGFjZWhvbGRlciA9IG5scy5sb2NhbGl6ZSgnZWRpdG9yLmRlYnVnLmFjdGlvbi5zdGVwSW50b1RhcmdldHMubm9uZScsIFwiTm8gc3RlcCB0YXJnZXRzIGF2YWlsYWJsZVwiKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufSk7XG5cbmFzeW5jIGZ1bmN0aW9uIHN0b3BIYW5kbGVyKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfOiB1bmtub3duLCBjb250ZXh0OiBDYWxsU3RhY2tDb250ZXh0IHwgdW5rbm93biwgZGlzY29ubmVjdDogYm9vbGVhbiwgc3VzcGVuZD86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRsZXQgc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0aWYgKGlzU2Vzc2lvbkNvbnRleHQoY29udGV4dCkpIHtcblx0XHRzZXNzaW9uID0gZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0U2Vzc2lvbihjb250ZXh0LnNlc3Npb25JZCk7XG5cdH0gZWxzZSB7XG5cdFx0c2Vzc2lvbiA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbjtcblx0fVxuXG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdGNvbnN0IHNob3dTdWJTZXNzaW9ucyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElEZWJ1Z0NvbmZpZ3VyYXRpb24+KCdkZWJ1ZycpLnNob3dTdWJTZXNzaW9uc0luVG9vbEJhcjtcblx0Ly8gU3RvcCBzaG91bGQgYmUgc2VudCB0byB0aGUgcm9vdCBwYXJlbnQgc2Vzc2lvblxuXHR3aGlsZSAoIXNob3dTdWJTZXNzaW9ucyAmJiBzZXNzaW9uICYmIHNlc3Npb24ubGlmZWN5Y2xlTWFuYWdlZEJ5UGFyZW50ICYmIHNlc3Npb24ucGFyZW50U2Vzc2lvbikge1xuXHRcdHNlc3Npb24gPSBzZXNzaW9uLnBhcmVudFNlc3Npb247XG5cdH1cblxuXHRhd2FpdCBkZWJ1Z1NlcnZpY2Uuc3RvcFNlc3Npb24oc2Vzc2lvbiwgZGlzY29ubmVjdCwgc3VzcGVuZCk7XG59XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogRElTQ09OTkVDVF9JRCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRjUsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0ZPQ1VTRURfU0VTU0lPTl9JU19BVFRBQ0gsIENPTlRFWFRfSU5fREVCVUdfTU9ERSksXG5cdGhhbmRsZXI6IChhY2Nlc3NvciwgXywgY29udGV4dCkgPT4gc3RvcEhhbmRsZXIoYWNjZXNzb3IsIF8sIGNvbnRleHQsIHRydWUpXG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogRElTQ09OTkVDVF9BTkRfU1VTUEVORF9JRCxcblx0aGFuZGxlcjogKGFjY2Vzc29yLCBfLCBjb250ZXh0KSA9PiBzdG9wSGFuZGxlcihhY2Nlc3NvciwgXywgY29udGV4dCwgdHJ1ZSwgdHJ1ZSlcbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IFNUT1BfSUQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkY1LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9GT0NVU0VEX1NFU1NJT05fSVNfQVRUQUNILnRvTmVnYXRlZCgpLCBDT05URVhUX0lOX0RFQlVHX01PREUpLFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IsIF8sIGNvbnRleHQpID0+IHN0b3BIYW5kbGVyKGFjY2Vzc29yLCBfLCBjb250ZXh0LCBmYWxzZSlcbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiBSRVNUQVJUX0ZSQU1FX0lELFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIF86IHN0cmluZywgY29udGV4dDogQ2FsbFN0YWNrQ29udGV4dCB8IHVua25vd24pID0+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgZnJhbWUgPSBnZXRGcmFtZShkZWJ1Z1NlcnZpY2UsIGNvbnRleHQpO1xuXHRcdGlmIChmcmFtZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgZnJhbWUucmVzdGFydCgpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogQ09OVElOVUVfSUQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMTAsIC8vIFVzZSBhIHN0cm9uZ2VyIHdlaWdodCB0byBnZXQgcHJpb3JpdHkgb3ZlciBzdGFydCBkZWJ1Z2dpbmcgRjUgc2hvcnRjdXRcblx0cHJpbWFyeTogS2V5Q29kZS5GNSxcblx0d2hlbjogQ09OVEVYVF9ERUJVR19TVEFURS5pc0VxdWFsVG8oJ3N0b3BwZWQnKSxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfOiBzdHJpbmcsIGNvbnRleHQ6IENhbGxTdGFja0NvbnRleHQgfCB1bmtub3duKSA9PiB7XG5cdFx0YXdhaXQgZ2V0VGhyZWFkQW5kUnVuKGFjY2Vzc29yLCBjb250ZXh0LCB0aHJlYWQgPT4gdGhyZWFkLmNvbnRpbnVlKCkpO1xuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogU0hPV19MT0FERURfU0NSSVBUU19JRCxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yKSA9PiB7XG5cdFx0YXdhaXQgc2hvd0xvYWRlZFNjcmlwdE1lbnUoYWNjZXNzb3IpO1xuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogJ2RlYnVnLnN0YXJ0RnJvbUNvbmZpZycsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvciwgY29uZmlnOiBJQ29uZmlnKSA9PiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGF3YWl0IGRlYnVnU2VydmljZS5zdGFydERlYnVnZ2luZyh1bmRlZmluZWQsIGNvbmZpZyk7XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiBGT0NVU19TRVNTSU9OX0lELFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHNlc3Npb246IElEZWJ1Z1Nlc3Npb24pID0+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0c2Vzc2lvbiA9IHJlc29sdmVDaGlsZFNlc3Npb24oc2Vzc2lvbiwgZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0U2Vzc2lvbnMoKSk7XG5cdFx0YXdhaXQgZGVidWdTZXJ2aWNlLmZvY3VzU3RhY2tGcmFtZSh1bmRlZmluZWQsIHVuZGVmaW5lZCwgc2Vzc2lvbiwgeyBleHBsaWNpdDogdHJ1ZSB9KTtcblx0XHRjb25zdCBzdGFja0ZyYW1lID0gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTdGFja0ZyYW1lO1xuXHRcdGlmIChzdGFja0ZyYW1lKSB7XG5cdFx0XHRhd2FpdCBzdGFja0ZyYW1lLm9wZW5JbkVkaXRvcihlZGl0b3JTZXJ2aWNlLCB0cnVlKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiBTRUxFQ1RfQU5EX1NUQVJUX0lELFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGRlYnVnVHlwZTogc3RyaW5nIHwgdW5rbm93biwgZGVidWdTdGFydE9wdGlvbnM/OiB7IG5vRGVidWc/OiBib29sZWFuIH0pID0+IHtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblxuXHRcdGlmIChkZWJ1Z1R5cGUpIHtcblx0XHRcdGNvbnN0IGNvbmZpZ01hbmFnZXIgPSBkZWJ1Z1NlcnZpY2UuZ2V0Q29uZmlndXJhdGlvbk1hbmFnZXIoKTtcblx0XHRcdGNvbnN0IGR5bmFtaWNQcm92aWRlcnMgPSBhd2FpdCBjb25maWdNYW5hZ2VyLmdldER5bmFtaWNQcm92aWRlcnMoKTtcblx0XHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgZHluYW1pY1Byb3ZpZGVycykge1xuXHRcdFx0XHRpZiAocHJvdmlkZXIudHlwZSA9PT0gZGVidWdUeXBlKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGljayA9IGF3YWl0IHByb3ZpZGVyLnBpY2soKTtcblx0XHRcdFx0XHRpZiAocGljaykge1xuXHRcdFx0XHRcdFx0YXdhaXQgY29uZmlnTWFuYWdlci5zZWxlY3RDb25maWd1cmF0aW9uKHBpY2subGF1bmNoLCBwaWNrLmNvbmZpZy5uYW1lLCBwaWNrLmNvbmZpZywgeyB0eXBlOiBwcm92aWRlci50eXBlIH0pO1xuXHRcdFx0XHRcdFx0ZGVidWdTZXJ2aWNlLnN0YXJ0RGVidWdnaW5nKHBpY2subGF1bmNoLCBwaWNrLmNvbmZpZywgeyBub0RlYnVnOiBkZWJ1Z1N0YXJ0T3B0aW9ucz8ubm9EZWJ1Zywgc3RhcnRlZEJ5VXNlcjogdHJ1ZSB9KTtcblxuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHF1aWNrSW5wdXRTZXJ2aWNlLnF1aWNrQWNjZXNzLnNob3coREVCVUdfUVVJQ0tfQUNDRVNTX1BSRUZJWCk7XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiBTRUxFQ1RfREVCVUdfQ09OU09MRV9JRCxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRxdWlja0lucHV0U2VydmljZS5xdWlja0FjY2Vzcy5zaG93KERFQlVHX0NPTlNPTEVfUVVJQ0tfQUNDRVNTX1BSRUZJWCk7XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiBTRUxFQ1RfREVCVUdfU0VTU0lPTl9JRCxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiB7XG5cdFx0c2hvd0RlYnVnU2Vzc2lvbk1lbnUoYWNjZXNzb3IsIFNFTEVDVF9BTkRfU1RBUlRfSUQpO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBERUJVR19TVEFSVF9DT01NQU5EX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0cHJpbWFyeTogS2V5Q29kZS5GNSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfREVCVUdHRVJTX0FWQUlMQUJMRSwgQ09OVEVYVF9ERUJVR19TVEFURS5pc0VxdWFsVG8oJ2luYWN0aXZlJykpLFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGRlYnVnU3RhcnRPcHRpb25zPzogeyBjb25maWc/OiBQYXJ0aWFsPElDb25maWc+OyBub0RlYnVnPzogYm9vbGVhbiB9KSA9PiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGF3YWl0IHNhdmVBbGxCZWZvcmVEZWJ1Z1N0YXJ0KGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpKTtcblx0XHRjb25zdCB7IGxhdW5jaCwgbmFtZSwgZ2V0Q29uZmlnIH0gPSBkZWJ1Z1NlcnZpY2UuZ2V0Q29uZmlndXJhdGlvbk1hbmFnZXIoKS5zZWxlY3RlZENvbmZpZ3VyYXRpb247XG5cdFx0Y29uc3QgY29uZmlnID0gYXdhaXQgZ2V0Q29uZmlnKCk7XG5cdFx0Y29uc3QgY29uZmlnT3JOYW1lID0gY29uZmlnID8gT2JqZWN0LmFzc2lnbihkZWVwQ2xvbmUoY29uZmlnKSwgZGVidWdTdGFydE9wdGlvbnM/LmNvbmZpZykgOiBuYW1lO1xuXHRcdGF3YWl0IGRlYnVnU2VydmljZS5zdGFydERlYnVnZ2luZyhsYXVuY2gsIGNvbmZpZ09yTmFtZSwgeyBub0RlYnVnOiBkZWJ1Z1N0YXJ0T3B0aW9ucz8ubm9EZWJ1Zywgc3RhcnRlZEJ5VXNlcjogdHJ1ZSB9LCBmYWxzZSk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IERFQlVHX1JVTl9DT01NQU5EX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkY1LFxuXHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLkY1IH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0RFQlVHR0VSU19BVkFJTEFCTEUsIENPTlRFWFRfREVCVUdfU1RBVEUubm90RXF1YWxzVG8oZ2V0U3RhdGVMYWJlbChTdGF0ZS5Jbml0aWFsaXppbmcpKSksXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoREVCVUdfU1RBUlRfQ09NTUFORF9JRCwgeyBub0RlYnVnOiB0cnVlIH0pO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnZGVidWcudG9nZ2xlQnJlYWtwb2ludCcsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgNSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfQlJFQUtQT0lOVFNfRk9DVVNFRCwgSW5wdXRGb2N1c2VkQ29udGV4dC50b05lZ2F0ZWQoKSksXG5cdHByaW1hcnk6IEtleUNvZGUuU3BhY2UsXG5cdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IGxpc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSk7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGNvbnN0IGxpc3QgPSBsaXN0U2VydmljZS5sYXN0Rm9jdXNlZExpc3Q7XG5cdFx0aWYgKGxpc3QgaW5zdGFuY2VvZiBMaXN0KSB7XG5cdFx0XHRjb25zdCBmb2N1c2VkID0gPElFbmFibGVtZW50W10+bGlzdC5nZXRGb2N1c2VkRWxlbWVudHMoKTtcblx0XHRcdGlmIChmb2N1c2VkICYmIGZvY3VzZWQubGVuZ3RoKSB7XG5cdFx0XHRcdGRlYnVnU2VydmljZS5lbmFibGVPckRpc2FibGVCcmVha3BvaW50cyghZm9jdXNlZFswXS5lbmFibGVkLCBmb2N1c2VkWzBdKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdkZWJ1Zy5lbmFibGVPckRpc2FibGVCcmVha3BvaW50Jyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHByaW1hcnk6IHVuZGVmaW5lZCxcblx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgY29udHJvbCA9IGVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2w7XG5cdFx0aWYgKGlzQ29kZUVkaXRvcihjb250cm9sKSkge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjb250cm9sLmdldE1vZGVsKCk7XG5cdFx0XHRpZiAobW9kZWwpIHtcblx0XHRcdFx0Y29uc3QgcG9zaXRpb24gPSBjb250cm9sLmdldFBvc2l0aW9uKCk7XG5cdFx0XHRcdGlmIChwb3NpdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IGJwcyA9IGRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldEJyZWFrcG9pbnRzKHsgdXJpOiBtb2RlbC51cmksIGxpbmVOdW1iZXI6IHBvc2l0aW9uLmxpbmVOdW1iZXIgfSk7XG5cdFx0XHRcdFx0aWYgKGJwcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdGRlYnVnU2VydmljZS5lbmFibGVPckRpc2FibGVCcmVha3BvaW50cyghYnBzWzBdLmVuYWJsZWQsIGJwc1swXSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBFRElUX0VYUFJFU1NJT05fQ09NTUFORF9JRCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyA1LFxuXHR3aGVuOiBDT05URVhUX1dBVENIX0VYUFJFU1NJT05TX0ZPQ1VTRUQsXG5cdHByaW1hcnk6IEtleUNvZGUuRjIsXG5cdG1hYzogeyBwcmltYXJ5OiBLZXlDb2RlLkVudGVyIH0sXG5cdGhhbmRsZXI6IChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZXhwcmVzc2lvbjogRXhwcmVzc2lvbiB8IHVua25vd24pID0+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0aWYgKCEoZXhwcmVzc2lvbiBpbnN0YW5jZW9mIEV4cHJlc3Npb24pKSB7XG5cdFx0XHRjb25zdCBsaXN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZm9jdXNlZCA9IGxpc3RTZXJ2aWNlLmxhc3RGb2N1c2VkTGlzdDtcblx0XHRcdGlmIChmb2N1c2VkKSB7XG5cdFx0XHRcdGNvbnN0IGVsZW1lbnRzID0gZm9jdXNlZC5nZXRGb2N1cygpO1xuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShlbGVtZW50cykgJiYgZWxlbWVudHNbMF0gaW5zdGFuY2VvZiBFeHByZXNzaW9uKSB7XG5cdFx0XHRcdFx0ZXhwcmVzc2lvbiA9IGVsZW1lbnRzWzBdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGV4cHJlc3Npb24gaW5zdGFuY2VvZiBFeHByZXNzaW9uKSB7XG5cdFx0XHRkZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuc2V0U2VsZWN0ZWRFeHByZXNzaW9uKGV4cHJlc3Npb24sIGZhbHNlKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiBTRVRfRVhQUkVTU0lPTl9DT01NQU5EX0lELFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGV4cHJlc3Npb246IEV4cHJlc3Npb24gfCB1bmtub3duKSA9PiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGlmIChleHByZXNzaW9uIGluc3RhbmNlb2YgRXhwcmVzc2lvbiB8fCBleHByZXNzaW9uIGluc3RhbmNlb2YgVmFyaWFibGUpIHtcblx0XHRcdGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5zZXRTZWxlY3RlZEV4cHJlc3Npb24oZXhwcmVzc2lvbiwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnZGVidWcuc2V0VmFyaWFibGUnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDUsXG5cdHdoZW46IENPTlRFWFRfVkFSSUFCTEVTX0ZPQ1VTRUQsXG5cdHByaW1hcnk6IEtleUNvZGUuRjIsXG5cdG1hYzogeyBwcmltYXJ5OiBLZXlDb2RlLkVudGVyIH0sXG5cdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IGxpc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSk7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGNvbnN0IGZvY3VzZWQgPSBsaXN0U2VydmljZS5sYXN0Rm9jdXNlZExpc3Q7XG5cblx0XHRpZiAoZm9jdXNlZCkge1xuXHRcdFx0Y29uc3QgZWxlbWVudHMgPSBmb2N1c2VkLmdldEZvY3VzKCk7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShlbGVtZW50cykgJiYgZWxlbWVudHNbMF0gaW5zdGFuY2VvZiBWYXJpYWJsZSkge1xuXHRcdFx0XHRkZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuc2V0U2VsZWN0ZWRFeHByZXNzaW9uKGVsZW1lbnRzWzBdLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBSRU1PVkVfRVhQUkVTU0lPTl9DT01NQU5EX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfV0FUQ0hfRVhQUkVTU0lPTlNfRk9DVVNFRCwgQ09OVEVYVF9FWFBSRVNTSU9OX1NFTEVDVEVELnRvTmVnYXRlZCgpKSxcblx0cHJpbWFyeTogS2V5Q29kZS5EZWxldGUsXG5cdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQmFja3NwYWNlIH0sXG5cdGhhbmRsZXI6IChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZXhwcmVzc2lvbjogRXhwcmVzc2lvbiB8IHVua25vd24pID0+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cblx0XHRpZiAoZXhwcmVzc2lvbiBpbnN0YW5jZW9mIEV4cHJlc3Npb24pIHtcblx0XHRcdGRlYnVnU2VydmljZS5yZW1vdmVXYXRjaEV4cHJlc3Npb25zKGV4cHJlc3Npb24uZ2V0SWQoKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGlzdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKTtcblx0XHRjb25zdCBmb2N1c2VkID0gbGlzdFNlcnZpY2UubGFzdEZvY3VzZWRMaXN0O1xuXHRcdGlmIChmb2N1c2VkKSB7XG5cdFx0XHRsZXQgZWxlbWVudHMgPSBmb2N1c2VkLmdldEZvY3VzKCk7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShlbGVtZW50cykgJiYgZWxlbWVudHNbMF0gaW5zdGFuY2VvZiBFeHByZXNzaW9uKSB7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IGZvY3VzZWQuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRcdGlmIChzZWxlY3Rpb24gJiYgc2VsZWN0aW9uLmluZGV4T2YoZWxlbWVudHNbMF0pID49IDApIHtcblx0XHRcdFx0XHRlbGVtZW50cyA9IHNlbGVjdGlvbjtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbGVtZW50cy5mb3JFYWNoKChlOiBFeHByZXNzaW9uKSA9PiBkZWJ1Z1NlcnZpY2UucmVtb3ZlV2F0Y2hFeHByZXNzaW9ucyhlLmdldElkKCkpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiBCUkVBS19XSEVOX1ZBTFVFX0NIQU5HRVNfSUQsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRpZiAoZGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UpIHtcblx0XHRcdGF3YWl0IGRlYnVnU2VydmljZS5hZGREYXRhQnJlYWtwb2ludCh7IGRlc2NyaXB0aW9uOiBkYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZS5kZXNjcmlwdGlvbiwgc3JjOiB7IHR5cGU6IERhdGFCcmVha3BvaW50U2V0VHlwZS5WYXJpYWJsZSwgZGF0YUlkOiBkYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZS5kYXRhSWQhIH0sIGNhblBlcnNpc3Q6ICEhZGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UuY2FuUGVyc2lzdCwgYWNjZXNzVHlwZXM6IGRhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlLmFjY2Vzc1R5cGVzLCBhY2Nlc3NUeXBlOiAnd3JpdGUnIH0pO1xuXHRcdH1cblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6IEJSRUFLX1dIRU5fVkFMVUVfSVNfQUNDRVNTRURfSUQsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRpZiAoZGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UpIHtcblx0XHRcdGF3YWl0IGRlYnVnU2VydmljZS5hZGREYXRhQnJlYWtwb2ludCh7IGRlc2NyaXB0aW9uOiBkYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZS5kZXNjcmlwdGlvbiwgc3JjOiB7IHR5cGU6IERhdGFCcmVha3BvaW50U2V0VHlwZS5WYXJpYWJsZSwgZGF0YUlkOiBkYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZS5kYXRhSWQhIH0sIGNhblBlcnNpc3Q6ICEhZGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UuY2FuUGVyc2lzdCwgYWNjZXNzVHlwZXM6IGRhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlLmFjY2Vzc1R5cGVzLCBhY2Nlc3NUeXBlOiAncmVhZFdyaXRlJyB9KTtcblx0XHR9XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiBCUkVBS19XSEVOX1ZBTFVFX0lTX1JFQURfSUQsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRpZiAoZGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UpIHtcblx0XHRcdGF3YWl0IGRlYnVnU2VydmljZS5hZGREYXRhQnJlYWtwb2ludCh7IGRlc2NyaXB0aW9uOiBkYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZS5kZXNjcmlwdGlvbiwgc3JjOiB7IHR5cGU6IERhdGFCcmVha3BvaW50U2V0VHlwZS5WYXJpYWJsZSwgZGF0YUlkOiBkYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZS5kYXRhSWQhIH0sIGNhblBlcnNpc3Q6ICEhZGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UuY2FuUGVyc2lzdCwgYWNjZXNzVHlwZXM6IGRhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlLmFjY2Vzc1R5cGVzLCBhY2Nlc3NUeXBlOiAncmVhZCcgfSk7XG5cdFx0fVxuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnZGVidWcucmVtb3ZlQnJlYWtwb2ludCcsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9CUkVBS1BPSU5UU19GT0NVU0VELCBDT05URVhUX0JSRUFLUE9JTlRfSU5QVVRfRk9DVVNFRC50b05lZ2F0ZWQoKSksXG5cdHByaW1hcnk6IEtleUNvZGUuRGVsZXRlLFxuXHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJhY2tzcGFjZSB9LFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBsaXN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRjb25zdCBsaXN0ID0gbGlzdFNlcnZpY2UubGFzdEZvY3VzZWRMaXN0O1xuXG5cdFx0aWYgKGxpc3QgaW5zdGFuY2VvZiBMaXN0KSB7XG5cdFx0XHRjb25zdCBmb2N1c2VkID0gbGlzdC5nZXRGb2N1c2VkRWxlbWVudHMoKTtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBmb2N1c2VkLmxlbmd0aCA/IGZvY3VzZWRbMF0gOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEJyZWFrcG9pbnQpIHtcblx0XHRcdFx0ZGVidWdTZXJ2aWNlLnJlbW92ZUJyZWFrcG9pbnRzKGVsZW1lbnQuZ2V0SWQoKSk7XG5cdFx0XHR9IGVsc2UgaWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBGdW5jdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdFx0ZGVidWdTZXJ2aWNlLnJlbW92ZUZ1bmN0aW9uQnJlYWtwb2ludHMoZWxlbWVudC5nZXRJZCgpKTtcblx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIERhdGFCcmVha3BvaW50KSB7XG5cdFx0XHRcdGRlYnVnU2VydmljZS5yZW1vdmVEYXRhQnJlYWtwb2ludHMoZWxlbWVudC5nZXRJZCgpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdkZWJ1Zy5pbnN0YWxsQWRkaXRpb25hbERlYnVnZ2VycycsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiB1bmRlZmluZWQsXG5cdHByaW1hcnk6IHVuZGVmaW5lZCxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yLCBxdWVyeTogc3RyaW5nKSA9PiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKTtcblx0XHRsZXQgc2VhcmNoRm9yID0gYEBjYXRlZ29yeTpkZWJ1Z2dlcnNgO1xuXHRcdGlmICh0eXBlb2YgcXVlcnkgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRzZWFyY2hGb3IgKz0gYCAke3F1ZXJ5fWA7XG5cdFx0fVxuXHRcdHJldHVybiBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKHNlYXJjaEZvcik7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQWRkQ29uZmlndXJhdGlvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQUREX0NPTkZJR1VSQVRJT05fSUQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignYWRkQ29uZmlndXJhdGlvbicsIFwiQWRkIENvbmZpZ3VyYXRpb24uLi5cIiksXG5cdFx0XHRjYXRlZ29yeTogREVCVUdfQ09NTUFORF9DQVRFR09SWSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkVkaXRvckNvbnRlbnQsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5yZWdleChSZXNvdXJjZUNvbnRleHRLZXkuUGF0aC5rZXksIC9cXC52c2NvZGVbL1xcXFxdbGF1bmNoXFwuanNvbiQvKSxcblx0XHRcdFx0XHRBY3RpdmVFZGl0b3JDb250ZXh0LmlzRXF1YWxUbyhURVhUX0ZJTEVfRURJVE9SX0lEKSlcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgbGF1bmNoVXJpOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpLmdldENvbmZpZ3VyYXRpb25NYW5hZ2VyKCk7XG5cblx0XHRjb25zdCBsYXVuY2ggPSBtYW5hZ2VyLmdldExhdW5jaGVzKCkuZmluZChsID0+IGwudXJpLnRvU3RyaW5nKCkgPT09IGxhdW5jaFVyaSkgfHwgbWFuYWdlci5zZWxlY3RlZENvbmZpZ3VyYXRpb24ubGF1bmNoO1xuXHRcdGlmIChsYXVuY2gpIHtcblx0XHRcdGNvbnN0IHsgZWRpdG9yLCBjcmVhdGVkIH0gPSBhd2FpdCBsYXVuY2gub3BlbkNvbmZpZ0ZpbGUoeyBwcmVzZXJ2ZUZvY3VzOiBmYWxzZSB9KTtcblx0XHRcdGlmIChlZGl0b3IgJiYgIWNyZWF0ZWQpIHtcblx0XHRcdFx0Y29uc3QgY29kZUVkaXRvciA9IDxJQ29kZUVkaXRvcj5lZGl0b3IuZ2V0Q29udHJvbCgpO1xuXHRcdFx0XHRpZiAoY29kZUVkaXRvcikge1xuXHRcdFx0XHRcdGF3YWl0IGNvZGVFZGl0b3IuZ2V0Q29udHJpYnV0aW9uPElEZWJ1Z0VkaXRvckNvbnRyaWJ1dGlvbj4oRURJVE9SX0NPTlRSSUJVVElPTl9JRCk/LmFkZExhdW5jaENvbmZpZ3VyYXRpb24oKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbmNvbnN0IGlubGluZUJyZWFrcG9pbnRIYW5kbGVyID0gKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiB7XG5cdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdGNvbnN0IGNvbnRyb2wgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sO1xuXHRpZiAoaXNDb2RlRWRpdG9yKGNvbnRyb2wpKSB7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSBjb250cm9sLmdldFBvc2l0aW9uKCk7XG5cdFx0aWYgKHBvc2l0aW9uICYmIGNvbnRyb2wuaGFzTW9kZWwoKSAmJiBkZWJ1Z1NlcnZpY2UuY2FuU2V0QnJlYWtwb2ludHNJbihjb250cm9sLmdldE1vZGVsKCkpKSB7XG5cdFx0XHRjb25zdCBtb2RlbFVyaSA9IGNvbnRyb2wuZ2V0TW9kZWwoKS51cmk7XG5cdFx0XHRjb25zdCBicmVha3BvaW50QWxyZWFkeVNldCA9IGRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldEJyZWFrcG9pbnRzKHsgbGluZU51bWJlcjogcG9zaXRpb24ubGluZU51bWJlciwgdXJpOiBtb2RlbFVyaSB9KVxuXHRcdFx0XHQuc29tZShicCA9PiAoYnAuc2Vzc2lvbkFnbm9zdGljRGF0YS5jb2x1bW4gPT09IHBvc2l0aW9uLmNvbHVtbiB8fCAoIWJwLmNvbHVtbiAmJiBwb3NpdGlvbi5jb2x1bW4gPD0gMSkpKTtcblxuXHRcdFx0aWYgKCFicmVha3BvaW50QWxyZWFkeVNldCkge1xuXHRcdFx0XHRkZWJ1Z1NlcnZpY2UuYWRkQnJlYWtwb2ludHMobW9kZWxVcmksIFt7IGxpbmVOdW1iZXI6IHBvc2l0aW9uLmxpbmVOdW1iZXIsIGNvbHVtbjogcG9zaXRpb24uY29sdW1uID4gMSA/IHBvc2l0aW9uLmNvbHVtbiA6IHVuZGVmaW5lZCB9XSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59O1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRjksXG5cdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0aWQ6IFRPR0dMRV9JTkxJTkVfQlJFQUtQT0lOVF9JRCxcblx0aGFuZGxlcjogaW5saW5lQnJlYWtwb2ludEhhbmRsZXJcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvckNvbnRleHQsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBUT0dHTEVfSU5MSU5FX0JSRUFLUE9JTlRfSUQsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnYWRkSW5saW5lQnJlYWtwb2ludCcsIFwiQWRkIElubGluZSBCcmVha3BvaW50XCIpLFxuXHRcdGNhdGVnb3J5OiBERUJVR19DT01NQU5EX0NBVEVHT1JZXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRDT05URVhUX0lOX0RFQlVHX01PREUsXG5cdFx0UGFuZWxGb2N1c0NvbnRleHQudG9OZWdhdGVkKCksXG5cdFx0RWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdENoYXRDb250ZXh0S2V5cy5pbkNoYXRTZXNzaW9uLnRvTmVnYXRlZCgpKSxcblx0Z3JvdXA6ICdkZWJ1ZycsXG5cdG9yZGVyOiAxXG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnZGVidWcub3BlbkJyZWFrcG9pbnRUb1NpZGUnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogQ09OVEVYVF9CUkVBS1BPSU5UU19GT0NVU0VELFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRW50ZXIsXG5cdHNlY29uZGFyeTogW0tleU1vZC5BbHQgfCBLZXlDb2RlLkVudGVyXSxcblx0aGFuZGxlcjogKGFjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3QgbGlzdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKTtcblx0XHRjb25zdCBsaXN0ID0gbGlzdFNlcnZpY2UubGFzdEZvY3VzZWRMaXN0O1xuXHRcdGlmIChsaXN0IGluc3RhbmNlb2YgTGlzdCkge1xuXHRcdFx0Y29uc3QgZm9jdXMgPSBsaXN0LmdldEZvY3VzZWRFbGVtZW50cygpO1xuXHRcdFx0aWYgKGZvY3VzLmxlbmd0aCAmJiBmb2N1c1swXSBpbnN0YW5jZW9mIEJyZWFrcG9pbnQpIHtcblx0XHRcdFx0cmV0dXJuIG9wZW5CcmVha3BvaW50U291cmNlKGZvY3VzWzBdLCB0cnVlLCBmYWxzZSwgdHJ1ZSwgYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFRvZ2dsZUV4Y2VwdGlvbkJyZWFrcG9pbnRzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUT0dHTEVfRVhDRVBUSU9OX0JSRUFLUE9JTlRTX0lELFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3RvZ2dsZUV4Y2VwdGlvbkJyZWFrcG9pbnRzJywgXCJUb2dnbGUgRXhjZXB0aW9uIEJyZWFrcG9pbnRzXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IERFQlVHX0NPTU1BTkRfQ0FURUdPUlksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblxuXHRcdC8vIEdldCB0aGUgZm9jdXNlZCBzZXNzaW9uIG9yIHRoZSBmaXJzdCBhdmFpbGFibGUgc2Vzc2lvblxuXHRcdGNvbnN0IGRlYnVnTW9kZWwgPSBkZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uIHx8IGRlYnVnTW9kZWwuZ2V0U2Vzc2lvbnMoKVswXTtcblx0XHRjb25zdCBleGNlcHRpb25CcmVha3BvaW50cyA9IHNlc3Npb24gPyBkZWJ1Z01vZGVsLmdldEV4Y2VwdGlvbkJyZWFrcG9pbnRzRm9yU2Vzc2lvbihzZXNzaW9uLmdldElkKCkpIDogZGVidWdNb2RlbC5nZXRFeGNlcHRpb25CcmVha3BvaW50cygpO1xuXHRcdGlmIChleGNlcHRpb25CcmVha3BvaW50cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiBvbmx5IG9uZSBleGNlcHRpb24gYnJlYWtwb2ludCB0eXBlLCB0b2dnbGUgaXQgZGlyZWN0bHlcblx0XHRpZiAoZXhjZXB0aW9uQnJlYWtwb2ludHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRjb25zdCBicmVha3BvaW50ID0gZXhjZXB0aW9uQnJlYWtwb2ludHNbMF07XG5cdFx0XHRhd2FpdCBkZWJ1Z1NlcnZpY2UuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMoIWJyZWFrcG9pbnQuZW5hYmxlZCwgYnJlYWtwb2ludCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gTXVsdGlwbGUgZXhjZXB0aW9uIGJyZWFrcG9pbnQgdHlwZXMgLSBzaG93IHF1aWNrcGljayBmb3Igc2VsZWN0aW9uXG5cdFx0aW50ZXJmYWNlIElFeGNlcHRpb25CcmVha3BvaW50SXRlbSBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0XHRcdGJyZWFrcG9pbnQ6IElFeGNlcHRpb25CcmVha3BvaW50O1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHF1aWNrUGljayA9IGRpc3Bvc2FibGVzLmFkZChxdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SUV4Y2VwdGlvbkJyZWFrcG9pbnRJdGVtPigpKTtcblx0XHRxdWlja1BpY2sucGxhY2Vob2xkZXIgPSBubHMubG9jYWxpemUoJ3NlbGVjdEV4Y2VwdGlvbkJyZWFrcG9pbnRzUGxhY2Vob2xkZXInLCBcIlBpY2sgZW5hYmxlZCBleGNlcHRpb24gYnJlYWtwb2ludHNcIik7XG5cdFx0cXVpY2tQaWNrLmNhblNlbGVjdE1hbnkgPSB0cnVlO1xuXHRcdHF1aWNrUGljay5tYXRjaE9uRGVzY3JpcHRpb24gPSB0cnVlO1xuXHRcdHF1aWNrUGljay5tYXRjaE9uRGV0YWlsID0gdHJ1ZTtcblxuXHRcdC8vIENyZWF0ZSBxdWlja3BpY2sgaXRlbXMgZnJvbSBleGNlcHRpb24gYnJlYWtwb2ludHNcblx0XHRxdWlja1BpY2suaXRlbXMgPSBleGNlcHRpb25CcmVha3BvaW50cy5tYXAoYnAgPT4gKHtcblx0XHRcdGxhYmVsOiBicC5sYWJlbCxcblx0XHRcdGRlc2NyaXB0aW9uOiBicC5kZXNjcmlwdGlvbixcblx0XHRcdHBpY2tlZDogYnAuZW5hYmxlZCxcblx0XHRcdGJyZWFrcG9pbnQ6IGJwXG5cdFx0fSkpO1xuXG5cdFx0cXVpY2tQaWNrLnNlbGVjdGVkSXRlbXMgPSBxdWlja1BpY2suaXRlbXMuZmlsdGVyKGl0ZW0gPT4gaXRlbS5waWNrZWQpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRjb25zdCBzZWxlY3RlZEl0ZW1zID0gcXVpY2tQaWNrLnNlbGVjdGVkSXRlbXM7XG5cdFx0XHRjb25zdCB0b0VuYWJsZTogSUV4Y2VwdGlvbkJyZWFrcG9pbnRbXSA9IFtdO1xuXHRcdFx0Y29uc3QgdG9EaXNhYmxlOiBJRXhjZXB0aW9uQnJlYWtwb2ludFtdID0gW107XG5cblx0XHRcdC8vIERldGVybWluZSB3aGljaCBicmVha3BvaW50cyBuZWVkIHRvIGJlIHRvZ2dsZWRcblx0XHRcdGZvciAoY29uc3QgYnAgb2YgZXhjZXB0aW9uQnJlYWtwb2ludHMpIHtcblx0XHRcdFx0Y29uc3QgaXNTZWxlY3RlZCA9IHNlbGVjdGVkSXRlbXMuc29tZShpdGVtID0+IGl0ZW0uYnJlYWtwb2ludCA9PT0gYnApO1xuXHRcdFx0XHRpZiAoaXNTZWxlY3RlZCAmJiAhYnAuZW5hYmxlZCkge1xuXHRcdFx0XHRcdHRvRW5hYmxlLnB1c2goYnApO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCFpc1NlbGVjdGVkICYmIGJwLmVuYWJsZWQpIHtcblx0XHRcdFx0XHR0b0Rpc2FibGUucHVzaChicCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gVG9nZ2xlIHRoZSBicmVha3BvaW50c1xuXHRcdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBicCBvZiB0b0VuYWJsZSkge1xuXHRcdFx0XHRwcm9taXNlcy5wdXNoKGRlYnVnU2VydmljZS5lbmFibGVPckRpc2FibGVCcmVha3BvaW50cyh0cnVlLCBicCkpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBicCBvZiB0b0Rpc2FibGUpIHtcblx0XHRcdFx0cHJvbWlzZXMucHVzaChkZWJ1Z1NlcnZpY2UuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMoZmFsc2UsIGJwKSk7XG5cdFx0XHR9XG5cblx0XHRcdFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSk7XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKSk7XG5cdFx0cXVpY2tQaWNrLnNob3coKTtcblx0fVxufSk7XG5cbi8vIFdoZW4gdGhlcmUgYXJlIG5vIGRlYnVnIGV4dGVuc2lvbnMsIG9wZW4gdGhlIGRlYnVnIHZpZXdsZXQgd2hlbiBGNSBpcyBwcmVzc2VkIHNvIHRoZSB1c2VyIGNhbiByZWFkIHRoZSBsaW1pdGF0aW9uc1xuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnZGVidWcub3BlblZpZXcnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogQ09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFLnRvTmVnYXRlZCgpLFxuXHRwcmltYXJ5OiBLZXlDb2RlLkY1LFxuXHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRjVdLFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBwYW5lQ29tcG9zaXRlU2VydmljZSA9IGFjY2Vzc29yLmdldChJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlKTtcblx0XHRhd2FpdCBwYW5lQ29tcG9zaXRlU2VydmljZS5vcGVuUGFuZUNvbXBvc2l0ZShWSUVXTEVUX0lELCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciwgdHJ1ZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEFUVEFDSF9UT19DVVJSRU5UX0NPREVfUkVOREVSRVIsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignYXR0YWNoVG9DdXJyZW50Q29kZVJlbmRlcmVyJywgXCJBdHRhY2ggdG8gQ3VycmVudCBDb2RlIFJlbmRlcmVyXCIpLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTxhbnk+IHtcblx0XHRjb25zdCBlbnYgPSBhY2Nlc3Nvci5nZXQoSUVudmlyb25tZW50U2VydmljZSk7XG5cdFx0aWYgKCFlbnYuaXNFeHRlbnNpb25EZXZlbG9wbWVudCAmJiAhZW52LmV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignUmVmdXNpbmcgdG8gYXR0YWNoIHRvIHJlbmRlcmVyIG91dHNpZGUgb2YgZGV2ZWxvcG1lbnQgY29udGV4dCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdpbmRvd0lkID0gZ2V0V2luZG93SWQobWFpbldpbmRvdyk7XG5cdFx0Y29uc3QgZXh0RGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25Ib3N0RGVidWdTZXJ2aWNlKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleHREZWJ1Z1NlcnZpY2UuYXR0YWNoVG9DdXJyZW50V2luZG93UmVuZGVyZXIod2luZG93SWQpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLFlBQVk7QUFDckIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxPQUFPLGlCQUFpQjtBQUNqQyxTQUFzQixvQkFBb0I7QUFFMUMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQ0FBc0M7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
