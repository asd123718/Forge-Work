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
import "./media/chatSubagentOpenChat.css";
import { $, addDisposableListener, EventHelper, EventType, isHTMLElement, WindowIntervalTimer } from "../../../../../../base/browser/dom.js";
import { BaseActionViewItem } from "../../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { createPixelSpinner } from "../../../../../../base/browser/ui/pixelSpinner/pixelSpinner.js";
import { Action } from "../../../../../../base/common/actions.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { URI } from "../../../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../../../nls.js";
import { IAccessibilityService } from "../../../../../../platform/accessibility/common/accessibility.js";
import { IActionViewItemService } from "../../../../../../platform/actions/browser/actionViewItemService.js";
import { Action2, MenuId, MenuItemAction, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { parseChatUri } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IMarkdownRendererService } from "../../../../../../platform/markdown/browser/markdownRenderer.js";
import { INotificationService } from "../../../../../../platform/notification/common/notification.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../../common/contributions.js";
import { ACTIVE_GROUP } from "../../../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../../../services/environment/common/environmentService.js";
import { formatElapsedTime } from "../../../common/chatProgressFormatting.js";
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, CHAT_SUBAGENT_RESOURCE_QUERY_PARAM } from "../../../common/constants.js";
import { ILanguageModelsService } from "../../../common/languageModels.js";
import { IChatWidgetService } from "../../chat.js";
import { getChatMarkdownRenderOptions } from "../chatContentMarkdownRenderer.js";
import { renderFileWidgets } from "./chatInlineAnchorWidget.js";
import { IChatMarkdownAnchorService } from "./chatMarkdownAnchorService.js";
class SubagentChatOpenerRegistry {
  constructor() {
    this.openers = /* @__PURE__ */ new Set();
  }
  register(opener) {
    this.openers.add(opener);
    return toDisposable(() => this.openers.delete(opener));
  }
  async open(context) {
    for (const opener of this.openers) {
      if (await opener.open(context)) {
        return true;
      }
    }
    return false;
  }
}
const subagentChatOpenerRegistry = new SubagentChatOpenerRegistry();
function asOpenSubagentChatContext(context) {
  if (typeof context === "string") {
    return { chatResource: context };
  }
  if (context && typeof context === "object" && typeof context.chatResource === "string") {
    return context;
  }
  return void 0;
}
function getSubagentEditorResource(context) {
  const parsed = parseChatUri(context.chatResource);
  if (!parsed || !context.parentSessionResource) {
    return void 0;
  }
  try {
    const parentSessionResource = URI.parse(context.parentSessionResource);
    const query = new URLSearchParams(parentSessionResource.query);
    query.set(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM, context.chatResource);
    return parentSessionResource.with({ fragment: parsed.chatId, query: query.toString() });
  } catch {
    return void 0;
  }
}
function shouldShowSubagentModel(subagentModelName, parentModelId, parentModelName, parentModelMetadataId) {
  if (!subagentModelName) {
    return false;
  }
  const normalizedSubagentModel = subagentModelName.trim().toLowerCase();
  const parentModelIdSuffix = parentModelId?.slice(parentModelId.lastIndexOf(":") + 1);
  return ![parentModelId, parentModelIdSuffix, parentModelName, parentModelMetadataId].some((candidate) => candidate?.trim().toLowerCase() === normalizedSubagentModel);
}
function formatCompactSubagentDuration(startedAt, duration, now = Date.now()) {
  const end = duration === void 0 ? now : startedAt + Math.max(0, duration);
  return formatElapsedTime(Math.max(0, end - startedAt));
}
function shouldAnimateSubagentToolTransition(displayedToolCallId, displayedIsTool, targetToolCallId, targetIsTool) {
  if (!displayedIsTool && !targetIsTool) {
    return false;
  }
  return displayedIsTool !== targetIsTool || displayedToolCallId !== targetToolCallId;
}
function createOpenSubagentAction(action) {
  const proxy = new Action(action.id, action.label, action.class, false, (context) => action.run(context));
  proxy.tooltip = action.tooltip;
  return proxy;
}
function createEditorOpenSubagentAction(action, chatWidgetService, notificationService) {
  const proxy = new Action(action.id, action.label, action.class, false, async (rawContext) => {
    const context = asOpenSubagentChatContext(rawContext);
    const resource = context && getSubagentEditorResource(context);
    if (!resource) {
      notificationService.error(localize("chat.subagent.openChat.invalidResource", "The subagent chat could not be opened."));
      return;
    }
    await chatWidgetService.openSession(resource, ACTIVE_GROUP, {
      pinned: true,
      revealIfOpened: true,
      title: context.title ? { preferred: context.title } : void 0
    });
  });
  proxy.tooltip = action.tooltip;
  return proxy;
}
class OpenSubagentChatAction extends Action2 {
  constructor() {
    super({
      id: CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID,
      title: localize2("chat.subagent.openChat", "Open Subagent"),
      icon: Codicon.commentDiscussion,
      f1: false,
      menu: { id: MenuId.ChatSubagentContent, group: "navigation" }
    });
  }
  async run(accessor, rawContext) {
    const notificationService = accessor.get(INotificationService);
    const chatWidgetService = accessor.get(IChatWidgetService);
    const context = asOpenSubagentChatContext(rawContext);
    if (!context) {
      throw new Error("Cannot open a subagent chat without a chat resource");
    }
    if (await subagentChatOpenerRegistry.open(context)) {
      return;
    }
    const resource = getSubagentEditorResource(context);
    if (!resource) {
      notificationService.error(localize("chat.subagent.openChat.invalidResource", "The subagent chat could not be opened."));
      return;
    }
    await chatWidgetService.openSession(resource, ACTIVE_GROUP, {
      pinned: true,
      revealIfOpened: true,
      title: context.title ? { preferred: context.title } : void 0
    });
  }
}
registerAction2(OpenSubagentChatAction);
let OpenSubagentChatActionViewItem = class extends BaseActionViewItem {
  constructor(context, action, options, openInEditor = false, markdownRendererService, instantiationService, chatMarkdownAnchorService, accessibilityService, chatWidgetService, notificationService, languageModelsService, hoverService) {
    super(context, openInEditor ? createEditorOpenSubagentAction(action, chatWidgetService, notificationService) : createOpenSubagentAction(action), options);
    this.markdownRendererService = markdownRendererService;
    this.instantiationService = instantiationService;
    this.chatMarkdownAnchorService = chatMarkdownAnchorService;
    this.accessibilityService = accessibilityService;
    this.languageModelsService = languageModelsService;
    this.hoverService = hoverService;
    this._confirmationCount = 0;
    this._spinner = this._register(new MutableDisposable());
    this._durationTimer = this._register(new WindowIntervalTimer());
    this._toolTransition = this._register(new MutableDisposable());
    this._activeToolRendered = this._register(new MutableDisposable());
    this._activeToolFileWidgets = this._register(new DisposableStore());
    this._pillHover = this._register(new MutableDisposable());
    this._enabledTracker = this._register(new MutableDisposable());
    this._targetActivityIsTool = false;
    this._displayedActivityIsTool = false;
    this._toolTransitionPhase = "idle";
    this._sourceAction = action;
    this._showElapsedOnly = openInEditor;
    if (this._action instanceof Action) {
      this._register(this._action);
    }
    this._register(this.accessibilityService.onDidChangeReducedMotion(() => {
      if (this.accessibilityService.isMotionReduced()) {
        this._finishToolTransition();
      }
    }));
  }
  render(container) {
    super.render(container);
    container.classList.add("chat-subagent-pill-widget");
    container.setAttribute("role", "button");
    this._iconElement = $("span.chat-subagent-pill-icon");
    this._iconElement.appendChild($(`span.chat-subagent-pill-open-icon${ThemeIcon.asCSSSelector(Codicon.commentDiscussion)}`));
    this._labelElement = $("span.chat-subagent-pill-label");
    this._modelElement = $("span.chat-subagent-pill-model.hidden");
    this._confirmationCountElement = $("span.chat-subagent-pill-confirmation-count");
    const pillContent = $("span.chat-subagent-pill-content");
    this._pillContentElement = pillContent;
    const pillHeader = $("span.chat-subagent-pill-header");
    this._durationElement = $("span.chat-subagent-pill-duration.hidden");
    this._activeToolElement = $("span.chat-subagent-pill-active-tool.hidden");
    this._activeToolElement.inert = true;
    const connector = $("span.chat-subagent-pill-active-tool-connector");
    connector.setAttribute("aria-hidden", "true");
    this._activeToolIconElement = $("span.chat-subagent-pill-active-tool-icon");
    this._activeToolIconElement.setAttribute("aria-hidden", "true");
    this._activeToolLabelElement = $(".chat-subagent-pill-active-tool-label");
    this._activeToolElement.append(connector, this._activeToolIconElement, this._activeToolLabelElement);
    pillContent.append(this._iconElement, this._labelElement, this._modelElement, this._confirmationCountElement);
    pillHeader.append(pillContent, this._durationElement);
    container.append(pillHeader, this._activeToolElement);
    this._pillHover.value = this.hoverService.setupDelayedHover(pillContent, () => ({ content: this.getTooltip() ?? "" }));
    this._update();
  }
  onClick(event, preserveFocus = false) {
    const target = event.target;
    if (!this._pillContentElement || !isHTMLElement(target) || !this._pillContentElement.contains(target)) {
      EventHelper.stop(event, true);
      return;
    }
    if (event.altKey) {
      const context = asOpenSubagentChatContext(this._context);
      if (context) {
        EventHelper.stop(event, true);
        this.actionRunner.run(this.action, { ...context, toSide: true });
        return;
      }
    }
    super.onClick(event, preserveFocus);
  }
  setActionContext(newContext) {
    const previousResource = asOpenSubagentChatContext(this._context)?.chatResource;
    super.setActionContext(newContext);
    const resource = asOpenSubagentChatContext(newContext)?.chatResource;
    if (resource !== previousResource) {
      this._trackedEnabled = void 0;
      this._resolvedTitle = void 0;
      this._reportedModelName = void 0;
      this._restartEnabledTracker();
    }
    this._update();
  }
  _update() {
    if (!this.element) {
      return;
    }
    const context = asOpenSubagentChatContext(this._context);
    const enabled = this._trackedEnabled ?? (!!context && !!getSubagentEditorResource(context));
    this._setEnabled(enabled);
    this._setResolvedTitle(context?.title || this._resolvedTitle);
    this._reportedModelName = context?.modelName;
    const parentModel = context?.parentModelId ? this.languageModelsService.lookupLanguageModel(context.parentModelId) : void 0;
    const contextModelName = shouldShowSubagentModel(context?.modelName, context?.parentModelId, context?.parentModelName ?? parentModel?.name, context?.parentResolvedModelId ?? parentModel?.id) ? context?.modelName : void 0;
    this._setModelName(contextModelName);
    this._updateConfirmationCount(context);
    this._updateStatus(context);
    this._updateDuration(context);
    const activeToolLabel = context?.isActive ? context.activeToolLabel : void 0;
    this._setActiveTool(
      context?.isActive ? activeToolLabel ?? localize("chat.subagent.working", "Working on it...") : void 0,
      context?.isActive ? context.activeToolIcon ?? (activeToolLabel ? void 0 : Codicon.comment) : void 0,
      context?.isActive ? context.activeToolCallId : void 0,
      !!activeToolLabel
    );
    this.updateTooltip();
    this.updateEnabled();
    this.updateAriaLabel();
  }
  trackEnabled(tracker) {
    this._enabledTrackerFactory = tracker;
    this._restartEnabledTracker();
  }
  _restartEnabledTracker() {
    const context = asOpenSubagentChatContext(this._context);
    if (!context || !this._enabledTrackerFactory) {
      this._enabledTracker.clear();
      return;
    }
    this._enabledTracker.value = this._enabledTrackerFactory(context, (enabled) => {
      this._trackedEnabled = enabled;
      this._setEnabled(enabled);
    });
  }
  _setEnabled(enabled) {
    this._action.enabled = enabled;
    this._sourceAction.enabled = enabled;
    this.updateEnabled();
  }
  _setModelName(modelName) {
    if (this._modelElement) {
      this._modelElement.textContent = modelName ?? "";
      this._modelElement.classList.toggle("hidden", !modelName);
    }
  }
  _updateStatus(context) {
    const status = (context?.confirmationCount ?? 0) > 0 ? "waiting" : context?.isActive === true ? "running" : context?.isActive === false ? "completed" : void 0;
    if (status === this._renderedStatus) {
      return;
    }
    this._renderedStatus = status;
    const waiting = status === "waiting";
    const running = status === "running";
    this.element?.classList.toggle("chat-subagent-running", running);
    this.element?.classList.toggle("chat-subagent-waiting", waiting);
    this._spinner.clear();
    if ((running || waiting) && this._iconElement) {
      const store = new DisposableStore();
      const spinner = store.add(createPixelSpinner(this._iconElement, { variant: waiting ? "ring" : "grid" }));
      store.add(toDisposable(() => spinner.element.remove()));
      this._spinner.value = store;
    }
  }
  _updateConfirmationCount(context) {
    const count = context?.confirmationCount ?? 0;
    const confirmationActive = !!context?.confirmationActive;
    this._confirmationCount = count;
    this.element?.classList.toggle("chat-subagent-needs-confirmation", count > 0);
    this.element?.classList.toggle("chat-subagent-has-multiple-confirmations", count > 1);
    this.element?.classList.toggle("chat-subagent-confirmation-active", count > 0 && confirmationActive);
    this.element?.classList.toggle("chat-subagent-confirmation-pending", count > 0 && !confirmationActive);
    if (this._confirmationCountElement) {
      this._confirmationCountElement.textContent = String(count);
    }
  }
  _updateDuration(context) {
    this._durationTimer.cancel();
    const startedAt = context?.startedAt;
    const durationValue = context?.duration;
    if (!this._durationElement || startedAt === void 0) {
      this._durationElement?.classList.add("hidden");
      return;
    }
    const update = () => {
      const duration = formatCompactSubagentDuration(startedAt, durationValue);
      this._durationElement.textContent = this._showElapsedOnly ? duration : durationValue === void 0 ? localize("chat.subagent.workingDuration", "Working for {0}", duration) : localize("chat.subagent.workedDuration", "Worked for {0}", duration);
      this.updateAriaLabel();
    };
    update();
    this._durationElement.classList.remove("hidden");
    if (durationValue === void 0) {
      this._durationTimer.cancelAndSet(update, 1e3);
    }
  }
  _setActiveTool(label, icon, toolCallId, isTool) {
    this._targetToolLabel = label;
    this._targetToolIcon = icon;
    this._targetToolCallId = toolCallId;
    this._targetActivityIsTool = isTool;
    if (!this._activeToolElement || !this._activeToolLabelElement || !this._activeToolIconElement) {
      return;
    }
    this._activeToolElement.classList.toggle("hidden", !label);
    if (!label) {
      this._toolTransition.clear();
      this._toolTransitionPhase = "idle";
      this._clearToolTransitionClasses();
      this._activeToolRendered.clear();
      this._activeToolFileWidgets.clear();
      this._activeToolLabelElement.textContent = "";
      this._displayedToolLabel = void 0;
      this._displayedToolIcon = void 0;
      this._displayedToolCallId = void 0;
      this._displayedToolAccessibleLabel = void 0;
      this._displayedActivityIsTool = false;
      this._renderActiveToolIcon(void 0);
      return;
    }
    if (!this._displayedToolLabel || this.accessibilityService.isMotionReduced()) {
      this._finishToolTransition();
      return;
    }
    if (this._toolTransitionPhase === "idle" && !shouldAnimateSubagentToolTransition(this._displayedToolCallId, this._displayedActivityIsTool, toolCallId, isTool)) {
      this._setDisplayedTool(label, icon, toolCallId, isTool);
      return;
    }
    this._runToolTransition();
  }
  _runToolTransition() {
    if (!this._activeToolLabelElement || this._toolTransitionPhase !== "idle") {
      return;
    }
    if (!shouldAnimateSubagentToolTransition(this._displayedToolCallId, this._displayedActivityIsTool, this._targetToolCallId, this._targetActivityIsTool)) {
      if (this._targetToolLabel !== this._displayedToolLabel || this._targetToolIcon?.id !== this._displayedToolIcon?.id || this._targetToolCallId !== this._displayedToolCallId || this._targetActivityIsTool !== this._displayedActivityIsTool) {
        this._setDisplayedTool(this._targetToolLabel ?? "", this._targetToolIcon, this._targetToolCallId, this._targetActivityIsTool);
      }
      return;
    }
    this._toolTransitionPhase = "out";
    if (!this._restartToolTransition("chat-subagent-tool-fade-out")) {
      this._completeToolTransition();
    }
  }
  _completeToolTransition() {
    this._toolTransition.clear();
    if (this._toolTransitionPhase === "out") {
      this._toolTransitionPhase = "in";
      this._setDisplayedTool(this._targetToolLabel ?? "", this._targetToolIcon, this._targetToolCallId, this._targetActivityIsTool);
      if (!this._restartToolTransition("chat-subagent-tool-fade-in")) {
        this._completeToolTransition();
      }
      return;
    }
    if (this._toolTransitionPhase === "in") {
      this._clearToolTransitionClasses();
      this._toolTransitionPhase = "idle";
      this._runToolTransition();
    }
  }
  _finishToolTransition() {
    this._toolTransition.clear();
    this._toolTransitionPhase = "idle";
    this._clearToolTransitionClasses();
    if (this._targetToolLabel) {
      this._setDisplayedTool(this._targetToolLabel, this._targetToolIcon, this._targetToolCallId, this._targetActivityIsTool);
    }
  }
  _setDisplayedTool(label, icon, toolCallId, isTool) {
    if (!this._activeToolLabelElement) {
      return;
    }
    this._activeToolRendered.clear();
    this._activeToolFileWidgets.clear();
    this._activeToolLabelElement.textContent = "";
    const rendered = this.markdownRendererService.render(new MarkdownString(label), getChatMarkdownRenderOptions(), this._activeToolLabelElement);
    renderFileWidgets(rendered.element, this.instantiationService, this.chatMarkdownAnchorService, this._activeToolFileWidgets);
    this._activeToolRendered.value = rendered;
    this._displayedToolLabel = label;
    this._displayedToolIcon = icon;
    this._displayedToolCallId = toolCallId;
    this._displayedToolAccessibleLabel = rendered.element.textContent?.replace(/\s+/g, " ").trim() || label;
    this._displayedActivityIsTool = isTool;
    this._renderActiveToolIcon(icon);
    this.updateTooltip();
    this.updateAriaLabel();
  }
  _renderActiveToolIcon(icon) {
    if (!this._activeToolIconElement) {
      return;
    }
    this._activeToolIconElement.className = "chat-subagent-pill-active-tool-icon";
    if (icon) {
      this._activeToolIconElement.classList.add(...ThemeIcon.asClassNameArray(icon));
    }
  }
  _clearToolTransitionClasses() {
    this._activeToolLabelElement?.classList.remove("chat-subagent-tool-fade-in", "chat-subagent-tool-fade-out");
  }
  _restartToolTransition(className) {
    if (!this._activeToolLabelElement) {
      return false;
    }
    this._toolTransition.clear();
    this._clearToolTransitionClasses();
    const transition = new DisposableStore();
    const complete = (event) => {
      if (event.target === this._activeToolLabelElement) {
        this._completeToolTransition();
      }
    };
    transition.add(addDisposableListener(this._activeToolLabelElement, EventType.ANIMATION_END, complete));
    transition.add(addDisposableListener(this._activeToolLabelElement, "animationcancel", complete));
    this._toolTransition.value = transition;
    void this._activeToolLabelElement.offsetWidth;
    this._activeToolLabelElement.classList.add(className);
    if (this._activeToolLabelElement.getAnimations().length === 0) {
      this._toolTransition.clear();
      this._clearToolTransitionClasses();
      return false;
    }
    return true;
  }
  _setResolvedTitle(title) {
    this._resolvedTitle = title;
    if (this._labelElement) {
      this._labelElement.textContent = title || this._action.label;
    }
  }
  getTooltip() {
    const details = [];
    if (this._confirmationCount > 0) {
      details.push(this._confirmationCount === 1 ? localize("chat.subagent.openChat.confirmationTooltip", "Open subagent chat (1 confirmation needed)") : localize("chat.subagent.openChat.confirmationsTooltip", "Open subagent chat ({0} confirmations needed)", this._confirmationCount));
    } else {
      details.push(this._resolvedTitle ? localize("chat.subagent.openChat.aria", "Open subagent chat: {0}", this._resolvedTitle) : this._action.label);
    }
    if (this._reportedModelName) {
      details.push(localize("chat.subagent.modelTooltip", "Model: {0}", this._reportedModelName));
    }
    if (this._displayedToolAccessibleLabel && this._displayedActivityIsTool) {
      details.push(localize("chat.subagent.activeToolTooltip", "Active tool: {0}", this._displayedToolAccessibleLabel));
    }
    return details.join("\n");
  }
  updateTooltip() {
    this.updateAriaLabel();
  }
  updateEnabled() {
    if (!this.element) {
      return;
    }
    const enabled = this._action.enabled;
    this.element.classList.toggle("disabled", !enabled);
    this.element.classList.toggle("hidden", !enabled);
    this.element.setAttribute("aria-disabled", String(!enabled));
    this.element.setAttribute("aria-hidden", String(!enabled));
  }
  updateAriaLabel() {
    if (!this.element) {
      return;
    }
    const label = this._resolvedTitle ? localize("chat.subagent.openChat.aria", "Open subagent chat: {0}", this._resolvedTitle) : this._action.label;
    const status = this._renderedStatus === "running" ? localize("chat.subagent.status.working", "Subagent is working") : this._renderedStatus === "waiting" ? localize("chat.subagent.status.waiting", "Subagent is waiting for input") : this._renderedStatus === "completed" ? localize("chat.subagent.status.completed", "Subagent completed") : void 0;
    const model = this._reportedModelName ? localize("chat.subagent.modelAria", "Model {0}", this._reportedModelName) : void 0;
    const activeTool = this._displayedToolAccessibleLabel && this._displayedActivityIsTool ? localize("chat.subagent.activeToolAria", "Active tool {0}", this._displayedToolAccessibleLabel) : void 0;
    const duration = this._durationElement?.textContent;
    this.element.setAttribute("aria-label", [label, status, model, activeTool, duration].filter(Boolean).join(". "));
  }
};
OpenSubagentChatActionViewItem = __decorateClass([
  __decorateParam(4, IMarkdownRendererService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IChatMarkdownAnchorService),
  __decorateParam(7, IAccessibilityService),
  __decorateParam(8, IChatWidgetService),
  __decorateParam(9, INotificationService),
  __decorateParam(10, ILanguageModelsService),
  __decorateParam(11, IHoverService)
], OpenSubagentChatActionViewItem);
let EditorOpenSubagentChatActionViewItemContribution = class extends Disposable {
  constructor(actionViewItemService, environmentService) {
    super();
    if (environmentService.isSessionsWindow) {
      return;
    }
    const onDidRegister = this._register(new Emitter());
    this._register(actionViewItemService.register(MenuId.ChatSubagentContent, CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, (action, options, instantiationService) => {
      if (!(action instanceof MenuItemAction)) {
        return void 0;
      }
      return instantiationService.createInstance(OpenSubagentChatActionViewItem, void 0, action, options, true);
    }, onDidRegister.event));
    onDidRegister.fire();
  }
};
EditorOpenSubagentChatActionViewItemContribution.ID = "workbench.contrib.editorOpenSubagentChatActionViewItem";
EditorOpenSubagentChatActionViewItemContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IWorkbenchEnvironmentService)
], EditorOpenSubagentChatActionViewItemContribution);
registerWorkbenchContribution2(EditorOpenSubagentChatActionViewItemContribution.ID, EditorOpenSubagentChatActionViewItemContribution, WorkbenchPhase.BlockStartup);
export {
  OpenSubagentChatActionViewItem,
  formatCompactSubagentDuration,
  getSubagentEditorResource,
  shouldAnimateSubagentToolTransition,
  shouldShowSubagentModel,
  subagentChatOpenerRegistry
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdFN1YmFnZW50T3BlbkNoYXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvY2hhdFN1YmFnZW50T3BlbkNoYXQuY3NzJztcbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRIZWxwZXIsIEV2ZW50TGlrZSwgRXZlbnRUeXBlLCBpc0hUTUxFbGVtZW50LCBXaW5kb3dJbnRlcnZhbFRpbWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBCYXNlQWN0aW9uVmlld0l0ZW0sIElBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVQaXhlbFNwaW5uZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvcGl4ZWxTcGlubmVyL3BpeGVsU3Bpbm5lci5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgTWVudUl0ZW1BY3Rpb24sIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgcGFyc2VDaGF0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgQUNUSVZFX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGZvcm1hdEVsYXBzZWRUaW1lIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRQcm9ncmVzc0Zvcm1hdHRpbmcuanMnO1xuaW1wb3J0IHsgQ0hBVF9PUEVOX0FHRU5UX0hPU1RfQ0hBVF9DT01NQU5EX0lELCBDSEFUX1NVQkFHRU5UX1JFU09VUkNFX1FVRVJZX1BBUkFNIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdE1hcmtkb3duUmVuZGVyT3B0aW9ucyB9IGZyb20gJy4uL2NoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyByZW5kZXJGaWxlV2lkZ2V0cyB9IGZyb20gJy4vY2hhdElubGluZUFuY2hvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSB9IGZyb20gJy4vY2hhdE1hcmtkb3duQW5jaG9yU2VydmljZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU9wZW5TdWJhZ2VudENoYXRDb250ZXh0IHtcblx0cmVhZG9ubHkgY2hhdFJlc291cmNlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhcmVudFNlc3Npb25SZXNvdXJjZT86IHN0cmluZztcblx0cmVhZG9ubHkgdGl0bGU/OiBzdHJpbmc7XG5cdC8qKiBPcGVuIHRoZSBzdWJhZ2VudCBjaGF0IHRvIHRoZSBzaWRlIChpbiBhIG5ldyBncm91cCkgcmF0aGVyIHRoYW4gaW4gcGxhY2UuICovXG5cdHJlYWRvbmx5IHRvU2lkZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNvbmZpcm1hdGlvbkNvdW50PzogbnVtYmVyO1xuXHRyZWFkb25seSBjb25maXJtYXRpb25BY3RpdmU/OiBib29sZWFuO1xuXHRyZWFkb25seSBzdGFydGVkQXQ/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGR1cmF0aW9uPzogbnVtYmVyO1xuXHRyZWFkb25seSBtb2RlbE5hbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhcmVudE1vZGVsSWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhcmVudE1vZGVsTmFtZT86IHN0cmluZztcblx0cmVhZG9ubHkgcGFyZW50UmVzb2x2ZWRNb2RlbElkPzogc3RyaW5nO1xuXHRyZWFkb25seSBpc0FjdGl2ZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGFjdGl2ZVRvb2xDYWxsSWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFjdGl2ZVRvb2xMYWJlbD86IHN0cmluZztcblx0cmVhZG9ubHkgYWN0aXZlVG9vbEljb24/OiBUaGVtZUljb247XG59XG5cbmV4cG9ydCB0eXBlIFN1YmFnZW50Q2hhdFN0YXR1cyA9ICdydW5uaW5nJyB8ICd3YWl0aW5nJyB8ICdjb21wbGV0ZWQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTdWJhZ2VudENoYXRPcGVuZXIge1xuXHRvcGVuKGNvbnRleHQ6IElPcGVuU3ViYWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8Ym9vbGVhbj47XG59XG5cbmNsYXNzIFN1YmFnZW50Q2hhdE9wZW5lclJlZ2lzdHJ5IHtcblx0cHJpdmF0ZSByZWFkb25seSBvcGVuZXJzID0gbmV3IFNldDxJU3ViYWdlbnRDaGF0T3BlbmVyPigpO1xuXG5cdHJlZ2lzdGVyKG9wZW5lcjogSVN1YmFnZW50Q2hhdE9wZW5lcik6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLm9wZW5lcnMuYWRkKG9wZW5lcik7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLm9wZW5lcnMuZGVsZXRlKG9wZW5lcikpO1xuXHR9XG5cblx0YXN5bmMgb3Blbihjb250ZXh0OiBJT3BlblN1YmFnZW50Q2hhdENvbnRleHQpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRmb3IgKGNvbnN0IG9wZW5lciBvZiB0aGlzLm9wZW5lcnMpIHtcblx0XHRcdGlmIChhd2FpdCBvcGVuZXIub3Blbihjb250ZXh0KSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBzdWJhZ2VudENoYXRPcGVuZXJSZWdpc3RyeSA9IG5ldyBTdWJhZ2VudENoYXRPcGVuZXJSZWdpc3RyeSgpO1xuXG5mdW5jdGlvbiBhc09wZW5TdWJhZ2VudENoYXRDb250ZXh0KGNvbnRleHQ6IHVua25vd24pOiBJT3BlblN1YmFnZW50Q2hhdENvbnRleHQgfCB1bmRlZmluZWQge1xuXHRpZiAodHlwZW9mIGNvbnRleHQgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIHsgY2hhdFJlc291cmNlOiBjb250ZXh0IH07XG5cdH1cblx0aWYgKGNvbnRleHQgJiYgdHlwZW9mIGNvbnRleHQgPT09ICdvYmplY3QnICYmIHR5cGVvZiAoY29udGV4dCBhcyBJT3BlblN1YmFnZW50Q2hhdENvbnRleHQpLmNoYXRSZXNvdXJjZSA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gY29udGV4dCBhcyBJT3BlblN1YmFnZW50Q2hhdENvbnRleHQ7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFN1YmFnZW50RWRpdG9yUmVzb3VyY2UoY29udGV4dDogSU9wZW5TdWJhZ2VudENoYXRDb250ZXh0KTogVVJJIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcGFyc2VkID0gcGFyc2VDaGF0VXJpKGNvbnRleHQuY2hhdFJlc291cmNlKTtcblx0aWYgKCFwYXJzZWQgfHwgIWNvbnRleHQucGFyZW50U2Vzc2lvblJlc291cmNlKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHR0cnkge1xuXHRcdGNvbnN0IHBhcmVudFNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZShjb250ZXh0LnBhcmVudFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgcXVlcnkgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHBhcmVudFNlc3Npb25SZXNvdXJjZS5xdWVyeSk7XG5cdFx0cXVlcnkuc2V0KENIQVRfU1VCQUdFTlRfUkVTT1VSQ0VfUVVFUllfUEFSQU0sIGNvbnRleHQuY2hhdFJlc291cmNlKTtcblx0XHRyZXR1cm4gcGFyZW50U2Vzc2lvblJlc291cmNlLndpdGgoeyBmcmFnbWVudDogcGFyc2VkLmNoYXRJZCwgcXVlcnk6IHF1ZXJ5LnRvU3RyaW5nKCkgfSk7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3VsZFNob3dTdWJhZ2VudE1vZGVsKHN1YmFnZW50TW9kZWxOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsIHBhcmVudE1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgcGFyZW50TW9kZWxOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsIHBhcmVudE1vZGVsTWV0YWRhdGFJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdGlmICghc3ViYWdlbnRNb2RlbE5hbWUpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3Qgbm9ybWFsaXplZFN1YmFnZW50TW9kZWwgPSBzdWJhZ2VudE1vZGVsTmFtZS50cmltKCkudG9Mb3dlckNhc2UoKTtcblx0Y29uc3QgcGFyZW50TW9kZWxJZFN1ZmZpeCA9IHBhcmVudE1vZGVsSWQ/LnNsaWNlKHBhcmVudE1vZGVsSWQubGFzdEluZGV4T2YoJzonKSArIDEpO1xuXHRyZXR1cm4gIVtwYXJlbnRNb2RlbElkLCBwYXJlbnRNb2RlbElkU3VmZml4LCBwYXJlbnRNb2RlbE5hbWUsIHBhcmVudE1vZGVsTWV0YWRhdGFJZF1cblx0XHQuc29tZShjYW5kaWRhdGUgPT4gY2FuZGlkYXRlPy50cmltKCkudG9Mb3dlckNhc2UoKSA9PT0gbm9ybWFsaXplZFN1YmFnZW50TW9kZWwpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0Q29tcGFjdFN1YmFnZW50RHVyYXRpb24oc3RhcnRlZEF0OiBudW1iZXIsIGR1cmF0aW9uOiBudW1iZXIgfCB1bmRlZmluZWQsIG5vdzogbnVtYmVyID0gRGF0ZS5ub3coKSk6IHN0cmluZyB7XG5cdGNvbnN0IGVuZCA9IGR1cmF0aW9uID09PSB1bmRlZmluZWQgPyBub3cgOiBzdGFydGVkQXQgKyBNYXRoLm1heCgwLCBkdXJhdGlvbik7XG5cdHJldHVybiBmb3JtYXRFbGFwc2VkVGltZShNYXRoLm1heCgwLCBlbmQgLSBzdGFydGVkQXQpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3VsZEFuaW1hdGVTdWJhZ2VudFRvb2xUcmFuc2l0aW9uKGRpc3BsYXllZFRvb2xDYWxsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGlzcGxheWVkSXNUb29sOiBib29sZWFuLCB0YXJnZXRUb29sQ2FsbElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHRhcmdldElzVG9vbDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRpZiAoIWRpc3BsYXllZElzVG9vbCAmJiAhdGFyZ2V0SXNUb29sKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiBkaXNwbGF5ZWRJc1Rvb2wgIT09IHRhcmdldElzVG9vbCB8fCBkaXNwbGF5ZWRUb29sQ2FsbElkICE9PSB0YXJnZXRUb29sQ2FsbElkO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVPcGVuU3ViYWdlbnRBY3Rpb24oYWN0aW9uOiBJQWN0aW9uKTogQWN0aW9uIHtcblx0Y29uc3QgcHJveHkgPSBuZXcgQWN0aW9uKGFjdGlvbi5pZCwgYWN0aW9uLmxhYmVsLCBhY3Rpb24uY2xhc3MsIGZhbHNlLCBjb250ZXh0ID0+IGFjdGlvbi5ydW4oY29udGV4dCkpO1xuXHRwcm94eS50b29sdGlwID0gYWN0aW9uLnRvb2x0aXA7XG5cdHJldHVybiBwcm94eTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRWRpdG9yT3BlblN1YmFnZW50QWN0aW9uKGFjdGlvbjogSUFjdGlvbiwgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UpOiBBY3Rpb24ge1xuXHRjb25zdCBwcm94eSA9IG5ldyBBY3Rpb24oYWN0aW9uLmlkLCBhY3Rpb24ubGFiZWwsIGFjdGlvbi5jbGFzcywgZmFsc2UsIGFzeW5jIHJhd0NvbnRleHQgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBhc09wZW5TdWJhZ2VudENoYXRDb250ZXh0KHJhd0NvbnRleHQpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gY29udGV4dCAmJiBnZXRTdWJhZ2VudEVkaXRvclJlc291cmNlKGNvbnRleHQpO1xuXHRcdGlmICghcmVzb3VyY2UpIHtcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ2NoYXQuc3ViYWdlbnQub3BlbkNoYXQuaW52YWxpZFJlc291cmNlJywgXCJUaGUgc3ViYWdlbnQgY2hhdCBjb3VsZCBub3QgYmUgb3BlbmVkLlwiKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IGNoYXRXaWRnZXRTZXJ2aWNlLm9wZW5TZXNzaW9uKHJlc291cmNlLCBBQ1RJVkVfR1JPVVAsIHtcblx0XHRcdHBpbm5lZDogdHJ1ZSxcblx0XHRcdHJldmVhbElmT3BlbmVkOiB0cnVlLFxuXHRcdFx0dGl0bGU6IGNvbnRleHQudGl0bGUgPyB7IHByZWZlcnJlZDogY29udGV4dC50aXRsZSB9IDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblx0cHJveHkudG9vbHRpcCA9IGFjdGlvbi50b29sdGlwO1xuXHRyZXR1cm4gcHJveHk7XG59XG5cbmNsYXNzIE9wZW5TdWJhZ2VudENoYXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENIQVRfT1BFTl9BR0VOVF9IT1NUX0NIQVRfQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQuc3ViYWdlbnQub3BlbkNoYXQnLCBcIk9wZW4gU3ViYWdlbnRcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmNvbW1lbnREaXNjdXNzaW9uLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogeyBpZDogTWVudUlkLkNoYXRTdWJhZ2VudENvbnRlbnQsIGdyb3VwOiAnbmF2aWdhdGlvbicgfSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcmF3Q29udGV4dD86IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBjaGF0V2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbnRleHQgPSBhc09wZW5TdWJhZ2VudENoYXRDb250ZXh0KHJhd0NvbnRleHQpO1xuXHRcdGlmICghY29udGV4dCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3Qgb3BlbiBhIHN1YmFnZW50IGNoYXQgd2l0aG91dCBhIGNoYXQgcmVzb3VyY2UnKTtcblx0XHR9XG5cdFx0aWYgKGF3YWl0IHN1YmFnZW50Q2hhdE9wZW5lclJlZ2lzdHJ5Lm9wZW4oY29udGV4dCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBnZXRTdWJhZ2VudEVkaXRvclJlc291cmNlKGNvbnRleHQpO1xuXHRcdGlmICghcmVzb3VyY2UpIHtcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ2NoYXQuc3ViYWdlbnQub3BlbkNoYXQuaW52YWxpZFJlc291cmNlJywgXCJUaGUgc3ViYWdlbnQgY2hhdCBjb3VsZCBub3QgYmUgb3BlbmVkLlwiKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IGNoYXRXaWRnZXRTZXJ2aWNlLm9wZW5TZXNzaW9uKHJlc291cmNlLCBBQ1RJVkVfR1JPVVAsIHtcblx0XHRcdHBpbm5lZDogdHJ1ZSxcblx0XHRcdHJldmVhbElmT3BlbmVkOiB0cnVlLFxuXHRcdFx0dGl0bGU6IGNvbnRleHQudGl0bGUgPyB7IHByZWZlcnJlZDogY29udGV4dC50aXRsZSB9IDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9XG59XG5yZWdpc3RlckFjdGlvbjIoT3BlblN1YmFnZW50Q2hhdEFjdGlvbik7XG5cbmV4cG9ydCBjbGFzcyBPcGVuU3ViYWdlbnRDaGF0QWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zb3VyY2VBY3Rpb246IElBY3Rpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nob3dFbGFwc2VkT25seTogYm9vbGVhbjtcblx0cHJpdmF0ZSBfcmVzb2x2ZWRUaXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF90cmFja2VkRW5hYmxlZDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcmVwb3J0ZWRNb2RlbE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcmVuZGVyZWRTdGF0dXM6IFN1YmFnZW50Q2hhdFN0YXR1cyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY29uZmlybWF0aW9uQ291bnQgPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zcGlubmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2R1cmF0aW9uVGltZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgV2luZG93SW50ZXJ2YWxUaW1lcigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdG9vbFRyYW5zaXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlVG9vbFJlbmRlcmVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVUb29sRmlsZVdpZGdldHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9waWxsSG92ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VuYWJsZWRUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIF9lbmFibGVkVHJhY2tlckZhY3Rvcnk6ICgoY29udGV4dDogSU9wZW5TdWJhZ2VudENoYXRDb250ZXh0LCB1cGRhdGU6IChlbmFibGVkOiBib29sZWFuKSA9PiB2b2lkKSA9PiBJRGlzcG9zYWJsZSkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xhYmVsRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3BpbGxDb250ZW50RWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX21vZGVsRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2R1cmF0aW9uRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2FjdGl2ZVRvb2xFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYWN0aXZlVG9vbEljb25FbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYWN0aXZlVG9vbExhYmVsRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbmZpcm1hdGlvbkNvdW50RWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2ljb25FbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGlzcGxheWVkVG9vbExhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2Rpc3BsYXllZFRvb2xJY29uOiBUaGVtZUljb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2Rpc3BsYXllZFRvb2xDYWxsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGlzcGxheWVkVG9vbEFjY2Vzc2libGVMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF90YXJnZXRUb29sTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdGFyZ2V0VG9vbEljb246IFRoZW1lSWNvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdGFyZ2V0VG9vbENhbGxJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF90YXJnZXRBY3Rpdml0eUlzVG9vbDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9kaXNwbGF5ZWRBY3Rpdml0eUlzVG9vbDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF90b29sVHJhbnNpdGlvblBoYXNlOiAnaWRsZScgfCAnb3V0JyB8ICdpbicgPSAnaWRsZSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGV4dDogdW5rbm93bixcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0b3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucyxcblx0XHRvcGVuSW5FZGl0b3I6IGJvb2xlYW4gPSBmYWxzZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlOiBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihjb250ZXh0LCBvcGVuSW5FZGl0b3IgPyBjcmVhdGVFZGl0b3JPcGVuU3ViYWdlbnRBY3Rpb24oYWN0aW9uLCBjaGF0V2lkZ2V0U2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSkgOiBjcmVhdGVPcGVuU3ViYWdlbnRBY3Rpb24oYWN0aW9uKSwgb3B0aW9ucyk7XG5cdFx0dGhpcy5fc291cmNlQWN0aW9uID0gYWN0aW9uO1xuXHRcdHRoaXMuX3Nob3dFbGFwc2VkT25seSA9IG9wZW5JbkVkaXRvcjtcblx0XHRpZiAodGhpcy5fYWN0aW9uIGluc3RhbmNlb2YgQWN0aW9uKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9hY3Rpb24pO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLm9uRGlkQ2hhbmdlUmVkdWNlZE1vdGlvbigoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5pc01vdGlvblJlZHVjZWQoKSkge1xuXHRcdFx0XHR0aGlzLl9maW5pc2hUb29sVHJhbnNpdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NoYXQtc3ViYWdlbnQtcGlsbC13aWRnZXQnKTtcblx0XHRjb250YWluZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXG5cdFx0dGhpcy5faWNvbkVsZW1lbnQgPSAkKCdzcGFuLmNoYXQtc3ViYWdlbnQtcGlsbC1pY29uJyk7XG5cdFx0dGhpcy5faWNvbkVsZW1lbnQuYXBwZW5kQ2hpbGQoJChgc3Bhbi5jaGF0LXN1YmFnZW50LXBpbGwtb3Blbi1pY29uJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihDb2RpY29uLmNvbW1lbnREaXNjdXNzaW9uKX1gKSk7XG5cdFx0dGhpcy5fbGFiZWxFbGVtZW50ID0gJCgnc3Bhbi5jaGF0LXN1YmFnZW50LXBpbGwtbGFiZWwnKTtcblx0XHR0aGlzLl9tb2RlbEVsZW1lbnQgPSAkKCdzcGFuLmNoYXQtc3ViYWdlbnQtcGlsbC1tb2RlbC5oaWRkZW4nKTtcblx0XHR0aGlzLl9jb25maXJtYXRpb25Db3VudEVsZW1lbnQgPSAkKCdzcGFuLmNoYXQtc3ViYWdlbnQtcGlsbC1jb25maXJtYXRpb24tY291bnQnKTtcblx0XHRjb25zdCBwaWxsQ29udGVudCA9ICQoJ3NwYW4uY2hhdC1zdWJhZ2VudC1waWxsLWNvbnRlbnQnKTtcblx0XHR0aGlzLl9waWxsQ29udGVudEVsZW1lbnQgPSBwaWxsQ29udGVudDtcblx0XHRjb25zdCBwaWxsSGVhZGVyID0gJCgnc3Bhbi5jaGF0LXN1YmFnZW50LXBpbGwtaGVhZGVyJyk7XG5cdFx0dGhpcy5fZHVyYXRpb25FbGVtZW50ID0gJCgnc3Bhbi5jaGF0LXN1YmFnZW50LXBpbGwtZHVyYXRpb24uaGlkZGVuJyk7XG5cdFx0dGhpcy5fYWN0aXZlVG9vbEVsZW1lbnQgPSAkKCdzcGFuLmNoYXQtc3ViYWdlbnQtcGlsbC1hY3RpdmUtdG9vbC5oaWRkZW4nKTtcblx0XHR0aGlzLl9hY3RpdmVUb29sRWxlbWVudC5pbmVydCA9IHRydWU7XG5cdFx0Y29uc3QgY29ubmVjdG9yID0gJCgnc3Bhbi5jaGF0LXN1YmFnZW50LXBpbGwtYWN0aXZlLXRvb2wtY29ubmVjdG9yJyk7XG5cdFx0Y29ubmVjdG9yLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdHRoaXMuX2FjdGl2ZVRvb2xJY29uRWxlbWVudCA9ICQoJ3NwYW4uY2hhdC1zdWJhZ2VudC1waWxsLWFjdGl2ZS10b29sLWljb24nKTtcblx0XHR0aGlzLl9hY3RpdmVUb29sSWNvbkVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0dGhpcy5fYWN0aXZlVG9vbExhYmVsRWxlbWVudCA9ICQoJy5jaGF0LXN1YmFnZW50LXBpbGwtYWN0aXZlLXRvb2wtbGFiZWwnKTtcblx0XHR0aGlzLl9hY3RpdmVUb29sRWxlbWVudC5hcHBlbmQoY29ubmVjdG9yLCB0aGlzLl9hY3RpdmVUb29sSWNvbkVsZW1lbnQsIHRoaXMuX2FjdGl2ZVRvb2xMYWJlbEVsZW1lbnQpO1xuXHRcdHBpbGxDb250ZW50LmFwcGVuZCh0aGlzLl9pY29uRWxlbWVudCwgdGhpcy5fbGFiZWxFbGVtZW50LCB0aGlzLl9tb2RlbEVsZW1lbnQsIHRoaXMuX2NvbmZpcm1hdGlvbkNvdW50RWxlbWVudCk7XG5cdFx0cGlsbEhlYWRlci5hcHBlbmQocGlsbENvbnRlbnQsIHRoaXMuX2R1cmF0aW9uRWxlbWVudCk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZChwaWxsSGVhZGVyLCB0aGlzLl9hY3RpdmVUb29sRWxlbWVudCk7XG5cdFx0dGhpcy5fcGlsbEhvdmVyLnZhbHVlID0gdGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIocGlsbENvbnRlbnQsICgpID0+ICh7IGNvbnRlbnQ6IHRoaXMuZ2V0VG9vbHRpcCgpID8/ICcnIH0pKTtcblx0XHR0aGlzLl91cGRhdGUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIG9uQ2xpY2soZXZlbnQ6IEV2ZW50TGlrZSwgcHJlc2VydmVGb2N1czogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gKGV2ZW50IGFzIE1vdXNlRXZlbnQpLnRhcmdldDtcblx0XHRpZiAoIXRoaXMuX3BpbGxDb250ZW50RWxlbWVudCB8fCAhaXNIVE1MRWxlbWVudCh0YXJnZXQpIHx8ICF0aGlzLl9waWxsQ29udGVudEVsZW1lbnQuY29udGFpbnModGFyZ2V0KSkge1xuXHRcdFx0RXZlbnRIZWxwZXIuc3RvcChldmVudCwgdHJ1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIEFsdC1jbGljayBvcGVucyB0aGUgc3ViYWdlbnQgY2hhdCB0byB0aGUgc2lkZSAoaW4gYSBuZXcgZ3JvdXApIHJhdGhlclxuXHRcdC8vIHRoYW4gaW4gcGxhY2UuIFRocmVhZCB0aGUgaW50ZW50IHRocm91Z2ggdGhlIGFjdGlvbiBjb250ZXh0LlxuXHRcdGlmICgoZXZlbnQgYXMgTW91c2VFdmVudCkuYWx0S2V5KSB7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gYXNPcGVuU3ViYWdlbnRDaGF0Q29udGV4dCh0aGlzLl9jb250ZXh0KTtcblx0XHRcdGlmIChjb250ZXh0KSB7XG5cdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZXZlbnQsIHRydWUpO1xuXHRcdFx0XHR0aGlzLmFjdGlvblJ1bm5lci5ydW4odGhpcy5hY3Rpb24sIHsgLi4uY29udGV4dCwgdG9TaWRlOiB0cnVlIH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHN1cGVyLm9uQ2xpY2soZXZlbnQsIHByZXNlcnZlRm9jdXMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0QWN0aW9uQ29udGV4dChuZXdDb250ZXh0OiB1bmtub3duKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldmlvdXNSZXNvdXJjZSA9IGFzT3BlblN1YmFnZW50Q2hhdENvbnRleHQodGhpcy5fY29udGV4dCk/LmNoYXRSZXNvdXJjZTtcblx0XHRzdXBlci5zZXRBY3Rpb25Db250ZXh0KG5ld0NvbnRleHQpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gYXNPcGVuU3ViYWdlbnRDaGF0Q29udGV4dChuZXdDb250ZXh0KT8uY2hhdFJlc291cmNlO1xuXHRcdGlmIChyZXNvdXJjZSAhPT0gcHJldmlvdXNSZXNvdXJjZSkge1xuXHRcdFx0dGhpcy5fdHJhY2tlZEVuYWJsZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9yZXNvbHZlZFRpdGxlID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fcmVwb3J0ZWRNb2RlbE5hbWUgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9yZXN0YXJ0RW5hYmxlZFRyYWNrZXIoKTtcblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29udGV4dCA9IGFzT3BlblN1YmFnZW50Q2hhdENvbnRleHQodGhpcy5fY29udGV4dCk7XG5cdFx0Y29uc3QgZW5hYmxlZCA9IHRoaXMuX3RyYWNrZWRFbmFibGVkID8/ICghIWNvbnRleHQgJiYgISFnZXRTdWJhZ2VudEVkaXRvclJlc291cmNlKGNvbnRleHQpKTtcblx0XHR0aGlzLl9zZXRFbmFibGVkKGVuYWJsZWQpO1xuXHRcdHRoaXMuX3NldFJlc29sdmVkVGl0bGUoY29udGV4dD8udGl0bGUgfHwgdGhpcy5fcmVzb2x2ZWRUaXRsZSk7XG5cdFx0dGhpcy5fcmVwb3J0ZWRNb2RlbE5hbWUgPSBjb250ZXh0Py5tb2RlbE5hbWU7XG5cdFx0Y29uc3QgcGFyZW50TW9kZWwgPSBjb250ZXh0Py5wYXJlbnRNb2RlbElkID8gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChjb250ZXh0LnBhcmVudE1vZGVsSWQpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNvbnRleHRNb2RlbE5hbWUgPSBzaG91bGRTaG93U3ViYWdlbnRNb2RlbChjb250ZXh0Py5tb2RlbE5hbWUsIGNvbnRleHQ/LnBhcmVudE1vZGVsSWQsIGNvbnRleHQ/LnBhcmVudE1vZGVsTmFtZSA/PyBwYXJlbnRNb2RlbD8ubmFtZSwgY29udGV4dD8ucGFyZW50UmVzb2x2ZWRNb2RlbElkID8/IHBhcmVudE1vZGVsPy5pZClcblx0XHRcdD8gY29udGV4dD8ubW9kZWxOYW1lXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9zZXRNb2RlbE5hbWUoY29udGV4dE1vZGVsTmFtZSk7XG5cdFx0dGhpcy5fdXBkYXRlQ29uZmlybWF0aW9uQ291bnQoY29udGV4dCk7XG5cdFx0dGhpcy5fdXBkYXRlU3RhdHVzKGNvbnRleHQpO1xuXHRcdHRoaXMuX3VwZGF0ZUR1cmF0aW9uKGNvbnRleHQpO1xuXHRcdGNvbnN0IGFjdGl2ZVRvb2xMYWJlbCA9IGNvbnRleHQ/LmlzQWN0aXZlID8gY29udGV4dC5hY3RpdmVUb29sTGFiZWwgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc2V0QWN0aXZlVG9vbChcblx0XHRcdGNvbnRleHQ/LmlzQWN0aXZlID8gYWN0aXZlVG9vbExhYmVsID8/IGxvY2FsaXplKCdjaGF0LnN1YmFnZW50LndvcmtpbmcnLCBcIldvcmtpbmcgb24gaXQuLi5cIikgOiB1bmRlZmluZWQsXG5cdFx0XHRjb250ZXh0Py5pc0FjdGl2ZSA/IGNvbnRleHQuYWN0aXZlVG9vbEljb24gPz8gKGFjdGl2ZVRvb2xMYWJlbCA/IHVuZGVmaW5lZCA6IENvZGljb24uY29tbWVudCkgOiB1bmRlZmluZWQsXG5cdFx0XHRjb250ZXh0Py5pc0FjdGl2ZSA/IGNvbnRleHQuYWN0aXZlVG9vbENhbGxJZCA6IHVuZGVmaW5lZCxcblx0XHRcdCEhYWN0aXZlVG9vbExhYmVsLFxuXHRcdCk7XG5cdFx0dGhpcy51cGRhdGVUb29sdGlwKCk7XG5cdFx0dGhpcy51cGRhdGVFbmFibGVkKCk7XG5cdFx0dGhpcy51cGRhdGVBcmlhTGFiZWwoKTtcblx0fVxuXG5cdHRyYWNrRW5hYmxlZCh0cmFja2VyOiAoY29udGV4dDogSU9wZW5TdWJhZ2VudENoYXRDb250ZXh0LCB1cGRhdGU6IChlbmFibGVkOiBib29sZWFuKSA9PiB2b2lkKSA9PiBJRGlzcG9zYWJsZSk6IHZvaWQge1xuXHRcdHRoaXMuX2VuYWJsZWRUcmFja2VyRmFjdG9yeSA9IHRyYWNrZXI7XG5cdFx0dGhpcy5fcmVzdGFydEVuYWJsZWRUcmFja2VyKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXN0YXJ0RW5hYmxlZFRyYWNrZXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGFzT3BlblN1YmFnZW50Q2hhdENvbnRleHQodGhpcy5fY29udGV4dCk7XG5cdFx0aWYgKCFjb250ZXh0IHx8ICF0aGlzLl9lbmFibGVkVHJhY2tlckZhY3RvcnkpIHtcblx0XHRcdHRoaXMuX2VuYWJsZWRUcmFja2VyLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2VuYWJsZWRUcmFja2VyLnZhbHVlID0gdGhpcy5fZW5hYmxlZFRyYWNrZXJGYWN0b3J5KGNvbnRleHQsIGVuYWJsZWQgPT4ge1xuXHRcdFx0dGhpcy5fdHJhY2tlZEVuYWJsZWQgPSBlbmFibGVkO1xuXHRcdFx0dGhpcy5fc2V0RW5hYmxlZChlbmFibGVkKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEVuYWJsZWQoZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2FjdGlvbi5lbmFibGVkID0gZW5hYmxlZDtcblx0XHR0aGlzLl9zb3VyY2VBY3Rpb24uZW5hYmxlZCA9IGVuYWJsZWQ7XG5cdFx0dGhpcy51cGRhdGVFbmFibGVkKCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRNb2RlbE5hbWUobW9kZWxOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbW9kZWxFbGVtZW50KSB7XG5cdFx0XHR0aGlzLl9tb2RlbEVsZW1lbnQudGV4dENvbnRlbnQgPSBtb2RlbE5hbWUgPz8gJyc7XG5cdFx0XHR0aGlzLl9tb2RlbEVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIW1vZGVsTmFtZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlU3RhdHVzKGNvbnRleHQ6IElPcGVuU3ViYWdlbnRDaGF0Q29udGV4dCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHN0YXR1cyA9IChjb250ZXh0Py5jb25maXJtYXRpb25Db3VudCA/PyAwKSA+IDBcblx0XHRcdD8gJ3dhaXRpbmcnXG5cdFx0XHQ6IGNvbnRleHQ/LmlzQWN0aXZlID09PSB0cnVlXG5cdFx0XHRcdD8gJ3J1bm5pbmcnXG5cdFx0XHRcdDogY29udGV4dD8uaXNBY3RpdmUgPT09IGZhbHNlXG5cdFx0XHRcdFx0PyAnY29tcGxldGVkJ1xuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGlmIChzdGF0dXMgPT09IHRoaXMuX3JlbmRlcmVkU3RhdHVzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3JlbmRlcmVkU3RhdHVzID0gc3RhdHVzO1xuXHRcdGNvbnN0IHdhaXRpbmcgPSBzdGF0dXMgPT09ICd3YWl0aW5nJztcblx0XHRjb25zdCBydW5uaW5nID0gc3RhdHVzID09PSAncnVubmluZyc7XG5cdFx0dGhpcy5lbGVtZW50Py5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXN1YmFnZW50LXJ1bm5pbmcnLCBydW5uaW5nKTtcblx0XHR0aGlzLmVsZW1lbnQ/LmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtc3ViYWdlbnQtd2FpdGluZycsIHdhaXRpbmcpO1xuXHRcdHRoaXMuX3NwaW5uZXIuY2xlYXIoKTtcblx0XHRpZiAoKHJ1bm5pbmcgfHwgd2FpdGluZykgJiYgdGhpcy5faWNvbkVsZW1lbnQpIHtcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3Qgc3Bpbm5lciA9IHN0b3JlLmFkZChjcmVhdGVQaXhlbFNwaW5uZXIodGhpcy5faWNvbkVsZW1lbnQsIHsgdmFyaWFudDogd2FpdGluZyA/ICdyaW5nJyA6ICdncmlkJyB9KSk7XG5cdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHNwaW5uZXIuZWxlbWVudC5yZW1vdmUoKSkpO1xuXHRcdFx0dGhpcy5fc3Bpbm5lci52YWx1ZSA9IHN0b3JlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUNvbmZpcm1hdGlvbkNvdW50KGNvbnRleHQ6IElPcGVuU3ViYWdlbnRDaGF0Q29udGV4dCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvdW50ID0gY29udGV4dD8uY29uZmlybWF0aW9uQ291bnQgPz8gMDtcblx0XHRjb25zdCBjb25maXJtYXRpb25BY3RpdmUgPSAhIWNvbnRleHQ/LmNvbmZpcm1hdGlvbkFjdGl2ZTtcblx0XHR0aGlzLl9jb25maXJtYXRpb25Db3VudCA9IGNvdW50O1xuXHRcdHRoaXMuZWxlbWVudD8uY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC1zdWJhZ2VudC1uZWVkcy1jb25maXJtYXRpb24nLCBjb3VudCA+IDApO1xuXHRcdHRoaXMuZWxlbWVudD8uY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC1zdWJhZ2VudC1oYXMtbXVsdGlwbGUtY29uZmlybWF0aW9ucycsIGNvdW50ID4gMSk7XG5cdFx0dGhpcy5lbGVtZW50Py5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXN1YmFnZW50LWNvbmZpcm1hdGlvbi1hY3RpdmUnLCBjb3VudCA+IDAgJiYgY29uZmlybWF0aW9uQWN0aXZlKTtcblx0XHR0aGlzLmVsZW1lbnQ/LmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtc3ViYWdlbnQtY29uZmlybWF0aW9uLXBlbmRpbmcnLCBjb3VudCA+IDAgJiYgIWNvbmZpcm1hdGlvbkFjdGl2ZSk7XG5cdFx0aWYgKHRoaXMuX2NvbmZpcm1hdGlvbkNvdW50RWxlbWVudCkge1xuXHRcdFx0dGhpcy5fY29uZmlybWF0aW9uQ291bnRFbGVtZW50LnRleHRDb250ZW50ID0gU3RyaW5nKGNvdW50KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVEdXJhdGlvbihjb250ZXh0OiBJT3BlblN1YmFnZW50Q2hhdENvbnRleHQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9kdXJhdGlvblRpbWVyLmNhbmNlbCgpO1xuXHRcdGNvbnN0IHN0YXJ0ZWRBdCA9IGNvbnRleHQ/LnN0YXJ0ZWRBdDtcblx0XHRjb25zdCBkdXJhdGlvblZhbHVlID0gY29udGV4dD8uZHVyYXRpb247XG5cdFx0aWYgKCF0aGlzLl9kdXJhdGlvbkVsZW1lbnQgfHwgc3RhcnRlZEF0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2R1cmF0aW9uRWxlbWVudD8uY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHVwZGF0ZSA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGR1cmF0aW9uID0gZm9ybWF0Q29tcGFjdFN1YmFnZW50RHVyYXRpb24oc3RhcnRlZEF0LCBkdXJhdGlvblZhbHVlKTtcblx0XHRcdHRoaXMuX2R1cmF0aW9uRWxlbWVudCEudGV4dENvbnRlbnQgPSB0aGlzLl9zaG93RWxhcHNlZE9ubHlcblx0XHRcdFx0PyBkdXJhdGlvblxuXHRcdFx0XHQ6IGR1cmF0aW9uVmFsdWUgPT09IHVuZGVmaW5lZFxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQuc3ViYWdlbnQud29ya2luZ0R1cmF0aW9uJywgXCJXb3JraW5nIGZvciB7MH1cIiwgZHVyYXRpb24pXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC53b3JrZWREdXJhdGlvbicsIFwiV29ya2VkIGZvciB7MH1cIiwgZHVyYXRpb24pO1xuXHRcdFx0dGhpcy51cGRhdGVBcmlhTGFiZWwoKTtcblx0XHR9O1xuXHRcdHVwZGF0ZSgpO1xuXHRcdHRoaXMuX2R1cmF0aW9uRWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcblx0XHRpZiAoZHVyYXRpb25WYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9kdXJhdGlvblRpbWVyLmNhbmNlbEFuZFNldCh1cGRhdGUsIDEwMDApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldEFjdGl2ZVRvb2wobGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgaWNvbjogVGhlbWVJY29uIHwgdW5kZWZpbmVkLCB0b29sQ2FsbElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGlzVG9vbDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3RhcmdldFRvb2xMYWJlbCA9IGxhYmVsO1xuXHRcdHRoaXMuX3RhcmdldFRvb2xJY29uID0gaWNvbjtcblx0XHR0aGlzLl90YXJnZXRUb29sQ2FsbElkID0gdG9vbENhbGxJZDtcblx0XHR0aGlzLl90YXJnZXRBY3Rpdml0eUlzVG9vbCA9IGlzVG9vbDtcblx0XHRpZiAoIXRoaXMuX2FjdGl2ZVRvb2xFbGVtZW50IHx8ICF0aGlzLl9hY3RpdmVUb29sTGFiZWxFbGVtZW50IHx8ICF0aGlzLl9hY3RpdmVUb29sSWNvbkVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYWN0aXZlVG9vbEVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIWxhYmVsKTtcblx0XHRpZiAoIWxhYmVsKSB7XG5cdFx0XHR0aGlzLl90b29sVHJhbnNpdGlvbi5jbGVhcigpO1xuXHRcdFx0dGhpcy5fdG9vbFRyYW5zaXRpb25QaGFzZSA9ICdpZGxlJztcblx0XHRcdHRoaXMuX2NsZWFyVG9vbFRyYW5zaXRpb25DbGFzc2VzKCk7XG5cdFx0XHR0aGlzLl9hY3RpdmVUb29sUmVuZGVyZWQuY2xlYXIoKTtcblx0XHRcdHRoaXMuX2FjdGl2ZVRvb2xGaWxlV2lkZ2V0cy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fYWN0aXZlVG9vbExhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0dGhpcy5fZGlzcGxheWVkVG9vbExhYmVsID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fZGlzcGxheWVkVG9vbEljb24gPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9kaXNwbGF5ZWRUb29sQ2FsbElkID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fZGlzcGxheWVkVG9vbEFjY2Vzc2libGVMYWJlbCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2Rpc3BsYXllZEFjdGl2aXR5SXNUb29sID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9yZW5kZXJBY3RpdmVUb29sSWNvbih1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2Rpc3BsYXllZFRvb2xMYWJlbCB8fCB0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzTW90aW9uUmVkdWNlZCgpKSB7XG5cdFx0XHR0aGlzLl9maW5pc2hUb29sVHJhbnNpdGlvbigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fdG9vbFRyYW5zaXRpb25QaGFzZSA9PT0gJ2lkbGUnICYmICFzaG91bGRBbmltYXRlU3ViYWdlbnRUb29sVHJhbnNpdGlvbih0aGlzLl9kaXNwbGF5ZWRUb29sQ2FsbElkLCB0aGlzLl9kaXNwbGF5ZWRBY3Rpdml0eUlzVG9vbCwgdG9vbENhbGxJZCwgaXNUb29sKSkge1xuXHRcdFx0dGhpcy5fc2V0RGlzcGxheWVkVG9vbChsYWJlbCwgaWNvbiwgdG9vbENhbGxJZCwgaXNUb29sKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcnVuVG9vbFRyYW5zaXRpb24oKTtcblx0fVxuXG5cdHByaXZhdGUgX3J1blRvb2xUcmFuc2l0aW9uKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fYWN0aXZlVG9vbExhYmVsRWxlbWVudCB8fCB0aGlzLl90b29sVHJhbnNpdGlvblBoYXNlICE9PSAnaWRsZScpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFzaG91bGRBbmltYXRlU3ViYWdlbnRUb29sVHJhbnNpdGlvbih0aGlzLl9kaXNwbGF5ZWRUb29sQ2FsbElkLCB0aGlzLl9kaXNwbGF5ZWRBY3Rpdml0eUlzVG9vbCwgdGhpcy5fdGFyZ2V0VG9vbENhbGxJZCwgdGhpcy5fdGFyZ2V0QWN0aXZpdHlJc1Rvb2wpKSB7XG5cdFx0XHRpZiAodGhpcy5fdGFyZ2V0VG9vbExhYmVsICE9PSB0aGlzLl9kaXNwbGF5ZWRUb29sTGFiZWxcblx0XHRcdFx0fHwgdGhpcy5fdGFyZ2V0VG9vbEljb24/LmlkICE9PSB0aGlzLl9kaXNwbGF5ZWRUb29sSWNvbj8uaWRcblx0XHRcdFx0fHwgdGhpcy5fdGFyZ2V0VG9vbENhbGxJZCAhPT0gdGhpcy5fZGlzcGxheWVkVG9vbENhbGxJZFxuXHRcdFx0XHR8fCB0aGlzLl90YXJnZXRBY3Rpdml0eUlzVG9vbCAhPT0gdGhpcy5fZGlzcGxheWVkQWN0aXZpdHlJc1Rvb2wpIHtcblx0XHRcdFx0dGhpcy5fc2V0RGlzcGxheWVkVG9vbCh0aGlzLl90YXJnZXRUb29sTGFiZWwgPz8gJycsIHRoaXMuX3RhcmdldFRvb2xJY29uLCB0aGlzLl90YXJnZXRUb29sQ2FsbElkLCB0aGlzLl90YXJnZXRBY3Rpdml0eUlzVG9vbCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Rvb2xUcmFuc2l0aW9uUGhhc2UgPSAnb3V0Jztcblx0XHRpZiAoIXRoaXMuX3Jlc3RhcnRUb29sVHJhbnNpdGlvbignY2hhdC1zdWJhZ2VudC10b29sLWZhZGUtb3V0JykpIHtcblx0XHRcdHRoaXMuX2NvbXBsZXRlVG9vbFRyYW5zaXRpb24oKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jb21wbGV0ZVRvb2xUcmFuc2l0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Rvb2xUcmFuc2l0aW9uLmNsZWFyKCk7XG5cdFx0aWYgKHRoaXMuX3Rvb2xUcmFuc2l0aW9uUGhhc2UgPT09ICdvdXQnKSB7XG5cdFx0XHR0aGlzLl90b29sVHJhbnNpdGlvblBoYXNlID0gJ2luJztcblx0XHRcdHRoaXMuX3NldERpc3BsYXllZFRvb2wodGhpcy5fdGFyZ2V0VG9vbExhYmVsID8/ICcnLCB0aGlzLl90YXJnZXRUb29sSWNvbiwgdGhpcy5fdGFyZ2V0VG9vbENhbGxJZCwgdGhpcy5fdGFyZ2V0QWN0aXZpdHlJc1Rvb2wpO1xuXHRcdFx0aWYgKCF0aGlzLl9yZXN0YXJ0VG9vbFRyYW5zaXRpb24oJ2NoYXQtc3ViYWdlbnQtdG9vbC1mYWRlLWluJykpIHtcblx0XHRcdFx0dGhpcy5fY29tcGxldGVUb29sVHJhbnNpdGlvbigpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fdG9vbFRyYW5zaXRpb25QaGFzZSA9PT0gJ2luJykge1xuXHRcdFx0dGhpcy5fY2xlYXJUb29sVHJhbnNpdGlvbkNsYXNzZXMoKTtcblx0XHRcdHRoaXMuX3Rvb2xUcmFuc2l0aW9uUGhhc2UgPSAnaWRsZSc7XG5cdFx0XHR0aGlzLl9ydW5Ub29sVHJhbnNpdGlvbigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ZpbmlzaFRvb2xUcmFuc2l0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Rvb2xUcmFuc2l0aW9uLmNsZWFyKCk7XG5cdFx0dGhpcy5fdG9vbFRyYW5zaXRpb25QaGFzZSA9ICdpZGxlJztcblx0XHR0aGlzLl9jbGVhclRvb2xUcmFuc2l0aW9uQ2xhc3NlcygpO1xuXHRcdGlmICh0aGlzLl90YXJnZXRUb29sTGFiZWwpIHtcblx0XHRcdHRoaXMuX3NldERpc3BsYXllZFRvb2wodGhpcy5fdGFyZ2V0VG9vbExhYmVsLCB0aGlzLl90YXJnZXRUb29sSWNvbiwgdGhpcy5fdGFyZ2V0VG9vbENhbGxJZCwgdGhpcy5fdGFyZ2V0QWN0aXZpdHlJc1Rvb2wpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldERpc3BsYXllZFRvb2wobGFiZWw6IHN0cmluZywgaWNvbjogVGhlbWVJY29uIHwgdW5kZWZpbmVkLCB0b29sQ2FsbElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGlzVG9vbDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fYWN0aXZlVG9vbExhYmVsRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9hY3RpdmVUb29sUmVuZGVyZWQuY2xlYXIoKTtcblx0XHR0aGlzLl9hY3RpdmVUb29sRmlsZVdpZGdldHMuY2xlYXIoKTtcblx0XHR0aGlzLl9hY3RpdmVUb29sTGFiZWxFbGVtZW50LnRleHRDb250ZW50ID0gJyc7XG5cdFx0Y29uc3QgcmVuZGVyZWQgPSB0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihuZXcgTWFya2Rvd25TdHJpbmcobGFiZWwpLCBnZXRDaGF0TWFya2Rvd25SZW5kZXJPcHRpb25zKCksIHRoaXMuX2FjdGl2ZVRvb2xMYWJlbEVsZW1lbnQpO1xuXHRcdHJlbmRlckZpbGVXaWRnZXRzKHJlbmRlcmVkLmVsZW1lbnQsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIHRoaXMuY2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSwgdGhpcy5fYWN0aXZlVG9vbEZpbGVXaWRnZXRzKTtcblx0XHR0aGlzLl9hY3RpdmVUb29sUmVuZGVyZWQudmFsdWUgPSByZW5kZXJlZDtcblx0XHR0aGlzLl9kaXNwbGF5ZWRUb29sTGFiZWwgPSBsYWJlbDtcblx0XHR0aGlzLl9kaXNwbGF5ZWRUb29sSWNvbiA9IGljb247XG5cdFx0dGhpcy5fZGlzcGxheWVkVG9vbENhbGxJZCA9IHRvb2xDYWxsSWQ7XG5cdFx0dGhpcy5fZGlzcGxheWVkVG9vbEFjY2Vzc2libGVMYWJlbCA9IHJlbmRlcmVkLmVsZW1lbnQudGV4dENvbnRlbnQ/LnJlcGxhY2UoL1xccysvZywgJyAnKS50cmltKCkgfHwgbGFiZWw7XG5cdFx0dGhpcy5fZGlzcGxheWVkQWN0aXZpdHlJc1Rvb2wgPSBpc1Rvb2w7XG5cdFx0dGhpcy5fcmVuZGVyQWN0aXZlVG9vbEljb24oaWNvbik7XG5cdFx0dGhpcy51cGRhdGVUb29sdGlwKCk7XG5cdFx0dGhpcy51cGRhdGVBcmlhTGFiZWwoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckFjdGl2ZVRvb2xJY29uKGljb246IFRoZW1lSWNvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fYWN0aXZlVG9vbEljb25FbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2FjdGl2ZVRvb2xJY29uRWxlbWVudC5jbGFzc05hbWUgPSAnY2hhdC1zdWJhZ2VudC1waWxsLWFjdGl2ZS10b29sLWljb24nO1xuXHRcdGlmIChpY29uKSB7XG5cdFx0XHR0aGlzLl9hY3RpdmVUb29sSWNvbkVsZW1lbnQuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShpY29uKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJUb29sVHJhbnNpdGlvbkNsYXNzZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aXZlVG9vbExhYmVsRWxlbWVudD8uY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC1zdWJhZ2VudC10b29sLWZhZGUtaW4nLCAnY2hhdC1zdWJhZ2VudC10b29sLWZhZGUtb3V0Jyk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXN0YXJ0VG9vbFRyYW5zaXRpb24oY2xhc3NOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX2FjdGl2ZVRvb2xMYWJlbEVsZW1lbnQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fdG9vbFRyYW5zaXRpb24uY2xlYXIoKTtcblx0XHR0aGlzLl9jbGVhclRvb2xUcmFuc2l0aW9uQ2xhc3NlcygpO1xuXHRcdGNvbnN0IHRyYW5zaXRpb24gPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgY29tcGxldGUgPSAoZXZlbnQ6IEFuaW1hdGlvbkV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZXZlbnQudGFyZ2V0ID09PSB0aGlzLl9hY3RpdmVUb29sTGFiZWxFbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuX2NvbXBsZXRlVG9vbFRyYW5zaXRpb24oKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRyYW5zaXRpb24uYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9hY3RpdmVUb29sTGFiZWxFbGVtZW50LCBFdmVudFR5cGUuQU5JTUFUSU9OX0VORCwgY29tcGxldGUpKTtcblx0XHR0cmFuc2l0aW9uLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fYWN0aXZlVG9vbExhYmVsRWxlbWVudCwgJ2FuaW1hdGlvbmNhbmNlbCcsIGNvbXBsZXRlKSk7XG5cdFx0dGhpcy5fdG9vbFRyYW5zaXRpb24udmFsdWUgPSB0cmFuc2l0aW9uO1xuXHRcdHZvaWQgdGhpcy5fYWN0aXZlVG9vbExhYmVsRWxlbWVudC5vZmZzZXRXaWR0aDtcblx0XHR0aGlzLl9hY3RpdmVUb29sTGFiZWxFbGVtZW50LmNsYXNzTGlzdC5hZGQoY2xhc3NOYW1lKTtcblx0XHRpZiAodGhpcy5fYWN0aXZlVG9vbExhYmVsRWxlbWVudC5nZXRBbmltYXRpb25zKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl90b29sVHJhbnNpdGlvbi5jbGVhcigpO1xuXHRcdFx0dGhpcy5fY2xlYXJUb29sVHJhbnNpdGlvbkNsYXNzZXMoKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRSZXNvbHZlZFRpdGxlKHRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXNvbHZlZFRpdGxlID0gdGl0bGU7XG5cdFx0aWYgKHRoaXMuX2xhYmVsRWxlbWVudCkge1xuXHRcdFx0dGhpcy5fbGFiZWxFbGVtZW50LnRleHRDb250ZW50ID0gdGl0bGUgfHwgdGhpcy5fYWN0aW9uLmxhYmVsO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRUb29sdGlwKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZGV0YWlsczogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAodGhpcy5fY29uZmlybWF0aW9uQ291bnQgPiAwKSB7XG5cdFx0XHRkZXRhaWxzLnB1c2godGhpcy5fY29uZmlybWF0aW9uQ291bnQgPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC5vcGVuQ2hhdC5jb25maXJtYXRpb25Ub29sdGlwJywgXCJPcGVuIHN1YmFnZW50IGNoYXQgKDEgY29uZmlybWF0aW9uIG5lZWRlZClcIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC5vcGVuQ2hhdC5jb25maXJtYXRpb25zVG9vbHRpcCcsIFwiT3BlbiBzdWJhZ2VudCBjaGF0ICh7MH0gY29uZmlybWF0aW9ucyBuZWVkZWQpXCIsIHRoaXMuX2NvbmZpcm1hdGlvbkNvdW50KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRldGFpbHMucHVzaCh0aGlzLl9yZXNvbHZlZFRpdGxlID8gbG9jYWxpemUoJ2NoYXQuc3ViYWdlbnQub3BlbkNoYXQuYXJpYScsIFwiT3BlbiBzdWJhZ2VudCBjaGF0OiB7MH1cIiwgdGhpcy5fcmVzb2x2ZWRUaXRsZSkgOiB0aGlzLl9hY3Rpb24ubGFiZWwpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fcmVwb3J0ZWRNb2RlbE5hbWUpIHtcblx0XHRcdGRldGFpbHMucHVzaChsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC5tb2RlbFRvb2x0aXAnLCBcIk1vZGVsOiB7MH1cIiwgdGhpcy5fcmVwb3J0ZWRNb2RlbE5hbWUpKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2Rpc3BsYXllZFRvb2xBY2Nlc3NpYmxlTGFiZWwgJiYgdGhpcy5fZGlzcGxheWVkQWN0aXZpdHlJc1Rvb2wpIHtcblx0XHRcdGRldGFpbHMucHVzaChsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC5hY3RpdmVUb29sVG9vbHRpcCcsIFwiQWN0aXZlIHRvb2w6IHswfVwiLCB0aGlzLl9kaXNwbGF5ZWRUb29sQWNjZXNzaWJsZUxhYmVsKSk7XG5cdFx0fVxuXHRcdHJldHVybiBkZXRhaWxzLmpvaW4oJ1xcbicpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZVRvb2x0aXAoKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVBcmlhTGFiZWwoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVFbmFibGVkKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5lbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGVuYWJsZWQgPSB0aGlzLl9hY3Rpb24uZW5hYmxlZDtcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCAhZW5hYmxlZCk7XG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsICFlbmFibGVkKTtcblx0XHR0aGlzLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJywgU3RyaW5nKCFlbmFibGVkKSk7XG5cdFx0dGhpcy5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCBTdHJpbmcoIWVuYWJsZWQpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVBcmlhTGFiZWwoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLl9yZXNvbHZlZFRpdGxlXG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnN1YmFnZW50Lm9wZW5DaGF0LmFyaWEnLCBcIk9wZW4gc3ViYWdlbnQgY2hhdDogezB9XCIsIHRoaXMuX3Jlc29sdmVkVGl0bGUpXG5cdFx0XHQ6IHRoaXMuX2FjdGlvbi5sYWJlbDtcblx0XHRjb25zdCBzdGF0dXMgPSB0aGlzLl9yZW5kZXJlZFN0YXR1cyA9PT0gJ3J1bm5pbmcnXG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnN1YmFnZW50LnN0YXR1cy53b3JraW5nJywgXCJTdWJhZ2VudCBpcyB3b3JraW5nXCIpXG5cdFx0XHQ6IHRoaXMuX3JlbmRlcmVkU3RhdHVzID09PSAnd2FpdGluZydcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC5zdGF0dXMud2FpdGluZycsIFwiU3ViYWdlbnQgaXMgd2FpdGluZyBmb3IgaW5wdXRcIilcblx0XHRcdFx0OiB0aGlzLl9yZW5kZXJlZFN0YXR1cyA9PT0gJ2NvbXBsZXRlZCdcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnN1YmFnZW50LnN0YXR1cy5jb21wbGV0ZWQnLCBcIlN1YmFnZW50IGNvbXBsZXRlZFwiKVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fcmVwb3J0ZWRNb2RlbE5hbWUgPyBsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC5tb2RlbEFyaWEnLCBcIk1vZGVsIHswfVwiLCB0aGlzLl9yZXBvcnRlZE1vZGVsTmFtZSkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYWN0aXZlVG9vbCA9IHRoaXMuX2Rpc3BsYXllZFRvb2xBY2Nlc3NpYmxlTGFiZWwgJiYgdGhpcy5fZGlzcGxheWVkQWN0aXZpdHlJc1Rvb2xcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXQuc3ViYWdlbnQuYWN0aXZlVG9vbEFyaWEnLCBcIkFjdGl2ZSB0b29sIHswfVwiLCB0aGlzLl9kaXNwbGF5ZWRUb29sQWNjZXNzaWJsZUxhYmVsKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZHVyYXRpb24gPSB0aGlzLl9kdXJhdGlvbkVsZW1lbnQ/LnRleHRDb250ZW50O1xuXHRcdHRoaXMuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBbbGFiZWwsIHN0YXR1cywgbW9kZWwsIGFjdGl2ZVRvb2wsIGR1cmF0aW9uXS5maWx0ZXIoQm9vbGVhbikuam9pbignLiAnKSk7XG5cdH1cbn1cblxuY2xhc3MgRWRpdG9yT3BlblN1YmFnZW50Q2hhdEFjdGlvblZpZXdJdGVtQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuZWRpdG9yT3BlblN1YmFnZW50Q2hhdEFjdGlvblZpZXdJdGVtJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFjdGlvblZpZXdJdGVtU2VydmljZSBhY3Rpb25WaWV3SXRlbVNlcnZpY2U6IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGlmIChlbnZpcm9ubWVudFNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBvbkRpZFJlZ2lzdGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKE1lbnVJZC5DaGF0U3ViYWdlbnRDb250ZW50LCBDSEFUX09QRU5fQUdFTlRfSE9TVF9DSEFUX0NPTU1BTkRfSUQsIChhY3Rpb24sIG9wdGlvbnMsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShPcGVuU3ViYWdlbnRDaGF0QWN0aW9uVmlld0l0ZW0sIHVuZGVmaW5lZCwgYWN0aW9uLCBvcHRpb25zLCB0cnVlKTtcblx0XHR9LCBvbkRpZFJlZ2lzdGVyLmV2ZW50KSk7XG5cdFx0b25EaWRSZWdpc3Rlci5maXJlKCk7XG5cdH1cbn1cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihFZGl0b3JPcGVuU3ViYWdlbnRDaGF0QWN0aW9uVmlld0l0ZW1Db250cmlidXRpb24uSUQsIEVkaXRvck9wZW5TdWJhZ2VudENoYXRBY3Rpb25WaWV3SXRlbUNvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tTdGFydHVwKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsR0FBRyx1QkFBdUIsYUFBd0IsV0FBVyxlQUFlLDJCQUEyQjtBQUNoSCxTQUFTLDBCQUFrRDtBQUMzRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGNBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxZQUFZLGlCQUE4QixtQkFBbUIsb0JBQW9CO0FBQzFGLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsU0FBUyxRQUFRLGdCQUFnQix1QkFBdUI7QUFDakUsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FB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
