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
import { Event, PauseableEmitter } from "../../../base/common/event.js";
import { Iterable } from "../../../base/common/iterator.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import { cloneAndChange, distinct, equals } from "../../../base/common/objects.js";
import { TernarySearchTree } from "../../../base/common/ternarySearchTree.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { CommandsRegistry } from "../../commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService } from "../../configuration/common/configuration.js";
import { IContextKeyService, RawContextKey } from "../common/contextkey.js";
import { InputFocusedContext } from "../common/contextkeys.js";
import { mainWindow } from "../../../base/browser/window.js";
import { addDisposableListener, EventType, getActiveWindow, isEditableElement, onDidRegisterWindow, trackFocus } from "../../../base/browser/dom.js";
const KEYBINDING_CONTEXT_ATTR = "data-keybinding-context";
class Context {
  constructor(id, parent) {
    this._id = id;
    this._parent = parent;
    this._value = /* @__PURE__ */ Object.create(null);
    this._value["_contextId"] = id;
  }
  get value() {
    return { ...this._value };
  }
  setValue(key, value) {
    if (!equals(this._value[key], value)) {
      this._value[key] = value;
      return true;
    }
    return false;
  }
  removeValue(key) {
    if (key in this._value) {
      delete this._value[key];
      return true;
    }
    return false;
  }
  getValue(key) {
    const ret = this._value[key];
    if (typeof ret === "undefined" && this._parent) {
      return this._parent.getValue(key);
    }
    return ret;
  }
  updateParent(parent) {
    this._parent = parent;
  }
  collectAllValues() {
    let result = this._parent ? this._parent.collectAllValues() : /* @__PURE__ */ Object.create(null);
    result = { ...result, ...this._value };
    delete result["_contextId"];
    return result;
  }
}
const _NullContext = class _NullContext extends Context {
  constructor() {
    super(-1, null);
  }
  setValue(key, value) {
    return false;
  }
  removeValue(key) {
    return false;
  }
  getValue(key) {
    return void 0;
  }
  collectAllValues() {
    return /* @__PURE__ */ Object.create(null);
  }
};
_NullContext.INSTANCE = new _NullContext();
let NullContext = _NullContext;
const _ConfigAwareContextValuesContainer = class _ConfigAwareContextValuesContainer extends Context {
  constructor(id, _configurationService, emitter) {
    super(id, null);
    this._configurationService = _configurationService;
    this._values = TernarySearchTree.forConfigKeys();
    this._listener = this._configurationService.onDidChangeConfiguration((event) => {
      if (event.source === ConfigurationTarget.DEFAULT) {
        const allKeys = Array.from(this._values, ([k]) => k);
        this._values.clear();
        emitter.fire(new ArrayContextKeyChangeEvent(allKeys));
      } else {
        const changedKeys = [];
        for (const configKey of event.affectedKeys) {
          const contextKey = `config.${configKey}`;
          const cachedItems = this._values.findSuperstr(contextKey);
          if (cachedItems !== void 0) {
            changedKeys.push(...Iterable.map(cachedItems, ([key]) => key));
            this._values.deleteSuperstr(contextKey);
          }
          if (this._values.has(contextKey)) {
            changedKeys.push(contextKey);
            this._values.delete(contextKey);
          }
        }
        emitter.fire(new ArrayContextKeyChangeEvent(changedKeys));
      }
    });
  }
  dispose() {
    this._listener.dispose();
  }
  getValue(key) {
    if (key.indexOf(_ConfigAwareContextValuesContainer._keyPrefix) !== 0) {
      return super.getValue(key);
    }
    if (this._values.has(key)) {
      return this._values.get(key);
    }
    const configKey = key.substr(_ConfigAwareContextValuesContainer._keyPrefix.length);
    const configValue = this._configurationService.getValue(configKey);
    let value = void 0;
    switch (typeof configValue) {
      case "number":
      case "boolean":
      case "string":
        value = configValue;
        break;
      default:
        if (Array.isArray(configValue)) {
          value = JSON.stringify(configValue);
        } else {
          value = configValue;
        }
    }
    this._values.set(key, value);
    return value;
  }
  setValue(key, value) {
    return super.setValue(key, value);
  }
  removeValue(key) {
    return super.removeValue(key);
  }
  collectAllValues() {
    const result = /* @__PURE__ */ Object.create(null);
    this._values.forEach((value, index) => result[index] = value);
    return { ...result, ...super.collectAllValues() };
  }
};
_ConfigAwareContextValuesContainer._keyPrefix = "config.";
let ConfigAwareContextValuesContainer = _ConfigAwareContextValuesContainer;
class ContextKey {
  constructor(service, key, defaultValue) {
    this._service = service;
    this._key = key;
    this._defaultValue = defaultValue;
    this.reset();
  }
  set(value) {
    this._service.setContext(this._key, value);
  }
  reset() {
    if (typeof this._defaultValue === "undefined") {
      this._service.removeContext(this._key);
    } else {
      this._service.setContext(this._key, this._defaultValue);
    }
  }
  get() {
    return this._service.getContextKeyValue(this._key);
  }
}
class SimpleContextKeyChangeEvent {
  constructor(key) {
    this.key = key;
  }
  affectsSome(keys) {
    return keys.has(this.key);
  }
  allKeysContainedIn(keys) {
    return this.affectsSome(keys);
  }
}
class ArrayContextKeyChangeEvent {
  constructor(keys) {
    this.keys = keys;
  }
  affectsSome(keys) {
    for (const key of this.keys) {
      if (keys.has(key)) {
        return true;
      }
    }
    return false;
  }
  allKeysContainedIn(keys) {
    return this.keys.every((key) => keys.has(key));
  }
}
class CompositeContextKeyChangeEvent {
  constructor(events) {
    this.events = events;
  }
  affectsSome(keys) {
    for (const e of this.events) {
      if (e.affectsSome(keys)) {
        return true;
      }
    }
    return false;
  }
  allKeysContainedIn(keys) {
    return this.events.every((evt) => evt.allKeysContainedIn(keys));
  }
}
function allEventKeysInContext(event, context) {
  return event.allKeysContainedIn(new Set(Object.keys(context)));
}
class AbstractContextKeyService extends Disposable {
  constructor(myContextId) {
    super();
    this._onDidChangeContext = this._register(new PauseableEmitter({ merge: (input) => new CompositeContextKeyChangeEvent(input) }));
    this._isDisposed = false;
    this._myContextId = myContextId;
  }
  get onDidChangeContext() {
    return this._onDidChangeContext.event;
  }
  get contextId() {
    return this._myContextId;
  }
  createKey(key, defaultValue) {
    if (this._isDisposed) {
      throw new Error(`AbstractContextKeyService has been disposed`);
    }
    return new ContextKey(this, key, defaultValue);
  }
  bufferChangeEvents(callback) {
    this._onDidChangeContext.pause();
    try {
      callback();
    } finally {
      this._onDidChangeContext.resume();
    }
  }
  createScoped(domNode) {
    if (this._isDisposed) {
      throw new Error(`AbstractContextKeyService has been disposed`);
    }
    return new ScopedContextKeyService(this, domNode);
  }
  createOverlay(overlay = Iterable.empty()) {
    if (this._isDisposed) {
      throw new Error(`AbstractContextKeyService has been disposed`);
    }
    return new OverlayContextKeyService(this, overlay);
  }
  contextMatchesRules(rules) {
    if (this._isDisposed) {
      throw new Error(`AbstractContextKeyService has been disposed`);
    }
    const context = this.getContextValuesContainer(this._myContextId);
    const result = rules ? rules.evaluate(context) : true;
    return result;
  }
  getContextKeyValue(key) {
    if (this._isDisposed) {
      return void 0;
    }
    return this.getContextValuesContainer(this._myContextId).getValue(key);
  }
  setContext(key, value) {
    if (this._isDisposed) {
      return;
    }
    const myContext = this.getContextValuesContainer(this._myContextId);
    if (!myContext) {
      return;
    }
    if (myContext.setValue(key, value)) {
      this._onDidChangeContext.fire(new SimpleContextKeyChangeEvent(key));
    }
  }
  removeContext(key) {
    if (this._isDisposed) {
      return;
    }
    if (this.getContextValuesContainer(this._myContextId).removeValue(key)) {
      this._onDidChangeContext.fire(new SimpleContextKeyChangeEvent(key));
    }
  }
  getContext(target) {
    if (this._isDisposed) {
      return NullContext.INSTANCE;
    }
    return this.getContextValuesContainer(findContextAttr(target));
  }
  dispose() {
    super.dispose();
    this._isDisposed = true;
  }
}
let ContextKeyService = class extends AbstractContextKeyService {
  constructor(configurationService) {
    super(0);
    this._contexts = /* @__PURE__ */ new Map();
    this._lastContextId = 0;
    this.inputFocusedContext = InputFocusedContext.bindTo(this);
    const myContext = this._register(new ConfigAwareContextValuesContainer(this._myContextId, configurationService, this._onDidChangeContext));
    this._contexts.set(this._myContextId, myContext);
    this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
      const onFocusDisposables = disposables.add(new MutableDisposable());
      disposables.add(addDisposableListener(window, EventType.FOCUS_IN, () => {
        onFocusDisposables.value = new DisposableStore();
        this.updateInputContextKeys(window.document, onFocusDisposables.value);
      }, true));
    }, { window: mainWindow, disposables: this._store }));
  }
  updateInputContextKeys(ownerDocument, disposables) {
    function activeElementIsInput() {
      return !!ownerDocument.activeElement && isEditableElement(ownerDocument.activeElement);
    }
    const isInputFocused = activeElementIsInput();
    this.inputFocusedContext.set(isInputFocused);
    if (isInputFocused) {
      const tracker = disposables.add(trackFocus(ownerDocument.activeElement));
      Event.once(tracker.onDidBlur)(() => {
        if (getActiveWindow().document === ownerDocument) {
          this.inputFocusedContext.set(activeElementIsInput());
        }
        tracker.dispose();
      }, void 0, disposables);
    }
  }
  getContextValuesContainer(contextId) {
    if (this._isDisposed) {
      return NullContext.INSTANCE;
    }
    return this._contexts.get(contextId) || NullContext.INSTANCE;
  }
  createChildContext(parentContextId = this._myContextId) {
    if (this._isDisposed) {
      throw new Error(`ContextKeyService has been disposed`);
    }
    const id = ++this._lastContextId;
    this._contexts.set(id, new Context(id, this.getContextValuesContainer(parentContextId)));
    return id;
  }
  disposeContext(contextId) {
    if (!this._isDisposed) {
      this._contexts.delete(contextId);
    }
  }
  updateParent(_parentContextKeyService) {
    throw new Error("Cannot update parent of root ContextKeyService");
  }
};
ContextKeyService = __decorateClass([
  __decorateParam(0, IConfigurationService)
], ContextKeyService);
class ScopedContextKeyService extends AbstractContextKeyService {
  constructor(parent, domNode) {
    super(parent.createChildContext());
    this._parentChangeListener = this._register(new MutableDisposable());
    this._parent = parent;
    this._updateParentChangeListener();
    this._domNode = domNode;
    if (this._domNode.hasAttribute(KEYBINDING_CONTEXT_ATTR)) {
      let extraInfo = "";
      if (this._domNode.classList) {
        extraInfo = Array.from(this._domNode.classList.values()).join(", ");
      }
      console.error(`Element already has context attribute${extraInfo ? ": " + extraInfo : ""}`);
    }
    this._domNode.setAttribute(KEYBINDING_CONTEXT_ATTR, String(this._myContextId));
  }
  _updateParentChangeListener() {
    this._parentChangeListener.value = this._parent.onDidChangeContext((e) => {
      const thisContainer = this._parent.getContextValuesContainer(this._myContextId);
      const thisContextValues = thisContainer.value;
      if (!allEventKeysInContext(e, thisContextValues)) {
        this._onDidChangeContext.fire(e);
      }
    });
  }
  dispose() {
    if (this._isDisposed) {
      return;
    }
    this._parentChangeListener.clear();
    this._parent.disposeContext(this._myContextId);
    this._domNode.removeAttribute(KEYBINDING_CONTEXT_ATTR);
    super.dispose();
  }
  getContextValuesContainer(contextId) {
    if (this._isDisposed) {
      return NullContext.INSTANCE;
    }
    return this._parent.getContextValuesContainer(contextId);
  }
  createChildContext(parentContextId = this._myContextId) {
    if (this._isDisposed) {
      throw new Error(`ScopedContextKeyService has been disposed`);
    }
    return this._parent.createChildContext(parentContextId);
  }
  disposeContext(contextId) {
    this._parent.disposeContext(contextId);
  }
  updateParent(parentContextKeyService) {
    if (this._parent === parentContextKeyService) {
      return;
    }
    const thisContainer = this._parent.getContextValuesContainer(this._myContextId);
    const oldAllValues = thisContainer.collectAllValues();
    this._parent = parentContextKeyService;
    this._updateParentChangeListener();
    const newParentContainer = this._parent.getContextValuesContainer(this._parent.contextId);
    thisContainer.updateParent(newParentContainer);
    const newAllValues = thisContainer.collectAllValues();
    const allValuesDiff = {
      ...distinct(oldAllValues, newAllValues),
      ...distinct(newAllValues, oldAllValues)
    };
    const changedKeys = Object.keys(allValuesDiff);
    this._onDidChangeContext.fire(new ArrayContextKeyChangeEvent(changedKeys));
  }
}
class OverlayContext {
  constructor(parent, overlay) {
    this.parent = parent;
    this.overlay = overlay;
  }
  getValue(key) {
    return this.overlay.has(key) ? this.overlay.get(key) : this.parent.getValue(key);
  }
}
class OverlayContextKeyService {
  constructor(parent, overlay) {
    this.parent = parent;
    this.overlay = new Map(overlay);
  }
  get contextId() {
    return this.parent.contextId;
  }
  get onDidChangeContext() {
    return this.parent.onDidChangeContext;
  }
  bufferChangeEvents(callback) {
    this.parent.bufferChangeEvents(callback);
  }
  createKey() {
    throw new Error("Not supported.");
  }
  getContext(target) {
    return new OverlayContext(this.parent.getContext(target), this.overlay);
  }
  getContextValuesContainer(contextId) {
    const parentContext = this.parent.getContextValuesContainer(contextId);
    return new OverlayContext(parentContext, this.overlay);
  }
  contextMatchesRules(rules) {
    const context = this.getContextValuesContainer(this.contextId);
    const result = rules ? rules.evaluate(context) : true;
    return result;
  }
  getContextKeyValue(key) {
    return this.overlay.has(key) ? this.overlay.get(key) : this.parent.getContextKeyValue(key);
  }
  createScoped() {
    throw new Error("Not supported.");
  }
  createOverlay(overlay = Iterable.empty()) {
    return new OverlayContextKeyService(this, overlay);
  }
  updateParent() {
    throw new Error("Not supported.");
  }
}
function findContextAttr(domNode) {
  while (domNode) {
    if (domNode.hasAttribute(KEYBINDING_CONTEXT_ATTR)) {
      const attr = domNode.getAttribute(KEYBINDING_CONTEXT_ATTR);
      if (attr) {
        return parseInt(attr, 10);
      }
      return NaN;
    }
    domNode = domNode.parentElement;
  }
  return 0;
}
function setContext(accessor, contextKey, contextValue) {
  const contextKeyService = accessor.get(IContextKeyService);
  contextKeyService.createKey(String(contextKey), stringifyURIs(contextValue));
}
function stringifyURIs(contextValue) {
  return cloneAndChange(contextValue, (obj) => {
    if (typeof obj === "object" && obj.$mid === MarshalledId.Uri) {
      return URI.revive(obj).toString();
    }
    if (obj instanceof URI) {
      return obj.toString();
    }
    return void 0;
  });
}
CommandsRegistry.registerCommand("_setContext", setContext);
CommandsRegistry.registerCommand({
  id: "getContextKeyInfo",
  handler() {
    return [...RawContextKey.all()].sort((a, b) => a.key.localeCompare(b.key));
  },
  metadata: {
    description: localize("getContextKeyInfo", "A command that returns information about context keys"),
    args: []
  }
});
CommandsRegistry.registerCommand("_generateContextKeyInfo", function() {
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  for (const info of RawContextKey.all()) {
    if (!seen.has(info.key)) {
      seen.add(info.key);
      result.push(info);
    }
  }
  result.sort((a, b) => a.key.localeCompare(b.key));
  console.log(JSON.stringify(result, void 0, 2));
});
export {
  AbstractContextKeyService,
  Context,
  ContextKeyService,
  setContext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcY29udGV4dGtleVxcYnJvd3NlclxcY29udGV4dEtleVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCwgUGF1c2VhYmxlRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZE9iamVjdCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRJZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCB7IGNsb25lQW5kQ2hhbmdlLCBkaXN0aW5jdCwgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBUZXJuYXJ5U2VhcmNoVHJlZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Rlcm5hcnlTZWFyY2hUcmVlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHJlc3Npb24sIENvbnRleHRLZXlJbmZvLCBDb250ZXh0S2V5VmFsdWUsIElDb250ZXh0LCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlDaGFuZ2VFdmVudCwgSUNvbnRleHRLZXlTZXJ2aWNlLCBJQ29udGV4dEtleVNlcnZpY2VUYXJnZXQsIElSZWFkYWJsZVNldCwgSVNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSW5wdXRGb2N1c2VkQ29udGV4dCB9IGZyb20gJy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIEV2ZW50VHlwZSwgZ2V0QWN0aXZlV2luZG93LCBpc0VkaXRhYmxlRWxlbWVudCwgb25EaWRSZWdpc3RlcldpbmRvdywgdHJhY2tGb2N1cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuXG5jb25zdCBLRVlCSU5ESU5HX0NPTlRFWFRfQVRUUiA9ICdkYXRhLWtleWJpbmRpbmctY29udGV4dCc7XG5cbmV4cG9ydCBjbGFzcyBDb250ZXh0IGltcGxlbWVudHMgSUNvbnRleHQge1xuXG5cdHByb3RlY3RlZCBfcGFyZW50OiBDb250ZXh0IHwgbnVsbDtcblx0cHJvdGVjdGVkIF92YWx1ZTogUmVjb3JkPHN0cmluZywgYW55Pjtcblx0cHJvdGVjdGVkIF9pZDogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKGlkOiBudW1iZXIsIHBhcmVudDogQ29udGV4dCB8IG51bGwpIHtcblx0XHR0aGlzLl9pZCA9IGlkO1xuXHRcdHRoaXMuX3BhcmVudCA9IHBhcmVudDtcblx0XHR0aGlzLl92YWx1ZSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5fdmFsdWVbJ19jb250ZXh0SWQnXSA9IGlkO1xuXHR9XG5cblx0cHVibGljIGdldCB2YWx1ZSgpOiBSZWNvcmQ8c3RyaW5nLCBhbnk+IHtcblx0XHRyZXR1cm4geyAuLi50aGlzLl92YWx1ZSB9O1xuXHR9XG5cblx0cHVibGljIHNldFZhbHVlKGtleTogc3RyaW5nLCB2YWx1ZTogYW55KTogYm9vbGVhbiB7XG5cdFx0Ly8gY29uc29sZS5sb2coJ1NFVCAnICsga2V5ICsgJyA9ICcgKyB2YWx1ZSArICcgT04gJyArIHRoaXMuX2lkKTtcblx0XHRpZiAoIWVxdWFscyh0aGlzLl92YWx1ZVtrZXldLCB2YWx1ZSkpIHtcblx0XHRcdHRoaXMuX3ZhbHVlW2tleV0gPSB2YWx1ZTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlVmFsdWUoa2V5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHQvLyBjb25zb2xlLmxvZygnUkVNT1ZFICcgKyBrZXkgKyAnIEZST00gJyArIHRoaXMuX2lkKTtcblx0XHRpZiAoa2V5IGluIHRoaXMuX3ZhbHVlKSB7XG5cdFx0XHRkZWxldGUgdGhpcy5fdmFsdWVba2V5XTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VmFsdWU8VD4oa2V5OiBzdHJpbmcpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXQgPSB0aGlzLl92YWx1ZVtrZXldO1xuXHRcdGlmICh0eXBlb2YgcmV0ID09PSAndW5kZWZpbmVkJyAmJiB0aGlzLl9wYXJlbnQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9wYXJlbnQuZ2V0VmFsdWU8VD4oa2V5KTtcblx0XHR9XG5cdFx0cmV0dXJuIHJldDtcblx0fVxuXG5cdHB1YmxpYyB1cGRhdGVQYXJlbnQocGFyZW50OiBDb250ZXh0KTogdm9pZCB7XG5cdFx0dGhpcy5fcGFyZW50ID0gcGFyZW50O1xuXHR9XG5cblx0cHVibGljIGNvbGxlY3RBbGxWYWx1ZXMoKTogUmVjb3JkPHN0cmluZywgYW55PiB7XG5cdFx0bGV0IHJlc3VsdCA9IHRoaXMuX3BhcmVudCA/IHRoaXMuX3BhcmVudC5jb2xsZWN0QWxsVmFsdWVzKCkgOiBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdHJlc3VsdCA9IHsgLi4ucmVzdWx0LCAuLi50aGlzLl92YWx1ZSB9O1xuXHRcdGRlbGV0ZSByZXN1bHRbJ19jb250ZXh0SWQnXTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmNsYXNzIE51bGxDb250ZXh0IGV4dGVuZHMgQ29udGV4dCB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElOU1RBTkNFID0gbmV3IE51bGxDb250ZXh0KCk7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoLTEsIG51bGwpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHNldFZhbHVlKGtleTogc3RyaW5nLCB2YWx1ZTogYW55KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHJlbW92ZVZhbHVlKGtleTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldFZhbHVlPFQ+KGtleTogc3RyaW5nKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdG92ZXJyaWRlIGNvbGxlY3RBbGxWYWx1ZXMoKTogeyBba2V5OiBzdHJpbmddOiBhbnkgfSB7XG5cdFx0cmV0dXJuIE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdH1cbn1cblxuY2xhc3MgQ29uZmlnQXdhcmVDb250ZXh0VmFsdWVzQ29udGFpbmVyIGV4dGVuZHMgQ29udGV4dCB7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9rZXlQcmVmaXggPSAnY29uZmlnLic7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdmFsdWVzID0gVGVybmFyeVNlYXJjaFRyZWUuZm9yQ29uZmlnS2V5czxhbnk+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpc3RlbmVyOiBJRGlzcG9zYWJsZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpZDogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0ZW1pdHRlcjogRW1pdHRlcjxJQ29udGV4dEtleUNoYW5nZUV2ZW50PlxuXHQpIHtcblx0XHRzdXBlcihpZCwgbnVsbCk7XG5cblx0XHR0aGlzLl9saXN0ZW5lciA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihldmVudCA9PiB7XG5cdFx0XHRpZiAoZXZlbnQuc291cmNlID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LkRFRkFVTFQpIHtcblx0XHRcdFx0Ly8gbmV3IHNldHRpbmcsIHJlc2V0IGV2ZXJ5dGhpbmdcblx0XHRcdFx0Y29uc3QgYWxsS2V5cyA9IEFycmF5LmZyb20odGhpcy5fdmFsdWVzLCAoW2tdKSA9PiBrKTtcblx0XHRcdFx0dGhpcy5fdmFsdWVzLmNsZWFyKCk7XG5cdFx0XHRcdGVtaXR0ZXIuZmlyZShuZXcgQXJyYXlDb250ZXh0S2V5Q2hhbmdlRXZlbnQoYWxsS2V5cykpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgY2hhbmdlZEtleXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgY29uZmlnS2V5IG9mIGV2ZW50LmFmZmVjdGVkS2V5cykge1xuXHRcdFx0XHRcdGNvbnN0IGNvbnRleHRLZXkgPSBgY29uZmlnLiR7Y29uZmlnS2V5fWA7XG5cblx0XHRcdFx0XHRjb25zdCBjYWNoZWRJdGVtcyA9IHRoaXMuX3ZhbHVlcy5maW5kU3VwZXJzdHIoY29udGV4dEtleSk7XG5cdFx0XHRcdFx0aWYgKGNhY2hlZEl0ZW1zICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGNoYW5nZWRLZXlzLnB1c2goLi4uSXRlcmFibGUubWFwKGNhY2hlZEl0ZW1zLCAoW2tleV0pID0+IGtleSkpO1xuXHRcdFx0XHRcdFx0dGhpcy5fdmFsdWVzLmRlbGV0ZVN1cGVyc3RyKGNvbnRleHRLZXkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICh0aGlzLl92YWx1ZXMuaGFzKGNvbnRleHRLZXkpKSB7XG5cdFx0XHRcdFx0XHRjaGFuZ2VkS2V5cy5wdXNoKGNvbnRleHRLZXkpO1xuXHRcdFx0XHRcdFx0dGhpcy5fdmFsdWVzLmRlbGV0ZShjb250ZXh0S2V5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRlbWl0dGVyLmZpcmUobmV3IEFycmF5Q29udGV4dEtleUNoYW5nZUV2ZW50KGNoYW5nZWRLZXlzKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2xpc3RlbmVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFZhbHVlKGtleTogc3RyaW5nKTogYW55IHtcblxuXHRcdGlmIChrZXkuaW5kZXhPZihDb25maWdBd2FyZUNvbnRleHRWYWx1ZXNDb250YWluZXIuX2tleVByZWZpeCkgIT09IDApIHtcblx0XHRcdHJldHVybiBzdXBlci5nZXRWYWx1ZShrZXkpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl92YWx1ZXMuaGFzKGtleSkpIHtcblx0XHRcdHJldHVybiB0aGlzLl92YWx1ZXMuZ2V0KGtleSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29uZmlnS2V5ID0ga2V5LnN1YnN0cihDb25maWdBd2FyZUNvbnRleHRWYWx1ZXNDb250YWluZXIuX2tleVByZWZpeC5sZW5ndGgpO1xuXHRcdGNvbnN0IGNvbmZpZ1ZhbHVlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoY29uZmlnS2V5KTtcblx0XHRsZXQgdmFsdWU6IGFueSA9IHVuZGVmaW5lZDtcblx0XHRzd2l0Y2ggKHR5cGVvZiBjb25maWdWYWx1ZSkge1xuXHRcdFx0Y2FzZSAnbnVtYmVyJzpcblx0XHRcdGNhc2UgJ2Jvb2xlYW4nOlxuXHRcdFx0Y2FzZSAnc3RyaW5nJzpcblx0XHRcdFx0dmFsdWUgPSBjb25maWdWYWx1ZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShjb25maWdWYWx1ZSkpIHtcblx0XHRcdFx0XHR2YWx1ZSA9IEpTT04uc3RyaW5naWZ5KGNvbmZpZ1ZhbHVlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR2YWx1ZSA9IGNvbmZpZ1ZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fdmFsdWVzLnNldChrZXksIHZhbHVlKTtcblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRWYWx1ZShrZXk6IHN0cmluZywgdmFsdWU6IGFueSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBzdXBlci5zZXRWYWx1ZShrZXksIHZhbHVlKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbW92ZVZhbHVlKGtleTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHN1cGVyLnJlbW92ZVZhbHVlKGtleSk7XG5cdH1cblxuXHRvdmVycmlkZSBjb2xsZWN0QWxsVmFsdWVzKCk6IHsgW2tleTogc3RyaW5nXTogYW55IH0ge1xuXHRcdGNvbnN0IHJlc3VsdDogeyBba2V5OiBzdHJpbmddOiBhbnkgfSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5fdmFsdWVzLmZvckVhY2goKHZhbHVlLCBpbmRleCkgPT4gcmVzdWx0W2luZGV4XSA9IHZhbHVlKTtcblx0XHRyZXR1cm4geyAuLi5yZXN1bHQsIC4uLnN1cGVyLmNvbGxlY3RBbGxWYWx1ZXMoKSB9O1xuXHR9XG59XG5cbmNsYXNzIENvbnRleHRLZXk8VCBleHRlbmRzIENvbnRleHRLZXlWYWx1ZT4gaW1wbGVtZW50cyBJQ29udGV4dEtleTxUPiB7XG5cblx0cHJpdmF0ZSBfc2VydmljZTogQWJzdHJhY3RDb250ZXh0S2V5U2VydmljZTtcblx0cHJpdmF0ZSBfa2V5OiBzdHJpbmc7XG5cdHByaXZhdGUgX2RlZmF1bHRWYWx1ZTogVCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcihzZXJ2aWNlOiBBYnN0cmFjdENvbnRleHRLZXlTZXJ2aWNlLCBrZXk6IHN0cmluZywgZGVmYXVsdFZhbHVlOiBUIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fc2VydmljZSA9IHNlcnZpY2U7XG5cdFx0dGhpcy5fa2V5ID0ga2V5O1xuXHRcdHRoaXMuX2RlZmF1bHRWYWx1ZSA9IGRlZmF1bHRWYWx1ZTtcblx0XHR0aGlzLnJlc2V0KCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0KHZhbHVlOiBUKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VydmljZS5zZXRDb250ZXh0KHRoaXMuX2tleSwgdmFsdWUpO1xuXHR9XG5cblx0cHVibGljIHJlc2V0KCk6IHZvaWQge1xuXHRcdGlmICh0eXBlb2YgdGhpcy5fZGVmYXVsdFZhbHVlID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGhpcy5fc2VydmljZS5yZW1vdmVDb250ZXh0KHRoaXMuX2tleSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3NlcnZpY2Uuc2V0Q29udGV4dCh0aGlzLl9rZXksIHRoaXMuX2RlZmF1bHRWYWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldCgpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8VD4odGhpcy5fa2V5KTtcblx0fVxufVxuXG5jbGFzcyBTaW1wbGVDb250ZXh0S2V5Q2hhbmdlRXZlbnQgaW1wbGVtZW50cyBJQ29udGV4dEtleUNoYW5nZUV2ZW50IHtcblx0Y29uc3RydWN0b3IocmVhZG9ubHkga2V5OiBzdHJpbmcpIHsgfVxuXHRhZmZlY3RzU29tZShrZXlzOiBJUmVhZGFibGVTZXQ8c3RyaW5nPik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBrZXlzLmhhcyh0aGlzLmtleSk7XG5cdH1cblx0YWxsS2V5c0NvbnRhaW5lZEluKGtleXM6IElSZWFkYWJsZVNldDxzdHJpbmc+KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuYWZmZWN0c1NvbWUoa2V5cyk7XG5cdH1cbn1cblxuY2xhc3MgQXJyYXlDb250ZXh0S2V5Q2hhbmdlRXZlbnQgaW1wbGVtZW50cyBJQ29udGV4dEtleUNoYW5nZUV2ZW50IHtcblx0Y29uc3RydWN0b3IocmVhZG9ubHkga2V5czogc3RyaW5nW10pIHsgfVxuXHRhZmZlY3RzU29tZShrZXlzOiBJUmVhZGFibGVTZXQ8c3RyaW5nPik6IGJvb2xlYW4ge1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIHRoaXMua2V5cykge1xuXHRcdFx0aWYgKGtleXMuaGFzKGtleSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRhbGxLZXlzQ29udGFpbmVkSW4oa2V5czogSVJlYWRhYmxlU2V0PHN0cmluZz4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5rZXlzLmV2ZXJ5KGtleSA9PiBrZXlzLmhhcyhrZXkpKTtcblx0fVxufVxuXG5jbGFzcyBDb21wb3NpdGVDb250ZXh0S2V5Q2hhbmdlRXZlbnQgaW1wbGVtZW50cyBJQ29udGV4dEtleUNoYW5nZUV2ZW50IHtcblx0Y29uc3RydWN0b3IocmVhZG9ubHkgZXZlbnRzOiBJQ29udGV4dEtleUNoYW5nZUV2ZW50W10pIHsgfVxuXHRhZmZlY3RzU29tZShrZXlzOiBJUmVhZGFibGVTZXQ8c3RyaW5nPik6IGJvb2xlYW4ge1xuXHRcdGZvciAoY29uc3QgZSBvZiB0aGlzLmV2ZW50cykge1xuXHRcdFx0aWYgKGUuYWZmZWN0c1NvbWUoa2V5cykpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRhbGxLZXlzQ29udGFpbmVkSW4oa2V5czogSVJlYWRhYmxlU2V0PHN0cmluZz4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5ldmVudHMuZXZlcnkoZXZ0ID0+IGV2dC5hbGxLZXlzQ29udGFpbmVkSW4oa2V5cykpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGFsbEV2ZW50S2V5c0luQ29udGV4dChldmVudDogSUNvbnRleHRLZXlDaGFuZ2VFdmVudCwgY29udGV4dDogUmVjb3JkPHN0cmluZywgYW55Pik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gZXZlbnQuYWxsS2V5c0NvbnRhaW5lZEluKG5ldyBTZXQoT2JqZWN0LmtleXMoY29udGV4dCkpKTtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0Q29udGV4dEtleVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNvbnRleHRLZXlTZXJ2aWNlIHtcblx0ZGVjbGFyZSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJvdGVjdGVkIF9pc0Rpc3Bvc2VkOiBib29sZWFuO1xuXHRwcm90ZWN0ZWQgX215Q29udGV4dElkOiBudW1iZXI7XG5cblx0cHJvdGVjdGVkIF9vbkRpZENoYW5nZUNvbnRleHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgUGF1c2VhYmxlRW1pdHRlcjxJQ29udGV4dEtleUNoYW5nZUV2ZW50Pih7IG1lcmdlOiBpbnB1dCA9PiBuZXcgQ29tcG9zaXRlQ29udGV4dEtleUNoYW5nZUV2ZW50KGlucHV0KSB9KSk7XG5cdGdldCBvbkRpZENoYW5nZUNvbnRleHQoKSB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUNvbnRleHQuZXZlbnQ7IH1cblxuXHRjb25zdHJ1Y3RvcihteUNvbnRleHRJZDogbnVtYmVyKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdFx0dGhpcy5fbXlDb250ZXh0SWQgPSBteUNvbnRleHRJZDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgY29udGV4dElkKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX215Q29udGV4dElkO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZUtleTxUIGV4dGVuZHMgQ29udGV4dEtleVZhbHVlPihrZXk6IHN0cmluZywgZGVmYXVsdFZhbHVlOiBUIHwgdW5kZWZpbmVkKTogSUNvbnRleHRLZXk8VD4ge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEFic3RyYWN0Q29udGV4dEtleVNlcnZpY2UgaGFzIGJlZW4gZGlzcG9zZWRgKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBDb250ZXh0S2V5KHRoaXMsIGtleSwgZGVmYXVsdFZhbHVlKTtcblx0fVxuXG5cblx0YnVmZmVyQ2hhbmdlRXZlbnRzKGNhbGxiYWNrOiBGdW5jdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGV4dC5wYXVzZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjYWxsYmFjaygpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRleHQucmVzdW1lKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNyZWF0ZVNjb3BlZChkb21Ob2RlOiBJQ29udGV4dEtleVNlcnZpY2VUYXJnZXQpOiBJU2NvcGVkQ29udGV4dEtleVNlcnZpY2Uge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEFic3RyYWN0Q29udGV4dEtleVNlcnZpY2UgaGFzIGJlZW4gZGlzcG9zZWRgKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBTY29wZWRDb250ZXh0S2V5U2VydmljZSh0aGlzLCBkb21Ob2RlKTtcblx0fVxuXG5cdGNyZWF0ZU92ZXJsYXkob3ZlcmxheTogSXRlcmFibGU8W3N0cmluZywgYW55XT4gPSBJdGVyYWJsZS5lbXB0eSgpKTogSUNvbnRleHRLZXlTZXJ2aWNlIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBBYnN0cmFjdENvbnRleHRLZXlTZXJ2aWNlIGhhcyBiZWVuIGRpc3Bvc2VkYCk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgT3ZlcmxheUNvbnRleHRLZXlTZXJ2aWNlKHRoaXMsIG92ZXJsYXkpO1xuXHR9XG5cblx0cHVibGljIGNvbnRleHRNYXRjaGVzUnVsZXMocnVsZXM6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQWJzdHJhY3RDb250ZXh0S2V5U2VydmljZSBoYXMgYmVlbiBkaXNwb3NlZGApO1xuXHRcdH1cblx0XHRjb25zdCBjb250ZXh0ID0gdGhpcy5nZXRDb250ZXh0VmFsdWVzQ29udGFpbmVyKHRoaXMuX215Q29udGV4dElkKTtcblx0XHRjb25zdCByZXN1bHQgPSAocnVsZXMgPyBydWxlcy5ldmFsdWF0ZShjb250ZXh0KSA6IHRydWUpO1xuXHRcdC8vIGNvbnNvbGUuZ3JvdXAocnVsZXMuc2VyaWFsaXplKCkgKyAnIC0+ICcgKyByZXN1bHQpO1xuXHRcdC8vIHJ1bGVzLmtleXMoKS5mb3JFYWNoKGtleSA9PiB7IGNvbnNvbGUubG9nKGtleSwgY3R4W2tleV0pOyB9KTtcblx0XHQvLyBjb25zb2xlLmdyb3VwRW5kKCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb250ZXh0S2V5VmFsdWU8VD4oa2V5OiBzdHJpbmcpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZ2V0Q29udGV4dFZhbHVlc0NvbnRhaW5lcih0aGlzLl9teUNvbnRleHRJZCkuZ2V0VmFsdWU8VD4oa2V5KTtcblx0fVxuXG5cdHB1YmxpYyBzZXRDb250ZXh0KGtleTogc3RyaW5nLCB2YWx1ZTogYW55KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbXlDb250ZXh0ID0gdGhpcy5nZXRDb250ZXh0VmFsdWVzQ29udGFpbmVyKHRoaXMuX215Q29udGV4dElkKTtcblx0XHRpZiAoIW15Q29udGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAobXlDb250ZXh0LnNldFZhbHVlKGtleSwgdmFsdWUpKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRleHQuZmlyZShuZXcgU2ltcGxlQ29udGV4dEtleUNoYW5nZUV2ZW50KGtleSkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZW1vdmVDb250ZXh0KGtleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZ2V0Q29udGV4dFZhbHVlc0NvbnRhaW5lcih0aGlzLl9teUNvbnRleHRJZCkucmVtb3ZlVmFsdWUoa2V5KSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZXh0LmZpcmUobmV3IFNpbXBsZUNvbnRleHRLZXlDaGFuZ2VFdmVudChrZXkpKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q29udGV4dCh0YXJnZXQ6IElDb250ZXh0S2V5U2VydmljZVRhcmdldCB8IG51bGwpOiBJQ29udGV4dCB7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiBOdWxsQ29udGV4dC5JTlNUQU5DRTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZ2V0Q29udGV4dFZhbHVlc0NvbnRhaW5lcihmaW5kQ29udGV4dEF0dHIodGFyZ2V0KSk7XG5cdH1cblxuXHRwdWJsaWMgYWJzdHJhY3QgZ2V0Q29udGV4dFZhbHVlc0NvbnRhaW5lcihjb250ZXh0SWQ6IG51bWJlcik6IENvbnRleHQ7XG5cdHB1YmxpYyBhYnN0cmFjdCBjcmVhdGVDaGlsZENvbnRleHQocGFyZW50Q29udGV4dElkPzogbnVtYmVyKTogbnVtYmVyO1xuXHRwdWJsaWMgYWJzdHJhY3QgZGlzcG9zZUNvbnRleHQoY29udGV4dElkOiBudW1iZXIpOiB2b2lkO1xuXHRwdWJsaWMgYWJzdHJhY3QgdXBkYXRlUGFyZW50KHBhcmVudENvbnRleHRLZXlTZXJ2aWNlPzogSUNvbnRleHRLZXlTZXJ2aWNlKTogdm9pZDtcblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbnRleHRLZXlTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RDb250ZXh0S2V5U2VydmljZSBpbXBsZW1lbnRzIElDb250ZXh0S2V5U2VydmljZSB7XG5cblx0cHJpdmF0ZSBfbGFzdENvbnRleHRJZDogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0cyA9IG5ldyBNYXA8bnVtYmVyLCBDb250ZXh0PigpO1xuXG5cdHByaXZhdGUgaW5wdXRGb2N1c2VkQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoQElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSB7XG5cdFx0c3VwZXIoMCk7XG5cdFx0dGhpcy5fbGFzdENvbnRleHRJZCA9IDA7XG5cdFx0dGhpcy5pbnB1dEZvY3VzZWRDb250ZXh0ID0gSW5wdXRGb2N1c2VkQ29udGV4dC5iaW5kVG8odGhpcyk7XG5cblx0XHRjb25zdCBteUNvbnRleHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ29uZmlnQXdhcmVDb250ZXh0VmFsdWVzQ29udGFpbmVyKHRoaXMuX215Q29udGV4dElkLCBjb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5fb25EaWRDaGFuZ2VDb250ZXh0KSk7XG5cdFx0dGhpcy5fY29udGV4dHMuc2V0KHRoaXMuX215Q29udGV4dElkLCBteUNvbnRleHQpO1xuXG5cdFx0Ly8gVW5jb21tZW50IHRoaXMgdG8gc2VlIHRoZSBjb250ZXh0cyBjb250aW51b3VzbHkgbG9nZ2VkXG5cdFx0Ly8gbGV0IGxhc3RMb2dnZWRWYWx1ZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdFx0Ly8gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuXHRcdC8vIFx0bGV0IHZhbHVlcyA9IE9iamVjdC5rZXlzKHRoaXMuX2NvbnRleHRzKS5tYXAoKGtleSkgPT4gdGhpcy5fY29udGV4dHNba2V5XSk7XG5cdFx0Ly8gXHRsZXQgbG9nVmFsdWUgPSB2YWx1ZXMubWFwKHYgPT4gSlNPTi5zdHJpbmdpZnkodi5fdmFsdWUsIG51bGwsICdcXHQnKSkuam9pbignXFxuJyk7XG5cdFx0Ly8gXHRpZiAobGFzdExvZ2dlZFZhbHVlICE9PSBsb2dWYWx1ZSkge1xuXHRcdC8vIFx0XHRsYXN0TG9nZ2VkVmFsdWUgPSBsb2dWYWx1ZTtcblx0XHQvLyBcdFx0Y29uc29sZS5sb2cobGFzdExvZ2dlZFZhbHVlKTtcblx0XHQvLyBcdH1cblx0XHQvLyB9LCAyMDAwKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZShvbkRpZFJlZ2lzdGVyV2luZG93LCAoeyB3aW5kb3csIGRpc3Bvc2FibGVzIH0pID0+IHtcblx0XHRcdGNvbnN0IG9uRm9jdXNEaXNwb3NhYmxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIod2luZG93LCBFdmVudFR5cGUuRk9DVVNfSU4sICgpID0+IHtcblx0XHRcdFx0b25Gb2N1c0Rpc3Bvc2FibGVzLnZhbHVlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUlucHV0Q29udGV4dEtleXMod2luZG93LmRvY3VtZW50LCBvbkZvY3VzRGlzcG9zYWJsZXMudmFsdWUpO1xuXHRcdFx0fSwgdHJ1ZSkpO1xuXHRcdH0sIHsgd2luZG93OiBtYWluV2luZG93LCBkaXNwb3NhYmxlczogdGhpcy5fc3RvcmUgfSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVJbnB1dENvbnRleHRLZXlzKG93bmVyRG9jdW1lbnQ6IERvY3VtZW50LCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cblx0XHRmdW5jdGlvbiBhY3RpdmVFbGVtZW50SXNJbnB1dCgpOiBib29sZWFuIHtcblx0XHRcdHJldHVybiAhIW93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCAmJiBpc0VkaXRhYmxlRWxlbWVudChvd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzSW5wdXRGb2N1c2VkID0gYWN0aXZlRWxlbWVudElzSW5wdXQoKTtcblx0XHR0aGlzLmlucHV0Rm9jdXNlZENvbnRleHQuc2V0KGlzSW5wdXRGb2N1c2VkKTtcblxuXHRcdGlmIChpc0lucHV0Rm9jdXNlZCkge1xuXHRcdFx0Y29uc3QgdHJhY2tlciA9IGRpc3Bvc2FibGVzLmFkZCh0cmFja0ZvY3VzKG93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudCkpO1xuXHRcdFx0RXZlbnQub25jZSh0cmFja2VyLm9uRGlkQmx1cikoKCkgPT4ge1xuXG5cdFx0XHRcdC8vIEVuc3VyZSB3ZSBhcmUgb25seSB1cGRhdGluZyB0aGUgY29udGV4dCBrZXkgaWYgd2UgYXJlXG5cdFx0XHRcdC8vIHN0aWxsIGluIHRoZSBzYW1lIGRvY3VtZW50IHRoYXQgd2UgYXJlIHRyYWNraW5nLiBUaGlzXG5cdFx0XHRcdC8vIGZpeGVzIGEgcmFjZSBjb25kaXRpb24gaW4gbXVsdGktd2luZG93IHNldHVwcyB3aGVyZVxuXHRcdFx0XHQvLyB0aGUgYmx1ciBldmVudCBhcnJpdmVzIGluIHRoZSBpbmFjdGl2ZSB3aW5kb3cgb3ZlcndyaXRpbmdcblx0XHRcdFx0Ly8gdGhlIGNvbnRleHQga2V5IG9mIHRoZSBhY3RpdmUgd2luZG93LiBUaGlzIGlzIGJlY2F1c2Vcblx0XHRcdFx0Ly8gYmx1ciBldmVudHMgZnJvbSB0aGUgZm9jdXMgdHJhY2tlciBhcmUgZW1pdHRlZCB3aXRoIGFcblx0XHRcdFx0Ly8gdGltZW91dCBvZiAwLlxuXG5cdFx0XHRcdGlmIChnZXRBY3RpdmVXaW5kb3coKS5kb2N1bWVudCA9PT0gb3duZXJEb2N1bWVudCkge1xuXHRcdFx0XHRcdHRoaXMuaW5wdXRGb2N1c2VkQ29udGV4dC5zZXQoYWN0aXZlRWxlbWVudElzSW5wdXQoKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0cmFja2VyLmRpc3Bvc2UoKTtcblx0XHRcdH0sIHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRDb250ZXh0VmFsdWVzQ29udGFpbmVyKGNvbnRleHRJZDogbnVtYmVyKTogQ29udGV4dCB7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiBOdWxsQ29udGV4dC5JTlNUQU5DRTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRleHRzLmdldChjb250ZXh0SWQpIHx8IE51bGxDb250ZXh0LklOU1RBTkNFO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZUNoaWxkQ29udGV4dChwYXJlbnRDb250ZXh0SWQ6IG51bWJlciA9IHRoaXMuX215Q29udGV4dElkKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDb250ZXh0S2V5U2VydmljZSBoYXMgYmVlbiBkaXNwb3NlZGApO1xuXHRcdH1cblx0XHRjb25zdCBpZCA9ICgrK3RoaXMuX2xhc3RDb250ZXh0SWQpO1xuXHRcdHRoaXMuX2NvbnRleHRzLnNldChpZCwgbmV3IENvbnRleHQoaWQsIHRoaXMuZ2V0Q29udGV4dFZhbHVlc0NvbnRhaW5lcihwYXJlbnRDb250ZXh0SWQpKSk7XG5cdFx0cmV0dXJuIGlkO1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2VDb250ZXh0KGNvbnRleHRJZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHR0aGlzLl9jb250ZXh0cy5kZWxldGUoY29udGV4dElkKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlUGFyZW50KF9wYXJlbnRDb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgdXBkYXRlIHBhcmVudCBvZiByb290IENvbnRleHRLZXlTZXJ2aWNlJyk7XG5cdH1cbn1cblxuY2xhc3MgU2NvcGVkQ29udGV4dEtleVNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdENvbnRleHRLZXlTZXJ2aWNlIHtcblxuXHRwcml2YXRlIF9wYXJlbnQ6IEFic3RyYWN0Q29udGV4dEtleVNlcnZpY2U7XG5cdHByaXZhdGUgX2RvbU5vZGU6IElDb250ZXh0S2V5U2VydmljZVRhcmdldDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wYXJlbnRDaGFuZ2VMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRjb25zdHJ1Y3RvcihwYXJlbnQ6IEFic3RyYWN0Q29udGV4dEtleVNlcnZpY2UsIGRvbU5vZGU6IElDb250ZXh0S2V5U2VydmljZVRhcmdldCkge1xuXHRcdHN1cGVyKHBhcmVudC5jcmVhdGVDaGlsZENvbnRleHQoKSk7XG5cdFx0dGhpcy5fcGFyZW50ID0gcGFyZW50O1xuXHRcdHRoaXMuX3VwZGF0ZVBhcmVudENoYW5nZUxpc3RlbmVyKCk7XG5cblx0XHR0aGlzLl9kb21Ob2RlID0gZG9tTm9kZTtcblx0XHRpZiAodGhpcy5fZG9tTm9kZS5oYXNBdHRyaWJ1dGUoS0VZQklORElOR19DT05URVhUX0FUVFIpKSB7XG5cdFx0XHRsZXQgZXh0cmFJbmZvID0gJyc7XG5cdFx0XHRpZiAoKHRoaXMuX2RvbU5vZGUgYXMgSFRNTEVsZW1lbnQpLmNsYXNzTGlzdCkge1xuXHRcdFx0XHRleHRyYUluZm8gPSBBcnJheS5mcm9tKCh0aGlzLl9kb21Ob2RlIGFzIEhUTUxFbGVtZW50KS5jbGFzc0xpc3QudmFsdWVzKCkpLmpvaW4oJywgJyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnNvbGUuZXJyb3IoYEVsZW1lbnQgYWxyZWFkeSBoYXMgY29udGV4dCBhdHRyaWJ1dGUke2V4dHJhSW5mbyA/ICc6ICcgKyBleHRyYUluZm8gOiAnJ31gKTtcblx0XHR9XG5cdFx0dGhpcy5fZG9tTm9kZS5zZXRBdHRyaWJ1dGUoS0VZQklORElOR19DT05URVhUX0FUVFIsIFN0cmluZyh0aGlzLl9teUNvbnRleHRJZCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlUGFyZW50Q2hhbmdlTGlzdGVuZXIoKTogdm9pZCB7XG5cdFx0Ly8gRm9yd2FyZCBwYXJlbnQgZXZlbnRzIHRvIHRoaXMgbGlzdGVuZXIuIFBhcmVudCB3aWxsIGNoYW5nZS5cblx0XHR0aGlzLl9wYXJlbnRDaGFuZ2VMaXN0ZW5lci52YWx1ZSA9IHRoaXMuX3BhcmVudC5vbkRpZENoYW5nZUNvbnRleHQoZSA9PiB7XG5cdFx0XHRjb25zdCB0aGlzQ29udGFpbmVyID0gdGhpcy5fcGFyZW50LmdldENvbnRleHRWYWx1ZXNDb250YWluZXIodGhpcy5fbXlDb250ZXh0SWQpO1xuXHRcdFx0Y29uc3QgdGhpc0NvbnRleHRWYWx1ZXMgPSB0aGlzQ29udGFpbmVyLnZhbHVlO1xuXG5cdFx0XHRpZiAoIWFsbEV2ZW50S2V5c0luQ29udGV4dChlLCB0aGlzQ29udGV4dFZhbHVlcykpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZXh0LmZpcmUoZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENsZWFyIHRoZSBwYXJlbnQgY2hhbmdlIGxpc3RlbmVyIGJlZm9yZSBkaXNwb3NlQ29udGV4dCB0byBhdm9pZFxuXHRcdC8vIGZvcndhcmRpbmcgcGFyZW50IGV2ZW50cyBhZnRlciB0aGlzIHNlcnZpY2UgaGFzIGJlZ3VuIHRlYXJpbmcgZG93bi5cblx0XHR0aGlzLl9wYXJlbnRDaGFuZ2VMaXN0ZW5lci5jbGVhcigpO1xuXHRcdHRoaXMuX3BhcmVudC5kaXNwb3NlQ29udGV4dCh0aGlzLl9teUNvbnRleHRJZCk7XG5cdFx0dGhpcy5fZG9tTm9kZS5yZW1vdmVBdHRyaWJ1dGUoS0VZQklORElOR19DT05URVhUX0FUVFIpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb250ZXh0VmFsdWVzQ29udGFpbmVyKGNvbnRleHRJZDogbnVtYmVyKTogQ29udGV4dCB7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiBOdWxsQ29udGV4dC5JTlNUQU5DRTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3BhcmVudC5nZXRDb250ZXh0VmFsdWVzQ29udGFpbmVyKGNvbnRleHRJZCk7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlQ2hpbGRDb250ZXh0KHBhcmVudENvbnRleHRJZDogbnVtYmVyID0gdGhpcy5fbXlDb250ZXh0SWQpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNjb3BlZENvbnRleHRLZXlTZXJ2aWNlIGhhcyBiZWVuIGRpc3Bvc2VkYCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wYXJlbnQuY3JlYXRlQ2hpbGRDb250ZXh0KHBhcmVudENvbnRleHRJZCk7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZUNvbnRleHQoY29udGV4dElkOiBudW1iZXIpOiB2b2lkIHtcblx0XHQvLyBBbHdheXMgZm9yd2FyZCB0byBwYXJlbnQgZXZlbiBhZnRlciBkaXNwb3NhbCBcdTIwMTQgYSBjaGlsZCBjb250ZXh0IG1heVxuXHRcdC8vIGJlIGRpc3Bvc2VkIGFmdGVyIHVzIGFuZCBtdXN0IHN0aWxsIHJlYWNoIHRoZSByb290IENvbnRleHRLZXlTZXJ2aWNlXG5cdFx0Ly8gdG8gZGVsZXRlIGl0cyBlbnRyeSBmcm9tIF9jb250ZXh0cy5cblx0XHR0aGlzLl9wYXJlbnQuZGlzcG9zZUNvbnRleHQoY29udGV4dElkKTtcblx0fVxuXG5cdHB1YmxpYyB1cGRhdGVQYXJlbnQocGFyZW50Q29udGV4dEtleVNlcnZpY2U6IEFic3RyYWN0Q29udGV4dEtleVNlcnZpY2UpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcGFyZW50ID09PSBwYXJlbnRDb250ZXh0S2V5U2VydmljZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRoaXNDb250YWluZXIgPSB0aGlzLl9wYXJlbnQuZ2V0Q29udGV4dFZhbHVlc0NvbnRhaW5lcih0aGlzLl9teUNvbnRleHRJZCk7XG5cdFx0Y29uc3Qgb2xkQWxsVmFsdWVzID0gdGhpc0NvbnRhaW5lci5jb2xsZWN0QWxsVmFsdWVzKCk7XG5cdFx0dGhpcy5fcGFyZW50ID0gcGFyZW50Q29udGV4dEtleVNlcnZpY2U7XG5cdFx0dGhpcy5fdXBkYXRlUGFyZW50Q2hhbmdlTGlzdGVuZXIoKTtcblx0XHRjb25zdCBuZXdQYXJlbnRDb250YWluZXIgPSB0aGlzLl9wYXJlbnQuZ2V0Q29udGV4dFZhbHVlc0NvbnRhaW5lcih0aGlzLl9wYXJlbnQuY29udGV4dElkKTtcblx0XHR0aGlzQ29udGFpbmVyLnVwZGF0ZVBhcmVudChuZXdQYXJlbnRDb250YWluZXIpO1xuXG5cdFx0Y29uc3QgbmV3QWxsVmFsdWVzID0gdGhpc0NvbnRhaW5lci5jb2xsZWN0QWxsVmFsdWVzKCk7XG5cdFx0Y29uc3QgYWxsVmFsdWVzRGlmZiA9IHtcblx0XHRcdC4uLmRpc3RpbmN0KG9sZEFsbFZhbHVlcywgbmV3QWxsVmFsdWVzKSxcblx0XHRcdC4uLmRpc3RpbmN0KG5ld0FsbFZhbHVlcywgb2xkQWxsVmFsdWVzKVxuXHRcdH07XG5cdFx0Y29uc3QgY2hhbmdlZEtleXMgPSBPYmplY3Qua2V5cyhhbGxWYWx1ZXNEaWZmKTtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGV4dC5maXJlKG5ldyBBcnJheUNvbnRleHRLZXlDaGFuZ2VFdmVudChjaGFuZ2VkS2V5cykpO1xuXHR9XG59XG5cbmNsYXNzIE92ZXJsYXlDb250ZXh0IGltcGxlbWVudHMgSUNvbnRleHQge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcGFyZW50OiBJQ29udGV4dCwgcHJpdmF0ZSBvdmVybGF5OiBSZWFkb25seU1hcDxzdHJpbmcsIGFueT4pIHsgfVxuXG5cdGdldFZhbHVlPFQgZXh0ZW5kcyBDb250ZXh0S2V5VmFsdWU+KGtleTogc3RyaW5nKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMub3ZlcmxheS5oYXMoa2V5KSA/IHRoaXMub3ZlcmxheS5nZXQoa2V5KSA6IHRoaXMucGFyZW50LmdldFZhbHVlPFQ+KGtleSk7XG5cdH1cbn1cblxuY2xhc3MgT3ZlcmxheUNvbnRleHRLZXlTZXJ2aWNlIGltcGxlbWVudHMgSUNvbnRleHRLZXlTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBvdmVybGF5OiBNYXA8c3RyaW5nLCBhbnk+O1xuXG5cdGdldCBjb250ZXh0SWQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5wYXJlbnQuY29udGV4dElkO1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlQ29udGV4dCgpOiBFdmVudDxJQ29udGV4dEtleUNoYW5nZUV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMucGFyZW50Lm9uRGlkQ2hhbmdlQ29udGV4dDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcGFyZW50OiBBYnN0cmFjdENvbnRleHRLZXlTZXJ2aWNlIHwgT3ZlcmxheUNvbnRleHRLZXlTZXJ2aWNlLCBvdmVybGF5OiBJdGVyYWJsZTxbc3RyaW5nLCBhbnldPikge1xuXHRcdHRoaXMub3ZlcmxheSA9IG5ldyBNYXAob3ZlcmxheSk7XG5cdH1cblxuXHRidWZmZXJDaGFuZ2VFdmVudHMoY2FsbGJhY2s6IEZ1bmN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5wYXJlbnQuYnVmZmVyQ2hhbmdlRXZlbnRzKGNhbGxiYWNrKTtcblx0fVxuXG5cdGNyZWF0ZUtleTxUIGV4dGVuZHMgQ29udGV4dEtleVZhbHVlPigpOiBJQ29udGV4dEtleTxUPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdOb3Qgc3VwcG9ydGVkLicpO1xuXHR9XG5cblx0Z2V0Q29udGV4dCh0YXJnZXQ6IElDb250ZXh0S2V5U2VydmljZVRhcmdldCB8IG51bGwpOiBJQ29udGV4dCB7XG5cdFx0cmV0dXJuIG5ldyBPdmVybGF5Q29udGV4dCh0aGlzLnBhcmVudC5nZXRDb250ZXh0KHRhcmdldCksIHRoaXMub3ZlcmxheSk7XG5cdH1cblxuXHRnZXRDb250ZXh0VmFsdWVzQ29udGFpbmVyKGNvbnRleHRJZDogbnVtYmVyKTogSUNvbnRleHQge1xuXHRcdGNvbnN0IHBhcmVudENvbnRleHQgPSB0aGlzLnBhcmVudC5nZXRDb250ZXh0VmFsdWVzQ29udGFpbmVyKGNvbnRleHRJZCk7XG5cdFx0cmV0dXJuIG5ldyBPdmVybGF5Q29udGV4dChwYXJlbnRDb250ZXh0LCB0aGlzLm92ZXJsYXkpO1xuXHR9XG5cblx0Y29udGV4dE1hdGNoZXNSdWxlcyhydWxlczogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRjb25zdCBjb250ZXh0ID0gdGhpcy5nZXRDb250ZXh0VmFsdWVzQ29udGFpbmVyKHRoaXMuY29udGV4dElkKTtcblx0XHRjb25zdCByZXN1bHQgPSAocnVsZXMgPyBydWxlcy5ldmFsdWF0ZShjb250ZXh0KSA6IHRydWUpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRnZXRDb250ZXh0S2V5VmFsdWU8VD4oa2V5OiBzdHJpbmcpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5vdmVybGF5LmhhcyhrZXkpID8gdGhpcy5vdmVybGF5LmdldChrZXkpIDogdGhpcy5wYXJlbnQuZ2V0Q29udGV4dEtleVZhbHVlKGtleSk7XG5cdH1cblxuXHRjcmVhdGVTY29wZWQoKTogSVNjb3BlZENvbnRleHRLZXlTZXJ2aWNlIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQuJyk7XG5cdH1cblxuXHRjcmVhdGVPdmVybGF5KG92ZXJsYXk6IEl0ZXJhYmxlPFtzdHJpbmcsIGFueV0+ID0gSXRlcmFibGUuZW1wdHkoKSk6IElDb250ZXh0S2V5U2VydmljZSB7XG5cdFx0cmV0dXJuIG5ldyBPdmVybGF5Q29udGV4dEtleVNlcnZpY2UodGhpcywgb3ZlcmxheSk7XG5cdH1cblxuXHR1cGRhdGVQYXJlbnQoKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdOb3Qgc3VwcG9ydGVkLicpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGZpbmRDb250ZXh0QXR0cihkb21Ob2RlOiBJQ29udGV4dEtleVNlcnZpY2VUYXJnZXQgfCBudWxsKTogbnVtYmVyIHtcblx0d2hpbGUgKGRvbU5vZGUpIHtcblx0XHRpZiAoZG9tTm9kZS5oYXNBdHRyaWJ1dGUoS0VZQklORElOR19DT05URVhUX0FUVFIpKSB7XG5cdFx0XHRjb25zdCBhdHRyID0gZG9tTm9kZS5nZXRBdHRyaWJ1dGUoS0VZQklORElOR19DT05URVhUX0FUVFIpO1xuXHRcdFx0aWYgKGF0dHIpIHtcblx0XHRcdFx0cmV0dXJuIHBhcnNlSW50KGF0dHIsIDEwKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBOYU47XG5cdFx0fVxuXHRcdGRvbU5vZGUgPSBkb21Ob2RlLnBhcmVudEVsZW1lbnQ7XG5cdH1cblx0cmV0dXJuIDA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0S2V5OiBhbnksIGNvbnRleHRWYWx1ZTogYW55KSB7XG5cdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShTdHJpbmcoY29udGV4dEtleSksIHN0cmluZ2lmeVVSSXMoY29udGV4dFZhbHVlKSk7XG59XG5cbmZ1bmN0aW9uIHN0cmluZ2lmeVVSSXMoY29udGV4dFZhbHVlOiBhbnkpOiBhbnkge1xuXHRyZXR1cm4gY2xvbmVBbmRDaGFuZ2UoY29udGV4dFZhbHVlLCAob2JqKSA9PiB7XG5cdFx0aWYgKHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmICg8TWFyc2hhbGxlZE9iamVjdD5vYmopLiRtaWQgPT09IE1hcnNoYWxsZWRJZC5VcmkpIHtcblx0XHRcdHJldHVybiBVUkkucmV2aXZlKG9iaikudG9TdHJpbmcoKTtcblx0XHR9XG5cdFx0aWYgKG9iaiBpbnN0YW5jZW9mIFVSSSkge1xuXHRcdFx0cmV0dXJuIG9iai50b1N0cmluZygpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9KTtcbn1cblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ19zZXRDb250ZXh0Jywgc2V0Q29udGV4dCk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6ICdnZXRDb250ZXh0S2V5SW5mbycsXG5cdGhhbmRsZXIoKSB7XG5cdFx0cmV0dXJuIFsuLi5SYXdDb250ZXh0S2V5LmFsbCgpXS5zb3J0KChhLCBiKSA9PiBhLmtleS5sb2NhbGVDb21wYXJlKGIua2V5KSk7XG5cdH0sXG5cdG1ldGFkYXRhOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXRDb250ZXh0S2V5SW5mbycsIFwiQSBjb21tYW5kIHRoYXQgcmV0dXJucyBpbmZvcm1hdGlvbiBhYm91dCBjb250ZXh0IGtleXNcIiksXG5cdFx0YXJnczogW11cblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdfZ2VuZXJhdGVDb250ZXh0S2V5SW5mbycsIGZ1bmN0aW9uICgpIHtcblx0Y29uc3QgcmVzdWx0OiBDb250ZXh0S2V5SW5mb1tdID0gW107XG5cdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Zm9yIChjb25zdCBpbmZvIG9mIFJhd0NvbnRleHRLZXkuYWxsKCkpIHtcblx0XHRpZiAoIXNlZW4uaGFzKGluZm8ua2V5KSkge1xuXHRcdFx0c2Vlbi5hZGQoaW5mby5rZXkpO1xuXHRcdFx0cmVzdWx0LnB1c2goaW5mbyk7XG5cdFx0fVxuXHR9XG5cdHJlc3VsdC5zb3J0KChhLCBiKSA9PiBhLmtleS5sb2NhbGVDb21wYXJlKGIua2V5KSk7XG5cdGNv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
