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
import { KeyMod, KeyChord, KeyCode } from "../../../../base/common/keyCodes.js";
import { ModesRegistry } from "../../../../editor/common/languages/modesRegistry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { MenuId, registerAction2, Action2, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { OutputService } from "./outputServices.js";
import { OUTPUT_MODE_ID, OUTPUT_MIME, OUTPUT_VIEW_ID, IOutputService, CONTEXT_IN_OUTPUT, LOG_MODE_ID, LOG_MIME, CONTEXT_OUTPUT_SCROLL_LOCK, ACTIVE_OUTPUT_CHANNEL_CONTEXT, CONTEXT_ACTIVE_OUTPUT_LEVEL_SETTABLE, Extensions, CONTEXT_ACTIVE_OUTPUT_LEVEL, CONTEXT_ACTIVE_OUTPUT_LEVEL_IS_DEFAULT, SHOW_INFO_FILTER_CONTEXT, SHOW_TRACE_FILTER_CONTEXT, SHOW_DEBUG_FILTER_CONTEXT, SHOW_ERROR_FILTER_CONTEXT, SHOW_WARNING_FILTER_CONTEXT, OUTPUT_FILTER_FOCUS_CONTEXT, CONTEXT_ACTIVE_LOG_FILE_OUTPUT, isSingleSourceOutputChannelDescriptor } from "../../../services/output/common/output.js";
import { OutputViewPane } from "./outputView.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { ViewContainerLocation, Extensions as ViewContainerExtensions, WindowEnablement } from "../../../common/views.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { ViewPaneContainer } from "../../../browser/parts/views/viewPaneContainer.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { AUX_WINDOW_GROUP, IEditorService } from "../../../services/editor/common/editorService.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Disposable, dispose, toDisposable } from "../../../../base/common/lifecycle.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { ILoggerService, LogLevel, LogLevelToLocalizedString, LogLevelToString } from "../../../../platform/log/common/log.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../platform/accessibility/common/accessibility.js";
import { IsWindowsContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { FocusedViewContext } from "../../../common/contextkeys.js";
import { localize, localize2 } from "../../../../nls.js";
import { viewFilterSubmenu } from "../../../browser/parts/views/viewFilter.js";
import { ViewAction } from "../../../browser/parts/views/viewPane.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { basename } from "../../../../base/common/resources.js";
import { hasKey } from "../../../../base/common/types.js";
import { IDefaultLogLevelsService } from "../../../services/log/common/defaultLogLevels.js";
import { AccessibleViewRegistry } from "../../../../platform/accessibility/browser/accessibleViewRegistry.js";
import { OutputAccessibilityHelp } from "./outputAccessibilityHelp.js";
const IMPORTED_LOG_ID_PREFIX = "importedLog.";
registerSingleton(IOutputService, OutputService, InstantiationType.Delayed);
AccessibleViewRegistry.register(new OutputAccessibilityHelp());
ModesRegistry.registerLanguage({
  id: OUTPUT_MODE_ID,
  extensions: [],
  mimetypes: [OUTPUT_MIME]
});
ModesRegistry.registerLanguage({
  id: LOG_MODE_ID,
  extensions: [],
  mimetypes: [LOG_MIME]
});
const outputViewIcon = registerIcon("output-view-icon", Codicon.output, nls.localize("outputViewIcon", "View icon of the output view."));
const VIEW_CONTAINER = Registry.as(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
  id: OUTPUT_VIEW_ID,
  title: nls.localize2("output", "Output"),
  icon: outputViewIcon,
  order: 1,
  ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [OUTPUT_VIEW_ID, { mergeViewWithContainerWhenSingleView: true }]),
  storageId: OUTPUT_VIEW_ID,
  hideIfEmpty: true,
  windowEnablement: WindowEnablement.Both
}, ViewContainerLocation.Panel, { doNotRegisterOpenCommand: true });
Registry.as(ViewContainerExtensions.ViewsRegistry).registerViews([{
  id: OUTPUT_VIEW_ID,
  name: nls.localize2("output", "Output"),
  containerIcon: outputViewIcon,
  canMoveView: true,
  canToggleVisibility: true,
  ctorDescriptor: new SyncDescriptor(OutputViewPane),
  openCommandActionDescriptor: {
    id: "workbench.action.output.toggleOutput",
    mnemonicTitle: nls.localize({ key: "miToggleOutput", comment: ["&& denotes a mnemonic"] }, "&&Output"),
    keybindings: {
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyU,
      linux: {
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyH)
        // On Ubuntu Ctrl+Shift+U is taken by some global OS command
      }
    },
    order: 1
  },
  windowEnablement: WindowEnablement.Both
}], VIEW_CONTAINER);
let OutputContribution = class extends Disposable {
  constructor(outputService, editorService) {
    super();
    this.outputService = outputService;
    this.editorService = editorService;
    this.registerActions();
  }
  registerActions() {
    this.registerSwitchOutputAction();
    this.registerAddCompoundLogAction();
    this.registerRemoveLogAction();
    this.registerShowOutputChannelsAction();
    this.registerClearOutputAction();
    this.registerToggleAutoScrollAction();
    this.registerOpenActiveOutputFileAction();
    this.registerOpenActiveOutputFileInAuxWindowAction();
    this.registerSaveActiveOutputAsAction();
    this.registerShowLogsAction();
    this.registerOpenLogFileAction();
    this.registerConfigureActiveOutputLogLevelAction();
    this.registerLogLevelFilterActions();
    this.registerClearFilterActions();
    this.registerExportLogsAction();
    this.registerImportLogAction();
  }
  registerSwitchOutputAction() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.output.action.switchBetweenOutputs`,
          title: nls.localize("switchBetweenOutputs.label", "Switch Output")
        });
      }
      async run(accessor, channelId) {
        if (channelId) {
          accessor.get(IOutputService).showChannel(channelId, true);
        }
      }
    }));
    const switchOutputMenu = new MenuId("workbench.output.menu.switchOutput");
    this._register(MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
      submenu: switchOutputMenu,
      title: nls.localize("switchToOutput.label", "Switch Output"),
      group: "navigation",
      when: ContextKeyExpr.equals("view", OUTPUT_VIEW_ID),
      order: 1,
      isSelection: true
    }));
    const registeredChannels = /* @__PURE__ */ new Map();
    this._register(toDisposable(() => dispose(registeredChannels.values())));
    const registerOutputChannels = (channels) => {
      for (const channel of channels) {
        const title = channel.label;
        const group = channel.user ? "2_user_outputchannels" : channel.extensionId ? "0_ext_outputchannels" : "1_core_outputchannels";
        registeredChannels.set(channel.id, registerAction2(class extends Action2 {
          constructor() {
            super({
              id: `workbench.action.output.show.${channel.id}`,
              title,
              toggled: ACTIVE_OUTPUT_CHANNEL_CONTEXT.isEqualTo(channel.id),
              menu: {
                id: switchOutputMenu,
                group
              }
            });
          }
          async run(accessor) {
            return accessor.get(IOutputService).showChannel(channel.id, true);
          }
        }));
      }
    };
    registerOutputChannels(this.outputService.getChannelDescriptors());
    const outputChannelRegistry = Registry.as(Extensions.OutputChannels);
    this._register(outputChannelRegistry.onDidRegisterChannel((e) => {
      const channel = this.outputService.getChannelDescriptor(e);
      if (channel) {
        registerOutputChannels([channel]);
      }
    }));
    this._register(outputChannelRegistry.onDidRemoveChannel((e) => {
      registeredChannels.get(e.id)?.dispose();
      registeredChannels.delete(e.id);
    }));
  }
  registerAddCompoundLogAction() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.output.addCompoundLog",
          title: nls.localize2("addCompoundLog", "Add Compound Log..."),
          category: nls.localize2("output", "Output"),
          f1: true,
          menu: [{
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.equals("view", OUTPUT_VIEW_ID),
            group: "2_add"
          }]
        });
      }
      async run(accessor) {
        const outputService = accessor.get(IOutputService);
        const quickInputService = accessor.get(IQuickInputService);
        const extensionLogs = [], logs = [];
        for (const channel of outputService.getChannelDescriptors()) {
          if (channel.log && !channel.user) {
            if (channel.extensionId) {
              extensionLogs.push(channel);
            } else {
              logs.push(channel);
            }
          }
        }
        const entries = [];
        for (const log of logs.sort((a, b) => a.label.localeCompare(b.label))) {
          entries.push(log);
        }
        if (extensionLogs.length && logs.length) {
          entries.push({ type: "separator", label: nls.localize("extensionLogs", "Extension Logs") });
        }
        for (const log of extensionLogs.sort((a, b) => a.label.localeCompare(b.label))) {
          entries.push(log);
        }
        const result = await quickInputService.pick(entries, { placeHolder: nls.localize("selectlog", "Select Log"), canPickMany: true });
        if (result?.length) {
          outputService.showChannel(outputService.registerCompoundLogChannel(result));
        }
      }
    }));
  }
  registerRemoveLogAction() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.output.remove",
          title: nls.localize2("removeLog", "Remove Output..."),
          category: nls.localize2("output", "Output"),
          f1: true
        });
      }
      async run(accessor) {
        const outputService = accessor.get(IOutputService);
        const quickInputService = accessor.get(IQuickInputService);
        const notificationService = accessor.get(INotificationService);
        const entries = outputService.getChannelDescriptors().filter((channel) => channel.user);
        if (entries.length === 0) {
          notificationService.info(nls.localize("nocustumoutput", "No custom outputs to remove."));
          return;
        }
        const result = await quickInputService.pick(entries, { placeHolder: nls.localize("selectlog", "Select Log"), canPickMany: true });
        if (!result?.length) {
          return;
        }
        const outputChannelRegistry = Registry.as(Extensions.OutputChannels);
        for (const channel of result) {
          outputChannelRegistry.removeChannel(channel.id);
        }
      }
    }));
  }
  registerShowOutputChannelsAction() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.showOutputChannels",
          title: nls.localize2("showOutputChannels", "Show Output Channels..."),
          category: nls.localize2("output", "Output"),
          f1: true
        });
      }
      async run(accessor) {
        const outputService = accessor.get(IOutputService);
        const quickInputService = accessor.get(IQuickInputService);
        const extensionChannels = [], coreChannels = [];
        for (const channel of outputService.getChannelDescriptors()) {
          if (channel.extensionId) {
            extensionChannels.push(channel);
          } else {
            coreChannels.push(channel);
          }
        }
        const entries = [];
        for (const { id, label } of extensionChannels) {
          entries.push({ id, label });
        }
        if (extensionChannels.length && coreChannels.length) {
          entries.push({ type: "separator" });
        }
        for (const { id, label } of coreChannels) {
          entries.push({ id, label });
        }
        const entry = await quickInputService.pick(entries, { placeHolder: nls.localize("selectOutput", "Select Output Channel") });
        if (entry) {
          return outputService.showChannel(entry.id);
        }
      }
    }));
  }
  registerClearOutputAction() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.output.action.clearOutput`,
          title: nls.localize2("clearOutput.label", "Clear Output"),
          category: Categories.View,
          menu: [{
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.equals("view", OUTPUT_VIEW_ID),
            group: "navigation",
            order: 2
          }, {
            id: MenuId.CommandPalette
          }, {
            id: MenuId.EditorContext,
            when: CONTEXT_IN_OUTPUT
          }],
          icon: Codicon.clearAll
        });
      }
      async run(accessor) {
        const outputService = accessor.get(IOutputService);
        const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
        const activeChannel = outputService.getActiveChannel();
        if (activeChannel) {
          activeChannel.clear();
          accessibilitySignalService.playSignal(AccessibilitySignal.clear);
        }
      }
    }));
  }
  registerToggleAutoScrollAction() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.output.action.toggleAutoScroll`,
          title: nls.localize2("toggleAutoScroll", "Toggle Auto Scrolling"),
          tooltip: nls.localize("outputScrollOff", "Turn Auto Scrolling Off"),
          menu: {
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.and(ContextKeyExpr.equals("view", OUTPUT_VIEW_ID)),
            group: "navigation",
            order: 3
          },
          icon: Codicon.lock,
          toggled: {
            condition: CONTEXT_OUTPUT_SCROLL_LOCK,
            icon: Codicon.unlock,
            tooltip: nls.localize("outputScrollOn", "Turn Auto Scrolling On")
          }
        });
      }
      async run(accessor) {
        const outputView = accessor.get(IViewsService).getActiveViewWithId(OUTPUT_VIEW_ID);
        outputView.scrollLock = !outputView.scrollLock;
      }
    }));
  }
  registerOpenActiveOutputFileAction() {
    const that = this;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.action.openActiveLogOutputFile`,
          title: nls.localize2("openActiveOutputFile", "Open Output in Editor"),
          menu: [{
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.equals("view", OUTPUT_VIEW_ID),
            group: "navigation",
            order: 4,
            isHiddenByDefault: true
          }],
          icon: Codicon.goToFile
        });
      }
      async run() {
        that.openActiveOutput();
      }
    }));
  }
  registerOpenActiveOutputFileInAuxWindowAction() {
    const that = this;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.action.openActiveLogOutputFileInNewWindow`,
          title: nls.localize2("openActiveOutputFileInNewWindow", "Open Output in New Window"),
          menu: [{
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.equals("view", OUTPUT_VIEW_ID),
            group: "navigation",
            order: 5,
            isHiddenByDefault: true
          }],
          icon: Codicon.emptyWindow
        });
      }
      async run() {
        that.openActiveOutput(AUX_WINDOW_GROUP);
      }
    }));
  }
  registerSaveActiveOutputAsAction() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.action.saveActiveLogOutputAs`,
          title: nls.localize2("saveActiveOutputAs", "Save Output As..."),
          menu: [{
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.equals("view", OUTPUT_VIEW_ID),
            group: "1_export",
            order: 1
          }]
        });
      }
      async run(accessor) {
        const outputService = accessor.get(IOutputService);
        const channel = outputService.getActiveChannel();
        if (channel) {
          const descriptor = outputService.getChannelDescriptors().find((c) => c.id === channel.id);
          if (descriptor) {
            await outputService.saveOutputAs(void 0, descriptor);
          }
        }
      }
    }));
  }
  async openActiveOutput(group) {
    const channel = this.outputService.getActiveChannel();
    if (channel) {
      await this.editorService.openEditor({
        resource: channel.uri,
        options: {
          pinned: true
        }
      }, group);
    }
  }
  registerConfigureActiveOutputLogLevelAction() {
    const logLevelMenu = new MenuId("workbench.output.menu.logLevel");
    this._register(MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
      submenu: logLevelMenu,
      title: nls.localize("logLevel.label", "Set Log Level..."),
      group: "navigation",
      when: ContextKeyExpr.and(ContextKeyExpr.equals("view", OUTPUT_VIEW_ID), CONTEXT_ACTIVE_OUTPUT_LEVEL_SETTABLE),
      icon: Codicon.gear,
      order: 6
    }));
    let order = 0;
    const registerLogLevel = (logLevel) => {
      this._register(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: `workbench.action.output.activeOutputLogLevel.${logLevel}`,
            title: LogLevelToLocalizedString(logLevel).value,
            toggled: CONTEXT_ACTIVE_OUTPUT_LEVEL.isEqualTo(LogLevelToString(logLevel)),
            menu: {
              id: logLevelMenu,
              order: order++,
              group: "0_level"
            }
          });
        }
        async run(accessor) {
          const outputService = accessor.get(IOutputService);
          const channel = outputService.getActiveChannel();
          if (channel) {
            const channelDescriptor = outputService.getChannelDescriptor(channel.id);
            if (channelDescriptor) {
              outputService.setLogLevel(channelDescriptor, logLevel);
            }
          }
        }
      }));
    };
    registerLogLevel(LogLevel.Trace);
    registerLogLevel(LogLevel.Debug);
    registerLogLevel(LogLevel.Info);
    registerLogLevel(LogLevel.Warning);
    registerLogLevel(LogLevel.Error);
    registerLogLevel(LogLevel.Off);
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.action.output.activeOutputLogLevelDefault`,
          title: nls.localize("logLevelDefault.label", "Set As Default"),
          menu: {
            id: logLevelMenu,
            order,
            group: "1_default"
          },
          precondition: CONTEXT_ACTIVE_OUTPUT_LEVEL_IS_DEFAULT.negate()
        });
      }
      async run(accessor) {
        const outputService = accessor.get(IOutputService);
        const loggerService = accessor.get(ILoggerService);
        const defaultLogLevelsService = accessor.get(IDefaultLogLevelsService);
        const channel = outputService.getActiveChannel();
        if (channel) {
          const channelDescriptor = outputService.getChannelDescriptor(channel.id);
          if (channelDescriptor && isSingleSourceOutputChannelDescriptor(channelDescriptor)) {
            const logLevel = loggerService.getLogLevel(channelDescriptor.source.resource);
            return await defaultLogLevelsService.setDefaultLogLevel(logLevel, channelDescriptor.extensionId);
          }
        }
      }
    }));
  }
  registerShowLogsAction() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.showLogs",
          title: nls.localize2("showLogs", "Show Logs..."),
          category: Categories.Developer,
          menu: {
            id: MenuId.CommandPalette
          }
        });
      }
      async run(accessor) {
        const outputService = accessor.get(IOutputService);
        const quickInputService = accessor.get(IQuickInputService);
        const extensionLogs = [], logs = [];
        for (const channel of outputService.getChannelDescriptors()) {
          if (channel.log) {
            if (channel.extensionId) {
              extensionLogs.push(channel);
            } else {
              logs.push(channel);
            }
          }
        }
        const entries = [];
        for (const { id, label } of logs) {
          entries.push({ id, label });
        }
        if (extensionLogs.length && logs.length) {
          entries.push({ type: "separator", label: nls.localize("extensionLogs", "Extension Logs") });
        }
        for (const { id, label } of extensionLogs) {
          entries.push({ id, label });
        }
        const entry = await quickInputService.pick(entries, { placeHolder: nls.localize("selectlog", "Select Log") });
        if (entry) {
          return outputService.showChannel(entry.id);
        }
      }
    }));
  }
  registerOpenLogFileAction() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openLogFile",
          title: nls.localize2("openLogFile", "Open Log..."),
          category: Categories.Developer,
          menu: {
            id: MenuId.CommandPalette
          },
          metadata: {
            description: "workbench.action.openLogFile",
            args: [{
              name: "logFile",
              schema: {
                markdownDescription: nls.localize("logFile", 'The id of the log file to open, for example `"window"`. Currently the best way to get this is to get the ID by checking the `workbench.action.output.show.<id>` commands'),
                type: "string"
              }
            }]
          }
        });
      }
      async run(accessor, args) {
        const outputService = accessor.get(IOutputService);
        const quickInputService = accessor.get(IQuickInputService);
        const editorService = accessor.get(IEditorService);
        let entry;
        const argName = args && typeof args === "string" ? args : void 0;
        const extensionChannels = [];
        const coreChannels = [];
        for (const c of outputService.getChannelDescriptors()) {
          if (c.log) {
            const e = { id: c.id, label: c.label };
            if (c.extensionId) {
              extensionChannels.push(e);
            } else {
              coreChannels.push(e);
            }
            if (e.id === argName) {
              entry = e;
            }
          }
        }
        if (!entry) {
          const entries = [...extensionChannels.sort((a, b) => a.label.localeCompare(b.label))];
          if (entries.length && coreChannels.length) {
            entries.push({ type: "separator" });
            entries.push(...coreChannels.sort((a, b) => a.label.localeCompare(b.label)));
          }
          entry = await quickInputService.pick(entries, { placeHolder: nls.localize("selectlogFile", "Select Log File") });
        }
        if (entry?.id) {
          const channel = outputService.getChannel(entry.id);
          if (channel) {
            await editorService.openEditor({
              resource: channel.uri,
              options: {
                pinned: true
              }
            });
          }
        }
      }
    }));
  }
  registerLogLevelFilterActions() {
    let order = 0;
    const registerLogLevel = (logLevel, toggled) => {
      this._register(registerAction2(class extends ViewAction {
        constructor() {
          super({
            id: `workbench.actions.${OUTPUT_VIEW_ID}.toggle.${LogLevelToString(logLevel)}`,
            title: LogLevelToLocalizedString(logLevel).value,
            metadata: {
              description: localize2("toggleTraceDescription", "Show or hide {0} messages in the output", LogLevelToString(logLevel))
            },
            toggled,
            menu: {
              id: viewFilterSubmenu,
              group: "2_log_filter",
              when: ContextKeyExpr.and(ContextKeyExpr.equals("view", OUTPUT_VIEW_ID), CONTEXT_ACTIVE_LOG_FILE_OUTPUT),
              order: order++
            },
            viewId: OUTPUT_VIEW_ID
          });
        }
        async runInView(serviceAccessor, view) {
          this.toggleLogLevelFilter(serviceAccessor.get(IOutputService), logLevel);
        }
        toggleLogLevelFilter(outputService, logLevel2) {
          switch (logLevel2) {
            case LogLevel.Trace:
              outputService.filters.trace = !outputService.filters.trace;
              break;
            case LogLevel.Debug:
              outputService.filters.debug = !outputService.filters.debug;
              break;
            case LogLevel.Info:
              outputService.filters.info = !outputService.filters.info;
              break;
            case LogLevel.Warning:
              outputService.filters.warning = !outputService.filters.warning;
              break;
            case LogLevel.Error:
              outputService.filters.error = !outputService.filters.error;
              break;
          }
        }
      }));
    };
    registerLogLevel(LogLevel.Trace, SHOW_TRACE_FILTER_CONTEXT);
    registerLogLevel(LogLevel.Debug, SHOW_DEBUG_FILTER_CONTEXT);
    registerLogLevel(LogLevel.Info, SHOW_INFO_FILTER_CONTEXT);
    registerLogLevel(LogLevel.Warning, SHOW_WARNING_FILTER_CONTEXT);
    registerLogLevel(LogLevel.Error, SHOW_ERROR_FILTER_CONTEXT);
  }
  registerClearFilterActions() {
    this._register(registerAction2(class extends ViewAction {
      constructor() {
        super({
          id: `workbench.actions.${OUTPUT_VIEW_ID}.clearFilterText`,
          title: localize("clearFiltersText", "Clear filters text"),
          keybinding: {
            when: OUTPUT_FILTER_FOCUS_CONTEXT,
            weight: KeybindingWeight.WorkbenchContrib,
            primary: KeyCode.Escape
          },
          viewId: OUTPUT_VIEW_ID
        });
      }
      async runInView(serviceAccessor, outputView) {
        outputView.clearFilterText();
      }
    }));
  }
  registerExportLogsAction() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.action.exportLogs`,
          title: nls.localize2("exportLogs", "Export Logs..."),
          f1: true,
          category: Categories.Developer,
          menu: [{
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.equals("view", OUTPUT_VIEW_ID),
            group: "1_export",
            order: 2
          }]
        });
      }
      async run(accessor, arg) {
        const outputService = accessor.get(IOutputService);
        const quickInputService = accessor.get(IQuickInputService);
        const extensionLogs = [], logs = [], userLogs = [];
        for (const channel of outputService.getChannelDescriptors()) {
          if (channel.log) {
            if (channel.extensionId) {
              extensionLogs.push(channel);
            } else if (channel.user) {
              userLogs.push(channel);
            } else {
              logs.push(channel);
            }
          }
        }
        const entries = [];
        for (const log of logs.sort((a, b) => a.label.localeCompare(b.label))) {
          entries.push(log);
        }
        if (extensionLogs.length && logs.length) {
          entries.push({ type: "separator", label: nls.localize("extensionLogs", "Extension Logs") });
        }
        for (const log of extensionLogs.sort((a, b) => a.label.localeCompare(b.label))) {
          entries.push(log);
        }
        if (userLogs.length && (extensionLogs.length || logs.length)) {
          entries.push({ type: "separator", label: nls.localize("userLogs", "User Logs") });
        }
        for (const log of userLogs.sort((a, b) => a.label.localeCompare(b.label))) {
          entries.push(log);
        }
        let selectedOutputChannels;
        if (arg?.outputChannelIds) {
          const requestedIdsNormalized = arg.outputChannelIds.map((id) => id.trim().toLowerCase());
          const candidates = entries.filter((e) => {
            const isSeparator = hasKey(e, { type: true }) && e.type === "separator";
            return !isSeparator;
          });
          if (requestedIdsNormalized.includes("*")) {
            selectedOutputChannels = candidates;
          } else {
            selectedOutputChannels = candidates.filter((candidate) => requestedIdsNormalized.includes(candidate.id.toLowerCase()));
          }
        } else {
          selectedOutputChannels = await quickInputService.pick(entries, { placeHolder: nls.localize("selectlog", "Select Log"), canPickMany: true });
        }
        if (selectedOutputChannels?.length) {
          await outputService.saveOutputAs(arg?.outputPath, ...selectedOutputChannels);
        }
      }
    }));
  }
  registerImportLogAction() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.action.importLog`,
          title: nls.localize2("importLog", "Import Log..."),
          f1: true,
          category: Categories.Developer,
          menu: [{
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.equals("view", OUTPUT_VIEW_ID),
            group: "2_add",
            order: 2
          }]
        });
      }
      async run(accessor) {
        const outputService = accessor.get(IOutputService);
        const fileDialogService = accessor.get(IFileDialogService);
        const result = await fileDialogService.showOpenDialog({
          title: nls.localize("importLogFile", "Import Log File"),
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: true,
          filters: [{
            name: nls.localize("logFiles", "Log Files"),
            extensions: ["log"]
          }]
        });
        if (result?.length) {
          const channelName = basename(result[0]);
          const channelId = `${IMPORTED_LOG_ID_PREFIX}${Date.now()}`;
          Registry.as(Extensions.OutputChannels).registerChannel({
            id: channelId,
            label: channelName,
            log: true,
            user: true,
            source: result.length === 1 ? { resource: result[0] } : result.map((resource) => ({ resource, name: basename(resource).split(".")[0] }))
          });
          outputService.showChannel(channelId);
        }
      }
    }));
  }
};
OutputContribution = __decorateClass([
  __decorateParam(0, IOutputService),
  __decorateParam(1, IEditorService)
], OutputContribution);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(OutputContribution, LifecyclePhase.Restored);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  id: "output",
  order: 30,
  title: nls.localize("output", "Output"),
  type: "object",
  properties: {
    "output.smartScroll.enabled": {
      type: "boolean",
      description: nls.localize("output.smartScroll.enabled", "Enable/disable the ability of smart scrolling in the output view. Smart scrolling allows you to lock scrolling automatically when you click in the output view and unlocks when you click in the last line."),
      default: true,
      scope: ConfigurationScope.WINDOW,
      tags: ["output"]
    }
  }
});
KeybindingsRegistry.registerKeybindingRule({
  id: "cursorWordAccessibilityLeft",
  when: ContextKeyExpr.and(EditorContextKeys.textInputFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext, ContextKeyExpr.equals(FocusedViewContext.key, OUTPUT_VIEW_ID)),
  primary: KeyMod.CtrlCmd | KeyCode.LeftArrow,
  weight: KeybindingWeight.WorkbenchContrib
});
KeybindingsRegistry.registerKeybindingRule({
  id: "cursorWordAccessibilityLeftSelect",
  when: ContextKeyExpr.and(EditorContextKeys.textInputFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext, ContextKeyExpr.equals(FocusedViewContext.key, OUTPUT_VIEW_ID)),
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow,
  weight: KeybindingWeight.WorkbenchContrib
});
KeybindingsRegistry.registerKeybindingRule({
  id: "cursorWordAccessibilityRight",
  when: ContextKeyExpr.and(EditorContextKeys.textInputFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext, ContextKeyExpr.equals(FocusedViewContext.key, OUTPUT_VIEW_ID)),
  primary: KeyMod.CtrlCmd | KeyCode.RightArrow,
  weight: KeybindingWeight.WorkbenchContrib
});
KeybindingsRegistry.registerKeybindingRule({
  id: "cursorWordAccessibilityRightSelect",
  when: ContextKeyExpr.and(EditorContextKeys.textInputFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext, ContextKeyExpr.equals(FocusedViewContext.key, OUTPUT_VIEW_ID)),
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow,
  weight: KeybindingWeight.WorkbenchContrib
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG91dHB1dFxcYnJvd3Nlclxcb3V0cHV0LmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgS2V5TW9kLCBLZXlDaG9yZCwgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IE1vZGVzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9tb2Rlc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yLCBBY3Rpb24yLCBNZW51UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgT3V0cHV0U2VydmljZSB9IGZyb20gJy4vb3V0cHV0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgT1VUUFVUX01PREVfSUQsIE9VVFBVVF9NSU1FLCBPVVRQVVRfVklFV19JRCwgSU91dHB1dFNlcnZpY2UsIENPTlRFWFRfSU5fT1VUUFVULCBMT0dfTU9ERV9JRCwgTE9HX01JTUUsIENPTlRFWFRfT1VUUFVUX1NDUk9MTF9MT0NLLCBJT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IsIEFDVElWRV9PVVRQVVRfQ0hBTk5FTF9DT05URVhULCBDT05URVhUX0FDVElWRV9PVVRQVVRfTEVWRUxfU0VUVEFCTEUsIElPdXRwdXRDaGFubmVsUmVnaXN0cnksIEV4dGVuc2lvbnMsIENPTlRFWFRfQUNUSVZFX09VVFBVVF9MRVZFTCwgQ09OVEVYVF9BQ1RJVkVfT1VUUFVUX0xFVkVMX0lTX0RFRkFVTFQsIFNIT1dfSU5GT19GSUxURVJfQ09OVEVYVCwgU0hPV19UUkFDRV9GSUxURVJfQ09OVEVYVCwgU0hPV19ERUJVR19GSUxURVJfQ09OVEVYVCwgU0hPV19FUlJPUl9GSUxURVJfQ09OVEVYVCwgU0hPV19XQVJOSU5HX0ZJTFRFUl9DT05URVhULCBPVVRQVVRfRklMVEVSX0ZPQ1VTX0NPTlRFWFQsIENPTlRFWFRfQUNUSVZFX0xPR19GSUxFX09VVFBVVCwgaXNTaW5nbGVTb3VyY2VPdXRwdXRDaGFubmVsRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL291dHB1dC9jb21tb24vb3V0cHV0LmpzJztcbmltcG9ydCB7IE91dHB1dFZpZXdQYW5lIH0gZnJvbSAnLi9vdXRwdXRWaWV3LmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hFeHRlbnNpb25zLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udGFpbmVyLCBJVmlld0NvbnRhaW5lcnNSZWdpc3RyeSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLCBFeHRlbnNpb25zIGFzIFZpZXdDb250YWluZXJFeHRlbnNpb25zLCBJVmlld3NSZWdpc3RyeSwgV2luZG93RW5hYmxlbWVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBWaWV3UGFuZUNvbnRhaW5lciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmVDb250YWluZXIuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgQ29uZmlndXJhdGlvblNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElRdWlja1BpY2tJdGVtLCBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tTZXBhcmF0b3IsIFF1aWNrUGlja0lucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBBVVhfV0lORE9XX0dST1VQLCBBVVhfV0lORE9XX0dST1VQX1RZUEUsIElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBDb250ZXh0S2V5RXhwcmVzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBkaXNwb3NlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTaWduYWwsIElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nZ2VyU2VydmljZSwgTG9nTGV2ZWwsIExvZ0xldmVsVG9Mb2NhbGl6ZWRTdHJpbmcsIExvZ0xldmVsVG9TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc1JlZ2lzdHJ5LCBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgSXNXaW5kb3dzQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IEZvY3VzZWRWaWV3Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IHZpZXdGaWx0ZXJTdWJtZW51IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3RmlsdGVyLmpzJztcbmltcG9ydCB7IFZpZXdBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRMb2dMZXZlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbG9nL2NvbW1vbi9kZWZhdWx0TG9nTGV2ZWxzLmpzJztcbmltcG9ydCB7IEFjY2Vzc2libGVWaWV3UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBPdXRwdXRBY2Nlc3NpYmlsaXR5SGVscCB9IGZyb20gJy4vb3V0cHV0QWNjZXNzaWJpbGl0eUhlbHAuanMnO1xuXG5jb25zdCBJTVBPUlRFRF9MT0dfSURfUFJFRklYID0gJ2ltcG9ydGVkTG9nLic7XG5cbi8vIFJlZ2lzdGVyIFNlcnZpY2VcbnJlZ2lzdGVyU2luZ2xldG9uKElPdXRwdXRTZXJ2aWNlLCBPdXRwdXRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcblxuLy8gUmVnaXN0ZXIgQWNjZXNzaWJpbGl0eSBIZWxwXG5BY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5LnJlZ2lzdGVyKG5ldyBPdXRwdXRBY2Nlc3NpYmlsaXR5SGVscCgpKTtcblxuLy8gUmVnaXN0ZXIgT3V0cHV0IE1vZGVcbk1vZGVzUmVnaXN0cnkucmVnaXN0ZXJMYW5ndWFnZSh7XG5cdGlkOiBPVVRQVVRfTU9ERV9JRCxcblx0ZXh0ZW5zaW9uczogW10sXG5cdG1pbWV0eXBlczogW09VVFBVVF9NSU1FXVxufSk7XG5cbi8vIFJlZ2lzdGVyIExvZyBPdXRwdXQgTW9kZVxuTW9kZXNSZWdpc3RyeS5yZWdpc3Rlckxhbmd1YWdlKHtcblx0aWQ6IExPR19NT0RFX0lELFxuXHRleHRlbnNpb25zOiBbXSxcblx0bWltZXR5cGVzOiBbTE9HX01JTUVdXG59KTtcblxuLy8gcmVnaXN0ZXIgb3V0cHV0IGNvbnRhaW5lclxuY29uc3Qgb3V0cHV0Vmlld0ljb24gPSByZWdpc3Rlckljb24oJ291dHB1dC12aWV3LWljb24nLCBDb2RpY29uLm91dHB1dCwgbmxzLmxvY2FsaXplKCdvdXRwdXRWaWV3SWNvbicsICdWaWV3IGljb24gb2YgdGhlIG91dHB1dCB2aWV3LicpKTtcbmNvbnN0IFZJRVdfQ09OVEFJTkVSOiBWaWV3Q29udGFpbmVyID0gUmVnaXN0cnkuYXM8SVZpZXdDb250YWluZXJzUmVnaXN0cnk+KFZpZXdDb250YWluZXJFeHRlbnNpb25zLlZpZXdDb250YWluZXJzUmVnaXN0cnkpLnJlZ2lzdGVyVmlld0NvbnRhaW5lcih7XG5cdGlkOiBPVVRQVVRfVklFV19JRCxcblx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ291dHB1dCcsIFwiT3V0cHV0XCIpLFxuXHRpY29uOiBvdXRwdXRWaWV3SWNvbixcblx0b3JkZXI6IDEsXG5cdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoVmlld1BhbmVDb250YWluZXIsIFtPVVRQVVRfVklFV19JRCwgeyBtZXJnZVZpZXdXaXRoQ29udGFpbmVyV2hlblNpbmdsZVZpZXc6IHRydWUgfV0pLFxuXHRzdG9yYWdlSWQ6IE9VVFBVVF9WSUVXX0lELFxuXHRoaWRlSWZFbXB0eTogdHJ1ZSxcblx0d2luZG93RW5hYmxlbWVudDogV2luZG93RW5hYmxlbWVudC5Cb3RoXG59LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwsIHsgZG9Ob3RSZWdpc3Rlck9wZW5Db21tYW5kOiB0cnVlIH0pO1xuXG5SZWdpc3RyeS5hczxJVmlld3NSZWdpc3RyeT4oVmlld0NvbnRhaW5lckV4dGVuc2lvbnMuVmlld3NSZWdpc3RyeSkucmVnaXN0ZXJWaWV3cyhbe1xuXHRpZDogT1VUUFVUX1ZJRVdfSUQsXG5cdG5hbWU6IG5scy5sb2NhbGl6ZTIoJ291dHB1dCcsIFwiT3V0cHV0XCIpLFxuXHRjb250YWluZXJJY29uOiBvdXRwdXRWaWV3SWNvbixcblx0Y2FuTW92ZVZpZXc6IHRydWUsXG5cdGNhblRvZ2dsZVZpc2liaWxpdHk6IHRydWUsXG5cdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoT3V0cHV0Vmlld1BhbmUpLFxuXHRvcGVuQ29tbWFuZEFjdGlvbkRlc2NyaXB0b3I6IHtcblx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3V0cHV0LnRvZ2dsZU91dHB1dCcsXG5cdFx0bW5lbW9uaWNUaXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlUb2dnbGVPdXRwdXQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZPdXRwdXRcIiksXG5cdFx0a2V5YmluZGluZ3M6IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlVLFxuXHRcdFx0bGludXg6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlIKSAgLy8gT24gVWJ1bnR1IEN0cmwrU2hpZnQrVSBpcyB0YWtlbiBieSBzb21lIGdsb2JhbCBPUyBjb21tYW5kXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRvcmRlcjogMSxcblx0fSxcblx0d2luZG93RW5hYmxlbWVudDogV2luZG93RW5hYmxlbWVudC5Cb3RoXG59XSwgVklFV19DT05UQUlORVIpO1xuXG5jbGFzcyBPdXRwdXRDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJT3V0cHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG91dHB1dFNlcnZpY2U6IElPdXRwdXRTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVnaXN0ZXJBY3Rpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQWN0aW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLnJlZ2lzdGVyU3dpdGNoT3V0cHV0QWN0aW9uKCk7XG5cdFx0dGhpcy5yZWdpc3RlckFkZENvbXBvdW5kTG9nQWN0aW9uKCk7XG5cdFx0dGhpcy5yZWdpc3RlclJlbW92ZUxvZ0FjdGlvbigpO1xuXHRcdHRoaXMucmVnaXN0ZXJTaG93T3V0cHV0Q2hhbm5lbHNBY3Rpb24oKTtcblx0XHR0aGlzLnJlZ2lzdGVyQ2xlYXJPdXRwdXRBY3Rpb24oKTtcblx0XHR0aGlzLnJlZ2lzdGVyVG9nZ2xlQXV0b1Njcm9sbEFjdGlvbigpO1xuXHRcdHRoaXMucmVnaXN0ZXJPcGVuQWN0aXZlT3V0cHV0RmlsZUFjdGlvbigpO1xuXHRcdHRoaXMucmVnaXN0ZXJPcGVuQWN0aXZlT3V0cHV0RmlsZUluQXV4V2luZG93QWN0aW9uKCk7XG5cdFx0dGhpcy5yZWdpc3RlclNhdmVBY3RpdmVPdXRwdXRBc0FjdGlvbigpO1xuXHRcdHRoaXMucmVnaXN0ZXJTaG93TG9nc0FjdGlvbigpO1xuXHRcdHRoaXMucmVnaXN0ZXJPcGVuTG9nRmlsZUFjdGlvbigpO1xuXHRcdHRoaXMucmVnaXN0ZXJDb25maWd1cmVBY3RpdmVPdXRwdXRMb2dMZXZlbEFjdGlvbigpO1xuXHRcdHRoaXMucmVnaXN0ZXJMb2dMZXZlbEZpbHRlckFjdGlvbnMoKTtcblx0XHR0aGlzLnJlZ2lzdGVyQ2xlYXJGaWx0ZXJBY3Rpb25zKCk7XG5cdFx0dGhpcy5yZWdpc3RlckV4cG9ydExvZ3NBY3Rpb24oKTtcblx0XHR0aGlzLnJlZ2lzdGVySW1wb3J0TG9nQWN0aW9uKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyU3dpdGNoT3V0cHV0QWN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogYHdvcmtiZW5jaC5vdXRwdXQuYWN0aW9uLnN3aXRjaEJldHdlZW5PdXRwdXRzYCxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdzd2l0Y2hCZXR3ZWVuT3V0cHV0cy5sYWJlbCcsIFwiU3dpdGNoIE91dHB1dFwiKSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNoYW5uZWxJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGlmIChjaGFubmVsSWQpIHtcblx0XHRcdFx0XHRhY2Nlc3Nvci5nZXQoSU91dHB1dFNlcnZpY2UpLnNob3dDaGFubmVsKGNoYW5uZWxJZCwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Y29uc3Qgc3dpdGNoT3V0cHV0TWVudSA9IG5ldyBNZW51SWQoJ3dvcmtiZW5jaC5vdXRwdXQubWVudS5zd2l0Y2hPdXRwdXQnKTtcblx0XHR0aGlzLl9yZWdpc3RlcihNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlZpZXdUaXRsZSwge1xuXHRcdFx0c3VibWVudTogc3dpdGNoT3V0cHV0TWVudSxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3N3aXRjaFRvT3V0cHV0LmxhYmVsJywgXCJTd2l0Y2ggT3V0cHV0XCIpLFxuXHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIE9VVFBVVF9WSUVXX0lEKSxcblx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0aXNTZWxlY3Rpb246IHRydWVcblx0XHR9KSk7XG5cdFx0Y29uc3QgcmVnaXN0ZXJlZENoYW5uZWxzID0gbmV3IE1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiBkaXNwb3NlKHJlZ2lzdGVyZWRDaGFubmVscy52YWx1ZXMoKSkpKTtcblx0XHRjb25zdCByZWdpc3Rlck91dHB1dENoYW5uZWxzID0gKGNoYW5uZWxzOiBJT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3JbXSkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBjaGFubmVsIG9mIGNoYW5uZWxzKSB7XG5cdFx0XHRcdGNvbnN0IHRpdGxlID0gY2hhbm5lbC5sYWJlbDtcblx0XHRcdFx0Y29uc3QgZ3JvdXAgPSBjaGFubmVsLnVzZXIgPyAnMl91c2VyX291dHB1dGNoYW5uZWxzJyA6IGNoYW5uZWwuZXh0ZW5zaW9uSWQgPyAnMF9leHRfb3V0cHV0Y2hhbm5lbHMnIDogJzFfY29yZV9vdXRwdXRjaGFubmVscyc7XG5cdFx0XHRcdHJlZ2lzdGVyZWRDaGFubmVscy5zZXQoY2hhbm5lbC5pZCwgcmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbi5vdXRwdXQuc2hvdy4ke2NoYW5uZWwuaWR9YCxcblx0XHRcdFx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdFx0XHRcdHRvZ2dsZWQ6IEFDVElWRV9PVVRQVVRfQ0hBTk5FTF9DT05URVhULmlzRXF1YWxUbyhjaGFubmVsLmlkKSxcblx0XHRcdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0XHRcdGlkOiBzd2l0Y2hPdXRwdXRNZW51LFxuXHRcdFx0XHRcdFx0XHRcdGdyb3VwLFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElPdXRwdXRTZXJ2aWNlKS5zaG93Q2hhbm5lbChjaGFubmVsLmlkLCB0cnVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHJlZ2lzdGVyT3V0cHV0Q2hhbm5lbHModGhpcy5vdXRwdXRTZXJ2aWNlLmdldENoYW5uZWxEZXNjcmlwdG9ycygpKTtcblx0XHRjb25zdCBvdXRwdXRDaGFubmVsUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJT3V0cHV0Q2hhbm5lbFJlZ2lzdHJ5PihFeHRlbnNpb25zLk91dHB1dENoYW5uZWxzKTtcblx0XHR0aGlzLl9yZWdpc3RlcihvdXRwdXRDaGFubmVsUmVnaXN0cnkub25EaWRSZWdpc3RlckNoYW5uZWwoZSA9PiB7XG5cdFx0XHRjb25zdCBjaGFubmVsID0gdGhpcy5vdXRwdXRTZXJ2aWNlLmdldENoYW5uZWxEZXNjcmlwdG9yKGUpO1xuXHRcdFx0aWYgKGNoYW5uZWwpIHtcblx0XHRcdFx0cmVnaXN0ZXJPdXRwdXRDaGFubmVscyhbY2hhbm5lbF0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihvdXRwdXRDaGFubmVsUmVnaXN0cnkub25EaWRSZW1vdmVDaGFubmVsKGUgPT4ge1xuXHRcdFx0cmVnaXN0ZXJlZENoYW5uZWxzLmdldChlLmlkKT8uZGlzcG9zZSgpO1xuXHRcdFx0cmVnaXN0ZXJlZENoYW5uZWxzLmRlbGV0ZShlLmlkKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQWRkQ29tcG91bmRMb2dBY3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vdXRwdXQuYWRkQ29tcG91bmRMb2cnLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdhZGRDb21wb3VuZExvZycsIFwiQWRkIENvbXBvdW5kIExvZy4uLlwiKSxcblx0XHRcdFx0XHRjYXRlZ29yeTogbmxzLmxvY2FsaXplMignb3V0cHV0JywgXCJPdXRwdXRcIiksXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgT1VUUFVUX1ZJRVdfSUQpLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICcyX2FkZCcsXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IG91dHB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU91dHB1dFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbkxvZ3M6IElPdXRwdXRDaGFubmVsRGVzY3JpcHRvcltdID0gW10sIGxvZ3M6IElPdXRwdXRDaGFubmVsRGVzY3JpcHRvcltdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgY2hhbm5lbCBvZiBvdXRwdXRTZXJ2aWNlLmdldENoYW5uZWxEZXNjcmlwdG9ycygpKSB7XG5cdFx0XHRcdFx0aWYgKGNoYW5uZWwubG9nICYmICFjaGFubmVsLnVzZXIpIHtcblx0XHRcdFx0XHRcdGlmIChjaGFubmVsLmV4dGVuc2lvbklkKSB7XG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbkxvZ3MucHVzaChjaGFubmVsKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGxvZ3MucHVzaChjaGFubmVsKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZW50cmllczogQXJyYXk8SU91dHB1dENoYW5uZWxEZXNjcmlwdG9yIHwgSVF1aWNrUGlja1NlcGFyYXRvcj4gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBsb2cgb2YgbG9ncy5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpKSB7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKGxvZyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGV4dGVuc2lvbkxvZ3MubGVuZ3RoICYmIGxvZ3MubGVuZ3RoKSB7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBubHMubG9jYWxpemUoJ2V4dGVuc2lvbkxvZ3MnLCBcIkV4dGVuc2lvbiBMb2dzXCIpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3QgbG9nIG9mIGV4dGVuc2lvbkxvZ3Muc29ydCgoYSwgYikgPT4gYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpKSkge1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaChsb2cpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soZW50cmllcywgeyBwbGFjZUhvbGRlcjogbmxzLmxvY2FsaXplKCdzZWxlY3Rsb2cnLCBcIlNlbGVjdCBMb2dcIiksIGNhblBpY2tNYW55OiB0cnVlIH0pO1xuXHRcdFx0XHRpZiAocmVzdWx0Py5sZW5ndGgpIHtcblx0XHRcdFx0XHRvdXRwdXRTZXJ2aWNlLnNob3dDaGFubmVsKG91dHB1dFNlcnZpY2UucmVnaXN0ZXJDb21wb3VuZExvZ0NoYW5uZWwocmVzdWx0KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyUmVtb3ZlTG9nQWN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3V0cHV0LnJlbW92ZScsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3JlbW92ZUxvZycsIFwiUmVtb3ZlIE91dHB1dC4uLlwiKSxcblx0XHRcdFx0XHRjYXRlZ29yeTogbmxzLmxvY2FsaXplMignb3V0cHV0JywgXCJPdXRwdXRcIiksXG5cdFx0XHRcdFx0ZjE6IHRydWVcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3Qgb3V0cHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJT3V0cHV0U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBlbnRyaWVzOiBBcnJheTxJT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3I+ID0gb3V0cHV0U2VydmljZS5nZXRDaGFubmVsRGVzY3JpcHRvcnMoKS5maWx0ZXIoY2hhbm5lbCA9PiBjaGFubmVsLnVzZXIpO1xuXHRcdFx0XHRpZiAoZW50cmllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmluZm8obmxzLmxvY2FsaXplKCdub2N1c3R1bW91dHB1dCcsIFwiTm8gY3VzdG9tIG91dHB1dHMgdG8gcmVtb3ZlLlwiKSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soZW50cmllcywgeyBwbGFjZUhvbGRlcjogbmxzLmxvY2FsaXplKCdzZWxlY3Rsb2cnLCBcIlNlbGVjdCBMb2dcIiksIGNhblBpY2tNYW55OiB0cnVlIH0pO1xuXHRcdFx0XHRpZiAoIXJlc3VsdD8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG91dHB1dENoYW5uZWxSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElPdXRwdXRDaGFubmVsUmVnaXN0cnk+KEV4dGVuc2lvbnMuT3V0cHV0Q2hhbm5lbHMpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNoYW5uZWwgb2YgcmVzdWx0KSB7XG5cdFx0XHRcdFx0b3V0cHV0Q2hhbm5lbFJlZ2lzdHJ5LnJlbW92ZUNoYW5uZWwoY2hhbm5lbC5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyU2hvd091dHB1dENoYW5uZWxzQWN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uc2hvd091dHB1dENoYW5uZWxzJyxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignc2hvd091dHB1dENoYW5uZWxzJywgXCJTaG93IE91dHB1dCBDaGFubmVscy4uLlwiKSxcblx0XHRcdFx0XHRjYXRlZ29yeTogbmxzLmxvY2FsaXplMignb3V0cHV0JywgXCJPdXRwdXRcIiksXG5cdFx0XHRcdFx0ZjE6IHRydWVcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3Qgb3V0cHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJT3V0cHV0U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbkNoYW5uZWxzID0gW10sIGNvcmVDaGFubmVscyA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNoYW5uZWwgb2Ygb3V0cHV0U2VydmljZS5nZXRDaGFubmVsRGVzY3JpcHRvcnMoKSkge1xuXHRcdFx0XHRcdGlmIChjaGFubmVsLmV4dGVuc2lvbklkKSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb25DaGFubmVscy5wdXNoKGNoYW5uZWwpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb3JlQ2hhbm5lbHMucHVzaChjaGFubmVsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZW50cmllczogKHsgaWQ6IHN0cmluZzsgbGFiZWw6IHN0cmluZyB9IHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHsgaWQsIGxhYmVsIH0gb2YgZXh0ZW5zaW9uQ2hhbm5lbHMpIHtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goeyBpZCwgbGFiZWwgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGV4dGVuc2lvbkNoYW5uZWxzLmxlbmd0aCAmJiBjb3JlQ2hhbm5lbHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCB7IGlkLCBsYWJlbCB9IG9mIGNvcmVDaGFubmVscykge1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaCh7IGlkLCBsYWJlbCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBlbnRyeSA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soZW50cmllcywgeyBwbGFjZUhvbGRlcjogbmxzLmxvY2FsaXplKCdzZWxlY3RPdXRwdXQnLCBcIlNlbGVjdCBPdXRwdXQgQ2hhbm5lbFwiKSB9KTtcblx0XHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdFx0cmV0dXJuIG91dHB1dFNlcnZpY2Uuc2hvd0NoYW5uZWwoZW50cnkuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckNsZWFyT3V0cHV0QWN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogYHdvcmtiZW5jaC5vdXRwdXQuYWN0aW9uLmNsZWFyT3V0cHV0YCxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignY2xlYXJPdXRwdXQubGFiZWwnLCBcIkNsZWFyIE91dHB1dFwiKSxcblx0XHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIE9VVFBVVF9WSUVXX0lEKSxcblx0XHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGVcblx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvckNvbnRleHQsXG5cdFx0XHRcdFx0XHR3aGVuOiBDT05URVhUX0lOX09VVFBVVFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdGljb246IENvZGljb24uY2xlYXJBbGxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3Qgb3V0cHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJT3V0cHV0U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZUNoYW5uZWwgPSBvdXRwdXRTZXJ2aWNlLmdldEFjdGl2ZUNoYW5uZWwoKTtcblx0XHRcdFx0aWYgKGFjdGl2ZUNoYW5uZWwpIHtcblx0XHRcdFx0XHRhY3RpdmVDaGFubmVsLmNsZWFyKCk7XG5cdFx0XHRcdFx0YWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLmNsZWFyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJUb2dnbGVBdXRvU2Nyb2xsQWN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogYHdvcmtiZW5jaC5vdXRwdXQuYWN0aW9uLnRvZ2dsZUF1dG9TY3JvbGxgLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCd0b2dnbGVBdXRvU2Nyb2xsJywgXCJUb2dnbGUgQXV0byBTY3JvbGxpbmdcIiksXG5cdFx0XHRcdFx0dG9vbHRpcDogbmxzLmxvY2FsaXplKCdvdXRwdXRTY3JvbGxPZmYnLCBcIlR1cm4gQXV0byBTY3JvbGxpbmcgT2ZmXCIpLFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIE9VVFBVVF9WSUVXX0lEKSksXG5cdFx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDMsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLmxvY2ssXG5cdFx0XHRcdFx0dG9nZ2xlZDoge1xuXHRcdFx0XHRcdFx0Y29uZGl0aW9uOiBDT05URVhUX09VVFBVVF9TQ1JPTExfTE9DSyxcblx0XHRcdFx0XHRcdGljb246IENvZGljb24udW5sb2NrLFxuXHRcdFx0XHRcdFx0dG9vbHRpcDogbmxzLmxvY2FsaXplKCdvdXRwdXRTY3JvbGxPbicsIFwiVHVybiBBdXRvIFNjcm9sbGluZyBPblwiKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3Qgb3V0cHV0VmlldyA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKS5nZXRBY3RpdmVWaWV3V2l0aElkPE91dHB1dFZpZXdQYW5lPihPVVRQVVRfVklFV19JRCkhO1xuXHRcdFx0XHRvdXRwdXRWaWV3LnNjcm9sbExvY2sgPSAhb3V0cHV0Vmlldy5zY3JvbGxMb2NrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJPcGVuQWN0aXZlT3V0cHV0RmlsZUFjdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9uLm9wZW5BY3RpdmVMb2dPdXRwdXRGaWxlYCxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignb3BlbkFjdGl2ZU91dHB1dEZpbGUnLCBcIk9wZW4gT3V0cHV0IGluIEVkaXRvclwiKSxcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBPVVRQVVRfVklFV19JRCksXG5cdFx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDQsXG5cdFx0XHRcdFx0XHRpc0hpZGRlbkJ5RGVmYXVsdDogdHJ1ZVxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdGljb246IENvZGljb24uZ29Ub0ZpbGUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHR0aGF0Lm9wZW5BY3RpdmVPdXRwdXQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyT3BlbkFjdGl2ZU91dHB1dEZpbGVJbkF1eFdpbmRvd0FjdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9uLm9wZW5BY3RpdmVMb2dPdXRwdXRGaWxlSW5OZXdXaW5kb3dgLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdvcGVuQWN0aXZlT3V0cHV0RmlsZUluTmV3V2luZG93JywgXCJPcGVuIE91dHB1dCBpbiBOZXcgV2luZG93XCIpLFxuXHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIE9VVFBVVF9WSUVXX0lEKSxcblx0XHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0XHRvcmRlcjogNSxcblx0XHRcdFx0XHRcdGlzSGlkZGVuQnlEZWZhdWx0OiB0cnVlXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5lbXB0eVdpbmRvdyxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdHRoYXQub3BlbkFjdGl2ZU91dHB1dChBVVhfV0lORE9XX0dST1VQKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyU2F2ZUFjdGl2ZU91dHB1dEFzQWN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogYHdvcmtiZW5jaC5hY3Rpb24uc2F2ZUFjdGl2ZUxvZ091dHB1dEFzYCxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignc2F2ZUFjdGl2ZU91dHB1dEFzJywgXCJTYXZlIE91dHB1dCBBcy4uLlwiKSxcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBPVVRQVVRfVklFV19JRCksXG5cdFx0XHRcdFx0XHRncm91cDogJzFfZXhwb3J0Jyxcblx0XHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IG91dHB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU91dHB1dFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBjaGFubmVsID0gb3V0cHV0U2VydmljZS5nZXRBY3RpdmVDaGFubmVsKCk7XG5cdFx0XHRcdGlmIChjaGFubmVsKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGVzY3JpcHRvciA9IG91dHB1dFNlcnZpY2UuZ2V0Q2hhbm5lbERlc2NyaXB0b3JzKCkuZmluZChjID0+IGMuaWQgPT09IGNoYW5uZWwuaWQpO1xuXHRcdFx0XHRcdGlmIChkZXNjcmlwdG9yKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCBvdXRwdXRTZXJ2aWNlLnNhdmVPdXRwdXRBcyh1bmRlZmluZWQsIGRlc2NyaXB0b3IpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbkFjdGl2ZU91dHB1dChncm91cD86IEFVWF9XSU5ET1dfR1JPVVBfVFlQRSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoYW5uZWwgPSB0aGlzLm91dHB1dFNlcnZpY2UuZ2V0QWN0aXZlQ2hhbm5lbCgpO1xuXHRcdGlmIChjaGFubmVsKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdHJlc291cmNlOiBjaGFubmVsLnVyaSxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdHBpbm5lZDogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdH0sIGdyb3VwKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQ29uZmlndXJlQWN0aXZlT3V0cHV0TG9nTGV2ZWxBY3Rpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgbG9nTGV2ZWxNZW51ID0gbmV3IE1lbnVJZCgnd29ya2JlbmNoLm91dHB1dC5tZW51LmxvZ0xldmVsJyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5WaWV3VGl0bGUsIHtcblx0XHRcdHN1Ym1lbnU6IGxvZ0xldmVsTWVudSxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2xvZ0xldmVsLmxhYmVsJywgXCJTZXQgTG9nIExldmVsLi4uXCIpLFxuXHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBPVVRQVVRfVklFV19JRCksIENPTlRFWFRfQUNUSVZFX09VVFBVVF9MRVZFTF9TRVRUQUJMRSksXG5cdFx0XHRpY29uOiBDb2RpY29uLmdlYXIsXG5cdFx0XHRvcmRlcjogNlxuXHRcdH0pKTtcblxuXHRcdGxldCBvcmRlciA9IDA7XG5cdFx0Y29uc3QgcmVnaXN0ZXJMb2dMZXZlbCA9IChsb2dMZXZlbDogTG9nTGV2ZWwpID0+IHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0XHRpZDogYHdvcmtiZW5jaC5hY3Rpb24ub3V0cHV0LmFjdGl2ZU91dHB1dExvZ0xldmVsLiR7bG9nTGV2ZWx9YCxcblx0XHRcdFx0XHRcdHRpdGxlOiBMb2dMZXZlbFRvTG9jYWxpemVkU3RyaW5nKGxvZ0xldmVsKS52YWx1ZSxcblx0XHRcdFx0XHRcdHRvZ2dsZWQ6IENPTlRFWFRfQUNUSVZFX09VVFBVVF9MRVZFTC5pc0VxdWFsVG8oTG9nTGV2ZWxUb1N0cmluZyhsb2dMZXZlbCkpLFxuXHRcdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0XHRpZDogbG9nTGV2ZWxNZW51LFxuXHRcdFx0XHRcdFx0XHRvcmRlcjogb3JkZXIrKyxcblx0XHRcdFx0XHRcdFx0Z3JvdXA6ICcwX2xldmVsJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdGNvbnN0IG91dHB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU91dHB1dFNlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IGNoYW5uZWwgPSBvdXRwdXRTZXJ2aWNlLmdldEFjdGl2ZUNoYW5uZWwoKTtcblx0XHRcdFx0XHRpZiAoY2hhbm5lbCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY2hhbm5lbERlc2NyaXB0b3IgPSBvdXRwdXRTZXJ2aWNlLmdldENoYW5uZWxEZXNjcmlwdG9yKGNoYW5uZWwuaWQpO1xuXHRcdFx0XHRcdFx0aWYgKGNoYW5uZWxEZXNjcmlwdG9yKSB7XG5cdFx0XHRcdFx0XHRcdG91dHB1dFNlcnZpY2Uuc2V0TG9nTGV2ZWwoY2hhbm5lbERlc2NyaXB0b3IsIGxvZ0xldmVsKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9O1xuXG5cdFx0cmVnaXN0ZXJMb2dMZXZlbChMb2dMZXZlbC5UcmFjZSk7XG5cdFx0cmVnaXN0ZXJMb2dMZXZlbChMb2dMZXZlbC5EZWJ1Zyk7XG5cdFx0cmVnaXN0ZXJMb2dMZXZlbChMb2dMZXZlbC5JbmZvKTtcblx0XHRyZWdpc3RlckxvZ0xldmVsKExvZ0xldmVsLldhcm5pbmcpO1xuXHRcdHJlZ2lzdGVyTG9nTGV2ZWwoTG9nTGV2ZWwuRXJyb3IpO1xuXHRcdHJlZ2lzdGVyTG9nTGV2ZWwoTG9nTGV2ZWwuT2ZmKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogYHdvcmtiZW5jaC5hY3Rpb24ub3V0cHV0LmFjdGl2ZU91dHB1dExvZ0xldmVsRGVmYXVsdGAsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnbG9nTGV2ZWxEZWZhdWx0LmxhYmVsJywgXCJTZXQgQXMgRGVmYXVsdFwiKSxcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogbG9nTGV2ZWxNZW51LFxuXHRcdFx0XHRcdFx0b3JkZXIsXG5cdFx0XHRcdFx0XHRncm91cDogJzFfZGVmYXVsdCdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9BQ1RJVkVfT1VUUFVUX0xFVkVMX0lTX0RFRkFVTFQubmVnYXRlKClcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3Qgb3V0cHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJT3V0cHV0U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGxvZ2dlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ2dlclNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0TG9nTGV2ZWxzU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVmYXVsdExvZ0xldmVsc1NlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBjaGFubmVsID0gb3V0cHV0U2VydmljZS5nZXRBY3RpdmVDaGFubmVsKCk7XG5cdFx0XHRcdGlmIChjaGFubmVsKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2hhbm5lbERlc2NyaXB0b3IgPSBvdXRwdXRTZXJ2aWNlLmdldENoYW5uZWxEZXNjcmlwdG9yKGNoYW5uZWwuaWQpO1xuXHRcdFx0XHRcdGlmIChjaGFubmVsRGVzY3JpcHRvciAmJiBpc1NpbmdsZVNvdXJjZU91dHB1dENoYW5uZWxEZXNjcmlwdG9yKGNoYW5uZWxEZXNjcmlwdG9yKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbG9nTGV2ZWwgPSBsb2dnZXJTZXJ2aWNlLmdldExvZ0xldmVsKGNoYW5uZWxEZXNjcmlwdG9yLnNvdXJjZS5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYXdhaXQgZGVmYXVsdExvZ0xldmVsc1NlcnZpY2Uuc2V0RGVmYXVsdExvZ0xldmVsKGxvZ0xldmVsLCBjaGFubmVsRGVzY3JpcHRvci5leHRlbnNpb25JZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclNob3dMb2dzQWN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uc2hvd0xvZ3MnLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdzaG93TG9ncycsIFwiU2hvdyBMb2dzLi4uXCIpLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IG91dHB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU91dHB1dFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25Mb2dzID0gW10sIGxvZ3MgPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBjaGFubmVsIG9mIG91dHB1dFNlcnZpY2UuZ2V0Q2hhbm5lbERlc2NyaXB0b3JzKCkpIHtcblx0XHRcdFx0XHRpZiAoY2hhbm5lbC5sb2cpIHtcblx0XHRcdFx0XHRcdGlmIChjaGFubmVsLmV4dGVuc2lvbklkKSB7XG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbkxvZ3MucHVzaChjaGFubmVsKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGxvZ3MucHVzaChjaGFubmVsKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZW50cmllczogKHsgaWQ6IHN0cmluZzsgbGFiZWw6IHN0cmluZyB9IHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHsgaWQsIGxhYmVsIH0gb2YgbG9ncykge1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaCh7IGlkLCBsYWJlbCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uTG9ncy5sZW5ndGggJiYgbG9ncy5sZW5ndGgpIHtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IG5scy5sb2NhbGl6ZSgnZXh0ZW5zaW9uTG9ncycsIFwiRXh0ZW5zaW9uIExvZ3NcIikgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCB7IGlkLCBsYWJlbCB9IG9mIGV4dGVuc2lvbkxvZ3MpIHtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goeyBpZCwgbGFiZWwgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZW50cnkgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKGVudHJpZXMsIHsgcGxhY2VIb2xkZXI6IG5scy5sb2NhbGl6ZSgnc2VsZWN0bG9nJywgXCJTZWxlY3QgTG9nXCIpIH0pO1xuXHRcdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0XHRyZXR1cm4gb3V0cHV0U2VydmljZS5zaG93Q2hhbm5lbChlbnRyeS5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyT3BlbkxvZ0ZpbGVBY3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuTG9nRmlsZScsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ29wZW5Mb2dGaWxlJywgXCJPcGVuIExvZy4uLlwiKSxcblx0XHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbkxvZ0ZpbGUnLFxuXHRcdFx0XHRcdFx0YXJnczogW3tcblx0XHRcdFx0XHRcdFx0bmFtZTogJ2xvZ0ZpbGUnLFxuXHRcdFx0XHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2xvZ0ZpbGUnLCBcIlRoZSBpZCBvZiB0aGUgbG9nIGZpbGUgdG8gb3BlbiwgZm9yIGV4YW1wbGUgYFxcXCJ3aW5kb3dcXFwiYC4gQ3VycmVudGx5IHRoZSBiZXN0IHdheSB0byBnZXQgdGhpcyBpcyB0byBnZXQgdGhlIElEIGJ5IGNoZWNraW5nIHRoZSBgd29ya2JlbmNoLmFjdGlvbi5vdXRwdXQuc2hvdy48aWQ+YCBjb21tYW5kc1wiKSxcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzPzogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjb25zdCBvdXRwdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElPdXRwdXRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0XHRcdGxldCBlbnRyeTogSVF1aWNrUGlja0l0ZW0gfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IGFyZ05hbWUgPSBhcmdzICYmIHR5cGVvZiBhcmdzID09PSAnc3RyaW5nJyA/IGFyZ3MgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbkNoYW5uZWxzOiBJUXVpY2tQaWNrSXRlbVtdID0gW107XG5cdFx0XHRcdGNvbnN0IGNvcmVDaGFubmVsczogSVF1aWNrUGlja0l0ZW1bXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGMgb2Ygb3V0cHV0U2VydmljZS5nZXRDaGFubmVsRGVzY3JpcHRvcnMoKSkge1xuXHRcdFx0XHRcdGlmIChjLmxvZykge1xuXHRcdFx0XHRcdFx0Y29uc3QgZSA9IHsgaWQ6IGMuaWQsIGxhYmVsOiBjLmxhYmVsIH07XG5cdFx0XHRcdFx0XHRpZiAoYy5leHRlbnNpb25JZCkge1xuXHRcdFx0XHRcdFx0XHRleHRlbnNpb25DaGFubmVscy5wdXNoKGUpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Y29yZUNoYW5uZWxzLnB1c2goZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZS5pZCA9PT0gYXJnTmFtZSkge1xuXHRcdFx0XHRcdFx0XHRlbnRyeSA9IGU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghZW50cnkpIHtcblx0XHRcdFx0XHRjb25zdCBlbnRyaWVzOiBRdWlja1BpY2tJbnB1dFtdID0gWy4uLmV4dGVuc2lvbkNoYW5uZWxzLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSldO1xuXHRcdFx0XHRcdGlmIChlbnRyaWVzLmxlbmd0aCAmJiBjb3JlQ2hhbm5lbHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRlbnRyaWVzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJyB9KTtcblx0XHRcdFx0XHRcdGVudHJpZXMucHVzaCguLi5jb3JlQ2hhbm5lbHMuc29ydCgoYSwgYikgPT4gYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGVudHJ5ID0gPElRdWlja1BpY2tJdGVtIHwgdW5kZWZpbmVkPmF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soZW50cmllcywgeyBwbGFjZUhvbGRlcjogbmxzLmxvY2FsaXplKCdzZWxlY3Rsb2dGaWxlJywgXCJTZWxlY3QgTG9nIEZpbGVcIikgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGVudHJ5Py5pZCkge1xuXHRcdFx0XHRcdGNvbnN0IGNoYW5uZWwgPSBvdXRwdXRTZXJ2aWNlLmdldENoYW5uZWwoZW50cnkuaWQpO1xuXHRcdFx0XHRcdGlmIChjaGFubmVsKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdFx0XHRyZXNvdXJjZTogY2hhbm5lbC51cmksXG5cdFx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0XHRwaW5uZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMb2dMZXZlbEZpbHRlckFjdGlvbnMoKTogdm9pZCB7XG5cdFx0bGV0IG9yZGVyID0gMDtcblx0XHRjb25zdCByZWdpc3RlckxvZ0xldmVsID0gKGxvZ0xldmVsOiBMb2dMZXZlbCwgdG9nZ2xlZDogQ29udGV4dEtleUV4cHJlc3Npb24pID0+IHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIFZpZXdBY3Rpb248T3V0cHV0Vmlld1BhbmU+IHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9ucy4ke09VVFBVVF9WSUVXX0lEfS50b2dnbGUuJHtMb2dMZXZlbFRvU3RyaW5nKGxvZ0xldmVsKX1gLFxuXHRcdFx0XHRcdFx0dGl0bGU6IExvZ0xldmVsVG9Mb2NhbGl6ZWRTdHJpbmcobG9nTGV2ZWwpLnZhbHVlLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplMigndG9nZ2xlVHJhY2VEZXNjcmlwdGlvbicsIFwiU2hvdyBvciBoaWRlIHswfSBtZXNzYWdlcyBpbiB0aGUgb3V0cHV0XCIsIExvZ0xldmVsVG9TdHJpbmcobG9nTGV2ZWwpKVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHRvZ2dsZWQsXG5cdFx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRcdGlkOiB2aWV3RmlsdGVyU3VibWVudSxcblx0XHRcdFx0XHRcdFx0Z3JvdXA6ICcyX2xvZ19maWx0ZXInLFxuXHRcdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgT1VUUFVUX1ZJRVdfSUQpLCBDT05URVhUX0FDVElWRV9MT0dfRklMRV9PVVRQVVQpLFxuXHRcdFx0XHRcdFx0XHRvcmRlcjogb3JkZXIrK1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHZpZXdJZDogT1VUUFVUX1ZJRVdfSURcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhc3luYyBydW5JblZpZXcoc2VydmljZUFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBPdXRwdXRWaWV3UGFuZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdHRoaXMudG9nZ2xlTG9nTGV2ZWxGaWx0ZXIoc2VydmljZUFjY2Vzc29yLmdldChJT3V0cHV0U2VydmljZSksIGxvZ0xldmVsKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRwcml2YXRlIHRvZ2dsZUxvZ0xldmVsRmlsdGVyKG91dHB1dFNlcnZpY2U6IElPdXRwdXRTZXJ2aWNlLCBsb2dMZXZlbDogTG9nTGV2ZWwpOiB2b2lkIHtcblx0XHRcdFx0XHRzd2l0Y2ggKGxvZ0xldmVsKSB7XG5cdFx0XHRcdFx0XHRjYXNlIExvZ0xldmVsLlRyYWNlOlxuXHRcdFx0XHRcdFx0XHRvdXRwdXRTZXJ2aWNlLmZpbHRlcnMudHJhY2UgPSAhb3V0cHV0U2VydmljZS5maWx0ZXJzLnRyYWNlO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgTG9nTGV2ZWwuRGVidWc6XG5cdFx0XHRcdFx0XHRcdG91dHB1dFNlcnZpY2UuZmlsdGVycy5kZWJ1ZyA9ICFvdXRwdXRTZXJ2aWNlLmZpbHRlcnMuZGVidWc7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0Y2FzZSBMb2dMZXZlbC5JbmZvOlxuXHRcdFx0XHRcdFx0XHRvdXRwdXRTZXJ2aWNlLmZpbHRlcnMuaW5mbyA9ICFvdXRwdXRTZXJ2aWNlLmZpbHRlcnMuaW5mbztcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlIExvZ0xldmVsLldhcm5pbmc6XG5cdFx0XHRcdFx0XHRcdG91dHB1dFNlcnZpY2UuZmlsdGVycy53YXJuaW5nID0gIW91dHB1dFNlcnZpY2UuZmlsdGVycy53YXJuaW5nO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgTG9nTGV2ZWwuRXJyb3I6XG5cdFx0XHRcdFx0XHRcdG91dHB1dFNlcnZpY2UuZmlsdGVycy5lcnJvciA9ICFvdXRwdXRTZXJ2aWNlLmZpbHRlcnMuZXJyb3I7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH07XG5cblx0XHRyZWdpc3RlckxvZ0xldmVsKExvZ0xldmVsLlRyYWNlLCBTSE9XX1RSQUNFX0ZJTFRFUl9DT05URVhUKTtcblx0XHRyZWdpc3RlckxvZ0xldmVsKExvZ0xldmVsLkRlYnVnLCBTSE9XX0RFQlVHX0ZJTFRFUl9DT05URVhUKTtcblx0XHRyZWdpc3RlckxvZ0xldmVsKExvZ0xldmVsLkluZm8sIFNIT1dfSU5GT19GSUxURVJfQ09OVEVYVCk7XG5cdFx0cmVnaXN0ZXJMb2dMZXZlbChMb2dMZXZlbC5XYXJuaW5nLCBTSE9XX1dBUk5JTkdfRklMVEVSX0NPTlRFWFQpO1xuXHRcdHJlZ2lzdGVyTG9nTGV2ZWwoTG9nTGV2ZWwuRXJyb3IsIFNIT1dfRVJST1JfRklMVEVSX0NPTlRFWFQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckNsZWFyRmlsdGVyQWN0aW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBWaWV3QWN0aW9uPE91dHB1dFZpZXdQYW5lPiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbnMuJHtPVVRQVVRfVklFV19JRH0uY2xlYXJGaWx0ZXJUZXh0YCxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NsZWFyRmlsdGVyc1RleHQnLCBcIkNsZWFyIGZpbHRlcnMgdGV4dFwiKSxcblx0XHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0XHR3aGVuOiBPVVRQVVRfRklMVEVSX0ZPQ1VTX0NPTlRFWFQsXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR2aWV3SWQ6IE9VVFBVVF9WSUVXX0lEXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuSW5WaWV3KHNlcnZpY2VBY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgb3V0cHV0VmlldzogT3V0cHV0Vmlld1BhbmUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0b3V0cHV0Vmlldy5jbGVhckZpbHRlclRleHQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyRXhwb3J0TG9nc0FjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9uLmV4cG9ydExvZ3NgLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdleHBvcnRMb2dzJywgXCJFeHBvcnQgTG9ncy4uLlwiKSxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgT1VUUFVUX1ZJRVdfSUQpLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICcxX2V4cG9ydCcsXG5cdFx0XHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZz86IHsgb3V0cHV0UGF0aD86IFVSSTsgb3V0cHV0Q2hhbm5lbElkcz86IHN0cmluZ1tdIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3Qgb3V0cHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJT3V0cHV0U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbkxvZ3M6IElPdXRwdXRDaGFubmVsRGVzY3JpcHRvcltdID0gW10sIGxvZ3M6IElPdXRwdXRDaGFubmVsRGVzY3JpcHRvcltdID0gW10sIHVzZXJMb2dzOiBJT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3JbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNoYW5uZWwgb2Ygb3V0cHV0U2VydmljZS5nZXRDaGFubmVsRGVzY3JpcHRvcnMoKSkge1xuXHRcdFx0XHRcdGlmIChjaGFubmVsLmxvZykge1xuXHRcdFx0XHRcdFx0aWYgKGNoYW5uZWwuZXh0ZW5zaW9uSWQpIHtcblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uTG9ncy5wdXNoKGNoYW5uZWwpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChjaGFubmVsLnVzZXIpIHtcblx0XHRcdFx0XHRcdFx0dXNlckxvZ3MucHVzaChjaGFubmVsKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGxvZ3MucHVzaChjaGFubmVsKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZW50cmllczogQXJyYXk8SU91dHB1dENoYW5uZWxEZXNjcmlwdG9yIHwgSVF1aWNrUGlja1NlcGFyYXRvcj4gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBsb2cgb2YgbG9ncy5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpKSB7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKGxvZyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGV4dGVuc2lvbkxvZ3MubGVuZ3RoICYmIGxvZ3MubGVuZ3RoKSB7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBubHMubG9jYWxpemUoJ2V4dGVuc2lvbkxvZ3MnLCBcIkV4dGVuc2lvbiBMb2dzXCIpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3QgbG9nIG9mIGV4dGVuc2lvbkxvZ3Muc29ydCgoYSwgYikgPT4gYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpKSkge1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaChsb2cpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh1c2VyTG9ncy5sZW5ndGggJiYgKGV4dGVuc2lvbkxvZ3MubGVuZ3RoIHx8IGxvZ3MubGVuZ3RoKSkge1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbmxzLmxvY2FsaXplKCd1c2VyTG9ncycsIFwiVXNlciBMb2dzXCIpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3QgbG9nIG9mIHVzZXJMb2dzLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSkpIHtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2gobG9nKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBzZWxlY3RlZE91dHB1dENoYW5uZWxzOiBJT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3JbXSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKGFyZz8ub3V0cHV0Q2hhbm5lbElkcykge1xuXHRcdFx0XHRcdGNvbnN0IHJlcXVlc3RlZElkc05vcm1hbGl6ZWQgPSBhcmcub3V0cHV0Q2hhbm5lbElkcy5tYXAoaWQgPT4gaWQudHJpbSgpLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0XHRcdGNvbnN0IGNhbmRpZGF0ZXMgPSBlbnRyaWVzLmZpbHRlcigoZSk6IGUgaXMgSU91dHB1dENoYW5uZWxEZXNjcmlwdG9yID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGlzU2VwYXJhdG9yID0gaGFzS2V5KGUsIHsgdHlwZTogdHJ1ZSB9KSAmJiBlLnR5cGUgPT09ICdzZXBhcmF0b3InO1xuXHRcdFx0XHRcdFx0cmV0dXJuICFpc1NlcGFyYXRvcjtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRpZiAocmVxdWVzdGVkSWRzTm9ybWFsaXplZC5pbmNsdWRlcygnKicpKSB7XG5cdFx0XHRcdFx0XHRzZWxlY3RlZE91dHB1dENoYW5uZWxzID0gY2FuZGlkYXRlcztcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0c2VsZWN0ZWRPdXRwdXRDaGFubmVscyA9IGNhbmRpZGF0ZXMuZmlsdGVyKGNhbmRpZGF0ZSA9PiByZXF1ZXN0ZWRJZHNOb3JtYWxpemVkLmluY2x1ZGVzKGNhbmRpZGF0ZS5pZC50b0xvd2VyQ2FzZSgpKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNlbGVjdGVkT3V0cHV0Q2hhbm5lbHMgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKGVudHJpZXMsIHsgcGxhY2VIb2xkZXI6IG5scy5sb2NhbGl6ZSgnc2VsZWN0bG9nJywgXCJTZWxlY3QgTG9nXCIpLCBjYW5QaWNrTWFueTogdHJ1ZSB9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChzZWxlY3RlZE91dHB1dENoYW5uZWxzPy5sZW5ndGgpIHtcblx0XHRcdFx0XHRhd2FpdCBvdXRwdXRTZXJ2aWNlLnNhdmVPdXRwdXRBcyhhcmc/Lm91dHB1dFBhdGgsIC4uLnNlbGVjdGVkT3V0cHV0Q2hhbm5lbHMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckltcG9ydExvZ0FjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9uLmltcG9ydExvZ2AsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2ltcG9ydExvZycsIFwiSW1wb3J0IExvZy4uLlwiKSxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgT1VUUFVUX1ZJRVdfSUQpLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICcyX2FkZCcsXG5cdFx0XHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3Qgb3V0cHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJT3V0cHV0U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGZpbGVEaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlRGlhbG9nU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZpbGVEaWFsb2dTZXJ2aWNlLnNob3dPcGVuRGlhbG9nKHtcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdpbXBvcnRMb2dGaWxlJywgXCJJbXBvcnQgTG9nIEZpbGVcIiksXG5cdFx0XHRcdFx0Y2FuU2VsZWN0RmlsZXM6IHRydWUsXG5cdFx0XHRcdFx0Y2FuU2VsZWN0Rm9sZGVyczogZmFsc2UsXG5cdFx0XHRcdFx0Y2FuU2VsZWN0TWFueTogdHJ1ZSxcblx0XHRcdFx0XHRmaWx0ZXJzOiBbe1xuXHRcdFx0XHRcdFx0bmFtZTogbmxzLmxvY2FsaXplKCdsb2dGaWxlcycsIFwiTG9nIEZpbGVzXCIpLFxuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uczogWydsb2cnXVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGlmIChyZXN1bHQ/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdGNvbnN0IGNoYW5uZWxOYW1lID0gYmFzZW5hbWUocmVzdWx0WzBdKTtcblx0XHRcdFx0XHRjb25zdCBjaGFubmVsSWQgPSBgJHtJTVBPUlRFRF9MT0dfSURfUFJFRklYfSR7RGF0ZS5ub3coKX1gO1xuXHRcdFx0XHRcdC8vIFJlZ2lzdGVyIGFuZCBzaG93IHRoZSBjaGFubmVsXG5cdFx0XHRcdFx0UmVnaXN0cnkuYXM8SU91dHB1dENoYW5uZWxSZWdpc3RyeT4oRXh0ZW5zaW9ucy5PdXRwdXRDaGFubmVscykucmVnaXN0ZXJDaGFubmVsKHtcblx0XHRcdFx0XHRcdGlkOiBjaGFubmVsSWQsXG5cdFx0XHRcdFx0XHRsYWJlbDogY2hhbm5lbE5hbWUsXG5cdFx0XHRcdFx0XHRsb2c6IHRydWUsXG5cdFx0XHRcdFx0XHR1c2VyOiB0cnVlLFxuXHRcdFx0XHRcdFx0c291cmNlOiByZXN1bHQubGVuZ3RoID09PSAxXG5cdFx0XHRcdFx0XHRcdD8geyByZXNvdXJjZTogcmVzdWx0WzBdIH1cblx0XHRcdFx0XHRcdFx0OiByZXN1bHQubWFwKHJlc291cmNlID0+ICh7IHJlc291cmNlLCBuYW1lOiBiYXNlbmFtZShyZXNvdXJjZSkuc3BsaXQoJy4nKVswXSB9KSlcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRvdXRwdXRTZXJ2aWNlLnNob3dDaGFubmVsKGNoYW5uZWxJZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpLnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKE91dHB1dENvbnRyaWJ1dGlvbiwgTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpO1xuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRpZDogJ291dHB1dCcsXG5cdG9yZGVyOiAzMCxcblx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnb3V0cHV0JywgXCJPdXRwdXRcIiksXG5cdHR5cGU6ICdvYmplY3QnLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0J291dHB1dC5zbWFydFNjcm9sbC5lbmFibGVkJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnb3V0cHV0LnNtYXJ0U2Nyb2xsLmVuYWJsZWQnLCBcIkVuYWJsZS9kaXNhYmxlIHRoZSBhYmlsaXR5IG9mIHNtYXJ0IHNjcm9sbGluZyBpbiB0aGUgb3V0cHV0IHZpZXcuIFNtYXJ0IHNjcm9sbGluZyBhbGxvd3MgeW91IHRvIGxvY2sgc2Nyb2xsaW5nIGF1dG9tYXRpY2FsbHkgd2hlbiB5b3UgY2xpY2sgaW4gdGhlIG91dHB1dCB2aWV3IGFuZCB1bmxvY2tzIHdoZW4geW91IGNsaWNrIGluIHRoZSBsYXN0IGxpbmUuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuV0lORE9XLFxuXHRcdFx0dGFnczogWydvdXRwdXQnXVxuXHRcdH1cblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnY3Vyc29yV29yZEFjY2Vzc2liaWxpdHlMZWZ0Jyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLCBDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVELCBJc1dpbmRvd3NDb250ZXh0LCBDb250ZXh0S2V5RXhwci5lcXVhbHMoRm9jdXNlZFZpZXdDb250ZXh0LmtleSwgT1VUUFVUX1ZJRVdfSUQpKSxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkxlZnRBcnJvdyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcbn0pO1xuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlcktleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdjdXJzb3JXb3JkQWNjZXNzaWJpbGl0eUxlZnRTZWxlY3QnLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsIENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQsIElzV2luZG93c0NvbnRleHQsIENvbnRleHRLZXlFeHByLmVxdWFscyhGb2N1c2VkVmlld0NvbnRleHQua2V5LCBPVVRQVVRfVklFV19JRCkpLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuTGVmdEFycm93LFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxufSk7XG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2N1cnNvcldvcmRBY2Nlc3NpYmlsaXR5UmlnaHQnLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsIENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQsIElzV2luZG93c0NvbnRleHQsIENvbnRleHRLZXlFeHByLmVxdWFscyhGb2N1c2VkVmlld0NvbnRleHQua2V5LCBPVVRQVVRfVklFV19JRCkpLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuUmlnaHRBcnJvdyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcbn0pO1xuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlcktleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdjdXJzb3JXb3JkQWNjZXNzaWJpbGl0eVJpZ2h0U2VsZWN0Jyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLCBDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVELCBJc1dpbmRvd3NDb250ZXh0LCBDb250ZXh0S2V5RXhwci5lcXVhbHMoRm9jdXNlZFZpZXdDb250ZXh0LmtleSwgT1VUUFVUX1ZJRVdfSUQpKSxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlJpZ2h0QXJyb3csXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsUUFBUSxVQUFVLGVBQWU7QUFDMUMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxRQUFRLGlCQUFpQixTQUFTLG9CQUFvQjtBQUMvRCxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQkFBZ0IsYUFBYSxnQkFBZ0IsZ0JBQWdCLG1CQUFtQixhQUFhLFVBQVUsNEJBQXNELCtCQUErQixzQ0FBOEQsWUFBWSw2QkFBNkIsd0NBQXdDLDBCQUEwQiwyQkFBMkIsMkJBQTJCLDJCQUEyQiw2QkFBNkIsNkJBQTZCLGdDQUFnQyw2Q0FBNkM7QUFDdGtCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQTBDLGNBQWMsMkJBQW1EO0FBQzNHLFNBQVMsc0JBQXNCO0FBRS9CLFNBQWlELHVCQUF1QixjQUFjLHlCQUF5Qyx3QkFBd0I7QUFDdkosU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBaUMsY0FBYyx5QkFBeUIsMEJBQTBCO0FBQ2xHLFNBQXlCLDBCQUErRDtBQUN4RixTQUFTLGtCQUF5QyxzQkFBc0I7QUFDeEUsU0FBUyxzQkFB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
