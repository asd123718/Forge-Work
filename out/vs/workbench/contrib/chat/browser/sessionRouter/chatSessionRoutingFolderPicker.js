import * as dom from "../../../../../base/browser/dom.js";
import { renderIcon } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { AnchorPosition } from "../../../../../base/common/layout.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { basename, isEqual } from "../../../../../base/common/resources.js";
import { localize } from "../../../../../nls.js";
import { ActionListItemKind } from "../../../../../platform/actionWidget/browser/actionList.js";
import { TabbedActionListWidget } from "../../../../../platform/actionWidget/browser/tabbedActionListWidget.js";
import { withChatInputPickerMotion } from "../widget/input/chatInputPickerActionItem.js";
class ChatSessionRoutingFolderPicker extends Disposable {
  constructor(parent, host, initialTarget, actionWidgetService, workspaceContextService, logService, instantiationService) {
    super();
    this.host = host;
    this.actionWidgetService = actionWidgetService;
    this.workspaceContextService = workspaceContextService;
    this.logService = logService;
    this._requestId = 0;
    this._isDisposed = false;
    this._target = initialTarget;
    this.element = dom.append(parent, dom.$("button.chat-routing-badge-folder-action", {
      type: "button",
      "aria-label": localize("chatSessionRouting.changeTargetFolderAria", "Change target folder for new session"),
      "aria-haspopup": "menu",
      "aria-expanded": "false"
    }));
    this._tabbedFolderPicker = this._register(instantiationService.createInstance(TabbedActionListWidget));
    this._render(false);
  }
  get isActive() {
    return !!this._active;
  }
  setTarget(target) {
    this._target = target;
    this._render(this.isActive);
  }
  async pick(options) {
    if (options.token.isCancellationRequested || this._isDisposed) {
      return void 0;
    }
    if (this._active) {
      this._finish(this._active, void 0);
      return void 0;
    }
    let resolve;
    const result = new Promise((r) => resolve = r);
    const active = {
      id: ++this._requestId,
      options,
      resolve,
      store: new DisposableStore(),
      browsing: false,
      surfaceOpen: false,
      shown: void 0
    };
    this._active = active;
    active.store.add(options.token.onCancellationRequested(() => this._finish(active, void 0, false)));
    this._render(true);
    void this._open(active);
    return result;
  }
  async _open(active) {
    try {
      const catalog = await active.options.getCatalog(active.options.token);
      if (!this._isCurrent(active)) {
        return;
      }
      active.surfaceOpen = true;
      await this.host.onDidChangeActionWidgetVisibility?.(true, this.element);
      if (!this._isCurrent(active)) {
        return;
      }
      this._show(active, catalog);
    } catch (error) {
      if (this._isCurrent(active)) {
        this.logService.error("[chatSessionRouting] Failed to show folder picker", error);
        this._finish(active, void 0);
      }
    }
  }
  _show(active, catalog) {
    const groups = catalog?.groups ?? [];
    const selectedWorkspace = catalog?.workspaces.find((workspace) => this._isSelectedWorkspace(workspace)) ?? catalog?.defaultWorkspace;
    const initialGroup = selectedWorkspace?.group && groups.some((group) => group.id === selectedWorkspace.group) ? selectedWorkspace.group : groups[0]?.id;
    const anchor = this.host.getActionWidgetAnchor?.(this.element) ?? this.element;
    const container = this.host.getActionWidgetContainer?.();
    const getItems = (group) => this._getItems(catalog, group);
    const accessibilityProvider = {
      getAriaLabel: (item) => item.item ? item.item.kind === "workspace" ? localize("chatSessionRouting.folderPickerItem", "{0}, {1}", item.item.folder.name, item.item.folder.uri.fsPath) : item.item.kind === "providerWorkspace" ? localize("chatSessionRouting.folderPickerItem", "{0}, {1}", item.item.workspace.label, item.item.workspace.description ?? item.item.workspace.uri.path) : item.label ?? "" : "",
      getWidgetAriaLabel: () => localize("chatSessionRouting.selectTargetFolder", "Select the folder for the new session"),
      getWidgetRole: () => "menu",
      getRole: (item) => item.item?.kind === "providerBrowse" || item.item?.kind === "choose" ? "menuitem" : "menuitemradio",
      isChecked: (item) => item.item?.kind === "workspace" ? isEqual(item.item.folder.uri, this._target.uri) : item.item?.kind === "providerWorkspace" ? this._isSelectedWorkspace(item.item.workspace) : void 0
    };
    const listOptions = (items2) => withChatInputPickerMotion({
      className: "chat-folder-picker-dropdown",
      anchorPosition: this.host.getActionWidgetAnchorPosition?.() ?? AnchorPosition.ABOVE,
      minWidth: groups.length > 1 ? 360 : 280,
      maxWidth: 420,
      showFilter: catalog ? items2.filter((item) => item.kind === ActionListItemKind.Action).length > 10 : true,
      filterPlaceholder: catalog ? localize("chatSessionRouting.searchWorkspaces", "Search workspaces") : localize("chatSessionRouting.searchFolders", "Search folders"),
      focusFilterOnOpen: true,
      initialFocusItemId: this._target.providerId && this._target.uri ? `${this._target.providerId}:${this._target.uri.toString()}` : this._target.uri?.toString(),
      inlineDescription: true,
      showGroupTitleOnFirstItem: true,
      hideDefaultKeybindingTooltip: true
    });
    const delegate = {
      onSelect: (item) => this._select(active, item),
      onHide: () => this._onHide(active)
    };
    if (groups.length > 1 && initialGroup && this._tabbedFolderPicker) {
      active.shown = "tabbed";
      this._tabbedFolderPicker.show({
        user: "chat-folder-picker",
        anchor,
        container,
        tabs: groups,
        initialTab: initialGroup,
        createActionList: (group) => {
          const items2 = getItems(group);
          return { items: items2, listOptions: listOptions(items2) };
        },
        delegate,
        accessibilityProvider,
        width: 360
      });
      return;
    }
    const items = getItems();
    active.shown = "flat";
    this.actionWidgetService.show(
      "chat-folder-picker",
      false,
      items,
      delegate,
      anchor,
      container,
      void 0,
      accessibilityProvider,
      listOptions(items)
    );
  }
  _getItems(catalog, group) {
    if (!catalog) {
      const items2 = this.workspaceContextService.getWorkspace().folders.map((folder) => ({
        kind: ActionListItemKind.Action,
        item: { id: folder.uri.toString(), kind: "workspace", folder },
        group: {
          title: "",
          icon: isEqual(folder.uri, this._target.uri) ? Codicon.check : Codicon.folder
        },
        label: folder.name,
        description: folder.uri.fsPath
      }));
      if (this.host.pickFolder) {
        items2.push({
          kind: ActionListItemKind.Action,
          item: { id: "choose-folder", kind: "choose" },
          group: { title: "", icon: Codicon.folderOpened },
          label: localize("chatSessionRouting.chooseExternalFolder", "Choose Folder\u2026")
        });
      }
      return items2;
    }
    const workspaces = catalog.workspaces.filter((workspace) => !group || workspace.group === group);
    const browseActions = catalog.browseActions.filter((action) => !group || action.group === group);
    const items = workspaces.map((workspace) => ({
      kind: ActionListItemKind.Action,
      item: { id: `${workspace.providerId}:${workspace.uri.toString()}`, kind: "providerWorkspace", workspace },
      group: { title: "", icon: this._isSelectedWorkspace(workspace) ? Codicon.check : workspace.icon ?? Codicon.folder },
      label: workspace.label,
      description: workspace.description,
      disabled: workspace.disabled
    }));
    if (items.length && browseActions.length) {
      items.push({ kind: ActionListItemKind.Separator, label: "" });
    }
    for (const action of browseActions) {
      items.push({
        kind: ActionListItemKind.Action,
        item: { id: action.id, kind: "providerBrowse", action },
        group: { title: "", icon: action.icon ?? Codicon.folderOpened },
        label: action.label,
        description: action.description,
        disabled: action.disabled
      });
    }
    return items;
  }
  _select(active, item) {
    if (!this._isCurrent(active)) {
      return;
    }
    switch (item.kind) {
      case "workspace":
        this._finish(active, { uri: item.folder.uri, label: item.folder.name });
        return;
      case "providerWorkspace":
        void this._selectProviderWorkspace(active, item.workspace);
        return;
      case "providerBrowse":
        void this._browseProviderWorkspace(active, item.action);
        return;
      case "choose":
        void this._browseLocalFolder(active);
    }
  }
  async _selectProviderWorkspace(active, workspace) {
    this._beginBrowsing(active);
    try {
      await active.options.provider?.selectNewSessionWorkspace?.(workspace);
      if (this._isCurrent(active)) {
        this._finish(active, { uri: workspace.uri, providerId: workspace.providerId, label: workspace.label });
      }
    } catch (error) {
      if (this._isCurrent(active)) {
        this.logService.error("[chatSessionRouting] Failed to select workspace", error);
        this._finish(active, void 0);
      }
    }
  }
  async _browseProviderWorkspace(active, action) {
    this._beginBrowsing(active);
    try {
      const workspace = await active.options.provider?.browseNewSessionWorkspace?.(action.id, active.options.token);
      if (!workspace || !this._isCurrent(active)) {
        if (this._isCurrent(active)) {
          this._finish(active, void 0);
        }
        return;
      }
      await active.options.provider?.selectNewSessionWorkspace?.(workspace);
      if (this._isCurrent(active)) {
        this._finish(active, { uri: workspace.uri, providerId: workspace.providerId, label: workspace.label });
      }
    } catch (error) {
      if (this._isCurrent(active)) {
        this.logService.error("[chatSessionRouting] Failed to browse for workspace", error);
        this._finish(active, void 0);
      }
    }
  }
  async _browseLocalFolder(active) {
    const pickFolder = this.host.pickFolder;
    if (!pickFolder) {
      return;
    }
    this._beginBrowsing(active);
    try {
      const folder = await pickFolder(this._target.uri);
      if (folder && this._isCurrent(active)) {
        this._finish(active, { uri: folder, label: basename(folder) });
      } else if (this._isCurrent(active)) {
        this._finish(active, void 0);
      }
    } catch (error) {
      if (this._isCurrent(active)) {
        this.logService.error("[chatSessionRouting] Failed to choose folder", error);
        this._finish(active, void 0);
      }
    }
  }
  _beginBrowsing(active) {
    active.browsing = true;
    this._hideWidget(active);
    this._closeSurface(active);
  }
  _onHide(active) {
    if (!this._isCurrent(active)) {
      return;
    }
    active.shown = void 0;
    this._closeSurface(active);
    if (!active.browsing) {
      this._finish(active, void 0, true, false);
    }
  }
  _finish(active, target, focus = true, hideWidget = true) {
    if (!this._isCurrent(active)) {
      return;
    }
    this._active = void 0;
    this._requestId++;
    if (hideWidget) {
      this._hideWidget(active);
    }
    this._closeSurface(active);
    active.store.dispose();
    this._render(false);
    if (focus && !this._isDisposed && !active.options.token.isCancellationRequested) {
      this.element.focus();
    }
    active.resolve(target);
  }
  _hideWidget(active) {
    const shown = active.shown;
    active.shown = void 0;
    if (shown === "tabbed" && this._tabbedFolderPicker?.isVisible) {
      this._tabbedFolderPicker.hide();
    } else if (shown === "flat") {
      this.actionWidgetService.hide(true);
    }
  }
  _closeSurface(active) {
    if (active.surfaceOpen) {
      active.surfaceOpen = false;
      void this.host.onDidChangeActionWidgetVisibility?.(false);
    }
  }
  _isSelectedWorkspace(workspace) {
    return isEqual(workspace.uri, this._target.uri) && (!this._target.providerId || workspace.providerId === this._target.providerId);
  }
  _isCurrent(active) {
    return this._active === active && active.id <= this._requestId && !this._isDisposed && !active.options.token.isCancellationRequested;
  }
  _render(expanded) {
    this.element.replaceChildren();
    const folderIcon = dom.append(this.element, renderIcon(Codicon.folder));
    folderIcon.setAttribute("aria-hidden", "true");
    const label = dom.append(this.element, dom.$("span.chat-routing-badge-folder-action-label"));
    label.textContent = this._target.label ?? localize("chatSessionRouting.chooseFolder", "Choose Folder");
    const chevron = dom.append(this.element, renderIcon(expanded ? Codicon.chevronLeft : Codicon.chevronRight));
    chevron.setAttribute("aria-hidden", "true");
    this.element.title = this._target.label ? localize("chatSessionRouting.changeTargetFolderWithName", "Change target folder ({0})", this._target.label) : localize("chatSessionRouting.changeTargetFolder", "Choose Folder");
    this.element.setAttribute("aria-label", this.element.title);
    this.element.setAttribute("aria-expanded", String(expanded));
  }
  dispose() {
    if (this._active) {
      this._finish(this._active, void 0, false);
    }
    this._isDisposed = true;
    super.dispose();
  }
}
export {
  ChatSessionRoutingFolderPicker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHNlc3Npb25Sb3V0ZXJcXGNoYXRTZXNzaW9uUm91dGluZ0ZvbGRlclBpY2tlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElBbmNob3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgQW5jaG9yUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXlvdXQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25MaXN0SXRlbUtpbmQsIElBY3Rpb25MaXN0SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbkxpc3QuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgVGFiYmVkQWN0aW9uTGlzdFdpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL3RhYmJlZEFjdGlvbkxpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvblJvdXRpbmdQcm92aWRlciwgSUNoYXRTZXNzaW9uUm91dGluZ1dvcmtzcGFjZSwgSUNoYXRTZXNzaW9uUm91dGluZ1dvcmtzcGFjZUJyb3dzZUFjdGlvbiwgSUNoYXRTZXNzaW9uUm91dGluZ1dvcmtzcGFjZUNhdGFsb2cgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvblJvdXRlci5qcyc7XG5pbXBvcnQgeyB3aXRoQ2hhdElucHV0UGlja2VyTW90aW9uIH0gZnJvbSAnLi4vd2lkZ2V0L2lucHV0L2NoYXRJbnB1dFBpY2tlckFjdGlvbkl0ZW0uanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0U2Vzc2lvblJvdXRpbmdGb2xkZXJQaWNrZXJIb3N0IHtcblx0LyoqIFByZXBhcmUgb3IgcmVsZWFzZSBhIGhvc3Qtb3duZWQgYWN0aW9uLXdpZGdldCBzdXJmYWNlLiAqL1xuXHRvbkRpZENoYW5nZUFjdGlvbldpZGdldFZpc2liaWxpdHk/KHZpc2libGU6IGJvb2xlYW4sIGFuY2hvcj86IEhUTUxFbGVtZW50KTogdm9pZCB8IFByb21pc2U8dm9pZD47XG5cdC8qKiBDb250YWluZXIgdXNlZCB0byByZW5kZXIgYWN0aW9uIHdpZGdldHMsIHdoZW4gdGhlIGhvc3Qgb3ducyBhIHNlcGFyYXRlIHN1cmZhY2UuICovXG5cdGdldEFjdGlvbldpZGdldENvbnRhaW5lcj8oKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdC8qKiBUcmFuc2xhdGUgYW4gZWxlbWVudCBhbmNob3IgaW50byB0aGUgaG9zdCdzIGFjdGlvbi13aWRnZXQgY29vcmRpbmF0ZSBzcGFjZS4gKi9cblx0Z2V0QWN0aW9uV2lkZ2V0QW5jaG9yPyhhbmNob3I6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQgfCBJQW5jaG9yO1xuXHQvKiogT3ZlcnJpZGUgdGhlIGFjdGlvbi13aWRnZXQgZGlyZWN0aW9uIHdoZW4gdGhlIGhvc3QgcmVuZGVycyBpdCBvbiBhIHNlcGFyYXRlIHN1cmZhY2UuICovXG5cdGdldEFjdGlvbldpZGdldEFuY2hvclBvc2l0aW9uPygpOiBBbmNob3JQb3NpdGlvbjtcblx0LyoqIE9wZW4gdGhlIGhvc3QncyBuYXRpdmUgZm9sZGVyIHBpY2tlciBmb3IgYSBzdGFuZGFsb25lIHdvcmtpbmcgZGlyZWN0b3J5LiAqL1xuXHRwaWNrRm9sZGVyPyhkZWZhdWx0VXJpOiBVUkkgfCB1bmRlZmluZWQpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRTZXNzaW9uUm91dGluZ0ZvbGRlclBpY2tlclRhcmdldCB7XG5cdHJlYWRvbmx5IHVyaT86IFVSSTtcblx0cmVhZG9ubHkgcHJvdmlkZXJJZD86IHN0cmluZztcblx0cmVhZG9ubHkgbGFiZWw/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRTZXNzaW9uUm91dGluZ0ZvbGRlclBpY2tlck9wdGlvbnMge1xuXHRyZWFkb25seSBwcm92aWRlcjogSUNoYXRTZXNzaW9uUm91dGluZ1Byb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBnZXRDYXRhbG9nOiAodG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm9taXNlPElDaGF0U2Vzc2lvblJvdXRpbmdXb3Jrc3BhY2VDYXRhbG9nIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgdG9rZW46IENhbmNlbGxhdGlvblRva2VuO1xufVxuXG50eXBlIEZvbGRlclBpY2tlckl0ZW0gPVxuXHR8IHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkga2luZDogJ3dvcmtzcGFjZSc7IHJlYWRvbmx5IGZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciB9XG5cdHwgeyByZWFkb25seSBpZDogc3RyaW5nOyByZWFkb25seSBraW5kOiAncHJvdmlkZXJXb3Jrc3BhY2UnOyByZWFkb25seSB3b3Jrc3BhY2U6IElDaGF0U2Vzc2lvblJvdXRpbmdXb3Jrc3BhY2UgfVxuXHR8IHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkga2luZDogJ3Byb3ZpZGVyQnJvd3NlJzsgcmVhZG9ubHkgYWN0aW9uOiBJQ2hhdFNlc3Npb25Sb3V0aW5nV29ya3NwYWNlQnJvd3NlQWN0aW9uIH1cblx0fCB7IHJlYWRvbmx5IGlkOiAnY2hvb3NlLWZvbGRlcic7IHJlYWRvbmx5IGtpbmQ6ICdjaG9vc2UnIH07XG5cbmludGVyZmFjZSBJQWN0aXZlRm9sZGVyUGlja2VyIHtcblx0cmVhZG9ubHkgaWQ6IG51bWJlcjtcblx0cmVhZG9ubHkgb3B0aW9uczogSUNoYXRTZXNzaW9uUm91dGluZ0ZvbGRlclBpY2tlck9wdGlvbnM7XG5cdHJlYWRvbmx5IHJlc29sdmU6ICh0YXJnZXQ6IElDaGF0U2Vzc2lvblJvdXRpbmdGb2xkZXJQaWNrZXJUYXJnZXQgfCB1bmRlZmluZWQpID0+IHZvaWQ7XG5cdHJlYWRvbmx5IHN0b3JlOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGJyb3dzaW5nOiBib29sZWFuO1xuXHRzdXJmYWNlT3BlbjogYm9vbGVhbjtcblx0c2hvd246ICdmbGF0JyB8ICd0YWJiZWQnIHwgdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIFJlbmRlcnMgYW5kIG93bnMgdGhlIENoYW5nZSBGb2xkZXIgYWN0aW9uIHBsdXMgaXRzIGFjdGlvbi13aWRnZXQgcGlja2VyLlxuICogQ2FsbGVycyBwYXVzZSB0aGVpciBvd24gY291bnRkb3duIHdoaWxlIHtAbGluayBwaWNrfSBkaXJlY3RseSByZXNvbHZlcyB0aGVcbiAqIHNlbGVjdGVkIHByb3ZpZGVyLW5ldXRyYWwgd29ya3NwYWNlIHRhcmdldC5cbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRTZXNzaW9uUm91dGluZ0ZvbGRlclBpY2tlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxCdXR0b25FbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RhYmJlZEZvbGRlclBpY2tlcjogVGFiYmVkQWN0aW9uTGlzdFdpZGdldCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdGFyZ2V0OiBJQ2hhdFNlc3Npb25Sb3V0aW5nRm9sZGVyUGlja2VyVGFyZ2V0O1xuXHRwcml2YXRlIF9hY3RpdmU6IElBY3RpdmVGb2xkZXJQaWNrZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3JlcXVlc3RJZCA9IDA7XG5cdHByaXZhdGUgX2lzRGlzcG9zZWQgPSBmYWxzZTtcblxuXHRnZXQgaXNBY3RpdmUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fYWN0aXZlO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cGFyZW50OiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGhvc3Q6IElDaGF0U2Vzc2lvblJvdXRpbmdGb2xkZXJQaWNrZXJIb3N0LFxuXHRcdGluaXRpYWxUYXJnZXQ6IElDaGF0U2Vzc2lvblJvdXRpbmdGb2xkZXJQaWNrZXJUYXJnZXQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhY3Rpb25XaWRnZXRTZXJ2aWNlOiBJQWN0aW9uV2lkZ2V0U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3RhcmdldCA9IGluaXRpYWxUYXJnZXQ7XG5cdFx0dGhpcy5lbGVtZW50ID0gZG9tLmFwcGVuZChwYXJlbnQsIGRvbS4kKCdidXR0b24uY2hhdC1yb3V0aW5nLWJhZGdlLWZvbGRlci1hY3Rpb24nLCB7XG5cdFx0XHR0eXBlOiAnYnV0dG9uJyxcblx0XHRcdCdhcmlhLWxhYmVsJzogbG9jYWxpemUoJ2NoYXRTZXNzaW9uUm91dGluZy5jaGFuZ2VUYXJnZXRGb2xkZXJBcmlhJywgXCJDaGFuZ2UgdGFyZ2V0IGZvbGRlciBmb3IgbmV3IHNlc3Npb25cIiksXG5cdFx0XHQnYXJpYS1oYXNwb3B1cCc6ICdtZW51Jyxcblx0XHRcdCdhcmlhLWV4cGFuZGVkJzogJ2ZhbHNlJyxcblx0XHR9KSkgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdFx0dGhpcy5fdGFiYmVkRm9sZGVyUGlja2VyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGFiYmVkQWN0aW9uTGlzdFdpZGdldCkpO1xuXHRcdHRoaXMuX3JlbmRlcihmYWxzZSk7XG5cdH1cblxuXHRzZXRUYXJnZXQodGFyZ2V0OiBJQ2hhdFNlc3Npb25Sb3V0aW5nRm9sZGVyUGlja2VyVGFyZ2V0KTogdm9pZCB7XG5cdFx0dGhpcy5fdGFyZ2V0ID0gdGFyZ2V0O1xuXHRcdHRoaXMuX3JlbmRlcih0aGlzLmlzQWN0aXZlKTtcblx0fVxuXG5cdGFzeW5jIHBpY2sob3B0aW9uczogSUNoYXRTZXNzaW9uUm91dGluZ0ZvbGRlclBpY2tlck9wdGlvbnMpOiBQcm9taXNlPElDaGF0U2Vzc2lvblJvdXRpbmdGb2xkZXJQaWNrZXJUYXJnZXQgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAob3B0aW9ucy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCB0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fYWN0aXZlKSB7XG5cdFx0XHR0aGlzLl9maW5pc2godGhpcy5fYWN0aXZlLCB1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgcmVzb2x2ZSE6ICh0YXJnZXQ6IElDaGF0U2Vzc2lvblJvdXRpbmdGb2xkZXJQaWNrZXJUYXJnZXQgfCB1bmRlZmluZWQpID0+IHZvaWQ7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFByb21pc2U8SUNoYXRTZXNzaW9uUm91dGluZ0ZvbGRlclBpY2tlclRhcmdldCB8IHVuZGVmaW5lZD4ociA9PiByZXNvbHZlID0gcik7XG5cdFx0Y29uc3QgYWN0aXZlOiBJQWN0aXZlRm9sZGVyUGlja2VyID0ge1xuXHRcdFx0aWQ6ICsrdGhpcy5fcmVxdWVzdElkLFxuXHRcdFx0b3B0aW9ucyxcblx0XHRcdHJlc29sdmUsXG5cdFx0XHRzdG9yZTogbmV3IERpc3Bvc2FibGVTdG9yZSgpLFxuXHRcdFx0YnJvd3Npbmc6IGZhbHNlLFxuXHRcdFx0c3VyZmFjZU9wZW46IGZhbHNlLFxuXHRcdFx0c2hvd246IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdHRoaXMuX2FjdGl2ZSA9IGFjdGl2ZTtcblx0XHRhY3RpdmUuc3RvcmUuYWRkKG9wdGlvbnMudG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gdGhpcy5fZmluaXNoKGFjdGl2ZSwgdW5kZWZpbmVkLCBmYWxzZSkpKTtcblx0XHR0aGlzLl9yZW5kZXIodHJ1ZSk7XG5cdFx0dm9pZCB0aGlzLl9vcGVuKGFjdGl2ZSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29wZW4oYWN0aXZlOiBJQWN0aXZlRm9sZGVyUGlja2VyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNhdGFsb2cgPSBhd2FpdCBhY3RpdmUub3B0aW9ucy5nZXRDYXRhbG9nKGFjdGl2ZS5vcHRpb25zLnRva2VuKTtcblx0XHRcdGlmICghdGhpcy5faXNDdXJyZW50KGFjdGl2ZSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YWN0aXZlLnN1cmZhY2VPcGVuID0gdHJ1ZTtcblx0XHRcdGF3YWl0IHRoaXMuaG9zdC5vbkRpZENoYW5nZUFjdGlvbldpZGdldFZpc2liaWxpdHk/Lih0cnVlLCB0aGlzLmVsZW1lbnQpO1xuXHRcdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnQoYWN0aXZlKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zaG93KGFjdGl2ZSwgY2F0YWxvZyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICh0aGlzLl9pc0N1cnJlbnQoYWN0aXZlKSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tjaGF0U2Vzc2lvblJvdXRpbmddIEZhaWxlZCB0byBzaG93IGZvbGRlciBwaWNrZXInLCBlcnJvcik7XG5cdFx0XHRcdHRoaXMuX2ZpbmlzaChhY3RpdmUsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2hvdyhhY3RpdmU6IElBY3RpdmVGb2xkZXJQaWNrZXIsIGNhdGFsb2c6IElDaGF0U2Vzc2lvblJvdXRpbmdXb3Jrc3BhY2VDYXRhbG9nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgZ3JvdXBzID0gY2F0YWxvZz8uZ3JvdXBzID8/IFtdO1xuXHRcdGNvbnN0IHNlbGVjdGVkV29ya3NwYWNlID0gY2F0YWxvZz8ud29ya3NwYWNlcy5maW5kKHdvcmtzcGFjZSA9PiB0aGlzLl9pc1NlbGVjdGVkV29ya3NwYWNlKHdvcmtzcGFjZSkpID8/IGNhdGFsb2c/LmRlZmF1bHRXb3Jrc3BhY2U7XG5cdFx0Y29uc3QgaW5pdGlhbEdyb3VwID0gc2VsZWN0ZWRXb3Jrc3BhY2U/Lmdyb3VwICYmIGdyb3Vwcy5zb21lKGdyb3VwID0+IGdyb3VwLmlkID09PSBzZWxlY3RlZFdvcmtzcGFjZS5ncm91cClcblx0XHRcdD8gc2VsZWN0ZWRXb3Jrc3BhY2UuZ3JvdXBcblx0XHRcdDogZ3JvdXBzWzBdPy5pZDtcblx0XHRjb25zdCBhbmNob3IgPSB0aGlzLmhvc3QuZ2V0QWN0aW9uV2lkZ2V0QW5jaG9yPy4odGhpcy5lbGVtZW50KSA/PyB0aGlzLmVsZW1lbnQ7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5ob3N0LmdldEFjdGlvbldpZGdldENvbnRhaW5lcj8uKCk7XG5cdFx0Y29uc3QgZ2V0SXRlbXMgPSAoZ3JvdXA/OiBzdHJpbmcpID0+IHRoaXMuX2dldEl0ZW1zKGNhdGFsb2csIGdyb3VwKTtcblx0XHRjb25zdCBhY2Nlc3NpYmlsaXR5UHJvdmlkZXIgPSB7XG5cdFx0XHRnZXRBcmlhTGFiZWw6IChpdGVtOiBJQWN0aW9uTGlzdEl0ZW08Rm9sZGVyUGlja2VySXRlbT4pID0+IGl0ZW0uaXRlbVxuXHRcdFx0XHQ/IGl0ZW0uaXRlbS5raW5kID09PSAnd29ya3NwYWNlJ1xuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXRTZXNzaW9uUm91dGluZy5mb2xkZXJQaWNrZXJJdGVtJywgXCJ7MH0sIHsxfVwiLCBpdGVtLml0ZW0uZm9sZGVyLm5hbWUsIGl0ZW0uaXRlbS5mb2xkZXIudXJpLmZzUGF0aClcblx0XHRcdFx0XHQ6IGl0ZW0uaXRlbS5raW5kID09PSAncHJvdmlkZXJXb3Jrc3BhY2UnXG5cdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcuZm9sZGVyUGlja2VySXRlbScsIFwiezB9LCB7MX1cIiwgaXRlbS5pdGVtLndvcmtzcGFjZS5sYWJlbCwgaXRlbS5pdGVtLndvcmtzcGFjZS5kZXNjcmlwdGlvbiA/PyBpdGVtLml0ZW0ud29ya3NwYWNlLnVyaS5wYXRoKVxuXHRcdFx0XHRcdFx0OiBpdGVtLmxhYmVsID8/ICcnXG5cdFx0XHRcdDogJycsXG5cdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWw6ICgpID0+IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcuc2VsZWN0VGFyZ2V0Rm9sZGVyJywgXCJTZWxlY3QgdGhlIGZvbGRlciBmb3IgdGhlIG5ldyBzZXNzaW9uXCIpLFxuXHRcdFx0Z2V0V2lkZ2V0Um9sZTogKCkgPT4gJ21lbnUnIGFzIGNvbnN0LFxuXHRcdFx0Z2V0Um9sZTogKGl0ZW06IElBY3Rpb25MaXN0SXRlbTxGb2xkZXJQaWNrZXJJdGVtPikgPT4gaXRlbS5pdGVtPy5raW5kID09PSAncHJvdmlkZXJCcm93c2UnIHx8IGl0ZW0uaXRlbT8ua2luZCA9PT0gJ2Nob29zZScgPyAnbWVudWl0ZW0nIGFzIGNvbnN0IDogJ21lbnVpdGVtcmFkaW8nIGFzIGNvbnN0LFxuXHRcdFx0aXNDaGVja2VkOiAoaXRlbTogSUFjdGlvbkxpc3RJdGVtPEZvbGRlclBpY2tlckl0ZW0+KSA9PiBpdGVtLml0ZW0/LmtpbmQgPT09ICd3b3Jrc3BhY2UnXG5cdFx0XHRcdD8gaXNFcXVhbChpdGVtLml0ZW0uZm9sZGVyLnVyaSwgdGhpcy5fdGFyZ2V0LnVyaSlcblx0XHRcdFx0OiBpdGVtLml0ZW0/LmtpbmQgPT09ICdwcm92aWRlcldvcmtzcGFjZSdcblx0XHRcdFx0XHQ/IHRoaXMuX2lzU2VsZWN0ZWRXb3Jrc3BhY2UoaXRlbS5pdGVtLndvcmtzcGFjZSlcblx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdGNvbnN0IGxpc3RPcHRpb25zID0gKGl0ZW1zOiByZWFkb25seSBJQWN0aW9uTGlzdEl0ZW08Rm9sZGVyUGlja2VySXRlbT5bXSkgPT4gd2l0aENoYXRJbnB1dFBpY2tlck1vdGlvbih7XG5cdFx0XHRjbGFzc05hbWU6ICdjaGF0LWZvbGRlci1waWNrZXItZHJvcGRvd24nLFxuXHRcdFx0YW5jaG9yUG9zaXRpb246IHRoaXMuaG9zdC5nZXRBY3Rpb25XaWRnZXRBbmNob3JQb3NpdGlvbj8uKCkgPz8gQW5jaG9yUG9zaXRpb24uQUJPVkUsXG5cdFx0XHRtaW5XaWR0aDogZ3JvdXBzLmxlbmd0aCA+IDEgPyAzNjAgOiAyODAsXG5cdFx0XHRtYXhXaWR0aDogNDIwLFxuXHRcdFx0c2hvd0ZpbHRlcjogY2F0YWxvZ1xuXHRcdFx0XHQ/IGl0ZW1zLmZpbHRlcihpdGVtID0+IGl0ZW0ua2luZCA9PT0gQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbikubGVuZ3RoID4gMTBcblx0XHRcdFx0OiB0cnVlLFxuXHRcdFx0ZmlsdGVyUGxhY2Vob2xkZXI6IGNhdGFsb2dcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdFNlc3Npb25Sb3V0aW5nLnNlYXJjaFdvcmtzcGFjZXMnLCBcIlNlYXJjaCB3b3Jrc3BhY2VzXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NoYXRTZXNzaW9uUm91dGluZy5zZWFyY2hGb2xkZXJzJywgXCJTZWFyY2ggZm9sZGVyc1wiKSxcblx0XHRcdGZvY3VzRmlsdGVyT25PcGVuOiB0cnVlLFxuXHRcdFx0aW5pdGlhbEZvY3VzSXRlbUlkOiB0aGlzLl90YXJnZXQucHJvdmlkZXJJZCAmJiB0aGlzLl90YXJnZXQudXJpXG5cdFx0XHRcdD8gYCR7dGhpcy5fdGFyZ2V0LnByb3ZpZGVySWR9OiR7dGhpcy5fdGFyZ2V0LnVyaS50b1N0cmluZygpfWBcblx0XHRcdFx0OiB0aGlzLl90YXJnZXQudXJpPy50b1N0cmluZygpLFxuXHRcdFx0aW5saW5lRGVzY3JpcHRpb246IHRydWUsXG5cdFx0XHRzaG93R3JvdXBUaXRsZU9uRmlyc3RJdGVtOiB0cnVlLFxuXHRcdFx0aGlkZURlZmF1bHRLZXliaW5kaW5nVG9vbHRpcDogdHJ1ZSxcblx0XHR9KTtcblx0XHRjb25zdCBkZWxlZ2F0ZSA9IHtcblx0XHRcdG9uU2VsZWN0OiAoaXRlbTogRm9sZGVyUGlja2VySXRlbSkgPT4gdGhpcy5fc2VsZWN0KGFjdGl2ZSwgaXRlbSksXG5cdFx0XHRvbkhpZGU6ICgpID0+IHRoaXMuX29uSGlkZShhY3RpdmUpLFxuXHRcdH07XG5cblx0XHRpZiAoZ3JvdXBzLmxlbmd0aCA+IDEgJiYgaW5pdGlhbEdyb3VwICYmIHRoaXMuX3RhYmJlZEZvbGRlclBpY2tlcikge1xuXHRcdFx0YWN0aXZlLnNob3duID0gJ3RhYmJlZCc7XG5cdFx0XHR0aGlzLl90YWJiZWRGb2xkZXJQaWNrZXIuc2hvdzxGb2xkZXJQaWNrZXJJdGVtPih7XG5cdFx0XHRcdHVzZXI6ICdjaGF0LWZvbGRlci1waWNrZXInLFxuXHRcdFx0XHRhbmNob3IsXG5cdFx0XHRcdGNvbnRhaW5lcixcblx0XHRcdFx0dGFiczogZ3JvdXBzLFxuXHRcdFx0XHRpbml0aWFsVGFiOiBpbml0aWFsR3JvdXAsXG5cdFx0XHRcdGNyZWF0ZUFjdGlvbkxpc3Q6IGdyb3VwID0+IHtcblx0XHRcdFx0XHRjb25zdCBpdGVtcyA9IGdldEl0ZW1zKGdyb3VwKTtcblx0XHRcdFx0XHRyZXR1cm4geyBpdGVtcywgbGlzdE9wdGlvbnM6IGxpc3RPcHRpb25zKGl0ZW1zKSB9O1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRkZWxlZ2F0ZSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyLFxuXHRcdFx0XHR3aWR0aDogMzYwLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbXMgPSBnZXRJdGVtcygpO1xuXHRcdGFjdGl2ZS5zaG93biA9ICdmbGF0Jztcblx0XHR0aGlzLmFjdGlvbldpZGdldFNlcnZpY2Uuc2hvdyhcblx0XHRcdCdjaGF0LWZvbGRlci1waWNrZXInLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRpdGVtcyxcblx0XHRcdGRlbGVnYXRlLFxuXHRcdFx0YW5jaG9yLFxuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyLFxuXHRcdFx0bGlzdE9wdGlvbnMoaXRlbXMpLFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRJdGVtcyhjYXRhbG9nOiBJQ2hhdFNlc3Npb25Sb3V0aW5nV29ya3NwYWNlQ2F0YWxvZyB8IHVuZGVmaW5lZCwgZ3JvdXA/OiBzdHJpbmcpOiBJQWN0aW9uTGlzdEl0ZW08Rm9sZGVyUGlja2VySXRlbT5bXSB7XG5cdFx0aWYgKCFjYXRhbG9nKSB7XG5cdFx0XHRjb25zdCBpdGVtczogSUFjdGlvbkxpc3RJdGVtPEZvbGRlclBpY2tlckl0ZW0+W10gPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubWFwKGZvbGRlciA9PiAoe1xuXHRcdFx0XHRraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uLFxuXHRcdFx0XHRpdGVtOiB7IGlkOiBmb2xkZXIudXJpLnRvU3RyaW5nKCksIGtpbmQ6ICd3b3Jrc3BhY2UnLCBmb2xkZXIgfSxcblx0XHRcdFx0Z3JvdXA6IHtcblx0XHRcdFx0XHR0aXRsZTogJycsXG5cdFx0XHRcdFx0aWNvbjogaXNFcXVhbChmb2xkZXIudXJpLCB0aGlzLl90YXJnZXQudXJpKSA/IENvZGljb24uY2hlY2sgOiBDb2RpY29uLmZvbGRlcixcblx0XHRcdFx0fSxcblx0XHRcdFx0bGFiZWw6IGZvbGRlci5uYW1lLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogZm9sZGVyLnVyaS5mc1BhdGgsXG5cdFx0XHR9KSk7XG5cdFx0XHRpZiAodGhpcy5ob3N0LnBpY2tGb2xkZXIpIHtcblx0XHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbixcblx0XHRcdFx0XHRpdGVtOiB7IGlkOiAnY2hvb3NlLWZvbGRlcicsIGtpbmQ6ICdjaG9vc2UnIH0sXG5cdFx0XHRcdFx0Z3JvdXA6IHsgdGl0bGU6ICcnLCBpY29uOiBDb2RpY29uLmZvbGRlck9wZW5lZCB9LFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25Sb3V0aW5nLmNob29zZUV4dGVybmFsRm9sZGVyJywgXCJDaG9vc2UgRm9sZGVyXHUyMDI2XCIpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpdGVtcztcblx0XHR9XG5cblx0XHRjb25zdCB3b3Jrc3BhY2VzID0gY2F0YWxvZy53b3Jrc3BhY2VzLmZpbHRlcih3b3Jrc3BhY2UgPT4gIWdyb3VwIHx8IHdvcmtzcGFjZS5ncm91cCA9PT0gZ3JvdXApO1xuXHRcdGNvbnN0IGJyb3dzZUFjdGlvbnMgPSBjYXRhbG9nLmJyb3dzZUFjdGlvbnMuZmlsdGVyKGFjdGlvbiA9PiAhZ3JvdXAgfHwgYWN0aW9uLmdyb3VwID09PSBncm91cCk7XG5cdFx0Y29uc3QgaXRlbXM6IElBY3Rpb25MaXN0SXRlbTxGb2xkZXJQaWNrZXJJdGVtPltdID0gd29ya3NwYWNlcy5tYXAod29ya3NwYWNlID0+ICh7XG5cdFx0XHRraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uLFxuXHRcdFx0aXRlbTogeyBpZDogYCR7d29ya3NwYWNlLnByb3ZpZGVySWR9OiR7d29ya3NwYWNlLnVyaS50b1N0cmluZygpfWAsIGtpbmQ6ICdwcm92aWRlcldvcmtzcGFjZScsIHdvcmtzcGFjZSB9LFxuXHRcdFx0Z3JvdXA6IHsgdGl0bGU6ICcnLCBpY29uOiB0aGlzLl9pc1NlbGVjdGVkV29ya3NwYWNlKHdvcmtzcGFjZSkgPyBDb2RpY29uLmNoZWNrIDogd29ya3NwYWNlLmljb24gPz8gQ29kaWNvbi5mb2xkZXIgfSxcblx0XHRcdGxhYmVsOiB3b3Jrc3BhY2UubGFiZWwsXG5cdFx0XHRkZXNjcmlwdGlvbjogd29ya3NwYWNlLmRlc2NyaXB0aW9uLFxuXHRcdFx0ZGlzYWJsZWQ6IHdvcmtzcGFjZS5kaXNhYmxlZCxcblx0XHR9KSk7XG5cdFx0aWYgKGl0ZW1zLmxlbmd0aCAmJiBicm93c2VBY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0aXRlbXMucHVzaCh7IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IsIGxhYmVsOiAnJyB9KTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYnJvd3NlQWN0aW9ucykge1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRcdGl0ZW06IHsgaWQ6IGFjdGlvbi5pZCwga2luZDogJ3Byb3ZpZGVyQnJvd3NlJywgYWN0aW9uIH0sXG5cdFx0XHRcdGdyb3VwOiB7IHRpdGxlOiAnJywgaWNvbjogYWN0aW9uLmljb24gPz8gQ29kaWNvbi5mb2xkZXJPcGVuZWQgfSxcblx0XHRcdFx0bGFiZWw6IGFjdGlvbi5sYWJlbCxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGFjdGlvbi5kZXNjcmlwdGlvbixcblx0XHRcdFx0ZGlzYWJsZWQ6IGFjdGlvbi5kaXNhYmxlZCxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gaXRlbXM7XG5cdH1cblxuXHRwcml2YXRlIF9zZWxlY3QoYWN0aXZlOiBJQWN0aXZlRm9sZGVyUGlja2VyLCBpdGVtOiBGb2xkZXJQaWNrZXJJdGVtKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnQoYWN0aXZlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRzd2l0Y2ggKGl0ZW0ua2luZCkge1xuXHRcdFx0Y2FzZSAnd29ya3NwYWNlJzpcblx0XHRcdFx0dGhpcy5fZmluaXNoKGFjdGl2ZSwgeyB1cmk6IGl0ZW0uZm9sZGVyLnVyaSwgbGFiZWw6IGl0ZW0uZm9sZGVyLm5hbWUgfSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdGNhc2UgJ3Byb3ZpZGVyV29ya3NwYWNlJzpcblx0XHRcdFx0dm9pZCB0aGlzLl9zZWxlY3RQcm92aWRlcldvcmtzcGFjZShhY3RpdmUsIGl0ZW0ud29ya3NwYWNlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0Y2FzZSAncHJvdmlkZXJCcm93c2UnOlxuXHRcdFx0XHR2b2lkIHRoaXMuX2Jyb3dzZVByb3ZpZGVyV29ya3NwYWNlKGFjdGl2ZSwgaXRlbS5hY3Rpb24pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHRjYXNlICdjaG9vc2UnOlxuXHRcdFx0XHR2b2lkIHRoaXMuX2Jyb3dzZUxvY2FsRm9sZGVyKGFjdGl2ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2VsZWN0UHJvdmlkZXJXb3Jrc3BhY2UoYWN0aXZlOiBJQWN0aXZlRm9sZGVyUGlja2VyLCB3b3Jrc3BhY2U6IElDaGF0U2Vzc2lvblJvdXRpbmdXb3Jrc3BhY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9iZWdpbkJyb3dzaW5nKGFjdGl2ZSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGFjdGl2ZS5vcHRpb25zLnByb3ZpZGVyPy5zZWxlY3ROZXdTZXNzaW9uV29ya3NwYWNlPy4od29ya3NwYWNlKTtcblx0XHRcdGlmICh0aGlzLl9pc0N1cnJlbnQoYWN0aXZlKSkge1xuXHRcdFx0XHR0aGlzLl9maW5pc2goYWN0aXZlLCB7IHVyaTogd29ya3NwYWNlLnVyaSwgcHJvdmlkZXJJZDogd29ya3NwYWNlLnByb3ZpZGVySWQsIGxhYmVsOiB3b3Jrc3BhY2UubGFiZWwgfSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICh0aGlzLl9pc0N1cnJlbnQoYWN0aXZlKSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tjaGF0U2Vzc2lvblJvdXRpbmddIEZhaWxlZCB0byBzZWxlY3Qgd29ya3NwYWNlJywgZXJyb3IpO1xuXHRcdFx0XHR0aGlzLl9maW5pc2goYWN0aXZlLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Jyb3dzZVByb3ZpZGVyV29ya3NwYWNlKGFjdGl2ZTogSUFjdGl2ZUZvbGRlclBpY2tlciwgYWN0aW9uOiBJQ2hhdFNlc3Npb25Sb3V0aW5nV29ya3NwYWNlQnJvd3NlQWN0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fYmVnaW5Ccm93c2luZyhhY3RpdmUpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBhd2FpdCBhY3RpdmUub3B0aW9ucy5wcm92aWRlcj8uYnJvd3NlTmV3U2Vzc2lvbldvcmtzcGFjZT8uKGFjdGlvbi5pZCwgYWN0aXZlLm9wdGlvbnMudG9rZW4pO1xuXHRcdFx0aWYgKCF3b3Jrc3BhY2UgfHwgIXRoaXMuX2lzQ3VycmVudChhY3RpdmUpKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9pc0N1cnJlbnQoYWN0aXZlKSkge1xuXHRcdFx0XHRcdHRoaXMuX2ZpbmlzaChhY3RpdmUsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgYWN0aXZlLm9wdGlvbnMucHJvdmlkZXI/LnNlbGVjdE5ld1Nlc3Npb25Xb3Jrc3BhY2U/Lih3b3Jrc3BhY2UpO1xuXHRcdFx0aWYgKHRoaXMuX2lzQ3VycmVudChhY3RpdmUpKSB7XG5cdFx0XHRcdHRoaXMuX2ZpbmlzaChhY3RpdmUsIHsgdXJpOiB3b3Jrc3BhY2UudXJpLCBwcm92aWRlcklkOiB3b3Jrc3BhY2UucHJvdmlkZXJJZCwgbGFiZWw6IHdvcmtzcGFjZS5sYWJlbCB9KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKHRoaXMuX2lzQ3VycmVudChhY3RpdmUpKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW2NoYXRTZXNzaW9uUm91dGluZ10gRmFpbGVkIHRvIGJyb3dzZSBmb3Igd29ya3NwYWNlJywgZXJyb3IpO1xuXHRcdFx0XHR0aGlzLl9maW5pc2goYWN0aXZlLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Jyb3dzZUxvY2FsRm9sZGVyKGFjdGl2ZTogSUFjdGl2ZUZvbGRlclBpY2tlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHBpY2tGb2xkZXIgPSB0aGlzLmhvc3QucGlja0ZvbGRlcjtcblx0XHRpZiAoIXBpY2tGb2xkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYmVnaW5Ccm93c2luZyhhY3RpdmUpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmb2xkZXIgPSBhd2FpdCBwaWNrRm9sZGVyKHRoaXMuX3RhcmdldC51cmkpO1xuXHRcdFx0aWYgKGZvbGRlciAmJiB0aGlzLl9pc0N1cnJlbnQoYWN0aXZlKSkge1xuXHRcdFx0XHR0aGlzLl9maW5pc2goYWN0aXZlLCB7IHVyaTogZm9sZGVyLCBsYWJlbDogYmFzZW5hbWUoZm9sZGVyKSB9KTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5faXNDdXJyZW50KGFjdGl2ZSkpIHtcblx0XHRcdFx0dGhpcy5fZmluaXNoKGFjdGl2ZSwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKHRoaXMuX2lzQ3VycmVudChhY3RpdmUpKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW2NoYXRTZXNzaW9uUm91dGluZ10gRmFpbGVkIHRvIGNob29zZSBmb2xkZXInLCBlcnJvcik7XG5cdFx0XHRcdHRoaXMuX2ZpbmlzaChhY3RpdmUsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYmVnaW5Ccm93c2luZyhhY3RpdmU6IElBY3RpdmVGb2xkZXJQaWNrZXIpOiB2b2lkIHtcblx0XHRhY3RpdmUuYnJvd3NpbmcgPSB0cnVlO1xuXHRcdHRoaXMuX2hpZGVXaWRnZXQoYWN0aXZlKTtcblx0XHR0aGlzLl9jbG9zZVN1cmZhY2UoYWN0aXZlKTtcblx0fVxuXG5cdHByaXZhdGUgX29uSGlkZShhY3RpdmU6IElBY3RpdmVGb2xkZXJQaWNrZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzQ3VycmVudChhY3RpdmUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGFjdGl2ZS5zaG93biA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9jbG9zZVN1cmZhY2UoYWN0aXZlKTtcblx0XHRpZiAoIWFjdGl2ZS5icm93c2luZykge1xuXHRcdFx0dGhpcy5fZmluaXNoKGFjdGl2ZSwgdW5kZWZpbmVkLCB0cnVlLCBmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZmluaXNoKFxuXHRcdGFjdGl2ZTogSUFjdGl2ZUZvbGRlclBpY2tlcixcblx0XHR0YXJnZXQ6IElDaGF0U2Vzc2lvblJvdXRpbmdGb2xkZXJQaWNrZXJUYXJnZXQgfCB1bmRlZmluZWQsXG5cdFx0Zm9jdXMgPSB0cnVlLFxuXHRcdGhpZGVXaWRnZXQgPSB0cnVlLFxuXHQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzQ3VycmVudChhY3RpdmUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2FjdGl2ZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9yZXF1ZXN0SWQrKztcblx0XHRpZiAoaGlkZVdpZGdldCkge1xuXHRcdFx0dGhpcy5faGlkZVdpZGdldChhY3RpdmUpO1xuXHRcdH1cblx0XHR0aGlzLl9jbG9zZVN1cmZhY2UoYWN0aXZlKTtcblx0XHRhY3RpdmUuc3RvcmUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3JlbmRlcihmYWxzZSk7XG5cdFx0aWYgKGZvY3VzICYmICF0aGlzLl9pc0Rpc3Bvc2VkICYmICFhY3RpdmUub3B0aW9ucy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LmZvY3VzKCk7XG5cdFx0fVxuXHRcdGFjdGl2ZS5yZXNvbHZlKHRhcmdldCk7XG5cdH1cblxuXHRwcml2YXRlIF9oaWRlV2lkZ2V0KGFjdGl2ZTogSUFjdGl2ZUZvbGRlclBpY2tlcik6IHZvaWQge1xuXHRcdGNvbnN0IHNob3duID0gYWN0aXZlLnNob3duO1xuXHRcdGFjdGl2ZS5zaG93biA9IHVuZGVmaW5lZDtcblx0XHRpZiAoc2hvd24gPT09ICd0YWJiZWQnICYmIHRoaXMuX3RhYmJlZEZvbGRlclBpY2tlcj8uaXNWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLl90YWJiZWRGb2xkZXJQaWNrZXIuaGlkZSgpO1xuXHRcdH0gZWxzZSBpZiAoc2hvd24gPT09ICdmbGF0Jykge1xuXHRcdFx0dGhpcy5hY3Rpb25XaWRnZXRTZXJ2aWNlLmhpZGUodHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2xvc2VTdXJmYWNlKGFjdGl2ZTogSUFjdGl2ZUZvbGRlclBpY2tlcik6IHZvaWQge1xuXHRcdGlmIChhY3RpdmUuc3VyZmFjZU9wZW4pIHtcblx0XHRcdGFjdGl2ZS5zdXJmYWNlT3BlbiA9IGZhbHNlO1xuXHRcdFx0dm9pZCB0aGlzLmhvc3Qub25EaWRDaGFuZ2VBY3Rpb25XaWRnZXRWaXNpYmlsaXR5Py4oZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2lzU2VsZWN0ZWRXb3Jrc3BhY2Uod29ya3NwYWNlOiBJQ2hhdFNlc3Npb25Sb3V0aW5nV29ya3NwYWNlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlzRXF1YWwod29ya3NwYWNlLnVyaSwgdGhpcy5fdGFyZ2V0LnVyaSlcblx0XHRcdCYmICghdGhpcy5fdGFyZ2V0LnByb3ZpZGVySWQgfHwgd29ya3NwYWNlLnByb3ZpZGVySWQgPT09IHRoaXMuX3RhcmdldC5wcm92aWRlcklkKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzQ3VycmVudChhY3RpdmU6IElBY3RpdmVGb2xkZXJQaWNrZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aXZlID09PSBhY3RpdmVcblx0XHRcdCYmIGFjdGl2ZS5pZCA8PSB0aGlzLl9yZXF1ZXN0SWRcblx0XHRcdCYmICF0aGlzLl9pc0Rpc3Bvc2VkXG5cdFx0XHQmJiAhYWN0aXZlLm9wdGlvbnMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXIoZXhwYW5kZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmVsZW1lbnQucmVwbGFjZUNoaWxkcmVuKCk7XG5cdFx0Y29uc3QgZm9sZGVySWNvbiA9IGRvbS5hcHBlbmQodGhpcy5lbGVtZW50LCByZW5kZXJJY29uKENvZGljb24uZm9sZGVyKSk7XG5cdFx0Zm9sZGVySWNvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRjb25zdCBsYWJlbCA9IGRvbS5hcHBlbmQodGhpcy5lbGVtZW50LCBkb20uJCgnc3Bhbi5jaGF0LXJvdXRpbmctYmFkZ2UtZm9sZGVyLWFjdGlvbi1sYWJlbCcpKTtcblx0XHRsYWJlbC50ZXh0Q29udGVudCA9IHRoaXMuX3RhcmdldC5sYWJlbCA/PyBsb2NhbGl6ZSgnY2hhdFNlc3Npb25Sb3V0aW5nLmNob29zZUZvbGRlcicsIFwiQ2hvb3NlIEZvbGRlclwiKTtcblx0XHRjb25zdCBjaGV2cm9uID0gZG9tLmFwcGVuZCh0aGlzLmVsZW1lbnQsIHJlbmRlckljb24oZXhwYW5kZWQgPyBDb2RpY29uLmNoZXZyb25MZWZ0IDogQ29kaWNvbi5jaGV2cm9uUmlnaHQpKTtcblx0XHRjaGV2cm9uLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdHRoaXMuZWxlbWVudC50aXRsZSA9IHRoaXMuX3RhcmdldC5sYWJlbFxuXHRcdFx0PyBsb2NhbGl6ZSgnY2hhdFNlc3Npb25Sb3V0aW5nLmNoYW5nZVRhcmdldEZvbGRlcldpdGhOYW1lJywgXCJDaGFuZ2UgdGFyZ2V0IGZvbGRlciAoezB9KVwiLCB0aGlzLl90YXJnZXQubGFiZWwpXG5cdFx0XHQ6IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcuY2hhbmdlVGFyZ2V0Rm9sZGVyJywgXCJDaG9vc2UgRm9sZGVyXCIpO1xuXHRcdHRoaXMuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aGlzLmVsZW1lbnQudGl0bGUpO1xuXHRcdHRoaXMuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCBTdHJpbmcoZXhwYW5kZWQpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2FjdGl2ZSkge1xuXHRcdFx0dGhpcy5fZmluaXNoKHRoaXMuX2FjdGl2ZSwgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0fVxuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBRXJCLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsVUFBVSxlQUFlO0FBRWxDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMEJBQTJDO0FB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
