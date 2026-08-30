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
import { $ } from "../../../../../base/browser/dom.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { HoverPosition } from "../../../../../base/browser/ui/hover/hoverWidget.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { WorkbenchHoverDelegate } from "../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { QuickInputButtonLocation } from "../../../../../platform/quickinput/common/quickInput.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { BrowserViewCommandId } from "../../../../../platform/browserView/common/browserView.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import {
  BROWSER_EDITOR_ACTIVE,
  BrowserActionCategory,
  BrowserActionGroup,
  BrowserEditor,
  BrowserEditorContribution,
  BrowserWidgetLocation,
  CONTEXT_BROWSER_HAS_URL
} from "../browserEditor.js";
const CONTEXT_BROWSER_URL_IS_FAVORITED = new RawContextKey("browserUrlIsFavorited", false, localize("browser.urlIsFavorited", "Whether the current browser URL is a favorite"));
class FavoriteIndicator extends Disposable {
  constructor(instantiationService, _keybindingService) {
    super();
    this._keybindingService = _keybindingService;
    this._onDidClick = this._register(new Emitter());
    this.onDidClick = this._onDidClick.event;
    const hoverDelegate = this._register(instantiationService.createInstance(
      WorkbenchHoverDelegate,
      "element",
      void 0,
      { position: { hoverPosition: HoverPosition.ABOVE } }
    ));
    this.element = $(".browser-favorite-indicator-container");
    this.element.style.display = "none";
    this._button = this._register(new Button(this.element, {
      supportIcons: true,
      title: this._tooltip(),
      small: true,
      hoverDelegate
    }));
    this._button.element.classList.add("browser-favorite-indicator");
    this._button.label = `$(${Codicon.starFull.id})`;
    this._button.element.setAttribute("aria-label", localize("browser.removeFavorite", "Remove from Favorites"));
    this._register(this._button.onDidClick(() => this._onDidClick.fire()));
    this._register(this._keybindingService.onDidUpdateKeybindings(() => {
      this._button.setTitle(this._tooltip());
    }));
  }
  _tooltip() {
    const kb = this._keybindingService.lookupKeybinding(BrowserViewCommandId.ToggleFavorite)?.getLabel();
    return kb ? localize("browser.removeFavoriteWithKb", "Remove from Favorites ({0})", kb) : localize("browser.removeFavorite", "Remove from Favorites");
  }
  setVisible(visible) {
    this.element.style.display = visible ? "" : "none";
  }
}
let BrowserFavoritesFeature = class extends BrowserEditorContribution {
  constructor(editor, _storageService, instantiationService, contextKeyService, _keybindingService) {
    super(editor);
    this._storageService = _storageService;
    this._keybindingService = _keybindingService;
    this._onDidChangeState = this._register(new Emitter());
    this._urls = /* @__PURE__ */ new Set();
    this._load();
    this._isFavoriteContext = CONTEXT_BROWSER_URL_IS_FAVORITED.bindTo(contextKeyService);
    this._indicator = this._register(new FavoriteIndicator(instantiationService, this._keybindingService));
    this._register(this._indicator.onDidClick(() => this.toggleCurrent()));
    const storageListenerStore = this._register(new DisposableStore());
    this._register(this._storageService.onDidChangeValue(
      StorageScope.WORKSPACE,
      BrowserFavoritesFeature.STORAGE_KEY,
      storageListenerStore
    )(() => {
      this._load();
      this._refresh();
      this._onDidChangeState.fire();
    }));
    this._suggestionProvider = {
      label: localize("browser.favorites", "Favorites"),
      order: 50,
      actions: [],
      onDidChange: this._onDidChangeState.event,
      getSuggestions: async ({ input }) => {
        const suggestions = [];
        const current = input.url;
        for (const url of this._urls) {
          if (url === current) {
            continue;
          }
          const deleteAction = {
            id: "browser.favorites.delete",
            iconClass: ThemeIcon.asClassName(Codicon.trash),
            tooltip: localize("browser.removeFavorite", "Remove from Favorites"),
            run: () => this._remove(url)
          };
          suggestions.push({
            id: "favorite:" + url,
            label: url,
            icon: Codicon.star,
            apply: (target) => target.navigate(url),
            actions: [deleteAction]
          });
        }
        return suggestions;
      }
    };
    this._actionProvider = {
      onDidChange: this._onDidChangeState.event,
      getActions: (input) => {
        const url = input.url;
        if (!url) {
          return [];
        }
        const favorite = this._urls.has(url);
        const tooltip = favorite ? localize("browser.removeFavorite", "Remove from Favorites") : localize("browser.addFavorite", "Add to Favorites");
        const action = {
          id: "browser.toggleFavorite",
          iconClass: ThemeIcon.asClassName(favorite ? Codicon.starFull : Codicon.star),
          tooltip,
          alwaysVisible: true,
          toggle: { checked: favorite },
          location: QuickInputButtonLocation.Input,
          run: (target) => {
            const u = target.url;
            if (u) {
              this._toggle(u);
            }
          }
        };
        return [action];
      }
    };
  }
  get widgets() {
    return [{ location: BrowserWidgetLocation.PostUrl, element: this._indicator.element, order: 60 }];
  }
  get urlSuggestionProviders() {
    return [this._suggestionProvider];
  }
  get urlPickerActionProviders() {
    return [this._actionProvider];
  }
  onModelAttached(model, store) {
    store.add(model.onDidNavigate(() => {
      this._refresh();
      this._onDidChangeState.fire();
    }));
    this._refresh();
  }
  onModelDetached() {
    this._isFavoriteContext.reset();
    this._indicator.setVisible(false);
  }
  isFavorite(url) {
    return this._urls.has(url);
  }
  toggleCurrent() {
    const url = this.editor.model?.url;
    if (url) {
      this._toggle(url);
    }
  }
  _refresh() {
    const url = this.editor.model?.url ?? "";
    const favorite = !!url && this._urls.has(url);
    this._isFavoriteContext.set(favorite);
    this._indicator.setVisible(favorite);
  }
  _load() {
    const raw = this._storageService.get(BrowserFavoritesFeature.STORAGE_KEY, StorageScope.WORKSPACE);
    if (!raw) {
      this._urls = /* @__PURE__ */ new Set();
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      this._urls = new Set(
        Array.isArray(parsed) ? parsed.filter((u) => typeof u === "string") : []
      );
    } catch {
      this._urls = /* @__PURE__ */ new Set();
    }
  }
  _toggle(url) {
    if (this._urls.has(url)) {
      this._urls.delete(url);
    } else {
      this._urls.add(url);
    }
    this._storageService.store(
      BrowserFavoritesFeature.STORAGE_KEY,
      JSON.stringify([...this._urls]),
      StorageScope.WORKSPACE,
      StorageTarget.USER
    );
    this._refresh();
    this._onDidChangeState.fire();
  }
  // Idempotent: callers that should never re-add a favorite (e.g. the per-item
  // delete button on suggestions) must use this rather than `_toggle`.
  _remove(url) {
    if (!this._urls.has(url)) {
      return;
    }
    this._urls.delete(url);
    this._storageService.store(
      BrowserFavoritesFeature.STORAGE_KEY,
      JSON.stringify([...this._urls]),
      StorageScope.WORKSPACE,
      StorageTarget.USER
    );
    this._refresh();
    this._onDidChangeState.fire();
  }
};
BrowserFavoritesFeature.STORAGE_KEY = "workbench.browser.favorites";
BrowserFavoritesFeature = __decorateClass([
  __decorateParam(1, IStorageService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IKeybindingService)
], BrowserFavoritesFeature);
BrowserEditor.registerContribution(BrowserFavoritesFeature);
const _ToggleFavoriteAction = class _ToggleFavoriteAction extends Action2 {
  constructor() {
    super({
      id: _ToggleFavoriteAction.ID,
      title: localize2("browser.addFavoriteAction", "Add to Favorites"),
      category: BrowserActionCategory,
      icon: Codicon.star,
      f1: true,
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL),
      toggled: {
        condition: CONTEXT_BROWSER_URL_IS_FAVORITED,
        icon: Codicon.starFull
      },
      menu: {
        id: MenuId.BrowserActionsToolbar,
        group: BrowserActionGroup.Data,
        order: 2,
        isHiddenByDefault: true
      },
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL),
        primary: KeyMod.CtrlCmd | KeyCode.KeyD
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      browserEditor.getContribution(BrowserFavoritesFeature)?.toggleCurrent();
    }
  }
};
_ToggleFavoriteAction.ID = BrowserViewCommandId.ToggleFavorite;
let ToggleFavoriteAction = _ToggleFavoriteAction;
registerAction2(ToggleFavoriteAction);
export {
  BrowserFavoritesFeature
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFxmZWF0dXJlc1xcYnJvd3NlckZhdm9yaXRlc0ZlYXR1cmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7ICQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBIb3ZlclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFF1aWNrSW5wdXRCdXR0b25Mb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IEJyb3dzZXJWaWV3Q29tbWFuZElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElCcm93c2VyVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7XG5cdEJST1dTRVJfRURJVE9SX0FDVElWRSxcblx0QnJvd3NlckFjdGlvbkNhdGVnb3J5LFxuXHRCcm93c2VyQWN0aW9uR3JvdXAsXG5cdEJyb3dzZXJFZGl0b3IsXG5cdEJyb3dzZXJFZGl0b3JDb250cmlidXRpb24sXG5cdEJyb3dzZXJXaWRnZXRMb2NhdGlvbixcblx0Q09OVEVYVF9CUk9XU0VSX0hBU19VUkwsXG5cdElCcm93c2VyRWRpdG9yV2lkZ2V0LFxuXHRJQnJvd3NlclVybFBpY2tlckFjdGlvbixcblx0SUJyb3dzZXJVcmxQaWNrZXJBY3Rpb25Qcm92aWRlcixcblx0SUJyb3dzZXJVcmxTdWdnZXN0aW9uLFxuXHRJQnJvd3NlclVybFN1Z2dlc3Rpb25BY3Rpb24sXG5cdElCcm93c2VyVXJsU3VnZ2VzdGlvblByb3ZpZGVyLFxufSBmcm9tICcuLi9icm93c2VyRWRpdG9yLmpzJztcblxuY29uc3QgQ09OVEVYVF9CUk9XU0VSX1VSTF9JU19GQVZPUklURUQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignYnJvd3NlclVybElzRmF2b3JpdGVkJywgZmFsc2UsIGxvY2FsaXplKCdicm93c2VyLnVybElzRmF2b3JpdGVkJywgXCJXaGV0aGVyIHRoZSBjdXJyZW50IGJyb3dzZXIgVVJMIGlzIGEgZmF2b3JpdGVcIikpO1xuXG4vKipcbiAqIENsaWNrYWJsZSBzdGFyIGluZGljYXRvciBzaG93biBpbiB0aGUgVVJMIGJhcidzIFBvc3RVcmwgc2xvdCB3aGVuIHRoZVxuICogY3VycmVudCBwYWdlIGlzIGEgZmF2b3JpdGUuIENsaWNraW5nIGl0IHJlbW92ZXMgdGhlIGZhdm9yaXRlLlxuICovXG5jbGFzcyBGYXZvcml0ZUluZGljYXRvciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfYnV0dG9uOiBCdXR0b247XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xpY2sgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDbGljayA9IHRoaXMuX29uRGlkQ2xpY2suZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IGhvdmVyRGVsZWdhdGUgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdvcmtiZW5jaEhvdmVyRGVsZWdhdGUsXG5cdFx0XHQnZWxlbWVudCcsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7IHBvc2l0aW9uOiB7IGhvdmVyUG9zaXRpb246IEhvdmVyUG9zaXRpb24uQUJPVkUgfSB9XG5cdFx0KSk7XG5cblx0XHR0aGlzLmVsZW1lbnQgPSAkKCcuYnJvd3Nlci1mYXZvcml0ZS1pbmRpY2F0b3ItY29udGFpbmVyJyk7XG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5fYnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbih0aGlzLmVsZW1lbnQsIHtcblx0XHRcdHN1cHBvcnRJY29uczogdHJ1ZSxcblx0XHRcdHRpdGxlOiB0aGlzLl90b29sdGlwKCksXG5cdFx0XHRzbWFsbDogdHJ1ZSxcblx0XHRcdGhvdmVyRGVsZWdhdGVcblx0XHR9KSk7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnYnJvd3Nlci1mYXZvcml0ZS1pbmRpY2F0b3InKTtcblx0XHR0aGlzLl9idXR0b24ubGFiZWwgPSBgJCgke0NvZGljb24uc3RhckZ1bGwuaWR9KWA7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2Jyb3dzZXIucmVtb3ZlRmF2b3JpdGUnLCBcIlJlbW92ZSBmcm9tIEZhdm9yaXRlc1wiKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5fb25EaWRDbGljay5maXJlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9rZXliaW5kaW5nU2VydmljZS5vbkRpZFVwZGF0ZUtleWJpbmRpbmdzKCgpID0+IHtcblx0XHRcdHRoaXMuX2J1dHRvbi5zZXRUaXRsZSh0aGlzLl90b29sdGlwKCkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3Rvb2x0aXAoKTogc3RyaW5nIHtcblx0XHRjb25zdCBrYiA9IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoQnJvd3NlclZpZXdDb21tYW5kSWQuVG9nZ2xlRmF2b3JpdGUpPy5nZXRMYWJlbCgpO1xuXHRcdHJldHVybiBrYlxuXHRcdFx0PyBsb2NhbGl6ZSgnYnJvd3Nlci5yZW1vdmVGYXZvcml0ZVdpdGhLYicsIFwiUmVtb3ZlIGZyb20gRmF2b3JpdGVzICh7MH0pXCIsIGtiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnYnJvd3Nlci5yZW1vdmVGYXZvcml0ZScsIFwiUmVtb3ZlIGZyb20gRmF2b3JpdGVzXCIpO1xuXHR9XG5cblx0c2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSB2aXNpYmxlID8gJycgOiAnbm9uZSc7XG5cdH1cbn1cblxuLyoqXG4gKiBXb3Jrc3BhY2Utc2NvcGVkIGZhdm9yaXRlczogcGVyc2lzdHMgYSBzZXQgb2YgZmF2b3JpdGUgVVJMcyBhbmQgc3VyZmFjZXNcbiAqIHRoZW0gYXMgVVJMIGJhciBzdWdnZXN0aW9ucyBwbHVzIGEgdG9nZ2xlIGJ1dHRvbiBpbiB0aGUgcGlja2VyIGNocm9tZS5cbiAqXG4gKiBGYXZvcml0ZXMgYXJlIFVSTCBzdHJpbmdzIG9ubHkgXHUyMDE0IG5vIHRpdGxlcywgaWNvbnMsIG9yIG90aGVyIG1ldGFkYXRhIGFyZVxuICogcGVyc2lzdGVkLiBXZSBjYW4ndCByZWxpYWJseSBjYXB0dXJlIHJpY2ggbWV0YWRhdGEgZm9yIGFyYml0cmFyeSBwYWdlc1xuICogYWNyb3NzIHJlbG9hZHMsIGFuZCBrZWVwaW5nIHRoZSBtb2RlbCBzaW1wbGUgYXZvaWRzIHN0YWxlLWRpc3BsYXkgYnVncy5cbiAqL1xuZXhwb3J0IGNsYXNzIEJyb3dzZXJGYXZvcml0ZXNGZWF0dXJlIGV4dGVuZHMgQnJvd3NlckVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU1RPUkFHRV9LRVkgPSAnd29ya2JlbmNoLmJyb3dzZXIuZmF2b3JpdGVzJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVN0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHByaXZhdGUgX3VybHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdWdnZXN0aW9uUHJvdmlkZXI6IElCcm93c2VyVXJsU3VnZ2VzdGlvblByb3ZpZGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3Rpb25Qcm92aWRlcjogSUJyb3dzZXJVcmxQaWNrZXJBY3Rpb25Qcm92aWRlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5kaWNhdG9yOiBGYXZvcml0ZUluZGljYXRvcjtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNGYXZvcml0ZUNvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogQnJvd3NlckVkaXRvcixcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGVkaXRvcik7XG5cdFx0dGhpcy5fbG9hZCgpO1xuXHRcdHRoaXMuX2lzRmF2b3JpdGVDb250ZXh0ID0gQ09OVEVYVF9CUk9XU0VSX1VSTF9JU19GQVZPUklURUQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX2luZGljYXRvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBGYXZvcml0ZUluZGljYXRvcihpbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbmRpY2F0b3Iub25EaWRDbGljaygoKSA9PiB0aGlzLnRvZ2dsZUN1cnJlbnQoKSkpO1xuXG5cdFx0Ly8gUmVhY3QgdG8gZXh0ZXJuYWwgc3RvcmFnZSB1cGRhdGVzIChlLmcuIGFub3RoZXIgd2luZG93IHdyaXRpbmcgdGhlIGtleSkuXG5cdFx0Y29uc3Qgc3RvcmFnZUxpc3RlbmVyU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoXG5cdFx0XHRTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBCcm93c2VyRmF2b3JpdGVzRmVhdHVyZS5TVE9SQUdFX0tFWSwgc3RvcmFnZUxpc3RlbmVyU3RvcmUsXG5cdFx0KSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9sb2FkKCk7XG5cdFx0XHR0aGlzLl9yZWZyZXNoKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmZpcmUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9zdWdnZXN0aW9uUHJvdmlkZXIgPSB7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2Jyb3dzZXIuZmF2b3JpdGVzJywgXCJGYXZvcml0ZXNcIiksXG5cdFx0XHRvcmRlcjogNTAsXG5cdFx0XHRhY3Rpb25zOiBbXSxcblx0XHRcdG9uRGlkQ2hhbmdlOiB0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmV2ZW50LFxuXHRcdFx0Z2V0U3VnZ2VzdGlvbnM6IGFzeW5jICh7IGlucHV0IH0pID0+IHtcblx0XHRcdFx0Y29uc3Qgc3VnZ2VzdGlvbnM6IElCcm93c2VyVXJsU3VnZ2VzdGlvbltdID0gW107XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnQgPSBpbnB1dC51cmw7XG5cdFx0XHRcdGZvciAoY29uc3QgdXJsIG9mIHRoaXMuX3VybHMpIHtcblx0XHRcdFx0XHRpZiAodXJsID09PSBjdXJyZW50KSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgZGVsZXRlQWN0aW9uOiBJQnJvd3NlclVybFN1Z2dlc3Rpb25BY3Rpb24gPSB7XG5cdFx0XHRcdFx0XHRpZDogJ2Jyb3dzZXIuZmF2b3JpdGVzLmRlbGV0ZScsXG5cdFx0XHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnRyYXNoKSxcblx0XHRcdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdicm93c2VyLnJlbW92ZUZhdm9yaXRlJywgXCJSZW1vdmUgZnJvbSBGYXZvcml0ZXNcIiksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMuX3JlbW92ZSh1cmwpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRpZDogJ2Zhdm9yaXRlOicgKyB1cmwsXG5cdFx0XHRcdFx0XHRsYWJlbDogdXJsLFxuXHRcdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5zdGFyLFxuXHRcdFx0XHRcdFx0YXBwbHk6IHRhcmdldCA9PiB0YXJnZXQubmF2aWdhdGUodXJsKSxcblx0XHRcdFx0XHRcdGFjdGlvbnM6IFtkZWxldGVBY3Rpb25dLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBzdWdnZXN0aW9ucztcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdHRoaXMuX2FjdGlvblByb3ZpZGVyID0ge1xuXHRcdFx0b25EaWRDaGFuZ2U6IHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZXZlbnQsXG5cdFx0XHRnZXRBY3Rpb25zOiBpbnB1dCA9PiB7XG5cdFx0XHRcdGNvbnN0IHVybCA9IGlucHV0LnVybDtcblx0XHRcdFx0aWYgKCF1cmwpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZmF2b3JpdGUgPSB0aGlzLl91cmxzLmhhcyh1cmwpO1xuXHRcdFx0XHRjb25zdCB0b29sdGlwID0gZmF2b3JpdGVcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdicm93c2VyLnJlbW92ZUZhdm9yaXRlJywgXCJSZW1vdmUgZnJvbSBGYXZvcml0ZXNcIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdicm93c2VyLmFkZEZhdm9yaXRlJywgXCJBZGQgdG8gRmF2b3JpdGVzXCIpO1xuXHRcdFx0XHRjb25zdCBhY3Rpb246IElCcm93c2VyVXJsUGlja2VyQWN0aW9uID0ge1xuXHRcdFx0XHRcdGlkOiAnYnJvd3Nlci50b2dnbGVGYXZvcml0ZScsXG5cdFx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoZmF2b3JpdGUgPyBDb2RpY29uLnN0YXJGdWxsIDogQ29kaWNvbi5zdGFyKSxcblx0XHRcdFx0XHR0b29sdGlwLFxuXHRcdFx0XHRcdGFsd2F5c1Zpc2libGU6IHRydWUsXG5cdFx0XHRcdFx0dG9nZ2xlOiB7IGNoZWNrZWQ6IGZhdm9yaXRlIH0sXG5cdFx0XHRcdFx0bG9jYXRpb246IFF1aWNrSW5wdXRCdXR0b25Mb2NhdGlvbi5JbnB1dCxcblx0XHRcdFx0XHRydW46IHRhcmdldCA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCB1ID0gdGFyZ2V0LnVybDtcblx0XHRcdFx0XHRcdGlmICh1KSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3RvZ2dsZSh1KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRyZXR1cm4gW2FjdGlvbl07XG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgd2lkZ2V0cygpOiByZWFkb25seSBJQnJvd3NlckVkaXRvcldpZGdldFtdIHtcblx0XHRyZXR1cm4gW3sgbG9jYXRpb246IEJyb3dzZXJXaWRnZXRMb2NhdGlvbi5Qb3N0VXJsLCBlbGVtZW50OiB0aGlzLl9pbmRpY2F0b3IuZWxlbWVudCwgb3JkZXI6IDYwIH1dO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IHVybFN1Z2dlc3Rpb25Qcm92aWRlcnMoKTogcmVhZG9ubHkgSUJyb3dzZXJVcmxTdWdnZXN0aW9uUHJvdmlkZXJbXSB7XG5cdFx0cmV0dXJuIFt0aGlzLl9zdWdnZXN0aW9uUHJvdmlkZXJdO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IHVybFBpY2tlckFjdGlvblByb3ZpZGVycygpOiByZWFkb25seSBJQnJvd3NlclVybFBpY2tlckFjdGlvblByb3ZpZGVyW10ge1xuXHRcdHJldHVybiBbdGhpcy5fYWN0aW9uUHJvdmlkZXJdO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIG9uTW9kZWxBdHRhY2hlZChtb2RlbDogSUJyb3dzZXJWaWV3TW9kZWwsIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiB2b2lkIHtcblx0XHQvLyBCdXR0b24gdmlzdWFscywgaW5kaWNhdG9yIHZpc2liaWxpdHksIGFuZCBjb250ZXh0IGtleSBkZXBlbmQgb24gaW5wdXQudXJsLlxuXHRcdHN0b3JlLmFkZChtb2RlbC5vbkRpZE5hdmlnYXRlKCgpID0+IHtcblx0XHRcdHRoaXMuX3JlZnJlc2goKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZmlyZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWZyZXNoKCk7XG5cdH1cblxuXHRvdmVycmlkZSBvbk1vZGVsRGV0YWNoZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNGYXZvcml0ZUNvbnRleHQucmVzZXQoKTtcblx0XHR0aGlzLl9pbmRpY2F0b3Iuc2V0VmlzaWJsZShmYWxzZSk7XG5cdH1cblxuXHRpc0Zhdm9yaXRlKHVybDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3VybHMuaGFzKHVybCk7XG5cdH1cblxuXHR0b2dnbGVDdXJyZW50KCk6IHZvaWQge1xuXHRcdGNvbnN0IHVybCA9IHRoaXMuZWRpdG9yLm1vZGVsPy51cmw7XG5cdFx0aWYgKHVybCkge1xuXHRcdFx0dGhpcy5fdG9nZ2xlKHVybCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVmcmVzaCgpOiB2b2lkIHtcblx0XHRjb25zdCB1cmwgPSB0aGlzLmVkaXRvci5tb2RlbD8udXJsID8/ICcnO1xuXHRcdGNvbnN0IGZhdm9yaXRlID0gISF1cmwgJiYgdGhpcy5fdXJscy5oYXModXJsKTtcblx0XHR0aGlzLl9pc0Zhdm9yaXRlQ29udGV4dC5zZXQoZmF2b3JpdGUpO1xuXHRcdHRoaXMuX2luZGljYXRvci5zZXRWaXNpYmxlKGZhdm9yaXRlKTtcblx0fVxuXG5cdHByaXZhdGUgX2xvYWQoKTogdm9pZCB7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KEJyb3dzZXJGYXZvcml0ZXNGZWF0dXJlLlNUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRpZiAoIXJhdykge1xuXHRcdFx0dGhpcy5fdXJscyA9IG5ldyBTZXQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcnNlZDogdW5rbm93biA9IEpTT04ucGFyc2UocmF3KTtcblx0XHRcdHRoaXMuX3VybHMgPSBuZXcgU2V0KFxuXHRcdFx0XHRBcnJheS5pc0FycmF5KHBhcnNlZCkgPyBwYXJzZWQuZmlsdGVyKCh1KTogdSBpcyBzdHJpbmcgPT4gdHlwZW9mIHUgPT09ICdzdHJpbmcnKSA6IFtdXG5cdFx0XHQpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0dGhpcy5fdXJscyA9IG5ldyBTZXQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF90b2dnbGUodXJsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdXJscy5oYXModXJsKSkge1xuXHRcdFx0dGhpcy5fdXJscy5kZWxldGUodXJsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdXJscy5hZGQodXJsKTtcblx0XHR9XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoXG5cdFx0XHRCcm93c2VyRmF2b3JpdGVzRmVhdHVyZS5TVE9SQUdFX0tFWSxcblx0XHRcdEpTT04uc3RyaW5naWZ5KFsuLi50aGlzLl91cmxzXSksXG5cdFx0XHRTdG9yYWdlU2NvcGUuV09SS1NQQUNFLFxuXHRcdFx0U3RvcmFnZVRhcmdldC5VU0VSLFxuXHRcdCk7XG5cdFx0dGhpcy5fcmVmcmVzaCgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZmlyZSgpO1xuXHR9XG5cblx0Ly8gSWRlbXBvdGVudDogY2FsbGVycyB0aGF0IHNob3VsZCBuZXZlciByZS1hZGQgYSBmYXZvcml0ZSAoZS5nLiB0aGUgcGVyLWl0ZW1cblx0Ly8gZGVsZXRlIGJ1dHRvbiBvbiBzdWdnZXN0aW9ucykgbXVzdCB1c2UgdGhpcyByYXRoZXIgdGhhbiBgX3RvZ2dsZWAuXG5cdHByaXZhdGUgX3JlbW92ZSh1cmw6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fdXJscy5oYXModXJsKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl91cmxzLmRlbGV0ZSh1cmwpO1xuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKFxuXHRcdFx0QnJvd3NlckZhdm9yaXRlc0ZlYXR1cmUuU1RPUkFHRV9LRVksXG5cdFx0XHRKU09OLnN0cmluZ2lmeShbLi4udGhpcy5fdXJsc10pLFxuXHRcdFx0U3RvcmFnZVNjb3BlLldPUktTUEFDRSxcblx0XHRcdFN0b3JhZ2VUYXJnZXQuVVNFUixcblx0XHQpO1xuXHRcdHRoaXMuX3JlZnJlc2goKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmZpcmUoKTtcblx0fVxufVxuXG5Ccm93c2VyRWRpdG9yLnJlZ2lzdGVyQ29udHJpYnV0aW9uKEJyb3dzZXJGYXZvcml0ZXNGZWF0dXJlKTtcblxuLy8gLS0gQWN0aW9ucyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmNsYXNzIFRvZ2dsZUZhdm9yaXRlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9IEJyb3dzZXJWaWV3Q29tbWFuZElkLlRvZ2dsZUZhdm9yaXRlO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUb2dnbGVGYXZvcml0ZUFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Jyb3dzZXIuYWRkRmF2b3JpdGVBY3Rpb24nLCAnQWRkIHRvIEZhdm9yaXRlcycpLFxuXHRcdFx0Y2F0ZWdvcnk6IEJyb3dzZXJBY3Rpb25DYXRlZ29yeSxcblx0XHRcdGljb246IENvZGljb24uc3Rhcixcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQlJPV1NFUl9FRElUT1JfQUNUSVZFLCBDT05URVhUX0JST1dTRVJfSEFTX1VSTCksXG5cdFx0XHR0b2dnbGVkOiB7XG5cdFx0XHRcdGNvbmRpdGlvbjogQ09OVEVYVF9CUk9XU0VSX1VSTF9JU19GQVZPUklURUQsXG5cdFx0XHRcdGljb246IENvZGljb24uc3RhckZ1bGwsXG5cdFx0XHR9LFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkJyb3dzZXJBY3Rpb25zVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6IEJyb3dzZXJBY3Rpb25Hcm91cC5EYXRhLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0aXNIaWRkZW5CeURlZmF1bHQ6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEJST1dTRVJfRURJVE9SX0FDVElWRSwgQ09OVEVYVF9CUk9XU0VSX0hBU19VUkwpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5RCxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYnJvd3NlckVkaXRvciA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChicm93c2VyRWRpdG9yIGluc3RhbmNlb2YgQnJvd3NlckVkaXRvcikge1xuXHRcdFx0YnJvd3NlckVkaXRvci5nZXRDb250cmlidXRpb24oQnJvd3NlckZhdm9yaXRlc0ZlYXR1cmUpPy50b2dnbGVDdXJyZW50KCk7XG5cdFx0fVxuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihUb2dnbGVGYXZvcml0ZUFjdGlvbik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxTQUFTO0FBQ2xCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxTQUFTLFFBQVEsdUJBQXVCO0FBQ2pELFNBQVMsZ0JBQTZCLG9CQUFvQixxQkFBcUI7QUFDL0UsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxzQkFBc0I7QUFFL0I7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FPTTtBQUVQLE1BQU0sbUNBQW1DLElBQUksY0FBdUIseUJBQXlCLE9BQU8sU0FBUywwQkFBMEIsK0NBQStDLENBQUM7QUFNdkwsTUFBTSwwQkFBMEIsV0FBVztBQUFBLEVBTTFDLFlBQ0Msc0JBQ2lCLG9CQUNoQjtB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
