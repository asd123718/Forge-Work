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
import { DeferredPromise, disposableTimeout, RunOnceScheduler } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Event } from "../../../../base/common/event.js";
import { DisposableStore, toDisposable, Disposable } from "../../../../base/common/lifecycle.js";
import { autorun, derived, observableValue } from "../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { ByteSize, IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { DefaultQuickAccessFilterValue } from "../../../../platform/quickinput/common/quickAccess.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { IChatWidgetService } from "../../chat/browser/chat.js";
import { IChatAttachmentResolveService } from "../../chat/browser/attachments/chatAttachmentResolveService.js";
import { IMcpService, isMcpResourceTemplate, McpCapability, McpConnectionState, McpResourceURI } from "../common/mcpTypes.js";
import { McpIcons } from "../common/mcpIcons.js";
import { openPanelChatAndGetWidget } from "./openPanelChatAndGetWidget.js";
import { LinkedList } from "../../../../base/common/linkedList.js";
import { asArray } from "../../../../base/common/arrays.js";
let McpResourcePickHelper = class extends Disposable {
  constructor(_mcpService, _fileService, _quickInputService, _notificationService, _chatAttachmentResolveService) {
    super();
    this._mcpService = _mcpService;
    this._fileService = _fileService;
    this._quickInputService = _quickInputService;
    this._notificationService = _notificationService;
    this._chatAttachmentResolveService = _chatAttachmentResolveService;
    this._resources = observableValue(this, { picks: /* @__PURE__ */ new Map(), isBusy: true });
    this._pickItemsStack = new LinkedList();
    this._inDirectory = observableValue(this, void 0);
    this.hasServersWithResources = derived((reader) => {
      let enabled = false;
      for (const server of this._mcpService.servers.read(reader)) {
        const cap = server.capabilities.read(void 0);
        if (cap === void 0) {
          enabled = true;
        } else if (cap & McpCapability.Resources) {
          enabled = true;
          break;
        }
      }
      return enabled;
    });
    this.checkIfNestedResources = () => !this._pickItemsStack.isEmpty();
  }
  static sep(server) {
    return {
      id: server.definition.id,
      type: "separator",
      label: server.definition.label
    };
  }
  addCurrentMCPQuickPickItemLevel(server, resources) {
    let isValidPush = false;
    isValidPush = this._pickItemsStack.isEmpty();
    if (!isValidPush) {
      const stackedItem = this._pickItemsStack.peek();
      if (stackedItem?.server === server && stackedItem.resources === resources) {
        isValidPush = false;
      } else {
        isValidPush = true;
      }
    }
    if (isValidPush) {
      this._pickItemsStack.push({ server, resources });
    }
  }
  navigateBack() {
    const items = this._pickItemsStack.pop();
    if (items) {
      this._inDirectory.set({ server: items.server, resources: items.resources }, void 0);
      return true;
    } else {
      return false;
    }
  }
  static item(resource) {
    const iconPath = resource.icons.getUrl(22);
    if (isMcpResourceTemplate(resource)) {
      return {
        id: resource.template.template,
        label: resource.title || resource.name,
        description: resource.description,
        detail: localize("mcp.resource.template", "Resource template: {0}", resource.template.template),
        iconPath
      };
    }
    return {
      id: resource.uri.toString(),
      label: resource.title || resource.name,
      description: resource.description,
      detail: resource.mcpUri + (resource.sizeInBytes !== void 0 ? " (" + ByteSize.formatSize(resource.sizeInBytes) + ")" : ""),
      iconPath
    };
  }
  /**
   * Navigate to a resource if it's a directory.
   * Returns true if the resource is a directory with children (navigation succeeded).
   * Returns false if the resource is a leaf file (no navigation).
   * When returning true, statefully updates the picker state to display directory contents.
   */
  async navigate(resource, server) {
    if (isMcpResourceTemplate(resource)) {
      return false;
    }
    const uri = resource.uri;
    let stat = void 0;
    try {
      stat = await this._fileService.resolve(uri, { resolveMetadata: false });
    } catch (e) {
      return false;
    }
    if (stat && this._isDirectoryResource(resource) && (stat.children?.length ?? 0) > 0) {
      const currentResources = this._resources.get().picks.get(server);
      if (currentResources) {
        this.addCurrentMCPQuickPickItemLevel(server, currentResources);
      }
      const childResources = stat.children.map((child) => {
        const mcpUri = McpResourceURI.fromServer(server.definition, child.resource.toString());
        return {
          uri: mcpUri,
          mcpUri: child.resource.path,
          name: child.name,
          title: child.name,
          description: resource.description,
          mimeType: void 0,
          sizeInBytes: child.size,
          icons: McpIcons.fromParsed(void 0)
        };
      });
      this._inDirectory.set({ server, resources: childResources }, void 0);
      return true;
    }
    return false;
  }
  toAttachment(resource, server) {
    const noop = "noop";
    if (this._isDirectoryResource(resource)) {
      this.checkIfDirectoryAndPopulate(resource, server);
      return noop;
    }
    if (isMcpResourceTemplate(resource)) {
      return this._resourceTemplateToAttachment(resource).then((val) => val || noop);
    } else {
      return this._resourceToAttachment(resource).then((val) => val || noop);
    }
  }
  async checkIfDirectoryAndPopulate(resource, server) {
    try {
      return !await this.navigate(resource, server);
    } catch (error) {
      return false;
    }
  }
  async toURI(resource) {
    if (isMcpResourceTemplate(resource)) {
      const maybeUri = await this._resourceTemplateToURI(resource);
      return maybeUri && await this._verifyUriIfNeeded(maybeUri);
    } else {
      return resource.uri;
    }
  }
  async _resourceToAttachment(resource) {
    const asImage = await this._chatAttachmentResolveService.resolveImageEditorAttachContext(resource.uri, void 0, resource.mimeType);
    if (asImage) {
      return asImage;
    }
    return {
      id: resource.uri.toString(),
      kind: "file",
      name: resource.name,
      value: resource.uri
    };
  }
  async _resourceTemplateToAttachment(rt) {
    const maybeUri = await this._resourceTemplateToURI(rt);
    const uri = maybeUri && await this._verifyUriIfNeeded(maybeUri);
    return uri && this._resourceToAttachment({
      uri,
      name: rt.name,
      mimeType: rt.mimeType
    });
  }
  async _verifyUriIfNeeded({ uri, needsVerification }) {
    if (!needsVerification) {
      return uri;
    }
    const exists = await this._fileService.exists(uri);
    if (exists) {
      return uri;
    }
    this._notificationService.warn(localize("mcp.resource.template.notFound", "The resource {0} was not found.", McpResourceURI.toServer(uri).resourceURL.toString()));
    return void 0;
  }
  async _resourceTemplateToURI(rt) {
    const todo = rt.template.components.flatMap((c) => typeof c === "object" ? c.variables : []);
    const quickInput = this._quickInputService.createQuickPick();
    const cts = new CancellationTokenSource();
    const vars = {};
    quickInput.totalSteps = todo.length;
    quickInput.ignoreFocusOut = true;
    let needsVerification = false;
    try {
      for (let i = 0; i < todo.length; i++) {
        const variable = todo[i];
        const resolved = await this._promptForTemplateValue(quickInput, variable, vars, rt);
        if (resolved === void 0) {
          return void 0;
        }
        needsVerification ||= !resolved.completed;
        vars[todo[i].name] = variable.repeatable ? resolved.value.split("/") : resolved.value;
      }
      return { uri: rt.resolveURI(vars), needsVerification };
    } finally {
      cts.dispose(true);
      quickInput.dispose();
    }
  }
  _promptForTemplateValue(input, variable, variablesSoFar, rt) {
    const store = new DisposableStore();
    const completions = /* @__PURE__ */ new Map([]);
    const variablesWithPlaceholders = { ...variablesSoFar };
    for (const variable2 of rt.template.components.flatMap((c) => typeof c === "object" ? c.variables : [])) {
      if (!variablesWithPlaceholders.hasOwnProperty(variable2.name)) {
        variablesWithPlaceholders[variable2.name] = `$${variable2.name.toUpperCase()}`;
      }
    }
    let placeholder = localize("mcp.resource.template.placeholder", "Value for ${0} in {1}", variable.name.toUpperCase(), rt.template.resolve(variablesWithPlaceholders).replaceAll("%24", "$"));
    if (variable.optional) {
      placeholder += " (" + localize("mcp.resource.template.optional", "Optional") + ")";
    }
    input.placeholder = placeholder;
    input.value = "";
    input.items = [];
    input.show();
    const currentID = generateUuid();
    const setItems = (value, completed = []) => {
      const items = completed.filter((c) => c !== value).map((c) => ({ id: c, label: c }));
      if (value) {
        items.unshift({ id: currentID, label: value });
      } else if (variable.optional) {
        items.unshift({ id: currentID, label: localize("mcp.resource.template.empty", "<Empty>") });
      }
      input.items = items;
    };
    let changeCancellation = new CancellationTokenSource();
    store.add(toDisposable(() => changeCancellation.dispose(true)));
    const getCompletionItems = () => {
      const inputValue = input.value;
      let promise = completions.get(inputValue);
      if (!promise) {
        promise = rt.complete(variable.name, inputValue, variablesSoFar, changeCancellation.token);
        completions.set(inputValue, promise);
      }
      promise.then((values) => {
        if (!changeCancellation.token.isCancellationRequested) {
          setItems(inputValue, values);
        }
      }).catch(() => {
        completions.delete(inputValue);
      }).finally(() => {
        if (!changeCancellation.token.isCancellationRequested) {
          input.busy = false;
        }
      });
    };
    const getCompletionItemsScheduler = store.add(new RunOnceScheduler(getCompletionItems, 300));
    return new Promise((resolve) => {
      store.add(input.onDidHide(() => resolve(void 0)));
      store.add(input.onDidAccept(() => {
        const item = input.selectedItems[0];
        if (item.id === currentID) {
          resolve({ value: input.value, completed: false });
        } else if (variable.explodable && item.label.endsWith("/") && item.label !== input.value) {
          input.value = item.label;
        } else {
          resolve({ value: item.label, completed: true });
        }
      }));
      store.add(input.onDidChangeValue((value) => {
        input.busy = true;
        changeCancellation.dispose(true);
        changeCancellation = new CancellationTokenSource();
        getCompletionItemsScheduler.cancel();
        setItems(value);
        if (completions.has(input.value)) {
          getCompletionItems();
        } else {
          getCompletionItemsScheduler.schedule();
        }
      }));
      getCompletionItems();
    }).finally(() => store.dispose());
  }
  _isDirectoryResource(resource) {
    if (resource.mimeType && resource.mimeType === "inode/directory") {
      return true;
    } else if (isMcpResourceTemplate(resource)) {
      return resource.template.template.endsWith("/");
    } else {
      return resource.uri.path.endsWith("/");
    }
  }
  getPicks(token) {
    const cts = new CancellationTokenSource(token);
    let isBusyLoadingPicks = true;
    this._register(toDisposable(() => cts.dispose(true)));
    let showInSequence = true;
    this._register(disposableTimeout(() => {
      showInSequence = false;
      publish();
    }, 5e3));
    const publish = () => {
      const output = /* @__PURE__ */ new Map();
      for (const [server, rec] of servers) {
        const r = [];
        output.set(server, r);
        if (rec.templates.isResolved) {
          r.push(...rec.templates.value);
        } else if (showInSequence) {
          break;
        }
        r.push(...rec.resourcesSoFar);
        if (!rec.resources.isSettled && showInSequence) {
          break;
        }
      }
      this._resources.set({ picks: output, isBusy: isBusyLoadingPicks }, void 0);
    };
    const servers = /* @__PURE__ */ new Map();
    Promise.all((this.explicitServers || this._mcpService.servers.get()).map(async (server) => {
      let cap = server.capabilities.get();
      const rec = {
        templates: new DeferredPromise(),
        resourcesSoFar: [],
        resources: new DeferredPromise()
      };
      servers.set(server, rec);
      if (cap === void 0) {
        cap = await new Promise((resolve) => {
          server.start().then((state) => {
            if (state.state === McpConnectionState.Kind.Error || state.state === McpConnectionState.Kind.Stopped) {
              resolve(void 0);
            }
          });
          this._register(cts.token.onCancellationRequested(() => resolve(void 0)));
          this._register(autorun((reader) => {
            const cap2 = server.capabilities.read(reader);
            if (cap2 !== void 0) {
              resolve(cap2);
            }
          }));
        });
      }
      if (cap && cap & McpCapability.Resources) {
        await Promise.all([
          rec.templates.settleWith(server.resourceTemplates(cts.token).catch(() => [])).finally(publish),
          rec.resources.settleWith((async () => {
            for await (const page of server.resources(cts.token)) {
              rec.resourcesSoFar = rec.resourcesSoFar.concat(page);
              publish();
            }
          })())
        ]);
      } else {
        rec.templates.complete([]);
        rec.resources.complete([]);
      }
    })).finally(() => {
      isBusyLoadingPicks = false;
      publish();
    });
    return derived(this, (reader) => {
      const directoryResource = this._inDirectory.read(reader);
      return directoryResource ? { picks: /* @__PURE__ */ new Map([[directoryResource.server, directoryResource.resources]]), isBusy: false } : this._resources.read(reader);
    });
  }
};
McpResourcePickHelper = __decorateClass([
  __decorateParam(0, IMcpService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IChatAttachmentResolveService)
], McpResourcePickHelper);
let AbstractMcpResourceAccessPick = class {
  constructor(_scopeTo, _instantiationService, _editorService, _chatWidgetService, _viewsService) {
    this._scopeTo = _scopeTo;
    this._instantiationService = _instantiationService;
    this._editorService = _editorService;
    this._chatWidgetService = _chatWidgetService;
    this._viewsService = _viewsService;
  }
  applyToPick(picker, token, runOptions) {
    picker.canAcceptInBackground = true;
    picker.busy = true;
    picker.keepScrollPosition = true;
    const store = new DisposableStore();
    const goBackId = "_goback_";
    const attachButton = localize("mcp.quickaccess.attach", "Attach to chat");
    const helper = store.add(this._instantiationService.createInstance(McpResourcePickHelper));
    if (this._scopeTo) {
      helper.explicitServers = [this._scopeTo];
    }
    const picksObservable = helper.getPicks(token);
    store.add(autorun((reader) => {
      const pickItems = picksObservable.read(reader);
      const isBusy = pickItems.isBusy;
      const items = [];
      for (const [server, resources] of pickItems.picks) {
        items.push(McpResourcePickHelper.sep(server));
        for (const resource of resources) {
          const pickItem = McpResourcePickHelper.item(resource);
          pickItem.buttons = [{ iconClass: ThemeIcon.asClassName(Codicon.attach), tooltip: attachButton }];
          items.push({ ...pickItem, resource, server });
        }
      }
      if (helper.checkIfNestedResources()) {
        const goBackItem = {
          id: goBackId,
          label: localize("goBack", "Go back \u21A9"),
          alwaysShow: true
        };
        items.push(goBackItem);
      }
      picker.items = items;
      picker.busy = isBusy;
    }));
    store.add(picker.onDidTriggerItemButton((event) => {
      if (event.button.tooltip === attachButton) {
        picker.busy = true;
        const resourceItem = event.item;
        const attachment = helper.toAttachment(resourceItem.resource, resourceItem.server);
        if (attachment instanceof Promise) {
          attachment.then(async (a) => {
            if (a !== "noop") {
              const widget = await openPanelChatAndGetWidget(this._viewsService, this._chatWidgetService);
              widget?.attachmentModel.addContext(...asArray(a));
            }
            picker.hide();
          });
        }
      }
    }));
    store.add(picker.onDidHide(() => {
      helper.dispose();
    }));
    store.add(picker.onDidAccept(async (event) => {
      try {
        picker.busy = true;
        const [item] = picker.selectedItems;
        if (item.id === goBackId) {
          helper.navigateBack();
          picker.busy = false;
          return;
        }
        const resourceItem = item;
        const resource = resourceItem.resource;
        const isNested = await helper.navigate(resource, resourceItem.server);
        if (!isNested) {
          const uri = await helper.toURI(resource);
          if (uri) {
            picker.hide();
            this._editorService.openEditor({ resource: uri, options: { preserveFocus: event.inBackground } });
          }
        }
      } finally {
        picker.busy = false;
      }
    }));
    return store;
  }
};
AbstractMcpResourceAccessPick = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IChatWidgetService),
  __decorateParam(4, IViewsService)
], AbstractMcpResourceAccessPick);
let McpResourceQuickPick = class extends AbstractMcpResourceAccessPick {
  constructor(scopeTo, instantiationService, editorService, chatWidgetService, viewsService, _quickInputService) {
    super(scopeTo, instantiationService, editorService, chatWidgetService, viewsService);
    this._quickInputService = _quickInputService;
  }
  async pick(token = CancellationToken.None) {
    const store = new DisposableStore();
    const qp = store.add(this._quickInputService.createQuickPick({ useSeparators: true }));
    qp.placeholder = localize("mcp.quickaccess.placeholder", "Search for resources");
    store.add(this.applyToPick(qp, token));
    store.add(qp.onDidHide(() => store.dispose()));
    qp.show();
    await Event.toPromise(qp.onDidHide);
  }
};
McpResourceQuickPick = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IChatWidgetService),
  __decorateParam(4, IViewsService),
  __decorateParam(5, IQuickInputService)
], McpResourceQuickPick);
let McpResourceQuickAccess = class extends AbstractMcpResourceAccessPick {
  constructor(instantiationService, editorService, chatWidgetService, viewsService) {
    super(void 0, instantiationService, editorService, chatWidgetService, viewsService);
    this.defaultFilterValue = DefaultQuickAccessFilterValue.LAST;
  }
  provide(picker, token, runOptions) {
    return this.applyToPick(picker, token, runOptions);
  }
};
McpResourceQuickAccess.PREFIX = "mcpr ";
McpResourceQuickAccess = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IEditorService),
  __decorateParam(2, IChatWidgetService),
  __decorateParam(3, IViewsService)
], McpResourceQuickAccess);
export {
  AbstractMcpResourceAccessPick,
  McpResourcePickHelper,
  McpResourceQuickAccess,
  McpResourceQuickPick
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcYnJvd3NlclxcbWNwUmVzb3VyY2VRdWlja0FjY2Vzcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgZGlzcG9zYWJsZVRpbWVvdXQsIFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlLCBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlcml2ZWQsIG9ic2VydmFibGVWYWx1ZSwgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBCeXRlU2l6ZSwgSUZpbGVTZXJ2aWNlLCBJRmlsZVN0YXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IERlZmF1bHRRdWlja0FjY2Vzc0ZpbHRlclZhbHVlLCBJUXVpY2tBY2Nlc3NQcm92aWRlciwgSVF1aWNrQWNjZXNzUHJvdmlkZXJSdW5PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrLCBJUXVpY2tQaWNrSXRlbSwgSVF1aWNrUGlja1NlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvYXR0YWNobWVudHMvY2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBJTWNwUmVzb3VyY2UsIElNY3BSZXNvdXJjZVRlbXBsYXRlLCBJTWNwU2VydmVyLCBJTWNwU2VydmljZSwgaXNNY3BSZXNvdXJjZVRlbXBsYXRlLCBNY3BDYXBhYmlsaXR5LCBNY3BDb25uZWN0aW9uU3RhdGUsIE1jcFJlc291cmNlVVJJIH0gZnJvbSAnLi4vY29tbW9uL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IE1jcEljb25zIH0gZnJvbSAnLi4vY29tbW9uL21jcEljb25zLmpzJztcbmltcG9ydCB7IElVcmlUZW1wbGF0ZVZhcmlhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpVGVtcGxhdGUuanMnO1xuaW1wb3J0IHsgb3BlblBhbmVsQ2hhdEFuZEdldFdpZGdldCB9IGZyb20gJy4vb3BlblBhbmVsQ2hhdEFuZEdldFdpZGdldC5qcyc7XG5pbXBvcnQgeyBMaW5rZWRMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlua2VkTGlzdC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dFBpY2tBdHRhY2htZW50IH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2F0dGFjaG1lbnRzL2NoYXRDb250ZXh0UGlja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBNY3BSZXNvdXJjZVBpY2tIZWxwZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfcmVzb3VyY2VzID0gb2JzZXJ2YWJsZVZhbHVlPHsgcGlja3M6IE1hcDxJTWNwU2VydmVyLCAoSU1jcFJlc291cmNlVGVtcGxhdGUgfCBJTWNwUmVzb3VyY2UpW10+OyBpc0J1c3k6IGJvb2xlYW4gfT4odGhpcywgeyBwaWNrczogbmV3IE1hcCgpLCBpc0J1c3k6IHRydWUgfSk7XG5cdHByaXZhdGUgX3BpY2tJdGVtc1N0YWNrOiBMaW5rZWRMaXN0PHsgc2VydmVyOiBJTWNwU2VydmVyOyByZXNvdXJjZXM6IChJTWNwUmVzb3VyY2UgfCBJTWNwUmVzb3VyY2VUZW1wbGF0ZSlbXSB9PiA9IG5ldyBMaW5rZWRMaXN0KCk7XG5cdHByaXZhdGUgX2luRGlyZWN0b3J5ID0gb2JzZXJ2YWJsZVZhbHVlPHVuZGVmaW5lZCB8IHsgc2VydmVyOiBJTWNwU2VydmVyOyByZXNvdXJjZXM6IChJTWNwUmVzb3VyY2UgfCBJTWNwUmVzb3VyY2VUZW1wbGF0ZSlbXSB9Pih0aGlzLCB1bmRlZmluZWQpO1xuXHRwdWJsaWMgc3RhdGljIHNlcChzZXJ2ZXI6IElNY3BTZXJ2ZXIpOiBJUXVpY2tQaWNrU2VwYXJhdG9yIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IHNlcnZlci5kZWZpbml0aW9uLmlkLFxuXHRcdFx0dHlwZTogJ3NlcGFyYXRvcicsXG5cdFx0XHRsYWJlbDogc2VydmVyLmRlZmluaXRpb24ubGFiZWwsXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBhZGRDdXJyZW50TUNQUXVpY2tQaWNrSXRlbUxldmVsKHNlcnZlcjogSU1jcFNlcnZlciwgcmVzb3VyY2VzOiAoSU1jcFJlc291cmNlIHwgSU1jcFJlc291cmNlVGVtcGxhdGUpW10pOiB2b2lkIHtcblx0XHRsZXQgaXNWYWxpZFB1c2g6IGJvb2xlYW4gPSBmYWxzZTtcblx0XHRpc1ZhbGlkUHVzaCA9IHRoaXMuX3BpY2tJdGVtc1N0YWNrLmlzRW1wdHkoKTtcblx0XHRpZiAoIWlzVmFsaWRQdXNoKSB7XG5cdFx0XHRjb25zdCBzdGFja2VkSXRlbSA9IHRoaXMuX3BpY2tJdGVtc1N0YWNrLnBlZWsoKTtcblx0XHRcdGlmIChzdGFja2VkSXRlbT8uc2VydmVyID09PSBzZXJ2ZXIgJiYgc3RhY2tlZEl0ZW0ucmVzb3VyY2VzID09PSByZXNvdXJjZXMpIHtcblx0XHRcdFx0aXNWYWxpZFB1c2ggPSBmYWxzZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlzVmFsaWRQdXNoID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGlzVmFsaWRQdXNoKSB7XG5cdFx0XHR0aGlzLl9waWNrSXRlbXNTdGFjay5wdXNoKHsgc2VydmVyLCByZXNvdXJjZXMgfSk7XG5cdFx0fVxuXG5cdH1cblxuXHRwdWJsaWMgbmF2aWdhdGVCYWNrKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5fcGlja0l0ZW1zU3RhY2sucG9wKCk7XG5cdFx0aWYgKGl0ZW1zKSB7XG5cdFx0XHR0aGlzLl9pbkRpcmVjdG9yeS5zZXQoeyBzZXJ2ZXI6IGl0ZW1zLnNlcnZlciwgcmVzb3VyY2VzOiBpdGVtcy5yZXNvdXJjZXMgfSwgdW5kZWZpbmVkKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHN0YXRpYyBpdGVtKHJlc291cmNlOiBJTWNwUmVzb3VyY2UgfCBJTWNwUmVzb3VyY2VUZW1wbGF0ZSk6IElRdWlja1BpY2tJdGVtIHtcblx0XHRjb25zdCBpY29uUGF0aCA9IHJlc291cmNlLmljb25zLmdldFVybCgyMik7XG5cdFx0aWYgKGlzTWNwUmVzb3VyY2VUZW1wbGF0ZShyZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiByZXNvdXJjZS50ZW1wbGF0ZS50ZW1wbGF0ZSxcblx0XHRcdFx0bGFiZWw6IHJlc291cmNlLnRpdGxlIHx8IHJlc291cmNlLm5hbWUsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiByZXNvdXJjZS5kZXNjcmlwdGlvbixcblx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnbWNwLnJlc291cmNlLnRlbXBsYXRlJywgJ1Jlc291cmNlIHRlbXBsYXRlOiB7MH0nLCByZXNvdXJjZS50ZW1wbGF0ZS50ZW1wbGF0ZSksXG5cdFx0XHRcdGljb25QYXRoLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IHJlc291cmNlLnVyaS50b1N0cmluZygpLFxuXHRcdFx0bGFiZWw6IHJlc291cmNlLnRpdGxlIHx8IHJlc291cmNlLm5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogcmVzb3VyY2UuZGVzY3JpcHRpb24sXG5cdFx0XHRkZXRhaWw6IHJlc291cmNlLm1jcFVyaSArIChyZXNvdXJjZS5zaXplSW5CeXRlcyAhPT0gdW5kZWZpbmVkID8gJyAoJyArIEJ5dGVTaXplLmZvcm1hdFNpemUocmVzb3VyY2Uuc2l6ZUluQnl0ZXMpICsgJyknIDogJycpLFxuXHRcdFx0aWNvblBhdGgsXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBoYXNTZXJ2ZXJzV2l0aFJlc291cmNlcyA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRsZXQgZW5hYmxlZCA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHRoaXMuX21jcFNlcnZpY2Uuc2VydmVycy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdGNvbnN0IGNhcCA9IHNlcnZlci5jYXBhYmlsaXRpZXMucmVhZCh1bmRlZmluZWQpO1xuXHRcdFx0aWYgKGNhcCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGVuYWJsZWQgPSB0cnVlOyAvLyB1bnRpbCB3ZSBrbm93IG1vcmVcblx0XHRcdH0gZWxzZSBpZiAoY2FwICYgTWNwQ2FwYWJpbGl0eS5SZXNvdXJjZXMpIHtcblx0XHRcdFx0ZW5hYmxlZCA9IHRydWU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBlbmFibGVkO1xuXHR9KTtcblxuXHRwdWJsaWMgZXhwbGljaXRTZXJ2ZXJzPzogSU1jcFNlcnZlcltdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWNwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tY3BTZXJ2aWNlOiBJTWNwU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZTogSUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBOYXZpZ2F0ZSB0byBhIHJlc291cmNlIGlmIGl0J3MgYSBkaXJlY3RvcnkuXG5cdCAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgcmVzb3VyY2UgaXMgYSBkaXJlY3Rvcnkgd2l0aCBjaGlsZHJlbiAobmF2aWdhdGlvbiBzdWNjZWVkZWQpLlxuXHQgKiBSZXR1cm5zIGZhbHNlIGlmIHRoZSByZXNvdXJjZSBpcyBhIGxlYWYgZmlsZSAobm8gbmF2aWdhdGlvbikuXG5cdCAqIFdoZW4gcmV0dXJuaW5nIHRydWUsIHN0YXRlZnVsbHkgdXBkYXRlcyB0aGUgcGlja2VyIHN0YXRlIHRvIGRpc3BsYXkgZGlyZWN0b3J5IGNvbnRlbnRzLlxuXHQgKi9cblx0cHVibGljIGFzeW5jIG5hdmlnYXRlKHJlc291cmNlOiBJTWNwUmVzb3VyY2UgfCBJTWNwUmVzb3VyY2VUZW1wbGF0ZSwgc2VydmVyOiBJTWNwU2VydmVyKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKGlzTWNwUmVzb3VyY2VUZW1wbGF0ZShyZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCB1cmkgPSByZXNvdXJjZS51cmk7XG5cdFx0bGV0IHN0YXQ6IElGaWxlU3RhdCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0c3RhdCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlc29sdmUodXJpLCB7IHJlc29sdmVNZXRhZGF0YTogZmFsc2UgfSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChzdGF0ICYmIHRoaXMuX2lzRGlyZWN0b3J5UmVzb3VyY2UocmVzb3VyY2UpICYmIChzdGF0LmNoaWxkcmVuPy5sZW5ndGggPz8gMCkgPiAwKSB7XG5cdFx0XHQvLyBTYXZlIGN1cnJlbnQgc3RhdGUgdG8gc3RhY2sgYmVmb3JlIG5hdmlnYXRpbmdcblx0XHRcdGNvbnN0IGN1cnJlbnRSZXNvdXJjZXMgPSB0aGlzLl9yZXNvdXJjZXMuZ2V0KCkucGlja3MuZ2V0KHNlcnZlcik7XG5cdFx0XHRpZiAoY3VycmVudFJlc291cmNlcykge1xuXHRcdFx0XHR0aGlzLmFkZEN1cnJlbnRNQ1BRdWlja1BpY2tJdGVtTGV2ZWwoc2VydmVyLCBjdXJyZW50UmVzb3VyY2VzKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ29udmVydCBhbGwgdGhlIGNoaWxkcmVuIHRvIElNY3BSZXNvdXJjZSBvYmplY3RzXG5cdFx0XHRjb25zdCBjaGlsZFJlc291cmNlczogSU1jcFJlc291cmNlW10gPSBzdGF0LmNoaWxkcmVuIS5tYXAoY2hpbGQgPT4ge1xuXHRcdFx0XHRjb25zdCBtY3BVcmkgPSBNY3BSZXNvdXJjZVVSSS5mcm9tU2VydmVyKHNlcnZlci5kZWZpbml0aW9uLCBjaGlsZC5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR1cmk6IG1jcFVyaSxcblx0XHRcdFx0XHRtY3BVcmk6IGNoaWxkLnJlc291cmNlLnBhdGgsXG5cdFx0XHRcdFx0bmFtZTogY2hpbGQubmFtZSxcblx0XHRcdFx0XHR0aXRsZTogY2hpbGQubmFtZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogcmVzb3VyY2UuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0bWltZVR5cGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzaXplSW5CeXRlczogY2hpbGQuc2l6ZSxcblx0XHRcdFx0XHRpY29uczogTWNwSWNvbnMuZnJvbVBhcnNlZCh1bmRlZmluZWQpXG5cdFx0XHRcdH07XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX2luRGlyZWN0b3J5LnNldCh7IHNlcnZlciwgcmVzb3VyY2VzOiBjaGlsZFJlc291cmNlcyB9LCB1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyB0b0F0dGFjaG1lbnQocmVzb3VyY2U6IElNY3BSZXNvdXJjZSB8IElNY3BSZXNvdXJjZVRlbXBsYXRlLCBzZXJ2ZXI6IElNY3BTZXJ2ZXIpOiBQcm9taXNlPENoYXRDb250ZXh0UGlja0F0dGFjaG1lbnQ+IHwgJ25vb3AnIHtcblx0XHRjb25zdCBub29wID0gJ25vb3AnO1xuXHRcdGlmICh0aGlzLl9pc0RpcmVjdG9yeVJlc291cmNlKHJlc291cmNlKSkge1xuXHRcdFx0Ly9DaGVjayBpZiBkaXJlY3Rvcnlcblx0XHRcdHRoaXMuY2hlY2tJZkRpcmVjdG9yeUFuZFBvcHVsYXRlKHJlc291cmNlLCBzZXJ2ZXIpO1xuXHRcdFx0cmV0dXJuIG5vb3A7XG5cdFx0fVxuXHRcdGlmIChpc01jcFJlc291cmNlVGVtcGxhdGUocmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVzb3VyY2VUZW1wbGF0ZVRvQXR0YWNobWVudChyZXNvdXJjZSkudGhlbih2YWwgPT4gdmFsIHx8IG5vb3ApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVzb3VyY2VUb0F0dGFjaG1lbnQocmVzb3VyY2UpLnRoZW4odmFsID0+IHZhbCB8fCBub29wKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgY2hlY2tJZkRpcmVjdG9yeUFuZFBvcHVsYXRlKHJlc291cmNlOiBJTWNwUmVzb3VyY2UgfCBJTWNwUmVzb3VyY2VUZW1wbGF0ZSwgc2VydmVyOiBJTWNwU2VydmVyKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiAhYXdhaXQgdGhpcy5uYXZpZ2F0ZShyZXNvdXJjZSwgc2VydmVyKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyB0b1VSSShyZXNvdXJjZTogSU1jcFJlc291cmNlIHwgSU1jcFJlc291cmNlVGVtcGxhdGUpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChpc01jcFJlc291cmNlVGVtcGxhdGUocmVzb3VyY2UpKSB7XG5cdFx0XHRjb25zdCBtYXliZVVyaSA9IGF3YWl0IHRoaXMuX3Jlc291cmNlVGVtcGxhdGVUb1VSSShyZXNvdXJjZSk7XG5cdFx0XHRyZXR1cm4gbWF5YmVVcmkgJiYgYXdhaXQgdGhpcy5fdmVyaWZ5VXJpSWZOZWVkZWQobWF5YmVVcmkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gcmVzb3VyY2UudXJpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBjaGVja0lmTmVzdGVkUmVzb3VyY2VzID0gKCkgPT4gIXRoaXMuX3BpY2tJdGVtc1N0YWNrLmlzRW1wdHkoKTtcblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvdXJjZVRvQXR0YWNobWVudChyZXNvdXJjZTogeyB1cmk6IFVSSTsgbmFtZTogc3RyaW5nOyBtaW1lVHlwZT86IHN0cmluZyB9KTogUHJvbWlzZTxJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYXNJbWFnZSA9IGF3YWl0IHRoaXMuX2NoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UucmVzb2x2ZUltYWdlRWRpdG9yQXR0YWNoQ29udGV4dChyZXNvdXJjZS51cmksIHVuZGVmaW5lZCwgcmVzb3VyY2UubWltZVR5cGUpO1xuXHRcdGlmIChhc0ltYWdlKSB7XG5cdFx0XHRyZXR1cm4gYXNJbWFnZTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IHJlc291cmNlLnVyaS50b1N0cmluZygpLFxuXHRcdFx0a2luZDogJ2ZpbGUnLFxuXHRcdFx0bmFtZTogcmVzb3VyY2UubmFtZSxcblx0XHRcdHZhbHVlOiByZXNvdXJjZS51cmksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc291cmNlVGVtcGxhdGVUb0F0dGFjaG1lbnQocnQ6IElNY3BSZXNvdXJjZVRlbXBsYXRlKSB7XG5cdFx0Y29uc3QgbWF5YmVVcmkgPSBhd2FpdCB0aGlzLl9yZXNvdXJjZVRlbXBsYXRlVG9VUkkocnQpO1xuXHRcdGNvbnN0IHVyaSA9IG1heWJlVXJpICYmIGF3YWl0IHRoaXMuX3ZlcmlmeVVyaUlmTmVlZGVkKG1heWJlVXJpKTtcblx0XHRyZXR1cm4gdXJpICYmIHRoaXMuX3Jlc291cmNlVG9BdHRhY2htZW50KHtcblx0XHRcdHVyaSxcblx0XHRcdG5hbWU6IHJ0Lm5hbWUsXG5cdFx0XHRtaW1lVHlwZTogcnQubWltZVR5cGUsXG5cdFx0fSk7XG5cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3ZlcmlmeVVyaUlmTmVlZGVkKHsgdXJpLCBuZWVkc1ZlcmlmaWNhdGlvbiB9OiB7IHVyaTogVVJJOyBuZWVkc1ZlcmlmaWNhdGlvbjogYm9vbGVhbiB9KTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIW5lZWRzVmVyaWZpY2F0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdXJpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyh1cmkpO1xuXHRcdGlmIChleGlzdHMpIHtcblx0XHRcdHJldHVybiB1cmk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS53YXJuKGxvY2FsaXplKCdtY3AucmVzb3VyY2UudGVtcGxhdGUubm90Rm91bmQnLCBcIlRoZSByZXNvdXJjZSB7MH0gd2FzIG5vdCBmb3VuZC5cIiwgTWNwUmVzb3VyY2VVUkkudG9TZXJ2ZXIodXJpKS5yZXNvdXJjZVVSTC50b1N0cmluZygpKSk7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc291cmNlVGVtcGxhdGVUb1VSSShydDogSU1jcFJlc291cmNlVGVtcGxhdGUpIHtcblx0XHRjb25zdCB0b2RvID0gcnQudGVtcGxhdGUuY29tcG9uZW50cy5mbGF0TWFwKGMgPT4gdHlwZW9mIGMgPT09ICdvYmplY3QnID8gYy52YXJpYWJsZXMgOiBbXSk7XG5cblx0XHRjb25zdCBxdWlja0lucHV0ID0gdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrKCk7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0XHRjb25zdCB2YXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBzdHJpbmdbXT4gPSB7fTtcblx0XHRxdWlja0lucHV0LnRvdGFsU3RlcHMgPSB0b2RvLmxlbmd0aDtcblx0XHRxdWlja0lucHV0Lmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblx0XHRsZXQgbmVlZHNWZXJpZmljYXRpb24gPSBmYWxzZTtcblxuXHRcdHRyeSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRvZG8ubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgdmFyaWFibGUgPSB0b2RvW2ldO1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHRoaXMuX3Byb21wdEZvclRlbXBsYXRlVmFsdWUocXVpY2tJbnB1dCwgdmFyaWFibGUsIHZhcnMsIHJ0KTtcblx0XHRcdFx0aWYgKHJlc29sdmVkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIG1hcmsgdGhlIFVSSSBhcyBuZWVkaW5nIHZlcmlmaWNhdGlvbiBpZiBhbnkgcGFydCB3YXMgbm90IGEgY29tcGxldGlvbiBwaWNrXG5cdFx0XHRcdG5lZWRzVmVyaWZpY2F0aW9uIHx8PSAhcmVzb2x2ZWQuY29tcGxldGVkO1xuXHRcdFx0XHR2YXJzW3RvZG9baV0ubmFtZV0gPSB2YXJpYWJsZS5yZXBlYXRhYmxlID8gcmVzb2x2ZWQudmFsdWUuc3BsaXQoJy8nKSA6IHJlc29sdmVkLnZhbHVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgdXJpOiBydC5yZXNvbHZlVVJJKHZhcnMpLCBuZWVkc1ZlcmlmaWNhdGlvbiB9O1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjdHMuZGlzcG9zZSh0cnVlKTtcblx0XHRcdHF1aWNrSW5wdXQuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Byb21wdEZvclRlbXBsYXRlVmFsdWUoaW5wdXQ6IElRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0+LCB2YXJpYWJsZTogSVVyaVRlbXBsYXRlVmFyaWFibGUsIHZhcmlhYmxlc1NvRmFyOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBzdHJpbmdbXT4sIHJ0OiBJTWNwUmVzb3VyY2VUZW1wbGF0ZSk6IFByb21pc2U8eyB2YWx1ZTogc3RyaW5nOyBjb21wbGV0ZWQ6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGNvbXBsZXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8c3RyaW5nW10+PihbXSk7XG5cblx0XHRjb25zdCB2YXJpYWJsZXNXaXRoUGxhY2Vob2xkZXJzID0geyAuLi52YXJpYWJsZXNTb0ZhciB9O1xuXHRcdGZvciAoY29uc3QgdmFyaWFibGUgb2YgcnQudGVtcGxhdGUuY29tcG9uZW50cy5mbGF0TWFwKGMgPT4gdHlwZW9mIGMgPT09ICdvYmplY3QnID8gYy52YXJpYWJsZXMgOiBbXSkpIHtcblx0XHRcdGlmICghdmFyaWFibGVzV2l0aFBsYWNlaG9sZGVycy5oYXNPd25Qcm9wZXJ0eSh2YXJpYWJsZS5uYW1lKSkge1xuXHRcdFx0XHR2YXJpYWJsZXNXaXRoUGxhY2Vob2xkZXJzW3ZhcmlhYmxlLm5hbWVdID0gYCQke3ZhcmlhYmxlLm5hbWUudG9VcHBlckNhc2UoKX1gO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBwbGFjZWhvbGRlciA9IGxvY2FsaXplKCdtY3AucmVzb3VyY2UudGVtcGxhdGUucGxhY2Vob2xkZXInLCBcIlZhbHVlIGZvciAkezB9IGluIHsxfVwiLCB2YXJpYWJsZS5uYW1lLnRvVXBwZXJDYXNlKCksIHJ0LnRlbXBsYXRlLnJlc29sdmUodmFyaWFibGVzV2l0aFBsYWNlaG9sZGVycykucmVwbGFjZUFsbCgnJTI0JywgJyQnKSk7XG5cdFx0aWYgKHZhcmlhYmxlLm9wdGlvbmFsKSB7XG5cdFx0XHRwbGFjZWhvbGRlciArPSAnICgnICsgbG9jYWxpemUoJ21jcC5yZXNvdXJjZS50ZW1wbGF0ZS5vcHRpb25hbCcsIFwiT3B0aW9uYWxcIikgKyAnKSc7XG5cdFx0fVxuXG5cdFx0aW5wdXQucGxhY2Vob2xkZXIgPSBwbGFjZWhvbGRlcjtcblx0XHRpbnB1dC52YWx1ZSA9ICcnO1xuXHRcdGlucHV0Lml0ZW1zID0gW107XG5cdFx0aW5wdXQuc2hvdygpO1xuXG5cdFx0Y29uc3QgY3VycmVudElEID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3Qgc2V0SXRlbXMgPSAodmFsdWU6IHN0cmluZywgY29tcGxldGVkOiBzdHJpbmdbXSA9IFtdKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGNvbXBsZXRlZC5maWx0ZXIoYyA9PiBjICE9PSB2YWx1ZSkubWFwKGMgPT4gKHsgaWQ6IGMsIGxhYmVsOiBjIH0pKTtcblx0XHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0XHRpdGVtcy51bnNoaWZ0KHsgaWQ6IGN1cnJlbnRJRCwgbGFiZWw6IHZhbHVlIH0pO1xuXHRcdFx0fSBlbHNlIGlmICh2YXJpYWJsZS5vcHRpb25hbCkge1xuXHRcdFx0XHRpdGVtcy51bnNoaWZ0KHsgaWQ6IGN1cnJlbnRJRCwgbGFiZWw6IGxvY2FsaXplKCdtY3AucmVzb3VyY2UudGVtcGxhdGUuZW1wdHknLCBcIjxFbXB0eT5cIikgfSk7XG5cdFx0XHR9XG5cblx0XHRcdGlucHV0Lml0ZW1zID0gaXRlbXM7XG5cdFx0fTtcblxuXHRcdGxldCBjaGFuZ2VDYW5jZWxsYXRpb24gPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNoYW5nZUNhbmNlbGxhdGlvbi5kaXNwb3NlKHRydWUpKSk7XG5cblx0XHRjb25zdCBnZXRDb21wbGV0aW9uSXRlbXMgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dFZhbHVlID0gaW5wdXQudmFsdWU7XG5cdFx0XHRsZXQgcHJvbWlzZSA9IGNvbXBsZXRpb25zLmdldChpbnB1dFZhbHVlKTtcblx0XHRcdGlmICghcHJvbWlzZSkge1xuXHRcdFx0XHRwcm9taXNlID0gcnQuY29tcGxldGUodmFyaWFibGUubmFtZSwgaW5wdXRWYWx1ZSwgdmFyaWFibGVzU29GYXIsIGNoYW5nZUNhbmNlbGxhdGlvbi50b2tlbik7XG5cdFx0XHRcdGNvbXBsZXRpb25zLnNldChpbnB1dFZhbHVlLCBwcm9taXNlKTtcblx0XHRcdH1cblxuXHRcdFx0cHJvbWlzZS50aGVuKHZhbHVlcyA9PiB7XG5cdFx0XHRcdGlmICghY2hhbmdlQ2FuY2VsbGF0aW9uLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0c2V0SXRlbXMoaW5wdXRWYWx1ZSwgdmFsdWVzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkuY2F0Y2goKCkgPT4ge1xuXHRcdFx0XHRjb21wbGV0aW9ucy5kZWxldGUoaW5wdXRWYWx1ZSk7XG5cdFx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0aWYgKCFjaGFuZ2VDYW5jZWxsYXRpb24udG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRpbnB1dC5idXN5ID0gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH07XG5cblx0XHRjb25zdCBnZXRDb21wbGV0aW9uSXRlbXNTY2hlZHVsZXIgPSBzdG9yZS5hZGQobmV3IFJ1bk9uY2VTY2hlZHVsZXIoZ2V0Q29tcGxldGlvbkl0ZW1zLCAzMDApKTtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx7IHZhbHVlOiBzdHJpbmc7IGNvbXBsZXRlZDogYm9vbGVhbiB9IHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdHN0b3JlLmFkZChpbnB1dC5vbkRpZEhpZGUoKCkgPT4gcmVzb2x2ZSh1bmRlZmluZWQpKSk7XG5cdFx0XHRzdG9yZS5hZGQoaW5wdXQub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpdGVtID0gaW5wdXQuc2VsZWN0ZWRJdGVtc1swXTtcblx0XHRcdFx0aWYgKGl0ZW0uaWQgPT09IGN1cnJlbnRJRCkge1xuXHRcdFx0XHRcdHJlc29sdmUoeyB2YWx1ZTogaW5wdXQudmFsdWUsIGNvbXBsZXRlZDogZmFsc2UgfSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodmFyaWFibGUuZXhwbG9kYWJsZSAmJiBpdGVtLmxhYmVsLmVuZHNXaXRoKCcvJykgJiYgaXRlbS5sYWJlbCAhPT0gaW5wdXQudmFsdWUpIHtcblx0XHRcdFx0XHQvLyBpZiBuYXZpZ2F0aW5nIGluIGEgcGF0aCBzdHJ1Y3R1cmUsIHBpY2tpbmcgYSBgL2Agc2hvdWxkIGxldCB0aGUgdXNlciBwaWNrIGluIGEgc3ViZGlyZWN0b3J5XG5cdFx0XHRcdFx0aW5wdXQudmFsdWUgPSBpdGVtLmxhYmVsO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc29sdmUoeyB2YWx1ZTogaXRlbS5sYWJlbCwgY29tcGxldGVkOiB0cnVlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRzdG9yZS5hZGQoaW5wdXQub25EaWRDaGFuZ2VWYWx1ZSh2YWx1ZSA9PiB7XG5cdFx0XHRcdGlucHV0LmJ1c3kgPSB0cnVlO1xuXHRcdFx0XHRjaGFuZ2VDYW5jZWxsYXRpb24uZGlzcG9zZSh0cnVlKTtcblx0XHRcdFx0Y2hhbmdlQ2FuY2VsbGF0aW9uID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRcdGdldENvbXBsZXRpb25JdGVtc1NjaGVkdWxlci5jYW5jZWwoKTtcblx0XHRcdFx0c2V0SXRlbXModmFsdWUpO1xuXG5cdFx0XHRcdGlmIChjb21wbGV0aW9ucy5oYXMoaW5wdXQudmFsdWUpKSB7XG5cdFx0XHRcdFx0Z2V0Q29tcGxldGlvbkl0ZW1zKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Z2V0Q29tcGxldGlvbkl0ZW1zU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0Z2V0Q29tcGxldGlvbkl0ZW1zKCk7XG5cdFx0fSkuZmluYWxseSgoKSA9PiBzdG9yZS5kaXNwb3NlKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNEaXJlY3RvcnlSZXNvdXJjZShyZXNvdXJjZTogSU1jcFJlc291cmNlIHwgSU1jcFJlc291cmNlVGVtcGxhdGUpOiBib29sZWFuIHtcblxuXHRcdGlmIChyZXNvdXJjZS5taW1lVHlwZSAmJiByZXNvdXJjZS5taW1lVHlwZSA9PT0gJ2lub2RlL2RpcmVjdG9yeScpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSBpZiAoaXNNY3BSZXNvdXJjZVRlbXBsYXRlKHJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHJlc291cmNlLnRlbXBsYXRlLnRlbXBsYXRlLmVuZHNXaXRoKCcvJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiByZXNvdXJjZS51cmkucGF0aC5lbmRzV2l0aCgnLycpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRQaWNrcyh0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogSU9ic2VydmFibGU8eyBwaWNrczogTWFwPElNY3BTZXJ2ZXIsIChJTWNwUmVzb3VyY2VUZW1wbGF0ZSB8IElNY3BSZXNvdXJjZSlbXT47IGlzQnVzeTogYm9vbGVhbiB9PiB7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHRva2VuKTtcblx0XHRsZXQgaXNCdXN5TG9hZGluZ1BpY2tzID0gdHJ1ZTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblx0XHQvLyBXZSB0cnkgdG8gc2hvdyBldmVyeXRoaW5nIGluLXNlcXVlbmNlIHRvIGF2b2lkIGZsaWNrZXJpbmcgKCMyNTA0MTEpIGFzIGxvbmcgYXNcblx0XHQvLyBpdCBsb2FkcyB3aXRoaW4gNSBzZWNvbmRzLiBPdGhlcndpc2Ugd2UganVzdCBzaG93IHRoaW5ncyBhcyB0aGUgbG9hZCBpbiBwYXJhbGxlbC5cblx0XHRsZXQgc2hvd0luU2VxdWVuY2UgPSB0cnVlO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdHNob3dJblNlcXVlbmNlID0gZmFsc2U7XG5cdFx0XHRwdWJsaXNoKCk7XG5cdFx0fSwgNV8wMDApKTtcblxuXHRcdGNvbnN0IHB1Ymxpc2ggPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBuZXcgTWFwPElNY3BTZXJ2ZXIsIChJTWNwUmVzb3VyY2VUZW1wbGF0ZSB8IElNY3BSZXNvdXJjZSlbXT4oKTtcblx0XHRcdGZvciAoY29uc3QgW3NlcnZlciwgcmVjXSBvZiBzZXJ2ZXJzKSB7XG5cdFx0XHRcdGNvbnN0IHI6IChJTWNwUmVzb3VyY2VUZW1wbGF0ZSB8IElNY3BSZXNvdXJjZSlbXSA9IFtdO1xuXHRcdFx0XHRvdXRwdXQuc2V0KHNlcnZlciwgcik7XG5cdFx0XHRcdGlmIChyZWMudGVtcGxhdGVzLmlzUmVzb2x2ZWQpIHtcblx0XHRcdFx0XHRyLnB1c2goLi4ucmVjLnRlbXBsYXRlcy52YWx1ZSEpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHNob3dJblNlcXVlbmNlKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyLnB1c2goLi4ucmVjLnJlc291cmNlc1NvRmFyKTtcblx0XHRcdFx0aWYgKCFyZWMucmVzb3VyY2VzLmlzU2V0dGxlZCAmJiBzaG93SW5TZXF1ZW5jZSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9yZXNvdXJjZXMuc2V0KHsgcGlja3M6IG91dHB1dCwgaXNCdXN5OiBpc0J1c3lMb2FkaW5nUGlja3MgfSwgdW5kZWZpbmVkKTtcblx0XHR9O1xuXG5cdFx0dHlwZSBSZWMgPSB7IHRlbXBsYXRlczogRGVmZXJyZWRQcm9taXNlPElNY3BSZXNvdXJjZVRlbXBsYXRlW10+OyByZXNvdXJjZXNTb0ZhcjogSU1jcFJlc291cmNlW107IHJlc291cmNlczogRGVmZXJyZWRQcm9taXNlPHVua25vd24+IH07XG5cblx0XHRjb25zdCBzZXJ2ZXJzID0gbmV3IE1hcDxJTWNwU2VydmVyLCBSZWM+KCk7XG5cdFx0Ly8gRW51bWVyYXRlIHNlcnZlcnMgYW5kIHN0YXJ0IHNlcnZlcnMgdGhhdCBuZWVkIHRvIGJlIHN0YXJ0ZWQgdG8gZ2V0IGNhcGFiaWxpdGllc1xuXHRcdFByb21pc2UuYWxsKCh0aGlzLmV4cGxpY2l0U2VydmVycyB8fCB0aGlzLl9tY3BTZXJ2aWNlLnNlcnZlcnMuZ2V0KCkpLm1hcChhc3luYyBzZXJ2ZXIgPT4ge1xuXHRcdFx0bGV0IGNhcCA9IHNlcnZlci5jYXBhYmlsaXRpZXMuZ2V0KCk7XG5cdFx0XHRjb25zdCByZWM6IFJlYyA9IHtcblx0XHRcdFx0dGVtcGxhdGVzOiBuZXcgRGVmZXJyZWRQcm9taXNlKCksXG5cdFx0XHRcdHJlc291cmNlc1NvRmFyOiBbXSxcblx0XHRcdFx0cmVzb3VyY2VzOiBuZXcgRGVmZXJyZWRQcm9taXNlKCksXG5cdFx0XHR9O1xuXHRcdFx0c2VydmVycy5zZXQoc2VydmVyLCByZWMpOyAvLyBhbHdheXMgYWRkIGl0IHRvIHJldGFpbiBvcmRlclxuXG5cdFx0XHRpZiAoY2FwID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y2FwID0gYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdFx0c2VydmVyLnN0YXJ0KCkudGhlbihzdGF0ZSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoc3RhdGUuc3RhdGUgPT09IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLkVycm9yIHx8IHN0YXRlLnN0YXRlID09PSBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5TdG9wcGVkKSB7XG5cdFx0XHRcdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR0aGlzLl9yZWdpc3RlcihjdHMudG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gcmVzb2x2ZSh1bmRlZmluZWQpKSk7XG5cdFx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgY2FwMiA9IHNlcnZlci5jYXBhYmlsaXRpZXMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdFx0aWYgKGNhcDIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKGNhcDIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjYXAgJiYgKGNhcCAmIE1jcENhcGFiaWxpdHkuUmVzb3VyY2VzKSkge1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdFx0cmVjLnRlbXBsYXRlcy5zZXR0bGVXaXRoKHNlcnZlci5yZXNvdXJjZVRlbXBsYXRlcyhjdHMudG9rZW4pLmNhdGNoKCgpID0+IFtdKSkuZmluYWxseShwdWJsaXNoKSxcblx0XHRcdFx0XHRyZWMucmVzb3VyY2VzLnNldHRsZVdpdGgoKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGZvciBhd2FpdCAoY29uc3QgcGFnZSBvZiBzZXJ2ZXIucmVzb3VyY2VzKGN0cy50b2tlbikpIHtcblx0XHRcdFx0XHRcdFx0cmVjLnJlc291cmNlc1NvRmFyID0gcmVjLnJlc291cmNlc1NvRmFyLmNvbmNhdChwYWdlKTtcblx0XHRcdFx0XHRcdFx0cHVibGlzaCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKCkpXG5cdFx0XHRcdF0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVjLnRlbXBsYXRlcy5jb21wbGV0ZShbXSk7XG5cdFx0XHRcdHJlYy5yZXNvdXJjZXMuY29tcGxldGUoW10pO1xuXHRcdFx0fVxuXHRcdH0pKS5maW5hbGx5KCgpID0+IHtcblx0XHRcdGlzQnVzeUxvYWRpbmdQaWNrcyA9IGZhbHNlO1xuXHRcdFx0cHVibGlzaCgpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gVXNlIGRlcml2ZWQgdG8gY29tcHV0ZSB0aGUgYXBwcm9wcmlhdGUgcmVzb3VyY2UgbWFwIGJhc2VkIG9uIGRpcmVjdG9yeSBuYXZpZ2F0aW9uIHN0YXRlXG5cdFx0cmV0dXJuIGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGRpcmVjdG9yeVJlc291cmNlID0gdGhpcy5faW5EaXJlY3RvcnkucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIGRpcmVjdG9yeVJlc291cmNlXG5cdFx0XHRcdD8geyBwaWNrczogbmV3IE1hcChbW2RpcmVjdG9yeVJlc291cmNlLnNlcnZlciwgZGlyZWN0b3J5UmVzb3VyY2UucmVzb3VyY2VzXV0pLCBpc0J1c3k6IGZhbHNlIH1cblx0XHRcdFx0OiB0aGlzLl9yZXNvdXJjZXMucmVhZChyZWFkZXIpO1xuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdE1jcFJlc291cmNlQWNjZXNzUGljayB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Njb3BlVG86IElNY3BTZXJ2ZXIgfCB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASVZpZXdzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF92aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0cHJvdGVjdGVkIGFwcGx5VG9QaWNrKHBpY2tlcjogSVF1aWNrUGljazxJUXVpY2tQaWNrSXRlbSwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIHJ1bk9wdGlvbnM/OiBJUXVpY2tBY2Nlc3NQcm92aWRlclJ1bk9wdGlvbnMpIHtcblx0XHRwaWNrZXIuY2FuQWNjZXB0SW5CYWNrZ3JvdW5kID0gdHJ1ZTtcblx0XHRwaWNrZXIuYnVzeSA9IHRydWU7XG5cdFx0cGlja2VyLmtlZXBTY3JvbGxQb3NpdGlvbiA9IHRydWU7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZ29CYWNrSWQgPSAnX2dvYmFja18nO1xuXG5cdFx0dHlwZSBSZXNvdXJjZVF1aWNrUGlja0l0ZW0gPSBJUXVpY2tQaWNrSXRlbSAmIHsgcmVzb3VyY2U6IElNY3BSZXNvdXJjZSB8IElNY3BSZXNvdXJjZVRlbXBsYXRlOyBzZXJ2ZXI6IElNY3BTZXJ2ZXIgfTtcblxuXHRcdGNvbnN0IGF0dGFjaEJ1dHRvbiA9IGxvY2FsaXplKCdtY3AucXVpY2thY2Nlc3MuYXR0YWNoJywgXCJBdHRhY2ggdG8gY2hhdFwiKTtcblxuXHRcdGNvbnN0IGhlbHBlciA9IHN0b3JlLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BSZXNvdXJjZVBpY2tIZWxwZXIpKTtcblx0XHRpZiAodGhpcy5fc2NvcGVUbykge1xuXHRcdFx0aGVscGVyLmV4cGxpY2l0U2VydmVycyA9IFt0aGlzLl9zY29wZVRvXTtcblx0XHR9XG5cdFx0Y29uc3QgcGlja3NPYnNlcnZhYmxlID0gaGVscGVyLmdldFBpY2tzKHRva2VuKTtcblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcGlja0l0ZW1zID0gcGlja3NPYnNlcnZhYmxlLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGlzQnVzeSA9IHBpY2tJdGVtcy5pc0J1c3k7XG5cdFx0XHRjb25zdCBpdGVtczogKFJlc291cmNlUXVpY2tQaWNrSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3IgfCBJUXVpY2tQaWNrSXRlbSlbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBbc2VydmVyLCByZXNvdXJjZXNdIG9mIHBpY2tJdGVtcy5waWNrcykge1xuXHRcdFx0XHRpdGVtcy5wdXNoKE1jcFJlc291cmNlUGlja0hlbHBlci5zZXAoc2VydmVyKSk7XG5cdFx0XHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgcmVzb3VyY2VzKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGlja0l0ZW0gPSBNY3BSZXNvdXJjZVBpY2tIZWxwZXIuaXRlbShyZXNvdXJjZSk7XG5cdFx0XHRcdFx0cGlja0l0ZW0uYnV0dG9ucyA9IFt7IGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uYXR0YWNoKSwgdG9vbHRpcDogYXR0YWNoQnV0dG9uIH1dO1xuXHRcdFx0XHRcdGl0ZW1zLnB1c2goeyAuLi5waWNrSXRlbSwgcmVzb3VyY2UsIHNlcnZlciB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGhlbHBlci5jaGVja0lmTmVzdGVkUmVzb3VyY2VzKCkpIHtcblx0XHRcdFx0Ly8gQWRkIGdvIGJhY2sgaXRlbVxuXHRcdFx0XHRjb25zdCBnb0JhY2tJdGVtOiBJUXVpY2tQaWNrSXRlbSA9IHtcblx0XHRcdFx0XHRpZDogZ29CYWNrSWQsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdnb0JhY2snLCAnR28gYmFjayBcdTIxQTknKSxcblx0XHRcdFx0XHRhbHdheXNTaG93OiB0cnVlXG5cdFx0XHRcdH07XG5cdFx0XHRcdGl0ZW1zLnB1c2goZ29CYWNrSXRlbSk7XG5cdFx0XHR9XG5cdFx0XHRwaWNrZXIuaXRlbXMgPSBpdGVtcztcblx0XHRcdHBpY2tlci5idXN5ID0gaXNCdXN5O1xuXHRcdH0pKTtcblxuXHRcdHN0b3JlLmFkZChwaWNrZXIub25EaWRUcmlnZ2VySXRlbUJ1dHRvbihldmVudCA9PiB7XG5cdFx0XHRpZiAoZXZlbnQuYnV0dG9uLnRvb2x0aXAgPT09IGF0dGFjaEJ1dHRvbikge1xuXHRcdFx0XHRwaWNrZXIuYnVzeSA9IHRydWU7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlSXRlbSA9IGV2ZW50Lml0ZW0gYXMgUmVzb3VyY2VRdWlja1BpY2tJdGVtO1xuXHRcdFx0XHRjb25zdCBhdHRhY2htZW50ID0gaGVscGVyLnRvQXR0YWNobWVudChyZXNvdXJjZUl0ZW0ucmVzb3VyY2UsIHJlc291cmNlSXRlbS5zZXJ2ZXIpO1xuXHRcdFx0XHRpZiAoYXR0YWNobWVudCBpbnN0YW5jZW9mIFByb21pc2UpIHtcblx0XHRcdFx0XHRhdHRhY2htZW50LnRoZW4oYXN5bmMgYSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoYSAhPT0gJ25vb3AnKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHdpZGdldCA9IGF3YWl0IG9wZW5QYW5lbENoYXRBbmRHZXRXaWRnZXQodGhpcy5fdmlld3NTZXJ2aWNlLCB0aGlzLl9jaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0XHRcdFx0XHRcdHdpZGdldD8uYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoLi4uYXNBcnJheShhKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRwaWNrZXIuaGlkZSgpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0c3RvcmUuYWRkKHBpY2tlci5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0aGVscGVyLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cblx0XHRzdG9yZS5hZGQocGlja2VyLm9uRGlkQWNjZXB0KGFzeW5jIGV2ZW50ID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHBpY2tlci5idXN5ID0gdHJ1ZTtcblx0XHRcdFx0Y29uc3QgW2l0ZW1dID0gcGlja2VyLnNlbGVjdGVkSXRlbXM7XG5cblx0XHRcdFx0Ly8gQ2hlY2sgaWYgZ28gYmFjayBpdGVtIHdhcyBzZWxlY3RlZFxuXHRcdFx0XHRpZiAoaXRlbS5pZCA9PT0gZ29CYWNrSWQpIHtcblx0XHRcdFx0XHRoZWxwZXIubmF2aWdhdGVCYWNrKCk7XG5cdFx0XHRcdFx0cGlja2VyLmJ1c3kgPSBmYWxzZTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZXNvdXJjZUl0ZW0gPSBpdGVtIGFzIFJlc291cmNlUXVpY2tQaWNrSXRlbTtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSByZXNvdXJjZUl0ZW0ucmVzb3VyY2U7XG5cdFx0XHRcdC8vIFRyeSB0byBuYXZpZ2F0ZSBpbnRvIHRoZSByZXNvdXJjZSBpZiBpdCdzIGEgZGlyZWN0b3J5XG5cdFx0XHRcdGNvbnN0IGlzTmVzdGVkID0gYXdhaXQgaGVscGVyLm5hdmlnYXRlKHJlc291cmNlLCByZXNvdXJjZUl0ZW0uc2VydmVyKTtcblx0XHRcdFx0aWYgKCFpc05lc3RlZCkge1xuXHRcdFx0XHRcdGNvbnN0IHVyaSA9IGF3YWl0IGhlbHBlci50b1VSSShyZXNvdXJjZSk7XG5cdFx0XHRcdFx0aWYgKHVyaSkge1xuXHRcdFx0XHRcdFx0cGlja2VyLmhpZGUoKTtcblx0XHRcdFx0XHRcdHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiB1cmksIG9wdGlvbnM6IHsgcHJlc2VydmVGb2N1czogZXZlbnQuaW5CYWNrZ3JvdW5kIH0gfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRwaWNrZXIuYnVzeSA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRyZXR1cm4gc3RvcmU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1jcFJlc291cmNlUXVpY2tQaWNrIGV4dGVuZHMgQWJzdHJhY3RNY3BSZXNvdXJjZUFjY2Vzc1BpY2sge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRzY29wZVRvOiBJTWNwU2VydmVyIHwgdW5kZWZpbmVkLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJVmlld3NTZXJ2aWNlIHZpZXdzU2VydmljZTogSVZpZXdzU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHNjb3BlVG8sIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBlZGl0b3JTZXJ2aWNlLCBjaGF0V2lkZ2V0U2VydmljZSwgdmlld3NTZXJ2aWNlKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBwaWNrKHRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHFwID0gc3RvcmUuYWRkKHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljayh7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSkpO1xuXHRcdHFwLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ21jcC5xdWlja2FjY2Vzcy5wbGFjZWhvbGRlcicsIFwiU2VhcmNoIGZvciByZXNvdXJjZXNcIik7XG5cdFx0c3RvcmUuYWRkKHRoaXMuYXBwbHlUb1BpY2socXAsIHRva2VuKSk7XG5cdFx0c3RvcmUuYWRkKHFwLm9uRGlkSGlkZSgoKSA9PiBzdG9yZS5kaXNwb3NlKCkpKTtcblx0XHRxcC5zaG93KCk7XG5cdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKHFwLm9uRGlkSGlkZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1jcFJlc291cmNlUXVpY2tBY2Nlc3MgZXh0ZW5kcyBBYnN0cmFjdE1jcFJlc291cmNlQWNjZXNzUGljayBpbXBsZW1lbnRzIElRdWlja0FjY2Vzc1Byb3ZpZGVyIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBQUkVGSVggPSAnbWNwciAnO1xuXG5cdGRlZmF1bHRGaWx0ZXJWYWx1ZSA9IERlZmF1bHRRdWlja0FjY2Vzc0ZpbHRlclZhbHVlLkxBU1Q7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElWaWV3c1NlcnZpY2Ugdmlld3NTZXJ2aWNlOiBJVmlld3NTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHVuZGVmaW5lZCwgaW5zdGFudGlhdGlvblNlcnZpY2UsIGVkaXRvclNlcnZpY2UsIGNoYXRXaWRnZXRTZXJ2aWNlLCB2aWV3c1NlcnZpY2UpO1xuXHR9XG5cblx0cHJvdmlkZShwaWNrZXI6IElRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9PiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBydW5PcHRpb25zPzogSVF1aWNrQWNjZXNzUHJvdmlkZXJSdW5PcHRpb25zKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB0aGlzLmFwcGx5VG9QaWNrKHBpY2tlciwgdG9rZW4sIHJ1bk9wdGlvbnMpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsaUJBQWlCLG1CQUFtQix3QkFBd0I7QUFDckUsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBOEIsY0FBYyxrQkFBa0I7QUFDdkUsU0FBUyxTQUFTLFNBQVMsdUJBQW9DO0FBQy9ELFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsVUFBVSxvQkFBK0I7QUFDbEQs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
