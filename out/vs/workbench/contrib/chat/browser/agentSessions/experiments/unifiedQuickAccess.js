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
import "./media/unifiedQuickAccess.css";
import { $, addDisposableListener, EventType } from "../../../../../../base/browser/dom.js";
import { Disposable, DisposableStore, isDisposable } from "../../../../../../base/common/lifecycle.js";
import { IQuickInputService } from "../../../../../../platform/quickinput/common/quickInput.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { localize } from "../../../../../../nls.js";
import { Radio } from "../../../../../../base/browser/ui/radio/radio.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { Extensions } from "../../../../../../platform/quickinput/common/quickAccess.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { createInstantHoverDelegate, getDefaultHoverDelegate } from "../../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { renderIcon } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Event } from "../../../../../../base/common/event.js";
import { ILayoutService } from "../../../../../../platform/layout/browser/layoutService.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { ACTION_ID_NEW_CHAT, CHAT_OPEN_ACTION_ID } from "../../actions/chatActions.js";
const SEND_TO_AGENT_ID = "unified-quick-access-send-to-agent";
const DEFAULT_UNIFIED_QUICK_ACCESS_TABS = [
  {
    id: "agentSessions",
    label: localize("agentSessionsTab", "Sessions"),
    prefix: "agent ",
    placeholder: localize("agentSessionsPlaceholder", "Search sessions or type a message..."),
    tooltip: localize("agentSessionsTooltip", "Search sessions or send a message to agent")
  },
  {
    id: "commands",
    label: localize("commandsTab", "Commands"),
    prefix: ">",
    placeholder: localize("commandsPlaceholder", "Search commands..."),
    tooltip: localize("commandsTooltip", "Run commands")
  },
  {
    id: "files",
    label: localize("filesTab", "Files"),
    prefix: "",
    placeholder: localize("filesPlaceholder", "Search files..."),
    tooltip: localize("filesTooltip", "Go to files")
  }
];
let UnifiedQuickAccess = class extends Disposable {
  constructor(tabs, quickInputService, instantiationService, contextKeyService, layoutService, commandService, keybindingService, hoverService) {
    super();
    this.quickInputService = quickInputService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.layoutService = layoutService;
    this.commandService = commandService;
    this.keybindingService = keybindingService;
    this.hoverService = hoverService;
    this.registry = Registry.as(Extensions.Quickaccess);
    this.mapProviderToDescriptor = /* @__PURE__ */ new Map();
    this._currentDisposables = this._register(new DisposableStore());
    this._providerDisposables = this._register(new DisposableStore());
    this._isInternalValueChange = false;
    // Flag to prevent recursive tab detection
    this._isUpdatingSendToAgent = false;
    this._tabs = tabs ?? DEFAULT_UNIFIED_QUICK_ACCESS_TABS;
  }
  /**
   * Show the unified quick access widget.
   * @param initialTabId Optional tab ID to start with. Defaults to first tab.
   * @param initialValue Optional initial filter value.
   */
  show(initialTabId, initialValue) {
    if (this._currentPicker) {
      return;
    }
    this._currentDisposables.clear();
    const picker = this._currentDisposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
    this._currentPicker = picker;
    picker.ignoreFocusOut = false;
    picker.matchOnDescription = true;
    picker.matchOnDetail = true;
    picker.sortByLabel = false;
    const initialTab = initialTabId ? this._tabs.find((t) => t.id === initialTabId) ?? this._tabs[0] : this._tabs[0];
    this._currentTab = initialTab;
    this._injectTabBar(picker);
    this._isInternalValueChange = true;
    picker.value = initialValue ?? "";
    picker.placeholder = initialTab.placeholder;
    this._isInternalValueChange = false;
    this._activateProvider(initialTab, picker);
    this._currentDisposables.add(picker.onDidChangeValue((value) => {
      if (this._isInternalValueChange) {
        return;
      }
      if (this._arrivedViaShortcut) {
        const shortcut = this._arrivedViaShortcut;
        if (!value.startsWith(shortcut)) {
          const filesTab = this._tabs.find((t) => t.id === "files");
          if (filesTab && filesTab !== this._currentTab) {
            this._arrivedViaShortcut = void 0;
            this._switchTab(filesTab, picker, false);
            return;
          }
        }
      }
      const matchingTab = this._detectTabFromValue(value);
      if (matchingTab && matchingTab !== this._currentTab) {
        this._switchTab(matchingTab, picker, true);
      }
      this._updateSendButtonState(value);
      if (this._sendToAgentTimeout) {
        clearTimeout(this._sendToAgentTimeout);
      }
      this._sendToAgentTimeout = setTimeout(() => this._maybeShowSendToAgent(picker), 150);
    }));
    this._currentDisposables.add(picker.onDidAccept(() => {
      const selectedItems = picker.selectedItems;
      const activeItems = picker.activeItems;
      const sendToAgentSelected = selectedItems.length > 0 && selectedItems[0].id === SEND_TO_AGENT_ID;
      const hasRealActiveItem = activeItems.some(
        (item) => item.id !== SEND_TO_AGENT_ID
      );
      let filterText;
      if (this._arrivedViaShortcut && picker.value.startsWith(this._arrivedViaShortcut)) {
        filterText = picker.value.substring(1).trim();
      } else if (this._currentTab) {
        filterText = picker.value.substring(this._currentTab.prefix.length).trim();
      } else {
        filterText = picker.value.trim();
      }
      if (sendToAgentSelected || !hasRealActiveItem && filterText) {
        this._sendMessage(picker.value);
      }
    }));
    this._currentDisposables.add(picker.onDidHide(() => {
      this._providerDisposables.clear();
      this._providerCts?.cancel();
      this._providerCts = void 0;
      this._currentPicker = void 0;
      this._currentTab = void 0;
      this._arrivedViaShortcut = void 0;
      if (this._sendToAgentTimeout) {
        clearTimeout(this._sendToAgentTimeout);
        this._sendToAgentTimeout = void 0;
      }
      this._tabBarContainer?.remove();
      this._tabBarContainer = void 0;
      this._sendButton = void 0;
      this._sendButtonLabel = void 0;
      this._sendButtonIcon = void 0;
      this._sendButtonHover = void 0;
      this._currentDisposables.clear();
    }));
    picker.show();
  }
  /**
   * Hide the unified quick access widget if visible.
   */
  hide() {
    this._currentPicker?.hide();
  }
  /**
   * Check if the widget is currently visible.
   */
  get isVisible() {
    return !!this._currentPicker;
  }
  /**
   * Inject the custom tab bar into the picker's header area.
   */
  _injectTabBar(picker) {
    const showDisposable = this._currentDisposables.add(Event.once(this.quickInputService.onShow)(() => {
      this._currentDisposables.delete(showDisposable);
      const quickInputWidget = this.layoutService.activeContainer.querySelector(".quick-input-widget");
      if (!quickInputWidget) {
        return;
      }
      const header = quickInputWidget.querySelector(".quick-input-header");
      const list = quickInputWidget.querySelector(".quick-input-list");
      if (!header || !list) {
        return;
      }
      const tabBarContainer = $("div.unified-quick-access-tabs");
      this._tabBarContainer = tabBarContainer;
      const hoverDelegate = this._currentDisposables.add(createInstantHoverDelegate());
      const radioItems = this._tabs.map((tab) => ({
        text: tab.label,
        tooltip: tab.tooltip,
        isActive: tab === this._currentTab
      }));
      const radio = this._currentDisposables.add(new Radio({
        items: radioItems,
        hoverDelegate
      }));
      tabBarContainer.appendChild(radio.domNode);
      this._currentDisposables.add(radio.onDidSelect((index) => {
        const selectedTab = this._tabs[index];
        if (selectedTab && selectedTab !== this._currentTab) {
          this._switchTab(selectedTab, picker, false);
        }
      }));
      const sendButton = this._createSendButton(picker);
      tabBarContainer.appendChild(sendButton);
      list.parentElement?.insertBefore(tabBarContainer, list);
      picker._unifiedRadio = radio;
    }));
  }
  /**
   * Create the send button.
   */
  _createSendButton(picker) {
    const container = $("div.unified-quick-access-send-container");
    const button = $("button.unified-send-button");
    button.setAttribute("type", "button");
    this._sendButton = button;
    const icon = renderIcon(Codicon.send);
    icon.classList.add("unified-send-icon");
    this._sendButtonIcon = icon;
    button.appendChild(icon);
    const labelSpan = $("span.unified-send-label");
    this._sendButtonLabel = labelSpan;
    button.appendChild(labelSpan);
    container.appendChild(button);
    this._sendButtonHover = this._currentDisposables.add(
      this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), button, "")
    );
    this._updateSendButtonState(picker.value);
    this._currentDisposables.add(addDisposableListener(button, EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      const hasInput = picker.value.trim().length > 0;
      if (hasInput) {
        this._sendMessageRaw(picker.value);
      } else {
        this._openChat();
      }
    }));
    return container;
  }
  /**
   * Update the send button label and tooltip based on input state.
   */
  _updateSendButtonState(value) {
    if (!this._sendButton || !this._sendButtonLabel || !this._sendButtonIcon) {
      return;
    }
    const hasInput = value.trim().length > 0;
    if (hasInput) {
      this._sendButtonLabel.textContent = localize("send", "Send");
      this._sendButtonHover?.update(localize("sendTooltipNoKeybinding", "Send message to new agent session"));
      this._sendButtonIcon.style.display = "";
    } else {
      const openChatKeybinding = this.keybindingService.lookupKeybinding(CHAT_OPEN_ACTION_ID);
      const openChatLabel = openChatKeybinding?.getLabel() ?? "";
      this._sendButtonLabel.textContent = localize("openChat", "Open Chat");
      const tooltip = openChatLabel ? localize("openChatTooltipWithKeybinding", "Open chat ({0})", openChatLabel) : localize("openChatTooltipNoKeybinding", "Open chat");
      this._sendButtonHover?.update(tooltip);
      this._sendButtonIcon.style.display = "none";
    }
  }
  /**
   * Open chat without sending a message.
   */
  _openChat() {
    this.hide();
    this.commandService.executeCommand(CHAT_OPEN_ACTION_ID);
  }
  /**
   * Send the exact message to a new agent session (no prefix stripping).
   */
  async _sendMessageRaw(value) {
    const message = value.trim();
    if (!message) {
      return;
    }
    this.hide();
    await this.commandService.executeCommand(ACTION_ID_NEW_CHAT);
    const options = {
      query: message,
      isPartialQuery: false
    };
    this.commandService.executeCommand(CHAT_OPEN_ACTION_ID, options);
  }
  /**
   * Send the current message to a new agent session (strips prefix or shortcut character).
   */
  async _sendMessage(value) {
    let message = value;
    if (this._arrivedViaShortcut && message.startsWith(this._arrivedViaShortcut)) {
      message = message.substring(1).trim();
    } else if (this._currentTab) {
      if (value.startsWith(this._currentTab.prefix)) {
        message = value.substring(this._currentTab.prefix.length).trim();
      }
    }
    if (!message) {
      return;
    }
    this.hide();
    await this.commandService.executeCommand(ACTION_ID_NEW_CHAT);
    const options = {
      query: message,
      isPartialQuery: false
    };
    this.commandService.executeCommand(CHAT_OPEN_ACTION_ID, options);
  }
  /**
   * Check if we should show the "send to agent" item.
   * Always shows it as the first item when user has typed something.
   */
  _maybeShowSendToAgent(picker) {
    if (this._isUpdatingSendToAgent) {
      return;
    }
    let filterText;
    if (this._arrivedViaShortcut && picker.value.startsWith(this._arrivedViaShortcut)) {
      filterText = picker.value.substring(1).trim();
    } else if (this._currentTab) {
      filterText = picker.value.substring(this._currentTab.prefix.length).trim();
    } else {
      filterText = picker.value.trim();
    }
    const fullInput = picker.value.trim();
    const messageToSend = filterText || fullInput;
    if (!messageToSend) {
      return;
    }
    if (picker.busy) {
      return;
    }
    const firstItem = picker.items[0];
    if (firstItem?.id === SEND_TO_AGENT_ID && firstItem.description === fullInput) {
      return;
    }
    const sendItem = {
      id: SEND_TO_AGENT_ID,
      label: `$(send) ${localize("sendToAgentLabel", "Send to agent")}`,
      description: fullInput,
      alwaysShow: true,
      ariaLabel: localize("sendToAgentAria", "Send message to agent: {0}", fullInput)
    };
    const currentItems = picker.items.filter(
      (item) => item.id !== SEND_TO_AGENT_ID
    );
    const isSessionsTab = this._currentTab?.id === "agentSessions";
    const hasOtherItems = currentItems.length > 0;
    const showFirst = isSessionsTab || !hasOtherItems;
    this._isUpdatingSendToAgent = true;
    try {
      if (showFirst) {
        picker.items = [sendItem, ...currentItems];
      } else {
        picker.items = currentItems;
      }
    } finally {
      this._isUpdatingSendToAgent = false;
    }
  }
  /**
   * Switch to a different tab.
   */
  _switchTab(tab, picker, preserveFilterText) {
    if (tab === this._currentTab) {
      return;
    }
    const previousTab = this._currentTab;
    this._currentTab = tab;
    const radio = picker._unifiedRadio;
    if (radio) {
      const index = this._tabs.indexOf(tab);
      if (index >= 0) {
        radio.setActiveItem(index);
      }
    }
    this._isInternalValueChange = true;
    if (preserveFilterText && previousTab) {
      const currentValue = picker.value;
      let filterText = currentValue;
      if (currentValue.startsWith(previousTab.prefix)) {
        filterText = currentValue.substring(previousTab.prefix.length);
      }
      if (this._arrivedViaShortcut === "<" && tab.id === "agentSessions") {
        filterText = filterText.replace(/^<+/, "");
        picker.value = "<" + filterText;
      } else if (this._arrivedViaShortcut === ">" && tab.id === "commands") {
        filterText = filterText.replace(/^>+/, "");
        picker.value = ">" + filterText;
      } else {
        picker.value = tab.prefix + filterText;
      }
    } else if (previousTab) {
      const currentValue = picker.value;
      if (currentValue.startsWith(previousTab.prefix)) {
        picker.value = currentValue.substring(previousTab.prefix.length);
      }
      if (picker.value.startsWith("<") || picker.value.startsWith(">")) {
        picker.value = picker.value.substring(1);
      }
      this._arrivedViaShortcut = void 0;
    }
    this._isInternalValueChange = false;
    picker.placeholder = tab.placeholder;
    this._activateProvider(tab, picker);
  }
  /**
   * Detect which tab matches the current value based on prefix.
   * Only switches away from current tab if user explicitly typed a different prefix.
   * Supports shortcut keys: ">" for Commands, "<" for Sessions.
   */
  _detectTabFromValue(value) {
    if (value === "<" || value.startsWith("<")) {
      const sessionsTab = this._tabs.find((t) => t.id === "agentSessions");
      if (sessionsTab && this._currentTab?.id !== "agentSessions") {
        this._arrivedViaShortcut = "<";
        return sessionsTab;
      }
    }
    if (value === ">" || value.startsWith(">")) {
      const commandsTab = this._tabs.find((t) => t.id === "commands");
      if (commandsTab && this._currentTab?.id !== "commands") {
        this._arrivedViaShortcut = ">";
        return commandsTab;
      }
    }
    if (this._currentTab && value.startsWith(this._currentTab.prefix)) {
      return this._currentTab;
    }
    const sortedTabs = [...this._tabs].filter((tab) => tab.prefix.length > 0).sort((a, b) => b.prefix.length - a.prefix.length);
    return sortedTabs.find((tab) => value.startsWith(tab.prefix));
  }
  /**
   * Activate the provider for a given tab.
   */
  _activateProvider(tab, picker) {
    this._providerDisposables.clear();
    this._providerCts?.cancel();
    this._providerCts = new CancellationTokenSource();
    this._providerDisposables.add(this._providerCts);
    if (tab.isSendTab) {
      picker.busy = false;
      picker.items = [{
        label: localize("pressSendOrEnter", "Press Enter or click Send to create a new agent session"),
        alwaysShow: true
      }];
      return;
    }
    picker.items = [];
    picker.busy = true;
    const [provider] = this._getOrInstantiateProvider(tab.prefix);
    if (provider) {
      const tabPrefix = tab.prefix;
      const arrivedViaShortcut = this._arrivedViaShortcut;
      picker.filterValue = (value) => {
        if (arrivedViaShortcut && value.startsWith(arrivedViaShortcut)) {
          return value.substring(1);
        }
        if (value.startsWith(tabPrefix)) {
          return value.substring(tabPrefix.length);
        }
        return value;
      };
      const providerDisposable = provider.provide(picker, this._providerCts.token);
      this._providerDisposables.add(providerDisposable);
    } else {
      picker.busy = false;
      picker.items = [{
        label: localize("noProvider", "No provider available for this tab"),
        alwaysShow: true
      }];
    }
  }
  /**
   * Get or create a provider instance for the given prefix.
   */
  _getOrInstantiateProvider(prefix) {
    const providerDescriptor = this.registry.getQuickAccessProvider(prefix, this.contextKeyService);
    if (!providerDescriptor) {
      return [void 0, void 0];
    }
    let provider = this.mapProviderToDescriptor.get(providerDescriptor);
    if (!provider) {
      provider = this.instantiationService.createInstance(providerDescriptor.ctor);
      this.mapProviderToDescriptor.set(providerDescriptor, provider);
    }
    return [provider, providerDescriptor];
  }
  dispose() {
    this._providerCts?.cancel();
    for (const provider of this.mapProviderToDescriptor.values()) {
      if (isDisposable(provider)) {
        provider.dispose();
      }
    }
    super.dispose();
  }
};
UnifiedQuickAccess = __decorateClass([
  __decorateParam(1, IQuickInputService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, ILayoutService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, IHoverService)
], UnifiedQuickAccess);
export {
  DEFAULT_UNIFIED_QUICK_ACCESS_TABS,
  UnifiedQuickAccess
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGV4cGVyaW1lbnRzXFx1bmlmaWVkUXVpY2tBY2Nlc3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvdW5pZmllZFF1aWNrQWNjZXNzLmNzcyc7XG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIEV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBpc0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBSYWRpbywgSVJhZGlvT3B0aW9uSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9yYWRpby9yYWRpby5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJUXVpY2tBY2Nlc3NQcm92aWRlciwgSVF1aWNrQWNjZXNzUHJvdmlkZXJEZXNjcmlwdG9yLCBJUXVpY2tBY2Nlc3NSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgY3JlYXRlSW5zdGFudEhvdmVyRGVsZWdhdGUsIGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyByZW5kZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUxheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IEFDVElPTl9JRF9ORVdfQ0hBVCwgQ0hBVF9PUEVOX0FDVElPTl9JRCwgSUNoYXRWaWV3T3Blbk9wdGlvbnMgfSBmcm9tICcuLi8uLi9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcblxuLyoqIE1hcmtlciBJRCBmb3IgdGhlIFwic2VuZCB0byBhZ2VudFwiIHF1aWNrIHBpY2sgaXRlbSAqL1xuY29uc3QgU0VORF9UT19BR0VOVF9JRCA9ICd1bmlmaWVkLXF1aWNrLWFjY2Vzcy1zZW5kLXRvLWFnZW50JztcblxuLyoqXG4gKiBUYWIgY29uZmlndXJhdGlvbiBmb3IgdGhlIHVuaWZpZWQgcXVpY2sgYWNjZXNzIHdpZGdldC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVW5pZmllZFF1aWNrQWNjZXNzVGFiIHtcblx0LyoqIFVuaXF1ZSBpZGVudGlmaWVyIGZvciB0aGUgdGFiICovXG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdC8qKiBEaXNwbGF5IGxhYmVsIGZvciB0aGUgdGFiICovXG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdC8qKiBRdWljayBhY2Nlc3MgcHJvdmlkZXIgcHJlZml4IChlLmcuLCAnJyBmb3IgZmlsZXMsICc+JyBmb3IgY29tbWFuZHMsICdhZ2VudCAnIGZvciBzZXNzaW9ucykgKi9cblx0cmVhZG9ubHkgcHJlZml4OiBzdHJpbmc7XG5cdC8qKiBQbGFjZWhvbGRlciB0ZXh0IHdoZW4gdGhpcyB0YWIgaXMgYWN0aXZlICovXG5cdHJlYWRvbmx5IHBsYWNlaG9sZGVyOiBzdHJpbmc7XG5cdC8qKiBUb29sdGlwIGZvciB0aGUgdGFiICovXG5cdHJlYWRvbmx5IHRvb2x0aXA/OiBzdHJpbmc7XG5cdC8qKiBXaGV0aGVyIHRoaXMgaXMgdGhlIHNwZWNpYWwgU2VuZCB0YWIgKG5vIHByb3ZpZGVyLCBqdXN0IHNlbmRzIHF1ZXJ5KSAqL1xuXHRyZWFkb25seSBpc1NlbmRUYWI/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIERlZmF1bHQgdGFicyBmb3IgdGhlIHVuaWZpZWQgcXVpY2sgYWNjZXNzIHdpZGdldC5cbiAqL1xuZXhwb3J0IGNvbnN0IERFRkFVTFRfVU5JRklFRF9RVUlDS19BQ0NFU1NfVEFCUzogSVVuaWZpZWRRdWlja0FjY2Vzc1RhYltdID0gW1xuXHR7XG5cdFx0aWQ6ICdhZ2VudFNlc3Npb25zJyxcblx0XHRsYWJlbDogbG9jYWxpemUoJ2FnZW50U2Vzc2lvbnNUYWInLCBcIlNlc3Npb25zXCIpLFxuXHRcdHByZWZpeDogJ2FnZW50ICcsXG5cdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdhZ2VudFNlc3Npb25zUGxhY2Vob2xkZXInLCBcIlNlYXJjaCBzZXNzaW9ucyBvciB0eXBlIGEgbWVzc2FnZS4uLlwiKSxcblx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9uc1Rvb2x0aXAnLCBcIlNlYXJjaCBzZXNzaW9ucyBvciBzZW5kIGEgbWVzc2FnZSB0byBhZ2VudFwiKSxcblx0fSxcblx0e1xuXHRcdGlkOiAnY29tbWFuZHMnLFxuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnY29tbWFuZHNUYWInLCBcIkNvbW1hbmRzXCIpLFxuXHRcdHByZWZpeDogJz4nLFxuXHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnY29tbWFuZHNQbGFjZWhvbGRlcicsIFwiU2VhcmNoIGNvbW1hbmRzLi4uXCIpLFxuXHRcdHRvb2x0aXA6IGxvY2FsaXplKCdjb21tYW5kc1Rvb2x0aXAnLCBcIlJ1biBjb21tYW5kc1wiKSxcblx0fSxcblx0e1xuXHRcdGlkOiAnZmlsZXMnLFxuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnZmlsZXNUYWInLCBcIkZpbGVzXCIpLFxuXHRcdHByZWZpeDogJycsXG5cdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdmaWxlc1BsYWNlaG9sZGVyJywgXCJTZWFyY2ggZmlsZXMuLi5cIiksXG5cdFx0dG9vbHRpcDogbG9jYWxpemUoJ2ZpbGVzVG9vbHRpcCcsIFwiR28gdG8gZmlsZXNcIiksXG5cdH0sXG5dO1xuXG4vKipcbiAqIFNlcnZpY2UgZm9yIHNob3dpbmcgYSB1bmlmaWVkIHF1aWNrIGFjY2VzcyB3aWRnZXQgd2l0aCBtdWx0aXBsZSB0YWJzLlxuICogQ29tYmluZXMgbXVsdGlwbGUgUXVpY2tBY2Nlc3NQcm92aWRlcnMgaW50byBhIHNpbmdsZSB0YWJiZWQgaW50ZXJmYWNlLlxuICovXG5leHBvcnQgY2xhc3MgVW5pZmllZFF1aWNrQWNjZXNzIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSByZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElRdWlja0FjY2Vzc1JlZ2lzdHJ5PihFeHRlbnNpb25zLlF1aWNrYWNjZXNzKTtcblx0cHJpdmF0ZSByZWFkb25seSBtYXBQcm92aWRlclRvRGVzY3JpcHRvciA9IG5ldyBNYXA8SVF1aWNrQWNjZXNzUHJvdmlkZXJEZXNjcmlwdG9yLCBJUXVpY2tBY2Nlc3NQcm92aWRlcj4oKTtcblxuXHRwcml2YXRlIF9jdXJyZW50UGlja2VyOiBJUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtLCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2N1cnJlbnREaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX3Byb3ZpZGVyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF9jdXJyZW50VGFiOiBJVW5pZmllZFF1aWNrQWNjZXNzVGFiIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wcm92aWRlckN0czogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3RhYkJhckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2lzSW50ZXJuYWxWYWx1ZUNoYW5nZSA9IGZhbHNlOyAvLyBGbGFnIHRvIHByZXZlbnQgcmVjdXJzaXZlIHRhYiBkZXRlY3Rpb25cblx0cHJpdmF0ZSBfaXNVcGRhdGluZ1NlbmRUb0FnZW50ID0gZmFsc2U7IC8vIEd1YXJkIHRvIHByZXZlbnQgaW5maW5pdGUgbG9vcFxuXHRwcml2YXRlIF9hcnJpdmVkVmlhU2hvcnRjdXQ6ICc8JyB8ICc+JyB8IHVuZGVmaW5lZDsgLy8gVHJhY2sgaWYgd2UgYXJyaXZlZCBhdCBjdXJyZW50IHRhYiB2aWEgc2hvcnRjdXQga2V5XG5cdHByaXZhdGUgX3NlbmRUb0FnZW50VGltZW91dDogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3NlbmRCdXR0b246IEhUTUxCdXR0b25FbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zZW5kQnV0dG9uTGFiZWw6IEhUTUxTcGFuRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2VuZEJ1dHRvbkljb246IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zZW5kQnV0dG9uSG92ZXI6IHsgdXBkYXRlOiAoY29udGVudDogc3RyaW5nKSA9PiB2b2lkIH0gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdGFiczogSVVuaWZpZWRRdWlja0FjY2Vzc1RhYltdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHRhYnM6IElVbmlmaWVkUXVpY2tBY2Nlc3NUYWJbXSB8IHVuZGVmaW5lZCxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJTGF5b3V0U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl90YWJzID0gdGFicyA/PyBERUZBVUxUX1VOSUZJRURfUVVJQ0tfQUNDRVNTX1RBQlM7XG5cdH1cblxuXHQvKipcblx0ICogU2hvdyB0aGUgdW5pZmllZCBxdWljayBhY2Nlc3Mgd2lkZ2V0LlxuXHQgKiBAcGFyYW0gaW5pdGlhbFRhYklkIE9wdGlvbmFsIHRhYiBJRCB0byBzdGFydCB3aXRoLiBEZWZhdWx0cyB0byBmaXJzdCB0YWIuXG5cdCAqIEBwYXJhbSBpbml0aWFsVmFsdWUgT3B0aW9uYWwgaW5pdGlhbCBmaWx0ZXIgdmFsdWUuXG5cdCAqL1xuXHRzaG93KGluaXRpYWxUYWJJZD86IHN0cmluZywgaW5pdGlhbFZhbHVlPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gSWYgYWxyZWFkeSBzaG93aW5nLCBqdXN0IGZvY3VzXG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRQaWNrZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jdXJyZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdC8vIENyZWF0ZSBwaWNrZXJcblx0XHRjb25zdCBwaWNrZXI6IElRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9PiA9IHRoaXMuX2N1cnJlbnREaXNwb3NhYmxlcy5hZGQodGhpcy5xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0+KHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KSk7XG5cdFx0dGhpcy5fY3VycmVudFBpY2tlciA9IHBpY2tlcjtcblxuXHRcdC8vIENvbmZpZ3VyZSBwaWNrZXJcblx0XHRwaWNrZXIuaWdub3JlRm9jdXNPdXQgPSBmYWxzZTtcblx0XHRwaWNrZXIubWF0Y2hPbkRlc2NyaXB0aW9uID0gdHJ1ZTtcblx0XHRwaWNrZXIubWF0Y2hPbkRldGFpbCA9IHRydWU7XG5cdFx0cGlja2VyLnNvcnRCeUxhYmVsID0gZmFsc2U7XG5cblx0XHQvLyBGaW5kIGluaXRpYWwgdGFiXG5cdFx0Y29uc3QgaW5pdGlhbFRhYiA9IGluaXRpYWxUYWJJZFxuXHRcdFx0PyB0aGlzLl90YWJzLmZpbmQodCA9PiB0LmlkID09PSBpbml0aWFsVGFiSWQpID8/IHRoaXMuX3RhYnNbMF1cblx0XHRcdDogdGhpcy5fdGFic1swXTtcblx0XHR0aGlzLl9jdXJyZW50VGFiID0gaW5pdGlhbFRhYjtcblxuXHRcdC8vIENyZWF0ZSBhbmQgaW5qZWN0IHRhYiBiYXIgaW50byB0aGUgcGlja2VyXG5cdFx0dGhpcy5faW5qZWN0VGFiQmFyKHBpY2tlcik7XG5cblx0XHQvLyBTZXQgaW5pdGlhbCB2YWx1ZSBhbmQgYWN0aXZhdGUgdGFiXG5cdFx0Ly8gU3RhcnQgd2l0aCBlbXB0eSB2YWx1ZSAoZG9uJ3QgcHJlZmlsbCBwcmVmaXgpIHNvIHVzZXIgY2FuIHR5cGUgbmF0dXJhbGx5XG5cdFx0dGhpcy5faXNJbnRlcm5hbFZhbHVlQ2hhbmdlID0gdHJ1ZTtcblx0XHRwaWNrZXIudmFsdWUgPSBpbml0aWFsVmFsdWUgPz8gJyc7XG5cdFx0cGlja2VyLnBsYWNlaG9sZGVyID0gaW5pdGlhbFRhYi5wbGFjZWhvbGRlcjtcblx0XHR0aGlzLl9pc0ludGVybmFsVmFsdWVDaGFuZ2UgPSBmYWxzZTtcblxuXHRcdC8vIFN0YXJ0IHByb3ZpZGluZyBpdGVtcyBmb3IgaW5pdGlhbCB0YWJcblx0XHR0aGlzLl9hY3RpdmF0ZVByb3ZpZGVyKGluaXRpYWxUYWIsIHBpY2tlcik7XG5cblx0XHQvLyBIYW5kbGUgdmFsdWUgY2hhbmdlcyAtIGRldGVjdCBwcmVmaXggY2hhbmdlcyB0byBzd2l0Y2ggdGFic1xuXHRcdHRoaXMuX2N1cnJlbnREaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkQ2hhbmdlVmFsdWUodmFsdWUgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzSW50ZXJuYWxWYWx1ZUNoYW5nZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIGlmIHVzZXIgcmVtb3ZlZCB0aGUgc2hvcnRjdXQgY2hhcmFjdGVyIChpbmNsdWRpbmcgd2hlbiBpbnB1dCBpcyBlbXB0aWVkKSAtIHN3aXRjaCBiYWNrIHRvIEZpbGVzXG5cdFx0XHRpZiAodGhpcy5fYXJyaXZlZFZpYVNob3J0Y3V0KSB7XG5cdFx0XHRcdGNvbnN0IHNob3J0Y3V0ID0gdGhpcy5fYXJyaXZlZFZpYVNob3J0Y3V0O1xuXHRcdFx0XHRpZiAoIXZhbHVlLnN0YXJ0c1dpdGgoc2hvcnRjdXQpKSB7XG5cdFx0XHRcdFx0Y29uc3QgZmlsZXNUYWIgPSB0aGlzLl90YWJzLmZpbmQodCA9PiB0LmlkID09PSAnZmlsZXMnKTtcblx0XHRcdFx0XHRpZiAoZmlsZXNUYWIgJiYgZmlsZXNUYWIgIT09IHRoaXMuX2N1cnJlbnRUYWIpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2Fycml2ZWRWaWFTaG9ydGN1dCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdHRoaXMuX3N3aXRjaFRhYihmaWxlc1RhYiwgcGlja2VyLCBmYWxzZSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1hdGNoaW5nVGFiID0gdGhpcy5fZGV0ZWN0VGFiRnJvbVZhbHVlKHZhbHVlKTtcblx0XHRcdGlmIChtYXRjaGluZ1RhYiAmJiBtYXRjaGluZ1RhYiAhPT0gdGhpcy5fY3VycmVudFRhYikge1xuXHRcdFx0XHR0aGlzLl9zd2l0Y2hUYWIobWF0Y2hpbmdUYWIsIHBpY2tlciwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBVcGRhdGUgc2VuZCBidXR0b24gc3RhdGUgYmFzZWQgb24gaW5wdXRcblx0XHRcdHRoaXMuX3VwZGF0ZVNlbmRCdXR0b25TdGF0ZSh2YWx1ZSk7XG5cdFx0XHQvLyBEZWJvdW5jZSBzZW5kLXRvLWFnZW50IGNoZWNrIHRvIGxldCBwcm92aWRlciBmaW5pc2hcblx0XHRcdGlmICh0aGlzLl9zZW5kVG9BZ2VudFRpbWVvdXQpIHtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX3NlbmRUb0FnZW50VGltZW91dCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zZW5kVG9BZ2VudFRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHRoaXMuX21heWJlU2hvd1NlbmRUb0FnZW50KHBpY2tlciksIDE1MCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSGFuZGxlIGFjY2VwdCAtIHNlbmQgdG8gYWdlbnQgaWYgbm8gcmVhbCBpdGVtcyBvciBzZW5kLXRvLWFnZW50IGlzIHNlbGVjdGVkXG5cdFx0dGhpcy5fY3VycmVudERpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRJdGVtcyA9IHBpY2tlci5zZWxlY3RlZEl0ZW1zO1xuXHRcdFx0Y29uc3QgYWN0aXZlSXRlbXMgPSBwaWNrZXIuYWN0aXZlSXRlbXM7XG5cblx0XHRcdC8vIENoZWNrIGlmIHNlbmQtdG8tYWdlbnQgaXRlbSBpcyBzZWxlY3RlZFxuXHRcdFx0Y29uc3Qgc2VuZFRvQWdlbnRTZWxlY3RlZCA9IHNlbGVjdGVkSXRlbXMubGVuZ3RoID4gMCAmJlxuXHRcdFx0XHQoc2VsZWN0ZWRJdGVtc1swXSBhcyBJUXVpY2tQaWNrSXRlbSAmIHsgaWQ/OiBzdHJpbmcgfSkuaWQgPT09IFNFTkRfVE9fQUdFTlRfSUQ7XG5cblx0XHRcdC8vIENoZWNrIGlmIHRoZXJlIGFyZSBhbnkgcmVhbCBpdGVtcyBhY3RpdmUgKG5vdCBzZW5kLXRvLWFnZW50KVxuXHRcdFx0Y29uc3QgaGFzUmVhbEFjdGl2ZUl0ZW0gPSBhY3RpdmVJdGVtcy5zb21lKGl0ZW0gPT5cblx0XHRcdFx0KGl0ZW0gYXMgSVF1aWNrUGlja0l0ZW0gJiB7IGlkPzogc3RyaW5nIH0pLmlkICE9PSBTRU5EX1RPX0FHRU5UX0lEXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBHZXQgdGhlIGZpbHRlciB0ZXh0ICh3aXRob3V0IHByZWZpeCBvciBzaG9ydGN1dCBjaGFyYWN0ZXIpXG5cdFx0XHRsZXQgZmlsdGVyVGV4dDogc3RyaW5nO1xuXHRcdFx0aWYgKHRoaXMuX2Fycml2ZWRWaWFTaG9ydGN1dCAmJiBwaWNrZXIudmFsdWUuc3RhcnRzV2l0aCh0aGlzLl9hcnJpdmVkVmlhU2hvcnRjdXQpKSB7XG5cdFx0XHRcdGZpbHRlclRleHQgPSBwaWNrZXIudmFsdWUuc3Vic3RyaW5nKDEpLnRyaW0oKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5fY3VycmVudFRhYikge1xuXHRcdFx0XHRmaWx0ZXJUZXh0ID0gcGlja2VyLnZhbHVlLnN1YnN0cmluZyh0aGlzLl9jdXJyZW50VGFiLnByZWZpeC5sZW5ndGgpLnRyaW0oKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGZpbHRlclRleHQgPSBwaWNrZXIudmFsdWUudHJpbSgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTZW5kIHRvIGFnZW50IGlmOlxuXHRcdFx0Ly8gMS4gU2VuZC10by1hZ2VudCBpdGVtIGlzIGV4cGxpY2l0bHkgc2VsZWN0ZWQsIE9SXG5cdFx0XHQvLyAyLiBObyByZWFsIGl0ZW1zIGFyZSBhY3RpdmUgQU5EIHVzZXIgaGFzIHR5cGVkIHNvbWV0aGluZ1xuXHRcdFx0aWYgKHNlbmRUb0FnZW50U2VsZWN0ZWQgfHwgKCFoYXNSZWFsQWN0aXZlSXRlbSAmJiBmaWx0ZXJUZXh0KSkge1xuXHRcdFx0XHR0aGlzLl9zZW5kTWVzc2FnZShwaWNrZXIudmFsdWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEhhbmRsZSBoaWRlXG5cdFx0dGhpcy5fY3VycmVudERpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdHRoaXMuX3Byb3ZpZGVyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX3Byb3ZpZGVyQ3RzPy5jYW5jZWwoKTtcblx0XHRcdHRoaXMuX3Byb3ZpZGVyQ3RzID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fY3VycmVudFBpY2tlciA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2N1cnJlbnRUYWIgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9hcnJpdmVkVmlhU2hvcnRjdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHQvLyBDbGVhciBhbnkgcGVuZGluZyB0aW1lb3V0XG5cdFx0XHRpZiAodGhpcy5fc2VuZFRvQWdlbnRUaW1lb3V0KSB7XG5cdFx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9zZW5kVG9BZ2VudFRpbWVvdXQpO1xuXHRcdFx0XHR0aGlzLl9zZW5kVG9BZ2VudFRpbWVvdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBSZW1vdmUgdGhlIGluamVjdGVkIHRhYiBiYXIgZnJvbSBET01cblx0XHRcdHRoaXMuX3RhYkJhckNvbnRhaW5lcj8ucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLl90YWJCYXJDb250YWluZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHQvLyBDbGVhciBidXR0b24gcmVmZXJlbmNlc1xuXHRcdFx0dGhpcy5fc2VuZEJ1dHRvbiA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3NlbmRCdXR0b25MYWJlbCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3NlbmRCdXR0b25JY29uID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fc2VuZEJ1dHRvbkhvdmVyID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fY3VycmVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU2hvdyBwaWNrZXJcblx0XHRwaWNrZXIuc2hvdygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhpZGUgdGhlIHVuaWZpZWQgcXVpY2sgYWNjZXNzIHdpZGdldCBpZiB2aXNpYmxlLlxuXHQgKi9cblx0aGlkZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9jdXJyZW50UGlja2VyPy5oaWRlKCk7XG5cdH1cblxuXHQvKipcblx0ICogQ2hlY2sgaWYgdGhlIHdpZGdldCBpcyBjdXJyZW50bHkgdmlzaWJsZS5cblx0ICovXG5cdGdldCBpc1Zpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fY3VycmVudFBpY2tlcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbmplY3QgdGhlIGN1c3RvbSB0YWIgYmFyIGludG8gdGhlIHBpY2tlcidzIGhlYWRlciBhcmVhLlxuXHQgKi9cblx0cHJpdmF0ZSBfaW5qZWN0VGFiQmFyKHBpY2tlcjogSVF1aWNrUGljazxJUXVpY2tQaWNrSXRlbSwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+KTogdm9pZCB7XG5cdFx0Ly8gV2FpdCBmb3IgcGlja2VyIHRvIGJlIHNob3duIHRvIGFjY2VzcyBET01cblx0XHRjb25zdCBzaG93RGlzcG9zYWJsZSA9IHRoaXMuX2N1cnJlbnREaXNwb3NhYmxlcy5hZGQoRXZlbnQub25jZSh0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLm9uU2hvdykoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY3VycmVudERpc3Bvc2FibGVzLmRlbGV0ZShzaG93RGlzcG9zYWJsZSk7XG5cblx0XHRcdC8vIEZpbmQgdGhlIHF1aWNrIGlucHV0IHdpZGdldCBjb250YWluZXIgdmlhIGxheW91dCBzZXJ2aWNlXG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IHF1aWNrSW5wdXRXaWRnZXQgPSB0aGlzLmxheW91dFNlcnZpY2UuYWN0aXZlQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5xdWljay1pbnB1dC13aWRnZXQnKTtcblx0XHRcdGlmICghcXVpY2tJbnB1dFdpZGdldCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZpbmQgdGhlIGhlYWRlciBlbGVtZW50IChjb250YWlucyBpbnB1dCBib3gpIGFuZCBsaXN0IGVsZW1lbnRcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgaGVhZGVyID0gcXVpY2tJbnB1dFdpZGdldC5xdWVyeVNlbGVjdG9yKCcucXVpY2staW5wdXQtaGVhZGVyJyk7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IGxpc3QgPSBxdWlja0lucHV0V2lkZ2V0LnF1ZXJ5U2VsZWN0b3IoJy5xdWljay1pbnB1dC1saXN0Jyk7XG5cdFx0XHRpZiAoIWhlYWRlciB8fCAhbGlzdCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIENyZWF0ZSB0YWIgYmFyIGNvbnRhaW5lclxuXHRcdFx0Y29uc3QgdGFiQmFyQ29udGFpbmVyID0gJCgnZGl2LnVuaWZpZWQtcXVpY2stYWNjZXNzLXRhYnMnKTtcblx0XHRcdHRoaXMuX3RhYkJhckNvbnRhaW5lciA9IHRhYkJhckNvbnRhaW5lcjtcblxuXHRcdFx0Ly8gQ3JlYXRlIFJhZGlvIHdpZGdldCBmb3IgdGFic1xuXHRcdFx0Y29uc3QgaG92ZXJEZWxlZ2F0ZSA9IHRoaXMuX2N1cnJlbnREaXNwb3NhYmxlcy5hZGQoY3JlYXRlSW5zdGFudEhvdmVyRGVsZWdhdGUoKSk7XG5cdFx0XHRjb25zdCByYWRpb0l0ZW1zOiBJUmFkaW9PcHRpb25JdGVtW10gPSB0aGlzLl90YWJzLm1hcCh0YWIgPT4gKHtcblx0XHRcdFx0dGV4dDogdGFiLmxhYmVsLFxuXHRcdFx0XHR0b29sdGlwOiB0YWIudG9vbHRpcCxcblx0XHRcdFx0aXNBY3RpdmU6IHRhYiA9PT0gdGhpcy5fY3VycmVudFRhYixcblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgcmFkaW8gPSB0aGlzLl9jdXJyZW50RGlzcG9zYWJsZXMuYWRkKG5ldyBSYWRpbyh7XG5cdFx0XHRcdGl0ZW1zOiByYWRpb0l0ZW1zLFxuXHRcdFx0XHRob3ZlckRlbGVnYXRlLFxuXHRcdFx0fSkpO1xuXG5cdFx0XHR0YWJCYXJDb250YWluZXIuYXBwZW5kQ2hpbGQocmFkaW8uZG9tTm9kZSk7XG5cblx0XHRcdC8vIEhhbmRsZSB0YWIgc2VsZWN0aW9uXG5cdFx0XHR0aGlzLl9jdXJyZW50RGlzcG9zYWJsZXMuYWRkKHJhZGlvLm9uRGlkU2VsZWN0KGluZGV4ID0+IHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRUYWIgPSB0aGlzLl90YWJzW2luZGV4XTtcblx0XHRcdFx0aWYgKHNlbGVjdGVkVGFiICYmIHNlbGVjdGVkVGFiICE9PSB0aGlzLl9jdXJyZW50VGFiKSB7XG5cdFx0XHRcdFx0dGhpcy5fc3dpdGNoVGFiKHNlbGVjdGVkVGFiLCBwaWNrZXIsIGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBDcmVhdGUgc2VuZCBidXR0b24gKGZhciByaWdodClcblx0XHRcdGNvbnN0IHNlbmRCdXR0b24gPSB0aGlzLl9jcmVhdGVTZW5kQnV0dG9uKHBpY2tlcik7XG5cdFx0XHR0YWJCYXJDb250YWluZXIuYXBwZW5kQ2hpbGQoc2VuZEJ1dHRvbik7XG5cblx0XHRcdC8vIEluc2VydCB0YWIgYmFyIGJldHdlZW4gdGhlIGhlYWRlciAoaW5wdXQgYm94KSBhbmQgdGhlIGxpc3QgKHJlc3VsdHMpXG5cdFx0XHRsaXN0LnBhcmVudEVsZW1lbnQ/Lmluc2VydEJlZm9yZSh0YWJCYXJDb250YWluZXIsIGxpc3QpO1xuXG5cdFx0XHQvLyBTdG9yZSByZWZlcmVuY2UgdG8gcmFkaW8gZm9yIHVwZGF0ZXNcblx0XHRcdChwaWNrZXIgYXMgdW5rbm93biBhcyB7IF91bmlmaWVkUmFkaW8/OiBSYWRpbyB9KS5fdW5pZmllZFJhZGlvID0gcmFkaW87XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZSB0aGUgc2VuZCBidXR0b24uXG5cdCAqL1xuXHRwcml2YXRlIF9jcmVhdGVTZW5kQnV0dG9uKHBpY2tlcjogSVF1aWNrUGljazxJUXVpY2tQaWNrSXRlbSwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+KTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9ICQoJ2Rpdi51bmlmaWVkLXF1aWNrLWFjY2Vzcy1zZW5kLWNvbnRhaW5lcicpO1xuXG5cdFx0Ly8gQ3JlYXRlIHNlbmQgYnV0dG9uXG5cdFx0Y29uc3QgYnV0dG9uID0gJCgnYnV0dG9uLnVuaWZpZWQtc2VuZC1idXR0b24nKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHRidXR0b24uc2V0QXR0cmlidXRlKCd0eXBlJywgJ2J1dHRvbicpO1xuXHRcdHRoaXMuX3NlbmRCdXR0b24gPSBidXR0b247XG5cblx0XHRjb25zdCBpY29uID0gcmVuZGVySWNvbihDb2RpY29uLnNlbmQpO1xuXHRcdGljb24uY2xhc3NMaXN0LmFkZCgndW5pZmllZC1zZW5kLWljb24nKTtcblx0XHR0aGlzLl9zZW5kQnV0dG9uSWNvbiA9IGljb247XG5cdFx0YnV0dG9uLmFwcGVuZENoaWxkKGljb24pO1xuXG5cdFx0Y29uc3QgbGFiZWxTcGFuID0gJCgnc3Bhbi51bmlmaWVkLXNlbmQtbGFiZWwnKTtcblx0XHR0aGlzLl9zZW5kQnV0dG9uTGFiZWwgPSBsYWJlbFNwYW47XG5cdFx0YnV0dG9uLmFwcGVuZENoaWxkKGxhYmVsU3Bhbik7XG5cblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoYnV0dG9uKTtcblxuXHRcdC8vIFNldCB1cCBtYW5hZ2VkIGhvdmVyIGZvciB0aGUgYnV0dG9uXG5cdFx0dGhpcy5fc2VuZEJ1dHRvbkhvdmVyID0gdGhpcy5fY3VycmVudERpc3Bvc2FibGVzLmFkZChcblx0XHRcdHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBidXR0b24sICcnKVxuXHRcdCk7XG5cblx0XHQvLyBJbml0aWFsaXplIGJ1dHRvbiBzdGF0ZVxuXHRcdHRoaXMuX3VwZGF0ZVNlbmRCdXR0b25TdGF0ZShwaWNrZXIudmFsdWUpO1xuXG5cdFx0Ly8gQ2xpY2sgaGFuZGxlciAtIGJlaGF2aW9yIGRlcGVuZHMgb24gaW5wdXQgc3RhdGVcblx0XHR0aGlzLl9jdXJyZW50RGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b24sIEV2ZW50VHlwZS5DTElDSywgKGUpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRjb25zdCBoYXNJbnB1dCA9IHBpY2tlci52YWx1ZS50cmltKCkubGVuZ3RoID4gMDtcblx0XHRcdGlmIChoYXNJbnB1dCkge1xuXHRcdFx0XHR0aGlzLl9zZW5kTWVzc2FnZVJhdyhwaWNrZXIudmFsdWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fb3BlbkNoYXQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gY29udGFpbmVyO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZSB0aGUgc2VuZCBidXR0b24gbGFiZWwgYW5kIHRvb2x0aXAgYmFzZWQgb24gaW5wdXQgc3RhdGUuXG5cdCAqL1xuXHRwcml2YXRlIF91cGRhdGVTZW5kQnV0dG9uU3RhdGUodmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2VuZEJ1dHRvbiB8fCAhdGhpcy5fc2VuZEJ1dHRvbkxhYmVsIHx8ICF0aGlzLl9zZW5kQnV0dG9uSWNvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc0lucHV0ID0gdmFsdWUudHJpbSgpLmxlbmd0aCA+IDA7XG5cblx0XHRpZiAoaGFzSW5wdXQpIHtcblx0XHRcdC8vIFNob3cgXCJTZW5kXCIgd2l0aCBubyBrZXliaW5kaW5nIGluIHRvb2x0aXAgKEVudGVyIGlzIGltcGxpZWQgYnkgcXVpY2sgcGljaylcblx0XHRcdHRoaXMuX3NlbmRCdXR0b25MYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdzZW5kJywgXCJTZW5kXCIpO1xuXHRcdFx0dGhpcy5fc2VuZEJ1dHRvbkhvdmVyPy51cGRhdGUobG9jYWxpemUoJ3NlbmRUb29sdGlwTm9LZXliaW5kaW5nJywgXCJTZW5kIG1lc3NhZ2UgdG8gbmV3IGFnZW50IHNlc3Npb25cIikpO1xuXHRcdFx0dGhpcy5fc2VuZEJ1dHRvbkljb24uc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBTaG93IFwiT3BlbiBDaGF0XCIgd2l0aCBvcGVuIGNoYXQga2V5YmluZGluZyBhbmQgaGlkZSBpY29uXG5cdFx0XHRjb25zdCBvcGVuQ2hhdEtleWJpbmRpbmcgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoQ0hBVF9PUEVOX0FDVElPTl9JRCk7XG5cdFx0XHRjb25zdCBvcGVuQ2hhdExhYmVsID0gb3BlbkNoYXRLZXliaW5kaW5nPy5nZXRMYWJlbCgpID8/ICcnO1xuXHRcdFx0dGhpcy5fc2VuZEJ1dHRvbkxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ29wZW5DaGF0JywgXCJPcGVuIENoYXRcIik7XG5cdFx0XHRjb25zdCB0b29sdGlwID0gb3BlbkNoYXRMYWJlbFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdvcGVuQ2hhdFRvb2x0aXBXaXRoS2V5YmluZGluZycsIFwiT3BlbiBjaGF0ICh7MH0pXCIsIG9wZW5DaGF0TGFiZWwpXG5cdFx0XHRcdDogbG9jYWxpemUoJ29wZW5DaGF0VG9vbHRpcE5vS2V5YmluZGluZycsIFwiT3BlbiBjaGF0XCIpO1xuXHRcdFx0dGhpcy5fc2VuZEJ1dHRvbkhvdmVyPy51cGRhdGUodG9vbHRpcCk7XG5cdFx0XHR0aGlzLl9zZW5kQnV0dG9uSWNvbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBPcGVuIGNoYXQgd2l0aG91dCBzZW5kaW5nIGEgbWVzc2FnZS5cblx0ICovXG5cdHByaXZhdGUgX29wZW5DaGF0KCk6IHZvaWQge1xuXHRcdHRoaXMuaGlkZSgpO1xuXHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ0hBVF9PUEVOX0FDVElPTl9JRCk7XG5cdH1cblxuXHQvKipcblx0ICogU2VuZCB0aGUgZXhhY3QgbWVzc2FnZSB0byBhIG5ldyBhZ2VudCBzZXNzaW9uIChubyBwcmVmaXggc3RyaXBwaW5nKS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3NlbmRNZXNzYWdlUmF3KHZhbHVlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtZXNzYWdlID0gdmFsdWUudHJpbSgpO1xuXHRcdGlmICghbWVzc2FnZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEhpZGUgdGhlIHBpY2tlciBmaXJzdFxuXHRcdHRoaXMuaGlkZSgpO1xuXG5cdFx0Ly8gQWx3YXlzIGNyZWF0ZSBhIG5ldyBjaGF0IGZpcnN0XG5cdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChBQ1RJT05fSURfTkVXX0NIQVQpO1xuXG5cdFx0Ly8gVGhlbiBzZW5kIHRoZSBtZXNzYWdlIHRvIHRoZSBuZXcgY2hhdFxuXHRcdGNvbnN0IG9wdGlvbnM6IElDaGF0Vmlld09wZW5PcHRpb25zID0ge1xuXHRcdFx0cXVlcnk6IG1lc3NhZ2UsXG5cdFx0XHRpc1BhcnRpYWxRdWVyeTogZmFsc2UsXG5cdFx0fTtcblx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKENIQVRfT1BFTl9BQ1RJT05fSUQsIG9wdGlvbnMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlbmQgdGhlIGN1cnJlbnQgbWVzc2FnZSB0byBhIG5ldyBhZ2VudCBzZXNzaW9uIChzdHJpcHMgcHJlZml4IG9yIHNob3J0Y3V0IGNoYXJhY3RlcikuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9zZW5kTWVzc2FnZSh2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gU3RyaXAgYW55IHByZWZpeCBvciBzaG9ydGN1dCBjaGFyYWN0ZXIgZnJvbSB0aGUgdmFsdWVcblx0XHRsZXQgbWVzc2FnZSA9IHZhbHVlO1xuXG5cdFx0Ly8gRmlyc3QsIHN0cmlwIHNob3J0Y3V0IGNoYXJhY3RlciBpZiB3ZSBhcnJpdmVkIHZpYSBzaG9ydGN1dFxuXHRcdGlmICh0aGlzLl9hcnJpdmVkVmlhU2hvcnRjdXQgJiYgbWVzc2FnZS5zdGFydHNXaXRoKHRoaXMuX2Fycml2ZWRWaWFTaG9ydGN1dCkpIHtcblx0XHRcdG1lc3NhZ2UgPSBtZXNzYWdlLnN1YnN0cmluZygxKS50cmltKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9jdXJyZW50VGFiKSB7XG5cdFx0XHQvLyBPdGhlcndpc2Ugc3RyaXAgdGhlIG5vcm1hbCBwcmVmaXhcblx0XHRcdGlmICh2YWx1ZS5zdGFydHNXaXRoKHRoaXMuX2N1cnJlbnRUYWIucHJlZml4KSkge1xuXHRcdFx0XHRtZXNzYWdlID0gdmFsdWUuc3Vic3RyaW5nKHRoaXMuX2N1cnJlbnRUYWIucHJlZml4Lmxlbmd0aCkudHJpbSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghbWVzc2FnZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEhpZGUgdGhlIHBpY2tlciBmaXJzdFxuXHRcdHRoaXMuaGlkZSgpO1xuXG5cdFx0Ly8gQWx3YXlzIGNyZWF0ZSBhIG5ldyBjaGF0IGZpcnN0XG5cdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChBQ1RJT05fSURfTkVXX0NIQVQpO1xuXG5cdFx0Ly8gVGhlbiBzZW5kIHRoZSBtZXNzYWdlIHRvIHRoZSBuZXcgY2hhdFxuXHRcdGNvbnN0IG9wdGlvbnM6IElDaGF0Vmlld09wZW5PcHRpb25zID0ge1xuXHRcdFx0cXVlcnk6IG1lc3NhZ2UsXG5cdFx0XHRpc1BhcnRpYWxRdWVyeTogZmFsc2UsXG5cdFx0fTtcblx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKENIQVRfT1BFTl9BQ1RJT05fSUQsIG9wdGlvbnMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrIGlmIHdlIHNob3VsZCBzaG93IHRoZSBcInNlbmQgdG8gYWdlbnRcIiBpdGVtLlxuXHQgKiBBbHdheXMgc2hvd3MgaXQgYXMgdGhlIGZpcnN0IGl0ZW0gd2hlbiB1c2VyIGhhcyB0eXBlZCBzb21ldGhpbmcuXG5cdCAqL1xuXHRwcml2YXRlIF9tYXliZVNob3dTZW5kVG9BZ2VudChwaWNrZXI6IElRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9Pik6IHZvaWQge1xuXHRcdC8vIEd1YXJkIGFnYWluc3QgcmVjdXJzaXZlIGNhbGxzXG5cdFx0aWYgKHRoaXMuX2lzVXBkYXRpbmdTZW5kVG9BZ2VudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEdldCB0aGUgZmlsdGVyIHRleHQgKHdpdGhvdXQgcHJlZml4IG9yIHNob3J0Y3V0IGNoYXJhY3Rlcilcblx0XHRsZXQgZmlsdGVyVGV4dDogc3RyaW5nO1xuXHRcdGlmICh0aGlzLl9hcnJpdmVkVmlhU2hvcnRjdXQgJiYgcGlja2VyLnZhbHVlLnN0YXJ0c1dpdGgodGhpcy5fYXJyaXZlZFZpYVNob3J0Y3V0KSkge1xuXHRcdFx0Ly8gU3RyaXAgc2hvcnRjdXQgY2hhcmFjdGVyXG5cdFx0XHRmaWx0ZXJUZXh0ID0gcGlja2VyLnZhbHVlLnN1YnN0cmluZygxKS50cmltKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9jdXJyZW50VGFiKSB7XG5cdFx0XHRmaWx0ZXJUZXh0ID0gcGlja2VyLnZhbHVlLnN1YnN0cmluZyh0aGlzLl9jdXJyZW50VGFiLnByZWZpeC5sZW5ndGgpLnRyaW0oKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZmlsdGVyVGV4dCA9IHBpY2tlci52YWx1ZS50cmltKCk7XG5cdFx0fVxuXG5cdFx0Ly8gVXNlIGZ1bGwgaW5wdXQgaWYgZmlsdGVyIHRleHQgaXMgZW1wdHkgYnV0IHRoZXJlJ3MgaW5wdXQgKHVzZXIgdHlwZWQgd2l0aG91dCBwcmVmaXgpXG5cdFx0Y29uc3QgZnVsbElucHV0ID0gcGlja2VyLnZhbHVlLnRyaW0oKTtcblx0XHRjb25zdCBtZXNzYWdlVG9TZW5kID0gZmlsdGVyVGV4dCB8fCBmdWxsSW5wdXQ7XG5cblx0XHQvLyBPbmx5IHNob3cgaWYgdXNlciBoYXMgdHlwZWQgc29tZXRoaW5nXG5cdFx0aWYgKCFtZXNzYWdlVG9TZW5kKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRG9uJ3Qgc2hvdyBpZiBwaWNrZXIgaXMgc3RpbGwgbG9hZGluZ1xuXHRcdGlmIChwaWNrZXIuYnVzeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHNlbmQtdG8tYWdlbnQgaXMgYWxyZWFkeSB0aGUgZmlyc3QgaXRlbSB3aXRoIHNhbWUgZGVzY3JpcHRpb25cblx0XHRjb25zdCBmaXJzdEl0ZW0gPSBwaWNrZXIuaXRlbXNbMF0gYXMgSVF1aWNrUGlja0l0ZW0gJiB7IGlkPzogc3RyaW5nIH07XG5cdFx0aWYgKGZpcnN0SXRlbT8uaWQgPT09IFNFTkRfVE9fQUdFTlRfSUQgJiYgZmlyc3RJdGVtLmRlc2NyaXB0aW9uID09PSBmdWxsSW5wdXQpIHtcblx0XHRcdHJldHVybjsgLy8gQWxyZWFkeSBzaG93aW5nIGNvcnJlY3Qgc2VuZC10by1hZ2VudCBpdGVtXG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIHRoZSBzZW5kLXRvLWFnZW50IGl0ZW1cblx0XHRjb25zdCBzZW5kSXRlbTogSVF1aWNrUGlja0l0ZW0gJiB7IGlkOiBzdHJpbmcgfSA9IHtcblx0XHRcdGlkOiBTRU5EX1RPX0FHRU5UX0lELFxuXHRcdFx0bGFiZWw6IGAkKHNlbmQpICR7bG9jYWxpemUoJ3NlbmRUb0FnZW50TGFiZWwnLCBcIlNlbmQgdG8gYWdlbnRcIil9YCxcblx0XHRcdGRlc2NyaXB0aW9uOiBmdWxsSW5wdXQsXG5cdFx0XHRhbHdheXNTaG93OiB0cnVlLFxuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnc2VuZFRvQWdlbnRBcmlhJywgXCJTZW5kIG1lc3NhZ2UgdG8gYWdlbnQ6IHswfVwiLCBmdWxsSW5wdXQpLFxuXHRcdH07XG5cblx0XHQvLyBHZXQgY3VycmVudCBpdGVtcywgZXhjbHVkaW5nIGFueSBleGlzdGluZyBzZW5kLXRvLWFnZW50IGl0ZW1cblx0XHRjb25zdCBjdXJyZW50SXRlbXMgPSBwaWNrZXIuaXRlbXMuZmlsdGVyKGl0ZW0gPT5cblx0XHRcdChpdGVtIGFzIElRdWlja1BpY2tJdGVtICYgeyBpZD86IHN0cmluZyB9KS5pZCAhPT0gU0VORF9UT19BR0VOVF9JRFxuXHRcdCk7XG5cblx0XHQvLyBEZXRlcm1pbmUgaWYgd2Ugc2hvdWxkIHNob3cgc2VuZC10by1hZ2VudCBhcyBmaXJzdCBpdGVtOlxuXHRcdC8vIC0gQWx3YXlzIG9uIFNlc3Npb25zIHRhYiAoYWdlbnQgc2Vzc2lvbnMpXG5cdFx0Ly8gLSBPbmx5IGlmIG5vIG90aGVyIGl0ZW1zIGV4aXN0IG9uIENvbW1hbmRzL0ZpbGVzIHRhYnNcblx0XHRjb25zdCBpc1Nlc3Npb25zVGFiID0gdGhpcy5fY3VycmVudFRhYj8uaWQgPT09ICdhZ2VudFNlc3Npb25zJztcblx0XHRjb25zdCBoYXNPdGhlckl0ZW1zID0gY3VycmVudEl0ZW1zLmxlbmd0aCA+IDA7XG5cdFx0Y29uc3Qgc2hvd0ZpcnN0ID0gaXNTZXNzaW9uc1RhYiB8fCAhaGFzT3RoZXJJdGVtcztcblxuXHRcdC8vIFNldCBndWFyZCBhbmQgdXBkYXRlIGl0ZW1zXG5cdFx0dGhpcy5faXNVcGRhdGluZ1NlbmRUb0FnZW50ID0gdHJ1ZTtcblx0XHR0cnkge1xuXHRcdFx0aWYgKHNob3dGaXJzdCkge1xuXHRcdFx0XHRwaWNrZXIuaXRlbXMgPSBbc2VuZEl0ZW0sIC4uLmN1cnJlbnRJdGVtc107XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBEb24ndCBzaG93IHNlbmQtdG8tYWdlbnQgb24gQ29tbWFuZHMvRmlsZXMgd2hlbiB0aGVyZSBhcmUgbWF0Y2hlc1xuXHRcdFx0XHRwaWNrZXIuaXRlbXMgPSBjdXJyZW50SXRlbXM7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2lzVXBkYXRpbmdTZW5kVG9BZ2VudCA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTd2l0Y2ggdG8gYSBkaWZmZXJlbnQgdGFiLlxuXHQgKi9cblx0cHJpdmF0ZSBfc3dpdGNoVGFiKHRhYjogSVVuaWZpZWRRdWlja0FjY2Vzc1RhYiwgcGlja2VyOiBJUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtLCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4sIHByZXNlcnZlRmlsdGVyVGV4dDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0YWIgPT09IHRoaXMuX2N1cnJlbnRUYWIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2aW91c1RhYiA9IHRoaXMuX2N1cnJlbnRUYWI7XG5cdFx0dGhpcy5fY3VycmVudFRhYiA9IHRhYjtcblxuXHRcdC8vIFVwZGF0ZSBSYWRpbyBzZWxlY3Rpb25cblx0XHRjb25zdCByYWRpbyA9IChwaWNrZXIgYXMgdW5rbm93biBhcyB7IF91bmlmaWVkUmFkaW8/OiBSYWRpbyB9KS5fdW5pZmllZFJhZGlvO1xuXHRcdGlmIChyYWRpbykge1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLl90YWJzLmluZGV4T2YodGFiKTtcblx0XHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHRcdHJhZGlvLnNldEFjdGl2ZUl0ZW0oaW5kZXgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBwaWNrZXIgdmFsdWUgKHdpdGggZmxhZyB0byBwcmV2ZW50IHJlY3Vyc2l2ZSB0YWIgZGV0ZWN0aW9uKVxuXHRcdHRoaXMuX2lzSW50ZXJuYWxWYWx1ZUNoYW5nZSA9IHRydWU7XG5cdFx0aWYgKHByZXNlcnZlRmlsdGVyVGV4dCAmJiBwcmV2aW91c1RhYikge1xuXHRcdFx0Ly8gVXNlciB0eXBlZCBhIHNob3J0Y3V0IHByZWZpeCAtIG5vcm1hbGl6ZSB0aGUgdmFsdWUgdG8gc2hvdyBqdXN0IHRoZSBzaG9ydGN1dCBjaGFyYWN0ZXJcblx0XHRcdGNvbnN0IGN1cnJlbnRWYWx1ZSA9IHBpY2tlci52YWx1ZTtcblxuXHRcdFx0Ly8gU3RyaXAgcHJldmlvdXMgdGFiJ3MgcHJlZml4IGlmIHByZXNlbnRcblx0XHRcdGxldCBmaWx0ZXJUZXh0ID0gY3VycmVudFZhbHVlO1xuXHRcdFx0aWYgKGN1cnJlbnRWYWx1ZS5zdGFydHNXaXRoKHByZXZpb3VzVGFiLnByZWZpeCkpIHtcblx0XHRcdFx0ZmlsdGVyVGV4dCA9IGN1cnJlbnRWYWx1ZS5zdWJzdHJpbmcocHJldmlvdXNUYWIucHJlZml4Lmxlbmd0aCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEhhbmRsZSBzaG9ydGN1dCB0cmFuc2l0aW9ucyAtIGVuc3VyZSBvbmx5IG9uZSBzaG9ydGN1dCBjaGFyIGlzIHNob3duXG5cdFx0XHRpZiAodGhpcy5fYXJyaXZlZFZpYVNob3J0Y3V0ID09PSAnPCcgJiYgdGFiLmlkID09PSAnYWdlbnRTZXNzaW9ucycpIHtcblx0XHRcdFx0Ly8gU3RyaXAgYW55IGxlYWRpbmcgXCI8XCIgY2hhcnMgYW5kIHNldCBqdXN0IG9uZVxuXHRcdFx0XHRmaWx0ZXJUZXh0ID0gZmlsdGVyVGV4dC5yZXBsYWNlKC9ePCsvLCAnJyk7XG5cdFx0XHRcdHBpY2tlci52YWx1ZSA9ICc8JyArIGZpbHRlclRleHQ7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2Fycml2ZWRWaWFTaG9ydGN1dCA9PT0gJz4nICYmIHRhYi5pZCA9PT0gJ2NvbW1hbmRzJykge1xuXHRcdFx0XHQvLyBTdHJpcCBhbnkgbGVhZGluZyBcIj5cIiBjaGFycyBhbmQgc2V0IGp1c3Qgb25lXG5cdFx0XHRcdGZpbHRlclRleHQgPSBmaWx0ZXJUZXh0LnJlcGxhY2UoL14+Ky8sICcnKTtcblx0XHRcdFx0cGlja2VyLnZhbHVlID0gJz4nICsgZmlsdGVyVGV4dDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIE5vcm1hbCBwcmVmaXgtYmFzZWQgc3dpdGNoaW5nXG5cdFx0XHRcdHBpY2tlci52YWx1ZSA9IHRhYi5wcmVmaXggKyBmaWx0ZXJUZXh0O1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAocHJldmlvdXNUYWIpIHtcblx0XHRcdC8vIFVzZXIgY2xpY2tlZCB0YWIgLSBrZWVwIGN1cnJlbnQgdGV4dCBidXQgc3RyaXAgb2xkIHByZWZpeCAoZG9uJ3QgYWRkIG5ldyBwcmVmaXgpXG5cdFx0XHRjb25zdCBjdXJyZW50VmFsdWUgPSBwaWNrZXIudmFsdWU7XG5cdFx0XHRpZiAoY3VycmVudFZhbHVlLnN0YXJ0c1dpdGgocHJldmlvdXNUYWIucHJlZml4KSkge1xuXHRcdFx0XHRwaWNrZXIudmFsdWUgPSBjdXJyZW50VmFsdWUuc3Vic3RyaW5nKHByZXZpb3VzVGFiLnByZWZpeC5sZW5ndGgpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQWxzbyBzdHJpcCBzaG9ydGN1dCBjaGFyYWN0ZXIgaWYgcHJlc2VudFxuXHRcdFx0aWYgKHBpY2tlci52YWx1ZS5zdGFydHNXaXRoKCc8JykgfHwgcGlja2VyLnZhbHVlLnN0YXJ0c1dpdGgoJz4nKSkge1xuXHRcdFx0XHRwaWNrZXIudmFsdWUgPSBwaWNrZXIudmFsdWUuc3Vic3RyaW5nKDEpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQ2xlYXIgc2hvcnRjdXQgdHJhY2tpbmcgd2hlbiBzd2l0Y2hpbmcgdmlhIGNsaWNrXG5cdFx0XHR0aGlzLl9hcnJpdmVkVmlhU2hvcnRjdXQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdC8vIGVsc2U6IGZpcnN0IHRhYiBhY3RpdmF0aW9uLCB2YWx1ZSBhbHJlYWR5IHNldFxuXHRcdHRoaXMuX2lzSW50ZXJuYWxWYWx1ZUNoYW5nZSA9IGZhbHNlO1xuXG5cdFx0cGlja2VyLnBsYWNlaG9sZGVyID0gdGFiLnBsYWNlaG9sZGVyO1xuXG5cdFx0Ly8gUmUtYWN0aXZhdGUgcHJvdmlkZXJcblx0XHR0aGlzLl9hY3RpdmF0ZVByb3ZpZGVyKHRhYiwgcGlja2VyKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEZXRlY3Qgd2hpY2ggdGFiIG1hdGNoZXMgdGhlIGN1cnJlbnQgdmFsdWUgYmFzZWQgb24gcHJlZml4LlxuXHQgKiBPbmx5IHN3aXRjaGVzIGF3YXkgZnJvbSBjdXJyZW50IHRhYiBpZiB1c2VyIGV4cGxpY2l0bHkgdHlwZWQgYSBkaWZmZXJlbnQgcHJlZml4LlxuXHQgKiBTdXBwb3J0cyBzaG9ydGN1dCBrZXlzOiBcIj5cIiBmb3IgQ29tbWFuZHMsIFwiPFwiIGZvciBTZXNzaW9ucy5cblx0ICovXG5cdHByaXZhdGUgX2RldGVjdFRhYkZyb21WYWx1ZSh2YWx1ZTogc3RyaW5nKTogSVVuaWZpZWRRdWlja0FjY2Vzc1RhYiB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gQ2hlY2sgZm9yIFwiPFwiIHNob3J0Y3V0IHRvIHN3aXRjaCB0byBTZXNzaW9ucyAoZnJvbSBGaWxlcyBvciBDb21tYW5kcylcblx0XHRpZiAodmFsdWUgPT09ICc8JyB8fCB2YWx1ZS5zdGFydHNXaXRoKCc8JykpIHtcblx0XHRcdGNvbnN0IHNlc3Npb25zVGFiID0gdGhpcy5fdGFicy5maW5kKHQgPT4gdC5pZCA9PT0gJ2FnZW50U2Vzc2lvbnMnKTtcblx0XHRcdGlmIChzZXNzaW9uc1RhYiAmJiB0aGlzLl9jdXJyZW50VGFiPy5pZCAhPT0gJ2FnZW50U2Vzc2lvbnMnKSB7XG5cdFx0XHRcdHRoaXMuX2Fycml2ZWRWaWFTaG9ydGN1dCA9ICc8Jztcblx0XHRcdFx0cmV0dXJuIHNlc3Npb25zVGFiO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBcIj5cIiBzaG9ydGN1dCB0byBzd2l0Y2ggdG8gQ29tbWFuZHMgKGZyb20gRmlsZXMgb3IgU2Vzc2lvbnMpXG5cdFx0aWYgKHZhbHVlID09PSAnPicgfHwgdmFsdWUuc3RhcnRzV2l0aCgnPicpKSB7XG5cdFx0XHRjb25zdCBjb21tYW5kc1RhYiA9IHRoaXMuX3RhYnMuZmluZCh0ID0+IHQuaWQgPT09ICdjb21tYW5kcycpO1xuXHRcdFx0aWYgKGNvbW1hbmRzVGFiICYmIHRoaXMuX2N1cnJlbnRUYWI/LmlkICE9PSAnY29tbWFuZHMnKSB7XG5cdFx0XHRcdHRoaXMuX2Fycml2ZWRWaWFTaG9ydGN1dCA9ICc+Jztcblx0XHRcdFx0cmV0dXJuIGNvbW1hbmRzVGFiO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIERvbid0IGF1dG8tc3dpdGNoIGlmIGN1cnJlbnQgdGFiIG1hdGNoZXMgKHVzZXIgaXMganVzdCB0eXBpbmcpXG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRUYWIgJiYgdmFsdWUuc3RhcnRzV2l0aCh0aGlzLl9jdXJyZW50VGFiLnByZWZpeCkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jdXJyZW50VGFiO1xuXHRcdH1cblxuXHRcdC8vIFNvcnQgYnkgcHJlZml4IGxlbmd0aCBkZXNjZW5kaW5nIHRvIG1hdGNoIG1vc3Qgc3BlY2lmaWMgZmlyc3Rcblx0XHQvLyBTa2lwIGVtcHR5IHByZWZpeCAtIGl0IHdvdWxkIG1hdGNoIGV2ZXJ5dGhpbmdcblx0XHRjb25zdCBzb3J0ZWRUYWJzID0gWy4uLnRoaXMuX3RhYnNdXG5cdFx0XHQuZmlsdGVyKHRhYiA9PiB0YWIucHJlZml4Lmxlbmd0aCA+IDApXG5cdFx0XHQuc29ydCgoYSwgYikgPT4gYi5wcmVmaXgubGVuZ3RoIC0gYS5wcmVmaXgubGVuZ3RoKTtcblxuXHRcdHJldHVybiBzb3J0ZWRUYWJzLmZpbmQodGFiID0+IHZhbHVlLnN0YXJ0c1dpdGgodGFiLnByZWZpeCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFjdGl2YXRlIHRoZSBwcm92aWRlciBmb3IgYSBnaXZlbiB0YWIuXG5cdCAqL1xuXHRwcml2YXRlIF9hY3RpdmF0ZVByb3ZpZGVyKHRhYjogSVVuaWZpZWRRdWlja0FjY2Vzc1RhYiwgcGlja2VyOiBJUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtLCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4pOiB2b2lkIHtcblx0XHQvLyBDbGVhciBwcmV2aW91cyBwcm92aWRlciByZXNvdXJjZXNcblx0XHR0aGlzLl9wcm92aWRlckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcHJvdmlkZXJDdHM/LmNhbmNlbCgpO1xuXHRcdHRoaXMuX3Byb3ZpZGVyQ3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dGhpcy5fcHJvdmlkZXJEaXNwb3NhYmxlcy5hZGQodGhpcy5fcHJvdmlkZXJDdHMpO1xuXG5cdFx0Ly8gU3BlY2lhbCBoYW5kbGluZyBmb3IgU2VuZCB0YWIgLSBubyBwcm92aWRlciBuZWVkZWRcblx0XHRpZiAodGFiLmlzU2VuZFRhYikge1xuXHRcdFx0cGlja2VyLmJ1c3kgPSBmYWxzZTtcblx0XHRcdHBpY2tlci5pdGVtcyA9IFt7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncHJlc3NTZW5kT3JFbnRlcicsIFwiUHJlc3MgRW50ZXIgb3IgY2xpY2sgU2VuZCB0byBjcmVhdGUgYSBuZXcgYWdlbnQgc2Vzc2lvblwiKSxcblx0XHRcdFx0YWx3YXlzU2hvdzogdHJ1ZSxcblx0XHRcdH1dO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENsZWFyIGl0ZW1zIHdoaWxlIGxvYWRpbmdcblx0XHRwaWNrZXIuaXRlbXMgPSBbXTtcblx0XHRwaWNrZXIuYnVzeSA9IHRydWU7XG5cblx0XHQvLyBHZXQgcHJvdmlkZXIgZm9yIHRoaXMgdGFiJ3MgcHJlZml4XG5cdFx0Y29uc3QgW3Byb3ZpZGVyXSA9IHRoaXMuX2dldE9ySW5zdGFudGlhdGVQcm92aWRlcih0YWIucHJlZml4KTtcblxuXHRcdGlmIChwcm92aWRlcikge1xuXHRcdFx0Ly8gQ29uZmlndXJlIGZpbHRlcmluZyAtIHN0cmlwIHRoZSB0YWIncyBwcmVmaXggb3Igc2hvcnRjdXQgY2hhcmFjdGVyIGZyb20gdGhlIGZpbHRlciB2YWx1ZVxuXHRcdFx0Y29uc3QgdGFiUHJlZml4ID0gdGFiLnByZWZpeDtcblx0XHRcdGNvbnN0IGFycml2ZWRWaWFTaG9ydGN1dCA9IHRoaXMuX2Fycml2ZWRWaWFTaG9ydGN1dDtcblx0XHRcdHBpY2tlci5maWx0ZXJWYWx1ZSA9ICh2YWx1ZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdC8vIElmIGFycml2ZWQgdmlhIHNob3J0Y3V0LCBzdHJpcCB0aGUgc2hvcnRjdXQgY2hhcmFjdGVyXG5cdFx0XHRcdGlmIChhcnJpdmVkVmlhU2hvcnRjdXQgJiYgdmFsdWUuc3RhcnRzV2l0aChhcnJpdmVkVmlhU2hvcnRjdXQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHZhbHVlLnN1YnN0cmluZygxKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBPdGhlcndpc2Ugc3RyaXAgdGhlIG5vcm1hbCBwcmVmaXhcblx0XHRcdFx0aWYgKHZhbHVlLnN0YXJ0c1dpdGgodGFiUHJlZml4KSkge1xuXHRcdFx0XHRcdHJldHVybiB2YWx1ZS5zdWJzdHJpbmcodGFiUHJlZml4Lmxlbmd0aCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdFx0fTtcblxuXHRcdFx0Ly8gTGV0IHByb3ZpZGVyIHBvcHVsYXRlIHRoZSBwaWNrZXJcblx0XHRcdGNvbnN0IHByb3ZpZGVyRGlzcG9zYWJsZSA9IHByb3ZpZGVyLnByb3ZpZGUocGlja2VyLCB0aGlzLl9wcm92aWRlckN0cy50b2tlbik7XG5cdFx0XHR0aGlzLl9wcm92aWRlckRpc3Bvc2FibGVzLmFkZChwcm92aWRlckRpc3Bvc2FibGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRwaWNrZXIuYnVzeSA9IGZhbHNlO1xuXHRcdFx0cGlja2VyLml0ZW1zID0gW3tcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdub1Byb3ZpZGVyJywgXCJObyBwcm92aWRlciBhdmFpbGFibGUgZm9yIHRoaXMgdGFiXCIpLFxuXHRcdFx0XHRhbHdheXNTaG93OiB0cnVlLFxuXHRcdFx0fV07XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEdldCBvciBjcmVhdGUgYSBwcm92aWRlciBpbnN0YW5jZSBmb3IgdGhlIGdpdmVuIHByZWZpeC5cblx0ICovXG5cdHByaXZhdGUgX2dldE9ySW5zdGFudGlhdGVQcm92aWRlcihwcmVmaXg6IHN0cmluZyk6IFtJUXVpY2tBY2Nlc3NQcm92aWRlciB8IHVuZGVmaW5lZCwgSVF1aWNrQWNjZXNzUHJvdmlkZXJEZXNjcmlwdG9yIHwgdW5kZWZpbmVkXSB7XG5cdFx0Ly8gVHJ5IHRvIGZpbmQgcHJvdmlkZXIgYnkgZXhhY3QgcHJlZml4IG1hdGNoIGZpcnN0XG5cdFx0Y29uc3QgcHJvdmlkZXJEZXNjcmlwdG9yID0gdGhpcy5yZWdpc3RyeS5nZXRRdWlja0FjY2Vzc1Byb3ZpZGVyKHByZWZpeCwgdGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRpZiAoIXByb3ZpZGVyRGVzY3JpcHRvcikge1xuXHRcdFx0cmV0dXJuIFt1bmRlZmluZWQsIHVuZGVmaW5lZF07XG5cdFx0fVxuXG5cdFx0bGV0IHByb3ZpZGVyID0gdGhpcy5tYXBQcm92aWRlclRvRGVzY3JpcHRvci5nZXQocHJvdmlkZXJEZXNjcmlwdG9yKTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRwcm92aWRlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UocHJvdmlkZXJEZXNjcmlwdG9yLmN0b3IpO1xuXHRcdFx0dGhpcy5tYXBQcm92aWRlclRvRGVzY3JpcHRvci5zZXQocHJvdmlkZXJEZXNjcmlwdG9yLCBwcm92aWRlcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFtwcm92aWRlciwgcHJvdmlkZXJEZXNjcmlwdG9yXTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fcHJvdmlkZXJDdHM/LmNhbmNlbCgpO1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5tYXBQcm92aWRlclRvRGVzY3JpcHRvci52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKGlzRGlzcG9zYWJsZShwcm92aWRlcikpIHtcblx0XHRcdFx0cHJvdmlkZXIuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsR0FBRyx1QkFBdUIsaUJBQWlCO0FBQ3BELFNBQVMsWUFBWSxpQkFBaUIsb0JBQW9CO0FBQzFELFNBQVMsMEJBQXNEO0FBQy9ELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBK0I7QUFDeEMsU0FBUywrQkFB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
