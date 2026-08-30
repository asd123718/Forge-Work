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
import { Lazy } from "../../../base/common/lazy.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { basenameOrAuthority, dirname, hasTrailingPathSeparator } from "../../../base/common/resources.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { isUriComponents, URI } from "../../../base/common/uri.js";
import { ILanguageService } from "../../../editor/common/languages/language.js";
import { getIconClasses } from "../../../editor/common/services/getIconClasses.js";
import { IModelService } from "../../../editor/common/services/model.js";
import { FileKind } from "../../../platform/files/common/files.js";
import { ILabelService } from "../../../platform/label/common/label.js";
import { IQuickInputService } from "../../../platform/quickinput/common/quickInput.js";
import { ICustomEditorLabelService } from "../../services/editor/common/customEditorLabelService.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
let MainThreadQuickOpen = class {
  constructor(extHostContext, quickInputService, labelService, customEditorLabelService, modelService, languageService) {
    this.labelService = labelService;
    this.customEditorLabelService = customEditorLabelService;
    this.modelService = modelService;
    this.languageService = languageService;
    this._items = {};
    // ---- QuickInput
    this.sessions = /* @__PURE__ */ new Map();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostQuickOpen);
    this._quickInputService = quickInputService;
  }
  dispose() {
    for (const [_id, session] of this.sessions) {
      session.store.dispose();
    }
  }
  $show(instance, options, token) {
    const contents = new Promise((resolve, reject) => {
      this._items[instance] = { resolve, reject };
    });
    options = {
      ...options,
      onDidFocus: (el) => {
        if (el) {
          this._proxy.$onItemSelected(el.handle);
        }
      }
    };
    if (options.canPickMany) {
      return this._quickInputService.pick(contents, options, token).then((items) => {
        if (items) {
          return items.map((item) => item.handle);
        }
        return void 0;
      });
    } else {
      return this._quickInputService.pick(contents, options, token).then((item) => {
        if (item) {
          return item.handle;
        }
        return void 0;
      });
    }
  }
  $setItems(instance, items) {
    if (this._items[instance]) {
      items.forEach((item) => this.expandItemProps(item));
      this._items[instance].resolve(items);
      delete this._items[instance];
    }
    return Promise.resolve();
  }
  $setError(instance, error) {
    if (this._items[instance]) {
      this._items[instance].reject(error);
      delete this._items[instance];
    }
    return Promise.resolve();
  }
  // ---- input
  $input(options, validateInput, token) {
    const inputOptions = /* @__PURE__ */ Object.create(null);
    if (options) {
      inputOptions.title = options.title;
      inputOptions.password = options.password;
      inputOptions.placeHolder = options.placeHolder;
      inputOptions.valueSelection = options.valueSelection;
      inputOptions.prompt = options.prompt;
      inputOptions.value = options.value;
      inputOptions.ignoreFocusLost = options.ignoreFocusOut;
    }
    if (validateInput) {
      inputOptions.validateInput = (value) => {
        return this._proxy.$validateInput(value);
      };
    }
    return this._quickInputService.input(inputOptions, token);
  }
  $createOrUpdate(params) {
    const sessionId = params.id;
    let session = this.sessions.get(sessionId);
    if (!session) {
      const store = new DisposableStore();
      const input2 = params.type === "quickPick" ? this._quickInputService.createQuickPick() : this._quickInputService.createInputBox();
      store.add(input2);
      store.add(input2.onDidAccept(() => {
        this._proxy.$onDidAccept(sessionId);
      }));
      store.add(input2.onDidTriggerButton((button) => {
        this._proxy.$onDidTriggerButton(sessionId, button.handle, button.toggle?.checked);
      }));
      store.add(input2.onDidChangeValue((value) => {
        this._proxy.$onDidChangeValue(sessionId, value);
      }));
      store.add(input2.onDidHide(() => {
        this._proxy.$onDidHide(sessionId);
      }));
      if (params.type === "quickPick") {
        const quickPick2 = input2;
        store.add(quickPick2.onDidChangeActive((items) => {
          this._proxy.$onDidChangeActive(sessionId, items.map((item) => item.handle));
        }));
        store.add(quickPick2.onDidChangeSelection((items) => {
          this._proxy.$onDidChangeSelection(sessionId, items.map((item) => item.handle));
        }));
        store.add(quickPick2.onDidTriggerItemButton((e) => {
          const transferButton = e.button;
          this._proxy.$onDidTriggerItemButton(
            sessionId,
            e.item.handle,
            transferButton.handle,
            transferButton.toggle?.checked
          );
        }));
      }
      session = {
        input: input2,
        handlesToItems: /* @__PURE__ */ new Map(),
        store
      };
      this.sessions.set(sessionId, session);
    }
    const { input, handlesToItems } = session;
    const quickPick = input;
    for (const param in params) {
      switch (param) {
        case "id":
        case "type":
          continue;
        case "visible":
          if (params.visible) {
            input.show();
          } else {
            input.hide();
          }
          break;
        case "items": {
          handlesToItems.clear();
          params.items?.forEach((item) => {
            this.expandItemProps(item);
            if (item.type !== "separator") {
              item.buttons?.forEach((button) => this.expandIconPath(button));
              handlesToItems.set(item.handle, item);
            }
          });
          quickPick.items = params.items;
          break;
        }
        case "activeItems":
          quickPick.activeItems = params.activeItems?.map((handle) => handlesToItems.get(handle)).filter(Boolean);
          break;
        case "selectedItems":
          quickPick.selectedItems = params.selectedItems?.map((handle) => handlesToItems.get(handle)).filter(Boolean);
          break;
        case "buttons": {
          const buttons = [];
          for (const button of params.buttons) {
            if (button.handle === -1) {
              buttons.push(this._quickInputService.backButton);
            } else {
              this.expandIconPath(button);
              buttons.push(button);
            }
          }
          input.buttons = buttons;
          break;
        }
        default:
          input[param] = params[param];
          break;
      }
    }
    return Promise.resolve(void 0);
  }
  $dispose(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.store.dispose();
      this.sessions.delete(sessionId);
    }
    return Promise.resolve(void 0);
  }
  /**
  * Derives icon, label and description for Quick Pick items that represent a resource URI.
  */
  expandItemProps(item) {
    if (item.type === "separator") {
      return;
    }
    if (!item.resourceUri) {
      this.expandIconPath(item);
      return;
    }
    const resourceUri = URI.from(item.resourceUri);
    item.label ??= this.customEditorLabelService.getName(resourceUri) || "";
    if (item.label) {
      item.description ??= this.labelService.getUriLabel(resourceUri, { relative: true });
    } else {
      item.label = basenameOrAuthority(resourceUri);
      item.description ??= this.labelService.getUriLabel(dirname(resourceUri), { relative: true });
    }
    const icon = item.iconPathDto;
    if (ThemeIcon.isThemeIcon(icon) && (ThemeIcon.isFile(icon) || ThemeIcon.isFolder(icon))) {
      const fileKind = ThemeIcon.isFolder(icon) || hasTrailingPathSeparator(resourceUri) ? FileKind.FOLDER : FileKind.FILE;
      const iconClasses = new Lazy(() => getIconClasses(this.modelService, this.languageService, resourceUri, fileKind));
      Object.defineProperty(item, "iconClasses", { get: () => iconClasses.value });
    } else {
      this.expandIconPath(item);
    }
  }
  /**
  * Converts IconPath DTO into iconPath/iconClass properties.
  */
  expandIconPath(target) {
    const icon = target.iconPathDto;
    if (!icon) {
      return;
    } else if (ThemeIcon.isThemeIcon(icon)) {
      target.iconClass = ThemeIcon.asClassName(icon);
    } else if (isUriComponents(icon)) {
      const uri = URI.from(icon);
      target.iconPath = { dark: uri, light: uri };
    } else {
      const { dark, light } = icon;
      target.iconPath = { dark: URI.from(dark), light: URI.from(light) };
    }
  }
};
MainThreadQuickOpen = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadQuickOpen),
  __decorateParam(1, IQuickInputService),
  __decorateParam(2, ILabelService),
  __decorateParam(3, ICustomEditorLabelService),
  __decorateParam(4, IModelService),
  __decorateParam(5, ILanguageService)
], MainThreadQuickOpen);
export {
  MainThreadQuickOpen
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZFF1aWNrT3Blbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZU9yQXV0aG9yaXR5LCBkaXJuYW1lLCBoYXNUcmFpbGluZ1BhdGhTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGlzVXJpQ29tcG9uZW50cywgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBnZXRJY29uQ2xhc3NlcyB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvZ2V0SWNvbkNsYXNzZXMuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgRmlsZUtpbmQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJSW5wdXRPcHRpb25zLCBJUGlja09wdGlvbnMsIElRdWlja0lucHV0LCBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2ssIElRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9jdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZXh0SG9zdE5hbWVkQ3VzdG9tZXIsIElFeHRIb3N0Q29udGV4dCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvbnRleHQsIEV4dEhvc3RRdWlja09wZW5TaGFwZSwgSUlucHV0Qm94T3B0aW9ucywgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRRdWlja09wZW5TaGFwZSwgVHJhbnNmZXJRdWlja0lucHV0LCBUcmFuc2ZlclF1aWNrSW5wdXRCdXR0b24sIFRyYW5zZmVyUXVpY2tQaWNrSXRlbSwgVHJhbnNmZXJRdWlja1BpY2tJdGVtT3JTZXBhcmF0b3IgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5cbmludGVyZmFjZSBRdWlja0lucHV0U2Vzc2lvbiB7XG5cdGlucHV0OiBJUXVpY2tJbnB1dDtcblx0aGFuZGxlc1RvSXRlbXM6IE1hcDxudW1iZXIsIFRyYW5zZmVyUXVpY2tQaWNrSXRlbT47XG5cdHN0b3JlOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkUXVpY2tPcGVuKVxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWRRdWlja09wZW4gaW1wbGVtZW50cyBNYWluVGhyZWFkUXVpY2tPcGVuU2hhcGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBFeHRIb3N0UXVpY2tPcGVuU2hhcGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2l0ZW1zOiBSZWNvcmQ8bnVtYmVyLCB7XG5cdFx0cmVzb2x2ZShpdGVtczogVHJhbnNmZXJRdWlja1BpY2tJdGVtT3JTZXBhcmF0b3JbXSk6IHZvaWQ7XG5cdFx0cmVqZWN0KGVycm9yOiBFcnJvcik6IHZvaWQ7XG5cdH0+ID0ge307XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZXh0SG9zdENvbnRleHQ6IElFeHRIb3N0Q29udGV4dCxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjdXN0b21FZGl0b3JMYWJlbFNlcnZpY2U6IElDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5fcHJveHkgPSBleHRIb3N0Q29udGV4dC5nZXRQcm94eShFeHRIb3N0Q29udGV4dC5FeHRIb3N0UXVpY2tPcGVuKTtcblx0XHR0aGlzLl9xdWlja0lucHV0U2VydmljZSA9IHF1aWNrSW5wdXRTZXJ2aWNlO1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBbX2lkLCBzZXNzaW9uXSBvZiB0aGlzLnNlc3Npb25zKSB7XG5cdFx0XHRzZXNzaW9uLnN0b3JlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHQkc2hvdyhpbnN0YW5jZTogbnVtYmVyLCBvcHRpb25zOiBJUGlja09wdGlvbnM8VHJhbnNmZXJRdWlja1BpY2tJdGVtPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxudW1iZXIgfCBudW1iZXJbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGNvbnRlbnRzID0gbmV3IFByb21pc2U8VHJhbnNmZXJRdWlja1BpY2tJdGVtT3JTZXBhcmF0b3JbXT4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0dGhpcy5faXRlbXNbaW5zdGFuY2VdID0geyByZXNvbHZlLCByZWplY3QgfTtcblx0XHR9KTtcblxuXHRcdG9wdGlvbnMgPSB7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0b25EaWRGb2N1czogZWwgPT4ge1xuXHRcdFx0XHRpZiAoZWwpIHtcblx0XHRcdFx0XHR0aGlzLl9wcm94eS4kb25JdGVtU2VsZWN0ZWQoZWwuaGFuZGxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRpZiAob3B0aW9ucy5jYW5QaWNrTWFueSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLnBpY2soY29udGVudHMsIG9wdGlvbnMgYXMgeyBjYW5QaWNrTWFueTogdHJ1ZSB9LCB0b2tlbikudGhlbihpdGVtcyA9PiB7XG5cdFx0XHRcdGlmIChpdGVtcykge1xuXHRcdFx0XHRcdHJldHVybiBpdGVtcy5tYXAoaXRlbSA9PiBpdGVtLmhhbmRsZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UucGljayhjb250ZW50cywgb3B0aW9ucywgdG9rZW4pLnRoZW4oaXRlbSA9PiB7XG5cdFx0XHRcdGlmIChpdGVtKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGl0ZW0uaGFuZGxlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQkc2V0SXRlbXMoaW5zdGFuY2U6IG51bWJlciwgaXRlbXM6IFRyYW5zZmVyUXVpY2tQaWNrSXRlbU9yU2VwYXJhdG9yW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5faXRlbXNbaW5zdGFuY2VdKSB7XG5cdFx0XHRpdGVtcy5mb3JFYWNoKGl0ZW0gPT4gdGhpcy5leHBhbmRJdGVtUHJvcHMoaXRlbSkpO1xuXHRcdFx0dGhpcy5faXRlbXNbaW5zdGFuY2VdLnJlc29sdmUoaXRlbXMpO1xuXHRcdFx0ZGVsZXRlIHRoaXMuX2l0ZW1zW2luc3RhbmNlXTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0JHNldEVycm9yKGluc3RhbmNlOiBudW1iZXIsIGVycm9yOiBFcnJvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9pdGVtc1tpbnN0YW5jZV0pIHtcblx0XHRcdHRoaXMuX2l0ZW1zW2luc3RhbmNlXS5yZWplY3QoZXJyb3IpO1xuXHRcdFx0ZGVsZXRlIHRoaXMuX2l0ZW1zW2luc3RhbmNlXTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0Ly8gLS0tLSBpbnB1dFxuXG5cdCRpbnB1dChvcHRpb25zOiBJSW5wdXRCb3hPcHRpb25zIHwgdW5kZWZpbmVkLCB2YWxpZGF0ZUlucHV0OiBib29sZWFuLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGlucHV0T3B0aW9uczogSUlucHV0T3B0aW9ucyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cblx0XHRpZiAob3B0aW9ucykge1xuXHRcdFx0aW5wdXRPcHRpb25zLnRpdGxlID0gb3B0aW9ucy50aXRsZTtcblx0XHRcdGlucHV0T3B0aW9ucy5wYXNzd29yZCA9IG9wdGlvbnMucGFzc3dvcmQ7XG5cdFx0XHRpbnB1dE9wdGlvbnMucGxhY2VIb2xkZXIgPSBvcHRpb25zLnBsYWNlSG9sZGVyO1xuXHRcdFx0aW5wdXRPcHRpb25zLnZhbHVlU2VsZWN0aW9uID0gb3B0aW9ucy52YWx1ZVNlbGVjdGlvbjtcblx0XHRcdGlucHV0T3B0aW9ucy5wcm9tcHQgPSBvcHRpb25zLnByb21wdDtcblx0XHRcdGlucHV0T3B0aW9ucy52YWx1ZSA9IG9wdGlvbnMudmFsdWU7XG5cdFx0XHRpbnB1dE9wdGlvbnMuaWdub3JlRm9jdXNMb3N0ID0gb3B0aW9ucy5pZ25vcmVGb2N1c091dDtcblx0XHR9XG5cblx0XHRpZiAodmFsaWRhdGVJbnB1dCkge1xuXHRcdFx0aW5wdXRPcHRpb25zLnZhbGlkYXRlSW5wdXQgPSAodmFsdWUpID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiR2YWxpZGF0ZUlucHV0KHZhbHVlKTtcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmlucHV0KGlucHV0T3B0aW9ucywgdG9rZW4pO1xuXHR9XG5cblx0Ly8gLS0tLSBRdWlja0lucHV0XG5cblx0cHJpdmF0ZSBzZXNzaW9ucyA9IG5ldyBNYXA8bnVtYmVyLCBRdWlja0lucHV0U2Vzc2lvbj4oKTtcblxuXHQkY3JlYXRlT3JVcGRhdGUocGFyYW1zOiBUcmFuc2ZlclF1aWNrSW5wdXQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBwYXJhbXMuaWQ7XG5cdFx0bGV0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBpbnB1dCA9IHBhcmFtcy50eXBlID09PSAncXVpY2tQaWNrJyA/IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljaygpIDogdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlSW5wdXRCb3goKTtcblx0XHRcdHN0b3JlLmFkZChpbnB1dCk7XG5cdFx0XHRzdG9yZS5hZGQoaW5wdXQub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRBY2NlcHQoc2Vzc2lvbklkKTtcblx0XHRcdH0pKTtcblx0XHRcdHN0b3JlLmFkZChpbnB1dC5vbkRpZFRyaWdnZXJCdXR0b24oYnV0dG9uID0+IHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkVHJpZ2dlckJ1dHRvbihzZXNzaW9uSWQsIChidXR0b24gYXMgVHJhbnNmZXJRdWlja0lucHV0QnV0dG9uKS5oYW5kbGUsIGJ1dHRvbi50b2dnbGU/LmNoZWNrZWQpO1xuXHRcdFx0fSkpO1xuXHRcdFx0c3RvcmUuYWRkKGlucHV0Lm9uRGlkQ2hhbmdlVmFsdWUodmFsdWUgPT4ge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VWYWx1ZShzZXNzaW9uSWQsIHZhbHVlKTtcblx0XHRcdH0pKTtcblx0XHRcdHN0b3JlLmFkZChpbnB1dC5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRIaWRlKHNlc3Npb25JZCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGlmIChwYXJhbXMudHlwZSA9PT0gJ3F1aWNrUGljaycpIHtcblx0XHRcdFx0Ly8gQWRkIGV4dHJhIGV2ZW50cyBzcGVjaWZpYyBmb3IgcXVpY2sgcGlja1xuXHRcdFx0XHRjb25zdCBxdWlja1BpY2sgPSBpbnB1dCBhcyBJUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtPjtcblx0XHRcdFx0c3RvcmUuYWRkKHF1aWNrUGljay5vbkRpZENoYW5nZUFjdGl2ZShpdGVtcyA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkQ2hhbmdlQWN0aXZlKHNlc3Npb25JZCwgaXRlbXMubWFwKGl0ZW0gPT4gKGl0ZW0gYXMgVHJhbnNmZXJRdWlja1BpY2tJdGVtKS5oYW5kbGUpKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRzdG9yZS5hZGQocXVpY2tQaWNrLm9uRGlkQ2hhbmdlU2VsZWN0aW9uKGl0ZW1zID0+IHtcblx0XHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VTZWxlY3Rpb24oc2Vzc2lvbklkLCBpdGVtcy5tYXAoaXRlbSA9PiAoaXRlbSBhcyBUcmFuc2ZlclF1aWNrUGlja0l0ZW0pLmhhbmRsZSkpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHN0b3JlLmFkZChxdWlja1BpY2sub25EaWRUcmlnZ2VySXRlbUJ1dHRvbigoZSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRyYW5zZmVyQnV0dG9uID0gZS5idXR0b24gYXMgVHJhbnNmZXJRdWlja0lucHV0QnV0dG9uO1xuXHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZFRyaWdnZXJJdGVtQnV0dG9uKFxuXHRcdFx0XHRcdFx0c2Vzc2lvbklkLFxuXHRcdFx0XHRcdFx0KGUuaXRlbSBhcyBUcmFuc2ZlclF1aWNrUGlja0l0ZW0pLmhhbmRsZSxcblx0XHRcdFx0XHRcdHRyYW5zZmVyQnV0dG9uLmhhbmRsZSxcblx0XHRcdFx0XHRcdHRyYW5zZmVyQnV0dG9uLnRvZ2dsZT8uY2hlY2tlZFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblxuXHRcdFx0c2Vzc2lvbiA9IHtcblx0XHRcdFx0aW5wdXQsXG5cdFx0XHRcdGhhbmRsZXNUb0l0ZW1zOiBuZXcgTWFwKCksXG5cdFx0XHRcdHN0b3JlXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5zZXNzaW9ucy5zZXQoc2Vzc2lvbklkLCBzZXNzaW9uKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IGlucHV0LCBoYW5kbGVzVG9JdGVtcyB9ID0gc2Vzc2lvbjtcblx0XHRjb25zdCBxdWlja1BpY2sgPSBpbnB1dCBhcyBJUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtPjtcblx0XHRmb3IgKGNvbnN0IHBhcmFtIGluIHBhcmFtcykge1xuXHRcdFx0c3dpdGNoIChwYXJhbSkge1xuXHRcdFx0XHRjYXNlICdpZCc6XG5cdFx0XHRcdGNhc2UgJ3R5cGUnOlxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXG5cdFx0XHRcdGNhc2UgJ3Zpc2libGUnOlxuXHRcdFx0XHRcdGlmIChwYXJhbXMudmlzaWJsZSkge1xuXHRcdFx0XHRcdFx0aW5wdXQuc2hvdygpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRpbnB1dC5oaWRlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ2l0ZW1zJzoge1xuXHRcdFx0XHRcdGhhbmRsZXNUb0l0ZW1zLmNsZWFyKCk7XG5cdFx0XHRcdFx0cGFyYW1zLml0ZW1zPy5mb3JFYWNoKChpdGVtOiBUcmFuc2ZlclF1aWNrUGlja0l0ZW1PclNlcGFyYXRvcikgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5leHBhbmRJdGVtUHJvcHMoaXRlbSk7XG5cdFx0XHRcdFx0XHRpZiAoaXRlbS50eXBlICE9PSAnc2VwYXJhdG9yJykge1xuXHRcdFx0XHRcdFx0XHRpdGVtLmJ1dHRvbnM/LmZvckVhY2goYnV0dG9uID0+IHRoaXMuZXhwYW5kSWNvblBhdGgoYnV0dG9uKSk7XG5cdFx0XHRcdFx0XHRcdGhhbmRsZXNUb0l0ZW1zLnNldChpdGVtLmhhbmRsZSwgaXRlbSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0cXVpY2tQaWNrLml0ZW1zID0gcGFyYW1zLml0ZW1zO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y2FzZSAnYWN0aXZlSXRlbXMnOlxuXHRcdFx0XHRcdHF1aWNrUGljay5hY3RpdmVJdGVtcyA9IHBhcmFtcy5hY3RpdmVJdGVtc1xuXHRcdFx0XHRcdFx0Py5tYXAoKGhhbmRsZTogbnVtYmVyKSA9PiBoYW5kbGVzVG9JdGVtcy5nZXQoaGFuZGxlKSlcblx0XHRcdFx0XHRcdC5maWx0ZXIoQm9vbGVhbik7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnc2VsZWN0ZWRJdGVtcyc6XG5cdFx0XHRcdFx0cXVpY2tQaWNrLnNlbGVjdGVkSXRlbXMgPSBwYXJhbXMuc2VsZWN0ZWRJdGVtc1xuXHRcdFx0XHRcdFx0Py5tYXAoKGhhbmRsZTogbnVtYmVyKSA9PiBoYW5kbGVzVG9JdGVtcy5nZXQoaGFuZGxlKSlcblx0XHRcdFx0XHRcdC5maWx0ZXIoQm9vbGVhbik7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnYnV0dG9ucyc6IHtcblx0XHRcdFx0XHRjb25zdCBidXR0b25zID0gW107XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBidXR0b24gb2YgcGFyYW1zLmJ1dHRvbnMhKSB7XG5cdFx0XHRcdFx0XHRpZiAoYnV0dG9uLmhhbmRsZSA9PT0gLTEpIHtcblx0XHRcdFx0XHRcdFx0YnV0dG9ucy5wdXNoKHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmJhY2tCdXR0b24pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5leHBhbmRJY29uUGF0aChidXR0b24pO1xuXHRcdFx0XHRcdFx0XHRidXR0b25zLnB1c2goYnV0dG9uKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aW5wdXQuYnV0dG9ucyA9IGJ1dHRvbnM7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0cywgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRcdFx0XHRcdChpbnB1dCBhcyBhbnkpW3BhcmFtXSA9IHBhcmFtc1twYXJhbV07XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdCRkaXNwb3NlKHNlc3Npb25JZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdHNlc3Npb24uc3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5zZXNzaW9ucy5kZWxldGUoc2Vzc2lvbklkKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqXG5cdCogRGVyaXZlcyBpY29uLCBsYWJlbCBhbmQgZGVzY3JpcHRpb24gZm9yIFF1aWNrIFBpY2sgaXRlbXMgdGhhdCByZXByZXNlbnQgYSByZXNvdXJjZSBVUkkuXG5cdCovXG5cdHByaXZhdGUgZXhwYW5kSXRlbVByb3BzKGl0ZW06IFRyYW5zZmVyUXVpY2tQaWNrSXRlbU9yU2VwYXJhdG9yKSB7XG5cdFx0aWYgKGl0ZW0udHlwZSA9PT0gJ3NlcGFyYXRvcicpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIWl0ZW0ucmVzb3VyY2VVcmkpIHtcblx0XHRcdHRoaXMuZXhwYW5kSWNvblBhdGgoaXRlbSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRGVyaXZlIG1pc3NpbmcgbGFiZWwgYW5kIGRlc2NyaXB0aW9uIGZyb20gcmVzb3VyY2VVcmkuXG5cdFx0Y29uc3QgcmVzb3VyY2VVcmkgPSBVUkkuZnJvbShpdGVtLnJlc291cmNlVXJpKTtcblx0XHRpdGVtLmxhYmVsID8/PSB0aGlzLmN1c3RvbUVkaXRvckxhYmVsU2VydmljZS5nZXROYW1lKHJlc291cmNlVXJpKSB8fCAnJztcblx0XHRpZiAoaXRlbS5sYWJlbCkge1xuXHRcdFx0aXRlbS5kZXNjcmlwdGlvbiA/Pz0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwocmVzb3VyY2VVcmksIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGl0ZW0ubGFiZWwgPSBiYXNlbmFtZU9yQXV0aG9yaXR5KHJlc291cmNlVXJpKTtcblx0XHRcdGl0ZW0uZGVzY3JpcHRpb24gPz89IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGRpcm5hbWUocmVzb3VyY2VVcmkpLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdC8vIERlcml2ZSBpY29uIHByb3BzIGZyb20gcmVzb3VyY2VVcmkgaWYgaWNvbiBpcyBzZXQgdG8gVGhlbWVJY29uLkZpbGUgb3IgVGhlbWVJY29uLkZvbGRlci5cblx0XHRjb25zdCBpY29uID0gaXRlbS5pY29uUGF0aER0bztcblx0XHRpZiAoVGhlbWVJY29uLmlzVGhlbWVJY29uKGljb24pICYmIChUaGVtZUljb24uaXNGaWxlKGljb24pIHx8IFRoZW1lSWNvbi5pc0ZvbGRlcihpY29uKSkpIHtcblx0XHRcdGNvbnN0IGZpbGVLaW5kID0gVGhlbWVJY29uLmlzRm9sZGVyKGljb24pIHx8IGhhc1RyYWlsaW5nUGF0aFNlcGFyYXRvcihyZXNvdXJjZVVyaSkgPyBGaWxlS2luZC5GT0xERVIgOiBGaWxlS2luZC5GSUxFO1xuXHRcdFx0Y29uc3QgaWNvbkNsYXNzZXMgPSBuZXcgTGF6eSgoKSA9PiBnZXRJY29uQ2xhc3Nlcyh0aGlzLm1vZGVsU2VydmljZSwgdGhpcy5sYW5ndWFnZVNlcnZpY2UsIHJlc291cmNlVXJpLCBmaWxlS2luZCkpO1xuXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGl0ZW0sICdpY29uQ2xhc3NlcycsIHsgZ2V0OiAoKSA9PiBpY29uQ2xhc3Nlcy52YWx1ZSB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5leHBhbmRJY29uUGF0aChpdGVtKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0KiBDb252ZXJ0cyBJY29uUGF0aCBEVE8gaW50byBpY29uUGF0aC9pY29uQ2xhc3MgcHJvcGVydGllcy5cblx0Ki9cblx0cHJpdmF0ZSBleHBhbmRJY29uUGF0aCh0YXJnZXQ6IFBpY2s8VHJhbnNmZXJRdWlja1BpY2tJdGVtLCAnaWNvblBhdGhEdG8nIHwgJ2ljb25QYXRoJyB8ICdpY29uQ2xhc3MnPikge1xuXHRcdGNvbnN0IGljb24gPSB0YXJnZXQuaWNvblBhdGhEdG87XG5cdFx0aWYgKCFpY29uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fSBlbHNlIGlmIChUaGVtZUljb24uaXNUaGVtZUljb24oaWNvbikpIHtcblx0XHRcdC8vIFRPRE86IFNpbmNlIElRdWlja1BpY2tJdGVtIGFuZCBJUXVpY2tJbnB1dEJ1dHRvbiBkbyBub3Qgc3VwcG9ydCBUaGVtZUljb24gZGlyZWN0bHksIHRoZSBjb2xvciBJRCBpcyBsb3N0IGhlcmUuXG5cdFx0XHQvLyBXZSBzaG91bGQgY29uc2lkZXIgY2hhbmdpbmcgY2hhbmdpbmcgaWNvblBhdGgvaWNvbkNsYXNzIHRvIEljb25QYXRoIGluIGJvdGggaW50ZXJmYWNlcy5cblx0XHRcdC8vIFJlcXVlc3QgZm9yIGNvbG9yIHN1cHBvcnQ6IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xODUzNTYuLlxuXHRcdFx0dGFyZ2V0Lmljb25DbGFzcyA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpY29uKTtcblx0XHR9IGVsc2UgaWYgKGlzVXJpQ29tcG9uZW50cyhpY29uKSkge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oaWNvbik7XG5cdFx0XHR0YXJnZXQuaWNvblBhdGggPSB7IGRhcms6IHVyaSwgbGlnaHQ6IHVyaSB9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB7IGRhcmssIGxpZ2h0IH0gPSBpY29uO1xuXHRcdFx0dGFyZ2V0Lmljb25QYXRoID0geyBkYXJrOiBVUkkuZnJvbShkYXJrKSwgbGlnaHQ6IFVSSS5mcm9tKGxpZ2h0KSB9O1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLFlBQVk7QUFDckIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxxQkFBcUIsU0FBUyxnQ0FBZ0M7QUFDdkUsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxpQkFBaUIsV0FBVztBQUNyQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQjtBQUM5QixTQUFtRCwwQkFBc0Q7QUFDekcsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyw0QkFBNkM7QUFDdEQsU0FBUyxnQkFBeUQsbUJBQW9KO0FBUy9NLElBQU0sc0JBQU4sTUFBOEQ7QUFBQSxFQVNwRSxZQUNDLGdCQUNvQixtQkFDWSxjQUNZLDBCQUNaLGNBQ0csaUJBQ2xDO0FBSitCO0FBQ1k7QUFDWjtBQUNHO0FBWHBDLFNBQWlCLFNBR1osQ0FBQztBQThGTjtBQUFBLFNBQVEsV0FBVyxvQkFBSSxJQUErQjtBQXBGckQsU0FBSyxTQUFTLGVBQWUsU0FBUyxlQUFlLGdCQUFnQjtBQUNyRSxTQUFLLHFCQUFxQjtBQUFBLEVBQzNCO0FBQUEsRUFFTyxVQUFnQjtBQUN0QixlQUFXLENBQUMsS0FBSyxPQUFPLEtBQUssS0FBSyxVQUFVO0FBQzNDLGNBQVEsTUFBTSxRQUFRO0FBQUEsSUFDdkI7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLFVBQWtCLFNBQThDLE9BQWtFO0FBQ3ZJLFVBQU0sV0FBVyxJQUFJLFFBQTRDLENBQUMsU0FBUyxXQUFXO0FBQ3JGLFdBQUssT0FBTyxRQUFRLElBQUksRUFBRSxTQUFTLE9BQU87QUFBQSxJQUMzQyxDQUFDO0FBRUQsY0FBVTtBQUFBLE1BQ1QsR0FBRztBQUFBLE1BQ0gsWUFBWSxRQUFNO0FBQ2pCLFlBQUksSUFBSTtBQUNQLGVBQUssT0FBTyxnQkFBZ0IsR0FBRyxNQUFNO0FBQUEsUUFDdEM7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFFBQUksUUFBUSxhQUFhO0FBQ3hCLGFBQU8sS0FBSyxtQkFBbUIsS0FBSyxVQUFVLFNBQWtDLEtBQUssRUFBRSxLQUFLLFdBQVM7QUFDcEcsWUFBSSxPQUFPO0FBQ1YsaUJBQU8sTUFBTSxJQUFJLFVBQVEsS0FBSyxNQUFNO0FBQUEsUUFDckM7QUFDQSxlQUFPO0FBQUEsTUFDUixDQUFDO0FBQUEsSUFDRixPQUFPO0FBQ04sYUFBTyxLQUFLLG1CQUFtQixLQUFLLFVBQVUsU0FBUyxLQUFLLEVBQUUsS0FBSyxVQUFRO0FBQzFFLFlBQUksTUFBTTtBQUNULGlCQUFPLEtBQUs7QUFBQSxRQUNiO0FBQ0EsZUFBTztBQUFBLE1BQ1IsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQUEsRUFFQSxVQUFVLFVBQWtCLE9BQTBEO0FBQ3JGLFFBQUksS0FBSyxPQUFPLFFBQVEsR0FBRztBQUMxQixZQUFNLFFBQVEsVUFBUSxLQUFLLGdCQUFnQixJQUFJLENBQUM7QUFDaEQsV0FBSyxPQUFPLFFBQVEsRUFBRSxRQUFRLEtBQUs7QUFDbkMsYUFBTyxLQUFLLE9BQU8sUUFBUTtBQUFBLElBQzVCO0FBQ0EsV0FBTyxRQUFRLFFBQVE7QUFBQSxFQUN4QjtBQUFBLEVBRUEsVUFBVSxVQUFrQixPQUE2QjtBQUN4RCxRQUFJLEtBQUssT0FBTyxRQUFRLEdBQUc7QUFDMUIsV0FBSyxPQUFPLFFBQVEsRUFBRSxPQUFPLEtBQUs7QUFDbEMsYUFBTyxLQUFLLE9BQU8sUUFBUTtBQUFBLElBQzVCO0FBQ0EsV0FBTyxRQUFRLFFBQVE7QUFBQSxFQUN4QjtBQUFBO0FBQUEsRUFJQSxPQUFPLFNBQXVDLGVBQXdCLE9BQXVEO0FBQzVILFVBQU0sZUFBOEIsdUJBQU8sT0FBTyxJQUFJO0FBRXRELFFBQUksU0FBUztBQUNaLG1CQUFhLFFBQVEsUUFBUTtBQUM3QixtQkFBYSxXQUFXLFFBQVE7QUFDaEMsbUJBQWEsY0FBYyxRQUFRO0FBQ25DLG1CQUFhLGlCQUFpQixRQUFRO0FBQ3RDLG1CQUFhLFNBQVMsUUFBUTtBQUM5QixtQkFBYSxRQUFRLFFBQVE7QUFDN0IsbUJBQWEsa0JBQWtCLFFBQVE7QUFBQSxJQUN4QztBQUVBLFFBQUksZUFBZTtBQUNsQixtQkFBYSxnQkFBZ0IsQ0FBQyxVQUFVO0FBQ3ZDLGVBQU8sS0FBSyxPQUFPLGVBQWUsS0FBSztBQUFBLE1BQ3hDO0FBQUEsSUFDRDtBQUVBLFdBQU8sS0FBSyxtQkFBbUIsTUFBTSxjQUFjLEtBQUs7QUFBQSxFQUN6RDtBQUFBLEVBTUEsZ0JBQWdCLFFBQTJDO0FBQzFELFVBQU0sWUFBWSxPQUFPO0FBQ3pCLFFBQUksVUFBVSxLQUFLLFNBQVMsSUFBSSxTQUFTO0FBQ3pDLFFBQUksQ0FBQyxTQUFTO0FBQ2IsWUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBQ2xDLFlBQU1BLFNBQVEsT0FBTyxTQUFTLGNBQWMsS0FBSyxtQkFBbUIsZ0JBQWdCLElBQUksS0FBSyxtQkFBbUIsZUFBZTtBQUMvSCxZQUFNLElBQUlBLE1BQUs7QUFDZixZQUFNLElBQUlBLE9BQU0sWUFBWSxNQUFNO0FBQ2pDLGFBQUssT0FBTyxhQUFhLFNBQVM7QUFBQSxNQUNuQyxDQUFDLENBQUM7QUFDRixZQUFNLElBQUlBLE9BQU0sbUJBQW1CLFlBQVU7QUFDNUMsYUFBSyxPQUFPLG9CQUFvQixXQUFZLE9BQW9DLFFBQVEsT0FBTyxRQUFRLE9BQU87QUFBQSxNQUMvRyxDQUFDLENBQUM7QUFDRixZQUFNLElBQUlBLE9BQU0saUJBQWlCLFdBQVM7QUFDekMsYUFBSyxPQUFPLGtCQUFrQixXQUFXLEtBQUs7QUFBQSxNQUMvQyxDQUFDLENBQUM7QUFDRixZQUFNLElBQUlBLE9BQU0sVUFBVSxNQUFNO0FBQy9CLGFBQUssT0FBTyxXQUFXLFNBQVM7QUFBQSxNQUNqQyxDQUFDLENBQUM7QUFFRixVQUFJLE9BQU8sU0FBUyxhQUFhO0FBRWhDLGNBQU1DLGFBQVlEO0FBQ2xCLGNBQU0sSUFBSUMsV0FBVSxrQkFBa0IsV0FBUztBQUM5QyxlQUFLLE9BQU8sbUJBQW1CLFdBQVcsTUFBTSxJQUFJLFVBQVMsS0FBK0IsTUFBTSxDQUFDO0FBQUEsUUFDcEcsQ0FBQyxDQUFDO0FBQ0YsY0FBTSxJQUFJQSxXQUFVLHFCQUFxQixXQUFTO0FBQ2pELGVBQUssT0FBTyxzQkFBc0IsV0FBVyxNQUFNLElBQUksVUFBUyxLQUErQixNQUFNLENBQUM7QUFBQSxRQUN2RyxDQUFDLENBQUM7QUFDRixjQUFNLElBQUlBLFdBQVUsdUJBQXVCLENBQUMsTUFBTTtBQUNqRCxnQkFBTSxpQkFBaUIsRUFBRTtBQUN6QixlQUFLLE9BQU87QUFBQSxZQUNYO0FBQUEsWUFDQyxFQUFFLEtBQStCO0FBQUEsWUFDbEMsZUFBZTtBQUFBLFlBQ2YsZUFBZSxRQUFRO0FBQUEsVUFDeEI7QUFBQSxRQUNELENBQUMsQ0FBQztBQUFBLE1BQ0g7QUFFQSxnQkFBVTtBQUFBLFFBQ1QsT0FBQUQ7QUFBQSxRQUNBLGdCQUFnQixvQkFBSSxJQUFJO0FBQUEsUUFDeEI7QUFBQSxNQUNEO0FBQ0EsV0FBSyxTQUFTLElBQUksV0FBVyxPQUFPO0FBQUEsSUFDckM7QUFFQSxVQUFNLEVBQUUsT0FBTyxlQUFlLElBQUk7QUFDbEMsVUFBTSxZQUFZO0FBQ2xCLGVBQVcsU0FBUyxRQUFRO0FBQzNCLGNBQVEsT0FBTztBQUFBLFFBQ2QsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUNKO0FBQUEsUUFFRCxLQUFLO0FBQ0osY0FBSSxPQUFPLFNBQVM7QUFDbkIsa0JBQU0sS0FBSztBQUFBLFVBQ1osT0FBTztBQUNOLGtCQUFNLEtBQUs7QUFBQSxVQUNaO0FBQ0E7QUFBQSxRQUVELEtBQUssU0FBUztBQUNiLHlCQUFlLE1BQU07QUFDckIsaUJBQU8sT0FBTyxRQUFRLENBQUMsU0FBMkM7QUFDakUsaUJBQUssZ0JBQWdCLElBQUk7QUFDekIsZ0JBQUksS0FBSyxTQUFTLGFBQWE7QUFDOUIsbUJBQUssU0FBUyxRQUFRLFlBQVUsS0FBSyxlQUFlLE1BQU0sQ0FBQztBQUMzRCw2QkFBZSxJQUFJLEtBQUssUUFBUSxJQUFJO0FBQUEsWUFDckM7QUFBQSxVQUNELENBQUM7QUFDRCxvQkFBVSxRQUFRLE9BQU87QUFDekI7QUFBQSxRQUNEO0FBQUEsUUFFQSxLQUFLO0FBQ0osb0JBQVUsY0FBYyxPQUFPLGFBQzVCLElBQUksQ0FBQyxXQUFtQixlQUFlLElBQUksTUFBTSxDQUFDLEVBQ25ELE9BQU8sT0FBTztBQUNoQjtBQUFBLFFBRUQsS0FBSztBQUNKLG9CQUFVLGdCQUFnQixPQUFPLGVBQzlCLElBQUksQ0FBQyxXQUFtQixlQUFlLElBQUksTUFBTSxDQUFDLEVBQ25ELE9BQU8sT0FBTztBQUNoQjtBQUFBLFFBRUQsS0FBSyxXQUFXO0FBQ2YsZ0JBQU0sVUFBVSxDQUFDO0FBQ2pCLHFCQUFXLFVBQVUsT0FBTyxTQUFVO0FBQ3JDLGdCQUFJLE9BQU8sV0FBVyxJQUFJO0FBQ3pCLHNCQUFRLEtBQUssS0FBSyxtQkFBbUIsVUFBVTtBQUFBLFlBQ2hELE9BQU87QUFDTixtQkFBSyxlQUFlLE1BQU07QUFDMUIsc0JBQVEsS0FBSyxNQUFNO0FBQUEsWUFDcEI7QUFBQSxVQUNEO0FBQ0EsZ0JBQU0sVUFBVTtBQUNoQjtBQUFBLFFBQ0Q7QUFBQSxRQUVBO0FBRUMsVUFBQyxNQUFjLEtBQUssSUFBSSxPQUFPLEtBQUs7QUFDcEM7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUNBLFdBQU8sUUFBUSxRQUFRLE1BQVM7QUFBQSxFQUNqQztBQUFBLEVBRUEsU0FBUyxXQUFrQztBQUMxQyxVQUFNLFVBQVUsS0FBSyxTQUFTLElBQUksU0FBUztBQUMzQyxRQUFJLFNBQVM7QUFDWixjQUFRLE1BQU0sUUFBUTtBQUN0QixXQUFLLFNBQVMsT0FBTyxTQUFTO0FBQUEsSUFDL0I7QUFDQSxXQUFPLFFBQVEsUUFBUSxNQUFTO0FBQUEsRUFDakM7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLGdCQUFnQixNQUF3QztBQUMvRCxRQUFJLEtBQUssU0FBUyxhQUFhO0FBQzlCO0FBQUEsSUFDRDtBQUVBLFFBQUksQ0FBQyxLQUFLLGFBQWE7QUFDdEIsV0FBSyxlQUFlLElBQUk7QUFDeEI7QUFBQSxJQUNEO0FBR0EsVUFBTSxjQUFjLElBQUksS0FBSyxLQUFLLFdBQVc7QUFDN0MsU0FBSyxVQUFVLEtBQUsseUJBQXlCLFFBQVEsV0FBVyxLQUFLO0FBQ3JFLFFBQUksS0FBSyxPQUFPO0FBQ2YsV0FBSyxnQkFBZ0IsS0FBSyxhQUFhLFlBQVksYUFBYSxFQUFFLFVBQVUsS0FBSyxDQUFDO0FBQUEsSUFDbkYsT0FBTztBQUNOLFdBQUssUUFBUSxvQkFBb0IsV0FBVztBQUM1QyxXQUFLLGdCQUFnQixLQUFLLGFBQWEsWUFBWSxRQUFRLFdBQVcsR0FBRyxFQUFFLFVBQVUsS0FBSyxDQUFDO0FBQUEsSUFDNUY7QUFHQSxVQUFNLE9BQU8sS0FBSztBQUNsQixRQUFJLFVBQVUsWUFBWSxJQUFJLE1BQU0sVUFBVSxPQUFPLElBQUksS0FBSyxVQUFVLFNBQVMsSUFBSSxJQUFJO0FBQ3hGLFlBQU0sV0FBVyxVQUFVLFNBQVMsSUFBSSxLQUFLLHlCQUF5QixXQUFXLElBQUksU0FBUyxTQUFTLFNBQVM7QUFDaEgsWUFBTSxjQUFjLElBQUksS0FBSyxNQUFNLGVBQWUsS0FBSyxjQUFjLEtBQUssaUJBQWlCLGFBQWEsUUFBUSxDQUFDO0FBQ2pILGFBQU8sZUFBZSxNQUFNLGVBQWUsRUFBRSxLQUFLLE1BQU0sWUFBWSxNQUFNLENBQUM7QUFBQSxJQUM1RSxPQUFPO0FBQ04sV0FBSyxlQUFlLElBQUk7QUFBQSxJQUN6QjtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLGVBQWUsUUFBK0U7QUFDckcsVUFBTSxPQUFPLE9BQU87QUFDcEIsUUFBSSxDQUFDLE1BQU07QUFDVjtBQUFBLElBQ0QsV0FBVyxVQUFVLFlBQVksSUFBSSxHQUFHO0FBSXZDLGFBQU8sWUFBWSxVQUFVLFlBQVksSUFBSTtBQUFBLElBQzlDLFdBQVcsZ0JBQWdCLElBQUksR0FBRztBQUNqQyxZQUFNLE1BQU0sSUFBSSxLQUFLLElBQUk7QUFDekIsYUFBTyxXQUFXLEVBQUUsTUFBTSxLQUFLLE9BQU8sSUFBSTtBQUFBLElBQzNDLE9BQU87QUFDTixZQUFNLEVBQUUsTUFBTSxNQUFNLElBQUk7QUFDeEIsYUFBTyxXQUFXLEVBQUUsTUFBTSxJQUFJLEtBQUssSUFBSSxHQUFHLE9BQU8sSUFBSSxLQUFLLEtBQUssRUFBRTtBQUFBLElBQ2xFO0FBQUEsRUFDRDtBQUNEO0FBdFJhLHNCQUFOO0FBQUEsRUFETixxQkFBcUIsWUFBWSxtQkFBbUI7QUFBQSxFQVlsRDtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWZVOyIsCiAgIm5hbWVzIjogWyJpbnB1dCIsICJxdWlja1BpY2siXQp9Cg==
