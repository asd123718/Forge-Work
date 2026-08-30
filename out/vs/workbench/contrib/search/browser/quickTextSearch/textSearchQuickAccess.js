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
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ResourceSet } from "../../../../../base/common/map.js";
import { basenameOrAuthority, dirname } from "../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { getSelectionKeyboardEvent } from "../../../../../platform/list/browser/listService.js";
import { PickerQuickAccessProvider, TriggerAction } from "../../../../../platform/quickinput/browser/pickerQuickAccess.js";
import { DefaultQuickAccessFilterValue } from "../../../../../platform/quickinput/common/quickAccess.js";
import { QuickInputButtonLocation, QuickInputHideReason } from "../../../../../platform/quickinput/common/quickInput.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { searchDetailsIcon, searchOpenInFileIcon, searchActivityBarIcon } from "../searchIcons.js";
import { getEditorSelectionFromMatch } from "../searchView.js";
import { getOutOfWorkspaceEditorResources } from "../../common/search.js";
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from "../../../../services/editor/common/editorService.js";
import { QueryBuilder } from "../../../../services/search/common/queryBuilder.js";
import { VIEW_ID } from "../../../../services/search/common/search.js";
import { Event } from "../../../../../base/common/event.js";
import { PickerEditorState } from "../../../../browser/quickaccess.js";
import { IViewsService } from "../../../../services/views/common/viewsService.js";
import { Sequencer } from "../../../../../base/common/async.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { SearchModelImpl } from "../searchTreeModel/searchModel.js";
import { SearchModelLocation } from "../searchTreeModel/searchTreeCommon.js";
import { searchComparer } from "../searchCompare.js";
const TEXT_SEARCH_QUICK_ACCESS_PREFIX = "%";
const DEFAULT_TEXT_QUERY_BUILDER_OPTIONS = {
  _reason: "quickAccessSearch",
  disregardIgnoreFiles: false,
  disregardExcludeSettings: false,
  onlyOpenEditors: false,
  expandPatterns: true
};
const MAX_FILES_SHOWN = 30;
const MAX_RESULTS_PER_FILE = 10;
const DEBOUNCE_DELAY = 75;
let TextSearchQuickAccess = class extends PickerQuickAccessProvider {
  constructor(_instantiationService, _contextService, _editorService, _labelService, _viewsService, _configurationService) {
    super(TEXT_SEARCH_QUICK_ACCESS_PREFIX, { canAcceptInBackground: true, shouldSkipTrimPickFilter: true });
    this._instantiationService = _instantiationService;
    this._contextService = _contextService;
    this._editorService = _editorService;
    this._labelService = _labelService;
    this._viewsService = _viewsService;
    this._configurationService = _configurationService;
    this.currentAsyncSearch = Promise.resolve({
      results: [],
      messages: []
    });
    this.queryBuilder = this._instantiationService.createInstance(QueryBuilder);
    this.searchModel = this._register(this._instantiationService.createInstance(SearchModelImpl));
    this.editorViewState = this._register(this._instantiationService.createInstance(PickerEditorState));
    this.searchModel.location = SearchModelLocation.QUICK_ACCESS;
    this.editorSequencer = new Sequencer();
  }
  _getTextQueryBuilderOptions(charsPerLine) {
    return {
      ...DEFAULT_TEXT_QUERY_BUILDER_OPTIONS,
      ...{
        extraFileResources: this._instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
        maxResults: this.configuration.maxResults ?? void 0,
        isSmartCase: this.configuration.smartCase
      },
      previewOptions: {
        matchLines: 1,
        charsPerLine
      }
    };
  }
  dispose() {
    this.searchModel.dispose();
    super.dispose();
  }
  provide(picker, token, runOptions) {
    const disposables = new DisposableStore();
    if (TEXT_SEARCH_QUICK_ACCESS_PREFIX.length < picker.value.length) {
      picker.valueSelection = [TEXT_SEARCH_QUICK_ACCESS_PREFIX.length, picker.value.length];
    }
    picker.buttons = [{
      location: QuickInputButtonLocation.Inline,
      iconClass: ThemeIcon.asClassName(Codicon.goToSearch),
      tooltip: localize("goToSearch", "Open in Search View")
    }];
    this.editorViewState.reset();
    disposables.add(picker.onDidTriggerButton(async () => {
      await this.moveToSearchViewlet(void 0);
      picker.hide();
    }));
    const onDidChangeActive = () => {
      const [item] = picker.activeItems;
      if (item?.match) {
        this.editorViewState.set();
        const itemMatch = item.match;
        this.editorSequencer.queue(async () => {
          await this.editorViewState.openTransientEditor({
            resource: itemMatch.parent().resource,
            options: { preserveFocus: true, revealIfOpened: true, ignoreError: true, selection: itemMatch.range() }
          });
        });
      }
    };
    disposables.add(Event.debounce(picker.onDidChangeActive, (last, event) => event, DEBOUNCE_DELAY, true)(onDidChangeActive));
    disposables.add(Event.once(picker.onWillHide)(({ reason }) => {
      if (reason === QuickInputHideReason.Gesture) {
        this.editorViewState.restore();
      }
    }));
    disposables.add(Event.once(picker.onDidHide)(({ reason }) => {
      this.searchModel.searchResult.toggleHighlights(false);
    }));
    disposables.add(super.provide(picker, token, runOptions));
    disposables.add(picker.onDidAccept(() => this.searchModel.searchResult.toggleHighlights(false)));
    return disposables;
  }
  get configuration() {
    const editorConfig = this._configurationService.getValue().workbench?.editor;
    const searchConfig = this._configurationService.getValue().search;
    return {
      openEditorPinned: !editorConfig?.enablePreviewFromQuickOpen || !editorConfig?.enablePreview,
      preserveInput: searchConfig.quickAccess.preserveInput,
      maxResults: searchConfig.maxResults,
      smartCase: searchConfig.smartCase,
      sortOrder: searchConfig.sortOrder
    };
  }
  get defaultFilterValue() {
    if (this.configuration.preserveInput) {
      return DefaultQuickAccessFilterValue.LAST;
    }
    return void 0;
  }
  doSearch(contentPattern, token) {
    if (contentPattern === "") {
      return void 0;
    }
    const folderResources = this._contextService.getWorkspace().folders;
    const content = {
      pattern: contentPattern
    };
    this.searchModel.searchResult.toggleHighlights(false);
    const charsPerLine = content.isRegExp ? 1e4 : 1e3;
    const query = this.queryBuilder.text(content, folderResources.map((folder) => folder.uri), this._getTextQueryBuilderOptions(charsPerLine));
    const result = this.searchModel.search(query, void 0, token);
    const getAsyncResults = async () => {
      this.currentAsyncSearch = result.asyncResults;
      await result.asyncResults;
      const syncResultURIs = new ResourceSet(result.syncResults.map((e) => e.resource));
      return this.searchModel.searchResult.matches(false).filter((e) => !syncResultURIs.has(e.resource));
    };
    return {
      syncResults: this.searchModel.searchResult.matches(false),
      asyncResults: getAsyncResults()
    };
  }
  async moveToSearchViewlet(currentElem) {
    this._viewsService.openView(VIEW_ID, false);
    const viewlet = this._viewsService.getActiveViewWithId(VIEW_ID);
    await viewlet.replaceSearchModel(this.searchModel, this.currentAsyncSearch);
    this.searchModel = this._instantiationService.createInstance(SearchModelImpl);
    this.searchModel.location = SearchModelLocation.QUICK_ACCESS;
    const viewer = viewlet?.getControl();
    if (currentElem && viewer && viewer.hasNode(currentElem)) {
      viewer.setFocus([currentElem], getSelectionKeyboardEvent());
      viewer.setSelection([currentElem], getSelectionKeyboardEvent());
      viewer.reveal(currentElem);
    } else {
      viewlet.searchAndReplaceWidget.focus();
    }
  }
  _getPicksFromMatches(matches, limit, firstFile) {
    matches = matches.sort((a, b) => {
      if (firstFile) {
        if (firstFile === a.resource) {
          return -1;
        } else if (firstFile === b.resource) {
          return 1;
        }
      }
      return searchComparer(a, b, this.configuration.sortOrder);
    });
    const files = matches.length > limit ? matches.slice(0, limit) : matches;
    const picks = [];
    for (let fileIndex = 0; fileIndex < matches.length; fileIndex++) {
      if (fileIndex === limit) {
        picks.push({
          type: "separator"
        });
        picks.push({
          label: localize("QuickSearchSeeMoreFiles", "See More Files"),
          iconClass: ThemeIcon.asClassName(searchDetailsIcon),
          accept: async () => {
            await this.moveToSearchViewlet(matches[limit]);
          }
        });
        break;
      }
      const iFileInstanceMatch = files[fileIndex];
      const label = basenameOrAuthority(iFileInstanceMatch.resource);
      const description = this._labelService.getUriLabel(dirname(iFileInstanceMatch.resource), { relative: true });
      picks.push({
        label,
        type: "separator",
        description,
        buttons: [{
          iconClass: ThemeIcon.asClassName(searchOpenInFileIcon),
          tooltip: localize("QuickSearchOpenInFile", "Open File")
        }],
        trigger: async () => {
          await this.handleAccept(iFileInstanceMatch, {});
          return TriggerAction.CLOSE_PICKER;
        }
      });
      const results = iFileInstanceMatch.matches() ?? [];
      for (let matchIndex = 0; matchIndex < results.length; matchIndex++) {
        const element = results[matchIndex];
        if (matchIndex === MAX_RESULTS_PER_FILE) {
          picks.push({
            label: localize("QuickSearchMore", "More"),
            iconClass: ThemeIcon.asClassName(searchDetailsIcon),
            accept: async () => {
              await this.moveToSearchViewlet(element);
            }
          });
          break;
        }
        const preview = element.preview();
        const previewText = (preview.before + preview.inside + preview.after).trim().substring(0, 999);
        const match = [{
          start: preview.before.length,
          end: preview.before.length + preview.inside.length
        }];
        picks.push({
          label: `${previewText}`,
          highlights: {
            label: match
          },
          buttons: [{
            iconClass: ThemeIcon.asClassName(searchActivityBarIcon),
            tooltip: localize("showMore", "Open in Search View")
          }],
          ariaLabel: `Match at location ${element.range().startLineNumber}:${element.range().startColumn} - ${previewText}`,
          accept: async (keyMods, event) => {
            await this.handleAccept(iFileInstanceMatch, {
              keyMods,
              selection: getEditorSelectionFromMatch(element, this.searchModel),
              preserveFocus: event.inBackground,
              forcePinned: event.inBackground
            });
          },
          trigger: async () => {
            await this.moveToSearchViewlet(element);
            return TriggerAction.CLOSE_PICKER;
          },
          match: element
        });
      }
    }
    return picks;
  }
  async handleAccept(iFileInstanceMatch, options) {
    const editorOptions = {
      preserveFocus: options.preserveFocus,
      pinned: options.keyMods?.ctrlCmd || options.forcePinned || this.configuration.openEditorPinned,
      selection: options.selection
    };
    const targetGroup = options.keyMods?.alt || this.configuration.openEditorPinned && options.keyMods?.ctrlCmd || options.forceOpenSideBySide ? SIDE_GROUP : ACTIVE_GROUP;
    await this._editorService.openEditor({
      resource: iFileInstanceMatch.resource,
      options: editorOptions
    }, targetGroup);
  }
  _getPicks(contentPattern, disposables, token) {
    const searchModelAtTimeOfSearch = this.searchModel;
    if (contentPattern === "") {
      this.searchModel.searchResult.clear();
      return [{
        label: localize("enterSearchTerm", "Enter a term to search for across your files.")
      }];
    }
    const conditionalTokenCts = disposables.add(new CancellationTokenSource());
    disposables.add(token.onCancellationRequested(() => {
      if (searchModelAtTimeOfSearch.location === SearchModelLocation.QUICK_ACCESS) {
        conditionalTokenCts.cancel();
      }
    }));
    const allMatches = this.doSearch(contentPattern, conditionalTokenCts.token);
    if (!allMatches) {
      return null;
    }
    const matches = allMatches.syncResults;
    const syncResult = this._getPicksFromMatches(matches, MAX_FILES_SHOWN, this._editorService.activeEditor?.resource);
    if (syncResult.length > 0) {
      this.searchModel.searchResult.toggleHighlights(true);
    }
    if (matches.length >= MAX_FILES_SHOWN) {
      return syncResult;
    }
    return {
      picks: syncResult,
      additionalPicks: allMatches.asyncResults.then((asyncResults) => asyncResults.length + syncResult.length === 0 ? [{
        label: localize("noAnythingResults", "No matching results")
      }] : this._getPicksFromMatches(asyncResults, MAX_FILES_SHOWN - matches.length)).then((picks) => {
        if (picks.length > 0) {
          this.searchModel.searchResult.toggleHighlights(true);
        }
        return picks;
      })
    };
  }
};
TextSearchQuickAccess = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, ILabelService),
  __decorateParam(4, IViewsService),
  __decorateParam(5, IConfigurationService)
], TextSearchQuickAccess);
export {
  TEXT_SEARCH_QUICK_ACCESS_PREFIX,
  TextSearchQuickAccess
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaFxcYnJvd3NlclxccXVpY2tUZXh0U2VhcmNoXFx0ZXh0U2VhcmNoUXVpY2tBY2Nlc3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWVPckF1dGhvcml0eSwgZGlybmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVRleHRFZGl0b3JTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZSwgZ2V0U2VsZWN0aW9uS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBGYXN0QW5kU2xvd1BpY2tzLCBJUGlja2VyUXVpY2tBY2Nlc3NJdGVtLCBJUGlja2VyUXVpY2tBY2Nlc3NTZXBhcmF0b3IsIFBpY2tlclF1aWNrQWNjZXNzUHJvdmlkZXIsIFBpY2tzLCBUcmlnZ2VyQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9icm93c2VyL3BpY2tlclF1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IERlZmF1bHRRdWlja0FjY2Vzc0ZpbHRlclZhbHVlLCBJUXVpY2tBY2Nlc3NQcm92aWRlclJ1bk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBJS2V5TW9kcywgSVF1aWNrUGljaywgSVF1aWNrUGlja0l0ZW0sIFF1aWNrSW5wdXRCdXR0b25Mb2NhdGlvbiwgUXVpY2tJbnB1dEhpZGVSZWFzb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFZGl0b3JDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBzZWFyY2hEZXRhaWxzSWNvbiwgc2VhcmNoT3BlbkluRmlsZUljb24sIHNlYXJjaEFjdGl2aXR5QmFySWNvbiB9IGZyb20gJy4uL3NlYXJjaEljb25zLmpzJztcbmltcG9ydCB7IFNlYXJjaFZpZXcsIGdldEVkaXRvclNlbGVjdGlvbkZyb21NYXRjaCB9IGZyb20gJy4uL3NlYXJjaFZpZXcuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaFNlYXJjaENvbmZpZ3VyYXRpb24sIGdldE91dE9mV29ya3NwYWNlRWRpdG9yUmVzb3VyY2VzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBBQ1RJVkVfR1JPVVAsIElFZGl0b3JTZXJ2aWNlLCBTSURFX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucywgUXVlcnlCdWlsZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9xdWVyeUJ1aWxkZXIuanMnO1xuaW1wb3J0IHsgSVBhdHRlcm5JbmZvLCBJU2VhcmNoQ29tcGxldGUsIElUZXh0UXVlcnksIFZJRVdfSUQgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFBpY2tlckVkaXRvclN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9xdWlja2FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXF1ZW5jZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFNlYXJjaE1vZGVsSW1wbCB9IGZyb20gJy4uL3NlYXJjaFRyZWVNb2RlbC9zZWFyY2hNb2RlbC5qcyc7XG5pbXBvcnQgeyBTZWFyY2hNb2RlbExvY2F0aW9uLCBSZW5kZXJhYmxlTWF0Y2gsIElTZWFyY2hUcmVlRmlsZU1hdGNoLCBJU2VhcmNoVHJlZU1hdGNoLCBJU2VhcmNoUmVzdWx0IH0gZnJvbSAnLi4vc2VhcmNoVHJlZU1vZGVsL3NlYXJjaFRyZWVDb21tb24uanMnO1xuaW1wb3J0IHsgc2VhcmNoQ29tcGFyZXIgfSBmcm9tICcuLi9zZWFyY2hDb21wYXJlLmpzJztcbmltcG9ydCB7IElNYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuXG5leHBvcnQgY29uc3QgVEVYVF9TRUFSQ0hfUVVJQ0tfQUNDRVNTX1BSRUZJWCA9ICclJztcblxuY29uc3QgREVGQVVMVF9URVhUX1FVRVJZX0JVSUxERVJfT1BUSU9OUzogSVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zID0ge1xuXHRfcmVhc29uOiAncXVpY2tBY2Nlc3NTZWFyY2gnLFxuXHRkaXNyZWdhcmRJZ25vcmVGaWxlczogZmFsc2UsXG5cdGRpc3JlZ2FyZEV4Y2x1ZGVTZXR0aW5nczogZmFsc2UsXG5cdG9ubHlPcGVuRWRpdG9yczogZmFsc2UsXG5cdGV4cGFuZFBhdHRlcm5zOiB0cnVlXG59O1xuXG5jb25zdCBNQVhfRklMRVNfU0hPV04gPSAzMDtcbmNvbnN0IE1BWF9SRVNVTFRTX1BFUl9GSUxFID0gMTA7XG5jb25zdCBERUJPVU5DRV9ERUxBWSA9IDc1O1xuXG5pbnRlcmZhY2UgSVRleHRTZWFyY2hRdWlja0FjY2Vzc0l0ZW0gZXh0ZW5kcyBJUGlja2VyUXVpY2tBY2Nlc3NJdGVtIHtcblx0bWF0Y2g/OiBJU2VhcmNoVHJlZU1hdGNoO1xufVxuZXhwb3J0IGNsYXNzIFRleHRTZWFyY2hRdWlja0FjY2VzcyBleHRlbmRzIFBpY2tlclF1aWNrQWNjZXNzUHJvdmlkZXI8SVRleHRTZWFyY2hRdWlja0FjY2Vzc0l0ZW0+IHtcblxuXHRwcml2YXRlIGVkaXRvclNlcXVlbmNlcjogU2VxdWVuY2VyO1xuXHRwcml2YXRlIHF1ZXJ5QnVpbGRlcjogUXVlcnlCdWlsZGVyO1xuXHRwcml2YXRlIHNlYXJjaE1vZGVsOiBTZWFyY2hNb2RlbEltcGw7XG5cdHByaXZhdGUgY3VycmVudEFzeW5jU2VhcmNoOiBQcm9taXNlPElTZWFyY2hDb21wbGV0ZT4gPSBQcm9taXNlLnJlc29sdmUoe1xuXHRcdHJlc3VsdHM6IFtdLFxuXHRcdG1lc3NhZ2VzOiBbXVxuXHR9KTtcblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JWaWV3U3RhdGU6IFBpY2tlckVkaXRvclN0YXRlO1xuXG5cdHByaXZhdGUgX2dldFRleHRRdWVyeUJ1aWxkZXJPcHRpb25zKGNoYXJzUGVyTGluZTogbnVtYmVyKTogSVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uREVGQVVMVF9URVhUX1FVRVJZX0JVSUxERVJfT1BUSU9OUyxcblx0XHRcdC4uLiB7XG5cdFx0XHRcdGV4dHJhRmlsZVJlc291cmNlczogdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZ2V0T3V0T2ZXb3Jrc3BhY2VFZGl0b3JSZXNvdXJjZXMpLFxuXHRcdFx0XHRtYXhSZXN1bHRzOiB0aGlzLmNvbmZpZ3VyYXRpb24ubWF4UmVzdWx0cyA/PyB1bmRlZmluZWQsXG5cdFx0XHRcdGlzU21hcnRDYXNlOiB0aGlzLmNvbmZpZ3VyYXRpb24uc21hcnRDYXNlLFxuXHRcdFx0fSxcblxuXHRcdFx0cHJldmlld09wdGlvbnM6IHtcblx0XHRcdFx0bWF0Y2hMaW5lczogMSxcblx0XHRcdFx0Y2hhcnNQZXJMaW5lXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASVZpZXdzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF92aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKFRFWFRfU0VBUkNIX1FVSUNLX0FDQ0VTU19QUkVGSVgsIHsgY2FuQWNjZXB0SW5CYWNrZ3JvdW5kOiB0cnVlLCBzaG91bGRTa2lwVHJpbVBpY2tGaWx0ZXI6IHRydWUgfSk7XG5cblx0XHR0aGlzLnF1ZXJ5QnVpbGRlciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFF1ZXJ5QnVpbGRlcik7XG5cdFx0dGhpcy5zZWFyY2hNb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlYXJjaE1vZGVsSW1wbCkpO1xuXHRcdHRoaXMuZWRpdG9yVmlld1N0YXRlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUGlja2VyRWRpdG9yU3RhdGUpKTtcblx0XHR0aGlzLnNlYXJjaE1vZGVsLmxvY2F0aW9uID0gU2VhcmNoTW9kZWxMb2NhdGlvbi5RVUlDS19BQ0NFU1M7XG5cdFx0dGhpcy5lZGl0b3JTZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuc2VhcmNoTW9kZWwuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHByb3ZpZGUocGlja2VyOiBJUXVpY2tQaWNrPElUZXh0U2VhcmNoUXVpY2tBY2Nlc3NJdGVtLCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgcnVuT3B0aW9ucz86IElRdWlja0FjY2Vzc1Byb3ZpZGVyUnVuT3B0aW9ucyk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRpZiAoVEVYVF9TRUFSQ0hfUVVJQ0tfQUNDRVNTX1BSRUZJWC5sZW5ndGggPCBwaWNrZXIudmFsdWUubGVuZ3RoKSB7XG5cdFx0XHRwaWNrZXIudmFsdWVTZWxlY3Rpb24gPSBbVEVYVF9TRUFSQ0hfUVVJQ0tfQUNDRVNTX1BSRUZJWC5sZW5ndGgsIHBpY2tlci52YWx1ZS5sZW5ndGhdO1xuXHRcdH1cblx0XHRwaWNrZXIuYnV0dG9ucyA9IFt7XG5cdFx0XHRsb2NhdGlvbjogUXVpY2tJbnB1dEJ1dHRvbkxvY2F0aW9uLklubGluZSxcblx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZ29Ub1NlYXJjaCksXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnZ29Ub1NlYXJjaCcsIFwiT3BlbiBpbiBTZWFyY2ggVmlld1wiKVxuXHRcdH1dO1xuXHRcdHRoaXMuZWRpdG9yVmlld1N0YXRlLnJlc2V0KCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZFRyaWdnZXJCdXR0b24oYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy5tb3ZlVG9TZWFyY2hWaWV3bGV0KHVuZGVmaW5lZCk7XG5cdFx0XHRwaWNrZXIuaGlkZSgpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlQWN0aXZlID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgW2l0ZW1dID0gcGlja2VyLmFjdGl2ZUl0ZW1zO1xuXG5cdFx0XHRpZiAoaXRlbT8ubWF0Y2gpIHtcblx0XHRcdFx0Ly8gd2UgbXVzdCByZW1lbWJlciBvdXIgY3VycmV0IHZpZXcgc3RhdGUgdG8gYmUgYWJsZSB0byByZXN0b3JlICh3aWxsIGF1dG9tYXRpY2FsbHkgdHJhY2sgaWYgdGhlcmUgaXMgYWxyZWFkeSBzdG9yZWQgc3RhdGUpXG5cdFx0XHRcdHRoaXMuZWRpdG9yVmlld1N0YXRlLnNldCgpO1xuXHRcdFx0XHRjb25zdCBpdGVtTWF0Y2ggPSBpdGVtLm1hdGNoO1xuXHRcdFx0XHR0aGlzLmVkaXRvclNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5lZGl0b3JWaWV3U3RhdGUub3BlblRyYW5zaWVudEVkaXRvcih7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogaXRlbU1hdGNoLnBhcmVudCgpLnJlc291cmNlLFxuXHRcdFx0XHRcdFx0b3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlLCByZXZlYWxJZk9wZW5lZDogdHJ1ZSwgaWdub3JlRXJyb3I6IHRydWUsIHNlbGVjdGlvbjogaXRlbU1hdGNoLnJhbmdlKCkgfVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50LmRlYm91bmNlKHBpY2tlci5vbkRpZENoYW5nZUFjdGl2ZSwgKGxhc3QsIGV2ZW50KSA9PiBldmVudCwgREVCT1VOQ0VfREVMQVksIHRydWUpKG9uRGlkQ2hhbmdlQWN0aXZlKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50Lm9uY2UocGlja2VyLm9uV2lsbEhpZGUpKCh7IHJlYXNvbiB9KSA9PiB7XG5cdFx0XHQvLyBSZXN0b3JlIHZpZXcgc3RhdGUgdXBvbiBjYW5jZWxsYXRpb24gaWYgd2UgY2hhbmdlZCBpdFxuXHRcdFx0Ly8gYnV0IG9ubHkgd2hlbiB0aGUgcGlja2VyIHdhcyBjbG9zZWQgdmlhIGV4cGxpY2l0IHVzZXJcblx0XHRcdC8vIGdlc3R1cmUgYW5kIG5vdCBlLmcuIHdoZW4gZm9jdXMgd2FzIGxvc3QgYmVjYXVzZSB0aGF0XG5cdFx0XHQvLyBjb3VsZCBtZWFuIHRoZSB1c2VyIGNsaWNrZWQgaW50byB0aGUgZWRpdG9yIGRpcmVjdGx5LlxuXHRcdFx0aWYgKHJlYXNvbiA9PT0gUXVpY2tJbnB1dEhpZGVSZWFzb24uR2VzdHVyZSkge1xuXHRcdFx0XHR0aGlzLmVkaXRvclZpZXdTdGF0ZS5yZXN0b3JlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50Lm9uY2UocGlja2VyLm9uRGlkSGlkZSkoKHsgcmVhc29uIH0pID0+IHtcblx0XHRcdHRoaXMuc2VhcmNoTW9kZWwuc2VhcmNoUmVzdWx0LnRvZ2dsZUhpZ2hsaWdodHMoZmFsc2UpO1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChzdXBlci5wcm92aWRlKHBpY2tlciwgdG9rZW4sIHJ1bk9wdGlvbnMpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkQWNjZXB0KCgpID0+IHRoaXMuc2VhcmNoTW9kZWwuc2VhcmNoUmVzdWx0LnRvZ2dsZUhpZ2hsaWdodHMoZmFsc2UpKSk7XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgY29uZmlndXJhdGlvbigpIHtcblx0XHRjb25zdCBlZGl0b3JDb25maWcgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJV29ya2JlbmNoRWRpdG9yQ29uZmlndXJhdGlvbj4oKS53b3JrYmVuY2g/LmVkaXRvcjtcblx0XHRjb25zdCBzZWFyY2hDb25maWcgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJV29ya2JlbmNoU2VhcmNoQ29uZmlndXJhdGlvbj4oKS5zZWFyY2g7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0b3BlbkVkaXRvclBpbm5lZDogIWVkaXRvckNvbmZpZz8uZW5hYmxlUHJldmlld0Zyb21RdWlja09wZW4gfHwgIWVkaXRvckNvbmZpZz8uZW5hYmxlUHJldmlldyxcblx0XHRcdHByZXNlcnZlSW5wdXQ6IHNlYXJjaENvbmZpZy5xdWlja0FjY2Vzcy5wcmVzZXJ2ZUlucHV0LFxuXHRcdFx0bWF4UmVzdWx0czogc2VhcmNoQ29uZmlnLm1heFJlc3VsdHMsXG5cdFx0XHRzbWFydENhc2U6IHNlYXJjaENvbmZpZy5zbWFydENhc2UsXG5cdFx0XHRzb3J0T3JkZXI6IHNlYXJjaENvbmZpZy5zb3J0T3JkZXIsXG5cdFx0fTtcblx0fVxuXG5cdGdldCBkZWZhdWx0RmlsdGVyVmFsdWUoKTogRGVmYXVsdFF1aWNrQWNjZXNzRmlsdGVyVmFsdWUgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb24ucHJlc2VydmVJbnB1dCkge1xuXHRcdFx0cmV0dXJuIERlZmF1bHRRdWlja0FjY2Vzc0ZpbHRlclZhbHVlLkxBU1Q7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZG9TZWFyY2goY29udGVudFBhdHRlcm46IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKToge1xuXHRcdHN5bmNSZXN1bHRzOiBJU2VhcmNoVHJlZUZpbGVNYXRjaFtdO1xuXHRcdGFzeW5jUmVzdWx0czogUHJvbWlzZTxJU2VhcmNoVHJlZUZpbGVNYXRjaFtdPjtcblx0fSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGNvbnRlbnRQYXR0ZXJuID09PSAnJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBmb2xkZXJSZXNvdXJjZXM6IElXb3Jrc3BhY2VGb2xkZXJbXSA9IHRoaXMuX2NvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0Y29uc3QgY29udGVudDogSVBhdHRlcm5JbmZvID0ge1xuXHRcdFx0cGF0dGVybjogY29udGVudFBhdHRlcm4sXG5cdFx0fTtcblx0XHR0aGlzLnNlYXJjaE1vZGVsLnNlYXJjaFJlc3VsdC50b2dnbGVIaWdobGlnaHRzKGZhbHNlKTtcblx0XHRjb25zdCBjaGFyc1BlckxpbmUgPSBjb250ZW50LmlzUmVnRXhwID8gMTAwMDAgOiAxMDAwOyAvLyBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2Jsb2IvZTdhZDU2NTFhYzI2ZmEwMGE0MGFhMWU0MDEwZTgxYjkyZjY1NTU2OS9zcmMvdnMvd29ya2JlbmNoL2NvbnRyaWIvc2VhcmNoL2Jyb3dzZXIvc2VhcmNoVmlldy50cyNMMTUwOFxuXG5cdFx0Y29uc3QgcXVlcnk6IElUZXh0UXVlcnkgPSB0aGlzLnF1ZXJ5QnVpbGRlci50ZXh0KGNvbnRlbnQsIGZvbGRlclJlc291cmNlcy5tYXAoZm9sZGVyID0+IGZvbGRlci51cmkpLCB0aGlzLl9nZXRUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucyhjaGFyc1BlckxpbmUpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuc2VhcmNoTW9kZWwuc2VhcmNoKHF1ZXJ5LCB1bmRlZmluZWQsIHRva2VuKTtcblxuXHRcdGNvbnN0IGdldEFzeW5jUmVzdWx0cyA9IGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMuY3VycmVudEFzeW5jU2VhcmNoID0gcmVzdWx0LmFzeW5jUmVzdWx0cztcblx0XHRcdGF3YWl0IHJlc3VsdC5hc3luY1Jlc3VsdHM7XG5cdFx0XHRjb25zdCBzeW5jUmVzdWx0VVJJcyA9IG5ldyBSZXNvdXJjZVNldChyZXN1bHQuc3luY1Jlc3VsdHMubWFwKGUgPT4gZS5yZXNvdXJjZSkpO1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VhcmNoTW9kZWwuc2VhcmNoUmVzdWx0Lm1hdGNoZXMoZmFsc2UpLmZpbHRlcihlID0+ICFzeW5jUmVzdWx0VVJJcy5oYXMoZS5yZXNvdXJjZSkpO1xuXHRcdH07XG5cdFx0cmV0dXJuIHtcblx0XHRcdHN5bmNSZXN1bHRzOiB0aGlzLnNlYXJjaE1vZGVsLnNlYXJjaFJlc3VsdC5tYXRjaGVzKGZhbHNlKSxcblx0XHRcdGFzeW5jUmVzdWx0czogZ2V0QXN5bmNSZXN1bHRzKClcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBtb3ZlVG9TZWFyY2hWaWV3bGV0KGN1cnJlbnRFbGVtOiBSZW5kZXJhYmxlTWF0Y2ggfCB1bmRlZmluZWQpIHtcblx0XHQvLyB0aGlzIGZ1bmN0aW9uIHRha2VzIHRoaXMuX3NlYXJjaE1vZGVsIGFuZCBtb3ZlcyBpdCB0byB0aGUgc2VhcmNoIHZpZXdsZXQncyBzZWFyY2ggbW9kZWwuXG5cdFx0Ly8gdGhlbiwgdGhpcy5fc2VhcmNoTW9kZWwgd2lsbCBjb25zdHJ1Y3QgYSBuZXcgKGVtcHR5KSBTZWFyY2hNb2RlbC5cblx0XHR0aGlzLl92aWV3c1NlcnZpY2Uub3BlblZpZXcoVklFV19JRCwgZmFsc2UpO1xuXHRcdGNvbnN0IHZpZXdsZXQ6IFNlYXJjaFZpZXcgfCB1bmRlZmluZWQgPSB0aGlzLl92aWV3c1NlcnZpY2UuZ2V0QWN0aXZlVmlld1dpdGhJZChWSUVXX0lEKSBhcyBTZWFyY2hWaWV3O1xuXHRcdGF3YWl0IHZpZXdsZXQucmVwbGFjZVNlYXJjaE1vZGVsKHRoaXMuc2VhcmNoTW9kZWwsIHRoaXMuY3VycmVudEFzeW5jU2VhcmNoKTtcblxuXHRcdHRoaXMuc2VhcmNoTW9kZWwgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZWFyY2hNb2RlbEltcGwpO1xuXHRcdHRoaXMuc2VhcmNoTW9kZWwubG9jYXRpb24gPSBTZWFyY2hNb2RlbExvY2F0aW9uLlFVSUNLX0FDQ0VTUztcblxuXHRcdGNvbnN0IHZpZXdlcjogV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxJU2VhcmNoUmVzdWx0LCBSZW5kZXJhYmxlTWF0Y2g+IHwgdW5kZWZpbmVkID0gdmlld2xldD8uZ2V0Q29udHJvbCgpO1xuXHRcdC8vIFRoZSBhc3luYyBkYXRhIHRyZWUgbWF5IG5vdCBoYXZlIG1hdGVyaWFsaXplZCBgY3VycmVudEVsZW1gIHlldCAoZS5nLiBpdHMgcGFyZW50XG5cdFx0Ly8gZmlsZSBtYXRjaCBoYXMgbm90IGJlZW4gZXhwYW5kZWQvbG9hZGVkKSwgaW4gd2hpY2ggY2FzZSBzZWxlY3Rpbmcgb3IgcmV2ZWFsaW5nIGl0XG5cdFx0Ly8gdGhyb3dzIGBUcmVlRXJyb3IgW1NlYXJjaFZpZXddIFRyZWUgZWxlbWVudCBub3QgZm91bmRgLiBHdWFyZCBvbiBgaGFzTm9kZWAgYmVmb3JlXG5cdFx0Ly8gdG91Y2hpbmcgdGhlIHRyZWUgYW5kIGZhbGwgYmFjayB0byBmb2N1c2luZyB0aGUgc2VhcmNoIHdpZGdldCBvdGhlcndpc2UuXG5cdFx0aWYgKGN1cnJlbnRFbGVtICYmIHZpZXdlciAmJiB2aWV3ZXIuaGFzTm9kZShjdXJyZW50RWxlbSkpIHtcblx0XHRcdHZpZXdlci5zZXRGb2N1cyhbY3VycmVudEVsZW1dLCBnZXRTZWxlY3Rpb25LZXlib2FyZEV2ZW50KCkpO1xuXHRcdFx0dmlld2VyLnNldFNlbGVjdGlvbihbY3VycmVudEVsZW1dLCBnZXRTZWxlY3Rpb25LZXlib2FyZEV2ZW50KCkpO1xuXHRcdFx0dmlld2VyLnJldmVhbChjdXJyZW50RWxlbSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZpZXdsZXQuc2VhcmNoQW5kUmVwbGFjZVdpZGdldC5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cblx0cHJpdmF0ZSBfZ2V0UGlja3NGcm9tTWF0Y2hlcyhtYXRjaGVzOiBJU2VhcmNoVHJlZUZpbGVNYXRjaFtdLCBsaW1pdDogbnVtYmVyLCBmaXJzdEZpbGU/OiBVUkkpOiAoSVBpY2tlclF1aWNrQWNjZXNzU2VwYXJhdG9yIHwgSVRleHRTZWFyY2hRdWlja0FjY2Vzc0l0ZW0pW10ge1xuXHRcdG1hdGNoZXMgPSBtYXRjaGVzLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGlmIChmaXJzdEZpbGUpIHtcblx0XHRcdFx0aWYgKGZpcnN0RmlsZSA9PT0gYS5yZXNvdXJjZSkge1xuXHRcdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdFx0fSBlbHNlIGlmIChmaXJzdEZpbGUgPT09IGIucmVzb3VyY2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHNlYXJjaENvbXBhcmVyKGEsIGIsIHRoaXMuY29uZmlndXJhdGlvbi5zb3J0T3JkZXIpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZmlsZXMgPSBtYXRjaGVzLmxlbmd0aCA+IGxpbWl0ID8gbWF0Y2hlcy5zbGljZSgwLCBsaW1pdCkgOiBtYXRjaGVzO1xuXHRcdGNvbnN0IHBpY2tzOiBBcnJheTxJVGV4dFNlYXJjaFF1aWNrQWNjZXNzSXRlbSB8IElQaWNrZXJRdWlja0FjY2Vzc1NlcGFyYXRvcj4gPSBbXTtcblxuXHRcdGZvciAobGV0IGZpbGVJbmRleCA9IDA7IGZpbGVJbmRleCA8IG1hdGNoZXMubGVuZ3RoOyBmaWxlSW5kZXgrKykge1xuXHRcdFx0aWYgKGZpbGVJbmRleCA9PT0gbGltaXQpIHtcblxuXHRcdFx0XHRwaWNrcy5wdXNoKHtcblx0XHRcdFx0XHR0eXBlOiAnc2VwYXJhdG9yJyxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cGlja3MucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdRdWlja1NlYXJjaFNlZU1vcmVGaWxlcycsIFwiU2VlIE1vcmUgRmlsZXNcIiksXG5cdFx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoc2VhcmNoRGV0YWlsc0ljb24pLFxuXHRcdFx0XHRcdGFjY2VwdDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5tb3ZlVG9TZWFyY2hWaWV3bGV0KG1hdGNoZXNbbGltaXRdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaUZpbGVJbnN0YW5jZU1hdGNoID0gZmlsZXNbZmlsZUluZGV4XTtcblxuXHRcdFx0Y29uc3QgbGFiZWwgPSBiYXNlbmFtZU9yQXV0aG9yaXR5KGlGaWxlSW5zdGFuY2VNYXRjaC5yZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChkaXJuYW1lKGlGaWxlSW5zdGFuY2VNYXRjaC5yZXNvdXJjZSksIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cblxuXHRcdFx0cGlja3MucHVzaCh7XG5cdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHR0eXBlOiAnc2VwYXJhdG9yJyxcblx0XHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRcdGJ1dHRvbnM6IFt7XG5cdFx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoc2VhcmNoT3BlbkluRmlsZUljb24pLFxuXHRcdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdRdWlja1NlYXJjaE9wZW5JbkZpbGUnLCBcIk9wZW4gRmlsZVwiKVxuXHRcdFx0XHR9XSxcblx0XHRcdFx0dHJpZ2dlcjogYXN5bmMgKCk6IFByb21pc2U8VHJpZ2dlckFjdGlvbj4gPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuaGFuZGxlQWNjZXB0KGlGaWxlSW5zdGFuY2VNYXRjaCwge30pO1xuXHRcdFx0XHRcdHJldHVybiBUcmlnZ2VyQWN0aW9uLkNMT1NFX1BJQ0tFUjtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHRzOiBJU2VhcmNoVHJlZU1hdGNoW10gPSBpRmlsZUluc3RhbmNlTWF0Y2gubWF0Y2hlcygpID8/IFtdO1xuXHRcdFx0Zm9yIChsZXQgbWF0Y2hJbmRleCA9IDA7IG1hdGNoSW5kZXggPCByZXN1bHRzLmxlbmd0aDsgbWF0Y2hJbmRleCsrKSB7XG5cdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSByZXN1bHRzW21hdGNoSW5kZXhdO1xuXG5cdFx0XHRcdGlmIChtYXRjaEluZGV4ID09PSBNQVhfUkVTVUxUU19QRVJfRklMRSkge1xuXHRcdFx0XHRcdHBpY2tzLnB1c2goe1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdRdWlja1NlYXJjaE1vcmUnLCBcIk1vcmVcIiksXG5cdFx0XHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShzZWFyY2hEZXRhaWxzSWNvbiksXG5cdFx0XHRcdFx0XHRhY2NlcHQ6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5tb3ZlVG9TZWFyY2hWaWV3bGV0KGVsZW1lbnQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcHJldmlldyA9IGVsZW1lbnQucHJldmlldygpO1xuXHRcdFx0XHRjb25zdCBwcmV2aWV3VGV4dCA9IChwcmV2aWV3LmJlZm9yZSArIHByZXZpZXcuaW5zaWRlICsgcHJldmlldy5hZnRlcikudHJpbSgpLnN1YnN0cmluZygwLCA5OTkpO1xuXHRcdFx0XHRjb25zdCBtYXRjaDogSU1hdGNoW10gPSBbe1xuXHRcdFx0XHRcdHN0YXJ0OiBwcmV2aWV3LmJlZm9yZS5sZW5ndGgsXG5cdFx0XHRcdFx0ZW5kOiBwcmV2aWV3LmJlZm9yZS5sZW5ndGggKyBwcmV2aWV3Lmluc2lkZS5sZW5ndGhcblx0XHRcdFx0fV07XG5cdFx0XHRcdHBpY2tzLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBgJHtwcmV2aWV3VGV4dH1gLFxuXHRcdFx0XHRcdGhpZ2hsaWdodHM6IHtcblx0XHRcdFx0XHRcdGxhYmVsOiBtYXRjaFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0YnV0dG9uczogW3tcblx0XHRcdFx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKHNlYXJjaEFjdGl2aXR5QmFySWNvbiksXG5cdFx0XHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnc2hvd01vcmUnLCBcIk9wZW4gaW4gU2VhcmNoIFZpZXdcIiksXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0YXJpYUxhYmVsOiBgTWF0Y2ggYXQgbG9jYXRpb24gJHtlbGVtZW50LnJhbmdlKCkuc3RhcnRMaW5lTnVtYmVyfToke2VsZW1lbnQucmFuZ2UoKS5zdGFydENvbHVtbn0gLSAke3ByZXZpZXdUZXh0fWAsXG5cdFx0XHRcdFx0YWNjZXB0OiBhc3luYyAoa2V5TW9kcywgZXZlbnQpID0+IHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuaGFuZGxlQWNjZXB0KGlGaWxlSW5zdGFuY2VNYXRjaCwge1xuXHRcdFx0XHRcdFx0XHRrZXlNb2RzLFxuXHRcdFx0XHRcdFx0XHRzZWxlY3Rpb246IGdldEVkaXRvclNlbGVjdGlvbkZyb21NYXRjaChlbGVtZW50LCB0aGlzLnNlYXJjaE1vZGVsKSxcblx0XHRcdFx0XHRcdFx0cHJlc2VydmVGb2N1czogZXZlbnQuaW5CYWNrZ3JvdW5kLFxuXHRcdFx0XHRcdFx0XHRmb3JjZVBpbm5lZDogZXZlbnQuaW5CYWNrZ3JvdW5kXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHRyaWdnZXI6IGFzeW5jICgpOiBQcm9taXNlPFRyaWdnZXJBY3Rpb24+ID0+IHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMubW92ZVRvU2VhcmNoVmlld2xldChlbGVtZW50KTtcblx0XHRcdFx0XHRcdHJldHVybiBUcmlnZ2VyQWN0aW9uLkNMT1NFX1BJQ0tFUjtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG1hdGNoOiBlbGVtZW50XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcGlja3M7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZUFjY2VwdChpRmlsZUluc3RhbmNlTWF0Y2g6IElTZWFyY2hUcmVlRmlsZU1hdGNoLCBvcHRpb25zOiB7IGtleU1vZHM/OiBJS2V5TW9kczsgc2VsZWN0aW9uPzogSVRleHRFZGl0b3JTZWxlY3Rpb247IHByZXNlcnZlRm9jdXM/OiBib29sZWFuOyByYW5nZT86IElSYW5nZTsgZm9yY2VQaW5uZWQ/OiBib29sZWFuOyBmb3JjZU9wZW5TaWRlQnlTaWRlPzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yT3B0aW9ucyA9IHtcblx0XHRcdHByZXNlcnZlRm9jdXM6IG9wdGlvbnMucHJlc2VydmVGb2N1cyxcblx0XHRcdHBpbm5lZDogb3B0aW9ucy5rZXlNb2RzPy5jdHJsQ21kIHx8IG9wdGlvbnMuZm9yY2VQaW5uZWQgfHwgdGhpcy5jb25maWd1cmF0aW9uLm9wZW5FZGl0b3JQaW5uZWQsXG5cdFx0XHRzZWxlY3Rpb246IG9wdGlvbnMuc2VsZWN0aW9uXG5cdFx0fTtcblxuXHRcdC8vIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvYmxvYi9mNDBkYWJjYTA3YTE2MjJiMmEwYWUzZWU3NDFjZmM5NGFiOTY0YmVmL3NyYy92cy93b3JrYmVuY2gvY29udHJpYi9zZWFyY2gvYnJvd3Nlci9hbnl0aGluZ1F1aWNrQWNjZXNzLnRzI0wxMDM3XG5cdFx0Y29uc3QgdGFyZ2V0R3JvdXAgPSBvcHRpb25zLmtleU1vZHM/LmFsdCB8fCAodGhpcy5jb25maWd1cmF0aW9uLm9wZW5FZGl0b3JQaW5uZWQgJiYgb3B0aW9ucy5rZXlNb2RzPy5jdHJsQ21kKSB8fCBvcHRpb25zLmZvcmNlT3BlblNpZGVCeVNpZGUgPyBTSURFX0dST1VQIDogQUNUSVZFX0dST1VQO1xuXG5cdFx0YXdhaXQgdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdHJlc291cmNlOiBpRmlsZUluc3RhbmNlTWF0Y2gucmVzb3VyY2UsXG5cdFx0XHRvcHRpb25zOiBlZGl0b3JPcHRpb25zXG5cdFx0fSwgdGFyZ2V0R3JvdXApO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRQaWNrcyhjb250ZW50UGF0dGVybjogc3RyaW5nLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQaWNrczxJUXVpY2tQaWNrSXRlbT4gfCBQcm9taXNlPFBpY2tzPElRdWlja1BpY2tJdGVtPiB8IEZhc3RBbmRTbG93UGlja3M8SVF1aWNrUGlja0l0ZW0+PiB8IEZhc3RBbmRTbG93UGlja3M8SVF1aWNrUGlja0l0ZW0+IHwgbnVsbCB7XG5cblx0XHRjb25zdCBzZWFyY2hNb2RlbEF0VGltZU9mU2VhcmNoID0gdGhpcy5zZWFyY2hNb2RlbDtcblx0XHRpZiAoY29udGVudFBhdHRlcm4gPT09ICcnKSB7XG5cblx0XHRcdHRoaXMuc2VhcmNoTW9kZWwuc2VhcmNoUmVzdWx0LmNsZWFyKCk7XG5cdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdlbnRlclNlYXJjaFRlcm0nLCBcIkVudGVyIGEgdGVybSB0byBzZWFyY2ggZm9yIGFjcm9zcyB5b3VyIGZpbGVzLlwiKVxuXHRcdFx0fV07XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29uZGl0aW9uYWxUb2tlbkN0cyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0aWYgKHNlYXJjaE1vZGVsQXRUaW1lT2ZTZWFyY2gubG9jYXRpb24gPT09IFNlYXJjaE1vZGVsTG9jYXRpb24uUVVJQ0tfQUNDRVNTKSB7XG5cdFx0XHRcdC8vIGlmIHRoZSBzZWFyY2ggbW9kZWwgaGFzIG5vdCBiZWVuIGltcG9ydGVkIHRvIHRoZSBwYW5lbCwgeW91IGNhbiBjYW5jZWxcblx0XHRcdFx0Y29uZGl0aW9uYWxUb2tlbkN0cy5jYW5jZWwoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Y29uc3QgYWxsTWF0Y2hlcyA9IHRoaXMuZG9TZWFyY2goY29udGVudFBhdHRlcm4sIGNvbmRpdGlvbmFsVG9rZW5DdHMudG9rZW4pO1xuXG5cdFx0aWYgKCFhbGxNYXRjaGVzKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgbWF0Y2hlcyA9IGFsbE1hdGNoZXMuc3luY1Jlc3VsdHM7XG5cdFx0Y29uc3Qgc3luY1Jlc3VsdCA9IHRoaXMuX2dldFBpY2tzRnJvbU1hdGNoZXMobWF0Y2hlcywgTUFYX0ZJTEVTX1NIT1dOLCB0aGlzLl9lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcj8ucmVzb3VyY2UpO1xuXHRcdGlmIChzeW5jUmVzdWx0Lmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuc2VhcmNoTW9kZWwuc2VhcmNoUmVzdWx0LnRvZ2dsZUhpZ2hsaWdodHModHJ1ZSk7XG5cdFx0fVxuXG5cdFx0aWYgKG1hdGNoZXMubGVuZ3RoID49IE1BWF9GSUxFU19TSE9XTikge1xuXHRcdFx0cmV0dXJuIHN5bmNSZXN1bHQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHBpY2tzOiBzeW5jUmVzdWx0LFxuXHRcdFx0YWRkaXRpb25hbFBpY2tzOiBhbGxNYXRjaGVzLmFzeW5jUmVzdWx0c1xuXHRcdFx0XHQudGhlbihhc3luY1Jlc3VsdHMgPT4gKGFzeW5jUmVzdWx0cy5sZW5ndGggKyBzeW5jUmVzdWx0Lmxlbmd0aCA9PT0gMCkgPyBbe1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbm9Bbnl0aGluZ1Jlc3VsdHMnLCBcIk5vIG1hdGNoaW5nIHJlc3VsdHNcIilcblx0XHRcdFx0fV0gOiB0aGlzLl9nZXRQaWNrc0Zyb21NYXRjaGVzKGFzeW5jUmVzdWx0cywgTUFYX0ZJTEVTX1NIT1dOIC0gbWF0Y2hlcy5sZW5ndGgpKVxuXHRcdFx0XHQudGhlbihwaWNrcyA9PiB7XG5cdFx0XHRcdFx0aWYgKHBpY2tzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdHRoaXMuc2VhcmNoTW9kZWwuc2VhcmNoUmVzdWx0LnRvZ2dsZUhpZ2hsaWdodHModHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBwaWNrcztcblx0XHRcdFx0fSlcblx0XHR9O1xuXG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBSUEsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsdUJBQW9DO0FBQzdDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMscUJBQXFCLGVBQWU7QUFDN0MsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBNkMsaUNBQWlDO0FBQzlFLFNBQWdGLDJCQUFrQyxxQkFBcUI7QUFDdkksU0FBUyxxQ0FBcUU7QUFDOUUs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
