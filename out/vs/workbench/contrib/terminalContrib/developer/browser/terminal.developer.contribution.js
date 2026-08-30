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
import { Delayer } from "../../../../../base/common/async.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { Event } from "../../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, combinedDisposable, dispose } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Categories } from "../../../../../platform/action/common/actionCommonCategories.js";
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import { ITerminalLogService, TerminalSettingId } from "../../../../../platform/terminal/common/terminal.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IStatusbarService, StatusbarAlignment } from "../../../../services/statusbar/browser/statusbar.js";
import { registerTerminalAction } from "../../../terminal/browser/terminalActions.js";
import { registerTerminalContribution } from "../../../terminal/browser/terminalExtensions.js";
import { TerminalContextKeys } from "../../../terminal/common/terminalContextKey.js";
import { TerminalDeveloperCommandId } from "../common/terminal.developer.js";
import "./media/developer.css";
registerTerminalAction({
  id: TerminalDeveloperCommandId.ShowTextureAtlas,
  title: localize2("workbench.action.terminal.showTextureAtlas", "Show Terminal Texture Atlas"),
  category: Categories.Developer,
  precondition: ContextKeyExpr.or(TerminalContextKeys.isOpen),
  run: async (c, accessor) => {
    const fileService = accessor.get(IFileService);
    const openerService = accessor.get(IOpenerService);
    const workspaceContextService = accessor.get(IWorkspaceContextService);
    const bitmap = await c.service.activeInstance?.xterm?.textureAtlas;
    if (!bitmap) {
      return;
    }
    const cwdUri = workspaceContextService.getWorkspace().folders[0].uri;
    const fileUri = URI.joinPath(cwdUri, "textureAtlas.png");
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("bitmaprenderer");
    if (!ctx) {
      return;
    }
    ctx.transferFromImageBitmap(bitmap);
    const blob = await new Promise((res) => canvas.toBlob(res));
    if (!blob) {
      return;
    }
    await fileService.writeFile(fileUri, VSBuffer.wrap(new Uint8Array(await blob.arrayBuffer())));
    openerService.open(fileUri);
  }
});
registerTerminalAction({
  id: TerminalDeveloperCommandId.WriteDataToTerminal,
  title: localize2("workbench.action.terminal.writeDataToTerminal", "Write Data to Terminal"),
  category: Categories.Developer,
  run: async (c, accessor) => {
    const quickInputService = accessor.get(IQuickInputService);
    const instance = await c.service.getActiveOrCreateInstance();
    await c.service.revealActiveTerminal();
    await instance.processReady;
    if (!instance.xterm) {
      throw new Error("Cannot write data to terminal if xterm isn't initialized");
    }
    const data = await quickInputService.input({
      value: "",
      placeHolder: "Enter data (supports \\n, \\r, \\xAB)",
      prompt: localize("workbench.action.terminal.writeDataToTerminal.prompt", "Enter data to write directly to the terminal, bypassing the pty")
    });
    if (!data) {
      return;
    }
    let escapedData = data.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
    while (true) {
      const match = escapedData.match(/\\x([0-9a-fA-F]{2})/);
      if (match === null || match.index === void 0 || match.length < 2) {
        break;
      }
      escapedData = escapedData.slice(0, match.index) + String.fromCharCode(parseInt(match[1], 16)) + escapedData.slice(match.index + 4);
    }
    const xterm = instance.xterm;
    xterm._writeText(escapedData);
  }
});
registerTerminalAction({
  id: TerminalDeveloperCommandId.RecordSession,
  title: localize2("workbench.action.terminal.recordSession", "Record Terminal Session"),
  category: Categories.Developer,
  run: async (c, accessor) => {
    const clipboardService = accessor.get(IClipboardService);
    const commandService = accessor.get(ICommandService);
    const statusbarService = accessor.get(IStatusbarService);
    const store = new DisposableStore();
    const text = localize("workbench.action.terminal.recordSession.recording", "Recording terminal session...");
    const statusbarEntry = {
      text,
      name: text,
      ariaLabel: text,
      showProgress: true
    };
    const statusbarHandle = statusbarService.addEntry(statusbarEntry, "recordSession", StatusbarAlignment.LEFT);
    store.add(statusbarHandle);
    const instance = await c.service.createTerminal();
    c.service.setActiveInstance(instance);
    await c.service.revealActiveTerminal();
    await Promise.all([
      instance.processReady,
      instance.focusWhenReady(true)
    ]);
    return new Promise((resolve) => {
      const events = [];
      const endRecording = () => {
        const session = JSON.stringify(events, null, 2);
        clipboardService.writeText(session);
        store.dispose();
        resolve();
      };
      const timer = store.add(new Delayer(5e3));
      store.add(Event.runAndSubscribe(instance.onDimensionsChanged, () => {
        events.push({
          type: "resize",
          cols: instance.cols,
          rows: instance.rows
        });
        timer.trigger(endRecording);
      }));
      store.add(commandService.onWillExecuteCommand((e) => {
        events.push({
          type: "command",
          id: e.commandId
        });
        timer.trigger(endRecording);
      }));
      store.add(instance.onWillData((data) => {
        events.push({
          type: "output",
          data
        });
        timer.trigger(endRecording);
      }));
      store.add(instance.onDidSendText((data) => {
        events.push({
          type: "sendText",
          data
        });
        timer.trigger(endRecording);
      }));
      store.add(instance.xterm.raw.onData((data) => {
        events.push({
          type: "input",
          data
        });
        timer.trigger(endRecording);
      }));
      let commandDetectedRegistered = false;
      store.add(Event.runAndSubscribe(instance.capabilities.onDidAddCapability, (e) => {
        if (commandDetectedRegistered) {
          return;
        }
        const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
        if (!commandDetection) {
          return;
        }
        store.add(commandDetection.promptInputModel.onDidChangeInput((e2) => {
          events.push({
            type: "promptInputChange",
            data: commandDetection.promptInputModel.getCombinedString()
          });
          timer.trigger(endRecording);
        }));
        commandDetectedRegistered = true;
      }));
    });
  }
});
registerTerminalAction({
  id: TerminalDeveloperCommandId.RestartPtyHost,
  title: localize2("workbench.action.terminal.restartPtyHost", "Restart Pty Host"),
  category: Categories.Developer,
  run: async (c, accessor) => {
    const logService = accessor.get(ITerminalLogService);
    const backends = Array.from(c.instanceService.getRegisteredBackends());
    const unresponsiveBackends = backends.filter((e) => !e.isResponsive);
    const restartCandidates = unresponsiveBackends.length > 0 ? unresponsiveBackends : backends;
    for (const backend of restartCandidates) {
      logService.warn(`Restarting pty host for authority "${backend.remoteAuthority}"`);
      backend.restartPtyHost();
    }
  }
});
var DevModeContributionState = /* @__PURE__ */ ((DevModeContributionState2) => {
  DevModeContributionState2[DevModeContributionState2["Off"] = 0] = "Off";
  DevModeContributionState2[DevModeContributionState2["WaitingForCapability"] = 1] = "WaitingForCapability";
  DevModeContributionState2[DevModeContributionState2["On"] = 2] = "On";
  return DevModeContributionState2;
})(DevModeContributionState || {});
let DevModeContribution = class extends Disposable {
  constructor(_ctx, _configurationService) {
    super();
    this._ctx = _ctx;
    this._configurationService = _configurationService;
    this._activeDevModeDisposables = this._register(new MutableDisposable());
    this._currentColor = 0;
    this._state = 0 /* Off */;
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TerminalSettingId.DevMode)) {
        this._updateDevMode();
      }
    }));
  }
  static get(instance) {
    return instance.getContribution(DevModeContribution.ID);
  }
  xtermReady(xterm) {
    this._xterm = xterm;
    this._updateDevMode();
  }
  _updateDevMode() {
    const devMode = this._isEnabled();
    this._xterm?.raw.element?.classList.toggle("dev-mode", devMode);
    const commandDetection = this._ctx.instance.capabilities.get(TerminalCapability.CommandDetection);
    if (devMode) {
      if (commandDetection) {
        if (this._state === 2 /* On */) {
          return;
        }
        this._state = 2 /* On */;
        const commandDecorations = new DisposableMap();
        const otherDisposables = new DisposableStore();
        this._activeDevModeDisposables.value = combinedDisposable(
          commandDecorations,
          otherDisposables,
          // Prompt input
          this._ctx.instance.onDidBlur(() => this._updateDevMode()),
          this._ctx.instance.onDidFocus(() => this._updateDevMode()),
          commandDetection.promptInputModel.onDidChangeInput(() => this._updateDevMode()),
          // Sequence markers
          commandDetection.onCommandFinished((command) => {
            const colorClass = `color-${this._currentColor}`;
            const decorations = [];
            commandDecorations.set(command, combinedDisposable(...decorations));
            if (command.promptStartMarker) {
              const d = this._ctx.instance.xterm.raw?.registerDecoration({
                marker: command.promptStartMarker
              });
              if (d) {
                decorations.push(d);
                otherDisposables.add(d.onRender((e) => {
                  e.textContent = "A";
                  e.classList.add("xterm-sequence-decoration", "top", "left", colorClass);
                }));
              }
            }
            if (command.marker) {
              const d = this._ctx.instance.xterm.raw?.registerDecoration({
                marker: command.marker,
                x: command.startX
              });
              if (d) {
                decorations.push(d);
                otherDisposables.add(d.onRender((e) => {
                  e.textContent = "B";
                  e.classList.add("xterm-sequence-decoration", "top", "right", colorClass);
                }));
              }
            }
            if (command.executedMarker) {
              const d = this._ctx.instance.xterm.raw?.registerDecoration({
                marker: command.executedMarker,
                x: command.executedX
              });
              if (d) {
                decorations.push(d);
                otherDisposables.add(d.onRender((e) => {
                  e.textContent = "C";
                  e.classList.add("xterm-sequence-decoration", "bottom", "left", colorClass);
                }));
              }
            }
            if (command.endMarker) {
              const d = this._ctx.instance.xterm.raw?.registerDecoration({
                marker: command.endMarker
              });
              if (d) {
                decorations.push(d);
                otherDisposables.add(d.onRender((e) => {
                  e.textContent = "D";
                  e.classList.add("xterm-sequence-decoration", "bottom", "right", colorClass);
                }));
              }
            }
            this._currentColor = (this._currentColor + 1) % 2;
          }),
          commandDetection.onCommandInvalidated((commands) => {
            for (const c of commands) {
              const decorations = commandDecorations.get(c);
              if (decorations) {
                dispose(decorations);
              }
              commandDecorations.deleteAndDispose(c);
            }
          })
        );
      } else {
        if (this._state === 1 /* WaitingForCapability */) {
          return;
        }
        this._state = 1 /* WaitingForCapability */;
        this._activeDevModeDisposables.value = this._ctx.instance.capabilities.onDidAddCommandDetectionCapability((e) => {
          this._updateDevMode();
        });
      }
    } else {
      if (this._state === 0 /* Off */) {
        return;
      }
      this._state = 0 /* Off */;
      this._activeDevModeDisposables.clear();
    }
  }
  _isEnabled() {
    return this._configurationService.getValue(TerminalSettingId.DevMode) || false;
  }
};
DevModeContribution.ID = "terminal.devMode";
DevModeContribution = __decorateClass([
  __decorateParam(1, IConfigurationService)
], DevModeContribution);
registerTerminalContribution(DevModeContribution.ID, DevModeContribution);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcZGV2ZWxvcGVyXFxicm93c2VyXFx0ZXJtaW5hbC5kZXZlbG9wZXIuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBUZXJtaW5hbCB9IGZyb20gJ0B4dGVybS94dGVybSc7XG5pbXBvcnQgeyBEZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgY29tYmluZWREaXNwb3NhYmxlLCBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ29tbWFuZCwgVGVybWluYWxDYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsTG9nU2VydmljZSwgVGVybWluYWxTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVN0YXR1c2JhclNlcnZpY2UsIFN0YXR1c2JhckFsaWdubWVudCwgdHlwZSBJU3RhdHVzYmFyRW50cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zdGF0dXNiYXIvYnJvd3Nlci9zdGF0dXNiYXIuanMnO1xuaW1wb3J0IHsgSUludGVybmFsWHRlcm1UZXJtaW5hbCwgSVRlcm1pbmFsQ29udHJpYnV0aW9uLCBJVGVybWluYWxJbnN0YW5jZSwgSVh0ZXJtVGVybWluYWwgfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyVGVybWluYWxBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlclRlcm1pbmFsQ29udHJpYnV0aW9uLCB0eXBlIElUZXJtaW5hbENvbnRyaWJ1dGlvbkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsQ29udGV4dEtleS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbERldmVsb3BlckNvbW1hbmRJZCB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbC5kZXZlbG9wZXIuanMnO1xuaW1wb3J0ICcuL21lZGlhL2RldmVsb3Blci5jc3MnO1xuXG5yZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0aWQ6IFRlcm1pbmFsRGV2ZWxvcGVyQ29tbWFuZElkLlNob3dUZXh0dXJlQXRsYXMsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2hvd1RleHR1cmVBdGxhcycsICdTaG93IFRlcm1pbmFsIFRleHR1cmUgQXRsYXMnKSxcblx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKFRlcm1pbmFsQ29udGV4dEtleXMuaXNPcGVuKSxcblx0cnVuOiBhc3luYyAoYywgYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IG9wZW5lclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU9wZW5lclNlcnZpY2UpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cdFx0Y29uc3QgYml0bWFwID0gYXdhaXQgYy5zZXJ2aWNlLmFjdGl2ZUluc3RhbmNlPy54dGVybT8udGV4dHVyZUF0bGFzO1xuXHRcdGlmICghYml0bWFwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGN3ZFVyaSA9IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnNbMF0udXJpO1xuXHRcdGNvbnN0IGZpbGVVcmkgPSBVUkkuam9pblBhdGgoY3dkVXJpLCAndGV4dHVyZUF0bGFzLnBuZycpO1xuXHRcdGNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xuXHRcdGNhbnZhcy53aWR0aCA9IGJpdG1hcC53aWR0aDtcblx0XHRjYW52YXMuaGVpZ2h0ID0gYml0bWFwLmhlaWdodDtcblx0XHRjb25zdCBjdHggPSBjYW52YXMuZ2V0Q29udGV4dCgnYml0bWFwcmVuZGVyZXInKTtcblx0XHRpZiAoIWN0eCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjdHgudHJhbnNmZXJGcm9tSW1hZ2VCaXRtYXAoYml0bWFwKTtcblx0XHRjb25zdCBibG9iID0gYXdhaXQgbmV3IFByb21pc2U8QmxvYiB8IG51bGw+KChyZXMpID0+IGNhbnZhcy50b0Jsb2IocmVzKSk7XG5cdFx0aWYgKCFibG9iKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShmaWxlVXJpLCBWU0J1ZmZlci53cmFwKG5ldyBVaW50OEFycmF5KGF3YWl0IGJsb2IuYXJyYXlCdWZmZXIoKSkpKTtcblx0XHRvcGVuZXJTZXJ2aWNlLm9wZW4oZmlsZVVyaSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0aWQ6IFRlcm1pbmFsRGV2ZWxvcGVyQ29tbWFuZElkLldyaXRlRGF0YVRvVGVybWluYWwsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwud3JpdGVEYXRhVG9UZXJtaW5hbCcsICdXcml0ZSBEYXRhIHRvIFRlcm1pbmFsJyksXG5cdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0cnVuOiBhc3luYyAoYywgYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGluc3RhbmNlID0gYXdhaXQgYy5zZXJ2aWNlLmdldEFjdGl2ZU9yQ3JlYXRlSW5zdGFuY2UoKTtcblx0XHRhd2FpdCBjLnNlcnZpY2UucmV2ZWFsQWN0aXZlVGVybWluYWwoKTtcblx0XHRhd2FpdCBpbnN0YW5jZS5wcm9jZXNzUmVhZHk7XG5cdFx0aWYgKCFpbnN0YW5jZS54dGVybSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3Qgd3JpdGUgZGF0YSB0byB0ZXJtaW5hbCBpZiB4dGVybSBpc25cXCd0IGluaXRpYWxpemVkJyk7XG5cdFx0fVxuXHRcdGNvbnN0IGRhdGEgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5pbnB1dCh7XG5cdFx0XHR2YWx1ZTogJycsXG5cdFx0XHRwbGFjZUhvbGRlcjogJ0VudGVyIGRhdGEgKHN1cHBvcnRzIFxcXFxuLCBcXFxcciwgXFxcXHhBQiknLFxuXHRcdFx0cHJvbXB0OiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC53cml0ZURhdGFUb1Rlcm1pbmFsLnByb21wdCcsIFwiRW50ZXIgZGF0YSB0byB3cml0ZSBkaXJlY3RseSB0byB0aGUgdGVybWluYWwsIGJ5cGFzc2luZyB0aGUgcHR5XCIpLFxuXHRcdH0pO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgZXNjYXBlZERhdGEgPSBkYXRhXG5cdFx0XHQucmVwbGFjZSgvXFxcXG4vZywgJ1xcbicpXG5cdFx0XHQucmVwbGFjZSgvXFxcXHIvZywgJ1xccicpO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRjb25zdCBtYXRjaCA9IGVzY2FwZWREYXRhLm1hdGNoKC9cXFxceChbMC05YS1mQS1GXXsyfSkvKTtcblx0XHRcdGlmIChtYXRjaCA9PT0gbnVsbCB8fCBtYXRjaC5pbmRleCA9PT0gdW5kZWZpbmVkIHx8IG1hdGNoLmxlbmd0aCA8IDIpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRlc2NhcGVkRGF0YSA9IGVzY2FwZWREYXRhLnNsaWNlKDAsIG1hdGNoLmluZGV4KSArIFN0cmluZy5mcm9tQ2hhckNvZGUocGFyc2VJbnQobWF0Y2hbMV0sIDE2KSkgKyBlc2NhcGVkRGF0YS5zbGljZShtYXRjaC5pbmRleCArIDQpO1xuXHRcdH1cblx0XHRjb25zdCB4dGVybSA9IGluc3RhbmNlLnh0ZXJtIGFzIElJbnRlcm5hbFh0ZXJtVGVybWluYWw7XG5cdFx0eHRlcm0uX3dyaXRlVGV4dChlc2NhcGVkRGF0YSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0aWQ6IFRlcm1pbmFsRGV2ZWxvcGVyQ29tbWFuZElkLlJlY29yZFNlc3Npb24sXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucmVjb3JkU2Vzc2lvbicsICdSZWNvcmQgVGVybWluYWwgU2Vzc2lvbicpLFxuXHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdHJ1bjogYXN5bmMgKGMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRjb25zdCBzdGF0dXNiYXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTdGF0dXNiYXJTZXJ2aWNlKTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdC8vIFNldCB1cCBzdGF0dXMgYmFyIGVudHJ5XG5cdFx0Y29uc3QgdGV4dCA9IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnJlY29yZFNlc3Npb24ucmVjb3JkaW5nJywgXCJSZWNvcmRpbmcgdGVybWluYWwgc2Vzc2lvbi4uLlwiKTtcblx0XHRjb25zdCBzdGF0dXNiYXJFbnRyeTogSVN0YXR1c2JhckVudHJ5ID0ge1xuXHRcdFx0dGV4dCxcblx0XHRcdG5hbWU6IHRleHQsXG5cdFx0XHRhcmlhTGFiZWw6IHRleHQsXG5cdFx0XHRzaG93UHJvZ3Jlc3M6IHRydWVcblx0XHR9O1xuXHRcdGNvbnN0IHN0YXR1c2JhckhhbmRsZSA9IHN0YXR1c2JhclNlcnZpY2UuYWRkRW50cnkoc3RhdHVzYmFyRW50cnksICdyZWNvcmRTZXNzaW9uJywgU3RhdHVzYmFyQWxpZ25tZW50LkxFRlQpO1xuXHRcdHN0b3JlLmFkZChzdGF0dXNiYXJIYW5kbGUpO1xuXG5cdFx0Ly8gQ3JlYXRlLCByZXZlYWwgYW5kIGZvY3VzIGluc3RhbmNlXG5cdFx0Y29uc3QgaW5zdGFuY2UgPSBhd2FpdCBjLnNlcnZpY2UuY3JlYXRlVGVybWluYWwoKTtcblx0XHRjLnNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdGF3YWl0IGMuc2VydmljZS5yZXZlYWxBY3RpdmVUZXJtaW5hbCgpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGluc3RhbmNlLnByb2Nlc3NSZWFkeSxcblx0XHRcdGluc3RhbmNlLmZvY3VzV2hlblJlYWR5KHRydWUpXG5cdFx0XSk7XG5cblx0XHQvLyBSZWNvcmQgc2Vzc2lvblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50czogdW5rbm93bltdID0gW107XG5cdFx0XHRjb25zdCBlbmRSZWNvcmRpbmcgPSAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBKU09OLnN0cmluZ2lmeShldmVudHMsIG51bGwsIDIpO1xuXHRcdFx0XHRjbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChzZXNzaW9uKTtcblx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9O1xuXG5cblx0XHRcdGNvbnN0IHRpbWVyID0gc3RvcmUuYWRkKG5ldyBEZWxheWVyKDUwMDApKTtcblx0XHRcdHN0b3JlLmFkZChFdmVudC5ydW5BbmRTdWJzY3JpYmUoaW5zdGFuY2Uub25EaW1lbnNpb25zQ2hhbmdlZCwgKCkgPT4ge1xuXHRcdFx0XHRldmVudHMucHVzaCh7XG5cdFx0XHRcdFx0dHlwZTogJ3Jlc2l6ZScsXG5cdFx0XHRcdFx0Y29sczogaW5zdGFuY2UuY29scyxcblx0XHRcdFx0XHRyb3dzOiBpbnN0YW5jZS5yb3dzXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aW1lci50cmlnZ2VyKGVuZFJlY29yZGluZyk7XG5cdFx0XHR9KSk7XG5cdFx0XHRzdG9yZS5hZGQoY29tbWFuZFNlcnZpY2Uub25XaWxsRXhlY3V0ZUNvbW1hbmQoZSA9PiB7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0aWQ6IGUuY29tbWFuZElkLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGltZXIudHJpZ2dlcihlbmRSZWNvcmRpbmcpO1xuXHRcdFx0fSkpO1xuXHRcdFx0c3RvcmUuYWRkKGluc3RhbmNlLm9uV2lsbERhdGEoZGF0YSA9PiB7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKHtcblx0XHRcdFx0XHR0eXBlOiAnb3V0cHV0Jyxcblx0XHRcdFx0XHRkYXRhLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGltZXIudHJpZ2dlcihlbmRSZWNvcmRpbmcpO1xuXHRcdFx0fSkpO1xuXHRcdFx0c3RvcmUuYWRkKGluc3RhbmNlLm9uRGlkU2VuZFRleHQoZGF0YSA9PiB7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKHtcblx0XHRcdFx0XHR0eXBlOiAnc2VuZFRleHQnLFxuXHRcdFx0XHRcdGRhdGEsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aW1lci50cmlnZ2VyKGVuZFJlY29yZGluZyk7XG5cdFx0XHR9KSk7XG5cdFx0XHRzdG9yZS5hZGQoaW5zdGFuY2UueHRlcm0hLnJhdy5vbkRhdGEoZGF0YSA9PiB7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKHtcblx0XHRcdFx0XHR0eXBlOiAnaW5wdXQnLFxuXHRcdFx0XHRcdGRhdGEsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aW1lci50cmlnZ2VyKGVuZFJlY29yZGluZyk7XG5cdFx0XHR9KSk7XG5cdFx0XHRsZXQgY29tbWFuZERldGVjdGVkUmVnaXN0ZXJlZCA9IGZhbHNlO1xuXHRcdFx0c3RvcmUuYWRkKEV2ZW50LnJ1bkFuZFN1YnNjcmliZShpbnN0YW5jZS5jYXBhYmlsaXRpZXMub25EaWRBZGRDYXBhYmlsaXR5LCBlID0+IHtcblx0XHRcdFx0aWYgKGNvbW1hbmREZXRlY3RlZFJlZ2lzdGVyZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY29tbWFuZERldGVjdGlvbiA9IGluc3RhbmNlLmNhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pO1xuXHRcdFx0XHRpZiAoIWNvbW1hbmREZXRlY3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0c3RvcmUuYWRkKGNvbW1hbmREZXRlY3Rpb24ucHJvbXB0SW5wdXRNb2RlbC5vbkRpZENoYW5nZUlucHV0KGUgPT4ge1xuXHRcdFx0XHRcdGV2ZW50cy5wdXNoKHtcblx0XHRcdFx0XHRcdHR5cGU6ICdwcm9tcHRJbnB1dENoYW5nZScsXG5cdFx0XHRcdFx0XHRkYXRhOiBjb21tYW5kRGV0ZWN0aW9uLnByb21wdElucHV0TW9kZWwuZ2V0Q29tYmluZWRTdHJpbmcoKSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR0aW1lci50cmlnZ2VyKGVuZFJlY29yZGluZyk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0Y29tbWFuZERldGVjdGVkUmVnaXN0ZXJlZCA9IHRydWU7XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cblx0fVxufSk7XG5cbnJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRpZDogVGVybWluYWxEZXZlbG9wZXJDb21tYW5kSWQuUmVzdGFydFB0eUhvc3QsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucmVzdGFydFB0eUhvc3QnLCAnUmVzdGFydCBQdHkgSG9zdCcpLFxuXHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdHJ1bjogYXN5bmMgKGMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVybWluYWxMb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBiYWNrZW5kcyA9IEFycmF5LmZyb20oYy5pbnN0YW5jZVNlcnZpY2UuZ2V0UmVnaXN0ZXJlZEJhY2tlbmRzKCkpO1xuXHRcdGNvbnN0IHVucmVzcG9uc2l2ZUJhY2tlbmRzID0gYmFja2VuZHMuZmlsdGVyKGUgPT4gIWUuaXNSZXNwb25zaXZlKTtcblx0XHQvLyBSZXN0YXJ0IG9ubHkgdW5yZXNwb25zaXZlIGJhY2tlbmRzIGlmIHRoZXJlIGFyZSBhbnlcblx0XHRjb25zdCByZXN0YXJ0Q2FuZGlkYXRlcyA9IHVucmVzcG9uc2l2ZUJhY2tlbmRzLmxlbmd0aCA+IDAgPyB1bnJlc3BvbnNpdmVCYWNrZW5kcyA6IGJhY2tlbmRzO1xuXHRcdGZvciAoY29uc3QgYmFja2VuZCBvZiByZXN0YXJ0Q2FuZGlkYXRlcykge1xuXHRcdFx0bG9nU2VydmljZS53YXJuKGBSZXN0YXJ0aW5nIHB0eSBob3N0IGZvciBhdXRob3JpdHkgXCIke2JhY2tlbmQucmVtb3RlQXV0aG9yaXR5fVwiYCk7XG5cdFx0XHRiYWNrZW5kLnJlc3RhcnRQdHlIb3N0KCk7XG5cdFx0fVxuXHR9XG59KTtcblxuY29uc3QgZW51bSBEZXZNb2RlQ29udHJpYnV0aW9uU3RhdGUge1xuXHRPZmYsXG5cdFdhaXRpbmdGb3JDYXBhYmlsaXR5LFxuXHRPbixcbn1cblxuY2xhc3MgRGV2TW9kZUNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGVybWluYWxDb250cmlidXRpb24ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAndGVybWluYWwuZGV2TW9kZSc7XG5cdHN0YXRpYyBnZXQoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogRGV2TW9kZUNvbnRyaWJ1dGlvbiB8IG51bGwge1xuXHRcdHJldHVybiBpbnN0YW5jZS5nZXRDb250cmlidXRpb248RGV2TW9kZUNvbnRyaWJ1dGlvbj4oRGV2TW9kZUNvbnRyaWJ1dGlvbi5JRCk7XG5cdH1cblxuXHRwcml2YXRlIF94dGVybTogSVh0ZXJtVGVybWluYWwgJiB7IHJhdzogVGVybWluYWwgfSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlRGV2TW9kZURpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIF9jdXJyZW50Q29sb3IgPSAwO1xuXG5cdHByaXZhdGUgX3N0YXRlOiBEZXZNb2RlQ29udHJpYnV0aW9uU3RhdGUgPSBEZXZNb2RlQ29udHJpYnV0aW9uU3RhdGUuT2ZmO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2N0eDogSVRlcm1pbmFsQ29udHJpYnV0aW9uQ29udGV4dCxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxTZXR0aW5nSWQuRGV2TW9kZSkpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlRGV2TW9kZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHh0ZXJtUmVhZHkoeHRlcm06IElYdGVybVRlcm1pbmFsICYgeyByYXc6IFRlcm1pbmFsIH0pOiB2b2lkIHtcblx0XHR0aGlzLl94dGVybSA9IHh0ZXJtO1xuXHRcdHRoaXMuX3VwZGF0ZURldk1vZGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZURldk1vZGUoKSB7XG5cdFx0Y29uc3QgZGV2TW9kZTogYm9vbGVhbiA9IHRoaXMuX2lzRW5hYmxlZCgpO1xuXHRcdHRoaXMuX3h0ZXJtPy5yYXcuZWxlbWVudD8uY2xhc3NMaXN0LnRvZ2dsZSgnZGV2LW1vZGUnLCBkZXZNb2RlKTtcblxuXHRcdGNvbnN0IGNvbW1hbmREZXRlY3Rpb24gPSB0aGlzLl9jdHguaW5zdGFuY2UuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik7XG5cdFx0aWYgKGRldk1vZGUpIHtcblx0XHRcdGlmIChjb21tYW5kRGV0ZWN0aW9uKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gRGV2TW9kZUNvbnRyaWJ1dGlvblN0YXRlLk9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3N0YXRlID0gRGV2TW9kZUNvbnRyaWJ1dGlvblN0YXRlLk9uO1xuXHRcdFx0XHRjb25zdCBjb21tYW5kRGVjb3JhdGlvbnMgPSBuZXcgRGlzcG9zYWJsZU1hcDxJVGVybWluYWxDb21tYW5kLCBJRGlzcG9zYWJsZT4oKTtcblx0XHRcdFx0Y29uc3Qgb3RoZXJEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0dGhpcy5fYWN0aXZlRGV2TW9kZURpc3Bvc2FibGVzLnZhbHVlID0gY29tYmluZWREaXNwb3NhYmxlKFxuXHRcdFx0XHRcdGNvbW1hbmREZWNvcmF0aW9ucyxcblx0XHRcdFx0XHRvdGhlckRpc3Bvc2FibGVzLFxuXHRcdFx0XHRcdC8vIFByb21wdCBpbnB1dFxuXHRcdFx0XHRcdHRoaXMuX2N0eC5pbnN0YW5jZS5vbkRpZEJsdXIoKCkgPT4gdGhpcy5fdXBkYXRlRGV2TW9kZSgpKSxcblx0XHRcdFx0XHR0aGlzLl9jdHguaW5zdGFuY2Uub25EaWRGb2N1cygoKSA9PiB0aGlzLl91cGRhdGVEZXZNb2RlKCkpLFxuXHRcdFx0XHRcdGNvbW1hbmREZXRlY3Rpb24ucHJvbXB0SW5wdXRNb2RlbC5vbkRpZENoYW5nZUlucHV0KCgpID0+IHRoaXMuX3VwZGF0ZURldk1vZGUoKSksXG5cdFx0XHRcdFx0Ly8gU2VxdWVuY2UgbWFya2Vyc1xuXHRcdFx0XHRcdGNvbW1hbmREZXRlY3Rpb24ub25Db21tYW5kRmluaXNoZWQoY29tbWFuZCA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBjb2xvckNsYXNzID0gYGNvbG9yLSR7dGhpcy5fY3VycmVudENvbG9yfWA7XG5cdFx0XHRcdFx0XHRjb25zdCBkZWNvcmF0aW9uczogSURpc3Bvc2FibGVbXSA9IFtdO1xuXHRcdFx0XHRcdFx0Y29tbWFuZERlY29yYXRpb25zLnNldChjb21tYW5kLCBjb21iaW5lZERpc3Bvc2FibGUoLi4uZGVjb3JhdGlvbnMpKTtcblx0XHRcdFx0XHRcdGlmIChjb21tYW5kLnByb21wdFN0YXJ0TWFya2VyKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGQgPSB0aGlzLl9jdHguaW5zdGFuY2UueHRlcm0hLnJhdz8ucmVnaXN0ZXJEZWNvcmF0aW9uKHtcblx0XHRcdFx0XHRcdFx0XHRtYXJrZXI6IGNvbW1hbmQucHJvbXB0U3RhcnRNYXJrZXJcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdGlmIChkKSB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVjb3JhdGlvbnMucHVzaChkKTtcblx0XHRcdFx0XHRcdFx0XHRvdGhlckRpc3Bvc2FibGVzLmFkZChkLm9uUmVuZGVyKGUgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZS50ZXh0Q29udGVudCA9ICdBJztcblx0XHRcdFx0XHRcdFx0XHRcdGUuY2xhc3NMaXN0LmFkZCgneHRlcm0tc2VxdWVuY2UtZGVjb3JhdGlvbicsICd0b3AnLCAnbGVmdCcsIGNvbG9yQ2xhc3MpO1xuXHRcdFx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGNvbW1hbmQubWFya2VyKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGQgPSB0aGlzLl9jdHguaW5zdGFuY2UueHRlcm0hLnJhdz8ucmVnaXN0ZXJEZWNvcmF0aW9uKHtcblx0XHRcdFx0XHRcdFx0XHRtYXJrZXI6IGNvbW1hbmQubWFya2VyLFxuXHRcdFx0XHRcdFx0XHRcdHg6IGNvbW1hbmQuc3RhcnRYXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRpZiAoZCkge1xuXHRcdFx0XHRcdFx0XHRcdGRlY29yYXRpb25zLnB1c2goZCk7XG5cdFx0XHRcdFx0XHRcdFx0b3RoZXJEaXNwb3NhYmxlcy5hZGQoZC5vblJlbmRlcihlID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdGUudGV4dENvbnRlbnQgPSAnQic7XG5cdFx0XHRcdFx0XHRcdFx0XHRlLmNsYXNzTGlzdC5hZGQoJ3h0ZXJtLXNlcXVlbmNlLWRlY29yYXRpb24nLCAndG9wJywgJ3JpZ2h0JywgY29sb3JDbGFzcyk7XG5cdFx0XHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoY29tbWFuZC5leGVjdXRlZE1hcmtlcikge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBkID0gdGhpcy5fY3R4Lmluc3RhbmNlLnh0ZXJtIS5yYXc/LnJlZ2lzdGVyRGVjb3JhdGlvbih7XG5cdFx0XHRcdFx0XHRcdFx0bWFya2VyOiBjb21tYW5kLmV4ZWN1dGVkTWFya2VyLFxuXHRcdFx0XHRcdFx0XHRcdHg6IGNvbW1hbmQuZXhlY3V0ZWRYXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRpZiAoZCkge1xuXHRcdFx0XHRcdFx0XHRcdGRlY29yYXRpb25zLnB1c2goZCk7XG5cdFx0XHRcdFx0XHRcdFx0b3RoZXJEaXNwb3NhYmxlcy5hZGQoZC5vblJlbmRlcihlID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdGUudGV4dENvbnRlbnQgPSAnQyc7XG5cdFx0XHRcdFx0XHRcdFx0XHRlLmNsYXNzTGlzdC5hZGQoJ3h0ZXJtLXNlcXVlbmNlLWRlY29yYXRpb24nLCAnYm90dG9tJywgJ2xlZnQnLCBjb2xvckNsYXNzKTtcblx0XHRcdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChjb21tYW5kLmVuZE1hcmtlcikge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBkID0gdGhpcy5fY3R4Lmluc3RhbmNlLnh0ZXJtIS5yYXc/LnJlZ2lzdGVyRGVjb3JhdGlvbih7XG5cdFx0XHRcdFx0XHRcdFx0bWFya2VyOiBjb21tYW5kLmVuZE1hcmtlclxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0aWYgKGQpIHtcblx0XHRcdFx0XHRcdFx0XHRkZWNvcmF0aW9ucy5wdXNoKGQpO1xuXHRcdFx0XHRcdFx0XHRcdG90aGVyRGlzcG9zYWJsZXMuYWRkKGQub25SZW5kZXIoZSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRlLnRleHRDb250ZW50ID0gJ0QnO1xuXHRcdFx0XHRcdFx0XHRcdFx0ZS5jbGFzc0xpc3QuYWRkKCd4dGVybS1zZXF1ZW5jZS1kZWNvcmF0aW9uJywgJ2JvdHRvbScsICdyaWdodCcsIGNvbG9yQ2xhc3MpO1xuXHRcdFx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0dGhpcy5fY3VycmVudENvbG9yID0gKHRoaXMuX2N1cnJlbnRDb2xvciArIDEpICUgMjtcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRjb21tYW5kRGV0ZWN0aW9uLm9uQ29tbWFuZEludmFsaWRhdGVkKGNvbW1hbmRzID0+IHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgYyBvZiBjb21tYW5kcykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBkZWNvcmF0aW9ucyA9IGNvbW1hbmREZWNvcmF0aW9ucy5nZXQoYyk7XG5cdFx0XHRcdFx0XHRcdGlmIChkZWNvcmF0aW9ucykge1xuXHRcdFx0XHRcdFx0XHRcdGRpc3Bvc2UoZGVjb3JhdGlvbnMpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGNvbW1hbmREZWNvcmF0aW9ucy5kZWxldGVBbmREaXNwb3NlKGMpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAodGhpcy5fc3RhdGUgPT09IERldk1vZGVDb250cmlidXRpb25TdGF0ZS5XYWl0aW5nRm9yQ2FwYWJpbGl0eSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9zdGF0ZSA9IERldk1vZGVDb250cmlidXRpb25TdGF0ZS5XYWl0aW5nRm9yQ2FwYWJpbGl0eTtcblx0XHRcdFx0dGhpcy5fYWN0aXZlRGV2TW9kZURpc3Bvc2FibGVzLnZhbHVlID0gdGhpcy5fY3R4Lmluc3RhbmNlLmNhcGFiaWxpdGllcy5vbkRpZEFkZENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5KGUgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZURldk1vZGUoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gRGV2TW9kZUNvbnRyaWJ1dGlvblN0YXRlLk9mZikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zdGF0ZSA9IERldk1vZGVDb250cmlidXRpb25TdGF0ZS5PZmY7XG5cdFx0XHR0aGlzLl9hY3RpdmVEZXZNb2RlRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pc0VuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsU2V0dGluZ0lkLkRldk1vZGUpIHx8IGZhbHNlO1xuXHR9XG59XG5cbnJlZ2lzdGVyVGVybWluYWxDb250cmlidXRpb24oRGV2TW9kZUNvbnRyaWJ1dGlvbi5JRCwgRGV2TW9kZUNvbnRyaWJ1dGlvbik7XG4iXSwKICAibWFwcGluZ3Mi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QUFHLFFBQVE7QUFBQSxjQUNaLENBQUM7QUFDRCxrQkFBSSxHQUFHO0FBQ04sNEJBQVksS0FBSyxDQUFDO0FBQ2xCLGlDQUFpQixJQUFJLEVBQUUsU0FBUyxPQUFLO0FBQ3BDLG9CQUFFLGNBQWM7QUFDaEIsb0JBQUUsVUFBVSxJQUFJLDZCQUE2QixVQUFVLFFBQVEsVUFBVTtBQUFBLGdCQUMxRSxDQUFDLENBQUM7QUFBQSxjQUNIO0FBQUEsWUFDRDtBQUNBLGdCQUFJLFFBQVEsV0FBVztBQUN0QixvQkFBTSxJQUFJLEtBQUssS0FBSyxTQUFTLE1BQU8sS0FBSyxtQkFBbUI7QUFBQSxnQkFDM0QsUUFBUSxRQUFRO0FBQUEsY0FDakIsQ0FBQztBQUNELGtCQUFJLEdBQUc7QUFDTiw0QkFBWSxLQUFLLENBQUM7QUFDbEIsaUNBQWlCLElBQUksRUFBRSxTQUFTLE9BQUs7QUFDcEMsb0JBQUUsY0FBYztBQUNoQixvQkFBRSxVQUFVLElBQUksNkJBQTZCLFVBQVUsU0FBUyxVQUFVO0FBQUEsZ0JBQzNFLENBQUMsQ0FBQztBQUFBLGNBQ0g7QUFBQSxZQUNEO0FBQ0EsaUJBQUssaUJBQWlCLEtBQUssZ0JBQWdCLEtBQUs7QUFBQSxVQUNqRCxDQUFDO0FBQUEsVUFDRCxpQkFBaUIscUJBQXFCLGNBQVk7QUFDakQsdUJBQVcsS0FBSyxVQUFVO0FBQ3pCLG9CQUFNLGNBQWMsbUJBQW1CLElBQUksQ0FBQztBQUM1QyxrQkFBSSxhQUFhO0FBQ2hCLHdCQUFRLFdBQVc7QUFBQSxjQUNwQjtBQUNBLGlDQUFtQixpQkFBaUIsQ0FBQztBQUFBLFlBQ3RDO0FBQUEsVUFDRCxDQUFDO0FBQUEsUUFDRjtBQUFBLE1BQ0QsT0FBTztBQUNOLFlBQUksS0FBSyxXQUFXLDhCQUErQztBQUNsRTtBQUFBLFFBQ0Q7QUFDQSxhQUFLLFNBQVM7QUFDZCxhQUFLLDBCQUEwQixRQUFRLEtBQUssS0FBSyxTQUFTLGFBQWEsbUNBQW1DLE9BQUs7QUFDOUcsZUFBSyxlQUFlO0FBQUEsUUFDckIsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNELE9BQU87QUFDTixVQUFJLEtBQUssV0FBVyxhQUE4QjtBQUNqRDtBQUFBLE1BQ0Q7QUFDQSxXQUFLLFNBQVM7QUFDZCxXQUFLLDBCQUEwQixNQUFNO0FBQUEsSUFDdEM7QUFBQSxFQUNEO0FBQUEsRUFFUSxhQUFzQjtBQUM3QixXQUFPLEtBQUssc0JBQXNCLFNBQVMsa0JBQWtCLE9BQU8sS0FBSztBQUFBLEVBQzFFO0FBQ0Q7QUF6SU0sb0JBQ1csS0FBSztBQURoQixzQkFBTjtBQUFBLEVBY0c7QUFBQSxHQWRHO0FBMklOLDZCQUE2QixvQkFBb0IsSUFBSSxtQkFBbUI7IiwKICAibmFtZXMiOiBbImUiLCAiRGV2TW9kZUNvbnRyaWJ1dGlvblN0YXRlIl0KfQo=
