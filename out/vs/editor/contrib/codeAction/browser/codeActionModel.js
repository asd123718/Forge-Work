import { createCancelablePromise, TimeoutTimer } from "../../../../base/common/async.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { HierarchicalKind } from "../../../../base/common/hierarchicalKind.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { isEqual } from "../../../../base/common/resources.js";
import { RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { Progress } from "../../../../platform/progress/common/progress.js";
import { EditorOption, ShowLightbulbIconMode } from "../../../common/config/editorOptions.js";
import { Position } from "../../../common/core/position.js";
import { Selection } from "../../../common/core/selection.js";
import { CodeActionTriggerType } from "../../../common/languages.js";
import { CodeActionKind, CodeActionTriggerSource } from "../common/types.js";
import { getCodeActions } from "./codeAction.js";
const SUPPORTED_CODE_ACTIONS = new RawContextKey("supportedCodeAction", "");
const APPLY_FIX_ALL_COMMAND_ID = "_typescript.applyFixAllCodeAction";
class CodeActionOracle extends Disposable {
  constructor(_editor, _markerService, _signalChange, _delay = 250) {
    super();
    this._editor = _editor;
    this._markerService = _markerService;
    this._signalChange = _signalChange;
    this._delay = _delay;
    this._autoTriggerTimer = this._register(new TimeoutTimer());
    this.ignoreLightbulbOff = false;
    this._register(this._markerService.onMarkerChanged((e) => this._onMarkerChanges(e)));
    this._register(this._editor.onDidChangeCursorPosition(() => this._tryAutoTrigger()));
  }
  trigger(trigger) {
    const selection = this._getRangeOfSelectionUnlessWhitespaceEnclosed(trigger);
    this._signalChange(selection ? { trigger, selection } : void 0);
  }
  _onMarkerChanges(resources) {
    const model = this._editor.getModel();
    if (model && resources.some((resource) => isEqual(resource, model.uri))) {
      this._tryAutoTrigger();
    }
  }
  _tryAutoTrigger() {
    this._autoTriggerTimer.cancelAndSet(() => {
      this.trigger({ type: CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.Default });
    }, this._delay);
  }
  _getRangeOfSelectionUnlessWhitespaceEnclosed(trigger) {
    if (!this._editor.hasModel()) {
      return void 0;
    }
    const selection = this._editor.getSelection();
    if (trigger.type === CodeActionTriggerType.Invoke) {
      return selection;
    }
    const enabled = this._editor.getOption(EditorOption.lightbulb).enabled;
    if (enabled === ShowLightbulbIconMode.Off && !this.ignoreLightbulbOff) {
      return void 0;
    } else if (enabled === ShowLightbulbIconMode.Off || enabled === ShowLightbulbIconMode.On) {
      return selection;
    } else if (enabled === ShowLightbulbIconMode.OnCode) {
      const isSelectionEmpty = selection.isEmpty();
      if (!isSelectionEmpty) {
        return selection;
      }
      const model = this._editor.getModel();
      const { lineNumber, column } = selection.getPosition();
      const line = model.getLineContent(lineNumber);
      if (line.length === 0) {
        return void 0;
      } else if (column === 1) {
        if (/\s/.test(line[0])) {
          return void 0;
        }
      } else if (column === model.getLineMaxColumn(lineNumber)) {
        if (/\s/.test(line[line.length - 1])) {
          return void 0;
        }
      } else {
        if (/\s/.test(line[column - 2]) && /\s/.test(line[column - 1])) {
          return void 0;
        }
      }
    }
    return selection;
  }
}
var CodeActionsState;
((CodeActionsState2) => {
  let Type;
  ((Type2) => {
    Type2[Type2["Empty"] = 0] = "Empty";
    Type2[Type2["Triggered"] = 1] = "Triggered";
  })(Type = CodeActionsState2.Type || (CodeActionsState2.Type = {}));
  CodeActionsState2.Empty = { type: 0 /* Empty */ };
  class Triggered {
    constructor(trigger, position, _cancellablePromise) {
      this.trigger = trigger;
      this.position = position;
      this._cancellablePromise = _cancellablePromise;
      this.type = 1 /* Triggered */;
      this.actions = _cancellablePromise.catch((e) => {
        if (isCancellationError(e)) {
          return emptyCodeActionSet;
        }
        throw e;
      });
    }
    cancel() {
      this._cancellablePromise.cancel();
    }
  }
  CodeActionsState2.Triggered = Triggered;
})(CodeActionsState || (CodeActionsState = {}));
const emptyCodeActionSet = Object.freeze({
  allActions: [],
  validActions: [],
  dispose: () => {
  },
  documentation: [],
  hasAutoFix: false,
  hasAIFix: false,
  allAIFixes: false
});
class CodeActionModel extends Disposable {
  constructor(_editor, _registry, _markerService, contextKeyService, _progressService, _configurationService) {
    super();
    this._editor = _editor;
    this._registry = _registry;
    this._markerService = _markerService;
    this._progressService = _progressService;
    this._configurationService = _configurationService;
    this._codeActionOracle = this._register(new MutableDisposable());
    this._state = CodeActionsState.Empty;
    this._onDidChangeState = this._register(new Emitter());
    this.onDidChangeState = this._onDidChangeState.event;
    this.codeActionsDisposable = this._register(new MutableDisposable());
    this._disposed = false;
    this._ignoreLightbulbOff = false;
    this._supportedCodeActions = SUPPORTED_CODE_ACTIONS.bindTo(contextKeyService);
    this._register(this._editor.onDidChangeModel(() => this._update()));
    this._register(this._editor.onDidChangeModelLanguage(() => this._update()));
    this._register(this._registry.onDidChange(() => this._update()));
    this._register(this._editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.lightbulb)) {
        this._update();
      }
    }));
    this._update();
  }
  set ignoreLightbulbOff(value) {
    if (this._ignoreLightbulbOff === value) {
      return;
    }
    this._ignoreLightbulbOff = value;
    const oracle = this._codeActionOracle.value;
    if (oracle) {
      oracle.ignoreLightbulbOff = value;
      if (value) {
        oracle.trigger({ type: CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.Default });
      }
    }
  }
  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    super.dispose();
    this.setState(CodeActionsState.Empty, true);
  }
  _settingEnabledNearbyQuickfixes() {
    const model = this._editor?.getModel();
    return this._configurationService ? this._configurationService.getValue("editor.codeActionWidget.includeNearbyQuickFixes", { resource: model?.uri }) : false;
  }
  _update() {
    if (this._disposed) {
      return;
    }
    this._codeActionOracle.value = void 0;
    this.setState(CodeActionsState.Empty);
    this.codeActionsDisposable.clear();
    const model = this._editor.getModel();
    if (model && this._registry.has(model) && !this._editor.getOption(EditorOption.readOnly)) {
      const supportedActions = this._registry.all(model).flatMap((provider) => provider.providedCodeActionKinds ?? []);
      this._supportedCodeActions.set(supportedActions.join(" "));
      const oracle = new CodeActionOracle(this._editor, this._markerService, (trigger) => {
        if (!trigger) {
          this.setState(CodeActionsState.Empty);
          return;
        }
        const startPosition = trigger.selection.getStartPosition();
        const actions = createCancelablePromise(async (token) => {
          if (this._settingEnabledNearbyQuickfixes() && trigger.trigger.type === CodeActionTriggerType.Invoke && (trigger.trigger.triggerAction === CodeActionTriggerSource.QuickFix || trigger.trigger.filter?.include?.contains(CodeActionKind.QuickFix))) {
            const codeActionSet2 = await getCodeActions(this._registry, model, trigger.selection, trigger.trigger, Progress.None, token);
            this.codeActionsDisposable.value = codeActionSet2;
            const allCodeActions = [...codeActionSet2.allActions];
            if (token.isCancellationRequested) {
              codeActionSet2.dispose();
              return emptyCodeActionSet;
            }
            const foundQuickfix = codeActionSet2.validActions?.some((action) => {
              return action.action.kind && CodeActionKind.QuickFix.contains(new HierarchicalKind(action.action.kind)) && !action.action.isAI;
            });
            const allMarkers = this._markerService.read({ resource: model.uri });
            if (foundQuickfix) {
              for (const action of codeActionSet2.validActions) {
                if (action.action.command?.arguments?.some((arg) => typeof arg === "string" && arg.includes(APPLY_FIX_ALL_COMMAND_ID))) {
                  action.action.diagnostics = [...allMarkers.filter((marker) => marker.relatedInformation)];
                }
              }
              return { validActions: codeActionSet2.validActions, allActions: allCodeActions, documentation: codeActionSet2.documentation, hasAutoFix: codeActionSet2.hasAutoFix, hasAIFix: codeActionSet2.hasAIFix, allAIFixes: codeActionSet2.allAIFixes, dispose: () => {
                this.codeActionsDisposable.value = codeActionSet2;
              } };
            } else if (!foundQuickfix) {
              if (allMarkers.length > 0) {
                const currPosition = trigger.selection.getPosition();
                let trackedPosition = currPosition;
                let distance = Number.MAX_VALUE;
                const currentActions = [...codeActionSet2.validActions];
                for (const marker of allMarkers) {
                  const col = marker.endColumn;
                  const row = marker.endLineNumber;
                  const startRow = marker.startLineNumber;
                  if (row === currPosition.lineNumber || startRow === currPosition.lineNumber) {
                    trackedPosition = new Position(row, col);
                    const newCodeActionTrigger = {
                      type: trigger.trigger.type,
                      triggerAction: trigger.trigger.triggerAction,
                      filter: { include: trigger.trigger.filter?.include ? trigger.trigger.filter?.include : CodeActionKind.QuickFix },
                      autoApply: trigger.trigger.autoApply,
                      context: { notAvailableMessage: trigger.trigger.context?.notAvailableMessage || "", position: trackedPosition }
                    };
                    const selectionAsPosition = new Selection(trackedPosition.lineNumber, trackedPosition.column, trackedPosition.lineNumber, trackedPosition.column);
                    const actionsAtMarker = await getCodeActions(this._registry, model, selectionAsPosition, newCodeActionTrigger, Progress.None, token);
                    if (token.isCancellationRequested) {
                      actionsAtMarker.dispose();
                      return emptyCodeActionSet;
                    }
                    if (actionsAtMarker.validActions.length !== 0) {
                      for (const action of actionsAtMarker.validActions) {
                        if (action.action.command?.arguments?.some((arg) => typeof arg === "string" && arg.includes(APPLY_FIX_ALL_COMMAND_ID))) {
                          action.action.diagnostics = [...allMarkers.filter((marker2) => marker2.relatedInformation)];
                        }
                      }
                      if (codeActionSet2.allActions.length === 0) {
                        allCodeActions.push(...actionsAtMarker.allActions);
                      }
                      if (Math.abs(currPosition.column - col) < distance) {
                        currentActions.unshift(...actionsAtMarker.validActions);
                      } else {
                        currentActions.push(...actionsAtMarker.validActions);
                      }
                    }
                    distance = Math.abs(currPosition.column - col);
                  }
                }
                const filteredActions = currentActions.filter((action, index, self) => self.findIndex((a) => a.action.title === action.action.title) === index);
                filteredActions.sort((a, b) => {
                  if (a.action.isPreferred && !b.action.isPreferred) {
                    return -1;
                  } else if (!a.action.isPreferred && b.action.isPreferred) {
                    return 1;
                  } else if (a.action.isAI && !b.action.isAI) {
                    return 1;
                  } else if (!a.action.isAI && b.action.isAI) {
                    return -1;
                  } else {
                    return 0;
                  }
                });
                return { validActions: filteredActions, allActions: allCodeActions, documentation: codeActionSet2.documentation, hasAutoFix: codeActionSet2.hasAutoFix, hasAIFix: codeActionSet2.hasAIFix, allAIFixes: codeActionSet2.allAIFixes, dispose: () => {
                  this.codeActionsDisposable.value = codeActionSet2;
                } };
              }
            }
          }
          if (trigger.trigger.type === CodeActionTriggerType.Invoke) {
            const codeActions = await getCodeActions(this._registry, model, trigger.selection, trigger.trigger, Progress.None, token);
            this.codeActionsDisposable.value = codeActions;
            return codeActions;
          }
          const codeActionSet = await getCodeActions(this._registry, model, trigger.selection, trigger.trigger, Progress.None, token);
          this.codeActionsDisposable.value = codeActionSet;
          return codeActionSet;
        });
        if (trigger.trigger.type === CodeActionTriggerType.Invoke) {
          this._progressService?.showWhile(actions, 250);
        }
        const newState = new CodeActionsState.Triggered(trigger.trigger, startPosition, actions);
        let isManualToAutoTransition = false;
        if (this._state.type === 1 /* Triggered */) {
          isManualToAutoTransition = this._state.trigger.type === CodeActionTriggerType.Invoke && newState.type === 1 /* Triggered */ && newState.trigger.type === CodeActionTriggerType.Auto && this._state.position !== newState.position;
        }
        if (!isManualToAutoTransition) {
          this.setState(newState);
        } else {
          setTimeout(() => {
            this.setState(newState);
          }, 500);
        }
      }, void 0);
      oracle.ignoreLightbulbOff = this._ignoreLightbulbOff;
      this._codeActionOracle.value = oracle;
      this._codeActionOracle.value.trigger({ type: CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.Default });
    } else {
      this._supportedCodeActions.reset();
    }
  }
  trigger(trigger) {
    this._codeActionOracle.value?.trigger(trigger);
    this.codeActionsDisposable.clear();
  }
  setState(newState, skipNotify) {
    if (newState === this._state) {
      return;
    }
    if (this._state.type === 1 /* Triggered */) {
      this._state.cancel();
    }
    this._state = newState;
    if (!skipNotify && !this._disposed) {
      this._onDidChangeState.fire(newState);
    }
  }
}
export {
  APPLY_FIX_ALL_COMMAND_ID,
  CodeActionModel,
  CodeActionsState,
  SUPPORTED_CODE_ACTIONS
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGNvZGVBY3Rpb25cXGJyb3dzZXJcXGNvZGVBY3Rpb25Nb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSwgVGltZW91dFRpbWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSGllcmFyY2hpY2FsS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hpZXJhcmNoaWNhbEtpbmQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSU1hcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IElFZGl0b3JQcm9ncmVzc1NlcnZpY2UsIFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiwgU2hvd0xpZ2h0YnVsYkljb25Nb2RlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb25Qcm92aWRlciwgQ29kZUFjdGlvblRyaWdnZXJUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uS2luZCwgQ29kZUFjdGlvblNldCwgQ29kZUFjdGlvblRyaWdnZXIsIENvZGVBY3Rpb25UcmlnZ2VyU291cmNlIH0gZnJvbSAnLi4vY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGdldENvZGVBY3Rpb25zIH0gZnJvbSAnLi9jb2RlQWN0aW9uLmpzJztcblxuZXhwb3J0IGNvbnN0IFNVUFBPUlRFRF9DT0RFX0FDVElPTlMgPSBuZXcgUmF3Q29udGV4dEtleTxzdHJpbmc+KCdzdXBwb3J0ZWRDb2RlQWN0aW9uJywgJycpO1xuXG5leHBvcnQgY29uc3QgQVBQTFlfRklYX0FMTF9DT01NQU5EX0lEID0gJ190eXBlc2NyaXB0LmFwcGx5Rml4QWxsQ29kZUFjdGlvbic7XG5cbnR5cGUgVHJpZ2dlcmVkQ29kZUFjdGlvbiA9IHtcblx0cmVhZG9ubHkgc2VsZWN0aW9uOiBTZWxlY3Rpb247XG5cdHJlYWRvbmx5IHRyaWdnZXI6IENvZGVBY3Rpb25UcmlnZ2VyO1xufTtcblxuY2xhc3MgQ29kZUFjdGlvbk9yYWNsZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2F1dG9UcmlnZ2VyVGltZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGltZW91dFRpbWVyKCkpO1xuXG5cdGlnbm9yZUxpZ2h0YnVsYk9mZiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2lnbmFsQ2hhbmdlOiAodHJpZ2dlcmVkOiBUcmlnZ2VyZWRDb2RlQWN0aW9uIHwgdW5kZWZpbmVkKSA9PiB2b2lkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RlbGF5OiBudW1iZXIgPSAyNTAsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbWFya2VyU2VydmljZS5vbk1hcmtlckNoYW5nZWQoZSA9PiB0aGlzLl9vbk1hcmtlckNoYW5nZXMoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbigoKSA9PiB0aGlzLl90cnlBdXRvVHJpZ2dlcigpKSk7XG5cdH1cblxuXHRwdWJsaWMgdHJpZ2dlcih0cmlnZ2VyOiBDb2RlQWN0aW9uVHJpZ2dlcik6IHZvaWQge1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuX2dldFJhbmdlT2ZTZWxlY3Rpb25Vbmxlc3NXaGl0ZXNwYWNlRW5jbG9zZWQodHJpZ2dlcik7XG5cdFx0dGhpcy5fc2lnbmFsQ2hhbmdlKHNlbGVjdGlvbiA/IHsgdHJpZ2dlciwgc2VsZWN0aW9uIH0gOiB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25NYXJrZXJDaGFuZ2VzKHJlc291cmNlczogcmVhZG9ubHkgVVJJW10pOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmIChtb2RlbCAmJiByZXNvdXJjZXMuc29tZShyZXNvdXJjZSA9PiBpc0VxdWFsKHJlc291cmNlLCBtb2RlbC51cmkpKSkge1xuXHRcdFx0dGhpcy5fdHJ5QXV0b1RyaWdnZXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF90cnlBdXRvVHJpZ2dlcigpIHtcblx0XHR0aGlzLl9hdXRvVHJpZ2dlclRpbWVyLmNhbmNlbEFuZFNldCgoKSA9PiB7XG5cdFx0XHR0aGlzLnRyaWdnZXIoeyB0eXBlOiBDb2RlQWN0aW9uVHJpZ2dlclR5cGUuQXV0bywgdHJpZ2dlckFjdGlvbjogQ29kZUFjdGlvblRyaWdnZXJTb3VyY2UuRGVmYXVsdCB9KTtcblx0XHR9LCB0aGlzLl9kZWxheSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSYW5nZU9mU2VsZWN0aW9uVW5sZXNzV2hpdGVzcGFjZUVuY2xvc2VkKHRyaWdnZXI6IENvZGVBY3Rpb25UcmlnZ2VyKTogU2VsZWN0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0aWYgKHRyaWdnZXIudHlwZSA9PT0gQ29kZUFjdGlvblRyaWdnZXJUeXBlLkludm9rZSkge1xuXHRcdFx0cmV0dXJuIHNlbGVjdGlvbjtcblx0XHR9XG5cdFx0Y29uc3QgZW5hYmxlZCA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpZ2h0YnVsYikuZW5hYmxlZDtcblx0XHRpZiAoZW5hYmxlZCA9PT0gU2hvd0xpZ2h0YnVsYkljb25Nb2RlLk9mZiAmJiAhdGhpcy5pZ25vcmVMaWdodGJ1bGJPZmYpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmIChlbmFibGVkID09PSBTaG93TGlnaHRidWxiSWNvbk1vZGUuT2ZmIHx8IGVuYWJsZWQgPT09IFNob3dMaWdodGJ1bGJJY29uTW9kZS5Pbikge1xuXHRcdFx0cmV0dXJuIHNlbGVjdGlvbjtcblx0XHR9IGVsc2UgaWYgKGVuYWJsZWQgPT09IFNob3dMaWdodGJ1bGJJY29uTW9kZS5PbkNvZGUpIHtcblx0XHRcdGNvbnN0IGlzU2VsZWN0aW9uRW1wdHkgPSBzZWxlY3Rpb24uaXNFbXB0eSgpO1xuXHRcdFx0aWYgKCFpc1NlbGVjdGlvbkVtcHR5KSB7XG5cdFx0XHRcdHJldHVybiBzZWxlY3Rpb247XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0Y29uc3QgeyBsaW5lTnVtYmVyLCBjb2x1bW4gfSA9IHNlbGVjdGlvbi5nZXRQb3NpdGlvbigpO1xuXHRcdFx0Y29uc3QgbGluZSA9IG1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRcdFx0aWYgKGxpbmUubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdC8vIGVtcHR5IGxpbmVcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0gZWxzZSBpZiAoY29sdW1uID09PSAxKSB7XG5cdFx0XHRcdC8vIGxvb2sgb25seSByaWdodFxuXHRcdFx0XHRpZiAoL1xccy8udGVzdChsaW5lWzBdKSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoY29sdW1uID09PSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpKSB7XG5cdFx0XHRcdC8vIGxvb2sgb25seSBsZWZ0XG5cdFx0XHRcdGlmICgvXFxzLy50ZXN0KGxpbmVbbGluZS5sZW5ndGggLSAxXSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBsb29rIGxlZnQgYW5kIHJpZ2h0XG5cdFx0XHRcdGlmICgvXFxzLy50ZXN0KGxpbmVbY29sdW1uIC0gMl0pICYmIC9cXHMvLnRlc3QobGluZVtjb2x1bW4gLSAxXSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBzZWxlY3Rpb247XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDb2RlQWN0aW9uc1N0YXRlIHtcblxuXHRleHBvcnQgY29uc3QgZW51bSBUeXBlIHsgRW1wdHksIFRyaWdnZXJlZCB9XG5cblx0ZXhwb3J0IGNvbnN0IEVtcHR5ID0geyB0eXBlOiBUeXBlLkVtcHR5IH0gYXMgY29uc3Q7XG5cblx0ZXhwb3J0IGNsYXNzIFRyaWdnZXJlZCB7XG5cdFx0cmVhZG9ubHkgdHlwZSA9IFR5cGUuVHJpZ2dlcmVkO1xuXG5cdFx0cHVibGljIHJlYWRvbmx5IGFjdGlvbnM6IFByb21pc2U8Q29kZUFjdGlvblNldD47XG5cblx0XHRjb25zdHJ1Y3Rvcihcblx0XHRcdHB1YmxpYyByZWFkb25seSB0cmlnZ2VyOiBDb2RlQWN0aW9uVHJpZ2dlcixcblx0XHRcdHB1YmxpYyByZWFkb25seSBwb3NpdGlvbjogUG9zaXRpb24sXG5cdFx0XHRwcml2YXRlIHJlYWRvbmx5IF9jYW5jZWxsYWJsZVByb21pc2U6IENhbmNlbGFibGVQcm9taXNlPENvZGVBY3Rpb25TZXQ+LFxuXHRcdCkge1xuXHRcdFx0dGhpcy5hY3Rpb25zID0gX2NhbmNlbGxhYmxlUHJvbWlzZS5jYXRjaCgoZSk6IENvZGVBY3Rpb25TZXQgPT4ge1xuXHRcdFx0XHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlKSkge1xuXHRcdFx0XHRcdHJldHVybiBlbXB0eUNvZGVBY3Rpb25TZXQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBjYW5jZWwoKSB7XG5cdFx0XHR0aGlzLl9jYW5jZWxsYWJsZVByb21pc2UuY2FuY2VsKCk7XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IHR5cGUgU3RhdGUgPSB0eXBlb2YgRW1wdHkgfCBUcmlnZ2VyZWQ7XG59XG5cbmNvbnN0IGVtcHR5Q29kZUFjdGlvblNldCA9IE9iamVjdC5mcmVlemU8Q29kZUFjdGlvblNldD4oe1xuXHRhbGxBY3Rpb25zOiBbXSxcblx0dmFsaWRBY3Rpb25zOiBbXSxcblx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRkb2N1bWVudGF0aW9uOiBbXSxcblx0aGFzQXV0b0ZpeDogZmFsc2UsXG5cdGhhc0FJRml4OiBmYWxzZSxcblx0YWxsQUlGaXhlczogZmFsc2UsXG59KTtcblxuXG5leHBvcnQgY2xhc3MgQ29kZUFjdGlvbk1vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29kZUFjdGlvbk9yYWNsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxDb2RlQWN0aW9uT3JhY2xlPigpKTtcblx0cHJpdmF0ZSBfc3RhdGU6IENvZGVBY3Rpb25zU3RhdGUuU3RhdGUgPSBDb2RlQWN0aW9uc1N0YXRlLkVtcHR5O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N1cHBvcnRlZENvZGVBY3Rpb25zOiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxDb2RlQWN0aW9uc1N0YXRlLlN0YXRlPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU3RhdGUgPSB0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29kZUFjdGlvbnNEaXNwb3NhYmxlOiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSBfZGlzcG9zZWQgPSBmYWxzZTtcblxuXHRwcml2YXRlIF9pZ25vcmVMaWdodGJ1bGJPZmYgPSBmYWxzZTtcblxuXHRzZXQgaWdub3JlTGlnaHRidWxiT2ZmKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuX2lnbm9yZUxpZ2h0YnVsYk9mZiA9PT0gdmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faWdub3JlTGlnaHRidWxiT2ZmID0gdmFsdWU7XG5cdFx0Y29uc3Qgb3JhY2xlID0gdGhpcy5fY29kZUFjdGlvbk9yYWNsZS52YWx1ZTtcblx0XHRpZiAob3JhY2xlKSB7XG5cdFx0XHRvcmFjbGUuaWdub3JlTGlnaHRidWxiT2ZmID0gdmFsdWU7XG5cdFx0XHRpZiAodmFsdWUpIHtcblx0XHRcdFx0b3JhY2xlLnRyaWdnZXIoeyB0eXBlOiBDb2RlQWN0aW9uVHJpZ2dlclR5cGUuQXV0bywgdHJpZ2dlckFjdGlvbjogQ29kZUFjdGlvblRyaWdnZXJTb3VyY2UuRGVmYXVsdCB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3JlZ2lzdHJ5OiBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTxDb2RlQWN0aW9uUHJvdmlkZXI+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21hcmtlclNlcnZpY2U6IElNYXJrZXJTZXJ2aWNlLFxuXHRcdGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvZ3Jlc3NTZXJ2aWNlPzogSUVkaXRvclByb2dyZXNzU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZT86IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9zdXBwb3J0ZWRDb2RlQWN0aW9ucyA9IFNVUFBPUlRFRF9DT0RFX0FDVElPTlMuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsKCgpID0+IHRoaXMuX3VwZGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZSgoKSA9PiB0aGlzLl91cGRhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlZ2lzdHJ5Lm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuX3VwZGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoZSkgPT4ge1xuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24ubGlnaHRidWxiKSkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fdXBkYXRlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9kaXNwb3NlZCA9IHRydWU7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5zZXRTdGF0ZShDb2RlQWN0aW9uc1N0YXRlLkVtcHR5LCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldHRpbmdFbmFibGVkTmVhcmJ5UXVpY2tmaXhlcygpOiBib29sZWFuIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvcj8uZ2V0TW9kZWwoKTtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UgPyB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZWRpdG9yLmNvZGVBY3Rpb25XaWRnZXQuaW5jbHVkZU5lYXJieVF1aWNrRml4ZXMnLCB7IHJlc291cmNlOiBtb2RlbD8udXJpIH0pIDogZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fY29kZUFjdGlvbk9yYWNsZS52YWx1ZSA9IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuc2V0U3RhdGUoQ29kZUFjdGlvbnNTdGF0ZS5FbXB0eSk7XG5cdFx0dGhpcy5jb2RlQWN0aW9uc0Rpc3Bvc2FibGUuY2xlYXIoKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKG1vZGVsXG5cdFx0XHQmJiB0aGlzLl9yZWdpc3RyeS5oYXMobW9kZWwpXG5cdFx0XHQmJiAhdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ucmVhZE9ubHkpXG5cdFx0KSB7XG5cdFx0XHRjb25zdCBzdXBwb3J0ZWRBY3Rpb25zOiBzdHJpbmdbXSA9IHRoaXMuX3JlZ2lzdHJ5LmFsbChtb2RlbCkuZmxhdE1hcChwcm92aWRlciA9PiBwcm92aWRlci5wcm92aWRlZENvZGVBY3Rpb25LaW5kcyA/PyBbXSk7XG5cdFx0XHR0aGlzLl9zdXBwb3J0ZWRDb2RlQWN0aW9ucy5zZXQoc3VwcG9ydGVkQWN0aW9ucy5qb2luKCcgJykpO1xuXG5cdFx0XHRjb25zdCBvcmFjbGUgPSBuZXcgQ29kZUFjdGlvbk9yYWNsZSh0aGlzLl9lZGl0b3IsIHRoaXMuX21hcmtlclNlcnZpY2UsIHRyaWdnZXIgPT4ge1xuXHRcdFx0XHRpZiAoIXRyaWdnZXIpIHtcblx0XHRcdFx0XHR0aGlzLnNldFN0YXRlKENvZGVBY3Rpb25zU3RhdGUuRW1wdHkpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHN0YXJ0UG9zaXRpb24gPSB0cmlnZ2VyLnNlbGVjdGlvbi5nZXRTdGFydFBvc2l0aW9uKCk7XG5cblx0XHRcdFx0Y29uc3QgYWN0aW9ucyA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKGFzeW5jIHRva2VuID0+IHtcblx0XHRcdFx0XHRpZiAodGhpcy5fc2V0dGluZ0VuYWJsZWROZWFyYnlRdWlja2ZpeGVzKCkgJiYgdHJpZ2dlci50cmlnZ2VyLnR5cGUgPT09IENvZGVBY3Rpb25UcmlnZ2VyVHlwZS5JbnZva2UgJiYgKHRyaWdnZXIudHJpZ2dlci50cmlnZ2VyQWN0aW9uID09PSBDb2RlQWN0aW9uVHJpZ2dlclNvdXJjZS5RdWlja0ZpeCB8fCB0cmlnZ2VyLnRyaWdnZXIuZmlsdGVyPy5pbmNsdWRlPy5jb250YWlucyhDb2RlQWN0aW9uS2luZC5RdWlja0ZpeCkpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjb2RlQWN0aW9uU2V0ID0gYXdhaXQgZ2V0Q29kZUFjdGlvbnModGhpcy5fcmVnaXN0cnksIG1vZGVsLCB0cmlnZ2VyLnNlbGVjdGlvbiwgdHJpZ2dlci50cmlnZ2VyLCBQcm9ncmVzcy5Ob25lLCB0b2tlbik7XG5cdFx0XHRcdFx0XHR0aGlzLmNvZGVBY3Rpb25zRGlzcG9zYWJsZS52YWx1ZSA9IGNvZGVBY3Rpb25TZXQ7XG5cdFx0XHRcdFx0XHRjb25zdCBhbGxDb2RlQWN0aW9ucyA9IFsuLi5jb2RlQWN0aW9uU2V0LmFsbEFjdGlvbnNdO1xuXHRcdFx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdGNvZGVBY3Rpb25TZXQuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZW1wdHlDb2RlQWN0aW9uU2V0O1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBTZWFyY2ggZm9yIG5vbi1BSSBxdWlja2ZpeGVzIGluIHRoZSBjdXJyZW50IGNvZGUgYWN0aW9uIHNldCAtIGlmIEFJIGNvZGUgYWN0aW9ucyBhcmUgdGhlIG9ubHkgdGhpbmcgZm91bmQsIGNvbnRpbnVlIHNlYXJjaGluZyBmb3IgZGlhZ25vc3RpY3MgaW4gbGluZS5cblx0XHRcdFx0XHRcdGNvbnN0IGZvdW5kUXVpY2tmaXggPSBjb2RlQWN0aW9uU2V0LnZhbGlkQWN0aW9ucz8uc29tZShhY3Rpb24gPT4ge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gYWN0aW9uLmFjdGlvbi5raW5kICYmXG5cdFx0XHRcdFx0XHRcdFx0Q29kZUFjdGlvbktpbmQuUXVpY2tGaXguY29udGFpbnMobmV3IEhpZXJhcmNoaWNhbEtpbmQoYWN0aW9uLmFjdGlvbi5raW5kKSkgJiZcblx0XHRcdFx0XHRcdFx0XHQhYWN0aW9uLmFjdGlvbi5pc0FJO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRjb25zdCBhbGxNYXJrZXJzID0gdGhpcy5fbWFya2VyU2VydmljZS5yZWFkKHsgcmVzb3VyY2U6IG1vZGVsLnVyaSB9KTtcblx0XHRcdFx0XHRcdGlmIChmb3VuZFF1aWNrZml4KSB7XG5cdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGNvZGVBY3Rpb25TZXQudmFsaWRBY3Rpb25zKSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGFjdGlvbi5hY3Rpb24uY29tbWFuZD8uYXJndW1lbnRzPy5zb21lKGFyZyA9PiB0eXBlb2YgYXJnID09PSAnc3RyaW5nJyAmJiBhcmcuaW5jbHVkZXMoQVBQTFlfRklYX0FMTF9DT01NQU5EX0lEKSkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGFjdGlvbi5hY3Rpb24uZGlhZ25vc3RpY3MgPSBbLi4uYWxsTWFya2Vycy5maWx0ZXIobWFya2VyID0+IG1hcmtlci5yZWxhdGVkSW5mb3JtYXRpb24pXTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgdmFsaWRBY3Rpb25zOiBjb2RlQWN0aW9uU2V0LnZhbGlkQWN0aW9ucywgYWxsQWN0aW9uczogYWxsQ29kZUFjdGlvbnMsIGRvY3VtZW50YXRpb246IGNvZGVBY3Rpb25TZXQuZG9jdW1lbnRhdGlvbiwgaGFzQXV0b0ZpeDogY29kZUFjdGlvblNldC5oYXNBdXRvRml4LCBoYXNBSUZpeDogY29kZUFjdGlvblNldC5oYXNBSUZpeCwgYWxsQUlGaXhlczogY29kZUFjdGlvblNldC5hbGxBSUZpeGVzLCBkaXNwb3NlOiAoKSA9PiB7IHRoaXMuY29kZUFjdGlvbnNEaXNwb3NhYmxlLnZhbHVlID0gY29kZUFjdGlvblNldDsgfSB9O1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmICghZm91bmRRdWlja2ZpeCkge1xuXHRcdFx0XHRcdFx0XHQvLyBJZiBtYXJrZXJzIGV4aXN0LCBhbmQgdGhlcmUgYXJlIG5vIHF1aWNrZml4ZXMgZm91bmQgb3IgbGVuZ3RoIGlzIHplcm8sIGNoZWNrIGZvciBxdWlja2ZpeGVzIG9uIHRoYXQgbGluZS5cblx0XHRcdFx0XHRcdFx0aWYgKGFsbE1hcmtlcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGN1cnJQb3NpdGlvbiA9IHRyaWdnZXIuc2VsZWN0aW9uLmdldFBvc2l0aW9uKCk7XG5cdFx0XHRcdFx0XHRcdFx0bGV0IHRyYWNrZWRQb3NpdGlvbiA9IGN1cnJQb3NpdGlvbjtcblx0XHRcdFx0XHRcdFx0XHRsZXQgZGlzdGFuY2UgPSBOdW1iZXIuTUFYX1ZBTFVFO1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRBY3Rpb25zID0gWy4uLmNvZGVBY3Rpb25TZXQudmFsaWRBY3Rpb25zXTtcblxuXHRcdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgbWFya2VyIG9mIGFsbE1hcmtlcnMpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IGNvbCA9IG1hcmtlci5lbmRDb2x1bW47XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCByb3cgPSBtYXJrZXIuZW5kTGluZU51bWJlcjtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHN0YXJ0Um93ID0gbWFya2VyLnN0YXJ0TGluZU51bWJlcjtcblxuXHRcdFx0XHRcdFx0XHRcdFx0Ly8gRm91bmQgcXVpY2tmaXggb24gdGhlIHNhbWUgbGluZSBhbmQgY2hlY2sgcmVsYXRpdmUgZGlzdGFuY2UgdG8gb3RoZXIgbWFya2Vyc1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKChyb3cgPT09IGN1cnJQb3NpdGlvbi5saW5lTnVtYmVyIHx8IHN0YXJ0Um93ID09PSBjdXJyUG9zaXRpb24ubGluZU51bWJlcikpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dHJhY2tlZFBvc2l0aW9uID0gbmV3IFBvc2l0aW9uKHJvdywgY29sKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgbmV3Q29kZUFjdGlvblRyaWdnZXI6IENvZGVBY3Rpb25UcmlnZ2VyID0ge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6IHRyaWdnZXIudHJpZ2dlci50eXBlLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHRyaWdnZXJBY3Rpb246IHRyaWdnZXIudHJpZ2dlci50cmlnZ2VyQWN0aW9uLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGZpbHRlcjogeyBpbmNsdWRlOiB0cmlnZ2VyLnRyaWdnZXIuZmlsdGVyPy5pbmNsdWRlID8gdHJpZ2dlci50cmlnZ2VyLmZpbHRlcj8uaW5jbHVkZSA6IENvZGVBY3Rpb25LaW5kLlF1aWNrRml4IH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0YXV0b0FwcGx5OiB0cmlnZ2VyLnRyaWdnZXIuYXV0b0FwcGx5LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnRleHQ6IHsgbm90QXZhaWxhYmxlTWVzc2FnZTogdHJpZ2dlci50cmlnZ2VyLmNvbnRleHQ/Lm5vdEF2YWlsYWJsZU1lc3NhZ2UgfHwgJycsIHBvc2l0aW9uOiB0cmFja2VkUG9zaXRpb24gfVxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHNlbGVjdGlvbkFzUG9zaXRpb24gPSBuZXcgU2VsZWN0aW9uKHRyYWNrZWRQb3NpdGlvbi5saW5lTnVtYmVyLCB0cmFja2VkUG9zaXRpb24uY29sdW1uLCB0cmFja2VkUG9zaXRpb24ubGluZU51bWJlciwgdHJhY2tlZFBvc2l0aW9uLmNvbHVtbik7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IGFjdGlvbnNBdE1hcmtlciA9IGF3YWl0IGdldENvZGVBY3Rpb25zKHRoaXMuX3JlZ2lzdHJ5LCBtb2RlbCwgc2VsZWN0aW9uQXNQb3NpdGlvbiwgbmV3Q29kZUFjdGlvblRyaWdnZXIsIFByb2dyZXNzLk5vbmUsIHRva2VuKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0YWN0aW9uc0F0TWFya2VyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gZW1wdHlDb2RlQWN0aW9uU2V0O1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKGFjdGlvbnNBdE1hcmtlci52YWxpZEFjdGlvbnMubGVuZ3RoICE9PSAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9uc0F0TWFya2VyLnZhbGlkQWN0aW9ucykge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKGFjdGlvbi5hY3Rpb24uY29tbWFuZD8uYXJndW1lbnRzPy5zb21lKGFyZyA9PiB0eXBlb2YgYXJnID09PSAnc3RyaW5nJyAmJiBhcmcuaW5jbHVkZXMoQVBQTFlfRklYX0FMTF9DT01NQU5EX0lEKSkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0YWN0aW9uLmFjdGlvbi5kaWFnbm9zdGljcyA9IFsuLi5hbGxNYXJrZXJzLmZpbHRlcihtYXJrZXIgPT4gbWFya2VyLnJlbGF0ZWRJbmZvcm1hdGlvbildO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGlmIChjb2RlQWN0aW9uU2V0LmFsbEFjdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRhbGxDb2RlQWN0aW9ucy5wdXNoKC4uLmFjdGlvbnNBdE1hcmtlci5hbGxBY3Rpb25zKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQvLyBBbHJlYWR5IGZpbHRlcmVkIHRocm91Z2ggdG8gb25seSBnZXQgcXVpY2tmaXhlcywgc28gbm8gbmVlZCB0byBmaWx0ZXIgYWdhaW4uXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKE1hdGguYWJzKGN1cnJQb3NpdGlvbi5jb2x1bW4gLSBjb2wpIDwgZGlzdGFuY2UpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGN1cnJlbnRBY3Rpb25zLnVuc2hpZnQoLi4uYWN0aW9uc0F0TWFya2VyLnZhbGlkQWN0aW9ucyk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGN1cnJlbnRBY3Rpb25zLnB1c2goLi4uYWN0aW9uc0F0TWFya2VyLnZhbGlkQWN0aW9ucyk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRpc3RhbmNlID0gTWF0aC5hYnMoY3VyclBvc2l0aW9uLmNvbHVtbiAtIGNvbCk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGZpbHRlcmVkQWN0aW9ucyA9IGN1cnJlbnRBY3Rpb25zLmZpbHRlcigoYWN0aW9uLCBpbmRleCwgc2VsZikgPT5cblx0XHRcdFx0XHRcdFx0XHRcdHNlbGYuZmluZEluZGV4KChhKSA9PiBhLmFjdGlvbi50aXRsZSA9PT0gYWN0aW9uLmFjdGlvbi50aXRsZSkgPT09IGluZGV4KTtcblxuXHRcdFx0XHRcdFx0XHRcdGZpbHRlcmVkQWN0aW9ucy5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoYS5hY3Rpb24uaXNQcmVmZXJyZWQgJiYgIWIuYWN0aW9uLmlzUHJlZmVycmVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoIWEuYWN0aW9uLmlzUHJlZmVycmVkICYmIGIuYWN0aW9uLmlzUHJlZmVycmVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0XHRcdFx0XHRcdFx0fSBlbHNlIGlmIChhLmFjdGlvbi5pc0FJICYmICFiLmFjdGlvbi5pc0FJKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0XHRcdFx0XHRcdFx0fSBlbHNlIGlmICghYS5hY3Rpb24uaXNBSSAmJiBiLmFjdGlvbi5pc0FJKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0XHRcdFx0Ly8gT25seSByZXRyaWdnZXJzIGlmIGFjdHVhbGx5IGZvdW5kIHF1aWNrZml4IG9uIHRoZSBzYW1lIGxpbmUgYXMgY3Vyc29yXG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgdmFsaWRBY3Rpb25zOiBmaWx0ZXJlZEFjdGlvbnMsIGFsbEFjdGlvbnM6IGFsbENvZGVBY3Rpb25zLCBkb2N1bWVudGF0aW9uOiBjb2RlQWN0aW9uU2V0LmRvY3VtZW50YXRpb24sIGhhc0F1dG9GaXg6IGNvZGVBY3Rpb25TZXQuaGFzQXV0b0ZpeCwgaGFzQUlGaXg6IGNvZGVBY3Rpb25TZXQuaGFzQUlGaXgsIGFsbEFJRml4ZXM6IGNvZGVBY3Rpb25TZXQuYWxsQUlGaXhlcywgZGlzcG9zZTogKCkgPT4geyB0aGlzLmNvZGVBY3Rpb25zRGlzcG9zYWJsZS52YWx1ZSA9IGNvZGVBY3Rpb25TZXQ7IH0gfTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIENhc2UgZm9yIG1hbnVhbCB0cmlnZ2VycyAtIHNwZWNpZmljYWxseSBTb3VyY2UgQWN0aW9ucyBhbmQgUmVmYWN0b3JzXG5cdFx0XHRcdFx0aWYgKHRyaWdnZXIudHJpZ2dlci50eXBlID09PSBDb2RlQWN0aW9uVHJpZ2dlclR5cGUuSW52b2tlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjb2RlQWN0aW9ucyA9IGF3YWl0IGdldENvZGVBY3Rpb25zKHRoaXMuX3JlZ2lzdHJ5LCBtb2RlbCwgdHJpZ2dlci5zZWxlY3Rpb24sIHRyaWdnZXIudHJpZ2dlciwgUHJvZ3Jlc3MuTm9uZSwgdG9rZW4pO1xuXHRcdFx0XHRcdFx0dGhpcy5jb2RlQWN0aW9uc0Rpc3Bvc2FibGUudmFsdWUgPSBjb2RlQWN0aW9ucztcblx0XHRcdFx0XHRcdHJldHVybiBjb2RlQWN0aW9ucztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBjb2RlQWN0aW9uU2V0ID0gYXdhaXQgZ2V0Q29kZUFjdGlvbnModGhpcy5fcmVnaXN0cnksIG1vZGVsLCB0cmlnZ2VyLnNlbGVjdGlvbiwgdHJpZ2dlci50cmlnZ2VyLCBQcm9ncmVzcy5Ob25lLCB0b2tlbik7XG5cdFx0XHRcdFx0dGhpcy5jb2RlQWN0aW9uc0Rpc3Bvc2FibGUudmFsdWUgPSBjb2RlQWN0aW9uU2V0O1xuXHRcdFx0XHRcdHJldHVybiBjb2RlQWN0aW9uU2V0O1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAodHJpZ2dlci50cmlnZ2VyLnR5cGUgPT09IENvZGVBY3Rpb25UcmlnZ2VyVHlwZS5JbnZva2UpIHtcblx0XHRcdFx0XHR0aGlzLl9wcm9ncmVzc1NlcnZpY2U/LnNob3dXaGlsZShhY3Rpb25zLCAyNTApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG5ld1N0YXRlID0gbmV3IENvZGVBY3Rpb25zU3RhdGUuVHJpZ2dlcmVkKHRyaWdnZXIudHJpZ2dlciwgc3RhcnRQb3NpdGlvbiwgYWN0aW9ucyk7XG5cdFx0XHRcdGxldCBpc01hbnVhbFRvQXV0b1RyYW5zaXRpb24gPSBmYWxzZTtcblx0XHRcdFx0aWYgKHRoaXMuX3N0YXRlLnR5cGUgPT09IENvZGVBY3Rpb25zU3RhdGUuVHlwZS5UcmlnZ2VyZWQpIHtcblx0XHRcdFx0XHQvLyBDaGVjayBpZiB0aGUgY3VycmVudCBzdGF0ZSBpcyBtYW51YWwgYW5kIHRoZSBuZXcgc3RhdGUgaXMgYXV0b21hdGljXG5cdFx0XHRcdFx0aXNNYW51YWxUb0F1dG9UcmFuc2l0aW9uID0gdGhpcy5fc3RhdGUudHJpZ2dlci50eXBlID09PSBDb2RlQWN0aW9uVHJpZ2dlclR5cGUuSW52b2tlICYmXG5cdFx0XHRcdFx0XHRuZXdTdGF0ZS50eXBlID09PSBDb2RlQWN0aW9uc1N0YXRlLlR5cGUuVHJpZ2dlcmVkICYmXG5cdFx0XHRcdFx0XHRuZXdTdGF0ZS50cmlnZ2VyLnR5cGUgPT09IENvZGVBY3Rpb25UcmlnZ2VyVHlwZS5BdXRvICYmXG5cdFx0XHRcdFx0XHR0aGlzLl9zdGF0ZS5wb3NpdGlvbiAhPT0gbmV3U3RhdGUucG9zaXRpb247XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBEbyBub3QgdHJpZ2dlciBzdGF0ZSBpZiBjdXJyZW50IHN0YXRlIGlzIG1hbnVhbCBhbmQgaW5jb21pbmcgc3RhdGUgaXMgYXV0b21hdGljXG5cdFx0XHRcdGlmICghaXNNYW51YWxUb0F1dG9UcmFuc2l0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRTdGF0ZShuZXdTdGF0ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gUmVzZXQgdGhlIG5ldyBzdGF0ZSBhZnRlciBnZXR0aW5nIGNvZGUgYWN0aW9ucyBiYWNrLlxuXHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5zZXRTdGF0ZShuZXdTdGF0ZSk7XG5cdFx0XHRcdFx0fSwgNTAwKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgdW5kZWZpbmVkKTtcblx0XHRcdG9yYWNsZS5pZ25vcmVMaWdodGJ1bGJPZmYgPSB0aGlzLl9pZ25vcmVMaWdodGJ1bGJPZmY7XG5cdFx0XHR0aGlzLl9jb2RlQWN0aW9uT3JhY2xlLnZhbHVlID0gb3JhY2xlO1xuXHRcdFx0dGhpcy5fY29kZUFjdGlvbk9yYWNsZS52YWx1ZS50cmlnZ2VyKHsgdHlwZTogQ29kZUFjdGlvblRyaWdnZXJUeXBlLkF1dG8sIHRyaWdnZXJBY3Rpb246IENvZGVBY3Rpb25UcmlnZ2VyU291cmNlLkRlZmF1bHQgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3N1cHBvcnRlZENvZGVBY3Rpb25zLnJlc2V0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHRyaWdnZXIodHJpZ2dlcjogQ29kZUFjdGlvblRyaWdnZXIpIHtcblx0XHR0aGlzLl9jb2RlQWN0aW9uT3JhY2xlLnZhbHVlPy50cmlnZ2VyKHRyaWdnZXIpO1xuXHRcdHRoaXMuY29kZUFjdGlvbnNEaXNwb3NhYmxlLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIHNldFN0YXRlKG5ld1N0YXRlOiBDb2RlQWN0aW9uc1N0YXRlLlN0YXRlLCBza2lwTm90aWZ5PzogYm9vbGVhbikge1xuXHRcdGlmIChuZXdTdGF0ZSA9PT0gdGhpcy5fc3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDYW5jZWwgb2xkIHJlcXVlc3Rcblx0XHRpZiAodGhpcy5fc3RhdGUudHlwZSA9PT0gQ29kZUFjdGlvbnNTdGF0ZS5UeXBlLlRyaWdnZXJlZCkge1xuXHRcdFx0dGhpcy5fc3RhdGUuY2FuY2VsKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RhdGUgPSBuZXdTdGF0ZTtcblxuXHRcdGlmICghc2tpcE5vdGlmeSAmJiAhdGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZmlyZShuZXdTdGF0ZSk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUE0Qix5QkFBeUIsb0JBQW9CO0FBQ3pFLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFlBQXlCLHlCQUF5QjtBQUMzRCxTQUFTLGVBQWU7QUFHeEIsU0FBMEMscUJBQXFCO0FBRS9ELFNBQWlDLGdCQUFnQjtBQUVqRCxTQUFTLGNBQWMsNkJBQTZCO0FBQ3BELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBRTFCLFNBQTZCLDZCQUE2QjtBQUMxRCxTQUFTLGdCQUFrRCwrQkFBK0I7QUFDMUYsU0FBUyxzQkFBc0I7QUFFeEIsTUFBTSx5QkFBeUIsSUFBSSxjQUFzQix1QkFBdUIsRUFBRTtBQUVsRixNQUFNLDJCQUEyQjtBQU94QyxNQUFNLHlCQUF5QixXQUFXO0FBQUEsRUFNekMsWUFDa0IsU0FDQSxnQkFDQSxlQUNBLFNBQWlCLEtBQ2pDO0FBQ0QsVUFBTTtBQUxXO0FB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
