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
import * as nls from "../../../../nls.js";
import "./media/dirtydiffDecorator.css";
import { Disposable, DisposableStore, DisposableMap } from "../../../../base/common/lifecycle.js";
import { Event } from "../../../../base/common/event.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ModelDecorationOptions } from "../../../../editor/common/model/textModel.js";
import { themeColorFromId } from "../../../../platform/theme/common/themeService.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { OverviewRulerLane, MinimapPosition } from "../../../../editor/common/model.js";
import * as domStylesheetsJs from "../../../../base/browser/domStylesheets.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ChangeType, getChangeType, IQuickDiffService, minimapGutterAddedBackground, minimapGutterDeletedBackground, minimapGutterModifiedBackground, overviewRulerAddedForeground, overviewRulerDeletedForeground, overviewRulerModifiedForeground } from "../common/quickDiff.js";
import { IQuickDiffModelService } from "./quickDiffModel.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ContextKeyTrueExpr, ContextKeyFalseExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { autorun, observableFromEvent } from "../../../../base/common/observable.js";
import { registerAction2, Action2, MenuId } from "../../../../platform/actions/common/actions.js";
const quickDiffDecorationCount = new RawContextKey("quickDiffDecorationCount", 0);
let QuickDiffDecorator = class extends Disposable {
  constructor(codeEditor, quickDiffModelRef, configurationService, quickDiffService) {
    super();
    this.codeEditor = codeEditor;
    this.quickDiffModelRef = quickDiffModelRef;
    this.configurationService = configurationService;
    this.quickDiffService = quickDiffService;
    const decorations = configurationService.getValue("scm.diffDecorations");
    const gutter = decorations === "all" || decorations === "gutter";
    const overview = decorations === "all" || decorations === "overview";
    const minimap = decorations === "all" || decorations === "minimap";
    const diffAdded = nls.localize("diffAdded", "Added lines");
    const diffAddedOptions = {
      gutter,
      overview: { active: overview, color: overviewRulerAddedForeground },
      minimap: { active: minimap, color: minimapGutterAddedBackground },
      isWholeLine: true
    };
    this.addedOptions = QuickDiffDecorator.createDecoration("dirty-diff-added primary", diffAdded, diffAddedOptions);
    this.addedPatternOptions = QuickDiffDecorator.createDecoration("dirty-diff-added primary pattern", diffAdded, diffAddedOptions);
    this.addedSecondaryOptions = QuickDiffDecorator.createDecoration("dirty-diff-added secondary", diffAdded, diffAddedOptions);
    this.addedSecondaryPatternOptions = QuickDiffDecorator.createDecoration("dirty-diff-added secondary pattern", diffAdded, diffAddedOptions);
    const diffModified = nls.localize("diffModified", "Changed lines");
    const diffModifiedOptions = {
      gutter,
      overview: { active: overview, color: overviewRulerModifiedForeground },
      minimap: { active: minimap, color: minimapGutterModifiedBackground },
      isWholeLine: true
    };
    this.modifiedOptions = QuickDiffDecorator.createDecoration("dirty-diff-modified primary", diffModified, diffModifiedOptions);
    this.modifiedPatternOptions = QuickDiffDecorator.createDecoration("dirty-diff-modified primary pattern", diffModified, diffModifiedOptions);
    this.modifiedSecondaryOptions = QuickDiffDecorator.createDecoration("dirty-diff-modified secondary", diffModified, diffModifiedOptions);
    this.modifiedSecondaryPatternOptions = QuickDiffDecorator.createDecoration("dirty-diff-modified secondary pattern", diffModified, diffModifiedOptions);
    const diffDeleted = nls.localize("diffDeleted", "Removed lines");
    const diffDeletedOptions = {
      gutter,
      overview: { active: overview, color: overviewRulerDeletedForeground },
      minimap: { active: minimap, color: minimapGutterDeletedBackground },
      isWholeLine: false
    };
    this.deletedOptions = QuickDiffDecorator.createDecoration("dirty-diff-deleted primary", diffDeleted, diffDeletedOptions);
    this.deletedSecondaryOptions = QuickDiffDecorator.createDecoration("dirty-diff-deleted secondary", diffDeleted, diffDeletedOptions);
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("scm.diffDecorationsGutterPattern")) {
        this.onDidChange();
      }
    }));
    this._register(Event.runAndSubscribe(this.quickDiffModelRef.object.onDidChange, () => this.onDidChange()));
  }
  static createDecoration(className, tooltip, options) {
    const decorationOptions = {
      description: "dirty-diff-decoration",
      isWholeLine: options.isWholeLine
    };
    if (options.gutter) {
      decorationOptions.linesDecorationsClassName = `dirty-diff-glyph ${className}`;
      decorationOptions.linesDecorationsTooltip = tooltip;
    }
    if (options.overview.active) {
      decorationOptions.overviewRuler = {
        color: themeColorFromId(options.overview.color),
        position: OverviewRulerLane.Left
      };
    }
    if (options.minimap.active) {
      decorationOptions.minimap = {
        color: themeColorFromId(options.minimap.color),
        position: MinimapPosition.Gutter
      };
    }
    return ModelDecorationOptions.createDynamic(decorationOptions);
  }
  onDidChange() {
    if (!this.codeEditor.hasModel()) {
      return;
    }
    const pattern = this.configurationService.getValue("scm.diffDecorationsGutterPattern");
    const primaryQuickDiff = this.quickDiffModelRef.object.quickDiffs.find((quickDiff) => quickDiff.kind === "primary");
    const primaryQuickDiffChanges = this.quickDiffModelRef.object.changes.filter((change) => change.providerId === primaryQuickDiff?.id);
    const decorations = [];
    for (const change of this.quickDiffModelRef.object.changes) {
      const quickDiff = this.quickDiffModelRef.object.quickDiffs.find((quickDiff2) => quickDiff2.id === change.providerId);
      if (!quickDiff || !this.quickDiffService.isQuickDiffProviderVisible(quickDiff.id)) {
        continue;
      }
      if (quickDiff.kind !== "primary" && primaryQuickDiffChanges.some((c) => c.change2.modified.intersectsOrTouches(change.change2.modified))) {
        continue;
      }
      const changeType = getChangeType(change.change);
      const startLineNumber = change.change.modifiedStartLineNumber;
      const endLineNumber = change.change.modifiedEndLineNumber || startLineNumber;
      switch (changeType) {
        case ChangeType.Add:
          decorations.push({
            range: {
              startLineNumber,
              startColumn: 1,
              endLineNumber,
              endColumn: 1
            },
            options: quickDiff.kind === "primary" || quickDiff.kind === "contributed" ? pattern.added ? this.addedPatternOptions : this.addedOptions : pattern.added ? this.addedSecondaryPatternOptions : this.addedSecondaryOptions
          });
          break;
        case ChangeType.Delete:
          decorations.push({
            range: {
              startLineNumber,
              startColumn: Number.MAX_VALUE,
              endLineNumber: startLineNumber,
              endColumn: Number.MAX_VALUE
            },
            options: quickDiff.kind === "primary" || quickDiff.kind === "contributed" ? this.deletedOptions : this.deletedSecondaryOptions
          });
          break;
        case ChangeType.Modify:
          decorations.push({
            range: {
              startLineNumber,
              startColumn: 1,
              endLineNumber,
              endColumn: 1
            },
            options: quickDiff.kind === "primary" || quickDiff.kind === "contributed" ? pattern.modified ? this.modifiedPatternOptions : this.modifiedOptions : pattern.modified ? this.modifiedSecondaryPatternOptions : this.modifiedSecondaryOptions
          });
          break;
      }
    }
    if (!this.decorationsCollection) {
      this.decorationsCollection = this.codeEditor.createDecorationsCollection(decorations);
    } else {
      this.decorationsCollection.set(decorations);
    }
  }
  dispose() {
    if (this.decorationsCollection) {
      this.decorationsCollection.clear();
    }
    this.decorationsCollection = void 0;
    this.quickDiffModelRef.dispose();
    super.dispose();
  }
};
QuickDiffDecorator = __decorateClass([
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IQuickDiffService)
], QuickDiffDecorator);
let QuickDiffWorkbenchController = class extends Disposable {
  constructor(editorService, configurationService, quickDiffModelService, quickDiffService, uriIdentityService, contextKeyService) {
    super();
    this.editorService = editorService;
    this.configurationService = configurationService;
    this.quickDiffModelService = quickDiffModelService;
    this.quickDiffService = quickDiffService;
    this.uriIdentityService = uriIdentityService;
    this.enabled = false;
    // Resource URI -> Code Editor Id -> Decoration (Disposable)
    this.decorators = new ResourceMap();
    this.viewState = { width: 3, visibility: "always" };
    this.transientDisposables = this._register(new DisposableStore());
    this.stylesheet = domStylesheetsJs.createStyleSheet(void 0, void 0, this._store);
    this.quickDiffDecorationCount = quickDiffDecorationCount.bindTo(contextKeyService);
    this.activeEditor = observableFromEvent(
      this,
      this.editorService.onDidActiveEditorChange,
      () => this.editorService.activeEditor
    );
    this.quickDiffProviders = observableFromEvent(
      this,
      this.quickDiffService.onDidChangeQuickDiffProviders,
      () => this.quickDiffService.providers
    );
    const onDidChangeConfiguration = Event.filter(configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("scm.diffDecorations"));
    this._register(onDidChangeConfiguration(this.onDidChangeConfiguration, this));
    this.onDidChangeConfiguration();
    const onDidChangeDiffWidthConfiguration = Event.filter(configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("scm.diffDecorationsGutterWidth"));
    this._register(onDidChangeDiffWidthConfiguration(this.onDidChangeDiffWidthConfiguration, this));
    this.onDidChangeDiffWidthConfiguration();
    const onDidChangeDiffVisibilityConfiguration = Event.filter(configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("scm.diffDecorationsGutterVisibility"));
    this._register(onDidChangeDiffVisibilityConfiguration(this.onDidChangeDiffVisibilityConfiguration, this));
    this.onDidChangeDiffVisibilityConfiguration();
  }
  onDidChangeConfiguration() {
    const enabled = this.configurationService.getValue("scm.diffDecorations") !== "none";
    if (enabled) {
      this.enable();
    } else {
      this.disable();
    }
  }
  onDidChangeDiffWidthConfiguration() {
    let width = this.configurationService.getValue("scm.diffDecorationsGutterWidth");
    if (isNaN(width) || width <= 0 || width > 5) {
      width = 3;
    }
    this.setViewState({ ...this.viewState, width });
  }
  onDidChangeDiffVisibilityConfiguration() {
    const visibility = this.configurationService.getValue("scm.diffDecorationsGutterVisibility");
    this.setViewState({ ...this.viewState, visibility });
  }
  setViewState(state) {
    this.viewState = state;
    this.stylesheet.textContent = `
			.monaco-editor .dirty-diff-added,
			.monaco-editor .dirty-diff-modified {
				border-left-width:${state.width}px;
			}
			.monaco-editor .dirty-diff-added.pattern,
			.monaco-editor .dirty-diff-added.pattern:before,
			.monaco-editor .dirty-diff-modified.pattern,
			.monaco-editor .dirty-diff-modified.pattern:before {
				background-size: ${state.width}px ${state.width}px;
			}
			.monaco-editor .dirty-diff-added,
			.monaco-editor .dirty-diff-modified,
			.monaco-editor .dirty-diff-deleted {
				opacity: ${state.visibility === "always" ? 1 : 0};
			}
		`;
  }
  enable() {
    if (this.enabled) {
      this.disable();
    }
    this.transientDisposables.add(Event.any(this.editorService.onDidCloseEditor, this.editorService.onDidVisibleEditorsChange)(() => this.onEditorsChanged()));
    this.onEditorsChanged();
    this.onDidActiveEditorChange();
    this.onDidChangeQuickDiffProviders();
    this.enabled = true;
  }
  disable() {
    if (!this.enabled) {
      return;
    }
    this.transientDisposables.clear();
    this.quickDiffDecorationCount.set(0);
    for (const [uri, decoratorMap] of this.decorators.entries()) {
      decoratorMap.dispose();
      this.decorators.delete(uri);
    }
    this.enabled = false;
  }
  onDidActiveEditorChange() {
    this.transientDisposables.add(autorun((reader) => {
      const activeEditor = this.activeEditor.read(reader);
      const activeTextEditorControl = this.editorService.activeTextEditorControl;
      if (!isCodeEditor(activeTextEditorControl) || !activeEditor?.resource) {
        this.quickDiffDecorationCount.set(0);
        return;
      }
      const quickDiffModelRef = this.quickDiffModelService.createQuickDiffModelReference(activeEditor.resource);
      if (!quickDiffModelRef) {
        this.quickDiffDecorationCount.set(0);
        return;
      }
      reader.store.add(quickDiffModelRef);
      const visibleDecorationCount = observableFromEvent(
        this,
        quickDiffModelRef.object.onDidChange,
        () => {
          const visibleQuickDiffs = quickDiffModelRef.object.quickDiffs.filter((quickDiff) => this.quickDiffService.isQuickDiffProviderVisible(quickDiff.id));
          return quickDiffModelRef.object.changes.filter((change) => visibleQuickDiffs.some((quickDiff) => quickDiff.id === change.providerId)).length;
        }
      );
      reader.store.add(autorun((reader2) => {
        const count = visibleDecorationCount.read(reader2);
        this.quickDiffDecorationCount.set(count);
      }));
    }));
  }
  onDidChangeQuickDiffProviders() {
    this.transientDisposables.add(autorun((reader) => {
      const providers = this.quickDiffProviders.read(reader);
      const labels = [];
      for (let index = 0; index < providers.length; index++) {
        const provider = providers[index];
        if (labels.includes(provider.label)) {
          continue;
        }
        const visible = this.quickDiffService.isQuickDiffProviderVisible(provider.id);
        const group = provider.kind !== "contributed" ? "0_scm" : "1_contributed";
        const order = index + 1;
        reader.store.add(registerAction2(class extends Action2 {
          constructor() {
            super({
              id: `workbench.scm.action.toggleQuickDiffVisibility.${provider.id}`,
              title: provider.label,
              toggled: visible ? ContextKeyTrueExpr.INSTANCE : ContextKeyFalseExpr.INSTANCE,
              menu: {
                id: MenuId.SCMQuickDiffDecorations,
                group,
                order
              },
              f1: false
            });
          }
          run(accessor) {
            const quickDiffService = accessor.get(IQuickDiffService);
            quickDiffService.toggleQuickDiffProviderVisibility(provider.id);
          }
        }));
        labels.push(provider.label);
      }
    }));
  }
  onEditorsChanged() {
    for (const editor of this.editorService.visibleTextEditorControls) {
      if (!isCodeEditor(editor)) {
        continue;
      }
      const textModel = editor.getModel();
      if (!textModel) {
        continue;
      }
      const editorId = editor.getId();
      if (this.decorators.get(textModel.uri)?.has(editorId)) {
        continue;
      }
      const quickDiffModelRef = this.quickDiffModelService.createQuickDiffModelReference(textModel.uri);
      if (!quickDiffModelRef) {
        continue;
      }
      if (!this.decorators.has(textModel.uri)) {
        this.decorators.set(textModel.uri, new DisposableMap());
      }
      this.decorators.get(textModel.uri).set(editorId, new QuickDiffDecorator(editor, quickDiffModelRef, this.configurationService, this.quickDiffService));
    }
    for (const [uri, decoratorMap] of this.decorators.entries()) {
      for (const editorId of decoratorMap.keys()) {
        const codeEditor = this.editorService.visibleTextEditorControls.find((editor) => isCodeEditor(editor) && editor.getId() === editorId && this.uriIdentityService.extUri.isEqual(editor.getModel()?.uri, uri));
        if (!codeEditor) {
          decoratorMap.deleteAndDispose(editorId);
        }
      }
      if (decoratorMap.size === 0) {
        decoratorMap.dispose();
        this.decorators.delete(uri);
      }
    }
  }
  dispose() {
    this.disable();
    super.dispose();
  }
};
QuickDiffWorkbenchController = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IQuickDiffModelService),
  __decorateParam(3, IQuickDiffService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, IContextKeyService)
], QuickDiffWorkbenchController);
export {
  QuickDiffWorkbenchController,
  quickDiffDecorationCount
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNjbVxcYnJvd3NlclxccXVpY2tEaWZmRGVjb3JhdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5cbmltcG9ydCAnLi9tZWRpYS9kaXJ0eWRpZmZEZWNvcmF0b3IuY3NzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgRGlzcG9zYWJsZU1hcCwgSVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IHRoZW1lQ29sb3JGcm9tSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBpc0NvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBPdmVydmlld1J1bGVyTGFuZSwgSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMsIE1pbmltYXBQb3NpdGlvbiwgSU1vZGVsRGVsdGFEZWNvcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgKiBhcyBkb21TdHlsZXNoZWV0c0pzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGFuZ2VUeXBlLCBnZXRDaGFuZ2VUeXBlLCBJUXVpY2tEaWZmU2VydmljZSwgUXVpY2tEaWZmUHJvdmlkZXIsIG1pbmltYXBHdXR0ZXJBZGRlZEJhY2tncm91bmQsIG1pbmltYXBHdXR0ZXJEZWxldGVkQmFja2dyb3VuZCwgbWluaW1hcEd1dHRlck1vZGlmaWVkQmFja2dyb3VuZCwgb3ZlcnZpZXdSdWxlckFkZGVkRm9yZWdyb3VuZCwgb3ZlcnZpZXdSdWxlckRlbGV0ZWRGb3JlZ3JvdW5kLCBvdmVydmlld1J1bGVyTW9kaWZpZWRGb3JlZ3JvdW5kIH0gZnJvbSAnLi4vY29tbW9uL3F1aWNrRGlmZi5qcyc7XG5pbXBvcnQgeyBRdWlja0RpZmZNb2RlbCwgSVF1aWNrRGlmZk1vZGVsU2VydmljZSB9IGZyb20gJy4vcXVpY2tEaWZmTW9kZWwuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleVRydWVFeHByLCBDb250ZXh0S2V5RmFsc2VFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZUZyb21FdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQWN0aW9uMiwgQWN0aW9uMiwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5cbmV4cG9ydCBjb25zdCBxdWlja0RpZmZEZWNvcmF0aW9uQ291bnQgPSBuZXcgUmF3Q29udGV4dEtleTxudW1iZXI+KCdxdWlja0RpZmZEZWNvcmF0aW9uQ291bnQnLCAwKTtcblxuY2xhc3MgUXVpY2tEaWZmRGVjb3JhdG9yIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0c3RhdGljIGNyZWF0ZURlY29yYXRpb24oY2xhc3NOYW1lOiBzdHJpbmcsIHRvb2x0aXA6IHN0cmluZyB8IG51bGwsIG9wdGlvbnM6IHsgZ3V0dGVyOiBib29sZWFuOyBvdmVydmlldzogeyBhY3RpdmU6IGJvb2xlYW47IGNvbG9yOiBzdHJpbmcgfTsgbWluaW1hcDogeyBhY3RpdmU6IGJvb2xlYW47IGNvbG9yOiBzdHJpbmcgfTsgaXNXaG9sZUxpbmU6IGJvb2xlYW4gfSk6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMge1xuXHRcdGNvbnN0IGRlY29yYXRpb25PcHRpb25zOiBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyA9IHtcblx0XHRcdGRlc2NyaXB0aW9uOiAnZGlydHktZGlmZi1kZWNvcmF0aW9uJyxcblx0XHRcdGlzV2hvbGVMaW5lOiBvcHRpb25zLmlzV2hvbGVMaW5lLFxuXHRcdH07XG5cblx0XHRpZiAob3B0aW9ucy5ndXR0ZXIpIHtcblx0XHRcdGRlY29yYXRpb25PcHRpb25zLmxpbmVzRGVjb3JhdGlvbnNDbGFzc05hbWUgPSBgZGlydHktZGlmZi1nbHlwaCAke2NsYXNzTmFtZX1gO1xuXHRcdFx0ZGVjb3JhdGlvbk9wdGlvbnMubGluZXNEZWNvcmF0aW9uc1Rvb2x0aXAgPSB0b29sdGlwO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLm92ZXJ2aWV3LmFjdGl2ZSkge1xuXHRcdFx0ZGVjb3JhdGlvbk9wdGlvbnMub3ZlcnZpZXdSdWxlciA9IHtcblx0XHRcdFx0Y29sb3I6IHRoZW1lQ29sb3JGcm9tSWQob3B0aW9ucy5vdmVydmlldy5jb2xvciksXG5cdFx0XHRcdHBvc2l0aW9uOiBPdmVydmlld1J1bGVyTGFuZS5MZWZ0XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLm1pbmltYXAuYWN0aXZlKSB7XG5cdFx0XHRkZWNvcmF0aW9uT3B0aW9ucy5taW5pbWFwID0ge1xuXHRcdFx0XHRjb2xvcjogdGhlbWVDb2xvckZyb21JZChvcHRpb25zLm1pbmltYXAuY29sb3IpLFxuXHRcdFx0XHRwb3NpdGlvbjogTWluaW1hcFBvc2l0aW9uLkd1dHRlclxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5jcmVhdGVEeW5hbWljKGRlY29yYXRpb25PcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYWRkZWRPcHRpb25zOiBNb2RlbERlY29yYXRpb25PcHRpb25zO1xuXHRwcml2YXRlIGFkZGVkU2Vjb25kYXJ5T3B0aW9uczogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucztcblx0cHJpdmF0ZSBhZGRlZFBhdHRlcm5PcHRpb25zOiBNb2RlbERlY29yYXRpb25PcHRpb25zO1xuXHRwcml2YXRlIGFkZGVkU2Vjb25kYXJ5UGF0dGVybk9wdGlvbnM6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnM7XG5cdHByaXZhdGUgbW9kaWZpZWRPcHRpb25zOiBNb2RlbERlY29yYXRpb25PcHRpb25zO1xuXHRwcml2YXRlIG1vZGlmaWVkU2Vjb25kYXJ5T3B0aW9uczogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucztcblx0cHJpdmF0ZSBtb2RpZmllZFBhdHRlcm5PcHRpb25zOiBNb2RlbERlY29yYXRpb25PcHRpb25zO1xuXHRwcml2YXRlIG1vZGlmaWVkU2Vjb25kYXJ5UGF0dGVybk9wdGlvbnM6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnM7XG5cdHByaXZhdGUgZGVsZXRlZE9wdGlvbnM6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnM7XG5cdHByaXZhdGUgZGVsZXRlZFNlY29uZGFyeU9wdGlvbnM6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnM7XG5cdHByaXZhdGUgZGVjb3JhdGlvbnNDb2xsZWN0aW9uOiBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29kZUVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBxdWlja0RpZmZNb2RlbFJlZjogSVJlZmVyZW5jZTxRdWlja0RpZmZNb2RlbD4sXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElRdWlja0RpZmZTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tEaWZmU2VydmljZTogSVF1aWNrRGlmZlNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGRlY29yYXRpb25zID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignc2NtLmRpZmZEZWNvcmF0aW9ucycpO1xuXHRcdGNvbnN0IGd1dHRlciA9IGRlY29yYXRpb25zID09PSAnYWxsJyB8fCBkZWNvcmF0aW9ucyA9PT0gJ2d1dHRlcic7XG5cdFx0Y29uc3Qgb3ZlcnZpZXcgPSBkZWNvcmF0aW9ucyA9PT0gJ2FsbCcgfHwgZGVjb3JhdGlvbnMgPT09ICdvdmVydmlldyc7XG5cdFx0Y29uc3QgbWluaW1hcCA9IGRlY29yYXRpb25zID09PSAnYWxsJyB8fCBkZWNvcmF0aW9ucyA9PT0gJ21pbmltYXAnO1xuXG5cdFx0Y29uc3QgZGlmZkFkZGVkID0gbmxzLmxvY2FsaXplKCdkaWZmQWRkZWQnLCAnQWRkZWQgbGluZXMnKTtcblx0XHRjb25zdCBkaWZmQWRkZWRPcHRpb25zID0ge1xuXHRcdFx0Z3V0dGVyLFxuXHRcdFx0b3ZlcnZpZXc6IHsgYWN0aXZlOiBvdmVydmlldywgY29sb3I6IG92ZXJ2aWV3UnVsZXJBZGRlZEZvcmVncm91bmQgfSxcblx0XHRcdG1pbmltYXA6IHsgYWN0aXZlOiBtaW5pbWFwLCBjb2xvcjogbWluaW1hcEd1dHRlckFkZGVkQmFja2dyb3VuZCB9LFxuXHRcdFx0aXNXaG9sZUxpbmU6IHRydWVcblx0XHR9O1xuXHRcdHRoaXMuYWRkZWRPcHRpb25zID0gUXVpY2tEaWZmRGVjb3JhdG9yLmNyZWF0ZURlY29yYXRpb24oJ2RpcnR5LWRpZmYtYWRkZWQgcHJpbWFyeScsIGRpZmZBZGRlZCwgZGlmZkFkZGVkT3B0aW9ucyk7XG5cdFx0dGhpcy5hZGRlZFBhdHRlcm5PcHRpb25zID0gUXVpY2tEaWZmRGVjb3JhdG9yLmNyZWF0ZURlY29yYXRpb24oJ2RpcnR5LWRpZmYtYWRkZWQgcHJpbWFyeSBwYXR0ZXJuJywgZGlmZkFkZGVkLCBkaWZmQWRkZWRPcHRpb25zKTtcblx0XHR0aGlzLmFkZGVkU2Vjb25kYXJ5T3B0aW9ucyA9IFF1aWNrRGlmZkRlY29yYXRvci5jcmVhdGVEZWNvcmF0aW9uKCdkaXJ0eS1kaWZmLWFkZGVkIHNlY29uZGFyeScsIGRpZmZBZGRlZCwgZGlmZkFkZGVkT3B0aW9ucyk7XG5cdFx0dGhpcy5hZGRlZFNlY29uZGFyeVBhdHRlcm5PcHRpb25zID0gUXVpY2tEaWZmRGVjb3JhdG9yLmNyZWF0ZURlY29yYXRpb24oJ2RpcnR5LWRpZmYtYWRkZWQgc2Vjb25kYXJ5IHBhdHRlcm4nLCBkaWZmQWRkZWQsIGRpZmZBZGRlZE9wdGlvbnMpO1xuXG5cdFx0Y29uc3QgZGlmZk1vZGlmaWVkID0gbmxzLmxvY2FsaXplKCdkaWZmTW9kaWZpZWQnLCAnQ2hhbmdlZCBsaW5lcycpO1xuXHRcdGNvbnN0IGRpZmZNb2RpZmllZE9wdGlvbnMgPSB7XG5cdFx0XHRndXR0ZXIsXG5cdFx0XHRvdmVydmlldzogeyBhY3RpdmU6IG92ZXJ2aWV3LCBjb2xvcjogb3ZlcnZpZXdSdWxlck1vZGlmaWVkRm9yZWdyb3VuZCB9LFxuXHRcdFx0bWluaW1hcDogeyBhY3RpdmU6IG1pbmltYXAsIGNvbG9yOiBtaW5pbWFwR3V0dGVyTW9kaWZpZWRCYWNrZ3JvdW5kIH0sXG5cdFx0XHRpc1dob2xlTGluZTogdHJ1ZVxuXHRcdH07XG5cdFx0dGhpcy5tb2RpZmllZE9wdGlvbnMgPSBRdWlja0RpZmZEZWNvcmF0b3IuY3JlYXRlRGVjb3JhdGlvbignZGlydHktZGlmZi1tb2RpZmllZCBwcmltYXJ5JywgZGlmZk1vZGlmaWVkLCBkaWZmTW9kaWZpZWRPcHRpb25zKTtcblx0XHR0aGlzLm1vZGlmaWVkUGF0dGVybk9wdGlvbnMgPSBRdWlja0RpZmZEZWNvcmF0b3IuY3JlYXRlRGVjb3JhdGlvbignZGlydHktZGlmZi1tb2RpZmllZCBwcmltYXJ5IHBhdHRlcm4nLCBkaWZmTW9kaWZpZWQsIGRpZmZNb2RpZmllZE9wdGlvbnMpO1xuXHRcdHRoaXMubW9kaWZpZWRTZWNvbmRhcnlPcHRpb25zID0gUXVpY2tEaWZmRGVjb3JhdG9yLmNyZWF0ZURlY29yYXRpb24oJ2RpcnR5LWRpZmYtbW9kaWZpZWQgc2Vjb25kYXJ5JywgZGlmZk1vZGlmaWVkLCBkaWZmTW9kaWZpZWRPcHRpb25zKTtcblx0XHR0aGlzLm1vZGlmaWVkU2Vjb25kYXJ5UGF0dGVybk9wdGlvbnMgPSBRdWlja0RpZmZEZWNvcmF0b3IuY3JlYXRlRGVjb3JhdGlvbignZGlydHktZGlmZi1tb2RpZmllZCBzZWNvbmRhcnkgcGF0dGVybicsIGRpZmZNb2RpZmllZCwgZGlmZk1vZGlmaWVkT3B0aW9ucyk7XG5cblx0XHRjb25zdCBkaWZmRGVsZXRlZCA9IG5scy5sb2NhbGl6ZSgnZGlmZkRlbGV0ZWQnLCAnUmVtb3ZlZCBsaW5lcycpO1xuXHRcdGNvbnN0IGRpZmZEZWxldGVkT3B0aW9ucyA9IHtcblx0XHRcdGd1dHRlcixcblx0XHRcdG92ZXJ2aWV3OiB7IGFjdGl2ZTogb3ZlcnZpZXcsIGNvbG9yOiBvdmVydmlld1J1bGVyRGVsZXRlZEZvcmVncm91bmQgfSxcblx0XHRcdG1pbmltYXA6IHsgYWN0aXZlOiBtaW5pbWFwLCBjb2xvcjogbWluaW1hcEd1dHRlckRlbGV0ZWRCYWNrZ3JvdW5kIH0sXG5cdFx0XHRpc1dob2xlTGluZTogZmFsc2Vcblx0XHR9O1xuXHRcdHRoaXMuZGVsZXRlZE9wdGlvbnMgPSBRdWlja0RpZmZEZWNvcmF0b3IuY3JlYXRlRGVjb3JhdGlvbignZGlydHktZGlmZi1kZWxldGVkIHByaW1hcnknLCBkaWZmRGVsZXRlZCwgZGlmZkRlbGV0ZWRPcHRpb25zKTtcblx0XHR0aGlzLmRlbGV0ZWRTZWNvbmRhcnlPcHRpb25zID0gUXVpY2tEaWZmRGVjb3JhdG9yLmNyZWF0ZURlY29yYXRpb24oJ2RpcnR5LWRpZmYtZGVsZXRlZCBzZWNvbmRhcnknLCBkaWZmRGVsZXRlZCwgZGlmZkRlbGV0ZWRPcHRpb25zKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdzY20uZGlmZkRlY29yYXRpb25zR3V0dGVyUGF0dGVybicpKSB7XG5cdFx0XHRcdHRoaXMub25EaWRDaGFuZ2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUodGhpcy5xdWlja0RpZmZNb2RlbFJlZi5vYmplY3Qub25EaWRDaGFuZ2UsICgpID0+IHRoaXMub25EaWRDaGFuZ2UoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY29kZUVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGF0dGVybiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8eyBhZGRlZDogYm9vbGVhbjsgbW9kaWZpZWQ6IGJvb2xlYW4gfT4oJ3NjbS5kaWZmRGVjb3JhdGlvbnNHdXR0ZXJQYXR0ZXJuJyk7XG5cblx0XHRjb25zdCBwcmltYXJ5UXVpY2tEaWZmID0gdGhpcy5xdWlja0RpZmZNb2RlbFJlZi5vYmplY3QucXVpY2tEaWZmcy5maW5kKHF1aWNrRGlmZiA9PiBxdWlja0RpZmYua2luZCA9PT0gJ3ByaW1hcnknKTtcblx0XHRjb25zdCBwcmltYXJ5UXVpY2tEaWZmQ2hhbmdlcyA9IHRoaXMucXVpY2tEaWZmTW9kZWxSZWYub2JqZWN0LmNoYW5nZXMuZmlsdGVyKGNoYW5nZSA9PiBjaGFuZ2UucHJvdmlkZXJJZCA9PT0gcHJpbWFyeVF1aWNrRGlmZj8uaWQpO1xuXG5cdFx0Y29uc3QgZGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgdGhpcy5xdWlja0RpZmZNb2RlbFJlZi5vYmplY3QuY2hhbmdlcykge1xuXHRcdFx0Y29uc3QgcXVpY2tEaWZmID0gdGhpcy5xdWlja0RpZmZNb2RlbFJlZi5vYmplY3QucXVpY2tEaWZmc1xuXHRcdFx0XHQuZmluZChxdWlja0RpZmYgPT4gcXVpY2tEaWZmLmlkID09PSBjaGFuZ2UucHJvdmlkZXJJZCk7XG5cblx0XHRcdC8vIFNraXAgcXVpY2sgZGlmZnMgdGhhdCBhcmUgbm90IHZpc2libGVcblx0XHRcdGlmICghcXVpY2tEaWZmIHx8ICF0aGlzLnF1aWNrRGlmZlNlcnZpY2UuaXNRdWlja0RpZmZQcm92aWRlclZpc2libGUocXVpY2tEaWZmLmlkKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHF1aWNrRGlmZi5raW5kICE9PSAncHJpbWFyeScgJiYgcHJpbWFyeVF1aWNrRGlmZkNoYW5nZXMuc29tZShjID0+IGMuY2hhbmdlMi5tb2RpZmllZC5pbnRlcnNlY3RzT3JUb3VjaGVzKGNoYW5nZS5jaGFuZ2UyLm1vZGlmaWVkKSkpIHtcblx0XHRcdFx0Ly8gT3ZlcmxhcCB3aXRoIHByaW1hcnkgcXVpY2sgZGlmZiBjaGFuZ2VzXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjaGFuZ2VUeXBlID0gZ2V0Q2hhbmdlVHlwZShjaGFuZ2UuY2hhbmdlKTtcblx0XHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IGNoYW5nZS5jaGFuZ2UubW9kaWZpZWRTdGFydExpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gY2hhbmdlLmNoYW5nZS5tb2RpZmllZEVuZExpbmVOdW1iZXIgfHwgc3RhcnRMaW5lTnVtYmVyO1xuXG5cdFx0XHRzd2l0Y2ggKGNoYW5nZVR5cGUpIHtcblx0XHRcdFx0Y2FzZSBDaGFuZ2VUeXBlLkFkZDpcblx0XHRcdFx0XHRkZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdHJhbmdlOiB7XG5cdFx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogZW5kTGluZU51bWJlciwgZW5kQ29sdW1uOiAxXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0b3B0aW9uczogcXVpY2tEaWZmLmtpbmQgPT09ICdwcmltYXJ5JyB8fCBxdWlja0RpZmYua2luZCA9PT0gJ2NvbnRyaWJ1dGVkJ1xuXHRcdFx0XHRcdFx0XHQ/IHBhdHRlcm4uYWRkZWQgPyB0aGlzLmFkZGVkUGF0dGVybk9wdGlvbnMgOiB0aGlzLmFkZGVkT3B0aW9uc1xuXHRcdFx0XHRcdFx0XHQ6IHBhdHRlcm4uYWRkZWQgPyB0aGlzLmFkZGVkU2Vjb25kYXJ5UGF0dGVybk9wdGlvbnMgOiB0aGlzLmFkZGVkU2Vjb25kYXJ5T3B0aW9uc1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENoYW5nZVR5cGUuRGVsZXRlOlxuXHRcdFx0XHRcdGRlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uOiBOdW1iZXIuTUFYX1ZBTFVFLFxuXHRcdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBzdGFydExpbmVOdW1iZXIsIGVuZENvbHVtbjogTnVtYmVyLk1BWF9WQUxVRVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdG9wdGlvbnM6IHF1aWNrRGlmZi5raW5kID09PSAncHJpbWFyeScgfHwgcXVpY2tEaWZmLmtpbmQgPT09ICdjb250cmlidXRlZCdcblx0XHRcdFx0XHRcdFx0PyB0aGlzLmRlbGV0ZWRPcHRpb25zXG5cdFx0XHRcdFx0XHRcdDogdGhpcy5kZWxldGVkU2Vjb25kYXJ5T3B0aW9uc1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENoYW5nZVR5cGUuTW9kaWZ5OlxuXHRcdFx0XHRcdGRlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW46IDFcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRvcHRpb25zOiBxdWlja0RpZmYua2luZCA9PT0gJ3ByaW1hcnknIHx8IHF1aWNrRGlmZi5raW5kID09PSAnY29udHJpYnV0ZWQnXG5cdFx0XHRcdFx0XHRcdD8gcGF0dGVybi5tb2RpZmllZCA/IHRoaXMubW9kaWZpZWRQYXR0ZXJuT3B0aW9ucyA6IHRoaXMubW9kaWZpZWRPcHRpb25zXG5cdFx0XHRcdFx0XHRcdDogcGF0dGVybi5tb2RpZmllZCA/IHRoaXMubW9kaWZpZWRTZWNvbmRhcnlQYXR0ZXJuT3B0aW9ucyA6IHRoaXMubW9kaWZpZWRTZWNvbmRhcnlPcHRpb25zXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmRlY29yYXRpb25zQ29sbGVjdGlvbikge1xuXHRcdFx0dGhpcy5kZWNvcmF0aW9uc0NvbGxlY3Rpb24gPSB0aGlzLmNvZGVFZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKGRlY29yYXRpb25zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kZWNvcmF0aW9uc0NvbGxlY3Rpb24uc2V0KGRlY29yYXRpb25zKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRlY29yYXRpb25zQ29sbGVjdGlvbikge1xuXHRcdFx0dGhpcy5kZWNvcmF0aW9uc0NvbGxlY3Rpb24uY2xlYXIoKTtcblx0XHR9XG5cdFx0dGhpcy5kZWNvcmF0aW9uc0NvbGxlY3Rpb24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5xdWlja0RpZmZNb2RlbFJlZi5kaXNwb3NlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmludGVyZmFjZSBRdWlja0RpZmZXb3JrYmVuY2hDb250cm9sbGVyVmlld1N0YXRlIHtcblx0cmVhZG9ubHkgd2lkdGg6IG51bWJlcjtcblx0cmVhZG9ubHkgdmlzaWJpbGl0eTogJ2Fsd2F5cycgfCAnaG92ZXInO1xufVxuXG5leHBvcnQgY2xhc3MgUXVpY2tEaWZmV29ya2JlbmNoQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRwcml2YXRlIGVuYWJsZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBxdWlja0RpZmZEZWNvcmF0aW9uQ291bnQ6IElDb250ZXh0S2V5PG51bWJlcj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBhY3RpdmVFZGl0b3I6IElPYnNlcnZhYmxlPEVkaXRvcklucHV0IHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSByZWFkb25seSBxdWlja0RpZmZQcm92aWRlcnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IFF1aWNrRGlmZlByb3ZpZGVyW10+O1xuXG5cdC8vIFJlc291cmNlIFVSSSAtPiBDb2RlIEVkaXRvciBJZCAtPiBEZWNvcmF0aW9uIChEaXNwb3NhYmxlKVxuXHRwcml2YXRlIHJlYWRvbmx5IGRlY29yYXRvcnMgPSBuZXcgUmVzb3VyY2VNYXA8RGlzcG9zYWJsZU1hcDxzdHJpbmc+PigpO1xuXHRwcml2YXRlIHZpZXdTdGF0ZTogUXVpY2tEaWZmV29ya2JlbmNoQ29udHJvbGxlclZpZXdTdGF0ZSA9IHsgd2lkdGg6IDMsIHZpc2liaWxpdHk6ICdhbHdheXMnIH07XG5cdHByaXZhdGUgcmVhZG9ubHkgdHJhbnNpZW50RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHN0eWxlc2hlZXQ6IEhUTUxTdHlsZUVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElRdWlja0RpZmZNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0RpZmZNb2RlbFNlcnZpY2U6IElRdWlja0RpZmZNb2RlbFNlcnZpY2UsXG5cdFx0QElRdWlja0RpZmZTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tEaWZmU2VydmljZTogSVF1aWNrRGlmZlNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuc3R5bGVzaGVldCA9IGRvbVN0eWxlc2hlZXRzSnMuY3JlYXRlU3R5bGVTaGVldCh1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGhpcy5fc3RvcmUpO1xuXG5cdFx0dGhpcy5xdWlja0RpZmZEZWNvcmF0aW9uQ291bnQgPSBxdWlja0RpZmZEZWNvcmF0aW9uQ291bnQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuYWN0aXZlRWRpdG9yID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLFxuXHRcdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLCAoKSA9PiB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yKTtcblxuXHRcdHRoaXMucXVpY2tEaWZmUHJvdmlkZXJzID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLFxuXHRcdFx0dGhpcy5xdWlja0RpZmZTZXJ2aWNlLm9uRGlkQ2hhbmdlUXVpY2tEaWZmUHJvdmlkZXJzLCAoKSA9PiB0aGlzLnF1aWNrRGlmZlNlcnZpY2UucHJvdmlkZXJzKTtcblxuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiA9IEV2ZW50LmZpbHRlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbignc2NtLmRpZmZEZWNvcmF0aW9ucycpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihvbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24odGhpcy5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIHRoaXMpKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigpO1xuXG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VEaWZmV2lkdGhDb25maWd1cmF0aW9uID0gRXZlbnQuZmlsdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdzY20uZGlmZkRlY29yYXRpb25zR3V0dGVyV2lkdGgnKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRDaGFuZ2VEaWZmV2lkdGhDb25maWd1cmF0aW9uKHRoaXMub25EaWRDaGFuZ2VEaWZmV2lkdGhDb25maWd1cmF0aW9uLCB0aGlzKSk7XG5cdFx0dGhpcy5vbkRpZENoYW5nZURpZmZXaWR0aENvbmZpZ3VyYXRpb24oKTtcblxuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlRGlmZlZpc2liaWxpdHlDb25maWd1cmF0aW9uID0gRXZlbnQuZmlsdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdzY20uZGlmZkRlY29yYXRpb25zR3V0dGVyVmlzaWJpbGl0eScpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihvbkRpZENoYW5nZURpZmZWaXNpYmlsaXR5Q29uZmlndXJhdGlvbih0aGlzLm9uRGlkQ2hhbmdlRGlmZlZpc2liaWxpdHlDb25maWd1cmF0aW9uLCB0aGlzKSk7XG5cdFx0dGhpcy5vbkRpZENoYW5nZURpZmZWaXNpYmlsaXR5Q29uZmlndXJhdGlvbigpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgZW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignc2NtLmRpZmZEZWNvcmF0aW9ucycpICE9PSAnbm9uZSc7XG5cblx0XHRpZiAoZW5hYmxlZCkge1xuXHRcdFx0dGhpcy5lbmFibGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kaXNhYmxlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZURpZmZXaWR0aENvbmZpZ3VyYXRpb24oKTogdm9pZCB7XG5cdFx0bGV0IHdpZHRoID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KCdzY20uZGlmZkRlY29yYXRpb25zR3V0dGVyV2lkdGgnKTtcblxuXHRcdGlmIChpc05hTih3aWR0aCkgfHwgd2lkdGggPD0gMCB8fCB3aWR0aCA+IDUpIHtcblx0XHRcdHdpZHRoID0gMztcblx0XHR9XG5cblx0XHR0aGlzLnNldFZpZXdTdGF0ZSh7IC4uLnRoaXMudmlld1N0YXRlLCB3aWR0aCB9KTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VEaWZmVmlzaWJpbGl0eUNvbmZpZ3VyYXRpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgdmlzaWJpbGl0eSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J2Fsd2F5cycgfCAnaG92ZXInPignc2NtLmRpZmZEZWNvcmF0aW9uc0d1dHRlclZpc2liaWxpdHknKTtcblx0XHR0aGlzLnNldFZpZXdTdGF0ZSh7IC4uLnRoaXMudmlld1N0YXRlLCB2aXNpYmlsaXR5IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRWaWV3U3RhdGUoc3RhdGU6IFF1aWNrRGlmZldvcmtiZW5jaENvbnRyb2xsZXJWaWV3U3RhdGUpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdTdGF0ZSA9IHN0YXRlO1xuXHRcdHRoaXMuc3R5bGVzaGVldC50ZXh0Q29udGVudCA9IGBcblx0XHRcdC5tb25hY28tZWRpdG9yIC5kaXJ0eS1kaWZmLWFkZGVkLFxuXHRcdFx0Lm1vbmFjby1lZGl0b3IgLmRpcnR5LWRpZmYtbW9kaWZpZWQge1xuXHRcdFx0XHRib3JkZXItbGVmdC13aWR0aDoke3N0YXRlLndpZHRofXB4O1xuXHRcdFx0fVxuXHRcdFx0Lm1vbmFjby1lZGl0b3IgLmRpcnR5LWRpZmYtYWRkZWQucGF0dGVybixcblx0XHRcdC5tb25hY28tZWRpdG9yIC5kaXJ0eS1kaWZmLWFkZGVkLnBhdHRlcm46YmVmb3JlLFxuXHRcdFx0Lm1vbmFjby1lZGl0b3IgLmRpcnR5LWRpZmYtbW9kaWZpZWQucGF0dGVybixcblx0XHRcdC5tb25hY28tZWRpdG9yIC5kaXJ0eS1kaWZmLW1vZGlmaWVkLnBhdHRlcm46YmVmb3JlIHtcblx0XHRcdFx0YmFja2dyb3VuZC1zaXplOiAke3N0YXRlLndpZHRofXB4ICR7c3RhdGUud2lkdGh9cHg7XG5cdFx0XHR9XG5cdFx0XHQubW9uYWNvLWVkaXRvciAuZGlydHktZGlmZi1hZGRlZCxcblx0XHRcdC5tb25hY28tZWRpdG9yIC5kaXJ0eS1kaWZmLW1vZGlmaWVkLFxuXHRcdFx0Lm1vbmFjby1lZGl0b3IgLmRpcnR5LWRpZmYtZGVsZXRlZCB7XG5cdFx0XHRcdG9wYWNpdHk6ICR7c3RhdGUudmlzaWJpbGl0eSA9PT0gJ2Fsd2F5cycgPyAxIDogMH07XG5cdFx0XHR9XG5cdFx0YDtcblx0fVxuXG5cdHByaXZhdGUgZW5hYmxlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmVuYWJsZWQpIHtcblx0XHRcdHRoaXMuZGlzYWJsZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMudHJhbnNpZW50RGlzcG9zYWJsZXMuYWRkKEV2ZW50LmFueSh0aGlzLmVkaXRvclNlcnZpY2Uub25EaWRDbG9zZUVkaXRvciwgdGhpcy5lZGl0b3JTZXJ2aWNlLm9uRGlkVmlzaWJsZUVkaXRvcnNDaGFuZ2UpKCgpID0+IHRoaXMub25FZGl0b3JzQ2hhbmdlZCgpKSk7XG5cdFx0dGhpcy5vbkVkaXRvcnNDaGFuZ2VkKCk7XG5cblx0XHR0aGlzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKCk7XG5cdFx0dGhpcy5vbkRpZENoYW5nZVF1aWNrRGlmZlByb3ZpZGVycygpO1xuXG5cdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgZGlzYWJsZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudHJhbnNpZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLnF1aWNrRGlmZkRlY29yYXRpb25Db3VudC5zZXQoMCk7XG5cblx0XHRmb3IgKGNvbnN0IFt1cmksIGRlY29yYXRvck1hcF0gb2YgdGhpcy5kZWNvcmF0b3JzLmVudHJpZXMoKSkge1xuXHRcdFx0ZGVjb3JhdG9yTWFwLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuZGVjb3JhdG9ycy5kZWxldGUodXJpKTtcblx0XHR9XG5cblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKTogdm9pZCB7XG5cdFx0dGhpcy50cmFuc2llbnREaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gdGhpcy5hY3RpdmVFZGl0b3IucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wgPSB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2w7XG5cblx0XHRcdGlmICghaXNDb2RlRWRpdG9yKGFjdGl2ZVRleHRFZGl0b3JDb250cm9sKSB8fCAhYWN0aXZlRWRpdG9yPy5yZXNvdXJjZSkge1xuXHRcdFx0XHR0aGlzLnF1aWNrRGlmZkRlY29yYXRpb25Db3VudC5zZXQoMCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcXVpY2tEaWZmTW9kZWxSZWYgPSB0aGlzLnF1aWNrRGlmZk1vZGVsU2VydmljZS5jcmVhdGVRdWlja0RpZmZNb2RlbFJlZmVyZW5jZShhY3RpdmVFZGl0b3IucmVzb3VyY2UpO1xuXHRcdFx0aWYgKCFxdWlja0RpZmZNb2RlbFJlZikge1xuXHRcdFx0XHR0aGlzLnF1aWNrRGlmZkRlY29yYXRpb25Db3VudC5zZXQoMCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0cmVhZGVyLnN0b3JlLmFkZChxdWlja0RpZmZNb2RlbFJlZik7XG5cblx0XHRcdGNvbnN0IHZpc2libGVEZWNvcmF0aW9uQ291bnQgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsXG5cdFx0XHRcdHF1aWNrRGlmZk1vZGVsUmVmLm9iamVjdC5vbkRpZENoYW5nZSwgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHZpc2libGVRdWlja0RpZmZzID0gcXVpY2tEaWZmTW9kZWxSZWYub2JqZWN0LnF1aWNrRGlmZnMuZmlsdGVyKHF1aWNrRGlmZiA9PiB0aGlzLnF1aWNrRGlmZlNlcnZpY2UuaXNRdWlja0RpZmZQcm92aWRlclZpc2libGUocXVpY2tEaWZmLmlkKSk7XG5cdFx0XHRcdFx0cmV0dXJuIHF1aWNrRGlmZk1vZGVsUmVmLm9iamVjdC5jaGFuZ2VzLmZpbHRlcihjaGFuZ2UgPT4gdmlzaWJsZVF1aWNrRGlmZnMuc29tZShxdWlja0RpZmYgPT4gcXVpY2tEaWZmLmlkID09PSBjaGFuZ2UucHJvdmlkZXJJZCkpLmxlbmd0aDtcblx0XHRcdFx0fSk7XG5cblx0XHRcdHJlYWRlci5zdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBjb3VudCA9IHZpc2libGVEZWNvcmF0aW9uQ291bnQucmVhZChyZWFkZXIpO1xuXHRcdFx0XHR0aGlzLnF1aWNrRGlmZkRlY29yYXRpb25Db3VudC5zZXQoY291bnQpO1xuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VRdWlja0RpZmZQcm92aWRlcnMoKTogdm9pZCB7XG5cdFx0dGhpcy50cmFuc2llbnREaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJzID0gdGhpcy5xdWlja0RpZmZQcm92aWRlcnMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRjb25zdCBsYWJlbHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgcHJvdmlkZXJzLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdFx0XHRjb25zdCBwcm92aWRlciA9IHByb3ZpZGVyc1tpbmRleF07XG5cdFx0XHRcdGlmIChsYWJlbHMuaW5jbHVkZXMocHJvdmlkZXIubGFiZWwpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB2aXNpYmxlID0gdGhpcy5xdWlja0RpZmZTZXJ2aWNlLmlzUXVpY2tEaWZmUHJvdmlkZXJWaXNpYmxlKHByb3ZpZGVyLmlkKTtcblx0XHRcdFx0Y29uc3QgZ3JvdXAgPSBwcm92aWRlci5raW5kICE9PSAnY29udHJpYnV0ZWQnID8gJzBfc2NtJyA6ICcxX2NvbnRyaWJ1dGVkJztcblx0XHRcdFx0Y29uc3Qgb3JkZXIgPSBpbmRleCArIDE7XG5cblx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZChyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guc2NtLmFjdGlvbi50b2dnbGVRdWlja0RpZmZWaXNpYmlsaXR5LiR7cHJvdmlkZXIuaWR9YCxcblx0XHRcdFx0XHRcdFx0dGl0bGU6IHByb3ZpZGVyLmxhYmVsLFxuXHRcdFx0XHRcdFx0XHR0b2dnbGVkOiB2aXNpYmxlID8gQ29udGV4dEtleVRydWVFeHByLklOU1RBTkNFIDogQ29udGV4dEtleUZhbHNlRXhwci5JTlNUQU5DRSxcblx0XHRcdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0XHRcdGlkOiBNZW51SWQuU0NNUXVpY2tEaWZmRGVjb3JhdGlvbnMsIGdyb3VwLCBvcmRlclxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRmMTogZmFsc2Vcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdFx0XHRcdGNvbnN0IHF1aWNrRGlmZlNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrRGlmZlNlcnZpY2UpO1xuXHRcdFx0XHRcdFx0cXVpY2tEaWZmU2VydmljZS50b2dnbGVRdWlja0RpZmZQcm92aWRlclZpc2liaWxpdHkocHJvdmlkZXIuaWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRsYWJlbHMucHVzaChwcm92aWRlci5sYWJlbCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkVkaXRvcnNDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIHRoaXMuZWRpdG9yU2VydmljZS52aXNpYmxlVGV4dEVkaXRvckNvbnRyb2xzKSB7XG5cdFx0XHRpZiAoIWlzQ29kZUVkaXRvcihlZGl0b3IpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0ZXh0TW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGlmICghdGV4dE1vZGVsKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlZGl0b3JJZCA9IGVkaXRvci5nZXRJZCgpO1xuXHRcdFx0aWYgKHRoaXMuZGVjb3JhdG9ycy5nZXQodGV4dE1vZGVsLnVyaSk/LmhhcyhlZGl0b3JJZCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHF1aWNrRGlmZk1vZGVsUmVmID0gdGhpcy5xdWlja0RpZmZNb2RlbFNlcnZpY2UuY3JlYXRlUXVpY2tEaWZmTW9kZWxSZWZlcmVuY2UodGV4dE1vZGVsLnVyaSk7XG5cdFx0XHRpZiAoIXF1aWNrRGlmZk1vZGVsUmVmKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuZGVjb3JhdG9ycy5oYXModGV4dE1vZGVsLnVyaSkpIHtcblx0XHRcdFx0dGhpcy5kZWNvcmF0b3JzLnNldCh0ZXh0TW9kZWwudXJpLCBuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmc+KCkpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmRlY29yYXRvcnMuZ2V0KHRleHRNb2RlbC51cmkpIS5zZXQoZWRpdG9ySWQsIG5ldyBRdWlja0RpZmZEZWNvcmF0b3IoZWRpdG9yLCBxdWlja0RpZmZNb2RlbFJlZiwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5xdWlja0RpZmZTZXJ2aWNlKSk7XG5cdFx0fVxuXG5cdFx0Ly8gRGlzcG9zZSBkZWNvcmF0b3JzIGZvciBlZGl0b3JzIHRoYXQgYXJlIG5vIGxvbmdlciB2aXNpYmxlLlxuXHRcdGZvciAoY29uc3QgW3VyaSwgZGVjb3JhdG9yTWFwXSBvZiB0aGlzLmRlY29yYXRvcnMuZW50cmllcygpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGVkaXRvcklkIG9mIGRlY29yYXRvck1hcC5rZXlzKCkpIHtcblx0XHRcdFx0Y29uc3QgY29kZUVkaXRvciA9IHRoaXMuZWRpdG9yU2VydmljZS52aXNpYmxlVGV4dEVkaXRvckNvbnRyb2xzXG5cdFx0XHRcdFx0LmZpbmQoZWRpdG9yID0+IGlzQ29kZUVkaXRvcihlZGl0b3IpICYmIGVkaXRvci5nZXRJZCgpID09PSBlZGl0b3JJZCAmJlxuXHRcdFx0XHRcdFx0dGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZWRpdG9yLmdldE1vZGVsKCk/LnVyaSwgdXJpKSk7XG5cblx0XHRcdFx0aWYgKCFjb2RlRWRpdG9yKSB7XG5cdFx0XHRcdFx0ZGVjb3JhdG9yTWFwLmRlbGV0ZUFuZERpc3Bvc2UoZWRpdG9ySWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChkZWNvcmF0b3JNYXAuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHRkZWNvcmF0b3JNYXAuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLmRlY29yYXRvcnMuZGVsZXRlKHVyaSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRpc2FibGUoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBRXJCLE9BQU87QUFDUCxTQUFTLFlBQVksaUJBQWlCLHFCQUFpQztBQUN2RSxTQUFTLGFBQWE7QUFDdEIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyx3QkFBd0I7QUFDakMsU0FB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
