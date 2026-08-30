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
import { AnchorAlignment } from "../../../../base/browser/ui/contextview/contextview.js";
import { DropdownMenuActionViewItem } from "../../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
import { Separator } from "../../../../base/common/actions.js";
import { SuggestController } from "../../../../editor/contrib/suggest/browser/suggestController.js";
import { localize } from "../../../../nls.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { ADVANCED_SETTING_TAG, EXTENSION_SETTING_TAG, FEATURE_SETTING_TAG, GENERAL_TAG_SETTING_TAG, ID_SETTING_TAG, LANGUAGE_SETTING_TAG, MODIFIED_SETTING_TAG, POLICY_SETTING_TAG } from "../common/preferences.js";
let SettingsSearchFilterDropdownMenuActionViewItem = class extends DropdownMenuActionViewItem {
  constructor(action, options, actionRunner, searchWidget, contextMenuService) {
    super(
      action,
      { getActions: () => this.getActions() },
      contextMenuService,
      {
        ...options,
        actionRunner,
        classNames: action.class,
        anchorAlignmentProvider: () => AnchorAlignment.RIGHT,
        menuAsChild: true
      }
    );
    this.searchWidget = searchWidget;
    this.suggestController = SuggestController.get(this.searchWidget.inputWidget);
  }
  render(container) {
    super.render(container);
  }
  doSearchWidgetAction(queryToAppend, triggerSuggest) {
    this.searchWidget.setValue(this.searchWidget.getValue().trimEnd() + " " + queryToAppend);
    this.searchWidget.focus();
    if (triggerSuggest && this.suggestController) {
      this.suggestController.triggerSuggest();
    }
  }
  /**
   * The created action appends a query to the search widget search string. It optionally triggers suggestions.
   */
  createAction(id, label, tooltip, queryToAppend, triggerSuggest) {
    return {
      id,
      label,
      tooltip,
      class: void 0,
      enabled: true,
      run: () => {
        this.doSearchWidgetAction(queryToAppend, triggerSuggest);
      }
    };
  }
  /**
   * The created action appends a query to the search widget search string, if the query does not exist.
   * Otherwise, it removes the query from the search widget search string.
   * The action does not trigger suggestions after adding or removing the query.
   */
  createToggleAction(id, label, tooltip, queryToAppend) {
    const splitCurrentQuery = this.searchWidget.getValue().split(" ");
    const queryContainsQueryToAppend = splitCurrentQuery.includes(queryToAppend);
    return {
      id,
      label,
      tooltip,
      class: void 0,
      enabled: true,
      checked: queryContainsQueryToAppend,
      run: () => {
        if (!queryContainsQueryToAppend) {
          const trimmedCurrentQuery = this.searchWidget.getValue().trimEnd();
          const newQuery = trimmedCurrentQuery ? trimmedCurrentQuery + " " + queryToAppend : queryToAppend;
          this.searchWidget.setValue(newQuery);
        } else {
          const queryWithRemovedTags = this.searchWidget.getValue().split(" ").filter((word) => word !== queryToAppend).join(" ");
          this.searchWidget.setValue(queryWithRemovedTags);
        }
        this.searchWidget.focus();
      }
    };
  }
  createMutuallyExclusiveToggleAction(id, label, tooltip, filter, excludeFilters) {
    const isFilterEnabled = this.searchWidget.getValue().split(" ").includes(filter);
    return {
      id,
      label,
      tooltip,
      class: void 0,
      enabled: true,
      checked: isFilterEnabled,
      run: () => {
        if (isFilterEnabled) {
          const queryWithRemovedTags = this.searchWidget.getValue().split(" ").filter((word) => word !== filter).join(" ");
          this.searchWidget.setValue(queryWithRemovedTags);
        } else {
          let newQuery = this.searchWidget.getValue().split(" ").filter((word) => !excludeFilters.includes(word) && word !== filter).join(" ").trimEnd();
          newQuery = newQuery ? newQuery + " " + filter : filter;
          this.searchWidget.setValue(newQuery);
        }
        this.searchWidget.focus();
      }
    };
  }
  getActions() {
    return [
      this.createToggleAction(
        "modifiedSettingsSearch",
        localize("modifiedSettingsSearch", "Modified"),
        localize("modifiedSettingsSearchTooltip", "Add or remove modified settings filter"),
        `@${MODIFIED_SETTING_TAG}`
      ),
      new Separator(),
      this.createAction(
        "extSettingsSearch",
        localize("extSettingsSearch", "Extension ID..."),
        localize("extSettingsSearchTooltip", "Add extension ID filter"),
        `@${EXTENSION_SETTING_TAG}`,
        true
      ),
      this.createAction(
        "featuresSettingsSearch",
        localize("featureSettingsSearch", "Feature..."),
        localize("featureSettingsSearchTooltip", "Add feature filter"),
        `@${FEATURE_SETTING_TAG}`,
        true
      ),
      this.createAction(
        "tagSettingsSearch",
        localize("tagSettingsSearch", "Tag..."),
        localize("tagSettingsSearchTooltip", "Add tag filter"),
        `@${GENERAL_TAG_SETTING_TAG}`,
        true
      ),
      this.createAction(
        "langSettingsSearch",
        localize("langSettingsSearch", "Language..."),
        localize("langSettingsSearchTooltip", "Add language ID filter"),
        `@${LANGUAGE_SETTING_TAG}`,
        true
      ),
      this.createAction(
        "idSettingsSearch",
        localize("idSettingsSearch", "Setting ID..."),
        localize("idSettingsSearchTooltip", "Add Setting ID filter"),
        `@${ID_SETTING_TAG}`,
        false
      ),
      new Separator(),
      this.createToggleAction(
        "onlineSettingsSearch",
        localize("onlineSettingsSearch", "Online services"),
        localize("onlineSettingsSearchTooltip", "Show settings for online services"),
        "@tag:usesOnlineServices"
      ),
      this.createToggleAction(
        "policySettingsSearch",
        localize("policySettingsSearch", "Organization policies"),
        localize("policySettingsSearchTooltip", "Show organization policy settings"),
        `@${POLICY_SETTING_TAG}`
      ),
      new Separator(),
      this.createMutuallyExclusiveToggleAction(
        "stableSettingsSearch",
        localize("stableSettings", "Stable"),
        localize("stableSettingsSearchTooltip", "Show stable settings"),
        `@stable`,
        ["@tag:preview", "@tag:experimental"]
      ),
      this.createMutuallyExclusiveToggleAction(
        "previewSettingsSearch",
        localize("previewSettings", "Preview"),
        localize("previewSettingsSearchTooltip", "Show preview settings"),
        `@tag:preview`,
        ["@stable", "@tag:experimental"]
      ),
      this.createMutuallyExclusiveToggleAction(
        "experimentalSettingsSearch",
        localize("experimental", "Experimental"),
        localize("experimentalSettingsSearchTooltip", "Show experimental settings"),
        `@tag:experimental`,
        ["@stable", "@tag:preview"]
      ),
      new Separator(),
      this.createToggleAction(
        "advancedSettingsSearch",
        localize("advancedSettingsSearch", "Advanced"),
        localize("advancedSettingsSearchTooltip", "Show advanced settings"),
        `@tag:${ADVANCED_SETTING_TAG}`
      )
    ];
  }
};
SettingsSearchFilterDropdownMenuActionViewItem = __decorateClass([
  __decorateParam(4, IContextMenuService)
], SettingsSearchFilterDropdownMenuActionViewItem);
export {
  SettingsSearchFilterDropdownMenuActionViewItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHByZWZlcmVuY2VzXFxicm93c2VyXFxzZXR0aW5nc1NlYXJjaE1lbnUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgQW5jaG9yQWxpZ25tZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcbmltcG9ydCB7IERyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2Ryb3Bkb3duL2Ryb3Bkb3duQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgSUFjdGlvblJ1bm5lciwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTdWdnZXN0Q29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0Q29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBTdWdnZXN0RW5hYmxlZElucHV0IH0gZnJvbSAnLi4vLi4vY29kZUVkaXRvci9icm93c2VyL3N1Z2dlc3RFbmFibGVkSW5wdXQvc3VnZ2VzdEVuYWJsZWRJbnB1dC5qcyc7XG5pbXBvcnQgeyBBRFZBTkNFRF9TRVRUSU5HX1RBRywgRVhURU5TSU9OX1NFVFRJTkdfVEFHLCBGRUFUVVJFX1NFVFRJTkdfVEFHLCBHRU5FUkFMX1RBR19TRVRUSU5HX1RBRywgSURfU0VUVElOR19UQUcsIExBTkdVQUdFX1NFVFRJTkdfVEFHLCBNT0RJRklFRF9TRVRUSU5HX1RBRywgUE9MSUNZX1NFVFRJTkdfVEFHIH0gZnJvbSAnLi4vY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcblxuZXhwb3J0IGNsYXNzIFNldHRpbmdzU2VhcmNoRmlsdGVyRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgc3VnZ2VzdENvbnRyb2xsZXI6IFN1Z2dlc3RDb250cm9sbGVyIHwgbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0b3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucyxcblx0XHRhY3Rpb25SdW5uZXI6IElBY3Rpb25SdW5uZXIgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzZWFyY2hXaWRnZXQ6IFN1Z2dlc3RFbmFibGVkSW5wdXQsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGFjdGlvbixcblx0XHRcdHsgZ2V0QWN0aW9uczogKCkgPT4gdGhpcy5nZXRBY3Rpb25zKCkgfSxcblx0XHRcdGNvbnRleHRNZW51U2VydmljZSxcblx0XHRcdHtcblx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0YWN0aW9uUnVubmVyLFxuXHRcdFx0XHRjbGFzc05hbWVzOiBhY3Rpb24uY2xhc3MsXG5cdFx0XHRcdGFuY2hvckFsaWdubWVudFByb3ZpZGVyOiAoKSA9PiBBbmNob3JBbGlnbm1lbnQuUklHSFQsXG5cdFx0XHRcdG1lbnVBc0NoaWxkOiB0cnVlXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdHRoaXMuc3VnZ2VzdENvbnRyb2xsZXIgPSBTdWdnZXN0Q29udHJvbGxlci5nZXQodGhpcy5zZWFyY2hXaWRnZXQuaW5wdXRXaWRnZXQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0fVxuXG5cdHByaXZhdGUgZG9TZWFyY2hXaWRnZXRBY3Rpb24ocXVlcnlUb0FwcGVuZDogc3RyaW5nLCB0cmlnZ2VyU3VnZ2VzdDogYm9vbGVhbikge1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNldFZhbHVlKHRoaXMuc2VhcmNoV2lkZ2V0LmdldFZhbHVlKCkudHJpbUVuZCgpICsgJyAnICsgcXVlcnlUb0FwcGVuZCk7XG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQuZm9jdXMoKTtcblx0XHRpZiAodHJpZ2dlclN1Z2dlc3QgJiYgdGhpcy5zdWdnZXN0Q29udHJvbGxlcikge1xuXHRcdFx0dGhpcy5zdWdnZXN0Q29udHJvbGxlci50cmlnZ2VyU3VnZ2VzdCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgY3JlYXRlZCBhY3Rpb24gYXBwZW5kcyBhIHF1ZXJ5IHRvIHRoZSBzZWFyY2ggd2lkZ2V0IHNlYXJjaCBzdHJpbmcuIEl0IG9wdGlvbmFsbHkgdHJpZ2dlcnMgc3VnZ2VzdGlvbnMuXG5cdCAqL1xuXHRwcml2YXRlIGNyZWF0ZUFjdGlvbihpZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCB0b29sdGlwOiBzdHJpbmcsIHF1ZXJ5VG9BcHBlbmQ6IHN0cmluZywgdHJpZ2dlclN1Z2dlc3Q6IGJvb2xlYW4pOiBJQWN0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQsXG5cdFx0XHRsYWJlbCxcblx0XHRcdHRvb2x0aXAsXG5cdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdHJ1bjogKCkgPT4geyB0aGlzLmRvU2VhcmNoV2lkZ2V0QWN0aW9uKHF1ZXJ5VG9BcHBlbmQsIHRyaWdnZXJTdWdnZXN0KTsgfVxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGNyZWF0ZWQgYWN0aW9uIGFwcGVuZHMgYSBxdWVyeSB0byB0aGUgc2VhcmNoIHdpZGdldCBzZWFyY2ggc3RyaW5nLCBpZiB0aGUgcXVlcnkgZG9lcyBub3QgZXhpc3QuXG5cdCAqIE90aGVyd2lzZSwgaXQgcmVtb3ZlcyB0aGUgcXVlcnkgZnJvbSB0aGUgc2VhcmNoIHdpZGdldCBzZWFyY2ggc3RyaW5nLlxuXHQgKiBUaGUgYWN0aW9uIGRvZXMgbm90IHRyaWdnZXIgc3VnZ2VzdGlvbnMgYWZ0ZXIgYWRkaW5nIG9yIHJlbW92aW5nIHRoZSBxdWVyeS5cblx0ICovXG5cdHByaXZhdGUgY3JlYXRlVG9nZ2xlQWN0aW9uKGlkOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIHRvb2x0aXA6IHN0cmluZywgcXVlcnlUb0FwcGVuZDogc3RyaW5nKTogSUFjdGlvbiB7XG5cdFx0Y29uc3Qgc3BsaXRDdXJyZW50UXVlcnkgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpLnNwbGl0KCcgJyk7XG5cdFx0Y29uc3QgcXVlcnlDb250YWluc1F1ZXJ5VG9BcHBlbmQgPSBzcGxpdEN1cnJlbnRRdWVyeS5pbmNsdWRlcyhxdWVyeVRvQXBwZW5kKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQsXG5cdFx0XHRsYWJlbCxcblx0XHRcdHRvb2x0aXAsXG5cdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdGNoZWNrZWQ6IHF1ZXJ5Q29udGFpbnNRdWVyeVRvQXBwZW5kLFxuXHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdGlmICghcXVlcnlDb250YWluc1F1ZXJ5VG9BcHBlbmQpIHtcblx0XHRcdFx0XHRjb25zdCB0cmltbWVkQ3VycmVudFF1ZXJ5ID0gdGhpcy5zZWFyY2hXaWRnZXQuZ2V0VmFsdWUoKS50cmltRW5kKCk7XG5cdFx0XHRcdFx0Y29uc3QgbmV3UXVlcnkgPSB0cmltbWVkQ3VycmVudFF1ZXJ5ID8gdHJpbW1lZEN1cnJlbnRRdWVyeSArICcgJyArIHF1ZXJ5VG9BcHBlbmQgOiBxdWVyeVRvQXBwZW5kO1xuXHRcdFx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNldFZhbHVlKG5ld1F1ZXJ5KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBxdWVyeVdpdGhSZW1vdmVkVGFncyA9IHRoaXMuc2VhcmNoV2lkZ2V0LmdldFZhbHVlKCkuc3BsaXQoJyAnKVxuXHRcdFx0XHRcdFx0LmZpbHRlcih3b3JkID0+IHdvcmQgIT09IHF1ZXJ5VG9BcHBlbmQpLmpvaW4oJyAnKTtcblx0XHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZXRWYWx1ZShxdWVyeVdpdGhSZW1vdmVkVGFncyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVNdXR1YWxseUV4Y2x1c2l2ZVRvZ2dsZUFjdGlvbihpZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCB0b29sdGlwOiBzdHJpbmcsIGZpbHRlcjogc3RyaW5nLCBleGNsdWRlRmlsdGVyczogc3RyaW5nW10pOiBJQWN0aW9uIHtcblx0XHRjb25zdCBpc0ZpbHRlckVuYWJsZWQgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpLnNwbGl0KCcgJykuaW5jbHVkZXMoZmlsdGVyKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQsXG5cdFx0XHRsYWJlbCxcblx0XHRcdHRvb2x0aXAsXG5cdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdGNoZWNrZWQ6IGlzRmlsdGVyRW5hYmxlZCxcblx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRpZiAoaXNGaWx0ZXJFbmFibGVkKSB7XG5cdFx0XHRcdFx0Y29uc3QgcXVlcnlXaXRoUmVtb3ZlZFRhZ3MgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpLnNwbGl0KCcgJylcblx0XHRcdFx0XHRcdC5maWx0ZXIod29yZCA9PiB3b3JkICE9PSBmaWx0ZXIpLmpvaW4oJyAnKTtcblx0XHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZXRWYWx1ZShxdWVyeVdpdGhSZW1vdmVkVGFncyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bGV0IG5ld1F1ZXJ5ID0gdGhpcy5zZWFyY2hXaWRnZXQuZ2V0VmFsdWUoKS5zcGxpdCgnICcpXG5cdFx0XHRcdFx0XHQuZmlsdGVyKHdvcmQgPT4gIWV4Y2x1ZGVGaWx0ZXJzLmluY2x1ZGVzKHdvcmQpICYmIHdvcmQgIT09IGZpbHRlcilcblx0XHRcdFx0XHRcdC5qb2luKCcgJylcblx0XHRcdFx0XHRcdC50cmltRW5kKCk7XG5cdFx0XHRcdFx0bmV3UXVlcnkgPSBuZXdRdWVyeSA/IG5ld1F1ZXJ5ICsgJyAnICsgZmlsdGVyIDogZmlsdGVyO1xuXHRcdFx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNldFZhbHVlKG5ld1F1ZXJ5KTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRnZXRBY3Rpb25zKCk6IElBY3Rpb25bXSB7XG5cdFx0cmV0dXJuIFtcblx0XHRcdHRoaXMuY3JlYXRlVG9nZ2xlQWN0aW9uKFxuXHRcdFx0XHQnbW9kaWZpZWRTZXR0aW5nc1NlYXJjaCcsXG5cdFx0XHRcdGxvY2FsaXplKCdtb2RpZmllZFNldHRpbmdzU2VhcmNoJywgXCJNb2RpZmllZFwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ21vZGlmaWVkU2V0dGluZ3NTZWFyY2hUb29sdGlwJywgXCJBZGQgb3IgcmVtb3ZlIG1vZGlmaWVkIHNldHRpbmdzIGZpbHRlclwiKSxcblx0XHRcdFx0YEAke01PRElGSUVEX1NFVFRJTkdfVEFHfWBcblx0XHRcdCksXG5cdFx0XHRuZXcgU2VwYXJhdG9yKCksXG5cdFx0XHR0aGlzLmNyZWF0ZUFjdGlvbihcblx0XHRcdFx0J2V4dFNldHRpbmdzU2VhcmNoJyxcblx0XHRcdFx0bG9jYWxpemUoJ2V4dFNldHRpbmdzU2VhcmNoJywgXCJFeHRlbnNpb24gSUQuLi5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdleHRTZXR0aW5nc1NlYXJjaFRvb2x0aXAnLCBcIkFkZCBleHRlbnNpb24gSUQgZmlsdGVyXCIpLFxuXHRcdFx0XHRgQCR7RVhURU5TSU9OX1NFVFRJTkdfVEFHfWAsXG5cdFx0XHRcdHRydWVcblx0XHRcdCksXG5cdFx0XHR0aGlzLmNyZWF0ZUFjdGlvbihcblx0XHRcdFx0J2ZlYXR1cmVzU2V0dGluZ3NTZWFyY2gnLFxuXHRcdFx0XHRsb2NhbGl6ZSgnZmVhdHVyZVNldHRpbmdzU2VhcmNoJywgXCJGZWF0dXJlLi4uXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnZmVhdHVyZVNldHRpbmdzU2VhcmNoVG9vbHRpcCcsIFwiQWRkIGZlYXR1cmUgZmlsdGVyXCIpLFxuXHRcdFx0XHRgQCR7RkVBVFVSRV9TRVRUSU5HX1RBR31gLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpLFxuXHRcdFx0dGhpcy5jcmVhdGVBY3Rpb24oXG5cdFx0XHRcdCd0YWdTZXR0aW5nc1NlYXJjaCcsXG5cdFx0XHRcdGxvY2FsaXplKCd0YWdTZXR0aW5nc1NlYXJjaCcsIFwiVGFnLi4uXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgndGFnU2V0dGluZ3NTZWFyY2hUb29sdGlwJywgXCJBZGQgdGFnIGZpbHRlclwiKSxcblx0XHRcdFx0YEAke0dFTkVSQUxfVEFHX1NFVFRJTkdfVEFHfWAsXG5cdFx0XHRcdHRydWVcblx0XHRcdCksXG5cdFx0XHR0aGlzLmNyZWF0ZUFjdGlvbihcblx0XHRcdFx0J2xhbmdTZXR0aW5nc1NlYXJjaCcsXG5cdFx0XHRcdGxvY2FsaXplKCdsYW5nU2V0dGluZ3NTZWFyY2gnLCBcIkxhbmd1YWdlLi4uXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnbGFuZ1NldHRpbmdzU2VhcmNoVG9vbHRpcCcsIFwiQWRkIGxhbmd1YWdlIElEIGZpbHRlclwiKSxcblx0XHRcdFx0YEAke0xBTkdVQUdFX1NFVFRJTkdfVEFHfWAsXG5cdFx0XHRcdHRydWVcblx0XHRcdCksXG5cdFx0XHR0aGlzLmNyZWF0ZUFjdGlvbihcblx0XHRcdFx0J2lkU2V0dGluZ3NTZWFyY2gnLFxuXHRcdFx0XHRsb2NhbGl6ZSgnaWRTZXR0aW5nc1NlYXJjaCcsIFwiU2V0dGluZyBJRC4uLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2lkU2V0dGluZ3NTZWFyY2hUb29sdGlwJywgXCJBZGQgU2V0dGluZyBJRCBmaWx0ZXJcIiksXG5cdFx0XHRcdGBAJHtJRF9TRVRUSU5HX1RBR31gLFxuXHRcdFx0XHRmYWxzZVxuXHRcdFx0KSxcblx0XHRcdG5ldyBTZXBhcmF0b3IoKSxcblx0XHRcdHRoaXMuY3JlYXRlVG9nZ2xlQWN0aW9uKFxuXHRcdFx0XHQnb25saW5lU2V0dGluZ3NTZWFyY2gnLFxuXHRcdFx0XHRsb2NhbGl6ZSgnb25saW5lU2V0dGluZ3NTZWFyY2gnLCBcIk9ubGluZSBzZXJ2aWNlc1wiKSxcblx0XHRcdFx0bG9jYWxpemUoJ29ubGluZVNldHRpbmdzU2VhcmNoVG9vbHRpcCcsIFwiU2hvdyBzZXR0aW5ncyBmb3Igb25saW5lIHNlcnZpY2VzXCIpLFxuXHRcdFx0XHQnQHRhZzp1c2VzT25saW5lU2VydmljZXMnXG5cdFx0XHQpLFxuXHRcdFx0dGhpcy5jcmVhdGVUb2dnbGVBY3Rpb24oXG5cdFx0XHRcdCdwb2xpY3lTZXR0aW5nc1NlYXJjaCcsXG5cdFx0XHRcdGxvY2FsaXplKCdwb2xpY3lTZXR0aW5nc1NlYXJjaCcsIFwiT3JnYW5pemF0aW9uIHBvbGljaWVzXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgncG9saWN5U2V0dGluZ3NTZWFyY2hUb29sdGlwJywgXCJTaG93IG9yZ2FuaXphdGlvbiBwb2xpY3kgc2V0dGluZ3NcIiksXG5cdFx0XHRcdGBAJHtQT0xJQ1lfU0VUVElOR19UQUd9YFxuXHRcdFx0KSxcblx0XHRcdG5ldyBTZXBhcmF0b3IoKSxcblx0XHRcdHRoaXMuY3JlYXRlTXV0dWFsbHlFeGNsdXNpdmVUb2dnbGVBY3Rpb24oXG5cdFx0XHRcdCdzdGFibGVTZXR0aW5nc1NlYXJjaCcsXG5cdFx0XHRcdGxvY2FsaXplKCdzdGFibGVTZXR0aW5ncycsIFwiU3RhYmxlXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnc3RhYmxlU2V0dGluZ3NTZWFyY2hUb29sdGlwJywgXCJTaG93IHN0YWJsZSBzZXR0aW5nc1wiKSxcblx0XHRcdFx0YEBzdGFibGVgLFxuXHRcdFx0XHRbJ0B0YWc6cHJldmlldycsICdAdGFnOmV4cGVyaW1lbnRhbCddXG5cdFx0XHQpLFxuXHRcdFx0dGhpcy5jcmVhdGVNdXR1YWxseUV4Y2x1c2l2ZVRvZ2dsZUFjdGlvbihcblx0XHRcdFx0J3ByZXZpZXdTZXR0aW5nc1NlYXJjaCcsXG5cdFx0XHRcdGxvY2FsaXplKCdwcmV2aWV3U2V0dGluZ3MnLCBcIlByZXZpZXdcIiksXG5cdFx0XHRcdGxvY2FsaXplKCdwcmV2aWV3U2V0dGluZ3NTZWFyY2hUb29sdGlwJywgXCJTaG93IHByZXZpZXcgc2V0dGluZ3NcIiksXG5cdFx0XHRcdGBAdGFnOnByZXZpZXdgLFxuXHRcdFx0XHRbJ0BzdGFibGUnLCAnQHRhZzpleHBlcmltZW50YWwnXVxuXHRcdFx0KSxcblx0XHRcdHRoaXMuY3JlYXRlTXV0dWFsbHlFeGNsdXNpdmVUb2dnbGVBY3Rpb24oXG5cdFx0XHRcdCdleHBlcmltZW50YWxTZXR0aW5nc1NlYXJjaCcsXG5cdFx0XHRcdGxvY2FsaXplKCdleHBlcmltZW50YWwnLCBcIkV4cGVyaW1lbnRhbFwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2V4cGVyaW1lbnRhbFNldHRpbmdzU2VhcmNoVG9vbHRpcCcsIFwiU2hvdyBleHBlcmltZW50YWwgc2V0dGluZ3NcIiksXG5cdFx0XHRcdGBAdGFnOmV4cGVyaW1lbnRhbGAsXG5cdFx0XHRcdFsnQHN0YWJsZScsICdAdGFnOnByZXZpZXcnXVxuXHRcdFx0KSxcblx0XHRcdG5ldyBTZXBhcmF0b3IoKSxcblx0XHRcdHRoaXMuY3JlYXRlVG9nZ2xlQWN0aW9uKFxuXHRcdFx0XHQnYWR2YW5jZWRTZXR0aW5nc1NlYXJjaCcsXG5cdFx0XHRcdGxvY2FsaXplKCdhZHZhbmNlZFNldHRpbmdzU2VhcmNoJywgXCJBZHZhbmNlZFwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2FkdmFuY2VkU2V0dGluZ3NTZWFyY2hUb29sdGlwJywgXCJTaG93IGFkdmFuY2VkIHNldHRpbmdzXCIpLFxuXHRcdFx0XHRgQHRhZzoke0FEVkFOQ0VEX1NFVFRJTkdfVEFHfWAsXG5cdFx0XHQpLFxuXHRcdF07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBaUMsaUJBQWlCO0FBQ2xELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMsc0JBQXNCLHVCQUF1QixxQkFBcUIseUJBQXlCLGdCQUFnQixzQkFBc0Isc0JBQXNCLDBCQUEwQjtBQUVuTCxJQUFNLGlEQUFOLGNBQTZELDJCQUEyQjtBQUFBLEVBRzlGLFlBQ0MsUUFDQSxTQUNBLGNBQ2lCLGNBQ0ksb0JBQ3BCO0FBQ0Q7QUFBQSxNQUFNO0FBQUEsTUFDTCxFQUFFLFlBQVksTUFBTSxLQUFLLFdBQVcsRUFBRTtBQUFBLE1BQ3RDO0FBQUEsTUFDQTtBQUFBLFFBQ0MsR0FBRztBQUFBLFFBQ0g7QUFBQSxRQUNBLFlBQVksT0FBTztBQUFBLFFBQ25CLHlCQUF5QixNQUFNLGdCQUFnQjtBQUFBLFFBQy9DLGFBQWE7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQWJpQjtBQWVqQixTQUFLLG9CQUFvQixrQkFBa0IsSUFBSSxLQUFLLGFBQWEsV0FBVztBQUFBLEVBQzdFO0FBQUEsRUFFUyxPQUFPLFdBQThCO0FBQzdDLFVBQU0sT0FBTyxTQUFTO0FBQUEsRUFDdkI7QUFBQSxFQUVRLHFCQUFxQixlQUF1QixnQkFBeUI7QUFDNUUsU0FBSyxhQUFhLFNBQVMsS0FBSyxhQUFhLFNBQVMsRUFBRSxRQUFRLElBQUksTUFBTSxhQUFhO0FBQ3ZGLFNBQUssYUFBYSxNQUFNO0FBQ3hCLFFBQUksa0JBQWtCLEtBQUssbUJBQW1CO0FBQzdDLFdBQUssa0JBQWtCLGVBQWU7QUFBQSxJQUN2QztBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLGFBQWEsSUFBWSxPQUFlLFNBQWlCLGVBQXVCLGdCQUFrQztBQUN6SCxXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxPQUFPO0FBQUEsTUFDUCxTQUFTO0FBQUEsTUFDVCxLQUFLLE1BQU07QUFBRSxhQUFLLHFCQUFxQixlQUFlLGNBQWM7QUFBQSxNQUFHO0FBQUEsSUFDeEU7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT1EsbUJBQW1CLElBQVksT0FBZSxTQUFpQixlQUFnQztBQUN0RyxVQUFNLG9CQUFvQixLQUFLLGFBQWEsU0FBUyxFQUFFLE1BQU0sR0FBRztBQUNoRSxVQUFNLDZCQUE2QixrQkFBa0IsU0FBUyxhQUFhO0FBQzNFLFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLE9BQU87QUFBQSxNQUNQLFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULEtBQUssTUFBTTtBQUNWLFlBQUksQ0FBQyw0QkFBNEI7QUFDaEMsZ0JBQU0sc0JBQXNCLEtBQUssYUFBYSxTQUFTLEVBQUUsUUFBUTtBQUNqRSxnQkFBTSxXQUFXLHNCQUFzQixzQkFBc0IsTUFBTSxnQkFBZ0I7QUFDbkYsZUFBSyxhQUFhLFNBQVMsUUFBUTtBQUFBLFFBQ3BDLE9BQU87QUFDTixnQkFBTSx1QkFBdUIsS0FBSyxhQUFhLFNBQVMsRUFBRSxNQUFNLEdBQUcsRUFDakUsT0FBTyxVQUFRLFNBQVMsYUFBYSxFQUFFLEtBQUssR0FBRztBQUNqRCxlQUFLLGFBQWEsU0FBUyxvQkFBb0I7QUFBQSxRQUNoRDtBQUNBLGFBQUssYUFBYSxNQUFNO0FBQUEsTUFDekI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsb0NBQW9DLElBQVksT0FBZSxTQUFpQixRQUFnQixnQkFBbUM7QUFDMUksVUFBTSxrQkFBa0IsS0FBSyxhQUFhLFNBQVMsRUFBRSxNQUFNLEdBQUcsRUFBRSxTQUFTLE1BQU07QUFDL0UsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsT0FBTztBQUFBLE1BQ1AsU0FBUztBQUFBLE1BQ1QsU0FBUztBQUFBLE1BQ1QsS0FBSyxNQUFNO0FBQ1YsWUFBSSxpQkFBaUI7QUFDcEIsZ0JBQU0sdUJBQXVCLEtBQUssYUFBYSxTQUFTLEVBQUUsTUFBTSxHQUFHLEVBQ2pFLE9BQU8sVUFBUSxTQUFTLE1BQU0sRUFBRSxLQUFLLEdBQUc7QUFDMUMsZUFBSyxhQUFhLFNBQVMsb0JBQW9CO0FBQUEsUUFDaEQsT0FBTztBQUNOLGNBQUksV0FBVyxLQUFLLGFBQWEsU0FBUyxFQUFFLE1BQU0sR0FBRyxFQUNuRCxPQUFPLFVBQVEsQ0FBQyxlQUFlLFNBQVMsSUFBSSxLQUFLLFNBQVMsTUFBTSxFQUNoRSxLQUFLLEdBQUcsRUFDUixRQUFRO0FBQ1YscUJBQVcsV0FBVyxXQUFXLE1BQU0sU0FBUztBQUNoRCxlQUFLLGFBQWEsU0FBUyxRQUFRO0FBQUEsUUFDcEM7QUFDQSxhQUFLLGFBQWEsTUFBTTtBQUFBLE1BQ3pCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLGFBQXdCO0FBQ3ZCLFdBQU87QUFBQSxNQUNOLEtBQUs7QUFBQSxRQUNKO0FBQUEsUUFDQSxTQUFTLDBCQUEwQixVQUFVO0FBQUEsUUFDN0MsU0FBUyxpQ0FBaUMsd0NBQXdDO0FBQUEsUUFDbEYsSUFBSSxvQkFBb0I7QUFBQSxNQUN6QjtBQUFBLE1BQ0EsSUFBSSxVQUFVO0FBQUEsTUFDZCxLQUFLO0FBQUEsUUFDSjtBQUFBLFFBQ0EsU0FBUyxxQkFBcUIsaUJBQWlCO0FBQUEsUUFDL0MsU0FBUyw0QkFBNEIseUJBQXlCO0FBQUEsUUFDOUQsSUFBSSxxQkFBcUI7QUFBQSxRQUN6QjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUs7QUFBQSxRQUNKO0FBQUEsUUFDQSxTQUFTLHlCQUF5QixZQUFZO0FBQUEsUUFDOUMsU0FBUyxnQ0FBZ0Msb0JBQW9CO0FBQUEsUUFDN0QsSUFBSSxtQkFBbUI7QUFBQSxRQUN2QjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUs7QUFBQSxRQUNKO0FBQUEsUUFDQSxTQUFTLHFCQUFxQixRQUFRO0FBQUEsUUFDdEMsU0FBUyw0QkFBNEIsZ0JBQWdCO0FBQUEsUUFDckQsSUFBSSx1QkFBdUI7QUFBQSxRQUMzQjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUs7QUFBQSxRQUNKO0FBQUEsUUFDQSxTQUFTLHNCQUFzQixhQUFhO0FBQUEsUUFDNUMsU0FBUyw2QkFBNkIsd0JBQXdCO0FBQUEsUUFDOUQsSUFBSSxvQkFBb0I7QUFBQSxRQUN4QjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUs7QUFBQSxRQUNKO0FBQUEsUUFDQSxTQUFTLG9CQUFvQixlQUFlO0FBQUEsUUFDNUMsU0FBUywyQkFBMkIsdUJBQXVCO0FBQUEsUUFDM0QsSUFBSSxjQUFjO0FBQUEsUUFDbEI7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVU7QUFBQSxNQUNkLEtBQUs7QUFBQSxRQUNKO0FBQUEsUUFDQSxTQUFTLHdCQUF3QixpQkFBaUI7QUFBQSxRQUNsRCxTQUFTLCtCQUErQixtQ0FBbUM7QUFBQSxRQUMzRTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUs7QUFBQSxRQUNKO0FBQUEsUUFDQSxTQUFTLHdCQUF3Qix1QkFBdUI7QUFBQSxRQUN4RCxTQUFTLCtCQUErQixtQ0FBbUM7QUFBQSxRQUMzRSxJQUFJLGtCQUFrQjtBQUFBLE1BQ3ZCO0FBQUEsTUFDQSxJQUFJLFVBQVU7QUFBQSxNQUNkLEtBQUs7QUFBQSxRQUNKO0FBQUEsUUFDQSxTQUFTLGtCQUFrQixRQUFRO0FBQUEsUUFDbkMsU0FBUywrQkFBK0Isc0JBQXNCO0FBQUEsUUFDOUQ7QUFBQSxRQUNBLENBQUMsZ0JBQWdCLG1CQUFtQjtBQUFBLE1BQ3JDO0FBQUEsTUFDQSxLQUFLO0FBQUEsUUFDSjtBQUFBLFFBQ0EsU0FBUyxtQkFBbUIsU0FBUztBQUFBLFFBQ3JDLFNBQVMsZ0NBQWdDLHVCQUF1QjtBQUFBLFFBQ2hFO0FBQUEsUUFDQSxDQUFDLFdBQVcsbUJBQW1CO0FBQUEsTUFDaEM7QUFBQSxNQUNBLEtBQUs7QUFBQSxRQUNKO0FBQUEsUUFDQSxTQUFTLGdCQUFnQixjQUFjO0FBQUEsUUFDdkMsU0FBUyxxQ0FBcUMsNEJBQTRCO0FBQUEsUUFDMUU7QUFBQSxRQUNBLENBQUMsV0FBVyxjQUFjO0FBQUEsTUFDM0I7QUFBQSxNQUNBLElBQUksVUFBVTtBQUFBLE1BQ2QsS0FBSztBQUFBLFFBQ0o7QUFBQSxRQUNBLFNBQVMsMEJBQTBCLFVBQVU7QUFBQSxRQUM3QyxTQUFTLGlDQUFpQyx3QkFBd0I7QUFBQSxRQUNsRSxRQUFRLG9CQUFvQjtBQUFBLE1BQzdCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQXBNYSxpREFBTjtBQUFBLEVBUUo7QUFBQSxHQVJVOyIsCiAgIm5hbWVzIjogW10KfQo=
