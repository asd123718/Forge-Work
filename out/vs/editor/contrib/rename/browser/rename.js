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
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { raceCancellation } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { CancellationError, onUnexpectedError } from "../../../../base/common/errors.js";
import { isMarkdownString } from "../../../../base/common/htmlContent.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { assertType } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import * as nls from "../../../../nls.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ConfigurationScope, Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IEditorProgressService } from "../../../../platform/progress/common/progress.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { EditorAction, EditorCommand, EditorContributionInstantiation, registerEditorAction, registerEditorCommand, registerEditorContribution, registerModelAndPositionCommand } from "../../../browser/editorExtensions.js";
import { IBulkEditService } from "../../../browser/services/bulkEditService.js";
import { ICodeEditorService } from "../../../browser/services/codeEditorService.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { NewSymbolNameTriggerKind } from "../../../common/languages.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { ITextResourceConfigurationService } from "../../../common/services/textResourceConfiguration.js";
import { EditSources } from "../../../common/textModelEditSource.js";
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from "../../editorState/browser/editorState.js";
import { MessageController } from "../../message/browser/messageController.js";
import { CONTEXT_RENAME_INPUT_VISIBLE, RenameWidget } from "./renameWidget.js";
class RenameSkeleton {
  constructor(model, position, registry) {
    this.model = model;
    this.position = position;
    this._providerRenameIdx = 0;
    this._providers = registry.ordered(model);
  }
  hasProvider() {
    return this._providers.length > 0;
  }
  async resolveRenameLocation(token) {
    const rejects = [];
    for (this._providerRenameIdx = 0; this._providerRenameIdx < this._providers.length; this._providerRenameIdx++) {
      const provider = this._providers[this._providerRenameIdx];
      if (!provider.resolveRenameLocation) {
        break;
      }
      const res = await provider.resolveRenameLocation(this.model, this.position, token);
      if (!res) {
        continue;
      }
      if (res.rejectReason) {
        rejects.push(res.rejectReason);
        continue;
      }
      return res;
    }
    this._providerRenameIdx = 0;
    const word = this.model.getWordAtPosition(this.position);
    if (!word) {
      return {
        range: Range.fromPositions(this.position),
        text: "",
        rejectReason: rejects.length > 0 ? rejects.join("\n") : void 0
      };
    }
    return {
      range: new Range(this.position.lineNumber, word.startColumn, this.position.lineNumber, word.endColumn),
      text: word.word,
      rejectReason: rejects.length > 0 ? rejects.join("\n") : void 0
    };
  }
  async provideRenameEdits(newName, token) {
    return this._provideRenameEdits(newName, this._providerRenameIdx, [], token);
  }
  async _provideRenameEdits(newName, i, rejects, token) {
    const provider = this._providers[i];
    if (!provider) {
      return {
        edits: [],
        rejectReason: rejects.join("\n")
      };
    }
    const result = await provider.provideRenameEdits(this.model, this.position, newName, token);
    if (!result) {
      return this._provideRenameEdits(newName, i + 1, rejects.concat(nls.localize("no result", "No result.")), token);
    } else if (result.rejectReason) {
      return this._provideRenameEdits(newName, i + 1, rejects.concat(result.rejectReason), token);
    }
    return result;
  }
}
function hasProvider(registry, model) {
  const providers = registry.ordered(model);
  return providers.length > 0;
}
async function prepareRename(registry, model, position, cancellationToken) {
  const skeleton = new RenameSkeleton(model, position, registry);
  return skeleton.resolveRenameLocation(cancellationToken ?? CancellationToken.None);
}
async function rawRename(registry, model, position, newName, cancellationToken) {
  const skeleton = new RenameSkeleton(model, position, registry);
  return skeleton.provideRenameEdits(newName, cancellationToken ?? CancellationToken.None);
}
async function rename(registry, model, position, newName) {
  const skeleton = new RenameSkeleton(model, position, registry);
  const loc = await skeleton.resolveRenameLocation(CancellationToken.None);
  if (loc?.rejectReason) {
    return { edits: [], rejectReason: loc.rejectReason };
  }
  return skeleton.provideRenameEdits(newName, CancellationToken.None);
}
let RenameController = class {
  constructor(editor, _instaService, _notificationService, _bulkEditService, _progressService, _logService, _configService, _languageFeaturesService) {
    this.editor = editor;
    this._instaService = _instaService;
    this._notificationService = _notificationService;
    this._bulkEditService = _bulkEditService;
    this._progressService = _progressService;
    this._logService = _logService;
    this._configService = _configService;
    this._languageFeaturesService = _languageFeaturesService;
    this._disposableStore = new DisposableStore();
    this._cts = new CancellationTokenSource();
    this._renameWidget = this._disposableStore.add(this._instaService.createInstance(RenameWidget, this.editor, ["acceptRenameInput", "acceptRenameInputWithPreview"]));
  }
  static get(editor) {
    return editor.getContribution(RenameController.ID);
  }
  dispose() {
    this._disposableStore.dispose();
    this._cts.dispose(true);
  }
  async run() {
    const trace = this._logService.trace.bind(this._logService, "[rename]");
    this._cts.dispose(true);
    this._cts = new CancellationTokenSource();
    if (!this.editor.hasModel()) {
      trace("editor has no model");
      return void 0;
    }
    const position = this.editor.getPosition();
    const skeleton = new RenameSkeleton(this.editor.getModel(), position, this._languageFeaturesService.renameProvider);
    if (!skeleton.hasProvider()) {
      trace("skeleton has no provider");
      return void 0;
    }
    const cts1 = new EditorStateCancellationTokenSource(this.editor, CodeEditorStateFlag.Position | CodeEditorStateFlag.Value, void 0, this._cts.token);
    let loc;
    try {
      trace("resolving rename location");
      const resolveLocationOperation = skeleton.resolveRenameLocation(cts1.token);
      this._progressService.showWhile(resolveLocationOperation, 250);
      loc = await resolveLocationOperation;
      trace("resolved rename location");
    } catch (e) {
      if (e instanceof CancellationError) {
        trace("resolve rename location cancelled", JSON.stringify(e, null, "	"));
      } else {
        trace("resolve rename location failed", e instanceof Error ? e : JSON.stringify(e, null, "	"));
        if (typeof e === "string" || isMarkdownString(e)) {
          MessageController.get(this.editor)?.showMessage(e || nls.localize("resolveRenameLocationFailed", "An unknown error occurred while resolving rename location"), position);
        }
      }
      return void 0;
    } finally {
      cts1.dispose();
    }
    if (!loc) {
      trace("returning early - no loc");
      return void 0;
    }
    if (loc.rejectReason) {
      trace(`returning early - rejected with reason: ${loc.rejectReason}`, loc.rejectReason);
      MessageController.get(this.editor)?.showMessage(loc.rejectReason, position);
      return void 0;
    }
    if (cts1.token.isCancellationRequested) {
      trace("returning early - cts1 cancelled");
      return void 0;
    }
    const cts2 = new EditorStateCancellationTokenSource(this.editor, CodeEditorStateFlag.Position | CodeEditorStateFlag.Value, loc.range, this._cts.token);
    const model = this.editor.getModel();
    const newSymbolNamesProviders = this._languageFeaturesService.newSymbolNamesProvider.all(model);
    const resolvedNewSymbolnamesProviders = await Promise.all(newSymbolNamesProviders.map(async (p) => [p, await p.supportsAutomaticNewSymbolNamesTriggerKind ?? false]));
    const requestRenameSuggestions = (triggerKind, cts) => {
      let providers = resolvedNewSymbolnamesProviders.slice();
      if (triggerKind === NewSymbolNameTriggerKind.Automatic) {
        providers = providers.filter(([_, supportsAutomatic]) => supportsAutomatic);
      }
      return providers.map(([p]) => p.provideNewSymbolNames(model, loc.range, triggerKind, cts));
    };
    trace("creating rename input field and awaiting its result");
    const supportPreview = this._bulkEditService.hasPreviewHandler() && this._configService.getValue(this.editor.getModel().uri, "editor.rename.enablePreview");
    const inputFieldResult = await this._renameWidget.getInput(
      loc.range,
      loc.text,
      supportPreview,
      newSymbolNamesProviders.length > 0 ? requestRenameSuggestions : void 0,
      cts2
    );
    trace("received response from rename input field");
    if (typeof inputFieldResult === "boolean") {
      trace(`returning early - rename input field response - ${inputFieldResult}`);
      if (inputFieldResult) {
        this.editor.focus();
      }
      cts2.dispose();
      return void 0;
    }
    this.editor.focus();
    trace("requesting rename edits");
    const renameOperation = raceCancellation(skeleton.provideRenameEdits(inputFieldResult.newName, cts2.token), cts2.token).then(async (renameResult) => {
      if (!renameResult) {
        trace("returning early - no rename edits result");
        return;
      }
      if (!this.editor.hasModel()) {
        trace("returning early - no model after rename edits are provided");
        return;
      }
      if (renameResult.rejectReason) {
        trace(`returning early - rejected with reason: ${renameResult.rejectReason}`);
        this._notificationService.info(renameResult.rejectReason);
        return;
      }
      this.editor.setSelection(Range.fromPositions(this.editor.getSelection().getPosition()));
      trace("applying edits");
      this._bulkEditService.apply(renameResult, {
        editor: this.editor,
        showPreview: inputFieldResult.wantsPreview,
        label: nls.localize("label", "Renaming '{0}' to '{1}'", loc?.text, inputFieldResult.newName),
        code: "undoredo.rename",
        quotableLabel: nls.localize("quotableLabel", "Renaming {0} to {1}", loc?.text, inputFieldResult.newName),
        respectAutoSaveConfig: true,
        reason: EditSources.rename(loc?.text, inputFieldResult.newName)
      }).then((result) => {
        trace("edits applied");
        if (result.ariaSummary) {
          alert(nls.localize("aria", "Successfully renamed '{0}' to '{1}'. Summary: {2}", loc.text, inputFieldResult.newName, result.ariaSummary));
        }
      }).catch((err) => {
        trace(`error when applying edits ${JSON.stringify(err, null, "	")}`);
        this._notificationService.error(nls.localize("rename.failedApply", "Rename failed to apply edits"));
        this._logService.error(err);
      });
    }, (err) => {
      trace("error when providing rename edits", JSON.stringify(err, null, "	"));
      this._notificationService.error(nls.localize("rename.failed", "Rename failed to compute edits"));
      this._logService.error(err);
    }).finally(() => {
      cts2.dispose();
    });
    trace("returning rename operation");
    this._progressService.showWhile(renameOperation, 250);
    return renameOperation;
  }
  acceptRenameInput(wantsPreview) {
    this._renameWidget.acceptInput(wantsPreview);
  }
  cancelRenameInput() {
    this._renameWidget.cancelInput(true, "cancelRenameInput command");
  }
  focusNextRenameSuggestion() {
    this._renameWidget.focusNextRenameSuggestion();
  }
  focusPreviousRenameSuggestion() {
    this._renameWidget.focusPreviousRenameSuggestion();
  }
};
RenameController.ID = "editor.contrib.renameController";
RenameController = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IBulkEditService),
  __decorateParam(4, IEditorProgressService),
  __decorateParam(5, ILogService),
  __decorateParam(6, ITextResourceConfigurationService),
  __decorateParam(7, ILanguageFeaturesService)
], RenameController);
class RenameAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.rename",
      label: nls.localize2("rename.label", "Rename Symbol"),
      precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasRenameProvider),
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyCode.F2,
        weight: KeybindingWeight.EditorContrib
      },
      contextMenuOpts: {
        group: "1_modification",
        order: 1.1
      },
      canTriggerInlineEdits: true
    });
  }
  runCommand(accessor, args) {
    const editorService = accessor.get(ICodeEditorService);
    const [uri, pos] = Array.isArray(args) && args || [void 0, void 0];
    if (URI.isUri(uri) && Position.isIPosition(pos)) {
      return editorService.openCodeEditor({ resource: uri }, editorService.getActiveCodeEditor()).then((editor) => {
        if (!editor) {
          return;
        }
        editor.setPosition(pos);
        editor.invokeWithinContext((accessor2) => {
          this.reportTelemetry(accessor2, editor);
          return this.run(accessor2, editor);
        });
      }, onUnexpectedError);
    }
    return super.runCommand(accessor, args);
  }
  run(accessor, editor) {
    const logService = accessor.get(ILogService);
    const controller = RenameController.get(editor);
    if (controller) {
      logService.trace("[RenameAction] got controller, running...");
      return controller.run();
    }
    logService.trace("[RenameAction] returning early - controller missing");
    return Promise.resolve();
  }
}
registerEditorContribution(RenameController.ID, RenameController, EditorContributionInstantiation.Lazy);
registerEditorAction(RenameAction);
const RenameCommand = EditorCommand.bindToContribution(RenameController.get);
registerEditorCommand(new RenameCommand({
  id: "acceptRenameInput",
  precondition: CONTEXT_RENAME_INPUT_VISIBLE,
  handler: (x) => x.acceptRenameInput(false),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 99,
    kbExpr: EditorContextKeys.focus,
    primary: KeyCode.Enter
  }
}));
registerEditorCommand(new RenameCommand({
  id: "acceptRenameInputWithPreview",
  precondition: ContextKeyExpr.and(CONTEXT_RENAME_INPUT_VISIBLE, ContextKeyExpr.has("config.editor.rename.enablePreview")),
  handler: (x) => x.acceptRenameInput(true),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 99,
    kbExpr: EditorContextKeys.focus,
    primary: KeyMod.CtrlCmd + KeyCode.Enter
  }
}));
registerEditorCommand(new RenameCommand({
  id: "cancelRenameInput",
  precondition: CONTEXT_RENAME_INPUT_VISIBLE,
  handler: (x) => x.cancelRenameInput(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 99,
    kbExpr: EditorContextKeys.focus,
    primary: KeyCode.Escape,
    secondary: [KeyMod.Shift | KeyCode.Escape]
  }
}));
registerAction2(class FocusNextRenameSuggestion extends Action2 {
  constructor() {
    super({
      id: "focusNextRenameSuggestion",
      title: {
        ...nls.localize2("focusNextRenameSuggestion", "Focus Next Rename Suggestion")
      },
      precondition: CONTEXT_RENAME_INPUT_VISIBLE,
      keybinding: [
        {
          primary: KeyCode.DownArrow,
          weight: KeybindingWeight.EditorContrib + 99
        }
      ]
    });
  }
  run(accessor) {
    const currentEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
    if (!currentEditor) {
      return;
    }
    const controller = RenameController.get(currentEditor);
    if (!controller) {
      return;
    }
    controller.focusNextRenameSuggestion();
  }
});
registerAction2(class FocusPreviousRenameSuggestion extends Action2 {
  constructor() {
    super({
      id: "focusPreviousRenameSuggestion",
      title: {
        ...nls.localize2("focusPreviousRenameSuggestion", "Focus Previous Rename Suggestion")
      },
      precondition: CONTEXT_RENAME_INPUT_VISIBLE,
      keybinding: [
        {
          primary: KeyCode.UpArrow,
          weight: KeybindingWeight.EditorContrib + 99
        }
      ]
    });
  }
  run(accessor) {
    const currentEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
    if (!currentEditor) {
      return;
    }
    const controller = RenameController.get(currentEditor);
    if (!controller) {
      return;
    }
    controller.focusPreviousRenameSuggestion();
  }
});
registerModelAndPositionCommand("_executeDocumentRenameProvider", function(accessor, model, position, ...args) {
  const [newName] = args;
  assertType(typeof newName === "string");
  const { renameProvider } = accessor.get(ILanguageFeaturesService);
  return rename(renameProvider, model, position, newName);
});
registerModelAndPositionCommand("_executePrepareRename", async function(accessor, model, position) {
  const { renameProvider } = accessor.get(ILanguageFeaturesService);
  const skeleton = new RenameSkeleton(model, position, renameProvider);
  const loc = await skeleton.resolveRenameLocation(CancellationToken.None);
  if (loc?.rejectReason) {
    throw new Error(loc.rejectReason);
  }
  return loc;
});
Registry.as(Extensions.Configuration).registerConfiguration({
  id: "editor",
  properties: {
    "editor.rename.enablePreview": {
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      description: nls.localize("enablePreview", "Enable/disable the ability to preview changes before renaming"),
      default: true,
      type: "boolean"
    }
  }
});
export {
  RenameAction,
  hasProvider,
  prepareRename,
  rawRename,
  rename
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHJlbmFtZVxcYnJvd3NlclxccmVuYW1lLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYWxlcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IHJhY2VDYW5jZWxsYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IsIG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IGlzTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXNzZXJ0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblNjb3BlLCBFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGlvbiwgRWRpdG9yQ29tbWFuZCwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbiwgU2VydmljZXNBY2Nlc3NvciwgcmVnaXN0ZXJFZGl0b3JBY3Rpb24sIHJlZ2lzdGVyRWRpdG9yQ29tbWFuZCwgcmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24sIHJlZ2lzdGVyTW9kZWxBbmRQb3NpdGlvbkNvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUJ1bGtFZGl0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvc2VydmljZXMvYnVsa0VkaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uLCBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgTmV3U3ltYm9sTmFtZVRyaWdnZXJLaW5kLCBSZWplY3Rpb24sIFJlbmFtZUxvY2F0aW9uLCBSZW5hbWVQcm92aWRlciwgV29ya3NwYWNlRWRpdCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFZGl0U291cmNlcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90ZXh0TW9kZWxFZGl0U291cmNlLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JTdGF0ZUZsYWcsIEVkaXRvclN0YXRlQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi9lZGl0b3JTdGF0ZS9icm93c2VyL2VkaXRvclN0YXRlLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vbWVzc2FnZS9icm93c2VyL21lc3NhZ2VDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IENPTlRFWFRfUkVOQU1FX0lOUFVUX1ZJU0lCTEUsIFJlbmFtZVdpZGdldCB9IGZyb20gJy4vcmVuYW1lV2lkZ2V0LmpzJztcblxuY2xhc3MgUmVuYW1lU2tlbGV0b24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyczogUmVuYW1lUHJvdmlkZXJbXTtcblx0cHJpdmF0ZSBfcHJvdmlkZXJSZW5hbWVJZHg6IG51bWJlciA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtb2RlbDogSVRleHRNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHBvc2l0aW9uOiBQb3NpdGlvbixcblx0XHRyZWdpc3RyeTogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8UmVuYW1lUHJvdmlkZXI+XG5cdCkge1xuXHRcdHRoaXMuX3Byb3ZpZGVycyA9IHJlZ2lzdHJ5Lm9yZGVyZWQobW9kZWwpO1xuXHR9XG5cblx0aGFzUHJvdmlkZXIoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3ZpZGVycy5sZW5ndGggPiAwO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZVJlbmFtZUxvY2F0aW9uKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8UmVuYW1lTG9jYXRpb24gJiBSZWplY3Rpb24gfCB1bmRlZmluZWQ+IHtcblxuXHRcdGNvbnN0IHJlamVjdHM6IHN0cmluZ1tdID0gW107XG5cblx0XHRmb3IgKHRoaXMuX3Byb3ZpZGVyUmVuYW1lSWR4ID0gMDsgdGhpcy5fcHJvdmlkZXJSZW5hbWVJZHggPCB0aGlzLl9wcm92aWRlcnMubGVuZ3RoOyB0aGlzLl9wcm92aWRlclJlbmFtZUlkeCsrKSB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX3Byb3ZpZGVyc1t0aGlzLl9wcm92aWRlclJlbmFtZUlkeF07XG5cdFx0XHRpZiAoIXByb3ZpZGVyLnJlc29sdmVSZW5hbWVMb2NhdGlvbikge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IHByb3ZpZGVyLnJlc29sdmVSZW5hbWVMb2NhdGlvbih0aGlzLm1vZGVsLCB0aGlzLnBvc2l0aW9uLCB0b2tlbik7XG5cdFx0XHRpZiAoIXJlcykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXMucmVqZWN0UmVhc29uKSB7XG5cdFx0XHRcdHJlamVjdHMucHVzaChyZXMucmVqZWN0UmVhc29uKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzO1xuXHRcdH1cblxuXHRcdC8vIHdlIGFyZSBoZXJlIHdoZW4gbm8gcHJvdmlkZXIgcHJlcGFyZWQgYSBsb2NhdGlvbiB3aGljaCBtZWFucyB3ZSBjYW5cblx0XHQvLyBqdXN0IHJlbHkgb24gdGhlIHdvcmQgdW5kZXIgY3Vyc29yIGFuZCBzdGFydCB3aXRoIHRoZSBmaXJzdCBwcm92aWRlclxuXHRcdHRoaXMuX3Byb3ZpZGVyUmVuYW1lSWR4ID0gMDtcblxuXHRcdGNvbnN0IHdvcmQgPSB0aGlzLm1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKHRoaXMucG9zaXRpb24pO1xuXHRcdGlmICghd29yZCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmFuZ2U6IFJhbmdlLmZyb21Qb3NpdGlvbnModGhpcy5wb3NpdGlvbiksXG5cdFx0XHRcdHRleHQ6ICcnLFxuXHRcdFx0XHRyZWplY3RSZWFzb246IHJlamVjdHMubGVuZ3RoID4gMCA/IHJlamVjdHMuam9pbignXFxuJykgOiB1bmRlZmluZWRcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKHRoaXMucG9zaXRpb24ubGluZU51bWJlciwgd29yZC5zdGFydENvbHVtbiwgdGhpcy5wb3NpdGlvbi5saW5lTnVtYmVyLCB3b3JkLmVuZENvbHVtbiksXG5cdFx0XHR0ZXh0OiB3b3JkLndvcmQsXG5cdFx0XHRyZWplY3RSZWFzb246IHJlamVjdHMubGVuZ3RoID4gMCA/IHJlamVjdHMuam9pbignXFxuJykgOiB1bmRlZmluZWRcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZVJlbmFtZUVkaXRzKG5ld05hbWU6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxXb3Jrc3BhY2VFZGl0ICYgUmVqZWN0aW9uPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3ZpZGVSZW5hbWVFZGl0cyhuZXdOYW1lLCB0aGlzLl9wcm92aWRlclJlbmFtZUlkeCwgW10sIHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Byb3ZpZGVSZW5hbWVFZGl0cyhuZXdOYW1lOiBzdHJpbmcsIGk6IG51bWJlciwgcmVqZWN0czogc3RyaW5nW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8V29ya3NwYWNlRWRpdCAmIFJlamVjdGlvbj4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fcHJvdmlkZXJzW2ldO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGVkaXRzOiBbXSxcblx0XHRcdFx0cmVqZWN0UmVhc29uOiByZWplY3RzLmpvaW4oJ1xcbicpXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVSZW5hbWVFZGl0cyh0aGlzLm1vZGVsLCB0aGlzLnBvc2l0aW9uLCBuZXdOYW1lLCB0b2tlbik7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9wcm92aWRlUmVuYW1lRWRpdHMobmV3TmFtZSwgaSArIDEsIHJlamVjdHMuY29uY2F0KG5scy5sb2NhbGl6ZSgnbm8gcmVzdWx0JywgXCJObyByZXN1bHQuXCIpKSwgdG9rZW4pO1xuXHRcdH0gZWxzZSBpZiAocmVzdWx0LnJlamVjdFJlYXNvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Byb3ZpZGVSZW5hbWVFZGl0cyhuZXdOYW1lLCBpICsgMSwgcmVqZWN0cy5jb25jYXQocmVzdWx0LnJlamVjdFJlYXNvbiksIHRva2VuKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzUHJvdmlkZXIocmVnaXN0cnk6IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5PFJlbmFtZVByb3ZpZGVyPiwgbW9kZWw6IElUZXh0TW9kZWwpOiBib29sZWFuIHtcblx0Y29uc3QgcHJvdmlkZXJzID0gcmVnaXN0cnkub3JkZXJlZChtb2RlbCk7XG5cdHJldHVybiBwcm92aWRlcnMubGVuZ3RoID4gMDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHByZXBhcmVSZW5hbWUocmVnaXN0cnk6IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5PFJlbmFtZVByb3ZpZGVyPiwgbW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgY2FuY2VsbGF0aW9uVG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8UmVuYW1lTG9jYXRpb24gJiBSZWplY3Rpb24gfCB1bmRlZmluZWQ+IHtcblx0Y29uc3Qgc2tlbGV0b24gPSBuZXcgUmVuYW1lU2tlbGV0b24obW9kZWwsIHBvc2l0aW9uLCByZWdpc3RyeSk7XG5cdHJldHVybiBza2VsZXRvbi5yZXNvbHZlUmVuYW1lTG9jYXRpb24oY2FuY2VsbGF0aW9uVG9rZW4gPz8gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByYXdSZW5hbWUocmVnaXN0cnk6IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5PFJlbmFtZVByb3ZpZGVyPiwgbW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgbmV3TmFtZTogc3RyaW5nLCBjYW5jZWxsYXRpb25Ub2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxXb3Jrc3BhY2VFZGl0ICYgUmVqZWN0aW9uPiB7XG5cdGNvbnN0IHNrZWxldG9uID0gbmV3IFJlbmFtZVNrZWxldG9uKG1vZGVsLCBwb3NpdGlvbiwgcmVnaXN0cnkpO1xuXHRyZXR1cm4gc2tlbGV0b24ucHJvdmlkZVJlbmFtZUVkaXRzKG5ld05hbWUsIGNhbmNlbGxhdGlvblRva2VuID8/IENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVuYW1lKHJlZ2lzdHJ5OiBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTxSZW5hbWVQcm92aWRlcj4sIG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIG5ld05hbWU6IHN0cmluZyk6IFByb21pc2U8V29ya3NwYWNlRWRpdCAmIFJlamVjdGlvbj4ge1xuXHRjb25zdCBza2VsZXRvbiA9IG5ldyBSZW5hbWVTa2VsZXRvbihtb2RlbCwgcG9zaXRpb24sIHJlZ2lzdHJ5KTtcblx0Y29uc3QgbG9jID0gYXdhaXQgc2tlbGV0b24ucmVzb2x2ZVJlbmFtZUxvY2F0aW9uKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRpZiAobG9jPy5yZWplY3RSZWFzb24pIHtcblx0XHRyZXR1cm4geyBlZGl0czogW10sIHJlamVjdFJlYXNvbjogbG9jLnJlamVjdFJlYXNvbiB9O1xuXHR9XG5cdHJldHVybiBza2VsZXRvbi5wcm92aWRlUmVuYW1lRWRpdHMobmV3TmFtZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG59XG5cbi8vIC0tLSAgcmVnaXN0ZXIgYWN0aW9ucyBhbmQgY29tbWFuZHNcblxuY2xhc3MgUmVuYW1lQ29udHJvbGxlciBpbXBsZW1lbnRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmNvbnRyaWIucmVuYW1lQ29udHJvbGxlcic7XG5cblx0c3RhdGljIGdldChlZGl0b3I6IElDb2RlRWRpdG9yKTogUmVuYW1lQ29udHJvbGxlciB8IG51bGwge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPFJlbmFtZUNvbnRyb2xsZXI+KFJlbmFtZUNvbnRyb2xsZXIuSUQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVuYW1lV2lkZ2V0OiBSZW5hbWVXaWRnZXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSBfY3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUJ1bGtFZGl0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9idWxrRWRpdFNlcnZpY2U6IElCdWxrRWRpdFNlcnZpY2UsXG5cdFx0QElFZGl0b3JQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZ3Jlc3NTZXJ2aWNlOiBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ1NlcnZpY2U6IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuX3JlbmFtZVdpZGdldCA9IHRoaXMuX2Rpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5faW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlbmFtZVdpZGdldCwgdGhpcy5lZGl0b3IsIFsnYWNjZXB0UmVuYW1lSW5wdXQnLCAnYWNjZXB0UmVuYW1lSW5wdXRXaXRoUHJldmlldyddKSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVTdG9yZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fY3RzLmRpc3Bvc2UodHJ1ZSk7XG5cdH1cblxuXHRhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRjb25zdCB0cmFjZSA9IHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UuYmluZCh0aGlzLl9sb2dTZXJ2aWNlLCAnW3JlbmFtZV0nKTtcblxuXHRcdC8vIHNldCB1cCBjYW5jZWxsYXRpb24gdG9rZW4gdG8gcHJldmVudCByZWVudHJhbnQgcmVuYW1lLCB0aGlzXG5cdFx0Ly8gaXMgdGhlIHBhcmVudCB0byB0aGUgcmVzb2x2ZS0gYW5kIHJlbmFtZS10b2tlbnNcblx0XHR0aGlzLl9jdHMuZGlzcG9zZSh0cnVlKTtcblx0XHR0aGlzLl9jdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRcdGlmICghdGhpcy5lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0dHJhY2UoJ2VkaXRvciBoYXMgbm8gbW9kZWwnKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLmVkaXRvci5nZXRQb3NpdGlvbigpO1xuXHRcdGNvbnN0IHNrZWxldG9uID0gbmV3IFJlbmFtZVNrZWxldG9uKHRoaXMuZWRpdG9yLmdldE1vZGVsKCksIHBvc2l0aW9uLCB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5yZW5hbWVQcm92aWRlcik7XG5cblx0XHRpZiAoIXNrZWxldG9uLmhhc1Byb3ZpZGVyKCkpIHtcblx0XHRcdHRyYWNlKCdza2VsZXRvbiBoYXMgbm8gcHJvdmlkZXInKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gcGFydCAxIC0gcmVzb2x2ZSByZW5hbWUgbG9jYXRpb25cblx0XHRjb25zdCBjdHMxID0gbmV3IEVkaXRvclN0YXRlQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UodGhpcy5lZGl0b3IsIENvZGVFZGl0b3JTdGF0ZUZsYWcuUG9zaXRpb24gfCBDb2RlRWRpdG9yU3RhdGVGbGFnLlZhbHVlLCB1bmRlZmluZWQsIHRoaXMuX2N0cy50b2tlbik7XG5cblx0XHRsZXQgbG9jOiBSZW5hbWVMb2NhdGlvbiAmIFJlamVjdGlvbiB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0dHJhY2UoJ3Jlc29sdmluZyByZW5hbWUgbG9jYXRpb24nKTtcblx0XHRcdGNvbnN0IHJlc29sdmVMb2NhdGlvbk9wZXJhdGlvbiA9IHNrZWxldG9uLnJlc29sdmVSZW5hbWVMb2NhdGlvbihjdHMxLnRva2VuKTtcblx0XHRcdHRoaXMuX3Byb2dyZXNzU2VydmljZS5zaG93V2hpbGUocmVzb2x2ZUxvY2F0aW9uT3BlcmF0aW9uLCAyNTApO1xuXHRcdFx0bG9jID0gYXdhaXQgcmVzb2x2ZUxvY2F0aW9uT3BlcmF0aW9uO1xuXHRcdFx0dHJhY2UoJ3Jlc29sdmVkIHJlbmFtZSBsb2NhdGlvbicpO1xuXHRcdH0gY2F0Y2ggKGU6IHVua25vd24pIHtcblx0XHRcdGlmIChlIGluc3RhbmNlb2YgQ2FuY2VsbGF0aW9uRXJyb3IpIHtcblx0XHRcdFx0dHJhY2UoJ3Jlc29sdmUgcmVuYW1lIGxvY2F0aW9uIGNhbmNlbGxlZCcsIEpTT04uc3RyaW5naWZ5KGUsIG51bGwsICdcXHQnKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0cmFjZSgncmVzb2x2ZSByZW5hbWUgbG9jYXRpb24gZmFpbGVkJywgZSBpbnN0YW5jZW9mIEVycm9yID8gZSA6IEpTT04uc3RyaW5naWZ5KGUsIG51bGwsICdcXHQnKSk7XG5cdFx0XHRcdGlmICh0eXBlb2YgZSA9PT0gJ3N0cmluZycgfHwgaXNNYXJrZG93blN0cmluZyhlKSkge1xuXHRcdFx0XHRcdE1lc3NhZ2VDb250cm9sbGVyLmdldCh0aGlzLmVkaXRvcik/LnNob3dNZXNzYWdlKGUgfHwgbmxzLmxvY2FsaXplKCdyZXNvbHZlUmVuYW1lTG9jYXRpb25GYWlsZWQnLCBcIkFuIHVua25vd24gZXJyb3Igb2NjdXJyZWQgd2hpbGUgcmVzb2x2aW5nIHJlbmFtZSBsb2NhdGlvblwiKSwgcG9zaXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGN0czEuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdGlmICghbG9jKSB7XG5cdFx0XHR0cmFjZSgncmV0dXJuaW5nIGVhcmx5IC0gbm8gbG9jJyk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChsb2MucmVqZWN0UmVhc29uKSB7XG5cdFx0XHR0cmFjZShgcmV0dXJuaW5nIGVhcmx5IC0gcmVqZWN0ZWQgd2l0aCByZWFzb246ICR7bG9jLnJlamVjdFJlYXNvbn1gLCBsb2MucmVqZWN0UmVhc29uKTtcblx0XHRcdE1lc3NhZ2VDb250cm9sbGVyLmdldCh0aGlzLmVkaXRvcik/LnNob3dNZXNzYWdlKGxvYy5yZWplY3RSZWFzb24sIHBvc2l0aW9uKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGN0czEudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRyYWNlKCdyZXR1cm5pbmcgZWFybHkgLSBjdHMxIGNhbmNlbGxlZCcpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBwYXJ0IDIgLSBkbyByZW5hbWUgYXQgbG9jYXRpb25cblx0XHRjb25zdCBjdHMyID0gbmV3IEVkaXRvclN0YXRlQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UodGhpcy5lZGl0b3IsIENvZGVFZGl0b3JTdGF0ZUZsYWcuUG9zaXRpb24gfCBDb2RlRWRpdG9yU3RhdGVGbGFnLlZhbHVlLCBsb2MucmFuZ2UsIHRoaXMuX2N0cy50b2tlbik7XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7IC8vIEB1bHVnYmVrbmE6IGFzc3VtZXMgZWRpdG9yIHN0aWxsIGhhcyBhIG1vZGVsLCBvdGhlcndpc2UsIGN0czEgc2hvdWxkJ3ZlIGJlZW4gY2FuY2VsbGVkXG5cblx0XHRjb25zdCBuZXdTeW1ib2xOYW1lc1Byb3ZpZGVycyA9IHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLm5ld1N5bWJvbE5hbWVzUHJvdmlkZXIuYWxsKG1vZGVsKTtcblxuXHRcdGNvbnN0IHJlc29sdmVkTmV3U3ltYm9sbmFtZXNQcm92aWRlcnMgPSBhd2FpdCBQcm9taXNlLmFsbChuZXdTeW1ib2xOYW1lc1Byb3ZpZGVycy5tYXAoYXN5bmMgcCA9PiBbcCwgYXdhaXQgcC5zdXBwb3J0c0F1dG9tYXRpY05ld1N5bWJvbE5hbWVzVHJpZ2dlcktpbmQgPz8gZmFsc2VdIGFzIGNvbnN0KSk7XG5cblx0XHRjb25zdCByZXF1ZXN0UmVuYW1lU3VnZ2VzdGlvbnMgPSAodHJpZ2dlcktpbmQ6IE5ld1N5bWJvbE5hbWVUcmlnZ2VyS2luZCwgY3RzOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0bGV0IHByb3ZpZGVycyA9IHJlc29sdmVkTmV3U3ltYm9sbmFtZXNQcm92aWRlcnMuc2xpY2UoKTtcblxuXHRcdFx0aWYgKHRyaWdnZXJLaW5kID09PSBOZXdTeW1ib2xOYW1lVHJpZ2dlcktpbmQuQXV0b21hdGljKSB7XG5cdFx0XHRcdHByb3ZpZGVycyA9IHByb3ZpZGVycy5maWx0ZXIoKFtfLCBzdXBwb3J0c0F1dG9tYXRpY10pID0+IHN1cHBvcnRzQXV0b21hdGljKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHByb3ZpZGVycy5tYXAoKFtwLF0pID0+IHAucHJvdmlkZU5ld1N5bWJvbE5hbWVzKG1vZGVsLCBsb2MucmFuZ2UsIHRyaWdnZXJLaW5kLCBjdHMpKTtcblx0XHR9O1xuXG5cdFx0dHJhY2UoJ2NyZWF0aW5nIHJlbmFtZSBpbnB1dCBmaWVsZCBhbmQgYXdhaXRpbmcgaXRzIHJlc3VsdCcpO1xuXHRcdGNvbnN0IHN1cHBvcnRQcmV2aWV3ID0gdGhpcy5fYnVsa0VkaXRTZXJ2aWNlLmhhc1ByZXZpZXdIYW5kbGVyKCkgJiYgdGhpcy5fY29uZmlnU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPih0aGlzLmVkaXRvci5nZXRNb2RlbCgpLnVyaSwgJ2VkaXRvci5yZW5hbWUuZW5hYmxlUHJldmlldycpO1xuXHRcdGNvbnN0IGlucHV0RmllbGRSZXN1bHQgPSBhd2FpdCB0aGlzLl9yZW5hbWVXaWRnZXQuZ2V0SW5wdXQoXG5cdFx0XHRsb2MucmFuZ2UsXG5cdFx0XHRsb2MudGV4dCxcblx0XHRcdHN1cHBvcnRQcmV2aWV3LFxuXHRcdFx0bmV3U3ltYm9sTmFtZXNQcm92aWRlcnMubGVuZ3RoID4gMCA/IHJlcXVlc3RSZW5hbWVTdWdnZXN0aW9ucyA6IHVuZGVmaW5lZCxcblx0XHRcdGN0czJcblx0XHQpO1xuXHRcdHRyYWNlKCdyZWNlaXZlZCByZXNwb25zZSBmcm9tIHJlbmFtZSBpbnB1dCBmaWVsZCcpO1xuXG5cdFx0Ly8gbm8gcmVzdWx0LCBvbmx5IGhpbnQgdG8gZm9jdXMgdGhlIGVkaXRvciBvciBub3Rcblx0XHRpZiAodHlwZW9mIGlucHV0RmllbGRSZXN1bHQgPT09ICdib29sZWFuJykge1xuXHRcdFx0dHJhY2UoYHJldHVybmluZyBlYXJseSAtIHJlbmFtZSBpbnB1dCBmaWVsZCByZXNwb25zZSAtICR7aW5wdXRGaWVsZFJlc3VsdH1gKTtcblx0XHRcdGlmIChpbnB1dEZpZWxkUmVzdWx0KSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0XHRjdHMyLmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5lZGl0b3IuZm9jdXMoKTtcblxuXHRcdHRyYWNlKCdyZXF1ZXN0aW5nIHJlbmFtZSBlZGl0cycpO1xuXHRcdGNvbnN0IHJlbmFtZU9wZXJhdGlvbiA9IHJhY2VDYW5jZWxsYXRpb24oc2tlbGV0b24ucHJvdmlkZVJlbmFtZUVkaXRzKGlucHV0RmllbGRSZXN1bHQubmV3TmFtZSwgY3RzMi50b2tlbiksIGN0czIudG9rZW4pLnRoZW4oYXN5bmMgcmVuYW1lUmVzdWx0ID0+IHtcblxuXHRcdFx0aWYgKCFyZW5hbWVSZXN1bHQpIHtcblx0XHRcdFx0dHJhY2UoJ3JldHVybmluZyBlYXJseSAtIG5vIHJlbmFtZSBlZGl0cyByZXN1bHQnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLmVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdHRyYWNlKCdyZXR1cm5pbmcgZWFybHkgLSBubyBtb2RlbCBhZnRlciByZW5hbWUgZWRpdHMgYXJlIHByb3ZpZGVkJyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlbmFtZVJlc3VsdC5yZWplY3RSZWFzb24pIHtcblx0XHRcdFx0dHJhY2UoYHJldHVybmluZyBlYXJseSAtIHJlamVjdGVkIHdpdGggcmVhc29uOiAke3JlbmFtZVJlc3VsdC5yZWplY3RSZWFzb259YCk7XG5cdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhyZW5hbWVSZXN1bHQucmVqZWN0UmVhc29uKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBjb2xsYXBzZSBzZWxlY3Rpb24gdG8gYWN0aXZlIGVuZFxuXHRcdFx0dGhpcy5lZGl0b3Iuc2V0U2VsZWN0aW9uKFJhbmdlLmZyb21Qb3NpdGlvbnModGhpcy5lZGl0b3IuZ2V0U2VsZWN0aW9uKCkuZ2V0UG9zaXRpb24oKSkpO1xuXG5cdFx0XHR0cmFjZSgnYXBwbHlpbmcgZWRpdHMnKTtcblxuXHRcdFx0dGhpcy5fYnVsa0VkaXRTZXJ2aWNlLmFwcGx5KHJlbmFtZVJlc3VsdCwge1xuXHRcdFx0XHRlZGl0b3I6IHRoaXMuZWRpdG9yLFxuXHRcdFx0XHRzaG93UHJldmlldzogaW5wdXRGaWVsZFJlc3VsdC53YW50c1ByZXZpZXcsXG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2xhYmVsJywgXCJSZW5hbWluZyAnezB9JyB0byAnezF9J1wiLCBsb2M/LnRleHQsIGlucHV0RmllbGRSZXN1bHQubmV3TmFtZSksXG5cdFx0XHRcdGNvZGU6ICd1bmRvcmVkby5yZW5hbWUnLFxuXHRcdFx0XHRxdW90YWJsZUxhYmVsOiBubHMubG9jYWxpemUoJ3F1b3RhYmxlTGFiZWwnLCBcIlJlbmFtaW5nIHswfSB0byB7MX1cIiwgbG9jPy50ZXh0LCBpbnB1dEZpZWxkUmVzdWx0Lm5ld05hbWUpLFxuXHRcdFx0XHRyZXNwZWN0QXV0b1NhdmVDb25maWc6IHRydWUsXG5cdFx0XHRcdHJlYXNvbjogRWRpdFNvdXJjZXMucmVuYW1lKGxvYz8udGV4dCwgaW5wdXRGaWVsZFJlc3VsdC5uZXdOYW1lKSxcblx0XHRcdH0pLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0dHJhY2UoJ2VkaXRzIGFwcGxpZWQnKTtcblx0XHRcdFx0aWYgKHJlc3VsdC5hcmlhU3VtbWFyeSkge1xuXHRcdFx0XHRcdGFsZXJ0KG5scy5sb2NhbGl6ZSgnYXJpYScsIFwiU3VjY2Vzc2Z1bGx5IHJlbmFtZWQgJ3swfScgdG8gJ3sxfScuIFN1bW1hcnk6IHsyfVwiLCBsb2MudGV4dCwgaW5wdXRGaWVsZFJlc3VsdC5uZXdOYW1lLCByZXN1bHQuYXJpYVN1bW1hcnkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0dHJhY2UoYGVycm9yIHdoZW4gYXBwbHlpbmcgZWRpdHMgJHtKU09OLnN0cmluZ2lmeShlcnIsIG51bGwsICdcXHQnKX1gKTtcblx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihubHMubG9jYWxpemUoJ3JlbmFtZS5mYWlsZWRBcHBseScsIFwiUmVuYW1lIGZhaWxlZCB0byBhcHBseSBlZGl0c1wiKSk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdH0pO1xuXG5cdFx0fSwgZXJyID0+IHtcblx0XHRcdHRyYWNlKCdlcnJvciB3aGVuIHByb3ZpZGluZyByZW5hbWUgZWRpdHMnLCBKU09OLnN0cmluZ2lmeShlcnIsIG51bGwsICdcXHQnKSk7XG5cblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobmxzLmxvY2FsaXplKCdyZW5hbWUuZmFpbGVkJywgXCJSZW5hbWUgZmFpbGVkIHRvIGNvbXB1dGUgZWRpdHNcIikpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIpO1xuXG5cdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRjdHMyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRyYWNlKCdyZXR1cm5pbmcgcmVuYW1lIG9wZXJhdGlvbicpO1xuXG5cdFx0dGhpcy5fcHJvZ3Jlc3NTZXJ2aWNlLnNob3dXaGlsZShyZW5hbWVPcGVyYXRpb24sIDI1MCk7XG5cdFx0cmV0dXJuIHJlbmFtZU9wZXJhdGlvbjtcblxuXHR9XG5cblx0YWNjZXB0UmVuYW1lSW5wdXQod2FudHNQcmV2aWV3OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVuYW1lV2lkZ2V0LmFjY2VwdElucHV0KHdhbnRzUHJldmlldyk7XG5cdH1cblxuXHRjYW5jZWxSZW5hbWVJbnB1dCgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZW5hbWVXaWRnZXQuY2FuY2VsSW5wdXQodHJ1ZSwgJ2NhbmNlbFJlbmFtZUlucHV0IGNvbW1hbmQnKTtcblx0fVxuXG5cdGZvY3VzTmV4dFJlbmFtZVN1Z2dlc3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVuYW1lV2lkZ2V0LmZvY3VzTmV4dFJlbmFtZVN1Z2dlc3Rpb24oKTtcblx0fVxuXG5cdGZvY3VzUHJldmlvdXNSZW5hbWVTdWdnZXN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmFtZVdpZGdldC5mb2N1c1ByZXZpb3VzUmVuYW1lU3VnZ2VzdGlvbigpO1xuXHR9XG59XG5cbi8vIC0tLS0gYWN0aW9uIGltcGxlbWVudGF0aW9uXG5cbmV4cG9ydCBjbGFzcyBSZW5hbWVBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5yZW5hbWUnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ3JlbmFtZS5sYWJlbCcsIFwiUmVuYW1lIFN5bWJvbFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLCBFZGl0b3JDb250ZXh0S2V5cy5oYXNSZW5hbWVQcm92aWRlciksXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRjIsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0Y29udGV4dE1lbnVPcHRzOiB7XG5cdFx0XHRcdGdyb3VwOiAnMV9tb2RpZmljYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMS4xXG5cdFx0XHR9LFxuXHRcdFx0Y2FuVHJpZ2dlcklubGluZUVkaXRzOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuQ29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJnczogW1VSSSwgSVBvc2l0aW9uXSk6IHZvaWQgfCBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb2RlRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgW3VyaSwgcG9zXSA9IEFycmF5LmlzQXJyYXkoYXJncykgJiYgYXJncyB8fCBbdW5kZWZpbmVkLCB1bmRlZmluZWRdO1xuXG5cdFx0aWYgKFVSSS5pc1VyaSh1cmkpICYmIFBvc2l0aW9uLmlzSVBvc2l0aW9uKHBvcykpIHtcblx0XHRcdHJldHVybiBlZGl0b3JTZXJ2aWNlLm9wZW5Db2RlRWRpdG9yKHsgcmVzb3VyY2U6IHVyaSB9LCBlZGl0b3JTZXJ2aWNlLmdldEFjdGl2ZUNvZGVFZGl0b3IoKSkudGhlbihlZGl0b3IgPT4ge1xuXHRcdFx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24ocG9zKTtcblx0XHRcdFx0ZWRpdG9yLmludm9rZVdpdGhpbkNvbnRleHQoYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRcdHRoaXMucmVwb3J0VGVsZW1ldHJ5KGFjY2Vzc29yLCBlZGl0b3IpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLnJ1bihhY2Nlc3NvciwgZWRpdG9yKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9LCBvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1cGVyLnJ1bkNvbW1hbmQoYWNjZXNzb3IsIGFyZ3MpO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gUmVuYW1lQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblxuXHRcdGlmIChjb250cm9sbGVyKSB7XG5cdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdbUmVuYW1lQWN0aW9uXSBnb3QgY29udHJvbGxlciwgcnVubmluZy4uLicpO1xuXHRcdFx0cmV0dXJuIGNvbnRyb2xsZXIucnVuKCk7XG5cdFx0fVxuXHRcdGxvZ1NlcnZpY2UudHJhY2UoJ1tSZW5hbWVBY3Rpb25dIHJldHVybmluZyBlYXJseSAtIGNvbnRyb2xsZXIgbWlzc2luZycpO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxufVxuXG5yZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbihSZW5hbWVDb250cm9sbGVyLklELCBSZW5hbWVDb250cm9sbGVyLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLkxhenkpO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oUmVuYW1lQWN0aW9uKTtcblxuY29uc3QgUmVuYW1lQ29tbWFuZCA9IEVkaXRvckNvbW1hbmQuYmluZFRvQ29udHJpYnV0aW9uPFJlbmFtZUNvbnRyb2xsZXI+KFJlbmFtZUNvbnRyb2xsZXIuZ2V0KTtcblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBSZW5hbWVDb21tYW5kKHtcblx0aWQ6ICdhY2NlcHRSZW5hbWVJbnB1dCcsXG5cdHByZWNvbmRpdGlvbjogQ09OVEVYVF9SRU5BTUVfSU5QVVRfVklTSUJMRSxcblx0aGFuZGxlcjogeCA9PiB4LmFjY2VwdFJlbmFtZUlucHV0KGZhbHNlKSxcblx0a2JPcHRzOiB7XG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgKyA5OSxcblx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLFxuXHRcdHByaW1hcnk6IEtleUNvZGUuRW50ZXJcblx0fVxufSkpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IFJlbmFtZUNvbW1hbmQoe1xuXHRpZDogJ2FjY2VwdFJlbmFtZUlucHV0V2l0aFByZXZpZXcnLFxuXHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1JFTkFNRV9JTlBVVF9WSVNJQkxFLCBDb250ZXh0S2V5RXhwci5oYXMoJ2NvbmZpZy5lZGl0b3IucmVuYW1lLmVuYWJsZVByZXZpZXcnKSksXG5cdGhhbmRsZXI6IHggPT4geC5hY2NlcHRSZW5hbWVJbnB1dCh0cnVlKSxcblx0a2JPcHRzOiB7XG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgKyA5OSxcblx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLFxuXHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kICsgS2V5Q29kZS5FbnRlclxuXHR9XG59KSk7XG5cbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgUmVuYW1lQ29tbWFuZCh7XG5cdGlkOiAnY2FuY2VsUmVuYW1lSW5wdXQnLFxuXHRwcmVjb25kaXRpb246IENPTlRFWFRfUkVOQU1FX0lOUFVUX1ZJU0lCTEUsXG5cdGhhbmRsZXI6IHggPT4geC5jYW5jZWxSZW5hbWVJbnB1dCgpLFxuXHRrYk9wdHM6IHtcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiArIDk5LFxuXHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZm9jdXMsXG5cdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5Fc2NhcGVdXG5cdH1cbn0pKTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEZvY3VzTmV4dFJlbmFtZVN1Z2dlc3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdmb2N1c05leHRSZW5hbWVTdWdnZXN0aW9uJyxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLm5scy5sb2NhbGl6ZTIoJ2ZvY3VzTmV4dFJlbmFtZVN1Z2dlc3Rpb24nLCBcIkZvY3VzIE5leHQgUmVuYW1lIFN1Z2dlc3Rpb25cIiksXG5cdFx0XHR9LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX1JFTkFNRV9JTlBVVF9WSVNJQkxFLFxuXHRcdFx0a2V5YmluZGluZzogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgKyA5OSxcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudEVkaXRvciA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpLmdldEZvY3VzZWRDb2RlRWRpdG9yKCk7XG5cdFx0aWYgKCFjdXJyZW50RWRpdG9yKSB7IHJldHVybjsgfVxuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IFJlbmFtZUNvbnRyb2xsZXIuZ2V0KGN1cnJlbnRFZGl0b3IpO1xuXHRcdGlmICghY29udHJvbGxlcikgeyByZXR1cm47IH1cblxuXHRcdGNvbnRyb2xsZXIuZm9jdXNOZXh0UmVuYW1lU3VnZ2VzdGlvbigpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEZvY3VzUHJldmlvdXNSZW5hbWVTdWdnZXN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZm9jdXNQcmV2aW91c1JlbmFtZVN1Z2dlc3Rpb24nLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubmxzLmxvY2FsaXplMignZm9jdXNQcmV2aW91c1JlbmFtZVN1Z2dlc3Rpb24nLCBcIkZvY3VzIFByZXZpb3VzIFJlbmFtZSBTdWdnZXN0aW9uXCIpLFxuXHRcdFx0fSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9SRU5BTUVfSU5QVVRfVklTSUJMRSxcblx0XHRcdGtleWJpbmRpbmc6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuVXBBcnJvdyxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiArIDk5LFxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50RWRpdG9yID0gYWNjZXNzb3IuZ2V0KElDb2RlRWRpdG9yU2VydmljZSkuZ2V0Rm9jdXNlZENvZGVFZGl0b3IoKTtcblx0XHRpZiAoIWN1cnJlbnRFZGl0b3IpIHsgcmV0dXJuOyB9XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gUmVuYW1lQ29udHJvbGxlci5nZXQoY3VycmVudEVkaXRvcik7XG5cdFx0aWYgKCFjb250cm9sbGVyKSB7IHJldHVybjsgfVxuXG5cdFx0Y29udHJvbGxlci5mb2N1c1ByZXZpb3VzUmVuYW1lU3VnZ2VzdGlvbigpO1xuXHR9XG59KTtcblxuLy8gLS0tLSBhcGkgYnJpZGdlIGNvbW1hbmRcblxucmVnaXN0ZXJNb2RlbEFuZFBvc2l0aW9uQ29tbWFuZCgnX2V4ZWN1dGVEb2N1bWVudFJlbmFtZVByb3ZpZGVyJywgZnVuY3Rpb24gKGFjY2Vzc29yLCBtb2RlbCwgcG9zaXRpb24sIC4uLmFyZ3MpIHtcblx0Y29uc3QgW25ld05hbWVdID0gYXJncztcblx0YXNzZXJ0VHlwZSh0eXBlb2YgbmV3TmFtZSA9PT0gJ3N0cmluZycpO1xuXHRjb25zdCB7IHJlbmFtZVByb3ZpZGVyIH0gPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0cmV0dXJuIHJlbmFtZShyZW5hbWVQcm92aWRlciwgbW9kZWwsIHBvc2l0aW9uLCBuZXdOYW1lKTtcbn0pO1xuXG5yZWdpc3Rlck1vZGVsQW5kUG9zaXRpb25Db21tYW5kKCdfZXhlY3V0ZVByZXBhcmVSZW5hbWUnLCBhc3luYyBmdW5jdGlvbiAoYWNjZXNzb3IsIG1vZGVsLCBwb3NpdGlvbikge1xuXHRjb25zdCB7IHJlbmFtZVByb3ZpZGVyIH0gPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0Y29uc3Qgc2tlbGV0b24gPSBuZXcgUmVuYW1lU2tlbGV0b24obW9kZWwsIHBvc2l0aW9uLCByZW5hbWVQcm92aWRlcik7XG5cdGNvbnN0IGxvYyA9IGF3YWl0IHNrZWxldG9uLnJlc29sdmVSZW5hbWVMb2NhdGlvbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0aWYgKGxvYz8ucmVqZWN0UmVhc29uKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGxvYy5yZWplY3RSZWFzb24pO1xuXHR9XG5cdHJldHVybiBsb2M7XG59KTtcblxuXG4vL3RvZG9AanJpZWtlbiB1c2UgZWRpdG9yIG9wdGlvbnMgd29ybGRcblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0aWQ6ICdlZGl0b3InLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0J2VkaXRvci5yZW5hbWUuZW5hYmxlUHJldmlldyc6IHtcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlbmFibGVQcmV2aWV3JywgXCJFbmFibGUvZGlzYWJsZSB0aGUgYWJpbGl0eSB0byBwcmV2aWV3IGNoYW5nZXMgYmVmb3JlIHJlbmFtaW5nXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHR5cGU6ICdib29sZWFuJ1xuXHRcdH1cblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsYUFBYTtBQUN0QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsV0FBVztBQUNwQixZQUFZLFNBQVM7QUFDckIsU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLG9CQUFvQixrQkFBMEM7QUFDdkUsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFB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O0FBQ3JELFFBQUksQ0FBQyxZQUFZO0FBQUU7QUFBQSxJQUFRO0FBRTNCLGVBQVcsMEJBQTBCO0FBQUEsRUFDdEM7QUFDRCxDQUFDO0FBRUQsZ0JBQWdCLE1BQU0sc0NBQXNDLFFBQVE7QUFBQSxFQUNuRSxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTztBQUFBLFFBQ04sR0FBRyxJQUFJLFVBQVUsaUNBQWlDLGtDQUFrQztBQUFBLE1BQ3JGO0FBQUEsTUFDQSxjQUFjO0FBQUEsTUFDZCxZQUFZO0FBQUEsUUFDWDtBQUFBLFVBQ0MsU0FBUyxRQUFRO0FBQUEsVUFDakIsUUFBUSxpQkFBaUIsZ0JBQWdCO0FBQUEsUUFDMUM7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVMsSUFBSSxVQUFrQztBQUM5QyxVQUFNLGdCQUFnQixTQUFTLElBQUksa0JBQWtCLEVBQUUscUJBQXFCO0FBQzVFLFFBQUksQ0FBQyxlQUFlO0FBQUU7QUFBQSxJQUFRO0FBRTlCLFVBQU0sYUFBYSxpQkFBaUIsSUFBSSxhQUFhO0FBQ3JELFFBQUksQ0FBQyxZQUFZO0FBQUU7QUFBQSxJQUFRO0FBRTNCLGVBQVcsOEJBQThCO0FBQUEsRUFDMUM7QUFDRCxDQUFDO0FBSUQsZ0NBQWdDLGtDQUFrQyxTQUFVLFVBQVUsT0FBTyxhQUFhLE1BQU07QUFDL0csUUFBTSxDQUFDLE9BQU8sSUFBSTtBQUNsQixhQUFXLE9BQU8sWUFBWSxRQUFRO0FBQ3RDLFFBQU0sRUFBRSxlQUFlLElBQUksU0FBUyxJQUFJLHdCQUF3QjtBQUNoRSxTQUFPLE9BQU8sZ0JBQWdCLE9BQU8sVUFBVSxPQUFPO0FBQ3ZELENBQUM7QUFFRCxnQ0FBZ0MseUJBQXlCLGVBQWdCLFVBQVUsT0FBTyxVQUFVO0FBQ25HLFFBQU0sRUFBRSxlQUFlLElBQUksU0FBUyxJQUFJLHdCQUF3QjtBQUNoRSxRQUFNLFdBQVcsSUFBSSxlQUFlLE9BQU8sVUFBVSxjQUFjO0FBQ25FLFFBQU0sTUFBTSxNQUFNLFNBQVMsc0JBQXNCLGtCQUFrQixJQUFJO0FBQ3ZFLE1BQUksS0FBSyxjQUFjO0FBQ3RCLFVBQU0sSUFBSSxNQUFNLElBQUksWUFBWTtBQUFBLEVBQ2pDO0FBQ0EsU0FBTztBQUNSLENBQUM7QUFJRCxTQUFTLEdBQTJCLFdBQVcsYUFBYSxFQUFFLHNCQUFzQjtBQUFBLEVBQ25GLElBQUk7QUFBQSxFQUNKLFlBQVk7QUFBQSxJQUNYLCtCQUErQjtBQUFBLE1BQzlCLE9BQU8sbUJBQW1CO0FBQUEsTUFDMUIsYUFBYSxJQUFJLFNBQVMsaUJBQWlCLCtEQUErRDtBQUFBLE1BQzFHLFNBQVM7QUFBQSxNQUNULE1BQU07QUFBQSxJQUNQO0FBQUEsRUFDRDtBQUNELENBQUM7IiwKICAibmFtZXMiOiBbImFjY2Vzc29yIl0KfQo=
