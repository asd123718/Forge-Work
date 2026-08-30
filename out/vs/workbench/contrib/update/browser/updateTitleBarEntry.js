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
import { BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { AnchorAlignment } from "../../../../base/common/layout.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { isWeb } from "../../../../base/common/platform.js";
import { localize } from "../../../../nls.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { DisablementReason, IUpdateService, StateType } from "../../../../platform/update/common/update.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IChatService } from "../../chat/common/chatService/chatService.js";
import { UpdateTitleBarChatInProgressContext, UpdateTitleBarContext, UpdateTitleBarEditorVisibleContext } from "../common/update.js";
import { computeProgressPercent } from "../common/updateUtils.js";
import "./media/updateTitleBarEntry.css";
import { UpdateTooltip } from "./updateTooltip.js";
const UPDATE_TITLE_BAR_ACTION_ID = "workbench.actions.updateIndicator";
const DISABLED_REMINDER_LAST_SHOWN_KEY = "update/disabledReminderLastShown";
const DISABLED_REMINDER_PERIOD = 30 * 24 * 60 * 60 * 1e3;
const UPDATE_TITLE_BAR_SETTING = "update.titleBar";
const ACTIONABLE_STATES = [StateType.AvailableForDownload, StateType.Downloaded, StateType.Ready];
const DETAILED_STATES = [...ACTIONABLE_STATES, StateType.CheckingForUpdates, StateType.Downloading, StateType.Updating, StateType.Overwriting, StateType.Cancelling];
let additionalMenuPlacement;
function registerUpdateTitleBarMenuPlacement(menuId, item = {}) {
  if (additionalMenuPlacement) {
    throw new Error("An additional update title bar menu placement is already registered");
  }
  additionalMenuPlacement = { menuId, item };
}
registerAction2(class UpdateIndicatorTitleBarAction extends Action2 {
  constructor() {
    super({
      id: UPDATE_TITLE_BAR_ACTION_ID,
      title: localize("updateIndicatorTitleBarAction", "Update"),
      f1: false,
      menu: [{
        id: MenuId.TitleBarUpdate,
        order: 0,
        when: UpdateTitleBarEditorVisibleContext
      }]
    });
  }
  async run() {
  }
});
let UpdateTitleBarContribution = class extends Disposable {
  constructor(actionViewItemService, chatService, configurationService, contextKeyService, hostService, instantiationService, storageService, updateService) {
    super();
    this.configurationService = configurationService;
    this.hostService = hostService;
    this.storageService = storageService;
    this.tooltipVisible = false;
    this.tooltipFocused = false;
    if (isWeb) {
      return;
    }
    this.context = UpdateTitleBarContext.bindTo(contextKeyService);
    this.tooltip = this._register(instantiationService.createInstance(UpdateTooltip));
    const chatInProgressContext = UpdateTitleBarChatInProgressContext.bindTo(contextKeyService);
    this._register(autorun((reader) => {
      chatInProgressContext.set(chatService.requestInProgressObs.read(reader));
    }));
    this.state = updateService.state;
    this._register(updateService.onStateChange((state) => {
      this.state = state;
      this.onStateChange();
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(UPDATE_TITLE_BAR_SETTING)) {
        this.onStateChange();
      }
    }));
    this._register(actionViewItemService.register(
      MenuId.TitleBarUpdate,
      UPDATE_TITLE_BAR_ACTION_ID,
      (action, options) => this.createEntry(instantiationService, action, options)
    ));
    if (additionalMenuPlacement) {
      const { menuId, item } = additionalMenuPlacement;
      MenuRegistry.appendMenuItem(menuId, {
        ...item,
        command: {
          id: UPDATE_TITLE_BAR_ACTION_ID,
          title: localize("updateIndicatorTitleBarAction", "Update")
        },
        when: ContextKeyExpr.and(UpdateTitleBarContext, UpdateTitleBarChatInProgressContext.negate(), item.when)
      });
      this._register(actionViewItemService.register(
        menuId,
        UPDATE_TITLE_BAR_ACTION_ID,
        (action, options) => this.createEntry(instantiationService, action, options)
      ));
    }
    void this.onStateChange(true);
  }
  createEntry(instantiationService, action, options) {
    this.entry = instantiationService.createInstance(UpdateTitleBarEntry, action, options, this.tooltip, (focus) => {
      this.tooltipVisible = true;
      this.tooltipFocused = focus;
    }, () => {
      this.tooltipVisible = false;
      this.tooltipFocused = false;
      if (!ACTIONABLE_STATES.includes(this.state.type) && !DETAILED_STATES.includes(this.state.type)) {
        this.context.set(false);
      }
    });
    if (this.tooltipVisible) {
      this.entry.showTooltip(this.tooltipFocused);
    }
    return this.entry;
  }
  async onStateChange(startup = false) {
    if (this.configurationService.getValue(UPDATE_TITLE_BAR_SETTING) === false) {
      this.tooltipVisible = false;
      this.tooltipFocused = false;
      this.context.set(false);
      return;
    }
    if (this.tooltipVisible || !await this.hostService.hadLastFocus()) {
      this.context.set(this.tooltipVisible || ACTIONABLE_STATES.includes(this.state.type));
      this.tooltip.renderState(this.state);
      return;
    }
    this.tooltip.renderState(this.state);
    let context = ACTIONABLE_STATES.includes(this.state.type);
    let showTooltip = false;
    switch (this.state.type) {
      case StateType.Disabled:
        if (startup) {
          const reason = this.state.reason;
          if (reason === DisablementReason.InvalidConfiguration || reason === DisablementReason.RunningAsAdmin) {
            const lastShown = this.storageService.getNumber(DISABLED_REMINDER_LAST_SHOWN_KEY, StorageScope.APPLICATION);
            showTooltip = lastShown === void 0 || Date.now() - lastShown >= DISABLED_REMINDER_PERIOD;
          }
        }
        break;
      case StateType.Idle:
        showTooltip = !!this.state.error;
        break;
      case StateType.Downloading:
      case StateType.Updating:
      case StateType.Overwriting:
        context = this.state.explicit;
        break;
      case StateType.Cancelling:
        context = true;
        break;
      case StateType.Restarting:
        context = true;
        break;
    }
    if (showTooltip) {
      this.tooltipVisible = true;
      context = true;
    }
    this.context.set(context);
    if (showTooltip) {
      this.entry?.showTooltip();
      if (this.state.type === StateType.Disabled) {
        this.storageService.store(DISABLED_REMINDER_LAST_SHOWN_KEY, Date.now(), StorageScope.APPLICATION, StorageTarget.MACHINE);
      }
    }
  }
};
UpdateTitleBarContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IChatService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IHostService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IUpdateService)
], UpdateTitleBarContribution);
let UpdateTitleBarEntry = class extends BaseActionViewItem {
  constructor(action, options, tooltip, onDidShowTooltip, onUserDismissedTooltip, commandService, hoverService, telemetryService, updateService) {
    super(void 0, action, options);
    this.tooltip = tooltip;
    this.onDidShowTooltip = onDidShowTooltip;
    this.onUserDismissedTooltip = onUserDismissedTooltip;
    this.commandService = commandService;
    this.hoverService = hoverService;
    this.telemetryService = telemetryService;
    this.updateService = updateService;
    this.visibleTooltip = this._register(new MutableDisposable());
    this.action.run = () => this.runAction();
    this._register(this.updateService.onStateChange((state) => this.onStateChange(state)));
    this._register(this.commandService.onDidExecuteCommand((event) => {
      if (event.commandId === "workbench.action.showHover" && this.isFocused()) {
        this.focusTooltip();
      }
    }));
  }
  render(container) {
    super.render(container);
    this.content = dom.append(container, dom.$(".update-indicator"));
    container.setAttribute("role", "button");
    this.updateTooltip();
    this.onStateChange(this.updateService.state);
    if (this.tooltipFocusOnRender !== void 0) {
      const focus = this.tooltipFocusOnRender;
      this.tooltipFocusOnRender = void 0;
      dom.scheduleAtNextAnimationFrame(dom.getWindow(container), () => this.showTooltip(focus));
    }
  }
  showTooltip(focus = false) {
    if (!this.element?.isConnected) {
      this.tooltipFocusOnRender = focus;
      return;
    }
    const hover = this.hoverService.showInstantHover({
      content: this.tooltip.domNode,
      target: {
        targetElements: [this.element],
        dispose: () => {
          if (!!this.element?.isConnected) {
            this.onUserDismissedTooltip();
          }
        }
      },
      persistence: { sticky: true },
      appearance: { showPointer: true, compact: true },
      position: { anchorAlignment: AnchorAlignment.RIGHT },
      trapFocus: focus
    }, focus);
    if (hover) {
      this.visibleTooltip.value = hover;
      this.onDidShowTooltip(focus);
    }
  }
  focusTooltip() {
    this.visibleTooltip.clear();
    this.showTooltip(true);
  }
  getHoverContents() {
    return this.tooltip.domNode;
  }
  getHoverOptions() {
    return { position: { anchorAlignment: AnchorAlignment.RIGHT } };
  }
  async runAction() {
    let commandId;
    switch (this.updateService.state.type) {
      case StateType.AvailableForDownload:
        commandId = "update.downloadNow";
        break;
      case StateType.Downloaded:
        commandId = "update.install";
        break;
      case StateType.Ready:
        commandId = "update.restart";
        break;
      default:
        this.showTooltip(true);
        return;
    }
    this.telemetryService.publicLog2("workbenchActionExecuted", { id: commandId, from: "titlebar" });
    await this.commandService.executeCommand(commandId);
  }
  onStateChange(state) {
    if (!this.content) {
      return;
    }
    dom.clearNode(this.content);
    this.content.classList.remove("prominent", "progress-indefinite", "progress-percent", "update-disabled");
    this.content.style.removeProperty("--update-progress");
    const label = dom.append(this.content, dom.$(".indicator-label"));
    switch (state.type) {
      case StateType.Disabled:
        label.textContent = localize("updateIndicator.update", "Update");
        this.content.classList.add("update-disabled");
        break;
      case StateType.CheckingForUpdates:
        label.textContent = localize("updateIndicator.checking", "Checking...");
        this.renderProgressState(this.content);
        break;
      case StateType.Overwriting:
        label.textContent = localize("updateIndicator.overwriting", "Updating...");
        this.renderProgressState(this.content);
        break;
      case StateType.AvailableForDownload:
      case StateType.Downloaded:
      case StateType.Ready:
        label.textContent = localize("updateIndicator.update", "Update");
        this.content.classList.add("prominent");
        break;
      case StateType.Downloading:
        label.textContent = localize("updateIndicator.downloading", "Downloading...");
        this.renderProgressState(this.content, computeProgressPercent(state.downloadedBytes, state.totalBytes));
        break;
      case StateType.Updating:
        label.textContent = localize("updateIndicator.installing", "Installing...");
        this.renderProgressState(this.content, computeProgressPercent(state.currentProgress, state.maxProgress));
        break;
      case StateType.Restarting:
        label.textContent = localize("updateIndicator.restarting", "Restarting...");
        this.renderProgressState(this.content);
        break;
      case StateType.Cancelling:
        label.textContent = localize("updateIndicator.cancelling", "Cancelling...");
        this.renderProgressState(this.content);
        break;
      default:
        label.textContent = localize("updateIndicator.update", "Update");
        break;
    }
    this.element?.setAttribute("aria-label", label.textContent);
  }
  renderProgressState(content, percentage) {
    if (percentage !== void 0) {
      content.classList.add("progress-percent");
      content.style.setProperty("--update-progress", `${percentage}%`);
    } else {
      content.classList.add("progress-indefinite");
    }
  }
};
UpdateTitleBarEntry = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, ITelemetryService),
  __decorateParam(8, IUpdateService)
], UpdateTitleBarEntry);
export {
  UpdateTitleBarContribution,
  UpdateTitleBarEntry,
  registerUpdateTitleBarMenuPlacement
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHVwZGF0ZVxcYnJvd3NlclxcdXBkYXRlVGl0bGVCYXJFbnRyeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEJhc2VBY3Rpb25WaWV3SXRlbSwgSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBJTWFuYWdlZEhvdmVyQ29udGVudCwgSU1hbmFnZWRIb3Zlck9wdGlvbnMsIElIb3ZlcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uLCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBBbmNob3JBbGlnbm1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXlvdXQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvblZpZXdJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBJTWVudUl0ZW0sIE1lbnVJZCwgTWVudVJlZ2lzdHJ5LCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IERpc2FibGVtZW50UmVhc29uLCBJVXBkYXRlU2VydmljZSwgU3RhdGUsIFN0YXRlVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VwZGF0ZS9jb21tb24vdXBkYXRlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBVcGRhdGVUaXRsZUJhckNoYXRJblByb2dyZXNzQ29udGV4dCwgVXBkYXRlVGl0bGVCYXJDb250ZXh0LCBVcGRhdGVUaXRsZUJhckVkaXRvclZpc2libGVDb250ZXh0IH0gZnJvbSAnLi4vY29tbW9uL3VwZGF0ZS5qcyc7XG5pbXBvcnQgeyBjb21wdXRlUHJvZ3Jlc3NQZXJjZW50IH0gZnJvbSAnLi4vY29tbW9uL3VwZGF0ZVV0aWxzLmpzJztcbmltcG9ydCAnLi9tZWRpYS91cGRhdGVUaXRsZUJhckVudHJ5LmNzcyc7XG5pbXBvcnQgeyBVcGRhdGVUb29sdGlwIH0gZnJvbSAnLi91cGRhdGVUb29sdGlwLmpzJztcblxuY29uc3QgVVBEQVRFX1RJVExFX0JBUl9BQ1RJT05fSUQgPSAnd29ya2JlbmNoLmFjdGlvbnMudXBkYXRlSW5kaWNhdG9yJztcblxuY29uc3QgRElTQUJMRURfUkVNSU5ERVJfTEFTVF9TSE9XTl9LRVkgPSAndXBkYXRlL2Rpc2FibGVkUmVtaW5kZXJMYXN0U2hvd24nO1xuY29uc3QgRElTQUJMRURfUkVNSU5ERVJfUEVSSU9EID0gMzAgKiAyNCAqIDYwICogNjAgKiAxMDAwOyAvLyAzMCBkYXlzXG5cbmNvbnN0IFVQREFURV9USVRMRV9CQVJfU0VUVElORyA9ICd1cGRhdGUudGl0bGVCYXInO1xuXG5jb25zdCBBQ1RJT05BQkxFX1NUQVRFUzogcmVhZG9ubHkgU3RhdGVUeXBlW10gPSBbU3RhdGVUeXBlLkF2YWlsYWJsZUZvckRvd25sb2FkLCBTdGF0ZVR5cGUuRG93bmxvYWRlZCwgU3RhdGVUeXBlLlJlYWR5XTtcbmNvbnN0IERFVEFJTEVEX1NUQVRFUzogcmVhZG9ubHkgU3RhdGVUeXBlW10gPSBbLi4uQUNUSU9OQUJMRV9TVEFURVMsIFN0YXRlVHlwZS5DaGVja2luZ0ZvclVwZGF0ZXMsIFN0YXRlVHlwZS5Eb3dubG9hZGluZywgU3RhdGVUeXBlLlVwZGF0aW5nLCBTdGF0ZVR5cGUuT3ZlcndyaXRpbmcsIFN0YXRlVHlwZS5DYW5jZWxsaW5nXTtcblxuLyoqXG4gKiBPcHRpb25hbCBzZWNvbmRhcnkgcGxhY2VtZW50IGZvciB0aGUgdXBkYXRlIGluZGljYXRvciAoZS5nLiB1c2VkIGJ5IHRoZSBBZ2VudHNcbiAqIGFwcCkuIExpbWl0ZWQgdG8gb25lIGJlY2F1c2UgdGhlIGNvbnRyaWJ1dGlvbiB0cmFja3MgYSBzaW5nbGUgcmVuZGVyZWQgZW50cnkuXG4gKi9cbmxldCBhZGRpdGlvbmFsTWVudVBsYWNlbWVudDogeyByZWFkb25seSBtZW51SWQ6IE1lbnVJZDsgcmVhZG9ubHkgaXRlbTogT21pdDxJTWVudUl0ZW0sICdjb21tYW5kJz4gfSB8IHVuZGVmaW5lZDtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyVXBkYXRlVGl0bGVCYXJNZW51UGxhY2VtZW50KG1lbnVJZDogTWVudUlkLCBpdGVtOiBPbWl0PElNZW51SXRlbSwgJ2NvbW1hbmQnPiA9IHt9KTogdm9pZCB7XG5cdGlmIChhZGRpdGlvbmFsTWVudVBsYWNlbWVudCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignQW4gYWRkaXRpb25hbCB1cGRhdGUgdGl0bGUgYmFyIG1lbnUgcGxhY2VtZW50IGlzIGFscmVhZHkgcmVnaXN0ZXJlZCcpO1xuXHR9XG5cdGFkZGl0aW9uYWxNZW51UGxhY2VtZW50ID0geyBtZW51SWQsIGl0ZW0gfTtcbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFVwZGF0ZUluZGljYXRvclRpdGxlQmFyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBVUERBVEVfVElUTEVfQkFSX0FDVElPTl9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgndXBkYXRlSW5kaWNhdG9yVGl0bGVCYXJBY3Rpb24nLCAnVXBkYXRlJyksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLlRpdGxlQmFyVXBkYXRlLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0d2hlbjogVXBkYXRlVGl0bGVCYXJFZGl0b3JWaXNpYmxlQ29udGV4dCxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKSB7IH1cbn0pO1xuXG4vKipcbiAqIERpc3BsYXlzIHVwZGF0ZSBzdGF0dXMgYW5kIGFjdGlvbnMgaW4gdGhlIHRpdGxlIGJhci5cbiAqL1xuZXhwb3J0IGNsYXNzIFVwZGF0ZVRpdGxlQmFyQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHQhOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSB0b29sdGlwITogVXBkYXRlVG9vbHRpcDtcblx0cHJpdmF0ZSBzdGF0ZSE6IFN0YXRlO1xuXHRwcml2YXRlIGVudHJ5OiBVcGRhdGVUaXRsZUJhckVudHJ5IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHRvb2x0aXBWaXNpYmxlID0gZmFsc2U7XG5cdHByaXZhdGUgdG9vbHRpcEZvY3VzZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFjdGlvblZpZXdJdGVtU2VydmljZSBhY3Rpb25WaWV3SXRlbVNlcnZpY2U6IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElVcGRhdGVTZXJ2aWNlIHVwZGF0ZVNlcnZpY2U6IElVcGRhdGVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0aWYgKGlzV2ViKSB7XG5cdFx0XHRyZXR1cm47IC8vIEVsZWN0cm9uIG9ubHlcblx0XHR9XG5cblx0XHR0aGlzLmNvbnRleHQgPSBVcGRhdGVUaXRsZUJhckNvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnRvb2x0aXAgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVcGRhdGVUb29sdGlwKSk7XG5cblx0XHRjb25zdCBjaGF0SW5Qcm9ncmVzc0NvbnRleHQgPSBVcGRhdGVUaXRsZUJhckNoYXRJblByb2dyZXNzQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNoYXRJblByb2dyZXNzQ29udGV4dC5zZXQoY2hhdFNlcnZpY2UucmVxdWVzdEluUHJvZ3Jlc3NPYnMucmVhZChyZWFkZXIpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnN0YXRlID0gdXBkYXRlU2VydmljZS5zdGF0ZTtcblx0XHR0aGlzLl9yZWdpc3Rlcih1cGRhdGVTZXJ2aWNlLm9uU3RhdGVDaGFuZ2UoKHN0YXRlKSA9PiB7XG5cdFx0XHR0aGlzLnN0YXRlID0gc3RhdGU7XG5cdFx0XHR0aGlzLm9uU3RhdGVDaGFuZ2UoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFVQREFURV9USVRMRV9CQVJfU0VUVElORykpIHtcblx0XHRcdFx0dGhpcy5vblN0YXRlQ2hhbmdlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKFxuXHRcdFx0TWVudUlkLlRpdGxlQmFyVXBkYXRlLFxuXHRcdFx0VVBEQVRFX1RJVExFX0JBUl9BQ1RJT05fSUQsXG5cdFx0XHQoYWN0aW9uLCBvcHRpb25zKSA9PiB0aGlzLmNyZWF0ZUVudHJ5KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBhY3Rpb24sIG9wdGlvbnMpXG5cdFx0KSk7XG5cblx0XHRpZiAoYWRkaXRpb25hbE1lbnVQbGFjZW1lbnQpIHtcblx0XHRcdGNvbnN0IHsgbWVudUlkLCBpdGVtIH0gPSBhZGRpdGlvbmFsTWVudVBsYWNlbWVudDtcblx0XHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShtZW51SWQsIHtcblx0XHRcdFx0Li4uaXRlbSxcblx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdGlkOiBVUERBVEVfVElUTEVfQkFSX0FDVElPTl9JRCxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3VwZGF0ZUluZGljYXRvclRpdGxlQmFyQWN0aW9uJywgJ1VwZGF0ZScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoVXBkYXRlVGl0bGVCYXJDb250ZXh0LCBVcGRhdGVUaXRsZUJhckNoYXRJblByb2dyZXNzQ29udGV4dC5uZWdhdGUoKSwgaXRlbS53aGVuKSxcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKFxuXHRcdFx0XHRtZW51SWQsXG5cdFx0XHRcdFVQREFURV9USVRMRV9CQVJfQUNUSU9OX0lELFxuXHRcdFx0XHQoYWN0aW9uLCBvcHRpb25zKSA9PiB0aGlzLmNyZWF0ZUVudHJ5KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBhY3Rpb24sIG9wdGlvbnMpXG5cdFx0XHQpKTtcblx0XHR9XG5cblx0XHR2b2lkIHRoaXMub25TdGF0ZUNoYW5nZSh0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRW50cnkoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyk6IFVwZGF0ZVRpdGxlQmFyRW50cnkge1xuXHRcdHRoaXMuZW50cnkgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVcGRhdGVUaXRsZUJhckVudHJ5LCBhY3Rpb24sIG9wdGlvbnMsIHRoaXMudG9vbHRpcCwgZm9jdXMgPT4ge1xuXHRcdFx0dGhpcy50b29sdGlwVmlzaWJsZSA9IHRydWU7XG5cdFx0XHR0aGlzLnRvb2x0aXBGb2N1c2VkID0gZm9jdXM7XG5cdFx0fSwgKCkgPT4ge1xuXHRcdFx0dGhpcy50b29sdGlwVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0dGhpcy50b29sdGlwRm9jdXNlZCA9IGZhbHNlO1xuXHRcdFx0aWYgKCFBQ1RJT05BQkxFX1NUQVRFUy5pbmNsdWRlcyh0aGlzLnN0YXRlLnR5cGUpICYmICFERVRBSUxFRF9TVEFURVMuaW5jbHVkZXModGhpcy5zdGF0ZS50eXBlKSkge1xuXHRcdFx0XHR0aGlzLmNvbnRleHQuc2V0KGZhbHNlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRpZiAodGhpcy50b29sdGlwVmlzaWJsZSkge1xuXHRcdFx0dGhpcy5lbnRyeS5zaG93VG9vbHRpcCh0aGlzLnRvb2x0aXBGb2N1c2VkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZW50cnk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uU3RhdGVDaGFuZ2Uoc3RhcnR1cCA9IGZhbHNlKSB7XG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oVVBEQVRFX1RJVExFX0JBUl9TRVRUSU5HKSA9PT0gZmFsc2UpIHtcblx0XHRcdHRoaXMudG9vbHRpcFZpc2libGUgPSBmYWxzZTtcblx0XHRcdHRoaXMudG9vbHRpcEZvY3VzZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuY29udGV4dC5zZXQoZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRvb2x0aXAgYWxyZWFkeSBzaG93biBvciB3aW5kb3cgbm90IGxhc3QgZm9jdXNlZDogb25seSBzeW5jIGNvbnRlbnQgYW5kIGluZGljYXRvciB2aXNpYmlsaXR5LlxuXHRcdGlmICh0aGlzLnRvb2x0aXBWaXNpYmxlIHx8ICFhd2FpdCB0aGlzLmhvc3RTZXJ2aWNlLmhhZExhc3RGb2N1cygpKSB7XG5cdFx0XHR0aGlzLmNvbnRleHQuc2V0KHRoaXMudG9vbHRpcFZpc2libGUgfHwgQUNUSU9OQUJMRV9TVEFURVMuaW5jbHVkZXModGhpcy5zdGF0ZS50eXBlKSk7XG5cdFx0XHR0aGlzLnRvb2x0aXAucmVuZGVyU3RhdGUodGhpcy5zdGF0ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy50b29sdGlwLnJlbmRlclN0YXRlKHRoaXMuc3RhdGUpO1xuXG5cdFx0Ly8gU2V0IHRoZSBjb250ZXh0IGtleSBvbmx5IG9uY2UuIFRvZ2dsaW5nIGl0IChlLmcuIG9mZiB0aGVuIG9uKSByZWNyZWF0ZXMgdGhlIGVudHJ5IG9uIGV2ZXJ5XG5cdFx0Ly8gc3RhdGUgdXBkYXRlLCB3aGljaCBmb3IgZnJlcXVlbnQgdXBkYXRlcyBsaWtlIGRvd25sb2FkIHByb2dyZXNzIGZsYXNoZXMgdGhlIHRvb2x0aXAgKCMzMTE5MzgpLlxuXHRcdGxldCBjb250ZXh0ID0gQUNUSU9OQUJMRV9TVEFURVMuaW5jbHVkZXModGhpcy5zdGF0ZS50eXBlKTtcblx0XHRsZXQgc2hvd1Rvb2x0aXAgPSBmYWxzZTtcblx0XHRzd2l0Y2ggKHRoaXMuc3RhdGUudHlwZSkge1xuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuRGlzYWJsZWQ6XG5cdFx0XHRcdGlmIChzdGFydHVwKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVhc29uID0gdGhpcy5zdGF0ZS5yZWFzb247XG5cdFx0XHRcdFx0aWYgKHJlYXNvbiA9PT0gRGlzYWJsZW1lbnRSZWFzb24uSW52YWxpZENvbmZpZ3VyYXRpb24gfHwgcmVhc29uID09PSBEaXNhYmxlbWVudFJlYXNvbi5SdW5uaW5nQXNBZG1pbikge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGFzdFNob3duID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXROdW1iZXIoRElTQUJMRURfUkVNSU5ERVJfTEFTVF9TSE9XTl9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHRcdFx0XHRzaG93VG9vbHRpcCA9IGxhc3RTaG93biA9PT0gdW5kZWZpbmVkIHx8IChEYXRlLm5vdygpIC0gbGFzdFNob3duKSA+PSBESVNBQkxFRF9SRU1JTkRFUl9QRVJJT0Q7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuSWRsZTpcblx0XHRcdFx0c2hvd1Rvb2x0aXAgPSAhIXRoaXMuc3RhdGUuZXJyb3I7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuRG93bmxvYWRpbmc6XG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5VcGRhdGluZzpcblx0XHRcdGNhc2UgU3RhdGVUeXBlLk92ZXJ3cml0aW5nOlxuXHRcdFx0XHRjb250ZXh0ID0gdGhpcy5zdGF0ZS5leHBsaWNpdDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5DYW5jZWxsaW5nOlxuXHRcdFx0XHRjb250ZXh0ID0gdHJ1ZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5SZXN0YXJ0aW5nOlxuXHRcdFx0XHRjb250ZXh0ID0gdHJ1ZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0aWYgKHNob3dUb29sdGlwKSB7XG5cdFx0XHR0aGlzLnRvb2x0aXBWaXNpYmxlID0gdHJ1ZTtcblx0XHRcdGNvbnRleHQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdHRoaXMuY29udGV4dC5zZXQoY29udGV4dCk7XG5cblx0XHRpZiAoc2hvd1Rvb2x0aXApIHtcblx0XHRcdHRoaXMuZW50cnk/LnNob3dUb29sdGlwKCk7XG5cdFx0XHRpZiAodGhpcy5zdGF0ZS50eXBlID09PSBTdGF0ZVR5cGUuRGlzYWJsZWQpIHtcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShESVNBQkxFRF9SRU1JTkRFUl9MQVNUX1NIT1dOX0tFWSwgRGF0ZS5ub3coKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG59XG5cbi8qKlxuICogQ3VzdG9tIGFjdGlvbiB2aWV3IGl0ZW0gZm9yIHRoZSB1cGRhdGUgaW5kaWNhdG9yIGluIHRoZSB0aXRsZSBiYXIuXG4gKi9cbmV4cG9ydCBjbGFzcyBVcGRhdGVUaXRsZUJhckVudHJ5IGV4dGVuZHMgQmFzZUFjdGlvblZpZXdJdGVtIHtcblx0cHJpdmF0ZSBjb250ZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB0b29sdGlwRm9jdXNPblJlbmRlcjogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSB2aXNpYmxlVG9vbHRpcCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJSG92ZXJXaWRnZXQ+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogSUFjdGlvbixcblx0XHRvcHRpb25zOiBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRvb2x0aXA6IFVwZGF0ZVRvb2x0aXAsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvbkRpZFNob3dUb29sdGlwOiAoZm9jdXM6IGJvb2xlYW4pID0+IHZvaWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvblVzZXJEaXNtaXNzZWRUb29sdGlwOiAoKSA9PiB2b2lkLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVXBkYXRlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVwZGF0ZVNlcnZpY2U6IElVcGRhdGVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih1bmRlZmluZWQsIGFjdGlvbiwgb3B0aW9ucyk7XG5cblx0XHR0aGlzLmFjdGlvbi5ydW4gPSAoKSA9PiB0aGlzLnJ1bkFjdGlvbigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudXBkYXRlU2VydmljZS5vblN0YXRlQ2hhbmdlKHN0YXRlID0+IHRoaXMub25TdGF0ZUNoYW5nZShzdGF0ZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbW1hbmRTZXJ2aWNlLm9uRGlkRXhlY3V0ZUNvbW1hbmQoZXZlbnQgPT4ge1xuXHRcdFx0aWYgKGV2ZW50LmNvbW1hbmRJZCA9PT0gJ3dvcmtiZW5jaC5hY3Rpb24uc2hvd0hvdmVyJyAmJiB0aGlzLmlzRm9jdXNlZCgpKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXNUb29sdGlwKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cblx0XHR0aGlzLmNvbnRlbnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy51cGRhdGUtaW5kaWNhdG9yJykpO1xuXHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0dGhpcy51cGRhdGVUb29sdGlwKCk7XG5cdFx0dGhpcy5vblN0YXRlQ2hhbmdlKHRoaXMudXBkYXRlU2VydmljZS5zdGF0ZSk7XG5cblx0XHRpZiAodGhpcy50b29sdGlwRm9jdXNPblJlbmRlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBmb2N1cyA9IHRoaXMudG9vbHRpcEZvY3VzT25SZW5kZXI7XG5cdFx0XHR0aGlzLnRvb2x0aXBGb2N1c09uUmVuZGVyID0gdW5kZWZpbmVkO1xuXHRcdFx0ZG9tLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZG9tLmdldFdpbmRvdyhjb250YWluZXIpLCAoKSA9PiB0aGlzLnNob3dUb29sdGlwKGZvY3VzKSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNob3dUb29sdGlwKGZvY3VzID0gZmFsc2UpIHtcblx0XHRpZiAoIXRoaXMuZWxlbWVudD8uaXNDb25uZWN0ZWQpIHtcblx0XHRcdHRoaXMudG9vbHRpcEZvY3VzT25SZW5kZXIgPSBmb2N1cztcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBob3ZlciA9IHRoaXMuaG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0Y29udGVudDogdGhpcy50b29sdGlwLmRvbU5vZGUsXG5cdFx0XHR0YXJnZXQ6IHtcblx0XHRcdFx0dGFyZ2V0RWxlbWVudHM6IFt0aGlzLmVsZW1lbnRdLFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCEhdGhpcy5lbGVtZW50Py5pc0Nvbm5lY3RlZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5vblVzZXJEaXNtaXNzZWRUb29sdGlwKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0cGVyc2lzdGVuY2U6IHsgc3RpY2t5OiB0cnVlIH0sXG5cdFx0XHRhcHBlYXJhbmNlOiB7IHNob3dQb2ludGVyOiB0cnVlLCBjb21wYWN0OiB0cnVlIH0sXG5cdFx0XHRwb3NpdGlvbjogeyBhbmNob3JBbGlnbm1lbnQ6IEFuY2hvckFsaWdubWVudC5SSUdIVCB9LFxuXHRcdFx0dHJhcEZvY3VzOiBmb2N1cyxcblx0XHR9LCBmb2N1cyk7XG5cblx0XHRpZiAoaG92ZXIpIHtcblx0XHRcdHRoaXMudmlzaWJsZVRvb2x0aXAudmFsdWUgPSBob3Zlcjtcblx0XHRcdHRoaXMub25EaWRTaG93VG9vbHRpcChmb2N1cyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBmb2N1c1Rvb2x0aXAoKTogdm9pZCB7XG5cdFx0dGhpcy52aXNpYmxlVG9vbHRpcC5jbGVhcigpO1xuXHRcdHRoaXMuc2hvd1Rvb2x0aXAodHJ1ZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0SG92ZXJDb250ZW50cygpOiBJTWFuYWdlZEhvdmVyQ29udGVudCB7XG5cdFx0cmV0dXJuIHRoaXMudG9vbHRpcC5kb21Ob2RlO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldEhvdmVyT3B0aW9ucygpOiBJTWFuYWdlZEhvdmVyT3B0aW9ucyB7XG5cdFx0cmV0dXJuIHsgcG9zaXRpb246IHsgYW5jaG9yQWxpZ25tZW50OiBBbmNob3JBbGlnbm1lbnQuUklHSFQgfSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBydW5BY3Rpb24oKSB7XG5cdFx0bGV0IGNvbW1hbmRJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdHN3aXRjaCAodGhpcy51cGRhdGVTZXJ2aWNlLnN0YXRlLnR5cGUpIHtcblx0XHRcdGNhc2UgU3RhdGVUeXBlLkF2YWlsYWJsZUZvckRvd25sb2FkOlxuXHRcdFx0XHRjb21tYW5kSWQgPSAndXBkYXRlLmRvd25sb2FkTm93Jztcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5Eb3dubG9hZGVkOlxuXHRcdFx0XHRjb21tYW5kSWQgPSAndXBkYXRlLmluc3RhbGwnO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgU3RhdGVUeXBlLlJlYWR5OlxuXHRcdFx0XHRjb21tYW5kSWQgPSAndXBkYXRlLnJlc3RhcnQnO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRoaXMuc2hvd1Rvb2x0aXAodHJ1ZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7IGlkOiBjb21tYW5kSWQsIGZyb206ICd0aXRsZWJhcicgfSk7XG5cdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjb21tYW5kSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBvblN0YXRlQ2hhbmdlKHN0YXRlOiBTdGF0ZSkge1xuXHRcdGlmICghdGhpcy5jb250ZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLmNvbnRlbnQpO1xuXHRcdHRoaXMuY29udGVudC5jbGFzc0xpc3QucmVtb3ZlKCdwcm9taW5lbnQnLCAncHJvZ3Jlc3MtaW5kZWZpbml0ZScsICdwcm9ncmVzcy1wZXJjZW50JywgJ3VwZGF0ZS1kaXNhYmxlZCcpO1xuXHRcdHRoaXMuY29udGVudC5zdHlsZS5yZW1vdmVQcm9wZXJ0eSgnLS11cGRhdGUtcHJvZ3Jlc3MnKTtcblxuXHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZCh0aGlzLmNvbnRlbnQsIGRvbS4kKCcuaW5kaWNhdG9yLWxhYmVsJykpO1xuXHRcdHN3aXRjaCAoc3RhdGUudHlwZSkge1xuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuRGlzYWJsZWQ6XG5cdFx0XHRcdGxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3VwZGF0ZUluZGljYXRvci51cGRhdGUnLCBcIlVwZGF0ZVwiKTtcblx0XHRcdFx0dGhpcy5jb250ZW50LmNsYXNzTGlzdC5hZGQoJ3VwZGF0ZS1kaXNhYmxlZCcpO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuQ2hlY2tpbmdGb3JVcGRhdGVzOlxuXHRcdFx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd1cGRhdGVJbmRpY2F0b3IuY2hlY2tpbmcnLCBcIkNoZWNraW5nLi4uXCIpO1xuXHRcdFx0XHR0aGlzLnJlbmRlclByb2dyZXNzU3RhdGUodGhpcy5jb250ZW50KTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgU3RhdGVUeXBlLk92ZXJ3cml0aW5nOlxuXHRcdFx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd1cGRhdGVJbmRpY2F0b3Iub3ZlcndyaXRpbmcnLCBcIlVwZGF0aW5nLi4uXCIpO1xuXHRcdFx0XHR0aGlzLnJlbmRlclByb2dyZXNzU3RhdGUodGhpcy5jb250ZW50KTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgU3RhdGVUeXBlLkF2YWlsYWJsZUZvckRvd25sb2FkOlxuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuRG93bmxvYWRlZDpcblx0XHRcdGNhc2UgU3RhdGVUeXBlLlJlYWR5OlxuXHRcdFx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd1cGRhdGVJbmRpY2F0b3IudXBkYXRlJywgXCJVcGRhdGVcIik7XG5cdFx0XHRcdHRoaXMuY29udGVudC5jbGFzc0xpc3QuYWRkKCdwcm9taW5lbnQnKTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgU3RhdGVUeXBlLkRvd25sb2FkaW5nOlxuXHRcdFx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd1cGRhdGVJbmRpY2F0b3IuZG93bmxvYWRpbmcnLCBcIkRvd25sb2FkaW5nLi4uXCIpO1xuXHRcdFx0XHR0aGlzLnJlbmRlclByb2dyZXNzU3RhdGUodGhpcy5jb250ZW50LCBjb21wdXRlUHJvZ3Jlc3NQZXJjZW50KHN0YXRlLmRvd25sb2FkZWRCeXRlcywgc3RhdGUudG90YWxCeXRlcykpO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuVXBkYXRpbmc6XG5cdFx0XHRcdGxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3VwZGF0ZUluZGljYXRvci5pbnN0YWxsaW5nJywgXCJJbnN0YWxsaW5nLi4uXCIpO1xuXHRcdFx0XHR0aGlzLnJlbmRlclByb2dyZXNzU3RhdGUodGhpcy5jb250ZW50LCBjb21wdXRlUHJvZ3Jlc3NQZXJjZW50KHN0YXRlLmN1cnJlbnRQcm9ncmVzcywgc3RhdGUubWF4UHJvZ3Jlc3MpKTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgU3RhdGVUeXBlLlJlc3RhcnRpbmc6XG5cdFx0XHRcdGxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3VwZGF0ZUluZGljYXRvci5yZXN0YXJ0aW5nJywgXCJSZXN0YXJ0aW5nLi4uXCIpO1xuXHRcdFx0XHR0aGlzLnJlbmRlclByb2dyZXNzU3RhdGUodGhpcy5jb250ZW50KTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgU3RhdGVUeXBlLkNhbmNlbGxpbmc6XG5cdFx0XHRcdGxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3VwZGF0ZUluZGljYXRvci5jYW5jZWxsaW5nJywgXCJDYW5jZWxsaW5nLi4uXCIpO1xuXHRcdFx0XHR0aGlzLnJlbmRlclByb2dyZXNzU3RhdGUodGhpcy5jb250ZW50KTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3VwZGF0ZUluZGljYXRvci51cGRhdGUnLCBcIlVwZGF0ZVwiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0dGhpcy5lbGVtZW50Py5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsYWJlbC50ZXh0Q29udGVudCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclByb2dyZXNzU3RhdGUoY29udGVudDogSFRNTEVsZW1lbnQsIHBlcmNlbnRhZ2U/OiBudW1iZXIpIHtcblx0XHRpZiAocGVyY2VudGFnZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb250ZW50LmNsYXNzTGlzdC5hZGQoJ3Byb2dyZXNzLXBlcmNlbnQnKTtcblx0XHRcdGNvbnRlbnQuc3R5bGUuc2V0UHJvcGVydHkoJy0tdXBkYXRlLXByb2dyZXNzJywgYCR7cGVyY2VudGFnZX0lYCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnRlbnQuY2xhc3NMaXN0LmFkZCgncHJvZ3Jlc3MtaW5kZWZpbml0ZScpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUywwQkFBc0Q7QUFHL0QsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxZQUFZLHlCQUF5QjtBQUM5QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsU0FBb0IsUUFBUSxjQUFjLHVCQUF1QjtBQUMxRSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUE2QiwwQkFBMEI7QUFDaEUsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxtQkFBbUIsZ0JBQXVCLGlCQUFpQjtBQUVwRSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHFDQUFxQyx1QkFBdUIsMENBQTBDO0FBQy9HLFNBQVMsOEJBQThCO0FBQ3ZDLE9BQU87QUFDUCxTQUFTLHFCQUFxQjtBQUU5QixNQUFNLDZCQUE2QjtBQUVuQyxNQUFNLG1DQUFtQztBQUN6QyxNQUFNLDJCQUEyQixLQUFLLEtBQUssS0FBSyxLQUFLO0FBRXJELE1BQU0sMkJBQTJCO0FBRWpDLE1BQU0sb0JBQTBDLENBQUMsVUFBVSxzQkFBc0IsVUFBVSxZQUFZLFVBQVUsS0FBSztBQUN0SCxNQUFNLGtCQUF3QyxDQUFDLEdBQUcsbUJBQW1CLFVBQVUsb0JBQW9CLFVBQVUsYUFBYSxVQUFVLFVBQVUsVUFBVSxhQUFhLFVBQVUsVUFBVTtBQU16TCxJQUFJO0FBRUcsU0FBUyxvQ0FBb0MsUUFBZ0Is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
