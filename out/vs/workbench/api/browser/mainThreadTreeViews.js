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
import { Disposable, DisposableMap, DisposableStore } from "../../../base/common/lifecycle.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { Extensions, ResolvableTreeItem, NoTreeViewError } from "../../common/views.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { distinct } from "../../../base/common/arrays.js";
import { INotificationService } from "../../../platform/notification/common/notification.js";
import { isUndefinedOrNull, isNumber } from "../../../base/common/types.js";
import { Registry } from "../../../platform/registry/common/platform.js";
import { IExtensionService } from "../../services/extensions/common/extensions.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { createStringDataTransferItem, UriList, VSDataTransfer } from "../../../base/common/dataTransfer.js";
import { Mimes } from "../../../base/common/mime.js";
import { URI } from "../../../base/common/uri.js";
import { DataTransferFileCache } from "../common/shared/dataTransferCache.js";
import * as typeConvert from "../common/extHostTypeConverters.js";
import { IViewsService } from "../../services/views/common/viewsService.js";
import { ITelemetryService } from "../../../platform/telemetry/common/telemetry.js";
let MainThreadTreeViews = class extends Disposable {
  constructor(extHostContext, viewsService, notificationService, extensionService, logService, telemetryService) {
    super();
    this.viewsService = viewsService;
    this.notificationService = notificationService;
    this.extensionService = extensionService;
    this.logService = logService;
    this.telemetryService = telemetryService;
    this._dataProviders = this._register(new DisposableMap());
    this._dndControllers = /* @__PURE__ */ new Map();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTreeViews);
  }
  async $registerTreeViewDataProvider(treeViewId, options) {
    this.logService.trace("MainThreadTreeViews#$registerTreeViewDataProvider", treeViewId, options);
    this.extensionService.whenInstalledExtensionsRegistered().then(() => {
      const dataProvider = new TreeViewDataProvider(treeViewId, this._proxy, this.notificationService);
      const disposables = new DisposableStore();
      this._dataProviders.set(treeViewId, { dataProvider, dispose: () => disposables.dispose() });
      const dndController = options.hasHandleDrag || options.hasHandleDrop ? new TreeViewDragAndDropController(treeViewId, options.dropMimeTypes, options.dragMimeTypes, options.hasHandleDrag, this._proxy) : void 0;
      const viewer = this.getTreeView(treeViewId);
      if (viewer) {
        viewer.showCollapseAllAction = options.showCollapseAll;
        viewer.canSelectMany = options.canSelectMany;
        viewer.manuallyManageCheckboxes = options.manuallyManageCheckboxes;
        viewer.dragAndDropController = dndController;
        if (dndController) {
          this._dndControllers.set(treeViewId, dndController);
        }
        viewer.dataProvider = dataProvider;
        this.registerListeners(treeViewId, viewer, disposables);
        this._proxy.$setVisible(treeViewId, viewer.visible);
      } else {
        this.notificationService.error("No view is registered with id: " + treeViewId);
      }
    });
  }
  $reveal(treeViewId, itemInfo, options) {
    this.logService.trace("MainThreadTreeViews#$reveal", treeViewId, itemInfo?.item, itemInfo?.parentChain, options);
    return this.viewsService.openView(treeViewId, options.focus).then(() => {
      const viewer = this.getTreeView(treeViewId);
      if (viewer && itemInfo) {
        return this.reveal(viewer, this._dataProviders.get(treeViewId).dataProvider, itemInfo.item, itemInfo.parentChain, options);
      }
      return void 0;
    });
  }
  $refresh(treeViewId, itemsToRefreshByHandle) {
    this.logService.trace("MainThreadTreeViews#$refresh", treeViewId, itemsToRefreshByHandle);
    const viewer = this.getTreeView(treeViewId);
    const dataProvider = this._dataProviders.get(treeViewId);
    if (viewer && dataProvider) {
      const itemsToRefresh = dataProvider.dataProvider.getItemsToRefresh(itemsToRefreshByHandle);
      return viewer.refresh(itemsToRefresh.items.length ? itemsToRefresh.items : void 0, itemsToRefresh.checkboxes.length ? itemsToRefresh.checkboxes : void 0);
    }
    return Promise.resolve();
  }
  $setMessage(treeViewId, message) {
    this.logService.trace("MainThreadTreeViews#$setMessage", treeViewId, message.toString());
    const viewer = this.getTreeView(treeViewId);
    if (viewer) {
      viewer.message = message;
    }
  }
  $setTitle(treeViewId, title, description) {
    this.logService.trace("MainThreadTreeViews#$setTitle", treeViewId, title, description);
    const viewer = this.getTreeView(treeViewId);
    if (viewer) {
      viewer.title = title;
      viewer.description = description;
    }
  }
  $setBadge(treeViewId, badge) {
    this.logService.trace("MainThreadTreeViews#$setBadge", treeViewId, badge?.value, badge?.tooltip);
    const viewer = this.getTreeView(treeViewId);
    if (viewer) {
      viewer.badge = badge;
    }
  }
  $resolveDropFileData(destinationViewId, requestId, dataItemId) {
    const controller = this._dndControllers.get(destinationViewId);
    if (!controller) {
      throw new Error("Unknown tree");
    }
    return controller.resolveDropFileData(requestId, dataItemId);
  }
  async $disposeTree(treeViewId) {
    const viewer = this.getTreeView(treeViewId);
    if (viewer) {
      viewer.dataProvider = void 0;
    }
    this._dataProviders.deleteAndDispose(treeViewId);
  }
  $logResolveTreeNodeFailure(extensionId) {
    this.telemetryService.publicLog2("treeView.resolveFailure", {
      extensionId
    });
  }
  async reveal(treeView, dataProvider, itemIn, parentChain, options) {
    options = options ? options : { select: false, focus: false };
    const select = isUndefinedOrNull(options.select) ? false : options.select;
    const focus = isUndefinedOrNull(options.focus) ? false : options.focus;
    let expand = Math.min(isNumber(options.expand) ? options.expand : options.expand === true ? 1 : 0, 3);
    if (dataProvider.isEmpty()) {
      await treeView.refresh();
    }
    for (const parent of parentChain) {
      const parentItem = dataProvider.getItem(parent.handle);
      if (parentItem) {
        await treeView.expand(parentItem);
      }
    }
    const item = dataProvider.getItem(itemIn.handle);
    if (item) {
      await treeView.reveal(item);
      if (select) {
        treeView.setSelection([item]);
      }
      if (focus === false) {
        treeView.setFocus();
      } else if (focus) {
        treeView.setFocus(item);
      }
      let itemsToExpand = [item];
      for (; itemsToExpand.length > 0 && expand > 0; expand--) {
        await treeView.expand(itemsToExpand);
        itemsToExpand = itemsToExpand.reduce((result, itemValue) => {
          const item2 = dataProvider.getItem(itemValue.handle);
          if (item2 && item2.children && item2.children.length) {
            result.push(...item2.children);
          }
          return result;
        }, []);
      }
    }
  }
  registerListeners(treeViewId, treeView, disposables) {
    disposables.add(treeView.onDidExpandItem((item) => this._proxy.$setExpanded(treeViewId, item.handle, true)));
    disposables.add(treeView.onDidCollapseItem((item) => this._proxy.$setExpanded(treeViewId, item.handle, false)));
    disposables.add(treeView.onDidChangeSelectionAndFocus((items) => this._proxy.$setSelectionAndFocus(treeViewId, items.selection.map(({ handle }) => handle), items.focus.handle)));
    disposables.add(treeView.onDidChangeVisibility((isVisible) => this._proxy.$setVisible(treeViewId, isVisible)));
    disposables.add(treeView.onDidChangeCheckboxState((items) => {
      this._proxy.$changeCheckboxState(treeViewId, items.map((item) => {
        return { treeItemHandle: item.handle, newState: item.checkbox?.isChecked ?? false };
      }));
    }));
  }
  getTreeView(treeViewId) {
    const viewDescriptor = Registry.as(Extensions.ViewsRegistry).getView(treeViewId);
    return viewDescriptor ? viewDescriptor.treeView : null;
  }
  dispose() {
    for (const dataprovider of this._dataProviders) {
      const treeView = this.getTreeView(dataprovider[0]);
      if (treeView) {
        treeView.dataProvider = void 0;
      }
    }
    this._dataProviders.dispose();
    this._dndControllers.clear();
    super.dispose();
  }
};
MainThreadTreeViews = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadTreeViews),
  __decorateParam(1, IViewsService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, ILogService),
  __decorateParam(5, ITelemetryService)
], MainThreadTreeViews);
class TreeViewDragAndDropController {
  constructor(treeViewId, dropMimeTypes, dragMimeTypes, hasWillDrop, _proxy) {
    this.treeViewId = treeViewId;
    this.dropMimeTypes = dropMimeTypes;
    this.dragMimeTypes = dragMimeTypes;
    this.hasWillDrop = hasWillDrop;
    this._proxy = _proxy;
    this.dataTransfersCache = new DataTransferFileCache();
  }
  async handleDrop(dataTransfer, targetTreeItem, token, operationUuid, sourceTreeId, sourceTreeItemHandles) {
    const request = this.dataTransfersCache.add(dataTransfer);
    try {
      const dataTransferDto = await typeConvert.DataTransfer.fromList(dataTransfer);
      if (token.isCancellationRequested) {
        return;
      }
      return await this._proxy.$handleDrop(this.treeViewId, request.id, dataTransferDto, targetTreeItem?.handle, token, operationUuid, sourceTreeId, sourceTreeItemHandles);
    } finally {
      request.dispose();
    }
  }
  async handleDrag(sourceTreeItemHandles, operationUuid, token) {
    if (!this.hasWillDrop) {
      return;
    }
    const additionalDataTransferDTO = await this._proxy.$handleDrag(this.treeViewId, sourceTreeItemHandles, operationUuid, token);
    if (!additionalDataTransferDTO) {
      return;
    }
    const additionalDataTransfer = new VSDataTransfer();
    additionalDataTransferDTO.items.forEach(([type, item]) => {
      const value = type === Mimes.uriList && item.uriListData ? UriList.create(item.uriListData.map((part) => typeof part === "string" ? part : URI.revive(part))) : item.asString;
      additionalDataTransfer.replace(type, createStringDataTransferItem(value));
    });
    return additionalDataTransfer;
  }
  resolveDropFileData(requestId, dataItemId) {
    return this.dataTransfersCache.resolveFileData(requestId, dataItemId);
  }
}
class TreeViewDataProvider {
  constructor(treeViewId, _proxy, notificationService) {
    this.treeViewId = treeViewId;
    this._proxy = _proxy;
    this.notificationService = notificationService;
    this.itemsMap = /* @__PURE__ */ new Map();
    this.hasResolve = this._proxy.$hasResolve(this.treeViewId);
  }
  async getChildren(treeItem) {
    const batches = await this.getChildrenBatch(treeItem ? [treeItem] : void 0);
    return batches?.[0];
  }
  getChildrenBatch(treeItems) {
    if (!treeItems) {
      this.itemsMap.clear();
    }
    return this._proxy.$getChildren(this.treeViewId, treeItems ? treeItems.map((item) => item.handle) : void 0).then(
      (children) => {
        const convertedChildren = this.convertTransferChildren(treeItems ?? [], children);
        return this.postGetChildren(convertedChildren);
      },
      (err) => {
        if (!NoTreeViewError.is(err)) {
          this.notificationService.error(err);
        }
        return [];
      }
    );
  }
  convertTransferChildren(parents, children) {
    const convertedChildren = Array(parents.length);
    if (children) {
      for (const childGroup of children) {
        const childGroupIndex = childGroup[0];
        convertedChildren[childGroupIndex] = childGroup.slice(1);
      }
    }
    return convertedChildren;
  }
  getItemsToRefresh(itemsToRefreshByHandle) {
    const itemsToRefresh = [];
    const checkboxesToRefresh = [];
    if (itemsToRefreshByHandle) {
      for (const newTreeItemHandle of Object.keys(itemsToRefreshByHandle)) {
        const currentTreeItem = this.getItem(newTreeItemHandle);
        if (currentTreeItem) {
          const newTreeItem = itemsToRefreshByHandle[newTreeItemHandle];
          if (currentTreeItem.checkbox?.isChecked !== newTreeItem.checkbox?.isChecked) {
            checkboxesToRefresh.push(currentTreeItem);
          }
          this.updateTreeItem(currentTreeItem, newTreeItem);
          if (newTreeItemHandle === newTreeItem.handle) {
            itemsToRefresh.push(currentTreeItem);
          } else {
            this.itemsMap.delete(newTreeItemHandle);
            this.itemsMap.set(currentTreeItem.handle, currentTreeItem);
            const parent = newTreeItem.parentHandle ? this.itemsMap.get(newTreeItem.parentHandle) : null;
            if (parent) {
              itemsToRefresh.push(parent);
            }
          }
        }
      }
    }
    return { items: itemsToRefresh, checkboxes: checkboxesToRefresh };
  }
  getItem(treeItemHandle) {
    return this.itemsMap.get(treeItemHandle);
  }
  isEmpty() {
    return this.itemsMap.size === 0;
  }
  async postGetChildren(elementGroups) {
    if (elementGroups === void 0) {
      return void 0;
    }
    const resultGroups = [];
    const hasResolve = await this.hasResolve;
    if (elementGroups) {
      for (const elements of elementGroups) {
        const result = [];
        resultGroups.push(result);
        if (!elements) {
          continue;
        }
        for (const element of elements) {
          const resolvable = new ResolvableTreeItem(element, hasResolve ? (token) => {
            return this._proxy.$resolve(this.treeViewId, element.handle, token);
          } : void 0);
          this.itemsMap.set(element.handle, resolvable);
          result.push(resolvable);
        }
      }
    }
    return resultGroups;
  }
  updateTreeItem(current, treeItem) {
    treeItem.children = treeItem.children ? treeItem.children : void 0;
    if (current) {
      const properties = distinct([
        ...Object.keys(current instanceof ResolvableTreeItem ? current.asTreeItem() : current),
        ...Object.keys(treeItem)
      ]);
      for (const property of properties) {
        current[property] = treeItem[property];
      }
      if (current instanceof ResolvableTreeItem) {
        current.resetResolve();
      }
    }
  }
}
export {
  MainThreadTreeViews
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZFRyZWVWaWV3cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q29udGV4dCwgTWFpblRocmVhZFRyZWVWaWV3c1NoYXBlLCBFeHRIb3N0VHJlZVZpZXdzU2hhcGUsIE1haW5Db250ZXh0LCBDaGVja2JveFVwZGF0ZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IElUcmVlSXRlbSwgSVRyZWVWaWV3LCBJVmlld3NSZWdpc3RyeSwgSVRyZWVWaWV3RGVzY3JpcHRvciwgSVJldmVhbE9wdGlvbnMsIEV4dGVuc2lvbnMsIFJlc29sdmFibGVUcmVlSXRlbSwgSVRyZWVWaWV3RHJhZ0FuZERyb3BDb250cm9sbGVyLCBJVmlld0JhZGdlLCBOb1RyZWVWaWV3RXJyb3IsIElUcmVlVmlld0RhdGFQcm92aWRlciB9IGZyb20gJy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBleHRIb3N0TmFtZWRDdXN0b21lciwgSUV4dEhvc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5pbXBvcnQgeyBkaXN0aW5jdCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IGlzVW5kZWZpbmVkT3JOdWxsLCBpc051bWJlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGNyZWF0ZVN0cmluZ0RhdGFUcmFuc2Zlckl0ZW0sIFVyaUxpc3QsIFZTRGF0YVRyYW5zZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0YVRyYW5zZmVyLmpzJztcbmltcG9ydCB7IE1pbWVzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWltZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRGF0YVRyYW5zZmVyRmlsZUNhY2hlIH0gZnJvbSAnLi4vY29tbW9uL3NoYXJlZC9kYXRhVHJhbnNmZXJDYWNoZS5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlQ29udmVydCBmcm9tICcuLi9jb21tb24vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuXG5AZXh0SG9zdE5hbWVkQ3VzdG9tZXIoTWFpbkNvbnRleHQuTWFpblRocmVhZFRyZWVWaWV3cylcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkVHJlZVZpZXdzIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIE1haW5UaHJlYWRUcmVlVmlld3NTaGFwZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IEV4dEhvc3RUcmVlVmlld3NTaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGF0YVByb3ZpZGVyczogRGlzcG9zYWJsZU1hcDxzdHJpbmcsIHsgZGF0YVByb3ZpZGVyOiBUcmVlVmlld0RhdGFQcm92aWRlcjsgZGlzcG9zZTogKCkgPT4gdm9pZCB9PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgeyBkYXRhUHJvdmlkZXI6IFRyZWVWaWV3RGF0YVByb3ZpZGVyOyBkaXNwb3NlOiAoKSA9PiB2b2lkIH0+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kbmRDb250cm9sbGVycyA9IG5ldyBNYXA8c3RyaW5nLCBUcmVlVmlld0RyYWdBbmREcm9wQ29udHJvbGxlcj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRleHRIb3N0Q29udGV4dDogSUV4dEhvc3RDb250ZXh0LFxuXHRcdEBJVmlld3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlld3NTZXJ2aWNlOiBJVmlld3NTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcHJveHkgPSBleHRIb3N0Q29udGV4dC5nZXRQcm94eShFeHRIb3N0Q29udGV4dC5FeHRIb3N0VHJlZVZpZXdzKTtcblx0fVxuXG5cdGFzeW5jICRyZWdpc3RlclRyZWVWaWV3RGF0YVByb3ZpZGVyKHRyZWVWaWV3SWQ6IHN0cmluZywgb3B0aW9uczogeyBzaG93Q29sbGFwc2VBbGw6IGJvb2xlYW47IGNhblNlbGVjdE1hbnk6IGJvb2xlYW47IGRyb3BNaW1lVHlwZXM6IHN0cmluZ1tdOyBkcmFnTWltZVR5cGVzOiBzdHJpbmdbXTsgaGFzSGFuZGxlRHJhZzogYm9vbGVhbjsgaGFzSGFuZGxlRHJvcDogYm9vbGVhbjsgbWFudWFsbHlNYW5hZ2VDaGVja2JveGVzOiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ01haW5UaHJlYWRUcmVlVmlld3MjJHJlZ2lzdGVyVHJlZVZpZXdEYXRhUHJvdmlkZXInLCB0cmVlVmlld0lkLCBvcHRpb25zKTtcblxuXHRcdHRoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKS50aGVuKCgpID0+IHtcblx0XHRcdGNvbnN0IGRhdGFQcm92aWRlciA9IG5ldyBUcmVlVmlld0RhdGFQcm92aWRlcih0cmVlVmlld0lkLCB0aGlzLl9wcm94eSwgdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0dGhpcy5fZGF0YVByb3ZpZGVycy5zZXQodHJlZVZpZXdJZCwgeyBkYXRhUHJvdmlkZXIsIGRpc3Bvc2U6ICgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSB9KTtcblx0XHRcdGNvbnN0IGRuZENvbnRyb2xsZXIgPSAob3B0aW9ucy5oYXNIYW5kbGVEcmFnIHx8IG9wdGlvbnMuaGFzSGFuZGxlRHJvcClcblx0XHRcdFx0PyBuZXcgVHJlZVZpZXdEcmFnQW5kRHJvcENvbnRyb2xsZXIodHJlZVZpZXdJZCwgb3B0aW9ucy5kcm9wTWltZVR5cGVzLCBvcHRpb25zLmRyYWdNaW1lVHlwZXMsIG9wdGlvbnMuaGFzSGFuZGxlRHJhZywgdGhpcy5fcHJveHkpIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3Qgdmlld2VyID0gdGhpcy5nZXRUcmVlVmlldyh0cmVlVmlld0lkKTtcblx0XHRcdGlmICh2aWV3ZXIpIHtcblx0XHRcdFx0Ly8gT3JkZXIgaXMgaW1wb3J0YW50IGhlcmUuIFRoZSBpbnRlcm5hbCB0cmVlIGlzbid0IGNyZWF0ZWQgdW50aWwgdGhlIGRhdGFQcm92aWRlciBpcyBzZXQuXG5cdFx0XHRcdC8vIFNldCBhbGwgb3RoZXIgcHJvcGVydGllcyBmaXJzdCFcblx0XHRcdFx0dmlld2VyLnNob3dDb2xsYXBzZUFsbEFjdGlvbiA9IG9wdGlvbnMuc2hvd0NvbGxhcHNlQWxsO1xuXHRcdFx0XHR2aWV3ZXIuY2FuU2VsZWN0TWFueSA9IG9wdGlvbnMuY2FuU2VsZWN0TWFueTtcblx0XHRcdFx0dmlld2VyLm1hbnVhbGx5TWFuYWdlQ2hlY2tib3hlcyA9IG9wdGlvbnMubWFudWFsbHlNYW5hZ2VDaGVja2JveGVzO1xuXHRcdFx0XHR2aWV3ZXIuZHJhZ0FuZERyb3BDb250cm9sbGVyID0gZG5kQ29udHJvbGxlcjtcblx0XHRcdFx0aWYgKGRuZENvbnRyb2xsZXIpIHtcblx0XHRcdFx0XHR0aGlzLl9kbmRDb250cm9sbGVycy5zZXQodHJlZVZpZXdJZCwgZG5kQ29udHJvbGxlcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0dmlld2VyLmRhdGFQcm92aWRlciA9IGRhdGFQcm92aWRlcjtcblx0XHRcdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycyh0cmVlVmlld0lkLCB2aWV3ZXIsIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0dGhpcy5fcHJveHkuJHNldFZpc2libGUodHJlZVZpZXdJZCwgdmlld2VyLnZpc2libGUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKCdObyB2aWV3IGlzIHJlZ2lzdGVyZWQgd2l0aCBpZDogJyArIHRyZWVWaWV3SWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0JHJldmVhbCh0cmVlVmlld0lkOiBzdHJpbmcsIGl0ZW1JbmZvOiB7IGl0ZW06IElUcmVlSXRlbTsgcGFyZW50Q2hhaW46IElUcmVlSXRlbVtdIH0gfCB1bmRlZmluZWQsIG9wdGlvbnM6IElSZXZlYWxPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdNYWluVGhyZWFkVHJlZVZpZXdzIyRyZXZlYWwnLCB0cmVlVmlld0lkLCBpdGVtSW5mbz8uaXRlbSwgaXRlbUluZm8/LnBhcmVudENoYWluLCBvcHRpb25zKTtcblxuXHRcdHJldHVybiB0aGlzLnZpZXdzU2VydmljZS5vcGVuVmlldyh0cmVlVmlld0lkLCBvcHRpb25zLmZvY3VzKVxuXHRcdFx0LnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB2aWV3ZXIgPSB0aGlzLmdldFRyZWVWaWV3KHRyZWVWaWV3SWQpO1xuXHRcdFx0XHRpZiAodmlld2VyICYmIGl0ZW1JbmZvKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMucmV2ZWFsKHZpZXdlciwgdGhpcy5fZGF0YVByb3ZpZGVycy5nZXQodHJlZVZpZXdJZCkhLmRhdGFQcm92aWRlciwgaXRlbUluZm8uaXRlbSwgaXRlbUluZm8ucGFyZW50Q2hhaW4sIG9wdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9KTtcblx0fVxuXG5cdCRyZWZyZXNoKHRyZWVWaWV3SWQ6IHN0cmluZywgaXRlbXNUb1JlZnJlc2hCeUhhbmRsZTogeyBbdHJlZUl0ZW1IYW5kbGU6IHN0cmluZ106IElUcmVlSXRlbSB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdNYWluVGhyZWFkVHJlZVZpZXdzIyRyZWZyZXNoJywgdHJlZVZpZXdJZCwgaXRlbXNUb1JlZnJlc2hCeUhhbmRsZSk7XG5cblx0XHRjb25zdCB2aWV3ZXIgPSB0aGlzLmdldFRyZWVWaWV3KHRyZWVWaWV3SWQpO1xuXHRcdGNvbnN0IGRhdGFQcm92aWRlciA9IHRoaXMuX2RhdGFQcm92aWRlcnMuZ2V0KHRyZWVWaWV3SWQpO1xuXHRcdGlmICh2aWV3ZXIgJiYgZGF0YVByb3ZpZGVyKSB7XG5cdFx0XHRjb25zdCBpdGVtc1RvUmVmcmVzaCA9IGRhdGFQcm92aWRlci5kYXRhUHJvdmlkZXIuZ2V0SXRlbXNUb1JlZnJlc2goaXRlbXNUb1JlZnJlc2hCeUhhbmRsZSk7XG5cdFx0XHRyZXR1cm4gdmlld2VyLnJlZnJlc2goaXRlbXNUb1JlZnJlc2guaXRlbXMubGVuZ3RoID8gaXRlbXNUb1JlZnJlc2guaXRlbXMgOiB1bmRlZmluZWQsIGl0ZW1zVG9SZWZyZXNoLmNoZWNrYm94ZXMubGVuZ3RoID8gaXRlbXNUb1JlZnJlc2guY2hlY2tib3hlcyA6IHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXG5cdCRzZXRNZXNzYWdlKHRyZWVWaWV3SWQ6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdNYWluVGhyZWFkVHJlZVZpZXdzIyRzZXRNZXNzYWdlJywgdHJlZVZpZXdJZCwgbWVzc2FnZS50b1N0cmluZygpKTtcblxuXHRcdGNvbnN0IHZpZXdlciA9IHRoaXMuZ2V0VHJlZVZpZXcodHJlZVZpZXdJZCk7XG5cdFx0aWYgKHZpZXdlcikge1xuXHRcdFx0dmlld2VyLm1lc3NhZ2UgPSBtZXNzYWdlO1xuXHRcdH1cblx0fVxuXG5cdCRzZXRUaXRsZSh0cmVlVmlld0lkOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ01haW5UaHJlYWRUcmVlVmlld3MjJHNldFRpdGxlJywgdHJlZVZpZXdJZCwgdGl0bGUsIGRlc2NyaXB0aW9uKTtcblxuXHRcdGNvbnN0IHZpZXdlciA9IHRoaXMuZ2V0VHJlZVZpZXcodHJlZVZpZXdJZCk7XG5cdFx0aWYgKHZpZXdlcikge1xuXHRcdFx0dmlld2VyLnRpdGxlID0gdGl0bGU7XG5cdFx0XHR2aWV3ZXIuZGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvbjtcblx0XHR9XG5cdH1cblxuXHQkc2V0QmFkZ2UodHJlZVZpZXdJZDogc3RyaW5nLCBiYWRnZTogSVZpZXdCYWRnZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnTWFpblRocmVhZFRyZWVWaWV3cyMkc2V0QmFkZ2UnLCB0cmVlVmlld0lkLCBiYWRnZT8udmFsdWUsIGJhZGdlPy50b29sdGlwKTtcblxuXHRcdGNvbnN0IHZpZXdlciA9IHRoaXMuZ2V0VHJlZVZpZXcodHJlZVZpZXdJZCk7XG5cdFx0aWYgKHZpZXdlcikge1xuXHRcdFx0dmlld2VyLmJhZGdlID0gYmFkZ2U7XG5cdFx0fVxuXHR9XG5cblx0JHJlc29sdmVEcm9wRmlsZURhdGEoZGVzdGluYXRpb25WaWV3SWQ6IHN0cmluZywgcmVxdWVzdElkOiBudW1iZXIsIGRhdGFJdGVtSWQ6IHN0cmluZyk6IFByb21pc2U8VlNCdWZmZXI+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gdGhpcy5fZG5kQ29udHJvbGxlcnMuZ2V0KGRlc3RpbmF0aW9uVmlld0lkKTtcblx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVW5rbm93biB0cmVlJyk7XG5cdFx0fVxuXHRcdHJldHVybiBjb250cm9sbGVyLnJlc29sdmVEcm9wRmlsZURhdGEocmVxdWVzdElkLCBkYXRhSXRlbUlkKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkZGlzcG9zZVRyZWUodHJlZVZpZXdJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgdmlld2VyID0gdGhpcy5nZXRUcmVlVmlldyh0cmVlVmlld0lkKTtcblx0XHRpZiAodmlld2VyKSB7XG5cdFx0XHR2aWV3ZXIuZGF0YVByb3ZpZGVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuX2RhdGFQcm92aWRlcnMuZGVsZXRlQW5kRGlzcG9zZSh0cmVlVmlld0lkKTtcblx0fVxuXG5cdCRsb2dSZXNvbHZlVHJlZU5vZGVGYWlsdXJlKGV4dGVuc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0eXBlIFRyZWVWaWV3UmVzb2x2ZUZhaWx1cmVFdmVudCA9IHtcblx0XHRcdGV4dGVuc2lvbklkOiBzdHJpbmc7XG5cdFx0fTtcblx0XHR0eXBlIFRyZWVWaWV3UmVzb2x2ZUZhaWx1cmVDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdGV4dGVuc2lvbklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGV4dGVuc2lvbiBpZGVudGlmaWVyLicgfTtcblx0XHRcdG93bmVyOiAnYWxleHIwMCc7XG5cdFx0XHRjb21tZW50OiAnVHJhY2tzIHRyZWUgdmlldyByZXNvbHZlIGZhaWx1cmVzIGR1ZSB0byBjb25jdXJyZW50IHJlZnJlc2ggcmFjZXMuJztcblx0XHR9O1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFRyZWVWaWV3UmVzb2x2ZUZhaWx1cmVFdmVudCwgVHJlZVZpZXdSZXNvbHZlRmFpbHVyZUNsYXNzaWZpY2F0aW9uPigndHJlZVZpZXcucmVzb2x2ZUZhaWx1cmUnLCB7XG5cdFx0XHRleHRlbnNpb25JZFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXZlYWwodHJlZVZpZXc6IElUcmVlVmlldywgZGF0YVByb3ZpZGVyOiBUcmVlVmlld0RhdGFQcm92aWRlciwgaXRlbUluOiBJVHJlZUl0ZW0sIHBhcmVudENoYWluOiBJVHJlZUl0ZW1bXSwgb3B0aW9uczogSVJldmVhbE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRvcHRpb25zID0gb3B0aW9ucyA/IG9wdGlvbnMgOiB7IHNlbGVjdDogZmFsc2UsIGZvY3VzOiBmYWxzZSB9O1xuXHRcdGNvbnN0IHNlbGVjdCA9IGlzVW5kZWZpbmVkT3JOdWxsKG9wdGlvbnMuc2VsZWN0KSA/IGZhbHNlIDogb3B0aW9ucy5zZWxlY3Q7XG5cdFx0Y29uc3QgZm9jdXMgPSBpc1VuZGVmaW5lZE9yTnVsbChvcHRpb25zLmZvY3VzKSA/IGZhbHNlIDogb3B0aW9ucy5mb2N1cztcblx0XHRsZXQgZXhwYW5kID0gTWF0aC5taW4oaXNOdW1iZXIob3B0aW9ucy5leHBhbmQpID8gb3B0aW9ucy5leHBhbmQgOiBvcHRpb25zLmV4cGFuZCA9PT0gdHJ1ZSA/IDEgOiAwLCAzKTtcblxuXHRcdGlmIChkYXRhUHJvdmlkZXIuaXNFbXB0eSgpKSB7XG5cdFx0XHQvLyBSZWZyZXNoIGlmIGVtcHR5XG5cdFx0XHRhd2FpdCB0cmVlVmlldy5yZWZyZXNoKCk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgcGFyZW50IG9mIHBhcmVudENoYWluKSB7XG5cdFx0XHRjb25zdCBwYXJlbnRJdGVtID0gZGF0YVByb3ZpZGVyLmdldEl0ZW0ocGFyZW50LmhhbmRsZSk7XG5cdFx0XHRpZiAocGFyZW50SXRlbSkge1xuXHRcdFx0XHRhd2FpdCB0cmVlVmlldy5leHBhbmQocGFyZW50SXRlbSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGl0ZW0gPSBkYXRhUHJvdmlkZXIuZ2V0SXRlbShpdGVtSW4uaGFuZGxlKTtcblx0XHRpZiAoaXRlbSkge1xuXHRcdFx0YXdhaXQgdHJlZVZpZXcucmV2ZWFsKGl0ZW0pO1xuXHRcdFx0aWYgKHNlbGVjdCkge1xuXHRcdFx0XHR0cmVlVmlldy5zZXRTZWxlY3Rpb24oW2l0ZW1dKTtcblx0XHRcdH1cblx0XHRcdGlmIChmb2N1cyA9PT0gZmFsc2UpIHtcblx0XHRcdFx0dHJlZVZpZXcuc2V0Rm9jdXMoKTtcblx0XHRcdH0gZWxzZSBpZiAoZm9jdXMpIHtcblx0XHRcdFx0dHJlZVZpZXcuc2V0Rm9jdXMoaXRlbSk7XG5cdFx0XHR9XG5cdFx0XHRsZXQgaXRlbXNUb0V4cGFuZCA9IFtpdGVtXTtcblx0XHRcdGZvciAoOyBpdGVtc1RvRXhwYW5kLmxlbmd0aCA+IDAgJiYgZXhwYW5kID4gMDsgZXhwYW5kLS0pIHtcblx0XHRcdFx0YXdhaXQgdHJlZVZpZXcuZXhwYW5kKGl0ZW1zVG9FeHBhbmQpO1xuXHRcdFx0XHRpdGVtc1RvRXhwYW5kID0gaXRlbXNUb0V4cGFuZC5yZWR1Y2UoKHJlc3VsdCwgaXRlbVZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgaXRlbSA9IGRhdGFQcm92aWRlci5nZXRJdGVtKGl0ZW1WYWx1ZS5oYW5kbGUpO1xuXHRcdFx0XHRcdGlmIChpdGVtICYmIGl0ZW0uY2hpbGRyZW4gJiYgaXRlbS5jaGlsZHJlbi5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKC4uLml0ZW0uY2hpbGRyZW4pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHR9LCBbXSBhcyBJVHJlZUl0ZW1bXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycyh0cmVlVmlld0lkOiBzdHJpbmcsIHRyZWVWaWV3OiBJVHJlZVZpZXcsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiB2b2lkIHtcblx0XHRkaXNwb3NhYmxlcy5hZGQodHJlZVZpZXcub25EaWRFeHBhbmRJdGVtKGl0ZW0gPT4gdGhpcy5fcHJveHkuJHNldEV4cGFuZGVkKHRyZWVWaWV3SWQsIGl0ZW0uaGFuZGxlLCB0cnVlKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0cmVlVmlldy5vbkRpZENvbGxhcHNlSXRlbShpdGVtID0+IHRoaXMuX3Byb3h5LiRzZXRFeHBhbmRlZCh0cmVlVmlld0lkLCBpdGVtLmhhbmRsZSwgZmFsc2UpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRyZWVWaWV3Lm9uRGlkQ2hhbmdlU2VsZWN0aW9uQW5kRm9jdXMoaXRlbXMgPT4gdGhpcy5fcHJveHkuJHNldFNlbGVjdGlvbkFuZEZvY3VzKHRyZWVWaWV3SWQsIGl0ZW1zLnNlbGVjdGlvbi5tYXAoKHsgaGFuZGxlIH0pID0+IGhhbmRsZSksIGl0ZW1zLmZvY3VzLmhhbmRsZSkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodHJlZVZpZXcub25EaWRDaGFuZ2VWaXNpYmlsaXR5KGlzVmlzaWJsZSA9PiB0aGlzLl9wcm94eS4kc2V0VmlzaWJsZSh0cmVlVmlld0lkLCBpc1Zpc2libGUpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRyZWVWaWV3Lm9uRGlkQ2hhbmdlQ2hlY2tib3hTdGF0ZShpdGVtcyA9PiB7XG5cdFx0XHR0aGlzLl9wcm94eS4kY2hhbmdlQ2hlY2tib3hTdGF0ZSh0cmVlVmlld0lkLCA8Q2hlY2tib3hVcGRhdGVbXT5pdGVtcy5tYXAoaXRlbSA9PiB7XG5cdFx0XHRcdHJldHVybiB7IHRyZWVJdGVtSGFuZGxlOiBpdGVtLmhhbmRsZSwgbmV3U3RhdGU6IGl0ZW0uY2hlY2tib3g/LmlzQ2hlY2tlZCA/PyBmYWxzZSB9O1xuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VHJlZVZpZXcodHJlZVZpZXdJZDogc3RyaW5nKTogSVRyZWVWaWV3IHwgbnVsbCB7XG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3I6IElUcmVlVmlld0Rlc2NyaXB0b3IgPSA8SVRyZWVWaWV3RGVzY3JpcHRvcj5SZWdpc3RyeS5hczxJVmlld3NSZWdpc3RyeT4oRXh0ZW5zaW9ucy5WaWV3c1JlZ2lzdHJ5KS5nZXRWaWV3KHRyZWVWaWV3SWQpO1xuXHRcdHJldHVybiB2aWV3RGVzY3JpcHRvciA/IHZpZXdEZXNjcmlwdG9yLnRyZWVWaWV3IDogbnVsbDtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBkYXRhcHJvdmlkZXIgb2YgdGhpcy5fZGF0YVByb3ZpZGVycykge1xuXHRcdFx0Y29uc3QgdHJlZVZpZXcgPSB0aGlzLmdldFRyZWVWaWV3KGRhdGFwcm92aWRlclswXSk7XG5cdFx0XHRpZiAodHJlZVZpZXcpIHtcblx0XHRcdFx0dHJlZVZpZXcuZGF0YVByb3ZpZGVyID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9kYXRhUHJvdmlkZXJzLmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMuX2RuZENvbnRyb2xsZXJzLmNsZWFyKCk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxudHlwZSBUcmVlSXRlbUhhbmRsZSA9IHN0cmluZztcblxuY2xhc3MgVHJlZVZpZXdEcmFnQW5kRHJvcENvbnRyb2xsZXIgaW1wbGVtZW50cyBJVHJlZVZpZXdEcmFnQW5kRHJvcENvbnRyb2xsZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGF0YVRyYW5zZmVyc0NhY2hlID0gbmV3IERhdGFUcmFuc2ZlckZpbGVDYWNoZSgpO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgdHJlZVZpZXdJZDogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IGRyb3BNaW1lVHlwZXM6IHN0cmluZ1tdLFxuXHRcdHJlYWRvbmx5IGRyYWdNaW1lVHlwZXM6IHN0cmluZ1tdLFxuXHRcdHJlYWRvbmx5IGhhc1dpbGxEcm9wOiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBFeHRIb3N0VHJlZVZpZXdzU2hhcGUpIHsgfVxuXG5cdGFzeW5jIGhhbmRsZURyb3AoZGF0YVRyYW5zZmVyOiBWU0RhdGFUcmFuc2ZlciwgdGFyZ2V0VHJlZUl0ZW06IElUcmVlSXRlbSB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHRcdG9wZXJhdGlvblV1aWQ/OiBzdHJpbmcsIHNvdXJjZVRyZWVJZD86IHN0cmluZywgc291cmNlVHJlZUl0ZW1IYW5kbGVzPzogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXF1ZXN0ID0gdGhpcy5kYXRhVHJhbnNmZXJzQ2FjaGUuYWRkKGRhdGFUcmFuc2Zlcik7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRhdGFUcmFuc2ZlckR0byA9IGF3YWl0IHR5cGVDb252ZXJ0LkRhdGFUcmFuc2Zlci5mcm9tTGlzdChkYXRhVHJhbnNmZXIpO1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9wcm94eS4kaGFuZGxlRHJvcCh0aGlzLnRyZWVWaWV3SWQsIHJlcXVlc3QuaWQsIGRhdGFUcmFuc2ZlckR0bywgdGFyZ2V0VHJlZUl0ZW0/LmhhbmRsZSwgdG9rZW4sIG9wZXJhdGlvblV1aWQsIHNvdXJjZVRyZWVJZCwgc291cmNlVHJlZUl0ZW1IYW5kbGVzKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVxdWVzdC5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgaGFuZGxlRHJhZyhzb3VyY2VUcmVlSXRlbUhhbmRsZXM6IHN0cmluZ1tdLCBvcGVyYXRpb25VdWlkOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VlNEYXRhVHJhbnNmZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuaGFzV2lsbERyb3ApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWRkaXRpb25hbERhdGFUcmFuc2ZlckRUTyA9IGF3YWl0IHRoaXMuX3Byb3h5LiRoYW5kbGVEcmFnKHRoaXMudHJlZVZpZXdJZCwgc291cmNlVHJlZUl0ZW1IYW5kbGVzLCBvcGVyYXRpb25VdWlkLCB0b2tlbik7XG5cdFx0aWYgKCFhZGRpdGlvbmFsRGF0YVRyYW5zZmVyRFRPKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWRkaXRpb25hbERhdGFUcmFuc2ZlciA9IG5ldyBWU0RhdGFUcmFuc2ZlcigpO1xuXHRcdGFkZGl0aW9uYWxEYXRhVHJhbnNmZXJEVE8uaXRlbXMuZm9yRWFjaCgoW3R5cGUsIGl0ZW1dKSA9PiB7XG5cdFx0XHQvLyBGb3IgdGV4dC91cmktbGlzdCwgcmVjb25zdHJ1Y3QgZnJvbSB1cmlMaXN0RGF0YSB3aGljaCBoYXMgYmVlbiB0cmFuc2Zvcm1lZCBieSB0aGUgVVJJIHRyYW5zZm9ybWVyXG5cdFx0XHRjb25zdCB2YWx1ZSA9IHR5cGUgPT09IE1pbWVzLnVyaUxpc3QgJiYgaXRlbS51cmlMaXN0RGF0YVxuXHRcdFx0XHQ/IFVyaUxpc3QuY3JlYXRlKGl0ZW0udXJpTGlzdERhdGEubWFwKHBhcnQgPT4gdHlwZW9mIHBhcnQgPT09ICdzdHJpbmcnID8gcGFydCA6IFVSSS5yZXZpdmUocGFydCkpKVxuXHRcdFx0XHQ6IGl0ZW0uYXNTdHJpbmc7XG5cdFx0XHRhZGRpdGlvbmFsRGF0YVRyYW5zZmVyLnJlcGxhY2UodHlwZSwgY3JlYXRlU3RyaW5nRGF0YVRyYW5zZmVySXRlbSh2YWx1ZSkpO1xuXHRcdH0pO1xuXHRcdHJldHVybiBhZGRpdGlvbmFsRGF0YVRyYW5zZmVyO1xuXHR9XG5cblx0cHVibGljIHJlc29sdmVEcm9wRmlsZURhdGEocmVxdWVzdElkOiBudW1iZXIsIGRhdGFJdGVtSWQ6IHN0cmluZyk6IFByb21pc2U8VlNCdWZmZXI+IHtcblx0XHRyZXR1cm4gdGhpcy5kYXRhVHJhbnNmZXJzQ2FjaGUucmVzb2x2ZUZpbGVEYXRhKHJlcXVlc3RJZCwgZGF0YUl0ZW1JZCk7XG5cdH1cbn1cblxuY2xhc3MgVHJlZVZpZXdEYXRhUHJvdmlkZXIgaW1wbGVtZW50cyBJVHJlZVZpZXdEYXRhUHJvdmlkZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaXRlbXNNYXA6IE1hcDxUcmVlSXRlbUhhbmRsZSwgSVRyZWVJdGVtPiA9IG5ldyBNYXA8VHJlZUl0ZW1IYW5kbGUsIElUcmVlSXRlbT4oKTtcblx0cHJpdmF0ZSBoYXNSZXNvbHZlOiBQcm9taXNlPGJvb2xlYW4+O1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgdHJlZVZpZXdJZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBFeHRIb3N0VHJlZVZpZXdzU2hhcGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLmhhc1Jlc29sdmUgPSB0aGlzLl9wcm94eS4kaGFzUmVzb2x2ZSh0aGlzLnRyZWVWaWV3SWQpO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q2hpbGRyZW4odHJlZUl0ZW0/OiBJVHJlZUl0ZW0pOiBQcm9taXNlPHJlYWRvbmx5IElUcmVlSXRlbVtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYmF0Y2hlcyA9IGF3YWl0IHRoaXMuZ2V0Q2hpbGRyZW5CYXRjaCh0cmVlSXRlbSA/IFt0cmVlSXRlbV0gOiB1bmRlZmluZWQpO1xuXHRcdHJldHVybiBiYXRjaGVzPy5bMF07XG5cdH1cblxuXHRnZXRDaGlsZHJlbkJhdGNoKHRyZWVJdGVtcz86IElUcmVlSXRlbVtdKTogUHJvbWlzZTwocmVhZG9ubHkgSVRyZWVJdGVtW10pW10gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRyZWVJdGVtcykge1xuXHRcdFx0dGhpcy5pdGVtc01hcC5jbGVhcigpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJGdldENoaWxkcmVuKHRoaXMudHJlZVZpZXdJZCwgdHJlZUl0ZW1zID8gdHJlZUl0ZW1zLm1hcChpdGVtID0+IGl0ZW0uaGFuZGxlKSA6IHVuZGVmaW5lZClcblx0XHRcdC50aGVuKFxuXHRcdFx0XHRjaGlsZHJlbiA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgY29udmVydGVkQ2hpbGRyZW4gPSB0aGlzLmNvbnZlcnRUcmFuc2ZlckNoaWxkcmVuKHRyZWVJdGVtcyA/PyBbXSwgY2hpbGRyZW4pO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLnBvc3RHZXRDaGlsZHJlbihjb252ZXJ0ZWRDaGlsZHJlbik7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVyciA9PiB7XG5cdFx0XHRcdFx0Ly8gSXQgY2FuIGhhcHBlbiB0aGF0IGEgdHJlZSB2aWV3IGlzIGRpc3Bvc2VkIHJpZ2h0IGFzIGBnZXRDaGlsZHJlbmAgaXMgY2FsbGVkLiBUaGlzIHJlc3VsdHMgaW4gYW4gZXJyb3IgYmVjYXVzZSB0aGUgZGF0YSBwcm92aWRlciBnZXRzIHJlbW92ZWQuXG5cdFx0XHRcdFx0Ly8gVGhlIHRyZWUgd2lsbCBzaG9ydGx5IGdldCBjbGVhbmVkIHVwIGluIHRoaXMgY2FzZS4gV2UganVzdCBuZWVkIHRvIGhhbmRsZSB0aGUgZXJyb3IgaGVyZS5cblx0XHRcdFx0XHRpZiAoIU5vVHJlZVZpZXdFcnJvci5pcyhlcnIpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgY29udmVydFRyYW5zZmVyQ2hpbGRyZW4ocGFyZW50czogSVRyZWVJdGVtW10sIGNoaWxkcmVuOiAocmVhZG9ubHkgKG51bWJlciB8IElUcmVlSXRlbSlbXSlbXSB8IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IGNvbnZlcnRlZENoaWxkcmVuOiAocmVhZG9ubHkgSVRyZWVJdGVtW10gfCB1bmRlZmluZWQpW10gPSBBcnJheShwYXJlbnRzLmxlbmd0aCk7XG5cdFx0aWYgKGNoaWxkcmVuKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkR3JvdXAgb2YgY2hpbGRyZW4pIHtcblx0XHRcdFx0Y29uc3QgY2hpbGRHcm91cEluZGV4ID0gY2hpbGRHcm91cFswXSBhcyBudW1iZXI7XG5cdFx0XHRcdGNvbnZlcnRlZENoaWxkcmVuW2NoaWxkR3JvdXBJbmRleF0gPSBjaGlsZEdyb3VwLnNsaWNlKDEpIGFzIHJlYWRvbmx5IElUcmVlSXRlbVtdO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gY29udmVydGVkQ2hpbGRyZW47XG5cdH1cblxuXHRnZXRJdGVtc1RvUmVmcmVzaChpdGVtc1RvUmVmcmVzaEJ5SGFuZGxlOiB7IFt0cmVlSXRlbUhhbmRsZTogc3RyaW5nXTogSVRyZWVJdGVtIH0pOiB7IGl0ZW1zOiBJVHJlZUl0ZW1bXTsgY2hlY2tib3hlczogSVRyZWVJdGVtW10gfSB7XG5cdFx0Y29uc3QgaXRlbXNUb1JlZnJlc2g6IElUcmVlSXRlbVtdID0gW107XG5cdFx0Y29uc3QgY2hlY2tib3hlc1RvUmVmcmVzaDogSVRyZWVJdGVtW10gPSBbXTtcblx0XHRpZiAoaXRlbXNUb1JlZnJlc2hCeUhhbmRsZSkge1xuXHRcdFx0Zm9yIChjb25zdCBuZXdUcmVlSXRlbUhhbmRsZSBvZiBPYmplY3Qua2V5cyhpdGVtc1RvUmVmcmVzaEJ5SGFuZGxlKSkge1xuXHRcdFx0XHRjb25zdCBjdXJyZW50VHJlZUl0ZW0gPSB0aGlzLmdldEl0ZW0obmV3VHJlZUl0ZW1IYW5kbGUpO1xuXHRcdFx0XHRpZiAoY3VycmVudFRyZWVJdGVtKSB7IC8vIFJlZnJlc2ggb25seSBpZiB0aGUgaXRlbSBleGlzdHNcblx0XHRcdFx0XHRjb25zdCBuZXdUcmVlSXRlbSA9IGl0ZW1zVG9SZWZyZXNoQnlIYW5kbGVbbmV3VHJlZUl0ZW1IYW5kbGVdO1xuXHRcdFx0XHRcdGlmIChjdXJyZW50VHJlZUl0ZW0uY2hlY2tib3g/LmlzQ2hlY2tlZCAhPT0gbmV3VHJlZUl0ZW0uY2hlY2tib3g/LmlzQ2hlY2tlZCkge1xuXHRcdFx0XHRcdFx0Y2hlY2tib3hlc1RvUmVmcmVzaC5wdXNoKGN1cnJlbnRUcmVlSXRlbSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIFVwZGF0ZSB0aGUgY3VycmVudCBpdGVtIHdpdGggcmVmcmVzaGVkIGl0ZW1cblx0XHRcdFx0XHR0aGlzLnVwZGF0ZVRyZWVJdGVtKGN1cnJlbnRUcmVlSXRlbSwgbmV3VHJlZUl0ZW0pO1xuXHRcdFx0XHRcdGlmIChuZXdUcmVlSXRlbUhhbmRsZSA9PT0gbmV3VHJlZUl0ZW0uaGFuZGxlKSB7XG5cdFx0XHRcdFx0XHRpdGVtc1RvUmVmcmVzaC5wdXNoKGN1cnJlbnRUcmVlSXRlbSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIFVwZGF0ZSBtYXBzIHdoZW4gaGFuZGxlIGlzIGNoYW5nZWQgYW5kIHJlZnJlc2ggcGFyZW50XG5cdFx0XHRcdFx0XHR0aGlzLml0ZW1zTWFwLmRlbGV0ZShuZXdUcmVlSXRlbUhhbmRsZSk7XG5cdFx0XHRcdFx0XHR0aGlzLml0ZW1zTWFwLnNldChjdXJyZW50VHJlZUl0ZW0uaGFuZGxlLCBjdXJyZW50VHJlZUl0ZW0pO1xuXHRcdFx0XHRcdFx0Y29uc3QgcGFyZW50ID0gbmV3VHJlZUl0ZW0ucGFyZW50SGFuZGxlID8gdGhpcy5pdGVtc01hcC5nZXQobmV3VHJlZUl0ZW0ucGFyZW50SGFuZGxlKSA6IG51bGw7XG5cdFx0XHRcdFx0XHRpZiAocGFyZW50KSB7XG5cdFx0XHRcdFx0XHRcdGl0ZW1zVG9SZWZyZXNoLnB1c2gocGFyZW50KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHsgaXRlbXM6IGl0ZW1zVG9SZWZyZXNoLCBjaGVja2JveGVzOiBjaGVja2JveGVzVG9SZWZyZXNoIH07XG5cdH1cblxuXHRnZXRJdGVtKHRyZWVJdGVtSGFuZGxlOiBzdHJpbmcpOiBJVHJlZUl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLml0ZW1zTWFwLmdldCh0cmVlSXRlbUhhbmRsZSk7XG5cdH1cblxuXHRpc0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLml0ZW1zTWFwLnNpemUgPT09IDA7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHBvc3RHZXRDaGlsZHJlbihlbGVtZW50R3JvdXBzOiAocmVhZG9ubHkgSVRyZWVJdGVtW10gfCB1bmRlZmluZWQpW10gfCB1bmRlZmluZWQpOiBQcm9taXNlPFJlc29sdmFibGVUcmVlSXRlbVtdW10gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoZWxlbWVudEdyb3VwcyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHRHcm91cHM6IFJlc29sdmFibGVUcmVlSXRlbVtdW10gPSBbXTtcblx0XHRjb25zdCBoYXNSZXNvbHZlID0gYXdhaXQgdGhpcy5oYXNSZXNvbHZlO1xuXHRcdGlmIChlbGVtZW50R3JvdXBzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGVsZW1lbnRzIG9mIGVsZW1lbnRHcm91cHMpIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0OiBSZXNvbHZhYmxlVHJlZUl0ZW1bXSA9IFtdO1xuXHRcdFx0XHRyZXN1bHRHcm91cHMucHVzaChyZXN1bHQpO1xuXHRcdFx0XHRpZiAoIWVsZW1lbnRzKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGVsZW1lbnRzKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb2x2YWJsZSA9IG5ldyBSZXNvbHZhYmxlVHJlZUl0ZW0oZWxlbWVudCwgaGFzUmVzb2x2ZSA/ICh0b2tlbikgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRyZXNvbHZlKHRoaXMudHJlZVZpZXdJZCwgZWxlbWVudC5oYW5kbGUsIHRva2VuKTtcblx0XHRcdFx0XHR9IDogdW5kZWZpbmVkKTtcblx0XHRcdFx0XHR0aGlzLml0ZW1zTWFwLnNldChlbGVtZW50LmhhbmRsZSwgcmVzb2x2YWJsZSk7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2gocmVzb2x2YWJsZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdEdyb3Vwcztcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVHJlZUl0ZW0oY3VycmVudDogSVRyZWVJdGVtLCB0cmVlSXRlbTogSVRyZWVJdGVtKTogdm9pZCB7XG5cdFx0dHJlZUl0ZW0uY2hpbGRyZW4gPSB0cmVlSXRlbS5jaGlsZHJlbiA/IHRyZWVJdGVtLmNoaWxkcmVuIDogdW5kZWZpbmVkO1xuXHRcdGlmIChjdXJyZW50KSB7XG5cdFx0XHRjb25zdCBwcm9wZXJ0aWVzID0gZGlzdGluY3QoWy4uLk9iamVjdC5rZXlzKGN1cnJlbnQgaW5zdGFuY2VvZiBSZXNvbHZhYmxlVHJlZUl0ZW0gPyBjdXJyZW50LmFzVHJlZUl0ZW0oKSA6IGN1cnJlbnQpLFxuXHRcdFx0Li4uT2JqZWN0LmtleXModHJlZUl0ZW0pXSk7XG5cdFx0XHRmb3IgKGNvbnN0IHByb3BlcnR5IG9mIHByb3BlcnRpZXMpIHtcblx0XHRcdFx0KGN1cnJlbnQgYXMgdW5rbm93biBhcyB7IFtrZXk6IHN0cmluZ106IHVua25vd24gfSlbcHJvcGVydHldID0gKHRyZWVJdGVtIGFzIHVua25vd24gYXMgeyBba2V5OiBzdHJpbmddOiB1bmtub3duIH0pW3Byb3BlcnR5XTtcblx0XHRcdH1cblx0XHRcdGlmIChjdXJyZW50IGluc3RhbmNlb2YgUmVzb2x2YWJsZVRyZWVJdGVtKSB7XG5cdFx0XHRcdGN1cnJlbnQucmVzZXRSZXNvbHZlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWSxlQUFlLHVCQUF1QjtBQUMzRCxTQUFTLGdCQUFpRSxtQkFBbUM7QUFDN0csU0FBb0YsWUFBWSxvQkFBZ0UsdUJBQThDO0FBQzlNLFNBQVMsNEJBQTZDO0FBQ3RELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsbUJBQW1CLGdCQUFnQjtBQUM1QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLDhCQUE4QixTQUFTLHNCQUFzQjtBQUN0RSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxXQUFXO0FBRXBCLFNBQVMsNkJBQTZCO0FBQ3RDLFlBQVksaUJBQWlCO0FBRTdCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMseUJBQXlCO0FBRzNCLElBQU0sc0JBQU4sY0FBa0MsV0FBK0M7QUFBQSxFQU12RixZQUNDLGdCQUNnQyxjQUNPLHFCQUNILGtCQUNOLFlBQ00sa0JBQ25DO0FBQ0QsVUFBTTtBQU4wQjtBQUNPO0FBQ0g7QUFDTjtBQUNNO0FBVHJDLFNBQWlCLGlCQUFxRyxLQUFLLFVBQVUsSUFBSSxjQUFtRixDQUFDO0FBQzdOLFNBQWlCLGtCQUFrQixvQkFBSSxJQUEyQztBQVdqRixTQUFLLFNBQVMsZUFBZSxTQUFTLGVBQWUsZ0JBQWdCO0FBQUEsRUFDdEU7QUFBQSxFQUVBLE1BQU0sOEJBQThCLFlBQW9CLFNBQW1OO0FBQzFRLFNBQUssV0FBVyxNQUFNLHFEQUFx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
