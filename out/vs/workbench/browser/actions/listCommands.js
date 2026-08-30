import { KeyMod, KeyCode, KeyChord } from "../../../base/common/keyCodes.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../platform/keybinding/common/keybindingsRegistry.js";
import { List } from "../../../base/browser/ui/list/listWidget.js";
import { WorkbenchListFocusContextKey, IListService, WorkbenchListSupportsMultiSelectContextKey, WorkbenchListHasSelectionOrFocus, getSelectionKeyboardEvent, WorkbenchListSelectionNavigation, WorkbenchTreeElementCanCollapse, WorkbenchTreeElementHasParent, WorkbenchTreeElementHasChild, WorkbenchTreeElementCanExpand, RawWorkbenchListFocusContextKey, WorkbenchTreeFindOpen, WorkbenchListSupportsFind, WorkbenchListScrollAtBottomContextKey, WorkbenchListScrollAtTopContextKey, WorkbenchTreeStickyScrollFocused } from "../../../platform/list/browser/listService.js";
import { PagedList } from "../../../base/browser/ui/list/listPaging.js";
import { equals, range } from "../../../base/common/arrays.js";
import { ContextKeyExpr } from "../../../platform/contextkey/common/contextkey.js";
import { ObjectTree } from "../../../base/browser/ui/tree/objectTree.js";
import { AsyncDataTree } from "../../../base/browser/ui/tree/asyncDataTree.js";
import { DataTree } from "../../../base/browser/ui/tree/dataTree.js";
import { CommandsRegistry } from "../../../platform/commands/common/commands.js";
import { Table } from "../../../base/browser/ui/table/tableWidget.js";
import { AbstractTree, TreeFindMatchType, TreeFindMode } from "../../../base/browser/ui/tree/abstractTree.js";
import { isActiveElement } from "../../../base/browser/dom.js";
import { Action2, registerAction2 } from "../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { localize, localize2 } from "../../../nls.js";
import { IHoverService } from "../../../platform/hover/browser/hover.js";
function ensureDOMFocus(widget) {
  const element = widget?.getHTMLElement();
  if (element && !isActiveElement(element)) {
    widget?.domFocus();
  }
}
async function updateFocus(widget, updateFocusFn) {
  if (!WorkbenchListSelectionNavigation.getValue(widget.contextKeyService)) {
    return updateFocusFn(widget);
  }
  const focus = widget.getFocus();
  const selection = widget.getSelection();
  await updateFocusFn(widget);
  const newFocus = widget.getFocus();
  if (selection.length > 1 || !equals(focus, selection) || equals(focus, newFocus)) {
    return;
  }
  const fakeKeyboardEvent = new KeyboardEvent("keydown");
  widget.setSelection(newFocus, fakeKeyboardEvent);
}
async function navigate(widget, updateFocusFn) {
  if (!widget) {
    return;
  }
  await updateFocus(widget, updateFocusFn);
  const listFocus = widget.getFocus();
  if (listFocus.length) {
    widget.reveal(listFocus[0]);
  }
  widget.setAnchor(listFocus[0]);
  ensureDOMFocus(widget);
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.focusDown",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyCode.DownArrow,
  mac: {
    primary: KeyCode.DownArrow,
    secondary: [KeyMod.WinCtrl | KeyCode.KeyN]
  },
  handler: (accessor, arg2) => {
    navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
      const fakeKeyboardEvent = new KeyboardEvent("keydown");
      await widget.focusNext(typeof arg2 === "number" ? arg2 : 1, false, fakeKeyboardEvent);
    });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.focusUp",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyCode.UpArrow,
  mac: {
    primary: KeyCode.UpArrow,
    secondary: [KeyMod.WinCtrl | KeyCode.KeyP]
  },
  handler: (accessor, arg2) => {
    navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
      const fakeKeyboardEvent = new KeyboardEvent("keydown");
      await widget.focusPrevious(typeof arg2 === "number" ? arg2 : 1, false, fakeKeyboardEvent);
    });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.focusAnyDown",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyMod.Alt | KeyCode.DownArrow,
  mac: {
    primary: KeyMod.Alt | KeyCode.DownArrow,
    secondary: [KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KeyN]
  },
  handler: (accessor, arg2) => {
    navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
      const fakeKeyboardEvent = new KeyboardEvent("keydown", { altKey: true });
      await widget.focusNext(typeof arg2 === "number" ? arg2 : 1, false, fakeKeyboardEvent);
    });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.focusAnyUp",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyMod.Alt | KeyCode.UpArrow,
  mac: {
    primary: KeyMod.Alt | KeyCode.UpArrow,
    secondary: [KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KeyP]
  },
  handler: (accessor, arg2) => {
    navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
      const fakeKeyboardEvent = new KeyboardEvent("keydown", { altKey: true });
      await widget.focusPrevious(typeof arg2 === "number" ? arg2 : 1, false, fakeKeyboardEvent);
    });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.focusPageDown",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyCode.PageDown,
  handler: (accessor) => {
    navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
      const fakeKeyboardEvent = new KeyboardEvent("keydown");
      await widget.focusNextPage(fakeKeyboardEvent);
    });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.focusPageUp",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyCode.PageUp,
  handler: (accessor) => {
    navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
      const fakeKeyboardEvent = new KeyboardEvent("keydown");
      await widget.focusPreviousPage(fakeKeyboardEvent);
    });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.focusFirst",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyCode.Home,
  handler: (accessor) => {
    navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
      const fakeKeyboardEvent = new KeyboardEvent("keydown");
      await widget.focusFirst(fakeKeyboardEvent);
    });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.focusLast",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyCode.End,
  handler: (accessor) => {
    navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
      const fakeKeyboardEvent = new KeyboardEvent("keydown");
      await widget.focusLast(fakeKeyboardEvent);
    });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.focusAnyFirst",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyMod.Alt | KeyCode.Home,
  handler: (accessor) => {
    navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
      const fakeKeyboardEvent = new KeyboardEvent("keydown", { altKey: true });
      await widget.focusFirst(fakeKeyboardEvent);
    });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.focusAnyLast",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyMod.Alt | KeyCode.End,
  handler: (accessor) => {
    navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
      const fakeKeyboardEvent = new KeyboardEvent("keydown", { altKey: true });
      await widget.focusLast(fakeKeyboardEvent);
    });
  }
});
function expandMultiSelection(focused, previousFocus) {
  if (focused instanceof List || focused instanceof PagedList || focused instanceof Table) {
    const list = focused;
    const focus = list.getFocus() ? list.getFocus()[0] : void 0;
    const selection = list.getSelection();
    if (selection && typeof focus === "number" && selection.indexOf(focus) >= 0) {
      list.setSelection(selection.filter((s) => s !== previousFocus));
    } else {
      if (typeof focus === "number") {
        list.setSelection(selection.concat(focus));
      }
    }
  } else if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
    const list = focused;
    const focus = list.getFocus() ? list.getFocus()[0] : void 0;
    if (previousFocus === focus) {
      return;
    }
    const selection = list.getSelection();
    const fakeKeyboardEvent = new KeyboardEvent("keydown", { shiftKey: true });
    if (selection && selection.indexOf(focus) >= 0) {
      list.setSelection(selection.filter((s) => s !== previousFocus), fakeKeyboardEvent);
    } else {
      list.setSelection(selection.concat(focus), fakeKeyboardEvent);
    }
  }
}
function revealFocusedStickyScroll(tree, postRevealAction) {
  const focus = tree.getStickyScrollFocus();
  if (focus.length === 0) {
    throw new Error(`StickyScroll has no focus`);
  }
  if (focus.length > 1) {
    throw new Error(`StickyScroll can only have a single focused item`);
  }
  tree.reveal(focus[0]);
  tree.getHTMLElement().focus();
  tree.setFocus(focus);
  postRevealAction?.(focus[0]);
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.expandSelectionDown",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(WorkbenchListFocusContextKey, WorkbenchListSupportsMultiSelectContextKey),
  primary: KeyMod.Shift | KeyCode.DownArrow,
  handler: (accessor, arg2) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (!widget) {
      return;
    }
    const previousFocus = widget.getFocus() ? widget.getFocus()[0] : void 0;
    const fakeKeyboardEvent = new KeyboardEvent("keydown");
    widget.focusNext(typeof arg2 === "number" ? arg2 : 1, false, fakeKeyboardEvent);
    expandMultiSelection(widget, previousFocus);
    const focus = widget.getFocus();
    if (focus.length) {
      widget.reveal(focus[0]);
    }
    ensureDOMFocus(widget);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.expandSelectionUp",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(WorkbenchListFocusContextKey, WorkbenchListSupportsMultiSelectContextKey),
  primary: KeyMod.Shift | KeyCode.UpArrow,
  handler: (accessor, arg2) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (!widget) {
      return;
    }
    const previousFocus = widget.getFocus() ? widget.getFocus()[0] : void 0;
    const fakeKeyboardEvent = new KeyboardEvent("keydown");
    widget.focusPrevious(typeof arg2 === "number" ? arg2 : 1, false, fakeKeyboardEvent);
    expandMultiSelection(widget, previousFocus);
    const focus = widget.getFocus();
    if (focus.length) {
      widget.reveal(focus[0]);
    }
    ensureDOMFocus(widget);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.collapse",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(WorkbenchListFocusContextKey, ContextKeyExpr.or(WorkbenchTreeElementCanCollapse, WorkbenchTreeElementHasParent)),
  primary: KeyCode.LeftArrow,
  mac: {
    primary: KeyCode.LeftArrow,
    secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow]
  },
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (!widget || !(widget instanceof ObjectTree || widget instanceof DataTree || widget instanceof AsyncDataTree)) {
      return;
    }
    const tree = widget;
    const focusedElements = tree.getFocus();
    if (focusedElements.length === 0) {
      return;
    }
    const focus = focusedElements[0];
    if (!tree.collapse(focus)) {
      const parent = tree.getParentElement(focus);
      if (parent) {
        navigate(widget, (widget2) => {
          const fakeKeyboardEvent = new KeyboardEvent("keydown");
          widget2.setFocus([parent], fakeKeyboardEvent);
        });
      }
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.stickyScroll.collapse",
  weight: KeybindingWeight.WorkbenchContrib + 50,
  when: WorkbenchTreeStickyScrollFocused,
  primary: KeyCode.LeftArrow,
  mac: {
    primary: KeyCode.LeftArrow,
    secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow]
  },
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (!widget || !(widget instanceof ObjectTree || widget instanceof DataTree || widget instanceof AsyncDataTree)) {
      return;
    }
    revealFocusedStickyScroll(widget, (focus) => widget.collapse(focus));
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.collapseAll",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyMod.CtrlCmd | KeyCode.LeftArrow,
  mac: {
    primary: KeyMod.CtrlCmd | KeyCode.LeftArrow,
    secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow]
  },
  handler: (accessor) => {
    const focused = accessor.get(IListService).lastFocusedList;
    if (focused && !(focused instanceof List || focused instanceof PagedList || focused instanceof Table)) {
      focused.collapseAll();
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.collapseAllToFocus",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  handler: (accessor) => {
    const focused = accessor.get(IListService).lastFocusedList;
    const fakeKeyboardEvent = getSelectionKeyboardEvent("keydown", true);
    if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
      const tree = focused;
      const focus = tree.getFocus();
      if (focus.length > 0) {
        tree.collapse(focus[0], true);
      }
      tree.setSelection(focus, fakeKeyboardEvent);
      tree.setAnchor(focus[0]);
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.focusParent",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (!widget || !(widget instanceof ObjectTree || widget instanceof DataTree || widget instanceof AsyncDataTree)) {
      return;
    }
    const tree = widget;
    const focusedElements = tree.getFocus();
    if (focusedElements.length === 0) {
      return;
    }
    const focus = focusedElements[0];
    const parent = tree.getParentElement(focus);
    if (parent) {
      navigate(widget, (widget2) => {
        const fakeKeyboardEvent = new KeyboardEvent("keydown");
        widget2.setFocus([parent], fakeKeyboardEvent);
      });
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.expand",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(WorkbenchListFocusContextKey, ContextKeyExpr.or(WorkbenchTreeElementCanExpand, WorkbenchTreeElementHasChild)),
  primary: KeyCode.RightArrow,
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (!widget) {
      return;
    }
    if (widget instanceof ObjectTree || widget instanceof DataTree) {
      const focusedElements = widget.getFocus();
      if (focusedElements.length === 0) {
        return;
      }
      const focus = focusedElements[0];
      if (!widget.expand(focus)) {
        const child = widget.getFirstElementChild(focus);
        if (child) {
          const node = widget.getNode(child);
          if (node.visible) {
            navigate(widget, (widget2) => {
              const fakeKeyboardEvent = new KeyboardEvent("keydown");
              widget2.setFocus([child], fakeKeyboardEvent);
            });
          }
        }
      }
    } else if (widget instanceof AsyncDataTree) {
      const focusedElements = widget.getFocus();
      if (focusedElements.length === 0) {
        return;
      }
      const focus = focusedElements[0];
      widget.expand(focus).then((didExpand) => {
        if (focus && !didExpand) {
          const child = widget.getFirstElementChild(focus);
          if (child) {
            const node = widget.getNode(child);
            if (node.visible) {
              navigate(widget, (widget2) => {
                const fakeKeyboardEvent = new KeyboardEvent("keydown");
                widget2.setFocus([child], fakeKeyboardEvent);
              });
            }
          }
        }
      });
    }
  }
});
function selectElement(accessor, retainCurrentFocus) {
  const focused = accessor.get(IListService).lastFocusedList;
  const fakeKeyboardEvent = getSelectionKeyboardEvent("keydown", retainCurrentFocus);
  if (focused instanceof List || focused instanceof PagedList || focused instanceof Table) {
    const list = focused;
    list.setAnchor(list.getFocus()[0]);
    list.setSelection(list.getFocus(), fakeKeyboardEvent);
  } else if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
    const tree = focused;
    const focus = tree.getFocus();
    if (focus.length > 0) {
      let toggleCollapsed = true;
      if (tree.expandOnlyOnTwistieClick === true) {
        toggleCollapsed = false;
      } else if (typeof tree.expandOnlyOnTwistieClick !== "boolean" && tree.expandOnlyOnTwistieClick(focus[0])) {
        toggleCollapsed = false;
      }
      if (toggleCollapsed) {
        tree.toggleCollapsed(focus[0]);
      }
    }
    tree.setAnchor(focus[0]);
    tree.setSelection(focus, fakeKeyboardEvent);
  }
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.select",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyCode.Enter,
  mac: {
    primary: KeyCode.Enter,
    secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow]
  },
  handler: (accessor) => {
    selectElement(accessor, false);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.stickyScrollselect",
  weight: KeybindingWeight.WorkbenchContrib + 50,
  // priorities over file explorer
  when: WorkbenchTreeStickyScrollFocused,
  primary: KeyCode.Enter,
  mac: {
    primary: KeyCode.Enter,
    secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow]
  },
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (!widget || !(widget instanceof ObjectTree || widget instanceof DataTree || widget instanceof AsyncDataTree)) {
      return;
    }
    revealFocusedStickyScroll(widget, (focus) => widget.setSelection([focus]));
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.selectAndPreserveFocus",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  handler: (accessor) => {
    selectElement(accessor, true);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.selectAll",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(WorkbenchListFocusContextKey, WorkbenchListSupportsMultiSelectContextKey),
  primary: KeyMod.CtrlCmd | KeyCode.KeyA,
  handler: (accessor) => {
    const focused = accessor.get(IListService).lastFocusedList;
    if (focused instanceof List || focused instanceof PagedList || focused instanceof Table) {
      const list = focused;
      const fakeKeyboardEvent = new KeyboardEvent("keydown");
      list.setSelection(range(list.length), fakeKeyboardEvent);
    } else if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
      const tree = focused;
      const focus = tree.getFocus();
      const selection = tree.getSelection();
      let start = void 0;
      if (focus.length > 0 && (selection.length === 0 || !selection.includes(focus[0]))) {
        start = focus[0];
      }
      if (!start && selection.length > 0) {
        start = selection[0];
      }
      let scope = void 0;
      if (!start) {
        scope = void 0;
      } else {
        scope = tree.getParentElement(start);
      }
      const newSelection = [];
      const visit = (node) => {
        for (const child of node.children) {
          if (child.visible) {
            newSelection.push(child.element);
            if (!child.collapsed) {
              visit(child);
            }
          }
        }
      };
      visit(tree.getNode(scope));
      if (scope && selection.length === newSelection.length) {
        newSelection.unshift(scope);
      }
      const fakeKeyboardEvent = new KeyboardEvent("keydown");
      tree.setSelection(newSelection, fakeKeyboardEvent);
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.toggleSelection",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter,
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (!widget) {
      return;
    }
    const focus = widget.getFocus();
    if (focus.length === 0) {
      return;
    }
    const selection = widget.getSelection();
    const index = selection.indexOf(focus[0]);
    if (index > -1) {
      widget.setSelection([...selection.slice(0, index), ...selection.slice(index + 1)]);
    } else {
      widget.setSelection([...selection, focus[0]]);
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.showHover",
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyI),
  when: WorkbenchListFocusContextKey,
  handler: async (accessor) => {
    const listService = accessor.get(IListService);
    const lastFocusedList = listService.lastFocusedList;
    if (!lastFocusedList) {
      return;
    }
    const focus = lastFocusedList.getFocus();
    if (!focus || focus.length === 0) {
      return;
    }
    const treeDOM = lastFocusedList.getHTMLElement();
    const scrollableElement = treeDOM.querySelector(".monaco-scrollable-element");
    const listRows = scrollableElement?.querySelector(".monaco-list-rows");
    const focusedElement = listRows?.querySelector(".focused");
    if (!focusedElement) {
      return;
    }
    const elementWithHover = getCustomHoverForElement(focusedElement);
    if (elementWithHover) {
      accessor.get(IHoverService).showManagedHover(elementWithHover);
    }
  }
});
function getCustomHoverForElement(element) {
  if (element.matches('[custom-hover="true"]')) {
    return element;
  }
  const noneFocusableElementWithHover = element.querySelector('[custom-hover="true"]:not([tabindex]):not(.action-item)');
  if (noneFocusableElementWithHover) {
    return noneFocusableElementWithHover;
  }
  return void 0;
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.toggleExpand",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyCode.Space,
  handler: (accessor) => {
    const focused = accessor.get(IListService).lastFocusedList;
    if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
      const tree = focused;
      const focus = tree.getFocus();
      if (!tree.options.disableExpandOnSpacebar && focus.length > 0 && tree.isCollapsible(focus[0])) {
        tree.toggleCollapsed(focus[0]);
        return;
      }
    }
    selectElement(accessor, true);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.stickyScrolltoggleExpand",
  weight: KeybindingWeight.WorkbenchContrib + 50,
  // priorities over file explorer
  when: WorkbenchTreeStickyScrollFocused,
  primary: KeyCode.Space,
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (!widget || !(widget instanceof ObjectTree || widget instanceof DataTree || widget instanceof AsyncDataTree)) {
      return;
    }
    revealFocusedStickyScroll(widget);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.clear",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(WorkbenchListFocusContextKey, WorkbenchListHasSelectionOrFocus),
  primary: KeyCode.Escape,
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (!widget) {
      return;
    }
    const selection = widget.getSelection();
    const fakeKeyboardEvent = new KeyboardEvent("keydown");
    if (selection.length > 1) {
      const useSelectionNavigation = WorkbenchListSelectionNavigation.getValue(widget.contextKeyService);
      if (useSelectionNavigation) {
        const focus = widget.getFocus();
        widget.setSelection([focus[0]], fakeKeyboardEvent);
      } else {
        widget.setSelection([], fakeKeyboardEvent);
      }
    } else {
      widget.setSelection([], fakeKeyboardEvent);
      widget.setFocus([], fakeKeyboardEvent);
    }
    widget.setAnchor(void 0);
  }
});
CommandsRegistry.registerCommand({
  id: "list.triggerTypeNavigation",
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    widget?.triggerTypeNavigation();
  }
});
CommandsRegistry.registerCommand({
  id: "list.toggleFindMode",
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (widget instanceof AbstractTree || widget instanceof AsyncDataTree) {
      const tree = widget;
      tree.findMode = tree.findMode === TreeFindMode.Filter ? TreeFindMode.Highlight : TreeFindMode.Filter;
    }
  }
});
CommandsRegistry.registerCommand({
  id: "list.toggleFindMatchType",
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (widget instanceof AbstractTree || widget instanceof AsyncDataTree) {
      const tree = widget;
      tree.findMatchType = tree.findMatchType === TreeFindMatchType.Contiguous ? TreeFindMatchType.Fuzzy : TreeFindMatchType.Contiguous;
    }
  }
});
CommandsRegistry.registerCommandAlias("list.toggleKeyboardNavigation", "list.triggerTypeNavigation");
CommandsRegistry.registerCommandAlias("list.toggleFilterOnType", "list.toggleFindMode");
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.find",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(RawWorkbenchListFocusContextKey, WorkbenchListSupportsFind),
  primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyF,
  secondary: [KeyCode.F3],
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (widget instanceof List || widget instanceof PagedList || widget instanceof Table) {
    } else if (widget instanceof AbstractTree || widget instanceof AsyncDataTree) {
      const tree = widget;
      tree.openFind();
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.closeFind",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(RawWorkbenchListFocusContextKey, WorkbenchTreeFindOpen),
  primary: KeyCode.Escape,
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (widget instanceof AbstractTree || widget instanceof AsyncDataTree) {
      const tree = widget;
      tree.closeFind();
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.scrollUp",
  weight: KeybindingWeight.WorkbenchContrib,
  // Since the default keybindings for list.scrollUp and widgetNavigation.focusPrevious
  // are both Ctrl+UpArrow, we disable this command when the scrollbar is at
  // top-most position. This will give chance for widgetNavigation.focusPrevious to execute
  when: ContextKeyExpr.and(
    WorkbenchListFocusContextKey,
    WorkbenchListScrollAtTopContextKey?.negate()
  ),
  primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
  handler: (accessor) => {
    const focused = accessor.get(IListService).lastFocusedList;
    if (!focused) {
      return;
    }
    focused.scrollTop -= 10;
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.scrollDown",
  weight: KeybindingWeight.WorkbenchContrib,
  // same as above
  when: ContextKeyExpr.and(
    WorkbenchListFocusContextKey,
    WorkbenchListScrollAtBottomContextKey?.negate()
  ),
  primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
  handler: (accessor) => {
    const focused = accessor.get(IListService).lastFocusedList;
    if (!focused) {
      return;
    }
    focused.scrollTop += 10;
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.scrollLeft",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  handler: (accessor) => {
    const focused = accessor.get(IListService).lastFocusedList;
    if (!focused) {
      return;
    }
    focused.scrollLeft -= 10;
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.scrollRight",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  handler: (accessor) => {
    const focused = accessor.get(IListService).lastFocusedList;
    if (!focused) {
      return;
    }
    focused.scrollLeft += 10;
  }
});
registerAction2(class ToggleStickyScroll extends Action2 {
  constructor() {
    super({
      id: "tree.toggleStickyScroll",
      title: {
        ...localize2("toggleTreeStickyScroll", "Toggle Tree Sticky Scroll"),
        mnemonicTitle: localize({ key: "mitoggleTreeStickyScroll", comment: ["&& denotes a mnemonic"] }, "&&Toggle Tree Sticky Scroll")
      },
      category: "View",
      metadata: { description: localize("toggleTreeStickyScrollDescription", "Toggles Sticky Scroll widget at the top of tree structures such as the File Explorer and Debug variables View.") },
      f1: true
    });
  }
  run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    const newValue = !configurationService.getValue("workbench.tree.enableStickyScroll");
    configurationService.updateValue("workbench.tree.enableStickyScroll", newValue);
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXGFjdGlvbnNcXGxpc3RDb21tYW5kcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEtleU1vZCwgS2V5Q29kZSwgS2V5Q2hvcmQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc1JlZ2lzdHJ5LCBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBMaXN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LCBJTGlzdFNlcnZpY2UsIFdvcmtiZW5jaExpc3RTdXBwb3J0c011bHRpU2VsZWN0Q29udGV4dEtleSwgTGlzdFdpZGdldCwgV29ya2JlbmNoTGlzdEhhc1NlbGVjdGlvbk9yRm9jdXMsIGdldFNlbGVjdGlvbktleWJvYXJkRXZlbnQsIFdvcmtiZW5jaExpc3RXaWRnZXQsIFdvcmtiZW5jaExpc3RTZWxlY3Rpb25OYXZpZ2F0aW9uLCBXb3JrYmVuY2hUcmVlRWxlbWVudENhbkNvbGxhcHNlLCBXb3JrYmVuY2hUcmVlRWxlbWVudEhhc1BhcmVudCwgV29ya2JlbmNoVHJlZUVsZW1lbnRIYXNDaGlsZCwgV29ya2JlbmNoVHJlZUVsZW1lbnRDYW5FeHBhbmQsIFJhd1dvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXksIFdvcmtiZW5jaFRyZWVGaW5kT3BlbiwgV29ya2JlbmNoTGlzdFN1cHBvcnRzRmluZCwgV29ya2JlbmNoTGlzdFNjcm9sbEF0Qm90dG9tQ29udGV4dEtleSwgV29ya2JlbmNoTGlzdFNjcm9sbEF0VG9wQ29udGV4dEtleSwgV29ya2JlbmNoVHJlZVN0aWNreVNjcm9sbEZvY3VzZWQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUGFnZWRMaXN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFBhZ2luZy5qcyc7XG5pbXBvcnQgeyBlcXVhbHMsIHJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBPYmplY3RUcmVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvb2JqZWN0VHJlZS5qcyc7XG5pbXBvcnQgeyBBc3luY0RhdGFUcmVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvYXN5bmNEYXRhVHJlZS5qcyc7XG5pbXBvcnQgeyBEYXRhVHJlZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL2RhdGFUcmVlLmpzJztcbmltcG9ydCB7IElUcmVlTm9kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBUYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90YWJsZS90YWJsZVdpZGdldC5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdFRyZWUsIFRyZWVGaW5kTWF0Y2hUeXBlLCBUcmVlRmluZE1vZGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9hYnN0cmFjdFRyZWUuanMnO1xuaW1wb3J0IHsgaXNBY3RpdmVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5cbmZ1bmN0aW9uIGVuc3VyZURPTUZvY3VzKHdpZGdldDogTGlzdFdpZGdldCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHQvLyBpdCBjYW4gaGFwcGVuIHRoYXQgb25lIG9mIHRoZSBjb21tYW5kcyBpcyBleGVjdXRlZCB3aGlsZVxuXHQvLyBET00gZm9jdXMgaXMgd2l0aGluIGFub3RoZXIgZm9jdXNhYmxlIGNvbnRyb2wgd2l0aGluIHRoZVxuXHQvLyBsaXN0L3RyZWUgaXRlbS4gdGhlcmVmb3Igd2Ugc2hvdWxkIGVuc3VyZSB0aGF0IHRoZVxuXHQvLyBsaXN0L3RyZWUgaGFzIERPTSBmb2N1cyBhZ2FpbiBhZnRlciB0aGUgY29tbWFuZCByYW4uXG5cdGNvbnN0IGVsZW1lbnQgPSB3aWRnZXQ/LmdldEhUTUxFbGVtZW50KCk7XG5cdGlmIChlbGVtZW50ICYmICFpc0FjdGl2ZUVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHR3aWRnZXQ/LmRvbUZvY3VzKCk7XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gdXBkYXRlRm9jdXMod2lkZ2V0OiBXb3JrYmVuY2hMaXN0V2lkZ2V0LCB1cGRhdGVGb2N1c0ZuOiAod2lkZ2V0OiBXb3JrYmVuY2hMaXN0V2lkZ2V0KSA9PiB2b2lkIHwgUHJvbWlzZTx2b2lkPik6IFByb21pc2U8dm9pZD4ge1xuXHRpZiAoIVdvcmtiZW5jaExpc3RTZWxlY3Rpb25OYXZpZ2F0aW9uLmdldFZhbHVlKHdpZGdldC5jb250ZXh0S2V5U2VydmljZSkpIHtcblx0XHRyZXR1cm4gdXBkYXRlRm9jdXNGbih3aWRnZXQpO1xuXHR9XG5cblx0Y29uc3QgZm9jdXMgPSB3aWRnZXQuZ2V0Rm9jdXMoKTtcblx0Y29uc3Qgc2VsZWN0aW9uID0gd2lkZ2V0LmdldFNlbGVjdGlvbigpO1xuXG5cdGF3YWl0IHVwZGF0ZUZvY3VzRm4od2lkZ2V0KTtcblxuXHRjb25zdCBuZXdGb2N1cyA9IHdpZGdldC5nZXRGb2N1cygpO1xuXG5cdGlmIChzZWxlY3Rpb24ubGVuZ3RoID4gMSB8fCAhZXF1YWxzKGZvY3VzLCBzZWxlY3Rpb24pIHx8IGVxdWFscyhmb2N1cywgbmV3Rm9jdXMpKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgZmFrZUtleWJvYXJkRXZlbnQgPSBuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicpO1xuXHR3aWRnZXQuc2V0U2VsZWN0aW9uKG5ld0ZvY3VzLCBmYWtlS2V5Ym9hcmRFdmVudCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIG5hdmlnYXRlKHdpZGdldDogV29ya2JlbmNoTGlzdFdpZGdldCB8IHVuZGVmaW5lZCwgdXBkYXRlRm9jdXNGbjogKHdpZGdldDogV29ya2JlbmNoTGlzdFdpZGdldCkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD4pOiBQcm9taXNlPHZvaWQ+IHtcblx0aWYgKCF3aWRnZXQpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRhd2FpdCB1cGRhdGVGb2N1cyh3aWRnZXQsIHVwZGF0ZUZvY3VzRm4pO1xuXG5cdGNvbnN0IGxpc3RGb2N1cyA9IHdpZGdldC5nZXRGb2N1cygpO1xuXG5cdGlmIChsaXN0Rm9jdXMubGVuZ3RoKSB7XG5cdFx0d2lkZ2V0LnJldmVhbChsaXN0Rm9jdXNbMF0pO1xuXHR9XG5cblx0d2lkZ2V0LnNldEFuY2hvcihsaXN0Rm9jdXNbMF0pO1xuXHRlbnN1cmVET01Gb2N1cyh3aWRnZXQpO1xufVxuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdsaXN0LmZvY3VzRG93bicsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LFxuXHRwcmltYXJ5OiBLZXlDb2RlLkRvd25BcnJvdyxcblx0bWFjOiB7XG5cdFx0cHJpbWFyeTogS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLktleU5dXG5cdH0sXG5cdGhhbmRsZXI6IChhY2Nlc3NvciwgYXJnMikgPT4ge1xuXHRcdG5hdmlnYXRlKGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdCwgYXN5bmMgd2lkZ2V0ID0+IHtcblx0XHRcdGNvbnN0IGZha2VLZXlib2FyZEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nKTtcblx0XHRcdGF3YWl0IHdpZGdldC5mb2N1c05leHQodHlwZW9mIGFyZzIgPT09ICdudW1iZXInID8gYXJnMiA6IDEsIGZhbHNlLCBmYWtlS2V5Ym9hcmRFdmVudCk7XG5cdFx0fSk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdsaXN0LmZvY3VzVXAnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSxcblx0cHJpbWFyeTogS2V5Q29kZS5VcEFycm93LFxuXHRtYWM6IHtcblx0XHRwcmltYXJ5OiBLZXlDb2RlLlVwQXJyb3csXG5cdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLktleVBdXG5cdH0sXG5cdGhhbmRsZXI6IChhY2Nlc3NvciwgYXJnMikgPT4ge1xuXHRcdG5hdmlnYXRlKGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdCwgYXN5bmMgd2lkZ2V0ID0+IHtcblx0XHRcdGNvbnN0IGZha2VLZXlib2FyZEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nKTtcblx0XHRcdGF3YWl0IHdpZGdldC5mb2N1c1ByZXZpb3VzKHR5cGVvZiBhcmcyID09PSAnbnVtYmVyJyA/IGFyZzIgOiAxLCBmYWxzZSwgZmFrZUtleWJvYXJkRXZlbnQpO1xuXHRcdH0pO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC5mb2N1c0FueURvd24nLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSxcblx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuRG93bkFycm93LFxuXHRtYWM6IHtcblx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLldpbkN0cmwgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlOXVxuXHR9LFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IsIGFyZzIpID0+IHtcblx0XHRuYXZpZ2F0ZShhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3QsIGFzeW5jIHdpZGdldCA9PiB7XG5cdFx0XHRjb25zdCBmYWtlS2V5Ym9hcmRFdmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBhbHRLZXk6IHRydWUgfSk7XG5cdFx0XHRhd2FpdCB3aWRnZXQuZm9jdXNOZXh0KHR5cGVvZiBhcmcyID09PSAnbnVtYmVyJyA/IGFyZzIgOiAxLCBmYWxzZSwgZmFrZUtleWJvYXJkRXZlbnQpO1xuXHRcdH0pO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC5mb2N1c0FueVVwJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXksXG5cdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLlVwQXJyb3csXG5cdG1hYzoge1xuXHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLlVwQXJyb3csXG5cdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLldpbkN0cmwgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlQXVxuXHR9LFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IsIGFyZzIpID0+IHtcblx0XHRuYXZpZ2F0ZShhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3QsIGFzeW5jIHdpZGdldCA9PiB7XG5cdFx0XHRjb25zdCBmYWtlS2V5Ym9hcmRFdmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBhbHRLZXk6IHRydWUgfSk7XG5cdFx0XHRhd2FpdCB3aWRnZXQuZm9jdXNQcmV2aW91cyh0eXBlb2YgYXJnMiA9PT0gJ251bWJlcicgPyBhcmcyIDogMSwgZmFsc2UsIGZha2VLZXlib2FyZEV2ZW50KTtcblx0XHR9KTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3QuZm9jdXNQYWdlRG93bicsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LFxuXHRwcmltYXJ5OiBLZXlDb2RlLlBhZ2VEb3duLFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRuYXZpZ2F0ZShhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3QsIGFzeW5jIHdpZGdldCA9PiB7XG5cdFx0XHRjb25zdCBmYWtlS2V5Ym9hcmRFdmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJyk7XG5cdFx0XHRhd2FpdCB3aWRnZXQuZm9jdXNOZXh0UGFnZShmYWtlS2V5Ym9hcmRFdmVudCk7XG5cdFx0fSk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdsaXN0LmZvY3VzUGFnZVVwJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXksXG5cdHByaW1hcnk6IEtleUNvZGUuUGFnZVVwLFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRuYXZpZ2F0ZShhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3QsIGFzeW5jIHdpZGdldCA9PiB7XG5cdFx0XHRjb25zdCBmYWtlS2V5Ym9hcmRFdmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJyk7XG5cdFx0XHRhd2FpdCB3aWRnZXQuZm9jdXNQcmV2aW91c1BhZ2UoZmFrZUtleWJvYXJkRXZlbnQpO1xuXHRcdH0pO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC5mb2N1c0ZpcnN0Jyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXksXG5cdHByaW1hcnk6IEtleUNvZGUuSG9tZSxcblx0aGFuZGxlcjogKGFjY2Vzc29yKSA9PiB7XG5cdFx0bmF2aWdhdGUoYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkubGFzdEZvY3VzZWRMaXN0LCBhc3luYyB3aWRnZXQgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZUtleWJvYXJkRXZlbnQgPSBuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicpO1xuXHRcdFx0YXdhaXQgd2lkZ2V0LmZvY3VzRmlyc3QoZmFrZUtleWJvYXJkRXZlbnQpO1xuXHRcdH0pO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC5mb2N1c0xhc3QnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSxcblx0cHJpbWFyeTogS2V5Q29kZS5FbmQsXG5cdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdG5hdmlnYXRlKGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdCwgYXN5bmMgd2lkZ2V0ID0+IHtcblx0XHRcdGNvbnN0IGZha2VLZXlib2FyZEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nKTtcblx0XHRcdGF3YWl0IHdpZGdldC5mb2N1c0xhc3QoZmFrZUtleWJvYXJkRXZlbnQpO1xuXHRcdH0pO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC5mb2N1c0FueUZpcnN0Jyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXksXG5cdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLkhvbWUsXG5cdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdG5hdmlnYXRlKGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdCwgYXN5bmMgd2lkZ2V0ID0+IHtcblx0XHRcdGNvbnN0IGZha2VLZXlib2FyZEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGFsdEtleTogdHJ1ZSB9KTtcblx0XHRcdGF3YWl0IHdpZGdldC5mb2N1c0ZpcnN0KGZha2VLZXlib2FyZEV2ZW50KTtcblx0XHR9KTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3QuZm9jdXNBbnlMYXN0Jyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXksXG5cdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLkVuZCxcblx0aGFuZGxlcjogKGFjY2Vzc29yKSA9PiB7XG5cdFx0bmF2aWdhdGUoYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkubGFzdEZvY3VzZWRMaXN0LCBhc3luYyB3aWRnZXQgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZUtleWJvYXJkRXZlbnQgPSBuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsgYWx0S2V5OiB0cnVlIH0pO1xuXHRcdFx0YXdhaXQgd2lkZ2V0LmZvY3VzTGFzdChmYWtlS2V5Ym9hcmRFdmVudCk7XG5cdFx0fSk7XG5cdH1cbn0pO1xuXG5mdW5jdGlvbiBleHBhbmRNdWx0aVNlbGVjdGlvbihmb2N1c2VkOiBXb3JrYmVuY2hMaXN0V2lkZ2V0LCBwcmV2aW91c0ZvY3VzOiB1bmtub3duKTogdm9pZCB7XG5cblx0Ly8gTGlzdFxuXHRpZiAoZm9jdXNlZCBpbnN0YW5jZW9mIExpc3QgfHwgZm9jdXNlZCBpbnN0YW5jZW9mIFBhZ2VkTGlzdCB8fCBmb2N1c2VkIGluc3RhbmNlb2YgVGFibGUpIHtcblx0XHRjb25zdCBsaXN0ID0gZm9jdXNlZDtcblxuXHRcdGNvbnN0IGZvY3VzID0gbGlzdC5nZXRGb2N1cygpID8gbGlzdC5nZXRGb2N1cygpWzBdIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IGxpc3QuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0aWYgKHNlbGVjdGlvbiAmJiB0eXBlb2YgZm9jdXMgPT09ICdudW1iZXInICYmIHNlbGVjdGlvbi5pbmRleE9mKGZvY3VzKSA+PSAwKSB7XG5cdFx0XHRsaXN0LnNldFNlbGVjdGlvbihzZWxlY3Rpb24uZmlsdGVyKHMgPT4gcyAhPT0gcHJldmlvdXNGb2N1cykpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodHlwZW9mIGZvY3VzID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRsaXN0LnNldFNlbGVjdGlvbihzZWxlY3Rpb24uY29uY2F0KGZvY3VzKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gVHJlZVxuXHRlbHNlIGlmIChmb2N1c2VkIGluc3RhbmNlb2YgT2JqZWN0VHJlZSB8fCBmb2N1c2VkIGluc3RhbmNlb2YgRGF0YVRyZWUgfHwgZm9jdXNlZCBpbnN0YW5jZW9mIEFzeW5jRGF0YVRyZWUpIHtcblx0XHRjb25zdCBsaXN0ID0gZm9jdXNlZDtcblxuXHRcdGNvbnN0IGZvY3VzID0gbGlzdC5nZXRGb2N1cygpID8gbGlzdC5nZXRGb2N1cygpWzBdIDogdW5kZWZpbmVkO1xuXG5cdFx0aWYgKHByZXZpb3VzRm9jdXMgPT09IGZvY3VzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gbGlzdC5nZXRTZWxlY3Rpb24oKTtcblx0XHRjb25zdCBmYWtlS2V5Ym9hcmRFdmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBzaGlmdEtleTogdHJ1ZSB9KTtcblxuXHRcdGlmIChzZWxlY3Rpb24gJiYgc2VsZWN0aW9uLmluZGV4T2YoZm9jdXMpID49IDApIHtcblx0XHRcdGxpc3Quc2V0U2VsZWN0aW9uKHNlbGVjdGlvbi5maWx0ZXIocyA9PiBzICE9PSBwcmV2aW91c0ZvY3VzKSwgZmFrZUtleWJvYXJkRXZlbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsaXN0LnNldFNlbGVjdGlvbihzZWxlY3Rpb24uY29uY2F0KGZvY3VzKSwgZmFrZUtleWJvYXJkRXZlbnQpO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiByZXZlYWxGb2N1c2VkU3RpY2t5U2Nyb2xsKHRyZWU6IE9iamVjdFRyZWU8dW5rbm93biwgdW5rbm93bj4gfCBEYXRhVHJlZTx1bmtub3duLCB1bmtub3duPiB8IEFzeW5jRGF0YVRyZWU8dW5rbm93biwgdW5rbm93bj4sIHBvc3RSZXZlYWxBY3Rpb24/OiAoZm9jdXM6IHVua25vd24pID0+IHZvaWQpOiB2b2lkIHtcblx0Y29uc3QgZm9jdXMgPSB0cmVlLmdldFN0aWNreVNjcm9sbEZvY3VzKCk7XG5cblx0aWYgKGZvY3VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgU3RpY2t5U2Nyb2xsIGhhcyBubyBmb2N1c2ApO1xuXHR9XG5cdGlmIChmb2N1cy5sZW5ndGggPiAxKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBTdGlja3lTY3JvbGwgY2FuIG9ubHkgaGF2ZSBhIHNpbmdsZSBmb2N1c2VkIGl0ZW1gKTtcblx0fVxuXG5cdHRyZWUucmV2ZWFsKGZvY3VzWzBdKTtcblx0dHJlZS5nZXRIVE1MRWxlbWVudCgpLmZvY3VzKCk7IC8vIGRvbWZvY3VzKCkgd291bGQgZm9jdXMgc3Rpa3kgc2Nyb2xsIGRvbSBhbmQgbm90IHRoZSB0cmVlIHRvZG9AYmVuaWJlbmpcblx0dHJlZS5zZXRGb2N1cyhmb2N1cyk7XG5cdHBvc3RSZXZlYWxBY3Rpb24/Lihmb2N1c1swXSk7XG59XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3QuZXhwYW5kU2VsZWN0aW9uRG93bicsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSwgV29ya2JlbmNoTGlzdFN1cHBvcnRzTXVsdGlTZWxlY3RDb250ZXh0S2V5KSxcblx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5Eb3duQXJyb3csXG5cdGhhbmRsZXI6IChhY2Nlc3NvciwgYXJnMikgPT4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdDtcblxuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRm9jdXMgZG93biBmaXJzdFxuXHRcdGNvbnN0IHByZXZpb3VzRm9jdXMgPSB3aWRnZXQuZ2V0Rm9jdXMoKSA/IHdpZGdldC5nZXRGb2N1cygpWzBdIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGZha2VLZXlib2FyZEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nKTtcblx0XHR3aWRnZXQuZm9jdXNOZXh0KHR5cGVvZiBhcmcyID09PSAnbnVtYmVyJyA/IGFyZzIgOiAxLCBmYWxzZSwgZmFrZUtleWJvYXJkRXZlbnQpO1xuXG5cdFx0Ly8gVGhlbiBhZGp1c3Qgc2VsZWN0aW9uXG5cdFx0ZXhwYW5kTXVsdGlTZWxlY3Rpb24od2lkZ2V0LCBwcmV2aW91c0ZvY3VzKTtcblxuXHRcdGNvbnN0IGZvY3VzID0gd2lkZ2V0LmdldEZvY3VzKCk7XG5cblx0XHRpZiAoZm9jdXMubGVuZ3RoKSB7XG5cdFx0XHR3aWRnZXQucmV2ZWFsKGZvY3VzWzBdKTtcblx0XHR9XG5cblx0XHRlbnN1cmVET01Gb2N1cyh3aWRnZXQpO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC5leHBhbmRTZWxlY3Rpb25VcCcsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSwgV29ya2JlbmNoTGlzdFN1cHBvcnRzTXVsdGlTZWxlY3RDb250ZXh0S2V5KSxcblx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5VcEFycm93LFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IsIGFyZzIpID0+IHtcblx0XHRjb25zdCB3aWRnZXQgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3Q7XG5cblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEZvY3VzIHVwIGZpcnN0XG5cdFx0Y29uc3QgcHJldmlvdXNGb2N1cyA9IHdpZGdldC5nZXRGb2N1cygpID8gd2lkZ2V0LmdldEZvY3VzKClbMF0gOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZmFrZUtleWJvYXJkRXZlbnQgPSBuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicpO1xuXHRcdHdpZGdldC5mb2N1c1ByZXZpb3VzKHR5cGVvZiBhcmcyID09PSAnbnVtYmVyJyA/IGFyZzIgOiAxLCBmYWxzZSwgZmFrZUtleWJvYXJkRXZlbnQpO1xuXG5cdFx0Ly8gVGhlbiBhZGp1c3Qgc2VsZWN0aW9uXG5cdFx0ZXhwYW5kTXVsdGlTZWxlY3Rpb24od2lkZ2V0LCBwcmV2aW91c0ZvY3VzKTtcblxuXHRcdGNvbnN0IGZvY3VzID0gd2lkZ2V0LmdldEZvY3VzKCk7XG5cblx0XHRpZiAoZm9jdXMubGVuZ3RoKSB7XG5cdFx0XHR3aWRnZXQucmV2ZWFsKGZvY3VzWzBdKTtcblx0XHR9XG5cblx0XHRlbnN1cmVET01Gb2N1cyh3aWRnZXQpO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC5jb2xsYXBzZScsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSwgQ29udGV4dEtleUV4cHIub3IoV29ya2JlbmNoVHJlZUVsZW1lbnRDYW5Db2xsYXBzZSwgV29ya2JlbmNoVHJlZUVsZW1lbnRIYXNQYXJlbnQpKSxcblx0cHJpbWFyeTogS2V5Q29kZS5MZWZ0QXJyb3csXG5cdG1hYzoge1xuXHRcdHByaW1hcnk6IEtleUNvZGUuTGVmdEFycm93LFxuXHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5VcEFycm93XVxuXHR9LFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCB3aWRnZXQgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3Q7XG5cblx0XHRpZiAoIXdpZGdldCB8fCAhKHdpZGdldCBpbnN0YW5jZW9mIE9iamVjdFRyZWUgfHwgd2lkZ2V0IGluc3RhbmNlb2YgRGF0YVRyZWUgfHwgd2lkZ2V0IGluc3RhbmNlb2YgQXN5bmNEYXRhVHJlZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0cmVlID0gd2lkZ2V0O1xuXHRcdGNvbnN0IGZvY3VzZWRFbGVtZW50cyA9IHRyZWUuZ2V0Rm9jdXMoKTtcblxuXHRcdGlmIChmb2N1c2VkRWxlbWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9jdXMgPSBmb2N1c2VkRWxlbWVudHNbMF07XG5cblx0XHRpZiAoIXRyZWUuY29sbGFwc2UoZm9jdXMpKSB7XG5cdFx0XHRjb25zdCBwYXJlbnQgPSB0cmVlLmdldFBhcmVudEVsZW1lbnQoZm9jdXMpO1xuXG5cdFx0XHRpZiAocGFyZW50KSB7XG5cdFx0XHRcdG5hdmlnYXRlKHdpZGdldCwgd2lkZ2V0ID0+IHtcblx0XHRcdFx0XHRjb25zdCBmYWtlS2V5Ym9hcmRFdmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJyk7XG5cdFx0XHRcdFx0d2lkZ2V0LnNldEZvY3VzKFtwYXJlbnRdLCBmYWtlS2V5Ym9hcmRFdmVudCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3Quc3RpY2t5U2Nyb2xsLmNvbGxhcHNlJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyA1MCxcblx0d2hlbjogV29ya2JlbmNoVHJlZVN0aWNreVNjcm9sbEZvY3VzZWQsXG5cdHByaW1hcnk6IEtleUNvZGUuTGVmdEFycm93LFxuXHRtYWM6IHtcblx0XHRwcmltYXJ5OiBLZXlDb2RlLkxlZnRBcnJvdyxcblx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuVXBBcnJvd11cblx0fSxcblx0aGFuZGxlcjogKGFjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkubGFzdEZvY3VzZWRMaXN0O1xuXG5cdFx0aWYgKCF3aWRnZXQgfHwgISh3aWRnZXQgaW5zdGFuY2VvZiBPYmplY3RUcmVlIHx8IHdpZGdldCBpbnN0YW5jZW9mIERhdGFUcmVlIHx8IHdpZGdldCBpbnN0YW5jZW9mIEFzeW5jRGF0YVRyZWUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV2ZWFsRm9jdXNlZFN0aWNreVNjcm9sbCh3aWRnZXQsIGZvY3VzID0+IHdpZGdldC5jb2xsYXBzZShmb2N1cykpO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC5jb2xsYXBzZUFsbCcsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuTGVmdEFycm93LFxuXHRtYWM6IHtcblx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuTGVmdEFycm93LFxuXHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5VcEFycm93XVxuXHR9LFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBmb2N1c2VkID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkubGFzdEZvY3VzZWRMaXN0O1xuXG5cdFx0aWYgKGZvY3VzZWQgJiYgIShmb2N1c2VkIGluc3RhbmNlb2YgTGlzdCB8fCBmb2N1c2VkIGluc3RhbmNlb2YgUGFnZWRMaXN0IHx8IGZvY3VzZWQgaW5zdGFuY2VvZiBUYWJsZSkpIHtcblx0XHRcdGZvY3VzZWQuY29sbGFwc2VBbGwoKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdsaXN0LmNvbGxhcHNlQWxsVG9Gb2N1cycsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LFxuXHRoYW5kbGVyOiBhY2Nlc3NvciA9PiB7XG5cdFx0Y29uc3QgZm9jdXNlZCA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdDtcblx0XHRjb25zdCBmYWtlS2V5Ym9hcmRFdmVudCA9IGdldFNlbGVjdGlvbktleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB0cnVlKTtcblx0XHQvLyBUcmVlc1xuXHRcdGlmIChmb2N1c2VkIGluc3RhbmNlb2YgT2JqZWN0VHJlZSB8fCBmb2N1c2VkIGluc3RhbmNlb2YgRGF0YVRyZWUgfHwgZm9jdXNlZCBpbnN0YW5jZW9mIEFzeW5jRGF0YVRyZWUpIHtcblx0XHRcdGNvbnN0IHRyZWUgPSBmb2N1c2VkO1xuXHRcdFx0Y29uc3QgZm9jdXMgPSB0cmVlLmdldEZvY3VzKCk7XG5cblx0XHRcdGlmIChmb2N1cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRyZWUuY29sbGFwc2UoZm9jdXNbMF0sIHRydWUpO1xuXHRcdFx0fVxuXHRcdFx0dHJlZS5zZXRTZWxlY3Rpb24oZm9jdXMsIGZha2VLZXlib2FyZEV2ZW50KTtcblx0XHRcdHRyZWUuc2V0QW5jaG9yKGZvY3VzWzBdKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3QuZm9jdXNQYXJlbnQnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSxcblx0aGFuZGxlcjogKGFjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkubGFzdEZvY3VzZWRMaXN0O1xuXG5cdFx0aWYgKCF3aWRnZXQgfHwgISh3aWRnZXQgaW5zdGFuY2VvZiBPYmplY3RUcmVlIHx8IHdpZGdldCBpbnN0YW5jZW9mIERhdGFUcmVlIHx8IHdpZGdldCBpbnN0YW5jZW9mIEFzeW5jRGF0YVRyZWUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHJlZSA9IHdpZGdldDtcblx0XHRjb25zdCBmb2N1c2VkRWxlbWVudHMgPSB0cmVlLmdldEZvY3VzKCk7XG5cdFx0aWYgKGZvY3VzZWRFbGVtZW50cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZm9jdXMgPSBmb2N1c2VkRWxlbWVudHNbMF07XG5cdFx0Y29uc3QgcGFyZW50ID0gdHJlZS5nZXRQYXJlbnRFbGVtZW50KGZvY3VzKTtcblx0XHRpZiAocGFyZW50KSB7XG5cdFx0XHRuYXZpZ2F0ZSh3aWRnZXQsIHdpZGdldCA9PiB7XG5cdFx0XHRcdGNvbnN0IGZha2VLZXlib2FyZEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nKTtcblx0XHRcdFx0d2lkZ2V0LnNldEZvY3VzKFtwYXJlbnRdLCBmYWtlS2V5Ym9hcmRFdmVudCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdsaXN0LmV4cGFuZCcsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSwgQ29udGV4dEtleUV4cHIub3IoV29ya2JlbmNoVHJlZUVsZW1lbnRDYW5FeHBhbmQsIFdvcmtiZW5jaFRyZWVFbGVtZW50SGFzQ2hpbGQpKSxcblx0cHJpbWFyeTogS2V5Q29kZS5SaWdodEFycm93LFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCB3aWRnZXQgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3Q7XG5cblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh3aWRnZXQgaW5zdGFuY2VvZiBPYmplY3RUcmVlIHx8IHdpZGdldCBpbnN0YW5jZW9mIERhdGFUcmVlKSB7XG5cdFx0XHQvLyBUT0RPQEpvYW86IGluc3RlYWQgb2YgZG9pbmcgdGhpcyBoZXJlLCBqdXN0IGRlbGVnYXRlIHRvIGEgdHJlZSBtZXRob2Rcblx0XHRcdGNvbnN0IGZvY3VzZWRFbGVtZW50cyA9IHdpZGdldC5nZXRGb2N1cygpO1xuXG5cdFx0XHRpZiAoZm9jdXNlZEVsZW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZvY3VzID0gZm9jdXNlZEVsZW1lbnRzWzBdO1xuXG5cdFx0XHRpZiAoIXdpZGdldC5leHBhbmQoZm9jdXMpKSB7XG5cdFx0XHRcdGNvbnN0IGNoaWxkID0gd2lkZ2V0LmdldEZpcnN0RWxlbWVudENoaWxkKGZvY3VzKTtcblxuXHRcdFx0XHRpZiAoY2hpbGQpIHtcblx0XHRcdFx0XHRjb25zdCBub2RlID0gd2lkZ2V0LmdldE5vZGUoY2hpbGQpO1xuXG5cdFx0XHRcdFx0aWYgKG5vZGUudmlzaWJsZSkge1xuXHRcdFx0XHRcdFx0bmF2aWdhdGUod2lkZ2V0LCB3aWRnZXQgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBmYWtlS2V5Ym9hcmRFdmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJyk7XG5cdFx0XHRcdFx0XHRcdHdpZGdldC5zZXRGb2N1cyhbY2hpbGRdLCBmYWtlS2V5Ym9hcmRFdmVudCk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHdpZGdldCBpbnN0YW5jZW9mIEFzeW5jRGF0YVRyZWUpIHtcblx0XHRcdC8vIFRPRE9ASm9hbzogaW5zdGVhZCBvZiBkb2luZyB0aGlzIGhlcmUsIGp1c3QgZGVsZWdhdGUgdG8gYSB0cmVlIG1ldGhvZFxuXHRcdFx0Y29uc3QgZm9jdXNlZEVsZW1lbnRzID0gd2lkZ2V0LmdldEZvY3VzKCk7XG5cblx0XHRcdGlmIChmb2N1c2VkRWxlbWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZm9jdXMgPSBmb2N1c2VkRWxlbWVudHNbMF07XG5cdFx0XHR3aWRnZXQuZXhwYW5kKGZvY3VzKS50aGVuKGRpZEV4cGFuZCA9PiB7XG5cdFx0XHRcdGlmIChmb2N1cyAmJiAhZGlkRXhwYW5kKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2hpbGQgPSB3aWRnZXQuZ2V0Rmlyc3RFbGVtZW50Q2hpbGQoZm9jdXMpO1xuXG5cdFx0XHRcdFx0aWYgKGNoaWxkKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBub2RlID0gd2lkZ2V0LmdldE5vZGUoY2hpbGQpO1xuXG5cdFx0XHRcdFx0XHRpZiAobm9kZS52aXNpYmxlKSB7XG5cdFx0XHRcdFx0XHRcdG5hdmlnYXRlKHdpZGdldCwgd2lkZ2V0ID0+IHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBmYWtlS2V5Ym9hcmRFdmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJyk7XG5cdFx0XHRcdFx0XHRcdFx0d2lkZ2V0LnNldEZvY3VzKFtjaGlsZF0sIGZha2VLZXlib2FyZEV2ZW50KTtcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn0pO1xuXG5mdW5jdGlvbiBzZWxlY3RFbGVtZW50KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCByZXRhaW5DdXJyZW50Rm9jdXM6IGJvb2xlYW4pOiB2b2lkIHtcblx0Y29uc3QgZm9jdXNlZCA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdDtcblx0Y29uc3QgZmFrZUtleWJvYXJkRXZlbnQgPSBnZXRTZWxlY3Rpb25LZXlib2FyZEV2ZW50KCdrZXlkb3duJywgcmV0YWluQ3VycmVudEZvY3VzKTtcblx0Ly8gTGlzdFxuXHRpZiAoZm9jdXNlZCBpbnN0YW5jZW9mIExpc3QgfHwgZm9jdXNlZCBpbnN0YW5jZW9mIFBhZ2VkTGlzdCB8fCBmb2N1c2VkIGluc3RhbmNlb2YgVGFibGUpIHtcblx0XHRjb25zdCBsaXN0ID0gZm9jdXNlZDtcblx0XHRsaXN0LnNldEFuY2hvcihsaXN0LmdldEZvY3VzKClbMF0pO1xuXHRcdGxpc3Quc2V0U2VsZWN0aW9uKGxpc3QuZ2V0Rm9jdXMoKSwgZmFrZUtleWJvYXJkRXZlbnQpO1xuXHR9XG5cblx0Ly8gVHJlZXNcblx0ZWxzZSBpZiAoZm9jdXNlZCBpbnN0YW5jZW9mIE9iamVjdFRyZWUgfHwgZm9jdXNlZCBpbnN0YW5jZW9mIERhdGFUcmVlIHx8IGZvY3VzZWQgaW5zdGFuY2VvZiBBc3luY0RhdGFUcmVlKSB7XG5cdFx0Y29uc3QgdHJlZSA9IGZvY3VzZWQ7XG5cdFx0Y29uc3QgZm9jdXMgPSB0cmVlLmdldEZvY3VzKCk7XG5cblx0XHRpZiAoZm9jdXMubGVuZ3RoID4gMCkge1xuXHRcdFx0bGV0IHRvZ2dsZUNvbGxhcHNlZCA9IHRydWU7XG5cblx0XHRcdGlmICh0cmVlLmV4cGFuZE9ubHlPblR3aXN0aWVDbGljayA9PT0gdHJ1ZSkge1xuXHRcdFx0XHR0b2dnbGVDb2xsYXBzZWQgPSBmYWxzZTtcblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIHRyZWUuZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrICE9PSAnYm9vbGVhbicgJiYgdHJlZS5leHBhbmRPbmx5T25Ud2lzdGllQ2xpY2soZm9jdXNbMF0pKSB7XG5cdFx0XHRcdHRvZ2dsZUNvbGxhcHNlZCA9IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodG9nZ2xlQ29sbGFwc2VkKSB7XG5cdFx0XHRcdHRyZWUudG9nZ2xlQ29sbGFwc2VkKGZvY3VzWzBdKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dHJlZS5zZXRBbmNob3IoZm9jdXNbMF0pO1xuXHRcdHRyZWUuc2V0U2VsZWN0aW9uKGZvY3VzLCBmYWtlS2V5Ym9hcmRFdmVudCk7XG5cdH1cbn1cblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC5zZWxlY3QnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSxcblx0cHJpbWFyeTogS2V5Q29kZS5FbnRlcixcblx0bWFjOiB7XG5cdFx0cHJpbWFyeTogS2V5Q29kZS5FbnRlcixcblx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRG93bkFycm93XVxuXHR9LFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRzZWxlY3RFbGVtZW50KGFjY2Vzc29yLCBmYWxzZSk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdsaXN0LnN0aWNreVNjcm9sbHNlbGVjdCcsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgNTAsIC8vIHByaW9yaXRpZXMgb3ZlciBmaWxlIGV4cGxvcmVyXG5cdHdoZW46IFdvcmtiZW5jaFRyZWVTdGlja3lTY3JvbGxGb2N1c2VkLFxuXHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyLFxuXHRtYWM6IHtcblx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyLFxuXHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3ddXG5cdH0sXG5cdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdDtcblxuXHRcdGlmICghd2lkZ2V0IHx8ICEod2lkZ2V0IGluc3RhbmNlb2YgT2JqZWN0VHJlZSB8fCB3aWRnZXQgaW5zdGFuY2VvZiBEYXRhVHJlZSB8fCB3aWRnZXQgaW5zdGFuY2VvZiBBc3luY0RhdGFUcmVlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldmVhbEZvY3VzZWRTdGlja3lTY3JvbGwod2lkZ2V0LCBmb2N1cyA9PiB3aWRnZXQuc2V0U2VsZWN0aW9uKFtmb2N1c10pKTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3Quc2VsZWN0QW5kUHJlc2VydmVGb2N1cycsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LFxuXHRoYW5kbGVyOiBhY2Nlc3NvciA9PiB7XG5cdFx0c2VsZWN0RWxlbWVudChhY2Nlc3NvciwgdHJ1ZSk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdsaXN0LnNlbGVjdEFsbCcsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSwgV29ya2JlbmNoTGlzdFN1cHBvcnRzTXVsdGlTZWxlY3RDb250ZXh0S2V5KSxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUEsXG5cdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IGZvY3VzZWQgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3Q7XG5cblx0XHQvLyBMaXN0XG5cdFx0aWYgKGZvY3VzZWQgaW5zdGFuY2VvZiBMaXN0IHx8IGZvY3VzZWQgaW5zdGFuY2VvZiBQYWdlZExpc3QgfHwgZm9jdXNlZCBpbnN0YW5jZW9mIFRhYmxlKSB7XG5cdFx0XHRjb25zdCBsaXN0ID0gZm9jdXNlZDtcblx0XHRcdGNvbnN0IGZha2VLZXlib2FyZEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nKTtcblx0XHRcdGxpc3Quc2V0U2VsZWN0aW9uKHJhbmdlKGxpc3QubGVuZ3RoKSwgZmFrZUtleWJvYXJkRXZlbnQpO1xuXHRcdH1cblxuXHRcdC8vIFRyZWVzXG5cdFx0ZWxzZSBpZiAoZm9jdXNlZCBpbnN0YW5jZW9mIE9iamVjdFRyZWUgfHwgZm9jdXNlZCBpbnN0YW5jZW9mIERhdGFUcmVlIHx8IGZvY3VzZWQgaW5zdGFuY2VvZiBBc3luY0RhdGFUcmVlKSB7XG5cdFx0XHRjb25zdCB0cmVlID0gZm9jdXNlZDtcblx0XHRcdGNvbnN0IGZvY3VzID0gdHJlZS5nZXRGb2N1cygpO1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gdHJlZS5nZXRTZWxlY3Rpb24oKTtcblxuXHRcdFx0Ly8gV2hpY2ggZWxlbWVudCBzaG91bGQgYmUgY29uc2lkZXJlZCB0byBzdGFydCBzZWxlY3RpbmcgYWxsP1xuXHRcdFx0bGV0IHN0YXJ0OiB1bmtub3duIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAoZm9jdXMubGVuZ3RoID4gMCAmJiAoc2VsZWN0aW9uLmxlbmd0aCA9PT0gMCB8fCAhc2VsZWN0aW9uLmluY2x1ZGVzKGZvY3VzWzBdKSkpIHtcblx0XHRcdFx0c3RhcnQgPSBmb2N1c1swXTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFzdGFydCAmJiBzZWxlY3Rpb24ubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRzdGFydCA9IHNlbGVjdGlvblswXTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gV2hhdCBpcyB0aGUgc2NvcGUgb2Ygc2VsZWN0IGFsbD9cblx0XHRcdGxldCBzY29wZTogdW5rbm93biB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKCFzdGFydCkge1xuXHRcdFx0XHRzY29wZSA9IHVuZGVmaW5lZDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNjb3BlID0gdHJlZS5nZXRQYXJlbnRFbGVtZW50KHN0YXJ0KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmV3U2VsZWN0aW9uOiB1bmtub3duW10gPSBbXTtcblx0XHRcdGNvbnN0IHZpc2l0ID0gKG5vZGU6IElUcmVlTm9kZTx1bmtub3duLCB1bmtub3duPikgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRpZiAoY2hpbGQudmlzaWJsZSkge1xuXHRcdFx0XHRcdFx0bmV3U2VsZWN0aW9uLnB1c2goY2hpbGQuZWxlbWVudCk7XG5cblx0XHRcdFx0XHRcdGlmICghY2hpbGQuY29sbGFwc2VkKSB7XG5cdFx0XHRcdFx0XHRcdHZpc2l0KGNoaWxkKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdC8vIEFkZCB0aGUgd2hvbGUgc2NvcGUgc3VidHJlZSB0byB0aGUgbmV3IHNlbGVjdGlvblxuXHRcdFx0dmlzaXQodHJlZS5nZXROb2RlKHNjb3BlKSk7XG5cblx0XHRcdC8vIElmIHRoZSBzY29wZSBpc24ndCB0aGUgdHJlZSByb290LCBpdCBzaG91bGQgYmUgcGFydCBvZiB0aGUgbmV3IHNlbGVjdGlvblxuXHRcdFx0aWYgKHNjb3BlICYmIHNlbGVjdGlvbi5sZW5ndGggPT09IG5ld1NlbGVjdGlvbi5sZW5ndGgpIHtcblx0XHRcdFx0bmV3U2VsZWN0aW9uLnVuc2hpZnQoc2NvcGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmYWtlS2V5Ym9hcmRFdmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJyk7XG5cdFx0XHR0cmVlLnNldFNlbGVjdGlvbihuZXdTZWxlY3Rpb24sIGZha2VLZXlib2FyZEV2ZW50KTtcblx0XHR9XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdsaXN0LnRvZ2dsZVNlbGVjdGlvbicsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRW50ZXIsXG5cdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdDtcblxuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9jdXMgPSB3aWRnZXQuZ2V0Rm9jdXMoKTtcblxuXHRcdGlmIChmb2N1cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3Rpb24gPSB3aWRnZXQuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0Y29uc3QgaW5kZXggPSBzZWxlY3Rpb24uaW5kZXhPZihmb2N1c1swXSk7XG5cblx0XHRpZiAoaW5kZXggPiAtMSkge1xuXHRcdFx0d2lkZ2V0LnNldFNlbGVjdGlvbihbLi4uc2VsZWN0aW9uLnNsaWNlKDAsIGluZGV4KSwgLi4uc2VsZWN0aW9uLnNsaWNlKGluZGV4ICsgMSldKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0d2lkZ2V0LnNldFNlbGVjdGlvbihbLi4uc2VsZWN0aW9uLCBmb2N1c1swXV0pO1xuXHRcdH1cblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3Quc2hvd0hvdmVyJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SSksXG5cdHdoZW46IFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXksXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IGxpc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSk7XG5cdFx0Y29uc3QgbGFzdEZvY3VzZWRMaXN0ID0gbGlzdFNlcnZpY2UubGFzdEZvY3VzZWRMaXN0O1xuXHRcdGlmICghbGFzdEZvY3VzZWRMaXN0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgYSB0cmVlIGVsZW1lbnQgaXMgZm9jdXNlZFxuXHRcdGNvbnN0IGZvY3VzID0gbGFzdEZvY3VzZWRMaXN0LmdldEZvY3VzKCk7XG5cdFx0aWYgKCFmb2N1cyB8fCAoZm9jdXMubGVuZ3RoID09PSAwKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEFzIHRoZSB0cmVlIGRvZXMgbm90IGtub3cgYW55dGhpbmcgYWJvdXQgdGhlIHJlbmRlcmVkIERPTSBlbGVtZW50c1xuXHRcdC8vIHdlIGhhdmUgdG8gdHJhdmVyc2UgdGhlIGRvbSB0byBmaW5kIHRoZSBIVE1MRWxlbWVudHNcblx0XHRjb25zdCB0cmVlRE9NID0gbGFzdEZvY3VzZWRMaXN0LmdldEhUTUxFbGVtZW50KCk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3Qgc2Nyb2xsYWJsZUVsZW1lbnQgPSB0cmVlRE9NLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50Jyk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgbGlzdFJvd3MgPSBzY3JvbGxhYmxlRWxlbWVudD8ucXVlcnlTZWxlY3RvcignLm1vbmFjby1saXN0LXJvd3MnKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBmb2N1c2VkRWxlbWVudCA9IGxpc3RSb3dzPy5xdWVyeVNlbGVjdG9yKCcuZm9jdXNlZCcpO1xuXHRcdGlmICghZm9jdXNlZEVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlbGVtZW50V2l0aEhvdmVyID0gZ2V0Q3VzdG9tSG92ZXJGb3JFbGVtZW50KGZvY3VzZWRFbGVtZW50IGFzIEhUTUxFbGVtZW50KTtcblx0XHRpZiAoZWxlbWVudFdpdGhIb3Zlcikge1xuXHRcdFx0YWNjZXNzb3IuZ2V0KElIb3ZlclNlcnZpY2UpLnNob3dNYW5hZ2VkSG92ZXIoZWxlbWVudFdpdGhIb3Zlcik7XG5cdFx0fVxuXHR9LFxufSk7XG5cbmZ1bmN0aW9uIGdldEN1c3RvbUhvdmVyRm9yRWxlbWVudChlbGVtZW50OiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0Ly8gQ2hlY2sgaWYgdGhlIGVsZW1lbnQgaXRzZWxmIGhhcyBhIGhvdmVyXG5cdGlmIChlbGVtZW50Lm1hdGNoZXMoJ1tjdXN0b20taG92ZXI9XCJ0cnVlXCJdJykpIHtcblx0XHRyZXR1cm4gZWxlbWVudDtcblx0fVxuXG5cdC8vIE9ubHkgY29uc2lkZXIgY2hpbGRyZW4gdGhhdCBhcmUgbm90IGFjdGlvbiBpdGVtcyBvciBoYXZlIGEgdGFiaW5kZXhcblx0Ly8gYXMgdGhlc2UgZWxlbWVudCBhcmUgZm9jdXNhYmxlIGFuZCB0aGUgdXNlciBpcyBhYmxlIHRvIHRyaWdnZXIgdGhlbSBhbHJlYWR5XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRjb25zdCBub25lRm9jdXNhYmxlRWxlbWVudFdpdGhIb3ZlciA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignW2N1c3RvbS1ob3Zlcj1cInRydWVcIl06bm90KFt0YWJpbmRleF0pOm5vdCguYWN0aW9uLWl0ZW0pJyk7XG5cdGlmIChub25lRm9jdXNhYmxlRWxlbWVudFdpdGhIb3Zlcikge1xuXHRcdHJldHVybiBub25lRm9jdXNhYmxlRWxlbWVudFdpdGhIb3ZlciBhcyBIVE1MRWxlbWVudDtcblx0fVxuXG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3QudG9nZ2xlRXhwYW5kJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXksXG5cdHByaW1hcnk6IEtleUNvZGUuU3BhY2UsXG5cdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IGZvY3VzZWQgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3Q7XG5cblx0XHQvLyBUcmVlIG9ubHlcblx0XHRpZiAoZm9jdXNlZCBpbnN0YW5jZW9mIE9iamVjdFRyZWUgfHwgZm9jdXNlZCBpbnN0YW5jZW9mIERhdGFUcmVlIHx8IGZvY3VzZWQgaW5zdGFuY2VvZiBBc3luY0RhdGFUcmVlKSB7XG5cdFx0XHRjb25zdCB0cmVlID0gZm9jdXNlZDtcblx0XHRcdGNvbnN0IGZvY3VzID0gdHJlZS5nZXRGb2N1cygpO1xuXG5cdFx0XHRpZiAoIXRyZWUub3B0aW9ucy5kaXNhYmxlRXhwYW5kT25TcGFjZWJhciAmJiBmb2N1cy5sZW5ndGggPiAwICYmIHRyZWUuaXNDb2xsYXBzaWJsZShmb2N1c1swXSkpIHtcblx0XHRcdFx0dHJlZS50b2dnbGVDb2xsYXBzZWQoZm9jdXNbMF0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0c2VsZWN0RWxlbWVudChhY2Nlc3NvciwgdHJ1ZSk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdsaXN0LnN0aWNreVNjcm9sbHRvZ2dsZUV4cGFuZCcsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgNTAsIC8vIHByaW9yaXRpZXMgb3ZlciBmaWxlIGV4cGxvcmVyXG5cdHdoZW46IFdvcmtiZW5jaFRyZWVTdGlja3lTY3JvbGxGb2N1c2VkLFxuXHRwcmltYXJ5OiBLZXlDb2RlLlNwYWNlLFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCB3aWRnZXQgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3Q7XG5cblx0XHRpZiAoIXdpZGdldCB8fCAhKHdpZGdldCBpbnN0YW5jZW9mIE9iamVjdFRyZWUgfHwgd2lkZ2V0IGluc3RhbmNlb2YgRGF0YVRyZWUgfHwgd2lkZ2V0IGluc3RhbmNlb2YgQXN5bmNEYXRhVHJlZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXZlYWxGb2N1c2VkU3RpY2t5U2Nyb2xsKHdpZGdldCk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdsaXN0LmNsZWFyJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LCBXb3JrYmVuY2hMaXN0SGFzU2VsZWN0aW9uT3JGb2N1cyksXG5cdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCB3aWRnZXQgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3Q7XG5cblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHdpZGdldC5nZXRTZWxlY3Rpb24oKTtcblx0XHRjb25zdCBmYWtlS2V5Ym9hcmRFdmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJyk7XG5cblx0XHRpZiAoc2VsZWN0aW9uLmxlbmd0aCA+IDEpIHtcblx0XHRcdGNvbnN0IHVzZVNlbGVjdGlvbk5hdmlnYXRpb24gPSBXb3JrYmVuY2hMaXN0U2VsZWN0aW9uTmF2aWdhdGlvbi5nZXRWYWx1ZSh3aWRnZXQuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0aWYgKHVzZVNlbGVjdGlvbk5hdmlnYXRpb24pIHtcblx0XHRcdFx0Y29uc3QgZm9jdXMgPSB3aWRnZXQuZ2V0Rm9jdXMoKTtcblx0XHRcdFx0d2lkZ2V0LnNldFNlbGVjdGlvbihbZm9jdXNbMF1dLCBmYWtlS2V5Ym9hcmRFdmVudCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR3aWRnZXQuc2V0U2VsZWN0aW9uKFtdLCBmYWtlS2V5Ym9hcmRFdmVudCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHdpZGdldC5zZXRTZWxlY3Rpb24oW10sIGZha2VLZXlib2FyZEV2ZW50KTtcblx0XHRcdHdpZGdldC5zZXRGb2N1cyhbXSwgZmFrZUtleWJvYXJkRXZlbnQpO1xuXHRcdH1cblxuXHRcdHdpZGdldC5zZXRBbmNob3IodW5kZWZpbmVkKTtcblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6ICdsaXN0LnRyaWdnZXJUeXBlTmF2aWdhdGlvbicsXG5cdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdDtcblx0XHR3aWRnZXQ/LnRyaWdnZXJUeXBlTmF2aWdhdGlvbigpO1xuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogJ2xpc3QudG9nZ2xlRmluZE1vZGUnLFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCB3aWRnZXQgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3Q7XG5cblx0XHRpZiAod2lkZ2V0IGluc3RhbmNlb2YgQWJzdHJhY3RUcmVlIHx8IHdpZGdldCBpbnN0YW5jZW9mIEFzeW5jRGF0YVRyZWUpIHtcblx0XHRcdGNvbnN0IHRyZWUgPSB3aWRnZXQ7XG5cdFx0XHR0cmVlLmZpbmRNb2RlID0gdHJlZS5maW5kTW9kZSA9PT0gVHJlZUZpbmRNb2RlLkZpbHRlciA/IFRyZWVGaW5kTW9kZS5IaWdobGlnaHQgOiBUcmVlRmluZE1vZGUuRmlsdGVyO1xuXHRcdH1cblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6ICdsaXN0LnRvZ2dsZUZpbmRNYXRjaFR5cGUnLFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCB3aWRnZXQgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3Q7XG5cblx0XHRpZiAod2lkZ2V0IGluc3RhbmNlb2YgQWJzdHJhY3RUcmVlIHx8IHdpZGdldCBpbnN0YW5jZW9mIEFzeW5jRGF0YVRyZWUpIHtcblx0XHRcdGNvbnN0IHRyZWUgPSB3aWRnZXQ7XG5cdFx0XHR0cmVlLmZpbmRNYXRjaFR5cGUgPSB0cmVlLmZpbmRNYXRjaFR5cGUgPT09IFRyZWVGaW5kTWF0Y2hUeXBlLkNvbnRpZ3VvdXMgPyBUcmVlRmluZE1hdGNoVHlwZS5GdXp6eSA6IFRyZWVGaW5kTWF0Y2hUeXBlLkNvbnRpZ3VvdXM7XG5cdFx0fVxuXHR9XG59KTtcblxuLy8gRGVwcmVjYXRlZCBjb21tYW5kc1xuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbGlhcygnbGlzdC50b2dnbGVLZXlib2FyZE5hdmlnYXRpb24nLCAnbGlzdC50cmlnZ2VyVHlwZU5hdmlnYXRpb24nKTtcbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQWxpYXMoJ2xpc3QudG9nZ2xlRmlsdGVyT25UeXBlJywgJ2xpc3QudG9nZ2xlRmluZE1vZGUnKTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC5maW5kJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChSYXdXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LCBXb3JrYmVuY2hMaXN0U3VwcG9ydHNGaW5kKSxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlGLFxuXHRzZWNvbmRhcnk6IFtLZXlDb2RlLkYzXSxcblx0aGFuZGxlcjogKGFjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkubGFzdEZvY3VzZWRMaXN0O1xuXG5cdFx0Ly8gTGlzdFxuXHRcdGlmICh3aWRnZXQgaW5zdGFuY2VvZiBMaXN0IHx8IHdpZGdldCBpbnN0YW5jZW9mIFBhZ2VkTGlzdCB8fCB3aWRnZXQgaW5zdGFuY2VvZiBUYWJsZSkge1xuXHRcdFx0Ly8gVE9ET0Bqb2FvXG5cdFx0fVxuXG5cdFx0Ly8gVHJlZVxuXHRcdGVsc2UgaWYgKHdpZGdldCBpbnN0YW5jZW9mIEFic3RyYWN0VHJlZSB8fCB3aWRnZXQgaW5zdGFuY2VvZiBBc3luY0RhdGFUcmVlKSB7XG5cdFx0XHRjb25zdCB0cmVlID0gd2lkZ2V0O1xuXHRcdFx0dHJlZS5vcGVuRmluZCgpO1xuXHRcdH1cblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3QuY2xvc2VGaW5kJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChSYXdXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LCBXb3JrYmVuY2hUcmVlRmluZE9wZW4pLFxuXHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0aGFuZGxlcjogKGFjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkubGFzdEZvY3VzZWRMaXN0O1xuXG5cdFx0aWYgKHdpZGdldCBpbnN0YW5jZW9mIEFic3RyYWN0VHJlZSB8fCB3aWRnZXQgaW5zdGFuY2VvZiBBc3luY0RhdGFUcmVlKSB7XG5cdFx0XHRjb25zdCB0cmVlID0gd2lkZ2V0O1xuXHRcdFx0dHJlZS5jbG9zZUZpbmQoKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdsaXN0LnNjcm9sbFVwJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdC8vIFNpbmNlIHRoZSBkZWZhdWx0IGtleWJpbmRpbmdzIGZvciBsaXN0LnNjcm9sbFVwIGFuZCB3aWRnZXROYXZpZ2F0aW9uLmZvY3VzUHJldmlvdXNcblx0Ly8gYXJlIGJvdGggQ3RybCtVcEFycm93LCB3ZSBkaXNhYmxlIHRoaXMgY29tbWFuZCB3aGVuIHRoZSBzY3JvbGxiYXIgaXMgYXRcblx0Ly8gdG9wLW1vc3QgcG9zaXRpb24uIFRoaXMgd2lsbCBnaXZlIGNoYW5jZSBmb3Igd2lkZ2V0TmF2aWdhdGlvbi5mb2N1c1ByZXZpb3VzIHRvIGV4ZWN1dGVcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXksXG5cdFx0V29ya2JlbmNoTGlzdFNjcm9sbEF0VG9wQ29udGV4dEtleT8ubmVnYXRlKCkpLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuVXBBcnJvdyxcblx0aGFuZGxlcjogYWNjZXNzb3IgPT4ge1xuXHRcdGNvbnN0IGZvY3VzZWQgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3Q7XG5cblx0XHRpZiAoIWZvY3VzZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb2N1c2VkLnNjcm9sbFRvcCAtPSAxMDtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3Quc2Nyb2xsRG93bicsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHQvLyBzYW1lIGFzIGFib3ZlXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LFxuXHRcdFdvcmtiZW5jaExpc3RTY3JvbGxBdEJvdHRvbUNvbnRleHRLZXk/Lm5lZ2F0ZSgpKSxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvdyxcblx0aGFuZGxlcjogYWNjZXNzb3IgPT4ge1xuXHRcdGNvbnN0IGZvY3VzZWQgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3Q7XG5cblx0XHRpZiAoIWZvY3VzZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb2N1c2VkLnNjcm9sbFRvcCArPSAxMDtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3Quc2Nyb2xsTGVmdCcsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LFxuXHRoYW5kbGVyOiBhY2Nlc3NvciA9PiB7XG5cdFx0Y29uc3QgZm9jdXNlZCA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdDtcblxuXHRcdGlmICghZm9jdXNlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvY3VzZWQuc2Nyb2xsTGVmdCAtPSAxMDtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3Quc2Nyb2xsUmlnaHQnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSxcblx0aGFuZGxlcjogYWNjZXNzb3IgPT4ge1xuXHRcdGNvbnN0IGZvY3VzZWQgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3Q7XG5cblx0XHRpZiAoIWZvY3VzZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb2N1c2VkLnNjcm9sbExlZnQgKz0gMTA7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgVG9nZ2xlU3RpY2t5U2Nyb2xsIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAndHJlZS50b2dnbGVTdGlja3lTY3JvbGwnLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubG9jYWxpemUyKCd0b2dnbGVUcmVlU3RpY2t5U2Nyb2xsJywgXCJUb2dnbGUgVHJlZSBTdGlja3kgU2Nyb2xsXCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pdG9nZ2xlVHJlZVN0aWNreVNjcm9sbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlRvZ2dsZSBUcmVlIFN0aWNreSBTY3JvbGxcIiksXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6ICdWaWV3Jyxcblx0XHRcdG1ldGFkYXRhOiB7IGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndG9nZ2xlVHJlZVN0aWNreVNjcm9sbERlc2NyaXB0aW9uJywgXCJUb2dnbGVzIFN0aWNreSBTY3JvbGwgd2lkZ2V0IGF0IHRoZSB0b3Agb2YgdHJlZSBzdHJ1Y3R1cmVzIHN1Y2ggYXMgdGhlIEZpbGUgRXhwbG9yZXIgYW5kIERlYnVnIHZhcmlhYmxlcyBWaWV3LlwiKSB9LFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgbmV3VmFsdWUgPSAhY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ3dvcmtiZW5jaC50cmVlLmVuYWJsZVN0aWNreVNjcm9sbCcpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCd3b3JrYmVuY2gudHJlZS5lbmFibGVTdGlja3lTY3JvbGwnLCBuZXdWYWx1ZSk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxRQUFRLFNBQVMsZ0JBQWdCO0FBRTFDLFNBQVMscUJBQXFCLHdCQUF3QjtBQUN0RCxTQUFTLFlBQVk7QUFDckIsU0FBUyw4QkFBOEIsY0FBYyw0Q0FBd0Qsa0NBQWtDLDJCQUFnRCxrQ0FBa0MsaUNBQWlDLCtCQUErQiw4QkFBOEIsK0JBQStCLGlDQUFpQyx1QkFB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
