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
import "./media/agentsessionsviewer.css";
import { clearNode, h, isHTMLElement } from "../../../../../base/browser/dom.js";
import { localize } from "../../../../../nls.js";
import { NotSelectableGroupId } from "../../../../../base/browser/ui/list/list.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { AgentSessionSection, AgentSessionStatus, getAgentChangesSummary, hasValidDiff, isAgentSession, isAgentSessionSection, isAgentSessionShowLess, isAgentSessionShowMore, isAgentSessionsModel, isSessionInProgressStatus } from "./agentSessionsModel.js";
import { IconLabel } from "../../../../../base/browser/ui/iconLabel/iconLabel.js";
import { ThemeIcon, themeColorFromId } from "../../../../../base/common/themables.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { asCssVariable } from "../../../../../platform/theme/common/colorUtils.js";
import { fromNow, getDurationString } from "../../../../../base/common/date.js";
import { createMatches } from "../../../../../base/common/filters.js";
import { IMarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { allowedChatMarkdownHtmlTags } from "../widget/chatContentMarkdownRenderer.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { coalesce } from "../../../../../base/common/arrays.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { fillEditorsDragData } from "../../../../browser/dnd.js";
import { HoverStyle } from "../../../../../base/browser/ui/hover/hover.js";
import { HoverPosition } from "../../../../../base/browser/ui/hover/hoverWidget.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IntervalTimer } from "../../../../../base/common/async.js";
import { MenuWorkbenchToolBar } from "../../../../../platform/actions/browser/toolbar.js";
import { MenuId } from "../../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { Emitter } from "../../../../../base/common/event.js";
import { renderAsPlaintext } from "../../../../../base/browser/markdownRenderer.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { AgentSessionHoverWidget } from "./agentSessionHoverWidget.js";
import { AgentSessionProviders } from "./agentSessions.js";
import { AgentSessionsGrouping, AgentSessionsSorting } from "./agentSessionsFilter.js";
import { autorun } from "../../../../../base/common/observable.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { defaultButtonStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { BugIndicatingError } from "../../../../../base/common/errors.js";
import { compareIgnoreCase } from "../../../../../base/common/strings.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { IChatSessionsService } from "../../common/chatSessionsService.js";
import { IVoicePlaybackService } from "../../common/voicePlaybackService.js";
import { createPixelSpinner } from "../../../../../base/browser/ui/pixelSpinner/pixelSpinner.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
const _AgentSessionStatusIcon = class _AgentSessionStatusIcon extends Disposable {
  constructor(container, getIcon, accessibilityService) {
    super();
    this.container = container;
    this.getIcon = getIcon;
    this.accessibilityService = accessibilityService;
    this.spinner = this._register(new MutableDisposable());
    this._register(this.accessibilityService.onDidChangeReducedMotion(() => {
      if (this._lastSession) {
        this.render(this._lastSession);
      }
    }));
  }
  setStatus(session) {
    this._lastSession = session;
    this.render(session);
  }
  reset() {
    this._currentCacheKey = void 0;
    this._lastSession = void 0;
    this.spinner.clear();
    clearNode(this.container);
  }
  render(session) {
    this.container.className = `agent-session-icon${session.status === AgentSessionStatus.NeedsInput ? " needs-input" : ""}`;
    this.container.style.color = "";
    if ((session.status === AgentSessionStatus.InProgress || session.status === AgentSessionStatus.NeedsInput) && !this.accessibilityService.isMotionReduced()) {
      const isNeedsInput = session.status === AgentSessionStatus.NeedsInput;
      const cacheKey2 = isNeedsInput ? _AgentSessionStatusIcon.PIXEL_SPINNER_RING_KEY : _AgentSessionStatusIcon.PIXEL_SPINNER_GRID_KEY;
      const color2 = isNeedsInput ? asCssVariable("list.warningForeground") : asCssVariable("textLink.foreground");
      if (this._currentCacheKey === cacheKey2) {
        this.updateActiveIconColor(color2);
        return;
      }
      this._currentCacheKey = cacheKey2;
      this.spinner.clear();
      clearNode(this.container);
      const spinner = createPixelSpinner(void 0, { variant: isNeedsInput ? "ring" : "grid" });
      this.spinner.value = spinner;
      spinner.element.style.color = color2;
      this.container.appendChild(spinner.element);
      return;
    }
    const icon = this.getIcon(session);
    const cacheKey = ThemeIcon.asCSSSelector(icon);
    const color = icon.color ? asCssVariable(icon.color.id) : "";
    if (this._currentCacheKey === cacheKey) {
      this.updateActiveIconColor(color);
      return;
    }
    this._currentCacheKey = cacheKey;
    this.spinner.clear();
    clearNode(this.container);
    const iconElement = h(`span${cacheKey}`).root;
    iconElement.style.color = color;
    this.container.appendChild(iconElement);
  }
  updateActiveIconColor(color) {
    const activeIcon = this.container.firstElementChild;
    if (isHTMLElement(activeIcon)) {
      activeIcon.style.color = color;
    }
  }
};
_AgentSessionStatusIcon.PIXEL_SPINNER_GRID_KEY = "__pixel_spinner_grid__";
_AgentSessionStatusIcon.PIXEL_SPINNER_RING_KEY = "__pixel_spinner_ring__";
let AgentSessionStatusIcon = _AgentSessionStatusIcon;
function getAgentSessionStatusIcon(session) {
  if (session.status === AgentSessionStatus.InProgress) {
    return { ...Codicon.sessionInProgress, color: themeColorFromId("textLink.foreground") };
  }
  if (session.status === AgentSessionStatus.NeedsInput) {
    return { ...Codicon.circleFilled, color: themeColorFromId("list.warningForeground") };
  }
  if (session.status === AgentSessionStatus.Failed) {
    return { ...Codicon.error, color: themeColorFromId("errorForeground") };
  }
  if (session.isArchived()) {
    return { ...Codicon.passFilled, color: themeColorFromId("agentSessionReadIndicator.foreground") };
  }
  if (!session.isRead()) {
    return { ...Codicon.circleFilled, color: themeColorFromId("textLink.foreground") };
  }
  return { ...Codicon.circleSmallFilled, color: themeColorFromId("agentSessionReadIndicator.foreground") };
}
let AgentSessionRenderer = class extends Disposable {
  constructor(options, _approvalModel, _activeSessionResource, markdownRendererService, productService, hoverService, instantiationService, contextKeyService, chatSessionsService, accessibilityService, voicePlaybackService) {
    super();
    this.options = options;
    this._approvalModel = _approvalModel;
    this._activeSessionResource = _activeSessionResource;
    this.markdownRendererService = markdownRendererService;
    this.productService = productService;
    this.hoverService = hoverService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.chatSessionsService = chatSessionsService;
    this.accessibilityService = accessibilityService;
    this.voicePlaybackService = voicePlaybackService;
    this.templateId = AgentSessionRenderer.TEMPLATE_ID;
    this.sessionHover = this._register(new MutableDisposable());
    this._onDidChangeItemHeight = this._register(new Emitter());
    this.onDidChangeItemHeight = this._onDidChangeItemHeight.event;
  }
  // 4px margin-top + 4px padding-top + 4px padding-bottom + 2px border
  static getApprovalRowHeight(label) {
    const lineCount = Math.min(label.split(/\r?\n/).length, AgentSessionRenderer.APPROVAL_ROW_MAX_LINES);
    return lineCount * AgentSessionRenderer._APPROVAL_ROW_LINE_HEIGHT + AgentSessionRenderer._APPROVAL_ROW_OVERHEAD;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposable = disposables.add(new DisposableStore());
    container.closest(".monaco-list-row")?.classList.add("agent-session-list-row", "agent-session-item-row");
    const elements = h(
      "div.agent-session-item@item",
      [
        h("div.agent-session-icon-col", [
          h("div.agent-session-icon@icon")
        ]),
        h("div.agent-session-main-col", [
          h("div.agent-session-title-row", [
            h("div.agent-session-title@title"),
            h("div.agent-session-pinned-indicator@pinnedIndicator"),
            h("div.agent-session-pending-voice-indicator@pendingVoiceIndicator"),
            h("div.agent-session-title-toolbar@titleToolbar")
          ]),
          h("div.agent-session-details-row", [
            h("div.agent-session-details-icon@detailsIcon"),
            h("div.agent-session-badge@badge"),
            h("span.agent-session-separator@separator"),
            h(
              "div.agent-session-diff-container@diffContainer",
              [
                h("span.agent-session-diff-added@addedSpan"),
                h("span.agent-session-diff-removed@removedSpan")
              ]
            ),
            h("div.agent-session-description@description"),
            h("div.agent-session-status@statusContainer", [
              h("span.agent-session-status-time@statusTime")
            ])
          ]),
          h("div.agent-session-approval-row@approvalRow", [
            h("span.agent-session-approval-label@approvalLabel"),
            h("div.agent-session-approval-button@approvalButtonContainer")
          ])
        ])
      ]
    );
    const contextKeyService = disposables.add(this.contextKeyService.createScoped(elements.item));
    const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
    const titleToolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, elements.titleToolbar, MenuId.AgentSessionItemToolbar, {
      menuOptions: { shouldForwardArgs: true }
    }));
    container.appendChild(elements.item);
    return {
      element: elements.item,
      icon: elements.icon,
      statusIcon: disposables.add(new AgentSessionStatusIcon(elements.icon, (session) => this.getIcon(session), this.accessibilityService)),
      title: disposables.add(new IconLabel(elements.title, { supportHighlights: true, supportIcons: true })),
      pinnedIndicator: elements.pinnedIndicator,
      pendingVoiceIndicator: elements.pendingVoiceIndicator,
      titleToolbar,
      detailsIcon: elements.detailsIcon,
      badge: elements.badge,
      separator: elements.separator,
      diffContainer: elements.diffContainer,
      diffAddedSpan: elements.addedSpan,
      diffRemovedSpan: elements.removedSpan,
      description: elements.description,
      statusContainer: elements.statusContainer,
      statusTime: elements.statusTime,
      approvalRow: elements.approvalRow,
      approvalLabel: elements.approvalLabel,
      approvalButtonContainer: elements.approvalButtonContainer,
      contextKeyService,
      elementDisposable,
      disposables
    };
  }
  renderElement(session, index, template, details) {
    template.elementDisposable.clear();
    template.diffAddedSpan.textContent = "";
    template.diffRemovedSpan.textContent = "";
    template.badge.textContent = "";
    template.description.textContent = "";
    template.element.classList.toggle("archived", session.element.isArchived());
    if (this.options.isGroupedByRepository?.()) {
      const repoName = getRepositoryName(session.element);
      if (repoName) {
        template.element.setAttribute("data-section-label", repoName);
      } else {
        template.element.removeAttribute("data-section-label");
      }
    } else {
      template.element.removeAttribute("data-section-label");
    }
    if (this.options.useStatusOnlyIcons) {
      template.statusIcon.setStatus(session.element);
      if (session.element.providerType === AgentSessionProviders.Background) {
        template.detailsIcon.className = "agent-session-details-icon";
      } else {
        template.detailsIcon.className = `agent-session-details-icon ${ThemeIcon.asClassName(session.element.icon)}`;
        template.detailsIcon.classList.add("visible");
      }
    } else {
      template.statusIcon.setStatus(session.element);
      template.detailsIcon.className = "agent-session-details-icon";
    }
    const markdownTitle = new MarkdownString(session.element.label);
    template.title.setLabel(renderAsPlaintext(markdownTitle), void 0, { matches: createMatches(session.filterData) });
    ChatContextKeys.isArchivedAgentSession.bindTo(template.contextKeyService).set(session.element.isArchived());
    ChatContextKeys.isPinnedAgentSession.bindTo(template.contextKeyService).set(session.element.isPinned());
    ChatContextKeys.isReadAgentSession.bindTo(template.contextKeyService).set(session.element.isRead());
    ChatContextKeys.agentSessionType.bindTo(template.contextKeyService).set(session.element.providerType);
    template.titleToolbar.context = session.element;
    const isPinned = session.element.isPinned();
    template.pinnedIndicator.className = "agent-session-pinned-indicator " + ThemeIcon.asClassName(Codicon.pinned);
    template.pinnedIndicator.classList.toggle("visible", isPinned);
    const sessionResource = session.element.resource;
    template.pendingVoiceIndicator.className = "agent-session-pending-voice-indicator " + ThemeIcon.asClassName(Codicon.unmute);
    template.pendingVoiceIndicator.title = localize("pendingVoiceResponse", "Voice response ready");
    const updatePendingVoice = () => {
      template.pendingVoiceIndicator.classList.toggle("visible", this.voicePlaybackService.hasPendingResponse(sessionResource));
    };
    template.elementDisposable.add(autorun((reader) => {
      this.voicePlaybackService.pendingResponseVersion.read(reader);
      updatePendingVoice();
    }));
    const hasBadge = this.renderBadge(session, template);
    let hasDiff = false;
    const { changes: diff } = session.element;
    if (!isSessionInProgressStatus(session.element.status) && diff && hasValidDiff(diff)) {
      if (this.renderDiff(session, template)) {
        hasDiff = true;
      }
    }
    let hasAgentSessionChanges = false;
    if (session.element.providerType === AgentSessionProviders.Background || session.element.providerType === AgentSessionProviders.Cloud) {
      hasAgentSessionChanges = Array.isArray(diff) && diff.length > 0;
    } else {
      hasAgentSessionChanges = hasDiff;
    }
    ChatContextKeys.hasAgentSessionChanges.bindTo(template.contextKeyService).set(hasAgentSessionChanges);
    const hasDescription = this.renderDescription(session, template);
    const hasStatus = this.renderStatus(session, template);
    const hideDetails = hasDescription && isSessionInProgressStatus(session.element.status);
    template.badge.classList.toggle("has-badge", hasBadge && !hideDetails);
    template.diffContainer.classList.toggle("has-diff", hasDiff && !hideDetails);
    template.statusContainer.classList.toggle("hidden", hideDetails);
    template.separator.classList.toggle("has-separator", !hideDetails && hasBadge && hasDiff);
    template.description.classList.toggle("has-separator", hasDescription && !hideDetails && (hasBadge || hasDiff));
    template.statusContainer.classList.toggle("has-separator", !hideDetails && hasStatus && (hasBadge || hasDiff || hasDescription));
    this.renderHover(session, template);
    if (this._approvalModel) {
      this.renderApprovalRow(session, template);
    }
    this.triggerResolve(session, template);
  }
  triggerResolve(session, template) {
    const cts = new CancellationTokenSource();
    template.elementDisposable.add({ dispose() {
      cts.dispose(true);
    } });
    this.chatSessionsService.resolveChatSessionItem(session.element.providerType, session.element.resource, cts.token).catch(() => {
    });
  }
  renderBadge(session, template) {
    if (this.options.hideSessionBadge) {
      return false;
    }
    const badge = session.element.badge;
    if (!badge) {
      return false;
    }
    if (this.options.isGroupedByRepository?.() && !session.element.isArchived() && !session.element.isPinned()) {
      const raw = typeof badge === "string" ? badge : badge.value;
      const match = raw.match(/^\$\((?:repo|folder|worktree)\)\s*(.+)/);
      if (match) {
        const badgeName = match[1].trim();
        const repoName = getRepositoryName(session.element);
        if (badgeName === repoName) {
          return false;
        }
      }
    }
    const normalisedBadge = this.stripCodicons(badge);
    const badgeValue = typeof normalisedBadge === "string" ? normalisedBadge : normalisedBadge.value;
    if (!badgeValue) {
      return false;
    }
    this.renderMarkdownOrText(normalisedBadge, template.badge, template.elementDisposable);
    return true;
  }
  stripCodicons(content) {
    const raw = typeof content === "string" ? content : content.value;
    const stripped = raw.replace(/\$\([a-z0-9\-]+\)\s*/gi, "").trim();
    if (typeof content === "string") {
      return stripped;
    }
    return MarkdownString.lift({ ...content, value: stripped });
  }
  renderMarkdownOrText(content, container, disposables) {
    if (typeof content === "string") {
      container.textContent = content;
    } else {
      disposables.add(this.markdownRendererService.render(content, {
        sanitizerConfig: {
          replaceWithPlaintext: true,
          allowedTags: {
            override: allowedChatMarkdownHtmlTags
          },
          allowedLinkSchemes: { augment: [this.productService.urlProtocol] }
        }
      }, container));
    }
  }
  renderDiff(session, template) {
    const diff = getAgentChangesSummary(session.element.changes);
    if (!diff) {
      return false;
    }
    if (diff.insertions === 0 && diff.deletions === 0) {
      return false;
    }
    if (diff.insertions >= 0) {
      template.diffAddedSpan.textContent = `+${diff.insertions}`;
    }
    if (diff.deletions >= 0) {
      template.diffRemovedSpan.textContent = `-${diff.deletions}`;
    }
    return true;
  }
  getIcon(session) {
    return getAgentSessionStatusIcon(session);
  }
  renderDescription(session, template) {
    const description = session.element.description;
    if (description) {
      this.renderMarkdownOrText(description, template.description, template.elementDisposable);
      return true;
    }
    if (session.element.status === AgentSessionStatus.InProgress) {
      template.description.textContent = localize("chat.session.status.inProgress", "Working...");
      return true;
    } else if (session.element.status === AgentSessionStatus.NeedsInput) {
      template.description.textContent = localize("chat.session.status.needsInput", "Input needed.");
      return true;
    } else if (session.element.status === AgentSessionStatus.Failed) {
      template.description.textContent = localize("chat.session.status.failed", "Failed");
      return true;
    }
    template.description.textContent = "";
    return false;
  }
  toDuration(startTime, endTime, useFullTimeWords, disallowNow) {
    const elapsed = Math.max(
      Math.round((endTime - startTime) / 1e3) * 1e3,
      1e3
      /* clamp to 1s */
    );
    if (!disallowNow && elapsed < 6e4) {
      return localize("secondsDuration", "now");
    }
    return getDurationString(elapsed, useFullTimeWords);
  }
  renderStatus(session, template) {
    const repoPrefix = session.element.isPinned() && this.options.isGroupedByRepository?.() ? getRepositoryName(session.element) : void 0;
    const getStatusText = (session2) => {
      let timeLabel;
      if (session2.status === AgentSessionStatus.InProgress && session2.timing.lastRequestStarted) {
        timeLabel = this.toDuration(session2.timing.lastRequestStarted, Date.now(), false, false);
      }
      if (!timeLabel) {
        const date = this.options.isSortedByUpdated?.() ? session2.timing.lastRequestEnded ?? session2.timing.created : session2.timing.created;
        const seconds = Math.round(((/* @__PURE__ */ new Date()).getTime() - date) / 1e3);
        if (seconds < 60) {
          timeLabel = localize("secondsDuration", "now");
        } else {
          timeLabel = sessionDateFromNow(date, true);
        }
      }
      return repoPrefix ? `${repoPrefix} \xB7 ${timeLabel}` : timeLabel;
    };
    template.statusTime.textContent = getStatusText(session.element);
    const timer = template.elementDisposable.add(new IntervalTimer());
    timer.cancelAndSet(
      () => template.statusTime.textContent = getStatusText(session.element),
      session.element.status === AgentSessionStatus.InProgress ? 1e3 : 60 * 1e3
      /* every minute */
    );
    return true;
  }
  renderHover(session, template) {
    if (this.options.disableHover) {
      return;
    }
    if (!isSessionInProgressStatus(session.element.status) && session.element.isRead()) {
      return;
    }
    const reducedDelay = session.element.status === AgentSessionStatus.NeedsInput;
    template.elementDisposable.add(
      this.hoverService.setupDelayedHover(template.element, () => this.buildHoverContent(session.element), { groupId: "agent.sessions", reducedDelay })
    );
  }
  buildHoverContent(session) {
    if (this.sessionHover.value?.session.resource.toString() !== session.resource.toString()) {
      this.sessionHover.value = this.instantiationService.createInstance(AgentSessionHoverWidget, session);
    }
    const widget = this.sessionHover.value;
    let pauseDisposable;
    return {
      id: `agent.session.hover.${session.resource.toString()}`,
      content: widget.domNode,
      style: HoverStyle.Pointer,
      onDidShow: () => {
        const previousPauseDisposable = pauseDisposable;
        pauseDisposable = this.options.pauseSessionUpdates?.();
        previousPauseDisposable?.dispose();
        widget.onRendered();
      },
      onDidHide: () => {
        widget.onHidden();
        pauseDisposable?.dispose();
        pauseDisposable = void 0;
      },
      position: {
        hoverPosition: this.options.getHoverPosition()
      }
    };
  }
  renderApprovalRow(session, template) {
    if (this._approvalModel === void 0) {
      throw new BugIndicatingError("Approval model is required to render approval row");
    }
    const approvalModel = this._approvalModel;
    const initialInfo = approvalModel.getApproval(session.element.resource).get();
    let wasVisible = !!initialInfo;
    template.approvalRow.classList.toggle("visible", wasVisible);
    const buttonStore = template.elementDisposable.add(new DisposableStore());
    template.elementDisposable.add(autorun((reader) => {
      buttonStore.clear();
      const info = approvalModel.getApproval(session.element.resource).read(reader);
      const visible = !!info;
      template.approvalRow.classList.toggle("visible", visible);
      if (info) {
        const lines = info.label.split("\n");
        const maxLines = AgentSessionRenderer.APPROVAL_ROW_MAX_LINES;
        const visibleLines = lines.slice(0, maxLines);
        if (lines.length > maxLines) {
          visibleLines[maxLines - 1] = `${visibleLines[maxLines - 1]} \u2026`;
        }
        const langId = info.languageId ?? "json";
        const labelContent = new MarkdownString();
        for (const line of visibleLines) {
          labelContent.appendCodeblock(langId, line);
        }
        this.renderMarkdownOrText(labelContent, template.approvalLabel, buttonStore);
        const fullContent = new MarkdownString().appendCodeblock(info.languageId ?? "json", info.label);
        buttonStore.add(this.hoverService.setupDelayedHover(template.approvalLabel, {
          content: fullContent,
          style: HoverStyle.Pointer,
          position: { hoverPosition: HoverPosition.BELOW }
        }));
        template.approvalButtonContainer.textContent = "";
        const isActive = this._activeSessionResource.read(reader)?.toString() === session.element.resource.toString();
        const button = buttonStore.add(new Button(template.approvalButtonContainer, {
          title: localize("allowActionOnce", "Allow once"),
          secondary: isActive,
          ...defaultButtonStyles
        }));
        button.label = localize("allowAction", "Allow");
        buttonStore.add(button.onDidClick(() => info.confirm()));
      }
      if (wasVisible !== visible) {
        wasVisible = visible;
        this._onDidChangeItemHeight.fire(session.element);
      }
    }));
  }
  renderCompressedElements(node, index, templateData, details) {
    throw new Error("Should never happen since session is incompressible");
  }
  disposeElement(element, index, template, details) {
    template.elementDisposable.clear();
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
};
AgentSessionRenderer.TEMPLATE_ID = "agent-session";
AgentSessionRenderer.APPROVAL_ROW_MAX_LINES = 3;
AgentSessionRenderer._APPROVAL_ROW_LINE_HEIGHT = 18;
AgentSessionRenderer._APPROVAL_ROW_OVERHEAD = 14;
AgentSessionRenderer = __decorateClass([
  __decorateParam(3, IMarkdownRendererService),
  __decorateParam(4, IProductService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IChatSessionsService),
  __decorateParam(9, IAccessibilityService),
  __decorateParam(10, IVoicePlaybackService)
], AgentSessionRenderer);
function toStatusLabel(status) {
  let statusLabel;
  switch (status) {
    case AgentSessionStatus.NeedsInput:
      statusLabel = localize("agentSessionNeedsInput", "Needs Input");
      break;
    case AgentSessionStatus.InProgress:
      statusLabel = localize("agentSessionInProgress", "In Progress");
      break;
    case AgentSessionStatus.Failed:
      statusLabel = localize("agentSessionFailed", "Failed");
      break;
    default:
      statusLabel = localize("agentSessionCompleted", "Completed");
  }
  return statusLabel;
}
let AgentSessionSectionRenderer = class {
  constructor(sectionOptions, instantiationService, contextKeyService) {
    this.sectionOptions = sectionOptions;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.templateId = AgentSessionSectionRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    container.closest(".monaco-list-row")?.classList.add("agent-session-list-row", "agent-session-section-row");
    const elements = h(
      "div.agent-session-section@container",
      [
        h("span.agent-session-section-label@label"),
        h("span.agent-session-section-count@count"),
        h("div.agent-session-section-toolbar@toolbar")
      ]
    );
    const contextKeyService = disposables.add(this.contextKeyService.createScoped(elements.container));
    const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
    const toolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, elements.toolbar, MenuId.AgentSessionSectionToolbar, {
      menuOptions: { shouldForwardArgs: true }
    }));
    container.appendChild(elements.container);
    return {
      container: elements.container,
      label: elements.label,
      count: elements.count,
      toolbar,
      contextKeyService,
      disposables
    };
  }
  renderElement(element, index, template, details) {
    template.label.textContent = element.element.label;
    if (this.sectionOptions.hideSectionCount) {
      template.count.textContent = "";
    } else {
      template.count.textContent = String(element.element.sessions.length);
    }
    ChatContextKeys.agentSessionSection.bindTo(template.contextKeyService).set(element.element.section);
    template.toolbar.context = element.element;
  }
  renderCompressedElements(node, index, templateData, details) {
    throw new Error("Should never happen since section header is incompressible");
  }
  disposeElement(element, index, template, details) {
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
};
AgentSessionSectionRenderer.TEMPLATE_ID = "agent-session-section";
AgentSessionSectionRenderer = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IContextKeyService)
], AgentSessionSectionRenderer);
const _AgentSessionShowMoreRenderer = class _AgentSessionShowMoreRenderer {
  constructor(options) {
    this.options = options;
    this.templateId = _AgentSessionShowMoreRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elements = h(
      "div.agent-session-show-more@container",
      [h("span.agent-session-show-more-label@label")]
    );
    container.appendChild(elements.container);
    return {
      container: elements.container,
      label: elements.label,
      disposables
    };
  }
  renderElement(element, _index, template) {
    template.label.textContent = this.options?.compactLabel ? localize("agentSessions.showMoreCompact", "+{0} more", element.element.remainingCount) : localize("agentSessions.showMore", "Show {0} More...", element.element.remainingCount);
    template.container.setAttribute("data-section-label", element.element.sectionLabel);
  }
  renderCompressedElements() {
    throw new Error("Should never happen since show-more is incompressible");
  }
  disposeElement() {
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
};
_AgentSessionShowMoreRenderer.TEMPLATE_ID = "agent-session-show-more";
_AgentSessionShowMoreRenderer.HEIGHT = 26;
_AgentSessionShowMoreRenderer.COLLAPSED_HEIGHT = 1;
let AgentSessionShowMoreRenderer = _AgentSessionShowMoreRenderer;
const _AgentSessionShowLessRenderer = class _AgentSessionShowLessRenderer {
  constructor() {
    this.templateId = _AgentSessionShowLessRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elements = h(
      "div.agent-session-show-more@container",
      [h("span.agent-session-show-more-label@label")]
    );
    container.appendChild(elements.container);
    return {
      container: elements.container,
      label: elements.label,
      disposables
    };
  }
  renderElement(element, _index, template) {
    template.label.textContent = localize("agentSessions.showLess", "Show less");
    template.container.setAttribute("data-section-label", element.element.sectionLabel);
  }
  renderCompressedElements() {
    throw new Error("Should never happen since show-less is incompressible");
  }
  disposeElement() {
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
};
_AgentSessionShowLessRenderer.TEMPLATE_ID = "agent-session-show-less";
_AgentSessionShowLessRenderer.HEIGHT = AgentSessionShowMoreRenderer.HEIGHT;
let AgentSessionShowLessRenderer = _AgentSessionShowLessRenderer;
const _AgentSessionsListDelegate = class _AgentSessionsListDelegate {
  constructor(_approvalModel, _compactShowMore, _getItemHeight = () => _AgentSessionsListDelegate.ITEM_HEIGHT, _getSectionHeight = () => _AgentSessionsListDelegate.SECTION_HEIGHT) {
    this._approvalModel = _approvalModel;
    this._compactShowMore = _compactShowMore;
    this._getItemHeight = _getItemHeight;
    this._getSectionHeight = _getSectionHeight;
  }
  getHeight(element) {
    if (isAgentSessionSection(element)) {
      return this._getSectionHeight();
    }
    if (isAgentSessionShowMore(element) || isAgentSessionShowLess(element)) {
      return this._compactShowMore ? AgentSessionShowMoreRenderer.COLLAPSED_HEIGHT : AgentSessionShowMoreRenderer.HEIGHT;
    }
    let height = this._getItemHeight();
    const approval = this._approvalModel?.getApproval(element.resource).get();
    if (approval) {
      height += AgentSessionRenderer.getApprovalRowHeight(approval.label);
    }
    return height;
  }
  hasDynamicHeight(element) {
    if (isAgentSessionShowMore(element) || isAgentSessionShowLess(element)) {
      return true;
    }
    return !!this._approvalModel && isAgentSession(element);
  }
  getTemplateId(element) {
    if (isAgentSessionSection(element)) {
      return AgentSessionSectionRenderer.TEMPLATE_ID;
    }
    if (isAgentSessionShowMore(element)) {
      return AgentSessionShowMoreRenderer.TEMPLATE_ID;
    }
    if (isAgentSessionShowLess(element)) {
      return AgentSessionShowLessRenderer.TEMPLATE_ID;
    }
    return AgentSessionRenderer.TEMPLATE_ID;
  }
};
_AgentSessionsListDelegate.ITEM_HEIGHT = 54;
_AgentSessionsListDelegate.COMPACT_ITEM_HEIGHT = 52;
_AgentSessionsListDelegate.SECTION_HEIGHT = 26;
_AgentSessionsListDelegate.SPACED_SECTION_HEIGHT = 30;
let AgentSessionsListDelegate = _AgentSessionsListDelegate;
class AgentSessionsAccessibilityProvider {
  getWidgetRole() {
    return "list";
  }
  getRole(element) {
    return "listitem";
  }
  getWidgetAriaLabel() {
    return localize("agentSessions", "Agent Sessions");
  }
  getAriaLabel(element) {
    if (isAgentSessionSection(element)) {
      const count = element.sessions.length;
      if (count === 1) {
        return localize("agentSessionSectionAriaLabel.singular", "{0} sessions section, {1} session", element.label, count);
      }
      return localize("agentSessionSectionAriaLabel.plural", "{0} sessions section, {1} sessions", element.label, count);
    }
    if (isAgentSessionShowMore(element)) {
      return localize("agentSessionShowMoreAriaLabel", "Show {0} more sessions", element.remainingCount);
    }
    if (isAgentSessionShowLess(element)) {
      return localize("agentSessionShowLessAriaLabel", "Show less sessions");
    }
    return localize("agentSessionItemAriaLabel", "{0} session {1} ({2}), created {3}", element.providerLabel, element.label, toStatusLabel(element.status), new Date(element.timing.created).toLocaleString());
  }
}
const _AgentSessionsDataSource = class _AgentSessionsDataSource extends Disposable {
  constructor(filter, sorter, repositoryGroupLimit) {
    super();
    this.filter = filter;
    this.sorter = sorter;
    this.repositoryGroupLimit = repositoryGroupLimit;
    this._onDidGetChildren = this._register(new Emitter());
    this.onDidGetChildren = this._onDidGetChildren.event;
    this._onDidExpandRepositoryGroup = this._register(new Emitter());
    this.onDidExpandRepositoryGroup = this._onDidExpandRepositoryGroup.event;
    this.expandedRepositoryGroups = /* @__PURE__ */ new Set();
    if (this.filter) {
      let previousCapped = this.filter.getExcludes().repositoryGroupCapped;
      this._register(this.filter.onDidChange(() => {
        const currentCapped = this.filter.getExcludes().repositoryGroupCapped;
        if (currentCapped && !previousCapped) {
          this.expandedRepositoryGroups.clear();
        }
        previousCapped = currentCapped;
      }));
    }
  }
  expandRepositoryGroup(sectionLabel) {
    this.expandedRepositoryGroups.add(sectionLabel);
    this._onDidExpandRepositoryGroup.fire();
  }
  collapseRepositoryGroup(sectionLabel) {
    this.expandedRepositoryGroups.delete(sectionLabel);
    this._onDidExpandRepositoryGroup.fire();
  }
  hasChildren(element) {
    if (isAgentSessionsModel(element)) {
      return true;
    } else if (isAgentSessionSection(element)) {
      return element.sessions.length > 0;
    } else {
      return false;
    }
  }
  getChildren(element) {
    if (isAgentSessionsModel(element)) {
      let filteredSessions = element.sessions.filter((session) => !this.filter?.exclude(session));
      const limitResultsCount = this.filter?.limitResults?.();
      if (!this.filter?.groupResults?.() || typeof limitResultsCount === "number") {
        filteredSessions.sort(this.sorter.compare.bind(this.sorter));
      }
      if (typeof limitResultsCount === "number") {
        filteredSessions = filteredSessions.slice(0, limitResultsCount);
      }
      this.filter?.notifyResults?.(filteredSessions.length);
      this._onDidGetChildren.fire(filteredSessions.length);
      if (this.filter?.groupResults?.()) {
        return this.groupSessionsIntoSections(filteredSessions);
      }
      return filteredSessions;
    } else if (isAgentSessionSection(element)) {
      const isCappingEnabled = this.repositoryGroupLimit && this.filter?.getExcludes().repositoryGroupCapped;
      if (isCappingEnabled && element.section === AgentSessionSection.Repository && element.sessions.length > this.repositoryGroupLimit) {
        if (!this.expandedRepositoryGroups.has(element.label)) {
          const visible = element.sessions.slice(0, this.repositoryGroupLimit);
          const remainingCount = element.sessions.length - this.repositoryGroupLimit;
          return [...visible, { showMore: true, sectionLabel: element.label, remainingCount }];
        } else {
          return [...element.sessions, { showLess: true, sectionLabel: element.label }];
        }
      }
      return element.sessions;
    } else {
      return [];
    }
  }
  groupSessionsIntoSections(sessions) {
    const isCapped = this.filter?.groupResults?.() === AgentSessionsGrouping.Capped;
    const sorter = this.sorter;
    const sortedSessions = sorter instanceof AgentSessionsSorter ? sessions.sort((a, b) => sorter.compare(
      a,
      b,
      true
      /* prioritize active sessions to keep in-progress/needs-input ones top within each group */
    )) : sessions.sort(sorter.compare.bind(sorter));
    if (isCapped) {
      if (this.filter?.getExcludes().read) {
        return sortedSessions;
      }
      return this.groupSessionsCapped(sortedSessions);
    } else if (this.filter?.groupResults?.() === AgentSessionsGrouping.Repository) {
      return this.groupSessionsByRepository(sortedSessions);
    } else {
      return this.groupSessionsByDate(sortedSessions);
    }
  }
  groupSessionsCapped(sortedSessions) {
    const result = [];
    const firstArchivedIndex = sortedSessions.findIndex((session) => session.isArchived());
    const nonArchivedCount = firstArchivedIndex === -1 ? sortedSessions.length : firstArchivedIndex;
    const nonArchivedSessions = sortedSessions.slice(0, nonArchivedCount);
    const archivedSessions = sortedSessions.slice(nonArchivedCount);
    const pinnedSessions = nonArchivedSessions.filter((session) => session.isPinned());
    const unpinnedSessions = nonArchivedSessions.filter((session) => !session.isPinned());
    const topUnpinned = unpinnedSessions.slice(0, _AgentSessionsDataSource.CAPPED_SESSIONS_LIMIT);
    const remainingUnpinned = unpinnedSessions.slice(_AgentSessionsDataSource.CAPPED_SESSIONS_LIMIT);
    result.push(...pinnedSessions, ...topUnpinned);
    const othersSessions = [...remainingUnpinned, ...archivedSessions];
    if (othersSessions.length > 0) {
      result.push({
        section: AgentSessionSection.More,
        label: AgentSessionSectionLabels[AgentSessionSection.More],
        sessions: othersSessions
      });
    }
    return result;
  }
  groupSessionsByDate(sortedSessions) {
    const result = [];
    const sortBy = this.filter?.sortResults?.();
    const groupedSessions = groupAgentSessionsByDate(sortedSessions, sortBy);
    for (const { sessions, section, label } of groupedSessions.values()) {
      if (sessions.length === 0) {
        continue;
      }
      result.push({ section, label, sessions });
    }
    return result;
  }
  groupSessionsByRepository(sortedSessions) {
    const repoMap = /* @__PURE__ */ new Map();
    const pinnedSessions = [];
    const archivedSessions = [];
    const otherSessions = [];
    for (const session of sortedSessions) {
      if (session.isArchived()) {
        archivedSessions.push(session);
        continue;
      }
      if (session.isPinned()) {
        pinnedSessions.push(session);
        continue;
      }
      const repoName = getRepositoryName(session);
      if (repoName) {
        let group = repoMap.get(repoName);
        if (!group) {
          group = { label: repoName, sessions: [] };
          repoMap.set(repoName, group);
        }
        group.sessions.push(session);
      } else {
        otherSessions.push(session);
      }
    }
    const result = [];
    result.push(...pinnedSessions);
    const sortedRepoGroups = [...repoMap.values()].sort((a, b) => compareIgnoreCase(a.label, b.label));
    for (const { label, sessions } of sortedRepoGroups) {
      result.push({
        section: AgentSessionSection.Repository,
        label,
        sessions
      });
    }
    if (otherSessions.length > 0) {
      result.push({
        section: AgentSessionSection.Repository,
        label: AgentSessionSectionLabels[AgentSessionSection.Repository],
        sessions: otherSessions
      });
    }
    if (archivedSessions.length > 0) {
      result.push({
        section: AgentSessionSection.Archived,
        label: AgentSessionSectionLabels[AgentSessionSection.Archived],
        sessions: archivedSessions
      });
    }
    return result;
  }
};
_AgentSessionsDataSource.CAPPED_SESSIONS_LIMIT = 3;
_AgentSessionsDataSource.REPOSITORY_GROUP_LIMIT = 5;
let AgentSessionsDataSource = _AgentSessionsDataSource;
function getRepositoryName(session) {
  const metadata = session.metadata;
  if (metadata) {
    const remoteAgentHost = metadata.remoteAgentHost;
    if (remoteAgentHost) {
      const workingDir = metadata.workingDirectoryPath;
      if (workingDir) {
        const folderName = extractRepoNameFromPath(workingDir);
        if (folderName) {
          return `${folderName} [${remoteAgentHost}]`;
        }
      }
      return remoteAgentHost;
    }
    const owner = metadata.owner;
    const name = metadata.name;
    if (owner && name) {
      return name;
    }
    const nwo = metadata.repositoryNwo;
    if (nwo && nwo.includes("/")) {
      return nwo.split("/").pop();
    }
    const repository = metadata.repository;
    if (repository) {
      const repoName = parseRepositoryName(repository);
      if (repoName) {
        return repoName;
      }
    }
    const repositoryUrl = metadata.repositoryUrl;
    if (repositoryUrl) {
      const repoName = parseRepositoryName(repositoryUrl);
      if (repoName) {
        return repoName;
      }
    }
    const repositoryPath = metadata.repositoryPath;
    if (repositoryPath) {
      const repoName = extractRepoNameFromPath(repositoryPath);
      if (repoName) {
        return repoName;
      }
    }
    const worktreePath = metadata.worktreePath;
    if (worktreePath) {
      const repoName = extractRepoNameFromPath(worktreePath);
      if (repoName) {
        return repoName;
      }
    }
    const workingDirectoryPath = metadata.workingDirectoryPath;
    if (workingDirectoryPath) {
      const repoName = extractRepoNameFromPath(workingDirectoryPath);
      if (repoName) {
        return repoName;
      }
    }
  }
  const badge = session.badge;
  if (badge) {
    const raw = typeof badge === "string" ? badge : badge.value;
    const badgeMatch = raw.match(/\$\((?:repo|folder|worktree)\)\s*(.+)/);
    if (badgeMatch) {
      return badgeMatch[1].trim();
    }
  }
  return void 0;
}
function parseRepositoryName(value) {
  if (value.includes("/") && !value.includes("://") && !value.startsWith("git@")) {
    let repoSegment = value.split("/").filter(Boolean).pop();
    if (repoSegment?.endsWith(".git")) {
      repoSegment = repoSegment.slice(0, -4);
    }
    return repoSegment || void 0;
  }
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      let repoSegment = parts[1];
      if (repoSegment.endsWith(".git")) {
        repoSegment = repoSegment.slice(0, -4);
      }
      return repoSegment || void 0;
    }
  } catch {
  }
  if (value.startsWith("git@")) {
    const colonIndex = value.indexOf(":");
    if (colonIndex !== -1 && colonIndex < value.length - 1) {
      const pathPart = value.substring(colonIndex + 1);
      let repoSegment = pathPart.split("/").filter(Boolean).pop();
      if (repoSegment?.endsWith(".git")) {
        repoSegment = repoSegment.slice(0, -4);
      }
      return repoSegment || void 0;
    }
  }
  return void 0;
}
function extractRepoNameFromPath(dirPath) {
  const segments = dirPath.split(/[/\\]/).filter(Boolean);
  if (segments.length < 2) {
    return segments[0];
  }
  const parent = segments[segments.length - 2];
  if (parent.endsWith(".worktrees")) {
    return parent.slice(0, -".worktrees".length) || void 0;
  }
  return segments[segments.length - 1];
}
const AgentSessionSectionLabels = {
  [AgentSessionSection.Pinned]: localize("agentSessions.pinnedSection", "Pinned"),
  [AgentSessionSection.Today]: localize("agentSessions.todaySection", "Today"),
  [AgentSessionSection.Yesterday]: localize("agentSessions.yesterdaySection", "Yesterday"),
  [AgentSessionSection.Week]: localize("agentSessions.weekSection", "Last 7 days"),
  [AgentSessionSection.Older]: localize("agentSessions.olderSection", "Older"),
  [AgentSessionSection.Archived]: localize("agentSessions.archivedSection", "Archived"),
  [AgentSessionSection.More]: localize("agentSessions.moreSection", "More"),
  [AgentSessionSection.Repository]: localize("agentSessions.noRepository", "Other")
};
const DAY_THRESHOLD = 24 * 60 * 60 * 1e3;
const WEEK_THRESHOLD = 7 * DAY_THRESHOLD;
function groupAgentSessionsByDate(sessions, sortBy) {
  const now = Date.now();
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const startOfYesterday = startOfToday - DAY_THRESHOLD;
  const weekThreshold = now - WEEK_THRESHOLD;
  const pinnedSessions = [];
  const todaySessions = [];
  const yesterdaySessions = [];
  const weekSessions = [];
  const olderSessions = [];
  const archivedSessions = [];
  for (const session of sessions) {
    if (session.isArchived()) {
      archivedSessions.push(session);
    } else if (session.isPinned()) {
      pinnedSessions.push(session);
    } else {
      const sessionTime = sortBy === AgentSessionsSorting.Updated ? session.timing.lastRequestEnded ?? session.timing.created : session.timing.created;
      if (sessionTime >= startOfToday) {
        todaySessions.push(session);
      } else if (sessionTime >= startOfYesterday) {
        yesterdaySessions.push(session);
      } else if (sessionTime >= weekThreshold) {
        weekSessions.push(session);
      } else {
        olderSessions.push(session);
      }
    }
  }
  return /* @__PURE__ */ new Map([
    [AgentSessionSection.Pinned, { section: AgentSessionSection.Pinned, label: AgentSessionSectionLabels[AgentSessionSection.Pinned], sessions: pinnedSessions }],
    [AgentSessionSection.Today, { section: AgentSessionSection.Today, label: AgentSessionSectionLabels[AgentSessionSection.Today], sessions: todaySessions }],
    [AgentSessionSection.Yesterday, { section: AgentSessionSection.Yesterday, label: AgentSessionSectionLabels[AgentSessionSection.Yesterday], sessions: yesterdaySessions }],
    [AgentSessionSection.Week, { section: AgentSessionSection.Week, label: AgentSessionSectionLabels[AgentSessionSection.Week], sessions: weekSessions }],
    [AgentSessionSection.Older, { section: AgentSessionSection.Older, label: AgentSessionSectionLabels[AgentSessionSection.Older], sessions: olderSessions }],
    [AgentSessionSection.Archived, { section: AgentSessionSection.Archived, label: AgentSessionSectionLabels[AgentSessionSection.Archived], sessions: archivedSessions }]
  ]);
}
function sessionDateFromNow(sessionTime, appendAgoLabel) {
  const now = Date.now();
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const startOfYesterday = startOfToday - DAY_THRESHOLD;
  const startOfTwoDaysAgo = startOfYesterday - DAY_THRESHOLD;
  if (sessionTime < startOfToday && sessionTime >= startOfYesterday) {
    return appendAgoLabel ? localize("date.fromNow.days.singular.ago", "1 day ago") : localize("date.fromNow.days.singular", "1 day");
  }
  if (sessionTime < startOfYesterday && sessionTime >= startOfTwoDaysAgo) {
    return appendAgoLabel ? localize("date.fromNow.days.multiple.ago", "2 days ago") : localize("date.fromNow.days.multiple", "2 days");
  }
  return fromNow(sessionTime, appendAgoLabel);
}
class AgentSessionsIdentityProvider {
  getId(element) {
    if (isAgentSessionSection(element)) {
      return `section-${element.section}-${element.label}`;
    }
    if (isAgentSessionShowMore(element)) {
      return `show-more-${element.sectionLabel}`;
    }
    if (isAgentSessionShowLess(element)) {
      return `show-less-${element.sectionLabel}`;
    }
    if (isAgentSession(element)) {
      return element.resource.toString();
    }
    return "agent-sessions-id";
  }
  getGroupId(element) {
    if (isAgentSessionSection(element) || isAgentSessionsModel(element)) {
      return NotSelectableGroupId;
    }
    return 1;
  }
}
class AgentSessionsCompressionDelegate {
  isIncompressible(element) {
    return true;
  }
}
class AgentSessionsSorter {
  constructor(getSortBy) {
    this.getSortBy = getSortBy ?? (() => AgentSessionsSorting.Created);
  }
  compare(sessionA, sessionB, prioritizeActiveSessions = false) {
    if (prioritizeActiveSessions) {
      const aNeedsInput = sessionA.status === AgentSessionStatus.NeedsInput;
      const bNeedsInput = sessionB.status === AgentSessionStatus.NeedsInput;
      if (aNeedsInput && !bNeedsInput) {
        return -1;
      }
      if (!aNeedsInput && bNeedsInput) {
        return 1;
      }
    }
    const aArchived = sessionA.isArchived();
    const bArchived = sessionB.isArchived();
    if (!aArchived && bArchived) {
      return -1;
    }
    if (aArchived && !bArchived) {
      return 1;
    }
    const aPinned = !aArchived && sessionA.isPinned();
    const bPinned = !bArchived && sessionB.isPinned();
    if (aPinned && !bPinned) {
      return -1;
    }
    if (!aPinned && bPinned) {
      return 1;
    }
    const sortBy = this.getSortBy();
    const timeA = sortBy === AgentSessionsSorting.Updated ? prioritizeActiveSessions ? sessionA.timing.lastRequestStarted ?? sessionA.timing.created : sessionA.timing.lastRequestEnded ?? sessionA.timing.created : sessionA.timing.created;
    const timeB = sortBy === AgentSessionsSorting.Updated ? prioritizeActiveSessions ? sessionB.timing.lastRequestStarted ?? sessionB.timing.created : sessionB.timing.lastRequestEnded ?? sessionB.timing.created : sessionB.timing.created;
    return timeB - timeA;
  }
}
class AgentSessionsKeyboardNavigationLabelProvider {
  getKeyboardNavigationLabel(element) {
    if (isAgentSessionSection(element)) {
      return element.label;
    }
    if (isAgentSessionShowMore(element)) {
      return element.sectionLabel;
    }
    if (isAgentSessionShowLess(element)) {
      return element.sectionLabel;
    }
    return element.label;
  }
  getCompressedNodeKeyboardNavigationLabel(elements) {
    return void 0;
  }
}
let AgentSessionsDragAndDrop = class extends Disposable {
  constructor(instantiationService) {
    super();
    this.instantiationService = instantiationService;
  }
  onDragStart(data, originalEvent) {
    const elements = data.getData().filter((e) => isAgentSession(e));
    const uris = coalesce(elements.map((e) => e.resource));
    this.instantiationService.invokeFunction((accessor) => fillEditorsDragData(accessor, uris, originalEvent));
  }
  getDragURI(element) {
    if (isAgentSessionSection(element) || isAgentSessionShowMore(element) || isAgentSessionShowLess(element)) {
      return null;
    }
    return element.resource.toString();
  }
  getDragLabel(elements, originalEvent) {
    const sessions = elements.filter((e) => isAgentSession(e));
    if (sessions.length === 1) {
      return sessions[0].label;
    }
    return localize("agentSessions.dragLabel", "{0} agent sessions", sessions.length);
  }
  onDragOver(data, targetElement, targetIndex, targetSector, originalEvent) {
    return false;
  }
  drop(data, targetElement, targetIndex, targetSector, originalEvent) {
  }
};
AgentSessionsDragAndDrop = __decorateClass([
  __decorateParam(0, IInstantiationService)
], AgentSessionsDragAndDrop);
export {
  AgentSessionRenderer,
  AgentSessionSectionLabels,
  AgentSessionSectionRenderer,
  AgentSessionShowLessRenderer,
  AgentSessionShowMoreRenderer,
  AgentSessionsAccessibilityProvider,
  AgentSessionsCompressionDelegate,
  AgentSessionsDataSource,
  AgentSessionsDragAndDrop,
  AgentSessionsIdentityProvider,
  AgentSessionsKeyboardNavigationLabelProvider,
  AgentSessionsListDelegate,
  AgentSessionsSorter,
  getAgentSessionStatusIcon,
  getRepositoryName,
  groupAgentSessionsByDate,
  sessionDateFromNow,
  toStatusLabel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50U2Vzc2lvbnNWaWV3ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvYWdlbnRzZXNzaW9uc3ZpZXdlci5jc3MnO1xuaW1wb3J0IHsgY2xlYXJOb2RlLCBoLCBpc0hUTUxFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSWRlbnRpdHlQcm92aWRlciwgSUxpc3RWaXJ0dWFsRGVsZWdhdGUsIE5vdFNlbGVjdGFibGVHcm91cElkLCBOb3RTZWxlY3RhYmxlR3JvdXBJZFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IEFyaWFSb2xlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgSVRyZWVDb21wcmVzc2lvbkRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvYXN5bmNEYXRhVHJlZS5qcyc7XG5pbXBvcnQgeyBJQ29tcHJlc3NlZFRyZWVOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvY29tcHJlc3NlZE9iamVjdFRyZWVNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ29tcHJlc3NpYmxlS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlciwgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL29iamVjdFRyZWUuanMnO1xuaW1wb3J0IHsgSVRyZWVOb2RlLCBJVHJlZUVsZW1lbnRSZW5kZXJEZXRhaWxzLCBJQXN5bmNEYXRhU291cmNlLCBJVHJlZVNvcnRlciwgSVRyZWVEcmFnQW5kRHJvcCwgSVRyZWVEcmFnT3ZlclJlYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25TZWN0aW9uLCBBZ2VudFNlc3Npb25TdGF0dXMsIGdldEFnZW50Q2hhbmdlc1N1bW1hcnksIGhhc1ZhbGlkRGlmZiwgSUFnZW50U2Vzc2lvbiwgSUFnZW50U2Vzc2lvblNlY3Rpb24sIElBZ2VudFNlc3Npb25TaG93TGVzcywgSUFnZW50U2Vzc2lvblNob3dNb3JlLCBJQWdlbnRTZXNzaW9uc01vZGVsLCBpc0FnZW50U2Vzc2lvbiwgaXNBZ2VudFNlc3Npb25TZWN0aW9uLCBpc0FnZW50U2Vzc2lvblNob3dMZXNzLCBpc0FnZW50U2Vzc2lvblNob3dNb3JlLCBpc0FnZW50U2Vzc2lvbnNNb2RlbCwgaXNTZXNzaW9uSW5Qcm9ncmVzc1N0YXR1cyB9IGZyb20gJy4vYWdlbnRTZXNzaW9uc01vZGVsLmpzJztcbmltcG9ydCB7IEljb25MYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVsLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiwgdGhlbWVDb2xvckZyb21JZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclV0aWxzLmpzJztcbmltcG9ydCB7IGZyb21Ob3csIGdldER1cmF0aW9uU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0ZS5qcyc7XG5pbXBvcnQgeyBGdXp6eVNjb3JlLCBjcmVhdGVNYXRjaGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgYWxsb3dlZENoYXRNYXJrZG93bkh0bWxUYWdzIH0gZnJvbSAnLi4vd2lkZ2V0L2NoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRHJhZ0FuZERyb3BEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBMaXN0Vmlld1RhcmdldFNlY3RvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RWaWV3LmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgZmlsbEVkaXRvcnNEcmFnRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IEhvdmVyU3R5bGUsIElEZWxheWVkSG92ZXJPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSW50ZXJ2YWxUaW1lciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgcmVuZGVyQXNQbGFpbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZywgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uSG92ZXJXaWRnZXQgfSBmcm9tICcuL2FnZW50U2Vzc2lvbkhvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvblByb3ZpZGVycyB9IGZyb20gJy4vYWdlbnRTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25zR3JvdXBpbmcsIEFnZW50U2Vzc2lvbnNTb3J0aW5nIH0gZnJvbSAnLi9hZ2VudFNlc3Npb25zRmlsdGVyLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsIH0gZnJvbSAnLi9hZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBjb21wYXJlSWdub3JlQ2FzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVm9pY2VQbGF5YmFja1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdm9pY2VQbGF5YmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlUGl4ZWxTcGlubmVyLCBJUGl4ZWxTcGlubmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3BpeGVsU3Bpbm5lci9waXhlbFNwaW5uZXIuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5cbmV4cG9ydCB0eXBlIEFnZW50U2Vzc2lvbkxpc3RJdGVtID0gSUFnZW50U2Vzc2lvbiB8IElBZ2VudFNlc3Npb25TZWN0aW9uIHwgSUFnZW50U2Vzc2lvblNob3dNb3JlIHwgSUFnZW50U2Vzc2lvblNob3dMZXNzO1xuXG4vLyNyZWdpb24gQWdlbnQgU2Vzc2lvbiBSZW5kZXJlclxuXG5pbnRlcmZhY2UgSUFnZW50U2Vzc2lvbkl0ZW1UZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdC8vIENvbHVtbiAxXG5cdHJlYWRvbmx5IGljb246IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBzdGF0dXNJY29uOiBBZ2VudFNlc3Npb25TdGF0dXNJY29uO1xuXG5cdC8vIENvbHVtbiAyIFJvdyAxXG5cdHJlYWRvbmx5IHRpdGxlOiBJY29uTGFiZWw7XG5cdHJlYWRvbmx5IHBpbm5lZEluZGljYXRvcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHBlbmRpbmdWb2ljZUluZGljYXRvcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHN0YXR1c0NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHN0YXR1c1RpbWU6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSB0aXRsZVRvb2xiYXI6IE1lbnVXb3JrYmVuY2hUb29sQmFyO1xuXG5cdC8vIENvbHVtbiAyIFJvdyAyXG5cdHJlYWRvbmx5IGRldGFpbHNJY29uOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZGlmZkNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGRpZmZBZGRlZFNwYW46IEhUTUxTcGFuRWxlbWVudDtcblx0cmVhZG9ubHkgZGlmZlJlbW92ZWRTcGFuOiBIVE1MU3BhbkVsZW1lbnQ7XG5cblx0cmVhZG9ubHkgYmFkZ2U6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBzZXBhcmF0b3I6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogSFRNTEVsZW1lbnQ7XG5cblx0Ly8gQXBwcm92YWwgcm93XG5cdHJlYWRvbmx5IGFwcHJvdmFsUm93OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgYXBwcm92YWxMYWJlbDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGFwcHJvdmFsQnV0dG9uQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblxuXHRyZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZWFkb25seSBkaXNwb3NhYmxlczogSURpc3Bvc2FibGU7XG59XG5cbmNsYXNzIEFnZW50U2Vzc2lvblN0YXR1c0ljb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBQSVhFTF9TUElOTkVSX0dSSURfS0VZID0gJ19fcGl4ZWxfc3Bpbm5lcl9ncmlkX18nO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBQSVhFTF9TUElOTkVSX1JJTkdfS0VZID0gJ19fcGl4ZWxfc3Bpbm5lcl9yaW5nX18nO1xuXG5cdHByaXZhdGUgX2N1cnJlbnRDYWNoZUtleTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9sYXN0U2Vzc2lvbjogSUFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBzcGlubmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElQaXhlbFNwaW5uZXI+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGdldEljb246IChzZXNzaW9uOiBJQWdlbnRTZXNzaW9uKSA9PiBUaGVtZUljb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5vbkRpZENoYW5nZVJlZHVjZWRNb3Rpb24oKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2xhc3RTZXNzaW9uKSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyKHRoaXMuX2xhc3RTZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRzZXRTdGF0dXMoc2Vzc2lvbjogSUFnZW50U2Vzc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuX2xhc3RTZXNzaW9uID0gc2Vzc2lvbjtcblx0XHR0aGlzLnJlbmRlcihzZXNzaW9uKTtcblx0fVxuXG5cdHJlc2V0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2N1cnJlbnRDYWNoZUtleSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9sYXN0U2Vzc2lvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnNwaW5uZXIuY2xlYXIoKTtcblx0XHRjbGVhck5vZGUodGhpcy5jb250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXIoc2Vzc2lvbjogSUFnZW50U2Vzc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTmFtZSA9IGBhZ2VudC1zZXNzaW9uLWljb24ke3Nlc3Npb24uc3RhdHVzID09PSBBZ2VudFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCA/ICcgbmVlZHMtaW5wdXQnIDogJyd9YDtcblx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5jb2xvciA9ICcnO1xuXG5cdFx0aWYgKChzZXNzaW9uLnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MgfHwgc2Vzc2lvbi5zdGF0dXMgPT09IEFnZW50U2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0KSAmJiAhdGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5pc01vdGlvblJlZHVjZWQoKSkge1xuXHRcdFx0Y29uc3QgaXNOZWVkc0lucHV0ID0gc2Vzc2lvbi5zdGF0dXMgPT09IEFnZW50U2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0O1xuXHRcdFx0Y29uc3QgY2FjaGVLZXkgPSBpc05lZWRzSW5wdXQgPyBBZ2VudFNlc3Npb25TdGF0dXNJY29uLlBJWEVMX1NQSU5ORVJfUklOR19LRVkgOiBBZ2VudFNlc3Npb25TdGF0dXNJY29uLlBJWEVMX1NQSU5ORVJfR1JJRF9LRVk7XG5cdFx0XHRjb25zdCBjb2xvciA9IGlzTmVlZHNJbnB1dCA/IGFzQ3NzVmFyaWFibGUoJ2xpc3Qud2FybmluZ0ZvcmVncm91bmQnKSA6IGFzQ3NzVmFyaWFibGUoJ3RleHRMaW5rLmZvcmVncm91bmQnKTtcblx0XHRcdGlmICh0aGlzLl9jdXJyZW50Q2FjaGVLZXkgPT09IGNhY2hlS2V5KSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQWN0aXZlSWNvbkNvbG9yKGNvbG9yKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9jdXJyZW50Q2FjaGVLZXkgPSBjYWNoZUtleTtcblx0XHRcdHRoaXMuc3Bpbm5lci5jbGVhcigpO1xuXHRcdFx0Y2xlYXJOb2RlKHRoaXMuY29udGFpbmVyKTtcblx0XHRcdGNvbnN0IHNwaW5uZXIgPSBjcmVhdGVQaXhlbFNwaW5uZXIodW5kZWZpbmVkLCB7IHZhcmlhbnQ6IGlzTmVlZHNJbnB1dCA/ICdyaW5nJyA6ICdncmlkJyB9KTtcblx0XHRcdHRoaXMuc3Bpbm5lci52YWx1ZSA9IHNwaW5uZXI7XG5cdFx0XHRzcGlubmVyLmVsZW1lbnQuc3R5bGUuY29sb3IgPSBjb2xvcjtcblx0XHRcdHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKHNwaW5uZXIuZWxlbWVudCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaWNvbiA9IHRoaXMuZ2V0SWNvbihzZXNzaW9uKTtcblx0XHRjb25zdCBjYWNoZUtleSA9IFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb24pO1xuXHRcdGNvbnN0IGNvbG9yID0gaWNvbi5jb2xvciA/IGFzQ3NzVmFyaWFibGUoaWNvbi5jb2xvci5pZCkgOiAnJztcblx0XHRpZiAodGhpcy5fY3VycmVudENhY2hlS2V5ID09PSBjYWNoZUtleSkge1xuXHRcdFx0dGhpcy51cGRhdGVBY3RpdmVJY29uQ29sb3IoY29sb3IpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2N1cnJlbnRDYWNoZUtleSA9IGNhY2hlS2V5O1xuXHRcdHRoaXMuc3Bpbm5lci5jbGVhcigpO1xuXHRcdGNsZWFyTm9kZSh0aGlzLmNvbnRhaW5lcik7XG5cdFx0Y29uc3QgaWNvbkVsZW1lbnQgPSBoKGBzcGFuJHtjYWNoZUtleX1gKS5yb290O1xuXHRcdGljb25FbGVtZW50LnN0eWxlLmNvbG9yID0gY29sb3I7XG5cdFx0dGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQoaWNvbkVsZW1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVBY3RpdmVJY29uQ29sb3IoY29sb3I6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZUljb24gPSB0aGlzLmNvbnRhaW5lci5maXJzdEVsZW1lbnRDaGlsZDtcblx0XHRpZiAoaXNIVE1MRWxlbWVudChhY3RpdmVJY29uKSkge1xuXHRcdFx0YWN0aXZlSWNvbi5zdHlsZS5jb2xvciA9IGNvbG9yO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QWdlbnRTZXNzaW9uU3RhdHVzSWNvbihzZXNzaW9uOiBJQWdlbnRTZXNzaW9uKTogVGhlbWVJY29uIHtcblx0aWYgKHNlc3Npb24uc3RhdHVzID09PSBBZ2VudFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcykge1xuXHRcdHJldHVybiB7IC4uLkNvZGljb24uc2Vzc2lvbkluUHJvZ3Jlc3MsIGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKCd0ZXh0TGluay5mb3JlZ3JvdW5kJykgfTtcblx0fVxuXG5cdGlmIChzZXNzaW9uLnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQpIHtcblx0XHRyZXR1cm4geyAuLi5Db2RpY29uLmNpcmNsZUZpbGxlZCwgY29sb3I6IHRoZW1lQ29sb3JGcm9tSWQoJ2xpc3Qud2FybmluZ0ZvcmVncm91bmQnKSB9O1xuXHR9XG5cblx0aWYgKHNlc3Npb24uc3RhdHVzID09PSBBZ2VudFNlc3Npb25TdGF0dXMuRmFpbGVkKSB7XG5cdFx0cmV0dXJuIHsgLi4uQ29kaWNvbi5lcnJvciwgY29sb3I6IHRoZW1lQ29sb3JGcm9tSWQoJ2Vycm9yRm9yZWdyb3VuZCcpIH07XG5cdH1cblxuXHRpZiAoc2Vzc2lvbi5pc0FyY2hpdmVkKCkpIHtcblx0XHRyZXR1cm4geyAuLi5Db2RpY29uLnBhc3NGaWxsZWQsIGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKCdhZ2VudFNlc3Npb25SZWFkSW5kaWNhdG9yLmZvcmVncm91bmQnKSB9O1xuXHR9XG5cblx0aWYgKCFzZXNzaW9uLmlzUmVhZCgpKSB7XG5cdFx0cmV0dXJuIHsgLi4uQ29kaWNvbi5jaXJjbGVGaWxsZWQsIGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKCd0ZXh0TGluay5mb3JlZ3JvdW5kJykgfTtcblx0fVxuXG5cdHJldHVybiB7IC4uLkNvZGljb24uY2lyY2xlU21hbGxGaWxsZWQsIGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKCdhZ2VudFNlc3Npb25SZWFkSW5kaWNhdG9yLmZvcmVncm91bmQnKSB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudFNlc3Npb25SZW5kZXJlck9wdGlvbnMge1xuXHRyZWFkb25seSBkaXNhYmxlSG92ZXI/OiBib29sZWFuO1xuXHRyZWFkb25seSBoaWRlU2Vzc2lvbkJhZGdlPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgdXNlU3RhdHVzT25seUljb25zPzogYm9vbGVhbjtcblx0Z2V0SG92ZXJQb3NpdGlvbigpOiBIb3ZlclBvc2l0aW9uO1xuXG5cdGlzR3JvdXBlZEJ5UmVwb3NpdG9yeT8oKTogYm9vbGVhbjtcblx0aXNTb3J0ZWRCeVVwZGF0ZWQ/KCk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIENhbGxlZCB3aGVuIGEgc2Vzc2lvbiBob3ZlciBpcyBzaG93biBzbyB0aGUgaG9zdCBjYW4gcGF1c2UgdXBkYXRlcyB0aGF0XG5cdCAqIHdvdWxkIHJlLXNvcnQgdGhlIGxpc3Qgd2hpbGUgdGhlIHVzZXIgaXMgcmVhZGluZyB0aGUgaG92ZXIuIFRoZSByZXR1cm5lZFxuXHQgKiBkaXNwb3NhYmxlIHJlc3VtZXMgdXBkYXRlcy5cblx0ICovXG5cdHBhdXNlU2Vzc2lvblVwZGF0ZXM/KCk6IElEaXNwb3NhYmxlO1xufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRTZXNzaW9uUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxJQWdlbnRTZXNzaW9uLCBGdXp6eVNjb3JlLCBJQWdlbnRTZXNzaW9uSXRlbVRlbXBsYXRlPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2FnZW50LXNlc3Npb24nO1xuXG5cdHN0YXRpYyByZWFkb25seSBBUFBST1ZBTF9ST1dfTUFYX0xJTkVTID0gMztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX0FQUFJPVkFMX1JPV19MSU5FX0hFSUdIVCA9IDE4O1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfQVBQUk9WQUxfUk9XX09WRVJIRUFEID0gMTQ7IC8vIDRweCBtYXJnaW4tdG9wICsgNHB4IHBhZGRpbmctdG9wICsgNHB4IHBhZGRpbmctYm90dG9tICsgMnB4IGJvcmRlclxuXG5cdHN0YXRpYyBnZXRBcHByb3ZhbFJvd0hlaWdodChsYWJlbDogc3RyaW5nKTogbnVtYmVyIHtcblx0XHRjb25zdCBsaW5lQ291bnQgPSBNYXRoLm1pbihsYWJlbC5zcGxpdCgvXFxyP1xcbi8pLmxlbmd0aCwgQWdlbnRTZXNzaW9uUmVuZGVyZXIuQVBQUk9WQUxfUk9XX01BWF9MSU5FUyk7XG5cdFx0cmV0dXJuIGxpbmVDb3VudCAqIEFnZW50U2Vzc2lvblJlbmRlcmVyLl9BUFBST1ZBTF9ST1dfTElORV9IRUlHSFQgKyBBZ2VudFNlc3Npb25SZW5kZXJlci5fQVBQUk9WQUxfUk9XX09WRVJIRUFEO1xuXHR9XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9IEFnZW50U2Vzc2lvblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbkhvdmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPEFnZW50U2Vzc2lvbkhvdmVyV2lkZ2V0PigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUl0ZW1IZWlnaHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQWdlbnRTZXNzaW9uPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VJdGVtSGVpZ2h0OiBFdmVudDxJQWdlbnRTZXNzaW9uPiA9IHRoaXMuX29uRGlkQ2hhbmdlSXRlbUhlaWdodC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IElBZ2VudFNlc3Npb25SZW5kZXJlck9wdGlvbnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYXBwcm92YWxNb2RlbDogQWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbCB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVTZXNzaW9uUmVzb3VyY2U6IElPYnNlcnZhYmxlPFVSSSB8IHVuZGVmaW5lZD4sXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDaGF0U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElWb2ljZVBsYXliYWNrU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZvaWNlUGxheWJhY2tTZXJ2aWNlOiBJVm9pY2VQbGF5YmFja1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUFnZW50U2Vzc2lvbkl0ZW1UZW1wbGF0ZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb250YWluZXIuY2xvc2VzdCgnLm1vbmFjby1saXN0LXJvdycpPy5jbGFzc0xpc3QuYWRkKCdhZ2VudC1zZXNzaW9uLWxpc3Qtcm93JywgJ2FnZW50LXNlc3Npb24taXRlbS1yb3cnKTtcblxuXHRcdGNvbnN0IGVsZW1lbnRzID0gaChcblx0XHRcdCdkaXYuYWdlbnQtc2Vzc2lvbi1pdGVtQGl0ZW0nLFxuXHRcdFx0W1xuXHRcdFx0XHRoKCdkaXYuYWdlbnQtc2Vzc2lvbi1pY29uLWNvbCcsIFtcblx0XHRcdFx0XHRoKCdkaXYuYWdlbnQtc2Vzc2lvbi1pY29uQGljb24nKVxuXHRcdFx0XHRdKSxcblx0XHRcdFx0aCgnZGl2LmFnZW50LXNlc3Npb24tbWFpbi1jb2wnLCBbXG5cdFx0XHRcdFx0aCgnZGl2LmFnZW50LXNlc3Npb24tdGl0bGUtcm93JywgW1xuXHRcdFx0XHRcdFx0aCgnZGl2LmFnZW50LXNlc3Npb24tdGl0bGVAdGl0bGUnKSxcblx0XHRcdFx0XHRcdGgoJ2Rpdi5hZ2VudC1zZXNzaW9uLXBpbm5lZC1pbmRpY2F0b3JAcGlubmVkSW5kaWNhdG9yJyksXG5cdFx0XHRcdFx0XHRoKCdkaXYuYWdlbnQtc2Vzc2lvbi1wZW5kaW5nLXZvaWNlLWluZGljYXRvckBwZW5kaW5nVm9pY2VJbmRpY2F0b3InKSxcblx0XHRcdFx0XHRcdGgoJ2Rpdi5hZ2VudC1zZXNzaW9uLXRpdGxlLXRvb2xiYXJAdGl0bGVUb29sYmFyJyksXG5cdFx0XHRcdFx0XSksXG5cdFx0XHRcdFx0aCgnZGl2LmFnZW50LXNlc3Npb24tZGV0YWlscy1yb3cnLCBbXG5cdFx0XHRcdFx0XHRoKCdkaXYuYWdlbnQtc2Vzc2lvbi1kZXRhaWxzLWljb25AZGV0YWlsc0ljb24nKSxcblx0XHRcdFx0XHRcdGgoJ2Rpdi5hZ2VudC1zZXNzaW9uLWJhZGdlQGJhZGdlJyksXG5cdFx0XHRcdFx0XHRoKCdzcGFuLmFnZW50LXNlc3Npb24tc2VwYXJhdG9yQHNlcGFyYXRvcicpLFxuXHRcdFx0XHRcdFx0aCgnZGl2LmFnZW50LXNlc3Npb24tZGlmZi1jb250YWluZXJAZGlmZkNvbnRhaW5lcicsXG5cdFx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0XHRoKCdzcGFuLmFnZW50LXNlc3Npb24tZGlmZi1hZGRlZEBhZGRlZFNwYW4nKSxcblx0XHRcdFx0XHRcdFx0XHRoKCdzcGFuLmFnZW50LXNlc3Npb24tZGlmZi1yZW1vdmVkQHJlbW92ZWRTcGFuJylcblx0XHRcdFx0XHRcdFx0XSksXG5cdFx0XHRcdFx0XHRoKCdkaXYuYWdlbnQtc2Vzc2lvbi1kZXNjcmlwdGlvbkBkZXNjcmlwdGlvbicpLFxuXHRcdFx0XHRcdFx0aCgnZGl2LmFnZW50LXNlc3Npb24tc3RhdHVzQHN0YXR1c0NvbnRhaW5lcicsIFtcblx0XHRcdFx0XHRcdFx0aCgnc3Bhbi5hZ2VudC1zZXNzaW9uLXN0YXR1cy10aW1lQHN0YXR1c1RpbWUnKSxcblx0XHRcdFx0XHRcdF0pLFxuXHRcdFx0XHRcdF0pLFxuXHRcdFx0XHRcdGgoJ2Rpdi5hZ2VudC1zZXNzaW9uLWFwcHJvdmFsLXJvd0BhcHByb3ZhbFJvdycsIFtcblx0XHRcdFx0XHRcdGgoJ3NwYW4uYWdlbnQtc2Vzc2lvbi1hcHByb3ZhbC1sYWJlbEBhcHByb3ZhbExhYmVsJyksXG5cdFx0XHRcdFx0XHRoKCdkaXYuYWdlbnQtc2Vzc2lvbi1hcHByb3ZhbC1idXR0b25AYXBwcm92YWxCdXR0b25Db250YWluZXInKSxcblx0XHRcdFx0XHRdKVxuXHRcdFx0XHRdKVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZChlbGVtZW50cy5pdGVtKSk7XG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgY29udGV4dEtleVNlcnZpY2VdKSkpO1xuXHRcdGNvbnN0IHRpdGxlVG9vbGJhciA9IGRpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgZWxlbWVudHMudGl0bGVUb29sYmFyLCBNZW51SWQuQWdlbnRTZXNzaW9uSXRlbVRvb2xiYXIsIHtcblx0XHRcdG1lbnVPcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGVsZW1lbnRzLml0ZW0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGVsZW1lbnQ6IGVsZW1lbnRzLml0ZW0sXG5cdFx0XHRpY29uOiBlbGVtZW50cy5pY29uLFxuXHRcdFx0c3RhdHVzSWNvbjogZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25TdGF0dXNJY29uKGVsZW1lbnRzLmljb24sIHNlc3Npb24gPT4gdGhpcy5nZXRJY29uKHNlc3Npb24pLCB0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlKSksXG5cdFx0XHR0aXRsZTogZGlzcG9zYWJsZXMuYWRkKG5ldyBJY29uTGFiZWwoZWxlbWVudHMudGl0bGUsIHsgc3VwcG9ydEhpZ2hsaWdodHM6IHRydWUsIHN1cHBvcnRJY29uczogdHJ1ZSB9KSksXG5cdFx0XHRwaW5uZWRJbmRpY2F0b3I6IGVsZW1lbnRzLnBpbm5lZEluZGljYXRvcixcblx0XHRcdHBlbmRpbmdWb2ljZUluZGljYXRvcjogZWxlbWVudHMucGVuZGluZ1ZvaWNlSW5kaWNhdG9yLFxuXHRcdFx0dGl0bGVUb29sYmFyLFxuXHRcdFx0ZGV0YWlsc0ljb246IGVsZW1lbnRzLmRldGFpbHNJY29uLFxuXHRcdFx0YmFkZ2U6IGVsZW1lbnRzLmJhZGdlLFxuXHRcdFx0c2VwYXJhdG9yOiBlbGVtZW50cy5zZXBhcmF0b3IsXG5cdFx0XHRkaWZmQ29udGFpbmVyOiBlbGVtZW50cy5kaWZmQ29udGFpbmVyLFxuXHRcdFx0ZGlmZkFkZGVkU3BhbjogZWxlbWVudHMuYWRkZWRTcGFuLFxuXHRcdFx0ZGlmZlJlbW92ZWRTcGFuOiBlbGVtZW50cy5yZW1vdmVkU3Bhbixcblx0XHRcdGRlc2NyaXB0aW9uOiBlbGVtZW50cy5kZXNjcmlwdGlvbixcblx0XHRcdHN0YXR1c0NvbnRhaW5lcjogZWxlbWVudHMuc3RhdHVzQ29udGFpbmVyLFxuXHRcdFx0c3RhdHVzVGltZTogZWxlbWVudHMuc3RhdHVzVGltZSxcblx0XHRcdGFwcHJvdmFsUm93OiBlbGVtZW50cy5hcHByb3ZhbFJvdyxcblx0XHRcdGFwcHJvdmFsTGFiZWw6IGVsZW1lbnRzLmFwcHJvdmFsTGFiZWwsXG5cdFx0XHRhcHByb3ZhbEJ1dHRvbkNvbnRhaW5lcjogZWxlbWVudHMuYXBwcm92YWxCdXR0b25Db250YWluZXIsXG5cdFx0XHRjb250ZXh0S2V5U2VydmljZSxcblx0XHRcdGVsZW1lbnREaXNwb3NhYmxlLFxuXHRcdFx0ZGlzcG9zYWJsZXNcblx0XHR9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChzZXNzaW9uOiBJVHJlZU5vZGU8SUFnZW50U2Vzc2lvbiwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlOiBJQWdlbnRTZXNzaW9uSXRlbVRlbXBsYXRlLCBkZXRhaWxzPzogSVRyZWVFbGVtZW50UmVuZGVyRGV0YWlscyk6IHZvaWQge1xuXG5cdFx0Ly8gQ2xlYXIgb2xkIHN0YXRlXG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHR0ZW1wbGF0ZS5kaWZmQWRkZWRTcGFuLnRleHRDb250ZW50ID0gJyc7XG5cdFx0dGVtcGxhdGUuZGlmZlJlbW92ZWRTcGFuLnRleHRDb250ZW50ID0gJyc7XG5cdFx0dGVtcGxhdGUuYmFkZ2UudGV4dENvbnRlbnQgPSAnJztcblx0XHR0ZW1wbGF0ZS5kZXNjcmlwdGlvbi50ZXh0Q29udGVudCA9ICcnO1xuXG5cdFx0Ly8gQXJjaGl2ZWRcblx0XHR0ZW1wbGF0ZS5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2FyY2hpdmVkJywgc2Vzc2lvbi5lbGVtZW50LmlzQXJjaGl2ZWQoKSk7XG5cblx0XHQvLyBTZWN0aW9uIGxhYmVsIGZvciBncm91cCBob3ZlciBkZXRlY3Rpb25cblx0XHRpZiAodGhpcy5vcHRpb25zLmlzR3JvdXBlZEJ5UmVwb3NpdG9yeT8uKCkpIHtcblx0XHRcdGNvbnN0IHJlcG9OYW1lID0gZ2V0UmVwb3NpdG9yeU5hbWUoc2Vzc2lvbi5lbGVtZW50KTtcblx0XHRcdGlmIChyZXBvTmFtZSkge1xuXHRcdFx0XHR0ZW1wbGF0ZS5lbGVtZW50LnNldEF0dHJpYnV0ZSgnZGF0YS1zZWN0aW9uLWxhYmVsJywgcmVwb05hbWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGVtcGxhdGUuZWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoJ2RhdGEtc2VjdGlvbi1sYWJlbCcpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZS5lbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgnZGF0YS1zZWN0aW9uLWxhYmVsJyk7XG5cdFx0fVxuXG5cdFx0Ly8gSWNvbiAtIHN0YXR1cyBpbiB0aGUgaWNvbiBjb2x1bW4sIG9wdGlvbmFsIHNlc3Npb24gdHlwZSBpY29uIGluIGRldGFpbHMuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy51c2VTdGF0dXNPbmx5SWNvbnMpIHtcblx0XHRcdHRlbXBsYXRlLnN0YXR1c0ljb24uc2V0U3RhdHVzKHNlc3Npb24uZWxlbWVudCk7XG5cdFx0XHRpZiAoc2Vzc2lvbi5lbGVtZW50LnByb3ZpZGVyVHlwZSA9PT0gQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQpIHtcblx0XHRcdFx0dGVtcGxhdGUuZGV0YWlsc0ljb24uY2xhc3NOYW1lID0gJ2FnZW50LXNlc3Npb24tZGV0YWlscy1pY29uJzsgLy8gaGlkZSBkZWZhdWx0IHByb3ZpZGVyIGljb24gKHNhbWUgYXMgTG9jYWwgaW4gbm9uLXN0YXR1cy1vbmx5IG1vZGUpXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0ZW1wbGF0ZS5kZXRhaWxzSWNvbi5jbGFzc05hbWUgPSBgYWdlbnQtc2Vzc2lvbi1kZXRhaWxzLWljb24gJHtUaGVtZUljb24uYXNDbGFzc05hbWUoc2Vzc2lvbi5lbGVtZW50Lmljb24pfWA7XG5cdFx0XHRcdHRlbXBsYXRlLmRldGFpbHNJY29uLmNsYXNzTGlzdC5hZGQoJ3Zpc2libGUnKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGUuc3RhdHVzSWNvbi5zZXRTdGF0dXMoc2Vzc2lvbi5lbGVtZW50KTtcblx0XHRcdHRlbXBsYXRlLmRldGFpbHNJY29uLmNsYXNzTmFtZSA9ICdhZ2VudC1zZXNzaW9uLWRldGFpbHMtaWNvbic7XG5cdFx0fVxuXG5cdFx0Ly8gVGl0bGVcblx0XHRjb25zdCBtYXJrZG93blRpdGxlID0gbmV3IE1hcmtkb3duU3RyaW5nKHNlc3Npb24uZWxlbWVudC5sYWJlbCk7XG5cdFx0dGVtcGxhdGUudGl0bGUuc2V0TGFiZWwocmVuZGVyQXNQbGFpbnRleHQobWFya2Rvd25UaXRsZSksIHVuZGVmaW5lZCwgeyBtYXRjaGVzOiBjcmVhdGVNYXRjaGVzKHNlc3Npb24uZmlsdGVyRGF0YSkgfSk7XG5cblx0XHQvLyBUaXRsZSBBY3Rpb25zIC0gVXBkYXRlIGNvbnRleHQga2V5c1xuXHRcdENoYXRDb250ZXh0S2V5cy5pc0FyY2hpdmVkQWdlbnRTZXNzaW9uLmJpbmRUbyh0ZW1wbGF0ZS5jb250ZXh0S2V5U2VydmljZSkuc2V0KHNlc3Npb24uZWxlbWVudC5pc0FyY2hpdmVkKCkpO1xuXHRcdENoYXRDb250ZXh0S2V5cy5pc1Bpbm5lZEFnZW50U2Vzc2lvbi5iaW5kVG8odGVtcGxhdGUuY29udGV4dEtleVNlcnZpY2UpLnNldChzZXNzaW9uLmVsZW1lbnQuaXNQaW5uZWQoKSk7XG5cdFx0Q2hhdENvbnRleHRLZXlzLmlzUmVhZEFnZW50U2Vzc2lvbi5iaW5kVG8odGVtcGxhdGUuY29udGV4dEtleVNlcnZpY2UpLnNldChzZXNzaW9uLmVsZW1lbnQuaXNSZWFkKCkpO1xuXHRcdENoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25UeXBlLmJpbmRUbyh0ZW1wbGF0ZS5jb250ZXh0S2V5U2VydmljZSkuc2V0KHNlc3Npb24uZWxlbWVudC5wcm92aWRlclR5cGUpO1xuXHRcdHRlbXBsYXRlLnRpdGxlVG9vbGJhci5jb250ZXh0ID0gc2Vzc2lvbi5lbGVtZW50O1xuXG5cdFx0Ly8gUGlubmVkIGluZGljYXRvclxuXHRcdGNvbnN0IGlzUGlubmVkID0gc2Vzc2lvbi5lbGVtZW50LmlzUGlubmVkKCk7XG5cdFx0dGVtcGxhdGUucGlubmVkSW5kaWNhdG9yLmNsYXNzTmFtZSA9ICdhZ2VudC1zZXNzaW9uLXBpbm5lZC1pbmRpY2F0b3IgJyArIChUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5waW5uZWQpKTtcblx0XHR0ZW1wbGF0ZS5waW5uZWRJbmRpY2F0b3IuY2xhc3NMaXN0LnRvZ2dsZSgndmlzaWJsZScsIGlzUGlubmVkKTtcblxuXHRcdC8vIFBlbmRpbmcgdm9pY2UgcmVzcG9uc2UgaW5kaWNhdG9yIC0gc2hvd24gd2hlbiBhIHZvaWNlIHJlc3BvbnNlIGFycml2ZWRcblx0XHQvLyB3aGlsZSB0aGlzIHNlc3Npb24gd2Fzbid0IGZvY3VzZWQgYW5kIGlzIGJlaW5nIGhlbGQgdW50aWwgaXQgaXMuXG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvbi5lbGVtZW50LnJlc291cmNlO1xuXHRcdHRlbXBsYXRlLnBlbmRpbmdWb2ljZUluZGljYXRvci5jbGFzc05hbWUgPSAnYWdlbnQtc2Vzc2lvbi1wZW5kaW5nLXZvaWNlLWluZGljYXRvciAnICsgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24udW5tdXRlKTtcblx0XHR0ZW1wbGF0ZS5wZW5kaW5nVm9pY2VJbmRpY2F0b3IudGl0bGUgPSBsb2NhbGl6ZSgncGVuZGluZ1ZvaWNlUmVzcG9uc2UnLCBcIlZvaWNlIHJlc3BvbnNlIHJlYWR5XCIpO1xuXHRcdGNvbnN0IHVwZGF0ZVBlbmRpbmdWb2ljZSA9ICgpID0+IHtcblx0XHRcdHRlbXBsYXRlLnBlbmRpbmdWb2ljZUluZGljYXRvci5jbGFzc0xpc3QudG9nZ2xlKCd2aXNpYmxlJywgdGhpcy52b2ljZVBsYXliYWNrU2VydmljZS5oYXNQZW5kaW5nUmVzcG9uc2Uoc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0fTtcblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy52b2ljZVBsYXliYWNrU2VydmljZS5wZW5kaW5nUmVzcG9uc2VWZXJzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdHVwZGF0ZVBlbmRpbmdWb2ljZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEJhZGdlXG5cdFx0Y29uc3QgaGFzQmFkZ2UgPSB0aGlzLnJlbmRlckJhZGdlKHNlc3Npb24sIHRlbXBsYXRlKTtcblxuXHRcdC8vIERpZmYgaW5mb3JtYXRpb25cblx0XHRsZXQgaGFzRGlmZiA9IGZhbHNlO1xuXHRcdGNvbnN0IHsgY2hhbmdlczogZGlmZiB9ID0gc2Vzc2lvbi5lbGVtZW50O1xuXHRcdGlmICghaXNTZXNzaW9uSW5Qcm9ncmVzc1N0YXR1cyhzZXNzaW9uLmVsZW1lbnQuc3RhdHVzKSAmJiBkaWZmICYmIGhhc1ZhbGlkRGlmZihkaWZmKSkge1xuXHRcdFx0aWYgKHRoaXMucmVuZGVyRGlmZihzZXNzaW9uLCB0ZW1wbGF0ZSkpIHtcblx0XHRcdFx0aGFzRGlmZiA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IGhhc0FnZW50U2Vzc2lvbkNoYW5nZXMgPSBmYWxzZTtcblx0XHRpZiAoXG5cdFx0XHRzZXNzaW9uLmVsZW1lbnQucHJvdmlkZXJUeXBlID09PSBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB8fFxuXHRcdFx0c2Vzc2lvbi5lbGVtZW50LnByb3ZpZGVyVHlwZSA9PT0gQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkXG5cdFx0KSB7XG5cdFx0XHQvLyBCYWNrZ3JvdW5kIGFuZCBDbG91ZCBhZ2VudHMgcHJvdmlkZSB0aGUgbGlzdCBvZiBjaGFuZ2VzIGRpcmVjdGx5LFxuXHRcdFx0Ly8gc28gd2UgaGF2ZSB0byB1c2UgdGhlIGxpc3Qgb2YgY2hhbmdlcyB0byBkZXRlcm1pbmUgd2hldGhlciB0byBzaG93XG5cdFx0XHQvLyB0aGUgXCJWaWV3IEFsbCBDaGFuZ2VzXCIgYWN0aW9uXG5cdFx0XHRoYXNBZ2VudFNlc3Npb25DaGFuZ2VzID0gQXJyYXkuaXNBcnJheShkaWZmKSAmJiBkaWZmLmxlbmd0aCA+IDA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGhhc0FnZW50U2Vzc2lvbkNoYW5nZXMgPSBoYXNEaWZmO1xuXHRcdH1cblxuXHRcdENoYXRDb250ZXh0S2V5cy5oYXNBZ2VudFNlc3Npb25DaGFuZ2VzLmJpbmRUbyh0ZW1wbGF0ZS5jb250ZXh0S2V5U2VydmljZSkuc2V0KGhhc0FnZW50U2Vzc2lvbkNoYW5nZXMpO1xuXG5cblx0XHQvLyBEZXNjcmlwdGlvblxuXHRcdGNvbnN0IGhhc0Rlc2NyaXB0aW9uID0gdGhpcy5yZW5kZXJEZXNjcmlwdGlvbihzZXNzaW9uLCB0ZW1wbGF0ZSk7XG5cblx0XHQvLyBTdGF0dXNcblx0XHRjb25zdCBoYXNTdGF0dXMgPSB0aGlzLnJlbmRlclN0YXR1cyhzZXNzaW9uLCB0ZW1wbGF0ZSk7XG5cblx0XHQvLyBXaGVuIGluIHByb2dyZXNzIHdpdGggYSBkZXNjcmlwdGlvbiwgb25seSBzaG93IGRlc2NyaXB0aW9uIGluIHRoZSBkZXRhaWxzIHJvd1xuXHRcdGNvbnN0IGhpZGVEZXRhaWxzID0gaGFzRGVzY3JpcHRpb24gJiYgaXNTZXNzaW9uSW5Qcm9ncmVzc1N0YXR1cyhzZXNzaW9uLmVsZW1lbnQuc3RhdHVzKTtcblx0XHR0ZW1wbGF0ZS5iYWRnZS5jbGFzc0xpc3QudG9nZ2xlKCdoYXMtYmFkZ2UnLCBoYXNCYWRnZSAmJiAhaGlkZURldGFpbHMpO1xuXHRcdHRlbXBsYXRlLmRpZmZDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLWRpZmYnLCBoYXNEaWZmICYmICFoaWRlRGV0YWlscyk7XG5cdFx0dGVtcGxhdGUuc3RhdHVzQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsIGhpZGVEZXRhaWxzKTtcblx0XHR0ZW1wbGF0ZS5zZXBhcmF0b3IuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLXNlcGFyYXRvcicsICFoaWRlRGV0YWlscyAmJiBoYXNCYWRnZSAmJiBoYXNEaWZmKTtcblx0XHR0ZW1wbGF0ZS5kZXNjcmlwdGlvbi5jbGFzc0xpc3QudG9nZ2xlKCdoYXMtc2VwYXJhdG9yJywgaGFzRGVzY3JpcHRpb24gJiYgIWhpZGVEZXRhaWxzICYmIChoYXNCYWRnZSB8fCBoYXNEaWZmKSk7XG5cdFx0dGVtcGxhdGUuc3RhdHVzQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hhcy1zZXBhcmF0b3InLCAhaGlkZURldGFpbHMgJiYgaGFzU3RhdHVzICYmIChoYXNCYWRnZSB8fCBoYXNEaWZmIHx8IGhhc0Rlc2NyaXB0aW9uKSk7XG5cblx0XHQvLyBIb3ZlclxuXHRcdHRoaXMucmVuZGVySG92ZXIoc2Vzc2lvbiwgdGVtcGxhdGUpO1xuXG5cdFx0Ly8gQXBwcm92YWwgcm93XG5cdFx0aWYgKHRoaXMuX2FwcHJvdmFsTW9kZWwpIHtcblx0XHRcdHRoaXMucmVuZGVyQXBwcm92YWxSb3coc2Vzc2lvbiwgdGVtcGxhdGUpO1xuXHRcdH1cblxuXHRcdC8vIExhemlseSByZXNvbHZlIGl0ZW0gZGV0YWlscyAodGltaW5nLCBjaGFuZ2VzLCBiYWRnZSwgZXRjLilcblx0XHR0aGlzLnRyaWdnZXJSZXNvbHZlKHNlc3Npb24sIHRlbXBsYXRlKTtcblx0fVxuXG5cdHByaXZhdGUgdHJpZ2dlclJlc29sdmUoc2Vzc2lvbjogSVRyZWVOb2RlPElBZ2VudFNlc3Npb24sIEZ1enp5U2NvcmU+LCB0ZW1wbGF0ZTogSUFnZW50U2Vzc2lvbkl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlLmFkZCh7IGRpc3Bvc2UoKSB7IGN0cy5kaXNwb3NlKHRydWUpOyB9IH0pO1xuXG5cdFx0dGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlc29sdmVDaGF0U2Vzc2lvbkl0ZW0oc2Vzc2lvbi5lbGVtZW50LnByb3ZpZGVyVHlwZSwgc2Vzc2lvbi5lbGVtZW50LnJlc291cmNlLCBjdHMudG9rZW4pLmNhdGNoKCgpID0+IHtcblx0XHRcdC8vIFJlc29sdmUgZmFpbHVyZXMgYXJlIG5vbi1mYXRhbCBcdTIwMTQgdGhlIGl0ZW0gY29udGludWVzIHRvIGRpc3BsYXkgd2l0aCB3aGF0ZXZlciBkYXRhIGlzIGF2YWlsYWJsZVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJCYWRnZShzZXNzaW9uOiBJVHJlZU5vZGU8SUFnZW50U2Vzc2lvbiwgRnV6enlTY29yZT4sIHRlbXBsYXRlOiBJQWdlbnRTZXNzaW9uSXRlbVRlbXBsYXRlKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5oaWRlU2Vzc2lvbkJhZGdlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmFkZ2UgPSBzZXNzaW9uLmVsZW1lbnQuYmFkZ2U7XG5cdFx0aWYgKCFiYWRnZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIFdoZW4gZ3JvdXBlZCBieSByZXBvc2l0b3J5LCBoaWRlIHRoZSBiYWRnZSBvbmx5IGlmIHRoZSBuYW1lIGl0IHNob3dzXG5cdFx0Ly8gbWF0Y2hlcyB0aGUgc2VjdGlvbiBoZWFkZXIgKGkuZS4gdGhlIHJlcG9zaXRvcnkgbmFtZSBmb3IgdGhpcyBzZXNzaW9uKS5cblx0XHQvLyBCYWRnZXMgd2l0aCBhIGRpZmZlcmVudCBuYW1lIChlLmcuIHdvcmt0cmVlIG5hbWUpIGFyZSBzdGlsbCBzaG93bi5cblx0XHQvLyBQaW5uZWQgYW5kIGFyY2hpdmVkIHNlc3Npb25zIGFsd2F5cyBrZWVwIHRoZWlyIGJhZGdlIHNpbmNlIHRoZXkgYXJlXG5cdFx0Ly8gZ3JvdXBlZCB1bmRlciB0aGVpciBvd24gc2VjdGlvbiwgbm90IGEgcmVwb3NpdG9yeSBzZWN0aW9uLlxuXHRcdGlmIChcblx0XHRcdHRoaXMub3B0aW9ucy5pc0dyb3VwZWRCeVJlcG9zaXRvcnk/LigpICYmXG5cdFx0XHQhc2Vzc2lvbi5lbGVtZW50LmlzQXJjaGl2ZWQoKSAmJlxuXHRcdFx0IXNlc3Npb24uZWxlbWVudC5pc1Bpbm5lZCgpXG5cdFx0KSB7XG5cdFx0XHRjb25zdCByYXcgPSB0eXBlb2YgYmFkZ2UgPT09ICdzdHJpbmcnID8gYmFkZ2UgOiBiYWRnZS52YWx1ZTtcblx0XHRcdGNvbnN0IG1hdGNoID0gcmF3Lm1hdGNoKC9eXFwkXFwoKD86cmVwb3xmb2xkZXJ8d29ya3RyZWUpXFwpXFxzKiguKykvKTtcblx0XHRcdGlmIChtYXRjaCkge1xuXHRcdFx0XHRjb25zdCBiYWRnZU5hbWUgPSBtYXRjaFsxXS50cmltKCk7XG5cdFx0XHRcdGNvbnN0IHJlcG9OYW1lID0gZ2V0UmVwb3NpdG9yeU5hbWUoc2Vzc2lvbi5lbGVtZW50KTtcblx0XHRcdFx0aWYgKGJhZGdlTmFtZSA9PT0gcmVwb05hbWUpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBub3JtYWxpc2VkQmFkZ2UgPSB0aGlzLnN0cmlwQ29kaWNvbnMoYmFkZ2UpO1xuXHRcdGNvbnN0IGJhZGdlVmFsdWUgPSB0eXBlb2Ygbm9ybWFsaXNlZEJhZGdlID09PSAnc3RyaW5nJyA/IG5vcm1hbGlzZWRCYWRnZSA6IG5vcm1hbGlzZWRCYWRnZS52YWx1ZTtcblx0XHRpZiAoIWJhZGdlVmFsdWUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLnJlbmRlck1hcmtkb3duT3JUZXh0KG5vcm1hbGlzZWRCYWRnZSwgdGVtcGxhdGUuYmFkZ2UsIHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlKTtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBzdHJpcENvZGljb25zKGNvbnRlbnQ6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyk6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB7XG5cdFx0Y29uc3QgcmF3ID0gdHlwZW9mIGNvbnRlbnQgPT09ICdzdHJpbmcnID8gY29udGVudCA6IGNvbnRlbnQudmFsdWU7XG5cdFx0Y29uc3Qgc3RyaXBwZWQgPSByYXcucmVwbGFjZSgvXFwkXFwoW2EtejAtOVxcLV0rXFwpXFxzKi9naSwgJycpLnRyaW0oKTtcblx0XHRpZiAodHlwZW9mIGNvbnRlbnQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gc3RyaXBwZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIE1hcmtkb3duU3RyaW5nLmxpZnQoeyAuLi5jb250ZW50LCB2YWx1ZTogc3RyaXBwZWQgfSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck1hcmtkb3duT3JUZXh0KGNvbnRlbnQ6IHN0cmluZyB8IElNYXJrZG93blN0cmluZywgY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IHZvaWQge1xuXHRcdGlmICh0eXBlb2YgY29udGVudCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbnRhaW5lci50ZXh0Q29udGVudCA9IGNvbnRlbnQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihjb250ZW50LCB7XG5cdFx0XHRcdHNhbml0aXplckNvbmZpZzoge1xuXHRcdFx0XHRcdHJlcGxhY2VXaXRoUGxhaW50ZXh0OiB0cnVlLFxuXHRcdFx0XHRcdGFsbG93ZWRUYWdzOiB7XG5cdFx0XHRcdFx0XHRvdmVycmlkZTogYWxsb3dlZENoYXRNYXJrZG93bkh0bWxUYWdzLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0YWxsb3dlZExpbmtTY2hlbWVzOiB7IGF1Z21lbnQ6IFt0aGlzLnByb2R1Y3RTZXJ2aWNlLnVybFByb3RvY29sXSB9XG5cdFx0XHRcdH0sXG5cdFx0XHR9LCBjb250YWluZXIpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckRpZmYoc2Vzc2lvbjogSVRyZWVOb2RlPElBZ2VudFNlc3Npb24sIEZ1enp5U2NvcmU+LCB0ZW1wbGF0ZTogSUFnZW50U2Vzc2lvbkl0ZW1UZW1wbGF0ZSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGRpZmYgPSBnZXRBZ2VudENoYW5nZXNTdW1tYXJ5KHNlc3Npb24uZWxlbWVudC5jaGFuZ2VzKTtcblx0XHRpZiAoIWRpZmYpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoZGlmZi5pbnNlcnRpb25zID09PSAwICYmIGRpZmYuZGVsZXRpb25zID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKGRpZmYuaW5zZXJ0aW9ucyA+PSAwIC8qIHJlbmRlciBldmVuIGAwYCBmb3IgbW9yZSBob21vZ2VuZWl0eSAqLykge1xuXHRcdFx0dGVtcGxhdGUuZGlmZkFkZGVkU3Bhbi50ZXh0Q29udGVudCA9IGArJHtkaWZmLmluc2VydGlvbnN9YDtcblx0XHR9XG5cblx0XHRpZiAoZGlmZi5kZWxldGlvbnMgPj0gMCAvKiByZW5kZXIgZXZlbiBgMGAgZm9yIG1vcmUgaG9tb2dlbmVpdHkgKi8pIHtcblx0XHRcdHRlbXBsYXRlLmRpZmZSZW1vdmVkU3Bhbi50ZXh0Q29udGVudCA9IGAtJHtkaWZmLmRlbGV0aW9uc31gO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRJY29uKHNlc3Npb246IElBZ2VudFNlc3Npb24pOiBUaGVtZUljb24ge1xuXHRcdHJldHVybiBnZXRBZ2VudFNlc3Npb25TdGF0dXNJY29uKHNlc3Npb24pO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJEZXNjcmlwdGlvbihzZXNzaW9uOiBJVHJlZU5vZGU8SUFnZW50U2Vzc2lvbiwgRnV6enlTY29yZT4sIHRlbXBsYXRlOiBJQWdlbnRTZXNzaW9uSXRlbVRlbXBsYXRlKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBzZXNzaW9uLmVsZW1lbnQuZGVzY3JpcHRpb247XG5cdFx0aWYgKGRlc2NyaXB0aW9uKSB7XG5cdFx0XHR0aGlzLnJlbmRlck1hcmtkb3duT3JUZXh0KGRlc2NyaXB0aW9uLCB0ZW1wbGF0ZS5kZXNjcmlwdGlvbiwgdGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGUpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gRmFsbGJhY2sgdG8gc3RhdGUgbGFiZWxcblx0XHRpZiAoc2Vzc2lvbi5lbGVtZW50LnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpIHtcblx0XHRcdHRlbXBsYXRlLmRlc2NyaXB0aW9uLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXQuc2Vzc2lvbi5zdGF0dXMuaW5Qcm9ncmVzcycsIFwiV29ya2luZy4uLlwiKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSBpZiAoc2Vzc2lvbi5lbGVtZW50LnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQpIHtcblx0XHRcdHRlbXBsYXRlLmRlc2NyaXB0aW9uLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXQuc2Vzc2lvbi5zdGF0dXMubmVlZHNJbnB1dCcsIFwiSW5wdXQgbmVlZGVkLlwiKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSBpZiAoc2Vzc2lvbi5lbGVtZW50LnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLkZhaWxlZCkge1xuXHRcdFx0dGVtcGxhdGUuZGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdC5zZXNzaW9uLnN0YXR1cy5mYWlsZWQnLCBcIkZhaWxlZFwiKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlLmRlc2NyaXB0aW9uLnRleHRDb250ZW50ID0gJyc7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSB0b0R1cmF0aW9uKHN0YXJ0VGltZTogbnVtYmVyLCBlbmRUaW1lOiBudW1iZXIsIHVzZUZ1bGxUaW1lV29yZHM6IGJvb2xlYW4sIGRpc2FsbG93Tm93OiBib29sZWFuKTogc3RyaW5nIHtcblx0XHRjb25zdCBlbGFwc2VkID0gTWF0aC5tYXgoTWF0aC5yb3VuZCgoZW5kVGltZSAtIHN0YXJ0VGltZSkgLyAxMDAwKSAqIDEwMDAsIDEwMDAgLyogY2xhbXAgdG8gMXMgKi8pO1xuXHRcdGlmICghZGlzYWxsb3dOb3cgJiYgZWxhcHNlZCA8IDYwMDAwKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3NlY29uZHNEdXJhdGlvbicsIFwibm93XCIpO1xuXHRcdH1cblxuXHRcdHJldHVybiBnZXREdXJhdGlvblN0cmluZyhlbGFwc2VkLCB1c2VGdWxsVGltZVdvcmRzKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyU3RhdHVzKHNlc3Npb246IElUcmVlTm9kZTxJQWdlbnRTZXNzaW9uLCBGdXp6eVNjb3JlPiwgdGVtcGxhdGU6IElBZ2VudFNlc3Npb25JdGVtVGVtcGxhdGUpOiBib29sZWFuIHtcblxuXHRcdC8vIFNob3cgcmVwb3NpdG9yeSBuYW1lIGZvciBwaW5uZWQgc2Vzc2lvbnMgd2hlbiBncm91cGVkIGJ5IHJlcG9zaXRvcnksXG5cdFx0Ly8gc2luY2UgdGhleSBhcmUgbm90IHBsYWNlZCB1bmRlciBhIHJlcG9zaXRvcnkgc2VjdGlvbiBoZWFkZXIuXG5cdFx0Y29uc3QgcmVwb1ByZWZpeCA9IChzZXNzaW9uLmVsZW1lbnQuaXNQaW5uZWQoKSAmJiB0aGlzLm9wdGlvbnMuaXNHcm91cGVkQnlSZXBvc2l0b3J5Py4oKSlcblx0XHRcdD8gZ2V0UmVwb3NpdG9yeU5hbWUoc2Vzc2lvbi5lbGVtZW50KVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBnZXRTdGF0dXNUZXh0ID0gKHNlc3Npb246IElBZ2VudFNlc3Npb24pID0+IHtcblx0XHRcdGxldCB0aW1lTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChzZXNzaW9uLnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MgJiYgc2Vzc2lvbi50aW1pbmcubGFzdFJlcXVlc3RTdGFydGVkKSB7XG5cdFx0XHRcdHRpbWVMYWJlbCA9IHRoaXMudG9EdXJhdGlvbihzZXNzaW9uLnRpbWluZy5sYXN0UmVxdWVzdFN0YXJ0ZWQsIERhdGUubm93KCksIGZhbHNlLCBmYWxzZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGltZUxhYmVsKSB7XG5cdFx0XHRcdGNvbnN0IGRhdGUgPSB0aGlzLm9wdGlvbnMuaXNTb3J0ZWRCeVVwZGF0ZWQ/LigpXG5cdFx0XHRcdFx0PyBzZXNzaW9uLnRpbWluZy5sYXN0UmVxdWVzdEVuZGVkID8/IHNlc3Npb24udGltaW5nLmNyZWF0ZWRcblx0XHRcdFx0XHQ6IHNlc3Npb24udGltaW5nLmNyZWF0ZWQ7XG5cdFx0XHRcdGNvbnN0IHNlY29uZHMgPSBNYXRoLnJvdW5kKChuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIGRhdGUpIC8gMTAwMCk7XG5cdFx0XHRcdGlmIChzZWNvbmRzIDwgNjApIHtcblx0XHRcdFx0XHR0aW1lTGFiZWwgPSBsb2NhbGl6ZSgnc2Vjb25kc0R1cmF0aW9uJywgXCJub3dcIik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGltZUxhYmVsID0gc2Vzc2lvbkRhdGVGcm9tTm93KGRhdGUsIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiByZXBvUHJlZml4ID8gYCR7cmVwb1ByZWZpeH0gXFx1MDBCNyAke3RpbWVMYWJlbH1gIDogdGltZUxhYmVsO1xuXHRcdH07XG5cblx0XHQvLyBUaW1lIGxhYmVsXG5cdFx0dGVtcGxhdGUuc3RhdHVzVGltZS50ZXh0Q29udGVudCA9IGdldFN0YXR1c1RleHQoc2Vzc2lvbi5lbGVtZW50KTtcblx0XHRjb25zdCB0aW1lciA9IHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlLmFkZChuZXcgSW50ZXJ2YWxUaW1lcigpKTtcblx0XHR0aW1lci5jYW5jZWxBbmRTZXQoKCkgPT4gdGVtcGxhdGUuc3RhdHVzVGltZS50ZXh0Q29udGVudCA9IGdldFN0YXR1c1RleHQoc2Vzc2lvbi5lbGVtZW50KSwgc2Vzc2lvbi5lbGVtZW50LnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MgPyAxMDAwIC8qIGV2ZXJ5IHNlY29uZCAqLyA6IDYwICogMTAwMCAvKiBldmVyeSBtaW51dGUgKi8pO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckhvdmVyKHNlc3Npb246IElUcmVlTm9kZTxJQWdlbnRTZXNzaW9uLCBGdXp6eVNjb3JlPiwgdGVtcGxhdGU6IElBZ2VudFNlc3Npb25JdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5vcHRpb25zLmRpc2FibGVIb3Zlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghaXNTZXNzaW9uSW5Qcm9ncmVzc1N0YXR1cyhzZXNzaW9uLmVsZW1lbnQuc3RhdHVzKSAmJiBzZXNzaW9uLmVsZW1lbnQuaXNSZWFkKCkpIHtcblx0XHRcdHJldHVybjsgLy8gdGhlIGhvdmVyIGlzIGNvbXBsZXggYW5kIGxhcmdlLCBmb3Igbm93IGxpbWl0IGl0IHRvIGluLXByb2dyZXNzIHNlc3Npb25zIG9ubHlcblx0XHR9XG5cblx0XHRjb25zdCByZWR1Y2VkRGVsYXkgPSBzZXNzaW9uLmVsZW1lbnQuc3RhdHVzID09PSBBZ2VudFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dDtcblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZS5hZGQoXG5cdFx0XHR0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0ZW1wbGF0ZS5lbGVtZW50LCAoKSA9PiB0aGlzLmJ1aWxkSG92ZXJDb250ZW50KHNlc3Npb24uZWxlbWVudCksIHsgZ3JvdXBJZDogJ2FnZW50LnNlc3Npb25zJywgcmVkdWNlZERlbGF5IH0pXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgYnVpbGRIb3ZlckNvbnRlbnQoc2Vzc2lvbjogSUFnZW50U2Vzc2lvbik6IElEZWxheWVkSG92ZXJPcHRpb25zIHtcblx0XHRpZiAodGhpcy5zZXNzaW9uSG92ZXIudmFsdWU/LnNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSAhPT0gc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHQvLyBub3RlOiBob3ZlciBzZXJ2aWNlIHVzZSBtb3VzZW92ZXIgd2hpY2ggdHJpZ2dlcnMgYWdhaW4gaWYgdGhlIG1vdXNlIG1vdmVzXG5cdFx0XHQvLyB3aXRoaW4gdGhlIGVsZW1lbnQuIE9ubHkgcmVjcmVhdGUgdGhlIGhvdmVyIHdpZGdldCBpZiB0aGUgc2Vzc2lvbiBjaGFuZ2VkLlxuXHRcdFx0dGhpcy5zZXNzaW9uSG92ZXIudmFsdWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbkhvdmVyV2lkZ2V0LCBzZXNzaW9uKTtcblx0XHR9XG5cblx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLnNlc3Npb25Ib3Zlci52YWx1ZTtcblx0XHRsZXQgcGF1c2VEaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IGBhZ2VudC5zZXNzaW9uLmhvdmVyLiR7c2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpfWAsXG5cdFx0XHRjb250ZW50OiB3aWRnZXQuZG9tTm9kZSxcblx0XHRcdHN0eWxlOiBIb3ZlclN0eWxlLlBvaW50ZXIsXG5cdFx0XHRvbkRpZFNob3c6ICgpID0+IHtcblx0XHRcdFx0Ly8gUGF1c2UgbGlzdCB1cGRhdGVzIGJlZm9yZSByZW5kZXJpbmcgc3RhcnRzIHNvIHJlc29sdmluZyB0aGUgc2Vzc2lvbidzIGxhenkgZGV0YWlscyBkb2VzIG5vdCByZS1zb3J0IHRoZSBsaXN0XG5cdFx0XHRcdC8vIGFuZCBjYXVzZSBzZXNzaW9ucyB0byBqdW1wIHVuZGVyIHRoZSBjdXJzb3IgKHNlZSAjMzIwNTA5KS5cblx0XHRcdFx0Y29uc3QgcHJldmlvdXNQYXVzZURpc3Bvc2FibGUgPSBwYXVzZURpc3Bvc2FibGU7XG5cdFx0XHRcdHBhdXNlRGlzcG9zYWJsZSA9IHRoaXMub3B0aW9ucy5wYXVzZVNlc3Npb25VcGRhdGVzPy4oKTtcblx0XHRcdFx0cHJldmlvdXNQYXVzZURpc3Bvc2FibGU/LmRpc3Bvc2UoKTtcblx0XHRcdFx0d2lkZ2V0Lm9uUmVuZGVyZWQoKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZEhpZGU6ICgpID0+IHtcblx0XHRcdFx0d2lkZ2V0Lm9uSGlkZGVuKCk7XG5cdFx0XHRcdHBhdXNlRGlzcG9zYWJsZT8uZGlzcG9zZSgpO1xuXHRcdFx0XHRwYXVzZURpc3Bvc2FibGUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0cG9zaXRpb246IHtcblx0XHRcdFx0aG92ZXJQb3NpdGlvbjogdGhpcy5vcHRpb25zLmdldEhvdmVyUG9zaXRpb24oKVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckFwcHJvdmFsUm93KHNlc3Npb246IElUcmVlTm9kZTxJQWdlbnRTZXNzaW9uLCBGdXp6eVNjb3JlPiwgdGVtcGxhdGU6IElBZ2VudFNlc3Npb25JdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fYXBwcm92YWxNb2RlbCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdBcHByb3ZhbCBtb2RlbCBpcyByZXF1aXJlZCB0byByZW5kZXIgYXBwcm92YWwgcm93Jyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IHRoaXMuX2FwcHJvdmFsTW9kZWw7XG5cdFx0Ly8gSW5pdGlhbGl6ZSBmcm9tIGN1cnJlbnQgbW9kZWwgc3RhdGUgdG8gYXZvaWQgdW5uZWNlc3NhcnkgaGVpZ2h0IGNoYW5nZXMgb24gZmlyc3QgcmVuZGVyXG5cdFx0Y29uc3QgaW5pdGlhbEluZm8gPSBhcHByb3ZhbE1vZGVsLmdldEFwcHJvdmFsKHNlc3Npb24uZWxlbWVudC5yZXNvdXJjZSkuZ2V0KCk7XG5cdFx0bGV0IHdhc1Zpc2libGUgPSAhIWluaXRpYWxJbmZvO1xuXHRcdHRlbXBsYXRlLmFwcHJvdmFsUm93LmNsYXNzTGlzdC50b2dnbGUoJ3Zpc2libGUnLCB3YXNWaXNpYmxlKTtcblxuXHRcdGNvbnN0IGJ1dHRvblN0b3JlID0gdGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0YnV0dG9uU3RvcmUuY2xlYXIoKTtcblxuXHRcdFx0Y29uc3QgaW5mbyA9IGFwcHJvdmFsTW9kZWwuZ2V0QXBwcm92YWwoc2Vzc2lvbi5lbGVtZW50LnJlc291cmNlKS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB2aXNpYmxlID0gISFpbmZvO1xuXG5cdFx0XHR0ZW1wbGF0ZS5hcHByb3ZhbFJvdy5jbGFzc0xpc3QudG9nZ2xlKCd2aXNpYmxlJywgdmlzaWJsZSk7XG5cblx0XHRcdGlmIChpbmZvKSB7XG5cdFx0XHRcdC8vIFJlbmRlciB1cCB0byAzIGxpbmVzLCBlYWNoIGFzIGEgc2VwYXJhdGUgY29kZSBibG9jayBzbyBDU1MgY2FuIHRydW5jYXRlIHBlci1saW5lXG5cdFx0XHRcdGNvbnN0IGxpbmVzID0gaW5mby5sYWJlbC5zcGxpdCgnXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1heExpbmVzID0gQWdlbnRTZXNzaW9uUmVuZGVyZXIuQVBQUk9WQUxfUk9XX01BWF9MSU5FUztcblx0XHRcdFx0Y29uc3QgdmlzaWJsZUxpbmVzID0gbGluZXMuc2xpY2UoMCwgbWF4TGluZXMpO1xuXHRcdFx0XHRpZiAobGluZXMubGVuZ3RoID4gbWF4TGluZXMpIHtcblx0XHRcdFx0XHR2aXNpYmxlTGluZXNbbWF4TGluZXMgLSAxXSA9IGAke3Zpc2libGVMaW5lc1ttYXhMaW5lcyAtIDFdfSBcXHUyMDI2YDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBsYW5nSWQgPSBpbmZvLmxhbmd1YWdlSWQgPz8gJ2pzb24nO1xuXHRcdFx0XHRjb25zdCBsYWJlbENvbnRlbnQgPSBuZXcgTWFya2Rvd25TdHJpbmcoKTtcblx0XHRcdFx0Zm9yIChjb25zdCBsaW5lIG9mIHZpc2libGVMaW5lcykge1xuXHRcdFx0XHRcdGxhYmVsQ29udGVudC5hcHBlbmRDb2RlYmxvY2sobGFuZ0lkLCBsaW5lKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnJlbmRlck1hcmtkb3duT3JUZXh0KGxhYmVsQ29udGVudCwgdGVtcGxhdGUuYXBwcm92YWxMYWJlbCwgYnV0dG9uU3RvcmUpO1xuXG5cdFx0XHRcdC8vIEhvdmVyIHdpdGggZnVsbCBjb250ZW50IGFzIGEgY29kZSBibG9ja1xuXHRcdFx0XHRjb25zdCBmdWxsQ29udGVudCA9IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZENvZGVibG9jayhpbmZvLmxhbmd1YWdlSWQgPz8gJ2pzb24nLCBpbmZvLmxhYmVsKTtcblx0XHRcdFx0YnV0dG9uU3RvcmUuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRlbXBsYXRlLmFwcHJvdmFsTGFiZWwsIHtcblx0XHRcdFx0XHRjb250ZW50OiBmdWxsQ29udGVudCxcblx0XHRcdFx0XHRzdHlsZTogSG92ZXJTdHlsZS5Qb2ludGVyLFxuXHRcdFx0XHRcdHBvc2l0aW9uOiB7IGhvdmVyUG9zaXRpb246IEhvdmVyUG9zaXRpb24uQkVMT1cgfSxcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdHRlbXBsYXRlLmFwcHJvdmFsQnV0dG9uQ29udGFpbmVyLnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHRcdGNvbnN0IGlzQWN0aXZlID0gdGhpcy5fYWN0aXZlU2Vzc2lvblJlc291cmNlLnJlYWQocmVhZGVyKT8udG9TdHJpbmcoKSA9PT0gc2Vzc2lvbi5lbGVtZW50LnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGNvbnN0IGJ1dHRvbiA9IGJ1dHRvblN0b3JlLmFkZChuZXcgQnV0dG9uKHRlbXBsYXRlLmFwcHJvdmFsQnV0dG9uQ29udGFpbmVyLCB7XG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhbGxvd0FjdGlvbk9uY2UnLCBcIkFsbG93IG9uY2VcIiksXG5cdFx0XHRcdFx0c2Vjb25kYXJ5OiBpc0FjdGl2ZSxcblx0XHRcdFx0XHQuLi5kZWZhdWx0QnV0dG9uU3R5bGVzXG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0YnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ2FsbG93QWN0aW9uJywgXCJBbGxvd1wiKTtcblx0XHRcdFx0YnV0dG9uU3RvcmUuYWRkKGJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IGluZm8uY29uZmlybSgpKSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh3YXNWaXNpYmxlICE9PSB2aXNpYmxlKSB7XG5cdFx0XHRcdHdhc1Zpc2libGUgPSB2aXNpYmxlO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1IZWlnaHQuZmlyZShzZXNzaW9uLmVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxJQWdlbnRTZXNzaW9uPiwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUFnZW50U2Vzc2lvbkl0ZW1UZW1wbGF0ZSwgZGV0YWlscz86IElUcmVlRWxlbWVudFJlbmRlckRldGFpbHMpOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Nob3VsZCBuZXZlciBoYXBwZW4gc2luY2Ugc2Vzc2lvbiBpcyBpbmNvbXByZXNzaWJsZScpO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPElBZ2VudFNlc3Npb24sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZTogSUFnZW50U2Vzc2lvbkl0ZW1UZW1wbGF0ZSwgZGV0YWlscz86IElUcmVlRWxlbWVudFJlbmRlckRldGFpbHMpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZS5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUFnZW50U2Vzc2lvbkl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvU3RhdHVzTGFiZWwoc3RhdHVzOiBBZ2VudFNlc3Npb25TdGF0dXMpOiBzdHJpbmcge1xuXHRsZXQgc3RhdHVzTGFiZWw6IHN0cmluZztcblx0c3dpdGNoIChzdGF0dXMpIHtcblx0XHRjYXNlIEFnZW50U2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0OlxuXHRcdFx0c3RhdHVzTGFiZWwgPSBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9uTmVlZHNJbnB1dCcsIFwiTmVlZHMgSW5wdXRcIik7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIEFnZW50U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzOlxuXHRcdFx0c3RhdHVzTGFiZWwgPSBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9uSW5Qcm9ncmVzcycsIFwiSW4gUHJvZ3Jlc3NcIik7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIEFnZW50U2Vzc2lvblN0YXR1cy5GYWlsZWQ6XG5cdFx0XHRzdGF0dXNMYWJlbCA9IGxvY2FsaXplKCdhZ2VudFNlc3Npb25GYWlsZWQnLCBcIkZhaWxlZFwiKTtcblx0XHRcdGJyZWFrO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRzdGF0dXNMYWJlbCA9IGxvY2FsaXplKCdhZ2VudFNlc3Npb25Db21wbGV0ZWQnLCBcIkNvbXBsZXRlZFwiKTtcblx0fVxuXG5cdHJldHVybiBzdGF0dXNMYWJlbDtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBTZWN0aW9uIEhlYWRlciBSZW5kZXJlclxuXG5pbnRlcmZhY2UgSUFnZW50U2Vzc2lvblNlY3Rpb25UZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGxhYmVsOiBIVE1MU3BhbkVsZW1lbnQ7XG5cdHJlYWRvbmx5IGNvdW50OiBIVE1MU3BhbkVsZW1lbnQ7XG5cdHJlYWRvbmx5IHRvb2xiYXI6IE1lbnVXb3JrYmVuY2hUb29sQmFyO1xuXHRyZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXHRyZWFkb25seSBkaXNwb3NhYmxlczogSURpc3Bvc2FibGU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50U2Vzc2lvblNlY3Rpb25SZW5kZXJlck9wdGlvbnMge1xuXHRyZWFkb25seSBoaWRlU2VjdGlvbkNvdW50PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIEFnZW50U2Vzc2lvblNlY3Rpb25SZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8SUFnZW50U2Vzc2lvblNlY3Rpb24sIEZ1enp5U2NvcmUsIElBZ2VudFNlc3Npb25TZWN0aW9uVGVtcGxhdGU+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnYWdlbnQtc2Vzc2lvbi1zZWN0aW9uJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gQWdlbnRTZXNzaW9uU2VjdGlvblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2VjdGlvbk9wdGlvbnM6IElBZ2VudFNlc3Npb25TZWN0aW9uUmVuZGVyZXJPcHRpb25zLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJQWdlbnRTZXNzaW9uU2VjdGlvblRlbXBsYXRlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb250YWluZXIuY2xvc2VzdCgnLm1vbmFjby1saXN0LXJvdycpPy5jbGFzc0xpc3QuYWRkKCdhZ2VudC1zZXNzaW9uLWxpc3Qtcm93JywgJ2FnZW50LXNlc3Npb24tc2VjdGlvbi1yb3cnKTtcblxuXHRcdGNvbnN0IGVsZW1lbnRzID0gaChcblx0XHRcdCdkaXYuYWdlbnQtc2Vzc2lvbi1zZWN0aW9uQGNvbnRhaW5lcicsXG5cdFx0XHRbXG5cdFx0XHRcdGgoJ3NwYW4uYWdlbnQtc2Vzc2lvbi1zZWN0aW9uLWxhYmVsQGxhYmVsJyksXG5cdFx0XHRcdGgoJ3NwYW4uYWdlbnQtc2Vzc2lvbi1zZWN0aW9uLWNvdW50QGNvdW50JyksXG5cdFx0XHRcdGgoJ2Rpdi5hZ2VudC1zZXNzaW9uLXNlY3Rpb24tdG9vbGJhckB0b29sYmFyJylcblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQoZWxlbWVudHMuY29udGFpbmVyKSk7XG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgY29udGV4dEtleVNlcnZpY2VdKSkpO1xuXHRcdGNvbnN0IHRvb2xiYXIgPSBkaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIGVsZW1lbnRzLnRvb2xiYXIsIE1lbnVJZC5BZ2VudFNlc3Npb25TZWN0aW9uVG9vbGJhciwge1xuXHRcdFx0bWVudU9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSxcblx0XHR9KSk7XG5cblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZWxlbWVudHMuY29udGFpbmVyKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb250YWluZXI6IGVsZW1lbnRzLmNvbnRhaW5lcixcblx0XHRcdGxhYmVsOiBlbGVtZW50cy5sYWJlbCxcblx0XHRcdGNvdW50OiBlbGVtZW50cy5jb3VudCxcblx0XHRcdHRvb2xiYXIsXG5cdFx0XHRjb250ZXh0S2V5U2VydmljZSxcblx0XHRcdGRpc3Bvc2FibGVzXG5cdFx0fTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPElBZ2VudFNlc3Npb25TZWN0aW9uLCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGU6IElBZ2VudFNlc3Npb25TZWN0aW9uVGVtcGxhdGUsIGRldGFpbHM/OiBJVHJlZUVsZW1lbnRSZW5kZXJEZXRhaWxzKTogdm9pZCB7XG5cblx0XHQvLyBMYWJlbFxuXHRcdHRlbXBsYXRlLmxhYmVsLnRleHRDb250ZW50ID0gZWxlbWVudC5lbGVtZW50LmxhYmVsO1xuXG5cdFx0Ly8gQ291bnRcblx0XHRpZiAodGhpcy5zZWN0aW9uT3B0aW9ucy5oaWRlU2VjdGlvbkNvdW50KSB7XG5cdFx0XHR0ZW1wbGF0ZS5jb3VudC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZS5jb3VudC50ZXh0Q29udGVudCA9IFN0cmluZyhlbGVtZW50LmVsZW1lbnQuc2Vzc2lvbnMubGVuZ3RoKTtcblx0XHR9XG5cblx0XHQvLyBUb29sYmFyXG5cdFx0Q2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvblNlY3Rpb24uYmluZFRvKHRlbXBsYXRlLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoZWxlbWVudC5lbGVtZW50LnNlY3Rpb24pO1xuXHRcdHRlbXBsYXRlLnRvb2xiYXIuY29udGV4dCA9IGVsZW1lbnQuZWxlbWVudDtcblx0fVxuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxJQWdlbnRTZXNzaW9uU2VjdGlvbj4sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElBZ2VudFNlc3Npb25TZWN0aW9uVGVtcGxhdGUsIGRldGFpbHM/OiBJVHJlZUVsZW1lbnRSZW5kZXJEZXRhaWxzKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdTaG91bGQgbmV2ZXIgaGFwcGVuIHNpbmNlIHNlY3Rpb24gaGVhZGVyIGlzIGluY29tcHJlc3NpYmxlJyk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8SUFnZW50U2Vzc2lvblNlY3Rpb24sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZTogSUFnZW50U2Vzc2lvblNlY3Rpb25UZW1wbGF0ZSwgZGV0YWlscz86IElUcmVlRWxlbWVudFJlbmRlckRldGFpbHMpOiB2b2lkIHtcblx0XHQvLyBub29wXG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJQWdlbnRTZXNzaW9uU2VjdGlvblRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFNob3cgTW9yZSAvIFNob3cgTGVzcyBSZW5kZXJlclxuXG5pbnRlcmZhY2UgSUFnZW50U2Vzc2lvblNob3dNb3JlVGVtcGxhdGUge1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBsYWJlbDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50U2Vzc2lvblNob3dNb3JlUmVuZGVyZXJPcHRpb25zIHtcblx0cmVhZG9ubHkgY29tcGFjdExhYmVsPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIEFnZW50U2Vzc2lvblNob3dNb3JlUmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPElBZ2VudFNlc3Npb25TaG93TW9yZSwgRnV6enlTY29yZSwgSUFnZW50U2Vzc2lvblNob3dNb3JlVGVtcGxhdGU+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnYWdlbnQtc2Vzc2lvbi1zaG93LW1vcmUnO1xuXHRzdGF0aWMgcmVhZG9ubHkgSEVJR0hUID0gMjY7XG5cdHN0YXRpYyByZWFkb25seSBDT0xMQVBTRURfSEVJR0hUID0gMTtcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gQWdlbnRTZXNzaW9uU2hvd01vcmVSZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM/OiBJQWdlbnRTZXNzaW9uU2hvd01vcmVSZW5kZXJlck9wdGlvbnMpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJQWdlbnRTZXNzaW9uU2hvd01vcmVUZW1wbGF0ZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBlbGVtZW50cyA9IGgoXG5cdFx0XHQnZGl2LmFnZW50LXNlc3Npb24tc2hvdy1tb3JlQGNvbnRhaW5lcicsXG5cdFx0XHRbaCgnc3Bhbi5hZ2VudC1zZXNzaW9uLXNob3ctbW9yZS1sYWJlbEBsYWJlbCcpXVxuXHRcdCk7XG5cblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZWxlbWVudHMuY29udGFpbmVyKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb250YWluZXI6IGVsZW1lbnRzLmNvbnRhaW5lcixcblx0XHRcdGxhYmVsOiBlbGVtZW50cy5sYWJlbCxcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxJQWdlbnRTZXNzaW9uU2hvd01vcmUsIEZ1enp5U2NvcmU+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGU6IElBZ2VudFNlc3Npb25TaG93TW9yZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUubGFiZWwudGV4dENvbnRlbnQgPSB0aGlzLm9wdGlvbnM/LmNvbXBhY3RMYWJlbFxuXHRcdFx0PyBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9ucy5zaG93TW9yZUNvbXBhY3QnLCBcIit7MH0gbW9yZVwiLCBlbGVtZW50LmVsZW1lbnQucmVtYWluaW5nQ291bnQpXG5cdFx0XHQ6IGxvY2FsaXplKCdhZ2VudFNlc3Npb25zLnNob3dNb3JlJywgXCJTaG93IHswfSBNb3JlLi4uXCIsIGVsZW1lbnQuZWxlbWVudC5yZW1haW5pbmdDb3VudCk7XG5cdFx0dGVtcGxhdGUuY29udGFpbmVyLnNldEF0dHJpYnV0ZSgnZGF0YS1zZWN0aW9uLWxhYmVsJywgZWxlbWVudC5lbGVtZW50LnNlY3Rpb25MYWJlbCk7XG5cdH1cblxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMoKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdTaG91bGQgbmV2ZXIgaGFwcGVuIHNpbmNlIHNob3ctbW9yZSBpcyBpbmNvbXByZXNzaWJsZScpO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQoKTogdm9pZCB7IH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJQWdlbnRTZXNzaW9uU2hvd01vcmVUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEFnZW50U2Vzc2lvblNob3dMZXNzUmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPElBZ2VudFNlc3Npb25TaG93TGVzcywgRnV6enlTY29yZSwgSUFnZW50U2Vzc2lvblNob3dNb3JlVGVtcGxhdGU+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnYWdlbnQtc2Vzc2lvbi1zaG93LWxlc3MnO1xuXHRzdGF0aWMgcmVhZG9ubHkgSEVJR0hUID0gQWdlbnRTZXNzaW9uU2hvd01vcmVSZW5kZXJlci5IRUlHSFQ7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9IEFnZW50U2Vzc2lvblNob3dMZXNzUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElBZ2VudFNlc3Npb25TaG93TW9yZVRlbXBsYXRlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGVsZW1lbnRzID0gaChcblx0XHRcdCdkaXYuYWdlbnQtc2Vzc2lvbi1zaG93LW1vcmVAY29udGFpbmVyJyxcblx0XHRcdFtoKCdzcGFuLmFnZW50LXNlc3Npb24tc2hvdy1tb3JlLWxhYmVsQGxhYmVsJyldXG5cdFx0KTtcblxuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChlbGVtZW50cy5jb250YWluZXIpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRhaW5lcjogZWxlbWVudHMuY29udGFpbmVyLFxuXHRcdFx0bGFiZWw6IGVsZW1lbnRzLmxhYmVsLFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0fTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPElBZ2VudFNlc3Npb25TaG93TGVzcywgRnV6enlTY29yZT4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZTogSUFnZW50U2Vzc2lvblNob3dNb3JlVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZS5sYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdhZ2VudFNlc3Npb25zLnNob3dMZXNzJywgXCJTaG93IGxlc3NcIik7XG5cdFx0dGVtcGxhdGUuY29udGFpbmVyLnNldEF0dHJpYnV0ZSgnZGF0YS1zZWN0aW9uLWxhYmVsJywgZWxlbWVudC5lbGVtZW50LnNlY3Rpb25MYWJlbCk7XG5cdH1cblxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMoKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdTaG91bGQgbmV2ZXIgaGFwcGVuIHNpbmNlIHNob3ctbGVzcyBpcyBpbmNvbXByZXNzaWJsZScpO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQoKTogdm9pZCB7IH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJQWdlbnRTZXNzaW9uU2hvd01vcmVUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbmV4cG9ydCBjbGFzcyBBZ2VudFNlc3Npb25zTGlzdERlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8QWdlbnRTZXNzaW9uTGlzdEl0ZW0+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSVRFTV9IRUlHSFQgPSA1NDtcblx0c3RhdGljIHJlYWRvbmx5IENPTVBBQ1RfSVRFTV9IRUlHSFQgPSA1Mjtcblx0c3RhdGljIHJlYWRvbmx5IFNFQ1RJT05fSEVJR0hUID0gMjY7XG5cdHN0YXRpYyByZWFkb25seSBTUEFDRURfU0VDVElPTl9IRUlHSFQgPSAzMDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9hcHByb3ZhbE1vZGVsPzogQWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb21wYWN0U2hvd01vcmU/OiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldEl0ZW1IZWlnaHQ6ICgpID0+IG51bWJlciA9ICgpID0+IEFnZW50U2Vzc2lvbnNMaXN0RGVsZWdhdGUuSVRFTV9IRUlHSFQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2V0U2VjdGlvbkhlaWdodDogKCkgPT4gbnVtYmVyID0gKCkgPT4gQWdlbnRTZXNzaW9uc0xpc3REZWxlZ2F0ZS5TRUNUSU9OX0hFSUdIVCxcblx0KSB7IH1cblxuXHRnZXRIZWlnaHQoZWxlbWVudDogQWdlbnRTZXNzaW9uTGlzdEl0ZW0pOiBudW1iZXIge1xuXHRcdGlmIChpc0FnZW50U2Vzc2lvblNlY3Rpb24oZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9nZXRTZWN0aW9uSGVpZ2h0KCk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzQWdlbnRTZXNzaW9uU2hvd01vcmUoZWxlbWVudCkgfHwgaXNBZ2VudFNlc3Npb25TaG93TGVzcyhlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NvbXBhY3RTaG93TW9yZSA/IEFnZW50U2Vzc2lvblNob3dNb3JlUmVuZGVyZXIuQ09MTEFQU0VEX0hFSUdIVCA6IEFnZW50U2Vzc2lvblNob3dNb3JlUmVuZGVyZXIuSEVJR0hUO1xuXHRcdH1cblxuXHRcdGxldCBoZWlnaHQgPSB0aGlzLl9nZXRJdGVtSGVpZ2h0KCk7XG5cdFx0Y29uc3QgYXBwcm92YWwgPSB0aGlzLl9hcHByb3ZhbE1vZGVsPy5nZXRBcHByb3ZhbChlbGVtZW50LnJlc291cmNlKS5nZXQoKTtcblx0XHRpZiAoYXBwcm92YWwpIHtcblx0XHRcdGhlaWdodCArPSBBZ2VudFNlc3Npb25SZW5kZXJlci5nZXRBcHByb3ZhbFJvd0hlaWdodChhcHByb3ZhbC5sYWJlbCk7XG5cdFx0fVxuXHRcdHJldHVybiBoZWlnaHQ7XG5cdH1cblxuXHRoYXNEeW5hbWljSGVpZ2h0KGVsZW1lbnQ6IEFnZW50U2Vzc2lvbkxpc3RJdGVtKTogYm9vbGVhbiB7XG5cdFx0aWYgKGlzQWdlbnRTZXNzaW9uU2hvd01vcmUoZWxlbWVudCkgfHwgaXNBZ2VudFNlc3Npb25TaG93TGVzcyhlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiAhIXRoaXMuX2FwcHJvdmFsTW9kZWwgJiYgaXNBZ2VudFNlc3Npb24oZWxlbWVudCk7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IEFnZW50U2Vzc2lvbkxpc3RJdGVtKTogc3RyaW5nIHtcblx0XHRpZiAoaXNBZ2VudFNlc3Npb25TZWN0aW9uKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gQWdlbnRTZXNzaW9uU2VjdGlvblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHRcdH1cblxuXHRcdGlmIChpc0FnZW50U2Vzc2lvblNob3dNb3JlKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gQWdlbnRTZXNzaW9uU2hvd01vcmVSZW5kZXJlci5URU1QTEFURV9JRDtcblx0XHR9XG5cblx0XHRpZiAoaXNBZ2VudFNlc3Npb25TaG93TGVzcyhlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIEFnZW50U2Vzc2lvblNob3dMZXNzUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIEFnZW50U2Vzc2lvblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBZ2VudFNlc3Npb25zQWNjZXNzaWJpbGl0eVByb3ZpZGVyIGltcGxlbWVudHMgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8QWdlbnRTZXNzaW9uTGlzdEl0ZW0+IHtcblxuXHRnZXRXaWRnZXRSb2xlKCk6IEFyaWFSb2xlIHtcblx0XHRyZXR1cm4gJ2xpc3QnO1xuXHR9XG5cblx0Z2V0Um9sZShlbGVtZW50OiBBZ2VudFNlc3Npb25MaXN0SXRlbSk6IEFyaWFSb2xlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gJ2xpc3RpdGVtJztcblx0fVxuXG5cdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9ucycsIFwiQWdlbnQgU2Vzc2lvbnNcIik7XG5cdH1cblxuXHRnZXRBcmlhTGFiZWwoZWxlbWVudDogQWdlbnRTZXNzaW9uTGlzdEl0ZW0pOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAoaXNBZ2VudFNlc3Npb25TZWN0aW9uKGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBjb3VudCA9IGVsZW1lbnQuc2Vzc2lvbnMubGVuZ3RoO1xuXHRcdFx0aWYgKGNvdW50ID09PSAxKSB7XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9uU2VjdGlvbkFyaWFMYWJlbC5zaW5ndWxhcicsIFwiezB9IHNlc3Npb25zIHNlY3Rpb24sIHsxfSBzZXNzaW9uXCIsIGVsZW1lbnQubGFiZWwsIGNvdW50KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9uU2VjdGlvbkFyaWFMYWJlbC5wbHVyYWwnLCBcInswfSBzZXNzaW9ucyBzZWN0aW9uLCB7MX0gc2Vzc2lvbnNcIiwgZWxlbWVudC5sYWJlbCwgY291bnQpO1xuXHRcdH1cblxuXHRcdGlmIChpc0FnZW50U2Vzc2lvblNob3dNb3JlKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FnZW50U2Vzc2lvblNob3dNb3JlQXJpYUxhYmVsJywgXCJTaG93IHswfSBtb3JlIHNlc3Npb25zXCIsIGVsZW1lbnQucmVtYWluaW5nQ291bnQpO1xuXHRcdH1cblxuXHRcdGlmIChpc0FnZW50U2Vzc2lvblNob3dMZXNzKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FnZW50U2Vzc2lvblNob3dMZXNzQXJpYUxhYmVsJywgXCJTaG93IGxlc3Mgc2Vzc2lvbnNcIik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxvY2FsaXplKCdhZ2VudFNlc3Npb25JdGVtQXJpYUxhYmVsJywgXCJ7MH0gc2Vzc2lvbiB7MX0gKHsyfSksIGNyZWF0ZWQgezN9XCIsIGVsZW1lbnQucHJvdmlkZXJMYWJlbCwgZWxlbWVudC5sYWJlbCwgdG9TdGF0dXNMYWJlbChlbGVtZW50LnN0YXR1cyksIG5ldyBEYXRlKGVsZW1lbnQudGltaW5nLmNyZWF0ZWQpLnRvTG9jYWxlU3RyaW5nKCkpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50U2Vzc2lvbnNGaWx0ZXJFeGNsdWRlcyB7XG5cdHJlYWRvbmx5IHByb3ZpZGVyczogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IHN0YXRlczogcmVhZG9ubHkgQWdlbnRTZXNzaW9uU3RhdHVzW107XG5cblx0cmVhZG9ubHkgYXJjaGl2ZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHJlYWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHJlcG9zaXRvcnlHcm91cENhcHBlZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRTZXNzaW9uc0ZpbHRlciB7XG5cblx0LyoqXG5cdCAqIEFuIGV2ZW50IHRoYXQgZmlyZXMgd2hlbiB0aGUgZmlsdGVyIGNoYW5nZXMgYW5kIHNlc3Npb25zXG5cdCAqIHNob3VsZCBiZSByZS1ldmFsdWF0ZWQuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD47XG5cblx0LyoqXG5cdCAqIE9wdGlvbmFsIGxpbWl0IG9uIHRoZSBudW1iZXIgb2Ygc2Vzc2lvbnMgdG8gc2hvdy5cblx0ICovXG5cdHJlYWRvbmx5IGxpbWl0UmVzdWx0cz86ICgpID0+IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogV2hldGhlciB0byBzaG93IHNlY3Rpb24gaGVhZGVycyB0byBncm91cCBzZXNzaW9ucy5cblx0ICogV2hlbiB1bmRlZmluZWQsIHNlc3Npb25zIGFyZSBzaG93biBhcyBhIGZsYXQgbGlzdC5cblx0ICovXG5cdHJlYWRvbmx5IGdyb3VwUmVzdWx0cz86ICgpID0+IEFnZW50U2Vzc2lvbnNHcm91cGluZyB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogVGhlIGZpZWxkIHRvIHNvcnQgc2Vzc2lvbnMgYnkuXG5cdCAqIERlZmF1bHRzIHRvIGNyZWF0ZWQgZGF0ZSB3aGVuIHVuZGVmaW5lZC5cblx0ICovXG5cdHJlYWRvbmx5IHNvcnRSZXN1bHRzPzogKCkgPT4gQWdlbnRTZXNzaW9uc1NvcnRpbmcgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEEgY2FsbGJhY2sgdG8gbm90aWZ5IHRoZSBmaWx0ZXIgYWJvdXQgdGhlIG51bWJlciBvZlxuXHQgKiByZXN1bHRzIGFmdGVyIGZpbHRlcmluZy5cblx0ICovXG5cdG5vdGlmeVJlc3VsdHM/KGNvdW50OiBudW1iZXIpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBUaGUgbG9naWMgdG8gZXhjbHVkZSBzZXNzaW9ucyBmcm9tIHRoZSB2aWV3LlxuXHQgKi9cblx0ZXhjbHVkZShzZXNzaW9uOiBJQWdlbnRTZXNzaW9uKTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogR2V0IHRoZSBjdXJyZW50IGZpbHRlciBleGNsdWRlcyBmb3IgZGlzcGxheSBpbiB0aGUgVUkuXG5cdCAqL1xuXHRnZXRFeGNsdWRlcygpOiBJQWdlbnRTZXNzaW9uc0ZpbHRlckV4Y2x1ZGVzO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBmaWx0ZXIgaXMgYXQgaXRzIGRlZmF1bHQgc3RhdGUgKG5vIGN1c3RvbSBmaWx0ZXJzIGFwcGxpZWQpLlxuXHQgKi9cblx0aXNEZWZhdWx0KCk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFJlc2V0IHRoZSBmaWx0ZXIgdG8gaXRzIGRlZmF1bHQgc3RhdGUuXG5cdCAqL1xuXHRyZXNldCgpOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFzeW5jRGF0YVNvdXJjZTxJQWdlbnRTZXNzaW9uc01vZGVsLCBBZ2VudFNlc3Npb25MaXN0SXRlbT4ge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IENBUFBFRF9TRVNTSU9OU19MSU1JVCA9IDM7XG5cdHN0YXRpYyByZWFkb25seSBSRVBPU0lUT1JZX0dST1VQX0xJTUlUID0gNTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEdldENoaWxkcmVuID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0cmVhZG9ubHkgb25EaWRHZXRDaGlsZHJlbjogRXZlbnQ8bnVtYmVyPiA9IHRoaXMuX29uRGlkR2V0Q2hpbGRyZW4uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRFeHBhbmRSZXBvc2l0b3J5R3JvdXAgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRFeHBhbmRSZXBvc2l0b3J5R3JvdXA6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRFeHBhbmRSZXBvc2l0b3J5R3JvdXAuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBleHBhbmRlZFJlcG9zaXRvcnlHcm91cHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGZpbHRlcjogSUFnZW50U2Vzc2lvbnNGaWx0ZXIgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzb3J0ZXI6IElUcmVlU29ydGVyPElBZ2VudFNlc3Npb24+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmVwb3NpdG9yeUdyb3VwTGltaXQ/OiBudW1iZXIsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRpZiAodGhpcy5maWx0ZXIpIHtcblx0XHRcdGxldCBwcmV2aW91c0NhcHBlZCA9IHRoaXMuZmlsdGVyLmdldEV4Y2x1ZGVzKCkucmVwb3NpdG9yeUdyb3VwQ2FwcGVkO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWx0ZXIub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjdXJyZW50Q2FwcGVkID0gdGhpcy5maWx0ZXIhLmdldEV4Y2x1ZGVzKCkucmVwb3NpdG9yeUdyb3VwQ2FwcGVkO1xuXHRcdFx0XHQvLyBPbmx5IGNsZWFyIGV4cGFuZGVkIHN0YXRlIHdoZW4gY2FwcGluZyB0cmFuc2l0aW9ucyBmcm9tIG9mZiB0byBvblxuXHRcdFx0XHRpZiAoY3VycmVudENhcHBlZCAmJiAhcHJldmlvdXNDYXBwZWQpIHtcblx0XHRcdFx0XHR0aGlzLmV4cGFuZGVkUmVwb3NpdG9yeUdyb3Vwcy5jbGVhcigpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHByZXZpb3VzQ2FwcGVkID0gY3VycmVudENhcHBlZDtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRleHBhbmRSZXBvc2l0b3J5R3JvdXAoc2VjdGlvbkxhYmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmV4cGFuZGVkUmVwb3NpdG9yeUdyb3Vwcy5hZGQoc2VjdGlvbkxhYmVsKTtcblx0XHR0aGlzLl9vbkRpZEV4cGFuZFJlcG9zaXRvcnlHcm91cC5maXJlKCk7XG5cdH1cblxuXHRjb2xsYXBzZVJlcG9zaXRvcnlHcm91cChzZWN0aW9uTGFiZWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuZXhwYW5kZWRSZXBvc2l0b3J5R3JvdXBzLmRlbGV0ZShzZWN0aW9uTGFiZWwpO1xuXHRcdHRoaXMuX29uRGlkRXhwYW5kUmVwb3NpdG9yeUdyb3VwLmZpcmUoKTtcblx0fVxuXG5cdGhhc0NoaWxkcmVuKGVsZW1lbnQ6IElBZ2VudFNlc3Npb25zTW9kZWwgfCBBZ2VudFNlc3Npb25MaXN0SXRlbSk6IGJvb2xlYW4ge1xuXG5cdFx0Ly8gU2Vzc2lvbnMgbW9kZWxcblx0XHRpZiAoaXNBZ2VudFNlc3Npb25zTW9kZWwoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIFNlc3Npb25zXHRzZWN0aW9uXG5cdFx0ZWxzZSBpZiAoaXNBZ2VudFNlc3Npb25TZWN0aW9uKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5zZXNzaW9ucy5sZW5ndGggPiAwO1xuXHRcdH1cblxuXHRcdC8vIFNlc3Npb24gZWxlbWVudCBvciBzaG93IG1vcmVcblx0XHRlbHNlIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRnZXRDaGlsZHJlbihlbGVtZW50OiBJQWdlbnRTZXNzaW9uc01vZGVsIHwgQWdlbnRTZXNzaW9uTGlzdEl0ZW0pOiBJdGVyYWJsZTxBZ2VudFNlc3Npb25MaXN0SXRlbT4ge1xuXG5cdFx0Ly8gU2Vzc2lvbnMgbW9kZWxcblx0XHRpZiAoaXNBZ2VudFNlc3Npb25zTW9kZWwoZWxlbWVudCkpIHtcblxuXHRcdFx0Ly8gQXBwbHkgZmlsdGVyIGlmIGNvbmZpZ3VyZWRcblx0XHRcdGxldCBmaWx0ZXJlZFNlc3Npb25zID0gZWxlbWVudC5zZXNzaW9ucy5maWx0ZXIoc2Vzc2lvbiA9PiAhdGhpcy5maWx0ZXI/LmV4Y2x1ZGUoc2Vzc2lvbikpO1xuXG5cdFx0XHQvLyBBcHBseSBzb3J0ZXIgdW5sZXNzIHdlIGdyb3VwIGludG8gc2VjdGlvbnMgb3Igd2UgYXJlIHRvIGxpbWl0IHJlc3VsdHNcblx0XHRcdGNvbnN0IGxpbWl0UmVzdWx0c0NvdW50ID0gdGhpcy5maWx0ZXI/LmxpbWl0UmVzdWx0cz8uKCk7XG5cdFx0XHRpZiAoIXRoaXMuZmlsdGVyPy5ncm91cFJlc3VsdHM/LigpIHx8IHR5cGVvZiBsaW1pdFJlc3VsdHNDb3VudCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0ZmlsdGVyZWRTZXNzaW9ucy5zb3J0KHRoaXMuc29ydGVyLmNvbXBhcmUuYmluZCh0aGlzLnNvcnRlcikpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBcHBseSBsaW1pdGVyIGlmIGNvbmZpZ3VyZWQgKHJlcXVpcmVzIHNvcnRpbmcpXG5cdFx0XHRpZiAodHlwZW9mIGxpbWl0UmVzdWx0c0NvdW50ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRmaWx0ZXJlZFNlc3Npb25zID0gZmlsdGVyZWRTZXNzaW9ucy5zbGljZSgwLCBsaW1pdFJlc3VsdHNDb3VudCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENhbGxiYWNrIHJlc3VsdHMgY291bnRcblx0XHRcdHRoaXMuZmlsdGVyPy5ub3RpZnlSZXN1bHRzPy4oZmlsdGVyZWRTZXNzaW9ucy5sZW5ndGgpO1xuXHRcdFx0dGhpcy5fb25EaWRHZXRDaGlsZHJlbi5maXJlKGZpbHRlcmVkU2Vzc2lvbnMubGVuZ3RoKTtcblxuXHRcdFx0Ly8gR3JvdXAgc2Vzc2lvbnMgaW50byBzZWN0aW9ucyBpZiBlbmFibGVkXG5cdFx0XHRpZiAodGhpcy5maWx0ZXI/Lmdyb3VwUmVzdWx0cz8uKCkpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZ3JvdXBTZXNzaW9uc0ludG9TZWN0aW9ucyhmaWx0ZXJlZFNlc3Npb25zKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT3RoZXJ3aXNlIHJldHVybiBmbGF0IHNvcnRlZCBsaXN0XG5cdFx0XHRyZXR1cm4gZmlsdGVyZWRTZXNzaW9ucztcblx0XHR9XG5cblx0XHQvLyBTZXNzaW9uc1x0c2VjdGlvblxuXHRcdGVsc2UgaWYgKGlzQWdlbnRTZXNzaW9uU2VjdGlvbihlbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgaXNDYXBwaW5nRW5hYmxlZCA9IHRoaXMucmVwb3NpdG9yeUdyb3VwTGltaXQgJiYgdGhpcy5maWx0ZXI/LmdldEV4Y2x1ZGVzKCkucmVwb3NpdG9yeUdyb3VwQ2FwcGVkO1xuXHRcdFx0aWYgKGlzQ2FwcGluZ0VuYWJsZWQgJiYgZWxlbWVudC5zZWN0aW9uID09PSBBZ2VudFNlc3Npb25TZWN0aW9uLlJlcG9zaXRvcnkgJiYgZWxlbWVudC5zZXNzaW9ucy5sZW5ndGggPiB0aGlzLnJlcG9zaXRvcnlHcm91cExpbWl0KSB7XG5cdFx0XHRcdGlmICghdGhpcy5leHBhbmRlZFJlcG9zaXRvcnlHcm91cHMuaGFzKGVsZW1lbnQubGFiZWwpKSB7XG5cdFx0XHRcdFx0Ly8gQ29sbGFwc2VkOiBzaG93IGxpbWl0ZWQgc2Vzc2lvbnMgKyBcInNob3cgbW9yZVwiXG5cdFx0XHRcdFx0Y29uc3QgdmlzaWJsZSA9IGVsZW1lbnQuc2Vzc2lvbnMuc2xpY2UoMCwgdGhpcy5yZXBvc2l0b3J5R3JvdXBMaW1pdCk7XG5cdFx0XHRcdFx0Y29uc3QgcmVtYWluaW5nQ291bnQgPSBlbGVtZW50LnNlc3Npb25zLmxlbmd0aCAtIHRoaXMucmVwb3NpdG9yeUdyb3VwTGltaXQ7XG5cdFx0XHRcdFx0cmV0dXJuIFsuLi52aXNpYmxlLCB7IHNob3dNb3JlOiB0cnVlIGFzIGNvbnN0LCBzZWN0aW9uTGFiZWw6IGVsZW1lbnQubGFiZWwsIHJlbWFpbmluZ0NvdW50IH1dO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIEV4cGFuZGVkOiBzaG93IGFsbCBzZXNzaW9ucyArIFwic2hvdyBsZXNzXCJcblx0XHRcdFx0XHRyZXR1cm4gWy4uLmVsZW1lbnQuc2Vzc2lvbnMsIHsgc2hvd0xlc3M6IHRydWUgYXMgY29uc3QsIHNlY3Rpb25MYWJlbDogZWxlbWVudC5sYWJlbCB9XTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGVsZW1lbnQuc2Vzc2lvbnM7XG5cdFx0fVxuXG5cdFx0Ly8gU2Vzc2lvbiBlbGVtZW50IG9yIHNob3cgbW9yZVxuXHRcdGVsc2Uge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ3JvdXBTZXNzaW9uc0ludG9TZWN0aW9ucyhzZXNzaW9uczogSUFnZW50U2Vzc2lvbltdKTogQWdlbnRTZXNzaW9uTGlzdEl0ZW1bXSB7XG5cdFx0Y29uc3QgaXNDYXBwZWQgPSB0aGlzLmZpbHRlcj8uZ3JvdXBSZXN1bHRzPy4oKSA9PT0gQWdlbnRTZXNzaW9uc0dyb3VwaW5nLkNhcHBlZDtcblxuXHRcdGNvbnN0IHNvcnRlciA9IHRoaXMuc29ydGVyO1xuXHRcdGNvbnN0IHNvcnRlZFNlc3Npb25zID0gc29ydGVyIGluc3RhbmNlb2YgQWdlbnRTZXNzaW9uc1NvcnRlclxuXHRcdFx0PyBzZXNzaW9ucy5zb3J0KChhLCBiKSA9PiBzb3J0ZXIuY29tcGFyZShhLCBiLCB0cnVlIC8qIHByaW9yaXRpemUgYWN0aXZlIHNlc3Npb25zIHRvIGtlZXAgaW4tcHJvZ3Jlc3MvbmVlZHMtaW5wdXQgb25lcyB0b3Agd2l0aGluIGVhY2ggZ3JvdXAgKi8pKVxuXHRcdFx0OiBzZXNzaW9ucy5zb3J0KHNvcnRlci5jb21wYXJlLmJpbmQoc29ydGVyKSk7XG5cblx0XHRpZiAoaXNDYXBwZWQpIHtcblx0XHRcdGlmICh0aGlzLmZpbHRlcj8uZ2V0RXhjbHVkZXMoKS5yZWFkKSB7XG5cdFx0XHRcdHJldHVybiBzb3J0ZWRTZXNzaW9uczsgLy8gV2hlbiBmaWx0ZXJpbmcgdG8gc2hvdyBvbmx5IHVucmVhZCBzZXNzaW9ucywgc2hvdyBhIGZsYXQgbGlzdFxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5ncm91cFNlc3Npb25zQ2FwcGVkKHNvcnRlZFNlc3Npb25zKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuZmlsdGVyPy5ncm91cFJlc3VsdHM/LigpID09PSBBZ2VudFNlc3Npb25zR3JvdXBpbmcuUmVwb3NpdG9yeSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ3JvdXBTZXNzaW9uc0J5UmVwb3NpdG9yeShzb3J0ZWRTZXNzaW9ucyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLmdyb3VwU2Vzc2lvbnNCeURhdGUoc29ydGVkU2Vzc2lvbnMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ3JvdXBTZXNzaW9uc0NhcHBlZChzb3J0ZWRTZXNzaW9uczogSUFnZW50U2Vzc2lvbltdKTogQWdlbnRTZXNzaW9uTGlzdEl0ZW1bXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBBZ2VudFNlc3Npb25MaXN0SXRlbVtdID0gW107XG5cblx0XHRjb25zdCBmaXJzdEFyY2hpdmVkSW5kZXggPSBzb3J0ZWRTZXNzaW9ucy5maW5kSW5kZXgoc2Vzc2lvbiA9PiBzZXNzaW9uLmlzQXJjaGl2ZWQoKSk7XG5cdFx0Y29uc3Qgbm9uQXJjaGl2ZWRDb3VudCA9IGZpcnN0QXJjaGl2ZWRJbmRleCA9PT0gLTEgPyBzb3J0ZWRTZXNzaW9ucy5sZW5ndGggOiBmaXJzdEFyY2hpdmVkSW5kZXg7XG5cdFx0Y29uc3Qgbm9uQXJjaGl2ZWRTZXNzaW9ucyA9IHNvcnRlZFNlc3Npb25zLnNsaWNlKDAsIG5vbkFyY2hpdmVkQ291bnQpO1xuXHRcdGNvbnN0IGFyY2hpdmVkU2Vzc2lvbnMgPSBzb3J0ZWRTZXNzaW9ucy5zbGljZShub25BcmNoaXZlZENvdW50KTtcblxuXHRcdC8vIEFsbCBwaW5uZWQgc2Vzc2lvbnMgYXJlIGFsd2F5cyB2aXNpYmxlXG5cdFx0Y29uc3QgcGlubmVkU2Vzc2lvbnMgPSBub25BcmNoaXZlZFNlc3Npb25zLmZpbHRlcihzZXNzaW9uID0+IHNlc3Npb24uaXNQaW5uZWQoKSk7XG5cdFx0Y29uc3QgdW5waW5uZWRTZXNzaW9ucyA9IG5vbkFyY2hpdmVkU2Vzc2lvbnMuZmlsdGVyKHNlc3Npb24gPT4gIXNlc3Npb24uaXNQaW5uZWQoKSk7XG5cblx0XHQvLyBUYWtlIHVwIHRvIE4gbm9uLXBpbm5lZCBzZXNzaW9ucyBmcm9tIHRoZSBzb3J0ZWQgb3JkZXIgKHByZXNlcnZlcyBOZWVkc0lucHV0IHByaW9yaXRpemF0aW9uKVxuXHRcdGNvbnN0IHRvcFVucGlubmVkID0gdW5waW5uZWRTZXNzaW9ucy5zbGljZSgwLCBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZS5DQVBQRURfU0VTU0lPTlNfTElNSVQpO1xuXHRcdGNvbnN0IHJlbWFpbmluZ1VucGlubmVkID0gdW5waW5uZWRTZXNzaW9ucy5zbGljZShBZ2VudFNlc3Npb25zRGF0YVNvdXJjZS5DQVBQRURfU0VTU0lPTlNfTElNSVQpO1xuXG5cdFx0Ly8gQWRkIHBpbm5lZCBmaXJzdCwgdGhlbiB0b3AgTiBub24tcGlubmVkXG5cdFx0cmVzdWx0LnB1c2goLi4ucGlubmVkU2Vzc2lvbnMsIC4uLnRvcFVucGlubmVkKTtcblxuXHRcdC8vIEFkZCBcIk1vcmVcIiBzZWN0aW9uIGZvciB0aGUgcmVzdCAocmVtYWluaW5nIHVucGlubmVkICsgYXJjaGl2ZWQpXG5cdFx0Y29uc3Qgb3RoZXJzU2Vzc2lvbnMgPSBbLi4ucmVtYWluaW5nVW5waW5uZWQsIC4uLmFyY2hpdmVkU2Vzc2lvbnNdO1xuXHRcdGlmIChvdGhlcnNTZXNzaW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdHNlY3Rpb246IEFnZW50U2Vzc2lvblNlY3Rpb24uTW9yZSxcblx0XHRcdFx0bGFiZWw6IEFnZW50U2Vzc2lvblNlY3Rpb25MYWJlbHNbQWdlbnRTZXNzaW9uU2VjdGlvbi5Nb3JlXSxcblx0XHRcdFx0c2Vzc2lvbnM6IG90aGVyc1Nlc3Npb25zXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBncm91cFNlc3Npb25zQnlEYXRlKHNvcnRlZFNlc3Npb25zOiBJQWdlbnRTZXNzaW9uW10pOiBBZ2VudFNlc3Npb25MaXN0SXRlbVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IEFnZW50U2Vzc2lvbkxpc3RJdGVtW10gPSBbXTtcblx0XHRjb25zdCBzb3J0QnkgPSB0aGlzLmZpbHRlcj8uc29ydFJlc3VsdHM/LigpO1xuXHRcdGNvbnN0IGdyb3VwZWRTZXNzaW9ucyA9IGdyb3VwQWdlbnRTZXNzaW9uc0J5RGF0ZShzb3J0ZWRTZXNzaW9ucywgc29ydEJ5KTtcblxuXHRcdGZvciAoY29uc3QgeyBzZXNzaW9ucywgc2VjdGlvbiwgbGFiZWwgfSBvZiBncm91cGVkU2Vzc2lvbnMudmFsdWVzKCkpIHtcblx0XHRcdGlmIChzZXNzaW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHJlc3VsdC5wdXNoKHsgc2VjdGlvbiwgbGFiZWwsIHNlc3Npb25zIH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGdyb3VwU2Vzc2lvbnNCeVJlcG9zaXRvcnkoc29ydGVkU2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXSk6IEFnZW50U2Vzc2lvbkxpc3RJdGVtW10ge1xuXHRcdGNvbnN0IHJlcG9NYXAgPSBuZXcgTWFwPHN0cmluZywgeyBsYWJlbDogc3RyaW5nOyBzZXNzaW9uczogSUFnZW50U2Vzc2lvbltdIH0+KCk7XG5cdFx0Y29uc3QgcGlubmVkU2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXSA9IFtdO1xuXHRcdGNvbnN0IGFyY2hpdmVkU2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXSA9IFtdO1xuXHRcdGNvbnN0IG90aGVyU2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNvcnRlZFNlc3Npb25zKSB7XG5cdFx0XHRpZiAoc2Vzc2lvbi5pc0FyY2hpdmVkKCkpIHtcblx0XHRcdFx0YXJjaGl2ZWRTZXNzaW9ucy5wdXNoKHNlc3Npb24pO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHNlc3Npb24uaXNQaW5uZWQoKSkge1xuXHRcdFx0XHRwaW5uZWRTZXNzaW9ucy5wdXNoKHNlc3Npb24pO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVwb05hbWUgPSBnZXRSZXBvc2l0b3J5TmFtZShzZXNzaW9uKTtcblx0XHRcdGlmIChyZXBvTmFtZSkge1xuXHRcdFx0XHRsZXQgZ3JvdXAgPSByZXBvTWFwLmdldChyZXBvTmFtZSk7XG5cdFx0XHRcdGlmICghZ3JvdXApIHtcblx0XHRcdFx0XHRncm91cCA9IHsgbGFiZWw6IHJlcG9OYW1lLCBzZXNzaW9uczogW10gfTtcblx0XHRcdFx0XHRyZXBvTWFwLnNldChyZXBvTmFtZSwgZ3JvdXApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGdyb3VwLnNlc3Npb25zLnB1c2goc2Vzc2lvbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvdGhlclNlc3Npb25zLnB1c2goc2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBBZ2VudFNlc3Npb25MaXN0SXRlbVtdID0gW107XG5cblx0XHQvLyBQaW5uZWQgc2Vzc2lvbnMgYXJlIGFkZGVkIGRpcmVjdGx5IChubyBzZWN0aW9uIGhlYWRlcikgc28gdGhleVxuXHRcdC8vIGFwcGVhciBhdCB0aGUgdG9wIHdpdGhvdXQgYSBcIlBJTk5FRFwiIGdyb3VwIGxhYmVsLlxuXHRcdHJlc3VsdC5wdXNoKC4uLnBpbm5lZFNlc3Npb25zKTtcblxuXHRcdGNvbnN0IHNvcnRlZFJlcG9Hcm91cHMgPSBbLi4ucmVwb01hcC52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gY29tcGFyZUlnbm9yZUNhc2UoYS5sYWJlbCwgYi5sYWJlbCkpO1xuXG5cdFx0Zm9yIChjb25zdCB7IGxhYmVsLCBzZXNzaW9ucyB9IG9mIHNvcnRlZFJlcG9Hcm91cHMpIHtcblx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0c2VjdGlvbjogQWdlbnRTZXNzaW9uU2VjdGlvbi5SZXBvc2l0b3J5LFxuXHRcdFx0XHRsYWJlbCxcblx0XHRcdFx0c2Vzc2lvbnMsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAob3RoZXJTZXNzaW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdHNlY3Rpb246IEFnZW50U2Vzc2lvblNlY3Rpb24uUmVwb3NpdG9yeSxcblx0XHRcdFx0bGFiZWw6IEFnZW50U2Vzc2lvblNlY3Rpb25MYWJlbHNbQWdlbnRTZXNzaW9uU2VjdGlvbi5SZXBvc2l0b3J5XSxcblx0XHRcdFx0c2Vzc2lvbnM6IG90aGVyU2Vzc2lvbnMsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoYXJjaGl2ZWRTZXNzaW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdHNlY3Rpb246IEFnZW50U2Vzc2lvblNlY3Rpb24uQXJjaGl2ZWQsXG5cdFx0XHRcdGxhYmVsOiBBZ2VudFNlc3Npb25TZWN0aW9uTGFiZWxzW0FnZW50U2Vzc2lvblNlY3Rpb24uQXJjaGl2ZWRdLFxuXHRcdFx0XHRzZXNzaW9uczogYXJjaGl2ZWRTZXNzaW9ucyxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuLyoqXG4gKiBFeHRyYWN0cyB0aGUgcmVwb3NpdG9yeSBuYW1lIGZvciBhbiBhZ2VudCBzZXNzaW9uIGZyb20gaXRzIG1ldGFkYXRhIG9yIGJhZGdlLlxuICogVXNlZCBmb3IgZ3JvdXBpbmcgc2Vzc2lvbnMgYnkgcmVwb3NpdG9yeSBhbmQgZm9yIGRldGVybWluaW5nIHdoZXRoZXIgYSBiYWRnZVxuICogaXMgcmVkdW5kYW50IHdpdGggdGhlIHNlY3Rpb24gaGVhZGVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVwb3NpdG9yeU5hbWUoc2Vzc2lvbjogSUFnZW50U2Vzc2lvbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG1ldGFkYXRhID0gc2Vzc2lvbi5tZXRhZGF0YTtcblx0aWYgKG1ldGFkYXRhKSB7XG5cdFx0Ly8gUmVtb3RlIGFnZW50IGhvc3Qgc2Vzc2lvbnM6IGdyb3VwIGJ5IGZvbGRlciArIHJlbW90ZSBuYW1lIChlLmcuIFwibXlwcm9qZWN0IFtkZXYtYm94XVwiKVxuXHRcdGNvbnN0IHJlbW90ZUFnZW50SG9zdCA9IG1ldGFkYXRhLnJlbW90ZUFnZW50SG9zdCBhcyBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHJlbW90ZUFnZW50SG9zdCkge1xuXHRcdFx0Y29uc3Qgd29ya2luZ0RpciA9IG1ldGFkYXRhLndvcmtpbmdEaXJlY3RvcnlQYXRoIGFzIHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICh3b3JraW5nRGlyKSB7XG5cdFx0XHRcdGNvbnN0IGZvbGRlck5hbWUgPSBleHRyYWN0UmVwb05hbWVGcm9tUGF0aCh3b3JraW5nRGlyKTtcblx0XHRcdFx0aWYgKGZvbGRlck5hbWUpIHtcblx0XHRcdFx0XHRyZXR1cm4gYCR7Zm9sZGVyTmFtZX0gWyR7cmVtb3RlQWdlbnRIb3N0fV1gO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVtb3RlQWdlbnRIb3N0O1xuXHRcdH1cblxuXHRcdC8vIENsb3VkIHNlc3Npb25zOiBtZXRhZGF0YS5vd25lciArIG1ldGFkYXRhLm5hbWVcblx0XHRjb25zdCBvd25lciA9IG1ldGFkYXRhLm93bmVyIGFzIHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBuYW1lID0gbWV0YWRhdGEubmFtZSBhcyBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKG93bmVyICYmIG5hbWUpIHtcblx0XHRcdHJldHVybiBuYW1lO1xuXHRcdH1cblxuXHRcdC8vIHJlcG9zaXRvcnlOd286IFwib3duZXIvcmVwb1wiXG5cdFx0Y29uc3QgbndvID0gbWV0YWRhdGEucmVwb3NpdG9yeU53byBhcyBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKG53byAmJiBud28uaW5jbHVkZXMoJy8nKSkge1xuXHRcdFx0cmV0dXJuIG53by5zcGxpdCgnLycpLnBvcCgpITtcblx0XHR9XG5cblx0XHQvLyByZXBvc2l0b3J5OiBjb3VsZCBiZSBcIm93bmVyL3JlcG9cIiwgYSBVUkwsIG9yIGdpdEBob3N0Om93bmVyL3JlcG8uZ2l0XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IG1ldGFkYXRhLnJlcG9zaXRvcnkgYXMgc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChyZXBvc2l0b3J5KSB7XG5cdFx0XHRjb25zdCByZXBvTmFtZSA9IHBhcnNlUmVwb3NpdG9yeU5hbWUocmVwb3NpdG9yeSk7XG5cdFx0XHRpZiAocmVwb05hbWUpIHtcblx0XHRcdFx0cmV0dXJuIHJlcG9OYW1lO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHJlcG9zaXRvcnlVcmw6IFwiaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG9cIlxuXHRcdGNvbnN0IHJlcG9zaXRvcnlVcmwgPSBtZXRhZGF0YS5yZXBvc2l0b3J5VXJsIGFzIHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAocmVwb3NpdG9yeVVybCkge1xuXHRcdFx0Y29uc3QgcmVwb05hbWUgPSBwYXJzZVJlcG9zaXRvcnlOYW1lKHJlcG9zaXRvcnlVcmwpO1xuXHRcdFx0aWYgKHJlcG9OYW1lKSB7XG5cdFx0XHRcdHJldHVybiByZXBvTmFtZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyByZXBvc2l0b3J5UGF0aDogZXh0cmFjdCByZXBvIG5hbWUgZnJvbSB0aGUgZGlyZWN0b3J5IHBhdGggYmFzZW5hbWVcblx0XHRjb25zdCByZXBvc2l0b3J5UGF0aCA9IG1ldGFkYXRhLnJlcG9zaXRvcnlQYXRoIGFzIHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAocmVwb3NpdG9yeVBhdGgpIHtcblx0XHRcdGNvbnN0IHJlcG9OYW1lID0gZXh0cmFjdFJlcG9OYW1lRnJvbVBhdGgocmVwb3NpdG9yeVBhdGgpO1xuXHRcdFx0aWYgKHJlcG9OYW1lKSB7XG5cdFx0XHRcdHJldHVybiByZXBvTmFtZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyB3b3JrdHJlZVBhdGg6IGV4dHJhY3QgcmVwbyBuYW1lIGZyb20gdGhlIHdvcmt0cmVlIHBhdGhcblx0XHRjb25zdCB3b3JrdHJlZVBhdGggPSBtZXRhZGF0YS53b3JrdHJlZVBhdGggYXMgc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh3b3JrdHJlZVBhdGgpIHtcblx0XHRcdGNvbnN0IHJlcG9OYW1lID0gZXh0cmFjdFJlcG9OYW1lRnJvbVBhdGgod29ya3RyZWVQYXRoKTtcblx0XHRcdGlmIChyZXBvTmFtZSkge1xuXHRcdFx0XHRyZXR1cm4gcmVwb05hbWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gd29ya2luZ0RpcmVjdG9yeVBhdGg6IGZhbGxiYWNrIHRvIGV4dHJhY3QgbmFtZSBmcm9tIHRoZSB3b3JraW5nIGRpcmVjdG9yeVxuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnlQYXRoID0gbWV0YWRhdGEud29ya2luZ0RpcmVjdG9yeVBhdGggYXMgc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh3b3JraW5nRGlyZWN0b3J5UGF0aCkge1xuXHRcdFx0Y29uc3QgcmVwb05hbWUgPSBleHRyYWN0UmVwb05hbWVGcm9tUGF0aCh3b3JraW5nRGlyZWN0b3J5UGF0aCk7XG5cdFx0XHRpZiAocmVwb05hbWUpIHtcblx0XHRcdFx0cmV0dXJuIHJlcG9OYW1lO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIEZhbGxiYWNrOiBleHRyYWN0IHJlcG8vZm9sZGVyIG5hbWUgZnJvbSBiYWRnZVxuXHRjb25zdCBiYWRnZSA9IHNlc3Npb24uYmFkZ2U7XG5cdGlmIChiYWRnZSkge1xuXHRcdGNvbnN0IHJhdyA9IHR5cGVvZiBiYWRnZSA9PT0gJ3N0cmluZycgPyBiYWRnZSA6IGJhZGdlLnZhbHVlO1xuXHRcdGNvbnN0IGJhZGdlTWF0Y2ggPSByYXcubWF0Y2goL1xcJFxcKCg/OnJlcG98Zm9sZGVyfHdvcmt0cmVlKVxcKVxccyooLispLyk7XG5cdFx0aWYgKGJhZGdlTWF0Y2gpIHtcblx0XHRcdHJldHVybiBiYWRnZU1hdGNoWzFdLnRyaW0oKTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIFBhcnNlcyBhIHJlcG9zaXRvcnkgbmFtZSBmcm9tIHZhcmlvdXMgZm9ybWF0czogXCJvd25lci9yZXBvXCIsIFVSTHMsXG4gKiBhbmQgZ2l0QGhvc3Q6b3duZXIvcmVwby5naXQgc3R5bGUgcmVmZXJlbmNlcy5cbiAqL1xuZnVuY3Rpb24gcGFyc2VSZXBvc2l0b3J5TmFtZSh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Ly8gRGlyZWN0IFwib3duZXIvcmVwb1wiIHN0eWxlIChubyBzY2hlbWUsIG5vIGdpdEAgcHJlZml4KVxuXHRpZiAodmFsdWUuaW5jbHVkZXMoJy8nKSAmJiAhdmFsdWUuaW5jbHVkZXMoJzovLycpICYmICF2YWx1ZS5zdGFydHNXaXRoKCdnaXRAJykpIHtcblx0XHRsZXQgcmVwb1NlZ21lbnQgPSB2YWx1ZS5zcGxpdCgnLycpLmZpbHRlcihCb29sZWFuKS5wb3AoKTtcblx0XHRpZiAocmVwb1NlZ21lbnQ/LmVuZHNXaXRoKCcuZ2l0JykpIHtcblx0XHRcdHJlcG9TZWdtZW50ID0gcmVwb1NlZ21lbnQuc2xpY2UoMCwgLTQpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVwb1NlZ21lbnQgfHwgdW5kZWZpbmVkO1xuXHR9XG5cblx0Ly8gU3RhbmRhcmQgVVJMIGZvcm1hdHMgKGh0dHBzOi8vLi4uLCBzc2g6Ly8uLi4sIGV0Yy4pXG5cdHRyeSB7XG5cdFx0Y29uc3QgdXJsID0gbmV3IFVSTCh2YWx1ZSk7XG5cdFx0Y29uc3QgcGFydHMgPSB1cmwucGF0aG5hbWUuc3BsaXQoJy8nKS5maWx0ZXIoQm9vbGVhbik7XG5cdFx0aWYgKHBhcnRzLmxlbmd0aCA+PSAyKSB7XG5cdFx0XHRsZXQgcmVwb1NlZ21lbnQgPSBwYXJ0c1sxXTtcblx0XHRcdGlmIChyZXBvU2VnbWVudC5lbmRzV2l0aCgnLmdpdCcpKSB7XG5cdFx0XHRcdHJlcG9TZWdtZW50ID0gcmVwb1NlZ21lbnQuc2xpY2UoMCwgLTQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlcG9TZWdtZW50IHx8IHVuZGVmaW5lZDtcblx0XHR9XG5cdH0gY2F0Y2gge1xuXHRcdC8vIG5vdCBhIHN0YW5kYXJkIFVSTFxuXHR9XG5cblx0Ly8gZ2l0QGhvc3Q6b3duZXIvcmVwbyguZ2l0KSBzdHlsZSBVUkxzXG5cdGlmICh2YWx1ZS5zdGFydHNXaXRoKCdnaXRAJykpIHtcblx0XHRjb25zdCBjb2xvbkluZGV4ID0gdmFsdWUuaW5kZXhPZignOicpO1xuXHRcdGlmIChjb2xvbkluZGV4ICE9PSAtMSAmJiBjb2xvbkluZGV4IDwgdmFsdWUubGVuZ3RoIC0gMSkge1xuXHRcdFx0Y29uc3QgcGF0aFBhcnQgPSB2YWx1ZS5zdWJzdHJpbmcoY29sb25JbmRleCArIDEpO1xuXHRcdFx0bGV0IHJlcG9TZWdtZW50ID0gcGF0aFBhcnQuc3BsaXQoJy8nKS5maWx0ZXIoQm9vbGVhbikucG9wKCk7XG5cdFx0XHRpZiAocmVwb1NlZ21lbnQ/LmVuZHNXaXRoKCcuZ2l0JykpIHtcblx0XHRcdFx0cmVwb1NlZ21lbnQgPSByZXBvU2VnbWVudC5zbGljZSgwLCAtNCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVwb1NlZ21lbnQgfHwgdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogRXh0cmFjdHMgdGhlIHJlcG9zaXRvcnkgbmFtZSBmcm9tIGEgZmlsZXN5c3RlbSBwYXRoLCBoYW5kbGluZyBnaXQgd29ya3RyZWVcbiAqIGNvbnZlbnRpb25zIHdoZXJlIHBhdGhzIGZvbGxvdyBgPHJlcG8+Lndvcmt0cmVlcy88d29ya3RyZWUtbmFtZT5gLlxuICovXG5mdW5jdGlvbiBleHRyYWN0UmVwb05hbWVGcm9tUGF0aChkaXJQYXRoOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBzZWdtZW50cyA9IGRpclBhdGguc3BsaXQoL1svXFxcXF0vKS5maWx0ZXIoQm9vbGVhbik7XG5cdGlmIChzZWdtZW50cy5sZW5ndGggPCAyKSB7XG5cdFx0cmV0dXJuIHNlZ21lbnRzWzBdO1xuXHR9XG5cblx0Y29uc3QgcGFyZW50ID0gc2VnbWVudHNbc2VnbWVudHMubGVuZ3RoIC0gMl07XG5cdGlmIChwYXJlbnQuZW5kc1dpdGgoJy53b3JrdHJlZXMnKSkge1xuXHRcdHJldHVybiBwYXJlbnQuc2xpY2UoMCwgLScud29ya3RyZWVzJy5sZW5ndGgpIHx8IHVuZGVmaW5lZDtcblx0fVxuXG5cdHJldHVybiBzZWdtZW50c1tzZWdtZW50cy5sZW5ndGggLSAxXTtcbn1cblxuZXhwb3J0IGNvbnN0IEFnZW50U2Vzc2lvblNlY3Rpb25MYWJlbHMgPSB7XG5cdFtBZ2VudFNlc3Npb25TZWN0aW9uLlBpbm5lZF06IGxvY2FsaXplKCdhZ2VudFNlc3Npb25zLnBpbm5lZFNlY3Rpb24nLCBcIlBpbm5lZFwiKSxcblx0W0FnZW50U2Vzc2lvblNlY3Rpb24uVG9kYXldOiBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9ucy50b2RheVNlY3Rpb24nLCBcIlRvZGF5XCIpLFxuXHRbQWdlbnRTZXNzaW9uU2VjdGlvbi5ZZXN0ZXJkYXldOiBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9ucy55ZXN0ZXJkYXlTZWN0aW9uJywgXCJZZXN0ZXJkYXlcIiksXG5cdFtBZ2VudFNlc3Npb25TZWN0aW9uLldlZWtdOiBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9ucy53ZWVrU2VjdGlvbicsIFwiTGFzdCA3IGRheXNcIiksXG5cdFtBZ2VudFNlc3Npb25TZWN0aW9uLk9sZGVyXTogbG9jYWxpemUoJ2FnZW50U2Vzc2lvbnMub2xkZXJTZWN0aW9uJywgXCJPbGRlclwiKSxcblx0W0FnZW50U2Vzc2lvblNlY3Rpb24uQXJjaGl2ZWRdOiBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9ucy5hcmNoaXZlZFNlY3Rpb24nLCBcIkFyY2hpdmVkXCIpLFxuXHRbQWdlbnRTZXNzaW9uU2VjdGlvbi5Nb3JlXTogbG9jYWxpemUoJ2FnZW50U2Vzc2lvbnMubW9yZVNlY3Rpb24nLCBcIk1vcmVcIiksXG5cdFtBZ2VudFNlc3Npb25TZWN0aW9uLlJlcG9zaXRvcnldOiBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9ucy5ub1JlcG9zaXRvcnknLCBcIk90aGVyXCIpLFxufTtcblxuY29uc3QgREFZX1RIUkVTSE9MRCA9IDI0ICogNjAgKiA2MCAqIDEwMDA7XG5jb25zdCBXRUVLX1RIUkVTSE9MRCA9IDcgKiBEQVlfVEhSRVNIT0xEO1xuXG5leHBvcnQgZnVuY3Rpb24gZ3JvdXBBZ2VudFNlc3Npb25zQnlEYXRlKHNlc3Npb25zOiBJQWdlbnRTZXNzaW9uW10sIHNvcnRCeT86IEFnZW50U2Vzc2lvbnNTb3J0aW5nKTogTWFwPEFnZW50U2Vzc2lvblNlY3Rpb24sIElBZ2VudFNlc3Npb25TZWN0aW9uPiB7XG5cdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdGNvbnN0IHN0YXJ0T2ZUb2RheSA9IG5ldyBEYXRlKG5vdykuc2V0SG91cnMoMCwgMCwgMCwgMCk7XG5cdGNvbnN0IHN0YXJ0T2ZZZXN0ZXJkYXkgPSBzdGFydE9mVG9kYXkgLSBEQVlfVEhSRVNIT0xEO1xuXHRjb25zdCB3ZWVrVGhyZXNob2xkID0gbm93IC0gV0VFS19USFJFU0hPTEQ7XG5cblx0Y29uc3QgcGlubmVkU2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXSA9IFtdO1xuXHRjb25zdCB0b2RheVNlc3Npb25zOiBJQWdlbnRTZXNzaW9uW10gPSBbXTtcblx0Y29uc3QgeWVzdGVyZGF5U2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXSA9IFtdO1xuXHRjb25zdCB3ZWVrU2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXSA9IFtdO1xuXHRjb25zdCBvbGRlclNlc3Npb25zOiBJQWdlbnRTZXNzaW9uW10gPSBbXTtcblx0Y29uc3QgYXJjaGl2ZWRTZXNzaW9uczogSUFnZW50U2Vzc2lvbltdID0gW107XG5cblx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0aWYgKHNlc3Npb24uaXNBcmNoaXZlZCgpKSB7XG5cdFx0XHRhcmNoaXZlZFNlc3Npb25zLnB1c2goc2Vzc2lvbik7XG5cdFx0fSBlbHNlIGlmIChzZXNzaW9uLmlzUGlubmVkKCkpIHtcblx0XHRcdHBpbm5lZFNlc3Npb25zLnB1c2goc2Vzc2lvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHNlc3Npb25UaW1lID0gc29ydEJ5ID09PSBBZ2VudFNlc3Npb25zU29ydGluZy5VcGRhdGVkXG5cdFx0XHRcdD8gc2Vzc2lvbi50aW1pbmcubGFzdFJlcXVlc3RFbmRlZCA/PyBzZXNzaW9uLnRpbWluZy5jcmVhdGVkXG5cdFx0XHRcdDogc2Vzc2lvbi50aW1pbmcuY3JlYXRlZDtcblx0XHRcdGlmIChzZXNzaW9uVGltZSA+PSBzdGFydE9mVG9kYXkpIHtcblx0XHRcdFx0dG9kYXlTZXNzaW9ucy5wdXNoKHNlc3Npb24pO1xuXHRcdFx0fSBlbHNlIGlmIChzZXNzaW9uVGltZSA+PSBzdGFydE9mWWVzdGVyZGF5KSB7XG5cdFx0XHRcdHllc3RlcmRheVNlc3Npb25zLnB1c2goc2Vzc2lvbik7XG5cdFx0XHR9IGVsc2UgaWYgKHNlc3Npb25UaW1lID49IHdlZWtUaHJlc2hvbGQpIHtcblx0XHRcdFx0d2Vla1Nlc3Npb25zLnB1c2goc2Vzc2lvbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvbGRlclNlc3Npb25zLnB1c2goc2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIG5ldyBNYXA8QWdlbnRTZXNzaW9uU2VjdGlvbiwgSUFnZW50U2Vzc2lvblNlY3Rpb24+KFtcblx0XHRbQWdlbnRTZXNzaW9uU2VjdGlvbi5QaW5uZWQsIHsgc2VjdGlvbjogQWdlbnRTZXNzaW9uU2VjdGlvbi5QaW5uZWQsIGxhYmVsOiBBZ2VudFNlc3Npb25TZWN0aW9uTGFiZWxzW0FnZW50U2Vzc2lvblNlY3Rpb24uUGlubmVkXSwgc2Vzc2lvbnM6IHBpbm5lZFNlc3Npb25zIH1dLFxuXHRcdFtBZ2VudFNlc3Npb25TZWN0aW9uLlRvZGF5LCB7IHNlY3Rpb246IEFnZW50U2Vzc2lvblNlY3Rpb24uVG9kYXksIGxhYmVsOiBBZ2VudFNlc3Npb25TZWN0aW9uTGFiZWxzW0FnZW50U2Vzc2lvblNlY3Rpb24uVG9kYXldLCBzZXNzaW9uczogdG9kYXlTZXNzaW9ucyB9XSxcblx0XHRbQWdlbnRTZXNzaW9uU2VjdGlvbi5ZZXN0ZXJkYXksIHsgc2VjdGlvbjogQWdlbnRTZXNzaW9uU2VjdGlvbi5ZZXN0ZXJkYXksIGxhYmVsOiBBZ2VudFNlc3Npb25TZWN0aW9uTGFiZWxzW0FnZW50U2Vzc2lvblNlY3Rpb24uWWVzdGVyZGF5XSwgc2Vzc2lvbnM6IHllc3RlcmRheVNlc3Npb25zIH1dLFxuXHRcdFtBZ2VudFNlc3Npb25TZWN0aW9uLldlZWssIHsgc2VjdGlvbjogQWdlbnRTZXNzaW9uU2VjdGlvbi5XZWVrLCBsYWJlbDogQWdlbnRTZXNzaW9uU2VjdGlvbkxhYmVsc1tBZ2VudFNlc3Npb25TZWN0aW9uLldlZWtdLCBzZXNzaW9uczogd2Vla1Nlc3Npb25zIH1dLFxuXHRcdFtBZ2VudFNlc3Npb25TZWN0aW9uLk9sZGVyLCB7IHNlY3Rpb246IEFnZW50U2Vzc2lvblNlY3Rpb24uT2xkZXIsIGxhYmVsOiBBZ2VudFNlc3Npb25TZWN0aW9uTGFiZWxzW0FnZW50U2Vzc2lvblNlY3Rpb24uT2xkZXJdLCBzZXNzaW9uczogb2xkZXJTZXNzaW9ucyB9XSxcblx0XHRbQWdlbnRTZXNzaW9uU2VjdGlvbi5BcmNoaXZlZCwgeyBzZWN0aW9uOiBBZ2VudFNlc3Npb25TZWN0aW9uLkFyY2hpdmVkLCBsYWJlbDogQWdlbnRTZXNzaW9uU2VjdGlvbkxhYmVsc1tBZ2VudFNlc3Npb25TZWN0aW9uLkFyY2hpdmVkXSwgc2Vzc2lvbnM6IGFyY2hpdmVkU2Vzc2lvbnMgfV0sXG5cdF0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2Vzc2lvbkRhdGVGcm9tTm93KHNlc3Npb25UaW1lOiBudW1iZXIsIGFwcGVuZEFnb0xhYmVsPzogYm9vbGVhbik6IHN0cmluZyB7XG5cdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdGNvbnN0IHN0YXJ0T2ZUb2RheSA9IG5ldyBEYXRlKG5vdykuc2V0SG91cnMoMCwgMCwgMCwgMCk7XG5cdGNvbnN0IHN0YXJ0T2ZZZXN0ZXJkYXkgPSBzdGFydE9mVG9kYXkgLSBEQVlfVEhSRVNIT0xEO1xuXHRjb25zdCBzdGFydE9mVHdvRGF5c0FnbyA9IHN0YXJ0T2ZZZXN0ZXJkYXkgLSBEQVlfVEhSRVNIT0xEO1xuXG5cdC8vIG91ciBncm91cGluZyBieSBkYXRlIHVzZXMgYWJzb2x1dGUgc3RhcnQgdGltZXMgZm9yIFwiVG9kYXlcIlxuXHQvLyBhbmQgXCJZZXN0ZXJkYXlcIiB3aGlsZSBgZnJvbU5vd2Agb25seSB3b3JrcyB3aXRoIGZ1bGwgMjRoXG5cdC8vIGFuZCA0OGggcmFuZ2VzIGZvciB0aGVzZS4gVG8gcHJldmVudCBhIGxhYmVsIGxpa2UgXCIxIGRheSBhZ29cIlxuXHQvLyB0byBzaG93IHVuZGVyIHRoZSBcIkxhc3QgNyBEYXlzXCIgc2VjdGlvbiwgd2UgZG8gYSBiaXQgb2Zcblx0Ly8gbm9ybWFsaXphdGlvbiBsb2dpYy5cblxuXHRpZiAoc2Vzc2lvblRpbWUgPCBzdGFydE9mVG9kYXkgJiYgc2Vzc2lvblRpbWUgPj0gc3RhcnRPZlllc3RlcmRheSkge1xuXHRcdHJldHVybiBhcHBlbmRBZ29MYWJlbFxuXHRcdFx0PyBsb2NhbGl6ZSgnZGF0ZS5mcm9tTm93LmRheXMuc2luZ3VsYXIuYWdvJywgJzEgZGF5IGFnbycpXG5cdFx0XHQ6IGxvY2FsaXplKCdkYXRlLmZyb21Ob3cuZGF5cy5zaW5ndWxhcicsICcxIGRheScpO1xuXHR9XG5cblx0aWYgKHNlc3Npb25UaW1lIDwgc3RhcnRPZlllc3RlcmRheSAmJiBzZXNzaW9uVGltZSA+PSBzdGFydE9mVHdvRGF5c0Fnbykge1xuXHRcdHJldHVybiBhcHBlbmRBZ29MYWJlbFxuXHRcdFx0PyBsb2NhbGl6ZSgnZGF0ZS5mcm9tTm93LmRheXMubXVsdGlwbGUuYWdvJywgJzIgZGF5cyBhZ28nKVxuXHRcdFx0OiBsb2NhbGl6ZSgnZGF0ZS5mcm9tTm93LmRheXMubXVsdGlwbGUnLCAnMiBkYXlzJyk7XG5cdH1cblxuXHRyZXR1cm4gZnJvbU5vdyhzZXNzaW9uVGltZSwgYXBwZW5kQWdvTGFiZWwpO1xufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRTZXNzaW9uc0lkZW50aXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJSWRlbnRpdHlQcm92aWRlcjxJQWdlbnRTZXNzaW9uc01vZGVsIHwgQWdlbnRTZXNzaW9uTGlzdEl0ZW0+IHtcblxuXHRnZXRJZChlbGVtZW50OiBJQWdlbnRTZXNzaW9uc01vZGVsIHwgQWdlbnRTZXNzaW9uTGlzdEl0ZW0pOiBzdHJpbmcge1xuXHRcdGlmIChpc0FnZW50U2Vzc2lvblNlY3Rpb24oZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBgc2VjdGlvbi0ke2VsZW1lbnQuc2VjdGlvbn0tJHtlbGVtZW50LmxhYmVsfWA7XG5cdFx0fVxuXG5cdFx0aWYgKGlzQWdlbnRTZXNzaW9uU2hvd01vcmUoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBgc2hvdy1tb3JlLSR7ZWxlbWVudC5zZWN0aW9uTGFiZWx9YDtcblx0XHR9XG5cblx0XHRpZiAoaXNBZ2VudFNlc3Npb25TaG93TGVzcyhlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGBzaG93LWxlc3MtJHtlbGVtZW50LnNlY3Rpb25MYWJlbH1gO1xuXHRcdH1cblxuXHRcdGlmIChpc0FnZW50U2Vzc2lvbihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gJ2FnZW50LXNlc3Npb25zLWlkJztcblx0fVxuXG5cdGdldEdyb3VwSWQoZWxlbWVudDogSUFnZW50U2Vzc2lvbnNNb2RlbCB8IEFnZW50U2Vzc2lvbkxpc3RJdGVtKTogbnVtYmVyIHwgTm90U2VsZWN0YWJsZUdyb3VwSWRUeXBlIHtcblx0XHRpZiAoaXNBZ2VudFNlc3Npb25TZWN0aW9uKGVsZW1lbnQpIHx8IGlzQWdlbnRTZXNzaW9uc01vZGVsKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gTm90U2VsZWN0YWJsZUdyb3VwSWQ7XG5cdFx0fVxuXHRcdHJldHVybiAxO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBZ2VudFNlc3Npb25zQ29tcHJlc3Npb25EZWxlZ2F0ZSBpbXBsZW1lbnRzIElUcmVlQ29tcHJlc3Npb25EZWxlZ2F0ZTxBZ2VudFNlc3Npb25MaXN0SXRlbT4ge1xuXG5cdGlzSW5jb21wcmVzc2libGUoZWxlbWVudDogQWdlbnRTZXNzaW9uTGlzdEl0ZW0pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRTZXNzaW9uc1NvcnRlciBpbXBsZW1lbnRzIElUcmVlU29ydGVyPElBZ2VudFNlc3Npb24+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGdldFNvcnRCeTogKCkgPT4gQWdlbnRTZXNzaW9uc1NvcnRpbmc7XG5cblx0Y29uc3RydWN0b3IoZ2V0U29ydEJ5PzogKCkgPT4gQWdlbnRTZXNzaW9uc1NvcnRpbmcpIHtcblx0XHR0aGlzLmdldFNvcnRCeSA9IGdldFNvcnRCeSA/PyAoKCkgPT4gQWdlbnRTZXNzaW9uc1NvcnRpbmcuQ3JlYXRlZCk7XG5cdH1cblxuXHRjb21wYXJlKHNlc3Npb25BOiBJQWdlbnRTZXNzaW9uLCBzZXNzaW9uQjogSUFnZW50U2Vzc2lvbiwgcHJpb3JpdGl6ZUFjdGl2ZVNlc3Npb25zID0gZmFsc2UpOiBudW1iZXIge1xuXG5cdFx0Ly8gU3BlY2lhbCBzb3J0aW5nIGlmIGVuYWJsZWRcblx0XHRpZiAocHJpb3JpdGl6ZUFjdGl2ZVNlc3Npb25zKSB7XG5cdFx0XHRjb25zdCBhTmVlZHNJbnB1dCA9IHNlc3Npb25BLnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQ7XG5cdFx0XHRjb25zdCBiTmVlZHNJbnB1dCA9IHNlc3Npb25CLnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQ7XG5cblx0XHRcdGlmIChhTmVlZHNJbnB1dCAmJiAhYk5lZWRzSW5wdXQpIHtcblx0XHRcdFx0cmV0dXJuIC0xOyAvLyBhIChuZWVkcyBpbnB1dCkgY29tZXMgYmVmb3JlIGIgKG90aGVyKVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFhTmVlZHNJbnB1dCAmJiBiTmVlZHNJbnB1dCkge1xuXHRcdFx0XHRyZXR1cm4gMTsgLy8gYSAob3RoZXIpIGNvbWVzIGFmdGVyIGIgKG5lZWRzIGlucHV0KVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFyY2hpdmVkXG5cdFx0Y29uc3QgYUFyY2hpdmVkID0gc2Vzc2lvbkEuaXNBcmNoaXZlZCgpO1xuXHRcdGNvbnN0IGJBcmNoaXZlZCA9IHNlc3Npb25CLmlzQXJjaGl2ZWQoKTtcblxuXHRcdGlmICghYUFyY2hpdmVkICYmIGJBcmNoaXZlZCkge1xuXHRcdFx0cmV0dXJuIC0xOyAvLyBhIChub24tYXJjaGl2ZWQpIGNvbWVzIGJlZm9yZSBiIChhcmNoaXZlZClcblx0XHR9XG5cdFx0aWYgKGFBcmNoaXZlZCAmJiAhYkFyY2hpdmVkKSB7XG5cdFx0XHRyZXR1cm4gMTsgLy8gYSAoYXJjaGl2ZWQpIGNvbWVzIGFmdGVyIGIgKG5vbi1hcmNoaXZlZClcblx0XHR9XG5cblx0XHQvLyBQaW5uZWQgKG5vbi1hcmNoaXZlZCBwaW5uZWQgc2Vzc2lvbnMgY29tZSBiZWZvcmUgbm9uLXBpbm5lZClcblx0XHRjb25zdCBhUGlubmVkID0gIWFBcmNoaXZlZCAmJiBzZXNzaW9uQS5pc1Bpbm5lZCgpO1xuXHRcdGNvbnN0IGJQaW5uZWQgPSAhYkFyY2hpdmVkICYmIHNlc3Npb25CLmlzUGlubmVkKCk7XG5cblx0XHRpZiAoYVBpbm5lZCAmJiAhYlBpbm5lZCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRpZiAoIWFQaW5uZWQgJiYgYlBpbm5lZCkge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fVxuXG5cdFx0Ly8gU29ydCBieSB0aW1lXG5cdFx0Y29uc3Qgc29ydEJ5ID0gdGhpcy5nZXRTb3J0QnkoKTtcblx0XHRjb25zdCB0aW1lQSA9IHNvcnRCeSA9PT0gQWdlbnRTZXNzaW9uc1NvcnRpbmcuVXBkYXRlZFxuXHRcdFx0PyAocHJpb3JpdGl6ZUFjdGl2ZVNlc3Npb25zXG5cdFx0XHRcdD8gc2Vzc2lvbkEudGltaW5nLmxhc3RSZXF1ZXN0U3RhcnRlZCA/PyBzZXNzaW9uQS50aW1pbmcuY3JlYXRlZFxuXHRcdFx0XHQ6IHNlc3Npb25BLnRpbWluZy5sYXN0UmVxdWVzdEVuZGVkID8/IHNlc3Npb25BLnRpbWluZy5jcmVhdGVkKVxuXHRcdFx0OiBzZXNzaW9uQS50aW1pbmcuY3JlYXRlZDtcblx0XHRjb25zdCB0aW1lQiA9IHNvcnRCeSA9PT0gQWdlbnRTZXNzaW9uc1NvcnRpbmcuVXBkYXRlZFxuXHRcdFx0PyAocHJpb3JpdGl6ZUFjdGl2ZVNlc3Npb25zXG5cdFx0XHRcdD8gc2Vzc2lvbkIudGltaW5nLmxhc3RSZXF1ZXN0U3RhcnRlZCA/PyBzZXNzaW9uQi50aW1pbmcuY3JlYXRlZFxuXHRcdFx0XHQ6IHNlc3Npb25CLnRpbWluZy5sYXN0UmVxdWVzdEVuZGVkID8/IHNlc3Npb25CLnRpbWluZy5jcmVhdGVkKVxuXHRcdFx0OiBzZXNzaW9uQi50aW1pbmcuY3JlYXRlZDtcblx0XHRyZXR1cm4gdGltZUIgLSB0aW1lQTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRTZXNzaW9uc0tleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjxBZ2VudFNlc3Npb25MaXN0SXRlbT4ge1xuXG5cdGdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsKGVsZW1lbnQ6IEFnZW50U2Vzc2lvbkxpc3RJdGVtKTogc3RyaW5nIHtcblx0XHRpZiAoaXNBZ2VudFNlc3Npb25TZWN0aW9uKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5sYWJlbDtcblx0XHR9XG5cblx0XHRpZiAoaXNBZ2VudFNlc3Npb25TaG93TW9yZShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuc2VjdGlvbkxhYmVsO1xuXHRcdH1cblxuXHRcdGlmIChpc0FnZW50U2Vzc2lvblNob3dMZXNzKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5zZWN0aW9uTGFiZWw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVsZW1lbnQubGFiZWw7XG5cdH1cblxuXHRnZXRDb21wcmVzc2VkTm9kZUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsKGVsZW1lbnRzOiBBZ2VudFNlc3Npb25MaXN0SXRlbVtdKTogeyB0b1N0cmluZygpOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gbm90IGVuYWJsZWRcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRTZXNzaW9uc0RyYWdBbmREcm9wIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUcmVlRHJhZ0FuZERyb3A8QWdlbnRTZXNzaW9uTGlzdEl0ZW0+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0b25EcmFnU3RhcnQoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZWxlbWVudHMgPSAoZGF0YS5nZXREYXRhKCkgYXMgQWdlbnRTZXNzaW9uTGlzdEl0ZW1bXSkuZmlsdGVyKGUgPT4gaXNBZ2VudFNlc3Npb24oZSkpO1xuXHRcdGNvbnN0IHVyaXMgPSBjb2FsZXNjZShlbGVtZW50cy5tYXAoZSA9PiBlLnJlc291cmNlKSk7XG5cdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBmaWxsRWRpdG9yc0RyYWdEYXRhKGFjY2Vzc29yLCB1cmlzLCBvcmlnaW5hbEV2ZW50KSk7XG5cdH1cblxuXHRnZXREcmFnVVJJKGVsZW1lbnQ6IEFnZW50U2Vzc2lvbkxpc3RJdGVtKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0aWYgKGlzQWdlbnRTZXNzaW9uU2VjdGlvbihlbGVtZW50KSB8fCBpc0FnZW50U2Vzc2lvblNob3dNb3JlKGVsZW1lbnQpIHx8IGlzQWdlbnRTZXNzaW9uU2hvd0xlc3MoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBudWxsOyAvLyBzZWN0aW9uIGhlYWRlcnMsIHNob3ctbW9yZSBhbmQgc2hvdy1sZXNzIGl0ZW1zIGFyZSBub3QgZHJhZ2dhYmxlXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVsZW1lbnQucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0fVxuXG5cdGdldERyYWdMYWJlbD8oZWxlbWVudHM6IEFnZW50U2Vzc2lvbkxpc3RJdGVtW10sIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBlbGVtZW50cy5maWx0ZXIoZSA9PiBpc0FnZW50U2Vzc2lvbihlKSk7XG5cdFx0aWYgKHNlc3Npb25zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIHNlc3Npb25zWzBdLmxhYmVsO1xuXHRcdH1cblxuXHRcdHJldHVybiBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9ucy5kcmFnTGFiZWwnLCBcInswfSBhZ2VudCBzZXNzaW9uc1wiLCBzZXNzaW9ucy5sZW5ndGgpO1xuXHR9XG5cblx0b25EcmFnT3ZlcihkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXRFbGVtZW50OiBBZ2VudFNlc3Npb25MaXN0SXRlbSB8IHVuZGVmaW5lZCwgdGFyZ2V0SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogYm9vbGVhbiB8IElUcmVlRHJhZ092ZXJSZWFjdGlvbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0ZHJvcChkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXRFbGVtZW50OiBBZ2VudFNlc3Npb25MaXN0SXRlbSB8IHVuZGVmaW5lZCwgdGFyZ2V0SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogdm9pZCB7IH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsV0FBVyxHQUFHLHFCQUFxQjtBQUM1QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFrRCw0QkFBc0Q7QUFPeEcsU0FBUyxZQUFZLGlCQUE4Qix5QkFBeUI7QUFDNUUsU0FBUyxxQkFBcUIsb0JBQW9CLHdCQUF3QixjQUFzSCxnQkFBZ0IsdUJBQXVCLHdCQUF3Qix3QkFBd0Isc0JBQXNCLGlDQUFpQztBQUM5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
