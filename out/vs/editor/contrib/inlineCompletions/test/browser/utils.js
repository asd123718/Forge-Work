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
import { timeout } from "../../../../../base/common/async.js";
import { BugIndicatingError } from "../../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { autorun, derived } from "../../../../../base/common/observable.js";
import { buildHistoryFromTasks, renderSwimlanes } from "../../../../../base/test/common/executionGraph.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { createTraceLogger } from "../../../../../base/test/common/virtualScheduling/index.js";
import { IAccessibilitySignalService } from "../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IDefaultAccountService } from "../../../../../platform/defaultAccount/common/defaultAccount.js";
import { SyncDescriptor } from "../../../../../platform/instantiation/common/descriptors.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { CoreEditingCommands, CoreNavigationCommands } from "../../../../browser/coreCommands.js";
import { IBulkEditService } from "../../../../browser/services/bulkEditService.js";
import { IRenameSymbolTrackerService, NullRenameSymbolTrackerService } from "../../../../browser/services/renameSymbolTrackerService.js";
import { TextEdit } from "../../../../common/core/edits/textEdit.js";
import { Range } from "../../../../common/core/range.js";
import { PositionOffsetTransformer } from "../../../../common/core/text/positionToOffset.js";
import { ILanguageFeaturesService } from "../../../../common/services/languageFeatures.js";
import { LanguageFeaturesService } from "../../../../common/services/languageFeaturesService.js";
import { IModelService } from "../../../../common/services/model.js";
import { ITextModelService } from "../../../../common/services/resolverService.js";
import { withAsyncTestCodeEditor } from "../../../../test/browser/testCodeEditor.js";
import { InlineCompletionsController } from "../../browser/controller/inlineCompletionsController.js";
import { InlineSuggestionsView } from "../../browser/view/inlineSuggestionsView.js";
class MockInlineCompletionsProvider {
  constructor(enableForwardStability = false) {
    this.enableForwardStability = enableForwardStability;
    this.returnValue = [];
    this.delayMs = 0;
    this.callHistory = new Array();
    this.calledTwiceIn50Ms = false;
    this._onDidChangeEmitter = new Emitter();
    this.onDidChangeInlineCompletions = this._onDidChangeEmitter.event;
    this.lastTimeMs = void 0;
  }
  setReturnValue(value, delayMs = 0) {
    this.returnValue = value ? [value] : [];
    this.delayMs = delayMs;
  }
  setReturnValues(values, delayMs = 0) {
    this.returnValue = values;
    this.delayMs = delayMs;
  }
  getAndClearCallHistory() {
    const history = [...this.callHistory];
    this.callHistory = [];
    return history;
  }
  assertNotCalledTwiceWithin50ms() {
    if (this.calledTwiceIn50Ms) {
      throw new Error("provideInlineCompletions has been called at least twice within 50ms. This should not happen.");
    }
  }
  /**
   * Fire an onDidChange event with an optional change hint.
   */
  fireOnDidChange(changeHint) {
    this._onDidChangeEmitter.fire(changeHint);
  }
  async provideInlineCompletions(model, position, context, token) {
    const currentTimeMs = (/* @__PURE__ */ new Date()).getTime();
    if (this.lastTimeMs && currentTimeMs - this.lastTimeMs < 50) {
      this.calledTwiceIn50Ms = true;
    }
    this.lastTimeMs = currentTimeMs;
    this.callHistory.push({
      position: position.toString(),
      triggerKind: context.triggerKind,
      text: model.getValue(),
      ...context.changeHint !== void 0 ? { changeHint: context.changeHint } : {}
    });
    const result = new Array();
    for (const v of this.returnValue) {
      const x = { ...v };
      if (!x.range) {
        x.range = model.getFullModelRange();
      }
      result.push(x);
    }
    if (this.delayMs > 0) {
      await timeout(this.delayMs);
    }
    return { items: result, enableForwardStability: this.enableForwardStability };
  }
  disposeInlineCompletions() {
  }
  handleItemDidShow() {
  }
}
class MockSearchReplaceCompletionsProvider {
  constructor() {
    this._map = /* @__PURE__ */ new Map();
  }
  add(search, replace) {
    this._map.set(search, replace);
  }
  async provideInlineCompletions(model, position, context, token) {
    const text = model.getValue();
    for (const [search, replace] of this._map) {
      const idx = text.indexOf(search);
      if (idx !== -1) {
        const range = Range.fromPositions(model.getPositionAt(idx), model.getPositionAt(idx + search.length));
        return {
          items: [
            { range, insertText: replace, isInlineEdit: true }
          ]
        };
      }
    }
    return { items: [] };
  }
  disposeInlineCompletions() {
  }
  handleItemDidShow() {
  }
}
class InlineEditContext extends Disposable {
  constructor(model, editor, _logger) {
    super();
    this.editor = editor;
    this._logger = _logger;
    this.prettyViewStates = new Array();
    const edit = derived((reader) => {
      const state = model.state.read(reader);
      return state ? new TextEdit(state.edits) : void 0;
    });
    this._register(autorun((reader) => {
      const e = edit.read(reader);
      let view;
      if (e) {
        view = e.toString(this.editor.getValue());
      } else {
        view = void 0;
      }
      this.prettyViewStates.push(view);
    }));
  }
  getAndClearViewStates() {
    const arr = [...this.prettyViewStates];
    this.prettyViewStates.length = 0;
    this._logger?.log(`getAndClearViewStates() => ${JSON.stringify(arr)}`);
    return arr;
  }
}
class GhostTextContext extends Disposable {
  constructor(model, editor, _logger) {
    super();
    this.editor = editor;
    this._logger = _logger;
    this.prettyViewStates = new Array();
    this._register(autorun((reader) => {
      const ghostText = model.primaryGhostText.read(reader);
      let view;
      if (ghostText) {
        view = ghostText.render(this.editor.getValue(), true);
      } else {
        view = this.editor.getValue();
      }
      if (this._currentPrettyViewState !== view) {
        this.prettyViewStates.push(view);
      }
      this._currentPrettyViewState = view;
    }));
  }
  get currentPrettyViewState() {
    return this._currentPrettyViewState;
  }
  getAndClearViewStates() {
    const arr = [...this.prettyViewStates];
    this.prettyViewStates.length = 0;
    this._logger?.log(`getAndClearViewStates() => ${JSON.stringify(arr)}`);
    return arr;
  }
  keyboardType(text) {
    this._logger?.log(`keyboardType(${JSON.stringify(text)})`);
    this.editor.trigger("keyboard", "type", { text });
  }
  cursorUp() {
    this.editor.runCommand(CoreNavigationCommands.CursorUp, null);
  }
  cursorRight() {
    this.editor.runCommand(CoreNavigationCommands.CursorRight, null);
  }
  cursorLeft() {
    this.editor.runCommand(CoreNavigationCommands.CursorLeft, null);
  }
  cursorDown() {
    this.editor.runCommand(CoreNavigationCommands.CursorDown, null);
  }
  cursorLineEnd() {
    this.editor.runCommand(CoreNavigationCommands.CursorLineEnd, null);
  }
  leftDelete() {
    this.editor.runCommand(CoreEditingCommands.DeleteLeft, null);
  }
}
async function withAsyncTestCodeEditorAndInlineCompletionsModel(text, options, callback) {
  const logs = [];
  const logger = createTraceLogger(logs);
  return await runWithFakedTimers({
    useFakeTimers: options.fakeClock,
    onHistory: options.logTimeTrace ? (history) => {
      const mode = options.fakeClock ? "virtual time" : "real time";
      const out = history.length === 0 && logs.length === 0 ? `[time trace ${mode}] (no events)` : `[time trace ${mode}] ${history.length} events, ${logs.length} log lines
${renderSwimlanes(buildHistoryFromTasks(history, history[0]?.time ?? 0, logs))}`;
      console.log(out);
    } : void 0
  }, async () => {
    const disposableStore = new DisposableStore();
    try {
      if (options.provider) {
        const languageFeaturesService = new LanguageFeaturesService();
        if (!options.serviceCollection) {
          options.serviceCollection = new ServiceCollection();
        }
        options.serviceCollection.set(ILanguageFeaturesService, languageFeaturesService);
        options.serviceCollection.set(IAccessibilitySignalService, {
          playSignal: async () => {
          },
          isSoundEnabled(signal) {
            return false;
          }
        });
        options.serviceCollection.set(IBulkEditService, {
          apply: async () => {
            throw new Error("IBulkEditService.apply not implemented");
          },
          hasPreviewHandler: () => {
            throw new Error("IBulkEditService.hasPreviewHandler not implemented");
          },
          setPreviewHandler: () => {
            throw new Error("IBulkEditService.setPreviewHandler not implemented");
          },
          _serviceBrand: void 0
        });
        options.serviceCollection.set(ITextModelService, new SyncDescriptor(MockTextModelService));
        options.serviceCollection.set(IDefaultAccountService, {
          _serviceBrand: void 0,
          onDidChangeDefaultAccount: Event.None,
          onDidChangePolicyData: Event.None,
          policyData: null,
          currentDefaultAccount: null,
          copilotTokenInfo: null,
          onDidChangeCopilotTokenInfo: Event.None,
          managedSettingsFetchStatus: null,
          managedSettingsFetchedAt: null,
          managedSettingsRawResponse: null,
          managedSettingsCompatibilityError: null,
          onDidChangeManagedSettingsCompatibilityError: Event.None,
          getDefaultAccount: async () => null,
          setDefaultAccountProvider: () => {
          },
          getDefaultAccountAuthenticationProvider: () => {
            return { id: "mockProvider", name: "Mock Provider", enterprise: false };
          },
          resolveGitHubUrl: (path) => `https://github.com/${path}`,
          refresh: async () => {
            return null;
          },
          signIn: async () => {
            return null;
          },
          signOut: async () => {
          }
        });
        options.serviceCollection.set(IRenameSymbolTrackerService, new NullRenameSymbolTrackerService());
        const d = languageFeaturesService.inlineCompletionsProvider.register({ pattern: "**" }, options.provider);
        disposableStore.add(d);
      }
      let result;
      await withAsyncTestCodeEditor(text, options, async (editor, editorViewModel, instantiationService) => {
        instantiationService.stubInstance(InlineSuggestionsView, {
          shouldShowHoverAtViewZone: () => false,
          dispose: () => {
          }
        });
        const controller = instantiationService.createInstance(InlineCompletionsController, editor);
        const model = controller.model.get();
        const context = new GhostTextContext(model, editor, logger);
        try {
          result = await callback({ editor, editorViewModel, model, context, store: disposableStore, logger, instantiationService });
        } finally {
          context.dispose();
          model.dispose();
          controller.dispose();
        }
      });
      if (options.provider instanceof MockInlineCompletionsProvider) {
        options.provider.assertNotCalledTwiceWithin50ms();
      }
      return result;
    } finally {
      disposableStore.dispose();
    }
  });
}
class AnnotatedString {
  constructor(src, annotations = ["\u2193"]) {
    const markers = findMarkers(src, annotations);
    this.value = markers.textWithoutMarkers;
    this.markers = markers.results;
  }
  getMarkerOffset(markerIdx = 0) {
    if (markerIdx >= this.markers.length) {
      throw new BugIndicatingError(`Marker index ${markerIdx} out of bounds`);
    }
    return this.markers[markerIdx].idx;
  }
}
function findMarkers(text, markers) {
  const results = [];
  let textWithoutMarkers = "";
  markers.sort((a, b) => b.length - a.length);
  let pos = 0;
  for (let i = 0; i < text.length; ) {
    let foundMarker = false;
    for (const marker of markers) {
      if (text.startsWith(marker, i)) {
        results.push({ mark: marker, idx: pos });
        i += marker.length;
        foundMarker = true;
        break;
      }
    }
    if (!foundMarker) {
      textWithoutMarkers += text[i];
      pos++;
      i++;
    }
  }
  return { results, textWithoutMarkers };
}
class AnnotatedText extends AnnotatedString {
  constructor() {
    super(...arguments);
    this._transformer = new PositionOffsetTransformer(this.value);
  }
  getMarkerPosition(markerIdx = 0) {
    return this._transformer.getPosition(this.getMarkerOffset(markerIdx));
  }
}
let MockTextModelService = class {
  constructor(_modelService) {
    this._modelService = _modelService;
  }
  async createModelReference(resource) {
    const model = this._modelService.getModel(resource);
    if (!model) {
      throw new Error(`MockTextModelService: Model not found for ${resource.toString()}`);
    }
    return {
      object: {
        textEditorModel: model,
        getLanguageId: () => model.getLanguageId(),
        isReadonly: () => false,
        isDisposed: () => model.isDisposed(),
        isResolved: () => true,
        onWillDispose: model.onWillDispose,
        resolve: async () => {
        },
        createSnapshot: () => model.createSnapshot(),
        dispose: () => {
        }
      },
      dispose: () => {
      }
    };
  }
  registerTextModelContentProvider() {
    throw new Error("MockTextModelService.registerTextModelContentProvider not implemented");
  }
  canHandleResource() {
    return false;
  }
};
MockTextModelService = __decorateClass([
  __decorateParam(0, IModelService)
], MockTextModelService);
export {
  AnnotatedString,
  AnnotatedText,
  GhostTextContext,
  InlineEditContext,
  MockInlineCompletionsProvider,
  MockSearchReplaceCompletionsProvider,
  withAsyncTestCodeEditorAndInlineCompletionsModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFx0ZXN0XFxicm93c2VyXFx1dGlscy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGJ1aWxkSGlzdG9yeUZyb21UYXNrcywgcmVuZGVyU3dpbWxhbmVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9leGVjdXRpb25HcmFwaC5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlVHJhY2VMb2dnZXIsIElUcmFjZUxvZ0VudHJ5LCBJVHJhY2VMb2dnZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3ZpcnR1YWxTY2hlZHVsaW5nL2luZGV4LmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGVmYXVsdEFjY291bnQvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBDb3JlRWRpdGluZ0NvbW1hbmRzLCBDb3JlTmF2aWdhdGlvbkNvbW1hbmRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9jb3JlQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUJ1bGtFZGl0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvc2VydmljZXMvYnVsa0VkaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZW5hbWVTeW1ib2xUcmFja2VyU2VydmljZSwgTnVsbFJlbmFtZVN5bWJvbFRyYWNrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9yZW5hbWVTeW1ib2xUcmFja2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRzL3RleHRFZGl0LmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbk9mZnNldFRyYW5zZm9ybWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvdGV4dC9wb3NpdGlvblRvT2Zmc2V0LmpzJztcbmltcG9ydCB7IElJbmxpbmVDb21wbGV0aW9uQ2hhbmdlSGludCwgSW5saW5lQ29tcGxldGlvbiwgSW5saW5lQ29tcGxldGlvbkNvbnRleHQsIElubGluZUNvbXBsZXRpb25zLCBJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IExhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkVGV4dEVkaXRvck1vZGVsLCBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC92aWV3TW9kZWxJbXBsLmpzJztcbmltcG9ydCB7IElUZXN0Q29kZUVkaXRvciwgVGVzdENvZGVFZGl0b3JJbnN0YW50aWF0aW9uT3B0aW9ucywgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvdGVzdENvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9jb250cm9sbGVyL2lubGluZUNvbXBsZXRpb25zQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uc01vZGVsIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tb2RlbC9pbmxpbmVDb21wbGV0aW9uc01vZGVsLmpzJztcbmltcG9ydCB7IElubGluZVN1Z2dlc3Rpb25zVmlldyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdmlldy9pbmxpbmVTdWdnZXN0aW9uc1ZpZXcuanMnO1xuXG5leHBvcnQgY2xhc3MgTW9ja0lubGluZUNvbXBsZXRpb25zUHJvdmlkZXIgaW1wbGVtZW50cyBJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyIHtcblx0cHJpdmF0ZSByZXR1cm5WYWx1ZTogSW5saW5lQ29tcGxldGlvbltdID0gW107XG5cdHByaXZhdGUgZGVsYXlNczogbnVtYmVyID0gMDtcblxuXHRwcml2YXRlIGNhbGxIaXN0b3J5ID0gbmV3IEFycmF5PHVua25vd24+KCk7XG5cdHByaXZhdGUgY2FsbGVkVHdpY2VJbjUwTXMgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxJSW5saW5lQ29tcGxldGlvbkNoYW5nZUhpbnQgfCB2b2lkPigpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VJbmxpbmVDb21wbGV0aW9uczogRXZlbnQ8SUlubGluZUNvbXBsZXRpb25DaGFuZ2VIaW50IHwgdm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUVtaXR0ZXIuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGVuYWJsZUZvcndhcmRTdGFiaWxpdHkgPSBmYWxzZSxcblx0KSB7IH1cblxuXHRwdWJsaWMgc2V0UmV0dXJuVmFsdWUodmFsdWU6IElubGluZUNvbXBsZXRpb24gfCB1bmRlZmluZWQsIGRlbGF5TXM6IG51bWJlciA9IDApOiB2b2lkIHtcblx0XHR0aGlzLnJldHVyblZhbHVlID0gdmFsdWUgPyBbdmFsdWVdIDogW107XG5cdFx0dGhpcy5kZWxheU1zID0gZGVsYXlNcztcblx0fVxuXG5cdHB1YmxpYyBzZXRSZXR1cm5WYWx1ZXModmFsdWVzOiBJbmxpbmVDb21wbGV0aW9uW10sIGRlbGF5TXM6IG51bWJlciA9IDApOiB2b2lkIHtcblx0XHR0aGlzLnJldHVyblZhbHVlID0gdmFsdWVzO1xuXHRcdHRoaXMuZGVsYXlNcyA9IGRlbGF5TXM7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QW5kQ2xlYXJDYWxsSGlzdG9yeSgpIHtcblx0XHRjb25zdCBoaXN0b3J5ID0gWy4uLnRoaXMuY2FsbEhpc3RvcnldO1xuXHRcdHRoaXMuY2FsbEhpc3RvcnkgPSBbXTtcblx0XHRyZXR1cm4gaGlzdG9yeTtcblx0fVxuXG5cdHB1YmxpYyBhc3NlcnROb3RDYWxsZWRUd2ljZVdpdGhpbjUwbXMoKSB7XG5cdFx0aWYgKHRoaXMuY2FsbGVkVHdpY2VJbjUwTXMpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcigncHJvdmlkZUlubGluZUNvbXBsZXRpb25zIGhhcyBiZWVuIGNhbGxlZCBhdCBsZWFzdCB0d2ljZSB3aXRoaW4gNTBtcy4gVGhpcyBzaG91bGQgbm90IGhhcHBlbi4nKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRmlyZSBhbiBvbkRpZENoYW5nZSBldmVudCB3aXRoIGFuIG9wdGlvbmFsIGNoYW5nZSBoaW50LlxuXHQgKi9cblx0cHVibGljIGZpcmVPbkRpZENoYW5nZShjaGFuZ2VIaW50PzogSUlubGluZUNvbXBsZXRpb25DaGFuZ2VIaW50KTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VFbWl0dGVyLmZpcmUoY2hhbmdlSGludCk7XG5cdH1cblxuXHRwcml2YXRlIGxhc3RUaW1lTXM6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRhc3luYyBwcm92aWRlSW5saW5lQ29tcGxldGlvbnMobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgY29udGV4dDogSW5saW5lQ29tcGxldGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SW5saW5lQ29tcGxldGlvbnM+IHtcblx0XHRjb25zdCBjdXJyZW50VGltZU1zID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5cdFx0aWYgKHRoaXMubGFzdFRpbWVNcyAmJiBjdXJyZW50VGltZU1zIC0gdGhpcy5sYXN0VGltZU1zIDwgNTApIHtcblx0XHRcdHRoaXMuY2FsbGVkVHdpY2VJbjUwTXMgPSB0cnVlO1xuXHRcdH1cblx0XHR0aGlzLmxhc3RUaW1lTXMgPSBjdXJyZW50VGltZU1zO1xuXG5cdFx0dGhpcy5jYWxsSGlzdG9yeS5wdXNoKHtcblx0XHRcdHBvc2l0aW9uOiBwb3NpdGlvbi50b1N0cmluZygpLFxuXHRcdFx0dHJpZ2dlcktpbmQ6IGNvbnRleHQudHJpZ2dlcktpbmQsXG5cdFx0XHR0ZXh0OiBtb2RlbC5nZXRWYWx1ZSgpLFxuXHRcdFx0Li4uKGNvbnRleHQuY2hhbmdlSGludCAhPT0gdW5kZWZpbmVkID8geyBjaGFuZ2VIaW50OiBjb250ZXh0LmNoYW5nZUhpbnQgfSA6IHt9KSxcblx0XHR9KTtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgQXJyYXk8SW5saW5lQ29tcGxldGlvbj4oKTtcblx0XHRmb3IgKGNvbnN0IHYgb2YgdGhpcy5yZXR1cm5WYWx1ZSkge1xuXHRcdFx0Y29uc3QgeCA9IHsgLi4udiB9O1xuXHRcdFx0aWYgKCF4LnJhbmdlKSB7XG5cdFx0XHRcdHgucmFuZ2UgPSBtb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2goeCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZGVsYXlNcyA+IDApIHtcblx0XHRcdGF3YWl0IHRpbWVvdXQodGhpcy5kZWxheU1zKTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBpdGVtczogcmVzdWx0LCBlbmFibGVGb3J3YXJkU3RhYmlsaXR5OiB0aGlzLmVuYWJsZUZvcndhcmRTdGFiaWxpdHkgfTtcblx0fVxuXHRkaXNwb3NlSW5saW5lQ29tcGxldGlvbnMoKSB7IH1cblx0aGFuZGxlSXRlbURpZFNob3coKSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vY2tTZWFyY2hSZXBsYWNlQ29tcGxldGlvbnNQcm92aWRlciBpbXBsZW1lbnRzIElubGluZUNvbXBsZXRpb25zUHJvdmlkZXIge1xuXHRwcml2YXRlIF9tYXAgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cdHB1YmxpYyBhZGQoc2VhcmNoOiBzdHJpbmcsIHJlcGxhY2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX21hcC5zZXQoc2VhcmNoLCByZXBsYWNlKTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVJbmxpbmVDb21wbGV0aW9ucyhtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCBjb250ZXh0OiBJbmxpbmVDb21wbGV0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJbmxpbmVDb21wbGV0aW9ucz4ge1xuXHRcdGNvbnN0IHRleHQgPSBtb2RlbC5nZXRWYWx1ZSgpO1xuXHRcdGZvciAoY29uc3QgW3NlYXJjaCwgcmVwbGFjZV0gb2YgdGhpcy5fbWFwKSB7XG5cdFx0XHRjb25zdCBpZHggPSB0ZXh0LmluZGV4T2Yoc2VhcmNoKTtcblx0XHRcdC8vIHJlcGxhY2UgaWR4Li4uaWR4K3RleHQubGVuZ3RoIHdpdGggcmVwbGFjZVxuXHRcdFx0aWYgKGlkeCAhPT0gLTEpIHtcblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBSYW5nZS5mcm9tUG9zaXRpb25zKG1vZGVsLmdldFBvc2l0aW9uQXQoaWR4KSwgbW9kZWwuZ2V0UG9zaXRpb25BdChpZHggKyBzZWFyY2gubGVuZ3RoKSk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0XHRcdHsgcmFuZ2UsIGluc2VydFRleHQ6IHJlcGxhY2UsIGlzSW5saW5lRWRpdDogdHJ1ZSB9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4geyBpdGVtczogW10gfTtcblx0fVxuXHRkaXNwb3NlSW5saW5lQ29tcGxldGlvbnMoKSB7IH1cblx0aGFuZGxlSXRlbURpZFNob3coKSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIElubGluZUVkaXRDb250ZXh0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHB1YmxpYyByZWFkb25seSBwcmV0dHlWaWV3U3RhdGVzID0gbmV3IEFycmF5PHN0cmluZyB8IHVuZGVmaW5lZD4oKTtcblxuXHRjb25zdHJ1Y3Rvcihtb2RlbDogSW5saW5lQ29tcGxldGlvbnNNb2RlbCwgcHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElUZXN0Q29kZUVkaXRvciwgcHJpdmF0ZSByZWFkb25seSBfbG9nZ2VyPzogSVRyYWNlTG9nZ2VyKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGVkaXQgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IG1vZGVsLnN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBzdGF0ZSA/IG5ldyBUZXh0RWRpdChzdGF0ZS5lZGl0cykgOiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIHVwZGF0ZSAqL1xuXHRcdFx0Y29uc3QgZSA9IGVkaXQucmVhZChyZWFkZXIpO1xuXHRcdFx0bGV0IHZpZXc6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKGUpIHtcblx0XHRcdFx0dmlldyA9IGUudG9TdHJpbmcodGhpcy5lZGl0b3IuZ2V0VmFsdWUoKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR2aWV3ID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnByZXR0eVZpZXdTdGF0ZXMucHVzaCh2aWV3KTtcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QW5kQ2xlYXJWaWV3U3RhdGVzKCk6IChzdHJpbmcgfCB1bmRlZmluZWQpW10ge1xuXHRcdGNvbnN0IGFyciA9IFsuLi50aGlzLnByZXR0eVZpZXdTdGF0ZXNdO1xuXHRcdHRoaXMucHJldHR5Vmlld1N0YXRlcy5sZW5ndGggPSAwO1xuXHRcdHRoaXMuX2xvZ2dlcj8ubG9nKGBnZXRBbmRDbGVhclZpZXdTdGF0ZXMoKSA9PiAke0pTT04uc3RyaW5naWZ5KGFycil9YCk7XG5cdFx0cmV0dXJuIGFycjtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgR2hvc3RUZXh0Q29udGV4dCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwdWJsaWMgcmVhZG9ubHkgcHJldHR5Vmlld1N0YXRlcyA9IG5ldyBBcnJheTxzdHJpbmcgfCB1bmRlZmluZWQ+KCk7XG5cdHByaXZhdGUgX2N1cnJlbnRQcmV0dHlWaWV3U3RhdGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHVibGljIGdldCBjdXJyZW50UHJldHR5Vmlld1N0YXRlKCkge1xuXHRcdHJldHVybiB0aGlzLl9jdXJyZW50UHJldHR5Vmlld1N0YXRlO1xuXHR9XG5cblx0Y29uc3RydWN0b3IobW9kZWw6IElubGluZUNvbXBsZXRpb25zTW9kZWwsIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yOiBJVGVzdENvZGVFZGl0b3IsIHByaXZhdGUgcmVhZG9ubHkgX2xvZ2dlcj86IElUcmFjZUxvZ2dlcikge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIHVwZGF0ZSAqL1xuXHRcdFx0Y29uc3QgZ2hvc3RUZXh0ID0gbW9kZWwucHJpbWFyeUdob3N0VGV4dC5yZWFkKHJlYWRlcik7XG5cdFx0XHRsZXQgdmlldzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGdob3N0VGV4dCkge1xuXHRcdFx0XHR2aWV3ID0gZ2hvc3RUZXh0LnJlbmRlcih0aGlzLmVkaXRvci5nZXRWYWx1ZSgpLCB0cnVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZpZXcgPSB0aGlzLmVkaXRvci5nZXRWYWx1ZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fY3VycmVudFByZXR0eVZpZXdTdGF0ZSAhPT0gdmlldykge1xuXHRcdFx0XHR0aGlzLnByZXR0eVZpZXdTdGF0ZXMucHVzaCh2aWV3KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2N1cnJlbnRQcmV0dHlWaWV3U3RhdGUgPSB2aWV3O1xuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBbmRDbGVhclZpZXdTdGF0ZXMoKTogKHN0cmluZyB8IHVuZGVmaW5lZClbXSB7XG5cdFx0Y29uc3QgYXJyID0gWy4uLnRoaXMucHJldHR5Vmlld1N0YXRlc107XG5cdFx0dGhpcy5wcmV0dHlWaWV3U3RhdGVzLmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5fbG9nZ2VyPy5sb2coYGdldEFuZENsZWFyVmlld1N0YXRlcygpID0+ICR7SlNPTi5zdHJpbmdpZnkoYXJyKX1gKTtcblx0XHRyZXR1cm4gYXJyO1xuXHR9XG5cblx0cHVibGljIGtleWJvYXJkVHlwZSh0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dnZXI/LmxvZyhga2V5Ym9hcmRUeXBlKCR7SlNPTi5zdHJpbmdpZnkodGV4dCl9KWApO1xuXHRcdHRoaXMuZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgJ3R5cGUnLCB7IHRleHQgfSk7XG5cdH1cblxuXHRwdWJsaWMgY3Vyc29yVXAoKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvclVwLCBudWxsKTtcblx0fVxuXG5cdHB1YmxpYyBjdXJzb3JSaWdodCgpOiB2b2lkIHtcblx0XHR0aGlzLmVkaXRvci5ydW5Db21tYW5kKENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yUmlnaHQsIG51bGwpO1xuXHR9XG5cblx0cHVibGljIGN1cnNvckxlZnQoKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckxlZnQsIG51bGwpO1xuXHR9XG5cblx0cHVibGljIGN1cnNvckRvd24oKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckRvd24sIG51bGwpO1xuXHR9XG5cblx0cHVibGljIGN1cnNvckxpbmVFbmQoKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckxpbmVFbmQsIG51bGwpO1xuXHR9XG5cblx0cHVibGljIGxlZnREZWxldGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yQW5kSW5saW5lQ29tcGxldGlvbnNNb2RlbCB7XG5cdGVkaXRvcjogSVRlc3RDb2RlRWRpdG9yO1xuXHRlZGl0b3JWaWV3TW9kZWw6IFZpZXdNb2RlbDtcblx0bW9kZWw6IElubGluZUNvbXBsZXRpb25zTW9kZWw7XG5cdGNvbnRleHQ6IEdob3N0VGV4dENvbnRleHQ7XG5cdHN0b3JlOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGxvZ2dlcjogSVRyYWNlTG9nZ2VyO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2l0aEFzeW5jVGVzdENvZGVFZGl0b3JBbmRJbmxpbmVDb21wbGV0aW9uc01vZGVsPFQ+KFxuXHR0ZXh0OiBzdHJpbmcsXG5cdG9wdGlvbnM6IFRlc3RDb2RlRWRpdG9ySW5zdGFudGlhdGlvbk9wdGlvbnMgJiB7IHByb3ZpZGVyPzogSW5saW5lQ29tcGxldGlvbnNQcm92aWRlcjsgZmFrZUNsb2NrPzogYm9vbGVhbjsgbG9nVGltZVRyYWNlPzogYm9vbGVhbiB9LFxuXHRjYWxsYmFjazogKGFyZ3M6IElXaXRoQXN5bmNUZXN0Q29kZUVkaXRvckFuZElubGluZUNvbXBsZXRpb25zTW9kZWwpID0+IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+IHtcblx0Y29uc3QgbG9nczogSVRyYWNlTG9nRW50cnlbXSA9IFtdO1xuXHRjb25zdCBsb2dnZXIgPSBjcmVhdGVUcmFjZUxvZ2dlcihsb2dzKTtcblx0cmV0dXJuIGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7XG5cdFx0dXNlRmFrZVRpbWVyczogb3B0aW9ucy5mYWtlQ2xvY2ssXG5cdFx0b25IaXN0b3J5OiBvcHRpb25zLmxvZ1RpbWVUcmFjZSA/IGhpc3RvcnkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZSA9IG9wdGlvbnMuZmFrZUNsb2NrID8gJ3ZpcnR1YWwgdGltZScgOiAncmVhbCB0aW1lJztcblx0XHRcdGNvbnN0IG91dDogc3RyaW5nID0gaGlzdG9yeS5sZW5ndGggPT09IDAgJiYgbG9ncy5sZW5ndGggPT09IDBcblx0XHRcdFx0PyBgW3RpbWUgdHJhY2UgJHttb2RlfV0gKG5vIGV2ZW50cylgXG5cdFx0XHRcdDogYFt0aW1lIHRyYWNlICR7bW9kZX1dICR7aGlzdG9yeS5sZW5ndGh9IGV2ZW50cywgJHtsb2dzLmxlbmd0aH0gbG9nIGxpbmVzXFxuJHtyZW5kZXJTd2ltbGFuZXMoYnVpbGRIaXN0b3J5RnJvbVRhc2tzKGhpc3RvcnksIGhpc3RvcnlbMF0/LnRpbWUgPz8gMCwgbG9ncykpfWA7XG5cdFx0XHQvLyBQcmVmaXggaXMgYWxsb3dsaXN0ZWQgaW4gdGhlIHRlc3QgcmVuZGVyZXIncyBkaWFnbm9zdGljLW91dHB1dCBmaWx0ZXIuXG5cdFx0XHRjb25zb2xlLmxvZyhvdXQpO1xuXHRcdH0gOiB1bmRlZmluZWQsXG5cdH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0aWYgKG9wdGlvbnMucHJvdmlkZXIpIHtcblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBuZXcgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UoKTtcblx0XHRcdFx0aWYgKCFvcHRpb25zLnNlcnZpY2VDb2xsZWN0aW9uKSB7XG5cdFx0XHRcdFx0b3B0aW9ucy5zZXJ2aWNlQ29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9wdGlvbnMuc2VydmljZUNvbGxlY3Rpb24uc2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0b3B0aW9ucy5zZXJ2aWNlQ29sbGVjdGlvbi5zZXQoSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLCB7XG5cdFx0XHRcdFx0cGxheVNpZ25hbDogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRcdGlzU291bmRFbmFibGVkKHNpZ25hbDogdW5rbm93bikgeyByZXR1cm4gZmFsc2U7IH0sXG5cdFx0XHRcdH0gYXMgYW55KTtcblx0XHRcdFx0b3B0aW9ucy5zZXJ2aWNlQ29sbGVjdGlvbi5zZXQoSUJ1bGtFZGl0U2VydmljZSwge1xuXHRcdFx0XHRcdGFwcGx5OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignSUJ1bGtFZGl0U2VydmljZS5hcHBseSBub3QgaW1wbGVtZW50ZWQnKTsgfSxcblx0XHRcdFx0XHRoYXNQcmV2aWV3SGFuZGxlcjogKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ0lCdWxrRWRpdFNlcnZpY2UuaGFzUHJldmlld0hhbmRsZXIgbm90IGltcGxlbWVudGVkJyk7IH0sXG5cdFx0XHRcdFx0c2V0UHJldmlld0hhbmRsZXI6ICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdJQnVsa0VkaXRTZXJ2aWNlLnNldFByZXZpZXdIYW5kbGVyIG5vdCBpbXBsZW1lbnRlZCcpOyB9LFxuXHRcdFx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdG9wdGlvbnMuc2VydmljZUNvbGxlY3Rpb24uc2V0KElUZXh0TW9kZWxTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoTW9ja1RleHRNb2RlbFNlcnZpY2UpKTtcblx0XHRcdFx0b3B0aW9ucy5zZXJ2aWNlQ29sbGVjdGlvbi5zZXQoSURlZmF1bHRBY2NvdW50U2VydmljZSwge1xuXHRcdFx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRvbkRpZENoYW5nZURlZmF1bHRBY2NvdW50OiBFdmVudC5Ob25lLFxuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlUG9saWN5RGF0YTogRXZlbnQuTm9uZSxcblx0XHRcdFx0XHRwb2xpY3lEYXRhOiBudWxsLFxuXHRcdFx0XHRcdGN1cnJlbnREZWZhdWx0QWNjb3VudDogbnVsbCxcblx0XHRcdFx0XHRjb3BpbG90VG9rZW5JbmZvOiBudWxsLFxuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlQ29waWxvdFRva2VuSW5mbzogRXZlbnQuTm9uZSxcblx0XHRcdFx0XHRtYW5hZ2VkU2V0dGluZ3NGZXRjaFN0YXR1czogbnVsbCxcblx0XHRcdFx0XHRtYW5hZ2VkU2V0dGluZ3NGZXRjaGVkQXQ6IG51bGwsXG5cdFx0XHRcdFx0bWFuYWdlZFNldHRpbmdzUmF3UmVzcG9uc2U6IG51bGwsXG5cdFx0XHRcdFx0bWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yOiBudWxsLFxuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlTWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRcdGdldERlZmF1bHRBY2NvdW50OiBhc3luYyAoKSA9PiBudWxsLFxuXHRcdFx0XHRcdHNldERlZmF1bHRBY2NvdW50UHJvdmlkZXI6ICgpID0+IHsgfSxcblx0XHRcdFx0XHRnZXREZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXI6ICgpID0+IHsgcmV0dXJuIHsgaWQ6ICdtb2NrUHJvdmlkZXInLCBuYW1lOiAnTW9jayBQcm92aWRlcicsIGVudGVycHJpc2U6IGZhbHNlIH07IH0sXG5cdFx0XHRcdFx0cmVzb2x2ZUdpdEh1YlVybDogKHBhdGg6IHN0cmluZykgPT4gYGh0dHBzOi8vZ2l0aHViLmNvbS8ke3BhdGh9YCxcblx0XHRcdFx0XHRyZWZyZXNoOiBhc3luYyAoKSA9PiB7IHJldHVybiBudWxsOyB9LFxuXHRcdFx0XHRcdHNpZ25JbjogYXN5bmMgKCkgPT4geyByZXR1cm4gbnVsbDsgfSxcblx0XHRcdFx0XHRzaWduT3V0OiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRvcHRpb25zLnNlcnZpY2VDb2xsZWN0aW9uLnNldChJUmVuYW1lU3ltYm9sVHJhY2tlclNlcnZpY2UsIG5ldyBOdWxsUmVuYW1lU3ltYm9sVHJhY2tlclNlcnZpY2UoKSk7XG5cblx0XHRcdFx0Y29uc3QgZCA9IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmlubGluZUNvbXBsZXRpb25zUHJvdmlkZXIucmVnaXN0ZXIoeyBwYXR0ZXJuOiAnKionIH0sIG9wdGlvbnMucHJvdmlkZXIpO1xuXHRcdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKGQpO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgcmVzdWx0OiBUO1xuXHRcdFx0YXdhaXQgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3IodGV4dCwgb3B0aW9ucywgYXN5bmMgKGVkaXRvciwgZWRpdG9yVmlld01vZGVsLCBpbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViSW5zdGFuY2UoSW5saW5lU3VnZ2VzdGlvbnNWaWV3LCB7XG5cdFx0XHRcdFx0c2hvdWxkU2hvd0hvdmVyQXRWaWV3Wm9uZTogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlciwgZWRpdG9yKTtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBjb250cm9sbGVyLm1vZGVsLmdldCgpITtcblx0XHRcdFx0Y29uc3QgY29udGV4dCA9IG5ldyBHaG9zdFRleHRDb250ZXh0KG1vZGVsLCBlZGl0b3IsIGxvZ2dlcik7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgY2FsbGJhY2soeyBlZGl0b3IsIGVkaXRvclZpZXdNb2RlbCwgbW9kZWwsIGNvbnRleHQsIHN0b3JlOiBkaXNwb3NhYmxlU3RvcmUsIGxvZ2dlciwgaW5zdGFudGlhdGlvblNlcnZpY2UgfSk7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0Y29udGV4dC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGNvbnRyb2xsZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKG9wdGlvbnMucHJvdmlkZXIgaW5zdGFuY2VvZiBNb2NrSW5saW5lQ29tcGxldGlvbnNQcm92aWRlcikge1xuXHRcdFx0XHRvcHRpb25zLnByb3ZpZGVyLmFzc2VydE5vdENhbGxlZFR3aWNlV2l0aGluNTBtcygpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVzdWx0ITtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xufVxuXG5leHBvcnQgY2xhc3MgQW5ub3RhdGVkU3RyaW5nIHtcblx0cHVibGljIHJlYWRvbmx5IHZhbHVlOiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSBtYXJrZXJzOiB7IG1hcms6IHN0cmluZzsgaWR4OiBudW1iZXIgfVtdO1xuXG5cdGNvbnN0cnVjdG9yKHNyYzogc3RyaW5nLCBhbm5vdGF0aW9uczogc3RyaW5nW10gPSBbJ1x1MjE5MyddKSB7XG5cdFx0Y29uc3QgbWFya2VycyA9IGZpbmRNYXJrZXJzKHNyYywgYW5ub3RhdGlvbnMpO1xuXHRcdHRoaXMudmFsdWUgPSBtYXJrZXJzLnRleHRXaXRob3V0TWFya2Vycztcblx0XHR0aGlzLm1hcmtlcnMgPSBtYXJrZXJzLnJlc3VsdHM7XG5cdH1cblxuXHRnZXRNYXJrZXJPZmZzZXQobWFya2VySWR4ID0gMCk6IG51bWJlciB7XG5cdFx0aWYgKG1hcmtlcklkeCA+PSB0aGlzLm1hcmtlcnMubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKGBNYXJrZXIgaW5kZXggJHttYXJrZXJJZHh9IG91dCBvZiBib3VuZHNgKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubWFya2Vyc1ttYXJrZXJJZHhdLmlkeDtcblx0fVxufVxuXG5mdW5jdGlvbiBmaW5kTWFya2Vycyh0ZXh0OiBzdHJpbmcsIG1hcmtlcnM6IHN0cmluZ1tdKToge1xuXHRyZXN1bHRzOiB7IG1hcms6IHN0cmluZzsgaWR4OiBudW1iZXIgfVtdO1xuXHR0ZXh0V2l0aG91dE1hcmtlcnM6IHN0cmluZztcbn0ge1xuXHRjb25zdCByZXN1bHRzOiB7IG1hcms6IHN0cmluZzsgaWR4OiBudW1iZXIgfVtdID0gW107XG5cdGxldCB0ZXh0V2l0aG91dE1hcmtlcnMgPSAnJztcblxuXHRtYXJrZXJzLnNvcnQoKGEsIGIpID0+IGIubGVuZ3RoIC0gYS5sZW5ndGgpO1xuXG5cdGxldCBwb3MgPSAwO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IHRleHQubGVuZ3RoOykge1xuXHRcdGxldCBmb3VuZE1hcmtlciA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgbWFya2VyIG9mIG1hcmtlcnMpIHtcblx0XHRcdGlmICh0ZXh0LnN0YXJ0c1dpdGgobWFya2VyLCBpKSkge1xuXHRcdFx0XHRyZXN1bHRzLnB1c2goeyBtYXJrOiBtYXJrZXIsIGlkeDogcG9zIH0pO1xuXHRcdFx0XHRpICs9IG1hcmtlci5sZW5ndGg7XG5cdFx0XHRcdGZvdW5kTWFya2VyID0gdHJ1ZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghZm91bmRNYXJrZXIpIHtcblx0XHRcdHRleHRXaXRob3V0TWFya2VycyArPSB0ZXh0W2ldO1xuXHRcdFx0cG9zKys7XG5cdFx0XHRpKys7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHsgcmVzdWx0cywgdGV4dFdpdGhvdXRNYXJrZXJzIH07XG59XG5cbmV4cG9ydCBjbGFzcyBBbm5vdGF0ZWRUZXh0IGV4dGVuZHMgQW5ub3RhdGVkU3RyaW5nIHtcblx0cHJpdmF0ZSByZWFkb25seSBfdHJhbnNmb3JtZXIgPSBuZXcgUG9zaXRpb25PZmZzZXRUcmFuc2Zvcm1lcih0aGlzLnZhbHVlKTtcblxuXHRnZXRNYXJrZXJQb3NpdGlvbihtYXJrZXJJZHggPSAwKTogUG9zaXRpb24ge1xuXHRcdHJldHVybiB0aGlzLl90cmFuc2Zvcm1lci5nZXRQb3NpdGlvbih0aGlzLmdldE1hcmtlck9mZnNldChtYXJrZXJJZHgpKTtcblx0fVxufVxuXG5jbGFzcyBNb2NrVGV4dE1vZGVsU2VydmljZSBpbXBsZW1lbnRzIElUZXh0TW9kZWxTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBjcmVhdGVNb2RlbFJlZmVyZW5jZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJUmVmZXJlbmNlPElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbD4+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX21vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBNb2NrVGV4dE1vZGVsU2VydmljZTogTW9kZWwgbm90IGZvdW5kIGZvciAke3Jlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRvYmplY3Q6IHtcblx0XHRcdFx0dGV4dEVkaXRvck1vZGVsOiBtb2RlbCxcblx0XHRcdFx0Z2V0TGFuZ3VhZ2VJZDogKCkgPT4gbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLFxuXHRcdFx0XHRpc1JlYWRvbmx5OiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0aXNEaXNwb3NlZDogKCkgPT4gbW9kZWwuaXNEaXNwb3NlZCgpLFxuXHRcdFx0XHRpc1Jlc29sdmVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRvbldpbGxEaXNwb3NlOiBtb2RlbC5vbldpbGxEaXNwb3NlLFxuXHRcdFx0XHRyZXNvbHZlOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdGNyZWF0ZVNuYXBzaG90OiAoKSA9PiBtb2RlbC5jcmVhdGVTbmFwc2hvdCgpLFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdH07XG5cdH1cblxuXHRyZWdpc3RlclRleHRNb2RlbENvbnRlbnRQcm92aWRlcigpOiBuZXZlciB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNb2NrVGV4dE1vZGVsU2VydmljZS5yZWdpc3RlclRleHRNb2RlbENvbnRlbnRQcm92aWRlciBub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdGNhbkhhbmRsZVJlc291cmNlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFFeEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLHVCQUFtQztBQUN4RCxTQUFTLFNBQVMsZUFBZTtBQUVqQyxTQUFTLHVCQUF1Qix1QkFBdUI7QUFDdkQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx5QkFBdUQ7QUFDaEUsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxxQkFBcUIsOEJBQThCO0FBQzVELFNBQVMs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
