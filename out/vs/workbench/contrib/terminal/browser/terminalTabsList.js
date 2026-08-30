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
import { IListService, WorkbenchList } from "../../../../platform/list/browser/listService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { ITerminalConfigurationService, ITerminalGroupService, ITerminalService, ITerminalEditingService, TerminalDataTransfers } from "./terminal.js";
import { localize } from "../../../../nls.js";
import * as DOM from "../../../../base/browser/dom.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { MenuEntryActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { TerminalCommandId } from "../common/terminal.js";
import { TerminalLocation, TerminalSettingId } from "../../../../platform/terminal/common/terminal.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Action } from "../../../../base/common/actions.js";
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from "../../../browser/labels.js";
import { IDecorationsService } from "../../../services/decorations/common/decorations.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import Severity from "../../../../base/common/severity.js";
import { Disposable, DisposableStore, dispose, toDisposable } from "../../../../base/common/lifecycle.js";
import { ListDragOverEffectPosition, ListDragOverEffectType } from "../../../../base/browser/ui/list/list.js";
import { DataTransfers } from "../../../../base/browser/dnd.js";
import { disposableTimeout } from "../../../../base/common/async.js";
import { ElementsDragAndDropData, NativeDragAndDropData } from "../../../../base/browser/ui/list/listView.js";
import { URI } from "../../../../base/common/uri.js";
import { getColorClass, getIconId, getUriClasses } from "./terminalIcon.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { InputBox, MessageType } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { createSingleCallFunction } from "../../../../base/common/functional.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { CodeDataTransfers, containsDragType, getPathForFile } from "../../../../platform/dnd/browser/dnd.js";
import { terminalStrings } from "../common/terminalStrings.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
import { TerminalContextKeys } from "../common/terminalContextKey.js";
import { getTerminalResourcesFromDragEvent, parseTerminalUri } from "./terminalUri.js";
import { getInstanceHoverInfo } from "./terminalTooltip.js";
import { defaultInputBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { Emitter } from "../../../../base/common/event.js";
import { Schemas } from "../../../../base/common/network.js";
import { getColorForSeverity } from "./terminalStatusList.js";
import { TerminalContextActionRunner } from "./terminalContextMenu.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IStorageService, StorageScope } from "../../../../platform/storage/common/storage.js";
import { TerminalStorageKeys } from "../common/terminalStorageKeys.js";
import { isObject } from "../../../../base/common/types.js";
const $ = DOM.$;
var TerminalTabsListSizes = /* @__PURE__ */ ((TerminalTabsListSizes2) => {
  TerminalTabsListSizes2[TerminalTabsListSizes2["TabHeight"] = 22] = "TabHeight";
  TerminalTabsListSizes2[TerminalTabsListSizes2["NarrowViewWidth"] = 46] = "NarrowViewWidth";
  TerminalTabsListSizes2[TerminalTabsListSizes2["WideViewMinimumWidth"] = 80] = "WideViewMinimumWidth";
  TerminalTabsListSizes2[TerminalTabsListSizes2["DefaultWidth"] = 120] = "DefaultWidth";
  TerminalTabsListSizes2[TerminalTabsListSizes2["MidpointViewWidth"] = 63] = "MidpointViewWidth";
  TerminalTabsListSizes2[TerminalTabsListSizes2["ActionbarMinimumWidth"] = 105] = "ActionbarMinimumWidth";
  TerminalTabsListSizes2[TerminalTabsListSizes2["MaximumWidth"] = 500] = "MaximumWidth";
  return TerminalTabsListSizes2;
})(TerminalTabsListSizes || {});
let TerminalTabList = class extends WorkbenchList {
  constructor(container, contextKeyService, listService, _configurationService, _terminalService, _terminalGroupService, _terminalEditingService, instantiationService, decorationsService, _themeService, _storageService, lifecycleService, _hoverService) {
    super(
      "TerminalTabsList",
      container,
      {
        getHeight: () => 22 /* TabHeight */,
        getTemplateId: () => "terminal.tabs"
      },
      [instantiationService.createInstance(TerminalTabsRenderer, container, instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER), () => this.getSelectedElements(), {
        getHasText: () => this.hasText,
        getHasActionBar: () => this.hasActionBar
      })],
      {
        horizontalScrolling: false,
        supportDynamicHeights: false,
        selectionNavigation: true,
        identityProvider: {
          getId: (e) => e?.instanceId
        },
        accessibilityProvider: instantiationService.createInstance(TerminalTabsAccessibilityProvider),
        smoothScrolling: _configurationService.getValue("workbench.list.smoothScrolling"),
        multipleSelectionSupport: true,
        paddingBottom: 22 /* TabHeight */,
        dnd: instantiationService.createInstance(TerminalTabsDragAndDrop),
        openOnSingleClick: true
      },
      contextKeyService,
      listService,
      _configurationService,
      instantiationService
    );
    this._configurationService = _configurationService;
    this._terminalService = _terminalService;
    this._terminalGroupService = _terminalGroupService;
    this._terminalEditingService = _terminalEditingService;
    this._themeService = _themeService;
    this._storageService = _storageService;
    this._hoverService = _hoverService;
    this._hasText = true;
    this._hasActionBar = true;
    const instanceDisposables = [
      this._terminalGroupService.onDidChangeInstances(() => this.refresh()),
      this._terminalGroupService.onDidChangeGroups(() => this.refresh()),
      this._terminalGroupService.onDidShow(() => this.refresh()),
      this._terminalGroupService.onDidChangeInstanceCapability(() => this.refresh()),
      this._terminalService.onAnyInstanceTitleChange(() => this.refresh()),
      this._terminalService.onAnyInstanceIconChange(() => this.refresh()),
      this._terminalService.onAnyInstancePrimaryStatusChange(() => this.refresh()),
      this._terminalService.onDidChangeConnectionState(() => this.refresh()),
      this._themeService.onDidColorThemeChange(() => this.refresh()),
      this._terminalGroupService.onDidChangeActiveInstance((e) => {
        if (e) {
          const i = this._terminalGroupService.instances.indexOf(e);
          this.setSelection([i]);
          this.reveal(i);
        }
        this.refresh();
      }),
      this._storageService.onDidChangeValue(StorageScope.APPLICATION, TerminalStorageKeys.TabsShowDetailed, this.disposables)(() => this.refresh())
    ];
    this.disposables.add(lifecycleService.onWillShutdown((e) => {
      dispose(instanceDisposables);
      instanceDisposables.length = 0;
    }));
    this.disposables.add(toDisposable(() => {
      dispose(instanceDisposables);
      instanceDisposables.length = 0;
    }));
    this.disposables.add(this.onMouseDblClick(async (e) => {
      if (!e.element) {
        e.browserEvent.preventDefault();
        e.browserEvent.stopPropagation();
        const instance = await this._terminalService.createTerminal({ location: TerminalLocation.Panel });
        this._terminalGroupService.setActiveInstance(instance);
        await instance.focusWhenReady();
        return;
      }
      if (this._terminalEditingService.getEditingTerminal()?.instanceId === e.element.instanceId) {
        return;
      }
      if (this._getFocusMode() === "doubleClick" && this.getFocus().length === 1) {
        e.element.focus(true);
      }
    }));
    this.disposables.add(this.onMouseClick(async (e) => {
      if (this._terminalEditingService.getEditingTerminal()?.instanceId === e.element?.instanceId) {
        return;
      }
      if (e.browserEvent.altKey && e.element) {
        await this._terminalService.createTerminal({ location: { parentTerminal: e.element } });
      } else if (this._getFocusMode() === "singleClick") {
        if (this.getSelection().length <= 1) {
          e.element?.focus(true);
        }
      }
    }));
    this.disposables.add(this.onContextMenu((e) => {
      if (!e.element) {
        this.setSelection([]);
        return;
      }
      const selection = this.getSelectedElements();
      if (!selection || !selection.find((s) => e.element === s)) {
        this.setFocus(e.index !== void 0 ? [e.index] : []);
      }
    }));
    this._terminalTabsSingleSelectedContextKey = TerminalContextKeys.tabsSingularSelection.bindTo(contextKeyService);
    this._isSplitContextKey = TerminalContextKeys.splitTerminalTabFocused.bindTo(contextKeyService);
    this.disposables.add(this.onDidChangeSelection((e) => this._updateContextKey()));
    this.disposables.add(this.onDidChangeFocus(() => this._updateContextKey()));
    this.disposables.add(this.onDidOpen(async (e) => {
      const instance = e.element;
      if (!instance) {
        return;
      }
      this._terminalGroupService.setActiveInstance(instance);
      if (!e.editorOptions.preserveFocus) {
        await instance.focusWhenReady();
      }
    }));
    if (!this._decorationsProvider) {
      this._decorationsProvider = this.disposables.add(instantiationService.createInstance(TabDecorationsProvider));
      this.disposables.add(decorationsService.registerDecorationsProvider(this._decorationsProvider));
    }
    this.refresh();
  }
  get hasText() {
    return this._hasText;
  }
  get hasActionBar() {
    return this._hasActionBar;
  }
  _getFocusMode() {
    return this._configurationService.getValue(TerminalSettingId.TabsFocusMode);
  }
  refresh(cancelEditing = true) {
    if (cancelEditing && this._terminalEditingService.isEditable(void 0)) {
      this.domFocus();
    }
    this.splice(0, this.length, this._terminalGroupService.instances.slice());
  }
  focusHover() {
    const instance = this.getSelectedElements()[0];
    if (!instance) {
      return;
    }
    this._hoverService.showInstantHover({
      ...getInstanceHoverInfo(instance, this._storageService),
      target: this.getHTMLElement(),
      trapFocus: true
    }, true);
  }
  _updateContextKey() {
    this._terminalTabsSingleSelectedContextKey.set(this.getSelectedElements().length === 1);
    const instance = this.getFocusedElements();
    this._isSplitContextKey.set(instance.length > 0 && this._terminalGroupService.instanceIsSplit(instance[0]));
  }
  layout(height, width) {
    super.layout(height, width);
    const actualWidth = width ?? this.getHTMLElement().clientWidth;
    const newHasText = actualWidth >= 63 /* MidpointViewWidth */;
    const newHasActionBar = actualWidth > 105 /* ActionbarMinimumWidth */;
    if (this._hasText !== newHasText || this._hasActionBar !== newHasActionBar) {
      this._hasText = newHasText;
      this._hasActionBar = newHasActionBar;
      this.refresh();
    }
  }
};
TerminalTabList = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IListService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ITerminalService),
  __decorateParam(5, ITerminalGroupService),
  __decorateParam(6, ITerminalEditingService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IDecorationsService),
  __decorateParam(9, IThemeService),
  __decorateParam(10, IStorageService),
  __decorateParam(11, ILifecycleService),
  __decorateParam(12, IHoverService)
], TerminalTabList);
let TerminalTabsRenderer = class {
  constructor(_container, _labels, _getSelection, _getVisibilityState, _instantiationService, _terminalConfigurationService, _terminalService, _terminalGroupService, _terminalEditingService, _hoverService, _keybindingService, _listService, _storageService, _themeService, _contextViewService, _commandService) {
    this._labels = _labels;
    this._getSelection = _getSelection;
    this._getVisibilityState = _getVisibilityState;
    this._instantiationService = _instantiationService;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._terminalService = _terminalService;
    this._terminalGroupService = _terminalGroupService;
    this._terminalEditingService = _terminalEditingService;
    this._hoverService = _hoverService;
    this._keybindingService = _keybindingService;
    this._listService = _listService;
    this._storageService = _storageService;
    this._themeService = _themeService;
    this._contextViewService = _contextViewService;
    this._commandService = _commandService;
    this.templateId = "terminal.tabs";
  }
  renderTemplate(container) {
    const element = DOM.append(container, $(".terminal-tabs-entry"));
    const context = {};
    const templateDisposables = new DisposableStore();
    const label = templateDisposables.add(this._labels.create(element, {
      supportHighlights: true,
      supportDescriptionHighlights: true,
      supportIcons: true,
      hoverDelegate: {
        delay: 0,
        showHover: (options) => {
          return this._hoverService.showDelayedHover({
            ...options,
            actions: context.hoverActions,
            target: element,
            appearance: {
              showPointer: true
            },
            position: {
              hoverPosition: this._terminalConfigurationService.config.tabs.location === "left" ? HoverPosition.RIGHT : HoverPosition.LEFT
            }
          }, { groupId: "terminal-tabs-list" });
        }
      }
    }));
    const actionsContainer = DOM.append(label.element, $(".actions"));
    const actionBar = templateDisposables.add(new ActionBar(actionsContainer, {
      actionRunner: templateDisposables.add(new TerminalContextActionRunner()),
      actionViewItemProvider: (action, options) => action instanceof MenuItemAction ? templateDisposables.add(this._instantiationService.createInstance(MenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate })) : void 0
    }));
    return {
      element,
      label,
      actionBar,
      context,
      elementDisposables: new DisposableStore(),
      templateDisposables
    };
  }
  renderElement(instance, index, template) {
    const hasText = this._getVisibilityState.getHasText();
    const hasActionBar = this._getVisibilityState.getHasActionBar();
    const group = this._terminalGroupService.getGroupForInstance(instance);
    if (!group) {
      throw new Error(`Could not find group for instance "${instance.instanceId}"`);
    }
    template.element.classList.toggle("has-text", hasText);
    template.element.classList.toggle("is-active", this._terminalGroupService.activeInstance === instance);
    let prefix = "";
    if (group.terminalInstances.length > 1) {
      const terminalIndex = group.terminalInstances.indexOf(instance);
      if (terminalIndex === 0) {
        prefix = `\u250C `;
      } else if (terminalIndex === group.terminalInstances.length - 1) {
        prefix = `\u2514 `;
      } else {
        prefix = `\u251C `;
      }
    }
    const hoverInfo = getInstanceHoverInfo(instance, this._storageService);
    template.context.hoverActions = hoverInfo.actions;
    const iconId = this._instantiationService.invokeFunction(getIconId, instance);
    let label = "";
    if (!hasText) {
      const primaryStatus = instance.statusList.primary;
      if (primaryStatus && primaryStatus.severity > Severity.Ignore) {
        label = `${prefix}$(${primaryStatus.icon?.id || iconId})`;
      } else {
        label = `${prefix}$(${iconId})`;
      }
    } else {
      this.fillActionBar(instance, template);
      label = prefix;
      if (instance.icon) {
        label += `$(${iconId}) ${instance.title}`;
      }
    }
    if (!hasActionBar) {
      template.actionBar.clear();
    }
    template.elementDisposables.add(DOM.addDisposableListener(template.element, DOM.EventType.AUXCLICK, (e) => {
      e.stopImmediatePropagation();
      if (e.button === 1) {
        this._terminalService.safeDisposeTerminal(instance);
      }
    }));
    const extraClasses = [];
    const colorClass = getColorClass(instance);
    if (colorClass) {
      extraClasses.push(colorClass);
    }
    const uriClasses = getUriClasses(instance, this._themeService.getColorTheme().type);
    if (uriClasses) {
      extraClasses.push(...uriClasses);
    }
    template.label.setResource({
      resource: instance.resource,
      name: label,
      description: hasText ? instance.description : void 0
    }, {
      fileDecorations: {
        colors: true,
        badges: hasText
      },
      title: {
        markdown: hoverInfo.content,
        markdownNotSupportedFallback: void 0
      },
      extraClasses
    });
    const editableData = this._terminalEditingService.getEditableData(instance);
    template.label.element.classList.toggle("editable-tab", !!editableData);
    if (editableData) {
      template.elementDisposables.add(this._renderInputBox(template.label.element.querySelector(".monaco-icon-label-container"), instance, editableData));
      template.actionBar.clear();
    }
  }
  _renderInputBox(container, instance, editableData) {
    const value = instance.title || "";
    const inputBox = new InputBox(container, this._contextViewService, {
      validationOptions: {
        validation: (value2) => {
          const message = editableData.validationMessage(value2);
          if (!message || message.severity !== Severity.Error) {
            return null;
          }
          return {
            content: message.content,
            formatContent: true,
            type: MessageType.ERROR
          };
        }
      },
      ariaLabel: localize("terminalInputAriaLabel", "Type terminal name. Press Enter to confirm or Escape to cancel."),
      inputBoxStyles: defaultInputBoxStyles
    });
    inputBox.element.style.height = "22px";
    inputBox.value = value;
    inputBox.focus();
    inputBox.select({ start: 0, end: value.length });
    const done = createSingleCallFunction((success, finishEditing) => {
      inputBox.element.style.display = "none";
      const value2 = inputBox.value;
      dispose(toDispose);
      inputBox.element.remove();
      if (finishEditing) {
        editableData.onFinish(value2, success);
      }
    });
    const showInputBoxNotification = () => {
      if (inputBox.isInputValid()) {
        const message = editableData.validationMessage(inputBox.value);
        if (message) {
          inputBox.showMessage({
            content: message.content,
            formatContent: true,
            type: message.severity === Severity.Info ? MessageType.INFO : message.severity === Severity.Warning ? MessageType.WARNING : MessageType.ERROR
          });
        } else {
          inputBox.hideMessage();
        }
      }
    };
    showInputBoxNotification();
    const toDispose = [
      inputBox,
      DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_DOWN, (e) => {
        e.stopPropagation();
        if (e.equals(KeyCode.Enter)) {
          done(inputBox.isInputValid(), true);
        } else if (e.equals(KeyCode.Escape)) {
          done(false, true);
        }
      }),
      DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_UP, (e) => {
        showInputBoxNotification();
      }),
      DOM.addDisposableListener(inputBox.inputElement, DOM.EventType.BLUR, () => {
        done(inputBox.isInputValid(), true);
      })
    ];
    return toDisposable(() => {
      done(false, false);
    });
  }
  disposeElement(instance, index, templateData) {
    templateData.elementDisposables.clear();
    templateData.actionBar.clear();
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.templateDisposables.dispose();
  }
  fillActionBar(instance, template) {
    const actions = [
      template.elementDisposables.add(new Action(TerminalCommandId.SplitActiveTab, terminalStrings.split.short, ThemeIcon.asClassName(Codicon.splitHorizontal), true, async () => {
        this._runForSelectionOrInstance(instance, async (e) => {
          this._terminalService.createTerminal({ location: { parentTerminal: e } });
        });
      }))
    ];
    if (instance.shellLaunchConfig.tabActions) {
      for (const action of instance.shellLaunchConfig.tabActions) {
        actions.push(template.elementDisposables.add(new Action(action.id, action.label, action.icon ? ThemeIcon.asClassName(action.icon) : void 0, true, async () => {
          this._runForSelectionOrInstance(instance, (e) => this._commandService.executeCommand(action.id, instance));
        })));
      }
    }
    actions.push(template.elementDisposables.add(new Action(TerminalCommandId.KillActiveTab, terminalStrings.kill.short, ThemeIcon.asClassName(Codicon.trashcan), true, async () => {
      this._runForSelectionOrInstance(instance, (e) => this._terminalService.safeDisposeTerminal(e));
    })));
    template.actionBar.clear();
    for (const action of actions) {
      template.actionBar.push(action, { icon: true, label: false, keybinding: this._keybindingService.lookupKeybinding(action.id)?.getLabel() });
    }
  }
  _runForSelectionOrInstance(instance, callback) {
    const selection = this._getSelection();
    if (selection.includes(instance)) {
      for (const s of selection) {
        if (s) {
          callback(s);
        }
      }
    } else {
      callback(instance);
    }
    this._terminalGroupService.focusTabs();
    this._listService.lastFocusedList?.focusNext();
  }
};
TerminalTabsRenderer = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ITerminalConfigurationService),
  __decorateParam(6, ITerminalService),
  __decorateParam(7, ITerminalGroupService),
  __decorateParam(8, ITerminalEditingService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IKeybindingService),
  __decorateParam(11, IListService),
  __decorateParam(12, IStorageService),
  __decorateParam(13, IThemeService),
  __decorateParam(14, IContextViewService),
  __decorateParam(15, ICommandService)
], TerminalTabsRenderer);
let TerminalTabsAccessibilityProvider = class {
  constructor(_terminalGroupService) {
    this._terminalGroupService = _terminalGroupService;
  }
  getWidgetAriaLabel() {
    return localize("terminal.tabs", "Terminal tabs");
  }
  getAriaLabel(instance) {
    let ariaLabel = "";
    const tab = this._terminalGroupService.getGroupForInstance(instance);
    if (tab && tab.terminalInstances?.length > 1) {
      const terminalIndex = tab.terminalInstances.indexOf(instance);
      ariaLabel = localize({
        key: "splitTerminalAriaLabel",
        comment: [
          `The terminal's ID`,
          `The terminal's title`,
          `The terminal's split number`,
          `The terminal group's total split number`
        ]
      }, "Terminal {0} {1}, split {2} of {3}", instance.instanceId, instance.title, terminalIndex + 1, tab.terminalInstances.length);
    } else {
      ariaLabel = localize({
        key: "terminalAriaLabel",
        comment: [
          `The terminal's ID`,
          `The terminal's title`
        ]
      }, "Terminal {0} {1}", instance.instanceId, instance.title);
    }
    return ariaLabel;
  }
};
TerminalTabsAccessibilityProvider = __decorateClass([
  __decorateParam(0, ITerminalGroupService)
], TerminalTabsAccessibilityProvider);
let TerminalTabsDragAndDrop = class extends Disposable {
  constructor(_terminalService, _terminalGroupService, _terminalEditingService, _listService) {
    super();
    this._terminalService = _terminalService;
    this._terminalGroupService = _terminalGroupService;
    this._terminalEditingService = _terminalEditingService;
    this._listService = _listService;
    this._autoFocusDisposable = Disposable.None;
    this._primaryBackend = this._terminalService.getPrimaryBackend();
  }
  getDragURI(instance) {
    if (this._terminalEditingService.getEditingTerminal()?.instanceId === instance.instanceId) {
      return null;
    }
    return instance.resource.toString();
  }
  getDragLabel(elements, originalEvent) {
    return elements.length === 1 ? elements[0].title : void 0;
  }
  onDragLeave() {
    this._autoFocusInstance = void 0;
    this._autoFocusDisposable.dispose();
    this._autoFocusDisposable = Disposable.None;
  }
  onDragStart(data, originalEvent) {
    if (!originalEvent.dataTransfer) {
      return;
    }
    const dndData = data.getData();
    if (!Array.isArray(dndData)) {
      return;
    }
    const terminals = dndData.filter(isTerminalInstance);
    if (terminals.length > 0) {
      originalEvent.dataTransfer.setData(TerminalDataTransfers.Terminals, JSON.stringify(terminals.map((e) => e.resource.toString())));
    }
  }
  onDragOver(data, targetInstance, targetIndex, targetSector, originalEvent) {
    if (data instanceof NativeDragAndDropData) {
      if (!containsDragType(originalEvent, DataTransfers.FILES, DataTransfers.RESOURCES, TerminalDataTransfers.Terminals, CodeDataTransfers.FILES)) {
        return false;
      }
    }
    const didChangeAutoFocusInstance = this._autoFocusInstance !== targetInstance;
    if (didChangeAutoFocusInstance) {
      this._autoFocusDisposable.dispose();
      this._autoFocusInstance = targetInstance;
    }
    if (!targetInstance && !containsDragType(originalEvent, TerminalDataTransfers.Terminals)) {
      return data instanceof ElementsDragAndDropData;
    }
    if (didChangeAutoFocusInstance && targetInstance) {
      this._autoFocusDisposable = disposableTimeout(() => {
        this._terminalService.setActiveInstance(targetInstance);
        this._autoFocusInstance = void 0;
      }, 500, this._store);
    }
    return {
      feedback: targetIndex ? [targetIndex] : void 0,
      accept: true,
      effect: { type: ListDragOverEffectType.Move, position: ListDragOverEffectPosition.Over }
    };
  }
  async drop(data, targetInstance, targetIndex, targetSector, originalEvent) {
    this._autoFocusDisposable.dispose();
    this._autoFocusInstance = void 0;
    let sourceInstances;
    const promises = [];
    const resources = getTerminalResourcesFromDragEvent(originalEvent);
    if (resources) {
      for (const uri of resources) {
        const instance = this._terminalService.getInstanceFromResource(uri);
        if (instance) {
          if (Array.isArray(sourceInstances)) {
            sourceInstances.push(instance);
          } else {
            sourceInstances = [instance];
          }
          this._terminalService.moveToTerminalView(instance);
        } else if (this._primaryBackend) {
          const terminalIdentifier = parseTerminalUri(uri);
          if (terminalIdentifier.instanceId) {
            promises.push(this._primaryBackend.requestDetachInstance(terminalIdentifier.workspaceId, terminalIdentifier.instanceId));
          }
        }
      }
    }
    if (promises.length) {
      let processes = await Promise.all(promises);
      processes = processes.filter((p) => p !== void 0);
      let lastInstance;
      for (const attachPersistentProcess of processes) {
        lastInstance = await this._terminalService.createTerminal({ config: { attachPersistentProcess } });
      }
      if (lastInstance) {
        this._terminalService.setActiveInstance(lastInstance);
      }
      return;
    }
    if (sourceInstances === void 0) {
      if (!(data instanceof ElementsDragAndDropData)) {
        this._handleExternalDrop(targetInstance, originalEvent);
        return;
      }
      const draggedElement = data.getData();
      if (!draggedElement || !Array.isArray(draggedElement)) {
        return;
      }
      sourceInstances = [];
      for (const e of draggedElement) {
        if (isTerminalInstance(e)) {
          sourceInstances.push(e);
        }
      }
    }
    if (!targetInstance) {
      this._terminalGroupService.moveGroupToEnd(sourceInstances);
      this._terminalService.setActiveInstance(sourceInstances[0]);
      const targetGroup2 = this._terminalGroupService.getGroupForInstance(sourceInstances[0]);
      if (targetGroup2) {
        const index = this._terminalGroupService.groups.indexOf(targetGroup2);
        this._listService.lastFocusedList?.setSelection([index]);
      }
      return;
    }
    this._terminalGroupService.moveGroup(sourceInstances, targetInstance);
    this._terminalService.setActiveInstance(sourceInstances[0]);
    const targetGroup = this._terminalGroupService.getGroupForInstance(sourceInstances[0]);
    if (targetGroup) {
      const index = this._terminalGroupService.groups.indexOf(targetGroup);
      this._listService.lastFocusedList?.setSelection([index]);
    }
  }
  async _handleExternalDrop(instance, e) {
    if (!instance || !e.dataTransfer) {
      return;
    }
    let resource;
    const rawResources = e.dataTransfer.getData(DataTransfers.RESOURCES);
    if (rawResources) {
      resource = URI.parse(JSON.parse(rawResources)[0]);
    }
    const rawCodeFiles = e.dataTransfer.getData(CodeDataTransfers.FILES);
    if (!resource && rawCodeFiles) {
      resource = URI.file(JSON.parse(rawCodeFiles)[0]);
    }
    if (!resource && e.dataTransfer.files.length > 0 && getPathForFile(e.dataTransfer.files[0])) {
      resource = URI.file(getPathForFile(e.dataTransfer.files[0]));
    }
    if (!resource) {
      return;
    }
    this._terminalService.setActiveInstance(instance);
    instance.focus();
    await instance.sendPath(resource, false);
  }
};
TerminalTabsDragAndDrop = __decorateClass([
  __decorateParam(0, ITerminalService),
  __decorateParam(1, ITerminalGroupService),
  __decorateParam(2, ITerminalEditingService),
  __decorateParam(3, IListService)
], TerminalTabsDragAndDrop);
let TabDecorationsProvider = class extends Disposable {
  constructor(_terminalService) {
    super();
    this._terminalService = _terminalService;
    this.label = localize("label", "Terminal");
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._register(this._terminalService.onAnyInstancePrimaryStatusChange((e) => this._onDidChange.fire([e.resource])));
  }
  provideDecorations(resource) {
    if (resource.scheme !== Schemas.vscodeTerminal) {
      return void 0;
    }
    const instance = this._terminalService.getInstanceFromResource(resource);
    if (!instance) {
      return void 0;
    }
    const primaryStatus = instance?.statusList?.primary;
    if (!primaryStatus?.icon) {
      return void 0;
    }
    return {
      color: getColorForSeverity(primaryStatus.severity),
      letter: primaryStatus.icon,
      tooltip: primaryStatus.tooltip
    };
  }
};
TabDecorationsProvider = __decorateClass([
  __decorateParam(0, ITerminalService)
], TabDecorationsProvider);
function isTerminalInstance(obj) {
  return isObject(obj) && "instanceId" in obj;
}
export {
  TerminalTabList,
  TerminalTabsListSizes
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxicm93c2VyXFx0ZXJtaW5hbFRhYnNMaXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUxpc3RTZXJ2aWNlLCBXb3JrYmVuY2hMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJVGVybWluYWxHcm91cFNlcnZpY2UsIElUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxTZXJ2aWNlLCBJVGVybWluYWxFZGl0aW5nU2VydmljZSwgVGVybWluYWxEYXRhVHJhbnNmZXJzIH0gZnJvbSAnLi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IE1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBNZW51RW50cnlBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbW1hbmRJZCB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxCYWNrZW5kLCBUZXJtaW5hbExvY2F0aW9uLCBUZXJtaW5hbFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0xBQkVMU19DT05UQUlORVIsIElSZXNvdXJjZUxhYmVsLCBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IElEZWNvcmF0aW9uRGF0YSwgSURlY29yYXRpb25zUHJvdmlkZXIsIElEZWNvcmF0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9kZWNvcmF0aW9ucy9jb21tb24vZGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTGlzdERyYWdBbmREcm9wLCBJTGlzdERyYWdPdmVyUmVhY3Rpb24sIElMaXN0UmVuZGVyZXIsIExpc3REcmFnT3ZlckVmZmVjdFBvc2l0aW9uLCBMaXN0RHJhZ092ZXJFZmZlY3RUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBEYXRhVHJhbnNmZXJzLCBJRHJhZ0FuZERyb3BEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhLCBMaXN0Vmlld1RhcmdldFNlY3RvciwgTmF0aXZlRHJhZ0FuZERyb3BEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFZpZXcuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdldENvbG9yQ2xhc3MsIGdldEljb25JZCwgZ2V0VXJpQ2xhc3NlcyB9IGZyb20gJy4vdGVybWluYWxJY29uLmpzJztcbmltcG9ydCB7IElFZGl0YWJsZURhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSW5wdXRCb3gsIE1lc3NhZ2VUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2lucHV0Ym94L2lucHV0Qm94LmpzJztcbmltcG9ydCB7IGNyZWF0ZVNpbmdsZUNhbGxGdW5jdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Z1bmN0aW9uYWwuanMnO1xuaW1wb3J0IHsgSUtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgQ29kZURhdGFUcmFuc2ZlcnMsIGNvbnRhaW5zRHJhZ1R5cGUsIGdldFBhdGhGb3JGaWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZG5kL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IHRlcm1pbmFsU3RyaW5ncyB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbFN0cmluZ3MuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJUHJvY2Vzc0RldGFpbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWxQcm9jZXNzLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWxDb250ZXh0S2V5LmpzJztcbmltcG9ydCB7IGdldFRlcm1pbmFsUmVzb3VyY2VzRnJvbURyYWdFdmVudCwgcGFyc2VUZXJtaW5hbFVyaSB9IGZyb20gJy4vdGVybWluYWxVcmkuanMnO1xuaW1wb3J0IHsgZ2V0SW5zdGFuY2VIb3ZlckluZm8gfSBmcm9tICcuL3Rlcm1pbmFsVG9vbHRpcC5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0SW5wdXRCb3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGdldENvbG9yRm9yU2V2ZXJpdHkgfSBmcm9tICcuL3Rlcm1pbmFsU3RhdHVzTGlzdC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbnRleHRBY3Rpb25SdW5uZXIgfSBmcm9tICcuL3Rlcm1pbmFsQ29udGV4dE1lbnUuanMnO1xuaW1wb3J0IHR5cGUgeyBJSG92ZXJBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSG92ZXJQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsU3RvcmFnZUtleXMgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWxTdG9yYWdlS2V5cy5qcyc7XG5pbXBvcnQgeyBpc09iamVjdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG5leHBvcnQgY29uc3QgZW51bSBUZXJtaW5hbFRhYnNMaXN0U2l6ZXMge1xuXHRUYWJIZWlnaHQgPSAyMixcblx0TmFycm93Vmlld1dpZHRoID0gNDYsXG5cdFdpZGVWaWV3TWluaW11bVdpZHRoID0gODAsXG5cdERlZmF1bHRXaWR0aCA9IDEyMCxcblx0TWlkcG9pbnRWaWV3V2lkdGggPSAoVGVybWluYWxUYWJzTGlzdFNpemVzLk5hcnJvd1ZpZXdXaWR0aCArIFRlcm1pbmFsVGFic0xpc3RTaXplcy5XaWRlVmlld01pbmltdW1XaWR0aCkgLyAyLFxuXHRBY3Rpb25iYXJNaW5pbXVtV2lkdGggPSAxMDUsXG5cdE1heGltdW1XaWR0aCA9IDUwMFxufVxuXG5leHBvcnQgY2xhc3MgVGVybWluYWxUYWJMaXN0IGV4dGVuZHMgV29ya2JlbmNoTGlzdDxJVGVybWluYWxJbnN0YW5jZT4ge1xuXHRwcml2YXRlIF9kZWNvcmF0aW9uc1Byb3ZpZGVyOiBUYWJEZWNvcmF0aW9uc1Byb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF90ZXJtaW5hbFRhYnNTaW5nbGVTZWxlY3RlZENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF9pc1NwbGl0Q29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSBfaGFzVGV4dDogYm9vbGVhbiA9IHRydWU7XG5cdGdldCBoYXNUZXh0KCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faGFzVGV4dDsgfVxuXG5cdHByaXZhdGUgX2hhc0FjdGlvbkJhcjogYm9vbGVhbiA9IHRydWU7XG5cdGdldCBoYXNBY3Rpb25CYXIoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9oYXNBY3Rpb25CYXI7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxpc3RTZXJ2aWNlIGxpc3RTZXJ2aWNlOiBJTGlzdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0XHRASVRlcm1pbmFsR3JvdXBTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlOiBJVGVybWluYWxHcm91cFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbEVkaXRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsRWRpdGluZ1NlcnZpY2U6IElUZXJtaW5hbEVkaXRpbmdTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASURlY29yYXRpb25zU2VydmljZSBkZWNvcmF0aW9uc1NlcnZpY2U6IElEZWNvcmF0aW9uc1NlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcignVGVybWluYWxUYWJzTGlzdCcsIGNvbnRhaW5lcixcblx0XHRcdHtcblx0XHRcdFx0Z2V0SGVpZ2h0OiAoKSA9PiBUZXJtaW5hbFRhYnNMaXN0U2l6ZXMuVGFiSGVpZ2h0LFxuXHRcdFx0XHRnZXRUZW1wbGF0ZUlkOiAoKSA9PiAndGVybWluYWwudGFicydcblx0XHRcdH0sXG5cdFx0XHRbaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxUYWJzUmVuZGVyZXIsIGNvbnRhaW5lciwgaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbHMsIERFRkFVTFRfTEFCRUxTX0NPTlRBSU5FUiksICgpID0+IHRoaXMuZ2V0U2VsZWN0ZWRFbGVtZW50cygpLCB7XG5cdFx0XHRcdGdldEhhc1RleHQ6ICgpID0+IHRoaXMuaGFzVGV4dCxcblx0XHRcdFx0Z2V0SGFzQWN0aW9uQmFyOiAoKSA9PiB0aGlzLmhhc0FjdGlvbkJhclxuXHRcdFx0fSldLFxuXHRcdFx0e1xuXHRcdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSxcblx0XHRcdFx0c3VwcG9ydER5bmFtaWNIZWlnaHRzOiBmYWxzZSxcblx0XHRcdFx0c2VsZWN0aW9uTmF2aWdhdGlvbjogdHJ1ZSxcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldElkOiBlID0+IGU/Lmluc3RhbmNlSWRcblx0XHRcdFx0fSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFRhYnNBY2Nlc3NpYmlsaXR5UHJvdmlkZXIpLFxuXHRcdFx0XHRzbW9vdGhTY3JvbGxpbmc6IF9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignd29ya2JlbmNoLmxpc3Quc21vb3RoU2Nyb2xsaW5nJyksXG5cdFx0XHRcdG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogdHJ1ZSxcblx0XHRcdFx0cGFkZGluZ0JvdHRvbTogVGVybWluYWxUYWJzTGlzdFNpemVzLlRhYkhlaWdodCxcblx0XHRcdFx0ZG5kOiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFRhYnNEcmFnQW5kRHJvcCksXG5cdFx0XHRcdG9wZW5PblNpbmdsZUNsaWNrOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRsaXN0U2VydmljZSxcblx0XHRcdF9jb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdCk7XG5cblx0XHRjb25zdCBpbnN0YW5jZURpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdID0gW1xuXHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uub25EaWRDaGFuZ2VJbnN0YW5jZXMoKCkgPT4gdGhpcy5yZWZyZXNoKCkpLFxuXHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uub25EaWRDaGFuZ2VHcm91cHMoKCkgPT4gdGhpcy5yZWZyZXNoKCkpLFxuXHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uub25EaWRTaG93KCgpID0+IHRoaXMucmVmcmVzaCgpKSxcblx0XHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLm9uRGlkQ2hhbmdlSW5zdGFuY2VDYXBhYmlsaXR5KCgpID0+IHRoaXMucmVmcmVzaCgpKSxcblx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkFueUluc3RhbmNlVGl0bGVDaGFuZ2UoKCkgPT4gdGhpcy5yZWZyZXNoKCkpLFxuXHRcdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLm9uQW55SW5zdGFuY2VJY29uQ2hhbmdlKCgpID0+IHRoaXMucmVmcmVzaCgpKSxcblx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkFueUluc3RhbmNlUHJpbWFyeVN0YXR1c0NoYW5nZSgoKSA9PiB0aGlzLnJlZnJlc2goKSksXG5cdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uub25EaWRDaGFuZ2VDb25uZWN0aW9uU3RhdGUoKCkgPT4gdGhpcy5yZWZyZXNoKCkpLFxuXHRcdFx0dGhpcy5fdGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSgoKSA9PiB0aGlzLnJlZnJlc2goKSksXG5cdFx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5vbkRpZENoYW5nZUFjdGl2ZUluc3RhbmNlKGUgPT4ge1xuXHRcdFx0XHRpZiAoZSkge1xuXHRcdFx0XHRcdGNvbnN0IGkgPSB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5pbnN0YW5jZXMuaW5kZXhPZihlKTtcblx0XHRcdFx0XHR0aGlzLnNldFNlbGVjdGlvbihbaV0pO1xuXHRcdFx0XHRcdHRoaXMucmV2ZWFsKGkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMucmVmcmVzaCgpO1xuXHRcdFx0fSksXG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgVGVybWluYWxTdG9yYWdlS2V5cy5UYWJzU2hvd0RldGFpbGVkLCB0aGlzLmRpc3Bvc2FibGVzKSgoKSA9PiB0aGlzLnJlZnJlc2goKSksXG5cdFx0XTtcblxuXHRcdC8vIERpc3Bvc2Ugb2YgaW5zdGFuY2UgbGlzdGVuZXJzIG9uIHNodXRkb3duIHRvIGF2b2lkIGV4dHJhIHdvcmsgYW5kIHNvIHRhYnMgZG9uJ3QgZGlzYXBwZWFyXG5cdFx0Ly8gYnJpZWZseVxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGxpZmVjeWNsZVNlcnZpY2Uub25XaWxsU2h1dGRvd24oZSA9PiB7XG5cdFx0XHRkaXNwb3NlKGluc3RhbmNlRGlzcG9zYWJsZXMpO1xuXHRcdFx0aW5zdGFuY2VEaXNwb3NhYmxlcy5sZW5ndGggPSAwO1xuXHRcdH0pKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0ZGlzcG9zZShpbnN0YW5jZURpc3Bvc2FibGVzKTtcblx0XHRcdGluc3RhbmNlRGlzcG9zYWJsZXMubGVuZ3RoID0gMDtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLm9uTW91c2VEYmxDbGljayhhc3luYyBlID0+IHtcblx0XHRcdGlmICghZS5lbGVtZW50KSB7XG5cdFx0XHRcdGUuYnJvd3NlckV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuYnJvd3NlckV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRjb25zdCBpbnN0YW5jZSA9IGF3YWl0IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5jcmVhdGVUZXJtaW5hbCh7IGxvY2F0aW9uOiBUZXJtaW5hbExvY2F0aW9uLlBhbmVsIH0pO1xuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0XHRcdGF3YWl0IGluc3RhbmNlLmZvY3VzV2hlblJlYWR5KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX3Rlcm1pbmFsRWRpdGluZ1NlcnZpY2UuZ2V0RWRpdGluZ1Rlcm1pbmFsKCk/Lmluc3RhbmNlSWQgPT09IGUuZWxlbWVudC5pbnN0YW5jZUlkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX2dldEZvY3VzTW9kZSgpID09PSAnZG91YmxlQ2xpY2snICYmIHRoaXMuZ2V0Rm9jdXMoKS5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0ZS5lbGVtZW50LmZvY3VzKHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIG9uIGxlZnQgY2xpY2ssIGlmIGZvY3VzIG1vZGUgPSBzaW5nbGUgY2xpY2ssIGZvY3VzIHRoZSBlbGVtZW50XG5cdFx0Ly8gdW5sZXNzIG11bHRpLXNlbGVjdGlvbiBpcyBpbiBwcm9ncmVzc1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMub25Nb3VzZUNsaWNrKGFzeW5jIGUgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3Rlcm1pbmFsRWRpdGluZ1NlcnZpY2UuZ2V0RWRpdGluZ1Rlcm1pbmFsKCk/Lmluc3RhbmNlSWQgPT09IGUuZWxlbWVudD8uaW5zdGFuY2VJZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLmJyb3dzZXJFdmVudC5hbHRLZXkgJiYgZS5lbGVtZW50KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5jcmVhdGVUZXJtaW5hbCh7IGxvY2F0aW9uOiB7IHBhcmVudFRlcm1pbmFsOiBlLmVsZW1lbnQgfSB9KTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5fZ2V0Rm9jdXNNb2RlKCkgPT09ICdzaW5nbGVDbGljaycpIHtcblx0XHRcdFx0aWYgKHRoaXMuZ2V0U2VsZWN0aW9uKCkubGVuZ3RoIDw9IDEpIHtcblx0XHRcdFx0XHRlLmVsZW1lbnQ/LmZvY3VzKHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gb24gcmlnaHQgY2xpY2ssIHNldCB0aGUgZm9jdXMgdG8gdGhhdCBlbGVtZW50XG5cdFx0Ly8gdW5sZXNzIG11bHRpLXNlbGVjdGlvbiBpcyBpbiBwcm9ncmVzc1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMub25Db250ZXh0TWVudShlID0+IHtcblx0XHRcdGlmICghZS5lbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuc2V0U2VsZWN0aW9uKFtdKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5nZXRTZWxlY3RlZEVsZW1lbnRzKCk7XG5cdFx0XHRpZiAoIXNlbGVjdGlvbiB8fCAhc2VsZWN0aW9uLmZpbmQocyA9PiBlLmVsZW1lbnQgPT09IHMpKSB7XG5cdFx0XHRcdHRoaXMuc2V0Rm9jdXMoZS5pbmRleCAhPT0gdW5kZWZpbmVkID8gW2UuaW5kZXhdIDogW10pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3Rlcm1pbmFsVGFic1NpbmdsZVNlbGVjdGVkQ29udGV4dEtleSA9IFRlcm1pbmFsQ29udGV4dEtleXMudGFic1Npbmd1bGFyU2VsZWN0aW9uLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5faXNTcGxpdENvbnRleHRLZXkgPSBUZXJtaW5hbENvbnRleHRLZXlzLnNwbGl0VGVybWluYWxUYWJGb2N1c2VkLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLm9uRGlkQ2hhbmdlU2VsZWN0aW9uKGUgPT4gdGhpcy5fdXBkYXRlQ29udGV4dEtleSgpKSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5vbkRpZENoYW5nZUZvY3VzKCgpID0+IHRoaXMuX3VwZGF0ZUNvbnRleHRLZXkoKSkpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5vbkRpZE9wZW4oYXN5bmMgZSA9PiB7XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IGUuZWxlbWVudDtcblx0XHRcdGlmICghaW5zdGFuY2UpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0aWYgKCFlLmVkaXRvck9wdGlvbnMucHJlc2VydmVGb2N1cykge1xuXHRcdFx0XHRhd2FpdCBpbnN0YW5jZS5mb2N1c1doZW5SZWFkeSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRpZiAoIXRoaXMuX2RlY29yYXRpb25zUHJvdmlkZXIpIHtcblx0XHRcdHRoaXMuX2RlY29yYXRpb25zUHJvdmlkZXIgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUYWJEZWNvcmF0aW9uc1Byb3ZpZGVyKSk7XG5cdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChkZWNvcmF0aW9uc1NlcnZpY2UucmVnaXN0ZXJEZWNvcmF0aW9uc1Byb3ZpZGVyKHRoaXMuX2RlY29yYXRpb25zUHJvdmlkZXIpKTtcblx0XHR9XG5cdFx0dGhpcy5yZWZyZXNoKCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRGb2N1c01vZGUoKTogJ3NpbmdsZUNsaWNrJyB8ICdkb3VibGVDbGljaycge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnc2luZ2xlQ2xpY2snIHwgJ2RvdWJsZUNsaWNrJz4oVGVybWluYWxTZXR0aW5nSWQuVGFic0ZvY3VzTW9kZSk7XG5cdH1cblxuXHRyZWZyZXNoKGNhbmNlbEVkaXRpbmc6IGJvb2xlYW4gPSB0cnVlKTogdm9pZCB7XG5cdFx0aWYgKGNhbmNlbEVkaXRpbmcgJiYgdGhpcy5fdGVybWluYWxFZGl0aW5nU2VydmljZS5pc0VkaXRhYmxlKHVuZGVmaW5lZCkpIHtcblx0XHRcdHRoaXMuZG9tRm9jdXMoKTtcblx0XHR9XG5cblx0XHR0aGlzLnNwbGljZSgwLCB0aGlzLmxlbmd0aCwgdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuaW5zdGFuY2VzLnNsaWNlKCkpO1xuXHR9XG5cblx0Zm9jdXNIb3ZlcigpOiB2b2lkIHtcblx0XHRjb25zdCBpbnN0YW5jZSA9IHRoaXMuZ2V0U2VsZWN0ZWRFbGVtZW50cygpWzBdO1xuXHRcdGlmICghaW5zdGFuY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9ob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHQuLi5nZXRJbnN0YW5jZUhvdmVySW5mbyhpbnN0YW5jZSwgdGhpcy5fc3RvcmFnZVNlcnZpY2UpLFxuXHRcdFx0dGFyZ2V0OiB0aGlzLmdldEhUTUxFbGVtZW50KCksXG5cdFx0XHR0cmFwRm9jdXM6IHRydWVcblx0XHR9LCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUNvbnRleHRLZXkoKSB7XG5cdFx0dGhpcy5fdGVybWluYWxUYWJzU2luZ2xlU2VsZWN0ZWRDb250ZXh0S2V5LnNldCh0aGlzLmdldFNlbGVjdGVkRWxlbWVudHMoKS5sZW5ndGggPT09IDEpO1xuXHRcdGNvbnN0IGluc3RhbmNlID0gdGhpcy5nZXRGb2N1c2VkRWxlbWVudHMoKTtcblx0XHR0aGlzLl9pc1NwbGl0Q29udGV4dEtleS5zZXQoaW5zdGFuY2UubGVuZ3RoID4gMCAmJiB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5pbnN0YW5jZUlzU3BsaXQoaW5zdGFuY2VbMF0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGxheW91dChoZWlnaHQ/OiBudW1iZXIsIHdpZHRoPzogbnVtYmVyKTogdm9pZCB7XG5cdFx0c3VwZXIubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXHRcdGNvbnN0IGFjdHVhbFdpZHRoID0gd2lkdGggPz8gdGhpcy5nZXRIVE1MRWxlbWVudCgpLmNsaWVudFdpZHRoO1xuXHRcdGNvbnN0IG5ld0hhc1RleHQgPSBhY3R1YWxXaWR0aCA+PSBUZXJtaW5hbFRhYnNMaXN0U2l6ZXMuTWlkcG9pbnRWaWV3V2lkdGg7XG5cdFx0Y29uc3QgbmV3SGFzQWN0aW9uQmFyID0gYWN0dWFsV2lkdGggPiBUZXJtaW5hbFRhYnNMaXN0U2l6ZXMuQWN0aW9uYmFyTWluaW11bVdpZHRoO1xuXHRcdGlmICh0aGlzLl9oYXNUZXh0ICE9PSBuZXdIYXNUZXh0IHx8IHRoaXMuX2hhc0FjdGlvbkJhciAhPT0gbmV3SGFzQWN0aW9uQmFyKSB7XG5cdFx0XHR0aGlzLl9oYXNUZXh0ID0gbmV3SGFzVGV4dDtcblx0XHRcdHRoaXMuX2hhc0FjdGlvbkJhciA9IG5ld0hhc0FjdGlvbkJhcjtcblx0XHRcdHRoaXMucmVmcmVzaCgpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBUZXJtaW5hbFRhYnNSZW5kZXJlciBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8SVRlcm1pbmFsSW5zdGFuY2UsIElUZXJtaW5hbFRhYkVudHJ5VGVtcGxhdGU+IHtcblx0dGVtcGxhdGVJZCA9ICd0ZXJtaW5hbC50YWJzJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRfY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldFNlbGVjdGlvbjogKCkgPT4gSVRlcm1pbmFsSW5zdGFuY2VbXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXRWaXNpYmlsaXR5U3RhdGU6IElUZXJtaW5hbFRhYnNSZW5kZXJlck9wdGlvbnMsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbEdyb3VwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbEdyb3VwU2VydmljZTogSVRlcm1pbmFsR3JvdXBTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxFZGl0aW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbEVkaXRpbmdTZXJ2aWNlOiBJVGVybWluYWxFZGl0aW5nU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTGlzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGlzdFNlcnZpY2U6IElMaXN0U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElUZXJtaW5hbFRhYkVudHJ5VGVtcGxhdGUge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnRlcm1pbmFsLXRhYnMtZW50cnknKSk7XG5cdFx0Y29uc3QgY29udGV4dDogeyBob3ZlckFjdGlvbnM/OiBJSG92ZXJBY3Rpb25bXSB9ID0ge307XG5cdFx0Y29uc3QgdGVtcGxhdGVEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGxhYmVsID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQodGhpcy5fbGFiZWxzLmNyZWF0ZShlbGVtZW50LCB7XG5cdFx0XHRzdXBwb3J0SGlnaGxpZ2h0czogdHJ1ZSxcblx0XHRcdHN1cHBvcnREZXNjcmlwdGlvbkhpZ2hsaWdodHM6IHRydWUsXG5cdFx0XHRzdXBwb3J0SWNvbnM6IHRydWUsXG5cdFx0XHRob3ZlckRlbGVnYXRlOiB7XG5cdFx0XHRcdGRlbGF5OiAwLFxuXHRcdFx0XHRzaG93SG92ZXI6IG9wdGlvbnMgPT4ge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9ob3ZlclNlcnZpY2Uuc2hvd0RlbGF5ZWRIb3Zlcih7XG5cdFx0XHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRcdFx0YWN0aW9uczogY29udGV4dC5ob3ZlckFjdGlvbnMsXG5cdFx0XHRcdFx0XHR0YXJnZXQ6IGVsZW1lbnQsXG5cdFx0XHRcdFx0XHRhcHBlYXJhbmNlOiB7XG5cdFx0XHRcdFx0XHRcdHNob3dQb2ludGVyOiB0cnVlXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0cG9zaXRpb246IHtcblx0XHRcdFx0XHRcdFx0aG92ZXJQb3NpdGlvbjogdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcudGFicy5sb2NhdGlvbiA9PT0gJ2xlZnQnID8gSG92ZXJQb3NpdGlvbi5SSUdIVCA6IEhvdmVyUG9zaXRpb24uTEVGVFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sIHsgZ3JvdXBJZDogJ3Rlcm1pbmFsLXRhYnMtbGlzdCcgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gRE9NLmFwcGVuZChsYWJlbC5lbGVtZW50LCAkKCcuYWN0aW9ucycpKTtcblxuXG5cblx0XHRjb25zdCBhY3Rpb25CYXIgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uQmFyKGFjdGlvbnNDb250YWluZXIsIHtcblx0XHRcdGFjdGlvblJ1bm5lcjogdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQobmV3IFRlcm1pbmFsQ29udGV4dEFjdGlvblJ1bm5lcigpKSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+XG5cdFx0XHRcdGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uXG5cdFx0XHRcdFx0PyB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51RW50cnlBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB7IGhvdmVyRGVsZWdhdGU6IG9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSB9KSlcblx0XHRcdFx0XHQ6IHVuZGVmaW5lZFxuXHRcdH0pKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRlbGVtZW50LFxuXHRcdFx0bGFiZWwsXG5cdFx0XHRhY3Rpb25CYXIsXG5cdFx0XHRjb250ZXh0LFxuXHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzOiBuZXcgRGlzcG9zYWJsZVN0b3JlKCksXG5cdFx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzXG5cdFx0fTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlLCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZTogSVRlcm1pbmFsVGFiRW50cnlUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGhhc1RleHQgPSB0aGlzLl9nZXRWaXNpYmlsaXR5U3RhdGUuZ2V0SGFzVGV4dCgpO1xuXHRcdGNvbnN0IGhhc0FjdGlvbkJhciA9IHRoaXMuX2dldFZpc2liaWxpdHlTdGF0ZS5nZXRIYXNBY3Rpb25CYXIoKTtcblxuXHRcdGNvbnN0IGdyb3VwID0gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuZ2V0R3JvdXBGb3JJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0aWYgKCFncm91cCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgZmluZCBncm91cCBmb3IgaW5zdGFuY2UgXCIke2luc3RhbmNlLmluc3RhbmNlSWR9XCJgKTtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZS5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2hhcy10ZXh0JywgaGFzVGV4dCk7XG5cdFx0dGVtcGxhdGUuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdpcy1hY3RpdmUnLCB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5hY3RpdmVJbnN0YW5jZSA9PT0gaW5zdGFuY2UpO1xuXG5cdFx0bGV0IHByZWZpeDogc3RyaW5nID0gJyc7XG5cdFx0aWYgKGdyb3VwLnRlcm1pbmFsSW5zdGFuY2VzLmxlbmd0aCA+IDEpIHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsSW5kZXggPSBncm91cC50ZXJtaW5hbEluc3RhbmNlcy5pbmRleE9mKGluc3RhbmNlKTtcblx0XHRcdGlmICh0ZXJtaW5hbEluZGV4ID09PSAwKSB7XG5cdFx0XHRcdHByZWZpeCA9IGBcdTI1MEMgYDtcblx0XHRcdH0gZWxzZSBpZiAodGVybWluYWxJbmRleCA9PT0gZ3JvdXAudGVybWluYWxJbnN0YW5jZXMubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRwcmVmaXggPSBgXHUyNTE0IGA7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwcmVmaXggPSBgXHUyNTFDIGA7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgaG92ZXJJbmZvID0gZ2V0SW5zdGFuY2VIb3ZlckluZm8oaW5zdGFuY2UsIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlKTtcblx0XHR0ZW1wbGF0ZS5jb250ZXh0LmhvdmVyQWN0aW9ucyA9IGhvdmVySW5mby5hY3Rpb25zO1xuXG5cdFx0Y29uc3QgaWNvbklkID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZ2V0SWNvbklkLCBpbnN0YW5jZSk7XG5cdFx0bGV0IGxhYmVsOiBzdHJpbmcgPSAnJztcblx0XHRpZiAoIWhhc1RleHQpIHtcblx0XHRcdGNvbnN0IHByaW1hcnlTdGF0dXMgPSBpbnN0YW5jZS5zdGF0dXNMaXN0LnByaW1hcnk7XG5cdFx0XHQvLyBEb24ndCBzaG93IGlnbm9yZSBzZXZlcml0eVxuXHRcdFx0aWYgKHByaW1hcnlTdGF0dXMgJiYgcHJpbWFyeVN0YXR1cy5zZXZlcml0eSA+IFNldmVyaXR5Lklnbm9yZSkge1xuXHRcdFx0XHRsYWJlbCA9IGAke3ByZWZpeH0kKCR7cHJpbWFyeVN0YXR1cy5pY29uPy5pZCB8fCBpY29uSWR9KWA7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsYWJlbCA9IGAke3ByZWZpeH0kKCR7aWNvbklkfSlgO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmZpbGxBY3Rpb25CYXIoaW5zdGFuY2UsIHRlbXBsYXRlKTtcblx0XHRcdGxhYmVsID0gcHJlZml4O1xuXHRcdFx0Ly8gT25seSBhZGQgdGhlIHRpdGxlIGlmIHRoZSBpY29uIGlzIHNldCwgdGhpcyBwcmV2ZW50cyB0aGUgdGl0bGUganVtcGluZyBhcm91bmQgZm9yXG5cdFx0XHQvLyBleGFtcGxlIHdoZW4gbGF1bmNoaW5nIHdpdGggYSBTaGVsbExhdW5jaENvbmZpZy5uYW1lIGFuZCBubyBpY29uXG5cdFx0XHRpZiAoaW5zdGFuY2UuaWNvbikge1xuXHRcdFx0XHRsYWJlbCArPSBgJCgke2ljb25JZH0pICR7aW5zdGFuY2UudGl0bGV9YDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWhhc0FjdGlvbkJhcikge1xuXHRcdFx0dGVtcGxhdGUuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0fVxuXG5cdFx0Ly8gS2lsbCB0ZXJtaW5hbCBvbiBtaWRkbGUgY2xpY2tcblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGVtcGxhdGUuZWxlbWVudCwgRE9NLkV2ZW50VHlwZS5BVVhDTElDSywgZSA9PiB7XG5cdFx0XHRlLnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO1xuXHRcdFx0aWYgKGUuYnV0dG9uID09PSAxLyptaWRkbGUqLykge1xuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2FmZURpc3Bvc2VUZXJtaW5hbChpbnN0YW5jZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZXh0cmFDbGFzc2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbG9yQ2xhc3MgPSBnZXRDb2xvckNsYXNzKGluc3RhbmNlKTtcblx0XHRpZiAoY29sb3JDbGFzcykge1xuXHRcdFx0ZXh0cmFDbGFzc2VzLnB1c2goY29sb3JDbGFzcyk7XG5cdFx0fVxuXHRcdGNvbnN0IHVyaUNsYXNzZXMgPSBnZXRVcmlDbGFzc2VzKGluc3RhbmNlLCB0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLnR5cGUpO1xuXHRcdGlmICh1cmlDbGFzc2VzKSB7XG5cdFx0XHRleHRyYUNsYXNzZXMucHVzaCguLi51cmlDbGFzc2VzKTtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZS5sYWJlbC5zZXRSZXNvdXJjZSh7XG5cdFx0XHRyZXNvdXJjZTogaW5zdGFuY2UucmVzb3VyY2UsXG5cdFx0XHRuYW1lOiBsYWJlbCxcblx0XHRcdGRlc2NyaXB0aW9uOiBoYXNUZXh0ID8gaW5zdGFuY2UuZGVzY3JpcHRpb24gOiB1bmRlZmluZWRcblx0XHR9LCB7XG5cdFx0XHRmaWxlRGVjb3JhdGlvbnM6IHtcblx0XHRcdFx0Y29sb3JzOiB0cnVlLFxuXHRcdFx0XHRiYWRnZXM6IGhhc1RleHRcblx0XHRcdH0sXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHRtYXJrZG93bjogaG92ZXJJbmZvLmNvbnRlbnQsXG5cdFx0XHRcdG1hcmtkb3duTm90U3VwcG9ydGVkRmFsbGJhY2s6IHVuZGVmaW5lZFxuXHRcdFx0fSxcblx0XHRcdGV4dHJhQ2xhc3Nlc1xuXHRcdH0pO1xuXHRcdGNvbnN0IGVkaXRhYmxlRGF0YSA9IHRoaXMuX3Rlcm1pbmFsRWRpdGluZ1NlcnZpY2UuZ2V0RWRpdGFibGVEYXRhKGluc3RhbmNlKTtcblx0XHR0ZW1wbGF0ZS5sYWJlbC5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2VkaXRhYmxlLXRhYicsICEhZWRpdGFibGVEYXRhKTtcblx0XHRpZiAoZWRpdGFibGVEYXRhKSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5fcmVuZGVySW5wdXRCb3godGVtcGxhdGUubGFiZWwuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWljb24tbGFiZWwtY29udGFpbmVyJykhLCBpbnN0YW5jZSwgZWRpdGFibGVEYXRhKSk7XG5cdFx0XHR0ZW1wbGF0ZS5hY3Rpb25CYXIuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJJbnB1dEJveChjb250YWluZXI6IEhUTUxFbGVtZW50LCBpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsIGVkaXRhYmxlRGF0YTogSUVkaXRhYmxlRGF0YSk6IElEaXNwb3NhYmxlIHtcblxuXHRcdGNvbnN0IHZhbHVlID0gaW5zdGFuY2UudGl0bGUgfHwgJyc7XG5cblx0XHRjb25zdCBpbnB1dEJveCA9IG5ldyBJbnB1dEJveChjb250YWluZXIsIHRoaXMuX2NvbnRleHRWaWV3U2VydmljZSwge1xuXHRcdFx0dmFsaWRhdGlvbk9wdGlvbnM6IHtcblx0XHRcdFx0dmFsaWRhdGlvbjogKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IGVkaXRhYmxlRGF0YS52YWxpZGF0aW9uTWVzc2FnZSh2YWx1ZSk7XG5cdFx0XHRcdFx0aWYgKCFtZXNzYWdlIHx8IG1lc3NhZ2Uuc2V2ZXJpdHkgIT09IFNldmVyaXR5LkVycm9yKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Y29udGVudDogbWVzc2FnZS5jb250ZW50LFxuXHRcdFx0XHRcdFx0Zm9ybWF0Q29udGVudDogdHJ1ZSxcblx0XHRcdFx0XHRcdHR5cGU6IE1lc3NhZ2VUeXBlLkVSUk9SXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ3Rlcm1pbmFsSW5wdXRBcmlhTGFiZWwnLCBcIlR5cGUgdGVybWluYWwgbmFtZS4gUHJlc3MgRW50ZXIgdG8gY29uZmlybSBvciBFc2NhcGUgdG8gY2FuY2VsLlwiKSxcblx0XHRcdGlucHV0Qm94U3R5bGVzOiBkZWZhdWx0SW5wdXRCb3hTdHlsZXNcblx0XHR9KTtcblx0XHRpbnB1dEJveC5lbGVtZW50LnN0eWxlLmhlaWdodCA9ICcyMnB4Jztcblx0XHRpbnB1dEJveC52YWx1ZSA9IHZhbHVlO1xuXHRcdGlucHV0Qm94LmZvY3VzKCk7XG5cdFx0aW5wdXRCb3guc2VsZWN0KHsgc3RhcnQ6IDAsIGVuZDogdmFsdWUubGVuZ3RoIH0pO1xuXG5cdFx0Y29uc3QgZG9uZSA9IGNyZWF0ZVNpbmdsZUNhbGxGdW5jdGlvbigoc3VjY2VzczogYm9vbGVhbiwgZmluaXNoRWRpdGluZzogYm9vbGVhbikgPT4ge1xuXHRcdFx0aW5wdXRCb3guZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBpbnB1dEJveC52YWx1ZTtcblx0XHRcdGRpc3Bvc2UodG9EaXNwb3NlKTtcblx0XHRcdGlucHV0Qm94LmVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0XHRpZiAoZmluaXNoRWRpdGluZykge1xuXHRcdFx0XHRlZGl0YWJsZURhdGEub25GaW5pc2godmFsdWUsIHN1Y2Nlc3MpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2hvd0lucHV0Qm94Tm90aWZpY2F0aW9uID0gKCkgPT4ge1xuXHRcdFx0aWYgKGlucHV0Qm94LmlzSW5wdXRWYWxpZCgpKSB7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBlZGl0YWJsZURhdGEudmFsaWRhdGlvbk1lc3NhZ2UoaW5wdXRCb3gudmFsdWUpO1xuXHRcdFx0XHRpZiAobWVzc2FnZSkge1xuXHRcdFx0XHRcdGlucHV0Qm94LnNob3dNZXNzYWdlKHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IG1lc3NhZ2UuY29udGVudCxcblx0XHRcdFx0XHRcdGZvcm1hdENvbnRlbnQ6IHRydWUsXG5cdFx0XHRcdFx0XHR0eXBlOiBtZXNzYWdlLnNldmVyaXR5ID09PSBTZXZlcml0eS5JbmZvID8gTWVzc2FnZVR5cGUuSU5GTyA6IG1lc3NhZ2Uuc2V2ZXJpdHkgPT09IFNldmVyaXR5Lldhcm5pbmcgPyBNZXNzYWdlVHlwZS5XQVJOSU5HIDogTWVzc2FnZVR5cGUuRVJST1Jcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpbnB1dEJveC5oaWRlTWVzc2FnZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRzaG93SW5wdXRCb3hOb3RpZmljYXRpb24oKTtcblxuXHRcdGNvbnN0IHRvRGlzcG9zZSA9IFtcblx0XHRcdGlucHV0Qm94LFxuXHRcdFx0RE9NLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0Qm94LmlucHV0RWxlbWVudCwgRE9NLkV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IElLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0XHRcdGRvbmUoaW5wdXRCb3guaXNJbnB1dFZhbGlkKCksIHRydWUpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGUuZXF1YWxzKEtleUNvZGUuRXNjYXBlKSkge1xuXHRcdFx0XHRcdGRvbmUoZmFsc2UsIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSxcblx0XHRcdERPTS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dEJveC5pbnB1dEVsZW1lbnQsIERPTS5FdmVudFR5cGUuS0VZX1VQLCAoZTogSUtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdFx0c2hvd0lucHV0Qm94Tm90aWZpY2F0aW9uKCk7XG5cdFx0XHR9KSxcblx0XHRcdERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoaW5wdXRCb3guaW5wdXRFbGVtZW50LCBET00uRXZlbnRUeXBlLkJMVVIsICgpID0+IHtcblx0XHRcdFx0ZG9uZShpbnB1dEJveC5pc0lucHV0VmFsaWQoKSwgdHJ1ZSk7XG5cdFx0XHR9KVxuXHRcdF07XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGRvbmUoZmFsc2UsIGZhbHNlKTtcblx0XHR9KTtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJVGVybWluYWxUYWJFbnRyeVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElUZXJtaW5hbFRhYkVudHJ5VGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRmaWxsQWN0aW9uQmFyKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSwgdGVtcGxhdGU6IElUZXJtaW5hbFRhYkVudHJ5VGVtcGxhdGUpOiB2b2lkIHtcblx0XHQvLyBJZiB0aGUgaW5zdGFuY2UgaXMgd2l0aGluIHRoZSBzZWxlY3Rpb24sIHNwbGl0IGFsbCBzZWxlY3RlZFxuXHRcdGNvbnN0IGFjdGlvbnMgPSBbXG5cdFx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oVGVybWluYWxDb21tYW5kSWQuU3BsaXRBY3RpdmVUYWIsIHRlcm1pbmFsU3RyaW5ncy5zcGxpdC5zaG9ydCwgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uc3BsaXRIb3Jpem9udGFsKSwgdHJ1ZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9ydW5Gb3JTZWxlY3Rpb25Pckluc3RhbmNlKGluc3RhbmNlLCBhc3luYyBlID0+IHtcblx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2UuY3JlYXRlVGVybWluYWwoeyBsb2NhdGlvbjogeyBwYXJlbnRUZXJtaW5hbDogZSB9IH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pKSxcblx0XHRdO1xuXHRcdGlmIChpbnN0YW5jZS5zaGVsbExhdW5jaENvbmZpZy50YWJBY3Rpb25zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBpbnN0YW5jZS5zaGVsbExhdW5jaENvbmZpZy50YWJBY3Rpb25zKSB7XG5cdFx0XHRcdGFjdGlvbnMucHVzaCh0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oYWN0aW9uLmlkLCBhY3Rpb24ubGFiZWwsIGFjdGlvbi5pY29uID8gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGFjdGlvbi5pY29uKSA6IHVuZGVmaW5lZCwgdHJ1ZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3J1bkZvclNlbGVjdGlvbk9ySW5zdGFuY2UoaW5zdGFuY2UsIGUgPT4gdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoYWN0aW9uLmlkLCBpbnN0YW5jZSkpO1xuXHRcdFx0XHR9KSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhY3Rpb25zLnB1c2godGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKFRlcm1pbmFsQ29tbWFuZElkLktpbGxBY3RpdmVUYWIsIHRlcm1pbmFsU3RyaW5ncy5raWxsLnNob3J0LCBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi50cmFzaGNhbiksIHRydWUsIGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMuX3J1bkZvclNlbGVjdGlvbk9ySW5zdGFuY2UoaW5zdGFuY2UsIGUgPT4gdGhpcy5fdGVybWluYWxTZXJ2aWNlLnNhZmVEaXNwb3NlVGVybWluYWwoZSkpO1xuXHRcdH0pKSk7XG5cdFx0Ly8gVE9ETzogQ2FjaGUgdGhlc2UgaW4gYSB3YXkgdGhhdCB3aWxsIHVzZSB0aGUgY29ycmVjdCBpbnN0YW5jZVxuXHRcdHRlbXBsYXRlLmFjdGlvbkJhci5jbGVhcigpO1xuXHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcblx0XHRcdHRlbXBsYXRlLmFjdGlvbkJhci5wdXNoKGFjdGlvbiwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UsIGtleWJpbmRpbmc6IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkKT8uZ2V0TGFiZWwoKSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9ydW5Gb3JTZWxlY3Rpb25Pckluc3RhbmNlKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSwgY2FsbGJhY2s6IChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpID0+IHZvaWQpIHtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLl9nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoc2VsZWN0aW9uLmluY2x1ZGVzKGluc3RhbmNlKSkge1xuXHRcdFx0Zm9yIChjb25zdCBzIG9mIHNlbGVjdGlvbikge1xuXHRcdFx0XHRpZiAocykge1xuXHRcdFx0XHRcdGNhbGxiYWNrKHMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNhbGxiYWNrKGluc3RhbmNlKTtcblx0XHR9XG5cdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuZm9jdXNUYWJzKCk7XG5cdFx0dGhpcy5fbGlzdFNlcnZpY2UubGFzdEZvY3VzZWRMaXN0Py5mb2N1c05leHQoKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVRlcm1pbmFsVGFic1JlbmRlcmVyT3B0aW9ucyB7XG5cdGdldEhhc1RleHQ6ICgpID0+IGJvb2xlYW47XG5cdGdldEhhc0FjdGlvbkJhcjogKCkgPT4gYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElUZXJtaW5hbFRhYkVudHJ5VGVtcGxhdGUge1xuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgbGFiZWw6IElSZXNvdXJjZUxhYmVsO1xuXHRyZWFkb25seSBhY3Rpb25CYXI6IEFjdGlvbkJhcjtcblx0Y29udGV4dDoge1xuXHRcdGhvdmVyQWN0aW9ucz86IElIb3ZlckFjdGlvbltdO1xuXHR9O1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cmVhZG9ubHkgdGVtcGxhdGVEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5cbmNsYXNzIFRlcm1pbmFsVGFic0FjY2Vzc2liaWxpdHlQcm92aWRlciBpbXBsZW1lbnRzIElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPElUZXJtaW5hbEluc3RhbmNlPiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGVybWluYWxHcm91cFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxHcm91cFNlcnZpY2U6IElUZXJtaW5hbEdyb3VwU2VydmljZSxcblx0KSB7IH1cblxuXHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ3Rlcm1pbmFsLnRhYnMnLCBcIlRlcm1pbmFsIHRhYnNcIik7XG5cdH1cblxuXHRnZXRBcmlhTGFiZWwoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogc3RyaW5nIHtcblx0XHRsZXQgYXJpYUxhYmVsOiBzdHJpbmcgPSAnJztcblx0XHRjb25zdCB0YWIgPSB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5nZXRHcm91cEZvckluc3RhbmNlKGluc3RhbmNlKTtcblx0XHRpZiAodGFiICYmIHRhYi50ZXJtaW5hbEluc3RhbmNlcz8ubGVuZ3RoID4gMSkge1xuXHRcdFx0Y29uc3QgdGVybWluYWxJbmRleCA9IHRhYi50ZXJtaW5hbEluc3RhbmNlcy5pbmRleE9mKGluc3RhbmNlKTtcblx0XHRcdGFyaWFMYWJlbCA9IGxvY2FsaXplKHtcblx0XHRcdFx0a2V5OiAnc3BsaXRUZXJtaW5hbEFyaWFMYWJlbCcsXG5cdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHRgVGhlIHRlcm1pbmFsJ3MgSURgLFxuXHRcdFx0XHRcdGBUaGUgdGVybWluYWwncyB0aXRsZWAsXG5cdFx0XHRcdFx0YFRoZSB0ZXJtaW5hbCdzIHNwbGl0IG51bWJlcmAsXG5cdFx0XHRcdFx0YFRoZSB0ZXJtaW5hbCBncm91cCdzIHRvdGFsIHNwbGl0IG51bWJlcmBcblx0XHRcdFx0XVxuXHRcdFx0fSwgXCJUZXJtaW5hbCB7MH0gezF9LCBzcGxpdCB7Mn0gb2YgezN9XCIsIGluc3RhbmNlLmluc3RhbmNlSWQsIGluc3RhbmNlLnRpdGxlLCB0ZXJtaW5hbEluZGV4ICsgMSwgdGFiLnRlcm1pbmFsSW5zdGFuY2VzLmxlbmd0aCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFyaWFMYWJlbCA9IGxvY2FsaXplKHtcblx0XHRcdFx0a2V5OiAndGVybWluYWxBcmlhTGFiZWwnLFxuXHRcdFx0XHRjb21tZW50OiBbXG5cdFx0XHRcdFx0YFRoZSB0ZXJtaW5hbCdzIElEYCxcblx0XHRcdFx0XHRgVGhlIHRlcm1pbmFsJ3MgdGl0bGVgXG5cdFx0XHRcdF1cblx0XHRcdH0sIFwiVGVybWluYWwgezB9IHsxfVwiLCBpbnN0YW5jZS5pbnN0YW5jZUlkLCBpbnN0YW5jZS50aXRsZSk7XG5cdFx0fVxuXHRcdHJldHVybiBhcmlhTGFiZWw7XG5cdH1cbn1cblxuY2xhc3MgVGVybWluYWxUYWJzRHJhZ0FuZERyb3AgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUxpc3REcmFnQW5kRHJvcDxJVGVybWluYWxJbnN0YW5jZT4ge1xuXHRwcml2YXRlIF9hdXRvRm9jdXNJbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2F1dG9Gb2N1c0Rpc3Bvc2FibGU6IElEaXNwb3NhYmxlID0gRGlzcG9zYWJsZS5Ob25lO1xuXHRwcml2YXRlIF9wcmltYXJ5QmFja2VuZDogSVRlcm1pbmFsQmFja2VuZCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbEdyb3VwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbEdyb3VwU2VydmljZTogSVRlcm1pbmFsR3JvdXBTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxFZGl0aW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbEVkaXRpbmdTZXJ2aWNlOiBJVGVybWluYWxFZGl0aW5nU2VydmljZSxcblx0XHRASUxpc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xpc3RTZXJ2aWNlOiBJTGlzdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcHJpbWFyeUJhY2tlbmQgPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuZ2V0UHJpbWFyeUJhY2tlbmQoKTtcblx0fVxuXG5cdGdldERyYWdVUkkoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuX3Rlcm1pbmFsRWRpdGluZ1NlcnZpY2UuZ2V0RWRpdGluZ1Rlcm1pbmFsKCk/Lmluc3RhbmNlSWQgPT09IGluc3RhbmNlLmluc3RhbmNlSWQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiBpbnN0YW5jZS5yZXNvdXJjZS50b1N0cmluZygpO1xuXHR9XG5cblx0Z2V0RHJhZ0xhYmVsPyhlbGVtZW50czogSVRlcm1pbmFsSW5zdGFuY2VbXSwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gZWxlbWVudHMubGVuZ3RoID09PSAxID8gZWxlbWVudHNbMF0udGl0bGUgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRvbkRyYWdMZWF2ZSgpIHtcblx0XHR0aGlzLl9hdXRvRm9jdXNJbnN0YW5jZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9hdXRvRm9jdXNEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9hdXRvRm9jdXNEaXNwb3NhYmxlID0gRGlzcG9zYWJsZS5Ob25lO1xuXHR9XG5cblx0b25EcmFnU3RhcnQoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCFvcmlnaW5hbEV2ZW50LmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkbmREYXRhOiB1bmtub3duID0gZGF0YS5nZXREYXRhKCk7XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KGRuZERhdGEpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIEF0dGFjaCB0ZXJtaW5hbHMgdHlwZSB0byBldmVudFxuXHRcdGNvbnN0IHRlcm1pbmFscyA9IChkbmREYXRhIGFzIHVua25vd25bXSkuZmlsdGVyKGlzVGVybWluYWxJbnN0YW5jZSk7XG5cdFx0aWYgKHRlcm1pbmFscy5sZW5ndGggPiAwKSB7XG5cdFx0XHRvcmlnaW5hbEV2ZW50LmRhdGFUcmFuc2Zlci5zZXREYXRhKFRlcm1pbmFsRGF0YVRyYW5zZmVycy5UZXJtaW5hbHMsIEpTT04uc3RyaW5naWZ5KHRlcm1pbmFscy5tYXAoZSA9PiBlLnJlc291cmNlLnRvU3RyaW5nKCkpKSk7XG5cdFx0fVxuXHR9XG5cblx0b25EcmFnT3ZlcihkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXRJbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQsIHRhcmdldEluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQsIHRhcmdldFNlY3RvcjogTGlzdFZpZXdUYXJnZXRTZWN0b3IgfCB1bmRlZmluZWQsIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IGJvb2xlYW4gfCBJTGlzdERyYWdPdmVyUmVhY3Rpb24ge1xuXHRcdGlmIChkYXRhIGluc3RhbmNlb2YgTmF0aXZlRHJhZ0FuZERyb3BEYXRhKSB7XG5cdFx0XHRpZiAoIWNvbnRhaW5zRHJhZ1R5cGUob3JpZ2luYWxFdmVudCwgRGF0YVRyYW5zZmVycy5GSUxFUywgRGF0YVRyYW5zZmVycy5SRVNPVVJDRVMsIFRlcm1pbmFsRGF0YVRyYW5zZmVycy5UZXJtaW5hbHMsIENvZGVEYXRhVHJhbnNmZXJzLkZJTEVTKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlkQ2hhbmdlQXV0b0ZvY3VzSW5zdGFuY2UgPSB0aGlzLl9hdXRvRm9jdXNJbnN0YW5jZSAhPT0gdGFyZ2V0SW5zdGFuY2U7XG5cdFx0aWYgKGRpZENoYW5nZUF1dG9Gb2N1c0luc3RhbmNlKSB7XG5cdFx0XHR0aGlzLl9hdXRvRm9jdXNEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2F1dG9Gb2N1c0luc3RhbmNlID0gdGFyZ2V0SW5zdGFuY2U7XG5cdFx0fVxuXG5cdFx0aWYgKCF0YXJnZXRJbnN0YW5jZSAmJiAhY29udGFpbnNEcmFnVHlwZShvcmlnaW5hbEV2ZW50LCBUZXJtaW5hbERhdGFUcmFuc2ZlcnMuVGVybWluYWxzKSkge1xuXHRcdFx0cmV0dXJuIGRhdGEgaW5zdGFuY2VvZiBFbGVtZW50c0RyYWdBbmREcm9wRGF0YTtcblx0XHR9XG5cblx0XHRpZiAoZGlkQ2hhbmdlQXV0b0ZvY3VzSW5zdGFuY2UgJiYgdGFyZ2V0SW5zdGFuY2UpIHtcblx0XHRcdHRoaXMuX2F1dG9Gb2N1c0Rpc3Bvc2FibGUgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZSh0YXJnZXRJbnN0YW5jZSk7XG5cdFx0XHRcdHRoaXMuX2F1dG9Gb2N1c0luc3RhbmNlID0gdW5kZWZpbmVkO1xuXHRcdFx0fSwgNTAwLCB0aGlzLl9zdG9yZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGZlZWRiYWNrOiB0YXJnZXRJbmRleCA/IFt0YXJnZXRJbmRleF0gOiB1bmRlZmluZWQsXG5cdFx0XHRhY2NlcHQ6IHRydWUsXG5cdFx0XHRlZmZlY3Q6IHsgdHlwZTogTGlzdERyYWdPdmVyRWZmZWN0VHlwZS5Nb3ZlLCBwb3NpdGlvbjogTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24uT3ZlciB9XG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGRyb3AoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgdGFyZ2V0SW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkLCB0YXJnZXRJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkLCB0YXJnZXRTZWN0b3I6IExpc3RWaWV3VGFyZ2V0U2VjdG9yIHwgdW5kZWZpbmVkLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9hdXRvRm9jdXNEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9hdXRvRm9jdXNJbnN0YW5jZSA9IHVuZGVmaW5lZDtcblxuXHRcdGxldCBzb3VyY2VJbnN0YW5jZXM6IElUZXJtaW5hbEluc3RhbmNlW10gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8SVByb2Nlc3NEZXRhaWxzIHwgdW5kZWZpbmVkPltdID0gW107XG5cdFx0Y29uc3QgcmVzb3VyY2VzID0gZ2V0VGVybWluYWxSZXNvdXJjZXNGcm9tRHJhZ0V2ZW50KG9yaWdpbmFsRXZlbnQpO1xuXHRcdGlmIChyZXNvdXJjZXMpIHtcblx0XHRcdGZvciAoY29uc3QgdXJpIG9mIHJlc291cmNlcykge1xuXHRcdFx0XHRjb25zdCBpbnN0YW5jZSA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5nZXRJbnN0YW5jZUZyb21SZXNvdXJjZSh1cmkpO1xuXHRcdFx0XHRpZiAoaW5zdGFuY2UpIHtcblx0XHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShzb3VyY2VJbnN0YW5jZXMpKSB7XG5cdFx0XHRcdFx0XHRzb3VyY2VJbnN0YW5jZXMucHVzaChpbnN0YW5jZSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHNvdXJjZUluc3RhbmNlcyA9IFtpbnN0YW5jZV07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5tb3ZlVG9UZXJtaW5hbFZpZXcoaW5zdGFuY2UpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuX3ByaW1hcnlCYWNrZW5kKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGVybWluYWxJZGVudGlmaWVyID0gcGFyc2VUZXJtaW5hbFVyaSh1cmkpO1xuXHRcdFx0XHRcdGlmICh0ZXJtaW5hbElkZW50aWZpZXIuaW5zdGFuY2VJZCkge1xuXHRcdFx0XHRcdFx0cHJvbWlzZXMucHVzaCh0aGlzLl9wcmltYXJ5QmFja2VuZC5yZXF1ZXN0RGV0YWNoSW5zdGFuY2UodGVybWluYWxJZGVudGlmaWVyLndvcmtzcGFjZUlkLCB0ZXJtaW5hbElkZW50aWZpZXIuaW5zdGFuY2VJZCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChwcm9taXNlcy5sZW5ndGgpIHtcblx0XHRcdGxldCBwcm9jZXNzZXMgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cdFx0XHRwcm9jZXNzZXMgPSBwcm9jZXNzZXMuZmlsdGVyKHAgPT4gcCAhPT0gdW5kZWZpbmVkKTtcblx0XHRcdGxldCBsYXN0SW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkO1xuXHRcdFx0Zm9yIChjb25zdCBhdHRhY2hQZXJzaXN0ZW50UHJvY2VzcyBvZiBwcm9jZXNzZXMpIHtcblx0XHRcdFx0bGFzdEluc3RhbmNlID0gYXdhaXQgdGhpcy5fdGVybWluYWxTZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKHsgY29uZmlnOiB7IGF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzIH0gfSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAobGFzdEluc3RhbmNlKSB7XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZShsYXN0SW5zdGFuY2UpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChzb3VyY2VJbnN0YW5jZXMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKCEoZGF0YSBpbnN0YW5jZW9mIEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhKSkge1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVFeHRlcm5hbERyb3AodGFyZ2V0SW5zdGFuY2UsIG9yaWdpbmFsRXZlbnQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRyYWdnZWRFbGVtZW50ID0gZGF0YS5nZXREYXRhKCk7XG5cdFx0XHRpZiAoIWRyYWdnZWRFbGVtZW50IHx8ICFBcnJheS5pc0FycmF5KGRyYWdnZWRFbGVtZW50KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHNvdXJjZUluc3RhbmNlcyA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBlIG9mIGRyYWdnZWRFbGVtZW50KSB7XG5cdFx0XHRcdGlmIChpc1Rlcm1pbmFsSW5zdGFuY2UoZSkpIHtcblx0XHRcdFx0XHRzb3VyY2VJbnN0YW5jZXMucHVzaChlIGFzIElUZXJtaW5hbEluc3RhbmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghdGFyZ2V0SW5zdGFuY2UpIHtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLm1vdmVHcm91cFRvRW5kKHNvdXJjZUluc3RhbmNlcyk7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2Uoc291cmNlSW5zdGFuY2VzWzBdKTtcblx0XHRcdGNvbnN0IHRhcmdldEdyb3VwID0gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuZ2V0R3JvdXBGb3JJbnN0YW5jZShzb3VyY2VJbnN0YW5jZXNbMF0pO1xuXHRcdFx0aWYgKHRhcmdldEdyb3VwKSB7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuZ3JvdXBzLmluZGV4T2YodGFyZ2V0R3JvdXApO1xuXHRcdFx0XHR0aGlzLl9saXN0U2VydmljZS5sYXN0Rm9jdXNlZExpc3Q/LnNldFNlbGVjdGlvbihbaW5kZXhdKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5tb3ZlR3JvdXAoc291cmNlSW5zdGFuY2VzLCB0YXJnZXRJbnN0YW5jZSk7XG5cdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlKHNvdXJjZUluc3RhbmNlc1swXSk7XG5cdFx0Y29uc3QgdGFyZ2V0R3JvdXAgPSB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5nZXRHcm91cEZvckluc3RhbmNlKHNvdXJjZUluc3RhbmNlc1swXSk7XG5cdFx0aWYgKHRhcmdldEdyb3VwKSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmdyb3Vwcy5pbmRleE9mKHRhcmdldEdyb3VwKTtcblx0XHRcdHRoaXMuX2xpc3RTZXJ2aWNlLmxhc3RGb2N1c2VkTGlzdD8uc2V0U2VsZWN0aW9uKFtpbmRleF0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZUV4dGVybmFsRHJvcChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQsIGU6IERyYWdFdmVudCkge1xuXHRcdGlmICghaW5zdGFuY2UgfHwgIWUuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgZmlsZXMgd2VyZSBkcmFnZ2VkIGZyb20gdGhlIHRyZWUgZXhwbG9yZXJcblx0XHRsZXQgcmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCByYXdSZXNvdXJjZXMgPSBlLmRhdGFUcmFuc2Zlci5nZXREYXRhKERhdGFUcmFuc2ZlcnMuUkVTT1VSQ0VTKTtcblx0XHRpZiAocmF3UmVzb3VyY2VzKSB7XG5cdFx0XHRyZXNvdXJjZSA9IFVSSS5wYXJzZShKU09OLnBhcnNlKHJhd1Jlc291cmNlcylbMF0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJhd0NvZGVGaWxlcyA9IGUuZGF0YVRyYW5zZmVyLmdldERhdGEoQ29kZURhdGFUcmFuc2ZlcnMuRklMRVMpO1xuXHRcdGlmICghcmVzb3VyY2UgJiYgcmF3Q29kZUZpbGVzKSB7XG5cdFx0XHRyZXNvdXJjZSA9IFVSSS5maWxlKEpTT04ucGFyc2UocmF3Q29kZUZpbGVzKVswXSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFyZXNvdXJjZSAmJiBlLmRhdGFUcmFuc2Zlci5maWxlcy5sZW5ndGggPiAwICYmIGdldFBhdGhGb3JGaWxlKGUuZGF0YVRyYW5zZmVyLmZpbGVzWzBdKSkge1xuXHRcdFx0Ly8gQ2hlY2sgaWYgdGhlIGZpbGUgd2FzIGRyYWdnZWQgZnJvbSB0aGUgZmlsZXN5c3RlbVxuXHRcdFx0cmVzb3VyY2UgPSBVUkkuZmlsZShnZXRQYXRoRm9yRmlsZShlLmRhdGFUcmFuc2Zlci5maWxlc1swXSkhKTtcblx0XHR9XG5cblx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlKGluc3RhbmNlKTtcblxuXHRcdGluc3RhbmNlLmZvY3VzKCk7XG5cdFx0YXdhaXQgaW5zdGFuY2Uuc2VuZFBhdGgocmVzb3VyY2UsIGZhbHNlKTtcblx0fVxufVxuXG5jbGFzcyBUYWJEZWNvcmF0aW9uc1Byb3ZpZGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElEZWNvcmF0aW9uc1Byb3ZpZGVyIHtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZyA9IGxvY2FsaXplKCdsYWJlbCcsIFwiVGVybWluYWxcIik7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxVUklbXT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWxTZXJ2aWNlLm9uQW55SW5zdGFuY2VQcmltYXJ5U3RhdHVzQ2hhbmdlKGUgPT4gdGhpcy5fb25EaWRDaGFuZ2UuZmlyZShbZS5yZXNvdXJjZV0pKSk7XG5cdH1cblxuXHRwcm92aWRlRGVjb3JhdGlvbnMocmVzb3VyY2U6IFVSSSk6IElEZWNvcmF0aW9uRGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHJlc291cmNlLnNjaGVtZSAhPT0gU2NoZW1hcy52c2NvZGVUZXJtaW5hbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBpbnN0YW5jZSA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5nZXRJbnN0YW5jZUZyb21SZXNvdXJjZShyZXNvdXJjZSk7XG5cdFx0aWYgKCFpbnN0YW5jZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBwcmltYXJ5U3RhdHVzID0gaW5zdGFuY2U/LnN0YXR1c0xpc3Q/LnByaW1hcnk7XG5cdFx0aWYgKCFwcmltYXJ5U3RhdHVzPy5pY29uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb2xvcjogZ2V0Q29sb3JGb3JTZXZlcml0eShwcmltYXJ5U3RhdHVzLnNldmVyaXR5KSxcblx0XHRcdGxldHRlcjogcHJpbWFyeVN0YXR1cy5pY29uLFxuXHRcdFx0dG9vbHRpcDogcHJpbWFyeVN0YXR1cy50b29sdGlwXG5cdFx0fTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc1Rlcm1pbmFsSW5zdGFuY2Uob2JqOiB1bmtub3duKTogb2JqIGlzIElUZXJtaW5hbEluc3RhbmNlIHtcblx0cmV0dXJuIGlzT2JqZWN0KG9iaikgJiYgJ2luc3RhbmNlSWQnIGluIG9iajtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxjQUFjLHFCQUFxQjtBQUU1QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUywrQkFBK0IsdUJBQTBDLGtCQUFrQix5QkFBeUIsNkJBQTZCO0FBQzFKLFNBQVMsZ0JBQWdCO0FBQ3pCLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUEyQixrQkFBa0IseUJBQXlCO0FBQ3RF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LGlCQUFpQixpQ0FBaUMsT0FBSyxLQUFLLGFBQWEsS0FBSyxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztBQUFBLEVBQ2pIO0FBQUEsRUFFQSxtQkFBbUIsVUFBNEM7QUFDOUQsUUFBSSxTQUFTLFdBQVcsUUFBUSxnQkFBZ0I7QUFDL0MsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFdBQVcsS0FBSyxpQkFBaUIsd0JBQXdCLFFBQVE7QUFDdkUsUUFBSSxDQUFDLFVBQVU7QUFDZCxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sZ0JBQWdCLFVBQVUsWUFBWTtBQUM1QyxRQUFJLENBQUMsZUFBZSxNQUFNO0FBQ3pCLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTztBQUFBLE1BQ04sT0FBTyxvQkFBb0IsY0FBYyxRQUFRO0FBQUEsTUFDakQsUUFBUSxjQUFjO0FBQUEsTUFDdEIsU0FBUyxjQUFjO0FBQUEsSUFDeEI7QUFBQSxFQUNEO0FBQ0Q7QUFsQ00seUJBQU47QUFBQSxFQU9HO0FBQUEsR0FQRztBQW9DTixTQUFTLG1CQUFtQixLQUF3QztBQUNuRSxTQUFPLFNBQVMsR0FBRyxLQUFLLGdCQUFnQjtBQUN6QzsiLAogICJuYW1lcyI6IFsiVGVybWluYWxUYWJzTGlzdFNpemVzIiwgInZhbHVlIiwgInRhcmdldEdyb3VwIl0KfQo=
