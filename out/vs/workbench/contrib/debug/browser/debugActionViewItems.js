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
import * as nls from "../../../../nls.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import * as dom from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IDebugService, State } from "../common/debug.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { selectBorder, selectBackground, asCssVariable } from "../../../../platform/theme/common/colorRegistry.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { DisposableStore, dispose, toDisposable } from "../../../../base/common/lifecycle.js";
import { ADD_CONFIGURATION_ID } from "./debugCommands.js";
import { BaseActionViewItem, SelectActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { debugStart } from "./debugIcons.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { defaultSelectBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { AccessibilityCommandId } from "../../accessibility/common/accessibilityCommands.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { hasNativeContextMenu } from "../../../../platform/window/common/window.js";
import { Gesture, EventType as TouchEventType } from "../../../../base/browser/touch.js";
import { ActionWidgetDropdown } from "../../../../platform/actionWidget/browser/actionWidgetDropdown.js";
import { IActionWidgetService } from "../../../../platform/actionWidget/browser/actionWidget.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
let StartDebugActionViewItem = class extends BaseActionViewItem {
  constructor(context, action, options, debugService, configurationService, commandService, contextService, _contextViewService, keybindingService, hoverService, contextKeyService, actionWidgetService, telemetryService) {
    super(context, action, options);
    this.context = context;
    this.debugService = debugService;
    this.configurationService = configurationService;
    this.commandService = commandService;
    this.contextService = contextService;
    this.keybindingService = keybindingService;
    this.hoverService = hoverService;
    this.contextKeyService = contextKeyService;
    this.actionWidgetService = actionWidgetService;
    this.telemetryService = telemetryService;
    this.debugOptions = [];
    this.selected = 0;
    this.providers = [];
    this.optionCategories = [];
    this.toDispose = [];
    this.registerListeners();
  }
  registerListeners() {
    this.toDispose.push(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("launch")) {
        this.updateOptions();
      }
    }));
    this.toDispose.push(this.debugService.getConfigurationManager().onDidSelectConfiguration(() => {
      this.updateOptions();
    }));
  }
  render(container) {
    this.container = container;
    container.classList.add("start-debug-action-item");
    let titleElement = null;
    let isDisposed = false;
    this.toDispose.push(toDisposable(() => {
      isDisposed = true;
      titleElement?.classList.remove("has-start-debug-action-item");
    }));
    queueMicrotask(() => {
      if (!isDisposed) {
        titleElement = container.closest(".part > .title");
        titleElement?.classList.add("has-start-debug-action-item");
      }
    });
    this.start = dom.append(container, dom.$(ThemeIcon.asCSSSelector(debugStart)));
    const title = this.keybindingService.appendKeybinding(this.action.label, this.action.id);
    this.toDispose.push(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.start, title));
    this.start.setAttribute("role", "button");
    this._setAriaLabel(title);
    this._register(Gesture.addTarget(this.start));
    for (const event of [dom.EventType.CLICK, TouchEventType.Tap]) {
      this.toDispose.push(dom.addDisposableListener(this.start, event, () => {
        this.start.blur();
        if (this.debugService.state !== State.Initializing) {
          this.actionRunner.run(this.action, this.context);
        }
      }));
    }
    this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.MOUSE_DOWN, (e) => {
      if (this.action.enabled && e.button === 0) {
        this.start.classList.add("active");
      }
    }));
    this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.MOUSE_UP, () => {
      this.start.classList.remove("active");
    }));
    this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.MOUSE_OUT, () => {
      this.start.classList.remove("active");
    }));
    this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.RightArrow)) {
        this.start.tabIndex = -1;
        this.dropdownLabel?.focus();
        event.stopPropagation();
      }
    }));
    this.configurationContainer = dom.append(container, dom.$(".configuration"));
    this.dropdown = new ActionWidgetDropdown(this.configurationContainer, {
      label: nls.localize("debugLaunchConfigurations", "Debug Launch Configurations"),
      labelRenderer: (el) => {
        this.dropdownLabel = el;
        el.classList.add("start-debug-action-item-dropdown-label");
        el.tabIndex = -1;
        el.setAttribute("role", "button");
        el.setAttribute("aria-haspopup", "true");
        el.setAttribute("aria-expanded", "false");
        this.renderDropdownLabel();
        return null;
      },
      actionProvider: { getActions: () => this.getDropdownActions() },
      listOptions: {
        showFilter: true,
        filterPlaceholder: nls.localize("debugLaunchConfigurations.search", "Search configurations"),
        focusFilterOnOpen: true
      }
    }, this.actionWidgetService, this.keybindingService, this.telemetryService);
    this.toDispose.push(this.dropdown);
    this.toDispose.push(this.dropdown.onDidChangeVisibility((visible) => {
      this.dropdownLabel?.setAttribute("aria-expanded", String(visible));
    }));
    this.toDispose.push(dom.addDisposableListener(this.configurationContainer, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.LeftArrow)) {
        if (this.dropdownLabel) {
          this.dropdownLabel.tabIndex = -1;
        }
        this.start.tabIndex = 0;
        this.start.focus();
        event.stopPropagation();
        event.preventDefault();
      }
    }));
    this.container.style.border = `1px solid ${asCssVariable(selectBorder)}`;
    this.configurationContainer.style.borderLeft = `1px solid ${asCssVariable(selectBorder)}`;
    this.container.style.backgroundColor = asCssVariable(selectBackground);
    const configManager = this.debugService.getConfigurationManager();
    const updateDynamicConfigs = () => configManager.getDynamicProviders().then((providers) => {
      if (providers.length !== this.providers.length) {
        this.providers = providers;
        this.updateOptions();
      }
    });
    this.toDispose.push(configManager.onDidChangeConfigurationProviders(updateDynamicConfigs));
    updateDynamicConfigs();
    this.updateOptions();
  }
  setActionContext(context) {
    this.context = context;
  }
  isEnabled() {
    return true;
  }
  focus(fromRight) {
    if (fromRight) {
      if (this.dropdownLabel) {
        this.dropdownLabel.tabIndex = 0;
        this.dropdownLabel.focus();
      }
    } else {
      this.start.tabIndex = 0;
      this.start.focus();
    }
  }
  blur() {
    this.start.tabIndex = -1;
    if (this.dropdownLabel) {
      this.dropdownLabel.tabIndex = -1;
      this.dropdownLabel.blur();
    }
    this.container.blur();
  }
  setFocusable(focusable) {
    if (focusable) {
      this.start.tabIndex = 0;
    } else {
      this.start.tabIndex = -1;
      if (this.dropdownLabel) {
        this.dropdownLabel.tabIndex = -1;
      }
    }
  }
  dispose() {
    this.toDispose = dispose(this.toDispose);
    super.dispose();
  }
  renderDropdownLabel() {
    if (!this.dropdownLabel) {
      return;
    }
    const currentLabel = this.debugOptions[this.selected]?.label ?? nls.localize("noConfigurations", "No Configurations");
    const labelSpan = dom.$("span.start-debug-action-item-label", void 0, currentLabel);
    const chevron = renderLabelWithIcons("$(chevron-down)");
    dom.reset(this.dropdownLabel, labelSpan, ...chevron);
    this.dropdownLabel.title = currentLabel;
    this.dropdownLabel.setAttribute("aria-label", nls.localize("debugLaunchConfigurationsAriaLabel", "Debug Launch Configurations: {0}", currentLabel));
  }
  getDropdownActions() {
    const actions = [];
    for (let i = 0; i < this.debugOptions.length; i++) {
      const option = this.debugOptions[i];
      const category = this.optionCategories[i];
      actions.push({
        id: `debug.config.${i}`,
        label: option.label,
        tooltip: option.label,
        class: void 0,
        enabled: true,
        checked: i === this.selected,
        category,
        run: async () => {
          await option.handler();
        }
      });
    }
    return actions;
  }
  updateOptions() {
    this.selected = 0;
    this.debugOptions = [];
    this.optionCategories = [];
    const manager = this.debugService.getConfigurationManager();
    const inWorkspace = this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE;
    let lastGroup;
    let groupOrder = 0;
    const pushOption = (option, category) => {
      this.debugOptions.push(option);
      this.optionCategories.push(category);
    };
    manager.getAllConfigurations().forEach(({ launch, name, presentation }) => {
      if (lastGroup !== presentation?.group) {
        lastGroup = presentation?.group;
        if (this.debugOptions.length) {
          groupOrder++;
        }
      }
      if (name === manager.selectedConfiguration.name && launch === manager.selectedConfiguration.launch) {
        this.selected = this.debugOptions.length;
      }
      const label = inWorkspace ? `${name} (${launch.name})` : name;
      pushOption({
        label,
        handler: async () => {
          await manager.selectConfiguration(launch, name);
          return true;
        }
      }, { label: `configurations-${groupOrder}`, order: groupOrder });
    });
    manager.getRecentDynamicConfigurations().slice(0, 3).forEach(({ name, type }) => {
      if (type === manager.selectedConfiguration.type && manager.selectedConfiguration.name === name) {
        this.selected = this.debugOptions.length;
      }
      pushOption({
        label: name,
        handler: async () => {
          await manager.selectConfiguration(void 0, name, void 0, { type });
          return true;
        }
      }, { label: "recent-dynamic", order: 100 });
    });
    if (this.debugOptions.length === 0) {
      pushOption({ label: nls.localize("noConfigurations", "No Configurations"), handler: async () => false }, void 0);
    }
    this.providers.forEach((p) => {
      pushOption({
        label: `${p.label}...`,
        handler: async () => {
          const picked = await p.pick();
          if (picked) {
            await manager.selectConfiguration(picked.launch, picked.config.name, picked.config, { type: p.type });
            return true;
          }
          return false;
        }
      }, { label: "actions", order: 200 });
    });
    manager.getLaunches().filter((l) => !l.hidden).forEach((l) => {
      const label = inWorkspace ? nls.localize("addConfigTo", "Add Config ({0})...", l.name) : nls.localize("addConfiguration", "Add Configuration...");
      pushOption({
        label,
        handler: async () => {
          await this.commandService.executeCommand(ADD_CONFIGURATION_ID, l.uri.toString());
          return false;
        }
      }, { label: "actions", order: 200 });
    });
    this.renderDropdownLabel();
  }
  _setAriaLabel(title) {
    let ariaLabel = title;
    let keybinding;
    const verbose = this.configurationService.getValue(AccessibilityVerbositySettingId.Debug);
    if (verbose) {
      keybinding = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp, this.contextKeyService)?.getLabel() ?? void 0;
    }
    if (keybinding) {
      ariaLabel = nls.localize("commentLabelWithKeybinding", "{0}, use ({1}) for accessibility help", ariaLabel, keybinding);
    } else {
      ariaLabel = nls.localize("commentLabelWithKeybindingNoKeybinding", "{0}, run the command Open Accessibility Help which is currently not triggerable via keybinding.", ariaLabel);
    }
    this.start.ariaLabel = ariaLabel;
  }
};
StartDebugActionViewItem = __decorateClass([
  __decorateParam(3, IDebugService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IWorkspaceContextService),
  __decorateParam(7, IContextViewService),
  __decorateParam(8, IKeybindingService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IActionWidgetService),
  __decorateParam(12, ITelemetryService)
], StartDebugActionViewItem);
let FocusSessionActionViewItem = class extends SelectActionViewItem {
  constructor(action, session, debugService, contextViewService, configurationService) {
    super(null, action, [], -1, contextViewService, defaultSelectBoxStyles, { ariaLabel: nls.localize("debugSession", "Debug Session"), useCustomDrawn: !hasNativeContextMenu(configurationService) });
    this.debugService = debugService;
    this.configurationService = configurationService;
    this._register(this.debugService.getViewModel().onDidFocusSession(() => {
      const session2 = this.getSelectedSession();
      if (session2) {
        const index = this.getSessions().indexOf(session2);
        this.select(index);
      }
    }));
    const sessionListenersStore = this._register(new DisposableStore());
    const registerSessionListeners = (session2) => {
      const sessionListeners = sessionListenersStore.add(new DisposableStore());
      sessionListeners.add(session2.onDidChangeName(() => this.update()));
      sessionListeners.add(session2.onDidEndAdapter(() => sessionListenersStore.delete(sessionListeners)));
    };
    this._register(this.debugService.onDidNewSession((session2) => {
      registerSessionListeners(session2);
      this.update();
    }));
    this.getSessions().forEach(registerSessionListeners);
    this._register(this.debugService.onDidEndSession(() => this.update()));
    const selectedSession = session ? this.mapFocusedSessionToSelected(session) : void 0;
    this.update(selectedSession);
  }
  getActionContext(_, index) {
    return this.getSessions()[index];
  }
  update(session) {
    if (!session) {
      session = this.getSelectedSession();
    }
    const sessions = this.getSessions();
    const names = sessions.map((s) => {
      const label = s.getLabel();
      if (s.parentSession) {
        return `\xA0\xA0${label}`;
      }
      return label;
    });
    this.setOptions(names.map((data) => ({ text: data })), session ? sessions.indexOf(session) : void 0);
  }
  getSelectedSession() {
    const session = this.debugService.getViewModel().focusedSession;
    return session ? this.mapFocusedSessionToSelected(session) : void 0;
  }
  getSessions() {
    const showSubSessions = this.configurationService.getValue("debug").showSubSessionsInToolBar;
    const sessions = this.debugService.getModel().getSessions();
    return showSubSessions ? sessions : sessions.filter((s) => !s.parentSession);
  }
  mapFocusedSessionToSelected(focusedSession) {
    const showSubSessions = this.configurationService.getValue("debug").showSubSessionsInToolBar;
    while (focusedSession.parentSession && !showSubSessions) {
      focusedSession = focusedSession.parentSession;
    }
    return focusedSession;
  }
};
FocusSessionActionViewItem = __decorateClass([
  __decorateParam(2, IDebugService),
  __decorateParam(3, IContextViewService),
  __decorateParam(4, IConfigurationService)
], FocusSessionActionViewItem);
export {
  FocusSessionActionViewItem,
  StartDebugActionViewItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxkZWJ1Z0FjdGlvblZpZXdJdGVtcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IElTZWxlY3RPcHRpb25JdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NlbGVjdEJveC9zZWxlY3RCb3guanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSURlYnVnU2VydmljZSwgSURlYnVnU2Vzc2lvbiwgSURlYnVnQ29uZmlndXJhdGlvbiwgSUNvbmZpZywgSUxhdW5jaCwgU3RhdGUgfSBmcm9tICcuLi9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IHNlbGVjdEJvcmRlciwgc2VsZWN0QmFja2dyb3VuZCwgYXNDc3NWYXJpYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBkaXNwb3NlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQUREX0NPTkZJR1VSQVRJT05fSUQgfSBmcm9tICcuL2RlYnVnQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQmFzZUFjdGlvblZpZXdJdGVtLCBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucywgU2VsZWN0QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBkZWJ1Z1N0YXJ0IH0gZnJvbSAnLi9kZWJ1Z0ljb25zLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgZGVmYXVsdFNlbGVjdEJveFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlDb21tYW5kSWQgfSBmcm9tICcuLi8uLi9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBoYXNOYXRpdmVDb250ZXh0TWVudSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IEdlc3R1cmUsIEV2ZW50VHlwZSBhcyBUb3VjaEV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25XaWRnZXREcm9wZG93biwgSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0RHJvcGRvd24uanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyByZW5kZXJMYWJlbFdpdGhJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBTdGFydERlYnVnQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXG5cdHByaXZhdGUgY29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc3RhcnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBjb25maWd1cmF0aW9uQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgZHJvcGRvd25MYWJlbDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZHJvcGRvd24hOiBBY3Rpb25XaWRnZXREcm9wZG93bjtcblx0cHJpdmF0ZSBkZWJ1Z09wdGlvbnM6IHsgbGFiZWw6IHN0cmluZzsgaGFuZGxlcjogKCgpID0+IFByb21pc2U8Ym9vbGVhbj4pIH1bXSA9IFtdO1xuXHRwcml2YXRlIHRvRGlzcG9zZTogSURpc3Bvc2FibGVbXTtcblx0cHJpdmF0ZSBzZWxlY3RlZCA9IDA7XG5cdHByaXZhdGUgcHJvdmlkZXJzOiB7IGxhYmVsOiBzdHJpbmc7IHR5cGU6IHN0cmluZzsgcGljazogKCkgPT4gUHJvbWlzZTx7IGxhdW5jaDogSUxhdW5jaDsgY29uZmlnOiBJQ29uZmlnIH0gfCB1bmRlZmluZWQ+IH1bXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgY29udGV4dDogdW5rbm93bixcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0b3B0aW9uczogSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgX2NvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUFjdGlvbldpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY3Rpb25XaWRnZXRTZXJ2aWNlOiBJQWN0aW9uV2lkZ2V0U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihjb250ZXh0LCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdHRoaXMudG9EaXNwb3NlID0gW107XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignbGF1bmNoJykpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVPcHRpb25zKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Q29uZmlndXJhdGlvbk1hbmFnZXIoKS5vbkRpZFNlbGVjdENvbmZpZ3VyYXRpb24oKCkgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVPcHRpb25zKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLmNvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnc3RhcnQtZGVidWctYWN0aW9uLWl0ZW0nKTtcblx0XHRsZXQgdGl0bGVFbGVtZW50OiBFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdFx0bGV0IGlzRGlzcG9zZWQgPSBmYWxzZTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdHRpdGxlRWxlbWVudD8uY2xhc3NMaXN0LnJlbW92ZSgnaGFzLXN0YXJ0LWRlYnVnLWFjdGlvbi1pdGVtJyk7XG5cdFx0fSkpO1xuXHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHtcblx0XHRcdGlmICghaXNEaXNwb3NlZCkge1xuXHRcdFx0XHR0aXRsZUVsZW1lbnQgPSBjb250YWluZXIuY2xvc2VzdCgnLnBhcnQgPiAudGl0bGUnKTtcblx0XHRcdFx0dGl0bGVFbGVtZW50Py5jbGFzc0xpc3QuYWRkKCdoYXMtc3RhcnQtZGVidWctYWN0aW9uLWl0ZW0nKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLnN0YXJ0ID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGRlYnVnU3RhcnQpKSk7XG5cdFx0Y29uc3QgdGl0bGUgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcodGhpcy5hY3Rpb24ubGFiZWwsIHRoaXMuYWN0aW9uLmlkKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCB0aGlzLnN0YXJ0LCB0aXRsZSkpO1xuXHRcdHRoaXMuc3RhcnQuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdHRoaXMuX3NldEFyaWFMYWJlbCh0aXRsZSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihHZXN0dXJlLmFkZFRhcmdldCh0aGlzLnN0YXJ0KSk7XG5cdFx0Zm9yIChjb25zdCBldmVudCBvZiBbZG9tLkV2ZW50VHlwZS5DTElDSywgVG91Y2hFdmVudFR5cGUuVGFwXSkge1xuXHRcdFx0dGhpcy50b0Rpc3Bvc2UucHVzaChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuc3RhcnQsIGV2ZW50LCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuc3RhcnQuYmx1cigpO1xuXHRcdFx0XHRpZiAodGhpcy5kZWJ1Z1NlcnZpY2Uuc3RhdGUgIT09IFN0YXRlLkluaXRpYWxpemluZykge1xuXHRcdFx0XHRcdHRoaXMuYWN0aW9uUnVubmVyLnJ1bih0aGlzLmFjdGlvbiwgdGhpcy5jb250ZXh0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2goZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnN0YXJ0LCBkb20uRXZlbnRUeXBlLk1PVVNFX0RPV04sIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRpZiAodGhpcy5hY3Rpb24uZW5hYmxlZCAmJiBlLmJ1dHRvbiA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLnN0YXJ0LmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5zdGFydCwgZG9tLkV2ZW50VHlwZS5NT1VTRV9VUCwgKCkgPT4ge1xuXHRcdFx0dGhpcy5zdGFydC5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKTtcblx0XHR9KSk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuc3RhcnQsIGRvbS5FdmVudFR5cGUuTU9VU0VfT1VULCAoKSA9PiB7XG5cdFx0XHR0aGlzLnN0YXJ0LmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2goZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnN0YXJ0LCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLlJpZ2h0QXJyb3cpKSB7XG5cdFx0XHRcdHRoaXMuc3RhcnQudGFiSW5kZXggPSAtMTtcblx0XHRcdFx0dGhpcy5kcm9wZG93bkxhYmVsPy5mb2N1cygpO1xuXHRcdFx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmNvbmZpZ3VyYXRpb25Db250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5jb25maWd1cmF0aW9uJykpO1xuXG5cdFx0dGhpcy5kcm9wZG93biA9IG5ldyBBY3Rpb25XaWRnZXREcm9wZG93bih0aGlzLmNvbmZpZ3VyYXRpb25Db250YWluZXIsIHtcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2RlYnVnTGF1bmNoQ29uZmlndXJhdGlvbnMnLCAnRGVidWcgTGF1bmNoIENvbmZpZ3VyYXRpb25zJyksXG5cdFx0XHRsYWJlbFJlbmRlcmVyOiAoZWw6IEhUTUxFbGVtZW50KSA9PiB7XG5cdFx0XHRcdHRoaXMuZHJvcGRvd25MYWJlbCA9IGVsO1xuXHRcdFx0XHRlbC5jbGFzc0xpc3QuYWRkKCdzdGFydC1kZWJ1Zy1hY3Rpb24taXRlbS1kcm9wZG93bi1sYWJlbCcpO1xuXHRcdFx0XHRlbC50YWJJbmRleCA9IC0xO1xuXHRcdFx0XHRlbC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0XHRcdGVsLnNldEF0dHJpYnV0ZSgnYXJpYS1oYXNwb3B1cCcsICd0cnVlJyk7XG5cdFx0XHRcdGVsLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICdmYWxzZScpO1xuXHRcdFx0XHR0aGlzLnJlbmRlckRyb3Bkb3duTGFiZWwoKTtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9LFxuXHRcdFx0YWN0aW9uUHJvdmlkZXI6IHsgZ2V0QWN0aW9uczogKCkgPT4gdGhpcy5nZXREcm9wZG93bkFjdGlvbnMoKSB9LFxuXHRcdFx0bGlzdE9wdGlvbnM6IHtcblx0XHRcdFx0c2hvd0ZpbHRlcjogdHJ1ZSxcblx0XHRcdFx0ZmlsdGVyUGxhY2Vob2xkZXI6IG5scy5sb2NhbGl6ZSgnZGVidWdMYXVuY2hDb25maWd1cmF0aW9ucy5zZWFyY2gnLCBcIlNlYXJjaCBjb25maWd1cmF0aW9uc1wiKSxcblx0XHRcdFx0Zm9jdXNGaWx0ZXJPbk9wZW46IHRydWUsXG5cdFx0XHR9LFxuXHRcdH0sIHRoaXMuYWN0aW9uV2lkZ2V0U2VydmljZSwgdGhpcy5rZXliaW5kaW5nU2VydmljZSwgdGhpcy50ZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuZHJvcGRvd24pO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5kcm9wZG93bi5vbkRpZENoYW5nZVZpc2liaWxpdHkodmlzaWJsZSA9PiB7XG5cdFx0XHR0aGlzLmRyb3Bkb3duTGFiZWw/LnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIFN0cmluZyh2aXNpYmxlKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY29uZmlndXJhdGlvbkNvbnRhaW5lciwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5MZWZ0QXJyb3cpKSB7XG5cdFx0XHRcdGlmICh0aGlzLmRyb3Bkb3duTGFiZWwpIHtcblx0XHRcdFx0XHR0aGlzLmRyb3Bkb3duTGFiZWwudGFiSW5kZXggPSAtMTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnN0YXJ0LnRhYkluZGV4ID0gMDtcblx0XHRcdFx0dGhpcy5zdGFydC5mb2N1cygpO1xuXHRcdFx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5ib3JkZXIgPSBgMXB4IHNvbGlkICR7YXNDc3NWYXJpYWJsZShzZWxlY3RCb3JkZXIpfWA7XG5cdFx0dGhpcy5jb25maWd1cmF0aW9uQ29udGFpbmVyLnN0eWxlLmJvcmRlckxlZnQgPSBgMXB4IHNvbGlkICR7YXNDc3NWYXJpYWJsZShzZWxlY3RCb3JkZXIpfWA7XG5cdFx0dGhpcy5jb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gYXNDc3NWYXJpYWJsZShzZWxlY3RCYWNrZ3JvdW5kKTtcblxuXHRcdGNvbnN0IGNvbmZpZ01hbmFnZXIgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRDb25maWd1cmF0aW9uTWFuYWdlcigpO1xuXHRcdGNvbnN0IHVwZGF0ZUR5bmFtaWNDb25maWdzID0gKCkgPT4gY29uZmlnTWFuYWdlci5nZXREeW5hbWljUHJvdmlkZXJzKCkudGhlbihwcm92aWRlcnMgPT4ge1xuXHRcdFx0aWYgKHByb3ZpZGVycy5sZW5ndGggIT09IHRoaXMucHJvdmlkZXJzLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLnByb3ZpZGVycyA9IHByb3ZpZGVycztcblx0XHRcdFx0dGhpcy51cGRhdGVPcHRpb25zKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKGNvbmZpZ01hbmFnZXIub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uUHJvdmlkZXJzKHVwZGF0ZUR5bmFtaWNDb25maWdzKSk7XG5cdFx0dXBkYXRlRHluYW1pY0NvbmZpZ3MoKTtcblx0XHR0aGlzLnVwZGF0ZU9wdGlvbnMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldEFjdGlvbkNvbnRleHQoY29udGV4dDogYW55KTogdm9pZCB7XG5cdFx0dGhpcy5jb250ZXh0ID0gY29udGV4dDtcblx0fVxuXG5cdG92ZXJyaWRlIGlzRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKGZyb21SaWdodD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoZnJvbVJpZ2h0KSB7XG5cdFx0XHRpZiAodGhpcy5kcm9wZG93bkxhYmVsKSB7XG5cdFx0XHRcdHRoaXMuZHJvcGRvd25MYWJlbC50YWJJbmRleCA9IDA7XG5cdFx0XHRcdHRoaXMuZHJvcGRvd25MYWJlbC5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0YXJ0LnRhYkluZGV4ID0gMDtcblx0XHRcdHRoaXMuc3RhcnQuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBibHVyKCk6IHZvaWQge1xuXHRcdHRoaXMuc3RhcnQudGFiSW5kZXggPSAtMTtcblx0XHRpZiAodGhpcy5kcm9wZG93bkxhYmVsKSB7XG5cdFx0XHR0aGlzLmRyb3Bkb3duTGFiZWwudGFiSW5kZXggPSAtMTtcblx0XHRcdHRoaXMuZHJvcGRvd25MYWJlbC5ibHVyKCk7XG5cdFx0fVxuXHRcdHRoaXMuY29udGFpbmVyLmJsdXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldEZvY3VzYWJsZShmb2N1c2FibGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoZm9jdXNhYmxlKSB7XG5cdFx0XHR0aGlzLnN0YXJ0LnRhYkluZGV4ID0gMDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdGFydC50YWJJbmRleCA9IC0xO1xuXHRcdFx0aWYgKHRoaXMuZHJvcGRvd25MYWJlbCkge1xuXHRcdFx0XHR0aGlzLmRyb3Bkb3duTGFiZWwudGFiSW5kZXggPSAtMTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMudG9EaXNwb3NlID0gZGlzcG9zZSh0aGlzLnRvRGlzcG9zZSk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJEcm9wZG93bkxhYmVsKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5kcm9wZG93bkxhYmVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGN1cnJlbnRMYWJlbCA9IHRoaXMuZGVidWdPcHRpb25zW3RoaXMuc2VsZWN0ZWRdPy5sYWJlbFxuXHRcdFx0Pz8gbmxzLmxvY2FsaXplKCdub0NvbmZpZ3VyYXRpb25zJywgXCJObyBDb25maWd1cmF0aW9uc1wiKTtcblx0XHRjb25zdCBsYWJlbFNwYW4gPSBkb20uJCgnc3Bhbi5zdGFydC1kZWJ1Zy1hY3Rpb24taXRlbS1sYWJlbCcsIHVuZGVmaW5lZCwgY3VycmVudExhYmVsKTtcblx0XHRjb25zdCBjaGV2cm9uID0gcmVuZGVyTGFiZWxXaXRoSWNvbnMoJyQoY2hldnJvbi1kb3duKScpO1xuXHRcdGRvbS5yZXNldCh0aGlzLmRyb3Bkb3duTGFiZWwsIGxhYmVsU3BhbiwgLi4uY2hldnJvbik7XG5cdFx0dGhpcy5kcm9wZG93bkxhYmVsLnRpdGxlID0gY3VycmVudExhYmVsO1xuXHRcdHRoaXMuZHJvcGRvd25MYWJlbC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBubHMubG9jYWxpemUoJ2RlYnVnTGF1bmNoQ29uZmlndXJhdGlvbnNBcmlhTGFiZWwnLCBcIkRlYnVnIExhdW5jaCBDb25maWd1cmF0aW9uczogezB9XCIsIGN1cnJlbnRMYWJlbCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXREcm9wZG93bkFjdGlvbnMoKTogSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uW10ge1xuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbltdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmRlYnVnT3B0aW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3Qgb3B0aW9uID0gdGhpcy5kZWJ1Z09wdGlvbnNbaV07XG5cdFx0XHRjb25zdCBjYXRlZ29yeSA9IHRoaXMub3B0aW9uQ2F0ZWdvcmllc1tpXTtcblx0XHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHRcdGlkOiBgZGVidWcuY29uZmlnLiR7aX1gLFxuXHRcdFx0XHRsYWJlbDogb3B0aW9uLmxhYmVsLFxuXHRcdFx0XHR0b29sdGlwOiBvcHRpb24ubGFiZWwsXG5cdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGNoZWNrZWQ6IGkgPT09IHRoaXMuc2VsZWN0ZWQsXG5cdFx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHQvLyBTZWxlY3Rpb24gc3RhdGUgYW5kIGxhYmVsIGFyZSByZWNvbmNpbGVkIGJ5IHVwZGF0ZU9wdGlvbnMoKSxcblx0XHRcdFx0XHQvLyB0cmlnZ2VyZWQgYnkgbWFuYWdlci5vbkRpZFNlbGVjdENvbmZpZ3VyYXRpb24uXG5cdFx0XHRcdFx0YXdhaXQgb3B0aW9uLmhhbmRsZXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiBhY3Rpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBvcHRpb25DYXRlZ29yaWVzOiAoeyBsYWJlbDogc3RyaW5nOyBvcmRlcjogbnVtYmVyIH0gfCB1bmRlZmluZWQpW10gPSBbXTtcblxuXHRwcml2YXRlIHVwZGF0ZU9wdGlvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5zZWxlY3RlZCA9IDA7XG5cdFx0dGhpcy5kZWJ1Z09wdGlvbnMgPSBbXTtcblx0XHR0aGlzLm9wdGlvbkNhdGVnb3JpZXMgPSBbXTtcblx0XHRjb25zdCBtYW5hZ2VyID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Q29uZmlndXJhdGlvbk1hbmFnZXIoKTtcblx0XHRjb25zdCBpbldvcmtzcGFjZSA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFO1xuXHRcdGxldCBsYXN0R3JvdXA6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZ3JvdXBPcmRlciA9IDA7XG5cblx0XHRjb25zdCBwdXNoT3B0aW9uID0gKG9wdGlvbjogeyBsYWJlbDogc3RyaW5nOyBoYW5kbGVyOiAoKCkgPT4gUHJvbWlzZTxib29sZWFuPikgfSwgY2F0ZWdvcnk6IHsgbGFiZWw6IHN0cmluZzsgb3JkZXI6IG51bWJlciB9IHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHR0aGlzLmRlYnVnT3B0aW9ucy5wdXNoKG9wdGlvbik7XG5cdFx0XHR0aGlzLm9wdGlvbkNhdGVnb3JpZXMucHVzaChjYXRlZ29yeSk7XG5cdFx0fTtcblxuXHRcdG1hbmFnZXIuZ2V0QWxsQ29uZmlndXJhdGlvbnMoKS5mb3JFYWNoKCh7IGxhdW5jaCwgbmFtZSwgcHJlc2VudGF0aW9uIH0pID0+IHtcblx0XHRcdGlmIChsYXN0R3JvdXAgIT09IHByZXNlbnRhdGlvbj8uZ3JvdXApIHtcblx0XHRcdFx0bGFzdEdyb3VwID0gcHJlc2VudGF0aW9uPy5ncm91cDtcblx0XHRcdFx0aWYgKHRoaXMuZGVidWdPcHRpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRcdGdyb3VwT3JkZXIrKztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKG5hbWUgPT09IG1hbmFnZXIuc2VsZWN0ZWRDb25maWd1cmF0aW9uLm5hbWUgJiYgbGF1bmNoID09PSBtYW5hZ2VyLnNlbGVjdGVkQ29uZmlndXJhdGlvbi5sYXVuY2gpIHtcblx0XHRcdFx0dGhpcy5zZWxlY3RlZCA9IHRoaXMuZGVidWdPcHRpb25zLmxlbmd0aDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGFiZWwgPSBpbldvcmtzcGFjZSA/IGAke25hbWV9ICgke2xhdW5jaC5uYW1lfSlgIDogbmFtZTtcblx0XHRcdHB1c2hPcHRpb24oe1xuXHRcdFx0XHRsYWJlbCwgaGFuZGxlcjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IG1hbmFnZXIuc2VsZWN0Q29uZmlndXJhdGlvbihsYXVuY2gsIG5hbWUpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCB7IGxhYmVsOiBgY29uZmlndXJhdGlvbnMtJHtncm91cE9yZGVyfWAsIG9yZGVyOiBncm91cE9yZGVyIH0pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gT25seSB0YWtlIDMgZWxlbWVudHMgZnJvbSB0aGUgcmVjZW50IGR5bmFtaWMgY29uZmlndXJhdGlvbnMgdG8gbm90IGNsdXR0ZXIgdGhlIGRyb3Bkb3duXG5cdFx0bWFuYWdlci5nZXRSZWNlbnREeW5hbWljQ29uZmlndXJhdGlvbnMoKS5zbGljZSgwLCAzKS5mb3JFYWNoKCh7IG5hbWUsIHR5cGUgfSkgPT4ge1xuXHRcdFx0aWYgKHR5cGUgPT09IG1hbmFnZXIuc2VsZWN0ZWRDb25maWd1cmF0aW9uLnR5cGUgJiYgbWFuYWdlci5zZWxlY3RlZENvbmZpZ3VyYXRpb24ubmFtZSA9PT0gbmFtZSkge1xuXHRcdFx0XHR0aGlzLnNlbGVjdGVkID0gdGhpcy5kZWJ1Z09wdGlvbnMubGVuZ3RoO1xuXHRcdFx0fVxuXHRcdFx0cHVzaE9wdGlvbih7XG5cdFx0XHRcdGxhYmVsOiBuYW1lLFxuXHRcdFx0XHRoYW5kbGVyOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgbWFuYWdlci5zZWxlY3RDb25maWd1cmF0aW9uKHVuZGVmaW5lZCwgbmFtZSwgdW5kZWZpbmVkLCB7IHR5cGUgfSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0sIHsgbGFiZWw6ICdyZWNlbnQtZHluYW1pYycsIG9yZGVyOiAxMDAgfSk7XG5cdFx0fSk7XG5cblx0XHRpZiAodGhpcy5kZWJ1Z09wdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRwdXNoT3B0aW9uKHsgbGFiZWw6IG5scy5sb2NhbGl6ZSgnbm9Db25maWd1cmF0aW9ucycsIFwiTm8gQ29uZmlndXJhdGlvbnNcIiksIGhhbmRsZXI6IGFzeW5jICgpID0+IGZhbHNlIH0sIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5wcm92aWRlcnMuZm9yRWFjaChwID0+IHtcblx0XHRcdHB1c2hPcHRpb24oe1xuXHRcdFx0XHRsYWJlbDogYCR7cC5sYWJlbH0uLi5gLFxuXHRcdFx0XHRoYW5kbGVyOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcGlja2VkID0gYXdhaXQgcC5waWNrKCk7XG5cdFx0XHRcdFx0aWYgKHBpY2tlZCkge1xuXHRcdFx0XHRcdFx0YXdhaXQgbWFuYWdlci5zZWxlY3RDb25maWd1cmF0aW9uKHBpY2tlZC5sYXVuY2gsIHBpY2tlZC5jb25maWcubmFtZSwgcGlja2VkLmNvbmZpZywgeyB0eXBlOiBwLnR5cGUgfSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCB7IGxhYmVsOiAnYWN0aW9ucycsIG9yZGVyOiAyMDAgfSk7XG5cdFx0fSk7XG5cblx0XHRtYW5hZ2VyLmdldExhdW5jaGVzKCkuZmlsdGVyKGwgPT4gIWwuaGlkZGVuKS5mb3JFYWNoKGwgPT4ge1xuXHRcdFx0Y29uc3QgbGFiZWwgPSBpbldvcmtzcGFjZSA/IG5scy5sb2NhbGl6ZShcImFkZENvbmZpZ1RvXCIsIFwiQWRkIENvbmZpZyAoezB9KS4uLlwiLCBsLm5hbWUpIDogbmxzLmxvY2FsaXplKCdhZGRDb25maWd1cmF0aW9uJywgXCJBZGQgQ29uZmlndXJhdGlvbi4uLlwiKTtcblx0XHRcdHB1c2hPcHRpb24oe1xuXHRcdFx0XHRsYWJlbCwgaGFuZGxlcjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQUREX0NPTkZJR1VSQVRJT05fSUQsIGwudXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgeyBsYWJlbDogJ2FjdGlvbnMnLCBvcmRlcjogMjAwIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZW5kZXJEcm9wZG93bkxhYmVsKCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRBcmlhTGFiZWwodGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGxldCBhcmlhTGFiZWwgPSB0aXRsZTtcblx0XHRsZXQga2V5YmluZGluZzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHZlcmJvc2UgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuRGVidWcpO1xuXHRcdGlmICh2ZXJib3NlKSB7XG5cdFx0XHRrZXliaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKEFjY2Vzc2liaWxpdHlDb21tYW5kSWQuT3BlbkFjY2Vzc2liaWxpdHlIZWxwLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKT8uZ2V0TGFiZWwoKSA/PyB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChrZXliaW5kaW5nKSB7XG5cdFx0XHRhcmlhTGFiZWwgPSBubHMubG9jYWxpemUoJ2NvbW1lbnRMYWJlbFdpdGhLZXliaW5kaW5nJywgXCJ7MH0sIHVzZSAoezF9KSBmb3IgYWNjZXNzaWJpbGl0eSBoZWxwXCIsIGFyaWFMYWJlbCwga2V5YmluZGluZyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFyaWFMYWJlbCA9IG5scy5sb2NhbGl6ZSgnY29tbWVudExhYmVsV2l0aEtleWJpbmRpbmdOb0tleWJpbmRpbmcnLCBcInswfSwgcnVuIHRoZSBjb21tYW5kIE9wZW4gQWNjZXNzaWJpbGl0eSBIZWxwIHdoaWNoIGlzIGN1cnJlbnRseSBub3QgdHJpZ2dlcmFibGUgdmlhIGtleWJpbmRpbmcuXCIsIGFyaWFMYWJlbCk7XG5cdFx0fVxuXHRcdHRoaXMuc3RhcnQuYXJpYUxhYmVsID0gYXJpYUxhYmVsO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBGb2N1c1Nlc3Npb25BY3Rpb25WaWV3SXRlbSBleHRlbmRzIFNlbGVjdEFjdGlvblZpZXdJdGVtPElEZWJ1Z1Nlc3Npb24+IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBJQWN0aW9uLFxuXHRcdHNlc3Npb246IElEZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIobnVsbCwgYWN0aW9uLCBbXSwgLTEsIGNvbnRleHRWaWV3U2VydmljZSwgZGVmYXVsdFNlbGVjdEJveFN0eWxlcywgeyBhcmlhTGFiZWw6IG5scy5sb2NhbGl6ZSgnZGVidWdTZXNzaW9uJywgJ0RlYnVnIFNlc3Npb24nKSwgdXNlQ3VzdG9tRHJhd246ICFoYXNOYXRpdmVDb250ZXh0TWVudShjb25maWd1cmF0aW9uU2VydmljZSkgfSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5vbkRpZEZvY3VzU2Vzc2lvbigoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5nZXRTZWxlY3RlZFNlc3Npb24oKTtcblx0XHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5nZXRTZXNzaW9ucygpLmluZGV4T2Yoc2Vzc2lvbik7XG5cdFx0XHRcdHRoaXMuc2VsZWN0KGluZGV4KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZXNzaW9uTGlzdGVuZXJzU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IHJlZ2lzdGVyU2Vzc2lvbkxpc3RlbmVycyA9IChzZXNzaW9uOiBJRGVidWdTZXNzaW9uKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uTGlzdGVuZXJzID0gc2Vzc2lvbkxpc3RlbmVyc1N0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdFx0c2Vzc2lvbkxpc3RlbmVycy5hZGQoc2Vzc2lvbi5vbkRpZENoYW5nZU5hbWUoKCkgPT4gdGhpcy51cGRhdGUoKSkpO1xuXHRcdFx0c2Vzc2lvbkxpc3RlbmVycy5hZGQoc2Vzc2lvbi5vbkRpZEVuZEFkYXB0ZXIoKCkgPT4gc2Vzc2lvbkxpc3RlbmVyc1N0b3JlLmRlbGV0ZShzZXNzaW9uTGlzdGVuZXJzKSkpO1xuXHRcdH07XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWJ1Z1NlcnZpY2Uub25EaWROZXdTZXNzaW9uKHNlc3Npb24gPT4ge1xuXHRcdFx0cmVnaXN0ZXJTZXNzaW9uTGlzdGVuZXJzKHNlc3Npb24pO1xuXHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHR9KSk7XG5cdFx0Ly8gQXBwbHkgdGhlIHNhbWUgcGF0dGVybiB0byBleGlzdGluZyBzZXNzaW9ucyAtIHRyYWNrIGxpc3RlbmVycyBmb3IgY2xlYW51cFxuXHRcdHRoaXMuZ2V0U2Vzc2lvbnMoKS5mb3JFYWNoKHJlZ2lzdGVyU2Vzc2lvbkxpc3RlbmVycyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWJ1Z1NlcnZpY2Uub25EaWRFbmRTZXNzaW9uKCgpID0+IHRoaXMudXBkYXRlKCkpKTtcblxuXHRcdGNvbnN0IHNlbGVjdGVkU2Vzc2lvbiA9IHNlc3Npb24gPyB0aGlzLm1hcEZvY3VzZWRTZXNzaW9uVG9TZWxlY3RlZChzZXNzaW9uKSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLnVwZGF0ZShzZWxlY3RlZFNlc3Npb24pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldEFjdGlvbkNvbnRleHQoXzogc3RyaW5nLCBpbmRleDogbnVtYmVyKTogSURlYnVnU2Vzc2lvbiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U2Vzc2lvbnMoKVtpbmRleF07XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZShzZXNzaW9uPzogSURlYnVnU2Vzc2lvbikge1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0c2Vzc2lvbiA9IHRoaXMuZ2V0U2VsZWN0ZWRTZXNzaW9uKCk7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25zID0gdGhpcy5nZXRTZXNzaW9ucygpO1xuXHRcdGNvbnN0IG5hbWVzID0gc2Vzc2lvbnMubWFwKHMgPT4ge1xuXHRcdFx0Y29uc3QgbGFiZWwgPSBzLmdldExhYmVsKCk7XG5cdFx0XHRpZiAocy5wYXJlbnRTZXNzaW9uKSB7XG5cdFx0XHRcdC8vIEluZGVudCBjaGlsZCBzZXNzaW9ucyBzbyB0aGV5IGxvb2sgbGlrZSBjaGlsZHJlblxuXHRcdFx0XHRyZXR1cm4gYFxcdTAwQTBcXHUwMEEwJHtsYWJlbH1gO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbGFiZWw7XG5cdFx0fSk7XG5cdFx0dGhpcy5zZXRPcHRpb25zKG5hbWVzLm1hcCgoZGF0YSk6IElTZWxlY3RPcHRpb25JdGVtID0+ICh7IHRleHQ6IGRhdGEgfSkpLCBzZXNzaW9uID8gc2Vzc2lvbnMuaW5kZXhPZihzZXNzaW9uKSA6IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFNlbGVjdGVkU2Vzc2lvbigpOiBJRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFNlc3Npb247XG5cdFx0cmV0dXJuIHNlc3Npb24gPyB0aGlzLm1hcEZvY3VzZWRTZXNzaW9uVG9TZWxlY3RlZChzZXNzaW9uKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRTZXNzaW9ucygpOiBSZWFkb25seUFycmF5PElEZWJ1Z1Nlc3Npb24+IHtcblx0XHRjb25zdCBzaG93U3ViU2Vzc2lvbnMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElEZWJ1Z0NvbmZpZ3VyYXRpb24+KCdkZWJ1ZycpLnNob3dTdWJTZXNzaW9uc0luVG9vbEJhcjtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0U2Vzc2lvbnMoKTtcblxuXHRcdHJldHVybiBzaG93U3ViU2Vzc2lvbnMgPyBzZXNzaW9ucyA6IHNlc3Npb25zLmZpbHRlcihzID0+ICFzLnBhcmVudFNlc3Npb24pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG1hcEZvY3VzZWRTZXNzaW9uVG9TZWxlY3RlZChmb2N1c2VkU2Vzc2lvbjogSURlYnVnU2Vzc2lvbik6IElEZWJ1Z1Nlc3Npb24ge1xuXHRcdGNvbnN0IHNob3dTdWJTZXNzaW9ucyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJykuc2hvd1N1YlNlc3Npb25zSW5Ub29sQmFyO1xuXHRcdHdoaWxlIChmb2N1c2VkU2Vzc2lvbi5wYXJlbnRTZXNzaW9uICYmICFzaG93U3ViU2Vzc2lvbnMpIHtcblx0XHRcdGZvY3VzZWRTZXNzaW9uID0gZm9jdXNlZFNlc3Npb24ucGFyZW50U2Vzc2lvbjtcblx0XHR9XG5cdFx0cmV0dXJuIGZvY3VzZWRTZXNzaW9uO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUVyQixTQUFTLGVBQWU7QUFDeEIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBcUUsYUFBYTtBQUMzRixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGNBQWMsa0JBQWtCLHFCQUFxQjtBQUM5RCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUEwQixzQkFBc0I7QUFDekQsU0FBUyxpQkFBOEIsU0FBUyxvQkFBb0I7QUFDcEUsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxvQkFBZ0QsNEJBQTRCO0FBQ3JGLFNBQVMsa0JBQWtC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Z0IsQ0FBQUEsYUFBVztBQUMzRCwrQkFBeUJBLFFBQU87QUFDaEMsV0FBSyxPQUFPO0FBQUEsSUFDYixDQUFDLENBQUM7QUFFRixTQUFLLFlBQVksRUFBRSxRQUFRLHdCQUF3QjtBQUNuRCxTQUFLLFVBQVUsS0FBSyxhQUFhLGdCQUFnQixNQUFNLEtBQUssT0FBTyxDQUFDLENBQUM7QUFFckUsVUFBTSxrQkFBa0IsVUFBVSxLQUFLLDRCQUE0QixPQUFPLElBQUk7QUFDOUUsU0FBSyxPQUFPLGVBQWU7QUFBQSxFQUM1QjtBQUFBLEVBRW1CLGlCQUFpQixHQUFXLE9BQThCO0FBQzVFLFdBQU8sS0FBSyxZQUFZLEVBQUUsS0FBSztBQUFBLEVBQ2hDO0FBQUEsRUFFUSxPQUFPLFNBQXlCO0FBQ3ZDLFFBQUksQ0FBQyxTQUFTO0FBQ2IsZ0JBQVUsS0FBSyxtQkFBbUI7QUFBQSxJQUNuQztBQUNBLFVBQU0sV0FBVyxLQUFLLFlBQVk7QUFDbEMsVUFBTSxRQUFRLFNBQVMsSUFBSSxPQUFLO0FBQy9CLFlBQU0sUUFBUSxFQUFFLFNBQVM7QUFDekIsVUFBSSxFQUFFLGVBQWU7QUFFcEIsZUFBTyxXQUFlLEtBQUs7QUFBQSxNQUM1QjtBQUVBLGFBQU87QUFBQSxJQUNSLENBQUM7QUFDRCxTQUFLLFdBQVcsTUFBTSxJQUFJLENBQUMsVUFBNkIsRUFBRSxNQUFNLEtBQUssRUFBRSxHQUFHLFVBQVUsU0FBUyxRQUFRLE9BQU8sSUFBSSxNQUFTO0FBQUEsRUFDMUg7QUFBQSxFQUVRLHFCQUFnRDtBQUN2RCxVQUFNLFVBQVUsS0FBSyxhQUFhLGFBQWEsRUFBRTtBQUNqRCxXQUFPLFVBQVUsS0FBSyw0QkFBNEIsT0FBTyxJQUFJO0FBQUEsRUFDOUQ7QUFBQSxFQUVVLGNBQTRDO0FBQ3JELFVBQU0sa0JBQWtCLEtBQUsscUJBQXFCLFNBQThCLE9BQU8sRUFBRTtBQUN6RixVQUFNLFdBQVcsS0FBSyxhQUFhLFNBQVMsRUFBRSxZQUFZO0FBRTFELFdBQU8sa0JBQWtCLFdBQVcsU0FBUyxPQUFPLE9BQUssQ0FBQyxFQUFFLGFBQWE7QUFBQSxFQUMxRTtBQUFBLEVBRVUsNEJBQTRCLGdCQUE4QztBQUNuRixVQUFNLGtCQUFrQixLQUFLLHFCQUFxQixTQUE4QixPQUFPLEVBQUU7QUFDekYsV0FBTyxlQUFlLGlCQUFpQixDQUFDLGlCQUFpQjtBQUN4RCx1QkFBaUIsZUFBZTtBQUFBLElBQ2pDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQTVFYSw2QkFBTjtBQUFBLEVBSUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBTlU7IiwKICAibmFtZXMiOiBbInNlc3Npb24iXQp9Cg==
