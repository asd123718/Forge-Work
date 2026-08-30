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
import { localize, localize2 } from "../../../../../nls.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { assertNever } from "../../../../../base/common/assert.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { INotificationService, Severity } from "../../../../../platform/notification/common/notification.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { BrowserViewCommandId } from "../../../../../platform/browserView/common/browserView.js";
import {
  ALL_PERMISSION_CATEGORIES,
  PERMISSION_CATEGORY_DESCRIPTORS,
  toOriginKey
} from "../../../../../platform/browserView/common/browserPermissions.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import {
  BROWSER_EDITOR_ACTIVE,
  CONTEXT_BROWSER_HAS_URL,
  BrowserActionCategory,
  BrowserActionGroup,
  BrowserEditor,
  BrowserEditorContribution
} from "../browserEditor.js";
let BrowserPermissionsFeature = class extends BrowserEditorContribution {
  constructor(editor, _quickInputService, _notificationService, _dialogService) {
    super(editor);
    this._quickInputService = _quickInputService;
    this._notificationService = _notificationService;
    this._dialogService = _dialogService;
    this._modelDisposables = this._register(new DisposableStore());
    /** Open device choosers keyed by request id, so updates reach the right one. */
    this._devicePickers = /* @__PURE__ */ new Map();
  }
  onModelAttached() {
    this._modelDisposables.clear();
    this._model = this.editor.model;
    this._permissions = this._model.permissions;
    this._modelDisposables.add(this._model.onDidRequestPermission((e) => {
      if (e.device) {
        this._onDidRequestDevice(e.origin, e.device);
      } else {
        void this._onDidRequestPermission(e.origin, e.category);
      }
    }));
    this._modelDisposables.add(toDisposable(() => this._closeDevicePickers()));
  }
  onModelDetached() {
    this._modelDisposables.clear();
    this._model = void 0;
    this._permissions = void 0;
  }
  _closeDevicePickers() {
    for (const picker of [...this._devicePickers.values()]) {
      picker.dispose();
    }
    this._devicePickers.clear();
  }
  _onDidRequestDevice(origin, request) {
    const existing = this._devicePickers.get(request.requestId);
    if (existing) {
      existing.update(request);
      return;
    }
    const model = this._model;
    if (!model) {
      return;
    }
    const handle = showDevicePicker(this._quickInputService, model, origin, request, () => this._devicePickers.delete(request.requestId));
    this._devicePickers.set(request.requestId, handle);
  }
  async _onDidRequestPermission(origin, category) {
    const model = this._model;
    if (!model) {
      return;
    }
    const descriptor = PERMISSION_CATEGORY_DESCRIPTORS[category];
    const { result } = await this._dialogService.prompt({
      type: Severity.Info,
      message: localize("browser.permissions.prompt", "{0} wants access to {1}", displayOrigin(origin), descriptor.label),
      detail: `\u2022 ${descriptor.description}`,
      buttons: [
        {
          label: localize("browser.permissions.allow", "Allow"),
          run: () => "allow"
        },
        {
          label: localize("browser.permissions.block", "Block"),
          run: () => "deny"
        }
      ],
      // Dismissing leaves the request undecided. The main process settles
      // the page's request on navigation / teardown (or a timeout), so a
      // late answer here is harmless.
      cancelButton: true
    });
    if (result === "allow" || result === "deny") {
      void model.setPermissions(origin, [{ category, state: result }]);
    } else {
      void model.setPermissions(origin, [{ category, state: null }]);
    }
  }
  showManagementPicker() {
    const model = this._model;
    const permissions = this._permissions;
    if (!model || !permissions) {
      return;
    }
    const origin = toOriginKey(model.url);
    if (!origin) {
      this._notificationService.info(localize("browser.permissions.noOrigin", "Permissions can only be managed for web pages."));
      return;
    }
    showPermissionsPicker(this._quickInputService, model, permissions, origin);
  }
};
BrowserPermissionsFeature = __decorateClass([
  __decorateParam(1, IQuickInputService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IDialogService)
], BrowserPermissionsFeature);
BrowserEditor.registerContribution(BrowserPermissionsFeature);
function deviceTypeLabel(deviceType) {
  switch (deviceType) {
    case "usb":
      return localize("browser.device.kind.usb", "a USB device");
    case "serial":
      return localize("browser.device.kind.serial", "a serial port");
    case "hid":
      return localize("browser.device.kind.hid", "an HID device");
    case "bluetooth":
      return localize("browser.device.kind.bluetooth", "a Bluetooth device");
    default:
      assertNever(deviceType);
  }
}
function showDevicePicker(quickInputService, model, origin, request, onDone) {
  const disposables = new DisposableStore();
  const picker = disposables.add(quickInputService.createQuickPick());
  picker.title = localize("browser.device.title", "{0} wants to connect to {1}", displayOrigin(origin), deviceTypeLabel(request.deviceType));
  picker.placeholder = localize("browser.device.placeholder", "Select a device to connect to");
  picker.matchOnDescription = true;
  picker.ignoreFocusOut = true;
  picker.busy = true;
  let resolved = false;
  let finished = false;
  const finish = () => {
    if (finished) {
      return;
    }
    finished = true;
    disposables.dispose();
    onDone();
  };
  const resolve = (deviceId) => {
    if (resolved) {
      return;
    }
    resolved = true;
    void model.selectDevice(request.requestId, deviceId);
  };
  const setDevices = (devices) => {
    const activeId = picker.activeItems[0]?.deviceId;
    const items = devices.map((device) => ({ label: device.label, description: device.detail, deviceId: device.deviceId }));
    picker.items = items;
    if (activeId !== void 0) {
      const active = items.find((item) => item.deviceId === activeId);
      if (active) {
        picker.activeItems = [active];
      }
    }
  };
  setDevices(request.devices);
  disposables.add(picker.onDidAccept(() => {
    const pick = picker.selectedItems[0];
    if (!pick) {
      return;
    }
    resolve(pick.deviceId);
    finish();
  }));
  disposables.add(picker.onDidHide(() => {
    resolve(null);
    finish();
  }));
  picker.show();
  return {
    update: (next) => {
      setDevices(next.devices);
    },
    dispose: () => {
      resolve(null);
      finish();
    }
  };
}
function showPermissionsPicker(quickInputService, model, permissions, origin) {
  const disposables = new DisposableStore();
  const picker = disposables.add(quickInputService.createQuickPick());
  picker.title = localize("browser.permissions.title", "Permissions for {0}", displayOrigin(origin));
  picker.placeholder = localize("browser.permissions.placeholder", "Filter permissions");
  picker.sortByLabel = false;
  picker.ignoreFocusOut = true;
  const edits = /* @__PURE__ */ new Map();
  const storedDecision = (category) => {
    return permissions.getDecision(origin, category) ?? null;
  };
  const pendingDecision = (category) => edits.has(category) ? edits.get(category) : storedDecision(category);
  const setPendingDecision = (category, decision) => {
    if (decision === storedDecision(category)) {
      edits.delete(category);
    } else {
      edits.set(category, decision);
    }
    rebuild();
  };
  const rebuild = () => {
    const activeCategory = picker.activeItems[0]?.category;
    const items = buildItems();
    picker.items = items;
    if (activeCategory !== void 0) {
      const active = items.find((item) => item.category === activeCategory);
      if (active) {
        picker.activeItems = [active];
      }
    }
    picker.customButton = edits.size > 0;
    picker.customLabel = edits.size === 1 ? localize("browser.permissions.saveOne", "Save 1 Change") : localize("browser.permissions.saveMany", "Save {0} Changes", edits.size);
  };
  rebuild();
  disposables.add(picker.onDidTriggerItemButton(({ button, item }) => {
    const { kind } = button;
    if (kind === "allow") {
      setPendingDecision(item.category, "allow");
    } else if (kind === "deny") {
      setPendingDecision(item.category, "deny");
    } else {
      setPendingDecision(item.category, null);
    }
  }));
  disposables.add(picker.onDidCustom(() => {
    if (edits.size === 0) {
      return;
    }
    const grants = [...edits].map(([category, state]) => ({ category, state }));
    void model.setPermissions(origin, grants);
    picker.hide();
  }));
  disposables.add(permissions.onDidChange(rebuild));
  disposables.add(picker.onDidHide(() => disposables.dispose()));
  picker.show();
  function buildItems() {
    return ALL_PERMISSION_CATEGORIES.map(buildItem);
  }
  function buildItem(category) {
    const descriptor = PERMISSION_CATEGORY_DESCRIPTORS[category];
    const override = pendingDecision(category);
    const hasOverride = !!override;
    const effective = hasOverride ? override : permissions.defaultStateFor(category);
    const stateLabel = effective === "allow" ? localize("browser.permissions.state.allowed", "Allowed") : effective === "deny" ? localize("browser.permissions.state.blocked", "Blocked") : localize("browser.permissions.state.ask", "Ask");
    const description = hasOverride ? stateLabel : localize("browser.permissions.state.default", "{0} (default)", stateLabel);
    const buttons = [];
    if (effective !== "allow") {
      buttons.push({
        kind: "allow",
        iconClass: ThemeIcon.asClassName(Codicon.check),
        tooltip: localize("browser.permissions.allow", "Allow")
      });
    }
    if (effective !== "deny") {
      buttons.push({
        kind: "deny",
        iconClass: ThemeIcon.asClassName(Codicon.circleSlash),
        tooltip: localize("browser.permissions.block", "Block")
      });
    }
    if (effective !== "ask") {
      buttons.push({
        kind: hasOverride ? "reset" : effective === "allow" ? "allow" : "deny",
        iconClass: ThemeIcon.asClassName(effective === "allow" ? Codicon.check : Codicon.circleSlash),
        alwaysVisible: true,
        toggle: { checked: hasOverride },
        tooltip: description
      });
    }
    return {
      category,
      label: descriptor.label,
      detail: descriptor.description,
      iconClass: ThemeIcon.asClassName(descriptor.icon),
      buttons
    };
  }
}
function displayOrigin(origin) {
  try {
    return new URL(origin).host || origin;
  } catch {
    return origin;
  }
}
const _ManageBrowserPermissionsAction = class _ManageBrowserPermissionsAction extends Action2 {
  constructor() {
    const when = ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL);
    super({
      id: _ManageBrowserPermissionsAction.ID,
      title: localize2("browser.managePermissions", "Site Permissions"),
      category: BrowserActionCategory,
      icon: Codicon.shield,
      f1: true,
      precondition: when,
      menu: {
        id: MenuId.BrowserActionsToolbar,
        group: BrowserActionGroup.Data,
        order: 10,
        when,
        isHiddenByDefault: true
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      browserEditor.getContribution(BrowserPermissionsFeature)?.showManagementPicker();
    }
  }
};
_ManageBrowserPermissionsAction.ID = BrowserViewCommandId.ManagePermissions;
let ManageBrowserPermissionsAction = _ManageBrowserPermissionsAction;
registerAction2(ManageBrowserPermissionsAction);
export {
  BrowserPermissionsFeature
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFxmZWF0dXJlc1xcYnJvd3NlclBlcm1pc3Npb25zRmVhdHVyZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGFzc2VydE5ldmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0QnV0dG9uLCBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJWaWV3RGV2aWNlUmVxdWVzdCwgQnJvd3NlclZpZXdDb21tYW5kSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHtcblx0QUxMX1BFUk1JU1NJT05fQ0FURUdPUklFUyxcblx0QnJvd3NlckRldmljZVR5cGUsXG5cdEJyb3dzZXJQZXJtaXNzaW9uU3RvcmUsXG5cdFBFUk1JU1NJT05fQ0FURUdPUllfREVTQ1JJUFRPUlMsXG5cdFBlcm1pc3Npb25DYXRlZ29yeSxcblx0UGVybWlzc2lvbkRlY2lzaW9uLFxuXHRQZXJtaXNzaW9uU3RhdGUsXG5cdHRvT3JpZ2luS2V5LFxufSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vYnJvd3NlclBlcm1pc3Npb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElCcm93c2VyVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7XG5cdEJST1dTRVJfRURJVE9SX0FDVElWRSxcblx0Q09OVEVYVF9CUk9XU0VSX0hBU19VUkwsXG5cdEJyb3dzZXJBY3Rpb25DYXRlZ29yeSxcblx0QnJvd3NlckFjdGlvbkdyb3VwLFxuXHRCcm93c2VyRWRpdG9yLFxuXHRCcm93c2VyRWRpdG9yQ29udHJpYnV0aW9uLFxufSBmcm9tICcuLi9icm93c2VyRWRpdG9yLmpzJztcblxuLyoqXG4gKiBTdXJmYWNlcyBwZXItb3JpZ2luIHBlcm1pc3Npb24gcHJvbXB0cyBhbmQgYSBtYW5hZ2VtZW50IHBpY2tlciBmb3IgdGhlIGFjdGl2ZVxuICogYnJvd3NlciB2aWV3LiBQcm9tcHRzIGFyZSByYWlzZWQgYnkgdGhlIG1haW4gcHJvY2VzcyB2aWFcbiAqIHtAbGluayBJQnJvd3NlclZpZXdNb2RlbC5vbkRpZFJlcXVlc3RQZXJtaXNzaW9ufTsgdGhlIHVzZXIncyBjaG9pY2UgLS0gYW5kIGFueVxuICogZWRpdHMgbWFkZSBpbiB0aGUgbWFuYWdlbWVudCBwaWNrZXIgLS0gZmxvdyBiYWNrIHRocm91Z2ggdGhlIHNpbmdsZVxuICoge0BsaW5rIElCcm93c2VyVmlld01vZGVsLnNldFBlcm1pc3Npb25zfSB3cml0ZSBBUEksIHdoaWNoIGJvdGggcGVyc2lzdHMgdGhlXG4gKiBkZWNpc2lvbiBhbmQgcmVzb2x2ZXMgdGhlIHBlbmRpbmcgcmVxdWVzdCBpbiB0aGUgbWFpbiBwcm9jZXNzLlxuICovXG5leHBvcnQgY2xhc3MgQnJvd3NlclBlcm1pc3Npb25zRmVhdHVyZSBleHRlbmRzIEJyb3dzZXJFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHByaXZhdGUgX21vZGVsOiBJQnJvd3NlclZpZXdNb2RlbCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcGVybWlzc2lvbnM6IEJyb3dzZXJQZXJtaXNzaW9uU3RvcmUgfCB1bmRlZmluZWQ7XG5cblx0LyoqIE9wZW4gZGV2aWNlIGNob29zZXJzIGtleWVkIGJ5IHJlcXVlc3QgaWQsIHNvIHVwZGF0ZXMgcmVhY2ggdGhlIHJpZ2h0IG9uZS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZGV2aWNlUGlja2VycyA9IG5ldyBNYXA8c3RyaW5nLCBJRGV2aWNlUGlja2VySGFuZGxlPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogQnJvd3NlckVkaXRvcixcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoZWRpdG9yKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvbk1vZGVsQXR0YWNoZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZWxEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuX21vZGVsID0gdGhpcy5lZGl0b3IubW9kZWwhO1xuXHRcdHRoaXMuX3Blcm1pc3Npb25zID0gdGhpcy5fbW9kZWwucGVybWlzc2lvbnM7XG5cdFx0dGhpcy5fbW9kZWxEaXNwb3NhYmxlcy5hZGQodGhpcy5fbW9kZWwub25EaWRSZXF1ZXN0UGVybWlzc2lvbihlID0+IHtcblx0XHRcdGlmIChlLmRldmljZSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZFJlcXVlc3REZXZpY2UoZS5vcmlnaW4sIGUuZGV2aWNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZvaWQgdGhpcy5fb25EaWRSZXF1ZXN0UGVybWlzc2lvbihlLm9yaWdpbiwgZS5jYXRlZ29yeSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdC8vIENsb3NlIGFueSBvcGVuIGRldmljZSBjaG9vc2VycyB3aGVuIHRoZSBtb2RlbCBnb2VzIGF3YXkuXG5cdFx0dGhpcy5fbW9kZWxEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX2Nsb3NlRGV2aWNlUGlja2VycygpKSk7XG5cdH1cblxuXHRvdmVycmlkZSBvbk1vZGVsRGV0YWNoZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZWxEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuX21vZGVsID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3Blcm1pc3Npb25zID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xvc2VEZXZpY2VQaWNrZXJzKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcGlja2VyIG9mIFsuLi50aGlzLl9kZXZpY2VQaWNrZXJzLnZhbHVlcygpXSkge1xuXHRcdFx0cGlja2VyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fZGV2aWNlUGlja2Vycy5jbGVhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRSZXF1ZXN0RGV2aWNlKG9yaWdpbjogc3RyaW5nLCByZXF1ZXN0OiBJQnJvd3NlclZpZXdEZXZpY2VSZXF1ZXN0KTogdm9pZCB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9kZXZpY2VQaWNrZXJzLmdldChyZXF1ZXN0LnJlcXVlc3RJZCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRleGlzdGluZy51cGRhdGUocmVxdWVzdCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbW9kZWw7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBoYW5kbGUgPSBzaG93RGV2aWNlUGlja2VyKHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLCBtb2RlbCwgb3JpZ2luLCByZXF1ZXN0LCAoKSA9PiB0aGlzLl9kZXZpY2VQaWNrZXJzLmRlbGV0ZShyZXF1ZXN0LnJlcXVlc3RJZCkpO1xuXHRcdHRoaXMuX2RldmljZVBpY2tlcnMuc2V0KHJlcXVlc3QucmVxdWVzdElkLCBoYW5kbGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfb25EaWRSZXF1ZXN0UGVybWlzc2lvbihvcmlnaW46IHN0cmluZywgY2F0ZWdvcnk6IFBlcm1pc3Npb25DYXRlZ29yeSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbW9kZWw7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkZXNjcmlwdG9yID0gUEVSTUlTU0lPTl9DQVRFR09SWV9ERVNDUklQVE9SU1tjYXRlZ29yeV07XG5cdFx0Y29uc3QgeyByZXN1bHQgfSA9IGF3YWl0IHRoaXMuX2RpYWxvZ1NlcnZpY2UucHJvbXB0PFBlcm1pc3Npb25EZWNpc2lvbj4oe1xuXHRcdFx0dHlwZTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdicm93c2VyLnBlcm1pc3Npb25zLnByb21wdCcsIFwiezB9IHdhbnRzIGFjY2VzcyB0byB7MX1cIiwgZGlzcGxheU9yaWdpbihvcmlnaW4pLCBkZXNjcmlwdG9yLmxhYmVsKSxcblx0XHRcdGRldGFpbDogYFx1MjAyMiAke2Rlc2NyaXB0b3IuZGVzY3JpcHRpb259YCxcblx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYnJvd3Nlci5wZXJtaXNzaW9ucy5hbGxvdycsIFwiQWxsb3dcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiAnYWxsb3cnLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdicm93c2VyLnBlcm1pc3Npb25zLmJsb2NrJywgXCJCbG9ja1wiKSxcblx0XHRcdFx0XHRydW46ICgpID0+ICdkZW55Jyxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0XHQvLyBEaXNtaXNzaW5nIGxlYXZlcyB0aGUgcmVxdWVzdCB1bmRlY2lkZWQuIFRoZSBtYWluIHByb2Nlc3Mgc2V0dGxlc1xuXHRcdFx0Ly8gdGhlIHBhZ2UncyByZXF1ZXN0IG9uIG5hdmlnYXRpb24gLyB0ZWFyZG93biAob3IgYSB0aW1lb3V0KSwgc28gYVxuXHRcdFx0Ly8gbGF0ZSBhbnN3ZXIgaGVyZSBpcyBoYXJtbGVzcy5cblx0XHRcdGNhbmNlbEJ1dHRvbjogdHJ1ZSxcblx0XHR9KTtcblx0XHRpZiAocmVzdWx0ID09PSAnYWxsb3cnIHx8IHJlc3VsdCA9PT0gJ2RlbnknKSB7XG5cdFx0XHR2b2lkIG1vZGVsLnNldFBlcm1pc3Npb25zKG9yaWdpbiwgW3sgY2F0ZWdvcnksIHN0YXRlOiByZXN1bHQgfV0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBTaWduYWwgYW4gZXhwbGljaXQgY2FuY2VsIHNvIHRoZSBwZW5kaW5nIHBhZ2UgcmVxdWVzdCByZWplY3RzXG5cdFx0XHQvLyBpbW1lZGlhdGVseSB3aXRob3V0IHJlY29yZGluZyBhIHBlcnNpc3RlZCBkZWNpc2lvbi5cblx0XHRcdHZvaWQgbW9kZWwuc2V0UGVybWlzc2lvbnMob3JpZ2luLCBbeyBjYXRlZ29yeSwgc3RhdGU6IG51bGwgfV0pO1xuXHRcdH1cblx0fVxuXG5cdHNob3dNYW5hZ2VtZW50UGlja2VyKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbW9kZWw7XG5cdFx0Y29uc3QgcGVybWlzc2lvbnMgPSB0aGlzLl9wZXJtaXNzaW9ucztcblx0XHRpZiAoIW1vZGVsIHx8ICFwZXJtaXNzaW9ucykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBvcmlnaW4gPSB0b09yaWdpbktleShtb2RlbC51cmwpO1xuXHRcdGlmICghb3JpZ2luKSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmluZm8obG9jYWxpemUoJ2Jyb3dzZXIucGVybWlzc2lvbnMubm9PcmlnaW4nLCBcIlBlcm1pc3Npb25zIGNhbiBvbmx5IGJlIG1hbmFnZWQgZm9yIHdlYiBwYWdlcy5cIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRzaG93UGVybWlzc2lvbnNQaWNrZXIodGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UsIG1vZGVsLCBwZXJtaXNzaW9ucywgb3JpZ2luKTtcblx0fVxufVxuXG5Ccm93c2VyRWRpdG9yLnJlZ2lzdGVyQ29udHJpYnV0aW9uKEJyb3dzZXJQZXJtaXNzaW9uc0ZlYXR1cmUpO1xuXG4vLyAtLSBEZXZpY2UgY2hvb3NlciAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5pbnRlcmZhY2UgRGV2aWNlUGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdHJlYWRvbmx5IGRldmljZUlkOiBzdHJpbmc7XG59XG5cbi8qKiBIYW5kbGUgdG8gYSBsaXZlIGRldmljZSBjaG9vc2VyIHNvIGl0IGNhbiBiZSB1cGRhdGVkIG9yIGZvcmNlLWNsb3NlZC4gKi9cbmludGVyZmFjZSBJRGV2aWNlUGlja2VySGFuZGxlIHtcblx0LyoqIEFwcGx5IGFuIHVwZGF0ZWQgZGV2aWNlIGxpc3QuICovXG5cdHVwZGF0ZShyZXF1ZXN0OiBJQnJvd3NlclZpZXdEZXZpY2VSZXF1ZXN0KTogdm9pZDtcblx0LyoqIEZvcmNlLWNsb3NlIHRoZSBjaG9vc2VyLCBjYW5jZWxsaW5nIHRoZSByZXF1ZXN0IGlmIHN0aWxsIHBlbmRpbmcuICovXG5cdGRpc3Bvc2UoKTogdm9pZDtcbn1cblxuZnVuY3Rpb24gZGV2aWNlVHlwZUxhYmVsKGRldmljZVR5cGU6IEJyb3dzZXJEZXZpY2VUeXBlKTogc3RyaW5nIHtcblx0c3dpdGNoIChkZXZpY2VUeXBlKSB7XG5cdFx0Y2FzZSAndXNiJzogcmV0dXJuIGxvY2FsaXplKCdicm93c2VyLmRldmljZS5raW5kLnVzYicsIFwiYSBVU0IgZGV2aWNlXCIpO1xuXHRcdGNhc2UgJ3NlcmlhbCc6IHJldHVybiBsb2NhbGl6ZSgnYnJvd3Nlci5kZXZpY2Uua2luZC5zZXJpYWwnLCBcImEgc2VyaWFsIHBvcnRcIik7XG5cdFx0Y2FzZSAnaGlkJzogcmV0dXJuIGxvY2FsaXplKCdicm93c2VyLmRldmljZS5raW5kLmhpZCcsIFwiYW4gSElEIGRldmljZVwiKTtcblx0XHRjYXNlICdibHVldG9vdGgnOiByZXR1cm4gbG9jYWxpemUoJ2Jyb3dzZXIuZGV2aWNlLmtpbmQuYmx1ZXRvb3RoJywgXCJhIEJsdWV0b290aCBkZXZpY2VcIik7XG5cdFx0ZGVmYXVsdDogYXNzZXJ0TmV2ZXIoZGV2aWNlVHlwZSk7XG5cdH1cbn1cblxuLyoqXG4gKiBTaG93IGEgbGl2ZS11cGRhdGluZyBjaG9vc2VyIGZvciBhIGhhcmR3YXJlLWRldmljZSByZXF1ZXN0LiBUaGUgbGlzdCByZWZyZXNoZXNcbiAqIGFzIGRldmljZXMgYXJlIGRpc2NvdmVyZWQgKHJlLWZpcmVkIHdpdGggdGhlIHNhbWUgcmVxdWVzdCBpZCk7IGFjY2VwdGluZyBwaWNrc1xuICogYSBkZXZpY2UgYW5kIGRpc21pc3NpbmcgY2FuY2VscyB0aGUgcmVxdWVzdC4gRXhhY3RseSBvbmUgb2Ygc2VsZWN0L2NhbmNlbCBpc1xuICogcmVwb3J0ZWQgYmFjayB0byB0aGUgbW9kZWwuXG4gKi9cbmZ1bmN0aW9uIHNob3dEZXZpY2VQaWNrZXIocXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSwgbW9kZWw6IElCcm93c2VyVmlld01vZGVsLCBvcmlnaW46IHN0cmluZywgcmVxdWVzdDogSUJyb3dzZXJWaWV3RGV2aWNlUmVxdWVzdCwgb25Eb25lOiAoKSA9PiB2b2lkKTogSURldmljZVBpY2tlckhhbmRsZSB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRjb25zdCBwaWNrZXIgPSBkaXNwb3NhYmxlcy5hZGQocXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPERldmljZVBpY2tJdGVtPigpKTtcblx0cGlja2VyLnRpdGxlID0gbG9jYWxpemUoJ2Jyb3dzZXIuZGV2aWNlLnRpdGxlJywgXCJ7MH0gd2FudHMgdG8gY29ubmVjdCB0byB7MX1cIiwgZGlzcGxheU9yaWdpbihvcmlnaW4pLCBkZXZpY2VUeXBlTGFiZWwocmVxdWVzdC5kZXZpY2VUeXBlKSk7XG5cdHBpY2tlci5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdicm93c2VyLmRldmljZS5wbGFjZWhvbGRlcicsIFwiU2VsZWN0IGEgZGV2aWNlIHRvIGNvbm5lY3QgdG9cIik7XG5cdHBpY2tlci5tYXRjaE9uRGVzY3JpcHRpb24gPSB0cnVlO1xuXHRwaWNrZXIuaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHQvLyBTdGlsbCBzY2FubmluZzogdGhlIGxpc3QgbWF5IGtlZXAgZ3Jvd2luZyB1bnRpbCB0aGUgdXNlciBwaWNrcyBvciBjYW5jZWxzLlxuXHRwaWNrZXIuYnVzeSA9IHRydWU7XG5cblx0bGV0IHJlc29sdmVkID0gZmFsc2U7XG5cdGxldCBmaW5pc2hlZCA9IGZhbHNlO1xuXG5cdGNvbnN0IGZpbmlzaCA9ICgpID0+IHtcblx0XHRpZiAoZmluaXNoZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0ZmluaXNoZWQgPSB0cnVlO1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRvbkRvbmUoKTtcblx0fTtcblxuXHQvLyBSZXBvcnQgYSBzaW5nbGUgZGVjaXNpb24gdG8gdGhlIG1vZGVsOiBhIGNob3NlbiBpZCwgb3IgbnVsbCB0byBjYW5jZWwuXG5cdGNvbnN0IHJlc29sdmUgPSAoZGV2aWNlSWQ6IHN0cmluZyB8IG51bGwpID0+IHtcblx0XHRpZiAocmVzb2x2ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmVzb2x2ZWQgPSB0cnVlO1xuXHRcdHZvaWQgbW9kZWwuc2VsZWN0RGV2aWNlKHJlcXVlc3QucmVxdWVzdElkLCBkZXZpY2VJZCk7XG5cdH07XG5cblx0Y29uc3Qgc2V0RGV2aWNlcyA9IChkZXZpY2VzOiByZWFkb25seSB7IGRldmljZUlkOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IGRldGFpbD86IHN0cmluZyB9W10pID0+IHtcblx0XHRjb25zdCBhY3RpdmVJZCA9IHBpY2tlci5hY3RpdmVJdGVtc1swXT8uZGV2aWNlSWQ7XG5cdFx0Y29uc3QgaXRlbXM6IERldmljZVBpY2tJdGVtW10gPSBkZXZpY2VzLm1hcChkZXZpY2UgPT4gKHsgbGFiZWw6IGRldmljZS5sYWJlbCwgZGVzY3JpcHRpb246IGRldmljZS5kZXRhaWwsIGRldmljZUlkOiBkZXZpY2UuZGV2aWNlSWQgfSkpO1xuXHRcdHBpY2tlci5pdGVtcyA9IGl0ZW1zO1xuXHRcdGlmIChhY3RpdmVJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBhY3RpdmUgPSBpdGVtcy5maW5kKGl0ZW0gPT4gaXRlbS5kZXZpY2VJZCA9PT0gYWN0aXZlSWQpO1xuXHRcdFx0aWYgKGFjdGl2ZSkge1xuXHRcdFx0XHRwaWNrZXIuYWN0aXZlSXRlbXMgPSBbYWN0aXZlXTtcblx0XHRcdH1cblx0XHR9XG5cdH07XG5cblx0c2V0RGV2aWNlcyhyZXF1ZXN0LmRldmljZXMpO1xuXG5cdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdGNvbnN0IHBpY2sgPSBwaWNrZXIuc2VsZWN0ZWRJdGVtc1swXTtcblx0XHRpZiAoIXBpY2spIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmVzb2x2ZShwaWNrLmRldmljZUlkKTtcblx0XHRmaW5pc2goKTtcblx0fSkpO1xuXG5cdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRIaWRlKCgpID0+IHtcblx0XHQvLyBEaXNtaXNzZWQgd2l0aG91dCBhIHBpY2sgY2FuY2VscyB0aGUgcmVxdWVzdC5cblx0XHRyZXNvbHZlKG51bGwpO1xuXHRcdGZpbmlzaCgpO1xuXHR9KSk7XG5cblx0cGlja2VyLnNob3coKTtcblxuXHRyZXR1cm4ge1xuXHRcdHVwZGF0ZTogKG5leHQ6IElCcm93c2VyVmlld0RldmljZVJlcXVlc3QpID0+IHtcblx0XHRcdHNldERldmljZXMobmV4dC5kZXZpY2VzKTtcblx0XHR9LFxuXHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdHJlc29sdmUobnVsbCk7XG5cdFx0XHRmaW5pc2goKTtcblx0XHR9LFxuXHR9O1xufVxuXG4vLyAtLSBNYW5hZ2VtZW50IHBpY2tlciAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5pbnRlcmZhY2UgUGVybWlzc2lvblBpY2tJdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRyZWFkb25seSBjYXRlZ29yeTogUGVybWlzc2lvbkNhdGVnb3J5O1xufVxuXG4vKiogRGlzY3JpbWluYXRlcyB0aGUgcGVyLXJvdyBhY3Rpb24gYnV0dG9ucyBzbyB0aGUgaGFuZGxlciBjYW4gcmVhY3QuICovXG5pbnRlcmZhY2UgUGVybWlzc2lvbkl0ZW1CdXR0b24gZXh0ZW5kcyBJUXVpY2tJbnB1dEJ1dHRvbiB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdhbGxvdycgfCAnZGVueScgfCAncmVzZXQnO1xufVxuXG5mdW5jdGlvbiBzaG93UGVybWlzc2lvbnNQaWNrZXIocXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSwgbW9kZWw6IElCcm93c2VyVmlld01vZGVsLCBwZXJtaXNzaW9uczogQnJvd3NlclBlcm1pc3Npb25TdG9yZSwgb3JpZ2luOiBzdHJpbmcpOiB2b2lkIHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IHBpY2tlciA9IGRpc3Bvc2FibGVzLmFkZChxdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8UGVybWlzc2lvblBpY2tJdGVtPigpKTtcblx0cGlja2VyLnRpdGxlID0gbG9jYWxpemUoJ2Jyb3dzZXIucGVybWlzc2lvbnMudGl0bGUnLCBcIlBlcm1pc3Npb25zIGZvciB7MH1cIiwgZGlzcGxheU9yaWdpbihvcmlnaW4pKTtcblx0cGlja2VyLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ2Jyb3dzZXIucGVybWlzc2lvbnMucGxhY2Vob2xkZXInLCBcIkZpbHRlciBwZXJtaXNzaW9uc1wiKTtcblx0cGlja2VyLnNvcnRCeUxhYmVsID0gZmFsc2U7XG5cdHBpY2tlci5pZ25vcmVGb2N1c091dCA9IHRydWU7XG5cblx0Ly8gUGVuZGluZywgdW5zYXZlZCBkZWNpc2lvbiBjaGFuZ2VzIGtleWVkIGJ5IGNhdGVnb3J5LiBBIHZhbHVlIG1hcHMgdG8gdGhlXG5cdC8vIGRlc2lyZWQgZGVjaXNpb24gKGBudWxsYCBjbGVhcnMgaXQpOyBhYnNlbmNlIG1lYW5zIG5vIGNoYW5nZSBmcm9tIHRoZVxuXHQvLyBzdG9yZWQgdmFsdWUuIEVkaXRzIGFyZSBjb21taXR0ZWQgb25seSB3aGVuIHRoZSB1c2VyIHNhdmVzLlxuXHRjb25zdCBlZGl0cyA9IG5ldyBNYXA8UGVybWlzc2lvbkNhdGVnb3J5LCBQZXJtaXNzaW9uRGVjaXNpb24gfCBudWxsPigpO1xuXG5cdC8vIFRoZSBzdG9yZWQgZGVjaXNpb24gZm9yIGEgY2F0ZWdvcnksIG9yIGB1bmRlZmluZWRgIHdoZW4gbm9uZSBpcyByZWNvcmRlZC5cblx0Y29uc3Qgc3RvcmVkRGVjaXNpb24gPSAoY2F0ZWdvcnk6IFBlcm1pc3Npb25DYXRlZ29yeSk6IFBlcm1pc3Npb25EZWNpc2lvbiB8IG51bGwgPT4ge1xuXHRcdHJldHVybiBwZXJtaXNzaW9ucy5nZXREZWNpc2lvbihvcmlnaW4sIGNhdGVnb3J5KSA/PyBudWxsO1xuXHR9O1xuXG5cdC8vIFRoZSBwZW5kaW5nIGRlY2lzaW9uIGZvciBhIGNhdGVnb3J5OiB0aGUgZWRpdCBpZiBhbnksIGVsc2UgdGhlIHN0b3JlZCB2YWx1ZS5cblx0Y29uc3QgcGVuZGluZ0RlY2lzaW9uID0gKGNhdGVnb3J5OiBQZXJtaXNzaW9uQ2F0ZWdvcnkpOiBQZXJtaXNzaW9uRGVjaXNpb24gfCBudWxsID0+XG5cdFx0ZWRpdHMuaGFzKGNhdGVnb3J5KSA/IGVkaXRzLmdldChjYXRlZ29yeSkhIDogc3RvcmVkRGVjaXNpb24oY2F0ZWdvcnkpO1xuXG5cdGNvbnN0IHNldFBlbmRpbmdEZWNpc2lvbiA9IChjYXRlZ29yeTogUGVybWlzc2lvbkNhdGVnb3J5LCBkZWNpc2lvbjogUGVybWlzc2lvbkRlY2lzaW9uIHwgbnVsbCk6IHZvaWQgPT4ge1xuXHRcdGlmIChkZWNpc2lvbiA9PT0gc3RvcmVkRGVjaXNpb24oY2F0ZWdvcnkpKSB7XG5cdFx0XHRlZGl0cy5kZWxldGUoY2F0ZWdvcnkpOyAvLyBiYWNrIHRvIHN0b3JlZCB2YWx1ZTogbm8gcGVuZGluZyBjaGFuZ2Vcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZWRpdHMuc2V0KGNhdGVnb3J5LCBkZWNpc2lvbik7XG5cdFx0fVxuXHRcdHJlYnVpbGQoKTtcblx0fTtcblxuXHRjb25zdCByZWJ1aWxkID0gKCk6IHZvaWQgPT4ge1xuXHRcdC8vIFByZXNlcnZlIHRoZSBmb2N1c2VkIHJvdyBhY3Jvc3MgcmVidWlsZHMgKGl0ZW0gaWRlbnRpdHkgY2hhbmdlcyBiZWNhdXNlXG5cdFx0Ly8gd2UgcmVjcmVhdGUgdGhlIGl0ZW1zIGVhY2ggdGltZSkuXG5cdFx0Y29uc3QgYWN0aXZlQ2F0ZWdvcnkgPSBwaWNrZXIuYWN0aXZlSXRlbXNbMF0/LmNhdGVnb3J5O1xuXHRcdGNvbnN0IGl0ZW1zID0gYnVpbGRJdGVtcygpO1xuXHRcdHBpY2tlci5pdGVtcyA9IGl0ZW1zO1xuXHRcdGlmIChhY3RpdmVDYXRlZ29yeSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBhY3RpdmUgPSBpdGVtcy5maW5kKGl0ZW0gPT4gaXRlbS5jYXRlZ29yeSA9PT0gYWN0aXZlQ2F0ZWdvcnkpO1xuXHRcdFx0aWYgKGFjdGl2ZSkge1xuXHRcdFx0XHRwaWNrZXIuYWN0aXZlSXRlbXMgPSBbYWN0aXZlXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cGlja2VyLmN1c3RvbUJ1dHRvbiA9IGVkaXRzLnNpemUgPiAwO1xuXHRcdHBpY2tlci5jdXN0b21MYWJlbCA9IGVkaXRzLnNpemUgPT09IDFcblx0XHRcdD8gbG9jYWxpemUoJ2Jyb3dzZXIucGVybWlzc2lvbnMuc2F2ZU9uZScsIFwiU2F2ZSAxIENoYW5nZVwiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnYnJvd3Nlci5wZXJtaXNzaW9ucy5zYXZlTWFueScsIFwiU2F2ZSB7MH0gQ2hhbmdlc1wiLCBlZGl0cy5zaXplKTtcblx0fTtcblxuXHRyZWJ1aWxkKCk7XG5cblx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZFRyaWdnZXJJdGVtQnV0dG9uKCh7IGJ1dHRvbiwgaXRlbSB9KSA9PiB7XG5cdFx0Y29uc3QgeyBraW5kIH0gPSBidXR0b24gYXMgUGVybWlzc2lvbkl0ZW1CdXR0b247XG5cdFx0aWYgKGtpbmQgPT09ICdhbGxvdycpIHtcblx0XHRcdHNldFBlbmRpbmdEZWNpc2lvbihpdGVtLmNhdGVnb3J5LCAnYWxsb3cnKTtcblx0XHR9IGVsc2UgaWYgKGtpbmQgPT09ICdkZW55Jykge1xuXHRcdFx0c2V0UGVuZGluZ0RlY2lzaW9uKGl0ZW0uY2F0ZWdvcnksICdkZW55Jyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFRoZSBjdXJyZW50LXZhbHVlIHRvZ2dsZSByZXNldHMgYmFjayB0byB0aGUgZGVmYXVsdCB3aGVuIGFjdGl2ZTsgaXRcblx0XHRcdC8vIGlzIGluZXJ0IChubyBvdmVycmlkZSB0byBjbGVhcikgd2hlbiBhbHJlYWR5IHNob3dpbmcgdGhlIGRlZmF1bHQuXG5cdFx0XHRzZXRQZW5kaW5nRGVjaXNpb24oaXRlbS5jYXRlZ29yeSwgbnVsbCk7XG5cdFx0fVxuXHR9KSk7XG5cblx0Ly8gQ29tbWl0IGFsbCBwZW5kaW5nIGVkaXRzIGluIG9uZSB3cml0ZSwgdGhlbiBjbG9zZS5cblx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZEN1c3RvbSgoKSA9PiB7XG5cdFx0aWYgKGVkaXRzLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZ3JhbnRzID0gWy4uLmVkaXRzXS5tYXAoKFtjYXRlZ29yeSwgc3RhdGVdKSA9PiAoeyBjYXRlZ29yeSwgc3RhdGUgfSkpO1xuXHRcdHZvaWQgbW9kZWwuc2V0UGVybWlzc2lvbnMob3JpZ2luLCBncmFudHMpO1xuXHRcdHBpY2tlci5oaWRlKCk7XG5cdH0pKTtcblxuXHQvLyBSZS1yZW5kZXIgd2hlbiB0aGUgc3RvcmUgY2hhbmdlcyB1bmRlcm5lYXRoIHVzIChlLmcuIGEgcHJvbXB0IGFuc3dlcmVkXG5cdC8vIGVsc2V3aGVyZSk7IHBlbmRpbmcgZWRpdHMgYXJlIHByZXNlcnZlZCBhbmQgc3RpbGwgdGFrZSBwcmVjZWRlbmNlLlxuXHRkaXNwb3NhYmxlcy5hZGQocGVybWlzc2lvbnMub25EaWRDaGFuZ2UocmVidWlsZCkpO1xuXG5cdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRIaWRlKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSkpO1xuXHRwaWNrZXIuc2hvdygpO1xuXG5cdGZ1bmN0aW9uIGJ1aWxkSXRlbXMoKTogUGVybWlzc2lvblBpY2tJdGVtW10ge1xuXHRcdHJldHVybiBBTExfUEVSTUlTU0lPTl9DQVRFR09SSUVTLm1hcChidWlsZEl0ZW0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gYnVpbGRJdGVtKGNhdGVnb3J5OiBQZXJtaXNzaW9uQ2F0ZWdvcnkpOiBQZXJtaXNzaW9uUGlja0l0ZW0ge1xuXHRcdGNvbnN0IGRlc2NyaXB0b3IgPSBQRVJNSVNTSU9OX0NBVEVHT1JZX0RFU0NSSVBUT1JTW2NhdGVnb3J5XTtcblx0XHRjb25zdCBvdmVycmlkZSA9IHBlbmRpbmdEZWNpc2lvbihjYXRlZ29yeSk7XG5cdFx0Y29uc3QgaGFzT3ZlcnJpZGUgPSAhIW92ZXJyaWRlO1xuXHRcdC8vIFRoZSBlZmZlY3RpdmUgc3RhdGUgc2hvd24gdW5kZXIgdGhlIG5hbWUgaXMgdGhlIChwZW5kaW5nKSBvdmVycmlkZSB3aGVuXG5cdFx0Ly8gc2V0LCBvdGhlcndpc2UgdGhlIGNhdGVnb3J5IGRlZmF1bHQuXG5cdFx0Y29uc3QgZWZmZWN0aXZlOiBQZXJtaXNzaW9uU3RhdGUgPSBoYXNPdmVycmlkZSA/IG92ZXJyaWRlIDogcGVybWlzc2lvbnMuZGVmYXVsdFN0YXRlRm9yKGNhdGVnb3J5KTtcblx0XHRjb25zdCBzdGF0ZUxhYmVsID0gZWZmZWN0aXZlID09PSAnYWxsb3cnXG5cdFx0XHQ/IGxvY2FsaXplKCdicm93c2VyLnBlcm1pc3Npb25zLnN0YXRlLmFsbG93ZWQnLCBcIkFsbG93ZWRcIilcblx0XHRcdDogZWZmZWN0aXZlID09PSAnZGVueSdcblx0XHRcdFx0PyBsb2NhbGl6ZSgnYnJvd3Nlci5wZXJtaXNzaW9ucy5zdGF0ZS5ibG9ja2VkJywgXCJCbG9ja2VkXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2Jyb3dzZXIucGVybWlzc2lvbnMuc3RhdGUuYXNrJywgXCJBc2tcIik7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBoYXNPdmVycmlkZVxuXHRcdFx0PyBzdGF0ZUxhYmVsXG5cdFx0XHQ6IGxvY2FsaXplKCdicm93c2VyLnBlcm1pc3Npb25zLnN0YXRlLmRlZmF1bHQnLCBcInswfSAoZGVmYXVsdClcIiwgc3RhdGVMYWJlbCk7XG5cblx0XHRjb25zdCBidXR0b25zOiBQZXJtaXNzaW9uSXRlbUJ1dHRvbltdID0gW107XG5cdFx0aWYgKGVmZmVjdGl2ZSAhPT0gJ2FsbG93Jykge1xuXHRcdFx0YnV0dG9ucy5wdXNoKHtcblx0XHRcdFx0a2luZDogJ2FsbG93Jyxcblx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jaGVjayksXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdicm93c2VyLnBlcm1pc3Npb25zLmFsbG93JywgXCJBbGxvd1wiKSxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRpZiAoZWZmZWN0aXZlICE9PSAnZGVueScpIHtcblx0XHRcdGJ1dHRvbnMucHVzaCh7XG5cdFx0XHRcdGtpbmQ6ICdkZW55Jyxcblx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jaXJjbGVTbGFzaCksXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdicm93c2VyLnBlcm1pc3Npb25zLmJsb2NrJywgXCJCbG9ja1wiKSxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRpZiAoZWZmZWN0aXZlICE9PSAnYXNrJykge1xuXHRcdFx0YnV0dG9ucy5wdXNoKHtcblx0XHRcdFx0a2luZDogaGFzT3ZlcnJpZGUgPyAncmVzZXQnIDogZWZmZWN0aXZlID09PSAnYWxsb3cnID8gJ2FsbG93JyA6ICdkZW55Jyxcblx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoZWZmZWN0aXZlID09PSAnYWxsb3cnID8gQ29kaWNvbi5jaGVjayA6IENvZGljb24uY2lyY2xlU2xhc2gpLFxuXHRcdFx0XHRhbHdheXNWaXNpYmxlOiB0cnVlLFxuXHRcdFx0XHR0b2dnbGU6IHsgY2hlY2tlZDogaGFzT3ZlcnJpZGUgfSxcblx0XHRcdFx0dG9vbHRpcDogZGVzY3JpcHRpb25cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGxhYmVsOiBkZXNjcmlwdG9yLmxhYmVsLFxuXHRcdFx0ZGV0YWlsOiBkZXNjcmlwdG9yLmRlc2NyaXB0aW9uLFxuXHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoZGVzY3JpcHRvci5pY29uKSxcblx0XHRcdGJ1dHRvbnMsXG5cdFx0fTtcblx0fVxufVxuXG5mdW5jdGlvbiBkaXNwbGF5T3JpZ2luKG9yaWdpbjogc3RyaW5nKTogc3RyaW5nIHtcblx0dHJ5IHtcblx0XHRyZXR1cm4gbmV3IFVSTChvcmlnaW4pLmhvc3QgfHwgb3JpZ2luO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gb3JpZ2luO1xuXHR9XG59XG5cbi8vIC0tIEFjdGlvbnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5jbGFzcyBNYW5hZ2VCcm93c2VyUGVybWlzc2lvbnNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gQnJvd3NlclZpZXdDb21tYW5kSWQuTWFuYWdlUGVybWlzc2lvbnM7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3Qgd2hlbiA9IENvbnRleHRLZXlFeHByLmFuZChCUk9XU0VSX0VESVRPUl9BQ1RJVkUsIENPTlRFWFRfQlJPV1NFUl9IQVNfVVJMKTtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWFuYWdlQnJvd3NlclBlcm1pc3Npb25zQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYnJvd3Nlci5tYW5hZ2VQZXJtaXNzaW9ucycsICdTaXRlIFBlcm1pc3Npb25zJyksXG5cdFx0XHRjYXRlZ29yeTogQnJvd3NlckFjdGlvbkNhdGVnb3J5LFxuXHRcdFx0aWNvbjogQ29kaWNvbi5zaGllbGQsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogd2hlbixcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Ccm93c2VyQWN0aW9uc1Rvb2xiYXIsXG5cdFx0XHRcdGdyb3VwOiBCcm93c2VyQWN0aW9uR3JvdXAuRGF0YSxcblx0XHRcdFx0b3JkZXI6IDEwLFxuXHRcdFx0XHR3aGVuLFxuXHRcdFx0XHRpc0hpZGRlbkJ5RGVmYXVsdDogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGJyb3dzZXJFZGl0b3IgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoYnJvd3NlckVkaXRvciBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3IpIHtcblx0XHRcdGJyb3dzZXJFZGl0b3IuZ2V0Q29udHJpYnV0aW9uKEJyb3dzZXJQZXJtaXNzaW9uc0ZlYXR1cmUpPy5zaG93TWFuYWdlbWVudFBpY2tlcigpO1xuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoTWFuYWdlQnJvd3NlclBlcm1pc3Npb25zQWN0aW9uKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsU0FBUyxRQUFRLHVCQUF1QjtBQUNqRCxTQUFTLHNCQUFzQjtBQUUvQixTQUE0QiwwQkFBMEM7QUFDdEUsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQW9DLDRCQUE0QjtBQUNoRTtBQUFBLEVBQ0M7QUFBQSxFQUdBO0FBQUEsRUFJQTtBQUFBLE9BQ007QUFDUCxTQUFTLHNCQUFzQjtBQUUvQjtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFVQSxJQUFNLDRCQUFOLGNBQXdDLDBCQUEwQjtBQUFBLEVBVXhFLFlBQ0MsUUFDcUMsb0JBQ0Usc0JBQ04sZ0JBQ2hDO0FBQ0QsVUFBTSxNQUFNO0FBSnlCO0FBQ0U7QUFDTjtB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
