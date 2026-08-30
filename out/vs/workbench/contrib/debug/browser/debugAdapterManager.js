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
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import Severity from "../../../../base/common/severity.js";
import * as strings from "../../../../base/common/strings.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import * as nls from "../../../../nls.js";
import { IMenuService, MenuId, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Extensions as JSONExtensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Breakpoints } from "../common/breakpoints.js";
import { CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_EXTENSION_AVAILABLE, INTERNAL_CONSOLE_OPTIONS_SCHEMA } from "../common/debug.js";
import { Debugger } from "../common/debugger.js";
import { breakpointsExtPoint, debuggersExtPoint, launchSchema, presentationSchema } from "../common/debugSchemas.js";
import { TaskDefinitionRegistry } from "../../tasks/common/taskDefinitionRegistry.js";
import { ITaskService } from "../../tasks/common/taskService.js";
import { launchSchemaId } from "../../../services/configuration/common/configuration.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { ILifecycleService, LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
const jsonRegistry = Registry.as(JSONExtensions.JSONContribution);
let AdapterManager = class extends Disposable {
  constructor(delegate, editorService, configurationService, quickInputService, instantiationService, commandService, extensionService, contextKeyService, languageService, dialogService, lifecycleService, tasksService, menuService) {
    super();
    this.delegate = delegate;
    this.editorService = editorService;
    this.configurationService = configurationService;
    this.quickInputService = quickInputService;
    this.instantiationService = instantiationService;
    this.commandService = commandService;
    this.extensionService = extensionService;
    this.contextKeyService = contextKeyService;
    this.languageService = languageService;
    this.dialogService = dialogService;
    this.lifecycleService = lifecycleService;
    this.tasksService = tasksService;
    this.menuService = menuService;
    this.debugAdapterFactories = /* @__PURE__ */ new Map();
    this._onDidRegisterDebugger = this._register(new Emitter());
    this._onDidDebuggersExtPointRead = this._register(new Emitter());
    this.breakpointContributions = [];
    this.debuggerWhenKeys = /* @__PURE__ */ new Set();
    this.taskLabels = [];
    this.usedDebugTypes = /* @__PURE__ */ new Set();
    this.adapterDescriptorFactories = [];
    this.debuggers = [];
    this.registerListeners();
    this.contextKeyService.bufferChangeEvents(() => {
      this.debuggersAvailable = CONTEXT_DEBUGGERS_AVAILABLE.bindTo(contextKeyService);
      this.debugExtensionsAvailable = CONTEXT_DEBUG_EXTENSION_AVAILABLE.bindTo(contextKeyService);
    });
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(this.debuggerWhenKeys)) {
        this.debuggersAvailable.set(this.hasEnabledDebuggers());
        this.updateDebugAdapterSchema();
      }
    }));
    this._register(this.onDidDebuggersExtPointRead(() => {
      this.debugExtensionsAvailable.set(this.debuggers.length > 0);
    }));
    const updateTaskScheduler = this._register(new RunOnceScheduler(() => this.updateTaskLabels(), 5e3));
    this._register(Event.any(tasksService.onDidChangeTaskConfig, tasksService.onDidChangeTaskProviders)(() => {
      updateTaskScheduler.cancel();
      updateTaskScheduler.schedule();
    }));
    this.lifecycleService.when(LifecyclePhase.Eventually).then(() => this.debugExtensionsAvailable.set(this.debuggers.length > 0));
    this._register(delegate.onDidNewSession((s) => {
      this.usedDebugTypes.add(s.configuration.type);
    }));
    updateTaskScheduler.schedule();
  }
  registerListeners() {
    debuggersExtPoint.setHandler((extensions, delta) => {
      delta.added.forEach((added) => {
        added.value.forEach((rawAdapter) => {
          if (!rawAdapter.type || typeof rawAdapter.type !== "string") {
            added.collector.error(nls.localize("debugNoType", "Debugger 'type' can not be omitted and must be of type 'string'."));
          }
          if (rawAdapter.type !== "*") {
            const existing = this.getDebugger(rawAdapter.type);
            if (existing) {
              existing.merge(rawAdapter, added.description);
            } else {
              const dbg = this.instantiationService.createInstance(Debugger, this, rawAdapter, added.description);
              dbg.when?.keys().forEach((key) => this.debuggerWhenKeys.add(key));
              this.debuggers.push(dbg);
            }
          }
        });
      });
      extensions.forEach((extension) => {
        extension.value.forEach((rawAdapter) => {
          if (rawAdapter.type === "*") {
            this.debuggers.forEach((dbg) => dbg.merge(rawAdapter, extension.description));
          }
        });
      });
      delta.removed.forEach((removed) => {
        const removedTypes = removed.value.map((rawAdapter) => rawAdapter.type);
        this.debuggers = this.debuggers.filter((d) => removedTypes.indexOf(d.type) === -1);
      });
      this.updateDebugAdapterSchema();
      this._onDidDebuggersExtPointRead.fire();
    });
    breakpointsExtPoint.setHandler((extensions) => {
      this.breakpointContributions = extensions.flatMap((ext) => ext.value.map((breakpoint) => this.instantiationService.createInstance(Breakpoints, breakpoint)));
    });
  }
  updateTaskLabels() {
    this.tasksService.getKnownTasks().then((tasks) => {
      this.taskLabels = tasks.map((task) => task._label);
      this.updateDebugAdapterSchema();
    });
  }
  updateDebugAdapterSchema() {
    const items = launchSchema.properties["configurations"].items;
    const taskSchema = TaskDefinitionRegistry.getJsonSchema();
    const definitions = {
      "common": {
        properties: {
          "name": {
            type: "string",
            description: nls.localize("debugName", "Name of configuration; appears in the launch configuration dropdown menu."),
            default: "Launch"
          },
          "debugServer": {
            type: "number",
            description: nls.localize("debugServer", "For debug extension development only: if a port is specified VS Code tries to connect to a debug adapter running in server mode"),
            default: 4711
          },
          "preLaunchTask": {
            anyOf: [taskSchema, {
              type: ["string"]
            }],
            default: "",
            defaultSnippets: [{ body: { task: "", type: "" } }],
            description: nls.localize("debugPrelaunchTask", "Task to run before debug session starts."),
            examples: this.taskLabels
          },
          "postDebugTask": {
            anyOf: [taskSchema, {
              type: ["string"]
            }],
            default: "",
            defaultSnippets: [{ body: { task: "", type: "" } }],
            description: nls.localize("debugPostDebugTask", "Task to run after debug session ends."),
            examples: this.taskLabels
          },
          "presentation": presentationSchema,
          "internalConsoleOptions": INTERNAL_CONSOLE_OPTIONS_SCHEMA,
          "suppressMultipleSessionWarning": {
            type: "boolean",
            description: nls.localize("suppressMultipleSessionWarning", "Disable the warning when trying to start the same debug configuration more than once."),
            default: true
          }
        }
      }
    };
    launchSchema.definitions = definitions;
    items.oneOf = [];
    items.defaultSnippets = [];
    this.debuggers.forEach((adapter) => {
      const schemaAttributes = adapter.getSchemaAttributes(definitions);
      if (schemaAttributes && items.oneOf) {
        items.oneOf.push(...schemaAttributes);
      }
      const configurationSnippets = adapter.configurationSnippets;
      if (configurationSnippets && items.defaultSnippets) {
        items.defaultSnippets.push(...configurationSnippets);
      }
    });
    jsonRegistry.registerSchema(launchSchemaId, launchSchema);
  }
  registerDebugAdapterFactory(debugTypes, debugAdapterLauncher) {
    debugTypes.forEach((debugType) => this.debugAdapterFactories.set(debugType, debugAdapterLauncher));
    this.debuggersAvailable.set(this.hasEnabledDebuggers());
    this._onDidRegisterDebugger.fire();
    return {
      dispose: () => {
        debugTypes.forEach((debugType) => this.debugAdapterFactories.delete(debugType));
      }
    };
  }
  hasEnabledDebuggers() {
    for (const [type] of this.debugAdapterFactories) {
      const dbg = this.getDebugger(type);
      if (dbg && dbg.enabled) {
        return true;
      }
    }
    return false;
  }
  createDebugAdapter(session) {
    const factory = this.debugAdapterFactories.get(session.configuration.type);
    if (factory) {
      return factory.createDebugAdapter(session);
    }
    return void 0;
  }
  substituteVariables(debugType, folder, config) {
    const factory = this.debugAdapterFactories.get(debugType);
    if (factory) {
      return factory.substituteVariables(folder, config);
    }
    return Promise.resolve(config);
  }
  runInTerminal(debugType, args, sessionId) {
    const factory = this.debugAdapterFactories.get(debugType);
    if (factory) {
      return factory.runInTerminal(args, sessionId);
    }
    return Promise.resolve(void 0);
  }
  registerDebugAdapterDescriptorFactory(debugAdapterProvider) {
    this.adapterDescriptorFactories.push(debugAdapterProvider);
    return {
      dispose: () => {
        this.unregisterDebugAdapterDescriptorFactory(debugAdapterProvider);
      }
    };
  }
  unregisterDebugAdapterDescriptorFactory(debugAdapterProvider) {
    const ix = this.adapterDescriptorFactories.indexOf(debugAdapterProvider);
    if (ix >= 0) {
      this.adapterDescriptorFactories.splice(ix, 1);
    }
  }
  getDebugAdapterDescriptor(session) {
    const config = session.configuration;
    const providers = this.adapterDescriptorFactories.filter((p) => p.type === config.type && p.createDebugAdapterDescriptor);
    if (providers.length === 1) {
      return providers[0].createDebugAdapterDescriptor(session);
    } else {
    }
    return Promise.resolve(void 0);
  }
  getDebuggerLabel(type) {
    const dbgr = this.getDebugger(type);
    if (dbgr) {
      return dbgr.label;
    }
    return void 0;
  }
  get onDidRegisterDebugger() {
    return this._onDidRegisterDebugger.event;
  }
  get onDidDebuggersExtPointRead() {
    return this._onDidDebuggersExtPointRead.event;
  }
  canSetBreakpointsIn(model) {
    const languageId = model.getLanguageId();
    if (!languageId || languageId === "jsonc" || languageId === "log") {
      return false;
    }
    if (this.configurationService.getValue("debug").allowBreakpointsEverywhere) {
      return true;
    }
    return this.breakpointContributions.some((breakpoints) => breakpoints.language === languageId && breakpoints.enabled);
  }
  getDebugger(type) {
    return this.debuggers.find((dbg) => strings.equalsIgnoreCase(dbg.type, type));
  }
  getEnabledDebugger(type) {
    const adapter = this.getDebugger(type);
    return adapter && adapter.enabled ? adapter : void 0;
  }
  someDebuggerInterestedInLanguage(languageId) {
    return !!this.debuggers.filter((d) => d.enabled).find((a) => a.interestedInLanguage(languageId));
  }
  async guessDebugger(gettingConfigurations) {
    const activeTextEditorControl = this.editorService.activeTextEditorControl;
    let candidates = [];
    let languageLabel = null;
    let model = null;
    if (isCodeEditor(activeTextEditorControl)) {
      model = activeTextEditorControl.getModel();
      const language = model ? model.getLanguageId() : void 0;
      if (language) {
        languageLabel = this.languageService.getLanguageName(language);
      }
      const adapters = this.debuggers.filter((a) => a.enabled).filter((a) => language && a.interestedInLanguage(language));
      if (adapters.length === 1) {
        return { debugger: adapters[0] };
      }
      if (adapters.length > 1) {
        candidates = adapters;
      }
    }
    if ((!languageLabel || gettingConfigurations || model && this.canSetBreakpointsIn(model)) && candidates.length === 0) {
      await this.activateDebuggers("onDebugInitialConfigurations");
      candidates = this.debuggers.filter((a) => a.enabled).filter((dbg) => dbg.hasInitialConfiguration() || dbg.hasDynamicConfigurationProviders() || dbg.hasConfigurationProvider());
    }
    if (candidates.length === 0 && languageLabel) {
      if (languageLabel.indexOf(" ") >= 0) {
        languageLabel = `'${languageLabel}'`;
      }
      const { confirmed } = await this.dialogService.confirm({
        type: Severity.Warning,
        message: nls.localize("CouldNotFindLanguage", "You don't have an extension for debugging {0}. Should we find a {0} extension in the Marketplace?", languageLabel),
        primaryButton: nls.localize({ key: "findExtension", comment: ["&& denotes a mnemonic"] }, "&&Find {0} extension", languageLabel)
      });
      if (confirmed) {
        await this.commandService.executeCommand("debug.installAdditionalDebuggers", languageLabel);
      }
      return void 0;
    }
    this.initExtensionActivationsIfNeeded();
    candidates.sort((first, second) => first.label.localeCompare(second.label));
    candidates = candidates.filter((a) => !a.isHiddenFromDropdown);
    const suggestedCandidates = [];
    const otherCandidates = [];
    candidates.forEach((d) => {
      const descriptor = d.getMainExtensionDescriptor();
      if (descriptor.id && !!this.earlyActivatedExtensions?.has(descriptor.id)) {
        suggestedCandidates.push(d);
      } else if (this.usedDebugTypes.has(d.type)) {
        suggestedCandidates.push(d);
      } else {
        otherCandidates.push(d);
      }
    });
    const picks = [];
    const dynamic = await this.delegate.configurationManager().getDynamicProviders();
    if (suggestedCandidates.length > 0) {
      picks.push(
        { type: "separator", label: nls.localize("suggestedDebuggers", "Suggested") },
        ...suggestedCandidates.map((c) => ({ label: c.label, pick: () => ({ debugger: c }) }))
      );
    }
    if (otherCandidates.length > 0) {
      if (picks.length > 0) {
        picks.push({ type: "separator", label: "" });
      }
      picks.push(...otherCandidates.map((c) => ({ label: c.label, pick: () => ({ debugger: c }) })));
    }
    if (dynamic.length) {
      if (picks.length) {
        picks.push({ type: "separator", label: "" });
      }
      for (const d of dynamic) {
        picks.push({
          label: nls.localize("moreOptionsForDebugType", "More {0} options...", d.label),
          pick: async () => {
            const cfg = await d.pick();
            if (!cfg) {
              return void 0;
            }
            return cfg && { debugger: this.getDebugger(d.type), withConfig: cfg };
          }
        });
      }
    }
    picks.push(
      { type: "separator", label: "" },
      { label: languageLabel ? nls.localize("installLanguage", "Install an extension for {0}...", languageLabel) : nls.localize("installExt", "Install extension...") }
    );
    const contributed = this.menuService.getMenuActions(MenuId.DebugCreateConfiguration, this.contextKeyService);
    for (const [, action] of contributed) {
      for (const item of action) {
        picks.push(item);
      }
    }
    const placeHolder = nls.localize("selectDebug", "Select debugger");
    return this.quickInputService.pick(picks, { activeItem: picks[0], placeHolder }).then(async (picked) => {
      if (picked && "pick" in picked && typeof picked.pick === "function") {
        return await picked.pick();
      }
      if (picked instanceof MenuItemAction) {
        picked.run();
        return;
      }
      if (picked) {
        this.commandService.executeCommand("debug.installAdditionalDebuggers", languageLabel);
      }
      return void 0;
    });
  }
  initExtensionActivationsIfNeeded() {
    if (!this.earlyActivatedExtensions) {
      this.earlyActivatedExtensions = /* @__PURE__ */ new Set();
      const status = this.extensionService.getExtensionsStatus();
      for (const id in status) {
        if (!!status[id].activationTimes) {
          this.earlyActivatedExtensions.add(id);
        }
      }
    }
  }
  async activateDebuggers(activationEvent, debugType) {
    this.initExtensionActivationsIfNeeded();
    const promises = [
      this.extensionService.activateByEvent(activationEvent),
      this.extensionService.activateByEvent("onDebug")
    ];
    if (debugType) {
      promises.push(this.extensionService.activateByEvent(`${activationEvent}:${debugType}`));
    }
    await Promise.all(promises);
  }
};
AdapterManager = __decorateClass([
  __decorateParam(1, IEditorService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IExtensionService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, ILanguageService),
  __decorateParam(9, IDialogService),
  __decorateParam(10, ILifecycleService),
  __decorateParam(11, ITaskService),
  __decorateParam(12, IMenuService)
], AdapterManager);
export {
  AdapterManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxkZWJ1Z0FkYXB0ZXJNYW5hZ2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEsIElKU09OU2NoZW1hTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGlzQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIEpTT05FeHRlbnNpb25zLCBJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vanNvbnNjaGVtYXMvY29tbW9uL2pzb25Db250cmlidXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgQnJlYWtwb2ludHMgfSBmcm9tICcuLi9jb21tb24vYnJlYWtwb2ludHMuanMnO1xuaW1wb3J0IHsgQ09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFLCBDT05URVhUX0RFQlVHX0VYVEVOU0lPTl9BVkFJTEFCTEUsIElBZGFwdGVyRGVzY3JpcHRvciwgSUFkYXB0ZXJNYW5hZ2VyLCBJQ29uZmlnLCBJQ29uZmlndXJhdGlvbk1hbmFnZXIsIElEZWJ1Z0FkYXB0ZXIsIElEZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeSwgSURlYnVnQWRhcHRlckZhY3RvcnksIElEZWJ1Z0NvbmZpZ3VyYXRpb24sIElEZWJ1Z1Nlc3Npb24sIElHdWVzc2VkRGVidWdnZXIsIElOVEVSTkFMX0NPTlNPTEVfT1BUSU9OU19TQ0hFTUEgfSBmcm9tICcuLi9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgRGVidWdnZXIgfSBmcm9tICcuLi9jb21tb24vZGVidWdnZXIuanMnO1xuaW1wb3J0IHsgYnJlYWtwb2ludHNFeHRQb2ludCwgZGVidWdnZXJzRXh0UG9pbnQsIGxhdW5jaFNjaGVtYSwgcHJlc2VudGF0aW9uU2NoZW1hIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnU2NoZW1hcy5qcyc7XG5pbXBvcnQgeyBUYXNrRGVmaW5pdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vdGFza3MvY29tbW9uL3Rhc2tEZWZpbml0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRhc2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGFza3MvY29tbW9uL3Rhc2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGxhdW5jaFNjaGVtYUlkIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UsIExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG5jb25zdCBqc29uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5PihKU09ORXh0ZW5zaW9ucy5KU09OQ29udHJpYnV0aW9uKTtcblxuZXhwb3J0IGludGVyZmFjZSBJQWRhcHRlck1hbmFnZXJEZWxlZ2F0ZSB7XG5cdHJlYWRvbmx5IG9uRGlkTmV3U2Vzc2lvbjogRXZlbnQ8SURlYnVnU2Vzc2lvbj47XG5cdGNvbmZpZ3VyYXRpb25NYW5hZ2VyKCk6IElDb25maWd1cmF0aW9uTWFuYWdlcjtcbn1cblxuZXhwb3J0IGNsYXNzIEFkYXB0ZXJNYW5hZ2VyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZGFwdGVyTWFuYWdlciB7XG5cblx0cHJpdmF0ZSBkZWJ1Z2dlcnM6IERlYnVnZ2VyW107XG5cdHByaXZhdGUgYWRhcHRlckRlc2NyaXB0b3JGYWN0b3JpZXM6IElEZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeVtdO1xuXHRwcml2YXRlIGRlYnVnQWRhcHRlckZhY3RvcmllcyA9IG5ldyBNYXA8c3RyaW5nLCBJRGVidWdBZGFwdGVyRmFjdG9yeT4oKTtcblx0cHJpdmF0ZSBkZWJ1Z2dlcnNBdmFpbGFibGUhOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBkZWJ1Z0V4dGVuc2lvbnNBdmFpbGFibGUhOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZWdpc3RlckRlYnVnZ2VyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGVidWdnZXJzRXh0UG9pbnRSZWFkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHByaXZhdGUgYnJlYWtwb2ludENvbnRyaWJ1dGlvbnM6IEJyZWFrcG9pbnRzW10gPSBbXTtcblx0cHJpdmF0ZSBkZWJ1Z2dlcldoZW5LZXlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgdGFza0xhYmVsczogc3RyaW5nW10gPSBbXTtcblxuXHQvKiogRXh0ZW5zaW9ucyB0aGF0IHdlcmUgYWxyZWFkeSBhY3RpdmUgYmVmb3JlIGFueSBkZWJ1Z2dlciBhY3RpdmF0aW9uIGV2ZW50cyAqL1xuXHRwcml2YXRlIGVhcmx5QWN0aXZhdGVkRXh0ZW5zaW9uczogU2V0PHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSB1c2VkRGVidWdUeXBlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGVsZWdhdGU6IElBZGFwdGVyTWFuYWdlckRlbGVnYXRlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJVGFza1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0YXNrc1NlcnZpY2U6IElUYXNrU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmFkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yaWVzID0gW107XG5cdFx0dGhpcy5kZWJ1Z2dlcnMgPSBbXTtcblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZS5idWZmZXJDaGFuZ2VFdmVudHMoKCkgPT4ge1xuXHRcdFx0dGhpcy5kZWJ1Z2dlcnNBdmFpbGFibGUgPSBDT05URVhUX0RFQlVHR0VSU19BVkFJTEFCTEUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdHRoaXMuZGVidWdFeHRlbnNpb25zQXZhaWxhYmxlID0gQ09OVEVYVF9ERUJVR19FWFRFTlNJT05fQVZBSUxBQkxFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQoZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzU29tZSh0aGlzLmRlYnVnZ2VyV2hlbktleXMpKSB7XG5cdFx0XHRcdHRoaXMuZGVidWdnZXJzQXZhaWxhYmxlLnNldCh0aGlzLmhhc0VuYWJsZWREZWJ1Z2dlcnMoKSk7XG5cdFx0XHRcdHRoaXMudXBkYXRlRGVidWdBZGFwdGVyU2NoZW1hKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWREZWJ1Z2dlcnNFeHRQb2ludFJlYWQoKCkgPT4ge1xuXHRcdFx0dGhpcy5kZWJ1Z0V4dGVuc2lvbnNBdmFpbGFibGUuc2V0KHRoaXMuZGVidWdnZXJzLmxlbmd0aCA+IDApO1xuXHRcdH0pKTtcblxuXHRcdC8vIGdlbmVyb3VzIGRlYm91bmNlIHNpbmNlIHRoaXMgd2lsbCBlbmQgdXAgY2FsbGluZyBgcmVzb2x2ZVRhc2tgIGludGVybmFsbHlcblx0XHRjb25zdCB1cGRhdGVUYXNrU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy51cGRhdGVUYXNrTGFiZWxzKCksIDUwMDApKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueSh0YXNrc1NlcnZpY2Uub25EaWRDaGFuZ2VUYXNrQ29uZmlnLCB0YXNrc1NlcnZpY2Uub25EaWRDaGFuZ2VUYXNrUHJvdmlkZXJzKSgoKSA9PiB7XG5cdFx0XHR1cGRhdGVUYXNrU2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdFx0dXBkYXRlVGFza1NjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLmxpZmVjeWNsZVNlcnZpY2Uud2hlbihMaWZlY3ljbGVQaGFzZS5FdmVudHVhbGx5KVxuXHRcdFx0LnRoZW4oKCkgPT4gdGhpcy5kZWJ1Z0V4dGVuc2lvbnNBdmFpbGFibGUuc2V0KHRoaXMuZGVidWdnZXJzLmxlbmd0aCA+IDApKTsgLy8gSWYgbm8gZXh0ZW5zaW9ucyB3aXRoIGEgZGVidWdnZXIgY29udHJpYnV0aW9uIGFyZSBsb2FkZWRcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRlbGVnYXRlLm9uRGlkTmV3U2Vzc2lvbihzID0+IHtcblx0XHRcdHRoaXMudXNlZERlYnVnVHlwZXMuYWRkKHMuY29uZmlndXJhdGlvbi50eXBlKTtcblx0XHR9KSk7XG5cblx0XHR1cGRhdGVUYXNrU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdGRlYnVnZ2Vyc0V4dFBvaW50LnNldEhhbmRsZXIoKGV4dGVuc2lvbnMsIGRlbHRhKSA9PiB7XG5cdFx0XHRkZWx0YS5hZGRlZC5mb3JFYWNoKGFkZGVkID0+IHtcblx0XHRcdFx0YWRkZWQudmFsdWUuZm9yRWFjaChyYXdBZGFwdGVyID0+IHtcblx0XHRcdFx0XHRpZiAoIXJhd0FkYXB0ZXIudHlwZSB8fCAodHlwZW9mIHJhd0FkYXB0ZXIudHlwZSAhPT0gJ3N0cmluZycpKSB7XG5cdFx0XHRcdFx0XHRhZGRlZC5jb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdkZWJ1Z05vVHlwZScsIFwiRGVidWdnZXIgJ3R5cGUnIGNhbiBub3QgYmUgb21pdHRlZCBhbmQgbXVzdCBiZSBvZiB0eXBlICdzdHJpbmcnLlwiKSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHJhd0FkYXB0ZXIudHlwZSAhPT0gJyonKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuZ2V0RGVidWdnZXIocmF3QWRhcHRlci50eXBlKTtcblx0XHRcdFx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHRcdFx0XHRleGlzdGluZy5tZXJnZShyYXdBZGFwdGVyLCBhZGRlZC5kZXNjcmlwdGlvbik7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBkYmcgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERlYnVnZ2VyLCB0aGlzLCByYXdBZGFwdGVyLCBhZGRlZC5kZXNjcmlwdGlvbik7XG5cdFx0XHRcdFx0XHRcdGRiZy53aGVuPy5rZXlzKCkuZm9yRWFjaChrZXkgPT4gdGhpcy5kZWJ1Z2dlcldoZW5LZXlzLmFkZChrZXkpKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5kZWJ1Z2dlcnMucHVzaChkYmcpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gdGFrZSBjYXJlIG9mIGFsbCB3aWxkY2FyZCBjb250cmlidXRpb25zXG5cdFx0XHRleHRlbnNpb25zLmZvckVhY2goZXh0ZW5zaW9uID0+IHtcblx0XHRcdFx0ZXh0ZW5zaW9uLnZhbHVlLmZvckVhY2gocmF3QWRhcHRlciA9PiB7XG5cdFx0XHRcdFx0aWYgKHJhd0FkYXB0ZXIudHlwZSA9PT0gJyonKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmRlYnVnZ2Vycy5mb3JFYWNoKGRiZyA9PiBkYmcubWVyZ2UocmF3QWRhcHRlciwgZXh0ZW5zaW9uLmRlc2NyaXB0aW9uKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRkZWx0YS5yZW1vdmVkLmZvckVhY2gocmVtb3ZlZCA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlbW92ZWRUeXBlcyA9IHJlbW92ZWQudmFsdWUubWFwKHJhd0FkYXB0ZXIgPT4gcmF3QWRhcHRlci50eXBlKTtcblx0XHRcdFx0dGhpcy5kZWJ1Z2dlcnMgPSB0aGlzLmRlYnVnZ2Vycy5maWx0ZXIoZCA9PiByZW1vdmVkVHlwZXMuaW5kZXhPZihkLnR5cGUpID09PSAtMSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy51cGRhdGVEZWJ1Z0FkYXB0ZXJTY2hlbWEoKTtcblx0XHRcdHRoaXMuX29uRGlkRGVidWdnZXJzRXh0UG9pbnRSZWFkLmZpcmUoKTtcblx0XHR9KTtcblxuXHRcdGJyZWFrcG9pbnRzRXh0UG9pbnQuc2V0SGFuZGxlcihleHRlbnNpb25zID0+IHtcblx0XHRcdHRoaXMuYnJlYWtwb2ludENvbnRyaWJ1dGlvbnMgPSBleHRlbnNpb25zLmZsYXRNYXAoZXh0ID0+IGV4dC52YWx1ZS5tYXAoYnJlYWtwb2ludCA9PiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJyZWFrcG9pbnRzLCBicmVha3BvaW50KSkpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVUYXNrTGFiZWxzKCkge1xuXHRcdHRoaXMudGFza3NTZXJ2aWNlLmdldEtub3duVGFza3MoKS50aGVuKHRhc2tzID0+IHtcblx0XHRcdHRoaXMudGFza0xhYmVscyA9IHRhc2tzLm1hcCh0YXNrID0+IHRhc2suX2xhYmVsKTtcblx0XHRcdHRoaXMudXBkYXRlRGVidWdBZGFwdGVyU2NoZW1hKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZURlYnVnQWRhcHRlclNjaGVtYSgpIHtcblx0XHQvLyB1cGRhdGUgdGhlIHNjaGVtYSB0byBpbmNsdWRlIGFsbCBhdHRyaWJ1dGVzLCBzbmlwcGV0cyBhbmQgdHlwZXMgZnJvbSBleHRlbnNpb25zLlxuXHRcdGNvbnN0IGl0ZW1zID0gKDxJSlNPTlNjaGVtYT5sYXVuY2hTY2hlbWEucHJvcGVydGllcyFbJ2NvbmZpZ3VyYXRpb25zJ10uaXRlbXMpO1xuXHRcdGNvbnN0IHRhc2tTY2hlbWEgPSBUYXNrRGVmaW5pdGlvblJlZ2lzdHJ5LmdldEpzb25TY2hlbWEoKTtcblx0XHRjb25zdCBkZWZpbml0aW9uczogSUpTT05TY2hlbWFNYXAgPSB7XG5cdFx0XHQnY29tbW9uJzoge1xuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0J25hbWUnOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2RlYnVnTmFtZScsIFwiTmFtZSBvZiBjb25maWd1cmF0aW9uOyBhcHBlYXJzIGluIHRoZSBsYXVuY2ggY29uZmlndXJhdGlvbiBkcm9wZG93biBtZW51LlwiKSxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6ICdMYXVuY2gnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQnZGVidWdTZXJ2ZXInOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2RlYnVnU2VydmVyJywgXCJGb3IgZGVidWcgZXh0ZW5zaW9uIGRldmVsb3BtZW50IG9ubHk6IGlmIGEgcG9ydCBpcyBzcGVjaWZpZWQgVlMgQ29kZSB0cmllcyB0byBjb25uZWN0IHRvIGEgZGVidWcgYWRhcHRlciBydW5uaW5nIGluIHNlcnZlciBtb2RlXCIpLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdDogNDcxMVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J3ByZUxhdW5jaFRhc2snOiB7XG5cdFx0XHRcdFx0XHRhbnlPZjogW3Rhc2tTY2hlbWEsIHtcblx0XHRcdFx0XHRcdFx0dHlwZTogWydzdHJpbmcnXVxuXHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdFx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogeyB0YXNrOiAnJywgdHlwZTogJycgfSB9XSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2RlYnVnUHJlbGF1bmNoVGFzaycsIFwiVGFzayB0byBydW4gYmVmb3JlIGRlYnVnIHNlc3Npb24gc3RhcnRzLlwiKSxcblx0XHRcdFx0XHRcdGV4YW1wbGVzOiB0aGlzLnRhc2tMYWJlbHMsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQncG9zdERlYnVnVGFzayc6IHtcblx0XHRcdFx0XHRcdGFueU9mOiBbdGFza1NjaGVtYSwge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBbJ3N0cmluZyddLFxuXHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdFx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogeyB0YXNrOiAnJywgdHlwZTogJycgfSB9XSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2RlYnVnUG9zdERlYnVnVGFzaycsIFwiVGFzayB0byBydW4gYWZ0ZXIgZGVidWcgc2Vzc2lvbiBlbmRzLlwiKSxcblx0XHRcdFx0XHRcdGV4YW1wbGVzOiB0aGlzLnRhc2tMYWJlbHMsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQncHJlc2VudGF0aW9uJzogcHJlc2VudGF0aW9uU2NoZW1hLFxuXHRcdFx0XHRcdCdpbnRlcm5hbENvbnNvbGVPcHRpb25zJzogSU5URVJOQUxfQ09OU09MRV9PUFRJT05TX1NDSEVNQSxcblx0XHRcdFx0XHQnc3VwcHJlc3NNdWx0aXBsZVNlc3Npb25XYXJuaW5nJzoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc3VwcHJlc3NNdWx0aXBsZVNlc3Npb25XYXJuaW5nJywgXCJEaXNhYmxlIHRoZSB3YXJuaW5nIHdoZW4gdHJ5aW5nIHRvIHN0YXJ0IHRoZSBzYW1lIGRlYnVnIGNvbmZpZ3VyYXRpb24gbW9yZSB0aGFuIG9uY2UuXCIpLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0bGF1bmNoU2NoZW1hLmRlZmluaXRpb25zID0gZGVmaW5pdGlvbnM7XG5cdFx0aXRlbXMub25lT2YgPSBbXTtcblx0XHRpdGVtcy5kZWZhdWx0U25pcHBldHMgPSBbXTtcblx0XHR0aGlzLmRlYnVnZ2Vycy5mb3JFYWNoKGFkYXB0ZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hQXR0cmlidXRlcyA9IGFkYXB0ZXIuZ2V0U2NoZW1hQXR0cmlidXRlcyhkZWZpbml0aW9ucyk7XG5cdFx0XHRpZiAoc2NoZW1hQXR0cmlidXRlcyAmJiBpdGVtcy5vbmVPZikge1xuXHRcdFx0XHRpdGVtcy5vbmVPZi5wdXNoKC4uLnNjaGVtYUF0dHJpYnV0ZXMpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvblNuaXBwZXRzID0gYWRhcHRlci5jb25maWd1cmF0aW9uU25pcHBldHM7XG5cdFx0XHRpZiAoY29uZmlndXJhdGlvblNuaXBwZXRzICYmIGl0ZW1zLmRlZmF1bHRTbmlwcGV0cykge1xuXHRcdFx0XHRpdGVtcy5kZWZhdWx0U25pcHBldHMucHVzaCguLi5jb25maWd1cmF0aW9uU25pcHBldHMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGpzb25SZWdpc3RyeS5yZWdpc3RlclNjaGVtYShsYXVuY2hTY2hlbWFJZCwgbGF1bmNoU2NoZW1hKTtcblx0fVxuXG5cdHJlZ2lzdGVyRGVidWdBZGFwdGVyRmFjdG9yeShkZWJ1Z1R5cGVzOiBzdHJpbmdbXSwgZGVidWdBZGFwdGVyTGF1bmNoZXI6IElEZWJ1Z0FkYXB0ZXJGYWN0b3J5KTogSURpc3Bvc2FibGUge1xuXHRcdGRlYnVnVHlwZXMuZm9yRWFjaChkZWJ1Z1R5cGUgPT4gdGhpcy5kZWJ1Z0FkYXB0ZXJGYWN0b3JpZXMuc2V0KGRlYnVnVHlwZSwgZGVidWdBZGFwdGVyTGF1bmNoZXIpKTtcblx0XHR0aGlzLmRlYnVnZ2Vyc0F2YWlsYWJsZS5zZXQodGhpcy5oYXNFbmFibGVkRGVidWdnZXJzKCkpO1xuXHRcdHRoaXMuX29uRGlkUmVnaXN0ZXJEZWJ1Z2dlci5maXJlKCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRkZWJ1Z1R5cGVzLmZvckVhY2goZGVidWdUeXBlID0+IHRoaXMuZGVidWdBZGFwdGVyRmFjdG9yaWVzLmRlbGV0ZShkZWJ1Z1R5cGUpKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0aGFzRW5hYmxlZERlYnVnZ2VycygpOiBib29sZWFuIHtcblx0XHRmb3IgKGNvbnN0IFt0eXBlXSBvZiB0aGlzLmRlYnVnQWRhcHRlckZhY3Rvcmllcykge1xuXHRcdFx0Y29uc3QgZGJnID0gdGhpcy5nZXREZWJ1Z2dlcih0eXBlKTtcblx0XHRcdGlmIChkYmcgJiYgZGJnLmVuYWJsZWQpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Y3JlYXRlRGVidWdBZGFwdGVyKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24pOiBJRGVidWdBZGFwdGVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmYWN0b3J5ID0gdGhpcy5kZWJ1Z0FkYXB0ZXJGYWN0b3JpZXMuZ2V0KHNlc3Npb24uY29uZmlndXJhdGlvbi50eXBlKTtcblx0XHRpZiAoZmFjdG9yeSkge1xuXHRcdFx0cmV0dXJuIGZhY3RvcnkuY3JlYXRlRGVidWdBZGFwdGVyKHNlc3Npb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0c3Vic3RpdHV0ZVZhcmlhYmxlcyhkZWJ1Z1R5cGU6IHN0cmluZywgZm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkLCBjb25maWc6IElDb25maWcpOiBQcm9taXNlPElDb25maWc+IHtcblx0XHRjb25zdCBmYWN0b3J5ID0gdGhpcy5kZWJ1Z0FkYXB0ZXJGYWN0b3JpZXMuZ2V0KGRlYnVnVHlwZSk7XG5cdFx0aWYgKGZhY3RvcnkpIHtcblx0XHRcdHJldHVybiBmYWN0b3J5LnN1YnN0aXR1dGVWYXJpYWJsZXMoZm9sZGVyLCBjb25maWcpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGNvbmZpZyk7XG5cdH1cblxuXHRydW5JblRlcm1pbmFsKGRlYnVnVHlwZTogc3RyaW5nLCBhcmdzOiBEZWJ1Z1Byb3RvY29sLlJ1bkluVGVybWluYWxSZXF1ZXN0QXJndW1lbnRzLCBzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZmFjdG9yeSA9IHRoaXMuZGVidWdBZGFwdGVyRmFjdG9yaWVzLmdldChkZWJ1Z1R5cGUpO1xuXHRcdGlmIChmYWN0b3J5KSB7XG5cdFx0XHRyZXR1cm4gZmFjdG9yeS5ydW5JblRlcm1pbmFsKGFyZ3MsIHNlc3Npb25JZCk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodm9pZCAwKTtcblx0fVxuXG5cdHJlZ2lzdGVyRGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3RvcnkoZGVidWdBZGFwdGVyUHJvdmlkZXI6IElEZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeSk6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLmFkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yaWVzLnB1c2goZGVidWdBZGFwdGVyUHJvdmlkZXIpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMudW5yZWdpc3RlckRlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5KGRlYnVnQWRhcHRlclByb3ZpZGVyKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0dW5yZWdpc3RlckRlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5KGRlYnVnQWRhcHRlclByb3ZpZGVyOiBJRGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3RvcnkpOiB2b2lkIHtcblx0XHRjb25zdCBpeCA9IHRoaXMuYWRhcHRlckRlc2NyaXB0b3JGYWN0b3JpZXMuaW5kZXhPZihkZWJ1Z0FkYXB0ZXJQcm92aWRlcik7XG5cdFx0aWYgKGl4ID49IDApIHtcblx0XHRcdHRoaXMuYWRhcHRlckRlc2NyaXB0b3JGYWN0b3JpZXMuc3BsaWNlKGl4LCAxKTtcblx0XHR9XG5cdH1cblxuXHRnZXREZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24pOiBQcm9taXNlPElBZGFwdGVyRGVzY3JpcHRvciB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IHNlc3Npb24uY29uZmlndXJhdGlvbjtcblx0XHRjb25zdCBwcm92aWRlcnMgPSB0aGlzLmFkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yaWVzLmZpbHRlcihwID0+IHAudHlwZSA9PT0gY29uZmlnLnR5cGUgJiYgcC5jcmVhdGVEZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yKTtcblx0XHRpZiAocHJvdmlkZXJzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIHByb3ZpZGVyc1swXS5jcmVhdGVEZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yKHNlc3Npb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBUT0RPQEFXIGhhbmRsZSBuID4gMSBjYXNlXG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdGdldERlYnVnZ2VyTGFiZWwodHlwZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBkYmdyID0gdGhpcy5nZXREZWJ1Z2dlcih0eXBlKTtcblx0XHRpZiAoZGJncikge1xuXHRcdFx0cmV0dXJuIGRiZ3IubGFiZWw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCBvbkRpZFJlZ2lzdGVyRGVidWdnZXIoKTogRXZlbnQ8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZFJlZ2lzdGVyRGVidWdnZXIuZXZlbnQ7XG5cdH1cblxuXHRnZXQgb25EaWREZWJ1Z2dlcnNFeHRQb2ludFJlYWQoKTogRXZlbnQ8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZERlYnVnZ2Vyc0V4dFBvaW50UmVhZC5ldmVudDtcblx0fVxuXG5cdGNhblNldEJyZWFrcG9pbnRzSW4obW9kZWw6IElUZXh0TW9kZWwpOiBib29sZWFuIHtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpO1xuXHRcdGlmICghbGFuZ3VhZ2VJZCB8fCBsYW5ndWFnZUlkID09PSAnanNvbmMnIHx8IGxhbmd1YWdlSWQgPT09ICdsb2cnKSB7XG5cdFx0XHQvLyBkbyBub3QgYWxsb3cgYnJlYWtwb2ludHMgaW4gb3VyIHNldHRpbmdzIGZpbGVzIGFuZCBvdXRwdXRcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJykuYWxsb3dCcmVha3BvaW50c0V2ZXJ5d2hlcmUpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmJyZWFrcG9pbnRDb250cmlidXRpb25zLnNvbWUoYnJlYWtwb2ludHMgPT4gYnJlYWtwb2ludHMubGFuZ3VhZ2UgPT09IGxhbmd1YWdlSWQgJiYgYnJlYWtwb2ludHMuZW5hYmxlZCk7XG5cdH1cblxuXHRnZXREZWJ1Z2dlcih0eXBlOiBzdHJpbmcpOiBEZWJ1Z2dlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZGVidWdnZXJzLmZpbmQoZGJnID0+IHN0cmluZ3MuZXF1YWxzSWdub3JlQ2FzZShkYmcudHlwZSwgdHlwZSkpO1xuXHR9XG5cblx0Z2V0RW5hYmxlZERlYnVnZ2VyKHR5cGU6IHN0cmluZyk6IERlYnVnZ2VyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhZGFwdGVyID0gdGhpcy5nZXREZWJ1Z2dlcih0eXBlKTtcblx0XHRyZXR1cm4gYWRhcHRlciAmJiBhZGFwdGVyLmVuYWJsZWQgPyBhZGFwdGVyIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0c29tZURlYnVnZ2VySW50ZXJlc3RlZEluTGFuZ3VhZ2UobGFuZ3VhZ2VJZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5kZWJ1Z2dlcnNcblx0XHRcdC5maWx0ZXIoZCA9PiBkLmVuYWJsZWQpXG5cdFx0XHQuZmluZChhID0+IGEuaW50ZXJlc3RlZEluTGFuZ3VhZ2UobGFuZ3VhZ2VJZCkpO1xuXHR9XG5cblx0YXN5bmMgZ3Vlc3NEZWJ1Z2dlcihnZXR0aW5nQ29uZmlndXJhdGlvbnM6IGJvb2xlYW4pOiBQcm9taXNlPElHdWVzc2VkRGVidWdnZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbDtcblx0XHRsZXQgY2FuZGlkYXRlczogRGVidWdnZXJbXSA9IFtdO1xuXHRcdGxldCBsYW5ndWFnZUxhYmVsOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHRsZXQgbW9kZWw6IElFZGl0b3JNb2RlbCB8IG51bGwgPSBudWxsO1xuXHRcdGlmIChpc0NvZGVFZGl0b3IoYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wpKSB7XG5cdFx0XHRtb2RlbCA9IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sLmdldE1vZGVsKCk7XG5cdFx0XHRjb25zdCBsYW5ndWFnZSA9IG1vZGVsID8gbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGxhbmd1YWdlKSB7XG5cdFx0XHRcdGxhbmd1YWdlTGFiZWwgPSB0aGlzLmxhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZU5hbWUobGFuZ3VhZ2UpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWRhcHRlcnMgPSB0aGlzLmRlYnVnZ2Vyc1xuXHRcdFx0XHQuZmlsdGVyKGEgPT4gYS5lbmFibGVkKVxuXHRcdFx0XHQuZmlsdGVyKGEgPT4gbGFuZ3VhZ2UgJiYgYS5pbnRlcmVzdGVkSW5MYW5ndWFnZShsYW5ndWFnZSkpO1xuXHRcdFx0aWYgKGFkYXB0ZXJzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRyZXR1cm4geyBkZWJ1Z2dlcjogYWRhcHRlcnNbMF0gfTtcblx0XHRcdH1cblx0XHRcdGlmIChhZGFwdGVycy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdGNhbmRpZGF0ZXMgPSBhZGFwdGVycztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBXZSB3YW50IHRvIGdldCB0aGUgZGVidWdnZXJzIHRoYXQgaGF2ZSBjb25maWd1cmF0aW9uIHByb3ZpZGVycyBpbiB0aGUgY2FzZSB3ZSBhcmUgZmV0Y2hpbmcgY29uZmlndXJhdGlvbnNcblx0XHQvLyBPciBpZiBhIGJyZWFrcG9pbnQgY2FuIGJlIHNldCBpbiB0aGUgY3VycmVudCBmaWxlIChnb29kIGhpbnQgdGhhdCBhbiBleHRlbnNpb24gY2FuIGhhbmRsZSBpdClcblx0XHRpZiAoKCFsYW5ndWFnZUxhYmVsIHx8IGdldHRpbmdDb25maWd1cmF0aW9ucyB8fCAobW9kZWwgJiYgdGhpcy5jYW5TZXRCcmVha3BvaW50c0luKG1vZGVsKSkpICYmIGNhbmRpZGF0ZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmFjdGl2YXRlRGVidWdnZXJzKCdvbkRlYnVnSW5pdGlhbENvbmZpZ3VyYXRpb25zJyk7XG5cblx0XHRcdGNhbmRpZGF0ZXMgPSB0aGlzLmRlYnVnZ2Vyc1xuXHRcdFx0XHQuZmlsdGVyKGEgPT4gYS5lbmFibGVkKVxuXHRcdFx0XHQuZmlsdGVyKGRiZyA9PiBkYmcuaGFzSW5pdGlhbENvbmZpZ3VyYXRpb24oKSB8fCBkYmcuaGFzRHluYW1pY0NvbmZpZ3VyYXRpb25Qcm92aWRlcnMoKSB8fCBkYmcuaGFzQ29uZmlndXJhdGlvblByb3ZpZGVyKCkpO1xuXHRcdH1cblxuXHRcdGlmIChjYW5kaWRhdGVzLmxlbmd0aCA9PT0gMCAmJiBsYW5ndWFnZUxhYmVsKSB7XG5cdFx0XHRpZiAobGFuZ3VhZ2VMYWJlbC5pbmRleE9mKCcgJykgPj0gMCkge1xuXHRcdFx0XHRsYW5ndWFnZUxhYmVsID0gYCcke2xhbmd1YWdlTGFiZWx9J2A7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHR0eXBlOiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ0NvdWxkTm90RmluZExhbmd1YWdlJywgXCJZb3UgZG9uJ3QgaGF2ZSBhbiBleHRlbnNpb24gZm9yIGRlYnVnZ2luZyB7MH0uIFNob3VsZCB3ZSBmaW5kIGEgezB9IGV4dGVuc2lvbiBpbiB0aGUgTWFya2V0cGxhY2U/XCIsIGxhbmd1YWdlTGFiZWwpLFxuXHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBubHMubG9jYWxpemUoeyBrZXk6ICdmaW5kRXh0ZW5zaW9uJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRmluZCB7MH0gZXh0ZW5zaW9uXCIsIGxhbmd1YWdlTGFiZWwpXG5cdFx0XHR9KTtcblx0XHRcdGlmIChjb25maXJtZWQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnZGVidWcuaW5zdGFsbEFkZGl0aW9uYWxEZWJ1Z2dlcnMnLCBsYW5ndWFnZUxhYmVsKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5pbml0RXh0ZW5zaW9uQWN0aXZhdGlvbnNJZk5lZWRlZCgpO1xuXG5cdFx0Y2FuZGlkYXRlcy5zb3J0KChmaXJzdCwgc2Vjb25kKSA9PiBmaXJzdC5sYWJlbC5sb2NhbGVDb21wYXJlKHNlY29uZC5sYWJlbCkpO1xuXHRcdGNhbmRpZGF0ZXMgPSBjYW5kaWRhdGVzLmZpbHRlcihhID0+ICFhLmlzSGlkZGVuRnJvbURyb3Bkb3duKTtcblxuXHRcdGNvbnN0IHN1Z2dlc3RlZENhbmRpZGF0ZXM6IERlYnVnZ2VyW10gPSBbXTtcblx0XHRjb25zdCBvdGhlckNhbmRpZGF0ZXM6IERlYnVnZ2VyW10gPSBbXTtcblx0XHRjYW5kaWRhdGVzLmZvckVhY2goZCA9PiB7XG5cdFx0XHRjb25zdCBkZXNjcmlwdG9yID0gZC5nZXRNYWluRXh0ZW5zaW9uRGVzY3JpcHRvcigpO1xuXHRcdFx0aWYgKGRlc2NyaXB0b3IuaWQgJiYgISF0aGlzLmVhcmx5QWN0aXZhdGVkRXh0ZW5zaW9ucz8uaGFzKGRlc2NyaXB0b3IuaWQpKSB7XG5cdFx0XHRcdC8vIFdhcyBhY3RpdmF0ZWQgZWFybHlcblx0XHRcdFx0c3VnZ2VzdGVkQ2FuZGlkYXRlcy5wdXNoKGQpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLnVzZWREZWJ1Z1R5cGVzLmhhcyhkLnR5cGUpKSB7XG5cdFx0XHRcdC8vIFdhcyB1c2VkIGFscmVhZHlcblx0XHRcdFx0c3VnZ2VzdGVkQ2FuZGlkYXRlcy5wdXNoKGQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b3RoZXJDYW5kaWRhdGVzLnB1c2goZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBwaWNrczogKHsgbGFiZWw6IHN0cmluZzsgcGljaz86ICgpID0+IElHdWVzc2VkRGVidWdnZXIgfCBQcm9taXNlPElHdWVzc2VkRGVidWdnZXIgfCB1bmRlZmluZWQ+OyB0eXBlPzogc3RyaW5nIH0gfCBNZW51SXRlbUFjdGlvbilbXSA9IFtdO1xuXHRcdGNvbnN0IGR5bmFtaWMgPSBhd2FpdCB0aGlzLmRlbGVnYXRlLmNvbmZpZ3VyYXRpb25NYW5hZ2VyKCkuZ2V0RHluYW1pY1Byb3ZpZGVycygpO1xuXHRcdGlmIChzdWdnZXN0ZWRDYW5kaWRhdGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHBpY2tzLnB1c2goXG5cdFx0XHRcdHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBubHMubG9jYWxpemUoJ3N1Z2dlc3RlZERlYnVnZ2VycycsIFwiU3VnZ2VzdGVkXCIpIH0sXG5cdFx0XHRcdC4uLnN1Z2dlc3RlZENhbmRpZGF0ZXMubWFwKGMgPT4gKHsgbGFiZWw6IGMubGFiZWwsIHBpY2s6ICgpID0+ICh7IGRlYnVnZ2VyOiBjIH0pIH0pKSk7XG5cdFx0fVxuXG5cdFx0aWYgKG90aGVyQ2FuZGlkYXRlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRpZiAocGlja3MubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRwaWNrcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiAnJyB9KTtcblx0XHRcdH1cblxuXHRcdFx0cGlja3MucHVzaCguLi5vdGhlckNhbmRpZGF0ZXMubWFwKGMgPT4gKHsgbGFiZWw6IGMubGFiZWwsIHBpY2s6ICgpID0+ICh7IGRlYnVnZ2VyOiBjIH0pIH0pKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGR5bmFtaWMubGVuZ3RoKSB7XG5cdFx0XHRpZiAocGlja3MubGVuZ3RoKSB7XG5cdFx0XHRcdHBpY2tzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6ICcnIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGQgb2YgZHluYW1pYykge1xuXHRcdFx0XHRwaWNrcy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdtb3JlT3B0aW9uc0ZvckRlYnVnVHlwZScsIFwiTW9yZSB7MH0gb3B0aW9ucy4uLlwiLCBkLmxhYmVsKSxcblx0XHRcdFx0XHRwaWNrOiBhc3luYyAoKTogUHJvbWlzZTxJR3Vlc3NlZERlYnVnZ2VyIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBjZmcgPSBhd2FpdCBkLnBpY2soKTtcblx0XHRcdFx0XHRcdGlmICghY2ZnKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdFx0XHRcdHJldHVybiBjZmcgJiYgeyBkZWJ1Z2dlcjogdGhpcy5nZXREZWJ1Z2dlcihkLnR5cGUpISwgd2l0aENvbmZpZzogY2ZnIH07XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cGlja3MucHVzaChcblx0XHRcdHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiAnJyB9LFxuXHRcdFx0eyBsYWJlbDogbGFuZ3VhZ2VMYWJlbCA/IG5scy5sb2NhbGl6ZSgnaW5zdGFsbExhbmd1YWdlJywgXCJJbnN0YWxsIGFuIGV4dGVuc2lvbiBmb3IgezB9Li4uXCIsIGxhbmd1YWdlTGFiZWwpIDogbmxzLmxvY2FsaXplKCdpbnN0YWxsRXh0JywgXCJJbnN0YWxsIGV4dGVuc2lvbi4uLlwiKSB9XG5cdFx0KTtcblxuXHRcdGNvbnN0IGNvbnRyaWJ1dGVkID0gdGhpcy5tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhNZW51SWQuRGVidWdDcmVhdGVDb25maWd1cmF0aW9uLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRmb3IgKGNvbnN0IFssIGFjdGlvbl0gb2YgY29udHJpYnV0ZWQpIHtcblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBhY3Rpb24pIHtcblx0XHRcdFx0cGlja3MucHVzaChpdGVtKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBwbGFjZUhvbGRlciA9IG5scy5sb2NhbGl6ZSgnc2VsZWN0RGVidWcnLCBcIlNlbGVjdCBkZWJ1Z2dlclwiKTtcblx0XHRyZXR1cm4gdGhpcy5xdWlja0lucHV0U2VydmljZS5waWNrPHsgbGFiZWw6IHN0cmluZzsgZGVidWdnZXI/OiBEZWJ1Z2dlciB9IHwgSVF1aWNrUGlja0l0ZW0+KHBpY2tzLCB7IGFjdGl2ZUl0ZW06IHBpY2tzWzBdLCBwbGFjZUhvbGRlciB9KS50aGVuKGFzeW5jIHBpY2tlZCA9PiB7XG5cdFx0XHRpZiAocGlja2VkICYmICdwaWNrJyBpbiBwaWNrZWQgJiYgdHlwZW9mIHBpY2tlZC5waWNrID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCBwaWNrZWQucGljaygpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocGlja2VkIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0cGlja2VkLnJ1bigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwaWNrZWQpIHtcblx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnZGVidWcuaW5zdGFsbEFkZGl0aW9uYWxEZWJ1Z2dlcnMnLCBsYW5ndWFnZUxhYmVsKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgaW5pdEV4dGVuc2lvbkFjdGl2YXRpb25zSWZOZWVkZWQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVhcmx5QWN0aXZhdGVkRXh0ZW5zaW9ucykge1xuXHRcdFx0dGhpcy5lYXJseUFjdGl2YXRlZEV4dGVuc2lvbnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdFx0Y29uc3Qgc3RhdHVzID0gdGhpcy5leHRlbnNpb25TZXJ2aWNlLmdldEV4dGVuc2lvbnNTdGF0dXMoKTtcblx0XHRcdGZvciAoY29uc3QgaWQgaW4gc3RhdHVzKSB7XG5cdFx0XHRcdGlmICghIXN0YXR1c1tpZF0uYWN0aXZhdGlvblRpbWVzKSB7XG5cdFx0XHRcdFx0dGhpcy5lYXJseUFjdGl2YXRlZEV4dGVuc2lvbnMuYWRkKGlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGFjdGl2YXRlRGVidWdnZXJzKGFjdGl2YXRpb25FdmVudDogc3RyaW5nLCBkZWJ1Z1R5cGU/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmluaXRFeHRlbnNpb25BY3RpdmF0aW9uc0lmTmVlZGVkKCk7XG5cblx0XHRjb25zdCBwcm9taXNlczogUHJvbWlzZTxhbnk+W10gPSBbXG5cdFx0XHR0aGlzLmV4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGFjdGl2YXRpb25FdmVudCksXG5cdFx0XHR0aGlzLmV4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KCdvbkRlYnVnJylcblx0XHRdO1xuXHRcdGlmIChkZWJ1Z1R5cGUpIHtcblx0XHRcdHByb21pc2VzLnB1c2godGhpcy5leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudChgJHthY3RpdmF0aW9uRXZlbnR9OiR7ZGVidWdUeXBlfWApKTtcblx0XHR9XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsU0FBUyxhQUFhO0FBRS9CLFNBQVMsa0JBQStCO0FBQ3hDLE9BQU8sY0FBYztBQUNyQixZQUFZLGFBQWE7QUFDekIsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyx3QkFBd0I7QUFFakMsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsY0FBYyxRQUFRLHNCQUFzQjtBQUNyRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxjQUFjLHNCQUFpRDtBQUN4RSxTQUFTLDBCQUEwQztBQUNuRCxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDZCQUE2QixtQ0FBbU8sdUNBQXVDO0FBQ2hULFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCLG1CQUFtQixjQUFjLDBCQUEwQjtBQUN6RixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQUMvQixTQUFT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
