var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var _proxy;
import { URI } from "../../../base/common/uri.js";
import { Event, Emitter } from "../../../base/common/event.js";
import { debounce } from "../../../base/common/decorators.js";
import { DisposableMap, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { asPromise } from "../../../base/common/async.js";
import { MainContext } from "./extHost.protocol.js";
import { sortedDiff, equals } from "../../../base/common/arrays.js";
import { comparePaths } from "../../../base/common/comparers.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { ExtensionIdentifierMap } from "../../../platform/extensions/common/extensions.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { MarkdownString, SourceControlInputBoxValidationType } from "./extHostTypeConverters.js";
import { checkProposedApiEnabled, isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { Schemas } from "../../../base/common/network.js";
import { isLinux } from "../../../base/common/platform.js";
import { structuralEquals } from "../../../base/common/equals.js";
import { Iterable } from "../../../base/common/iterator.js";
function isUri(thing) {
  return thing instanceof URI;
}
function uriEquals(a, b) {
  if (a.scheme === Schemas.file && b.scheme === Schemas.file && isLinux) {
    return a.toString() === b.toString();
  }
  return a.toString().toLowerCase() === b.toString().toLowerCase();
}
function getIconResource(decorations) {
  if (!decorations) {
    return void 0;
  } else if (typeof decorations.iconPath === "string") {
    return URI.file(decorations.iconPath);
  } else if (URI.isUri(decorations.iconPath)) {
    return decorations.iconPath;
  } else if (ThemeIcon.isThemeIcon(decorations.iconPath)) {
    return decorations.iconPath;
  } else {
    return void 0;
  }
}
function getHistoryItemIconDto(icon) {
  if (!icon) {
    return void 0;
  } else if (URI.isUri(icon)) {
    return icon;
  } else if (ThemeIcon.isThemeIcon(icon)) {
    return icon;
  } else {
    const iconDto = icon;
    return { light: iconDto.light, dark: iconDto.dark };
  }
}
function toSCMHistoryItemDto(historyItem) {
  const authorIcon = getHistoryItemIconDto(historyItem.authorIcon);
  const tooltip = Array.isArray(historyItem.tooltip) ? MarkdownString.fromMany(historyItem.tooltip) : historyItem.tooltip ? MarkdownString.from(historyItem.tooltip) : void 0;
  const references = historyItem.references?.map((r) => ({
    ...r,
    icon: getHistoryItemIconDto(r.icon)
  }));
  return { ...historyItem, authorIcon, references, tooltip };
}
function toSCMHistoryItemRefDto(historyItemRef) {
  return historyItemRef ? { ...historyItemRef, icon: getHistoryItemIconDto(historyItemRef.icon) } : void 0;
}
function compareResourceThemableDecorations(a, b) {
  if (!a.iconPath && !b.iconPath) {
    return 0;
  } else if (!a.iconPath) {
    return -1;
  } else if (!b.iconPath) {
    return 1;
  }
  const aPath = typeof a.iconPath === "string" ? a.iconPath : URI.isUri(a.iconPath) ? a.iconPath.fsPath : a.iconPath.id;
  const bPath = typeof b.iconPath === "string" ? b.iconPath : URI.isUri(b.iconPath) ? b.iconPath.fsPath : b.iconPath.id;
  return comparePaths(aPath, bPath);
}
function compareResourceStatesDecorations(a, b) {
  let result = 0;
  if (a.strikeThrough !== b.strikeThrough) {
    return a.strikeThrough ? 1 : -1;
  }
  if (a.faded !== b.faded) {
    return a.faded ? 1 : -1;
  }
  if (a.tooltip !== b.tooltip) {
    return (a.tooltip || "").localeCompare(b.tooltip || "");
  }
  result = compareResourceThemableDecorations(a, b);
  if (result !== 0) {
    return result;
  }
  if (a.light && b.light) {
    result = compareResourceThemableDecorations(a.light, b.light);
  } else if (a.light) {
    return 1;
  } else if (b.light) {
    return -1;
  }
  if (result !== 0) {
    return result;
  }
  if (a.dark && b.dark) {
    result = compareResourceThemableDecorations(a.dark, b.dark);
  } else if (a.dark) {
    return 1;
  } else if (b.dark) {
    return -1;
  }
  return result;
}
function compareCommands(a, b) {
  if (a.command !== b.command) {
    return a.command < b.command ? -1 : 1;
  }
  if (a.title !== b.title) {
    return a.title < b.title ? -1 : 1;
  }
  if (a.tooltip !== b.tooltip) {
    if (a.tooltip !== void 0 && b.tooltip !== void 0) {
      return a.tooltip < b.tooltip ? -1 : 1;
    } else if (a.tooltip !== void 0) {
      return 1;
    } else if (b.tooltip !== void 0) {
      return -1;
    }
  }
  if (a.arguments === b.arguments) {
    return 0;
  } else if (!a.arguments) {
    return -1;
  } else if (!b.arguments) {
    return 1;
  } else if (a.arguments.length !== b.arguments.length) {
    return a.arguments.length - b.arguments.length;
  }
  for (let i = 0; i < a.arguments.length; i++) {
    const aArg = a.arguments[i];
    const bArg = b.arguments[i];
    if (aArg === bArg) {
      continue;
    }
    if (isUri(aArg) && isUri(bArg) && uriEquals(aArg, bArg)) {
      continue;
    }
    return aArg < bArg ? -1 : 1;
  }
  return 0;
}
function compareResourceStates(a, b) {
  let result = comparePaths(a.resourceUri.fsPath, b.resourceUri.fsPath, true);
  if (result !== 0) {
    return result;
  }
  if (a.command && b.command) {
    result = compareCommands(a.command, b.command);
  } else if (a.command) {
    return 1;
  } else if (b.command) {
    return -1;
  }
  if (result !== 0) {
    return result;
  }
  if (a.decorations && b.decorations) {
    result = compareResourceStatesDecorations(a.decorations, b.decorations);
  } else if (a.decorations) {
    return 1;
  } else if (b.decorations) {
    return -1;
  }
  if (result !== 0) {
    return result;
  }
  if (a.multiFileDiffEditorModifiedUri && b.multiFileDiffEditorModifiedUri) {
    result = comparePaths(a.multiFileDiffEditorModifiedUri.fsPath, b.multiFileDiffEditorModifiedUri.fsPath, true);
  } else if (a.multiFileDiffEditorModifiedUri) {
    return 1;
  } else if (b.multiFileDiffEditorModifiedUri) {
    return -1;
  }
  if (result !== 0) {
    return result;
  }
  if (a.multiDiffEditorOriginalUri && b.multiDiffEditorOriginalUri) {
    result = comparePaths(a.multiDiffEditorOriginalUri.fsPath, b.multiDiffEditorOriginalUri.fsPath, true);
  } else if (a.multiDiffEditorOriginalUri) {
    return 1;
  } else if (b.multiDiffEditorOriginalUri) {
    return -1;
  }
  return result;
}
function compareArgs(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
function commandEquals(a, b) {
  return a.command === b.command && a.title === b.title && a.tooltip === b.tooltip && (a.arguments && b.arguments ? compareArgs(a.arguments, b.arguments) : a.arguments === b.arguments);
}
function commandListEquals(a, b) {
  return equals(a, b, commandEquals);
}
class ExtHostSCMInputBox {
  constructor(_extension, _extHostDocuments, proxy, _sourceControlHandle, _documentUri) {
    this._extension = _extension;
    this._sourceControlHandle = _sourceControlHandle;
    this._documentUri = _documentUri;
    this._value = "";
    this._onDidChange = new Emitter();
    this._placeholder = "";
    this._enabled = true;
    this._visible = true;
    this.#extHostDocuments = _extHostDocuments;
    this.#proxy = proxy;
  }
  #proxy;
  #extHostDocuments;
  get value() {
    return this._value;
  }
  set value(value) {
    value = value ?? "";
    this.#proxy.$setInputBoxValue(this._sourceControlHandle, value);
    this.updateValue(value);
  }
  get onDidChange() {
    return this._onDidChange.event;
  }
  get placeholder() {
    return this._placeholder;
  }
  set placeholder(placeholder) {
    this.#proxy.$setInputBoxPlaceholder(this._sourceControlHandle, placeholder);
    this._placeholder = placeholder;
  }
  get validateInput() {
    checkProposedApiEnabled(this._extension, "scmValidation");
    return this._validateInput;
  }
  set validateInput(fn) {
    checkProposedApiEnabled(this._extension, "scmValidation");
    if (fn && typeof fn !== "function") {
      throw new Error(`[${this._extension.identifier.value}]: Invalid SCM input box validation function`);
    }
    this._validateInput = fn;
    this.#proxy.$setValidationProviderIsEnabled(this._sourceControlHandle, !!fn);
  }
  get enabled() {
    return this._enabled;
  }
  set enabled(enabled) {
    enabled = !!enabled;
    if (this._enabled === enabled) {
      return;
    }
    this._enabled = enabled;
    this.#proxy.$setInputBoxEnablement(this._sourceControlHandle, enabled);
  }
  get visible() {
    return this._visible;
  }
  set visible(visible) {
    visible = !!visible;
    if (this._visible === visible) {
      return;
    }
    this._visible = visible;
    this.#proxy.$setInputBoxVisibility(this._sourceControlHandle, visible);
  }
  get document() {
    checkProposedApiEnabled(this._extension, "scmTextDocument");
    return this.#extHostDocuments.getDocument(this._documentUri);
  }
  showValidationMessage(message, type) {
    checkProposedApiEnabled(this._extension, "scmValidation");
    this.#proxy.$showValidationMessage(this._sourceControlHandle, message, SourceControlInputBoxValidationType.from(type));
  }
  $onInputBoxValueChange(value) {
    this.updateValue(value);
  }
  updateValue(value) {
    this._value = value;
    this._onDidChange.fire(value);
  }
}
const _ExtHostSourceControlResourceGroup = class _ExtHostSourceControlResourceGroup {
  constructor(_proxy2, _commands, _sourceControlHandle, _id, _label, multiDiffEditorEnableViewChanges, _extension) {
    this._proxy = _proxy2;
    this._commands = _commands;
    this._sourceControlHandle = _sourceControlHandle;
    this._id = _id;
    this._label = _label;
    this.multiDiffEditorEnableViewChanges = multiDiffEditorEnableViewChanges;
    this._extension = _extension;
    this._resourceHandlePool = 0;
    this._resourceStates = [];
    this._resourceStatesMap = /* @__PURE__ */ new Map();
    this._resourceStatesCommandsMap = /* @__PURE__ */ new Map();
    this._resourceStatesDisposablesMap = /* @__PURE__ */ new Map();
    this._onDidUpdateResourceStates = new Emitter();
    this.onDidUpdateResourceStates = this._onDidUpdateResourceStates.event;
    this._disposed = false;
    this._onDidDispose = new Emitter();
    this.onDidDispose = this._onDidDispose.event;
    this._handlesSnapshot = [];
    this._resourceSnapshot = [];
    this._contextValue = void 0;
    this._hideWhenEmpty = void 0;
    this.handle = _ExtHostSourceControlResourceGroup._handlePool++;
  }
  get disposed() {
    return this._disposed;
  }
  get id() {
    return this._id;
  }
  get label() {
    return this._label;
  }
  set label(label) {
    this._label = label;
    this._proxy.$updateGroupLabel(this._sourceControlHandle, this.handle, label);
  }
  get contextValue() {
    return this._contextValue;
  }
  set contextValue(contextValue) {
    this._contextValue = contextValue;
    this._proxy.$updateGroup(this._sourceControlHandle, this.handle, this.features);
  }
  get hideWhenEmpty() {
    return this._hideWhenEmpty;
  }
  set hideWhenEmpty(hideWhenEmpty) {
    this._hideWhenEmpty = hideWhenEmpty;
    this._proxy.$updateGroup(this._sourceControlHandle, this.handle, this.features);
  }
  get features() {
    return {
      contextValue: this.contextValue,
      hideWhenEmpty: this.hideWhenEmpty
    };
  }
  get resourceStates() {
    return [...this._resourceStates];
  }
  set resourceStates(resources) {
    this._resourceStates = [...resources];
    this._onDidUpdateResourceStates.fire();
  }
  getResourceState(handle) {
    return this._resourceStatesMap.get(handle);
  }
  $executeResourceCommand(handle, preserveFocus) {
    const command = this._resourceStatesCommandsMap.get(handle);
    if (!command) {
      return Promise.resolve(void 0);
    }
    return asPromise(() => this._commands.executeCommand(command.command, ...command.arguments || [], preserveFocus));
  }
  _takeResourceStateSnapshot() {
    const snapshot = [...this._resourceStates].sort(compareResourceStates);
    const diffs = sortedDiff(this._resourceSnapshot, snapshot, compareResourceStates);
    const splices = diffs.map((diff) => {
      const toInsert = diff.toInsert.map((r) => {
        const handle = this._resourceHandlePool++;
        this._resourceStatesMap.set(handle, r);
        const sourceUri = r.resourceUri;
        let command;
        if (r.command) {
          if (r.command.command === "vscode.open" || r.command.command === "vscode.diff" || r.command.command === "vscode.changes") {
            const disposables = new DisposableStore();
            command = this._commands.converter.toInternal(r.command, disposables);
            this._resourceStatesDisposablesMap.set(handle, disposables);
          } else {
            this._resourceStatesCommandsMap.set(handle, r.command);
          }
        }
        const hasScmMultiDiffEditorProposalEnabled = isProposedApiEnabled(this._extension, "scmMultiDiffEditor");
        const multiFileDiffEditorOriginalUri = hasScmMultiDiffEditorProposalEnabled ? r.multiDiffEditorOriginalUri : void 0;
        const multiFileDiffEditorModifiedUri = hasScmMultiDiffEditorProposalEnabled ? r.multiFileDiffEditorModifiedUri : void 0;
        const icon = getIconResource(r.decorations);
        const lightIcon = r.decorations && getIconResource(r.decorations.light) || icon;
        const darkIcon = r.decorations && getIconResource(r.decorations.dark) || icon;
        const icons = [lightIcon, darkIcon];
        const tooltip = r.decorations && r.decorations.tooltip || "";
        const strikeThrough = r.decorations && !!r.decorations.strikeThrough;
        const faded = r.decorations && !!r.decorations.faded;
        const contextValue = r.contextValue || "";
        const rawResource = [handle, sourceUri, icons, tooltip, strikeThrough, faded, contextValue, command, multiFileDiffEditorOriginalUri, multiFileDiffEditorModifiedUri];
        return { rawResource, handle };
      });
      return { start: diff.start, deleteCount: diff.deleteCount, toInsert };
    });
    const rawResourceSplices = splices.map(({ start, deleteCount, toInsert }) => [start, deleteCount, toInsert.map((i) => i.rawResource)]);
    const reverseSplices = splices.reverse();
    for (const { start, deleteCount, toInsert } of reverseSplices) {
      const handles = toInsert.map((i) => i.handle);
      const handlesToDelete = this._handlesSnapshot.splice(start, deleteCount, ...handles);
      for (const handle of handlesToDelete) {
        this._resourceStatesMap.delete(handle);
        this._resourceStatesCommandsMap.delete(handle);
        this._resourceStatesDisposablesMap.get(handle)?.dispose();
        this._resourceStatesDisposablesMap.delete(handle);
      }
    }
    this._resourceSnapshot = snapshot;
    return rawResourceSplices;
  }
  dispose() {
    this._disposed = true;
    this._onDidDispose.fire();
    this._onDidUpdateResourceStates.dispose();
    this._onDidDispose.dispose();
  }
};
_ExtHostSourceControlResourceGroup._handlePool = 0;
let ExtHostSourceControlResourceGroup = _ExtHostSourceControlResourceGroup;
const _ExtHostSourceControl = class _ExtHostSourceControl {
  constructor(_extension, _extHostDocuments, proxy, _commands, _id, _label, _rootUri, _iconPath, _isHidden, _parent) {
    this._extension = _extension;
    this._commands = _commands;
    this._id = _id;
    this._label = _label;
    this._rootUri = _rootUri;
    this._onDidDispose = new Emitter();
    this.onDidDispose = this._onDidDispose.event;
    __privateAdd(this, _proxy);
    this._groups = /* @__PURE__ */ new Map();
    this._contextValue = void 0;
    this._count = void 0;
    this._quickDiffProvider = void 0;
    this._secondaryQuickDiffProvider = void 0;
    this._historyProviderDisposable = new MutableDisposable();
    this._artifactProviderDisposable = new MutableDisposable();
    this._commitTemplate = void 0;
    this._acceptInputDisposables = new MutableDisposable();
    this._acceptInputCommand = void 0;
    // We know what we're doing here:
    // eslint-disable-next-line local/code-no-potentially-unsafe-disposables
    this._actionButtonDisposables = new DisposableStore();
    // We know what we're doing here:
    // eslint-disable-next-line local/code-no-potentially-unsafe-disposables
    this._statusBarDisposables = new DisposableStore();
    this._statusBarCommands = void 0;
    this._selected = false;
    this._onDidChangeSelection = new Emitter();
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    this._artifactCommandsDisposables = new DisposableMap();
    this.handle = _ExtHostSourceControl._handlePool++;
    this.createdResourceGroups = /* @__PURE__ */ new Map();
    this.updatedResourceGroups = /* @__PURE__ */ new Set();
    __privateSet(this, _proxy, proxy);
    const inputBoxDocumentUri = URI.from({
      scheme: Schemas.vscodeSourceControl,
      path: `${_id}/scm${this.handle}/input`,
      query: _rootUri ? `rootUri=${encodeURIComponent(_rootUri.toString())}` : void 0
    });
    this._inputBox = new ExtHostSCMInputBox(_extension, _extHostDocuments, __privateGet(this, _proxy), this.handle, inputBoxDocumentUri);
    __privateGet(this, _proxy).$registerSourceControl(this.handle, _parent?.handle, _id, _label, _rootUri, getHistoryItemIconDto(_iconPath), _isHidden, inputBoxDocumentUri);
    this.onDidDisposeParent = _parent ? _parent.onDidDispose : Event.None;
  }
  get id() {
    return this._id;
  }
  get label() {
    return this._label;
  }
  get rootUri() {
    return this._rootUri;
  }
  get contextValue() {
    checkProposedApiEnabled(this._extension, "scmProviderOptions");
    return this._contextValue;
  }
  set contextValue(contextValue) {
    checkProposedApiEnabled(this._extension, "scmProviderOptions");
    if (this._contextValue === contextValue) {
      return;
    }
    this._contextValue = contextValue;
    __privateGet(this, _proxy).$updateSourceControl(this.handle, { contextValue });
  }
  get inputBox() {
    return this._inputBox;
  }
  get count() {
    return this._count;
  }
  set count(count) {
    if (this._count === count) {
      return;
    }
    this._count = count;
    __privateGet(this, _proxy).$updateSourceControl(this.handle, { count });
  }
  get quickDiffProvider() {
    return this._quickDiffProvider;
  }
  set quickDiffProvider(quickDiffProvider) {
    this._quickDiffProvider = quickDiffProvider;
    let quickDiffLabel = void 0;
    if (isProposedApiEnabled(this._extension, "quickDiffProvider")) {
      quickDiffLabel = quickDiffProvider?.label;
    }
    __privateGet(this, _proxy).$updateSourceControl(this.handle, { hasQuickDiffProvider: !!quickDiffProvider, quickDiffLabel });
  }
  get secondaryQuickDiffProvider() {
    checkProposedApiEnabled(this._extension, "quickDiffProvider");
    return this._secondaryQuickDiffProvider;
  }
  set secondaryQuickDiffProvider(secondaryQuickDiffProvider) {
    checkProposedApiEnabled(this._extension, "quickDiffProvider");
    this._secondaryQuickDiffProvider = secondaryQuickDiffProvider;
    const secondaryQuickDiffLabel = secondaryQuickDiffProvider?.label;
    __privateGet(this, _proxy).$updateSourceControl(this.handle, { hasSecondaryQuickDiffProvider: !!secondaryQuickDiffProvider, secondaryQuickDiffLabel });
  }
  get historyProvider() {
    checkProposedApiEnabled(this._extension, "scmHistoryProvider");
    return this._historyProvider;
  }
  set historyProvider(historyProvider) {
    checkProposedApiEnabled(this._extension, "scmHistoryProvider");
    this._historyProvider = historyProvider;
    this._historyProviderDisposable.value = new DisposableStore();
    __privateGet(this, _proxy).$updateSourceControl(this.handle, { hasHistoryProvider: !!historyProvider });
    if (historyProvider) {
      this._historyProviderDisposable.value.add(historyProvider.onDidChangeCurrentHistoryItemRefs(() => {
        const historyItemRef = toSCMHistoryItemRefDto(historyProvider?.currentHistoryItemRef);
        const historyItemRemoteRef = toSCMHistoryItemRefDto(historyProvider?.currentHistoryItemRemoteRef);
        const historyItemBaseRef = toSCMHistoryItemRefDto(historyProvider?.currentHistoryItemBaseRef);
        __privateGet(this, _proxy).$onDidChangeHistoryProviderCurrentHistoryItemRefs(this.handle, historyItemRef, historyItemRemoteRef, historyItemBaseRef);
      }));
      this._historyProviderDisposable.value.add(historyProvider.onDidChangeHistoryItemRefs((e) => {
        if (e.added.length === 0 && e.modified.length === 0 && e.removed.length === 0) {
          return;
        }
        const added = e.added.map((ref) => ({ ...ref, icon: getHistoryItemIconDto(ref.icon) }));
        const modified = e.modified.map((ref) => ({ ...ref, icon: getHistoryItemIconDto(ref.icon) }));
        const removed = e.removed.map((ref) => ({ ...ref, icon: getHistoryItemIconDto(ref.icon) }));
        __privateGet(this, _proxy).$onDidChangeHistoryProviderHistoryItemRefs(this.handle, { added, modified, removed, silent: e.silent });
      }));
    }
  }
  get artifactProvider() {
    checkProposedApiEnabled(this._extension, "scmArtifactProvider");
    return this._artifactProvider;
  }
  set artifactProvider(artifactProvider) {
    checkProposedApiEnabled(this._extension, "scmArtifactProvider");
    this._artifactProvider = artifactProvider;
    this._artifactProviderDisposable.value = new DisposableStore();
    __privateGet(this, _proxy).$updateSourceControl(this.handle, { hasArtifactProvider: !!artifactProvider });
    if (artifactProvider) {
      this._artifactProviderDisposable.value.add(artifactProvider.onDidChangeArtifacts((groups) => {
        if (groups.length !== 0) {
          __privateGet(this, _proxy).$onDidChangeArtifacts(this.handle, groups);
        }
      }));
    }
  }
  get commitTemplate() {
    return this._commitTemplate;
  }
  set commitTemplate(commitTemplate) {
    if (commitTemplate === this._commitTemplate) {
      return;
    }
    this._commitTemplate = commitTemplate;
    __privateGet(this, _proxy).$updateSourceControl(this.handle, { commitTemplate });
  }
  get acceptInputCommand() {
    return this._acceptInputCommand;
  }
  set acceptInputCommand(acceptInputCommand) {
    this._acceptInputDisposables.value = new DisposableStore();
    this._acceptInputCommand = acceptInputCommand;
    const internal = this._commands.converter.toInternal(acceptInputCommand, this._acceptInputDisposables.value);
    __privateGet(this, _proxy).$updateSourceControl(this.handle, { acceptInputCommand: internal });
  }
  get actionButton() {
    checkProposedApiEnabled(this._extension, "scmActionButton");
    return this._actionButton;
  }
  set actionButton(actionButton) {
    checkProposedApiEnabled(this._extension, "scmActionButton");
    if (structuralEquals(this._actionButton, actionButton)) {
      return;
    }
    const oldActionButtonDisposables = this._actionButtonDisposables;
    this._actionButtonDisposables = new DisposableStore();
    this._actionButton = actionButton;
    const actionButtonDto = actionButton !== void 0 ? {
      command: {
        ...this._commands.converter.toInternal(actionButton.command, this._actionButtonDisposables),
        shortTitle: actionButton.command.shortTitle
      },
      secondaryCommands: actionButton.secondaryCommands?.map((commandGroup) => {
        return commandGroup.map((command) => this._commands.converter.toInternal(command, this._actionButtonDisposables));
      }),
      enabled: actionButton.enabled
    } : null;
    __privateGet(this, _proxy).$updateSourceControl(this.handle, { actionButton: actionButtonDto }).finally(() => oldActionButtonDisposables.dispose());
  }
  get statusBarCommands() {
    return this._statusBarCommands;
  }
  set statusBarCommands(statusBarCommands) {
    if (this._statusBarCommands && statusBarCommands && commandListEquals(this._statusBarCommands, statusBarCommands)) {
      return;
    }
    const oldStatusBarDisposables = this._statusBarDisposables;
    this._statusBarDisposables = new DisposableStore();
    this._statusBarCommands = statusBarCommands;
    const internal = (statusBarCommands || []).map((c) => this._commands.converter.toInternal(c, this._statusBarDisposables));
    __privateGet(this, _proxy).$updateSourceControl(this.handle, { statusBarCommands: internal }).finally(() => oldStatusBarDisposables.dispose());
  }
  get selected() {
    return this._selected;
  }
  createResourceGroup(id, label, options) {
    const multiDiffEditorEnableViewChanges = isProposedApiEnabled(this._extension, "scmMultiDiffEditor") && options?.multiDiffEditorEnableViewChanges === true;
    const group = new ExtHostSourceControlResourceGroup(__privateGet(this, _proxy), this._commands, this.handle, id, label, multiDiffEditorEnableViewChanges, this._extension);
    const disposable = Event.once(group.onDidDispose)(() => this.createdResourceGroups.delete(group));
    this.createdResourceGroups.set(group, disposable);
    this.eventuallyAddResourceGroups();
    return group;
  }
  eventuallyAddResourceGroups() {
    const groups = [];
    const splices = [];
    for (const [group, disposable] of this.createdResourceGroups) {
      disposable.dispose();
      const updateListener = group.onDidUpdateResourceStates(() => {
        this.updatedResourceGroups.add(group);
        this.eventuallyUpdateResourceStates();
      });
      Event.once(group.onDidDispose)(() => {
        this.updatedResourceGroups.delete(group);
        updateListener.dispose();
        this._groups.delete(group.handle);
        __privateGet(this, _proxy).$unregisterGroup(this.handle, group.handle);
      });
      groups.push([group.handle, group.id, group.label, group.features, group.multiDiffEditorEnableViewChanges]);
      const snapshot = group._takeResourceStateSnapshot();
      if (snapshot.length > 0) {
        splices.push([group.handle, snapshot]);
      }
      this._groups.set(group.handle, group);
    }
    __privateGet(this, _proxy).$registerGroups(this.handle, groups, splices);
    this.createdResourceGroups.clear();
  }
  eventuallyUpdateResourceStates() {
    const splices = [];
    this.updatedResourceGroups.forEach((group) => {
      const snapshot = group._takeResourceStateSnapshot();
      if (snapshot.length === 0) {
        return;
      }
      splices.push([group.handle, snapshot]);
    });
    if (splices.length > 0) {
      __privateGet(this, _proxy).$spliceResourceStates(this.handle, splices);
    }
    this.updatedResourceGroups.clear();
  }
  getResourceGroup(handle) {
    return this._groups.get(handle);
  }
  setSelectionState(selected) {
    this._selected = selected;
    this._onDidChangeSelection.fire(selected);
  }
  async provideArtifacts(group, token) {
    const commandsDisposables = new DisposableStore();
    const artifacts = await this.artifactProvider?.provideArtifacts(group, token);
    const artifactsDto = artifacts?.map((artifact) => ({
      ...artifact,
      icon: getHistoryItemIconDto(artifact.icon),
      command: artifact.command ? this._commands.converter.toInternal(artifact.command, commandsDisposables) : void 0
    }));
    this._artifactCommandsDisposables.get(group)?.dispose();
    this._artifactCommandsDisposables.set(group, commandsDisposables);
    return artifactsDto;
  }
  dispose() {
    this._acceptInputDisposables.dispose();
    this._actionButtonDisposables.dispose();
    this._statusBarDisposables.dispose();
    this._historyProviderDisposable.dispose();
    this._artifactProviderDisposable.dispose();
    this._artifactCommandsDisposables.dispose();
    this._groups.forEach((group) => group.dispose());
    __privateGet(this, _proxy).$unregisterSourceControl(this.handle);
    this._onDidChangeSelection.dispose();
    this._onDidDispose.fire();
    this._onDidDispose.dispose();
  }
};
_proxy = new WeakMap();
_ExtHostSourceControl._handlePool = 0;
__decorateClass([
  debounce(100)
], _ExtHostSourceControl.prototype, "eventuallyAddResourceGroups", 1);
__decorateClass([
  debounce(100)
], _ExtHostSourceControl.prototype, "eventuallyUpdateResourceStates", 1);
let ExtHostSourceControl = _ExtHostSourceControl;
let ExtHostSCM = class {
  constructor(mainContext, _commands, _extHostDocuments, logService) {
    this._commands = _commands;
    this._extHostDocuments = _extHostDocuments;
    this.logService = logService;
    this._sourceControls = /* @__PURE__ */ new Map();
    this._sourceControlsByExtension = new ExtensionIdentifierMap();
    this._onDidChangeActiveProvider = new Emitter();
    this._proxy = mainContext.getProxy(MainContext.MainThreadSCM);
    this._telemetry = mainContext.getProxy(MainContext.MainThreadTelemetry);
    _commands.registerArgumentProcessor({
      processArgument: (arg) => {
        if (arg && arg.$mid === MarshalledId.ScmResource) {
          const sourceControl = this._sourceControls.get(arg.sourceControlHandle);
          if (!sourceControl) {
            return arg;
          }
          const group = sourceControl.getResourceGroup(arg.groupHandle);
          if (!group) {
            return arg;
          }
          return group.getResourceState(arg.handle);
        } else if (arg && arg.$mid === MarshalledId.ScmResourceGroup) {
          const sourceControl = this._sourceControls.get(arg.sourceControlHandle);
          if (!sourceControl) {
            return arg;
          }
          return sourceControl.getResourceGroup(arg.groupHandle);
        } else if (arg && arg.$mid === MarshalledId.ScmProvider) {
          const sourceControl = this._sourceControls.get(arg.handle);
          if (!sourceControl) {
            return arg;
          }
          return sourceControl;
        }
        return arg;
      }
    });
  }
  get onDidChangeActiveProvider() {
    return this._onDidChangeActiveProvider.event;
  }
  createSourceControl(extension, id, label, rootUri, iconPath, isHidden, parent) {
    this.logService.trace("ExtHostSCM#createSourceControl", extension.identifier.value, id, label, rootUri);
    this._telemetry.$publicLog2("api/scm/createSourceControl", {
      extensionId: extension.identifier.value
    });
    const parentSourceControl = parent ? Iterable.find(this._sourceControls.values(), (s) => s === parent) : void 0;
    const sourceControl = new ExtHostSourceControl(extension, this._extHostDocuments, this._proxy, this._commands, id, label, rootUri, iconPath, isHidden, parentSourceControl);
    this._sourceControls.set(sourceControl.handle, sourceControl);
    const sourceControls = this._sourceControlsByExtension.get(extension.identifier) || [];
    sourceControls.push(sourceControl);
    this._sourceControlsByExtension.set(extension.identifier, sourceControls);
    Event.once(sourceControl.onDidDispose)(() => {
      this.logService.trace("ExtHostSCM#disposeSourceControl", extension.identifier.value, id, label, rootUri);
      this._sourceControls.delete(sourceControl.handle);
      const sourceControls2 = this._sourceControlsByExtension.get(extension.identifier);
      if (sourceControls2) {
        const index = sourceControls2.indexOf(sourceControl);
        if (index !== -1) {
          sourceControls2.splice(index, 1);
        }
        if (sourceControls2.length === 0) {
          this._sourceControlsByExtension.delete(extension.identifier);
        }
      }
    });
    return sourceControl;
  }
  // Deprecated
  getLastInputBox(extension) {
    this.logService.trace("ExtHostSCM#getLastInputBox", extension.identifier.value);
    const sourceControls = this._sourceControlsByExtension.get(extension.identifier);
    const sourceControl = sourceControls && sourceControls[sourceControls.length - 1];
    return sourceControl && sourceControl.inputBox;
  }
  $provideOriginalResource(sourceControlHandle, uriComponents, token) {
    const uri = URI.revive(uriComponents);
    this.logService.trace("ExtHostSCM#$provideOriginalResource", sourceControlHandle, uri.toString());
    const sourceControl = this._sourceControls.get(sourceControlHandle);
    if (!sourceControl || !sourceControl.quickDiffProvider || !sourceControl.quickDiffProvider.provideOriginalResource) {
      return Promise.resolve(null);
    }
    return asPromise(() => sourceControl.quickDiffProvider.provideOriginalResource(uri, token)).then((r) => r || null);
  }
  $provideSecondaryOriginalResource(sourceControlHandle, uriComponents, token) {
    const uri = URI.revive(uriComponents);
    this.logService.trace("ExtHostSCM#$provideSecondaryOriginalResource", sourceControlHandle, uri.toString());
    const sourceControl = this._sourceControls.get(sourceControlHandle);
    if (!sourceControl || !sourceControl.secondaryQuickDiffProvider || !sourceControl.secondaryQuickDiffProvider.provideOriginalResource) {
      return Promise.resolve(null);
    }
    return asPromise(() => sourceControl.secondaryQuickDiffProvider.provideOriginalResource(uri, token)).then((r) => r || null);
  }
  $onInputBoxValueChange(sourceControlHandle, value) {
    this.logService.trace("ExtHostSCM#$onInputBoxValueChange", sourceControlHandle);
    const sourceControl = this._sourceControls.get(sourceControlHandle);
    if (!sourceControl) {
      return Promise.resolve(void 0);
    }
    sourceControl.inputBox.$onInputBoxValueChange(value);
    return Promise.resolve(void 0);
  }
  $executeResourceCommand(sourceControlHandle, groupHandle, handle, preserveFocus) {
    this.logService.trace("ExtHostSCM#$executeResourceCommand", sourceControlHandle, groupHandle, handle);
    const sourceControl = this._sourceControls.get(sourceControlHandle);
    if (!sourceControl) {
      return Promise.resolve(void 0);
    }
    const group = sourceControl.getResourceGroup(groupHandle);
    if (!group) {
      return Promise.resolve(void 0);
    }
    return group.$executeResourceCommand(handle, preserveFocus);
  }
  $validateInput(sourceControlHandle, value, cursorPosition) {
    this.logService.trace("ExtHostSCM#$validateInput", sourceControlHandle);
    const sourceControl = this._sourceControls.get(sourceControlHandle);
    if (!sourceControl) {
      return Promise.resolve(void 0);
    }
    if (!sourceControl.inputBox.validateInput) {
      return Promise.resolve(void 0);
    }
    return asPromise(() => sourceControl.inputBox.validateInput(value, cursorPosition)).then((result) => {
      if (!result) {
        return Promise.resolve(void 0);
      }
      const message = MarkdownString.fromStrict(result.message);
      if (!message) {
        return Promise.resolve(void 0);
      }
      return Promise.resolve([message, result.type]);
    });
  }
  $setSelectedSourceControl(selectedSourceControlHandle) {
    this.logService.trace("ExtHostSCM#$setSelectedSourceControl", selectedSourceControlHandle);
    if (this._selectedSourceControlHandle === selectedSourceControlHandle) {
      return Promise.resolve(void 0);
    }
    if (selectedSourceControlHandle !== void 0) {
      this._sourceControls.get(selectedSourceControlHandle)?.setSelectionState(true);
    }
    if (this._selectedSourceControlHandle !== void 0) {
      this._sourceControls.get(this._selectedSourceControlHandle)?.setSelectionState(false);
    }
    this._selectedSourceControlHandle = selectedSourceControlHandle;
    return Promise.resolve(void 0);
  }
  async $resolveHistoryItem(sourceControlHandle, historyItemId, token) {
    try {
      const historyProvider = this._sourceControls.get(sourceControlHandle)?.historyProvider;
      const historyItem = await historyProvider?.resolveHistoryItem(historyItemId, token);
      return historyItem ? toSCMHistoryItemDto(historyItem) : void 0;
    } catch (err) {
      this.logService.error("ExtHostSCM#$resolveHistoryItem", err);
      return void 0;
    }
  }
  async $resolveHistoryItemChatContext(sourceControlHandle, historyItemId, token) {
    try {
      const historyProvider = this._sourceControls.get(sourceControlHandle)?.historyProvider;
      const chatContext = await historyProvider?.resolveHistoryItemChatContext(historyItemId, token);
      return chatContext ?? void 0;
    } catch (err) {
      this.logService.error("ExtHostSCM#$resolveHistoryItemChatContext", err);
      return void 0;
    }
  }
  async $resolveHistoryItemChangeRangeChatContext(sourceControlHandle, historyItemId, historyItemParentId, path, token) {
    try {
      const historyProvider = this._sourceControls.get(sourceControlHandle)?.historyProvider;
      const chatContext = await historyProvider?.resolveHistoryItemChangeRangeChatContext?.(historyItemId, historyItemParentId, path, token);
      return chatContext ?? void 0;
    } catch (err) {
      this.logService.error("ExtHostSCM#$resolveHistoryItemChangeRangeChatContext", err);
      return void 0;
    }
  }
  async $resolveHistoryItemRefsCommonAncestor(sourceControlHandle, historyItemRefs, token) {
    try {
      const historyProvider = this._sourceControls.get(sourceControlHandle)?.historyProvider;
      const ancestor = await historyProvider?.resolveHistoryItemRefsCommonAncestor(historyItemRefs, token);
      return ancestor ?? void 0;
    } catch (err) {
      this.logService.error("ExtHostSCM#$resolveHistoryItemRefsCommonAncestor", err);
      return void 0;
    }
  }
  async $provideHistoryItemRefs(sourceControlHandle, historyItemRefs, token) {
    try {
      const historyProvider = this._sourceControls.get(sourceControlHandle)?.historyProvider;
      const refs = await historyProvider?.provideHistoryItemRefs(historyItemRefs, token);
      return refs?.map((ref) => ({ ...ref, icon: getHistoryItemIconDto(ref.icon) })) ?? void 0;
    } catch (err) {
      this.logService.error("ExtHostSCM#$provideHistoryItemRefs", err);
      return void 0;
    }
  }
  async $provideHistoryItems(sourceControlHandle, options, token) {
    try {
      const historyProvider = this._sourceControls.get(sourceControlHandle)?.historyProvider;
      const historyItems = await historyProvider?.provideHistoryItems(options, token);
      return historyItems?.map((item) => toSCMHistoryItemDto(item)) ?? void 0;
    } catch (err) {
      this.logService.error("ExtHostSCM#$provideHistoryItems", err);
      return void 0;
    }
  }
  async $provideHistoryItemChanges(sourceControlHandle, historyItemId, historyItemParentId, token) {
    try {
      const historyProvider = this._sourceControls.get(sourceControlHandle)?.historyProvider;
      const changes = await historyProvider?.provideHistoryItemChanges(historyItemId, historyItemParentId, token);
      return changes ?? void 0;
    } catch (err) {
      this.logService.error("ExtHostSCM#$provideHistoryItemChanges", err);
      return void 0;
    }
  }
  async $provideArtifactGroups(sourceControlHandle, token) {
    try {
      const artifactProvider = this._sourceControls.get(sourceControlHandle)?.artifactProvider;
      const groups = await artifactProvider?.provideArtifactGroups(token);
      return groups?.map((group) => ({
        ...group,
        icon: getHistoryItemIconDto(group.icon)
      }));
    } catch (err) {
      this.logService.error("ExtHostSCM#$provideArtifactGroups", err);
      return void 0;
    }
  }
  async $provideArtifacts(sourceControlHandle, group, token) {
    try {
      const sourceControl = this._sourceControls.get(sourceControlHandle);
      return sourceControl?.provideArtifacts(group, token);
    } catch (err) {
      this.logService.error("ExtHostSCM#$provideArtifacts", err);
      return void 0;
    }
  }
};
ExtHostSCM = __decorateClass([
  __decorateParam(3, ILogService)
], ExtHostSCM);
export {
  ExtHostSCM,
  ExtHostSCMInputBox
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0U0NNLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgZGVib3VuY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGFzUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb21tYW5kcyB9IGZyb20gJy4vZXh0SG9zdENvbW1hbmRzLmpzJztcbmltcG9ydCB7IE1haW5Db250ZXh0LCBNYWluVGhyZWFkU0NNU2hhcGUsIFNDTVJhd1Jlc291cmNlLCBTQ01SYXdSZXNvdXJjZVNwbGljZSwgU0NNUmF3UmVzb3VyY2VTcGxpY2VzLCBJTWFpbkNvbnRleHQsIEV4dEhvc3RTQ01TaGFwZSwgSUNvbW1hbmREdG8sIE1haW5UaHJlYWRUZWxlbWV0cnlTaGFwZSwgU0NNR3JvdXBGZWF0dXJlcywgU0NNSGlzdG9yeUl0ZW1EdG8sIFNDTUhpc3RvcnlJdGVtQ2hhbmdlRHRvLCBTQ01IaXN0b3J5SXRlbVJlZkR0bywgU0NNQWN0aW9uQnV0dG9uRHRvLCBTQ01BcnRpZmFjdEdyb3VwRHRvLCBTQ01BcnRpZmFjdER0byB9IGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBzb3J0ZWREaWZmLCBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgY29tcGFyZVBhdGhzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29tcGFyZXJzLmpzJztcbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBJU3BsaWNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc2VxdWVuY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyTWFwLCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRJZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZywgU291cmNlQ29udHJvbElucHV0Qm94VmFsaWRhdGlvblR5cGUgfSBmcm9tICcuL2V4dEhvc3RUeXBlQ29udmVydGVycy5qcyc7XG5pbXBvcnQgeyBjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCwgaXNQcm9wb3NlZEFwaUVuYWJsZWQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV4dEhvc3REb2N1bWVudHMgfSBmcm9tICcuL2V4dEhvc3REb2N1bWVudHMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgaXNMaW51eCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IHN0cnVjdHVyYWxFcXVhbHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcXVhbHMuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5cbnR5cGUgUHJvdmlkZXJIYW5kbGUgPSBudW1iZXI7XG50eXBlIEdyb3VwSGFuZGxlID0gbnVtYmVyO1xudHlwZSBSZXNvdXJjZVN0YXRlSGFuZGxlID0gbnVtYmVyO1xuXG5mdW5jdGlvbiBpc1VyaSh0aGluZzogYW55KTogdGhpbmcgaXMgdnNjb2RlLlVyaSB7XG5cdHJldHVybiB0aGluZyBpbnN0YW5jZW9mIFVSSTtcbn1cblxuZnVuY3Rpb24gdXJpRXF1YWxzKGE6IHZzY29kZS5VcmksIGI6IHZzY29kZS5VcmkpOiBib29sZWFuIHtcblx0aWYgKGEuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgJiYgYi5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSAmJiBpc0xpbnV4KSB7XG5cdFx0cmV0dXJuIGEudG9TdHJpbmcoKSA9PT0gYi50b1N0cmluZygpO1xuXHR9XG5cblx0cmV0dXJuIGEudG9TdHJpbmcoKS50b0xvd2VyQ2FzZSgpID09PSBiLnRvU3RyaW5nKCkudG9Mb3dlckNhc2UoKTtcbn1cblxuZnVuY3Rpb24gZ2V0SWNvblJlc291cmNlKGRlY29yYXRpb25zPzogdnNjb2RlLlNvdXJjZUNvbnRyb2xSZXNvdXJjZVRoZW1hYmxlRGVjb3JhdGlvbnMpOiBVcmlDb21wb25lbnRzIHwgVGhlbWVJY29uIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFkZWNvcmF0aW9ucykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH0gZWxzZSBpZiAodHlwZW9mIGRlY29yYXRpb25zLmljb25QYXRoID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiBVUkkuZmlsZShkZWNvcmF0aW9ucy5pY29uUGF0aCk7XG5cdH0gZWxzZSBpZiAoVVJJLmlzVXJpKGRlY29yYXRpb25zLmljb25QYXRoKSkge1xuXHRcdHJldHVybiBkZWNvcmF0aW9ucy5pY29uUGF0aDtcblx0fSBlbHNlIGlmIChUaGVtZUljb24uaXNUaGVtZUljb24oZGVjb3JhdGlvbnMuaWNvblBhdGgpKSB7XG5cdFx0cmV0dXJuIGRlY29yYXRpb25zLmljb25QYXRoO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0SGlzdG9yeUl0ZW1JY29uRHRvKGljb246IHZzY29kZS5VcmkgfCB7IGxpZ2h0OiB2c2NvZGUuVXJpOyBkYXJrOiB2c2NvZGUuVXJpIH0gfCB2c2NvZGUuVGhlbWVJY29uIHwgdW5kZWZpbmVkKTogVXJpQ29tcG9uZW50cyB8IHsgbGlnaHQ6IFVyaUNvbXBvbmVudHM7IGRhcms6IFVyaUNvbXBvbmVudHMgfSB8IFRoZW1lSWNvbiB8IHVuZGVmaW5lZCB7XG5cdGlmICghaWNvbikge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH0gZWxzZSBpZiAoVVJJLmlzVXJpKGljb24pKSB7XG5cdFx0cmV0dXJuIGljb247XG5cdH0gZWxzZSBpZiAoVGhlbWVJY29uLmlzVGhlbWVJY29uKGljb24pKSB7XG5cdFx0cmV0dXJuIGljb247XG5cdH0gZWxzZSB7XG5cdFx0Y29uc3QgaWNvbkR0byA9IGljb24gYXMgeyBsaWdodDogVVJJOyBkYXJrOiBVUkkgfTtcblx0XHRyZXR1cm4geyBsaWdodDogaWNvbkR0by5saWdodCwgZGFyazogaWNvbkR0by5kYXJrIH07XG5cdH1cbn1cblxuZnVuY3Rpb24gdG9TQ01IaXN0b3J5SXRlbUR0byhoaXN0b3J5SXRlbTogdnNjb2RlLlNvdXJjZUNvbnRyb2xIaXN0b3J5SXRlbSk6IFNDTUhpc3RvcnlJdGVtRHRvIHtcblx0Y29uc3QgYXV0aG9ySWNvbiA9IGdldEhpc3RvcnlJdGVtSWNvbkR0byhoaXN0b3J5SXRlbS5hdXRob3JJY29uKTtcblx0Y29uc3QgdG9vbHRpcCA9IEFycmF5LmlzQXJyYXkoaGlzdG9yeUl0ZW0udG9vbHRpcClcblx0XHQ/IE1hcmtkb3duU3RyaW5nLmZyb21NYW55KGhpc3RvcnlJdGVtLnRvb2x0aXApXG5cdFx0OiBoaXN0b3J5SXRlbS50b29sdGlwID8gTWFya2Rvd25TdHJpbmcuZnJvbShoaXN0b3J5SXRlbS50b29sdGlwKSA6IHVuZGVmaW5lZDtcblxuXHRjb25zdCByZWZlcmVuY2VzID0gaGlzdG9yeUl0ZW0ucmVmZXJlbmNlcz8ubWFwKHIgPT4gKHtcblx0XHQuLi5yLCBpY29uOiBnZXRIaXN0b3J5SXRlbUljb25EdG8oci5pY29uKVxuXHR9KSk7XG5cblx0cmV0dXJuIHsgLi4uaGlzdG9yeUl0ZW0sIGF1dGhvckljb24sIHJlZmVyZW5jZXMsIHRvb2x0aXAgfTtcbn1cblxuZnVuY3Rpb24gdG9TQ01IaXN0b3J5SXRlbVJlZkR0byhoaXN0b3J5SXRlbVJlZj86IHZzY29kZS5Tb3VyY2VDb250cm9sSGlzdG9yeUl0ZW1SZWYpOiBTQ01IaXN0b3J5SXRlbVJlZkR0byB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBoaXN0b3J5SXRlbVJlZiA/IHsgLi4uaGlzdG9yeUl0ZW1SZWYsIGljb246IGdldEhpc3RvcnlJdGVtSWNvbkR0byhoaXN0b3J5SXRlbVJlZi5pY29uKSB9IDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBjb21wYXJlUmVzb3VyY2VUaGVtYWJsZURlY29yYXRpb25zKGE6IHZzY29kZS5Tb3VyY2VDb250cm9sUmVzb3VyY2VUaGVtYWJsZURlY29yYXRpb25zLCBiOiB2c2NvZGUuU291cmNlQ29udHJvbFJlc291cmNlVGhlbWFibGVEZWNvcmF0aW9ucyk6IG51bWJlciB7XG5cdGlmICghYS5pY29uUGF0aCAmJiAhYi5pY29uUGF0aCkge1xuXHRcdHJldHVybiAwO1xuXHR9IGVsc2UgaWYgKCFhLmljb25QYXRoKSB7XG5cdFx0cmV0dXJuIC0xO1xuXHR9IGVsc2UgaWYgKCFiLmljb25QYXRoKSB7XG5cdFx0cmV0dXJuIDE7XG5cdH1cblxuXHRjb25zdCBhUGF0aCA9IHR5cGVvZiBhLmljb25QYXRoID09PSAnc3RyaW5nJyA/IGEuaWNvblBhdGggOiBVUkkuaXNVcmkoYS5pY29uUGF0aCkgPyBhLmljb25QYXRoLmZzUGF0aCA6IChhLmljb25QYXRoIGFzIHZzY29kZS5UaGVtZUljb24pLmlkO1xuXHRjb25zdCBiUGF0aCA9IHR5cGVvZiBiLmljb25QYXRoID09PSAnc3RyaW5nJyA/IGIuaWNvblBhdGggOiBVUkkuaXNVcmkoYi5pY29uUGF0aCkgPyBiLmljb25QYXRoLmZzUGF0aCA6IChiLmljb25QYXRoIGFzIHZzY29kZS5UaGVtZUljb24pLmlkO1xuXHRyZXR1cm4gY29tcGFyZVBhdGhzKGFQYXRoLCBiUGF0aCk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhcmVSZXNvdXJjZVN0YXRlc0RlY29yYXRpb25zKGE6IHZzY29kZS5Tb3VyY2VDb250cm9sUmVzb3VyY2VEZWNvcmF0aW9ucywgYjogdnNjb2RlLlNvdXJjZUNvbnRyb2xSZXNvdXJjZURlY29yYXRpb25zKTogbnVtYmVyIHtcblx0bGV0IHJlc3VsdCA9IDA7XG5cblx0aWYgKGEuc3RyaWtlVGhyb3VnaCAhPT0gYi5zdHJpa2VUaHJvdWdoKSB7XG5cdFx0cmV0dXJuIGEuc3RyaWtlVGhyb3VnaCA/IDEgOiAtMTtcblx0fVxuXG5cdGlmIChhLmZhZGVkICE9PSBiLmZhZGVkKSB7XG5cdFx0cmV0dXJuIGEuZmFkZWQgPyAxIDogLTE7XG5cdH1cblxuXHRpZiAoYS50b29sdGlwICE9PSBiLnRvb2x0aXApIHtcblx0XHRyZXR1cm4gKGEudG9vbHRpcCB8fCAnJykubG9jYWxlQ29tcGFyZShiLnRvb2x0aXAgfHwgJycpO1xuXHR9XG5cblx0cmVzdWx0ID0gY29tcGFyZVJlc291cmNlVGhlbWFibGVEZWNvcmF0aW9ucyhhLCBiKTtcblxuXHRpZiAocmVzdWx0ICE9PSAwKSB7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGlmIChhLmxpZ2h0ICYmIGIubGlnaHQpIHtcblx0XHRyZXN1bHQgPSBjb21wYXJlUmVzb3VyY2VUaGVtYWJsZURlY29yYXRpb25zKGEubGlnaHQsIGIubGlnaHQpO1xuXHR9IGVsc2UgaWYgKGEubGlnaHQpIHtcblx0XHRyZXR1cm4gMTtcblx0fSBlbHNlIGlmIChiLmxpZ2h0KSB7XG5cdFx0cmV0dXJuIC0xO1xuXHR9XG5cblx0aWYgKHJlc3VsdCAhPT0gMCkge1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRpZiAoYS5kYXJrICYmIGIuZGFyaykge1xuXHRcdHJlc3VsdCA9IGNvbXBhcmVSZXNvdXJjZVRoZW1hYmxlRGVjb3JhdGlvbnMoYS5kYXJrLCBiLmRhcmspO1xuXHR9IGVsc2UgaWYgKGEuZGFyaykge1xuXHRcdHJldHVybiAxO1xuXHR9IGVsc2UgaWYgKGIuZGFyaykge1xuXHRcdHJldHVybiAtMTtcblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGNvbXBhcmVDb21tYW5kcyhhOiB2c2NvZGUuQ29tbWFuZCwgYjogdnNjb2RlLkNvbW1hbmQpOiBudW1iZXIge1xuXHRpZiAoYS5jb21tYW5kICE9PSBiLmNvbW1hbmQpIHtcblx0XHRyZXR1cm4gYS5jb21tYW5kIDwgYi5jb21tYW5kID8gLTEgOiAxO1xuXHR9XG5cblx0aWYgKGEudGl0bGUgIT09IGIudGl0bGUpIHtcblx0XHRyZXR1cm4gYS50aXRsZSA8IGIudGl0bGUgPyAtMSA6IDE7XG5cdH1cblxuXHRpZiAoYS50b29sdGlwICE9PSBiLnRvb2x0aXApIHtcblx0XHRpZiAoYS50b29sdGlwICE9PSB1bmRlZmluZWQgJiYgYi50b29sdGlwICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBhLnRvb2x0aXAgPCBiLnRvb2x0aXAgPyAtMSA6IDE7XG5cdFx0fSBlbHNlIGlmIChhLnRvb2x0aXAgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fSBlbHNlIGlmIChiLnRvb2x0aXAgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0fVxuXG5cdGlmIChhLmFyZ3VtZW50cyA9PT0gYi5hcmd1bWVudHMpIHtcblx0XHRyZXR1cm4gMDtcblx0fSBlbHNlIGlmICghYS5hcmd1bWVudHMpIHtcblx0XHRyZXR1cm4gLTE7XG5cdH0gZWxzZSBpZiAoIWIuYXJndW1lbnRzKSB7XG5cdFx0cmV0dXJuIDE7XG5cdH0gZWxzZSBpZiAoYS5hcmd1bWVudHMubGVuZ3RoICE9PSBiLmFyZ3VtZW50cy5sZW5ndGgpIHtcblx0XHRyZXR1cm4gYS5hcmd1bWVudHMubGVuZ3RoIC0gYi5hcmd1bWVudHMubGVuZ3RoO1xuXHR9XG5cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhLmFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IGFBcmcgPSBhLmFyZ3VtZW50c1tpXTtcblx0XHRjb25zdCBiQXJnID0gYi5hcmd1bWVudHNbaV07XG5cblx0XHRpZiAoYUFyZyA9PT0gYkFyZykge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKGlzVXJpKGFBcmcpICYmIGlzVXJpKGJBcmcpICYmIHVyaUVxdWFscyhhQXJnLCBiQXJnKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFBcmcgPCBiQXJnID8gLTEgOiAxO1xuXHR9XG5cblx0cmV0dXJuIDA7XG59XG5cbmZ1bmN0aW9uIGNvbXBhcmVSZXNvdXJjZVN0YXRlcyhhOiB2c2NvZGUuU291cmNlQ29udHJvbFJlc291cmNlU3RhdGUsIGI6IHZzY29kZS5Tb3VyY2VDb250cm9sUmVzb3VyY2VTdGF0ZSk6IG51bWJlciB7XG5cdGxldCByZXN1bHQgPSBjb21wYXJlUGF0aHMoYS5yZXNvdXJjZVVyaS5mc1BhdGgsIGIucmVzb3VyY2VVcmkuZnNQYXRoLCB0cnVlKTtcblxuXHRpZiAocmVzdWx0ICE9PSAwKSB7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGlmIChhLmNvbW1hbmQgJiYgYi5jb21tYW5kKSB7XG5cdFx0cmVzdWx0ID0gY29tcGFyZUNvbW1hbmRzKGEuY29tbWFuZCwgYi5jb21tYW5kKTtcblx0fSBlbHNlIGlmIChhLmNvbW1hbmQpIHtcblx0XHRyZXR1cm4gMTtcblx0fSBlbHNlIGlmIChiLmNvbW1hbmQpIHtcblx0XHRyZXR1cm4gLTE7XG5cdH1cblxuXHRpZiAocmVzdWx0ICE9PSAwKSB7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGlmIChhLmRlY29yYXRpb25zICYmIGIuZGVjb3JhdGlvbnMpIHtcblx0XHRyZXN1bHQgPSBjb21wYXJlUmVzb3VyY2VTdGF0ZXNEZWNvcmF0aW9ucyhhLmRlY29yYXRpb25zLCBiLmRlY29yYXRpb25zKTtcblx0fSBlbHNlIGlmIChhLmRlY29yYXRpb25zKSB7XG5cdFx0cmV0dXJuIDE7XG5cdH0gZWxzZSBpZiAoYi5kZWNvcmF0aW9ucykge1xuXHRcdHJldHVybiAtMTtcblx0fVxuXG5cdGlmIChyZXN1bHQgIT09IDApIHtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0aWYgKGEubXVsdGlGaWxlRGlmZkVkaXRvck1vZGlmaWVkVXJpICYmIGIubXVsdGlGaWxlRGlmZkVkaXRvck1vZGlmaWVkVXJpKSB7XG5cdFx0cmVzdWx0ID0gY29tcGFyZVBhdGhzKGEubXVsdGlGaWxlRGlmZkVkaXRvck1vZGlmaWVkVXJpLmZzUGF0aCwgYi5tdWx0aUZpbGVEaWZmRWRpdG9yTW9kaWZpZWRVcmkuZnNQYXRoLCB0cnVlKTtcblx0fSBlbHNlIGlmIChhLm11bHRpRmlsZURpZmZFZGl0b3JNb2RpZmllZFVyaSkge1xuXHRcdHJldHVybiAxO1xuXHR9IGVsc2UgaWYgKGIubXVsdGlGaWxlRGlmZkVkaXRvck1vZGlmaWVkVXJpKSB7XG5cdFx0cmV0dXJuIC0xO1xuXHR9XG5cblx0aWYgKHJlc3VsdCAhPT0gMCkge1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRpZiAoYS5tdWx0aURpZmZFZGl0b3JPcmlnaW5hbFVyaSAmJiBiLm11bHRpRGlmZkVkaXRvck9yaWdpbmFsVXJpKSB7XG5cdFx0cmVzdWx0ID0gY29tcGFyZVBhdGhzKGEubXVsdGlEaWZmRWRpdG9yT3JpZ2luYWxVcmkuZnNQYXRoLCBiLm11bHRpRGlmZkVkaXRvck9yaWdpbmFsVXJpLmZzUGF0aCwgdHJ1ZSk7XG5cdH0gZWxzZSBpZiAoYS5tdWx0aURpZmZFZGl0b3JPcmlnaW5hbFVyaSkge1xuXHRcdHJldHVybiAxO1xuXHR9IGVsc2UgaWYgKGIubXVsdGlEaWZmRWRpdG9yT3JpZ2luYWxVcmkpIHtcblx0XHRyZXR1cm4gLTE7XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBjb21wYXJlQXJncyhhOiBhbnlbXSwgYjogYW55W10pOiBib29sZWFuIHtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XG5cdFx0aWYgKGFbaV0gIT09IGJbaV0pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gY29tbWFuZEVxdWFscyhhOiB2c2NvZGUuQ29tbWFuZCwgYjogdnNjb2RlLkNvbW1hbmQpOiBib29sZWFuIHtcblx0cmV0dXJuIGEuY29tbWFuZCA9PT0gYi5jb21tYW5kXG5cdFx0JiYgYS50aXRsZSA9PT0gYi50aXRsZVxuXHRcdCYmIGEudG9vbHRpcCA9PT0gYi50b29sdGlwXG5cdFx0JiYgKGEuYXJndW1lbnRzICYmIGIuYXJndW1lbnRzID8gY29tcGFyZUFyZ3MoYS5hcmd1bWVudHMsIGIuYXJndW1lbnRzKSA6IGEuYXJndW1lbnRzID09PSBiLmFyZ3VtZW50cyk7XG59XG5cbmZ1bmN0aW9uIGNvbW1hbmRMaXN0RXF1YWxzKGE6IHJlYWRvbmx5IHZzY29kZS5Db21tYW5kW10sIGI6IHJlYWRvbmx5IHZzY29kZS5Db21tYW5kW10pOiBib29sZWFuIHtcblx0cmV0dXJuIGVxdWFscyhhLCBiLCBjb21tYW5kRXF1YWxzKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVmFsaWRhdGVJbnB1dCB7XG5cdCh2YWx1ZTogc3RyaW5nLCBjdXJzb3JQb3NpdGlvbjogbnVtYmVyKTogdnNjb2RlLlByb3ZpZGVyUmVzdWx0PHZzY29kZS5Tb3VyY2VDb250cm9sSW5wdXRCb3hWYWxpZGF0aW9uIHwgdW5kZWZpbmVkIHwgbnVsbD47XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0U0NNSW5wdXRCb3ggaW1wbGVtZW50cyB2c2NvZGUuU291cmNlQ29udHJvbElucHV0Qm94IHtcblxuXHQjcHJveHk6IE1haW5UaHJlYWRTQ01TaGFwZTtcblx0I2V4dEhvc3REb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHM7XG5cblx0cHJpdmF0ZSBfdmFsdWU6IHN0cmluZyA9ICcnO1xuXG5cdGdldCB2YWx1ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl92YWx1ZTtcblx0fVxuXG5cdHNldCB2YWx1ZSh2YWx1ZTogc3RyaW5nKSB7XG5cdFx0dmFsdWUgPSB2YWx1ZSA/PyAnJztcblx0XHR0aGlzLiNwcm94eS4kc2V0SW5wdXRCb3hWYWx1ZSh0aGlzLl9zb3VyY2VDb250cm9sSGFuZGxlLCB2YWx1ZSk7XG5cdFx0dGhpcy51cGRhdGVWYWx1ZSh2YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblxuXHRnZXQgb25EaWRDaGFuZ2UoKTogRXZlbnQ8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBfcGxhY2Vob2xkZXI6IHN0cmluZyA9ICcnO1xuXG5cdGdldCBwbGFjZWhvbGRlcigpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9wbGFjZWhvbGRlcjtcblx0fVxuXG5cdHNldCBwbGFjZWhvbGRlcihwbGFjZWhvbGRlcjogc3RyaW5nKSB7XG5cdFx0dGhpcy4jcHJveHkuJHNldElucHV0Qm94UGxhY2Vob2xkZXIodGhpcy5fc291cmNlQ29udHJvbEhhbmRsZSwgcGxhY2Vob2xkZXIpO1xuXHRcdHRoaXMuX3BsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXI7XG5cdH1cblxuXHRwcml2YXRlIF92YWxpZGF0ZUlucHV0OiBJVmFsaWRhdGVJbnB1dCB8IHVuZGVmaW5lZDtcblxuXHRnZXQgdmFsaWRhdGVJbnB1dCgpOiBJVmFsaWRhdGVJbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhpcy5fZXh0ZW5zaW9uLCAnc2NtVmFsaWRhdGlvbicpO1xuXG5cdFx0cmV0dXJuIHRoaXMuX3ZhbGlkYXRlSW5wdXQ7XG5cdH1cblxuXHRzZXQgdmFsaWRhdGVJbnB1dChmbjogSVZhbGlkYXRlSW5wdXQgfCB1bmRlZmluZWQpIHtcblx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLl9leHRlbnNpb24sICdzY21WYWxpZGF0aW9uJyk7XG5cblx0XHRpZiAoZm4gJiYgdHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFske3RoaXMuX2V4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlfV06IEludmFsaWQgU0NNIGlucHV0IGJveCB2YWxpZGF0aW9uIGZ1bmN0aW9uYCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdmFsaWRhdGVJbnB1dCA9IGZuO1xuXHRcdHRoaXMuI3Byb3h5LiRzZXRWYWxpZGF0aW9uUHJvdmlkZXJJc0VuYWJsZWQodGhpcy5fc291cmNlQ29udHJvbEhhbmRsZSwgISFmbik7XG5cdH1cblxuXHRwcml2YXRlIF9lbmFibGVkOiBib29sZWFuID0gdHJ1ZTtcblxuXHRnZXQgZW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZW5hYmxlZDtcblx0fVxuXG5cdHNldCBlbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pIHtcblx0XHRlbmFibGVkID0gISFlbmFibGVkO1xuXG5cdFx0aWYgKHRoaXMuX2VuYWJsZWQgPT09IGVuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9lbmFibGVkID0gZW5hYmxlZDtcblx0XHR0aGlzLiNwcm94eS4kc2V0SW5wdXRCb3hFbmFibGVtZW50KHRoaXMuX3NvdXJjZUNvbnRyb2xIYW5kbGUsIGVuYWJsZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdmlzaWJsZTogYm9vbGVhbiA9IHRydWU7XG5cblx0Z2V0IHZpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Zpc2libGU7XG5cdH1cblxuXHRzZXQgdmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKSB7XG5cdFx0dmlzaWJsZSA9ICEhdmlzaWJsZTtcblxuXHRcdGlmICh0aGlzLl92aXNpYmxlID09PSB2aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fdmlzaWJsZSA9IHZpc2libGU7XG5cdFx0dGhpcy4jcHJveHkuJHNldElucHV0Qm94VmlzaWJpbGl0eSh0aGlzLl9zb3VyY2VDb250cm9sSGFuZGxlLCB2aXNpYmxlKTtcblx0fVxuXG5cdGdldCBkb2N1bWVudCgpOiB2c2NvZGUuVGV4dERvY3VtZW50IHtcblx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLl9leHRlbnNpb24sICdzY21UZXh0RG9jdW1lbnQnKTtcblxuXHRcdHJldHVybiB0aGlzLiNleHRIb3N0RG9jdW1lbnRzLmdldERvY3VtZW50KHRoaXMuX2RvY3VtZW50VXJpKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgX2V4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBfZXh0SG9zdERvY3VtZW50czogRXh0SG9zdERvY3VtZW50cywgcHJveHk6IE1haW5UaHJlYWRTQ01TaGFwZSwgcHJpdmF0ZSBfc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLCBwcml2YXRlIF9kb2N1bWVudFVyaTogVVJJKSB7XG5cdFx0dGhpcy4jZXh0SG9zdERvY3VtZW50cyA9IF9leHRIb3N0RG9jdW1lbnRzO1xuXHRcdHRoaXMuI3Byb3h5ID0gcHJveHk7XG5cdH1cblxuXHRzaG93VmFsaWRhdGlvbk1lc3NhZ2UobWVzc2FnZTogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nLCB0eXBlOiB2c2NvZGUuU291cmNlQ29udHJvbElucHV0Qm94VmFsaWRhdGlvblR5cGUpIHtcblx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLl9leHRlbnNpb24sICdzY21WYWxpZGF0aW9uJyk7XG5cdFx0dGhpcy4jcHJveHkuJHNob3dWYWxpZGF0aW9uTWVzc2FnZSh0aGlzLl9zb3VyY2VDb250cm9sSGFuZGxlLCBtZXNzYWdlLCBTb3VyY2VDb250cm9sSW5wdXRCb3hWYWxpZGF0aW9uVHlwZS5mcm9tKHR5cGUpKTtcblx0fVxuXG5cdCRvbklucHV0Qm94VmFsdWVDaGFuZ2UodmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlVmFsdWUodmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVWYWx1ZSh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fdmFsdWUgPSB2YWx1ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHZhbHVlKTtcblx0fVxufVxuXG5jbGFzcyBFeHRIb3N0U291cmNlQ29udHJvbFJlc291cmNlR3JvdXAgaW1wbGVtZW50cyB2c2NvZGUuU291cmNlQ29udHJvbFJlc291cmNlR3JvdXAge1xuXG5cdHByaXZhdGUgc3RhdGljIF9oYW5kbGVQb29sOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF9yZXNvdXJjZUhhbmRsZVBvb2w6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX3Jlc291cmNlU3RhdGVzOiB2c2NvZGUuU291cmNlQ29udHJvbFJlc291cmNlU3RhdGVbXSA9IFtdO1xuXG5cdHByaXZhdGUgX3Jlc291cmNlU3RhdGVzTWFwID0gbmV3IE1hcDxSZXNvdXJjZVN0YXRlSGFuZGxlLCB2c2NvZGUuU291cmNlQ29udHJvbFJlc291cmNlU3RhdGU+KCk7XG5cdHByaXZhdGUgX3Jlc291cmNlU3RhdGVzQ29tbWFuZHNNYXAgPSBuZXcgTWFwPFJlc291cmNlU3RhdGVIYW5kbGUsIHZzY29kZS5Db21tYW5kPigpO1xuXHRwcml2YXRlIF9yZXNvdXJjZVN0YXRlc0Rpc3Bvc2FibGVzTWFwID0gbmV3IE1hcDxSZXNvdXJjZVN0YXRlSGFuZGxlLCBJRGlzcG9zYWJsZT4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVwZGF0ZVJlc291cmNlU3RhdGVzID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRVcGRhdGVSZXNvdXJjZVN0YXRlcyA9IHRoaXMuX29uRGlkVXBkYXRlUmVzb3VyY2VTdGF0ZXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfZGlzcG9zZWQgPSBmYWxzZTtcblx0Z2V0IGRpc3Bvc2VkKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fZGlzcG9zZWQ7IH1cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNwb3NlID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWREaXNwb3NlID0gdGhpcy5fb25EaWREaXNwb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgX2hhbmRsZXNTbmFwc2hvdDogbnVtYmVyW10gPSBbXTtcblx0cHJpdmF0ZSBfcmVzb3VyY2VTbmFwc2hvdDogdnNjb2RlLlNvdXJjZUNvbnRyb2xSZXNvdXJjZVN0YXRlW10gPSBbXTtcblxuXHRnZXQgaWQoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuX2lkOyB9XG5cblx0Z2V0IGxhYmVsKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLl9sYWJlbDsgfVxuXHRzZXQgbGFiZWwobGFiZWw6IHN0cmluZykge1xuXHRcdHRoaXMuX2xhYmVsID0gbGFiZWw7XG5cdFx0dGhpcy5fcHJveHkuJHVwZGF0ZUdyb3VwTGFiZWwodGhpcy5fc291cmNlQ29udHJvbEhhbmRsZSwgdGhpcy5oYW5kbGUsIGxhYmVsKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbnRleHRWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRnZXQgY29udGV4dFZhbHVlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRleHRWYWx1ZTtcblx0fVxuXHRzZXQgY29udGV4dFZhbHVlKGNvbnRleHRWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fY29udGV4dFZhbHVlID0gY29udGV4dFZhbHVlO1xuXHRcdHRoaXMuX3Byb3h5LiR1cGRhdGVHcm91cCh0aGlzLl9zb3VyY2VDb250cm9sSGFuZGxlLCB0aGlzLmhhbmRsZSwgdGhpcy5mZWF0dXJlcyk7XG5cdH1cblxuXHRwcml2YXRlIF9oaWRlV2hlbkVtcHR5OiBib29sZWFuIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRnZXQgaGlkZVdoZW5FbXB0eSgpOiBib29sZWFuIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2hpZGVXaGVuRW1wdHk7IH1cblx0c2V0IGhpZGVXaGVuRW1wdHkoaGlkZVdoZW5FbXB0eTogYm9vbGVhbiB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2hpZGVXaGVuRW1wdHkgPSBoaWRlV2hlbkVtcHR5O1xuXHRcdHRoaXMuX3Byb3h5LiR1cGRhdGVHcm91cCh0aGlzLl9zb3VyY2VDb250cm9sSGFuZGxlLCB0aGlzLmhhbmRsZSwgdGhpcy5mZWF0dXJlcyk7XG5cdH1cblxuXHRnZXQgZmVhdHVyZXMoKTogU0NNR3JvdXBGZWF0dXJlcyB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRleHRWYWx1ZTogdGhpcy5jb250ZXh0VmFsdWUsXG5cdFx0XHRoaWRlV2hlbkVtcHR5OiB0aGlzLmhpZGVXaGVuRW1wdHlcblx0XHR9O1xuXHR9XG5cblx0Z2V0IHJlc291cmNlU3RhdGVzKCk6IHZzY29kZS5Tb3VyY2VDb250cm9sUmVzb3VyY2VTdGF0ZVtdIHsgcmV0dXJuIFsuLi50aGlzLl9yZXNvdXJjZVN0YXRlc107IH1cblx0c2V0IHJlc291cmNlU3RhdGVzKHJlc291cmNlczogdnNjb2RlLlNvdXJjZUNvbnRyb2xSZXNvdXJjZVN0YXRlW10pIHtcblx0XHR0aGlzLl9yZXNvdXJjZVN0YXRlcyA9IFsuLi5yZXNvdXJjZXNdO1xuXHRcdHRoaXMuX29uRGlkVXBkYXRlUmVzb3VyY2VTdGF0ZXMuZmlyZSgpO1xuXHR9XG5cblx0cmVhZG9ubHkgaGFuZGxlID0gRXh0SG9zdFNvdXJjZUNvbnRyb2xSZXNvdXJjZUdyb3VwLl9oYW5kbGVQb29sKys7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfcHJveHk6IE1haW5UaHJlYWRTQ01TaGFwZSxcblx0XHRwcml2YXRlIF9jb21tYW5kczogRXh0SG9zdENvbW1hbmRzLFxuXHRcdHByaXZhdGUgX3NvdXJjZUNvbnRyb2xIYW5kbGU6IG51bWJlcixcblx0XHRwcml2YXRlIF9pZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgX2xhYmVsOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IG11bHRpRGlmZkVkaXRvckVuYWJsZVZpZXdDaGFuZ2VzOiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHQpIHsgfVxuXG5cdGdldFJlc291cmNlU3RhdGUoaGFuZGxlOiBudW1iZXIpOiB2c2NvZGUuU291cmNlQ29udHJvbFJlc291cmNlU3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9yZXNvdXJjZVN0YXRlc01hcC5nZXQoaGFuZGxlKTtcblx0fVxuXG5cdCRleGVjdXRlUmVzb3VyY2VDb21tYW5kKGhhbmRsZTogbnVtYmVyLCBwcmVzZXJ2ZUZvY3VzOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29tbWFuZCA9IHRoaXMuX3Jlc291cmNlU3RhdGVzQ29tbWFuZHNNYXAuZ2V0KGhhbmRsZSk7XG5cblx0XHRpZiAoIWNvbW1hbmQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYXNQcm9taXNlKCgpID0+IHRoaXMuX2NvbW1hbmRzLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmQuY29tbWFuZCwgLi4uKGNvbW1hbmQuYXJndW1lbnRzIHx8IFtdKSwgcHJlc2VydmVGb2N1cykpO1xuXHR9XG5cblx0X3Rha2VSZXNvdXJjZVN0YXRlU25hcHNob3QoKTogU0NNUmF3UmVzb3VyY2VTcGxpY2VbXSB7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBbLi4udGhpcy5fcmVzb3VyY2VTdGF0ZXNdLnNvcnQoY29tcGFyZVJlc291cmNlU3RhdGVzKTtcblx0XHRjb25zdCBkaWZmcyA9IHNvcnRlZERpZmYodGhpcy5fcmVzb3VyY2VTbmFwc2hvdCwgc25hcHNob3QsIGNvbXBhcmVSZXNvdXJjZVN0YXRlcyk7XG5cblx0XHRjb25zdCBzcGxpY2VzID0gZGlmZnMubWFwPElTcGxpY2U8eyByYXdSZXNvdXJjZTogU0NNUmF3UmVzb3VyY2U7IGhhbmRsZTogbnVtYmVyIH0+PihkaWZmID0+IHtcblx0XHRcdGNvbnN0IHRvSW5zZXJ0ID0gZGlmZi50b0luc2VydC5tYXAociA9PiB7XG5cdFx0XHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX3Jlc291cmNlSGFuZGxlUG9vbCsrO1xuXHRcdFx0XHR0aGlzLl9yZXNvdXJjZVN0YXRlc01hcC5zZXQoaGFuZGxlLCByKTtcblxuXHRcdFx0XHRjb25zdCBzb3VyY2VVcmkgPSByLnJlc291cmNlVXJpO1xuXG5cdFx0XHRcdGxldCBjb21tYW5kOiBJQ29tbWFuZER0byB8IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHIuY29tbWFuZCkge1xuXHRcdFx0XHRcdGlmIChyLmNvbW1hbmQuY29tbWFuZCA9PT0gJ3ZzY29kZS5vcGVuJyB8fCByLmNvbW1hbmQuY29tbWFuZCA9PT0gJ3ZzY29kZS5kaWZmJyB8fCByLmNvbW1hbmQuY29tbWFuZCA9PT0gJ3ZzY29kZS5jaGFuZ2VzJykge1xuXHRcdFx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdFx0XHRjb21tYW5kID0gdGhpcy5fY29tbWFuZHMuY29udmVydGVyLnRvSW50ZXJuYWwoci5jb21tYW5kLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZXNvdXJjZVN0YXRlc0Rpc3Bvc2FibGVzTWFwLnNldChoYW5kbGUsIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5fcmVzb3VyY2VTdGF0ZXNDb21tYW5kc01hcC5zZXQoaGFuZGxlLCByLmNvbW1hbmQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGhhc1NjbU11bHRpRGlmZkVkaXRvclByb3Bvc2FsRW5hYmxlZCA9IGlzUHJvcG9zZWRBcGlFbmFibGVkKHRoaXMuX2V4dGVuc2lvbiwgJ3NjbU11bHRpRGlmZkVkaXRvcicpO1xuXHRcdFx0XHRjb25zdCBtdWx0aUZpbGVEaWZmRWRpdG9yT3JpZ2luYWxVcmkgPSBoYXNTY21NdWx0aURpZmZFZGl0b3JQcm9wb3NhbEVuYWJsZWQgPyByLm11bHRpRGlmZkVkaXRvck9yaWdpbmFsVXJpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBtdWx0aUZpbGVEaWZmRWRpdG9yTW9kaWZpZWRVcmkgPSBoYXNTY21NdWx0aURpZmZFZGl0b3JQcm9wb3NhbEVuYWJsZWQgPyByLm11bHRpRmlsZURpZmZFZGl0b3JNb2RpZmllZFVyaSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRjb25zdCBpY29uID0gZ2V0SWNvblJlc291cmNlKHIuZGVjb3JhdGlvbnMpO1xuXHRcdFx0XHRjb25zdCBsaWdodEljb24gPSByLmRlY29yYXRpb25zICYmIGdldEljb25SZXNvdXJjZShyLmRlY29yYXRpb25zLmxpZ2h0KSB8fCBpY29uO1xuXHRcdFx0XHRjb25zdCBkYXJrSWNvbiA9IHIuZGVjb3JhdGlvbnMgJiYgZ2V0SWNvblJlc291cmNlKHIuZGVjb3JhdGlvbnMuZGFyaykgfHwgaWNvbjtcblx0XHRcdFx0Y29uc3QgaWNvbnM6IFNDTVJhd1Jlc291cmNlWzJdID0gW2xpZ2h0SWNvbiwgZGFya0ljb25dO1xuXG5cdFx0XHRcdGNvbnN0IHRvb2x0aXAgPSAoci5kZWNvcmF0aW9ucyAmJiByLmRlY29yYXRpb25zLnRvb2x0aXApIHx8ICcnO1xuXHRcdFx0XHRjb25zdCBzdHJpa2VUaHJvdWdoID0gci5kZWNvcmF0aW9ucyAmJiAhIXIuZGVjb3JhdGlvbnMuc3RyaWtlVGhyb3VnaDtcblx0XHRcdFx0Y29uc3QgZmFkZWQgPSByLmRlY29yYXRpb25zICYmICEhci5kZWNvcmF0aW9ucy5mYWRlZDtcblx0XHRcdFx0Y29uc3QgY29udGV4dFZhbHVlID0gci5jb250ZXh0VmFsdWUgfHwgJyc7XG5cblx0XHRcdFx0Y29uc3QgcmF3UmVzb3VyY2UgPSBbaGFuZGxlLCBzb3VyY2VVcmksIGljb25zLCB0b29sdGlwLCBzdHJpa2VUaHJvdWdoLCBmYWRlZCwgY29udGV4dFZhbHVlLCBjb21tYW5kLCBtdWx0aUZpbGVEaWZmRWRpdG9yT3JpZ2luYWxVcmksIG11bHRpRmlsZURpZmZFZGl0b3JNb2RpZmllZFVyaV0gYXMgU0NNUmF3UmVzb3VyY2U7XG5cblx0XHRcdFx0cmV0dXJuIHsgcmF3UmVzb3VyY2UsIGhhbmRsZSB9O1xuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiB7IHN0YXJ0OiBkaWZmLnN0YXJ0LCBkZWxldGVDb3VudDogZGlmZi5kZWxldGVDb3VudCwgdG9JbnNlcnQgfTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJhd1Jlc291cmNlU3BsaWNlcyA9IHNwbGljZXNcblx0XHRcdC5tYXAoKHsgc3RhcnQsIGRlbGV0ZUNvdW50LCB0b0luc2VydCB9KSA9PiBbc3RhcnQsIGRlbGV0ZUNvdW50LCB0b0luc2VydC5tYXAoaSA9PiBpLnJhd1Jlc291cmNlKV0gYXMgU0NNUmF3UmVzb3VyY2VTcGxpY2UpO1xuXG5cdFx0Y29uc3QgcmV2ZXJzZVNwbGljZXMgPSBzcGxpY2VzLnJldmVyc2UoKTtcblxuXHRcdGZvciAoY29uc3QgeyBzdGFydCwgZGVsZXRlQ291bnQsIHRvSW5zZXJ0IH0gb2YgcmV2ZXJzZVNwbGljZXMpIHtcblx0XHRcdGNvbnN0IGhhbmRsZXMgPSB0b0luc2VydC5tYXAoaSA9PiBpLmhhbmRsZSk7XG5cdFx0XHRjb25zdCBoYW5kbGVzVG9EZWxldGUgPSB0aGlzLl9oYW5kbGVzU25hcHNob3Quc3BsaWNlKHN0YXJ0LCBkZWxldGVDb3VudCwgLi4uaGFuZGxlcyk7XG5cblx0XHRcdGZvciAoY29uc3QgaGFuZGxlIG9mIGhhbmRsZXNUb0RlbGV0ZSkge1xuXHRcdFx0XHR0aGlzLl9yZXNvdXJjZVN0YXRlc01hcC5kZWxldGUoaGFuZGxlKTtcblx0XHRcdFx0dGhpcy5fcmVzb3VyY2VTdGF0ZXNDb21tYW5kc01hcC5kZWxldGUoaGFuZGxlKTtcblx0XHRcdFx0dGhpcy5fcmVzb3VyY2VTdGF0ZXNEaXNwb3NhYmxlc01hcC5nZXQoaGFuZGxlKT8uZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9yZXNvdXJjZVN0YXRlc0Rpc3Bvc2FibGVzTWFwLmRlbGV0ZShoYW5kbGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3Jlc291cmNlU25hcHNob3QgPSBzbmFwc2hvdDtcblx0XHRyZXR1cm4gcmF3UmVzb3VyY2VTcGxpY2VzO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NlZCA9IHRydWU7XG5cdFx0dGhpcy5fb25EaWREaXNwb3NlLmZpcmUoKTtcblx0XHR0aGlzLl9vbkRpZFVwZGF0ZVJlc291cmNlU3RhdGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZERpc3Bvc2UuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIEV4dEhvc3RTb3VyY2VDb250cm9sIGltcGxlbWVudHMgdnNjb2RlLlNvdXJjZUNvbnRyb2wge1xuXG5cdHByaXZhdGUgc3RhdGljIF9oYW5kbGVQb29sOiBudW1iZXIgPSAwO1xuXG5cdHJlYWRvbmx5IG9uRGlkRGlzcG9zZVBhcmVudDogRXZlbnQ8dm9pZD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNwb3NlID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWREaXNwb3NlID0gdGhpcy5fb25EaWREaXNwb3NlLmV2ZW50O1xuXG5cblx0I3Byb3h5OiBNYWluVGhyZWFkU0NNU2hhcGU7XG5cblx0cHJpdmF0ZSBfZ3JvdXBzOiBNYXA8R3JvdXBIYW5kbGUsIEV4dEhvc3RTb3VyY2VDb250cm9sUmVzb3VyY2VHcm91cD4gPSBuZXcgTWFwPEdyb3VwSGFuZGxlLCBFeHRIb3N0U291cmNlQ29udHJvbFJlc291cmNlR3JvdXA+KCk7XG5cblx0Z2V0IGlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2lkO1xuXHR9XG5cblx0Z2V0IGxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhYmVsO1xuXHR9XG5cblx0Z2V0IHJvb3RVcmkoKTogdnNjb2RlLlVyaSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jvb3RVcmk7XG5cdH1cblxuXHRwcml2YXRlIF9jb250ZXh0VmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRnZXQgY29udGV4dFZhbHVlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhpcy5fZXh0ZW5zaW9uLCAnc2NtUHJvdmlkZXJPcHRpb25zJyk7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRleHRWYWx1ZTtcblx0fVxuXG5cdHNldCBjb250ZXh0VmFsdWUoY29udGV4dFZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLl9leHRlbnNpb24sICdzY21Qcm92aWRlck9wdGlvbnMnKTtcblxuXHRcdGlmICh0aGlzLl9jb250ZXh0VmFsdWUgPT09IGNvbnRleHRWYWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NvbnRleHRWYWx1ZSA9IGNvbnRleHRWYWx1ZTtcblx0XHR0aGlzLiNwcm94eS4kdXBkYXRlU291cmNlQ29udHJvbCh0aGlzLmhhbmRsZSwgeyBjb250ZXh0VmFsdWUgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9pbnB1dEJveDogRXh0SG9zdFNDTUlucHV0Qm94O1xuXHRnZXQgaW5wdXRCb3goKTogRXh0SG9zdFNDTUlucHV0Qm94IHsgcmV0dXJuIHRoaXMuX2lucHV0Qm94OyB9XG5cblx0cHJpdmF0ZSBfY291bnQ6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRnZXQgY291bnQoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY291bnQ7XG5cdH1cblxuXHRzZXQgY291bnQoY291bnQ6IG51bWJlciB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLl9jb3VudCA9PT0gY291bnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jb3VudCA9IGNvdW50O1xuXHRcdHRoaXMuI3Byb3h5LiR1cGRhdGVTb3VyY2VDb250cm9sKHRoaXMuaGFuZGxlLCB7IGNvdW50IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcXVpY2tEaWZmUHJvdmlkZXI6IHZzY29kZS5RdWlja0RpZmZQcm92aWRlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRnZXQgcXVpY2tEaWZmUHJvdmlkZXIoKTogdnNjb2RlLlF1aWNrRGlmZlByb3ZpZGVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fcXVpY2tEaWZmUHJvdmlkZXI7XG5cdH1cblxuXHRzZXQgcXVpY2tEaWZmUHJvdmlkZXIocXVpY2tEaWZmUHJvdmlkZXI6IHZzY29kZS5RdWlja0RpZmZQcm92aWRlciB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX3F1aWNrRGlmZlByb3ZpZGVyID0gcXVpY2tEaWZmUHJvdmlkZXI7XG5cdFx0bGV0IHF1aWNrRGlmZkxhYmVsID0gdW5kZWZpbmVkO1xuXHRcdGlmIChpc1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLl9leHRlbnNpb24sICdxdWlja0RpZmZQcm92aWRlcicpKSB7XG5cdFx0XHRxdWlja0RpZmZMYWJlbCA9IHF1aWNrRGlmZlByb3ZpZGVyPy5sYWJlbDtcblx0XHR9XG5cdFx0dGhpcy4jcHJveHkuJHVwZGF0ZVNvdXJjZUNvbnRyb2wodGhpcy5oYW5kbGUsIHsgaGFzUXVpY2tEaWZmUHJvdmlkZXI6ICEhcXVpY2tEaWZmUHJvdmlkZXIsIHF1aWNrRGlmZkxhYmVsIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2Vjb25kYXJ5UXVpY2tEaWZmUHJvdmlkZXI6IHZzY29kZS5RdWlja0RpZmZQcm92aWRlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRnZXQgc2Vjb25kYXJ5UXVpY2tEaWZmUHJvdmlkZXIoKTogdnNjb2RlLlF1aWNrRGlmZlByb3ZpZGVyIHwgdW5kZWZpbmVkIHtcblx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLl9leHRlbnNpb24sICdxdWlja0RpZmZQcm92aWRlcicpO1xuXHRcdHJldHVybiB0aGlzLl9zZWNvbmRhcnlRdWlja0RpZmZQcm92aWRlcjtcblx0fVxuXG5cdHNldCBzZWNvbmRhcnlRdWlja0RpZmZQcm92aWRlcihzZWNvbmRhcnlRdWlja0RpZmZQcm92aWRlcjogdnNjb2RlLlF1aWNrRGlmZlByb3ZpZGVyIHwgdW5kZWZpbmVkKSB7XG5cdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhpcy5fZXh0ZW5zaW9uLCAncXVpY2tEaWZmUHJvdmlkZXInKTtcblxuXHRcdHRoaXMuX3NlY29uZGFyeVF1aWNrRGlmZlByb3ZpZGVyID0gc2Vjb25kYXJ5UXVpY2tEaWZmUHJvdmlkZXI7XG5cdFx0Y29uc3Qgc2Vjb25kYXJ5UXVpY2tEaWZmTGFiZWwgPSBzZWNvbmRhcnlRdWlja0RpZmZQcm92aWRlcj8ubGFiZWw7XG5cdFx0dGhpcy4jcHJveHkuJHVwZGF0ZVNvdXJjZUNvbnRyb2wodGhpcy5oYW5kbGUsIHsgaGFzU2Vjb25kYXJ5UXVpY2tEaWZmUHJvdmlkZXI6ICEhc2Vjb25kYXJ5UXVpY2tEaWZmUHJvdmlkZXIsIHNlY29uZGFyeVF1aWNrRGlmZkxhYmVsIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGlzdG9yeVByb3ZpZGVyOiB2c2NvZGUuU291cmNlQ29udHJvbEhpc3RvcnlQcm92aWRlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfaGlzdG9yeVByb3ZpZGVyRGlzcG9zYWJsZSA9IG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCk7XG5cblx0Z2V0IGhpc3RvcnlQcm92aWRlcigpOiB2c2NvZGUuU291cmNlQ29udHJvbEhpc3RvcnlQcm92aWRlciB8IHVuZGVmaW5lZCB7XG5cdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhpcy5fZXh0ZW5zaW9uLCAnc2NtSGlzdG9yeVByb3ZpZGVyJyk7XG5cdFx0cmV0dXJuIHRoaXMuX2hpc3RvcnlQcm92aWRlcjtcblx0fVxuXG5cdHNldCBoaXN0b3J5UHJvdmlkZXIoaGlzdG9yeVByb3ZpZGVyOiB2c2NvZGUuU291cmNlQ29udHJvbEhpc3RvcnlQcm92aWRlciB8IHVuZGVmaW5lZCkge1xuXHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoaXMuX2V4dGVuc2lvbiwgJ3NjbUhpc3RvcnlQcm92aWRlcicpO1xuXG5cdFx0dGhpcy5faGlzdG9yeVByb3ZpZGVyID0gaGlzdG9yeVByb3ZpZGVyO1xuXHRcdHRoaXMuX2hpc3RvcnlQcm92aWRlckRpc3Bvc2FibGUudmFsdWUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHR0aGlzLiNwcm94eS4kdXBkYXRlU291cmNlQ29udHJvbCh0aGlzLmhhbmRsZSwgeyBoYXNIaXN0b3J5UHJvdmlkZXI6ICEhaGlzdG9yeVByb3ZpZGVyIH0pO1xuXG5cdFx0aWYgKGhpc3RvcnlQcm92aWRlcikge1xuXHRcdFx0dGhpcy5faGlzdG9yeVByb3ZpZGVyRGlzcG9zYWJsZS52YWx1ZS5hZGQoaGlzdG9yeVByb3ZpZGVyLm9uRGlkQ2hhbmdlQ3VycmVudEhpc3RvcnlJdGVtUmVmcygoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVmID0gdG9TQ01IaXN0b3J5SXRlbVJlZkR0byhoaXN0b3J5UHJvdmlkZXI/LmN1cnJlbnRIaXN0b3J5SXRlbVJlZik7XG5cdFx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVtb3RlUmVmID0gdG9TQ01IaXN0b3J5SXRlbVJlZkR0byhoaXN0b3J5UHJvdmlkZXI/LmN1cnJlbnRIaXN0b3J5SXRlbVJlbW90ZVJlZik7XG5cdFx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtQmFzZVJlZiA9IHRvU0NNSGlzdG9yeUl0ZW1SZWZEdG8oaGlzdG9yeVByb3ZpZGVyPy5jdXJyZW50SGlzdG9yeUl0ZW1CYXNlUmVmKTtcblxuXHRcdFx0XHR0aGlzLiNwcm94eS4kb25EaWRDaGFuZ2VIaXN0b3J5UHJvdmlkZXJDdXJyZW50SGlzdG9yeUl0ZW1SZWZzKHRoaXMuaGFuZGxlLCBoaXN0b3J5SXRlbVJlZiwgaGlzdG9yeUl0ZW1SZW1vdGVSZWYsIGhpc3RvcnlJdGVtQmFzZVJlZik7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9oaXN0b3J5UHJvdmlkZXJEaXNwb3NhYmxlLnZhbHVlLmFkZChoaXN0b3J5UHJvdmlkZXIub25EaWRDaGFuZ2VIaXN0b3J5SXRlbVJlZnMoKGUpID0+IHtcblx0XHRcdFx0aWYgKGUuYWRkZWQubGVuZ3RoID09PSAwICYmIGUubW9kaWZpZWQubGVuZ3RoID09PSAwICYmIGUucmVtb3ZlZC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBhZGRlZCA9IGUuYWRkZWQubWFwKHJlZiA9PiAoeyAuLi5yZWYsIGljb246IGdldEhpc3RvcnlJdGVtSWNvbkR0byhyZWYuaWNvbikgfSkpO1xuXHRcdFx0XHRjb25zdCBtb2RpZmllZCA9IGUubW9kaWZpZWQubWFwKHJlZiA9PiAoeyAuLi5yZWYsIGljb246IGdldEhpc3RvcnlJdGVtSWNvbkR0byhyZWYuaWNvbikgfSkpO1xuXHRcdFx0XHRjb25zdCByZW1vdmVkID0gZS5yZW1vdmVkLm1hcChyZWYgPT4gKHsgLi4ucmVmLCBpY29uOiBnZXRIaXN0b3J5SXRlbUljb25EdG8ocmVmLmljb24pIH0pKTtcblxuXHRcdFx0XHR0aGlzLiNwcm94eS4kb25EaWRDaGFuZ2VIaXN0b3J5UHJvdmlkZXJIaXN0b3J5SXRlbVJlZnModGhpcy5oYW5kbGUsIHsgYWRkZWQsIG1vZGlmaWVkLCByZW1vdmVkLCBzaWxlbnQ6IGUuc2lsZW50IH0pO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FydGlmYWN0UHJvdmlkZXI6IHZzY29kZS5Tb3VyY2VDb250cm9sQXJ0aWZhY3RQcm92aWRlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfYXJ0aWZhY3RQcm92aWRlckRpc3Bvc2FibGUgPSBuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpO1xuXG5cdGdldCBhcnRpZmFjdFByb3ZpZGVyKCk6IHZzY29kZS5Tb3VyY2VDb250cm9sQXJ0aWZhY3RQcm92aWRlciB8IHVuZGVmaW5lZCB7XG5cdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhpcy5fZXh0ZW5zaW9uLCAnc2NtQXJ0aWZhY3RQcm92aWRlcicpO1xuXHRcdHJldHVybiB0aGlzLl9hcnRpZmFjdFByb3ZpZGVyO1xuXHR9XG5cblx0c2V0IGFydGlmYWN0UHJvdmlkZXIoYXJ0aWZhY3RQcm92aWRlcjogdnNjb2RlLlNvdXJjZUNvbnRyb2xBcnRpZmFjdFByb3ZpZGVyIHwgdW5kZWZpbmVkKSB7XG5cdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhpcy5fZXh0ZW5zaW9uLCAnc2NtQXJ0aWZhY3RQcm92aWRlcicpO1xuXG5cdFx0dGhpcy5fYXJ0aWZhY3RQcm92aWRlciA9IGFydGlmYWN0UHJvdmlkZXI7XG5cdFx0dGhpcy5fYXJ0aWZhY3RQcm92aWRlckRpc3Bvc2FibGUudmFsdWUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHR0aGlzLiNwcm94eS4kdXBkYXRlU291cmNlQ29udHJvbCh0aGlzLmhhbmRsZSwgeyBoYXNBcnRpZmFjdFByb3ZpZGVyOiAhIWFydGlmYWN0UHJvdmlkZXIgfSk7XG5cblx0XHRpZiAoYXJ0aWZhY3RQcm92aWRlcikge1xuXHRcdFx0dGhpcy5fYXJ0aWZhY3RQcm92aWRlckRpc3Bvc2FibGUudmFsdWUuYWRkKGFydGlmYWN0UHJvdmlkZXIub25EaWRDaGFuZ2VBcnRpZmFjdHMoKGdyb3Vwczogc3RyaW5nW10pID0+IHtcblx0XHRcdFx0aWYgKGdyb3Vwcy5sZW5ndGggIT09IDApIHtcblx0XHRcdFx0XHR0aGlzLiNwcm94eS4kb25EaWRDaGFuZ2VBcnRpZmFjdHModGhpcy5oYW5kbGUsIGdyb3Vwcyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jb21taXRUZW1wbGF0ZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGdldCBjb21taXRUZW1wbGF0ZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jb21taXRUZW1wbGF0ZTtcblx0fVxuXG5cdHNldCBjb21taXRUZW1wbGF0ZShjb21taXRUZW1wbGF0ZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKGNvbW1pdFRlbXBsYXRlID09PSB0aGlzLl9jb21taXRUZW1wbGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NvbW1pdFRlbXBsYXRlID0gY29tbWl0VGVtcGxhdGU7XG5cdFx0dGhpcy4jcHJveHkuJHVwZGF0ZVNvdXJjZUNvbnRyb2wodGhpcy5oYW5kbGUsIHsgY29tbWl0VGVtcGxhdGUgfSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hY2NlcHRJbnB1dERpc3Bvc2FibGVzID0gbmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKTtcblx0cHJpdmF0ZSBfYWNjZXB0SW5wdXRDb21tYW5kOiB2c2NvZGUuQ29tbWFuZCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRnZXQgYWNjZXB0SW5wdXRDb21tYW5kKCk6IHZzY29kZS5Db21tYW5kIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fYWNjZXB0SW5wdXRDb21tYW5kO1xuXHR9XG5cblx0c2V0IGFjY2VwdElucHV0Q29tbWFuZChhY2NlcHRJbnB1dENvbW1hbmQ6IHZzY29kZS5Db21tYW5kIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fYWNjZXB0SW5wdXREaXNwb3NhYmxlcy52YWx1ZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdHRoaXMuX2FjY2VwdElucHV0Q29tbWFuZCA9IGFjY2VwdElucHV0Q29tbWFuZDtcblxuXHRcdGNvbnN0IGludGVybmFsID0gdGhpcy5fY29tbWFuZHMuY29udmVydGVyLnRvSW50ZXJuYWwoYWNjZXB0SW5wdXRDb21tYW5kLCB0aGlzLl9hY2NlcHRJbnB1dERpc3Bvc2FibGVzLnZhbHVlKTtcblx0XHR0aGlzLiNwcm94eS4kdXBkYXRlU291cmNlQ29udHJvbCh0aGlzLmhhbmRsZSwgeyBhY2NlcHRJbnB1dENvbW1hbmQ6IGludGVybmFsIH0pO1xuXHR9XG5cblx0Ly8gV2Uga25vdyB3aGF0IHdlJ3JlIGRvaW5nIGhlcmU6XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLXBvdGVudGlhbGx5LXVuc2FmZS1kaXNwb3NhYmxlc1xuXHRwcml2YXRlIF9hY3Rpb25CdXR0b25EaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSBfYWN0aW9uQnV0dG9uOiB2c2NvZGUuU291cmNlQ29udHJvbEFjdGlvbkJ1dHRvbiB8IHVuZGVmaW5lZDtcblx0Z2V0IGFjdGlvbkJ1dHRvbigpOiB2c2NvZGUuU291cmNlQ29udHJvbEFjdGlvbkJ1dHRvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhpcy5fZXh0ZW5zaW9uLCAnc2NtQWN0aW9uQnV0dG9uJyk7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGlvbkJ1dHRvbjtcblx0fVxuXG5cdHNldCBhY3Rpb25CdXR0b24oYWN0aW9uQnV0dG9uOiB2c2NvZGUuU291cmNlQ29udHJvbEFjdGlvbkJ1dHRvbiB8IHVuZGVmaW5lZCkge1xuXHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoaXMuX2V4dGVuc2lvbiwgJ3NjbUFjdGlvbkJ1dHRvbicpO1xuXG5cdFx0Ly8gV2UgaGF2ZSB0byBkbyB0aGlzIGNoZWNrIGJlZm9yZSBjb252ZXJ0aW5nIHRoZSBjb21tYW5kIHRvIGl0J3MgaW50ZXJuYWxcblx0XHQvLyByZXByZXNlbnRhdGlvbiBzaW5jZSB0aGF0IHdvdWxkIGFsd2F5cyBjcmVhdGUgYSBjb21tYW5kIHdpdGggYSB1bmlxdWVcblx0XHQvLyBpZGVudGlmaWVyXG5cdFx0aWYgKHN0cnVjdHVyYWxFcXVhbHModGhpcy5fYWN0aW9uQnV0dG9uLCBhY3Rpb25CdXR0b24pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSW4gb3JkZXIgdG8gcHJldmVudCBkaXNwb3NpbmcgdGhlIGFjdGlvbiBidXR0b24gY29tbWFuZCB0aGF0IGFyZSBzdGlsbCByZW5kZXJlZCBpbiB0aGUgVUlcblx0XHQvLyB1bnRpbCB0aGUgbmV4dCBVSSB1cGRhdGUsIHdlIGVuc3VyZSB0byBkaXNwb3NlIHRoZW0gYWZ0ZXIgdGhlIHVwZGF0ZSBoYXMgYmVlbiBjb21wbGV0ZWQuXG5cdFx0Y29uc3Qgb2xkQWN0aW9uQnV0dG9uRGlzcG9zYWJsZXMgPSB0aGlzLl9hY3Rpb25CdXR0b25EaXNwb3NhYmxlcztcblx0XHR0aGlzLl9hY3Rpb25CdXR0b25EaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdHRoaXMuX2FjdGlvbkJ1dHRvbiA9IGFjdGlvbkJ1dHRvbjtcblxuXHRcdGNvbnN0IGFjdGlvbkJ1dHRvbkR0byA9IGFjdGlvbkJ1dHRvbiAhPT0gdW5kZWZpbmVkID9cblx0XHRcdHtcblx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdC4uLnRoaXMuX2NvbW1hbmRzLmNvbnZlcnRlci50b0ludGVybmFsKGFjdGlvbkJ1dHRvbi5jb21tYW5kLCB0aGlzLl9hY3Rpb25CdXR0b25EaXNwb3NhYmxlcyksXG5cdFx0XHRcdFx0c2hvcnRUaXRsZTogYWN0aW9uQnV0dG9uLmNvbW1hbmQuc2hvcnRUaXRsZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRzZWNvbmRhcnlDb21tYW5kczogYWN0aW9uQnV0dG9uLnNlY29uZGFyeUNvbW1hbmRzPy5tYXAoY29tbWFuZEdyb3VwID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gY29tbWFuZEdyb3VwLm1hcChjb21tYW5kID0+IHRoaXMuX2NvbW1hbmRzLmNvbnZlcnRlci50b0ludGVybmFsKGNvbW1hbmQsIHRoaXMuX2FjdGlvbkJ1dHRvbkRpc3Bvc2FibGVzKSk7XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRlbmFibGVkOiBhY3Rpb25CdXR0b24uZW5hYmxlZFxuXHRcdFx0fSBzYXRpc2ZpZXMgU0NNQWN0aW9uQnV0dG9uRHRvIDogbnVsbDtcblxuXHRcdHRoaXMuI3Byb3h5LiR1cGRhdGVTb3VyY2VDb250cm9sKHRoaXMuaGFuZGxlLCB7IGFjdGlvbkJ1dHRvbjogYWN0aW9uQnV0dG9uRHRvIH0pXG5cdFx0XHQuZmluYWxseSgoKSA9PiBvbGRBY3Rpb25CdXR0b25EaXNwb3NhYmxlcy5kaXNwb3NlKCkpO1xuXHR9XG5cblx0Ly8gV2Uga25vdyB3aGF0IHdlJ3JlIGRvaW5nIGhlcmU6XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLXBvdGVudGlhbGx5LXVuc2FmZS1kaXNwb3NhYmxlc1xuXHRwcml2YXRlIF9zdGF0dXNCYXJEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSBfc3RhdHVzQmFyQ29tbWFuZHM6IHZzY29kZS5Db21tYW5kW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0Z2V0IHN0YXR1c0JhckNvbW1hbmRzKCk6IHZzY29kZS5Db21tYW5kW10gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zdGF0dXNCYXJDb21tYW5kcztcblx0fVxuXG5cdHNldCBzdGF0dXNCYXJDb21tYW5kcyhzdGF0dXNCYXJDb21tYW5kczogdnNjb2RlLkNvbW1hbmRbXSB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLl9zdGF0dXNCYXJDb21tYW5kcyAmJiBzdGF0dXNCYXJDb21tYW5kcyAmJiBjb21tYW5kTGlzdEVxdWFscyh0aGlzLl9zdGF0dXNCYXJDb21tYW5kcywgc3RhdHVzQmFyQ29tbWFuZHMpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSW4gb3JkZXIgdG8gcHJldmVudCBkaXNwb3Npbmcgc3RhdHVzIGJhciBjb21tYW5kcyB0aGF0IGFyZSBzdGlsbCByZW5kZXJlZCBpbiB0aGUgVUlcblx0XHQvLyB1bnRpbCB0aGUgbmV4dCBVSSB1cGRhdGUsIHdlIGVuc3VyZSB0byBkaXNwb3NlIHRoZW0gYWZ0ZXIgdGhlIHVwZGF0ZSBoYXMgYmVlbiBjb21wbGV0ZWQuXG5cdFx0Y29uc3Qgb2xkU3RhdHVzQmFyRGlzcG9zYWJsZXMgPSB0aGlzLl9zdGF0dXNCYXJEaXNwb3NhYmxlcztcblx0XHR0aGlzLl9zdGF0dXNCYXJEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdHRoaXMuX3N0YXR1c0JhckNvbW1hbmRzID0gc3RhdHVzQmFyQ29tbWFuZHM7XG5cblx0XHRjb25zdCBpbnRlcm5hbCA9IChzdGF0dXNCYXJDb21tYW5kcyB8fCBbXSkubWFwKGMgPT4gdGhpcy5fY29tbWFuZHMuY29udmVydGVyLnRvSW50ZXJuYWwoYywgdGhpcy5fc3RhdHVzQmFyRGlzcG9zYWJsZXMpKSBhcyBJQ29tbWFuZER0b1tdO1xuXG5cdFx0dGhpcy4jcHJveHkuJHVwZGF0ZVNvdXJjZUNvbnRyb2wodGhpcy5oYW5kbGUsIHsgc3RhdHVzQmFyQ29tbWFuZHM6IGludGVybmFsIH0pXG5cdFx0XHQuZmluYWxseSgoKSA9PiBvbGRTdGF0dXNCYXJEaXNwb3NhYmxlcy5kaXNwb3NlKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VsZWN0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRnZXQgc2VsZWN0ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbGVjdGVkO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTZWxlY3Rpb24gPSBuZXcgRW1pdHRlcjxib29sZWFuPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlbGVjdGlvbiA9IHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FydGlmYWN0Q29tbWFuZHNEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZyAvKiBhcnRpZmFjdCBncm91cCAqLywgRGlzcG9zYWJsZVN0b3JlPigpO1xuXG5cdHJlYWRvbmx5IGhhbmRsZTogbnVtYmVyID0gRXh0SG9zdFNvdXJjZUNvbnRyb2wuX2hhbmRsZVBvb2wrKztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRfZXh0SG9zdERvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcm94eTogTWFpblRocmVhZFNDTVNoYXBlLFxuXHRcdHByaXZhdGUgX2NvbW1hbmRzOiBFeHRIb3N0Q29tbWFuZHMsXG5cdFx0cHJpdmF0ZSBfaWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIF9sYWJlbDogc3RyaW5nLFxuXHRcdHByaXZhdGUgX3Jvb3RVcmk/OiB2c2NvZGUuVXJpLFxuXHRcdF9pY29uUGF0aD86IHZzY29kZS5JY29uUGF0aCxcblx0XHRfaXNIaWRkZW4/OiBib29sZWFuLFxuXHRcdF9wYXJlbnQ/OiBFeHRIb3N0U291cmNlQ29udHJvbFxuXHQpIHtcblx0XHR0aGlzLiNwcm94eSA9IHByb3h5O1xuXG5cdFx0Y29uc3QgaW5wdXRCb3hEb2N1bWVudFVyaSA9IFVSSS5mcm9tKHtcblx0XHRcdHNjaGVtZTogU2NoZW1hcy52c2NvZGVTb3VyY2VDb250cm9sLFxuXHRcdFx0cGF0aDogYCR7X2lkfS9zY20ke3RoaXMuaGFuZGxlfS9pbnB1dGAsXG5cdFx0XHRxdWVyeTogX3Jvb3RVcmkgPyBgcm9vdFVyaT0ke2VuY29kZVVSSUNvbXBvbmVudChfcm9vdFVyaS50b1N0cmluZygpKX1gIDogdW5kZWZpbmVkXG5cdFx0fSk7XG5cblx0XHR0aGlzLl9pbnB1dEJveCA9IG5ldyBFeHRIb3N0U0NNSW5wdXRCb3goX2V4dGVuc2lvbiwgX2V4dEhvc3REb2N1bWVudHMsIHRoaXMuI3Byb3h5LCB0aGlzLmhhbmRsZSwgaW5wdXRCb3hEb2N1bWVudFVyaSk7XG5cdFx0dGhpcy4jcHJveHkuJHJlZ2lzdGVyU291cmNlQ29udHJvbCh0aGlzLmhhbmRsZSwgX3BhcmVudD8uaGFuZGxlLCBfaWQsIF9sYWJlbCwgX3Jvb3RVcmksIGdldEhpc3RvcnlJdGVtSWNvbkR0byhfaWNvblBhdGgpLCBfaXNIaWRkZW4sIGlucHV0Qm94RG9jdW1lbnRVcmkpO1xuXG5cdFx0dGhpcy5vbkRpZERpc3Bvc2VQYXJlbnQgPSBfcGFyZW50ID8gX3BhcmVudC5vbkRpZERpc3Bvc2UgOiBFdmVudC5Ob25lO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVkUmVzb3VyY2VHcm91cHMgPSBuZXcgTWFwPEV4dEhvc3RTb3VyY2VDb250cm9sUmVzb3VyY2VHcm91cCwgSURpc3Bvc2FibGU+KCk7XG5cdHByaXZhdGUgdXBkYXRlZFJlc291cmNlR3JvdXBzID0gbmV3IFNldDxFeHRIb3N0U291cmNlQ29udHJvbFJlc291cmNlR3JvdXA+KCk7XG5cblx0Y3JlYXRlUmVzb3VyY2VHcm91cChpZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCBvcHRpb25zPzogeyBtdWx0aURpZmZFZGl0b3JFbmFibGVWaWV3Q2hhbmdlcz86IGJvb2xlYW4gfSk6IEV4dEhvc3RTb3VyY2VDb250cm9sUmVzb3VyY2VHcm91cCB7XG5cdFx0Y29uc3QgbXVsdGlEaWZmRWRpdG9yRW5hYmxlVmlld0NoYW5nZXMgPSBpc1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLl9leHRlbnNpb24sICdzY21NdWx0aURpZmZFZGl0b3InKSAmJiBvcHRpb25zPy5tdWx0aURpZmZFZGl0b3JFbmFibGVWaWV3Q2hhbmdlcyA9PT0gdHJ1ZTtcblx0XHRjb25zdCBncm91cCA9IG5ldyBFeHRIb3N0U291cmNlQ29udHJvbFJlc291cmNlR3JvdXAodGhpcy4jcHJveHksIHRoaXMuX2NvbW1hbmRzLCB0aGlzLmhhbmRsZSwgaWQsIGxhYmVsLCBtdWx0aURpZmZFZGl0b3JFbmFibGVWaWV3Q2hhbmdlcywgdGhpcy5fZXh0ZW5zaW9uKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gRXZlbnQub25jZShncm91cC5vbkRpZERpc3Bvc2UpKCgpID0+IHRoaXMuY3JlYXRlZFJlc291cmNlR3JvdXBzLmRlbGV0ZShncm91cCkpO1xuXHRcdHRoaXMuY3JlYXRlZFJlc291cmNlR3JvdXBzLnNldChncm91cCwgZGlzcG9zYWJsZSk7XG5cdFx0dGhpcy5ldmVudHVhbGx5QWRkUmVzb3VyY2VHcm91cHMoKTtcblx0XHRyZXR1cm4gZ3JvdXA7XG5cdH1cblxuXHRAZGVib3VuY2UoMTAwKVxuXHRldmVudHVhbGx5QWRkUmVzb3VyY2VHcm91cHMoKTogdm9pZCB7XG5cdFx0Y29uc3QgZ3JvdXBzOiBbbnVtYmVyIC8qaGFuZGxlKi8sIHN0cmluZyAvKmlkKi8sIHN0cmluZyAvKmxhYmVsKi8sIFNDTUdyb3VwRmVhdHVyZXMsIC8qbXVsdGlEaWZmRWRpdG9yRW5hYmxlVmlld0NoYW5nZXMqLyBib29sZWFuXVtdID0gW107XG5cdFx0Y29uc3Qgc3BsaWNlczogU0NNUmF3UmVzb3VyY2VTcGxpY2VzW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgW2dyb3VwLCBkaXNwb3NhYmxlXSBvZiB0aGlzLmNyZWF0ZWRSZXNvdXJjZUdyb3Vwcykge1xuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cblx0XHRcdGNvbnN0IHVwZGF0ZUxpc3RlbmVyID0gZ3JvdXAub25EaWRVcGRhdGVSZXNvdXJjZVN0YXRlcygoKSA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlZFJlc291cmNlR3JvdXBzLmFkZChncm91cCk7XG5cdFx0XHRcdHRoaXMuZXZlbnR1YWxseVVwZGF0ZVJlc291cmNlU3RhdGVzKCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0RXZlbnQub25jZShncm91cC5vbkRpZERpc3Bvc2UpKCgpID0+IHtcblx0XHRcdFx0dGhpcy51cGRhdGVkUmVzb3VyY2VHcm91cHMuZGVsZXRlKGdyb3VwKTtcblx0XHRcdFx0dXBkYXRlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9ncm91cHMuZGVsZXRlKGdyb3VwLmhhbmRsZSk7XG5cdFx0XHRcdHRoaXMuI3Byb3h5LiR1bnJlZ2lzdGVyR3JvdXAodGhpcy5oYW5kbGUsIGdyb3VwLmhhbmRsZSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Z3JvdXBzLnB1c2goW2dyb3VwLmhhbmRsZSwgZ3JvdXAuaWQsIGdyb3VwLmxhYmVsLCBncm91cC5mZWF0dXJlcywgZ3JvdXAubXVsdGlEaWZmRWRpdG9yRW5hYmxlVmlld0NoYW5nZXNdKTtcblxuXHRcdFx0Y29uc3Qgc25hcHNob3QgPSBncm91cC5fdGFrZVJlc291cmNlU3RhdGVTbmFwc2hvdCgpO1xuXG5cdFx0XHRpZiAoc25hcHNob3QubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRzcGxpY2VzLnB1c2goW2dyb3VwLmhhbmRsZSwgc25hcHNob3RdKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fZ3JvdXBzLnNldChncm91cC5oYW5kbGUsIGdyb3VwKTtcblx0XHR9XG5cblx0XHR0aGlzLiNwcm94eS4kcmVnaXN0ZXJHcm91cHModGhpcy5oYW5kbGUsIGdyb3Vwcywgc3BsaWNlcyk7XG5cdFx0dGhpcy5jcmVhdGVkUmVzb3VyY2VHcm91cHMuY2xlYXIoKTtcblx0fVxuXG5cdEBkZWJvdW5jZSgxMDApXG5cdGV2ZW50dWFsbHlVcGRhdGVSZXNvdXJjZVN0YXRlcygpOiB2b2lkIHtcblx0XHRjb25zdCBzcGxpY2VzOiBTQ01SYXdSZXNvdXJjZVNwbGljZXNbXSA9IFtdO1xuXG5cdFx0dGhpcy51cGRhdGVkUmVzb3VyY2VHcm91cHMuZm9yRWFjaChncm91cCA9PiB7XG5cdFx0XHRjb25zdCBzbmFwc2hvdCA9IGdyb3VwLl90YWtlUmVzb3VyY2VTdGF0ZVNuYXBzaG90KCk7XG5cblx0XHRcdGlmIChzbmFwc2hvdC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRzcGxpY2VzLnB1c2goW2dyb3VwLmhhbmRsZSwgc25hcHNob3RdKTtcblx0XHR9KTtcblxuXHRcdGlmIChzcGxpY2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuI3Byb3h5LiRzcGxpY2VSZXNvdXJjZVN0YXRlcyh0aGlzLmhhbmRsZSwgc3BsaWNlcyk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVkUmVzb3VyY2VHcm91cHMuY2xlYXIoKTtcblx0fVxuXG5cdGdldFJlc291cmNlR3JvdXAoaGFuZGxlOiBHcm91cEhhbmRsZSk6IEV4dEhvc3RTb3VyY2VDb250cm9sUmVzb3VyY2VHcm91cCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2dyb3Vwcy5nZXQoaGFuZGxlKTtcblx0fVxuXG5cdHNldFNlbGVjdGlvblN0YXRlKHNlbGVjdGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VsZWN0ZWQgPSBzZWxlY3RlZDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5maXJlKHNlbGVjdGVkKTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVBcnRpZmFjdHMoZ3JvdXA6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxTQ01BcnRpZmFjdER0b1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY29tbWFuZHNEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBhcnRpZmFjdHMgPSBhd2FpdCB0aGlzLmFydGlmYWN0UHJvdmlkZXI/LnByb3ZpZGVBcnRpZmFjdHMoZ3JvdXAsIHRva2VuKTtcblx0XHRjb25zdCBhcnRpZmFjdHNEdG8gPSBhcnRpZmFjdHM/Lm1hcChhcnRpZmFjdCA9PiAoe1xuXHRcdFx0Li4uYXJ0aWZhY3QsXG5cdFx0XHRpY29uOiBnZXRIaXN0b3J5SXRlbUljb25EdG8oYXJ0aWZhY3QuaWNvbiksXG5cdFx0XHRjb21tYW5kOiBhcnRpZmFjdC5jb21tYW5kID8gdGhpcy5fY29tbWFuZHMuY29udmVydGVyLnRvSW50ZXJuYWwoYXJ0aWZhY3QuY29tbWFuZCwgY29tbWFuZHNEaXNwb3NhYmxlcykgOiB1bmRlZmluZWRcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9hcnRpZmFjdENvbW1hbmRzRGlzcG9zYWJsZXMuZ2V0KGdyb3VwKT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2FydGlmYWN0Q29tbWFuZHNEaXNwb3NhYmxlcy5zZXQoZ3JvdXAsIGNvbW1hbmRzRGlzcG9zYWJsZXMpO1xuXG5cdFx0cmV0dXJuIGFydGlmYWN0c0R0bztcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fYWNjZXB0SW5wdXREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fYWN0aW9uQnV0dG9uRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3N0YXR1c0JhckRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9oaXN0b3J5UHJvdmlkZXJEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9hcnRpZmFjdFByb3ZpZGVyRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fYXJ0aWZhY3RDb21tYW5kc0Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMuX2dyb3Vwcy5mb3JFYWNoKGdyb3VwID0+IGdyb3VwLmRpc3Bvc2UoKSk7XG5cdFx0dGhpcy4jcHJveHkuJHVucmVnaXN0ZXJTb3VyY2VDb250cm9sKHRoaXMuaGFuZGxlKTtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZERpc3Bvc2UuZmlyZSgpO1xuXHRcdHRoaXMuX29uRGlkRGlzcG9zZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RTQ00gaW1wbGVtZW50cyBFeHRIb3N0U0NNU2hhcGUge1xuXG5cdHByaXZhdGUgX3Byb3h5OiBNYWluVGhyZWFkU0NNU2hhcGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeTogTWFpblRocmVhZFRlbGVtZXRyeVNoYXBlO1xuXHRwcml2YXRlIF9zb3VyY2VDb250cm9sczogTWFwPFByb3ZpZGVySGFuZGxlLCBFeHRIb3N0U291cmNlQ29udHJvbD4gPSBuZXcgTWFwPFByb3ZpZGVySGFuZGxlLCBFeHRIb3N0U291cmNlQ29udHJvbD4oKTtcblx0cHJpdmF0ZSBfc291cmNlQ29udHJvbHNCeUV4dGVuc2lvbjogRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxFeHRIb3N0U291cmNlQ29udHJvbFtdPiA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyTWFwPEV4dEhvc3RTb3VyY2VDb250cm9sW10+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBY3RpdmVQcm92aWRlciA9IG5ldyBFbWl0dGVyPHZzY29kZS5Tb3VyY2VDb250cm9sPigpO1xuXHRnZXQgb25EaWRDaGFuZ2VBY3RpdmVQcm92aWRlcigpOiBFdmVudDx2c2NvZGUuU291cmNlQ29udHJvbD4geyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVQcm92aWRlci5ldmVudDsgfVxuXG5cdHByaXZhdGUgX3NlbGVjdGVkU291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1haW5Db250ZXh0OiBJTWFpbkNvbnRleHQsXG5cdFx0cHJpdmF0ZSBfY29tbWFuZHM6IEV4dEhvc3RDb21tYW5kcyxcblx0XHRwcml2YXRlIF9leHRIb3N0RG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX3Byb3h5ID0gbWFpbkNvbnRleHQuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZFNDTSk7XG5cdFx0dGhpcy5fdGVsZW1ldHJ5ID0gbWFpbkNvbnRleHQuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZFRlbGVtZXRyeSk7XG5cblx0XHRfY29tbWFuZHMucmVnaXN0ZXJBcmd1bWVudFByb2Nlc3Nvcih7XG5cdFx0XHRwcm9jZXNzQXJndW1lbnQ6IGFyZyA9PiB7XG5cdFx0XHRcdGlmIChhcmcgJiYgYXJnLiRtaWQgPT09IE1hcnNoYWxsZWRJZC5TY21SZXNvdXJjZSkge1xuXHRcdFx0XHRcdGNvbnN0IHNvdXJjZUNvbnRyb2wgPSB0aGlzLl9zb3VyY2VDb250cm9scy5nZXQoYXJnLnNvdXJjZUNvbnRyb2xIYW5kbGUpO1xuXG5cdFx0XHRcdFx0aWYgKCFzb3VyY2VDb250cm9sKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYXJnO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGdyb3VwID0gc291cmNlQ29udHJvbC5nZXRSZXNvdXJjZUdyb3VwKGFyZy5ncm91cEhhbmRsZSk7XG5cblx0XHRcdFx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYXJnO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBncm91cC5nZXRSZXNvdXJjZVN0YXRlKGFyZy5oYW5kbGUpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGFyZyAmJiBhcmcuJG1pZCA9PT0gTWFyc2hhbGxlZElkLlNjbVJlc291cmNlR3JvdXApIHtcblx0XHRcdFx0XHRjb25zdCBzb3VyY2VDb250cm9sID0gdGhpcy5fc291cmNlQ29udHJvbHMuZ2V0KGFyZy5zb3VyY2VDb250cm9sSGFuZGxlKTtcblxuXHRcdFx0XHRcdGlmICghc291cmNlQ29udHJvbCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGFyZztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gc291cmNlQ29udHJvbC5nZXRSZXNvdXJjZUdyb3VwKGFyZy5ncm91cEhhbmRsZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoYXJnICYmIGFyZy4kbWlkID09PSBNYXJzaGFsbGVkSWQuU2NtUHJvdmlkZXIpIHtcblx0XHRcdFx0XHRjb25zdCBzb3VyY2VDb250cm9sID0gdGhpcy5fc291cmNlQ29udHJvbHMuZ2V0KGFyZy5oYW5kbGUpO1xuXG5cdFx0XHRcdFx0aWYgKCFzb3VyY2VDb250cm9sKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYXJnO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBzb3VyY2VDb250cm9sO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGFyZztcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGNyZWF0ZVNvdXJjZUNvbnRyb2woZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGlkOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIHJvb3RVcmk6IHZzY29kZS5VcmkgfCB1bmRlZmluZWQsIGljb25QYXRoOiB2c2NvZGUuSWNvblBhdGggfCB1bmRlZmluZWQsIGlzSGlkZGVuOiBib29sZWFuIHwgdW5kZWZpbmVkLCBwYXJlbnQ6IHZzY29kZS5Tb3VyY2VDb250cm9sIHwgdW5kZWZpbmVkKTogdnNjb2RlLlNvdXJjZUNvbnRyb2wge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRXh0SG9zdFNDTSNjcmVhdGVTb3VyY2VDb250cm9sJywgZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUsIGlkLCBsYWJlbCwgcm9vdFVyaSk7XG5cblx0XHR0eXBlIFRFdmVudCA9IHsgZXh0ZW5zaW9uSWQ6IHN0cmluZyB9O1xuXHRcdHR5cGUgVE1ldGEgPSB7XG5cdFx0XHRvd25lcjogJ2pvYW9tb3Jlbm8nO1xuXHRcdFx0ZXh0ZW5zaW9uSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgSUQgb2YgdGhlIGV4dGVuc2lvbiBjb250cmlidXRpbmcgdG8gdGhlIFNvdXJjZSBDb250cm9sIEFQSS4nIH07XG5cdFx0XHRjb21tZW50OiAnVGhpcyBpcyB1c2VkIHRvIGtub3cgd2hhdCBleHRlbnNpb25zIGNvbnRyaWJ1dGUgdG8gdGhlIFNvdXJjZSBDb250cm9sIEFQSS4nO1xuXHRcdH07XG5cdFx0dGhpcy5fdGVsZW1ldHJ5LiRwdWJsaWNMb2cyPFRFdmVudCwgVE1ldGE+KCdhcGkvc2NtL2NyZWF0ZVNvdXJjZUNvbnRyb2wnLCB7XG5cdFx0XHRleHRlbnNpb25JZDogZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBwYXJlbnRTb3VyY2VDb250cm9sID0gcGFyZW50ID8gSXRlcmFibGUuZmluZCh0aGlzLl9zb3VyY2VDb250cm9scy52YWx1ZXMoKSwgcyA9PiBzID09PSBwYXJlbnQpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHNvdXJjZUNvbnRyb2wgPSBuZXcgRXh0SG9zdFNvdXJjZUNvbnRyb2woZXh0ZW5zaW9uLCB0aGlzLl9leHRIb3N0RG9jdW1lbnRzLCB0aGlzLl9wcm94eSwgdGhpcy5fY29tbWFuZHMsIGlkLCBsYWJlbCwgcm9vdFVyaSwgaWNvblBhdGgsIGlzSGlkZGVuLCBwYXJlbnRTb3VyY2VDb250cm9sKTtcblx0XHR0aGlzLl9zb3VyY2VDb250cm9scy5zZXQoc291cmNlQ29udHJvbC5oYW5kbGUsIHNvdXJjZUNvbnRyb2wpO1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udHJvbHMgPSB0aGlzLl9zb3VyY2VDb250cm9sc0J5RXh0ZW5zaW9uLmdldChleHRlbnNpb24uaWRlbnRpZmllcikgfHwgW107XG5cdFx0c291cmNlQ29udHJvbHMucHVzaChzb3VyY2VDb250cm9sKTtcblx0XHR0aGlzLl9zb3VyY2VDb250cm9sc0J5RXh0ZW5zaW9uLnNldChleHRlbnNpb24uaWRlbnRpZmllciwgc291cmNlQ29udHJvbHMpO1xuXG5cdFx0RXZlbnQub25jZShzb3VyY2VDb250cm9sLm9uRGlkRGlzcG9zZSkoKCkgPT4ge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdFeHRIb3N0U0NNI2Rpc3Bvc2VTb3VyY2VDb250cm9sJywgZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUsIGlkLCBsYWJlbCwgcm9vdFVyaSk7XG5cblx0XHRcdHRoaXMuX3NvdXJjZUNvbnRyb2xzLmRlbGV0ZShzb3VyY2VDb250cm9sLmhhbmRsZSk7XG5cblx0XHRcdGNvbnN0IHNvdXJjZUNvbnRyb2xzID0gdGhpcy5fc291cmNlQ29udHJvbHNCeUV4dGVuc2lvbi5nZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXHRcdFx0aWYgKHNvdXJjZUNvbnRyb2xzKSB7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gc291cmNlQ29udHJvbHMuaW5kZXhPZihzb3VyY2VDb250cm9sKTtcblx0XHRcdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRcdHNvdXJjZUNvbnRyb2xzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoc291cmNlQ29udHJvbHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fc291cmNlQ29udHJvbHNCeUV4dGVuc2lvbi5kZWxldGUoZXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gc291cmNlQ29udHJvbDtcblx0fVxuXG5cdC8vIERlcHJlY2F0ZWRcblx0Z2V0TGFzdElucHV0Qm94KGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogRXh0SG9zdFNDTUlucHV0Qm94IHwgdW5kZWZpbmVkIHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0V4dEhvc3RTQ00jZ2V0TGFzdElucHV0Qm94JywgZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUpO1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udHJvbHMgPSB0aGlzLl9zb3VyY2VDb250cm9sc0J5RXh0ZW5zaW9uLmdldChleHRlbnNpb24uaWRlbnRpZmllcik7XG5cdFx0Y29uc3Qgc291cmNlQ29udHJvbCA9IHNvdXJjZUNvbnRyb2xzICYmIHNvdXJjZUNvbnRyb2xzW3NvdXJjZUNvbnRyb2xzLmxlbmd0aCAtIDFdO1xuXHRcdHJldHVybiBzb3VyY2VDb250cm9sICYmIHNvdXJjZUNvbnRyb2wuaW5wdXRCb3g7XG5cdH1cblxuXHQkcHJvdmlkZU9yaWdpbmFsUmVzb3VyY2Uoc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLCB1cmlDb21wb25lbnRzOiBVcmlDb21wb25lbnRzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVyaUNvbXBvbmVudHMgfCBudWxsPiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnJldml2ZSh1cmlDb21wb25lbnRzKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0V4dEhvc3RTQ00jJHByb3ZpZGVPcmlnaW5hbFJlc291cmNlJywgc291cmNlQ29udHJvbEhhbmRsZSwgdXJpLnRvU3RyaW5nKCkpO1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udHJvbCA9IHRoaXMuX3NvdXJjZUNvbnRyb2xzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKTtcblxuXHRcdGlmICghc291cmNlQ29udHJvbCB8fCAhc291cmNlQ29udHJvbC5xdWlja0RpZmZQcm92aWRlciB8fCAhc291cmNlQ29udHJvbC5xdWlja0RpZmZQcm92aWRlci5wcm92aWRlT3JpZ2luYWxSZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYXNQcm9taXNlKCgpID0+IHNvdXJjZUNvbnRyb2wucXVpY2tEaWZmUHJvdmlkZXIhLnByb3ZpZGVPcmlnaW5hbFJlc291cmNlISh1cmksIHRva2VuKSlcblx0XHRcdC50aGVuPFVyaUNvbXBvbmVudHMgfCBudWxsPihyID0+IHIgfHwgbnVsbCk7XG5cdH1cblxuXHQkcHJvdmlkZVNlY29uZGFyeU9yaWdpbmFsUmVzb3VyY2Uoc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLCB1cmlDb21wb25lbnRzOiBVcmlDb21wb25lbnRzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVyaUNvbXBvbmVudHMgfCBudWxsPiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnJldml2ZSh1cmlDb21wb25lbnRzKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0V4dEhvc3RTQ00jJHByb3ZpZGVTZWNvbmRhcnlPcmlnaW5hbFJlc291cmNlJywgc291cmNlQ29udHJvbEhhbmRsZSwgdXJpLnRvU3RyaW5nKCkpO1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udHJvbCA9IHRoaXMuX3NvdXJjZUNvbnRyb2xzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKTtcblxuXHRcdGlmICghc291cmNlQ29udHJvbCB8fCAhc291cmNlQ29udHJvbC5zZWNvbmRhcnlRdWlja0RpZmZQcm92aWRlciB8fCAhc291cmNlQ29udHJvbC5zZWNvbmRhcnlRdWlja0RpZmZQcm92aWRlci5wcm92aWRlT3JpZ2luYWxSZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYXNQcm9taXNlKCgpID0+IHNvdXJjZUNvbnRyb2wuc2Vjb25kYXJ5UXVpY2tEaWZmUHJvdmlkZXIhLnByb3ZpZGVPcmlnaW5hbFJlc291cmNlISh1cmksIHRva2VuKSlcblx0XHRcdC50aGVuPFVyaUNvbXBvbmVudHMgfCBudWxsPihyID0+IHIgfHwgbnVsbCk7XG5cdH1cblxuXHQkb25JbnB1dEJveFZhbHVlQ2hhbmdlKHNvdXJjZUNvbnRyb2xIYW5kbGU6IG51bWJlciwgdmFsdWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRXh0SG9zdFNDTSMkb25JbnB1dEJveFZhbHVlQ2hhbmdlJywgc291cmNlQ29udHJvbEhhbmRsZSk7XG5cblx0XHRjb25zdCBzb3VyY2VDb250cm9sID0gdGhpcy5fc291cmNlQ29udHJvbHMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpO1xuXG5cdFx0aWYgKCFzb3VyY2VDb250cm9sKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0c291cmNlQ29udHJvbC5pbnB1dEJveC4kb25JbnB1dEJveFZhbHVlQ2hhbmdlKHZhbHVlKTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHQkZXhlY3V0ZVJlc291cmNlQ29tbWFuZChzb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIsIGdyb3VwSGFuZGxlOiBudW1iZXIsIGhhbmRsZTogbnVtYmVyLCBwcmVzZXJ2ZUZvY3VzOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdFeHRIb3N0U0NNIyRleGVjdXRlUmVzb3VyY2VDb21tYW5kJywgc291cmNlQ29udHJvbEhhbmRsZSwgZ3JvdXBIYW5kbGUsIGhhbmRsZSk7XG5cblx0XHRjb25zdCBzb3VyY2VDb250cm9sID0gdGhpcy5fc291cmNlQ29udHJvbHMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpO1xuXG5cdFx0aWYgKCFzb3VyY2VDb250cm9sKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ3JvdXAgPSBzb3VyY2VDb250cm9sLmdldFJlc291cmNlR3JvdXAoZ3JvdXBIYW5kbGUpO1xuXG5cdFx0aWYgKCFncm91cCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBncm91cC4kZXhlY3V0ZVJlc291cmNlQ29tbWFuZChoYW5kbGUsIHByZXNlcnZlRm9jdXMpO1xuXHR9XG5cblx0JHZhbGlkYXRlSW5wdXQoc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLCB2YWx1ZTogc3RyaW5nLCBjdXJzb3JQb3NpdGlvbjogbnVtYmVyKTogUHJvbWlzZTxbc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nLCBudW1iZXJdIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdFeHRIb3N0U0NNIyR2YWxpZGF0ZUlucHV0Jywgc291cmNlQ29udHJvbEhhbmRsZSk7XG5cblx0XHRjb25zdCBzb3VyY2VDb250cm9sID0gdGhpcy5fc291cmNlQ29udHJvbHMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpO1xuXG5cdFx0aWYgKCFzb3VyY2VDb250cm9sKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFzb3VyY2VDb250cm9sLmlucHV0Qm94LnZhbGlkYXRlSW5wdXQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYXNQcm9taXNlKCgpID0+IHNvdXJjZUNvbnRyb2wuaW5wdXRCb3gudmFsaWRhdGVJbnB1dCEodmFsdWUsIGN1cnNvclBvc2l0aW9uKSkudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtZXNzYWdlID0gTWFya2Rvd25TdHJpbmcuZnJvbVN0cmljdChyZXN1bHQubWVzc2FnZSk7XG5cdFx0XHRpZiAoIW1lc3NhZ2UpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlPFtzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcsIG51bWJlcl0+KFttZXNzYWdlLCByZXN1bHQudHlwZV0pO1xuXHRcdH0pO1xuXHR9XG5cblx0JHNldFNlbGVjdGVkU291cmNlQ29udHJvbChzZWxlY3RlZFNvdXJjZUNvbnRyb2xIYW5kbGU6IG51bWJlciB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRXh0SG9zdFNDTSMkc2V0U2VsZWN0ZWRTb3VyY2VDb250cm9sJywgc2VsZWN0ZWRTb3VyY2VDb250cm9sSGFuZGxlKTtcblx0XHRpZiAodGhpcy5fc2VsZWN0ZWRTb3VyY2VDb250cm9sSGFuZGxlID09PSBzZWxlY3RlZFNvdXJjZUNvbnRyb2xIYW5kbGUpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRpZiAoc2VsZWN0ZWRTb3VyY2VDb250cm9sSGFuZGxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3NvdXJjZUNvbnRyb2xzLmdldChzZWxlY3RlZFNvdXJjZUNvbnRyb2xIYW5kbGUpPy5zZXRTZWxlY3Rpb25TdGF0ZSh0cnVlKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fc2VsZWN0ZWRTb3VyY2VDb250cm9sSGFuZGxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3NvdXJjZUNvbnRyb2xzLmdldCh0aGlzLl9zZWxlY3RlZFNvdXJjZUNvbnRyb2xIYW5kbGUpPy5zZXRTZWxlY3Rpb25TdGF0ZShmYWxzZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2VsZWN0ZWRTb3VyY2VDb250cm9sSGFuZGxlID0gc2VsZWN0ZWRTb3VyY2VDb250cm9sSGFuZGxlO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdGFzeW5jICRyZXNvbHZlSGlzdG9yeUl0ZW0oc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLCBoaXN0b3J5SXRlbUlkOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8U0NNSGlzdG9yeUl0ZW1EdG8gfCB1bmRlZmluZWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaGlzdG9yeVByb3ZpZGVyID0gdGhpcy5fc291cmNlQ29udHJvbHMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpPy5oaXN0b3J5UHJvdmlkZXI7XG5cdFx0XHRjb25zdCBoaXN0b3J5SXRlbSA9IGF3YWl0IGhpc3RvcnlQcm92aWRlcj8ucmVzb2x2ZUhpc3RvcnlJdGVtKGhpc3RvcnlJdGVtSWQsIHRva2VuKTtcblxuXHRcdFx0cmV0dXJuIGhpc3RvcnlJdGVtID8gdG9TQ01IaXN0b3J5SXRlbUR0byhoaXN0b3J5SXRlbSkgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRXh0SG9zdFNDTSMkcmVzb2x2ZUhpc3RvcnlJdGVtJywgZXJyKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgJHJlc29sdmVIaXN0b3J5SXRlbUNoYXRDb250ZXh0KHNvdXJjZUNvbnRyb2xIYW5kbGU6IG51bWJlciwgaGlzdG9yeUl0ZW1JZDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBoaXN0b3J5UHJvdmlkZXIgPSB0aGlzLl9zb3VyY2VDb250cm9scy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk/Lmhpc3RvcnlQcm92aWRlcjtcblx0XHRcdGNvbnN0IGNoYXRDb250ZXh0ID0gYXdhaXQgaGlzdG9yeVByb3ZpZGVyPy5yZXNvbHZlSGlzdG9yeUl0ZW1DaGF0Q29udGV4dChoaXN0b3J5SXRlbUlkLCB0b2tlbik7XG5cblx0XHRcdHJldHVybiBjaGF0Q29udGV4dCA/PyB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRXh0SG9zdFNDTSMkcmVzb2x2ZUhpc3RvcnlJdGVtQ2hhdENvbnRleHQnLCBlcnIpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRhc3luYyAkcmVzb2x2ZUhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2VDaGF0Q29udGV4dChzb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIsIGhpc3RvcnlJdGVtSWQ6IHN0cmluZywgaGlzdG9yeUl0ZW1QYXJlbnRJZDogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGhpc3RvcnlQcm92aWRlciA9IHRoaXMuX3NvdXJjZUNvbnRyb2xzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKT8uaGlzdG9yeVByb3ZpZGVyO1xuXHRcdFx0Y29uc3QgY2hhdENvbnRleHQgPSBhd2FpdCBoaXN0b3J5UHJvdmlkZXI/LnJlc29sdmVIaXN0b3J5SXRlbUNoYW5nZVJhbmdlQ2hhdENvbnRleHQ/LihoaXN0b3J5SXRlbUlkLCBoaXN0b3J5SXRlbVBhcmVudElkLCBwYXRoLCB0b2tlbik7XG5cblx0XHRcdHJldHVybiBjaGF0Q29udGV4dCA/PyB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRXh0SG9zdFNDTSMkcmVzb2x2ZUhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2VDaGF0Q29udGV4dCcsIGVycik7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jICRyZXNvbHZlSGlzdG9yeUl0ZW1SZWZzQ29tbW9uQW5jZXN0b3Ioc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLCBoaXN0b3J5SXRlbVJlZnM6IHN0cmluZ1tdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBoaXN0b3J5UHJvdmlkZXIgPSB0aGlzLl9zb3VyY2VDb250cm9scy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk/Lmhpc3RvcnlQcm92aWRlcjtcblx0XHRcdGNvbnN0IGFuY2VzdG9yID0gYXdhaXQgaGlzdG9yeVByb3ZpZGVyPy5yZXNvbHZlSGlzdG9yeUl0ZW1SZWZzQ29tbW9uQW5jZXN0b3IoaGlzdG9yeUl0ZW1SZWZzLCB0b2tlbik7XG5cblx0XHRcdHJldHVybiBhbmNlc3RvciA/PyB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRXh0SG9zdFNDTSMkcmVzb2x2ZUhpc3RvcnlJdGVtUmVmc0NvbW1vbkFuY2VzdG9yJywgZXJyKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgJHByb3ZpZGVIaXN0b3J5SXRlbVJlZnMoc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLCBoaXN0b3J5SXRlbVJlZnM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFNDTUhpc3RvcnlJdGVtUmVmRHRvW10gfCB1bmRlZmluZWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaGlzdG9yeVByb3ZpZGVyID0gdGhpcy5fc291cmNlQ29udHJvbHMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpPy5oaXN0b3J5UHJvdmlkZXI7XG5cdFx0XHRjb25zdCByZWZzID0gYXdhaXQgaGlzdG9yeVByb3ZpZGVyPy5wcm92aWRlSGlzdG9yeUl0ZW1SZWZzKGhpc3RvcnlJdGVtUmVmcywgdG9rZW4pO1xuXG5cdFx0XHRyZXR1cm4gcmVmcz8ubWFwKHJlZiA9PiAoeyAuLi5yZWYsIGljb246IGdldEhpc3RvcnlJdGVtSWNvbkR0byhyZWYuaWNvbikgfSkpID8/IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdFeHRIb3N0U0NNIyRwcm92aWRlSGlzdG9yeUl0ZW1SZWZzJywgZXJyKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgJHByb3ZpZGVIaXN0b3J5SXRlbXMoc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLCBvcHRpb25zOiB2c2NvZGUuU291cmNlQ29udHJvbEhpc3RvcnlPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFNDTUhpc3RvcnlJdGVtRHRvW10gfCB1bmRlZmluZWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaGlzdG9yeVByb3ZpZGVyID0gdGhpcy5fc291cmNlQ29udHJvbHMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpPy5oaXN0b3J5UHJvdmlkZXI7XG5cdFx0XHRjb25zdCBoaXN0b3J5SXRlbXMgPSBhd2FpdCBoaXN0b3J5UHJvdmlkZXI/LnByb3ZpZGVIaXN0b3J5SXRlbXMob3B0aW9ucywgdG9rZW4pO1xuXG5cdFx0XHRyZXR1cm4gaGlzdG9yeUl0ZW1zPy5tYXAoaXRlbSA9PiB0b1NDTUhpc3RvcnlJdGVtRHRvKGl0ZW0pKSA/PyB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRXh0SG9zdFNDTSMkcHJvdmlkZUhpc3RvcnlJdGVtcycsIGVycik7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jICRwcm92aWRlSGlzdG9yeUl0ZW1DaGFuZ2VzKHNvdXJjZUNvbnRyb2xIYW5kbGU6IG51bWJlciwgaGlzdG9yeUl0ZW1JZDogc3RyaW5nLCBoaXN0b3J5SXRlbVBhcmVudElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8U0NNSGlzdG9yeUl0ZW1DaGFuZ2VEdG9bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBoaXN0b3J5UHJvdmlkZXIgPSB0aGlzLl9zb3VyY2VDb250cm9scy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk/Lmhpc3RvcnlQcm92aWRlcjtcblx0XHRcdGNvbnN0IGNoYW5nZXMgPSBhd2FpdCBoaXN0b3J5UHJvdmlkZXI/LnByb3ZpZGVIaXN0b3J5SXRlbUNoYW5nZXMoaGlzdG9yeUl0ZW1JZCwgaGlzdG9yeUl0ZW1QYXJlbnRJZCwgdG9rZW4pO1xuXG5cdFx0XHRyZXR1cm4gY2hhbmdlcyA/PyB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRXh0SG9zdFNDTSMkcHJvdmlkZUhpc3RvcnlJdGVtQ2hhbmdlcycsIGVycik7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jICRwcm92aWRlQXJ0aWZhY3RHcm91cHMoc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFNDTUFydGlmYWN0R3JvdXBEdG9bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBhcnRpZmFjdFByb3ZpZGVyID0gdGhpcy5fc291cmNlQ29udHJvbHMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpPy5hcnRpZmFjdFByb3ZpZGVyO1xuXHRcdFx0Y29uc3QgZ3JvdXBzID0gYXdhaXQgYXJ0aWZhY3RQcm92aWRlcj8ucHJvdmlkZUFydGlmYWN0R3JvdXBzKHRva2VuKTtcblxuXHRcdFx0cmV0dXJuIGdyb3Vwcz8ubWFwKGdyb3VwID0+ICh7XG5cdFx0XHRcdC4uLmdyb3VwLFxuXHRcdFx0XHRpY29uOiBnZXRIaXN0b3J5SXRlbUljb25EdG8oZ3JvdXAuaWNvbilcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0Y2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdFeHRIb3N0U0NNIyRwcm92aWRlQXJ0aWZhY3RHcm91cHMnLCBlcnIpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRhc3luYyAkcHJvdmlkZUFydGlmYWN0cyhzb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIsIGdyb3VwOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8U0NNQXJ0aWZhY3REdG9bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzb3VyY2VDb250cm9sID0gdGhpcy5fc291cmNlQ29udHJvbHMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpO1xuXHRcdFx0cmV0dXJuIHNvdXJjZUNvbnRyb2w/LnByb3ZpZGVBcnRpZmFjdHMoZ3JvdXAsIHRva2VuKTtcblx0XHR9XG5cdFx0Y2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdFeHRIb3N0U0NNIyRwcm92aWRlQXJ0aWZhY3RzJywgZXJyKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUtBLFNBQVMsV0FBMEI7QUFDbkMsU0FBUyxPQUFPLGVBQWU7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlLGlCQUE4Qix5QkFBeUI7QUFDL0UsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyxtQkFBdVQ7QUFDaFUsU0FBUyxZQUFZLGNBQWM7QUFDbkMsU0FBUyxvQkFBb0I7QUFHN0IsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyw4QkFBcUQ7QUFDOUQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyxnQkFBZ0IsMkNBQTJDO0FBQ3BFLFNBQVMseUJBQXlCLDRCQUE0QjtBQUU5RCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0JBQWdCO0FBTXpCLFNBQVMsTUFBTSxPQUFpQztBQUMvQyxTQUFPLGlCQUFpQjtBQUN6QjtBQUVBLFNBQVMsVUFBVSxHQUFlLEdBQXdCO0FBQ3pELE1BQUksRUFBRSxXQUFXLFFBQVEsUUFBUSxFQUFFLFdBQVcsUUFBUSxRQUFRLFNBQVM7QUFDdEUsV0FBTyxFQUFF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S0FBSyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUN2RSxZQUFNLGVBQWUsTUFBTSxpQkFBaUIsb0JBQW9CLFNBQVMsS0FBSztBQUU5RSxhQUFPLGNBQWMsSUFBSSxVQUFRLG9CQUFvQixJQUFJLENBQUMsS0FBSztBQUFBLElBQ2hFLFNBQ08sS0FBSztBQUNYLFdBQUssV0FBVyxNQUFNLG1DQUFtQyxHQUFHO0FBQzVELGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSwyQkFBMkIscUJBQTZCLGVBQXVCLHFCQUF5QyxPQUEwRTtBQUN2TSxRQUFJO0FBQ0gsWUFBTSxrQkFBa0IsS0FBSyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUN2RSxZQUFNLFVBQVUsTUFBTSxpQkFBaUIsMEJBQTBCLGVBQWUscUJBQXFCLEtBQUs7QUFFMUcsYUFBTyxXQUFXO0FBQUEsSUFDbkIsU0FDTyxLQUFLO0FBQ1gsV0FBSyxXQUFXLE1BQU0seUNBQXlDLEdBQUc7QUFDbEUsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLHVCQUF1QixxQkFBNkIsT0FBc0U7QUFDL0gsUUFBSTtBQUNILFlBQU0sbUJBQW1CLEtBQUssZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFDeEUsWUFBTSxTQUFTLE1BQU0sa0JBQWtCLHNCQUFzQixLQUFLO0FBRWxFLGFBQU8sUUFBUSxJQUFJLFlBQVU7QUFBQSxRQUM1QixHQUFHO0FBQUEsUUFDSCxNQUFNLHNCQUFzQixNQUFNLElBQUk7QUFBQSxNQUN2QyxFQUFFO0FBQUEsSUFDSCxTQUNPLEtBQUs7QUFDWCxXQUFLLFdBQVcsTUFBTSxxQ0FBcUMsR0FBRztBQUM5RCxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sa0JBQWtCLHFCQUE2QixPQUFlLE9BQWlFO0FBQ3BJLFFBQUk7QUFDSCxZQUFNLGdCQUFnQixLQUFLLGdCQUFnQixJQUFJLG1CQUFtQjtBQUNsRSxhQUFPLGVBQWUsaUJBQWlCLE9BQU8sS0FBSztBQUFBLElBQ3BELFNBQ08sS0FBSztBQUNYLFdBQUssV0FBVyxNQUFNLGdDQUFnQyxHQUFHO0FBQ3pELGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUNEO0FBNVVhLGFBQU47QUFBQSxFQWdCSjtBQUFBLEdBaEJVOyIsCiAgIm5hbWVzIjogWyJfcHJveHkiLCAic291cmNlQ29udHJvbHMiXQp9Cg==
