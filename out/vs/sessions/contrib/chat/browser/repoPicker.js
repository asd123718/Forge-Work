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
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { IActionWidgetService } from "../../../../platform/actionWidget/browser/actionWidget.js";
import { ActionListItemKind } from "../../../../platform/actionWidget/browser/actionList.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
const OPEN_REPO_COMMAND = "github.copilot.chat.cloudSessions.openRepository";
const STORAGE_KEY_LAST_REPO = "agentSessions.lastPickedRepo";
const STORAGE_KEY_RECENT_REPOS = "agentSessions.recentlyPickedRepos";
const MAX_RECENT_REPOS = 10;
const FILTER_THRESHOLD = 10;
let RepoPicker = class extends Disposable {
  constructor(actionWidgetService, storageService, commandService) {
    super();
    this.actionWidgetService = actionWidgetService;
    this.storageService = storageService;
    this.commandService = commandService;
    this._onDidSelectRepo = this._register(new Emitter());
    this.onDidSelectRepo = this._onDidSelectRepo.event;
    this._renderDisposables = this._register(new DisposableStore());
    this._recentlyPickedRepos = [];
    try {
      const last = this.storageService.get(STORAGE_KEY_LAST_REPO, StorageScope.PROFILE);
      if (last) {
        this._selectedRepo = JSON.parse(last);
      }
    } catch {
    }
    try {
      const stored = this.storageService.get(STORAGE_KEY_RECENT_REPOS, StorageScope.PROFILE);
      if (stored) {
        this._recentlyPickedRepos = JSON.parse(stored);
      }
    } catch {
    }
  }
  get selectedRepo() {
    return this._selectedRepo?.id;
  }
  /**
   * Renders the repo picker trigger button into the given container.
   * Returns the container element.
   */
  render(container) {
    this._renderDisposables.clear();
    const slot = dom.append(container, dom.$(".sessions-chat-picker-slot"));
    this._renderDisposables.add({ dispose: () => slot.remove() });
    const trigger = dom.append(slot, dom.$("a.action-label"));
    trigger.tabIndex = 0;
    trigger.role = "button";
    this._triggerElement = trigger;
    this._updateTriggerLabel();
    this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.CLICK, (e) => {
      dom.EventHelper.stop(e, true);
      this.showPicker();
    }));
    this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        dom.EventHelper.stop(e, true);
        this.showPicker();
      }
    }));
    return slot;
  }
  /**
   * Shows the repo picker dropdown anchored to the trigger element.
   */
  showPicker() {
    if (!this._triggerElement || this.actionWidgetService.isVisible) {
      return;
    }
    const items = this._buildItems();
    const showFilter = items.filter((i) => i.kind === ActionListItemKind.Action).length > FILTER_THRESHOLD;
    const triggerElement = this._triggerElement;
    const delegate = {
      onSelect: (item) => {
        this.actionWidgetService.hide();
        if (item.id === "browse") {
          this._browseForRepo();
        } else {
          this._selectRepo(item);
        }
      },
      onHide: () => {
        triggerElement.focus();
      }
    };
    this.actionWidgetService.show(
      "repoPicker",
      false,
      items,
      delegate,
      this._triggerElement,
      void 0,
      [],
      {
        getAriaLabel: (item) => item.label ?? "",
        getWidgetAriaLabel: () => localize("repoPicker.ariaLabel", "Repository Picker")
      },
      showFilter ? { showFilter: true, filterPlaceholder: localize("repoPicker.filter", "Filter repositories...") } : void 0
    );
  }
  /**
   * Programmatically set the selected repository.
   */
  setSelectedRepo(repoPath) {
    this._selectRepo({ id: repoPath, name: repoPath });
  }
  /**
   * Clears the selected repository.
   */
  clearSelection() {
    this._selectedRepo = void 0;
    this._updateTriggerLabel();
  }
  _selectRepo(item) {
    this._selectedRepo = item;
    this._addToRecentlyPicked(item);
    this.storageService.store(STORAGE_KEY_LAST_REPO, JSON.stringify(item), StorageScope.PROFILE, StorageTarget.MACHINE);
    this._updateTriggerLabel();
    this._onDidSelectRepo.fire(item.id);
  }
  async _browseForRepo() {
    try {
      const result = await this.commandService.executeCommand(OPEN_REPO_COMMAND);
      if (result) {
        this._selectRepo({ id: result, name: result });
      }
    } catch {
    }
  }
  _addToRecentlyPicked(item) {
    this._recentlyPickedRepos = [
      { id: item.id, name: item.name },
      ...this._recentlyPickedRepos.filter((r) => r.id !== item.id)
    ].slice(0, MAX_RECENT_REPOS);
    this.storageService.store(STORAGE_KEY_RECENT_REPOS, JSON.stringify(this._recentlyPickedRepos), StorageScope.PROFILE, StorageTarget.MACHINE);
  }
  _buildItems() {
    const seenIds = /* @__PURE__ */ new Set();
    const items = [];
    if (this._selectedRepo) {
      seenIds.add(this._selectedRepo.id);
      items.push({
        kind: ActionListItemKind.Action,
        label: this._selectedRepo.name,
        group: { title: "", icon: Codicon.repo },
        item: this._selectedRepo
      });
    }
    const dedupedRepos = this._recentlyPickedRepos.filter((r) => !seenIds.has(r.id));
    dedupedRepos.sort((a, b) => a.name.localeCompare(b.name));
    for (const repo of dedupedRepos) {
      seenIds.add(repo.id);
      items.push({
        kind: ActionListItemKind.Action,
        label: repo.name,
        group: { title: "", icon: Codicon.repo },
        item: repo,
        onRemove: () => this._removeRepo(repo.id)
      });
    }
    if (items.length > 0) {
      items.push({ kind: ActionListItemKind.Separator, label: "" });
    }
    items.push({
      kind: ActionListItemKind.Action,
      label: localize("browseRepo", "Browse..."),
      group: { title: "", icon: Codicon.search },
      item: { id: "browse", name: localize("browseRepo", "Browse...") }
    });
    return items;
  }
  _removeRepo(repoId) {
    this._recentlyPickedRepos = this._recentlyPickedRepos.filter((r) => r.id !== repoId);
    this.storageService.store(STORAGE_KEY_RECENT_REPOS, JSON.stringify(this._recentlyPickedRepos), StorageScope.PROFILE, StorageTarget.MACHINE);
    this.actionWidgetService.hide();
    this.showPicker();
  }
  _updateTriggerLabel() {
    if (!this._triggerElement) {
      return;
    }
    dom.clearNode(this._triggerElement);
    const label = this._selectedRepo?.name ?? localize("pickRepo", "Pick Repository");
    dom.append(this._triggerElement, renderIcon(Codicon.repo));
    const labelSpan = dom.append(this._triggerElement, dom.$("span.sessions-chat-dropdown-label"));
    labelSpan.textContent = label;
    dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));
    this._triggerElement.ariaLabel = localize("repoPicker.triggerAriaLabel", "Pick Repository, {0}", label);
  }
};
RepoPicker = __decorateClass([
  __decorateParam(0, IActionWidgetService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, ICommandService)
], RepoPicker);
export {
  RepoPicker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcYnJvd3NlclxccmVwb1BpY2tlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25MaXN0SXRlbUtpbmQsIElBY3Rpb25MaXN0RGVsZWdhdGUsIElBY3Rpb25MaXN0SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbkxpc3QuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcblxuY29uc3QgT1BFTl9SRVBPX0NPTU1BTkQgPSAnZ2l0aHViLmNvcGlsb3QuY2hhdC5jbG91ZFNlc3Npb25zLm9wZW5SZXBvc2l0b3J5JztcbmNvbnN0IFNUT1JBR0VfS0VZX0xBU1RfUkVQTyA9ICdhZ2VudFNlc3Npb25zLmxhc3RQaWNrZWRSZXBvJztcbmNvbnN0IFNUT1JBR0VfS0VZX1JFQ0VOVF9SRVBPUyA9ICdhZ2VudFNlc3Npb25zLnJlY2VudGx5UGlja2VkUmVwb3MnO1xuY29uc3QgTUFYX1JFQ0VOVF9SRVBPUyA9IDEwO1xuY29uc3QgRklMVEVSX1RIUkVTSE9MRCA9IDEwO1xuXG5pbnRlcmZhY2UgSVJlcG9JdGVtIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xufVxuXG4vKipcbiAqIEEgc2VsZi1jb250YWluZWQgd2lkZ2V0IGZvciBzZWxlY3RpbmcgdGhlIHJlcG9zaXRvcnkgaW4gY2xvdWQgc2Vzc2lvbnMuXG4gKiBVc2VzIHRoZSBgZ2l0aHViLmNvcGlsb3QuY2hhdC5jbG91ZFNlc3Npb25zLm9wZW5SZXBvc2l0b3J5YCBjb21tYW5kIGZvclxuICogYnJvd3NpbmcgcmVwb3NpdG9yaWVzLiBNYW5hZ2VzIHJlY2VudGx5IHVzZWQgcmVwb3MgaW4gc3RvcmFnZS5cbiAqIEJlaGF2ZXMgbGlrZSBGb2xkZXJQaWNrZXI6IHRyaWdnZXIgYnV0dG9uIHdpdGggZHJvcGRvd24sIHN0b3JhZ2UgcGVyc2lzdGVuY2UsXG4gKiByZWNlbnRseSB1c2VkIGxpc3Qgd2l0aCByZW1vdmUgYnV0dG9ucy5cbiAqL1xuZXhwb3J0IGNsYXNzIFJlcG9QaWNrZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNlbGVjdFJlcG8gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNlbGVjdFJlcG86IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vbkRpZFNlbGVjdFJlcG8uZXZlbnQ7XG5cblx0cHJpdmF0ZSBfdHJpZ2dlckVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZW5kZXJEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSBfc2VsZWN0ZWRSZXBvOiBJUmVwb0l0ZW0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3JlY2VudGx5UGlja2VkUmVwb3M6IElSZXBvSXRlbVtdID0gW107XG5cblx0Z2V0IHNlbGVjdGVkUmVwbygpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zZWxlY3RlZFJlcG8/LmlkO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBY3Rpb25XaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWN0aW9uV2lkZ2V0U2VydmljZTogSUFjdGlvbldpZGdldFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBSZXN0b3JlIGxhc3QgcGlja2VkIHJlcG9cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbGFzdCA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFNUT1JBR0VfS0VZX0xBU1RfUkVQTywgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdFx0aWYgKGxhc3QpIHtcblx0XHRcdFx0dGhpcy5fc2VsZWN0ZWRSZXBvID0gSlNPTi5wYXJzZShsYXN0KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblxuXHRcdC8vIFJlc3RvcmUgcmVjZW50bHkgcGlja2VkIHJlcG9zXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHN0b3JlZCA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFNUT1JBR0VfS0VZX1JFQ0VOVF9SRVBPUywgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdFx0aWYgKHN0b3JlZCkge1xuXHRcdFx0XHR0aGlzLl9yZWNlbnRseVBpY2tlZFJlcG9zID0gSlNPTi5wYXJzZShzdG9yZWQpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlbmRlcnMgdGhlIHJlcG8gcGlja2VyIHRyaWdnZXIgYnV0dG9uIGludG8gdGhlIGdpdmVuIGNvbnRhaW5lci5cblx0ICogUmV0dXJucyB0aGUgY29udGFpbmVyIGVsZW1lbnQuXG5cdCAqL1xuXHRyZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3Qgc2xvdCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLnNlc3Npb25zLWNoYXQtcGlja2VyLXNsb3QnKSk7XG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gc2xvdC5yZW1vdmUoKSB9KTtcblxuXHRcdGNvbnN0IHRyaWdnZXIgPSBkb20uYXBwZW5kKHNsb3QsIGRvbS4kKCdhLmFjdGlvbi1sYWJlbCcpKTtcblx0XHR0cmlnZ2VyLnRhYkluZGV4ID0gMDtcblx0XHR0cmlnZ2VyLnJvbGUgPSAnYnV0dG9uJztcblx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudCA9IHRyaWdnZXI7XG5cblx0XHR0aGlzLl91cGRhdGVUcmlnZ2VyTGFiZWwoKTtcblxuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRyaWdnZXIsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIChlKSA9PiB7XG5cdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdHRoaXMuc2hvd1BpY2tlcigpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRyaWdnZXIsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIChlKSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5zaG93UGlja2VyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHNsb3Q7XG5cdH1cblxuXHQvKipcblx0ICogU2hvd3MgdGhlIHJlcG8gcGlja2VyIGRyb3Bkb3duIGFuY2hvcmVkIHRvIHRoZSB0cmlnZ2VyIGVsZW1lbnQuXG5cdCAqL1xuXHRzaG93UGlja2VyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fdHJpZ2dlckVsZW1lbnQgfHwgdGhpcy5hY3Rpb25XaWRnZXRTZXJ2aWNlLmlzVmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5fYnVpbGRJdGVtcygpO1xuXHRcdGNvbnN0IHNob3dGaWx0ZXIgPSBpdGVtcy5maWx0ZXIoaSA9PiBpLmtpbmQgPT09IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24pLmxlbmd0aCA+IEZJTFRFUl9USFJFU0hPTEQ7XG5cblx0XHRjb25zdCB0cmlnZ2VyRWxlbWVudCA9IHRoaXMuX3RyaWdnZXJFbGVtZW50O1xuXHRcdGNvbnN0IGRlbGVnYXRlOiBJQWN0aW9uTGlzdERlbGVnYXRlPElSZXBvSXRlbT4gPSB7XG5cdFx0XHRvblNlbGVjdDogKGl0ZW0pID0+IHtcblx0XHRcdFx0dGhpcy5hY3Rpb25XaWRnZXRTZXJ2aWNlLmhpZGUoKTtcblx0XHRcdFx0aWYgKGl0ZW0uaWQgPT09ICdicm93c2UnKSB7XG5cdFx0XHRcdFx0dGhpcy5fYnJvd3NlRm9yUmVwbygpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX3NlbGVjdFJlcG8oaXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRvbkhpZGU6ICgpID0+IHsgdHJpZ2dlckVsZW1lbnQuZm9jdXMoKTsgfSxcblx0XHR9O1xuXG5cdFx0dGhpcy5hY3Rpb25XaWRnZXRTZXJ2aWNlLnNob3c8SVJlcG9JdGVtPihcblx0XHRcdCdyZXBvUGlja2VyJyxcblx0XHRcdGZhbHNlLFxuXHRcdFx0aXRlbXMsXG5cdFx0XHRkZWxlZ2F0ZSxcblx0XHRcdHRoaXMuX3RyaWdnZXJFbGVtZW50LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0W10sXG5cdFx0XHR7XG5cdFx0XHRcdGdldEFyaWFMYWJlbDogKGl0ZW0pID0+IGl0ZW0ubGFiZWwgPz8gJycsXG5cdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbG9jYWxpemUoJ3JlcG9QaWNrZXIuYXJpYUxhYmVsJywgXCJSZXBvc2l0b3J5IFBpY2tlclwiKSxcblx0XHRcdH0sXG5cdFx0XHRzaG93RmlsdGVyID8geyBzaG93RmlsdGVyOiB0cnVlLCBmaWx0ZXJQbGFjZWhvbGRlcjogbG9jYWxpemUoJ3JlcG9QaWNrZXIuZmlsdGVyJywgXCJGaWx0ZXIgcmVwb3NpdG9yaWVzLi4uXCIpIH0gOiB1bmRlZmluZWQsXG5cdFx0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQcm9ncmFtbWF0aWNhbGx5IHNldCB0aGUgc2VsZWN0ZWQgcmVwb3NpdG9yeS5cblx0ICovXG5cdHNldFNlbGVjdGVkUmVwbyhyZXBvUGF0aDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VsZWN0UmVwbyh7IGlkOiByZXBvUGF0aCwgbmFtZTogcmVwb1BhdGggfSk7XG5cdH1cblxuXHQvKipcblx0ICogQ2xlYXJzIHRoZSBzZWxlY3RlZCByZXBvc2l0b3J5LlxuXHQgKi9cblx0Y2xlYXJTZWxlY3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VsZWN0ZWRSZXBvID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3VwZGF0ZVRyaWdnZXJMYWJlbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VsZWN0UmVwbyhpdGVtOiBJUmVwb0l0ZW0pOiB2b2lkIHtcblx0XHR0aGlzLl9zZWxlY3RlZFJlcG8gPSBpdGVtO1xuXHRcdHRoaXMuX2FkZFRvUmVjZW50bHlQaWNrZWQoaXRlbSk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShTVE9SQUdFX0tFWV9MQVNUX1JFUE8sIEpTT04uc3RyaW5naWZ5KGl0ZW0pLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR0aGlzLl91cGRhdGVUcmlnZ2VyTGFiZWwoKTtcblx0XHR0aGlzLl9vbkRpZFNlbGVjdFJlcG8uZmlyZShpdGVtLmlkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Jyb3dzZUZvclJlcG8oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nIHwgdW5kZWZpbmVkID0gYXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChPUEVOX1JFUE9fQ09NTUFORCk7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdHRoaXMuX3NlbGVjdFJlcG8oeyBpZDogcmVzdWx0LCBuYW1lOiByZXN1bHQgfSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBjb21tYW5kIHdhcyBjYW5jZWxsZWQgb3IgZmFpbGVkIFx1MjAxNCBub3RoaW5nIHRvIGRvXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYWRkVG9SZWNlbnRseVBpY2tlZChpdGVtOiBJUmVwb0l0ZW0pOiB2b2lkIHtcblx0XHR0aGlzLl9yZWNlbnRseVBpY2tlZFJlcG9zID0gW1xuXHRcdFx0eyBpZDogaXRlbS5pZCwgbmFtZTogaXRlbS5uYW1lIH0sXG5cdFx0XHQuLi50aGlzLl9yZWNlbnRseVBpY2tlZFJlcG9zLmZpbHRlcihyID0+IHIuaWQgIT09IGl0ZW0uaWQpLFxuXHRcdF0uc2xpY2UoMCwgTUFYX1JFQ0VOVF9SRVBPUyk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShTVE9SQUdFX0tFWV9SRUNFTlRfUkVQT1MsIEpTT04uc3RyaW5naWZ5KHRoaXMuX3JlY2VudGx5UGlja2VkUmVwb3MpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkSXRlbXMoKTogSUFjdGlvbkxpc3RJdGVtPElSZXBvSXRlbT5bXSB7XG5cdFx0Y29uc3Qgc2VlbklkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IGl0ZW1zOiBJQWN0aW9uTGlzdEl0ZW08SVJlcG9JdGVtPltdID0gW107XG5cblx0XHQvLyBDdXJyZW50bHkgc2VsZWN0ZWQgKHNob3duIGZpcnN0LCBjaGVja2VkKVxuXHRcdGlmICh0aGlzLl9zZWxlY3RlZFJlcG8pIHtcblx0XHRcdHNlZW5JZHMuYWRkKHRoaXMuX3NlbGVjdGVkUmVwby5pZCk7XG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbixcblx0XHRcdFx0bGFiZWw6IHRoaXMuX3NlbGVjdGVkUmVwby5uYW1lLFxuXHRcdFx0XHRncm91cDogeyB0aXRsZTogJycsIGljb246IENvZGljb24ucmVwbyB9LFxuXHRcdFx0XHRpdGVtOiB0aGlzLl9zZWxlY3RlZFJlcG8sXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBSZWNlbnRseSBwaWNrZWQgcmVwb3MgKHNvcnRlZCBieSBuYW1lKVxuXHRcdGNvbnN0IGRlZHVwZWRSZXBvcyA9IHRoaXMuX3JlY2VudGx5UGlja2VkUmVwb3MuZmlsdGVyKHIgPT4gIXNlZW5JZHMuaGFzKHIuaWQpKTtcblx0XHRkZWR1cGVkUmVwb3Muc29ydCgoYSwgYikgPT4gYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKSk7XG5cdFx0Zm9yIChjb25zdCByZXBvIG9mIGRlZHVwZWRSZXBvcykge1xuXHRcdFx0c2Vlbklkcy5hZGQocmVwby5pZCk7XG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbixcblx0XHRcdFx0bGFiZWw6IHJlcG8ubmFtZSxcblx0XHRcdFx0Z3JvdXA6IHsgdGl0bGU6ICcnLCBpY29uOiBDb2RpY29uLnJlcG8gfSxcblx0XHRcdFx0aXRlbTogcmVwbyxcblx0XHRcdFx0b25SZW1vdmU6ICgpID0+IHRoaXMuX3JlbW92ZVJlcG8ocmVwby5pZCksXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBTZXBhcmF0b3IgKyBCcm93c2UuLi5cblx0XHRpZiAoaXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0aXRlbXMucHVzaCh7IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IsIGxhYmVsOiAnJyB9KTtcblx0XHR9XG5cdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdicm93c2VSZXBvJywgXCJCcm93c2UuLi5cIiksXG5cdFx0XHRncm91cDogeyB0aXRsZTogJycsIGljb246IENvZGljb24uc2VhcmNoIH0sXG5cdFx0XHRpdGVtOiB7IGlkOiAnYnJvd3NlJywgbmFtZTogbG9jYWxpemUoJ2Jyb3dzZVJlcG8nLCBcIkJyb3dzZS4uLlwiKSB9LFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGl0ZW1zO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlUmVwbyhyZXBvSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3JlY2VudGx5UGlja2VkUmVwb3MgPSB0aGlzLl9yZWNlbnRseVBpY2tlZFJlcG9zLmZpbHRlcihyID0+IHIuaWQgIT09IHJlcG9JZCk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShTVE9SQUdFX0tFWV9SRUNFTlRfUkVQT1MsIEpTT04uc3RyaW5naWZ5KHRoaXMuX3JlY2VudGx5UGlja2VkUmVwb3MpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdC8vIFJlLXNob3cgcGlja2VyIHdpdGggdXBkYXRlZCBpdGVtc1xuXHRcdHRoaXMuYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKCk7XG5cdFx0dGhpcy5zaG93UGlja2VyKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVUcmlnZ2VyTGFiZWwoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl90cmlnZ2VyRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5fdHJpZ2dlckVsZW1lbnQpO1xuXHRcdGNvbnN0IGxhYmVsID0gdGhpcy5fc2VsZWN0ZWRSZXBvPy5uYW1lID8/IGxvY2FsaXplKCdwaWNrUmVwbycsIFwiUGljayBSZXBvc2l0b3J5XCIpO1xuXG5cdFx0ZG9tLmFwcGVuZCh0aGlzLl90cmlnZ2VyRWxlbWVudCwgcmVuZGVySWNvbihDb2RpY29uLnJlcG8pKTtcblx0XHRjb25zdCBsYWJlbFNwYW4gPSBkb20uYXBwZW5kKHRoaXMuX3RyaWdnZXJFbGVtZW50LCBkb20uJCgnc3Bhbi5zZXNzaW9ucy1jaGF0LWRyb3Bkb3duLWxhYmVsJykpO1xuXHRcdGxhYmVsU3Bhbi50ZXh0Q29udGVudCA9IGxhYmVsO1xuXHRcdGRvbS5hcHBlbmQodGhpcy5fdHJpZ2dlckVsZW1lbnQsIHJlbmRlckljb24oQ29kaWNvbi5jaGV2cm9uRG93bikpO1xuXG5cdFx0dGhpcy5fdHJpZ2dlckVsZW1lbnQuYXJpYUxhYmVsID0gbG9jYWxpemUoJ3JlcG9QaWNrZXIudHJpZ2dlckFyaWFMYWJlbCcsIFwiUGljayBSZXBvc2l0b3J5LCB7MH1cIiwgbGFiZWwpO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywwQkFBZ0U7QUFDekUsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx1QkFBdUI7QUFFaEMsTUFBTSxvQkFBb0I7QUFDMUIsTUFBTSx3QkFBd0I7QUFDOUIsTUFBTSwyQkFBMkI7QUFDakMsTUFBTSxtQkFBbUI7QUFDekIsTUFBTSxtQkFBbUI7QUFjbEIsSUFBTSxhQUFOLGNBQXlCLFdBQVc7QUFBQSxFQWUxQyxZQUN3QyxxQkFDTCxnQkFDQSxnQkFDakM7QUFDRCxVQUFNO0FBSmlDO0FBQ0w7QUFDQTtBQWhCbkMsU0FBaUIsbUJBQW1CLEtBQUssVUFBVSxJQUFJLFFBQWdCLENBQUM7QUFDeEUsU0FBUyxrQkFBaUMsS0FBSyxpQkFBaUI7QUFHaEUsU0FBaUIscUJBQXFCLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBRzFFLFNBQVEsdUJBQW9DLENBQUM7QUFjNUMsUUFBSTtBQUNILFlBQU0sT0FBTyxLQUFLLGVBQWUsSUFBSSx1QkFBdUIsYUFBYSxPQUFPO0FBQ2hGLFVBQUksTUFBTTtBQUNULGFBQUssZ0JBQWdCLEtBQUssTUFBTSxJQUFJO0FBQUEsTUFDckM7QUFBQSxJQUNELFFBQVE7QUFBQSxJQUFlO0FBR3ZCLFFBQUk7QUFDSCxZQUFNLFNBQVMsS0FBSyxlQUFlLElBQUksMEJBQTBCLGFBQWEsT0FBTztBQUNyRixVQUFJLFFBQVE7QUFDWCxhQUFLLHVCQUF1QixLQUFLLE1BQU0sTUFBTTtBQUFBLE1BQzlDO0FBQUEsSUFDRCxRQUFRO0FBQUEsSUFBZTtBQUFBLEVBQ3hCO0FBQUEsRUExQkEsSUFBSSxlQUFtQztBQUN0QyxXQUFPLEtBQUssZUFBZTtBQUFBLEVBQzVCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQThCQSxPQUFPLFdBQXFDO0FBQzNDLFNBQUssbUJBQW1CLE1BQU07QUFFOUIsVUFBTSxPQUFPLElBQUksT0FBTyxXQUFXLElBQUksRUFBRSw0QkFBNEIsQ0FBQztBQUN0RSxTQUFLLG1CQUFtQixJQUFJLEVBQUUsU0FBUyxNQUFNLEtBQUssT0FBTyxFQUFFLENBQUM7QUFFNUQsVUFBTSxVQUFVLElBQUksT0FBTyxNQUFNLElBQUksRUFBRSxnQkFBZ0IsQ0FBQztBQUN4RCxZQUFRLFdBQVc7QUFDbkIsWUFBUSxPQUFPO0FBQ2YsU0FBSyxrQkFBa0I7QUFFdkIsU0FBSyxvQkFBb0I7QUFFekIsU0FBSyxtQkFBbUIsSUFBSSxJQUFJLHNCQUFzQixTQUFTLElBQUksVUFBVSxPQUFPLENBQUMsTUFBTTtBQUMxRixVQUFJLFlBQVksS0FBSyxHQUFHLElBQUk7QUFDNUIsV0FBSyxXQUFXO0FBQUEsSUFDakIsQ0FBQyxDQUFDO0FBRUYsU0FBSyxtQkFBbUIsSUFBSSxJQUFJLHNCQUFzQixTQUFTLElBQUksVUFBVSxVQUFVLENBQUMsTUFBTTtBQUM3RixVQUFJLEVBQUUsUUFBUSxXQUFXLEVBQUUsUUFBUSxLQUFLO0FBQ3ZDLFlBQUksWUFBWSxLQUFLLEdBQUcsSUFBSTtBQUM1QixhQUFLLFdBQVc7QUFBQSxNQUNqQjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLGFBQW1CO0FBQ2xCLFFBQUksQ0FBQyxLQUFLLG1CQUFtQixLQUFLLG9CQUFvQixXQUFXO0FBQ2hFO0FBQUEsSUFDRDtBQUVBLFVBQU0sUUFBUSxLQUFLLFlBQVk7QUFDL0IsVUFBTSxhQUFhLE1BQU0sT0FBTyxPQUFLLEVBQUUsU0FBUyxtQkFBbUIsTUFBTSxFQUFFLFNBQVM7QUFFcEYsVUFBTSxpQkFBaUIsS0FBSztBQUM1QixVQUFNLFdBQTJDO0FBQUEsTUFDaEQsVUFBVSxDQUFDLFNBQVM7QUFDbkIsYUFBSyxvQkFBb0IsS0FBSztBQUM5QixZQUFJLEtBQUssT0FBTyxVQUFVO0FBQ3pCLGVBQUssZUFBZTtBQUFBLFFBQ3JCLE9BQU87QUFDTixlQUFLLFlBQVksSUFBSTtBQUFBLFFBQ3RCO0FBQUEsTUFDRDtBQUFBLE1BQ0EsUUFBUSxNQUFNO0FBQUUsdUJBQWUsTUFBTTtBQUFBLE1BQUc7QUFBQSxJQUN6QztBQUVBLFNBQUssb0JBQW9CO0FBQUEsTUFDeEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLEtBQUs7QUFBQSxNQUNMO0FBQUEsTUFDQSxDQUFDO0FBQUEsTUFDRDtBQUFBLFFBQ0MsY0FBYyxDQUFDLFNBQVMsS0FBSyxTQUFTO0FBQUEsUUFDdEMsb0JBQW9CLE1BQU0sU0FBUyx3QkFBd0IsbUJBQW1CO0FBQUEsTUFDL0U7QUFBQSxNQUNBLGFBQWEsRUFBRSxZQUFZLE1BQU0sbUJBQW1CLFNBQVMscUJBQXFCLHdCQUF3QixFQUFFLElBQUk7QUFBQSxJQUNqSDtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLGdCQUFnQixVQUF3QjtBQUN2QyxTQUFLLFlBQVksRUFBRSxJQUFJLFVBQVUsTUFBTSxTQUFTLENBQUM7QUFBQSxFQUNsRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsaUJBQXVCO0FBQ3RCLFNBQUssZ0JBQWdCO0FBQ3JCLFNBQUssb0JBQW9CO0FBQUEsRUFDMUI7QUFBQSxFQUVRLFlBQVksTUFBdUI7QUFDMUMsU0FBSyxnQkFBZ0I7QUFDckIsU0FBSyxxQkFBcUIsSUFBSTtBQUM5QixTQUFLLGVBQWUsTUFBTSx1QkFBdUIsS0FBSyxVQUFVLElBQUksR0FBRyxhQUFhLFNBQVMsY0FBYyxPQUFPO0FBQ2xILFNBQUssb0JBQW9CO0FBQ3pCLFNBQUssaUJBQWlCLEtBQUssS0FBSyxFQUFFO0FBQUEsRUFDbkM7QUFBQSxFQUVBLE1BQWMsaUJBQWdDO0FBQzdDLFFBQUk7QUFDSCxZQUFNLFNBQTZCLE1BQU0sS0FBSyxlQUFlLGVBQWUsaUJBQWlCO0FBQzdGLFVBQUksUUFBUTtBQUNYLGFBQUssWUFBWSxFQUFFLElBQUksUUFBUSxNQUFNLE9BQU8sQ0FBQztBQUFBLE1BQzlDO0FBQUEsSUFDRCxRQUFRO0FBQUEsSUFFUjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHFCQUFxQixNQUF1QjtBQUNuRCxTQUFLLHVCQUF1QjtBQUFBLE1BQzNCLEVBQUUsSUFBSSxLQUFLLElBQUksTUFBTSxLQUFLLEtBQUs7QUFBQSxNQUMvQixHQUFHLEtBQUsscUJBQXFCLE9BQU8sT0FBSyxFQUFFLE9BQU8sS0FBSyxFQUFFO0FBQUEsSUFDMUQsRUFBRSxNQUFNLEdBQUcsZ0JBQWdCO0FBQzNCLFNBQUssZUFBZSxNQUFNLDBCQUEwQixLQUFLLFVBQVUsS0FBSyxvQkFBb0IsR0FBRyxhQUFhLFNBQVMsY0FBYyxPQUFPO0FBQUEsRUFDM0k7QUFBQSxFQUVRLGNBQTRDO0FBQ25ELFVBQU0sVUFBVSxvQkFBSSxJQUFZO0FBQ2hDLFVBQU0sUUFBc0MsQ0FBQztBQUc3QyxRQUFJLEtBQUssZUFBZTtBQUN2QixjQUFRLElBQUksS0FBSyxjQUFjLEVBQUU7QUFDakMsWUFBTSxLQUFLO0FBQUEsUUFDVixNQUFNLG1CQUFtQjtBQUFBLFFBQ3pCLE9BQU8sS0FBSyxjQUFjO0FBQUEsUUFDMUIsT0FBTyxFQUFFLE9BQU8sSUFBSSxNQUFNLFFBQVEsS0FBSztBQUFBLFFBQ3ZDLE1BQU0sS0FBSztBQUFBLE1BQ1osQ0FBQztBQUFBLElBQ0Y7QUFHQSxVQUFNLGVBQWUsS0FBSyxxQkFBcUIsT0FBTyxPQUFLLENBQUMsUUFBUSxJQUFJLEVBQUUsRUFBRSxDQUFDO0FBQzdFLGlCQUFhLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxLQUFLLGNBQWMsRUFBRSxJQUFJLENBQUM7QUFDeEQsZUFBVyxRQUFRLGNBQWM7QUFDaEMsY0FBUSxJQUFJLEtBQUssRUFBRTtBQUNuQixZQUFNLEtBQUs7QUFBQSxRQUNWLE1BQU0sbUJBQW1CO0FBQUEsUUFDekIsT0FBTyxLQUFLO0FBQUEsUUFDWixPQUFPLEVBQUUsT0FBTyxJQUFJLE1BQU0sUUFBUSxLQUFLO0FBQUEsUUFDdkMsTUFBTTtBQUFBLFFBQ04sVUFBVSxNQUFNLEtBQUssWUFBWSxLQUFLLEVBQUU7QUFBQSxNQUN6QyxDQUFDO0FBQUEsSUFDRjtBQUdBLFFBQUksTUFBTSxTQUFTLEdBQUc7QUFDckIsWUFBTSxLQUFLLEVBQUUsTUFBTSxtQkFBbUIsV0FBVyxPQUFPLEdBQUcsQ0FBQztBQUFBLElBQzdEO0FBQ0EsVUFBTSxLQUFLO0FBQUEsTUFDVixNQUFNLG1CQUFtQjtBQUFBLE1BQ3pCLE9BQU8sU0FBUyxjQUFjLFdBQVc7QUFBQSxNQUN6QyxPQUFPLEVBQUUsT0FBTyxJQUFJLE1BQU0sUUFBUSxPQUFPO0FBQUEsTUFDekMsTUFBTSxFQUFFLElBQUksVUFBVSxNQUFNLFNBQVMsY0FBYyxXQUFXLEVBQUU7QUFBQSxJQUNqRSxDQUFDO0FBRUQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLFlBQVksUUFBc0I7QUFDekMsU0FBSyx1QkFBdUIsS0FBSyxxQkFBcUIsT0FBTyxPQUFLLEVBQUUsT0FBTyxNQUFNO0FBQ2pGLFNBQUssZUFBZSxNQUFNLDBCQUEwQixLQUFLLFVBQVUsS0FBSyxvQkFBb0IsR0FBRyxhQUFhLFNBQVMsY0FBYyxPQUFPO0FBRzFJLFNBQUssb0JBQW9CLEtBQUs7QUFDOUIsU0FBSyxXQUFXO0FBQUEsRUFDakI7QUFBQSxFQUVRLHNCQUE0QjtBQUNuQyxRQUFJLENBQUMsS0FBSyxpQkFBaUI7QUFDMUI7QUFBQSxJQUNEO0FBRUEsUUFBSSxVQUFVLEtBQUssZUFBZTtBQUNsQyxVQUFNLFFBQVEsS0FBSyxlQUFlLFFBQVEsU0FBUyxZQUFZLGlCQUFpQjtBQUVoRixRQUFJLE9BQU8sS0FBSyxpQkFBaUIsV0FBVyxRQUFRLElBQUksQ0FBQztBQUN6RCxVQUFNLFlBQVksSUFBSSxPQUFPLEtBQUssaUJBQWlCLElBQUksRUFBRSxtQ0FBbUMsQ0FBQztBQUM3RixjQUFVLGNBQWM7QUFDeEIsUUFBSSxPQUFPLEtBQUssaUJBQWlCLFdBQVcsUUFBUSxXQUFXLENBQUM7QUFFaEUsU0FBSyxnQkFBZ0IsWUFBWSxTQUFTLCtCQUErQix3QkFBd0IsS0FBSztBQUFBLEVBQ3ZHO0FBRUQ7QUE3TmEsYUFBTjtBQUFBLEVBZ0JKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWxCVTsiLAogICJuYW1lcyI6IFtdCn0K
