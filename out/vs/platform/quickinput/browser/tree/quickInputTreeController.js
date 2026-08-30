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
import * as dom from "../../../../base/browser/dom.js";
import { RenderIndentGuides } from "../../../../base/browser/ui/tree/abstractTree.js";
import { ObjectTreeElementCollapseState } from "../../../../base/browser/ui/tree/tree.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IInstantiationService } from "../../../instantiation/common/instantiation.js";
import { WorkbenchObjectTree } from "../../../list/browser/listService.js";
import { QuickPickFocus } from "../../common/quickInput.js";
import { QuickInputTreeDelegate } from "./quickInputDelegate.js";
import { getParentNodeState } from "./quickInputTree.js";
import { QuickTreeAccessibilityProvider } from "./quickInputTreeAccessibilityProvider.js";
import { QuickInputTreeFilter } from "./quickInputTreeFilter.js";
import { QuickInputCheckboxStateHandler, QuickInputTreeRenderer } from "./quickInputTreeRenderer.js";
import { QuickInputTreeSorter } from "./quickInputTreeSorter.js";
import { Checkbox } from "../../../../base/browser/ui/toggle/toggle.js";
const $ = dom.$;
const flatHierarchyClass = "quick-input-tree-flat";
class QuickInputTreeIdentityProvider {
  constructor() {
    this._elementIds = /* @__PURE__ */ new WeakMap();
    this._counter = 0;
  }
  getId(element) {
    let id = element.id;
    if (id !== void 0) {
      return id;
    }
    id = this._elementIds.get(element);
    if (id !== void 0) {
      return id;
    }
    id = `__generated_${this._counter++}`;
    this._elementIds.set(element, id);
    return id;
  }
}
let QuickInputTreeController = class extends Disposable {
  constructor(container, hoverDelegate, styles, instantiationService) {
    super();
    this.instantiationService = instantiationService;
    this._onDidTriggerButton = this._register(new Emitter());
    this.onDidTriggerButton = this._onDidTriggerButton.event;
    this._onDidChangeCheckboxState = this._register(new Emitter());
    this.onDidChangeCheckboxState = this._onDidChangeCheckboxState.event;
    this._onDidCheckedLeafItemsChange = this._register(new Emitter());
    this.onDidChangeCheckedLeafItems = this._onDidCheckedLeafItemsChange.event;
    this._onLeave = this._register(new Emitter());
    /**
     * Event that is fired when the tree would no longer have focus.
    */
    this.onLeave = this._onLeave.event;
    this._onDidAccept = this._register(new Emitter());
    /**
     * Event that is fired when a non-pickable item is clicked, indicating acceptance.
     */
    this.onDidAccept = this._onDidAccept.event;
    this._container = dom.append(container, $(".quick-input-tree"));
    this._checkboxStateHandler = this._register(new QuickInputCheckboxStateHandler());
    this._renderer = this._register(this.instantiationService.createInstance(
      QuickInputTreeRenderer,
      hoverDelegate,
      this._onDidTriggerButton,
      this.onDidChangeCheckboxState,
      this._checkboxStateHandler,
      styles.toggle
    ));
    this._filter = this.instantiationService.createInstance(QuickInputTreeFilter);
    this._sorter = this._register(new QuickInputTreeSorter());
    this._tree = this._register(this.instantiationService.createInstance(
      WorkbenchObjectTree,
      "QuickInputTree",
      this._container,
      new QuickInputTreeDelegate(),
      [this._renderer],
      {
        accessibilityProvider: new QuickTreeAccessibilityProvider(this.onDidChangeCheckboxState),
        horizontalScrolling: false,
        multipleSelectionSupport: false,
        findWidgetEnabled: false,
        alwaysConsumeMouseWheel: true,
        hideTwistiesOfChildlessElements: true,
        renderIndentGuides: RenderIndentGuides.None,
        expandOnDoubleClick: true,
        expandOnlyOnTwistieClick: true,
        disableExpandOnSpacebar: true,
        sorter: this._sorter,
        filter: this._filter,
        identityProvider: new QuickInputTreeIdentityProvider()
      }
    ));
    this._register(this._renderer.onDidDisposeFocusedElement(() => {
      this._tree.domFocus();
    }));
    this.registerCheckboxStateListeners();
    this.registerOnDidChangeFocus();
  }
  get tree() {
    return this._tree;
  }
  get renderer() {
    return this._renderer;
  }
  get displayed() {
    return this._container.style.display !== "none";
  }
  set displayed(value) {
    this._container.style.display = value ? "" : "none";
  }
  get sortByLabel() {
    return this._sorter.sortByLabel;
  }
  set sortByLabel(value) {
    this._sorter.sortByLabel = value;
    this._tree.resort(null, true);
  }
  getActiveDescendant() {
    return this._tree.getHTMLElement().getAttribute("aria-activedescendant");
  }
  filter(input) {
    this._filter.filterValue = input;
    this._tree.refilter();
  }
  updateFilterOptions(options) {
    if (options.matchOnLabel !== void 0) {
      this._filter.matchOnLabel = options.matchOnLabel;
    }
    if (options.matchOnDescription !== void 0) {
      this._filter.matchOnDescription = options.matchOnDescription;
    }
    this._tree.refilter();
  }
  setTreeData(treeData) {
    let hasNestedItems = false;
    const createTreeElement = (item) => {
      let children;
      if (item.children && item.children.length > 0) {
        hasNestedItems = true;
        children = item.children.map((child) => createTreeElement(child));
        item.checked = getParentNodeState(children);
      }
      return {
        element: item,
        children,
        collapsible: !!children,
        collapsed: item.collapsed ? ObjectTreeElementCollapseState.PreserveOrCollapsed : ObjectTreeElementCollapseState.PreserveOrExpanded
      };
    };
    const treeElements = treeData.map((item) => createTreeElement(item));
    this._tree.setChildren(null, treeElements);
    this._container.classList.toggle(flatHierarchyClass, !hasNestedItems);
  }
  layout(maxHeight) {
    this._tree.getHTMLElement().style.maxHeight = maxHeight ? `${// Make sure height aligns with list item heights
    Math.floor(maxHeight / 44) * 44 + 6}px` : "";
    this._tree.layout();
  }
  focus(what) {
    switch (what) {
      case QuickPickFocus.First:
        this._tree.scrollTop = 0;
        this._tree.focusFirst();
        break;
      case QuickPickFocus.Second: {
        this._tree.scrollTop = 0;
        let isSecondItem = false;
        this._tree.focusFirst(void 0, (e) => {
          if (isSecondItem) {
            return true;
          }
          isSecondItem = !isSecondItem;
          return false;
        });
        break;
      }
      case QuickPickFocus.Last:
        this._tree.scrollTop = this._tree.scrollHeight;
        this._tree.focusLast();
        break;
      case QuickPickFocus.Next: {
        const prevFocus = this._tree.getFocus();
        this._tree.focusNext(void 0, false, void 0, (e) => {
          this._tree.reveal(e.element);
          return true;
        });
        const currentFocus = this._tree.getFocus();
        if (prevFocus.length && prevFocus[0] === currentFocus[0]) {
          this._onLeave.fire();
        }
        break;
      }
      case QuickPickFocus.Previous: {
        const prevFocus = this._tree.getFocus();
        this._tree.focusPrevious(void 0, false, void 0, (e) => {
          this._tree.reveal(e.element);
          return true;
        });
        const currentFocus = this._tree.getFocus();
        if (prevFocus.length && prevFocus[0] === currentFocus[0]) {
          this._onLeave.fire();
        }
        break;
      }
      case QuickPickFocus.NextPage:
        this._tree.focusNextPage(void 0, (e) => {
          this._tree.reveal(e.element);
          return true;
        });
        break;
      case QuickPickFocus.PreviousPage:
        this._tree.focusPreviousPage(void 0, (e) => {
          this._tree.reveal(e.element);
          return true;
        });
        break;
      case QuickPickFocus.NextSeparator:
      case QuickPickFocus.PreviousSeparator:
        return;
    }
  }
  registerCheckboxStateListeners() {
    this._register(this._tree.onDidOpen((e) => {
      const item = e.element;
      if (!item) {
        return;
      }
      if (item.disabled) {
        return;
      }
      if (item.pickable === false) {
        this._tree.setFocus([item]);
        this._onDidAccept.fire();
        return;
      }
      const target = e.browserEvent?.target;
      if (target && target.classList.contains(Checkbox.CLASS_NAME)) {
        return;
      }
      this.updateCheckboxState(item, item.checked === true);
    }));
    this._register(this._checkboxStateHandler.onDidChangeCheckboxState((e) => {
      this.updateCheckboxState(e.item, e.checked === true, true);
      this._tree.setFocus([e.item]);
      this._tree.setSelection([e.item]);
    }));
  }
  updateCheckboxState(item, newState, skipItemRerender = false) {
    if ((item.checked ?? false) === newState) {
      return;
    }
    item.checked = newState;
    if (!skipItemRerender) {
      this._tree.rerender(item);
    }
    const updateSet = /* @__PURE__ */ new Set();
    const toUpdate = [...this._tree.getNode(item).children];
    while (toUpdate.length) {
      const pop = toUpdate.shift();
      if (pop?.element && !updateSet.has(pop.element)) {
        updateSet.add(pop.element);
        if ((pop.element.checked ?? false) !== item.checked) {
          pop.element.checked = item.checked;
          this._tree.rerender(pop.element);
        }
        toUpdate.push(...pop.children);
      }
    }
    let parent = this._tree.getParentElement(item);
    while (parent) {
      const parentChildren = [...this._tree.getNode(parent).children];
      const newState2 = getParentNodeState(parentChildren);
      if ((parent.checked ?? false) !== newState2) {
        parent.checked = newState2;
        this._tree.rerender(parent);
      }
      parent = this._tree.getParentElement(parent);
    }
    this._onDidChangeCheckboxState.fire({
      item,
      checked: item.checked ?? false
    });
    this._onDidCheckedLeafItemsChange.fire(this.getCheckedLeafItems());
  }
  registerOnDidChangeFocus() {
    this._register(this._tree.onDidChangeFocus((e) => {
      const item = this._tree.getFocus().findLast((item2) => item2 !== null);
      this._tree.setSelection(item ? [item] : [], e.browserEvent);
    }));
  }
  getCheckedLeafItems() {
    const lookedAt = /* @__PURE__ */ new Set();
    const toLookAt = [...this._tree.getNode().children];
    const checkedItems = new Array();
    while (toLookAt.length) {
      const lookAt = toLookAt.shift();
      if (!lookAt?.element || lookedAt.has(lookAt.element)) {
        continue;
      }
      if (lookAt.element.checked) {
        lookedAt.add(lookAt.element);
        toLookAt.push(...lookAt.children);
        if (!lookAt.element.children) {
          checkedItems.push(lookAt.element);
        }
      }
    }
    return checkedItems;
  }
  getActiveItems() {
    return this._tree.getFocus().filter((item) => item !== null);
  }
  toggleCheckbox() {
    for (const element of this.getActiveItems()) {
      if (element.pickable !== false && !element.disabled) {
        this.updateCheckboxState(element, !(element.checked === true));
      }
    }
  }
  checkAll(checked) {
    const updated = /* @__PURE__ */ new Set();
    const toUpdate = [...this._tree.getNode().children];
    let fireCheckedChangeEvent = false;
    while (toUpdate.length) {
      const update = toUpdate.shift();
      if (!update?.element || updated.has(update.element)) {
        continue;
      }
      if (update.element.checked !== checked) {
        fireCheckedChangeEvent = true;
        update.element.checked = checked;
        toUpdate.push(...update.children);
        updated.add(update.element);
        this._tree.rerender(update.element);
        this._onDidChangeCheckboxState.fire({
          item: update.element,
          checked: update.element.checked
        });
      }
    }
    if (fireCheckedChangeEvent) {
      this._onDidCheckedLeafItemsChange.fire(this.getCheckedLeafItems());
    }
  }
};
QuickInputTreeController = __decorateClass([
  __decorateParam(3, IInstantiationService)
], QuickInputTreeController);
export {
  QuickInputTreeController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccXVpY2tpbnB1dFxcYnJvd3NlclxcdHJlZVxccXVpY2tJbnB1dFRyZWVDb250cm9sbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgUmVuZGVySW5kZW50R3VpZGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvYWJzdHJhY3RUcmVlLmpzJztcbmltcG9ydCB7IElIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGUuanMnO1xuaW1wb3J0IHsgSU9iamVjdFRyZWVFbGVtZW50LCBPYmplY3RUcmVlRWxlbWVudENvbGxhcHNlU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IElJZGVudGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hPYmplY3RUcmVlIH0gZnJvbSAnLi4vLi4vLi4vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElRdWlja1RyZWVDaGVja2JveEV2ZW50LCBJUXVpY2tUcmVlSXRlbSwgSVF1aWNrVHJlZUl0ZW1CdXR0b25FdmVudCwgUXVpY2tQaWNrRm9jdXMgfSBmcm9tICcuLi8uLi9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBRdWlja0lucHV0VHJlZURlbGVnYXRlIH0gZnJvbSAnLi9xdWlja0lucHV0RGVsZWdhdGUuanMnO1xuaW1wb3J0IHsgZ2V0UGFyZW50Tm9kZVN0YXRlLCBJUXVpY2tUcmVlRmlsdGVyRGF0YSB9IGZyb20gJy4vcXVpY2tJbnB1dFRyZWUuanMnO1xuaW1wb3J0IHsgUXVpY2tUcmVlQWNjZXNzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi9xdWlja0lucHV0VHJlZUFjY2Vzc2liaWxpdHlQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBRdWlja0lucHV0VHJlZUZpbHRlciB9IGZyb20gJy4vcXVpY2tJbnB1dFRyZWVGaWx0ZXIuanMnO1xuaW1wb3J0IHsgUXVpY2tJbnB1dENoZWNrYm94U3RhdGVIYW5kbGVyLCBRdWlja0lucHV0VHJlZVJlbmRlcmVyIH0gZnJvbSAnLi9xdWlja0lucHV0VHJlZVJlbmRlcmVyLmpzJztcbmltcG9ydCB7IFF1aWNrSW5wdXRUcmVlU29ydGVyIH0gZnJvbSAnLi9xdWlja0lucHV0VHJlZVNvcnRlci5qcyc7XG5pbXBvcnQgeyBDaGVja2JveCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U3R5bGVzIH0gZnJvbSAnLi4vcXVpY2tJbnB1dC5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcbmNvbnN0IGZsYXRIaWVyYXJjaHlDbGFzcyA9ICdxdWljay1pbnB1dC10cmVlLWZsYXQnO1xuXG5jbGFzcyBRdWlja0lucHV0VHJlZUlkZW50aXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJSWRlbnRpdHlQcm92aWRlcjxJUXVpY2tUcmVlSXRlbT4ge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lbGVtZW50SWRzID0gbmV3IFdlYWtNYXA8SVF1aWNrVHJlZUl0ZW0sIHN0cmluZz4oKTtcblx0cHJpdmF0ZSBfY291bnRlciA9IDA7XG5cblx0Z2V0SWQoZWxlbWVudDogSVF1aWNrVHJlZUl0ZW0pOiB7IHRvU3RyaW5nKCk6IHN0cmluZyB9IHtcblx0XHRsZXQgaWQgPSBlbGVtZW50LmlkO1xuXHRcdGlmIChpZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gaWQ7XG5cdFx0fVxuXG5cdFx0aWQgPSB0aGlzLl9lbGVtZW50SWRzLmdldChlbGVtZW50KTtcblx0XHRpZiAoaWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGlkO1xuXHRcdH1cblxuXHRcdGlkID0gYF9fZ2VuZXJhdGVkXyR7dGhpcy5fY291bnRlcisrfWA7XG5cdFx0dGhpcy5fZWxlbWVudElkcy5zZXQoZWxlbWVudCwgaWQpO1xuXHRcdHJldHVybiBpZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUXVpY2tJbnB1dFRyZWVDb250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlcmVyOiBRdWlja0lucHV0VHJlZVJlbmRlcmVyPElRdWlja1RyZWVJdGVtPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hlY2tib3hTdGF0ZUhhbmRsZXI6IFF1aWNrSW5wdXRDaGVja2JveFN0YXRlSGFuZGxlcjxJUXVpY2tUcmVlSXRlbT47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpbHRlcjogUXVpY2tJbnB1dFRyZWVGaWx0ZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NvcnRlcjogUXVpY2tJbnB1dFRyZWVTb3J0ZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyZWU6IFdvcmtiZW5jaE9iamVjdFRyZWU8SVF1aWNrVHJlZUl0ZW0sIElRdWlja1RyZWVGaWx0ZXJEYXRhPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFRyaWdnZXJCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUXVpY2tUcmVlSXRlbUJ1dHRvbkV2ZW50PElRdWlja1RyZWVJdGVtPj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVHJpZ2dlckJ1dHRvbiA9IHRoaXMuX29uRGlkVHJpZ2dlckJ1dHRvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNoZWNrYm94U3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUXVpY2tUcmVlQ2hlY2tib3hFdmVudDxJUXVpY2tUcmVlSXRlbT4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNoZWNrYm94U3RhdGUgPSB0aGlzLl9vbkRpZENoYW5nZUNoZWNrYm94U3RhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGVja2VkTGVhZkl0ZW1zQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8UmVhZG9ubHlBcnJheTxJUXVpY2tUcmVlSXRlbT4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNoZWNrZWRMZWFmSXRlbXMgPSB0aGlzLl9vbkRpZENoZWNrZWRMZWFmSXRlbXNDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25MZWF2ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHQvKipcblx0ICogRXZlbnQgdGhhdCBpcyBmaXJlZCB3aGVuIHRoZSB0cmVlIHdvdWxkIG5vIGxvbmdlciBoYXZlIGZvY3VzLlxuXHQqL1xuXHRyZWFkb25seSBvbkxlYXZlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uTGVhdmUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBY2NlcHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0LyoqXG5cdCAqIEV2ZW50IHRoYXQgaXMgZmlyZWQgd2hlbiBhIG5vbi1waWNrYWJsZSBpdGVtIGlzIGNsaWNrZWQsIGluZGljYXRpbmcgYWNjZXB0YW5jZS5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQWNjZXB0OiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQWNjZXB0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRob3ZlckRlbGVnYXRlOiBJSG92ZXJEZWxlZ2F0ZSB8IHVuZGVmaW5lZCxcblx0XHRzdHlsZXM6IElRdWlja0lucHV0U3R5bGVzLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NvbnRhaW5lciA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcucXVpY2staW5wdXQtdHJlZScpKTtcblx0XHR0aGlzLl9jaGVja2JveFN0YXRlSGFuZGxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBRdWlja0lucHV0Q2hlY2tib3hTdGF0ZUhhbmRsZXI8SVF1aWNrVHJlZUl0ZW0+KCkpO1xuXHRcdHRoaXMuX3JlbmRlcmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFF1aWNrSW5wdXRUcmVlUmVuZGVyZXIsXG5cdFx0XHRob3ZlckRlbGVnYXRlLFxuXHRcdFx0dGhpcy5fb25EaWRUcmlnZ2VyQnV0dG9uLFxuXHRcdFx0dGhpcy5vbkRpZENoYW5nZUNoZWNrYm94U3RhdGUsXG5cdFx0XHR0aGlzLl9jaGVja2JveFN0YXRlSGFuZGxlcixcblx0XHRcdHN0eWxlcy50b2dnbGVcblx0XHQpKTtcblx0XHR0aGlzLl9maWx0ZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFF1aWNrSW5wdXRUcmVlRmlsdGVyKTtcblx0XHR0aGlzLl9zb3J0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUXVpY2tJbnB1dFRyZWVTb3J0ZXIoKSk7XG5cdFx0dGhpcy5fdHJlZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hPYmplY3RUcmVlPElRdWlja1RyZWVJdGVtLCBJUXVpY2tUcmVlRmlsdGVyRGF0YT4sXG5cdFx0XHQnUXVpY2tJbnB1dFRyZWUnLFxuXHRcdFx0dGhpcy5fY29udGFpbmVyLFxuXHRcdFx0bmV3IFF1aWNrSW5wdXRUcmVlRGVsZWdhdGUoKSxcblx0XHRcdFt0aGlzLl9yZW5kZXJlcl0sXG5cdFx0XHR7XG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogbmV3IFF1aWNrVHJlZUFjY2Vzc2liaWxpdHlQcm92aWRlcih0aGlzLm9uRGlkQ2hhbmdlQ2hlY2tib3hTdGF0ZSksXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHRmaW5kV2lkZ2V0RW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiB0cnVlLFxuXHRcdFx0XHRoaWRlVHdpc3RpZXNPZkNoaWxkbGVzc0VsZW1lbnRzOiB0cnVlLFxuXHRcdFx0XHRyZW5kZXJJbmRlbnRHdWlkZXM6IFJlbmRlckluZGVudEd1aWRlcy5Ob25lLFxuXHRcdFx0XHRleHBhbmRPbkRvdWJsZUNsaWNrOiB0cnVlLFxuXHRcdFx0XHRleHBhbmRPbmx5T25Ud2lzdGllQ2xpY2s6IHRydWUsXG5cdFx0XHRcdGRpc2FibGVFeHBhbmRPblNwYWNlYmFyOiB0cnVlLFxuXHRcdFx0XHRzb3J0ZXI6IHRoaXMuX3NvcnRlcixcblx0XHRcdFx0ZmlsdGVyOiB0aGlzLl9maWx0ZXIsXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IG5ldyBRdWlja0lucHV0VHJlZUlkZW50aXR5UHJvdmlkZXIoKVxuXHRcdFx0fVxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlbmRlcmVyLm9uRGlkRGlzcG9zZUZvY3VzZWRFbGVtZW50KCgpID0+IHtcblx0XHRcdHRoaXMuX3RyZWUuZG9tRm9jdXMoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5yZWdpc3RlckNoZWNrYm94U3RhdGVMaXN0ZW5lcnMoKTtcblx0XHR0aGlzLnJlZ2lzdGVyT25EaWRDaGFuZ2VGb2N1cygpO1xuXHR9XG5cblx0Z2V0IHRyZWUoKTogV29ya2JlbmNoT2JqZWN0VHJlZTxJUXVpY2tUcmVlSXRlbSwgSVF1aWNrVHJlZUZpbHRlckRhdGE+IHtcblx0XHRyZXR1cm4gdGhpcy5fdHJlZTtcblx0fVxuXG5cdGdldCByZW5kZXJlcigpOiBRdWlja0lucHV0VHJlZVJlbmRlcmVyPElRdWlja1RyZWVJdGVtPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVyO1xuXHR9XG5cblx0Z2V0IGRpc3BsYXllZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgIT09ICdub25lJztcblx0fVxuXG5cdHNldCBkaXNwbGF5ZWQodmFsdWU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9jb250YWluZXIuc3R5bGUuZGlzcGxheSA9IHZhbHVlID8gJycgOiAnbm9uZSc7XG5cdH1cblxuXHRnZXQgc29ydEJ5TGFiZWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3NvcnRlci5zb3J0QnlMYWJlbDtcblx0fVxuXG5cdHNldCBzb3J0QnlMYWJlbCh2YWx1ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuX3NvcnRlci5zb3J0QnlMYWJlbCA9IHZhbHVlO1xuXHRcdHRoaXMuX3RyZWUucmVzb3J0KG51bGwsIHRydWUpO1xuXHR9XG5cblx0Z2V0QWN0aXZlRGVzY2VuZGFudCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fdHJlZS5nZXRIVE1MRWxlbWVudCgpLmdldEF0dHJpYnV0ZSgnYXJpYS1hY3RpdmVkZXNjZW5kYW50Jyk7XG5cdH1cblxuXHRmaWx0ZXIoaW5wdXQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2ZpbHRlci5maWx0ZXJWYWx1ZSA9IGlucHV0O1xuXHRcdHRoaXMuX3RyZWUucmVmaWx0ZXIoKTtcblx0fVxuXG5cdHVwZGF0ZUZpbHRlck9wdGlvbnMob3B0aW9uczoge1xuXHRcdG1hdGNoT25MYWJlbD86IGJvb2xlYW47XG5cdFx0bWF0Y2hPbkRlc2NyaXB0aW9uPzogYm9vbGVhbjtcblx0fSk6IHZvaWQge1xuXHRcdGlmIChvcHRpb25zLm1hdGNoT25MYWJlbCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9maWx0ZXIubWF0Y2hPbkxhYmVsID0gb3B0aW9ucy5tYXRjaE9uTGFiZWw7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLm1hdGNoT25EZXNjcmlwdGlvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9maWx0ZXIubWF0Y2hPbkRlc2NyaXB0aW9uID0gb3B0aW9ucy5tYXRjaE9uRGVzY3JpcHRpb247XG5cdFx0fVxuXHRcdHRoaXMuX3RyZWUucmVmaWx0ZXIoKTtcblx0fVxuXG5cdHNldFRyZWVEYXRhKHRyZWVEYXRhOiByZWFkb25seSBJUXVpY2tUcmVlSXRlbVtdKTogdm9pZCB7XG5cdFx0bGV0IGhhc05lc3RlZEl0ZW1zID0gZmFsc2U7XG5cdFx0Y29uc3QgY3JlYXRlVHJlZUVsZW1lbnQgPSAoaXRlbTogSVF1aWNrVHJlZUl0ZW0pOiBJT2JqZWN0VHJlZUVsZW1lbnQ8SVF1aWNrVHJlZUl0ZW0+ID0+IHtcblx0XHRcdGxldCBjaGlsZHJlbjogSU9iamVjdFRyZWVFbGVtZW50PElRdWlja1RyZWVJdGVtPltdIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGl0ZW0uY2hpbGRyZW4gJiYgaXRlbS5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGhhc05lc3RlZEl0ZW1zID0gdHJ1ZTtcblx0XHRcdFx0Y2hpbGRyZW4gPSBpdGVtLmNoaWxkcmVuLm1hcChjaGlsZCA9PiBjcmVhdGVUcmVlRWxlbWVudChjaGlsZCkpO1xuXHRcdFx0XHRpdGVtLmNoZWNrZWQgPSBnZXRQYXJlbnROb2RlU3RhdGUoY2hpbGRyZW4pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZWxlbWVudDogaXRlbSxcblx0XHRcdFx0Y2hpbGRyZW4sXG5cdFx0XHRcdGNvbGxhcHNpYmxlOiAhIWNoaWxkcmVuLFxuXHRcdFx0XHRjb2xsYXBzZWQ6IGl0ZW0uY29sbGFwc2VkID9cblx0XHRcdFx0XHRPYmplY3RUcmVlRWxlbWVudENvbGxhcHNlU3RhdGUuUHJlc2VydmVPckNvbGxhcHNlZCA6XG5cdFx0XHRcdFx0T2JqZWN0VHJlZUVsZW1lbnRDb2xsYXBzZVN0YXRlLlByZXNlcnZlT3JFeHBhbmRlZFxuXHRcdFx0fTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgdHJlZUVsZW1lbnRzID0gdHJlZURhdGEubWFwKGl0ZW0gPT4gY3JlYXRlVHJlZUVsZW1lbnQoaXRlbSkpO1xuXHRcdHRoaXMuX3RyZWUuc2V0Q2hpbGRyZW4obnVsbCwgdHJlZUVsZW1lbnRzKTtcblx0XHR0aGlzLl9jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZShmbGF0SGllcmFyY2h5Q2xhc3MsICFoYXNOZXN0ZWRJdGVtcyk7XG5cdH1cblxuXHRsYXlvdXQobWF4SGVpZ2h0PzogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fdHJlZS5nZXRIVE1MRWxlbWVudCgpLnN0eWxlLm1heEhlaWdodCA9IG1heEhlaWdodCA/IGAke1xuXHRcdFx0Ly8gTWFrZSBzdXJlIGhlaWdodCBhbGlnbnMgd2l0aCBsaXN0IGl0ZW0gaGVpZ2h0c1xuXHRcdFx0TWF0aC5mbG9vcihtYXhIZWlnaHQgLyA0NCkgKiA0NFxuXHRcdFx0Ly8gQWRkIHNvbWUgZXh0cmEgaGVpZ2h0IHNvIHRoYXQgaXQncyBjbGVhciB0aGVyZSdzIG1vcmUgdG8gc2Nyb2xsXG5cdFx0XHQrIDZcblx0XHRcdH1weGAgOiAnJztcblx0XHR0aGlzLl90cmVlLmxheW91dCgpO1xuXHR9XG5cblx0Zm9jdXMod2hhdDogUXVpY2tQaWNrRm9jdXMpOiB2b2lkIHtcblx0XHRzd2l0Y2ggKHdoYXQpIHtcblx0XHRcdGNhc2UgUXVpY2tQaWNrRm9jdXMuRmlyc3Q6XG5cdFx0XHRcdHRoaXMuX3RyZWUuc2Nyb2xsVG9wID0gMDtcblx0XHRcdFx0dGhpcy5fdHJlZS5mb2N1c0ZpcnN0KCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBRdWlja1BpY2tGb2N1cy5TZWNvbmQ6IHtcblx0XHRcdFx0dGhpcy5fdHJlZS5zY3JvbGxUb3AgPSAwO1xuXHRcdFx0XHRsZXQgaXNTZWNvbmRJdGVtID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMuX3RyZWUuZm9jdXNGaXJzdCh1bmRlZmluZWQsIChlKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGlzU2Vjb25kSXRlbSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlzU2Vjb25kSXRlbSA9ICFpc1NlY29uZEl0ZW07XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFF1aWNrUGlja0ZvY3VzLkxhc3Q6XG5cdFx0XHRcdHRoaXMuX3RyZWUuc2Nyb2xsVG9wID0gdGhpcy5fdHJlZS5zY3JvbGxIZWlnaHQ7XG5cdFx0XHRcdHRoaXMuX3RyZWUuZm9jdXNMYXN0KCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBRdWlja1BpY2tGb2N1cy5OZXh0OiB7XG5cdFx0XHRcdGNvbnN0IHByZXZGb2N1cyA9IHRoaXMuX3RyZWUuZ2V0Rm9jdXMoKTtcblx0XHRcdFx0dGhpcy5fdHJlZS5mb2N1c05leHQodW5kZWZpbmVkLCBmYWxzZSwgdW5kZWZpbmVkLCAoZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3RyZWUucmV2ZWFsKGUuZWxlbWVudCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBjdXJyZW50Rm9jdXMgPSB0aGlzLl90cmVlLmdldEZvY3VzKCk7XG5cdFx0XHRcdGlmIChwcmV2Rm9jdXMubGVuZ3RoICYmIHByZXZGb2N1c1swXSA9PT0gY3VycmVudEZvY3VzWzBdKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25MZWF2ZS5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFF1aWNrUGlja0ZvY3VzLlByZXZpb3VzOiB7XG5cdFx0XHRcdGNvbnN0IHByZXZGb2N1cyA9IHRoaXMuX3RyZWUuZ2V0Rm9jdXMoKTtcblx0XHRcdFx0dGhpcy5fdHJlZS5mb2N1c1ByZXZpb3VzKHVuZGVmaW5lZCwgZmFsc2UsIHVuZGVmaW5lZCwgKGUpID0+IHtcblx0XHRcdFx0XHQvLyBkbyB3ZSB3YW50IHRvIHJldmVhbCB0aGUgcGFyZW50P1xuXHRcdFx0XHRcdHRoaXMuX3RyZWUucmV2ZWFsKGUuZWxlbWVudCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBjdXJyZW50Rm9jdXMgPSB0aGlzLl90cmVlLmdldEZvY3VzKCk7XG5cdFx0XHRcdGlmIChwcmV2Rm9jdXMubGVuZ3RoICYmIHByZXZGb2N1c1swXSA9PT0gY3VycmVudEZvY3VzWzBdKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25MZWF2ZS5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFF1aWNrUGlja0ZvY3VzLk5leHRQYWdlOlxuXHRcdFx0XHR0aGlzLl90cmVlLmZvY3VzTmV4dFBhZ2UodW5kZWZpbmVkLCAoZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3RyZWUucmV2ZWFsKGUuZWxlbWVudCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUXVpY2tQaWNrRm9jdXMuUHJldmlvdXNQYWdlOlxuXHRcdFx0XHR0aGlzLl90cmVlLmZvY3VzUHJldmlvdXNQYWdlKHVuZGVmaW5lZCwgKGUpID0+IHtcblx0XHRcdFx0XHQvLyBkbyB3ZSB3YW50IHRvIHJldmVhbCB0aGUgcGFyZW50P1xuXHRcdFx0XHRcdHRoaXMuX3RyZWUucmV2ZWFsKGUuZWxlbWVudCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUXVpY2tQaWNrRm9jdXMuTmV4dFNlcGFyYXRvcjpcblx0XHRcdGNhc2UgUXVpY2tQaWNrRm9jdXMuUHJldmlvdXNTZXBhcmF0b3I6XG5cdFx0XHRcdC8vIFRoZXNlIGRvbid0IG1ha2Ugc2Vuc2UgZm9yIHRoZSB0cmVlXG5cdFx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRyZWdpc3RlckNoZWNrYm94U3RhdGVMaXN0ZW5lcnMoKSB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdHJlZS5vbkRpZE9wZW4oZSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtID0gZS5lbGVtZW50O1xuXHRcdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGl0ZW0uZGlzYWJsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayBpZiB0aGUgaXRlbSBpcyBwaWNrYWJsZSAoZGVmYXVsdHMgdG8gdHJ1ZSBpZiBub3Qgc3BlY2lmaWVkKVxuXHRcdFx0aWYgKGl0ZW0ucGlja2FibGUgPT09IGZhbHNlKSB7XG5cdFx0XHRcdC8vIEZvciBub24tcGlja2FibGUgaXRlbXMsIHNldCBpdCBhcyB0aGUgYWN0aXZlIGl0ZW0gYW5kIGZpcmUgdGhlIGFjY2VwdCBldmVudFxuXHRcdFx0XHR0aGlzLl90cmVlLnNldEZvY3VzKFtpdGVtXSk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQWNjZXB0LmZpcmUoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0YXJnZXQgPSBlLmJyb3dzZXJFdmVudD8udGFyZ2V0IGFzIEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHRhcmdldCAmJiB0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKENoZWNrYm94LkNMQVNTX05BTUUpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy51cGRhdGVDaGVja2JveFN0YXRlKGl0ZW0sIGl0ZW0uY2hlY2tlZCA9PT0gdHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2hlY2tib3hTdGF0ZUhhbmRsZXIub25EaWRDaGFuZ2VDaGVja2JveFN0YXRlKGUgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVDaGVja2JveFN0YXRlKGUuaXRlbSwgZS5jaGVja2VkID09PSB0cnVlLCB0cnVlKTtcblx0XHRcdHRoaXMuX3RyZWUuc2V0Rm9jdXMoW2UuaXRlbV0pO1xuXHRcdFx0dGhpcy5fdHJlZS5zZXRTZWxlY3Rpb24oW2UuaXRlbV0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ2hlY2tib3hTdGF0ZShpdGVtOiBJUXVpY2tUcmVlSXRlbSwgbmV3U3RhdGU6IGJvb2xlYW4sIHNraXBJdGVtUmVyZW5kZXIgPSBmYWxzZSk6IHZvaWQge1xuXHRcdGlmICgoaXRlbS5jaGVja2VkID8/IGZhbHNlKSA9PT0gbmV3U3RhdGUpIHtcblx0XHRcdHJldHVybjsgLy8gTm8gY2hhbmdlXG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIGNoZWNrZWQgaXRlbVxuXHRcdGl0ZW0uY2hlY2tlZCA9IG5ld1N0YXRlO1xuXHRcdGlmICghc2tpcEl0ZW1SZXJlbmRlcikge1xuXHRcdFx0dGhpcy5fdHJlZS5yZXJlbmRlcihpdGVtKTtcblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgY2hpbGRyZW4gb2YgdGhlIGNoZWNrZWQgaXRlbVxuXHRcdGNvbnN0IHVwZGF0ZVNldCA9IG5ldyBTZXQ8SVF1aWNrVHJlZUl0ZW0+KCk7XG5cdFx0Y29uc3QgdG9VcGRhdGUgPSBbLi4udGhpcy5fdHJlZS5nZXROb2RlKGl0ZW0pLmNoaWxkcmVuXTtcblx0XHR3aGlsZSAodG9VcGRhdGUubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBwb3AgPSB0b1VwZGF0ZS5zaGlmdCgpO1xuXHRcdFx0aWYgKHBvcD8uZWxlbWVudCAmJiAhdXBkYXRlU2V0Lmhhcyhwb3AuZWxlbWVudCkpIHtcblx0XHRcdFx0dXBkYXRlU2V0LmFkZChwb3AuZWxlbWVudCk7XG5cdFx0XHRcdGlmICgocG9wLmVsZW1lbnQuY2hlY2tlZCA/PyBmYWxzZSkgIT09IGl0ZW0uY2hlY2tlZCkge1xuXHRcdFx0XHRcdHBvcC5lbGVtZW50LmNoZWNrZWQgPSBpdGVtLmNoZWNrZWQ7XG5cdFx0XHRcdFx0dGhpcy5fdHJlZS5yZXJlbmRlcihwb3AuZWxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dG9VcGRhdGUucHVzaCguLi5wb3AuY2hpbGRyZW4pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEhhbmRsZSBwYXJlbnRzIG9mIHRoZSBjaGVja2VkIGl0ZW1cblx0XHRsZXQgcGFyZW50ID0gdGhpcy5fdHJlZS5nZXRQYXJlbnRFbGVtZW50KGl0ZW0pO1xuXHRcdHdoaWxlIChwYXJlbnQpIHtcblx0XHRcdGNvbnN0IHBhcmVudENoaWxkcmVuID0gWy4uLnRoaXMuX3RyZWUuZ2V0Tm9kZShwYXJlbnQpLmNoaWxkcmVuXTtcblx0XHRcdGNvbnN0IG5ld1N0YXRlID0gZ2V0UGFyZW50Tm9kZVN0YXRlKHBhcmVudENoaWxkcmVuKTtcblxuXHRcdFx0aWYgKChwYXJlbnQuY2hlY2tlZCA/PyBmYWxzZSkgIT09IG5ld1N0YXRlKSB7XG5cdFx0XHRcdHBhcmVudC5jaGVja2VkID0gbmV3U3RhdGU7XG5cdFx0XHRcdHRoaXMuX3RyZWUucmVyZW5kZXIocGFyZW50KTtcblx0XHRcdH1cblx0XHRcdHBhcmVudCA9IHRoaXMuX3RyZWUuZ2V0UGFyZW50RWxlbWVudChwYXJlbnQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ2hlY2tib3hTdGF0ZS5maXJlKHtcblx0XHRcdGl0ZW0sXG5cdFx0XHRjaGVja2VkOiBpdGVtLmNoZWNrZWQgPz8gZmFsc2Vcblx0XHR9KTtcblx0XHR0aGlzLl9vbkRpZENoZWNrZWRMZWFmSXRlbXNDaGFuZ2UuZmlyZSh0aGlzLmdldENoZWNrZWRMZWFmSXRlbXMoKSk7XG5cdH1cblxuXHRyZWdpc3Rlck9uRGlkQ2hhbmdlRm9jdXMoKSB7XG5cdFx0Ly8gRW5zdXJlIHRoYXQgc2VsZWN0aW9uIGZvbGxvd3MgZm9jdXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90cmVlLm9uRGlkQ2hhbmdlRm9jdXMoZSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtID0gdGhpcy5fdHJlZS5nZXRGb2N1cygpLmZpbmRMYXN0KGl0ZW0gPT4gaXRlbSAhPT0gbnVsbCk7XG5cdFx0XHR0aGlzLl90cmVlLnNldFNlbGVjdGlvbihpdGVtID8gW2l0ZW1dIDogW10sIGUuYnJvd3NlckV2ZW50KTtcblx0XHR9KSk7XG5cdH1cblxuXHRnZXRDaGVja2VkTGVhZkl0ZW1zKCkge1xuXHRcdGNvbnN0IGxvb2tlZEF0ID0gbmV3IFNldDxJUXVpY2tUcmVlSXRlbT4oKTtcblx0XHRjb25zdCB0b0xvb2tBdCA9IFsuLi50aGlzLl90cmVlLmdldE5vZGUoKS5jaGlsZHJlbl07XG5cdFx0Y29uc3QgY2hlY2tlZEl0ZW1zID0gbmV3IEFycmF5PElRdWlja1RyZWVJdGVtPigpO1xuXHRcdHdoaWxlICh0b0xvb2tBdC5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGxvb2tBdCA9IHRvTG9va0F0LnNoaWZ0KCk7XG5cdFx0XHRpZiAoIWxvb2tBdD8uZWxlbWVudCB8fCBsb29rZWRBdC5oYXMobG9va0F0LmVsZW1lbnQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGxvb2tBdC5lbGVtZW50LmNoZWNrZWQpIHtcblx0XHRcdFx0bG9va2VkQXQuYWRkKGxvb2tBdC5lbGVtZW50KTtcblx0XHRcdFx0dG9Mb29rQXQucHVzaCguLi5sb29rQXQuY2hpbGRyZW4pO1xuXHRcdFx0XHRpZiAoIWxvb2tBdC5lbGVtZW50LmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0Y2hlY2tlZEl0ZW1zLnB1c2gobG9va0F0LmVsZW1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjaGVja2VkSXRlbXM7XG5cdH1cblxuXHRnZXRBY3RpdmVJdGVtcygpOiByZWFkb25seSBJUXVpY2tUcmVlSXRlbVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fdHJlZS5nZXRGb2N1cygpLmZpbHRlcigoaXRlbSk6IGl0ZW0gaXMgSVF1aWNrVHJlZUl0ZW0gPT4gaXRlbSAhPT0gbnVsbCk7XG5cdH1cblxuXHR0b2dnbGVDaGVja2JveCgpIHtcblx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgdGhpcy5nZXRBY3RpdmVJdGVtcygpKSB7XG5cdFx0XHRpZiAoZWxlbWVudC5waWNrYWJsZSAhPT0gZmFsc2UgJiYgIWVsZW1lbnQuZGlzYWJsZWQpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVDaGVja2JveFN0YXRlKGVsZW1lbnQsICEoZWxlbWVudC5jaGVja2VkID09PSB0cnVlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Y2hlY2tBbGwoY2hlY2tlZDogYm9vbGVhbiB8ICdtaXhlZCcpIHtcblx0XHRjb25zdCB1cGRhdGVkID0gbmV3IFNldDxJUXVpY2tUcmVlSXRlbT4oKTtcblx0XHRjb25zdCB0b1VwZGF0ZSA9IFsuLi50aGlzLl90cmVlLmdldE5vZGUoKS5jaGlsZHJlbl07XG5cdFx0bGV0IGZpcmVDaGVja2VkQ2hhbmdlRXZlbnQgPSBmYWxzZTtcblx0XHR3aGlsZSAodG9VcGRhdGUubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCB1cGRhdGUgPSB0b1VwZGF0ZS5zaGlmdCgpO1xuXHRcdFx0aWYgKCF1cGRhdGU/LmVsZW1lbnQgfHwgdXBkYXRlZC5oYXModXBkYXRlLmVsZW1lbnQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHVwZGF0ZS5lbGVtZW50LmNoZWNrZWQgIT09IGNoZWNrZWQpIHtcblx0XHRcdFx0ZmlyZUNoZWNrZWRDaGFuZ2VFdmVudCA9IHRydWU7XG5cdFx0XHRcdHVwZGF0ZS5lbGVtZW50LmNoZWNrZWQgPSBjaGVja2VkO1xuXHRcdFx0XHR0b1VwZGF0ZS5wdXNoKC4uLnVwZGF0ZS5jaGlsZHJlbik7XG5cdFx0XHRcdHVwZGF0ZWQuYWRkKHVwZGF0ZS5lbGVtZW50KTtcblx0XHRcdFx0dGhpcy5fdHJlZS5yZXJlbmRlcih1cGRhdGUuZWxlbWVudCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ2hlY2tib3hTdGF0ZS5maXJlKHtcblx0XHRcdFx0XHRpdGVtOiB1cGRhdGUuZWxlbWVudCxcblx0XHRcdFx0XHRjaGVja2VkOiB1cGRhdGUuZWxlbWVudC5jaGVja2VkXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoZmlyZUNoZWNrZWRDaGFuZ2VFdmVudCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGVja2VkTGVhZkl0ZW1zQ2hhbmdlLmZpcmUodGhpcy5nZXRDaGVja2VkTGVhZkl0ZW1zKCkpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1h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
