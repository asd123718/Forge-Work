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
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, debouncedObservable, derived, ObservablePromise, observableValue } from "../../../../base/common/observable.js";
import { basename } from "../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Range } from "../../../../editor/common/core/range.js";
import { localize } from "../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IChatWidgetService } from "../../chat/browser/chat.js";
import { IChatContextPickService } from "../../chat/browser/attachments/chatContextPickService.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { IDebugService, State } from "../common/debug.js";
import { Variable } from "../common/debugModel.js";
var PickerMode = /* @__PURE__ */ ((PickerMode2) => {
  PickerMode2["Main"] = "main";
  PickerMode2["Expression"] = "expression";
  return PickerMode2;
})(PickerMode || {});
let DebugSessionContextPick = class {
  constructor(debugService) {
    this.debugService = debugService;
    this.type = "pickerPick";
    this.label = localize("chatContext.debugSession", "Debug Session...");
    this.icon = Codicon.debug;
    this.ordinal = -200;
  }
  isEnabled() {
    const viewModel = this.debugService.getViewModel();
    const focusedSession = viewModel.focusedSession;
    return !!focusedSession && focusedSession.state === State.Stopped;
  }
  asPicker(_widget) {
    const store = new DisposableStore();
    const mode = observableValue("debugPicker.mode", "main" /* Main */);
    const query = observableValue("debugPicker.query", "");
    const picksObservable = this.createPicksObservable(mode, query, store);
    return {
      placeholder: localize("selectDebugData", "Select debug data to attach"),
      picks: (_queryObs, token) => {
        store.add(autorun((reader) => {
          query.set(_queryObs.read(reader), void 0);
        }));
        const cts = new CancellationTokenSource(token);
        store.add(toDisposable(() => cts.dispose(true)));
        return picksObservable;
      },
      goBack: () => {
        if (mode.get() === "expression" /* Expression */) {
          mode.set("main" /* Main */, void 0);
          return true;
        }
        return false;
      },
      dispose: () => store.dispose()
    };
  }
  createPicksObservable(mode, query, store) {
    const debouncedQuery = debouncedObservable(query, 300);
    return derived((reader) => {
      const currentMode = mode.read(reader);
      if (currentMode === "expression" /* Expression */) {
        return this.getExpressionPicks(debouncedQuery, store);
      } else {
        return this.getMainPicks(mode);
      }
    }).flatten();
  }
  getMainPicks(mode) {
    const promise = derived((_reader) => {
      return new ObservablePromise(this.buildMainPicks(mode));
    });
    return promise.map((value, reader) => {
      const result = value.promiseResult.read(reader);
      return { picks: result?.data || [], busy: result === void 0 };
    });
  }
  async buildMainPicks(mode) {
    const picks = [];
    const viewModel = this.debugService.getViewModel();
    const stackFrame = viewModel.focusedStackFrame;
    const session = viewModel.focusedSession;
    if (!session || !stackFrame) {
      return picks;
    }
    picks.push({
      label: localize("expressionValue", "Expression Value..."),
      iconClass: ThemeIcon.asClassName(Codicon.symbolVariable),
      asAttachment: () => {
        mode.set("expression" /* Expression */, void 0);
        return "noop";
      }
    });
    const watches = this.debugService.getModel().getWatchExpressions();
    if (watches.length > 0) {
      picks.push({ type: "separator", label: localize("watchExpressions", "Watch Expressions") });
      for (const watch of watches) {
        picks.push({
          label: watch.name,
          description: watch.value,
          iconClass: ThemeIcon.asClassName(Codicon.eye),
          asAttachment: () => createDebugAttachments(stackFrame, createDebugVariableEntry(watch))
        });
      }
    }
    let scopes = [];
    try {
      scopes = await stackFrame.getScopes();
    } catch {
    }
    for (const scope of scopes) {
      if (scope.expensive && !scope.childrenHaveBeenLoaded) {
        continue;
      }
      picks.push({ type: "separator", label: scope.name });
      try {
        const variables = await scope.getChildren();
        if (variables.length > 1) {
          picks.push({
            label: localize("allVariablesInScope", "All variables in {0}", scope.name),
            iconClass: ThemeIcon.asClassName(Codicon.symbolNamespace),
            asAttachment: () => createDebugAttachments(stackFrame, createScopeEntry(scope, variables))
          });
        }
        for (const variable of variables) {
          picks.push({
            label: variable.name,
            description: formatVariableDescription(variable),
            iconClass: ThemeIcon.asClassName(Codicon.symbolVariable),
            asAttachment: () => createDebugAttachments(stackFrame, createDebugVariableEntry(variable))
          });
        }
      } catch {
      }
    }
    return picks;
  }
  getExpressionPicks(query, _store) {
    const promise = derived((reader) => {
      const queryValue = query.read(reader);
      const cts = new CancellationTokenSource();
      reader.store.add(toDisposable(() => cts.dispose(true)));
      return new ObservablePromise(this.evaluateExpression(queryValue, cts.token));
    });
    return promise.map((value, r) => {
      const result = value.promiseResult.read(r);
      return { picks: result?.data || [], busy: result === void 0 };
    });
  }
  async evaluateExpression(expression, token) {
    if (!expression.trim()) {
      return [{
        label: localize("typeExpression", "Type an expression to evaluate..."),
        disabled: true,
        asAttachment: () => "noop"
      }];
    }
    const viewModel = this.debugService.getViewModel();
    const session = viewModel.focusedSession;
    const stackFrame = viewModel.focusedStackFrame;
    if (!session || !stackFrame) {
      return [{
        label: localize("noDebugSession", "No active debug session"),
        disabled: true,
        asAttachment: () => "noop"
      }];
    }
    try {
      const response = await session.evaluate(expression, stackFrame.frameId, "watch");
      if (token.isCancellationRequested) {
        return [];
      }
      if (response?.body) {
        const resultValue = response.body.result;
        const resultType = response.body.type;
        return [{
          label: expression,
          description: formatExpressionResult(resultValue, resultType),
          iconClass: ThemeIcon.asClassName(Codicon.symbolVariable),
          asAttachment: () => createDebugAttachments(stackFrame, {
            kind: "debugVariable",
            id: `debug-expression:${expression}`,
            name: expression,
            fullName: expression,
            icon: Codicon.debug,
            value: resultValue,
            expression,
            type: resultType,
            modelDescription: formatModelDescription(expression, resultValue, resultType)
          })
        }];
      } else {
        return [{
          label: expression,
          description: localize("noResult", "No result"),
          disabled: true,
          asAttachment: () => "noop"
        }];
      }
    } catch (err) {
      return [{
        label: expression,
        description: err instanceof Error ? err.message : localize("evaluationError", "Evaluation error"),
        disabled: true,
        asAttachment: () => "noop"
      }];
    }
  }
};
DebugSessionContextPick = __decorateClass([
  __decorateParam(0, IDebugService)
], DebugSessionContextPick);
function createDebugVariableEntry(expression) {
  return {
    kind: "debugVariable",
    id: `debug-variable:${expression.getId()}`,
    name: expression.name,
    fullName: expression.name,
    icon: Codicon.debug,
    value: expression.value,
    expression: expression.name,
    type: expression.type,
    modelDescription: formatModelDescription(expression.name, expression.value, expression.type)
  };
}
function createPausedLocationEntry(stackFrame) {
  const uri = stackFrame.source.uri;
  let range = Range.lift(stackFrame.range);
  if (range.isEmpty()) {
    range = range.setEndPosition(range.startLineNumber + 1, 1);
  }
  return {
    kind: "file",
    value: { uri, range },
    id: `debug-paused-location:${uri.toString()}:${range.startLineNumber}`,
    name: basename(uri),
    modelDescription: "The debugger is currently paused at this location"
  };
}
function createDebugAttachments(stackFrame, variableEntry) {
  return [
    createPausedLocationEntry(stackFrame),
    variableEntry
  ];
}
function createScopeEntry(scope, variables) {
  const variablesSummary = variables.map((v) => `${v.name}: ${v.value}`).join("\n");
  return {
    kind: "debugVariable",
    id: `debug-scope:${scope.name}`,
    name: `Scope: ${scope.name}`,
    fullName: `Scope: ${scope.name}`,
    icon: Codicon.debug,
    value: variablesSummary,
    expression: scope.name,
    type: "scope",
    modelDescription: `Debug scope "${scope.name}" with ${variables.length} variables:
${variablesSummary}`
  };
}
function formatVariableDescription(expression) {
  const value = expression.value;
  const type = expression.type;
  if (type && value) {
    return `${type}: ${value}`;
  }
  return value || type || "";
}
function formatExpressionResult(value, type) {
  if (type && value) {
    return `${type}: ${value}`;
  }
  return value || type || "";
}
function formatModelDescription(name, value, type) {
  let description = `Debug variable "${name}"`;
  if (type) {
    description += ` of type ${type}`;
  }
  description += ` with value: ${value}`;
  return description;
}
let DebugChatContextContribution = class extends Disposable {
  constructor(contextPickService, instantiationService) {
    super();
    this._register(contextPickService.registerChatContextItem(instantiationService.createInstance(DebugSessionContextPick)));
  }
};
DebugChatContextContribution.ID = "workbench.contrib.chat.debugChatContextContribution";
DebugChatContextContribution = __decorateClass([
  __decorateParam(0, IChatContextPickService),
  __decorateParam(1, IInstantiationService)
], DebugChatContextContribution);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.debug.action.addVariableToChat",
      title: localize("addToChat", "Add to Chat"),
      f1: false,
      menu: {
        id: MenuId.DebugVariablesContext,
        group: "z_commands",
        order: 110,
        when: ChatContextKeys.enabled
      }
    });
  }
  async run(accessor, context) {
    const chatWidgetService = accessor.get(IChatWidgetService);
    const debugService = accessor.get(IDebugService);
    const widget = await chatWidgetService.revealWidget();
    if (!widget) {
      return;
    }
    const entry = createDebugVariableEntryFromContext(context);
    if (entry) {
      const stackFrame = debugService.getViewModel().focusedStackFrame;
      if (stackFrame) {
        widget.attachmentModel.addContext(createPausedLocationEntry(stackFrame));
      }
      widget.attachmentModel.addContext(entry);
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.debug.action.addWatchExpressionToChat",
      title: localize("addToChat", "Add to Chat"),
      f1: false,
      menu: {
        id: MenuId.DebugWatchContext,
        group: "z_commands",
        order: 110,
        when: ChatContextKeys.enabled
      }
    });
  }
  async run(accessor, context) {
    const chatWidgetService = accessor.get(IChatWidgetService);
    const debugService = accessor.get(IDebugService);
    const widget = await chatWidgetService.revealWidget();
    if (!context || !widget) {
      return;
    }
    const stackFrame = debugService.getViewModel().focusedStackFrame;
    if (stackFrame) {
      widget.attachmentModel.addContext(createPausedLocationEntry(stackFrame));
    }
    widget.attachmentModel.addContext(createDebugVariableEntry(context));
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.debug.action.addScopeToChat",
      title: localize("addToChat", "Add to Chat"),
      f1: false,
      menu: {
        id: MenuId.DebugScopesContext,
        group: "z_commands",
        order: 1,
        when: ChatContextKeys.enabled
      }
    });
  }
  async run(accessor, context) {
    const chatWidgetService = accessor.get(IChatWidgetService);
    const debugService = accessor.get(IDebugService);
    const widget = await chatWidgetService.revealWidget();
    if (!context || !widget) {
      return;
    }
    const viewModel = debugService.getViewModel();
    const stackFrame = viewModel.focusedStackFrame;
    if (!stackFrame) {
      return;
    }
    try {
      const scopes = await stackFrame.getScopes();
      const scope = scopes.find((s) => s.name === context.scope.name);
      if (scope) {
        const variables = await scope.getChildren();
        widget.attachmentModel.addContext(createPausedLocationEntry(stackFrame));
        widget.attachmentModel.addContext(createScopeEntry(scope, variables));
      }
    } catch {
    }
  }
});
function isVariablesContext(context) {
  return typeof context === "object" && context !== null && "variable" in context && "sessionId" in context;
}
function createDebugVariableEntryFromContext(context) {
  if (context instanceof Variable) {
    return createDebugVariableEntry(context);
  }
  if (isVariablesContext(context)) {
    const variable = context.variable;
    return {
      kind: "debugVariable",
      id: `debug-variable:${variable.name}`,
      name: variable.name,
      fullName: variable.evaluateName ?? variable.name,
      icon: Codicon.debug,
      value: variable.value,
      expression: variable.evaluateName ?? variable.name,
      type: variable.type,
      modelDescription: formatModelDescription(variable.evaluateName || variable.name, variable.value, variable.type)
    };
  }
  return void 0;
}
export {
  DebugChatContextContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxkZWJ1Z0NoYXRJbnRlZ3JhdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVib3VuY2VkT2JzZXJ2YWJsZSwgZGVyaXZlZCwgSU9ic2VydmFibGUsIElTZXR0YWJsZU9ic2VydmFibGUsIE9ic2VydmFibGVQcm9taXNlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0UGljaywgSUNoYXRDb250ZXh0UGlja2VyLCBJQ2hhdENvbnRleHRQaWNrZXJJdGVtLCBJQ2hhdENvbnRleHRQaWNrU2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0Q29udGV4dFBpY2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdEZpbGVFbnRyeSwgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSwgSURlYnVnVmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgSURlYnVnU2VydmljZSwgSUV4cHJlc3Npb24sIElTY29wZSwgSVN0YWNrRnJhbWUsIFN0YXRlIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IFZhcmlhYmxlIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnTW9kZWwuanMnO1xuXG5jb25zdCBlbnVtIFBpY2tlck1vZGUge1xuXHRNYWluID0gJ21haW4nLFxuXHRFeHByZXNzaW9uID0gJ2V4cHJlc3Npb24nLFxufVxuXG5jbGFzcyBEZWJ1Z1Nlc3Npb25Db250ZXh0UGljayBpbXBsZW1lbnRzIElDaGF0Q29udGV4dFBpY2tlckl0ZW0ge1xuXHRyZWFkb25seSB0eXBlID0gJ3BpY2tlclBpY2snO1xuXHRyZWFkb25seSBsYWJlbCA9IGxvY2FsaXplKCdjaGF0Q29udGV4dC5kZWJ1Z1Nlc3Npb24nLCAnRGVidWcgU2Vzc2lvbi4uLicpO1xuXHRyZWFkb25seSBpY29uID0gQ29kaWNvbi5kZWJ1Zztcblx0cmVhZG9ubHkgb3JkaW5hbCA9IC0yMDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0aXNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdC8vIE9ubHkgZW5hYmxlZCB3aGVuIHRoZXJlJ3MgYSBmb2N1c2VkIHNlc3Npb24gdGhhdCBpcyBzdG9wcGVkIChwYXVzZWQpXG5cdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCk7XG5cdFx0Y29uc3QgZm9jdXNlZFNlc3Npb24gPSB2aWV3TW9kZWwuZm9jdXNlZFNlc3Npb247XG5cdFx0cmV0dXJuICEhZm9jdXNlZFNlc3Npb24gJiYgZm9jdXNlZFNlc3Npb24uc3RhdGUgPT09IFN0YXRlLlN0b3BwZWQ7XG5cdH1cblxuXHRhc1BpY2tlcihfd2lkZ2V0OiBJQ2hhdFdpZGdldCk6IElDaGF0Q29udGV4dFBpY2tlciB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbW9kZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxQaWNrZXJNb2RlPiA9IG9ic2VydmFibGVWYWx1ZSgnZGVidWdQaWNrZXIubW9kZScsIFBpY2tlck1vZGUuTWFpbik7XG5cdFx0Y29uc3QgcXVlcnk6IElTZXR0YWJsZU9ic2VydmFibGU8c3RyaW5nPiA9IG9ic2VydmFibGVWYWx1ZSgnZGVidWdQaWNrZXIucXVlcnknLCAnJyk7XG5cblx0XHRjb25zdCBwaWNrc09ic2VydmFibGUgPSB0aGlzLmNyZWF0ZVBpY2tzT2JzZXJ2YWJsZShtb2RlLCBxdWVyeSwgc3RvcmUpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnc2VsZWN0RGVidWdEYXRhJywgJ1NlbGVjdCBkZWJ1ZyBkYXRhIHRvIGF0dGFjaCcpLFxuXHRcdFx0cGlja3M6IChfcXVlcnlPYnM6IElPYnNlcnZhYmxlPHN0cmluZz4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHQvLyBDb25uZWN0IHRoZSBleHRlcm5hbCBxdWVyeSBvYnNlcnZhYmxlIHRvIG91ciBpbnRlcm5hbCBvbmVcblx0XHRcdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0XHRxdWVyeS5zZXQoX3F1ZXJ5T2JzLnJlYWQocmVhZGVyKSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSh0b2tlbik7XG5cdFx0XHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblxuXHRcdFx0XHRyZXR1cm4gcGlja3NPYnNlcnZhYmxlO1xuXHRcdFx0fSxcblx0XHRcdGdvQmFjazogKCkgPT4ge1xuXHRcdFx0XHRpZiAobW9kZS5nZXQoKSA9PT0gUGlja2VyTW9kZS5FeHByZXNzaW9uKSB7XG5cdFx0XHRcdFx0bW9kZS5zZXQoUGlja2VyTW9kZS5NYWluLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlOyAvLyBTdGF5IGluIHBpY2tlclxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmYWxzZTsgLy8gR28gYmFjayB0byBtYWluIGNvbnRleHQgbWVudVxuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHN0b3JlLmRpc3Bvc2UoKSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVQaWNrc09ic2VydmFibGUoXG5cdFx0bW9kZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxQaWNrZXJNb2RlPixcblx0XHRxdWVyeTogSU9ic2VydmFibGU8c3RyaW5nPixcblx0XHRzdG9yZTogRGlzcG9zYWJsZVN0b3JlXG5cdCk6IElPYnNlcnZhYmxlPHsgYnVzeTogYm9vbGVhbjsgcGlja3M6IENoYXRDb250ZXh0UGlja1tdIH0+IHtcblx0XHRjb25zdCBkZWJvdW5jZWRRdWVyeSA9IGRlYm91bmNlZE9ic2VydmFibGUocXVlcnksIDMwMCk7XG5cblx0XHRyZXR1cm4gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudE1vZGUgPSBtb2RlLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0aWYgKGN1cnJlbnRNb2RlID09PSBQaWNrZXJNb2RlLkV4cHJlc3Npb24pIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0RXhwcmVzc2lvblBpY2tzKGRlYm91bmNlZFF1ZXJ5LCBzdG9yZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRNYWluUGlja3MobW9kZSk7XG5cdFx0XHR9XG5cdFx0fSkuZmxhdHRlbigpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNYWluUGlja3MobW9kZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxQaWNrZXJNb2RlPik6IElPYnNlcnZhYmxlPHsgYnVzeTogYm9vbGVhbjsgcGlja3M6IENoYXRDb250ZXh0UGlja1tdIH0+IHtcblx0XHQvLyBSZXR1cm4gYW4gb2JzZXJ2YWJsZSB0aGF0IHJlc29sdmVzIHRvIHRoZSBtYWluIHBpY2tzXG5cdFx0Y29uc3QgcHJvbWlzZSA9IGRlcml2ZWQoX3JlYWRlciA9PiB7XG5cdFx0XHRyZXR1cm4gbmV3IE9ic2VydmFibGVQcm9taXNlKHRoaXMuYnVpbGRNYWluUGlja3MobW9kZSkpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHByb21pc2UubWFwKCh2YWx1ZSwgcmVhZGVyKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB2YWx1ZS5wcm9taXNlUmVzdWx0LnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiB7IHBpY2tzOiByZXN1bHQ/LmRhdGEgfHwgW10sIGJ1c3k6IHJlc3VsdCA9PT0gdW5kZWZpbmVkIH07XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGJ1aWxkTWFpblBpY2tzKG1vZGU6IElTZXR0YWJsZU9ic2VydmFibGU8UGlja2VyTW9kZT4pOiBQcm9taXNlPENoYXRDb250ZXh0UGlja1tdPiB7XG5cdFx0Y29uc3QgcGlja3M6IENoYXRDb250ZXh0UGlja1tdID0gW107XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCk7XG5cdFx0Y29uc3Qgc3RhY2tGcmFtZSA9IHZpZXdNb2RlbC5mb2N1c2VkU3RhY2tGcmFtZTtcblx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLmZvY3VzZWRTZXNzaW9uO1xuXG5cdFx0aWYgKCFzZXNzaW9uIHx8ICFzdGFja0ZyYW1lKSB7XG5cdFx0XHRyZXR1cm4gcGlja3M7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIFwiRXhwcmVzc2lvbiBWYWx1ZS4uLlwiIG9wdGlvbiBhdCB0aGUgdG9wXG5cdFx0cGlja3MucHVzaCh7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2V4cHJlc3Npb25WYWx1ZScsICdFeHByZXNzaW9uIFZhbHVlLi4uJyksXG5cdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnN5bWJvbFZhcmlhYmxlKSxcblx0XHRcdGFzQXR0YWNobWVudDogKCkgPT4ge1xuXHRcdFx0XHQvLyBTd2l0Y2ggdG8gZXhwcmVzc2lvbiBtb2RlXG5cdFx0XHRcdG1vZGUuc2V0KFBpY2tlck1vZGUuRXhwcmVzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0cmV0dXJuICdub29wJztcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHQvLyBBZGQgd2F0Y2ggZXhwcmVzc2lvbnMgc2VjdGlvblxuXHRcdGNvbnN0IHdhdGNoZXMgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldFdhdGNoRXhwcmVzc2lvbnMoKTtcblx0XHRpZiAod2F0Y2hlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRwaWNrcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnd2F0Y2hFeHByZXNzaW9ucycsICdXYXRjaCBFeHByZXNzaW9ucycpIH0pO1xuXHRcdFx0Zm9yIChjb25zdCB3YXRjaCBvZiB3YXRjaGVzKSB7XG5cdFx0XHRcdHBpY2tzLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiB3YXRjaC5uYW1lLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB3YXRjaC52YWx1ZSxcblx0XHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmV5ZSksXG5cdFx0XHRcdFx0YXNBdHRhY2htZW50OiAoKTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0+IGNyZWF0ZURlYnVnQXR0YWNobWVudHMoc3RhY2tGcmFtZSwgY3JlYXRlRGVidWdWYXJpYWJsZUVudHJ5KHdhdGNoKSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFkZCBzY29wZXMgYW5kIHRoZWlyIHZhcmlhYmxlc1xuXHRcdGxldCBzY29wZXM6IElTY29wZVtdID0gW107XG5cdFx0dHJ5IHtcblx0XHRcdHNjb3BlcyA9IGF3YWl0IHN0YWNrRnJhbWUuZ2V0U2NvcGVzKCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBJZ25vcmUgZXJyb3JzIHdoZW4gZmV0Y2hpbmcgc2NvcGVzXG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBzY29wZSBvZiBzY29wZXMpIHtcblx0XHRcdC8vIEluY2x1ZGUgdmFyaWFibGVzIGZyb20gbm9uLWV4cGVuc2l2ZSBzY29wZXNcblx0XHRcdGlmIChzY29wZS5leHBlbnNpdmUgJiYgIXNjb3BlLmNoaWxkcmVuSGF2ZUJlZW5Mb2FkZWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHBpY2tzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IHNjb3BlLm5hbWUgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB2YXJpYWJsZXMgPSBhd2FpdCBzY29wZS5nZXRDaGlsZHJlbigpO1xuXHRcdFx0XHRpZiAodmFyaWFibGVzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0XHRwaWNrcy5wdXNoKHtcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWxsVmFyaWFibGVzSW5TY29wZScsICdBbGwgdmFyaWFibGVzIGluIHswfScsIHNjb3BlLm5hbWUpLFxuXHRcdFx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5zeW1ib2xOYW1lc3BhY2UpLFxuXHRcdFx0XHRcdFx0YXNBdHRhY2htZW50OiAoKTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0+IGNyZWF0ZURlYnVnQXR0YWNobWVudHMoc3RhY2tGcmFtZSwgY3JlYXRlU2NvcGVFbnRyeShzY29wZSwgdmFyaWFibGVzKSksXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCB2YXJpYWJsZSBvZiB2YXJpYWJsZXMpIHtcblx0XHRcdFx0XHRwaWNrcy5wdXNoKHtcblx0XHRcdFx0XHRcdGxhYmVsOiB2YXJpYWJsZS5uYW1lLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGZvcm1hdFZhcmlhYmxlRGVzY3JpcHRpb24odmFyaWFibGUpLFxuXHRcdFx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5zeW1ib2xWYXJpYWJsZSksXG5cdFx0XHRcdFx0XHRhc0F0dGFjaG1lbnQ6ICgpOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPT4gY3JlYXRlRGVidWdBdHRhY2htZW50cyhzdGFja0ZyYW1lLCBjcmVhdGVEZWJ1Z1ZhcmlhYmxlRW50cnkodmFyaWFibGUpKSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIElnbm9yZSBlcnJvcnMgd2hlbiBmZXRjaGluZyB2YXJpYWJsZXNcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcGlja3M7XG5cdH1cblxuXHRwcml2YXRlIGdldEV4cHJlc3Npb25QaWNrcyhcblx0XHRxdWVyeTogSU9ic2VydmFibGU8c3RyaW5nPixcblx0XHRfc3RvcmU6IERpc3Bvc2FibGVTdG9yZVxuXHQpOiBJT2JzZXJ2YWJsZTx7IGJ1c3k6IGJvb2xlYW47IHBpY2tzOiBDaGF0Q29udGV4dFBpY2tbXSB9PiB7XG5cdFx0Y29uc3QgcHJvbWlzZSA9IGRlcml2ZWQoKHJlYWRlcikgPT4ge1xuXHRcdFx0Y29uc3QgcXVlcnlWYWx1ZSA9IHF1ZXJ5LnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0cmVhZGVyLnN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblx0XHRcdHJldHVybiBuZXcgT2JzZXJ2YWJsZVByb21pc2UodGhpcy5ldmFsdWF0ZUV4cHJlc3Npb24ocXVlcnlWYWx1ZSwgY3RzLnRva2VuKSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcHJvbWlzZS5tYXAoKHZhbHVlLCByKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB2YWx1ZS5wcm9taXNlUmVzdWx0LnJlYWQocik7XG5cdFx0XHRyZXR1cm4geyBwaWNrczogcmVzdWx0Py5kYXRhIHx8IFtdLCBidXN5OiByZXN1bHQgPT09IHVuZGVmaW5lZCB9O1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBldmFsdWF0ZUV4cHJlc3Npb24oZXhwcmVzc2lvbjogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPENoYXRDb250ZXh0UGlja1tdPiB7XG5cdFx0aWYgKCFleHByZXNzaW9uLnRyaW0oKSkge1xuXHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgndHlwZUV4cHJlc3Npb24nLCAnVHlwZSBhbiBleHByZXNzaW9uIHRvIGV2YWx1YXRlLi4uJyksXG5cdFx0XHRcdGRpc2FibGVkOiB0cnVlLFxuXHRcdFx0XHRhc0F0dGFjaG1lbnQ6ICgpID0+ICdub29wJyxcblx0XHRcdH1dO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSB2aWV3TW9kZWwuZm9jdXNlZFNlc3Npb247XG5cdFx0Y29uc3Qgc3RhY2tGcmFtZSA9IHZpZXdNb2RlbC5mb2N1c2VkU3RhY2tGcmFtZTtcblxuXHRcdGlmICghc2Vzc2lvbiB8fCAhc3RhY2tGcmFtZSkge1xuXHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbm9EZWJ1Z1Nlc3Npb24nLCAnTm8gYWN0aXZlIGRlYnVnIHNlc3Npb24nKSxcblx0XHRcdFx0ZGlzYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGFzQXR0YWNobWVudDogKCkgPT4gJ25vb3AnLFxuXHRcdFx0fV07XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgc2Vzc2lvbi5ldmFsdWF0ZShleHByZXNzaW9uLCBzdGFja0ZyYW1lLmZyYW1lSWQsICd3YXRjaCcpO1xuXG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVzcG9uc2U/LmJvZHkpIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0VmFsdWUgPSByZXNwb25zZS5ib2R5LnJlc3VsdDtcblx0XHRcdFx0Y29uc3QgcmVzdWx0VHlwZSA9IHJlc3BvbnNlLmJvZHkudHlwZTtcblx0XHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdFx0bGFiZWw6IGV4cHJlc3Npb24sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGZvcm1hdEV4cHJlc3Npb25SZXN1bHQocmVzdWx0VmFsdWUsIHJlc3VsdFR5cGUpLFxuXHRcdFx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uc3ltYm9sVmFyaWFibGUpLFxuXHRcdFx0XHRcdGFzQXR0YWNobWVudDogKCk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9PiBjcmVhdGVEZWJ1Z0F0dGFjaG1lbnRzKHN0YWNrRnJhbWUsIHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdkZWJ1Z1ZhcmlhYmxlJyxcblx0XHRcdFx0XHRcdGlkOiBgZGVidWctZXhwcmVzc2lvbjoke2V4cHJlc3Npb259YCxcblx0XHRcdFx0XHRcdG5hbWU6IGV4cHJlc3Npb24sXG5cdFx0XHRcdFx0XHRmdWxsTmFtZTogZXhwcmVzc2lvbixcblx0XHRcdFx0XHRcdGljb246IENvZGljb24uZGVidWcsXG5cdFx0XHRcdFx0XHR2YWx1ZTogcmVzdWx0VmFsdWUsXG5cdFx0XHRcdFx0XHRleHByZXNzaW9uOiBleHByZXNzaW9uLFxuXHRcdFx0XHRcdFx0dHlwZTogcmVzdWx0VHlwZSxcblx0XHRcdFx0XHRcdG1vZGVsRGVzY3JpcHRpb246IGZvcm1hdE1vZGVsRGVzY3JpcHRpb24oZXhwcmVzc2lvbiwgcmVzdWx0VmFsdWUsIHJlc3VsdFR5cGUpLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9XTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdGxhYmVsOiBleHByZXNzaW9uLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbm9SZXN1bHQnLCAnTm8gcmVzdWx0JyksXG5cdFx0XHRcdFx0ZGlzYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0YXNBdHRhY2htZW50OiAoKSA9PiAnbm9vcCcsXG5cdFx0XHRcdH1dO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdGxhYmVsOiBleHByZXNzaW9uLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IGxvY2FsaXplKCdldmFsdWF0aW9uRXJyb3InLCAnRXZhbHVhdGlvbiBlcnJvcicpLFxuXHRcdFx0XHRkaXNhYmxlZDogdHJ1ZSxcblx0XHRcdFx0YXNBdHRhY2htZW50OiAoKSA9PiAnbm9vcCcsXG5cdFx0XHR9XTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlRGVidWdWYXJpYWJsZUVudHJ5KGV4cHJlc3Npb246IElFeHByZXNzaW9uKTogSURlYnVnVmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ2RlYnVnVmFyaWFibGUnLFxuXHRcdGlkOiBgZGVidWctdmFyaWFibGU6JHtleHByZXNzaW9uLmdldElkKCl9YCxcblx0XHRuYW1lOiBleHByZXNzaW9uLm5hbWUsXG5cdFx0ZnVsbE5hbWU6IGV4cHJlc3Npb24ubmFtZSxcblx0XHRpY29uOiBDb2RpY29uLmRlYnVnLFxuXHRcdHZhbHVlOiBleHByZXNzaW9uLnZhbHVlLFxuXHRcdGV4cHJlc3Npb246IGV4cHJlc3Npb24ubmFtZSxcblx0XHR0eXBlOiBleHByZXNzaW9uLnR5cGUsXG5cdFx0bW9kZWxEZXNjcmlwdGlvbjogZm9ybWF0TW9kZWxEZXNjcmlwdGlvbihleHByZXNzaW9uLm5hbWUsIGV4cHJlc3Npb24udmFsdWUsIGV4cHJlc3Npb24udHlwZSksXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVBhdXNlZExvY2F0aW9uRW50cnkoc3RhY2tGcmFtZTogSVN0YWNrRnJhbWUpOiBJQ2hhdFJlcXVlc3RGaWxlRW50cnkge1xuXHRjb25zdCB1cmkgPSBzdGFja0ZyYW1lLnNvdXJjZS51cmk7XG5cdGxldCByYW5nZSA9IFJhbmdlLmxpZnQoc3RhY2tGcmFtZS5yYW5nZSk7XG5cdGlmIChyYW5nZS5pc0VtcHR5KCkpIHtcblx0XHRyYW5nZSA9IHJhbmdlLnNldEVuZFBvc2l0aW9uKHJhbmdlLnN0YXJ0TGluZU51bWJlciArIDEsIDEpO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRraW5kOiAnZmlsZScsXG5cdFx0dmFsdWU6IHsgdXJpLCByYW5nZSB9LFxuXHRcdGlkOiBgZGVidWctcGF1c2VkLWxvY2F0aW9uOiR7dXJpLnRvU3RyaW5nKCl9OiR7cmFuZ2Uuc3RhcnRMaW5lTnVtYmVyfWAsXG5cdFx0bmFtZTogYmFzZW5hbWUodXJpKSxcblx0XHRtb2RlbERlc2NyaXB0aW9uOiAnVGhlIGRlYnVnZ2VyIGlzIGN1cnJlbnRseSBwYXVzZWQgYXQgdGhpcyBsb2NhdGlvbicsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZURlYnVnQXR0YWNobWVudHMoc3RhY2tGcmFtZTogSVN0YWNrRnJhbWUsIHZhcmlhYmxlRW50cnk6IElEZWJ1Z1ZhcmlhYmxlRW50cnkpOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10ge1xuXHRyZXR1cm4gW1xuXHRcdGNyZWF0ZVBhdXNlZExvY2F0aW9uRW50cnkoc3RhY2tGcmFtZSksXG5cdFx0dmFyaWFibGVFbnRyeSxcblx0XTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlU2NvcGVFbnRyeShzY29wZTogSVNjb3BlLCB2YXJpYWJsZXM6IElFeHByZXNzaW9uW10pOiBJRGVidWdWYXJpYWJsZUVudHJ5IHtcblx0Y29uc3QgdmFyaWFibGVzU3VtbWFyeSA9IHZhcmlhYmxlcy5tYXAodiA9PiBgJHt2Lm5hbWV9OiAke3YudmFsdWV9YCkuam9pbignXFxuJyk7XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ2RlYnVnVmFyaWFibGUnLFxuXHRcdGlkOiBgZGVidWctc2NvcGU6JHtzY29wZS5uYW1lfWAsXG5cdFx0bmFtZTogYFNjb3BlOiAke3Njb3BlLm5hbWV9YCxcblx0XHRmdWxsTmFtZTogYFNjb3BlOiAke3Njb3BlLm5hbWV9YCxcblx0XHRpY29uOiBDb2RpY29uLmRlYnVnLFxuXHRcdHZhbHVlOiB2YXJpYWJsZXNTdW1tYXJ5LFxuXHRcdGV4cHJlc3Npb246IHNjb3BlLm5hbWUsXG5cdFx0dHlwZTogJ3Njb3BlJyxcblx0XHRtb2RlbERlc2NyaXB0aW9uOiBgRGVidWcgc2NvcGUgXCIke3Njb3BlLm5hbWV9XCIgd2l0aCAke3ZhcmlhYmxlcy5sZW5ndGh9IHZhcmlhYmxlczpcXG4ke3ZhcmlhYmxlc1N1bW1hcnl9YCxcblx0fTtcbn1cblxuZnVuY3Rpb24gZm9ybWF0VmFyaWFibGVEZXNjcmlwdGlvbihleHByZXNzaW9uOiBJRXhwcmVzc2lvbik6IHN0cmluZyB7XG5cdGNvbnN0IHZhbHVlID0gZXhwcmVzc2lvbi52YWx1ZTtcblx0Y29uc3QgdHlwZSA9IGV4cHJlc3Npb24udHlwZTtcblx0aWYgKHR5cGUgJiYgdmFsdWUpIHtcblx0XHRyZXR1cm4gYCR7dHlwZX06ICR7dmFsdWV9YDtcblx0fVxuXHRyZXR1cm4gdmFsdWUgfHwgdHlwZSB8fCAnJztcbn1cblxuZnVuY3Rpb24gZm9ybWF0RXhwcmVzc2lvblJlc3VsdCh2YWx1ZTogc3RyaW5nLCB0eXBlPzogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKHR5cGUgJiYgdmFsdWUpIHtcblx0XHRyZXR1cm4gYCR7dHlwZX06ICR7dmFsdWV9YDtcblx0fVxuXHRyZXR1cm4gdmFsdWUgfHwgdHlwZSB8fCAnJztcbn1cblxuZnVuY3Rpb24gZm9ybWF0TW9kZWxEZXNjcmlwdGlvbihuYW1lOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcsIHR5cGU/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRsZXQgZGVzY3JpcHRpb24gPSBgRGVidWcgdmFyaWFibGUgXCIke25hbWV9XCJgO1xuXHRpZiAodHlwZSkge1xuXHRcdGRlc2NyaXB0aW9uICs9IGAgb2YgdHlwZSAke3R5cGV9YDtcblx0fVxuXHRkZXNjcmlwdGlvbiArPSBgIHdpdGggdmFsdWU6ICR7dmFsdWV9YDtcblx0cmV0dXJuIGRlc2NyaXB0aW9uO1xufVxuXG5leHBvcnQgY2xhc3MgRGVidWdDaGF0Q29udGV4dENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmNoYXQuZGVidWdDaGF0Q29udGV4dENvbnRyaWJ1dGlvbic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0Q29udGV4dFBpY2tTZXJ2aWNlIGNvbnRleHRQaWNrU2VydmljZTogSUNoYXRDb250ZXh0UGlja1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbnRleHRQaWNrU2VydmljZS5yZWdpc3RlckNoYXRDb250ZXh0SXRlbShpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEZWJ1Z1Nlc3Npb25Db250ZXh0UGljaykpKTtcblx0fVxufVxuXG4vLyBDb250ZXh0IG1lbnUgYWN0aW9uOiBBZGQgdmFyaWFibGUgdG8gY2hhdFxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmRlYnVnLmFjdGlvbi5hZGRWYXJpYWJsZVRvQ2hhdCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2FkZFRvQ2hhdCcsICdBZGQgdG8gQ2hhdCcpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkRlYnVnVmFyaWFibGVzQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICd6X2NvbW1hbmRzJyxcblx0XHRcdFx0b3JkZXI6IDExMCxcblx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWRcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoYXRXaWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IGF3YWl0IGNoYXRXaWRnZXRTZXJ2aWNlLnJldmVhbFdpZGdldCgpO1xuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ29udGV4dCBpcyB0aGUgdmFyaWFibGUgZnJvbSB0aGUgdmFyaWFibGVzIHZpZXdcblx0XHRjb25zdCBlbnRyeSA9IGNyZWF0ZURlYnVnVmFyaWFibGVFbnRyeUZyb21Db250ZXh0KGNvbnRleHQpO1xuXHRcdGlmIChlbnRyeSkge1xuXHRcdFx0Y29uc3Qgc3RhY2tGcmFtZSA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU3RhY2tGcmFtZTtcblx0XHRcdGlmIChzdGFja0ZyYW1lKSB7XG5cdFx0XHRcdHdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkQ29udGV4dChjcmVhdGVQYXVzZWRMb2NhdGlvbkVudHJ5KHN0YWNrRnJhbWUpKTtcblx0XHRcdH1cblx0XHRcdHdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkQ29udGV4dChlbnRyeSk7XG5cdFx0fVxuXHR9XG59KTtcblxuLy8gQ29udGV4dCBtZW51IGFjdGlvbjogQWRkIHdhdGNoIGV4cHJlc3Npb24gdG8gY2hhdFxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmRlYnVnLmFjdGlvbi5hZGRXYXRjaEV4cHJlc3Npb25Ub0NoYXQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhZGRUb0NoYXQnLCAnQWRkIHRvIENoYXQnKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5EZWJ1Z1dhdGNoQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICd6X2NvbW1hbmRzJyxcblx0XHRcdFx0b3JkZXI6IDExMCxcblx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWRcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSUV4cHJlc3Npb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjaGF0V2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSBhd2FpdCBjaGF0V2lkZ2V0U2VydmljZS5yZXZlYWxXaWRnZXQoKTtcblx0XHRpZiAoIWNvbnRleHQgfHwgIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENvbnRleHQgaXMgdGhlIGV4cHJlc3Npb24gKHdhdGNoIGV4cHJlc3Npb24gb3IgdmFyaWFibGUgdW5kZXIgaXQpXG5cdFx0Y29uc3Qgc3RhY2tGcmFtZSA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU3RhY2tGcmFtZTtcblx0XHRpZiAoc3RhY2tGcmFtZSkge1xuXHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0KGNyZWF0ZVBhdXNlZExvY2F0aW9uRW50cnkoc3RhY2tGcmFtZSkpO1xuXHRcdH1cblx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoY3JlYXRlRGVidWdWYXJpYWJsZUVudHJ5KGNvbnRleHQpKTtcblx0fVxufSk7XG5cbi8vIENvbnRleHQgbWVudSBhY3Rpb246IEFkZCBzY29wZSB0byBjaGF0XG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZGVidWcuYWN0aW9uLmFkZFNjb3BlVG9DaGF0Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWRkVG9DaGF0JywgJ0FkZCB0byBDaGF0JyksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRGVidWdTY29wZXNDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJ3pfY29tbWFuZHMnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWRcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSVNjb3Blc0NvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjaGF0V2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSBhd2FpdCBjaGF0V2lkZ2V0U2VydmljZS5yZXZlYWxXaWRnZXQoKTtcblx0XHRpZiAoIWNvbnRleHQgfHwgIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEdldCB0aGUgYWN0dWFsIHNjb3BlIGFuZCBpdHMgdmFyaWFibGVzXG5cdFx0Y29uc3Qgdmlld01vZGVsID0gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpO1xuXHRcdGNvbnN0IHN0YWNrRnJhbWUgPSB2aWV3TW9kZWwuZm9jdXNlZFN0YWNrRnJhbWU7XG5cdFx0aWYgKCFzdGFja0ZyYW1lKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNjb3BlcyA9IGF3YWl0IHN0YWNrRnJhbWUuZ2V0U2NvcGVzKCk7XG5cdFx0XHRjb25zdCBzY29wZSA9IHNjb3Blcy5maW5kKHMgPT4gcy5uYW1lID09PSBjb250ZXh0LnNjb3BlLm5hbWUpO1xuXHRcdFx0aWYgKHNjb3BlKSB7XG5cdFx0XHRcdGNvbnN0IHZhcmlhYmxlcyA9IGF3YWl0IHNjb3BlLmdldENoaWxkcmVuKCk7XG5cdFx0XHRcdHdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkQ29udGV4dChjcmVhdGVQYXVzZWRMb2NhdGlvbkVudHJ5KHN0YWNrRnJhbWUpKTtcblx0XHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0KGNyZWF0ZVNjb3BlRW50cnkoc2NvcGUsIHZhcmlhYmxlcykpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gSWdub3JlIGVycm9yc1xuXHRcdH1cblx0fVxufSk7XG5cbmludGVyZmFjZSBJU2NvcGVzQ29udGV4dCB7XG5cdHNjb3BlOiB7IG5hbWU6IHN0cmluZyB9O1xufVxuXG5pbnRlcmZhY2UgSVZhcmlhYmxlc0NvbnRleHQge1xuXHRzZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0dmFyaWFibGU6IHsgbmFtZTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nOyB0eXBlPzogc3RyaW5nOyBldmFsdWF0ZU5hbWU/OiBzdHJpbmcgfTtcbn1cblxuZnVuY3Rpb24gaXNWYXJpYWJsZXNDb250ZXh0KGNvbnRleHQ6IHVua25vd24pOiBjb250ZXh0IGlzIElWYXJpYWJsZXNDb250ZXh0IHtcblx0cmV0dXJuIHR5cGVvZiBjb250ZXh0ID09PSAnb2JqZWN0JyAmJiBjb250ZXh0ICE9PSBudWxsICYmICd2YXJpYWJsZScgaW4gY29udGV4dCAmJiAnc2Vzc2lvbklkJyBpbiBjb250ZXh0O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVEZWJ1Z1ZhcmlhYmxlRW50cnlGcm9tQ29udGV4dChjb250ZXh0OiB1bmtub3duKTogSURlYnVnVmFyaWFibGVFbnRyeSB8IHVuZGVmaW5lZCB7XG5cdC8vIFRoZSBjb250ZXh0IGNhbiBiZSBlaXRoZXIgYSBWYXJpYWJsZSBkaXJlY3RseSwgb3IgYW4gSVZhcmlhYmxlc0NvbnRleHQgb2JqZWN0XG5cdGlmIChjb250ZXh0IGluc3RhbmNlb2YgVmFyaWFibGUpIHtcblx0XHRyZXR1cm4gY3JlYXRlRGVidWdWYXJpYWJsZUVudHJ5KGNvbnRleHQpO1xuXHR9XG5cblx0Ly8gSGFuZGxlIElWYXJpYWJsZXNDb250ZXh0IGZvcm1hdCBmcm9tIHRoZSB2YXJpYWJsZXMgdmlld1xuXHRpZiAoaXNWYXJpYWJsZXNDb250ZXh0KGNvbnRleHQpKSB7XG5cdFx0Y29uc3QgdmFyaWFibGUgPSBjb250ZXh0LnZhcmlhYmxlO1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnZGVidWdWYXJpYWJsZScsXG5cdFx0XHRpZDogYGRlYnVnLXZhcmlhYmxlOiR7dmFyaWFibGUubmFtZX1gLFxuXHRcdFx0bmFtZTogdmFyaWFibGUubmFtZSxcblx0XHRcdGZ1bGxOYW1lOiB2YXJpYWJsZS5ldmFsdWF0ZU5hbWUgPz8gdmFyaWFibGUubmFtZSxcblx0XHRcdGljb246IENvZGljb24uZGVidWcsXG5cdFx0XHR2YWx1ZTogdmFyaWFibGUudmFsdWUsXG5cdFx0XHRleHByZXNzaW9uOiB2YXJpYWJsZS5ldmFsdWF0ZU5hbWUgPz8gdmFyaWFibGUubmFtZSxcblx0XHRcdHR5cGU6IHZhcmlhYmxlLnR5cGUsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiBmb3JtYXRNb2RlbERlc2NyaXB0aW9uKHZhcmlhYmxlLmV2YWx1YXRlTmFtZSB8fCB2YXJpYWJsZS5uYW1lLCB2YXJpYWJsZS52YWx1ZSwgdmFyaWFibGUudHlwZSksXG5cdFx0fTtcblx0fVxuXG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGlCQUFpQixvQkFBb0I7QUFDMUQsU0FBUyxTQUFTLHFCQUFxQixTQUEyQyxtQkFBbUIsdUJBQXVCO0FBQzVILFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQsU0FBUyw2QkFBK0M7QUFFeEQsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQXNFLCtCQUErQjtBQUNyRyxTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLGVBQWlELGFBQWE7QUFDdkUsU0FBUyxnQkFBZ0I7QUFFekIsSUFBVyxhQUFYLGtCQUFXQSxnQkFBWDtBQUNDLEVBQUFBLFlBQUEsVUFBTztBQUNQLEVBQUFBLFlBQUEsZ0JBQWE7QUFGSCxTQUFBQTtBQUFBLEdBQUE7QUFLWCxJQUFNLDBCQUFOLE1BQWdFO0FBQUEsRUFNL0QsWUFDaUMsY0FDL0I7QUFEK0I7QUFOakMsU0FBUyxPQUFPO0FB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
