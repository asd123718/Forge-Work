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
import { Codicon } from "../../../../base/common/codicons.js";
import { basename, isEqual } from "../../../../base/common/resources.js";
import { truncate } from "../../../../base/common/strings.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { BrowserViewUri } from "../../../../platform/browserView/common/browserViewUri.js";
import { BrowserViewSharingState, IBrowserViewWorkbenchService, BrowserViewEditorId } from "./browserView.js";
import { EditorInputCapabilities, Verbosity } from "../../../common/editor.js";
import { EditorInput } from "../../../common/editor/editorInput.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { TAB_ACTIVE_FOREGROUND } from "../../../common/theme.js";
import { localize } from "../../../../nls.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { hasKey } from "../../../../base/common/types.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { logBrowserOpen } from "../../../../platform/browserView/common/browserViewTelemetry.js";
import { LRUCachedFunction } from "../../../../base/common/cache.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { isBrowserViewAssociatedResourceNavigation } from "../../../../platform/browserView/common/browserView.js";
const LOADING_SPINNER_SVG = (color) => `
	<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
		<path d="M8 1a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z" fill="${color}" opacity="0.3"/>
		<path d="M8 1a7 7 0 0 1 7 7h-1.5A5.5 5.5 0 0 0 8 2.5V1z" fill="${color}">
			<animateTransform attributeName="transform" type="rotate" dur="1s" repeatCount="indefinite" values="0 8 8;360 8 8"/>
		</path>
	</svg>
`;
const MAX_TITLE_LENGTH = 30;
function stripUrlFragment(url) {
  const hash = url.indexOf("#");
  return hash === -1 ? url : url.slice(0, hash);
}
function stripUrlQueryAndFragment(url) {
  const stripped = stripUrlFragment(url);
  const query = stripped.indexOf("?");
  return query === -1 ? stripped : stripped.slice(0, query);
}
let BrowserEditorInput = class extends EditorInput {
  constructor(options, _resolveModel, themeService, instantiationService, telemetryService, browserViewWorkbenchService) {
    super();
    this._resolveModel = _resolveModel;
    this.themeService = themeService;
    this.instantiationService = instantiationService;
    this.telemetryService = telemetryService;
    this.browserViewWorkbenchService = browserViewWorkbenchService;
    this._modelStore = this._register(new DisposableStore());
    this._onBeforeDispose = this._register(new Emitter());
    this.onBeforeDispose = this._onBeforeDispose.event;
    this._onDidResolveModel = this._register(new Emitter());
    this.onDidResolveModel = this._onDidResolveModel.event;
    this.getURLTitles = new LRUCachedFunction((url) => {
      let _short = void 0;
      let _medium = void 0;
      let _long = void 0;
      return {
        // Host only. Derived via the WHATWG URL parser so it matches the
        // host shown by the navbar's raw URL (e.g. punycode for IDNs).
        get [Verbosity.SHORT]() {
          if (_short === void 0) {
            const parsed = URL.parse(url);
            _short = parsed ? parsed.host : stripUrlQueryAndFragment(url);
          }
          return _short;
        },
        // Raw URL without the query/fragment. Computed by string slicing
        // (not a URI round-trip) so the displayed text stays byte-for-byte
        // consistent with the canonical URL shown in the navbar.
        get [Verbosity.MEDIUM]() {
          if (_medium === void 0) {
            _medium = stripUrlQueryAndFragment(url);
          }
          return _medium;
        },
        // Raw URL without the fragment, sliced from the canonical string for
        // the same consistency reason as the medium form.
        get [Verbosity.LONG]() {
          if (_long === void 0) {
            _long = stripUrlFragment(url);
          }
          return _long;
        }
      };
    });
    this._id = options.id;
    this._associatedResource = options.associatedResource;
    this._initialData = options;
  }
  get model() {
    return this._model;
  }
  set model(model) {
    if (this._model === model) {
      return;
    }
    this._modelStore.clear();
    this._model = model;
    this._modelStore.add(this._model.onWillDispose(() => {
      this._modelStore.clear();
      this._model = void 0;
    }));
    this._modelStore.add(this._model.onDidClose(() => {
      this.dispose(true);
    }));
    this._modelStore.add(this._model.onDidChangeTitle(() => this._onDidChangeLabel.fire()));
    this._modelStore.add(this._model.onDidChangeFavicon(() => this._onDidChangeLabel.fire()));
    this._modelStore.add(this._model.onDidChangeLoadingState(() => this._onDidChangeLabel.fire()));
    this._modelStore.add(this._model.onDidNavigate(() => this._onDidChangeLabel.fire()));
    this._onDidChangeLabel.fire();
    this._onDidResolveModel.fire(model);
  }
  onceModelResolves(cb) {
    if (this._model) {
      cb(this._model);
      return Disposable.None;
    } else {
      return Event.once(this.onDidResolveModel)(cb);
    }
  }
  get id() {
    return this._id;
  }
  get associatedResource() {
    return this._associatedResource;
  }
  get url() {
    return this._model ? this._model.url : this._initialData.url;
  }
  get title() {
    return this._model ? this._model.title : this._initialData.title;
  }
  get favicon() {
    return this._model ? this._model.favicon : this._initialData.favicon;
  }
  /**
   * Whether this editor was opened via a default localhost link open (setting
   * not explicitly configured by the user). Transient — not serialized.
   */
  get isDefaultLinkOpen() {
    return !!this._initialData.isDefaultLinkOpen;
  }
  get isSharingAvailable() {
    return this._model ? this._model.sharingState !== BrowserViewSharingState.Unavailable : this.browserViewWorkbenchService.isSharingAvailable;
  }
  navigate(url, options) {
    const destination = url.trim();
    if (this._model) {
      void this._model.loadURL(destination, options);
    } else {
      this._initialData = {
        id: this._id,
        url: destination
      };
      this._onDidChangeLabel.fire();
    }
  }
  async resolve() {
    if (!this._model && !this._modelPromise) {
      this._modelPromise = (async () => {
        this._model = await this._resolveModel();
        this._modelPromise = void 0;
        return this._model;
      })();
    }
    return this._model || this._modelPromise;
  }
  get typeId() {
    return BrowserEditorInput.ID;
  }
  get editorId() {
    return BrowserEditorInput.EDITOR_ID;
  }
  get capabilities() {
    return EditorInputCapabilities.ForceReveal | EditorInputCapabilities.Readonly;
  }
  get resource() {
    return BrowserViewUri.forId(this._id);
  }
  get preferredResource() {
    return this._associatedResource ?? this.resource;
  }
  getIcon() {
    const defaultIcon = this._associatedResource ? void 0 : Codicon.globe;
    if (this._model) {
      if (this._model.loading) {
        const color = this.themeService.getColorTheme().getColor(TAB_ACTIVE_FOREGROUND);
        return URI.parse("data:image/svg+xml;utf8," + encodeURIComponent(LOADING_SPINNER_SVG(color?.toString())));
      }
      if (this._model.favicon) {
        return URI.parse(this._model.favicon);
      }
      return defaultIcon;
    }
    if (this._initialData.favicon) {
      return URI.parse(this._initialData.favicon);
    }
    return defaultIcon;
  }
  getName() {
    const hasTitle = this._model ? !!this._model.title : !!this._initialData.title;
    if (hasTitle) {
      return truncate(this.title, MAX_TITLE_LENGTH);
    }
    const name = this._associatedResource ? basename(this._associatedResource) : this.getDescription(Verbosity.SHORT) || BrowserEditorInput.DEFAULT_LABEL;
    return truncate(name, MAX_TITLE_LENGTH);
  }
  getTitle(verbosity = Verbosity.MEDIUM) {
    const hasTitle = this._model ? !!this._model.title : !!this._initialData.title;
    const description = this.getDescription(verbosity);
    const title = hasTitle ? `${this.title} (${description})` : description;
    return title || BrowserEditorInput.DEFAULT_LABEL;
  }
  getDescription(verbosity = Verbosity.MEDIUM) {
    return this.url && this.getURLTitles.get(this.url)[verbosity];
  }
  canReopen() {
    return true;
  }
  matches(otherInput) {
    if (this._associatedResource && !(otherInput instanceof EditorInput) && hasKey(otherInput, { resource: true }) && isEqual(this._associatedResource, otherInput.resource)) {
      return otherInput.options?.override === BrowserEditorInput.EDITOR_ID;
    }
    if (super.matches(otherInput)) {
      return true;
    }
    if (otherInput instanceof BrowserEditorInput) {
      return this._id === otherInput._id;
    }
    if (hasKey(otherInput, { resource: true }) && otherInput.resource?.scheme === BrowserViewUri.scheme) {
      const parsed = BrowserViewUri.parse(otherInput.resource);
      if (parsed) {
        return this._id === parsed.id;
      }
    }
    return false;
  }
  /**
   * Creates a copy of this browser editor input with a new unique ID, creating an independent browser view with no linked state.
   * This is used during Copy into New Window.
   */
  copy() {
    logBrowserOpen(this.telemetryService, "copyToNewWindow");
    return this.instantiationService.invokeFunction((accessor) => {
      const browserViewWorkbenchService = accessor.get(IBrowserViewWorkbenchService);
      return browserViewWorkbenchService.getOrCreateLazy(generateUuid(), {
        url: this.url,
        title: this.title,
        favicon: this.favicon
      }, this._associatedResource);
    });
  }
  toUntyped() {
    const viewState = {
      url: this.url,
      title: this.title,
      favicon: this.favicon
    };
    return {
      resource: this.preferredResource,
      options: {
        override: BrowserEditorInput.EDITOR_ID,
        viewState
      }
    };
  }
  async rename(_group, target) {
    if (!this._associatedResource) {
      return void 0;
    }
    const currentUrl = this.url;
    let renamedUrl = currentUrl;
    if (currentUrl && isBrowserViewAssociatedResourceNavigation(this._associatedResource, currentUrl)) {
      const currentResource = URI.parse(currentUrl);
      renamedUrl = target.with({ query: currentResource.query, fragment: currentResource.fragment }).toString();
    }
    return {
      editor: {
        resource: target,
        options: {
          override: BrowserEditorInput.EDITOR_ID,
          viewState: {
            url: renamedUrl,
            title: this.title,
            favicon: this.favicon
          }
        }
      }
    };
  }
  dispose(force) {
    if (!force) {
      let vetoed = false;
      this._onBeforeDispose.fire({ veto: () => {
        vetoed = true;
      } });
      if (vetoed) {
        return;
      }
    }
    super.dispose();
    if (this._model) {
      this._initialData = {
        id: this._id,
        url: this._model.url,
        title: this._model.title,
        favicon: this._model.favicon
      };
      this._model.dispose();
      this._model = void 0;
    }
  }
  serialize() {
    return {
      id: this._id,
      associatedResource: this._associatedResource,
      url: this.url,
      title: this.title,
      favicon: this.favicon
    };
  }
};
BrowserEditorInput.ID = "workbench.editorinputs.browser";
BrowserEditorInput.EDITOR_ID = BrowserViewEditorId;
BrowserEditorInput.DEFAULT_LABEL = localize("browser.editorLabel", "Browser");
BrowserEditorInput = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IBrowserViewWorkbenchService)
], BrowserEditorInput);
class BrowserEditorSerializer {
  canSerialize(editorInput) {
    return editorInput instanceof BrowserEditorInput;
  }
  serialize(editorInput) {
    if (!this.canSerialize(editorInput)) {
      return void 0;
    }
    return JSON.stringify(editorInput.serialize());
  }
  deserialize(instantiationService, serializedEditor) {
    try {
      const data = JSON.parse(serializedEditor);
      return instantiationService.invokeFunction((accessor) => {
        const browserViewWorkbenchService = accessor.get(IBrowserViewWorkbenchService);
        return browserViewWorkbenchService.getOrCreateLazy(data.id, {
          url: data.url,
          title: data.title,
          favicon: data.favicon
        }, URI.revive(data.associatedResource));
      });
    } catch {
      return void 0;
    }
  }
}
export {
  BrowserEditorInput,
  BrowserEditorSerializer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxjb21tb25cXGJyb3dzZXJFZGl0b3JJbnB1dC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyB0cnVuY2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IEJyb3dzZXJWaWV3VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJWaWV3VXJpLmpzJztcbmltcG9ydCB7IEJyb3dzZXJWaWV3U2hhcmluZ1N0YXRlLCBJTmF2aWdhdGVPcHRpb25zLCBJQnJvd3NlckVkaXRvclZpZXdTdGF0ZSwgSUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSwgQnJvd3NlclZpZXdFZGl0b3JJZCB9IGZyb20gJy4vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMsIEdyb3VwSWRlbnRpZmllciwgSUVkaXRvclNlcmlhbGl6ZXIsIElNb3ZlUmVzdWx0LCBJVW50eXBlZEVkaXRvcklucHV0LCBWZXJib3NpdHkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUQUJfQUNUSVZFX0ZPUkVHUk9VTkQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlclZpZXdNb2RlbCB9IGZyb20gJy4uL2NvbW1vbi9icm93c2VyVmlldy5qcyc7XG5pbXBvcnQgeyBoYXNLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGxvZ0Jyb3dzZXJPcGVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJWaWV3VGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IExSVUNhY2hlZEZ1bmN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FjaGUuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGlzQnJvd3NlclZpZXdBc3NvY2lhdGVkUmVzb3VyY2VOYXZpZ2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcblxuY29uc3QgTE9BRElOR19TUElOTkVSX1NWRyA9IChjb2xvcjogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiBgXG5cdDxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHZpZXdCb3g9XCIwIDAgMTYgMTZcIiB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIj5cblx0XHQ8cGF0aCBkPVwiTTggMWE3IDcgMCAxIDAgMCAxNCA3IDcgMCAwIDAgMC0xNHptMCAxLjVhNS41IDUuNSAwIDEgMSAwIDExIDUuNSA1LjUgMCAwIDEgMC0xMXpcIiBmaWxsPVwiJHtjb2xvcn1cIiBvcGFjaXR5PVwiMC4zXCIvPlxuXHRcdDxwYXRoIGQ9XCJNOCAxYTcgNyAwIDAgMSA3IDdoLTEuNUE1LjUgNS41IDAgMCAwIDggMi41VjF6XCIgZmlsbD1cIiR7Y29sb3J9XCI+XG5cdFx0XHQ8YW5pbWF0ZVRyYW5zZm9ybSBhdHRyaWJ1dGVOYW1lPVwidHJhbnNmb3JtXCIgdHlwZT1cInJvdGF0ZVwiIGR1cj1cIjFzXCIgcmVwZWF0Q291bnQ9XCJpbmRlZmluaXRlXCIgdmFsdWVzPVwiMCA4IDg7MzYwIDggOFwiLz5cblx0XHQ8L3BhdGg+XG5cdDwvc3ZnPlxuYDtcblxuLyoqXG4gKiBNYXhpbXVtIGxlbmd0aCBmb3IgYnJvd3NlciBwYWdlIHRpdGxlcyBiZWZvcmUgdHJ1bmNhdGlvblxuICovXG5jb25zdCBNQVhfVElUTEVfTEVOR1RIID0gMzA7XG5cbi8qKlxuICogSlNPTi1zZXJpYWxpemFibGUgdHlwZSB1c2VkIGR1cmluZyBicm93c2VyIHN0YXRlIHNlcmlhbGl6YXRpb24vZGVzZXJpYWxpemF0aW9uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUJyb3dzZXJFZGl0b3JJbnB1dERhdGEgZXh0ZW5kcyBJQnJvd3NlckVkaXRvclZpZXdTdGF0ZSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFzc29jaWF0ZWRSZXNvdXJjZT86IFVSSTtcbn1cblxuLyoqXG4gKiBGaXJlZCBiZWZvcmUgYSB7QGxpbmsgQnJvd3NlckVkaXRvcklucHV0fSBpcyBkaXNwb3NlZC4gTGlzdGVuZXJzIG1heSBjYWxsXG4gKiB7QGxpbmsgdmV0b30gdG8gcHJldmVudCBkaXNwb3NhbCBhbmQga2VlcCB0aGUgaW5wdXQgYW5kIGl0cyBtb2RlbCBhbGl2ZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQmVmb3JlRGlzcG9zZUJyb3dzZXJFZGl0b3JFdmVudCB7XG5cdHZldG8oKTogdm9pZDtcbn1cblxuLyoqXG4gKiBTbGljZSB0aGUgZnJhZ21lbnQgb2ZmIGEgcmF3IFVSTC4gQSBsaXRlcmFsIGAjYCBhbHdheXMgc3RhcnRzIHRoZSBmcmFnbWVudCxcbiAqIHNvIGEgcGxhaW4gc3Vic3RyaW5nIGtlZXBzIHRoZSByZXN0IG9mIHRoZSBVUkwgYnl0ZS1mb3ItYnl0ZSBpbnRhY3QgKG5vXG4gKiByZS1lbmNvZGluZyksIG1hdGNoaW5nIHdoYXQgdGhlIG5hdmJhciBkaXNwbGF5cy5cbiAqL1xuZnVuY3Rpb24gc3RyaXBVcmxGcmFnbWVudCh1cmw6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IGhhc2ggPSB1cmwuaW5kZXhPZignIycpO1xuXHRyZXR1cm4gaGFzaCA9PT0gLTEgPyB1cmwgOiB1cmwuc2xpY2UoMCwgaGFzaCk7XG59XG5cbi8qKlxuICogU2xpY2UgYm90aCB0aGUgcXVlcnkgYW5kIGZyYWdtZW50IG9mZiBhIHJhdyBVUkwsIHByZXNlcnZpbmcgdGhlIGV4YWN0XG4gKiBlbmNvZGluZyBvZiB0aGUgcmVtYWluaW5nIHNjaGVtZS9hdXRob3JpdHkvcGF0aC5cbiAqL1xuZnVuY3Rpb24gc3RyaXBVcmxRdWVyeUFuZEZyYWdtZW50KHVybDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3Qgc3RyaXBwZWQgPSBzdHJpcFVybEZyYWdtZW50KHVybCk7XG5cdGNvbnN0IHF1ZXJ5ID0gc3RyaXBwZWQuaW5kZXhPZignPycpO1xuXHRyZXR1cm4gcXVlcnkgPT09IC0xID8gc3RyaXBwZWQgOiBzdHJpcHBlZC5zbGljZSgwLCBxdWVyeSk7XG59XG5cbmV4cG9ydCBjbGFzcyBCcm93c2VyRWRpdG9ySW5wdXQgZXh0ZW5kcyBFZGl0b3JJbnB1dCB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guZWRpdG9yaW5wdXRzLmJyb3dzZXInO1xuXHRzdGF0aWMgcmVhZG9ubHkgRURJVE9SX0lEID0gQnJvd3NlclZpZXdFZGl0b3JJZDtcblx0c3RhdGljIHJlYWRvbmx5IERFRkFVTFRfTEFCRUwgPSBsb2NhbGl6ZSgnYnJvd3Nlci5lZGl0b3JMYWJlbCcsIFwiQnJvd3NlclwiKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pZDogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hc3NvY2lhdGVkUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaW5pdGlhbERhdGE6IElCcm93c2VyRWRpdG9ySW5wdXREYXRhO1xuXG5cdHByaXZhdGUgX21vZGVsOiBJQnJvd3NlclZpZXdNb2RlbCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbW9kZWxQcm9taXNlOiBQcm9taXNlPElCcm93c2VyVmlld01vZGVsPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbW9kZWxTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25CZWZvcmVEaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUJlZm9yZURpc3Bvc2VCcm93c2VyRWRpdG9yRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkJlZm9yZURpc3Bvc2U6IEV2ZW50PElCZWZvcmVEaXNwb3NlQnJvd3NlckVkaXRvckV2ZW50PiA9IHRoaXMuX29uQmVmb3JlRGlzcG9zZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlc29sdmVNb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElCcm93c2VyVmlld01vZGVsPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXNvbHZlTW9kZWw6IEV2ZW50PElCcm93c2VyVmlld01vZGVsPiA9IHRoaXMuX29uRGlkUmVzb2x2ZU1vZGVsLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IElCcm93c2VyRWRpdG9ySW5wdXREYXRhLFxuXHRcdHByaXZhdGUgX3Jlc29sdmVNb2RlbDogKCkgPT4gUHJvbWlzZTxJQnJvd3NlclZpZXdNb2RlbD4sXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBicm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2U6IElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5faWQgPSBvcHRpb25zLmlkO1xuXHRcdHRoaXMuX2Fzc29jaWF0ZWRSZXNvdXJjZSA9IG9wdGlvbnMuYXNzb2NpYXRlZFJlc291cmNlO1xuXHRcdHRoaXMuX2luaXRpYWxEYXRhID0gb3B0aW9ucztcblx0fVxuXG5cdGdldCBtb2RlbCgpOiBJQnJvd3NlclZpZXdNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsO1xuXHR9XG5cblx0c2V0IG1vZGVsKG1vZGVsOiBJQnJvd3NlclZpZXdNb2RlbCkge1xuXHRcdGlmICh0aGlzLl9tb2RlbCA9PT0gbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9tb2RlbFN0b3JlLmNsZWFyKCk7XG5cdFx0dGhpcy5fbW9kZWwgPSBtb2RlbDtcblxuXHRcdC8vIFNldCB1cCBjbGVhbnVwIHdoZW4gdGhlIG1vZGVsIGlzIGRpc3Bvc2VkXG5cdFx0dGhpcy5fbW9kZWxTdG9yZS5hZGQodGhpcy5fbW9kZWwub25XaWxsRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9tb2RlbFN0b3JlLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9tb2RlbCA9IHVuZGVmaW5lZDtcblx0XHR9KSk7XG5cblx0XHQvLyBBdXRvLWNsb3NlIGVkaXRvciB3aGVuIHdlYmNvbnRlbnRzIGNsb3Nlc1xuXHRcdHRoaXMuX21vZGVsU3RvcmUuYWRkKHRoaXMuX21vZGVsLm9uRGlkQ2xvc2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5kaXNwb3NlKHRydWUpO1xuXHRcdH0pKTtcblxuXHRcdC8vIExpc3RlbiBmb3IgbGFiZWwtcmVsZXZhbnQgY2hhbmdlcyB0byBmaXJlIG9uRGlkQ2hhbmdlTGFiZWxcblx0XHR0aGlzLl9tb2RlbFN0b3JlLmFkZCh0aGlzLl9tb2RlbC5vbkRpZENoYW5nZVRpdGxlKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlTGFiZWwuZmlyZSgpKSk7XG5cdFx0dGhpcy5fbW9kZWxTdG9yZS5hZGQodGhpcy5fbW9kZWwub25EaWRDaGFuZ2VGYXZpY29uKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlTGFiZWwuZmlyZSgpKSk7XG5cdFx0dGhpcy5fbW9kZWxTdG9yZS5hZGQodGhpcy5fbW9kZWwub25EaWRDaGFuZ2VMb2FkaW5nU3RhdGUoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VMYWJlbC5maXJlKCkpKTtcblx0XHR0aGlzLl9tb2RlbFN0b3JlLmFkZCh0aGlzLl9tb2RlbC5vbkRpZE5hdmlnYXRlKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlTGFiZWwuZmlyZSgpKSk7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZUxhYmVsLmZpcmUoKTtcblx0XHR0aGlzLl9vbkRpZFJlc29sdmVNb2RlbC5maXJlKG1vZGVsKTtcblx0fVxuXG5cdG9uY2VNb2RlbFJlc29sdmVzKGNiOiAobW9kZWw6IElCcm93c2VyVmlld01vZGVsKSA9PiB2b2lkKTogSURpc3Bvc2FibGUge1xuXHRcdGlmICh0aGlzLl9tb2RlbCkge1xuXHRcdFx0Y2IodGhpcy5fbW9kZWwpO1xuXHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIEV2ZW50Lm9uY2UodGhpcy5vbkRpZFJlc29sdmVNb2RlbCkoY2IpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBpZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5faWQ7XG5cdH1cblxuXHRnZXQgYXNzb2NpYXRlZFJlc291cmNlKCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2Fzc29jaWF0ZWRSZXNvdXJjZTtcblx0fVxuXG5cdGdldCB1cmwoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBVc2UgbW9kZWwgVVJMIGlmIGF2YWlsYWJsZSwgb3RoZXJ3aXNlIGZhbGwgYmFjayB0byBpbml0aWFsIGRhdGFcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwgPyB0aGlzLl9tb2RlbC51cmwgOiB0aGlzLl9pbml0aWFsRGF0YS51cmw7XG5cdH1cblxuXHRnZXQgdGl0bGUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBVc2UgbW9kZWwgdGl0bGUgaWYgYXZhaWxhYmxlLCBvdGhlcndpc2UgZmFsbCBiYWNrIHRvIGluaXRpYWwgZGF0YVxuXHRcdHJldHVybiB0aGlzLl9tb2RlbCA/IHRoaXMuX21vZGVsLnRpdGxlIDogdGhpcy5faW5pdGlhbERhdGEudGl0bGU7XG5cdH1cblxuXHRnZXQgZmF2aWNvbigpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdC8vIFVzZSBtb2RlbCBmYXZpY29uIGlmIGF2YWlsYWJsZSwgb3RoZXJ3aXNlIGZhbGwgYmFjayB0byBpbml0aWFsIGRhdGFcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwgPyB0aGlzLl9tb2RlbC5mYXZpY29uIDogdGhpcy5faW5pdGlhbERhdGEuZmF2aWNvbjtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoaXMgZWRpdG9yIHdhcyBvcGVuZWQgdmlhIGEgZGVmYXVsdCBsb2NhbGhvc3QgbGluayBvcGVuIChzZXR0aW5nXG5cdCAqIG5vdCBleHBsaWNpdGx5IGNvbmZpZ3VyZWQgYnkgdGhlIHVzZXIpLiBUcmFuc2llbnQgXHUyMDE0IG5vdCBzZXJpYWxpemVkLlxuXHQgKi9cblx0Z2V0IGlzRGVmYXVsdExpbmtPcGVuKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX2luaXRpYWxEYXRhLmlzRGVmYXVsdExpbmtPcGVuO1xuXHR9XG5cblx0Z2V0IGlzU2hhcmluZ0F2YWlsYWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwgPyB0aGlzLl9tb2RlbC5zaGFyaW5nU3RhdGUgIT09IEJyb3dzZXJWaWV3U2hhcmluZ1N0YXRlLlVuYXZhaWxhYmxlIDogdGhpcy5icm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UuaXNTaGFyaW5nQXZhaWxhYmxlO1xuXHR9XG5cblx0bmF2aWdhdGUodXJsOiBzdHJpbmcsIG9wdGlvbnM/OiBJTmF2aWdhdGVPcHRpb25zKTogdm9pZCB7XG5cdFx0Y29uc3QgZGVzdGluYXRpb24gPSB1cmwudHJpbSgpO1xuXHRcdGlmICh0aGlzLl9tb2RlbCkge1xuXHRcdFx0dm9pZCB0aGlzLl9tb2RlbC5sb2FkVVJMKGRlc3RpbmF0aW9uLCBvcHRpb25zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gSWYgdGhlIG1vZGVsIGlzbid0IGNyZWF0ZWQgeWV0LCB1cGRhdGUgdGhlIGluaXRpYWwgZGF0YSBzbyB0aGF0IHRoZSBVUkwgaXMgY29ycmVjdCB3aGVuIHRoZSBtb2RlbCBpcyBjcmVhdGVkXG5cdFx0XHR0aGlzLl9pbml0aWFsRGF0YSA9IHtcblx0XHRcdFx0aWQ6IHRoaXMuX2lkLFxuXHRcdFx0XHR1cmw6IGRlc3RpbmF0aW9uXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VMYWJlbC5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZSgpOiBQcm9taXNlPElCcm93c2VyVmlld01vZGVsPiB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbCAmJiAhdGhpcy5fbW9kZWxQcm9taXNlKSB7XG5cdFx0XHR0aGlzLl9tb2RlbFByb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9tb2RlbCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVNb2RlbCgpO1xuXHRcdFx0XHR0aGlzLl9tb2RlbFByb21pc2UgPSB1bmRlZmluZWQ7XG5cblx0XHRcdFx0cmV0dXJuIHRoaXMuX21vZGVsO1xuXHRcdFx0fSkoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsIHx8IHRoaXMuX21vZGVsUHJvbWlzZSE7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgdHlwZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIEJyb3dzZXJFZGl0b3JJbnB1dC5JRDtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBlZGl0b3JJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBCcm93c2VyRWRpdG9ySW5wdXQuRURJVE9SX0lEO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IGNhcGFiaWxpdGllcygpOiBFZGl0b3JJbnB1dENhcGFiaWxpdGllcyB7XG5cdFx0cmV0dXJuIEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLkZvcmNlUmV2ZWFsIHwgRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuUmVhZG9ubHk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgcmVzb3VyY2UoKTogVVJJIHtcblx0XHRyZXR1cm4gQnJvd3NlclZpZXdVcmkuZm9ySWQodGhpcy5faWQpO1xuXHR9XG5cblx0Z2V0IHByZWZlcnJlZFJlc291cmNlKCk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMuX2Fzc29jaWF0ZWRSZXNvdXJjZSA/PyB0aGlzLnJlc291cmNlO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0SWNvbigpOiBUaGVtZUljb24gfCBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGRlZmF1bHRJY29uID0gdGhpcy5fYXNzb2NpYXRlZFJlc291cmNlID8gdW5kZWZpbmVkIDogQ29kaWNvbi5nbG9iZTtcblxuXHRcdC8vIFVzZSBtb2RlbCBkYXRhIGlmIGF2YWlsYWJsZSwgb3RoZXJ3aXNlIGZhbGwgYmFjayB0byBpbml0aWFsIGRhdGFcblx0XHRpZiAodGhpcy5fbW9kZWwpIHtcblx0XHRcdGlmICh0aGlzLl9tb2RlbC5sb2FkaW5nKSB7XG5cdFx0XHRcdGNvbnN0IGNvbG9yID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLmdldENvbG9yKFRBQl9BQ1RJVkVfRk9SRUdST1VORCk7XG5cdFx0XHRcdHJldHVybiBVUkkucGFyc2UoJ2RhdGE6aW1hZ2Uvc3ZnK3htbDt1dGY4LCcgKyBlbmNvZGVVUklDb21wb25lbnQoTE9BRElOR19TUElOTkVSX1NWRyhjb2xvcj8udG9TdHJpbmcoKSkpKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9tb2RlbC5mYXZpY29uKSB7XG5cdFx0XHRcdHJldHVybiBVUkkucGFyc2UodGhpcy5fbW9kZWwuZmF2aWNvbik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZGVmYXVsdEljb247XG5cdFx0fVxuXHRcdC8vIE1vZGVsIG5vdCBjcmVhdGVkIHlldCwgdXNlIGluaXRpYWwgZGF0YSBpZiBhdmFpbGFibGVcblx0XHRpZiAodGhpcy5faW5pdGlhbERhdGEuZmF2aWNvbikge1xuXHRcdFx0cmV0dXJuIFVSSS5wYXJzZSh0aGlzLl9pbml0aWFsRGF0YS5mYXZpY29uKTtcblx0XHR9XG5cdFx0cmV0dXJuIGRlZmF1bHRJY29uO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0TmFtZSgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGhhc1RpdGxlID0gdGhpcy5fbW9kZWwgPyAhIXRoaXMuX21vZGVsLnRpdGxlIDogISF0aGlzLl9pbml0aWFsRGF0YS50aXRsZTtcblx0XHRpZiAoaGFzVGl0bGUpIHtcblx0XHRcdHJldHVybiB0cnVuY2F0ZSh0aGlzLnRpdGxlISwgTUFYX1RJVExFX0xFTkdUSCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmFtZSA9IHRoaXMuX2Fzc29jaWF0ZWRSZXNvdXJjZSA/IGJhc2VuYW1lKHRoaXMuX2Fzc29jaWF0ZWRSZXNvdXJjZSkgOiB0aGlzLmdldERlc2NyaXB0aW9uKFZlcmJvc2l0eS5TSE9SVCkgfHwgQnJvd3NlckVkaXRvcklucHV0LkRFRkFVTFRfTEFCRUw7XG5cdFx0cmV0dXJuIHRydW5jYXRlKG5hbWUsIE1BWF9USVRMRV9MRU5HVEgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0VGl0bGUodmVyYm9zaXR5ID0gVmVyYm9zaXR5Lk1FRElVTSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgaGFzVGl0bGUgPSB0aGlzLl9tb2RlbCA/ICEhdGhpcy5fbW9kZWwudGl0bGUgOiAhIXRoaXMuX2luaXRpYWxEYXRhLnRpdGxlO1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gdGhpcy5nZXREZXNjcmlwdGlvbih2ZXJib3NpdHkpO1xuXHRcdGNvbnN0IHRpdGxlID0gaGFzVGl0bGUgPyBgJHt0aGlzLnRpdGxlfSAoJHtkZXNjcmlwdGlvbn0pYCA6IGRlc2NyaXB0aW9uO1xuXHRcdHJldHVybiB0aXRsZSB8fCBCcm93c2VyRWRpdG9ySW5wdXQuREVGQVVMVF9MQUJFTDtcblx0fVxuXG5cdG92ZXJyaWRlIGdldERlc2NyaXB0aW9uKHZlcmJvc2l0eSA9IFZlcmJvc2l0eS5NRURJVU0pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnVybCAmJiB0aGlzLmdldFVSTFRpdGxlcy5nZXQodGhpcy51cmwpW3ZlcmJvc2l0eV07XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGdldFVSTFRpdGxlcyA9IG5ldyBMUlVDYWNoZWRGdW5jdGlvbigodXJsOiBzdHJpbmcpID0+IHtcblx0XHRsZXQgX3Nob3J0OiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IF9tZWRpdW06IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgX2xvbmc6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Ly8gSG9zdCBvbmx5LiBEZXJpdmVkIHZpYSB0aGUgV0hBVFdHIFVSTCBwYXJzZXIgc28gaXQgbWF0Y2hlcyB0aGVcblx0XHRcdC8vIGhvc3Qgc2hvd24gYnkgdGhlIG5hdmJhcidzIHJhdyBVUkwgKGUuZy4gcHVueWNvZGUgZm9yIElETnMpLlxuXHRcdFx0Z2V0IFtWZXJib3NpdHkuU0hPUlRdKCkge1xuXHRcdFx0XHRpZiAoX3Nob3J0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjb25zdCBwYXJzZWQgPSBVUkwucGFyc2UodXJsKTtcblx0XHRcdFx0XHRfc2hvcnQgPSBwYXJzZWQgPyBwYXJzZWQuaG9zdCA6IHN0cmlwVXJsUXVlcnlBbmRGcmFnbWVudCh1cmwpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBfc2hvcnQ7XG5cdFx0XHR9LFxuXHRcdFx0Ly8gUmF3IFVSTCB3aXRob3V0IHRoZSBxdWVyeS9mcmFnbWVudC4gQ29tcHV0ZWQgYnkgc3RyaW5nIHNsaWNpbmdcblx0XHRcdC8vIChub3QgYSBVUkkgcm91bmQtdHJpcCkgc28gdGhlIGRpc3BsYXllZCB0ZXh0IHN0YXlzIGJ5dGUtZm9yLWJ5dGVcblx0XHRcdC8vIGNvbnNpc3RlbnQgd2l0aCB0aGUgY2Fub25pY2FsIFVSTCBzaG93biBpbiB0aGUgbmF2YmFyLlxuXHRcdFx0Z2V0IFtWZXJib3NpdHkuTUVESVVNXSgpIHtcblx0XHRcdFx0aWYgKF9tZWRpdW0gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdF9tZWRpdW0gPSBzdHJpcFVybFF1ZXJ5QW5kRnJhZ21lbnQodXJsKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gX21lZGl1bTtcblx0XHRcdH0sXG5cdFx0XHQvLyBSYXcgVVJMIHdpdGhvdXQgdGhlIGZyYWdtZW50LCBzbGljZWQgZnJvbSB0aGUgY2Fub25pY2FsIHN0cmluZyBmb3Jcblx0XHRcdC8vIHRoZSBzYW1lIGNvbnNpc3RlbmN5IHJlYXNvbiBhcyB0aGUgbWVkaXVtIGZvcm0uXG5cdFx0XHRnZXQgW1ZlcmJvc2l0eS5MT05HXSgpIHtcblx0XHRcdFx0aWYgKF9sb25nID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRfbG9uZyA9IHN0cmlwVXJsRnJhZ21lbnQodXJsKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gX2xvbmc7XG5cdFx0XHR9XG5cdFx0fTtcblx0fSk7XG5cblx0b3ZlcnJpZGUgY2FuUmVvcGVuKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0b3ZlcnJpZGUgbWF0Y2hlcyhvdGhlcklucHV0OiBFZGl0b3JJbnB1dCB8IElVbnR5cGVkRWRpdG9ySW5wdXQpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fYXNzb2NpYXRlZFJlc291cmNlICYmICEob3RoZXJJbnB1dCBpbnN0YW5jZW9mIEVkaXRvcklucHV0KSAmJiBoYXNLZXkob3RoZXJJbnB1dCwgeyByZXNvdXJjZTogdHJ1ZSB9KSAmJiBpc0VxdWFsKHRoaXMuX2Fzc29jaWF0ZWRSZXNvdXJjZSwgb3RoZXJJbnB1dC5yZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiBvdGhlcklucHV0Lm9wdGlvbnM/Lm92ZXJyaWRlID09PSBCcm93c2VyRWRpdG9ySW5wdXQuRURJVE9SX0lEO1xuXHRcdH1cblxuXHRcdGlmIChzdXBlci5tYXRjaGVzKG90aGVySW5wdXQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAob3RoZXJJbnB1dCBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3JJbnB1dCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2lkID09PSBvdGhlcklucHV0Ll9pZDtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiBpdCdzIGFuIHVudHlwZWQgaW5wdXQgd2l0aCBhIGJyb3dzZXIgdmlldyByZXNvdXJjZVxuXHRcdGlmIChoYXNLZXkob3RoZXJJbnB1dCwgeyByZXNvdXJjZTogdHJ1ZSB9KSAmJiBvdGhlcklucHV0LnJlc291cmNlPy5zY2hlbWUgPT09IEJyb3dzZXJWaWV3VXJpLnNjaGVtZSkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gQnJvd3NlclZpZXdVcmkucGFyc2Uob3RoZXJJbnB1dC5yZXNvdXJjZSk7XG5cdFx0XHRpZiAocGFyc2VkKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9pZCA9PT0gcGFyc2VkLmlkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgY29weSBvZiB0aGlzIGJyb3dzZXIgZWRpdG9yIGlucHV0IHdpdGggYSBuZXcgdW5pcXVlIElELCBjcmVhdGluZyBhbiBpbmRlcGVuZGVudCBicm93c2VyIHZpZXcgd2l0aCBubyBsaW5rZWQgc3RhdGUuXG5cdCAqIFRoaXMgaXMgdXNlZCBkdXJpbmcgQ29weSBpbnRvIE5ldyBXaW5kb3cuXG5cdCAqL1xuXHRvdmVycmlkZSBjb3B5KCk6IEVkaXRvcklucHV0IHtcblx0XHRsb2dCcm93c2VyT3Blbih0aGlzLnRlbGVtZXRyeVNlcnZpY2UsICdjb3B5VG9OZXdXaW5kb3cnKTtcblxuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKChhY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgYnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRcdFx0cmV0dXJuIGJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZS5nZXRPckNyZWF0ZUxhenkoZ2VuZXJhdGVVdWlkKCksIHtcblx0XHRcdFx0dXJsOiB0aGlzLnVybCxcblx0XHRcdFx0dGl0bGU6IHRoaXMudGl0bGUsXG5cdFx0XHRcdGZhdmljb246IHRoaXMuZmF2aWNvblxuXHRcdFx0fSwgdGhpcy5fYXNzb2NpYXRlZFJlc291cmNlKTtcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHRvVW50eXBlZCgpOiBJVW50eXBlZEVkaXRvcklucHV0IHtcblx0XHRjb25zdCB2aWV3U3RhdGU6IElCcm93c2VyRWRpdG9yVmlld1N0YXRlID0ge1xuXHRcdFx0dXJsOiB0aGlzLnVybCxcblx0XHRcdHRpdGxlOiB0aGlzLnRpdGxlLFxuXHRcdFx0ZmF2aWNvbjogdGhpcy5mYXZpY29uXG5cdFx0fTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2U6IHRoaXMucHJlZmVycmVkUmVzb3VyY2UsXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdG92ZXJyaWRlOiBCcm93c2VyRWRpdG9ySW5wdXQuRURJVE9SX0lELFxuXHRcdFx0XHR2aWV3U3RhdGVcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmVuYW1lKF9ncm91cDogR3JvdXBJZGVudGlmaWVyLCB0YXJnZXQ6IFVSSSk6IFByb21pc2U8SU1vdmVSZXN1bHQgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuX2Fzc29jaWF0ZWRSZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50VXJsID0gdGhpcy51cmw7XG5cdFx0bGV0IHJlbmFtZWRVcmwgPSBjdXJyZW50VXJsO1xuXHRcdGlmIChjdXJyZW50VXJsICYmIGlzQnJvd3NlclZpZXdBc3NvY2lhdGVkUmVzb3VyY2VOYXZpZ2F0aW9uKHRoaXMuX2Fzc29jaWF0ZWRSZXNvdXJjZSwgY3VycmVudFVybCkpIHtcblx0XHRcdGNvbnN0IGN1cnJlbnRSZXNvdXJjZSA9IFVSSS5wYXJzZShjdXJyZW50VXJsKTtcblx0XHRcdHJlbmFtZWRVcmwgPSB0YXJnZXQud2l0aCh7IHF1ZXJ5OiBjdXJyZW50UmVzb3VyY2UucXVlcnksIGZyYWdtZW50OiBjdXJyZW50UmVzb3VyY2UuZnJhZ21lbnQgfSkudG9TdHJpbmcoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGVkaXRvcjoge1xuXHRcdFx0XHRyZXNvdXJjZTogdGFyZ2V0LFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0b3ZlcnJpZGU6IEJyb3dzZXJFZGl0b3JJbnB1dC5FRElUT1JfSUQsXG5cdFx0XHRcdFx0dmlld1N0YXRlOiB7XG5cdFx0XHRcdFx0XHR1cmw6IHJlbmFtZWRVcmwsXG5cdFx0XHRcdFx0XHR0aXRsZTogdGhpcy50aXRsZSxcblx0XHRcdFx0XHRcdGZhdmljb246IHRoaXMuZmF2aWNvblxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKGZvcmNlPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghZm9yY2UpIHtcblx0XHRcdGxldCB2ZXRvZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuX29uQmVmb3JlRGlzcG9zZS5maXJlKHsgdmV0bzogKCkgPT4geyB2ZXRvZWQgPSB0cnVlOyB9IH0pO1xuXHRcdFx0aWYgKHZldG9lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0c3VwZXIuZGlzcG9zZSgpOyAvLyBFbWl0IGBvbldpbGxEaXNwb3NlYCBldmVudCBmaXJzdCwgdGhlbiBjbGVhbiB1cCB0aGUgbW9kZWwuXG5cdFx0aWYgKHRoaXMuX21vZGVsKSB7XG5cdFx0XHQvLyBgdG9VbnR5cGVkKClgIGlzIGNhbGxlZCBhZnRlciBkaXNwb3NhbC4gU3RvcmUgdGhlIGxhdGVzdCBkYXRhIGluIGBfaW5pdGlhbERhdGFgIHNvIHdlIGNhbiBzdGlsbCBnZXQgdGhlbSB0aGVyZS5cblx0XHRcdHRoaXMuX2luaXRpYWxEYXRhID0ge1xuXHRcdFx0XHRpZDogdGhpcy5faWQsXG5cdFx0XHRcdHVybDogdGhpcy5fbW9kZWwudXJsLFxuXHRcdFx0XHR0aXRsZTogdGhpcy5fbW9kZWwudGl0bGUsXG5cdFx0XHRcdGZhdmljb246IHRoaXMuX21vZGVsLmZhdmljb25cblx0XHRcdH07XG5cdFx0XHR0aGlzLl9tb2RlbC5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9tb2RlbCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRzZXJpYWxpemUoKTogSUJyb3dzZXJFZGl0b3JJbnB1dERhdGEge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogdGhpcy5faWQsXG5cdFx0XHRhc3NvY2lhdGVkUmVzb3VyY2U6IHRoaXMuX2Fzc29jaWF0ZWRSZXNvdXJjZSxcblx0XHRcdHVybDogdGhpcy51cmwsXG5cdFx0XHR0aXRsZTogdGhpcy50aXRsZSxcblx0XHRcdGZhdmljb246IHRoaXMuZmF2aWNvblxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEJyb3dzZXJFZGl0b3JTZXJpYWxpemVyIGltcGxlbWVudHMgSUVkaXRvclNlcmlhbGl6ZXIge1xuXHRjYW5TZXJpYWxpemUoZWRpdG9ySW5wdXQ6IEVkaXRvcklucHV0KTogZWRpdG9ySW5wdXQgaXMgQnJvd3NlckVkaXRvcklucHV0IHtcblx0XHRyZXR1cm4gZWRpdG9ySW5wdXQgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9ySW5wdXQ7XG5cdH1cblxuXHRzZXJpYWxpemUoZWRpdG9ySW5wdXQ6IEVkaXRvcklucHV0KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuY2FuU2VyaWFsaXplKGVkaXRvcklucHV0KSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoZWRpdG9ySW5wdXQuc2VyaWFsaXplKCkpO1xuXHR9XG5cblx0ZGVzZXJpYWxpemUoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgc2VyaWFsaXplZEVkaXRvcjogc3RyaW5nKTogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBkYXRhOiBJQnJvd3NlckVkaXRvcklucHV0RGF0YSA9IEpTT04ucGFyc2Uoc2VyaWFsaXplZEVkaXRvcik7XG5cdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oKGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSA9IGFjY2Vzc29yLmdldChJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlKTtcblx0XHRcdFx0cmV0dXJuIGJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZS5nZXRPckNyZWF0ZUxhenkoZGF0YS5pZCwge1xuXHRcdFx0XHRcdHVybDogZGF0YS51cmwsXG5cdFx0XHRcdFx0dGl0bGU6IGRhdGEudGl0bGUsXG5cdFx0XHRcdFx0ZmF2aWNvbjogZGF0YS5mYXZpY29uXG5cdFx0XHRcdH0sIFVSSS5yZXZpdmUoZGF0YS5hc3NvY2lhdGVkUmVzb3VyY2UpKTtcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsVUFBVSxlQUFlO0FBQ2xDLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHlCQUFvRSw4QkFBOEIsMkJBQTJCO0FBQ3RJLFNBQVMseUJBQStGLGlCQUFpQjtBQUN6SCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLGNBQWM7QUFDdkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGlEQUFpRDtBQUUxRCxNQUFNLHNCQUFzQixDQUFDLFVBQThCO0FBQUE7QUFBQSxxR0FFMEMsS0FBSztBQUFBLG1FQUN2QyxLQUFLO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFTeEUsTUFBTSxtQkFBbUI7QUF1QnpCLFNBQVMsaUJBQWlCLEtBQXFCO0FBQzlDLFFBQU0sT0FBTyxJQUFJLFFBQVEsR0FBRztBQUM1QixTQUFPLFNBQVMsS0FBSyxNQUFNLElBQUksTUFBTSxHQUFHLElBQUk7QUFDN0M7QUFNQSxTQUFTLHlCQUF5QixLQUFxQjtBQUN0RCxRQUFNLFdBQVcsaUJBQWlCLEdBQUc7QUFDckMsUUFBTSxRQUFRLFNBQVMsUUFBUSxHQUFHO0FBQ2xDLFNBQU8sVUFBVSxLQUFLLFdBQVcsU0FBUyxNQUFNLEdBQUcsS0FBSztB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
