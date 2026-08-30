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
import { MarkdownString } from "../../../base/common/htmlContent.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import * as resources from "../../../base/common/resources.js";
import { isFalsyOrWhitespace } from "../../../base/common/strings.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { localize } from "../../../nls.js";
import { ContextKeyExpr } from "../../../platform/contextkey/common/contextkey.js";
import { ExtensionIdentifier, ExtensionIdentifierSet } from "../../../platform/extensions/common/extensions.js";
import { SyncDescriptor } from "../../../platform/instantiation/common/descriptors.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { Registry } from "../../../platform/registry/common/platform.js";
import { Extensions as ViewletExtensions } from "../../browser/panecomposite.js";
import { CustomTreeView, TreeViewPane } from "../../browser/parts/views/treeView.js";
import { ViewPaneContainer } from "../../browser/parts/views/viewPaneContainer.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../common/contributions.js";
import { Extensions as ViewContainerExtensions, ViewContainerLocation } from "../../common/views.js";
import { VIEWLET_ID as DEBUG } from "../../contrib/debug/common/debug.js";
import { VIEWLET_ID as EXPLORER } from "../../contrib/files/common/files.js";
import { VIEWLET_ID as REMOTE } from "../../contrib/remote/browser/remoteExplorer.js";
import { VIEWLET_ID as SCM } from "../../contrib/scm/common/scm.js";
import { WebviewViewPane } from "../../contrib/webviewView/browser/webviewViewPane.js";
import { Extensions as ExtensionFeaturesRegistryExtensions } from "../../services/extensionManagement/common/extensionFeatures.js";
import { isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { ExtensionsRegistry } from "../../services/extensions/common/extensionsRegistry.js";
const viewsContainerSchema = {
  type: "object",
  properties: {
    id: {
      description: localize({ key: "vscode.extension.contributes.views.containers.id", comment: ["Contribution refers to those that an extension contributes to VS Code through an extension/contribution point. "] }, "Unique id used to identify the container in which views can be contributed using 'views' contribution point"),
      type: "string",
      pattern: "^[a-zA-Z0-9_-]+$"
    },
    title: {
      description: localize("vscode.extension.contributes.views.containers.title", "Human readable string used to render the container"),
      type: "string"
    },
    icon: {
      description: localize("vscode.extension.contributes.views.containers.icon", "Path to the container icon. Icons are 24x24 centered on a 50x40 block and have a fill color of 'rgb(215, 218, 224)' or '#d7dae0'. It is recommended that icons be in SVG, though any image file type is accepted."),
      type: "string"
    }
  },
  required: ["id", "title", "icon"]
};
const viewsContainersContribution = {
  description: localize("vscode.extension.contributes.viewsContainers", "Contributes views containers to the editor"),
  type: "object",
  properties: {
    "activitybar": {
      description: localize("views.container.activitybar", "Contribute views containers to Activity Bar"),
      type: "array",
      items: viewsContainerSchema
    },
    "panel": {
      description: localize("views.container.panel", "Contribute views containers to Panel"),
      type: "array",
      items: viewsContainerSchema
    },
    "secondarySidebar": {
      description: localize("views.container.secondarySidebar", "Contribute views containers to Secondary Side Bar"),
      type: "array",
      items: viewsContainerSchema
    }
  },
  additionalProperties: false
};
var ViewType = /* @__PURE__ */ ((ViewType2) => {
  ViewType2["Tree"] = "tree";
  ViewType2["Webview"] = "webview";
  return ViewType2;
})(ViewType || {});
var InitialVisibility = /* @__PURE__ */ ((InitialVisibility2) => {
  InitialVisibility2["Visible"] = "visible";
  InitialVisibility2["Hidden"] = "hidden";
  InitialVisibility2["Collapsed"] = "collapsed";
  return InitialVisibility2;
})(InitialVisibility || {});
const viewDescriptor = {
  type: "object",
  required: ["id", "name", "icon"],
  defaultSnippets: [{ body: { id: "${1:id}", name: "${2:name}", icon: "${3:icon}" } }],
  properties: {
    type: {
      markdownDescription: localize("vscode.extension.contributes.view.type", "Type of the view. This can either be `tree` for a tree view based view or `webview` for a webview based view. The default is `tree`."),
      type: "string",
      enum: [
        "tree",
        "webview"
      ],
      markdownEnumDescriptions: [
        localize("vscode.extension.contributes.view.tree", "The view is backed by a `TreeView` created by `createTreeView`."),
        localize("vscode.extension.contributes.view.webview", "The view is backed by a `WebviewView` registered by `registerWebviewViewProvider`.")
      ]
    },
    id: {
      markdownDescription: localize("vscode.extension.contributes.view.id", "Identifier of the view. This should be unique across all views. It is recommended to include your extension id as part of the view id. Use this to register a data provider through `vscode.window.registerTreeDataProviderForView` API. Also to trigger activating your extension by registering `onView:${id}` event to `activationEvents`."),
      type: "string"
    },
    name: {
      description: localize("vscode.extension.contributes.view.name", "The human-readable name of the view. Will be shown"),
      type: "string"
    },
    when: {
      description: localize("vscode.extension.contributes.view.when", "Condition which must be true to show this view"),
      type: "string"
    },
    icon: {
      description: localize("vscode.extension.contributes.view.icon", "Path to the view icon. View icons are displayed when the name of the view cannot be shown. It is recommended that icons be in SVG, though any image file type is accepted."),
      type: "string"
    },
    contextualTitle: {
      description: localize("vscode.extension.contributes.view.contextualTitle", "Human-readable context for when the view is moved out of its original location. By default, the view's container name will be used."),
      type: "string"
    },
    visibility: {
      description: localize("vscode.extension.contributes.view.initialState", "Initial state of the view when the extension is first installed. Once the user has changed the view state by collapsing, moving, or hiding the view, the initial state will not be used again."),
      type: "string",
      enum: [
        "visible",
        "hidden",
        "collapsed"
      ],
      default: "visible",
      enumDescriptions: [
        localize("vscode.extension.contributes.view.initialState.visible", "The default initial state for the view. In most containers the view will be expanded, however; some built-in containers (explorer, scm, and debug) show all contributed views collapsed regardless of the `visibility`."),
        localize("vscode.extension.contributes.view.initialState.hidden", "The view will not be shown in the view container, but will be discoverable through the views menu and other view entry points and can be un-hidden by the user."),
        localize("vscode.extension.contributes.view.initialState.collapsed", "The view will show in the view container, but will be collapsed.")
      ]
    },
    initialSize: {
      type: "number",
      description: localize("vscode.extension.contributs.view.size", "The initial size of the view. The size will behave like the css 'flex' property, and will set the initial size when the view is first shown. In the side bar, this is the height of the view. This value is only respected when the same extension owns both the view and the view container.")
    },
    accessibilityHelpContent: {
      type: "string",
      markdownDescription: localize("vscode.extension.contributes.view.accessibilityHelpContent", "When the accessibility help dialog is invoked in this view, this content will be presented to the user as a markdown string. Keybindings will be resolved when provided in the format of <keybinding:commandId>. If there is no keybinding, that will be indicated and this command will be included in a quickpick for easy configuration.")
    }
  }
};
const remoteViewDescriptor = {
  type: "object",
  required: ["id", "name"],
  properties: {
    id: {
      description: localize("vscode.extension.contributes.view.id", "Identifier of the view. This should be unique across all views. It is recommended to include your extension id as part of the view id. Use this to register a data provider through `vscode.window.registerTreeDataProviderForView` API. Also to trigger activating your extension by registering `onView:${id}` event to `activationEvents`."),
      type: "string"
    },
    name: {
      description: localize("vscode.extension.contributes.view.name", "The human-readable name of the view. Will be shown"),
      type: "string"
    },
    when: {
      description: localize("vscode.extension.contributes.view.when", "Condition which must be true to show this view"),
      type: "string"
    },
    group: {
      description: localize("vscode.extension.contributes.view.group", "Nested group in the viewlet"),
      type: "string"
    },
    remoteName: {
      description: localize("vscode.extension.contributes.view.remoteName", "The name of the remote type associated with this view"),
      type: ["string", "array"],
      items: {
        type: "string"
      }
    }
  }
};
const viewsContribution = {
  description: localize("vscode.extension.contributes.views", "Contributes views to the editor"),
  type: "object",
  properties: {
    "explorer": {
      description: localize("views.explorer", "Contributes views to Explorer container in the Activity bar"),
      type: "array",
      items: viewDescriptor,
      default: []
    },
    "debug": {
      description: localize("views.debug", "Contributes views to Debug container in the Activity bar"),
      type: "array",
      items: viewDescriptor,
      default: []
    },
    "scm": {
      description: localize("views.scm", "Contributes views to SCM container in the Activity bar"),
      type: "array",
      items: viewDescriptor,
      default: []
    },
    "test": {
      description: localize("views.test", "Contributes views to Test container in the Activity bar"),
      type: "array",
      items: viewDescriptor,
      default: []
    },
    "remote": {
      description: localize("views.remote", "Contributes views to Remote container in the Activity bar. To contribute to this container, the 'contribViewsRemote' API proposal must be enabled."),
      type: "array",
      items: remoteViewDescriptor,
      default: []
    }
  },
  additionalProperties: {
    description: localize("views.contributed", "Contributes views to contributed views container"),
    type: "array",
    items: viewDescriptor,
    default: []
  }
};
const viewsContainersExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "viewsContainers",
  jsonSchema: viewsContainersContribution
});
const viewsExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "views",
  deps: [viewsContainersExtensionPoint],
  jsonSchema: viewsContribution,
  activationEventsGenerator: function* (viewExtensionPointTypeArray) {
    for (const viewExtensionPointType of viewExtensionPointTypeArray) {
      for (const viewDescriptors of Object.values(viewExtensionPointType)) {
        for (const viewDescriptor2 of viewDescriptors) {
          if (viewDescriptor2.id) {
            yield `onView:${viewDescriptor2.id}`;
          }
        }
      }
    }
  }
});
const CUSTOM_VIEWS_START_ORDER = 7;
let ViewsExtensionHandler = class {
  constructor(instantiationService, logService) {
    this.instantiationService = instantiationService;
    this.logService = logService;
    this.viewContainersRegistry = Registry.as(ViewContainerExtensions.ViewContainersRegistry);
    this.viewsRegistry = Registry.as(ViewContainerExtensions.ViewsRegistry);
    this.handleAndRegisterCustomViewContainers();
    this.handleAndRegisterCustomViews();
  }
  handleAndRegisterCustomViewContainers() {
    viewsContainersExtensionPoint.setHandler((extensions, { added, removed }) => {
      if (removed.length) {
        this.removeCustomViewContainers(removed);
      }
      if (added.length) {
        this.addCustomViewContainers(added, this.viewContainersRegistry.all);
      }
    });
  }
  addCustomViewContainers(extensionPoints, existingViewContainers) {
    const viewContainersRegistry = Registry.as(ViewContainerExtensions.ViewContainersRegistry);
    let activityBarOrder = CUSTOM_VIEWS_START_ORDER + viewContainersRegistry.all.filter((v) => !!v.extensionId && viewContainersRegistry.getViewContainerLocation(v) === ViewContainerLocation.Sidebar).length;
    let panelOrder = 5 + viewContainersRegistry.all.filter((v) => !!v.extensionId && viewContainersRegistry.getViewContainerLocation(v) === ViewContainerLocation.Panel).length + 1;
    let auxiliaryBarOrder = 100 + viewContainersRegistry.all.filter((v) => !!v.extensionId && viewContainersRegistry.getViewContainerLocation(v) === ViewContainerLocation.AuxiliaryBar).length + 1;
    for (const { value, collector, description } of extensionPoints) {
      Object.entries(value).forEach(([key, value2]) => {
        if (!this.isValidViewsContainer(value2, collector)) {
          return;
        }
        switch (key) {
          case "activitybar":
            activityBarOrder = this.registerCustomViewContainers(value2, description, activityBarOrder, existingViewContainers, ViewContainerLocation.Sidebar);
            break;
          case "panel":
            panelOrder = this.registerCustomViewContainers(value2, description, panelOrder, existingViewContainers, ViewContainerLocation.Panel);
            break;
          case "secondarySidebar":
            auxiliaryBarOrder = this.registerCustomViewContainers(value2, description, auxiliaryBarOrder, existingViewContainers, ViewContainerLocation.AuxiliaryBar);
            break;
        }
      });
    }
  }
  removeCustomViewContainers(extensionPoints) {
    const viewContainersRegistry = Registry.as(ViewContainerExtensions.ViewContainersRegistry);
    const removedExtensions = extensionPoints.reduce((result, e) => {
      result.add(e.description.identifier);
      return result;
    }, new ExtensionIdentifierSet());
    for (const viewContainer of viewContainersRegistry.all) {
      if (viewContainer.extensionId && removedExtensions.has(viewContainer.extensionId)) {
        const views = this.viewsRegistry.getViews(viewContainer);
        if (views.length) {
          this.viewsRegistry.moveViews(views, this.getDefaultViewContainer());
        }
        this.deregisterCustomViewContainer(viewContainer);
      }
    }
  }
  isValidViewsContainer(viewsContainersDescriptors, collector) {
    if (!Array.isArray(viewsContainersDescriptors)) {
      collector.error(localize("viewcontainer requirearray", "views containers must be an array"));
      return false;
    }
    for (const descriptor of viewsContainersDescriptors) {
      if (typeof descriptor.id !== "string" && isFalsyOrWhitespace(descriptor.id)) {
        collector.error(localize("requireidstring", "property `{0}` is mandatory and must be of type `string` with non-empty value. Only alphanumeric characters, '_', and '-' are allowed.", "id"));
        return false;
      }
      if (!/^[a-z0-9_-]+$/i.test(descriptor.id)) {
        collector.error(localize("requireidstring", "property `{0}` is mandatory and must be of type `string` with non-empty value. Only alphanumeric characters, '_', and '-' are allowed.", "id"));
        return false;
      }
      if (typeof descriptor.title !== "string") {
        collector.error(localize("requirestring", "property `{0}` is mandatory and must be of type `string`", "title"));
        return false;
      }
      if (typeof descriptor.icon !== "string") {
        collector.error(localize("requirestring", "property `{0}` is mandatory and must be of type `string`", "icon"));
        return false;
      }
      if (isFalsyOrWhitespace(descriptor.title)) {
        collector.warn(localize("requirenonemptystring", "property `{0}` is mandatory and must be of type `string` with non-empty value", "title"));
        return true;
      }
    }
    return true;
  }
  registerCustomViewContainers(containers, extension, order, existingViewContainers, location) {
    containers.forEach((descriptor) => {
      const themeIcon = ThemeIcon.fromString(descriptor.icon);
      const icon = themeIcon || resources.joinPath(extension.extensionLocation, descriptor.icon);
      const id = `workbench.view.extension.${descriptor.id}`;
      const title = descriptor.title || id;
      const viewContainer = this.registerCustomViewContainer(id, title, icon, order++, extension.identifier, location);
      if (existingViewContainers.length) {
        const viewsToMove = [];
        for (const existingViewContainer of existingViewContainers) {
          if (viewContainer !== existingViewContainer) {
            viewsToMove.push(...this.viewsRegistry.getViews(existingViewContainer).filter((view) => view.originalContainerId === descriptor.id));
          }
        }
        if (viewsToMove.length) {
          this.viewsRegistry.moveViews(viewsToMove, viewContainer);
        }
      }
    });
    return order;
  }
  registerCustomViewContainer(id, title, icon, order, extensionId, location) {
    let viewContainer = this.viewContainersRegistry.get(id);
    if (!viewContainer) {
      viewContainer = this.viewContainersRegistry.registerViewContainer({
        id,
        title: { value: title, original: title },
        extensionId,
        ctorDescriptor: new SyncDescriptor(
          ViewPaneContainer,
          [id, { mergeViewWithContainerWhenSingleView: true }]
        ),
        hideIfEmpty: true,
        order,
        icon
      }, location);
    }
    return viewContainer;
  }
  deregisterCustomViewContainer(viewContainer) {
    this.viewContainersRegistry.deregisterViewContainer(viewContainer);
    Registry.as(ViewletExtensions.Viewlets).deregisterPaneComposite(viewContainer.id);
  }
  handleAndRegisterCustomViews() {
    viewsExtensionPoint.setHandler((extensions, { added, removed }) => {
      if (removed.length) {
        this.removeViews(removed);
      }
      if (added.length) {
        this.addViews(added);
      }
    });
  }
  addViews(extensions) {
    const viewIds = /* @__PURE__ */ new Set();
    const allViewDescriptors = [];
    for (const extension of extensions) {
      const { value, collector } = extension;
      Object.entries(value).forEach(([key, value2]) => {
        if (!this.isValidViewDescriptors(value2, collector)) {
          return;
        }
        if (key === "remote" && !isProposedApiEnabled(extension.description, "contribViewsRemote")) {
          collector.warn(localize("ViewContainerRequiresProposedAPI", `View container '{0}' requires 'enabledApiProposals: ["contribViewsRemote"]' to be added to 'Remote'.`, key));
          return;
        }
        if (key === "agentSessions" && !isProposedApiEnabled(extension.description, "chatSessionsProvider")) {
          collector.warn(localize("RequiresChatSessionsProposedAPI", `View container '{0}' requires 'enabledApiProposals: ["chatSessionsProvider"]'.`, key));
          return;
        }
        const viewContainer = this.getViewContainer(key);
        if (!viewContainer) {
          collector.warn(localize("ViewContainerDoesnotExist", "View container '{0}' does not exist and all views registered to it will be added to 'Explorer'.", key));
        }
        const container = viewContainer || this.getDefaultViewContainer();
        const viewDescriptors = [];
        for (let index = 0; index < value2.length; index++) {
          const item = value2[index];
          if (viewIds.has(item.id)) {
            collector.error(localize("duplicateView1", "Cannot register multiple views with same id `{0}`", item.id));
            continue;
          }
          if (this.viewsRegistry.getView(item.id) !== null) {
            collector.error(localize("duplicateView2", "A view with id `{0}` is already registered.", item.id));
            continue;
          }
          const order = ExtensionIdentifier.equals(extension.description.identifier, container.extensionId) ? index + 1 : container.viewOrderDelegate ? container.viewOrderDelegate.getOrder(item.group) : void 0;
          let icon;
          if (typeof item.icon === "string") {
            icon = ThemeIcon.fromString(item.icon) || resources.joinPath(extension.description.extensionLocation, item.icon);
          }
          const initialVisibility = this.convertInitialVisibility(item.visibility);
          const type = this.getViewType(item.type);
          if (!type) {
            collector.error(localize("unknownViewType", "Unknown view type `{0}`.", item.type));
            continue;
          }
          let weight = void 0;
          if (typeof item.initialSize === "number") {
            if (container.extensionId?.value === extension.description.identifier.value) {
              weight = item.initialSize;
            } else {
              this.logService.warn(`${extension.description.identifier.value} tried to set the view size of ${item.id} but it was ignored because the view container does not belong to it.`);
            }
          }
          let accessibilityHelpContent;
          if (isProposedApiEnabled(extension.description, "contribAccessibilityHelpContent") && item.accessibilityHelpContent) {
            accessibilityHelpContent = new MarkdownString(item.accessibilityHelpContent);
          }
          const viewDescriptor2 = {
            type,
            ctorDescriptor: type === "tree" /* Tree */ ? new SyncDescriptor(TreeViewPane) : new SyncDescriptor(WebviewViewPane),
            id: item.id,
            name: { value: item.name, original: item.name },
            when: ContextKeyExpr.deserialize(item.when),
            containerIcon: icon || viewContainer?.icon,
            containerTitle: item.contextualTitle || viewContainer && (typeof viewContainer.title === "string" ? viewContainer.title : viewContainer.title.value),
            canToggleVisibility: true,
            canMoveView: viewContainer?.id !== REMOTE,
            treeView: type === "tree" /* Tree */ ? this.instantiationService.createInstance(CustomTreeView, item.id, item.name, extension.description.identifier.value) : void 0,
            collapsed: this.showCollapsed(container) || initialVisibility === "collapsed" /* Collapsed */,
            order,
            extensionId: extension.description.identifier,
            originalContainerId: key,
            group: item.group,
            // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
            remoteAuthority: item.remoteName || item.remoteAuthority,
            // TODO@roblou - delete after remote extensions are updated
            virtualWorkspace: item.virtualWorkspace,
            hideByDefault: initialVisibility === "hidden" /* Hidden */,
            workspace: viewContainer?.id === REMOTE ? true : void 0,
            weight,
            accessibilityHelpContent
          };
          viewIds.add(viewDescriptor2.id);
          viewDescriptors.push(viewDescriptor2);
        }
        allViewDescriptors.push({ viewContainer: container, views: viewDescriptors });
      });
    }
    this.viewsRegistry.registerViews2(allViewDescriptors);
  }
  getViewType(type) {
    if (type === "webview" /* Webview */) {
      return "webview" /* Webview */;
    }
    if (!type || type === "tree" /* Tree */) {
      return "tree" /* Tree */;
    }
    return void 0;
  }
  getDefaultViewContainer() {
    return this.viewContainersRegistry.get(EXPLORER);
  }
  removeViews(extensions) {
    const removedExtensions = extensions.reduce((result, e) => {
      result.add(e.description.identifier);
      return result;
    }, new ExtensionIdentifierSet());
    for (const viewContainer of this.viewContainersRegistry.all) {
      const removedViews = this.viewsRegistry.getViews(viewContainer).filter((v) => v.extensionId && removedExtensions.has(v.extensionId));
      if (removedViews.length) {
        this.viewsRegistry.deregisterViews(removedViews, viewContainer);
        for (const view of removedViews) {
          const anyView = view;
          if (anyView.treeView) {
            anyView.treeView.dispose();
          }
        }
      }
    }
  }
  convertInitialVisibility(value) {
    if (Object.values(InitialVisibility).includes(value)) {
      return value;
    }
    return void 0;
  }
  isValidViewDescriptors(viewDescriptors, collector) {
    if (!Array.isArray(viewDescriptors)) {
      collector.error(localize("requirearray", "views must be an array"));
      return false;
    }
    for (const descriptor of viewDescriptors) {
      if (typeof descriptor.id !== "string") {
        collector.error(localize("requirestring", "property `{0}` is mandatory and must be of type `string`", "id"));
        return false;
      }
      if (typeof descriptor.name !== "string") {
        collector.error(localize("requirestring", "property `{0}` is mandatory and must be of type `string`", "name"));
        return false;
      }
      if (descriptor.when && typeof descriptor.when !== "string") {
        collector.error(localize("optstring", "property `{0}` can be omitted or must be of type `string`", "when"));
        return false;
      }
      if (descriptor.icon && typeof descriptor.icon !== "string") {
        collector.error(localize("optstring", "property `{0}` can be omitted or must be of type `string`", "icon"));
        return false;
      }
      if (descriptor.contextualTitle && typeof descriptor.contextualTitle !== "string") {
        collector.error(localize("optstring", "property `{0}` can be omitted or must be of type `string`", "contextualTitle"));
        return false;
      }
      if (descriptor.visibility && !this.convertInitialVisibility(descriptor.visibility)) {
        collector.error(localize("optenum", "property `{0}` can be omitted or must be one of {1}", "visibility", Object.values(InitialVisibility).join(", ")));
        return false;
      }
    }
    return true;
  }
  getViewContainer(value) {
    switch (value) {
      case "explorer":
        return this.viewContainersRegistry.get(EXPLORER);
      case "debug":
        return this.viewContainersRegistry.get(DEBUG);
      case "scm":
        return this.viewContainersRegistry.get(SCM);
      case "remote":
        return this.viewContainersRegistry.get(REMOTE);
      default:
        return this.viewContainersRegistry.get(`workbench.view.extension.${value}`);
    }
  }
  showCollapsed(container) {
    switch (container.id) {
      case EXPLORER:
      case SCM:
      case DEBUG:
        return true;
    }
    return false;
  }
};
ViewsExtensionHandler.ID = "workbench.contrib.viewsExtensionHandler";
ViewsExtensionHandler = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, ILogService)
], ViewsExtensionHandler);
class ViewContainersDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.viewsContainers;
  }
  render(manifest) {
    const contrib = manifest.contributes?.viewsContainers || {};
    const viewContainers = Object.keys(contrib).reduce((result, location) => {
      const viewContainersForLocation = contrib[location];
      result.push(...viewContainersForLocation.map((viewContainer) => ({ ...viewContainer, location })));
      return result;
    }, []);
    if (!viewContainers.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      localize("view container id", "ID"),
      localize("view container title", "Title"),
      localize("view container location", "Where")
    ];
    const rows = viewContainers.sort((a, b) => a.id.localeCompare(b.id)).map((viewContainer) => {
      return [
        viewContainer.id,
        viewContainer.title,
        viewContainer.location
      ];
    });
    return {
      data: {
        headers,
        rows
      },
      dispose: () => {
      }
    };
  }
}
class ViewsDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.views;
  }
  render(manifest) {
    const contrib = manifest.contributes?.views || {};
    const views = Object.keys(contrib).reduce((result, location) => {
      const viewsForLocation = contrib[location];
      result.push(...viewsForLocation.map((view) => ({ ...view, location })));
      return result;
    }, []);
    if (!views.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      localize("view id", "ID"),
      localize("view name title", "Name"),
      localize("view container location", "Where")
    ];
    const rows = views.sort((a, b) => a.id.localeCompare(b.id)).map((view) => {
      return [
        view.id,
        view.name,
        view.location
      ];
    });
    return {
      data: {
        headers,
        rows
      },
      dispose: () => {
      }
    };
  }
}
Registry.as(ExtensionFeaturesRegistryExtensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "viewsContainers",
  label: localize("viewsContainers", "View Containers"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(ViewContainersDataRenderer)
});
Registry.as(ExtensionFeaturesRegistryExtensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "views",
  label: localize("views", "Views"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(ViewsDataRenderer)
});
registerWorkbenchContribution2(ViewsExtensionHandler.ID, ViewsExtensionHandler, WorkbenchPhase.BlockStartup);
export {
  viewsContainersContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3Nlclxcdmlld3NFeHRlbnNpb25Qb2ludC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgcmVzb3VyY2VzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBpc0ZhbHN5T3JXaGl0ZXNwYWNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyLCBFeHRlbnNpb25JZGVudGlmaWVyU2V0LCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIElFeHRlbnNpb25NYW5pZmVzdCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgUGFuZUNvbXBvc2l0ZVJlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIFZpZXdsZXRFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IEN1c3RvbVRyZWVWaWV3LCBUcmVlVmlld1BhbmUgfSBmcm9tICcuLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3RyZWVWaWV3LmpzJztcbmltcG9ydCB7IFZpZXdQYW5lQ29udGFpbmVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZUNvbnRhaW5lci5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZSwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUN1c3RvbVZpZXdEZXNjcmlwdG9yLCBJVmlld0NvbnRhaW5lcnNSZWdpc3RyeSwgSVZpZXdEZXNjcmlwdG9yLCBJVmlld3NSZWdpc3RyeSwgVmlld0NvbnRhaW5lciwgRXh0ZW5zaW9ucyBhcyBWaWV3Q29udGFpbmVyRXh0ZW5zaW9ucywgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IFZJRVdMRVRfSUQgYXMgREVCVUcgfSBmcm9tICcuLi8uLi9jb250cmliL2RlYnVnL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBWSUVXTEVUX0lEIGFzIEVYUExPUkVSIH0gZnJvbSAnLi4vLi4vY29udHJpYi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgVklFV0xFVF9JRCBhcyBSRU1PVEUgfSBmcm9tICcuLi8uLi9jb250cmliL3JlbW90ZS9icm93c2VyL3JlbW90ZUV4cGxvcmVyLmpzJztcbmltcG9ydCB7IFZJRVdMRVRfSUQgYXMgU0NNIH0gZnJvbSAnLi4vLi4vY29udHJpYi9zY20vY29tbW9uL3NjbS5qcyc7XG5pbXBvcnQgeyBXZWJ2aWV3Vmlld1BhbmUgfSBmcm9tICcuLi8uLi9jb250cmliL3dlYnZpZXdWaWV3L2Jyb3dzZXIvd2Vidmlld1ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeUV4dGVuc2lvbnMsIElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciwgSUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnksIElSZW5kZXJlZERhdGEsIElSb3dEYXRhLCBJVGFibGVEYXRhIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgaXNQcm9wb3NlZEFwaUVuYWJsZWQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbk1lc3NhZ2VDb2xsZWN0b3IsIEV4dGVuc2lvbnNSZWdpc3RyeSwgSUV4dGVuc2lvblBvaW50LCBJRXh0ZW5zaW9uUG9pbnRVc2VyIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJVXNlckZyaWVuZGx5Vmlld3NDb250YWluZXJEZXNjcmlwdG9yIHtcblx0aWQ6IHN0cmluZztcblx0dGl0bGU6IHN0cmluZztcblx0aWNvbjogc3RyaW5nO1xufVxuXG5jb25zdCB2aWV3c0NvbnRhaW5lclNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0aWQ6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSh7IGtleTogJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudmlld3MuY29udGFpbmVycy5pZCcsIGNvbW1lbnQ6IFsnQ29udHJpYnV0aW9uIHJlZmVycyB0byB0aG9zZSB0aGF0IGFuIGV4dGVuc2lvbiBjb250cmlidXRlcyB0byBWUyBDb2RlIHRocm91Z2ggYW4gZXh0ZW5zaW9uL2NvbnRyaWJ1dGlvbiBwb2ludC4gJ10gfSwgXCJVbmlxdWUgaWQgdXNlZCB0byBpZGVudGlmeSB0aGUgY29udGFpbmVyIGluIHdoaWNoIHZpZXdzIGNhbiBiZSBjb250cmlidXRlZCB1c2luZyAndmlld3MnIGNvbnRyaWJ1dGlvbiBwb2ludFwiKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0cGF0dGVybjogJ15bYS16QS1aMC05Xy1dKyQnXG5cdFx0fSxcblx0XHR0aXRsZToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnZpZXdzLmNvbnRhaW5lcnMudGl0bGUnLCAnSHVtYW4gcmVhZGFibGUgc3RyaW5nIHVzZWQgdG8gcmVuZGVyIHRoZSBjb250YWluZXInKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0fSxcblx0XHRpY29uOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudmlld3MuY29udGFpbmVycy5pY29uJywgXCJQYXRoIHRvIHRoZSBjb250YWluZXIgaWNvbi4gSWNvbnMgYXJlIDI0eDI0IGNlbnRlcmVkIG9uIGEgNTB4NDAgYmxvY2sgYW5kIGhhdmUgYSBmaWxsIGNvbG9yIG9mICdyZ2IoMjE1LCAyMTgsIDIyNCknIG9yICcjZDdkYWUwJy4gSXQgaXMgcmVjb21tZW5kZWQgdGhhdCBpY29ucyBiZSBpbiBTVkcsIHRob3VnaCBhbnkgaW1hZ2UgZmlsZSB0eXBlIGlzIGFjY2VwdGVkLlwiKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0fVxuXHR9LFxuXHRyZXF1aXJlZDogWydpZCcsICd0aXRsZScsICdpY29uJ11cbn07XG5cbmV4cG9ydCBjb25zdCB2aWV3c0NvbnRhaW5lcnNDb250cmlidXRpb246IElKU09OU2NoZW1hID0ge1xuXHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudmlld3NDb250YWluZXJzJywgJ0NvbnRyaWJ1dGVzIHZpZXdzIGNvbnRhaW5lcnMgdG8gdGhlIGVkaXRvcicpLFxuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdCdhY3Rpdml0eWJhcic6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmlld3MuY29udGFpbmVyLmFjdGl2aXR5YmFyJywgXCJDb250cmlidXRlIHZpZXdzIGNvbnRhaW5lcnMgdG8gQWN0aXZpdHkgQmFyXCIpLFxuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB2aWV3c0NvbnRhaW5lclNjaGVtYVxuXHRcdH0sXG5cdFx0J3BhbmVsJzoge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2aWV3cy5jb250YWluZXIucGFuZWwnLCBcIkNvbnRyaWJ1dGUgdmlld3MgY29udGFpbmVycyB0byBQYW5lbFwiKSxcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczogdmlld3NDb250YWluZXJTY2hlbWFcblx0XHR9LFxuXHRcdCdzZWNvbmRhcnlTaWRlYmFyJzoge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2aWV3cy5jb250YWluZXIuc2Vjb25kYXJ5U2lkZWJhcicsIFwiQ29udHJpYnV0ZSB2aWV3cyBjb250YWluZXJzIHRvIFNlY29uZGFyeSBTaWRlIEJhclwiKSxcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczogdmlld3NDb250YWluZXJTY2hlbWFcblx0XHR9XG5cdH0sXG5cdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZVxufTtcblxuZW51bSBWaWV3VHlwZSB7XG5cdFRyZWUgPSAndHJlZScsXG5cdFdlYnZpZXcgPSAnd2Vidmlldydcbn1cblxuXG5pbnRlcmZhY2UgSVVzZXJGcmllbmRseVZpZXdEZXNjcmlwdG9yIHtcblx0dHlwZT86IFZpZXdUeXBlO1xuXG5cdGlkOiBzdHJpbmc7XG5cdG5hbWU6IHN0cmluZztcblx0d2hlbj86IHN0cmluZztcblxuXHRpY29uPzogc3RyaW5nO1xuXHRjb250ZXh0dWFsVGl0bGU/OiBzdHJpbmc7XG5cdHZpc2liaWxpdHk/OiBzdHJpbmc7XG5cblx0aW5pdGlhbFNpemU/OiBudW1iZXI7XG5cblx0Ly8gRnJvbSAncmVtb3RlVmlld0Rlc2NyaXB0b3InIHR5cGVcblx0Z3JvdXA/OiBzdHJpbmc7XG5cdHJlbW90ZU5hbWU/OiBzdHJpbmcgfCBzdHJpbmdbXTtcblx0dmlydHVhbFdvcmtzcGFjZT86IHN0cmluZztcblxuXHRhY2Nlc3NpYmlsaXR5SGVscENvbnRlbnQ/OiBzdHJpbmc7XG59XG5cbmVudW0gSW5pdGlhbFZpc2liaWxpdHkge1xuXHRWaXNpYmxlID0gJ3Zpc2libGUnLFxuXHRIaWRkZW4gPSAnaGlkZGVuJyxcblx0Q29sbGFwc2VkID0gJ2NvbGxhcHNlZCdcbn1cblxuY29uc3Qgdmlld0Rlc2NyaXB0b3I6IElKU09OU2NoZW1hID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cmVxdWlyZWQ6IFsnaWQnLCAnbmFtZScsICdpY29uJ10sXG5cdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogeyBpZDogJyR7MTppZH0nLCBuYW1lOiAnJHsyOm5hbWV9JywgaWNvbjogJyR7MzppY29ufScgfSB9XSxcblx0cHJvcGVydGllczoge1xuXHRcdHR5cGU6IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnZpZXcudHlwZScsIFwiVHlwZSBvZiB0aGUgdmlldy4gVGhpcyBjYW4gZWl0aGVyIGJlIGB0cmVlYCBmb3IgYSB0cmVlIHZpZXcgYmFzZWQgdmlldyBvciBgd2Vidmlld2AgZm9yIGEgd2VidmlldyBiYXNlZCB2aWV3LiBUaGUgZGVmYXVsdCBpcyBgdHJlZWAuXCIpLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbXG5cdFx0XHRcdCd0cmVlJyxcblx0XHRcdFx0J3dlYnZpZXcnLFxuXHRcdFx0XSxcblx0XHRcdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy52aWV3LnRyZWUnLCBcIlRoZSB2aWV3IGlzIGJhY2tlZCBieSBhIGBUcmVlVmlld2AgY3JlYXRlZCBieSBgY3JlYXRlVHJlZVZpZXdgLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudmlldy53ZWJ2aWV3JywgXCJUaGUgdmlldyBpcyBiYWNrZWQgYnkgYSBgV2Vidmlld1ZpZXdgIHJlZ2lzdGVyZWQgYnkgYHJlZ2lzdGVyV2Vidmlld1ZpZXdQcm92aWRlcmAuXCIpLFxuXHRcdFx0XVxuXHRcdH0sXG5cdFx0aWQ6IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnZpZXcuaWQnLCAnSWRlbnRpZmllciBvZiB0aGUgdmlldy4gVGhpcyBzaG91bGQgYmUgdW5pcXVlIGFjcm9zcyBhbGwgdmlld3MuIEl0IGlzIHJlY29tbWVuZGVkIHRvIGluY2x1ZGUgeW91ciBleHRlbnNpb24gaWQgYXMgcGFydCBvZiB0aGUgdmlldyBpZC4gVXNlIHRoaXMgdG8gcmVnaXN0ZXIgYSBkYXRhIHByb3ZpZGVyIHRocm91Z2ggYHZzY29kZS53aW5kb3cucmVnaXN0ZXJUcmVlRGF0YVByb3ZpZGVyRm9yVmlld2AgQVBJLiBBbHNvIHRvIHRyaWdnZXIgYWN0aXZhdGluZyB5b3VyIGV4dGVuc2lvbiBieSByZWdpc3RlcmluZyBgb25WaWV3OiR7aWR9YCBldmVudCB0byBgYWN0aXZhdGlvbkV2ZW50c2AuJyksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdH0sXG5cdFx0bmFtZToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnZpZXcubmFtZScsICdUaGUgaHVtYW4tcmVhZGFibGUgbmFtZSBvZiB0aGUgdmlldy4gV2lsbCBiZSBzaG93bicpLFxuXHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHR9LFxuXHRcdHdoZW46IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy52aWV3LndoZW4nLCAnQ29uZGl0aW9uIHdoaWNoIG11c3QgYmUgdHJ1ZSB0byBzaG93IHRoaXMgdmlldycpLFxuXHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHR9LFxuXHRcdGljb246IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy52aWV3Lmljb24nLCBcIlBhdGggdG8gdGhlIHZpZXcgaWNvbi4gVmlldyBpY29ucyBhcmUgZGlzcGxheWVkIHdoZW4gdGhlIG5hbWUgb2YgdGhlIHZpZXcgY2Fubm90IGJlIHNob3duLiBJdCBpcyByZWNvbW1lbmRlZCB0aGF0IGljb25zIGJlIGluIFNWRywgdGhvdWdoIGFueSBpbWFnZSBmaWxlIHR5cGUgaXMgYWNjZXB0ZWQuXCIpLFxuXHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHR9LFxuXHRcdGNvbnRleHR1YWxUaXRsZToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnZpZXcuY29udGV4dHVhbFRpdGxlJywgXCJIdW1hbi1yZWFkYWJsZSBjb250ZXh0IGZvciB3aGVuIHRoZSB2aWV3IGlzIG1vdmVkIG91dCBvZiBpdHMgb3JpZ2luYWwgbG9jYXRpb24uIEJ5IGRlZmF1bHQsIHRoZSB2aWV3J3MgY29udGFpbmVyIG5hbWUgd2lsbCBiZSB1c2VkLlwiKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0fSxcblx0XHR2aXNpYmlsaXR5OiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudmlldy5pbml0aWFsU3RhdGUnLCBcIkluaXRpYWwgc3RhdGUgb2YgdGhlIHZpZXcgd2hlbiB0aGUgZXh0ZW5zaW9uIGlzIGZpcnN0IGluc3RhbGxlZC4gT25jZSB0aGUgdXNlciBoYXMgY2hhbmdlZCB0aGUgdmlldyBzdGF0ZSBieSBjb2xsYXBzaW5nLCBtb3ZpbmcsIG9yIGhpZGluZyB0aGUgdmlldywgdGhlIGluaXRpYWwgc3RhdGUgd2lsbCBub3QgYmUgdXNlZCBhZ2Fpbi5cIiksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFtcblx0XHRcdFx0J3Zpc2libGUnLFxuXHRcdFx0XHQnaGlkZGVuJyxcblx0XHRcdFx0J2NvbGxhcHNlZCdcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiAndmlzaWJsZScsXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnZpZXcuaW5pdGlhbFN0YXRlLnZpc2libGUnLCBcIlRoZSBkZWZhdWx0IGluaXRpYWwgc3RhdGUgZm9yIHRoZSB2aWV3LiBJbiBtb3N0IGNvbnRhaW5lcnMgdGhlIHZpZXcgd2lsbCBiZSBleHBhbmRlZCwgaG93ZXZlcjsgc29tZSBidWlsdC1pbiBjb250YWluZXJzIChleHBsb3Jlciwgc2NtLCBhbmQgZGVidWcpIHNob3cgYWxsIGNvbnRyaWJ1dGVkIHZpZXdzIGNvbGxhcHNlZCByZWdhcmRsZXNzIG9mIHRoZSBgdmlzaWJpbGl0eWAuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy52aWV3LmluaXRpYWxTdGF0ZS5oaWRkZW4nLCBcIlRoZSB2aWV3IHdpbGwgbm90IGJlIHNob3duIGluIHRoZSB2aWV3IGNvbnRhaW5lciwgYnV0IHdpbGwgYmUgZGlzY292ZXJhYmxlIHRocm91Z2ggdGhlIHZpZXdzIG1lbnUgYW5kIG90aGVyIHZpZXcgZW50cnkgcG9pbnRzIGFuZCBjYW4gYmUgdW4taGlkZGVuIGJ5IHRoZSB1c2VyLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudmlldy5pbml0aWFsU3RhdGUuY29sbGFwc2VkJywgXCJUaGUgdmlldyB3aWxsIHNob3cgaW4gdGhlIHZpZXcgY29udGFpbmVyLCBidXQgd2lsbCBiZSBjb2xsYXBzZWQuXCIpXG5cdFx0XHRdXG5cdFx0fSxcblx0XHRpbml0aWFsU2l6ZToge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0cy52aWV3LnNpemUnLCBcIlRoZSBpbml0aWFsIHNpemUgb2YgdGhlIHZpZXcuIFRoZSBzaXplIHdpbGwgYmVoYXZlIGxpa2UgdGhlIGNzcyAnZmxleCcgcHJvcGVydHksIGFuZCB3aWxsIHNldCB0aGUgaW5pdGlhbCBzaXplIHdoZW4gdGhlIHZpZXcgaXMgZmlyc3Qgc2hvd24uIEluIHRoZSBzaWRlIGJhciwgdGhpcyBpcyB0aGUgaGVpZ2h0IG9mIHRoZSB2aWV3LiBUaGlzIHZhbHVlIGlzIG9ubHkgcmVzcGVjdGVkIHdoZW4gdGhlIHNhbWUgZXh0ZW5zaW9uIG93bnMgYm90aCB0aGUgdmlldyBhbmQgdGhlIHZpZXcgY29udGFpbmVyLlwiKSxcblx0XHR9LFxuXHRcdGFjY2Vzc2liaWxpdHlIZWxwQ29udGVudDoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy52aWV3LmFjY2Vzc2liaWxpdHlIZWxwQ29udGVudCcsIFwiV2hlbiB0aGUgYWNjZXNzaWJpbGl0eSBoZWxwIGRpYWxvZyBpcyBpbnZva2VkIGluIHRoaXMgdmlldywgdGhpcyBjb250ZW50IHdpbGwgYmUgcHJlc2VudGVkIHRvIHRoZSB1c2VyIGFzIGEgbWFya2Rvd24gc3RyaW5nLiBLZXliaW5kaW5ncyB3aWxsIGJlIHJlc29sdmVkIHdoZW4gcHJvdmlkZWQgaW4gdGhlIGZvcm1hdCBvZiA8a2V5YmluZGluZzpjb21tYW5kSWQ+LiBJZiB0aGVyZSBpcyBubyBrZXliaW5kaW5nLCB0aGF0IHdpbGwgYmUgaW5kaWNhdGVkIGFuZCB0aGlzIGNvbW1hbmQgd2lsbCBiZSBpbmNsdWRlZCBpbiBhIHF1aWNrcGljayBmb3IgZWFzeSBjb25maWd1cmF0aW9uLlwiKVxuXHRcdH1cblx0fVxufTtcblxuY29uc3QgcmVtb3RlVmlld0Rlc2NyaXB0b3I6IElKU09OU2NoZW1hID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cmVxdWlyZWQ6IFsnaWQnLCAnbmFtZSddLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0aWQ6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy52aWV3LmlkJywgJ0lkZW50aWZpZXIgb2YgdGhlIHZpZXcuIFRoaXMgc2hvdWxkIGJlIHVuaXF1ZSBhY3Jvc3MgYWxsIHZpZXdzLiBJdCBpcyByZWNvbW1lbmRlZCB0byBpbmNsdWRlIHlvdXIgZXh0ZW5zaW9uIGlkIGFzIHBhcnQgb2YgdGhlIHZpZXcgaWQuIFVzZSB0aGlzIHRvIHJlZ2lzdGVyIGEgZGF0YSBwcm92aWRlciB0aHJvdWdoIGB2c2NvZGUud2luZG93LnJlZ2lzdGVyVHJlZURhdGFQcm92aWRlckZvclZpZXdgIEFQSS4gQWxzbyB0byB0cmlnZ2VyIGFjdGl2YXRpbmcgeW91ciBleHRlbnNpb24gYnkgcmVnaXN0ZXJpbmcgYG9uVmlldzoke2lkfWAgZXZlbnQgdG8gYGFjdGl2YXRpb25FdmVudHNgLicpLFxuXHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHR9LFxuXHRcdG5hbWU6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy52aWV3Lm5hbWUnLCAnVGhlIGh1bWFuLXJlYWRhYmxlIG5hbWUgb2YgdGhlIHZpZXcuIFdpbGwgYmUgc2hvd24nKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0fSxcblx0XHR3aGVuOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudmlldy53aGVuJywgJ0NvbmRpdGlvbiB3aGljaCBtdXN0IGJlIHRydWUgdG8gc2hvdyB0aGlzIHZpZXcnKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0fSxcblx0XHRncm91cDoge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnZpZXcuZ3JvdXAnLCAnTmVzdGVkIGdyb3VwIGluIHRoZSB2aWV3bGV0JyksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdH0sXG5cdFx0cmVtb3RlTmFtZToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnZpZXcucmVtb3RlTmFtZScsICdUaGUgbmFtZSBvZiB0aGUgcmVtb3RlIHR5cGUgYXNzb2NpYXRlZCB3aXRoIHRoaXMgdmlldycpLFxuXHRcdFx0dHlwZTogWydzdHJpbmcnLCAnYXJyYXknXSxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59O1xuY29uc3Qgdmlld3NDb250cmlidXRpb246IElKU09OU2NoZW1hID0ge1xuXHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudmlld3MnLCBcIkNvbnRyaWJ1dGVzIHZpZXdzIHRvIHRoZSBlZGl0b3JcIiksXG5cdHR5cGU6ICdvYmplY3QnLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0J2V4cGxvcmVyJzoge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2aWV3cy5leHBsb3JlcicsIFwiQ29udHJpYnV0ZXMgdmlld3MgdG8gRXhwbG9yZXIgY29udGFpbmVyIGluIHRoZSBBY3Rpdml0eSBiYXJcIiksXG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHZpZXdEZXNjcmlwdG9yLFxuXHRcdFx0ZGVmYXVsdDogW11cblx0XHR9LFxuXHRcdCdkZWJ1Zyc6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmlld3MuZGVidWcnLCBcIkNvbnRyaWJ1dGVzIHZpZXdzIHRvIERlYnVnIGNvbnRhaW5lciBpbiB0aGUgQWN0aXZpdHkgYmFyXCIpLFxuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB2aWV3RGVzY3JpcHRvcixcblx0XHRcdGRlZmF1bHQ6IFtdXG5cdFx0fSxcblx0XHQnc2NtJzoge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2aWV3cy5zY20nLCBcIkNvbnRyaWJ1dGVzIHZpZXdzIHRvIFNDTSBjb250YWluZXIgaW4gdGhlIEFjdGl2aXR5IGJhclwiKSxcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczogdmlld0Rlc2NyaXB0b3IsXG5cdFx0XHRkZWZhdWx0OiBbXVxuXHRcdH0sXG5cdFx0J3Rlc3QnOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZpZXdzLnRlc3QnLCBcIkNvbnRyaWJ1dGVzIHZpZXdzIHRvIFRlc3QgY29udGFpbmVyIGluIHRoZSBBY3Rpdml0eSBiYXJcIiksXG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHZpZXdEZXNjcmlwdG9yLFxuXHRcdFx0ZGVmYXVsdDogW11cblx0XHR9LFxuXHRcdCdyZW1vdGUnOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZpZXdzLnJlbW90ZScsIFwiQ29udHJpYnV0ZXMgdmlld3MgdG8gUmVtb3RlIGNvbnRhaW5lciBpbiB0aGUgQWN0aXZpdHkgYmFyLiBUbyBjb250cmlidXRlIHRvIHRoaXMgY29udGFpbmVyLCB0aGUgJ2NvbnRyaWJWaWV3c1JlbW90ZScgQVBJIHByb3Bvc2FsIG11c3QgYmUgZW5hYmxlZC5cIiksXG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHJlbW90ZVZpZXdEZXNjcmlwdG9yLFxuXHRcdFx0ZGVmYXVsdDogW11cblx0XHR9LFxuXHR9LFxuXHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmlld3MuY29udHJpYnV0ZWQnLCBcIkNvbnRyaWJ1dGVzIHZpZXdzIHRvIGNvbnRyaWJ1dGVkIHZpZXdzIGNvbnRhaW5lclwiKSxcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdGl0ZW1zOiB2aWV3RGVzY3JpcHRvcixcblx0XHRkZWZhdWx0OiBbXVxuXHR9XG59O1xuXG50eXBlIFZpZXdDb250YWluZXJFeHRlbnNpb25Qb2ludFR5cGUgPSB7IFtsb2M6IHN0cmluZ106IElVc2VyRnJpZW5kbHlWaWV3c0NvbnRhaW5lckRlc2NyaXB0b3JbXSB9O1xuY29uc3Qgdmlld3NDb250YWluZXJzRXh0ZW5zaW9uUG9pbnQ6IElFeHRlbnNpb25Qb2ludDxWaWV3Q29udGFpbmVyRXh0ZW5zaW9uUG9pbnRUeXBlPiA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PFZpZXdDb250YWluZXJFeHRlbnNpb25Qb2ludFR5cGU+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICd2aWV3c0NvbnRhaW5lcnMnLFxuXHRqc29uU2NoZW1hOiB2aWV3c0NvbnRhaW5lcnNDb250cmlidXRpb25cbn0pO1xuXG50eXBlIFZpZXdFeHRlbnNpb25Qb2ludFR5cGUgPSB7IFtsb2M6IHN0cmluZ106IElVc2VyRnJpZW5kbHlWaWV3RGVzY3JpcHRvcltdIH07XG5jb25zdCB2aWV3c0V4dGVuc2lvblBvaW50OiBJRXh0ZW5zaW9uUG9pbnQ8Vmlld0V4dGVuc2lvblBvaW50VHlwZT4gPSBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxWaWV3RXh0ZW5zaW9uUG9pbnRUeXBlPih7XG5cdGV4dGVuc2lvblBvaW50OiAndmlld3MnLFxuXHRkZXBzOiBbdmlld3NDb250YWluZXJzRXh0ZW5zaW9uUG9pbnRdLFxuXHRqc29uU2NoZW1hOiB2aWV3c0NvbnRyaWJ1dGlvbixcblx0YWN0aXZhdGlvbkV2ZW50c0dlbmVyYXRvcjogZnVuY3Rpb24qICh2aWV3RXh0ZW5zaW9uUG9pbnRUeXBlQXJyYXkpIHtcblx0XHRmb3IgKGNvbnN0IHZpZXdFeHRlbnNpb25Qb2ludFR5cGUgb2Ygdmlld0V4dGVuc2lvblBvaW50VHlwZUFycmF5KSB7XG5cdFx0XHRmb3IgKGNvbnN0IHZpZXdEZXNjcmlwdG9ycyBvZiBPYmplY3QudmFsdWVzKHZpZXdFeHRlbnNpb25Qb2ludFR5cGUpKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qgdmlld0Rlc2NyaXB0b3Igb2Ygdmlld0Rlc2NyaXB0b3JzKSB7XG5cdFx0XHRcdFx0aWYgKHZpZXdEZXNjcmlwdG9yLmlkKSB7XG5cdFx0XHRcdFx0XHR5aWVsZCBgb25WaWV3OiR7dmlld0Rlc2NyaXB0b3IuaWR9YDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5jb25zdCBDVVNUT01fVklFV1NfU1RBUlRfT1JERVIgPSA3O1xuXG5jbGFzcyBWaWV3c0V4dGVuc2lvbkhhbmRsZXIgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIudmlld3NFeHRlbnNpb25IYW5kbGVyJztcblxuXHRwcml2YXRlIHZpZXdDb250YWluZXJzUmVnaXN0cnk6IElWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5O1xuXHRwcml2YXRlIHZpZXdzUmVnaXN0cnk6IElWaWV3c1JlZ2lzdHJ5O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMudmlld0NvbnRhaW5lcnNSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5PihWaWV3Q29udGFpbmVyRXh0ZW5zaW9ucy5WaWV3Q29udGFpbmVyc1JlZ2lzdHJ5KTtcblx0XHR0aGlzLnZpZXdzUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJVmlld3NSZWdpc3RyeT4oVmlld0NvbnRhaW5lckV4dGVuc2lvbnMuVmlld3NSZWdpc3RyeSk7XG5cdFx0dGhpcy5oYW5kbGVBbmRSZWdpc3RlckN1c3RvbVZpZXdDb250YWluZXJzKCk7XG5cdFx0dGhpcy5oYW5kbGVBbmRSZWdpc3RlckN1c3RvbVZpZXdzKCk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUFuZFJlZ2lzdGVyQ3VzdG9tVmlld0NvbnRhaW5lcnMoKSB7XG5cdFx0dmlld3NDb250YWluZXJzRXh0ZW5zaW9uUG9pbnQuc2V0SGFuZGxlcigoZXh0ZW5zaW9ucywgeyBhZGRlZCwgcmVtb3ZlZCB9KSA9PiB7XG5cdFx0XHRpZiAocmVtb3ZlZC5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5yZW1vdmVDdXN0b21WaWV3Q29udGFpbmVycyhyZW1vdmVkKTtcblx0XHRcdH1cblx0XHRcdGlmIChhZGRlZC5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5hZGRDdXN0b21WaWV3Q29udGFpbmVycyhhZGRlZCwgdGhpcy52aWV3Q29udGFpbmVyc1JlZ2lzdHJ5LmFsbCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFkZEN1c3RvbVZpZXdDb250YWluZXJzKGV4dGVuc2lvblBvaW50czogcmVhZG9ubHkgSUV4dGVuc2lvblBvaW50VXNlcjxWaWV3Q29udGFpbmVyRXh0ZW5zaW9uUG9pbnRUeXBlPltdLCBleGlzdGluZ1ZpZXdDb250YWluZXJzOiBWaWV3Q29udGFpbmVyW10pOiB2b2lkIHtcblx0XHRjb25zdCB2aWV3Q29udGFpbmVyc1JlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVZpZXdDb250YWluZXJzUmVnaXN0cnk+KFZpZXdDb250YWluZXJFeHRlbnNpb25zLlZpZXdDb250YWluZXJzUmVnaXN0cnkpO1xuXHRcdGxldCBhY3Rpdml0eUJhck9yZGVyID0gQ1VTVE9NX1ZJRVdTX1NUQVJUX09SREVSICsgdmlld0NvbnRhaW5lcnNSZWdpc3RyeS5hbGwuZmlsdGVyKHYgPT4gISF2LmV4dGVuc2lvbklkICYmIHZpZXdDb250YWluZXJzUmVnaXN0cnkuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHYpID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcikubGVuZ3RoO1xuXHRcdGxldCBwYW5lbE9yZGVyID0gNSArIHZpZXdDb250YWluZXJzUmVnaXN0cnkuYWxsLmZpbHRlcih2ID0+ICEhdi5leHRlbnNpb25JZCAmJiB2aWV3Q29udGFpbmVyc1JlZ2lzdHJ5LmdldFZpZXdDb250YWluZXJMb2NhdGlvbih2KSA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsKS5sZW5ndGggKyAxO1xuXHRcdC8vIG9mZnNldCBieSAxMDAgYmVjYXVzZSB0aGUgY2hhdCB2aWV3IGNvbnRhaW5lciB1c2VkIHRvIGhhdmUgb3JkZXIgMTAwIChub3cgMSkuIER1ZSB0byBjYWNoaW5nLCB3ZSBzdGlsbCBuZWVkIHRvIGFjY291bnQgZm9yIHRoZSBvcmlnaW5hbCBvcmRlciB2YWx1ZVxuXHRcdGxldCBhdXhpbGlhcnlCYXJPcmRlciA9IDEwMCArIHZpZXdDb250YWluZXJzUmVnaXN0cnkuYWxsLmZpbHRlcih2ID0+ICEhdi5leHRlbnNpb25JZCAmJiB2aWV3Q29udGFpbmVyc1JlZ2lzdHJ5LmdldFZpZXdDb250YWluZXJMb2NhdGlvbih2KSA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcikubGVuZ3RoICsgMTtcblx0XHRmb3IgKGNvbnN0IHsgdmFsdWUsIGNvbGxlY3RvciwgZGVzY3JpcHRpb24gfSBvZiBleHRlbnNpb25Qb2ludHMpIHtcblx0XHRcdE9iamVjdC5lbnRyaWVzKHZhbHVlKS5mb3JFYWNoKChba2V5LCB2YWx1ZV0pID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLmlzVmFsaWRWaWV3c0NvbnRhaW5lcih2YWx1ZSwgY29sbGVjdG9yKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRzd2l0Y2ggKGtleSkge1xuXHRcdFx0XHRcdGNhc2UgJ2FjdGl2aXR5YmFyJzpcblx0XHRcdFx0XHRcdGFjdGl2aXR5QmFyT3JkZXIgPSB0aGlzLnJlZ2lzdGVyQ3VzdG9tVmlld0NvbnRhaW5lcnModmFsdWUsIGRlc2NyaXB0aW9uLCBhY3Rpdml0eUJhck9yZGVyLCBleGlzdGluZ1ZpZXdDb250YWluZXJzLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdwYW5lbCc6XG5cdFx0XHRcdFx0XHRwYW5lbE9yZGVyID0gdGhpcy5yZWdpc3RlckN1c3RvbVZpZXdDb250YWluZXJzKHZhbHVlLCBkZXNjcmlwdGlvbiwgcGFuZWxPcmRlciwgZXhpc3RpbmdWaWV3Q29udGFpbmVycywgVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3NlY29uZGFyeVNpZGViYXInOlxuXHRcdFx0XHRcdFx0YXV4aWxpYXJ5QmFyT3JkZXIgPSB0aGlzLnJlZ2lzdGVyQ3VzdG9tVmlld0NvbnRhaW5lcnModmFsdWUsIGRlc2NyaXB0aW9uLCBhdXhpbGlhcnlCYXJPcmRlciwgZXhpc3RpbmdWaWV3Q29udGFpbmVycywgVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVDdXN0b21WaWV3Q29udGFpbmVycyhleHRlbnNpb25Qb2ludHM6IHJlYWRvbmx5IElFeHRlbnNpb25Qb2ludFVzZXI8Vmlld0NvbnRhaW5lckV4dGVuc2lvblBvaW50VHlwZT5bXSk6IHZvaWQge1xuXHRcdGNvbnN0IHZpZXdDb250YWluZXJzUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJVmlld0NvbnRhaW5lcnNSZWdpc3RyeT4oVmlld0NvbnRhaW5lckV4dGVuc2lvbnMuVmlld0NvbnRhaW5lcnNSZWdpc3RyeSk7XG5cdFx0Y29uc3QgcmVtb3ZlZEV4dGVuc2lvbnM6IEV4dGVuc2lvbklkZW50aWZpZXJTZXQgPSBleHRlbnNpb25Qb2ludHMucmVkdWNlKChyZXN1bHQsIGUpID0+IHsgcmVzdWx0LmFkZChlLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIpOyByZXR1cm4gcmVzdWx0OyB9LCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllclNldCgpKTtcblx0XHRmb3IgKGNvbnN0IHZpZXdDb250YWluZXIgb2Ygdmlld0NvbnRhaW5lcnNSZWdpc3RyeS5hbGwpIHtcblx0XHRcdGlmICh2aWV3Q29udGFpbmVyLmV4dGVuc2lvbklkICYmIHJlbW92ZWRFeHRlbnNpb25zLmhhcyh2aWV3Q29udGFpbmVyLmV4dGVuc2lvbklkKSkge1xuXHRcdFx0XHQvLyBtb3ZlIGFsbCB2aWV3cyBpbiB0aGlzIGNvbnRhaW5lciBpbnRvIGRlZmF1bHQgdmlldyBjb250YWluZXJcblx0XHRcdFx0Y29uc3Qgdmlld3MgPSB0aGlzLnZpZXdzUmVnaXN0cnkuZ2V0Vmlld3Modmlld0NvbnRhaW5lcik7XG5cdFx0XHRcdGlmICh2aWV3cy5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLnZpZXdzUmVnaXN0cnkubW92ZVZpZXdzKHZpZXdzLCB0aGlzLmdldERlZmF1bHRWaWV3Q29udGFpbmVyKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuZGVyZWdpc3RlckN1c3RvbVZpZXdDb250YWluZXIodmlld0NvbnRhaW5lcik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpc1ZhbGlkVmlld3NDb250YWluZXIodmlld3NDb250YWluZXJzRGVzY3JpcHRvcnM6IElVc2VyRnJpZW5kbHlWaWV3c0NvbnRhaW5lckRlc2NyaXB0b3JbXSwgY29sbGVjdG9yOiBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHZpZXdzQ29udGFpbmVyc0Rlc2NyaXB0b3JzKSkge1xuXHRcdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCd2aWV3Y29udGFpbmVyIHJlcXVpcmVhcnJheScsIFwidmlld3MgY29udGFpbmVycyBtdXN0IGJlIGFuIGFycmF5XCIpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGRlc2NyaXB0b3Igb2Ygdmlld3NDb250YWluZXJzRGVzY3JpcHRvcnMpIHtcblx0XHRcdGlmICh0eXBlb2YgZGVzY3JpcHRvci5pZCAhPT0gJ3N0cmluZycgJiYgaXNGYWxzeU9yV2hpdGVzcGFjZShkZXNjcmlwdG9yLmlkKSkge1xuXHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ3JlcXVpcmVpZHN0cmluZycsIFwicHJvcGVydHkgYHswfWAgaXMgbWFuZGF0b3J5IGFuZCBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ2Agd2l0aCBub24tZW1wdHkgdmFsdWUuIE9ubHkgYWxwaGFudW1lcmljIGNoYXJhY3RlcnMsICdfJywgYW5kICctJyBhcmUgYWxsb3dlZC5cIiwgJ2lkJykpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoISgvXlthLXowLTlfLV0rJC9pLnRlc3QoZGVzY3JpcHRvci5pZCkpKSB7XG5cdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgncmVxdWlyZWlkc3RyaW5nJywgXCJwcm9wZXJ0eSBgezB9YCBpcyBtYW5kYXRvcnkgYW5kIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nYCB3aXRoIG5vbi1lbXB0eSB2YWx1ZS4gT25seSBhbHBoYW51bWVyaWMgY2hhcmFjdGVycywgJ18nLCBhbmQgJy0nIGFyZSBhbGxvd2VkLlwiLCAnaWQnKSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2YgZGVzY3JpcHRvci50aXRsZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdyZXF1aXJlc3RyaW5nJywgXCJwcm9wZXJ0eSBgezB9YCBpcyBtYW5kYXRvcnkgYW5kIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nYFwiLCAndGl0bGUnKSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2YgZGVzY3JpcHRvci5pY29uICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ3JlcXVpcmVzdHJpbmcnLCBcInByb3BlcnR5IGB7MH1gIGlzIG1hbmRhdG9yeSBhbmQgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgXCIsICdpY29uJykpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNGYWxzeU9yV2hpdGVzcGFjZShkZXNjcmlwdG9yLnRpdGxlKSkge1xuXHRcdFx0XHRjb2xsZWN0b3Iud2Fybihsb2NhbGl6ZSgncmVxdWlyZW5vbmVtcHR5c3RyaW5nJywgXCJwcm9wZXJ0eSBgezB9YCBpcyBtYW5kYXRvcnkgYW5kIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nYCB3aXRoIG5vbi1lbXB0eSB2YWx1ZVwiLCAndGl0bGUnKSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckN1c3RvbVZpZXdDb250YWluZXJzKGNvbnRhaW5lcnM6IElVc2VyRnJpZW5kbHlWaWV3c0NvbnRhaW5lckRlc2NyaXB0b3JbXSwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIG9yZGVyOiBudW1iZXIsIGV4aXN0aW5nVmlld0NvbnRhaW5lcnM6IFZpZXdDb250YWluZXJbXSwgbG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbik6IG51bWJlciB7XG5cdFx0Y29udGFpbmVycy5mb3JFYWNoKGRlc2NyaXB0b3IgPT4ge1xuXHRcdFx0Y29uc3QgdGhlbWVJY29uID0gVGhlbWVJY29uLmZyb21TdHJpbmcoZGVzY3JpcHRvci5pY29uKTtcblxuXHRcdFx0Y29uc3QgaWNvbiA9IHRoZW1lSWNvbiB8fCByZXNvdXJjZXMuam9pblBhdGgoZXh0ZW5zaW9uLmV4dGVuc2lvbkxvY2F0aW9uLCBkZXNjcmlwdG9yLmljb24pO1xuXHRcdFx0Y29uc3QgaWQgPSBgd29ya2JlbmNoLnZpZXcuZXh0ZW5zaW9uLiR7ZGVzY3JpcHRvci5pZH1gO1xuXHRcdFx0Y29uc3QgdGl0bGUgPSBkZXNjcmlwdG9yLnRpdGxlIHx8IGlkO1xuXHRcdFx0Y29uc3Qgdmlld0NvbnRhaW5lciA9IHRoaXMucmVnaXN0ZXJDdXN0b21WaWV3Q29udGFpbmVyKGlkLCB0aXRsZSwgaWNvbiwgb3JkZXIrKywgZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGxvY2F0aW9uKTtcblxuXHRcdFx0Ly8gTW92ZSB0aG9zZSB2aWV3cyB0aGF0IGJlbG9uZ3MgdG8gdGhpcyBjb250YWluZXJcblx0XHRcdGlmIChleGlzdGluZ1ZpZXdDb250YWluZXJzLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCB2aWV3c1RvTW92ZTogSVZpZXdEZXNjcmlwdG9yW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBleGlzdGluZ1ZpZXdDb250YWluZXIgb2YgZXhpc3RpbmdWaWV3Q29udGFpbmVycykge1xuXHRcdFx0XHRcdGlmICh2aWV3Q29udGFpbmVyICE9PSBleGlzdGluZ1ZpZXdDb250YWluZXIpIHtcblx0XHRcdFx0XHRcdHZpZXdzVG9Nb3ZlLnB1c2goLi4udGhpcy52aWV3c1JlZ2lzdHJ5LmdldFZpZXdzKGV4aXN0aW5nVmlld0NvbnRhaW5lcikuZmlsdGVyKHZpZXcgPT4gKHZpZXcgYXMgSUN1c3RvbVZpZXdEZXNjcmlwdG9yKS5vcmlnaW5hbENvbnRhaW5lcklkID09PSBkZXNjcmlwdG9yLmlkKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh2aWV3c1RvTW92ZS5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLnZpZXdzUmVnaXN0cnkubW92ZVZpZXdzKHZpZXdzVG9Nb3ZlLCB2aWV3Q29udGFpbmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiBvcmRlcjtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJDdXN0b21WaWV3Q29udGFpbmVyKGlkOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcsIGljb246IFVSSSB8IFRoZW1lSWNvbiwgb3JkZXI6IG51bWJlciwgZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIgfCB1bmRlZmluZWQsIGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24pOiBWaWV3Q29udGFpbmVyIHtcblx0XHRsZXQgdmlld0NvbnRhaW5lciA9IHRoaXMudmlld0NvbnRhaW5lcnNSZWdpc3RyeS5nZXQoaWQpO1xuXG5cdFx0aWYgKCF2aWV3Q29udGFpbmVyKSB7XG5cblx0XHRcdHZpZXdDb250YWluZXIgPSB0aGlzLnZpZXdDb250YWluZXJzUmVnaXN0cnkucmVnaXN0ZXJWaWV3Q29udGFpbmVyKHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdHRpdGxlOiB7IHZhbHVlOiB0aXRsZSwgb3JpZ2luYWw6IHRpdGxlIH0sXG5cdFx0XHRcdGV4dGVuc2lvbklkLFxuXHRcdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKFxuXHRcdFx0XHRcdFZpZXdQYW5lQ29udGFpbmVyLFxuXHRcdFx0XHRcdFtpZCwgeyBtZXJnZVZpZXdXaXRoQ29udGFpbmVyV2hlblNpbmdsZVZpZXc6IHRydWUgfV1cblx0XHRcdFx0KSxcblx0XHRcdFx0aGlkZUlmRW1wdHk6IHRydWUsXG5cdFx0XHRcdG9yZGVyLFxuXHRcdFx0XHRpY29uLFxuXHRcdFx0fSwgbG9jYXRpb24pO1xuXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHZpZXdDb250YWluZXI7XG5cdH1cblxuXHRwcml2YXRlIGRlcmVnaXN0ZXJDdXN0b21WaWV3Q29udGFpbmVyKHZpZXdDb250YWluZXI6IFZpZXdDb250YWluZXIpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdDb250YWluZXJzUmVnaXN0cnkuZGVyZWdpc3RlclZpZXdDb250YWluZXIodmlld0NvbnRhaW5lcik7XG5cdFx0UmVnaXN0cnkuYXM8UGFuZUNvbXBvc2l0ZVJlZ2lzdHJ5PihWaWV3bGV0RXh0ZW5zaW9ucy5WaWV3bGV0cykuZGVyZWdpc3RlclBhbmVDb21wb3NpdGUodmlld0NvbnRhaW5lci5pZCk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUFuZFJlZ2lzdGVyQ3VzdG9tVmlld3MoKSB7XG5cdFx0dmlld3NFeHRlbnNpb25Qb2ludC5zZXRIYW5kbGVyKChleHRlbnNpb25zLCB7IGFkZGVkLCByZW1vdmVkIH0pID0+IHtcblx0XHRcdGlmIChyZW1vdmVkLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLnJlbW92ZVZpZXdzKHJlbW92ZWQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFkZGVkLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLmFkZFZpZXdzKGFkZGVkKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYWRkVmlld3MoZXh0ZW5zaW9uczogcmVhZG9ubHkgSUV4dGVuc2lvblBvaW50VXNlcjxWaWV3RXh0ZW5zaW9uUG9pbnRUeXBlPltdKTogdm9pZCB7XG5cdFx0Y29uc3Qgdmlld0lkczogU2V0PHN0cmluZz4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCBhbGxWaWV3RGVzY3JpcHRvcnM6IHsgdmlld3M6IElWaWV3RGVzY3JpcHRvcltdOyB2aWV3Q29udGFpbmVyOiBWaWV3Q29udGFpbmVyIH1bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0Y29uc3QgeyB2YWx1ZSwgY29sbGVjdG9yIH0gPSBleHRlbnNpb247XG5cblx0XHRcdE9iamVjdC5lbnRyaWVzKHZhbHVlKS5mb3JFYWNoKChba2V5LCB2YWx1ZV0pID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLmlzVmFsaWRWaWV3RGVzY3JpcHRvcnModmFsdWUsIGNvbGxlY3RvcikpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoa2V5ID09PSAncmVtb3RlJyAmJiAhaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLCAnY29udHJpYlZpZXdzUmVtb3RlJykpIHtcblx0XHRcdFx0XHRjb2xsZWN0b3Iud2Fybihsb2NhbGl6ZSgnVmlld0NvbnRhaW5lclJlcXVpcmVzUHJvcG9zZWRBUEknLCBcIlZpZXcgY29udGFpbmVyICd7MH0nIHJlcXVpcmVzICdlbmFibGVkQXBpUHJvcG9zYWxzOiBbXFxcImNvbnRyaWJWaWV3c1JlbW90ZVxcXCJdJyB0byBiZSBhZGRlZCB0byAnUmVtb3RlJy5cIiwga2V5KSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGtleSA9PT0gJ2FnZW50U2Vzc2lvbnMnICYmICFpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24uZGVzY3JpcHRpb24sICdjaGF0U2Vzc2lvbnNQcm92aWRlcicpKSB7XG5cdFx0XHRcdFx0Y29sbGVjdG9yLndhcm4obG9jYWxpemUoJ1JlcXVpcmVzQ2hhdFNlc3Npb25zUHJvcG9zZWRBUEknLCBcIlZpZXcgY29udGFpbmVyICd7MH0nIHJlcXVpcmVzICdlbmFibGVkQXBpUHJvcG9zYWxzOiBbXFxcImNoYXRTZXNzaW9uc1Byb3ZpZGVyXFxcIl0nLlwiLCBrZXkpKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB2aWV3Q29udGFpbmVyID0gdGhpcy5nZXRWaWV3Q29udGFpbmVyKGtleSk7XG5cdFx0XHRcdGlmICghdmlld0NvbnRhaW5lcikge1xuXHRcdFx0XHRcdGNvbGxlY3Rvci53YXJuKGxvY2FsaXplKCdWaWV3Q29udGFpbmVyRG9lc25vdEV4aXN0JywgXCJWaWV3IGNvbnRhaW5lciAnezB9JyBkb2VzIG5vdCBleGlzdCBhbmQgYWxsIHZpZXdzIHJlZ2lzdGVyZWQgdG8gaXQgd2lsbCBiZSBhZGRlZCB0byAnRXhwbG9yZXInLlwiLCBrZXkpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjb250YWluZXIgPSB2aWV3Q29udGFpbmVyIHx8IHRoaXMuZ2V0RGVmYXVsdFZpZXdDb250YWluZXIoKTtcblx0XHRcdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JzOiBJQ3VzdG9tVmlld0Rlc2NyaXB0b3JbXSA9IFtdO1xuXG5cdFx0XHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCB2YWx1ZS5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdFx0XHRjb25zdCBpdGVtID0gdmFsdWVbaW5kZXhdO1xuXHRcdFx0XHRcdC8vIHZhbGlkYXRlXG5cdFx0XHRcdFx0aWYgKHZpZXdJZHMuaGFzKGl0ZW0uaWQpKSB7XG5cdFx0XHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ2R1cGxpY2F0ZVZpZXcxJywgXCJDYW5ub3QgcmVnaXN0ZXIgbXVsdGlwbGUgdmlld3Mgd2l0aCBzYW1lIGlkIGB7MH1gXCIsIGl0ZW0uaWQpKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodGhpcy52aWV3c1JlZ2lzdHJ5LmdldFZpZXcoaXRlbS5pZCkgIT09IG51bGwpIHtcblx0XHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgnZHVwbGljYXRlVmlldzInLCBcIkEgdmlldyB3aXRoIGlkIGB7MH1gIGlzIGFscmVhZHkgcmVnaXN0ZXJlZC5cIiwgaXRlbS5pZCkpO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3Qgb3JkZXIgPSBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyhleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllciwgY29udGFpbmVyLmV4dGVuc2lvbklkKVxuXHRcdFx0XHRcdFx0PyBpbmRleCArIDFcblx0XHRcdFx0XHRcdDogY29udGFpbmVyLnZpZXdPcmRlckRlbGVnYXRlXG5cdFx0XHRcdFx0XHRcdD8gY29udGFpbmVyLnZpZXdPcmRlckRlbGVnYXRlLmdldE9yZGVyKGl0ZW0uZ3JvdXApXG5cdFx0XHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0XHRcdFx0bGV0IGljb246IFRoZW1lSWNvbiB8IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAodHlwZW9mIGl0ZW0uaWNvbiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdGljb24gPSBUaGVtZUljb24uZnJvbVN0cmluZyhpdGVtLmljb24pIHx8IHJlc291cmNlcy5qb2luUGF0aChleHRlbnNpb24uZGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb24sIGl0ZW0uaWNvbik7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgaW5pdGlhbFZpc2liaWxpdHkgPSB0aGlzLmNvbnZlcnRJbml0aWFsVmlzaWJpbGl0eShpdGVtLnZpc2liaWxpdHkpO1xuXG5cdFx0XHRcdFx0Y29uc3QgdHlwZSA9IHRoaXMuZ2V0Vmlld1R5cGUoaXRlbS50eXBlKTtcblx0XHRcdFx0XHRpZiAoIXR5cGUpIHtcblx0XHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgndW5rbm93blZpZXdUeXBlJywgXCJVbmtub3duIHZpZXcgdHlwZSBgezB9YC5cIiwgaXRlbS50eXBlKSk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRsZXQgd2VpZ2h0OiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBpdGVtLmluaXRpYWxTaXplID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0aWYgKGNvbnRhaW5lci5leHRlbnNpb25JZD8udmFsdWUgPT09IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlKSB7XG5cdFx0XHRcdFx0XHRcdHdlaWdodCA9IGl0ZW0uaW5pdGlhbFNpemU7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgJHtleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZX0gdHJpZWQgdG8gc2V0IHRoZSB2aWV3IHNpemUgb2YgJHtpdGVtLmlkfSBidXQgaXQgd2FzIGlnbm9yZWQgYmVjYXVzZSB0aGUgdmlldyBjb250YWluZXIgZG9lcyBub3QgYmVsb25nIHRvIGl0LmApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGxldCBhY2Nlc3NpYmlsaXR5SGVscENvbnRlbnQ7XG5cdFx0XHRcdFx0aWYgKGlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbi5kZXNjcmlwdGlvbiwgJ2NvbnRyaWJBY2Nlc3NpYmlsaXR5SGVscENvbnRlbnQnKSAmJiBpdGVtLmFjY2Vzc2liaWxpdHlIZWxwQ29udGVudCkge1xuXHRcdFx0XHRcdFx0YWNjZXNzaWJpbGl0eUhlbHBDb250ZW50ID0gbmV3IE1hcmtkb3duU3RyaW5nKGl0ZW0uYWNjZXNzaWJpbGl0eUhlbHBDb250ZW50KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcjogSUN1c3RvbVZpZXdEZXNjcmlwdG9yID0ge1xuXHRcdFx0XHRcdFx0dHlwZTogdHlwZSxcblx0XHRcdFx0XHRcdGN0b3JEZXNjcmlwdG9yOiB0eXBlID09PSBWaWV3VHlwZS5UcmVlID8gbmV3IFN5bmNEZXNjcmlwdG9yKFRyZWVWaWV3UGFuZSkgOiBuZXcgU3luY0Rlc2NyaXB0b3IoV2Vidmlld1ZpZXdQYW5lKSxcblx0XHRcdFx0XHRcdGlkOiBpdGVtLmlkLFxuXHRcdFx0XHRcdFx0bmFtZTogeyB2YWx1ZTogaXRlbS5uYW1lLCBvcmlnaW5hbDogaXRlbS5uYW1lIH0sXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShpdGVtLndoZW4pLFxuXHRcdFx0XHRcdFx0Y29udGFpbmVySWNvbjogaWNvbiB8fCB2aWV3Q29udGFpbmVyPy5pY29uLFxuXHRcdFx0XHRcdFx0Y29udGFpbmVyVGl0bGU6IGl0ZW0uY29udGV4dHVhbFRpdGxlIHx8ICh2aWV3Q29udGFpbmVyICYmICh0eXBlb2Ygdmlld0NvbnRhaW5lci50aXRsZSA9PT0gJ3N0cmluZycgPyB2aWV3Q29udGFpbmVyLnRpdGxlIDogdmlld0NvbnRhaW5lci50aXRsZS52YWx1ZSkpLFxuXHRcdFx0XHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZSxcblx0XHRcdFx0XHRcdGNhbk1vdmVWaWV3OiB2aWV3Q29udGFpbmVyPy5pZCAhPT0gUkVNT1RFLFxuXHRcdFx0XHRcdFx0dHJlZVZpZXc6IHR5cGUgPT09IFZpZXdUeXBlLlRyZWUgPyB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEN1c3RvbVRyZWVWaWV3LCBpdGVtLmlkLCBpdGVtLm5hbWUsIGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGNvbGxhcHNlZDogdGhpcy5zaG93Q29sbGFwc2VkKGNvbnRhaW5lcikgfHwgaW5pdGlhbFZpc2liaWxpdHkgPT09IEluaXRpYWxWaXNpYmlsaXR5LkNvbGxhcHNlZCxcblx0XHRcdFx0XHRcdG9yZGVyOiBvcmRlcixcblx0XHRcdFx0XHRcdGV4dGVuc2lvbklkOiBleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllcixcblx0XHRcdFx0XHRcdG9yaWdpbmFsQ29udGFpbmVySWQ6IGtleSxcblx0XHRcdFx0XHRcdGdyb3VwOiBpdGVtLmdyb3VwLFxuXHRcdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0XHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IGl0ZW0ucmVtb3RlTmFtZSB8fCAoPGFueT5pdGVtKS5yZW1vdGVBdXRob3JpdHksIC8vIFRPRE9Acm9ibG91IC0gZGVsZXRlIGFmdGVyIHJlbW90ZSBleHRlbnNpb25zIGFyZSB1cGRhdGVkXG5cdFx0XHRcdFx0XHR2aXJ0dWFsV29ya3NwYWNlOiBpdGVtLnZpcnR1YWxXb3Jrc3BhY2UsXG5cdFx0XHRcdFx0XHRoaWRlQnlEZWZhdWx0OiBpbml0aWFsVmlzaWJpbGl0eSA9PT0gSW5pdGlhbFZpc2liaWxpdHkuSGlkZGVuLFxuXHRcdFx0XHRcdFx0d29ya3NwYWNlOiB2aWV3Q29udGFpbmVyPy5pZCA9PT0gUkVNT1RFID8gdHJ1ZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHdlaWdodCxcblx0XHRcdFx0XHRcdGFjY2Vzc2liaWxpdHlIZWxwQ29udGVudFxuXHRcdFx0XHRcdH07XG5cblxuXHRcdFx0XHRcdHZpZXdJZHMuYWRkKHZpZXdEZXNjcmlwdG9yLmlkKTtcblx0XHRcdFx0XHR2aWV3RGVzY3JpcHRvcnMucHVzaCh2aWV3RGVzY3JpcHRvcik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhbGxWaWV3RGVzY3JpcHRvcnMucHVzaCh7IHZpZXdDb250YWluZXI6IGNvbnRhaW5lciwgdmlld3M6IHZpZXdEZXNjcmlwdG9ycyB9KTtcblxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy52aWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld3MyKGFsbFZpZXdEZXNjcmlwdG9ycyk7XG5cdH1cblxuXHRwcml2YXRlIGdldFZpZXdUeXBlKHR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFZpZXdUeXBlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodHlwZSA9PT0gVmlld1R5cGUuV2Vidmlldykge1xuXHRcdFx0cmV0dXJuIFZpZXdUeXBlLldlYnZpZXc7XG5cdFx0fVxuXHRcdGlmICghdHlwZSB8fCB0eXBlID09PSBWaWV3VHlwZS5UcmVlKSB7XG5cdFx0XHRyZXR1cm4gVmlld1R5cGUuVHJlZTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGVmYXVsdFZpZXdDb250YWluZXIoKTogVmlld0NvbnRhaW5lciB7XG5cdFx0cmV0dXJuIHRoaXMudmlld0NvbnRhaW5lcnNSZWdpc3RyeS5nZXQoRVhQTE9SRVIpITtcblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlVmlld3MoZXh0ZW5zaW9uczogcmVhZG9ubHkgSUV4dGVuc2lvblBvaW50VXNlcjxWaWV3RXh0ZW5zaW9uUG9pbnRUeXBlPltdKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVtb3ZlZEV4dGVuc2lvbnM6IEV4dGVuc2lvbklkZW50aWZpZXJTZXQgPSBleHRlbnNpb25zLnJlZHVjZSgocmVzdWx0LCBlKSA9PiB7IHJlc3VsdC5hZGQoZS5kZXNjcmlwdGlvbi5pZGVudGlmaWVyKTsgcmV0dXJuIHJlc3VsdDsgfSwgbmV3IEV4dGVuc2lvbklkZW50aWZpZXJTZXQoKSk7XG5cdFx0Zm9yIChjb25zdCB2aWV3Q29udGFpbmVyIG9mIHRoaXMudmlld0NvbnRhaW5lcnNSZWdpc3RyeS5hbGwpIHtcblx0XHRcdGNvbnN0IHJlbW92ZWRWaWV3cyA9IHRoaXMudmlld3NSZWdpc3RyeS5nZXRWaWV3cyh2aWV3Q29udGFpbmVyKS5maWx0ZXIodiA9PiAodiBhcyBJQ3VzdG9tVmlld0Rlc2NyaXB0b3IpLmV4dGVuc2lvbklkICYmIHJlbW92ZWRFeHRlbnNpb25zLmhhcygodiBhcyBJQ3VzdG9tVmlld0Rlc2NyaXB0b3IpLmV4dGVuc2lvbklkKSk7XG5cdFx0XHRpZiAocmVtb3ZlZFZpZXdzLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLnZpZXdzUmVnaXN0cnkuZGVyZWdpc3RlclZpZXdzKHJlbW92ZWRWaWV3cywgdmlld0NvbnRhaW5lcik7XG5cdFx0XHRcdGZvciAoY29uc3QgdmlldyBvZiByZW1vdmVkVmlld3MpIHtcblx0XHRcdFx0XHRjb25zdCBhbnlWaWV3ID0gdmlldyBhcyBJQ3VzdG9tVmlld0Rlc2NyaXB0b3I7XG5cdFx0XHRcdFx0aWYgKGFueVZpZXcudHJlZVZpZXcpIHtcblx0XHRcdFx0XHRcdGFueVZpZXcudHJlZVZpZXcuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY29udmVydEluaXRpYWxWaXNpYmlsaXR5KHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJbml0aWFsVmlzaWJpbGl0eSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKE9iamVjdC52YWx1ZXMoSW5pdGlhbFZpc2liaWxpdHkpLmluY2x1ZGVzKHZhbHVlIGFzIEluaXRpYWxWaXNpYmlsaXR5KSkge1xuXHRcdFx0cmV0dXJuIHZhbHVlIGFzIEluaXRpYWxWaXNpYmlsaXR5O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1ZhbGlkVmlld0Rlc2NyaXB0b3JzKHZpZXdEZXNjcmlwdG9yczogSVVzZXJGcmllbmRseVZpZXdEZXNjcmlwdG9yW10sIGNvbGxlY3RvcjogRXh0ZW5zaW9uTWVzc2FnZUNvbGxlY3Rvcik6IGJvb2xlYW4ge1xuXHRcdGlmICghQXJyYXkuaXNBcnJheSh2aWV3RGVzY3JpcHRvcnMpKSB7XG5cdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ3JlcXVpcmVhcnJheScsIFwidmlld3MgbXVzdCBiZSBhbiBhcnJheVwiKSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBkZXNjcmlwdG9yIG9mIHZpZXdEZXNjcmlwdG9ycykge1xuXHRcdFx0aWYgKHR5cGVvZiBkZXNjcmlwdG9yLmlkICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ3JlcXVpcmVzdHJpbmcnLCBcInByb3BlcnR5IGB7MH1gIGlzIG1hbmRhdG9yeSBhbmQgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgXCIsICdpZCcpKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGVvZiBkZXNjcmlwdG9yLm5hbWUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgncmVxdWlyZXN0cmluZycsIFwicHJvcGVydHkgYHswfWAgaXMgbWFuZGF0b3J5IGFuZCBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ2BcIiwgJ25hbWUnKSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChkZXNjcmlwdG9yLndoZW4gJiYgdHlwZW9mIGRlc2NyaXB0b3Iud2hlbiAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdvcHRzdHJpbmcnLCBcInByb3BlcnR5IGB7MH1gIGNhbiBiZSBvbWl0dGVkIG9yIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nYFwiLCAnd2hlbicpKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGRlc2NyaXB0b3IuaWNvbiAmJiB0eXBlb2YgZGVzY3JpcHRvci5pY29uICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ29wdHN0cmluZycsIFwicHJvcGVydHkgYHswfWAgY2FuIGJlIG9taXR0ZWQgb3IgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgXCIsICdpY29uJykpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZGVzY3JpcHRvci5jb250ZXh0dWFsVGl0bGUgJiYgdHlwZW9mIGRlc2NyaXB0b3IuY29udGV4dHVhbFRpdGxlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ29wdHN0cmluZycsIFwicHJvcGVydHkgYHswfWAgY2FuIGJlIG9taXR0ZWQgb3IgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgXCIsICdjb250ZXh0dWFsVGl0bGUnKSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChkZXNjcmlwdG9yLnZpc2liaWxpdHkgJiYgIXRoaXMuY29udmVydEluaXRpYWxWaXNpYmlsaXR5KGRlc2NyaXB0b3IudmlzaWJpbGl0eSkpIHtcblx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdvcHRlbnVtJywgXCJwcm9wZXJ0eSBgezB9YCBjYW4gYmUgb21pdHRlZCBvciBtdXN0IGJlIG9uZSBvZiB7MX1cIiwgJ3Zpc2liaWxpdHknLCBPYmplY3QudmFsdWVzKEluaXRpYWxWaXNpYmlsaXR5KS5qb2luKCcsICcpKSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Vmlld0NvbnRhaW5lcih2YWx1ZTogc3RyaW5nKTogVmlld0NvbnRhaW5lciB8IHVuZGVmaW5lZCB7XG5cdFx0c3dpdGNoICh2YWx1ZSkge1xuXHRcdFx0Y2FzZSAnZXhwbG9yZXInOiByZXR1cm4gdGhpcy52aWV3Q29udGFpbmVyc1JlZ2lzdHJ5LmdldChFWFBMT1JFUik7XG5cdFx0XHRjYXNlICdkZWJ1Zyc6IHJldHVybiB0aGlzLnZpZXdDb250YWluZXJzUmVnaXN0cnkuZ2V0KERFQlVHKTtcblx0XHRcdGNhc2UgJ3NjbSc6IHJldHVybiB0aGlzLnZpZXdDb250YWluZXJzUmVnaXN0cnkuZ2V0KFNDTSk7XG5cdFx0XHRjYXNlICdyZW1vdGUnOiByZXR1cm4gdGhpcy52aWV3Q29udGFpbmVyc1JlZ2lzdHJ5LmdldChSRU1PVEUpO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIHRoaXMudmlld0NvbnRhaW5lcnNSZWdpc3RyeS5nZXQoYHdvcmtiZW5jaC52aWV3LmV4dGVuc2lvbi4ke3ZhbHVlfWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2hvd0NvbGxhcHNlZChjb250YWluZXI6IFZpZXdDb250YWluZXIpOiBib29sZWFuIHtcblx0XHRzd2l0Y2ggKGNvbnRhaW5lci5pZCkge1xuXHRcdFx0Y2FzZSBFWFBMT1JFUjpcblx0XHRcdGNhc2UgU0NNOlxuXHRcdFx0Y2FzZSBERUJVRzpcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5jbGFzcyBWaWV3Q29udGFpbmVyc0RhdGFSZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIge1xuXG5cdHJlYWRvbmx5IHR5cGUgPSAndGFibGUnO1xuXG5cdHNob3VsZFJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhbWFuaWZlc3QuY29udHJpYnV0ZXM/LnZpZXdzQ29udGFpbmVycztcblx0fVxuXG5cdHJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogSVJlbmRlcmVkRGF0YTxJVGFibGVEYXRhPiB7XG5cdFx0Y29uc3QgY29udHJpYiA9IG1hbmlmZXN0LmNvbnRyaWJ1dGVzPy52aWV3c0NvbnRhaW5lcnMgfHwge307XG5cblx0XHRjb25zdCB2aWV3Q29udGFpbmVycyA9IE9iamVjdC5rZXlzKGNvbnRyaWIpLnJlZHVjZSgocmVzdWx0LCBsb2NhdGlvbikgPT4ge1xuXHRcdFx0Y29uc3Qgdmlld0NvbnRhaW5lcnNGb3JMb2NhdGlvbiA9IGNvbnRyaWJbbG9jYXRpb25dO1xuXHRcdFx0cmVzdWx0LnB1c2goLi4udmlld0NvbnRhaW5lcnNGb3JMb2NhdGlvbi5tYXAodmlld0NvbnRhaW5lciA9PiAoeyAuLi52aWV3Q29udGFpbmVyLCBsb2NhdGlvbiB9KSkpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9LCBbXSBhcyBBcnJheTx7IGlkOiBzdHJpbmc7IHRpdGxlOiBzdHJpbmc7IGxvY2F0aW9uOiBzdHJpbmcgfT4pO1xuXG5cdFx0aWYgKCF2aWV3Q29udGFpbmVycy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB7IGRhdGE6IHsgaGVhZGVyczogW10sIHJvd3M6IFtdIH0sIGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBbXG5cdFx0XHRsb2NhbGl6ZSgndmlldyBjb250YWluZXIgaWQnLCBcIklEXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3ZpZXcgY29udGFpbmVyIHRpdGxlJywgXCJUaXRsZVwiKSxcblx0XHRcdGxvY2FsaXplKCd2aWV3IGNvbnRhaW5lciBsb2NhdGlvbicsIFwiV2hlcmVcIiksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHJvd3M6IElSb3dEYXRhW11bXSA9IHZpZXdDb250YWluZXJzXG5cdFx0XHQuc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKVxuXHRcdFx0Lm1hcCh2aWV3Q29udGFpbmVyID0+IHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHR2aWV3Q29udGFpbmVyLmlkLFxuXHRcdFx0XHRcdHZpZXdDb250YWluZXIudGl0bGUsXG5cdFx0XHRcdFx0dmlld0NvbnRhaW5lci5sb2NhdGlvblxuXHRcdFx0XHRdO1xuXHRcdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHRyb3dzXG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBWaWV3c0RhdGFSZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIge1xuXG5cdHJlYWRvbmx5IHR5cGUgPSAndGFibGUnO1xuXG5cdHNob3VsZFJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhbWFuaWZlc3QuY29udHJpYnV0ZXM/LnZpZXdzO1xuXHR9XG5cblx0cmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBJUmVuZGVyZWREYXRhPElUYWJsZURhdGE+IHtcblx0XHRjb25zdCBjb250cmliID0gbWFuaWZlc3QuY29udHJpYnV0ZXM/LnZpZXdzIHx8IHt9O1xuXG5cdFx0Y29uc3Qgdmlld3MgPSBPYmplY3Qua2V5cyhjb250cmliKS5yZWR1Y2UoKHJlc3VsdCwgbG9jYXRpb24pID0+IHtcblx0XHRcdGNvbnN0IHZpZXdzRm9yTG9jYXRpb24gPSBjb250cmliW2xvY2F0aW9uXTtcblx0XHRcdHJlc3VsdC5wdXNoKC4uLnZpZXdzRm9yTG9jYXRpb24ubWFwKHZpZXcgPT4gKHsgLi4udmlldywgbG9jYXRpb24gfSkpKTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSwgW10gYXMgQXJyYXk8eyBpZDogc3RyaW5nOyBuYW1lOiBzdHJpbmc7IGxvY2F0aW9uOiBzdHJpbmcgfT4pO1xuXG5cdFx0aWYgKCF2aWV3cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB7IGRhdGE6IHsgaGVhZGVyczogW10sIHJvd3M6IFtdIH0sIGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBbXG5cdFx0XHRsb2NhbGl6ZSgndmlldyBpZCcsIFwiSURcIiksXG5cdFx0XHRsb2NhbGl6ZSgndmlldyBuYW1lIHRpdGxlJywgXCJOYW1lXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3ZpZXcgY29udGFpbmVyIGxvY2F0aW9uJywgXCJXaGVyZVwiKSxcblx0XHRdO1xuXG5cdFx0Y29uc3Qgcm93czogSVJvd0RhdGFbXVtdID0gdmlld3Ncblx0XHRcdC5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpXG5cdFx0XHQubWFwKHZpZXcgPT4ge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdHZpZXcuaWQsXG5cdFx0XHRcdFx0dmlldy5uYW1lLFxuXHRcdFx0XHRcdHZpZXcubG9jYXRpb25cblx0XHRcdFx0XTtcblx0XHRcdH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0cm93c1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdH07XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnk+KEV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnlFeHRlbnNpb25zLkV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnkpLnJlZ2lzdGVyRXh0ZW5zaW9uRmVhdHVyZSh7XG5cdGlkOiAndmlld3NDb250YWluZXJzJyxcblx0bGFiZWw6IGxvY2FsaXplKCd2aWV3c0NvbnRhaW5lcnMnLCBcIlZpZXcgQ29udGFpbmVyc1wiKSxcblx0YWNjZXNzOiB7XG5cdFx0Y2FuVG9nZ2xlOiBmYWxzZVxuXHR9LFxuXHRyZW5kZXJlcjogbmV3IFN5bmNEZXNjcmlwdG9yKFZpZXdDb250YWluZXJzRGF0YVJlbmRlcmVyKSxcbn0pO1xuXG5SZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeUV4dGVuc2lvbnMuRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSkucmVnaXN0ZXJFeHRlbnNpb25GZWF0dXJlKHtcblx0aWQ6ICd2aWV3cycsXG5cdGxhYmVsOiBsb2NhbGl6ZSgndmlld3MnLCBcIlZpZXdzXCIpLFxuXHRhY2Nlc3M6IHtcblx0XHRjYW5Ub2dnbGU6IGZhbHNlXG5cdH0sXG5cdHJlbmRlcmVyOiBuZXcgU3luY0Rlc2NyaXB0b3IoVmlld3NEYXRhUmVuZGVyZXIpLFxufSk7XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihWaWV3c0V4dGVuc2lvbkhhbmRsZXIuSUQsIFZpZXdzRXh0ZW5zaW9uSGFuZGxlciwgV29ya2JlbmNoUGhhc2UuQmxvY2tTdGFydHVwKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxrQkFBa0I7QUFDM0IsWUFBWSxlQUFlO0FBQzNCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsZ0JBQWdC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QSxNQUFNLDBCQUEwQixXQUFxRDtBQUFBLEVBQXJGO0FBQUE7QUFFQyxTQUFTLE9BQU87QUFBQTtBQUFBLEVBRWhCLGFBQWEsVUFBdUM7QUFDbkQsV0FBTyxDQUFDLENBQUMsU0FBUyxhQUFhO0FBQUEsRUFDaEM7QUFBQSxFQUVBLE9BQU8sVUFBeUQ7QUFDL0QsVUFBTSxVQUFVLFNBQVMsYUFBYSxTQUFTLENBQUM7QUFFaEQsVUFBTSxRQUFRLE9BQU8sS0FBSyxPQUFPLEVBQUUsT0FBTyxDQUFDLFFBQVEsYUFBYTtBQUMvRCxZQUFNLG1CQUFtQixRQUFRLFFBQVE7QUFDekMsYUFBTyxLQUFLLEdBQUcsaUJBQWlCLElBQUksV0FBUyxFQUFFLEdBQUcsTUFBTSxTQUFTLEVBQUUsQ0FBQztBQUNwRSxhQUFPO0FBQUEsSUFDUixHQUFHLENBQUMsQ0FBMEQ7QUFFOUQsUUFBSSxDQUFDLE1BQU0sUUFBUTtBQUNsQixhQUFPLEVBQUUsTUFBTSxFQUFFLFNBQVMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxFQUFFLEdBQUcsU0FBUyxNQUFNO0FBQUEsTUFBRSxFQUFFO0FBQUEsSUFDOUQ7QUFFQSxVQUFNLFVBQVU7QUFBQSxNQUNmLFNBQVMsV0FBVyxJQUFJO0FBQUEsTUFDeEIsU0FBUyxtQkFBbUIsTUFBTTtBQUFBLE1BQ2xDLFNBQVMsMkJBQTJCLE9BQU87QUFBQSxJQUM1QztBQUVBLFVBQU0sT0FBcUIsTUFDekIsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLEdBQUcsY0FBYyxFQUFFLEVBQUUsQ0FBQyxFQUN2QyxJQUFJLFVBQVE7QUFDWixhQUFPO0FBQUEsUUFDTixLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsTUFDTjtBQUFBLElBQ0QsQ0FBQztBQUVGLFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxRQUNMO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFNBQVMsTUFBTTtBQUFBLE1BQUU7QUFBQSxJQUNsQjtBQUFBLEVBQ0Q7QUFDRDtBQUVBLFNBQVMsR0FBK0Isb0NBQW9DLHlCQUF5QixFQUFFLHlCQUF5QjtBQUFBLEVBQy9ILElBQUk7QUFBQSxFQUNKLE9BQU8sU0FBUyxtQkFBbUIsaUJBQWlCO0FBQUEsRUFDcEQsUUFBUTtBQUFBLElBQ1AsV0FBVztBQUFBLEVBQ1o7QUFBQSxFQUNBLFVBQVUsSUFBSSxlQUFlLDBCQUEwQjtBQUN4RCxDQUFDO0FBRUQsU0FBUyxHQUErQixvQ0FBb0MseUJBQXlCLEVBQUUseUJBQXlCO0FBQUEsRUFDL0gsSUFBSTtBQUFBLEVBQ0osT0FBTyxTQUFTLFNBQVMsT0FBTztBQUFBLEVBQ2hDLFFBQVE7QUFBQSxJQUNQLFdBQVc7QUFBQSxFQUNaO0FBQUEsRUFDQSxVQUFVLElBQUksZUFBZSxpQkFBaUI7QUFDL0MsQ0FBQztBQUVELCtCQUErQixzQkFBc0IsSUFBSSx1QkFBdUIsZUFBZSxZQUFZOyIsCiAgIm5hbWVzIjogWyJWaWV3VHlwZSIsICJJbml0aWFsVmlzaWJpbGl0eSIsICJ2aWV3RGVzY3JpcHRvciIsICJ2YWx1ZSJdCn0K
