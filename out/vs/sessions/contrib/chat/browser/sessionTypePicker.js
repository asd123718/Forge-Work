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
import { Gesture, EventType as TouchEventType } from "../../../../base/browser/touch.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { localize } from "../../../../nls.js";
import { IActionWidgetService } from "../../../../platform/actionWidget/browser/actionWidget.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ActionListItemKind } from "../../../../platform/actionWidget/browser/actionList.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { ISessionsProvidersService } from "../../../services/sessions/browser/sessionsProvidersService.js";
import { autorun, observableValue } from "../../../../base/common/observable.js";
import { SessionStatus } from "../../../services/sessions/common/session.js";
import { Emitter } from "../../../../base/common/event.js";
import { isForgeAdvertisedSessionTypeId } from "../../../../platform/agentHost/common/forgeSessionTypes.js";
import { CODEX_AGENT_PROVIDER_ID } from "../../../../platform/agentHost/common/agent.js";
import { isEqual } from "../../../../base/common/resources.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IChatSessionsService } from "../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { ILanguageModelsService } from "../../../../workbench/contrib/chat/common/languageModels.js";
import { getSessionTypeAvailability, getSessionTypePickerAvailability, getSessionTypeUnavailableDescription, getSessionTypeUnavailableHover, SessionTypeAvailability } from "../../../../workbench/contrib/chat/browser/agentSessions/sessionTypeAvailability.js";
import { IChatEntitlementService } from "../../../../workbench/services/chat/common/chatEntitlementService.js";
import { markOnboardingTarget } from "../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js";
import { reportNewChatPickerClosed } from "./newChatPickerTelemetry.js";
import { SessionHarnessPickerVisibleContext } from "../../../common/contextkeys.js";
import { isAllowSignedOutWhenUsableEnabled } from "../../../browser/sessionsAuthGate.js";
const STORAGE_KEY_LAST_SESSION_TYPE = "sessions.userSelectedSessionType";
function pickEquals(a, b) {
  return a?.providerId === b?.providerId && a?.sessionTypeId === b?.sessionTypeId;
}
const DEFAULT_TELEMETRY_SOURCE = "NewChatSessionTypePicker";
let SessionTypePicker = class extends Disposable {
  constructor(_session, _options, actionWidgetService, sessionsManagementService, sessionsProvidersService, storageService, telemetryService, chatSessionsService, chatEntitlementService, languageModelsService, configurationService, contextKeyService) {
    super();
    this._session = _session;
    this._options = _options;
    this.actionWidgetService = actionWidgetService;
    this.sessionsManagementService = sessionsManagementService;
    this.sessionsProvidersService = sessionsProvidersService;
    this.storageService = storageService;
    this.telemetryService = telemetryService;
    this.chatSessionsService = chatSessionsService;
    this.chatEntitlementService = chatEntitlementService;
    this.languageModelsService = languageModelsService;
    this.configurationService = configurationService;
    this._onDidSelectSessionType = this._register(new Emitter());
    this.onDidSelectSessionType = this._onDidSelectSessionType.event;
    /**
     * Fires whenever the effective {@link selectedPick} changes for any reason:
     * an explicit user pick OR a recompute (e.g. a provider advertising its
     * session types late). Unlike {@link onDidSelectSessionType}, which only
     * covers explicit picks, this lets consumers that cache the pick stay in
     * sync when the displayed default shifts on its own.
     */
    this._onDidChangeSelectedPick = this._register(new Emitter());
    this.onDidChangeSelectedPick = this._onDidChangeSelectedPick.event;
    this._modelTargetChatSessionType = observableValue(this, void 0);
    this.modelTargetChatSessionType = this._modelTargetChatSessionType;
    /** Session types the active session's folder can be served by, across all providers. */
    this._folderSessionTypes = [];
    this._folderSourceWatch = this._register(new MutableDisposable());
    this._quickChatSourceWatch = this._register(new MutableDisposable());
    this._renderDisposables = this._register(new DisposableStore());
    this._visibleKey = SessionHarnessPickerVisibleContext.bindTo(contextKeyService);
    this._register(toDisposable(() => this._visibleKey.reset()));
    this._picked = this._readStoredPick();
    this._register(autorun((reader) => {
      this._session.read(reader);
      this._recompute();
    }));
    this._register(this.sessionsManagementService.onDidChangeSessionTypes(() => this._recompute()));
  }
  /**
   * Recompute the available session types and the displayed pick from the
   * current source (session or folder), then refresh the trigger label.
   * Invoked reactively when the session, folder, or advertised types change.
   */
  _recompute() {
    this._folderSessionTypes = this._resolveFolderSessionTypes();
    const previous = this._picked;
    this._picked = this._computeCurrentPick();
    const pick = this._picked;
    if (this._quickChatSource?.get() && pick && !pick.providerId) {
      const concrete = this._folderSessionTypes.find((type) => type.sessionType.id === pick.sessionTypeId);
      if (concrete) {
        this._picked = { providerId: concrete.providerId, sessionTypeId: concrete.sessionType.id };
      }
    }
    this._updateModelTargetChatSessionType();
    this._updateTriggerLabel();
    if (!pickEquals(previous, this._picked)) {
      this._onDidChangeSelectedPick.fire(this._picked);
    }
  }
  /**
   * The session types to offer, sourced from the folder when a folder source
   * is set (see {@link setFolderSource}), otherwise from the active session.
   */
  _resolveFolderSessionTypes() {
    if (this._folderSource) {
      if (this._quickChatSource?.get()) {
        return this.sessionsManagementService.getQuickChatSessionTypes();
      }
      const folderUri = this._folderSource.get();
      return folderUri ? this.sessionsManagementService.getSessionTypesForFolder(folderUri) : [];
    }
    const session = this._session.get();
    return session ? this._sessionTypesForSession(session) : [];
  }
  /** The pick to display for the current source: the active session's type, otherwise the folder or stored default. */
  _computeCurrentPick() {
    const session = this._session.get();
    if (!this._folderSource && session) {
      const pick = { providerId: session.providerId, sessionTypeId: session.sessionType };
      return session.status.get() === SessionStatus.Untitled ? this._offeredPick(pick) : pick;
    }
    if (!this._folderSource) {
      return this._offeredPick(this._readStoredPick());
    }
    if (this._pendingInitialPick) {
      if (this._pickServedByFolder(this._pendingInitialPick)) {
        const pick = this._pendingInitialPick;
        this._pendingInitialPick = void 0;
        return pick;
      }
      return this._pendingInitialPick;
    }
    const candidate = this._picked ?? this._readStoredPick();
    if (this._pickServedByFolder(candidate)) {
      return candidate;
    }
    const stored = this._readStoredPick();
    if (this._pickServedByFolder(stored)) {
      return stored;
    }
    const preferred = this._folderSessionTypes[0];
    return this._getPreferredCodexPick() ?? (preferred ? { providerId: preferred.providerId, sessionTypeId: preferred.sessionType.id } : void 0);
  }
  _pickServedByFolder(pick) {
    return !!pick && this._folderSessionTypes.some((t) => t.sessionType.id === pick.sessionTypeId && (pick.providerId === void 0 || t.providerId === pick.providerId));
  }
  /**
   * Constrains a pick to the types the picker actually offers, falling back to
   * the preferred (first) type when it doesn't. A remembered pick outlives the
   * harness that produced it: a session type can stop being advertised while
   * the stored preference still names it. Displaying it as selected while the
   * dropdown hides it would let the user start a session on a harness they can
   * no longer pick.
   *
   * An empty offer list means the types aren't known yet (no session or folder
   * to source them from, or a provider still connecting), so the pick is left
   * alone until something is actually offered.
   */
  _offeredPick(pick) {
    if (this._folderSessionTypes.length === 0 || this._pickServedByFolder(pick)) {
      return pick;
    }
    return this._getPreferredCodexPick() ?? (() => {
      const preferred = this._folderSessionTypes[0];
      return { providerId: preferred.providerId, sessionTypeId: preferred.sessionType.id };
    })();
  }
  /** Drive the picker from a folder instead of the active session, optionally seeding the initial pick. */
  setFolderSource(source, options) {
    this._folderSource = source;
    this._picked = options?.initialPick ?? this._readStoredPick();
    this._pendingInitialPick = options?.preserveUnavailableInitialPick ? options.initialPick : void 0;
    const initialFolder = source.get();
    this._folderSourceWatch.value = autorun((reader) => {
      const folder = source.read(reader);
      if (!isEqual(folder, initialFolder)) {
        this._pendingInitialPick = void 0;
      }
      this._recompute();
    });
  }
  /** Switch a folder-driven picker to the quick-chat type catalog while the source is true. */
  setQuickChatSource(source) {
    this._quickChatSource = source;
    const initialQuickChat = source.get();
    this._quickChatSourceWatch.value = autorun((reader) => {
      const isQuickChat = source.read(reader);
      if (isQuickChat !== initialQuickChat) {
        this._pendingInitialPick = void 0;
      }
      this._recompute();
    });
  }
  get selectedPick() {
    return this._picked;
  }
  /**
   * The session types to offer for a session: all quick-chat types when the
   * session is a workspace-less quick chat, otherwise the folder's types.
   */
  _sessionTypesForSession(session) {
    if (session.isQuickChat?.get() ?? false) {
      return this.sessionsManagementService.getQuickChatSessionTypes();
    }
    const folderUri = session.workspace.get()?.folders[0]?.root;
    return folderUri ? this.sessionsManagementService.getSessionTypesForFolder(folderUri) : [];
  }
  /**
   * The session type the user explicitly picked, read from the stored
   * preference. Unlike {@link selectedPick}, this is independent of any
   * active session's type. Returns `undefined` when the user has never
   * picked a type (or changed away from the default), in which case
   * consumers should fall back to {@link getPreferredSessionType}.
   */
  getUserPickedSessionType() {
    return this._readStoredPick();
  }
  /**
   * The preferred session type for {@link folderUri}: the first entry in
   * the folder's session-type list. Recomputed against the live list, so
   * it follows provider changes (e.g. a late-registering agent host that
   * prepends a new type). Used as the default when the user has made no
   * explicit pick.
   */
  getPreferredSessionType(folderUri) {
    const first = this.sessionsManagementService.getSessionTypesForFolder(folderUri)[0];
    return first ? { providerId: first.providerId, sessionTypeId: first.sessionType.id } : void 0;
  }
  render(container, options) {
    this._renderDisposables.clear();
    const slot = dom.append(container, dom.$(".sessions-chat-picker-slot"));
    if (options?.className) {
      const classNames = options.className.split(/\s+/).filter((className) => className.length > 0);
      if (classNames.length > 0) {
        slot.classList.add(...classNames);
      }
    }
    this._renderDisposables.add({ dispose: () => slot.remove() });
    const trigger = dom.append(slot, dom.$("a.action-label"));
    trigger.tabIndex = 0;
    trigger.role = "button";
    this._triggerElement = trigger;
    this._renderDisposables.add(markOnboardingTarget(trigger, "sessions.newSession.harnessPicker", {
      open: () => this._showPicker()
    }));
    this._updateTriggerLabel();
    this._renderDisposables.add(Gesture.addTarget(trigger));
    for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
      this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, (e) => {
        dom.EventHelper.stop(e, true);
        this._showPicker();
      }));
    }
    this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        dom.EventHelper.stop(e, true);
        this._showPicker();
      }
    }));
  }
  /**
   * Override hook for mobile subclasses. Receives the trigger element so
   * the override can decide where to anchor (or that it doesn't need
   * anchoring at all, e.g. for a bottom sheet).
   */
  _showPicker() {
    if (!this._triggerElement || this.actionWidgetService.isVisible) {
      return;
    }
    const folderTypes = this._resolveFolderSessionTypes();
    this._folderSessionTypes = folderTypes;
    this._updateModelTargetChatSessionType();
    if (folderTypes.length <= 1 && this._pickServedByFolder(this._picked)) {
      return;
    }
    const groups = /* @__PURE__ */ new Map();
    for (const folderType of folderTypes) {
      const provider = this.sessionsProvidersService.getProvider(folderType.providerId);
      const groupTitle = provider?.label ?? folderType.providerId;
      const existing = groups.get(groupTitle);
      if (existing) {
        existing.push(folderType);
      } else {
        groups.set(groupTitle, [folderType]);
      }
    }
    const labelCounts = /* @__PURE__ */ new Map();
    for (const { sessionType } of folderTypes) {
      labelCounts.set(sessionType.label, (labelCounts.get(sessionType.label) ?? 0) + 1);
    }
    const hasDuplicateLabels = Array.from(labelCounts.values()).some((count) => count > 1);
    const showSectionHeaders = groups.size > 1 && hasDuplicateLabels;
    const groupedItems = [];
    for (const [groupTitle, types] of groups) {
      if (showSectionHeaders) {
        if (groupedItems.length > 0) {
          groupedItems.push({ kind: ActionListItemKind.Separator, label: "" });
        }
        groupedItems.push({
          kind: ActionListItemKind.Header,
          group: { title: groupTitle },
          label: groupTitle
        });
      }
      for (const { providerId, sessionType } of types) {
        const isCurrent = this._picked?.providerId === providerId && this._picked?.sessionTypeId === sessionType.id;
        const modelTarget = sessionType.chatSessionType ?? sessionType.id;
        const allowSignedOutWhenUsable = isAllowSignedOutWhenUsableEnabled(this.configurationService);
        const availability = getSessionTypePickerAvailability(
          modelTarget,
          getSessionTypeAvailability(this.chatSessionsService, this.chatEntitlementService, this.languageModelsService, modelTarget, allowSignedOutWhenUsable),
          allowSignedOutWhenUsable
        );
        const unavailable = availability !== SessionTypeAvailability.Available;
        const item = {
          providerId,
          sessionTypeId: sessionType.id,
          label: sessionType.label,
          ...isCurrent ? { checked: true } : {},
          ...showSectionHeaders ? { groupLabel: groupTitle } : {}
        };
        groupedItems.push({
          kind: ActionListItemKind.Action,
          label: sessionType.label,
          disabled: unavailable,
          ...unavailable ? {
            description: getSessionTypeUnavailableDescription(availability),
            hover: { content: getSessionTypeUnavailableHover(availability) }
          } : {},
          group: {
            title: "",
            icon: sessionType.icon
          },
          item
        });
      }
    }
    const triggerElement = this._triggerElement;
    const delegate = {
      onSelect: (item) => {
        this.actionWidgetService.hide();
        this._handleSelectedSessionType(item);
      },
      onHide: () => {
        triggerElement.focus();
      }
    };
    this.actionWidgetService.show(
      "sessionTypePicker",
      false,
      groupedItems,
      delegate,
      this._triggerElement,
      void 0,
      [],
      {
        getAriaLabel: (element) => element.item?.groupLabel ? localize("sessionTypePicker.itemAriaLabel", "{0}, {1}", element.label ?? "", element.item.groupLabel) : element.label ?? "",
        getWidgetAriaLabel: () => localize("sessionTypePicker.ariaLabel", "Session Type")
      },
      { minWidth: 200 }
    );
  }
  /**
   * Handles the user picking a session type. Emits `newChatPickerClosed`
   * telemetry (with the previously selected type read from storage, or the
   * in-memory field when nothing is stored). The explicit selection is always
   * persisted — picking the preferred (first) type clears the stored
   * preference, any other pick stores it — while {@link onDidSelectSessionType}
   * fires only when the visible pick actually changed.
   *
   * Shared between desktop (action-widget popup) and mobile (bottom
   * sheet) presentations so both surfaces report identical telemetry.
   */
  _handleSelectedSessionType(pick) {
    this._pendingInitialPick = void 0;
    const stored = this._readStoredPick();
    const beforeId = stored?.sessionTypeId ?? this._picked?.sessionTypeId;
    const beforeLabel = this._folderSessionTypes.find((t) => t.sessionType.id === beforeId)?.sessionType.label;
    const afterLabel = this._folderSessionTypes.find((t) => t.providerId === pick.providerId && t.sessionType.id === pick.sessionTypeId)?.sessionType.label;
    const telemetrySource = this._options?.telemetrySource ?? DEFAULT_TELEMETRY_SOURCE;
    reportNewChatPickerClosed(this.telemetryService, {
      id: telemetrySource,
      name: telemetrySource,
      optionIdBefore: beforeId,
      optionIdAfter: pick.sessionTypeId,
      optionLabelBefore: beforeLabel,
      optionLabelAfter: afterLabel,
      isPII: false
    });
    const preferred = this._folderSessionTypes[0];
    const isDefault = !!preferred && preferred.providerId === pick.providerId && preferred.sessionType.id === pick.sessionTypeId;
    const visiblePickChanged = pick.providerId !== this._picked?.providerId || pick.sessionTypeId !== this._picked?.sessionTypeId;
    this._picked = pick;
    this._updateModelTargetChatSessionType();
    if (this._options?.persistSelection !== false) {
      if (isDefault) {
        this._clearStoredPick();
      } else {
        this._writeStoredPick(pick);
      }
    }
    this._updateTriggerLabel();
    if (visiblePickChanged) {
      this._onDidSelectSessionType.fire(pick);
      this._onDidChangeSelectedPick.fire(this._picked);
    }
  }
  _updateModelTargetChatSessionType() {
    const pick = this._picked;
    const selected = pick ? this._folderSessionTypes.find(
      (type) => type.sessionType.id === pick.sessionTypeId && (pick.providerId === void 0 || type.providerId === pick.providerId)
    ) : void 0;
    this._modelTargetChatSessionType.set(selected ? selected.sessionType.chatSessionType ?? selected.sessionType.id : void 0, void 0);
  }
  _readStoredPick() {
    const raw = this.storageService.get(STORAGE_KEY_LAST_SESSION_TYPE, StorageScope.PROFILE);
    if (!raw) {
      return void 0;
    }
    let pick;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.sessionTypeId === "string") {
        pick = typeof parsed.providerId === "string" ? { providerId: parsed.providerId, sessionTypeId: parsed.sessionTypeId } : { sessionTypeId: parsed.sessionTypeId };
      }
    } catch {
    }
    if (!pick) {
      pick = { sessionTypeId: raw };
    }
    if (!isForgeAdvertisedSessionTypeId(pick.sessionTypeId)) {
      this._clearStoredPick();
      return void 0;
    }
    return pick;
  }
  _getPreferredCodexPick() {
    const codex = this._folderSessionTypes.find((type) => type.sessionType.id === CODEX_AGENT_PROVIDER_ID);
    return codex ? { providerId: codex.providerId, sessionTypeId: codex.sessionType.id } : void 0;
  }
  _writeStoredPick(pick) {
    const stored = { providerId: pick.providerId, sessionTypeId: pick.sessionTypeId };
    this.storageService.store(STORAGE_KEY_LAST_SESSION_TYPE, JSON.stringify(stored), StorageScope.PROFILE, StorageTarget.MACHINE);
  }
  /**
   * Forget any explicit preference (e.g. the user re-selected the default
   * type). The display still reflects the in-memory pick, but consumers
   * reading {@link getUserPickedSessionType} fall back to the preferred type.
   */
  _clearStoredPick() {
    this.storageService.remove(STORAGE_KEY_LAST_SESSION_TYPE, StorageScope.PROFILE);
  }
  _updateTriggerLabel() {
    if (!this._triggerElement) {
      this._visibleKey.set(false);
      return;
    }
    dom.clearNode(this._triggerElement);
    const hideForSingleHarness = this._folderSessionTypes.length <= 1 && this._pickServedByFolder(this._picked);
    if (this._folderSessionTypes.length === 0 || hideForSingleHarness) {
      this._triggerElement.classList.add("hidden");
      this._visibleKey.set(false);
      return;
    }
    this._triggerElement.classList.remove("hidden");
    this._visibleKey.set(true);
    const currentType = this._folderSessionTypes.find((t) => t.providerId === this._picked?.providerId && t.sessionType.id === this._picked?.sessionTypeId)?.sessionType ?? this._folderSessionTypes.find((t) => t.sessionType.id === this._picked?.sessionTypeId)?.sessionType;
    const modeIcon = currentType?.icon ?? Codicon.terminal;
    const modeLabel = currentType?.label ?? this._picked?.sessionTypeId ?? "";
    dom.append(this._triggerElement, renderIcon(modeIcon));
    const labelSpan = dom.append(this._triggerElement, dom.$("span.sessions-chat-dropdown-label"));
    labelSpan.textContent = modeLabel;
    if (this._options?.showChevron !== false) {
      const chevron = dom.append(this._triggerElement, renderIcon(Codicon.chevronDownCompact));
      chevron.classList.add("sessions-chat-dropdown-chevron");
    }
    this._triggerElement.ariaLabel = localize("sessionTypePicker.triggerAriaLabel", "Pick Session Type, {0}", modeLabel);
  }
};
SessionTypePicker = __decorateClass([
  __decorateParam(2, IActionWidgetService),
  __decorateParam(3, ISessionsManagementService),
  __decorateParam(4, ISessionsProvidersService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IChatSessionsService),
  __decorateParam(8, IChatEntitlementService),
  __decorateParam(9, ILanguageModelsService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IContextKeyService)
], SessionTypePicker);
export {
  SessionTypePicker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcYnJvd3Nlclxcc2Vzc2lvblR5cGVQaWNrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBHZXN0dXJlLCBFdmVudFR5cGUgYXMgVG91Y2hFdmVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyByZW5kZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQWN0aW9uTGlzdEl0ZW1LaW5kLCBJQWN0aW9uTGlzdERlbGVnYXRlLCBJQWN0aW9uTGlzdEl0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25MaXN0LmpzJztcbmltcG9ydCB7IElQcm92aWRlclNlc3Npb25UeXBlLCBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uLCBTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGlzRm9yZ2VBZHZlcnRpc2VkU2Vzc2lvblR5cGVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vZm9yZ2VTZXNzaW9uVHlwZXMuanMnO1xuaW1wb3J0IHsgQ09ERVhfQUdFTlRfUFJPVklERVJfSUQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgZ2V0U2Vzc2lvblR5cGVBdmFpbGFiaWxpdHksIGdldFNlc3Npb25UeXBlUGlja2VyQXZhaWxhYmlsaXR5LCBnZXRTZXNzaW9uVHlwZVVuYXZhaWxhYmxlRGVzY3JpcHRpb24sIGdldFNlc3Npb25UeXBlVW5hdmFpbGFibGVIb3ZlciwgU2Vzc2lvblR5cGVBdmFpbGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9zZXNzaW9uVHlwZUF2YWlsYWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IG1hcmtPbmJvYXJkaW5nVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvb25ib2FyZGluZy9icm93c2VyL3Nwb3RsaWdodC9vbmJvYXJkaW5nVGFyZ2V0LmpzJztcbmltcG9ydCB7IHJlcG9ydE5ld0NoYXRQaWNrZXJDbG9zZWQgfSBmcm9tICcuL25ld0NoYXRQaWNrZXJUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkhhcm5lc3NQaWNrZXJWaXNpYmxlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBpc0FsbG93U2lnbmVkT3V0V2hlblVzYWJsZUVuYWJsZWQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3Nlc3Npb25zQXV0aEdhdGUuanMnO1xuXG5jb25zdCBTVE9SQUdFX0tFWV9MQVNUX1NFU1NJT05fVFlQRSA9ICdzZXNzaW9ucy51c2VyU2VsZWN0ZWRTZXNzaW9uVHlwZSc7XG5cbi8qKlxuICogQSBwaWNrZWQgc2Vzc2lvbiB0eXBlLCBwYWlyZWQgd2l0aCB0aGUgcHJvdmlkZXIgdGhhdCBzZXJ2ZXMgaXQuIFR3b1xuICogcHJvdmlkZXJzIGNhbiBhZHZlcnRpc2UgdGhlIHNhbWUgc2Vzc2lvbiB0eXBlIGlkIChlLmcuIGJvdGggZXhwb3NlXG4gKiAnY29waWxvdC1jbGknKSwgc28gY2FsbGVycyBuZWVkIGJvdGggdG8gcm91dGUgc2Vzc2lvbiBjcmVhdGlvbiB0byB0aGVcbiAqIHJpZ2h0IHByb3ZpZGVyLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElQaWNrZWRTZXNzaW9uVHlwZSB7XG5cdHJlYWRvbmx5IHByb3ZpZGVySWQ6IHN0cmluZztcblx0cmVhZG9ubHkgc2Vzc2lvblR5cGVJZDogc3RyaW5nO1xufVxuXG4vKipcbiAqIEEgc3RvcmVkIG9yIGluLW1lbW9yeSBwcmVmZXJlbmNlLiBXaGVuIHRoZSBwcm92aWRlcklkIGlzIHVua25vd24gKGxlZ2FjeVxuICogc3RvcmFnZSB0aGF0IG9ubHkgcGVyc2lzdGVkIHRoZSBzZXNzaW9uIHR5cGUgaWQsIG9yIGEgcGljayBtYWRlIGJlZm9yZVxuICogYW55IGZvbGRlciB3YXMga25vd24pIHRoZSBwaWNrZXIgcmVzb2x2ZXMgYSBwcm92aWRlciBsYXppbHkgb25jZSB0aGVcbiAqIGFjdGl2ZSBmb2xkZXIgaXMgZXN0YWJsaXNoZWQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVByZWZlcnJlZFNlc3Npb25UeXBlIHtcblx0cmVhZG9ubHkgcHJvdmlkZXJJZD86IHN0cmluZztcblx0cmVhZG9ubHkgc2Vzc2lvblR5cGVJZDogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBwaWNrRXF1YWxzKGE6IElQcmVmZXJyZWRTZXNzaW9uVHlwZSB8IHVuZGVmaW5lZCwgYjogSVByZWZlcnJlZFNlc3Npb25UeXBlIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdHJldHVybiBhPy5wcm92aWRlcklkID09PSBiPy5wcm92aWRlcklkICYmIGE/LnNlc3Npb25UeXBlSWQgPT09IGI/LnNlc3Npb25UeXBlSWQ7XG59XG5cbmludGVyZmFjZSBJU3RvcmVkU2Vzc2lvblR5cGVQaWNrIHtcblx0cmVhZG9ubHkgcHJvdmlkZXJJZD86IHN0cmluZztcblx0cmVhZG9ubHkgc2Vzc2lvblR5cGVJZDogc3RyaW5nO1xufVxuXG4vKiogRGVmYXVsdCB0ZWxlbWV0cnkgc291cmNlIHVzZWQgd2hlbiB0aGUgcGlja2VyIHNlcnZlcyB0aGUgTmV3IFNlc3Npb24gY29tcG9zZXIuICovXG5jb25zdCBERUZBVUxUX1RFTEVNRVRSWV9TT1VSQ0UgPSAnTmV3Q2hhdFNlc3Npb25UeXBlUGlja2VyJztcblxuLyoqXG4gKiBDb25maWd1cmVzIGhvdyB0aGUgcGlja2VyIGJlaGF2ZXMgd2hlbiByZXVzZWQgb3V0c2lkZSB0aGUgTmV3IFNlc3Npb25cbiAqIGNvbXBvc2VyIChlLmcuIHRoZSBhdXRvbWF0aW9ucyBkaWFsb2cpLCB3aGVyZSBwcm9maWxlLXdpZGUgcGVyc2lzdGVuY2UgYW5kXG4gKiBuZXctY2hhdCB0ZWxlbWV0cnkgd291bGQgYmUgaW5jb3JyZWN0IHNpZGUgZWZmZWN0cy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvblR5cGVQaWNrZXJPcHRpb25zIHtcblx0LyoqXG5cdCAqIFdoZW4gYGZhbHNlYCAoZS5nLiB0aGUgYXV0b21hdGlvbnMgZGlhbG9nKSwgYW4gZXhwbGljaXQgcGljayBpc1xuXHQgKiBuZXZlciB3cml0dGVuIHRvIG9yIGNsZWFyZWQgZnJvbSB0aGUgcHJvZmlsZS13aWRlXG5cdCAqIHtAbGluayBTVE9SQUdFX0tFWV9MQVNUX1NFU1NJT05fVFlQRX0gcHJlZmVyZW5jZSwgc28gcGlja2luZyBhIHR5cGUgaGVyZVxuXHQgKiBjYW5ub3QgY2hhbmdlIHRoZSBOZXcgU2Vzc2lvbiBkZWZhdWx0LiBUaGUgc3RvcmVkIHByZWZlcmVuY2UgaXMgc3RpbGwgcmVhZFxuXHQgKiB0byBzZWVkIGEgc2Vuc2libGUgaW5pdGlhbCBkZWZhdWx0LiBEZWZhdWx0cyB0byBgdHJ1ZWAuXG5cdCAqL1xuXHRyZWFkb25seSBwZXJzaXN0U2VsZWN0aW9uPzogYm9vbGVhbjtcblx0LyoqIFRlbGVtZXRyeSBpZC9uYW1lIHJlcG9ydGVkIG9uIHNlbGVjdGlvbi4gRGVmYXVsdHMgdG8ge0BsaW5rIERFRkFVTFRfVEVMRU1FVFJZX1NPVVJDRX0uICovXG5cdHJlYWRvbmx5IHRlbGVtZXRyeVNvdXJjZT86IHN0cmluZztcblx0LyoqXG5cdCAqIFdoZW4gYGZhbHNlYCwgdGhlIGRyb3Bkb3duIGNoZXZyb24gaXMgbm90IHJlbmRlcmVkIG9uIHRoZSB0cmlnZ2VyLlxuXHQgKiBUaGUgcGlja2VyIGlzIHN0aWxsIGludGVyYWN0aXZlLiBEZWZhdWx0cyB0byBgdHJ1ZWAuXG5cdCAqL1xuXHRyZWFkb25seSBzaG93Q2hldnJvbj86IGJvb2xlYW47XG59XG5cbi8qKlxuICogUm93IGl0ZW0gcmVuZGVyZWQgaW5zaWRlIHRoZSBzZXNzaW9uIHR5cGUgcGlja2VyIFx1MjAxNCBjYXJyaWVzIGJvdGggdGhlXG4gKiBwcm92aWRlciBpZCBhbmQgdGhlIHNlc3Npb24gdHlwZSBzbyB3ZSBjYW4gZGlzcGF0Y2ggY3JlYXRpb24gdGhyb3VnaFxuICogdGhlIGNvcnJlY3QgcHJvdmlkZXIgd2hlbiB0aGUgc2FtZSB0eXBlIGlzIG9mZmVyZWQgYnkgbXVsdGlwbGUgcHJvdmlkZXJzLlxuICovXG5pbnRlcmZhY2UgSVNlc3Npb25UeXBlUGlja2VySXRlbSB7XG5cdHJlYWRvbmx5IHByb3ZpZGVySWQ6IHN0cmluZztcblx0cmVhZG9ubHkgc2Vzc2lvblR5cGVJZDogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBjaGVja2VkPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFByb3ZpZGVyIGRpc3BsYXkgbGFiZWwsIHNldCB3aGVuIHRoZSBwaWNrZXIgc2hvd3Mgc2VjdGlvbiBoZWFkZXJzIHNvIHRoZVxuXHQgKiBhY2Nlc3NpYmlsaXR5IGxhYmVsIGNhbiBkaXNhbWJpZ3VhdGUgc2FtZS1uYW1lZCB0eXBlcyAoZS5nLiBcIkNsYXVkZVwiKVxuXHQgKiBhY3Jvc3MgcHJvdmlkZXJzIFx1MjAxNCBoZWFkZXJzIGFyZSBza2lwcGVkIGJ5IGxpc3QgbmF2aWdhdGlvbiBhbmQgYXJlbid0XG5cdCAqIGFubm91bmNlZCBvbiB0aGVpciBvd24uXG5cdCAqL1xuXHRyZWFkb25seSBncm91cExhYmVsPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgU2Vzc2lvblR5cGVQaWNrZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHQvKipcblx0ICogVGhlIGN1cnJlbnRseSBkaXNwbGF5ZWQgcGljay4gTWF5IGJlIG1pc3NpbmcgYHByb3ZpZGVySWRgIHdoZW4gcmVzdG9yZWRcblx0ICogZnJvbSBsZWdhY3kgc3RvcmFnZSB0aGF0IG9ubHkgcGVyc2lzdGVkIHRoZSBzZXNzaW9uIHR5cGUgaWQgXHUyMDE0IGl0IHdpbGxcblx0ICogYmUgcmVzb2x2ZWQgdG8gYSBjb25jcmV0ZSBwcm92aWRlciBsYXppbHkgd2hlbiBjb25zdW1lcnMgY3JlYXRlIGFcblx0ICogc2Vzc2lvbi5cblx0ICovXG5cdHByb3RlY3RlZCBfcGlja2VkOiBJUHJlZmVycmVkU2Vzc2lvblR5cGUgfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRTZWxlY3RTZXNzaW9uVHlwZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElQaWNrZWRTZXNzaW9uVHlwZSB8IHVuZGVmaW5lZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2VsZWN0U2Vzc2lvblR5cGUgPSB0aGlzLl9vbkRpZFNlbGVjdFNlc3Npb25UeXBlLmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuZXZlciB0aGUgZWZmZWN0aXZlIHtAbGluayBzZWxlY3RlZFBpY2t9IGNoYW5nZXMgZm9yIGFueSByZWFzb246XG5cdCAqIGFuIGV4cGxpY2l0IHVzZXIgcGljayBPUiBhIHJlY29tcHV0ZSAoZS5nLiBhIHByb3ZpZGVyIGFkdmVydGlzaW5nIGl0c1xuXHQgKiBzZXNzaW9uIHR5cGVzIGxhdGUpLiBVbmxpa2Uge0BsaW5rIG9uRGlkU2VsZWN0U2Vzc2lvblR5cGV9LCB3aGljaCBvbmx5XG5cdCAqIGNvdmVycyBleHBsaWNpdCBwaWNrcywgdGhpcyBsZXRzIGNvbnN1bWVycyB0aGF0IGNhY2hlIHRoZSBwaWNrIHN0YXkgaW5cblx0ICogc3luYyB3aGVuIHRoZSBkaXNwbGF5ZWQgZGVmYXVsdCBzaGlmdHMgb24gaXRzIG93bi5cblx0ICovXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDaGFuZ2VTZWxlY3RlZFBpY2sgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUHJlZmVycmVkU2Vzc2lvblR5cGUgfCB1bmRlZmluZWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlbGVjdGVkUGljayA9IHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0ZWRQaWNrLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFRhcmdldENoYXRTZXNzaW9uVHlwZSA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHJlYWRvbmx5IG1vZGVsVGFyZ2V0Q2hhdFNlc3Npb25UeXBlOiBJT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+ID0gdGhpcy5fbW9kZWxUYXJnZXRDaGF0U2Vzc2lvblR5cGU7XG5cblx0LyoqIFNlc3Npb24gdHlwZXMgdGhlIGFjdGl2ZSBzZXNzaW9uJ3MgZm9sZGVyIGNhbiBiZSBzZXJ2ZWQgYnksIGFjcm9zcyBhbGwgcHJvdmlkZXJzLiAqL1xuXHRwcm90ZWN0ZWQgX2ZvbGRlclNlc3Npb25UeXBlczogSVByb3ZpZGVyU2Vzc2lvblR5cGVbXSA9IFtdO1xuXG5cdC8qKiBGb2xkZXIgdGhhdCBkcml2ZXMgdGhlIGF2YWlsYWJsZSBzZXNzaW9uIHR5cGVzIHdoZW4gc2V0IHZpYSB7QGxpbmsgc2V0Rm9sZGVyU291cmNlfTsgYHVuZGVmaW5lZGAga2VlcHMgc2Vzc2lvbi1kcml2ZW4gYmVoYXZpb3IuICovXG5cdHByaXZhdGUgX2ZvbGRlclNvdXJjZTogSU9ic2VydmFibGU8VVJJIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZm9sZGVyU291cmNlV2F0Y2ggPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgX3F1aWNrQ2hhdFNvdXJjZTogSU9ic2VydmFibGU8Ym9vbGVhbj4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrQ2hhdFNvdXJjZVdhdGNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIF9wZW5kaW5nSW5pdGlhbFBpY2s6IElQcmVmZXJyZWRTZXNzaW9uVHlwZSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZW5kZXJEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByb3RlY3RlZCBfdHJpZ2dlckVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBUcmFja3Mgd2hldGhlciB0aGUgaGFybmVzcyBwaWNrZXIgdHJpZ2dlciBpcyBjdXJyZW50bHkgdmlzaWJsZS4gTWlycm9yc1xuXHQgKiB0aGUgYC5oaWRkZW5gIHN0YXRlIGNvbXB1dGVkIGluIHtAbGluayBfdXBkYXRlVHJpZ2dlckxhYmVsfSwgc28gdGhlXG5cdCAqIG5ldy1zZXNzaW9uLXZpZXcgb25ib2FyZGluZyB0b3VyIGNhbiBza2lwIHRoZSBoYXJuZXNzIHN0ZXAgd2hlbiBvbmx5IGFcblx0ICogc2luZ2xlIGhhcm5lc3MgY2FuIHNlcnZlIHRoZSBzZWxlY3RlZCB3b3Jrc3BhY2UuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF92aXNpYmxlS2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uOiBJT2JzZXJ2YWJsZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogSVNlc3Npb25UeXBlUGlja2VyT3B0aW9ucyB8IHVuZGVmaW5lZCxcblx0XHRASUFjdGlvbldpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY3Rpb25XaWRnZXRTZXJ2aWNlOiBJQWN0aW9uV2lkZ2V0U2VydmljZSxcblx0XHRASVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlOiBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25zUHJvdmlkZXJzU2VydmljZTogSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxzU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fdmlzaWJsZUtleSA9IFNlc3Npb25IYXJuZXNzUGlja2VyVmlzaWJsZUNvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fdmlzaWJsZUtleS5yZXNldCgpKSk7XG5cblx0XHQvLyBSZXN0b3JlIHRoZSBwcmV2aW91c2x5IHNlbGVjdGVkIHNlc3Npb24gdHlwZSBmcm9tIHN0b3JhZ2Vcblx0XHR0aGlzLl9waWNrZWQgPSB0aGlzLl9yZWFkU3RvcmVkUGljaygpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fc2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9yZWNvbXB1dGUoKTtcblx0XHR9KSk7XG5cdFx0Ly8gUmUtcmVhZCB3aGVuIGEgcHJvdmlkZXIgYWR2ZXJ0aXNlcy9yZW1vdmVzIHNlc3Npb24gdHlwZXMgYXQgcnVudGltZVxuXHRcdC8vIChlLmcuIGEgcmVtb3RlIGFnZW50IGhvc3QgZGlzY292ZXJzIGEgbmV3IGFnZW50KS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9uVHlwZXMoKCkgPT4gdGhpcy5fcmVjb21wdXRlKCkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWNvbXB1dGUgdGhlIGF2YWlsYWJsZSBzZXNzaW9uIHR5cGVzIGFuZCB0aGUgZGlzcGxheWVkIHBpY2sgZnJvbSB0aGVcblx0ICogY3VycmVudCBzb3VyY2UgKHNlc3Npb24gb3IgZm9sZGVyKSwgdGhlbiByZWZyZXNoIHRoZSB0cmlnZ2VyIGxhYmVsLlxuXHQgKiBJbnZva2VkIHJlYWN0aXZlbHkgd2hlbiB0aGUgc2Vzc2lvbiwgZm9sZGVyLCBvciBhZHZlcnRpc2VkIHR5cGVzIGNoYW5nZS5cblx0ICovXG5cdHByb3RlY3RlZCBfcmVjb21wdXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2ZvbGRlclNlc3Npb25UeXBlcyA9IHRoaXMuX3Jlc29sdmVGb2xkZXJTZXNzaW9uVHlwZXMoKTtcblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX3BpY2tlZDtcblx0XHR0aGlzLl9waWNrZWQgPSB0aGlzLl9jb21wdXRlQ3VycmVudFBpY2soKTtcblx0XHRjb25zdCBwaWNrID0gdGhpcy5fcGlja2VkO1xuXHRcdGlmICh0aGlzLl9xdWlja0NoYXRTb3VyY2U/LmdldCgpICYmIHBpY2sgJiYgIXBpY2sucHJvdmlkZXJJZCkge1xuXHRcdFx0Y29uc3QgY29uY3JldGUgPSB0aGlzLl9mb2xkZXJTZXNzaW9uVHlwZXMuZmluZCh0eXBlID0+IHR5cGUuc2Vzc2lvblR5cGUuaWQgPT09IHBpY2suc2Vzc2lvblR5cGVJZCk7XG5cdFx0XHRpZiAoY29uY3JldGUpIHtcblx0XHRcdFx0dGhpcy5fcGlja2VkID0geyBwcm92aWRlcklkOiBjb25jcmV0ZS5wcm92aWRlcklkLCBzZXNzaW9uVHlwZUlkOiBjb25jcmV0ZS5zZXNzaW9uVHlwZS5pZCB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl91cGRhdGVNb2RlbFRhcmdldENoYXRTZXNzaW9uVHlwZSgpO1xuXHRcdHRoaXMuX3VwZGF0ZVRyaWdnZXJMYWJlbCgpO1xuXHRcdGlmICghcGlja0VxdWFscyhwcmV2aW91cywgdGhpcy5fcGlja2VkKSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZWxlY3RlZFBpY2suZmlyZSh0aGlzLl9waWNrZWQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgc2Vzc2lvbiB0eXBlcyB0byBvZmZlciwgc291cmNlZCBmcm9tIHRoZSBmb2xkZXIgd2hlbiBhIGZvbGRlciBzb3VyY2Vcblx0ICogaXMgc2V0IChzZWUge0BsaW5rIHNldEZvbGRlclNvdXJjZX0pLCBvdGhlcndpc2UgZnJvbSB0aGUgYWN0aXZlIHNlc3Npb24uXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX3Jlc29sdmVGb2xkZXJTZXNzaW9uVHlwZXMoKTogSVByb3ZpZGVyU2Vzc2lvblR5cGVbXSB7XG5cdFx0aWYgKHRoaXMuX2ZvbGRlclNvdXJjZSkge1xuXHRcdFx0aWYgKHRoaXMuX3F1aWNrQ2hhdFNvdXJjZT8uZ2V0KCkpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRRdWlja0NoYXRTZXNzaW9uVHlwZXMoKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZvbGRlclVyaSA9IHRoaXMuX2ZvbGRlclNvdXJjZS5nZXQoKTtcblx0XHRcdHJldHVybiBmb2xkZXJVcmkgPyB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvblR5cGVzRm9yRm9sZGVyKGZvbGRlclVyaSkgOiBbXTtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb24uZ2V0KCk7XG5cdFx0cmV0dXJuIHNlc3Npb24gPyB0aGlzLl9zZXNzaW9uVHlwZXNGb3JTZXNzaW9uKHNlc3Npb24pIDogW107XG5cdH1cblxuXHQvKiogVGhlIHBpY2sgdG8gZGlzcGxheSBmb3IgdGhlIGN1cnJlbnQgc291cmNlOiB0aGUgYWN0aXZlIHNlc3Npb24ncyB0eXBlLCBvdGhlcndpc2UgdGhlIGZvbGRlciBvciBzdG9yZWQgZGVmYXVsdC4gKi9cblx0cHJvdGVjdGVkIF9jb21wdXRlQ3VycmVudFBpY2soKTogSVByZWZlcnJlZFNlc3Npb25UeXBlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoIXRoaXMuX2ZvbGRlclNvdXJjZSAmJiBzZXNzaW9uKSB7XG5cdFx0XHQvLyBSZWZsZWN0IHRoZSBzZXNzaW9uJ3MgdHlwZSB3aXRob3V0IHBlcnNpc3RpbmcgaXQ7IHN0b3JhZ2UgY2hhbmdlcyBvbmx5IG9uIGFuIGV4cGxpY2l0IHVzZXIgcGljay5cblx0XHRcdGNvbnN0IHBpY2sgPSB7IHByb3ZpZGVySWQ6IHNlc3Npb24ucHJvdmlkZXJJZCwgc2Vzc2lvblR5cGVJZDogc2Vzc2lvbi5zZXNzaW9uVHlwZSB9O1xuXHRcdFx0Ly8gQSBjb21taXR0ZWQgc2Vzc2lvbiBrZWVwcyBzaG93aW5nIHRoZSBoYXJuZXNzIGl0IGFjdHVhbGx5IHJ1bnMgb24sXG5cdFx0XHQvLyBldmVuIGlmIHRoYXQgaGFybmVzcyBpcyBubyBsb25nZXIgb2ZmZXJlZC4gQW4gdW5jb21taXR0ZWQgZHJhZnQgaXNcblx0XHRcdC8vIGEgY2hvaWNlIGFib3V0IGEgc2Vzc2lvbiB0aGF0IGRvZXMgbm90IGV4aXN0IHlldCwgc28gaXQgbXVzdCBuZXZlclxuXHRcdFx0Ly8gZGlzcGxheSBhIGhhcm5lc3MgdGhlIHBpY2tlciBkb2Vzbid0IGxpc3QuXG5cdFx0XHRyZXR1cm4gc2Vzc2lvbi5zdGF0dXMuZ2V0KCkgPT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWQgPyB0aGlzLl9vZmZlcmVkUGljayhwaWNrKSA6IHBpY2s7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fZm9sZGVyU291cmNlKSB7XG5cdFx0XHQvLyBObyBhY3RpdmUgc2Vzc2lvbjoga2VlcCB0aGUgc3RvcmVkIHBpY2sgdG8gc2VlZCB0aGUgbmV4dCBuZXcgc2Vzc2lvbi5cblx0XHRcdHJldHVybiB0aGlzLl9vZmZlcmVkUGljayh0aGlzLl9yZWFkU3RvcmVkUGljaygpKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdJbml0aWFsUGljaykge1xuXHRcdFx0aWYgKHRoaXMuX3BpY2tTZXJ2ZWRCeUZvbGRlcih0aGlzLl9wZW5kaW5nSW5pdGlhbFBpY2spKSB7XG5cdFx0XHRcdGNvbnN0IHBpY2sgPSB0aGlzLl9wZW5kaW5nSW5pdGlhbFBpY2s7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdJbml0aWFsUGljayA9IHVuZGVmaW5lZDtcblx0XHRcdFx0cmV0dXJuIHBpY2s7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5fcGVuZGluZ0luaXRpYWxQaWNrO1xuXHRcdH1cblx0XHRjb25zdCBjYW5kaWRhdGUgPSB0aGlzLl9waWNrZWQgPz8gdGhpcy5fcmVhZFN0b3JlZFBpY2soKTtcblx0XHRpZiAodGhpcy5fcGlja1NlcnZlZEJ5Rm9sZGVyKGNhbmRpZGF0ZSkpIHtcblx0XHRcdHJldHVybiBjYW5kaWRhdGU7XG5cdFx0fVxuXHRcdGNvbnN0IHN0b3JlZCA9IHRoaXMuX3JlYWRTdG9yZWRQaWNrKCk7XG5cdFx0aWYgKHRoaXMuX3BpY2tTZXJ2ZWRCeUZvbGRlcihzdG9yZWQpKSB7XG5cdFx0XHRyZXR1cm4gc3RvcmVkO1xuXHRcdH1cblx0XHRjb25zdCBwcmVmZXJyZWQgPSB0aGlzLl9mb2xkZXJTZXNzaW9uVHlwZXNbMF07XG5cdFx0cmV0dXJuIHRoaXMuX2dldFByZWZlcnJlZENvZGV4UGljaygpXG5cdFx0XHQ/PyAocHJlZmVycmVkID8geyBwcm92aWRlcklkOiBwcmVmZXJyZWQucHJvdmlkZXJJZCwgc2Vzc2lvblR5cGVJZDogcHJlZmVycmVkLnNlc3Npb25UeXBlLmlkIH0gOiB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9waWNrU2VydmVkQnlGb2xkZXIocGljazogSVByZWZlcnJlZFNlc3Npb25UeXBlIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhcGljayAmJiB0aGlzLl9mb2xkZXJTZXNzaW9uVHlwZXMuc29tZSh0ID0+XG5cdFx0XHR0LnNlc3Npb25UeXBlLmlkID09PSBwaWNrLnNlc3Npb25UeXBlSWQgJiZcblx0XHRcdChwaWNrLnByb3ZpZGVySWQgPT09IHVuZGVmaW5lZCB8fCB0LnByb3ZpZGVySWQgPT09IHBpY2sucHJvdmlkZXJJZCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnN0cmFpbnMgYSBwaWNrIHRvIHRoZSB0eXBlcyB0aGUgcGlja2VyIGFjdHVhbGx5IG9mZmVycywgZmFsbGluZyBiYWNrIHRvXG5cdCAqIHRoZSBwcmVmZXJyZWQgKGZpcnN0KSB0eXBlIHdoZW4gaXQgZG9lc24ndC4gQSByZW1lbWJlcmVkIHBpY2sgb3V0bGl2ZXMgdGhlXG5cdCAqIGhhcm5lc3MgdGhhdCBwcm9kdWNlZCBpdDogYSBzZXNzaW9uIHR5cGUgY2FuIHN0b3AgYmVpbmcgYWR2ZXJ0aXNlZCB3aGlsZVxuXHQgKiB0aGUgc3RvcmVkIHByZWZlcmVuY2Ugc3RpbGwgbmFtZXMgaXQuIERpc3BsYXlpbmcgaXQgYXMgc2VsZWN0ZWQgd2hpbGUgdGhlXG5cdCAqIGRyb3Bkb3duIGhpZGVzIGl0IHdvdWxkIGxldCB0aGUgdXNlciBzdGFydCBhIHNlc3Npb24gb24gYSBoYXJuZXNzIHRoZXkgY2FuXG5cdCAqIG5vIGxvbmdlciBwaWNrLlxuXHQgKlxuXHQgKiBBbiBlbXB0eSBvZmZlciBsaXN0IG1lYW5zIHRoZSB0eXBlcyBhcmVuJ3Qga25vd24geWV0IChubyBzZXNzaW9uIG9yIGZvbGRlclxuXHQgKiB0byBzb3VyY2UgdGhlbSBmcm9tLCBvciBhIHByb3ZpZGVyIHN0aWxsIGNvbm5lY3RpbmcpLCBzbyB0aGUgcGljayBpcyBsZWZ0XG5cdCAqIGFsb25lIHVudGlsIHNvbWV0aGluZyBpcyBhY3R1YWxseSBvZmZlcmVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfb2ZmZXJlZFBpY2socGljazogSVByZWZlcnJlZFNlc3Npb25UeXBlIHwgdW5kZWZpbmVkKTogSVByZWZlcnJlZFNlc3Npb25UeXBlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fZm9sZGVyU2Vzc2lvblR5cGVzLmxlbmd0aCA9PT0gMCB8fCB0aGlzLl9waWNrU2VydmVkQnlGb2xkZXIocGljaykpIHtcblx0XHRcdHJldHVybiBwaWNrO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZ2V0UHJlZmVycmVkQ29kZXhQaWNrKClcblx0XHRcdD8/ICgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHByZWZlcnJlZCA9IHRoaXMuX2ZvbGRlclNlc3Npb25UeXBlc1swXTtcblx0XHRcdFx0cmV0dXJuIHsgcHJvdmlkZXJJZDogcHJlZmVycmVkLnByb3ZpZGVySWQsIHNlc3Npb25UeXBlSWQ6IHByZWZlcnJlZC5zZXNzaW9uVHlwZS5pZCB9O1xuXHRcdFx0fSkoKTtcblx0fVxuXG5cdC8qKiBEcml2ZSB0aGUgcGlja2VyIGZyb20gYSBmb2xkZXIgaW5zdGVhZCBvZiB0aGUgYWN0aXZlIHNlc3Npb24sIG9wdGlvbmFsbHkgc2VlZGluZyB0aGUgaW5pdGlhbCBwaWNrLiAqL1xuXHRzZXRGb2xkZXJTb3VyY2Uoc291cmNlOiBJT2JzZXJ2YWJsZTxVUkkgfCB1bmRlZmluZWQ+LCBvcHRpb25zPzogeyByZWFkb25seSBpbml0aWFsUGljaz86IElQcmVmZXJyZWRTZXNzaW9uVHlwZTsgcmVhZG9ubHkgcHJlc2VydmVVbmF2YWlsYWJsZUluaXRpYWxQaWNrPzogYm9vbGVhbiB9KTogdm9pZCB7XG5cdFx0dGhpcy5fZm9sZGVyU291cmNlID0gc291cmNlO1xuXHRcdHRoaXMuX3BpY2tlZCA9IG9wdGlvbnM/LmluaXRpYWxQaWNrID8/IHRoaXMuX3JlYWRTdG9yZWRQaWNrKCk7XG5cdFx0dGhpcy5fcGVuZGluZ0luaXRpYWxQaWNrID0gb3B0aW9ucz8ucHJlc2VydmVVbmF2YWlsYWJsZUluaXRpYWxQaWNrID8gb3B0aW9ucy5pbml0aWFsUGljayA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBpbml0aWFsRm9sZGVyID0gc291cmNlLmdldCgpO1xuXHRcdHRoaXMuX2ZvbGRlclNvdXJjZVdhdGNoLnZhbHVlID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZm9sZGVyID0gc291cmNlLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghaXNFcXVhbChmb2xkZXIsIGluaXRpYWxGb2xkZXIpKSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdJbml0aWFsUGljayA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3JlY29tcHV0ZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqIFN3aXRjaCBhIGZvbGRlci1kcml2ZW4gcGlja2VyIHRvIHRoZSBxdWljay1jaGF0IHR5cGUgY2F0YWxvZyB3aGlsZSB0aGUgc291cmNlIGlzIHRydWUuICovXG5cdHNldFF1aWNrQ2hhdFNvdXJjZShzb3VyY2U6IElPYnNlcnZhYmxlPGJvb2xlYW4+KTogdm9pZCB7XG5cdFx0dGhpcy5fcXVpY2tDaGF0U291cmNlID0gc291cmNlO1xuXHRcdGNvbnN0IGluaXRpYWxRdWlja0NoYXQgPSBzb3VyY2UuZ2V0KCk7XG5cdFx0dGhpcy5fcXVpY2tDaGF0U291cmNlV2F0Y2gudmFsdWUgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBpc1F1aWNrQ2hhdCA9IHNvdXJjZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoaXNRdWlja0NoYXQgIT09IGluaXRpYWxRdWlja0NoYXQpIHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ0luaXRpYWxQaWNrID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcmVjb21wdXRlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRnZXQgc2VsZWN0ZWRQaWNrKCk6IElQcmVmZXJyZWRTZXNzaW9uVHlwZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3BpY2tlZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgc2Vzc2lvbiB0eXBlcyB0byBvZmZlciBmb3IgYSBzZXNzaW9uOiBhbGwgcXVpY2stY2hhdCB0eXBlcyB3aGVuIHRoZVxuXHQgKiBzZXNzaW9uIGlzIGEgd29ya3NwYWNlLWxlc3MgcXVpY2sgY2hhdCwgb3RoZXJ3aXNlIHRoZSBmb2xkZXIncyB0eXBlcy5cblx0ICovXG5cdHByaXZhdGUgX3Nlc3Npb25UeXBlc0ZvclNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24pOiBJUHJvdmlkZXJTZXNzaW9uVHlwZVtdIHtcblx0XHRpZiAoc2Vzc2lvbi5pc1F1aWNrQ2hhdD8uZ2V0KCkgPz8gZmFsc2UpIHtcblx0XHRcdHJldHVybiB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0UXVpY2tDaGF0U2Vzc2lvblR5cGVzKCk7XG5cdFx0fVxuXHRcdGNvbnN0IGZvbGRlclVyaSA9IHNlc3Npb24ud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdPy5yb290O1xuXHRcdHJldHVybiBmb2xkZXJVcmkgPyB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvblR5cGVzRm9yRm9sZGVyKGZvbGRlclVyaSkgOiBbXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgc2Vzc2lvbiB0eXBlIHRoZSB1c2VyIGV4cGxpY2l0bHkgcGlja2VkLCByZWFkIGZyb20gdGhlIHN0b3JlZFxuXHQgKiBwcmVmZXJlbmNlLiBVbmxpa2Uge0BsaW5rIHNlbGVjdGVkUGlja30sIHRoaXMgaXMgaW5kZXBlbmRlbnQgb2YgYW55XG5cdCAqIGFjdGl2ZSBzZXNzaW9uJ3MgdHlwZS4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIHRoZSB1c2VyIGhhcyBuZXZlclxuXHQgKiBwaWNrZWQgYSB0eXBlIChvciBjaGFuZ2VkIGF3YXkgZnJvbSB0aGUgZGVmYXVsdCksIGluIHdoaWNoIGNhc2Vcblx0ICogY29uc3VtZXJzIHNob3VsZCBmYWxsIGJhY2sgdG8ge0BsaW5rIGdldFByZWZlcnJlZFNlc3Npb25UeXBlfS5cblx0ICovXG5cdGdldFVzZXJQaWNrZWRTZXNzaW9uVHlwZSgpOiBJUHJlZmVycmVkU2Vzc2lvblR5cGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9yZWFkU3RvcmVkUGljaygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBwcmVmZXJyZWQgc2Vzc2lvbiB0eXBlIGZvciB7QGxpbmsgZm9sZGVyVXJpfTogdGhlIGZpcnN0IGVudHJ5IGluXG5cdCAqIHRoZSBmb2xkZXIncyBzZXNzaW9uLXR5cGUgbGlzdC4gUmVjb21wdXRlZCBhZ2FpbnN0IHRoZSBsaXZlIGxpc3QsIHNvXG5cdCAqIGl0IGZvbGxvd3MgcHJvdmlkZXIgY2hhbmdlcyAoZS5nLiBhIGxhdGUtcmVnaXN0ZXJpbmcgYWdlbnQgaG9zdCB0aGF0XG5cdCAqIHByZXBlbmRzIGEgbmV3IHR5cGUpLiBVc2VkIGFzIHRoZSBkZWZhdWx0IHdoZW4gdGhlIHVzZXIgaGFzIG1hZGUgbm9cblx0ICogZXhwbGljaXQgcGljay5cblx0ICovXG5cdGdldFByZWZlcnJlZFNlc3Npb25UeXBlKGZvbGRlclVyaTogVVJJKTogSVByZWZlcnJlZFNlc3Npb25UeXBlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmaXJzdCA9IHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9uVHlwZXNGb3JGb2xkZXIoZm9sZGVyVXJpKVswXTtcblx0XHRyZXR1cm4gZmlyc3QgPyB7IHByb3ZpZGVySWQ6IGZpcnN0LnByb3ZpZGVySWQsIHNlc3Npb25UeXBlSWQ6IGZpcnN0LnNlc3Npb25UeXBlLmlkIH0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgb3B0aW9ucz86IHsgY2xhc3NOYW1lPzogc3RyaW5nIH0pOiB2b2lkIHtcblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3Qgc2xvdCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLnNlc3Npb25zLWNoYXQtcGlja2VyLXNsb3QnKSk7XG5cdFx0aWYgKG9wdGlvbnM/LmNsYXNzTmFtZSkge1xuXHRcdFx0Y29uc3QgY2xhc3NOYW1lcyA9IG9wdGlvbnMuY2xhc3NOYW1lLnNwbGl0KC9cXHMrLykuZmlsdGVyKGNsYXNzTmFtZSA9PiBjbGFzc05hbWUubGVuZ3RoID4gMCk7XG5cdFx0XHRpZiAoY2xhc3NOYW1lcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHNsb3QuY2xhc3NMaXN0LmFkZCguLi5jbGFzc05hbWVzKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gc2xvdC5yZW1vdmUoKSB9KTtcblxuXHRcdGNvbnN0IHRyaWdnZXIgPSBkb20uYXBwZW5kKHNsb3QsIGRvbS4kKCdhLmFjdGlvbi1sYWJlbCcpKTtcblx0XHR0cmlnZ2VyLnRhYkluZGV4ID0gMDtcblx0XHR0cmlnZ2VyLnJvbGUgPSAnYnV0dG9uJztcblx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudCA9IHRyaWdnZXI7XG5cdFx0Ly8gT25ib2FyZGluZyBzcG90bGlnaHQgdGFyZ2V0IFx1MjAxNCBpZCBpcyByZWZlcmVuY2VkIGJ5IHRoZSBcIm5ldyBzZXNzaW9uIHZpZXdcIlxuXHRcdC8vIHRvdXIgaW4gdnMvc2Vzc2lvbnMvY29udHJpYi9vbmJvYXJkaW5nVG91cnMuXG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKG1hcmtPbmJvYXJkaW5nVGFyZ2V0KHRyaWdnZXIsICdzZXNzaW9ucy5uZXdTZXNzaW9uLmhhcm5lc3NQaWNrZXInLCB7XG5cdFx0XHRvcGVuOiAoKSA9PiB0aGlzLl9zaG93UGlja2VyKCksXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3VwZGF0ZVRyaWdnZXJMYWJlbCgpO1xuXG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKEdlc3R1cmUuYWRkVGFyZ2V0KHRyaWdnZXIpKTtcblx0XHRmb3IgKGNvbnN0IGV2ZW50VHlwZSBvZiBbZG9tLkV2ZW50VHlwZS5DTElDSywgVG91Y2hFdmVudFR5cGUuVGFwXSkge1xuXHRcdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodHJpZ2dlciwgZXZlbnRUeXBlLCAoZSkgPT4ge1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5fc2hvd1BpY2tlcigpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRyaWdnZXIsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIChlKSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5fc2hvd1BpY2tlcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBPdmVycmlkZSBob29rIGZvciBtb2JpbGUgc3ViY2xhc3Nlcy4gUmVjZWl2ZXMgdGhlIHRyaWdnZXIgZWxlbWVudCBzb1xuXHQgKiB0aGUgb3ZlcnJpZGUgY2FuIGRlY2lkZSB3aGVyZSB0byBhbmNob3IgKG9yIHRoYXQgaXQgZG9lc24ndCBuZWVkXG5cdCAqIGFuY2hvcmluZyBhdCBhbGwsIGUuZy4gZm9yIGEgYm90dG9tIHNoZWV0KS5cblx0ICovXG5cdHByb3RlY3RlZCBfc2hvd1BpY2tlcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3RyaWdnZXJFbGVtZW50IHx8IHRoaXMuYWN0aW9uV2lkZ2V0U2VydmljZS5pc1Zpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSZWNvbXB1dGUgdHlwZXMgZnJlc2ggYXQgb3BlbiB0aW1lIHNvIGEgbGF0ZS1yZWdpc3RlcmluZyBwcm92aWRlclxuXHRcdC8vIChlLmcuIExvY2FsIEFnZW50IEhvc3Qgd2hvc2Ugc2Vzc2lvbiB0eXBlcyBhcmUgcG9wdWxhdGVkIG9ubHkgYWZ0ZXJcblx0XHQvLyBhZ2VudCBkaXNjb3ZlcnkpIHNob3dzIHVwIHdpdGhvdXQgd2FpdGluZyBmb3IgdGhlIHJlZnJlc2ggZXZlbnQgdG9cblx0XHQvLyBsYW5kIGJlZm9yZSB0aGUgdXNlciBjbGlja3MuXG5cdFx0Y29uc3QgZm9sZGVyVHlwZXMgPSB0aGlzLl9yZXNvbHZlRm9sZGVyU2Vzc2lvblR5cGVzKCk7XG5cdFx0dGhpcy5fZm9sZGVyU2Vzc2lvblR5cGVzID0gZm9sZGVyVHlwZXM7XG5cdFx0dGhpcy5fdXBkYXRlTW9kZWxUYXJnZXRDaGF0U2Vzc2lvblR5cGUoKTtcblxuXHRcdGlmIChmb2xkZXJUeXBlcy5sZW5ndGggPD0gMSAmJiB0aGlzLl9waWNrU2VydmVkQnlGb2xkZXIodGhpcy5fcGlja2VkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEdyb3VwIHNlc3Npb24gdHlwZXMgYnkgdGhlaXIgcHJvdmlkZXIncyBkaXNwbGF5IGxhYmVsLCBwcmVzZXJ2aW5nXG5cdFx0Ly8gZmlyc3Qtc2VlbiBvcmRlci4gUHJvdmlkZXJzIGNhbiBiZSBpbnRlcmxlYXZlZCBpbiB0aGUgZm9sZGVyIGxpc3QgYW5kXG5cdFx0Ly8gZGlzdGluY3QgcHJvdmlkZXJzIGNhbiBzaGFyZSBhIGxhYmVsLCBzbyBjb2xsZWN0aW5nIGJ5IGxhYmVsIGF2b2lkc1xuXHRcdC8vIHJlbmRlcmluZyB0aGUgc2FtZSBzZWN0aW9uIGhlYWRlciBtb3JlIHRoYW4gb25jZS5cblx0XHRjb25zdCBncm91cHMgPSBuZXcgTWFwPHN0cmluZywgSVByb3ZpZGVyU2Vzc2lvblR5cGVbXT4oKTtcblx0XHRmb3IgKGNvbnN0IGZvbGRlclR5cGUgb2YgZm9sZGVyVHlwZXMpIHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXIoZm9sZGVyVHlwZS5wcm92aWRlcklkKTtcblx0XHRcdGNvbnN0IGdyb3VwVGl0bGUgPSBwcm92aWRlcj8ubGFiZWwgPz8gZm9sZGVyVHlwZS5wcm92aWRlcklkO1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSBncm91cHMuZ2V0KGdyb3VwVGl0bGUpO1xuXHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdGV4aXN0aW5nLnB1c2goZm9sZGVyVHlwZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRncm91cHMuc2V0KGdyb3VwVGl0bGUsIFtmb2xkZXJUeXBlXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIFNlY3Rpb24gaGVhZGVycyBleGlzdCB0byBkaXNhbWJpZ3VhdGUgc2Vzc2lvbiB0eXBlcyB0aGF0IHNoYXJlIGFcblx0XHQvLyBsYWJlbCBhY3Jvc3MgcHJvdmlkZXJzIChlLmcuIHR3byBwcm92aWRlcnMgYm90aCBvZmZlcmluZyBcIkNsYXVkZVwiKS5cblx0XHQvLyBXaGVuIGV2ZXJ5IHR5cGUncyBsYWJlbCBpcyB1bmlxdWUgdGhlcmUgaXMgbm90aGluZyB0byBkaXNhbWJpZ3VhdGUsXG5cdFx0Ly8gc28gcmVuZGVyIGEgZmxhdCBsaXN0IHdpdGhvdXQgZ3JvdXAgaGVhZGVycyBldmVuIGlmIG11bHRpcGxlXG5cdFx0Ly8gcHJvdmlkZXJzIGNvbnRyaWJ1dGUuXG5cdFx0Y29uc3QgbGFiZWxDb3VudHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdGZvciAoY29uc3QgeyBzZXNzaW9uVHlwZSB9IG9mIGZvbGRlclR5cGVzKSB7XG5cdFx0XHRsYWJlbENvdW50cy5zZXQoc2Vzc2lvblR5cGUubGFiZWwsIChsYWJlbENvdW50cy5nZXQoc2Vzc2lvblR5cGUubGFiZWwpID8/IDApICsgMSk7XG5cdFx0fVxuXHRcdGNvbnN0IGhhc0R1cGxpY2F0ZUxhYmVscyA9IEFycmF5LmZyb20obGFiZWxDb3VudHMudmFsdWVzKCkpLnNvbWUoY291bnQgPT4gY291bnQgPiAxKTtcblx0XHRjb25zdCBzaG93U2VjdGlvbkhlYWRlcnMgPSBncm91cHMuc2l6ZSA+IDEgJiYgaGFzRHVwbGljYXRlTGFiZWxzO1xuXG5cdFx0Y29uc3QgZ3JvdXBlZEl0ZW1zOiBJQWN0aW9uTGlzdEl0ZW08SVNlc3Npb25UeXBlUGlja2VySXRlbT5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW2dyb3VwVGl0bGUsIHR5cGVzXSBvZiBncm91cHMpIHtcblx0XHRcdGlmIChzaG93U2VjdGlvbkhlYWRlcnMpIHtcblx0XHRcdFx0aWYgKGdyb3VwZWRJdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Z3JvdXBlZEl0ZW1zLnB1c2goeyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yLCBsYWJlbDogJycgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Z3JvdXBlZEl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5IZWFkZXIsXG5cdFx0XHRcdFx0Z3JvdXA6IHsgdGl0bGU6IGdyb3VwVGl0bGUgfSxcblx0XHRcdFx0XHRsYWJlbDogZ3JvdXBUaXRsZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHsgcHJvdmlkZXJJZCwgc2Vzc2lvblR5cGUgfSBvZiB0eXBlcykge1xuXHRcdFx0XHRjb25zdCBpc0N1cnJlbnQgPSB0aGlzLl9waWNrZWQ/LnByb3ZpZGVySWQgPT09IHByb3ZpZGVySWQgJiYgdGhpcy5fcGlja2VkPy5zZXNzaW9uVHlwZUlkID09PSBzZXNzaW9uVHlwZS5pZDtcblx0XHRcdFx0Y29uc3QgbW9kZWxUYXJnZXQgPSBzZXNzaW9uVHlwZS5jaGF0U2Vzc2lvblR5cGUgPz8gc2Vzc2lvblR5cGUuaWQ7XG5cdFx0XHRcdGNvbnN0IGFsbG93U2lnbmVkT3V0V2hlblVzYWJsZSA9IGlzQWxsb3dTaWduZWRPdXRXaGVuVXNhYmxlRW5hYmxlZCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgYXZhaWxhYmlsaXR5ID0gZ2V0U2Vzc2lvblR5cGVQaWNrZXJBdmFpbGFiaWxpdHkoXG5cdFx0XHRcdFx0bW9kZWxUYXJnZXQsXG5cdFx0XHRcdFx0Z2V0U2Vzc2lvblR5cGVBdmFpbGFiaWxpdHkodGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLCB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UsIHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBtb2RlbFRhcmdldCwgYWxsb3dTaWduZWRPdXRXaGVuVXNhYmxlKSxcblx0XHRcdFx0XHRhbGxvd1NpZ25lZE91dFdoZW5Vc2FibGUsXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGNvbnN0IHVuYXZhaWxhYmxlID0gYXZhaWxhYmlsaXR5ICE9PSBTZXNzaW9uVHlwZUF2YWlsYWJpbGl0eS5BdmFpbGFibGU7XG5cdFx0XHRcdGNvbnN0IGl0ZW06IElTZXNzaW9uVHlwZVBpY2tlckl0ZW0gPSB7XG5cdFx0XHRcdFx0cHJvdmlkZXJJZCxcblx0XHRcdFx0XHRzZXNzaW9uVHlwZUlkOiBzZXNzaW9uVHlwZS5pZCxcblx0XHRcdFx0XHRsYWJlbDogc2Vzc2lvblR5cGUubGFiZWwsXG5cdFx0XHRcdFx0Li4uKGlzQ3VycmVudCA/IHsgY2hlY2tlZDogdHJ1ZSB9IDoge30pLFxuXHRcdFx0XHRcdC4uLihzaG93U2VjdGlvbkhlYWRlcnMgPyB7IGdyb3VwTGFiZWw6IGdyb3VwVGl0bGUgfSA6IHt9KSxcblx0XHRcdFx0fTtcblx0XHRcdFx0Z3JvdXBlZEl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRcdFx0bGFiZWw6IHNlc3Npb25UeXBlLmxhYmVsLFxuXHRcdFx0XHRcdGRpc2FibGVkOiB1bmF2YWlsYWJsZSxcblx0XHRcdFx0XHQuLi4odW5hdmFpbGFibGUgPyB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZ2V0U2Vzc2lvblR5cGVVbmF2YWlsYWJsZURlc2NyaXB0aW9uKGF2YWlsYWJpbGl0eSksXG5cdFx0XHRcdFx0XHRob3ZlcjogeyBjb250ZW50OiBnZXRTZXNzaW9uVHlwZVVuYXZhaWxhYmxlSG92ZXIoYXZhaWxhYmlsaXR5KSB9LFxuXHRcdFx0XHRcdH0gOiB7fSksXG5cdFx0XHRcdFx0Z3JvdXA6IHtcblx0XHRcdFx0XHRcdHRpdGxlOiAnJyxcblx0XHRcdFx0XHRcdGljb246IHNlc3Npb25UeXBlLmljb24sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRpdGVtLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB0cmlnZ2VyRWxlbWVudCA9IHRoaXMuX3RyaWdnZXJFbGVtZW50O1xuXHRcdGNvbnN0IGRlbGVnYXRlOiBJQWN0aW9uTGlzdERlbGVnYXRlPElTZXNzaW9uVHlwZVBpY2tlckl0ZW0+ID0ge1xuXHRcdFx0b25TZWxlY3Q6IChpdGVtKSA9PiB7XG5cdFx0XHRcdHRoaXMuYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKCk7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZVNlbGVjdGVkU2Vzc2lvblR5cGUoaXRlbSk7XG5cdFx0XHR9LFxuXHRcdFx0b25IaWRlOiAoKSA9PiB7IHRyaWdnZXJFbGVtZW50LmZvY3VzKCk7IH0sXG5cdFx0fTtcblxuXHRcdHRoaXMuYWN0aW9uV2lkZ2V0U2VydmljZS5zaG93PElTZXNzaW9uVHlwZVBpY2tlckl0ZW0+KFxuXHRcdFx0J3Nlc3Npb25UeXBlUGlja2VyJyxcblx0XHRcdGZhbHNlLFxuXHRcdFx0Z3JvdXBlZEl0ZW1zLFxuXHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFtdLFxuXHRcdFx0e1xuXHRcdFx0XHRnZXRBcmlhTGFiZWw6IChlbGVtZW50KSA9PiBlbGVtZW50Lml0ZW0/Lmdyb3VwTGFiZWwgPyBsb2NhbGl6ZSgnc2Vzc2lvblR5cGVQaWNrZXIuaXRlbUFyaWFMYWJlbCcsIFwiezB9LCB7MX1cIiwgZWxlbWVudC5sYWJlbCA/PyAnJywgZWxlbWVudC5pdGVtLmdyb3VwTGFiZWwpIDogKGVsZW1lbnQubGFiZWwgPz8gJycpLFxuXHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWw6ICgpID0+IGxvY2FsaXplKCdzZXNzaW9uVHlwZVBpY2tlci5hcmlhTGFiZWwnLCBcIlNlc3Npb24gVHlwZVwiKSxcblx0XHRcdH0sXG5cdFx0XHR7IG1pbldpZHRoOiAyMDAgfSxcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgdGhlIHVzZXIgcGlja2luZyBhIHNlc3Npb24gdHlwZS4gRW1pdHMgYG5ld0NoYXRQaWNrZXJDbG9zZWRgXG5cdCAqIHRlbGVtZXRyeSAod2l0aCB0aGUgcHJldmlvdXNseSBzZWxlY3RlZCB0eXBlIHJlYWQgZnJvbSBzdG9yYWdlLCBvciB0aGVcblx0ICogaW4tbWVtb3J5IGZpZWxkIHdoZW4gbm90aGluZyBpcyBzdG9yZWQpLiBUaGUgZXhwbGljaXQgc2VsZWN0aW9uIGlzIGFsd2F5c1xuXHQgKiBwZXJzaXN0ZWQgXHUyMDE0IHBpY2tpbmcgdGhlIHByZWZlcnJlZCAoZmlyc3QpIHR5cGUgY2xlYXJzIHRoZSBzdG9yZWRcblx0ICogcHJlZmVyZW5jZSwgYW55IG90aGVyIHBpY2sgc3RvcmVzIGl0IFx1MjAxNCB3aGlsZSB7QGxpbmsgb25EaWRTZWxlY3RTZXNzaW9uVHlwZX1cblx0ICogZmlyZXMgb25seSB3aGVuIHRoZSB2aXNpYmxlIHBpY2sgYWN0dWFsbHkgY2hhbmdlZC5cblx0ICpcblx0ICogU2hhcmVkIGJldHdlZW4gZGVza3RvcCAoYWN0aW9uLXdpZGdldCBwb3B1cCkgYW5kIG1vYmlsZSAoYm90dG9tXG5cdCAqIHNoZWV0KSBwcmVzZW50YXRpb25zIHNvIGJvdGggc3VyZmFjZXMgcmVwb3J0IGlkZW50aWNhbCB0ZWxlbWV0cnkuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX2hhbmRsZVNlbGVjdGVkU2Vzc2lvblR5cGUocGljazogSVBpY2tlZFNlc3Npb25UeXBlKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ0luaXRpYWxQaWNrID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHN0b3JlZCA9IHRoaXMuX3JlYWRTdG9yZWRQaWNrKCk7XG5cdFx0Y29uc3QgYmVmb3JlSWQgPSBzdG9yZWQ/LnNlc3Npb25UeXBlSWQgPz8gdGhpcy5fcGlja2VkPy5zZXNzaW9uVHlwZUlkO1xuXHRcdGNvbnN0IGJlZm9yZUxhYmVsID0gdGhpcy5fZm9sZGVyU2Vzc2lvblR5cGVzLmZpbmQodCA9PiB0LnNlc3Npb25UeXBlLmlkID09PSBiZWZvcmVJZCk/LnNlc3Npb25UeXBlLmxhYmVsO1xuXHRcdGNvbnN0IGFmdGVyTGFiZWwgPSB0aGlzLl9mb2xkZXJTZXNzaW9uVHlwZXMuZmluZCh0ID0+IHQucHJvdmlkZXJJZCA9PT0gcGljay5wcm92aWRlcklkICYmIHQuc2Vzc2lvblR5cGUuaWQgPT09IHBpY2suc2Vzc2lvblR5cGVJZCk/LnNlc3Npb25UeXBlLmxhYmVsO1xuXG5cdFx0Y29uc3QgdGVsZW1ldHJ5U291cmNlID0gdGhpcy5fb3B0aW9ucz8udGVsZW1ldHJ5U291cmNlID8/IERFRkFVTFRfVEVMRU1FVFJZX1NPVVJDRTtcblx0XHRyZXBvcnROZXdDaGF0UGlja2VyQ2xvc2VkKHRoaXMudGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0aWQ6IHRlbGVtZXRyeVNvdXJjZSxcblx0XHRcdG5hbWU6IHRlbGVtZXRyeVNvdXJjZSxcblx0XHRcdG9wdGlvbklkQmVmb3JlOiBiZWZvcmVJZCxcblx0XHRcdG9wdGlvbklkQWZ0ZXI6IHBpY2suc2Vzc2lvblR5cGVJZCxcblx0XHRcdG9wdGlvbkxhYmVsQmVmb3JlOiBiZWZvcmVMYWJlbCxcblx0XHRcdG9wdGlvbkxhYmVsQWZ0ZXI6IGFmdGVyTGFiZWwsXG5cdFx0XHRpc1BJSTogZmFsc2UsXG5cdFx0fSk7XG5cblx0XHQvLyBQZXJzaXN0IHRoZSBleHBsaWNpdCBzZWxlY3Rpb24gcmVnYXJkbGVzcyBvZiB3aGV0aGVyIHRoZSB2aXNpYmxlXG5cdFx0Ly8gcGljayBjaGFuZ2VkICh0aGUgdmlzaWJsZSBwaWNrIG1heSByZWZsZWN0IHRoZSBhY3RpdmUgc2Vzc2lvbiByYXRoZXJcblx0XHQvLyB0aGFuIHRoZSBzdG9yZWQgcHJlZmVyZW5jZSk6IHBpY2tpbmcgdGhlIHByZWZlcnJlZCAoZmlyc3QpIHR5cGUgbWVhbnNcblx0XHQvLyBcIm5vIGV4cGxpY2l0IHByZWZlcmVuY2VcIiBhbmQgY2xlYXJzIHRoZSBzdG9yZWQgcGljayBzbyB0aGUgc2Vzc2lvblxuXHRcdC8vIGtlZXBzIHRyYWNraW5nIHRoZSBwcmVmZXJyZWQgdHlwZSBhcyB0aGUgZm9sZGVyJ3MgbGlzdCBjaGFuZ2VzOyBhbnlcblx0XHQvLyBvdGhlciBleHBsaWNpdCBwaWNrIGlzIHN0b3JlZC5cblx0XHRjb25zdCBwcmVmZXJyZWQgPSB0aGlzLl9mb2xkZXJTZXNzaW9uVHlwZXNbMF07XG5cdFx0Y29uc3QgaXNEZWZhdWx0ID0gISFwcmVmZXJyZWQgJiYgcHJlZmVycmVkLnByb3ZpZGVySWQgPT09IHBpY2sucHJvdmlkZXJJZCAmJiBwcmVmZXJyZWQuc2Vzc2lvblR5cGUuaWQgPT09IHBpY2suc2Vzc2lvblR5cGVJZDtcblx0XHRjb25zdCB2aXNpYmxlUGlja0NoYW5nZWQgPSBwaWNrLnByb3ZpZGVySWQgIT09IHRoaXMuX3BpY2tlZD8ucHJvdmlkZXJJZCB8fCBwaWNrLnNlc3Npb25UeXBlSWQgIT09IHRoaXMuX3BpY2tlZD8uc2Vzc2lvblR5cGVJZDtcblx0XHQvLyBwcm9maWxlLXdpZGUgcHJlZmVyZW5jZSBpcyBnYXRlZCBzbyBub24tcGVyc2lzdGluZyBjYWxsZXJzIChlLmcuIHRoZVxuXHRcdC8vIGF1dG9tYXRpb25zIGRpYWxvZykgY2FuIHBpY2sgYSB0eXBlIHdpdGhvdXQgY2hhbmdpbmcgdGhlIE5ldyBTZXNzaW9uIGRlZmF1bHRcblx0XHR0aGlzLl9waWNrZWQgPSBwaWNrO1xuXHRcdHRoaXMuX3VwZGF0ZU1vZGVsVGFyZ2V0Q2hhdFNlc3Npb25UeXBlKCk7XG5cdFx0aWYgKHRoaXMuX29wdGlvbnM/LnBlcnNpc3RTZWxlY3Rpb24gIT09IGZhbHNlKSB7XG5cdFx0XHRpZiAoaXNEZWZhdWx0KSB7XG5cdFx0XHRcdHRoaXMuX2NsZWFyU3RvcmVkUGljaygpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fd3JpdGVTdG9yZWRQaWNrKHBpY2spO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBGb2xkZXItZHJpdmVuIGNhbGxlcnMgaGF2ZSBubyBzZXNzaW9uIGNoYW5nZSB0byByZS1ydW4gdGhlIHJlZnJlc2ggYXV0b3J1biwgc28gcmVmcmVzaCB0aGUgbGFiZWwgaGVyZS5cblx0XHR0aGlzLl91cGRhdGVUcmlnZ2VyTGFiZWwoKTtcblx0XHQvLyBPbmx5IG5vdGlmeSAoYW5kIHRyaWdnZXIgZHJhZnQgcmVjcmVhdGlvbikgd2hlbiB0aGUgdmlzaWJsZSBwaWNrXG5cdFx0Ly8gYWN0dWFsbHkgY2hhbmdlZCwgdG8gYXZvaWQgdW5uZWNlc3Nhcnkgd29yay5cblx0XHRpZiAodmlzaWJsZVBpY2tDaGFuZ2VkKSB7XG5cdFx0XHR0aGlzLl9vbkRpZFNlbGVjdFNlc3Npb25UeXBlLmZpcmUocGljayk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGVkUGljay5maXJlKHRoaXMuX3BpY2tlZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlTW9kZWxUYXJnZXRDaGF0U2Vzc2lvblR5cGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgcGljayA9IHRoaXMuX3BpY2tlZDtcblx0XHRjb25zdCBzZWxlY3RlZCA9IHBpY2sgPyB0aGlzLl9mb2xkZXJTZXNzaW9uVHlwZXMuZmluZCh0eXBlID0+XG5cdFx0XHR0eXBlLnNlc3Npb25UeXBlLmlkID09PSBwaWNrLnNlc3Npb25UeXBlSWRcblx0XHRcdCYmIChwaWNrLnByb3ZpZGVySWQgPT09IHVuZGVmaW5lZCB8fCB0eXBlLnByb3ZpZGVySWQgPT09IHBpY2sucHJvdmlkZXJJZClcblx0XHQpIDogdW5kZWZpbmVkO1xuXHRcdHRoaXMuX21vZGVsVGFyZ2V0Q2hhdFNlc3Npb25UeXBlLnNldChzZWxlY3RlZCA/IHNlbGVjdGVkLnNlc3Npb25UeXBlLmNoYXRTZXNzaW9uVHlwZSA/PyBzZWxlY3RlZC5zZXNzaW9uVHlwZS5pZCA6IHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlYWRTdG9yZWRQaWNrKCk6IElQcmVmZXJyZWRTZXNzaW9uVHlwZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoU1RPUkFHRV9LRVlfTEFTVF9TRVNTSU9OX1RZUEUsIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRpZiAoIXJhdykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Ly8gVHJ5IHBhcnNpbmcgYXMgdGhlIG5ldyBKU09OIHNoYXBlIGZpcnN0OyBmYWxsIGJhY2sgdG8gdGhlIGxlZ2FjeVxuXHRcdC8vIHNoYXBlIHdoZXJlIG9ubHkgdGhlIHNlc3Npb25UeXBlSWQgc3RyaW5nIHdhcyBzdG9yZWQuXG5cdFx0bGV0IHBpY2s6IElQcmVmZXJyZWRTZXNzaW9uVHlwZSB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIElTdG9yZWRTZXNzaW9uVHlwZVBpY2s7XG5cdFx0XHRpZiAocGFyc2VkICYmIHR5cGVvZiBwYXJzZWQuc2Vzc2lvblR5cGVJZCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cGljayA9IHR5cGVvZiBwYXJzZWQucHJvdmlkZXJJZCA9PT0gJ3N0cmluZydcblx0XHRcdFx0XHQ/IHsgcHJvdmlkZXJJZDogcGFyc2VkLnByb3ZpZGVySWQsIHNlc3Npb25UeXBlSWQ6IHBhcnNlZC5zZXNzaW9uVHlwZUlkIH1cblx0XHRcdFx0XHQ6IHsgc2Vzc2lvblR5cGVJZDogcGFyc2VkLnNlc3Npb25UeXBlSWQgfTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIE5vdCBKU09OIFx1MjAxNCBmYWxsIHRocm91Z2ggdG8gbGVnYWN5IHJhdy1zdHJpbmcgaGFuZGxpbmcuXG5cdFx0fVxuXHRcdGlmICghcGljaykge1xuXHRcdFx0cGljayA9IHsgc2Vzc2lvblR5cGVJZDogcmF3IH07XG5cdFx0fVxuXHRcdGlmICghaXNGb3JnZUFkdmVydGlzZWRTZXNzaW9uVHlwZUlkKHBpY2suc2Vzc2lvblR5cGVJZCkpIHtcblx0XHRcdHRoaXMuX2NsZWFyU3RvcmVkUGljaygpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHBpY2s7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRQcmVmZXJyZWRDb2RleFBpY2soKTogSVByZWZlcnJlZFNlc3Npb25UeXBlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjb2RleCA9IHRoaXMuX2ZvbGRlclNlc3Npb25UeXBlcy5maW5kKHR5cGUgPT4gdHlwZS5zZXNzaW9uVHlwZS5pZCA9PT0gQ09ERVhfQUdFTlRfUFJPVklERVJfSUQpO1xuXHRcdHJldHVybiBjb2RleCA/IHsgcHJvdmlkZXJJZDogY29kZXgucHJvdmlkZXJJZCwgc2Vzc2lvblR5cGVJZDogY29kZXguc2Vzc2lvblR5cGUuaWQgfSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3dyaXRlU3RvcmVkUGljayhwaWNrOiBJUGlja2VkU2Vzc2lvblR5cGUpOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yZWQ6IElTdG9yZWRTZXNzaW9uVHlwZVBpY2sgPSB7IHByb3ZpZGVySWQ6IHBpY2sucHJvdmlkZXJJZCwgc2Vzc2lvblR5cGVJZDogcGljay5zZXNzaW9uVHlwZUlkIH07XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShTVE9SQUdFX0tFWV9MQVNUX1NFU1NJT05fVFlQRSwgSlNPTi5zdHJpbmdpZnkoc3RvcmVkKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXHQvKipcblx0ICogRm9yZ2V0IGFueSBleHBsaWNpdCBwcmVmZXJlbmNlIChlLmcuIHRoZSB1c2VyIHJlLXNlbGVjdGVkIHRoZSBkZWZhdWx0XG5cdCAqIHR5cGUpLiBUaGUgZGlzcGxheSBzdGlsbCByZWZsZWN0cyB0aGUgaW4tbWVtb3J5IHBpY2ssIGJ1dCBjb25zdW1lcnNcblx0ICogcmVhZGluZyB7QGxpbmsgZ2V0VXNlclBpY2tlZFNlc3Npb25UeXBlfSBmYWxsIGJhY2sgdG8gdGhlIHByZWZlcnJlZCB0eXBlLlxuXHQgKi9cblx0cHJpdmF0ZSBfY2xlYXJTdG9yZWRQaWNrKCk6IHZvaWQge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKFNUT1JBR0VfS0VZX0xBU1RfU0VTU0lPTl9UWVBFLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVUcmlnZ2VyTGFiZWwoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl90cmlnZ2VyRWxlbWVudCkge1xuXHRcdFx0dGhpcy5fdmlzaWJsZUtleS5zZXQoZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5fdHJpZ2dlckVsZW1lbnQpO1xuXG5cdFx0Ly8gSW4gd2ViICh2c2NvZGUuZGV2L2FnZW50cykgdGhlIGhvc3QgZmlsdGVyIGFscmVhZHkgc2NvcGVzIHRoZVxuXHRcdC8vIHdvcmtiZW5jaCB0byBhIHNpbmdsZSBhZ2VudCBob3N0LCBzbyB3aGVuIHRoYXQgaG9zdCBhZHZlcnRpc2VzIG9ubHlcblx0XHQvLyBvbmUgaGFybmVzcyB0aGVyZSBpcyBub3RoaW5nIHRvIHBpY2sgXHUyMDE0IGhpZGUgdGhlIHRyaWdnZXIgZW50aXJlbHkuXG5cdFx0Ly8gTm90ZTogdGhlIGV4aXN0aW5nIENTUyBydWxlIG9uIGAuc2Vzc2lvbi13b3Jrc3BhY2UtcGlja2VyLXdpdGgtbGFiZWxgXG5cdFx0Ly8gdXNlcyBgOmhhcygrIC5zZXNzaW9ucy1jaGF0LXNlc3Npb24tdHlwZS1waWNrZXIgLmFjdGlvbi1sYWJlbC5oaWRkZW4pYFxuXHRcdC8vIHRvIGFsc28gaGlkZSB0aGUgXCJ3aXRoXCIgY29ubmVjdG9yIHdoZW4gdGhlIHRyaWdnZXIgaXMgaGlkZGVuLlxuXHRcdGNvbnN0IGhpZGVGb3JTaW5nbGVIYXJuZXNzID0gdGhpcy5fZm9sZGVyU2Vzc2lvblR5cGVzLmxlbmd0aCA8PSAxICYmIHRoaXMuX3BpY2tTZXJ2ZWRCeUZvbGRlcih0aGlzLl9waWNrZWQpO1xuXHRcdGlmICh0aGlzLl9mb2xkZXJTZXNzaW9uVHlwZXMubGVuZ3RoID09PSAwIHx8IGhpZGVGb3JTaW5nbGVIYXJuZXNzKSB7XG5cdFx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHRcdHRoaXMuX3Zpc2libGVLZXkuc2V0KGZhbHNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcblx0XHR0aGlzLl92aXNpYmxlS2V5LnNldCh0cnVlKTtcblx0XHRjb25zdCBjdXJyZW50VHlwZSA9IHRoaXMuX2ZvbGRlclNlc3Npb25UeXBlcy5maW5kKHQgPT5cblx0XHRcdHQucHJvdmlkZXJJZCA9PT0gdGhpcy5fcGlja2VkPy5wcm92aWRlcklkICYmIHQuc2Vzc2lvblR5cGUuaWQgPT09IHRoaXMuX3BpY2tlZD8uc2Vzc2lvblR5cGVJZCk/LnNlc3Npb25UeXBlXG5cdFx0XHQ/PyB0aGlzLl9mb2xkZXJTZXNzaW9uVHlwZXMuZmluZCh0ID0+IHQuc2Vzc2lvblR5cGUuaWQgPT09IHRoaXMuX3BpY2tlZD8uc2Vzc2lvblR5cGVJZCk/LnNlc3Npb25UeXBlO1xuXHRcdGNvbnN0IG1vZGVJY29uID0gY3VycmVudFR5cGU/Lmljb24gPz8gQ29kaWNvbi50ZXJtaW5hbDtcblx0XHRjb25zdCBtb2RlTGFiZWwgPSBjdXJyZW50VHlwZT8ubGFiZWwgPz8gdGhpcy5fcGlja2VkPy5zZXNzaW9uVHlwZUlkID8/ICcnO1xuXG5cdFx0ZG9tLmFwcGVuZCh0aGlzLl90cmlnZ2VyRWxlbWVudCwgcmVuZGVySWNvbihtb2RlSWNvbikpO1xuXHRcdGNvbnN0IGxhYmVsU3BhbiA9IGRvbS5hcHBlbmQodGhpcy5fdHJpZ2dlckVsZW1lbnQsIGRvbS4kKCdzcGFuLnNlc3Npb25zLWNoYXQtZHJvcGRvd24tbGFiZWwnKSk7XG5cdFx0bGFiZWxTcGFuLnRleHRDb250ZW50ID0gbW9kZUxhYmVsO1xuXG5cdFx0aWYgKHRoaXMuX29wdGlvbnM/LnNob3dDaGV2cm9uICE9PSBmYWxzZSkge1xuXHRcdFx0Y29uc3QgY2hldnJvbiA9IGRvbS5hcHBlbmQodGhpcy5fdHJpZ2dlckVsZW1lbnQsIHJlbmRlckljb24oQ29kaWNvbi5jaGV2cm9uRG93bkNvbXBhY3QpKTtcblx0XHRcdGNoZXZyb24uY2xhc3NMaXN0LmFkZCgnc2Vzc2lvbnMtY2hhdC1kcm9wZG93bi1jaGV2cm9uJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdHJpZ2dlckVsZW1lbnQuYXJpYUxhYmVsID0gbG9jYWxpemUoJ3Nlc3Npb25UeXBlUGlja2VyLnRyaWdnZXJBcmlhTGFiZWwnLCBcIlBpY2sgU2Vzc2lvbiBUeXBlLCB7MH1cIiwgbW9kZUxhYmVsKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxTQUFTLGFBQWEsc0JBQXNCO0FBQ3JELFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksaUJBQWlCLG1CQUFtQixvQkFBb0I7QUFDN0UsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsMEJBQWdFO0FBQ3pFLFNBQStCLGtDQUFrQztBQUNqRSxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLFNBQXNCLHVCQUF1QjtBQUN0RCxTQUFtQixxQkFBcUI7QUFDeEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsZUFBZTtBQUV4QixTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDRCQUE0QixrQ0FBa0Msc0NBQXNDLGdDQUFnQywrQkFBK0I7QUFDNUssU0FBUywrQkFBK0I7QUFDeEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUywwQ0FBMEM7QUFDbkQsU0FBUyx5Q0FBeUM7QUFFbEQsTUFBTSxnQ0FBZ0M7QUF3QnRDLFNBQVMsV0FBVyxHQUFzQyxHQUErQztBQUN4RyxTQUFPLEdBQUcsZUFBZSxHQUFHLGNBQWMsR0FBRyxrQkFBa0IsR0FBRztBQUNuRTtBQVFBLE1BQU0sMkJBQTJCO0FBNEMxQixJQUFNLG9CQUFOLGNBQWdDLFdB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
