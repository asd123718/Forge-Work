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
import { getDomNodePagePosition } from "../../../../base/browser/dom.js";
import * as aria from "../../../../base/browser/ui/aria/aria.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { HierarchicalKind } from "../../../../base/common/hierarchicalKind.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { derivedOpts, observableValue } from "../../../../base/common/observable.js";
import { Event } from "../../../../base/common/event.js";
import { localize } from "../../../../nls.js";
import { IActionWidgetService } from "../../../../platform/actionWidget/browser/actionWidget.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IMarkerService } from "../../../../platform/markers/common/markers.js";
import { IEditorProgressService } from "../../../../platform/progress/common/progress.js";
import { editorFindMatchHighlight, editorFindMatchHighlightBorder } from "../../../../platform/theme/common/colorRegistry.js";
import { isHighContrast } from "../../../../platform/theme/common/theme.js";
import { registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { Position } from "../../../common/core/position.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { CodeActionTriggerType } from "../../../common/languages.js";
import { ModelDecorationOptions } from "../../../common/model/textModel.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { MessageController } from "../../message/browser/messageController.js";
import { CodeActionAutoApply, CodeActionKind, CodeActionTriggerSource } from "../common/types.js";
import { ApplyCodeActionReason, applyCodeAction, autoFixCommandId, quickFixCommandId } from "./codeAction.js";
import { CodeActionKeybindingResolver } from "./codeActionKeybindingResolver.js";
import { toMenuItems } from "./codeActionMenu.js";
import { CodeActionModel, CodeActionsState } from "./codeActionModel.js";
import { computeLightBulbInfo, LightBulbWidget } from "./lightBulbWidget.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
const DECORATION_CLASS_NAME = "quickfix-edit-highlight";
let CodeActionController = class extends Disposable {
  constructor(editor, markerService, contextKeyService, instantiationService, languageFeaturesService, progressService, _commandService, _configurationService, _actionWidgetService, _instantiationService, _progressService, _keybindingService) {
    super();
    this._commandService = _commandService;
    this._configurationService = _configurationService;
    this._actionWidgetService = _actionWidgetService;
    this._instantiationService = _instantiationService;
    this._progressService = _progressService;
    this._keybindingService = _keybindingService;
    this._activeCodeActions = this._register(new MutableDisposable());
    this._showDisabled = false;
    this._disposed = false;
    this._onlyLightBulbWithEmptySelection = false;
    this._lightBulbInfoObs = observableValue(this, void 0);
    this._preferredKbLabel = observableValue(this, void 0);
    this._quickFixKbLabel = observableValue(this, void 0);
    this._hasLightBulbStateObservers = false;
    this.lightBulbState = derivedOpts({
      owner: this,
      onLastObserverRemoved: () => {
        this._hasLightBulbStateObservers = false;
        this._model.ignoreLightbulbOff = false;
      }
    }, (reader) => {
      if (!this._hasLightBulbStateObservers) {
        this._hasLightBulbStateObservers = true;
        this._model.ignoreLightbulbOff = true;
      }
      return this._lightBulbInfoObs.read(reader);
    });
    this._editor = editor;
    this._model = this._register(new CodeActionModel(this._editor, languageFeaturesService.codeActionProvider, markerService, contextKeyService, progressService, _configurationService));
    this._register(this._model.onDidChangeState((newState) => this.update(newState)));
    this._register(Event.runAndSubscribe(this._keybindingService.onDidUpdateKeybindings, () => {
      this._preferredKbLabel.set(this._keybindingService.lookupKeybinding(autoFixCommandId)?.getLabel() ?? void 0, void 0);
      this._quickFixKbLabel.set(this._keybindingService.lookupKeybinding(quickFixCommandId)?.getLabel() ?? void 0, void 0);
    }));
    this._lightBulbWidget = new Lazy(() => {
      const widget = this._editor.getContribution(LightBulbWidget.ID);
      if (widget) {
        this._register(widget.onClick((e) => this.showCodeActionsFromLightbulb(e.actions, e)));
        widget.onlyWithEmptySelection = this._onlyLightBulbWithEmptySelection;
      }
      return widget;
    });
    this._resolver = instantiationService.createInstance(CodeActionKeybindingResolver);
    this._register(this._editor.onDidLayoutChange(() => this._actionWidgetService.hide()));
  }
  static get(editor) {
    return editor.getContribution(CodeActionController.ID);
  }
  set onlyLightBulbWithEmptySelection(value) {
    const widget = this._lightBulbWidget.rawValue;
    if (widget) {
      widget.onlyWithEmptySelection = value;
    }
    this._onlyLightBulbWithEmptySelection = value;
  }
  dispose() {
    this._disposed = true;
    super.dispose();
  }
  async showCodeActionsFromLightbulb(actions, at) {
    if (actions.allAIFixes && actions.validActions.length === 1) {
      const actionItem = actions.validActions[0];
      const command = actionItem.action.command;
      if (command && command.id === "inlineChat.start") {
        if (command.arguments && command.arguments.length >= 1 && command.arguments[0]) {
          command.arguments[0] = { ...command.arguments[0], autoSend: false };
        }
      }
      await this.applyCodeAction(actionItem, false, false, ApplyCodeActionReason.FromAILightbulb);
      return;
    }
    await this.showCodeActionList(actions, at, { includeDisabledActions: false, fromLightbulb: true });
  }
  showCodeActions(_trigger, actions, at) {
    return this.showCodeActionList(actions, at, { includeDisabledActions: false, fromLightbulb: false });
  }
  hideCodeActions() {
    this._actionWidgetService.hide();
  }
  manualTriggerAtCurrentPosition(notAvailableMessage, triggerAction, filter, autoApply) {
    if (!this._editor.hasModel()) {
      return;
    }
    MessageController.get(this._editor)?.closeMessage();
    const triggerPosition = this._editor.getPosition();
    this._trigger({ type: CodeActionTriggerType.Invoke, triggerAction, filter, autoApply, context: { notAvailableMessage, position: triggerPosition } });
  }
  _trigger(trigger) {
    return this._model.trigger(trigger);
  }
  async applyCodeAction(action, retrigger, preview, actionReason) {
    const progress = this._progressService.show(true, 500);
    try {
      await this._instantiationService.invokeFunction(applyCodeAction, action, actionReason, { preview, editor: this._editor });
    } finally {
      if (retrigger) {
        this._trigger({ type: CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.QuickFix, filter: {} });
      }
      progress.done();
    }
  }
  hideLightBulbWidget() {
    this._lightBulbWidget.rawValue?.hide();
    this._lightBulbWidget.rawValue?.gutterHide();
  }
  async update(newState) {
    if (newState.type !== CodeActionsState.Type.Triggered) {
      this.hideLightBulbWidget();
      this._lightBulbInfoObs.set(void 0, void 0);
      return;
    }
    let actions;
    try {
      actions = await newState.actions;
    } catch (e) {
      onUnexpectedError(e);
      return;
    }
    if (this._disposed) {
      return;
    }
    const selection = this._editor.getSelection();
    if (selection?.startLineNumber !== newState.position.lineNumber) {
      return;
    }
    this._lightBulbWidget.value?.update(actions, newState.trigger, newState.position);
    this._lightBulbInfoObs.set(computeLightBulbInfo(actions, newState.trigger, this._preferredKbLabel.get(), this._quickFixKbLabel.get()), void 0);
    if (newState.trigger.type === CodeActionTriggerType.Invoke) {
      if (newState.trigger.filter?.include) {
        const validActionToApply = this.tryGetValidActionToApply(newState.trigger, actions);
        if (validActionToApply) {
          try {
            this.hideLightBulbWidget();
            await this.applyCodeAction(validActionToApply, false, false, ApplyCodeActionReason.FromCodeActions);
          } finally {
            actions.dispose();
          }
          return;
        }
        if (newState.trigger.context) {
          const invalidAction = this.getInvalidActionThatWouldHaveBeenApplied(newState.trigger, actions);
          if (invalidAction && invalidAction.action.disabled) {
            MessageController.get(this._editor)?.showMessage(invalidAction.action.disabled, newState.trigger.context.position);
            actions.dispose();
            return;
          }
        }
      }
      const includeDisabledActions = !!newState.trigger.filter?.include;
      if (newState.trigger.context) {
        if (!actions.allActions.length || !includeDisabledActions && !actions.validActions.length) {
          MessageController.get(this._editor)?.showMessage(newState.trigger.context.notAvailableMessage, newState.trigger.context.position);
          this._activeCodeActions.value = actions;
          actions.dispose();
          return;
        }
      }
      this._activeCodeActions.value = actions;
      this.showCodeActionList(actions, this.toCoords(newState.position), { includeDisabledActions, fromLightbulb: false });
    } else {
      if (this._actionWidgetService.isVisible) {
        actions.dispose();
      } else {
        this._activeCodeActions.value = actions;
      }
    }
  }
  getInvalidActionThatWouldHaveBeenApplied(trigger, actions) {
    if (!actions.allActions.length) {
      return void 0;
    }
    if (trigger.autoApply === CodeActionAutoApply.First && actions.validActions.length === 0 || trigger.autoApply === CodeActionAutoApply.IfSingle && actions.allActions.length === 1) {
      return actions.allActions.find(({ action }) => action.disabled);
    }
    return void 0;
  }
  tryGetValidActionToApply(trigger, actions) {
    if (!actions.validActions.length) {
      return void 0;
    }
    if (trigger.autoApply === CodeActionAutoApply.First && actions.validActions.length > 0 || trigger.autoApply === CodeActionAutoApply.IfSingle && actions.validActions.length === 1) {
      return actions.validActions[0];
    }
    return void 0;
  }
  async showCodeActionList(actions, at, options) {
    const currentDecorations = this._editor.createDecorationsCollection();
    const editorDom = this._editor.getDomNode();
    if (!editorDom) {
      return;
    }
    const actionsToShow = options.includeDisabledActions && (this._showDisabled || actions.validActions.length === 0) ? actions.allActions : actions.validActions;
    if (!actionsToShow.length) {
      return;
    }
    const anchor = Position.isIPosition(at) ? this.toCoords(at) : at;
    const delegate = {
      onSelect: async (action, preview) => {
        this.applyCodeAction(
          action,
          /* retrigger */
          true,
          !!preview,
          options.fromLightbulb ? ApplyCodeActionReason.FromAILightbulb : ApplyCodeActionReason.FromCodeActions
        );
        this._actionWidgetService.hide(false);
        currentDecorations.clear();
      },
      onHide: (didCancel) => {
        this._editor?.focus();
        currentDecorations.clear();
      },
      onHover: async (action, token) => {
        if (token.isCancellationRequested) {
          return;
        }
        let canPreview = false;
        const actionKind = action.action.kind;
        if (actionKind) {
          const hierarchicalKind = new HierarchicalKind(actionKind);
          const refactorKinds = [
            CodeActionKind.RefactorExtract,
            CodeActionKind.RefactorInline,
            CodeActionKind.RefactorRewrite,
            CodeActionKind.RefactorMove,
            CodeActionKind.Source
          ];
          canPreview = refactorKinds.some((refactorKind) => refactorKind.contains(hierarchicalKind));
        }
        return { canPreview: canPreview || !!action.action.edit?.edits.length };
      },
      onFocus: (action) => {
        if (action && action.action) {
          const ranges = action.action.ranges;
          const diagnostics = action.action.diagnostics;
          currentDecorations.clear();
          if (ranges && ranges.length > 0) {
            const decorations = diagnostics && diagnostics?.length > 1 ? diagnostics.map((diagnostic) => ({ range: diagnostic, options: CodeActionController.DECORATION })) : ranges.map((range) => ({ range, options: CodeActionController.DECORATION }));
            currentDecorations.set(decorations);
          } else if (diagnostics && diagnostics.length > 0) {
            const decorations = diagnostics.map((diagnostic2) => ({ range: diagnostic2, options: CodeActionController.DECORATION }));
            currentDecorations.set(decorations);
            const diagnostic = diagnostics[0];
            if (diagnostic.startLineNumber && diagnostic.startColumn) {
              const selectionText = this._editor.getModel()?.getWordAtPosition({ lineNumber: diagnostic.startLineNumber, column: diagnostic.startColumn })?.word;
              aria.status(localize("editingNewSelection", "Context: {0} at line {1} and column {2}.", selectionText, diagnostic.startLineNumber, diagnostic.startColumn));
            }
          }
        } else {
          currentDecorations.clear();
        }
      }
    };
    this._actionWidgetService.show(
      "codeActionWidget",
      true,
      toMenuItems(actionsToShow, this._shouldShowHeaders(), this._resolver.getResolver()),
      delegate,
      anchor,
      editorDom,
      this._getActionBarActions(actions, at, options)
    );
  }
  toCoords(position) {
    if (!this._editor.hasModel()) {
      return { x: 0, y: 0 };
    }
    this._editor.revealPosition(position, ScrollType.Immediate);
    this._editor.render();
    const cursorCoords = this._editor.getScrolledVisiblePosition(position);
    const editorCoords = getDomNodePagePosition(this._editor.getDomNode());
    const x = editorCoords.left + cursorCoords.left;
    const y = editorCoords.top + cursorCoords.top + cursorCoords.height;
    return { x, y };
  }
  _shouldShowHeaders() {
    const model = this._editor?.getModel();
    return this._configurationService.getValue("editor.codeActionWidget.showHeaders", { resource: model?.uri });
  }
  _getActionBarActions(actions, at, options) {
    if (options.fromLightbulb) {
      return [];
    }
    const resultActions = actions.documentation.map((command) => ({
      id: command.id,
      label: command.title,
      tooltip: command.tooltip ?? "",
      class: void 0,
      enabled: true,
      run: () => this._commandService.executeCommand(command.id, ...command.arguments ?? [])
    }));
    if (options.includeDisabledActions && actions.validActions.length > 0 && actions.allActions.length !== actions.validActions.length) {
      resultActions.push(this._showDisabled ? {
        id: "hideMoreActions",
        label: localize("hideMoreActions", "Hide Disabled"),
        enabled: true,
        tooltip: "",
        class: void 0,
        run: () => {
          this._showDisabled = false;
          return this.showCodeActionList(actions, at, options);
        }
      } : {
        id: "showMoreActions",
        label: localize("showMoreActions", "Show Disabled"),
        enabled: true,
        tooltip: "",
        class: void 0,
        run: () => {
          this._showDisabled = true;
          return this.showCodeActionList(actions, at, options);
        }
      });
    }
    return resultActions;
  }
};
CodeActionController.ID = "editor.contrib.codeActionController";
CodeActionController.DECORATION = ModelDecorationOptions.register({
  description: "quickfix-highlight",
  className: DECORATION_CLASS_NAME
});
CodeActionController = __decorateClass([
  __decorateParam(1, IMarkerService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ILanguageFeaturesService),
  __decorateParam(5, IEditorProgressService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IActionWidgetService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, IEditorProgressService),
  __decorateParam(11, IKeybindingService)
], CodeActionController);
registerThemingParticipant((theme, collector) => {
  const addBackgroundColorRule = (selector, color) => {
    if (color) {
      collector.addRule(`.monaco-editor ${selector} { background-color: ${color}; }`);
    }
  };
  addBackgroundColorRule(".quickfix-edit-highlight", theme.getColor(editorFindMatchHighlight));
  const findMatchHighlightBorder = theme.getColor(editorFindMatchHighlightBorder);
  if (findMatchHighlightBorder) {
    collector.addRule(`.monaco-editor .quickfix-edit-highlight { border: 1px ${isHighContrast(theme.type) ? "dotted" : "solid"} ${findMatchHighlightBorder}; box-sizing: border-box; }`);
  }
});
export {
  CodeActionController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGNvZGVBY3Rpb25cXGJyb3dzZXJcXGNvZGVBY3Rpb25Db250cm9sbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICogYXMgYXJpYSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IElBbmNob3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBIaWVyYXJjaGljYWxLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGllcmFyY2hpY2FsS2luZC5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBkZXJpdmVkT3B0cywgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uTGlzdERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU1hcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IElFZGl0b3JQcm9ncmVzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgZWRpdG9yRmluZE1hdGNoSGlnaGxpZ2h0LCBlZGl0b3JGaW5kTWF0Y2hIaWdobGlnaHRCb3JkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBpc0hpZ2hDb250cmFzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uLCBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24sIFNjcm9sbFR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb25UcmlnZ2VyVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSU1vZGVsRGVsdGFEZWNvcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vbWVzc2FnZS9icm93c2VyL21lc3NhZ2VDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb25BdXRvQXBwbHksIENvZGVBY3Rpb25GaWx0ZXIsIENvZGVBY3Rpb25JdGVtLCBDb2RlQWN0aW9uS2luZCwgQ29kZUFjdGlvblNldCwgQ29kZUFjdGlvblRyaWdnZXIsIENvZGVBY3Rpb25UcmlnZ2VyU291cmNlIH0gZnJvbSAnLi4vY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IEFwcGx5Q29kZUFjdGlvblJlYXNvbiwgYXBwbHlDb2RlQWN0aW9uLCBhdXRvRml4Q29tbWFuZElkLCBxdWlja0ZpeENvbW1hbmRJZCB9IGZyb20gJy4vY29kZUFjdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uS2V5YmluZGluZ1Jlc29sdmVyIH0gZnJvbSAnLi9jb2RlQWN0aW9uS2V5YmluZGluZ1Jlc29sdmVyLmpzJztcbmltcG9ydCB7IHRvTWVudUl0ZW1zIH0gZnJvbSAnLi9jb2RlQWN0aW9uTWVudS5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uTW9kZWwsIENvZGVBY3Rpb25zU3RhdGUgfSBmcm9tICcuL2NvZGVBY3Rpb25Nb2RlbC5qcyc7XG5pbXBvcnQgeyBjb21wdXRlTGlnaHRCdWxiSW5mbywgTGlnaHRCdWxiSW5mbywgTGlnaHRCdWxiV2lkZ2V0IH0gZnJvbSAnLi9saWdodEJ1bGJXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5cbmludGVyZmFjZSBJQWN0aW9uU2hvd09wdGlvbnMge1xuXHRyZWFkb25seSBpbmNsdWRlRGlzYWJsZWRBY3Rpb25zPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZnJvbUxpZ2h0YnVsYj86IGJvb2xlYW47XG59XG5cblxuY29uc3QgREVDT1JBVElPTl9DTEFTU19OQU1FID0gJ3F1aWNrZml4LWVkaXQtaGlnaGxpZ2h0JztcblxuZXhwb3J0IGNsYXNzIENvZGVBY3Rpb25Db250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmNvbnRyaWIuY29kZUFjdGlvbkNvbnRyb2xsZXInO1xuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0KGVkaXRvcjogSUNvZGVFZGl0b3IpOiBDb2RlQWN0aW9uQ29udHJvbGxlciB8IG51bGwge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPENvZGVBY3Rpb25Db250cm9sbGVyPihDb2RlQWN0aW9uQ29udHJvbGxlci5JRCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbDogQ29kZUFjdGlvbk1vZGVsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpZ2h0QnVsYldpZGdldDogTGF6eTxMaWdodEJ1bGJXaWRnZXQgfCBudWxsPjtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlQ29kZUFjdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q29kZUFjdGlvblNldD4oKSk7XG5cdHByaXZhdGUgX3Nob3dEaXNhYmxlZCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc29sdmVyOiBDb2RlQWN0aW9uS2V5YmluZGluZ1Jlc29sdmVyO1xuXG5cdHByaXZhdGUgX2Rpc3Bvc2VkID0gZmFsc2U7XG5cblx0c2V0IG9ubHlMaWdodEJ1bGJXaXRoRW1wdHlTZWxlY3Rpb24odmFsdWU6IGJvb2xlYW4pIHtcblx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLl9saWdodEJ1bGJXaWRnZXQucmF3VmFsdWU7XG5cdFx0aWYgKHdpZGdldCkge1xuXHRcdFx0d2lkZ2V0Lm9ubHlXaXRoRW1wdHlTZWxlY3Rpb24gPSB2YWx1ZTtcblx0XHR9XG5cdFx0dGhpcy5fb25seUxpZ2h0QnVsYldpdGhFbXB0eVNlbGVjdGlvbiA9IHZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25seUxpZ2h0QnVsYldpdGhFbXB0eVNlbGVjdGlvbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpZ2h0QnVsYkluZm9PYnMgPSBvYnNlcnZhYmxlVmFsdWU8TGlnaHRCdWxiSW5mbyB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJlZmVycmVkS2JMYWJlbCA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrRml4S2JMYWJlbCA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cblx0cHJpdmF0ZSBfaGFzTGlnaHRCdWxiU3RhdGVPYnNlcnZlcnMgPSBmYWxzZTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgbGlnaHRCdWxiU3RhdGU6IElPYnNlcnZhYmxlPExpZ2h0QnVsYkluZm8gfCB1bmRlZmluZWQ+ID0gZGVyaXZlZE9wdHM8TGlnaHRCdWxiSW5mbyB8IHVuZGVmaW5lZD4oe1xuXHRcdG93bmVyOiB0aGlzLFxuXHRcdG9uTGFzdE9ic2VydmVyUmVtb3ZlZDogKCkgPT4ge1xuXHRcdFx0dGhpcy5faGFzTGlnaHRCdWxiU3RhdGVPYnNlcnZlcnMgPSBmYWxzZTtcblx0XHRcdHRoaXMuX21vZGVsLmlnbm9yZUxpZ2h0YnVsYk9mZiA9IGZhbHNlO1xuXHRcdH0sXG5cdH0sIHJlYWRlciA9PiB7XG5cdFx0aWYgKCF0aGlzLl9oYXNMaWdodEJ1bGJTdGF0ZU9ic2VydmVycykge1xuXHRcdFx0dGhpcy5faGFzTGlnaHRCdWxiU3RhdGVPYnNlcnZlcnMgPSB0cnVlO1xuXHRcdFx0dGhpcy5fbW9kZWwuaWdub3JlTGlnaHRidWxiT2ZmID0gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2xpZ2h0QnVsYkluZm9PYnMucmVhZChyZWFkZXIpO1xuXHR9KTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJTWFya2VyU2VydmljZSBtYXJrZXJTZXJ2aWNlOiBJTWFya2VyU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASUVkaXRvclByb2dyZXNzU2VydmljZSBwcm9ncmVzc1NlcnZpY2U6IElFZGl0b3JQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUFjdGlvbldpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWN0aW9uV2lkZ2V0U2VydmljZTogSUFjdGlvbldpZGdldFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2dyZXNzU2VydmljZTogSUVkaXRvclByb2dyZXNzU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9lZGl0b3IgPSBlZGl0b3I7XG5cdFx0dGhpcy5fbW9kZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ29kZUFjdGlvbk1vZGVsKHRoaXMuX2VkaXRvciwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUFjdGlvblByb3ZpZGVyLCBtYXJrZXJTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgcHJvZ3Jlc3NTZXJ2aWNlLCBfY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9tb2RlbC5vbkRpZENoYW5nZVN0YXRlKG5ld1N0YXRlID0+IHRoaXMudXBkYXRlKG5ld1N0YXRlKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLm9uRGlkVXBkYXRlS2V5YmluZGluZ3MsICgpID0+IHtcblx0XHRcdHRoaXMuX3ByZWZlcnJlZEtiTGFiZWwuc2V0KHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYXV0b0ZpeENvbW1hbmRJZCk/LmdldExhYmVsKCkgPz8gdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fcXVpY2tGaXhLYkxhYmVsLnNldCh0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKHF1aWNrRml4Q29tbWFuZElkKT8uZ2V0TGFiZWwoKSA/PyB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fbGlnaHRCdWxiV2lkZ2V0ID0gbmV3IExhenkoKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5fZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxMaWdodEJ1bGJXaWRnZXQ+KExpZ2h0QnVsYldpZGdldC5JRCk7XG5cdFx0XHRpZiAod2lkZ2V0KSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHdpZGdldC5vbkNsaWNrKGUgPT4gdGhpcy5zaG93Q29kZUFjdGlvbnNGcm9tTGlnaHRidWxiKGUuYWN0aW9ucywgZSkpKTtcblx0XHRcdFx0d2lkZ2V0Lm9ubHlXaXRoRW1wdHlTZWxlY3Rpb24gPSB0aGlzLl9vbmx5TGlnaHRCdWxiV2l0aEVtcHR5U2VsZWN0aW9uO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHdpZGdldDtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3Jlc29sdmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29kZUFjdGlvbktleWJpbmRpbmdSZXNvbHZlcik7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRMYXlvdXRDaGFuZ2UoKCkgPT4gdGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKCkpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fZGlzcG9zZWQgPSB0cnVlO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvd0NvZGVBY3Rpb25zRnJvbUxpZ2h0YnVsYihhY3Rpb25zOiBDb2RlQWN0aW9uU2V0LCBhdDogSUFuY2hvciB8IElQb3NpdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChhY3Rpb25zLmFsbEFJRml4ZXMgJiYgYWN0aW9ucy52YWxpZEFjdGlvbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRjb25zdCBhY3Rpb25JdGVtID0gYWN0aW9ucy52YWxpZEFjdGlvbnNbMF07XG5cdFx0XHRjb25zdCBjb21tYW5kID0gYWN0aW9uSXRlbS5hY3Rpb24uY29tbWFuZDtcblx0XHRcdGlmIChjb21tYW5kICYmIGNvbW1hbmQuaWQgPT09ICdpbmxpbmVDaGF0LnN0YXJ0Jykge1xuXHRcdFx0XHRpZiAoY29tbWFuZC5hcmd1bWVudHMgJiYgY29tbWFuZC5hcmd1bWVudHMubGVuZ3RoID49IDEgJiYgY29tbWFuZC5hcmd1bWVudHNbMF0pIHtcblx0XHRcdFx0XHRjb21tYW5kLmFyZ3VtZW50c1swXSA9IHsgLi4uY29tbWFuZC5hcmd1bWVudHNbMF0sIGF1dG9TZW5kOiBmYWxzZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLmFwcGx5Q29kZUFjdGlvbihhY3Rpb25JdGVtLCBmYWxzZSwgZmFsc2UsIEFwcGx5Q29kZUFjdGlvblJlYXNvbi5Gcm9tQUlMaWdodGJ1bGIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLnNob3dDb2RlQWN0aW9uTGlzdChhY3Rpb25zLCBhdCwgeyBpbmNsdWRlRGlzYWJsZWRBY3Rpb25zOiBmYWxzZSwgZnJvbUxpZ2h0YnVsYjogdHJ1ZSB9KTtcblx0fVxuXG5cdHB1YmxpYyBzaG93Q29kZUFjdGlvbnMoX3RyaWdnZXI6IENvZGVBY3Rpb25UcmlnZ2VyLCBhY3Rpb25zOiBDb2RlQWN0aW9uU2V0LCBhdDogSUFuY2hvciB8IElQb3NpdGlvbikge1xuXHRcdHJldHVybiB0aGlzLnNob3dDb2RlQWN0aW9uTGlzdChhY3Rpb25zLCBhdCwgeyBpbmNsdWRlRGlzYWJsZWRBY3Rpb25zOiBmYWxzZSwgZnJvbUxpZ2h0YnVsYjogZmFsc2UgfSk7XG5cdH1cblxuXHRwdWJsaWMgaGlkZUNvZGVBY3Rpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2UuaGlkZSgpO1xuXHR9XG5cblx0cHVibGljIG1hbnVhbFRyaWdnZXJBdEN1cnJlbnRQb3NpdGlvbihcblx0XHRub3RBdmFpbGFibGVNZXNzYWdlOiBzdHJpbmcsXG5cdFx0dHJpZ2dlckFjdGlvbjogQ29kZUFjdGlvblRyaWdnZXJTb3VyY2UsXG5cdFx0ZmlsdGVyPzogQ29kZUFjdGlvbkZpbHRlcixcblx0XHRhdXRvQXBwbHk/OiBDb2RlQWN0aW9uQXV0b0FwcGx5LFxuXHQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0TWVzc2FnZUNvbnRyb2xsZXIuZ2V0KHRoaXMuX2VkaXRvcik/LmNsb3NlTWVzc2FnZSgpO1xuXHRcdGNvbnN0IHRyaWdnZXJQb3NpdGlvbiA9IHRoaXMuX2VkaXRvci5nZXRQb3NpdGlvbigpO1xuXHRcdHRoaXMuX3RyaWdnZXIoeyB0eXBlOiBDb2RlQWN0aW9uVHJpZ2dlclR5cGUuSW52b2tlLCB0cmlnZ2VyQWN0aW9uLCBmaWx0ZXIsIGF1dG9BcHBseSwgY29udGV4dDogeyBub3RBdmFpbGFibGVNZXNzYWdlLCBwb3NpdGlvbjogdHJpZ2dlclBvc2l0aW9uIH0gfSk7XG5cdH1cblxuXHRwcml2YXRlIF90cmlnZ2VyKHRyaWdnZXI6IENvZGVBY3Rpb25UcmlnZ2VyKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLnRyaWdnZXIodHJpZ2dlcik7XG5cdH1cblxuXHRhc3luYyBhcHBseUNvZGVBY3Rpb24oYWN0aW9uOiBDb2RlQWN0aW9uSXRlbSwgcmV0cmlnZ2VyOiBib29sZWFuLCBwcmV2aWV3OiBib29sZWFuLCBhY3Rpb25SZWFzb246IEFwcGx5Q29kZUFjdGlvblJlYXNvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByb2dyZXNzID0gdGhpcy5fcHJvZ3Jlc3NTZXJ2aWNlLnNob3codHJ1ZSwgNTAwKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYXBwbHlDb2RlQWN0aW9uLCBhY3Rpb24sIGFjdGlvblJlYXNvbiwgeyBwcmV2aWV3LCBlZGl0b3I6IHRoaXMuX2VkaXRvciB9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKHJldHJpZ2dlcikge1xuXHRcdFx0XHR0aGlzLl90cmlnZ2VyKHsgdHlwZTogQ29kZUFjdGlvblRyaWdnZXJUeXBlLkF1dG8sIHRyaWdnZXJBY3Rpb246IENvZGVBY3Rpb25UcmlnZ2VyU291cmNlLlF1aWNrRml4LCBmaWx0ZXI6IHt9IH0pO1xuXHRcdFx0fVxuXHRcdFx0cHJvZ3Jlc3MuZG9uZSgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBoaWRlTGlnaHRCdWxiV2lkZ2V0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2xpZ2h0QnVsYldpZGdldC5yYXdWYWx1ZT8uaGlkZSgpO1xuXHRcdHRoaXMuX2xpZ2h0QnVsYldpZGdldC5yYXdWYWx1ZT8uZ3V0dGVySGlkZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGUobmV3U3RhdGU6IENvZGVBY3Rpb25zU3RhdGUuU3RhdGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAobmV3U3RhdGUudHlwZSAhPT0gQ29kZUFjdGlvbnNTdGF0ZS5UeXBlLlRyaWdnZXJlZCkge1xuXHRcdFx0dGhpcy5oaWRlTGlnaHRCdWxiV2lkZ2V0KCk7XG5cdFx0XHR0aGlzLl9saWdodEJ1bGJJbmZvT2JzLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGFjdGlvbnM6IENvZGVBY3Rpb25TZXQ7XG5cdFx0dHJ5IHtcblx0XHRcdGFjdGlvbnMgPSBhd2FpdCBuZXdTdGF0ZS5hY3Rpb25zO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdGlmIChzZWxlY3Rpb24/LnN0YXJ0TGluZU51bWJlciAhPT0gbmV3U3RhdGUucG9zaXRpb24ubGluZU51bWJlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xpZ2h0QnVsYldpZGdldC52YWx1ZT8udXBkYXRlKGFjdGlvbnMsIG5ld1N0YXRlLnRyaWdnZXIsIG5ld1N0YXRlLnBvc2l0aW9uKTtcblx0XHR0aGlzLl9saWdodEJ1bGJJbmZvT2JzLnNldChjb21wdXRlTGlnaHRCdWxiSW5mbyhhY3Rpb25zLCBuZXdTdGF0ZS50cmlnZ2VyLCB0aGlzLl9wcmVmZXJyZWRLYkxhYmVsLmdldCgpLCB0aGlzLl9xdWlja0ZpeEtiTGFiZWwuZ2V0KCkpLCB1bmRlZmluZWQpO1xuXG5cdFx0aWYgKG5ld1N0YXRlLnRyaWdnZXIudHlwZSA9PT0gQ29kZUFjdGlvblRyaWdnZXJUeXBlLkludm9rZSkge1xuXHRcdFx0aWYgKG5ld1N0YXRlLnRyaWdnZXIuZmlsdGVyPy5pbmNsdWRlKSB7IC8vIFRyaWdnZXJlZCBmb3Igc3BlY2lmaWMgc2NvcGVcblx0XHRcdFx0Ly8gQ2hlY2sgdG8gc2VlIGlmIHdlIHdhbnQgdG8gYXV0byBhcHBseS5cblxuXHRcdFx0XHRjb25zdCB2YWxpZEFjdGlvblRvQXBwbHkgPSB0aGlzLnRyeUdldFZhbGlkQWN0aW9uVG9BcHBseShuZXdTdGF0ZS50cmlnZ2VyLCBhY3Rpb25zKTtcblx0XHRcdFx0aWYgKHZhbGlkQWN0aW9uVG9BcHBseSkge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHR0aGlzLmhpZGVMaWdodEJ1bGJXaWRnZXQoKTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuYXBwbHlDb2RlQWN0aW9uKHZhbGlkQWN0aW9uVG9BcHBseSwgZmFsc2UsIGZhbHNlLCBBcHBseUNvZGVBY3Rpb25SZWFzb24uRnJvbUNvZGVBY3Rpb25zKTtcblx0XHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdFx0YWN0aW9ucy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIENoZWNrIHRvIHNlZSBpZiB0aGVyZSBpcyBhbiBhY3Rpb24gdGhhdCB3ZSB3b3VsZCBoYXZlIGFwcGxpZWQgd2VyZSBpdCBub3QgaW52YWxpZFxuXHRcdFx0XHRpZiAobmV3U3RhdGUudHJpZ2dlci5jb250ZXh0KSB7XG5cdFx0XHRcdFx0Y29uc3QgaW52YWxpZEFjdGlvbiA9IHRoaXMuZ2V0SW52YWxpZEFjdGlvblRoYXRXb3VsZEhhdmVCZWVuQXBwbGllZChuZXdTdGF0ZS50cmlnZ2VyLCBhY3Rpb25zKTtcblx0XHRcdFx0XHRpZiAoaW52YWxpZEFjdGlvbiAmJiBpbnZhbGlkQWN0aW9uLmFjdGlvbi5kaXNhYmxlZCkge1xuXHRcdFx0XHRcdFx0TWVzc2FnZUNvbnRyb2xsZXIuZ2V0KHRoaXMuX2VkaXRvcik/LnNob3dNZXNzYWdlKGludmFsaWRBY3Rpb24uYWN0aW9uLmRpc2FibGVkLCBuZXdTdGF0ZS50cmlnZ2VyLmNvbnRleHQucG9zaXRpb24pO1xuXHRcdFx0XHRcdFx0YWN0aW9ucy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGluY2x1ZGVEaXNhYmxlZEFjdGlvbnMgPSAhIW5ld1N0YXRlLnRyaWdnZXIuZmlsdGVyPy5pbmNsdWRlO1xuXHRcdFx0aWYgKG5ld1N0YXRlLnRyaWdnZXIuY29udGV4dCkge1xuXHRcdFx0XHRpZiAoIWFjdGlvbnMuYWxsQWN0aW9ucy5sZW5ndGggfHwgIWluY2x1ZGVEaXNhYmxlZEFjdGlvbnMgJiYgIWFjdGlvbnMudmFsaWRBY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRcdE1lc3NhZ2VDb250cm9sbGVyLmdldCh0aGlzLl9lZGl0b3IpPy5zaG93TWVzc2FnZShuZXdTdGF0ZS50cmlnZ2VyLmNvbnRleHQubm90QXZhaWxhYmxlTWVzc2FnZSwgbmV3U3RhdGUudHJpZ2dlci5jb250ZXh0LnBvc2l0aW9uKTtcblx0XHRcdFx0XHR0aGlzLl9hY3RpdmVDb2RlQWN0aW9ucy52YWx1ZSA9IGFjdGlvbnM7XG5cdFx0XHRcdFx0YWN0aW9ucy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2FjdGl2ZUNvZGVBY3Rpb25zLnZhbHVlID0gYWN0aW9ucztcblx0XHRcdHRoaXMuc2hvd0NvZGVBY3Rpb25MaXN0KGFjdGlvbnMsIHRoaXMudG9Db29yZHMobmV3U3RhdGUucG9zaXRpb24pLCB7IGluY2x1ZGVEaXNhYmxlZEFjdGlvbnMsIGZyb21MaWdodGJ1bGI6IGZhbHNlIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBhdXRvIG1hZ2ljYWxseSB0cmlnZ2VyZWRcblx0XHRcdGlmICh0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLmlzVmlzaWJsZSkge1xuXHRcdFx0XHQvLyBUT0RPOiBGaWd1cmUgb3V0IGlmIHdlIHNob3VsZCB1cGRhdGUgdGhlIHNob3dpbmcgbWVudT9cblx0XHRcdFx0YWN0aW9ucy5kaXNwb3NlKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVDb2RlQWN0aW9ucy52YWx1ZSA9IGFjdGlvbnM7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRJbnZhbGlkQWN0aW9uVGhhdFdvdWxkSGF2ZUJlZW5BcHBsaWVkKHRyaWdnZXI6IENvZGVBY3Rpb25UcmlnZ2VyLCBhY3Rpb25zOiBDb2RlQWN0aW9uU2V0KTogQ29kZUFjdGlvbkl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdGlmICghYWN0aW9ucy5hbGxBY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoKHRyaWdnZXIuYXV0b0FwcGx5ID09PSBDb2RlQWN0aW9uQXV0b0FwcGx5LkZpcnN0ICYmIGFjdGlvbnMudmFsaWRBY3Rpb25zLmxlbmd0aCA9PT0gMClcblx0XHRcdHx8ICh0cmlnZ2VyLmF1dG9BcHBseSA9PT0gQ29kZUFjdGlvbkF1dG9BcHBseS5JZlNpbmdsZSAmJiBhY3Rpb25zLmFsbEFjdGlvbnMubGVuZ3RoID09PSAxKVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIGFjdGlvbnMuYWxsQWN0aW9ucy5maW5kKCh7IGFjdGlvbiB9KSA9PiBhY3Rpb24uZGlzYWJsZWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHRyeUdldFZhbGlkQWN0aW9uVG9BcHBseSh0cmlnZ2VyOiBDb2RlQWN0aW9uVHJpZ2dlciwgYWN0aW9uczogQ29kZUFjdGlvblNldCk6IENvZGVBY3Rpb25JdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWFjdGlvbnMudmFsaWRBY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoKHRyaWdnZXIuYXV0b0FwcGx5ID09PSBDb2RlQWN0aW9uQXV0b0FwcGx5LkZpcnN0ICYmIGFjdGlvbnMudmFsaWRBY3Rpb25zLmxlbmd0aCA+IDApXG5cdFx0XHR8fCAodHJpZ2dlci5hdXRvQXBwbHkgPT09IENvZGVBY3Rpb25BdXRvQXBwbHkuSWZTaW5nbGUgJiYgYWN0aW9ucy52YWxpZEFjdGlvbnMubGVuZ3RoID09PSAxKVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIGFjdGlvbnMudmFsaWRBY3Rpb25zWzBdO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBERUNPUkFUSU9OID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7XG5cdFx0ZGVzY3JpcHRpb246ICdxdWlja2ZpeC1oaWdobGlnaHQnLFxuXHRcdGNsYXNzTmFtZTogREVDT1JBVElPTl9DTEFTU19OQU1FXG5cdH0pO1xuXG5cdHB1YmxpYyBhc3luYyBzaG93Q29kZUFjdGlvbkxpc3QoYWN0aW9uczogQ29kZUFjdGlvblNldCwgYXQ6IElBbmNob3IgfCBJUG9zaXRpb24sIG9wdGlvbnM6IElBY3Rpb25TaG93T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Y29uc3QgY3VycmVudERlY29yYXRpb25zID0gdGhpcy5fZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXG5cdFx0Y29uc3QgZWRpdG9yRG9tID0gdGhpcy5fZWRpdG9yLmdldERvbU5vZGUoKTtcblx0XHRpZiAoIWVkaXRvckRvbSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGlvbnNUb1Nob3cgPSBvcHRpb25zLmluY2x1ZGVEaXNhYmxlZEFjdGlvbnMgJiYgKHRoaXMuX3Nob3dEaXNhYmxlZCB8fCBhY3Rpb25zLnZhbGlkQWN0aW9ucy5sZW5ndGggPT09IDApID8gYWN0aW9ucy5hbGxBY3Rpb25zIDogYWN0aW9ucy52YWxpZEFjdGlvbnM7XG5cdFx0aWYgKCFhY3Rpb25zVG9TaG93Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFuY2hvciA9IFBvc2l0aW9uLmlzSVBvc2l0aW9uKGF0KSA/IHRoaXMudG9Db29yZHMoYXQpIDogYXQ7XG5cblx0XHRjb25zdCBkZWxlZ2F0ZTogSUFjdGlvbkxpc3REZWxlZ2F0ZTxDb2RlQWN0aW9uSXRlbT4gPSB7XG5cdFx0XHRvblNlbGVjdDogYXN5bmMgKGFjdGlvbjogQ29kZUFjdGlvbkl0ZW0sIHByZXZpZXc/OiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdHRoaXMuYXBwbHlDb2RlQWN0aW9uKGFjdGlvbiwgLyogcmV0cmlnZ2VyICovIHRydWUsICEhcHJldmlldywgb3B0aW9ucy5mcm9tTGlnaHRidWxiID8gQXBwbHlDb2RlQWN0aW9uUmVhc29uLkZyb21BSUxpZ2h0YnVsYiA6IEFwcGx5Q29kZUFjdGlvblJlYXNvbi5Gcm9tQ29kZUFjdGlvbnMpO1xuXHRcdFx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLmhpZGUoZmFsc2UpO1xuXHRcdFx0XHRjdXJyZW50RGVjb3JhdGlvbnMuY2xlYXIoKTtcblx0XHRcdH0sXG5cdFx0XHRvbkhpZGU6IChkaWRDYW5jZWw/KSA9PiB7XG5cdFx0XHRcdHRoaXMuX2VkaXRvcj8uZm9jdXMoKTtcblx0XHRcdFx0Y3VycmVudERlY29yYXRpb25zLmNsZWFyKCk7XG5cdFx0XHR9LFxuXHRcdFx0b25Ib3ZlcjogYXN5bmMgKGFjdGlvbjogQ29kZUFjdGlvbkl0ZW0sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgY2FuUHJldmlldyA9IGZhbHNlO1xuXHRcdFx0XHRjb25zdCBhY3Rpb25LaW5kID0gYWN0aW9uLmFjdGlvbi5raW5kO1xuXG5cdFx0XHRcdGlmIChhY3Rpb25LaW5kKSB7XG5cdFx0XHRcdFx0Y29uc3QgaGllcmFyY2hpY2FsS2luZCA9IG5ldyBIaWVyYXJjaGljYWxLaW5kKGFjdGlvbktpbmQpO1xuXHRcdFx0XHRcdGNvbnN0IHJlZmFjdG9yS2luZHMgPSBbXG5cdFx0XHRcdFx0XHRDb2RlQWN0aW9uS2luZC5SZWZhY3RvckV4dHJhY3QsXG5cdFx0XHRcdFx0XHRDb2RlQWN0aW9uS2luZC5SZWZhY3RvcklubGluZSxcblx0XHRcdFx0XHRcdENvZGVBY3Rpb25LaW5kLlJlZmFjdG9yUmV3cml0ZSxcblx0XHRcdFx0XHRcdENvZGVBY3Rpb25LaW5kLlJlZmFjdG9yTW92ZSxcblx0XHRcdFx0XHRcdENvZGVBY3Rpb25LaW5kLlNvdXJjZVxuXHRcdFx0XHRcdF07XG5cblx0XHRcdFx0XHRjYW5QcmV2aWV3ID0gcmVmYWN0b3JLaW5kcy5zb21lKHJlZmFjdG9yS2luZCA9PiByZWZhY3RvcktpbmQuY29udGFpbnMoaGllcmFyY2hpY2FsS2luZCkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHsgY2FuUHJldmlldzogY2FuUHJldmlldyB8fCAhIWFjdGlvbi5hY3Rpb24uZWRpdD8uZWRpdHMubGVuZ3RoIH07XG5cdFx0XHR9LFxuXHRcdFx0b25Gb2N1czogKGFjdGlvbjogQ29kZUFjdGlvbkl0ZW0gfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbiAmJiBhY3Rpb24uYWN0aW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmFuZ2VzID0gYWN0aW9uLmFjdGlvbi5yYW5nZXM7XG5cdFx0XHRcdFx0Y29uc3QgZGlhZ25vc3RpY3MgPSBhY3Rpb24uYWN0aW9uLmRpYWdub3N0aWNzO1xuXHRcdFx0XHRcdGN1cnJlbnREZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdFx0XHRcdGlmIChyYW5nZXMgJiYgcmFuZ2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdC8vIEhhbmRsZXMgY2FzZSBmb3IgYGZpeCBhbGxgIHdoZXJlIHRoZXJlIGFyZSBtdWx0aXBsZSBkaWFnbm9zdGljcy5cblx0XHRcdFx0XHRcdGNvbnN0IGRlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IChkaWFnbm9zdGljcyAmJiBkaWFnbm9zdGljcz8ubGVuZ3RoID4gMSlcblx0XHRcdFx0XHRcdFx0PyBkaWFnbm9zdGljcy5tYXAoZGlhZ25vc3RpYyA9PiAoeyByYW5nZTogZGlhZ25vc3RpYywgb3B0aW9uczogQ29kZUFjdGlvbkNvbnRyb2xsZXIuREVDT1JBVElPTiB9KSlcblx0XHRcdFx0XHRcdFx0OiByYW5nZXMubWFwKHJhbmdlID0+ICh7IHJhbmdlLCBvcHRpb25zOiBDb2RlQWN0aW9uQ29udHJvbGxlci5ERUNPUkFUSU9OIH0pKTtcblx0XHRcdFx0XHRcdGN1cnJlbnREZWNvcmF0aW9ucy5zZXQoZGVjb3JhdGlvbnMpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZGlhZ25vc3RpY3MgJiYgZGlhZ25vc3RpY3MubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gZGlhZ25vc3RpY3MubWFwKGRpYWdub3N0aWMgPT4gKHsgcmFuZ2U6IGRpYWdub3N0aWMsIG9wdGlvbnM6IENvZGVBY3Rpb25Db250cm9sbGVyLkRFQ09SQVRJT04gfSkpO1xuXHRcdFx0XHRcdFx0Y3VycmVudERlY29yYXRpb25zLnNldChkZWNvcmF0aW9ucyk7XG5cdFx0XHRcdFx0XHRjb25zdCBkaWFnbm9zdGljID0gZGlhZ25vc3RpY3NbMF07XG5cdFx0XHRcdFx0XHRpZiAoZGlhZ25vc3RpYy5zdGFydExpbmVOdW1iZXIgJiYgZGlhZ25vc3RpYy5zdGFydENvbHVtbikge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBzZWxlY3Rpb25UZXh0ID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk/LmdldFdvcmRBdFBvc2l0aW9uKHsgbGluZU51bWJlcjogZGlhZ25vc3RpYy5zdGFydExpbmVOdW1iZXIsIGNvbHVtbjogZGlhZ25vc3RpYy5zdGFydENvbHVtbiB9KT8ud29yZDtcblx0XHRcdFx0XHRcdFx0YXJpYS5zdGF0dXMobG9jYWxpemUoJ2VkaXRpbmdOZXdTZWxlY3Rpb24nLCBcIkNvbnRleHQ6IHswfSBhdCBsaW5lIHsxfSBhbmQgY29sdW1uIHsyfS5cIiwgc2VsZWN0aW9uVGV4dCwgZGlhZ25vc3RpYy5zdGFydExpbmVOdW1iZXIsIGRpYWdub3N0aWMuc3RhcnRDb2x1bW4pKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y3VycmVudERlY29yYXRpb25zLmNsZWFyKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5zaG93KFxuXHRcdFx0J2NvZGVBY3Rpb25XaWRnZXQnLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHRvTWVudUl0ZW1zKGFjdGlvbnNUb1Nob3csIHRoaXMuX3Nob3VsZFNob3dIZWFkZXJzKCksIHRoaXMuX3Jlc29sdmVyLmdldFJlc29sdmVyKCkpLFxuXHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHRhbmNob3IsXG5cdFx0XHRlZGl0b3JEb20sXG5cdFx0XHR0aGlzLl9nZXRBY3Rpb25CYXJBY3Rpb25zKGFjdGlvbnMsIGF0LCBvcHRpb25zKSk7XG5cdH1cblxuXHRwcml2YXRlIHRvQ29vcmRzKHBvc2l0aW9uOiBJUG9zaXRpb24pOiBJQW5jaG9yIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm4geyB4OiAwLCB5OiAwIH07XG5cdFx0fVxuXG5cdFx0dGhpcy5fZWRpdG9yLnJldmVhbFBvc2l0aW9uKHBvc2l0aW9uLCBTY3JvbGxUeXBlLkltbWVkaWF0ZSk7XG5cdFx0dGhpcy5fZWRpdG9yLnJlbmRlcigpO1xuXG5cdFx0Ly8gVHJhbnNsYXRlIHRvIGFic29sdXRlIGVkaXRvciBwb3NpdGlvblxuXHRcdGNvbnN0IGN1cnNvckNvb3JkcyA9IHRoaXMuX2VkaXRvci5nZXRTY3JvbGxlZFZpc2libGVQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0Y29uc3QgZWRpdG9yQ29vcmRzID0gZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbih0aGlzLl9lZGl0b3IuZ2V0RG9tTm9kZSgpKTtcblx0XHRjb25zdCB4ID0gZWRpdG9yQ29vcmRzLmxlZnQgKyBjdXJzb3JDb29yZHMubGVmdDtcblx0XHRjb25zdCB5ID0gZWRpdG9yQ29vcmRzLnRvcCArIGN1cnNvckNvb3Jkcy50b3AgKyBjdXJzb3JDb29yZHMuaGVpZ2h0O1xuXG5cdFx0cmV0dXJuIHsgeCwgeSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvdWxkU2hvd0hlYWRlcnMoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3I/LmdldE1vZGVsKCk7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdlZGl0b3IuY29kZUFjdGlvbldpZGdldC5zaG93SGVhZGVycycsIHsgcmVzb3VyY2U6IG1vZGVsPy51cmkgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRBY3Rpb25CYXJBY3Rpb25zKGFjdGlvbnM6IENvZGVBY3Rpb25TZXQsIGF0OiBJQW5jaG9yIHwgSVBvc2l0aW9uLCBvcHRpb25zOiBJQWN0aW9uU2hvd09wdGlvbnMpOiBJQWN0aW9uW10ge1xuXHRcdGlmIChvcHRpb25zLmZyb21MaWdodGJ1bGIpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHRBY3Rpb25zID0gYWN0aW9ucy5kb2N1bWVudGF0aW9uLm1hcCgoY29tbWFuZCk6IElBY3Rpb24gPT4gKHtcblx0XHRcdGlkOiBjb21tYW5kLmlkLFxuXHRcdFx0bGFiZWw6IGNvbW1hbmQudGl0bGUsXG5cdFx0XHR0b29sdGlwOiBjb21tYW5kLnRvb2x0aXAgPz8gJycsXG5cdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZC5pZCwgLi4uKGNvbW1hbmQuYXJndW1lbnRzID8/IFtdKSksXG5cdFx0fSkpO1xuXG5cdFx0aWYgKG9wdGlvbnMuaW5jbHVkZURpc2FibGVkQWN0aW9ucyAmJiBhY3Rpb25zLnZhbGlkQWN0aW9ucy5sZW5ndGggPiAwICYmIGFjdGlvbnMuYWxsQWN0aW9ucy5sZW5ndGggIT09IGFjdGlvbnMudmFsaWRBY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0cmVzdWx0QWN0aW9ucy5wdXNoKHRoaXMuX3Nob3dEaXNhYmxlZCA/IHtcblx0XHRcdFx0aWQ6ICdoaWRlTW9yZUFjdGlvbnMnLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2hpZGVNb3JlQWN0aW9ucycsICdIaWRlIERpc2FibGVkJyksXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9zaG93RGlzYWJsZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5zaG93Q29kZUFjdGlvbkxpc3QoYWN0aW9ucywgYXQsIG9wdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IDoge1xuXHRcdFx0XHRpZDogJ3Nob3dNb3JlQWN0aW9ucycsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2hvd01vcmVBY3Rpb25zJywgJ1Nob3cgRGlzYWJsZWQnKSxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0dG9vbHRpcDogJycsXG5cdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3Nob3dEaXNhYmxlZCA9IHRydWU7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuc2hvd0NvZGVBY3Rpb25MaXN0KGFjdGlvbnMsIGF0LCBvcHRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdEFjdGlvbnM7XG5cdH1cbn1cblxucmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQoKHRoZW1lLCBjb2xsZWN0b3IpID0+IHtcblx0Y29uc3QgYWRkQmFja2dyb3VuZENvbG9yUnVsZSA9IChzZWxlY3Rvcjogc3RyaW5nLCBjb2xvcjogQ29sb3IgfCB1bmRlZmluZWQpOiB2b2lkID0+IHtcblx0XHRpZiAoY29sb3IpIHtcblx0XHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLWVkaXRvciAke3NlbGVjdG9yfSB7IGJhY2tncm91bmQtY29sb3I6ICR7Y29sb3J9OyB9YCk7XG5cdFx0fVxuXHR9O1xuXG5cdGFkZEJhY2tncm91bmRDb2xvclJ1bGUoJy5xdWlja2ZpeC1lZGl0LWhpZ2hsaWdodCcsIHRoZW1lLmdldENvbG9yKGVkaXRvckZpbmRNYXRjaEhpZ2hsaWdodCkpO1xuXHRjb25zdCBmaW5kTWF0Y2hIaWdobGlnaHRCb3JkZXIgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JGaW5kTWF0Y2hIaWdobGlnaHRCb3JkZXIpO1xuXG5cdGlmIChmaW5kTWF0Y2hIaWdobGlnaHRCb3JkZXIpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby1lZGl0b3IgLnF1aWNrZml4LWVkaXQtaGlnaGxpZ2h0IHsgYm9yZGVyOiAxcHggJHtpc0hpZ2hDb250cmFzdCh0aGVtZS50eXBlKSA/ICdkb3R0ZWQnIDogJ3NvbGlkJ30gJHtmaW5kTWF0Y2hIaWdobGlnaHRCb3JkZXJ9OyBib3gtc2l6aW5nOiBib3JkZXItYm94OyB9YCk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLDhCQUE4QjtBQUN2QyxZQUFZLFVBQVU7QUFLdEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsWUFBWSx5QkFBeUI7QUFDOUMsU0FBUyxhQUEwQix1QkFBdUI7QUFDMUQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsMEJBQTBCLHNDQUFzQztBQUN6RSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtDQUFrQztBQUUzQyxTQUFvQixnQkFBZ0I7QUFDcEMsU0FBOEIsa0JBQWtCO0FBQ2hELFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsOEJB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
