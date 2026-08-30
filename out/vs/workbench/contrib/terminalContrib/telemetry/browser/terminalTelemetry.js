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
import { getWindowById } from "../../../../../base/browser/dom.js";
import { isAuxiliaryWindow } from "../../../../../base/browser/window.js";
import { timeout } from "../../../../../base/common/async.js";
import { Event } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { basename } from "../../../../../base/common/path.js";
import { isString } from "../../../../../base/common/types.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { TelemetryTrustedValue } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import { TerminalLocation } from "../../../../../platform/terminal/common/terminal.js";
import { ILifecycleService } from "../../../../services/lifecycle/common/lifecycle.js";
import { ITerminalEditorService, ITerminalService } from "../../../terminal/browser/terminal.js";
let TerminalTelemetryContribution = class extends Disposable {
  constructor(lifecycleService, terminalService, terminalEditorService, _telemetryService) {
    super();
    this._telemetryService = _telemetryService;
    this._register(terminalService.onDidCreateInstance(async (instance) => {
      const store = new DisposableStore();
      this._store.add(store);
      await Promise.race([
        // Wait for process ready so the shell launch config is fully resolved, then
        // allow another 10 seconds for the shell integration to be fully initialized
        instance.processReady.then(() => {
          return timeout(1e4);
        }),
        // If the terminal is disposed, it's ready to report on immediately
        Event.toPromise(instance.onDisposed, store),
        // If the app is shutting down, flush
        Event.toPromise(lifecycleService.onWillShutdown, store)
      ]);
      let isInAuxWindow = false;
      try {
        const input = terminalEditorService.getInputFromResource(instance.resource);
        const windowId = input.group?.windowId;
        isInAuxWindow = !!(windowId && isAuxiliaryWindow(getWindowById(windowId, true).window));
      } catch {
      }
      this._logCreateInstance(instance, isInAuxWindow);
      this._store.delete(store);
    }));
    this._register(terminalService.onAnyInstanceShellTypeChanged((instance) => {
      this._logShellTypeChanged(instance);
    }));
  }
  _logCreateInstance(instance, isInAuxWindow) {
    const slc = instance.shellLaunchConfig;
    const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
    this._telemetryService.publicLog2("terminal/createInstance", {
      location: instance.target === TerminalLocation.Panel ? "view" : instance.target === TerminalLocation.Editor ? isInAuxWindow ? "editor-auxwindow" : "editor" : "unknown",
      shellType: new TelemetryTrustedValue(getSanitizedShellType(slc)),
      promptType: new TelemetryTrustedValue(instance.capabilities.get(TerminalCapability.PromptTypeDetection)?.promptType),
      isCustomPtyImplementation: !!slc.customPtyImplementation,
      isExtensionOwnedTerminal: !!slc.isExtensionOwnedTerminal,
      isLoginShell: (isString(slc.args) ? slc.args.split(" ") : slc.args)?.some((arg) => arg === "-l" || arg === "--login") ?? false,
      isReconnect: !!slc.attachPersistentProcess,
      hasRemoteAuthority: instance.hasRemoteAuthority,
      shellIntegrationQuality: commandDetection?.hasRichCommandDetection ? 2 : commandDetection ? 1 : 0,
      shellIntegrationInjected: instance.usedShellIntegrationInjection,
      shellIntegrationInjectionFailureReason: instance.shellIntegrationInjectionFailureReason,
      imageAddonLoaded: instance.xterm?.isImageAddonLoaded ?? false,
      terminalSessionId: instance.sessionId
    });
  }
  _logShellTypeChanged(instance) {
    this._telemetryService.publicLog2("terminal/shellTypeChanged", {
      shellType: new TelemetryTrustedValue(instance.shellType ?? "unknown"),
      terminalSessionId: instance.sessionId
    });
  }
};
TerminalTelemetryContribution.ID = "terminalTelemetry";
TerminalTelemetryContribution = __decorateClass([
  __decorateParam(0, ILifecycleService),
  __decorateParam(1, ITerminalService),
  __decorateParam(2, ITerminalEditorService),
  __decorateParam(3, ITelemetryService)
], TerminalTelemetryContribution);
var AllowedShellType = /* @__PURE__ */ ((AllowedShellType2) => {
  AllowedShellType2["Unknown"] = "unknown";
  AllowedShellType2["CommandPrompt"] = "cmd";
  AllowedShellType2["Cygwin"] = "cygwin-bash";
  AllowedShellType2["GitBash"] = "git-bash";
  AllowedShellType2["Msys2"] = "msys2-bash";
  AllowedShellType2["WindowsPowerShell"] = "windows-powershell";
  AllowedShellType2["Wsl"] = "wsl";
  AllowedShellType2["Bash"] = "bash";
  AllowedShellType2["Fish"] = "fish";
  AllowedShellType2["Pwsh"] = "pwsh";
  AllowedShellType2["PwshPreview"] = "pwsh-preview";
  AllowedShellType2["Sh"] = "sh";
  AllowedShellType2["Ssh"] = "ssh";
  AllowedShellType2["Tmux"] = "tmux";
  AllowedShellType2["Zsh"] = "zsh";
  AllowedShellType2["Amm"] = "amm";
  AllowedShellType2["Ash"] = "ash";
  AllowedShellType2["Csh"] = "csh";
  AllowedShellType2["Dash"] = "dash";
  AllowedShellType2["Elvish"] = "elvish";
  AllowedShellType2["Ion"] = "ion";
  AllowedShellType2["Ksh"] = "ksh";
  AllowedShellType2["Mksh"] = "mksh";
  AllowedShellType2["Msh"] = "msh";
  AllowedShellType2["NuShell"] = "nu";
  AllowedShellType2["Plan9Shell"] = "rc";
  AllowedShellType2["SchemeShell"] = "scsh";
  AllowedShellType2["Tcsh"] = "tcsh";
  AllowedShellType2["Termux"] = "termux";
  AllowedShellType2["Xonsh"] = "xonsh";
  AllowedShellType2["Claude"] = "claude";
  AllowedShellType2["Codex"] = "codex";
  AllowedShellType2["Copilot"] = "copilot";
  AllowedShellType2["Gemini"] = "gemini";
  AllowedShellType2["Clojure"] = "clj";
  AllowedShellType2["CommonLispSbcl"] = "sbcl";
  AllowedShellType2["Crystal"] = "crystal";
  AllowedShellType2["Deno"] = "deno";
  AllowedShellType2["Elixir"] = "iex";
  AllowedShellType2["Erlang"] = "erl";
  AllowedShellType2["FSharp"] = "fsi";
  AllowedShellType2["Go"] = "go";
  AllowedShellType2["HaskellGhci"] = "ghci";
  AllowedShellType2["Java"] = "jshell";
  AllowedShellType2["Julia"] = "julia";
  AllowedShellType2["Lua"] = "lua";
  AllowedShellType2["Node"] = "node";
  AllowedShellType2["Ocaml"] = "ocaml";
  AllowedShellType2["Perl"] = "perl";
  AllowedShellType2["Php"] = "php";
  AllowedShellType2["PrologSwipl"] = "swipl";
  AllowedShellType2["Python"] = "python";
  AllowedShellType2["R"] = "R";
  AllowedShellType2["RubyIrb"] = "irb";
  AllowedShellType2["Scala"] = "scala";
  AllowedShellType2["SchemeRacket"] = "racket";
  AllowedShellType2["SmalltalkGnu"] = "gst";
  AllowedShellType2["SmalltalkPharo"] = "pharo";
  AllowedShellType2["Tcl"] = "tclsh";
  AllowedShellType2["TsNode"] = "ts-node";
  return AllowedShellType2;
})(AllowedShellType || {});
const shellTypeExecutableAllowList = /* @__PURE__ */ new Set([
  // Windows only
  "cmd" /* CommandPrompt */,
  "wsl" /* Wsl */,
  // Common Unix shells
  "bash" /* Bash */,
  "fish" /* Fish */,
  "pwsh" /* Pwsh */,
  "sh" /* Sh */,
  "ssh" /* Ssh */,
  "tmux" /* Tmux */,
  "zsh" /* Zsh */,
  // More shells
  "amm" /* Amm */,
  "ash" /* Ash */,
  "csh" /* Csh */,
  "dash" /* Dash */,
  "elvish" /* Elvish */,
  "ion" /* Ion */,
  "ksh" /* Ksh */,
  "mksh" /* Mksh */,
  "msh" /* Msh */,
  "nu" /* NuShell */,
  "rc" /* Plan9Shell */,
  "scsh" /* SchemeShell */,
  "tcsh" /* Tcsh */,
  "termux" /* Termux */,
  "xonsh" /* Xonsh */,
  // Lanugage REPLs
  "clj" /* Clojure */,
  "sbcl" /* CommonLispSbcl */,
  "crystal" /* Crystal */,
  "deno" /* Deno */,
  "iex" /* Elixir */,
  "erl" /* Erlang */,
  "fsi" /* FSharp */,
  "go" /* Go */,
  "ghci" /* HaskellGhci */,
  "jshell" /* Java */,
  "julia" /* Julia */,
  "lua" /* Lua */,
  "node" /* Node */,
  "ocaml" /* Ocaml */,
  "perl" /* Perl */,
  "php" /* Php */,
  "swipl" /* PrologSwipl */,
  "python" /* Python */,
  "R" /* R */,
  "irb" /* RubyIrb */,
  "scala" /* Scala */,
  "racket" /* SchemeRacket */,
  "gst" /* SmalltalkGnu */,
  "pharo" /* SmalltalkPharo */,
  "tclsh" /* Tcl */,
  "ts-node" /* TsNode */
]);
const shellTypeExecutableRegexAllowList = [
  { regex: /^(?:pwsh|powershell)-preview$/i, type: "pwsh-preview" /* PwshPreview */ },
  { regex: /^python(?:\d+(?:\.\d+)?)?$/i, type: "python" /* Python */ }
];
const shellTypePathRegexAllowList = [
  // Cygwin uses bash.exe, so look up based on the path
  { regex: /\\Cygwin(?:64)?\\.+\\bash\.exe$/i, type: "cygwin-bash" /* Cygwin */ },
  // Git bash uses bash.exe, so look up based on the path
  { regex: /\\Git\\.+\\bash\.exe$/i, type: "git-bash" /* GitBash */ },
  // Msys2 uses bash.exe, so look up based on the path
  { regex: /\\msys(?:32|64)\\.+\\(?:bash|msys2)\.exe$/i, type: "msys2-bash" /* Msys2 */ },
  // WindowsPowerShell should always be installed on this path, we cannot just look at the
  // executable name since powershell is the CLI on other platforms sometimes (eg. snap package)
  { regex: /\\WindowsPowerShell\\v1.0\\powershell.exe$/i, type: "windows-powershell" /* WindowsPowerShell */ },
  // WSL executables will represent some other shell in the end, but it's difficult to determine
  // when we log
  { regex: /\\Windows\\(?:System32|SysWOW64|Sysnative)\\(?:bash|wsl)\.exe$/i, type: "wsl" /* Wsl */ }
];
function getSanitizedShellType(slc) {
  if (!slc.executable) {
    return "unknown" /* Unknown */;
  }
  const executableFile = basename(slc.executable);
  const executableFileWithoutExt = executableFile.replace(/\.[^\.]+$/, "");
  for (const entry of shellTypePathRegexAllowList) {
    if (entry.regex.test(slc.executable)) {
      return entry.type;
    }
  }
  for (const entry of shellTypeExecutableRegexAllowList) {
    if (entry.regex.test(executableFileWithoutExt)) {
      return entry.type;
    }
  }
  if (shellTypeExecutableAllowList.has(executableFileWithoutExt)) {
    return executableFileWithoutExt;
  }
  return "unknown" /* Unknown */;
}
export {
  TerminalTelemetryContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcdGVsZW1ldHJ5XFxicm93c2VyXFx0ZXJtaW5hbFRlbGVtZXRyeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGdldFdpbmRvd0J5SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGlzQXV4aWxpYXJ5V2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBUZWxlbWV0cnlUcnVzdGVkVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsTG9jYXRpb24sIHR5cGUgSVNoZWxsTGF1bmNoQ29uZmlnLCB0eXBlIFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25GYWlsdXJlUmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB0eXBlIHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsRWRpdG9yU2VydmljZSwgSVRlcm1pbmFsU2VydmljZSwgdHlwZSBJVGVybWluYWxJbnN0YW5jZSB9IGZyb20gJy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuXG5leHBvcnQgY2xhc3MgVGVybWluYWxUZWxlbWV0cnlDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHN0YXRpYyBJRCA9ICd0ZXJtaW5hbFRlbGVtZXRyeSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHRlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0XHRASVRlcm1pbmFsRWRpdG9yU2VydmljZSB0ZXJtaW5hbEVkaXRvclNlcnZpY2U6IElUZXJtaW5hbEVkaXRvclNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGVybWluYWxTZXJ2aWNlLm9uRGlkQ3JlYXRlSW5zdGFuY2UoYXN5bmMgaW5zdGFuY2UgPT4ge1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHR0aGlzLl9zdG9yZS5hZGQoc3RvcmUpO1xuXG5cdFx0XHRhd2FpdCBQcm9taXNlLnJhY2UoW1xuXHRcdFx0XHQvLyBXYWl0IGZvciBwcm9jZXNzIHJlYWR5IHNvIHRoZSBzaGVsbCBsYXVuY2ggY29uZmlnIGlzIGZ1bGx5IHJlc29sdmVkLCB0aGVuXG5cdFx0XHRcdC8vIGFsbG93IGFub3RoZXIgMTAgc2Vjb25kcyBmb3IgdGhlIHNoZWxsIGludGVncmF0aW9uIHRvIGJlIGZ1bGx5IGluaXRpYWxpemVkXG5cdFx0XHRcdGluc3RhbmNlLnByb2Nlc3NSZWFkeS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gdGltZW91dCgxMDAwMCk7XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHQvLyBJZiB0aGUgdGVybWluYWwgaXMgZGlzcG9zZWQsIGl0J3MgcmVhZHkgdG8gcmVwb3J0IG9uIGltbWVkaWF0ZWx5XG5cdFx0XHRcdEV2ZW50LnRvUHJvbWlzZShpbnN0YW5jZS5vbkRpc3Bvc2VkLCBzdG9yZSksXG5cdFx0XHRcdC8vIElmIHRoZSBhcHAgaXMgc2h1dHRpbmcgZG93biwgZmx1c2hcblx0XHRcdFx0RXZlbnQudG9Qcm9taXNlKGxpZmVjeWNsZVNlcnZpY2Uub25XaWxsU2h1dGRvd24sIHN0b3JlKSxcblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBEZXRlcm1pbmUgd2luZG93IHN0YXR1cywgdGhpcyBpcyBkb25lIHNvbWUgdGltZSBhZnRlciB0aGUgcHJvY2VzcyBpcyByZWFkeSBhbmQgY291bGRcblx0XHRcdC8vIHJlZmxlY3QgdGhlIHRlcm1pbmFsIGJlaW5nIG1vdmVkLlxuXHRcdFx0bGV0IGlzSW5BdXhXaW5kb3cgPSBmYWxzZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGlucHV0ID0gdGVybWluYWxFZGl0b3JTZXJ2aWNlLmdldElucHV0RnJvbVJlc291cmNlKGluc3RhbmNlLnJlc291cmNlKTtcblx0XHRcdFx0Y29uc3Qgd2luZG93SWQgPSBpbnB1dC5ncm91cD8ud2luZG93SWQ7XG5cdFx0XHRcdGlzSW5BdXhXaW5kb3cgPSAhISh3aW5kb3dJZCAmJiBpc0F1eGlsaWFyeVdpbmRvdyhnZXRXaW5kb3dCeUlkKHdpbmRvd0lkLCB0cnVlKS53aW5kb3cpKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9sb2dDcmVhdGVJbnN0YW5jZShpbnN0YW5jZSwgaXNJbkF1eFdpbmRvdyk7XG5cdFx0XHR0aGlzLl9zdG9yZS5kZWxldGUoc3RvcmUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRlcm1pbmFsU2VydmljZS5vbkFueUluc3RhbmNlU2hlbGxUeXBlQ2hhbmdlZChpbnN0YW5jZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTaGVsbFR5cGVDaGFuZ2VkKGluc3RhbmNlKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9sb2dDcmVhdGVJbnN0YW5jZShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsIGlzSW5BdXhXaW5kb3c6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBzbGMgPSBpbnN0YW5jZS5zaGVsbExhdW5jaENvbmZpZztcblx0XHRjb25zdCBjb21tYW5kRGV0ZWN0aW9uID0gaW5zdGFuY2UuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik7XG5cblx0XHR0eXBlIFRlcm1pbmFsQ3JlYXRpb25UZWxlbWV0cnlEYXRhID0ge1xuXHRcdFx0bG9jYXRpb246IHN0cmluZztcblxuXHRcdFx0c2hlbGxUeXBlOiBUZWxlbWV0cnlUcnVzdGVkVmFsdWU8c3RyaW5nPjtcblx0XHRcdHByb21wdFR5cGU6IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXG5cdFx0XHRpc0N1c3RvbVB0eUltcGxlbWVudGF0aW9uOiBib29sZWFuO1xuXHRcdFx0aXNFeHRlbnNpb25Pd25lZFRlcm1pbmFsOiBib29sZWFuO1xuXHRcdFx0aXNMb2dpblNoZWxsOiBib29sZWFuO1xuXHRcdFx0aXNSZWNvbm5lY3Q6IGJvb2xlYW47XG5cdFx0XHRoYXNSZW1vdGVBdXRob3JpdHk6IGJvb2xlYW47XG5cblx0XHRcdHNoZWxsSW50ZWdyYXRpb25RdWFsaXR5OiBudW1iZXI7XG5cdFx0XHRzaGVsbEludGVncmF0aW9uSW5qZWN0ZWQ6IGJvb2xlYW47XG5cdFx0XHRzaGVsbEludGVncmF0aW9uSW5qZWN0aW9uRmFpbHVyZVJlYXNvbjogU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmVSZWFzb24gfCB1bmRlZmluZWQ7XG5cblx0XHRcdGltYWdlQWRkb25Mb2FkZWQ6IGJvb2xlYW47XG5cblx0XHRcdHRlcm1pbmFsU2Vzc2lvbklkOiBzdHJpbmc7XG5cdFx0fTtcblx0XHR0eXBlIFRlcm1pbmFsQ3JlYXRpb25UZWxlbWV0cnlDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnYW50aG9ueWtpbTEnO1xuXHRcdFx0Y29tbWVudDogJ1RyYWNrIGRldGFpbHMgYWJvdXQgdGVybWluYWwgY3JlYXRpb24sIHN1Y2ggYXMgdGhlIHNoZWxsIHR5cGUnO1xuXG5cdFx0XHRsb2NhdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBsb2NhdGlvbiBvZiB0aGUgdGVybWluYWwuJyB9O1xuXG5cdFx0XHRzaGVsbFR5cGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgZGV0ZWN0ZWQgc2hlbGwgdHlwZSBmb3IgdGhlIHRlcm1pbmFsLicgfTtcblx0XHRcdHByb21wdFR5cGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgZGV0ZWN0ZWQgcHJvbXB0IHR5cGUgZm9yIHRoZSB0ZXJtaW5hbC4nIH07XG5cblx0XHRcdGlzQ3VzdG9tUHR5SW1wbGVtZW50YXRpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSB0ZXJtaW5hbCB3YXMgdXNpbmcgYSBjdXN0b20gUFRZIGltcGxlbWVudGF0aW9uLicgfTtcblx0XHRcdGlzRXh0ZW5zaW9uT3duZWRUZXJtaW5hbDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIHRlcm1pbmFsIHdhcyBjcmVhdGVkIGJ5IGFuIGV4dGVuc2lvbi4nIH07XG5cdFx0XHRpc0xvZ2luU2hlbGw6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBhcmd1bWVudHMgY29udGFpbiAtbCBvciAtLWxvZ2luLicgfTtcblx0XHRcdGlzUmVjb25uZWN0OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgdGVybWluYWwgaXMgcmVjb25uZWN0aW5nIHRvIGFuIGV4aXN0aW5nIGluc3RhbmNlLicgfTtcblx0XHRcdGhhc1JlbW90ZUF1dGhvcml0eTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIHRlcm1pbmFsIGhhcyBhIHJlbW90ZSBhdXRob3JpdHksIHRoaXMgaXMgbGlrZWx5IGEgY29ubmVjdGlvbiB0ZXJtaW5hbCB3aGVuIHVuZGVmaW5lZCBpbiBhIHdpbmRvdyB3aXRoIGEgcmVtb3RlIGF1dGhvcml0eS4nIH07XG5cblx0XHRcdHNoZWxsSW50ZWdyYXRpb25RdWFsaXR5OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHNoZWxsIGludGVncmF0aW9uIHF1YWxpdHkgKHJpY2g9MiwgYmFzaWM9MSBvciBub25lPTApLicgfTtcblx0XHRcdHNoZWxsSW50ZWdyYXRpb25JbmplY3RlZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIHNoZWxsIGludGVncmF0aW9uIHNjcmlwdCB3YXMgaW5qZWN0ZWQuJyB9O1xuXHRcdFx0c2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmVSZWFzb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdJbmZvIGFib3V0IHNoZWxsIGludGVncmF0aW9uIGluamVjdGlvbi4nIH07XG5cblx0XHRcdGltYWdlQWRkb25Mb2FkZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSB4dGVybS5qcyBpbWFnZSBhZGRvbiB3YXMgbG9hZGVkLicgfTtcblxuXHRcdFx0dGVybWluYWxTZXNzaW9uSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgc2Vzc2lvbiBJRCBvZiB0aGUgdGVybWluYWwgaW5zdGFuY2UuJyB9O1xuXHRcdH07XG5cdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFRlcm1pbmFsQ3JlYXRpb25UZWxlbWV0cnlEYXRhLCBUZXJtaW5hbENyZWF0aW9uVGVsZW1ldHJ5Q2xhc3NpZmljYXRpb24+KCd0ZXJtaW5hbC9jcmVhdGVJbnN0YW5jZScsIHtcblx0XHRcdGxvY2F0aW9uOiAoaW5zdGFuY2UudGFyZ2V0ID09PSBUZXJtaW5hbExvY2F0aW9uLlBhbmVsXG5cdFx0XHRcdD8gJ3ZpZXcnXG5cdFx0XHRcdDogaW5zdGFuY2UudGFyZ2V0ID09PSBUZXJtaW5hbExvY2F0aW9uLkVkaXRvclxuXHRcdFx0XHRcdD8gKGlzSW5BdXhXaW5kb3cgPyAnZWRpdG9yLWF1eHdpbmRvdycgOiAnZWRpdG9yJylcblx0XHRcdFx0XHQ6ICd1bmtub3duJyksXG5cblx0XHRcdHNoZWxsVHlwZTogbmV3IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZShnZXRTYW5pdGl6ZWRTaGVsbFR5cGUoc2xjKSksXG5cdFx0XHRwcm9tcHRUeXBlOiBuZXcgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlKGluc3RhbmNlLmNhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LlByb21wdFR5cGVEZXRlY3Rpb24pPy5wcm9tcHRUeXBlKSxcblxuXHRcdFx0aXNDdXN0b21QdHlJbXBsZW1lbnRhdGlvbjogISFzbGMuY3VzdG9tUHR5SW1wbGVtZW50YXRpb24sXG5cdFx0XHRpc0V4dGVuc2lvbk93bmVkVGVybWluYWw6ICEhc2xjLmlzRXh0ZW5zaW9uT3duZWRUZXJtaW5hbCxcblx0XHRcdGlzTG9naW5TaGVsbDogKGlzU3RyaW5nKHNsYy5hcmdzKSA/IHNsYy5hcmdzLnNwbGl0KCcgJykgOiBzbGMuYXJncyk/LnNvbWUoYXJnID0+IGFyZyA9PT0gJy1sJyB8fCBhcmcgPT09ICctLWxvZ2luJykgPz8gZmFsc2UsXG5cdFx0XHRpc1JlY29ubmVjdDogISFzbGMuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MsXG5cdFx0XHRoYXNSZW1vdGVBdXRob3JpdHk6IGluc3RhbmNlLmhhc1JlbW90ZUF1dGhvcml0eSxcblxuXHRcdFx0c2hlbGxJbnRlZ3JhdGlvblF1YWxpdHk6IGNvbW1hbmREZXRlY3Rpb24/Lmhhc1JpY2hDb21tYW5kRGV0ZWN0aW9uID8gMiA6IGNvbW1hbmREZXRlY3Rpb24gPyAxIDogMCxcblx0XHRcdHNoZWxsSW50ZWdyYXRpb25JbmplY3RlZDogaW5zdGFuY2UudXNlZFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24sXG5cdFx0XHRzaGVsbEludGVncmF0aW9uSW5qZWN0aW9uRmFpbHVyZVJlYXNvbjogaW5zdGFuY2Uuc2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmVSZWFzb24sXG5cdFx0XHRpbWFnZUFkZG9uTG9hZGVkOiBpbnN0YW5jZS54dGVybT8uaXNJbWFnZUFkZG9uTG9hZGVkID8/IGZhbHNlLFxuXHRcdFx0dGVybWluYWxTZXNzaW9uSWQ6IGluc3RhbmNlLnNlc3Npb25JZCxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2xvZ1NoZWxsVHlwZUNoYW5nZWQoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogdm9pZCB7XG5cdFx0dHlwZSBUZXJtaW5hbFNoZWxsVHlwZUNoYW5nZWRUZWxlbWV0cnlEYXRhID0ge1xuXHRcdFx0c2hlbGxUeXBlOiBUZWxlbWV0cnlUcnVzdGVkVmFsdWU8c3RyaW5nPjtcblx0XHRcdHRlcm1pbmFsU2Vzc2lvbklkOiBzdHJpbmc7XG5cdFx0fTtcblx0XHR0eXBlIFRlcm1pbmFsU2hlbGxUeXBlQ2hhbmdlZFRlbGVtZXRyeUNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdhbnRob255a2ltMSc7XG5cdFx0XHRjb21tZW50OiAnVHJhY2sgd2hlbiB0aGUgZGV0ZWN0ZWQgc2hlbGwgdHlwZSBmb3IgYSB0ZXJtaW5hbCBjaGFuZ2VzLCBpbmNsdWRpbmcgZGV0ZWN0aW9uIG9mIGFnZW50IENMSXMgKGUuZy4gY2xhdWRlLCBjb3BpbG90LCBnZW1pbmkpJztcblxuXHRcdFx0c2hlbGxUeXBlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIG5ldyBkZXRlY3RlZCBzaGVsbCB0eXBlIGZvciB0aGUgdGVybWluYWwuJyB9O1xuXHRcdFx0dGVybWluYWxTZXNzaW9uSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgc2Vzc2lvbiBJRCBvZiB0aGUgdGVybWluYWwgaW5zdGFuY2UuJyB9O1xuXHRcdH07XG5cdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFRlcm1pbmFsU2hlbGxUeXBlQ2hhbmdlZFRlbGVtZXRyeURhdGEsIFRlcm1pbmFsU2hlbGxUeXBlQ2hhbmdlZFRlbGVtZXRyeUNsYXNzaWZpY2F0aW9uPigndGVybWluYWwvc2hlbGxUeXBlQ2hhbmdlZCcsIHtcblx0XHRcdHNoZWxsVHlwZTogbmV3IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZShpbnN0YW5jZS5zaGVsbFR5cGUgPz8gJ3Vua25vd24nKSxcblx0XHRcdHRlcm1pbmFsU2Vzc2lvbklkOiBpbnN0YW5jZS5zZXNzaW9uSWQsXG5cdFx0fSk7XG5cdH1cbn1cblxuLy8gI3JlZ2lvbiBTaGVsbCBUeXBlXG5cbmNvbnN0IGVudW0gQWxsb3dlZFNoZWxsVHlwZSB7XG5cdFVua25vd24gPSAndW5rbm93bicsXG5cblx0Ly8gV2luZG93cyBvbmx5XG5cdENvbW1hbmRQcm9tcHQgPSAnY21kJyxcblx0Q3lnd2luID0gJ2N5Z3dpbi1iYXNoJyxcblx0R2l0QmFzaCA9ICdnaXQtYmFzaCcsXG5cdE1zeXMyID0gJ21zeXMyLWJhc2gnLFxuXHRXaW5kb3dzUG93ZXJTaGVsbCA9ICd3aW5kb3dzLXBvd2Vyc2hlbGwnLFxuXHRXc2wgPSAnd3NsJyxcblxuXG5cdC8vIENvbW1vbiBVbml4IHNoZWxsc1xuXHRCYXNoID0gJ2Jhc2gnLFxuXHRGaXNoID0gJ2Zpc2gnLFxuXHRQd3NoID0gJ3B3c2gnLFxuXHRQd3NoUHJldmlldyA9ICdwd3NoLXByZXZpZXcnLFxuXHRTaCA9ICdzaCcsXG5cdFNzaCA9ICdzc2gnLFxuXHRUbXV4ID0gJ3RtdXgnLFxuXHRac2ggPSAnenNoJyxcblxuXHQvLyBNb3JlIHNoZWxsc1xuXHRBbW0gPSAnYW1tJyxcblx0QXNoID0gJ2FzaCcsXG5cdENzaCA9ICdjc2gnLFxuXHREYXNoID0gJ2Rhc2gnLFxuXHRFbHZpc2ggPSAnZWx2aXNoJyxcblx0SW9uID0gJ2lvbicsXG5cdEtzaCA9ICdrc2gnLFxuXHRNa3NoID0gJ21rc2gnLFxuXHRNc2ggPSAnbXNoJyxcblx0TnVTaGVsbCA9ICdudScsXG5cdFBsYW45U2hlbGwgPSAncmMnLFxuXHRTY2hlbWVTaGVsbCA9ICdzY3NoJyxcblx0VGNzaCA9ICd0Y3NoJyxcblx0VGVybXV4ID0gJ3Rlcm11eCcsXG5cdFhvbnNoID0gJ3hvbnNoJyxcblxuXHQvLyBBSSBDTElzXG5cdENsYXVkZSA9ICdjbGF1ZGUnLFxuXHRDb2RleCA9ICdjb2RleCcsXG5cdENvcGlsb3QgPSAnY29waWxvdCcsXG5cdEdlbWluaSA9ICdnZW1pbmknLFxuXG5cdC8vIExhbnVnYWdlIFJFUExzXG5cdC8vIFRoZXNlIGFyZSBleHBlY3RlZCB0byBiZSB2ZXJ5IGxvdyBzaW5jZSB0aGV5IGFyZSBub3QgdHlwaWNhbGx5IHRoZSBkZWZhdWx0IHNoZWxsXG5cdENsb2p1cmUgPSAnY2xqJyxcblx0Q29tbW9uTGlzcFNiY2wgPSAnc2JjbCcsXG5cdENyeXN0YWwgPSAnY3J5c3RhbCcsXG5cdERlbm8gPSAnZGVubycsXG5cdEVsaXhpciA9ICdpZXgnLFxuXHRFcmxhbmcgPSAnZXJsJyxcblx0RlNoYXJwID0gJ2ZzaScsXG5cdEdvID0gJ2dvJyxcblx0SGFza2VsbEdoY2kgPSAnZ2hjaScsXG5cdEphdmEgPSAnanNoZWxsJyxcblx0SnVsaWEgPSAnanVsaWEnLFxuXHRMdWEgPSAnbHVhJyxcblx0Tm9kZSA9ICdub2RlJyxcblx0T2NhbWwgPSAnb2NhbWwnLFxuXHRQZXJsID0gJ3BlcmwnLFxuXHRQaHAgPSAncGhwJyxcblx0UHJvbG9nU3dpcGwgPSAnc3dpcGwnLFxuXHRQeXRob24gPSAncHl0aG9uJyxcblx0UiA9ICdSJyxcblx0UnVieUlyYiA9ICdpcmInLFxuXHRTY2FsYSA9ICdzY2FsYScsXG5cdFNjaGVtZVJhY2tldCA9ICdyYWNrZXQnLFxuXHRTbWFsbHRhbGtHbnUgPSAnZ3N0Jyxcblx0U21hbGx0YWxrUGhhcm8gPSAncGhhcm8nLFxuXHRUY2wgPSAndGNsc2gnLFxuXHRUc05vZGUgPSAndHMtbm9kZScsXG59XG5cbi8vIFR5cGVzIHRoYXQgbWF0Y2ggdGhlIGV4ZWN1dGFibGUgbmFtZSBkaXJlY3RseVxuY29uc3Qgc2hlbGxUeXBlRXhlY3V0YWJsZUFsbG93TGlzdDogU2V0PHN0cmluZz4gPSBuZXcgU2V0KFtcblx0Ly8gV2luZG93cyBvbmx5XG5cdEFsbG93ZWRTaGVsbFR5cGUuQ29tbWFuZFByb21wdCxcblx0QWxsb3dlZFNoZWxsVHlwZS5Xc2wsXG5cblx0Ly8gQ29tbW9uIFVuaXggc2hlbGxzXG5cdEFsbG93ZWRTaGVsbFR5cGUuQmFzaCxcblx0QWxsb3dlZFNoZWxsVHlwZS5GaXNoLFxuXHRBbGxvd2VkU2hlbGxUeXBlLlB3c2gsXG5cdEFsbG93ZWRTaGVsbFR5cGUuU2gsXG5cdEFsbG93ZWRTaGVsbFR5cGUuU3NoLFxuXHRBbGxvd2VkU2hlbGxUeXBlLlRtdXgsXG5cdEFsbG93ZWRTaGVsbFR5cGUuWnNoLFxuXG5cdC8vIE1vcmUgc2hlbGxzXG5cdEFsbG93ZWRTaGVsbFR5cGUuQW1tLFxuXHRBbGxvd2VkU2hlbGxUeXBlLkFzaCxcblx0QWxsb3dlZFNoZWxsVHlwZS5Dc2gsXG5cdEFsbG93ZWRTaGVsbFR5cGUuRGFzaCxcblx0QWxsb3dlZFNoZWxsVHlwZS5FbHZpc2gsXG5cdEFsbG93ZWRTaGVsbFR5cGUuSW9uLFxuXHRBbGxvd2VkU2hlbGxUeXBlLktzaCxcblx0QWxsb3dlZFNoZWxsVHlwZS5Na3NoLFxuXHRBbGxvd2VkU2hlbGxUeXBlLk1zaCxcblx0QWxsb3dlZFNoZWxsVHlwZS5OdVNoZWxsLFxuXHRBbGxvd2VkU2hlbGxUeXBlLlBsYW45U2hlbGwsXG5cdEFsbG93ZWRTaGVsbFR5cGUuU2NoZW1lU2hlbGwsXG5cdEFsbG93ZWRTaGVsbFR5cGUuVGNzaCxcblx0QWxsb3dlZFNoZWxsVHlwZS5UZXJtdXgsXG5cdEFsbG93ZWRTaGVsbFR5cGUuWG9uc2gsXG5cblx0Ly8gTGFudWdhZ2UgUkVQTHNcblx0QWxsb3dlZFNoZWxsVHlwZS5DbG9qdXJlLFxuXHRBbGxvd2VkU2hlbGxUeXBlLkNvbW1vbkxpc3BTYmNsLFxuXHRBbGxvd2VkU2hlbGxUeXBlLkNyeXN0YWwsXG5cdEFsbG93ZWRTaGVsbFR5cGUuRGVubyxcblx0QWxsb3dlZFNoZWxsVHlwZS5FbGl4aXIsXG5cdEFsbG93ZWRTaGVsbFR5cGUuRXJsYW5nLFxuXHRBbGxvd2VkU2hlbGxUeXBlLkZTaGFycCxcblx0QWxsb3dlZFNoZWxsVHlwZS5Hbyxcblx0QWxsb3dlZFNoZWxsVHlwZS5IYXNrZWxsR2hjaSxcblx0QWxsb3dlZFNoZWxsVHlwZS5KYXZhLFxuXHRBbGxvd2VkU2hlbGxUeXBlLkp1bGlhLFxuXHRBbGxvd2VkU2hlbGxUeXBlLkx1YSxcblx0QWxsb3dlZFNoZWxsVHlwZS5Ob2RlLFxuXHRBbGxvd2VkU2hlbGxUeXBlLk9jYW1sLFxuXHRBbGxvd2VkU2hlbGxUeXBlLlBlcmwsXG5cdEFsbG93ZWRTaGVsbFR5cGUuUGhwLFxuXHRBbGxvd2VkU2hlbGxUeXBlLlByb2xvZ1N3aXBsLFxuXHRBbGxvd2VkU2hlbGxUeXBlLlB5dGhvbixcblx0QWxsb3dlZFNoZWxsVHlwZS5SLFxuXHRBbGxvd2VkU2hlbGxUeXBlLlJ1YnlJcmIsXG5cdEFsbG93ZWRTaGVsbFR5cGUuU2NhbGEsXG5cdEFsbG93ZWRTaGVsbFR5cGUuU2NoZW1lUmFja2V0LFxuXHRBbGxvd2VkU2hlbGxUeXBlLlNtYWxsdGFsa0dudSxcblx0QWxsb3dlZFNoZWxsVHlwZS5TbWFsbHRhbGtQaGFybyxcblx0QWxsb3dlZFNoZWxsVHlwZS5UY2wsXG5cdEFsbG93ZWRTaGVsbFR5cGUuVHNOb2RlLFxuXSkgc2F0aXNmaWVzIFNldDxBbGxvd2VkU2hlbGxUeXBlPjtcblxuLy8gRHluYW1pYyBleGVjdXRhYmxlcyB0aGF0IG1hcCB0byBhIHNpbmdsZSB0eXBlXG5jb25zdCBzaGVsbFR5cGVFeGVjdXRhYmxlUmVnZXhBbGxvd0xpc3Q6IHsgcmVnZXg6IFJlZ0V4cDsgdHlwZTogQWxsb3dlZFNoZWxsVHlwZSB9W10gPSBbXG5cdHsgcmVnZXg6IC9eKD86cHdzaHxwb3dlcnNoZWxsKS1wcmV2aWV3JC9pLCB0eXBlOiBBbGxvd2VkU2hlbGxUeXBlLlB3c2hQcmV2aWV3IH0sXG5cdHsgcmVnZXg6IC9ecHl0aG9uKD86XFxkKyg/OlxcLlxcZCspPyk/JC9pLCB0eXBlOiBBbGxvd2VkU2hlbGxUeXBlLlB5dGhvbiB9LFxuXTtcblxuLy8gUGF0aC1iYXNlZCBsb29rIHVwc1xuY29uc3Qgc2hlbGxUeXBlUGF0aFJlZ2V4QWxsb3dMaXN0OiB7IHJlZ2V4OiBSZWdFeHA7IHR5cGU6IEFsbG93ZWRTaGVsbFR5cGUgfVtdID0gW1xuXHQvLyBDeWd3aW4gdXNlcyBiYXNoLmV4ZSwgc28gbG9vayB1cCBiYXNlZCBvbiB0aGUgcGF0aFxuXHR7IHJlZ2V4OiAvXFxcXEN5Z3dpbig/OjY0KT9cXFxcLitcXFxcYmFzaFxcLmV4ZSQvaSwgdHlwZTogQWxsb3dlZFNoZWxsVHlwZS5DeWd3aW4gfSxcblx0Ly8gR2l0IGJhc2ggdXNlcyBiYXNoLmV4ZSwgc28gbG9vayB1cCBiYXNlZCBvbiB0aGUgcGF0aFxuXHR7IHJlZ2V4OiAvXFxcXEdpdFxcXFwuK1xcXFxiYXNoXFwuZXhlJC9pLCB0eXBlOiBBbGxvd2VkU2hlbGxUeXBlLkdpdEJhc2ggfSxcblx0Ly8gTXN5czIgdXNlcyBiYXNoLmV4ZSwgc28gbG9vayB1cCBiYXNlZCBvbiB0aGUgcGF0aFxuXHR7IHJlZ2V4OiAvXFxcXG1zeXMoPzozMnw2NClcXFxcLitcXFxcKD86YmFzaHxtc3lzMilcXC5leGUkL2ksIHR5cGU6IEFsbG93ZWRTaGVsbFR5cGUuTXN5czIgfSxcblx0Ly8gV2luZG93c1Bvd2VyU2hlbGwgc2hvdWxkIGFsd2F5cyBiZSBpbnN0YWxsZWQgb24gdGhpcyBwYXRoLCB3ZSBjYW5ub3QganVzdCBsb29rIGF0IHRoZVxuXHQvLyBleGVjdXRhYmxlIG5hbWUgc2luY2UgcG93ZXJzaGVsbCBpcyB0aGUgQ0xJIG9uIG90aGVyIHBsYXRmb3JtcyBzb21ldGltZXMgKGVnLiBzbmFwIHBhY2thZ2UpXG5cdHsgcmVnZXg6IC9cXFxcV2luZG93c1Bvd2VyU2hlbGxcXFxcdjEuMFxcXFxwb3dlcnNoZWxsLmV4ZSQvaSwgdHlwZTogQWxsb3dlZFNoZWxsVHlwZS5XaW5kb3dzUG93ZXJTaGVsbCB9LFxuXHQvLyBXU0wgZXhlY3V0YWJsZXMgd2lsbCByZXByZXNlbnQgc29tZSBvdGhlciBzaGVsbCBpbiB0aGUgZW5kLCBidXQgaXQncyBkaWZmaWN1bHQgdG8gZGV0ZXJtaW5lXG5cdC8vIHdoZW4gd2UgbG9nXG5cdHsgcmVnZXg6IC9cXFxcV2luZG93c1xcXFwoPzpTeXN0ZW0zMnxTeXNXT1c2NHxTeXNuYXRpdmUpXFxcXCg/OmJhc2h8d3NsKVxcLmV4ZSQvaSwgdHlwZTogQWxsb3dlZFNoZWxsVHlwZS5Xc2wgfSxcbl07XG5cbmZ1bmN0aW9uIGdldFNhbml0aXplZFNoZWxsVHlwZShzbGM6IElTaGVsbExhdW5jaENvbmZpZyk6IEFsbG93ZWRTaGVsbFR5cGUge1xuXHRpZiAoIXNsYy5leGVjdXRhYmxlKSB7XG5cdFx0cmV0dXJuIEFsbG93ZWRTaGVsbFR5cGUuVW5rbm93bjtcblx0fVxuXHRjb25zdCBleGVjdXRhYmxlRmlsZSA9IGJhc2VuYW1lKHNsYy5leGVjdXRhYmxlKTtcblx0Y29uc3QgZXhlY3V0YWJsZUZpbGVXaXRob3V0RXh0ID0gZXhlY3V0YWJsZUZpbGUucmVwbGFjZSgvXFwuW15cXC5dKyQvLCAnJyk7XG5cdGZvciAoY29uc3QgZW50cnkgb2Ygc2hlbGxUeXBlUGF0aFJlZ2V4QWxsb3dMaXN0KSB7XG5cdFx0aWYgKGVudHJ5LnJlZ2V4LnRlc3Qoc2xjLmV4ZWN1dGFibGUpKSB7XG5cdFx0XHRyZXR1cm4gZW50cnkudHlwZTtcblx0XHR9XG5cdH1cblx0Zm9yIChjb25zdCBlbnRyeSBvZiBzaGVsbFR5cGVFeGVjdXRhYmxlUmVnZXhBbGxvd0xpc3QpIHtcblx0XHRpZiAoZW50cnkucmVnZXgudGVzdChleGVjdXRhYmxlRmlsZVdpdGhvdXRFeHQpKSB7XG5cdFx0XHRyZXR1cm4gZW50cnkudHlwZTtcblx0XHR9XG5cdH1cblx0aWYgKChzaGVsbFR5cGVFeGVjdXRhYmxlQWxsb3dMaXN0KS5oYXMoZXhlY3V0YWJsZUZpbGVXaXRob3V0RXh0KSkge1xuXHRcdHJldHVybiBleGVjdXRhYmxlRmlsZVdpdGhvdXRFeHQgYXMgQWxsb3dlZFNoZWxsVHlwZTtcblx0fVxuXHRyZXR1cm4gQWxsb3dlZFNoZWxsVHlwZS5Vbmtub3duO1xufVxuXG4vLyAjZW5kcmVnaW9uIFNoZWxsIFR5cGVcbiJdLAogICJt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Q0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBO0FBQUEsRUFHQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFDRCxDQUFDO0FBR0QsTUFBTSxvQ0FBaUY7QUFBQSxFQUN0RixFQUFFLE9BQU8sa0NBQWtDLE1BQU0saUNBQTZCO0FBQUEsRUFDOUUsRUFBRSxPQUFPLCtCQUErQixNQUFNLHNCQUF3QjtBQUN2RTtBQUdBLE1BQU0sOEJBQTJFO0FBQUE7QUFBQSxFQUVoRixFQUFFLE9BQU8sb0NBQW9DLE1BQU0sMkJBQXdCO0FBQUE7QUFBQSxFQUUzRSxFQUFFLE9BQU8sMEJBQTBCLE1BQU0seUJBQXlCO0FBQUE7QUFBQSxFQUVsRSxFQUFFLE9BQU8sOENBQThDLE1BQU0seUJBQXVCO0FBQUE7QUFBQTtBQUFBLEVBR3BGLEVBQUUsT0FBTywrQ0FBK0MsTUFBTSw2Q0FBbUM7QUFBQTtBQUFBO0FBQUEsRUFHakcsRUFBRSxPQUFPLG1FQUFtRSxNQUFNLGdCQUFxQjtBQUN4RztBQUVBLFNBQVMsc0JBQXNCLEtBQTJDO0FBQ3pFLE1BQUksQ0FBQyxJQUFJLFlBQVk7QUFDcEIsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLGlCQUFpQixTQUFTLElBQUksVUFBVTtBQUM5QyxRQUFNLDJCQUEyQixlQUFlLFFBQVEsYUFBYSxFQUFFO0FBQ3ZFLGFBQVcsU0FBUyw2QkFBNkI7QUFDaEQsUUFBSSxNQUFNLE1BQU0sS0FBSyxJQUFJLFVBQVUsR0FBRztBQUNyQyxhQUFPLE1BQU07QUFBQSxJQUNkO0FBQUEsRUFDRDtBQUNBLGFBQVcsU0FBUyxtQ0FBbUM7QUFDdEQsUUFBSSxNQUFNLE1BQU0sS0FBSyx3QkFBd0IsR0FBRztBQUMvQyxhQUFPLE1BQU07QUFBQSxJQUNkO0FBQUEsRUFDRDtBQUNBLE1BQUssNkJBQThCLElBQUksd0JBQXdCLEdBQUc7QUFDakUsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbIkFsbG93ZWRTaGVsbFR5cGUiXQp9Cg==
