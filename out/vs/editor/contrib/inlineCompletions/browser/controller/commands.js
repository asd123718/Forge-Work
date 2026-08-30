import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { asyncTransaction, transaction } from "../../../../../base/common/observable.js";
import { splitLines } from "../../../../../base/common/strings.js";
import { vBoolean, vObj, vOptionalProp, vString, vUnchecked, vUndefined, vUnion, vWithJsonSchemaRef } from "../../../../../base/common/validation.js";
import * as nls from "../../../../../nls.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../../platform/accessibility/common/accessibility.js";
import { Action2, MenuId } from "../../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { INotificationService, Severity } from "../../../../../platform/notification/common/notification.js";
import { EditorAction } from "../../../../browser/editorExtensions.js";
import { EditorContextKeys } from "../../../../common/editorContextKeys.js";
import { ILanguageFeaturesService } from "../../../../common/services/languageFeatures.js";
import { Context as SuggestContext } from "../../../suggest/browser/suggest.js";
import { hideInlineCompletionId, inlineSuggestCommitAlternativeActionId, inlineSuggestCommitId, jumpToNextInlineEditId, showNextInlineSuggestionActionId, showPreviousInlineSuggestionActionId, toggleShowCollapsedId } from "./commandIds.js";
import { InlineCompletionContextKeys } from "./inlineCompletionContextKeys.js";
import { InlineCompletionsController } from "./inlineCompletionsController.js";
const _ShowNextInlineSuggestionAction = class _ShowNextInlineSuggestionAction extends EditorAction {
  constructor() {
    super({
      id: _ShowNextInlineSuggestionAction.ID,
      label: nls.localize2("action.inlineSuggest.showNext", "Show Next Inline Suggestion"),
      precondition: ContextKeyExpr.and(EditorContextKeys.writable, InlineCompletionContextKeys.inlineSuggestionVisible),
      kbOpts: {
        weight: 100,
        primary: KeyMod.Alt | KeyCode.BracketRight
      }
    });
  }
  async run(accessor, editor) {
    const controller = InlineCompletionsController.get(editor);
    controller?.model.get()?.next();
  }
};
_ShowNextInlineSuggestionAction.ID = showNextInlineSuggestionActionId;
let ShowNextInlineSuggestionAction = _ShowNextInlineSuggestionAction;
const _ShowPreviousInlineSuggestionAction = class _ShowPreviousInlineSuggestionAction extends EditorAction {
  constructor() {
    super({
      id: _ShowPreviousInlineSuggestionAction.ID,
      label: nls.localize2("action.inlineSuggest.showPrevious", "Show Previous Inline Suggestion"),
      precondition: ContextKeyExpr.and(EditorContextKeys.writable, InlineCompletionContextKeys.inlineSuggestionVisible),
      kbOpts: {
        weight: 100,
        primary: KeyMod.Alt | KeyCode.BracketLeft
      }
    });
  }
  async run(accessor, editor) {
    const controller = InlineCompletionsController.get(editor);
    controller?.model.get()?.previous();
  }
};
_ShowPreviousInlineSuggestionAction.ID = showPreviousInlineSuggestionActionId;
let ShowPreviousInlineSuggestionAction = _ShowPreviousInlineSuggestionAction;
const providerIdSchemaUri = "vscode://schemas/inlineCompletionProviderIdArgs";
function inlineCompletionProviderGetMatcher(provider) {
  const result = [];
  if (provider.providerId) {
    result.push(provider.providerId.toStringWithoutVersion());
    result.push(provider.providerId.extensionId + ":*");
  }
  return result;
}
const argsValidator = vUnion(vObj({
  showNoResultNotification: vOptionalProp(vBoolean()),
  providerId: vOptionalProp(vWithJsonSchemaRef(providerIdSchemaUri, vString())),
  explicit: vOptionalProp(vBoolean()),
  changeHintData: vOptionalProp(vUnchecked())
}), vUndefined());
class TriggerInlineSuggestionAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.inlineSuggest.trigger",
      label: nls.localize2("action.inlineSuggest.trigger", "Trigger Inline Suggestion"),
      precondition: EditorContextKeys.writable,
      metadata: {
        description: nls.localize("inlineSuggest.trigger.description", "Triggers an inline suggestion in the editor."),
        args: [{
          name: "args",
          description: nls.localize("inlineSuggest.trigger.args", "Options for triggering inline suggestions."),
          isOptional: true,
          schema: argsValidator.getJSONSchema()
        }]
      }
    });
  }
  async run(accessor, editor, args) {
    const notificationService = accessor.get(INotificationService);
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const controller = InlineCompletionsController.get(editor);
    const validatedArgs = argsValidator.validateOrThrow(args);
    const provider = validatedArgs?.providerId ? languageFeaturesService.inlineCompletionsProvider.all(editor.getModel()).find((p) => inlineCompletionProviderGetMatcher(p).some((m) => m === validatedArgs.providerId)) : void 0;
    await asyncTransaction(async (tx) => {
      await controller?.model.get()?.trigger(tx, {
        provider,
        explicit: validatedArgs?.explicit ?? true,
        changeHint: validatedArgs?.changeHintData ? { data: validatedArgs.changeHintData } : void 0
      });
      controller?.playAccessibilitySignal(tx);
    });
    if (validatedArgs?.showNoResultNotification) {
      if (!controller?.model.get()?.state.get()) {
        notificationService.notify({
          severity: Severity.Info,
          message: nls.localize("noInlineSuggestionAvailable", "No inline suggestion is available.")
        });
      }
    }
  }
}
class AcceptNextWordOfInlineCompletion extends EditorAction {
  constructor() {
    super({
      id: "editor.action.inlineSuggest.acceptNextWord",
      label: nls.localize2("action.inlineSuggest.acceptNextWord", "Accept Next Word Of Inline Suggestion"),
      precondition: ContextKeyExpr.and(EditorContextKeys.writable, InlineCompletionContextKeys.inlineSuggestionVisible),
      kbOpts: {
        weight: KeybindingWeight.EditorContrib + 1,
        primary: KeyMod.CtrlCmd | KeyCode.RightArrow,
        kbExpr: ContextKeyExpr.and(EditorContextKeys.writable, InlineCompletionContextKeys.inlineSuggestionVisible, InlineCompletionContextKeys.cursorBeforeGhostText, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate())
      },
      menuOpts: [{
        menuId: MenuId.InlineSuggestionToolbar,
        title: nls.localize("acceptWord", "Accept Word"),
        group: "primary",
        order: 2
      }]
    });
  }
  async run(accessor, editor) {
    const controller = InlineCompletionsController.get(editor);
    await controller?.model.get()?.acceptNextWord();
  }
}
class AcceptNextLineOfInlineCompletion extends EditorAction {
  constructor() {
    super({
      id: "editor.action.inlineSuggest.acceptNextLine",
      label: nls.localize2("action.inlineSuggest.acceptNextLine", "Accept Next Line Of Inline Suggestion"),
      precondition: ContextKeyExpr.and(EditorContextKeys.writable, InlineCompletionContextKeys.inlineSuggestionVisible),
      kbOpts: {
        weight: KeybindingWeight.EditorContrib + 1
      },
      menuOpts: [{
        menuId: MenuId.InlineSuggestionToolbar,
        title: nls.localize("acceptLine", "Accept Line"),
        group: "secondary",
        order: 2
      }]
    });
  }
  async run(accessor, editor) {
    const controller = InlineCompletionsController.get(editor);
    await controller?.model.get()?.acceptNextLine();
  }
}
class AcceptInlineCompletion extends EditorAction {
  constructor() {
    super({
      id: inlineSuggestCommitId,
      label: nls.localize2("action.inlineSuggest.accept", "Accept Inline Suggestion"),
      precondition: ContextKeyExpr.or(InlineCompletionContextKeys.inlineSuggestionVisible, InlineCompletionContextKeys.inlineEditVisible),
      menuOpts: [{
        menuId: MenuId.InlineSuggestionToolbar,
        title: nls.localize("accept", "Accept"),
        group: "primary",
        order: 2
      }, {
        menuId: MenuId.InlineEditsActions,
        title: nls.localize("accept", "Accept"),
        group: "primary",
        order: 2
      }],
      kbOpts: [
        {
          primary: KeyCode.Tab,
          weight: 200,
          kbExpr: ContextKeyExpr.or(
            ContextKeyExpr.and(
              InlineCompletionContextKeys.inlineSuggestionVisible,
              EditorContextKeys.tabMovesFocus.toNegated(),
              SuggestContext.Visible.toNegated(),
              EditorContextKeys.hoverFocused.toNegated(),
              InlineCompletionContextKeys.hasSelection.toNegated(),
              InlineCompletionContextKeys.inlineSuggestionHasIndentationLessThanTabSize
            ),
            ContextKeyExpr.and(
              InlineCompletionContextKeys.inlineEditVisible,
              EditorContextKeys.tabMovesFocus.toNegated(),
              SuggestContext.Visible.toNegated(),
              EditorContextKeys.hoverFocused.toNegated(),
              InlineCompletionContextKeys.tabShouldAcceptInlineEdit
            )
          )
        }
      ]
    });
  }
  async run(accessor, editor) {
    const controller = InlineCompletionsController.getInFocusedEditorOrParent(accessor);
    if (controller) {
      controller.model.get()?.accept(controller.editor);
      controller.editor.focus();
    }
  }
}
KeybindingsRegistry.registerKeybindingRule({
  id: inlineSuggestCommitId,
  weight: 202,
  // greater than jump
  primary: KeyCode.Tab,
  when: ContextKeyExpr.and(InlineCompletionContextKeys.inInlineEditsPreviewEditor)
});
class AcceptInlineCompletionAlternativeAction extends EditorAction {
  constructor() {
    super({
      id: inlineSuggestCommitAlternativeActionId,
      label: nls.localize2("action.inlineSuggest.acceptAlternativeAction", "Accept Inline Suggestion Alternative Action"),
      precondition: ContextKeyExpr.and(InlineCompletionContextKeys.inlineSuggestionAlternativeActionVisible, InlineCompletionContextKeys.inlineEditVisible),
      menuOpts: [],
      kbOpts: [
        {
          primary: KeyMod.Shift | KeyCode.Tab,
          weight: 203
        }
      ]
    });
  }
  async run(accessor, editor) {
    const controller = InlineCompletionsController.getInFocusedEditorOrParent(accessor);
    if (controller) {
      controller.model.get()?.accept(controller.editor, true);
      controller.editor.focus();
    }
  }
}
KeybindingsRegistry.registerKeybindingRule({
  id: inlineSuggestCommitAlternativeActionId,
  weight: 203,
  primary: KeyMod.Shift | KeyCode.Tab,
  when: ContextKeyExpr.and(InlineCompletionContextKeys.inInlineEditsPreviewEditor)
});
class JumpToNextInlineEdit extends EditorAction {
  constructor() {
    super({
      id: jumpToNextInlineEditId,
      label: nls.localize2("action.inlineSuggest.jump", "Jump to next inline edit"),
      precondition: InlineCompletionContextKeys.inlineEditVisible,
      menuOpts: [{
        menuId: MenuId.InlineEditsActions,
        title: nls.localize("jump", "Jump"),
        group: "primary",
        order: 1,
        when: InlineCompletionContextKeys.cursorAtInlineEdit.toNegated()
      }],
      kbOpts: {
        primary: KeyCode.Tab,
        weight: 201,
        kbExpr: ContextKeyExpr.and(
          InlineCompletionContextKeys.inlineEditVisible,
          EditorContextKeys.tabMovesFocus.toNegated(),
          SuggestContext.Visible.toNegated(),
          EditorContextKeys.hoverFocused.toNegated(),
          InlineCompletionContextKeys.tabShouldJumpToInlineEdit
        )
      }
    });
  }
  async run(accessor, editor) {
    const controller = InlineCompletionsController.get(editor);
    if (controller) {
      controller.jump();
    }
  }
}
const _HideInlineCompletion = class _HideInlineCompletion extends EditorAction {
  constructor() {
    super({
      id: _HideInlineCompletion.ID,
      label: nls.localize2("action.inlineSuggest.hide", "Hide Inline Suggestion"),
      precondition: ContextKeyExpr.or(InlineCompletionContextKeys.inlineSuggestionVisible, InlineCompletionContextKeys.inlineEditVisible),
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        weight: KeybindingWeight.EditorContrib + 90,
        // same as hiding the suggest widget
        primary: KeyCode.Escape
      },
      menuOpts: [{
        menuId: MenuId.InlineEditsActions,
        title: nls.localize("reject", "Reject"),
        group: "primary",
        order: 3
      }]
    });
  }
  async run(accessor, editor) {
    const controller = InlineCompletionsController.getInFocusedEditorOrParent(accessor);
    transaction((tx) => {
      controller?.model.get()?.stop("explicitCancel", tx);
    });
    controller?.editor.focus();
  }
};
_HideInlineCompletion.ID = hideInlineCompletionId;
let HideInlineCompletion = _HideInlineCompletion;
const _ToggleInlineCompletionShowCollapsed = class _ToggleInlineCompletionShowCollapsed extends EditorAction {
  constructor() {
    super({
      id: _ToggleInlineCompletionShowCollapsed.ID,
      label: nls.localize2("action.inlineSuggest.toggleShowCollapsed", "Toggle Inline Suggestions Show Collapsed"),
      precondition: ContextKeyExpr.true()
    });
  }
  async run(accessor, editor) {
    const configurationService = accessor.get(IConfigurationService);
    const showCollapsed = configurationService.getValue("editor.inlineSuggest.edits.showCollapsed");
    configurationService.updateValue("editor.inlineSuggest.edits.showCollapsed", !showCollapsed);
  }
};
_ToggleInlineCompletionShowCollapsed.ID = toggleShowCollapsedId;
let ToggleInlineCompletionShowCollapsed = _ToggleInlineCompletionShowCollapsed;
KeybindingsRegistry.registerKeybindingRule({
  id: HideInlineCompletion.ID,
  weight: -1,
  // very weak
  primary: KeyCode.Escape,
  secondary: [KeyMod.Shift | KeyCode.Escape],
  when: ContextKeyExpr.and(InlineCompletionContextKeys.inInlineEditsPreviewEditor)
});
const _ToggleAlwaysShowInlineSuggestionToolbar = class _ToggleAlwaysShowInlineSuggestionToolbar extends Action2 {
  constructor() {
    super({
      id: _ToggleAlwaysShowInlineSuggestionToolbar.ID,
      title: nls.localize("action.inlineSuggest.alwaysShowToolbar", "Always Show Toolbar"),
      f1: false,
      precondition: void 0,
      menu: [{
        id: MenuId.InlineSuggestionToolbar,
        group: "secondary",
        order: 10
      }],
      toggled: ContextKeyExpr.equals("config.editor.inlineSuggest.showToolbar", "always")
    });
  }
  async run(accessor) {
    const configService = accessor.get(IConfigurationService);
    const currentValue = configService.getValue("editor.inlineSuggest.showToolbar");
    const newValue = currentValue === "always" ? "onHover" : "always";
    configService.updateValue("editor.inlineSuggest.showToolbar", newValue);
  }
};
_ToggleAlwaysShowInlineSuggestionToolbar.ID = "editor.action.inlineSuggest.toggleAlwaysShowToolbar";
let ToggleAlwaysShowInlineSuggestionToolbar = _ToggleAlwaysShowInlineSuggestionToolbar;
class DevExtractReproSample extends EditorAction {
  constructor() {
    super({
      id: "editor.action.inlineSuggest.dev.extractRepro",
      label: nls.localize("action.inlineSuggest.dev.extractRepro", "Developer: Extract Inline Suggest State"),
      alias: "Developer: Inline Suggest Extract Repro",
      precondition: ContextKeyExpr.or(InlineCompletionContextKeys.inlineEditVisible, InlineCompletionContextKeys.inlineSuggestionVisible)
    });
  }
  async run(accessor, editor) {
    const clipboardService = accessor.get(IClipboardService);
    const controller = InlineCompletionsController.get(editor);
    const m = controller?.model.get();
    if (!m) {
      return;
    }
    const repro = m.extractReproSample();
    const inlineCompletionLines = splitLines(JSON.stringify({ inlineCompletion: repro.inlineCompletion }, null, 4));
    const json = inlineCompletionLines.map((l) => "// " + l).join("\n");
    const reproStr = `${repro.documentValue}

// <json>
${json}
// </json>
`;
    await clipboardService.writeText(reproStr);
    return { reproCase: reproStr };
  }
}
export {
  AcceptInlineCompletion,
  AcceptInlineCompletionAlternativeAction,
  AcceptNextLineOfInlineCompletion,
  AcceptNextWordOfInlineCompletion,
  DevExtractReproSample,
  HideInlineCompletion,
  JumpToNextInlineEdit,
  ShowNextInlineSuggestionAction,
  ShowPreviousInlineSuggestionAction,
  ToggleAlwaysShowInlineSuggestionToolbar,
  ToggleInlineCompletionShowCollapsed,
  TriggerInlineSuggestionAction,
  inlineCompletionProviderGetMatcher,
  providerIdSchemaUri
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFxjb250cm9sbGVyXFxjb21tYW5kcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IGFzeW5jVHJhbnNhY3Rpb24sIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBzcGxpdExpbmVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyB2Qm9vbGVhbiwgdk9iaiwgdk9wdGlvbmFsUHJvcCwgdlN0cmluZywgdlVuY2hlY2tlZCwgdlVuZGVmaW5lZCwgdlVuaW9uLCB2V2l0aEpzb25TY2hlbWFSZWYgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi92YWxpZGF0aW9uLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc1JlZ2lzdHJ5LCBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24sIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbnNQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgQ29udGV4dCBhcyBTdWdnZXN0Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0LmpzJztcbmltcG9ydCB7IGhpZGVJbmxpbmVDb21wbGV0aW9uSWQsIGlubGluZVN1Z2dlc3RDb21taXRBbHRlcm5hdGl2ZUFjdGlvbklkLCBpbmxpbmVTdWdnZXN0Q29tbWl0SWQsIGp1bXBUb05leHRJbmxpbmVFZGl0SWQsIHNob3dOZXh0SW5saW5lU3VnZ2VzdGlvbkFjdGlvbklkLCBzaG93UHJldmlvdXNJbmxpbmVTdWdnZXN0aW9uQWN0aW9uSWQsIHRvZ2dsZVNob3dDb2xsYXBzZWRJZCB9IGZyb20gJy4vY29tbWFuZElkcy5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMgfSBmcm9tICcuL2lubGluZUNvbXBsZXRpb25Db250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIgfSBmcm9tICcuL2lubGluZUNvbXBsZXRpb25zQ29udHJvbGxlci5qcyc7XG5cbmV4cG9ydCBjbGFzcyBTaG93TmV4dElubGluZVN1Z2dlc3Rpb25BY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRwdWJsaWMgc3RhdGljIElEID0gc2hvd05leHRJbmxpbmVTdWdnZXN0aW9uQWN0aW9uSWQ7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTaG93TmV4dElubGluZVN1Z2dlc3Rpb25BY3Rpb24uSUQsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignYWN0aW9uLmlubGluZVN1Z2dlc3Quc2hvd05leHQnLCBcIlNob3cgTmV4dCBJbmxpbmUgU3VnZ2VzdGlvblwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLCBJbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuaW5saW5lU3VnZ2VzdGlvblZpc2libGUpLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdHdlaWdodDogMTAwLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5CcmFja2V0UmlnaHQsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0Y29udHJvbGxlcj8ubW9kZWwuZ2V0KCk/Lm5leHQoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2hvd1ByZXZpb3VzSW5saW5lU3VnZ2VzdGlvbkFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdHB1YmxpYyBzdGF0aWMgSUQgPSBzaG93UHJldmlvdXNJbmxpbmVTdWdnZXN0aW9uQWN0aW9uSWQ7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTaG93UHJldmlvdXNJbmxpbmVTdWdnZXN0aW9uQWN0aW9uLklELFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2FjdGlvbi5pbmxpbmVTdWdnZXN0LnNob3dQcmV2aW91cycsIFwiU2hvdyBQcmV2aW91cyBJbmxpbmUgU3VnZ2VzdGlvblwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLCBJbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuaW5saW5lU3VnZ2VzdGlvblZpc2libGUpLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdHdlaWdodDogMTAwLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5CcmFja2V0TGVmdCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRjb250cm9sbGVyPy5tb2RlbC5nZXQoKT8ucHJldmlvdXMoKTtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgcHJvdmlkZXJJZFNjaGVtYVVyaSA9ICd2c2NvZGU6Ly9zY2hlbWFzL2lubGluZUNvbXBsZXRpb25Qcm92aWRlcklkQXJncyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBpbmxpbmVDb21wbGV0aW9uUHJvdmlkZXJHZXRNYXRjaGVyKHByb3ZpZGVyOiBJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyKTogc3RyaW5nW10ge1xuXHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdGlmIChwcm92aWRlci5wcm92aWRlcklkKSB7XG5cdFx0cmVzdWx0LnB1c2gocHJvdmlkZXIucHJvdmlkZXJJZC50b1N0cmluZ1dpdGhvdXRWZXJzaW9uKCkpO1xuXHRcdHJlc3VsdC5wdXNoKHByb3ZpZGVyLnByb3ZpZGVySWQuZXh0ZW5zaW9uSWQgKyAnOionKTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5jb25zdCBhcmdzVmFsaWRhdG9yID0gdlVuaW9uKHZPYmooe1xuXHRzaG93Tm9SZXN1bHROb3RpZmljYXRpb246IHZPcHRpb25hbFByb3AodkJvb2xlYW4oKSksXG5cdHByb3ZpZGVySWQ6IHZPcHRpb25hbFByb3AodldpdGhKc29uU2NoZW1hUmVmKHByb3ZpZGVySWRTY2hlbWFVcmksIHZTdHJpbmcoKSkpLFxuXHRleHBsaWNpdDogdk9wdGlvbmFsUHJvcCh2Qm9vbGVhbigpKSxcblx0Y2hhbmdlSGludERhdGE6IHZPcHRpb25hbFByb3AodlVuY2hlY2tlZCgpKSxcbn0pLCB2VW5kZWZpbmVkKCkpO1xuXG5leHBvcnQgY2xhc3MgVHJpZ2dlcklubGluZVN1Z2dlc3Rpb25BY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uaW5saW5lU3VnZ2VzdC50cmlnZ2VyJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdhY3Rpb24uaW5saW5lU3VnZ2VzdC50cmlnZ2VyJywgXCJUcmlnZ2VyIElubGluZSBTdWdnZXN0aW9uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2lubGluZVN1Z2dlc3QudHJpZ2dlci5kZXNjcmlwdGlvbicsIFwiVHJpZ2dlcnMgYW4gaW5saW5lIHN1Z2dlc3Rpb24gaW4gdGhlIGVkaXRvci5cIiksXG5cdFx0XHRcdGFyZ3M6IFt7XG5cdFx0XHRcdFx0bmFtZTogJ2FyZ3MnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2lubGluZVN1Z2dlc3QudHJpZ2dlci5hcmdzJywgXCJPcHRpb25zIGZvciB0cmlnZ2VyaW5nIGlubGluZSBzdWdnZXN0aW9ucy5cIiksXG5cdFx0XHRcdFx0aXNPcHRpb25hbDogdHJ1ZSxcblx0XHRcdFx0XHRzY2hlbWE6IGFyZ3NWYWxpZGF0b3IuZ2V0SlNPTlNjaGVtYSgpLFxuXHRcdFx0XHR9XVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXG5cdFx0Y29uc3QgdmFsaWRhdGVkQXJncyA9IGFyZ3NWYWxpZGF0b3IudmFsaWRhdGVPclRocm93KGFyZ3MpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB2YWxpZGF0ZWRBcmdzPy5wcm92aWRlcklkID9cblx0XHRcdGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmlubGluZUNvbXBsZXRpb25zUHJvdmlkZXIuYWxsKGVkaXRvci5nZXRNb2RlbCgpISlcblx0XHRcdFx0LmZpbmQocCA9PiBpbmxpbmVDb21wbGV0aW9uUHJvdmlkZXJHZXRNYXRjaGVyKHApLnNvbWUobSA9PiBtID09PSB2YWxpZGF0ZWRBcmdzLnByb3ZpZGVySWQpKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRhd2FpdCBhc3luY1RyYW5zYWN0aW9uKGFzeW5jIHR4ID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gdHJpZ2dlckV4cGxpY2l0bHkgZnJvbSBjb21tYW5kICovXG5cdFx0XHRhd2FpdCBjb250cm9sbGVyPy5tb2RlbC5nZXQoKT8udHJpZ2dlcih0eCwge1xuXHRcdFx0XHRwcm92aWRlcjogcHJvdmlkZXIsXG5cdFx0XHRcdGV4cGxpY2l0OiB2YWxpZGF0ZWRBcmdzPy5leHBsaWNpdCA/PyB0cnVlLFxuXHRcdFx0XHRjaGFuZ2VIaW50OiB2YWxpZGF0ZWRBcmdzPy5jaGFuZ2VIaW50RGF0YSA/IHsgZGF0YTogdmFsaWRhdGVkQXJncy5jaGFuZ2VIaW50RGF0YSB9IDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0XHRjb250cm9sbGVyPy5wbGF5QWNjZXNzaWJpbGl0eVNpZ25hbCh0eCk7XG5cdFx0fSk7XG5cblx0XHRpZiAodmFsaWRhdGVkQXJncz8uc2hvd05vUmVzdWx0Tm90aWZpY2F0aW9uKSB7XG5cdFx0XHRpZiAoIWNvbnRyb2xsZXI/Lm1vZGVsLmdldCgpPy5zdGF0ZS5nZXQoKSkge1xuXHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdub0lubGluZVN1Z2dlc3Rpb25BdmFpbGFibGUnLCBcIk5vIGlubGluZSBzdWdnZXN0aW9uIGlzIGF2YWlsYWJsZS5cIilcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBY2NlcHROZXh0V29yZE9mSW5saW5lQ29tcGxldGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5pbmxpbmVTdWdnZXN0LmFjY2VwdE5leHRXb3JkJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdhY3Rpb24uaW5saW5lU3VnZ2VzdC5hY2NlcHROZXh0V29yZCcsIFwiQWNjZXB0IE5leHQgV29yZCBPZiBJbmxpbmUgU3VnZ2VzdGlvblwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLCBJbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuaW5saW5lU3VnZ2VzdGlvblZpc2libGUpLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliICsgMSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlJpZ2h0QXJyb3csXG5cdFx0XHRcdGtiRXhwcjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLCBJbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuaW5saW5lU3VnZ2VzdGlvblZpc2libGUsIElubGluZUNvbXBsZXRpb25Db250ZXh0S2V5cy5jdXJzb3JCZWZvcmVHaG9zdFRleHQsIENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQubmVnYXRlKCkpLFxuXHRcdFx0fSxcblx0XHRcdG1lbnVPcHRzOiBbe1xuXHRcdFx0XHRtZW51SWQ6IE1lbnVJZC5JbmxpbmVTdWdnZXN0aW9uVG9vbGJhcixcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnYWNjZXB0V29yZCcsICdBY2NlcHQgV29yZCcpLFxuXHRcdFx0XHRncm91cDogJ3ByaW1hcnknLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0YXdhaXQgY29udHJvbGxlcj8ubW9kZWwuZ2V0KCk/LmFjY2VwdE5leHRXb3JkKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEFjY2VwdE5leHRMaW5lT2ZJbmxpbmVDb21wbGV0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmlubGluZVN1Z2dlc3QuYWNjZXB0TmV4dExpbmUnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2FjdGlvbi5pbmxpbmVTdWdnZXN0LmFjY2VwdE5leHRMaW5lJywgXCJBY2NlcHQgTmV4dCBMaW5lIE9mIElubGluZSBTdWdnZXN0aW9uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsIElubGluZUNvbXBsZXRpb25Db250ZXh0S2V5cy5pbmxpbmVTdWdnZXN0aW9uVmlzaWJsZSksXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgKyAxLFxuXHRcdFx0fSxcblx0XHRcdG1lbnVPcHRzOiBbe1xuXHRcdFx0XHRtZW51SWQ6IE1lbnVJZC5JbmxpbmVTdWdnZXN0aW9uVG9vbGJhcixcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnYWNjZXB0TGluZScsICdBY2NlcHQgTGluZScpLFxuXHRcdFx0XHRncm91cDogJ3NlY29uZGFyeScsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRhd2FpdCBjb250cm9sbGVyPy5tb2RlbC5nZXQoKT8uYWNjZXB0TmV4dExpbmUoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQWNjZXB0SW5saW5lQ29tcGxldGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBpbmxpbmVTdWdnZXN0Q29tbWl0SWQsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignYWN0aW9uLmlubGluZVN1Z2dlc3QuYWNjZXB0JywgXCJBY2NlcHQgSW5saW5lIFN1Z2dlc3Rpb25cIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKElubGluZUNvbXBsZXRpb25Db250ZXh0S2V5cy5pbmxpbmVTdWdnZXN0aW9uVmlzaWJsZSwgSW5saW5lQ29tcGxldGlvbkNvbnRleHRLZXlzLmlubGluZUVkaXRWaXNpYmxlKSxcblx0XHRcdG1lbnVPcHRzOiBbe1xuXHRcdFx0XHRtZW51SWQ6IE1lbnVJZC5JbmxpbmVTdWdnZXN0aW9uVG9vbGJhcixcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnYWNjZXB0JywgXCJBY2NlcHRcIiksXG5cdFx0XHRcdGdyb3VwOiAncHJpbWFyeScsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRtZW51SWQ6IE1lbnVJZC5JbmxpbmVFZGl0c0FjdGlvbnMsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2FjY2VwdCcsIFwiQWNjZXB0XCIpLFxuXHRcdFx0XHRncm91cDogJ3ByaW1hcnknLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdH1dLFxuXHRcdFx0a2JPcHRzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLlRhYixcblx0XHRcdFx0XHR3ZWlnaHQ6IDIwMCxcblx0XHRcdFx0XHRrYkV4cHI6IENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0XHRJbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuaW5saW5lU3VnZ2VzdGlvblZpc2libGUsXG5cdFx0XHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLnRhYk1vdmVzRm9jdXMudG9OZWdhdGVkKCksXG5cdFx0XHRcdFx0XHRcdFN1Z2dlc3RDb250ZXh0LlZpc2libGUudG9OZWdhdGVkKCksXG5cdFx0XHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmhvdmVyRm9jdXNlZC50b05lZ2F0ZWQoKSxcblx0XHRcdFx0XHRcdFx0SW5saW5lQ29tcGxldGlvbkNvbnRleHRLZXlzLmhhc1NlbGVjdGlvbi50b05lZ2F0ZWQoKSxcblxuXHRcdFx0XHRcdFx0XHRJbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuaW5saW5lU3VnZ2VzdGlvbkhhc0luZGVudGF0aW9uTGVzc1RoYW5UYWJTaXplLFxuXHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdFx0SW5saW5lQ29tcGxldGlvbkNvbnRleHRLZXlzLmlubGluZUVkaXRWaXNpYmxlLFxuXHRcdFx0XHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy50YWJNb3Zlc0ZvY3VzLnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdFx0XHRTdWdnZXN0Q29udGV4dC5WaXNpYmxlLnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5ob3ZlckZvY3VzZWQudG9OZWdhdGVkKCksXG5cblx0XHRcdFx0XHRcdFx0SW5saW5lQ29tcGxldGlvbkNvbnRleHRLZXlzLnRhYlNob3VsZEFjY2VwdElubGluZUVkaXQsXG5cdFx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLmdldEluRm9jdXNlZEVkaXRvck9yUGFyZW50KGFjY2Vzc29yKTtcblx0XHRpZiAoY29udHJvbGxlcikge1xuXHRcdFx0Y29udHJvbGxlci5tb2RlbC5nZXQoKT8uYWNjZXB0KGNvbnRyb2xsZXIuZWRpdG9yKTtcblx0XHRcdGNvbnRyb2xsZXIuZWRpdG9yLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG59XG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogaW5saW5lU3VnZ2VzdENvbW1pdElkLFxuXHR3ZWlnaHQ6IDIwMiwgLy8gZ3JlYXRlciB0aGFuIGp1bXBcblx0cHJpbWFyeTogS2V5Q29kZS5UYWIsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuaW5JbmxpbmVFZGl0c1ByZXZpZXdFZGl0b3IpXG59KTtcblxuZXhwb3J0IGNsYXNzIEFjY2VwdElubGluZUNvbXBsZXRpb25BbHRlcm5hdGl2ZUFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBpbmxpbmVTdWdnZXN0Q29tbWl0QWx0ZXJuYXRpdmVBY3Rpb25JZCxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdhY3Rpb24uaW5saW5lU3VnZ2VzdC5hY2NlcHRBbHRlcm5hdGl2ZUFjdGlvbicsIFwiQWNjZXB0IElubGluZSBTdWdnZXN0aW9uIEFsdGVybmF0aXZlIEFjdGlvblwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKElubGluZUNvbXBsZXRpb25Db250ZXh0S2V5cy5pbmxpbmVTdWdnZXN0aW9uQWx0ZXJuYXRpdmVBY3Rpb25WaXNpYmxlLCBJbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuaW5saW5lRWRpdFZpc2libGUpLFxuXHRcdFx0bWVudU9wdHM6IFtdLFxuXHRcdFx0a2JPcHRzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlRhYixcblx0XHRcdFx0XHR3ZWlnaHQ6IDIwMyxcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLmdldEluRm9jdXNlZEVkaXRvck9yUGFyZW50KGFjY2Vzc29yKTtcblx0XHRpZiAoY29udHJvbGxlcikge1xuXHRcdFx0Y29udHJvbGxlci5tb2RlbC5nZXQoKT8uYWNjZXB0KGNvbnRyb2xsZXIuZWRpdG9yLCB0cnVlKTtcblx0XHRcdGNvbnRyb2xsZXIuZWRpdG9yLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG59XG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogaW5saW5lU3VnZ2VzdENvbW1pdEFsdGVybmF0aXZlQWN0aW9uSWQsXG5cdHdlaWdodDogMjAzLFxuXHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlRhYixcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKElubGluZUNvbXBsZXRpb25Db250ZXh0S2V5cy5pbklubGluZUVkaXRzUHJldmlld0VkaXRvcilcbn0pO1xuXG5leHBvcnQgY2xhc3MgSnVtcFRvTmV4dElubGluZUVkaXQgZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDoganVtcFRvTmV4dElubGluZUVkaXRJZCxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdhY3Rpb24uaW5saW5lU3VnZ2VzdC5qdW1wJywgXCJKdW1wIHRvIG5leHQgaW5saW5lIGVkaXRcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IElubGluZUNvbXBsZXRpb25Db250ZXh0S2V5cy5pbmxpbmVFZGl0VmlzaWJsZSxcblx0XHRcdG1lbnVPcHRzOiBbe1xuXHRcdFx0XHRtZW51SWQ6IE1lbnVJZC5JbmxpbmVFZGl0c0FjdGlvbnMsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2p1bXAnLCBcIkp1bXBcIiksXG5cdFx0XHRcdGdyb3VwOiAncHJpbWFyeScsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBJbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuY3Vyc29yQXRJbmxpbmVFZGl0LnRvTmVnYXRlZCgpLFxuXHRcdFx0fV0sXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5UYWIsXG5cdFx0XHRcdHdlaWdodDogMjAxLFxuXHRcdFx0XHRrYkV4cHI6IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRJbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuaW5saW5lRWRpdFZpc2libGUsXG5cdFx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMudGFiTW92ZXNGb2N1cy50b05lZ2F0ZWQoKSxcblx0XHRcdFx0XHRTdWdnZXN0Q29udGV4dC5WaXNpYmxlLnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmhvdmVyRm9jdXNlZC50b05lZ2F0ZWQoKSxcblx0XHRcdFx0XHRJbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMudGFiU2hvdWxkSnVtcFRvSW5saW5lRWRpdCxcblx0XHRcdFx0KSxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdGlmIChjb250cm9sbGVyKSB7XG5cdFx0XHRjb250cm9sbGVyLmp1bXAoKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEhpZGVJbmxpbmVDb21wbGV0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblx0cHVibGljIHN0YXRpYyBJRCA9IGhpZGVJbmxpbmVDb21wbGV0aW9uSWQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEhpZGVJbmxpbmVDb21wbGV0aW9uLklELFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2FjdGlvbi5pbmxpbmVTdWdnZXN0LmhpZGUnLCBcIkhpZGUgSW5saW5lIFN1Z2dlc3Rpb25cIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKElubGluZUNvbXBsZXRpb25Db250ZXh0S2V5cy5pbmxpbmVTdWdnZXN0aW9uVmlzaWJsZSwgSW5saW5lQ29tcGxldGlvbkNvbnRleHRLZXlzLmlubGluZUVkaXRWaXNpYmxlKSxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgKyA5MCwgLy8gc2FtZSBhcyBoaWRpbmcgdGhlIHN1Z2dlc3Qgd2lkZ2V0XG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdFx0fSxcblx0XHRcdG1lbnVPcHRzOiBbe1xuXHRcdFx0XHRtZW51SWQ6IE1lbnVJZC5JbmxpbmVFZGl0c0FjdGlvbnMsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3JlamVjdCcsIFwiUmVqZWN0XCIpLFxuXHRcdFx0XHRncm91cDogJ3ByaW1hcnknLFxuXHRcdFx0XHRvcmRlcjogMyxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlci5nZXRJbkZvY3VzZWRFZGl0b3JPclBhcmVudChhY2Nlc3Nvcik7XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0Y29udHJvbGxlcj8ubW9kZWwuZ2V0KCk/LnN0b3AoJ2V4cGxpY2l0Q2FuY2VsJywgdHgpO1xuXHRcdH0pO1xuXHRcdGNvbnRyb2xsZXI/LmVkaXRvci5mb2N1cygpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUb2dnbGVJbmxpbmVDb21wbGV0aW9uU2hvd0NvbGxhcHNlZCBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdHB1YmxpYyBzdGF0aWMgSUQgPSB0b2dnbGVTaG93Q29sbGFwc2VkSWQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRvZ2dsZUlubGluZUNvbXBsZXRpb25TaG93Q29sbGFwc2VkLklELFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2FjdGlvbi5pbmxpbmVTdWdnZXN0LnRvZ2dsZVNob3dDb2xsYXBzZWQnLCBcIlRvZ2dsZSBJbmxpbmUgU3VnZ2VzdGlvbnMgU2hvdyBDb2xsYXBzZWRcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLnRydWUoKSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHNob3dDb2xsYXBzZWQgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZWRpdG9yLmlubGluZVN1Z2dlc3QuZWRpdHMuc2hvd0NvbGxhcHNlZCcpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCdlZGl0b3IuaW5saW5lU3VnZ2VzdC5lZGl0cy5zaG93Q29sbGFwc2VkJywgIXNob3dDb2xsYXBzZWQpO1xuXHR9XG59XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBIaWRlSW5saW5lQ29tcGxldGlvbi5JRCxcblx0d2VpZ2h0OiAtMSwgLy8gdmVyeSB3ZWFrXG5cdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRzZWNvbmRhcnk6IFtLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkVzY2FwZV0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuaW5JbmxpbmVFZGl0c1ByZXZpZXdFZGl0b3IpXG59KTtcblxuZXhwb3J0IGNsYXNzIFRvZ2dsZUFsd2F5c1Nob3dJbmxpbmVTdWdnZXN0aW9uVG9vbGJhciBleHRlbmRzIEFjdGlvbjIge1xuXHRwdWJsaWMgc3RhdGljIElEID0gJ2VkaXRvci5hY3Rpb24uaW5saW5lU3VnZ2VzdC50b2dnbGVBbHdheXNTaG93VG9vbGJhcic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRvZ2dsZUFsd2F5c1Nob3dJbmxpbmVTdWdnZXN0aW9uVG9vbGJhci5JRCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2FjdGlvbi5pbmxpbmVTdWdnZXN0LmFsd2F5c1Nob3dUb29sYmFyJywgXCJBbHdheXMgU2hvdyBUb29sYmFyXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLklubGluZVN1Z2dlc3Rpb25Ub29sYmFyLFxuXHRcdFx0XHRncm91cDogJ3NlY29uZGFyeScsXG5cdFx0XHRcdG9yZGVyOiAxMCxcblx0XHRcdH1dLFxuXHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuZWRpdG9yLmlubGluZVN1Z2dlc3Quc2hvd1Rvb2xiYXInLCAnYWx3YXlzJylcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgY3VycmVudFZhbHVlID0gY29uZmlnU2VydmljZS5nZXRWYWx1ZTwnYWx3YXlzJyB8ICdvbkhvdmVyJz4oJ2VkaXRvci5pbmxpbmVTdWdnZXN0LnNob3dUb29sYmFyJyk7XG5cdFx0Y29uc3QgbmV3VmFsdWUgPSBjdXJyZW50VmFsdWUgPT09ICdhbHdheXMnID8gJ29uSG92ZXInIDogJ2Fsd2F5cyc7XG5cdFx0Y29uZmlnU2VydmljZS51cGRhdGVWYWx1ZSgnZWRpdG9yLmlubGluZVN1Z2dlc3Quc2hvd1Rvb2xiYXInLCBuZXdWYWx1ZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERldkV4dHJhY3RSZXByb1NhbXBsZSBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5pbmxpbmVTdWdnZXN0LmRldi5leHRyYWN0UmVwcm8nLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnYWN0aW9uLmlubGluZVN1Z2dlc3QuZGV2LmV4dHJhY3RSZXBybycsIFwiRGV2ZWxvcGVyOiBFeHRyYWN0IElubGluZSBTdWdnZXN0IFN0YXRlXCIpLFxuXHRcdFx0YWxpYXM6ICdEZXZlbG9wZXI6IElubGluZSBTdWdnZXN0IEV4dHJhY3QgUmVwcm8nLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5vcihJbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuaW5saW5lRWRpdFZpc2libGUsIElubGluZUNvbXBsZXRpb25Db250ZXh0S2V5cy5pbmxpbmVTdWdnZXN0aW9uVmlzaWJsZSksXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTxhbnk+IHtcblx0XHRjb25zdCBjbGlwYm9hcmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0Y29uc3QgbSA9IGNvbnRyb2xsZXI/Lm1vZGVsLmdldCgpO1xuXHRcdGlmICghbSkgeyByZXR1cm47IH1cblx0XHRjb25zdCByZXBybyA9IG0uZXh0cmFjdFJlcHJvU2FtcGxlKCk7XG5cblx0XHRjb25zdCBpbmxpbmVDb21wbGV0aW9uTGluZXMgPSBzcGxpdExpbmVzKEpTT04uc3RyaW5naWZ5KHsgaW5saW5lQ29tcGxldGlvbjogcmVwcm8uaW5saW5lQ29tcGxldGlvbiB9LCBudWxsLCA0KSk7XG5cblx0XHRjb25zdCBqc29uID0gaW5saW5lQ29tcGxldGlvbkxpbmVzLm1hcChsID0+ICcvLyAnICsgbCkuam9pbignXFxuJyk7XG5cblx0XHRjb25zdCByZXByb1N0ciA9IGAke3JlcHJvLmRvY3VtZW50VmFsdWV9XFxuXFxuLy8gPGpzb24+XFxuJHtqc29ufVxcbi8vIDwvanNvbj5cXG5gO1xuXG5cdFx0YXdhaXQgY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQocmVwcm9TdHIpO1xuXG5cdFx0cmV0dXJuIHsgcmVwcm9DYXNlOiByZXByb1N0ciB9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLGtCQUFrQixtQkFBbUI7QUFDOUMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxVQUFVLE1BQU0sZUFBZSxTQUFTLFlBQVksWUFBWSxRQUFRLDBCQUEwQjtBQUMzRyxZQUFZLFNBQVM7QUFDckIsU0FBUywwQ0FBMEM7QUFDbkQsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFB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d0M7QUFBQSxNQUM1QyxPQUFPLElBQUksU0FBUywwQ0FBMEMscUJBQXFCO0FBQUEsTUFDbkYsSUFBSTtBQUFBLE1BQ0osY0FBYztBQUFBLE1BQ2QsTUFBTSxDQUFDO0FBQUEsUUFDTixJQUFJLE9BQU87QUFBQSxRQUNYLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxNQUNSLENBQUM7QUFBQSxNQUNELFNBQVMsZUFBZSxPQUFPLDJDQUEyQyxRQUFRO0FBQUEsSUFDbkYsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWEsSUFBSSxVQUEyQztBQUMzRCxVQUFNLGdCQUFnQixTQUFTLElBQUkscUJBQXFCO0FBQ3hELFVBQU0sZUFBZSxjQUFjLFNBQStCLGtDQUFrQztBQUNwRyxVQUFNLFdBQVcsaUJBQWlCLFdBQVcsWUFBWTtBQUN6RCxrQkFBYyxZQUFZLG9DQUFvQyxRQUFRO0FBQUEsRUFDdkU7QUFDRDtBQXhCYSx5Q0FDRSxLQUFLO0FBRGIsSUFBTSwwQ0FBTjtBQTBCQSxNQUFNLDhCQUE4QixhQUFhO0FBQUEsRUFDdkQsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sSUFBSSxTQUFTLHlDQUF5Qyx5Q0FBeUM7QUFBQSxNQUN0RyxPQUFPO0FBQUEsTUFDUCxjQUFjLGVBQWUsR0FBRyw0QkFBNEIsbUJBQW1CLDRCQUE0Qix1QkFBdUI7QUFBQSxJQUNuSSxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBc0IsSUFBSSxVQUE0QixRQUFtQztBQUN4RixVQUFNLG1CQUFtQixTQUFTLElBQUksaUJBQWlCO0FBRXZELFVBQU0sYUFBYSw0QkFBNEIsSUFBSSxNQUFNO0FBQ3pELFVBQU0sSUFBSSxZQUFZLE1BQU0sSUFBSTtBQUNoQyxRQUFJLENBQUMsR0FBRztBQUFFO0FBQUEsSUFBUTtBQUNsQixVQUFNLFFBQVEsRUFBRSxtQkFBbUI7QUFFbkMsVUFBTSx3QkFBd0IsV0FBVyxLQUFLLFVBQVUsRUFBRSxrQkFBa0IsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLENBQUMsQ0FBQztBQUU5RyxVQUFNLE9BQU8sc0JBQXNCLElBQUksT0FBSyxRQUFRLENBQUMsRUFBRSxLQUFLLElBQUk7QUFFaEUsVUFBTSxXQUFXLEdBQUcsTUFBTSxhQUFhO0FBQUE7QUFBQTtBQUFBLEVBQWtCLElBQUk7QUFBQTtBQUFBO0FBRTdELFVBQU0saUJBQWlCLFVBQVUsUUFBUTtBQUV6QyxXQUFPLEVBQUUsV0FBVyxTQUFTO0FBQUEsRUFDOUI7QUFDRDsiLAogICJuYW1lcyI6IFtdCn0K
