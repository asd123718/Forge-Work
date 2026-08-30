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
import * as dom from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { AnchorAlignment } from "../../../../base/browser/ui/contextview/contextview.js";
import { DropdownMenuActionViewItem } from "../../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
import { Action, Separator } from "../../../../base/common/actions.js";
import { Delayer } from "../../../../base/common/async.js";
import { Emitter } from "../../../../base/common/event.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { localize } from "../../../../nls.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { ContextScopedSuggestEnabledInputWithHistory } from "../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js";
import { testingFilterIcon } from "./icons.js";
import { StoredValue } from "../common/storedValue.js";
import { ITestExplorerFilterState, TestFilterTerm } from "../common/testExplorerFilterState.js";
import { ITestService } from "../common/testService.js";
import { denamespaceTestTag } from "../common/testTypes.js";
const testFilterDescriptions = {
  [TestFilterTerm.Failed]: localize("testing.filters.showOnlyFailed", "Show Only Failed Tests"),
  [TestFilterTerm.Executed]: localize("testing.filters.showOnlyExecuted", "Show Only Executed Tests"),
  [TestFilterTerm.CurrentDoc]: localize("testing.filters.currentFile", "Show in Active File Only"),
  [TestFilterTerm.OpenedFiles]: localize("testing.filters.openedFiles", "Show in Opened Files Only"),
  [TestFilterTerm.Hidden]: localize("testing.filters.showExcludedTests", "Show Hidden Tests")
};
let TestingExplorerFilter = class extends BaseActionViewItem {
  constructor(action, options, state, instantiationService, testService) {
    super(null, action, options);
    this.state = state;
    this.instantiationService = instantiationService;
    this.testService = testService;
    this.focusEmitter = this._register(new Emitter());
    this.onDidFocus = this.focusEmitter.event;
    this.filtersAction = new Action("markersFiltersAction", localize("testing.filters.menu", "More Filters..."), "testing-filter-button " + ThemeIcon.asClassName(testingFilterIcon));
    this.history = this._register(instantiationService.createInstance(StoredValue, {
      key: "testing.filterHistory2",
      scope: StorageScope.WORKSPACE,
      target: StorageTarget.MACHINE
    }));
    this.updateFilterActiveState();
    this._register(testService.excluded.onTestExclusionsChanged(this.updateFilterActiveState, this));
  }
  /**
   * @override
   */
  render(container) {
    container.classList.add("testing-filter-action-item");
    const updateDelayer = this._register(new Delayer(400));
    const wrapper = this.wrapper = dom.$(".testing-filter-wrapper");
    container.appendChild(wrapper);
    let history = this.history.get({ lastValue: "", values: [] });
    if (history instanceof Array) {
      history = { lastValue: "", values: history };
    }
    if (history.lastValue) {
      this.state.setText(history.lastValue);
    }
    const input = this.input = this._register(this.instantiationService.createInstance(ContextScopedSuggestEnabledInputWithHistory, {
      id: "testing.explorer.filter",
      ariaLabel: localize("testExplorerFilterLabel", "Filter text for tests in the explorer"),
      parent: wrapper,
      suggestionProvider: {
        triggerCharacters: ["@"],
        provideResults: () => [
          ...Object.entries(testFilterDescriptions).map(([label, detail]) => ({ label, detail })),
          ...Iterable.map(this.testService.collection.tags.values(), (tag) => {
            const { ctrlId, tagId } = denamespaceTestTag(tag.id);
            const insertText = `@${ctrlId}:${tagId}`;
            return {
              label: `@${ctrlId}:${tagId}`,
              detail: this.testService.collection.getNodeById(ctrlId)?.item.label,
              insertText: tagId.includes(" ") ? `@${ctrlId}:"${tagId.replace(/(["\\])/g, "\\$1")}"` : insertText
            };
          })
        ].filter((r) => !this.state.text.value.includes(r.label))
      },
      resourceHandle: "testing:filter",
      suggestOptions: {
        value: this.state.text.value,
        placeholderText: localize("testExplorerFilter", "Filter (e.g. text, !exclude, @tag)")
      },
      history: history.values
    }));
    this._register(this.state.text.onDidChange((newValue) => {
      if (input.getValue() !== newValue) {
        input.setValue(newValue);
      }
    }));
    this._register(this.state.onDidRequestInputFocus(() => {
      input.focus();
    }));
    this._register(input.onDidFocus(() => {
      this.focusEmitter.fire();
    }));
    this._register(input.onInputDidChange(() => updateDelayer.trigger(() => {
      input.addToHistory();
      this.state.setText(input.getValue());
    })));
    const actionbar = this._register(new ActionBar(container, {
      actionViewItemProvider: (action, options) => {
        if (action.id === this.filtersAction.id) {
          return this.instantiationService.createInstance(FiltersDropdownMenuActionViewItem, action, options, this.state, this.actionRunner);
        }
        return void 0;
      }
    }));
    actionbar.push(this.filtersAction, { icon: true, label: false });
    this.layout(this.wrapper.clientWidth);
  }
  layout(width) {
    this.input.layout(new dom.Dimension(
      width - /* horizontal padding */
      24 - /* editor padding */
      8 - /* filter button padding */
      22,
      20
      // line height from suggestEnabledInput.ts
    ));
  }
  /**
   * Focuses the filter input.
   */
  focus() {
    this.input.focus();
  }
  /**
   * Persists changes to the input history.
   */
  saveState() {
    this.history.store({ lastValue: this.input.getValue(), values: this.input.getHistory() });
  }
  /**
   * @override
   */
  dispose() {
    this.saveState();
    super.dispose();
  }
  /**
   * Updates the 'checked' state of the filter submenu.
   */
  updateFilterActiveState() {
    this.filtersAction.checked = this.testService.excluded.hasAny;
  }
};
TestingExplorerFilter = __decorateClass([
  __decorateParam(2, ITestExplorerFilterState),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ITestService)
], TestingExplorerFilter);
let FiltersDropdownMenuActionViewItem = class extends DropdownMenuActionViewItem {
  constructor(action, options, filters, actionRunner, contextMenuService, testService) {
    super(
      action,
      { getActions: () => this.getActions() },
      contextMenuService,
      {
        actionRunner,
        classNames: action.class,
        anchorAlignmentProvider: () => AnchorAlignment.RIGHT,
        menuAsChild: true
      }
    );
    this.filters = filters;
    this.testService = testService;
  }
  render(container) {
    super.render(container);
    this.updateChecked();
  }
  getActions() {
    return [
      ...[TestFilterTerm.Failed, TestFilterTerm.Executed, TestFilterTerm.CurrentDoc, TestFilterTerm.OpenedFiles].map((term) => ({
        checked: this.filters.isFilteringFor(term),
        class: void 0,
        enabled: true,
        id: term,
        label: testFilterDescriptions[term],
        run: () => this.filters.toggleFilteringFor(term),
        tooltip: "",
        dispose: () => null
      })),
      new Separator(),
      {
        checked: this.filters.fuzzy.value,
        class: void 0,
        enabled: true,
        id: "fuzzy",
        label: localize("testing.filters.fuzzyMatch", "Fuzzy Match"),
        run: () => this.filters.fuzzy.value = !this.filters.fuzzy.value,
        tooltip: ""
      },
      new Separator(),
      {
        checked: this.filters.isFilteringFor(TestFilterTerm.Hidden),
        class: void 0,
        enabled: this.testService.excluded.hasAny,
        id: "showExcluded",
        label: localize("testing.filters.showExcludedTests", "Show Hidden Tests"),
        run: () => this.filters.toggleFilteringFor(TestFilterTerm.Hidden),
        tooltip: ""
      },
      {
        class: void 0,
        enabled: this.testService.excluded.hasAny,
        id: "removeExcluded",
        label: localize("testing.filters.removeTestExclusions", "Unhide All Tests"),
        run: async () => this.testService.excluded.clear(),
        tooltip: ""
      }
    ];
  }
  updateChecked() {
    this.element.classList.toggle("checked", this._action.checked);
  }
};
FiltersDropdownMenuActionViewItem = __decorateClass([
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, ITestService)
], FiltersDropdownMenuActionViewItem);
export {
  TestingExplorerFilter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGJyb3dzZXJcXHRlc3RpbmdFeHBsb3JlckZpbHRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEJhc2VBY3Rpb25WaWV3SXRlbSwgSUFjdGlvblZpZXdJdGVtT3B0aW9ucywgSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBBbmNob3JBbGlnbm1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuaW1wb3J0IHsgRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZHJvcGRvd24vZHJvcGRvd25BY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIElBY3Rpb24sIElBY3Rpb25SdW5uZXIsIFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQ29udGV4dFNjb3BlZFN1Z2dlc3RFbmFibGVkSW5wdXRXaXRoSGlzdG9yeSwgU3VnZ2VzdEVuYWJsZWRJbnB1dFdpdGhIaXN0b3J5LCBTdWdnZXN0UmVzdWx0c1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vY29kZUVkaXRvci9icm93c2VyL3N1Z2dlc3RFbmFibGVkSW5wdXQvc3VnZ2VzdEVuYWJsZWRJbnB1dC5qcyc7XG5pbXBvcnQgeyB0ZXN0aW5nRmlsdGVySWNvbiB9IGZyb20gJy4vaWNvbnMuanMnO1xuaW1wb3J0IHsgU3RvcmVkVmFsdWUgfSBmcm9tICcuLi9jb21tb24vc3RvcmVkVmFsdWUuanMnO1xuaW1wb3J0IHsgSVRlc3RFeHBsb3JlckZpbHRlclN0YXRlLCBUZXN0RmlsdGVyVGVybSB9IGZyb20gJy4uL2NvbW1vbi90ZXN0RXhwbG9yZXJGaWx0ZXJTdGF0ZS5qcyc7XG5pbXBvcnQgeyBJVGVzdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vdGVzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZGVuYW1lc3BhY2VUZXN0VGFnIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RUeXBlcy5qcyc7XG5cbmNvbnN0IHRlc3RGaWx0ZXJEZXNjcmlwdGlvbnM6IHsgW0sgaW4gVGVzdEZpbHRlclRlcm1dOiBzdHJpbmcgfSA9IHtcblx0W1Rlc3RGaWx0ZXJUZXJtLkZhaWxlZF06IGxvY2FsaXplKCd0ZXN0aW5nLmZpbHRlcnMuc2hvd09ubHlGYWlsZWQnLCBcIlNob3cgT25seSBGYWlsZWQgVGVzdHNcIiksXG5cdFtUZXN0RmlsdGVyVGVybS5FeGVjdXRlZF06IGxvY2FsaXplKCd0ZXN0aW5nLmZpbHRlcnMuc2hvd09ubHlFeGVjdXRlZCcsIFwiU2hvdyBPbmx5IEV4ZWN1dGVkIFRlc3RzXCIpLFxuXHRbVGVzdEZpbHRlclRlcm0uQ3VycmVudERvY106IGxvY2FsaXplKCd0ZXN0aW5nLmZpbHRlcnMuY3VycmVudEZpbGUnLCBcIlNob3cgaW4gQWN0aXZlIEZpbGUgT25seVwiKSxcblx0W1Rlc3RGaWx0ZXJUZXJtLk9wZW5lZEZpbGVzXTogbG9jYWxpemUoJ3Rlc3RpbmcuZmlsdGVycy5vcGVuZWRGaWxlcycsIFwiU2hvdyBpbiBPcGVuZWQgRmlsZXMgT25seVwiKSxcblx0W1Rlc3RGaWx0ZXJUZXJtLkhpZGRlbl06IGxvY2FsaXplKCd0ZXN0aW5nLmZpbHRlcnMuc2hvd0V4Y2x1ZGVkVGVzdHMnLCBcIlNob3cgSGlkZGVuIFRlc3RzXCIpLFxufTtcblxuZXhwb3J0IGNsYXNzIFRlc3RpbmdFeHBsb3JlckZpbHRlciBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XG5cdHByaXZhdGUgaW5wdXQhOiBTdWdnZXN0RW5hYmxlZElucHV0V2l0aEhpc3Rvcnk7XG5cdHByaXZhdGUgd3JhcHBlciE6IEhUTUxEaXZFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGZvY3VzRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRGb2N1cyA9IHRoaXMuZm9jdXNFbWl0dGVyLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGhpc3Rvcnk6IFN0b3JlZFZhbHVlPHsgdmFsdWVzOiBzdHJpbmdbXTsgbGFzdFZhbHVlOiBzdHJpbmcgfSB8IHN0cmluZ1tdPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGZpbHRlcnNBY3Rpb24gPSBuZXcgQWN0aW9uKCdtYXJrZXJzRmlsdGVyc0FjdGlvbicsIGxvY2FsaXplKCd0ZXN0aW5nLmZpbHRlcnMubWVudScsIFwiTW9yZSBGaWx0ZXJzLi4uXCIpLCAndGVzdGluZy1maWx0ZXItYnV0dG9uICcgKyBUaGVtZUljb24uYXNDbGFzc05hbWUodGVzdGluZ0ZpbHRlckljb24pKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0b3B0aW9uczogSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdFx0QElUZXN0RXhwbG9yZXJGaWx0ZXJTdGF0ZSBwcml2YXRlIHJlYWRvbmx5IHN0YXRlOiBJVGVzdEV4cGxvcmVyRmlsdGVyU3RhdGUsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlc3RTZXJ2aWNlOiBJVGVzdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKG51bGwsIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0dGhpcy5oaXN0b3J5ID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3RvcmVkVmFsdWUsIHtcblx0XHRcdGtleTogJ3Rlc3RpbmcuZmlsdGVySGlzdG9yeTInLFxuXHRcdFx0c2NvcGU6IFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsXG5cdFx0XHR0YXJnZXQ6IFN0b3JhZ2VUYXJnZXQuTUFDSElORVxuXHRcdH0pKTtcblx0XHR0aGlzLnVwZGF0ZUZpbHRlckFjdGl2ZVN0YXRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGVzdFNlcnZpY2UuZXhjbHVkZWQub25UZXN0RXhjbHVzaW9uc0NoYW5nZWQodGhpcy51cGRhdGVGaWx0ZXJBY3RpdmVTdGF0ZSwgdGhpcykpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBvdmVycmlkZVxuXHQgKi9cblx0cHVibGljIG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Rlc3RpbmctZmlsdGVyLWFjdGlvbi1pdGVtJyk7XG5cblx0XHRjb25zdCB1cGRhdGVEZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXI8dm9pZD4oNDAwKSk7XG5cdFx0Y29uc3Qgd3JhcHBlciA9IHRoaXMud3JhcHBlciA9IGRvbS4kKCcudGVzdGluZy1maWx0ZXItd3JhcHBlcicpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh3cmFwcGVyKTtcblxuXHRcdGxldCBoaXN0b3J5ID0gdGhpcy5oaXN0b3J5LmdldCh7IGxhc3RWYWx1ZTogJycsIHZhbHVlczogW10gfSk7XG5cdFx0aWYgKGhpc3RvcnkgaW5zdGFuY2VvZiBBcnJheSkge1xuXHRcdFx0aGlzdG9yeSA9IHsgbGFzdFZhbHVlOiAnJywgdmFsdWVzOiBoaXN0b3J5IH07XG5cdFx0fVxuXHRcdGlmIChoaXN0b3J5Lmxhc3RWYWx1ZSkge1xuXHRcdFx0dGhpcy5zdGF0ZS5zZXRUZXh0KGhpc3RvcnkubGFzdFZhbHVlKTtcblx0XHR9XG5cblx0XHRjb25zdCBpbnB1dCA9IHRoaXMuaW5wdXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbnRleHRTY29wZWRTdWdnZXN0RW5hYmxlZElucHV0V2l0aEhpc3RvcnksIHtcblx0XHRcdGlkOiAndGVzdGluZy5leHBsb3Jlci5maWx0ZXInLFxuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgndGVzdEV4cGxvcmVyRmlsdGVyTGFiZWwnLCBcIkZpbHRlciB0ZXh0IGZvciB0ZXN0cyBpbiB0aGUgZXhwbG9yZXJcIiksXG5cdFx0XHRwYXJlbnQ6IHdyYXBwZXIsXG5cdFx0XHRzdWdnZXN0aW9uUHJvdmlkZXI6IHtcblx0XHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IFsnQCddLFxuXHRcdFx0XHRwcm92aWRlUmVzdWx0czogKCkgPT4gW1xuXHRcdFx0XHRcdC4uLk9iamVjdC5lbnRyaWVzKHRlc3RGaWx0ZXJEZXNjcmlwdGlvbnMpLm1hcCgoW2xhYmVsLCBkZXRhaWxdKSA9PiAoeyBsYWJlbCwgZGV0YWlsIH0pKSxcblx0XHRcdFx0XHQuLi5JdGVyYWJsZS5tYXAodGhpcy50ZXN0U2VydmljZS5jb2xsZWN0aW9uLnRhZ3MudmFsdWVzKCksIHRhZyA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCB7IGN0cmxJZCwgdGFnSWQgfSA9IGRlbmFtZXNwYWNlVGVzdFRhZyh0YWcuaWQpO1xuXHRcdFx0XHRcdFx0Y29uc3QgaW5zZXJ0VGV4dCA9IGBAJHtjdHJsSWR9OiR7dGFnSWR9YDtcblx0XHRcdFx0XHRcdHJldHVybiAoe1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogYEAke2N0cmxJZH06JHt0YWdJZH1gLFxuXHRcdFx0XHRcdFx0XHRkZXRhaWw6IHRoaXMudGVzdFNlcnZpY2UuY29sbGVjdGlvbi5nZXROb2RlQnlJZChjdHJsSWQpPy5pdGVtLmxhYmVsLFxuXHRcdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiB0YWdJZC5pbmNsdWRlcygnICcpID8gYEAke2N0cmxJZH06XCIke3RhZ0lkLnJlcGxhY2UoLyhbXCJcXFxcXSkvZywgJ1xcXFwkMScpfVwiYCA6IGluc2VydFRleHQsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XS5maWx0ZXIociA9PiAhdGhpcy5zdGF0ZS50ZXh0LnZhbHVlLmluY2x1ZGVzKHIubGFiZWwpKSxcblx0XHRcdH0gc2F0aXNmaWVzIFN1Z2dlc3RSZXN1bHRzUHJvdmlkZXIsXG5cdFx0XHRyZXNvdXJjZUhhbmRsZTogJ3Rlc3Rpbmc6ZmlsdGVyJyxcblx0XHRcdHN1Z2dlc3RPcHRpb25zOiB7XG5cdFx0XHRcdHZhbHVlOiB0aGlzLnN0YXRlLnRleHQudmFsdWUsXG5cdFx0XHRcdHBsYWNlaG9sZGVyVGV4dDogbG9jYWxpemUoJ3Rlc3RFeHBsb3JlckZpbHRlcicsIFwiRmlsdGVyIChlLmcuIHRleHQsICFleGNsdWRlLCBAdGFnKVwiKSxcblx0XHRcdH0sXG5cdFx0XHRoaXN0b3J5OiBoaXN0b3J5LnZhbHVlc1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RhdGUudGV4dC5vbkRpZENoYW5nZShuZXdWYWx1ZSA9PiB7XG5cdFx0XHRpZiAoaW5wdXQuZ2V0VmFsdWUoKSAhPT0gbmV3VmFsdWUpIHtcblx0XHRcdFx0aW5wdXQuc2V0VmFsdWUobmV3VmFsdWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RhdGUub25EaWRSZXF1ZXN0SW5wdXRGb2N1cygoKSA9PiB7XG5cdFx0XHRpbnB1dC5mb2N1cygpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGlucHV0Lm9uRGlkRm9jdXMoKCkgPT4ge1xuXHRcdFx0dGhpcy5mb2N1c0VtaXR0ZXIuZmlyZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGlucHV0Lm9uSW5wdXREaWRDaGFuZ2UoKCkgPT4gdXBkYXRlRGVsYXllci50cmlnZ2VyKCgpID0+IHtcblx0XHRcdGlucHV0LmFkZFRvSGlzdG9yeSgpO1xuXHRcdFx0dGhpcy5zdGF0ZS5zZXRUZXh0KGlucHV0LmdldFZhbHVlKCkpO1xuXHRcdH0pKSk7XG5cblx0XHRjb25zdCBhY3Rpb25iYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKGNvbnRhaW5lciwge1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAoYWN0aW9uLmlkID09PSB0aGlzLmZpbHRlcnNBY3Rpb24uaWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGaWx0ZXJzRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgb3B0aW9ucywgdGhpcy5zdGF0ZSwgdGhpcy5hY3Rpb25SdW5uZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0XHRhY3Rpb25iYXIucHVzaCh0aGlzLmZpbHRlcnNBY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXG5cdFx0dGhpcy5sYXlvdXQodGhpcy53cmFwcGVyLmNsaWVudFdpZHRoKTtcblx0fVxuXG5cdHB1YmxpYyBsYXlvdXQod2lkdGg6IG51bWJlcikge1xuXHRcdHRoaXMuaW5wdXQubGF5b3V0KG5ldyBkb20uRGltZW5zaW9uKFxuXHRcdFx0d2lkdGggLSAvKiBob3Jpem9udGFsIHBhZGRpbmcgKi8gMjQgLSAvKiBlZGl0b3IgcGFkZGluZyAqLyA4IC0gLyogZmlsdGVyIGJ1dHRvbiBwYWRkaW5nICovIDIyLFxuXHRcdFx0MjAsIC8vIGxpbmUgaGVpZ2h0IGZyb20gc3VnZ2VzdEVuYWJsZWRJbnB1dC50c1xuXHRcdCkpO1xuXHR9XG5cblxuXHQvKipcblx0ICogRm9jdXNlcyB0aGUgZmlsdGVyIGlucHV0LlxuXHQgKi9cblx0cHVibGljIG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuaW5wdXQuZm9jdXMoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQZXJzaXN0cyBjaGFuZ2VzIHRvIHRoZSBpbnB1dCBoaXN0b3J5LlxuXHQgKi9cblx0cHVibGljIHNhdmVTdGF0ZSgpIHtcblx0XHR0aGlzLmhpc3Rvcnkuc3RvcmUoeyBsYXN0VmFsdWU6IHRoaXMuaW5wdXQuZ2V0VmFsdWUoKSwgdmFsdWVzOiB0aGlzLmlucHV0LmdldEhpc3RvcnkoKSB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAb3ZlcnJpZGVcblx0ICovXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHRoaXMuc2F2ZVN0YXRlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlICdjaGVja2VkJyBzdGF0ZSBvZiB0aGUgZmlsdGVyIHN1Ym1lbnUuXG5cdCAqL1xuXHRwcml2YXRlIHVwZGF0ZUZpbHRlckFjdGl2ZVN0YXRlKCkge1xuXHRcdHRoaXMuZmlsdGVyc0FjdGlvbi5jaGVja2VkID0gdGhpcy50ZXN0U2VydmljZS5leGNsdWRlZC5oYXNBbnk7XG5cdH1cbn1cblxuXG5jbGFzcyBGaWx0ZXJzRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBJQWN0aW9uLFxuXHRcdG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBmaWx0ZXJzOiBJVGVzdEV4cGxvcmVyRmlsdGVyU3RhdGUsXG5cdFx0YWN0aW9uUnVubmVyOiBJQWN0aW9uUnVubmVyLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASVRlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVzdFNlcnZpY2U6IElUZXN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoYWN0aW9uLFxuXHRcdFx0eyBnZXRBY3Rpb25zOiAoKSA9PiB0aGlzLmdldEFjdGlvbnMoKSB9LFxuXHRcdFx0Y29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdFx0e1xuXHRcdFx0XHRhY3Rpb25SdW5uZXIsXG5cdFx0XHRcdGNsYXNzTmFtZXM6IGFjdGlvbi5jbGFzcyxcblx0XHRcdFx0YW5jaG9yQWxpZ25tZW50UHJvdmlkZXI6ICgpID0+IEFuY2hvckFsaWdubWVudC5SSUdIVCxcblx0XHRcdFx0bWVudUFzQ2hpbGQ6IHRydWVcblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHR0aGlzLnVwZGF0ZUNoZWNrZWQoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWN0aW9ucygpOiBJQWN0aW9uW10ge1xuXHRcdHJldHVybiBbXG5cdFx0XHQuLi5bVGVzdEZpbHRlclRlcm0uRmFpbGVkLCBUZXN0RmlsdGVyVGVybS5FeGVjdXRlZCwgVGVzdEZpbHRlclRlcm0uQ3VycmVudERvYywgVGVzdEZpbHRlclRlcm0uT3BlbmVkRmlsZXNdLm1hcCh0ZXJtID0+ICh7XG5cdFx0XHRcdGNoZWNrZWQ6IHRoaXMuZmlsdGVycy5pc0ZpbHRlcmluZ0Zvcih0ZXJtKSxcblx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0aWQ6IHRlcm0sXG5cdFx0XHRcdGxhYmVsOiB0ZXN0RmlsdGVyRGVzY3JpcHRpb25zW3Rlcm1dLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMuZmlsdGVycy50b2dnbGVGaWx0ZXJpbmdGb3IodGVybSksXG5cdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiBudWxsXG5cdFx0XHR9KSksXG5cdFx0XHRuZXcgU2VwYXJhdG9yKCksXG5cdFx0XHR7XG5cdFx0XHRcdGNoZWNrZWQ6IHRoaXMuZmlsdGVycy5mdXp6eS52YWx1ZSxcblx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0aWQ6ICdmdXp6eScsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgndGVzdGluZy5maWx0ZXJzLmZ1enp5TWF0Y2gnLCBcIkZ1enp5IE1hdGNoXCIpLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMuZmlsdGVycy5mdXp6eS52YWx1ZSA9ICF0aGlzLmZpbHRlcnMuZnV6enkudmFsdWUsXG5cdFx0XHRcdHRvb2x0aXA6ICcnXG5cdFx0XHR9LFxuXHRcdFx0bmV3IFNlcGFyYXRvcigpLFxuXHRcdFx0e1xuXHRcdFx0XHRjaGVja2VkOiB0aGlzLmZpbHRlcnMuaXNGaWx0ZXJpbmdGb3IoVGVzdEZpbHRlclRlcm0uSGlkZGVuKSxcblx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZW5hYmxlZDogdGhpcy50ZXN0U2VydmljZS5leGNsdWRlZC5oYXNBbnksXG5cdFx0XHRcdGlkOiAnc2hvd0V4Y2x1ZGVkJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCd0ZXN0aW5nLmZpbHRlcnMuc2hvd0V4Y2x1ZGVkVGVzdHMnLCBcIlNob3cgSGlkZGVuIFRlc3RzXCIpLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMuZmlsdGVycy50b2dnbGVGaWx0ZXJpbmdGb3IoVGVzdEZpbHRlclRlcm0uSGlkZGVuKSxcblx0XHRcdFx0dG9vbHRpcDogJydcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdGVuYWJsZWQ6IHRoaXMudGVzdFNlcnZpY2UuZXhjbHVkZWQuaGFzQW55LFxuXHRcdFx0XHRpZDogJ3JlbW92ZUV4Y2x1ZGVkJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCd0ZXN0aW5nLmZpbHRlcnMucmVtb3ZlVGVzdEV4Y2x1c2lvbnMnLCBcIlVuaGlkZSBBbGwgVGVzdHNcIiksXG5cdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4gdGhpcy50ZXN0U2VydmljZS5leGNsdWRlZC5jbGVhcigpLFxuXHRcdFx0XHR0b29sdGlwOiAnJ1xuXHRcdFx0fVxuXHRcdF07XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlQ2hlY2tlZCgpOiB2b2lkIHtcblx0XHR0aGlzLmVsZW1lbnQhLmNsYXNzTGlzdC50b2dnbGUoJ2NoZWNrZWQnLCB0aGlzLl9hY3Rpb24uY2hlY2tlZCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsMEJBQThFO0FBQ3ZGLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsUUFBZ0MsaUJBQWlCO0FBQzFELFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxjQUFjLHFCQUFxQjtBQUM1QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLG1EQUEyRztBQUNwSCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDBCQUEwQixzQkFBc0I7QUFDekQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywwQkFBMEI7QUFFbkMsTUFBTSx5QkFBNEQ7QUFBQSxFQUNqRSxDQUFDLGVBQWUsTUFBTSxHQUFHLFNBQVMsa0NBQWtDLHdCQUF3QjtBQUFBLEVBQzVGLENBQUMsZUFBZSxRQUFRLEdB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
