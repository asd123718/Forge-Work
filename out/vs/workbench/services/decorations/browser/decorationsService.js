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
import { Emitter, DebounceEmitter } from "../../../../base/common/event.js";
import { IDecorationsService } from "../common/decorations.js";
import { TernarySearchTree } from "../../../../base/common/ternarySearchTree.js";
import { toDisposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { isThenable } from "../../../../base/common/async.js";
import { LinkedList } from "../../../../base/common/linkedList.js";
import { createStyleSheet, createCSSRule, removeCSSRulesContainingSelector } from "../../../../base/browser/domStylesheets.js";
import * as cssValue from "../../../../base/browser/cssValue.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { isFalsyOrWhitespace } from "../../../../base/common/strings.js";
import { localize } from "../../../../nls.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { hash } from "../../../../base/common/hash.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { asArray, distinct } from "../../../../base/common/arrays.js";
import { asCssVariable, asCssVariableWithDefault } from "../../../../platform/theme/common/colorRegistry.js";
import { getIconRegistry } from "../../../../platform/theme/common/iconRegistry.js";
const _DecorationRule = class _DecorationRule {
  constructor(themeService, data, key) {
    this.themeService = themeService;
    this._refCounter = 0;
    this.data = data;
    const suffix = hash(key).toString(36);
    this.itemColorClassName = `${_DecorationRule._classNamesPrefix}-itemColor-${suffix}`;
    this.itemBadgeClassName = `${_DecorationRule._classNamesPrefix}-itemBadge-${suffix}`;
    this.bubbleBadgeClassName = `${_DecorationRule._classNamesPrefix}-bubbleBadge-${suffix}`;
    this.iconBadgeClassName = `${_DecorationRule._classNamesPrefix}-iconBadge-${suffix}`;
  }
  static keyOf(data) {
    if (Array.isArray(data)) {
      return data.map(_DecorationRule.keyOf).join(",");
    } else {
      const { color, letter } = data;
      if (ThemeIcon.isThemeIcon(letter)) {
        return `${color}+${letter.id}`;
      } else {
        return `${color}/${letter}`;
      }
    }
  }
  acquire() {
    this._refCounter += 1;
  }
  release() {
    return --this._refCounter === 0;
  }
  appendCSSRules(element) {
    if (!Array.isArray(this.data)) {
      this._appendForOne(this.data, element);
    } else {
      this._appendForMany(this.data, element);
    }
  }
  _appendForOne(data, element) {
    const { color, letter } = data;
    createCSSRule(`.${this.itemColorClassName}`, `color: ${getColor(color)};`, element);
    if (ThemeIcon.isThemeIcon(letter)) {
      this._createIconCSSRule(letter, getColor(color), element);
    } else if (letter) {
      createCSSRule(`.${this.itemBadgeClassName}::after`, `content: "${letter}"; color: ${getColor(color)};`, element);
    }
  }
  _appendForMany(data, element) {
    const color = data.reduceRight((fallback, decoration) => decoration.color ? asCssVariableWithDefault(decoration.color, fallback) : fallback, "inherit");
    createCSSRule(`.${this.itemColorClassName}`, `color: ${color};`, element);
    const letters = [];
    let icon;
    for (const d of data) {
      if (ThemeIcon.isThemeIcon(d.letter)) {
        icon = d.letter;
        break;
      } else if (d.letter) {
        letters.push(d.letter);
      }
    }
    if (icon) {
      this._createIconCSSRule(icon, color, element);
    } else {
      if (letters.length) {
        createCSSRule(`.${this.itemBadgeClassName}::after`, `content: "${letters.join(", ")}"; color: ${color};`, element);
      }
      createCSSRule(
        `.${this.bubbleBadgeClassName}::after`,
        `content: "\uEA71"; color: ${color}; font-family: codicon; font-size: 14px; margin-right: 14px; opacity: 0.4;`,
        element
      );
    }
  }
  _createIconCSSRule(icon, color, element) {
    const modifier = ThemeIcon.getModifier(icon);
    if (modifier) {
      icon = ThemeIcon.modify(icon, void 0);
    }
    const iconContribution = getIconRegistry().getIcon(icon.id);
    if (!iconContribution) {
      return;
    }
    const definition = this.themeService.getProductIconTheme().getIcon(iconContribution);
    if (!definition) {
      return;
    }
    createCSSRule(
      `.${this.iconBadgeClassName}::after`,
      `content: '${definition.fontCharacter}';
			color: ${icon.color ? getColor(icon.color.id) : color};
			font-family: ${cssValue.stringValue(definition.font?.id ?? "codicon")};
			font-size: 16px;
			margin-right: 14px;
			font-weight: normal;
			${modifier === "spin" ? "animation: codicon-spin 1.5s steps(30) infinite; font-style: normal !important; transform-origin: center center;" : ""};
			`,
      element
    );
  }
  removeCSSRules(element) {
    removeCSSRulesContainingSelector(this.itemColorClassName, element);
    removeCSSRulesContainingSelector(this.itemBadgeClassName, element);
    removeCSSRulesContainingSelector(this.bubbleBadgeClassName, element);
    removeCSSRulesContainingSelector(this.iconBadgeClassName, element);
  }
};
_DecorationRule._classNamesPrefix = "monaco-decoration";
let DecorationRule = _DecorationRule;
class DecorationStyles {
  constructor(_themeService) {
    this._themeService = _themeService;
    this._dispoables = new DisposableStore();
    this._styleElement = createStyleSheet(void 0, void 0, this._dispoables);
    this._decorationRules = /* @__PURE__ */ new Map();
  }
  dispose() {
    this._dispoables.dispose();
  }
  asDecoration(data, onlyChildren) {
    data.sort((a, b) => (b.weight || 0) - (a.weight || 0));
    const key = DecorationRule.keyOf(data);
    let rule = this._decorationRules.get(key);
    if (!rule) {
      rule = new DecorationRule(this._themeService, data, key);
      this._decorationRules.set(key, rule);
      rule.appendCSSRules(this._styleElement);
    }
    rule.acquire();
    const labelClassName = rule.itemColorClassName;
    let badgeClassName = rule.itemBadgeClassName;
    const iconClassName = rule.iconBadgeClassName;
    let tooltip = distinct(data.filter((d) => !isFalsyOrWhitespace(d.tooltip)).map((d) => d.tooltip)).join(" \u2022 ");
    const strikethrough = data.some((d) => d.strikethrough);
    if (onlyChildren) {
      badgeClassName = rule.bubbleBadgeClassName;
      tooltip = localize("bubbleTitle", "Contains emphasized items");
    }
    return {
      labelClassName,
      badgeClassName,
      iconClassName,
      strikethrough,
      tooltip,
      dispose: () => {
        if (rule?.release()) {
          this._decorationRules.delete(key);
          rule.removeCSSRules(this._styleElement);
          rule = void 0;
        }
      }
    };
  }
}
class FileDecorationChangeEvent {
  // events ignore all path casings
  constructor(all) {
    this._data = TernarySearchTree.forUris((_uri) => true);
    this._data.fill(true, asArray(all));
  }
  affectsResource(uri) {
    return this._data.hasElementOrSubtree(uri);
  }
}
class DecorationDataRequest {
  constructor(source, thenable) {
    this.source = source;
    this.thenable = thenable;
  }
}
function getColor(color) {
  return color ? asCssVariable(color) : "inherit";
}
let DecorationsService = class {
  constructor(uriIdentityService, themeService) {
    this._store = new DisposableStore();
    this._onDidChangeDecorationsDelayed = this._store.add(new DebounceEmitter({ merge: (all) => all.flat() }));
    this._onDidChangeDecorations = this._store.add(new Emitter());
    this.onDidChangeDecorations = this._onDidChangeDecorations.event;
    this._provider = new LinkedList();
    this._decorationStyles = this._store.add(new DecorationStyles(themeService));
    this._data = TernarySearchTree.forUris((key) => uriIdentityService.extUri.ignorePathCasing(key));
    this._store.add(this._onDidChangeDecorationsDelayed.event((event) => {
      this._onDidChangeDecorations.fire(new FileDecorationChangeEvent(event));
    }));
  }
  dispose() {
    this._store.dispose();
    this._data.clear();
  }
  registerDecorationsProvider(provider) {
    const rm = this._provider.unshift(provider);
    this._onDidChangeDecorations.fire({
      // everything might have changed
      affectsResource() {
        return true;
      }
    });
    const removeAll = () => {
      const uris = [];
      for (const [uri, map] of this._data) {
        if (map.delete(provider)) {
          uris.push(uri);
        }
      }
      if (uris.length > 0) {
        this._onDidChangeDecorationsDelayed.fire(uris);
      }
    };
    const listener = provider.onDidChange((uris) => {
      if (!uris) {
        removeAll();
      } else {
        for (const uri of uris) {
          const map = this._ensureEntry(uri);
          this._fetchData(map, uri, provider);
        }
      }
    });
    return toDisposable(() => {
      rm();
      listener.dispose();
      removeAll();
    });
  }
  _ensureEntry(uri) {
    let map = this._data.get(uri);
    if (!map) {
      map = /* @__PURE__ */ new Map();
      this._data.set(uri, map);
    }
    return map;
  }
  getDecoration(uri, includeChildren) {
    const all = [];
    let containsChildren = false;
    const map = this._ensureEntry(uri);
    for (const provider of this._provider) {
      let data = map.get(provider);
      if (data === void 0) {
        data = this._fetchData(map, uri, provider);
      }
      if (data && !(data instanceof DecorationDataRequest)) {
        all.push(data);
      }
    }
    if (includeChildren) {
      const iter = this._data.findSuperstr(uri);
      if (iter) {
        for (const tuple of iter) {
          for (const data of tuple[1].values()) {
            if (data && !(data instanceof DecorationDataRequest)) {
              if (data.bubble) {
                all.push(data);
                containsChildren = true;
              }
            }
          }
        }
      }
    }
    return all.length === 0 ? void 0 : this._decorationStyles.asDecoration(all, containsChildren);
  }
  _fetchData(map, uri, provider) {
    const pendingRequest = map.get(provider);
    if (pendingRequest instanceof DecorationDataRequest) {
      pendingRequest.source.cancel();
      map.delete(provider);
    }
    const cts = new CancellationTokenSource();
    const dataOrThenable = provider.provideDecorations(uri, cts.token);
    if (!isThenable(dataOrThenable)) {
      cts.dispose();
      return this._keepItem(map, provider, uri, dataOrThenable);
    } else {
      const request = new DecorationDataRequest(cts, Promise.resolve(dataOrThenable).then((data) => {
        if (map.get(provider) === request) {
          this._keepItem(map, provider, uri, data);
        }
      }).catch((err) => {
        if (!isCancellationError(err) && map.get(provider) === request) {
          map.delete(provider);
        }
      }).finally(() => {
        cts.dispose();
      }));
      map.set(provider, request);
      return null;
    }
  }
  _keepItem(map, provider, uri, data) {
    const deco = data ? data : null;
    const old = map.get(provider);
    map.set(provider, deco);
    if (deco || old) {
      this._onDidChangeDecorationsDelayed.fire(uri);
    }
    return deco;
  }
};
DecorationsService = __decorateClass([
  __decorateParam(0, IUriIdentityService),
  __decorateParam(1, IThemeService)
], DecorationsService);
registerSingleton(IDecorationsService, DecorationsService, InstantiationType.Delayed);
export {
  DecorationsService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxkZWNvcmF0aW9uc1xcYnJvd3NlclxcZGVjb3JhdGlvbnNTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIERlYm91bmNlRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJRGVjb3JhdGlvbnNTZXJ2aWNlLCBJRGVjb3JhdGlvbiwgSVJlc291cmNlRGVjb3JhdGlvbkNoYW5nZUV2ZW50LCBJRGVjb3JhdGlvbnNQcm92aWRlciwgSURlY29yYXRpb25EYXRhIH0gZnJvbSAnLi4vY29tbW9uL2RlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IFRlcm5hcnlTZWFyY2hUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGVybmFyeVNlYXJjaFRyZWUuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzVGhlbmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBMaW5rZWRMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlua2VkTGlzdC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTdHlsZVNoZWV0LCBjcmVhdGVDU1NSdWxlLCByZW1vdmVDU1NSdWxlc0NvbnRhaW5pbmdTZWxlY3RvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgKiBhcyBjc3NWYWx1ZSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvY3NzVmFsdWUuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGlzRmFsc3lPcldoaXRlc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IGFzQXJyYXksIGRpc3RpbmN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGFzQ3NzVmFyaWFibGUsIGFzQ3NzVmFyaWFibGVXaXRoRGVmYXVsdCwgQ29sb3JJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgZ2V0SWNvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5cbmNsYXNzIERlY29yYXRpb25SdWxlIHtcblxuXHRzdGF0aWMga2V5T2YoZGF0YTogSURlY29yYXRpb25EYXRhIHwgSURlY29yYXRpb25EYXRhW10pOiBzdHJpbmcge1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG5cdFx0XHRyZXR1cm4gZGF0YS5tYXAoRGVjb3JhdGlvblJ1bGUua2V5T2YpLmpvaW4oJywnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgeyBjb2xvciwgbGV0dGVyIH0gPSBkYXRhO1xuXHRcdFx0aWYgKFRoZW1lSWNvbi5pc1RoZW1lSWNvbihsZXR0ZXIpKSB7XG5cdFx0XHRcdHJldHVybiBgJHtjb2xvcn0rJHtsZXR0ZXIuaWR9YDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBgJHtjb2xvcn0vJHtsZXR0ZXJ9YDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfY2xhc3NOYW1lc1ByZWZpeCA9ICdtb25hY28tZGVjb3JhdGlvbic7XG5cblx0cmVhZG9ubHkgZGF0YTogSURlY29yYXRpb25EYXRhIHwgSURlY29yYXRpb25EYXRhW107XG5cdHJlYWRvbmx5IGl0ZW1Db2xvckNsYXNzTmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBpdGVtQmFkZ2VDbGFzc05hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgaWNvbkJhZGdlQ2xhc3NOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGJ1YmJsZUJhZGdlQ2xhc3NOYW1lOiBzdHJpbmc7XG5cblx0cHJpdmF0ZSBfcmVmQ291bnRlcjogbnVtYmVyID0gMDtcblxuXHRjb25zdHJ1Y3RvcihyZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsIGRhdGE6IElEZWNvcmF0aW9uRGF0YSB8IElEZWNvcmF0aW9uRGF0YVtdLCBrZXk6IHN0cmluZykge1xuXHRcdHRoaXMuZGF0YSA9IGRhdGE7XG5cdFx0Y29uc3Qgc3VmZml4ID0gaGFzaChrZXkpLnRvU3RyaW5nKDM2KTtcblx0XHR0aGlzLml0ZW1Db2xvckNsYXNzTmFtZSA9IGAke0RlY29yYXRpb25SdWxlLl9jbGFzc05hbWVzUHJlZml4fS1pdGVtQ29sb3ItJHtzdWZmaXh9YDtcblx0XHR0aGlzLml0ZW1CYWRnZUNsYXNzTmFtZSA9IGAke0RlY29yYXRpb25SdWxlLl9jbGFzc05hbWVzUHJlZml4fS1pdGVtQmFkZ2UtJHtzdWZmaXh9YDtcblx0XHR0aGlzLmJ1YmJsZUJhZGdlQ2xhc3NOYW1lID0gYCR7RGVjb3JhdGlvblJ1bGUuX2NsYXNzTmFtZXNQcmVmaXh9LWJ1YmJsZUJhZGdlLSR7c3VmZml4fWA7XG5cdFx0dGhpcy5pY29uQmFkZ2VDbGFzc05hbWUgPSBgJHtEZWNvcmF0aW9uUnVsZS5fY2xhc3NOYW1lc1ByZWZpeH0taWNvbkJhZGdlLSR7c3VmZml4fWA7XG5cdH1cblxuXHRhY3F1aXJlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZkNvdW50ZXIgKz0gMTtcblx0fVxuXG5cdHJlbGVhc2UoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIC0tdGhpcy5fcmVmQ291bnRlciA9PT0gMDtcblx0fVxuXG5cdGFwcGVuZENTU1J1bGVzKGVsZW1lbnQ6IEhUTUxTdHlsZUVsZW1lbnQpOiB2b2lkIHtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkodGhpcy5kYXRhKSkge1xuXHRcdFx0dGhpcy5fYXBwZW5kRm9yT25lKHRoaXMuZGF0YSwgZWxlbWVudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2FwcGVuZEZvck1hbnkodGhpcy5kYXRhLCBlbGVtZW50KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hcHBlbmRGb3JPbmUoZGF0YTogSURlY29yYXRpb25EYXRhLCBlbGVtZW50OiBIVE1MU3R5bGVFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgeyBjb2xvciwgbGV0dGVyIH0gPSBkYXRhO1xuXHRcdC8vIGxhYmVsXG5cdFx0Y3JlYXRlQ1NTUnVsZShgLiR7dGhpcy5pdGVtQ29sb3JDbGFzc05hbWV9YCwgYGNvbG9yOiAke2dldENvbG9yKGNvbG9yKX07YCwgZWxlbWVudCk7XG5cdFx0aWYgKFRoZW1lSWNvbi5pc1RoZW1lSWNvbihsZXR0ZXIpKSB7XG5cdFx0XHR0aGlzLl9jcmVhdGVJY29uQ1NTUnVsZShsZXR0ZXIsIGdldENvbG9yKGNvbG9yKSwgZWxlbWVudCk7XG5cdFx0fSBlbHNlIGlmIChsZXR0ZXIpIHtcblx0XHRcdGNyZWF0ZUNTU1J1bGUoYC4ke3RoaXMuaXRlbUJhZGdlQ2xhc3NOYW1lfTo6YWZ0ZXJgLCBgY29udGVudDogXCIke2xldHRlcn1cIjsgY29sb3I6ICR7Z2V0Q29sb3IoY29sb3IpfTtgLCBlbGVtZW50KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hcHBlbmRGb3JNYW55KGRhdGE6IElEZWNvcmF0aW9uRGF0YVtdLCBlbGVtZW50OiBIVE1MU3R5bGVFbGVtZW50KTogdm9pZCB7XG5cdFx0Ly8gbGFiZWxcblx0XHRjb25zdCBjb2xvciA9IGRhdGEucmVkdWNlUmlnaHQoKGZhbGxiYWNrLCBkZWNvcmF0aW9uKSA9PiBkZWNvcmF0aW9uLmNvbG9yID8gYXNDc3NWYXJpYWJsZVdpdGhEZWZhdWx0KGRlY29yYXRpb24uY29sb3IsIGZhbGxiYWNrKSA6IGZhbGxiYWNrLCAnaW5oZXJpdCcpO1xuXHRcdGNyZWF0ZUNTU1J1bGUoYC4ke3RoaXMuaXRlbUNvbG9yQ2xhc3NOYW1lfWAsIGBjb2xvcjogJHtjb2xvcn07YCwgZWxlbWVudCk7XG5cblx0XHQvLyBiYWRnZSBvciBpY29uXG5cdFx0Y29uc3QgbGV0dGVyczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgaWNvbjogVGhlbWVJY29uIHwgdW5kZWZpbmVkO1xuXG5cdFx0Zm9yIChjb25zdCBkIG9mIGRhdGEpIHtcblx0XHRcdGlmIChUaGVtZUljb24uaXNUaGVtZUljb24oZC5sZXR0ZXIpKSB7XG5cdFx0XHRcdGljb24gPSBkLmxldHRlcjtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9IGVsc2UgaWYgKGQubGV0dGVyKSB7XG5cdFx0XHRcdGxldHRlcnMucHVzaChkLmxldHRlcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGljb24pIHtcblx0XHRcdHRoaXMuX2NyZWF0ZUljb25DU1NSdWxlKGljb24sIGNvbG9yLCBlbGVtZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGxldHRlcnMubGVuZ3RoKSB7XG5cdFx0XHRcdGNyZWF0ZUNTU1J1bGUoYC4ke3RoaXMuaXRlbUJhZGdlQ2xhc3NOYW1lfTo6YWZ0ZXJgLCBgY29udGVudDogXCIke2xldHRlcnMuam9pbignLCAnKX1cIjsgY29sb3I6ICR7Y29sb3J9O2AsIGVsZW1lbnQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBidWJibGUgYmFkZ2Vcblx0XHRcdC8vIFRPRE8gQG1pc29sb3JpIHVwZGF0ZSBidWJibGUgYmFkZ2UgdG8gYWRvcHQgbGV0dGVyOiBUaGVtZUljb24gaW5zdGVhZCBvZiB1bmljb2RlXG5cdFx0XHRjcmVhdGVDU1NSdWxlKFxuXHRcdFx0XHRgLiR7dGhpcy5idWJibGVCYWRnZUNsYXNzTmFtZX06OmFmdGVyYCxcblx0XHRcdFx0YGNvbnRlbnQ6IFwiXFx1ZWE3MVwiOyBjb2xvcjogJHtjb2xvcn07IGZvbnQtZmFtaWx5OiBjb2RpY29uOyBmb250LXNpemU6IDE0cHg7IG1hcmdpbi1yaWdodDogMTRweDsgb3BhY2l0eTogMC40O2AsXG5cdFx0XHRcdGVsZW1lbnRcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlSWNvbkNTU1J1bGUoaWNvbjogVGhlbWVJY29uLCBjb2xvcjogc3RyaW5nLCBlbGVtZW50OiBIVE1MU3R5bGVFbGVtZW50KSB7XG5cblx0XHRjb25zdCBtb2RpZmllciA9IFRoZW1lSWNvbi5nZXRNb2RpZmllcihpY29uKTtcblx0XHRpZiAobW9kaWZpZXIpIHtcblx0XHRcdGljb24gPSBUaGVtZUljb24ubW9kaWZ5KGljb24sIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdGNvbnN0IGljb25Db250cmlidXRpb24gPSBnZXRJY29uUmVnaXN0cnkoKS5nZXRJY29uKGljb24uaWQpO1xuXHRcdGlmICghaWNvbkNvbnRyaWJ1dGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkZWZpbml0aW9uID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0UHJvZHVjdEljb25UaGVtZSgpLmdldEljb24oaWNvbkNvbnRyaWJ1dGlvbik7XG5cdFx0aWYgKCFkZWZpbml0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNyZWF0ZUNTU1J1bGUoXG5cdFx0XHRgLiR7dGhpcy5pY29uQmFkZ2VDbGFzc05hbWV9OjphZnRlcmAsXG5cdFx0XHRgY29udGVudDogJyR7ZGVmaW5pdGlvbi5mb250Q2hhcmFjdGVyfSc7XG5cdFx0XHRjb2xvcjogJHtpY29uLmNvbG9yID8gZ2V0Q29sb3IoaWNvbi5jb2xvci5pZCkgOiBjb2xvcn07XG5cdFx0XHRmb250LWZhbWlseTogJHtjc3NWYWx1ZS5zdHJpbmdWYWx1ZShkZWZpbml0aW9uLmZvbnQ/LmlkID8/ICdjb2RpY29uJyl9O1xuXHRcdFx0Zm9udC1zaXplOiAxNnB4O1xuXHRcdFx0bWFyZ2luLXJpZ2h0OiAxNHB4O1xuXHRcdFx0Zm9udC13ZWlnaHQ6IG5vcm1hbDtcblx0XHRcdCR7bW9kaWZpZXIgPT09ICdzcGluJyA/ICdhbmltYXRpb246IGNvZGljb24tc3BpbiAxLjVzIHN0ZXBzKDMwKSBpbmZpbml0ZTsgZm9udC1zdHlsZTogbm9ybWFsICFpbXBvcnRhbnQ7IHRyYW5zZm9ybS1vcmlnaW46IGNlbnRlciBjZW50ZXI7JyA6ICcnfTtcblx0XHRcdGAsXG5cdFx0XHRlbGVtZW50XG5cdFx0KTtcblx0fVxuXG5cdHJlbW92ZUNTU1J1bGVzKGVsZW1lbnQ6IEhUTUxTdHlsZUVsZW1lbnQpOiB2b2lkIHtcblx0XHRyZW1vdmVDU1NSdWxlc0NvbnRhaW5pbmdTZWxlY3Rvcih0aGlzLml0ZW1Db2xvckNsYXNzTmFtZSwgZWxlbWVudCk7XG5cdFx0cmVtb3ZlQ1NTUnVsZXNDb250YWluaW5nU2VsZWN0b3IodGhpcy5pdGVtQmFkZ2VDbGFzc05hbWUsIGVsZW1lbnQpO1xuXHRcdHJlbW92ZUNTU1J1bGVzQ29udGFpbmluZ1NlbGVjdG9yKHRoaXMuYnViYmxlQmFkZ2VDbGFzc05hbWUsIGVsZW1lbnQpO1xuXHRcdHJlbW92ZUNTU1J1bGVzQ29udGFpbmluZ1NlbGVjdG9yKHRoaXMuaWNvbkJhZGdlQ2xhc3NOYW1lLCBlbGVtZW50KTtcblx0fVxufVxuXG5jbGFzcyBEZWNvcmF0aW9uU3R5bGVzIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdHlsZUVsZW1lbnQgPSBjcmVhdGVTdHlsZVNoZWV0KHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0aGlzLl9kaXNwb2FibGVzKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVjb3JhdGlvblJ1bGVzID0gbmV3IE1hcDxzdHJpbmcsIERlY29yYXRpb25SdWxlPigpO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSkge1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGFzRGVjb3JhdGlvbihkYXRhOiBJRGVjb3JhdGlvbkRhdGFbXSwgb25seUNoaWxkcmVuOiBib29sZWFuKTogSURlY29yYXRpb24ge1xuXG5cdFx0Ly8gc29ydCBieSB3ZWlnaHRcblx0XHRkYXRhLnNvcnQoKGEsIGIpID0+IChiLndlaWdodCB8fCAwKSAtIChhLndlaWdodCB8fCAwKSk7XG5cblx0XHRjb25zdCBrZXkgPSBEZWNvcmF0aW9uUnVsZS5rZXlPZihkYXRhKTtcblx0XHRsZXQgcnVsZSA9IHRoaXMuX2RlY29yYXRpb25SdWxlcy5nZXQoa2V5KTtcblxuXHRcdGlmICghcnVsZSkge1xuXHRcdFx0Ly8gbmV3IGNzcyBydWxlXG5cdFx0XHRydWxlID0gbmV3IERlY29yYXRpb25SdWxlKHRoaXMuX3RoZW1lU2VydmljZSwgZGF0YSwga2V5KTtcblx0XHRcdHRoaXMuX2RlY29yYXRpb25SdWxlcy5zZXQoa2V5LCBydWxlKTtcblx0XHRcdHJ1bGUuYXBwZW5kQ1NTUnVsZXModGhpcy5fc3R5bGVFbGVtZW50KTtcblx0XHR9XG5cblx0XHRydWxlLmFjcXVpcmUoKTtcblxuXHRcdGNvbnN0IGxhYmVsQ2xhc3NOYW1lID0gcnVsZS5pdGVtQ29sb3JDbGFzc05hbWU7XG5cdFx0bGV0IGJhZGdlQ2xhc3NOYW1lID0gcnVsZS5pdGVtQmFkZ2VDbGFzc05hbWU7XG5cdFx0Y29uc3QgaWNvbkNsYXNzTmFtZSA9IHJ1bGUuaWNvbkJhZGdlQ2xhc3NOYW1lO1xuXHRcdGxldCB0b29sdGlwID0gZGlzdGluY3QoZGF0YS5maWx0ZXIoZCA9PiAhaXNGYWxzeU9yV2hpdGVzcGFjZShkLnRvb2x0aXApKS5tYXAoZCA9PiBkLnRvb2x0aXApKS5qb2luKCcgXHUyMDIyICcpO1xuXHRcdGNvbnN0IHN0cmlrZXRocm91Z2ggPSBkYXRhLnNvbWUoZCA9PiBkLnN0cmlrZXRocm91Z2gpO1xuXG5cdFx0aWYgKG9ubHlDaGlsZHJlbikge1xuXHRcdFx0Ly8gc2hvdyBpdGVtcyBmcm9tIGl0cyBjaGlsZHJlbiBvbmx5XG5cdFx0XHRiYWRnZUNsYXNzTmFtZSA9IHJ1bGUuYnViYmxlQmFkZ2VDbGFzc05hbWU7XG5cdFx0XHR0b29sdGlwID0gbG9jYWxpemUoJ2J1YmJsZVRpdGxlJywgXCJDb250YWlucyBlbXBoYXNpemVkIGl0ZW1zXCIpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRsYWJlbENsYXNzTmFtZSxcblx0XHRcdGJhZGdlQ2xhc3NOYW1lLFxuXHRcdFx0aWNvbkNsYXNzTmFtZSxcblx0XHRcdHN0cmlrZXRocm91Z2gsXG5cdFx0XHR0b29sdGlwLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRpZiAocnVsZT8ucmVsZWFzZSgpKSB7XG5cdFx0XHRcdFx0dGhpcy5fZGVjb3JhdGlvblJ1bGVzLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHRcdHJ1bGUucmVtb3ZlQ1NTUnVsZXModGhpcy5fc3R5bGVFbGVtZW50KTtcblx0XHRcdFx0XHRydWxlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBGaWxlRGVjb3JhdGlvbkNoYW5nZUV2ZW50IGltcGxlbWVudHMgSVJlc291cmNlRGVjb3JhdGlvbkNoYW5nZUV2ZW50IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kYXRhID0gVGVybmFyeVNlYXJjaFRyZWUuZm9yVXJpczx0cnVlPihfdXJpID0+IHRydWUpOyAvLyBldmVudHMgaWdub3JlIGFsbCBwYXRoIGNhc2luZ3NcblxuXHRjb25zdHJ1Y3RvcihhbGw6IFVSSSB8IFVSSVtdKSB7XG5cdFx0dGhpcy5fZGF0YS5maWxsKHRydWUsIGFzQXJyYXkoYWxsKSk7XG5cdH1cblxuXHRhZmZlY3RzUmVzb3VyY2UodXJpOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZGF0YS5oYXNFbGVtZW50T3JTdWJ0cmVlKHVyaSk7XG5cdH1cbn1cblxuY2xhc3MgRGVjb3JhdGlvbkRhdGFSZXF1ZXN0IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgc291cmNlOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSxcblx0XHRyZWFkb25seSB0aGVuYWJsZTogUHJvbWlzZTx2b2lkPixcblx0KSB7IH1cbn1cblxuZnVuY3Rpb24gZ2V0Q29sb3IoY29sb3I6IENvbG9ySWRlbnRpZmllciB8IHVuZGVmaW5lZCkge1xuXHRyZXR1cm4gY29sb3IgPyBhc0Nzc1ZhcmlhYmxlKGNvbG9yKSA6ICdpbmhlcml0Jztcbn1cblxudHlwZSBEZWNvcmF0aW9uRW50cnkgPSBNYXA8SURlY29yYXRpb25zUHJvdmlkZXIsIERlY29yYXRpb25EYXRhUmVxdWVzdCB8IElEZWNvcmF0aW9uRGF0YSB8IG51bGw+O1xuXG5leHBvcnQgY2xhc3MgRGVjb3JhdGlvbnNTZXJ2aWNlIGltcGxlbWVudHMgSURlY29yYXRpb25zU2VydmljZSB7XG5cblx0ZGVjbGFyZSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnNEZWxheWVkID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBEZWJvdW5jZUVtaXR0ZXI8VVJJIHwgVVJJW10+KHsgbWVyZ2U6IGFsbCA9PiBhbGwuZmxhdCgpIH0pKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VEZWNvcmF0aW9ucyA9IHRoaXMuX3N0b3JlLmFkZChuZXcgRW1pdHRlcjxJUmVzb3VyY2VEZWNvcmF0aW9uQ2hhbmdlRXZlbnQ+KCkpO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRGVjb3JhdGlvbnM6IEV2ZW50PElSZXNvdXJjZURlY29yYXRpb25DaGFuZ2VFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyID0gbmV3IExpbmtlZExpc3Q8SURlY29yYXRpb25zUHJvdmlkZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlY29yYXRpb25TdHlsZXM6IERlY29yYXRpb25TdHlsZXM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RhdGE6IFRlcm5hcnlTZWFyY2hUcmVlPFVSSSwgRGVjb3JhdGlvbkVudHJ5PjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9kZWNvcmF0aW9uU3R5bGVzID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBEZWNvcmF0aW9uU3R5bGVzKHRoZW1lU2VydmljZSkpO1xuXHRcdHRoaXMuX2RhdGEgPSBUZXJuYXJ5U2VhcmNoVHJlZS5mb3JVcmlzKGtleSA9PiB1cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlnbm9yZVBhdGhDYXNpbmcoa2V5KSk7XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9uc0RlbGF5ZWQuZXZlbnQoZXZlbnQgPT4geyB0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmZpcmUobmV3IEZpbGVEZWNvcmF0aW9uQ2hhbmdlRXZlbnQoZXZlbnQpKTsgfSkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9yZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZGF0YS5jbGVhcigpO1xuXHR9XG5cblx0cmVnaXN0ZXJEZWNvcmF0aW9uc1Byb3ZpZGVyKHByb3ZpZGVyOiBJRGVjb3JhdGlvbnNQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBybSA9IHRoaXMuX3Byb3ZpZGVyLnVuc2hpZnQocHJvdmlkZXIpO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5maXJlKHtcblx0XHRcdC8vIGV2ZXJ5dGhpbmcgbWlnaHQgaGF2ZSBjaGFuZ2VkXG5cdFx0XHRhZmZlY3RzUmVzb3VyY2UoKSB7IHJldHVybiB0cnVlOyB9XG5cdFx0fSk7XG5cblx0XHQvLyByZW1vdmUgZXZlcnl0aGluZyB3aGF0IGNhbWUgZnJvbSB0aGlzIHByb3ZpZGVyXG5cdFx0Y29uc3QgcmVtb3ZlQWxsID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpczogVVJJW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgW3VyaSwgbWFwXSBvZiB0aGlzLl9kYXRhKSB7XG5cdFx0XHRcdGlmIChtYXAuZGVsZXRlKHByb3ZpZGVyKSkge1xuXHRcdFx0XHRcdHVyaXMucHVzaCh1cmkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAodXJpcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnNEZWxheWVkLmZpcmUodXJpcyk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGxpc3RlbmVyID0gcHJvdmlkZXIub25EaWRDaGFuZ2UodXJpcyA9PiB7XG5cdFx0XHRpZiAoIXVyaXMpIHtcblx0XHRcdFx0Ly8gZmx1c2ggZXZlbnQgLT4gZHJvcCBhbGwgZGF0YSwgY2FuIGFmZmVjdCBldmVyeXRoaW5nXG5cdFx0XHRcdHJlbW92ZUFsbCgpO1xuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBzZWxlY3RpdmUgY2hhbmdlcyAtPiBkcm9wIGZvciByZXNvdXJjZSwgZmV0Y2ggYWdhaW4sIHNlbmQgZXZlbnRcblx0XHRcdFx0Zm9yIChjb25zdCB1cmkgb2YgdXJpcykge1xuXHRcdFx0XHRcdGNvbnN0IG1hcCA9IHRoaXMuX2Vuc3VyZUVudHJ5KHVyaSk7XG5cdFx0XHRcdFx0dGhpcy5fZmV0Y2hEYXRhKG1hcCwgdXJpLCBwcm92aWRlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0cm0oKTtcblx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdHJlbW92ZUFsbCgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlRW50cnkodXJpOiBVUkkpOiBEZWNvcmF0aW9uRW50cnkge1xuXHRcdGxldCBtYXAgPSB0aGlzLl9kYXRhLmdldCh1cmkpO1xuXHRcdGlmICghbWFwKSB7XG5cdFx0XHQvLyBub3RoaW5nIGtub3duIGFib3V0IHRoaXMgdXJpXG5cdFx0XHRtYXAgPSBuZXcgTWFwKCk7XG5cdFx0XHR0aGlzLl9kYXRhLnNldCh1cmksIG1hcCk7XG5cdFx0fVxuXHRcdHJldHVybiBtYXA7XG5cdH1cblxuXHRnZXREZWNvcmF0aW9uKHVyaTogVVJJLCBpbmNsdWRlQ2hpbGRyZW46IGJvb2xlYW4pOiBJRGVjb3JhdGlvbiB8IHVuZGVmaW5lZCB7XG5cblx0XHRjb25zdCBhbGw6IElEZWNvcmF0aW9uRGF0YVtdID0gW107XG5cdFx0bGV0IGNvbnRhaW5zQ2hpbGRyZW46IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRcdGNvbnN0IG1hcCA9IHRoaXMuX2Vuc3VyZUVudHJ5KHVyaSk7XG5cblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHRoaXMuX3Byb3ZpZGVyKSB7XG5cblx0XHRcdGxldCBkYXRhID0gbWFwLmdldChwcm92aWRlcik7XG5cdFx0XHRpZiAoZGF0YSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdC8vIHNldHMgZGF0YSBpZiBmZXRjaCBpcyBzeW5jXG5cdFx0XHRcdGRhdGEgPSB0aGlzLl9mZXRjaERhdGEobWFwLCB1cmksIHByb3ZpZGVyKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGRhdGEgJiYgIShkYXRhIGluc3RhbmNlb2YgRGVjb3JhdGlvbkRhdGFSZXF1ZXN0KSkge1xuXHRcdFx0XHQvLyBoYXZpbmcgZGF0YVxuXHRcdFx0XHRhbGwucHVzaChkYXRhKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoaW5jbHVkZUNoaWxkcmVuKSB7XG5cdFx0XHQvLyAocmVzb2x2ZWQpIGNoaWxkcmVuXG5cdFx0XHRjb25zdCBpdGVyID0gdGhpcy5fZGF0YS5maW5kU3VwZXJzdHIodXJpKTtcblx0XHRcdGlmIChpdGVyKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgdHVwbGUgb2YgaXRlcikge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZGF0YSBvZiB0dXBsZVsxXS52YWx1ZXMoKSkge1xuXHRcdFx0XHRcdFx0aWYgKGRhdGEgJiYgIShkYXRhIGluc3RhbmNlb2YgRGVjb3JhdGlvbkRhdGFSZXF1ZXN0KSkge1xuXHRcdFx0XHRcdFx0XHRpZiAoZGF0YS5idWJibGUpIHtcblx0XHRcdFx0XHRcdFx0XHRhbGwucHVzaChkYXRhKTtcblx0XHRcdFx0XHRcdFx0XHRjb250YWluc0NoaWxkcmVuID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBhbGwubGVuZ3RoID09PSAwXG5cdFx0XHQ/IHVuZGVmaW5lZFxuXHRcdFx0OiB0aGlzLl9kZWNvcmF0aW9uU3R5bGVzLmFzRGVjb3JhdGlvbihhbGwsIGNvbnRhaW5zQ2hpbGRyZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmV0Y2hEYXRhKG1hcDogRGVjb3JhdGlvbkVudHJ5LCB1cmk6IFVSSSwgcHJvdmlkZXI6IElEZWNvcmF0aW9uc1Byb3ZpZGVyKTogSURlY29yYXRpb25EYXRhIHwgbnVsbCB7XG5cblx0XHQvLyBjaGVjayBmb3IgcGVuZGluZyByZXF1ZXN0IGFuZCBjYW5jZWwgaXRcblx0XHRjb25zdCBwZW5kaW5nUmVxdWVzdCA9IG1hcC5nZXQocHJvdmlkZXIpO1xuXHRcdGlmIChwZW5kaW5nUmVxdWVzdCBpbnN0YW5jZW9mIERlY29yYXRpb25EYXRhUmVxdWVzdCkge1xuXHRcdFx0cGVuZGluZ1JlcXVlc3Quc291cmNlLmNhbmNlbCgpO1xuXHRcdFx0bWFwLmRlbGV0ZShwcm92aWRlcik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0Y29uc3QgZGF0YU9yVGhlbmFibGUgPSBwcm92aWRlci5wcm92aWRlRGVjb3JhdGlvbnModXJpLCBjdHMudG9rZW4pO1xuXHRcdGlmICghaXNUaGVuYWJsZTxJRGVjb3JhdGlvbkRhdGEgfCBQcm9taXNlPElEZWNvcmF0aW9uRGF0YSB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQ+KGRhdGFPclRoZW5hYmxlKSkge1xuXHRcdFx0Ly8gc3luYyAtPiB3ZSBoYXZlIGEgcmVzdWx0IG5vd1xuXHRcdFx0Y3RzLmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybiB0aGlzLl9rZWVwSXRlbShtYXAsIHByb3ZpZGVyLCB1cmksIGRhdGFPclRoZW5hYmxlKTtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBhc3luYyAtPiB3ZSBoYXZlIGEgcmVzdWx0IHNvb25cblx0XHRcdGNvbnN0IHJlcXVlc3QgPSBuZXcgRGVjb3JhdGlvbkRhdGFSZXF1ZXN0KGN0cywgUHJvbWlzZS5yZXNvbHZlKGRhdGFPclRoZW5hYmxlKS50aGVuKGRhdGEgPT4ge1xuXHRcdFx0XHRpZiAobWFwLmdldChwcm92aWRlcikgPT09IHJlcXVlc3QpIHtcblx0XHRcdFx0XHR0aGlzLl9rZWVwSXRlbShtYXAsIHByb3ZpZGVyLCB1cmksIGRhdGEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSAmJiBtYXAuZ2V0KHByb3ZpZGVyKSA9PT0gcmVxdWVzdCkge1xuXHRcdFx0XHRcdG1hcC5kZWxldGUocHJvdmlkZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0Y3RzLmRpc3Bvc2UoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0bWFwLnNldChwcm92aWRlciwgcmVxdWVzdCk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9rZWVwSXRlbShtYXA6IERlY29yYXRpb25FbnRyeSwgcHJvdmlkZXI6IElEZWNvcmF0aW9uc1Byb3ZpZGVyLCB1cmk6IFVSSSwgZGF0YTogSURlY29yYXRpb25EYXRhIHwgdW5kZWZpbmVkKTogSURlY29yYXRpb25EYXRhIHwgbnVsbCB7XG5cdFx0Y29uc3QgZGVjbyA9IGRhdGEgPyBkYXRhIDogbnVsbDtcblx0XHRjb25zdCBvbGQgPSBtYXAuZ2V0KHByb3ZpZGVyKTtcblx0XHRtYXAuc2V0KHByb3ZpZGVyLCBkZWNvKTtcblx0XHRpZiAoZGVjbyB8fCBvbGQpIHtcblx0XHRcdC8vIG9ubHkgZmlyZSBldmVudCB3aGVuIHNvbWV0aGluZyBjaGFuZ2VkXG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zRGVsYXllZC5maXJlKHVyaSk7XG5cdFx0fVxuXHRcdHJldHVybiBkZWNvO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElEZWNvcmF0aW9uc1NlcnZpY2UsIERlY29yYXRpb25zU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsU0FBUyx1QkFBOEI7QUFDaEQsU0FBUywyQkFBK0c7QUFDeEgsU0FBUyx5QkFBeUI7QUFDbEMsU0FBc0IsY0FBYyx1QkFBdUI7QUFDM0QsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxrQkFBa0IsZUFBZSx3Q0FBd0M7QUFDbEYsWUFBWSxjQUFjO0FBQzFCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsaUJBQWlCO0FB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
