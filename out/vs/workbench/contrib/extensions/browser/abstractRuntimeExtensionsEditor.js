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
import { $, append, clearNode } from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Action, Separator } from "../../../../base/common/actions.js";
import { isNonEmptyArray } from "../../../../base/common/arrays.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { fromNow } from "../../../../base/common/date.js";
import { dispose } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import * as nls from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { getContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { ExtensionIdentifierMap } from "../../../../platform/extensions/common/extensions.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { WorkbenchList } from "../../../../platform/list/browser/listService.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { editorBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { Extensions, IExtensionFeaturesManagementService } from "../../../services/extensionManagement/common/extensionFeatures.js";
import { EnablementState } from "../../../services/extensionManagement/common/extensionManagement.js";
import { LocalWebWorkerRunningLocation } from "../../../services/extensions/common/extensionRunningLocation.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IExtensionsWorkbenchService } from "../common/extensions.js";
import { RuntimeExtensionsInput } from "../common/runtimeExtensionsInput.js";
import { errorIcon, warningIcon } from "./extensionsIcons.js";
import { ExtensionIconWidget } from "./extensionsWidgets.js";
import "./media/runtimeExtensionsEditor.css";
let AbstractRuntimeExtensionsEditor = class extends EditorPane {
  constructor(group, telemetryService, themeService, contextKeyService, _extensionsWorkbenchService, _extensionService, _notificationService, _contextMenuService, _instantiationService, storageService, _labelService, _environmentService, _clipboardService, _extensionFeaturesManagementService, _hoverService, _menuService) {
    super(AbstractRuntimeExtensionsEditor.ID, group, telemetryService, themeService, storageService);
    this.contextKeyService = contextKeyService;
    this._extensionsWorkbenchService = _extensionsWorkbenchService;
    this._extensionService = _extensionService;
    this._notificationService = _notificationService;
    this._contextMenuService = _contextMenuService;
    this._instantiationService = _instantiationService;
    this._labelService = _labelService;
    this._environmentService = _environmentService;
    this._clipboardService = _clipboardService;
    this._extensionFeaturesManagementService = _extensionFeaturesManagementService;
    this._hoverService = _hoverService;
    this._menuService = _menuService;
    this._list = null;
    this._elements = null;
    this._updateSoon = this._register(new RunOnceScheduler(() => this._updateExtensions(), 200));
    this._register(this._extensionService.onDidChangeExtensionsStatus(() => this._updateSoon.schedule()));
    this._register(this._extensionFeaturesManagementService.onDidChangeAccessData(() => this._updateSoon.schedule()));
    this._updateExtensions();
  }
  async _updateExtensions() {
    this._elements = await this._resolveExtensions();
    this._list?.splice(0, this._list.length, this._elements);
  }
  async _resolveExtensions() {
    await this._extensionService.whenInstalledExtensionsRegistered();
    const extensionsDescriptions = this._extensionService.extensions.filter((extension) => {
      return Boolean(extension.main) || Boolean(extension.browser);
    });
    const marketplaceMap = new ExtensionIdentifierMap();
    const marketPlaceExtensions = await this._extensionsWorkbenchService.queryLocal();
    for (const extension of marketPlaceExtensions) {
      marketplaceMap.set(extension.identifier.id, extension);
    }
    const statusMap = this._extensionService.getExtensionsStatus();
    const segments = new ExtensionIdentifierMap();
    const profileInfo = this._getProfileInfo();
    if (profileInfo) {
      let currentStartTime = profileInfo.startTime;
      for (let i = 0, len = profileInfo.deltas.length; i < len; i++) {
        const id = profileInfo.ids[i];
        const delta = profileInfo.deltas[i];
        let extensionSegments = segments.get(id);
        if (!extensionSegments) {
          extensionSegments = [];
          segments.set(id, extensionSegments);
        }
        extensionSegments.push(currentStartTime);
        currentStartTime = currentStartTime + delta;
        extensionSegments.push(currentStartTime);
      }
    }
    let result = [];
    for (let i = 0, len = extensionsDescriptions.length; i < len; i++) {
      const extensionDescription = extensionsDescriptions[i];
      let extProfileInfo = null;
      if (profileInfo) {
        const extensionSegments = segments.get(extensionDescription.identifier) || [];
        let extensionTotalTime = 0;
        for (let j = 0, lenJ = extensionSegments.length / 2; j < lenJ; j++) {
          const startTime = extensionSegments[2 * j];
          const endTime = extensionSegments[2 * j + 1];
          extensionTotalTime += endTime - startTime;
        }
        extProfileInfo = {
          segments: extensionSegments,
          totalTime: extensionTotalTime
        };
      }
      result[i] = {
        originalIndex: i,
        description: extensionDescription,
        marketplaceInfo: marketplaceMap.get(extensionDescription.identifier),
        status: statusMap[extensionDescription.identifier.value],
        profileInfo: extProfileInfo || void 0,
        unresponsiveProfile: this._getUnresponsiveProfile(extensionDescription.identifier)
      };
    }
    result = result.filter((element) => element.status.activationStarted);
    const isUnresponsive = (extension) => extension.unresponsiveProfile === profileInfo;
    const profileTime = (extension) => extension.profileInfo?.totalTime ?? 0;
    const activationTime = (extension) => (extension.status.activationTimes?.codeLoadingTime ?? 0) + (extension.status.activationTimes?.activateCallTime ?? 0);
    result = result.sort((a, b) => {
      if (isUnresponsive(a) || isUnresponsive(b)) {
        return +isUnresponsive(b) - +isUnresponsive(a);
      } else if (profileTime(a) || profileTime(b)) {
        return profileTime(b) - profileTime(a);
      } else if (activationTime(a) || activationTime(b)) {
        return activationTime(b) - activationTime(a);
      }
      return a.originalIndex - b.originalIndex;
    });
    return result;
  }
  createEditor(parent) {
    parent.classList.add("runtime-extensions-editor");
    const TEMPLATE_ID = "runtimeExtensionElementTemplate";
    const delegate = new class {
      getHeight(element) {
        return 70;
      }
      getTemplateId(element) {
        return TEMPLATE_ID;
      }
    }();
    const renderer = {
      templateId: TEMPLATE_ID,
      renderTemplate: (root) => {
        const element = append(root, $(".extension"));
        const iconContainer = append(element, $(".icon-container"));
        const extensionIconWidget = this._instantiationService.createInstance(ExtensionIconWidget, iconContainer);
        const desc = append(element, $("div.desc"));
        const headerContainer = append(desc, $(".header-container"));
        const header = append(headerContainer, $(".header"));
        const name = append(header, $("div.name"));
        const version = append(header, $("span.version"));
        const msgContainer = append(desc, $("div.msg"));
        const actionbar = new ActionBar(desc);
        const listener = actionbar.onDidRun(({ error }) => error && this._notificationService.error(error));
        const timeContainer = append(element, $(".time"));
        const activationTime = append(timeContainer, $("div.activation-time"));
        const profileTime = append(timeContainer, $("div.profile-time"));
        const disposables = [extensionIconWidget, actionbar, listener];
        return {
          root,
          element,
          name,
          version,
          actionbar,
          activationTime,
          profileTime,
          msgContainer,
          set extension(extension) {
            extensionIconWidget.extension = extension || null;
          },
          disposables,
          elementDisposables: []
        };
      },
      renderElement: (element, index, data) => {
        data.elementDisposables = dispose(data.elementDisposables);
        data.extension = element.marketplaceInfo;
        data.root.classList.toggle("odd", index % 2 === 1);
        data.name.textContent = (element.marketplaceInfo?.displayName || element.description.identifier.value).substr(0, 50);
        data.version.textContent = element.description.version;
        const activationTimes = element.status.activationTimes;
        if (activationTimes) {
          const syncTime = activationTimes.codeLoadingTime + activationTimes.activateCallTime;
          data.activationTime.textContent = activationTimes.activationReason.startup ? `Startup Activation: ${syncTime}ms` : `Activation: ${syncTime}ms`;
        } else {
          data.activationTime.textContent = `Activating...`;
        }
        data.actionbar.clear();
        const slowExtensionAction = this._createSlowExtensionAction(element);
        if (slowExtensionAction) {
          data.actionbar.push(slowExtensionAction, { icon: false, label: true });
        }
        if (isNonEmptyArray(element.status.runtimeErrors)) {
          const reportExtensionIssueAction = this._createReportExtensionIssueAction(element);
          if (reportExtensionIssueAction) {
            data.actionbar.push(reportExtensionIssueAction, { icon: false, label: true });
          }
        }
        let title;
        if (activationTimes) {
          const activationId = activationTimes.activationReason.extensionId.value;
          const activationEvent = activationTimes.activationReason.activationEvent;
          if (activationEvent === "*") {
            title = nls.localize({
              key: "starActivation",
              comment: [
                "{0} will be an extension identifier"
              ]
            }, "Activated by {0} on start-up", activationId);
          } else if (/^workspaceContains:/.test(activationEvent)) {
            const fileNameOrGlob = activationEvent.substr("workspaceContains:".length);
            if (fileNameOrGlob.indexOf("*") >= 0 || fileNameOrGlob.indexOf("?") >= 0) {
              title = nls.localize({
                key: "workspaceContainsGlobActivation",
                comment: [
                  "{0} will be a glob pattern",
                  "{1} will be an extension identifier"
                ]
              }, "Activated by {1} because a file matching {0} exists in your workspace", fileNameOrGlob, activationId);
            } else {
              title = nls.localize({
                key: "workspaceContainsFileActivation",
                comment: [
                  "{0} will be a file name",
                  "{1} will be an extension identifier"
                ]
              }, "Activated by {1} because file {0} exists in your workspace", fileNameOrGlob, activationId);
            }
          } else if (/^workspaceContainsTimeout:/.test(activationEvent)) {
            const glob = activationEvent.substr("workspaceContainsTimeout:".length);
            title = nls.localize({
              key: "workspaceContainsTimeout",
              comment: [
                "{0} will be a glob pattern",
                "{1} will be an extension identifier"
              ]
            }, "Activated by {1} because searching for {0} took too long", glob, activationId);
          } else if (activationEvent === "onStartupFinished") {
            title = nls.localize({
              key: "startupFinishedActivation",
              comment: [
                "This refers to an extension. {0} will be an activation event."
              ]
            }, "Activated by {0} after start-up finished", activationId);
          } else if (/^onLanguage:/.test(activationEvent)) {
            const language = activationEvent.substr("onLanguage:".length);
            title = nls.localize("languageActivation", "Activated by {1} because you opened a {0} file", language, activationId);
          } else {
            title = nls.localize({
              key: "workspaceGenericActivation",
              comment: [
                "{0} will be an activation event, like e.g. 'language:typescript', 'debug', etc.",
                "{1} will be an extension identifier"
              ]
            }, "Activated by {1} on {0}", activationEvent, activationId);
          }
        } else {
          title = nls.localize("extensionActivating", "Extension is activating...");
        }
        data.elementDisposables.push(this._hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.activationTime, title));
        clearNode(data.msgContainer);
        if (this._getUnresponsiveProfile(element.description.identifier)) {
          const el = $("span", void 0, ...renderLabelWithIcons(` $(alert) Unresponsive`));
          const extensionHostFreezTitle = nls.localize("unresponsive.title", "Extension has caused the extension host to freeze.");
          data.elementDisposables.push(this._hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), el, extensionHostFreezTitle));
          data.msgContainer.appendChild(el);
        }
        if (isNonEmptyArray(element.status.runtimeErrors)) {
          const el = $("span", void 0, ...renderLabelWithIcons(`$(bug) ${nls.localize("errors", "{0} uncaught errors", element.status.runtimeErrors.length)}`));
          data.msgContainer.appendChild(el);
        }
        if (element.status.messages && element.status.messages.length > 0) {
          const el = $("span", void 0, ...renderLabelWithIcons(`$(alert) ${element.status.messages[0].message}`));
          data.msgContainer.appendChild(el);
        }
        let extraLabel = null;
        if (element.status.runningLocation && element.status.runningLocation.equals(new LocalWebWorkerRunningLocation(0))) {
          extraLabel = `$(globe) web worker`;
        } else if (element.description.extensionLocation.scheme === Schemas.vscodeRemote) {
          const hostLabel = this._labelService.getHostLabel(Schemas.vscodeRemote, this._environmentService.remoteAuthority);
          if (hostLabel) {
            extraLabel = `$(remote) ${hostLabel}`;
          } else {
            extraLabel = `$(remote) ${element.description.extensionLocation.authority}`;
          }
        } else if (element.status.runningLocation && element.status.runningLocation.affinity > 0) {
          extraLabel = element.status.runningLocation instanceof LocalWebWorkerRunningLocation ? `$(globe) web worker ${element.status.runningLocation.affinity + 1}` : `$(server-process) local process ${element.status.runningLocation.affinity + 1}`;
        }
        if (extraLabel) {
          const el = $("span", void 0, ...renderLabelWithIcons(extraLabel));
          data.msgContainer.appendChild(el);
        }
        const features = Registry.as(Extensions.ExtensionFeaturesRegistry).getExtensionFeatures();
        for (const feature of features) {
          const accessData = this._extensionFeaturesManagementService.getAccessData(element.description.identifier, feature.id);
          if (accessData) {
            const status = accessData?.current?.status;
            if (status) {
              data.msgContainer.appendChild($("span", void 0, `${feature.label}: `));
              data.msgContainer.appendChild($("span", void 0, ...renderLabelWithIcons(`$(${status.severity === Severity.Error ? errorIcon.id : warningIcon.id}) ${status.message}`)));
            }
            if (accessData?.accessTimes.length > 0) {
              const element2 = $("span", void 0, `${nls.localize("requests count", "{0} Usage: {1} Requests", feature.label, accessData.accessTimes.length)}${accessData.current ? nls.localize("session requests count", ", {0} Requests (Session)", accessData.current.accessTimes.length) : ""}`);
              if (accessData.current) {
                const title2 = nls.localize("requests count title", "Last request was {0}.", fromNow(accessData.current.lastAccessed, true, true));
                data.elementDisposables.push(this._hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), element2, title2));
              }
              data.msgContainer.appendChild(element2);
            }
          }
        }
        if (element.profileInfo) {
          data.profileTime.textContent = `Profile: ${(element.profileInfo.totalTime / 1e3).toFixed(2)}ms`;
        } else {
          data.profileTime.textContent = "";
        }
      },
      disposeTemplate: (data) => {
        data.disposables = dispose(data.disposables);
        data.elementDisposables = dispose(data.elementDisposables);
      }
    };
    this._list = this._register(this._instantiationService.createInstance(
      WorkbenchList,
      "RuntimeExtensions",
      parent,
      delegate,
      [renderer],
      {
        multipleSelectionSupport: false,
        setRowLineHeight: false,
        horizontalScrolling: false,
        overrideStyles: {
          listBackground: editorBackground
        },
        accessibilityProvider: new class {
          getWidgetAriaLabel() {
            return nls.localize("runtimeExtensions", "Runtime Extensions");
          }
          getAriaLabel(element) {
            return element.description.name;
          }
        }()
      }
    ));
    this._list.splice(0, this._list.length, this._elements || void 0);
    this._register(this._list.onContextMenu((e) => {
      if (!e.element) {
        return;
      }
      const actions = [];
      actions.push(new Action(
        "runtimeExtensionsEditor.action.copyId",
        nls.localize("copy id", "Copy id ({0})", e.element.description.identifier.value),
        void 0,
        true,
        () => {
          this._clipboardService.writeText(e.element.description.identifier.value);
        }
      ));
      const reportExtensionIssueAction = this._createReportExtensionIssueAction(e.element);
      if (reportExtensionIssueAction) {
        actions.push(reportExtensionIssueAction);
      }
      actions.push(new Separator());
      if (e.element.marketplaceInfo) {
        actions.push(new Action("runtimeExtensionsEditor.action.disableWorkspace", nls.localize("disable workspace", "Disable (Workspace)"), void 0, true, () => this._extensionsWorkbenchService.setEnablement(e.element.marketplaceInfo, EnablementState.DisabledWorkspace)));
        actions.push(new Action("runtimeExtensionsEditor.action.disable", nls.localize("disable", "Disable"), void 0, true, () => this._extensionsWorkbenchService.setEnablement(e.element.marketplaceInfo, EnablementState.DisabledGlobally)));
      }
      actions.push(new Separator());
      const menuActions = this._menuService.getMenuActions(MenuId.ExtensionEditorContextMenu, this.contextKeyService);
      actions.push(...getContextMenuActions(menuActions).secondary);
      this._contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => actions
      });
    }));
  }
  layout(dimension) {
    this._list?.layout(dimension.height);
  }
};
AbstractRuntimeExtensionsEditor.ID = "workbench.editor.runtimeExtensions";
AbstractRuntimeExtensionsEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IExtensionsWorkbenchService),
  __decorateParam(5, IExtensionService),
  __decorateParam(6, INotificationService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, IStorageService),
  __decorateParam(10, ILabelService),
  __decorateParam(11, IWorkbenchEnvironmentService),
  __decorateParam(12, IClipboardService),
  __decorateParam(13, IExtensionFeaturesManagementService),
  __decorateParam(14, IHoverService),
  __decorateParam(15, IMenuService)
], AbstractRuntimeExtensionsEditor);
class ShowRuntimeExtensionsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.showRuntimeExtensions",
      title: nls.localize2("showRuntimeExtensions", "Show Running Extensions"),
      category: Categories.Developer,
      f1: true,
      menu: {
        id: MenuId.ViewContainerTitle,
        when: ContextKeyExpr.equals("viewContainer", "workbench.view.extensions"),
        group: "2_enablement",
        order: 3
      }
    });
  }
  async run(accessor) {
    await accessor.get(IEditorService).openEditor(RuntimeExtensionsInput.instance, { pinned: true });
  }
}
export {
  AbstractRuntimeExtensionsEditor,
  ShowRuntimeExtensionsAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXGJyb3dzZXJcXGFic3RyYWN0UnVudGltZUV4dGVuc2lvbnNFZGl0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyAkLCBEaW1lbnNpb24sIGFwcGVuZCwgY2xlYXJOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyByZW5kZXJMYWJlbFdpdGhJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBJTGlzdFJlbmRlcmVyLCBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBpc05vbkVtcHR5QXJyYXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGZyb21Ob3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kYXRlLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBnZXRDb250ZXh0TWVudUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgSU1lbnVTZXJ2aWNlLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIsIEV4dGVuc2lvbklkZW50aWZpZXJNYXAsIElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGVkaXRvckJhY2tncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yUGFuZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UsIElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgRW5hYmxlbWVudFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBMb2NhbFdlYldvcmtlclJ1bm5pbmdMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uSG9zdFByb2ZpbGUsIElFeHRlbnNpb25TZXJ2aWNlLCBJRXh0ZW5zaW9uc1N0YXR1cyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbiwgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgUnVudGltZUV4dGVuc2lvbnNJbnB1dCB9IGZyb20gJy4uL2NvbW1vbi9ydW50aW1lRXh0ZW5zaW9uc0lucHV0LmpzJztcbmltcG9ydCB7IGVycm9ySWNvbiwgd2FybmluZ0ljb24gfSBmcm9tICcuL2V4dGVuc2lvbnNJY29ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JY29uV2lkZ2V0IH0gZnJvbSAnLi9leHRlbnNpb25zV2lkZ2V0cy5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvcnVudGltZUV4dGVuc2lvbnNFZGl0b3IuY3NzJztcblxuaW50ZXJmYWNlIElFeHRlbnNpb25Qcm9maWxlSW5mb3JtYXRpb24ge1xuXHQvKipcblx0ICogc2VnbWVudCB3aGVuIHRoZSBleHRlbnNpb24gd2FzIHJ1bm5pbmcuXG5cdCAqIDIqaSA9IHNlZ21lbnQgc3RhcnQgdGltZVxuXHQgKiAyKmkrMSA9IHNlZ21lbnQgZW5kIHRpbWVcblx0ICovXG5cdHNlZ21lbnRzOiBudW1iZXJbXTtcblx0LyoqXG5cdCAqIHRvdGFsIHRpbWUgd2hlbiB0aGUgZXh0ZW5zaW9uIHdhcyBydW5uaW5nLlxuXHQgKiAoc3VtIG9mIGFsbCBzZWdtZW50IGxlbmd0aHMpLlxuXHQgKi9cblx0dG90YWxUaW1lOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJ1bnRpbWVFeHRlbnNpb24ge1xuXHRvcmlnaW5hbEluZGV4OiBudW1iZXI7XG5cdGRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cdG1hcmtldHBsYWNlSW5mbzogSUV4dGVuc2lvbiB8IHVuZGVmaW5lZDtcblx0c3RhdHVzOiBJRXh0ZW5zaW9uc1N0YXR1cztcblx0cHJvZmlsZUluZm8/OiBJRXh0ZW5zaW9uUHJvZmlsZUluZm9ybWF0aW9uO1xuXHR1bnJlc3BvbnNpdmVQcm9maWxlPzogSUV4dGVuc2lvbkhvc3RQcm9maWxlO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RSdW50aW1lRXh0ZW5zaW9uc0VkaXRvciBleHRlbmRzIEVkaXRvclBhbmUge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQ6IHN0cmluZyA9ICd3b3JrYmVuY2guZWRpdG9yLnJ1bnRpbWVFeHRlbnNpb25zJztcblxuXHRwcml2YXRlIF9saXN0OiBXb3JrYmVuY2hMaXN0PElSdW50aW1lRXh0ZW5zaW9uPiB8IG51bGw7XG5cdHByaXZhdGUgX2VsZW1lbnRzOiBJUnVudGltZUV4dGVuc2lvbltdIHwgbnVsbDtcblx0cHJpdmF0ZSBfdXBkYXRlU29vbjogUnVuT25jZVNjaGVkdWxlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRncm91cDogSUVkaXRvckdyb3VwLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJQ2xpcGJvYXJkU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSxcblx0XHRASUV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoQWJzdHJhY3RSdW50aW1lRXh0ZW5zaW9uc0VkaXRvci5JRCwgZ3JvdXAsIHRlbGVtZXRyeVNlcnZpY2UsIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fbGlzdCA9IG51bGw7XG5cdFx0dGhpcy5fZWxlbWVudHMgPSBudWxsO1xuXHRcdHRoaXMuX3VwZGF0ZVNvb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl91cGRhdGVFeHRlbnNpb25zKCksIDIwMCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZXh0ZW5zaW9uU2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvbnNTdGF0dXMoKCkgPT4gdGhpcy5fdXBkYXRlU29vbi5zY2hlZHVsZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZUFjY2Vzc0RhdGEoKCkgPT4gdGhpcy5fdXBkYXRlU29vbi5zY2hlZHVsZSgpKSk7XG5cdFx0dGhpcy5fdXBkYXRlRXh0ZW5zaW9ucygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF91cGRhdGVFeHRlbnNpb25zKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2VsZW1lbnRzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUV4dGVuc2lvbnMoKTtcblx0XHR0aGlzLl9saXN0Py5zcGxpY2UoMCwgdGhpcy5fbGlzdC5sZW5ndGgsIHRoaXMuX2VsZW1lbnRzKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVFeHRlbnNpb25zKCk6IFByb21pc2U8SVJ1bnRpbWVFeHRlbnNpb25bXT4ge1xuXHRcdC8vIFdlIG9ubHkgZGVhbCB3aXRoIGV4dGVuc2lvbnMgd2l0aCBzb3VyY2UgY29kZSFcblx0XHRhd2FpdCB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNEZXNjcmlwdGlvbnMgPSB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnMuZmlsdGVyKChleHRlbnNpb24pID0+IHtcblx0XHRcdHJldHVybiBCb29sZWFuKGV4dGVuc2lvbi5tYWluKSB8fCBCb29sZWFuKGV4dGVuc2lvbi5icm93c2VyKTtcblx0XHR9KTtcblx0XHRjb25zdCBtYXJrZXRwbGFjZU1hcCA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyTWFwPElFeHRlbnNpb24+KCk7XG5cdFx0Y29uc3QgbWFya2V0UGxhY2VFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5fZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UucXVlcnlMb2NhbCgpO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIG1hcmtldFBsYWNlRXh0ZW5zaW9ucykge1xuXHRcdFx0bWFya2V0cGxhY2VNYXAuc2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBleHRlbnNpb24pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXR1c01hcCA9IHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuZ2V0RXh0ZW5zaW9uc1N0YXR1cygpO1xuXG5cdFx0Ly8gZ3JvdXAgcHJvZmlsZSBzZWdtZW50cyBieSBleHRlbnNpb25cblx0XHRjb25zdCBzZWdtZW50cyA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyTWFwPG51bWJlcltdPigpO1xuXG5cdFx0Y29uc3QgcHJvZmlsZUluZm8gPSB0aGlzLl9nZXRQcm9maWxlSW5mbygpO1xuXHRcdGlmIChwcm9maWxlSW5mbykge1xuXHRcdFx0bGV0IGN1cnJlbnRTdGFydFRpbWUgPSBwcm9maWxlSW5mby5zdGFydFRpbWU7XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gcHJvZmlsZUluZm8uZGVsdGFzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGlkID0gcHJvZmlsZUluZm8uaWRzW2ldO1xuXHRcdFx0XHRjb25zdCBkZWx0YSA9IHByb2ZpbGVJbmZvLmRlbHRhc1tpXTtcblxuXHRcdFx0XHRsZXQgZXh0ZW5zaW9uU2VnbWVudHMgPSBzZWdtZW50cy5nZXQoaWQpO1xuXHRcdFx0XHRpZiAoIWV4dGVuc2lvblNlZ21lbnRzKSB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uU2VnbWVudHMgPSBbXTtcblx0XHRcdFx0XHRzZWdtZW50cy5zZXQoaWQsIGV4dGVuc2lvblNlZ21lbnRzKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGV4dGVuc2lvblNlZ21lbnRzLnB1c2goY3VycmVudFN0YXJ0VGltZSk7XG5cdFx0XHRcdGN1cnJlbnRTdGFydFRpbWUgPSBjdXJyZW50U3RhcnRUaW1lICsgZGVsdGE7XG5cdFx0XHRcdGV4dGVuc2lvblNlZ21lbnRzLnB1c2goY3VycmVudFN0YXJ0VGltZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IHJlc3VsdDogSVJ1bnRpbWVFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBleHRlbnNpb25zRGVzY3JpcHRpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25EZXNjcmlwdGlvbiA9IGV4dGVuc2lvbnNEZXNjcmlwdGlvbnNbaV07XG5cblx0XHRcdGxldCBleHRQcm9maWxlSW5mbzogSUV4dGVuc2lvblByb2ZpbGVJbmZvcm1hdGlvbiB8IG51bGwgPSBudWxsO1xuXHRcdFx0aWYgKHByb2ZpbGVJbmZvKSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvblNlZ21lbnRzID0gc2VnbWVudHMuZ2V0KGV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIpIHx8IFtdO1xuXHRcdFx0XHRsZXQgZXh0ZW5zaW9uVG90YWxUaW1lID0gMDtcblx0XHRcdFx0Zm9yIChsZXQgaiA9IDAsIGxlbkogPSBleHRlbnNpb25TZWdtZW50cy5sZW5ndGggLyAyOyBqIDwgbGVuSjsgaisrKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhcnRUaW1lID0gZXh0ZW5zaW9uU2VnbWVudHNbMiAqIGpdO1xuXHRcdFx0XHRcdGNvbnN0IGVuZFRpbWUgPSBleHRlbnNpb25TZWdtZW50c1syICogaiArIDFdO1xuXHRcdFx0XHRcdGV4dGVuc2lvblRvdGFsVGltZSArPSAoZW5kVGltZSAtIHN0YXJ0VGltZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZXh0UHJvZmlsZUluZm8gPSB7XG5cdFx0XHRcdFx0c2VnbWVudHM6IGV4dGVuc2lvblNlZ21lbnRzLFxuXHRcdFx0XHRcdHRvdGFsVGltZTogZXh0ZW5zaW9uVG90YWxUaW1lXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdHJlc3VsdFtpXSA9IHtcblx0XHRcdFx0b3JpZ2luYWxJbmRleDogaSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0XHRtYXJrZXRwbGFjZUluZm86IG1hcmtldHBsYWNlTWFwLmdldChleHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyKSxcblx0XHRcdFx0c3RhdHVzOiBzdGF0dXNNYXBbZXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZV0sXG5cdFx0XHRcdHByb2ZpbGVJbmZvOiBleHRQcm9maWxlSW5mbyB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdHVucmVzcG9uc2l2ZVByb2ZpbGU6IHRoaXMuX2dldFVucmVzcG9uc2l2ZVByb2ZpbGUoZXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllcilcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmVzdWx0ID0gcmVzdWx0LmZpbHRlcihlbGVtZW50ID0+IGVsZW1lbnQuc3RhdHVzLmFjdGl2YXRpb25TdGFydGVkKTtcblxuXHRcdC8vIGJ1YmJsZSB1cCBleHRlbnNpb25zIHRoYXQgaGF2ZSBjYXVzZWQgc2xvd25lc3NcblxuXHRcdGNvbnN0IGlzVW5yZXNwb25zaXZlID0gKGV4dGVuc2lvbjogSVJ1bnRpbWVFeHRlbnNpb24pOiBib29sZWFuID0+XG5cdFx0XHRleHRlbnNpb24udW5yZXNwb25zaXZlUHJvZmlsZSA9PT0gcHJvZmlsZUluZm87XG5cblx0XHRjb25zdCBwcm9maWxlVGltZSA9IChleHRlbnNpb246IElSdW50aW1lRXh0ZW5zaW9uKTogbnVtYmVyID0+XG5cdFx0XHRleHRlbnNpb24ucHJvZmlsZUluZm8/LnRvdGFsVGltZSA/PyAwO1xuXG5cdFx0Y29uc3QgYWN0aXZhdGlvblRpbWUgPSAoZXh0ZW5zaW9uOiBJUnVudGltZUV4dGVuc2lvbik6IG51bWJlciA9PlxuXHRcdFx0KGV4dGVuc2lvbi5zdGF0dXMuYWN0aXZhdGlvblRpbWVzPy5jb2RlTG9hZGluZ1RpbWUgPz8gMCkgK1xuXHRcdFx0KGV4dGVuc2lvbi5zdGF0dXMuYWN0aXZhdGlvblRpbWVzPy5hY3RpdmF0ZUNhbGxUaW1lID8/IDApO1xuXG5cdFx0cmVzdWx0ID0gcmVzdWx0LnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGlmIChpc1VucmVzcG9uc2l2ZShhKSB8fCBpc1VucmVzcG9uc2l2ZShiKSkge1xuXHRcdFx0XHRyZXR1cm4gK2lzVW5yZXNwb25zaXZlKGIpIC0gK2lzVW5yZXNwb25zaXZlKGEpO1xuXHRcdFx0fSBlbHNlIGlmIChwcm9maWxlVGltZShhKSB8fCBwcm9maWxlVGltZShiKSkge1xuXHRcdFx0XHRyZXR1cm4gcHJvZmlsZVRpbWUoYikgLSBwcm9maWxlVGltZShhKTtcblx0XHRcdH0gZWxzZSBpZiAoYWN0aXZhdGlvblRpbWUoYSkgfHwgYWN0aXZhdGlvblRpbWUoYikpIHtcblx0XHRcdFx0cmV0dXJuIGFjdGl2YXRpb25UaW1lKGIpIC0gYWN0aXZhdGlvblRpbWUoYSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYS5vcmlnaW5hbEluZGV4IC0gYi5vcmlnaW5hbEluZGV4O1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVFZGl0b3IocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHBhcmVudC5jbGFzc0xpc3QuYWRkKCdydW50aW1lLWV4dGVuc2lvbnMtZWRpdG9yJyk7XG5cblx0XHRjb25zdCBURU1QTEFURV9JRCA9ICdydW50aW1lRXh0ZW5zaW9uRWxlbWVudFRlbXBsYXRlJztcblxuXHRcdGNvbnN0IGRlbGVnYXRlID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8SVJ1bnRpbWVFeHRlbnNpb24+IHtcblx0XHRcdGdldEhlaWdodChlbGVtZW50OiBJUnVudGltZUV4dGVuc2lvbik6IG51bWJlciB7XG5cdFx0XHRcdHJldHVybiA3MDtcblx0XHRcdH1cblx0XHRcdGdldFRlbXBsYXRlSWQoZWxlbWVudDogSVJ1bnRpbWVFeHRlbnNpb24pOiBzdHJpbmcge1xuXHRcdFx0XHRyZXR1cm4gVEVNUExBVEVfSUQ7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGludGVyZmFjZSBJUnVudGltZUV4dGVuc2lvblRlbXBsYXRlRGF0YSB7XG5cdFx0XHRyb290OiBIVE1MRWxlbWVudDtcblx0XHRcdGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRcdFx0bmFtZTogSFRNTEVsZW1lbnQ7XG5cdFx0XHR2ZXJzaW9uOiBIVE1MRWxlbWVudDtcblx0XHRcdG1zZ0NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdFx0XHRhY3Rpb25iYXI6IEFjdGlvbkJhcjtcblx0XHRcdGFjdGl2YXRpb25UaW1lOiBIVE1MRWxlbWVudDtcblx0XHRcdHByb2ZpbGVUaW1lOiBIVE1MRWxlbWVudDtcblx0XHRcdGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdO1xuXHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdO1xuXHRcdFx0ZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uIHwgdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlbmRlcmVyOiBJTGlzdFJlbmRlcmVyPElSdW50aW1lRXh0ZW5zaW9uLCBJUnVudGltZUV4dGVuc2lvblRlbXBsYXRlRGF0YT4gPSB7XG5cdFx0XHR0ZW1wbGF0ZUlkOiBURU1QTEFURV9JRCxcblx0XHRcdHJlbmRlclRlbXBsYXRlOiAocm9vdDogSFRNTEVsZW1lbnQpOiBJUnVudGltZUV4dGVuc2lvblRlbXBsYXRlRGF0YSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSBhcHBlbmQocm9vdCwgJCgnLmV4dGVuc2lvbicpKTtcblx0XHRcdFx0Y29uc3QgaWNvbkNvbnRhaW5lciA9IGFwcGVuZChlbGVtZW50LCAkKCcuaWNvbi1jb250YWluZXInKSk7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbkljb25XaWRnZXQgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25JY29uV2lkZ2V0LCBpY29uQ29udGFpbmVyKTtcblxuXHRcdFx0XHRjb25zdCBkZXNjID0gYXBwZW5kKGVsZW1lbnQsICQoJ2Rpdi5kZXNjJykpO1xuXHRcdFx0XHRjb25zdCBoZWFkZXJDb250YWluZXIgPSBhcHBlbmQoZGVzYywgJCgnLmhlYWRlci1jb250YWluZXInKSk7XG5cdFx0XHRcdGNvbnN0IGhlYWRlciA9IGFwcGVuZChoZWFkZXJDb250YWluZXIsICQoJy5oZWFkZXInKSk7XG5cdFx0XHRcdGNvbnN0IG5hbWUgPSBhcHBlbmQoaGVhZGVyLCAkKCdkaXYubmFtZScpKTtcblx0XHRcdFx0Y29uc3QgdmVyc2lvbiA9IGFwcGVuZChoZWFkZXIsICQoJ3NwYW4udmVyc2lvbicpKTtcblxuXHRcdFx0XHRjb25zdCBtc2dDb250YWluZXIgPSBhcHBlbmQoZGVzYywgJCgnZGl2Lm1zZycpKTtcblxuXHRcdFx0XHRjb25zdCBhY3Rpb25iYXIgPSBuZXcgQWN0aW9uQmFyKGRlc2MpO1xuXHRcdFx0XHRjb25zdCBsaXN0ZW5lciA9IGFjdGlvbmJhci5vbkRpZFJ1bigoeyBlcnJvciB9KSA9PiBlcnJvciAmJiB0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycm9yKSk7XG5cblx0XHRcdFx0Y29uc3QgdGltZUNvbnRhaW5lciA9IGFwcGVuZChlbGVtZW50LCAkKCcudGltZScpKTtcblx0XHRcdFx0Y29uc3QgYWN0aXZhdGlvblRpbWUgPSBhcHBlbmQodGltZUNvbnRhaW5lciwgJCgnZGl2LmFjdGl2YXRpb24tdGltZScpKTtcblx0XHRcdFx0Y29uc3QgcHJvZmlsZVRpbWUgPSBhcHBlbmQodGltZUNvbnRhaW5lciwgJCgnZGl2LnByb2ZpbGUtdGltZScpKTtcblxuXHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IFtleHRlbnNpb25JY29uV2lkZ2V0LCBhY3Rpb25iYXIsIGxpc3RlbmVyXTtcblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHJvb3QsXG5cdFx0XHRcdFx0ZWxlbWVudCxcblx0XHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRcdHZlcnNpb24sXG5cdFx0XHRcdFx0YWN0aW9uYmFyLFxuXHRcdFx0XHRcdGFjdGl2YXRpb25UaW1lLFxuXHRcdFx0XHRcdHByb2ZpbGVUaW1lLFxuXHRcdFx0XHRcdG1zZ0NvbnRhaW5lcixcblx0XHRcdFx0XHRzZXQgZXh0ZW5zaW9uKGV4dGVuc2lvbjogSUV4dGVuc2lvbiB8IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uSWNvbldpZGdldC5leHRlbnNpb24gPSBleHRlbnNpb24gfHwgbnVsbDtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0XHRcdGVsZW1lbnREaXNwb3NhYmxlczogW10sXG5cdFx0XHRcdH07XG5cdFx0XHR9LFxuXG5cdFx0XHRyZW5kZXJFbGVtZW50OiAoZWxlbWVudDogSVJ1bnRpbWVFeHRlbnNpb24sIGluZGV4OiBudW1iZXIsIGRhdGE6IElSdW50aW1lRXh0ZW5zaW9uVGVtcGxhdGVEYXRhKTogdm9pZCA9PiB7XG5cblx0XHRcdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMgPSBkaXNwb3NlKGRhdGEuZWxlbWVudERpc3Bvc2FibGVzKTtcblx0XHRcdFx0ZGF0YS5leHRlbnNpb24gPSBlbGVtZW50Lm1hcmtldHBsYWNlSW5mbztcblxuXHRcdFx0XHRkYXRhLnJvb3QuY2xhc3NMaXN0LnRvZ2dsZSgnb2RkJywgaW5kZXggJSAyID09PSAxKTtcblxuXHRcdFx0XHRkYXRhLm5hbWUudGV4dENvbnRlbnQgPSAoZWxlbWVudC5tYXJrZXRwbGFjZUluZm8/LmRpc3BsYXlOYW1lIHx8IGVsZW1lbnQuZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSkuc3Vic3RyKDAsIDUwKTtcblx0XHRcdFx0ZGF0YS52ZXJzaW9uLnRleHRDb250ZW50ID0gZWxlbWVudC5kZXNjcmlwdGlvbi52ZXJzaW9uO1xuXG5cdFx0XHRcdGNvbnN0IGFjdGl2YXRpb25UaW1lcyA9IGVsZW1lbnQuc3RhdHVzLmFjdGl2YXRpb25UaW1lcztcblx0XHRcdFx0aWYgKGFjdGl2YXRpb25UaW1lcykge1xuXHRcdFx0XHRcdGNvbnN0IHN5bmNUaW1lID0gYWN0aXZhdGlvblRpbWVzLmNvZGVMb2FkaW5nVGltZSArIGFjdGl2YXRpb25UaW1lcy5hY3RpdmF0ZUNhbGxUaW1lO1xuXHRcdFx0XHRcdGRhdGEuYWN0aXZhdGlvblRpbWUudGV4dENvbnRlbnQgPSBhY3RpdmF0aW9uVGltZXMuYWN0aXZhdGlvblJlYXNvbi5zdGFydHVwID8gYFN0YXJ0dXAgQWN0aXZhdGlvbjogJHtzeW5jVGltZX1tc2AgOiBgQWN0aXZhdGlvbjogJHtzeW5jVGltZX1tc2A7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZGF0YS5hY3RpdmF0aW9uVGltZS50ZXh0Q29udGVudCA9IGBBY3RpdmF0aW5nLi4uYDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGRhdGEuYWN0aW9uYmFyLmNsZWFyKCk7XG5cdFx0XHRcdGNvbnN0IHNsb3dFeHRlbnNpb25BY3Rpb24gPSB0aGlzLl9jcmVhdGVTbG93RXh0ZW5zaW9uQWN0aW9uKGVsZW1lbnQpO1xuXHRcdFx0XHRpZiAoc2xvd0V4dGVuc2lvbkFjdGlvbikge1xuXHRcdFx0XHRcdGRhdGEuYWN0aW9uYmFyLnB1c2goc2xvd0V4dGVuc2lvbkFjdGlvbiwgeyBpY29uOiBmYWxzZSwgbGFiZWw6IHRydWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGlzTm9uRW1wdHlBcnJheShlbGVtZW50LnN0YXR1cy5ydW50aW1lRXJyb3JzKSkge1xuXHRcdFx0XHRcdGNvbnN0IHJlcG9ydEV4dGVuc2lvbklzc3VlQWN0aW9uID0gdGhpcy5fY3JlYXRlUmVwb3J0RXh0ZW5zaW9uSXNzdWVBY3Rpb24oZWxlbWVudCk7XG5cdFx0XHRcdFx0aWYgKHJlcG9ydEV4dGVuc2lvbklzc3VlQWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRkYXRhLmFjdGlvbmJhci5wdXNoKHJlcG9ydEV4dGVuc2lvbklzc3VlQWN0aW9uLCB7IGljb246IGZhbHNlLCBsYWJlbDogdHJ1ZSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgdGl0bGU6IHN0cmluZztcblx0XHRcdFx0aWYgKGFjdGl2YXRpb25UaW1lcykge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGl2YXRpb25JZCA9IGFjdGl2YXRpb25UaW1lcy5hY3RpdmF0aW9uUmVhc29uLmV4dGVuc2lvbklkLnZhbHVlO1xuXHRcdFx0XHRcdGNvbnN0IGFjdGl2YXRpb25FdmVudCA9IGFjdGl2YXRpb25UaW1lcy5hY3RpdmF0aW9uUmVhc29uLmFjdGl2YXRpb25FdmVudDtcblx0XHRcdFx0XHRpZiAoYWN0aXZhdGlvbkV2ZW50ID09PSAnKicpIHtcblx0XHRcdFx0XHRcdHRpdGxlID0gbmxzLmxvY2FsaXplKHtcblx0XHRcdFx0XHRcdFx0a2V5OiAnc3RhckFjdGl2YXRpb24nLFxuXHRcdFx0XHRcdFx0XHRjb21tZW50OiBbXG5cdFx0XHRcdFx0XHRcdFx0J3swfSB3aWxsIGJlIGFuIGV4dGVuc2lvbiBpZGVudGlmaWVyJ1xuXHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHR9LCBcIkFjdGl2YXRlZCBieSB7MH0gb24gc3RhcnQtdXBcIiwgYWN0aXZhdGlvbklkKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKC9ed29ya3NwYWNlQ29udGFpbnM6Ly50ZXN0KGFjdGl2YXRpb25FdmVudCkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGZpbGVOYW1lT3JHbG9iID0gYWN0aXZhdGlvbkV2ZW50LnN1YnN0cignd29ya3NwYWNlQ29udGFpbnM6Jy5sZW5ndGgpO1xuXHRcdFx0XHRcdFx0aWYgKGZpbGVOYW1lT3JHbG9iLmluZGV4T2YoJyonKSA+PSAwIHx8IGZpbGVOYW1lT3JHbG9iLmluZGV4T2YoJz8nKSA+PSAwKSB7XG5cdFx0XHRcdFx0XHRcdHRpdGxlID0gbmxzLmxvY2FsaXplKHtcblx0XHRcdFx0XHRcdFx0XHRrZXk6ICd3b3Jrc3BhY2VDb250YWluc0dsb2JBY3RpdmF0aW9uJyxcblx0XHRcdFx0XHRcdFx0XHRjb21tZW50OiBbXG5cdFx0XHRcdFx0XHRcdFx0XHQnezB9IHdpbGwgYmUgYSBnbG9iIHBhdHRlcm4nLFxuXHRcdFx0XHRcdFx0XHRcdFx0J3sxfSB3aWxsIGJlIGFuIGV4dGVuc2lvbiBpZGVudGlmaWVyJ1xuXHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0fSwgXCJBY3RpdmF0ZWQgYnkgezF9IGJlY2F1c2UgYSBmaWxlIG1hdGNoaW5nIHswfSBleGlzdHMgaW4geW91ciB3b3Jrc3BhY2VcIiwgZmlsZU5hbWVPckdsb2IsIGFjdGl2YXRpb25JZCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aXRsZSA9IG5scy5sb2NhbGl6ZSh7XG5cdFx0XHRcdFx0XHRcdFx0a2V5OiAnd29ya3NwYWNlQ29udGFpbnNGaWxlQWN0aXZhdGlvbicsXG5cdFx0XHRcdFx0XHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHRcdFx0XHRcdFx0J3swfSB3aWxsIGJlIGEgZmlsZSBuYW1lJyxcblx0XHRcdFx0XHRcdFx0XHRcdCd7MX0gd2lsbCBiZSBhbiBleHRlbnNpb24gaWRlbnRpZmllcidcblx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdH0sIFwiQWN0aXZhdGVkIGJ5IHsxfSBiZWNhdXNlIGZpbGUgezB9IGV4aXN0cyBpbiB5b3VyIHdvcmtzcGFjZVwiLCBmaWxlTmFtZU9yR2xvYiwgYWN0aXZhdGlvbklkKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2UgaWYgKC9ed29ya3NwYWNlQ29udGFpbnNUaW1lb3V0Oi8udGVzdChhY3RpdmF0aW9uRXZlbnQpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBnbG9iID0gYWN0aXZhdGlvbkV2ZW50LnN1YnN0cignd29ya3NwYWNlQ29udGFpbnNUaW1lb3V0OicubGVuZ3RoKTtcblx0XHRcdFx0XHRcdHRpdGxlID0gbmxzLmxvY2FsaXplKHtcblx0XHRcdFx0XHRcdFx0a2V5OiAnd29ya3NwYWNlQ29udGFpbnNUaW1lb3V0Jyxcblx0XHRcdFx0XHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHRcdFx0XHRcdCd7MH0gd2lsbCBiZSBhIGdsb2IgcGF0dGVybicsXG5cdFx0XHRcdFx0XHRcdFx0J3sxfSB3aWxsIGJlIGFuIGV4dGVuc2lvbiBpZGVudGlmaWVyJ1xuXHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHR9LCBcIkFjdGl2YXRlZCBieSB7MX0gYmVjYXVzZSBzZWFyY2hpbmcgZm9yIHswfSB0b29rIHRvbyBsb25nXCIsIGdsb2IsIGFjdGl2YXRpb25JZCk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChhY3RpdmF0aW9uRXZlbnQgPT09ICdvblN0YXJ0dXBGaW5pc2hlZCcpIHtcblx0XHRcdFx0XHRcdHRpdGxlID0gbmxzLmxvY2FsaXplKHtcblx0XHRcdFx0XHRcdFx0a2V5OiAnc3RhcnR1cEZpbmlzaGVkQWN0aXZhdGlvbicsXG5cdFx0XHRcdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHRcdFx0XHQnVGhpcyByZWZlcnMgdG8gYW4gZXh0ZW5zaW9uLiB7MH0gd2lsbCBiZSBhbiBhY3RpdmF0aW9uIGV2ZW50Lidcblx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0fSwgXCJBY3RpdmF0ZWQgYnkgezB9IGFmdGVyIHN0YXJ0LXVwIGZpbmlzaGVkXCIsIGFjdGl2YXRpb25JZCk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICgvXm9uTGFuZ3VhZ2U6Ly50ZXN0KGFjdGl2YXRpb25FdmVudCkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxhbmd1YWdlID0gYWN0aXZhdGlvbkV2ZW50LnN1YnN0cignb25MYW5ndWFnZTonLmxlbmd0aCk7XG5cdFx0XHRcdFx0XHR0aXRsZSA9IG5scy5sb2NhbGl6ZSgnbGFuZ3VhZ2VBY3RpdmF0aW9uJywgXCJBY3RpdmF0ZWQgYnkgezF9IGJlY2F1c2UgeW91IG9wZW5lZCBhIHswfSBmaWxlXCIsIGxhbmd1YWdlLCBhY3RpdmF0aW9uSWQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aXRsZSA9IG5scy5sb2NhbGl6ZSh7XG5cdFx0XHRcdFx0XHRcdGtleTogJ3dvcmtzcGFjZUdlbmVyaWNBY3RpdmF0aW9uJyxcblx0XHRcdFx0XHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHRcdFx0XHRcdCd7MH0gd2lsbCBiZSBhbiBhY3RpdmF0aW9uIGV2ZW50LCBsaWtlIGUuZy4gXFwnbGFuZ3VhZ2U6dHlwZXNjcmlwdFxcJywgXFwnZGVidWdcXCcsIGV0Yy4nLFxuXHRcdFx0XHRcdFx0XHRcdCd7MX0gd2lsbCBiZSBhbiBleHRlbnNpb24gaWRlbnRpZmllcidcblx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0fSwgXCJBY3RpdmF0ZWQgYnkgezF9IG9uIHswfVwiLCBhY3RpdmF0aW9uRXZlbnQsIGFjdGl2YXRpb25JZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRpdGxlID0gbmxzLmxvY2FsaXplKCdleHRlbnNpb25BY3RpdmF0aW5nJywgXCJFeHRlbnNpb24gaXMgYWN0aXZhdGluZy4uLlwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5wdXNoKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZGF0YS5hY3RpdmF0aW9uVGltZSwgdGl0bGUpKTtcblxuXHRcdFx0XHRjbGVhck5vZGUoZGF0YS5tc2dDb250YWluZXIpO1xuXG5cdFx0XHRcdGlmICh0aGlzLl9nZXRVbnJlc3BvbnNpdmVQcm9maWxlKGVsZW1lbnQuZGVzY3JpcHRpb24uaWRlbnRpZmllcikpIHtcblx0XHRcdFx0XHRjb25zdCBlbCA9ICQoJ3NwYW4nLCB1bmRlZmluZWQsIC4uLnJlbmRlckxhYmVsV2l0aEljb25zKGAgJChhbGVydCkgVW5yZXNwb25zaXZlYCkpO1xuXHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbkhvc3RGcmVlelRpdGxlID0gbmxzLmxvY2FsaXplKCd1bnJlc3BvbnNpdmUudGl0bGUnLCBcIkV4dGVuc2lvbiBoYXMgY2F1c2VkIHRoZSBleHRlbnNpb24gaG9zdCB0byBmcmVlemUuXCIpO1xuXHRcdFx0XHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLnB1c2godGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBlbCwgZXh0ZW5zaW9uSG9zdEZyZWV6VGl0bGUpKTtcblxuXHRcdFx0XHRcdGRhdGEubXNnQ29udGFpbmVyLmFwcGVuZENoaWxkKGVsKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpc05vbkVtcHR5QXJyYXkoZWxlbWVudC5zdGF0dXMucnVudGltZUVycm9ycykpIHtcblx0XHRcdFx0XHRjb25zdCBlbCA9ICQoJ3NwYW4nLCB1bmRlZmluZWQsIC4uLnJlbmRlckxhYmVsV2l0aEljb25zKGAkKGJ1ZykgJHtubHMubG9jYWxpemUoJ2Vycm9ycycsIFwiezB9IHVuY2F1Z2h0IGVycm9yc1wiLCBlbGVtZW50LnN0YXR1cy5ydW50aW1lRXJyb3JzLmxlbmd0aCl9YCkpO1xuXHRcdFx0XHRcdGRhdGEubXNnQ29udGFpbmVyLmFwcGVuZENoaWxkKGVsKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChlbGVtZW50LnN0YXR1cy5tZXNzYWdlcyAmJiBlbGVtZW50LnN0YXR1cy5tZXNzYWdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgZWwgPSAkKCdzcGFuJywgdW5kZWZpbmVkLCAuLi5yZW5kZXJMYWJlbFdpdGhJY29ucyhgJChhbGVydCkgJHtlbGVtZW50LnN0YXR1cy5tZXNzYWdlc1swXS5tZXNzYWdlfWApKTtcblx0XHRcdFx0XHRkYXRhLm1zZ0NvbnRhaW5lci5hcHBlbmRDaGlsZChlbCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgZXh0cmFMYWJlbDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdFx0XHRcdGlmIChlbGVtZW50LnN0YXR1cy5ydW5uaW5nTG9jYXRpb24gJiYgZWxlbWVudC5zdGF0dXMucnVubmluZ0xvY2F0aW9uLmVxdWFscyhuZXcgTG9jYWxXZWJXb3JrZXJSdW5uaW5nTG9jYXRpb24oMCkpKSB7XG5cdFx0XHRcdFx0ZXh0cmFMYWJlbCA9IGAkKGdsb2JlKSB3ZWIgd29ya2VyYDtcblx0XHRcdFx0fSBlbHNlIGlmIChlbGVtZW50LmRlc2NyaXB0aW9uLmV4dGVuc2lvbkxvY2F0aW9uLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVSZW1vdGUpIHtcblx0XHRcdFx0XHRjb25zdCBob3N0TGFiZWwgPSB0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0SG9zdExhYmVsKFNjaGVtYXMudnNjb2RlUmVtb3RlLCB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KTtcblx0XHRcdFx0XHRpZiAoaG9zdExhYmVsKSB7XG5cdFx0XHRcdFx0XHRleHRyYUxhYmVsID0gYCQocmVtb3RlKSAke2hvc3RMYWJlbH1gO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRleHRyYUxhYmVsID0gYCQocmVtb3RlKSAke2VsZW1lbnQuZGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb24uYXV0aG9yaXR5fWA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKGVsZW1lbnQuc3RhdHVzLnJ1bm5pbmdMb2NhdGlvbiAmJiBlbGVtZW50LnN0YXR1cy5ydW5uaW5nTG9jYXRpb24uYWZmaW5pdHkgPiAwKSB7XG5cdFx0XHRcdFx0ZXh0cmFMYWJlbCA9IGVsZW1lbnQuc3RhdHVzLnJ1bm5pbmdMb2NhdGlvbiBpbnN0YW5jZW9mIExvY2FsV2ViV29ya2VyUnVubmluZ0xvY2F0aW9uXG5cdFx0XHRcdFx0XHQ/IGAkKGdsb2JlKSB3ZWIgd29ya2VyICR7ZWxlbWVudC5zdGF0dXMucnVubmluZ0xvY2F0aW9uLmFmZmluaXR5ICsgMX1gXG5cdFx0XHRcdFx0XHQ6IGAkKHNlcnZlci1wcm9jZXNzKSBsb2NhbCBwcm9jZXNzICR7ZWxlbWVudC5zdGF0dXMucnVubmluZ0xvY2F0aW9uLmFmZmluaXR5ICsgMX1gO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGV4dHJhTGFiZWwpIHtcblx0XHRcdFx0XHRjb25zdCBlbCA9ICQoJ3NwYW4nLCB1bmRlZmluZWQsIC4uLnJlbmRlckxhYmVsV2l0aEljb25zKGV4dHJhTGFiZWwpKTtcblx0XHRcdFx0XHRkYXRhLm1zZ0NvbnRhaW5lci5hcHBlbmRDaGlsZChlbCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBmZWF0dXJlcyA9IFJlZ2lzdHJ5LmFzPElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5PihFeHRlbnNpb25zLkV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnkpLmdldEV4dGVuc2lvbkZlYXR1cmVzKCk7XG5cdFx0XHRcdGZvciAoY29uc3QgZmVhdHVyZSBvZiBmZWF0dXJlcykge1xuXHRcdFx0XHRcdGNvbnN0IGFjY2Vzc0RhdGEgPSB0aGlzLl9leHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlLmdldEFjY2Vzc0RhdGEoZWxlbWVudC5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLCBmZWF0dXJlLmlkKTtcblx0XHRcdFx0XHRpZiAoYWNjZXNzRGF0YSkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc3RhdHVzID0gYWNjZXNzRGF0YT8uY3VycmVudD8uc3RhdHVzO1xuXHRcdFx0XHRcdFx0aWYgKHN0YXR1cykge1xuXHRcdFx0XHRcdFx0XHRkYXRhLm1zZ0NvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCdzcGFuJywgdW5kZWZpbmVkLCBgJHtmZWF0dXJlLmxhYmVsfTogYCkpO1xuXHRcdFx0XHRcdFx0XHRkYXRhLm1zZ0NvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCdzcGFuJywgdW5kZWZpbmVkLCAuLi5yZW5kZXJMYWJlbFdpdGhJY29ucyhgJCgke3N0YXR1cy5zZXZlcml0eSA9PT0gU2V2ZXJpdHkuRXJyb3IgPyBlcnJvckljb24uaWQgOiB3YXJuaW5nSWNvbi5pZH0pICR7c3RhdHVzLm1lc3NhZ2V9YCkpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChhY2Nlc3NEYXRhPy5hY2Nlc3NUaW1lcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSAkKCdzcGFuJywgdW5kZWZpbmVkLCBgJHtubHMubG9jYWxpemUoJ3JlcXVlc3RzIGNvdW50JywgXCJ7MH0gVXNhZ2U6IHsxfSBSZXF1ZXN0c1wiLCBmZWF0dXJlLmxhYmVsLCBhY2Nlc3NEYXRhLmFjY2Vzc1RpbWVzLmxlbmd0aCl9JHthY2Nlc3NEYXRhLmN1cnJlbnQgPyBubHMubG9jYWxpemUoJ3Nlc3Npb24gcmVxdWVzdHMgY291bnQnLCBcIiwgezB9IFJlcXVlc3RzIChTZXNzaW9uKVwiLCBhY2Nlc3NEYXRhLmN1cnJlbnQuYWNjZXNzVGltZXMubGVuZ3RoKSA6ICcnfWApO1xuXHRcdFx0XHRcdFx0XHRpZiAoYWNjZXNzRGF0YS5jdXJyZW50KSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgdGl0bGUgPSBubHMubG9jYWxpemUoJ3JlcXVlc3RzIGNvdW50IHRpdGxlJywgXCJMYXN0IHJlcXVlc3Qgd2FzIHswfS5cIiwgZnJvbU5vdyhhY2Nlc3NEYXRhLmN1cnJlbnQubGFzdEFjY2Vzc2VkLCB0cnVlLCB0cnVlKSk7XG5cdFx0XHRcdFx0XHRcdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMucHVzaCh0aGlzLl9ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIGVsZW1lbnQsIHRpdGxlKSk7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRkYXRhLm1zZ0NvbnRhaW5lci5hcHBlbmRDaGlsZChlbGVtZW50KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZWxlbWVudC5wcm9maWxlSW5mbykge1xuXHRcdFx0XHRcdGRhdGEucHJvZmlsZVRpbWUudGV4dENvbnRlbnQgPSBgUHJvZmlsZTogJHsoZWxlbWVudC5wcm9maWxlSW5mby50b3RhbFRpbWUgLyAxMDAwKS50b0ZpeGVkKDIpfW1zYDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkYXRhLnByb2ZpbGVUaW1lLnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHRcdH1cblxuXHRcdFx0fSxcblxuXHRcdFx0ZGlzcG9zZVRlbXBsYXRlOiAoZGF0YTogSVJ1bnRpbWVFeHRlbnNpb25UZW1wbGF0ZURhdGEpOiB2b2lkID0+IHtcblx0XHRcdFx0ZGF0YS5kaXNwb3NhYmxlcyA9IGRpc3Bvc2UoZGF0YS5kaXNwb3NhYmxlcyk7XG5cdFx0XHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzID0gZGlzcG9zZShkYXRhLmVsZW1lbnREaXNwb3NhYmxlcyk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuX2xpc3QgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hMaXN0PElSdW50aW1lRXh0ZW5zaW9uPixcblx0XHRcdCdSdW50aW1lRXh0ZW5zaW9ucycsXG5cdFx0XHRwYXJlbnQsIGRlbGVnYXRlLCBbcmVuZGVyZXJdLCB7XG5cdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0c2V0Um93TGluZUhlaWdodDogZmFsc2UsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSxcblx0XHRcdG92ZXJyaWRlU3R5bGVzOiB7XG5cdFx0XHRcdGxpc3RCYWNrZ3JvdW5kOiBlZGl0b3JCYWNrZ3JvdW5kXG5cdFx0XHR9LFxuXHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBuZXcgY2xhc3MgaW1wbGVtZW50cyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxJUnVudGltZUV4dGVuc2lvbj4ge1xuXHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdydW50aW1lRXh0ZW5zaW9ucycsIFwiUnVudGltZSBFeHRlbnNpb25zXCIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGdldEFyaWFMYWJlbChlbGVtZW50OiBJUnVudGltZUV4dGVuc2lvbik6IHN0cmluZyB8IG51bGwge1xuXHRcdFx0XHRcdHJldHVybiBlbGVtZW50LmRlc2NyaXB0aW9uLm5hbWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9saXN0LnNwbGljZSgwLCB0aGlzLl9saXN0Lmxlbmd0aCwgdGhpcy5fZWxlbWVudHMgfHwgdW5kZWZpbmVkKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xpc3Qub25Db250ZXh0TWVudSgoZSkgPT4ge1xuXHRcdFx0aWYgKCFlLmVsZW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblxuXHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBBY3Rpb24oXG5cdFx0XHRcdCdydW50aW1lRXh0ZW5zaW9uc0VkaXRvci5hY3Rpb24uY29weUlkJyxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjb3B5IGlkJywgXCJDb3B5IGlkICh7MH0pXCIsIGUuZWxlbWVudC5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHQoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQoZS5lbGVtZW50IS5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IHJlcG9ydEV4dGVuc2lvbklzc3VlQWN0aW9uID0gdGhpcy5fY3JlYXRlUmVwb3J0RXh0ZW5zaW9uSXNzdWVBY3Rpb24oZS5lbGVtZW50KTtcblx0XHRcdGlmIChyZXBvcnRFeHRlbnNpb25Jc3N1ZUFjdGlvbikge1xuXHRcdFx0XHRhY3Rpb25zLnB1c2gocmVwb3J0RXh0ZW5zaW9uSXNzdWVBY3Rpb24pO1xuXHRcdFx0fVxuXHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cblx0XHRcdGlmIChlLmVsZW1lbnQubWFya2V0cGxhY2VJbmZvKSB7XG5cdFx0XHRcdGFjdGlvbnMucHVzaChuZXcgQWN0aW9uKCdydW50aW1lRXh0ZW5zaW9uc0VkaXRvci5hY3Rpb24uZGlzYWJsZVdvcmtzcGFjZScsIG5scy5sb2NhbGl6ZSgnZGlzYWJsZSB3b3Jrc3BhY2UnLCBcIkRpc2FibGUgKFdvcmtzcGFjZSlcIiksIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4gdGhpcy5fZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uuc2V0RW5hYmxlbWVudChlLmVsZW1lbnQhLm1hcmtldHBsYWNlSW5mbyEsIEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZSkpKTtcblx0XHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBBY3Rpb24oJ3J1bnRpbWVFeHRlbnNpb25zRWRpdG9yLmFjdGlvbi5kaXNhYmxlJywgbmxzLmxvY2FsaXplKCdkaXNhYmxlJywgXCJEaXNhYmxlXCIpLCB1bmRlZmluZWQsIHRydWUsICgpID0+IHRoaXMuX2V4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnNldEVuYWJsZW1lbnQoZS5lbGVtZW50IS5tYXJrZXRwbGFjZUluZm8hLCBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRHbG9iYWxseSkpKTtcblx0XHRcdH1cblx0XHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXG5cdFx0XHRjb25zdCBtZW51QWN0aW9ucyA9IHRoaXMuX21lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKE1lbnVJZC5FeHRlbnNpb25FZGl0b3JDb250ZXh0TWVudSwgdGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRhY3Rpb25zLnB1c2goLi4uZ2V0Q29udGV4dE1lbnVBY3Rpb25zKG1lbnVBY3Rpb25zLCkuc2Vjb25kYXJ5KTtcblxuXHRcdFx0dGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnNcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBsYXlvdXQoZGltZW5zaW9uOiBEaW1lbnNpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9saXN0Py5sYXlvdXQoZGltZW5zaW9uLmhlaWdodCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2dldFByb2ZpbGVJbmZvKCk6IElFeHRlbnNpb25Ib3N0UHJvZmlsZSB8IG51bGw7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfZ2V0VW5yZXNwb25zaXZlUHJvZmlsZShleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllcik6IElFeHRlbnNpb25Ib3N0UHJvZmlsZSB8IHVuZGVmaW5lZDtcblx0cHJvdGVjdGVkIGFic3RyYWN0IF9jcmVhdGVTbG93RXh0ZW5zaW9uQWN0aW9uKGVsZW1lbnQ6IElSdW50aW1lRXh0ZW5zaW9uKTogQWN0aW9uIHwgbnVsbDtcblx0cHJvdGVjdGVkIGFic3RyYWN0IF9jcmVhdGVSZXBvcnRFeHRlbnNpb25Jc3N1ZUFjdGlvbihlbGVtZW50OiBJUnVudGltZUV4dGVuc2lvbik6IEFjdGlvbiB8IG51bGw7XG59XG5cbmV4cG9ydCBjbGFzcyBTaG93UnVudGltZUV4dGVuc2lvbnNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uc2hvd1J1bnRpbWVFeHRlbnNpb25zJyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdzaG93UnVudGltZUV4dGVuc2lvbnMnLCBcIlNob3cgUnVubmluZyBFeHRlbnNpb25zXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld0NvbnRhaW5lclRpdGxlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXdDb250YWluZXInLCAnd29ya2JlbmNoLnZpZXcuZXh0ZW5zaW9ucycpLFxuXHRcdFx0XHRncm91cDogJzJfZW5hYmxlbWVudCcsXG5cdFx0XHRcdG9yZGVyOiAzXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLm9wZW5FZGl0b3IoUnVudGltZUV4dGVuc2lvbnNJbnB1dC5pbnN0YW5jZSwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxHQUFjLFFBQVEsaUJBQWlCO0FBQ2hELFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsNEJBQTRCO0FBR3JDLFNBQVMsUUFBaUIsaUJBQWlCO0FBQzNDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZUFBZTtBQUN4QixTQUFzQixlQUFlO0FBQ3JDLFNBQVMsZUFBZTtBQUN4QixZQUFZLFNBQVM7QUFDckIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxTQUFTLGNBQWMsY0FBYztBQUM5QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUFnQiwwQkFBMEI7QUFDbkQsU0FBUywyQkFBMkI7QUFDcEMsU0FBOEIsOEJBQXFEO0FBQ25GLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMvQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGtCQUFrQjtBQUUzQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9DQUFvQztBQUM3QyxTQUFTLFlBQVksMkNBQXVFO0FBQzVGLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUNBQXFDO0FBQzlDLFNBQWdDLHlCQUE0QztBQUM1RSxTQUFxQixtQ0FBbUM7QUFDeEQsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxXQUFXLG1CQUFtQjtBQUN2QyxTQUFTLDJCQUEyQjtBQUNwQyxPQUFPO0FBeUJBLElBQWUsa0NBQWYsY0FBdUQsV0FBVztBQUFBLEVBUXhF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QUFRLEtBQUssSUFBSSxPQUFPLG1EQUFtRCxJQUFJLFNBQVMscUJBQXFCLHFCQUFxQixHQUFHLFFBQVcsTUFBTSxNQUFNLEtBQUssNEJBQTRCLGNBQWMsRUFBRSxRQUFTLGlCQUFrQixnQkFBZ0IsaUJBQWlCLENBQUMsQ0FBQztBQUMzUSxnQkFBUSxLQUFLLElBQUksT0FBTywwQ0FBMEMsSUFBSSxTQUFTLFdBQVcsU0FBUyxHQUFHLFFBQVcsTUFBTSxNQUFNLEtBQUssNEJBQTRCLGNBQWMsRUFBRSxRQUFTLGlCQUFrQixnQkFBZ0IsZ0JBQWdCLENBQUMsQ0FBQztBQUFBLE1BQzVPO0FBQ0EsY0FBUSxLQUFLLElBQUksVUFBVSxDQUFDO0FBRTVCLFlBQU0sY0FBYyxLQUFLLGFBQWEsZUFBZSxPQUFPLDRCQUE0QixLQUFLLGlCQUFpQjtBQUM5RyxjQUFRLEtBQUssR0FBRyxzQkFBc0IsV0FBWSxFQUFFLFNBQVM7QUFFN0QsV0FBSyxvQkFBb0IsZ0JBQWdCO0FBQUEsUUFDeEMsV0FBVyxNQUFNLEVBQUU7QUFBQSxRQUNuQixZQUFZLE1BQU07QUFBQSxNQUNuQixDQUFDO0FBQUEsSUFDRixDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFTyxPQUFPLFdBQTRCO0FBQ3pDLFNBQUssT0FBTyxPQUFPLFVBQVUsTUFBTTtBQUFBLEVBQ3BDO0FBTUQ7QUF6YnNCLGdDQUVFLEtBQWE7QUFGZixrQ0FBZjtBQUFBLEVBVUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBeEJtQjtBQTJiZixNQUFNLG9DQUFvQyxRQUFRO0FBQUEsRUFFeEQsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sSUFBSSxVQUFVLHlCQUF5Qix5QkFBeUI7QUFBQSxNQUN2RSxVQUFVLFdBQVc7QUFBQSxNQUNyQixJQUFJO0FBQUEsTUFDSixNQUFNO0FBQUEsUUFDTCxJQUFJLE9BQU87QUFBQSxRQUNYLE1BQU0sZUFBZSxPQUFPLGlCQUFpQiwyQkFBMkI7QUFBQSxRQUN4RSxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUEyQztBQUNwRCxVQUFNLFNBQVMsSUFBSSxjQUFjLEVBQUUsV0FBVyx1QkFBdUIsVUFBVSxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQUEsRUFDaEc7QUFDRDsiLAogICJuYW1lcyI6IFsiZWxlbWVudCIsICJ0aXRsZSJdCn0K
