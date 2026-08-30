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
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { disposableWindowInterval, getWindow } from "../../../../base/browser/dom.js";
import { FileAccess } from "../../../../base/common/network.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IAuxiliaryWindowService } from "../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js";
import { IAgentsVoiceWindowService, AgentsVoiceStorageKeys, AGENTS_VOICE_WINDOW_DEFAULT_WIDTH, AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT } from "../common/agentsVoice.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IAgentSessionsService } from "../../chat/browser/agentSessions/agentSessionsService.js";
import { IAgentTitleBarStatusService } from "../../chat/browser/agentSessions/experiments/agentTitleBarStatusService.js";
import { IMicCaptureService } from "../../chat/browser/voiceClient/micCaptureService.js";
import { ITtsPlaybackService } from "../../chat/browser/voiceClient/ttsPlaybackService.js";
import { IVoiceSessionController } from "../../chat/browser/voiceClient/voiceSessionController.js";
import { IVoicePlaybackService } from "../../chat/common/voicePlaybackService.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IChatService } from "../../chat/common/chatService/chatService.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { isDark } from "../../../../platform/theme/common/theme.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { resolveVoiceGlowColors } from "../../chat/browser/voiceClient/voiceGlow.js";
import { editorBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { editorWidgetBorder, widgetShadow } from "../../../../platform/theme/common/colors/editorColors.js";
import { inputBackground, inputBorder } from "../../../../platform/theme/common/colors/inputColors.js";
import { AgentsVoiceWidget } from "./agentsVoiceWidget.js";
import { bindWidgetToController } from "./agentsVoiceWidgetBinding.js";
import { AgentsVoiceSessionsPicker } from "./agentsVoiceSessionsPicker.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { getVoiceModeContextMenuActions } from "../../chat/browser/speechToText/micButtonMenuActions.js";
let AgentsVoiceWindowService = class extends Disposable {
  /**
   * Calls setWindowAlwaysOnTop via a registered command (Electron only).
   * Avoids importing INativeHostService in the browser layer.
   */
  constructor(auxiliaryWindowService, storageService, configurationService, hostService, agentSessionsService, agentTitleBarStatusService, micCaptureService, ttsPlaybackService, voiceSessionController, voicePlaybackService, commandService, chatService, workspaceContextService, environmentService, themeService, accessibilityService, keybindingService, instantiationService, contextMenuService) {
    super();
    this.auxiliaryWindowService = auxiliaryWindowService;
    this.storageService = storageService;
    this.configurationService = configurationService;
    this.hostService = hostService;
    this.agentSessionsService = agentSessionsService;
    this.agentTitleBarStatusService = agentTitleBarStatusService;
    this.micCaptureService = micCaptureService;
    this.ttsPlaybackService = ttsPlaybackService;
    this.voiceSessionController = voiceSessionController;
    this.voicePlaybackService = voicePlaybackService;
    this.commandService = commandService;
    this.chatService = chatService;
    this.workspaceContextService = workspaceContextService;
    this.environmentService = environmentService;
    this.themeService = themeService;
    this.accessibilityService = accessibilityService;
    this.keybindingService = keybindingService;
    this.instantiationService = instantiationService;
    this.contextMenuService = contextMenuService;
    this._onDidChangeOpen = this._register(new Emitter());
    this.onDidChangeOpen = this._onDidChangeOpen.event;
    this._auxiliaryWindowRef = this._register(new MutableDisposable());
    this._windowDisposables = this._register(new DisposableStore());
    const ownershipChannel = new BroadcastChannel("agents-voice-ownership");
    ownershipChannel.onmessage = (e) => {
      if (e.data?.type === "claim" && this._window) {
        this.closeWindow();
      }
    };
    this._register({ dispose: () => ownershipChannel.close() });
    this._ownershipChannel = ownershipChannel;
    const onBeforeUnload = () => {
      if (this._window) {
        this.closeWindow();
      }
    };
    mainWindow.addEventListener("beforeunload", onBeforeUnload);
    this._register({ dispose: () => mainWindow.removeEventListener("beforeunload", onBeforeUnload) });
    const wasOpen = this.storageService.getBoolean(AgentsVoiceStorageKeys.WindowOpen, StorageScope.WORKSPACE, false);
    if (wasOpen) {
      this.storageService.store(AgentsVoiceStorageKeys.WindowOpen, false, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
  }
  get isOpen() {
    return !!this._window;
  }
  async openWindow() {
    if (this._window) {
      return;
    }
    const bounds = this.loadBounds();
    const auxiliaryWindow = await this.auxiliaryWindowService.open({
      bounds,
      alwaysOnTop: true,
      frameless: true,
      transparent: false,
      disableFullscreen: true,
      nativeTitlebar: false,
      noBackgroundThrottling: true,
      backgroundColor: this.themeService.getColorTheme().getColor(editorBackground)?.toString() ?? "#1e1e1e"
    });
    this._window = auxiliaryWindow;
    this._auxiliaryWindowRef.value = auxiliaryWindow;
    const workspace = this.workspaceContextService.getWorkspace();
    const projectName = workspace.folders.length > 0 ? workspace.folders[0].name : "";
    auxiliaryWindow.window.document.title = projectName ? `Agents Voice \u2014 ${projectName}` : "Agents Voice";
    auxiliaryWindow.container.style.overflow = "hidden";
    auxiliaryWindow.window.document.body.style.setProperty("margin", "0", "important");
    const theme = this.themeService.getColorTheme();
    const bgColor = theme.getColor(editorBackground)?.toString() ?? "#1e1e1e";
    const inputBg = theme.getColor(inputBackground)?.toString() ?? "#3C3C3C";
    const inputBd = theme.getColor(inputBorder)?.toString() ?? theme.getColor(editorWidgetBorder)?.toString() ?? "transparent";
    const shadow = theme.getColor(widgetShadow)?.toString() ?? "transparent";
    auxiliaryWindow.container.style.setProperty("--vscode-agents-background", bgColor);
    auxiliaryWindow.container.style.backgroundColor = inputBg;
    auxiliaryWindow.container.style.border = `1px solid ${inputBd}`;
    auxiliaryWindow.container.style.boxShadow = `0 2px 8px ${shadow}`;
    auxiliaryWindow.container.style.boxSizing = "border-box";
    auxiliaryWindow.window.document.body.style.setProperty("background-color", inputBg, "important");
    this._windowDisposables.clear();
    const widget = new AgentsVoiceWidget(auxiliaryWindow.container, {
      copilotIconSrc: FileAccess.asBrowserUri("vs/sessions/browser/media/sessions-icon.svg").toString(true),
      hideDisconnect: this.configurationService.getValue("agents.voice.handsFree") === true,
      connect: () => {
        this.storageService.store(AgentsVoiceStorageKeys.OnboardingCompleted, true, StorageScope.PROFILE, StorageTarget.USER);
        this.voiceSessionController.connect(mainWindow);
      },
      disconnect: () => this.voiceSessionController.disconnect("explicit"),
      pttDown: () => {
        if (!this.voiceSessionController.isConnected.get() && !this.voiceSessionController.isConnecting.get()) {
          this.voiceSessionController.connect(mainWindow).then(() => {
            if (this.voiceSessionController.isConnected.get()) {
              this.voiceSessionController.pttDown();
            }
          });
          return;
        }
        this.voiceSessionController.pttDown();
      },
      pttUp: () => this.voiceSessionController.pttUp(),
      closeWindow: () => this.closeWindow(),
      stopPlayback: () => this.ttsPlaybackService.stopPlayback(),
      openSession: (resource) => {
        this.commandService.executeCommand("_chat.voice.switchToSession", resource.toString());
        this.hostService.focus(mainWindow);
      },
      stopSession: (resource) => {
        const model = this.chatService.getSession(resource);
        if (model) {
          const lastReq = model.getRequests().at(-1);
          if (lastReq) {
            this.voiceSessionController.markUserCancelled(resource.toString());
            this.chatService.cancelCurrentRequestForSession(resource);
          }
        }
      },
      cancelSession: (resource) => {
        this.voiceSessionController.markUserCancelled(resource.toString());
        this.chatService.cancelCurrentRequestForSession(resource);
      },
      selectTargetSession: (resource) => {
        this.voiceSessionController.setTargetSession(resource);
        if (resource) {
          this.commandService.executeCommand("_chat.voice.switchToSession", resource.toString()).catch(() => {
          });
        }
      },
      newSessionAsTarget: () => {
        this.voiceSessionController.newSessionAsTarget();
      },
      getAnalyserNode: () => {
        const state = this.voiceSessionController.voiceState.get();
        return this.ttsPlaybackService.analyserNode ?? (state === "listening" ? this.micCaptureService.analyserNode : null) ?? null;
      },
      onResize: () => this._resizeWindow(auxiliaryWindow),
      getGlowTheme: () => isDark(this.themeService.getColorTheme().type) ? "dark" : "light",
      getGlowColors: () => resolveVoiceGlowColors(this.themeService.getColorTheme()),
      isMotionReduced: () => this.accessibilityService.isMotionReduced(),
      onDidChangeGlowTheme: Event.map(this.themeService.onDidColorThemeChange, () => void 0),
      openPttKeySettings: () => this.commandService.executeCommand("workbench.action.openGlobalKeybindings", "agentsVoice.pushToTalk"),
      showVoiceContextMenu: (e) => {
        const anchor = new StandardMouseEvent(getWindow(e.target ?? auxiliaryWindow.container), e);
        this.contextMenuService.showContextMenu({
          getAnchor: () => anchor,
          getActions: () => getVoiceModeContextMenuActions(this.commandService, this.configurationService, this.keybindingService, "agentsVoice.pushToTalk")
        });
      },
      submitFeedback: (text) => this.voiceSessionController.submitFeedback(text),
      showSessionsPicker: () => {
        const picker = this.instantiationService.createInstance(
          AgentsVoiceSessionsPicker,
          (resource) => this.voiceSessionController.setTargetSession(resource)
        );
        picker.show();
      }
    }, {
      defaultExpanded: false,
      inputBoxLayout: true,
      // Make the aux-window container focusable so keyboard Push-to-Talk
      // (the `agentsVoice.pushToTalk` keybinding) can be received and its
      // key-release tracking is registered. Without this the keyboard-PTT
      // handlers are never wired and a held key never stops recording.
      focusable: true
    });
    this._windowDisposables.add(widget);
    const getPttLabel = () => this.keybindingService.lookupKeybinding("agentsVoice.pushToTalk")?.getLabel() ?? void 0;
    widget.setPttKeyLabel(getPttLabel());
    this._windowDisposables.add(this.keybindingService.onDidUpdateKeybindings(() => {
      widget.setPttKeyLabel(getPttLabel());
    }));
    this._windowDisposables.add(bindWidgetToController(widget, {
      voiceSessionController: this.voiceSessionController,
      agentSessionsService: this.agentSessionsService,
      agentTitleBarStatusService: this.agentTitleBarStatusService,
      voicePlaybackService: this.voicePlaybackService,
      environmentService: this.environmentService,
      chatService: this.chatService,
      configurationService: this.configurationService
    }));
    this.agentSessionsService.model.resolve(void 0);
    this._windowDisposables.add(disposableWindowInterval(auxiliaryWindow.window, () => {
      this.agentSessionsService.model.resolve(void 0);
    }, 3e3));
    Event.once(auxiliaryWindow.onUnload)(() => {
      this.voiceSessionController.setTargetSession(void 0);
      this.voiceSessionController.disconnect();
      this._window = void 0;
      this._windowDisposables.clear();
      this._auxiliaryWindowRef.value = void 0;
      this.storageService.store(AgentsVoiceStorageKeys.WindowOpen, false, StorageScope.WORKSPACE, StorageTarget.MACHINE);
      this._onDidChangeOpen.fire(false);
    });
    this.storageService.store(AgentsVoiceStorageKeys.WindowOpen, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    this._onDidChangeOpen.fire(true);
  }
  closeWindow() {
    if (!this._window) {
      return;
    }
    this.saveBounds(this._window);
    this.voiceSessionController.setTargetSession(void 0);
    this.storageService.store(AgentsVoiceStorageKeys.WindowOpen, false, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    this._window = void 0;
    this._windowDisposables.clear();
    this._auxiliaryWindowRef.value = void 0;
    this._onDidChangeOpen.fire(false);
  }
  async toggleWindow() {
    if (this.isOpen) {
      this.closeWindow();
    } else {
      this._ownershipChannel.postMessage({ type: "claim" });
      await this.openWindow();
    }
  }
  // --- Window sizing ---
  _resizeWindow(auxiliaryWindow) {
    if (this._resizeTimeout) {
      clearTimeout(this._resizeTimeout);
    }
    this._resizeTimeout = setTimeout(() => {
      this._resizeTimeout = void 0;
      this._doResizeWindow(auxiliaryWindow);
    }, 100);
  }
  _doResizeWindow(auxiliaryWindow) {
    const pill = auxiliaryWindow.container.querySelector("div");
    if (!pill) {
      return;
    }
    void pill.offsetWidth;
    const pillWidth = pill.offsetWidth;
    const pillHeight = pill.offsetHeight;
    if (pillWidth <= 0 || pillHeight <= 0) {
      return;
    }
    const currentWidth = auxiliaryWindow.window.outerWidth;
    const currentHeight = auxiliaryWindow.window.outerHeight;
    if (pillWidth !== currentWidth || pillHeight !== currentHeight) {
      try {
        const screenBottom = auxiliaryWindow.window.screen.availHeight;
        const maxHeight = screenBottom - auxiliaryWindow.window.screenY;
        const clampedHeight = Math.min(pillHeight, Math.max(maxHeight, AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT));
        auxiliaryWindow.window.resizeTo(pillWidth, clampedHeight);
      } catch {
      }
    }
  }
  // --- Bounds persistence ---
  _defaultBounds() {
    const x = Math.round(mainWindow.screenX + (mainWindow.outerWidth - AGENTS_VOICE_WINDOW_DEFAULT_WIDTH) / 2);
    const y = mainWindow.screenY + mainWindow.outerHeight - AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT - 100;
    return {
      x,
      y,
      width: AGENTS_VOICE_WINDOW_DEFAULT_WIDTH,
      height: AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT
    };
  }
  loadBounds() {
    return this._defaultBounds();
  }
  saveBounds(_window) {
  }
};
AgentsVoiceWindowService = __decorateClass([
  __decorateParam(0, IAuxiliaryWindowService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IHostService),
  __decorateParam(4, IAgentSessionsService),
  __decorateParam(5, IAgentTitleBarStatusService),
  __decorateParam(6, IMicCaptureService),
  __decorateParam(7, ITtsPlaybackService),
  __decorateParam(8, IVoiceSessionController),
  __decorateParam(9, IVoicePlaybackService),
  __decorateParam(10, ICommandService),
  __decorateParam(11, IChatService),
  __decorateParam(12, IWorkspaceContextService),
  __decorateParam(13, IWorkbenchEnvironmentService),
  __decorateParam(14, IThemeService),
  __decorateParam(15, IAccessibilityService),
  __decorateParam(16, IKeybindingService),
  __decorateParam(17, IInstantiationService),
  __decorateParam(18, IContextMenuService)
], AgentsVoiceWindowService);
registerSingleton(IAgentsVoiceWindowService, AgentsVoiceWindowService, InstantiationType.Delayed);
export {
  AgentsVoiceWindowService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGFnZW50c1ZvaWNlXFxicm93c2VyXFxhZ2VudHNWb2ljZVdpbmRvd1NlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVdpbmRvd0ludGVydmFsLCBnZXRXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElBdXhpbGlhcnlXaW5kb3dTZXJ2aWNlLCBJQXV4aWxpYXJ5V2luZG93IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXV4aWxpYXJ5V2luZG93L2Jyb3dzZXIvYXV4aWxpYXJ5V2luZG93U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRzVm9pY2VXaW5kb3dTZXJ2aWNlLCBBZ2VudHNWb2ljZVN0b3JhZ2VLZXlzLCBBR0VOVFNfVk9JQ0VfV0lORE9XX0RFRkFVTFRfV0lEVEgsIEFHRU5UU19WT0lDRV9XSU5ET1dfREVGQVVMVF9IRUlHSFQgfSBmcm9tICcuLi9jb21tb24vYWdlbnRzVm9pY2UuanMnO1xuaW1wb3J0IHsgSVJlY3RhbmdsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvZXhwZXJpbWVudHMvYWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1pY0NhcHR1cmVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL3ZvaWNlQ2xpZW50L21pY0NhcHR1cmVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUdHNQbGF5YmFja1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvdm9pY2VDbGllbnQvdHRzUGxheWJhY2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWb2ljZVNlc3Npb25Db250cm9sbGVyIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSVZvaWNlUGxheWJhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vdm9pY2VQbGF5YmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNEYXJrIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZVZvaWNlR2xvd0NvbG9ycyB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC92b2ljZUdsb3cuanMnO1xuaW1wb3J0IHsgZWRpdG9yQmFja2dyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGVkaXRvcldpZGdldEJvcmRlciwgd2lkZ2V0U2hhZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9ycy9lZGl0b3JDb2xvcnMuanMnO1xuaW1wb3J0IHsgaW5wdXRCYWNrZ3JvdW5kLCBpbnB1dEJvcmRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvcnMvaW5wdXRDb2xvcnMuanMnO1xuaW1wb3J0IHsgQWdlbnRzVm9pY2VXaWRnZXQgfSBmcm9tICcuL2FnZW50c1ZvaWNlV2lkZ2V0LmpzJztcbmltcG9ydCB7IGJpbmRXaWRnZXRUb0NvbnRyb2xsZXIgfSBmcm9tICcuL2FnZW50c1ZvaWNlV2lkZ2V0QmluZGluZy5qcyc7XG5pbXBvcnQgeyBBZ2VudHNWb2ljZVNlc3Npb25zUGlja2VyIH0gZnJvbSAnLi9hZ2VudHNWb2ljZVNlc3Npb25zUGlja2VyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgZ2V0Vm9pY2VNb2RlQ29udGV4dE1lbnVBY3Rpb25zIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL3NwZWVjaFRvVGV4dC9taWNCdXR0b25NZW51QWN0aW9ucy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBBZ2VudHNWb2ljZVdpbmRvd1NlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50c1ZvaWNlV2luZG93U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VPcGVuID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlT3BlbjogRXZlbnQ8Ym9vbGVhbj4gPSB0aGlzLl9vbkRpZENoYW5nZU9wZW4uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYXV4aWxpYXJ5V2luZG93UmVmID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIF93aW5kb3c6IElBdXhpbGlhcnlXaW5kb3cgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dpbmRvd0Rpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb3duZXJzaGlwQ2hhbm5lbDogQnJvYWRjYXN0Q2hhbm5lbDtcblx0cHJpdmF0ZSBfcmVzaXplVGltZW91dDogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCB1bmRlZmluZWQ7XG5cblx0Z2V0IGlzT3BlbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLl93aW5kb3c7XG5cdH1cblxuXHQvKipcblx0ICogQ2FsbHMgc2V0V2luZG93QWx3YXlzT25Ub3AgdmlhIGEgcmVnaXN0ZXJlZCBjb21tYW5kIChFbGVjdHJvbiBvbmx5KS5cblx0ICogQXZvaWRzIGltcG9ydGluZyBJTmF0aXZlSG9zdFNlcnZpY2UgaW4gdGhlIGJyb3dzZXIgbGF5ZXIuXG5cdCAqL1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUF1eGlsaWFyeVdpbmRvd1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXhpbGlhcnlXaW5kb3dTZXJ2aWNlOiBJQXV4aWxpYXJ5V2luZG93U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASUFnZW50U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRTZXNzaW9uc1NlcnZpY2U6IElBZ2VudFNlc3Npb25zU2VydmljZSxcblx0XHRASUFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2U6IElBZ2VudFRpdGxlQmFyU3RhdHVzU2VydmljZSxcblx0XHRASU1pY0NhcHR1cmVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWljQ2FwdHVyZVNlcnZpY2U6IElNaWNDYXB0dXJlU2VydmljZSxcblx0XHRASVR0c1BsYXliYWNrU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHR0c1BsYXliYWNrU2VydmljZTogSVR0c1BsYXliYWNrU2VydmljZSxcblx0XHRASVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIgcHJpdmF0ZSByZWFkb25seSB2b2ljZVNlc3Npb25Db250cm9sbGVyOiBJVm9pY2VTZXNzaW9uQ29udHJvbGxlcixcblx0XHRASVZvaWNlUGxheWJhY2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdm9pY2VQbGF5YmFja1NlcnZpY2U6IElWb2ljZVBsYXliYWNrU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IG93bmVyc2hpcENoYW5uZWwgPSBuZXcgQnJvYWRjYXN0Q2hhbm5lbCgnYWdlbnRzLXZvaWNlLW93bmVyc2hpcCcpO1xuXHRcdG93bmVyc2hpcENoYW5uZWwub25tZXNzYWdlID0gKGUpID0+IHtcblx0XHRcdGlmIChlLmRhdGE/LnR5cGUgPT09ICdjbGFpbScgJiYgdGhpcy5fd2luZG93KSB7XG5cdFx0XHRcdHRoaXMuY2xvc2VXaW5kb3coKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHsgZGlzcG9zZTogKCkgPT4gb3duZXJzaGlwQ2hhbm5lbC5jbG9zZSgpIH0pO1xuXHRcdHRoaXMuX293bmVyc2hpcENoYW5uZWwgPSBvd25lcnNoaXBDaGFubmVsO1xuXG5cdFx0Y29uc3Qgb25CZWZvcmVVbmxvYWQgPSAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fd2luZG93KSB7XG5cdFx0XHRcdHRoaXMuY2xvc2VXaW5kb3coKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdG1haW5XaW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignYmVmb3JldW5sb2FkJywgb25CZWZvcmVVbmxvYWQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHsgZGlzcG9zZTogKCkgPT4gbWFpbldpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdiZWZvcmV1bmxvYWQnLCBvbkJlZm9yZVVubG9hZCkgfSk7XG5cblx0XHRjb25zdCB3YXNPcGVuID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKEFnZW50c1ZvaWNlU3RvcmFnZUtleXMuV2luZG93T3BlbiwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgZmFsc2UpO1xuXHRcdGlmICh3YXNPcGVuKSB7XG5cdFx0XHQvLyBDbGVhciB0aGUgc3RvcmVkIHN0YXRlIHNvIGl0IGRvZXNuJ3QgdHJ5IHRvIHJlb3BlbiBpbiB0aGUgZnV0dXJlXG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEFnZW50c1ZvaWNlU3RvcmFnZUtleXMuV2luZG93T3BlbiwgZmFsc2UsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgb3BlbldpbmRvdygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fd2luZG93KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYm91bmRzID0gdGhpcy5sb2FkQm91bmRzKCk7XG5cblx0XHRjb25zdCBhdXhpbGlhcnlXaW5kb3cgPSBhd2FpdCB0aGlzLmF1eGlsaWFyeVdpbmRvd1NlcnZpY2Uub3Blbih7XG5cdFx0XHRib3VuZHMsXG5cdFx0XHRhbHdheXNPblRvcDogdHJ1ZSxcblx0XHRcdGZyYW1lbGVzczogdHJ1ZSxcblx0XHRcdHRyYW5zcGFyZW50OiBmYWxzZSxcblx0XHRcdGRpc2FibGVGdWxsc2NyZWVuOiB0cnVlLFxuXHRcdFx0bmF0aXZlVGl0bGViYXI6IGZhbHNlLFxuXHRcdFx0bm9CYWNrZ3JvdW5kVGhyb3R0bGluZzogdHJ1ZSxcblx0XHRcdGJhY2tncm91bmRDb2xvcjogdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLmdldENvbG9yKGVkaXRvckJhY2tncm91bmQpPy50b1N0cmluZygpID8/ICcjMWUxZTFlJyxcblx0XHR9KTtcblxuXHRcdHRoaXMuX3dpbmRvdyA9IGF1eGlsaWFyeVdpbmRvdztcblx0XHR0aGlzLl9hdXhpbGlhcnlXaW5kb3dSZWYudmFsdWUgPSBhdXhpbGlhcnlXaW5kb3c7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdGNvbnN0IHByb2plY3ROYW1lID0gd29ya3NwYWNlLmZvbGRlcnMubGVuZ3RoID4gMCA/IHdvcmtzcGFjZS5mb2xkZXJzWzBdLm5hbWUgOiAnJztcblx0XHRhdXhpbGlhcnlXaW5kb3cud2luZG93LmRvY3VtZW50LnRpdGxlID0gcHJvamVjdE5hbWUgPyBgQWdlbnRzIFZvaWNlIFx1MjAxNCAke3Byb2plY3ROYW1lfWAgOiAnQWdlbnRzIFZvaWNlJztcblxuXHRcdGF1eGlsaWFyeVdpbmRvdy5jb250YWluZXIuc3R5bGUub3ZlcmZsb3cgPSAnaGlkZGVuJztcblx0XHRhdXhpbGlhcnlXaW5kb3cud2luZG93LmRvY3VtZW50LmJvZHkuc3R5bGUuc2V0UHJvcGVydHkoJ21hcmdpbicsICcwJywgJ2ltcG9ydGFudCcpO1xuXG5cdFx0Ly8gUmVzb2x2ZSB0aGVtZSBjb2xvcnMgc28gdGhlIGF1eCB3aW5kb3cgbWF0Y2hlcyB0aGUgY2hhdCBpbnB1dCBib3hcblx0XHRjb25zdCB0aGVtZSA9IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0XHRjb25zdCBiZ0NvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZWRpdG9yQmFja2dyb3VuZCk/LnRvU3RyaW5nKCkgPz8gJyMxZTFlMWUnO1xuXHRcdGNvbnN0IGlucHV0QmcgPSB0aGVtZS5nZXRDb2xvcihpbnB1dEJhY2tncm91bmQpPy50b1N0cmluZygpID8/ICcjM0MzQzNDJztcblx0XHRjb25zdCBpbnB1dEJkID0gdGhlbWUuZ2V0Q29sb3IoaW5wdXRCb3JkZXIpPy50b1N0cmluZygpID8/IHRoZW1lLmdldENvbG9yKGVkaXRvcldpZGdldEJvcmRlcik/LnRvU3RyaW5nKCkgPz8gJ3RyYW5zcGFyZW50Jztcblx0XHRjb25zdCBzaGFkb3cgPSB0aGVtZS5nZXRDb2xvcih3aWRnZXRTaGFkb3cpPy50b1N0cmluZygpID8/ICd0cmFuc3BhcmVudCc7XG5cblx0XHRhdXhpbGlhcnlXaW5kb3cuY29udGFpbmVyLnN0eWxlLnNldFByb3BlcnR5KCctLXZzY29kZS1hZ2VudHMtYmFja2dyb3VuZCcsIGJnQ29sb3IpO1xuXHRcdGF1eGlsaWFyeVdpbmRvdy5jb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gaW5wdXRCZztcblx0XHRhdXhpbGlhcnlXaW5kb3cuY29udGFpbmVyLnN0eWxlLmJvcmRlciA9IGAxcHggc29saWQgJHtpbnB1dEJkfWA7XG5cdFx0YXV4aWxpYXJ5V2luZG93LmNvbnRhaW5lci5zdHlsZS5ib3hTaGFkb3cgPSBgMCAycHggOHB4ICR7c2hhZG93fWA7XG5cdFx0YXV4aWxpYXJ5V2luZG93LmNvbnRhaW5lci5zdHlsZS5ib3hTaXppbmcgPSAnYm9yZGVyLWJveCc7XG5cdFx0YXV4aWxpYXJ5V2luZG93LndpbmRvdy5kb2N1bWVudC5ib2R5LnN0eWxlLnNldFByb3BlcnR5KCdiYWNrZ3JvdW5kLWNvbG9yJywgaW5wdXRCZywgJ2ltcG9ydGFudCcpO1xuXG5cdFx0dGhpcy5fd2luZG93RGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdC8vIENyZWF0ZSB0aGUgd2lkZ2V0IFx1MjAxNCBhdXggd2luZG93IHVzZXMgdGhlIGRlZmF1bHQgb3B0aW9ucyAoZHJhZ2dhYmxlLCBmaXhlZFxuXHRcdC8vIHdpZHRoLCBjbG9zZSBidXR0b24sIGV4cGFuZCBjaGV2cm9uLCBzdGF0dXMgcm93cywgbm8gc3RhdHVzLXRleHQgbGFiZWwsXG5cdFx0Ly8gbm8gcG9wb3V0IGJ1dHRvbikuIFNlc3Npb25zIGFyZSBjb2xsYXBzZWQgYnkgZGVmYXVsdDsgdGhlIHVzZXIgY2FuXG5cdFx0Ly8gZXhwYW5kIHRoZW0gdmlhIHRoZSBjaGV2cm9uLlxuXHRcdGNvbnN0IHdpZGdldCA9IG5ldyBBZ2VudHNWb2ljZVdpZGdldChhdXhpbGlhcnlXaW5kb3cuY29udGFpbmVyLCB7XG5cdFx0XHRjb3BpbG90SWNvblNyYzogRmlsZUFjY2Vzcy5hc0Jyb3dzZXJVcmkoJ3ZzL3Nlc3Npb25zL2Jyb3dzZXIvbWVkaWEvc2Vzc2lvbnMtaWNvbi5zdmcnKS50b1N0cmluZyh0cnVlKSxcblx0XHRcdGhpZGVEaXNjb25uZWN0OiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdhZ2VudHMudm9pY2UuaGFuZHNGcmVlJykgPT09IHRydWUsXG5cdFx0XHRjb25uZWN0OiAoKSA9PiB7XG5cdFx0XHRcdC8vIENvbm5lY3RpbmcgZnJvbSBhbnkgc3VyZmFjZSBtYXJrcyBvbmJvYXJkaW5nIGFzIGNvbXBsZXRlZCBzb1xuXHRcdFx0XHQvLyB0aGUgbWFpbiBwYW5lbCBkcm9wcyBpdCB0b28uXG5cdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQWdlbnRzVm9pY2VTdG9yYWdlS2V5cy5PbmJvYXJkaW5nQ29tcGxldGVkLCB0cnVlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRcdFx0dGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmNvbm5lY3QobWFpbldpbmRvdyk7XG5cdFx0XHR9LFxuXHRcdFx0ZGlzY29ubmVjdDogKCkgPT4gdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmRpc2Nvbm5lY3QoJ2V4cGxpY2l0JyksXG5cdFx0XHRwdHREb3duOiAoKSA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmlzQ29ubmVjdGVkLmdldCgpICYmICF0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuaXNDb25uZWN0aW5nLmdldCgpKSB7XG5cdFx0XHRcdFx0dGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmNvbm5lY3QobWFpbldpbmRvdykudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmlzQ29ubmVjdGVkLmdldCgpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5wdHREb3duKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5wdHREb3duKCk7XG5cdFx0XHR9LFxuXHRcdFx0cHR0VXA6ICgpID0+IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5wdHRVcCgpLFxuXHRcdFx0Y2xvc2VXaW5kb3c6ICgpID0+IHRoaXMuY2xvc2VXaW5kb3coKSxcblx0XHRcdHN0b3BQbGF5YmFjazogKCkgPT4gdGhpcy50dHNQbGF5YmFja1NlcnZpY2Uuc3RvcFBsYXliYWNrKCksXG5cdFx0XHRvcGVuU2Vzc2lvbjogKHJlc291cmNlKSA9PiB7XG5cdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ19jaGF0LnZvaWNlLnN3aXRjaFRvU2Vzc2lvbicsIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR0aGlzLmhvc3RTZXJ2aWNlLmZvY3VzKG1haW5XaW5kb3cpO1xuXHRcdFx0fSxcblx0XHRcdHN0b3BTZXNzaW9uOiAocmVzb3VyY2UpID0+IHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb24ocmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAobW9kZWwpIHtcblx0XHRcdFx0XHRjb25zdCBsYXN0UmVxID0gbW9kZWwuZ2V0UmVxdWVzdHMoKS5hdCgtMSk7XG5cdFx0XHRcdFx0aWYgKGxhc3RSZXEpIHtcblx0XHRcdFx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5tYXJrVXNlckNhbmNlbGxlZChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRcdHRoaXMuY2hhdFNlcnZpY2UuY2FuY2VsQ3VycmVudFJlcXVlc3RGb3JTZXNzaW9uKHJlc291cmNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRjYW5jZWxTZXNzaW9uOiAocmVzb3VyY2UpID0+IHtcblx0XHRcdFx0dGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLm1hcmtVc2VyQ2FuY2VsbGVkKHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR0aGlzLmNoYXRTZXJ2aWNlLmNhbmNlbEN1cnJlbnRSZXF1ZXN0Rm9yU2Vzc2lvbihyZXNvdXJjZSk7XG5cdFx0XHR9LFxuXHRcdFx0c2VsZWN0VGFyZ2V0U2Vzc2lvbjogKHJlc291cmNlKSA9PiB7XG5cdFx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5zZXRUYXJnZXRTZXNzaW9uKHJlc291cmNlKTtcblx0XHRcdFx0Ly8gUmV2ZWFsIHRoZSBzZWxlY3RlZCBzZXNzaW9uIGluIHRoZSBjaGF0IHBhbmVsXG5cdFx0XHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ19jaGF0LnZvaWNlLnN3aXRjaFRvU2Vzc2lvbicsIHJlc291cmNlLnRvU3RyaW5nKCkpLmNhdGNoKCgpID0+IHsgLyogaWdub3JlICovIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0bmV3U2Vzc2lvbkFzVGFyZ2V0OiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5uZXdTZXNzaW9uQXNUYXJnZXQoKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRBbmFseXNlck5vZGU6ICgpID0+IHtcblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIudm9pY2VTdGF0ZS5nZXQoKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMudHRzUGxheWJhY2tTZXJ2aWNlLmFuYWx5c2VyTm9kZVxuXHRcdFx0XHRcdD8/IChzdGF0ZSA9PT0gJ2xpc3RlbmluZycgPyB0aGlzLm1pY0NhcHR1cmVTZXJ2aWNlLmFuYWx5c2VyTm9kZSA6IG51bGwpXG5cdFx0XHRcdFx0Pz8gbnVsbDtcblx0XHRcdH0sXG5cdFx0XHRvblJlc2l6ZTogKCkgPT4gdGhpcy5fcmVzaXplV2luZG93KGF1eGlsaWFyeVdpbmRvdyksXG5cdFx0XHRnZXRHbG93VGhlbWU6ICgpID0+IGlzRGFyayh0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkudHlwZSkgPyAnZGFyaycgOiAnbGlnaHQnLFxuXHRcdFx0Z2V0R2xvd0NvbG9yczogKCkgPT4gcmVzb2x2ZVZvaWNlR2xvd0NvbG9ycyh0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkpLFxuXHRcdFx0aXNNb3Rpb25SZWR1Y2VkOiAoKSA9PiB0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzTW90aW9uUmVkdWNlZCgpLFxuXHRcdFx0b25EaWRDaGFuZ2VHbG93VGhlbWU6IEV2ZW50Lm1hcCh0aGlzLnRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UsICgpID0+IHVuZGVmaW5lZCksXG5cdFx0XHRvcGVuUHR0S2V5U2V0dGluZ3M6ICgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3Blbkdsb2JhbEtleWJpbmRpbmdzJywgJ2FnZW50c1ZvaWNlLnB1c2hUb1RhbGsnKSxcblx0XHRcdHNob3dWb2ljZUNvbnRleHRNZW51OiAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0XHRjb25zdCBhbmNob3IgPSBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGdldFdpbmRvdyhlLnRhcmdldCBhcyBOb2RlID8/IGF1eGlsaWFyeVdpbmRvdy5jb250YWluZXIpLCBlKTtcblx0XHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0XHRnZXRBbmNob3I6ICgpID0+IGFuY2hvcixcblx0XHRcdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBnZXRWb2ljZU1vZGVDb250ZXh0TWVudUFjdGlvbnModGhpcy5jb21tYW5kU2VydmljZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5rZXliaW5kaW5nU2VydmljZSwgJ2FnZW50c1ZvaWNlLnB1c2hUb1RhbGsnKSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdFx0c3VibWl0RmVlZGJhY2s6ICh0ZXh0KSA9PiB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuc3VibWl0RmVlZGJhY2sodGV4dCksXG5cdFx0XHRzaG93U2Vzc2lvbnNQaWNrZXI6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcGlja2VyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0XHRBZ2VudHNWb2ljZVNlc3Npb25zUGlja2VyLFxuXHRcdFx0XHRcdChyZXNvdXJjZSkgPT4gdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLnNldFRhcmdldFNlc3Npb24ocmVzb3VyY2UpLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRwaWNrZXIuc2hvdygpO1xuXHRcdFx0fSxcblx0XHR9LCB7XG5cdFx0XHRkZWZhdWx0RXhwYW5kZWQ6IGZhbHNlLFxuXHRcdFx0aW5wdXRCb3hMYXlvdXQ6IHRydWUsXG5cdFx0XHQvLyBNYWtlIHRoZSBhdXgtd2luZG93IGNvbnRhaW5lciBmb2N1c2FibGUgc28ga2V5Ym9hcmQgUHVzaC10by1UYWxrXG5cdFx0XHQvLyAodGhlIGBhZ2VudHNWb2ljZS5wdXNoVG9UYWxrYCBrZXliaW5kaW5nKSBjYW4gYmUgcmVjZWl2ZWQgYW5kIGl0c1xuXHRcdFx0Ly8ga2V5LXJlbGVhc2UgdHJhY2tpbmcgaXMgcmVnaXN0ZXJlZC4gV2l0aG91dCB0aGlzIHRoZSBrZXlib2FyZC1QVFRcblx0XHRcdC8vIGhhbmRsZXJzIGFyZSBuZXZlciB3aXJlZCBhbmQgYSBoZWxkIGtleSBuZXZlciBzdG9wcyByZWNvcmRpbmcuXG5cdFx0XHRmb2N1c2FibGU6IHRydWUsXG5cdFx0fSk7XG5cdFx0dGhpcy5fd2luZG93RGlzcG9zYWJsZXMuYWRkKHdpZGdldCk7XG5cblx0XHQvLyBQVFQga2V5IGxhYmVsIGZyb20ga2V5YmluZGluZ1xuXHRcdGNvbnN0IGdldFB0dExhYmVsID0gKCkgPT4gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKCdhZ2VudHNWb2ljZS5wdXNoVG9UYWxrJyk/LmdldExhYmVsKCkgPz8gdW5kZWZpbmVkO1xuXHRcdHdpZGdldC5zZXRQdHRLZXlMYWJlbChnZXRQdHRMYWJlbCgpKTtcblx0XHR0aGlzLl93aW5kb3dEaXNwb3NhYmxlcy5hZGQodGhpcy5rZXliaW5kaW5nU2VydmljZS5vbkRpZFVwZGF0ZUtleWJpbmRpbmdzKCgpID0+IHtcblx0XHRcdHdpZGdldC5zZXRQdHRLZXlMYWJlbChnZXRQdHRMYWJlbCgpKTtcblx0XHR9KSk7XG5cblx0XHQvLyBTaGFyZWQgY29udHJvbGxlclx1MjE5MndpZGdldCBiaW5kaW5nIChhbHNvIHVzZWQgYnkgY2hhdFZpZXdQYW5lKVxuXHRcdHRoaXMuX3dpbmRvd0Rpc3Bvc2FibGVzLmFkZChiaW5kV2lkZ2V0VG9Db250cm9sbGVyKHdpZGdldCwge1xuXHRcdFx0dm9pY2VTZXNzaW9uQ29udHJvbGxlcjogdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLFxuXHRcdFx0YWdlbnRTZXNzaW9uc1NlcnZpY2U6IHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0XHRhZ2VudFRpdGxlQmFyU3RhdHVzU2VydmljZTogdGhpcy5hZ2VudFRpdGxlQmFyU3RhdHVzU2VydmljZSxcblx0XHRcdHZvaWNlUGxheWJhY2tTZXJ2aWNlOiB0aGlzLnZvaWNlUGxheWJhY2tTZXJ2aWNlLFxuXHRcdFx0ZW52aXJvbm1lbnRTZXJ2aWNlOiB0aGlzLmVudmlyb25tZW50U2VydmljZSxcblx0XHRcdGNoYXRTZXJ2aWNlOiB0aGlzLmNoYXRTZXJ2aWNlLFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0fSkpO1xuXG5cdFx0Ly8gUG9sbCBmb3Igc2Vzc2lvbiB1cGRhdGVzXG5cdFx0dGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fd2luZG93RGlzcG9zYWJsZXMuYWRkKGRpc3Bvc2FibGVXaW5kb3dJbnRlcnZhbChhdXhpbGlhcnlXaW5kb3cud2luZG93LCAoKSA9PiB7XG5cdFx0XHR0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9LCAzMDAwKSk7XG5cblxuXHRcdC8vIENsZWFuIHVwIHdoZW4gdXNlciBjbG9zZXMgd2luZG93IHZpYSBPUyBjb250cm9sc1xuXHRcdEV2ZW50Lm9uY2UoYXV4aWxpYXJ5V2luZG93Lm9uVW5sb2FkKSgoKSA9PiB7XG5cdFx0XHR0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuc2V0VGFyZ2V0U2Vzc2lvbih1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmRpc2Nvbm5lY3QoKTtcblx0XHRcdHRoaXMuX3dpbmRvdyA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3dpbmRvd0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9hdXhpbGlhcnlXaW5kb3dSZWYudmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEFnZW50c1ZvaWNlU3RvcmFnZUtleXMuV2luZG93T3BlbiwgZmFsc2UsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZU9wZW4uZmlyZShmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEFnZW50c1ZvaWNlU3RvcmFnZUtleXMuV2luZG93T3BlbiwgdHJ1ZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZU9wZW4uZmlyZSh0cnVlKTtcblx0fVxuXG5cdGNsb3NlV2luZG93KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fd2luZG93KSB7IHJldHVybjsgfVxuXG5cdFx0dGhpcy5zYXZlQm91bmRzKHRoaXMuX3dpbmRvdyk7XG5cdFx0Ly8gRG9uJ3QgZGlzY29ubmVjdCBcdTIwMTQgY2xvc2luZyB0aGUgZmxvYXRpbmcgd2luZG93IG1pbmltaXplcyB0aGUgVUkgYnV0XG5cdFx0Ly8ga2VlcHMgdGhlIHZvaWNlIHNlc3Npb24gYWxpdmUuIFRoZSBzZXNzaW9uIGVuZHMgb24gdGVybWluYWwgZGlzY29ubmVjdFxuXHRcdC8vIChEaXNjb25uZWN0IGJ1dHRvbiBvciBhcHAgZXhpdCB2aWEgb25VbmxvYWQpLlxuXHRcdC8vIENsZWFyIHRhcmdldCBzZXNzaW9uIHNlbGVjdGlvbiBzbyBpdCBkb2Vzbid0IHNpbGVudGx5IHBlcnNpc3QuXG5cdFx0dGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLnNldFRhcmdldFNlc3Npb24odW5kZWZpbmVkKTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEFnZW50c1ZvaWNlU3RvcmFnZUtleXMuV2luZG93T3BlbiwgZmFsc2UsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cblx0XHR0aGlzLl93aW5kb3cgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fd2luZG93RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9hdXhpbGlhcnlXaW5kb3dSZWYudmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VPcGVuLmZpcmUoZmFsc2UpO1xuXHR9XG5cblx0YXN5bmMgdG9nZ2xlV2luZG93KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmlzT3Blbikge1xuXHRcdFx0dGhpcy5jbG9zZVdpbmRvdygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9vd25lcnNoaXBDaGFubmVsLnBvc3RNZXNzYWdlKHsgdHlwZTogJ2NsYWltJyB9KTtcblx0XHRcdGF3YWl0IHRoaXMub3BlbldpbmRvdygpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLSBXaW5kb3cgc2l6aW5nIC0tLVxuXG5cdHByaXZhdGUgX3Jlc2l6ZVdpbmRvdyhhdXhpbGlhcnlXaW5kb3c6IElBdXhpbGlhcnlXaW5kb3cpOiB2b2lkIHtcblx0XHQvLyBEZWJvdW5jZSByZXNpemUgdG8gYXZvaWQgZmlnaHRpbmcgdXNlciBkcmFnIG9wZXJhdGlvbnNcblx0XHRpZiAodGhpcy5fcmVzaXplVGltZW91dCkge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX3Jlc2l6ZVRpbWVvdXQpO1xuXHRcdH1cblx0XHR0aGlzLl9yZXNpemVUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZXNpemVUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fZG9SZXNpemVXaW5kb3coYXV4aWxpYXJ5V2luZG93KTtcblx0XHR9LCAxMDApO1xuXHR9XG5cblx0cHJpdmF0ZSBfZG9SZXNpemVXaW5kb3coYXV4aWxpYXJ5V2luZG93OiBJQXV4aWxpYXJ5V2luZG93KTogdm9pZCB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgcGlsbCA9IGF1eGlsaWFyeVdpbmRvdy5jb250YWluZXIucXVlcnlTZWxlY3RvcignZGl2JykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdGlmICghcGlsbCkgeyByZXR1cm47IH1cblx0XHR2b2lkIHBpbGwub2Zmc2V0V2lkdGg7XG5cdFx0Y29uc3QgcGlsbFdpZHRoID0gcGlsbC5vZmZzZXRXaWR0aDtcblx0XHRjb25zdCBwaWxsSGVpZ2h0ID0gcGlsbC5vZmZzZXRIZWlnaHQ7XG5cdFx0aWYgKHBpbGxXaWR0aCA8PSAwIHx8IHBpbGxIZWlnaHQgPD0gMCkgeyByZXR1cm47IH1cblx0XHRjb25zdCBjdXJyZW50V2lkdGggPSBhdXhpbGlhcnlXaW5kb3cud2luZG93Lm91dGVyV2lkdGg7XG5cdFx0Y29uc3QgY3VycmVudEhlaWdodCA9IGF1eGlsaWFyeVdpbmRvdy53aW5kb3cub3V0ZXJIZWlnaHQ7XG5cdFx0aWYgKHBpbGxXaWR0aCAhPT0gY3VycmVudFdpZHRoIHx8IHBpbGxIZWlnaHQgIT09IGN1cnJlbnRIZWlnaHQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdC8vIENsYW1wIGhlaWdodCBzbyB3aW5kb3cgZG9lc24ndCBleGNlZWQgYXZhaWxhYmxlIHNjcmVlbiBzcGFjZS5cblx0XHRcdFx0Y29uc3Qgc2NyZWVuQm90dG9tID0gYXV4aWxpYXJ5V2luZG93LndpbmRvdy5zY3JlZW4uYXZhaWxIZWlnaHQ7XG5cdFx0XHRcdGNvbnN0IG1heEhlaWdodCA9IHNjcmVlbkJvdHRvbSAtIGF1eGlsaWFyeVdpbmRvdy53aW5kb3cuc2NyZWVuWTtcblx0XHRcdFx0Y29uc3QgY2xhbXBlZEhlaWdodCA9IE1hdGgubWluKHBpbGxIZWlnaHQsIE1hdGgubWF4KG1heEhlaWdodCwgQUdFTlRTX1ZPSUNFX1dJTkRPV19ERUZBVUxUX0hFSUdIVCkpO1xuXHRcdFx0XHQvLyByZXNpemVUbyBvbmx5IFx1MjAxNCBubyBtb3ZlVG8uIE9uIG1hY09TIHRoaXMga2VlcHMgdG9wLWxlZnQgZml4ZWQsXG5cdFx0XHRcdC8vIHdpbmRvdyBncm93cy9zaHJpbmtzIGRvd253YXJkLiBObyB2aXNpYmxlIHBvc2l0aW9uIGNoYW5nZS5cblx0XHRcdFx0YXV4aWxpYXJ5V2luZG93LndpbmRvdy5yZXNpemVUbyhwaWxsV2lkdGgsIGNsYW1wZWRIZWlnaHQpO1xuXHRcdFx0fSBjYXRjaCB7IC8qIHJlc2l6ZSBtYXkgbm90IGJlIHN1cHBvcnRlZCAqLyB9XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIEJvdW5kcyBwZXJzaXN0ZW5jZSAtLS1cblxuXHRwcml2YXRlIF9kZWZhdWx0Qm91bmRzKCk6IElSZWN0YW5nbGUge1xuXHRcdC8vIENlbnRlciBob3Jpem9udGFsbHkgd2l0aGluIHRoZSBtYWluIFZTIENvZGUgd2luZG93LCBuZWFyIGJvdHRvbS5cblx0XHRjb25zdCB4ID0gTWF0aC5yb3VuZChtYWluV2luZG93LnNjcmVlblggKyAobWFpbldpbmRvdy5vdXRlcldpZHRoIC0gQUdFTlRTX1ZPSUNFX1dJTkRPV19ERUZBVUxUX1dJRFRIKSAvIDIpO1xuXHRcdGNvbnN0IHkgPSBtYWluV2luZG93LnNjcmVlblkgKyBtYWluV2luZG93Lm91dGVySGVpZ2h0IC0gQUdFTlRTX1ZPSUNFX1dJTkRPV19ERUZBVUxUX0hFSUdIVCAtIDEwMDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0eCxcblx0XHRcdHksXG5cdFx0XHR3aWR0aDogQUdFTlRTX1ZPSUNFX1dJTkRPV19ERUZBVUxUX1dJRFRILFxuXHRcdFx0aGVpZ2h0OiBBR0VOVFNfVk9JQ0VfV0lORE9XX0RFRkFVTFRfSEVJR0hULFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGxvYWRCb3VuZHMoKTogSVJlY3RhbmdsZSB7XG5cdFx0Ly8gQWx3YXlzIGNvbXB1dGUgZnJlc2ggYm91bmRzIGZyb20gdGhlIGN1cnJlbnQgbWFpbiB3aW5kb3cgcG9zaXRpb24uXG5cdFx0Ly8gVGhpcyBlbnN1cmVzIHRoZSBhdXggd2luZG93IGlzIGFsd2F5cyBjZW50ZXJlZCB3aXRoaW4gVlMgQ29kZS5cblx0XHRyZXR1cm4gdGhpcy5fZGVmYXVsdEJvdW5kcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBzYXZlQm91bmRzKF93aW5kb3c6IElBdXhpbGlhcnlXaW5kb3cpOiB2b2lkIHtcblx0XHQvLyBCb3VuZHMgcGVyc2lzdGVuY2UgZGlzYWJsZWQgXHUyMDE0IGFsd2F5cyB1c2UgZnJlc2ggZGVmYXVsdHMgZm9yIG5vdy5cblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJQWdlbnRzVm9pY2VXaW5kb3dTZXJ2aWNlLCBBZ2VudHNWb2ljZVdpbmRvd1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFlBQVksaUJBQWlCLHlCQUF5QjtBQUMvRCxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDBCQUEwQixpQkFBaUI7QUFDcEQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsK0JBQWlEO0FBQzFELFNBQVMsMkJBQTJCLHdCQUF3QixtQ0FBbUMsMENBQTBDO0FBRXpJLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsY0FBYztBQUN2QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG9CQUFvQixvQkFBb0I7QUFDakQsU0FBUyxpQkFBaUIsbUJBQW1CO0FBQzdDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0NBQXNDO0FBRXhDLElBQU0sMkJBQU4sY0FBdUMsV0FBZ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBcUI3RixZQUMyQyx3QkFDUixnQkFDTSxzQkFDVCxhQUNTLHNCQUNNLDRCQUNULG1CQUNDLG9CQUNJLHdCQUNGLHNCQUNOLGdCQUNILGFBQ1kseUJBQ0ksb0JBQ2YsY0FDUSxzQkFDSCxtQkFDRyxzQkFDRixvQkFDckM7QUFDRCxVQUFNO0FBcEJvQztBQUNSO0FBQ007QUFDVDtBQUNTO0FBQ007QUFDVDtBQUNDO0FBQ0k7QUFDRjtBQUNOO0FBQ0g7QUFDWTtBQUNJO0FBQ2Y7QUFDUTtBQUNIO0FBQ0c7QUFDRjtBQXBDdkMsU0FBaUIsbUJBQW1CLEtBQUssVUFBVSxJQUFJLFFBQWlCLENBQUM7QUFDekUsU0FBUyxrQkFBa0MsS0FBSyxpQkFBaUI7QUFFakUsU0FBaUIsc0JBQXNCLEtBQUssVUFBVSxJQUFJLGtCQUFrQixDQUFDO0FBRTdFLFNBQWlCLHFCQUFxQixLQUFLLFVBQVUsSUFBSSxnQkFBZ0IsQ0FBQztBQW1DekUsVUFBTSxtQkFBbUIsSUFBSSxpQkFBaUIsd0JBQXdCO0FBQ3RFLHFCQUFpQixZQUFZLENBQUMsTUFBTTtBQUNuQyxVQUFJLEVBQUUsTUFBTSxTQUFTLFdBQVcsS0FBSyxTQUFTO0FBQzdDLGFBQUssWUFBWTtBQUFBLE1BQ2xCO0FBQUEsSUFDRDtBQUNBLFNBQUssVUFBVSxFQUFFLFNBQVMsTUFBTSxpQkFBaUIsTUFBTSxFQUFFLENBQUM7QUFDMUQsU0FBSyxvQkFBb0I7QUFFekIsVUFBTSxpQkFBaUIsTUFBTTtBQUM1QixVQUFJLEtBQUssU0FBUztBQUNqQixhQUFLLFlBQVk7QUFBQSxNQUNsQjtBQUFBLElBQ0Q7QUFDQSxlQUFXLGlCQUFpQixnQkFBZ0IsY0FBYztBQUMxRCxTQUFLLFVBQVUsRUFBRSxTQUFTLE1BQU0sV0FBVyxvQkFBb0IsZ0JBQWdCLGNBQWMsRUFBRSxDQUFDO0FBRWhHLFVBQU0sVUFBVSxLQUFLLGVBQWUsV0FBVyx1QkFBdUIsWUFBWSxhQUFhLFdBQVcsS0FBSztBQUMvRyxRQUFJLFNBQVM7QUFFWixXQUFLLGVBQWUsTUFBTSx1QkFBdUIsWUFBWSxPQUFPLGFBQWEsV0FBVyxjQUFjLE9BQU87QUFBQSxJQUNsSDtBQUFBLEVBQ0Q7QUFBQSxFQXJEQSxJQUFJLFNBQWtCO0FBQ3JCLFdBQU8sQ0FBQyxDQUFDLEtBQUs7QUFBQSxFQUNmO0FBQUEsRUFxREEsTUFBTSxhQUE0QjtBQUNqQyxRQUFJLEtBQUssU0FBUztBQUNqQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFNBQVMsS0FBSyxXQUFXO0FBRS9CLFVBQU0sa0JBQWtCLE1BQU0sS0FBSyx1QkFBdUIsS0FBSztBQUFBLE1BQzlEO0FBQUEsTUFDQSxhQUFhO0FBQUEsTUFDYixXQUFXO0FBQUEsTUFDWCxhQUFhO0FBQUEsTUFDYixtQkFBbUI7QUFBQSxNQUNuQixnQkFBZ0I7QUFBQSxNQUNoQix3QkFBd0I7QUFBQSxNQUN4QixpQkFBaUIsS0FBSyxhQUFhLGNBQWMsRUFBRSxTQUFTLGdCQUFnQixHQUFHLFNBQVMsS0FBSztBQUFBLElBQzlGLENBQUM7QUFFRCxTQUFLLFVBQVU7QUFDZixTQUFLLG9CQUFvQixRQUFRO0FBRWpDLFVBQU0sWUFBWSxLQUFLLHdCQUF3QixhQUFhO0FBQzVELFVBQU0sY0FBYyxVQUFVLFFBQVEsU0FBUyxJQUFJLFVBQVUsUUFBUSxDQUFDLEVBQUUsT0FBTztBQUMvRSxvQkFBZ0IsT0FBTyxTQUFTLFFBQVEsY0FBYyx1QkFBa0IsV0FBVyxLQUFLO0FBRXhGLG9CQUFnQixVQUFVLE1BQU0sV0FBVztBQUMzQyxvQkFBZ0IsT0FBTyxTQUFTLEtBQUssTUFBTSxZQUFZLFVBQVUsS0FBSyxXQUFXO0FBR2pGLFVBQU0sUUFBUSxLQUFLLGFBQWEsY0FBYztBQUM5QyxVQUFNLFVBQVUsTUFBTSxTQUFTLGdCQUFnQixHQUFHLFNBQVMsS0FBSztBQUNoRSxVQUFNLFVBQVUsTUFBTSxTQUFTLGVBQWUsR0FBRyxTQUFTLEtBQUs7QUFDL0QsVUFBTSxVQUFVLE1BQU0sU0FBUyxXQUFXLEdBQUcsU0FBUyxLQUFLLE1BQU0sU0FBUyxrQkFBa0IsR0FBRyxTQUFTLEtBQUs7QUFDN0csVUFBTSxTQUFTLE1BQU0sU0FBUyxZQUFZLEdBQUcsU0FBUyxLQUFLO0FBRTNELG9CQUFnQixVQUFVLE1BQU0sWUFBWSw4QkFBOEIsT0FBTztBQUNqRixvQkFBZ0IsVUFBVSxNQUFNLGtCQUFrQjtBQUNsRCxvQkFBZ0IsVUFBVSxNQUFNLFNBQVMsYUFBYSxPQUFPO0FBQzdELG9CQUFnQixVQUFVLE1BQU0sWUFBWSxhQUFhLE1BQU07QUFDL0Qsb0JBQWdCLFVBQVUsTUFBTSxZQUFZO0FBQzVDLG9CQUFnQixPQUFPLFNBQVMsS0FBSyxNQUFNLFlBQVksb0JBQW9CLFNBQVMsV0FBVztBQUUvRixTQUFLLG1CQUFtQixNQUFNO0FBTTlCLFVBQU0sU0FBUyxJQUFJLGtCQUFrQixnQkFBZ0IsV0FBVztBQUFBLE1BQy9ELGdCQUFnQixXQUFXLGFBQWEsNkNBQTZDLEVBQUUsU0FBUyxJQUFJO0FBQUEsTUFDcEcsZ0JBQWdCLEtBQUsscUJBQXFCLFNBQWtCLHdCQUF3QixNQUFNO0FBQUEsTUFDMUYsU0FBUyxNQUFNO0FBR2QsYUFBSyxlQUFlLE1BQU0sdUJBQXVCLHFCQUFxQixNQUFNLGFBQWEsU0FBUyxjQUFjLElBQUk7QUFDcEgsYUFBSyx1QkFBdUIsUUFBUSxVQUFVO0FBQUEsTUFDL0M7QUFBQSxNQUNBLFlBQVksTUFBTSxLQUFLLHVCQUF1QixXQUFXLFVBQVU7QUFBQSxNQUNuRSxTQUFTLE1BQU07QUFDZCxZQUFJLENBQUMsS0FBSyx1QkFBdUIsWUFBWSxJQUFJLEtBQUssQ0FBQyxLQUFLLHVCQUF1QixhQUFhLElBQUksR0FBRztBQUN0RyxlQUFLLHVCQUF1QixRQUFRLFVBQVUsRUFBRSxLQUFLLE1BQU07QUFDMUQsZ0JBQUksS0FBSyx1QkFBdUIsWUFBWSxJQUFJLEdBQUc7QUFDbEQsbUJBQUssdUJBQXVCLFFBQVE7QUFBQSxZQUNyQztBQUFBLFVBQ0QsQ0FBQztBQUNEO0FBQUEsUUFDRDtBQUNBLGFBQUssdUJBQXVCLFFBQVE7QUFBQSxNQUNyQztBQUFBLE1BQ0EsT0FBTyxNQUFNLEtBQUssdUJBQXVCLE1BQU07QUFBQSxNQUMvQyxhQUFhLE1BQU0sS0FBSyxZQUFZO0FBQUEsTUFDcEMsY0FBYyxNQUFNLEtBQUssbUJBQW1CLGFBQWE7QUFBQSxNQUN6RCxhQUFhLENBQUMsYUFBYTtBQUMxQixhQUFLLGVBQWUsZUFBZSwrQkFBK0IsU0FBUyxTQUFTLENBQUM7QUFDckYsYUFBSyxZQUFZLE1BQU0sVUFBVTtBQUFBLE1BQ2xDO0FBQUEsTUFDQSxhQUFhLENBQUMsYUFBYTtBQUMxQixjQUFNLFFBQVEsS0FBSyxZQUFZLFdBQVcsUUFBUTtBQUNsRCxZQUFJLE9BQU87QUFDVixnQkFBTSxVQUFVLE1BQU0sWUFBWSxFQUFFLEdBQUcsRUFBRTtBQUN6QyxjQUFJLFNBQVM7QUFDWixpQkFBSyx1QkFBdUIsa0JBQWtCLFNBQVMsU0FBUyxDQUFDO0FBQ2pFLGlCQUFLLFlBQVksK0JBQStCLFFBQVE7QUFBQSxVQUN6RDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsTUFDQSxlQUFlLENBQUMsYUFBYTtBQUM1QixhQUFLLHVCQUF1QixrQkFBa0IsU0FBUyxTQUFTLENBQUM7QUFDakUsYUFBSyxZQUFZLCtCQUErQixRQUFRO0FBQUEsTUFDekQ7QUFBQSxNQUNBLHFCQUFxQixDQUFDLGFBQWE7QUFDbEMsYUFBSyx1QkFBdUIsaUJBQWlCLFFBQVE7QUFFckQsWUFBSSxVQUFVO0FBQ2IsZUFBSyxlQUFlLGVBQWUsK0JBQStCLFNBQVMsU0FBUyxDQUFDLEVBQUUsTUFBTSxNQUFNO0FBQUEsVUFBZSxDQUFDO0FBQUEsUUFDcEg7QUFBQSxNQUNEO0FBQUEsTUFDQSxvQkFBb0IsTUFBTTtBQUN6QixhQUFLLHVCQUF1QixtQkFBbUI7QUFBQSxNQUNoRDtBQUFBLE1BQ0EsaUJBQWlCLE1BQU07QUFDdEIsY0FBTSxRQUFRLEtBQUssdUJBQXVCLFdBQVcsSUFBSTtBQUN6RCxlQUFPLEtBQUssbUJBQW1CLGlCQUMxQixVQUFVLGNBQWMsS0FBSyxrQkFBa0IsZUFBZSxTQUMvRDtBQUFBLE1BQ0w7QUFBQSxNQUNBLFVBQVUsTUFBTSxLQUFLLGNBQWMsZUFBZTtBQUFBLE1BQ2xELGNBQWMsTUFBTSxPQUFPLEtBQUssYUFBYSxjQUFjLEVBQUUsSUFBSSxJQUFJLFNBQVM7QUFBQSxNQUM5RSxlQUFlLE1BQU0sdUJBQXVCLEtBQUssYUFBYSxjQUFjLENBQUM7QUFBQSxNQUM3RSxpQkFBaUIsTUFBTSxLQUFLLHFCQUFxQixnQkFBZ0I7QUFBQSxNQUNqRSxzQkFBc0IsTUFBTSxJQUFJLEtBQUssYUFBYSx1QkFBdUIsTUFBTSxNQUFTO0FBQUEsTUFDeEYsb0JBQW9CLE1BQU0sS0FBSyxlQUFlLGVBQWUsMENBQTBDLHdCQUF3QjtBQUFBLE1BQy9ILHNCQUFzQixDQUFDLE1BQWtCO0FBQ3hDLGNBQU0sU0FBUyxJQUFJLG1CQUFtQixVQUFVLEVBQUUsVUFBa0IsZ0JBQWdCLFNBQVMsR0FBRyxDQUFDO0FBQ2pHLGFBQUssbUJBQW1CLGdCQUFnQjtBQUFBLFVBQ3ZDLFdBQVcsTUFBTTtBQUFBLFVBQ2pCLFlBQVksTUFBTSwrQkFBK0IsS0FBSyxnQkFBZ0IsS0FBSyxzQkFBc0IsS0FBSyxtQkFBbUIsd0JBQXdCO0FBQUEsUUFDbEosQ0FBQztBQUFBLE1BQ0Y7QUFBQSxNQUNBLGdCQUFnQixDQUFDLFNBQVMsS0FBSyx1QkFBdUIsZUFBZSxJQUFJO0FBQUEsTUFDekUsb0JBQW9CLE1BQU07QUFDekIsY0FBTSxTQUFTLEtBQUsscUJBQXFCO0FBQUEsVUFDeEM7QUFBQSxVQUNBLENBQUMsYUFBYSxLQUFLLHVCQUF1QixpQkFBaUIsUUFBUTtBQUFBLFFBQ3BFO0FBQ0EsZUFBTyxLQUFLO0FBQUEsTUFDYjtBQUFBLElBQ0QsR0FBRztBQUFBLE1BQ0YsaUJBQWlCO0FBQUEsTUFDakIsZ0JBQWdCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQUtoQixXQUFXO0FBQUEsSUFDWixDQUFDO0FBQ0QsU0FBSyxtQkFBbUIsSUFBSSxNQUFNO0FBR2xDLFVBQU0sY0FBYyxNQUFNLEtBQUssa0JBQWtCLGlCQUFpQix3QkFBd0IsR0FBRyxTQUFTLEtBQUs7QUFDM0csV0FBTyxlQUFlLFlBQVksQ0FBQztBQUNuQyxTQUFLLG1CQUFtQixJQUFJLEtBQUssa0JBQWtCLHVCQUF1QixNQUFNO0FBQy9FLGFBQU8sZUFBZSxZQUFZLENBQUM7QUFBQSxJQUNwQyxDQUFDLENBQUM7QUFHRixTQUFLLG1CQUFtQixJQUFJLHVCQUF1QixRQUFRO0FBQUEsTUFDMUQsd0JBQXdCLEtBQUs7QUFBQSxNQUM3QixzQkFBc0IsS0FBSztBQUFBLE1BQzNCLDRCQUE0QixLQUFLO0FBQUEsTUFDakMsc0JBQXNCLEtBQUs7QUFBQSxNQUMzQixvQkFBb0IsS0FBSztBQUFBLE1BQ3pCLGFBQWEsS0FBSztBQUFBLE1BQ2xCLHNCQUFzQixLQUFLO0FBQUEsSUFDNUIsQ0FBQyxDQUFDO0FBR0YsU0FBSyxxQkFBcUIsTUFBTSxRQUFRLE1BQVM7QUFDakQsU0FBSyxtQkFBbUIsSUFBSSx5QkFBeUIsZ0JBQWdCLFFBQVEsTUFBTTtBQUNsRixXQUFLLHFCQUFxQixNQUFNLFFBQVEsTUFBUztBQUFBLElBQ2xELEdBQUcsR0FBSSxDQUFDO0FBSVIsVUFBTSxLQUFLLGdCQUFnQixRQUFRLEVBQUUsTUFBTTtBQUMxQyxXQUFLLHVCQUF1QixpQkFBaUIsTUFBUztBQUN0RCxXQUFLLHVCQUF1QixXQUFXO0FBQ3ZDLFdBQUssVUFBVTtBQUNmLFdBQUssbUJBQW1CLE1BQU07QUFDOUIsV0FBSyxvQkFBb0IsUUFBUTtBQUNqQyxXQUFLLGVBQWUsTUFBTSx1QkFBdUIsWUFBWSxPQUFPLGFBQWEsV0FBVyxjQUFjLE9BQU87QUFDakgsV0FBSyxpQkFBaUIsS0FBSyxLQUFLO0FBQUEsSUFDakMsQ0FBQztBQUVELFNBQUssZUFBZSxNQUFNLHVCQUF1QixZQUFZLE1BQU0sYUFBYSxXQUFXLGNBQWMsT0FBTztBQUNoSCxTQUFLLGlCQUFpQixLQUFLLElBQUk7QUFBQSxFQUNoQztBQUFBLEVBRUEsY0FBb0I7QUFDbkIsUUFBSSxDQUFDLEtBQUssU0FBUztBQUFFO0FBQUEsSUFBUTtBQUU3QixTQUFLLFdBQVcsS0FBSyxPQUFPO0FBSzVCLFNBQUssdUJBQXVCLGlCQUFpQixNQUFTO0FBQ3RELFNBQUssZUFBZSxNQUFNLHVCQUF1QixZQUFZLE9BQU8sYUFBYSxXQUFXLGNBQWMsT0FBTztBQUVqSCxTQUFLLFVBQVU7QUFDZixTQUFLLG1CQUFtQixNQUFNO0FBQzlCLFNBQUssb0JBQW9CLFFBQVE7QUFDakMsU0FBSyxpQkFBaUIsS0FBSyxLQUFLO0FBQUEsRUFDakM7QUFBQSxFQUVBLE1BQU0sZUFBOEI7QUFDbkMsUUFBSSxLQUFLLFFBQVE7QUFDaEIsV0FBSyxZQUFZO0FBQUEsSUFDbEIsT0FBTztBQUNOLFdBQUssa0JBQWtCLFlBQVksRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUNwRCxZQUFNLEtBQUssV0FBVztBQUFBLElBQ3ZCO0FBQUEsRUFDRDtBQUFBO0FBQUEsRUFJUSxjQUFjLGlCQUF5QztBQUU5RCxRQUFJLEtBQUssZ0JBQWdCO0FBQ3hCLG1CQUFhLEtBQUssY0FBYztBQUFBLElBQ2pDO0FBQ0EsU0FBSyxpQkFBaUIsV0FBVyxNQUFNO0FBQ3RDLFdBQUssaUJBQWlCO0FBQ3RCLFdBQUssZ0JBQWdCLGVBQWU7QUFBQSxJQUNyQyxHQUFHLEdBQUc7QUFBQSxFQUNQO0FBQUEsRUFFUSxnQkFBZ0IsaUJBQXlDO0FBRWhFLFVBQU0sT0FBTyxnQkFBZ0IsVUFBVSxjQUFjLEtBQUs7QUFDMUQsUUFBSSxDQUFDLE1BQU07QUFBRTtBQUFBLElBQVE7QUFDckIsU0FBSyxLQUFLO0FBQ1YsVUFBTSxZQUFZLEtBQUs7QUFDdkIsVUFBTSxhQUFhLEtBQUs7QUFDeEIsUUFBSSxhQUFhLEtBQUssY0FBYyxHQUFHO0FBQUU7QUFBQSxJQUFRO0FBQ2pELFVBQU0sZUFBZSxnQkFBZ0IsT0FBTztBQUM1QyxVQUFNLGdCQUFnQixnQkFBZ0IsT0FBTztBQUM3QyxRQUFJLGNBQWMsZ0JBQWdCLGVBQWUsZUFBZTtBQUMvRCxVQUFJO0FBRUgsY0FBTSxlQUFlLGdCQUFnQixPQUFPLE9BQU87QUFDbkQsY0FBTSxZQUFZLGVBQWUsZ0JBQWdCLE9BQU87QUFDeEQsY0FBTSxnQkFBZ0IsS0FBSyxJQUFJLFlBQVksS0FBSyxJQUFJLFdBQVcsa0NBQWtDLENBQUM7QUFHbEcsd0JBQWdCLE9BQU8sU0FBUyxXQUFXLGFBQWE7QUFBQSxNQUN6RCxRQUFRO0FBQUEsTUFBb0M7QUFBQSxJQUM3QztBQUFBLEVBQ0Q7QUFBQTtBQUFBLEVBSVEsaUJBQTZCO0FBRXBDLFVBQU0sSUFBSSxLQUFLLE1BQU0sV0FBVyxXQUFXLFdBQVcsYUFBYSxxQ0FBcUMsQ0FBQztBQUN6RyxVQUFNLElBQUksV0FBVyxVQUFVLFdBQVcsY0FBYyxxQ0FBcUM7QUFDN0YsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsTUFDQSxPQUFPO0FBQUEsTUFDUCxRQUFRO0FBQUEsSUFDVDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGFBQXlCO0FBR2hDLFdBQU8sS0FBSyxlQUFlO0FBQUEsRUFDNUI7QUFBQSxFQUVRLFdBQVcsU0FBaUM7QUFBQSxFQUVwRDtBQUNEO0FBM1VhLDJCQUFOO0FBQUEsRUFzQko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXhDVTtBQTZVYixrQkFBa0IsMkJBQTJCLDBCQUEwQixrQkFBa0IsT0FBTzsiLAogICJuYW1lcyI6IFtdCn0K
