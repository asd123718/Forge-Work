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
import "./media/languageStatus.css";
import * as dom from "../../../../base/browser/dom.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Disposable, DisposableStore, dispose, toDisposable } from "../../../../base/common/lifecycle.js";
import Severity from "../../../../base/common/severity.js";
import { getCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { localize, localize2 } from "../../../../nls.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ILanguageStatusService } from "../../../services/languageStatus/common/languageStatusService.js";
import { IStatusbarService, ShowTooltipCommand, StatusbarAlignment } from "../../../services/statusbar/browser/statusbar.js";
import { parseLinkedText } from "../../../../base/common/linkedText.js";
import { Link } from "../../../../platform/opener/browser/link.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { Action } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { equals } from "../../../../base/common/arrays.js";
import { URI } from "../../../../base/common/uri.js";
import { Action2 } from "../../../../platform/actions/common/actions.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IHoverService, nativeHoverDelegate } from "../../../../platform/hover/browser/hover.js";
import { Event } from "../../../../base/common/event.js";
import { joinStrings } from "../../../../base/common/strings.js";
class LanguageStatusViewModel {
  constructor(combined, dedicated) {
    this.combined = combined;
    this.dedicated = dedicated;
  }
  isEqual(other) {
    return equals(this.combined, other.combined) && equals(this.dedicated, other.dedicated);
  }
}
let StoredCounter = class {
  constructor(_storageService, _key) {
    this._storageService = _storageService;
    this._key = _key;
  }
  get value() {
    return this._storageService.getNumber(this._key, StorageScope.PROFILE, 0);
  }
  increment() {
    const n = this.value + 1;
    this._storageService.store(this._key, n, StorageScope.PROFILE, StorageTarget.MACHINE);
    return n;
  }
};
StoredCounter = __decorateClass([
  __decorateParam(0, IStorageService)
], StoredCounter);
let LanguageStatusContribution = class extends Disposable {
  constructor(editorGroupService) {
    super();
    this.editorGroupService = editorGroupService;
    for (const part of editorGroupService.parts) {
      this.createLanguageStatus(part);
    }
    this._register(editorGroupService.onDidCreateAuxiliaryEditorPart((part) => this.createLanguageStatus(part)));
  }
  createLanguageStatus(part) {
    const disposables = new DisposableStore();
    Event.once(part.onWillDispose)(() => disposables.dispose());
    const scopedInstantiationService = this.editorGroupService.getScopedInstantiationService(part);
    disposables.add(scopedInstantiationService.createInstance(LanguageStatus));
  }
};
LanguageStatusContribution.Id = "status.languageStatus";
LanguageStatusContribution = __decorateClass([
  __decorateParam(0, IEditorGroupsService)
], LanguageStatusContribution);
let LanguageStatus = class {
  constructor(_languageStatusService, _statusBarService, _editorService, _hoverService, _openerService, _storageService) {
    this._languageStatusService = _languageStatusService;
    this._statusBarService = _statusBarService;
    this._editorService = _editorService;
    this._hoverService = _hoverService;
    this._openerService = _openerService;
    this._storageService = _storageService;
    this._disposables = new DisposableStore();
    this._dedicated = /* @__PURE__ */ new Set();
    this._dedicatedEntries = /* @__PURE__ */ new Map();
    this._renderDisposables = new DisposableStore();
    this._combinedEntryTooltip = document.createElement("div");
    _storageService.onDidChangeValue(StorageScope.PROFILE, LanguageStatus._keyDedicatedItems, this._disposables)(this._handleStorageChange, this, this._disposables);
    this._restoreState();
    this._interactionCounter = new StoredCounter(_storageService, "languageStatus.interactCount");
    _languageStatusService.onDidChange(this._update, this, this._disposables);
    _editorService.onDidActiveEditorChange(this._update, this, this._disposables);
    this._update();
    _statusBarService.onDidChangeEntryVisibility((e) => {
      if (!e.visible && this._dedicated.has(e.id)) {
        this._dedicated.delete(e.id);
        this._update();
        this._storeState();
      }
    }, void 0, this._disposables);
  }
  dispose() {
    this._disposables.dispose();
    this._combinedEntry?.dispose();
    dispose(this._dedicatedEntries.values());
    this._renderDisposables.dispose();
  }
  // --- persisting dedicated items
  _handleStorageChange() {
    this._restoreState();
    this._update();
  }
  _restoreState() {
    const raw = this._storageService.get(LanguageStatus._keyDedicatedItems, StorageScope.PROFILE, "[]");
    try {
      const ids = JSON.parse(raw);
      this._dedicated = new Set(ids);
    } catch {
      this._dedicated.clear();
    }
  }
  _storeState() {
    if (this._dedicated.size === 0) {
      this._storageService.remove(LanguageStatus._keyDedicatedItems, StorageScope.PROFILE);
    } else {
      const raw = JSON.stringify(Array.from(this._dedicated.keys()));
      this._storageService.store(LanguageStatus._keyDedicatedItems, raw, StorageScope.PROFILE, StorageTarget.USER);
    }
  }
  // --- language status model and UI
  _createViewModel(editor) {
    if (!editor?.hasModel()) {
      return new LanguageStatusViewModel([], []);
    }
    const all = this._languageStatusService.getLanguageStatus(editor.getModel());
    const combined = [];
    const dedicated = [];
    for (const item of all) {
      if (this._dedicated.has(item.id)) {
        dedicated.push(item);
      }
      combined.push(item);
    }
    return new LanguageStatusViewModel(combined, dedicated);
  }
  _update() {
    const editor = getCodeEditor(this._editorService.activeTextEditorControl);
    const model = this._createViewModel(editor);
    if (this._model?.isEqual(model)) {
      return;
    }
    this._renderDisposables.clear();
    this._model = model;
    editor?.onDidChangeModelLanguage(this._update, this, this._renderDisposables);
    if (model.combined.length === 0) {
      this._combinedEntry?.dispose();
      this._combinedEntry = void 0;
    } else {
      const [first] = model.combined;
      const showSeverity = first.severity >= Severity.Warning;
      const text = LanguageStatus._severityToComboCodicon(first.severity);
      let isOneBusy = false;
      const ariaLabels = [];
      for (const status of model.combined) {
        const isPinned = model.dedicated.includes(status);
        this._renderStatus(this._combinedEntryTooltip, status, showSeverity, isPinned, this._renderDisposables);
        ariaLabels.push(LanguageStatus._accessibilityInformation(status).label);
        isOneBusy = isOneBusy || !isPinned && status.busy;
      }
      const props = {
        name: localize("langStatus.name", "Editor Language Status"),
        ariaLabel: localize("langStatus.aria", "Editor Language Status: {0}", ariaLabels.join(", next: ")),
        tooltip: this._combinedEntryTooltip,
        command: ShowTooltipCommand,
        text: isOneBusy ? "$(loading~spin)" : text
      };
      if (!this._combinedEntry) {
        this._combinedEntry = this._statusBarService.addEntry(props, LanguageStatus._id, StatusbarAlignment.RIGHT, { location: { id: "status.editor.mode", priority: 100.1 }, alignment: StatusbarAlignment.LEFT, compact: true });
      } else {
        this._combinedEntry.update(props);
      }
      const userHasInteractedWithStatus = this._interactionCounter.value >= 3;
      const targetWindow = dom.getWindow(editor?.getContainerDomNode());
      const node = targetWindow.document.querySelector(".monaco-workbench .statusbar DIV#status\\.languageStatus A>SPAN.codicon");
      const container = targetWindow.document.querySelector(".monaco-workbench .statusbar DIV#status\\.languageStatus");
      if (dom.isHTMLElement(node) && container) {
        const _wiggle = "wiggle";
        const _flash = "flash";
        if (!isOneBusy) {
          node.classList.toggle(_wiggle, showSeverity || !userHasInteractedWithStatus);
          this._renderDisposables.add(dom.addDisposableListener(node, "animationend", (_e) => node.classList.remove(_wiggle)));
          container.classList.toggle(_flash, showSeverity);
          this._renderDisposables.add(dom.addDisposableListener(container, "animationend", (_e) => container.classList.remove(_flash)));
        } else {
          node.classList.remove(_wiggle);
          container.classList.remove(_flash);
        }
      }
      if (!userHasInteractedWithStatus) {
        const hoverTarget = targetWindow.document.querySelector(".monaco-workbench .context-view");
        if (dom.isHTMLElement(hoverTarget)) {
          const observer = new MutationObserver(() => {
            if (targetWindow.document.contains(this._combinedEntryTooltip)) {
              this._interactionCounter.increment();
              observer.disconnect();
            }
          });
          observer.observe(hoverTarget, { childList: true, subtree: true });
          this._renderDisposables.add(toDisposable(() => observer.disconnect()));
        }
      }
    }
    const newDedicatedEntries = /* @__PURE__ */ new Map();
    for (const status of model.dedicated) {
      const props = LanguageStatus._asStatusbarEntry(status);
      let entry = newDedicatedEntries.get(status.id) ?? this._dedicatedEntries.get(status.id);
      if (!entry) {
        entry = this._statusBarService.addEntry(props, status.id, StatusbarAlignment.RIGHT, { location: { id: "status.editor.mode", priority: 100.1 }, alignment: StatusbarAlignment.RIGHT });
      } else {
        entry.update(props);
        this._dedicatedEntries.delete(status.id);
      }
      newDedicatedEntries.set(status.id, entry);
    }
    dispose(this._dedicatedEntries.values());
    this._dedicatedEntries = newDedicatedEntries;
  }
  _renderStatus(container, status, showSeverity, isPinned, store) {
    const parent = document.createElement("div");
    parent.classList.add("hover-language-status");
    container.appendChild(parent);
    store.add(toDisposable(() => parent.remove()));
    const severity = document.createElement("div");
    severity.classList.add("severity", `sev${status.severity}`);
    severity.classList.toggle("show", showSeverity);
    const severityText = LanguageStatus._severityToSingleCodicon(status.severity);
    dom.append(severity, ...renderLabelWithIcons(severityText));
    parent.appendChild(severity);
    const element = document.createElement("div");
    element.classList.add("element");
    parent.appendChild(element);
    const left = document.createElement("div");
    left.classList.add("left");
    element.appendChild(left);
    const label = typeof status.label === "string" ? status.label : status.label.value;
    dom.append(left, ...renderLabelWithIcons(computeText(label, status.busy)));
    this._renderTextPlus(left, status.detail, store);
    const right = document.createElement("div");
    right.classList.add("right");
    element.appendChild(right);
    const { command } = status;
    if (command) {
      store.add(new Link(right, {
        label: command.title,
        title: command.tooltip,
        href: URI.from({
          scheme: "command",
          path: command.id,
          query: command.arguments && JSON.stringify(command.arguments)
        }).toString()
      }, { hoverDelegate: nativeHoverDelegate }, this._hoverService, this._openerService));
    }
    const actionBar = new ActionBar(right, { hoverDelegate: nativeHoverDelegate });
    const actionLabel = isPinned ? localize("unpin", "Remove from Status Bar") : localize("pin", "Add to Status Bar");
    actionBar.setAriaLabel(actionLabel);
    store.add(actionBar);
    let action;
    if (!isPinned) {
      action = new Action("pin", actionLabel, ThemeIcon.asClassName(Codicon.pin), true, () => {
        this._dedicated.add(status.id);
        this._statusBarService.updateEntryVisibility(status.id, true);
        this._update();
        this._storeState();
      });
    } else {
      action = new Action("unpin", actionLabel, ThemeIcon.asClassName(Codicon.pinned), true, () => {
        this._dedicated.delete(status.id);
        this._statusBarService.updateEntryVisibility(status.id, false);
        this._update();
        this._storeState();
      });
    }
    actionBar.push(action, { icon: true, label: false });
    store.add(action);
    return parent;
  }
  static _severityToComboCodicon(sev) {
    switch (sev) {
      case Severity.Error:
        return "$(bracket-error)";
      case Severity.Warning:
        return "$(bracket-dot)";
      default:
        return "$(bracket)";
    }
  }
  static _severityToSingleCodicon(sev) {
    switch (sev) {
      case Severity.Error:
        return "$(error)";
      case Severity.Warning:
        return "$(info)";
      default:
        return "$(check)";
    }
  }
  _renderTextPlus(target, text, store) {
    let didRenderSeparator = false;
    for (const node of parseLinkedText(text).nodes) {
      if (!didRenderSeparator) {
        dom.append(target, dom.$("span.separator"));
        didRenderSeparator = true;
      }
      if (typeof node === "string") {
        const parts = renderLabelWithIcons(node);
        dom.append(target, ...parts);
      } else {
        store.add(new Link(target, node, void 0, this._hoverService, this._openerService));
      }
    }
  }
  static _accessibilityInformation(status) {
    if (status.accessibilityInfo) {
      return status.accessibilityInfo;
    }
    const textValue = typeof status.label === "string" ? status.label : status.label.value;
    if (status.detail) {
      return { label: localize("aria.1", "{0}, {1}", textValue, status.detail) };
    } else {
      return { label: localize("aria.2", "{0}", textValue) };
    }
  }
  // ---
  static _asStatusbarEntry(item) {
    let kind;
    if (item.severity === Severity.Warning) {
      kind = "warning";
    } else if (item.severity === Severity.Error) {
      kind = "error";
    }
    const textValue = typeof item.label === "string" ? item.label : item.label.shortValue;
    return {
      name: localize("name.pattern", "{0} (Language Status)", item.name),
      text: computeText(textValue, item.busy),
      ariaLabel: LanguageStatus._accessibilityInformation(item).label,
      role: item.accessibilityInfo?.role,
      tooltip: item.command?.tooltip || new MarkdownString(item.detail, { isTrusted: true, supportThemeIcons: true }),
      kind,
      command: item.command
    };
  }
};
LanguageStatus._id = "status.languageStatus";
LanguageStatus._keyDedicatedItems = "languageStatus.dedicated";
LanguageStatus = __decorateClass([
  __decorateParam(0, ILanguageStatusService),
  __decorateParam(1, IStatusbarService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IOpenerService),
  __decorateParam(5, IStorageService)
], LanguageStatus);
class ResetAction extends Action2 {
  constructor() {
    super({
      id: "editor.inlayHints.Reset",
      title: localize2("reset", "Reset Language Status Interaction Counter"),
      category: Categories.View,
      f1: true
    });
  }
  run(accessor) {
    accessor.get(IStorageService).remove("languageStatus.interactCount", StorageScope.PROFILE);
  }
}
function computeText(text, loading) {
  return joinStrings([text !== "" && text, loading && "$(loading~spin)"], "\xA0\xA0");
}
export {
  LanguageStatusContribution,
  ResetAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGxhbmd1YWdlU3RhdHVzXFxicm93c2VyXFxsYW5ndWFnZVN0YXR1cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9sYW5ndWFnZVN0YXR1cy5jc3MnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVyTGFiZWxXaXRoSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IGdldENvZGVFZGl0b3IsIElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU3RhdHVzLCBJTGFuZ3VhZ2VTdGF0dXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGFuZ3VhZ2VTdGF0dXMvY29tbW9uL2xhbmd1YWdlU3RhdHVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RhdHVzYmFyRW50cnksIElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yLCBJU3RhdHVzYmFyU2VydmljZSwgU2hvd1Rvb2x0aXBDb21tYW5kLCBTdGF0dXNiYXJBbGlnbm1lbnQsIFN0YXR1c2JhckVudHJ5S2luZCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3N0YXR1c2Jhci9icm93c2VyL3N0YXR1c2Jhci5qcyc7XG5pbXBvcnQgeyBwYXJzZUxpbmtlZFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saW5rZWRUZXh0LmpzJztcbmltcG9ydCB7IExpbmsgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvYnJvd3Nlci9saW5rLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlLCBJRWRpdG9yUGFydCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlLCBuYXRpdmVIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGpvaW5TdHJpbmdzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5cbmNsYXNzIExhbmd1YWdlU3RhdHVzVmlld01vZGVsIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBjb21iaW5lZDogcmVhZG9ubHkgSUxhbmd1YWdlU3RhdHVzW10sXG5cdFx0cmVhZG9ubHkgZGVkaWNhdGVkOiByZWFkb25seSBJTGFuZ3VhZ2VTdGF0dXNbXVxuXHQpIHsgfVxuXG5cdGlzRXF1YWwob3RoZXI6IExhbmd1YWdlU3RhdHVzVmlld01vZGVsKSB7XG5cdFx0cmV0dXJuIGVxdWFscyh0aGlzLmNvbWJpbmVkLCBvdGhlci5jb21iaW5lZCkgJiYgZXF1YWxzKHRoaXMuZGVkaWNhdGVkLCBvdGhlci5kZWRpY2F0ZWQpO1xuXHR9XG59XG5cbmNsYXNzIFN0b3JlZENvdW50ZXIge1xuXG5cdGNvbnN0cnVjdG9yKEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSwgcHJpdmF0ZSByZWFkb25seSBfa2V5OiBzdHJpbmcpIHsgfVxuXG5cdGdldCB2YWx1ZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0TnVtYmVyKHRoaXMuX2tleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIDApO1xuXHR9XG5cblx0aW5jcmVtZW50KCk6IG51bWJlciB7XG5cdFx0Y29uc3QgbiA9IHRoaXMudmFsdWUgKyAxO1xuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKHRoaXMuX2tleSwgbiwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0cmV0dXJuIG47XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIExhbmd1YWdlU3RhdHVzQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJZCA9ICdzdGF0dXMubGFuZ3VhZ2VTdGF0dXMnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgZWRpdG9yR3JvdXBTZXJ2aWNlLnBhcnRzKSB7XG5cdFx0XHR0aGlzLmNyZWF0ZUxhbmd1YWdlU3RhdHVzKHBhcnQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvckdyb3VwU2VydmljZS5vbkRpZENyZWF0ZUF1eGlsaWFyeUVkaXRvclBhcnQocGFydCA9PiB0aGlzLmNyZWF0ZUxhbmd1YWdlU3RhdHVzKHBhcnQpKSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUxhbmd1YWdlU3RhdHVzKHBhcnQ6IElFZGl0b3JQYXJ0KTogdm9pZCB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0RXZlbnQub25jZShwYXJ0Lm9uV2lsbERpc3Bvc2UpKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSk7XG5cblx0XHRjb25zdCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmdldFNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlKHBhcnQpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMYW5ndWFnZVN0YXR1cykpO1xuXHR9XG59XG5cbmNsYXNzIExhbmd1YWdlU3RhdHVzIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfaWQgPSAnc3RhdHVzLmxhbmd1YWdlU3RhdHVzJztcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfa2V5RGVkaWNhdGVkSXRlbXMgPSAnbGFuZ3VhZ2VTdGF0dXMuZGVkaWNhdGVkJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaW50ZXJhY3Rpb25Db3VudGVyOiBTdG9yZWRDb3VudGVyO1xuXG5cdHByaXZhdGUgX2RlZGljYXRlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdHByaXZhdGUgX21vZGVsPzogTGFuZ3VhZ2VTdGF0dXNWaWV3TW9kZWw7XG5cdHByaXZhdGUgX2NvbWJpbmVkRW50cnk/OiBJU3RhdHVzYmFyRW50cnlBY2Nlc3Nvcjtcblx0cHJpdmF0ZSBfZGVkaWNhdGVkRW50cmllcyA9IG5ldyBNYXA8c3RyaW5nLCBJU3RhdHVzYmFyRW50cnlBY2Nlc3Nvcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVuZGVyRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29tYmluZWRFbnRyeVRvb2x0aXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxhbmd1YWdlU3RhdHVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVN0YXR1c1NlcnZpY2U6IElMYW5ndWFnZVN0YXR1c1NlcnZpY2UsXG5cdFx0QElTdGF0dXNiYXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0YXR1c0JhclNlcnZpY2U6IElTdGF0dXNiYXJTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0X3N0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLlBST0ZJTEUsIExhbmd1YWdlU3RhdHVzLl9rZXlEZWRpY2F0ZWRJdGVtcywgdGhpcy5fZGlzcG9zYWJsZXMpKHRoaXMuX2hhbmRsZVN0b3JhZ2VDaGFuZ2UsIHRoaXMsIHRoaXMuX2Rpc3Bvc2FibGVzKTtcblx0XHR0aGlzLl9yZXN0b3JlU3RhdGUoKTtcblx0XHR0aGlzLl9pbnRlcmFjdGlvbkNvdW50ZXIgPSBuZXcgU3RvcmVkQ291bnRlcihfc3RvcmFnZVNlcnZpY2UsICdsYW5ndWFnZVN0YXR1cy5pbnRlcmFjdENvdW50Jyk7XG5cblx0XHRfbGFuZ3VhZ2VTdGF0dXNTZXJ2aWNlLm9uRGlkQ2hhbmdlKHRoaXMuX3VwZGF0ZSwgdGhpcywgdGhpcy5fZGlzcG9zYWJsZXMpO1xuXHRcdF9lZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKHRoaXMuX3VwZGF0ZSwgdGhpcywgdGhpcy5fZGlzcG9zYWJsZXMpO1xuXHRcdHRoaXMuX3VwZGF0ZSgpO1xuXG5cdFx0X3N0YXR1c0JhclNlcnZpY2Uub25EaWRDaGFuZ2VFbnRyeVZpc2liaWxpdHkoZSA9PiB7XG5cdFx0XHRpZiAoIWUudmlzaWJsZSAmJiB0aGlzLl9kZWRpY2F0ZWQuaGFzKGUuaWQpKSB7XG5cdFx0XHRcdHRoaXMuX2RlZGljYXRlZC5kZWxldGUoZS5pZCk7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHRcdFx0XHR0aGlzLl9zdG9yZVN0YXRlKCk7XG5cdFx0XHR9XG5cdFx0fSwgdW5kZWZpbmVkLCB0aGlzLl9kaXNwb3NhYmxlcyk7XG5cblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2NvbWJpbmVkRW50cnk/LmRpc3Bvc2UoKTtcblx0XHRkaXNwb3NlKHRoaXMuX2RlZGljYXRlZEVudHJpZXMudmFsdWVzKCkpO1xuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8vIC0tLSBwZXJzaXN0aW5nIGRlZGljYXRlZCBpdGVtc1xuXG5cdHByaXZhdGUgX2hhbmRsZVN0b3JhZ2VDaGFuZ2UoKSB7XG5cdFx0dGhpcy5fcmVzdG9yZVN0YXRlKCk7XG5cdFx0dGhpcy5fdXBkYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXN0b3JlU3RhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KExhbmd1YWdlU3RhdHVzLl9rZXlEZWRpY2F0ZWRJdGVtcywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsICdbXScpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBpZHMgPSA8c3RyaW5nW10+SlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0dGhpcy5fZGVkaWNhdGVkID0gbmV3IFNldChpZHMpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0dGhpcy5fZGVkaWNhdGVkLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc3RvcmVTdGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGVkaWNhdGVkLnNpemUgPT09IDApIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShMYW5ndWFnZVN0YXR1cy5fa2V5RGVkaWNhdGVkSXRlbXMsIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcmF3ID0gSlNPTi5zdHJpbmdpZnkoQXJyYXkuZnJvbSh0aGlzLl9kZWRpY2F0ZWQua2V5cygpKSk7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShMYW5ndWFnZVN0YXR1cy5fa2V5RGVkaWNhdGVkSXRlbXMsIHJhdywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIGxhbmd1YWdlIHN0YXR1cyBtb2RlbCBhbmQgVUlcblxuXHRwcml2YXRlIF9jcmVhdGVWaWV3TW9kZWwoZWRpdG9yOiBJQ29kZUVkaXRvciB8IG51bGwpOiBMYW5ndWFnZVN0YXR1c1ZpZXdNb2RlbCB7XG5cdFx0aWYgKCFlZGl0b3I/Lmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybiBuZXcgTGFuZ3VhZ2VTdGF0dXNWaWV3TW9kZWwoW10sIFtdKTtcblx0XHR9XG5cdFx0Y29uc3QgYWxsID0gdGhpcy5fbGFuZ3VhZ2VTdGF0dXNTZXJ2aWNlLmdldExhbmd1YWdlU3RhdHVzKGVkaXRvci5nZXRNb2RlbCgpKTtcblx0XHRjb25zdCBjb21iaW5lZDogSUxhbmd1YWdlU3RhdHVzW10gPSBbXTtcblx0XHRjb25zdCBkZWRpY2F0ZWQ6IElMYW5ndWFnZVN0YXR1c1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGFsbCkge1xuXHRcdFx0aWYgKHRoaXMuX2RlZGljYXRlZC5oYXMoaXRlbS5pZCkpIHtcblx0XHRcdFx0ZGVkaWNhdGVkLnB1c2goaXRlbSk7XG5cdFx0XHR9XG5cdFx0XHRjb21iaW5lZC5wdXNoKGl0ZW0pO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IExhbmd1YWdlU3RhdHVzVmlld01vZGVsKGNvbWJpbmVkLCBkZWRpY2F0ZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRvciA9IGdldENvZGVFZGl0b3IodGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbCk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9jcmVhdGVWaWV3TW9kZWwoZWRpdG9yKTtcblxuXHRcdGlmICh0aGlzLl9tb2RlbD8uaXNFcXVhbChtb2RlbCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdHRoaXMuX21vZGVsID0gbW9kZWw7XG5cblx0XHQvLyB1cGRhdGUgd2hlbiBlZGl0b3IgbGFuZ3VhZ2UgY2hhbmdlc1xuXHRcdGVkaXRvcj8ub25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlKHRoaXMuX3VwZGF0ZSwgdGhpcywgdGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMpO1xuXG5cdFx0Ly8gY29tYmluZWQgc3RhdHVzIGJhciBpdGVtIGlzIGEgc2luZ2xlIGl0ZW0gd2hpY2ggaG92ZXIgc2hvd3Ncblx0XHQvLyBlYWNoIHN0YXR1cyBpdGVtXG5cdFx0aWYgKG1vZGVsLmNvbWJpbmVkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gbm90aGluZ1xuXHRcdFx0dGhpcy5fY29tYmluZWRFbnRyeT8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fY29tYmluZWRFbnRyeSA9IHVuZGVmaW5lZDtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBbZmlyc3RdID0gbW9kZWwuY29tYmluZWQ7XG5cdFx0XHRjb25zdCBzaG93U2V2ZXJpdHkgPSBmaXJzdC5zZXZlcml0eSA+PSBTZXZlcml0eS5XYXJuaW5nO1xuXHRcdFx0Y29uc3QgdGV4dCA9IExhbmd1YWdlU3RhdHVzLl9zZXZlcml0eVRvQ29tYm9Db2RpY29uKGZpcnN0LnNldmVyaXR5KTtcblxuXHRcdFx0bGV0IGlzT25lQnVzeSA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgYXJpYUxhYmVsczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3Qgc3RhdHVzIG9mIG1vZGVsLmNvbWJpbmVkKSB7XG5cdFx0XHRcdGNvbnN0IGlzUGlubmVkID0gbW9kZWwuZGVkaWNhdGVkLmluY2x1ZGVzKHN0YXR1cyk7XG5cdFx0XHRcdHRoaXMuX3JlbmRlclN0YXR1cyh0aGlzLl9jb21iaW5lZEVudHJ5VG9vbHRpcCwgc3RhdHVzLCBzaG93U2V2ZXJpdHksIGlzUGlubmVkLCB0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcyk7XG5cdFx0XHRcdGFyaWFMYWJlbHMucHVzaChMYW5ndWFnZVN0YXR1cy5fYWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uKHN0YXR1cykubGFiZWwpO1xuXHRcdFx0XHRpc09uZUJ1c3kgPSBpc09uZUJ1c3kgfHwgKCFpc1Bpbm5lZCAmJiBzdGF0dXMuYnVzeSk7IC8vIHVucGlubmVkIGl0ZW1zIGNvbnRyaWJ1dGUgdG8gdGhlIGJ1c3ktaW5kaWNhdG9yIG9mIHRoZSBjb21wb3NpdGUgc3RhdHVzIGl0ZW1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcHJvcHM6IElTdGF0dXNiYXJFbnRyeSA9IHtcblx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ2xhbmdTdGF0dXMubmFtZScsIFwiRWRpdG9yIExhbmd1YWdlIFN0YXR1c1wiKSxcblx0XHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnbGFuZ1N0YXR1cy5hcmlhJywgXCJFZGl0b3IgTGFuZ3VhZ2UgU3RhdHVzOiB7MH1cIiwgYXJpYUxhYmVscy5qb2luKCcsIG5leHQ6ICcpKSxcblx0XHRcdFx0dG9vbHRpcDogdGhpcy5fY29tYmluZWRFbnRyeVRvb2x0aXAsXG5cdFx0XHRcdGNvbW1hbmQ6IFNob3dUb29sdGlwQ29tbWFuZCxcblx0XHRcdFx0dGV4dDogaXNPbmVCdXN5ID8gJyQobG9hZGluZ35zcGluKScgOiB0ZXh0LFxuXHRcdFx0fTtcblx0XHRcdGlmICghdGhpcy5fY29tYmluZWRFbnRyeSkge1xuXHRcdFx0XHR0aGlzLl9jb21iaW5lZEVudHJ5ID0gdGhpcy5fc3RhdHVzQmFyU2VydmljZS5hZGRFbnRyeShwcm9wcywgTGFuZ3VhZ2VTdGF0dXMuX2lkLCBTdGF0dXNiYXJBbGlnbm1lbnQuUklHSFQsIHsgbG9jYXRpb246IHsgaWQ6ICdzdGF0dXMuZWRpdG9yLm1vZGUnLCBwcmlvcml0eTogMTAwLjEgfSwgYWxpZ25tZW50OiBTdGF0dXNiYXJBbGlnbm1lbnQuTEVGVCwgY29tcGFjdDogdHJ1ZSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2NvbWJpbmVkRW50cnkudXBkYXRlKHByb3BzKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gYW5pbWF0ZSB0aGUgc3RhdHVzIGJhciBpY29uIHdoZW5ldmVyIGxhbmd1YWdlIHN0YXR1cyBjaGFuZ2VzLCByZXBlYXQgYW5pbWF0aW9uXG5cdFx0XHQvLyB3aGVuIHNldmVyaXR5IGlzIHdhcm5pbmcgb3IgZXJyb3IsIGRvbid0IHNob3cgYW5pbWF0aW9uIHdoZW4gc2hvd2luZyBwcm9ncmVzcy9idXN5XG5cdFx0XHRjb25zdCB1c2VySGFzSW50ZXJhY3RlZFdpdGhTdGF0dXMgPSB0aGlzLl9pbnRlcmFjdGlvbkNvdW50ZXIudmFsdWUgPj0gMztcblx0XHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGRvbS5nZXRXaW5kb3coZWRpdG9yPy5nZXRDb250YWluZXJEb21Ob2RlKCkpO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCBub2RlID0gdGFyZ2V0V2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28td29ya2JlbmNoIC5zdGF0dXNiYXIgRElWI3N0YXR1c1xcXFwubGFuZ3VhZ2VTdGF0dXMgQT5TUEFOLmNvZGljb24nKTtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gdGFyZ2V0V2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28td29ya2JlbmNoIC5zdGF0dXNiYXIgRElWI3N0YXR1c1xcXFwubGFuZ3VhZ2VTdGF0dXMnKTtcblx0XHRcdGlmIChkb20uaXNIVE1MRWxlbWVudChub2RlKSAmJiBjb250YWluZXIpIHtcblx0XHRcdFx0Y29uc3QgX3dpZ2dsZSA9ICd3aWdnbGUnO1xuXHRcdFx0XHRjb25zdCBfZmxhc2ggPSAnZmxhc2gnO1xuXHRcdFx0XHRpZiAoIWlzT25lQnVzeSkge1xuXHRcdFx0XHRcdC8vIHdpZ2dsZSBpY29uIHdoZW4gc2V2ZXJlIG9yIFwibmV3XCJcblx0XHRcdFx0XHRub2RlLmNsYXNzTGlzdC50b2dnbGUoX3dpZ2dsZSwgc2hvd1NldmVyaXR5IHx8ICF1c2VySGFzSW50ZXJhY3RlZFdpdGhTdGF0dXMpO1xuXHRcdFx0XHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG5vZGUsICdhbmltYXRpb25lbmQnLCBfZSA9PiBub2RlLmNsYXNzTGlzdC5yZW1vdmUoX3dpZ2dsZSkpKTtcblx0XHRcdFx0XHQvLyBmbGFzaCBiYWNrZ3JvdW5kIHdoZW4gc2V2ZXJlXG5cdFx0XHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoX2ZsYXNoLCBzaG93U2V2ZXJpdHkpO1xuXHRcdFx0XHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNvbnRhaW5lciwgJ2FuaW1hdGlvbmVuZCcsIF9lID0+IGNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKF9mbGFzaCkpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRub2RlLmNsYXNzTGlzdC5yZW1vdmUoX3dpZ2dsZSk7XG5cdFx0XHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoX2ZsYXNoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyB0cmFjayB3aGVuIHRoZSBob3ZlciBzaG93cyAodGhpcyBpcyBhdXRvbWFnaWMgYW5kIERPTSBtdXRhdGlvbiBzcHlpbmcgaXMgbmVlZGVkLi4uKVxuXHRcdFx0Ly8gIHVzZSB0aGF0IGFzIHNpZ25hbCB0aGF0IHRoZSB1c2VyIGhhcyBpbnRlcmFjdGVkL2xlYXJuZWQgbGFuZ3VhZ2Ugc3RhdHVzIGl0ZW1zIHdvcmtcblx0XHRcdGlmICghdXNlckhhc0ludGVyYWN0ZWRXaXRoU3RhdHVzKSB7XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0XHRjb25zdCBob3ZlclRhcmdldCA9IHRhcmdldFdpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLXdvcmtiZW5jaCAuY29udGV4dC12aWV3Jyk7XG5cdFx0XHRcdGlmIChkb20uaXNIVE1MRWxlbWVudChob3ZlclRhcmdldCkpIHtcblx0XHRcdFx0XHRjb25zdCBvYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHtcblx0XHRcdFx0XHRcdGlmICh0YXJnZXRXaW5kb3cuZG9jdW1lbnQuY29udGFpbnModGhpcy5fY29tYmluZWRFbnRyeVRvb2x0aXApKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2ludGVyYWN0aW9uQ291bnRlci5pbmNyZW1lbnQoKTtcblx0XHRcdFx0XHRcdFx0b2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdG9ic2VydmVyLm9ic2VydmUoaG92ZXJUYXJnZXQsIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xuXHRcdFx0XHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gb2JzZXJ2ZXIuZGlzY29ubmVjdCgpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBkZWRpY2F0ZWQgc3RhdHVzIGJhciBpdGVtcyBhcmUgc2hvd3MgYXMtaXMgaW4gdGhlIHN0YXR1cyBiYXJcblx0XHRjb25zdCBuZXdEZWRpY2F0ZWRFbnRyaWVzID0gbmV3IE1hcDxzdHJpbmcsIElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yPigpO1xuXHRcdGZvciAoY29uc3Qgc3RhdHVzIG9mIG1vZGVsLmRlZGljYXRlZCkge1xuXHRcdFx0Y29uc3QgcHJvcHMgPSBMYW5ndWFnZVN0YXR1cy5fYXNTdGF0dXNiYXJFbnRyeShzdGF0dXMpO1xuXG5cdFx0XHQvLyBGaXJzdCBjaGVjayBpZiB3ZSBhbHJlYWR5IHByb2Nlc3NlZCBhIHN0YXR1cyB3aXRoIHRoaXMgaWQgaW4gdGhlIGN1cnJlbnQgdXBkYXRlXG5cdFx0XHQvLyAoY2FuIGhhcHBlbiB3aGVuIGR1cGxpY2F0ZSBzdGF0dXMgaWRzIGV4aXN0IG1vbWVudGFyaWx5IGR1cmluZyBzdGF0dXMgdXBkYXRlcykuXG5cdFx0XHQvLyBBbHNvIGNoZWNrIHRoZSBwcmV2aW91cyBlbnRyaWVzIG1hcCBmb3IgYW4gZXhpc3RpbmcgYWNjZXNzb3IgdG8gcmV1c2UuXG5cdFx0XHRsZXQgZW50cnkgPSBuZXdEZWRpY2F0ZWRFbnRyaWVzLmdldChzdGF0dXMuaWQpID8/IHRoaXMuX2RlZGljYXRlZEVudHJpZXMuZ2V0KHN0YXR1cy5pZCk7XG5cdFx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRcdGVudHJ5ID0gdGhpcy5fc3RhdHVzQmFyU2VydmljZS5hZGRFbnRyeShwcm9wcywgc3RhdHVzLmlkLCBTdGF0dXNiYXJBbGlnbm1lbnQuUklHSFQsIHsgbG9jYXRpb246IHsgaWQ6ICdzdGF0dXMuZWRpdG9yLm1vZGUnLCBwcmlvcml0eTogMTAwLjEgfSwgYWxpZ25tZW50OiBTdGF0dXNiYXJBbGlnbm1lbnQuUklHSFQgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlbnRyeS51cGRhdGUocHJvcHMpO1xuXHRcdFx0XHR0aGlzLl9kZWRpY2F0ZWRFbnRyaWVzLmRlbGV0ZShzdGF0dXMuaWQpO1xuXHRcdFx0fVxuXHRcdFx0bmV3RGVkaWNhdGVkRW50cmllcy5zZXQoc3RhdHVzLmlkLCBlbnRyeSk7XG5cdFx0fVxuXHRcdGRpc3Bvc2UodGhpcy5fZGVkaWNhdGVkRW50cmllcy52YWx1ZXMoKSk7XG5cdFx0dGhpcy5fZGVkaWNhdGVkRW50cmllcyA9IG5ld0RlZGljYXRlZEVudHJpZXM7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJTdGF0dXMoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgc3RhdHVzOiBJTGFuZ3VhZ2VTdGF0dXMsIHNob3dTZXZlcml0eTogYm9vbGVhbiwgaXNQaW5uZWQ6IGJvb2xlYW4sIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiBIVE1MRWxlbWVudCB7XG5cblx0XHRjb25zdCBwYXJlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRwYXJlbnQuY2xhc3NMaXN0LmFkZCgnaG92ZXItbGFuZ3VhZ2Utc3RhdHVzJyk7XG5cblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQocGFyZW50KTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcmVudC5yZW1vdmUoKSkpO1xuXG5cdFx0Y29uc3Qgc2V2ZXJpdHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRzZXZlcml0eS5jbGFzc0xpc3QuYWRkKCdzZXZlcml0eScsIGBzZXYke3N0YXR1cy5zZXZlcml0eX1gKTtcblx0XHRzZXZlcml0eS5jbGFzc0xpc3QudG9nZ2xlKCdzaG93Jywgc2hvd1NldmVyaXR5KTtcblx0XHRjb25zdCBzZXZlcml0eVRleHQgPSBMYW5ndWFnZVN0YXR1cy5fc2V2ZXJpdHlUb1NpbmdsZUNvZGljb24oc3RhdHVzLnNldmVyaXR5KTtcblx0XHRkb20uYXBwZW5kKHNldmVyaXR5LCAuLi5yZW5kZXJMYWJlbFdpdGhJY29ucyhzZXZlcml0eVRleHQpKTtcblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQoc2V2ZXJpdHkpO1xuXG5cdFx0Y29uc3QgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZWxlbWVudCcpO1xuXHRcdHBhcmVudC5hcHBlbmRDaGlsZChlbGVtZW50KTtcblxuXHRcdGNvbnN0IGxlZnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRsZWZ0LmNsYXNzTGlzdC5hZGQoJ2xlZnQnKTtcblx0XHRlbGVtZW50LmFwcGVuZENoaWxkKGxlZnQpO1xuXG5cdFx0Y29uc3QgbGFiZWwgPSB0eXBlb2Ygc3RhdHVzLmxhYmVsID09PSAnc3RyaW5nJyA/IHN0YXR1cy5sYWJlbCA6IHN0YXR1cy5sYWJlbC52YWx1ZTtcblx0XHRkb20uYXBwZW5kKGxlZnQsIC4uLnJlbmRlckxhYmVsV2l0aEljb25zKGNvbXB1dGVUZXh0KGxhYmVsLCBzdGF0dXMuYnVzeSkpKTtcblxuXHRcdHRoaXMuX3JlbmRlclRleHRQbHVzKGxlZnQsIHN0YXR1cy5kZXRhaWwsIHN0b3JlKTtcblxuXHRcdGNvbnN0IHJpZ2h0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0cmlnaHQuY2xhc3NMaXN0LmFkZCgncmlnaHQnKTtcblx0XHRlbGVtZW50LmFwcGVuZENoaWxkKHJpZ2h0KTtcblxuXHRcdC8vIC0tIGNvbW1hbmQgKGlmIGF2YWlsYWJsZSlcblx0XHRjb25zdCB7IGNvbW1hbmQgfSA9IHN0YXR1cztcblx0XHRpZiAoY29tbWFuZCkge1xuXHRcdFx0c3RvcmUuYWRkKG5ldyBMaW5rKHJpZ2h0LCB7XG5cdFx0XHRcdGxhYmVsOiBjb21tYW5kLnRpdGxlLFxuXHRcdFx0XHR0aXRsZTogY29tbWFuZC50b29sdGlwLFxuXHRcdFx0XHRocmVmOiBVUkkuZnJvbSh7XG5cdFx0XHRcdFx0c2NoZW1lOiAnY29tbWFuZCcsIHBhdGg6IGNvbW1hbmQuaWQsIHF1ZXJ5OiBjb21tYW5kLmFyZ3VtZW50cyAmJiBKU09OLnN0cmluZ2lmeShjb21tYW5kLmFyZ3VtZW50cylcblx0XHRcdFx0fSkudG9TdHJpbmcoKVxuXHRcdFx0fSwgeyBob3ZlckRlbGVnYXRlOiBuYXRpdmVIb3ZlckRlbGVnYXRlIH0sIHRoaXMuX2hvdmVyU2VydmljZSwgdGhpcy5fb3BlbmVyU2VydmljZSkpO1xuXHRcdH1cblxuXHRcdC8vIC0tIHBpblxuXHRcdGNvbnN0IGFjdGlvbkJhciA9IG5ldyBBY3Rpb25CYXIocmlnaHQsIHsgaG92ZXJEZWxlZ2F0ZTogbmF0aXZlSG92ZXJEZWxlZ2F0ZSB9KTtcblx0XHRjb25zdCBhY3Rpb25MYWJlbDogc3RyaW5nID0gaXNQaW5uZWQgPyBsb2NhbGl6ZSgndW5waW4nLCBcIlJlbW92ZSBmcm9tIFN0YXR1cyBCYXJcIikgOiBsb2NhbGl6ZSgncGluJywgXCJBZGQgdG8gU3RhdHVzIEJhclwiKTtcblx0XHRhY3Rpb25CYXIuc2V0QXJpYUxhYmVsKGFjdGlvbkxhYmVsKTtcblx0XHRzdG9yZS5hZGQoYWN0aW9uQmFyKTtcblx0XHRsZXQgYWN0aW9uOiBBY3Rpb247XG5cdFx0aWYgKCFpc1Bpbm5lZCkge1xuXHRcdFx0YWN0aW9uID0gbmV3IEFjdGlvbigncGluJywgYWN0aW9uTGFiZWwsIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnBpbiksIHRydWUsICgpID0+IHtcblx0XHRcdFx0dGhpcy5fZGVkaWNhdGVkLmFkZChzdGF0dXMuaWQpO1xuXHRcdFx0XHR0aGlzLl9zdGF0dXNCYXJTZXJ2aWNlLnVwZGF0ZUVudHJ5VmlzaWJpbGl0eShzdGF0dXMuaWQsIHRydWUpO1xuXHRcdFx0XHR0aGlzLl91cGRhdGUoKTtcblx0XHRcdFx0dGhpcy5fc3RvcmVTdGF0ZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFjdGlvbiA9IG5ldyBBY3Rpb24oJ3VucGluJywgYWN0aW9uTGFiZWwsIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnBpbm5lZCksIHRydWUsICgpID0+IHtcblx0XHRcdFx0dGhpcy5fZGVkaWNhdGVkLmRlbGV0ZShzdGF0dXMuaWQpO1xuXHRcdFx0XHR0aGlzLl9zdGF0dXNCYXJTZXJ2aWNlLnVwZGF0ZUVudHJ5VmlzaWJpbGl0eShzdGF0dXMuaWQsIGZhbHNlKTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlKCk7XG5cdFx0XHRcdHRoaXMuX3N0b3JlU3RhdGUoKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRhY3Rpb25CYXIucHVzaChhY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdHN0b3JlLmFkZChhY3Rpb24pO1xuXG5cdFx0cmV0dXJuIHBhcmVudDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9zZXZlcml0eVRvQ29tYm9Db2RpY29uKHNldjogU2V2ZXJpdHkpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAoc2V2KSB7XG5cdFx0XHRjYXNlIFNldmVyaXR5LkVycm9yOiByZXR1cm4gJyQoYnJhY2tldC1lcnJvciknO1xuXHRcdFx0Y2FzZSBTZXZlcml0eS5XYXJuaW5nOiByZXR1cm4gJyQoYnJhY2tldC1kb3QpJztcblx0XHRcdGRlZmF1bHQ6IHJldHVybiAnJChicmFja2V0KSc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3NldmVyaXR5VG9TaW5nbGVDb2RpY29uKHNldjogU2V2ZXJpdHkpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAoc2V2KSB7XG5cdFx0XHRjYXNlIFNldmVyaXR5LkVycm9yOiByZXR1cm4gJyQoZXJyb3IpJztcblx0XHRcdGNhc2UgU2V2ZXJpdHkuV2FybmluZzogcmV0dXJuICckKGluZm8pJztcblx0XHRcdGRlZmF1bHQ6IHJldHVybiAnJChjaGVjayknO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlclRleHRQbHVzKHRhcmdldDogSFRNTEVsZW1lbnQsIHRleHQ6IHN0cmluZywgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IHZvaWQge1xuXHRcdGxldCBkaWRSZW5kZXJTZXBhcmF0b3IgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IG5vZGUgb2YgcGFyc2VMaW5rZWRUZXh0KHRleHQpLm5vZGVzKSB7XG5cdFx0XHRpZiAoIWRpZFJlbmRlclNlcGFyYXRvcikge1xuXHRcdFx0XHRkb20uYXBwZW5kKHRhcmdldCwgZG9tLiQoJ3NwYW4uc2VwYXJhdG9yJykpO1xuXHRcdFx0XHRkaWRSZW5kZXJTZXBhcmF0b3IgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGVvZiBub2RlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRjb25zdCBwYXJ0cyA9IHJlbmRlckxhYmVsV2l0aEljb25zKG5vZGUpO1xuXHRcdFx0XHRkb20uYXBwZW5kKHRhcmdldCwgLi4ucGFydHMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c3RvcmUuYWRkKG5ldyBMaW5rKHRhcmdldCwgbm9kZSwgdW5kZWZpbmVkLCB0aGlzLl9ob3ZlclNlcnZpY2UsIHRoaXMuX29wZW5lclNlcnZpY2UpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfYWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uKHN0YXR1czogSUxhbmd1YWdlU3RhdHVzKTogSUFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbiB7XG5cdFx0aWYgKHN0YXR1cy5hY2Nlc3NpYmlsaXR5SW5mbykge1xuXHRcdFx0cmV0dXJuIHN0YXR1cy5hY2Nlc3NpYmlsaXR5SW5mbztcblx0XHR9XG5cdFx0Y29uc3QgdGV4dFZhbHVlID0gdHlwZW9mIHN0YXR1cy5sYWJlbCA9PT0gJ3N0cmluZycgPyBzdGF0dXMubGFiZWwgOiBzdGF0dXMubGFiZWwudmFsdWU7XG5cdFx0aWYgKHN0YXR1cy5kZXRhaWwpIHtcblx0XHRcdHJldHVybiB7IGxhYmVsOiBsb2NhbGl6ZSgnYXJpYS4xJywgJ3swfSwgezF9JywgdGV4dFZhbHVlLCBzdGF0dXMuZGV0YWlsKSB9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4geyBsYWJlbDogbG9jYWxpemUoJ2FyaWEuMicsICd7MH0nLCB0ZXh0VmFsdWUpIH07XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tXG5cblx0cHJpdmF0ZSBzdGF0aWMgX2FzU3RhdHVzYmFyRW50cnkoaXRlbTogSUxhbmd1YWdlU3RhdHVzKTogSVN0YXR1c2JhckVudHJ5IHtcblxuXHRcdGxldCBraW5kOiBTdGF0dXNiYXJFbnRyeUtpbmQgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGl0ZW0uc2V2ZXJpdHkgPT09IFNldmVyaXR5Lldhcm5pbmcpIHtcblx0XHRcdGtpbmQgPSAnd2FybmluZyc7XG5cdFx0fSBlbHNlIGlmIChpdGVtLnNldmVyaXR5ID09PSBTZXZlcml0eS5FcnJvcikge1xuXHRcdFx0a2luZCA9ICdlcnJvcic7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dFZhbHVlID0gdHlwZW9mIGl0ZW0ubGFiZWwgPT09ICdzdHJpbmcnID8gaXRlbS5sYWJlbCA6IGl0ZW0ubGFiZWwuc2hvcnRWYWx1ZTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lOiBsb2NhbGl6ZSgnbmFtZS5wYXR0ZXJuJywgJ3swfSAoTGFuZ3VhZ2UgU3RhdHVzKScsIGl0ZW0ubmFtZSksXG5cdFx0XHR0ZXh0OiBjb21wdXRlVGV4dCh0ZXh0VmFsdWUsIGl0ZW0uYnVzeSksXG5cdFx0XHRhcmlhTGFiZWw6IExhbmd1YWdlU3RhdHVzLl9hY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24oaXRlbSkubGFiZWwsXG5cdFx0XHRyb2xlOiBpdGVtLmFjY2Vzc2liaWxpdHlJbmZvPy5yb2xlLFxuXHRcdFx0dG9vbHRpcDogaXRlbS5jb21tYW5kPy50b29sdGlwIHx8IG5ldyBNYXJrZG93blN0cmluZyhpdGVtLmRldGFpbCwgeyBpc1RydXN0ZWQ6IHRydWUsIHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pLFxuXHRcdFx0a2luZCxcblx0XHRcdGNvbW1hbmQ6IGl0ZW0uY29tbWFuZFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlc2V0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuaW5sYXlIaW50cy5SZXNldCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdyZXNldCcsIFwiUmVzZXQgTGFuZ3VhZ2UgU3RhdHVzIEludGVyYWN0aW9uIENvdW50ZXJcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGFjY2Vzc29yLmdldChJU3RvcmFnZVNlcnZpY2UpLnJlbW92ZSgnbGFuZ3VhZ2VTdGF0dXMuaW50ZXJhY3RDb3VudCcsIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0fVxufVxuXG5mdW5jdGlvbiBjb21wdXRlVGV4dCh0ZXh0OiBzdHJpbmcsIGxvYWRpbmc6IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRyZXR1cm4gam9pblN0cmluZ3MoW3RleHQgIT09ICcnICYmIHRleHQsIGxvYWRpbmcgJiYgJyQobG9hZGluZ35zcGluKSddLCAnXFx1MDBBMFxcdTAwQTAnKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUNyQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLFlBQVksaUJBQWlCLFNBQVMsb0JBQW9CO0FBQ25FLE9BQU8sY0FBYztBQUNyQixTQUFTLHFCQUFrQztBQUMzQyxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQTBCLDhCQUE4QjtBQUN4RCxTQUFtRCxtQkFBbUIsb0JBQW9CLDBCQUE4QztBQUN4SSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFlBQVk7QUFDckIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLGNBQWM7QUFDdkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZUFBZTtBQUV4QixTQUFT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
