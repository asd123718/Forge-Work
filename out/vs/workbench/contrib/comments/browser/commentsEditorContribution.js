import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import "./media/review.css";
import { isCodeEditor, isDiffEditor } from "../../../../editor/browser/editorBrowser.js";
import { EditorContributionInstantiation, registerEditorContribution } from "../../../../editor/browser/editorExtensions.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import * as nls from "../../../../nls.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ICommentService } from "./commentService.js";
import { ctxCommentEditorFocused, SimpleCommentEditor } from "./simpleCommentEditor.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { CommentController, ID } from "./commentsController.js";
import { Range } from "../../../../editor/common/core/range.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { CommentContextKeys } from "../common/commentContextKeys.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../platform/accessibility/common/accessibility.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { accessibilityHelpIsShown, accessibleViewCurrentProviderId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { CommentCommandId } from "../common/commentCommandIds.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { CommentsInputContentProvider } from "./commentsInputContentProvider.js";
import { AccessibleViewProviderId } from "../../../../platform/accessibility/browser/accessibleView.js";
import { CommentWidgetFocus } from "./commentThreadZoneWidget.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { CommentThreadCollapsibleState, CommentThreadState } from "../../../../editor/common/languages.js";
registerEditorContribution(ID, CommentController, EditorContributionInstantiation.AfterFirstRender);
registerWorkbenchContribution2(CommentsInputContentProvider.ID, CommentsInputContentProvider, WorkbenchPhase.BlockRestore);
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: CommentCommandId.NextThread,
  handler: async (accessor, args) => {
    const activeEditor = getActiveEditor(accessor);
    if (!activeEditor) {
      return Promise.resolve();
    }
    const controller = CommentController.get(activeEditor);
    if (!controller) {
      return Promise.resolve();
    }
    controller.nextCommentThread(true);
  },
  weight: KeybindingWeight.EditorContrib,
  primary: KeyMod.Alt | KeyCode.F9
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: CommentCommandId.PreviousThread,
  handler: async (accessor, args) => {
    const activeEditor = getActiveEditor(accessor);
    if (!activeEditor) {
      return Promise.resolve();
    }
    const controller = CommentController.get(activeEditor);
    if (!controller) {
      return Promise.resolve();
    }
    controller.previousCommentThread(true);
  },
  weight: KeybindingWeight.EditorContrib,
  primary: KeyMod.Shift | KeyMod.Alt | KeyCode.F9
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: CommentCommandId.NextCommentedRange,
      title: {
        value: nls.localize("comments.NextCommentedRange", "Go to Next Commented Range"),
        original: "Go to Next Commented Range"
      },
      category: {
        value: nls.localize("commentsCategory", "Comments"),
        original: "Comments"
      },
      menu: [{
        id: MenuId.CommandPalette,
        when: CommentContextKeys.activeEditorHasCommentingRange
      }],
      keybinding: {
        primary: KeyMod.Alt | KeyCode.F10,
        weight: KeybindingWeight.EditorContrib,
        when: CommentContextKeys.activeEditorHasCommentingRange
      }
    });
  }
  run(accessor, ...args) {
    const activeEditor = getActiveEditor(accessor);
    if (!activeEditor) {
      return;
    }
    const controller = CommentController.get(activeEditor);
    if (!controller) {
      return;
    }
    controller.nextCommentThread(false);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: CommentCommandId.PreviousCommentedRange,
      title: {
        value: nls.localize("comments.previousCommentedRange", "Go to Previous Commented Range"),
        original: "Go to Previous Commented Range"
      },
      category: {
        value: nls.localize("commentsCategory", "Comments"),
        original: "Comments"
      },
      menu: [{
        id: MenuId.CommandPalette,
        when: CommentContextKeys.activeEditorHasCommentingRange
      }],
      keybinding: {
        primary: KeyMod.Shift | KeyMod.Alt | KeyCode.F10,
        weight: KeybindingWeight.EditorContrib,
        when: CommentContextKeys.activeEditorHasCommentingRange
      }
    });
  }
  run(accessor, ...args) {
    const activeEditor = getActiveEditor(accessor);
    if (!activeEditor) {
      return;
    }
    const controller = CommentController.get(activeEditor);
    if (!controller) {
      return;
    }
    controller.previousCommentThread(false);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: CommentCommandId.NextRange,
      title: {
        value: nls.localize("comments.nextCommentingRange", "Go to Next Commenting Range"),
        original: "Go to Next Commenting Range"
      },
      category: {
        value: nls.localize("commentsCategory", "Comments"),
        original: "Comments"
      },
      menu: [{
        id: MenuId.CommandPalette,
        when: CommentContextKeys.activeEditorHasCommentingRange
      }],
      keybinding: {
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.DownArrow),
        weight: KeybindingWeight.EditorContrib,
        when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, ContextKeyExpr.or(EditorContextKeys.focus, CommentContextKeys.commentFocused, ContextKeyExpr.and(accessibilityHelpIsShown, accessibleViewCurrentProviderId.isEqualTo(AccessibleViewProviderId.Comments))))
      }
    });
  }
  run(accessor, args) {
    const activeEditor = getActiveEditor(accessor);
    if (!activeEditor) {
      return;
    }
    const controller = CommentController.get(activeEditor);
    if (!controller) {
      return;
    }
    controller.nextCommentingRange();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: CommentCommandId.PreviousRange,
      title: {
        value: nls.localize("comments.previousCommentingRange", "Go to Previous Commenting Range"),
        original: "Go to Previous Commenting Range"
      },
      category: {
        value: nls.localize("commentsCategory", "Comments"),
        original: "Comments"
      },
      menu: [{
        id: MenuId.CommandPalette,
        when: CommentContextKeys.activeEditorHasCommentingRange
      }],
      keybinding: {
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.UpArrow),
        weight: KeybindingWeight.EditorContrib,
        when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, ContextKeyExpr.or(EditorContextKeys.focus, CommentContextKeys.commentFocused, ContextKeyExpr.and(accessibilityHelpIsShown, accessibleViewCurrentProviderId.isEqualTo(AccessibleViewProviderId.Comments))))
      }
    });
  }
  async run(accessor, ...args) {
    const activeEditor = getActiveEditor(accessor);
    if (!activeEditor) {
      return;
    }
    const controller = CommentController.get(activeEditor);
    if (!controller) {
      return;
    }
    controller.previousCommentingRange();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: CommentCommandId.ToggleCommenting,
      title: {
        value: nls.localize("comments.toggleCommenting", "Toggle Editor Commenting"),
        original: "Toggle Editor Commenting"
      },
      category: {
        value: nls.localize("commentsCategory", "Comments"),
        original: "Comments"
      },
      menu: [{
        id: MenuId.CommandPalette,
        when: CommentContextKeys.WorkspaceHasCommenting
      }]
    });
  }
  run(accessor, ...args) {
    const commentService = accessor.get(ICommentService);
    const enable = commentService.isCommentingEnabled;
    commentService.enableCommenting(!enable);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: CommentCommandId.Add,
      title: {
        value: nls.localize("comments.addCommand", "Add Comment on Current Selection"),
        original: "Add Comment on Current Selection"
      },
      category: {
        value: nls.localize("commentsCategory", "Comments"),
        original: "Comments"
      },
      menu: [{
        id: MenuId.CommandPalette,
        when: CommentContextKeys.activeCursorHasCommentingRange
      }],
      keybinding: {
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC),
        weight: KeybindingWeight.EditorContrib,
        when: CommentContextKeys.activeCursorHasCommentingRange
      }
    });
  }
  async run(accessor, args) {
    const activeEditor = getActiveEditor(accessor);
    if (!activeEditor) {
      return;
    }
    const controller = CommentController.get(activeEditor);
    if (!controller) {
      return;
    }
    const position = args?.range ? new Range(args.range.startLineNumber, args.range.startLineNumber, args.range.endLineNumber, args.range.endColumn) : args?.fileComment ? void 0 : activeEditor.getSelection();
    await controller.addOrToggleCommentAtLine(position, void 0);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: CommentCommandId.FocusCommentOnCurrentLine,
      title: {
        value: nls.localize("comments.focusCommentOnCurrentLine", "Focus Comment on Current Line"),
        original: "Focus Comment on Current Line"
      },
      category: {
        value: nls.localize("commentsCategory", "Comments"),
        original: "Comments"
      },
      f1: true,
      precondition: CommentContextKeys.activeCursorHasComment
    });
  }
  async run(accessor, ...args) {
    const activeEditor = getActiveEditor(accessor);
    if (!activeEditor) {
      return;
    }
    const controller = CommentController.get(activeEditor);
    if (!controller) {
      return;
    }
    const position = activeEditor.getSelection();
    const notificationService = accessor.get(INotificationService);
    let error = false;
    try {
      const commentAtLine = controller.getCommentsAtLine(position);
      if (commentAtLine.length === 0) {
        error = true;
      } else {
        await controller.revealCommentThread(commentAtLine[0].commentThread.threadId, void 0, false, CommentWidgetFocus.Widget);
      }
    } catch (e) {
      error = true;
    }
    if (error) {
      notificationService.error(nls.localize("comments.focusCommand.error", "The cursor must be on a line with a comment to focus the comment"));
    }
  }
});
function changeAllCollapseState(commentService, newState) {
  for (const resource of commentService.commentsModel.resourceCommentThreads) {
    for (const thread of resource.commentThreads) {
      thread.thread.collapsibleState = newState(thread.thread);
    }
  }
}
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: CommentCommandId.CollapseAll,
      title: {
        value: nls.localize("comments.collapseAll", "Collapse All Comments"),
        original: "Collapse All Comments"
      },
      category: {
        value: nls.localize("commentsCategory", "Comments"),
        original: "Comments"
      },
      menu: [{
        id: MenuId.CommandPalette,
        when: CommentContextKeys.WorkspaceHasCommenting
      }]
    });
  }
  run(accessor, ...args) {
    const commentService = accessor.get(ICommentService);
    changeAllCollapseState(commentService, () => CommentThreadCollapsibleState.Collapsed);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: CommentCommandId.ExpandAll,
      title: {
        value: nls.localize("comments.expandAll", "Expand All Comments"),
        original: "Expand All Comments"
      },
      category: {
        value: nls.localize("commentsCategory", "Comments"),
        original: "Comments"
      },
      menu: [{
        id: MenuId.CommandPalette,
        when: CommentContextKeys.WorkspaceHasCommenting
      }]
    });
  }
  run(accessor, ...args) {
    const commentService = accessor.get(ICommentService);
    changeAllCollapseState(commentService, () => CommentThreadCollapsibleState.Expanded);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: CommentCommandId.ExpandUnresolved,
      title: {
        value: nls.localize("comments.expandUnresolved", "Expand Unresolved Comments"),
        original: "Expand Unresolved Comments"
      },
      category: {
        value: nls.localize("commentsCategory", "Comments"),
        original: "Comments"
      },
      menu: [{
        id: MenuId.CommandPalette,
        when: CommentContextKeys.WorkspaceHasCommenting
      }]
    });
  }
  run(accessor, ...args) {
    const commentService = accessor.get(ICommentService);
    changeAllCollapseState(commentService, (commentThread) => {
      return commentThread.state === CommentThreadState.Unresolved ? CommentThreadCollapsibleState.Expanded : CommentThreadCollapsibleState.Collapsed;
    });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: CommentCommandId.Submit,
  weight: KeybindingWeight.EditorContrib,
  primary: KeyMod.CtrlCmd | KeyCode.Enter,
  when: ctxCommentEditorFocused,
  handler: (accessor, args) => {
    const activeCodeEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
    if (activeCodeEditor instanceof SimpleCommentEditor) {
      activeCodeEditor.getParentThread().submitComment();
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: CommentCommandId.Hide,
  weight: KeybindingWeight.EditorContrib,
  primary: KeyCode.Escape,
  secondary: [KeyMod.Shift | KeyCode.Escape],
  when: ContextKeyExpr.or(ctxCommentEditorFocused, CommentContextKeys.commentFocused),
  handler: async (accessor, args) => {
    const activeCodeEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
    const keybindingService = accessor.get(IKeybindingService);
    const notificationService = accessor.get(INotificationService);
    const commentService = accessor.get(ICommentService);
    await keybindingService.enableKeybindingHoldMode(CommentCommandId.Hide);
    if (activeCodeEditor instanceof SimpleCommentEditor) {
      activeCodeEditor.getParentThread().collapse();
    } else if (activeCodeEditor) {
      const controller = CommentController.get(activeCodeEditor);
      if (!controller) {
        return;
      }
      let error = false;
      try {
        const activeComment = commentService.lastActiveCommentcontroller?.activeComment;
        if (!activeComment) {
          error = true;
        } else {
          controller.collapseAndFocusRange(activeComment.thread.threadId);
        }
      } catch (e) {
        error = true;
      }
      if (error) {
        notificationService.error(nls.localize("comments.focusCommand.error", "The cursor must be on a line with a comment to focus the comment"));
      }
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: CommentCommandId.Hide,
  weight: KeybindingWeight.EditorContrib,
  primary: KeyMod.CtrlCmd | KeyCode.Escape,
  win: { primary: KeyMod.Alt | KeyCode.Backspace },
  when: ContextKeyExpr.and(EditorContextKeys.focus, CommentContextKeys.commentWidgetVisible),
  handler: async (accessor, args) => {
    const activeCodeEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
    const keybindingService = accessor.get(IKeybindingService);
    await keybindingService.enableKeybindingHoldMode(CommentCommandId.Hide);
    if (activeCodeEditor) {
      const controller = CommentController.get(activeCodeEditor);
      if (controller) {
        await controller.collapseVisibleComments();
      }
    }
  }
});
function getActiveEditor(accessor) {
  let activeTextEditorControl = accessor.get(IEditorService).activeTextEditorControl;
  if (isDiffEditor(activeTextEditorControl)) {
    if (activeTextEditorControl.getOriginalEditor().hasTextFocus()) {
      activeTextEditorControl = activeTextEditorControl.getOriginalEditor();
    } else {
      activeTextEditorControl = activeTextEditorControl.getModifiedEditor();
    }
  }
  if (!isCodeEditor(activeTextEditorControl) || !activeTextEditorControl.hasModel()) {
    return null;
  }
  return activeTextEditorControl;
}
export {
  getActiveEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvbW1lbnRzXFxicm93c2VyXFxjb21tZW50c0VkaXRvckNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEtleUNob3JkLCBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvcmV2aWV3LmNzcyc7XG5pbXBvcnQgeyBJQWN0aXZlQ29kZUVkaXRvciwgaXNDb2RlRWRpdG9yLCBpc0RpZmZFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24sIHJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdzUmVnaXN0cnksIEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb21tZW50U2VydmljZSB9IGZyb20gJy4vY29tbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3R4Q29tbWVudEVkaXRvckZvY3VzZWQsIFNpbXBsZUNvbW1lbnRFZGl0b3IgfSBmcm9tICcuL3NpbXBsZUNvbW1lbnRFZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDb21tZW50Q29udHJvbGxlciwgSUQgfSBmcm9tICcuL2NvbW1lbnRzQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgQ29tbWVudENvbnRleHRLZXlzIH0gZnJvbSAnLi4vY29tbW9uL2NvbW1lbnRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVEIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgYWNjZXNzaWJpbGl0eUhlbHBJc1Nob3duLCBhY2Nlc3NpYmxlVmlld0N1cnJlbnRQcm92aWRlcklkIH0gZnJvbSAnLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbW1lbnRDb21tYW5kSWQgfSBmcm9tICcuLi9jb21tb24vY29tbWVudENvbW1hbmRJZHMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yLCBXb3JrYmVuY2hQaGFzZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IENvbW1lbnRzSW5wdXRDb250ZW50UHJvdmlkZXIgfSBmcm9tICcuL2NvbW1lbnRzSW5wdXRDb250ZW50UHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3LmpzJztcbmltcG9ydCB7IENvbW1lbnRXaWRnZXRGb2N1cyB9IGZyb20gJy4vY29tbWVudFRocmVhZFpvbmVXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBDb21tZW50VGhyZWFkLCBDb21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZSwgQ29tbWVudFRocmVhZFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuXG5yZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbihJRCwgQ29tbWVudENvbnRyb2xsZXIsIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24uQWZ0ZXJGaXJzdFJlbmRlcik7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ29tbWVudHNJbnB1dENvbnRlbnRQcm92aWRlci5JRCwgQ29tbWVudHNJbnB1dENvbnRlbnRQcm92aWRlciwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBDb21tZW50Q29tbWFuZElkLk5leHRUaHJlYWQsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvciwgYXJncz86IHsgcmFuZ2U6IElSYW5nZTsgZmlsZUNvbW1lbnQ6IGJvb2xlYW4gfSkgPT4ge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGdldEFjdGl2ZUVkaXRvcihhY2Nlc3Nvcik7XG5cdFx0aWYgKCFhY3RpdmVFZGl0b3IpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gQ29tbWVudENvbnRyb2xsZXIuZ2V0KGFjdGl2ZUVkaXRvcik7XG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXHRcdGNvbnRyb2xsZXIubmV4dENvbW1lbnRUaHJlYWQodHJ1ZSk7XG5cdH0sXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliLFxuXHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5GOSxcbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IENvbW1lbnRDb21tYW5kSWQuUHJldmlvdXNUaHJlYWQsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvciwgYXJncz86IHsgcmFuZ2U6IElSYW5nZTsgZmlsZUNvbW1lbnQ6IGJvb2xlYW4gfSkgPT4ge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGdldEFjdGl2ZUVkaXRvcihhY2Nlc3Nvcik7XG5cdFx0aWYgKCFhY3RpdmVFZGl0b3IpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gQ29tbWVudENvbnRyb2xsZXIuZ2V0KGFjdGl2ZUVkaXRvcik7XG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXHRcdGNvbnRyb2xsZXIucHJldmlvdXNDb21tZW50VGhyZWFkKHRydWUpO1xuXHR9LFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuRjlcbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbW1lbnRDb21tYW5kSWQuTmV4dENvbW1lbnRlZFJhbmdlLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY29tbWVudHMuTmV4dENvbW1lbnRlZFJhbmdlJywgXCJHbyB0byBOZXh0IENvbW1lbnRlZCBSYW5nZVwiKSxcblx0XHRcdFx0b3JpZ2luYWw6ICdHbyB0byBOZXh0IENvbW1lbnRlZCBSYW5nZSdcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeToge1xuXHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjb21tZW50c0NhdGVnb3J5JywgXCJDb21tZW50c1wiKSxcblx0XHRcdFx0b3JpZ2luYWw6ICdDb21tZW50cydcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDb21tZW50Q29udGV4dEtleXMuYWN0aXZlRWRpdG9ySGFzQ29tbWVudGluZ1JhbmdlXG5cdFx0XHR9XSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuRjEwLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0XHRcdFx0d2hlbjogQ29tbWVudENvbnRleHRLZXlzLmFjdGl2ZUVkaXRvckhhc0NvbW1lbnRpbmdSYW5nZVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gZ2V0QWN0aXZlRWRpdG9yKGFjY2Vzc29yKTtcblx0XHRpZiAoIWFjdGl2ZUVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBDb21tZW50Q29udHJvbGxlci5nZXQoYWN0aXZlRWRpdG9yKTtcblx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29udHJvbGxlci5uZXh0Q29tbWVudFRocmVhZChmYWxzZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbW1lbnRDb21tYW5kSWQuUHJldmlvdXNDb21tZW50ZWRSYW5nZSxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NvbW1lbnRzLnByZXZpb3VzQ29tbWVudGVkUmFuZ2UnLCBcIkdvIHRvIFByZXZpb3VzIENvbW1lbnRlZCBSYW5nZVwiKSxcblx0XHRcdFx0b3JpZ2luYWw6ICdHbyB0byBQcmV2aW91cyBDb21tZW50ZWQgUmFuZ2UnXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IHtcblx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY29tbWVudHNDYXRlZ29yeScsIFwiQ29tbWVudHNcIiksXG5cdFx0XHRcdG9yaWdpbmFsOiAnQ29tbWVudHMnXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29tbWVudENvbnRleHRLZXlzLmFjdGl2ZUVkaXRvckhhc0NvbW1lbnRpbmdSYW5nZVxuXHRcdFx0fV0sXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLkYxMCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIsXG5cdFx0XHRcdHdoZW46IENvbW1lbnRDb250ZXh0S2V5cy5hY3RpdmVFZGl0b3JIYXNDb21tZW50aW5nUmFuZ2Vcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGdldEFjdGl2ZUVkaXRvcihhY2Nlc3Nvcik7XG5cdFx0aWYgKCFhY3RpdmVFZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gQ29tbWVudENvbnRyb2xsZXIuZ2V0KGFjdGl2ZUVkaXRvcik7XG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnRyb2xsZXIucHJldmlvdXNDb21tZW50VGhyZWFkKGZhbHNlKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29tbWVudENvbW1hbmRJZC5OZXh0UmFuZ2UsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjb21tZW50cy5uZXh0Q29tbWVudGluZ1JhbmdlJywgXCJHbyB0byBOZXh0IENvbW1lbnRpbmcgUmFuZ2VcIiksXG5cdFx0XHRcdG9yaWdpbmFsOiAnR28gdG8gTmV4dCBDb21tZW50aW5nIFJhbmdlJ1xuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiB7XG5cdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NvbW1lbnRzQ2F0ZWdvcnknLCBcIkNvbW1lbnRzXCIpLFxuXHRcdFx0XHRvcmlnaW5hbDogJ0NvbW1lbnRzJ1xuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbW1lbnRDb250ZXh0S2V5cy5hY3RpdmVFZGl0b3JIYXNDb21tZW50aW5nUmFuZ2Vcblx0XHRcdH1dLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5Eb3duQXJyb3cpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQsIENvbnRleHRLZXlFeHByLm9yKEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLCBDb21tZW50Q29udGV4dEtleXMuY29tbWVudEZvY3VzZWQsIENvbnRleHRLZXlFeHByLmFuZChhY2Nlc3NpYmlsaXR5SGVscElzU2hvd24sIGFjY2Vzc2libGVWaWV3Q3VycmVudFByb3ZpZGVySWQuaXNFcXVhbFRvKEFjY2Vzc2libGVWaWV3UHJvdmlkZXJJZC5Db21tZW50cykpKSlcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJncz86IHsgcmFuZ2U6IElSYW5nZTsgZmlsZUNvbW1lbnQ6IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGdldEFjdGl2ZUVkaXRvcihhY2Nlc3Nvcik7XG5cdFx0aWYgKCFhY3RpdmVFZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gQ29tbWVudENvbnRyb2xsZXIuZ2V0KGFjdGl2ZUVkaXRvcik7XG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnRyb2xsZXIubmV4dENvbW1lbnRpbmdSYW5nZSgpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb21tZW50Q29tbWFuZElkLlByZXZpb3VzUmFuZ2UsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjb21tZW50cy5wcmV2aW91c0NvbW1lbnRpbmdSYW5nZScsIFwiR28gdG8gUHJldmlvdXMgQ29tbWVudGluZyBSYW5nZVwiKSxcblx0XHRcdFx0b3JpZ2luYWw6ICdHbyB0byBQcmV2aW91cyBDb21tZW50aW5nIFJhbmdlJ1xuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiB7XG5cdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NvbW1lbnRzQ2F0ZWdvcnknLCBcIkNvbW1lbnRzXCIpLFxuXHRcdFx0XHRvcmlnaW5hbDogJ0NvbW1lbnRzJ1xuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbW1lbnRDb250ZXh0S2V5cy5hY3RpdmVFZGl0b3JIYXNDb21tZW50aW5nUmFuZ2Vcblx0XHRcdH1dLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5VcEFycm93KSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVELCBDb250ZXh0S2V5RXhwci5vcihFZGl0b3JDb250ZXh0S2V5cy5mb2N1cywgQ29tbWVudENvbnRleHRLZXlzLmNvbW1lbnRGb2N1c2VkLCBDb250ZXh0S2V5RXhwci5hbmQoYWNjZXNzaWJpbGl0eUhlbHBJc1Nob3duLCBhY2Nlc3NpYmxlVmlld0N1cnJlbnRQcm92aWRlcklkLmlzRXF1YWxUbyhBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQuQ29tbWVudHMpKSkpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGdldEFjdGl2ZUVkaXRvcihhY2Nlc3Nvcik7XG5cdFx0aWYgKCFhY3RpdmVFZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gQ29tbWVudENvbnRyb2xsZXIuZ2V0KGFjdGl2ZUVkaXRvcik7XG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnRyb2xsZXIucHJldmlvdXNDb21tZW50aW5nUmFuZ2UoKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29tbWVudENvbW1hbmRJZC5Ub2dnbGVDb21tZW50aW5nLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY29tbWVudHMudG9nZ2xlQ29tbWVudGluZycsIFwiVG9nZ2xlIEVkaXRvciBDb21tZW50aW5nXCIpLFxuXHRcdFx0XHRvcmlnaW5hbDogJ1RvZ2dsZSBFZGl0b3IgQ29tbWVudGluZydcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeToge1xuXHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjb21tZW50c0NhdGVnb3J5JywgXCJDb21tZW50c1wiKSxcblx0XHRcdFx0b3JpZ2luYWw6ICdDb21tZW50cydcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDb21tZW50Q29udGV4dEtleXMuV29ya3NwYWNlSGFzQ29tbWVudGluZ1xuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbW1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tZW50U2VydmljZSk7XG5cdFx0Y29uc3QgZW5hYmxlID0gY29tbWVudFNlcnZpY2UuaXNDb21tZW50aW5nRW5hYmxlZDtcblx0XHRjb21tZW50U2VydmljZS5lbmFibGVDb21tZW50aW5nKCFlbmFibGUpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb21tZW50Q29tbWFuZElkLkFkZCxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NvbW1lbnRzLmFkZENvbW1hbmQnLCBcIkFkZCBDb21tZW50IG9uIEN1cnJlbnQgU2VsZWN0aW9uXCIpLFxuXHRcdFx0XHRvcmlnaW5hbDogJ0FkZCBDb21tZW50IG9uIEN1cnJlbnQgU2VsZWN0aW9uJ1xuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiB7XG5cdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NvbW1lbnRzQ2F0ZWdvcnknLCBcIkNvbW1lbnRzXCIpLFxuXHRcdFx0XHRvcmlnaW5hbDogJ0NvbW1lbnRzJ1xuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbW1lbnRDb250ZXh0S2V5cy5hY3RpdmVDdXJzb3JIYXNDb21tZW50aW5nUmFuZ2Vcblx0XHRcdH1dLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlDKSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIsXG5cdFx0XHRcdHdoZW46IENvbW1lbnRDb250ZXh0S2V5cy5hY3RpdmVDdXJzb3JIYXNDb21tZW50aW5nUmFuZ2Vcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJncz86IHsgcmFuZ2U6IElSYW5nZTsgZmlsZUNvbW1lbnQ6IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGdldEFjdGl2ZUVkaXRvcihhY2Nlc3Nvcik7XG5cdFx0aWYgKCFhY3RpdmVFZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gQ29tbWVudENvbnRyb2xsZXIuZ2V0KGFjdGl2ZUVkaXRvcik7XG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSBhcmdzPy5yYW5nZSA/IG5ldyBSYW5nZShhcmdzLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgYXJncy5yYW5nZS5zdGFydExpbmVOdW1iZXIsIGFyZ3MucmFuZ2UuZW5kTGluZU51bWJlciwgYXJncy5yYW5nZS5lbmRDb2x1bW4pXG5cdFx0XHQ6IChhcmdzPy5maWxlQ29tbWVudCA/IHVuZGVmaW5lZCA6IGFjdGl2ZUVkaXRvci5nZXRTZWxlY3Rpb24oKSk7XG5cdFx0YXdhaXQgY29udHJvbGxlci5hZGRPclRvZ2dsZUNvbW1lbnRBdExpbmUocG9zaXRpb24sIHVuZGVmaW5lZCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbW1lbnRDb21tYW5kSWQuRm9jdXNDb21tZW50T25DdXJyZW50TGluZSxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NvbW1lbnRzLmZvY3VzQ29tbWVudE9uQ3VycmVudExpbmUnLCBcIkZvY3VzIENvbW1lbnQgb24gQ3VycmVudCBMaW5lXCIpLFxuXHRcdFx0XHRvcmlnaW5hbDogJ0ZvY3VzIENvbW1lbnQgb24gQ3VycmVudCBMaW5lJ1xuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiB7XG5cdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NvbW1lbnRzQ2F0ZWdvcnknLCBcIkNvbW1lbnRzXCIpLFxuXHRcdFx0XHRvcmlnaW5hbDogJ0NvbW1lbnRzJ1xuXHRcdFx0fSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb21tZW50Q29udGV4dEtleXMuYWN0aXZlQ3Vyc29ySGFzQ29tbWVudCxcblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGdldEFjdGl2ZUVkaXRvcihhY2Nlc3Nvcik7XG5cdFx0aWYgKCFhY3RpdmVFZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gQ29tbWVudENvbnRyb2xsZXIuZ2V0KGFjdGl2ZUVkaXRvcik7XG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHBvc2l0aW9uID0gYWN0aXZlRWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGxldCBlcnJvciA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb21tZW50QXRMaW5lID0gY29udHJvbGxlci5nZXRDb21tZW50c0F0TGluZShwb3NpdGlvbik7XG5cdFx0XHRpZiAoY29tbWVudEF0TGluZS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0ZXJyb3IgPSB0cnVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgY29udHJvbGxlci5yZXZlYWxDb21tZW50VGhyZWFkKGNvbW1lbnRBdExpbmVbMF0uY29tbWVudFRocmVhZC50aHJlYWRJZCwgdW5kZWZpbmVkLCBmYWxzZSwgQ29tbWVudFdpZGdldEZvY3VzLldpZGdldCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0ZXJyb3IgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobmxzLmxvY2FsaXplKCdjb21tZW50cy5mb2N1c0NvbW1hbmQuZXJyb3InLCBcIlRoZSBjdXJzb3IgbXVzdCBiZSBvbiBhIGxpbmUgd2l0aCBhIGNvbW1lbnQgdG8gZm9jdXMgdGhlIGNvbW1lbnRcIikpO1xuXHRcdH1cblx0fVxufSk7XG5cbmZ1bmN0aW9uIGNoYW5nZUFsbENvbGxhcHNlU3RhdGUoY29tbWVudFNlcnZpY2U6IElDb21tZW50U2VydmljZSwgbmV3U3RhdGU6IChjb21tZW50VGhyZWFkOiBDb21tZW50VGhyZWFkKSA9PiBDb21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZSkge1xuXHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIGNvbW1lbnRTZXJ2aWNlLmNvbW1lbnRzTW9kZWwucmVzb3VyY2VDb21tZW50VGhyZWFkcykge1xuXHRcdGZvciAoY29uc3QgdGhyZWFkIG9mIHJlc291cmNlLmNvbW1lbnRUaHJlYWRzKSB7XG5cdFx0XHR0aHJlYWQudGhyZWFkLmNvbGxhcHNpYmxlU3RhdGUgPSBuZXdTdGF0ZSh0aHJlYWQudGhyZWFkKTtcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb21tZW50Q29tbWFuZElkLkNvbGxhcHNlQWxsLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY29tbWVudHMuY29sbGFwc2VBbGwnLCBcIkNvbGxhcHNlIEFsbCBDb21tZW50c1wiKSxcblx0XHRcdFx0b3JpZ2luYWw6ICdDb2xsYXBzZSBBbGwgQ29tbWVudHMnXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IHtcblx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY29tbWVudHNDYXRlZ29yeScsIFwiQ29tbWVudHNcIiksXG5cdFx0XHRcdG9yaWdpbmFsOiAnQ29tbWVudHMnXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29tbWVudENvbnRleHRLZXlzLldvcmtzcGFjZUhhc0NvbW1lbnRpbmdcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRjb25zdCBjb21tZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWVudFNlcnZpY2UpO1xuXHRcdGNoYW5nZUFsbENvbGxhcHNlU3RhdGUoY29tbWVudFNlcnZpY2UsICgpID0+IENvbW1lbnRUaHJlYWRDb2xsYXBzaWJsZVN0YXRlLkNvbGxhcHNlZCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbW1lbnRDb21tYW5kSWQuRXhwYW5kQWxsLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY29tbWVudHMuZXhwYW5kQWxsJywgXCJFeHBhbmQgQWxsIENvbW1lbnRzXCIpLFxuXHRcdFx0XHRvcmlnaW5hbDogJ0V4cGFuZCBBbGwgQ29tbWVudHMnXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IHtcblx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY29tbWVudHNDYXRlZ29yeScsIFwiQ29tbWVudHNcIiksXG5cdFx0XHRcdG9yaWdpbmFsOiAnQ29tbWVudHMnXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29tbWVudENvbnRleHRLZXlzLldvcmtzcGFjZUhhc0NvbW1lbnRpbmdcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRjb25zdCBjb21tZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWVudFNlcnZpY2UpO1xuXHRcdGNoYW5nZUFsbENvbGxhcHNlU3RhdGUoY29tbWVudFNlcnZpY2UsICgpID0+IENvbW1lbnRUaHJlYWRDb2xsYXBzaWJsZVN0YXRlLkV4cGFuZGVkKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29tbWVudENvbW1hbmRJZC5FeHBhbmRVbnJlc29sdmVkLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY29tbWVudHMuZXhwYW5kVW5yZXNvbHZlZCcsIFwiRXhwYW5kIFVucmVzb2x2ZWQgQ29tbWVudHNcIiksXG5cdFx0XHRcdG9yaWdpbmFsOiAnRXhwYW5kIFVucmVzb2x2ZWQgQ29tbWVudHMnXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IHtcblx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY29tbWVudHNDYXRlZ29yeScsIFwiQ29tbWVudHNcIiksXG5cdFx0XHRcdG9yaWdpbmFsOiAnQ29tbWVudHMnXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29tbWVudENvbnRleHRLZXlzLldvcmtzcGFjZUhhc0NvbW1lbnRpbmdcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRjb25zdCBjb21tZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWVudFNlcnZpY2UpO1xuXHRcdGNoYW5nZUFsbENvbGxhcHNlU3RhdGUoY29tbWVudFNlcnZpY2UsIChjb21tZW50VGhyZWFkKSA9PiB7XG5cdFx0XHRyZXR1cm4gY29tbWVudFRocmVhZC5zdGF0ZSA9PT0gQ29tbWVudFRocmVhZFN0YXRlLlVucmVzb2x2ZWQgPyBDb21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZS5FeHBhbmRlZCA6IENvbW1lbnRUaHJlYWRDb2xsYXBzaWJsZVN0YXRlLkNvbGxhcHNlZDtcblx0XHR9KTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogQ29tbWVudENvbW1hbmRJZC5TdWJtaXQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRW50ZXIsXG5cdHdoZW46IGN0eENvbW1lbnRFZGl0b3JGb2N1c2VkLFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IsIGFyZ3MpID0+IHtcblx0XHRjb25zdCBhY3RpdmVDb2RlRWRpdG9yID0gYWNjZXNzb3IuZ2V0KElDb2RlRWRpdG9yU2VydmljZSkuZ2V0Rm9jdXNlZENvZGVFZGl0b3IoKTtcblx0XHRpZiAoYWN0aXZlQ29kZUVkaXRvciBpbnN0YW5jZW9mIFNpbXBsZUNvbW1lbnRFZGl0b3IpIHtcblx0XHRcdGFjdGl2ZUNvZGVFZGl0b3IuZ2V0UGFyZW50VGhyZWFkKCkuc3VibWl0Q29tbWVudCgpO1xuXHRcdH1cblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogQ29tbWVudENvbW1hbmRJZC5IaWRlLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdHNlY29uZGFyeTogW0tleU1vZC5TaGlmdCB8IEtleUNvZGUuRXNjYXBlXSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoY3R4Q29tbWVudEVkaXRvckZvY3VzZWQsIENvbW1lbnRDb250ZXh0S2V5cy5jb21tZW50Rm9jdXNlZCksXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvciwgYXJncykgPT4ge1xuXHRcdGNvbnN0IGFjdGl2ZUNvZGVFZGl0b3IgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKS5nZXRGb2N1c2VkQ29kZUVkaXRvcigpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElLZXliaW5kaW5nU2VydmljZSk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgY29tbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1lbnRTZXJ2aWNlKTtcblx0XHQvLyBVbmZvcnR1bmF0ZSwgYnV0IGNvbGxhcHNpbmcgdGhlIGNvbW1lbnQgdGhyZWFkIG1pZ2h0IGNhdXNlIGEgZGlhbG9nIHRvIHNob3dcblx0XHQvLyBJZiB3ZSBkb24ndCB3YWl0IGZvciB0aGUga2V5IHVwIGhlcmUsIHRoZW4gdGhlIGRpYWxvZyB3aWxsIGNvbnN1bWUgaXQgYW5kIGltbWVkaWF0ZWx5IGNsb3NlXG5cdFx0YXdhaXQga2V5YmluZGluZ1NlcnZpY2UuZW5hYmxlS2V5YmluZGluZ0hvbGRNb2RlKENvbW1lbnRDb21tYW5kSWQuSGlkZSk7XG5cdFx0aWYgKGFjdGl2ZUNvZGVFZGl0b3IgaW5zdGFuY2VvZiBTaW1wbGVDb21tZW50RWRpdG9yKSB7XG5cdFx0XHRhY3RpdmVDb2RlRWRpdG9yLmdldFBhcmVudFRocmVhZCgpLmNvbGxhcHNlKCk7XG5cdFx0fSBlbHNlIGlmIChhY3RpdmVDb2RlRWRpdG9yKSB7XG5cdFx0XHRjb25zdCBjb250cm9sbGVyID0gQ29tbWVudENvbnRyb2xsZXIuZ2V0KGFjdGl2ZUNvZGVFZGl0b3IpO1xuXHRcdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGVycm9yID0gZmFsc2U7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBhY3RpdmVDb21tZW50ID0gY29tbWVudFNlcnZpY2UubGFzdEFjdGl2ZUNvbW1lbnRjb250cm9sbGVyPy5hY3RpdmVDb21tZW50O1xuXHRcdFx0XHRpZiAoIWFjdGl2ZUNvbW1lbnQpIHtcblx0XHRcdFx0XHRlcnJvciA9IHRydWU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29udHJvbGxlci5jb2xsYXBzZUFuZEZvY3VzUmFuZ2UoYWN0aXZlQ29tbWVudC50aHJlYWQudGhyZWFkSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGVycm9yID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChlcnJvcikge1xuXHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKG5scy5sb2NhbGl6ZSgnY29tbWVudHMuZm9jdXNDb21tYW5kLmVycm9yJywgXCJUaGUgY3Vyc29yIG11c3QgYmUgb24gYSBsaW5lIHdpdGggYSBjb21tZW50IHRvIGZvY3VzIHRoZSBjb21tZW50XCIpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IENvbW1lbnRDb21tYW5kSWQuSGlkZSxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIsXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Fc2NhcGUsXG5cdHdpbjogeyBwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5CYWNrc3BhY2UgfSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLCBDb21tZW50Q29udGV4dEtleXMuY29tbWVudFdpZGdldFZpc2libGUpLFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIGFyZ3MpID0+IHtcblx0XHRjb25zdCBhY3RpdmVDb2RlRWRpdG9yID0gYWNjZXNzb3IuZ2V0KElDb2RlRWRpdG9yU2VydmljZSkuZ2V0Rm9jdXNlZENvZGVFZGl0b3IoKTtcblx0XHRjb25zdCBrZXliaW5kaW5nU2VydmljZSA9IGFjY2Vzc29yLmdldChJS2V5YmluZGluZ1NlcnZpY2UpO1xuXHRcdC8vIFVuZm9ydHVuYXRlLCBidXQgY29sbGFwc2luZyB0aGUgY29tbWVudCB0aHJlYWQgbWlnaHQgY2F1c2UgYSBkaWFsb2cgdG8gc2hvd1xuXHRcdC8vIElmIHdlIGRvbid0IHdhaXQgZm9yIHRoZSBrZXkgdXAgaGVyZSwgdGhlbiB0aGUgZGlhbG9nIHdpbGwgY29uc3VtZSBpdCBhbmQgaW1tZWRpYXRlbHkgY2xvc2Vcblx0XHRhd2FpdCBrZXliaW5kaW5nU2VydmljZS5lbmFibGVLZXliaW5kaW5nSG9sZE1vZGUoQ29tbWVudENvbW1hbmRJZC5IaWRlKTtcblx0XHRpZiAoYWN0aXZlQ29kZUVkaXRvcikge1xuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IENvbW1lbnRDb250cm9sbGVyLmdldChhY3RpdmVDb2RlRWRpdG9yKTtcblx0XHRcdGlmIChjb250cm9sbGVyKSB7XG5cdFx0XHRcdGF3YWl0IGNvbnRyb2xsZXIuY29sbGFwc2VWaXNpYmxlQ29tbWVudHMoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QWN0aXZlRWRpdG9yKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogSUFjdGl2ZUNvZGVFZGl0b3IgfCBudWxsIHtcblx0bGV0IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbDtcblxuXHRpZiAoaXNEaWZmRWRpdG9yKGFjdGl2ZVRleHRFZGl0b3JDb250cm9sKSkge1xuXHRcdGlmIChhY3RpdmVUZXh0RWRpdG9yQ29udHJvbC5nZXRPcmlnaW5hbEVkaXRvcigpLmhhc1RleHRGb2N1cygpKSB7XG5cdFx0XHRhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCA9IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sLmdldE9yaWdpbmFsRWRpdG9yKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFjdGl2ZVRleHRFZGl0b3JDb250cm9sID0gYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wuZ2V0TW9kaWZpZWRFZGl0b3IoKTtcblx0XHR9XG5cdH1cblxuXHRpZiAoIWlzQ29kZUVkaXRvcihhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCkgfHwgIWFjdGl2ZVRleHRFZGl0b3JDb250cm9sLmhhc01vZGVsKCkpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHJldHVybiBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbDtcbn1cblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxVQUFVLFNBQVMsY0FBYztBQUMxQyxPQUFPO0FBQ1AsU0FBNEIsY0FBYyxvQkFBb0I7QUFDOUQsU0FBUyxpQ0FBaUMsa0NBQWtDO0FBQzVFLFNBQVMsMEJBQTBCO0FBQ25DLFlBQVksU0FBUztBQUVyQixTQUFTLHFCQUFxQix3QkFBd0I7QUFDdEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUIsMkJBQTJCO0FBQzdELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsU0FBUyxRQUFRLHVCQUF1QjtBQUNqRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG1CQUFtQixVQUFVO0FBQ3RDLFNBQWlCLGFBQWE7QUFDOUIsU0FBUyw0QkFB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
