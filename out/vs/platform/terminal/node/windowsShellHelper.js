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
import { timeout } from "../../../base/common/async.js";
import { debounce } from "../../../base/common/decorators.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { isWindows, platform } from "../../../base/common/platform.js";
import { GeneralShellType, WindowsShellType } from "../common/terminal.js";
const SHELL_EXECUTABLES = [
  "cmd.exe",
  "powershell.exe",
  "pwsh.exe",
  "bash.exe",
  "git-cmd.exe",
  "wsl.exe",
  "ubuntu.exe",
  "ubuntu1804.exe",
  "kali.exe",
  "debian.exe",
  "opensuse-42.exe",
  "sles-12.exe",
  "julia.exe",
  "nu.exe",
  "node.exe",
  "xonsh.exe"
];
const SHELL_EXECUTABLE_REGEXES = [
  /^python(\d(\.\d{0,2})?)?\.exe$/
];
const NODE_AGENT_CLI_PATTERNS = [
  { regex: /[\\/]claude-code[\\/]/i, executable: "claude.exe" },
  { regex: /[\\/]codex[\\/]/i, executable: "codex.exe" },
  { regex: /[\\/]command-code[\\/]/i, executable: "commandcode.exe" },
  { regex: /[\\/]copilot[\\/]/i, executable: "copilot.exe" },
  { regex: /[\\/]gemini-cli[\\/]/i, executable: "gemini.exe" }
];
let windowsProcessTree;
class WindowsShellHelper extends Disposable {
  constructor(_rootProcessId) {
    super();
    this._rootProcessId = _rootProcessId;
    this._shellTitle = "";
    this._onShellNameChanged = this._register(new Emitter());
    this._onShellTypeChanged = this._register(new Emitter());
    if (!isWindows) {
      throw new Error(`WindowsShellHelper cannot be instantiated on ${platform}`);
    }
    this._startMonitoringShell();
  }
  get shellType() {
    return this._shellType;
  }
  get shellTitle() {
    return this._shellTitle;
  }
  get onShellNameChanged() {
    return this._onShellNameChanged.event;
  }
  get onShellTypeChanged() {
    return this._onShellTypeChanged.event;
  }
  async _startMonitoringShell() {
    if (this._store.isDisposed) {
      return;
    }
    this.checkShell();
  }
  async checkShell() {
    if (isWindows) {
      await timeout(300);
      this.getShellName().then((title) => {
        const type = this.getShellType(title);
        if (type !== this._shellType) {
          this._onShellTypeChanged.fire(type);
          this._onShellNameChanged.fire(title);
          this._shellType = type;
          this._shellTitle = title;
        }
      });
    }
  }
  traverseTree(tree) {
    if (!tree) {
      return "";
    }
    if (tree.name === "node.exe" && tree.commandLine) {
      for (const { regex, executable } of NODE_AGENT_CLI_PATTERNS) {
        if (regex.test(tree.commandLine)) {
          return executable;
        }
      }
    }
    if (SHELL_EXECUTABLES.indexOf(tree.name) === -1) {
      return tree.name;
    }
    for (const regex of SHELL_EXECUTABLE_REGEXES) {
      if (tree.name.match(regex)) {
        return tree.name;
      }
    }
    if (!tree.children || tree.children.length === 0) {
      return tree.name;
    }
    let favouriteChild = 0;
    for (; favouriteChild < tree.children.length; favouriteChild++) {
      const child = tree.children[favouriteChild];
      if (!child.children || child.children.length === 0) {
        break;
      }
      if (child.children[0].name !== "conhost.exe") {
        break;
      }
    }
    if (favouriteChild >= tree.children.length) {
      return tree.name;
    }
    return this.traverseTree(tree.children[favouriteChild]);
  }
  /**
   * Returns the innermost shell executable running in the terminal
   */
  async getShellName() {
    if (this._store.isDisposed) {
      return Promise.resolve("");
    }
    if (this._currentRequest) {
      return this._currentRequest;
    }
    if (!windowsProcessTree) {
      windowsProcessTree = await import("@vscode/windows-process-tree");
    }
    this._currentRequest = new Promise((resolve) => {
      windowsProcessTree.getProcessTree(this._rootProcessId, (tree) => {
        const name = this.traverseTree(tree);
        this._currentRequest = void 0;
        resolve(name);
      }, windowsProcessTree.ProcessDataFlag.CommandLine);
    });
    return this._currentRequest;
  }
  getShellType(executable) {
    switch (executable.toLowerCase()) {
      case "cmd.exe":
        return WindowsShellType.CommandPrompt;
      case "powershell.exe":
      case "pwsh.exe":
        return GeneralShellType.PowerShell;
      case "bash.exe":
      case "git-cmd.exe":
        return WindowsShellType.GitBash;
      case "julia.exe":
        return GeneralShellType.Julia;
      case "node.exe":
        return GeneralShellType.Node;
      case "nu.exe":
        return GeneralShellType.NuShell;
      case "xonsh.exe":
        return GeneralShellType.Xonsh;
      case "claude.exe":
        return GeneralShellType.Claude;
      case "codex.exe":
        return GeneralShellType.Codex;
      case "commandcode.exe":
        return GeneralShellType.CommandCode;
      case "copilot.exe":
        return GeneralShellType.Copilot;
      case "gemini.exe":
        return GeneralShellType.Gemini;
      case "wsl.exe":
      case "ubuntu.exe":
      case "ubuntu1804.exe":
      case "kali.exe":
      case "debian.exe":
      case "opensuse-42.exe":
      case "sles-12.exe":
        return WindowsShellType.Wsl;
      default:
        if (executable.match(/python(\d(\.\d{0,2})?)?\.exe/)) {
          return GeneralShellType.Python;
        }
        return void 0;
    }
  }
}
__decorateClass([
  debounce(500)
], WindowsShellHelper.prototype, "checkShell", 1);
export {
  WindowsShellHelper
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXG5vZGVcXHdpbmRvd3NTaGVsbEhlbHBlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBkZWJvdW5jZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MsIHBsYXRmb3JtIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgR2VuZXJhbFNoZWxsVHlwZSwgVGVybWluYWxTaGVsbFR5cGUsIFdpbmRvd3NTaGVsbFR5cGUgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHR5cGUgKiBhcyBXaW5kb3dzUHJvY2Vzc1RyZWVUeXBlIGZyb20gJ0B2c2NvZGUvd2luZG93cy1wcm9jZXNzLXRyZWUnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElXaW5kb3dzU2hlbGxIZWxwZXIgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IG9uU2hlbGxOYW1lQ2hhbmdlZDogRXZlbnQ8c3RyaW5nPjtcblx0cmVhZG9ubHkgb25TaGVsbFR5cGVDaGFuZ2VkOiBFdmVudDxUZXJtaW5hbFNoZWxsVHlwZSB8IHVuZGVmaW5lZD47XG5cdGdldFNoZWxsVHlwZSh0aXRsZTogc3RyaW5nKTogVGVybWluYWxTaGVsbFR5cGUgfCB1bmRlZmluZWQ7XG5cdGdldFNoZWxsTmFtZSgpOiBQcm9taXNlPHN0cmluZz47XG59XG5cbmNvbnN0IFNIRUxMX0VYRUNVVEFCTEVTID0gW1xuXHQnY21kLmV4ZScsXG5cdCdwb3dlcnNoZWxsLmV4ZScsXG5cdCdwd3NoLmV4ZScsXG5cdCdiYXNoLmV4ZScsXG5cdCdnaXQtY21kLmV4ZScsXG5cdCd3c2wuZXhlJyxcblx0J3VidW50dS5leGUnLFxuXHQndWJ1bnR1MTgwNC5leGUnLFxuXHQna2FsaS5leGUnLFxuXHQnZGViaWFuLmV4ZScsXG5cdCdvcGVuc3VzZS00Mi5leGUnLFxuXHQnc2xlcy0xMi5leGUnLFxuXHQnanVsaWEuZXhlJyxcblx0J251LmV4ZScsXG5cdCdub2RlLmV4ZScsXG5cdCd4b25zaC5leGUnLFxuXTtcblxuY29uc3QgU0hFTExfRVhFQ1VUQUJMRV9SRUdFWEVTID0gW1xuXHQvXnB5dGhvbihcXGQoXFwuXFxkezAsMn0pPyk/XFwuZXhlJC8sXG5dO1xuXG4vKipcbiAqIG5wbS1pbnN0YWxsZWQgYWdlbnQgQ0xJcyBhcHBlYXIgaW4gdGhlIHByb2Nlc3MgdHJlZSBhcyBwbGFpbiBgbm9kZS5leGVgLCBzbyB3ZSBpZGVudGlmeVxuICogdGhlbSBieSBtYXRjaGluZyB0aGUgcGFja2FnZSBmb2xkZXIgaW4gbm9kZSdzIGNvbW1hbmQgbGluZS5cbiAqL1xuY29uc3QgTk9ERV9BR0VOVF9DTElfUEFUVEVSTlM6IFJlYWRvbmx5QXJyYXk8eyByZWdleDogUmVnRXhwOyBleGVjdXRhYmxlOiBzdHJpbmcgfT4gPSBbXG5cdHsgcmVnZXg6IC9bXFxcXC9dY2xhdWRlLWNvZGVbXFxcXC9dL2ksIGV4ZWN1dGFibGU6ICdjbGF1ZGUuZXhlJyB9LFxuXHR7IHJlZ2V4OiAvW1xcXFwvXWNvZGV4W1xcXFwvXS9pLCBleGVjdXRhYmxlOiAnY29kZXguZXhlJyB9LFxuXHR7IHJlZ2V4OiAvW1xcXFwvXWNvbW1hbmQtY29kZVtcXFxcL10vaSwgZXhlY3V0YWJsZTogJ2NvbW1hbmRjb2RlLmV4ZScgfSxcblx0eyByZWdleDogL1tcXFxcL11jb3BpbG90W1xcXFwvXS9pLCBleGVjdXRhYmxlOiAnY29waWxvdC5leGUnIH0sXG5cdHsgcmVnZXg6IC9bXFxcXC9dZ2VtaW5pLWNsaVtcXFxcL10vaSwgZXhlY3V0YWJsZTogJ2dlbWluaS5leGUnIH0sXG5dO1xuXG5sZXQgd2luZG93c1Byb2Nlc3NUcmVlOiB0eXBlb2YgV2luZG93c1Byb2Nlc3NUcmVlVHlwZTtcblxuZXhwb3J0IGNsYXNzIFdpbmRvd3NTaGVsbEhlbHBlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV2luZG93c1NoZWxsSGVscGVyIHtcblx0cHJpdmF0ZSBfY3VycmVudFJlcXVlc3Q6IFByb21pc2U8c3RyaW5nPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2hlbGxUeXBlOiBUZXJtaW5hbFNoZWxsVHlwZSB8IHVuZGVmaW5lZDtcblx0Z2V0IHNoZWxsVHlwZSgpOiBUZXJtaW5hbFNoZWxsVHlwZSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9zaGVsbFR5cGU7IH1cblx0cHJpdmF0ZSBfc2hlbGxUaXRsZTogc3RyaW5nID0gJyc7XG5cdGdldCBzaGVsbFRpdGxlKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLl9zaGVsbFRpdGxlOyB9XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uU2hlbGxOYW1lQ2hhbmdlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdGdldCBvblNoZWxsTmFtZUNoYW5nZWQoKTogRXZlbnQ8c3RyaW5nPiB7IHJldHVybiB0aGlzLl9vblNoZWxsTmFtZUNoYW5nZWQuZXZlbnQ7IH1cblx0cHJpdmF0ZSByZWFkb25seSBfb25TaGVsbFR5cGVDaGFuZ2VkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VGVybWluYWxTaGVsbFR5cGUgfCB1bmRlZmluZWQ+KCkpO1xuXHRnZXQgb25TaGVsbFR5cGVDaGFuZ2VkKCk6IEV2ZW50PFRlcm1pbmFsU2hlbGxUeXBlIHwgdW5kZWZpbmVkPiB7IHJldHVybiB0aGlzLl9vblNoZWxsVHlwZUNoYW5nZWQuZXZlbnQ7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIF9yb290UHJvY2Vzc0lkOiBudW1iZXJcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFdpbmRvd3NTaGVsbEhlbHBlciBjYW5ub3QgYmUgaW5zdGFudGlhdGVkIG9uICR7cGxhdGZvcm19YCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RhcnRNb25pdG9yaW5nU2hlbGwoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3N0YXJ0TW9uaXRvcmluZ1NoZWxsKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuY2hlY2tTaGVsbCgpO1xuXHR9XG5cblx0QGRlYm91bmNlKDUwMClcblx0YXN5bmMgY2hlY2tTaGVsbCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHQvLyBXYWl0IHRvIGdpdmUgdGhlIHNoZWxsIHNvbWUgdGltZSB0byBhY3R1YWxseSBsYXVuY2ggYSBwcm9jZXNzLCB0aGlzXG5cdFx0XHQvLyBjb3VsZCBsZWFkIHRvIGEgcmFjZSBjb25kaXRpb24gYnV0IGl0IHdvdWxkIGJlIHJlY292ZXJlZCBmcm9tIHdoZW5cblx0XHRcdC8vIGRhdGEgc3RvcHMgYW5kIHNob3VsZCBjb3ZlciB0aGUgbWFqb3JpdHkgb2YgY2FzZXNcblx0XHRcdGF3YWl0IHRpbWVvdXQoMzAwKTtcblx0XHRcdHRoaXMuZ2V0U2hlbGxOYW1lKCkudGhlbih0aXRsZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHR5cGUgPSB0aGlzLmdldFNoZWxsVHlwZSh0aXRsZSk7XG5cdFx0XHRcdGlmICh0eXBlICE9PSB0aGlzLl9zaGVsbFR5cGUpIHtcblx0XHRcdFx0XHR0aGlzLl9vblNoZWxsVHlwZUNoYW5nZWQuZmlyZSh0eXBlKTtcblx0XHRcdFx0XHR0aGlzLl9vblNoZWxsTmFtZUNoYW5nZWQuZmlyZSh0aXRsZSk7XG5cdFx0XHRcdFx0dGhpcy5fc2hlbGxUeXBlID0gdHlwZTtcblx0XHRcdFx0XHR0aGlzLl9zaGVsbFRpdGxlID0gdGl0bGU7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdHJhdmVyc2VUcmVlKHRyZWU6IFdpbmRvd3NQcm9jZXNzVHJlZVR5cGUuSVByb2Nlc3NUcmVlTm9kZSB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0aWYgKCF0cmVlKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdC8vIERldGVjdCBucG0taW5zdGFsbGVkIGFnZW50IENMSXMgcnVubmluZyBpbnNpZGUgYG5vZGUuZXhlYCBieSBpbnNwZWN0aW5nIHRoZSBjb21tYW5kIGxpbmVcblx0XHQvLyBwYXNzZWQgdG8gTm9kZS4gV2l0aG91dCB0aGlzIHdlJ2QgdHJlYXQgdGhlbSBhcyBhIGdlbmVyaWMgTm9kZSBzaGVsbC5cblx0XHRpZiAodHJlZS5uYW1lID09PSAnbm9kZS5leGUnICYmIHRyZWUuY29tbWFuZExpbmUpIHtcblx0XHRcdGZvciAoY29uc3QgeyByZWdleCwgZXhlY3V0YWJsZSB9IG9mIE5PREVfQUdFTlRfQ0xJX1BBVFRFUk5TKSB7XG5cdFx0XHRcdGlmIChyZWdleC50ZXN0KHRyZWUuY29tbWFuZExpbmUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGV4ZWN1dGFibGU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKFNIRUxMX0VYRUNVVEFCTEVTLmluZGV4T2YodHJlZS5uYW1lKSA9PT0gLTEpIHtcblx0XHRcdHJldHVybiB0cmVlLm5hbWU7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgcmVnZXggb2YgU0hFTExfRVhFQ1VUQUJMRV9SRUdFWEVTKSB7XG5cdFx0XHRpZiAodHJlZS5uYW1lLm1hdGNoKHJlZ2V4KSkge1xuXHRcdFx0XHRyZXR1cm4gdHJlZS5uYW1lO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIXRyZWUuY2hpbGRyZW4gfHwgdHJlZS5jaGlsZHJlbi5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB0cmVlLm5hbWU7XG5cdFx0fVxuXHRcdGxldCBmYXZvdXJpdGVDaGlsZCA9IDA7XG5cdFx0Zm9yICg7IGZhdm91cml0ZUNoaWxkIDwgdHJlZS5jaGlsZHJlbi5sZW5ndGg7IGZhdm91cml0ZUNoaWxkKyspIHtcblx0XHRcdGNvbnN0IGNoaWxkID0gdHJlZS5jaGlsZHJlbltmYXZvdXJpdGVDaGlsZF07XG5cdFx0XHRpZiAoIWNoaWxkLmNoaWxkcmVuIHx8IGNoaWxkLmNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmIChjaGlsZC5jaGlsZHJlblswXS5uYW1lICE9PSAnY29uaG9zdC5leGUnKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoZmF2b3VyaXRlQ2hpbGQgPj0gdHJlZS5jaGlsZHJlbi5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB0cmVlLm5hbWU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnRyYXZlcnNlVHJlZSh0cmVlLmNoaWxkcmVuW2Zhdm91cml0ZUNoaWxkXSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgaW5uZXJtb3N0IHNoZWxsIGV4ZWN1dGFibGUgcnVubmluZyBpbiB0aGUgdGVybWluYWxcblx0ICovXG5cdGFzeW5jIGdldFNoZWxsTmFtZSgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCcnKTtcblx0XHR9XG5cdFx0Ly8gUHJldmVudCBtdWx0aXBsZSByZXF1ZXN0cyBhdCBvbmNlLCBpbnN0ZWFkIHJldHVybiBjdXJyZW50IHJlcXVlc3Rcblx0XHRpZiAodGhpcy5fY3VycmVudFJlcXVlc3QpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jdXJyZW50UmVxdWVzdDtcblx0XHR9XG5cdFx0aWYgKCF3aW5kb3dzUHJvY2Vzc1RyZWUpIHtcblx0XHRcdHdpbmRvd3NQcm9jZXNzVHJlZSA9IGF3YWl0IGltcG9ydCgnQHZzY29kZS93aW5kb3dzLXByb2Nlc3MtdHJlZScpO1xuXHRcdH1cblx0XHR0aGlzLl9jdXJyZW50UmVxdWVzdCA9IG5ldyBQcm9taXNlPHN0cmluZz4ocmVzb2x2ZSA9PiB7XG5cdFx0XHR3aW5kb3dzUHJvY2Vzc1RyZWUuZ2V0UHJvY2Vzc1RyZWUodGhpcy5fcm9vdFByb2Nlc3NJZCwgdHJlZSA9PiB7XG5cdFx0XHRcdGNvbnN0IG5hbWUgPSB0aGlzLnRyYXZlcnNlVHJlZSh0cmVlKTtcblx0XHRcdFx0dGhpcy5fY3VycmVudFJlcXVlc3QgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHJlc29sdmUobmFtZSk7XG5cdFx0XHR9LCB3aW5kb3dzUHJvY2Vzc1RyZWUuUHJvY2Vzc0RhdGFGbGFnLkNvbW1hbmRMaW5lKTtcblx0XHR9KTtcblx0XHRyZXR1cm4gdGhpcy5fY3VycmVudFJlcXVlc3Q7XG5cdH1cblxuXHRnZXRTaGVsbFR5cGUoZXhlY3V0YWJsZTogc3RyaW5nKTogVGVybWluYWxTaGVsbFR5cGUgfCB1bmRlZmluZWQge1xuXHRcdHN3aXRjaCAoZXhlY3V0YWJsZS50b0xvd2VyQ2FzZSgpKSB7XG5cdFx0XHRjYXNlICdjbWQuZXhlJzpcblx0XHRcdFx0cmV0dXJuIFdpbmRvd3NTaGVsbFR5cGUuQ29tbWFuZFByb21wdDtcblx0XHRcdGNhc2UgJ3Bvd2Vyc2hlbGwuZXhlJzpcblx0XHRcdGNhc2UgJ3B3c2guZXhlJzpcblx0XHRcdFx0cmV0dXJuIEdlbmVyYWxTaGVsbFR5cGUuUG93ZXJTaGVsbDtcblx0XHRcdGNhc2UgJ2Jhc2guZXhlJzpcblx0XHRcdGNhc2UgJ2dpdC1jbWQuZXhlJzpcblx0XHRcdFx0cmV0dXJuIFdpbmRvd3NTaGVsbFR5cGUuR2l0QmFzaDtcblx0XHRcdGNhc2UgJ2p1bGlhLmV4ZSc6XG5cdFx0XHRcdHJldHVybiBHZW5lcmFsU2hlbGxUeXBlLkp1bGlhO1xuXHRcdFx0Y2FzZSAnbm9kZS5leGUnOlxuXHRcdFx0XHRyZXR1cm4gR2VuZXJhbFNoZWxsVHlwZS5Ob2RlO1xuXHRcdFx0Y2FzZSAnbnUuZXhlJzpcblx0XHRcdFx0cmV0dXJuIEdlbmVyYWxTaGVsbFR5cGUuTnVTaGVsbDtcblx0XHRcdGNhc2UgJ3hvbnNoLmV4ZSc6XG5cdFx0XHRcdHJldHVybiBHZW5lcmFsU2hlbGxUeXBlLlhvbnNoO1xuXHRcdFx0Y2FzZSAnY2xhdWRlLmV4ZSc6XG5cdFx0XHRcdHJldHVybiBHZW5lcmFsU2hlbGxUeXBlLkNsYXVkZTtcblx0XHRcdGNhc2UgJ2NvZGV4LmV4ZSc6XG5cdFx0XHRcdHJldHVybiBHZW5lcmFsU2hlbGxUeXBlLkNvZGV4O1xuXHRcdFx0Y2FzZSAnY29tbWFuZGNvZGUuZXhlJzpcblx0XHRcdFx0cmV0dXJuIEdlbmVyYWxTaGVsbFR5cGUuQ29tbWFuZENvZGU7XG5cdFx0XHRjYXNlICdjb3BpbG90LmV4ZSc6XG5cdFx0XHRcdHJldHVybiBHZW5lcmFsU2hlbGxUeXBlLkNvcGlsb3Q7XG5cdFx0XHRjYXNlICdnZW1pbmkuZXhlJzpcblx0XHRcdFx0cmV0dXJuIEdlbmVyYWxTaGVsbFR5cGUuR2VtaW5pO1xuXHRcdFx0Y2FzZSAnd3NsLmV4ZSc6XG5cdFx0XHRjYXNlICd1YnVudHUuZXhlJzpcblx0XHRcdGNhc2UgJ3VidW50dTE4MDQuZXhlJzpcblx0XHRcdGNhc2UgJ2thbGkuZXhlJzpcblx0XHRcdGNhc2UgJ2RlYmlhbi5leGUnOlxuXHRcdFx0Y2FzZSAnb3BlbnN1c2UtNDIuZXhlJzpcblx0XHRcdGNhc2UgJ3NsZXMtMTIuZXhlJzpcblx0XHRcdFx0cmV0dXJuIFdpbmRvd3NTaGVsbFR5cGUuV3NsO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0aWYgKGV4ZWN1dGFibGUubWF0Y2goL3B5dGhvbihcXGQoXFwuXFxkezAsMn0pPyk/XFwuZXhlLykpIHtcblx0XHRcdFx0XHRyZXR1cm4gR2VuZXJhbFNoZWxsVHlwZS5QeXRob247XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGtCQUErQjtBQUN4QyxTQUFTLFdBQVcsZ0JBQWdCO0FBQ3BDLFNBQVMsa0JBQXFDLHdCQUF3QjtBQVV0RSxNQUFNLG9CQUFvQjtBQUFBLEVBQ3pCO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQ0Q7QUFFQSxNQUFNLDJCQUEyQjtBQUFBLEVBQ2hDO0FBQ0Q7QUFNQSxNQUFNLDBCQUFnRjtBQUFBLEVBQ3JGLEVBQUUsT0FBTywwQkFBMEIsWUFBWSxhQUFhO0FBQUEsRUFDNUQs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
