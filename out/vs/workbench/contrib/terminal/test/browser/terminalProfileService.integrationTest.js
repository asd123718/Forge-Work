import { deepStrictEqual } from "assert";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { isLinux, isWindows, OperatingSystem } from "../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { TestThemeService } from "../../../../../platform/theme/test/common/testThemeService.js";
import { ITerminalInstanceService } from "../../browser/terminal.js";
import { TerminalProfileQuickpick } from "../../browser/terminalProfileQuickpick.js";
import { TerminalProfileService } from "../../browser/terminalProfileService.js";
import { ITerminalProfileService } from "../../common/terminal.js";
import { ITerminalContributionService } from "../../common/terminalExtensionPoints.js";
import { IWorkbenchEnvironmentService } from "../../../../services/environment/common/environmentService.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { IRemoteAgentService } from "../../../../services/remote/common/remoteAgentService.js";
import { workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
import { TestExtensionService } from "../../../../test/common/workbenchTestServices.js";
class TestTerminalProfileService extends TerminalProfileService {
  refreshAvailableProfiles() {
    this.hasRefreshedProfiles = this._refreshAvailableProfilesNow();
  }
  refreshAndAwaitAvailableProfiles() {
    this.refreshAvailableProfiles();
    if (!this.hasRefreshedProfiles) {
      throw new Error("has not refreshed profiles yet");
    }
    return this.hasRefreshedProfiles;
  }
}
class MockTerminalProfileService {
  constructor() {
    this.availableProfiles = [];
    this.contributedProfiles = [];
  }
  async getPlatformKey() {
    return "linux";
  }
  getDefaultProfileName() {
    return this._defaultProfileName;
  }
  setProfiles(profiles, contributed) {
    this.availableProfiles = profiles;
    this.contributedProfiles = contributed;
  }
  setDefaultProfileName(name) {
    this._defaultProfileName = name;
  }
}
class MockQuickInputService {
  constructor() {
    this._pick = powershellPick;
  }
  async pick(picks, options, token) {
    Promise.resolve(picks);
    return this._pick;
  }
  setPick(pick) {
    this._pick = pick;
  }
}
class TestTerminalProfileQuickpick extends TerminalProfileQuickpick {
}
class TestTerminalExtensionService extends TestExtensionService {
  constructor() {
    super(...arguments);
    this._onDidChangeExtensions = new Emitter();
  }
}
class TestTerminalContributionService {
  constructor() {
    this.terminalProfiles = [];
    this.terminalCompletionProviders = [];
    this._onDidChangeTerminalCompletionProviders = new Emitter();
    this.onDidChangeTerminalCompletionProviders = this._onDidChangeTerminalCompletionProviders.event;
  }
  setProfiles(profiles) {
    this.terminalProfiles = profiles;
  }
}
class TestTerminalInstanceService {
  constructor() {
    this._profiles = /* @__PURE__ */ new Map();
    this._hasReturnedNone = true;
  }
  async getBackend(remoteAuthority) {
    return {
      getProfiles: async () => {
        if (this._hasReturnedNone) {
          return this._profiles.get(remoteAuthority ?? "") || [];
        } else {
          this._hasReturnedNone = true;
          return [];
        }
      }
    };
  }
  setProfiles(remoteAuthority, profiles) {
    this._profiles.set(remoteAuthority ?? "", profiles);
  }
  setReturnNone() {
    this._hasReturnedNone = false;
  }
}
class TestRemoteAgentService {
  setEnvironment(os) {
    this._os = os;
  }
  async getEnvironment() {
    return { os: this._os };
  }
}
const defaultTerminalConfig = { profiles: { windows: {}, linux: {}, osx: {} } };
let powershellProfile = {
  profileName: "PowerShell",
  path: "C:\\Powershell.exe",
  isDefault: true,
  icon: Codicon.terminalPowershell
};
let jsdebugProfile = {
  extensionIdentifier: "ms-vscode.js-debug-nightly",
  icon: "debug",
  id: "extension.js-debug.debugTerminal",
  title: "JavaScript Debug Terminal"
};
const powershellPick = { label: "Powershell", profile: powershellProfile, profileName: powershellProfile.profileName };
const jsdebugPick = { label: "Javascript Debug Terminal", profile: jsdebugProfile, profileName: jsdebugProfile.title };
suite("TerminalProfileService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let configurationService;
  let terminalInstanceService;
  let terminalProfileService;
  let remoteAgentService;
  let extensionService;
  let instantiationService;
  setup(async () => {
    configurationService = new TestConfigurationService({
      files: {},
      terminal: {
        integrated: defaultTerminalConfig
      }
    });
    instantiationService = workbenchInstantiationService({
      configurationService: () => configurationService
    }, store);
    remoteAgentService = new TestRemoteAgentService();
    terminalInstanceService = new TestTerminalInstanceService();
    extensionService = new TestTerminalExtensionService();
    const themeService = new TestThemeService();
    const terminalContributionService = new TestTerminalContributionService();
    instantiationService.stub(IExtensionService, extensionService);
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IRemoteAgentService, remoteAgentService);
    instantiationService.stub(ITerminalContributionService, terminalContributionService);
    instantiationService.stub(ITerminalInstanceService, terminalInstanceService);
    instantiationService.stub(IWorkbenchEnvironmentService, { remoteAuthority: void 0 });
    instantiationService.stub(IThemeService, themeService);
    terminalProfileService = store.add(instantiationService.createInstance(TestTerminalProfileService));
    powershellProfile = {
      profileName: "PowerShell",
      path: "C:\\Powershell.exe",
      isDefault: true,
      icon: Codicon.terminalPowershell
    };
    jsdebugProfile = {
      extensionIdentifier: "ms-vscode.js-debug-nightly",
      icon: "debug",
      id: "extension.js-debug.debugTerminal",
      title: "JavaScript Debug Terminal"
    };
    terminalInstanceService.setProfiles(void 0, [powershellProfile]);
    terminalInstanceService.setProfiles("fakeremote", []);
    terminalContributionService.setProfiles([jsdebugProfile]);
    if (isWindows) {
      remoteAgentService.setEnvironment(OperatingSystem.Windows);
    } else if (isLinux) {
      remoteAgentService.setEnvironment(OperatingSystem.Linux);
    } else {
      remoteAgentService.setEnvironment(OperatingSystem.Macintosh);
    }
    configurationService.setUserConfiguration("terminal", { integrated: defaultTerminalConfig });
  });
  suite("Contributed Profiles", () => {
    test("should filter out contributed profiles set to null (Linux)", async () => {
      remoteAgentService.setEnvironment(OperatingSystem.Linux);
      await configurationService.setUserConfiguration("terminal", {
        integrated: {
          profiles: {
            linux: {
              "JavaScript Debug Terminal": null
            }
          }
        }
      });
      configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true, source: ConfigurationTarget.USER });
      await terminalProfileService.refreshAndAwaitAvailableProfiles();
      deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
      deepStrictEqual(terminalProfileService.contributedProfiles, []);
    });
    test("should filter out contributed profiles set to null (Windows)", async () => {
      remoteAgentService.setEnvironment(OperatingSystem.Windows);
      await configurationService.setUserConfiguration("terminal", {
        integrated: {
          profiles: {
            windows: {
              "JavaScript Debug Terminal": null
            }
          }
        }
      });
      configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true, source: ConfigurationTarget.USER });
      await terminalProfileService.refreshAndAwaitAvailableProfiles();
      deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
      deepStrictEqual(terminalProfileService.contributedProfiles, []);
    });
    test("should filter out contributed profiles set to null (macOS)", async () => {
      remoteAgentService.setEnvironment(OperatingSystem.Macintosh);
      await configurationService.setUserConfiguration("terminal", {
        integrated: {
          profiles: {
            osx: {
              "JavaScript Debug Terminal": null
            }
          }
        }
      });
      configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true, source: ConfigurationTarget.USER });
      await terminalProfileService.refreshAndAwaitAvailableProfiles();
      deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
      deepStrictEqual(terminalProfileService.contributedProfiles, []);
    });
    test("should include contributed profiles", async () => {
      await terminalProfileService.refreshAndAwaitAvailableProfiles();
      deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
      deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
    });
  });
  test("should get profiles from remoteTerminalService when there is a remote authority", async () => {
    instantiationService.stub(IWorkbenchEnvironmentService, { remoteAuthority: "fakeremote" });
    terminalProfileService = store.add(instantiationService.createInstance(TestTerminalProfileService));
    await terminalProfileService.hasRefreshedProfiles;
    deepStrictEqual(terminalProfileService.availableProfiles, []);
    deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
    terminalInstanceService.setProfiles("fakeremote", [powershellProfile]);
    await terminalProfileService.refreshAndAwaitAvailableProfiles();
    deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
    deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
  });
  test("should fire onDidChangeAvailableProfiles only when available profiles have changed via user config", async () => {
    powershellProfile.icon = Codicon.lightBulb;
    let calls = [];
    store.add(terminalProfileService.onDidChangeAvailableProfiles((e) => calls.push(e)));
    await configurationService.setUserConfiguration("terminal", {
      integrated: {
        profiles: {
          windows: powershellProfile,
          linux: powershellProfile,
          osx: powershellProfile
        }
      }
    });
    await terminalProfileService.hasRefreshedProfiles;
    deepStrictEqual(calls, [
      [powershellProfile]
    ]);
    deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
    deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
    calls = [];
    await terminalProfileService.refreshAndAwaitAvailableProfiles();
    deepStrictEqual(calls, []);
  });
  test("should fire onDidChangeAvailableProfiles when available or contributed profiles have changed via remote/localTerminalService", async () => {
    powershellProfile.isDefault = false;
    terminalInstanceService.setProfiles(void 0, [powershellProfile]);
    const calls = [];
    store.add(terminalProfileService.onDidChangeAvailableProfiles((e) => calls.push(e)));
    await terminalProfileService.hasRefreshedProfiles;
    deepStrictEqual(calls, [
      [powershellProfile]
    ]);
    deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
    deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
  });
  test("should call refreshAvailableProfiles _onDidChangeExtensions", async () => {
    extensionService._onDidChangeExtensions.fire();
    const calls = [];
    store.add(terminalProfileService.onDidChangeAvailableProfiles((e) => calls.push(e)));
    await terminalProfileService.hasRefreshedProfiles;
    deepStrictEqual(calls, [
      [powershellProfile]
    ]);
    deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
    deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
  });
  suite("Profiles Quickpick", () => {
    let quickInputService;
    let mockTerminalProfileService;
    let terminalProfileQuickpick;
    setup(async () => {
      quickInputService = new MockQuickInputService();
      mockTerminalProfileService = new MockTerminalProfileService();
      instantiationService.stub(IQuickInputService, quickInputService);
      instantiationService.stub(ITerminalProfileService, mockTerminalProfileService);
      terminalProfileQuickpick = instantiationService.createInstance(TestTerminalProfileQuickpick);
    });
    test("setDefault", async () => {
      powershellProfile.isDefault = false;
      mockTerminalProfileService.setProfiles([powershellProfile], [jsdebugProfile]);
      mockTerminalProfileService.setDefaultProfileName(jsdebugProfile.title);
      const result = await terminalProfileQuickpick.showAndGetResult("setDefault");
      deepStrictEqual(result, powershellProfile.profileName);
    });
    test("setDefault to contributed", async () => {
      mockTerminalProfileService.setDefaultProfileName(powershellProfile.profileName);
      quickInputService.setPick(jsdebugPick);
      const result = await terminalProfileQuickpick.showAndGetResult("setDefault");
      const expected = {
        config: {
          extensionIdentifier: jsdebugProfile.extensionIdentifier,
          id: jsdebugProfile.id,
          options: { color: void 0, icon: "debug" },
          title: jsdebugProfile.title
        },
        keyMods: void 0
      };
      deepStrictEqual(result, expected);
    });
    test("createInstance", async () => {
      mockTerminalProfileService.setDefaultProfileName(powershellProfile.profileName);
      const pick = { ...powershellPick, keyMods: { alt: true, ctrlCmd: false, shift: false } };
      quickInputService.setPick(pick);
      const result = await terminalProfileQuickpick.showAndGetResult("createInstance");
      deepStrictEqual(result, { config: powershellProfile, keyMods: { alt: true, ctrlCmd: false, shift: false } });
    });
    test("createInstance with contributed", async () => {
      const pick = { ...jsdebugPick, keyMods: { alt: true, ctrlCmd: false, shift: true } };
      quickInputService.setPick(pick);
      const result = await terminalProfileQuickpick.showAndGetResult("createInstance");
      const expected = {
        config: {
          extensionIdentifier: jsdebugProfile.extensionIdentifier,
          id: jsdebugProfile.id,
          options: { color: void 0, icon: "debug" },
          title: jsdebugProfile.title
        },
        keyMods: { alt: true, ctrlCmd: false, shift: true }
      };
      deepStrictEqual(result, expected);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFx0ZXN0XFxicm93c2VyXFx0ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLmludGVncmF0aW9uVGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGlzTGludXgsIGlzV2luZG93cywgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UsIHR5cGUgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSVBpY2tPcHRpb25zLCBJUXVpY2tJbnB1dFNlcnZpY2UsIE9taXQsIFF1aWNrUGlja0lucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRFbnZpcm9ubWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRFbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uVGVybWluYWxQcm9maWxlLCBJVGVybWluYWxCYWNrZW5kLCBJVGVybWluYWxQcm9maWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS90ZXN0L2NvbW1vbi90ZXN0VGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbEluc3RhbmNlU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVByb2ZpbGVRdWlja1BpY2tJdGVtLCBUZXJtaW5hbFByb2ZpbGVRdWlja3BpY2sgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rlcm1pbmFsUHJvZmlsZVF1aWNrcGljay5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENvbmZpZ3VyYXRpb24sIElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENvbnRyaWJ1dGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdGVybWluYWxFeHRlbnNpb25Qb2ludHMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgVGVzdEV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHR5cGUgeyBTaW5nbGVPck1hbnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5cbmNsYXNzIFRlc3RUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlIGV4dGVuZHMgVGVybWluYWxQcm9maWxlU2VydmljZSBpbXBsZW1lbnRzIFBhcnRpYWw8SVRlcm1pbmFsUHJvZmlsZVNlcnZpY2U+IHtcblx0aGFzUmVmcmVzaGVkUHJvZmlsZXM6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdG92ZXJyaWRlIHJlZnJlc2hBdmFpbGFibGVQcm9maWxlcygpOiB2b2lkIHtcblx0XHR0aGlzLmhhc1JlZnJlc2hlZFByb2ZpbGVzID0gdGhpcy5fcmVmcmVzaEF2YWlsYWJsZVByb2ZpbGVzTm93KCk7XG5cdH1cblx0cmVmcmVzaEFuZEF3YWl0QXZhaWxhYmxlUHJvZmlsZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5yZWZyZXNoQXZhaWxhYmxlUHJvZmlsZXMoKTtcblx0XHRpZiAoIXRoaXMuaGFzUmVmcmVzaGVkUHJvZmlsZXMpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignaGFzIG5vdCByZWZyZXNoZWQgcHJvZmlsZXMgeWV0Jyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmhhc1JlZnJlc2hlZFByb2ZpbGVzO1xuXHR9XG59XG5cbmNsYXNzIE1vY2tUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlIGltcGxlbWVudHMgUGFydGlhbDxJVGVybWluYWxQcm9maWxlU2VydmljZT4ge1xuXHRoYXNSZWZyZXNoZWRQcm9maWxlczogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0X2RlZmF1bHRQcm9maWxlTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRhdmFpbGFibGVQcm9maWxlcz86IElUZXJtaW5hbFByb2ZpbGVbXSB8IHVuZGVmaW5lZCA9IFtdO1xuXHRjb250cmlidXRlZFByb2ZpbGVzPzogSUV4dGVuc2lvblRlcm1pbmFsUHJvZmlsZVtdIHwgdW5kZWZpbmVkID0gW107XG5cdGFzeW5jIGdldFBsYXRmb3JtS2V5KCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuICdsaW51eCc7XG5cdH1cblx0Z2V0RGVmYXVsdFByb2ZpbGVOYW1lKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2RlZmF1bHRQcm9maWxlTmFtZTtcblx0fVxuXHRzZXRQcm9maWxlcyhwcm9maWxlczogSVRlcm1pbmFsUHJvZmlsZVtdLCBjb250cmlidXRlZDogSUV4dGVuc2lvblRlcm1pbmFsUHJvZmlsZVtdKTogdm9pZCB7XG5cdFx0dGhpcy5hdmFpbGFibGVQcm9maWxlcyA9IHByb2ZpbGVzO1xuXHRcdHRoaXMuY29udHJpYnV0ZWRQcm9maWxlcyA9IGNvbnRyaWJ1dGVkO1xuXHR9XG5cdHNldERlZmF1bHRQcm9maWxlTmFtZShuYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9kZWZhdWx0UHJvZmlsZU5hbWUgPSBuYW1lO1xuXHR9XG59XG5cblxuY2xhc3MgTW9ja1F1aWNrSW5wdXRTZXJ2aWNlIGltcGxlbWVudHMgUGFydGlhbDxJUXVpY2tJbnB1dFNlcnZpY2U+IHtcblx0X3BpY2s6IElQcm9maWxlUXVpY2tQaWNrSXRlbSA9IHBvd2Vyc2hlbGxQaWNrO1xuXHRwaWNrKHBpY2tzOiBRdWlja1BpY2tJbnB1dDxJUHJvZmlsZVF1aWNrUGlja0l0ZW0+W10gfCBQcm9taXNlPFF1aWNrUGlja0lucHV0PElQcm9maWxlUXVpY2tQaWNrSXRlbT5bXT4sIG9wdGlvbnM/OiBJUGlja09wdGlvbnM8SVByb2ZpbGVRdWlja1BpY2tJdGVtPiAmIHsgY2FuUGlja01hbnk6IHRydWUgfSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByb2ZpbGVRdWlja1BpY2tJdGVtW10gfCB1bmRlZmluZWQ+O1xuXHRwaWNrKHBpY2tzOiBRdWlja1BpY2tJbnB1dDxJUHJvZmlsZVF1aWNrUGlja0l0ZW0+W10gfCBQcm9taXNlPFF1aWNrUGlja0lucHV0PElQcm9maWxlUXVpY2tQaWNrSXRlbT5bXT4sIG9wdGlvbnM/OiBJUGlja09wdGlvbnM8SVByb2ZpbGVRdWlja1BpY2tJdGVtPiAmIHsgY2FuUGlja01hbnk6IGZhbHNlIH0sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcm9maWxlUXVpY2tQaWNrSXRlbSB8IHVuZGVmaW5lZD47XG5cdHBpY2socGlja3M6IFF1aWNrUGlja0lucHV0PElQcm9maWxlUXVpY2tQaWNrSXRlbT5bXSB8IFByb21pc2U8UXVpY2tQaWNrSW5wdXQ8SVByb2ZpbGVRdWlja1BpY2tJdGVtPltdPiwgb3B0aW9ucz86IE9taXQ8SVBpY2tPcHRpb25zPElQcm9maWxlUXVpY2tQaWNrSXRlbT4sICdjYW5QaWNrTWFueSc+LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJvZmlsZVF1aWNrUGlja0l0ZW0gfCB1bmRlZmluZWQ+O1xuXHRhc3luYyBwaWNrKHBpY2tzOiBhbnksIG9wdGlvbnM/OiBhbnksIHRva2VuPzogYW55KTogUHJvbWlzZTxTaW5nbGVPck1hbnk8SVByb2ZpbGVRdWlja1BpY2tJdGVtPiB8IHVuZGVmaW5lZD4ge1xuXHRcdFByb21pc2UucmVzb2x2ZShwaWNrcyk7XG5cdFx0cmV0dXJuIHRoaXMuX3BpY2s7XG5cdH1cblxuXHRzZXRQaWNrKHBpY2s6IElQcm9maWxlUXVpY2tQaWNrSXRlbSkge1xuXHRcdHRoaXMuX3BpY2sgPSBwaWNrO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RUZXJtaW5hbFByb2ZpbGVRdWlja3BpY2sgZXh0ZW5kcyBUZXJtaW5hbFByb2ZpbGVRdWlja3BpY2sge1xuXG59XG5cbmNsYXNzIFRlc3RUZXJtaW5hbEV4dGVuc2lvblNlcnZpY2UgZXh0ZW5kcyBUZXN0RXh0ZW5zaW9uU2VydmljZSB7XG5cdHJlYWRvbmx5IF9vbkRpZENoYW5nZUV4dGVuc2lvbnMgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xufVxuXG5jbGFzcyBUZXN0VGVybWluYWxDb250cmlidXRpb25TZXJ2aWNlIGltcGxlbWVudHMgSVRlcm1pbmFsQ29udHJpYnV0aW9uU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0dGVybWluYWxQcm9maWxlczogcmVhZG9ubHkgSUV4dGVuc2lvblRlcm1pbmFsUHJvZmlsZVtdID0gW107XG5cdHRlcm1pbmFsQ29tcGxldGlvblByb3ZpZGVyczogcmVhZG9ubHkgaW1wb3J0KCcuLi8uLi9jb21tb24vdGVybWluYWxFeHRlbnNpb25Qb2ludHMuanMnKS5JRXh0ZW5zaW9uVGVybWluYWxDb21wbGV0aW9uUHJvdmlkZXJbXSA9IFtdO1xuXHRwcml2YXRlIF9vbkRpZENoYW5nZVRlcm1pbmFsQ29tcGxldGlvblByb3ZpZGVycyA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVGVybWluYWxDb21wbGV0aW9uUHJvdmlkZXJzID0gdGhpcy5fb25EaWRDaGFuZ2VUZXJtaW5hbENvbXBsZXRpb25Qcm92aWRlcnMuZXZlbnQ7XG5cdHNldFByb2ZpbGVzKHByb2ZpbGVzOiBJRXh0ZW5zaW9uVGVybWluYWxQcm9maWxlW10pOiB2b2lkIHtcblx0XHR0aGlzLnRlcm1pbmFsUHJvZmlsZXMgPSBwcm9maWxlcztcblx0fVxufVxuXG5jbGFzcyBUZXN0VGVybWluYWxJbnN0YW5jZVNlcnZpY2UgaW1wbGVtZW50cyBQYXJ0aWFsPElUZXJtaW5hbEluc3RhbmNlU2VydmljZT4ge1xuXHRwcml2YXRlIF9wcm9maWxlczogTWFwPHN0cmluZywgSVRlcm1pbmFsUHJvZmlsZVtdPiA9IG5ldyBNYXAoKTtcblx0cHJpdmF0ZSBfaGFzUmV0dXJuZWROb25lID0gdHJ1ZTtcblx0YXN5bmMgZ2V0QmFja2VuZChyZW1vdGVBdXRob3JpdHk6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8SVRlcm1pbmFsQmFja2VuZD4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRnZXRQcm9maWxlczogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5faGFzUmV0dXJuZWROb25lKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb2ZpbGVzLmdldChyZW1vdGVBdXRob3JpdHkgPz8gJycpIHx8IFtdO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2hhc1JldHVybmVkTm9uZSA9IHRydWU7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBzYXRpc2ZpZXMgUGFydGlhbDxJVGVybWluYWxCYWNrZW5kPiBhcyB1bmtub3duIGFzIElUZXJtaW5hbEJhY2tlbmQ7XG5cdH1cblx0c2V0UHJvZmlsZXMocmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcgfCB1bmRlZmluZWQsIHByb2ZpbGVzOiBJVGVybWluYWxQcm9maWxlW10pIHtcblx0XHR0aGlzLl9wcm9maWxlcy5zZXQocmVtb3RlQXV0aG9yaXR5ID8/ICcnLCBwcm9maWxlcyk7XG5cdH1cblx0c2V0UmV0dXJuTm9uZSgpIHtcblx0XHR0aGlzLl9oYXNSZXR1cm5lZE5vbmUgPSBmYWxzZTtcblx0fVxufVxuXG5jbGFzcyBUZXN0UmVtb3RlQWdlbnRTZXJ2aWNlIGltcGxlbWVudHMgUGFydGlhbDxJUmVtb3RlQWdlbnRTZXJ2aWNlPiB7XG5cdHByaXZhdGUgX29zOiBPcGVyYXRpbmdTeXN0ZW0gfCB1bmRlZmluZWQ7XG5cdHNldEVudmlyb25tZW50KG9zOiBPcGVyYXRpbmdTeXN0ZW0pIHtcblx0XHR0aGlzLl9vcyA9IG9zO1xuXHR9XG5cdGFzeW5jIGdldEVudmlyb25tZW50KCk6IFByb21pc2U8SVJlbW90ZUFnZW50RW52aXJvbm1lbnQgfCBudWxsPiB7XG5cdFx0cmV0dXJuIHsgb3M6IHRoaXMuX29zIH0gc2F0aXNmaWVzIFBhcnRpYWw8SVJlbW90ZUFnZW50RW52aXJvbm1lbnQ+IGFzIHVua25vd24gYXMgSVJlbW90ZUFnZW50RW52aXJvbm1lbnQ7XG5cdH1cbn1cblxuY29uc3QgZGVmYXVsdFRlcm1pbmFsQ29uZmlnOiBQYXJ0aWFsPElUZXJtaW5hbENvbmZpZ3VyYXRpb24+ID0geyBwcm9maWxlczogeyB3aW5kb3dzOiB7fSwgbGludXg6IHt9LCBvc3g6IHt9IH0gfTtcbmxldCBwb3dlcnNoZWxsUHJvZmlsZSA9IHtcblx0cHJvZmlsZU5hbWU6ICdQb3dlclNoZWxsJyxcblx0cGF0aDogJ0M6XFxcXFBvd2Vyc2hlbGwuZXhlJyxcblx0aXNEZWZhdWx0OiB0cnVlLFxuXHRpY29uOiBDb2RpY29uLnRlcm1pbmFsUG93ZXJzaGVsbFxufTtcbmxldCBqc2RlYnVnUHJvZmlsZSA9IHtcblx0ZXh0ZW5zaW9uSWRlbnRpZmllcjogJ21zLXZzY29kZS5qcy1kZWJ1Zy1uaWdodGx5Jyxcblx0aWNvbjogJ2RlYnVnJyxcblx0aWQ6ICdleHRlbnNpb24uanMtZGVidWcuZGVidWdUZXJtaW5hbCcsXG5cdHRpdGxlOiAnSmF2YVNjcmlwdCBEZWJ1ZyBUZXJtaW5hbCdcbn07XG5jb25zdCBwb3dlcnNoZWxsUGljayA9IHsgbGFiZWw6ICdQb3dlcnNoZWxsJywgcHJvZmlsZTogcG93ZXJzaGVsbFByb2ZpbGUsIHByb2ZpbGVOYW1lOiBwb3dlcnNoZWxsUHJvZmlsZS5wcm9maWxlTmFtZSB9O1xuY29uc3QganNkZWJ1Z1BpY2sgPSB7IGxhYmVsOiAnSmF2YXNjcmlwdCBEZWJ1ZyBUZXJtaW5hbCcsIHByb2ZpbGU6IGpzZGVidWdQcm9maWxlLCBwcm9maWxlTmFtZToganNkZWJ1Z1Byb2ZpbGUudGl0bGUgfTtcblxuc3VpdGUoJ1Rlcm1pbmFsUHJvZmlsZVNlcnZpY2UnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGxldCB0ZXJtaW5hbEluc3RhbmNlU2VydmljZTogVGVzdFRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlO1xuXHRsZXQgdGVybWluYWxQcm9maWxlU2VydmljZTogVGVzdFRlcm1pbmFsUHJvZmlsZVNlcnZpY2U7XG5cdGxldCByZW1vdGVBZ2VudFNlcnZpY2U6IFRlc3RSZW1vdGVBZ2VudFNlcnZpY2U7XG5cdGxldCBleHRlbnNpb25TZXJ2aWNlOiBUZXN0VGVybWluYWxFeHRlbnNpb25TZXJ2aWNlO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdGZpbGVzOiB7fSxcblx0XHRcdHRlcm1pbmFsOiB7XG5cdFx0XHRcdGludGVncmF0ZWQ6IGRlZmF1bHRUZXJtaW5hbENvbmZpZ1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6ICgpID0+IGNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0fSwgc3RvcmUpO1xuXHRcdHJlbW90ZUFnZW50U2VydmljZSA9IG5ldyBUZXN0UmVtb3RlQWdlbnRTZXJ2aWNlKCk7XG5cdFx0dGVybWluYWxJbnN0YW5jZVNlcnZpY2UgPSBuZXcgVGVzdFRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlKCk7XG5cdFx0ZXh0ZW5zaW9uU2VydmljZSA9IG5ldyBUZXN0VGVybWluYWxFeHRlbnNpb25TZXJ2aWNlKCk7XG5cblx0XHRjb25zdCB0aGVtZVNlcnZpY2UgPSBuZXcgVGVzdFRoZW1lU2VydmljZSgpO1xuXHRcdGNvbnN0IHRlcm1pbmFsQ29udHJpYnV0aW9uU2VydmljZSA9IG5ldyBUZXN0VGVybWluYWxDb250cmlidXRpb25TZXJ2aWNlKCk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFeHRlbnNpb25TZXJ2aWNlLCBleHRlbnNpb25TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJlbW90ZUFnZW50U2VydmljZSwgcmVtb3RlQWdlbnRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbENvbnRyaWJ1dGlvblNlcnZpY2UsIHRlcm1pbmFsQ29udHJpYnV0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxJbnN0YW5jZVNlcnZpY2UsIHRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsIHsgcmVtb3RlQXV0aG9yaXR5OiB1bmRlZmluZWQgfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGhlbWVTZXJ2aWNlLCB0aGVtZVNlcnZpY2UpO1xuXG5cdFx0dGVybWluYWxQcm9maWxlU2VydmljZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VGVybWluYWxQcm9maWxlU2VydmljZSkpO1xuXG5cdFx0Ly9yZXNldCBhcyB0aGVzZSBwcm9wZXJ0aWVzIGFyZSBjaGFuZ2VkIGluIGVhY2ggdGVzdFxuXHRcdHBvd2Vyc2hlbGxQcm9maWxlID0ge1xuXHRcdFx0cHJvZmlsZU5hbWU6ICdQb3dlclNoZWxsJyxcblx0XHRcdHBhdGg6ICdDOlxcXFxQb3dlcnNoZWxsLmV4ZScsXG5cdFx0XHRpc0RlZmF1bHQ6IHRydWUsXG5cdFx0XHRpY29uOiBDb2RpY29uLnRlcm1pbmFsUG93ZXJzaGVsbFxuXHRcdH07XG5cdFx0anNkZWJ1Z1Byb2ZpbGUgPSB7XG5cdFx0XHRleHRlbnNpb25JZGVudGlmaWVyOiAnbXMtdnNjb2RlLmpzLWRlYnVnLW5pZ2h0bHknLFxuXHRcdFx0aWNvbjogJ2RlYnVnJyxcblx0XHRcdGlkOiAnZXh0ZW5zaW9uLmpzLWRlYnVnLmRlYnVnVGVybWluYWwnLFxuXHRcdFx0dGl0bGU6ICdKYXZhU2NyaXB0IERlYnVnIFRlcm1pbmFsJ1xuXHRcdH07XG5cblx0XHR0ZXJtaW5hbEluc3RhbmNlU2VydmljZS5zZXRQcm9maWxlcyh1bmRlZmluZWQsIFtwb3dlcnNoZWxsUHJvZmlsZV0pO1xuXHRcdHRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLnNldFByb2ZpbGVzKCdmYWtlcmVtb3RlJywgW10pO1xuXHRcdHRlcm1pbmFsQ29udHJpYnV0aW9uU2VydmljZS5zZXRQcm9maWxlcyhbanNkZWJ1Z1Byb2ZpbGVdKTtcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRyZW1vdGVBZ2VudFNlcnZpY2Uuc2V0RW52aXJvbm1lbnQoT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpO1xuXHRcdH0gZWxzZSBpZiAoaXNMaW51eCkge1xuXHRcdFx0cmVtb3RlQWdlbnRTZXJ2aWNlLnNldEVudmlyb25tZW50KE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlbW90ZUFnZW50U2VydmljZS5zZXRFbnZpcm9ubWVudChPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoKTtcblx0XHR9XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3Rlcm1pbmFsJywgeyBpbnRlZ3JhdGVkOiBkZWZhdWx0VGVybWluYWxDb25maWcgfSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdDb250cmlidXRlZCBQcm9maWxlcycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgZmlsdGVyIG91dCBjb250cmlidXRlZCBwcm9maWxlcyBzZXQgdG8gbnVsbCAoTGludXgpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmVtb3RlQWdlbnRTZXJ2aWNlLnNldEVudmlyb25tZW50KE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbigndGVybWluYWwnLCB7XG5cdFx0XHRcdGludGVncmF0ZWQ6IHtcblx0XHRcdFx0XHRwcm9maWxlczoge1xuXHRcdFx0XHRcdFx0bGludXg6IHtcblx0XHRcdFx0XHRcdFx0J0phdmFTY3JpcHQgRGVidWcgVGVybWluYWwnOiBudWxsXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIuZmlyZSh7IGFmZmVjdHNDb25maWd1cmF0aW9uOiAoKSA9PiB0cnVlLCBzb3VyY2U6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUiB9IHNhdGlzZmllcyBQYXJ0aWFsPElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQ+IGFzIHVua25vd24gYXMgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCk7XG5cdFx0XHRhd2FpdCB0ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLnJlZnJlc2hBbmRBd2FpdEF2YWlsYWJsZVByb2ZpbGVzKCk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwodGVybWluYWxQcm9maWxlU2VydmljZS5hdmFpbGFibGVQcm9maWxlcywgW3Bvd2Vyc2hlbGxQcm9maWxlXSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwodGVybWluYWxQcm9maWxlU2VydmljZS5jb250cmlidXRlZFByb2ZpbGVzLCBbXSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIGZpbHRlciBvdXQgY29udHJpYnV0ZWQgcHJvZmlsZXMgc2V0IHRvIG51bGwgKFdpbmRvd3MpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmVtb3RlQWdlbnRTZXJ2aWNlLnNldEVudmlyb25tZW50KE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKTtcblx0XHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCd0ZXJtaW5hbCcsIHtcblx0XHRcdFx0aW50ZWdyYXRlZDoge1xuXHRcdFx0XHRcdHByb2ZpbGVzOiB7XG5cdFx0XHRcdFx0XHR3aW5kb3dzOiB7XG5cdFx0XHRcdFx0XHRcdCdKYXZhU2NyaXB0IERlYnVnIFRlcm1pbmFsJzogbnVsbFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoeyBhZmZlY3RzQ29uZmlndXJhdGlvbjogKCkgPT4gdHJ1ZSwgc291cmNlOiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIgfSBzYXRpc2ZpZXMgUGFydGlhbDxJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50PiBhcyB1bmtub3duIGFzIElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQpO1xuXHRcdFx0YXdhaXQgdGVybWluYWxQcm9maWxlU2VydmljZS5yZWZyZXNoQW5kQXdhaXRBdmFpbGFibGVQcm9maWxlcygpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHRlcm1pbmFsUHJvZmlsZVNlcnZpY2UuYXZhaWxhYmxlUHJvZmlsZXMsIFtwb3dlcnNoZWxsUHJvZmlsZV0pO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHRlcm1pbmFsUHJvZmlsZVNlcnZpY2UuY29udHJpYnV0ZWRQcm9maWxlcywgW10pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBmaWx0ZXIgb3V0IGNvbnRyaWJ1dGVkIHByb2ZpbGVzIHNldCB0byBudWxsIChtYWNPUyknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZW1vdGVBZ2VudFNlcnZpY2Uuc2V0RW52aXJvbm1lbnQoT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCk7XG5cdFx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbigndGVybWluYWwnLCB7XG5cdFx0XHRcdGludGVncmF0ZWQ6IHtcblx0XHRcdFx0XHRwcm9maWxlczoge1xuXHRcdFx0XHRcdFx0b3N4OiB7XG5cdFx0XHRcdFx0XHRcdCdKYXZhU2NyaXB0IERlYnVnIFRlcm1pbmFsJzogbnVsbFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoeyBhZmZlY3RzQ29uZmlndXJhdGlvbjogKCkgPT4gdHJ1ZSwgc291cmNlOiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIgfSBzYXRpc2ZpZXMgUGFydGlhbDxJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50PiBhcyB1bmtub3duIGFzIElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQpO1xuXHRcdFx0YXdhaXQgdGVybWluYWxQcm9maWxlU2VydmljZS5yZWZyZXNoQW5kQXdhaXRBdmFpbGFibGVQcm9maWxlcygpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHRlcm1pbmFsUHJvZmlsZVNlcnZpY2UuYXZhaWxhYmxlUHJvZmlsZXMsIFtwb3dlcnNoZWxsUHJvZmlsZV0pO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHRlcm1pbmFsUHJvZmlsZVNlcnZpY2UuY29udHJpYnV0ZWRQcm9maWxlcywgW10pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBpbmNsdWRlIGNvbnRyaWJ1dGVkIHByb2ZpbGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgdGVybWluYWxQcm9maWxlU2VydmljZS5yZWZyZXNoQW5kQXdhaXRBdmFpbGFibGVQcm9maWxlcygpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHRlcm1pbmFsUHJvZmlsZVNlcnZpY2UuYXZhaWxhYmxlUHJvZmlsZXMsIFtwb3dlcnNoZWxsUHJvZmlsZV0pO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHRlcm1pbmFsUHJvZmlsZVNlcnZpY2UuY29udHJpYnV0ZWRQcm9maWxlcywgW2pzZGVidWdQcm9maWxlXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBnZXQgcHJvZmlsZXMgZnJvbSByZW1vdGVUZXJtaW5hbFNlcnZpY2Ugd2hlbiB0aGVyZSBpcyBhIHJlbW90ZSBhdXRob3JpdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLCB7IHJlbW90ZUF1dGhvcml0eTogJ2Zha2VyZW1vdGUnIH0pO1xuXHRcdHRlcm1pbmFsUHJvZmlsZVNlcnZpY2UgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFRlcm1pbmFsUHJvZmlsZVNlcnZpY2UpKTtcblx0XHRhd2FpdCB0ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLmhhc1JlZnJlc2hlZFByb2ZpbGVzO1xuXHRcdGRlZXBTdHJpY3RFcXVhbCh0ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLmF2YWlsYWJsZVByb2ZpbGVzLCBbXSk7XG5cdFx0ZGVlcFN0cmljdEVxdWFsKHRlcm1pbmFsUHJvZmlsZVNlcnZpY2UuY29udHJpYnV0ZWRQcm9maWxlcywgW2pzZGVidWdQcm9maWxlXSk7XG5cdFx0dGVybWluYWxJbnN0YW5jZVNlcnZpY2Uuc2V0UHJvZmlsZXMoJ2Zha2VyZW1vdGUnLCBbcG93ZXJzaGVsbFByb2ZpbGVdKTtcblx0XHRhd2FpdCB0ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLnJlZnJlc2hBbmRBd2FpdEF2YWlsYWJsZVByb2ZpbGVzKCk7XG5cdFx0ZGVlcFN0cmljdEVxdWFsKHRlcm1pbmFsUHJvZmlsZVNlcnZpY2UuYXZhaWxhYmxlUHJvZmlsZXMsIFtwb3dlcnNoZWxsUHJvZmlsZV0pO1xuXHRcdGRlZXBTdHJpY3RFcXVhbCh0ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLmNvbnRyaWJ1dGVkUHJvZmlsZXMsIFtqc2RlYnVnUHJvZmlsZV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgZmlyZSBvbkRpZENoYW5nZUF2YWlsYWJsZVByb2ZpbGVzIG9ubHkgd2hlbiBhdmFpbGFibGUgcHJvZmlsZXMgaGF2ZSBjaGFuZ2VkIHZpYSB1c2VyIGNvbmZpZycsIGFzeW5jICgpID0+IHtcblx0XHRwb3dlcnNoZWxsUHJvZmlsZS5pY29uID0gQ29kaWNvbi5saWdodEJ1bGI7XG5cdFx0bGV0IGNhbGxzOiBJVGVybWluYWxQcm9maWxlW11bXSA9IFtdO1xuXHRcdHN0b3JlLmFkZCh0ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlQXZhaWxhYmxlUHJvZmlsZXMoZSA9PiBjYWxscy5wdXNoKGUpKSk7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3Rlcm1pbmFsJywge1xuXHRcdFx0aW50ZWdyYXRlZDoge1xuXHRcdFx0XHRwcm9maWxlczoge1xuXHRcdFx0XHRcdHdpbmRvd3M6IHBvd2Vyc2hlbGxQcm9maWxlLFxuXHRcdFx0XHRcdGxpbnV4OiBwb3dlcnNoZWxsUHJvZmlsZSxcblx0XHRcdFx0XHRvc3g6IHBvd2Vyc2hlbGxQcm9maWxlXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRhd2FpdCB0ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLmhhc1JlZnJlc2hlZFByb2ZpbGVzO1xuXHRcdGRlZXBTdHJpY3RFcXVhbChjYWxscywgW1xuXHRcdFx0W3Bvd2Vyc2hlbGxQcm9maWxlXVxuXHRcdF0pO1xuXHRcdGRlZXBTdHJpY3RFcXVhbCh0ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLmF2YWlsYWJsZVByb2ZpbGVzLCBbcG93ZXJzaGVsbFByb2ZpbGVdKTtcblx0XHRkZWVwU3RyaWN0RXF1YWwodGVybWluYWxQcm9maWxlU2VydmljZS5jb250cmlidXRlZFByb2ZpbGVzLCBbanNkZWJ1Z1Byb2ZpbGVdKTtcblx0XHRjYWxscyA9IFtdO1xuXHRcdGF3YWl0IHRlcm1pbmFsUHJvZmlsZVNlcnZpY2UucmVmcmVzaEFuZEF3YWl0QXZhaWxhYmxlUHJvZmlsZXMoKTtcblx0XHRkZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGZpcmUgb25EaWRDaGFuZ2VBdmFpbGFibGVQcm9maWxlcyB3aGVuIGF2YWlsYWJsZSBvciBjb250cmlidXRlZCBwcm9maWxlcyBoYXZlIGNoYW5nZWQgdmlhIHJlbW90ZS9sb2NhbFRlcm1pbmFsU2VydmljZScsIGFzeW5jICgpID0+IHtcblx0XHRwb3dlcnNoZWxsUHJvZmlsZS5pc0RlZmF1bHQgPSBmYWxzZTtcblx0XHR0ZXJtaW5hbEluc3RhbmNlU2VydmljZS5zZXRQcm9maWxlcyh1bmRlZmluZWQsIFtwb3dlcnNoZWxsUHJvZmlsZV0pO1xuXHRcdGNvbnN0IGNhbGxzOiBJVGVybWluYWxQcm9maWxlW11bXSA9IFtdO1xuXHRcdHN0b3JlLmFkZCh0ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlQXZhaWxhYmxlUHJvZmlsZXMoZSA9PiBjYWxscy5wdXNoKGUpKSk7XG5cdFx0YXdhaXQgdGVybWluYWxQcm9maWxlU2VydmljZS5oYXNSZWZyZXNoZWRQcm9maWxlcztcblx0XHRkZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtcblx0XHRcdFtwb3dlcnNoZWxsUHJvZmlsZV1cblx0XHRdKTtcblx0XHRkZWVwU3RyaWN0RXF1YWwodGVybWluYWxQcm9maWxlU2VydmljZS5hdmFpbGFibGVQcm9maWxlcywgW3Bvd2Vyc2hlbGxQcm9maWxlXSk7XG5cdFx0ZGVlcFN0cmljdEVxdWFsKHRlcm1pbmFsUHJvZmlsZVNlcnZpY2UuY29udHJpYnV0ZWRQcm9maWxlcywgW2pzZGVidWdQcm9maWxlXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBjYWxsIHJlZnJlc2hBdmFpbGFibGVQcm9maWxlcyBfb25EaWRDaGFuZ2VFeHRlbnNpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGV4dGVuc2lvblNlcnZpY2UuX29uRGlkQ2hhbmdlRXh0ZW5zaW9ucy5maXJlKCk7XG5cdFx0Y29uc3QgY2FsbHM6IElUZXJtaW5hbFByb2ZpbGVbXVtdID0gW107XG5cdFx0c3RvcmUuYWRkKHRlcm1pbmFsUHJvZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VBdmFpbGFibGVQcm9maWxlcyhlID0+IGNhbGxzLnB1c2goZSkpKTtcblx0XHRhd2FpdCB0ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLmhhc1JlZnJlc2hlZFByb2ZpbGVzO1xuXHRcdGRlZXBTdHJpY3RFcXVhbChjYWxscywgW1xuXHRcdFx0W3Bvd2Vyc2hlbGxQcm9maWxlXVxuXHRcdF0pO1xuXHRcdGRlZXBTdHJpY3RFcXVhbCh0ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLmF2YWlsYWJsZVByb2ZpbGVzLCBbcG93ZXJzaGVsbFByb2ZpbGVdKTtcblx0XHRkZWVwU3RyaWN0RXF1YWwodGVybWluYWxQcm9maWxlU2VydmljZS5jb250cmlidXRlZFByb2ZpbGVzLCBbanNkZWJ1Z1Byb2ZpbGVdKTtcblx0fSk7XG5cdHN1aXRlKCdQcm9maWxlcyBRdWlja3BpY2snLCAoKSA9PiB7XG5cdFx0bGV0IHF1aWNrSW5wdXRTZXJ2aWNlOiBNb2NrUXVpY2tJbnB1dFNlcnZpY2U7XG5cdFx0bGV0IG1vY2tUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlOiBNb2NrVGVybWluYWxQcm9maWxlU2VydmljZTtcblx0XHRsZXQgdGVybWluYWxQcm9maWxlUXVpY2twaWNrOiBUZXN0VGVybWluYWxQcm9maWxlUXVpY2twaWNrO1xuXHRcdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRcdHF1aWNrSW5wdXRTZXJ2aWNlID0gbmV3IE1vY2tRdWlja0lucHV0U2VydmljZSgpO1xuXHRcdFx0bW9ja1Rlcm1pbmFsUHJvZmlsZVNlcnZpY2UgPSBuZXcgTW9ja1Rlcm1pbmFsUHJvZmlsZVNlcnZpY2UoKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVF1aWNrSW5wdXRTZXJ2aWNlLCBxdWlja0lucHV0U2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLCBtb2NrVGVybWluYWxQcm9maWxlU2VydmljZSk7XG5cdFx0XHR0ZXJtaW5hbFByb2ZpbGVRdWlja3BpY2sgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VGVybWluYWxQcm9maWxlUXVpY2twaWNrKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzZXREZWZhdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cG93ZXJzaGVsbFByb2ZpbGUuaXNEZWZhdWx0ID0gZmFsc2U7XG5cdFx0XHRtb2NrVGVybWluYWxQcm9maWxlU2VydmljZS5zZXRQcm9maWxlcyhbcG93ZXJzaGVsbFByb2ZpbGVdLCBbanNkZWJ1Z1Byb2ZpbGVdKTtcblx0XHRcdG1vY2tUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLnNldERlZmF1bHRQcm9maWxlTmFtZShqc2RlYnVnUHJvZmlsZS50aXRsZSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbFByb2ZpbGVRdWlja3BpY2suc2hvd0FuZEdldFJlc3VsdCgnc2V0RGVmYXVsdCcpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgcG93ZXJzaGVsbFByb2ZpbGUucHJvZmlsZU5hbWUpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3NldERlZmF1bHQgdG8gY29udHJpYnV0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRtb2NrVGVybWluYWxQcm9maWxlU2VydmljZS5zZXREZWZhdWx0UHJvZmlsZU5hbWUocG93ZXJzaGVsbFByb2ZpbGUucHJvZmlsZU5hbWUpO1xuXHRcdFx0cXVpY2tJbnB1dFNlcnZpY2Uuc2V0UGljayhqc2RlYnVnUGljayk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbFByb2ZpbGVRdWlja3BpY2suc2hvd0FuZEdldFJlc3VsdCgnc2V0RGVmYXVsdCcpO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWQgPSB7XG5cdFx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRcdGV4dGVuc2lvbklkZW50aWZpZXI6IGpzZGVidWdQcm9maWxlLmV4dGVuc2lvbklkZW50aWZpZXIsXG5cdFx0XHRcdFx0aWQ6IGpzZGVidWdQcm9maWxlLmlkLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHsgY29sb3I6IHVuZGVmaW5lZCwgaWNvbjogJ2RlYnVnJyB9LFxuXHRcdFx0XHRcdHRpdGxlOiBqc2RlYnVnUHJvZmlsZS50aXRsZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0a2V5TW9kczogdW5kZWZpbmVkXG5cdFx0XHR9O1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgZXhwZWN0ZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3JlYXRlSW5zdGFuY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRtb2NrVGVybWluYWxQcm9maWxlU2VydmljZS5zZXREZWZhdWx0UHJvZmlsZU5hbWUocG93ZXJzaGVsbFByb2ZpbGUucHJvZmlsZU5hbWUpO1xuXHRcdFx0Y29uc3QgcGljayA9IHsgLi4ucG93ZXJzaGVsbFBpY2ssIGtleU1vZHM6IHsgYWx0OiB0cnVlLCBjdHJsQ21kOiBmYWxzZSwgc2hpZnQ6IGZhbHNlIH0gfTtcblx0XHRcdHF1aWNrSW5wdXRTZXJ2aWNlLnNldFBpY2socGljayk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbFByb2ZpbGVRdWlja3BpY2suc2hvd0FuZEdldFJlc3VsdCgnY3JlYXRlSW5zdGFuY2UnKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgY29uZmlnOiBwb3dlcnNoZWxsUHJvZmlsZSwga2V5TW9kczogeyBhbHQ6IHRydWUsIGN0cmxDbWQ6IGZhbHNlLCBzaGlmdDogZmFsc2UgfSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NyZWF0ZUluc3RhbmNlIHdpdGggY29udHJpYnV0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwaWNrID0geyAuLi5qc2RlYnVnUGljaywga2V5TW9kczogeyBhbHQ6IHRydWUsIGN0cmxDbWQ6IGZhbHNlLCBzaGlmdDogdHJ1ZSB9IH07XG5cdFx0XHRxdWlja0lucHV0U2VydmljZS5zZXRQaWNrKHBpY2spO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVybWluYWxQcm9maWxlUXVpY2twaWNrLnNob3dBbmRHZXRSZXN1bHQoJ2NyZWF0ZUluc3RhbmNlJyk7XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IHtcblx0XHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSWRlbnRpZmllcjoganNkZWJ1Z1Byb2ZpbGUuZXh0ZW5zaW9uSWRlbnRpZmllcixcblx0XHRcdFx0XHRpZDoganNkZWJ1Z1Byb2ZpbGUuaWQsXG5cdFx0XHRcdFx0b3B0aW9uczogeyBjb2xvcjogdW5kZWZpbmVkLCBpY29uOiAnZGVidWcnIH0sXG5cdFx0XHRcdFx0dGl0bGU6IGpzZGVidWdQcm9maWxlLnRpdGxlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRrZXlNb2RzOiB7IGFsdDogdHJ1ZSwgY3RybENtZDogZmFsc2UsIHNoaWZ0OiB0cnVlIH1cblx0XHRcdH07XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBleHBlY3RlZCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxXQUFXLHVCQUF1QjtBQUNwRCxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHFCQUFxQiw2QkFBNkQ7QUFDM0YsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBdUIs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
