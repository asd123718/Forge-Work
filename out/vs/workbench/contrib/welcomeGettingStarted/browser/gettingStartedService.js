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
import { createDecorator, IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Emitter } from "../../../../base/common/event.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { Memento } from "../../../common/memento.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IUserDataSyncEnablementService } from "../../../../platform/userDataSync/common/userDataSync.js";
import { URI } from "../../../../base/common/uri.js";
import { joinPath } from "../../../../base/common/resources.js";
import { FileAccess } from "../../../../base/common/network.js";
import { EXTENSION_INSTALL_DEP_PACK_CONTEXT, EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT, IExtensionManagementService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { walkthroughs } from "../common/gettingStartedContent.js";
import { IWorkbenchAssignmentService } from "../../../services/assignment/common/assignmentService.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { parseLinkedText } from "../../../../base/common/linkedText.js";
import { walkthroughsExtensionPoint } from "./gettingStartedExtensionPoint.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { dirname } from "../../../../base/common/path.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { localize, localize2 } from "../../../../nls.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { checkGlobFileExists } from "../../../services/extensions/common/workspaceContains.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { asWebviewUri } from "../../webview/common/webview.js";
import { IWorkbenchLayoutService, Parts } from "../../../services/layout/browser/layoutService.js";
import { extensionDefaultIcon } from "../../../services/extensionManagement/common/extensionsIcons.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { GettingStartedInput } from "./gettingStartedInput.js";
const HasMultipleNewFileEntries = new RawContextKey("hasMultipleNewFileEntries", false);
const IWalkthroughsService = createDecorator("walkthroughsService");
const hiddenEntriesConfigurationKey = "workbench.welcomePage.hiddenCategories";
const walkthroughMetadataConfigurationKey = "workbench.welcomePage.walkthroughMetadata";
const BUILT_IN_SOURCE = localize("builtin", "Built-In");
const DAYS = 24 * 60 * 60 * 1e3;
const NEW_WALKTHROUGH_TIME = 7 * DAYS;
let WalkthroughsService = class extends Disposable {
  constructor(storageService, commandService, instantiationService, workspaceContextService, contextService, userDataSyncEnablementService, configurationService, extensionManagementService, hostService, viewsService, telemetryService, tasExperimentService, layoutService, editorService) {
    super();
    this.storageService = storageService;
    this.commandService = commandService;
    this.instantiationService = instantiationService;
    this.workspaceContextService = workspaceContextService;
    this.contextService = contextService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.configurationService = configurationService;
    this.extensionManagementService = extensionManagementService;
    this.hostService = hostService;
    this.viewsService = viewsService;
    this.telemetryService = telemetryService;
    this.tasExperimentService = tasExperimentService;
    this.layoutService = layoutService;
    this.editorService = editorService;
    this._onDidAddWalkthrough = this._register(new Emitter());
    this.onDidAddWalkthrough = this._onDidAddWalkthrough.event;
    this._onDidRemoveWalkthrough = this._register(new Emitter());
    this.onDidRemoveWalkthrough = this._onDidRemoveWalkthrough.event;
    this._onDidChangeWalkthrough = this._register(new Emitter());
    this.onDidChangeWalkthrough = this._onDidChangeWalkthrough.event;
    this._onDidProgressStep = this._register(new Emitter());
    this.onDidProgressStep = this._onDidProgressStep.event;
    this.sessionEvents = /* @__PURE__ */ new Set();
    this.completionListeners = /* @__PURE__ */ new Map();
    this.gettingStartedContributions = /* @__PURE__ */ new Map();
    this.steps = /* @__PURE__ */ new Map();
    this.sessionInstalledExtensions = /* @__PURE__ */ new Set();
    this.categoryVisibilityContextKeys = /* @__PURE__ */ new Set();
    this.stepCompletionContextKeyExpressions = /* @__PURE__ */ new Set();
    this.stepCompletionContextKeys = /* @__PURE__ */ new Set();
    this.metadata = new Map(
      JSON.parse(
        this.storageService.get(walkthroughMetadataConfigurationKey, StorageScope.PROFILE, "[]")
      )
    );
    this.memento = new Memento("gettingStartedService", this.storageService);
    this.stepProgress = this.memento.getMemento(StorageScope.PROFILE, StorageTarget.USER);
    this.initCompletionEventListeners();
    HasMultipleNewFileEntries.bindTo(this.contextService).set(false);
    this.registerWalkthroughs();
  }
  registerWalkthroughs() {
    walkthroughs.forEach(async (category, index) => {
      this._registerWalkthrough({
        ...category,
        icon: { type: "icon", icon: category.icon },
        order: walkthroughs.length - index,
        source: BUILT_IN_SOURCE,
        when: ContextKeyExpr.deserialize(category.when) ?? ContextKeyExpr.true(),
        steps: category.content.steps.map((step, index2) => {
          return {
            ...step,
            completionEvents: step.completionEvents ?? [],
            description: parseDescription(step.description),
            category: category.id,
            order: index2,
            when: ContextKeyExpr.deserialize(step.when) ?? ContextKeyExpr.true(),
            media: step.media.type === "image" ? {
              type: "image",
              altText: step.media.altText,
              path: convertInternalMediaPathsToBrowserURIs(step.media.path)
            } : step.media.type === "svg" ? {
              type: "svg",
              altText: step.media.altText,
              path: convertInternalMediaPathToFileURI(step.media.path).with({ query: JSON.stringify({ moduleId: "vs/workbench/contrib/welcomeGettingStarted/common/media/" + step.media.path }) })
            } : step.media.type === "markdown" ? {
              type: "markdown",
              path: convertInternalMediaPathToFileURI(step.media.path).with({ query: JSON.stringify({ moduleId: "vs/workbench/contrib/welcomeGettingStarted/common/media/" + step.media.path }) }),
              base: FileAccess.asFileUri("vs/workbench/contrib/welcomeGettingStarted/common/media/"),
              root: FileAccess.asFileUri("vs/workbench/contrib/welcomeGettingStarted/common/media/")
            } : {
              type: "video",
              path: convertRelativeMediaPathsToWebviewURIs(FileAccess.asFileUri("vs/workbench/contrib/welcomeGettingStarted/common/media/"), step.media.path),
              altText: step.media.altText,
              root: FileAccess.asFileUri("vs/workbench/contrib/welcomeGettingStarted/common/media/"),
              poster: step.media.poster ? convertRelativeMediaPathsToWebviewURIs(FileAccess.asFileUri("vs/workbench/contrib/welcomeGettingStarted/common/media/"), step.media.poster) : void 0
            }
          };
        })
      });
    });
    walkthroughsExtensionPoint.setHandler((_, { added, removed }) => {
      added.map((e) => this.registerExtensionWalkthroughContributions(e.description));
      removed.map((e) => this.unregisterExtensionWalkthroughContributions(e.description));
    });
  }
  initCompletionEventListeners() {
    this._register(this.commandService.onDidExecuteCommand((command) => this.progressByEvent(`onCommand:${command.commandId}`)));
    this.extensionManagementService.getInstalled().then((installed) => {
      installed.forEach((ext) => this.progressByEvent(`extensionInstalled:${ext.identifier.id.toLowerCase()}`));
    });
    this._register(this.extensionManagementService.onDidInstallExtensions((result) => {
      for (const e of result) {
        const skipWalkthrough = e?.context?.[EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT] || e?.context?.[EXTENSION_INSTALL_DEP_PACK_CONTEXT];
        if (!skipWalkthrough) {
          this.sessionInstalledExtensions.add(e.identifier.id.toLowerCase());
        }
        this.progressByEvent(`extensionInstalled:${e.identifier.id.toLowerCase()}`);
      }
    }));
    this._register(this.contextService.onDidChangeContext((event) => {
      if (event.affectsSome(this.stepCompletionContextKeys)) {
        this.stepCompletionContextKeyExpressions.forEach((expression) => {
          if (event.affectsSome(new Set(expression.keys())) && this.contextService.contextMatchesRules(expression)) {
            this.progressByEvent(`onContext:` + expression.serialize());
          }
        });
      }
    }));
    this._register(this.viewsService.onDidChangeViewVisibility((e) => {
      if (e.visible) {
        this.progressByEvent("onView:" + e.id);
      }
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      e.affectedKeys.forEach((key) => {
        this.progressByEvent("onSettingChanged:" + key);
      });
    }));
    if (this.userDataSyncEnablementService.isEnabled()) {
      this.progressByEvent("onEvent:sync-enabled");
    }
    this._register(this.userDataSyncEnablementService.onDidChangeEnablement(() => {
      if (this.userDataSyncEnablementService.isEnabled()) {
        this.progressByEvent("onEvent:sync-enabled");
      }
    }));
  }
  markWalkthroughOpened(id) {
    const walkthrough = this.gettingStartedContributions.get(id);
    const prior = this.metadata.get(id);
    if (prior && walkthrough) {
      this.metadata.set(id, { ...prior, manaullyOpened: true, stepIDs: walkthrough.steps.map((s) => s.id) });
    }
    this.storageService.store(walkthroughMetadataConfigurationKey, JSON.stringify([...this.metadata.entries()]), StorageScope.PROFILE, StorageTarget.USER);
  }
  async registerExtensionWalkthroughContributions(extension) {
    const convertExtensionPathToFileURI = (path) => path.startsWith("https://") ? URI.parse(path, true) : FileAccess.uriToFileUri(joinPath(extension.extensionLocation, path));
    const convertExtensionRelativePathsToBrowserURIs = (path) => {
      const convertPath = (path2) => path2.startsWith("https://") ? URI.parse(path2, true) : FileAccess.uriToBrowserUri(joinPath(extension.extensionLocation, path2));
      if (typeof path === "string") {
        const converted = convertPath(path);
        return { hcDark: converted, hcLight: converted, dark: converted, light: converted };
      } else {
        return {
          hcDark: convertPath(path.hc),
          hcLight: convertPath(path.hcLight ?? path.light),
          light: convertPath(path.light),
          dark: convertPath(path.dark)
        };
      }
    };
    if (!extension.contributes?.walkthroughs?.length) {
      return;
    }
    let sectionToOpen;
    let sectionToOpenIndex = Math.min();
    await Promise.all(extension.contributes?.walkthroughs?.map(async (walkthrough, index) => {
      const categoryID = extension.identifier.value + "#" + walkthrough.id;
      const isNewlyInstalled = !this.metadata.get(categoryID);
      if (isNewlyInstalled) {
        this.metadata.set(categoryID, { firstSeen: +/* @__PURE__ */ new Date(), stepIDs: walkthrough.steps?.map((s) => s.id) ?? [], manaullyOpened: false });
      }
      const override = await Promise.race([
        this.tasExperimentService?.getTreatment(`gettingStarted.overrideCategory.${extension.identifier.value + "." + walkthrough.id}.when`),
        new Promise((resolve) => setTimeout(() => resolve(walkthrough.when), 5e3))
      ]);
      if (this.sessionInstalledExtensions.has(extension.identifier.value.toLowerCase()) && this.contextService.contextMatchesRules(ContextKeyExpr.deserialize(override ?? walkthrough.when) ?? ContextKeyExpr.true())) {
        this.sessionInstalledExtensions.delete(extension.identifier.value.toLowerCase());
        if (index < sectionToOpenIndex && isNewlyInstalled) {
          sectionToOpen = categoryID;
          sectionToOpenIndex = index;
        }
      }
      const steps = (walkthrough.steps ?? []).map((step, index2) => {
        const description = parseDescription(step.description || "");
        const fullyQualifiedID = extension.identifier.value + "#" + walkthrough.id + "#" + step.id;
        let media;
        if (!step.media) {
          throw Error("missing media in walkthrough step: " + walkthrough.id + "@" + step.id);
        }
        if (step.media.image) {
          const altText = step.media.altText;
          if (altText === void 0) {
            console.error("Walkthrough item:", fullyQualifiedID, "is missing altText for its media element.");
          }
          media = { type: "image", altText, path: convertExtensionRelativePathsToBrowserURIs(step.media.image) };
        } else if (step.media.markdown) {
          media = {
            type: "markdown",
            path: convertExtensionPathToFileURI(step.media.markdown),
            base: convertExtensionPathToFileURI(dirname(step.media.markdown)),
            root: FileAccess.uriToFileUri(extension.extensionLocation)
          };
        } else if (step.media.svg) {
          media = {
            type: "svg",
            path: convertExtensionPathToFileURI(step.media.svg),
            altText: step.media.svg
          };
        } else if (step.media.video) {
          const baseURI = FileAccess.uriToFileUri(extension.extensionLocation);
          media = {
            type: "video",
            path: convertRelativeMediaPathsToWebviewURIs(baseURI, step.media.video),
            root: FileAccess.uriToFileUri(extension.extensionLocation),
            altText: step.media.altText,
            poster: step.media.poster ? convertRelativeMediaPathsToWebviewURIs(baseURI, step.media.poster) : void 0
          };
        } else {
          throw new Error("Unknown walkthrough format detected for " + fullyQualifiedID);
        }
        return {
          description,
          media,
          completionEvents: step.completionEvents?.filter((x) => typeof x === "string") ?? [],
          id: fullyQualifiedID,
          title: step.title,
          when: ContextKeyExpr.deserialize(step.when) ?? ContextKeyExpr.true(),
          category: categoryID,
          order: index2
        };
      });
      let isFeatured = false;
      if (walkthrough.featuredFor) {
        const folders = this.workspaceContextService.getWorkspace().folders.map((f) => f.uri);
        const token = new CancellationTokenSource();
        setTimeout(() => token.cancel(), 2e3);
        isFeatured = await this.instantiationService.invokeFunction((a) => checkGlobFileExists(a, folders, walkthrough.featuredFor, token.token));
      }
      const iconStr = walkthrough.icon ?? extension.icon;
      const walkthoughDescriptor = {
        description: walkthrough.description,
        title: walkthrough.title,
        id: categoryID,
        isFeatured,
        source: extension.displayName ?? extension.name,
        order: 0,
        walkthroughPageTitle: extension.displayName ?? extension.name,
        steps,
        icon: iconStr ? {
          type: "image",
          path: FileAccess.uriToBrowserUri(joinPath(extension.extensionLocation, iconStr)).toString(true)
        } : {
          icon: extensionDefaultIcon,
          type: "icon"
        },
        when: ContextKeyExpr.deserialize(override ?? walkthrough.when) ?? ContextKeyExpr.true()
      };
      this._registerWalkthrough(walkthoughDescriptor);
      this._onDidAddWalkthrough.fire(this.resolveWalkthrough(walkthoughDescriptor));
    }));
    this.storageService.store(walkthroughMetadataConfigurationKey, JSON.stringify([...this.metadata.entries()]), StorageScope.PROFILE, StorageTarget.USER);
    const hadLastFoucs = await this.hostService.hadLastFocus();
    const startupEditor = this.configurationService.getValue("workbench.startupEditor");
    if (hadLastFoucs && sectionToOpen && this.configurationService.getValue("workbench.welcomePage.walkthroughs.openOnInstall") && startupEditor !== "agentSessionsWelcomePage") {
      this.telemetryService.publicLog2("gettingStarted.didAutoOpenWalkthrough", { id: sectionToOpen });
      const activeEditor = this.editorService.activeEditor;
      if (activeEditor instanceof GettingStartedInput) {
        this.commandService.executeCommand("workbench.action.keepEditor");
      }
      this.commandService.executeCommand("workbench.action.openWalkthrough", sectionToOpen, {
        inactive: this.layoutService.hasFocus(Parts.EDITOR_PART)
        // do not steal the active editor away
      });
    }
  }
  unregisterExtensionWalkthroughContributions(extension) {
    if (!extension.contributes?.walkthroughs?.length) {
      return;
    }
    extension.contributes?.walkthroughs?.forEach((section) => {
      const categoryID = extension.identifier.value + "#" + section.id;
      section.steps.forEach((step) => {
        const fullyQualifiedID = extension.identifier.value + "#" + section.id + "#" + step.id;
        this.steps.delete(fullyQualifiedID);
      });
      this.gettingStartedContributions.delete(categoryID);
      this._onDidRemoveWalkthrough.fire(categoryID);
    });
  }
  getWalkthrough(id) {
    const walkthrough = this.gettingStartedContributions.get(id);
    if (!walkthrough) {
      throw Error("Trying to get unknown walkthrough: " + id);
    }
    return this.resolveWalkthrough(walkthrough);
  }
  getWalkthroughs() {
    const registeredCategories = [...this.gettingStartedContributions.values()];
    const categoriesWithCompletion = registeredCategories.map((category) => {
      return {
        ...category,
        content: {
          type: "steps",
          steps: category.steps
        }
      };
    }).filter((category) => category.content.type !== "steps" || category.content.steps.length).filter((category) => category.id !== "NewWelcomeExperience").map((category) => this.resolveWalkthrough(category));
    return categoriesWithCompletion;
  }
  resolveWalkthrough(category) {
    const stepsWithProgress = category.steps.map((step) => this.getStepProgress(step));
    const hasOpened = this.metadata.get(category.id)?.manaullyOpened;
    const firstSeenDate = this.metadata.get(category.id)?.firstSeen;
    const isNew = firstSeenDate && firstSeenDate > +/* @__PURE__ */ new Date() - NEW_WALKTHROUGH_TIME;
    const lastStepIDs = this.metadata.get(category.id)?.stepIDs;
    const rawCategory = this.gettingStartedContributions.get(category.id);
    if (!rawCategory) {
      throw Error("Could not find walkthrough with id " + category.id);
    }
    const currentStepIds = rawCategory.steps.map((s) => s.id);
    const hasNewSteps = lastStepIDs && (currentStepIds.length !== lastStepIDs.length || currentStepIds.some((id, index) => id !== lastStepIDs[index]));
    let recencyBonus = 0;
    if (firstSeenDate) {
      const currentDate = +/* @__PURE__ */ new Date();
      const timeSinceFirstSeen = currentDate - firstSeenDate;
      recencyBonus = Math.max(0, (NEW_WALKTHROUGH_TIME - timeSinceFirstSeen) / NEW_WALKTHROUGH_TIME);
    }
    return {
      ...category,
      recencyBonus,
      steps: stepsWithProgress,
      newItems: !!hasNewSteps,
      newEntry: !!(isNew && !hasOpened)
    };
  }
  getStepProgress(step) {
    return {
      ...step,
      done: false,
      ...this.stepProgress[step.id]
    };
  }
  progressStep(id) {
    const oldProgress = this.stepProgress[id];
    if (!oldProgress || oldProgress.done !== true) {
      this.stepProgress[id] = { done: true };
      this.memento.saveMemento();
      const step = this.getStep(id);
      if (!step) {
        throw Error("Tried to progress unknown step");
      }
      this._onDidProgressStep.fire(this.getStepProgress(step));
    }
  }
  deprogressStep(id) {
    delete this.stepProgress[id];
    this.memento.saveMemento();
    const step = this.getStep(id);
    this._onDidProgressStep.fire(this.getStepProgress(step));
  }
  progressByEvent(event) {
    if (this.sessionEvents.has(event)) {
      return;
    }
    this.sessionEvents.add(event);
    this.completionListeners.get(event)?.forEach((id) => this.progressStep(id));
  }
  registerWalkthrough(walkthoughDescriptor) {
    this._registerWalkthrough({
      ...walkthoughDescriptor,
      steps: walkthoughDescriptor.steps.map((step) => ({ ...step, description: parseDescription(step.description) }))
    });
  }
  _registerWalkthrough(walkthroughDescriptor) {
    const oldCategory = this.gettingStartedContributions.get(walkthroughDescriptor.id);
    if (oldCategory) {
      console.error(`Skipping attempt to overwrite walkthrough. (${walkthroughDescriptor.id})`);
      return;
    }
    this.gettingStartedContributions.set(walkthroughDescriptor.id, walkthroughDescriptor);
    walkthroughDescriptor.steps.forEach((step) => {
      if (this.steps.has(step.id)) {
        throw Error("Attempting to register step with id " + step.id + " twice. Second is dropped.");
      }
      this.steps.set(step.id, step);
      step.when.keys().forEach((key) => this.categoryVisibilityContextKeys.add(key));
      this.registerDoneListeners(step);
    });
    walkthroughDescriptor.when.keys().forEach((key) => this.categoryVisibilityContextKeys.add(key));
  }
  registerDoneListeners(step) {
    if (step.doneOn) {
      console.error(`wakthrough step`, step, `uses deprecated 'doneOn' property. Adopt 'completionEvents' to silence this warning`);
      return;
    }
    if (!step.completionEvents.length) {
      step.completionEvents = coalesce(
        step.description.filter((linkedText) => linkedText.nodes.length === 1).flatMap((linkedText) => linkedText.nodes.filter(((node) => typeof node !== "string")).map(({ href }) => {
          if (href.startsWith("command:")) {
            return "onCommand:" + href.slice("command:".length, href.includes("?") ? href.indexOf("?") : void 0);
          }
          if (href.startsWith("https://") || href.startsWith("http://")) {
            return "onLink:" + href;
          }
          return void 0;
        }))
      );
    }
    if (!step.completionEvents.length) {
      step.completionEvents.push("stepSelected");
    }
    for (let event of step.completionEvents) {
      const [_, eventType, argument] = /^([^:]*):?(.*)$/.exec(event) ?? [];
      if (!eventType) {
        console.error(`Unknown completionEvent ${event} when registering step ${step.id}`);
        continue;
      }
      switch (eventType) {
        case "onLink":
        case "onEvent":
        case "onView":
        case "onSettingChanged":
          break;
        case "onContext": {
          const expression = ContextKeyExpr.deserialize(argument);
          if (expression) {
            this.stepCompletionContextKeyExpressions.add(expression);
            expression.keys().forEach((key) => this.stepCompletionContextKeys.add(key));
            event = eventType + ":" + expression.serialize();
            if (this.contextService.contextMatchesRules(expression)) {
              this.sessionEvents.add(event);
            }
          } else {
            console.error("Unable to parse context key expression:", expression, "in walkthrough step", step.id);
          }
          break;
        }
        case "onStepSelected":
        case "stepSelected":
          event = "stepSelected:" + step.id;
          break;
        case "onCommand":
          event = eventType + ":" + argument.replace(/^toSide:/, "");
          break;
        case "onExtensionInstalled":
        case "extensionInstalled":
          event = "extensionInstalled:" + argument.toLowerCase();
          break;
        default:
          console.error(`Unknown completionEvent ${event} when registering step ${step.id}`);
          continue;
      }
      this.registerCompletionListener(event, step);
    }
  }
  registerCompletionListener(event, step) {
    if (!this.completionListeners.has(event)) {
      this.completionListeners.set(event, /* @__PURE__ */ new Set());
    }
    this.completionListeners.get(event)?.add(step.id);
  }
  getStep(id) {
    const step = this.steps.get(id);
    if (!step) {
      throw Error("Attempting to access step which does not exist in registry " + id);
    }
    return step;
  }
};
WalkthroughsService = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, ICommandService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IUserDataSyncEnablementService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IExtensionManagementService),
  __decorateParam(8, IHostService),
  __decorateParam(9, IViewsService),
  __decorateParam(10, ITelemetryService),
  __decorateParam(11, IWorkbenchAssignmentService),
  __decorateParam(12, IWorkbenchLayoutService),
  __decorateParam(13, IEditorService)
], WalkthroughsService);
const parseDescription = (desc) => desc.split("\n").filter((x) => x).map((text) => parseLinkedText(text));
const convertInternalMediaPathToFileURI = (path) => path.startsWith("https://") ? URI.parse(path, true) : FileAccess.asFileUri(`vs/workbench/contrib/welcomeGettingStarted/common/media/${path}`);
const convertInternalMediaPathToBrowserURI = (path) => path.startsWith("https://") ? URI.parse(path, true) : FileAccess.asBrowserUri(`vs/workbench/contrib/welcomeGettingStarted/common/media/${path}`);
const convertInternalMediaPathsToBrowserURIs = (path) => {
  if (typeof path === "string") {
    const converted = convertInternalMediaPathToBrowserURI(path);
    return { hcDark: converted, hcLight: converted, dark: converted, light: converted };
  } else {
    return {
      hcDark: convertInternalMediaPathToBrowserURI(path.hc),
      hcLight: convertInternalMediaPathToBrowserURI(path.hcLight ?? path.light),
      light: convertInternalMediaPathToBrowserURI(path.light),
      dark: convertInternalMediaPathToBrowserURI(path.dark)
    };
  }
};
const convertRelativeMediaPathsToWebviewURIs = (basePath, path) => {
  const convertPath = (path2) => path2.startsWith("https://") ? URI.parse(path2, true) : asWebviewUri(joinPath(basePath, path2));
  if (typeof path === "string") {
    const converted = convertPath(path);
    return { hcDark: converted, hcLight: converted, dark: converted, light: converted };
  } else {
    return {
      hcDark: convertPath(path.hc),
      hcLight: convertPath(path.hcLight ?? path.light),
      light: convertPath(path.light),
      dark: convertPath(path.dark)
    };
  }
};
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "resetGettingStartedProgress",
      category: localize2("developer", "Developer"),
      title: localize2("resetWelcomePageWalkthroughProgress", "Reset Welcome Page Walkthrough Progress"),
      f1: true,
      metadata: {
        description: localize2("resetGettingStartedProgressDescription", "Reset the progress of all Walkthrough steps on the Welcome Page to make them appear as if they are being viewed for the first time, providing a fresh start to the getting started experience.")
      }
    });
  }
  run(accessor) {
    const gettingStartedService = accessor.get(IWalkthroughsService);
    const storageService = accessor.get(IStorageService);
    storageService.store(
      hiddenEntriesConfigurationKey,
      JSON.stringify([]),
      StorageScope.PROFILE,
      StorageTarget.USER
    );
    storageService.store(
      walkthroughMetadataConfigurationKey,
      JSON.stringify([]),
      StorageScope.PROFILE,
      StorageTarget.USER
    );
    const memento = new Memento("gettingStartedService", accessor.get(IStorageService));
    const record = memento.getMemento(StorageScope.PROFILE, StorageTarget.USER);
    for (const key in record) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        try {
          gettingStartedService.deprogressStep(key);
        } catch (e) {
          console.error(e);
        }
      }
    }
    memento.saveMemento();
  }
});
registerSingleton(IWalkthroughsService, WalkthroughsService, InstantiationType.Delayed);
export {
  HasMultipleNewFileEntries,
  IWalkthroughsService,
  WalkthroughsService,
  convertInternalMediaPathToFileURI,
  hiddenEntriesConfigurationKey,
  parseDescription,
  walkthroughMetadataConfigurationKey
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHdlbGNvbWVHZXR0aW5nU3RhcnRlZFxcYnJvd3NlclxcZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yLCBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IE1lbWVudG8gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbWVtZW50by5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgQ29udGV4dEtleUV4cHJlc3Npb24sIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBFWFRFTlNJT05fSU5TVEFMTF9ERVBfUEFDS19DT05URVhULCBFWFRFTlNJT05fSU5TVEFMTF9TS0lQX1dBTEtUSFJPVUdIX0NPTlRFWFQsIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IHdhbGt0aHJvdWdocyB9IGZyb20gJy4uL2NvbW1vbi9nZXR0aW5nU3RhcnRlZENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXNzaWdubWVudC9jb21tb24vYXNzaWdubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGluaywgTGlua2VkVGV4dCwgcGFyc2VMaW5rZWRUZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlua2VkVGV4dC5qcyc7XG5pbXBvcnQgeyB3YWxrdGhyb3VnaHNFeHRlbnNpb25Qb2ludCB9IGZyb20gJy4vZ2V0dGluZ1N0YXJ0ZWRFeHRlbnNpb25Qb2ludC5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBjaGVja0dsb2JGaWxlRXhpc3RzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vd29ya3NwYWNlQ29udGFpbnMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgYXNXZWJ2aWV3VXJpIH0gZnJvbSAnLi4vLi4vd2Vidmlldy9jb21tb24vd2Vidmlldy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUGFydHMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGV4dGVuc2lvbkRlZmF1bHRJY29uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uc0ljb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdldHRpbmdTdGFydGVkSW5wdXQgfSBmcm9tICcuL2dldHRpbmdTdGFydGVkSW5wdXQuanMnO1xuXG5leHBvcnQgY29uc3QgSGFzTXVsdGlwbGVOZXdGaWxlRW50cmllcyA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdoYXNNdWx0aXBsZU5ld0ZpbGVFbnRyaWVzJywgZmFsc2UpO1xuXG5leHBvcnQgY29uc3QgSVdhbGt0aHJvdWdoc1NlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SVdhbGt0aHJvdWdoc1NlcnZpY2U+KCd3YWxrdGhyb3VnaHNTZXJ2aWNlJyk7XG5cbmV4cG9ydCBjb25zdCBoaWRkZW5FbnRyaWVzQ29uZmlndXJhdGlvbktleSA9ICd3b3JrYmVuY2gud2VsY29tZVBhZ2UuaGlkZGVuQ2F0ZWdvcmllcyc7XG5cbmV4cG9ydCBjb25zdCB3YWxrdGhyb3VnaE1ldGFkYXRhQ29uZmlndXJhdGlvbktleSA9ICd3b3JrYmVuY2gud2VsY29tZVBhZ2Uud2Fsa3Rocm91Z2hNZXRhZGF0YSc7XG5leHBvcnQgdHlwZSBXYWxrdGhyb3VnaE1ldGFEYXRhVHlwZSA9IE1hcDxzdHJpbmcsIHsgZmlyc3RTZWVuOiBudW1iZXI7IHN0ZXBJRHM6IHN0cmluZ1tdOyBtYW5hdWxseU9wZW5lZDogYm9vbGVhbiB9PjtcblxuY29uc3QgQlVJTFRfSU5fU09VUkNFID0gbG9jYWxpemUoJ2J1aWx0aW4nLCBcIkJ1aWx0LUluXCIpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElXYWxrdGhyb3VnaCB7XG5cdGlkOiBzdHJpbmc7XG5cdHRpdGxlOiBzdHJpbmc7XG5cdGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdG9yZGVyOiBudW1iZXI7XG5cdHNvdXJjZTogc3RyaW5nO1xuXHRpc0ZlYXR1cmVkOiBib29sZWFuO1xuXHRuZXh0Pzogc3RyaW5nO1xuXHR3aGVuOiBDb250ZXh0S2V5RXhwcmVzc2lvbjtcblx0c3RlcHM6IElXYWxrdGhyb3VnaFN0ZXBbXTtcblx0aWNvbjpcblx0fCB7IHR5cGU6ICdpY29uJzsgaWNvbjogVGhlbWVJY29uIH1cblx0fCB7IHR5cGU6ICdpbWFnZSc7IHBhdGg6IHN0cmluZyB9O1xuXHR3YWxrdGhyb3VnaFBhZ2VUaXRsZTogc3RyaW5nO1xufVxuXG5leHBvcnQgdHlwZSBJV2Fsa3Rocm91Z2hMb29zZSA9IE9taXQ8SVdhbGt0aHJvdWdoLCAnc3RlcHMnPiAmIHsgc3RlcHM6IChPbWl0PElXYWxrdGhyb3VnaFN0ZXAsICdkZXNjcmlwdGlvbic+ICYgeyBkZXNjcmlwdGlvbjogc3RyaW5nIH0pW10gfTtcblxuZXhwb3J0IGludGVyZmFjZSBJUmVzb2x2ZWRXYWxrdGhyb3VnaCBleHRlbmRzIElXYWxrdGhyb3VnaCB7XG5cdHN0ZXBzOiBJUmVzb2x2ZWRXYWxrdGhyb3VnaFN0ZXBbXTtcblx0bmV3SXRlbXM6IGJvb2xlYW47XG5cdHJlY2VuY3lCb251czogbnVtYmVyO1xuXHRuZXdFbnRyeTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV2Fsa3Rocm91Z2hTdGVwIHtcblx0aWQ6IHN0cmluZztcblx0dGl0bGU6IHN0cmluZztcblx0ZGVzY3JpcHRpb246IExpbmtlZFRleHRbXTtcblx0Y2F0ZWdvcnk6IHN0cmluZztcblx0d2hlbjogQ29udGV4dEtleUV4cHJlc3Npb247XG5cdG9yZGVyOiBudW1iZXI7XG5cdGNvbXBsZXRpb25FdmVudHM6IHN0cmluZ1tdO1xuXHRtZWRpYTpcblx0fCB7IHR5cGU6ICdpbWFnZSc7IHBhdGg6IHsgaGNEYXJrOiBVUkk7IGhjTGlnaHQ6IFVSSTsgbGlnaHQ6IFVSSTsgZGFyazogVVJJIH07IGFsdFRleHQ6IHN0cmluZyB9XG5cdHwgeyB0eXBlOiAnc3ZnJzsgcGF0aDogVVJJOyBhbHRUZXh0OiBzdHJpbmcgfVxuXHR8IHsgdHlwZTogJ21hcmtkb3duJzsgcGF0aDogVVJJOyBiYXNlOiBVUkk7IHJvb3Q6IFVSSSB9XG5cdHwgeyB0eXBlOiAndmlkZW8nOyBwYXRoOiB7IGhjRGFyazogVVJJOyBoY0xpZ2h0OiBVUkk7IGxpZ2h0OiBVUkk7IGRhcms6IFVSSSB9OyBwb3N0ZXI/OiB7IGhjRGFyazogVVJJOyBoY0xpZ2h0OiBVUkk7IGxpZ2h0OiBVUkk7IGRhcms6IFVSSSB9OyByb290OiBVUkk7IGFsdFRleHQ6IHN0cmluZyB9O1xufVxuXG50eXBlIFN0ZXBQcm9ncmVzcyA9IHsgZG9uZTogYm9vbGVhbiB9O1xuXG5leHBvcnQgaW50ZXJmYWNlIElSZXNvbHZlZFdhbGt0aHJvdWdoU3RlcCBleHRlbmRzIElXYWxrdGhyb3VnaFN0ZXAsIFN0ZXBQcm9ncmVzcyB7IH1cblxuZXhwb3J0IGludGVyZmFjZSBJV2Fsa3Rocm91Z2hzU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbkRpZEFkZFdhbGt0aHJvdWdoOiBFdmVudDxJUmVzb2x2ZWRXYWxrdGhyb3VnaD47XG5cdHJlYWRvbmx5IG9uRGlkUmVtb3ZlV2Fsa3Rocm91Z2g6IEV2ZW50PHN0cmluZz47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlV2Fsa3Rocm91Z2g6IEV2ZW50PElSZXNvbHZlZFdhbGt0aHJvdWdoPjtcblx0cmVhZG9ubHkgb25EaWRQcm9ncmVzc1N0ZXA6IEV2ZW50PElSZXNvbHZlZFdhbGt0aHJvdWdoU3RlcD47XG5cblx0Z2V0V2Fsa3Rocm91Z2hzKCk6IElSZXNvbHZlZFdhbGt0aHJvdWdoW107XG5cdGdldFdhbGt0aHJvdWdoKGlkOiBzdHJpbmcpOiBJUmVzb2x2ZWRXYWxrdGhyb3VnaDtcblxuXHRyZWdpc3RlcldhbGt0aHJvdWdoKGRlc2NyaXB0b3I6IElXYWxrdGhyb3VnaExvb3NlKTogdm9pZDtcblxuXHRwcm9ncmVzc0J5RXZlbnQoZXZlbnROYW1lOiBzdHJpbmcpOiB2b2lkO1xuXHRwcm9ncmVzc1N0ZXAoaWQ6IHN0cmluZyk6IHZvaWQ7XG5cdGRlcHJvZ3Jlc3NTdGVwKGlkOiBzdHJpbmcpOiB2b2lkO1xuXG5cdG1hcmtXYWxrdGhyb3VnaE9wZW5lZChpZDogc3RyaW5nKTogdm9pZDtcbn1cblxuLy8gU2hvdyB3YWxrdGhyb3VnaCBhcyBcIm5ld1wiIGZvciA3IGRheXMgYWZ0ZXIgZmlyc3QgaW5zdGFsbFxuY29uc3QgREFZUyA9IDI0ICogNjAgKiA2MCAqIDEwMDA7XG5jb25zdCBORVdfV0FMS1RIUk9VR0hfVElNRSA9IDcgKiBEQVlTO1xuXG5leHBvcnQgY2xhc3MgV2Fsa3Rocm91Z2hzU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV2Fsa3Rocm91Z2hzU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWRkV2Fsa3Rocm91Z2ggPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUmVzb2x2ZWRXYWxrdGhyb3VnaD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQWRkV2Fsa3Rocm91Z2g6IEV2ZW50PElSZXNvbHZlZFdhbGt0aHJvdWdoPiA9IHRoaXMuX29uRGlkQWRkV2Fsa3Rocm91Z2guZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVtb3ZlV2Fsa3Rocm91Z2ggPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlbW92ZVdhbGt0aHJvdWdoOiBFdmVudDxzdHJpbmc+ID0gdGhpcy5fb25EaWRSZW1vdmVXYWxrdGhyb3VnaC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VXYWxrdGhyb3VnaCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElSZXNvbHZlZFdhbGt0aHJvdWdoPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VXYWxrdGhyb3VnaDogRXZlbnQ8SVJlc29sdmVkV2Fsa3Rocm91Z2g+ID0gdGhpcy5fb25EaWRDaGFuZ2VXYWxrdGhyb3VnaC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRQcm9ncmVzc1N0ZXAgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUmVzb2x2ZWRXYWxrdGhyb3VnaFN0ZXA+KCkpO1xuXHRyZWFkb25seSBvbkRpZFByb2dyZXNzU3RlcDogRXZlbnQ8SVJlc29sdmVkV2Fsa3Rocm91Z2hTdGVwPiA9IHRoaXMuX29uRGlkUHJvZ3Jlc3NTdGVwLmV2ZW50O1xuXG5cdHByaXZhdGUgbWVtZW50bzogTWVtZW50bzxSZWNvcmQ8c3RyaW5nLCBTdGVwUHJvZ3Jlc3MgfCB1bmRlZmluZWQ+Pjtcblx0cHJpdmF0ZSBzdGVwUHJvZ3Jlc3M6IFJlY29yZDxzdHJpbmcsIFN0ZXBQcm9ncmVzcyB8IHVuZGVmaW5lZD47XG5cblx0cHJpdmF0ZSBzZXNzaW9uRXZlbnRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgY29tcGxldGlvbkxpc3RlbmVycyA9IG5ldyBNYXA8c3RyaW5nLCBTZXQ8c3RyaW5nPj4oKTtcblxuXHRwcml2YXRlIGdldHRpbmdTdGFydGVkQ29udHJpYnV0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJV2Fsa3Rocm91Z2g+KCk7XG5cdHByaXZhdGUgc3RlcHMgPSBuZXcgTWFwPHN0cmluZywgSVdhbGt0aHJvdWdoU3RlcD4oKTtcblxuXHRwcml2YXRlIHNlc3Npb25JbnN0YWxsZWRFeHRlbnNpb25zOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdHByaXZhdGUgY2F0ZWdvcnlWaXNpYmlsaXR5Q29udGV4dEtleXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSBzdGVwQ29tcGxldGlvbkNvbnRleHRLZXlFeHByZXNzaW9ucyA9IG5ldyBTZXQ8Q29udGV4dEtleUV4cHJlc3Npb24+KCk7XG5cdHByaXZhdGUgc3RlcENvbXBsZXRpb25Db250ZXh0S2V5cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdHByaXZhdGUgbWV0YWRhdGE6IFdhbGt0aHJvdWdoTWV0YURhdGFUeXBlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJVmlld3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlld3NTZXJ2aWNlOiBJVmlld3NTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0YXNFeHBlcmltZW50U2VydmljZTogSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLm1ldGFkYXRhID0gbmV3IE1hcChcblx0XHRcdEpTT04ucGFyc2UoXG5cdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KHdhbGt0aHJvdWdoTWV0YWRhdGFDb25maWd1cmF0aW9uS2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgJ1tdJykpKTtcblxuXHRcdHRoaXMubWVtZW50byA9IG5ldyBNZW1lbnRvKCdnZXR0aW5nU3RhcnRlZFNlcnZpY2UnLCB0aGlzLnN0b3JhZ2VTZXJ2aWNlKTtcblx0XHR0aGlzLnN0ZXBQcm9ncmVzcyA9IHRoaXMubWVtZW50by5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0dGhpcy5pbml0Q29tcGxldGlvbkV2ZW50TGlzdGVuZXJzKCk7XG5cblx0XHRIYXNNdWx0aXBsZU5ld0ZpbGVFbnRyaWVzLmJpbmRUbyh0aGlzLmNvbnRleHRTZXJ2aWNlKS5zZXQoZmFsc2UpO1xuXHRcdHRoaXMucmVnaXN0ZXJXYWxrdGhyb3VnaHMoKTtcblxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlcldhbGt0aHJvdWdocygpIHtcblxuXHRcdHdhbGt0aHJvdWdocy5mb3JFYWNoKGFzeW5jIChjYXRlZ29yeSwgaW5kZXgpID0+IHtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXJXYWxrdGhyb3VnaCh7XG5cdFx0XHRcdC4uLmNhdGVnb3J5LFxuXHRcdFx0XHRpY29uOiB7IHR5cGU6ICdpY29uJywgaWNvbjogY2F0ZWdvcnkuaWNvbiB9LFxuXHRcdFx0XHRvcmRlcjogd2Fsa3Rocm91Z2hzLmxlbmd0aCAtIGluZGV4LFxuXHRcdFx0XHRzb3VyY2U6IEJVSUxUX0lOX1NPVVJDRSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoY2F0ZWdvcnkud2hlbikgPz8gQ29udGV4dEtleUV4cHIudHJ1ZSgpLFxuXHRcdFx0XHRzdGVwczpcblx0XHRcdFx0XHRjYXRlZ29yeS5jb250ZW50LnN0ZXBzLm1hcCgoc3RlcCwgaW5kZXgpID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiAoe1xuXHRcdFx0XHRcdFx0XHQuLi5zdGVwLFxuXHRcdFx0XHRcdFx0XHRjb21wbGV0aW9uRXZlbnRzOiBzdGVwLmNvbXBsZXRpb25FdmVudHMgPz8gW10sXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBwYXJzZURlc2NyaXB0aW9uKHN0ZXAuZGVzY3JpcHRpb24pLFxuXHRcdFx0XHRcdFx0XHRjYXRlZ29yeTogY2F0ZWdvcnkuaWQsXG5cdFx0XHRcdFx0XHRcdG9yZGVyOiBpbmRleCxcblx0XHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoc3RlcC53aGVuKSA/PyBDb250ZXh0S2V5RXhwci50cnVlKCksXG5cdFx0XHRcdFx0XHRcdG1lZGlhOiBzdGVwLm1lZGlhLnR5cGUgPT09ICdpbWFnZSdcblx0XHRcdFx0XHRcdFx0XHQ/IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdpbWFnZScsXG5cdFx0XHRcdFx0XHRcdFx0XHRhbHRUZXh0OiBzdGVwLm1lZGlhLmFsdFRleHQsXG5cdFx0XHRcdFx0XHRcdFx0XHRwYXRoOiBjb252ZXJ0SW50ZXJuYWxNZWRpYVBhdGhzVG9Ccm93c2VyVVJJcyhzdGVwLm1lZGlhLnBhdGgpXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdDogc3RlcC5tZWRpYS50eXBlID09PSAnc3ZnJ1xuXHRcdFx0XHRcdFx0XHRcdFx0PyB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRhbHRUZXh0OiBzdGVwLm1lZGlhLmFsdFRleHQsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHBhdGg6IGNvbnZlcnRJbnRlcm5hbE1lZGlhUGF0aFRvRmlsZVVSSShzdGVwLm1lZGlhLnBhdGgpLndpdGgoeyBxdWVyeTogSlNPTi5zdHJpbmdpZnkoeyBtb2R1bGVJZDogJ3ZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVHZXR0aW5nU3RhcnRlZC9jb21tb24vbWVkaWEvJyArIHN0ZXAubWVkaWEucGF0aCB9KSB9KVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0OiBzdGVwLm1lZGlhLnR5cGUgPT09ICdtYXJrZG93bidcblx0XHRcdFx0XHRcdFx0XHRcdFx0PyB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ21hcmtkb3duJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRwYXRoOiBjb252ZXJ0SW50ZXJuYWxNZWRpYVBhdGhUb0ZpbGVVUkkoc3RlcC5tZWRpYS5wYXRoKS53aXRoKHsgcXVlcnk6IEpTT04uc3RyaW5naWZ5KHsgbW9kdWxlSWQ6ICd2cy93b3JrYmVuY2gvY29udHJpYi93ZWxjb21lR2V0dGluZ1N0YXJ0ZWQvY29tbW9uL21lZGlhLycgKyBzdGVwLm1lZGlhLnBhdGggfSkgfSksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0YmFzZTogRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVHZXR0aW5nU3RhcnRlZC9jb21tb24vbWVkaWEvJyksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0cm9vdDogRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVHZXR0aW5nU3RhcnRlZC9jb21tb24vbWVkaWEvJyksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0OiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3ZpZGVvJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRwYXRoOiBjb252ZXJ0UmVsYXRpdmVNZWRpYVBhdGhzVG9XZWJ2aWV3VVJJcyhGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvd29ya2JlbmNoL2NvbnRyaWIvd2VsY29tZUdldHRpbmdTdGFydGVkL2NvbW1vbi9tZWRpYS8nKSwgc3RlcC5tZWRpYS5wYXRoKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRhbHRUZXh0OiBzdGVwLm1lZGlhLmFsdFRleHQsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0cm9vdDogRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVHZXR0aW5nU3RhcnRlZC9jb21tb24vbWVkaWEvJyksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0cG9zdGVyOiBzdGVwLm1lZGlhLnBvc3RlciA/IGNvbnZlcnRSZWxhdGl2ZU1lZGlhUGF0aHNUb1dlYnZpZXdVUklzKEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvY29udHJpYi93ZWxjb21lR2V0dGluZ1N0YXJ0ZWQvY29tbW9uL21lZGlhLycpLCBzdGVwLm1lZGlhLnBvc3RlcikgOiB1bmRlZmluZWRcblx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHdhbGt0aHJvdWdoc0V4dGVuc2lvblBvaW50LnNldEhhbmRsZXIoKF8sIHsgYWRkZWQsIHJlbW92ZWQgfSkgPT4ge1xuXHRcdFx0YWRkZWQubWFwKGUgPT4gdGhpcy5yZWdpc3RlckV4dGVuc2lvbldhbGt0aHJvdWdoQ29udHJpYnV0aW9ucyhlLmRlc2NyaXB0aW9uKSk7XG5cdFx0XHRyZW1vdmVkLm1hcChlID0+IHRoaXMudW5yZWdpc3RlckV4dGVuc2lvbldhbGt0aHJvdWdoQ29udHJpYnV0aW9ucyhlLmRlc2NyaXB0aW9uKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGluaXRDb21wbGV0aW9uRXZlbnRMaXN0ZW5lcnMoKSB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb21tYW5kU2VydmljZS5vbkRpZEV4ZWN1dGVDb21tYW5kKGNvbW1hbmQgPT4gdGhpcy5wcm9ncmVzc0J5RXZlbnQoYG9uQ29tbWFuZDoke2NvbW1hbmQuY29tbWFuZElkfWApKSk7XG5cblx0XHR0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZCgpLnRoZW4oaW5zdGFsbGVkID0+IHtcblx0XHRcdGluc3RhbGxlZC5mb3JFYWNoKGV4dCA9PiB0aGlzLnByb2dyZXNzQnlFdmVudChgZXh0ZW5zaW9uSW5zdGFsbGVkOiR7ZXh0LmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKX1gKSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkSW5zdGFsbEV4dGVuc2lvbnMoKHJlc3VsdCkgPT4ge1xuXG5cdFx0XHRmb3IgKGNvbnN0IGUgb2YgcmVzdWx0KSB7XG5cdFx0XHRcdGNvbnN0IHNraXBXYWxrdGhyb3VnaCA9IGU/LmNvbnRleHQ/LltFWFRFTlNJT05fSU5TVEFMTF9TS0lQX1dBTEtUSFJPVUdIX0NPTlRFWFRdIHx8IGU/LmNvbnRleHQ/LltFWFRFTlNJT05fSU5TVEFMTF9ERVBfUEFDS19DT05URVhUXTtcblx0XHRcdFx0Ly8gSWYgdGhlIHdpbmRvdyBoYWQgbGFzdCBmb2N1cyBhbmQgdGhlIGluc3RhbGwgZGlkbid0IHNwZWNpZnkgdG8gc2tpcCB0aGUgd2Fsa3Rocm91Z2hcblx0XHRcdFx0Ly8gVGhlbiBhZGQgaXQgdG8gdGhlIHNlc3Npb25JbnN0YWxsRXh0ZW5zaW9ucyB0byBiZSBvcGVuZWRcblx0XHRcdFx0aWYgKCFza2lwV2Fsa3Rocm91Z2gpIHtcblx0XHRcdFx0XHR0aGlzLnNlc3Npb25JbnN0YWxsZWRFeHRlbnNpb25zLmFkZChlLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5wcm9ncmVzc0J5RXZlbnQoYGV4dGVuc2lvbkluc3RhbGxlZDoke2UuaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpfWApO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC5hZmZlY3RzU29tZSh0aGlzLnN0ZXBDb21wbGV0aW9uQ29udGV4dEtleXMpKSB7XG5cdFx0XHRcdHRoaXMuc3RlcENvbXBsZXRpb25Db250ZXh0S2V5RXhwcmVzc2lvbnMuZm9yRWFjaChleHByZXNzaW9uID0+IHtcblx0XHRcdFx0XHRpZiAoZXZlbnQuYWZmZWN0c1NvbWUobmV3IFNldChleHByZXNzaW9uLmtleXMoKSkpICYmIHRoaXMuY29udGV4dFNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhleHByZXNzaW9uKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5wcm9ncmVzc0J5RXZlbnQoYG9uQ29udGV4dDpgICsgZXhwcmVzc2lvbi5zZXJpYWxpemUoKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdzU2VydmljZS5vbkRpZENoYW5nZVZpZXdWaXNpYmlsaXR5KGUgPT4ge1xuXHRcdFx0aWYgKGUudmlzaWJsZSkgeyB0aGlzLnByb2dyZXNzQnlFdmVudCgnb25WaWV3OicgKyBlLmlkKTsgfVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0ZS5hZmZlY3RlZEtleXMuZm9yRWFjaChrZXkgPT4geyB0aGlzLnByb2dyZXNzQnlFdmVudCgnb25TZXR0aW5nQ2hhbmdlZDonICsga2V5KTsgfSk7XG5cdFx0fSkpO1xuXG5cdFx0aWYgKHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKCkpIHsgdGhpcy5wcm9ncmVzc0J5RXZlbnQoJ29uRXZlbnQ6c3luYy1lbmFibGVkJyk7IH1cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlRW5hYmxlbWVudCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoKSkgeyB0aGlzLnByb2dyZXNzQnlFdmVudCgnb25FdmVudDpzeW5jLWVuYWJsZWQnKTsgfVxuXHRcdH0pKTtcblx0fVxuXG5cdG1hcmtXYWxrdGhyb3VnaE9wZW5lZChpZDogc3RyaW5nKSB7XG5cdFx0Y29uc3Qgd2Fsa3Rocm91Z2ggPSB0aGlzLmdldHRpbmdTdGFydGVkQ29udHJpYnV0aW9ucy5nZXQoaWQpO1xuXHRcdGNvbnN0IHByaW9yID0gdGhpcy5tZXRhZGF0YS5nZXQoaWQpO1xuXHRcdGlmIChwcmlvciAmJiB3YWxrdGhyb3VnaCkge1xuXHRcdFx0dGhpcy5tZXRhZGF0YS5zZXQoaWQsIHsgLi4ucHJpb3IsIG1hbmF1bGx5T3BlbmVkOiB0cnVlLCBzdGVwSURzOiB3YWxrdGhyb3VnaC5zdGVwcy5tYXAocyA9PiBzLmlkKSB9KTtcblx0XHR9XG5cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHdhbGt0aHJvdWdoTWV0YWRhdGFDb25maWd1cmF0aW9uS2V5LCBKU09OLnN0cmluZ2lmeShbLi4udGhpcy5tZXRhZGF0YS5lbnRyaWVzKCldKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlZ2lzdGVyRXh0ZW5zaW9uV2Fsa3Rocm91Z2hDb250cmlidXRpb25zKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKSB7XG5cdFx0Y29uc3QgY29udmVydEV4dGVuc2lvblBhdGhUb0ZpbGVVUkkgPSAocGF0aDogc3RyaW5nKSA9PiBwYXRoLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJylcblx0XHRcdD8gVVJJLnBhcnNlKHBhdGgsIHRydWUpXG5cdFx0XHQ6IEZpbGVBY2Nlc3MudXJpVG9GaWxlVXJpKGpvaW5QYXRoKGV4dGVuc2lvbi5leHRlbnNpb25Mb2NhdGlvbiwgcGF0aCkpO1xuXG5cdFx0Y29uc3QgY29udmVydEV4dGVuc2lvblJlbGF0aXZlUGF0aHNUb0Jyb3dzZXJVUklzID0gKHBhdGg6IHN0cmluZyB8IHsgaGM6IHN0cmluZzsgaGNMaWdodD86IHN0cmluZzsgZGFyazogc3RyaW5nOyBsaWdodDogc3RyaW5nIH0pOiB7IGhjRGFyazogVVJJOyBoY0xpZ2h0OiBVUkk7IGRhcms6IFVSSTsgbGlnaHQ6IFVSSSB9ID0+IHtcblx0XHRcdGNvbnN0IGNvbnZlcnRQYXRoID0gKHBhdGg6IHN0cmluZykgPT4gcGF0aC5zdGFydHNXaXRoKCdodHRwczovLycpXG5cdFx0XHRcdD8gVVJJLnBhcnNlKHBhdGgsIHRydWUpXG5cdFx0XHRcdDogRmlsZUFjY2Vzcy51cmlUb0Jyb3dzZXJVcmkoam9pblBhdGgoZXh0ZW5zaW9uLmV4dGVuc2lvbkxvY2F0aW9uLCBwYXRoKSk7XG5cblx0XHRcdGlmICh0eXBlb2YgcGF0aCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0Y29uc3QgY29udmVydGVkID0gY29udmVydFBhdGgocGF0aCk7XG5cdFx0XHRcdHJldHVybiB7IGhjRGFyazogY29udmVydGVkLCBoY0xpZ2h0OiBjb252ZXJ0ZWQsIGRhcms6IGNvbnZlcnRlZCwgbGlnaHQ6IGNvbnZlcnRlZCB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRoY0Rhcms6IGNvbnZlcnRQYXRoKHBhdGguaGMpLFxuXHRcdFx0XHRcdGhjTGlnaHQ6IGNvbnZlcnRQYXRoKHBhdGguaGNMaWdodCA/PyBwYXRoLmxpZ2h0KSxcblx0XHRcdFx0XHRsaWdodDogY29udmVydFBhdGgocGF0aC5saWdodCksXG5cdFx0XHRcdFx0ZGFyazogY29udmVydFBhdGgocGF0aC5kYXJrKVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRpZiAoIShleHRlbnNpb24uY29udHJpYnV0ZXM/LndhbGt0aHJvdWdocz8ubGVuZ3RoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBzZWN0aW9uVG9PcGVuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHNlY3Rpb25Ub09wZW5JbmRleCA9IE1hdGgubWluKCk7IC8vICcrSW5maW5pdHknO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKGV4dGVuc2lvbi5jb250cmlidXRlcz8ud2Fsa3Rocm91Z2hzPy5tYXAoYXN5bmMgKHdhbGt0aHJvdWdoLCBpbmRleCkgPT4ge1xuXHRcdFx0Y29uc3QgY2F0ZWdvcnlJRCA9IGV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlICsgJyMnICsgd2Fsa3Rocm91Z2guaWQ7XG5cblx0XHRcdGNvbnN0IGlzTmV3bHlJbnN0YWxsZWQgPSAhdGhpcy5tZXRhZGF0YS5nZXQoY2F0ZWdvcnlJRCk7XG5cdFx0XHRpZiAoaXNOZXdseUluc3RhbGxlZCkge1xuXHRcdFx0XHR0aGlzLm1ldGFkYXRhLnNldChjYXRlZ29yeUlELCB7IGZpcnN0U2VlbjogK25ldyBEYXRlKCksIHN0ZXBJRHM6IHdhbGt0aHJvdWdoLnN0ZXBzPy5tYXAocyA9PiBzLmlkKSA/PyBbXSwgbWFuYXVsbHlPcGVuZWQ6IGZhbHNlIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvdmVycmlkZSA9IGF3YWl0IFByb21pc2UucmFjZShbXG5cdFx0XHRcdHRoaXMudGFzRXhwZXJpbWVudFNlcnZpY2U/LmdldFRyZWF0bWVudDxzdHJpbmc+KGBnZXR0aW5nU3RhcnRlZC5vdmVycmlkZUNhdGVnb3J5LiR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUgKyAnLicgKyB3YWxrdGhyb3VnaC5pZH0ud2hlbmApLFxuXHRcdFx0XHRuZXcgUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4gc2V0VGltZW91dCgoKSA9PiByZXNvbHZlKHdhbGt0aHJvdWdoLndoZW4pLCA1MDAwKSlcblx0XHRcdF0pO1xuXG5cdFx0XHRpZiAodGhpcy5zZXNzaW9uSW5zdGFsbGVkRXh0ZW5zaW9ucy5oYXMoZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUudG9Mb3dlckNhc2UoKSlcblx0XHRcdFx0JiYgdGhpcy5jb250ZXh0U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKG92ZXJyaWRlID8/IHdhbGt0aHJvdWdoLndoZW4pID8/IENvbnRleHRLZXlFeHByLnRydWUoKSlcblx0XHRcdCkge1xuXHRcdFx0XHR0aGlzLnNlc3Npb25JbnN0YWxsZWRFeHRlbnNpb25zLmRlbGV0ZShleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZS50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdFx0aWYgKGluZGV4IDwgc2VjdGlvblRvT3BlbkluZGV4ICYmIGlzTmV3bHlJbnN0YWxsZWQpIHtcblx0XHRcdFx0XHRzZWN0aW9uVG9PcGVuID0gY2F0ZWdvcnlJRDtcblx0XHRcdFx0XHRzZWN0aW9uVG9PcGVuSW5kZXggPSBpbmRleDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGVwcyA9ICh3YWxrdGhyb3VnaC5zdGVwcyA/PyBbXSkubWFwKChzdGVwLCBpbmRleCkgPT4ge1xuXHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHBhcnNlRGVzY3JpcHRpb24oc3RlcC5kZXNjcmlwdGlvbiB8fCAnJyk7XG5cdFx0XHRcdGNvbnN0IGZ1bGx5UXVhbGlmaWVkSUQgPSBleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSArICcjJyArIHdhbGt0aHJvdWdoLmlkICsgJyMnICsgc3RlcC5pZDtcblxuXHRcdFx0XHRsZXQgbWVkaWE6IElXYWxrdGhyb3VnaFN0ZXBbJ21lZGlhJ107XG5cblx0XHRcdFx0aWYgKCFzdGVwLm1lZGlhKSB7XG5cdFx0XHRcdFx0dGhyb3cgRXJyb3IoJ21pc3NpbmcgbWVkaWEgaW4gd2Fsa3Rocm91Z2ggc3RlcDogJyArIHdhbGt0aHJvdWdoLmlkICsgJ0AnICsgc3RlcC5pZCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoc3RlcC5tZWRpYS5pbWFnZSkge1xuXHRcdFx0XHRcdGNvbnN0IGFsdFRleHQgPSBzdGVwLm1lZGlhLmFsdFRleHQ7XG5cdFx0XHRcdFx0aWYgKGFsdFRleHQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0Y29uc29sZS5lcnJvcignV2Fsa3Rocm91Z2ggaXRlbTonLCBmdWxseVF1YWxpZmllZElELCAnaXMgbWlzc2luZyBhbHRUZXh0IGZvciBpdHMgbWVkaWEgZWxlbWVudC4nKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bWVkaWEgPSB7IHR5cGU6ICdpbWFnZScsIGFsdFRleHQsIHBhdGg6IGNvbnZlcnRFeHRlbnNpb25SZWxhdGl2ZVBhdGhzVG9Ccm93c2VyVVJJcyhzdGVwLm1lZGlhLmltYWdlKSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2UgaWYgKHN0ZXAubWVkaWEubWFya2Rvd24pIHtcblx0XHRcdFx0XHRtZWRpYSA9IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdtYXJrZG93bicsXG5cdFx0XHRcdFx0XHRwYXRoOiBjb252ZXJ0RXh0ZW5zaW9uUGF0aFRvRmlsZVVSSShzdGVwLm1lZGlhLm1hcmtkb3duKSxcblx0XHRcdFx0XHRcdGJhc2U6IGNvbnZlcnRFeHRlbnNpb25QYXRoVG9GaWxlVVJJKGRpcm5hbWUoc3RlcC5tZWRpYS5tYXJrZG93bikpLFxuXHRcdFx0XHRcdFx0cm9vdDogRmlsZUFjY2Vzcy51cmlUb0ZpbGVVcmkoZXh0ZW5zaW9uLmV4dGVuc2lvbkxvY2F0aW9uKSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2UgaWYgKHN0ZXAubWVkaWEuc3ZnKSB7XG5cdFx0XHRcdFx0bWVkaWEgPSB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3ZnJyxcblx0XHRcdFx0XHRcdHBhdGg6IGNvbnZlcnRFeHRlbnNpb25QYXRoVG9GaWxlVVJJKHN0ZXAubWVkaWEuc3ZnKSxcblx0XHRcdFx0XHRcdGFsdFRleHQ6IHN0ZXAubWVkaWEuc3ZnLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSBpZiAoc3RlcC5tZWRpYS52aWRlbykge1xuXHRcdFx0XHRcdGNvbnN0IGJhc2VVUkkgPSBGaWxlQWNjZXNzLnVyaVRvRmlsZVVyaShleHRlbnNpb24uZXh0ZW5zaW9uTG9jYXRpb24pO1xuXHRcdFx0XHRcdG1lZGlhID0ge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3ZpZGVvJyxcblx0XHRcdFx0XHRcdHBhdGg6IGNvbnZlcnRSZWxhdGl2ZU1lZGlhUGF0aHNUb1dlYnZpZXdVUklzKGJhc2VVUkksIHN0ZXAubWVkaWEudmlkZW8pLFxuXHRcdFx0XHRcdFx0cm9vdDogRmlsZUFjY2Vzcy51cmlUb0ZpbGVVcmkoZXh0ZW5zaW9uLmV4dGVuc2lvbkxvY2F0aW9uKSxcblx0XHRcdFx0XHRcdGFsdFRleHQ6IHN0ZXAubWVkaWEuYWx0VGV4dCxcblx0XHRcdFx0XHRcdHBvc3Rlcjogc3RlcC5tZWRpYS5wb3N0ZXIgPyBjb252ZXJ0UmVsYXRpdmVNZWRpYVBhdGhzVG9XZWJ2aWV3VVJJcyhiYXNlVVJJLCBzdGVwLm1lZGlhLnBvc3RlcikgOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gVGhyb3cgZXJyb3IgZm9yIHVua25vd24gd2Fsa3Rocm91Z2ggZm9ybWF0XG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignVW5rbm93biB3YWxrdGhyb3VnaCBmb3JtYXQgZGV0ZWN0ZWQgZm9yICcgKyBmdWxseVF1YWxpZmllZElEKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiAoe1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdG1lZGlhLFxuXHRcdFx0XHRcdGNvbXBsZXRpb25FdmVudHM6IHN0ZXAuY29tcGxldGlvbkV2ZW50cz8uZmlsdGVyKHggPT4gdHlwZW9mIHggPT09ICdzdHJpbmcnKSA/PyBbXSxcblx0XHRcdFx0XHRpZDogZnVsbHlRdWFsaWZpZWRJRCxcblx0XHRcdFx0XHR0aXRsZTogc3RlcC50aXRsZSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShzdGVwLndoZW4pID8/IENvbnRleHRLZXlFeHByLnRydWUoKSxcblx0XHRcdFx0XHRjYXRlZ29yeTogY2F0ZWdvcnlJRCxcblx0XHRcdFx0XHRvcmRlcjogaW5kZXgsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdGxldCBpc0ZlYXR1cmVkID0gZmFsc2U7XG5cdFx0XHRpZiAod2Fsa3Rocm91Z2guZmVhdHVyZWRGb3IpIHtcblx0XHRcdFx0Y29uc3QgZm9sZGVycyA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5tYXAoZiA9PiBmLnVyaSk7XG5cdFx0XHRcdGNvbnN0IHRva2VuID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gdG9rZW4uY2FuY2VsKCksIDIwMDApO1xuXHRcdFx0XHRpc0ZlYXR1cmVkID0gYXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhID0+IGNoZWNrR2xvYkZpbGVFeGlzdHMoYSwgZm9sZGVycywgd2Fsa3Rocm91Z2guZmVhdHVyZWRGb3IhLCB0b2tlbi50b2tlbikpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpY29uU3RyID0gd2Fsa3Rocm91Z2guaWNvbiA/PyBleHRlbnNpb24uaWNvbjtcblx0XHRcdGNvbnN0IHdhbGt0aG91Z2hEZXNjcmlwdG9yOiBJV2Fsa3Rocm91Z2ggPSB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB3YWxrdGhyb3VnaC5kZXNjcmlwdGlvbixcblx0XHRcdFx0dGl0bGU6IHdhbGt0aHJvdWdoLnRpdGxlLFxuXHRcdFx0XHRpZDogY2F0ZWdvcnlJRCxcblx0XHRcdFx0aXNGZWF0dXJlZCxcblx0XHRcdFx0c291cmNlOiBleHRlbnNpb24uZGlzcGxheU5hbWUgPz8gZXh0ZW5zaW9uLm5hbWUsXG5cdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHR3YWxrdGhyb3VnaFBhZ2VUaXRsZTogZXh0ZW5zaW9uLmRpc3BsYXlOYW1lID8/IGV4dGVuc2lvbi5uYW1lLFxuXHRcdFx0XHRzdGVwcyxcblx0XHRcdFx0aWNvbjogaWNvblN0ciA/IHtcblx0XHRcdFx0XHR0eXBlOiAnaW1hZ2UnLFxuXHRcdFx0XHRcdHBhdGg6IEZpbGVBY2Nlc3MudXJpVG9Ccm93c2VyVXJpKGpvaW5QYXRoKGV4dGVuc2lvbi5leHRlbnNpb25Mb2NhdGlvbiwgaWNvblN0cikpLnRvU3RyaW5nKHRydWUpXG5cdFx0XHRcdH0gOiB7XG5cdFx0XHRcdFx0aWNvbjogZXh0ZW5zaW9uRGVmYXVsdEljb24sXG5cdFx0XHRcdFx0dHlwZTogJ2ljb24nXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKG92ZXJyaWRlID8/IHdhbGt0aHJvdWdoLndoZW4pID8/IENvbnRleHRLZXlFeHByLnRydWUoKSxcblx0XHRcdH0gYXMgY29uc3Q7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyV2Fsa3Rocm91Z2god2Fsa3Rob3VnaERlc2NyaXB0b3IpO1xuXG5cdFx0XHR0aGlzLl9vbkRpZEFkZFdhbGt0aHJvdWdoLmZpcmUodGhpcy5yZXNvbHZlV2Fsa3Rocm91Z2god2Fsa3Rob3VnaERlc2NyaXB0b3IpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHdhbGt0aHJvdWdoTWV0YWRhdGFDb25maWd1cmF0aW9uS2V5LCBKU09OLnN0cmluZ2lmeShbLi4udGhpcy5tZXRhZGF0YS5lbnRyaWVzKCldKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cblx0XHRjb25zdCBoYWRMYXN0Rm91Y3MgPSBhd2FpdCB0aGlzLmhvc3RTZXJ2aWNlLmhhZExhc3RGb2N1cygpO1xuXHRcdGNvbnN0IHN0YXJ0dXBFZGl0b3IgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ3dvcmtiZW5jaC5zdGFydHVwRWRpdG9yJyk7XG5cdFx0aWYgKGhhZExhc3RGb3VjcyAmJiBzZWN0aW9uVG9PcGVuICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignd29ya2JlbmNoLndlbGNvbWVQYWdlLndhbGt0aHJvdWdocy5vcGVuT25JbnN0YWxsJykgJiYgc3RhcnR1cEVkaXRvciAhPT0gJ2FnZW50U2Vzc2lvbnNXZWxjb21lUGFnZScpIHtcblx0XHRcdHR5cGUgR2V0dGluZ1N0YXJ0ZWRBdXRvT3BlbkNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRvd25lcjogJ2xyYW1vczE1Jztcblx0XHRcdFx0Y29tbWVudDogJ1doZW4gYSB3YWxrdGhyb3VnaCBpcyBvcGVuZWQgdXBvbiBleHRlbnNpb24gaW5zdGFsbGF0aW9uJztcblx0XHRcdFx0aWQ6IHtcblx0XHRcdFx0XHRjbGFzc2lmaWNhdGlvbjogJ1B1YmxpY05vblBlcnNvbmFsRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7XG5cdFx0XHRcdFx0b3duZXI6ICdscmFtb3MxNSc7XG5cdFx0XHRcdFx0Y29tbWVudDogJ1VzZWQgdG8gdW5kZXJzdGFuZCB3aGF0IHdhbGt0aHJvdWdocyBhcmUgY29uc3VsdGVkIG1vc3QgZnJlcXVlbnRseSc7XG5cdFx0XHRcdH07XG5cdFx0XHR9O1xuXHRcdFx0dHlwZSBHZXR0aW5nU3RhcnRlZEF1dG9PcGVuRXZlbnQgPSB7XG5cdFx0XHRcdGlkOiBzdHJpbmc7XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8R2V0dGluZ1N0YXJ0ZWRBdXRvT3BlbkV2ZW50LCBHZXR0aW5nU3RhcnRlZEF1dG9PcGVuQ2xhc3NpZmljYXRpb24+KCdnZXR0aW5nU3RhcnRlZC5kaWRBdXRvT3BlbldhbGt0aHJvdWdoJywgeyBpZDogc2VjdGlvblRvT3BlbiB9KTtcblx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3I7XG5cdFx0XHRpZiAoYWN0aXZlRWRpdG9yIGluc3RhbmNlb2YgR2V0dGluZ1N0YXJ0ZWRJbnB1dCkge1xuXHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLmtlZXBFZGl0b3InKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbldhbGt0aHJvdWdoJywgc2VjdGlvblRvT3Blbiwge1xuXHRcdFx0XHRpbmFjdGl2ZTogdGhpcy5sYXlvdXRTZXJ2aWNlLmhhc0ZvY3VzKFBhcnRzLkVESVRPUl9QQVJUKSAvLyBkbyBub3Qgc3RlYWwgdGhlIGFjdGl2ZSBlZGl0b3IgYXdheVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1bnJlZ2lzdGVyRXh0ZW5zaW9uV2Fsa3Rocm91Z2hDb250cmlidXRpb25zKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKSB7XG5cdFx0aWYgKCEoZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzPy53YWxrdGhyb3VnaHM/Lmxlbmd0aCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRleHRlbnNpb24uY29udHJpYnV0ZXM/LndhbGt0aHJvdWdocz8uZm9yRWFjaChzZWN0aW9uID0+IHtcblx0XHRcdGNvbnN0IGNhdGVnb3J5SUQgPSBleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSArICcjJyArIHNlY3Rpb24uaWQ7XG5cdFx0XHRzZWN0aW9uLnN0ZXBzLmZvckVhY2goc3RlcCA9PiB7XG5cdFx0XHRcdGNvbnN0IGZ1bGx5UXVhbGlmaWVkSUQgPSBleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSArICcjJyArIHNlY3Rpb24uaWQgKyAnIycgKyBzdGVwLmlkO1xuXHRcdFx0XHR0aGlzLnN0ZXBzLmRlbGV0ZShmdWxseVF1YWxpZmllZElEKTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5nZXR0aW5nU3RhcnRlZENvbnRyaWJ1dGlvbnMuZGVsZXRlKGNhdGVnb3J5SUQpO1xuXHRcdFx0dGhpcy5fb25EaWRSZW1vdmVXYWxrdGhyb3VnaC5maXJlKGNhdGVnb3J5SUQpO1xuXHRcdH0pO1xuXHR9XG5cblx0Z2V0V2Fsa3Rocm91Z2goaWQ6IHN0cmluZyk6IElSZXNvbHZlZFdhbGt0aHJvdWdoIHtcblxuXHRcdGNvbnN0IHdhbGt0aHJvdWdoID0gdGhpcy5nZXR0aW5nU3RhcnRlZENvbnRyaWJ1dGlvbnMuZ2V0KGlkKTtcblx0XHRpZiAoIXdhbGt0aHJvdWdoKSB7IHRocm93IEVycm9yKCdUcnlpbmcgdG8gZ2V0IHVua25vd24gd2Fsa3Rocm91Z2g6ICcgKyBpZCk7IH1cblx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlV2Fsa3Rocm91Z2god2Fsa3Rocm91Z2gpO1xuXHR9XG5cblx0Z2V0V2Fsa3Rocm91Z2hzKCk6IElSZXNvbHZlZFdhbGt0aHJvdWdoW10ge1xuXG5cdFx0Y29uc3QgcmVnaXN0ZXJlZENhdGVnb3JpZXMgPSBbLi4udGhpcy5nZXR0aW5nU3RhcnRlZENvbnRyaWJ1dGlvbnMudmFsdWVzKCldO1xuXHRcdGNvbnN0IGNhdGVnb3JpZXNXaXRoQ29tcGxldGlvbiA9IHJlZ2lzdGVyZWRDYXRlZ29yaWVzXG5cdFx0XHQubWFwKGNhdGVnb3J5ID0+IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHQuLi5jYXRlZ29yeSxcblx0XHRcdFx0XHRjb250ZW50OiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RlcHMnIGFzIGNvbnN0LFxuXHRcdFx0XHRcdFx0c3RlcHM6IGNhdGVnb3J5LnN0ZXBzXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0fSlcblx0XHRcdC5maWx0ZXIoY2F0ZWdvcnkgPT4gY2F0ZWdvcnkuY29udGVudC50eXBlICE9PSAnc3RlcHMnIHx8IGNhdGVnb3J5LmNvbnRlbnQuc3RlcHMubGVuZ3RoKVxuXHRcdFx0LmZpbHRlcihjYXRlZ29yeSA9PiBjYXRlZ29yeS5pZCAhPT0gJ05ld1dlbGNvbWVFeHBlcmllbmNlJylcblx0XHRcdC5tYXAoY2F0ZWdvcnkgPT4gdGhpcy5yZXNvbHZlV2Fsa3Rocm91Z2goY2F0ZWdvcnkpKTtcblxuXHRcdHJldHVybiBjYXRlZ29yaWVzV2l0aENvbXBsZXRpb247XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVXYWxrdGhyb3VnaChjYXRlZ29yeTogSVdhbGt0aHJvdWdoKTogSVJlc29sdmVkV2Fsa3Rocm91Z2gge1xuXG5cdFx0Y29uc3Qgc3RlcHNXaXRoUHJvZ3Jlc3MgPSBjYXRlZ29yeS5zdGVwcy5tYXAoc3RlcCA9PiB0aGlzLmdldFN0ZXBQcm9ncmVzcyhzdGVwKSk7XG5cblx0XHRjb25zdCBoYXNPcGVuZWQgPSB0aGlzLm1ldGFkYXRhLmdldChjYXRlZ29yeS5pZCk/Lm1hbmF1bGx5T3BlbmVkO1xuXHRcdGNvbnN0IGZpcnN0U2VlbkRhdGUgPSB0aGlzLm1ldGFkYXRhLmdldChjYXRlZ29yeS5pZCk/LmZpcnN0U2Vlbjtcblx0XHRjb25zdCBpc05ldyA9IGZpcnN0U2VlbkRhdGUgJiYgZmlyc3RTZWVuRGF0ZSA+ICgrbmV3IERhdGUoKSAtIE5FV19XQUxLVEhST1VHSF9USU1FKTtcblxuXHRcdGNvbnN0IGxhc3RTdGVwSURzID0gdGhpcy5tZXRhZGF0YS5nZXQoY2F0ZWdvcnkuaWQpPy5zdGVwSURzO1xuXHRcdGNvbnN0IHJhd0NhdGVnb3J5ID0gdGhpcy5nZXR0aW5nU3RhcnRlZENvbnRyaWJ1dGlvbnMuZ2V0KGNhdGVnb3J5LmlkKTtcblx0XHRpZiAoIXJhd0NhdGVnb3J5KSB7IHRocm93IEVycm9yKCdDb3VsZCBub3QgZmluZCB3YWxrdGhyb3VnaCB3aXRoIGlkICcgKyBjYXRlZ29yeS5pZCk7IH1cblxuXHRcdGNvbnN0IGN1cnJlbnRTdGVwSWRzOiBzdHJpbmdbXSA9IHJhd0NhdGVnb3J5LnN0ZXBzLm1hcChzID0+IHMuaWQpO1xuXG5cdFx0Y29uc3QgaGFzTmV3U3RlcHMgPSBsYXN0U3RlcElEcyAmJiAoY3VycmVudFN0ZXBJZHMubGVuZ3RoICE9PSBsYXN0U3RlcElEcy5sZW5ndGggfHwgY3VycmVudFN0ZXBJZHMuc29tZSgoaWQsIGluZGV4KSA9PiBpZCAhPT0gbGFzdFN0ZXBJRHNbaW5kZXhdKSk7XG5cblx0XHRsZXQgcmVjZW5jeUJvbnVzID0gMDtcblx0XHRpZiAoZmlyc3RTZWVuRGF0ZSkge1xuXHRcdFx0Y29uc3QgY3VycmVudERhdGUgPSArbmV3IERhdGUoKTtcblx0XHRcdGNvbnN0IHRpbWVTaW5jZUZpcnN0U2VlbiA9IGN1cnJlbnREYXRlIC0gZmlyc3RTZWVuRGF0ZTtcblx0XHRcdHJlY2VuY3lCb251cyA9IE1hdGgubWF4KDAsIChORVdfV0FMS1RIUk9VR0hfVElNRSAtIHRpbWVTaW5jZUZpcnN0U2VlbikgLyBORVdfV0FMS1RIUk9VR0hfVElNRSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmNhdGVnb3J5LFxuXHRcdFx0cmVjZW5jeUJvbnVzLFxuXHRcdFx0c3RlcHM6IHN0ZXBzV2l0aFByb2dyZXNzLFxuXHRcdFx0bmV3SXRlbXM6ICEhaGFzTmV3U3RlcHMsXG5cdFx0XHRuZXdFbnRyeTogISEoaXNOZXcgJiYgIWhhc09wZW5lZCksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U3RlcFByb2dyZXNzKHN0ZXA6IElXYWxrdGhyb3VnaFN0ZXApOiBJUmVzb2x2ZWRXYWxrdGhyb3VnaFN0ZXAge1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5zdGVwLFxuXHRcdFx0ZG9uZTogZmFsc2UsXG5cdFx0XHQuLi50aGlzLnN0ZXBQcm9ncmVzc1tzdGVwLmlkXVxuXHRcdH07XG5cdH1cblxuXHRwcm9ncmVzc1N0ZXAoaWQ6IHN0cmluZykge1xuXHRcdGNvbnN0IG9sZFByb2dyZXNzID0gdGhpcy5zdGVwUHJvZ3Jlc3NbaWRdO1xuXHRcdGlmICghb2xkUHJvZ3Jlc3MgfHwgb2xkUHJvZ3Jlc3MuZG9uZSAhPT0gdHJ1ZSkge1xuXHRcdFx0dGhpcy5zdGVwUHJvZ3Jlc3NbaWRdID0geyBkb25lOiB0cnVlIH07XG5cdFx0XHR0aGlzLm1lbWVudG8uc2F2ZU1lbWVudG8oKTtcblx0XHRcdGNvbnN0IHN0ZXAgPSB0aGlzLmdldFN0ZXAoaWQpO1xuXHRcdFx0aWYgKCFzdGVwKSB7IHRocm93IEVycm9yKCdUcmllZCB0byBwcm9ncmVzcyB1bmtub3duIHN0ZXAnKTsgfVxuXG5cdFx0XHR0aGlzLl9vbkRpZFByb2dyZXNzU3RlcC5maXJlKHRoaXMuZ2V0U3RlcFByb2dyZXNzKHN0ZXApKTtcblx0XHR9XG5cdH1cblxuXHRkZXByb2dyZXNzU3RlcChpZDogc3RyaW5nKSB7XG5cdFx0ZGVsZXRlIHRoaXMuc3RlcFByb2dyZXNzW2lkXTtcblx0XHR0aGlzLm1lbWVudG8uc2F2ZU1lbWVudG8oKTtcblx0XHRjb25zdCBzdGVwID0gdGhpcy5nZXRTdGVwKGlkKTtcblx0XHR0aGlzLl9vbkRpZFByb2dyZXNzU3RlcC5maXJlKHRoaXMuZ2V0U3RlcFByb2dyZXNzKHN0ZXApKTtcblx0fVxuXG5cdHByb2dyZXNzQnlFdmVudChldmVudDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc2Vzc2lvbkV2ZW50cy5oYXMoZXZlbnQpKSB7IHJldHVybjsgfVxuXG5cdFx0dGhpcy5zZXNzaW9uRXZlbnRzLmFkZChldmVudCk7XG5cdFx0dGhpcy5jb21wbGV0aW9uTGlzdGVuZXJzLmdldChldmVudCk/LmZvckVhY2goaWQgPT4gdGhpcy5wcm9ncmVzc1N0ZXAoaWQpKTtcblx0fVxuXG5cdHJlZ2lzdGVyV2Fsa3Rocm91Z2god2Fsa3Rob3VnaERlc2NyaXB0b3I6IElXYWxrdGhyb3VnaExvb3NlKSB7XG5cdFx0dGhpcy5fcmVnaXN0ZXJXYWxrdGhyb3VnaCh7XG5cdFx0XHQuLi53YWxrdGhvdWdoRGVzY3JpcHRvcixcblx0XHRcdHN0ZXBzOiB3YWxrdGhvdWdoRGVzY3JpcHRvci5zdGVwcy5tYXAoc3RlcCA9PiAoeyAuLi5zdGVwLCBkZXNjcmlwdGlvbjogcGFyc2VEZXNjcmlwdGlvbihzdGVwLmRlc2NyaXB0aW9uKSB9KSlcblx0XHR9KTtcblx0fVxuXG5cdF9yZWdpc3RlcldhbGt0aHJvdWdoKHdhbGt0aHJvdWdoRGVzY3JpcHRvcjogSVdhbGt0aHJvdWdoKTogdm9pZCB7XG5cdFx0Y29uc3Qgb2xkQ2F0ZWdvcnkgPSB0aGlzLmdldHRpbmdTdGFydGVkQ29udHJpYnV0aW9ucy5nZXQod2Fsa3Rocm91Z2hEZXNjcmlwdG9yLmlkKTtcblx0XHRpZiAob2xkQ2F0ZWdvcnkpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoYFNraXBwaW5nIGF0dGVtcHQgdG8gb3ZlcndyaXRlIHdhbGt0aHJvdWdoLiAoJHt3YWxrdGhyb3VnaERlc2NyaXB0b3IuaWR9KWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZ2V0dGluZ1N0YXJ0ZWRDb250cmlidXRpb25zLnNldCh3YWxrdGhyb3VnaERlc2NyaXB0b3IuaWQsIHdhbGt0aHJvdWdoRGVzY3JpcHRvcik7XG5cblx0XHR3YWxrdGhyb3VnaERlc2NyaXB0b3Iuc3RlcHMuZm9yRWFjaChzdGVwID0+IHtcblx0XHRcdGlmICh0aGlzLnN0ZXBzLmhhcyhzdGVwLmlkKSkgeyB0aHJvdyBFcnJvcignQXR0ZW1wdGluZyB0byByZWdpc3RlciBzdGVwIHdpdGggaWQgJyArIHN0ZXAuaWQgKyAnIHR3aWNlLiBTZWNvbmQgaXMgZHJvcHBlZC4nKTsgfVxuXHRcdFx0dGhpcy5zdGVwcy5zZXQoc3RlcC5pZCwgc3RlcCk7XG5cdFx0XHRzdGVwLndoZW4ua2V5cygpLmZvckVhY2goa2V5ID0+IHRoaXMuY2F0ZWdvcnlWaXNpYmlsaXR5Q29udGV4dEtleXMuYWRkKGtleSkpO1xuXHRcdFx0dGhpcy5yZWdpc3RlckRvbmVMaXN0ZW5lcnMoc3RlcCk7XG5cdFx0fSk7XG5cblx0XHR3YWxrdGhyb3VnaERlc2NyaXB0b3Iud2hlbi5rZXlzKCkuZm9yRWFjaChrZXkgPT4gdGhpcy5jYXRlZ29yeVZpc2liaWxpdHlDb250ZXh0S2V5cy5hZGQoa2V5KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyRG9uZUxpc3RlbmVycyhzdGVwOiBJV2Fsa3Rocm91Z2hTdGVwKSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0aWYgKChzdGVwIGFzIGFueSkuZG9uZU9uKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKGB3YWt0aHJvdWdoIHN0ZXBgLCBzdGVwLCBgdXNlcyBkZXByZWNhdGVkICdkb25lT24nIHByb3BlcnR5LiBBZG9wdCAnY29tcGxldGlvbkV2ZW50cycgdG8gc2lsZW5jZSB0aGlzIHdhcm5pbmdgKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXN0ZXAuY29tcGxldGlvbkV2ZW50cy5sZW5ndGgpIHtcblx0XHRcdHN0ZXAuY29tcGxldGlvbkV2ZW50cyA9IGNvYWxlc2NlKFxuXHRcdFx0XHRzdGVwLmRlc2NyaXB0aW9uXG5cdFx0XHRcdFx0LmZpbHRlcihsaW5rZWRUZXh0ID0+IGxpbmtlZFRleHQubm9kZXMubGVuZ3RoID09PSAxKSAvLyBvbmx5IGJ1dHRvbnNcblx0XHRcdFx0XHQuZmxhdE1hcChsaW5rZWRUZXh0ID0+XG5cdFx0XHRcdFx0XHRsaW5rZWRUZXh0Lm5vZGVzXG5cdFx0XHRcdFx0XHRcdC5maWx0ZXIoKChub2RlKTogbm9kZSBpcyBJTGluayA9PiB0eXBlb2Ygbm9kZSAhPT0gJ3N0cmluZycpKVxuXHRcdFx0XHRcdFx0XHQubWFwKCh7IGhyZWYgfSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChocmVmLnN0YXJ0c1dpdGgoJ2NvbW1hbmQ6JykpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiAnb25Db21tYW5kOicgKyBocmVmLnNsaWNlKCdjb21tYW5kOicubGVuZ3RoLCBocmVmLmluY2x1ZGVzKCc/JykgPyBocmVmLmluZGV4T2YoJz8nKSA6IHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdGlmIChocmVmLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykgfHwgaHJlZi5zdGFydHNXaXRoKCdodHRwOi8vJykpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiAnb25MaW5rOicgKyBocmVmO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0XHR9KSkpO1xuXHRcdH1cblxuXHRcdGlmICghc3RlcC5jb21wbGV0aW9uRXZlbnRzLmxlbmd0aCkge1xuXHRcdFx0c3RlcC5jb21wbGV0aW9uRXZlbnRzLnB1c2goJ3N0ZXBTZWxlY3RlZCcpO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGV2ZW50IG9mIHN0ZXAuY29tcGxldGlvbkV2ZW50cykge1xuXHRcdFx0Y29uc3QgW18sIGV2ZW50VHlwZSwgYXJndW1lbnRdID0gL14oW146XSopOj8oLiopJC8uZXhlYyhldmVudCkgPz8gW107XG5cblx0XHRcdGlmICghZXZlbnRUeXBlKSB7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoYFVua25vd24gY29tcGxldGlvbkV2ZW50ICR7ZXZlbnR9IHdoZW4gcmVnaXN0ZXJpbmcgc3RlcCAke3N0ZXAuaWR9YCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRzd2l0Y2ggKGV2ZW50VHlwZSkge1xuXHRcdFx0XHRjYXNlICdvbkxpbmsnOiBjYXNlICdvbkV2ZW50JzogY2FzZSAnb25WaWV3JzogY2FzZSAnb25TZXR0aW5nQ2hhbmdlZCc6XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ29uQ29udGV4dCc6IHtcblx0XHRcdFx0XHRjb25zdCBleHByZXNzaW9uID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoYXJndW1lbnQpO1xuXHRcdFx0XHRcdGlmIChleHByZXNzaW9uKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnN0ZXBDb21wbGV0aW9uQ29udGV4dEtleUV4cHJlc3Npb25zLmFkZChleHByZXNzaW9uKTtcblx0XHRcdFx0XHRcdGV4cHJlc3Npb24ua2V5cygpLmZvckVhY2goa2V5ID0+IHRoaXMuc3RlcENvbXBsZXRpb25Db250ZXh0S2V5cy5hZGQoa2V5KSk7XG5cdFx0XHRcdFx0XHRldmVudCA9IGV2ZW50VHlwZSArICc6JyArIGV4cHJlc3Npb24uc2VyaWFsaXplKCk7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5jb250ZXh0U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKGV4cHJlc3Npb24pKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuc2Vzc2lvbkV2ZW50cy5hZGQoZXZlbnQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zb2xlLmVycm9yKCdVbmFibGUgdG8gcGFyc2UgY29udGV4dCBrZXkgZXhwcmVzc2lvbjonLCBleHByZXNzaW9uLCAnaW4gd2Fsa3Rocm91Z2ggc3RlcCcsIHN0ZXAuaWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdvblN0ZXBTZWxlY3RlZCc6IGNhc2UgJ3N0ZXBTZWxlY3RlZCc6XG5cdFx0XHRcdFx0ZXZlbnQgPSAnc3RlcFNlbGVjdGVkOicgKyBzdGVwLmlkO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdvbkNvbW1hbmQnOlxuXHRcdFx0XHRcdGV2ZW50ID0gZXZlbnRUeXBlICsgJzonICsgYXJndW1lbnQucmVwbGFjZSgvXnRvU2lkZTovLCAnJyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ29uRXh0ZW5zaW9uSW5zdGFsbGVkJzogY2FzZSAnZXh0ZW5zaW9uSW5zdGFsbGVkJzpcblx0XHRcdFx0XHRldmVudCA9ICdleHRlbnNpb25JbnN0YWxsZWQ6JyArIGFyZ3VtZW50LnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0Y29uc29sZS5lcnJvcihgVW5rbm93biBjb21wbGV0aW9uRXZlbnQgJHtldmVudH0gd2hlbiByZWdpc3RlcmluZyBzdGVwICR7c3RlcC5pZH1gKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5yZWdpc3RlckNvbXBsZXRpb25MaXN0ZW5lcihldmVudCwgc3RlcCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckNvbXBsZXRpb25MaXN0ZW5lcihldmVudDogc3RyaW5nLCBzdGVwOiBJV2Fsa3Rocm91Z2hTdGVwKSB7XG5cdFx0aWYgKCF0aGlzLmNvbXBsZXRpb25MaXN0ZW5lcnMuaGFzKGV2ZW50KSkge1xuXHRcdFx0dGhpcy5jb21wbGV0aW9uTGlzdGVuZXJzLnNldChldmVudCwgbmV3IFNldCgpKTtcblx0XHR9XG5cdFx0dGhpcy5jb21wbGV0aW9uTGlzdGVuZXJzLmdldChldmVudCk/LmFkZChzdGVwLmlkKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U3RlcChpZDogc3RyaW5nKTogSVdhbGt0aHJvdWdoU3RlcCB7XG5cdFx0Y29uc3Qgc3RlcCA9IHRoaXMuc3RlcHMuZ2V0KGlkKTtcblx0XHRpZiAoIXN0ZXApIHsgdGhyb3cgRXJyb3IoJ0F0dGVtcHRpbmcgdG8gYWNjZXNzIHN0ZXAgd2hpY2ggZG9lcyBub3QgZXhpc3QgaW4gcmVnaXN0cnkgJyArIGlkKTsgfVxuXHRcdHJldHVybiBzdGVwO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBwYXJzZURlc2NyaXB0aW9uID0gKGRlc2M6IHN0cmluZyk6IExpbmtlZFRleHRbXSA9PiBkZXNjLnNwbGl0KCdcXG4nKS5maWx0ZXIoeCA9PiB4KS5tYXAodGV4dCA9PiBwYXJzZUxpbmtlZFRleHQodGV4dCkpO1xuXG5leHBvcnQgY29uc3QgY29udmVydEludGVybmFsTWVkaWFQYXRoVG9GaWxlVVJJID0gKHBhdGg6IHN0cmluZykgPT4gcGF0aC5zdGFydHNXaXRoKCdodHRwczovLycpXG5cdD8gVVJJLnBhcnNlKHBhdGgsIHRydWUpXG5cdDogRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoYHZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVHZXR0aW5nU3RhcnRlZC9jb21tb24vbWVkaWEvJHtwYXRofWApO1xuXG5jb25zdCBjb252ZXJ0SW50ZXJuYWxNZWRpYVBhdGhUb0Jyb3dzZXJVUkkgPSAocGF0aDogc3RyaW5nKSA9PiBwYXRoLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJylcblx0PyBVUkkucGFyc2UocGF0aCwgdHJ1ZSlcblx0OiBGaWxlQWNjZXNzLmFzQnJvd3NlclVyaShgdnMvd29ya2JlbmNoL2NvbnRyaWIvd2VsY29tZUdldHRpbmdTdGFydGVkL2NvbW1vbi9tZWRpYS8ke3BhdGh9YCk7XG5jb25zdCBjb252ZXJ0SW50ZXJuYWxNZWRpYVBhdGhzVG9Ccm93c2VyVVJJcyA9IChwYXRoOiBzdHJpbmcgfCB7IGhjOiBzdHJpbmc7IGhjTGlnaHQ/OiBzdHJpbmc7IGRhcms6IHN0cmluZzsgbGlnaHQ6IHN0cmluZyB9KTogeyBoY0Rhcms6IFVSSTsgaGNMaWdodDogVVJJOyBkYXJrOiBVUkk7IGxpZ2h0OiBVUkkgfSA9PiB7XG5cdGlmICh0eXBlb2YgcGF0aCA9PT0gJ3N0cmluZycpIHtcblx0XHRjb25zdCBjb252ZXJ0ZWQgPSBjb252ZXJ0SW50ZXJuYWxNZWRpYVBhdGhUb0Jyb3dzZXJVUkkocGF0aCk7XG5cdFx0cmV0dXJuIHsgaGNEYXJrOiBjb252ZXJ0ZWQsIGhjTGlnaHQ6IGNvbnZlcnRlZCwgZGFyazogY29udmVydGVkLCBsaWdodDogY29udmVydGVkIH07XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGhjRGFyazogY29udmVydEludGVybmFsTWVkaWFQYXRoVG9Ccm93c2VyVVJJKHBhdGguaGMpLFxuXHRcdFx0aGNMaWdodDogY29udmVydEludGVybmFsTWVkaWFQYXRoVG9Ccm93c2VyVVJJKHBhdGguaGNMaWdodCA/PyBwYXRoLmxpZ2h0KSxcblx0XHRcdGxpZ2h0OiBjb252ZXJ0SW50ZXJuYWxNZWRpYVBhdGhUb0Jyb3dzZXJVUkkocGF0aC5saWdodCksXG5cdFx0XHRkYXJrOiBjb252ZXJ0SW50ZXJuYWxNZWRpYVBhdGhUb0Jyb3dzZXJVUkkocGF0aC5kYXJrKVxuXHRcdH07XG5cdH1cbn07XG5cbmNvbnN0IGNvbnZlcnRSZWxhdGl2ZU1lZGlhUGF0aHNUb1dlYnZpZXdVUklzID0gKGJhc2VQYXRoOiBVUkksIHBhdGg6IHN0cmluZyB8IHsgaGM6IHN0cmluZzsgaGNMaWdodD86IHN0cmluZzsgZGFyazogc3RyaW5nOyBsaWdodDogc3RyaW5nIH0pOiB7IGhjRGFyazogVVJJOyBoY0xpZ2h0OiBVUkk7IGRhcms6IFVSSTsgbGlnaHQ6IFVSSSB9ID0+IHtcblx0Y29uc3QgY29udmVydFBhdGggPSAocGF0aDogc3RyaW5nKSA9PiBwYXRoLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJylcblx0XHQ/IFVSSS5wYXJzZShwYXRoLCB0cnVlKVxuXHRcdDogYXNXZWJ2aWV3VXJpKGpvaW5QYXRoKGJhc2VQYXRoLCBwYXRoKSk7XG5cblx0aWYgKHR5cGVvZiBwYXRoID09PSAnc3RyaW5nJykge1xuXHRcdGNvbnN0IGNvbnZlcnRlZCA9IGNvbnZlcnRQYXRoKHBhdGgpO1xuXHRcdHJldHVybiB7IGhjRGFyazogY29udmVydGVkLCBoY0xpZ2h0OiBjb252ZXJ0ZWQsIGRhcms6IGNvbnZlcnRlZCwgbGlnaHQ6IGNvbnZlcnRlZCB9O1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHRoY0Rhcms6IGNvbnZlcnRQYXRoKHBhdGguaGMpLFxuXHRcdFx0aGNMaWdodDogY29udmVydFBhdGgocGF0aC5oY0xpZ2h0ID8/IHBhdGgubGlnaHQpLFxuXHRcdFx0bGlnaHQ6IGNvbnZlcnRQYXRoKHBhdGgubGlnaHQpLFxuXHRcdFx0ZGFyazogY29udmVydFBhdGgocGF0aC5kYXJrKVxuXHRcdH07XG5cdH1cbn07XG5cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAncmVzZXRHZXR0aW5nU3RhcnRlZFByb2dyZXNzJyxcblx0XHRcdGNhdGVnb3J5OiBsb2NhbGl6ZTIoJ2RldmVsb3BlcicsIFwiRGV2ZWxvcGVyXCIpLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncmVzZXRXZWxjb21lUGFnZVdhbGt0aHJvdWdoUHJvZ3Jlc3MnLCBcIlJlc2V0IFdlbGNvbWUgUGFnZSBXYWxrdGhyb3VnaCBQcm9ncmVzc1wiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplMigncmVzZXRHZXR0aW5nU3RhcnRlZFByb2dyZXNzRGVzY3JpcHRpb24nLCAnUmVzZXQgdGhlIHByb2dyZXNzIG9mIGFsbCBXYWxrdGhyb3VnaCBzdGVwcyBvbiB0aGUgV2VsY29tZSBQYWdlIHRvIG1ha2UgdGhlbSBhcHBlYXIgYXMgaWYgdGhleSBhcmUgYmVpbmcgdmlld2VkIGZvciB0aGUgZmlyc3QgdGltZSwgcHJvdmlkaW5nIGEgZnJlc2ggc3RhcnQgdG8gdGhlIGdldHRpbmcgc3RhcnRlZCBleHBlcmllbmNlLicpLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXYWxrdGhyb3VnaHNTZXJ2aWNlKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoXG5cdFx0XHRoaWRkZW5FbnRyaWVzQ29uZmlndXJhdGlvbktleSxcblx0XHRcdEpTT04uc3RyaW5naWZ5KFtdKSxcblx0XHRcdFN0b3JhZ2VTY29wZS5QUk9GSUxFLFxuXHRcdFx0U3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFxuXHRcdFx0d2Fsa3Rocm91Z2hNZXRhZGF0YUNvbmZpZ3VyYXRpb25LZXksXG5cdFx0XHRKU09OLnN0cmluZ2lmeShbXSksXG5cdFx0XHRTdG9yYWdlU2NvcGUuUFJPRklMRSxcblx0XHRcdFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cblx0XHRjb25zdCBtZW1lbnRvID0gbmV3IE1lbWVudG8oJ2dldHRpbmdTdGFydGVkU2VydmljZScsIGFjY2Vzc29yLmdldChJU3RvcmFnZVNlcnZpY2UpKTtcblx0XHRjb25zdCByZWNvcmQgPSBtZW1lbnRvLmdldE1lbWVudG8oU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0Zm9yIChjb25zdCBrZXkgaW4gcmVjb3JkKSB7XG5cdFx0XHRpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlY29yZCwga2V5KSkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGdldHRpbmdTdGFydGVkU2VydmljZS5kZXByb2dyZXNzU3RlcChrZXkpO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5lcnJvcihlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRtZW1lbnRvLnNhdmVNZW1lbnRvKCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlclNpbmdsZXRvbihJV2Fsa3Rocm91Z2hzU2VydmljZSwgV2Fsa3Rocm91Z2hzU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsaUJBQWlCLDZCQUErQztBQUN6RSxT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
