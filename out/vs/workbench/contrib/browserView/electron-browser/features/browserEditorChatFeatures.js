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
import { localize, localize2 } from "../../../../../nls.js";
import { $ } from "../../../../../base/browser/dom.js";
import { Event } from "../../../../../base/common/event.js";
import { IContextKeyService, ContextKeyExpr, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { Action2, registerAction2, MenuId, MenuRegistry } from "../../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyMod, KeyCode } from "../../../../../base/common/keyCodes.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { DisposableMap, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceTrustManagementService } from "../../../../../platform/workspace/common/workspaceTrust.js";
import { URI } from "../../../../../base/common/uri.js";
import { IChatWidgetService } from "../../../chat/browser/chat.js";
import { IChatService } from "../../../chat/common/chatService/chatService.js";
import { ChatContextKeys } from "../../../chat/common/actions/chatContextKeys.js";
import { BrowserElementSelectionMode, BrowserViewCommandId } from "../../../../../platform/browserView/common/browserView.js";
import { BrowserViewSharingState } from "../../../browserView/common/browserView.js";
import { BrowserEditorInput } from "../../common/browserEditorInput.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { WorkbenchHoverDelegate } from "../../../../../platform/hover/browser/hover.js";
import { HoverPosition } from "../../../../../base/browser/ui/hover/hoverWidget.js";
import { BrowserEditor, BrowserEditorContribution, BrowserWidgetLocation, BrowserActionCategory, CONTEXT_BROWSER_HAS_ERROR, CONTEXT_BROWSER_HAS_URL, BrowserActionGroup } from "../browserEditor.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { Extensions as ConfigurationExtensions } from "../../../../../platform/configuration/common/configurationRegistry.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { PolicyCategory } from "../../../../../base/common/policy.js";
import { Extensions as ConfigurationMigrationExtensions, workbenchConfigurationNodeBase } from "../../../../common/configuration.js";
import { safeSetInnerHtml } from "../../../../../base/browser/domSanitize.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { ChatDynamicVariableModel } from "../../../chat/browser/attachments/chatDynamicVariables.js";
import { toAttachedContextDynamicVariable } from "../../../chat/common/attachments/chatVariables.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType, IAccessibleViewService } from "../../../../../platform/accessibility/browser/accessibleView.js";
import { AccessibleViewRegistry } from "../../../../../platform/accessibility/browser/accessibleViewRegistry.js";
import { AccessibilityVerbositySettingId } from "../../../accessibility/browser/accessibilityConfiguration.js";
import "../tools/browserTools.contribution.js";
const BrowserSendElementsToChatAttachImagesSettingId = "workbench.browser.sendElementsToChat.attachImages";
function formatElementPath(ancestors) {
  if (!ancestors || ancestors.length === 0) {
    return void 0;
  }
  return ancestors.map((ancestor) => {
    const classes = ancestor.classNames?.length ? `.${ancestor.classNames.join(".")}` : "";
    const id = ancestor.id ? `#${ancestor.id}` : "";
    return `${ancestor.tagName}${id}${classes}`;
  }).join(" > ");
}
function createElementContextValue(elementData, displayName) {
  const sections = [];
  sections.push("Attached Element Context from Integrated Browser");
  sections.push(`Element: ${displayName}`);
  if (elementData.url) {
    sections.push(`URL: ${elementData.url}`);
  }
  const htmlPath = formatElementPath(elementData.ancestors);
  if (htmlPath) {
    sections.push(`HTML Path: ${htmlPath}`);
  }
  sections.push(`Outer HTML:
\`\`\`html
${elementData.outerHTML}
\`\`\``);
  if (elementData.dimensions) {
    const { top, left, width, height } = elementData.dimensions;
    sections.push(
      `Dimensions:
- top: ${Math.round(top)}px
- left: ${Math.round(left)}px
- width: ${Math.round(width)}px
- height: ${Math.round(height)}px`
    );
  }
  sections.push(`CSS:
\`\`\`css
${elementData.computedStyle}
\`\`\``);
  return sections.join("\n\n");
}
const BROWSER_EDITOR_ACTIVE = ContextKeyExpr.equals("activeEditor", BrowserEditorInput.EDITOR_ID);
const BrowserCategory = localize2("browserCategory", "Browser");
const CONTEXT_BROWSER_ELEMENT_SELECTION_MODE = new RawContextKey("browserElementSelectionMode", void 0, localize("browser.elementSelectionMode", "The active element selection mode"));
const CONTEXT_BROWSER_AREA_SELECTION_ACTIVE = new RawContextKey("browserAreaSelectionActive", false, localize("browser.areaSelectionActive", "Whether area selection is currently active"));
class BrowserElementCommentingAccessibilityHelp {
  constructor() {
    this.type = AccessibleViewType.Help;
    this.priority = 110;
    this.name = "browserElementCommenting";
    this.when = CONTEXT_BROWSER_ELEMENT_SELECTION_MODE.isEqualTo(BrowserElementSelectionMode.Comment);
  }
  getProvider(accessor) {
    const editorPane = accessor.get(IEditorService).activeEditorPane;
    if (!(editorPane instanceof BrowserEditor)) {
      return void 0;
    }
    return new AccessibleContentProvider(
      AccessibleViewProviderId.BrowserElementCommenting,
      { type: AccessibleViewType.Help },
      () => [
        localize("browser.elementCommentingAccessibilityHelp.overview", "You are in Integrated Browser element commenting mode."),
        localize("browser.elementCommentingAccessibilityHelp.navigation", "Use Tab and Shift+Tab to move through focusable page elements. Press Enter to comment on the focused element."),
        localize("browser.elementCommentingAccessibilityHelp.composer", "In the comment input, press Enter to add the comment or Escape to cancel it."),
        localize("browser.elementCommentingAccessibilityHelp.continuous", "Commenting mode remains active after adding a comment. Press Escape outside the comment input to stop commenting."),
        localize("browser.elementCommentingAccessibilityHelp.pins", "Numbered comment pins are in the page tab order. Focus a pin to preview its comment, then Tab to its Remove Comment button.")
      ].join("\n"),
      () => editorPane.focus(),
      AccessibilityVerbositySettingId.BrowserElementCommenting
    );
  }
}
AccessibleViewRegistry.register(new BrowserElementCommentingAccessibilityHelp());
let BrowserEditorChatIntegration = class extends BrowserEditorContribution {
  constructor(editor, contextKeyService, instantiationService, telemetryService, logService, chatWidgetService, chatService, configurationService, dialogService, storageService, workspaceTrustManagementService, accessibilityService, accessibleViewService) {
    super(editor);
    this.telemetryService = telemetryService;
    this.logService = logService;
    this.chatWidgetService = chatWidgetService;
    this.chatService = chatService;
    this.configurationService = configurationService;
    this.dialogService = dialogService;
    this.storageService = storageService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.accessibilityService = accessibilityService;
    this.accessibleViewService = accessibleViewService;
    this._commentReferences = /* @__PURE__ */ new Map();
    this._commentReferenceListeners = this._register(new DisposableMap());
    this._commentModelListeners = this._register(new DisposableMap());
    this._disposedCommentModels = /* @__PURE__ */ new WeakSet();
    this._commentSessionsWithComments = /* @__PURE__ */ new Set();
    this._elementSelectionModeContext = CONTEXT_BROWSER_ELEMENT_SELECTION_MODE.bindTo(contextKeyService);
    this._areaSelectionActiveContext = CONTEXT_BROWSER_AREA_SELECTION_ACTIVE.bindTo(contextKeyService);
    const hoverDelegate = this._register(instantiationService.createInstance(
      WorkbenchHoverDelegate,
      "element",
      void 0,
      { position: { hoverPosition: HoverPosition.ABOVE } }
    ));
    this._shareButtonContainer = $(".browser-share-toggle-container");
    this._shareButton = this._register(new Button(this._shareButtonContainer, {
      supportIcons: true,
      title: localize("browser.shareWithAgent", "Share with Agent"),
      small: true,
      hoverDelegate
    }));
    this._shareButton.element.classList.add("browser-share-toggle");
    this._shareButton.label = "$(share-window)";
    this._register(this._shareButton.onDidClick(() => {
      this._toggleShareWithAgent();
    }));
    this._register(this.chatService.onDidSubmitRequest((event) => {
      if (this.editor.model?.elementSelectionState.active) {
        void this.editor.model.toggleElementSelection(false);
      }
      const submittedComments = [...this._commentReferences].filter(([, reference]) => reference.widget.viewModel && isEqual(reference.widget.viewModel.sessionResource, event.chatSessionResource));
      if (submittedComments.length > 0) {
        const browserModels = new Set(submittedComments.map(([, reference]) => reference.browserModel));
        const widgets = new Set(submittedComments.map(([, reference]) => reference.widget));
        for (const [attachmentId] of submittedComments) {
          this._commentReferences.delete(attachmentId);
        }
        for (const widget of widgets) {
          this._disposeCommentReferenceListenerIfUnused(widget);
        }
        for (const browserModel of browserModels) {
          this._syncElementComments(browserModel);
          this._disposeCommentModelListenerIfUnused(browserModel);
        }
      }
    }));
  }
  get widgets() {
    return [{ location: BrowserWidgetLocation.PostUrl, element: this._shareButtonContainer, order: 50 }];
  }
  onModelAttached(model, store) {
    this._updateSharingState(true);
    store.add(model.onDidChangeSharingState(() => {
      this._updateSharingState(false);
    }));
    store.add(model.onDidSelectElement(async (data) => {
      const tracksComment = data.comment !== void 0 && data.elementId !== void 0;
      if (tracksComment) {
        this._ensureCommentModelListeners(model);
      }
      let attached = false;
      try {
        attached = await this._attachElementDataToChat(data, model);
      } catch (error) {
        this.logService.error("BrowserEditor.addElementToChat: Failed to attach element", error);
      }
      if (!attached && data.comment !== void 0 && data.elementId && !this._disposedCommentModels.has(model)) {
        this._syncElementComments(model, [data.elementId]);
      }
      if (tracksComment) {
        this._disposeCommentModelListenerIfUnused(model);
      }
    }));
    this._elementSelectionMode = model.elementSelectionState.active ? model.elementSelectionState.options.mode : void 0;
    this._elementSelectionModeContext.set(this._elementSelectionMode);
    store.add(model.onDidChangeElementSelectionState((state) => {
      const wasCommenting = this._elementSelectionMode === BrowserElementSelectionMode.Comment;
      this._elementSelectionMode = state.active ? state.options.mode : void 0;
      this._elementSelectionModeContext.set(this._elementSelectionMode);
      const isCommenting = this._elementSelectionMode === BrowserElementSelectionMode.Comment;
      const accessibilityHelpHint = isCommenting && state.active ? this.accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.BrowserElementCommenting) : void 0;
      this.accessibilityService.status(isCommenting ? state.active ? accessibilityHelpHint ? localize("browser.elementCommentingEnabledWithAccessibilityHelp", "Element commenting enabled. Press Enter to comment on the focused element. {0}", accessibilityHelpHint) : localize("browser.elementCommentingEnabled", "Element commenting enabled. Press Enter to comment on the focused element.") : localize("browser.elementCommentingDisabled", "Element commenting disabled.") : state.active ? localize("browser.elementSelectionEnabled", "Element selection enabled. Press Enter to add the focused element to chat.") : localize("browser.elementSelectionDisabled", "Element selection disabled."));
      if (isCommenting && !wasCommenting) {
        this._commentSessionsWithComments.delete(model);
      } else if (wasCommenting && !isCommenting && this._commentSessionsWithComments.delete(model)) {
        this._focusChatInputForComments(model);
      }
    }));
    this._areaSelectionActiveContext.set(model.isAreaSelectionActive);
    store.add(model.onDidChangeAreaSelectionActive((active) => {
      this._areaSelectionActiveContext.set(active);
    }));
  }
  onModelDetached() {
    if (this.editor.model) {
      this._commentSessionsWithComments.delete(this.editor.model);
    }
    this._elementSelectionModeContext.reset();
    this._elementSelectionMode = void 0;
    this._areaSelectionActiveContext.reset();
  }
  // -- Sharing -------------------------------------------------------
  _toggleShareWithAgent() {
    const model = this.editor.model;
    if (!model) {
      return;
    }
    model.setSharedWithAgent(model.sharingState !== BrowserViewSharingState.Shared);
  }
  _updateSharingState(isInitialState) {
    const model = this.editor.model;
    const isShared = model?.sharingState === BrowserViewSharingState.Shared;
    const isUnavailable = !model || model.sharingState === BrowserViewSharingState.Unavailable;
    this.editor.browserContainer.classList.toggle("animate", !isInitialState);
    this.editor.browserContainer.classList.toggle("shared", isShared);
    this._shareButtonContainer.style.display = isUnavailable ? "none" : "";
    this._shareButton.checked = isShared;
    this._shareButton.label = isShared ? localize("browser.sharingWithAgent", "Sharing with Agent") + " $(share-window)" : "$(share-window)";
    const title = isShared ? localize("browser.unshareWithAgent", "Stop Sharing with Agent") : localize("browser.shareWithAgent", "Share with Agent");
    this._shareButton.setTitle(title);
    this._shareButton.element.setAttribute("aria-label", title);
  }
  /**
   * Confirm with the user that they understand the risks of sharing content on untrusted pages.
   *
   * @returns true if the user confirms (or the page is local / trusted), false if they cancel.
   */
  async _confirmContentAttachmentRisk(url) {
    if (this.storageService.getBoolean(BrowserEditorChatIntegration.SHARING_CONTENT_WARNING_DONT_ASK_KEY, StorageScope.PROFILE)) {
      return true;
    }
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol === "file:") {
        const trustInfo = await this.workspaceTrustManagementService.getUriTrustInfo(URI.file(parsedUrl.pathname));
        if (trustInfo.trusted) {
          return true;
        }
      } else if (parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1" || parsedUrl.hostname === "::1") {
        return true;
      }
    } catch {
    }
    const result = await this.dialogService.confirm({
      type: "warning",
      message: localize("browser.agentSharingContentWarning.message", "Use caution when attaching content from untrusted sources."),
      detail: localize("browser.agentSharingContentWarning.detail", "Pages may contain hidden prompts that can influence agent behavior. Double-check the attached contents before sending."),
      primaryButton: localize("browser.agentSharingContentWarning.ok", "&&OK"),
      checkbox: { label: localize("browser.agentSharingContentWarning.dontShowAgain", "Don't show again"), checked: false }
    });
    if (result.confirmed && result.checkboxChecked) {
      this.storageService.store(BrowserEditorChatIntegration.SHARING_CONTENT_WARNING_DONT_ASK_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
    }
    return result.confirmed;
  }
  // -- Chat widget helpers --------------------------------------------
  /**
   * Reveal the chat widget and wait for its viewModel to be bound before
   * returning. When the chat panel is opened for the first time the session
   * model loads asynchronously, and once it loads {@link ChatInputPart}'s
   * `_syncFromModel` clears any attachments that were added before the model
   * was bound. Callers must use this helper before calling
   * {@linkcode IChatWidget.attachmentModel.addContext} so the attachment is
   * not silently discarded.
   */
  async _revealChatWidgetForAttachment(preserveFocus = false) {
    const widget = await this.chatWidgetService.revealWidget(preserveFocus) ?? this.chatWidgetService.lastFocusedWidget;
    if (widget && !widget.viewModel) {
      await Event.toPromise(widget.onDidChangeViewModel);
    }
    return widget;
  }
  /**
   * Reveal the chat widget and attach the given entries. Returns false if no widget was available.
   * Callers are responsible for running {@link _confirmContentAttachmentRisk} first.
   */
  async _attachToChat(entries) {
    const widget = await this._revealChatWidgetForAttachment();
    if (!widget?.attachmentModel) {
      return false;
    }
    widget.attachmentModel.addContext(...entries);
    return true;
  }
  // -- Element Selection ----------------------------------------------
  async _attachElementDataToChat(elementData, model) {
    const bounds = elementData.bounds;
    const toAttach = [];
    const container = document.createElement("div");
    safeSetInnerHtml(container, elementData.outerHTML);
    const element = container.firstElementChild;
    const innerText = container.textContent;
    let displayNameShort = element ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}` : "";
    let displayNameFull = element ? `${displayNameShort}${element.classList.length ? `.${[...element.classList].join(".")}` : ""}` : "";
    if (elementData.ancestors && elementData.ancestors.length > 0) {
      let last = elementData.ancestors[elementData.ancestors.length - 1];
      let pseudo = "";
      if (last.tagName.startsWith("::") && elementData.ancestors.length > 1) {
        pseudo = last.tagName;
        last = elementData.ancestors[elementData.ancestors.length - 2];
      }
      displayNameShort = `${last.tagName.toLowerCase()}${last.id ? `#${last.id}` : ""}${pseudo}`;
      displayNameFull = `${last.tagName.toLowerCase()}${last.id ? `#${last.id}` : ""}${last.classNames && last.classNames.length ? `.${last.classNames.join(".")}` : ""}${pseudo}`;
    }
    const value = createElementContextValue(elementData, displayNameFull);
    const attachImages = this.configurationService.getValue(BrowserSendElementsToChatAttachImagesSettingId);
    const screenshotBuffer = attachImages ? await model.captureScreenshot({
      quality: 90,
      pageRect: bounds,
      awaitNextPaint: true
    }) : void 0;
    const elementEntry = {
      id: "element-" + Date.now(),
      name: displayNameShort,
      fullName: displayNameFull,
      value,
      modelDescription: "Structured browser element context with HTML path, outer HTML, dimensions, and computed styles.",
      kind: "element",
      icon: ThemeIcon.fromId(Codicon.layout.id),
      ancestors: elementData.ancestors,
      attributes: elementData.attributes,
      computedStyles: elementData.computedStyles,
      dimensions: elementData.dimensions,
      innerText,
      imageData: screenshotBuffer?.buffer,
      imageMimeType: screenshotBuffer ? "image/jpeg" : void 0
    };
    toAttach.push(elementEntry);
    if (!await this._confirmContentAttachmentRisk(elementData.url ?? model.url)) {
      return false;
    }
    const widget = await this._revealChatWidgetForAttachment(elementData.comment !== void 0);
    if (!widget?.attachmentModel || this._disposedCommentModels.has(model)) {
      return false;
    }
    widget.attachmentModel.addContext(...toAttach);
    if (elementData.comment !== void 0 && elementData.elementId) {
      if (!this._insertElementCommentReference(widget, model, elementEntry, toAttach.map((attachment) => attachment.id), elementData.elementId, elementData.comment)) {
        widget.attachmentModel.delete(...toAttach.map((attachment) => attachment.id));
        return false;
      }
      if (model.elementSelectionState.active) {
        this._commentSessionsWithComments.add(model);
      } else {
        widget.focusInput();
      }
    }
    this.telemetryService.publicLog2("integratedBrowser.addElementToChat.added", {
      attachImages
    });
    return true;
  }
  _insertElementCommentReference(widget, browserModel, attachment, attachmentIds, elementId, comment) {
    const inputModel = widget.inputEditor.getModel();
    const dynamicVariableModel = widget.getContrib(ChatDynamicVariableModel.ID);
    if (!inputModel || !dynamicVariableModel) {
      return false;
    }
    const insertionPosition = widget.inputEditor.getPosition() ?? inputModel.getFullModelRange().getEndPosition();
    const prefix = insertionPosition.column > 1 ? "\n" : "";
    const suffix = insertionPosition.column < inputModel.getLineMaxColumn(insertionPosition.lineNumber) ? "\n" : "";
    const reference = `@${attachment.name}`;
    const commentText = comment ? ` ${comment}` : "";
    const text = `${prefix}${reference}${commentText}${suffix}`;
    if (!widget.inputEditor.executeEdits("browserElementComment", [{ range: Range.fromPositions(insertionPosition), text }])) {
      return false;
    }
    const referenceStart = prefix ? { lineNumber: insertionPosition.lineNumber + 1, column: 1 } : insertionPosition;
    const referenceRange = new Range(referenceStart.lineNumber, referenceStart.column, referenceStart.lineNumber, referenceStart.column + reference.length);
    dynamicVariableModel.addReference(toAttachedContextDynamicVariable(attachment, referenceRange));
    widget.inputEditor.setPosition({
      lineNumber: referenceRange.endLineNumber,
      column: referenceRange.endColumn + commentText.length
    });
    this._commentReferences.set(attachment.id, { elementId, attachmentIds, widget, browserModel });
    this._ensureCommentReferenceListeners(widget, dynamicVariableModel);
    this._ensureCommentModelListeners(browserModel);
    this._syncElementComments(browserModel);
    return true;
  }
  _ensureCommentReferenceListeners(widget, dynamicVariableModel) {
    if (this._commentReferenceListeners.has(widget)) {
      return;
    }
    const store = new DisposableStore();
    store.add(dynamicVariableModel.onDidChangeReferences(() => this._syncElementCommentsForWidget(widget)));
    store.add(widget.inputEditor.onDidChangeModelContent(() => this._syncElementCommentsForWidget(widget)));
    store.add(widget.attachmentModel.onDidChange((event) => {
      for (const [attachmentId, tracked] of this._commentReferences) {
        if (tracked.widget === widget && event.deleted.includes(attachmentId)) {
          this._removeElementCommentReference(tracked.browserModel, tracked.elementId);
        }
      }
    }));
    this._commentReferenceListeners.set(widget, store);
  }
  _ensureCommentModelListeners(browserModel) {
    if (this._commentModelListeners.has(browserModel)) {
      return;
    }
    const store = new DisposableStore();
    store.add(browserModel.onDidRemoveElementComment((elementId) => this._removeElementCommentReference(browserModel, elementId)));
    store.add(browserModel.onDidNavigate(() => this._detachElementCommentReferences(browserModel)));
    store.add(browserModel.onWillDispose(() => {
      this._disposedCommentModels.add(browserModel);
      this._detachElementCommentReferences(browserModel, false);
    }));
    this._commentModelListeners.set(browserModel, store);
  }
  _syncElementCommentsForWidget(widget) {
    const browserModels = /* @__PURE__ */ new Set();
    for (const reference of this._commentReferences.values()) {
      if (reference.widget === widget) {
        browserModels.add(reference.browserModel);
      }
    }
    for (const browserModel of browserModels) {
      this._syncElementComments(browserModel);
    }
  }
  _syncElementComments(browserModel, pendingCommentIdsToDiscard) {
    const comments = [];
    for (const [attachmentId, tracked] of this._commentReferences) {
      if (tracked.browserModel !== browserModel) {
        continue;
      }
      const inputModel = tracked.widget.inputEditor.getModel();
      const dynamicVariableModel = tracked.widget.getContrib(ChatDynamicVariableModel.ID);
      if (!inputModel || !dynamicVariableModel) {
        continue;
      }
      const variable = dynamicVariableModel.variables.find((candidate) => candidate.id === attachmentId && candidate.isAttachmentReference);
      if (!variable) {
        this._deleteCommentAttachments(attachmentId, tracked);
        continue;
      }
      const line = inputModel.getLineContent(variable.range.endLineNumber);
      comments.push({
        elementId: tracked.elementId,
        body: line.slice(variable.range.endColumn - 1).trimStart()
      });
    }
    void browserModel.setElementComments({ comments, pendingCommentIdsToDiscard });
  }
  _removeElementCommentReference(browserModel, elementId) {
    for (const [attachmentId, tracked] of this._commentReferences) {
      if (tracked.browserModel !== browserModel || tracked.elementId !== elementId) {
        continue;
      }
      const dynamicVariableModel = tracked.widget.getContrib(ChatDynamicVariableModel.ID);
      const variable = dynamicVariableModel?.variables.find((candidate) => candidate.id === attachmentId && candidate.isAttachmentReference);
      const inputModel = tracked.widget.inputEditor.getModel();
      if (variable && inputModel) {
        const lineNumber = variable.range.startLineNumber;
        const lineRange = lineNumber < inputModel.getLineCount() ? new Range(lineNumber, 1, lineNumber + 1, 1) : lineNumber > 1 ? new Range(lineNumber - 1, inputModel.getLineMaxColumn(lineNumber - 1), lineNumber, inputModel.getLineMaxColumn(lineNumber)) : inputModel.getFullModelRange();
        tracked.widget.inputEditor.executeEdits("browserElementComment", [{
          range: lineRange,
          text: ""
        }]);
      }
      this._deleteCommentAttachments(attachmentId, tracked);
    }
  }
  _detachElementCommentReferences(browserModel, syncComments = true) {
    this._commentSessionsWithComments.delete(browserModel);
    const widgets = /* @__PURE__ */ new Set();
    for (const [attachmentId, reference] of this._commentReferences) {
      if (reference.browserModel === browserModel) {
        widgets.add(reference.widget);
        this._commentReferences.delete(attachmentId);
      }
    }
    for (const widget of widgets) {
      this._disposeCommentReferenceListenerIfUnused(widget);
    }
    this._commentModelListeners.deleteAndDispose(browserModel);
    if (syncComments) {
      void browserModel.setElementComments({ comments: [] });
    }
  }
  _focusChatInputForComments(browserModel) {
    for (const reference of this._commentReferences.values()) {
      if (reference.browserModel === browserModel) {
        reference.widget.focusInput();
        return;
      }
    }
  }
  _deleteCommentAttachments(elementAttachmentId, tracked) {
    this._commentReferences.delete(elementAttachmentId);
    tracked.widget.attachmentModel.delete(...tracked.attachmentIds);
    this._disposeCommentReferenceListenerIfUnused(tracked.widget);
    this._disposeCommentModelListenerIfUnused(tracked.browserModel);
  }
  _disposeCommentReferenceListenerIfUnused(widget) {
    for (const reference of this._commentReferences.values()) {
      if (reference.widget === widget) {
        return;
      }
    }
    this._commentReferenceListeners.deleteAndDispose(widget);
  }
  _disposeCommentModelListenerIfUnused(browserModel) {
    for (const reference of this._commentReferences.values()) {
      if (reference.browserModel === browserModel) {
        return;
      }
    }
    this._commentModelListeners.deleteAndDispose(browserModel);
  }
  // -- Console Logs ---------------------------------------------------
  /**
   * Grab the current console logs from the active console session and attach them to chat.
   */
  async addConsoleLogsToChat() {
    const model = this.editor.model;
    if (!model) {
      return;
    }
    try {
      const logs = await model.getConsoleLogs();
      if (!logs) {
        return;
      }
      if (!await this._confirmContentAttachmentRisk(model.url)) {
        return;
      }
      const toAttach = [];
      toAttach.push({
        id: "console-logs-" + Date.now(),
        name: localize("consoleLogs", "Console Logs"),
        fullName: localize("consoleLogs", "Console Logs"),
        value: logs,
        modelDescription: "Console logs captured from Integrated Browser.",
        kind: "element",
        icon: ThemeIcon.fromId(Codicon.terminal.id)
      });
      await this._attachToChat(toAttach);
    } catch (error) {
      this.logService.error("BrowserEditor.addConsoleLogsToChat: Failed to get console logs", error);
    }
  }
  // -- Screenshot ----------------------------------------------------
  /**
   * Capture a viewport screenshot of the current browser view and attach it to chat.
   */
  async addScreenshotToChat() {
    const model = this.editor.model;
    if (!model) {
      return;
    }
    try {
      const screenshotBuffer = await model.captureScreenshot({ quality: 80 });
      if (!await this._confirmContentAttachmentRisk(model.url)) {
        return;
      }
      const toAttach = [{
        id: "browser-screenshot-" + Date.now(),
        name: localize("browserScreenshot", "Browser Screenshot"),
        fullName: localize("browserScreenshot", "Browser Screenshot"),
        kind: "image",
        value: screenshotBuffer.buffer,
        mimeType: "image/jpeg"
      }];
      if (!await this._attachToChat(toAttach)) {
        return;
      }
      this.telemetryService.publicLog2("integratedBrowser.addScreenshotToChat.added", {
        screenshotType: "viewport"
      });
    } catch (error) {
      this.logService.error("BrowserEditor.addScreenshotToChat: Failed to capture screenshot", error);
    }
  }
  /**
   * Drive the area-screenshot flow: present the drag-to-select picker, capture the
   * user-drawn region, and attach the resulting image to chat.
   */
  async addAreaScreenshotToChat() {
    const model = this.editor.model;
    if (!model) {
      return;
    }
    if (model.isAreaSelectionActive) {
      void model.toggleAreaSelection(false);
      return;
    }
    this.editor.ensureBrowserFocus();
    const pickPromise = Event.toPromise(Event.once(model.onDidPickArea));
    void model.toggleAreaSelection(true);
    const rect = await pickPromise;
    if (!rect) {
      return;
    }
    try {
      const screenshotBuffer = await model.captureScreenshot({ quality: 80, pageRect: rect, awaitNextPaint: true });
      if (!await this._confirmContentAttachmentRisk(model.url)) {
        return;
      }
      const toAttach = [{
        id: "browser-area-screenshot-" + Date.now(),
        name: localize("browserAreaScreenshot", "Browser Area Screenshot"),
        fullName: localize("browserAreaScreenshot", "Browser Area Screenshot"),
        kind: "image",
        value: screenshotBuffer.buffer,
        mimeType: "image/jpeg"
      }];
      if (!await this._attachToChat(toAttach)) {
        return;
      }
      this.telemetryService.publicLog2("integratedBrowser.addScreenshotToChat.added", {
        screenshotType: "area"
      });
    } catch (error) {
      this.logService.error("BrowserEditor.addAreaScreenshotToChat: Failed to capture area screenshot", error);
    }
  }
  /**
   * Capture a full-page screenshot (including content scrolled off-screen) and attach it to chat.
   */
  async addFullPageScreenshotToChat() {
    const model = this.editor.model;
    if (!model) {
      return;
    }
    try {
      const screenshotBuffer = await model.captureScreenshot({ fullPage: true, format: "png" });
      if (!await this._confirmContentAttachmentRisk(model.url)) {
        return;
      }
      const toAttach = [{
        id: "browser-fullpage-screenshot-" + Date.now(),
        name: localize("browserFullPageScreenshot", "Browser Full Page Screenshot"),
        fullName: localize("browserFullPageScreenshot", "Browser Full Page Screenshot"),
        kind: "image",
        value: screenshotBuffer.buffer,
        mimeType: "image/png"
      }];
      if (!await this._attachToChat(toAttach)) {
        return;
      }
      this.telemetryService.publicLog2("integratedBrowser.addScreenshotToChat.added", {
        screenshotType: "fullPage"
      });
    } catch (error) {
      this.logService.error("BrowserEditor.addFullPageScreenshotToChat: Failed to capture full-page screenshot", error);
    }
  }
};
BrowserEditorChatIntegration.SHARING_CONTENT_WARNING_DONT_ASK_KEY = "browserView.agentSharingContentWarning.dontAskAgain";
BrowserEditorChatIntegration = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IChatWidgetService),
  __decorateParam(6, IChatService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, IStorageService),
  __decorateParam(10, IWorkspaceTrustManagementService),
  __decorateParam(11, IAccessibilityService),
  __decorateParam(12, IAccessibleViewService)
], BrowserEditorChatIntegration);
BrowserEditor.registerContribution(BrowserEditorChatIntegration);
const _AddElementToChatAction = class _AddElementToChatAction extends Action2 {
  constructor() {
    super({
      id: _AddElementToChatAction.ID,
      title: localize2("browser.addElementToChatAction", "Add Element to Chat"),
      category: BrowserCategory,
      icon: Codicon.inspect,
      f1: true,
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), ChatContextKeys.enabled),
      toggled: CONTEXT_BROWSER_ELEMENT_SELECTION_MODE.isEqualTo(BrowserElementSelectionMode.Select),
      menu: {
        id: MenuId.BrowserChatActionsMenu,
        group: "1_element",
        order: 1,
        when: ChatContextKeys.enabled
      },
      keybinding: [{
        weight: KeybindingWeight.WorkbenchContrib + 50,
        // Priority over terminal
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC,
        args: { highlightFocusedElement: true }
      }]
    });
  }
  run(accessor, argument) {
    const browserEditor = argument instanceof BrowserEditor ? argument : accessor.get(IEditorService).activeEditorPane;
    if (browserEditor instanceof BrowserEditor) {
      browserEditor.ensureBrowserFocus();
      const model = browserEditor.model;
      if (model) {
        const options = argument instanceof BrowserEditor ? void 0 : argument;
        const isActiveMode = model.elementSelectionState.active && model.elementSelectionState.options.mode !== BrowserElementSelectionMode.Comment;
        void model.toggleElementSelection(!isActiveMode, { ...options, continuous: false, mode: BrowserElementSelectionMode.Select });
      }
    }
  }
};
_AddElementToChatAction.ID = BrowserViewCommandId.AddElementToChat;
let AddElementToChatAction = _AddElementToChatAction;
const _AddElementCommentToChatAction = class _AddElementCommentToChatAction extends Action2 {
  constructor() {
    super({
      id: _AddElementCommentToChatAction.ID,
      title: localize2("browser.addElementCommentToChatAction", "Comment on Elements"),
      category: BrowserCategory,
      icon: Codicon.comment,
      f1: true,
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), ChatContextKeys.enabled),
      toggled: CONTEXT_BROWSER_ELEMENT_SELECTION_MODE.isEqualTo(BrowserElementSelectionMode.Comment),
      menu: {
        id: MenuId.BrowserChatActionsMenu,
        group: "1_element",
        order: 2,
        when: ChatContextKeys.enabled
      },
      keybinding: [{
        weight: KeybindingWeight.WorkbenchContrib + 50,
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC,
        args: { continuous: true, mode: BrowserElementSelectionMode.Comment, highlightFocusedElement: true }
      }]
    });
  }
  run(accessor, argument) {
    const browserEditor = argument instanceof BrowserEditor ? argument : accessor.get(IEditorService).activeEditorPane;
    if (browserEditor instanceof BrowserEditor) {
      browserEditor.ensureBrowserFocus();
      const options = argument instanceof BrowserEditor ? void 0 : argument;
      const model = browserEditor.model;
      if (model) {
        const isActiveMode = model.elementSelectionState.active && model.elementSelectionState.options.mode === BrowserElementSelectionMode.Comment;
        void model.toggleElementSelection(!isActiveMode, { ...options, continuous: true, mode: BrowserElementSelectionMode.Comment });
      }
    }
  }
};
_AddElementCommentToChatAction.ID = BrowserViewCommandId.AddElementCommentToChat;
let AddElementCommentToChatAction = _AddElementCommentToChatAction;
class StopElementSelectionAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.browser.stopElementSelection",
      title: localize2("browser.stopElementSelectionAction", "Stop Element Selection"),
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, ContextKeyExpr.has(CONTEXT_BROWSER_ELEMENT_SELECTION_MODE.key)),
      keybinding: {
        when: ContextKeyExpr.has(CONTEXT_BROWSER_ELEMENT_SELECTION_MODE.key),
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyCode.Escape
      }
    });
  }
  run(accessor) {
    const browserEditor = accessor.get(IEditorService).activeEditorPane;
    if (browserEditor instanceof BrowserEditor) {
      void browserEditor.model?.toggleElementSelection(false);
    }
  }
}
const _AddConsoleLogsToChatAction = class _AddConsoleLogsToChatAction extends Action2 {
  constructor() {
    super({
      id: _AddConsoleLogsToChatAction.ID,
      title: localize2("browser.addConsoleLogsToChatAction", "Add Console Logs to Chat"),
      category: BrowserActionCategory,
      icon: Codicon.output,
      f1: true,
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), ChatContextKeys.enabled),
      menu: {
        id: MenuId.BrowserChatActionsMenu,
        group: "2_logs",
        order: 1,
        when: ChatContextKeys.enabled
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      await browserEditor.getContribution(BrowserEditorChatIntegration)?.addConsoleLogsToChat();
    }
  }
};
_AddConsoleLogsToChatAction.ID = BrowserViewCommandId.AddConsoleLogsToChat;
let AddConsoleLogsToChatAction = _AddConsoleLogsToChatAction;
const _AddScreenshotToChatAction = class _AddScreenshotToChatAction extends Action2 {
  constructor() {
    super({
      id: _AddScreenshotToChatAction.ID,
      title: localize2("browser.addScreenshotToChatAction", "Add Screenshot to Chat"),
      category: BrowserActionCategory,
      icon: Codicon.deviceCamera,
      f1: true,
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), ChatContextKeys.enabled),
      menu: {
        id: MenuId.BrowserChatActionsMenu,
        group: "3_screenshots",
        order: 1,
        when: ChatContextKeys.enabled
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      await browserEditor.getContribution(BrowserEditorChatIntegration)?.addScreenshotToChat();
    }
  }
};
_AddScreenshotToChatAction.ID = BrowserViewCommandId.AddScreenshotToChat;
let AddScreenshotToChatAction = _AddScreenshotToChatAction;
const _AddAreaScreenshotToChatAction = class _AddAreaScreenshotToChatAction extends Action2 {
  constructor() {
    super({
      id: _AddAreaScreenshotToChatAction.ID,
      title: localize2("browser.addAreaScreenshotToChatAction", "Add Area Screenshot to Chat"),
      category: BrowserActionCategory,
      icon: Codicon.screenFull,
      f1: true,
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), ChatContextKeys.enabled),
      toggled: CONTEXT_BROWSER_AREA_SELECTION_ACTIVE,
      menu: {
        id: MenuId.BrowserChatActionsMenu,
        group: "3_screenshots",
        order: 2,
        when: ChatContextKeys.enabled
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      await browserEditor.getContribution(BrowserEditorChatIntegration)?.addAreaScreenshotToChat();
    }
  }
};
_AddAreaScreenshotToChatAction.ID = BrowserViewCommandId.AddAreaScreenshotToChat;
let AddAreaScreenshotToChatAction = _AddAreaScreenshotToChatAction;
const _AddFullPageScreenshotToChatAction = class _AddFullPageScreenshotToChatAction extends Action2 {
  constructor() {
    const enabledSetting = ContextKeyExpr.has("config.workbench.browser.experimentalUserTools.enabled");
    super({
      id: _AddFullPageScreenshotToChatAction.ID,
      title: localize2("browser.addFullPageScreenshotToChatAction", "Add Full Page Screenshot to Chat (Experimental)"),
      category: BrowserActionCategory,
      icon: Codicon.deviceCamera,
      f1: true,
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), ChatContextKeys.enabled, enabledSetting),
      menu: {
        id: MenuId.BrowserChatActionsMenu,
        group: "3_screenshots",
        order: 3,
        when: ContextKeyExpr.and(ChatContextKeys.enabled, enabledSetting)
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      await browserEditor.getContribution(BrowserEditorChatIntegration)?.addFullPageScreenshotToChat();
    }
  }
};
_AddFullPageScreenshotToChatAction.ID = BrowserViewCommandId.AddFullPageScreenshotToChat;
let AddFullPageScreenshotToChatAction = _AddFullPageScreenshotToChatAction;
registerAction2(AddElementToChatAction);
registerAction2(AddElementCommentToChatAction);
registerAction2(StopElementSelectionAction);
registerAction2(AddConsoleLogsToChatAction);
registerAction2(AddScreenshotToChatAction);
registerAction2(AddAreaScreenshotToChatAction);
registerAction2(AddFullPageScreenshotToChatAction);
MenuRegistry.appendMenuItem(MenuId.BrowserActionsToolbar, {
  submenu: MenuId.BrowserChatActionsMenu,
  title: localize2("browser.chatActionsSubmenu", "Add to Chat"),
  icon: Codicon.inspect,
  group: BrowserActionGroup.Tools,
  order: 1,
  when: ChatContextKeys.enabled,
  isSplitButton: {
    togglePrimaryAction: true,
    primaryActionIds: [AddElementToChatAction.ID, AddElementCommentToChatAction.ID]
  }
});
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  ...workbenchConfigurationNodeBase,
  properties: {
    "workbench.browser.enableChatTools": {
      type: "boolean",
      default: true,
      markdownDescription: localize(
        { comment: ["This is the description for a setting."], key: "browser.enableChatTools" },
        "When enabled, chat agents can use browser tools to open and interact with pages in the Integrated Browser."
      ),
      policy: {
        name: "BrowserChatTools",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.110",
        localization: {
          description: {
            key: "browser.enableChatTools",
            value: localize("browser.enableChatTools", "When enabled, chat agents can use browser tools to open and interact with pages in the Integrated Browser.")
          }
        }
      },
      agentsWindow: { default: true }
    },
    "workbench.browser.experimentalUserTools.enabled": {
      type: "boolean",
      default: false,
      experiment: { mode: "startup" },
      tags: ["experimental"],
      markdownDescription: localize(
        { comment: ["This is the description for a setting."], key: "browser.experimentalUserTools.enabled" },
        "When enabled, experimental user-facing tools are available in the Integrated Browser's Add to Chat menu."
      )
    },
    [BrowserSendElementsToChatAttachImagesSettingId]: {
      type: "boolean",
      default: true,
      markdownDescription: localize("workbench.browser.sendElementsToChat.attachImages", "Controls whether a screenshot of the selected element will be added to the chat.")
    }
  }
});
Registry.as(ConfigurationMigrationExtensions.ConfigurationMigration).registerConfigurationMigrations([
  {
    key: "chat.sendElementsToChat.attachImages",
    migrateFn: (value) => {
      const result = [
        ["chat.sendElementsToChat.attachImages", { value: void 0 }]
      ];
      if (typeof value === "boolean") {
        result.push([BrowserSendElementsToChatAttachImagesSettingId, { value }]);
      }
      return result;
    }
  }
]);
export {
  BrowserEditorChatIntegration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFxmZWF0dXJlc1xcYnJvd3NlckVkaXRvckNoYXRGZWF0dXJlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgJCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBDb250ZXh0S2V5RXhwciwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yLCBNZW51SWQsIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBLZXlNb2QsIEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IEJyb3dzZXJFbGVtZW50U2VsZWN0aW9uTW9kZSwgSUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uT3B0aW9ucywgSUVsZW1lbnREYXRhLCBJRWxlbWVudEFuY2VzdG9yLCBCcm93c2VyVmlld0NvbW1hbmRJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyVmlldy5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlclZpZXdNb2RlbCwgQnJvd3NlclZpZXdTaGFyaW5nU3RhdGUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyVmlldy9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgQnJvd3NlckVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2Jyb3dzZXJFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBIb3ZlclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IEJyb3dzZXJFZGl0b3IsIEJyb3dzZXJFZGl0b3JDb250cmlidXRpb24sIEJyb3dzZXJXaWRnZXRMb2NhdGlvbiwgSUJyb3dzZXJFZGl0b3JXaWRnZXQsIEJyb3dzZXJBY3Rpb25DYXRlZ29yeSwgQ09OVEVYVF9CUk9XU0VSX0hBU19FUlJPUiwgQ09OVEVYVF9CUk9XU0VSX0hBU19VUkwsIEJyb3dzZXJBY3Rpb25Hcm91cCB9IGZyb20gJy4uL2Jyb3dzZXJFZGl0b3IuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFBvbGljeUNhdGVnb3J5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcG9saWN5LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbk1pZ3JhdGlvbkV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnksIHdvcmtiZW5jaENvbmZpZ3VyYXRpb25Ob2RlQmFzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IHNhZmVTZXRJbm5lckh0bWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tU2FuaXRpemUuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgQ2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC9icm93c2VyL2F0dGFjaG1lbnRzL2NoYXREeW5hbWljVmFyaWFibGVzLmpzJztcbmltcG9ydCB7IHRvQXR0YWNoZWRDb250ZXh0RHluYW1pY1ZhcmlhYmxlIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IEFjY2Vzc2libGVDb250ZW50UHJvdmlkZXIsIEFjY2Vzc2libGVWaWV3UHJvdmlkZXJJZCwgQWNjZXNzaWJsZVZpZXdUeXBlLCBJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3LmpzJztcbmltcG9ydCB7IEFjY2Vzc2libGVWaWV3UmVnaXN0cnksIElBY2Nlc3NpYmxlVmlld0ltcGxlbWVudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5cbi8vIFJlZ2lzdGVyIHRvb2xzXG5pbXBvcnQgJy4uL3Rvb2xzL2Jyb3dzZXJUb29scy5jb250cmlidXRpb24uanMnO1xuXG4vKipcbiAqIFNldHRpbmcgdGhhdCBjb250cm9scyB3aGV0aGVyIGEgc2NyZWVuc2hvdCBvZiB0aGUgc2VsZWN0ZWQgZWxlbWVudCBpcyBhdHRhY2hlZFxuICogdG8gdGhlIGNoYXQgd2hlbiBzZW5kaW5nIGVsZW1lbnRzIGZyb20gdGhlIEludGVncmF0ZWQgQnJvd3Nlci5cbiAqL1xuY29uc3QgQnJvd3NlclNlbmRFbGVtZW50c1RvQ2hhdEF0dGFjaEltYWdlc1NldHRpbmdJZCA9ICd3b3JrYmVuY2guYnJvd3Nlci5zZW5kRWxlbWVudHNUb0NoYXQuYXR0YWNoSW1hZ2VzJztcblxuLyoqXG4gKiBGb3JtYXQgYW4gYXJyYXkgb2YgZWxlbWVudCBhbmNlc3RvcnMgaW50byBhIENTUy1zZWxlY3Rvci1saWtlIHBhdGggc3RyaW5nLlxuICovXG5mdW5jdGlvbiBmb3JtYXRFbGVtZW50UGF0aChhbmNlc3RvcnM6IHJlYWRvbmx5IElFbGVtZW50QW5jZXN0b3JbXSB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICghYW5jZXN0b3JzIHx8IGFuY2VzdG9ycy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cmV0dXJuIGFuY2VzdG9yc1xuXHRcdC5tYXAoYW5jZXN0b3IgPT4ge1xuXHRcdFx0Y29uc3QgY2xhc3NlcyA9IGFuY2VzdG9yLmNsYXNzTmFtZXM/Lmxlbmd0aCA/IGAuJHthbmNlc3Rvci5jbGFzc05hbWVzLmpvaW4oJy4nKX1gIDogJyc7XG5cdFx0XHRjb25zdCBpZCA9IGFuY2VzdG9yLmlkID8gYCMke2FuY2VzdG9yLmlkfWAgOiAnJztcblx0XHRcdHJldHVybiBgJHthbmNlc3Rvci50YWdOYW1lfSR7aWR9JHtjbGFzc2VzfWA7XG5cdFx0fSlcblx0XHQuam9pbignID4gJyk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnRDb250ZXh0VmFsdWUoZWxlbWVudERhdGE6IElFbGVtZW50RGF0YSwgZGlzcGxheU5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHNlY3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRzZWN0aW9ucy5wdXNoKCdBdHRhY2hlZCBFbGVtZW50IENvbnRleHQgZnJvbSBJbnRlZ3JhdGVkIEJyb3dzZXInKTtcblx0c2VjdGlvbnMucHVzaChgRWxlbWVudDogJHtkaXNwbGF5TmFtZX1gKTtcblxuXHRpZiAoZWxlbWVudERhdGEudXJsKSB7XG5cdFx0c2VjdGlvbnMucHVzaChgVVJMOiAke2VsZW1lbnREYXRhLnVybH1gKTtcblx0fVxuXG5cdGNvbnN0IGh0bWxQYXRoID0gZm9ybWF0RWxlbWVudFBhdGgoZWxlbWVudERhdGEuYW5jZXN0b3JzKTtcblx0aWYgKGh0bWxQYXRoKSB7XG5cdFx0c2VjdGlvbnMucHVzaChgSFRNTCBQYXRoOiAke2h0bWxQYXRofWApO1xuXHR9XG5cblx0c2VjdGlvbnMucHVzaChgT3V0ZXIgSFRNTDpcXG5cXGBcXGBcXGBodG1sXFxuJHtlbGVtZW50RGF0YS5vdXRlckhUTUx9XFxuXFxgXFxgXFxgYCk7XG5cblx0aWYgKGVsZW1lbnREYXRhLmRpbWVuc2lvbnMpIHtcblx0XHRjb25zdCB7IHRvcCwgbGVmdCwgd2lkdGgsIGhlaWdodCB9ID0gZWxlbWVudERhdGEuZGltZW5zaW9ucztcblx0XHRzZWN0aW9ucy5wdXNoKFxuXHRcdFx0YERpbWVuc2lvbnM6XFxuLSB0b3A6ICR7TWF0aC5yb3VuZCh0b3ApfXB4XFxuLSBsZWZ0OiAke01hdGgucm91bmQobGVmdCl9cHhcXG4tIHdpZHRoOiAke01hdGgucm91bmQod2lkdGgpfXB4XFxuLSBoZWlnaHQ6ICR7TWF0aC5yb3VuZChoZWlnaHQpfXB4YFxuXHRcdCk7XG5cdH1cblxuXHRzZWN0aW9ucy5wdXNoKGBDU1M6XFxuXFxgXFxgXFxgY3NzXFxuJHtlbGVtZW50RGF0YS5jb21wdXRlZFN0eWxlfVxcblxcYFxcYFxcYGApO1xuXG5cdHJldHVybiBzZWN0aW9ucy5qb2luKCdcXG5cXG4nKTtcbn1cblxuLy8gQ29udGV4dCBrZXkgZXhwcmVzc2lvbiB0byBjaGVjayBpZiBicm93c2VyIGVkaXRvciBpcyBhY3RpdmVcbmNvbnN0IEJST1dTRVJfRURJVE9SX0FDVElWRSA9IENvbnRleHRLZXlFeHByLmVxdWFscygnYWN0aXZlRWRpdG9yJywgQnJvd3NlckVkaXRvcklucHV0LkVESVRPUl9JRCk7XG5jb25zdCBCcm93c2VyQ2F0ZWdvcnkgPSBsb2NhbGl6ZTIoJ2Jyb3dzZXJDYXRlZ29yeScsIFwiQnJvd3NlclwiKTtcblxuY29uc3QgQ09OVEVYVF9CUk9XU0VSX0VMRU1FTlRfU0VMRUNUSU9OX01PREUgPSBuZXcgUmF3Q29udGV4dEtleTxCcm93c2VyRWxlbWVudFNlbGVjdGlvbk1vZGUgfCB1bmRlZmluZWQ+KCdicm93c2VyRWxlbWVudFNlbGVjdGlvbk1vZGUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdicm93c2VyLmVsZW1lbnRTZWxlY3Rpb25Nb2RlJywgXCJUaGUgYWN0aXZlIGVsZW1lbnQgc2VsZWN0aW9uIG1vZGVcIikpO1xuY29uc3QgQ09OVEVYVF9CUk9XU0VSX0FSRUFfU0VMRUNUSU9OX0FDVElWRSA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdicm93c2VyQXJlYVNlbGVjdGlvbkFjdGl2ZScsIGZhbHNlLCBsb2NhbGl6ZSgnYnJvd3Nlci5hcmVhU2VsZWN0aW9uQWN0aXZlJywgXCJXaGV0aGVyIGFyZWEgc2VsZWN0aW9uIGlzIGN1cnJlbnRseSBhY3RpdmVcIikpO1xuXG5jbGFzcyBCcm93c2VyRWxlbWVudENvbW1lbnRpbmdBY2Nlc3NpYmlsaXR5SGVscCBpbXBsZW1lbnRzIElBY2Nlc3NpYmxlVmlld0ltcGxlbWVudGF0aW9uIHtcblx0cmVhZG9ubHkgdHlwZSA9IEFjY2Vzc2libGVWaWV3VHlwZS5IZWxwO1xuXHRyZWFkb25seSBwcmlvcml0eSA9IDExMDtcblx0cmVhZG9ubHkgbmFtZSA9ICdicm93c2VyRWxlbWVudENvbW1lbnRpbmcnO1xuXHRyZWFkb25seSB3aGVuID0gQ09OVEVYVF9CUk9XU0VSX0VMRU1FTlRfU0VMRUNUSU9OX01PREUuaXNFcXVhbFRvKEJyb3dzZXJFbGVtZW50U2VsZWN0aW9uTW9kZS5Db21tZW50KTtcblxuXHRnZXRQcm92aWRlcihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IEFjY2Vzc2libGVDb250ZW50UHJvdmlkZXIgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKCEoZWRpdG9yUGFuZSBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IEFjY2Vzc2libGVDb250ZW50UHJvdmlkZXIoXG5cdFx0XHRBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQuQnJvd3NlckVsZW1lbnRDb21tZW50aW5nLFxuXHRcdFx0eyB0eXBlOiBBY2Nlc3NpYmxlVmlld1R5cGUuSGVscCB9LFxuXHRcdFx0KCkgPT4gW1xuXHRcdFx0XHRsb2NhbGl6ZSgnYnJvd3Nlci5lbGVtZW50Q29tbWVudGluZ0FjY2Vzc2liaWxpdHlIZWxwLm92ZXJ2aWV3JywgXCJZb3UgYXJlIGluIEludGVncmF0ZWQgQnJvd3NlciBlbGVtZW50IGNvbW1lbnRpbmcgbW9kZS5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdicm93c2VyLmVsZW1lbnRDb21tZW50aW5nQWNjZXNzaWJpbGl0eUhlbHAubmF2aWdhdGlvbicsIFwiVXNlIFRhYiBhbmQgU2hpZnQrVGFiIHRvIG1vdmUgdGhyb3VnaCBmb2N1c2FibGUgcGFnZSBlbGVtZW50cy4gUHJlc3MgRW50ZXIgdG8gY29tbWVudCBvbiB0aGUgZm9jdXNlZCBlbGVtZW50LlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2Jyb3dzZXIuZWxlbWVudENvbW1lbnRpbmdBY2Nlc3NpYmlsaXR5SGVscC5jb21wb3NlcicsIFwiSW4gdGhlIGNvbW1lbnQgaW5wdXQsIHByZXNzIEVudGVyIHRvIGFkZCB0aGUgY29tbWVudCBvciBFc2NhcGUgdG8gY2FuY2VsIGl0LlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2Jyb3dzZXIuZWxlbWVudENvbW1lbnRpbmdBY2Nlc3NpYmlsaXR5SGVscC5jb250aW51b3VzJywgXCJDb21tZW50aW5nIG1vZGUgcmVtYWlucyBhY3RpdmUgYWZ0ZXIgYWRkaW5nIGEgY29tbWVudC4gUHJlc3MgRXNjYXBlIG91dHNpZGUgdGhlIGNvbW1lbnQgaW5wdXQgdG8gc3RvcCBjb21tZW50aW5nLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2Jyb3dzZXIuZWxlbWVudENvbW1lbnRpbmdBY2Nlc3NpYmlsaXR5SGVscC5waW5zJywgXCJOdW1iZXJlZCBjb21tZW50IHBpbnMgYXJlIGluIHRoZSBwYWdlIHRhYiBvcmRlci4gRm9jdXMgYSBwaW4gdG8gcHJldmlldyBpdHMgY29tbWVudCwgdGhlbiBUYWIgdG8gaXRzIFJlbW92ZSBDb21tZW50IGJ1dHRvbi5cIiksXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0KCkgPT4gZWRpdG9yUGFuZS5mb2N1cygpLFxuXHRcdFx0QWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5Ccm93c2VyRWxlbWVudENvbW1lbnRpbmdcblx0XHQpO1xuXHR9XG59XG5cbkFjY2Vzc2libGVWaWV3UmVnaXN0cnkucmVnaXN0ZXIobmV3IEJyb3dzZXJFbGVtZW50Q29tbWVudGluZ0FjY2Vzc2liaWxpdHlIZWxwKCkpO1xuXG50eXBlIEludGVncmF0ZWRCcm93c2VyQWRkU2NyZWVuc2hvdFRvQ2hhdEFkZGVkRXZlbnQgPSB7XG5cdHNjcmVlbnNob3RUeXBlOiAndmlld3BvcnQnIHwgJ2FyZWEnIHwgJ2Z1bGxQYWdlJztcbn07XG5cbnR5cGUgSW50ZWdyYXRlZEJyb3dzZXJBZGRTY3JlZW5zaG90VG9DaGF0QWRkZWRDbGFzc2lmaWNhdGlvbiA9IHtcblx0c2NyZWVuc2hvdFR5cGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGF0IGtpbmQgb2Ygc2NyZWVuc2hvdCB3YXMgY2FwdHVyZWQgKHZpZXdwb3J0LCBhcmVhLCBvciBmdWxsUGFnZSkuJyB9O1xuXHRvd25lcjogJ2pydWFsZXMnO1xuXHRjb21tZW50OiAnQSBzY3JlZW5zaG90IHdhcyBzdWNjZXNzZnVsbHkgYWRkZWQgdG8gY2hhdCBmcm9tIEludGVncmF0ZWQgQnJvd3Nlci4nO1xufTtcblxuXG4vKipcbiAqIENvbnRyaWJ1dGlvbiB0aGF0IG1hbmFnZXMgZWxlbWVudCBzZWxlY3Rpb24sIGVsZW1lbnQgYXR0YWNobWVudCB0byBjaGF0LFxuICogY29uc29sZSBsb2cgYXR0YWNobWVudCB0byBjaGF0LCBhbmQgYWdlbnQgc2hhcmluZy5cbiAqL1xuZXhwb3J0IGNsYXNzIEJyb3dzZXJFZGl0b3JDaGF0SW50ZWdyYXRpb24gZXh0ZW5kcyBCcm93c2VyRWRpdG9yQ29udHJpYnV0aW9uIHtcblx0cHJpdmF0ZSByZWFkb25seSBfZWxlbWVudFNlbGVjdGlvbk1vZGVDb250ZXh0OiBJQ29udGV4dEtleTxCcm93c2VyRWxlbWVudFNlbGVjdGlvbk1vZGUgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hcmVhU2VsZWN0aW9uQWN0aXZlQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX2VsZW1lbnRTZWxlY3Rpb25Nb2RlOiBCcm93c2VyRWxlbWVudFNlbGVjdGlvbk1vZGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1lbnRSZWZlcmVuY2VzID0gbmV3IE1hcDxzdHJpbmcsIHsgZWxlbWVudElkOiBzdHJpbmc7IGF0dGFjaG1lbnRJZHM6IHJlYWRvbmx5IHN0cmluZ1tdOyB3aWRnZXQ6IElDaGF0V2lkZ2V0OyBicm93c2VyTW9kZWw6IElCcm93c2VyVmlld01vZGVsIH0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1lbnRSZWZlcmVuY2VMaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxJQ2hhdFdpZGdldCwgRGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWVudE1vZGVsTGlzdGVuZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8SUJyb3dzZXJWaWV3TW9kZWwsIERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2VkQ29tbWVudE1vZGVscyA9IG5ldyBXZWFrU2V0PElCcm93c2VyVmlld01vZGVsPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tZW50U2Vzc2lvbnNXaXRoQ29tbWVudHMgPSBuZXcgU2V0PElCcm93c2VyVmlld01vZGVsPigpO1xuXG5cdC8vIFNoYXJlIHdpdGggQWdlbnRcblx0cHJpdmF0ZSByZWFkb25seSBfc2hhcmVCdXR0b25Db250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zaGFyZUJ1dHRvbjogQnV0dG9uO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogQnJvd3NlckVkaXRvcixcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJsZVZpZXdTZXJ2aWNlOiBJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihlZGl0b3IpO1xuXHRcdHRoaXMuX2VsZW1lbnRTZWxlY3Rpb25Nb2RlQ29udGV4dCA9IENPTlRFWFRfQlJPV1NFUl9FTEVNRU5UX1NFTEVDVElPTl9NT0RFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fYXJlYVNlbGVjdGlvbkFjdGl2ZUNvbnRleHQgPSBDT05URVhUX0JST1dTRVJfQVJFQV9TRUxFQ1RJT05fQUNUSVZFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHQvLyBCdWlsZCBzaGFyZSB0b2dnbGUgYnV0dG9uXG5cdFx0Y29uc3QgaG92ZXJEZWxlZ2F0ZSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0V29ya2JlbmNoSG92ZXJEZWxlZ2F0ZSxcblx0XHRcdCdlbGVtZW50Jyxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHsgcG9zaXRpb246IHsgaG92ZXJQb3NpdGlvbjogSG92ZXJQb3NpdGlvbi5BQk9WRSB9IH1cblx0XHQpKTtcblxuXHRcdHRoaXMuX3NoYXJlQnV0dG9uQ29udGFpbmVyID0gJCgnLmJyb3dzZXItc2hhcmUtdG9nZ2xlLWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuX3NoYXJlQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbih0aGlzLl9zaGFyZUJ1dHRvbkNvbnRhaW5lciwge1xuXHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdicm93c2VyLnNoYXJlV2l0aEFnZW50JywgXCJTaGFyZSB3aXRoIEFnZW50XCIpLFxuXHRcdFx0c21hbGw6IHRydWUsXG5cdFx0XHRob3ZlckRlbGVnYXRlXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3NoYXJlQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnYnJvd3Nlci1zaGFyZS10b2dnbGUnKTtcblx0XHR0aGlzLl9zaGFyZUJ1dHRvbi5sYWJlbCA9ICckKHNoYXJlLXdpbmRvdyknO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc2hhcmVCdXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHR0aGlzLl90b2dnbGVTaGFyZVdpdGhBZ2VudCgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEF1dG8tZGlzYWJsZSBlbGVtZW50IHNlbGVjdGlvbiB3aGVuIHRoZSB1c2VyIHNlbmRzIGEgY2hhdCByZXF1ZXN0LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdFNlcnZpY2Uub25EaWRTdWJtaXRSZXF1ZXN0KGV2ZW50ID0+IHtcblx0XHRcdGlmICh0aGlzLmVkaXRvci5tb2RlbD8uZWxlbWVudFNlbGVjdGlvblN0YXRlLmFjdGl2ZSkge1xuXHRcdFx0XHR2b2lkIHRoaXMuZWRpdG9yLm1vZGVsLnRvZ2dsZUVsZW1lbnRTZWxlY3Rpb24oZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3VibWl0dGVkQ29tbWVudHMgPSBbLi4udGhpcy5fY29tbWVudFJlZmVyZW5jZXNdXG5cdFx0XHRcdC5maWx0ZXIoKFssIHJlZmVyZW5jZV0pID0+IHJlZmVyZW5jZS53aWRnZXQudmlld01vZGVsICYmIGlzRXF1YWwocmVmZXJlbmNlLndpZGdldC52aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlLCBldmVudC5jaGF0U2Vzc2lvblJlc291cmNlKSk7XG5cdFx0XHRpZiAoc3VibWl0dGVkQ29tbWVudHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBicm93c2VyTW9kZWxzID0gbmV3IFNldChzdWJtaXR0ZWRDb21tZW50cy5tYXAoKFssIHJlZmVyZW5jZV0pID0+IHJlZmVyZW5jZS5icm93c2VyTW9kZWwpKTtcblx0XHRcdFx0Y29uc3Qgd2lkZ2V0cyA9IG5ldyBTZXQoc3VibWl0dGVkQ29tbWVudHMubWFwKChbLCByZWZlcmVuY2VdKSA9PiByZWZlcmVuY2Uud2lkZ2V0KSk7XG5cdFx0XHRcdGZvciAoY29uc3QgW2F0dGFjaG1lbnRJZF0gb2Ygc3VibWl0dGVkQ29tbWVudHMpIHtcblx0XHRcdFx0XHR0aGlzLl9jb21tZW50UmVmZXJlbmNlcy5kZWxldGUoYXR0YWNobWVudElkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IHdpZGdldCBvZiB3aWRnZXRzKSB7XG5cdFx0XHRcdFx0dGhpcy5fZGlzcG9zZUNvbW1lbnRSZWZlcmVuY2VMaXN0ZW5lcklmVW51c2VkKHdpZGdldCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBicm93c2VyTW9kZWwgb2YgYnJvd3Nlck1vZGVscykge1xuXHRcdFx0XHRcdHRoaXMuX3N5bmNFbGVtZW50Q29tbWVudHMoYnJvd3Nlck1vZGVsKTtcblx0XHRcdFx0XHR0aGlzLl9kaXNwb3NlQ29tbWVudE1vZGVsTGlzdGVuZXJJZlVudXNlZChicm93c2VyTW9kZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IHdpZGdldHMoKTogcmVhZG9ubHkgSUJyb3dzZXJFZGl0b3JXaWRnZXRbXSB7XG5cdFx0cmV0dXJuIFt7IGxvY2F0aW9uOiBCcm93c2VyV2lkZ2V0TG9jYXRpb24uUG9zdFVybCwgZWxlbWVudDogdGhpcy5fc2hhcmVCdXR0b25Db250YWluZXIsIG9yZGVyOiA1MCB9XTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvbk1vZGVsQXR0YWNoZWQobW9kZWw6IElCcm93c2VyVmlld01vZGVsLCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cdFx0Ly8gTWFuYWdlIHNoYXJpbmcgc3RhdGVcblx0XHR0aGlzLl91cGRhdGVTaGFyaW5nU3RhdGUodHJ1ZSk7XG5cdFx0c3RvcmUuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlU2hhcmluZ1N0YXRlKCgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZVNoYXJpbmdTdGF0ZShmYWxzZSk7XG5cdFx0fSkpO1xuXHRcdHN0b3JlLmFkZChtb2RlbC5vbkRpZFNlbGVjdEVsZW1lbnQoYXN5bmMgZGF0YSA9PiB7XG5cdFx0XHRjb25zdCB0cmFja3NDb21tZW50ID0gZGF0YS5jb21tZW50ICE9PSB1bmRlZmluZWQgJiYgZGF0YS5lbGVtZW50SWQgIT09IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0cmFja3NDb21tZW50KSB7XG5cdFx0XHRcdHRoaXMuX2Vuc3VyZUNvbW1lbnRNb2RlbExpc3RlbmVycyhtb2RlbCk7XG5cdFx0XHR9XG5cdFx0XHRsZXQgYXR0YWNoZWQgPSBmYWxzZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF0dGFjaGVkID0gYXdhaXQgdGhpcy5fYXR0YWNoRWxlbWVudERhdGFUb0NoYXQoZGF0YSwgbW9kZWwpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdCcm93c2VyRWRpdG9yLmFkZEVsZW1lbnRUb0NoYXQ6IEZhaWxlZCB0byBhdHRhY2ggZWxlbWVudCcsIGVycm9yKTtcblx0XHRcdH1cblx0XHRcdGlmICghYXR0YWNoZWQgJiYgZGF0YS5jb21tZW50ICE9PSB1bmRlZmluZWQgJiYgZGF0YS5lbGVtZW50SWQgJiYgIXRoaXMuX2Rpc3Bvc2VkQ29tbWVudE1vZGVscy5oYXMobW9kZWwpKSB7XG5cdFx0XHRcdHRoaXMuX3N5bmNFbGVtZW50Q29tbWVudHMobW9kZWwsIFtkYXRhLmVsZW1lbnRJZF0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRyYWNrc0NvbW1lbnQpIHtcblx0XHRcdFx0dGhpcy5fZGlzcG9zZUNvbW1lbnRNb2RlbExpc3RlbmVySWZVbnVzZWQobW9kZWwpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFN5bmMgY29udGV4dCBrZXkgd2l0aCBtb2RlbCBzdGF0ZVxuXHRcdHRoaXMuX2VsZW1lbnRTZWxlY3Rpb25Nb2RlID0gbW9kZWwuZWxlbWVudFNlbGVjdGlvblN0YXRlLmFjdGl2ZSA/IG1vZGVsLmVsZW1lbnRTZWxlY3Rpb25TdGF0ZS5vcHRpb25zLm1vZGUgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZWxlbWVudFNlbGVjdGlvbk1vZGVDb250ZXh0LnNldCh0aGlzLl9lbGVtZW50U2VsZWN0aW9uTW9kZSk7XG5cdFx0c3RvcmUuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlRWxlbWVudFNlbGVjdGlvblN0YXRlKHN0YXRlID0+IHtcblx0XHRcdGNvbnN0IHdhc0NvbW1lbnRpbmcgPSB0aGlzLl9lbGVtZW50U2VsZWN0aW9uTW9kZSA9PT0gQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25Nb2RlLkNvbW1lbnQ7XG5cdFx0XHR0aGlzLl9lbGVtZW50U2VsZWN0aW9uTW9kZSA9IHN0YXRlLmFjdGl2ZSA/IHN0YXRlLm9wdGlvbnMubW9kZSA6IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2VsZW1lbnRTZWxlY3Rpb25Nb2RlQ29udGV4dC5zZXQodGhpcy5fZWxlbWVudFNlbGVjdGlvbk1vZGUpO1xuXHRcdFx0Y29uc3QgaXNDb21tZW50aW5nID0gdGhpcy5fZWxlbWVudFNlbGVjdGlvbk1vZGUgPT09IEJyb3dzZXJFbGVtZW50U2VsZWN0aW9uTW9kZS5Db21tZW50O1xuXHRcdFx0Y29uc3QgYWNjZXNzaWJpbGl0eUhlbHBIaW50ID0gaXNDb21tZW50aW5nICYmIHN0YXRlLmFjdGl2ZVxuXHRcdFx0XHQ/IHRoaXMuYWNjZXNzaWJsZVZpZXdTZXJ2aWNlLmdldE9wZW5BcmlhSGludChBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLkJyb3dzZXJFbGVtZW50Q29tbWVudGluZylcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLnN0YXR1cyhpc0NvbW1lbnRpbmdcblx0XHRcdFx0PyBzdGF0ZS5hY3RpdmVcblx0XHRcdFx0XHQ/IGFjY2Vzc2liaWxpdHlIZWxwSGludFxuXHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnYnJvd3Nlci5lbGVtZW50Q29tbWVudGluZ0VuYWJsZWRXaXRoQWNjZXNzaWJpbGl0eUhlbHAnLCBcIkVsZW1lbnQgY29tbWVudGluZyBlbmFibGVkLiBQcmVzcyBFbnRlciB0byBjb21tZW50IG9uIHRoZSBmb2N1c2VkIGVsZW1lbnQuIHswfVwiLCBhY2Nlc3NpYmlsaXR5SGVscEhpbnQpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdicm93c2VyLmVsZW1lbnRDb21tZW50aW5nRW5hYmxlZCcsIFwiRWxlbWVudCBjb21tZW50aW5nIGVuYWJsZWQuIFByZXNzIEVudGVyIHRvIGNvbW1lbnQgb24gdGhlIGZvY3VzZWQgZWxlbWVudC5cIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdicm93c2VyLmVsZW1lbnRDb21tZW50aW5nRGlzYWJsZWQnLCBcIkVsZW1lbnQgY29tbWVudGluZyBkaXNhYmxlZC5cIilcblx0XHRcdFx0OiBzdGF0ZS5hY3RpdmVcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdicm93c2VyLmVsZW1lbnRTZWxlY3Rpb25FbmFibGVkJywgXCJFbGVtZW50IHNlbGVjdGlvbiBlbmFibGVkLiBQcmVzcyBFbnRlciB0byBhZGQgdGhlIGZvY3VzZWQgZWxlbWVudCB0byBjaGF0LlwiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2Jyb3dzZXIuZWxlbWVudFNlbGVjdGlvbkRpc2FibGVkJywgXCJFbGVtZW50IHNlbGVjdGlvbiBkaXNhYmxlZC5cIikpO1xuXHRcdFx0aWYgKGlzQ29tbWVudGluZyAmJiAhd2FzQ29tbWVudGluZykge1xuXHRcdFx0XHR0aGlzLl9jb21tZW50U2Vzc2lvbnNXaXRoQ29tbWVudHMuZGVsZXRlKG1vZGVsKTtcblx0XHRcdH0gZWxzZSBpZiAod2FzQ29tbWVudGluZyAmJiAhaXNDb21tZW50aW5nICYmIHRoaXMuX2NvbW1lbnRTZXNzaW9uc1dpdGhDb21tZW50cy5kZWxldGUobW9kZWwpKSB7XG5cdFx0XHRcdHRoaXMuX2ZvY3VzQ2hhdElucHV0Rm9yQ29tbWVudHMobW9kZWwpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9hcmVhU2VsZWN0aW9uQWN0aXZlQ29udGV4dC5zZXQobW9kZWwuaXNBcmVhU2VsZWN0aW9uQWN0aXZlKTtcblx0XHRzdG9yZS5hZGQobW9kZWwub25EaWRDaGFuZ2VBcmVhU2VsZWN0aW9uQWN0aXZlKGFjdGl2ZSA9PiB7XG5cdFx0XHR0aGlzLl9hcmVhU2VsZWN0aW9uQWN0aXZlQ29udGV4dC5zZXQoYWN0aXZlKTtcblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSBvbk1vZGVsRGV0YWNoZWQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZWRpdG9yLm1vZGVsKSB7XG5cdFx0XHR0aGlzLl9jb21tZW50U2Vzc2lvbnNXaXRoQ29tbWVudHMuZGVsZXRlKHRoaXMuZWRpdG9yLm1vZGVsKTtcblx0XHR9XG5cdFx0dGhpcy5fZWxlbWVudFNlbGVjdGlvbk1vZGVDb250ZXh0LnJlc2V0KCk7XG5cdFx0dGhpcy5fZWxlbWVudFNlbGVjdGlvbk1vZGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fYXJlYVNlbGVjdGlvbkFjdGl2ZUNvbnRleHQucmVzZXQoKTtcblx0fVxuXG5cdC8vIC0tIFNoYXJpbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgX3RvZ2dsZVNoYXJlV2l0aEFnZW50KCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IubW9kZWw7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRtb2RlbC5zZXRTaGFyZWRXaXRoQWdlbnQobW9kZWwuc2hhcmluZ1N0YXRlICE9PSBCcm93c2VyVmlld1NoYXJpbmdTdGF0ZS5TaGFyZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlU2hhcmluZ1N0YXRlKGlzSW5pdGlhbFN0YXRlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5tb2RlbDtcblx0XHRjb25zdCBpc1NoYXJlZCA9IG1vZGVsPy5zaGFyaW5nU3RhdGUgPT09IEJyb3dzZXJWaWV3U2hhcmluZ1N0YXRlLlNoYXJlZDtcblx0XHRjb25zdCBpc1VuYXZhaWxhYmxlID0gIW1vZGVsIHx8IG1vZGVsLnNoYXJpbmdTdGF0ZSA9PT0gQnJvd3NlclZpZXdTaGFyaW5nU3RhdGUuVW5hdmFpbGFibGU7XG5cblx0XHR0aGlzLmVkaXRvci5icm93c2VyQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2FuaW1hdGUnLCAhaXNJbml0aWFsU3RhdGUpO1xuXHRcdHRoaXMuZWRpdG9yLmJyb3dzZXJDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnc2hhcmVkJywgaXNTaGFyZWQpO1xuXG5cdFx0dGhpcy5fc2hhcmVCdXR0b25Db250YWluZXIuc3R5bGUuZGlzcGxheSA9IGlzVW5hdmFpbGFibGUgPyAnbm9uZScgOiAnJztcblx0XHR0aGlzLl9zaGFyZUJ1dHRvbi5jaGVja2VkID0gaXNTaGFyZWQ7XG5cdFx0dGhpcy5fc2hhcmVCdXR0b24ubGFiZWwgPSBpc1NoYXJlZFxuXHRcdFx0PyBsb2NhbGl6ZSgnYnJvd3Nlci5zaGFyaW5nV2l0aEFnZW50JywgXCJTaGFyaW5nIHdpdGggQWdlbnRcIikgKyAnICQoc2hhcmUtd2luZG93KSdcblx0XHRcdDogJyQoc2hhcmUtd2luZG93KSc7XG5cblx0XHRjb25zdCB0aXRsZSA9IGlzU2hhcmVkXG5cdFx0XHQ/IGxvY2FsaXplKCdicm93c2VyLnVuc2hhcmVXaXRoQWdlbnQnLCBcIlN0b3AgU2hhcmluZyB3aXRoIEFnZW50XCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdicm93c2VyLnNoYXJlV2l0aEFnZW50JywgXCJTaGFyZSB3aXRoIEFnZW50XCIpO1xuXHRcdHRoaXMuX3NoYXJlQnV0dG9uLnNldFRpdGxlKHRpdGxlKTtcblx0XHR0aGlzLl9zaGFyZUJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRpdGxlKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNIQVJJTkdfQ09OVEVOVF9XQVJOSU5HX0RPTlRfQVNLX0tFWSA9ICdicm93c2VyVmlldy5hZ2VudFNoYXJpbmdDb250ZW50V2FybmluZy5kb250QXNrQWdhaW4nO1xuXG5cdC8qKlxuXHQgKiBDb25maXJtIHdpdGggdGhlIHVzZXIgdGhhdCB0aGV5IHVuZGVyc3RhbmQgdGhlIHJpc2tzIG9mIHNoYXJpbmcgY29udGVudCBvbiB1bnRydXN0ZWQgcGFnZXMuXG5cdCAqXG5cdCAqIEByZXR1cm5zIHRydWUgaWYgdGhlIHVzZXIgY29uZmlybXMgKG9yIHRoZSBwYWdlIGlzIGxvY2FsIC8gdHJ1c3RlZCksIGZhbHNlIGlmIHRoZXkgY2FuY2VsLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfY29uZmlybUNvbnRlbnRBdHRhY2htZW50Umlzayh1cmw6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdC8vIElmIHRoZSB1c2VyIHByZXZpb3VzbHkgY2hvc2UgXCJEb24ndCBzaG93IGFnYWluXCIsIHNraXAgdGhlIGRpYWxvZ1xuXHRcdGlmICh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oQnJvd3NlckVkaXRvckNoYXRJbnRlZ3JhdGlvbi5TSEFSSU5HX0NPTlRFTlRfV0FSTklOR19ET05UX0FTS19LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcnNlZFVybCA9IG5ldyBVUkwodXJsKTtcblx0XHRcdGlmIChwYXJzZWRVcmwucHJvdG9jb2wgPT09ICdmaWxlOicpIHtcblx0XHRcdFx0Ly8gUXVlcnkgdGhlIHdvcmtzcGFjZSB0cnVzdCBzZXJ2aWNlIGZvciBmaWxlIFVSTHNcblx0XHRcdFx0Y29uc3QgdHJ1c3RJbmZvID0gYXdhaXQgdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmdldFVyaVRydXN0SW5mbyhVUkkuZmlsZShwYXJzZWRVcmwucGF0aG5hbWUpKTtcblx0XHRcdFx0aWYgKHRydXN0SW5mby50cnVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAocGFyc2VkVXJsLmhvc3RuYW1lID09PSAnbG9jYWxob3N0JyB8fCBwYXJzZWRVcmwuaG9zdG5hbWUgPT09ICcxMjcuMC4wLjEnIHx8IHBhcnNlZFVybC5ob3N0bmFtZSA9PT0gJzo6MScpIHtcblx0XHRcdFx0Ly8gQ29uc2lkZXIgbG9jYWxob3N0IFVSTHMgdHJ1c3RlZFxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIEludmFsaWQgVVJMIC0gZmFsbCB0aHJvdWdoIHRvIHRoZSB3YXJuaW5nXG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0dHlwZTogJ3dhcm5pbmcnLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2Jyb3dzZXIuYWdlbnRTaGFyaW5nQ29udGVudFdhcm5pbmcubWVzc2FnZScsIFwiVXNlIGNhdXRpb24gd2hlbiBhdHRhY2hpbmcgY29udGVudCBmcm9tIHVudHJ1c3RlZCBzb3VyY2VzLlwiKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2Jyb3dzZXIuYWdlbnRTaGFyaW5nQ29udGVudFdhcm5pbmcuZGV0YWlsJywgXCJQYWdlcyBtYXkgY29udGFpbiBoaWRkZW4gcHJvbXB0cyB0aGF0IGNhbiBpbmZsdWVuY2UgYWdlbnQgYmVoYXZpb3IuIERvdWJsZS1jaGVjayB0aGUgYXR0YWNoZWQgY29udGVudHMgYmVmb3JlIHNlbmRpbmcuXCIpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ2Jyb3dzZXIuYWdlbnRTaGFyaW5nQ29udGVudFdhcm5pbmcub2snLCBcIiYmT0tcIiksXG5cdFx0XHRjaGVja2JveDogeyBsYWJlbDogbG9jYWxpemUoJ2Jyb3dzZXIuYWdlbnRTaGFyaW5nQ29udGVudFdhcm5pbmcuZG9udFNob3dBZ2FpbicsIFwiRG9uJ3Qgc2hvdyBhZ2FpblwiKSwgY2hlY2tlZDogZmFsc2UgfSxcblx0XHR9KTtcblxuXHRcdGlmIChyZXN1bHQuY29uZmlybWVkICYmIHJlc3VsdC5jaGVja2JveENoZWNrZWQpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQnJvd3NlckVkaXRvckNoYXRJbnRlZ3JhdGlvbi5TSEFSSU5HX0NPTlRFTlRfV0FSTklOR19ET05UX0FTS19LRVksIHRydWUsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQuY29uZmlybWVkO1xuXHR9XG5cblx0Ly8gLS0gQ2hhdCB3aWRnZXQgaGVscGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBSZXZlYWwgdGhlIGNoYXQgd2lkZ2V0IGFuZCB3YWl0IGZvciBpdHMgdmlld01vZGVsIHRvIGJlIGJvdW5kIGJlZm9yZVxuXHQgKiByZXR1cm5pbmcuIFdoZW4gdGhlIGNoYXQgcGFuZWwgaXMgb3BlbmVkIGZvciB0aGUgZmlyc3QgdGltZSB0aGUgc2Vzc2lvblxuXHQgKiBtb2RlbCBsb2FkcyBhc3luY2hyb25vdXNseSwgYW5kIG9uY2UgaXQgbG9hZHMge0BsaW5rIENoYXRJbnB1dFBhcnR9J3Ncblx0ICogYF9zeW5jRnJvbU1vZGVsYCBjbGVhcnMgYW55IGF0dGFjaG1lbnRzIHRoYXQgd2VyZSBhZGRlZCBiZWZvcmUgdGhlIG1vZGVsXG5cdCAqIHdhcyBib3VuZC4gQ2FsbGVycyBtdXN0IHVzZSB0aGlzIGhlbHBlciBiZWZvcmUgY2FsbGluZ1xuXHQgKiB7QGxpbmtjb2RlIElDaGF0V2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0fSBzbyB0aGUgYXR0YWNobWVudCBpc1xuXHQgKiBub3Qgc2lsZW50bHkgZGlzY2FyZGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmV2ZWFsQ2hhdFdpZGdldEZvckF0dGFjaG1lbnQocHJlc2VydmVGb2N1cyA9IGZhbHNlKTogUHJvbWlzZTxJQ2hhdFdpZGdldCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGF3YWl0IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UucmV2ZWFsV2lkZ2V0KHByZXNlcnZlRm9jdXMpID8/IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0aWYgKHdpZGdldCAmJiAhd2lkZ2V0LnZpZXdNb2RlbCkge1xuXHRcdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKHdpZGdldC5vbkRpZENoYW5nZVZpZXdNb2RlbCk7XG5cdFx0fVxuXHRcdHJldHVybiB3aWRnZXQ7XG5cdH1cblxuXHQvKipcblx0ICogUmV2ZWFsIHRoZSBjaGF0IHdpZGdldCBhbmQgYXR0YWNoIHRoZSBnaXZlbiBlbnRyaWVzLiBSZXR1cm5zIGZhbHNlIGlmIG5vIHdpZGdldCB3YXMgYXZhaWxhYmxlLlxuXHQgKiBDYWxsZXJzIGFyZSByZXNwb25zaWJsZSBmb3IgcnVubmluZyB7QGxpbmsgX2NvbmZpcm1Db250ZW50QXR0YWNobWVudFJpc2t9IGZpcnN0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfYXR0YWNoVG9DaGF0KGVudHJpZXM6IHJlYWRvbmx5IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGF3YWl0IHRoaXMuX3JldmVhbENoYXRXaWRnZXRGb3JBdHRhY2htZW50KCk7XG5cdFx0aWYgKCF3aWRnZXQ/LmF0dGFjaG1lbnRNb2RlbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoLi4uZW50cmllcyk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyAtLSBFbGVtZW50IFNlbGVjdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBhc3luYyBfYXR0YWNoRWxlbWVudERhdGFUb0NoYXQoZWxlbWVudERhdGE6IElFbGVtZW50RGF0YSwgbW9kZWw6IElCcm93c2VyVmlld01vZGVsKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgYm91bmRzID0gZWxlbWVudERhdGEuYm91bmRzO1xuXHRcdGNvbnN0IHRvQXR0YWNoOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPSBbXTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHNhZmVTZXRJbm5lckh0bWwoY29udGFpbmVyLCBlbGVtZW50RGF0YS5vdXRlckhUTUwpO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBjb250YWluZXIuZmlyc3RFbGVtZW50Q2hpbGQ7XG5cdFx0Y29uc3QgaW5uZXJUZXh0ID0gY29udGFpbmVyLnRleHRDb250ZW50O1xuXG5cdFx0bGV0IGRpc3BsYXlOYW1lU2hvcnQgPSBlbGVtZW50ID8gYCR7ZWxlbWVudC50YWdOYW1lLnRvTG93ZXJDYXNlKCl9JHtlbGVtZW50LmlkID8gYCMke2VsZW1lbnQuaWR9YCA6ICcnfWAgOiAnJztcblx0XHRsZXQgZGlzcGxheU5hbWVGdWxsID0gZWxlbWVudCA/IGAke2Rpc3BsYXlOYW1lU2hvcnR9JHtlbGVtZW50LmNsYXNzTGlzdC5sZW5ndGggPyBgLiR7Wy4uLmVsZW1lbnQuY2xhc3NMaXN0XS5qb2luKCcuJyl9YCA6ICcnfWAgOiAnJztcblx0XHRpZiAoZWxlbWVudERhdGEuYW5jZXN0b3JzICYmIGVsZW1lbnREYXRhLmFuY2VzdG9ycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRsZXQgbGFzdCA9IGVsZW1lbnREYXRhLmFuY2VzdG9yc1tlbGVtZW50RGF0YS5hbmNlc3RvcnMubGVuZ3RoIC0gMV07XG5cdFx0XHRsZXQgcHNldWRvID0gJyc7XG5cdFx0XHRpZiAobGFzdC50YWdOYW1lLnN0YXJ0c1dpdGgoJzo6JykgJiYgZWxlbWVudERhdGEuYW5jZXN0b3JzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0cHNldWRvID0gbGFzdC50YWdOYW1lO1xuXHRcdFx0XHRsYXN0ID0gZWxlbWVudERhdGEuYW5jZXN0b3JzW2VsZW1lbnREYXRhLmFuY2VzdG9ycy5sZW5ndGggLSAyXTtcblx0XHRcdH1cblx0XHRcdGRpc3BsYXlOYW1lU2hvcnQgPSBgJHtsYXN0LnRhZ05hbWUudG9Mb3dlckNhc2UoKX0ke2xhc3QuaWQgPyBgIyR7bGFzdC5pZH1gIDogJyd9JHtwc2V1ZG99YDtcblx0XHRcdGRpc3BsYXlOYW1lRnVsbCA9IGAke2xhc3QudGFnTmFtZS50b0xvd2VyQ2FzZSgpfSR7bGFzdC5pZCA/IGAjJHtsYXN0LmlkfWAgOiAnJ30ke2xhc3QuY2xhc3NOYW1lcyAmJiBsYXN0LmNsYXNzTmFtZXMubGVuZ3RoID8gYC4ke2xhc3QuY2xhc3NOYW1lcy5qb2luKCcuJyl9YCA6ICcnfSR7cHNldWRvfWA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmFsdWUgPSBjcmVhdGVFbGVtZW50Q29udGV4dFZhbHVlKGVsZW1lbnREYXRhLCBkaXNwbGF5TmFtZUZ1bGwpO1xuXHRcdGNvbnN0IGF0dGFjaEltYWdlcyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQnJvd3NlclNlbmRFbGVtZW50c1RvQ2hhdEF0dGFjaEltYWdlc1NldHRpbmdJZCk7XG5cdFx0Y29uc3Qgc2NyZWVuc2hvdEJ1ZmZlciA9IGF0dGFjaEltYWdlc1xuXHRcdFx0PyBhd2FpdCBtb2RlbC5jYXB0dXJlU2NyZWVuc2hvdCh7XG5cdFx0XHRcdHF1YWxpdHk6IDkwLFxuXHRcdFx0XHRwYWdlUmVjdDogYm91bmRzLFxuXHRcdFx0XHRhd2FpdE5leHRQYWludDogdHJ1ZVxuXHRcdFx0fSlcblx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgZWxlbWVudEVudHJ5OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5ID0ge1xuXHRcdFx0aWQ6ICdlbGVtZW50LScgKyBEYXRlLm5vdygpLFxuXHRcdFx0bmFtZTogZGlzcGxheU5hbWVTaG9ydCxcblx0XHRcdGZ1bGxOYW1lOiBkaXNwbGF5TmFtZUZ1bGwsXG5cdFx0XHR2YWx1ZTogdmFsdWUsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnU3RydWN0dXJlZCBicm93c2VyIGVsZW1lbnQgY29udGV4dCB3aXRoIEhUTUwgcGF0aCwgb3V0ZXIgSFRNTCwgZGltZW5zaW9ucywgYW5kIGNvbXB1dGVkIHN0eWxlcy4nLFxuXHRcdFx0a2luZDogJ2VsZW1lbnQnLFxuXHRcdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLmxheW91dC5pZCksXG5cdFx0XHRhbmNlc3RvcnM6IGVsZW1lbnREYXRhLmFuY2VzdG9ycyxcblx0XHRcdGF0dHJpYnV0ZXM6IGVsZW1lbnREYXRhLmF0dHJpYnV0ZXMsXG5cdFx0XHRjb21wdXRlZFN0eWxlczogZWxlbWVudERhdGEuY29tcHV0ZWRTdHlsZXMsXG5cdFx0XHRkaW1lbnNpb25zOiBlbGVtZW50RGF0YS5kaW1lbnNpb25zLFxuXHRcdFx0aW5uZXJUZXh0LFxuXHRcdFx0aW1hZ2VEYXRhOiBzY3JlZW5zaG90QnVmZmVyPy5idWZmZXIsXG5cdFx0XHRpbWFnZU1pbWVUeXBlOiBzY3JlZW5zaG90QnVmZmVyID8gJ2ltYWdlL2pwZWcnIDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0dG9BdHRhY2gucHVzaChlbGVtZW50RW50cnkpO1xuXG5cdFx0aWYgKCFhd2FpdCB0aGlzLl9jb25maXJtQ29udGVudEF0dGFjaG1lbnRSaXNrKGVsZW1lbnREYXRhLnVybCA/PyBtb2RlbC51cmwpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHdpZGdldCA9IGF3YWl0IHRoaXMuX3JldmVhbENoYXRXaWRnZXRGb3JBdHRhY2htZW50KGVsZW1lbnREYXRhLmNvbW1lbnQgIT09IHVuZGVmaW5lZCk7XG5cdFx0aWYgKCF3aWRnZXQ/LmF0dGFjaG1lbnRNb2RlbCB8fCB0aGlzLl9kaXNwb3NlZENvbW1lbnRNb2RlbHMuaGFzKG1vZGVsKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoLi4udG9BdHRhY2gpO1xuXHRcdGlmIChlbGVtZW50RGF0YS5jb21tZW50ICE9PSB1bmRlZmluZWQgJiYgZWxlbWVudERhdGEuZWxlbWVudElkKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2luc2VydEVsZW1lbnRDb21tZW50UmVmZXJlbmNlKHdpZGdldCwgbW9kZWwsIGVsZW1lbnRFbnRyeSwgdG9BdHRhY2gubWFwKGF0dGFjaG1lbnQgPT4gYXR0YWNobWVudC5pZCksIGVsZW1lbnREYXRhLmVsZW1lbnRJZCwgZWxlbWVudERhdGEuY29tbWVudCkpIHtcblx0XHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5kZWxldGUoLi4udG9BdHRhY2gubWFwKGF0dGFjaG1lbnQgPT4gYXR0YWNobWVudC5pZCkpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAobW9kZWwuZWxlbWVudFNlbGVjdGlvblN0YXRlLmFjdGl2ZSkge1xuXHRcdFx0XHR0aGlzLl9jb21tZW50U2Vzc2lvbnNXaXRoQ29tbWVudHMuYWRkKG1vZGVsKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHdpZGdldC5mb2N1c0lucHV0KCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dHlwZSBJbnRlZ3JhdGVkQnJvd3NlckFkZEVsZW1lbnRUb0NoYXRBZGRlZEV2ZW50ID0ge1xuXHRcdFx0YXR0YWNoSW1hZ2VzOiBib29sZWFuO1xuXHRcdH07XG5cblx0XHR0eXBlIEludGVncmF0ZWRCcm93c2VyQWRkRWxlbWVudFRvQ2hhdEFkZGVkQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRhdHRhY2hJbWFnZXM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIHdvcmtiZW5jaC5icm93c2VyLnNlbmRFbGVtZW50c1RvQ2hhdC5hdHRhY2hJbWFnZXMgd2FzIGVuYWJsZWQuJyB9O1xuXHRcdFx0b3duZXI6ICdqcnVhbGVzJztcblx0XHRcdGNvbW1lbnQ6ICdBbiBlbGVtZW50IHdhcyBzdWNjZXNzZnVsbHkgYWRkZWQgdG8gY2hhdCBmcm9tIEludGVncmF0ZWQgQnJvd3Nlci4nO1xuXHRcdH07XG5cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxJbnRlZ3JhdGVkQnJvd3NlckFkZEVsZW1lbnRUb0NoYXRBZGRlZEV2ZW50LCBJbnRlZ3JhdGVkQnJvd3NlckFkZEVsZW1lbnRUb0NoYXRBZGRlZENsYXNzaWZpY2F0aW9uPignaW50ZWdyYXRlZEJyb3dzZXIuYWRkRWxlbWVudFRvQ2hhdC5hZGRlZCcsIHtcblx0XHRcdGF0dGFjaEltYWdlc1xuXHRcdH0pO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW5zZXJ0RWxlbWVudENvbW1lbnRSZWZlcmVuY2Uod2lkZ2V0OiBJQ2hhdFdpZGdldCwgYnJvd3Nlck1vZGVsOiBJQnJvd3NlclZpZXdNb2RlbCwgYXR0YWNobWVudDogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSwgYXR0YWNobWVudElkczogcmVhZG9ubHkgc3RyaW5nW10sIGVsZW1lbnRJZDogc3RyaW5nLCBjb21tZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBpbnB1dE1vZGVsID0gd2lkZ2V0LmlucHV0RWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgZHluYW1pY1ZhcmlhYmxlTW9kZWwgPSB3aWRnZXQuZ2V0Q29udHJpYjxDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWw+KENoYXREeW5hbWljVmFyaWFibGVNb2RlbC5JRCk7XG5cdFx0aWYgKCFpbnB1dE1vZGVsIHx8ICFkeW5hbWljVmFyaWFibGVNb2RlbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluc2VydGlvblBvc2l0aW9uID0gd2lkZ2V0LmlucHV0RWRpdG9yLmdldFBvc2l0aW9uKCkgPz8gaW5wdXRNb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpLmdldEVuZFBvc2l0aW9uKCk7XG5cdFx0Y29uc3QgcHJlZml4ID0gaW5zZXJ0aW9uUG9zaXRpb24uY29sdW1uID4gMSA/ICdcXG4nIDogJyc7XG5cdFx0Y29uc3Qgc3VmZml4ID0gaW5zZXJ0aW9uUG9zaXRpb24uY29sdW1uIDwgaW5wdXRNb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGluc2VydGlvblBvc2l0aW9uLmxpbmVOdW1iZXIpID8gJ1xcbicgOiAnJztcblx0XHRjb25zdCByZWZlcmVuY2UgPSBgQCR7YXR0YWNobWVudC5uYW1lfWA7XG5cdFx0Y29uc3QgY29tbWVudFRleHQgPSBjb21tZW50ID8gYCAke2NvbW1lbnR9YCA6ICcnO1xuXHRcdGNvbnN0IHRleHQgPSBgJHtwcmVmaXh9JHtyZWZlcmVuY2V9JHtjb21tZW50VGV4dH0ke3N1ZmZpeH1gO1xuXHRcdGlmICghd2lkZ2V0LmlucHV0RWRpdG9yLmV4ZWN1dGVFZGl0cygnYnJvd3NlckVsZW1lbnRDb21tZW50JywgW3sgcmFuZ2U6IFJhbmdlLmZyb21Qb3NpdGlvbnMoaW5zZXJ0aW9uUG9zaXRpb24pLCB0ZXh0IH1dKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCByZWZlcmVuY2VTdGFydCA9IHByZWZpeCA/IHsgbGluZU51bWJlcjogaW5zZXJ0aW9uUG9zaXRpb24ubGluZU51bWJlciArIDEsIGNvbHVtbjogMSB9IDogaW5zZXJ0aW9uUG9zaXRpb247XG5cdFx0Y29uc3QgcmVmZXJlbmNlUmFuZ2UgPSBuZXcgUmFuZ2UocmVmZXJlbmNlU3RhcnQubGluZU51bWJlciwgcmVmZXJlbmNlU3RhcnQuY29sdW1uLCByZWZlcmVuY2VTdGFydC5saW5lTnVtYmVyLCByZWZlcmVuY2VTdGFydC5jb2x1bW4gKyByZWZlcmVuY2UubGVuZ3RoKTtcblx0XHRkeW5hbWljVmFyaWFibGVNb2RlbC5hZGRSZWZlcmVuY2UodG9BdHRhY2hlZENvbnRleHREeW5hbWljVmFyaWFibGUoYXR0YWNobWVudCwgcmVmZXJlbmNlUmFuZ2UpKTtcblx0XHR3aWRnZXQuaW5wdXRFZGl0b3Iuc2V0UG9zaXRpb24oe1xuXHRcdFx0bGluZU51bWJlcjogcmVmZXJlbmNlUmFuZ2UuZW5kTGluZU51bWJlcixcblx0XHRcdGNvbHVtbjogcmVmZXJlbmNlUmFuZ2UuZW5kQ29sdW1uICsgY29tbWVudFRleHQubGVuZ3RoXG5cdFx0fSk7XG5cblx0XHR0aGlzLl9jb21tZW50UmVmZXJlbmNlcy5zZXQoYXR0YWNobWVudC5pZCwgeyBlbGVtZW50SWQsIGF0dGFjaG1lbnRJZHMsIHdpZGdldCwgYnJvd3Nlck1vZGVsIH0pO1xuXHRcdHRoaXMuX2Vuc3VyZUNvbW1lbnRSZWZlcmVuY2VMaXN0ZW5lcnMod2lkZ2V0LCBkeW5hbWljVmFyaWFibGVNb2RlbCk7XG5cdFx0dGhpcy5fZW5zdXJlQ29tbWVudE1vZGVsTGlzdGVuZXJzKGJyb3dzZXJNb2RlbCk7XG5cdFx0dGhpcy5fc3luY0VsZW1lbnRDb21tZW50cyhicm93c2VyTW9kZWwpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlQ29tbWVudFJlZmVyZW5jZUxpc3RlbmVycyh3aWRnZXQ6IElDaGF0V2lkZ2V0LCBkeW5hbWljVmFyaWFibGVNb2RlbDogQ2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NvbW1lbnRSZWZlcmVuY2VMaXN0ZW5lcnMuaGFzKHdpZGdldCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKGR5bmFtaWNWYXJpYWJsZU1vZGVsLm9uRGlkQ2hhbmdlUmVmZXJlbmNlcygoKSA9PiB0aGlzLl9zeW5jRWxlbWVudENvbW1lbnRzRm9yV2lkZ2V0KHdpZGdldCkpKTtcblx0XHRzdG9yZS5hZGQod2lkZ2V0LmlucHV0RWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KCgpID0+IHRoaXMuX3N5bmNFbGVtZW50Q29tbWVudHNGb3JXaWRnZXQod2lkZ2V0KSkpO1xuXHRcdHN0b3JlLmFkZCh3aWRnZXQuYXR0YWNobWVudE1vZGVsLm9uRGlkQ2hhbmdlKGV2ZW50ID0+IHtcblx0XHRcdGZvciAoY29uc3QgW2F0dGFjaG1lbnRJZCwgdHJhY2tlZF0gb2YgdGhpcy5fY29tbWVudFJlZmVyZW5jZXMpIHtcblx0XHRcdFx0aWYgKHRyYWNrZWQud2lkZ2V0ID09PSB3aWRnZXQgJiYgZXZlbnQuZGVsZXRlZC5pbmNsdWRlcyhhdHRhY2htZW50SWQpKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVtb3ZlRWxlbWVudENvbW1lbnRSZWZlcmVuY2UodHJhY2tlZC5icm93c2VyTW9kZWwsIHRyYWNrZWQuZWxlbWVudElkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9jb21tZW50UmVmZXJlbmNlTGlzdGVuZXJzLnNldCh3aWRnZXQsIHN0b3JlKTtcblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZUNvbW1lbnRNb2RlbExpc3RlbmVycyhicm93c2VyTW9kZWw6IElCcm93c2VyVmlld01vZGVsKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NvbW1lbnRNb2RlbExpc3RlbmVycy5oYXMoYnJvd3Nlck1vZGVsKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzdG9yZS5hZGQoYnJvd3Nlck1vZGVsLm9uRGlkUmVtb3ZlRWxlbWVudENvbW1lbnQoZWxlbWVudElkID0+IHRoaXMuX3JlbW92ZUVsZW1lbnRDb21tZW50UmVmZXJlbmNlKGJyb3dzZXJNb2RlbCwgZWxlbWVudElkKSkpO1xuXHRcdHN0b3JlLmFkZChicm93c2VyTW9kZWwub25EaWROYXZpZ2F0ZSgoKSA9PiB0aGlzLl9kZXRhY2hFbGVtZW50Q29tbWVudFJlZmVyZW5jZXMoYnJvd3Nlck1vZGVsKSkpO1xuXHRcdHN0b3JlLmFkZChicm93c2VyTW9kZWwub25XaWxsRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9kaXNwb3NlZENvbW1lbnRNb2RlbHMuYWRkKGJyb3dzZXJNb2RlbCk7XG5cdFx0XHR0aGlzLl9kZXRhY2hFbGVtZW50Q29tbWVudFJlZmVyZW5jZXMoYnJvd3Nlck1vZGVsLCBmYWxzZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2NvbW1lbnRNb2RlbExpc3RlbmVycy5zZXQoYnJvd3Nlck1vZGVsLCBzdG9yZSk7XG5cdH1cblxuXHRwcml2YXRlIF9zeW5jRWxlbWVudENvbW1lbnRzRm9yV2lkZ2V0KHdpZGdldDogSUNoYXRXaWRnZXQpOiB2b2lkIHtcblx0XHRjb25zdCBicm93c2VyTW9kZWxzID0gbmV3IFNldDxJQnJvd3NlclZpZXdNb2RlbD4oKTtcblx0XHRmb3IgKGNvbnN0IHJlZmVyZW5jZSBvZiB0aGlzLl9jb21tZW50UmVmZXJlbmNlcy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHJlZmVyZW5jZS53aWRnZXQgPT09IHdpZGdldCkge1xuXHRcdFx0XHRicm93c2VyTW9kZWxzLmFkZChyZWZlcmVuY2UuYnJvd3Nlck1vZGVsKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBicm93c2VyTW9kZWwgb2YgYnJvd3Nlck1vZGVscykge1xuXHRcdFx0dGhpcy5fc3luY0VsZW1lbnRDb21tZW50cyhicm93c2VyTW9kZWwpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3N5bmNFbGVtZW50Q29tbWVudHMoYnJvd3Nlck1vZGVsOiBJQnJvd3NlclZpZXdNb2RlbCwgcGVuZGluZ0NvbW1lbnRJZHNUb0Rpc2NhcmQ/OiByZWFkb25seSBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbW1lbnRzOiB7IGVsZW1lbnRJZDogc3RyaW5nOyBib2R5OiBzdHJpbmcgfVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBbYXR0YWNobWVudElkLCB0cmFja2VkXSBvZiB0aGlzLl9jb21tZW50UmVmZXJlbmNlcykge1xuXHRcdFx0aWYgKHRyYWNrZWQuYnJvd3Nlck1vZGVsICE9PSBicm93c2VyTW9kZWwpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbnB1dE1vZGVsID0gdHJhY2tlZC53aWRnZXQuaW5wdXRFZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGNvbnN0IGR5bmFtaWNWYXJpYWJsZU1vZGVsID0gdHJhY2tlZC53aWRnZXQuZ2V0Q29udHJpYjxDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWw+KENoYXREeW5hbWljVmFyaWFibGVNb2RlbC5JRCk7XG5cdFx0XHRpZiAoIWlucHV0TW9kZWwgfHwgIWR5bmFtaWNWYXJpYWJsZU1vZGVsKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdmFyaWFibGUgPSBkeW5hbWljVmFyaWFibGVNb2RlbC52YXJpYWJsZXMuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmlkID09PSBhdHRhY2htZW50SWQgJiYgY2FuZGlkYXRlLmlzQXR0YWNobWVudFJlZmVyZW5jZSk7XG5cdFx0XHRpZiAoIXZhcmlhYmxlKSB7XG5cdFx0XHRcdHRoaXMuX2RlbGV0ZUNvbW1lbnRBdHRhY2htZW50cyhhdHRhY2htZW50SWQsIHRyYWNrZWQpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxpbmUgPSBpbnB1dE1vZGVsLmdldExpbmVDb250ZW50KHZhcmlhYmxlLnJhbmdlLmVuZExpbmVOdW1iZXIpO1xuXHRcdFx0Y29tbWVudHMucHVzaCh7XG5cdFx0XHRcdGVsZW1lbnRJZDogdHJhY2tlZC5lbGVtZW50SWQsXG5cdFx0XHRcdGJvZHk6IGxpbmUuc2xpY2UodmFyaWFibGUucmFuZ2UuZW5kQ29sdW1uIC0gMSkudHJpbVN0YXJ0KClcblx0XHRcdH0pO1xuXHRcdH1cblx0XHR2b2lkIGJyb3dzZXJNb2RlbC5zZXRFbGVtZW50Q29tbWVudHMoeyBjb21tZW50cywgcGVuZGluZ0NvbW1lbnRJZHNUb0Rpc2NhcmQgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVFbGVtZW50Q29tbWVudFJlZmVyZW5jZShicm93c2VyTW9kZWw6IElCcm93c2VyVmlld01vZGVsLCBlbGVtZW50SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW2F0dGFjaG1lbnRJZCwgdHJhY2tlZF0gb2YgdGhpcy5fY29tbWVudFJlZmVyZW5jZXMpIHtcblx0XHRcdGlmICh0cmFja2VkLmJyb3dzZXJNb2RlbCAhPT0gYnJvd3Nlck1vZGVsIHx8IHRyYWNrZWQuZWxlbWVudElkICE9PSBlbGVtZW50SWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkeW5hbWljVmFyaWFibGVNb2RlbCA9IHRyYWNrZWQud2lkZ2V0LmdldENvbnRyaWI8Q2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsPihDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWwuSUQpO1xuXHRcdFx0Y29uc3QgdmFyaWFibGUgPSBkeW5hbWljVmFyaWFibGVNb2RlbD8udmFyaWFibGVzLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5pZCA9PT0gYXR0YWNobWVudElkICYmIGNhbmRpZGF0ZS5pc0F0dGFjaG1lbnRSZWZlcmVuY2UpO1xuXHRcdFx0Y29uc3QgaW5wdXRNb2RlbCA9IHRyYWNrZWQud2lkZ2V0LmlucHV0RWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRpZiAodmFyaWFibGUgJiYgaW5wdXRNb2RlbCkge1xuXHRcdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gdmFyaWFibGUucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0XHRjb25zdCBsaW5lUmFuZ2UgPSBsaW5lTnVtYmVyIDwgaW5wdXRNb2RlbC5nZXRMaW5lQ291bnQoKVxuXHRcdFx0XHRcdD8gbmV3IFJhbmdlKGxpbmVOdW1iZXIsIDEsIGxpbmVOdW1iZXIgKyAxLCAxKVxuXHRcdFx0XHRcdDogbGluZU51bWJlciA+IDFcblx0XHRcdFx0XHRcdD8gbmV3IFJhbmdlKGxpbmVOdW1iZXIgLSAxLCBpbnB1dE1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlciAtIDEpLCBsaW5lTnVtYmVyLCBpbnB1dE1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcikpXG5cdFx0XHRcdFx0XHQ6IGlucHV0TW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKTtcblx0XHRcdFx0dHJhY2tlZC53aWRnZXQuaW5wdXRFZGl0b3IuZXhlY3V0ZUVkaXRzKCdicm93c2VyRWxlbWVudENvbW1lbnQnLCBbe1xuXHRcdFx0XHRcdHJhbmdlOiBsaW5lUmFuZ2UsXG5cdFx0XHRcdFx0dGV4dDogJydcblx0XHRcdFx0fV0pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZGVsZXRlQ29tbWVudEF0dGFjaG1lbnRzKGF0dGFjaG1lbnRJZCwgdHJhY2tlZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZGV0YWNoRWxlbWVudENvbW1lbnRSZWZlcmVuY2VzKGJyb3dzZXJNb2RlbDogSUJyb3dzZXJWaWV3TW9kZWwsIHN5bmNDb21tZW50cyA9IHRydWUpOiB2b2lkIHtcblx0XHR0aGlzLl9jb21tZW50U2Vzc2lvbnNXaXRoQ29tbWVudHMuZGVsZXRlKGJyb3dzZXJNb2RlbCk7XG5cdFx0Y29uc3Qgd2lkZ2V0cyA9IG5ldyBTZXQ8SUNoYXRXaWRnZXQ+KCk7XG5cdFx0Zm9yIChjb25zdCBbYXR0YWNobWVudElkLCByZWZlcmVuY2VdIG9mIHRoaXMuX2NvbW1lbnRSZWZlcmVuY2VzKSB7XG5cdFx0XHRpZiAocmVmZXJlbmNlLmJyb3dzZXJNb2RlbCA9PT0gYnJvd3Nlck1vZGVsKSB7XG5cdFx0XHRcdHdpZGdldHMuYWRkKHJlZmVyZW5jZS53aWRnZXQpO1xuXHRcdFx0XHR0aGlzLl9jb21tZW50UmVmZXJlbmNlcy5kZWxldGUoYXR0YWNobWVudElkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCB3aWRnZXQgb2Ygd2lkZ2V0cykge1xuXHRcdFx0dGhpcy5fZGlzcG9zZUNvbW1lbnRSZWZlcmVuY2VMaXN0ZW5lcklmVW51c2VkKHdpZGdldCk7XG5cdFx0fVxuXHRcdHRoaXMuX2NvbW1lbnRNb2RlbExpc3RlbmVycy5kZWxldGVBbmREaXNwb3NlKGJyb3dzZXJNb2RlbCk7XG5cdFx0aWYgKHN5bmNDb21tZW50cykge1xuXHRcdFx0dm9pZCBicm93c2VyTW9kZWwuc2V0RWxlbWVudENvbW1lbnRzKHsgY29tbWVudHM6IFtdIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ZvY3VzQ2hhdElucHV0Rm9yQ29tbWVudHMoYnJvd3Nlck1vZGVsOiBJQnJvd3NlclZpZXdNb2RlbCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcmVmZXJlbmNlIG9mIHRoaXMuX2NvbW1lbnRSZWZlcmVuY2VzLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAocmVmZXJlbmNlLmJyb3dzZXJNb2RlbCA9PT0gYnJvd3Nlck1vZGVsKSB7XG5cdFx0XHRcdHJlZmVyZW5jZS53aWRnZXQuZm9jdXNJbnB1dCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZGVsZXRlQ29tbWVudEF0dGFjaG1lbnRzKGVsZW1lbnRBdHRhY2htZW50SWQ6IHN0cmluZywgdHJhY2tlZDogeyBhdHRhY2htZW50SWRzOiByZWFkb25seSBzdHJpbmdbXTsgd2lkZ2V0OiBJQ2hhdFdpZGdldDsgYnJvd3Nlck1vZGVsOiBJQnJvd3NlclZpZXdNb2RlbCB9KTogdm9pZCB7XG5cdFx0dGhpcy5fY29tbWVudFJlZmVyZW5jZXMuZGVsZXRlKGVsZW1lbnRBdHRhY2htZW50SWQpO1xuXHRcdHRyYWNrZWQud2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5kZWxldGUoLi4udHJhY2tlZC5hdHRhY2htZW50SWRzKTtcblx0XHR0aGlzLl9kaXNwb3NlQ29tbWVudFJlZmVyZW5jZUxpc3RlbmVySWZVbnVzZWQodHJhY2tlZC53aWRnZXQpO1xuXHRcdHRoaXMuX2Rpc3Bvc2VDb21tZW50TW9kZWxMaXN0ZW5lcklmVW51c2VkKHRyYWNrZWQuYnJvd3Nlck1vZGVsKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc3Bvc2VDb21tZW50UmVmZXJlbmNlTGlzdGVuZXJJZlVudXNlZCh3aWRnZXQ6IElDaGF0V2lkZ2V0KTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCByZWZlcmVuY2Ugb2YgdGhpcy5fY29tbWVudFJlZmVyZW5jZXMudmFsdWVzKCkpIHtcblx0XHRcdGlmIChyZWZlcmVuY2Uud2lkZ2V0ID09PSB3aWRnZXQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9jb21tZW50UmVmZXJlbmNlTGlzdGVuZXJzLmRlbGV0ZUFuZERpc3Bvc2Uod2lkZ2V0KTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc3Bvc2VDb21tZW50TW9kZWxMaXN0ZW5lcklmVW51c2VkKGJyb3dzZXJNb2RlbDogSUJyb3dzZXJWaWV3TW9kZWwpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHJlZmVyZW5jZSBvZiB0aGlzLl9jb21tZW50UmVmZXJlbmNlcy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHJlZmVyZW5jZS5icm93c2VyTW9kZWwgPT09IGJyb3dzZXJNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2NvbW1lbnRNb2RlbExpc3RlbmVycy5kZWxldGVBbmREaXNwb3NlKGJyb3dzZXJNb2RlbCk7XG5cdH1cblxuXHQvLyAtLSBDb25zb2xlIExvZ3MgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIEdyYWIgdGhlIGN1cnJlbnQgY29uc29sZSBsb2dzIGZyb20gdGhlIGFjdGl2ZSBjb25zb2xlIHNlc3Npb24gYW5kIGF0dGFjaCB0aGVtIHRvIGNoYXQuXG5cdCAqL1xuXHRhc3luYyBhZGRDb25zb2xlTG9nc1RvQ2hhdCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLm1vZGVsO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbG9ncyA9IGF3YWl0IG1vZGVsLmdldENvbnNvbGVMb2dzKCk7XG5cdFx0XHRpZiAoIWxvZ3MpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWF3YWl0IHRoaXMuX2NvbmZpcm1Db250ZW50QXR0YWNobWVudFJpc2sobW9kZWwudXJsKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRvQXR0YWNoOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPSBbXTtcblx0XHRcdHRvQXR0YWNoLnB1c2goe1xuXHRcdFx0XHRpZDogJ2NvbnNvbGUtbG9ncy0nICsgRGF0ZS5ub3coKSxcblx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ2NvbnNvbGVMb2dzJywgJ0NvbnNvbGUgTG9ncycpLFxuXHRcdFx0XHRmdWxsTmFtZTogbG9jYWxpemUoJ2NvbnNvbGVMb2dzJywgJ0NvbnNvbGUgTG9ncycpLFxuXHRcdFx0XHR2YWx1ZTogbG9ncyxcblx0XHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ0NvbnNvbGUgbG9ncyBjYXB0dXJlZCBmcm9tIEludGVncmF0ZWQgQnJvd3Nlci4nLFxuXHRcdFx0XHRraW5kOiAnZWxlbWVudCcsXG5cdFx0XHRcdGljb246IFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi50ZXJtaW5hbC5pZCksXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgdGhpcy5fYXR0YWNoVG9DaGF0KHRvQXR0YWNoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdCcm93c2VyRWRpdG9yLmFkZENvbnNvbGVMb2dzVG9DaGF0OiBGYWlsZWQgdG8gZ2V0IGNvbnNvbGUgbG9ncycsIGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLSBTY3JlZW5zaG90IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogQ2FwdHVyZSBhIHZpZXdwb3J0IHNjcmVlbnNob3Qgb2YgdGhlIGN1cnJlbnQgYnJvd3NlciB2aWV3IGFuZCBhdHRhY2ggaXQgdG8gY2hhdC5cblx0ICovXG5cdGFzeW5jIGFkZFNjcmVlbnNob3RUb0NoYXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5tb2RlbDtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdC8vIENhcHR1cmUgdGhlIHNjcmVlbnNob3QgQkVGT1JFIHJldmVhbGluZyB0aGUgY2hhdCBwYW5lbCBvciBwcm9tcHRpbmcgdGhlXG5cdFx0XHQvLyB1c2VyIHNvIHRoZSBpbWFnZSByZWZsZWN0cyB3aGF0IHRoZSB1c2VyIHNhdyB3aGVuIHRoZXkgcHJlc3NlZCB0aGUgYnV0dG9uLFxuXHRcdFx0Ly8gbm90IGEgcmVmbG93ZWQgdmVyc2lvbiBvZiB0aGUgcGFnZSBhZnRlciB0aGUgcGFuZWwgb3BlbnMgb3IgYSBsYXRlciB2ZXJzaW9uXG5cdFx0XHQvLyBhZnRlciB0aGUgZGlhbG9nIGFwcGVhcnMuXG5cdFx0XHRjb25zdCBzY3JlZW5zaG90QnVmZmVyID0gYXdhaXQgbW9kZWwuY2FwdHVyZVNjcmVlbnNob3QoeyBxdWFsaXR5OiA4MCB9KTtcblxuXHRcdFx0aWYgKCFhd2FpdCB0aGlzLl9jb25maXJtQ29udGVudEF0dGFjaG1lbnRSaXNrKG1vZGVsLnVybCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0b0F0dGFjaDogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW3tcblx0XHRcdFx0aWQ6ICdicm93c2VyLXNjcmVlbnNob3QtJyArIERhdGUubm93KCksXG5cdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdicm93c2VyU2NyZWVuc2hvdCcsICdCcm93c2VyIFNjcmVlbnNob3QnKSxcblx0XHRcdFx0ZnVsbE5hbWU6IGxvY2FsaXplKCdicm93c2VyU2NyZWVuc2hvdCcsICdCcm93c2VyIFNjcmVlbnNob3QnKSxcblx0XHRcdFx0a2luZDogJ2ltYWdlJyxcblx0XHRcdFx0dmFsdWU6IHNjcmVlbnNob3RCdWZmZXIuYnVmZmVyLFxuXHRcdFx0XHRtaW1lVHlwZTogJ2ltYWdlL2pwZWcnLFxuXHRcdFx0fV07XG5cblx0XHRcdGlmICghYXdhaXQgdGhpcy5fYXR0YWNoVG9DaGF0KHRvQXR0YWNoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEludGVncmF0ZWRCcm93c2VyQWRkU2NyZWVuc2hvdFRvQ2hhdEFkZGVkRXZlbnQsIEludGVncmF0ZWRCcm93c2VyQWRkU2NyZWVuc2hvdFRvQ2hhdEFkZGVkQ2xhc3NpZmljYXRpb24+KCdpbnRlZ3JhdGVkQnJvd3Nlci5hZGRTY3JlZW5zaG90VG9DaGF0LmFkZGVkJywge1xuXHRcdFx0XHRzY3JlZW5zaG90VHlwZTogJ3ZpZXdwb3J0J1xuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignQnJvd3NlckVkaXRvci5hZGRTY3JlZW5zaG90VG9DaGF0OiBGYWlsZWQgdG8gY2FwdHVyZSBzY3JlZW5zaG90JywgZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBEcml2ZSB0aGUgYXJlYS1zY3JlZW5zaG90IGZsb3c6IHByZXNlbnQgdGhlIGRyYWctdG8tc2VsZWN0IHBpY2tlciwgY2FwdHVyZSB0aGVcblx0ICogdXNlci1kcmF3biByZWdpb24sIGFuZCBhdHRhY2ggdGhlIHJlc3VsdGluZyBpbWFnZSB0byBjaGF0LlxuXHQgKi9cblx0YXN5bmMgYWRkQXJlYVNjcmVlbnNob3RUb0NoYXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5tb2RlbDtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVG9nZ2xlIG9mZiBpZiBhbHJlYWR5IGFjdGl2ZSBcdTIwMTQgc2Vjb25kIGludm9jYXRpb24gY2FuY2Vscy5cblx0XHRpZiAobW9kZWwuaXNBcmVhU2VsZWN0aW9uQWN0aXZlKSB7XG5cdFx0XHR2b2lkIG1vZGVsLnRvZ2dsZUFyZWFTZWxlY3Rpb24oZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZWRpdG9yLmVuc3VyZUJyb3dzZXJGb2N1cygpO1xuXG5cdFx0Ly8gYG9uRGlkUGlja0FyZWFgIGZpcmVzIGV4YWN0bHkgb25jZSBwZXIgc2Vzc2lvbiB3aXRoIHRoZSB1c2VyLWRyYXduIHJlY3RhbmdsZVxuXHRcdC8vIG9yIGB1bmRlZmluZWRgIG9uIGNhbmNlbGxhdGlvbiwgc28gd2UgZG9uJ3QgaGF2ZSB0byByZWNvbmNpbGUgcmVjdCB2cy5cblx0XHQvLyBhY3RpdmF0aW9uLXN0YXRlIGV2ZW50cyBhY3Jvc3MgdGhlIElQQyBib3VuZGFyeS5cblx0XHRjb25zdCBwaWNrUHJvbWlzZSA9IEV2ZW50LnRvUHJvbWlzZShFdmVudC5vbmNlKG1vZGVsLm9uRGlkUGlja0FyZWEpKTtcblx0XHR2b2lkIG1vZGVsLnRvZ2dsZUFyZWFTZWxlY3Rpb24odHJ1ZSk7XG5cdFx0Y29uc3QgcmVjdCA9IGF3YWl0IHBpY2tQcm9taXNlO1xuXG5cdFx0aWYgKCFyZWN0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdC8vIEFkZGVkIGF3YWl0TmV4dFBhaW50IGJlY2F1c2UgdGhlIGFyZWEgc2VsZWN0aW9uIFVJIChhIGRhc2hlZCByZWN0YW5nbGUpIHdhcyBldmVyeSBzbyBvZnRlbiBtYWtpbmcgaXRzIHdheVxuXHRcdFx0Ly8gaW50byB0aGUgY2FwdHVyZWQgc2NyZWVuc2hvdC5cblx0XHRcdGNvbnN0IHNjcmVlbnNob3RCdWZmZXIgPSBhd2FpdCBtb2RlbC5jYXB0dXJlU2NyZWVuc2hvdCh7IHF1YWxpdHk6IDgwLCBwYWdlUmVjdDogcmVjdCwgYXdhaXROZXh0UGFpbnQ6IHRydWUgfSk7XG5cblx0XHRcdGlmICghYXdhaXQgdGhpcy5fY29uZmlybUNvbnRlbnRBdHRhY2htZW50Umlzayhtb2RlbC51cmwpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdG9BdHRhY2g6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFt7XG5cdFx0XHRcdGlkOiAnYnJvd3Nlci1hcmVhLXNjcmVlbnNob3QtJyArIERhdGUubm93KCksXG5cdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdicm93c2VyQXJlYVNjcmVlbnNob3QnLCAnQnJvd3NlciBBcmVhIFNjcmVlbnNob3QnKSxcblx0XHRcdFx0ZnVsbE5hbWU6IGxvY2FsaXplKCdicm93c2VyQXJlYVNjcmVlbnNob3QnLCAnQnJvd3NlciBBcmVhIFNjcmVlbnNob3QnKSxcblx0XHRcdFx0a2luZDogJ2ltYWdlJyxcblx0XHRcdFx0dmFsdWU6IHNjcmVlbnNob3RCdWZmZXIuYnVmZmVyLFxuXHRcdFx0XHRtaW1lVHlwZTogJ2ltYWdlL2pwZWcnLFxuXHRcdFx0fV07XG5cblx0XHRcdGlmICghYXdhaXQgdGhpcy5fYXR0YWNoVG9DaGF0KHRvQXR0YWNoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEludGVncmF0ZWRCcm93c2VyQWRkU2NyZWVuc2hvdFRvQ2hhdEFkZGVkRXZlbnQsIEludGVncmF0ZWRCcm93c2VyQWRkU2NyZWVuc2hvdFRvQ2hhdEFkZGVkQ2xhc3NpZmljYXRpb24+KCdpbnRlZ3JhdGVkQnJvd3Nlci5hZGRTY3JlZW5zaG90VG9DaGF0LmFkZGVkJywge1xuXHRcdFx0XHRzY3JlZW5zaG90VHlwZTogJ2FyZWEnXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdCcm93c2VyRWRpdG9yLmFkZEFyZWFTY3JlZW5zaG90VG9DaGF0OiBGYWlsZWQgdG8gY2FwdHVyZSBhcmVhIHNjcmVlbnNob3QnLCBlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENhcHR1cmUgYSBmdWxsLXBhZ2Ugc2NyZWVuc2hvdCAoaW5jbHVkaW5nIGNvbnRlbnQgc2Nyb2xsZWQgb2ZmLXNjcmVlbikgYW5kIGF0dGFjaCBpdCB0byBjaGF0LlxuXHQgKi9cblx0YXN5bmMgYWRkRnVsbFBhZ2VTY3JlZW5zaG90VG9DaGF0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IubW9kZWw7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzY3JlZW5zaG90QnVmZmVyID0gYXdhaXQgbW9kZWwuY2FwdHVyZVNjcmVlbnNob3QoeyBmdWxsUGFnZTogdHJ1ZSwgZm9ybWF0OiAncG5nJyB9KTtcblxuXHRcdFx0aWYgKCFhd2FpdCB0aGlzLl9jb25maXJtQ29udGVudEF0dGFjaG1lbnRSaXNrKG1vZGVsLnVybCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0b0F0dGFjaDogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW3tcblx0XHRcdFx0aWQ6ICdicm93c2VyLWZ1bGxwYWdlLXNjcmVlbnNob3QtJyArIERhdGUubm93KCksXG5cdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdicm93c2VyRnVsbFBhZ2VTY3JlZW5zaG90JywgJ0Jyb3dzZXIgRnVsbCBQYWdlIFNjcmVlbnNob3QnKSxcblx0XHRcdFx0ZnVsbE5hbWU6IGxvY2FsaXplKCdicm93c2VyRnVsbFBhZ2VTY3JlZW5zaG90JywgJ0Jyb3dzZXIgRnVsbCBQYWdlIFNjcmVlbnNob3QnKSxcblx0XHRcdFx0a2luZDogJ2ltYWdlJyxcblx0XHRcdFx0dmFsdWU6IHNjcmVlbnNob3RCdWZmZXIuYnVmZmVyLFxuXHRcdFx0XHRtaW1lVHlwZTogJ2ltYWdlL3BuZycsXG5cdFx0XHR9XTtcblxuXHRcdFx0aWYgKCFhd2FpdCB0aGlzLl9hdHRhY2hUb0NoYXQodG9BdHRhY2gpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8SW50ZWdyYXRlZEJyb3dzZXJBZGRTY3JlZW5zaG90VG9DaGF0QWRkZWRFdmVudCwgSW50ZWdyYXRlZEJyb3dzZXJBZGRTY3JlZW5zaG90VG9DaGF0QWRkZWRDbGFzc2lmaWNhdGlvbj4oJ2ludGVncmF0ZWRCcm93c2VyLmFkZFNjcmVlbnNob3RUb0NoYXQuYWRkZWQnLCB7XG5cdFx0XHRcdHNjcmVlbnNob3RUeXBlOiAnZnVsbFBhZ2UnXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdCcm93c2VyRWRpdG9yLmFkZEZ1bGxQYWdlU2NyZWVuc2hvdFRvQ2hhdDogRmFpbGVkIHRvIGNhcHR1cmUgZnVsbC1wYWdlIHNjcmVlbnNob3QnLCBlcnJvcik7XG5cdFx0fVxuXHR9XG59XG5cbi8vIFJlZ2lzdGVyIHRoZSBjb250cmlidXRpb25cbkJyb3dzZXJFZGl0b3IucmVnaXN0ZXJDb250cmlidXRpb24oQnJvd3NlckVkaXRvckNoYXRJbnRlZ3JhdGlvbik7XG5cbi8vIC0tIEFjdGlvbnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmNsYXNzIEFkZEVsZW1lbnRUb0NoYXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gQnJvd3NlclZpZXdDb21tYW5kSWQuQWRkRWxlbWVudFRvQ2hhdDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQWRkRWxlbWVudFRvQ2hhdEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Jyb3dzZXIuYWRkRWxlbWVudFRvQ2hhdEFjdGlvbicsICdBZGQgRWxlbWVudCB0byBDaGF0JyksXG5cdFx0XHRjYXRlZ29yeTogQnJvd3NlckNhdGVnb3J5LFxuXHRcdFx0aWNvbjogQ29kaWNvbi5pbnNwZWN0LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChCUk9XU0VSX0VESVRPUl9BQ1RJVkUsIENPTlRFWFRfQlJPV1NFUl9IQVNfVVJMLCBDT05URVhUX0JST1dTRVJfSEFTX0VSUk9SLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCksXG5cdFx0XHR0b2dnbGVkOiBDT05URVhUX0JST1dTRVJfRUxFTUVOVF9TRUxFQ1RJT05fTU9ERS5pc0VxdWFsVG8oQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25Nb2RlLlNlbGVjdCksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQnJvd3NlckNoYXRBY3Rpb25zTWVudSxcblx0XHRcdFx0Z3JvdXA6ICcxX2VsZW1lbnQnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWRcblx0XHRcdH0sXG5cdFx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDUwLCAvLyBQcmlvcml0eSBvdmVyIHRlcm1pbmFsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlDLFxuXHRcdFx0XHRhcmdzOiB7IGhpZ2hsaWdodEZvY3VzZWRFbGVtZW50OiB0cnVlIH0sXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmd1bWVudD86IElCcm93c2VyRWxlbWVudFNlbGVjdGlvbk9wdGlvbnMgfCBCcm93c2VyRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3QgYnJvd3NlckVkaXRvciA9IGFyZ3VtZW50IGluc3RhbmNlb2YgQnJvd3NlckVkaXRvciA/IGFyZ3VtZW50IDogYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGlmIChicm93c2VyRWRpdG9yIGluc3RhbmNlb2YgQnJvd3NlckVkaXRvcikge1xuXHRcdFx0YnJvd3NlckVkaXRvci5lbnN1cmVCcm93c2VyRm9jdXMoKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gYnJvd3NlckVkaXRvci5tb2RlbDtcblx0XHRcdGlmIChtb2RlbCkge1xuXHRcdFx0XHRjb25zdCBvcHRpb25zID0gYXJndW1lbnQgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9yID8gdW5kZWZpbmVkIDogYXJndW1lbnQ7XG5cdFx0XHRcdGNvbnN0IGlzQWN0aXZlTW9kZSA9IG1vZGVsLmVsZW1lbnRTZWxlY3Rpb25TdGF0ZS5hY3RpdmUgJiYgbW9kZWwuZWxlbWVudFNlbGVjdGlvblN0YXRlLm9wdGlvbnMubW9kZSAhPT0gQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25Nb2RlLkNvbW1lbnQ7XG5cdFx0XHRcdHZvaWQgbW9kZWwudG9nZ2xlRWxlbWVudFNlbGVjdGlvbighaXNBY3RpdmVNb2RlLCB7IC4uLm9wdGlvbnMsIGNvbnRpbnVvdXM6IGZhbHNlLCBtb2RlOiBCcm93c2VyRWxlbWVudFNlbGVjdGlvbk1vZGUuU2VsZWN0IH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBBZGRFbGVtZW50Q29tbWVudFRvQ2hhdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSBCcm93c2VyVmlld0NvbW1hbmRJZC5BZGRFbGVtZW50Q29tbWVudFRvQ2hhdDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQWRkRWxlbWVudENvbW1lbnRUb0NoYXRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdicm93c2VyLmFkZEVsZW1lbnRDb21tZW50VG9DaGF0QWN0aW9uJywgJ0NvbW1lbnQgb24gRWxlbWVudHMnKSxcblx0XHRcdGNhdGVnb3J5OiBCcm93c2VyQ2F0ZWdvcnksXG5cdFx0XHRpY29uOiBDb2RpY29uLmNvbW1lbnQsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEJST1dTRVJfRURJVE9SX0FDVElWRSwgQ09OVEVYVF9CUk9XU0VSX0hBU19VUkwsIENPTlRFWFRfQlJPV1NFUl9IQVNfRVJST1IubmVnYXRlKCksIENoYXRDb250ZXh0S2V5cy5lbmFibGVkKSxcblx0XHRcdHRvZ2dsZWQ6IENPTlRFWFRfQlJPV1NFUl9FTEVNRU5UX1NFTEVDVElPTl9NT0RFLmlzRXF1YWxUbyhCcm93c2VyRWxlbWVudFNlbGVjdGlvbk1vZGUuQ29tbWVudCksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQnJvd3NlckNoYXRBY3Rpb25zTWVudSxcblx0XHRcdFx0Z3JvdXA6ICcxX2VsZW1lbnQnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWRcblx0XHRcdH0sXG5cdFx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDUwLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUMsXG5cdFx0XHRcdGFyZ3M6IHsgY29udGludW91czogdHJ1ZSwgbW9kZTogQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25Nb2RlLkNvbW1lbnQsIGhpZ2hsaWdodEZvY3VzZWRFbGVtZW50OiB0cnVlIH1cblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmd1bWVudD86IElCcm93c2VyRWxlbWVudFNlbGVjdGlvbk9wdGlvbnMgfCBCcm93c2VyRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3QgYnJvd3NlckVkaXRvciA9IGFyZ3VtZW50IGluc3RhbmNlb2YgQnJvd3NlckVkaXRvciA/IGFyZ3VtZW50IDogYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGlmIChicm93c2VyRWRpdG9yIGluc3RhbmNlb2YgQnJvd3NlckVkaXRvcikge1xuXHRcdFx0YnJvd3NlckVkaXRvci5lbnN1cmVCcm93c2VyRm9jdXMoKTtcblx0XHRcdGNvbnN0IG9wdGlvbnMgPSBhcmd1bWVudCBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3IgPyB1bmRlZmluZWQgOiBhcmd1bWVudDtcblx0XHRcdGNvbnN0IG1vZGVsID0gYnJvd3NlckVkaXRvci5tb2RlbDtcblx0XHRcdGlmIChtb2RlbCkge1xuXHRcdFx0XHRjb25zdCBpc0FjdGl2ZU1vZGUgPSBtb2RlbC5lbGVtZW50U2VsZWN0aW9uU3RhdGUuYWN0aXZlICYmIG1vZGVsLmVsZW1lbnRTZWxlY3Rpb25TdGF0ZS5vcHRpb25zLm1vZGUgPT09IEJyb3dzZXJFbGVtZW50U2VsZWN0aW9uTW9kZS5Db21tZW50O1xuXHRcdFx0XHR2b2lkIG1vZGVsLnRvZ2dsZUVsZW1lbnRTZWxlY3Rpb24oIWlzQWN0aXZlTW9kZSwgeyAuLi5vcHRpb25zLCBjb250aW51b3VzOiB0cnVlLCBtb2RlOiBCcm93c2VyRWxlbWVudFNlbGVjdGlvbk1vZGUuQ29tbWVudCB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgU3RvcEVsZW1lbnRTZWxlY3Rpb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmJyb3dzZXIuc3RvcEVsZW1lbnRTZWxlY3Rpb24nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYnJvd3Nlci5zdG9wRWxlbWVudFNlbGVjdGlvbkFjdGlvbicsICdTdG9wIEVsZW1lbnQgU2VsZWN0aW9uJyksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChCUk9XU0VSX0VESVRPUl9BQ1RJVkUsIENvbnRleHRLZXlFeHByLmhhcyhDT05URVhUX0JST1dTRVJfRUxFTUVOVF9TRUxFQ1RJT05fTU9ERS5rZXkpKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuaGFzKENPTlRFWFRfQlJPV1NFUl9FTEVNRU5UX1NFTEVDVElPTl9NT0RFLmtleSksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgYnJvd3NlckVkaXRvciA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRpZiAoYnJvd3NlckVkaXRvciBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3IpIHtcblx0XHRcdHZvaWQgYnJvd3NlckVkaXRvci5tb2RlbD8udG9nZ2xlRWxlbWVudFNlbGVjdGlvbihmYWxzZSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEFkZENvbnNvbGVMb2dzVG9DaGF0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9IEJyb3dzZXJWaWV3Q29tbWFuZElkLkFkZENvbnNvbGVMb2dzVG9DaGF0O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBBZGRDb25zb2xlTG9nc1RvQ2hhdEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Jyb3dzZXIuYWRkQ29uc29sZUxvZ3NUb0NoYXRBY3Rpb24nLCAnQWRkIENvbnNvbGUgTG9ncyB0byBDaGF0JyksXG5cdFx0XHRjYXRlZ29yeTogQnJvd3NlckFjdGlvbkNhdGVnb3J5LFxuXHRcdFx0aWNvbjogQ29kaWNvbi5vdXRwdXQsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEJST1dTRVJfRURJVE9SX0FDVElWRSwgQ09OVEVYVF9CUk9XU0VSX0hBU19VUkwsIENPTlRFWFRfQlJPV1NFUl9IQVNfRVJST1IubmVnYXRlKCksIENoYXRDb250ZXh0S2V5cy5lbmFibGVkKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Ccm93c2VyQ2hhdEFjdGlvbnNNZW51LFxuXHRcdFx0XHRncm91cDogJzJfbG9ncycsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBicm93c2VyRWRpdG9yID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGJyb3dzZXJFZGl0b3IgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9yKSB7XG5cdFx0XHRhd2FpdCBicm93c2VyRWRpdG9yLmdldENvbnRyaWJ1dGlvbihCcm93c2VyRWRpdG9yQ2hhdEludGVncmF0aW9uKT8uYWRkQ29uc29sZUxvZ3NUb0NoYXQoKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgQWRkU2NyZWVuc2hvdFRvQ2hhdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSBCcm93c2VyVmlld0NvbW1hbmRJZC5BZGRTY3JlZW5zaG90VG9DaGF0O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBBZGRTY3JlZW5zaG90VG9DaGF0QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYnJvd3Nlci5hZGRTY3JlZW5zaG90VG9DaGF0QWN0aW9uJywgJ0FkZCBTY3JlZW5zaG90IHRvIENoYXQnKSxcblx0XHRcdGNhdGVnb3J5OiBCcm93c2VyQWN0aW9uQ2F0ZWdvcnksXG5cdFx0XHRpY29uOiBDb2RpY29uLmRldmljZUNhbWVyYSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQlJPV1NFUl9FRElUT1JfQUNUSVZFLCBDT05URVhUX0JST1dTRVJfSEFTX1VSTCwgQ09OVEVYVF9CUk9XU0VSX0hBU19FUlJPUi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkJyb3dzZXJDaGF0QWN0aW9uc01lbnUsXG5cdFx0XHRcdGdyb3VwOiAnM19zY3JlZW5zaG90cycsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBicm93c2VyRWRpdG9yID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGJyb3dzZXJFZGl0b3IgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9yKSB7XG5cdFx0XHRhd2FpdCBicm93c2VyRWRpdG9yLmdldENvbnRyaWJ1dGlvbihCcm93c2VyRWRpdG9yQ2hhdEludGVncmF0aW9uKT8uYWRkU2NyZWVuc2hvdFRvQ2hhdCgpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBBZGRBcmVhU2NyZWVuc2hvdFRvQ2hhdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSBCcm93c2VyVmlld0NvbW1hbmRJZC5BZGRBcmVhU2NyZWVuc2hvdFRvQ2hhdDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQWRkQXJlYVNjcmVlbnNob3RUb0NoYXRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdicm93c2VyLmFkZEFyZWFTY3JlZW5zaG90VG9DaGF0QWN0aW9uJywgJ0FkZCBBcmVhIFNjcmVlbnNob3QgdG8gQ2hhdCcpLFxuXHRcdFx0Y2F0ZWdvcnk6IEJyb3dzZXJBY3Rpb25DYXRlZ29yeSxcblx0XHRcdGljb246IENvZGljb24uc2NyZWVuRnVsbCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQlJPV1NFUl9FRElUT1JfQUNUSVZFLCBDT05URVhUX0JST1dTRVJfSEFTX1VSTCwgQ09OVEVYVF9CUk9XU0VSX0hBU19FUlJPUi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQpLFxuXHRcdFx0dG9nZ2xlZDogQ09OVEVYVF9CUk9XU0VSX0FSRUFfU0VMRUNUSU9OX0FDVElWRSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Ccm93c2VyQ2hhdEFjdGlvbnNNZW51LFxuXHRcdFx0XHRncm91cDogJzNfc2NyZWVuc2hvdHMnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWRcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYnJvd3NlckVkaXRvciA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChicm93c2VyRWRpdG9yIGluc3RhbmNlb2YgQnJvd3NlckVkaXRvcikge1xuXHRcdFx0YXdhaXQgYnJvd3NlckVkaXRvci5nZXRDb250cmlidXRpb24oQnJvd3NlckVkaXRvckNoYXRJbnRlZ3JhdGlvbik/LmFkZEFyZWFTY3JlZW5zaG90VG9DaGF0KCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEFkZEZ1bGxQYWdlU2NyZWVuc2hvdFRvQ2hhdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSBCcm93c2VyVmlld0NvbW1hbmRJZC5BZGRGdWxsUGFnZVNjcmVlbnNob3RUb0NoYXQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgZW5hYmxlZFNldHRpbmcgPSBDb250ZXh0S2V5RXhwci5oYXMoJ2NvbmZpZy53b3JrYmVuY2guYnJvd3Nlci5leHBlcmltZW50YWxVc2VyVG9vbHMuZW5hYmxlZCcpO1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBBZGRGdWxsUGFnZVNjcmVlbnNob3RUb0NoYXRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdicm93c2VyLmFkZEZ1bGxQYWdlU2NyZWVuc2hvdFRvQ2hhdEFjdGlvbicsICdBZGQgRnVsbCBQYWdlIFNjcmVlbnNob3QgdG8gQ2hhdCAoRXhwZXJpbWVudGFsKScpLFxuXHRcdFx0Y2F0ZWdvcnk6IEJyb3dzZXJBY3Rpb25DYXRlZ29yeSxcblx0XHRcdGljb246IENvZGljb24uZGV2aWNlQ2FtZXJhLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChCUk9XU0VSX0VESVRPUl9BQ1RJVkUsIENPTlRFWFRfQlJPV1NFUl9IQVNfVVJMLCBDT05URVhUX0JST1dTRVJfSEFTX0VSUk9SLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCwgZW5hYmxlZFNldHRpbmcpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkJyb3dzZXJDaGF0QWN0aW9uc01lbnUsXG5cdFx0XHRcdGdyb3VwOiAnM19zY3JlZW5zaG90cycsXG5cdFx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsIGVuYWJsZWRTZXR0aW5nKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBicm93c2VyRWRpdG9yID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGJyb3dzZXJFZGl0b3IgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9yKSB7XG5cdFx0XHRhd2FpdCBicm93c2VyRWRpdG9yLmdldENvbnRyaWJ1dGlvbihCcm93c2VyRWRpdG9yQ2hhdEludGVncmF0aW9uKT8uYWRkRnVsbFBhZ2VTY3JlZW5zaG90VG9DaGF0KCk7XG5cdFx0fVxuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihBZGRFbGVtZW50VG9DaGF0QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihBZGRFbGVtZW50Q29tbWVudFRvQ2hhdEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoU3RvcEVsZW1lbnRTZWxlY3Rpb25BY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKEFkZENvbnNvbGVMb2dzVG9DaGF0QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihBZGRTY3JlZW5zaG90VG9DaGF0QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihBZGRBcmVhU2NyZWVuc2hvdFRvQ2hhdEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoQWRkRnVsbFBhZ2VTY3JlZW5zaG90VG9DaGF0QWN0aW9uKTtcblxuLy8gRXhwb3NlIHRoZSBjaGF0IGFjdGlvbnMgc3VibWVudSAoQWRkIEVsZW1lbnQgdG8gQ2hhdCwgZXRjLikgYXMgYSBzcGxpdCBidXR0b24gaW4gdGhlIGJyb3dzZXIgYWN0aW9ucyB0b29sYmFyLlxuLy8gVGhlIHByaW1hcnkgYWN0aW9uIChjaGV2cm9uJ3MgbGVmdCBzaWRlKSBpcyB0aGUgZmlyc3QgaXRlbSBpbiB0aGUgc3VibWVudS5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQnJvd3NlckFjdGlvbnNUb29sYmFyLCB7XG5cdHN1Ym1lbnU6IE1lbnVJZC5Ccm93c2VyQ2hhdEFjdGlvbnNNZW51LFxuXHR0aXRsZTogbG9jYWxpemUyKCdicm93c2VyLmNoYXRBY3Rpb25zU3VibWVudScsIFwiQWRkIHRvIENoYXRcIiksXG5cdGljb246IENvZGljb24uaW5zcGVjdCxcblx0Z3JvdXA6IEJyb3dzZXJBY3Rpb25Hcm91cC5Ub29scyxcblx0b3JkZXI6IDEsXG5cdHdoZW46IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRpc1NwbGl0QnV0dG9uOiB7XG5cdFx0dG9nZ2xlUHJpbWFyeUFjdGlvbjogdHJ1ZSxcblx0XHRwcmltYXJ5QWN0aW9uSWRzOiBbQWRkRWxlbWVudFRvQ2hhdEFjdGlvbi5JRCwgQWRkRWxlbWVudENvbW1lbnRUb0NoYXRBY3Rpb24uSURdXG5cdH1cbn0pO1xuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHQuLi53b3JrYmVuY2hDb25maWd1cmF0aW9uTm9kZUJhc2UsXG5cdHByb3BlcnRpZXM6IHtcblx0XHQnd29ya2JlbmNoLmJyb3dzZXIuZW5hYmxlQ2hhdFRvb2xzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKFxuXHRcdFx0XHR7IGNvbW1lbnQ6IFsnVGhpcyBpcyB0aGUgZGVzY3JpcHRpb24gZm9yIGEgc2V0dGluZy4nXSwga2V5OiAnYnJvd3Nlci5lbmFibGVDaGF0VG9vbHMnIH0sXG5cdFx0XHRcdCdXaGVuIGVuYWJsZWQsIGNoYXQgYWdlbnRzIGNhbiB1c2UgYnJvd3NlciB0b29scyB0byBvcGVuIGFuZCBpbnRlcmFjdCB3aXRoIHBhZ2VzIGluIHRoZSBJbnRlZ3JhdGVkIEJyb3dzZXIuJ1xuXHRcdFx0KSxcblx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRuYW1lOiAnQnJvd3NlckNoYXRUb29scycsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMTAnLFxuXHRcdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0a2V5OiAnYnJvd3Nlci5lbmFibGVDaGF0VG9vbHMnLFxuXHRcdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKCdicm93c2VyLmVuYWJsZUNoYXRUb29scycsICdXaGVuIGVuYWJsZWQsIGNoYXQgYWdlbnRzIGNhbiB1c2UgYnJvd3NlciB0b29scyB0byBvcGVuIGFuZCBpbnRlcmFjdCB3aXRoIHBhZ2VzIGluIHRoZSBJbnRlZ3JhdGVkIEJyb3dzZXIuJylcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0YWdlbnRzV2luZG93OiB7IGRlZmF1bHQ6IHRydWUgfSxcblx0XHR9LFxuXHRcdCd3b3JrYmVuY2guYnJvd3Nlci5leHBlcmltZW50YWxVc2VyVG9vbHMuZW5hYmxlZCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0ZXhwZXJpbWVudDogeyBtb2RlOiAnc3RhcnR1cCcgfSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZShcblx0XHRcdFx0eyBjb21tZW50OiBbJ1RoaXMgaXMgdGhlIGRlc2NyaXB0aW9uIGZvciBhIHNldHRpbmcuJ10sIGtleTogJ2Jyb3dzZXIuZXhwZXJpbWVudGFsVXNlclRvb2xzLmVuYWJsZWQnIH0sXG5cdFx0XHRcdFwiV2hlbiBlbmFibGVkLCBleHBlcmltZW50YWwgdXNlci1mYWNpbmcgdG9vbHMgYXJlIGF2YWlsYWJsZSBpbiB0aGUgSW50ZWdyYXRlZCBCcm93c2VyJ3MgQWRkIHRvIENoYXQgbWVudS5cIlxuXHRcdFx0KSxcblx0XHR9LFxuXHRcdFtCcm93c2VyU2VuZEVsZW1lbnRzVG9DaGF0QXR0YWNoSW1hZ2VzU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd3b3JrYmVuY2guYnJvd3Nlci5zZW5kRWxlbWVudHNUb0NoYXQuYXR0YWNoSW1hZ2VzJywgXCJDb250cm9scyB3aGV0aGVyIGEgc2NyZWVuc2hvdCBvZiB0aGUgc2VsZWN0ZWQgZWxlbWVudCB3aWxsIGJlIGFkZGVkIHRvIHRoZSBjaGF0LlwiKSxcblx0XHR9XG5cdH1cbn0pO1xuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvbk1pZ3JhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uTWlncmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uTWlncmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb25NaWdyYXRpb25zKFtcblx0e1xuXHRcdGtleTogJ2NoYXQuc2VuZEVsZW1lbnRzVG9DaGF0LmF0dGFjaEltYWdlcycsXG5cdFx0bWlncmF0ZUZuOiB2YWx1ZSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IFtzdHJpbmcsIHsgdmFsdWU6IHVua25vd24gfCB1bmRlZmluZWQgfV1bXSA9IFtcblx0XHRcdFx0WydjaGF0LnNlbmRFbGVtZW50c1RvQ2hhdC5hdHRhY2hJbWFnZXMnLCB7IHZhbHVlOiB1bmRlZmluZWQgfV0sXG5cdFx0XHRdO1xuXHRcdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKFtCcm93c2VyU2VuZEVsZW1lbnRzVG9DaGF0QXR0YWNoSW1hZ2VzU2V0dGluZ0lkLCB7IHZhbHVlIH1dKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHR9XG5dKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFNBQVM7QUFDbEIsU0FBUyxhQUFhO0FBQ3RCLFNBQXNCLG9CQUFvQixnQkFBZ0IscUJBQXFCO0FBQy9FLFNBQVMsU0FBUyxpQkFBaUIsUUFBUSxvQkFBb0I7QUFDL0QsU0FBMkIsNkJBQTZCO0FBQ3hELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsUUFBUSxlQUFlO0FBQ2hDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGVBQWUsdUJBQXVCO0FBQy9DLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsV0FBVztBQUNwQixTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBOEYsNEJBQTRCO0FBQ25JLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxlQUFlLDJCQUEyQix1QkFBNkMsdUJBQXVCLDJCQUEyQix5QkFBeUIsMEJBQTBCO0FBQ3JNLFNBQVMsNkJB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
