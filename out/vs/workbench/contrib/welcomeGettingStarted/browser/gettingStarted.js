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
import { $, addDisposableListener, append, clearNode, reset } from "../../../../base/browser/dom.js";
import { renderFormattedText } from "../../../../base/browser/formattedTextRenderer.js";
import { status } from "../../../../base/browser/ui/aria/aria.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Toggle } from "../../../../base/browser/ui/toggle/toggle.js";
import { coalesce, equals } from "../../../../base/common/arrays.js";
import { Delayer, Throttler } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { splitRecentLabel } from "../../../../base/common/labels.js";
import { DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { parse } from "../../../../base/common/marshalling.js";
import { Schemas, matchesScheme } from "../../../../base/common/network.js";
import { OS } from "../../../../base/common/platform.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import "./media/gettingStarted.css";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { localize } from "../../../../nls.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILabelService, Verbosity } from "../../../../platform/label/common/label.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { Link } from "../../../../platform/opener/browser/link.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from "../../../../platform/storage/common/storage.js";
import { firstSessionDateStorageKey, ITelemetryService, TelemetryLevel } from "../../../../platform/telemetry/common/telemetry.js";
import { getTelemetryLevel } from "../../../../platform/telemetry/common/telemetryUtils.js";
import { defaultButtonStyles, defaultKeybindingLabelStyles, defaultToggleStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IWorkspaceContextService, UNKNOWN_EMPTY_WINDOW_WORKSPACE } from "../../../../platform/workspace/common/workspace.js";
import { IWorkspacesService, isRecentFolder, isRecentWorkspace } from "../../../../platform/workspaces/common/workspaces.js";
import { OpenRecentAction } from "../../../browser/actions/windowActions.js";
import { OpenFileFolderAction, OpenFolderAction, OpenFolderViaWorkspaceAction } from "../../../browser/actions/workspaceActions.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { WorkbenchStateContext } from "../../../common/contextkeys.js";
import { IWebviewService } from "../../webview/browser/webview.js";
import "./gettingStartedColors.js";
import { GettingStartedDetailsRenderer } from "./gettingStartedDetailsRenderer.js";
import { gettingStartedCheckedCodicon, gettingStartedUncheckedCodicon } from "./gettingStartedIcons.js";
import { GettingStartedInput } from "./gettingStartedInput.js";
import { IWalkthroughsService, hiddenEntriesConfigurationKey, parseDescription } from "./gettingStartedService.js";
import { restoreWalkthroughsConfigurationKey } from "./startupPage.js";
import { startEntries } from "../common/gettingStartedContent.js";
import { GroupsOrder, IEditorGroupsService, preferredSideBySideGroupDirection } from "../../../services/editor/common/editorGroupsService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IWorkbenchThemeService } from "../../../services/themes/common/workbenchThemeService.js";
import { GettingStartedIndexList } from "./gettingStartedList.js";
import { canShowAgentsBanner, createAgentsBanner } from "../../chat/browser/agentSessions/agentSessionsBanner.js";
import { IChatEntitlementService } from "../../../services/chat/common/chatEntitlementService.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { AccessibleViewAction } from "../../accessibility/browser/accessibleViewActions.js";
import { KeybindingLabel } from "../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
const SLIDE_TRANSITION_TIME_MS = 250;
const configurationKey = "workbench.startupEditor";
const allWalkthroughsHiddenContext = new RawContextKey("allWalkthroughsHidden", false);
const inWelcomeContext = new RawContextKey("inWelcome", false);
const parsedStartEntries = startEntries.map((e, i) => ({
  command: e.content.command,
  description: e.description,
  icon: { type: "icon", icon: e.icon },
  id: e.id,
  order: i,
  title: e.title,
  when: ContextKeyExpr.deserialize(e.when) ?? ContextKeyExpr.true()
}));
const REDUCED_MOTION_KEY = "workbench.welcomePage.preferReducedMotion";
let GettingStartedPage = class extends EditorPane {
  constructor(group, commandService, productService, keybindingService, gettingStartedService, configurationService, telemetryService, languageService, fileService, openerService, themeService, storageService, extensionService, instantiationService, notificationService, groupsService, contextService, quickInputService, workspacesService, labelService, hostService, webviewService, workspaceContextService, accessibilityService, markdownRendererService, chatEntitlementService) {
    super(GettingStartedPage.ID, group, telemetryService, themeService, storageService);
    this.commandService = commandService;
    this.productService = productService;
    this.keybindingService = keybindingService;
    this.gettingStartedService = gettingStartedService;
    this.configurationService = configurationService;
    this.languageService = languageService;
    this.fileService = fileService;
    this.openerService = openerService;
    this.themeService = themeService;
    this.storageService = storageService;
    this.extensionService = extensionService;
    this.instantiationService = instantiationService;
    this.notificationService = notificationService;
    this.groupsService = groupsService;
    this.quickInputService = quickInputService;
    this.workspacesService = workspacesService;
    this.labelService = labelService;
    this.hostService = hostService;
    this.webviewService = webviewService;
    this.workspaceContextService = workspaceContextService;
    this.accessibilityService = accessibilityService;
    this.markdownRendererService = markdownRendererService;
    this.chatEntitlementService = chatEntitlementService;
    this.inProgressScroll = Promise.resolve();
    this.dispatchListeners = new DisposableStore();
    this.stepDisposables = new DisposableStore();
    this.detailsPageDisposables = new DisposableStore();
    this.mediaDisposables = new DisposableStore();
    this.detailsScrollbar = this._register(new MutableDisposable());
    this.buildSlideThrottle = this._register(new Throttler());
    this.recentlyOpenedList = this._register(new MutableDisposable());
    this.startList = this._register(new MutableDisposable());
    this.gettingStartedList = this._register(new MutableDisposable());
    this.showFeaturedWalkthrough = true;
    this.currentMediaComponent = void 0;
    this.currentMediaType = void 0;
    this.container = $(
      ".gettingStartedContainer",
      {
        role: "document",
        tabindex: 0,
        "aria-label": localize("welcomeAriaLabel", "Overview of how to get up to speed with your editor.")
      }
    );
    this.stepMediaComponent = $(".getting-started-media");
    this.stepMediaComponent.id = generateUuid();
    this.categoriesSlideDisposables = this._register(new DisposableStore());
    this.detailsRenderer = new GettingStartedDetailsRenderer(this.fileService, this.notificationService, this.extensionService, this.languageService);
    this.contextService = this._register(contextService.createScoped(this.container));
    inWelcomeContext.bindTo(this.contextService).set(true);
    this.gettingStartedCategories = this.gettingStartedService.getWalkthroughs();
    this._register(this.dispatchListeners);
    const rerender = () => {
      this.gettingStartedCategories = this.gettingStartedService.getWalkthroughs();
      if (this.currentWalkthrough) {
        const existingSteps = this.currentWalkthrough.steps.map((step) => step.id);
        const newCategory = this.gettingStartedCategories.find((category) => this.currentWalkthrough?.id === category.id);
        if (newCategory) {
          const newSteps = newCategory.steps.map((step) => step.id);
          if (!equals(newSteps, existingSteps)) {
            this.buildSlideThrottle.queue(() => this.buildCategoriesSlide());
          }
        }
      } else {
        this.buildSlideThrottle.queue(() => this.buildCategoriesSlide());
      }
    };
    this._register(this.gettingStartedService.onDidAddWalkthrough(rerender));
    this._register(this.gettingStartedService.onDidRemoveWalkthrough(rerender));
    this.recentlyOpened = this.workspacesService.getRecentlyOpened();
    this._register(workspacesService.onDidChangeRecentlyOpened(() => {
      this.recentlyOpened = workspacesService.getRecentlyOpened();
      this.refreshRecentlyOpened();
    }));
    this._register(this.gettingStartedService.onDidChangeWalkthrough((category) => {
      const ourCategory = this.gettingStartedCategories.find((c) => c.id === category.id);
      if (!ourCategory) {
        return;
      }
      ourCategory.title = category.title;
      ourCategory.description = category.description;
      this.container.querySelectorAll(`[x-category-title-for="${category.id}"]`).forEach((step) => step.innerText = ourCategory.title);
      this.container.querySelectorAll(`[x-category-description-for="${category.id}"]`).forEach((step) => step.innerText = ourCategory.description);
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(REDUCED_MOTION_KEY)) {
        this.container.classList.toggle("animatable", this.shouldAnimate());
      }
    }));
    this._register(this.gettingStartedService.onDidProgressStep((step) => {
      const category = this.gettingStartedCategories.find((c) => c.id === step.category);
      if (!category) {
        throw Error("Could not find category with ID: " + step.category);
      }
      const ourStep = category.steps.find((_step) => _step.id === step.id);
      if (!ourStep) {
        throw Error("Could not find step with ID: " + step.id);
      }
      const stats = this.getWalkthroughCompletionStats(category);
      if (!ourStep.done && stats.stepsComplete === stats.stepsTotal - 1) {
        this.hideCategory(category.id);
      }
      ourStep.done = step.done;
      if (category.id === this.currentWalkthrough?.id) {
        const badgeelements = assertReturnsDefined(this.window.document.querySelectorAll(`[data-done-step-id="${step.id}"]`));
        badgeelements.forEach((badgeelement) => {
          if (step.done) {
            badgeelement.setAttribute("aria-checked", "true");
            badgeelement.parentElement?.setAttribute("aria-checked", "true");
            badgeelement.classList.remove(...ThemeIcon.asClassNameArray(gettingStartedUncheckedCodicon));
            badgeelement.classList.add("complete", ...ThemeIcon.asClassNameArray(gettingStartedCheckedCodicon));
            badgeelement.setAttribute("aria-label", localize("stepDone", "{0}: Completed", step.title));
          } else {
            badgeelement.setAttribute("aria-checked", "false");
            badgeelement.parentElement?.setAttribute("aria-checked", "false");
            badgeelement.classList.remove("complete", ...ThemeIcon.asClassNameArray(gettingStartedCheckedCodicon));
            badgeelement.classList.add(...ThemeIcon.asClassNameArray(gettingStartedUncheckedCodicon));
            badgeelement.setAttribute("aria-label", localize("stepNotDone", "{0}: Not completed", step.title));
          }
        });
        if (step.done) {
          status(localize("stepAutoCompleted", "Step {0} completed", step.title));
        }
      }
      this.updateCategoryProgress();
    }));
    this._register(this.storageService.onWillSaveState((e) => {
      if (e.reason !== WillSaveStateReason.SHUTDOWN) {
        return;
      }
      if (this.workspaceContextService.getWorkspace().folders.length !== 0) {
        return;
      }
      if (!this.editorInput || !this.currentWalkthrough || !this.editorInput.selectedCategory || !this.editorInput.selectedStep) {
        return;
      }
      const editorPane = this.groupsService.activeGroup.activeEditorPane;
      if (!(editorPane instanceof GettingStartedPage)) {
        return;
      }
      const restoreData = { folder: UNKNOWN_EMPTY_WINDOW_WORKSPACE.id, category: this.editorInput.selectedCategory, step: this.editorInput.selectedStep };
      this.storageService.store(
        restoreWalkthroughsConfigurationKey,
        JSON.stringify(restoreData),
        StorageScope.PROFILE,
        StorageTarget.MACHINE
      );
    }));
  }
  get editorInput() {
    return this._input;
  }
  // remove when 'workbench.welcomePage.preferReducedMotion' deprecated
  shouldAnimate() {
    if (this.configurationService.getValue(REDUCED_MOTION_KEY)) {
      return false;
    }
    if (this.accessibilityService.isMotionReduced()) {
      return false;
    }
    return true;
  }
  getWalkthroughCompletionStats(walkthrough) {
    const activeSteps = walkthrough.steps.filter((s) => this.contextService.contextMatchesRules(s.when));
    return {
      stepsComplete: activeSteps.filter((s) => s.done).length,
      stepsTotal: activeSteps.length
    };
  }
  async setInput(newInput, options, context, token) {
    await super.setInput(newInput, options, context, token);
    const selectedCategory = options?.selectedCategory ?? newInput.selectedCategory;
    const selectedStep = options?.selectedStep ?? newInput.selectedStep;
    await this.applyInput({ ...options, selectedCategory, selectedStep });
  }
  async setOptions(options) {
    super.setOptions(options);
    if (!this.editorInput) {
      return;
    }
    if (this.editorInput.selectedCategory !== options?.selectedCategory || this.editorInput.selectedStep !== options?.selectedStep) {
      await this.applyInput(options);
    }
  }
  async applyInput(options) {
    if (!this.editorInput) {
      return;
    }
    this.editorInput.showTelemetryNotice = options?.showTelemetryNotice ?? true;
    this.editorInput.selectedCategory = options?.selectedCategory;
    this.editorInput.selectedStep = options?.selectedStep;
    this.editorInput.returnToCommand = options?.returnToCommand;
    this.container.classList.remove("animatable");
    await this.buildCategoriesSlide(options?.preserveFocus);
    if (this.shouldAnimate()) {
      setTimeout(() => this.container.classList.add("animatable"), 0);
    }
  }
  async makeCategoryVisibleWhenAvailable(categoryID, stepId) {
    this.scrollToCategory(categoryID, stepId);
  }
  registerDispatchListeners() {
    this.dispatchListeners.clear();
    this.container.querySelectorAll("[x-dispatch]").forEach((element) => {
      const dispatch = element.getAttribute("x-dispatch") ?? "";
      let command, argument;
      if (dispatch.startsWith("openLink:https")) {
        [command, argument] = ["openLink", dispatch.replace("openLink:", "")];
      } else {
        [command, argument] = dispatch.split(":");
      }
      if (command) {
        this.dispatchListeners.add(addDisposableListener(element, "click", (e) => {
          e.stopPropagation();
          this.runDispatchCommand(command, argument);
        }));
        this.dispatchListeners.add(addDisposableListener(element, "keyup", (e) => {
          const keyboardEvent = new StandardKeyboardEvent(e);
          e.stopPropagation();
          switch (keyboardEvent.keyCode) {
            case KeyCode.Enter:
            case KeyCode.Space:
              this.runDispatchCommand(command, argument);
              return;
          }
        }));
      }
    });
  }
  async runDispatchCommand(command, argument) {
    this.commandService.executeCommand("workbench.action.keepEditor");
    this.telemetryService.publicLog2("gettingStarted.ActionExecuted", { command, argument, walkthroughId: this.currentWalkthrough?.id });
    switch (command) {
      case "scrollPrev": {
        this.scrollPrev();
        break;
      }
      case "skip": {
        this.runSkip();
        break;
      }
      case "showMoreRecents": {
        this.commandService.executeCommand(OpenRecentAction.ID);
        break;
      }
      case "seeAllWalkthroughs": {
        await this.openWalkthroughSelector();
        break;
      }
      case "openFolder": {
        if (this.contextService.contextMatchesRules(ContextKeyExpr.and(WorkbenchStateContext.isEqualTo("workspace")))) {
          this.commandService.executeCommand(OpenFolderViaWorkspaceAction.ID);
        } else {
          this.commandService.executeCommand("workbench.action.files.openFolder");
        }
        break;
      }
      case "selectCategory": {
        this.telemetryService.publicLog2("gettingStarted.ActionExecuted", { command: "selectCategory", argument, walkthroughId: this.currentWalkthrough?.id });
        this.scrollToCategory(argument);
        this.gettingStartedService.markWalkthroughOpened(argument);
        break;
      }
      case "selectStartEntry": {
        const selected = startEntries.find((e) => e.id === argument);
        if (selected) {
          this.telemetryService.publicLog2("gettingStarted.ActionExecuted", { command: "selectStartEntry", argument, walkthroughId: this.currentWalkthrough?.id });
          this.runStepCommand(selected.content.command);
        } else {
          throw Error("could not find start entry with id: " + argument);
        }
        break;
      }
      case "hideCategory": {
        this.hideCategory(argument);
        break;
      }
      // Use selectTask over selectStep to keep telemetry consistant:https://github.com/microsoft/vscode/issues/122256
      case "selectTask": {
        this.selectStep(argument);
        break;
      }
      case "toggleStepCompletion": {
        this.toggleStepCompletion(argument);
        break;
      }
      case "allDone": {
        this.markAllStepsComplete();
        break;
      }
      case "nextSection": {
        const next = this.currentWalkthrough?.next;
        if (next) {
          this.prevWalkthrough = this.currentWalkthrough;
          this.scrollToCategory(next);
        } else {
          console.error("Error scrolling to next section of", this.currentWalkthrough);
        }
        break;
      }
      case "openLink": {
        this.openerService.open(argument);
        break;
      }
      default: {
        console.error("Dispatch to", command, argument, "not defined");
        break;
      }
    }
  }
  hideCategory(categoryId) {
    const selectedCategory = this.gettingStartedCategories.find((category) => category.id === categoryId);
    if (!selectedCategory) {
      throw Error("Could not find category with ID " + categoryId);
    }
    this.setHiddenCategories([...this.getHiddenCategories().add(categoryId)]);
    this.gettingStartedList.value?.rerender();
  }
  markAllStepsComplete() {
    if (this.currentWalkthrough) {
      this.currentWalkthrough?.steps.forEach((step) => {
        if (!step.done) {
          this.gettingStartedService.progressStep(step.id);
        }
      });
      this.hideCategory(this.currentWalkthrough?.id);
      this.scrollPrev();
    } else {
      throw Error("No walkthrough opened");
    }
  }
  toggleStepCompletion(argument) {
    const stepToggle = assertReturnsDefined(this.currentWalkthrough?.steps.find((step) => step.id === argument));
    if (stepToggle.done) {
      this.gettingStartedService.deprogressStep(argument);
    } else {
      this.gettingStartedService.progressStep(argument);
    }
  }
  async openWalkthroughSelector() {
    const selection = await this.quickInputService.pick(this.gettingStartedCategories.filter((c) => this.contextService.contextMatchesRules(c.when)).map((x) => ({
      id: x.id,
      label: x.title,
      detail: x.description,
      description: x.source
    })), { canPickMany: false, matchOnDescription: true, matchOnDetail: true, title: localize("pickWalkthroughs", "Open Walkthrough...") });
    if (selection) {
      this.runDispatchCommand("selectCategory", selection.id);
    }
  }
  getHiddenCategories() {
    return new Set(JSON.parse(this.storageService.get(hiddenEntriesConfigurationKey, StorageScope.PROFILE, "[]")));
  }
  setHiddenCategories(hidden) {
    this.storageService.store(
      hiddenEntriesConfigurationKey,
      JSON.stringify(hidden),
      StorageScope.PROFILE,
      StorageTarget.USER
    );
  }
  async buildMediaComponent(stepId, forceRebuild = false) {
    if (!this.currentWalkthrough) {
      throw Error("no walkthrough selected");
    }
    const stepToExpand = assertReturnsDefined(this.currentWalkthrough.steps.find((step) => step.id === stepId));
    if (!forceRebuild && this.currentMediaComponent === stepId) {
      return;
    }
    this.currentMediaComponent = stepId;
    this.stepDisposables.clear();
    this.stepDisposables.add({
      dispose: () => {
        this.currentMediaComponent = void 0;
      }
    });
    if (this.currentMediaType !== stepToExpand.media.type) {
      this.mediaDisposables.clear();
      this.currentMediaType = stepToExpand.media.type;
      this.mediaDisposables.add(toDisposable(() => {
        this.currentMediaType = void 0;
      }));
      clearNode(this.stepMediaComponent);
      if (stepToExpand.media.type === "svg") {
        this.webview = this.mediaDisposables.add(this.webviewService.createWebviewElement({ title: void 0, options: { disableServiceWorker: true }, contentOptions: {}, extension: void 0 }));
        this.webview.mountTo(this.stepMediaComponent, this.window);
      } else if (stepToExpand.media.type === "markdown") {
        this.webview = this.mediaDisposables.add(this.webviewService.createWebviewElement({ options: {}, contentOptions: { localResourceRoots: [stepToExpand.media.root], allowScripts: true }, title: "", extension: void 0 }));
        this.webview.mountTo(this.stepMediaComponent, this.window);
      } else if (stepToExpand.media.type === "video") {
        this.webview = this.mediaDisposables.add(this.webviewService.createWebviewElement({ options: {}, contentOptions: { localResourceRoots: [stepToExpand.media.root], allowScripts: true }, title: "", extension: void 0 }));
        this.webview.mountTo(this.stepMediaComponent, this.window);
      }
    }
    if (stepToExpand.media.type === "image") {
      this.stepsContent.classList.add("image");
      this.stepsContent.classList.remove("markdown");
      this.stepsContent.classList.remove("video");
      const media = stepToExpand.media;
      const mediaElement = $("img");
      clearNode(this.stepMediaComponent);
      this.stepMediaComponent.appendChild(mediaElement);
      mediaElement.setAttribute("alt", media.altText);
      this.updateMediaSourceForColorMode(mediaElement, media.path);
      this.stepDisposables.add(addDisposableListener(this.stepMediaComponent, "click", () => {
        const hrefs = stepToExpand.description.map((lt) => lt.nodes.filter((node) => typeof node !== "string").map((node) => node.href)).flat();
        if (hrefs.length === 1) {
          const href = hrefs[0];
          if (href.startsWith("http")) {
            this.telemetryService.publicLog2("gettingStarted.ActionExecuted", { command: "runStepAction", argument: href, walkthroughId: this.currentWalkthrough?.id });
            this.openerService.open(href);
          }
        }
      }));
      this.stepDisposables.add(this.themeService.onDidColorThemeChange(() => this.updateMediaSourceForColorMode(mediaElement, media.path)));
    } else if (stepToExpand.media.type === "svg") {
      this.stepsContent.classList.add("image");
      this.stepsContent.classList.remove("markdown");
      this.stepsContent.classList.remove("video");
      const media = stepToExpand.media;
      this.webview.setHtml(await this.detailsRenderer.renderSVG(media.path));
      let isDisposed = false;
      this.stepDisposables.add(toDisposable(() => {
        isDisposed = true;
      }));
      this.stepDisposables.add(this.themeService.onDidColorThemeChange(async () => {
        const body = await this.detailsRenderer.renderSVG(media.path);
        if (!isDisposed) {
          this.webview.setHtml(body);
        }
      }));
      this.stepDisposables.add(addDisposableListener(this.stepMediaComponent, "click", () => {
        const hrefs = stepToExpand.description.map((lt) => lt.nodes.filter((node) => typeof node !== "string").map((node) => node.href)).flat();
        if (hrefs.length === 1) {
          const href = hrefs[0];
          if (href.startsWith("http")) {
            this.telemetryService.publicLog2("gettingStarted.ActionExecuted", { command: "runStepAction", argument: href, walkthroughId: this.currentWalkthrough?.id });
            this.openerService.open(href);
          }
        }
      }));
      this.stepDisposables.add(this.webview.onDidClickLink((link) => {
        if (matchesScheme(link, Schemas.https) || matchesScheme(link, Schemas.http) || matchesScheme(link, Schemas.command)) {
          this.openerService.open(link, { allowCommands: true });
        }
      }));
    } else if (stepToExpand.media.type === "markdown") {
      this.stepsContent.classList.remove("image");
      this.stepsContent.classList.add("markdown");
      this.stepsContent.classList.remove("video");
      const media = stepToExpand.media;
      const rawHTML = await this.detailsRenderer.renderMarkdown(media.path, media.base);
      this.webview.setHtml(rawHTML);
      const serializedContextKeyExprs = rawHTML.match(/checked-on=\"([^'][^"]*)\"/g)?.map((attr) => attr.slice('checked-on="'.length, -1).replace(/&#39;/g, "'").replace(/&amp;/g, "&"));
      const postTrueKeysMessage = () => {
        const enabledContextKeys = serializedContextKeyExprs?.filter((expr) => this.contextService.contextMatchesRules(ContextKeyExpr.deserialize(expr)));
        if (enabledContextKeys) {
          this.webview.postMessage({
            enabledContextKeys
          });
        }
      };
      if (serializedContextKeyExprs) {
        const contextKeyExprs = coalesce(serializedContextKeyExprs.map((expr) => ContextKeyExpr.deserialize(expr)));
        const watchingKeys = new Set(contextKeyExprs.flatMap((expr) => expr.keys()));
        this.stepDisposables.add(this.contextService.onDidChangeContext((e) => {
          if (e.affectsSome(watchingKeys)) {
            postTrueKeysMessage();
          }
        }));
      }
      let isDisposed = false;
      this.stepDisposables.add(toDisposable(() => {
        isDisposed = true;
      }));
      this.stepDisposables.add(this.webview.onDidClickLink((link) => {
        if (matchesScheme(link, Schemas.https) || matchesScheme(link, Schemas.http) || matchesScheme(link, Schemas.command)) {
          const toSide = link.startsWith("command:toSide:");
          if (toSide) {
            link = link.replace("command:toSide:", "command:");
            this.focusSideEditorGroup();
          }
          this.openerService.open(link, { allowCommands: true, openToSide: toSide });
        }
      }));
      if (rawHTML.indexOf("<code>") >= 0) {
        this.stepDisposables.add(this.themeService.onDidColorThemeChange(async () => {
          const body = await this.detailsRenderer.renderMarkdown(media.path, media.base);
          if (!isDisposed) {
            this.webview.setHtml(body);
            postTrueKeysMessage();
          }
        }));
      }
      const layoutDelayer = new Delayer(50);
      this.layoutMarkdown = () => {
        layoutDelayer.trigger(() => {
          this.webview.postMessage({ layoutMeNow: true });
        });
      };
      this.stepDisposables.add(layoutDelayer);
      this.stepDisposables.add({ dispose: () => this.layoutMarkdown = void 0 });
      postTrueKeysMessage();
      this.stepDisposables.add(this.webview.onMessage(async (e) => {
        const message = e.message;
        if (message.startsWith("command:")) {
          this.openerService.open(message, { allowCommands: true });
        } else if (message.startsWith("setTheme:")) {
          const themeId = message.slice("setTheme:".length);
          const theme = (await this.themeService.getColorThemes()).find((theme2) => theme2.settingsId === themeId);
          if (theme) {
            this.themeService.setColorTheme(theme.id, ConfigurationTarget.USER);
          }
        } else {
          console.error("Unexpected message", message);
        }
      }));
    } else if (stepToExpand.media.type === "video") {
      this.stepsContent.classList.add("video");
      this.stepsContent.classList.remove("markdown");
      this.stepsContent.classList.remove("image");
      const media = stepToExpand.media;
      const themeType = this.themeService.getColorTheme().type;
      const videoPath = media.path[themeType];
      const videoPoster = media.poster ? media.poster[themeType] : void 0;
      const altText = media.altText ? media.altText : localize("videoAltText", "Video for {0}", stepToExpand.title);
      const rawHTML = await this.detailsRenderer.renderVideo(videoPath, videoPoster, altText);
      this.webview.setHtml(rawHTML);
      let isDisposed = false;
      this.stepDisposables.add(toDisposable(() => {
        isDisposed = true;
      }));
      this.stepDisposables.add(this.themeService.onDidColorThemeChange(async () => {
        const themeType2 = this.themeService.getColorTheme().type;
        const videoPath2 = media.path[themeType2];
        const videoPoster2 = media.poster ? media.poster[themeType2] : void 0;
        const body = await this.detailsRenderer.renderVideo(videoPath2, videoPoster2, altText);
        if (!isDisposed) {
          this.webview.setHtml(body);
        }
      }));
    }
  }
  async selectStepLoose(id) {
    if (!this.editorInput) {
      return;
    }
    if (id.startsWith(`${this.editorInput.selectedCategory}#`)) {
      this.selectStep(id);
    } else {
      const toSelect = this.editorInput.selectedCategory + "#" + id;
      this.selectStep(toSelect);
    }
  }
  provideScreenReaderUpdate() {
    if (this.configurationService.getValue(AccessibilityVerbositySettingId.Walkthrough)) {
      const kbLabel = this.keybindingService.lookupKeybinding(AccessibleViewAction.id)?.getAriaLabel();
      return kbLabel ? localize("acessibleViewHint", "Inspect this in the accessible view ({0}).\n", kbLabel) : localize("acessibleViewHintNoKbOpen", "Inspect this in the accessible view via the command Open Accessible View which is currently not triggerable via keybinding.\n");
    }
    return "";
  }
  async selectStep(id, delayFocus = true, preserveFocus) {
    if (!this.editorInput) {
      return;
    }
    if (id) {
      let stepElement = this.container.querySelector(`[data-step-id="${id}"]`);
      if (!stepElement) {
        stepElement = this.container.querySelector(`[data-step-id]`);
        if (!stepElement) {
          return;
        }
        id = assertReturnsDefined(stepElement.getAttribute("data-step-id"));
      }
      stepElement.parentElement?.querySelectorAll(".expanded").forEach((node) => {
        if (node.getAttribute("data-step-id") !== id) {
          node.classList.remove("expanded");
          node.setAttribute("aria-expanded", "false");
          const codiconElement2 = node.querySelector(".codicon");
          if (codiconElement2) {
            codiconElement2.removeAttribute("tabindex");
          }
        }
      });
      if (!preserveFocus) {
        setTimeout(() => stepElement.focus(), delayFocus && this.shouldAnimate() ? SLIDE_TRANSITION_TIME_MS : 0);
      }
      this.editorInput.selectedStep = id;
      stepElement.classList.add("expanded");
      stepElement.setAttribute("aria-expanded", "true");
      this.buildMediaComponent(id, true);
      const codiconElement = stepElement.querySelector(".codicon");
      if (codiconElement) {
        codiconElement.setAttribute("tabindex", "0");
      }
      this.gettingStartedService.progressByEvent("stepSelected:" + id);
      const step = this.currentWalkthrough?.steps?.find((step2) => step2.id === id);
      if (step) {
        stepElement.setAttribute("aria-label", `${this.provideScreenReaderUpdate()} ${step.title}`);
      }
    } else {
      this.editorInput.selectedStep = void 0;
    }
    this.detailsPageScrollbar?.scanDomNode();
    this.detailsScrollbar.value?.scanDomNode();
  }
  updateMediaSourceForColorMode(element, sources) {
    const themeType = this.themeService.getColorTheme().type;
    const src = sources[themeType].toString(true).replace(/ /g, "%20");
    element.srcset = src.toLowerCase().endsWith(".svg") ? src : src + " 1.5x";
  }
  createEditor(parent) {
    if (this.detailsPageScrollbar) {
      this.detailsPageScrollbar.dispose();
    }
    if (this.categoriesPageScrollbar) {
      this.categoriesPageScrollbar.dispose();
    }
    this.categoriesSlide = $(".gettingStartedSlideCategories.gettingStartedSlide");
    const prevButton = $("button.prev-button.button-link", { "x-dispatch": "scrollPrev" }, $("span.scroll-button.codicon.codicon-chevron-left"), $("span.moreText", {}, localize("goBack", "Go Back")));
    this.stepsSlide = $(".gettingStartedSlideDetails.gettingStartedSlide", {}, prevButton);
    this.stepsContent = $(".gettingStartedDetailsContent", {});
    this.detailsPageScrollbar = this._register(new DomScrollableElement(this.stepsContent, { className: "full-height-scrollable", vertical: ScrollbarVisibility.Hidden }));
    this.categoriesPageScrollbar = this._register(new DomScrollableElement(this.categoriesSlide, { className: "full-height-scrollable categoriesScrollbar", vertical: ScrollbarVisibility.Hidden }));
    this.stepsSlide.appendChild(this.detailsPageScrollbar.getDomNode());
    const gettingStartedPage = $(".gettingStarted", {}, this.categoriesPageScrollbar.getDomNode(), this.stepsSlide);
    this.container.appendChild(gettingStartedPage);
    this.categoriesPageScrollbar.scanDomNode();
    this.detailsPageScrollbar.scanDomNode();
    parent.appendChild(this.container);
  }
  async buildCategoriesSlide(preserveFocus) {
    this.categoriesSlideDisposables.clear();
    const showOnStartupCheckbox = new Toggle({
      icon: Codicon.check,
      actionClassName: "getting-started-checkbox",
      isChecked: this.configurationService.getValue(configurationKey) === "welcomePage",
      title: localize("checkboxTitle", "When checked, this page will be shown on startup."),
      ...defaultToggleStyles
    });
    showOnStartupCheckbox.domNode.id = "showOnStartup";
    const showOnStartupLabel = $("label.caption", { for: "showOnStartup" }, localize("welcomePage.showOnStartup", "Show welcome page on startup"));
    const onShowOnStartupChanged = () => {
      if (showOnStartupCheckbox.checked) {
        this.telemetryService.publicLog2("gettingStarted.ActionExecuted", { command: "showOnStartupChecked", argument: void 0, walkthroughId: this.currentWalkthrough?.id });
        this.configurationService.updateValue(configurationKey, "welcomePage");
      } else {
        this.telemetryService.publicLog2("gettingStarted.ActionExecuted", { command: "showOnStartupUnchecked", argument: void 0, walkthroughId: this.currentWalkthrough?.id });
        this.configurationService.updateValue(configurationKey, "none");
      }
    };
    this.categoriesSlideDisposables.add(showOnStartupCheckbox);
    this.categoriesSlideDisposables.add(showOnStartupCheckbox.onChange(() => {
      onShowOnStartupChanged();
    }));
    this.categoriesSlideDisposables.add(addDisposableListener(showOnStartupLabel, "click", () => {
      showOnStartupCheckbox.checked = !showOnStartupCheckbox.checked;
      onShowOnStartupChanged();
    }));
    const header = $(
      ".header",
      {},
      $("h1.product-name.caption", {}, this.productService.nameLong),
      $("p.subtitle.description", {}, localize({ key: "gettingStarted.editingEvolved", comment: ["Shown as subtitle on the Welcome page."] }, "Editing evolved"))
    );
    const leftColumn = $(".categories-column.categories-column-left", {});
    const rightColumn = $(".categories-column.categories-column-right", {});
    const startList = this.buildStartList();
    const recentList = this.buildRecentlyOpenedList();
    const gettingStartedList = this.buildGettingStartedWalkthroughsList();
    const footerChildren = [];
    if (canShowAgentsBanner(this.chatEntitlementService)) {
      const agentsBanner = createAgentsBanner(
        {
          cssClass: "getting-started-category.agents-banner",
          source: "welcomePage"
        },
        this.commandService,
        this.telemetryService
      );
      this.categoriesSlideDisposables.add(agentsBanner.disposables);
      footerChildren.push(agentsBanner.element);
    }
    footerChildren.push($(
      "p.showOnStartup",
      {},
      showOnStartupCheckbox.domNode,
      showOnStartupLabel
    ));
    const footer = $(".footer", {}, ...footerChildren);
    const layoutLists = () => {
      if (gettingStartedList.itemCount) {
        this.container.classList.remove("noWalkthroughs");
        reset(rightColumn, gettingStartedList.getDomElement());
      } else {
        this.container.classList.add("noWalkthroughs");
        reset(rightColumn);
      }
      setTimeout(() => this.categoriesPageScrollbar?.scanDomNode(), 50);
      layoutRecentList();
    };
    const layoutRecentList = () => {
      if (this.container.classList.contains("noWalkthroughs")) {
        recentList.setLimit(10);
        reset(leftColumn, startList.getDomElement());
        reset(rightColumn, recentList.getDomElement());
      } else {
        recentList.setLimit(5);
        reset(leftColumn, startList.getDomElement(), recentList.getDomElement());
      }
    };
    gettingStartedList.onDidChange(layoutLists);
    layoutLists();
    reset(this.categoriesSlide, $(".gettingStartedCategoriesContainer", {}, header, leftColumn, rightColumn, footer));
    this.categoriesPageScrollbar?.scanDomNode();
    this.updateCategoryProgress();
    this.registerDispatchListeners();
    const editorInput = this.editorInput;
    if (editorInput?.selectedCategory) {
      this.currentWalkthrough = this.gettingStartedCategories.find((category) => category.id === editorInput.selectedCategory);
      if (!this.currentWalkthrough) {
        this.gettingStartedCategories = this.gettingStartedService.getWalkthroughs();
        this.currentWalkthrough = this.gettingStartedCategories.find((category) => category.id === editorInput.selectedCategory);
        if (this.currentWalkthrough) {
          this.buildCategorySlide(editorInput.selectedCategory, editorInput.selectedStep, preserveFocus);
          this.setSlide("details");
          return;
        }
      } else {
        this.buildCategorySlide(editorInput.selectedCategory, editorInput.selectedStep, preserveFocus);
        this.setSlide("details");
        return;
      }
    }
    if (this.editorInput?.showTelemetryNotice && this.productService.openToWelcomeMainPage) {
      const telemetryNotice = $("p.telemetry-notice");
      this.buildTelemetryFooter(telemetryNotice);
      footer.appendChild(telemetryNotice);
    } else if (!this.productService.openToWelcomeMainPage && this.showFeaturedWalkthrough && this.storageService.isNew(StorageScope.APPLICATION) && !this.configurationService.getValue("workbench.welcomePage.experimentalOnboarding")) {
      const firstSessionDateString = this.storageService.get(firstSessionDateStorageKey, StorageScope.APPLICATION) || (/* @__PURE__ */ new Date()).toUTCString();
      const daysSinceFirstSession = (+/* @__PURE__ */ new Date() - +new Date(firstSessionDateString)) / 1e3 / 60 / 60 / 24;
      const fistContentBehaviour = daysSinceFirstSession < 1 ? "openToFirstCategory" : "index";
      if (fistContentBehaviour === "openToFirstCategory") {
        const first = this.gettingStartedCategories.filter((c) => !c.when || this.contextService.contextMatchesRules(c.when))[0];
        if (first && this.editorInput) {
          this.currentWalkthrough = first;
          this.editorInput.selectedCategory = this.currentWalkthrough?.id;
          this.editorInput.walkthroughPageTitle = this.currentWalkthrough.walkthroughPageTitle;
          this.buildCategorySlide(this.editorInput.selectedCategory, void 0, preserveFocus);
          this.setSlide(
            "details",
            true
            /* firstLaunch */
          );
          return;
        }
      }
    }
    this.setSlide("categories");
  }
  buildRecentlyOpenedList() {
    const renderRecent = (recent) => {
      let fullPath;
      let windowOpenable;
      let resourceUri;
      if (isRecentFolder(recent)) {
        windowOpenable = { folderUri: recent.folderUri };
        fullPath = recent.label || this.labelService.getWorkspaceLabel(recent.folderUri, { verbose: Verbosity.LONG });
        resourceUri = recent.folderUri;
      } else {
        fullPath = recent.label || this.labelService.getWorkspaceLabel(recent.workspace, { verbose: Verbosity.LONG });
        windowOpenable = { workspaceUri: recent.workspace.configPath };
        resourceUri = recent.workspace.configPath;
      }
      const { name, parentPath } = splitRecentLabel(fullPath);
      const li = $("li");
      const link = $("button.button-link");
      link.innerText = name;
      link.title = fullPath;
      link.setAttribute("aria-label", localize("welcomePage.openFolderWithPath", "Open folder {0} with path {1}", name, parentPath));
      link.addEventListener("click", (e) => {
        this.telemetryService.publicLog2("gettingStarted.ActionExecuted", { command: "openRecent", argument: void 0, walkthroughId: this.currentWalkthrough?.id });
        this.hostService.openWindow([windowOpenable], {
          forceNewWindow: e.ctrlKey || e.metaKey,
          remoteAuthority: recent.remoteAuthority || null
          // local window if remoteAuthority is not set or can not be deducted from the openable
        });
        e.preventDefault();
        e.stopPropagation();
      });
      li.appendChild(link);
      const span = $("span");
      span.classList.add("path");
      span.classList.add("detail");
      span.innerText = parentPath;
      span.title = fullPath;
      li.appendChild(span);
      const deleteButton = $("a.codicon.codicon-close.hide-category-button.recently-opened-delete-button", {
        "tabindex": 0,
        "role": "button",
        "title": localize("welcomePage.removeRecent", "Remove from Recently Opened"),
        "aria-label": localize("welcomePage.removeRecentAriaLabel", "Remove {0} from Recently Opened", name)
      });
      const handleDelete = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this.workspacesService.removeRecentlyOpened([resourceUri]);
      };
      deleteButton.addEventListener("click", handleDelete);
      deleteButton.addEventListener("keydown", async (e) => {
        const event = new StandardKeyboardEvent(e);
        if (event.keyCode === KeyCode.Enter || event.keyCode === KeyCode.Space) {
          await handleDelete(e);
        }
      });
      li.appendChild(deleteButton);
      return li;
    };
    const recentlyOpenedList = this.recentlyOpenedList.value = new GettingStartedIndexList(
      {
        title: localize("recent", "Recent"),
        klass: "recently-opened",
        limit: 5,
        empty: $(
          ".empty-recent",
          {},
          localize("noRecents", "You have no recent folders,"),
          $("button.button-link", { "x-dispatch": "openFolder" }, localize("openFolder", "open a folder")),
          localize("toStart", "to start.")
        ),
        more: $(
          ".more",
          {},
          $(
            "button.button-link",
            {
              "x-dispatch": "showMoreRecents",
              title: localize("show more recents", "Show All Recent Folders {0}", this.getKeybindingLabel(OpenRecentAction.ID))
            },
            localize("showAll", "More...")
          )
        ),
        renderElement: renderRecent,
        contextService: this.contextService
      }
    );
    recentlyOpenedList.onDidChange(() => this.registerDispatchListeners());
    this.recentlyOpened.then(({ workspaces }) => {
      const workspacesWithID = this.filterRecentlyOpened(workspaces);
      const updateEntries = () => {
        recentlyOpenedList.setEntries(workspacesWithID);
      };
      updateEntries();
      recentlyOpenedList.register(this.labelService.onDidChangeFormatters(() => updateEntries()));
    }).catch(onUnexpectedError);
    return recentlyOpenedList;
  }
  filterRecentlyOpened(workspaces) {
    return workspaces.filter((recent) => !this.workspaceContextService.isCurrentWorkspace(isRecentWorkspace(recent) ? recent.workspace : recent.folderUri)).map((recent) => ({ ...recent, id: isRecentWorkspace(recent) ? recent.workspace.id : recent.folderUri.toString() }));
  }
  refreshRecentlyOpened() {
    if (!this.recentlyOpenedList.value) {
      return;
    }
    this.recentlyOpened.then(({ workspaces }) => {
      const workspacesWithID = this.filterRecentlyOpened(workspaces);
      this.recentlyOpenedList.value?.setEntries(workspacesWithID);
    }).catch(onUnexpectedError);
  }
  buildStartList() {
    const renderStartEntry = (entry) => $(
      "li",
      {},
      $(
        "button.button-link",
        {
          "x-dispatch": "selectStartEntry:" + entry.id,
          title: entry.description + " " + this.getKeybindingLabel(entry.command)
        },
        this.iconWidgetFor(entry),
        $("span", {}, entry.title)
      )
    );
    const startList = this.startList.value = new GettingStartedIndexList(
      {
        title: localize("start", "Start"),
        klass: "start-container",
        limit: 10,
        renderElement: renderStartEntry,
        rankElement: (e) => -e.order,
        contextService: this.contextService
      }
    );
    startList.setEntries(parsedStartEntries);
    startList.onDidChange(() => this.registerDispatchListeners());
    return startList;
  }
  buildGettingStartedWalkthroughsList() {
    const renderGetttingStaredWalkthrough = (category) => {
      const renderNewBadge = (category.newItems || category.newEntry) && !category.isFeatured;
      const newBadge = $(".new-badge", {});
      if (category.newEntry) {
        reset(newBadge, $(".new-category", {}, localize("new", "New")));
      } else if (category.newItems) {
        reset(newBadge, $(".new-items", {}, localize({ key: "newItems", comment: ["Shown when a list of items has changed based on an update from a remote source"] }, "Updated")));
      }
      const featuredBadge = $(".featured-badge", {});
      const descriptionContent = $(".description-content", {});
      if (category.isFeatured && this.showFeaturedWalkthrough) {
        reset(featuredBadge, $(".featured", {}, $("span.featured-icon.codicon.codicon-star-full")));
        reset(descriptionContent, ...renderLabelWithIcons(category.description));
      }
      const titleContent = $("h3.category-title.max-lines-3", { "x-category-title-for": category.id });
      reset(titleContent, ...renderLabelWithIcons(category.title));
      return $(
        "button.getting-started-category" + (category.isFeatured && this.showFeaturedWalkthrough ? ".featured" : ""),
        {
          "x-dispatch": "selectCategory:" + category.id,
          "title": category.description
        },
        featuredBadge,
        $(
          ".main-content",
          {},
          this.iconWidgetFor(category),
          titleContent,
          renderNewBadge ? newBadge : $(".no-badge"),
          $("a.codicon.codicon-close.hide-category-button", {
            "tabindex": 0,
            "x-dispatch": "hideCategory:" + category.id,
            "title": localize("close", "Hide"),
            "role": "button",
            "aria-label": localize("closeAriaLabel", "Hide")
          })
        ),
        descriptionContent,
        $(
          ".category-progress",
          { "x-data-category-id": category.id },
          $(
            ".progress-bar-outer",
            { "role": "progressbar" },
            $(".progress-bar-inner")
          )
        )
      );
    };
    const rankWalkthrough = (e) => {
      let rank = e.order;
      if (e.isFeatured) {
        rank += 7;
      }
      if (e.newEntry) {
        rank += 3;
      }
      if (e.newItems) {
        rank += 2;
      }
      if (e.recencyBonus) {
        rank += 4 * e.recencyBonus;
      }
      if (this.getHiddenCategories().has(e.id)) {
        rank = null;
      }
      return rank;
    };
    const gettingStartedList = this.gettingStartedList.value = new GettingStartedIndexList(
      {
        title: localize("walkthroughs", "Walkthroughs"),
        klass: "getting-started",
        limit: 5,
        footer: $("span.button-link.see-all-walkthroughs", { "x-dispatch": "seeAllWalkthroughs", "tabindex": 0 }, localize("showAll", "More...")),
        renderElement: renderGetttingStaredWalkthrough,
        rankElement: rankWalkthrough,
        contextService: this.contextService
      }
    );
    gettingStartedList.onDidChange(() => {
      const hidden = this.getHiddenCategories();
      const someWalkthroughsHidden = hidden.size || gettingStartedList.itemCount < this.gettingStartedCategories.filter((c) => this.contextService.contextMatchesRules(c.when)).length;
      this.container.classList.toggle("someWalkthroughsHidden", !!someWalkthroughsHidden);
      this.registerDispatchListeners();
      allWalkthroughsHiddenContext.bindTo(this.contextService).set(gettingStartedList.itemCount === 0);
      this.updateCategoryProgress();
    });
    gettingStartedList.setEntries(this.gettingStartedCategories);
    allWalkthroughsHiddenContext.bindTo(this.contextService).set(gettingStartedList.itemCount === 0);
    return gettingStartedList;
  }
  layout(size) {
    this.detailsScrollbar.value?.scanDomNode();
    this.categoriesPageScrollbar?.scanDomNode();
    this.detailsPageScrollbar?.scanDomNode();
    this.startList.value?.layout(size);
    this.gettingStartedList.value?.layout(size);
    this.recentlyOpenedList.value?.layout(size);
    if (this.editorInput?.selectedStep && this.currentMediaType) {
      this.mediaDisposables.clear();
      this.stepDisposables.clear();
      this.buildMediaComponent(this.editorInput.selectedStep);
    }
    this.layoutMarkdown?.();
    this.container.classList.toggle("height-constrained", size.height <= 600);
    this.container.classList.toggle("width-constrained", size.width <= 400);
    this.container.classList.toggle("width-semi-constrained", size.width <= 950);
    this.categoriesPageScrollbar?.scanDomNode();
    this.detailsPageScrollbar?.scanDomNode();
    this.detailsScrollbar.value?.scanDomNode();
  }
  updateCategoryProgress() {
    this.window.document.querySelectorAll(".category-progress").forEach((element) => {
      const categoryID = element.getAttribute("x-data-category-id");
      const category = this.gettingStartedCategories.find((c) => c.id === categoryID);
      if (!category) {
        return;
      }
      const stats = this.getWalkthroughCompletionStats(category);
      const bar = assertReturnsDefined(element.querySelector(".progress-bar-inner"));
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuenow", "" + stats.stepsComplete);
      bar.setAttribute("aria-valuemax", "" + stats.stepsTotal);
      const progress = stats.stepsComplete / stats.stepsTotal * 100;
      bar.style.width = `${progress}%`;
      element.parentElement.classList.toggle("no-progress", stats.stepsComplete === 0);
      if (stats.stepsTotal === stats.stepsComplete) {
        bar.title = localize("gettingStarted.allStepsComplete", "All {0} steps complete!", stats.stepsComplete);
      } else {
        bar.title = localize("gettingStarted.someStepsComplete", "{0} of {1} steps complete", stats.stepsComplete, stats.stepsTotal);
      }
    });
  }
  async scrollToCategory(categoryID, stepId) {
    if (!this.gettingStartedCategories.some((c) => c.id === categoryID)) {
      this.gettingStartedCategories = this.gettingStartedService.getWalkthroughs();
    }
    const ourCategory = this.gettingStartedCategories.find((c) => c.id === categoryID);
    if (!ourCategory) {
      throw Error("Could not find category with ID: " + categoryID);
    }
    this.inProgressScroll = this.inProgressScroll.then(async () => {
      if (!this.editorInput) {
        return;
      }
      reset(this.stepsContent);
      this.editorInput.selectedCategory = categoryID;
      this.editorInput.selectedStep = stepId;
      this.editorInput.walkthroughPageTitle = ourCategory.walkthroughPageTitle;
      this.currentWalkthrough = ourCategory;
      this.buildCategorySlide(categoryID, stepId);
      this.setSlide("details");
    });
  }
  iconWidgetFor(category) {
    const widget = category.icon.type === "icon" ? $(ThemeIcon.asCSSSelector(category.icon.icon)) : $("img.category-icon", { src: category.icon.path });
    widget.classList.add("icon-widget");
    return widget;
  }
  focusSideEditorGroup() {
    const fullSize = this.groupsService.getPart(this.group).contentDimension;
    if (!fullSize || fullSize.width <= 700 || this.container.classList.contains("width-constrained") || this.container.classList.contains("width-semi-constrained")) {
      return;
    }
    if (this.groupsService.count === 1) {
      const editorGroupSplitDirection = preferredSideBySideGroupDirection(this.configurationService);
      const sideGroup = this.groupsService.addGroup(this.groupsService.groups[0], editorGroupSplitDirection);
      this.groupsService.activateGroup(sideGroup);
    }
    const nonGettingStartedGroup = this.groupsService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE).find((group) => !(group.activeEditor instanceof GettingStartedInput));
    if (nonGettingStartedGroup) {
      this.groupsService.activateGroup(nonGettingStartedGroup);
      nonGettingStartedGroup.focus();
    }
  }
  runStepCommand(href) {
    const isCommand = href.startsWith("command:");
    const toSide = href.startsWith("command:toSide:");
    const command = href.replace(/command:(toSide:)?/, "command:");
    this.telemetryService.publicLog2("gettingStarted.ActionExecuted", { command: "runStepAction", argument: href, walkthroughId: this.currentWalkthrough?.id });
    if (toSide) {
      this.focusSideEditorGroup();
    }
    if (isCommand) {
      const commandURI = URI.parse(command);
      let args = [];
      try {
        args = parse(decodeURIComponent(commandURI.query));
      } catch {
        try {
          args = parse(commandURI.query);
        } catch {
        }
      }
      if (!Array.isArray(args)) {
        args = [args];
      }
      if ((commandURI.path === OpenFileFolderAction.ID.toString() || commandURI.path === OpenFolderAction.ID.toString()) && this.workspaceContextService.getWorkspace().folders.length === 0) {
        const selectedStepIndex = this.currentWalkthrough?.steps.findIndex((step) => step.id === this.editorInput?.selectedStep);
        if (selectedStepIndex !== void 0 && selectedStepIndex > -1 && this.currentWalkthrough?.steps.slice(selectedStepIndex + 1).some((step) => !step.done)) {
          const restoreData = { folder: UNKNOWN_EMPTY_WINDOW_WORKSPACE.id, category: this.editorInput?.selectedCategory, step: this.editorInput?.selectedStep };
          this.storageService.store(
            restoreWalkthroughsConfigurationKey,
            JSON.stringify(restoreData),
            StorageScope.PROFILE,
            StorageTarget.MACHINE
          );
        }
      }
      this.commandService.executeCommand(commandURI.path, ...args).then((result) => {
        const toOpen = result?.openFolder;
        if (toOpen) {
          if (!URI.isUri(toOpen)) {
            console.warn("Warn: Running walkthrough command", href, "yielded non-URI `openFolder` result", toOpen, ". It will be disregarded.");
            return;
          }
          const restoreData = { folder: toOpen.toString(), category: this.editorInput?.selectedCategory, step: this.editorInput?.selectedStep };
          this.storageService.store(
            restoreWalkthroughsConfigurationKey,
            JSON.stringify(restoreData),
            StorageScope.PROFILE,
            StorageTarget.MACHINE
          );
          this.hostService.openWindow([{ folderUri: toOpen }]);
        }
      });
    } else {
      this.openerService.open(command, { allowCommands: true });
    }
    if (!isCommand && (href.startsWith("https://") || href.startsWith("http://"))) {
      this.gettingStartedService.progressByEvent("onLink:" + href);
    }
  }
  buildMarkdownDescription(container, text) {
    while (container.firstChild) {
      container.firstChild.remove();
    }
    for (const linkedText of text) {
      if (linkedText.nodes.length === 1 && typeof linkedText.nodes[0] !== "string") {
        const node = linkedText.nodes[0];
        const buttonContainer = append(container, $(".button-container"));
        const button = new Button(buttonContainer, { title: node.title, supportIcons: true, ...defaultButtonStyles });
        const isCommand = node.href.startsWith("command:");
        const command = node.href.replace(/command:(toSide:)?/, "command:");
        button.label = node.label;
        button.onDidClick((e) => {
          e.stopPropagation();
          e.preventDefault();
          this.runStepCommand(node.href);
        }, null, this.detailsPageDisposables);
        if (isCommand) {
          const keybinding = this.getKeyBinding(command);
          if (keybinding) {
            const shortcutMessage = $("span.shortcut-message", {}, localize("gettingStarted.keyboardTip", "Tip: Use keyboard shortcut "));
            container.appendChild(shortcutMessage);
            const label = new KeybindingLabel(shortcutMessage, OS, { ...defaultKeybindingLabelStyles });
            label.set(keybinding);
            this.detailsPageDisposables.add(label);
          }
        }
        this.detailsPageDisposables.add(button);
      } else {
        const p = append(container, $("p"));
        for (const node of linkedText.nodes) {
          if (typeof node === "string") {
            const labelWithIcon = renderLabelWithIcons(node);
            for (const element of labelWithIcon) {
              if (typeof element === "string") {
                p.appendChild(renderFormattedText(element, { renderCodeSegments: true }, $("span")));
              } else {
                p.appendChild(element);
              }
            }
          } else {
            const nodeWithTitle = matchesScheme(node.href, Schemas.http) || matchesScheme(node.href, Schemas.https) ? { ...node, title: node.href } : node;
            const link = this.instantiationService.createInstance(Link, p, nodeWithTitle, { opener: (href) => this.runStepCommand(href) });
            this.detailsPageDisposables.add(link);
          }
        }
      }
    }
    return container;
  }
  clearInput() {
    this.stepDisposables.clear();
    super.clearInput();
  }
  buildCategorySlide(categoryID, selectedStep, preserveFocus) {
    if (!this.editorInput) {
      return;
    }
    this.extensionService.whenInstalledExtensionsRegistered().then(() => {
      this.extensionService.activateByEvent(`onWalkthrough:${categoryID.replace(/[^#]+#/, "")}`);
    });
    this.detailsPageDisposables.clear();
    this.mediaDisposables.clear();
    const category = this.gettingStartedCategories.find((category2) => category2.id === categoryID);
    if (!category) {
      throw Error("could not find category with ID " + categoryID);
    }
    const descriptionContainer = $(".category-description.description.max-lines-3", { "x-category-description-for": category.id });
    this.buildMarkdownDescription(descriptionContainer, parseDescription(category.description));
    const categoryDescriptorComponent = $(
      ".getting-started-category",
      {},
      $(
        ".category-description-container",
        {},
        $("h2.category-title.max-lines-3", { "x-category-title-for": category.id }, ...renderLabelWithIcons(category.title)),
        descriptionContainer
      )
    );
    const stepListContainer = $(".step-list-container");
    this.detailsPageDisposables.add(addDisposableListener(stepListContainer, "keydown", (e) => {
      const event = new StandardKeyboardEvent(e);
      const currentStepIndex = () => category.steps.findIndex((e2) => e2.id === this.editorInput?.selectedStep);
      if (event.keyCode === KeyCode.UpArrow) {
        const toExpand2 = category.steps.filter((step, index) => index < currentStepIndex() && this.contextService.contextMatchesRules(step.when));
        if (toExpand2.length) {
          this.selectStep(toExpand2[toExpand2.length - 1].id, false);
        }
      }
      if (event.keyCode === KeyCode.DownArrow) {
        const toExpand2 = category.steps.find((step, index) => index > currentStepIndex() && this.contextService.contextMatchesRules(step.when));
        if (toExpand2) {
          this.selectStep(toExpand2.id, false);
        }
      }
    }));
    let renderedSteps = void 0;
    const contextKeysToWatch = new Set(category.steps.flatMap((step) => step.when.keys()));
    const buildStepList = () => {
      category.steps.sort((a, b) => a.order - b.order);
      const toRender = category.steps.filter((step) => this.contextService.contextMatchesRules(step.when));
      if (equals(renderedSteps, toRender, (a, b) => a.id === b.id)) {
        return;
      }
      renderedSteps = toRender;
      reset(stepListContainer, ...renderedSteps.map((step) => {
        const codicon = $(
          ".codicon" + (step.done ? ".complete" + ThemeIcon.asCSSSelector(gettingStartedCheckedCodicon) : ThemeIcon.asCSSSelector(gettingStartedUncheckedCodicon)),
          {
            "data-done-step-id": step.id,
            "x-dispatch": "toggleStepCompletion:" + step.id,
            "role": "checkbox",
            "aria-checked": step.done ? "true" : "false",
            "aria-label": step.done ? localize("stepDone", "{0}: Completed", step.title) : localize("stepNotDone", "{0}: Not completed", step.title)
          }
        );
        const container = $(".step-description-container", { "x-step-description-for": step.id });
        this.buildMarkdownDescription(container, step.description);
        const stepTitle = $("h3.step-title.max-lines-3", { "x-step-title-for": step.id });
        reset(stepTitle, ...renderLabelWithIcons(step.title));
        const stepDescription = $(
          ".step-container",
          {},
          stepTitle,
          container
        );
        if (step.media.type === "image") {
          stepDescription.appendChild(
            $(".image-description", { "aria-label": localize("imageShowing", "Image showing {0}", step.media.altText) })
          );
        } else if (step.media.type === "video") {
          stepDescription.appendChild(
            $(".video-description", { "aria-label": localize("videoShowing", "Video showing {0}", step.media.altText) })
          );
        }
        return $(
          "button.getting-started-step",
          {
            "x-dispatch": "selectTask:" + step.id,
            "data-step-id": step.id,
            "aria-expanded": "false",
            "aria-checked": step.done ? "true" : "false",
            "role": "button"
          },
          codicon,
          stepDescription
        );
      }));
    };
    buildStepList();
    this.detailsPageDisposables.add(this.contextService.onDidChangeContext((e) => {
      if (e.affectsSome(contextKeysToWatch) && this.currentWalkthrough && this.editorInput) {
        buildStepList();
        this.registerDispatchListeners();
        this.selectStep(this.editorInput.selectedStep, false);
      }
    }));
    const showNextCategory = this.gettingStartedCategories.find((_category) => _category.id === category.next);
    const stepsContainer = $(
      ".getting-started-detail-container",
      { "role": "list" },
      stepListContainer,
      $(
        ".done-next-container",
        {},
        $("button.button-link.all-done", { "x-dispatch": "allDone" }, $("span.codicon.codicon-check-all"), localize("allDone", "Mark Done")),
        ...showNextCategory ? [$("button.button-link.next", { "x-dispatch": "nextSection" }, localize("nextOne", "Next Section"), $("span.codicon.codicon-arrow-right"))] : []
      )
    );
    this.detailsScrollbar.value = new DomScrollableElement(stepsContainer, { className: "steps-container" });
    const stepListComponent = this.detailsScrollbar.value.getDomNode();
    const categoryFooter = $(".getting-started-footer");
    if (this.editorInput.showTelemetryNotice && getTelemetryLevel(this.configurationService) !== TelemetryLevel.NONE && this.productService.enableTelemetry) {
      this.buildTelemetryFooter(categoryFooter);
    }
    reset(this.stepsContent, categoryDescriptorComponent, stepListComponent, this.stepMediaComponent, categoryFooter);
    const toExpand = category.steps.find((step) => this.contextService.contextMatchesRules(step.when) && !step.done) ?? category.steps[0];
    this.selectStep(selectedStep ?? toExpand.id, !selectedStep, preserveFocus);
    this.detailsScrollbar.value?.scanDomNode();
    this.detailsPageScrollbar?.scanDomNode();
    this.registerDispatchListeners();
  }
  buildTelemetryFooter(parent) {
    const privacyStatementCopy = localize("privacy statement", "privacy statement");
    const privacyStatementButton = `[${privacyStatementCopy}](command:workbench.action.openPrivacyStatementUrl)`;
    const optOutCopy = localize("optOut", "opt out");
    const optOutButton = `[${optOutCopy}](command:settings.filterByTelemetry)`;
    const text = localize(
      { key: "footer", comment: ['fist substitution is "vs code", second is "privacy statement", third is "opt out".'] },
      "{0} collects usage data. Read our {1} and learn how to {2}.",
      this.productService.nameShort,
      privacyStatementButton,
      optOutButton
    );
    const renderedContents = this.detailsPageDisposables.add(this.markdownRendererService.render({ value: text, isTrusted: true }));
    parent.append(renderedContents.element);
  }
  getKeybindingLabel(command) {
    command = command.replace(/^command:/, "");
    const label = this.keybindingService.lookupKeybinding(command)?.getLabel();
    if (!label) {
      return "";
    } else {
      return `(${label})`;
    }
  }
  getKeyBinding(command) {
    command = command.replace(/^command:/, "");
    return this.keybindingService.lookupKeybinding(command);
  }
  async scrollPrev() {
    this.inProgressScroll = this.inProgressScroll.then(async () => {
      if (this.prevWalkthrough && this.prevWalkthrough !== this.currentWalkthrough) {
        this.currentWalkthrough = this.prevWalkthrough;
        this.prevWalkthrough = void 0;
        this.makeCategoryVisibleWhenAvailable(this.currentWalkthrough.id);
      } else if (this.editorInput?.returnToCommand) {
        this.commandService.executeCommand(this.editorInput.returnToCommand);
      } else {
        this.currentWalkthrough = void 0;
        if (this.editorInput) {
          this.editorInput.selectedCategory = void 0;
          this.editorInput.selectedStep = void 0;
          this.editorInput.showTelemetryNotice = false;
          this.editorInput.walkthroughPageTitle = void 0;
        }
        if (this.gettingStartedCategories.length !== this.gettingStartedList.value?.itemCount) {
          this.buildCategoriesSlide();
        }
        this.selectStep(void 0);
        this.setSlide("categories");
        this.container.focus();
      }
    });
  }
  runSkip() {
    this.commandService.executeCommand("workbench.action.closeActiveEditor");
  }
  escape() {
    if (this.editorInput?.selectedCategory) {
      this.scrollPrev();
    } else {
      this.runSkip();
    }
  }
  setSlide(toEnable, firstLaunch = false) {
    const slideManager = assertReturnsDefined(this.container.querySelector(".gettingStarted"));
    if (toEnable === "categories") {
      slideManager.classList.remove("showDetails");
      slideManager.classList.add("showCategories");
      this.container.querySelector(".prev-button.button-link").style.display = "none";
      this.container.querySelector(".gettingStartedSlideDetails").querySelectorAll("button").forEach((button) => button.disabled = true);
      this.container.querySelector(".gettingStartedSlideCategories").querySelectorAll("button").forEach((button) => button.disabled = false);
      this.container.querySelector(".gettingStartedSlideCategories").querySelectorAll("input").forEach((button) => button.disabled = false);
    } else {
      slideManager.classList.add("showDetails");
      slideManager.classList.remove("showCategories");
      const prevButton = this.container.querySelector(".prev-button.button-link");
      prevButton.style.display = this.editorInput?.showWelcome || this.editorInput?.returnToCommand || this.prevWalkthrough ? "block" : "none";
      const moreTextElement = prevButton.querySelector(".moreText");
      moreTextElement.textContent = firstLaunch ? localize("welcome", "Welcome") : localize("goBack", "Go Back");
      this.container.querySelector(".gettingStartedSlideDetails").querySelectorAll("button").forEach((button) => button.disabled = false);
      this.container.querySelector(".gettingStartedSlideCategories").querySelectorAll("button").forEach((button) => button.disabled = true);
      this.container.querySelector(".gettingStartedSlideCategories").querySelectorAll("input").forEach((button) => button.disabled = true);
    }
  }
  focus() {
    super.focus();
    const active = this.container.ownerDocument.activeElement;
    let parent = this.container.parentElement;
    while (parent && parent !== active) {
      parent = parent.parentElement;
    }
    if (parent) {
      this.container.focus();
    }
  }
};
GettingStartedPage.ID = "gettingStartedPage";
GettingStartedPage = __decorateClass([
  __decorateParam(1, ICommandService),
  __decorateParam(2, IProductService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IWalkthroughsService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, ILanguageService),
  __decorateParam(8, IFileService),
  __decorateParam(9, IOpenerService),
  __decorateParam(10, IWorkbenchThemeService),
  __decorateParam(11, IStorageService),
  __decorateParam(12, IExtensionService),
  __decorateParam(13, IInstantiationService),
  __decorateParam(14, INotificationService),
  __decorateParam(15, IEditorGroupsService),
  __decorateParam(16, IContextKeyService),
  __decorateParam(17, IQuickInputService),
  __decorateParam(18, IWorkspacesService),
  __decorateParam(19, ILabelService),
  __decorateParam(20, IHostService),
  __decorateParam(21, IWebviewService),
  __decorateParam(22, IWorkspaceContextService),
  __decorateParam(23, IAccessibilityService),
  __decorateParam(24, IMarkdownRendererService),
  __decorateParam(25, IChatEntitlementService)
], GettingStartedPage);
class GettingStartedInputSerializer {
  canSerialize(editorInput) {
    return true;
  }
  serialize(editorInput) {
    return JSON.stringify({ selectedCategory: editorInput.selectedCategory, selectedStep: editorInput.selectedStep });
  }
  deserialize(instantiationService, serializedEditorInput) {
    return instantiationService.invokeFunction((accessor) => {
      try {
        const { selectedCategory, selectedStep } = JSON.parse(serializedEditorInput);
        return new GettingStartedInput({ selectedCategory, selectedStep });
      } catch {
      }
      return new GettingStartedInput({});
    });
  }
}
export {
  GettingStartedInputSerializer,
  GettingStartedPage,
  allWalkthroughsHiddenContext,
  inWelcomeContext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHdlbGNvbWVHZXR0aW5nU3RhcnRlZFxcYnJvd3NlclxcZ2V0dGluZ1N0YXJ0ZWQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyAkLCBEaW1lbnNpb24sIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgYXBwZW5kLCBjbGVhck5vZGUsIHJlc2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyByZW5kZXJGb3JtYXR0ZWRUZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Zvcm1hdHRlZFRleHRSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBzdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IHJlbmRlckxhYmVsV2l0aEljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IERvbVNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBUb2dnbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSwgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IERlbGF5ZXIsIFRocm90dGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgc3BsaXRSZWNlbnRMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUxpbmssIExpbmtlZFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saW5rZWRUZXh0LmpzJztcbmltcG9ydCB7IHBhcnNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgU2NoZW1hcywgbWF0Y2hlc1NjaGVtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgT1MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvZ2V0dGluZ1N0YXJ0ZWQuY3NzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgQ29udGV4dEtleUV4cHJlc3Npb24sIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlLCBWZXJib3NpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBMaW5rIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2Jyb3dzZXIvbGluay5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQsIFdpbGxTYXZlU3RhdGVSZWFzb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IGZpcnN0U2Vzc2lvbkRhdGVTdG9yYWdlS2V5LCBJVGVsZW1ldHJ5U2VydmljZSwgVGVsZW1ldHJ5TGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBnZXRUZWxlbWV0cnlMZXZlbCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcywgZGVmYXVsdEtleWJpbmRpbmdMYWJlbFN0eWxlcywgZGVmYXVsdFRvZ2dsZVN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJV2luZG93T3BlbmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIFVOS05PV05fRU1QVFlfV0lORE9XX1dPUktTUEFDRSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElSZWNlbnRGb2xkZXIsIElSZWNlbnRXb3Jrc3BhY2UsIElSZWNlbnRseU9wZW5lZCwgSVdvcmtzcGFjZXNTZXJ2aWNlLCBpc1JlY2VudEZvbGRlciwgaXNSZWNlbnRXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VzLmpzJztcbmltcG9ydCB7IE9wZW5SZWNlbnRBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FjdGlvbnMvd2luZG93QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBPcGVuRmlsZUZvbGRlckFjdGlvbiwgT3BlbkZvbGRlckFjdGlvbiwgT3BlbkZvbGRlclZpYVdvcmtzcGFjZUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy93b3Jrc3BhY2VBY3Rpb25zLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYW5lLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaFN0YXRlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3BlbkNvbnRleHQsIElFZGl0b3JTZXJpYWxpemVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJV2Vidmlld0VsZW1lbnQsIElXZWJ2aWV3U2VydmljZSB9IGZyb20gJy4uLy4uL3dlYnZpZXcvYnJvd3Nlci93ZWJ2aWV3LmpzJztcbmltcG9ydCAnLi9nZXR0aW5nU3RhcnRlZENvbG9ycy5qcyc7XG5pbXBvcnQgeyBHZXR0aW5nU3RhcnRlZERldGFpbHNSZW5kZXJlciB9IGZyb20gJy4vZ2V0dGluZ1N0YXJ0ZWREZXRhaWxzUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgZ2V0dGluZ1N0YXJ0ZWRDaGVja2VkQ29kaWNvbiwgZ2V0dGluZ1N0YXJ0ZWRVbmNoZWNrZWRDb2RpY29uIH0gZnJvbSAnLi9nZXR0aW5nU3RhcnRlZEljb25zLmpzJztcbmltcG9ydCB7IEdldHRpbmdTdGFydGVkRWRpdG9yT3B0aW9ucywgR2V0dGluZ1N0YXJ0ZWRJbnB1dCB9IGZyb20gJy4vZ2V0dGluZ1N0YXJ0ZWRJbnB1dC5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZWRXYWxrdGhyb3VnaCwgSVJlc29sdmVkV2Fsa3Rocm91Z2hTdGVwLCBJV2Fsa3Rocm91Z2hzU2VydmljZSwgaGlkZGVuRW50cmllc0NvbmZpZ3VyYXRpb25LZXksIHBhcnNlRGVzY3JpcHRpb24gfSBmcm9tICcuL2dldHRpbmdTdGFydGVkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZXN0b3JlV2Fsa3Rocm91Z2hzQ29uZmlndXJhdGlvblZhbHVlLCByZXN0b3JlV2Fsa3Rocm91Z2hzQ29uZmlndXJhdGlvbktleSB9IGZyb20gJy4vc3RhcnR1cFBhZ2UuanMnO1xuaW1wb3J0IHsgc3RhcnRFbnRyaWVzIH0gZnJvbSAnLi4vY29tbW9uL2dldHRpbmdTdGFydGVkQ29udGVudC5qcyc7XG5pbXBvcnQgeyBHcm91cHNPcmRlciwgSUVkaXRvckdyb3VwLCBJRWRpdG9yR3JvdXBzU2VydmljZSwgcHJlZmVycmVkU2lkZUJ5U2lkZUdyb3VwRGlyZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGhlbWVzL2NvbW1vbi93b3JrYmVuY2hUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR2V0dGluZ1N0YXJ0ZWRJbmRleExpc3QgfSBmcm9tICcuL2dldHRpbmdTdGFydGVkTGlzdC5qcyc7XG5pbXBvcnQgeyBjYW5TaG93QWdlbnRzQmFubmVyLCBjcmVhdGVBZ2VudHNCYW5uZXIgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zQmFubmVyLmpzJztcbmltcG9ydCB7IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEFjY2Vzc2libGVWaWV3QWN0aW9uIH0gZnJvbSAnLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkva2V5YmluZGluZ0xhYmVsL2tleWJpbmRpbmdMYWJlbC5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5cbmNvbnN0IFNMSURFX1RSQU5TSVRJT05fVElNRV9NUyA9IDI1MDtcbmNvbnN0IGNvbmZpZ3VyYXRpb25LZXkgPSAnd29ya2JlbmNoLnN0YXJ0dXBFZGl0b3InO1xuXG5leHBvcnQgY29uc3QgYWxsV2Fsa3Rocm91Z2hzSGlkZGVuQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdhbGxXYWxrdGhyb3VnaHNIaWRkZW4nLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgaW5XZWxjb21lQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdpbldlbGNvbWUnLCBmYWxzZSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdlbGNvbWVQYWdlU3RhcnRFbnRyeSB7XG5cdGlkOiBzdHJpbmc7XG5cdHRpdGxlOiBzdHJpbmc7XG5cdGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdGNvbW1hbmQ6IHN0cmluZztcblx0b3JkZXI6IG51bWJlcjtcblx0aWNvbjogeyB0eXBlOiAnaWNvbic7IGljb246IFRoZW1lSWNvbiB9O1xuXHR3aGVuOiBDb250ZXh0S2V5RXhwcmVzc2lvbjtcbn1cblxuY29uc3QgcGFyc2VkU3RhcnRFbnRyaWVzOiBJV2VsY29tZVBhZ2VTdGFydEVudHJ5W10gPSBzdGFydEVudHJpZXMubWFwKChlLCBpKSA9PiAoe1xuXHRjb21tYW5kOiBlLmNvbnRlbnQuY29tbWFuZCxcblx0ZGVzY3JpcHRpb246IGUuZGVzY3JpcHRpb24sXG5cdGljb246IHsgdHlwZTogJ2ljb24nLCBpY29uOiBlLmljb24gfSxcblx0aWQ6IGUuaWQsXG5cdG9yZGVyOiBpLFxuXHR0aXRsZTogZS50aXRsZSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoZS53aGVuKSA/PyBDb250ZXh0S2V5RXhwci50cnVlKClcbn0pKTtcblxudHlwZSBHZXR0aW5nU3RhcnRlZEFjdGlvbkNsYXNzaWZpY2F0aW9uID0ge1xuXHRjb21tYW5kOiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBjb21tYW5kIGJlaW5nIGV4ZWN1dGVkIG9uIHRoZSBnZXR0aW5nIHN0YXJ0ZWQgcGFnZS4nIH07XG5cdHdhbGt0aHJvdWdoSWQ6IHsgY2xhc3NpZmljYXRpb246ICdQdWJsaWNOb25QZXJzb25hbERhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHdhbGt0aHJvdWdoIHdoaWNoIHRoZSBjb21tYW5kIGlzIGluJyB9O1xuXHRhcmd1bWVudDogeyBjbGFzc2lmaWNhdGlvbjogJ1B1YmxpY05vblBlcnNvbmFsRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgYXJndW1lbnRzIGJlaW5nIHBhc3NlZCB0byB0aGUgY29tbWFuZCcgfTtcblx0b3duZXI6ICdscmFtb3MxNSc7XG5cdGNvbW1lbnQ6ICdIZWxwIHVuZGVyc3RhbmQgd2hhdCBhY3Rpb25zIGFyZSBtb3N0IGNvbW1vbmx5IHRha2VuIG9uIHRoZSBnZXR0aW5nIHN0YXJ0ZWQgcGFnZSc7XG59O1xuXG50eXBlIEdldHRpbmdTdGFydGVkQWN0aW9uRXZlbnQgPSB7XG5cdGNvbW1hbmQ6IHN0cmluZztcblx0d2Fsa3Rocm91Z2hJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRhcmd1bWVudDogc3RyaW5nIHwgdW5kZWZpbmVkO1xufTtcblxudHlwZSBSZWNlbnRFbnRyeSA9IChJUmVjZW50Rm9sZGVyIHwgSVJlY2VudFdvcmtzcGFjZSkgJiB7IGlkOiBzdHJpbmcgfTtcblxuY29uc3QgUkVEVUNFRF9NT1RJT05fS0VZID0gJ3dvcmtiZW5jaC53ZWxjb21lUGFnZS5wcmVmZXJSZWR1Y2VkTW90aW9uJztcbmV4cG9ydCBjbGFzcyBHZXR0aW5nU3RhcnRlZFBhZ2UgZXh0ZW5kcyBFZGl0b3JQYW5lIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2dldHRpbmdTdGFydGVkUGFnZSc7XG5cblx0cHJpdmF0ZSBpblByb2dyZXNzU2Nyb2xsID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwYXRjaExpc3RlbmVyczogRGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHN0ZXBEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRldGFpbHNQYWdlRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBtZWRpYURpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Ly8gRW5zdXJlIHRoYXQgdGhlIHRoZXNlIGFyZSBpbml0aWFsaXplZCBiZWZvcmUgdXNlLlxuXHQvLyBDdXJyZW50bHkgaW5pdGlhbGl6ZWQgYmVmb3JlIHVzZSBpbiBidWlsZENhdGVnb3JpZXNTbGlkZSBhbmQgc2Nyb2xsVG9DYXRlZ29yeVxuXHRwcml2YXRlIHJlY2VudGx5T3BlbmVkITogUHJvbWlzZTxJUmVjZW50bHlPcGVuZWQ+O1xuXHRwcml2YXRlIGdldHRpbmdTdGFydGVkQ2F0ZWdvcmllcyE6IElSZXNvbHZlZFdhbGt0aHJvdWdoW107XG5cblx0cHJpdmF0ZSBjdXJyZW50V2Fsa3Rocm91Z2g6IElSZXNvbHZlZFdhbGt0aHJvdWdoIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHByZXZXYWxrdGhyb3VnaDogSVJlc29sdmVkV2Fsa3Rocm91Z2ggfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBjYXRlZ29yaWVzUGFnZVNjcm9sbGJhcjogRG9tU2Nyb2xsYWJsZUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZGV0YWlsc1BhZ2VTY3JvbGxiYXI6IERvbVNjcm9sbGFibGVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGV0YWlsc1Njcm9sbGJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEb21TY3JvbGxhYmxlRWxlbWVudD4oKSk7XG5cblx0cHJpdmF0ZSBidWlsZFNsaWRlVGhyb3R0bGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhyb3R0bGVyKCkpO1xuXG5cdHByaXZhdGUgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIGNvbnRleHRTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSByZWNlbnRseU9wZW5lZExpc3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8R2V0dGluZ1N0YXJ0ZWRJbmRleExpc3Q8UmVjZW50RW50cnk+PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBzdGFydExpc3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8R2V0dGluZ1N0YXJ0ZWRJbmRleExpc3Q8SVdlbGNvbWVQYWdlU3RhcnRFbnRyeT4+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGdldHRpbmdTdGFydGVkTGlzdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxHZXR0aW5nU3RhcnRlZEluZGV4TGlzdDxJUmVzb2x2ZWRXYWxrdGhyb3VnaD4+KCkpO1xuXG5cdHByaXZhdGUgc3RlcHNTbGlkZSE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGNhdGVnb3JpZXNTbGlkZSE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHN0ZXBzQ29udGVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHN0ZXBNZWRpYUNvbXBvbmVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHdlYnZpZXchOiBJV2Vidmlld0VsZW1lbnQ7XG5cblx0cHJpdmF0ZSBsYXlvdXRNYXJrZG93bjogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgZGV0YWlsc1JlbmRlcmVyOiBHZXR0aW5nU3RhcnRlZERldGFpbHNSZW5kZXJlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNhdGVnb3JpZXNTbGlkZURpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHByaXZhdGUgc2hvd0ZlYXR1cmVkV2Fsa3Rocm91Z2ggPSB0cnVlO1xuXG5cdGdldCBlZGl0b3JJbnB1dCgpOiBHZXR0aW5nU3RhcnRlZElucHV0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5faW5wdXQgYXMgR2V0dGluZ1N0YXJ0ZWRJbnB1dCB8IHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElXYWxrdGhyb3VnaHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlOiBJV2Fsa3Rocm91Z2hzU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hUaGVtZVNlcnZpY2UgcHJvdGVjdGVkIG92ZXJyaWRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVdvcmtiZW5jaFRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBncm91cHNTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZXNTZXJ2aWNlOiBJV29ya3NwYWNlc1NlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElXZWJ2aWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdlYnZpZXdTZXJ2aWNlOiBJV2Vidmlld1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdCkge1xuXG5cdFx0c3VwZXIoR2V0dGluZ1N0YXJ0ZWRQYWdlLklELCBncm91cCwgdGVsZW1ldHJ5U2VydmljZSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cblx0XHR0aGlzLmNvbnRhaW5lciA9ICQoJy5nZXR0aW5nU3RhcnRlZENvbnRhaW5lcicsXG5cdFx0XHR7XG5cdFx0XHRcdHJvbGU6ICdkb2N1bWVudCcsXG5cdFx0XHRcdHRhYmluZGV4OiAwLFxuXHRcdFx0XHQnYXJpYS1sYWJlbCc6IGxvY2FsaXplKCd3ZWxjb21lQXJpYUxhYmVsJywgXCJPdmVydmlldyBvZiBob3cgdG8gZ2V0IHVwIHRvIHNwZWVkIHdpdGggeW91ciBlZGl0b3IuXCIpXG5cdFx0XHR9KTtcblx0XHR0aGlzLnN0ZXBNZWRpYUNvbXBvbmVudCA9ICQoJy5nZXR0aW5nLXN0YXJ0ZWQtbWVkaWEnKTtcblx0XHR0aGlzLnN0ZXBNZWRpYUNvbXBvbmVudC5pZCA9IGdlbmVyYXRlVXVpZCgpO1xuXG5cdFx0dGhpcy5jYXRlZ29yaWVzU2xpZGVEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHR0aGlzLmRldGFpbHNSZW5kZXJlciA9IG5ldyBHZXR0aW5nU3RhcnRlZERldGFpbHNSZW5kZXJlcih0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UsIHRoaXMuZXh0ZW5zaW9uU2VydmljZSwgdGhpcy5sYW5ndWFnZVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5jb250ZXh0U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKGNvbnRleHRTZXJ2aWNlLmNyZWF0ZVNjb3BlZCh0aGlzLmNvbnRhaW5lcikpO1xuXHRcdGluV2VsY29tZUNvbnRleHQuYmluZFRvKHRoaXMuY29udGV4dFNlcnZpY2UpLnNldCh0cnVlKTtcblxuXHRcdHRoaXMuZ2V0dGluZ1N0YXJ0ZWRDYXRlZ29yaWVzID0gdGhpcy5nZXR0aW5nU3RhcnRlZFNlcnZpY2UuZ2V0V2Fsa3Rocm91Z2hzKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRpc3BhdGNoTGlzdGVuZXJzKTtcblxuXHRcdGNvbnN0IHJlcmVuZGVyID0gKCkgPT4ge1xuXHRcdFx0dGhpcy5nZXR0aW5nU3RhcnRlZENhdGVnb3JpZXMgPSB0aGlzLmdldHRpbmdTdGFydGVkU2VydmljZS5nZXRXYWxrdGhyb3VnaHMoKTtcblx0XHRcdGlmICh0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaCkge1xuXHRcdFx0XHRjb25zdCBleGlzdGluZ1N0ZXBzID0gdGhpcy5jdXJyZW50V2Fsa3Rocm91Z2guc3RlcHMubWFwKHN0ZXAgPT4gc3RlcC5pZCk7XG5cdFx0XHRcdGNvbnN0IG5ld0NhdGVnb3J5ID0gdGhpcy5nZXR0aW5nU3RhcnRlZENhdGVnb3JpZXMuZmluZChjYXRlZ29yeSA9PiB0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaD8uaWQgPT09IGNhdGVnb3J5LmlkKTtcblx0XHRcdFx0aWYgKG5ld0NhdGVnb3J5KSB7XG5cdFx0XHRcdFx0Y29uc3QgbmV3U3RlcHMgPSBuZXdDYXRlZ29yeS5zdGVwcy5tYXAoc3RlcCA9PiBzdGVwLmlkKTtcblx0XHRcdFx0XHRpZiAoIWVxdWFscyhuZXdTdGVwcywgZXhpc3RpbmdTdGVwcykpIHtcblx0XHRcdFx0XHRcdHRoaXMuYnVpbGRTbGlkZVRocm90dGxlLnF1ZXVlKCgpID0+IHRoaXMuYnVpbGRDYXRlZ29yaWVzU2xpZGUoKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmJ1aWxkU2xpZGVUaHJvdHRsZS5xdWV1ZSgoKSA9PiB0aGlzLmJ1aWxkQ2F0ZWdvcmllc1NsaWRlKCkpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmdldHRpbmdTdGFydGVkU2VydmljZS5vbkRpZEFkZFdhbGt0aHJvdWdoKHJlcmVuZGVyKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5nZXR0aW5nU3RhcnRlZFNlcnZpY2Uub25EaWRSZW1vdmVXYWxrdGhyb3VnaChyZXJlbmRlcikpO1xuXG5cdFx0dGhpcy5yZWNlbnRseU9wZW5lZCA9IHRoaXMud29ya3NwYWNlc1NlcnZpY2UuZ2V0UmVjZW50bHlPcGVuZWQoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih3b3Jrc3BhY2VzU2VydmljZS5vbkRpZENoYW5nZVJlY2VudGx5T3BlbmVkKCgpID0+IHtcblx0XHRcdHRoaXMucmVjZW50bHlPcGVuZWQgPSB3b3Jrc3BhY2VzU2VydmljZS5nZXRSZWNlbnRseU9wZW5lZCgpO1xuXHRcdFx0dGhpcy5yZWZyZXNoUmVjZW50bHlPcGVuZWQoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmdldHRpbmdTdGFydGVkU2VydmljZS5vbkRpZENoYW5nZVdhbGt0aHJvdWdoKGNhdGVnb3J5ID0+IHtcblx0XHRcdGNvbnN0IG91ckNhdGVnb3J5ID0gdGhpcy5nZXR0aW5nU3RhcnRlZENhdGVnb3JpZXMuZmluZChjID0+IGMuaWQgPT09IGNhdGVnb3J5LmlkKTtcblx0XHRcdGlmICghb3VyQ2F0ZWdvcnkpIHsgcmV0dXJuOyB9XG5cblx0XHRcdG91ckNhdGVnb3J5LnRpdGxlID0gY2F0ZWdvcnkudGl0bGU7XG5cdFx0XHRvdXJDYXRlZ29yeS5kZXNjcmlwdGlvbiA9IGNhdGVnb3J5LmRlc2NyaXB0aW9uO1xuXG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTERpdkVsZW1lbnQ+KGBbeC1jYXRlZ29yeS10aXRsZS1mb3I9XCIke2NhdGVnb3J5LmlkfVwiXWApLmZvckVhY2goc3RlcCA9PiAoc3RlcCBhcyBIVE1MRGl2RWxlbWVudCkuaW5uZXJUZXh0ID0gb3VyQ2F0ZWdvcnkudGl0bGUpO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsPEhUTUxEaXZFbGVtZW50PihgW3gtY2F0ZWdvcnktZGVzY3JpcHRpb24tZm9yPVwiJHtjYXRlZ29yeS5pZH1cIl1gKS5mb3JFYWNoKHN0ZXAgPT4gKHN0ZXAgYXMgSFRNTERpdkVsZW1lbnQpLmlubmVyVGV4dCA9IG91ckNhdGVnb3J5LmRlc2NyaXB0aW9uKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFJFRFVDRURfTU9USU9OX0tFWSkpIHtcblx0XHRcdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnYW5pbWF0YWJsZScsIHRoaXMuc2hvdWxkQW5pbWF0ZSgpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmdldHRpbmdTdGFydGVkU2VydmljZS5vbkRpZFByb2dyZXNzU3RlcChzdGVwID0+IHtcblx0XHRcdGNvbnN0IGNhdGVnb3J5ID0gdGhpcy5nZXR0aW5nU3RhcnRlZENhdGVnb3JpZXMuZmluZChjID0+IGMuaWQgPT09IHN0ZXAuY2F0ZWdvcnkpO1xuXHRcdFx0aWYgKCFjYXRlZ29yeSkgeyB0aHJvdyBFcnJvcignQ291bGQgbm90IGZpbmQgY2F0ZWdvcnkgd2l0aCBJRDogJyArIHN0ZXAuY2F0ZWdvcnkpOyB9XG5cdFx0XHRjb25zdCBvdXJTdGVwID0gY2F0ZWdvcnkuc3RlcHMuZmluZChfc3RlcCA9PiBfc3RlcC5pZCA9PT0gc3RlcC5pZCk7XG5cdFx0XHRpZiAoIW91clN0ZXApIHtcblx0XHRcdFx0dGhyb3cgRXJyb3IoJ0NvdWxkIG5vdCBmaW5kIHN0ZXAgd2l0aCBJRDogJyArIHN0ZXAuaWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGF0cyA9IHRoaXMuZ2V0V2Fsa3Rocm91Z2hDb21wbGV0aW9uU3RhdHMoY2F0ZWdvcnkpO1xuXHRcdFx0aWYgKCFvdXJTdGVwLmRvbmUgJiYgc3RhdHMuc3RlcHNDb21wbGV0ZSA9PT0gc3RhdHMuc3RlcHNUb3RhbCAtIDEpIHtcblx0XHRcdFx0dGhpcy5oaWRlQ2F0ZWdvcnkoY2F0ZWdvcnkuaWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRvdXJTdGVwLmRvbmUgPSBzdGVwLmRvbmU7XG5cblx0XHRcdGlmIChjYXRlZ29yeS5pZCA9PT0gdGhpcy5jdXJyZW50V2Fsa3Rocm91Z2g/LmlkKSB7XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0XHRjb25zdCBiYWRnZWVsZW1lbnRzID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy53aW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChgW2RhdGEtZG9uZS1zdGVwLWlkPVwiJHtzdGVwLmlkfVwiXWApKTtcblx0XHRcdFx0YmFkZ2VlbGVtZW50cy5mb3JFYWNoKGJhZGdlZWxlbWVudCA9PiB7XG5cdFx0XHRcdFx0aWYgKHN0ZXAuZG9uZSkge1xuXHRcdFx0XHRcdFx0YmFkZ2VlbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJywgJ3RydWUnKTtcblx0XHRcdFx0XHRcdGJhZGdlZWxlbWVudC5wYXJlbnRFbGVtZW50Py5zZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcsICd0cnVlJyk7XG5cdFx0XHRcdFx0XHRiYWRnZWVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShnZXR0aW5nU3RhcnRlZFVuY2hlY2tlZENvZGljb24pKTtcblx0XHRcdFx0XHRcdGJhZGdlZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjb21wbGV0ZScsIC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGdldHRpbmdTdGFydGVkQ2hlY2tlZENvZGljb24pKTtcblx0XHRcdFx0XHRcdGJhZGdlZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnc3RlcERvbmUnLCBcInswfTogQ29tcGxldGVkXCIsIHN0ZXAudGl0bGUpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRiYWRnZWVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnLCAnZmFsc2UnKTtcblx0XHRcdFx0XHRcdGJhZGdlZWxlbWVudC5wYXJlbnRFbGVtZW50Py5zZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcsICdmYWxzZScpO1xuXHRcdFx0XHRcdFx0YmFkZ2VlbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2NvbXBsZXRlJywgLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoZ2V0dGluZ1N0YXJ0ZWRDaGVja2VkQ29kaWNvbikpO1xuXHRcdFx0XHRcdFx0YmFkZ2VlbGVtZW50LmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoZ2V0dGluZ1N0YXJ0ZWRVbmNoZWNrZWRDb2RpY29uKSk7XG5cdFx0XHRcdFx0XHRiYWRnZWVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ3N0ZXBOb3REb25lJywgXCJ7MH06IE5vdCBjb21wbGV0ZWRcIiwgc3RlcC50aXRsZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmIChzdGVwLmRvbmUpIHtcblx0XHRcdFx0XHRzdGF0dXMobG9jYWxpemUoJ3N0ZXBBdXRvQ29tcGxldGVkJywgXCJTdGVwIHswfSBjb21wbGV0ZWRcIiwgc3RlcC50aXRsZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnVwZGF0ZUNhdGVnb3J5UHJvZ3Jlc3MoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uV2lsbFNhdmVTdGF0ZSgoZSkgPT4ge1xuXHRcdFx0aWYgKGUucmVhc29uICE9PSBXaWxsU2F2ZVN0YXRlUmVhc29uLlNIVVRET1dOKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5sZW5ndGggIT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuZWRpdG9ySW5wdXQgfHwgIXRoaXMuY3VycmVudFdhbGt0aHJvdWdoIHx8ICF0aGlzLmVkaXRvcklucHV0LnNlbGVjdGVkQ2F0ZWdvcnkgfHwgIXRoaXMuZWRpdG9ySW5wdXQuc2VsZWN0ZWRTdGVwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZWRpdG9yUGFuZSA9IHRoaXMuZ3JvdXBzU2VydmljZS5hY3RpdmVHcm91cC5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0aWYgKCEoZWRpdG9yUGFuZSBpbnN0YW5jZW9mIEdldHRpbmdTdGFydGVkUGFnZSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTYXZlIHRoZSBzdGF0ZSBvZiB0aGUgd2Fsa3Rocm91Z2ggc28gd2UgY2FuIHJlc3RvcmUgaXQgb24gcmVsb2FkXG5cdFx0XHRjb25zdCByZXN0b3JlRGF0YTogUmVzdG9yZVdhbGt0aHJvdWdoc0NvbmZpZ3VyYXRpb25WYWx1ZSA9IHsgZm9sZGVyOiBVTktOT1dOX0VNUFRZX1dJTkRPV19XT1JLU1BBQ0UuaWQsIGNhdGVnb3J5OiB0aGlzLmVkaXRvcklucHV0LnNlbGVjdGVkQ2F0ZWdvcnksIHN0ZXA6IHRoaXMuZWRpdG9ySW5wdXQuc2VsZWN0ZWRTdGVwIH07XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFxuXHRcdFx0XHRyZXN0b3JlV2Fsa3Rocm91Z2hzQ29uZmlndXJhdGlvbktleSxcblx0XHRcdFx0SlNPTi5zdHJpbmdpZnkocmVzdG9yZURhdGEpLFxuXHRcdFx0XHRTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvLyByZW1vdmUgd2hlbiAnd29ya2JlbmNoLndlbGNvbWVQYWdlLnByZWZlclJlZHVjZWRNb3Rpb24nIGRlcHJlY2F0ZWRcblx0cHJpdmF0ZSBzaG91bGRBbmltYXRlKCkge1xuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFJFRFVDRURfTU9USU9OX0tFWSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNNb3Rpb25SZWR1Y2VkKCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGdldFdhbGt0aHJvdWdoQ29tcGxldGlvblN0YXRzKHdhbGt0aHJvdWdoOiBJUmVzb2x2ZWRXYWxrdGhyb3VnaCk6IHsgc3RlcHNDb21wbGV0ZTogbnVtYmVyOyBzdGVwc1RvdGFsOiBudW1iZXIgfSB7XG5cdFx0Y29uc3QgYWN0aXZlU3RlcHMgPSB3YWxrdGhyb3VnaC5zdGVwcy5maWx0ZXIocyA9PiB0aGlzLmNvbnRleHRTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMocy53aGVuKSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHN0ZXBzQ29tcGxldGU6IGFjdGl2ZVN0ZXBzLmZpbHRlcihzID0+IHMuZG9uZSkubGVuZ3RoLFxuXHRcdFx0c3RlcHNUb3RhbDogYWN0aXZlU3RlcHMubGVuZ3RoLFxuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzZXRJbnB1dChuZXdJbnB1dDogR2V0dGluZ1N0YXJ0ZWRJbnB1dCwgb3B0aW9uczogR2V0dGluZ1N0YXJ0ZWRFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJRWRpdG9yT3BlbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdGF3YWl0IHN1cGVyLnNldElucHV0KG5ld0lucHV0LCBvcHRpb25zLCBjb250ZXh0LCB0b2tlbik7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRDYXRlZ29yeSA9IG9wdGlvbnM/LnNlbGVjdGVkQ2F0ZWdvcnkgPz8gbmV3SW5wdXQuc2VsZWN0ZWRDYXRlZ29yeTtcblx0XHRjb25zdCBzZWxlY3RlZFN0ZXAgPSBvcHRpb25zPy5zZWxlY3RlZFN0ZXAgPz8gbmV3SW5wdXQuc2VsZWN0ZWRTdGVwO1xuXHRcdGF3YWl0IHRoaXMuYXBwbHlJbnB1dCh7IC4uLm9wdGlvbnMsIHNlbGVjdGVkQ2F0ZWdvcnksIHNlbGVjdGVkU3RlcCB9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHNldE9wdGlvbnMob3B0aW9uczogR2V0dGluZ1N0YXJ0ZWRFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0c3VwZXIuc2V0T3B0aW9ucyhvcHRpb25zKTtcblx0XHRpZiAoIXRoaXMuZWRpdG9ySW5wdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoXG5cdFx0XHR0aGlzLmVkaXRvcklucHV0LnNlbGVjdGVkQ2F0ZWdvcnkgIT09IG9wdGlvbnM/LnNlbGVjdGVkQ2F0ZWdvcnkgfHxcblx0XHRcdHRoaXMuZWRpdG9ySW5wdXQuc2VsZWN0ZWRTdGVwICE9PSBvcHRpb25zPy5zZWxlY3RlZFN0ZXBcblx0XHQpIHtcblx0XHRcdGF3YWl0IHRoaXMuYXBwbHlJbnB1dChvcHRpb25zKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFwcGx5SW5wdXQob3B0aW9uczogR2V0dGluZ1N0YXJ0ZWRFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZWRpdG9ySW5wdXQuc2hvd1RlbGVtZXRyeU5vdGljZSA9IG9wdGlvbnM/LnNob3dUZWxlbWV0cnlOb3RpY2UgPz8gdHJ1ZTtcblx0XHR0aGlzLmVkaXRvcklucHV0LnNlbGVjdGVkQ2F0ZWdvcnkgPSBvcHRpb25zPy5zZWxlY3RlZENhdGVnb3J5O1xuXHRcdHRoaXMuZWRpdG9ySW5wdXQuc2VsZWN0ZWRTdGVwID0gb3B0aW9ucz8uc2VsZWN0ZWRTdGVwO1xuXHRcdHRoaXMuZWRpdG9ySW5wdXQucmV0dXJuVG9Db21tYW5kID0gb3B0aW9ucz8ucmV0dXJuVG9Db21tYW5kO1xuXG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnYW5pbWF0YWJsZScpO1xuXHRcdGF3YWl0IHRoaXMuYnVpbGRDYXRlZ29yaWVzU2xpZGUob3B0aW9ucz8ucHJlc2VydmVGb2N1cyk7XG5cdFx0aWYgKHRoaXMuc2hvdWxkQW5pbWF0ZSgpKSB7XG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2FuaW1hdGFibGUnKSwgMCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgbWFrZUNhdGVnb3J5VmlzaWJsZVdoZW5BdmFpbGFibGUoY2F0ZWdvcnlJRDogc3RyaW5nLCBzdGVwSWQ/OiBzdHJpbmcpIHtcblx0XHR0aGlzLnNjcm9sbFRvQ2F0ZWdvcnkoY2F0ZWdvcnlJRCwgc3RlcElkKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJEaXNwYXRjaExpc3RlbmVycygpIHtcblx0XHR0aGlzLmRpc3BhdGNoTGlzdGVuZXJzLmNsZWFyKCk7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHR0aGlzLmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCdbeC1kaXNwYXRjaF0nKS5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcGF0Y2ggPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgneC1kaXNwYXRjaCcpID8/ICcnO1xuXHRcdFx0bGV0IGNvbW1hbmQsIGFyZ3VtZW50O1xuXHRcdFx0aWYgKGRpc3BhdGNoLnN0YXJ0c1dpdGgoJ29wZW5MaW5rOmh0dHBzJykpIHtcblx0XHRcdFx0W2NvbW1hbmQsIGFyZ3VtZW50XSA9IFsnb3BlbkxpbmsnLCBkaXNwYXRjaC5yZXBsYWNlKCdvcGVuTGluazonLCAnJyldO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0W2NvbW1hbmQsIGFyZ3VtZW50XSA9IGRpc3BhdGNoLnNwbGl0KCc6Jyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY29tbWFuZCkge1xuXHRcdFx0XHR0aGlzLmRpc3BhdGNoTGlzdGVuZXJzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudCwgJ2NsaWNrJywgKGUpID0+IHtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdHRoaXMucnVuRGlzcGF0Y2hDb21tYW5kKGNvbW1hbmQsIGFyZ3VtZW50KTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHR0aGlzLmRpc3BhdGNoTGlzdGVuZXJzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudCwgJ2tleXVwJywgKGUpID0+IHtcblx0XHRcdFx0XHRjb25zdCBrZXlib2FyZEV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdHN3aXRjaCAoa2V5Ym9hcmRFdmVudC5rZXlDb2RlKSB7XG5cdFx0XHRcdFx0XHRjYXNlIEtleUNvZGUuRW50ZXI6XG5cdFx0XHRcdFx0XHRjYXNlIEtleUNvZGUuU3BhY2U6XG5cdFx0XHRcdFx0XHRcdHRoaXMucnVuRGlzcGF0Y2hDb21tYW5kKGNvbW1hbmQsIGFyZ3VtZW50KTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBydW5EaXNwYXRjaENvbW1hbmQoY29tbWFuZDogc3RyaW5nLCBhcmd1bWVudDogc3RyaW5nKSB7XG5cdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5rZWVwRWRpdG9yJyk7XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8R2V0dGluZ1N0YXJ0ZWRBY3Rpb25FdmVudCwgR2V0dGluZ1N0YXJ0ZWRBY3Rpb25DbGFzc2lmaWNhdGlvbj4oJ2dldHRpbmdTdGFydGVkLkFjdGlvbkV4ZWN1dGVkJywgeyBjb21tYW5kLCBhcmd1bWVudCwgd2Fsa3Rocm91Z2hJZDogdGhpcy5jdXJyZW50V2Fsa3Rocm91Z2g/LmlkIH0pO1xuXHRcdHN3aXRjaCAoY29tbWFuZCkge1xuXHRcdFx0Y2FzZSAnc2Nyb2xsUHJldic6IHtcblx0XHRcdFx0dGhpcy5zY3JvbGxQcmV2KCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnc2tpcCc6IHtcblx0XHRcdFx0dGhpcy5ydW5Ta2lwKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnc2hvd01vcmVSZWNlbnRzJzoge1xuXHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKE9wZW5SZWNlbnRBY3Rpb24uSUQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3NlZUFsbFdhbGt0aHJvdWdocyc6IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5vcGVuV2Fsa3Rocm91Z2hTZWxlY3RvcigpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ29wZW5Gb2xkZXInOiB7XG5cdFx0XHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoQ29udGV4dEtleUV4cHIuYW5kKFdvcmtiZW5jaFN0YXRlQ29udGV4dC5pc0VxdWFsVG8oJ3dvcmtzcGFjZScpKSkpIHtcblx0XHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKE9wZW5Gb2xkZXJWaWFXb3Jrc3BhY2VBY3Rpb24uSUQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24uZmlsZXMub3BlbkZvbGRlcicpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnc2VsZWN0Q2F0ZWdvcnknOiB7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEdldHRpbmdTdGFydGVkQWN0aW9uRXZlbnQsIEdldHRpbmdTdGFydGVkQWN0aW9uQ2xhc3NpZmljYXRpb24+KCdnZXR0aW5nU3RhcnRlZC5BY3Rpb25FeGVjdXRlZCcsIHsgY29tbWFuZDogJ3NlbGVjdENhdGVnb3J5JywgYXJndW1lbnQsIHdhbGt0aHJvdWdoSWQ6IHRoaXMuY3VycmVudFdhbGt0aHJvdWdoPy5pZCB9KTtcblx0XHRcdFx0dGhpcy5zY3JvbGxUb0NhdGVnb3J5KGFyZ3VtZW50KTtcblx0XHRcdFx0dGhpcy5nZXR0aW5nU3RhcnRlZFNlcnZpY2UubWFya1dhbGt0aHJvdWdoT3BlbmVkKGFyZ3VtZW50KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdzZWxlY3RTdGFydEVudHJ5Jzoge1xuXHRcdFx0XHRjb25zdCBzZWxlY3RlZCA9IHN0YXJ0RW50cmllcy5maW5kKGUgPT4gZS5pZCA9PT0gYXJndW1lbnQpO1xuXHRcdFx0XHRpZiAoc2VsZWN0ZWQpIHtcblx0XHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxHZXR0aW5nU3RhcnRlZEFjdGlvbkV2ZW50LCBHZXR0aW5nU3RhcnRlZEFjdGlvbkNsYXNzaWZpY2F0aW9uPignZ2V0dGluZ1N0YXJ0ZWQuQWN0aW9uRXhlY3V0ZWQnLCB7IGNvbW1hbmQ6ICdzZWxlY3RTdGFydEVudHJ5JywgYXJndW1lbnQsIHdhbGt0aHJvdWdoSWQ6IHRoaXMuY3VycmVudFdhbGt0aHJvdWdoPy5pZCB9KTtcblx0XHRcdFx0XHR0aGlzLnJ1blN0ZXBDb21tYW5kKHNlbGVjdGVkLmNvbnRlbnQuY29tbWFuZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhyb3cgRXJyb3IoJ2NvdWxkIG5vdCBmaW5kIHN0YXJ0IGVudHJ5IHdpdGggaWQ6ICcgKyBhcmd1bWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdoaWRlQ2F0ZWdvcnknOiB7XG5cdFx0XHRcdHRoaXMuaGlkZUNhdGVnb3J5KGFyZ3VtZW50KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHQvLyBVc2Ugc2VsZWN0VGFzayBvdmVyIHNlbGVjdFN0ZXAgdG8ga2VlcCB0ZWxlbWV0cnkgY29uc2lzdGFudDpodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTIyMjU2XG5cdFx0XHRjYXNlICdzZWxlY3RUYXNrJzoge1xuXHRcdFx0XHR0aGlzLnNlbGVjdFN0ZXAoYXJndW1lbnQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3RvZ2dsZVN0ZXBDb21wbGV0aW9uJzoge1xuXHRcdFx0XHR0aGlzLnRvZ2dsZVN0ZXBDb21wbGV0aW9uKGFyZ3VtZW50KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdhbGxEb25lJzoge1xuXHRcdFx0XHR0aGlzLm1hcmtBbGxTdGVwc0NvbXBsZXRlKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnbmV4dFNlY3Rpb24nOiB7XG5cdFx0XHRcdGNvbnN0IG5leHQgPSB0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaD8ubmV4dDtcblx0XHRcdFx0aWYgKG5leHQpIHtcblx0XHRcdFx0XHR0aGlzLnByZXZXYWxrdGhyb3VnaCA9IHRoaXMuY3VycmVudFdhbGt0aHJvdWdoO1xuXHRcdFx0XHRcdHRoaXMuc2Nyb2xsVG9DYXRlZ29yeShuZXh0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zb2xlLmVycm9yKCdFcnJvciBzY3JvbGxpbmcgdG8gbmV4dCBzZWN0aW9uIG9mJywgdGhpcy5jdXJyZW50V2Fsa3Rocm91Z2gpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnb3BlbkxpbmsnOiB7XG5cdFx0XHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKGFyZ3VtZW50KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoJ0Rpc3BhdGNoIHRvJywgY29tbWFuZCwgYXJndW1lbnQsICdub3QgZGVmaW5lZCcpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhpZGVDYXRlZ29yeShjYXRlZ29yeUlkOiBzdHJpbmcpIHtcblx0XHRjb25zdCBzZWxlY3RlZENhdGVnb3J5ID0gdGhpcy5nZXR0aW5nU3RhcnRlZENhdGVnb3JpZXMuZmluZChjYXRlZ29yeSA9PiBjYXRlZ29yeS5pZCA9PT0gY2F0ZWdvcnlJZCk7XG5cdFx0aWYgKCFzZWxlY3RlZENhdGVnb3J5KSB7IHRocm93IEVycm9yKCdDb3VsZCBub3QgZmluZCBjYXRlZ29yeSB3aXRoIElEICcgKyBjYXRlZ29yeUlkKTsgfVxuXHRcdHRoaXMuc2V0SGlkZGVuQ2F0ZWdvcmllcyhbLi4udGhpcy5nZXRIaWRkZW5DYXRlZ29yaWVzKCkuYWRkKGNhdGVnb3J5SWQpXSk7XG5cdFx0dGhpcy5nZXR0aW5nU3RhcnRlZExpc3QudmFsdWU/LnJlcmVuZGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIG1hcmtBbGxTdGVwc0NvbXBsZXRlKCkge1xuXHRcdGlmICh0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaCkge1xuXHRcdFx0dGhpcy5jdXJyZW50V2Fsa3Rocm91Z2g/LnN0ZXBzLmZvckVhY2goc3RlcCA9PiB7XG5cdFx0XHRcdGlmICghc3RlcC5kb25lKSB7XG5cdFx0XHRcdFx0dGhpcy5nZXR0aW5nU3RhcnRlZFNlcnZpY2UucHJvZ3Jlc3NTdGVwKHN0ZXAuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuaGlkZUNhdGVnb3J5KHRoaXMuY3VycmVudFdhbGt0aHJvdWdoPy5pZCk7XG5cdFx0XHR0aGlzLnNjcm9sbFByZXYoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgRXJyb3IoJ05vIHdhbGt0aHJvdWdoIG9wZW5lZCcpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdG9nZ2xlU3RlcENvbXBsZXRpb24oYXJndW1lbnQ6IHN0cmluZykge1xuXHRcdGNvbnN0IHN0ZXBUb2dnbGUgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaD8uc3RlcHMuZmluZChzdGVwID0+IHN0ZXAuaWQgPT09IGFyZ3VtZW50KSk7XG5cdFx0aWYgKHN0ZXBUb2dnbGUuZG9uZSkge1xuXHRcdFx0dGhpcy5nZXR0aW5nU3RhcnRlZFNlcnZpY2UuZGVwcm9ncmVzc1N0ZXAoYXJndW1lbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmdldHRpbmdTdGFydGVkU2VydmljZS5wcm9ncmVzc1N0ZXAoYXJndW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbldhbGt0aHJvdWdoU2VsZWN0b3IoKSB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gYXdhaXQgdGhpcy5xdWlja0lucHV0U2VydmljZS5waWNrKHRoaXMuZ2V0dGluZ1N0YXJ0ZWRDYXRlZ29yaWVzXG5cdFx0XHQuZmlsdGVyKGMgPT4gdGhpcy5jb250ZXh0U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKGMud2hlbikpXG5cdFx0XHQubWFwKHggPT4gKHtcblx0XHRcdFx0aWQ6IHguaWQsXG5cdFx0XHRcdGxhYmVsOiB4LnRpdGxlLFxuXHRcdFx0XHRkZXRhaWw6IHguZGVzY3JpcHRpb24sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB4LnNvdXJjZSxcblx0XHRcdH0pKSwgeyBjYW5QaWNrTWFueTogZmFsc2UsIG1hdGNoT25EZXNjcmlwdGlvbjogdHJ1ZSwgbWF0Y2hPbkRldGFpbDogdHJ1ZSwgdGl0bGU6IGxvY2FsaXplKCdwaWNrV2Fsa3Rocm91Z2hzJywgXCJPcGVuIFdhbGt0aHJvdWdoLi4uXCIpIH0pO1xuXHRcdGlmIChzZWxlY3Rpb24pIHtcblx0XHRcdHRoaXMucnVuRGlzcGF0Y2hDb21tYW5kKCdzZWxlY3RDYXRlZ29yeScsIHNlbGVjdGlvbi5pZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRIaWRkZW5DYXRlZ29yaWVzKCk6IFNldDxzdHJpbmc+IHtcblx0XHRyZXR1cm4gbmV3IFNldChKU09OLnBhcnNlKHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KGhpZGRlbkVudHJpZXNDb25maWd1cmF0aW9uS2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgJ1tdJykpKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0SGlkZGVuQ2F0ZWdvcmllcyhoaWRkZW46IHN0cmluZ1tdKSB7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShcblx0XHRcdGhpZGRlbkVudHJpZXNDb25maWd1cmF0aW9uS2V5LFxuXHRcdFx0SlNPTi5zdHJpbmdpZnkoaGlkZGVuKSxcblx0XHRcdFN0b3JhZ2VTY29wZS5QUk9GSUxFLFxuXHRcdFx0U3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG5cdHByaXZhdGUgY3VycmVudE1lZGlhQ29tcG9uZW50OiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY3VycmVudE1lZGlhVHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGFzeW5jIGJ1aWxkTWVkaWFDb21wb25lbnQoc3RlcElkOiBzdHJpbmcsIGZvcmNlUmVidWlsZDogYm9vbGVhbiA9IGZhbHNlKSB7XG5cdFx0aWYgKCF0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaCkge1xuXHRcdFx0dGhyb3cgRXJyb3IoJ25vIHdhbGt0aHJvdWdoIHNlbGVjdGVkJyk7XG5cdFx0fVxuXHRcdGNvbnN0IHN0ZXBUb0V4cGFuZCA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuY3VycmVudFdhbGt0aHJvdWdoLnN0ZXBzLmZpbmQoc3RlcCA9PiBzdGVwLmlkID09PSBzdGVwSWQpKTtcblxuXHRcdGlmICghZm9yY2VSZWJ1aWxkICYmIHRoaXMuY3VycmVudE1lZGlhQ29tcG9uZW50ID09PSBzdGVwSWQpIHsgcmV0dXJuOyB9XG5cdFx0dGhpcy5jdXJyZW50TWVkaWFDb21wb25lbnQgPSBzdGVwSWQ7XG5cblx0XHR0aGlzLnN0ZXBEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0dGhpcy5zdGVwRGlzcG9zYWJsZXMuYWRkKHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5jdXJyZW50TWVkaWFDb21wb25lbnQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAodGhpcy5jdXJyZW50TWVkaWFUeXBlICE9PSBzdGVwVG9FeHBhbmQubWVkaWEudHlwZSkge1xuXHRcdFx0dGhpcy5tZWRpYURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRcdHRoaXMuY3VycmVudE1lZGlhVHlwZSA9IHN0ZXBUb0V4cGFuZC5tZWRpYS50eXBlO1xuXG5cdFx0XHR0aGlzLm1lZGlhRGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuY3VycmVudE1lZGlhVHlwZSA9IHVuZGVmaW5lZDtcblx0XHRcdH0pKTtcblxuXHRcdFx0Y2xlYXJOb2RlKHRoaXMuc3RlcE1lZGlhQ29tcG9uZW50KTtcblxuXHRcdFx0aWYgKHN0ZXBUb0V4cGFuZC5tZWRpYS50eXBlID09PSAnc3ZnJykge1xuXHRcdFx0XHR0aGlzLndlYnZpZXcgPSB0aGlzLm1lZGlhRGlzcG9zYWJsZXMuYWRkKHRoaXMud2Vidmlld1NlcnZpY2UuY3JlYXRlV2Vidmlld0VsZW1lbnQoeyB0aXRsZTogdW5kZWZpbmVkLCBvcHRpb25zOiB7IGRpc2FibGVTZXJ2aWNlV29ya2VyOiB0cnVlIH0sIGNvbnRlbnRPcHRpb25zOiB7fSwgZXh0ZW5zaW9uOiB1bmRlZmluZWQgfSkpO1xuXHRcdFx0XHR0aGlzLndlYnZpZXcubW91bnRUbyh0aGlzLnN0ZXBNZWRpYUNvbXBvbmVudCwgdGhpcy53aW5kb3cpO1xuXHRcdFx0fSBlbHNlIGlmIChzdGVwVG9FeHBhbmQubWVkaWEudHlwZSA9PT0gJ21hcmtkb3duJykge1xuXHRcdFx0XHR0aGlzLndlYnZpZXcgPSB0aGlzLm1lZGlhRGlzcG9zYWJsZXMuYWRkKHRoaXMud2Vidmlld1NlcnZpY2UuY3JlYXRlV2Vidmlld0VsZW1lbnQoeyBvcHRpb25zOiB7fSwgY29udGVudE9wdGlvbnM6IHsgbG9jYWxSZXNvdXJjZVJvb3RzOiBbc3RlcFRvRXhwYW5kLm1lZGlhLnJvb3RdLCBhbGxvd1NjcmlwdHM6IHRydWUgfSwgdGl0bGU6ICcnLCBleHRlbnNpb246IHVuZGVmaW5lZCB9KSk7XG5cdFx0XHRcdHRoaXMud2Vidmlldy5tb3VudFRvKHRoaXMuc3RlcE1lZGlhQ29tcG9uZW50LCB0aGlzLndpbmRvdyk7XG5cdFx0XHR9IGVsc2UgaWYgKHN0ZXBUb0V4cGFuZC5tZWRpYS50eXBlID09PSAndmlkZW8nKSB7XG5cdFx0XHRcdHRoaXMud2VidmlldyA9IHRoaXMubWVkaWFEaXNwb3NhYmxlcy5hZGQodGhpcy53ZWJ2aWV3U2VydmljZS5jcmVhdGVXZWJ2aWV3RWxlbWVudCh7IG9wdGlvbnM6IHt9LCBjb250ZW50T3B0aW9uczogeyBsb2NhbFJlc291cmNlUm9vdHM6IFtzdGVwVG9FeHBhbmQubWVkaWEucm9vdF0sIGFsbG93U2NyaXB0czogdHJ1ZSB9LCB0aXRsZTogJycsIGV4dGVuc2lvbjogdW5kZWZpbmVkIH0pKTtcblx0XHRcdFx0dGhpcy53ZWJ2aWV3Lm1vdW50VG8odGhpcy5zdGVwTWVkaWFDb21wb25lbnQsIHRoaXMud2luZG93KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoc3RlcFRvRXhwYW5kLm1lZGlhLnR5cGUgPT09ICdpbWFnZScpIHtcblxuXHRcdFx0dGhpcy5zdGVwc0NvbnRlbnQuY2xhc3NMaXN0LmFkZCgnaW1hZ2UnKTtcblx0XHRcdHRoaXMuc3RlcHNDb250ZW50LmNsYXNzTGlzdC5yZW1vdmUoJ21hcmtkb3duJyk7XG5cdFx0XHR0aGlzLnN0ZXBzQ29udGVudC5jbGFzc0xpc3QucmVtb3ZlKCd2aWRlbycpO1xuXG5cdFx0XHRjb25zdCBtZWRpYSA9IHN0ZXBUb0V4cGFuZC5tZWRpYTtcblx0XHRcdGNvbnN0IG1lZGlhRWxlbWVudCA9ICQ8SFRNTEltYWdlRWxlbWVudD4oJ2ltZycpO1xuXHRcdFx0Y2xlYXJOb2RlKHRoaXMuc3RlcE1lZGlhQ29tcG9uZW50KTtcblx0XHRcdHRoaXMuc3RlcE1lZGlhQ29tcG9uZW50LmFwcGVuZENoaWxkKG1lZGlhRWxlbWVudCk7XG5cdFx0XHRtZWRpYUVsZW1lbnQuc2V0QXR0cmlidXRlKCdhbHQnLCBtZWRpYS5hbHRUZXh0KTtcblx0XHRcdHRoaXMudXBkYXRlTWVkaWFTb3VyY2VGb3JDb2xvck1vZGUobWVkaWFFbGVtZW50LCBtZWRpYS5wYXRoKTtcblxuXHRcdFx0dGhpcy5zdGVwRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnN0ZXBNZWRpYUNvbXBvbmVudCwgJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBocmVmcyA9IHN0ZXBUb0V4cGFuZC5kZXNjcmlwdGlvbi5tYXAobHQgPT4gbHQubm9kZXMuZmlsdGVyKChub2RlKTogbm9kZSBpcyBJTGluayA9PiB0eXBlb2Ygbm9kZSAhPT0gJ3N0cmluZycpLm1hcChub2RlID0+IG5vZGUuaHJlZikpLmZsYXQoKTtcblx0XHRcdFx0aWYgKGhyZWZzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdGNvbnN0IGhyZWYgPSBocmVmc1swXTtcblx0XHRcdFx0XHRpZiAoaHJlZi5zdGFydHNXaXRoKCdodHRwJykpIHtcblx0XHRcdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEdldHRpbmdTdGFydGVkQWN0aW9uRXZlbnQsIEdldHRpbmdTdGFydGVkQWN0aW9uQ2xhc3NpZmljYXRpb24+KCdnZXR0aW5nU3RhcnRlZC5BY3Rpb25FeGVjdXRlZCcsIHsgY29tbWFuZDogJ3J1blN0ZXBBY3Rpb24nLCBhcmd1bWVudDogaHJlZiwgd2Fsa3Rocm91Z2hJZDogdGhpcy5jdXJyZW50V2Fsa3Rocm91Z2g/LmlkIH0pO1xuXHRcdFx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oaHJlZik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZCh0aGlzLnRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4gdGhpcy51cGRhdGVNZWRpYVNvdXJjZUZvckNvbG9yTW9kZShtZWRpYUVsZW1lbnQsIG1lZGlhLnBhdGgpKSk7XG5cblx0XHR9XG5cdFx0ZWxzZSBpZiAoc3RlcFRvRXhwYW5kLm1lZGlhLnR5cGUgPT09ICdzdmcnKSB7XG5cdFx0XHR0aGlzLnN0ZXBzQ29udGVudC5jbGFzc0xpc3QuYWRkKCdpbWFnZScpO1xuXHRcdFx0dGhpcy5zdGVwc0NvbnRlbnQuY2xhc3NMaXN0LnJlbW92ZSgnbWFya2Rvd24nKTtcblx0XHRcdHRoaXMuc3RlcHNDb250ZW50LmNsYXNzTGlzdC5yZW1vdmUoJ3ZpZGVvJyk7XG5cblx0XHRcdGNvbnN0IG1lZGlhID0gc3RlcFRvRXhwYW5kLm1lZGlhO1xuXHRcdFx0dGhpcy53ZWJ2aWV3LnNldEh0bWwoYXdhaXQgdGhpcy5kZXRhaWxzUmVuZGVyZXIucmVuZGVyU1ZHKG1lZGlhLnBhdGgpKTtcblxuXHRcdFx0bGV0IGlzRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4geyBpc0Rpc3Bvc2VkID0gdHJ1ZTsgfSkpO1xuXG5cdFx0XHR0aGlzLnN0ZXBEaXNwb3NhYmxlcy5hZGQodGhpcy50aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Ly8gUmVuZGVyIGFnYWluIHNpbmNlIGNvbG9yIHZhcnMgY2hhbmdlXG5cdFx0XHRcdGNvbnN0IGJvZHkgPSBhd2FpdCB0aGlzLmRldGFpbHNSZW5kZXJlci5yZW5kZXJTVkcobWVkaWEucGF0aCk7XG5cdFx0XHRcdGlmICghaXNEaXNwb3NlZCkgeyAvLyBNYWtlIHN1cmUgd2Ugd2VyZW4ndCBkaXNwb3NlZCBvZiBpbiB0aGUgbWVhbnRpbWVcblx0XHRcdFx0XHR0aGlzLndlYnZpZXcuc2V0SHRtbChib2R5KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLnN0ZXBEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuc3RlcE1lZGlhQ29tcG9uZW50LCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGhyZWZzID0gc3RlcFRvRXhwYW5kLmRlc2NyaXB0aW9uLm1hcChsdCA9PiBsdC5ub2Rlcy5maWx0ZXIoKG5vZGUpOiBub2RlIGlzIElMaW5rID0+IHR5cGVvZiBub2RlICE9PSAnc3RyaW5nJykubWFwKG5vZGUgPT4gbm9kZS5ocmVmKSkuZmxhdCgpO1xuXHRcdFx0XHRpZiAoaHJlZnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0Y29uc3QgaHJlZiA9IGhyZWZzWzBdO1xuXHRcdFx0XHRcdGlmIChocmVmLnN0YXJ0c1dpdGgoJ2h0dHAnKSkge1xuXHRcdFx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8R2V0dGluZ1N0YXJ0ZWRBY3Rpb25FdmVudCwgR2V0dGluZ1N0YXJ0ZWRBY3Rpb25DbGFzc2lmaWNhdGlvbj4oJ2dldHRpbmdTdGFydGVkLkFjdGlvbkV4ZWN1dGVkJywgeyBjb21tYW5kOiAncnVuU3RlcEFjdGlvbicsIGFyZ3VtZW50OiBocmVmLCB3YWxrdGhyb3VnaElkOiB0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaD8uaWQgfSk7XG5cdFx0XHRcdFx0XHR0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihocmVmKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5zdGVwRGlzcG9zYWJsZXMuYWRkKHRoaXMud2Vidmlldy5vbkRpZENsaWNrTGluayhsaW5rID0+IHtcblx0XHRcdFx0aWYgKG1hdGNoZXNTY2hlbWUobGluaywgU2NoZW1hcy5odHRwcykgfHwgbWF0Y2hlc1NjaGVtZShsaW5rLCBTY2hlbWFzLmh0dHApIHx8IChtYXRjaGVzU2NoZW1lKGxpbmssIFNjaGVtYXMuY29tbWFuZCkpKSB7XG5cdFx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4obGluaywgeyBhbGxvd0NvbW1hbmRzOiB0cnVlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHR9XG5cdFx0ZWxzZSBpZiAoc3RlcFRvRXhwYW5kLm1lZGlhLnR5cGUgPT09ICdtYXJrZG93bicpIHtcblxuXHRcdFx0dGhpcy5zdGVwc0NvbnRlbnQuY2xhc3NMaXN0LnJlbW92ZSgnaW1hZ2UnKTtcblx0XHRcdHRoaXMuc3RlcHNDb250ZW50LmNsYXNzTGlzdC5hZGQoJ21hcmtkb3duJyk7XG5cdFx0XHR0aGlzLnN0ZXBzQ29udGVudC5jbGFzc0xpc3QucmVtb3ZlKCd2aWRlbycpO1xuXG5cdFx0XHRjb25zdCBtZWRpYSA9IHN0ZXBUb0V4cGFuZC5tZWRpYTtcblxuXHRcdFx0Y29uc3QgcmF3SFRNTCA9IGF3YWl0IHRoaXMuZGV0YWlsc1JlbmRlcmVyLnJlbmRlck1hcmtkb3duKG1lZGlhLnBhdGgsIG1lZGlhLmJhc2UpO1xuXHRcdFx0dGhpcy53ZWJ2aWV3LnNldEh0bWwocmF3SFRNTCk7XG5cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWRDb250ZXh0S2V5RXhwcnMgPSByYXdIVE1MLm1hdGNoKC9jaGVja2VkLW9uPVxcXCIoW14nXVteXCJdKilcXFwiL2cpPy5tYXAoYXR0ciA9PiBhdHRyLnNsaWNlKCdjaGVja2VkLW9uPVwiJy5sZW5ndGgsIC0xKVxuXHRcdFx0XHQucmVwbGFjZSgvJiMzOTsvZywgJ1xcJycpXG5cdFx0XHRcdC5yZXBsYWNlKC8mYW1wOy9nLCAnJicpKTtcblxuXHRcdFx0Y29uc3QgcG9zdFRydWVLZXlzTWVzc2FnZSA9ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgZW5hYmxlZENvbnRleHRLZXlzID0gc2VyaWFsaXplZENvbnRleHRLZXlFeHBycz8uZmlsdGVyKGV4cHIgPT4gdGhpcy5jb250ZXh0U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKGV4cHIpKSk7XG5cdFx0XHRcdGlmIChlbmFibGVkQ29udGV4dEtleXMpIHtcblx0XHRcdFx0XHR0aGlzLndlYnZpZXcucG9zdE1lc3NhZ2Uoe1xuXHRcdFx0XHRcdFx0ZW5hYmxlZENvbnRleHRLZXlzXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGlmIChzZXJpYWxpemVkQ29udGV4dEtleUV4cHJzKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRleHRLZXlFeHBycyA9IGNvYWxlc2NlKHNlcmlhbGl6ZWRDb250ZXh0S2V5RXhwcnMubWFwKGV4cHIgPT4gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoZXhwcikpKTtcblx0XHRcdFx0Y29uc3Qgd2F0Y2hpbmdLZXlzID0gbmV3IFNldChjb250ZXh0S2V5RXhwcnMuZmxhdE1hcChleHByID0+IGV4cHIua2V5cygpKSk7XG5cblx0XHRcdFx0dGhpcy5zdGVwRGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KGUgPT4ge1xuXHRcdFx0XHRcdGlmIChlLmFmZmVjdHNTb21lKHdhdGNoaW5nS2V5cykpIHsgcG9zdFRydWVLZXlzTWVzc2FnZSgpOyB9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGlzRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4geyBpc0Rpc3Bvc2VkID0gdHJ1ZTsgfSkpO1xuXG5cdFx0XHR0aGlzLnN0ZXBEaXNwb3NhYmxlcy5hZGQodGhpcy53ZWJ2aWV3Lm9uRGlkQ2xpY2tMaW5rKGxpbmsgPT4ge1xuXHRcdFx0XHRpZiAobWF0Y2hlc1NjaGVtZShsaW5rLCBTY2hlbWFzLmh0dHBzKSB8fCBtYXRjaGVzU2NoZW1lKGxpbmssIFNjaGVtYXMuaHR0cCkgfHwgKG1hdGNoZXNTY2hlbWUobGluaywgU2NoZW1hcy5jb21tYW5kKSkpIHtcblx0XHRcdFx0XHRjb25zdCB0b1NpZGUgPSBsaW5rLnN0YXJ0c1dpdGgoJ2NvbW1hbmQ6dG9TaWRlOicpO1xuXHRcdFx0XHRcdGlmICh0b1NpZGUpIHtcblx0XHRcdFx0XHRcdGxpbmsgPSBsaW5rLnJlcGxhY2UoJ2NvbW1hbmQ6dG9TaWRlOicsICdjb21tYW5kOicpO1xuXHRcdFx0XHRcdFx0dGhpcy5mb2N1c1NpZGVFZGl0b3JHcm91cCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihsaW5rLCB7IGFsbG93Q29tbWFuZHM6IHRydWUsIG9wZW5Ub1NpZGU6IHRvU2lkZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRpZiAocmF3SFRNTC5pbmRleE9mKCc8Y29kZT4nKSA+PSAwKSB7XG5cdFx0XHRcdC8vIFJlbmRlciBhZ2FpbiB3aGVuIFRoZW1lIGNoYW5nZXMgc2luY2Ugc3ludGF4IGhpZ2hsaWdodGluZyBvZiBjb2RlIGJsb2NrcyBtYXkgaGF2ZSBjaGFuZ2VkXG5cdFx0XHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZCh0aGlzLnRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGJvZHkgPSBhd2FpdCB0aGlzLmRldGFpbHNSZW5kZXJlci5yZW5kZXJNYXJrZG93bihtZWRpYS5wYXRoLCBtZWRpYS5iYXNlKTtcblx0XHRcdFx0XHRpZiAoIWlzRGlzcG9zZWQpIHsgLy8gTWFrZSBzdXJlIHdlIHdlcmVuJ3QgZGlzcG9zZWQgb2YgaW4gdGhlIG1lYW50aW1lXG5cdFx0XHRcdFx0XHR0aGlzLndlYnZpZXcuc2V0SHRtbChib2R5KTtcblx0XHRcdFx0XHRcdHBvc3RUcnVlS2V5c01lc3NhZ2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGF5b3V0RGVsYXllciA9IG5ldyBEZWxheWVyKDUwKTtcblxuXHRcdFx0dGhpcy5sYXlvdXRNYXJrZG93biA9ICgpID0+IHtcblx0XHRcdFx0bGF5b3V0RGVsYXllci50cmlnZ2VyKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLndlYnZpZXcucG9zdE1lc3NhZ2UoeyBsYXlvdXRNZU5vdzogdHJ1ZSB9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9O1xuXG5cdFx0XHR0aGlzLnN0ZXBEaXNwb3NhYmxlcy5hZGQobGF5b3V0RGVsYXllcik7XG5cdFx0XHR0aGlzLnN0ZXBEaXNwb3NhYmxlcy5hZGQoeyBkaXNwb3NlOiAoKSA9PiB0aGlzLmxheW91dE1hcmtkb3duID0gdW5kZWZpbmVkIH0pO1xuXG5cdFx0XHRwb3N0VHJ1ZUtleXNNZXNzYWdlKCk7XG5cblx0XHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZCh0aGlzLndlYnZpZXcub25NZXNzYWdlKGFzeW5jIGUgPT4ge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlOiBzdHJpbmcgPSBlLm1lc3NhZ2UgYXMgc3RyaW5nO1xuXHRcdFx0XHRpZiAobWVzc2FnZS5zdGFydHNXaXRoKCdjb21tYW5kOicpKSB7XG5cdFx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4obWVzc2FnZSwgeyBhbGxvd0NvbW1hbmRzOiB0cnVlIH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG1lc3NhZ2Uuc3RhcnRzV2l0aCgnc2V0VGhlbWU6JykpIHtcblx0XHRcdFx0XHRjb25zdCB0aGVtZUlkID0gbWVzc2FnZS5zbGljZSgnc2V0VGhlbWU6Jy5sZW5ndGgpO1xuXHRcdFx0XHRcdGNvbnN0IHRoZW1lID0gKGF3YWl0IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWVzKCkpLmZpbmQodGhlbWUgPT4gdGhlbWUuc2V0dGluZ3NJZCA9PT0gdGhlbWVJZCk7XG5cdFx0XHRcdFx0aWYgKHRoZW1lKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnRoZW1lU2VydmljZS5zZXRDb2xvclRoZW1lKHRoZW1lLmlkLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zb2xlLmVycm9yKCdVbmV4cGVjdGVkIG1lc3NhZ2UnLCBtZXNzYWdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRlbHNlIGlmIChzdGVwVG9FeHBhbmQubWVkaWEudHlwZSA9PT0gJ3ZpZGVvJykge1xuXHRcdFx0dGhpcy5zdGVwc0NvbnRlbnQuY2xhc3NMaXN0LmFkZCgndmlkZW8nKTtcblx0XHRcdHRoaXMuc3RlcHNDb250ZW50LmNsYXNzTGlzdC5yZW1vdmUoJ21hcmtkb3duJyk7XG5cdFx0XHR0aGlzLnN0ZXBzQ29udGVudC5jbGFzc0xpc3QucmVtb3ZlKCdpbWFnZScpO1xuXG5cdFx0XHRjb25zdCBtZWRpYSA9IHN0ZXBUb0V4cGFuZC5tZWRpYTtcblxuXHRcdFx0Y29uc3QgdGhlbWVUeXBlID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLnR5cGU7XG5cdFx0XHRjb25zdCB2aWRlb1BhdGggPSBtZWRpYS5wYXRoW3RoZW1lVHlwZV07XG5cdFx0XHRjb25zdCB2aWRlb1Bvc3RlciA9IG1lZGlhLnBvc3RlciA/IG1lZGlhLnBvc3Rlclt0aGVtZVR5cGVdIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgYWx0VGV4dCA9IG1lZGlhLmFsdFRleHQgPyBtZWRpYS5hbHRUZXh0IDogbG9jYWxpemUoJ3ZpZGVvQWx0VGV4dCcsIFwiVmlkZW8gZm9yIHswfVwiLCBzdGVwVG9FeHBhbmQudGl0bGUpO1xuXHRcdFx0Y29uc3QgcmF3SFRNTCA9IGF3YWl0IHRoaXMuZGV0YWlsc1JlbmRlcmVyLnJlbmRlclZpZGVvKHZpZGVvUGF0aCwgdmlkZW9Qb3N0ZXIsIGFsdFRleHQpO1xuXHRcdFx0dGhpcy53ZWJ2aWV3LnNldEh0bWwocmF3SFRNTCk7XG5cblx0XHRcdGxldCBpc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdFx0XHR0aGlzLnN0ZXBEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHsgaXNEaXNwb3NlZCA9IHRydWU7IH0pKTtcblxuXHRcdFx0dGhpcy5zdGVwRGlzcG9zYWJsZXMuYWRkKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdC8vIFJlbmRlciBhZ2FpbiBzaW5jZSBjb2xvciB2YXJzIGNoYW5nZVxuXHRcdFx0XHRjb25zdCB0aGVtZVR5cGUgPSB0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkudHlwZTtcblx0XHRcdFx0Y29uc3QgdmlkZW9QYXRoID0gbWVkaWEucGF0aFt0aGVtZVR5cGVdO1xuXHRcdFx0XHRjb25zdCB2aWRlb1Bvc3RlciA9IG1lZGlhLnBvc3RlciA/IG1lZGlhLnBvc3Rlclt0aGVtZVR5cGVdIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBib2R5ID0gYXdhaXQgdGhpcy5kZXRhaWxzUmVuZGVyZXIucmVuZGVyVmlkZW8odmlkZW9QYXRoLCB2aWRlb1Bvc3RlciwgYWx0VGV4dCk7XG5cblx0XHRcdFx0aWYgKCFpc0Rpc3Bvc2VkKSB7IC8vIE1ha2Ugc3VyZSB3ZSB3ZXJlbid0IGRpc3Bvc2VkIG9mIGluIHRoZSBtZWFudGltZVxuXHRcdFx0XHRcdHRoaXMud2Vidmlldy5zZXRIdG1sKGJvZHkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc2VsZWN0U3RlcExvb3NlKGlkOiBzdHJpbmcpIHtcblx0XHRpZiAoIXRoaXMuZWRpdG9ySW5wdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gQWxsb3cgcGFzc2luZyBpbiBpZCB3aXRoIGEgY2F0ZWdvcnkgYXBwZW5kZWQgb3Igd2l0aCBqdXN0IHRoZSBpZCBvZiB0aGUgc3RlcFxuXHRcdGlmIChpZC5zdGFydHNXaXRoKGAke3RoaXMuZWRpdG9ySW5wdXQuc2VsZWN0ZWRDYXRlZ29yeX0jYCkpIHtcblx0XHRcdHRoaXMuc2VsZWN0U3RlcChpZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHRvU2VsZWN0ID0gdGhpcy5lZGl0b3JJbnB1dC5zZWxlY3RlZENhdGVnb3J5ICsgJyMnICsgaWQ7XG5cdFx0XHR0aGlzLnNlbGVjdFN0ZXAodG9TZWxlY3QpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcHJvdmlkZVNjcmVlblJlYWRlclVwZGF0ZSgpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuV2Fsa3Rocm91Z2gpKSB7XG5cdFx0XHRjb25zdCBrYkxhYmVsID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKEFjY2Vzc2libGVWaWV3QWN0aW9uLmlkKT8uZ2V0QXJpYUxhYmVsKCk7XG5cdFx0XHRyZXR1cm4ga2JMYWJlbCA/IGxvY2FsaXplKCdhY2Vzc2libGVWaWV3SGludCcsIFwiSW5zcGVjdCB0aGlzIGluIHRoZSBhY2Nlc3NpYmxlIHZpZXcgKHswfSkuXFxuXCIsIGtiTGFiZWwpIDogbG9jYWxpemUoJ2FjZXNzaWJsZVZpZXdIaW50Tm9LYk9wZW4nLCBcIkluc3BlY3QgdGhpcyBpbiB0aGUgYWNjZXNzaWJsZSB2aWV3IHZpYSB0aGUgY29tbWFuZCBPcGVuIEFjY2Vzc2libGUgVmlldyB3aGljaCBpcyBjdXJyZW50bHkgbm90IHRyaWdnZXJhYmxlIHZpYSBrZXliaW5kaW5nLlxcblwiKTtcblx0XHR9XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzZWxlY3RTdGVwKGlkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGRlbGF5Rm9jdXMgPSB0cnVlLCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbikge1xuXHRcdGlmICghdGhpcy5lZGl0b3JJbnB1dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoaWQpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0bGV0IHN0ZXBFbGVtZW50ID0gdGhpcy5jb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRGl2RWxlbWVudD4oYFtkYXRhLXN0ZXAtaWQ9XCIke2lkfVwiXWApO1xuXHRcdFx0aWYgKCFzdGVwRWxlbWVudCkge1xuXHRcdFx0XHQvLyBTZWxlY3RlZCBhbiBlbGVtZW50IHRoYXQgaXMgbm90IGluLWNvbnRleHQsIGp1c3QgZmFsbGJhY2sgdG8gd2hhdGV2ZXIuXG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0XHRzdGVwRWxlbWVudCA9IHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTERpdkVsZW1lbnQ+KGBbZGF0YS1zdGVwLWlkXWApO1xuXHRcdFx0XHRpZiAoIXN0ZXBFbGVtZW50KSB7XG5cdFx0XHRcdFx0Ly8gTm8gc3RlcHMgYXJvdW5kLi4uIGp1c3QgaWdub3JlLlxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZCA9IGFzc2VydFJldHVybnNEZWZpbmVkKHN0ZXBFbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1zdGVwLWlkJykpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRzdGVwRWxlbWVudC5wYXJlbnRFbGVtZW50Py5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PignLmV4cGFuZGVkJykuZm9yRWFjaChub2RlID0+IHtcblx0XHRcdFx0aWYgKG5vZGUuZ2V0QXR0cmlidXRlKCdkYXRhLXN0ZXAtaWQnKSAhPT0gaWQpIHtcblx0XHRcdFx0XHRub2RlLmNsYXNzTGlzdC5yZW1vdmUoJ2V4cGFuZGVkJyk7XG5cdFx0XHRcdFx0bm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAnZmFsc2UnKTtcblx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdFx0XHRjb25zdCBjb2RpY29uRWxlbWVudCA9IG5vZGUucXVlcnlTZWxlY3RvcignLmNvZGljb24nKTtcblx0XHRcdFx0XHRpZiAoY29kaWNvbkVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdGNvZGljb25FbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgndGFiaW5kZXgnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0aWYgKCFwcmVzZXJ2ZUZvY3VzKSB7XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gKHN0ZXBFbGVtZW50IGFzIEhUTUxFbGVtZW50KS5mb2N1cygpLCBkZWxheUZvY3VzICYmIHRoaXMuc2hvdWxkQW5pbWF0ZSgpID8gU0xJREVfVFJBTlNJVElPTl9USU1FX01TIDogMCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuZWRpdG9ySW5wdXQuc2VsZWN0ZWRTdGVwID0gaWQ7XG5cblx0XHRcdHN0ZXBFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2V4cGFuZGVkJyk7XG5cdFx0XHRzdGVwRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAndHJ1ZScpO1xuXHRcdFx0dGhpcy5idWlsZE1lZGlhQ29tcG9uZW50KGlkLCB0cnVlKTtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgY29kaWNvbkVsZW1lbnQgPSBzdGVwRWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuY29kaWNvbicpO1xuXHRcdFx0aWYgKGNvZGljb25FbGVtZW50KSB7XG5cdFx0XHRcdGNvZGljb25FbGVtZW50LnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnMCcpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5nZXR0aW5nU3RhcnRlZFNlcnZpY2UucHJvZ3Jlc3NCeUV2ZW50KCdzdGVwU2VsZWN0ZWQ6JyArIGlkKTtcblx0XHRcdGNvbnN0IHN0ZXAgPSB0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaD8uc3RlcHM/LmZpbmQoc3RlcCA9PiBzdGVwLmlkID09PSBpZCk7XG5cdFx0XHRpZiAoc3RlcCkge1xuXHRcdFx0XHRzdGVwRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBgJHt0aGlzLnByb3ZpZGVTY3JlZW5SZWFkZXJVcGRhdGUoKX0gJHtzdGVwLnRpdGxlfWApO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVkaXRvcklucHV0LnNlbGVjdGVkU3RlcCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLmRldGFpbHNQYWdlU2Nyb2xsYmFyPy5zY2FuRG9tTm9kZSgpO1xuXHRcdHRoaXMuZGV0YWlsc1Njcm9sbGJhci52YWx1ZT8uc2NhbkRvbU5vZGUoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTWVkaWFTb3VyY2VGb3JDb2xvck1vZGUoZWxlbWVudDogSFRNTEltYWdlRWxlbWVudCwgc291cmNlczogeyBoY0Rhcms6IFVSSTsgaGNMaWdodDogVVJJOyBkYXJrOiBVUkk7IGxpZ2h0OiBVUkkgfSkge1xuXHRcdGNvbnN0IHRoZW1lVHlwZSA9IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS50eXBlO1xuXHRcdGNvbnN0IHNyYyA9IHNvdXJjZXNbdGhlbWVUeXBlXS50b1N0cmluZyh0cnVlKS5yZXBsYWNlKC8gL2csICclMjAnKTtcblx0XHRlbGVtZW50LnNyY3NldCA9IHNyYy50b0xvd2VyQ2FzZSgpLmVuZHNXaXRoKCcuc3ZnJykgPyBzcmMgOiAoc3JjICsgJyAxLjV4Jyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlRWRpdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpIHtcblx0XHRpZiAodGhpcy5kZXRhaWxzUGFnZVNjcm9sbGJhcikgeyB0aGlzLmRldGFpbHNQYWdlU2Nyb2xsYmFyLmRpc3Bvc2UoKTsgfVxuXHRcdGlmICh0aGlzLmNhdGVnb3JpZXNQYWdlU2Nyb2xsYmFyKSB7IHRoaXMuY2F0ZWdvcmllc1BhZ2VTY3JvbGxiYXIuZGlzcG9zZSgpOyB9XG5cblx0XHR0aGlzLmNhdGVnb3JpZXNTbGlkZSA9ICQoJy5nZXR0aW5nU3RhcnRlZFNsaWRlQ2F0ZWdvcmllcy5nZXR0aW5nU3RhcnRlZFNsaWRlJyk7XG5cblx0XHRjb25zdCBwcmV2QnV0dG9uID0gJCgnYnV0dG9uLnByZXYtYnV0dG9uLmJ1dHRvbi1saW5rJywgeyAneC1kaXNwYXRjaCc6ICdzY3JvbGxQcmV2JyB9LCAkKCdzcGFuLnNjcm9sbC1idXR0b24uY29kaWNvbi5jb2RpY29uLWNoZXZyb24tbGVmdCcpLCAkKCdzcGFuLm1vcmVUZXh0Jywge30sIGxvY2FsaXplKCdnb0JhY2snLCBcIkdvIEJhY2tcIikpKTtcblx0XHR0aGlzLnN0ZXBzU2xpZGUgPSAkKCcuZ2V0dGluZ1N0YXJ0ZWRTbGlkZURldGFpbHMuZ2V0dGluZ1N0YXJ0ZWRTbGlkZScsIHt9LCBwcmV2QnV0dG9uKTtcblxuXHRcdHRoaXMuc3RlcHNDb250ZW50ID0gJCgnLmdldHRpbmdTdGFydGVkRGV0YWlsc0NvbnRlbnQnLCB7fSk7XG5cblx0XHR0aGlzLmRldGFpbHNQYWdlU2Nyb2xsYmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbVNjcm9sbGFibGVFbGVtZW50KHRoaXMuc3RlcHNDb250ZW50LCB7IGNsYXNzTmFtZTogJ2Z1bGwtaGVpZ2h0LXNjcm9sbGFibGUnLCB2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4gfSkpO1xuXHRcdHRoaXMuY2F0ZWdvcmllc1BhZ2VTY3JvbGxiYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQodGhpcy5jYXRlZ29yaWVzU2xpZGUsIHsgY2xhc3NOYW1lOiAnZnVsbC1oZWlnaHQtc2Nyb2xsYWJsZSBjYXRlZ29yaWVzU2Nyb2xsYmFyJywgdmVydGljYWw6IFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuIH0pKTtcblxuXHRcdHRoaXMuc3RlcHNTbGlkZS5hcHBlbmRDaGlsZCh0aGlzLmRldGFpbHNQYWdlU2Nyb2xsYmFyLmdldERvbU5vZGUoKSk7XG5cblx0XHRjb25zdCBnZXR0aW5nU3RhcnRlZFBhZ2UgPSAkKCcuZ2V0dGluZ1N0YXJ0ZWQnLCB7fSwgdGhpcy5jYXRlZ29yaWVzUGFnZVNjcm9sbGJhci5nZXREb21Ob2RlKCksIHRoaXMuc3RlcHNTbGlkZSk7XG5cdFx0dGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQoZ2V0dGluZ1N0YXJ0ZWRQYWdlKTtcblxuXHRcdHRoaXMuY2F0ZWdvcmllc1BhZ2VTY3JvbGxiYXIuc2NhbkRvbU5vZGUoKTtcblx0XHR0aGlzLmRldGFpbHNQYWdlU2Nyb2xsYmFyLnNjYW5Eb21Ob2RlKCk7XG5cblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQodGhpcy5jb250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBidWlsZENhdGVnb3JpZXNTbGlkZShwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbikge1xuXG5cdFx0dGhpcy5jYXRlZ29yaWVzU2xpZGVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGNvbnN0IHNob3dPblN0YXJ0dXBDaGVja2JveCA9IG5ldyBUb2dnbGUoe1xuXHRcdFx0aWNvbjogQ29kaWNvbi5jaGVjayxcblx0XHRcdGFjdGlvbkNsYXNzTmFtZTogJ2dldHRpbmctc3RhcnRlZC1jaGVja2JveCcsXG5cdFx0XHRpc0NoZWNrZWQ6IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoY29uZmlndXJhdGlvbktleSkgPT09ICd3ZWxjb21lUGFnZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NoZWNrYm94VGl0bGUnLCBcIldoZW4gY2hlY2tlZCwgdGhpcyBwYWdlIHdpbGwgYmUgc2hvd24gb24gc3RhcnR1cC5cIiksXG5cdFx0XHQuLi5kZWZhdWx0VG9nZ2xlU3R5bGVzXG5cdFx0fSk7XG5cdFx0c2hvd09uU3RhcnR1cENoZWNrYm94LmRvbU5vZGUuaWQgPSAnc2hvd09uU3RhcnR1cCc7XG5cdFx0Y29uc3Qgc2hvd09uU3RhcnR1cExhYmVsID0gJCgnbGFiZWwuY2FwdGlvbicsIHsgZm9yOiAnc2hvd09uU3RhcnR1cCcgfSwgbG9jYWxpemUoJ3dlbGNvbWVQYWdlLnNob3dPblN0YXJ0dXAnLCBcIlNob3cgd2VsY29tZSBwYWdlIG9uIHN0YXJ0dXBcIikpO1xuXHRcdGNvbnN0IG9uU2hvd09uU3RhcnR1cENoYW5nZWQgPSAoKSA9PiB7XG5cdFx0XHRpZiAoc2hvd09uU3RhcnR1cENoZWNrYm94LmNoZWNrZWQpIHtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8R2V0dGluZ1N0YXJ0ZWRBY3Rpb25FdmVudCwgR2V0dGluZ1N0YXJ0ZWRBY3Rpb25DbGFzc2lmaWNhdGlvbj4oJ2dldHRpbmdTdGFydGVkLkFjdGlvbkV4ZWN1dGVkJywgeyBjb21tYW5kOiAnc2hvd09uU3RhcnR1cENoZWNrZWQnLCBhcmd1bWVudDogdW5kZWZpbmVkLCB3YWxrdGhyb3VnaElkOiB0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaD8uaWQgfSk7XG5cdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoY29uZmlndXJhdGlvbktleSwgJ3dlbGNvbWVQYWdlJyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxHZXR0aW5nU3RhcnRlZEFjdGlvbkV2ZW50LCBHZXR0aW5nU3RhcnRlZEFjdGlvbkNsYXNzaWZpY2F0aW9uPignZ2V0dGluZ1N0YXJ0ZWQuQWN0aW9uRXhlY3V0ZWQnLCB7IGNvbW1hbmQ6ICdzaG93T25TdGFydHVwVW5jaGVja2VkJywgYXJndW1lbnQ6IHVuZGVmaW5lZCwgd2Fsa3Rocm91Z2hJZDogdGhpcy5jdXJyZW50V2Fsa3Rocm91Z2g/LmlkIH0pO1xuXHRcdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKGNvbmZpZ3VyYXRpb25LZXksICdub25lJyk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLmNhdGVnb3JpZXNTbGlkZURpc3Bvc2FibGVzLmFkZChzaG93T25TdGFydHVwQ2hlY2tib3gpO1xuXHRcdHRoaXMuY2F0ZWdvcmllc1NsaWRlRGlzcG9zYWJsZXMuYWRkKHNob3dPblN0YXJ0dXBDaGVja2JveC5vbkNoYW5nZSgoKSA9PiB7XG5cdFx0XHRvblNob3dPblN0YXJ0dXBDaGFuZ2VkKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuY2F0ZWdvcmllc1NsaWRlRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihzaG93T25TdGFydHVwTGFiZWwsICdjbGljaycsICgpID0+IHtcblx0XHRcdHNob3dPblN0YXJ0dXBDaGVja2JveC5jaGVja2VkID0gIXNob3dPblN0YXJ0dXBDaGVja2JveC5jaGVja2VkO1xuXHRcdFx0b25TaG93T25TdGFydHVwQ2hhbmdlZCgpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGhlYWRlciA9ICQoJy5oZWFkZXInLCB7fSxcblx0XHRcdCQoJ2gxLnByb2R1Y3QtbmFtZS5jYXB0aW9uJywge30sIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpLFxuXHRcdFx0JCgncC5zdWJ0aXRsZS5kZXNjcmlwdGlvbicsIHt9LCBsb2NhbGl6ZSh7IGtleTogJ2dldHRpbmdTdGFydGVkLmVkaXRpbmdFdm9sdmVkJywgY29tbWVudDogWydTaG93biBhcyBzdWJ0aXRsZSBvbiB0aGUgV2VsY29tZSBwYWdlLiddIH0sIFwiRWRpdGluZyBldm9sdmVkXCIpKVxuXHRcdCk7XG5cblx0XHRjb25zdCBsZWZ0Q29sdW1uID0gJCgnLmNhdGVnb3JpZXMtY29sdW1uLmNhdGVnb3JpZXMtY29sdW1uLWxlZnQnLCB7fSwpO1xuXHRcdGNvbnN0IHJpZ2h0Q29sdW1uID0gJCgnLmNhdGVnb3JpZXMtY29sdW1uLmNhdGVnb3JpZXMtY29sdW1uLXJpZ2h0Jywge30sKTtcblxuXHRcdGNvbnN0IHN0YXJ0TGlzdCA9IHRoaXMuYnVpbGRTdGFydExpc3QoKTtcblx0XHRjb25zdCByZWNlbnRMaXN0ID0gdGhpcy5idWlsZFJlY2VudGx5T3BlbmVkTGlzdCgpO1xuXHRcdGNvbnN0IGdldHRpbmdTdGFydGVkTGlzdCA9IHRoaXMuYnVpbGRHZXR0aW5nU3RhcnRlZFdhbGt0aHJvdWdoc0xpc3QoKTtcblxuXHRcdGNvbnN0IGZvb3RlckNoaWxkcmVuOiBIVE1MRWxlbWVudFtdID0gW107XG5cdFx0aWYgKGNhblNob3dBZ2VudHNCYW5uZXIodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlKSkge1xuXHRcdFx0Y29uc3QgYWdlbnRzQmFubmVyID0gY3JlYXRlQWdlbnRzQmFubmVyKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y3NzQ2xhc3M6ICdnZXR0aW5nLXN0YXJ0ZWQtY2F0ZWdvcnkuYWdlbnRzLWJhbm5lcicsXG5cdFx0XHRcdFx0c291cmNlOiAnd2VsY29tZVBhZ2UnLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5jYXRlZ29yaWVzU2xpZGVEaXNwb3NhYmxlcy5hZGQoYWdlbnRzQmFubmVyLmRpc3Bvc2FibGVzKTtcblx0XHRcdGZvb3RlckNoaWxkcmVuLnB1c2goYWdlbnRzQmFubmVyLmVsZW1lbnQpO1xuXHRcdH1cblx0XHRmb290ZXJDaGlsZHJlbi5wdXNoKCQoJ3Auc2hvd09uU3RhcnR1cCcsIHt9LFxuXHRcdFx0c2hvd09uU3RhcnR1cENoZWNrYm94LmRvbU5vZGUsXG5cdFx0XHRzaG93T25TdGFydHVwTGFiZWwsXG5cdFx0KSk7XG5cblx0XHRjb25zdCBmb290ZXIgPSAkKCcuZm9vdGVyJywge30sIC4uLmZvb3RlckNoaWxkcmVuKTtcblxuXHRcdGNvbnN0IGxheW91dExpc3RzID0gKCkgPT4ge1xuXHRcdFx0aWYgKGdldHRpbmdTdGFydGVkTGlzdC5pdGVtQ291bnQpIHtcblx0XHRcdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnbm9XYWxrdGhyb3VnaHMnKTtcblx0XHRcdFx0cmVzZXQocmlnaHRDb2x1bW4sIGdldHRpbmdTdGFydGVkTGlzdC5nZXREb21FbGVtZW50KCkpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ25vV2Fsa3Rocm91Z2hzJyk7XG5cdFx0XHRcdHJlc2V0KHJpZ2h0Q29sdW1uKTtcblx0XHRcdH1cblx0XHRcdHNldFRpbWVvdXQoKCkgPT4gdGhpcy5jYXRlZ29yaWVzUGFnZVNjcm9sbGJhcj8uc2NhbkRvbU5vZGUoKSwgNTApO1xuXHRcdFx0bGF5b3V0UmVjZW50TGlzdCgpO1xuXHRcdH07XG5cblx0XHRjb25zdCBsYXlvdXRSZWNlbnRMaXN0ID0gKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygnbm9XYWxrdGhyb3VnaHMnKSkge1xuXHRcdFx0XHRyZWNlbnRMaXN0LnNldExpbWl0KDEwKTtcblx0XHRcdFx0cmVzZXQobGVmdENvbHVtbiwgc3RhcnRMaXN0LmdldERvbUVsZW1lbnQoKSk7XG5cdFx0XHRcdHJlc2V0KHJpZ2h0Q29sdW1uLCByZWNlbnRMaXN0LmdldERvbUVsZW1lbnQoKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZWNlbnRMaXN0LnNldExpbWl0KDUpO1xuXHRcdFx0XHRyZXNldChsZWZ0Q29sdW1uLCBzdGFydExpc3QuZ2V0RG9tRWxlbWVudCgpLCByZWNlbnRMaXN0LmdldERvbUVsZW1lbnQoKSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGdldHRpbmdTdGFydGVkTGlzdC5vbkRpZENoYW5nZShsYXlvdXRMaXN0cyk7XG5cdFx0bGF5b3V0TGlzdHMoKTtcblxuXHRcdHJlc2V0KHRoaXMuY2F0ZWdvcmllc1NsaWRlLCAkKCcuZ2V0dGluZ1N0YXJ0ZWRDYXRlZ29yaWVzQ29udGFpbmVyJywge30sIGhlYWRlciwgbGVmdENvbHVtbiwgcmlnaHRDb2x1bW4sIGZvb3RlciwpKTtcblx0XHR0aGlzLmNhdGVnb3JpZXNQYWdlU2Nyb2xsYmFyPy5zY2FuRG9tTm9kZSgpO1xuXG5cdFx0dGhpcy51cGRhdGVDYXRlZ29yeVByb2dyZXNzKCk7XG5cdFx0dGhpcy5yZWdpc3RlckRpc3BhdGNoTGlzdGVuZXJzKCk7XG5cblx0XHRjb25zdCBlZGl0b3JJbnB1dCA9IHRoaXMuZWRpdG9ySW5wdXQ7XG5cdFx0aWYgKGVkaXRvcklucHV0Py5zZWxlY3RlZENhdGVnb3J5KSB7XG5cdFx0XHR0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaCA9IHRoaXMuZ2V0dGluZ1N0YXJ0ZWRDYXRlZ29yaWVzLmZpbmQoY2F0ZWdvcnkgPT4gY2F0ZWdvcnkuaWQgPT09IGVkaXRvcklucHV0LnNlbGVjdGVkQ2F0ZWdvcnkpO1xuXG5cdFx0XHRpZiAoIXRoaXMuY3VycmVudFdhbGt0aHJvdWdoKSB7XG5cdFx0XHRcdHRoaXMuZ2V0dGluZ1N0YXJ0ZWRDYXRlZ29yaWVzID0gdGhpcy5nZXR0aW5nU3RhcnRlZFNlcnZpY2UuZ2V0V2Fsa3Rocm91Z2hzKCk7XG5cdFx0XHRcdHRoaXMuY3VycmVudFdhbGt0aHJvdWdoID0gdGhpcy5nZXR0aW5nU3RhcnRlZENhdGVnb3JpZXMuZmluZChjYXRlZ29yeSA9PiBjYXRlZ29yeS5pZCA9PT0gZWRpdG9ySW5wdXQuc2VsZWN0ZWRDYXRlZ29yeSk7XG5cdFx0XHRcdGlmICh0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaCkge1xuXHRcdFx0XHRcdHRoaXMuYnVpbGRDYXRlZ29yeVNsaWRlKGVkaXRvcklucHV0LnNlbGVjdGVkQ2F0ZWdvcnksIGVkaXRvcklucHV0LnNlbGVjdGVkU3RlcCwgcHJlc2VydmVGb2N1cyk7XG5cdFx0XHRcdFx0dGhpcy5zZXRTbGlkZSgnZGV0YWlscycpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHRoaXMuYnVpbGRDYXRlZ29yeVNsaWRlKGVkaXRvcklucHV0LnNlbGVjdGVkQ2F0ZWdvcnksIGVkaXRvcklucHV0LnNlbGVjdGVkU3RlcCwgcHJlc2VydmVGb2N1cyk7XG5cdFx0XHRcdHRoaXMuc2V0U2xpZGUoJ2RldGFpbHMnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmVkaXRvcklucHV0Py5zaG93VGVsZW1ldHJ5Tm90aWNlICYmIHRoaXMucHJvZHVjdFNlcnZpY2Uub3BlblRvV2VsY29tZU1haW5QYWdlKSB7XG5cdFx0XHRjb25zdCB0ZWxlbWV0cnlOb3RpY2UgPSAkKCdwLnRlbGVtZXRyeS1ub3RpY2UnKTtcblx0XHRcdHRoaXMuYnVpbGRUZWxlbWV0cnlGb290ZXIodGVsZW1ldHJ5Tm90aWNlKTtcblx0XHRcdGZvb3Rlci5hcHBlbmRDaGlsZCh0ZWxlbWV0cnlOb3RpY2UpO1xuXHRcdH0gZWxzZSBpZiAoIXRoaXMucHJvZHVjdFNlcnZpY2Uub3BlblRvV2VsY29tZU1haW5QYWdlICYmIHRoaXMuc2hvd0ZlYXR1cmVkV2Fsa3Rocm91Z2ggJiYgdGhpcy5zdG9yYWdlU2VydmljZS5pc05ldyhTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pICYmICF0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCd3b3JrYmVuY2gud2VsY29tZVBhZ2UuZXhwZXJpbWVudGFsT25ib2FyZGluZycpKSB7XG5cdFx0XHRjb25zdCBmaXJzdFNlc3Npb25EYXRlU3RyaW5nID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoZmlyc3RTZXNzaW9uRGF0ZVN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTikgfHwgbmV3IERhdGUoKS50b1VUQ1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZGF5c1NpbmNlRmlyc3RTZXNzaW9uID0gKCgrbmV3IERhdGUoKSkgLSAoK25ldyBEYXRlKGZpcnN0U2Vzc2lvbkRhdGVTdHJpbmcpKSkgLyAxMDAwIC8gNjAgLyA2MCAvIDI0O1xuXHRcdFx0Y29uc3QgZmlzdENvbnRlbnRCZWhhdmlvdXIgPSBkYXlzU2luY2VGaXJzdFNlc3Npb24gPCAxID8gJ29wZW5Ub0ZpcnN0Q2F0ZWdvcnknIDogJ2luZGV4JztcblxuXHRcdFx0aWYgKGZpc3RDb250ZW50QmVoYXZpb3VyID09PSAnb3BlblRvRmlyc3RDYXRlZ29yeScpIHtcblx0XHRcdFx0Y29uc3QgZmlyc3QgPSB0aGlzLmdldHRpbmdTdGFydGVkQ2F0ZWdvcmllcy5maWx0ZXIoYyA9PiAhYy53aGVuIHx8IHRoaXMuY29udGV4dFNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhjLndoZW4pKVswXTtcblx0XHRcdFx0aWYgKGZpcnN0ICYmIHRoaXMuZWRpdG9ySW5wdXQpIHtcblx0XHRcdFx0XHR0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaCA9IGZpcnN0O1xuXHRcdFx0XHRcdHRoaXMuZWRpdG9ySW5wdXQuc2VsZWN0ZWRDYXRlZ29yeSA9IHRoaXMuY3VycmVudFdhbGt0aHJvdWdoPy5pZDtcblx0XHRcdFx0XHR0aGlzLmVkaXRvcklucHV0LndhbGt0aHJvdWdoUGFnZVRpdGxlID0gdGhpcy5jdXJyZW50V2Fsa3Rocm91Z2gud2Fsa3Rocm91Z2hQYWdlVGl0bGU7XG5cdFx0XHRcdFx0dGhpcy5idWlsZENhdGVnb3J5U2xpZGUodGhpcy5lZGl0b3JJbnB1dC5zZWxlY3RlZENhdGVnb3J5LCB1bmRlZmluZWQsIHByZXNlcnZlRm9jdXMpO1xuXHRcdFx0XHRcdHRoaXMuc2V0U2xpZGUoJ2RldGFpbHMnLCB0cnVlIC8qIGZpcnN0TGF1bmNoICovKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnNldFNsaWRlKCdjYXRlZ29yaWVzJyk7XG5cdH1cblxuXHRwcml2YXRlIGJ1aWxkUmVjZW50bHlPcGVuZWRMaXN0KCk6IEdldHRpbmdTdGFydGVkSW5kZXhMaXN0PFJlY2VudEVudHJ5PiB7XG5cdFx0Y29uc3QgcmVuZGVyUmVjZW50ID0gKHJlY2VudDogUmVjZW50RW50cnkpID0+IHtcblx0XHRcdGxldCBmdWxsUGF0aDogc3RyaW5nO1xuXHRcdFx0bGV0IHdpbmRvd09wZW5hYmxlOiBJV2luZG93T3BlbmFibGU7XG5cdFx0XHRsZXQgcmVzb3VyY2VVcmk6IFVSSTtcblx0XHRcdGlmIChpc1JlY2VudEZvbGRlcihyZWNlbnQpKSB7XG5cdFx0XHRcdHdpbmRvd09wZW5hYmxlID0geyBmb2xkZXJVcmk6IHJlY2VudC5mb2xkZXJVcmkgfTtcblx0XHRcdFx0ZnVsbFBhdGggPSByZWNlbnQubGFiZWwgfHwgdGhpcy5sYWJlbFNlcnZpY2UuZ2V0V29ya3NwYWNlTGFiZWwocmVjZW50LmZvbGRlclVyaSwgeyB2ZXJib3NlOiBWZXJib3NpdHkuTE9ORyB9KTtcblx0XHRcdFx0cmVzb3VyY2VVcmkgPSByZWNlbnQuZm9sZGVyVXJpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZnVsbFBhdGggPSByZWNlbnQubGFiZWwgfHwgdGhpcy5sYWJlbFNlcnZpY2UuZ2V0V29ya3NwYWNlTGFiZWwocmVjZW50LndvcmtzcGFjZSwgeyB2ZXJib3NlOiBWZXJib3NpdHkuTE9ORyB9KTtcblx0XHRcdFx0d2luZG93T3BlbmFibGUgPSB7IHdvcmtzcGFjZVVyaTogcmVjZW50LndvcmtzcGFjZS5jb25maWdQYXRoIH07XG5cdFx0XHRcdHJlc291cmNlVXJpID0gcmVjZW50LndvcmtzcGFjZS5jb25maWdQYXRoO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB7IG5hbWUsIHBhcmVudFBhdGggfSA9IHNwbGl0UmVjZW50TGFiZWwoZnVsbFBhdGgpO1xuXG5cdFx0XHRjb25zdCBsaSA9ICQoJ2xpJyk7XG5cdFx0XHRjb25zdCBsaW5rID0gJCgnYnV0dG9uLmJ1dHRvbi1saW5rJyk7XG5cblx0XHRcdGxpbmsuaW5uZXJUZXh0ID0gbmFtZTtcblx0XHRcdGxpbmsudGl0bGUgPSBmdWxsUGF0aDtcblx0XHRcdGxpbmsuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ3dlbGNvbWVQYWdlLm9wZW5Gb2xkZXJXaXRoUGF0aCcsIFwiT3BlbiBmb2xkZXIgezB9IHdpdGggcGF0aCB7MX1cIiwgbmFtZSwgcGFyZW50UGF0aCkpO1xuXHRcdFx0bGluay5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGUgPT4ge1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxHZXR0aW5nU3RhcnRlZEFjdGlvbkV2ZW50LCBHZXR0aW5nU3RhcnRlZEFjdGlvbkNsYXNzaWZpY2F0aW9uPignZ2V0dGluZ1N0YXJ0ZWQuQWN0aW9uRXhlY3V0ZWQnLCB7IGNvbW1hbmQ6ICdvcGVuUmVjZW50JywgYXJndW1lbnQ6IHVuZGVmaW5lZCwgd2Fsa3Rocm91Z2hJZDogdGhpcy5jdXJyZW50V2Fsa3Rocm91Z2g/LmlkIH0pO1xuXHRcdFx0XHR0aGlzLmhvc3RTZXJ2aWNlLm9wZW5XaW5kb3coW3dpbmRvd09wZW5hYmxlXSwge1xuXHRcdFx0XHRcdGZvcmNlTmV3V2luZG93OiBlLmN0cmxLZXkgfHwgZS5tZXRhS2V5LFxuXHRcdFx0XHRcdHJlbW90ZUF1dGhvcml0eTogcmVjZW50LnJlbW90ZUF1dGhvcml0eSB8fCBudWxsIC8vIGxvY2FsIHdpbmRvdyBpZiByZW1vdGVBdXRob3JpdHkgaXMgbm90IHNldCBvciBjYW4gbm90IGJlIGRlZHVjdGVkIGZyb20gdGhlIG9wZW5hYmxlXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR9KTtcblx0XHRcdGxpLmFwcGVuZENoaWxkKGxpbmspO1xuXG5cdFx0XHRjb25zdCBzcGFuID0gJCgnc3BhbicpO1xuXHRcdFx0c3Bhbi5jbGFzc0xpc3QuYWRkKCdwYXRoJyk7XG5cdFx0XHRzcGFuLmNsYXNzTGlzdC5hZGQoJ2RldGFpbCcpO1xuXHRcdFx0c3Bhbi5pbm5lclRleHQgPSBwYXJlbnRQYXRoO1xuXHRcdFx0c3Bhbi50aXRsZSA9IGZ1bGxQYXRoO1xuXHRcdFx0bGkuYXBwZW5kQ2hpbGQoc3Bhbik7XG5cblx0XHRcdGNvbnN0IGRlbGV0ZUJ1dHRvbiA9ICQoJ2EuY29kaWNvbi5jb2RpY29uLWNsb3NlLmhpZGUtY2F0ZWdvcnktYnV0dG9uLnJlY2VudGx5LW9wZW5lZC1kZWxldGUtYnV0dG9uJywge1xuXHRcdFx0XHQndGFiaW5kZXgnOiAwLFxuXHRcdFx0XHQncm9sZSc6ICdidXR0b24nLFxuXHRcdFx0XHQndGl0bGUnOiBsb2NhbGl6ZSgnd2VsY29tZVBhZ2UucmVtb3ZlUmVjZW50JywgXCJSZW1vdmUgZnJvbSBSZWNlbnRseSBPcGVuZWRcIiksXG5cdFx0XHRcdCdhcmlhLWxhYmVsJzogbG9jYWxpemUoJ3dlbGNvbWVQYWdlLnJlbW92ZVJlY2VudEFyaWFMYWJlbCcsIFwiUmVtb3ZlIHswfSBmcm9tIFJlY2VudGx5IE9wZW5lZFwiLCBuYW1lKSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgaGFuZGxlRGVsZXRlID0gYXN5bmMgKGU6IEV2ZW50KSA9PiB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0YXdhaXQgdGhpcy53b3Jrc3BhY2VzU2VydmljZS5yZW1vdmVSZWNlbnRseU9wZW5lZChbcmVzb3VyY2VVcmldKTtcblx0XHRcdH07XG5cdFx0XHRkZWxldGVCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBoYW5kbGVEZWxldGUpO1xuXHRcdFx0ZGVsZXRlQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBhc3luYyBlID0+IHtcblx0XHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0XHRpZiAoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlciB8fCBldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLlNwYWNlKSB7XG5cdFx0XHRcdFx0YXdhaXQgaGFuZGxlRGVsZXRlKGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGxpLmFwcGVuZENoaWxkKGRlbGV0ZUJ1dHRvbik7XG5cblx0XHRcdHJldHVybiBsaTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVjZW50bHlPcGVuZWRMaXN0ID0gdGhpcy5yZWNlbnRseU9wZW5lZExpc3QudmFsdWUgPSBuZXcgR2V0dGluZ1N0YXJ0ZWRJbmRleExpc3QoXG5cdFx0XHR7XG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncmVjZW50JywgXCJSZWNlbnRcIiksXG5cdFx0XHRcdGtsYXNzOiAncmVjZW50bHktb3BlbmVkJyxcblx0XHRcdFx0bGltaXQ6IDUsXG5cdFx0XHRcdGVtcHR5OiAkKCcuZW1wdHktcmVjZW50Jywge30sXG5cdFx0XHRcdFx0bG9jYWxpemUoJ25vUmVjZW50cycsIFwiWW91IGhhdmUgbm8gcmVjZW50IGZvbGRlcnMsXCIpLFxuXHRcdFx0XHRcdCQoJ2J1dHRvbi5idXR0b24tbGluaycsIHsgJ3gtZGlzcGF0Y2gnOiAnb3BlbkZvbGRlcicgfSwgbG9jYWxpemUoJ29wZW5Gb2xkZXInLCBcIm9wZW4gYSBmb2xkZXJcIikpLFxuXHRcdFx0XHRcdGxvY2FsaXplKCd0b1N0YXJ0JywgXCJ0byBzdGFydC5cIikpLFxuXG5cdFx0XHRcdG1vcmU6ICQoJy5tb3JlJywge30sXG5cdFx0XHRcdFx0JCgnYnV0dG9uLmJ1dHRvbi1saW5rJyxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0J3gtZGlzcGF0Y2gnOiAnc2hvd01vcmVSZWNlbnRzJyxcblx0XHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzaG93IG1vcmUgcmVjZW50cycsIFwiU2hvdyBBbGwgUmVjZW50IEZvbGRlcnMgezB9XCIsIHRoaXMuZ2V0S2V5YmluZGluZ0xhYmVsKE9wZW5SZWNlbnRBY3Rpb24uSUQpKVxuXHRcdFx0XHRcdFx0fSwgbG9jYWxpemUoJ3Nob3dBbGwnLCBcIk1vcmUuLi5cIikpKSxcblx0XHRcdFx0cmVuZGVyRWxlbWVudDogcmVuZGVyUmVjZW50LFxuXHRcdFx0XHRjb250ZXh0U2VydmljZTogdGhpcy5jb250ZXh0U2VydmljZVxuXHRcdFx0fSk7XG5cblx0XHRyZWNlbnRseU9wZW5lZExpc3Qub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5yZWdpc3RlckRpc3BhdGNoTGlzdGVuZXJzKCkpO1xuXHRcdHRoaXMucmVjZW50bHlPcGVuZWQudGhlbigoeyB3b3Jrc3BhY2VzIH0pID0+IHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZXNXaXRoSUQgPSB0aGlzLmZpbHRlclJlY2VudGx5T3BlbmVkKHdvcmtzcGFjZXMpO1xuXG5cdFx0XHRjb25zdCB1cGRhdGVFbnRyaWVzID0gKCkgPT4ge1xuXHRcdFx0XHRyZWNlbnRseU9wZW5lZExpc3Quc2V0RW50cmllcyh3b3Jrc3BhY2VzV2l0aElEKTtcblx0XHRcdH07XG5cblx0XHRcdHVwZGF0ZUVudHJpZXMoKTtcblx0XHRcdHJlY2VudGx5T3BlbmVkTGlzdC5yZWdpc3Rlcih0aGlzLmxhYmVsU2VydmljZS5vbkRpZENoYW5nZUZvcm1hdHRlcnMoKCkgPT4gdXBkYXRlRW50cmllcygpKSk7XG5cdFx0fSkuY2F0Y2gob25VbmV4cGVjdGVkRXJyb3IpO1xuXG5cdFx0cmV0dXJuIHJlY2VudGx5T3BlbmVkTGlzdDtcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVyUmVjZW50bHlPcGVuZWQod29ya3NwYWNlczogKElSZWNlbnRGb2xkZXIgfCBJUmVjZW50V29ya3NwYWNlKVtdKTogUmVjZW50RW50cnlbXSB7XG5cdFx0cmV0dXJuIHdvcmtzcGFjZXNcblx0XHRcdC5maWx0ZXIocmVjZW50ID0+ICF0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmlzQ3VycmVudFdvcmtzcGFjZShpc1JlY2VudFdvcmtzcGFjZShyZWNlbnQpID8gcmVjZW50LndvcmtzcGFjZSA6IHJlY2VudC5mb2xkZXJVcmkpKVxuXHRcdFx0Lm1hcChyZWNlbnQgPT4gKHsgLi4ucmVjZW50LCBpZDogaXNSZWNlbnRXb3Jrc3BhY2UocmVjZW50KSA/IHJlY2VudC53b3Jrc3BhY2UuaWQgOiByZWNlbnQuZm9sZGVyVXJpLnRvU3RyaW5nKCkgfSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoUmVjZW50bHlPcGVuZWQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnJlY2VudGx5T3BlbmVkTGlzdC52YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucmVjZW50bHlPcGVuZWQudGhlbigoeyB3b3Jrc3BhY2VzIH0pID0+IHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZXNXaXRoSUQgPSB0aGlzLmZpbHRlclJlY2VudGx5T3BlbmVkKHdvcmtzcGFjZXMpO1xuXHRcdFx0dGhpcy5yZWNlbnRseU9wZW5lZExpc3QudmFsdWU/LnNldEVudHJpZXMod29ya3NwYWNlc1dpdGhJRCk7XG5cdFx0fSkuY2F0Y2gob25VbmV4cGVjdGVkRXJyb3IpO1xuXHR9XG5cblx0cHJpdmF0ZSBidWlsZFN0YXJ0TGlzdCgpOiBHZXR0aW5nU3RhcnRlZEluZGV4TGlzdDxJV2VsY29tZVBhZ2VTdGFydEVudHJ5PiB7XG5cdFx0Y29uc3QgcmVuZGVyU3RhcnRFbnRyeSA9IChlbnRyeTogSVdlbGNvbWVQYWdlU3RhcnRFbnRyeSk6IEhUTUxFbGVtZW50ID0+XG5cdFx0XHQkKCdsaScsXG5cdFx0XHRcdHt9LCAkKCdidXR0b24uYnV0dG9uLWxpbmsnLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdCd4LWRpc3BhdGNoJzogJ3NlbGVjdFN0YXJ0RW50cnk6JyArIGVudHJ5LmlkLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGVudHJ5LmRlc2NyaXB0aW9uICsgJyAnICsgdGhpcy5nZXRLZXliaW5kaW5nTGFiZWwoZW50cnkuY29tbWFuZCksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR0aGlzLmljb25XaWRnZXRGb3IoZW50cnkpLFxuXHRcdFx0XHRcdCQoJ3NwYW4nLCB7fSwgZW50cnkudGl0bGUpKSk7XG5cblx0XHRjb25zdCBzdGFydExpc3QgPSB0aGlzLnN0YXJ0TGlzdC52YWx1ZSA9IG5ldyBHZXR0aW5nU3RhcnRlZEluZGV4TGlzdChcblx0XHRcdHtcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzdGFydCcsIFwiU3RhcnRcIiksXG5cdFx0XHRcdGtsYXNzOiAnc3RhcnQtY29udGFpbmVyJyxcblx0XHRcdFx0bGltaXQ6IDEwLFxuXHRcdFx0XHRyZW5kZXJFbGVtZW50OiByZW5kZXJTdGFydEVudHJ5LFxuXHRcdFx0XHRyYW5rRWxlbWVudDogZSA9PiAtZS5vcmRlcixcblx0XHRcdFx0Y29udGV4dFNlcnZpY2U6IHRoaXMuY29udGV4dFNlcnZpY2Vcblx0XHRcdH0pO1xuXG5cdFx0c3RhcnRMaXN0LnNldEVudHJpZXMocGFyc2VkU3RhcnRFbnRyaWVzKTtcblx0XHRzdGFydExpc3Qub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5yZWdpc3RlckRpc3BhdGNoTGlzdGVuZXJzKCkpO1xuXHRcdHJldHVybiBzdGFydExpc3Q7XG5cdH1cblxuXHRwcml2YXRlIGJ1aWxkR2V0dGluZ1N0YXJ0ZWRXYWxrdGhyb3VnaHNMaXN0KCk6IEdldHRpbmdTdGFydGVkSW5kZXhMaXN0PElSZXNvbHZlZFdhbGt0aHJvdWdoPiB7XG5cblx0XHRjb25zdCByZW5kZXJHZXR0dGluZ1N0YXJlZFdhbGt0aHJvdWdoID0gKGNhdGVnb3J5OiBJUmVzb2x2ZWRXYWxrdGhyb3VnaCk6IEhUTUxFbGVtZW50ID0+IHtcblxuXHRcdFx0Y29uc3QgcmVuZGVyTmV3QmFkZ2UgPSAoY2F0ZWdvcnkubmV3SXRlbXMgfHwgY2F0ZWdvcnkubmV3RW50cnkpICYmICFjYXRlZ29yeS5pc0ZlYXR1cmVkO1xuXHRcdFx0Y29uc3QgbmV3QmFkZ2UgPSAkKCcubmV3LWJhZGdlJywge30pO1xuXHRcdFx0aWYgKGNhdGVnb3J5Lm5ld0VudHJ5KSB7XG5cdFx0XHRcdHJlc2V0KG5ld0JhZGdlLCAkKCcubmV3LWNhdGVnb3J5Jywge30sIGxvY2FsaXplKCduZXcnLCBcIk5ld1wiKSkpO1xuXHRcdFx0fSBlbHNlIGlmIChjYXRlZ29yeS5uZXdJdGVtcykge1xuXHRcdFx0XHRyZXNldChuZXdCYWRnZSwgJCgnLm5ldy1pdGVtcycsIHt9LCBsb2NhbGl6ZSh7IGtleTogJ25ld0l0ZW1zJywgY29tbWVudDogWydTaG93biB3aGVuIGEgbGlzdCBvZiBpdGVtcyBoYXMgY2hhbmdlZCBiYXNlZCBvbiBhbiB1cGRhdGUgZnJvbSBhIHJlbW90ZSBzb3VyY2UnXSB9LCBcIlVwZGF0ZWRcIikpKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZmVhdHVyZWRCYWRnZSA9ICQoJy5mZWF0dXJlZC1iYWRnZScsIHt9KTtcblx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uQ29udGVudCA9ICQoJy5kZXNjcmlwdGlvbi1jb250ZW50Jywge30sKTtcblxuXHRcdFx0aWYgKGNhdGVnb3J5LmlzRmVhdHVyZWQgJiYgdGhpcy5zaG93RmVhdHVyZWRXYWxrdGhyb3VnaCkge1xuXHRcdFx0XHRyZXNldChmZWF0dXJlZEJhZGdlLCAkKCcuZmVhdHVyZWQnLCB7fSwgJCgnc3Bhbi5mZWF0dXJlZC1pY29uLmNvZGljb24uY29kaWNvbi1zdGFyLWZ1bGwnKSkpO1xuXHRcdFx0XHRyZXNldChkZXNjcmlwdGlvbkNvbnRlbnQsIC4uLnJlbmRlckxhYmVsV2l0aEljb25zKGNhdGVnb3J5LmRlc2NyaXB0aW9uKSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRpdGxlQ29udGVudCA9ICQoJ2gzLmNhdGVnb3J5LXRpdGxlLm1heC1saW5lcy0zJywgeyAneC1jYXRlZ29yeS10aXRsZS1mb3InOiBjYXRlZ29yeS5pZCB9KTtcblx0XHRcdHJlc2V0KHRpdGxlQ29udGVudCwgLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnMoY2F0ZWdvcnkudGl0bGUpKTtcblxuXHRcdFx0cmV0dXJuICQoJ2J1dHRvbi5nZXR0aW5nLXN0YXJ0ZWQtY2F0ZWdvcnknICsgKGNhdGVnb3J5LmlzRmVhdHVyZWQgJiYgdGhpcy5zaG93RmVhdHVyZWRXYWxrdGhyb3VnaCA/ICcuZmVhdHVyZWQnIDogJycpLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0J3gtZGlzcGF0Y2gnOiAnc2VsZWN0Q2F0ZWdvcnk6JyArIGNhdGVnb3J5LmlkLFxuXHRcdFx0XHRcdCd0aXRsZSc6IGNhdGVnb3J5LmRlc2NyaXB0aW9uXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZlYXR1cmVkQmFkZ2UsXG5cdFx0XHRcdCQoJy5tYWluLWNvbnRlbnQnLCB7fSxcblx0XHRcdFx0XHR0aGlzLmljb25XaWRnZXRGb3IoY2F0ZWdvcnkpLFxuXHRcdFx0XHRcdHRpdGxlQ29udGVudCxcblx0XHRcdFx0XHRyZW5kZXJOZXdCYWRnZSA/IG5ld0JhZGdlIDogJCgnLm5vLWJhZGdlJyksXG5cdFx0XHRcdFx0JCgnYS5jb2RpY29uLmNvZGljb24tY2xvc2UuaGlkZS1jYXRlZ29yeS1idXR0b24nLCB7XG5cdFx0XHRcdFx0XHQndGFiaW5kZXgnOiAwLFxuXHRcdFx0XHRcdFx0J3gtZGlzcGF0Y2gnOiAnaGlkZUNhdGVnb3J5OicgKyBjYXRlZ29yeS5pZCxcblx0XHRcdFx0XHRcdCd0aXRsZSc6IGxvY2FsaXplKCdjbG9zZScsIFwiSGlkZVwiKSxcblx0XHRcdFx0XHRcdCdyb2xlJzogJ2J1dHRvbicsXG5cdFx0XHRcdFx0XHQnYXJpYS1sYWJlbCc6IGxvY2FsaXplKCdjbG9zZUFyaWFMYWJlbCcsIFwiSGlkZVwiKSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0KSxcblx0XHRcdFx0ZGVzY3JpcHRpb25Db250ZW50LFxuXHRcdFx0XHQkKCcuY2F0ZWdvcnktcHJvZ3Jlc3MnLCB7ICd4LWRhdGEtY2F0ZWdvcnktaWQnOiBjYXRlZ29yeS5pZCwgfSxcblx0XHRcdFx0XHQkKCcucHJvZ3Jlc3MtYmFyLW91dGVyJywgeyAncm9sZSc6ICdwcm9ncmVzc2JhcicgfSxcblx0XHRcdFx0XHRcdCQoJy5wcm9ncmVzcy1iYXItaW5uZXInKSkpKTtcblx0XHR9O1xuXG5cblxuXHRcdGNvbnN0IHJhbmtXYWxrdGhyb3VnaCA9IChlOiBJUmVzb2x2ZWRXYWxrdGhyb3VnaCkgPT4ge1xuXHRcdFx0bGV0IHJhbms6IG51bWJlciB8IG51bGwgPSBlLm9yZGVyO1xuXG5cdFx0XHRpZiAoZS5pc0ZlYXR1cmVkKSB7IHJhbmsgKz0gNzsgfVxuXHRcdFx0aWYgKGUubmV3RW50cnkpIHsgcmFuayArPSAzOyB9XG5cdFx0XHRpZiAoZS5uZXdJdGVtcykgeyByYW5rICs9IDI7IH1cblx0XHRcdGlmIChlLnJlY2VuY3lCb251cykgeyByYW5rICs9IDQgKiBlLnJlY2VuY3lCb251czsgfVxuXG5cdFx0XHRpZiAodGhpcy5nZXRIaWRkZW5DYXRlZ29yaWVzKCkuaGFzKGUuaWQpKSB7IHJhbmsgPSBudWxsOyB9XG5cdFx0XHRyZXR1cm4gcmFuaztcblx0XHR9O1xuXG5cdFx0Y29uc3QgZ2V0dGluZ1N0YXJ0ZWRMaXN0ID0gdGhpcy5nZXR0aW5nU3RhcnRlZExpc3QudmFsdWUgPSBuZXcgR2V0dGluZ1N0YXJ0ZWRJbmRleExpc3QoXG5cdFx0XHR7XG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzJywgXCJXYWxrdGhyb3VnaHNcIiksXG5cdFx0XHRcdGtsYXNzOiAnZ2V0dGluZy1zdGFydGVkJyxcblx0XHRcdFx0bGltaXQ6IDUsXG5cdFx0XHRcdGZvb3RlcjogJCgnc3Bhbi5idXR0b24tbGluay5zZWUtYWxsLXdhbGt0aHJvdWdocycsIHsgJ3gtZGlzcGF0Y2gnOiAnc2VlQWxsV2Fsa3Rocm91Z2hzJywgJ3RhYmluZGV4JzogMCB9LCBsb2NhbGl6ZSgnc2hvd0FsbCcsIFwiTW9yZS4uLlwiKSksXG5cdFx0XHRcdHJlbmRlckVsZW1lbnQ6IHJlbmRlckdldHR0aW5nU3RhcmVkV2Fsa3Rocm91Z2gsXG5cdFx0XHRcdHJhbmtFbGVtZW50OiByYW5rV2Fsa3Rocm91Z2gsXG5cdFx0XHRcdGNvbnRleHRTZXJ2aWNlOiB0aGlzLmNvbnRleHRTZXJ2aWNlLFxuXHRcdFx0fSk7XG5cblx0XHRnZXR0aW5nU3RhcnRlZExpc3Qub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0Y29uc3QgaGlkZGVuID0gdGhpcy5nZXRIaWRkZW5DYXRlZ29yaWVzKCk7XG5cdFx0XHRjb25zdCBzb21lV2Fsa3Rocm91Z2hzSGlkZGVuID0gaGlkZGVuLnNpemUgfHwgZ2V0dGluZ1N0YXJ0ZWRMaXN0Lml0ZW1Db3VudCA8IHRoaXMuZ2V0dGluZ1N0YXJ0ZWRDYXRlZ29yaWVzLmZpbHRlcihjID0+IHRoaXMuY29udGV4dFNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhjLndoZW4pKS5sZW5ndGg7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdzb21lV2Fsa3Rocm91Z2hzSGlkZGVuJywgISFzb21lV2Fsa3Rocm91Z2hzSGlkZGVuKTtcblx0XHRcdHRoaXMucmVnaXN0ZXJEaXNwYXRjaExpc3RlbmVycygpO1xuXHRcdFx0YWxsV2Fsa3Rocm91Z2hzSGlkZGVuQ29udGV4dC5iaW5kVG8odGhpcy5jb250ZXh0U2VydmljZSkuc2V0KGdldHRpbmdTdGFydGVkTGlzdC5pdGVtQ291bnQgPT09IDApO1xuXHRcdFx0dGhpcy51cGRhdGVDYXRlZ29yeVByb2dyZXNzKCk7XG5cdFx0fSk7XG5cblx0XHRnZXR0aW5nU3RhcnRlZExpc3Quc2V0RW50cmllcyh0aGlzLmdldHRpbmdTdGFydGVkQ2F0ZWdvcmllcyk7XG5cdFx0YWxsV2Fsa3Rocm91Z2hzSGlkZGVuQ29udGV4dC5iaW5kVG8odGhpcy5jb250ZXh0U2VydmljZSkuc2V0KGdldHRpbmdTdGFydGVkTGlzdC5pdGVtQ291bnQgPT09IDApO1xuXG5cdFx0cmV0dXJuIGdldHRpbmdTdGFydGVkTGlzdDtcblx0fVxuXG5cdGxheW91dChzaXplOiBEaW1lbnNpb24pIHtcblx0XHR0aGlzLmRldGFpbHNTY3JvbGxiYXIudmFsdWU/LnNjYW5Eb21Ob2RlKCk7XG5cblx0XHR0aGlzLmNhdGVnb3JpZXNQYWdlU2Nyb2xsYmFyPy5zY2FuRG9tTm9kZSgpO1xuXHRcdHRoaXMuZGV0YWlsc1BhZ2VTY3JvbGxiYXI/LnNjYW5Eb21Ob2RlKCk7XG5cblx0XHR0aGlzLnN0YXJ0TGlzdC52YWx1ZT8ubGF5b3V0KHNpemUpO1xuXHRcdHRoaXMuZ2V0dGluZ1N0YXJ0ZWRMaXN0LnZhbHVlPy5sYXlvdXQoc2l6ZSk7XG5cdFx0dGhpcy5yZWNlbnRseU9wZW5lZExpc3QudmFsdWU/LmxheW91dChzaXplKTtcblxuXHRcdGlmICh0aGlzLmVkaXRvcklucHV0Py5zZWxlY3RlZFN0ZXAgJiYgdGhpcy5jdXJyZW50TWVkaWFUeXBlKSB7XG5cdFx0XHR0aGlzLm1lZGlhRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLmJ1aWxkTWVkaWFDb21wb25lbnQodGhpcy5lZGl0b3JJbnB1dC5zZWxlY3RlZFN0ZXApO1xuXHRcdH1cblxuXHRcdHRoaXMubGF5b3V0TWFya2Rvd24/LigpO1xuXG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGVpZ2h0LWNvbnN0cmFpbmVkJywgc2l6ZS5oZWlnaHQgPD0gNjAwKTtcblx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCd3aWR0aC1jb25zdHJhaW5lZCcsIHNpemUud2lkdGggPD0gNDAwKTtcblx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCd3aWR0aC1zZW1pLWNvbnN0cmFpbmVkJywgc2l6ZS53aWR0aCA8PSA5NTApO1xuXG5cdFx0dGhpcy5jYXRlZ29yaWVzUGFnZVNjcm9sbGJhcj8uc2NhbkRvbU5vZGUoKTtcblx0XHR0aGlzLmRldGFpbHNQYWdlU2Nyb2xsYmFyPy5zY2FuRG9tTm9kZSgpO1xuXHRcdHRoaXMuZGV0YWlsc1Njcm9sbGJhci52YWx1ZT8uc2NhbkRvbU5vZGUoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ2F0ZWdvcnlQcm9ncmVzcygpIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHR0aGlzLndpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuY2F0ZWdvcnktcHJvZ3Jlc3MnKS5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuXHRcdFx0Y29uc3QgY2F0ZWdvcnlJRCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCd4LWRhdGEtY2F0ZWdvcnktaWQnKTtcblx0XHRcdGNvbnN0IGNhdGVnb3J5ID0gdGhpcy5nZXR0aW5nU3RhcnRlZENhdGVnb3JpZXMuZmluZChjID0+IGMuaWQgPT09IGNhdGVnb3J5SUQpO1xuXHRcdFx0aWYgKCFjYXRlZ29yeSkgeyByZXR1cm47IH1cblxuXHRcdFx0Y29uc3Qgc3RhdHMgPSB0aGlzLmdldFdhbGt0aHJvdWdoQ29tcGxldGlvblN0YXRzKGNhdGVnb3J5KTtcblxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCBiYXIgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZChlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wcm9ncmVzcy1iYXItaW5uZXInKSkgYXMgSFRNTERpdkVsZW1lbnQ7XG5cdFx0XHRiYXIuc2V0QXR0cmlidXRlKCdhcmlhLXZhbHVlbWluJywgJzAnKTtcblx0XHRcdGJhci5zZXRBdHRyaWJ1dGUoJ2FyaWEtdmFsdWVub3cnLCAnJyArIHN0YXRzLnN0ZXBzQ29tcGxldGUpO1xuXHRcdFx0YmFyLnNldEF0dHJpYnV0ZSgnYXJpYS12YWx1ZW1heCcsICcnICsgc3RhdHMuc3RlcHNUb3RhbCk7XG5cdFx0XHRjb25zdCBwcm9ncmVzcyA9IChzdGF0cy5zdGVwc0NvbXBsZXRlIC8gc3RhdHMuc3RlcHNUb3RhbCkgKiAxMDA7XG5cdFx0XHRiYXIuc3R5bGUud2lkdGggPSBgJHtwcm9ncmVzc30lYDtcblxuXHRcdFx0KGVsZW1lbnQucGFyZW50RWxlbWVudCBhcyBIVE1MRWxlbWVudCkuY2xhc3NMaXN0LnRvZ2dsZSgnbm8tcHJvZ3Jlc3MnLCBzdGF0cy5zdGVwc0NvbXBsZXRlID09PSAwKTtcblxuXHRcdFx0aWYgKHN0YXRzLnN0ZXBzVG90YWwgPT09IHN0YXRzLnN0ZXBzQ29tcGxldGUpIHtcblx0XHRcdFx0YmFyLnRpdGxlID0gbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmFsbFN0ZXBzQ29tcGxldGUnLCBcIkFsbCB7MH0gc3RlcHMgY29tcGxldGUhXCIsIHN0YXRzLnN0ZXBzQ29tcGxldGUpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGJhci50aXRsZSA9IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5zb21lU3RlcHNDb21wbGV0ZScsIFwiezB9IG9mIHsxfSBzdGVwcyBjb21wbGV0ZVwiLCBzdGF0cy5zdGVwc0NvbXBsZXRlLCBzdGF0cy5zdGVwc1RvdGFsKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2Nyb2xsVG9DYXRlZ29yeShjYXRlZ29yeUlEOiBzdHJpbmcsIHN0ZXBJZD86IHN0cmluZykge1xuXG5cdFx0aWYgKCF0aGlzLmdldHRpbmdTdGFydGVkQ2F0ZWdvcmllcy5zb21lKGMgPT4gYy5pZCA9PT0gY2F0ZWdvcnlJRCkpIHtcblx0XHRcdHRoaXMuZ2V0dGluZ1N0YXJ0ZWRDYXRlZ29yaWVzID0gdGhpcy5nZXR0aW5nU3RhcnRlZFNlcnZpY2UuZ2V0V2Fsa3Rocm91Z2hzKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3VyQ2F0ZWdvcnkgPSB0aGlzLmdldHRpbmdTdGFydGVkQ2F0ZWdvcmllcy5maW5kKGMgPT4gYy5pZCA9PT0gY2F0ZWdvcnlJRCk7XG5cdFx0aWYgKCFvdXJDYXRlZ29yeSkge1xuXHRcdFx0dGhyb3cgRXJyb3IoJ0NvdWxkIG5vdCBmaW5kIGNhdGVnb3J5IHdpdGggSUQ6ICcgKyBjYXRlZ29yeUlEKTtcblx0XHR9XG5cblx0XHR0aGlzLmluUHJvZ3Jlc3NTY3JvbGwgPSB0aGlzLmluUHJvZ3Jlc3NTY3JvbGwudGhlbihhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuZWRpdG9ySW5wdXQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cmVzZXQodGhpcy5zdGVwc0NvbnRlbnQpO1xuXHRcdFx0dGhpcy5lZGl0b3JJbnB1dC5zZWxlY3RlZENhdGVnb3J5ID0gY2F0ZWdvcnlJRDtcblx0XHRcdHRoaXMuZWRpdG9ySW5wdXQuc2VsZWN0ZWRTdGVwID0gc3RlcElkO1xuXHRcdFx0dGhpcy5lZGl0b3JJbnB1dC53YWxrdGhyb3VnaFBhZ2VUaXRsZSA9IG91ckNhdGVnb3J5LndhbGt0aHJvdWdoUGFnZVRpdGxlO1xuXHRcdFx0dGhpcy5jdXJyZW50V2Fsa3Rocm91Z2ggPSBvdXJDYXRlZ29yeTtcblx0XHRcdHRoaXMuYnVpbGRDYXRlZ29yeVNsaWRlKGNhdGVnb3J5SUQsIHN0ZXBJZCk7XG5cdFx0XHR0aGlzLnNldFNsaWRlKCdkZXRhaWxzJyk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGljb25XaWRnZXRGb3IoY2F0ZWdvcnk6IElSZXNvbHZlZFdhbGt0aHJvdWdoIHwgeyBpY29uOiB7IHR5cGU6ICdpY29uJzsgaWNvbjogVGhlbWVJY29uIH0gfSkge1xuXHRcdGNvbnN0IHdpZGdldCA9IGNhdGVnb3J5Lmljb24udHlwZSA9PT0gJ2ljb24nID8gJChUaGVtZUljb24uYXNDU1NTZWxlY3RvcihjYXRlZ29yeS5pY29uLmljb24pKSA6ICQoJ2ltZy5jYXRlZ29yeS1pY29uJywgeyBzcmM6IGNhdGVnb3J5Lmljb24ucGF0aCB9KTtcblx0XHR3aWRnZXQuY2xhc3NMaXN0LmFkZCgnaWNvbi13aWRnZXQnKTtcblx0XHRyZXR1cm4gd2lkZ2V0O1xuXHR9XG5cblx0cHJpdmF0ZSBmb2N1c1NpZGVFZGl0b3JHcm91cCgpIHtcblx0XHRjb25zdCBmdWxsU2l6ZSA9IHRoaXMuZ3JvdXBzU2VydmljZS5nZXRQYXJ0KHRoaXMuZ3JvdXApLmNvbnRlbnREaW1lbnNpb247XG5cdFx0aWYgKCFmdWxsU2l6ZSB8fCBmdWxsU2l6ZS53aWR0aCA8PSA3MDAgfHwgdGhpcy5jb250YWluZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCd3aWR0aC1jb25zdHJhaW5lZCcpIHx8IHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygnd2lkdGgtc2VtaS1jb25zdHJhaW5lZCcpKSB7IHJldHVybjsgfVxuXHRcdGlmICh0aGlzLmdyb3Vwc1NlcnZpY2UuY291bnQgPT09IDEpIHtcblx0XHRcdGNvbnN0IGVkaXRvckdyb3VwU3BsaXREaXJlY3Rpb24gPSBwcmVmZXJyZWRTaWRlQnlTaWRlR3JvdXBEaXJlY3Rpb24odGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCBzaWRlR3JvdXAgPSB0aGlzLmdyb3Vwc1NlcnZpY2UuYWRkR3JvdXAodGhpcy5ncm91cHNTZXJ2aWNlLmdyb3Vwc1swXSwgZWRpdG9yR3JvdXBTcGxpdERpcmVjdGlvbik7XG5cdFx0XHR0aGlzLmdyb3Vwc1NlcnZpY2UuYWN0aXZhdGVHcm91cChzaWRlR3JvdXApO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vbkdldHRpbmdTdGFydGVkR3JvdXAgPSB0aGlzLmdyb3Vwc1NlcnZpY2UuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKS5maW5kKGdyb3VwID0+ICEoZ3JvdXAuYWN0aXZlRWRpdG9yIGluc3RhbmNlb2YgR2V0dGluZ1N0YXJ0ZWRJbnB1dCkpO1xuXHRcdGlmIChub25HZXR0aW5nU3RhcnRlZEdyb3VwKSB7XG5cdFx0XHR0aGlzLmdyb3Vwc1NlcnZpY2UuYWN0aXZhdGVHcm91cChub25HZXR0aW5nU3RhcnRlZEdyb3VwKTtcblx0XHRcdG5vbkdldHRpbmdTdGFydGVkR3JvdXAuZm9jdXMoKTtcblx0XHR9XG5cdH1cblx0cHJpdmF0ZSBydW5TdGVwQ29tbWFuZChocmVmOiBzdHJpbmcpIHtcblxuXHRcdGNvbnN0IGlzQ29tbWFuZCA9IGhyZWYuc3RhcnRzV2l0aCgnY29tbWFuZDonKTtcblx0XHRjb25zdCB0b1NpZGUgPSBocmVmLnN0YXJ0c1dpdGgoJ2NvbW1hbmQ6dG9TaWRlOicpO1xuXHRcdGNvbnN0IGNvbW1hbmQgPSBocmVmLnJlcGxhY2UoL2NvbW1hbmQ6KHRvU2lkZTopPy8sICdjb21tYW5kOicpO1xuXG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8R2V0dGluZ1N0YXJ0ZWRBY3Rpb25FdmVudCwgR2V0dGluZ1N0YXJ0ZWRBY3Rpb25DbGFzc2lmaWNhdGlvbj4oJ2dldHRpbmdTdGFydGVkLkFjdGlvbkV4ZWN1dGVkJywgeyBjb21tYW5kOiAncnVuU3RlcEFjdGlvbicsIGFyZ3VtZW50OiBocmVmLCB3YWxrdGhyb3VnaElkOiB0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaD8uaWQgfSk7XG5cblx0XHRpZiAodG9TaWRlKSB7XG5cdFx0XHR0aGlzLmZvY3VzU2lkZUVkaXRvckdyb3VwKCk7XG5cdFx0fVxuXHRcdGlmIChpc0NvbW1hbmQpIHtcblx0XHRcdGNvbnN0IGNvbW1hbmRVUkkgPSBVUkkucGFyc2UoY29tbWFuZCk7XG5cblx0XHRcdC8vIGV4ZWN1dGUgYXMgY29tbWFuZFxuXHRcdFx0bGV0IGFyZ3MgPSBbXTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGFyZ3MgPSBwYXJzZShkZWNvZGVVUklDb21wb25lbnQoY29tbWFuZFVSSS5xdWVyeSkpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZSBhbmQgcmV0cnlcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhcmdzID0gcGFyc2UoY29tbWFuZFVSSS5xdWVyeSk7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdC8vIGlnbm9yZSBlcnJvclxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoYXJncykpIHtcblx0XHRcdFx0YXJncyA9IFthcmdzXTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgYSBzdGVwIGlzIHJlcXVlc3RpbmcgdGhlIE9wZW5Gb2xkZXIgYWN0aW9uIHRvIGJlIGV4ZWN1dGVkIGluIGFuIGVtcHR5IHdvcmtzcGFjZS4uLlxuXHRcdFx0aWYgKChjb21tYW5kVVJJLnBhdGggPT09IE9wZW5GaWxlRm9sZGVyQWN0aW9uLklELnRvU3RyaW5nKCkgfHxcblx0XHRcdFx0Y29tbWFuZFVSSS5wYXRoID09PSBPcGVuRm9sZGVyQWN0aW9uLklELnRvU3RyaW5nKCkpICYmXG5cdFx0XHRcdHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5sZW5ndGggPT09IDApIHtcblxuXHRcdFx0XHRjb25zdCBzZWxlY3RlZFN0ZXBJbmRleCA9IHRoaXMuY3VycmVudFdhbGt0aHJvdWdoPy5zdGVwcy5maW5kSW5kZXgoc3RlcCA9PiBzdGVwLmlkID09PSB0aGlzLmVkaXRvcklucHV0Py5zZWxlY3RlZFN0ZXApO1xuXG5cdFx0XHRcdC8vIGFuZCB0aGVyZSBhcmUgYSBmZXcgbW9yZSBzdGVwcyBhZnRlciB0aGlzIHN0ZXAgd2hpY2ggYXJlIHlldCB0byBiZSBjb21wbGV0ZWQuLi5cblx0XHRcdFx0aWYgKHNlbGVjdGVkU3RlcEluZGV4ICE9PSB1bmRlZmluZWQgJiZcblx0XHRcdFx0XHRzZWxlY3RlZFN0ZXBJbmRleCA+IC0xICYmXG5cdFx0XHRcdFx0dGhpcy5jdXJyZW50V2Fsa3Rocm91Z2g/LnN0ZXBzLnNsaWNlKHNlbGVjdGVkU3RlcEluZGV4ICsgMSkuc29tZShzdGVwID0+ICFzdGVwLmRvbmUpKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdG9yZURhdGE6IFJlc3RvcmVXYWxrdGhyb3VnaHNDb25maWd1cmF0aW9uVmFsdWUgPSB7IGZvbGRlcjogVU5LTk9XTl9FTVBUWV9XSU5ET1dfV09SS1NQQUNFLmlkLCBjYXRlZ29yeTogdGhpcy5lZGl0b3JJbnB1dD8uc2VsZWN0ZWRDYXRlZ29yeSwgc3RlcDogdGhpcy5lZGl0b3JJbnB1dD8uc2VsZWN0ZWRTdGVwIH07XG5cblx0XHRcdFx0XHQvLyBzYXZlIHN0YXRlIHRvIHJlc3RvcmUgYWZ0ZXIgcmVsb2FkXG5cdFx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShcblx0XHRcdFx0XHRcdHJlc3RvcmVXYWxrdGhyb3VnaHNDb25maWd1cmF0aW9uS2V5LFxuXHRcdFx0XHRcdFx0SlNPTi5zdHJpbmdpZnkocmVzdG9yZURhdGEpLFxuXHRcdFx0XHRcdFx0U3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjb21tYW5kVVJJLnBhdGgsIC4uLmFyZ3MpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0Y29uc3QgdG9PcGVuID0gKHJlc3VsdCBhcyB7IG9wZW5Gb2xkZXI/OiBVUkkgfSk/Lm9wZW5Gb2xkZXI7XG5cdFx0XHRcdGlmICh0b09wZW4pIHtcblx0XHRcdFx0XHRpZiAoIVVSSS5pc1VyaSh0b09wZW4pKSB7XG5cdFx0XHRcdFx0XHRjb25zb2xlLndhcm4oJ1dhcm46IFJ1bm5pbmcgd2Fsa3Rocm91Z2ggY29tbWFuZCcsIGhyZWYsICd5aWVsZGVkIG5vbi1VUkkgYG9wZW5Gb2xkZXJgIHJlc3VsdCcsIHRvT3BlbiwgJy4gSXQgd2lsbCBiZSBkaXNyZWdhcmRlZC4nKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgcmVzdG9yZURhdGE6IFJlc3RvcmVXYWxrdGhyb3VnaHNDb25maWd1cmF0aW9uVmFsdWUgPSB7IGZvbGRlcjogdG9PcGVuLnRvU3RyaW5nKCksIGNhdGVnb3J5OiB0aGlzLmVkaXRvcklucHV0Py5zZWxlY3RlZENhdGVnb3J5LCBzdGVwOiB0aGlzLmVkaXRvcklucHV0Py5zZWxlY3RlZFN0ZXAgfTtcblx0XHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFxuXHRcdFx0XHRcdFx0cmVzdG9yZVdhbGt0aHJvdWdoc0NvbmZpZ3VyYXRpb25LZXksXG5cdFx0XHRcdFx0XHRKU09OLnN0cmluZ2lmeShyZXN0b3JlRGF0YSksXG5cdFx0XHRcdFx0XHRTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdFx0XHR0aGlzLmhvc3RTZXJ2aWNlLm9wZW5XaW5kb3coW3sgZm9sZGVyVXJpOiB0b09wZW4gfV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oY29tbWFuZCwgeyBhbGxvd0NvbW1hbmRzOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdGlmICghaXNDb21tYW5kICYmIChocmVmLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykgfHwgaHJlZi5zdGFydHNXaXRoKCdodHRwOi8vJykpKSB7XG5cdFx0XHR0aGlzLmdldHRpbmdTdGFydGVkU2VydmljZS5wcm9ncmVzc0J5RXZlbnQoJ29uTGluazonICsgaHJlZik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBidWlsZE1hcmtkb3duRGVzY3JpcHRpb24oY29udGFpbmVyOiBIVE1MRWxlbWVudCwgdGV4dDogTGlua2VkVGV4dFtdKSB7XG5cdFx0d2hpbGUgKGNvbnRhaW5lci5maXJzdENoaWxkKSB7IGNvbnRhaW5lci5maXJzdENoaWxkLnJlbW92ZSgpOyB9XG5cblx0XHRmb3IgKGNvbnN0IGxpbmtlZFRleHQgb2YgdGV4dCkge1xuXHRcdFx0aWYgKGxpbmtlZFRleHQubm9kZXMubGVuZ3RoID09PSAxICYmIHR5cGVvZiBsaW5rZWRUZXh0Lm5vZGVzWzBdICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRjb25zdCBub2RlID0gbGlua2VkVGV4dC5ub2Rlc1swXTtcblx0XHRcdFx0Y29uc3QgYnV0dG9uQ29udGFpbmVyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmJ1dHRvbi1jb250YWluZXInKSk7XG5cdFx0XHRcdGNvbnN0IGJ1dHRvbiA9IG5ldyBCdXR0b24oYnV0dG9uQ29udGFpbmVyLCB7IHRpdGxlOiBub2RlLnRpdGxlLCBzdXBwb3J0SWNvbnM6IHRydWUsIC4uLmRlZmF1bHRCdXR0b25TdHlsZXMgfSk7XG5cblx0XHRcdFx0Y29uc3QgaXNDb21tYW5kID0gbm9kZS5ocmVmLnN0YXJ0c1dpdGgoJ2NvbW1hbmQ6Jyk7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmQgPSBub2RlLmhyZWYucmVwbGFjZSgvY29tbWFuZDoodG9TaWRlOik/LywgJ2NvbW1hbmQ6Jyk7XG5cblx0XHRcdFx0YnV0dG9uLmxhYmVsID0gbm9kZS5sYWJlbDtcblx0XHRcdFx0YnV0dG9uLm9uRGlkQ2xpY2soZSA9PiB7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0dGhpcy5ydW5TdGVwQ29tbWFuZChub2RlLmhyZWYpO1xuXHRcdFx0XHR9LCBudWxsLCB0aGlzLmRldGFpbHNQYWdlRGlzcG9zYWJsZXMpO1xuXG5cdFx0XHRcdGlmIChpc0NvbW1hbmQpIHtcblx0XHRcdFx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5nZXRLZXlCaW5kaW5nKGNvbW1hbmQpO1xuXHRcdFx0XHRcdGlmIChrZXliaW5kaW5nKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzaG9ydGN1dE1lc3NhZ2UgPSAkKCdzcGFuLnNob3J0Y3V0LW1lc3NhZ2UnLCB7fSwgbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmtleWJvYXJkVGlwJywgJ1RpcDogVXNlIGtleWJvYXJkIHNob3J0Y3V0ICcpKTtcblx0XHRcdFx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChzaG9ydGN1dE1lc3NhZ2UpO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGFiZWwgPSBuZXcgS2V5YmluZGluZ0xhYmVsKHNob3J0Y3V0TWVzc2FnZSwgT1MsIHsgLi4uZGVmYXVsdEtleWJpbmRpbmdMYWJlbFN0eWxlcyB9KTtcblx0XHRcdFx0XHRcdGxhYmVsLnNldChrZXliaW5kaW5nKTtcblx0XHRcdFx0XHRcdHRoaXMuZGV0YWlsc1BhZ2VEaXNwb3NhYmxlcy5hZGQobGFiZWwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuZGV0YWlsc1BhZ2VEaXNwb3NhYmxlcy5hZGQoYnV0dG9uKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHAgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdwJykpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IG5vZGUgb2YgbGlua2VkVGV4dC5ub2Rlcykge1xuXHRcdFx0XHRcdGlmICh0eXBlb2Ygbm9kZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxhYmVsV2l0aEljb24gPSByZW5kZXJMYWJlbFdpdGhJY29ucyhub2RlKTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiBsYWJlbFdpdGhJY29uKSB7XG5cdFx0XHRcdFx0XHRcdGlmICh0eXBlb2YgZWxlbWVudCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdFx0XHRwLmFwcGVuZENoaWxkKHJlbmRlckZvcm1hdHRlZFRleHQoZWxlbWVudCwgeyByZW5kZXJDb2RlU2VnbWVudHM6IHRydWUgfSwgJCgnc3BhbicpKSk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0cC5hcHBlbmRDaGlsZChlbGVtZW50KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zdCBub2RlV2l0aFRpdGxlOiBJTGluayA9IG1hdGNoZXNTY2hlbWUobm9kZS5ocmVmLCBTY2hlbWFzLmh0dHApIHx8IG1hdGNoZXNTY2hlbWUobm9kZS5ocmVmLCBTY2hlbWFzLmh0dHBzKSA/IHsgLi4ubm9kZSwgdGl0bGU6IG5vZGUuaHJlZiB9IDogbm9kZTtcblx0XHRcdFx0XHRcdGNvbnN0IGxpbmsgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExpbmssIHAsIG5vZGVXaXRoVGl0bGUsIHsgb3BlbmVyOiAoaHJlZikgPT4gdGhpcy5ydW5TdGVwQ29tbWFuZChocmVmKSB9KTtcblx0XHRcdFx0XHRcdHRoaXMuZGV0YWlsc1BhZ2VEaXNwb3NhYmxlcy5hZGQobGluayk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjb250YWluZXI7XG5cdH1cblxuXHRvdmVycmlkZSBjbGVhcklucHV0KCkge1xuXHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0c3VwZXIuY2xlYXJJbnB1dCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBidWlsZENhdGVnb3J5U2xpZGUoY2F0ZWdvcnlJRDogc3RyaW5nLCBzZWxlY3RlZFN0ZXA/OiBzdHJpbmcsIHByZXNlcnZlRm9jdXM/OiBib29sZWFuKSB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cblx0XHR0aGlzLmV4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCkudGhlbigoKSA9PiB7XG5cdFx0XHQvLyBSZW1vdmUgaW50ZXJuYWwgZXh0ZW5zaW9uIGlkIHNwZWNpZmllciBmcm9tIGV4cG9zZWQgaWQnc1xuXHRcdFx0dGhpcy5leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudChgb25XYWxrdGhyb3VnaDoke2NhdGVnb3J5SUQucmVwbGFjZSgvW14jXSsjLywgJycpfWApO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5kZXRhaWxzUGFnZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5tZWRpYURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRjb25zdCBjYXRlZ29yeSA9IHRoaXMuZ2V0dGluZ1N0YXJ0ZWRDYXRlZ29yaWVzLmZpbmQoY2F0ZWdvcnkgPT4gY2F0ZWdvcnkuaWQgPT09IGNhdGVnb3J5SUQpO1xuXHRcdGlmICghY2F0ZWdvcnkpIHtcblx0XHRcdHRocm93IEVycm9yKCdjb3VsZCBub3QgZmluZCBjYXRlZ29yeSB3aXRoIElEICcgKyBjYXRlZ29yeUlEKTtcblx0XHR9XG5cblx0XHRjb25zdCBkZXNjcmlwdGlvbkNvbnRhaW5lciA9ICQoJy5jYXRlZ29yeS1kZXNjcmlwdGlvbi5kZXNjcmlwdGlvbi5tYXgtbGluZXMtMycsIHsgJ3gtY2F0ZWdvcnktZGVzY3JpcHRpb24tZm9yJzogY2F0ZWdvcnkuaWQgfSk7XG5cdFx0dGhpcy5idWlsZE1hcmtkb3duRGVzY3JpcHRpb24oZGVzY3JpcHRpb25Db250YWluZXIsIHBhcnNlRGVzY3JpcHRpb24oY2F0ZWdvcnkuZGVzY3JpcHRpb24pKTtcblxuXHRcdGNvbnN0IGNhdGVnb3J5RGVzY3JpcHRvckNvbXBvbmVudCA9XG5cdFx0XHQkKCcuZ2V0dGluZy1zdGFydGVkLWNhdGVnb3J5Jyxcblx0XHRcdFx0e30sXG5cdFx0XHRcdCQoJy5jYXRlZ29yeS1kZXNjcmlwdGlvbi1jb250YWluZXInLCB7fSxcblx0XHRcdFx0XHQkKCdoMi5jYXRlZ29yeS10aXRsZS5tYXgtbGluZXMtMycsIHsgJ3gtY2F0ZWdvcnktdGl0bGUtZm9yJzogY2F0ZWdvcnkuaWQgfSwgLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnMoY2F0ZWdvcnkudGl0bGUpKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbkNvbnRhaW5lcikpO1xuXG5cdFx0Y29uc3Qgc3RlcExpc3RDb250YWluZXIgPSAkKCcuc3RlcC1saXN0LWNvbnRhaW5lcicpO1xuXG5cdFx0dGhpcy5kZXRhaWxzUGFnZURpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoc3RlcExpc3RDb250YWluZXIsICdrZXlkb3duJywgKGUpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGNvbnN0IGN1cnJlbnRTdGVwSW5kZXggPSAoKSA9PlxuXHRcdFx0XHRjYXRlZ29yeS5zdGVwcy5maW5kSW5kZXgoZSA9PiBlLmlkID09PSB0aGlzLmVkaXRvcklucHV0Py5zZWxlY3RlZFN0ZXApO1xuXG5cdFx0XHRpZiAoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5VcEFycm93KSB7XG5cdFx0XHRcdGNvbnN0IHRvRXhwYW5kID0gY2F0ZWdvcnkuc3RlcHMuZmlsdGVyKChzdGVwLCBpbmRleCkgPT4gaW5kZXggPCBjdXJyZW50U3RlcEluZGV4KCkgJiYgdGhpcy5jb250ZXh0U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHN0ZXAud2hlbikpO1xuXHRcdFx0XHRpZiAodG9FeHBhbmQubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy5zZWxlY3RTdGVwKHRvRXhwYW5kW3RvRXhwYW5kLmxlbmd0aCAtIDFdLmlkLCBmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkRvd25BcnJvdykge1xuXHRcdFx0XHRjb25zdCB0b0V4cGFuZCA9IGNhdGVnb3J5LnN0ZXBzLmZpbmQoKHN0ZXAsIGluZGV4KSA9PiBpbmRleCA+IGN1cnJlbnRTdGVwSW5kZXgoKSAmJiB0aGlzLmNvbnRleHRTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoc3RlcC53aGVuKSk7XG5cdFx0XHRcdGlmICh0b0V4cGFuZCkge1xuXHRcdFx0XHRcdHRoaXMuc2VsZWN0U3RlcCh0b0V4cGFuZC5pZCwgZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bGV0IHJlbmRlcmVkU3RlcHM6IElSZXNvbHZlZFdhbGt0aHJvdWdoU3RlcFtdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgY29udGV4dEtleXNUb1dhdGNoID0gbmV3IFNldChjYXRlZ29yeS5zdGVwcy5mbGF0TWFwKHN0ZXAgPT4gc3RlcC53aGVuLmtleXMoKSkpO1xuXG5cdFx0Y29uc3QgYnVpbGRTdGVwTGlzdCA9ICgpID0+IHtcblxuXHRcdFx0Y2F0ZWdvcnkuc3RlcHMuc29ydCgoYSwgYikgPT4gYS5vcmRlciAtIGIub3JkZXIpO1xuXHRcdFx0Y29uc3QgdG9SZW5kZXIgPSBjYXRlZ29yeS5zdGVwc1xuXHRcdFx0XHQuZmlsdGVyKHN0ZXAgPT4gdGhpcy5jb250ZXh0U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHN0ZXAud2hlbikpO1xuXG5cdFx0XHRpZiAoZXF1YWxzKHJlbmRlcmVkU3RlcHMsIHRvUmVuZGVyLCAoYSwgYikgPT4gYS5pZCA9PT0gYi5pZCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRyZW5kZXJlZFN0ZXBzID0gdG9SZW5kZXI7XG5cblx0XHRcdHJlc2V0KHN0ZXBMaXN0Q29udGFpbmVyLCAuLi5yZW5kZXJlZFN0ZXBzXG5cdFx0XHRcdC5tYXAoc3RlcCA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgY29kaWNvbiA9ICQoJy5jb2RpY29uJyArIChzdGVwLmRvbmUgPyAnLmNvbXBsZXRlJyArIFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGdldHRpbmdTdGFydGVkQ2hlY2tlZENvZGljb24pIDogVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoZ2V0dGluZ1N0YXJ0ZWRVbmNoZWNrZWRDb2RpY29uKSksXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdCdkYXRhLWRvbmUtc3RlcC1pZCc6IHN0ZXAuaWQsXG5cdFx0XHRcdFx0XHRcdCd4LWRpc3BhdGNoJzogJ3RvZ2dsZVN0ZXBDb21wbGV0aW9uOicgKyBzdGVwLmlkLFxuXHRcdFx0XHRcdFx0XHQncm9sZSc6ICdjaGVja2JveCcsXG5cdFx0XHRcdFx0XHRcdCdhcmlhLWNoZWNrZWQnOiBzdGVwLmRvbmUgPyAndHJ1ZScgOiAnZmFsc2UnLFxuXHRcdFx0XHRcdFx0XHQnYXJpYS1sYWJlbCc6IHN0ZXAuZG9uZVxuXHRcdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ3N0ZXBEb25lJywgXCJ7MH06IENvbXBsZXRlZFwiLCBzdGVwLnRpdGxlKVxuXHRcdFx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ3N0ZXBOb3REb25lJywgXCJ7MH06IE5vdCBjb21wbGV0ZWRcIiwgc3RlcC50aXRsZSksXG5cdFx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGNvbnN0IGNvbnRhaW5lciA9ICQoJy5zdGVwLWRlc2NyaXB0aW9uLWNvbnRhaW5lcicsIHsgJ3gtc3RlcC1kZXNjcmlwdGlvbi1mb3InOiBzdGVwLmlkIH0pO1xuXHRcdFx0XHRcdHRoaXMuYnVpbGRNYXJrZG93bkRlc2NyaXB0aW9uKGNvbnRhaW5lciwgc3RlcC5kZXNjcmlwdGlvbik7XG5cblx0XHRcdFx0XHRjb25zdCBzdGVwVGl0bGUgPSAkKCdoMy5zdGVwLXRpdGxlLm1heC1saW5lcy0zJywgeyAneC1zdGVwLXRpdGxlLWZvcic6IHN0ZXAuaWQgfSk7XG5cdFx0XHRcdFx0cmVzZXQoc3RlcFRpdGxlLCAuLi5yZW5kZXJMYWJlbFdpdGhJY29ucyhzdGVwLnRpdGxlKSk7XG5cblx0XHRcdFx0XHRjb25zdCBzdGVwRGVzY3JpcHRpb24gPSAkKCcuc3RlcC1jb250YWluZXInLCB7fSxcblx0XHRcdFx0XHRcdHN0ZXBUaXRsZSxcblx0XHRcdFx0XHRcdGNvbnRhaW5lcixcblx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0aWYgKHN0ZXAubWVkaWEudHlwZSA9PT0gJ2ltYWdlJykge1xuXHRcdFx0XHRcdFx0c3RlcERlc2NyaXB0aW9uLmFwcGVuZENoaWxkKFxuXHRcdFx0XHRcdFx0XHQkKCcuaW1hZ2UtZGVzY3JpcHRpb24nLCB7ICdhcmlhLWxhYmVsJzogbG9jYWxpemUoJ2ltYWdlU2hvd2luZycsIFwiSW1hZ2Ugc2hvd2luZyB7MH1cIiwgc3RlcC5tZWRpYS5hbHRUZXh0KSB9KSxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChzdGVwLm1lZGlhLnR5cGUgPT09ICd2aWRlbycpIHtcblx0XHRcdFx0XHRcdHN0ZXBEZXNjcmlwdGlvbi5hcHBlbmRDaGlsZChcblx0XHRcdFx0XHRcdFx0JCgnLnZpZGVvLWRlc2NyaXB0aW9uJywgeyAnYXJpYS1sYWJlbCc6IGxvY2FsaXplKCd2aWRlb1Nob3dpbmcnLCBcIlZpZGVvIHNob3dpbmcgezB9XCIsIHN0ZXAubWVkaWEuYWx0VGV4dCkgfSksXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiAkKCdidXR0b24uZ2V0dGluZy1zdGFydGVkLXN0ZXAnLFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHQneC1kaXNwYXRjaCc6ICdzZWxlY3RUYXNrOicgKyBzdGVwLmlkLFxuXHRcdFx0XHRcdFx0XHQnZGF0YS1zdGVwLWlkJzogc3RlcC5pZCxcblx0XHRcdFx0XHRcdFx0J2FyaWEtZXhwYW5kZWQnOiAnZmFsc2UnLFxuXHRcdFx0XHRcdFx0XHQnYXJpYS1jaGVja2VkJzogc3RlcC5kb25lID8gJ3RydWUnIDogJ2ZhbHNlJyxcblx0XHRcdFx0XHRcdFx0J3JvbGUnOiAnYnV0dG9uJyxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRjb2RpY29uLFxuXHRcdFx0XHRcdFx0c3RlcERlc2NyaXB0aW9uKTtcblx0XHRcdFx0fSkpO1xuXHRcdH07XG5cblx0XHRidWlsZFN0ZXBMaXN0KCk7XG5cblx0XHR0aGlzLmRldGFpbHNQYWdlRGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c1NvbWUoY29udGV4dEtleXNUb1dhdGNoKSAmJiB0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaCAmJiB0aGlzLmVkaXRvcklucHV0KSB7XG5cdFx0XHRcdGJ1aWxkU3RlcExpc3QoKTtcblx0XHRcdFx0dGhpcy5yZWdpc3RlckRpc3BhdGNoTGlzdGVuZXJzKCk7XG5cdFx0XHRcdHRoaXMuc2VsZWN0U3RlcCh0aGlzLmVkaXRvcklucHV0LnNlbGVjdGVkU3RlcCwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNob3dOZXh0Q2F0ZWdvcnkgPSB0aGlzLmdldHRpbmdTdGFydGVkQ2F0ZWdvcmllcy5maW5kKF9jYXRlZ29yeSA9PiBfY2F0ZWdvcnkuaWQgPT09IGNhdGVnb3J5Lm5leHQpO1xuXG5cdFx0Y29uc3Qgc3RlcHNDb250YWluZXIgPSAkKFxuXHRcdFx0Jy5nZXR0aW5nLXN0YXJ0ZWQtZGV0YWlsLWNvbnRhaW5lcicsIHsgJ3JvbGUnOiAnbGlzdCcgfSxcblx0XHRcdHN0ZXBMaXN0Q29udGFpbmVyLFxuXHRcdFx0JCgnLmRvbmUtbmV4dC1jb250YWluZXInLCB7fSxcblx0XHRcdFx0JCgnYnV0dG9uLmJ1dHRvbi1saW5rLmFsbC1kb25lJywgeyAneC1kaXNwYXRjaCc6ICdhbGxEb25lJyB9LCAkKCdzcGFuLmNvZGljb24uY29kaWNvbi1jaGVjay1hbGwnKSwgbG9jYWxpemUoJ2FsbERvbmUnLCBcIk1hcmsgRG9uZVwiKSksXG5cdFx0XHRcdC4uLihzaG93TmV4dENhdGVnb3J5XG5cdFx0XHRcdFx0PyBbJCgnYnV0dG9uLmJ1dHRvbi1saW5rLm5leHQnLCB7ICd4LWRpc3BhdGNoJzogJ25leHRTZWN0aW9uJyB9LCBsb2NhbGl6ZSgnbmV4dE9uZScsIFwiTmV4dCBTZWN0aW9uXCIpLCAkKCdzcGFuLmNvZGljb24uY29kaWNvbi1hcnJvdy1yaWdodCcpKV1cblx0XHRcdFx0XHQ6IFtdKSxcblx0XHRcdClcblx0XHQpO1xuXHRcdHRoaXMuZGV0YWlsc1Njcm9sbGJhci52YWx1ZSA9IG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudChzdGVwc0NvbnRhaW5lciwgeyBjbGFzc05hbWU6ICdzdGVwcy1jb250YWluZXInIH0pO1xuXHRcdGNvbnN0IHN0ZXBMaXN0Q29tcG9uZW50ID0gdGhpcy5kZXRhaWxzU2Nyb2xsYmFyLnZhbHVlLmdldERvbU5vZGUoKTtcblxuXHRcdGNvbnN0IGNhdGVnb3J5Rm9vdGVyID0gJCgnLmdldHRpbmctc3RhcnRlZC1mb290ZXInKTtcblx0XHRpZiAodGhpcy5lZGl0b3JJbnB1dC5zaG93VGVsZW1ldHJ5Tm90aWNlICYmIGdldFRlbGVtZXRyeUxldmVsKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpICE9PSBUZWxlbWV0cnlMZXZlbC5OT05FICYmIHRoaXMucHJvZHVjdFNlcnZpY2UuZW5hYmxlVGVsZW1ldHJ5KSB7XG5cdFx0XHR0aGlzLmJ1aWxkVGVsZW1ldHJ5Rm9vdGVyKGNhdGVnb3J5Rm9vdGVyKTtcblx0XHR9XG5cblx0XHRyZXNldCh0aGlzLnN0ZXBzQ29udGVudCwgY2F0ZWdvcnlEZXNjcmlwdG9yQ29tcG9uZW50LCBzdGVwTGlzdENvbXBvbmVudCwgdGhpcy5zdGVwTWVkaWFDb21wb25lbnQsIGNhdGVnb3J5Rm9vdGVyKTtcblxuXHRcdGNvbnN0IHRvRXhwYW5kID0gY2F0ZWdvcnkuc3RlcHMuZmluZChzdGVwID0+IHRoaXMuY29udGV4dFNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhzdGVwLndoZW4pICYmICFzdGVwLmRvbmUpID8/IGNhdGVnb3J5LnN0ZXBzWzBdO1xuXHRcdHRoaXMuc2VsZWN0U3RlcChzZWxlY3RlZFN0ZXAgPz8gdG9FeHBhbmQuaWQsICFzZWxlY3RlZFN0ZXAsIHByZXNlcnZlRm9jdXMpO1xuXG5cdFx0dGhpcy5kZXRhaWxzU2Nyb2xsYmFyLnZhbHVlPy5zY2FuRG9tTm9kZSgpO1xuXHRcdHRoaXMuZGV0YWlsc1BhZ2VTY3JvbGxiYXI/LnNjYW5Eb21Ob2RlKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRGlzcGF0Y2hMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgYnVpbGRUZWxlbWV0cnlGb290ZXIocGFyZW50OiBIVE1MRWxlbWVudCkge1xuXHRcdGNvbnN0IHByaXZhY3lTdGF0ZW1lbnRDb3B5ID0gbG9jYWxpemUoJ3ByaXZhY3kgc3RhdGVtZW50JywgXCJwcml2YWN5IHN0YXRlbWVudFwiKTtcblx0XHRjb25zdCBwcml2YWN5U3RhdGVtZW50QnV0dG9uID0gYFske3ByaXZhY3lTdGF0ZW1lbnRDb3B5fV0oY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLm9wZW5Qcml2YWN5U3RhdGVtZW50VXJsKWA7XG5cblx0XHRjb25zdCBvcHRPdXRDb3B5ID0gbG9jYWxpemUoJ29wdE91dCcsIFwib3B0IG91dFwiKTtcblx0XHRjb25zdCBvcHRPdXRCdXR0b24gPSBgWyR7b3B0T3V0Q29weX1dKGNvbW1hbmQ6c2V0dGluZ3MuZmlsdGVyQnlUZWxlbWV0cnkpYDtcblxuXHRcdGNvbnN0IHRleHQgPSBsb2NhbGl6ZSh7IGtleTogJ2Zvb3RlcicsIGNvbW1lbnQ6IFsnZmlzdCBzdWJzdGl0dXRpb24gaXMgXCJ2cyBjb2RlXCIsIHNlY29uZCBpcyBcInByaXZhY3kgc3RhdGVtZW50XCIsIHRoaXJkIGlzIFwib3B0IG91dFwiLiddIH0sXG5cdFx0XHRcInswfSBjb2xsZWN0cyB1c2FnZSBkYXRhLiBSZWFkIG91ciB7MX0gYW5kIGxlYXJuIGhvdyB0byB7Mn0uXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZVNob3J0LCBwcml2YWN5U3RhdGVtZW50QnV0dG9uLCBvcHRPdXRCdXR0b24pO1xuXG5cdFx0Y29uc3QgcmVuZGVyZWRDb250ZW50cyA9IHRoaXMuZGV0YWlsc1BhZ2VEaXNwb3NhYmxlcy5hZGQodGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIoeyB2YWx1ZTogdGV4dCwgaXNUcnVzdGVkOiB0cnVlIH0pKTtcblx0XHRwYXJlbnQuYXBwZW5kKHJlbmRlcmVkQ29udGVudHMuZWxlbWVudCk7XG5cdH1cblxuXHRwcml2YXRlIGdldEtleWJpbmRpbmdMYWJlbChjb21tYW5kOiBzdHJpbmcpIHtcblx0XHRjb21tYW5kID0gY29tbWFuZC5yZXBsYWNlKC9eY29tbWFuZDovLCAnJyk7XG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoY29tbWFuZCk/LmdldExhYmVsKCk7XG5cdFx0aWYgKCFsYWJlbCkgeyByZXR1cm4gJyc7IH1cblx0XHRlbHNlIHtcblx0XHRcdHJldHVybiBgKCR7bGFiZWx9KWA7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRLZXlCaW5kaW5nKGNvbW1hbmQ6IHN0cmluZykge1xuXHRcdGNvbW1hbmQgPSBjb21tYW5kLnJlcGxhY2UoL15jb21tYW5kOi8sICcnKTtcblx0XHRyZXR1cm4gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGNvbW1hbmQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzY3JvbGxQcmV2KCkge1xuXHRcdHRoaXMuaW5Qcm9ncmVzc1Njcm9sbCA9IHRoaXMuaW5Qcm9ncmVzc1Njcm9sbC50aGVuKGFzeW5jICgpID0+IHtcblx0XHRcdGlmICh0aGlzLnByZXZXYWxrdGhyb3VnaCAmJiB0aGlzLnByZXZXYWxrdGhyb3VnaCAhPT0gdGhpcy5jdXJyZW50V2Fsa3Rocm91Z2gpIHtcblx0XHRcdFx0dGhpcy5jdXJyZW50V2Fsa3Rocm91Z2ggPSB0aGlzLnByZXZXYWxrdGhyb3VnaDtcblx0XHRcdFx0dGhpcy5wcmV2V2Fsa3Rocm91Z2ggPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMubWFrZUNhdGVnb3J5VmlzaWJsZVdoZW5BdmFpbGFibGUodGhpcy5jdXJyZW50V2Fsa3Rocm91Z2guaWQpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLmVkaXRvcklucHV0Py5yZXR1cm5Ub0NvbW1hbmQpIHtcblx0XHRcdFx0Ly8gRXhlY3V0ZSB0aGUgc3BlY2lmaWVkIGNvbW1hbmQgdG8gcmV0dXJuIHRvIHRoZSBvcmlnaW4gcGFnZVxuXHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKHRoaXMuZWRpdG9ySW5wdXQucmV0dXJuVG9Db21tYW5kKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuY3VycmVudFdhbGt0aHJvdWdoID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAodGhpcy5lZGl0b3JJbnB1dCkge1xuXHRcdFx0XHRcdHRoaXMuZWRpdG9ySW5wdXQuc2VsZWN0ZWRDYXRlZ29yeSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0aGlzLmVkaXRvcklucHV0LnNlbGVjdGVkU3RlcCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0aGlzLmVkaXRvcklucHV0LnNob3dUZWxlbWV0cnlOb3RpY2UgPSBmYWxzZTtcblx0XHRcdFx0XHR0aGlzLmVkaXRvcklucHV0LndhbGt0aHJvdWdoUGFnZVRpdGxlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMuZ2V0dGluZ1N0YXJ0ZWRDYXRlZ29yaWVzLmxlbmd0aCAhPT0gdGhpcy5nZXR0aW5nU3RhcnRlZExpc3QudmFsdWU/Lml0ZW1Db3VudCkge1xuXHRcdFx0XHRcdC8vIGV4dGVuc2lvbnMgbWF5IGhhdmUgY2hhbmdlZCBpbiB0aGUgdGltZSBzaW5jZSB3ZSBsYXN0IGRpc3BsYXllZCB0aGUgd2Fsa3Rocm91Z2ggbGlzdFxuXHRcdFx0XHRcdC8vIHJlYnVpbGQgdGhlIGxpc3Rcblx0XHRcdFx0XHR0aGlzLmJ1aWxkQ2F0ZWdvcmllc1NsaWRlKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLnNlbGVjdFN0ZXAodW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5zZXRTbGlkZSgnY2F0ZWdvcmllcycpO1xuXHRcdFx0XHR0aGlzLmNvbnRhaW5lci5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBydW5Ta2lwKCkge1xuXHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24uY2xvc2VBY3RpdmVFZGl0b3InKTtcblx0fVxuXG5cdGVzY2FwZSgpIHtcblx0XHRpZiAodGhpcy5lZGl0b3JJbnB1dD8uc2VsZWN0ZWRDYXRlZ29yeSkge1xuXHRcdFx0dGhpcy5zY3JvbGxQcmV2KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucnVuU2tpcCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0U2xpZGUodG9FbmFibGU6ICdkZXRhaWxzJyB8ICdjYXRlZ29yaWVzJywgZmlyc3RMYXVuY2g6IGJvb2xlYW4gPSBmYWxzZSkge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHNsaWRlTWFuYWdlciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5nZXR0aW5nU3RhcnRlZCcpKTtcblx0XHRpZiAodG9FbmFibGUgPT09ICdjYXRlZ29yaWVzJykge1xuXHRcdFx0c2xpZGVNYW5hZ2VyLmNsYXNzTGlzdC5yZW1vdmUoJ3Nob3dEZXRhaWxzJyk7XG5cdFx0XHRzbGlkZU1hbmFnZXIuY2xhc3NMaXN0LmFkZCgnc2hvd0NhdGVnb3JpZXMnKTtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0dGhpcy5jb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oJy5wcmV2LWJ1dHRvbi5idXR0b24tbGluaycpIS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuZ2V0dGluZ1N0YXJ0ZWRTbGlkZURldGFpbHMnKSEucXVlcnlTZWxlY3RvckFsbCgnYnV0dG9uJykuZm9yRWFjaChidXR0b24gPT4gYnV0dG9uLmRpc2FibGVkID0gdHJ1ZSk7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5nZXR0aW5nU3RhcnRlZFNsaWRlQ2F0ZWdvcmllcycpIS5xdWVyeVNlbGVjdG9yQWxsKCdidXR0b24nKS5mb3JFYWNoKGJ1dHRvbiA9PiBidXR0b24uZGlzYWJsZWQgPSBmYWxzZSk7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5nZXR0aW5nU3RhcnRlZFNsaWRlQ2F0ZWdvcmllcycpIS5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dCcpLmZvckVhY2goYnV0dG9uID0+IGJ1dHRvbi5kaXNhYmxlZCA9IGZhbHNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c2xpZGVNYW5hZ2VyLmNsYXNzTGlzdC5hZGQoJ3Nob3dEZXRhaWxzJyk7XG5cdFx0XHRzbGlkZU1hbmFnZXIuY2xhc3NMaXN0LnJlbW92ZSgnc2hvd0NhdGVnb3JpZXMnKTtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgcHJldkJ1dHRvbiA9IHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KCcucHJldi1idXR0b24uYnV0dG9uLWxpbmsnKTtcblx0XHRcdHByZXZCdXR0b24hLnN0eWxlLmRpc3BsYXkgPSB0aGlzLmVkaXRvcklucHV0Py5zaG93V2VsY29tZSB8fCB0aGlzLmVkaXRvcklucHV0Py5yZXR1cm5Ub0NvbW1hbmQgfHwgdGhpcy5wcmV2V2Fsa3Rocm91Z2ggPyAnYmxvY2snIDogJ25vbmUnO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCBtb3JlVGV4dEVsZW1lbnQgPSBwcmV2QnV0dG9uIS5xdWVyeVNlbGVjdG9yKCcubW9yZVRleHQnKTtcblx0XHRcdG1vcmVUZXh0RWxlbWVudCEudGV4dENvbnRlbnQgPSBmaXJzdExhdW5jaCA/IGxvY2FsaXplKCd3ZWxjb21lJywgXCJXZWxjb21lXCIpIDogbG9jYWxpemUoJ2dvQmFjaycsIFwiR28gQmFja1wiKTtcblxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuZ2V0dGluZ1N0YXJ0ZWRTbGlkZURldGFpbHMnKSEucXVlcnlTZWxlY3RvckFsbCgnYnV0dG9uJykuZm9yRWFjaChidXR0b24gPT4gYnV0dG9uLmRpc2FibGVkID0gZmFsc2UpO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuZ2V0dGluZ1N0YXJ0ZWRTbGlkZUNhdGVnb3JpZXMnKSEucXVlcnlTZWxlY3RvckFsbCgnYnV0dG9uJykuZm9yRWFjaChidXR0b24gPT4gYnV0dG9uLmRpc2FibGVkID0gdHJ1ZSk7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5nZXR0aW5nU3RhcnRlZFNsaWRlQ2F0ZWdvcmllcycpIS5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dCcpLmZvckVhY2goYnV0dG9uID0+IGJ1dHRvbi5kaXNhYmxlZCA9IHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCkge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cblx0XHRjb25zdCBhY3RpdmUgPSB0aGlzLmNvbnRhaW5lci5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG5cblx0XHRsZXQgcGFyZW50ID0gdGhpcy5jb250YWluZXIucGFyZW50RWxlbWVudDtcblx0XHR3aGlsZSAocGFyZW50ICYmIHBhcmVudCAhPT0gYWN0aXZlKSB7XG5cdFx0XHRwYXJlbnQgPSBwYXJlbnQucGFyZW50RWxlbWVudDtcblx0XHR9XG5cblx0XHRpZiAocGFyZW50KSB7XG5cdFx0XHQvLyBPbmx5IHNldCBmb2N1cyBpZiB0aGVyZSBpcyBubyBvdGhlciBmb2N1ZWQgZWxlbWVudCBvdXRzaWRlIHRoaXMgY2hhaW4uXG5cdFx0XHQvLyBUaGlzIHByZXZlbnRzIHVzIGZyb20gc3RlYWxpbmcgYmFjayBmb2N1cyBmcm9tIG90aGVyIGZvY3VzZWQgZWxlbWVudHMgc3VjaCBhcyBxdWljayBwaWNrIGR1ZSB0byBkZWxheWVkIGxvYWQuXG5cdFx0XHR0aGlzLmNvbnRhaW5lci5mb2N1cygpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgR2V0dGluZ1N0YXJ0ZWRJbnB1dFNlcmlhbGl6ZXIgaW1wbGVtZW50cyBJRWRpdG9yU2VyaWFsaXplciB7XG5cdHB1YmxpYyBjYW5TZXJpYWxpemUoZWRpdG9ySW5wdXQ6IEdldHRpbmdTdGFydGVkSW5wdXQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBzZXJpYWxpemUoZWRpdG9ySW5wdXQ6IEdldHRpbmdTdGFydGVkSW5wdXQpOiBzdHJpbmcge1xuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeSh7IHNlbGVjdGVkQ2F0ZWdvcnk6IGVkaXRvcklucHV0LnNlbGVjdGVkQ2F0ZWdvcnksIHNlbGVjdGVkU3RlcDogZWRpdG9ySW5wdXQuc2VsZWN0ZWRTdGVwIH0pO1xuXHR9XG5cblx0cHVibGljIGRlc2VyaWFsaXplKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIHNlcmlhbGl6ZWRFZGl0b3JJbnB1dDogc3RyaW5nKTogR2V0dGluZ1N0YXJ0ZWRJbnB1dCB7XG5cblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgeyBzZWxlY3RlZENhdGVnb3J5LCBzZWxlY3RlZFN0ZXAgfSA9IEpTT04ucGFyc2Uoc2VyaWFsaXplZEVkaXRvcklucHV0KTtcblx0XHRcdFx0cmV0dXJuIG5ldyBHZXR0aW5nU3RhcnRlZElucHV0KHsgc2VsZWN0ZWRDYXRlZ29yeSwgc2VsZWN0ZWRTdGVwIH0pO1xuXHRcdFx0fSBjYXRjaCB7IH1cblx0XHRcdHJldHVybiBuZXcgR2V0dGluZ1N0YXJ0ZWRJbnB1dCh7fSk7XG5cblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLEdBQWMsdUJBQXVCLFFBQVEsV0FBVyxhQUFhO0FBQzlFLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsY0FBYztBQUN2QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGNBQWM7QUFDdkIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsVUFBVSxjQUFjO0FBQ2pDLFNBQVMsU0FBUyxpQkFBaUI7QUFFbkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGlCQUFpQixtQkFBbUIsb0JBQW9CO0FBRWpFLFNBQVMsYUFBYTtBQUN0QixTQUFTLFNBQVMscUJBQXFCO0FBQ3ZDLFNBQVMsVUFB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QzdELHNCQUFpQixjQUFjLGNBQWMsU0FBUyxXQUFXLFNBQVMsSUFBSSxTQUFTLFVBQVUsU0FBUztBQUcxRyxXQUFLLFVBQVUsY0FBYyw2QkFBNkIsRUFBRyxpQkFBaUIsUUFBUSxFQUFFLFFBQVEsWUFBVSxPQUFPLFdBQVcsS0FBSztBQUVqSSxXQUFLLFVBQVUsY0FBYyxnQ0FBZ0MsRUFBRyxpQkFBaUIsUUFBUSxFQUFFLFFBQVEsWUFBVSxPQUFPLFdBQVcsSUFBSTtBQUVuSSxXQUFLLFVBQVUsY0FBYyxnQ0FBZ0MsRUFBRyxpQkFBaUIsT0FBTyxFQUFFLFFBQVEsWUFBVSxPQUFPLFdBQVcsSUFBSTtBQUFBLElBQ25JO0FBQUEsRUFDRDtBQUFBLEVBRVMsUUFBUTtBQUNoQixVQUFNLE1BQU07QUFFWixVQUFNLFNBQVMsS0FBSyxVQUFVLGNBQWM7QUFFNUMsUUFBSSxTQUFTLEtBQUssVUFBVTtBQUM1QixXQUFPLFVBQVUsV0FBVyxRQUFRO0FBQ25DLGVBQVMsT0FBTztBQUFBLElBQ2pCO0FBRUEsUUFBSSxRQUFRO0FBR1gsV0FBSyxVQUFVLE1BQU07QUFBQSxJQUN0QjtBQUFBLEVBQ0Q7QUFDRDtBQXBuRGEsbUJBRVcsS0FBSztBQUZoQixxQkFBTjtBQUFBLEVBcURKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0E3RVU7QUFzbkROLE1BQU0sOEJBQTJEO0FBQUEsRUFDaEUsYUFBYSxhQUEyQztBQUM5RCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRU8sVUFBVSxhQUEwQztBQUMxRCxXQUFPLEtBQUssVUFBVSxFQUFFLGtCQUFrQixZQUFZLGtCQUFrQixjQUFjLFlBQVksYUFBYSxDQUFDO0FBQUEsRUFDakg7QUFBQSxFQUVPLFlBQVksc0JBQTZDLHVCQUFvRDtBQUVuSCxXQUFPLHFCQUFxQixlQUFlLGNBQVk7QUFDdEQsVUFBSTtBQUNILGNBQU0sRUFBRSxrQkFBa0IsYUFBYSxJQUFJLEtBQUssTUFBTSxxQkFBcUI7QUFDM0UsZUFBTyxJQUFJLG9CQUFvQixFQUFFLGtCQUFrQixhQUFhLENBQUM7QUFBQSxNQUNsRSxRQUFRO0FBQUEsTUFBRTtBQUNWLGFBQU8sSUFBSSxvQkFBb0IsQ0FBQyxDQUFDO0FBQUEsSUFFbEMsQ0FBQztBQUFBLEVBQ0Y7QUFDRDsiLAogICJuYW1lcyI6IFsidGhlbWUiLCAidGhlbWVUeXBlIiwgInZpZGVvUGF0aCIsICJ2aWRlb1Bvc3RlciIsICJjb2RpY29uRWxlbWVudCIsICJzdGVwIiwgImNhdGVnb3J5IiwgImUiLCAidG9FeHBhbmQiXQp9Cg==
