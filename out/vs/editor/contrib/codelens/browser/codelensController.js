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
import { createCancelablePromise, disposableTimeout, RunOnceScheduler } from "../../../../base/common/async.js";
import { onUnexpectedError, onUnexpectedExternalError } from "../../../../base/common/errors.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { StableEditorScrollState } from "../../../browser/stableEditorScroll.js";
import { MouseTargetType } from "../../../browser/editorBrowser.js";
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from "../../../browser/editorExtensions.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { EDITOR_FONT_DEFAULTS } from "../../../common/config/fontInfo.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { getCodeLensModel } from "./codelens.js";
import { ICodeLensCache } from "./codeLensCache.js";
import { CodeLensHelper, CodeLensWidget } from "./codelensWidget.js";
import { localize, localize2 } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ILanguageFeatureDebounceService } from "../../../common/services/languageFeatureDebounce.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
let CodeLensContribution = class {
  constructor(_editor, _languageFeaturesService, debounceService, _commandService, _notificationService, _codeLensCache) {
    this._editor = _editor;
    this._languageFeaturesService = _languageFeaturesService;
    this._commandService = _commandService;
    this._notificationService = _notificationService;
    this._codeLensCache = _codeLensCache;
    this._disposables = new DisposableStore();
    this._localToDispose = new DisposableStore();
    this._lenses = [];
    this._oldCodeLensModels = new DisposableStore();
    this._provideCodeLensDebounce = debounceService.for(_languageFeaturesService.codeLensProvider, "CodeLensProvide", { min: 250 });
    this._resolveCodeLensesDebounce = debounceService.for(_languageFeaturesService.codeLensProvider, "CodeLensResolve", { min: 250, salt: "resolve" });
    this._resolveCodeLensesScheduler = new RunOnceScheduler(() => this._resolveCodeLensesInViewport(), this._resolveCodeLensesDebounce.default());
    this._disposables.add(this._editor.onDidChangeModel(() => this._onModelChange()));
    this._disposables.add(this._editor.onDidChangeModelLanguage(() => this._onModelChange()));
    this._disposables.add(this._editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.fontInfo) || e.hasChanged(EditorOption.codeLensFontSize) || e.hasChanged(EditorOption.codeLensFontFamily)) {
        this._updateLensStyle();
      }
      if (e.hasChanged(EditorOption.codeLens)) {
        this._onModelChange();
      }
    }));
    this._disposables.add(_languageFeaturesService.codeLensProvider.onDidChange(this._onModelChange, this));
    this._onModelChange();
    this._updateLensStyle();
  }
  dispose() {
    this._localDispose();
    this._localToDispose.dispose();
    this._disposables.dispose();
    this._resolveCodeLensesScheduler.dispose();
    this._oldCodeLensModels.dispose();
    this._currentCodeLensModel?.dispose();
  }
  _getLayoutInfo() {
    const lineHeightFactor = Math.max(1.3, this._editor.getOption(EditorOption.lineHeight) / this._editor.getOption(EditorOption.fontSize));
    let fontSize = this._editor.getOption(EditorOption.codeLensFontSize);
    if (!fontSize || fontSize < 5) {
      fontSize = this._editor.getOption(EditorOption.fontSize) * 0.9 | 0;
    }
    return {
      fontSize,
      codeLensHeight: fontSize * lineHeightFactor | 0
    };
  }
  _updateLensStyle() {
    const { codeLensHeight, fontSize } = this._getLayoutInfo();
    const fontFamily = this._editor.getOption(EditorOption.codeLensFontFamily);
    const editorFontInfo = this._editor.getOption(EditorOption.fontInfo);
    const { style } = this._editor.getContainerDomNode();
    style.setProperty("--vscode-editorCodeLens-lineHeight", `${codeLensHeight}px`);
    style.setProperty("--vscode-editorCodeLens-fontSize", `${fontSize}px`);
    style.setProperty("--vscode-editorCodeLens-fontFeatureSettings", editorFontInfo.fontFeatureSettings);
    if (fontFamily) {
      style.setProperty("--vscode-editorCodeLens-fontFamily", fontFamily);
      style.setProperty("--vscode-editorCodeLens-fontFamilyDefault", EDITOR_FONT_DEFAULTS.fontFamily);
    }
    this._editor.changeViewZones((accessor) => {
      for (const lens of this._lenses) {
        lens.updateHeight(codeLensHeight, accessor);
      }
    });
  }
  _localDispose() {
    this._getCodeLensModelPromise?.cancel();
    this._getCodeLensModelPromise = void 0;
    this._resolveCodeLensesPromise?.cancel();
    this._resolveCodeLensesPromise = void 0;
    this._localToDispose.clear();
    this._oldCodeLensModels.clear();
    this._currentCodeLensModel?.dispose();
  }
  _onModelChange() {
    this._localDispose();
    const model = this._editor.getModel();
    if (!model) {
      return;
    }
    if (!this._editor.getOption(EditorOption.codeLens) || model.isTooLargeForTokenization()) {
      return;
    }
    const cachedLenses = this._codeLensCache.get(model);
    if (cachedLenses) {
      this._renderCodeLensSymbols(cachedLenses);
    }
    if (!this._languageFeaturesService.codeLensProvider.has(model)) {
      if (cachedLenses) {
        disposableTimeout(() => {
          const cachedLensesNow = this._codeLensCache.get(model);
          if (cachedLenses === cachedLensesNow) {
            this._codeLensCache.delete(model);
            this._onModelChange();
          }
        }, 30 * 1e3, this._localToDispose);
      }
      return;
    }
    for (const provider of this._languageFeaturesService.codeLensProvider.all(model)) {
      if (typeof provider.onDidChange === "function") {
        const registration = provider.onDidChange(() => scheduler.schedule());
        this._localToDispose.add(registration);
      }
    }
    const scheduler = new RunOnceScheduler(() => {
      const t1 = Date.now();
      this._getCodeLensModelPromise?.cancel();
      this._getCodeLensModelPromise = createCancelablePromise((token) => getCodeLensModel(this._languageFeaturesService.codeLensProvider, model, token));
      this._getCodeLensModelPromise.then((result) => {
        if (this._currentCodeLensModel) {
          this._oldCodeLensModels.add(this._currentCodeLensModel);
        }
        this._currentCodeLensModel = result;
        this._codeLensCache.put(model, result);
        const newDelay = this._provideCodeLensDebounce.update(model, Date.now() - t1);
        scheduler.delay = newDelay;
        this._renderCodeLensSymbols(result);
        this._resolveCodeLensesInViewportSoon();
      }, onUnexpectedError);
    }, this._provideCodeLensDebounce.get(model));
    this._localToDispose.add(scheduler);
    this._localToDispose.add(toDisposable(() => this._resolveCodeLensesScheduler.cancel()));
    this._localToDispose.add(this._editor.onDidChangeModelContent(() => {
      this._editor.changeDecorations((decorationsAccessor) => {
        this._editor.changeViewZones((viewZonesAccessor) => {
          const toDispose = [];
          let lastLensLineNumber = -1;
          this._lenses.forEach((lens) => {
            if (!lens.isValid() || lastLensLineNumber === lens.getLineNumber()) {
              toDispose.push(lens);
            } else {
              lens.update(viewZonesAccessor);
              lastLensLineNumber = lens.getLineNumber();
            }
          });
          const helper = new CodeLensHelper();
          toDispose.forEach((l) => {
            l.dispose(helper, viewZonesAccessor);
            this._lenses.splice(this._lenses.indexOf(l), 1);
          });
          helper.commit(decorationsAccessor);
        });
      });
      scheduler.schedule();
      this._resolveCodeLensesScheduler.cancel();
      this._resolveCodeLensesPromise?.cancel();
      this._resolveCodeLensesPromise = void 0;
    }));
    this._localToDispose.add(this._editor.onDidFocusEditorText(() => {
      scheduler.schedule();
    }));
    this._localToDispose.add(this._editor.onDidBlurEditorText(() => {
      scheduler.cancel();
    }));
    this._localToDispose.add(this._editor.onDidScrollChange((e) => {
      if (e.scrollTopChanged && this._lenses.length > 0) {
        this._resolveCodeLensesInViewportSoon();
      }
    }));
    this._localToDispose.add(this._editor.onDidLayoutChange(() => {
      this._resolveCodeLensesInViewportSoon();
    }));
    this._localToDispose.add(toDisposable(() => {
      if (this._editor.getModel()) {
        const scrollState = StableEditorScrollState.capture(this._editor);
        this._editor.changeDecorations((decorationsAccessor) => {
          this._editor.changeViewZones((viewZonesAccessor) => {
            this._disposeAllLenses(decorationsAccessor, viewZonesAccessor);
          });
        });
        scrollState.restore(this._editor);
      } else {
        this._disposeAllLenses(void 0, void 0);
      }
    }));
    this._localToDispose.add(this._editor.onMouseDown((e) => {
      if (e.target.type !== MouseTargetType.CONTENT_WIDGET) {
        return;
      }
      let target = e.target.element;
      if (target?.tagName === "SPAN") {
        target = target.parentElement;
      }
      if (target?.tagName === "A") {
        for (const lens of this._lenses) {
          const command = lens.getCommand(target);
          if (command) {
            this._commandService.executeCommand(command.id, ...command.arguments || []).catch((err) => this._notificationService.error(err));
            break;
          }
        }
      }
    }));
    scheduler.schedule();
  }
  _disposeAllLenses(decChangeAccessor, viewZoneChangeAccessor) {
    const helper = new CodeLensHelper();
    for (const lens of this._lenses) {
      lens.dispose(helper, viewZoneChangeAccessor);
    }
    if (decChangeAccessor) {
      helper.commit(decChangeAccessor);
    }
    this._lenses.length = 0;
  }
  _renderCodeLensSymbols(symbols) {
    if (!this._editor.hasModel()) {
      return;
    }
    const maxLineNumber = this._editor.getModel().getLineCount();
    const groups = [];
    let lastGroup;
    for (const symbol of symbols.lenses) {
      const line = symbol.symbol.range.startLineNumber;
      if (line < 1 || line > maxLineNumber) {
        continue;
      } else if (lastGroup && lastGroup[lastGroup.length - 1].symbol.range.startLineNumber === line) {
        lastGroup.push(symbol);
      } else {
        lastGroup = [symbol];
        groups.push(lastGroup);
      }
    }
    if (!groups.length && !this._lenses.length) {
      return;
    }
    const scrollState = StableEditorScrollState.capture(this._editor);
    const layoutInfo = this._getLayoutInfo();
    this._editor.changeDecorations((decorationsAccessor) => {
      this._editor.changeViewZones((viewZoneAccessor) => {
        const helper = new CodeLensHelper();
        let codeLensIndex = 0;
        let groupsIndex = 0;
        while (groupsIndex < groups.length && codeLensIndex < this._lenses.length) {
          const symbolsLineNumber = groups[groupsIndex][0].symbol.range.startLineNumber;
          const codeLensLineNumber = this._lenses[codeLensIndex].getLineNumber();
          if (codeLensLineNumber < symbolsLineNumber) {
            this._lenses[codeLensIndex].dispose(helper, viewZoneAccessor);
            this._lenses.splice(codeLensIndex, 1);
          } else if (codeLensLineNumber === symbolsLineNumber) {
            this._lenses[codeLensIndex].updateCodeLensSymbols(groups[groupsIndex], helper);
            groupsIndex++;
            codeLensIndex++;
          } else {
            this._lenses.splice(codeLensIndex, 0, new CodeLensWidget(groups[groupsIndex], this._editor, helper, viewZoneAccessor, layoutInfo.codeLensHeight, () => this._resolveCodeLensesInViewportSoon()));
            codeLensIndex++;
            groupsIndex++;
          }
        }
        while (codeLensIndex < this._lenses.length) {
          this._lenses[codeLensIndex].dispose(helper, viewZoneAccessor);
          this._lenses.splice(codeLensIndex, 1);
        }
        while (groupsIndex < groups.length) {
          this._lenses.push(new CodeLensWidget(groups[groupsIndex], this._editor, helper, viewZoneAccessor, layoutInfo.codeLensHeight, () => this._resolveCodeLensesInViewportSoon()));
          groupsIndex++;
        }
        helper.commit(decorationsAccessor);
      });
    });
    scrollState.restore(this._editor);
  }
  _resolveCodeLensesInViewportSoon() {
    const model = this._editor.getModel();
    if (model) {
      this._resolveCodeLensesScheduler.schedule();
    }
  }
  _resolveCodeLensesInViewport() {
    this._resolveCodeLensesPromise?.cancel();
    this._resolveCodeLensesPromise = void 0;
    const model = this._editor.getModel();
    if (!model) {
      return;
    }
    const toResolve = [];
    const lenses = [];
    this._lenses.forEach((lens) => {
      const request = lens.computeIfNecessary(model);
      if (request) {
        toResolve.push(request);
        lenses.push(lens);
      }
    });
    if (toResolve.length === 0) {
      this._oldCodeLensModels.clear();
      return;
    }
    const t1 = Date.now();
    const resolvePromise = createCancelablePromise((token) => {
      const promises = toResolve.map((request, i) => {
        const resolvedSymbols = new Array(request.length);
        const promises2 = request.map((request2, i2) => {
          if (!request2.symbol.command && typeof request2.provider.resolveCodeLens === "function") {
            return Promise.resolve(request2.provider.resolveCodeLens(model, request2.symbol, token)).then((symbol) => {
              resolvedSymbols[i2] = symbol;
            }, onUnexpectedExternalError);
          } else {
            resolvedSymbols[i2] = request2.symbol;
            return Promise.resolve(void 0);
          }
        });
        return Promise.all(promises2).then(() => {
          if (!token.isCancellationRequested && !lenses[i].isDisposed()) {
            lenses[i].updateCommands(resolvedSymbols);
          }
        });
      });
      return Promise.all(promises);
    });
    this._resolveCodeLensesPromise = resolvePromise;
    this._resolveCodeLensesPromise.then(() => {
      const newDelay = this._resolveCodeLensesDebounce.update(model, Date.now() - t1);
      this._resolveCodeLensesScheduler.delay = newDelay;
      if (this._currentCodeLensModel) {
        this._codeLensCache.put(model, this._currentCodeLensModel);
      }
      this._oldCodeLensModels.clear();
      if (resolvePromise === this._resolveCodeLensesPromise) {
        this._resolveCodeLensesPromise = void 0;
      }
    }, (err) => {
      onUnexpectedError(err);
      if (resolvePromise === this._resolveCodeLensesPromise) {
        this._resolveCodeLensesPromise = void 0;
      }
    });
  }
  async getModel() {
    await this._getCodeLensModelPromise;
    await this._resolveCodeLensesPromise;
    return !this._currentCodeLensModel?.isDisposed ? this._currentCodeLensModel : void 0;
  }
};
CodeLensContribution.ID = "css.editor.codeLens";
CodeLensContribution = __decorateClass([
  __decorateParam(1, ILanguageFeaturesService),
  __decorateParam(2, ILanguageFeatureDebounceService),
  __decorateParam(3, ICommandService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, ICodeLensCache)
], CodeLensContribution);
registerEditorContribution(CodeLensContribution.ID, CodeLensContribution, EditorContributionInstantiation.AfterFirstRender);
registerEditorAction(class ShowLensesInCurrentLine extends EditorAction {
  constructor() {
    super({
      id: "codelens.showLensesInCurrentLine",
      precondition: EditorContextKeys.hasCodeLensProvider,
      label: localize2("showLensOnLine", "Show CodeLens Commands for Current Line")
    });
  }
  async run(accessor, editor) {
    if (!editor.hasModel()) {
      return;
    }
    const quickInputService = accessor.get(IQuickInputService);
    const commandService = accessor.get(ICommandService);
    const notificationService = accessor.get(INotificationService);
    const lineNumber = editor.getSelection().positionLineNumber;
    const codelensController = editor.getContribution(CodeLensContribution.ID);
    if (!codelensController) {
      return;
    }
    const model = await codelensController.getModel();
    if (!model) {
      return;
    }
    const items = [];
    for (const lens of model.lenses) {
      if (lens.symbol.command && lens.symbol.range.startLineNumber === lineNumber) {
        items.push({
          label: lens.symbol.command.title,
          command: lens.symbol.command
        });
      }
    }
    if (items.length === 0) {
      return;
    }
    const item = await quickInputService.pick(items, {
      canPickMany: false,
      placeHolder: localize("placeHolder", "Select a command")
    });
    if (!item) {
      return;
    }
    let command = item.command;
    if (model.isDisposed) {
      const newModel = await codelensController.getModel();
      const newLens = newModel?.lenses.find((lens) => lens.symbol.range.startLineNumber === lineNumber && lens.symbol.command?.title === command.title);
      if (!newLens || !newLens.symbol.command) {
        return;
      }
      command = newLens.symbol.command;
    }
    try {
      await commandService.executeCommand(command.id, ...command.arguments || []);
    } catch (err) {
      notificationService.error(err);
    }
  }
});
export {
  CodeLensContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGNvZGVsZW5zXFxicm93c2VyXFxjb2RlbGVuc0NvbnRyb2xsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5cbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSwgZGlzcG9zYWJsZVRpbWVvdXQsIFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciwgb25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTdGFibGVFZGl0b3JTY3JvbGxTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvc3RhYmxlRWRpdG9yU2Nyb2xsLmpzJztcbmltcG9ydCB7IElBY3RpdmVDb2RlRWRpdG9yLCBJQ29kZUVkaXRvciwgSVZpZXdab25lQ2hhbmdlQWNjZXNzb3IsIE1vdXNlVGFyZ2V0VHlwZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24sIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24sIHJlZ2lzdGVyRWRpdG9yQWN0aW9uLCByZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbiwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRURJVE9SX0ZPTlRfREVGQVVMVFMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2ZvbnRJbmZvLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElNb2RlbERlY29yYXRpb25zQ2hhbmdlQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgQ29kZUxlbnMsIENvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IENvZGVMZW5zSXRlbSwgQ29kZUxlbnNNb2RlbCwgZ2V0Q29kZUxlbnNNb2RlbCB9IGZyb20gJy4vY29kZWxlbnMuanMnO1xuaW1wb3J0IHsgSUNvZGVMZW5zQ2FjaGUgfSBmcm9tICcuL2NvZGVMZW5zQ2FjaGUuanMnO1xuaW1wb3J0IHsgQ29kZUxlbnNIZWxwZXIsIENvZGVMZW5zV2lkZ2V0IH0gZnJvbSAnLi9jb2RlbGVuc1dpZGdldC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSUZlYXR1cmVEZWJvdW5jZUluZm9ybWF0aW9uLCBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZURlYm91bmNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcblxuZXhwb3J0IGNsYXNzIENvZGVMZW5zQ29udHJpYnV0aW9uIGltcGxlbWVudHMgSUVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEOiBzdHJpbmcgPSAnY3NzLmVkaXRvci5jb2RlTGVucyc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvY2FsVG9EaXNwb3NlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xlbnNlczogQ29kZUxlbnNXaWRnZXRbXSA9IFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVDb2RlTGVuc0RlYm91bmNlOiBJRmVhdHVyZURlYm91bmNlSW5mb3JtYXRpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc29sdmVDb2RlTGVuc2VzRGVib3VuY2U6IElGZWF0dXJlRGVib3VuY2VJbmZvcm1hdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVzb2x2ZUNvZGVMZW5zZXNTY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cblx0cHJpdmF0ZSBfZ2V0Q29kZUxlbnNNb2RlbFByb21pc2U6IENhbmNlbGFibGVQcm9taXNlPENvZGVMZW5zTW9kZWw+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbGRDb2RlTGVuc01vZGVscyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSBfY3VycmVudENvZGVMZW5zTW9kZWw6IENvZGVMZW5zTW9kZWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Jlc29sdmVDb2RlTGVuc2VzUHJvbWlzZTogQ2FuY2VsYWJsZVByb21pc2U8dm9pZFtdPiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSBkZWJvdW5jZVNlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUNvZGVMZW5zQ2FjaGUgcHJpdmF0ZSByZWFkb25seSBfY29kZUxlbnNDYWNoZTogSUNvZGVMZW5zQ2FjaGVcblx0KSB7XG5cdFx0dGhpcy5fcHJvdmlkZUNvZGVMZW5zRGVib3VuY2UgPSBkZWJvdW5jZVNlcnZpY2UuZm9yKF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb2RlTGVuc1Byb3ZpZGVyLCAnQ29kZUxlbnNQcm92aWRlJywgeyBtaW46IDI1MCB9KTtcblx0XHR0aGlzLl9yZXNvbHZlQ29kZUxlbnNlc0RlYm91bmNlID0gZGVib3VuY2VTZXJ2aWNlLmZvcihfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUxlbnNQcm92aWRlciwgJ0NvZGVMZW5zUmVzb2x2ZScsIHsgbWluOiAyNTAsIHNhbHQ6ICdyZXNvbHZlJyB9KTtcblx0XHR0aGlzLl9yZXNvbHZlQ29kZUxlbnNlc1NjaGVkdWxlciA9IG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuX3Jlc29sdmVDb2RlTGVuc2VzSW5WaWV3cG9ydCgpLCB0aGlzLl9yZXNvbHZlQ29kZUxlbnNlc0RlYm91bmNlLmRlZmF1bHQoKSk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4gdGhpcy5fb25Nb2RlbENoYW5nZSgpKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2UoKCkgPT4gdGhpcy5fb25Nb2RlbENoYW5nZSgpKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKGUpID0+IHtcblx0XHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmZvbnRJbmZvKSB8fCBlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmNvZGVMZW5zRm9udFNpemUpIHx8IGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uY29kZUxlbnNGb250RmFtaWx5KSkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVMZW5zU3R5bGUoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmNvZGVMZW5zKSkge1xuXHRcdFx0XHR0aGlzLl9vbk1vZGVsQ2hhbmdlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUxlbnNQcm92aWRlci5vbkRpZENoYW5nZSh0aGlzLl9vbk1vZGVsQ2hhbmdlLCB0aGlzKSk7XG5cdFx0dGhpcy5fb25Nb2RlbENoYW5nZSgpO1xuXG5cdFx0dGhpcy5fdXBkYXRlTGVuc1N0eWxlKCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2xvY2FsRGlzcG9zZSgpO1xuXHRcdHRoaXMuX2xvY2FsVG9EaXNwb3NlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fcmVzb2x2ZUNvZGVMZW5zZXNTY2hlZHVsZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29sZENvZGVMZW5zTW9kZWxzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9jdXJyZW50Q29kZUxlbnNNb2RlbD8uZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TGF5b3V0SW5mbygpIHtcblx0XHRjb25zdCBsaW5lSGVpZ2h0RmFjdG9yID0gTWF0aC5tYXgoMS4zLCB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KSAvIHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRTaXplKSk7XG5cdFx0bGV0IGZvbnRTaXplID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uY29kZUxlbnNGb250U2l6ZSk7XG5cdFx0aWYgKCFmb250U2l6ZSB8fCBmb250U2l6ZSA8IDUpIHtcblx0XHRcdGZvbnRTaXplID0gKHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRTaXplKSAqIC45KSB8IDA7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRmb250U2l6ZSxcblx0XHRcdGNvZGVMZW5zSGVpZ2h0OiAoZm9udFNpemUgKiBsaW5lSGVpZ2h0RmFjdG9yKSB8IDAsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUxlbnNTdHlsZSgpOiB2b2lkIHtcblxuXHRcdGNvbnN0IHsgY29kZUxlbnNIZWlnaHQsIGZvbnRTaXplIH0gPSB0aGlzLl9nZXRMYXlvdXRJbmZvKCk7XG5cdFx0Y29uc3QgZm9udEZhbWlseSA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmNvZGVMZW5zRm9udEZhbWlseSk7XG5cdFx0Y29uc3QgZWRpdG9yRm9udEluZm8gPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250SW5mbyk7XG5cblx0XHRjb25zdCB7IHN0eWxlIH0gPSB0aGlzLl9lZGl0b3IuZ2V0Q29udGFpbmVyRG9tTm9kZSgpO1xuXG5cdFx0c3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLWVkaXRvckNvZGVMZW5zLWxpbmVIZWlnaHQnLCBgJHtjb2RlTGVuc0hlaWdodH1weGApO1xuXHRcdHN0eWxlLnNldFByb3BlcnR5KCctLXZzY29kZS1lZGl0b3JDb2RlTGVucy1mb250U2l6ZScsIGAke2ZvbnRTaXplfXB4YCk7XG5cdFx0c3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLWVkaXRvckNvZGVMZW5zLWZvbnRGZWF0dXJlU2V0dGluZ3MnLCBlZGl0b3JGb250SW5mby5mb250RmVhdHVyZVNldHRpbmdzKTtcblxuXHRcdGlmIChmb250RmFtaWx5KSB7XG5cdFx0XHRzdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtZWRpdG9yQ29kZUxlbnMtZm9udEZhbWlseScsIGZvbnRGYW1pbHkpO1xuXHRcdFx0c3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLWVkaXRvckNvZGVMZW5zLWZvbnRGYW1pbHlEZWZhdWx0JywgRURJVE9SX0ZPTlRfREVGQVVMVFMuZm9udEZhbWlseSk7XG5cdFx0fVxuXG5cdFx0Ly9cblx0XHR0aGlzLl9lZGl0b3IuY2hhbmdlVmlld1pvbmVzKGFjY2Vzc29yID0+IHtcblx0XHRcdGZvciAoY29uc3QgbGVucyBvZiB0aGlzLl9sZW5zZXMpIHtcblx0XHRcdFx0bGVucy51cGRhdGVIZWlnaHQoY29kZUxlbnNIZWlnaHQsIGFjY2Vzc29yKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2xvY2FsRGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9nZXRDb2RlTGVuc01vZGVsUHJvbWlzZT8uY2FuY2VsKCk7XG5cdFx0dGhpcy5fZ2V0Q29kZUxlbnNNb2RlbFByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVzb2x2ZUNvZGVMZW5zZXNQcm9taXNlPy5jYW5jZWwoKTtcblx0XHR0aGlzLl9yZXNvbHZlQ29kZUxlbnNlc1Byb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbG9jYWxUb0Rpc3Bvc2UuY2xlYXIoKTtcblx0XHR0aGlzLl9vbGRDb2RlTGVuc01vZGVscy5jbGVhcigpO1xuXHRcdHRoaXMuX2N1cnJlbnRDb2RlTGVuc01vZGVsPy5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9vbk1vZGVsQ2hhbmdlKCk6IHZvaWQge1xuXG5cdFx0dGhpcy5fbG9jYWxEaXNwb3NlKCk7XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmNvZGVMZW5zKSB8fCBtb2RlbC5pc1Rvb0xhcmdlRm9yVG9rZW5pemF0aW9uKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjYWNoZWRMZW5zZXMgPSB0aGlzLl9jb2RlTGVuc0NhY2hlLmdldChtb2RlbCk7XG5cdFx0aWYgKGNhY2hlZExlbnNlcykge1xuXHRcdFx0dGhpcy5fcmVuZGVyQ29kZUxlbnNTeW1ib2xzKGNhY2hlZExlbnNlcyk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb2RlTGVuc1Byb3ZpZGVyLmhhcyhtb2RlbCkpIHtcblx0XHRcdC8vIG5vIHByb3ZpZGVyIC0+IHJldHVybiBidXQgY2hlY2sgd2l0aFxuXHRcdFx0Ly8gY2FjaGVkIGxlbnNlcy4gdGhleSBleHBpcmUgYWZ0ZXIgMzAgc2Vjb25kc1xuXHRcdFx0aWYgKGNhY2hlZExlbnNlcykge1xuXHRcdFx0XHRkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgY2FjaGVkTGVuc2VzTm93ID0gdGhpcy5fY29kZUxlbnNDYWNoZS5nZXQobW9kZWwpO1xuXHRcdFx0XHRcdGlmIChjYWNoZWRMZW5zZXMgPT09IGNhY2hlZExlbnNlc05vdykge1xuXHRcdFx0XHRcdFx0dGhpcy5fY29kZUxlbnNDYWNoZS5kZWxldGUobW9kZWwpO1xuXHRcdFx0XHRcdFx0dGhpcy5fb25Nb2RlbENoYW5nZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgMzAgKiAxMDAwLCB0aGlzLl9sb2NhbFRvRGlzcG9zZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb2RlTGVuc1Byb3ZpZGVyLmFsbChtb2RlbCkpIHtcblx0XHRcdGlmICh0eXBlb2YgcHJvdmlkZXIub25EaWRDaGFuZ2UgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gcHJvdmlkZXIub25EaWRDaGFuZ2UoKCkgPT4gc2NoZWR1bGVyLnNjaGVkdWxlKCkpO1xuXHRcdFx0XHR0aGlzLl9sb2NhbFRvRGlzcG9zZS5hZGQocmVnaXN0cmF0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzY2hlZHVsZXIgPSBuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHRjb25zdCB0MSA9IERhdGUubm93KCk7XG5cblx0XHRcdHRoaXMuX2dldENvZGVMZW5zTW9kZWxQcm9taXNlPy5jYW5jZWwoKTtcblx0XHRcdHRoaXMuX2dldENvZGVMZW5zTW9kZWxQcm9taXNlID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT4gZ2V0Q29kZUxlbnNNb2RlbCh0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb2RlTGVuc1Byb3ZpZGVyLCBtb2RlbCwgdG9rZW4pKTtcblxuXHRcdFx0dGhpcy5fZ2V0Q29kZUxlbnNNb2RlbFByb21pc2UudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fY3VycmVudENvZGVMZW5zTW9kZWwpIHtcblx0XHRcdFx0XHR0aGlzLl9vbGRDb2RlTGVuc01vZGVscy5hZGQodGhpcy5fY3VycmVudENvZGVMZW5zTW9kZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRDb2RlTGVuc01vZGVsID0gcmVzdWx0O1xuXG5cdFx0XHRcdC8vIGNhY2hlIG1vZGVsIHRvIHJlZHVjZSBmbGlja2VyXG5cdFx0XHRcdHRoaXMuX2NvZGVMZW5zQ2FjaGUucHV0KG1vZGVsLCByZXN1bHQpO1xuXG5cdFx0XHRcdC8vIHVwZGF0ZSBtb3ZpbmcgYXZlcmFnZVxuXHRcdFx0XHRjb25zdCBuZXdEZWxheSA9IHRoaXMuX3Byb3ZpZGVDb2RlTGVuc0RlYm91bmNlLnVwZGF0ZShtb2RlbCwgRGF0ZS5ub3coKSAtIHQxKTtcblx0XHRcdFx0c2NoZWR1bGVyLmRlbGF5ID0gbmV3RGVsYXk7XG5cblx0XHRcdFx0Ly8gcmVuZGVyIGxlbnNlc1xuXHRcdFx0XHR0aGlzLl9yZW5kZXJDb2RlTGVuc1N5bWJvbHMocmVzdWx0KTtcblx0XHRcdFx0Ly8gZG9tLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoKCkgPT4gdGhpcy5fcmVzb2x2ZUNvZGVMZW5zZXNJblZpZXdwb3J0KCkpO1xuXHRcdFx0XHR0aGlzLl9yZXNvbHZlQ29kZUxlbnNlc0luVmlld3BvcnRTb29uKCk7XG5cdFx0XHR9LCBvblVuZXhwZWN0ZWRFcnJvcik7XG5cblx0XHR9LCB0aGlzLl9wcm92aWRlQ29kZUxlbnNEZWJvdW5jZS5nZXQobW9kZWwpKTtcblxuXHRcdHRoaXMuX2xvY2FsVG9EaXNwb3NlLmFkZChzY2hlZHVsZXIpO1xuXHRcdHRoaXMuX2xvY2FsVG9EaXNwb3NlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fcmVzb2x2ZUNvZGVMZW5zZXNTY2hlZHVsZXIuY2FuY2VsKCkpKTtcblx0XHR0aGlzLl9sb2NhbFRvRGlzcG9zZS5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KCgpID0+IHtcblx0XHRcdHRoaXMuX2VkaXRvci5jaGFuZ2VEZWNvcmF0aW9ucyhkZWNvcmF0aW9uc0FjY2Vzc29yID0+IHtcblx0XHRcdFx0dGhpcy5fZWRpdG9yLmNoYW5nZVZpZXdab25lcyh2aWV3Wm9uZXNBY2Nlc3NvciA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdG9EaXNwb3NlOiBDb2RlTGVuc1dpZGdldFtdID0gW107XG5cdFx0XHRcdFx0bGV0IGxhc3RMZW5zTGluZU51bWJlcjogbnVtYmVyID0gLTE7XG5cblx0XHRcdFx0XHR0aGlzLl9sZW5zZXMuZm9yRWFjaCgobGVucykgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCFsZW5zLmlzVmFsaWQoKSB8fCBsYXN0TGVuc0xpbmVOdW1iZXIgPT09IGxlbnMuZ2V0TGluZU51bWJlcigpKSB7XG5cdFx0XHRcdFx0XHRcdC8vIGludmFsaWQgLT4gbGVucyBjb2xsYXBzZWQsIGF0dGFjaCByYW5nZSBkb2Vzbid0IGV4aXN0IGFueW1vcmVcblx0XHRcdFx0XHRcdFx0Ly8gbGluZV9udW1iZXIgLT4gbGVuc2VzIHNob3VsZCBuZXZlciBiZSBvbiB0aGUgc2FtZSBsaW5lXG5cdFx0XHRcdFx0XHRcdHRvRGlzcG9zZS5wdXNoKGxlbnMpO1xuXG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRsZW5zLnVwZGF0ZSh2aWV3Wm9uZXNBY2Nlc3Nvcik7XG5cdFx0XHRcdFx0XHRcdGxhc3RMZW5zTGluZU51bWJlciA9IGxlbnMuZ2V0TGluZU51bWJlcigpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0Y29uc3QgaGVscGVyID0gbmV3IENvZGVMZW5zSGVscGVyKCk7XG5cdFx0XHRcdFx0dG9EaXNwb3NlLmZvckVhY2goKGwpID0+IHtcblx0XHRcdFx0XHRcdGwuZGlzcG9zZShoZWxwZXIsIHZpZXdab25lc0FjY2Vzc29yKTtcblx0XHRcdFx0XHRcdHRoaXMuX2xlbnNlcy5zcGxpY2UodGhpcy5fbGVuc2VzLmluZGV4T2YobCksIDEpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGhlbHBlci5jb21taXQoZGVjb3JhdGlvbnNBY2Nlc3Nvcik7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEFzayBmb3IgYWxsIHJlZmVyZW5jZXMgYWdhaW5cblx0XHRcdHNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXG5cdFx0XHQvLyBDYW5jZWwgcGVuZGluZyBhbmQgYWN0aXZlIHJlc29sdmUgcmVxdWVzdHNcblx0XHRcdHRoaXMuX3Jlc29sdmVDb2RlTGVuc2VzU2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5fcmVzb2x2ZUNvZGVMZW5zZXNQcm9taXNlPy5jYW5jZWwoKTtcblx0XHRcdHRoaXMuX3Jlc29sdmVDb2RlTGVuc2VzUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHR9KSk7XG5cdFx0dGhpcy5fbG9jYWxUb0Rpc3Bvc2UuYWRkKHRoaXMuX2VkaXRvci5vbkRpZEZvY3VzRWRpdG9yVGV4dCgoKSA9PiB7XG5cdFx0XHRzY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fbG9jYWxUb0Rpc3Bvc2UuYWRkKHRoaXMuX2VkaXRvci5vbkRpZEJsdXJFZGl0b3JUZXh0KCgpID0+IHtcblx0XHRcdHNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fbG9jYWxUb0Rpc3Bvc2UuYWRkKHRoaXMuX2VkaXRvci5vbkRpZFNjcm9sbENoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLnNjcm9sbFRvcENoYW5nZWQgJiYgdGhpcy5fbGVuc2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5fcmVzb2x2ZUNvZGVMZW5zZXNJblZpZXdwb3J0U29vbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9sb2NhbFRvRGlzcG9zZS5hZGQodGhpcy5fZWRpdG9yLm9uRGlkTGF5b3V0Q2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX3Jlc29sdmVDb2RlTGVuc2VzSW5WaWV3cG9ydFNvb24oKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fbG9jYWxUb0Rpc3Bvc2UuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fZWRpdG9yLmdldE1vZGVsKCkpIHtcblx0XHRcdFx0Y29uc3Qgc2Nyb2xsU3RhdGUgPSBTdGFibGVFZGl0b3JTY3JvbGxTdGF0ZS5jYXB0dXJlKHRoaXMuX2VkaXRvcik7XG5cdFx0XHRcdHRoaXMuX2VkaXRvci5jaGFuZ2VEZWNvcmF0aW9ucyhkZWNvcmF0aW9uc0FjY2Vzc29yID0+IHtcblx0XHRcdFx0XHR0aGlzLl9lZGl0b3IuY2hhbmdlVmlld1pvbmVzKHZpZXdab25lc0FjY2Vzc29yID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2Rpc3Bvc2VBbGxMZW5zZXMoZGVjb3JhdGlvbnNBY2Nlc3Nvciwgdmlld1pvbmVzQWNjZXNzb3IpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0c2Nyb2xsU3RhdGUucmVzdG9yZSh0aGlzLl9lZGl0b3IpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gTm8gYWNjZXNzb3JzIGF2YWlsYWJsZVxuXHRcdFx0XHR0aGlzLl9kaXNwb3NlQWxsTGVuc2VzKHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fbG9jYWxUb0Rpc3Bvc2UuYWRkKHRoaXMuX2VkaXRvci5vbk1vdXNlRG93bihlID0+IHtcblx0XHRcdGlmIChlLnRhcmdldC50eXBlICE9PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9XSURHRVQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0bGV0IHRhcmdldCA9IGUudGFyZ2V0LmVsZW1lbnQ7XG5cdFx0XHRpZiAodGFyZ2V0Py50YWdOYW1lID09PSAnU1BBTicpIHtcblx0XHRcdFx0dGFyZ2V0ID0gdGFyZ2V0LnBhcmVudEVsZW1lbnQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGFyZ2V0Py50YWdOYW1lID09PSAnQScpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBsZW5zIG9mIHRoaXMuX2xlbnNlcykge1xuXHRcdFx0XHRcdGNvbnN0IGNvbW1hbmQgPSBsZW5zLmdldENvbW1hbmQodGFyZ2V0IGFzIEhUTUxMaW5rRWxlbWVudCk7XG5cdFx0XHRcdFx0aWYgKGNvbW1hbmQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmQuaWQsIC4uLihjb21tYW5kLmFyZ3VtZW50cyB8fCBbXSkpLmNhdGNoKGVyciA9PiB0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycikpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlzcG9zZUFsbExlbnNlcyhkZWNDaGFuZ2VBY2Nlc3NvcjogSU1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VBY2Nlc3NvciB8IHVuZGVmaW5lZCwgdmlld1pvbmVDaGFuZ2VBY2Nlc3NvcjogSVZpZXdab25lQ2hhbmdlQWNjZXNzb3IgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBoZWxwZXIgPSBuZXcgQ29kZUxlbnNIZWxwZXIoKTtcblx0XHRmb3IgKGNvbnN0IGxlbnMgb2YgdGhpcy5fbGVuc2VzKSB7XG5cdFx0XHRsZW5zLmRpc3Bvc2UoaGVscGVyLCB2aWV3Wm9uZUNoYW5nZUFjY2Vzc29yKTtcblx0XHR9XG5cdFx0aWYgKGRlY0NoYW5nZUFjY2Vzc29yKSB7XG5cdFx0XHRoZWxwZXIuY29tbWl0KGRlY0NoYW5nZUFjY2Vzc29yKTtcblx0XHR9XG5cdFx0dGhpcy5fbGVuc2VzLmxlbmd0aCA9IDA7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJDb2RlTGVuc1N5bWJvbHMoc3ltYm9sczogQ29kZUxlbnNNb2RlbCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtYXhMaW5lTnVtYmVyID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCkuZ2V0TGluZUNvdW50KCk7XG5cdFx0Y29uc3QgZ3JvdXBzOiBDb2RlTGVuc0l0ZW1bXVtdID0gW107XG5cdFx0bGV0IGxhc3RHcm91cDogQ29kZUxlbnNJdGVtW10gfCB1bmRlZmluZWQ7XG5cblx0XHRmb3IgKGNvbnN0IHN5bWJvbCBvZiBzeW1ib2xzLmxlbnNlcykge1xuXHRcdFx0Y29uc3QgbGluZSA9IHN5bWJvbC5zeW1ib2wucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0aWYgKGxpbmUgPCAxIHx8IGxpbmUgPiBtYXhMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdC8vIGludmFsaWQgY29kZSBsZW5zXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fSBlbHNlIGlmIChsYXN0R3JvdXAgJiYgbGFzdEdyb3VwW2xhc3RHcm91cC5sZW5ndGggLSAxXS5zeW1ib2wucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSBsaW5lKSB7XG5cdFx0XHRcdC8vIG9uIHNhbWUgbGluZSBhcyBwcmV2aW91c1xuXHRcdFx0XHRsYXN0R3JvdXAucHVzaChzeW1ib2wpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gb24gbGF0ZXIgbGluZSBhcyBwcmV2aW91c1xuXHRcdFx0XHRsYXN0R3JvdXAgPSBbc3ltYm9sXTtcblx0XHRcdFx0Z3JvdXBzLnB1c2gobGFzdEdyb3VwKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWdyb3Vwcy5sZW5ndGggJiYgIXRoaXMuX2xlbnNlcy5sZW5ndGgpIHtcblx0XHRcdC8vIE5vdGhpbmcgdG8gY2hhbmdlXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Nyb2xsU3RhdGUgPSBTdGFibGVFZGl0b3JTY3JvbGxTdGF0ZS5jYXB0dXJlKHRoaXMuX2VkaXRvcik7XG5cdFx0Y29uc3QgbGF5b3V0SW5mbyA9IHRoaXMuX2dldExheW91dEluZm8oKTtcblxuXHRcdHRoaXMuX2VkaXRvci5jaGFuZ2VEZWNvcmF0aW9ucyhkZWNvcmF0aW9uc0FjY2Vzc29yID0+IHtcblx0XHRcdHRoaXMuX2VkaXRvci5jaGFuZ2VWaWV3Wm9uZXModmlld1pvbmVBY2Nlc3NvciA9PiB7XG5cblx0XHRcdFx0Y29uc3QgaGVscGVyID0gbmV3IENvZGVMZW5zSGVscGVyKCk7XG5cdFx0XHRcdGxldCBjb2RlTGVuc0luZGV4ID0gMDtcblx0XHRcdFx0bGV0IGdyb3Vwc0luZGV4ID0gMDtcblxuXHRcdFx0XHR3aGlsZSAoZ3JvdXBzSW5kZXggPCBncm91cHMubGVuZ3RoICYmIGNvZGVMZW5zSW5kZXggPCB0aGlzLl9sZW5zZXMubGVuZ3RoKSB7XG5cblx0XHRcdFx0XHRjb25zdCBzeW1ib2xzTGluZU51bWJlciA9IGdyb3Vwc1tncm91cHNJbmRleF1bMF0uc3ltYm9sLnJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdFx0XHRjb25zdCBjb2RlTGVuc0xpbmVOdW1iZXIgPSB0aGlzLl9sZW5zZXNbY29kZUxlbnNJbmRleF0uZ2V0TGluZU51bWJlcigpO1xuXG5cdFx0XHRcdFx0aWYgKGNvZGVMZW5zTGluZU51bWJlciA8IHN5bWJvbHNMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sZW5zZXNbY29kZUxlbnNJbmRleF0uZGlzcG9zZShoZWxwZXIsIHZpZXdab25lQWNjZXNzb3IpO1xuXHRcdFx0XHRcdFx0dGhpcy5fbGVuc2VzLnNwbGljZShjb2RlTGVuc0luZGV4LCAxKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGNvZGVMZW5zTGluZU51bWJlciA9PT0gc3ltYm9sc0xpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xlbnNlc1tjb2RlTGVuc0luZGV4XS51cGRhdGVDb2RlTGVuc1N5bWJvbHMoZ3JvdXBzW2dyb3Vwc0luZGV4XSwgaGVscGVyKTtcblx0XHRcdFx0XHRcdGdyb3Vwc0luZGV4Kys7XG5cdFx0XHRcdFx0XHRjb2RlTGVuc0luZGV4Kys7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xlbnNlcy5zcGxpY2UoY29kZUxlbnNJbmRleCwgMCwgbmV3IENvZGVMZW5zV2lkZ2V0KGdyb3Vwc1tncm91cHNJbmRleF0sIDxJQWN0aXZlQ29kZUVkaXRvcj50aGlzLl9lZGl0b3IsIGhlbHBlciwgdmlld1pvbmVBY2Nlc3NvciwgbGF5b3V0SW5mby5jb2RlTGVuc0hlaWdodCwgKCkgPT4gdGhpcy5fcmVzb2x2ZUNvZGVMZW5zZXNJblZpZXdwb3J0U29vbigpKSk7XG5cdFx0XHRcdFx0XHRjb2RlTGVuc0luZGV4Kys7XG5cdFx0XHRcdFx0XHRncm91cHNJbmRleCsrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIERlbGV0ZSBleHRyYSBjb2RlIGxlbnNlc1xuXHRcdFx0XHR3aGlsZSAoY29kZUxlbnNJbmRleCA8IHRoaXMuX2xlbnNlcy5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLl9sZW5zZXNbY29kZUxlbnNJbmRleF0uZGlzcG9zZShoZWxwZXIsIHZpZXdab25lQWNjZXNzb3IpO1xuXHRcdFx0XHRcdHRoaXMuX2xlbnNlcy5zcGxpY2UoY29kZUxlbnNJbmRleCwgMSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBDcmVhdGUgZXh0cmEgc3ltYm9sc1xuXHRcdFx0XHR3aGlsZSAoZ3JvdXBzSW5kZXggPCBncm91cHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy5fbGVuc2VzLnB1c2gobmV3IENvZGVMZW5zV2lkZ2V0KGdyb3Vwc1tncm91cHNJbmRleF0sIDxJQWN0aXZlQ29kZUVkaXRvcj50aGlzLl9lZGl0b3IsIGhlbHBlciwgdmlld1pvbmVBY2Nlc3NvciwgbGF5b3V0SW5mby5jb2RlTGVuc0hlaWdodCwgKCkgPT4gdGhpcy5fcmVzb2x2ZUNvZGVMZW5zZXNJblZpZXdwb3J0U29vbigpKSk7XG5cdFx0XHRcdFx0Z3JvdXBzSW5kZXgrKztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGhlbHBlci5jb21taXQoZGVjb3JhdGlvbnNBY2Nlc3Nvcik7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHNjcm9sbFN0YXRlLnJlc3RvcmUodGhpcy5fZWRpdG9yKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVDb2RlTGVuc2VzSW5WaWV3cG9ydFNvb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdHRoaXMuX3Jlc29sdmVDb2RlTGVuc2VzU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZUNvZGVMZW5zZXNJblZpZXdwb3J0KCk6IHZvaWQge1xuXG5cdFx0dGhpcy5fcmVzb2x2ZUNvZGVMZW5zZXNQcm9taXNlPy5jYW5jZWwoKTtcblx0XHR0aGlzLl9yZXNvbHZlQ29kZUxlbnNlc1Byb21pc2UgPSB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0b1Jlc29sdmU6IEFycmF5PFJlYWRvbmx5QXJyYXk8Q29kZUxlbnNJdGVtPj4gPSBbXTtcblx0XHRjb25zdCBsZW5zZXM6IENvZGVMZW5zV2lkZ2V0W10gPSBbXTtcblx0XHR0aGlzLl9sZW5zZXMuZm9yRWFjaCgobGVucykgPT4ge1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IGxlbnMuY29tcHV0ZUlmTmVjZXNzYXJ5KG1vZGVsKTtcblx0XHRcdGlmIChyZXF1ZXN0KSB7XG5cdFx0XHRcdHRvUmVzb2x2ZS5wdXNoKHJlcXVlc3QpO1xuXHRcdFx0XHRsZW5zZXMucHVzaChsZW5zKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmICh0b1Jlc29sdmUubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl9vbGRDb2RlTGVuc01vZGVscy5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHQxID0gRGF0ZS5ub3coKTtcblxuXHRcdGNvbnN0IHJlc29sdmVQcm9taXNlID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT4ge1xuXG5cdFx0XHRjb25zdCBwcm9taXNlcyA9IHRvUmVzb2x2ZS5tYXAoKHJlcXVlc3QsIGkpID0+IHtcblxuXHRcdFx0XHRjb25zdCByZXNvbHZlZFN5bWJvbHMgPSBuZXcgQXJyYXk8Q29kZUxlbnMgfCB1bmRlZmluZWQgfCBudWxsPihyZXF1ZXN0Lmxlbmd0aCk7XG5cdFx0XHRcdGNvbnN0IHByb21pc2VzID0gcmVxdWVzdC5tYXAoKHJlcXVlc3QsIGkpID0+IHtcblx0XHRcdFx0XHRpZiAoIXJlcXVlc3Quc3ltYm9sLmNvbW1hbmQgJiYgdHlwZW9mIHJlcXVlc3QucHJvdmlkZXIucmVzb2x2ZUNvZGVMZW5zID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlcXVlc3QucHJvdmlkZXIucmVzb2x2ZUNvZGVMZW5zKG1vZGVsLCByZXF1ZXN0LnN5bWJvbCwgdG9rZW4pKS50aGVuKHN5bWJvbCA9PiB7XG5cdFx0XHRcdFx0XHRcdHJlc29sdmVkU3ltYm9sc1tpXSA9IHN5bWJvbDtcblx0XHRcdFx0XHRcdH0sIG9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXNvbHZlZFN5bWJvbHNbaV0gPSByZXF1ZXN0LnN5bWJvbDtcblx0XHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCAmJiAhbGVuc2VzW2ldLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0XHRcdFx0bGVuc2VzW2ldLnVwZGF0ZUNvbW1hbmRzKHJlc29sdmVkU3ltYm9scyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3Jlc29sdmVDb2RlTGVuc2VzUHJvbWlzZSA9IHJlc29sdmVQcm9taXNlO1xuXG5cdFx0dGhpcy5fcmVzb2x2ZUNvZGVMZW5zZXNQcm9taXNlLnRoZW4oKCkgPT4ge1xuXG5cdFx0XHQvLyB1cGRhdGUgbW92aW5nIGF2ZXJhZ2Vcblx0XHRcdGNvbnN0IG5ld0RlbGF5ID0gdGhpcy5fcmVzb2x2ZUNvZGVMZW5zZXNEZWJvdW5jZS51cGRhdGUobW9kZWwsIERhdGUubm93KCkgLSB0MSk7XG5cdFx0XHR0aGlzLl9yZXNvbHZlQ29kZUxlbnNlc1NjaGVkdWxlci5kZWxheSA9IG5ld0RlbGF5O1xuXG5cdFx0XHRpZiAodGhpcy5fY3VycmVudENvZGVMZW5zTW9kZWwpIHsgLy8gdXBkYXRlIHRoZSBjYWNoZWQgc3RhdGUgd2l0aCBuZXcgcmVzb2x2ZWQgaXRlbXNcblx0XHRcdFx0dGhpcy5fY29kZUxlbnNDYWNoZS5wdXQobW9kZWwsIHRoaXMuX2N1cnJlbnRDb2RlTGVuc01vZGVsKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29sZENvZGVMZW5zTW9kZWxzLmNsZWFyKCk7IC8vIGRpc3Bvc2Ugb2xkIG1vZGVscyBvbmNlIHdlIGhhdmUgdXBkYXRlZCB0aGUgVUkgd2l0aCB0aGUgY3VycmVudCBtb2RlbFxuXHRcdFx0aWYgKHJlc29sdmVQcm9taXNlID09PSB0aGlzLl9yZXNvbHZlQ29kZUxlbnNlc1Byb21pc2UpIHtcblx0XHRcdFx0dGhpcy5fcmVzb2x2ZUNvZGVMZW5zZXNQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0sIGVyciA9PiB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpOyAvLyBjYW4gYWxzbyBiZSBjYW5jZWxsYXRpb24hXG5cdFx0XHRpZiAocmVzb2x2ZVByb21pc2UgPT09IHRoaXMuX3Jlc29sdmVDb2RlTGVuc2VzUHJvbWlzZSkge1xuXHRcdFx0XHR0aGlzLl9yZXNvbHZlQ29kZUxlbnNlc1Byb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBnZXRNb2RlbCgpOiBQcm9taXNlPENvZGVMZW5zTW9kZWwgfCB1bmRlZmluZWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9nZXRDb2RlTGVuc01vZGVsUHJvbWlzZTtcblx0XHRhd2FpdCB0aGlzLl9yZXNvbHZlQ29kZUxlbnNlc1Byb21pc2U7XG5cdFx0cmV0dXJuICF0aGlzLl9jdXJyZW50Q29kZUxlbnNNb2RlbD8uaXNEaXNwb3NlZFxuXHRcdFx0PyB0aGlzLl9jdXJyZW50Q29kZUxlbnNNb2RlbFxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdH1cbn1cblxucmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24oQ29kZUxlbnNDb250cmlidXRpb24uSUQsIENvZGVMZW5zQ29udHJpYnV0aW9uLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLkFmdGVyRmlyc3RSZW5kZXIpO1xuXG5yZWdpc3RlckVkaXRvckFjdGlvbihjbGFzcyBTaG93TGVuc2VzSW5DdXJyZW50TGluZSBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdjb2RlbGVucy5zaG93TGVuc2VzSW5DdXJyZW50TGluZScsXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLmhhc0NvZGVMZW5zUHJvdmlkZXIsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUyKCdzaG93TGVuc09uTGluZScsIFwiU2hvdyBDb2RlTGVucyBDb21tYW5kcyBmb3IgQ3VycmVudCBMaW5lXCIpLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbGluZU51bWJlciA9IGVkaXRvci5nZXRTZWxlY3Rpb24oKS5wb3NpdGlvbkxpbmVOdW1iZXI7XG5cdFx0Y29uc3QgY29kZWxlbnNDb250cm9sbGVyID0gZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxDb2RlTGVuc0NvbnRyaWJ1dGlvbj4oQ29kZUxlbnNDb250cmlidXRpb24uSUQpO1xuXHRcdGlmICghY29kZWxlbnNDb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCBjb2RlbGVuc0NvbnRyb2xsZXIuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHQvLyBub3RoaW5nXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbXM6IHsgbGFiZWw6IHN0cmluZzsgY29tbWFuZDogQ29tbWFuZCB9W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGxlbnMgb2YgbW9kZWwubGVuc2VzKSB7XG5cdFx0XHRpZiAobGVucy5zeW1ib2wuY29tbWFuZCAmJiBsZW5zLnN5bWJvbC5yYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IGxpbmVOdW1iZXIpIHtcblx0XHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IGxlbnMuc3ltYm9sLmNvbW1hbmQudGl0bGUsXG5cdFx0XHRcdFx0Y29tbWFuZDogbGVucy5zeW1ib2wuY29tbWFuZFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBXZSBkb250IHdhbnQgYW4gZW1wdHkgcGlja2VyXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbSA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soaXRlbXMsIHtcblx0XHRcdGNhblBpY2tNYW55OiBmYWxzZSxcblx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgncGxhY2VIb2xkZXInLCBcIlNlbGVjdCBhIGNvbW1hbmRcIilcblx0XHR9KTtcblx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdC8vIE5vdGhpbmcgcGlja2VkXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGNvbW1hbmQgPSBpdGVtLmNvbW1hbmQ7XG5cblx0XHRpZiAobW9kZWwuaXNEaXNwb3NlZCkge1xuXHRcdFx0Ly8gdHJ5IHRvIGZpbmQgdGhlIHNhbWUgY29tbWFuZCBhZ2FpbiBpbi1jYXNlIHRoZSBtb2RlbCBoYXMgYmVlbiByZS1jcmVhdGVkIGluIHRoZSBtZWFudGltZVxuXHRcdFx0Ly8gdGhpcyBpcyBhIGJlc3QgYXR0ZW1wdCBhcHByb2FjaCB3aGljaCBzaG91bGRuJ3QgYmUgbmVlZGVkIGJlY2F1c2UgZWFnZXIgbW9kZWwgcmUtY3JlYXRlc1xuXHRcdFx0Ly8gc2hvdWxkbid0IGhhcHBlbiBkdWUgdG8gZm9jdXMgaW4vb3V0IGFueW1vcmVcblx0XHRcdGNvbnN0IG5ld01vZGVsID0gYXdhaXQgY29kZWxlbnNDb250cm9sbGVyLmdldE1vZGVsKCk7XG5cdFx0XHRjb25zdCBuZXdMZW5zID0gbmV3TW9kZWw/LmxlbnNlcy5maW5kKGxlbnMgPT4gbGVucy5zeW1ib2wucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSBsaW5lTnVtYmVyICYmIGxlbnMuc3ltYm9sLmNvbW1hbmQ/LnRpdGxlID09PSBjb21tYW5kLnRpdGxlKTtcblx0XHRcdGlmICghbmV3TGVucyB8fCAhbmV3TGVucy5zeW1ib2wuY29tbWFuZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb21tYW5kID0gbmV3TGVucy5zeW1ib2wuY29tbWFuZDtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZC5pZCwgLi4uKGNvbW1hbmQuYXJndW1lbnRzIHx8IFtdKSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0fVxuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBNEIseUJBQXlCLG1CQUFtQix3QkFBd0I7QUFDaEcsU0FBUyxtQkFBbUIsaUNBQWlDO0FBQzdELFNBQVMsaUJBQWlCLG9CQUFvQjtBQUM5QyxTQUFTLCtC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LE1BQU0sZ0NBQWdDLGFBQWE7QUFBQSxFQUV2RSxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osY0FBYyxrQkFBa0I7QUFBQSxNQUNoQyxPQUFPLFVBQVUsa0JBQWtCLHlDQUF5QztBQUFBLElBQzdFLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBNEIsUUFBb0M7QUFFekUsUUFBSSxDQUFDLE9BQU8sU0FBUyxHQUFHO0FBQ3ZCO0FBQUEsSUFDRDtBQUVBLFVBQU0sb0JBQW9CLFNBQVMsSUFBSSxrQkFBa0I7QUFDekQsVUFBTSxpQkFBaUIsU0FBUyxJQUFJLGVBQWU7QUFDbkQsVUFBTSxzQkFBc0IsU0FBUyxJQUFJLG9CQUFvQjtBQUU3RCxVQUFNLGFBQWEsT0FBTyxhQUFhLEVBQUU7QUFDekMsVUFBTSxxQkFBcUIsT0FBTyxnQkFBc0MscUJBQXFCLEVBQUU7QUFDL0YsUUFBSSxDQUFDLG9CQUFvQjtBQUN4QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFFBQVEsTUFBTSxtQkFBbUIsU0FBUztBQUNoRCxRQUFJLENBQUMsT0FBTztBQUVYO0FBQUEsSUFDRDtBQUVBLFVBQU0sUUFBK0MsQ0FBQztBQUN0RCxlQUFXLFFBQVEsTUFBTSxRQUFRO0FBQ2hDLFVBQUksS0FBSyxPQUFPLFdBQVcsS0FBSyxPQUFPLE1BQU0sb0JBQW9CLFlBQVk7QUFDNUUsY0FBTSxLQUFLO0FBQUEsVUFDVixPQUFPLEtBQUssT0FBTyxRQUFRO0FBQUEsVUFDM0IsU0FBUyxLQUFLLE9BQU87QUFBQSxRQUN0QixDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFFQSxRQUFJLE1BQU0sV0FBVyxHQUFHO0FBRXZCO0FBQUEsSUFDRDtBQUVBLFVBQU0sT0FBTyxNQUFNLGtCQUFrQixLQUFLLE9BQU87QUFBQSxNQUNoRCxhQUFhO0FBQUEsTUFDYixhQUFhLFNBQVMsZUFBZSxrQkFBa0I7QUFBQSxJQUN4RCxDQUFDO0FBQ0QsUUFBSSxDQUFDLE1BQU07QUFFVjtBQUFBLElBQ0Q7QUFFQSxRQUFJLFVBQVUsS0FBSztBQUVuQixRQUFJLE1BQU0sWUFBWTtBQUlyQixZQUFNLFdBQVcsTUFBTSxtQkFBbUIsU0FBUztBQUNuRCxZQUFNLFVBQVUsVUFBVSxPQUFPLEtBQUssVUFBUSxLQUFLLE9BQU8sTUFBTSxvQkFBb0IsY0FBYyxLQUFLLE9BQU8sU0FBUyxVQUFVLFFBQVEsS0FBSztBQUM5SSxVQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsT0FBTyxTQUFTO0FBQ3hDO0FBQUEsTUFDRDtBQUNBLGdCQUFVLFFBQVEsT0FBTztBQUFBLElBQzFCO0FBRUEsUUFBSTtBQUNILFlBQU0sZUFBZSxlQUFlLFFBQVEsSUFBSSxHQUFJLFFBQVEsYUFBYSxDQUFDLENBQUU7QUFBQSxJQUM3RSxTQUFTLEtBQUs7QUFDYiwwQkFBb0IsTUFBTSxHQUFHO0FBQUEsSUFDOUI7QUFBQSxFQUNEO0FBQ0QsQ0FBQzsiLAogICJuYW1lcyI6IFsicHJvbWlzZXMiLCAicmVxdWVzdCIsICJpIl0KfQo=
