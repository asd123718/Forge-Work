import { CancellationToken } from "../../../base/common/cancellation.js";
import { Emitter } from "../../../base/common/event.js";
import { dispose } from "../../../base/common/lifecycle.js";
import { MainContext } from "./extHost.protocol.js";
import { QuickInputButtons, QuickPickItemKind, InputBoxValidationSeverity } from "./extHostTypes.js";
import { isCancellationError } from "../../../base/common/errors.js";
import { coalesce } from "../../../base/common/arrays.js";
import Severity from "../../../base/common/severity.js";
import { checkProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { IconPath, MarkdownString } from "./extHostTypeConverters.js";
function createExtHostQuickOpen(mainContext, workspace, commands) {
  const proxy = mainContext.getProxy(MainContext.MainThreadQuickOpen);
  class ExtHostQuickOpenImpl {
    constructor(workspace2, commands2) {
      this._sessions = /* @__PURE__ */ new Map();
      this._instances = 0;
      this._workspace = workspace2;
      this._commands = commands2;
    }
    showQuickPick(extension, itemsOrItemsPromise, options, token = CancellationToken.None) {
      this._onDidSelectItem = void 0;
      const itemsPromise = Promise.resolve(itemsOrItemsPromise);
      const instance = ++this._instances;
      const quickPickWidget = proxy.$show(instance, {
        title: options?.title,
        placeHolder: options?.placeHolder,
        prompt: options?.prompt,
        matchOnDescription: options?.matchOnDescription,
        matchOnDetail: options?.matchOnDetail,
        ignoreFocusLost: options?.ignoreFocusOut,
        canPickMany: options?.canPickMany
      }, token);
      const widgetClosedMarker = {};
      const widgetClosedPromise = quickPickWidget.then(() => widgetClosedMarker);
      return Promise.race([widgetClosedPromise, itemsPromise]).then((result) => {
        if (result === widgetClosedMarker) {
          return void 0;
        }
        return itemsPromise.then((items) => {
          const pickItems = [];
          for (let handle = 0; handle < items.length; handle++) {
            const item = items[handle];
            if (typeof item === "string") {
              pickItems.push({ label: item, handle });
            } else if (item.kind === QuickPickItemKind.Separator) {
              pickItems.push({ type: "separator", label: item.label });
            } else {
              if (item.tooltip) {
                checkProposedApiEnabled(extension, "quickPickItemTooltip");
              }
              pickItems.push({
                label: item.label,
                iconPathDto: IconPath.from(item.iconPath),
                description: item.description,
                detail: item.detail,
                picked: item.picked,
                alwaysShow: item.alwaysShow,
                tooltip: MarkdownString.fromStrict(item.tooltip),
                resourceUri: item.resourceUri,
                handle
              });
            }
          }
          if (options && typeof options.onDidSelectItem === "function") {
            this._onDidSelectItem = (handle) => {
              options.onDidSelectItem(items[handle]);
            };
          }
          proxy.$setItems(instance, pickItems);
          return quickPickWidget.then((handle) => {
            if (typeof handle === "number") {
              return items[handle];
            } else if (Array.isArray(handle)) {
              return handle.map((h) => items[h]);
            }
            return void 0;
          });
        });
      }).then(void 0, (err) => {
        if (isCancellationError(err)) {
          return void 0;
        }
        proxy.$setError(instance, err);
        return Promise.reject(err);
      });
    }
    $onItemSelected(handle) {
      this._onDidSelectItem?.(handle);
    }
    // ---- input
    showInput(options, token = CancellationToken.None) {
      this._validateInput = options?.validateInput;
      return proxy.$input(options, typeof this._validateInput === "function", token).then(void 0, (err) => {
        if (isCancellationError(err)) {
          return void 0;
        }
        return Promise.reject(err);
      });
    }
    async $validateInput(input) {
      if (!this._validateInput) {
        return;
      }
      const result = await this._validateInput(input);
      if (!result || typeof result === "string") {
        return result;
      }
      let severity;
      switch (result.severity) {
        case InputBoxValidationSeverity.Info:
          severity = Severity.Info;
          break;
        case InputBoxValidationSeverity.Warning:
          severity = Severity.Warning;
          break;
        case InputBoxValidationSeverity.Error:
          severity = Severity.Error;
          break;
        default:
          severity = result.message ? Severity.Error : Severity.Ignore;
          break;
      }
      return {
        content: result.message,
        severity
      };
    }
    // ---- workspace folder picker
    async showWorkspaceFolderPick(options, token = CancellationToken.None) {
      const selectedFolder = await this._commands.executeCommand("_workbench.pickWorkspaceFolder", [options]);
      if (!selectedFolder) {
        return void 0;
      }
      const workspaceFolders = await this._workspace.getWorkspaceFolders2();
      if (!workspaceFolders) {
        return void 0;
      }
      return workspaceFolders.find((folder) => folder.uri.toString() === selectedFolder.uri.toString());
    }
    // ---- QuickInput
    createQuickPick(extension) {
      const session = new ExtHostQuickPick(extension, () => this._sessions.delete(session._id));
      this._sessions.set(session._id, session);
      return session;
    }
    createInputBox(extension) {
      const session = new ExtHostInputBox(extension, () => this._sessions.delete(session._id));
      this._sessions.set(session._id, session);
      return session;
    }
    $onDidChangeValue(sessionId, value) {
      const session = this._sessions.get(sessionId);
      session?._fireDidChangeValue(value);
    }
    $onDidAccept(sessionId) {
      const session = this._sessions.get(sessionId);
      session?._fireDidAccept();
    }
    $onDidChangeActive(sessionId, handles) {
      const session = this._sessions.get(sessionId);
      if (session instanceof ExtHostQuickPick) {
        session._fireDidChangeActive(handles);
      }
    }
    $onDidChangeSelection(sessionId, handles) {
      const session = this._sessions.get(sessionId);
      if (session instanceof ExtHostQuickPick) {
        session._fireDidChangeSelection(handles);
      }
    }
    $onDidTriggerButton(sessionId, handle, checked) {
      const session = this._sessions.get(sessionId);
      session?._fireDidTriggerButton(handle, checked);
    }
    $onDidTriggerItemButton(sessionId, itemHandle, buttonHandle, checked) {
      const session = this._sessions.get(sessionId);
      if (session instanceof ExtHostQuickPick) {
        session._fireDidTriggerItemButton(itemHandle, buttonHandle, checked);
      }
    }
    $onDidHide(sessionId) {
      const session = this._sessions.get(sessionId);
      session?._fireDidHide();
    }
  }
  class ExtHostQuickInput {
    constructor(_extension, _onDidDispose) {
      this._extension = _extension;
      this._onDidDispose = _onDidDispose;
      this._id = ExtHostQuickPick._nextId++;
      this._visible = false;
      this._expectingHide = false;
      this._enabled = true;
      this._busy = false;
      this._ignoreFocusOut = true;
      this._value = "";
      this._valueSelection = void 0;
      this._buttons = [];
      this._handlesToButtons = /* @__PURE__ */ new Map();
      this._onDidAcceptEmitter = new Emitter();
      this._onDidChangeValueEmitter = new Emitter();
      this._onDidTriggerButtonEmitter = new Emitter();
      this._onDidHideEmitter = new Emitter();
      this._pendingUpdate = { id: this._id };
      this._disposed = false;
      this._disposables = [
        this._onDidTriggerButtonEmitter,
        this._onDidHideEmitter,
        this._onDidAcceptEmitter,
        this._onDidChangeValueEmitter
      ];
      this.onDidChangeValue = this._onDidChangeValueEmitter.event;
      this.onDidAccept = this._onDidAcceptEmitter.event;
      this.onDidTriggerButton = this._onDidTriggerButtonEmitter.event;
      this.onDidHide = this._onDidHideEmitter.event;
    }
    get title() {
      return this._title;
    }
    set title(title) {
      this._title = title;
      this.update({ title });
    }
    get step() {
      return this._steps;
    }
    set step(step) {
      this._steps = step;
      this.update({ step });
    }
    get totalSteps() {
      return this._totalSteps;
    }
    set totalSteps(totalSteps) {
      this._totalSteps = totalSteps;
      this.update({ totalSteps });
    }
    get enabled() {
      return this._enabled;
    }
    set enabled(enabled) {
      this._enabled = enabled;
      this.update({ enabled });
    }
    get busy() {
      return this._busy;
    }
    set busy(busy) {
      this._busy = busy;
      this.update({ busy });
    }
    get ignoreFocusOut() {
      return this._ignoreFocusOut;
    }
    set ignoreFocusOut(ignoreFocusOut) {
      this._ignoreFocusOut = ignoreFocusOut;
      this.update({ ignoreFocusOut });
    }
    get value() {
      return this._value;
    }
    set value(value) {
      this._value = value;
      this.update({ value });
    }
    get valueSelection() {
      return this._valueSelection;
    }
    set valueSelection(valueSelection) {
      this._valueSelection = valueSelection;
      this.update({ valueSelection });
    }
    get placeholder() {
      return this._placeholder;
    }
    set placeholder(placeholder) {
      this._placeholder = placeholder;
      this.update({ placeholder });
    }
    get buttons() {
      return this._buttons;
    }
    set buttons(buttons) {
      this._buttons = buttons.slice();
      this._handlesToButtons.clear();
      buttons.forEach((button, i) => {
        const handle = button === QuickInputButtons.Back ? -1 : i;
        this._handlesToButtons.set(handle, button);
      });
      this.update({
        buttons: buttons.map((button, i) => {
          return {
            iconPathDto: IconPath.from(button.iconPath),
            tooltip: button.tooltip,
            handle: button === QuickInputButtons.Back ? -1 : i,
            location: typeof button.location === "number" ? button.location : void 0,
            toggle: typeof button.toggle === "object" && typeof button.toggle.checked === "boolean" ? { checked: button.toggle.checked } : void 0
          };
        })
      });
    }
    show() {
      this._visible = true;
      this._expectingHide = true;
      this.update({ visible: true });
    }
    hide() {
      this._visible = false;
      this.update({ visible: false });
    }
    _fireDidAccept() {
      this._onDidAcceptEmitter.fire();
    }
    _fireDidChangeValue(value) {
      this._value = value;
      this._onDidChangeValueEmitter.fire(value);
    }
    _fireDidTriggerButton(handle, checked) {
      const button = this._handlesToButtons.get(handle);
      if (button) {
        if (checked !== void 0 && button.toggle) {
          button.toggle.checked = checked;
        }
        this._onDidTriggerButtonEmitter.fire(button);
      }
    }
    _fireDidHide() {
      if (this._expectingHide) {
        this._expectingHide = this._visible;
        this._onDidHideEmitter.fire();
      }
    }
    dispose() {
      if (this._disposed) {
        return;
      }
      this._disposed = true;
      this._fireDidHide();
      this._disposables = dispose(this._disposables);
      if (this._updateTimeout) {
        clearTimeout(this._updateTimeout);
        this._updateTimeout = void 0;
      }
      this._onDidDispose();
      proxy.$dispose(this._id);
    }
    update(properties) {
      if (this._disposed) {
        return;
      }
      for (const key of Object.keys(properties)) {
        const value = properties[key];
        this._pendingUpdate[key] = value === void 0 ? null : value;
      }
      if ("visible" in this._pendingUpdate) {
        if (this._updateTimeout) {
          clearTimeout(this._updateTimeout);
          this._updateTimeout = void 0;
        }
        this.dispatchUpdate();
      } else if (this._visible && !this._updateTimeout) {
        this._updateTimeout = setTimeout(() => {
          this._updateTimeout = void 0;
          this.dispatchUpdate();
        }, 0);
      }
    }
    dispatchUpdate() {
      proxy.$createOrUpdate(this._pendingUpdate);
      this._pendingUpdate = { id: this._id };
    }
  }
  ExtHostQuickInput._nextId = 1;
  class ExtHostQuickPick extends ExtHostQuickInput {
    constructor(extension, onDispose) {
      super(extension, onDispose);
      this._items = [];
      this._handlesToItems = /* @__PURE__ */ new Map();
      this._itemsToHandles = /* @__PURE__ */ new Map();
      this._canSelectMany = false;
      this._matchOnDescription = true;
      this._matchOnDetail = true;
      this._sortByLabel = true;
      this._keepScrollPosition = false;
      this._activeItems = [];
      this._onDidChangeActiveEmitter = new Emitter();
      this._selectedItems = [];
      this._onDidChangeSelectionEmitter = new Emitter();
      this._onDidTriggerItemButtonEmitter = new Emitter();
      this.onDidChangeActive = this._onDidChangeActiveEmitter.event;
      this.onDidChangeSelection = this._onDidChangeSelectionEmitter.event;
      this.onDidTriggerItemButton = this._onDidTriggerItemButtonEmitter.event;
      this._disposables.push(
        this._onDidChangeActiveEmitter,
        this._onDidChangeSelectionEmitter,
        this._onDidTriggerItemButtonEmitter
      );
      this.update({ type: "quickPick" });
    }
    get items() {
      return this._items;
    }
    set items(items) {
      this._items = items.slice();
      this._handlesToItems.clear();
      this._itemsToHandles.clear();
      items.forEach((item, i) => {
        this._handlesToItems.set(i, item);
        this._itemsToHandles.set(item, i);
      });
      const pickItems = [];
      for (let handle = 0; handle < items.length; handle++) {
        const item = items[handle];
        if (item.kind === QuickPickItemKind.Separator) {
          pickItems.push({ type: "separator", label: item.label });
        } else {
          if (item.tooltip) {
            checkProposedApiEnabled(this._extension, "quickPickItemTooltip");
          }
          pickItems.push({
            handle,
            label: item.label,
            iconPathDto: IconPath.from(item.iconPath),
            description: item.description,
            detail: item.detail,
            picked: item.picked,
            alwaysShow: item.alwaysShow,
            tooltip: MarkdownString.fromStrict(item.tooltip),
            resourceUri: item.resourceUri,
            buttons: item.buttons?.map((button, i) => {
              return {
                iconPathDto: IconPath.from(button.iconPath),
                tooltip: button.tooltip,
                handle: i,
                toggle: typeof button.toggle === "object" && typeof button.toggle.checked === "boolean" ? { checked: button.toggle.checked } : void 0
              };
            })
          });
        }
      }
      this.update({
        items: pickItems
      });
    }
    get canSelectMany() {
      return this._canSelectMany;
    }
    set canSelectMany(canSelectMany) {
      this._canSelectMany = canSelectMany;
      this.update({ canSelectMany });
    }
    get matchOnDescription() {
      return this._matchOnDescription;
    }
    set matchOnDescription(matchOnDescription) {
      this._matchOnDescription = matchOnDescription;
      this.update({ matchOnDescription });
    }
    get matchOnDetail() {
      return this._matchOnDetail;
    }
    set matchOnDetail(matchOnDetail) {
      this._matchOnDetail = matchOnDetail;
      this.update({ matchOnDetail });
    }
    get sortByLabel() {
      return this._sortByLabel;
    }
    set sortByLabel(sortByLabel) {
      this._sortByLabel = sortByLabel;
      this.update({ sortByLabel });
    }
    get keepScrollPosition() {
      return this._keepScrollPosition;
    }
    set keepScrollPosition(keepScrollPosition) {
      this._keepScrollPosition = keepScrollPosition;
      this.update({ keepScrollPosition });
    }
    get prompt() {
      return this._prompt;
    }
    set prompt(prompt) {
      this._prompt = prompt;
      this.update({ prompt });
    }
    get activeItems() {
      return this._activeItems;
    }
    set activeItems(activeItems) {
      this._activeItems = activeItems.filter((item) => this._itemsToHandles.has(item));
      this.update({ activeItems: this._activeItems.map((item) => this._itemsToHandles.get(item)) });
    }
    get selectedItems() {
      return this._selectedItems;
    }
    set selectedItems(selectedItems) {
      this._selectedItems = selectedItems.filter((item) => this._itemsToHandles.has(item));
      this.update({ selectedItems: this._selectedItems.map((item) => this._itemsToHandles.get(item)) });
    }
    _fireDidChangeActive(handles) {
      const items = coalesce(handles.map((handle) => this._handlesToItems.get(handle)));
      this._activeItems = items;
      this._onDidChangeActiveEmitter.fire(items);
    }
    _fireDidChangeSelection(handles) {
      const items = coalesce(handles.map((handle) => this._handlesToItems.get(handle)));
      this._selectedItems = items;
      this._onDidChangeSelectionEmitter.fire(items);
    }
    _fireDidTriggerItemButton(itemHandle, buttonHandle, checked) {
      const item = this._handlesToItems.get(itemHandle);
      if (!item || !item.buttons || !item.buttons.length) {
        return;
      }
      const button = item.buttons[buttonHandle];
      if (button) {
        if (checked !== void 0 && button.toggle) {
          button.toggle.checked = checked;
        }
        this._onDidTriggerItemButtonEmitter.fire({
          button,
          item
        });
      }
    }
  }
  class ExtHostInputBox extends ExtHostQuickInput {
    constructor(extension, onDispose) {
      super(extension, onDispose);
      this._password = false;
      this.update({ type: "inputBox" });
    }
    get password() {
      return this._password;
    }
    set password(password) {
      this._password = password;
      this.update({ password });
    }
    get prompt() {
      return this._prompt;
    }
    set prompt(prompt) {
      this._prompt = prompt;
      this.update({ prompt });
    }
    get validationMessage() {
      return this._validationMessage;
    }
    set validationMessage(validationMessage) {
      this._validationMessage = validationMessage;
      if (!validationMessage) {
        this.update({ validationMessage: void 0, severity: Severity.Ignore });
      } else if (typeof validationMessage === "string") {
        this.update({ validationMessage, severity: Severity.Error });
      } else {
        this.update({ validationMessage: validationMessage.message, severity: validationMessage.severity ?? Severity.Error });
      }
    }
  }
  return new ExtHostQuickOpenImpl(workspace, commands);
}
export {
  createExtHostQuickOpen
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0UXVpY2tPcGVuLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGRpc3Bvc2UsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb21tYW5kcyB9IGZyb20gJy4vZXh0SG9zdENvbW1hbmRzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0V29ya3NwYWNlUHJvdmlkZXIgfSBmcm9tICcuL2V4dEhvc3RXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSW5wdXRCb3gsIElucHV0Qm94T3B0aW9ucywgSW5wdXRCb3hWYWxpZGF0aW9uTWVzc2FnZSwgUXVpY2tJbnB1dCwgUXVpY2tJbnB1dEJ1dHRvbiwgUXVpY2tQaWNrLCBRdWlja1BpY2tJdGVtLCBRdWlja1BpY2tJdGVtQnV0dG9uRXZlbnQsIFF1aWNrUGlja09wdGlvbnMsIFdvcmtzcGFjZUZvbGRlciwgV29ya3NwYWNlRm9sZGVyUGlja09wdGlvbnMgfSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgRXh0SG9zdFF1aWNrT3BlblNoYXBlLCBJTWFpbkNvbnRleHQsIE1haW5Db250ZXh0LCBUcmFuc2ZlclF1aWNrSW5wdXQsIFRyYW5zZmVyUXVpY2tJbnB1dEJ1dHRvbiwgVHJhbnNmZXJRdWlja1BpY2tJdGVtT3JTZXBhcmF0b3IgfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgUXVpY2tJbnB1dEJ1dHRvbnMsIFF1aWNrUGlja0l0ZW1LaW5kLCBJbnB1dEJveFZhbGlkYXRpb25TZXZlcml0eSB9IGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgY2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEljb25QYXRoLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcblxuZXhwb3J0IHR5cGUgSXRlbSA9IHN0cmluZyB8IFF1aWNrUGlja0l0ZW07XG5cbmV4cG9ydCBpbnRlcmZhY2UgRXh0SG9zdFF1aWNrT3BlbiB7XG5cdHNob3dRdWlja1BpY2soZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGl0ZW1zT3JJdGVtc1Byb21pc2U6IFF1aWNrUGlja0l0ZW1bXSB8IFByb21pc2U8UXVpY2tQaWNrSXRlbVtdPiwgb3B0aW9uczogUXVpY2tQaWNrT3B0aW9ucyAmIHsgY2FuUGlja01hbnk6IHRydWUgfSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8UXVpY2tQaWNrSXRlbVtdIHwgdW5kZWZpbmVkPjtcblx0c2hvd1F1aWNrUGljayhleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgaXRlbXNPckl0ZW1zUHJvbWlzZTogc3RyaW5nW10gfCBQcm9taXNlPHN0cmluZ1tdPiwgb3B0aW9ucz86IFF1aWNrUGlja09wdGlvbnMsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHNob3dRdWlja1BpY2soZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGl0ZW1zT3JJdGVtc1Byb21pc2U6IFF1aWNrUGlja0l0ZW1bXSB8IFByb21pc2U8UXVpY2tQaWNrSXRlbVtdPiwgb3B0aW9ucz86IFF1aWNrUGlja09wdGlvbnMsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFF1aWNrUGlja0l0ZW0gfCB1bmRlZmluZWQ+O1xuXHRzaG93UXVpY2tQaWNrKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBpdGVtc09ySXRlbXNQcm9taXNlOiBJdGVtW10gfCBQcm9taXNlPEl0ZW1bXT4sIG9wdGlvbnM/OiBRdWlja1BpY2tPcHRpb25zLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJdGVtIHwgSXRlbVtdIHwgdW5kZWZpbmVkPjtcblxuXHRzaG93SW5wdXQob3B0aW9ucz86IElucHV0Qm94T3B0aW9ucywgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblxuXHRzaG93V29ya3NwYWNlRm9sZGVyUGljayhvcHRpb25zPzogV29ya3NwYWNlRm9sZGVyUGlja09wdGlvbnMsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZD47XG5cblx0Y3JlYXRlUXVpY2tQaWNrPFQgZXh0ZW5kcyBRdWlja1BpY2tJdGVtPihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IFF1aWNrUGljazxUPjtcblxuXHRjcmVhdGVJbnB1dEJveChleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IElucHV0Qm94O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRXh0SG9zdFF1aWNrT3BlbihtYWluQ29udGV4dDogSU1haW5Db250ZXh0LCB3b3Jrc3BhY2U6IElFeHRIb3N0V29ya3NwYWNlUHJvdmlkZXIsIGNvbW1hbmRzOiBFeHRIb3N0Q29tbWFuZHMpOiBFeHRIb3N0UXVpY2tPcGVuU2hhcGUgJiBFeHRIb3N0UXVpY2tPcGVuIHtcblx0Y29uc3QgcHJveHkgPSBtYWluQ29udGV4dC5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkUXVpY2tPcGVuKTtcblxuXHRjbGFzcyBFeHRIb3N0UXVpY2tPcGVuSW1wbCBpbXBsZW1lbnRzIEV4dEhvc3RRdWlja09wZW5TaGFwZSB7XG5cblx0XHRwcml2YXRlIF93b3Jrc3BhY2U6IElFeHRIb3N0V29ya3NwYWNlUHJvdmlkZXI7XG5cdFx0cHJpdmF0ZSBfY29tbWFuZHM6IEV4dEhvc3RDb21tYW5kcztcblxuXHRcdHByaXZhdGUgX29uRGlkU2VsZWN0SXRlbT86IChoYW5kbGU6IG51bWJlcikgPT4gdm9pZDtcblx0XHRwcml2YXRlIF92YWxpZGF0ZUlucHV0PzogKGlucHV0OiBzdHJpbmcpID0+IHN0cmluZyB8IElucHV0Qm94VmFsaWRhdGlvbk1lc3NhZ2UgfCB1bmRlZmluZWQgfCBudWxsIHwgVGhlbmFibGU8c3RyaW5nIHwgSW5wdXRCb3hWYWxpZGF0aW9uTWVzc2FnZSB8IHVuZGVmaW5lZCB8IG51bGw+O1xuXG5cdFx0cHJpdmF0ZSBfc2Vzc2lvbnMgPSBuZXcgTWFwPG51bWJlciwgRXh0SG9zdFF1aWNrSW5wdXQ+KCk7XG5cblx0XHRwcml2YXRlIF9pbnN0YW5jZXMgPSAwO1xuXG5cdFx0Y29uc3RydWN0b3Iod29ya3NwYWNlOiBJRXh0SG9zdFdvcmtzcGFjZVByb3ZpZGVyLCBjb21tYW5kczogRXh0SG9zdENvbW1hbmRzKSB7XG5cdFx0XHR0aGlzLl93b3Jrc3BhY2UgPSB3b3Jrc3BhY2U7XG5cdFx0XHR0aGlzLl9jb21tYW5kcyA9IGNvbW1hbmRzO1xuXHRcdH1cblxuXHRcdHNob3dRdWlja1BpY2soZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGl0ZW1zT3JJdGVtc1Byb21pc2U6IFF1aWNrUGlja0l0ZW1bXSB8IFByb21pc2U8UXVpY2tQaWNrSXRlbVtdPiwgb3B0aW9uczogUXVpY2tQaWNrT3B0aW9ucyAmIHsgY2FuUGlja01hbnk6IHRydWUgfSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8UXVpY2tQaWNrSXRlbVtdIHwgdW5kZWZpbmVkPjtcblx0XHRzaG93UXVpY2tQaWNrKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBpdGVtc09ySXRlbXNQcm9taXNlOiBzdHJpbmdbXSB8IFByb21pc2U8c3RyaW5nW10+LCBvcHRpb25zPzogUXVpY2tQaWNrT3B0aW9ucywgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0XHRzaG93UXVpY2tQaWNrKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBpdGVtc09ySXRlbXNQcm9taXNlOiBRdWlja1BpY2tJdGVtW10gfCBQcm9taXNlPFF1aWNrUGlja0l0ZW1bXT4sIG9wdGlvbnM/OiBRdWlja1BpY2tPcHRpb25zLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxRdWlja1BpY2tJdGVtIHwgdW5kZWZpbmVkPjtcblx0XHRzaG93UXVpY2tQaWNrKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBpdGVtc09ySXRlbXNQcm9taXNlOiBJdGVtW10gfCBQcm9taXNlPEl0ZW1bXT4sIG9wdGlvbnM/OiBRdWlja1BpY2tPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTogUHJvbWlzZTxJdGVtIHwgSXRlbVtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0XHQvLyBjbGVhciBzdGF0ZSBmcm9tIGxhc3QgaW52b2NhdGlvblxuXHRcdFx0dGhpcy5fb25EaWRTZWxlY3RJdGVtID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCBpdGVtc1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoaXRlbXNPckl0ZW1zUHJvbWlzZSk7XG5cblx0XHRcdGNvbnN0IGluc3RhbmNlID0gKyt0aGlzLl9pbnN0YW5jZXM7XG5cblx0XHRcdGNvbnN0IHF1aWNrUGlja1dpZGdldCA9IHByb3h5LiRzaG93KGluc3RhbmNlLCB7XG5cdFx0XHRcdHRpdGxlOiBvcHRpb25zPy50aXRsZSxcblx0XHRcdFx0cGxhY2VIb2xkZXI6IG9wdGlvbnM/LnBsYWNlSG9sZGVyLFxuXHRcdFx0XHRwcm9tcHQ6IG9wdGlvbnM/LnByb21wdCxcblx0XHRcdFx0bWF0Y2hPbkRlc2NyaXB0aW9uOiBvcHRpb25zPy5tYXRjaE9uRGVzY3JpcHRpb24sXG5cdFx0XHRcdG1hdGNoT25EZXRhaWw6IG9wdGlvbnM/Lm1hdGNoT25EZXRhaWwsXG5cdFx0XHRcdGlnbm9yZUZvY3VzTG9zdDogb3B0aW9ucz8uaWdub3JlRm9jdXNPdXQsXG5cdFx0XHRcdGNhblBpY2tNYW55OiBvcHRpb25zPy5jYW5QaWNrTWFueSxcblx0XHRcdH0sIHRva2VuKTtcblxuXHRcdFx0Y29uc3Qgd2lkZ2V0Q2xvc2VkTWFya2VyID0ge307XG5cdFx0XHRjb25zdCB3aWRnZXRDbG9zZWRQcm9taXNlID0gcXVpY2tQaWNrV2lkZ2V0LnRoZW4oKCkgPT4gd2lkZ2V0Q2xvc2VkTWFya2VyKTtcblxuXHRcdFx0cmV0dXJuIFByb21pc2UucmFjZShbd2lkZ2V0Q2xvc2VkUHJvbWlzZSwgaXRlbXNQcm9taXNlXSkudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0XHRpZiAocmVzdWx0ID09PSB3aWRnZXRDbG9zZWRNYXJrZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGl0ZW1zUHJvbWlzZS50aGVuKGl0ZW1zID0+IHtcblxuXHRcdFx0XHRcdGNvbnN0IHBpY2tJdGVtczogVHJhbnNmZXJRdWlja1BpY2tJdGVtT3JTZXBhcmF0b3JbXSA9IFtdO1xuXHRcdFx0XHRcdGZvciAobGV0IGhhbmRsZSA9IDA7IGhhbmRsZSA8IGl0ZW1zLmxlbmd0aDsgaGFuZGxlKyspIHtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSBpdGVtc1toYW5kbGVdO1xuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiBpdGVtID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0XHRwaWNrSXRlbXMucHVzaCh7IGxhYmVsOiBpdGVtLCBoYW5kbGUgfSk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGl0ZW0ua2luZCA9PT0gUXVpY2tQaWNrSXRlbUtpbmQuU2VwYXJhdG9yKSB7XG5cdFx0XHRcdFx0XHRcdHBpY2tJdGVtcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBpdGVtLmxhYmVsIH0pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0aWYgKGl0ZW0udG9vbHRpcCkge1xuXHRcdFx0XHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3F1aWNrUGlja0l0ZW1Ub29sdGlwJyk7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRwaWNrSXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6IGl0ZW0ubGFiZWwsXG5cdFx0XHRcdFx0XHRcdFx0aWNvblBhdGhEdG86IEljb25QYXRoLmZyb20oaXRlbS5pY29uUGF0aCksXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGl0ZW0uZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHRcdFx0ZGV0YWlsOiBpdGVtLmRldGFpbCxcblx0XHRcdFx0XHRcdFx0XHRwaWNrZWQ6IGl0ZW0ucGlja2VkLFxuXHRcdFx0XHRcdFx0XHRcdGFsd2F5c1Nob3c6IGl0ZW0uYWx3YXlzU2hvdyxcblx0XHRcdFx0XHRcdFx0XHR0b29sdGlwOiBNYXJrZG93blN0cmluZy5mcm9tU3RyaWN0KGl0ZW0udG9vbHRpcCksXG5cdFx0XHRcdFx0XHRcdFx0cmVzb3VyY2VVcmk6IGl0ZW0ucmVzb3VyY2VVcmksXG5cdFx0XHRcdFx0XHRcdFx0aGFuZGxlXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIGhhbmRsZSBzZWxlY3Rpb24gY2hhbmdlc1xuXHRcdFx0XHRcdGlmIChvcHRpb25zICYmIHR5cGVvZiBvcHRpb25zLm9uRGlkU2VsZWN0SXRlbSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRTZWxlY3RJdGVtID0gKGhhbmRsZSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRvcHRpb25zLm9uRGlkU2VsZWN0SXRlbSEoaXRlbXNbaGFuZGxlXSk7XG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIHNob3cgaXRlbXNcblx0XHRcdFx0XHRwcm94eS4kc2V0SXRlbXMoaW5zdGFuY2UsIHBpY2tJdGVtcyk7XG5cblx0XHRcdFx0XHRyZXR1cm4gcXVpY2tQaWNrV2lkZ2V0LnRoZW4oaGFuZGxlID0+IHtcblx0XHRcdFx0XHRcdGlmICh0eXBlb2YgaGFuZGxlID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gaXRlbXNbaGFuZGxlXTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShoYW5kbGUpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBoYW5kbGUubWFwKGggPT4gaXRlbXNbaF0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KS50aGVuKHVuZGVmaW5lZCwgZXJyID0+IHtcblx0XHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwcm94eS4kc2V0RXJyb3IoaW5zdGFuY2UsIGVycik7XG5cblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGVycik7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQkb25JdGVtU2VsZWN0ZWQoaGFuZGxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHRcdHRoaXMuX29uRGlkU2VsZWN0SXRlbT8uKGhhbmRsZSk7XG5cdFx0fVxuXG5cdFx0Ly8gLS0tLSBpbnB1dFxuXG5cdFx0c2hvd0lucHV0KG9wdGlvbnM/OiBJbnB1dEJveE9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0XHQvLyBnbG9iYWwgdmFsaWRhdGUgZm4gdXNlZCBpbiBjYWxsYmFjayBiZWxvd1xuXHRcdFx0dGhpcy5fdmFsaWRhdGVJbnB1dCA9IG9wdGlvbnM/LnZhbGlkYXRlSW5wdXQ7XG5cblx0XHRcdHJldHVybiBwcm94eS4kaW5wdXQob3B0aW9ucywgdHlwZW9mIHRoaXMuX3ZhbGlkYXRlSW5wdXQgPT09ICdmdW5jdGlvbicsIHRva2VuKVxuXHRcdFx0XHQudGhlbih1bmRlZmluZWQsIGVyciA9PiB7XG5cdFx0XHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyKTtcblx0XHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgJHZhbGlkYXRlSW5wdXQoaW5wdXQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgeyBjb250ZW50OiBzdHJpbmc7IHNldmVyaXR5OiBTZXZlcml0eSB9IHwgbnVsbCB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0aWYgKCF0aGlzLl92YWxpZGF0ZUlucHV0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fdmFsaWRhdGVJbnB1dChpbnB1dCk7XG5cdFx0XHRpZiAoIXJlc3VsdCB8fCB0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgc2V2ZXJpdHk6IFNldmVyaXR5O1xuXHRcdFx0c3dpdGNoIChyZXN1bHQuc2V2ZXJpdHkpIHtcblx0XHRcdFx0Y2FzZSBJbnB1dEJveFZhbGlkYXRpb25TZXZlcml0eS5JbmZvOlxuXHRcdFx0XHRcdHNldmVyaXR5ID0gU2V2ZXJpdHkuSW5mbztcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBJbnB1dEJveFZhbGlkYXRpb25TZXZlcml0eS5XYXJuaW5nOlxuXHRcdFx0XHRcdHNldmVyaXR5ID0gU2V2ZXJpdHkuV2FybmluZztcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBJbnB1dEJveFZhbGlkYXRpb25TZXZlcml0eS5FcnJvcjpcblx0XHRcdFx0XHRzZXZlcml0eSA9IFNldmVyaXR5LkVycm9yO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHNldmVyaXR5ID0gcmVzdWx0Lm1lc3NhZ2UgPyBTZXZlcml0eS5FcnJvciA6IFNldmVyaXR5Lklnbm9yZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogcmVzdWx0Lm1lc3NhZ2UsXG5cdFx0XHRcdHNldmVyaXR5XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIC0tLS0gd29ya3NwYWNlIGZvbGRlciBwaWNrZXJcblxuXHRcdGFzeW5jIHNob3dXb3Jrc3BhY2VGb2xkZXJQaWNrKG9wdGlvbnM/OiBXb3Jrc3BhY2VGb2xkZXJQaWNrT3B0aW9ucywgdG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTogUHJvbWlzZTxXb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRcdGNvbnN0IHNlbGVjdGVkRm9sZGVyID0gYXdhaXQgdGhpcy5fY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8V29ya3NwYWNlRm9sZGVyPignX3dvcmtiZW5jaC5waWNrV29ya3NwYWNlRm9sZGVyJywgW29wdGlvbnNdKTtcblx0XHRcdGlmICghc2VsZWN0ZWRGb2xkZXIpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcnMgPSBhd2FpdCB0aGlzLl93b3Jrc3BhY2UuZ2V0V29ya3NwYWNlRm9sZGVyczIoKTtcblx0XHRcdGlmICghd29ya3NwYWNlRm9sZGVycykge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHdvcmtzcGFjZUZvbGRlcnMuZmluZChmb2xkZXIgPT4gZm9sZGVyLnVyaS50b1N0cmluZygpID09PSBzZWxlY3RlZEZvbGRlci51cmkudG9TdHJpbmcoKSk7XG5cdFx0fVxuXG5cdFx0Ly8gLS0tLSBRdWlja0lucHV0XG5cblx0XHRjcmVhdGVRdWlja1BpY2s8VCBleHRlbmRzIFF1aWNrUGlja0l0ZW0+KGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogUXVpY2tQaWNrPFQ+IHtcblx0XHRcdGNvbnN0IHNlc3Npb246IEV4dEhvc3RRdWlja1BpY2s8VD4gPSBuZXcgRXh0SG9zdFF1aWNrUGljayhleHRlbnNpb24sICgpID0+IHRoaXMuX3Nlc3Npb25zLmRlbGV0ZShzZXNzaW9uLl9pZCkpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbnMuc2V0KHNlc3Npb24uX2lkLCBzZXNzaW9uKTtcblx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdH1cblxuXHRcdGNyZWF0ZUlucHV0Qm94KGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogSW5wdXRCb3gge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbjogRXh0SG9zdElucHV0Qm94ID0gbmV3IEV4dEhvc3RJbnB1dEJveChleHRlbnNpb24sICgpID0+IHRoaXMuX3Nlc3Npb25zLmRlbGV0ZShzZXNzaW9uLl9pZCkpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbnMuc2V0KHNlc3Npb24uX2lkLCBzZXNzaW9uKTtcblx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdH1cblxuXHRcdCRvbkRpZENoYW5nZVZhbHVlKHNlc3Npb25JZDogbnVtYmVyLCB2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0XHRzZXNzaW9uPy5fZmlyZURpZENoYW5nZVZhbHVlKHZhbHVlKTtcblx0XHR9XG5cblx0XHQkb25EaWRBY2NlcHQoc2Vzc2lvbklkOiBudW1iZXIpOiB2b2lkIHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRcdHNlc3Npb24/Ll9maXJlRGlkQWNjZXB0KCk7XG5cdFx0fVxuXG5cdFx0JG9uRGlkQ2hhbmdlQWN0aXZlKHNlc3Npb25JZDogbnVtYmVyLCBoYW5kbGVzOiBudW1iZXJbXSk6IHZvaWQge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdFx0aWYgKHNlc3Npb24gaW5zdGFuY2VvZiBFeHRIb3N0UXVpY2tQaWNrKSB7XG5cdFx0XHRcdHNlc3Npb24uX2ZpcmVEaWRDaGFuZ2VBY3RpdmUoaGFuZGxlcyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0JG9uRGlkQ2hhbmdlU2VsZWN0aW9uKHNlc3Npb25JZDogbnVtYmVyLCBoYW5kbGVzOiBudW1iZXJbXSk6IHZvaWQge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdFx0aWYgKHNlc3Npb24gaW5zdGFuY2VvZiBFeHRIb3N0UXVpY2tQaWNrKSB7XG5cdFx0XHRcdHNlc3Npb24uX2ZpcmVEaWRDaGFuZ2VTZWxlY3Rpb24oaGFuZGxlcyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0JG9uRGlkVHJpZ2dlckJ1dHRvbihzZXNzaW9uSWQ6IG51bWJlciwgaGFuZGxlOiBudW1iZXIsIGNoZWNrZWQ/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0XHRzZXNzaW9uPy5fZmlyZURpZFRyaWdnZXJCdXR0b24oaGFuZGxlLCBjaGVja2VkKTtcblx0XHR9XG5cblx0XHQkb25EaWRUcmlnZ2VySXRlbUJ1dHRvbihzZXNzaW9uSWQ6IG51bWJlciwgaXRlbUhhbmRsZTogbnVtYmVyLCBidXR0b25IYW5kbGU6IG51bWJlciwgY2hlY2tlZD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRcdGlmIChzZXNzaW9uIGluc3RhbmNlb2YgRXh0SG9zdFF1aWNrUGljaykge1xuXHRcdFx0XHRzZXNzaW9uLl9maXJlRGlkVHJpZ2dlckl0ZW1CdXR0b24oaXRlbUhhbmRsZSwgYnV0dG9uSGFuZGxlLCBjaGVja2VkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQkb25EaWRIaWRlKHNlc3Npb25JZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0XHRzZXNzaW9uPy5fZmlyZURpZEhpZGUoKTtcblx0XHR9XG5cdH1cblxuXHRjbGFzcyBFeHRIb3N0UXVpY2tJbnB1dCBpbXBsZW1lbnRzIFF1aWNrSW5wdXQge1xuXG5cdFx0cHJpdmF0ZSBzdGF0aWMgX25leHRJZCA9IDE7XG5cdFx0X2lkID0gRXh0SG9zdFF1aWNrUGljay5fbmV4dElkKys7XG5cblx0XHRwcml2YXRlIF90aXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdHByaXZhdGUgX3N0ZXBzOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0cHJpdmF0ZSBfdG90YWxTdGVwczogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdHByaXZhdGUgX3Zpc2libGUgPSBmYWxzZTtcblx0XHRwcml2YXRlIF9leHBlY3RpbmdIaWRlID0gZmFsc2U7XG5cdFx0cHJpdmF0ZSBfZW5hYmxlZCA9IHRydWU7XG5cdFx0cHJpdmF0ZSBfYnVzeSA9IGZhbHNlO1xuXHRcdHByaXZhdGUgX2lnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblx0XHRwcml2YXRlIF92YWx1ZSA9ICcnO1xuXHRcdHByaXZhdGUgX3ZhbHVlU2VsZWN0aW9uOiByZWFkb25seSBbbnVtYmVyLCBudW1iZXJdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHByaXZhdGUgX3BsYWNlaG9sZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0cHJpdmF0ZSBfYnV0dG9uczogUXVpY2tJbnB1dEJ1dHRvbltdID0gW107XG5cdFx0cHJpdmF0ZSBfaGFuZGxlc1RvQnV0dG9ucyA9IG5ldyBNYXA8bnVtYmVyLCBRdWlja0lucHV0QnV0dG9uPigpO1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWNjZXB0RW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VWYWx1ZUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxzdHJpbmc+KCk7XG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRUcmlnZ2VyQnV0dG9uRW1pdHRlciA9IG5ldyBFbWl0dGVyPFF1aWNrSW5wdXRCdXR0b24+KCk7XG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRIaWRlRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0cHJpdmF0ZSBfdXBkYXRlVGltZW91dDogVGltZW91dCB8IHVuZGVmaW5lZDtcblx0XHRwcml2YXRlIF9wZW5kaW5nVXBkYXRlOiBUcmFuc2ZlclF1aWNrSW5wdXQgPSB7IGlkOiB0aGlzLl9pZCB9O1xuXG5cdFx0cHJpdmF0ZSBfZGlzcG9zZWQgPSBmYWxzZTtcblx0XHRwcm90ZWN0ZWQgX2Rpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdID0gW1xuXHRcdFx0dGhpcy5fb25EaWRUcmlnZ2VyQnV0dG9uRW1pdHRlcixcblx0XHRcdHRoaXMuX29uRGlkSGlkZUVtaXR0ZXIsXG5cdFx0XHR0aGlzLl9vbkRpZEFjY2VwdEVtaXR0ZXIsXG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZhbHVlRW1pdHRlclxuXHRcdF07XG5cblx0XHRjb25zdHJ1Y3Rvcihwcm90ZWN0ZWQgX2V4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBwcml2YXRlIF9vbkRpZERpc3Bvc2U6ICgpID0+IHZvaWQpIHtcblx0XHR9XG5cblx0XHRnZXQgdGl0bGUoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdGl0bGU7XG5cdFx0fVxuXG5cdFx0c2V0IHRpdGxlKHRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3RpdGxlID0gdGl0bGU7XG5cdFx0XHR0aGlzLnVwZGF0ZSh7IHRpdGxlIH0pO1xuXHRcdH1cblxuXHRcdGdldCBzdGVwKCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3N0ZXBzO1xuXHRcdH1cblxuXHRcdHNldCBzdGVwKHN0ZXA6IG51bWJlciB8IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fc3RlcHMgPSBzdGVwO1xuXHRcdFx0dGhpcy51cGRhdGUoeyBzdGVwIH0pO1xuXHRcdH1cblxuXHRcdGdldCB0b3RhbFN0ZXBzKCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RvdGFsU3RlcHM7XG5cdFx0fVxuXG5cdFx0c2V0IHRvdGFsU3RlcHModG90YWxTdGVwczogbnVtYmVyIHwgdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl90b3RhbFN0ZXBzID0gdG90YWxTdGVwcztcblx0XHRcdHRoaXMudXBkYXRlKHsgdG90YWxTdGVwcyB9KTtcblx0XHR9XG5cblx0XHRnZXQgZW5hYmxlZCgpIHtcblx0XHRcdHJldHVybiB0aGlzLl9lbmFibGVkO1xuXHRcdH1cblxuXHRcdHNldCBlbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pIHtcblx0XHRcdHRoaXMuX2VuYWJsZWQgPSBlbmFibGVkO1xuXHRcdFx0dGhpcy51cGRhdGUoeyBlbmFibGVkIH0pO1xuXHRcdH1cblxuXHRcdGdldCBidXN5KCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2J1c3k7XG5cdFx0fVxuXG5cdFx0c2V0IGJ1c3koYnVzeTogYm9vbGVhbikge1xuXHRcdFx0dGhpcy5fYnVzeSA9IGJ1c3k7XG5cdFx0XHR0aGlzLnVwZGF0ZSh7IGJ1c3kgfSk7XG5cdFx0fVxuXG5cdFx0Z2V0IGlnbm9yZUZvY3VzT3V0KCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2lnbm9yZUZvY3VzT3V0O1xuXHRcdH1cblxuXHRcdHNldCBpZ25vcmVGb2N1c091dChpZ25vcmVGb2N1c091dDogYm9vbGVhbikge1xuXHRcdFx0dGhpcy5faWdub3JlRm9jdXNPdXQgPSBpZ25vcmVGb2N1c091dDtcblx0XHRcdHRoaXMudXBkYXRlKHsgaWdub3JlRm9jdXNPdXQgfSk7XG5cdFx0fVxuXG5cdFx0Z2V0IHZhbHVlKCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3ZhbHVlO1xuXHRcdH1cblxuXHRcdHNldCB2YWx1ZSh2YWx1ZTogc3RyaW5nKSB7XG5cdFx0XHR0aGlzLl92YWx1ZSA9IHZhbHVlO1xuXHRcdFx0dGhpcy51cGRhdGUoeyB2YWx1ZSB9KTtcblx0XHR9XG5cblx0XHRnZXQgdmFsdWVTZWxlY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdmFsdWVTZWxlY3Rpb247XG5cdFx0fVxuXG5cdFx0c2V0IHZhbHVlU2VsZWN0aW9uKHZhbHVlU2VsZWN0aW9uOiByZWFkb25seSBbbnVtYmVyLCBudW1iZXJdIHwgdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl92YWx1ZVNlbGVjdGlvbiA9IHZhbHVlU2VsZWN0aW9uO1xuXHRcdFx0dGhpcy51cGRhdGUoeyB2YWx1ZVNlbGVjdGlvbiB9KTtcblx0XHR9XG5cblx0XHRnZXQgcGxhY2Vob2xkZXIoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcGxhY2Vob2xkZXI7XG5cdFx0fVxuXG5cdFx0c2V0IHBsYWNlaG9sZGVyKHBsYWNlaG9sZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3BsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXI7XG5cdFx0XHR0aGlzLnVwZGF0ZSh7IHBsYWNlaG9sZGVyIH0pO1xuXHRcdH1cblxuXHRcdG9uRGlkQ2hhbmdlVmFsdWUgPSB0aGlzLl9vbkRpZENoYW5nZVZhbHVlRW1pdHRlci5ldmVudDtcblxuXHRcdG9uRGlkQWNjZXB0ID0gdGhpcy5fb25EaWRBY2NlcHRFbWl0dGVyLmV2ZW50O1xuXG5cdFx0Z2V0IGJ1dHRvbnMoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYnV0dG9ucztcblx0XHR9XG5cblx0XHRzZXQgYnV0dG9ucyhidXR0b25zOiBRdWlja0lucHV0QnV0dG9uW10pIHtcblx0XHRcdHRoaXMuX2J1dHRvbnMgPSBidXR0b25zLnNsaWNlKCk7XG5cdFx0XHR0aGlzLl9oYW5kbGVzVG9CdXR0b25zLmNsZWFyKCk7XG5cdFx0XHRidXR0b25zLmZvckVhY2goKGJ1dHRvbiwgaSkgPT4ge1xuXHRcdFx0XHRjb25zdCBoYW5kbGUgPSBidXR0b24gPT09IFF1aWNrSW5wdXRCdXR0b25zLkJhY2sgPyAtMSA6IGk7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZXNUb0J1dHRvbnMuc2V0KGhhbmRsZSwgYnV0dG9uKTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy51cGRhdGUoe1xuXHRcdFx0XHRidXR0b25zOiBidXR0b25zLm1hcDxUcmFuc2ZlclF1aWNrSW5wdXRCdXR0b24+KChidXR0b24sIGkpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0aWNvblBhdGhEdG86IEljb25QYXRoLmZyb20oYnV0dG9uLmljb25QYXRoKSxcblx0XHRcdFx0XHRcdHRvb2x0aXA6IGJ1dHRvbi50b29sdGlwLFxuXHRcdFx0XHRcdFx0aGFuZGxlOiBidXR0b24gPT09IFF1aWNrSW5wdXRCdXR0b25zLkJhY2sgPyAtMSA6IGksXG5cdFx0XHRcdFx0XHRsb2NhdGlvbjogdHlwZW9mIGJ1dHRvbi5sb2NhdGlvbiA9PT0gJ251bWJlcicgPyBidXR0b24ubG9jYXRpb24gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR0b2dnbGU6IHR5cGVvZiBidXR0b24udG9nZ2xlID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgYnV0dG9uLnRvZ2dsZS5jaGVja2VkID09PSAnYm9vbGVhbicgPyB7IGNoZWNrZWQ6IGJ1dHRvbi50b2dnbGUuY2hlY2tlZCB9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0pXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRvbkRpZFRyaWdnZXJCdXR0b24gPSB0aGlzLl9vbkRpZFRyaWdnZXJCdXR0b25FbWl0dGVyLmV2ZW50O1xuXG5cdFx0c2hvdygpOiB2b2lkIHtcblx0XHRcdHRoaXMuX3Zpc2libGUgPSB0cnVlO1xuXHRcdFx0dGhpcy5fZXhwZWN0aW5nSGlkZSA9IHRydWU7XG5cdFx0XHR0aGlzLnVwZGF0ZSh7IHZpc2libGU6IHRydWUgfSk7XG5cdFx0fVxuXG5cdFx0aGlkZSgpOiB2b2lkIHtcblx0XHRcdHRoaXMuX3Zpc2libGUgPSBmYWxzZTtcblx0XHRcdHRoaXMudXBkYXRlKHsgdmlzaWJsZTogZmFsc2UgfSk7XG5cdFx0fVxuXG5cdFx0b25EaWRIaWRlID0gdGhpcy5fb25EaWRIaWRlRW1pdHRlci5ldmVudDtcblxuXHRcdF9maXJlRGlkQWNjZXB0KCkge1xuXHRcdFx0dGhpcy5fb25EaWRBY2NlcHRFbWl0dGVyLmZpcmUoKTtcblx0XHR9XG5cblx0XHRfZmlyZURpZENoYW5nZVZhbHVlKHZhbHVlOiBzdHJpbmcpIHtcblx0XHRcdHRoaXMuX3ZhbHVlID0gdmFsdWU7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZhbHVlRW1pdHRlci5maXJlKHZhbHVlKTtcblx0XHR9XG5cblx0XHRfZmlyZURpZFRyaWdnZXJCdXR0b24oaGFuZGxlOiBudW1iZXIsIGNoZWNrZWQ/OiBib29sZWFuKSB7XG5cdFx0XHRjb25zdCBidXR0b24gPSB0aGlzLl9oYW5kbGVzVG9CdXR0b25zLmdldChoYW5kbGUpO1xuXHRcdFx0aWYgKGJ1dHRvbikge1xuXHRcdFx0XHRpZiAoY2hlY2tlZCAhPT0gdW5kZWZpbmVkICYmIGJ1dHRvbi50b2dnbGUpIHtcblx0XHRcdFx0XHRidXR0b24udG9nZ2xlLmNoZWNrZWQgPSBjaGVja2VkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX29uRGlkVHJpZ2dlckJ1dHRvbkVtaXR0ZXIuZmlyZShidXR0b24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdF9maXJlRGlkSGlkZSgpIHtcblx0XHRcdGlmICh0aGlzLl9leHBlY3RpbmdIaWRlKSB7XG5cdFx0XHRcdC8vIGlmIHRoaXMuX3Zpc2libGUgaXMgdHJ1ZSwgaXQgbWVhbnMgdGhhdCAuc2hvdygpIHdhcyBjYWxsZWQgYmV0d2VlblxuXHRcdFx0XHQvLyAuaGlkZSgpIGFuZCAub25EaWRIaWRlLiBUbyBlbnN1cmUgdGhlIGNvcnJlY3QgbnVtYmVyIG9mIG9uRGlkSGlkZSBldmVudHNcblx0XHRcdFx0Ly8gYXJlIGVtaXR0ZWQsIHdlIHNldCB0aGlzLl9leHBlY3RpbmdIaWRlIHRvIHRoaXMgdmFsdWUgc28gdGhhdFxuXHRcdFx0XHQvLyB0aGUgbmV4dCB0aW1lIC5oaWRlKCkgaXMgY2FsbGVkLCB3ZSBjYW4gZW1pdCB0aGUgZXZlbnQgYWdhaW4uXG5cdFx0XHRcdC8vIEV4YW1wbGU6XG5cdFx0XHRcdC8vIC5zaG93KCkgLT4gLmhpZGUoKSAtPiAuc2hvdygpIC0+IC5oaWRlKCkgc2hvdWxkIGVtaXQgMiBvbkRpZEhpZGUgZXZlbnRzLlxuXHRcdFx0XHQvLyAuc2hvdygpIC0+IC5oaWRlKCkgLT4gLmhpZGUoKSBzaG91bGQgZW1pdCAxIG9uRGlkSGlkZSBldmVudC5cblx0XHRcdFx0Ly8gRml4ZXMgIzEzNTc0N1xuXHRcdFx0XHR0aGlzLl9leHBlY3RpbmdIaWRlID0gdGhpcy5fdmlzaWJsZTtcblx0XHRcdFx0dGhpcy5fb25EaWRIaWRlRW1pdHRlci5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9kaXNwb3NlZCA9IHRydWU7XG5cdFx0XHR0aGlzLl9maXJlRGlkSGlkZSgpO1xuXHRcdFx0dGhpcy5fZGlzcG9zYWJsZXMgPSBkaXNwb3NlKHRoaXMuX2Rpc3Bvc2FibGVzKTtcblx0XHRcdGlmICh0aGlzLl91cGRhdGVUaW1lb3V0KSB7XG5cdFx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl91cGRhdGVUaW1lb3V0KTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlVGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uRGlkRGlzcG9zZSgpO1xuXHRcdFx0cHJveHkuJGRpc3Bvc2UodGhpcy5faWQpO1xuXHRcdH1cblxuXHRcdHByb3RlY3RlZCB1cGRhdGUocHJvcGVydGllczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiB2b2lkIHtcblx0XHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhwcm9wZXJ0aWVzKSkge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IHByb3BlcnRpZXNba2V5XTtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1VwZGF0ZVtrZXldID0gdmFsdWUgPT09IHVuZGVmaW5lZCA/IG51bGwgOiB2YWx1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCd2aXNpYmxlJyBpbiB0aGlzLl9wZW5kaW5nVXBkYXRlKSB7XG5cdFx0XHRcdGlmICh0aGlzLl91cGRhdGVUaW1lb3V0KSB7XG5cdFx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX3VwZGF0ZVRpbWVvdXQpO1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZVRpbWVvdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5kaXNwYXRjaFVwZGF0ZSgpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLl92aXNpYmxlICYmICF0aGlzLl91cGRhdGVUaW1lb3V0KSB7XG5cdFx0XHRcdC8vIERlZmVyIHRoZSB1cGRhdGUgc28gdGhhdCBtdWx0aXBsZSBjaGFuZ2VzIHRvIHNldHRlcnMgZG9uJ3QgY2F1c2UgYSByZWRyYXcgZWFjaFxuXHRcdFx0XHR0aGlzLl91cGRhdGVUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlVGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0aGlzLmRpc3BhdGNoVXBkYXRlKCk7XG5cdFx0XHRcdH0sIDApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHByaXZhdGUgZGlzcGF0Y2hVcGRhdGUoKSB7XG5cdFx0XHRwcm94eS4kY3JlYXRlT3JVcGRhdGUodGhpcy5fcGVuZGluZ1VwZGF0ZSk7XG5cdFx0XHR0aGlzLl9wZW5kaW5nVXBkYXRlID0geyBpZDogdGhpcy5faWQgfTtcblx0XHR9XG5cdH1cblxuXHRjbGFzcyBFeHRIb3N0UXVpY2tQaWNrPFQgZXh0ZW5kcyBRdWlja1BpY2tJdGVtPiBleHRlbmRzIEV4dEhvc3RRdWlja0lucHV0IGltcGxlbWVudHMgUXVpY2tQaWNrPFQ+IHtcblxuXHRcdHByaXZhdGUgX2l0ZW1zOiBUW10gPSBbXTtcblx0XHRwcml2YXRlIF9oYW5kbGVzVG9JdGVtcyA9IG5ldyBNYXA8bnVtYmVyLCBUPigpO1xuXHRcdHByaXZhdGUgX2l0ZW1zVG9IYW5kbGVzID0gbmV3IE1hcDxULCBudW1iZXI+KCk7XG5cdFx0cHJpdmF0ZSBfY2FuU2VsZWN0TWFueSA9IGZhbHNlO1xuXHRcdHByaXZhdGUgX21hdGNoT25EZXNjcmlwdGlvbiA9IHRydWU7XG5cdFx0cHJpdmF0ZSBfbWF0Y2hPbkRldGFpbCA9IHRydWU7XG5cdFx0cHJpdmF0ZSBfc29ydEJ5TGFiZWwgPSB0cnVlO1xuXHRcdHByaXZhdGUgX2tlZXBTY3JvbGxQb3NpdGlvbiA9IGZhbHNlO1xuXHRcdHByaXZhdGUgX2FjdGl2ZUl0ZW1zOiBUW10gPSBbXTtcblx0XHRwcml2YXRlIF9wcm9tcHQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFjdGl2ZUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxUW10+KCk7XG5cdFx0cHJpdmF0ZSBfc2VsZWN0ZWRJdGVtczogVFtdID0gW107XG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTZWxlY3Rpb25FbWl0dGVyID0gbmV3IEVtaXR0ZXI8VFtdPigpO1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVHJpZ2dlckl0ZW1CdXR0b25FbWl0dGVyID0gbmV3IEVtaXR0ZXI8UXVpY2tQaWNrSXRlbUJ1dHRvbkV2ZW50PFQ+PigpO1xuXG5cdFx0Y29uc3RydWN0b3IoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIG9uRGlzcG9zZTogKCkgPT4gdm9pZCkge1xuXHRcdFx0c3VwZXIoZXh0ZW5zaW9uLCBvbkRpc3Bvc2UpO1xuXHRcdFx0dGhpcy5fZGlzcG9zYWJsZXMucHVzaChcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVFbWl0dGVyLFxuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbkVtaXR0ZXIsXG5cdFx0XHRcdHRoaXMuX29uRGlkVHJpZ2dlckl0ZW1CdXR0b25FbWl0dGVyXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy51cGRhdGUoeyB0eXBlOiAncXVpY2tQaWNrJyB9KTtcblx0XHR9XG5cblx0XHRnZXQgaXRlbXMoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faXRlbXM7XG5cdFx0fVxuXG5cdFx0c2V0IGl0ZW1zKGl0ZW1zOiBUW10pIHtcblx0XHRcdHRoaXMuX2l0ZW1zID0gaXRlbXMuc2xpY2UoKTtcblx0XHRcdHRoaXMuX2hhbmRsZXNUb0l0ZW1zLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9pdGVtc1RvSGFuZGxlcy5jbGVhcigpO1xuXHRcdFx0aXRlbXMuZm9yRWFjaCgoaXRlbSwgaSkgPT4ge1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVzVG9JdGVtcy5zZXQoaSwgaXRlbSk7XG5cdFx0XHRcdHRoaXMuX2l0ZW1zVG9IYW5kbGVzLnNldChpdGVtLCBpKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBwaWNrSXRlbXM6IFRyYW5zZmVyUXVpY2tQaWNrSXRlbU9yU2VwYXJhdG9yW10gPSBbXTtcblx0XHRcdGZvciAobGV0IGhhbmRsZSA9IDA7IGhhbmRsZSA8IGl0ZW1zLmxlbmd0aDsgaGFuZGxlKyspIHtcblx0XHRcdFx0Y29uc3QgaXRlbSA9IGl0ZW1zW2hhbmRsZV07XG5cdFx0XHRcdGlmIChpdGVtLmtpbmQgPT09IFF1aWNrUGlja0l0ZW1LaW5kLlNlcGFyYXRvcikge1xuXHRcdFx0XHRcdHBpY2tJdGVtcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBpdGVtLmxhYmVsIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmIChpdGVtLnRvb2x0aXApIHtcblx0XHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoaXMuX2V4dGVuc2lvbiwgJ3F1aWNrUGlja0l0ZW1Ub29sdGlwJyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cGlja0l0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdFx0aGFuZGxlLFxuXHRcdFx0XHRcdFx0bGFiZWw6IGl0ZW0ubGFiZWwsXG5cdFx0XHRcdFx0XHRpY29uUGF0aER0bzogSWNvblBhdGguZnJvbShpdGVtLmljb25QYXRoKSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBpdGVtLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0ZGV0YWlsOiBpdGVtLmRldGFpbCxcblx0XHRcdFx0XHRcdHBpY2tlZDogaXRlbS5waWNrZWQsXG5cdFx0XHRcdFx0XHRhbHdheXNTaG93OiBpdGVtLmFsd2F5c1Nob3csXG5cdFx0XHRcdFx0XHR0b29sdGlwOiBNYXJrZG93blN0cmluZy5mcm9tU3RyaWN0KGl0ZW0udG9vbHRpcCksXG5cdFx0XHRcdFx0XHRyZXNvdXJjZVVyaTogaXRlbS5yZXNvdXJjZVVyaSxcblx0XHRcdFx0XHRcdGJ1dHRvbnM6IGl0ZW0uYnV0dG9ucz8ubWFwPFRyYW5zZmVyUXVpY2tJbnB1dEJ1dHRvbj4oKGJ1dHRvbiwgaSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRcdGljb25QYXRoRHRvOiBJY29uUGF0aC5mcm9tKGJ1dHRvbi5pY29uUGF0aCksXG5cdFx0XHRcdFx0XHRcdFx0dG9vbHRpcDogYnV0dG9uLnRvb2x0aXAsXG5cdFx0XHRcdFx0XHRcdFx0aGFuZGxlOiBpLFxuXHRcdFx0XHRcdFx0XHRcdHRvZ2dsZTpcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGVvZiBidXR0b24udG9nZ2xlID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgYnV0dG9uLnRvZ2dsZS5jaGVja2VkID09PSAnYm9vbGVhbidcblx0XHRcdFx0XHRcdFx0XHRcdFx0PyB7IGNoZWNrZWQ6IGJ1dHRvbi50b2dnbGUuY2hlY2tlZCB9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy51cGRhdGUoe1xuXHRcdFx0XHRpdGVtczogcGlja0l0ZW1zLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Z2V0IGNhblNlbGVjdE1hbnkoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2FuU2VsZWN0TWFueTtcblx0XHR9XG5cblx0XHRzZXQgY2FuU2VsZWN0TWFueShjYW5TZWxlY3RNYW55OiBib29sZWFuKSB7XG5cdFx0XHR0aGlzLl9jYW5TZWxlY3RNYW55ID0gY2FuU2VsZWN0TWFueTtcblx0XHRcdHRoaXMudXBkYXRlKHsgY2FuU2VsZWN0TWFueSB9KTtcblx0XHR9XG5cblx0XHRnZXQgbWF0Y2hPbkRlc2NyaXB0aW9uKCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX21hdGNoT25EZXNjcmlwdGlvbjtcblx0XHR9XG5cblx0XHRzZXQgbWF0Y2hPbkRlc2NyaXB0aW9uKG1hdGNoT25EZXNjcmlwdGlvbjogYm9vbGVhbikge1xuXHRcdFx0dGhpcy5fbWF0Y2hPbkRlc2NyaXB0aW9uID0gbWF0Y2hPbkRlc2NyaXB0aW9uO1xuXHRcdFx0dGhpcy51cGRhdGUoeyBtYXRjaE9uRGVzY3JpcHRpb24gfSk7XG5cdFx0fVxuXG5cdFx0Z2V0IG1hdGNoT25EZXRhaWwoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbWF0Y2hPbkRldGFpbDtcblx0XHR9XG5cblx0XHRzZXQgbWF0Y2hPbkRldGFpbChtYXRjaE9uRGV0YWlsOiBib29sZWFuKSB7XG5cdFx0XHR0aGlzLl9tYXRjaE9uRGV0YWlsID0gbWF0Y2hPbkRldGFpbDtcblx0XHRcdHRoaXMudXBkYXRlKHsgbWF0Y2hPbkRldGFpbCB9KTtcblx0XHR9XG5cblx0XHRnZXQgc29ydEJ5TGFiZWwoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc29ydEJ5TGFiZWw7XG5cdFx0fVxuXG5cdFx0c2V0IHNvcnRCeUxhYmVsKHNvcnRCeUxhYmVsOiBib29sZWFuKSB7XG5cdFx0XHR0aGlzLl9zb3J0QnlMYWJlbCA9IHNvcnRCeUxhYmVsO1xuXHRcdFx0dGhpcy51cGRhdGUoeyBzb3J0QnlMYWJlbCB9KTtcblx0XHR9XG5cblx0XHRnZXQga2VlcFNjcm9sbFBvc2l0aW9uKCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2tlZXBTY3JvbGxQb3NpdGlvbjtcblx0XHR9XG5cblx0XHRzZXQga2VlcFNjcm9sbFBvc2l0aW9uKGtlZXBTY3JvbGxQb3NpdGlvbjogYm9vbGVhbikge1xuXHRcdFx0dGhpcy5fa2VlcFNjcm9sbFBvc2l0aW9uID0ga2VlcFNjcm9sbFBvc2l0aW9uO1xuXHRcdFx0dGhpcy51cGRhdGUoeyBrZWVwU2Nyb2xsUG9zaXRpb24gfSk7XG5cdFx0fVxuXG5cdFx0Z2V0IHByb21wdCgpIHtcblx0XHRcdHJldHVybiB0aGlzLl9wcm9tcHQ7XG5cdFx0fVxuXG5cdFx0c2V0IHByb21wdChwcm9tcHQ6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fcHJvbXB0ID0gcHJvbXB0O1xuXHRcdFx0dGhpcy51cGRhdGUoeyBwcm9tcHQgfSk7XG5cdFx0fVxuXG5cdFx0Z2V0IGFjdGl2ZUl0ZW1zKCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FjdGl2ZUl0ZW1zO1xuXHRcdH1cblxuXHRcdHNldCBhY3RpdmVJdGVtcyhhY3RpdmVJdGVtczogVFtdKSB7XG5cdFx0XHR0aGlzLl9hY3RpdmVJdGVtcyA9IGFjdGl2ZUl0ZW1zLmZpbHRlcihpdGVtID0+IHRoaXMuX2l0ZW1zVG9IYW5kbGVzLmhhcyhpdGVtKSk7XG5cdFx0XHR0aGlzLnVwZGF0ZSh7IGFjdGl2ZUl0ZW1zOiB0aGlzLl9hY3RpdmVJdGVtcy5tYXAoaXRlbSA9PiB0aGlzLl9pdGVtc1RvSGFuZGxlcy5nZXQoaXRlbSkpIH0pO1xuXHRcdH1cblxuXHRcdG9uRGlkQ2hhbmdlQWN0aXZlID0gdGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVFbWl0dGVyLmV2ZW50O1xuXG5cdFx0Z2V0IHNlbGVjdGVkSXRlbXMoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2VsZWN0ZWRJdGVtcztcblx0XHR9XG5cblx0XHRzZXQgc2VsZWN0ZWRJdGVtcyhzZWxlY3RlZEl0ZW1zOiBUW10pIHtcblx0XHRcdHRoaXMuX3NlbGVjdGVkSXRlbXMgPSBzZWxlY3RlZEl0ZW1zLmZpbHRlcihpdGVtID0+IHRoaXMuX2l0ZW1zVG9IYW5kbGVzLmhhcyhpdGVtKSk7XG5cdFx0XHR0aGlzLnVwZGF0ZSh7IHNlbGVjdGVkSXRlbXM6IHRoaXMuX3NlbGVjdGVkSXRlbXMubWFwKGl0ZW0gPT4gdGhpcy5faXRlbXNUb0hhbmRsZXMuZ2V0KGl0ZW0pKSB9KTtcblx0XHR9XG5cblx0XHRvbkRpZENoYW5nZVNlbGVjdGlvbiA9IHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uRW1pdHRlci5ldmVudDtcblxuXHRcdF9maXJlRGlkQ2hhbmdlQWN0aXZlKGhhbmRsZXM6IG51bWJlcltdKSB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGNvYWxlc2NlKGhhbmRsZXMubWFwKGhhbmRsZSA9PiB0aGlzLl9oYW5kbGVzVG9JdGVtcy5nZXQoaGFuZGxlKSkpO1xuXHRcdFx0dGhpcy5fYWN0aXZlSXRlbXMgPSBpdGVtcztcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlRW1pdHRlci5maXJlKGl0ZW1zKTtcblx0XHR9XG5cblx0XHRfZmlyZURpZENoYW5nZVNlbGVjdGlvbihoYW5kbGVzOiBudW1iZXJbXSkge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBjb2FsZXNjZShoYW5kbGVzLm1hcChoYW5kbGUgPT4gdGhpcy5faGFuZGxlc1RvSXRlbXMuZ2V0KGhhbmRsZSkpKTtcblx0XHRcdHRoaXMuX3NlbGVjdGVkSXRlbXMgPSBpdGVtcztcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uRW1pdHRlci5maXJlKGl0ZW1zKTtcblx0XHR9XG5cblx0XHRvbkRpZFRyaWdnZXJJdGVtQnV0dG9uID0gdGhpcy5fb25EaWRUcmlnZ2VySXRlbUJ1dHRvbkVtaXR0ZXIuZXZlbnQ7XG5cblx0XHRfZmlyZURpZFRyaWdnZXJJdGVtQnV0dG9uKGl0ZW1IYW5kbGU6IG51bWJlciwgYnV0dG9uSGFuZGxlOiBudW1iZXIsIGNoZWNrZWQ/OiBib29sZWFuKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gdGhpcy5faGFuZGxlc1RvSXRlbXMuZ2V0KGl0ZW1IYW5kbGUpITtcblx0XHRcdGlmICghaXRlbSB8fCAhaXRlbS5idXR0b25zIHx8ICFpdGVtLmJ1dHRvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGl0ZW0uYnV0dG9uc1tidXR0b25IYW5kbGVdO1xuXHRcdFx0aWYgKGJ1dHRvbikge1xuXHRcdFx0XHRpZiAoY2hlY2tlZCAhPT0gdW5kZWZpbmVkICYmIGJ1dHRvbi50b2dnbGUpIHtcblx0XHRcdFx0XHRidXR0b24udG9nZ2xlLmNoZWNrZWQgPSBjaGVja2VkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX29uRGlkVHJpZ2dlckl0ZW1CdXR0b25FbWl0dGVyLmZpcmUoe1xuXHRcdFx0XHRcdGJ1dHRvbixcblx0XHRcdFx0XHRpdGVtXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNsYXNzIEV4dEhvc3RJbnB1dEJveCBleHRlbmRzIEV4dEhvc3RRdWlja0lucHV0IGltcGxlbWVudHMgSW5wdXRCb3gge1xuXG5cdFx0cHJpdmF0ZSBfcGFzc3dvcmQgPSBmYWxzZTtcblx0XHRwcml2YXRlIF9wcm9tcHQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRwcml2YXRlIF92YWxpZGF0aW9uTWVzc2FnZTogc3RyaW5nIHwgSW5wdXRCb3hWYWxpZGF0aW9uTWVzc2FnZSB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0cnVjdG9yKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBvbkRpc3Bvc2U6ICgpID0+IHZvaWQpIHtcblx0XHRcdHN1cGVyKGV4dGVuc2lvbiwgb25EaXNwb3NlKTtcblx0XHRcdHRoaXMudXBkYXRlKHsgdHlwZTogJ2lucHV0Qm94JyB9KTtcblx0XHR9XG5cblx0XHRnZXQgcGFzc3dvcmQoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcGFzc3dvcmQ7XG5cdFx0fVxuXG5cdFx0c2V0IHBhc3N3b3JkKHBhc3N3b3JkOiBib29sZWFuKSB7XG5cdFx0XHR0aGlzLl9wYXNzd29yZCA9IHBhc3N3b3JkO1xuXHRcdFx0dGhpcy51cGRhdGUoeyBwYXNzd29yZCB9KTtcblx0XHR9XG5cblx0XHRnZXQgcHJvbXB0KCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Byb21wdDtcblx0XHR9XG5cblx0XHRzZXQgcHJvbXB0KHByb21wdDogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9wcm9tcHQgPSBwcm9tcHQ7XG5cdFx0XHR0aGlzLnVwZGF0ZSh7IHByb21wdCB9KTtcblx0XHR9XG5cblx0XHRnZXQgdmFsaWRhdGlvbk1lc3NhZ2UoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdmFsaWRhdGlvbk1lc3NhZ2U7XG5cdFx0fVxuXG5cdFx0c2V0IHZhbGlkYXRpb25NZXNzYWdlKHZhbGlkYXRpb25NZXNzYWdlOiBzdHJpbmcgfCBJbnB1dEJveFZhbGlkYXRpb25NZXNzYWdlIHwgdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl92YWxpZGF0aW9uTWVzc2FnZSA9IHZhbGlkYXRpb25NZXNzYWdlO1xuXHRcdFx0aWYgKCF2YWxpZGF0aW9uTWVzc2FnZSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZSh7IHZhbGlkYXRpb25NZXNzYWdlOiB1bmRlZmluZWQsIHNldmVyaXR5OiBTZXZlcml0eS5JZ25vcmUgfSk7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiB2YWxpZGF0aW9uTWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0dGhpcy51cGRhdGUoeyB2YWxpZGF0aW9uTWVzc2FnZSwgc2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy51cGRhdGUoeyB2YWxpZGF0aW9uTWVzc2FnZTogdmFsaWRhdGlvbk1lc3NhZ2UubWVzc2FnZSwgc2V2ZXJpdHk6IHZhbGlkYXRpb25NZXNzYWdlLnNldmVyaXR5ID8/IFNldmVyaXR5LkVycm9yIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiBuZXcgRXh0SG9zdFF1aWNrT3BlbkltcGwod29ya3NwYWNlLCBjb21tYW5kcyk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUE0QjtBQUlyQyxTQUE4QyxtQkFBbUc7QUFDakosU0FBUyxtQkFBbUIsbUJBQW1CLGtDQUFrQztBQUNqRixTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLGdCQUFnQjtBQUN6QixPQUFPLGNBQWM7QUFDckIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxVQUFVLHNCQUFzQjtBQW1CbEMsU0FBUyx1QkFBdUIsYUFBMkIsV0FBc0MsVUFBcUU7QUFDNUssUUFBTSxRQUFRLFlBQVksU0FBUyxZQUFZLG1CQUFtQjtBQUFBLEVBRWxFLE1BQU0scUJBQXNEO0FBQUEsSUFZM0QsWUFBWUEsWUFBc0NDLFdBQTJCO0FBSjdFLFdBQVEsWUFBWSxvQkFBSSxJQUErQjtBQUV2RCxXQUFRLGFBQWE7QUFHcEIsV0FBSyxhQUFhRDtBQUNsQixXQUFLLFlBQVlDO0FBQUEsSUFDbEI7QUFBQSxJQUtBLGNBQWMsV0FBa0MscUJBQStDLFNBQTRCLFFBQTJCLGtCQUFrQixNQUEwQztBQUVqTixXQUFLLG1CQUFtQjtBQUV4QixZQUFNLGVBQWUsUUFBUSxRQUFRLG1CQUFtQjtBQUV4RCxZQUFNLFdBQVcsRUFBRSxLQUFLO0FBRXhCLFlBQU0sa0JBQWtC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
