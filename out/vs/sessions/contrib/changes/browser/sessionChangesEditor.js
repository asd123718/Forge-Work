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
import "./media/sessionChangesEditor.css";
import { $, append, Dimension } from "../../../../base/browser/dom.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, derivedObservableWithCache, observableValue } from "../../../../base/common/observable.js";
import { Range } from "../../../../editor/common/core/range.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { bindContextKey } from "../../../../platform/observable/common/platformObservableUtils.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { AbstractEditorWithViewState } from "../../../../workbench/browser/parts/editor/editorWithViewState.js";
import { ResourceLabel } from "../../../../workbench/browser/labels.js";
import { ChatContextKeys } from "../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { IEditorGroupsService } from "../../../../workbench/services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../workbench/services/editor/common/editorService.js";
import { MultiDiffEditorWidget } from "../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { MultiDiffEditorItemLabelKind } from "../../../../editor/browser/widget/multiDiffEditor/workbenchUIElementFactory.js";
import { Menus } from "../../../browser/menus.js";
import { IAgentWorkbenchLayoutService } from "../../../browser/workbench.js";
import { ActiveSessionContextKeys } from "../common/changes.js";
import { IChangesViewService } from "../common/changesViewService.js";
import { ChangesActionsBar } from "./changesView.js";
import { SessionChangesEditorInput } from "./sessionChangesEditorInput.js";
import { ISessionChangesService } from "./sessionChangesService.js";
import { isEqual } from "../../../../base/common/resources.js";
import { MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { CheckboxActionViewItem } from "../../../../base/browser/ui/toggle/toggle.js";
import { defaultCheckboxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { localize } from "../../../../nls.js";
import { getChangesEditorFileStats } from "./changesEditorLabels.js";
const HEADER_HEIGHT = 35;
const CHANGES_DIFF_EDITOR_OPTIONS = {
  hideOriginalLineNumbers: true,
  folding: false,
  lineNumbersMinChars: 3
};
let SessionChangesUIElementFactory = class {
  constructor(changesObs, commandService, changesViewService, instantiationService) {
    this.changesObs = changesObs;
    this.commandService = commandService;
    this.changesViewService = changesViewService;
    this.instantiationService = instantiationService;
    this.headerClickToCollapse = true;
  }
  createResourceLabel(element, kind) {
    const label = this.instantiationService.createInstance(ResourceLabel, element, {});
    const showDiffStats = kind === MultiDiffEditorItemLabelKind.Primary;
    return new SessionChangesResourceLabel(label, element, showDiffStats, this.changesObs);
  }
  handleHeaderMiddleClick(resource) {
    if (this.changesViewService.activeSessionChangesetObs.get()?.capabilities?.review !== true) {
      return false;
    }
    if (!getChangesEditorFileStats(resource, this.changesViewService.activeSessionChangesObs.get())) {
      return false;
    }
    void this.commandService.executeCommand(CHANGESET_REVIEW_ACTION_ID, resource);
    return true;
  }
  createToolbarActionViewItem(action, options) {
    if (action.id === CHANGESET_REVIEW_ACTION_ID && action instanceof MenuItemAction) {
      return this.instantiationService.createInstance(ChangesetReviewActionViewItem, action, options);
    }
    return void 0;
  }
};
SessionChangesUIElementFactory = __decorateClass([
  __decorateParam(1, ICommandService),
  __decorateParam(2, IChangesViewService),
  __decorateParam(3, IInstantiationService)
], SessionChangesUIElementFactory);
class SessionChangesResourceLabel extends Disposable {
  constructor(label, element, showDiffStats, changesObs) {
    super();
    this.label = label;
    this.resource = observableValue(this, void 0);
    this._register(label);
    if (showDiffStats) {
      const statsContainer = append(element, $(".session-changes-file-stats"));
      const added = append(statsContainer, $(".working-set-lines-added"));
      const removed = append(statsContainer, $(".working-set-lines-removed"));
      added.setAttribute("aria-hidden", "true");
      removed.setAttribute("aria-hidden", "true");
      this._register(autorun((reader) => {
        const resource = this.resource.read(reader);
        const stats = resource ? getChangesEditorFileStats(resource, changesObs.read(reader)) : void 0;
        statsContainer.style.display = stats ? "" : "none";
        if (stats) {
          added.textContent = `+${stats.insertions}`;
          removed.textContent = `-${stats.deletions}`;
          statsContainer.setAttribute("aria-label", localize("sessionChangesEditor.fileCounts", "{0} lines added, {1} lines removed", stats.insertions, stats.deletions));
        } else {
          added.textContent = "";
          removed.textContent = "";
          statsContainer.removeAttribute("aria-label");
        }
      }));
    }
  }
  setUri(uri, options = {}) {
    if (!uri) {
      this.label.element.clear();
    } else {
      this.label.element.setFile(uri, { strikethrough: options.strikethrough });
    }
    this.resource.set(uri, void 0);
  }
}
let SessionChangesEditor = class extends AbstractEditorWithViewState {
  constructor(group, telemetryService, themeService, storageService, instantiationService, textResourceConfigurationService, editorService, editorGroupService, contextKeyService, changesViewService, configurationService, layoutService, sessionChangesService) {
    super(
      SessionChangesEditor.ID,
      group,
      "sessionChangesEditorViewState",
      telemetryService,
      instantiationService,
      storageService,
      textResourceConfigurationService,
      themeService,
      editorService,
      editorGroupService
    );
    this.contextKeyService = contextKeyService;
    this.changesViewService = changesViewService;
    this.configurationService = configurationService;
    this.layoutService = layoutService;
    this.sessionChangesService = sessionChangesService;
    this._singlePane = false;
    /** Session whose changes this editor is currently showing (from its input). */
    this._inputSessionResource = observableValue(this, void 0);
    /**
     * Changes for this editor's own session, scoped so a stale row does not pick
     * up the counts of a different (globally active) session during a switch.
     */
    this._scopedChangesObs = derivedObservableWithCache(this, (reader, lastValue) => {
      const editorSession = this._inputSessionResource.read(reader);
      const activeSession = this.changesViewService.activeSessionResourceObs.read(reader);
      if (!editorSession || !activeSession || !isEqual(editorSession, activeSession)) {
        return lastValue ?? [];
      }
      return this.changesViewService.activeSessionChangesObs.read(reader);
    });
    /** Deferred focus request awaiting the active diff editor to be rendered. */
    this._pendingFocus = this._register(new MutableDisposable());
  }
  createEditor(parent) {
    const root = append(parent, $(".session-changes-editor"));
    const scopedContextKeyService = this._register(this.contextKeyService.createScoped(root));
    this._register(bindContextKey(ActiveSessionContextKeys.HasGitRepository, scopedContextKeyService, (reader) => this.changesViewService.activeSessionHasGitRepositoryObs.read(reader)));
    this._register(bindContextKey(ChatContextKeys.hasAgentSessionChanges, scopedContextKeyService, (reader) => this.changesViewService.activeSessionChangesObs.read(reader).length > 0));
    const scopedInstantiationService = this._register(this.instantiationService.createChild(
      new ServiceCollection([IContextKeyService, scopedContextKeyService])
    ));
    this._scopedInstantiationService = scopedInstantiationService;
    this._singlePane = this.layoutService.isSinglePaneLayoutEnabled;
    if (!this._singlePane) {
      const header = append(root, $(".session-changes-editor-header"));
      const left = append(header, $(".session-changes-editor-header-left"));
      const right = append(header, $(".session-changes-editor-header-right"));
      this._register(this._buildHeaderToolbars(left, right, scopedInstantiationService));
    }
    this.bodyContainer = append(root, $(".session-changes-editor-body"));
    const paneInstantiationService = this._register(this.instantiationService.createChild(
      new ServiceCollection([IContextKeyService, this.contextKeyService])
    ));
    this.widget = this._register(paneInstantiationService.createInstance(
      MultiDiffEditorWidget,
      this.bodyContainer,
      paneInstantiationService.createInstance(SessionChangesUIElementFactory, this._scopedChangesObs),
      CHANGES_DIFF_EDITOR_OPTIONS
    ));
    this._applyRenderSideBySide();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("diffEditor.renderSideBySide")) {
        this._applyRenderSideBySide();
      }
    }));
  }
  _applyRenderSideBySide() {
    this.widget?.setRenderSideBySide(this.configurationService.getValue("diffEditor.renderSideBySide") ?? true);
  }
  /**
   * Resolves the diff editor and code editor showing the given file, mirroring
   * {@link MultiDiffEditor.tryGetCodeEditor} so file-toolbar actions can operate
   * on this editor and the plain multi-diff editor uniformly.
   */
  tryGetCodeEditor(resource) {
    return this.widget?.tryGetCodeEditor(resource);
  }
  /** Creates the classic (non-single-pane) internal header toolbars. */
  _buildHeaderToolbars(left, right, instantiationService) {
    const store = new DisposableStore();
    store.add(instantiationService.createInstance(MenuWorkbenchToolBar, left, Menus.SessionsEditorHeaderPrimary, {
      menuOptions: { shouldForwardArgs: true }
    }));
    store.add(instantiationService.createInstance(ChangesActionsBar, right));
    return store;
  }
  get scopedInstantiationService() {
    return this._singlePane ? this._scopedInstantiationService : void 0;
  }
  async setInput(input, options, context, token) {
    await super.setInput(input, options, context, token);
    this._inputSessionResource.set(this.sessionChangesService.getSessionResource(input.multiDiffSource), void 0);
    const viewModel = await input.getViewModel();
    if (token.isCancellationRequested) {
      return;
    }
    this.viewModel = viewModel;
    const viewState = this.loadEditorViewState(input, context);
    this.widget?.setViewModel(viewModel, { preserveFocus: options?.preserveFocus, viewState });
    this._applyOptions(options);
  }
  setEditorVisible(visible) {
    if (!visible) {
      this._pendingFocus.clear();
      this.saveCurrentEditorViewState();
    }
    super.setEditorVisible(visible);
  }
  computeEditorViewState(_resource) {
    if (!this.viewModel) {
      return void 0;
    }
    return this.widget?.getViewState();
  }
  tracksEditorViewState(input) {
    return input instanceof SessionChangesEditorInput;
  }
  tracksDisposedEditorViewState() {
    return true;
  }
  toEditorViewStateResource(input) {
    return input instanceof SessionChangesEditorInput ? input.multiDiffSource : void 0;
  }
  collapseAllDiffs() {
    this.viewModel?.collapseAll();
  }
  expandAllDiffs() {
    this.viewModel?.expandAll();
  }
  collapse(resource) {
    const item = this.viewModel?.items.read(void 0).find((i) => isEqual(i.modifiedUri, resource) || isEqual(i.originalUri, resource));
    if (!item) {
      return;
    }
    this.viewModel?.collapse(item);
  }
  expand(resource) {
    const item = this.viewModel?.items.read(void 0).find((i) => isEqual(i.modifiedUri, resource) || isEqual(i.originalUri, resource));
    if (!item) {
      return;
    }
    this.viewModel?.expand(item);
  }
  setOptions(options) {
    this._applyOptions(options);
  }
  _applyOptions(options) {
    const revealData = options?.viewState?.revealData;
    if (!revealData) {
      return;
    }
    this.widget?.reveal(revealData.resource, {
      range: revealData.range ? Range.lift(revealData.range) : void 0,
      highlight: true
    });
  }
  clearInput() {
    const input = this.input;
    this._pendingFocus.clear();
    super.clearInput();
    this.viewModel = void 0;
    this.widget?.setViewModel(void 0);
    if (input instanceof SessionChangesEditorInput) {
      input.clear();
    }
  }
  focus() {
    super.focus();
    this._pendingFocus.clear();
    const widget = this.widget;
    if (!widget) {
      return;
    }
    const control = widget.getActiveControl();
    if (control) {
      control.focus();
      return;
    }
    this._pendingFocus.value = widget.onDidChangeActiveControl(() => {
      const activeControl = widget.getActiveControl();
      if (activeControl) {
        this._pendingFocus.clear();
        activeControl.focus();
      }
    });
  }
  layout(dimension) {
    const bodyHeight = this._singlePane ? dimension.height : Math.max(0, dimension.height - HEADER_HEIGHT);
    this.widget?.layout(new Dimension(dimension.width, bodyHeight));
  }
};
SessionChangesEditor.ID = SessionChangesEditorInput.EDITOR_ID;
SessionChangesEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ITextResourceConfigurationService),
  __decorateParam(6, IEditorService),
  __decorateParam(7, IEditorGroupsService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IChangesViewService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IAgentWorkbenchLayoutService),
  __decorateParam(12, ISessionChangesService)
], SessionChangesEditor);
const CHANGESET_REVIEW_ACTION_ID = "changeset.review";
class ChangesetReviewActionViewItem extends CheckboxActionViewItem {
  constructor(action, options) {
    super(void 0, action, { ...options, label: true, checkboxStyles: { ...defaultCheckboxStyles, size: 14 } });
  }
  render(container) {
    super.render(container);
    container.classList.add("changeset-review-action");
  }
  updateChecked() {
    super.updateChecked();
    this.updateAriaLabel();
    this.updateTooltip();
  }
  getTooltip() {
    return this.action.checked ? localize("changeset.viewed.tooltip", "Mark as Not Viewed") : localize("changeset.notViewed.tooltip", "Mark as Viewed");
  }
}
export {
  CHANGESET_REVIEW_ACTION_ID,
  SessionChangesEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhbmdlc1xcYnJvd3Nlclxcc2Vzc2lvbkNoYW5nZXNFZGl0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvc2Vzc2lvbkNoYW5nZXNFZGl0b3IuY3NzJztcbmltcG9ydCB7ICQsIGFwcGVuZCwgRGltZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkT2JzZXJ2YWJsZVdpdGhDYWNoZSwgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElEaWZmRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgYmluZENvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9wbGF0Zm9ybU9ic2VydmFibGVVdGlscy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RFZGl0b3JXaXRoVmlld1N0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvcldpdGhWaWV3U3RhdGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3BlbkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cCwgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNdWx0aURpZmZFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvbXVsdGlEaWZmRWRpdG9yL211bHRpRGlmZkVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBNdWx0aURpZmZFZGl0b3JWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvbXVsdGlEaWZmRWRpdG9yL211bHRpRGlmZkVkaXRvclZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBJTXVsdGlEaWZmRWRpdG9yT3B0aW9ucywgSU11bHRpRGlmZkVkaXRvclZpZXdTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9tdWx0aURpZmZFZGl0b3IvbXVsdGlEaWZmRWRpdG9yV2lkZ2V0SW1wbC5qcyc7XG5pbXBvcnQgeyBJRGlmZkVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmVzb3VyY2VMYWJlbCwgSVdvcmtiZW5jaFVJRWxlbWVudEZhY3RvcnksIE11bHRpRGlmZkVkaXRvckl0ZW1MYWJlbEtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvbXVsdGlEaWZmRWRpdG9yL3dvcmtiZW5jaFVJRWxlbWVudEZhY3RvcnkuanMnO1xuaW1wb3J0IHsgTWVudXMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL21lbnVzLmpzJztcbmltcG9ydCB7IElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3dvcmtiZW5jaC5qcyc7XG5pbXBvcnQgeyBBY3RpdmVTZXNzaW9uQ29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vY2hhbmdlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhbmdlc1ZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2NoYW5nZXNWaWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGFuZ2VzQWN0aW9uc0JhciB9IGZyb20gJy4vY2hhbmdlc1ZpZXcuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkNoYW5nZXNFZGl0b3JJbnB1dCB9IGZyb20gJy4vc2Vzc2lvbkNoYW5nZXNFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlIH0gZnJvbSAnLi9zZXNzaW9uQ2hhbmdlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25GaWxlQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgTWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENoZWNrYm94QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0Q2hlY2tib3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhbmdlc0VkaXRvckZpbGVTdGF0cyB9IGZyb20gJy4vY2hhbmdlc0VkaXRvckxhYmVscy5qcyc7XG5cbmNvbnN0IEhFQURFUl9IRUlHSFQgPSAzNTtcblxuLyoqXG4gKiBPcHRpbWl6ZXMgdGhlIGVtYmVkZGVkIGRpZmZzIGZvciB0aGUgbmFycm93IEFnZW50cyB3aW5kb3cgcGFuZWwgd2hpbGVcbiAqIHByZXNlcnZpbmcgdGhlIG11bHRpLWRpZmYgZWRpdG9yJ3MgZXhwYW5kYWJsZSB1bmNoYW5nZWQtcmVnaW9uIHdpZGdldHMuXG4gKi9cbmNvbnN0IENIQU5HRVNfRElGRl9FRElUT1JfT1BUSU9OUzogSURpZmZFZGl0b3JPcHRpb25zID0ge1xuXHRoaWRlT3JpZ2luYWxMaW5lTnVtYmVyczogdHJ1ZSxcblx0Zm9sZGluZzogZmFsc2UsXG5cdGxpbmVOdW1iZXJzTWluQ2hhcnM6IDMsXG59O1xuXG5jbGFzcyBTZXNzaW9uQ2hhbmdlc1VJRWxlbWVudEZhY3RvcnkgaW1wbGVtZW50cyBJV29ya2JlbmNoVUlFbGVtZW50RmFjdG9yeSB7XG5cblx0cmVhZG9ubHkgaGVhZGVyQ2xpY2tUb0NvbGxhcHNlID0gdHJ1ZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNoYW5nZXNPYnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPixcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNoYW5nZXNWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYW5nZXNWaWV3U2VydmljZTogSUNoYW5nZXNWaWV3U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRjcmVhdGVSZXNvdXJjZUxhYmVsKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBraW5kOiBNdWx0aURpZmZFZGl0b3JJdGVtTGFiZWxLaW5kKTogSVJlc291cmNlTGFiZWwge1xuXHRcdGNvbnN0IGxhYmVsID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUxhYmVsLCBlbGVtZW50LCB7fSk7XG5cdFx0Y29uc3Qgc2hvd0RpZmZTdGF0cyA9IGtpbmQgPT09IE11bHRpRGlmZkVkaXRvckl0ZW1MYWJlbEtpbmQuUHJpbWFyeTtcblx0XHRyZXR1cm4gbmV3IFNlc3Npb25DaGFuZ2VzUmVzb3VyY2VMYWJlbChsYWJlbCwgZWxlbWVudCwgc2hvd0RpZmZTdGF0cywgdGhpcy5jaGFuZ2VzT2JzKTtcblx0fVxuXG5cdGhhbmRsZUhlYWRlck1pZGRsZUNsaWNrKHJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldE9icy5nZXQoKT8uY2FwYWJpbGl0aWVzPy5yZXZpZXcgIT09IHRydWUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBgY2hhbmdlc09ic2AgY2FuIHJldGFpbiBhIHN0YWxlIHJvdyBkdXJpbmcgYSBzZXNzaW9uIHN3aXRjaDsgdmFsaWRhdGUgYWdhaW5zdCB0aGUgYWN0aXZlIGNoYW5nZXNldC5cblx0XHRpZiAoIWdldENoYW5nZXNFZGl0b3JGaWxlU3RhdHMocmVzb3VyY2UsIHRoaXMuY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25DaGFuZ2VzT2JzLmdldCgpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHZvaWQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChDSEFOR0VTRVRfUkVWSUVXX0FDVElPTl9JRCwgcmVzb3VyY2UpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Y3JlYXRlVG9vbGJhckFjdGlvblZpZXdJdGVtKGFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucyk6IElBY3Rpb25WaWV3SXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGFjdGlvbi5pZCA9PT0gQ0hBTkdFU0VUX1JFVklFV19BQ1RJT05fSUQgJiYgYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYW5nZXNldFJldmlld0FjdGlvblZpZXdJdGVtLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmNsYXNzIFNlc3Npb25DaGFuZ2VzUmVzb3VyY2VMYWJlbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUmVzb3VyY2VMYWJlbCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSByZXNvdXJjZSA9IG9ic2VydmFibGVWYWx1ZTxVUkkgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsYWJlbDogUmVzb3VyY2VMYWJlbCxcblx0XHRlbGVtZW50OiBIVE1MRWxlbWVudCxcblx0XHRzaG93RGlmZlN0YXRzOiBib29sZWFuLFxuXHRcdGNoYW5nZXNPYnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihsYWJlbCk7XG5cblx0XHRpZiAoc2hvd0RpZmZTdGF0cykge1xuXHRcdFx0Y29uc3Qgc3RhdHNDb250YWluZXIgPSBhcHBlbmQoZWxlbWVudCwgJCgnLnNlc3Npb24tY2hhbmdlcy1maWxlLXN0YXRzJykpO1xuXHRcdFx0Y29uc3QgYWRkZWQgPSBhcHBlbmQoc3RhdHNDb250YWluZXIsICQoJy53b3JraW5nLXNldC1saW5lcy1hZGRlZCcpKTtcblx0XHRcdGNvbnN0IHJlbW92ZWQgPSBhcHBlbmQoc3RhdHNDb250YWluZXIsICQoJy53b3JraW5nLXNldC1saW5lcy1yZW1vdmVkJykpO1xuXHRcdFx0YWRkZWQuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHRyZW1vdmVkLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5yZXNvdXJjZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IHN0YXRzID0gcmVzb3VyY2Vcblx0XHRcdFx0XHQ/IGdldENoYW5nZXNFZGl0b3JGaWxlU3RhdHMocmVzb3VyY2UsIGNoYW5nZXNPYnMucmVhZChyZWFkZXIpKVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0XHRzdGF0c0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gc3RhdHMgPyAnJyA6ICdub25lJztcblx0XHRcdFx0aWYgKHN0YXRzKSB7XG5cdFx0XHRcdFx0YWRkZWQudGV4dENvbnRlbnQgPSBgKyR7c3RhdHMuaW5zZXJ0aW9uc31gO1xuXHRcdFx0XHRcdHJlbW92ZWQudGV4dENvbnRlbnQgPSBgLSR7c3RhdHMuZGVsZXRpb25zfWA7XG5cdFx0XHRcdFx0c3RhdHNDb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ3Nlc3Npb25DaGFuZ2VzRWRpdG9yLmZpbGVDb3VudHMnLCAnezB9IGxpbmVzIGFkZGVkLCB7MX0gbGluZXMgcmVtb3ZlZCcsIHN0YXRzLmluc2VydGlvbnMsIHN0YXRzLmRlbGV0aW9ucykpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFkZGVkLnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHRcdFx0cmVtb3ZlZC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0XHRcdHN0YXRzQ29udGFpbmVyLnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0c2V0VXJpKHVyaTogVVJJIHwgdW5kZWZpbmVkLCBvcHRpb25zOiB7IHN0cmlrZXRocm91Z2g/OiBib29sZWFuIH0gPSB7fSk6IHZvaWQge1xuXHRcdGlmICghdXJpKSB7XG5cdFx0XHR0aGlzLmxhYmVsLmVsZW1lbnQuY2xlYXIoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sYWJlbC5lbGVtZW50LnNldEZpbGUodXJpLCB7IHN0cmlrZXRocm91Z2g6IG9wdGlvbnMuc3RyaWtldGhyb3VnaCB9KTtcblx0XHR9XG5cdFx0dGhpcy5yZXNvdXJjZS5zZXQodXJpLCB1bmRlZmluZWQpO1xuXHR9XG59XG5cbi8qKlxuICogQ2hhbmdlcyBlZGl0b3IgZm9yIHRoZSBBZ2VudHMgd2luZG93OiBhIFwiQnJhbmNoIENoYW5nZXNcIiB2ZXJzaW9ucyBkcm9wZG93biBhbmRcbiAqIGRpZmYgc3RhdHMgaGVhZGVyIHNpdHRpbmcgYWJvdmUgYW4gZW1iZWRkZWQgbXVsdGktZGlmZiBlZGl0b3Igc2hvd2luZyB0aGVcbiAqIHNlc3Npb24ncyBmaWxlIGRpZmZzLlxuICovXG5leHBvcnQgY2xhc3MgU2Vzc2lvbkNoYW5nZXNFZGl0b3IgZXh0ZW5kcyBBYnN0cmFjdEVkaXRvcldpdGhWaWV3U3RhdGU8SU11bHRpRGlmZkVkaXRvclZpZXdTdGF0ZT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9IFNlc3Npb25DaGFuZ2VzRWRpdG9ySW5wdXQuRURJVE9SX0lEO1xuXG5cdHByaXZhdGUgd2lkZ2V0OiBNdWx0aURpZmZFZGl0b3JXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdmlld01vZGVsOiBNdWx0aURpZmZFZGl0b3JWaWV3TW9kZWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYm9keUNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfc2luZ2xlUGFuZSA9IGZhbHNlO1xuXHRwcml2YXRlIF9zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBTZXNzaW9uIHdob3NlIGNoYW5nZXMgdGhpcyBlZGl0b3IgaXMgY3VycmVudGx5IHNob3dpbmcgKGZyb20gaXRzIGlucHV0KS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfaW5wdXRTZXNzaW9uUmVzb3VyY2UgPSBvYnNlcnZhYmxlVmFsdWU8VVJJIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXG5cdC8qKlxuXHQgKiBDaGFuZ2VzIGZvciB0aGlzIGVkaXRvcidzIG93biBzZXNzaW9uLCBzY29wZWQgc28gYSBzdGFsZSByb3cgZG9lcyBub3QgcGlja1xuXHQgKiB1cCB0aGUgY291bnRzIG9mIGEgZGlmZmVyZW50IChnbG9iYWxseSBhY3RpdmUpIHNlc3Npb24gZHVyaW5nIGEgc3dpdGNoLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2NvcGVkQ2hhbmdlc09icyA9IGRlcml2ZWRPYnNlcnZhYmxlV2l0aENhY2hlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPih0aGlzLCAocmVhZGVyLCBsYXN0VmFsdWUpID0+IHtcblx0XHRjb25zdCBlZGl0b3JTZXNzaW9uID0gdGhpcy5faW5wdXRTZXNzaW9uUmVzb3VyY2UucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLmNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uUmVzb3VyY2VPYnMucmVhZChyZWFkZXIpO1xuXHRcdGlmICghZWRpdG9yU2Vzc2lvbiB8fCAhYWN0aXZlU2Vzc2lvbiB8fCAhaXNFcXVhbChlZGl0b3JTZXNzaW9uLCBhY3RpdmVTZXNzaW9uKSkge1xuXHRcdFx0cmV0dXJuIGxhc3RWYWx1ZSA/PyBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25DaGFuZ2VzT2JzLnJlYWQocmVhZGVyKTtcblx0fSk7XG5cblx0LyoqIERlZmVycmVkIGZvY3VzIHJlcXVlc3QgYXdhaXRpbmcgdGhlIGFjdGl2ZSBkaWZmIGVkaXRvciB0byBiZSByZW5kZXJlZC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0ZvY3VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2U6IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDaGFuZ2VzVmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGFuZ2VzVmlld1NlcnZpY2U6IElDaGFuZ2VzVmlld1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlOiBJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihcblx0XHRcdFNlc3Npb25DaGFuZ2VzRWRpdG9yLklELFxuXHRcdFx0Z3JvdXAsXG5cdFx0XHQnc2Vzc2lvbkNoYW5nZXNFZGl0b3JWaWV3U3RhdGUnLFxuXHRcdFx0dGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHR0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdHRoZW1lU2VydmljZSxcblx0XHRcdGVkaXRvclNlcnZpY2UsXG5cdFx0XHRlZGl0b3JHcm91cFNlcnZpY2UsXG5cdFx0KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVFZGl0b3IocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHJvb3QgPSBhcHBlbmQocGFyZW50LCAkKCcuc2Vzc2lvbi1jaGFuZ2VzLWVkaXRvcicpKTtcblxuXHRcdGNvbnN0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQocm9vdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KEFjdGl2ZVNlc3Npb25Db250ZXh0S2V5cy5IYXNHaXRSZXBvc2l0b3J5LCBzY29wZWRDb250ZXh0S2V5U2VydmljZSwgcmVhZGVyID0+XG5cdFx0XHR0aGlzLmNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uSGFzR2l0UmVwb3NpdG9yeU9icy5yZWFkKHJlYWRlcikpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihiaW5kQ29udGV4dEtleShDaGF0Q29udGV4dEtleXMuaGFzQWdlbnRTZXNzaW9uQ2hhbmdlcywgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIHJlYWRlciA9PlxuXHRcdFx0dGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNPYnMucmVhZChyZWFkZXIpLmxlbmd0aCA+IDApKTtcblx0XHRjb25zdCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQoXG5cdFx0XHRuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2VdKSkpO1xuXHRcdHRoaXMuX3Njb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0XHQvLyBJbiBzaW5nbGUtcGFuZSwgdGhlIGhlYWRlciAoQnJhbmNoIENoYW5nZXMgZHJvcGRvd24sIGRpZmYgc3RhdHMgYW5kIHByaW1hcnlcblx0XHQvLyBhY3Rpb25zKSBpcyBob3N0ZWQgYnkgdGhlIGVkaXRvciBwYXJ0J3MgZnVsbC13aWR0aCBoZWFkZXIgaW5zdGVhZCBvZiBpbnNpZGVcblx0XHQvLyB0aGlzIGVkaXRvciwgc28gaXQgc3BhbnMgdGhlIGVkaXRvciBjb250ZW50IGFuZCB0aGUgZG9ja2VkIGRldGFpbCBwYW5lbC5cblx0XHR0aGlzLl9zaW5nbGVQYW5lID0gdGhpcy5sYXlvdXRTZXJ2aWNlLmlzU2luZ2xlUGFuZUxheW91dEVuYWJsZWQ7XG5cdFx0aWYgKCF0aGlzLl9zaW5nbGVQYW5lKSB7XG5cdFx0XHRjb25zdCBoZWFkZXIgPSBhcHBlbmQocm9vdCwgJCgnLnNlc3Npb24tY2hhbmdlcy1lZGl0b3ItaGVhZGVyJykpO1xuXHRcdFx0Y29uc3QgbGVmdCA9IGFwcGVuZChoZWFkZXIsICQoJy5zZXNzaW9uLWNoYW5nZXMtZWRpdG9yLWhlYWRlci1sZWZ0JykpO1xuXHRcdFx0Y29uc3QgcmlnaHQgPSBhcHBlbmQoaGVhZGVyLCAkKCcuc2Vzc2lvbi1jaGFuZ2VzLWVkaXRvci1oZWFkZXItcmlnaHQnKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9idWlsZEhlYWRlclRvb2xiYXJzKGxlZnQsIHJpZ2h0LCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuYm9keUNvbnRhaW5lciA9IGFwcGVuZChyb290LCAkKCcuc2Vzc2lvbi1jaGFuZ2VzLWVkaXRvci1ib2R5JykpO1xuXG5cdFx0Ly8gQ3JlYXRlIHRoZSB3aWRnZXQgaW4gdGhlIGVkaXRvci1wYW5lIGNvbnRleHQgKG5vdCB0aGUgZGVlcGVyIHNjb3BlZCBvbmUpXG5cdFx0Ly8gc28gaXRzIG93biBtdWx0aURpZmZFZGl0b3IqIGNvbnRleHQga2V5cyAoYWxsLWNvbGxhcHNlZCwgcmVuZGVyLXNpZGUtYnktc2lkZSlcblx0XHQvLyBhcmUgdmlzaWJsZSB0byB0aGUgRWRpdG9yVGl0bGUgbWVudSB0aGF0IGRyaXZlcyB0aGUgY29sbGFwc2UvZXhwYW5kLWFsbCBhbmRcblx0XHQvLyBpbmxpbmUtdmlldyB0b2dnbGUgYWN0aW9ucy5cblx0XHRjb25zdCBwYW5lSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKFxuXHRcdFx0bmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIHRoaXMuY29udGV4dEtleVNlcnZpY2VdKSkpO1xuXHRcdHRoaXMud2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIocGFuZUluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0TXVsdGlEaWZmRWRpdG9yV2lkZ2V0LFxuXHRcdFx0dGhpcy5ib2R5Q29udGFpbmVyLFxuXHRcdFx0cGFuZUluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DaGFuZ2VzVUlFbGVtZW50RmFjdG9yeSwgdGhpcy5fc2NvcGVkQ2hhbmdlc09icyksXG5cdFx0XHRDSEFOR0VTX0RJRkZfRURJVE9SX09QVElPTlMsXG5cdFx0KSk7XG5cdFx0dGhpcy5fYXBwbHlSZW5kZXJTaWRlQnlTaWRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZGlmZkVkaXRvci5yZW5kZXJTaWRlQnlTaWRlJykpIHtcblx0XHRcdFx0dGhpcy5fYXBwbHlSZW5kZXJTaWRlQnlTaWRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlSZW5kZXJTaWRlQnlTaWRlKCk6IHZvaWQge1xuXHRcdHRoaXMud2lkZ2V0Py5zZXRSZW5kZXJTaWRlQnlTaWRlKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2RpZmZFZGl0b3IucmVuZGVyU2lkZUJ5U2lkZScpID8/IHRydWUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSBkaWZmIGVkaXRvciBhbmQgY29kZSBlZGl0b3Igc2hvd2luZyB0aGUgZ2l2ZW4gZmlsZSwgbWlycm9yaW5nXG5cdCAqIHtAbGluayBNdWx0aURpZmZFZGl0b3IudHJ5R2V0Q29kZUVkaXRvcn0gc28gZmlsZS10b29sYmFyIGFjdGlvbnMgY2FuIG9wZXJhdGVcblx0ICogb24gdGhpcyBlZGl0b3IgYW5kIHRoZSBwbGFpbiBtdWx0aS1kaWZmIGVkaXRvciB1bmlmb3JtbHkuXG5cdCAqL1xuXHR0cnlHZXRDb2RlRWRpdG9yKHJlc291cmNlOiBVUkkpOiB7IGRpZmZFZGl0b3I6IElEaWZmRWRpdG9yOyBlZGl0b3I6IElDb2RlRWRpdG9yIH0gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLndpZGdldD8udHJ5R2V0Q29kZUVkaXRvcihyZXNvdXJjZSk7XG5cdH1cblxuXHQvKiogQ3JlYXRlcyB0aGUgY2xhc3NpYyAobm9uLXNpbmdsZS1wYW5lKSBpbnRlcm5hbCBoZWFkZXIgdG9vbGJhcnMuICovXG5cdHByaXZhdGUgX2J1aWxkSGVhZGVyVG9vbGJhcnMobGVmdDogSFRNTEVsZW1lbnQsIHJpZ2h0OiBIVE1MRWxlbWVudCwgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdC8vIFRoZSBCcmFuY2ggQ2hhbmdlcyBwaWNrZXIgKyBkaWZmIHN0YXRzIHJlbmRlciBhcyB0aGUgbGVhZGluZyBoZWFkZXIgbWVudTtcblx0XHQvLyB0aGVpciBjdXN0b20gYWN0aW9uIHZpZXcgaXRlbXMgcmVzb2x2ZSBnbG9iYWxseSB2aWEgSUFjdGlvblZpZXdJdGVtU2VydmljZS5cblx0XHRzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIGxlZnQsIE1lbnVzLlNlc3Npb25zRWRpdG9ySGVhZGVyUHJpbWFyeSwge1xuXHRcdFx0bWVudU9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSxcblx0XHR9KSk7XG5cblx0XHQvLyBDcmVhdGUgUHVsbCBSZXF1ZXN0IChhbmQgcmVsYXRlZCkgYWN0aW9ucyByZW5kZXIgb24gdGhlIHJpZ2h0IG9mIHRoZSBoZWFkZXIgcm93LlxuXHRcdHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGFuZ2VzQWN0aW9uc0JhciwgcmlnaHQpKTtcblxuXHRcdHJldHVybiBzdG9yZTtcblx0fVxuXG5cdGdldCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSgpOiBJSW5zdGFudGlhdGlvblNlcnZpY2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zaW5nbGVQYW5lID8gdGhpcy5fc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzZXRJbnB1dChpbnB1dDogU2Vzc2lvbkNoYW5nZXNFZGl0b3JJbnB1dCwgb3B0aW9uczogSU11bHRpRGlmZkVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIGNvbnRleHQ6IElFZGl0b3JPcGVuQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgc3VwZXIuc2V0SW5wdXQoaW5wdXQsIG9wdGlvbnMsIGNvbnRleHQsIHRva2VuKTtcblx0XHR0aGlzLl9pbnB1dFNlc3Npb25SZXNvdXJjZS5zZXQodGhpcy5zZXNzaW9uQ2hhbmdlc1NlcnZpY2UuZ2V0U2Vzc2lvblJlc291cmNlKGlucHV0Lm11bHRpRGlmZlNvdXJjZSksIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gYXdhaXQgaW5wdXQuZ2V0Vmlld01vZGVsKCk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMudmlld01vZGVsID0gdmlld01vZGVsO1xuXG5cdFx0Ly8gQXBwbHkgdGhlIG1vZGVsIGFuZCBhbnkgcmVzdG9yZWQgdmlldyBzdGF0ZSB0b2dldGhlciBzbyB0aGUgd2lkZ2V0J3Ncblx0XHQvLyBhdXRvbWF0aWMgZmlyc3QtY2hhbmdlIG5hdmlnYXRpb24gc2VlcyB0aGUgcmVzdG9yZWQgYWN0aXZlIGl0ZW0gaW5zdGVhZFxuXHRcdC8vIG9mIG5hdmlnYXRpbmcgdG8gKGFuZCBmb2N1c2luZykgdGhlIGZpcnN0IGZpbGUuXG5cdFx0Y29uc3Qgdmlld1N0YXRlID0gdGhpcy5sb2FkRWRpdG9yVmlld1N0YXRlKGlucHV0LCBjb250ZXh0KTtcblx0XHR0aGlzLndpZGdldD8uc2V0Vmlld01vZGVsKHZpZXdNb2RlbCwgeyBwcmVzZXJ2ZUZvY3VzOiBvcHRpb25zPy5wcmVzZXJ2ZUZvY3VzLCB2aWV3U3RhdGUgfSk7XG5cdFx0dGhpcy5fYXBwbHlPcHRpb25zKG9wdGlvbnMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNldEVkaXRvclZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIFRoZSBDaGFuZ2VzIGVkaXRvciBjYW4gYmUgYmFja2dyb3VuZGVkIHdpdGhvdXQgYmVpbmcgY2xlYXJlZCBvciBjbG9zZWRcblx0XHQvLyAoZS5nLiBzd2l0Y2hpbmcgc2Vzc2lvbnMgbWFrZXMgYW5vdGhlciBlZGl0b3IgYWN0aXZlLCBvciB0aGUgZGV0YWlsIHBhbmVsXG5cdFx0Ly8gc3dpdGNoZXMgdG8gRmlsZXMpLiBQZXJzaXN0IGl0cyB2aWV3IHN0YXRlIG9uIGhpZGUgc28gY29sbGFwc2VkL3Njcm9sbFxuXHRcdC8vIHN0YXRlIHN1cnZpdmVzIHJlZ2FyZGxlc3Mgb2YgdGhlIGNsb3NlL29wZW4gb3JkZXJpbmcuXG5cdFx0aWYgKCF2aXNpYmxlKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nRm9jdXMuY2xlYXIoKTtcblx0XHRcdHRoaXMuc2F2ZUN1cnJlbnRFZGl0b3JWaWV3U3RhdGUoKTtcblx0XHR9XG5cdFx0c3VwZXIuc2V0RWRpdG9yVmlzaWJsZSh2aXNpYmxlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjb21wdXRlRWRpdG9yVmlld1N0YXRlKF9yZXNvdXJjZTogVVJJKTogSU11bHRpRGlmZkVkaXRvclZpZXdTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLnZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gbm90aGluZyBsb2FkZWQ6IGRvbid0IG92ZXJ3cml0ZSBhIHNhdmVkIHN0YXRlIHdpdGggYW4gZW1wdHkgc25hcHNob3Rcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMud2lkZ2V0Py5nZXRWaWV3U3RhdGUoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB0cmFja3NFZGl0b3JWaWV3U3RhdGUoaW5wdXQ6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlucHV0IGluc3RhbmNlb2YgU2Vzc2lvbkNoYW5nZXNFZGl0b3JJbnB1dDtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB0cmFja3NEaXNwb3NlZEVkaXRvclZpZXdTdGF0ZSgpOiBib29sZWFuIHtcblx0XHQvLyBUaGUgQ2hhbmdlcyBlZGl0b3IgaXMgcmVjcmVhdGVkIGZyb20gaXRzIHBlci1zZXNzaW9uIHJlc291cmNlIChlLmcuIHdoZW5cblx0XHQvLyBzd2l0Y2hpbmcgc2Vzc2lvbnMgY2xvc2VzL2Rpc3Bvc2VzIHRoZSB0YWIpLCBzbyBrZWVwIHRoZSB2aWV3IHN0YXRlIGFyb3VuZFxuXHRcdC8vIGFmdGVyIHRoZSBpbnB1dCBpcyBkaXNwb3NlZCBhbmQgcmVzdG9yZSBpdCB3aGVuIHRoZSBlZGl0b3IgcmVvcGVucy5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB0b0VkaXRvclZpZXdTdGF0ZVJlc291cmNlKGlucHV0OiBFZGl0b3JJbnB1dCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGlucHV0IGluc3RhbmNlb2YgU2Vzc2lvbkNoYW5nZXNFZGl0b3JJbnB1dCA/IGlucHV0Lm11bHRpRGlmZlNvdXJjZSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbGxhcHNlQWxsRGlmZnMoKTogdm9pZCB7XG5cdFx0dGhpcy52aWV3TW9kZWw/LmNvbGxhcHNlQWxsKCk7XG5cdH1cblxuXHRleHBhbmRBbGxEaWZmcygpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdNb2RlbD8uZXhwYW5kQWxsKCk7XG5cdH1cblxuXHRwdWJsaWMgY29sbGFwc2UocmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLnZpZXdNb2RlbD8uaXRlbXMucmVhZCh1bmRlZmluZWQpXG5cdFx0XHQuZmluZChpID0+IGlzRXF1YWwoaS5tb2RpZmllZFVyaSwgcmVzb3VyY2UpIHx8IGlzRXF1YWwoaS5vcmlnaW5hbFVyaSwgcmVzb3VyY2UpKTtcblx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnZpZXdNb2RlbD8uY29sbGFwc2UoaXRlbSk7XG5cdH1cblxuXHRwdWJsaWMgZXhwYW5kKHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBpdGVtID0gdGhpcy52aWV3TW9kZWw/Lml0ZW1zLnJlYWQodW5kZWZpbmVkKVxuXHRcdFx0LmZpbmQoaSA9PiBpc0VxdWFsKGkubW9kaWZpZWRVcmksIHJlc291cmNlKSB8fCBpc0VxdWFsKGkub3JpZ2luYWxVcmksIHJlc291cmNlKSk7XG5cdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy52aWV3TW9kZWw/LmV4cGFuZChpdGVtKTtcblx0fVxuXG5cblx0b3ZlcnJpZGUgc2V0T3B0aW9ucyhvcHRpb25zOiBJTXVsdGlEaWZmRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2FwcGx5T3B0aW9ucyhvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5T3B0aW9ucyhvcHRpb25zOiBJTXVsdGlEaWZmRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHJldmVhbERhdGEgPSBvcHRpb25zPy52aWV3U3RhdGU/LnJldmVhbERhdGE7XG5cdFx0aWYgKCFyZXZlYWxEYXRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMud2lkZ2V0Py5yZXZlYWwocmV2ZWFsRGF0YS5yZXNvdXJjZSwge1xuXHRcdFx0cmFuZ2U6IHJldmVhbERhdGEucmFuZ2UgPyBSYW5nZS5saWZ0KHJldmVhbERhdGEucmFuZ2UpIDogdW5kZWZpbmVkLFxuXHRcdFx0aGlnaGxpZ2h0OiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgY2xlYXJJbnB1dCgpOiB2b2lkIHtcblx0XHRjb25zdCBpbnB1dCA9IHRoaXMuaW5wdXQ7XG5cdFx0dGhpcy5fcGVuZGluZ0ZvY3VzLmNsZWFyKCk7XG5cdFx0Ly8gTGV0IHRoZSBiYXNlIGNhcHR1cmUgdGhlIGN1cnJlbnQgdmlldyBzdGF0ZSAoaXQgcmVhZHMgdGhlIHdpZGdldCkgYmVmb3JlIHRoZVxuXHRcdC8vIHZpZXcgbW9kZWwgaXMgdG9ybiBkb3duLlxuXHRcdHN1cGVyLmNsZWFySW5wdXQoKTtcblx0XHR0aGlzLnZpZXdNb2RlbCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLndpZGdldD8uc2V0Vmlld01vZGVsKHVuZGVmaW5lZCk7XG5cdFx0aWYgKGlucHV0IGluc3RhbmNlb2YgU2Vzc2lvbkNoYW5nZXNFZGl0b3JJbnB1dCkge1xuXHRcdFx0aW5wdXQuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXHRcdHRoaXMuX3BlbmRpbmdGb2N1cy5jbGVhcigpO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy53aWRnZXQ7XG5cdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sID0gd2lkZ2V0LmdldEFjdGl2ZUNvbnRyb2woKTtcblx0XHRpZiAoY29udHJvbCkge1xuXHRcdFx0Y29udHJvbC5mb2N1cygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBhY3RpdmUgZmlsZSdzIGRpZmYgZWRpdG9yIG1heSBub3QgYmUgcmVuZGVyZWQgeWV0IChlLmcuIHRoZSBlZGl0b3Jcblx0XHQvLyBwYXJ0IHdhcyBqdXN0IHJldmVhbGVkIGZyb20gYSBoaWRkZW4gc3RhdGUpLCBzbyBnZXRBY3RpdmVDb250cm9sKCkgaXNcblx0XHQvLyB1bmRlZmluZWQuIEZvY3VzIGl0IGFzIHNvb24gYXMgaXQgYmVjb21lcyBhdmFpbGFibGUuXG5cdFx0dGhpcy5fcGVuZGluZ0ZvY3VzLnZhbHVlID0gd2lkZ2V0Lm9uRGlkQ2hhbmdlQWN0aXZlQ29udHJvbCgoKSA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVDb250cm9sID0gd2lkZ2V0LmdldEFjdGl2ZUNvbnRyb2woKTtcblx0XHRcdGlmIChhY3RpdmVDb250cm9sKSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdGb2N1cy5jbGVhcigpO1xuXHRcdFx0XHRhY3RpdmVDb250cm9sLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBsYXlvdXQoZGltZW5zaW9uOiBEaW1lbnNpb24pOiB2b2lkIHtcblx0XHQvLyBJbiBzaW5nbGUtcGFuZSB0aGUgaGVhZGVyIGlzIGV4dGVybmFsICh0aGUgZWRpdG9yIHBhcnQgcmVzZXJ2ZXMgYSB0b3AgaW5zZXQpLFxuXHRcdC8vIHNvIHRoZSBkaWZmIGZpbGxzIHRoZSBmdWxsIGRpbWVuc2lvbjsgb3RoZXJ3aXNlIHJlc2VydmUgdGhlIGludGVybmFsIGhlYWRlci5cblx0XHRjb25zdCBib2R5SGVpZ2h0ID0gdGhpcy5fc2luZ2xlUGFuZSA/IGRpbWVuc2lvbi5oZWlnaHQgOiBNYXRoLm1heCgwLCBkaW1lbnNpb24uaGVpZ2h0IC0gSEVBREVSX0hFSUdIVCk7XG5cdFx0dGhpcy53aWRnZXQ/LmxheW91dChuZXcgRGltZW5zaW9uKGRpbWVuc2lvbi53aWR0aCwgYm9keUhlaWdodCkpO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBDSEFOR0VTRVRfUkVWSUVXX0FDVElPTl9JRCA9ICdjaGFuZ2VzZXQucmV2aWV3JztcblxuLyoqXG4gKiBSZW5kZXJzIHRoZSBwZXItZmlsZSBcIk1hcmsgYXMgVmlld2VkXCIgdG9nZ2xlIGluIHRoZSBDaGFuZ2VzIGVkaXRvciBmaWxlIGhlYWRlclxuICogYXMgYSBjaGVja2JveCB3aXRoIGEgc3RhdGljIFwiVmlld2VkXCIgbGFiZWwgKG1pcnJvcmluZyB0aGUgR2l0SHViIHB1bGwgcmVxdWVzdFxuICogXCJWaWV3ZWRcIiBjaGVja2JveCksIGluc3RlYWQgb2YgdGhlIGRlZmF1bHQgaWNvbi1vbmx5IHRvb2xiYXIgYnV0dG9uLiBUaGVcbiAqIGNvbW1hbmQncyB0b2dnbGluZyB0aXRsZSAoXCJNYXJrIGFzIFZpZXdlZFwiIC8gXCJNYXJrIGFzIE5vdCBWaWV3ZWRcIikgaXMga2VwdCBhc1xuICogdGhlIGFjY2Vzc2libGUgbmFtZSBzbyB0aGUgYWN0aW9uIGlzIGFubm91bmNlZCwgd2hpbGUgdGhlIGNoZWNrYm94IHN0YXRlXG4gKiBjb252ZXlzIHRoZSByZXZpZXdlZCBzdGF0ZS5cbiAqL1xuY2xhc3MgQ2hhbmdlc2V0UmV2aWV3QWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBDaGVja2JveEFjdGlvblZpZXdJdGVtIHtcblxuXHRjb25zdHJ1Y3RvcihhY3Rpb246IE1lbnVJdGVtQWN0aW9uLCBvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zKSB7XG5cdFx0c3VwZXIodW5kZWZpbmVkLCBhY3Rpb24sIHsgLi4ub3B0aW9ucywgbGFiZWw6IHRydWUsIGNoZWNrYm94U3R5bGVzOiB7IC4uLmRlZmF1bHRDaGVja2JveFN0eWxlcywgc2l6ZTogMTQgfSB9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NoYW5nZXNldC1yZXZpZXctYWN0aW9uJyk7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVDaGVja2VkKCk6IHZvaWQge1xuXHRcdHN1cGVyLnVwZGF0ZUNoZWNrZWQoKTtcblxuXHRcdHRoaXMudXBkYXRlQXJpYUxhYmVsKCk7XG5cdFx0dGhpcy51cGRhdGVUb29sdGlwKCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRUb29sdGlwKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aW9uLmNoZWNrZWRcblx0XHRcdD8gbG9jYWxpemUoJ2NoYW5nZXNldC52aWV3ZWQudG9vbHRpcCcsIFwiTWFyayBhcyBOb3QgVmlld2VkXCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdjaGFuZ2VzZXQubm90Vmlld2VkLnRvb2x0aXAnLCBcIk1hcmsgYXMgVmlld2VkXCIpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLEdBQUcsUUFBUSxpQkFBaUI7QUFFckMsU0FBUyxZQUFZLGlCQUE4Qix5QkFBeUI7QUFDNUUsU0FBUyxTQUFTLDRCQUF5Qyx1QkFBdUI7QUFDbEYsU0FBUyxhQUFhO0FBSXRCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMscUJBQXFCO0FBRzlCLFNBQVMsdUJBQXVCO0FBQ2hD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
