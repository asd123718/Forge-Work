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
import { Workbench as SessionsWorkbench } from "../browser/workbench.js";
import { SessionsBrowserMain } from "../browser/web.main.js";
import { Emitter, Event } from "../../base/common/event.js";
import { observableValue } from "../../base/common/observable.js";
import { ChatEntitlement, IChatEntitlementService } from "../../workbench/services/chat/common/chatEntitlementService.js";
import { IDefaultAccountService } from "../../platform/defaultAccount/common/defaultAccount.js";
import { IChatAgentService } from "../../workbench/contrib/chat/common/participants/chatAgents.js";
import { ChatAgentLocation, ChatModeKind } from "../../workbench/contrib/chat/common/constants.js";
import { ExtensionIdentifier } from "../../platform/extensions/common/extensions.js";
import { IStorageService, StorageScope, StorageTarget } from "../../platform/storage/common/storage.js";
import { URI } from "../../base/common/uri.js";
import { Disposable } from "../../base/common/lifecycle.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../workbench/common/contributions.js";
import { IChatSessionsService, ChatSessionStatus } from "../../workbench/contrib/chat/common/chatSessionsService.js";
import { IGitService } from "../../workbench/contrib/git/common/gitService.js";
import { IFileService } from "../../platform/files/common/files.js";
import { ITerminalService } from "../../workbench/contrib/terminal/browser/terminal.js";
import { TerminalExtensions } from "../../platform/terminal/common/terminal.js";
import { Registry } from "../../platform/registry/common/platform.js";
import { InMemoryFileSystemProvider } from "../../platform/files/common/inMemoryFilesystemProvider.js";
import { VSBuffer } from "../../base/common/buffer.js";
import { SyncDescriptor } from "../../platform/instantiation/common/descriptors.js";
import { getSingletonServiceDescriptors } from "../../platform/instantiation/common/extensions.js";
import { isEqual } from "../../base/common/resources.js";
const MOCK_FS_FILES = {
  "/mock-repo/src/index.ts": 'export function main() {\n	console.log("Hello from mock repo");\n}\n',
  "/mock-repo/src/utils.ts": "export function add(a: number, b: number): number {\n	return a + b;\n}\n",
  "/mock-repo/package.json": '{\n	"name": "mock-repo",\n	"version": "1.0.0"\n}\n',
  "/mock-repo/README.md": "# Mock Repository\n\nThis is a mock repository for E2E testing.\n"
};
function registerMockFileSystemProvider(serviceCollection) {
  const fileService = serviceCollection.get(IFileService);
  const provider = new InMemoryFileSystemProvider();
  fileService.registerProvider("mock-fs", provider);
  for (const [filePath, content] of Object.entries(MOCK_FS_FILES)) {
    const uri = URI.from({ scheme: "mock-fs", authority: "mock-repo", path: filePath });
    fileService.writeFile(uri, VSBuffer.fromString(content));
  }
  console.log("[Sessions Web Test] Registered mock-fs:// provider with pre-seeded files");
}
const MOCK_ACCOUNT = {
  authenticationProvider: { id: "github", name: "GitHub (Mock)", enterprise: false },
  accountName: "e2e-test-user",
  sessionId: "mock-session-1",
  enterprise: false
};
class MockChatEntitlementService {
  constructor() {
    this.onDidChangeEntitlement = Event.None;
    this.onDidChangeQuotaExceeded = Event.None;
    this.onDidChangeQuotaRemaining = Event.None;
    this.onDidChangeUsageBasedBilling = Event.None;
    this.onDidChangeSentiment = Event.None;
    this.onDidChangeAnonymous = Event.None;
    this.entitlement = ChatEntitlement.Free;
    this.entitlementObs = observableValue("entitlement", ChatEntitlement.Free);
    this.clientByokEnabled = false;
    this.hasByokModels = false;
    this.organisations = void 0;
    this.isInternal = false;
    this.sku = "free";
    this.copilotTrackingId = "mock-tracking-id";
    this.quotas = {};
    this.sentiment = { completed: true, registered: true };
    this.sentimentObs = observableValue("sentiment", { completed: true, registered: true });
    this.anonymous = false;
    this.anonymousObs = observableValue("anonymous", false);
  }
  acceptQuotas() {
  }
  clearQuotas() {
  }
  markAnonymousRateLimited() {
  }
  markSetupCompleted() {
  }
  setForceHidden(_hidden) {
  }
  async update(_token) {
  }
}
class MockDefaultAccountService {
  constructor() {
    this.onDidChangeDefaultAccount = Event.None;
    this.onDidChangePolicyData = Event.None;
    this.policyData = null;
    this.currentDefaultAccount = MOCK_ACCOUNT;
    this.copilotTokenInfo = null;
    this.onDidChangeCopilotTokenInfo = Event.None;
    this.managedSettingsFetchStatus = null;
    this.managedSettingsFetchedAt = null;
    this.managedSettingsRawResponse = null;
    this.managedSettingsCompatibilityError = null;
    this.onDidChangeManagedSettingsCompatibilityError = Event.None;
  }
  async getDefaultAccount() {
    return MOCK_ACCOUNT;
  }
  getDefaultAccountAuthenticationProvider() {
    return MOCK_ACCOUNT.authenticationProvider;
  }
  resolveGitHubUrl(path) {
    return `https://github.com/${path}`;
  }
  setDefaultAccountProvider() {
  }
  async refresh() {
    return MOCK_ACCOUNT;
  }
  async signIn() {
    return MOCK_ACCOUNT;
  }
  async signOut() {
  }
}
const EXISTING_MOCK_FILES = /* @__PURE__ */ new Set(["/mock-repo/src/index.ts", "/mock-repo/src/utils.ts", "/mock-repo/package.json", "/mock-repo/README.md"]);
function emitFileEdits(fileEdits, progress) {
  for (const edit of fileEdits) {
    const isExistingFile = EXISTING_MOCK_FILES.has(edit.uri.path);
    const range = isExistingFile ? { startLineNumber: 1, startColumn: 1, endLineNumber: 99999, endColumn: 1 } : { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
    console.log(`[Sessions Web Test] Emitting textEdit for ${edit.uri.toString()} (existing: ${isExistingFile}, range: ${range.startLineNumber}-${range.endLineNumber})`);
    progress([{
      kind: "textEdit",
      uri: edit.uri,
      edits: [{ range, text: edit.content }],
      done: true
    }]);
  }
}
function getMockResponseWithEdits(message) {
  if (/build|compile|create/i.test(message)) {
    return {
      text: "I'll help you build the project. Here are the changes:",
      fileEdits: [
        {
          // Modify existing file — adds build import + call
          uri: URI.from({ scheme: "mock-fs", authority: "mock-repo", path: "/mock-repo/src/index.ts" }),
          content: 'import { build } from "./build";\n\nexport function main() {\n	console.log("Hello from mock repo");\n	build();\n}\n'
        },
        {
          // New file — creates build script
          uri: URI.from({ scheme: "mock-fs", authority: "mock-repo", path: "/mock-repo/src/build.ts" }),
          content: 'export async function build() {\n	console.log("Building...");\n	console.log("Build complete!");\n}\n'
        },
        {
          // Modify existing file — adds build script
          uri: URI.from({ scheme: "mock-fs", authority: "mock-repo", path: "/mock-repo/package.json" }),
          content: '{\n	"name": "mock-repo",\n	"version": "1.0.0",\n	"scripts": {\n		"build": "node src/build.ts"\n	}\n}\n'
        }
      ]
    };
  }
  if (/fix|bug/i.test(message)) {
    return {
      text: "I found the issue and applied the fix. The input validation has been added.",
      fileEdits: [
        {
          // Modify existing file — adds input validation
          uri: URI.from({ scheme: "mock-fs", authority: "mock-repo", path: "/mock-repo/src/utils.ts" }),
          content: 'export function add(a: number, b: number): number {\n	if (typeof a !== "number" || typeof b !== "number") {\n		throw new TypeError("Both arguments must be numbers");\n	}\n	return a + b;\n}\n'
        }
      ]
    };
  }
  if (/explain|describe/i.test(message)) {
    return {
      text: "This project has a simple structure with a main entry point and utility functions."
    };
  }
  return {
    text: "I understand your request. Let me work on that.\n\n1. Review the codebase\n2. Make changes\n3. Run tests"
  };
}
let MockChatAgentContribution = class extends Disposable {
  constructor(chatAgentService, chatSessionsService, terminalService) {
    super();
    this.chatAgentService = chatAgentService;
    this.chatSessionsService = chatSessionsService;
    this.terminalService = terminalService;
    this._sessionItems = [];
    this._itemsChangedEmitter = new Emitter();
    this._sessionHistory = /* @__PURE__ */ new Map();
    this._worktreeCounter = 0;
    this._register(this._itemsChangedEmitter);
    this.registerMockAgents();
    this.registerMockSessionProvider();
    this.registerMockTerminalBackend();
  }
  /**
   * Track a session for sidebar display and history re-opening.
   *
   * Populates `IChatSessionItem.changes` with file change metadata so the
   * ChangesViewPane can render them for background (copilotcli) sessions.
   * Background sessions read changes from `IAgentSessionsService.model`
   * which flows through from `IChatSessionItemController.items`.
   */
  addSessionItem(resource, message, responseText, fileEdits) {
    const key = resource.toString();
    const now = Date.now();
    if (!this._sessionHistory.has(key)) {
      this._sessionHistory.set(key, []);
    }
    this._sessionHistory.get(key).push(
      { type: "request", prompt: message, participant: "copilot" },
      { type: "response", parts: [{ kind: "markdownContent", content: { value: responseText, isTrusted: false, supportThemeIcons: false, supportHtml: false } }], participant: "copilot" }
    );
    const changes = fileEdits?.map((edit) => ({
      modifiedUri: edit.uri,
      insertions: edit.content.split("\n").length,
      deletions: EXISTING_MOCK_FILES.has(edit.uri.path) ? 1 : 0
    }));
    const existingIndex = this._sessionItems.findIndex((s) => isEqual(s.resource, resource));
    let addedOrUpdated = existingIndex !== -1 ? { ...this._sessionItems[existingIndex] } : void 0;
    if (addedOrUpdated) {
      addedOrUpdated.timing = { ...addedOrUpdated.timing, lastRequestStarted: now, lastRequestEnded: now };
      if (changes) {
        addedOrUpdated.changes = changes;
      }
      this._sessionItems[existingIndex] = addedOrUpdated;
    } else {
      addedOrUpdated = {
        resource,
        label: message.slice(0, 50) || "Mock Session",
        status: ChatSessionStatus.Completed,
        timing: { created: now, lastRequestStarted: now, lastRequestEnded: now },
        metadata: { worktreePath: `/mock-worktrees/session-${++this._worktreeCounter}` },
        ...changes ? { changes } : {}
      };
      this._sessionItems.push(addedOrUpdated);
    }
    if (addedOrUpdated) {
      this._itemsChangedEmitter.fire({ addedOrUpdated: [addedOrUpdated] });
    }
  }
  registerMockAgents() {
    const agentIds = ["copilotcli", "copilot-cloud-agent"];
    const extensionId = new ExtensionIdentifier("vscode.sessions-e2e-mock");
    const self = this;
    for (const agentId of agentIds) {
      const agentData = {
        id: agentId,
        name: agentId,
        fullName: `Mock Agent (${agentId})`,
        description: "Mock chat agent for E2E testing",
        extensionId,
        extensionVersion: "0.0.1",
        extensionPublisherId: "vscode",
        extensionDisplayName: "Sessions E2E Mock",
        isDefault: agentId === "copilotcli",
        metadata: {},
        slashCommands: [],
        locations: [ChatAgentLocation.Chat],
        modes: [ChatModeKind.Agent],
        disambiguation: []
      };
      const agentImpl = {
        async invoke(request, progress, _history, _token) {
          console.log(`[Sessions Web Test] Mock agent "${agentId}" invoked: "${request.message}"`);
          const response = getMockResponseWithEdits(request.message);
          progress([{
            kind: "markdownContent",
            content: { value: response.text, isTrusted: false, supportThemeIcons: false, supportHtml: false }
          }]);
          if (response.fileEdits) {
            emitFileEdits(response.fileEdits, progress);
            console.log(`[Sessions Web Test] Emitted ${response.fileEdits.length} file edits OK`);
          }
          self.addSessionItem(request.sessionResource, request.message, response.text, response.fileEdits);
          return { metadata: { mock: true } };
        }
      };
      try {
        this._register(this.chatAgentService.registerDynamicAgent(agentData, agentImpl));
        console.log(`[Sessions Web Test] Registered mock agent: ${agentId}`);
      } catch (err) {
        console.warn(`[Sessions Web Test] Failed to register agent ${agentId}:`, err);
      }
    }
  }
  registerMockSessionProvider() {
    const schemes = ["copilotcli", "copilot-cloud-agent"];
    const self = this;
    for (const scheme of schemes) {
      try {
        this._register(this.chatSessionsService.registerChatSessionContentProvider(scheme, {
          async provideChatSessionContent(sessionResource, _token) {
            const key = sessionResource.toString();
            if (!self._sessionHistory.has(key)) {
              self._sessionHistory.set(key, []);
            }
            const history = self._sessionHistory.get(key);
            console.log(`[Sessions Web Test] Opening session ${key} (${history.length} history items)`);
            const disposeEmitter = new Emitter();
            const isComplete = observableValue("isComplete", history.length > 0);
            return {
              sessionResource,
              history,
              isCompleteObs: isComplete,
              onWillDispose: disposeEmitter.event,
              async requestHandler(request, progress, _history, _token2) {
                console.log(`[Sessions Web Test] Session request: "${request.message}"`);
                const response = getMockResponseWithEdits(request.message);
                progress([{
                  kind: "markdownContent",
                  content: { value: response.text, isTrusted: false, supportThemeIcons: false, supportHtml: false }
                }]);
                if (response.fileEdits) {
                  emitFileEdits(response.fileEdits, progress);
                }
                isComplete.set(true, void 0);
              },
              dispose() {
                disposeEmitter.fire();
                disposeEmitter.dispose();
              }
            };
          }
        }));
        const controllerItems = scheme === "copilotcli" ? this._sessionItems : [];
        this._register(this.chatSessionsService.registerChatSessionItemController(scheme, {
          onDidChangeChatSessionItems: this._itemsChangedEmitter.event,
          get items() {
            return controllerItems;
          },
          async refresh() {
          }
        }));
        console.log(`[Sessions Web Test] Registered session provider for scheme: ${scheme}`);
      } catch (err) {
        console.warn(`[Sessions Web Test] Failed to register session provider for ${scheme}:`, err);
      }
    }
  }
  registerMockTerminalBackend() {
    const terminalService = this.terminalService;
    const backend = this.createMockTerminalBackend();
    Registry.as(TerminalExtensions.Backend).registerTerminalBackend(backend);
    terminalService.registerProcessSupport(true);
    console.log("[Sessions Web Test] Registered mock terminal backend");
  }
  createMockTerminalBackend() {
    return {
      remoteAuthority: void 0,
      isVirtualProcess: false,
      isResponsive: true,
      whenReady: Promise.resolve(),
      setReady: () => {
      },
      onDidRequestDetach: Event.None,
      attachToProcess: async () => {
        throw new Error("Not supported");
      },
      attachToRevivedProcess: async () => {
        throw new Error("Not supported");
      },
      listProcesses: async () => [],
      getProfiles: async () => [],
      getDefaultProfile: async () => void 0,
      getDefaultSystemShell: async () => "/bin/mock-shell",
      getShellEnvironment: async () => ({}),
      setTerminalLayoutInfo: async () => {
      },
      getTerminalLayoutInfo: async () => void 0,
      reduceConnectionGraceTime: () => {
      },
      requestDetachInstance: () => {
      },
      acceptDetachInstanceReply: () => {
      },
      persistTerminalState: () => {
      },
      createProcess: async (_shellLaunchConfig, _cwd, _cols, _rows, _unicodeVersion, _env, _options, _shouldPersist) => {
        const onProcessData = new Emitter();
        const onProcessReady = new Emitter();
        const onProcessExit = new Emitter();
        const onDidChangeHasChildProcesses = new Emitter();
        const onDidChangeProperty = new Emitter();
        const rawCwd = _cwd || _shellLaunchConfig.cwd;
        const cwd = !rawCwd ? "/" : typeof rawCwd === "string" ? rawCwd : rawCwd.path;
        console.log(`[Sessions Web Test] Mock terminal createProcess cwd: '${cwd}' (raw _cwd: '${_cwd}', slc.cwd: '${_shellLaunchConfig.cwd}')`);
        setTimeout(() => {
          onProcessReady.fire({ pid: 1, cwd, windowsPty: void 0 });
        }, 0);
        return {
          id: 0,
          shouldPersist: false,
          onProcessData: onProcessData.event,
          onProcessReady: onProcessReady.event,
          onDidChangeHasChildProcesses: onDidChangeHasChildProcesses.event,
          onDidChangeProperty: onDidChangeProperty.event,
          onProcessExit: onProcessExit.event,
          start: async () => void 0,
          shutdown: async () => {
          },
          input: async () => {
          },
          resize: () => {
          },
          clearBuffer: () => {
          },
          acknowledgeDataEvent: () => {
          },
          setUnicodeVersion: async () => {
          },
          getInitialCwd: async () => cwd,
          getCwd: async () => cwd,
          getLatency: async () => [],
          processBinary: async () => {
          },
          refreshProperty: async (property) => {
            throw new Error(`Not supported: ${property}`);
          },
          updateProperty: async () => {
          },
          clearUnrespondedRequest: () => {
          }
        };
      },
      getWslPath: async (original, _direction) => original,
      getEnvironment: async () => ({}),
      getLatency: async () => [],
      getPerformanceMarks: () => [],
      updateTitle: async () => {
      },
      updateIcon: async () => {
      },
      setNextCommandId: async () => {
      },
      restartPtyHost: () => {
      },
      installAutoReply: async () => {
      },
      uninstallAllAutoReplies: async () => {
      },
      onPtyHostUnresponsive: Event.None,
      onPtyHostResponsive: Event.None,
      onPtyHostRestart: Event.None,
      onPtyHostConnected: Event.None
    };
  }
};
MockChatAgentContribution.ID = "sessions.test.mockChatAgent";
MockChatAgentContribution = __decorateClass([
  __decorateParam(0, IChatAgentService),
  __decorateParam(1, IChatSessionsService),
  __decorateParam(2, ITerminalService)
], MockChatAgentContribution);
registerWorkbenchContribution2(MockChatAgentContribution.ID, MockChatAgentContribution, WorkbenchPhase.BlockStartup);
class MockGitService {
  constructor() {
    this.repositories = [];
  }
  setDelegate(_delegate) {
    return Disposable.None;
  }
  async openRepository(_uri) {
    return void 0;
  }
}
class TestSessionsBrowserMain extends SessionsBrowserMain {
  constructor() {
    super(...arguments);
    this._savedDescriptors = [];
  }
  async open() {
    const registry = getSingletonServiceDescriptors();
    const overrides = [
      [IChatEntitlementService, new SyncDescriptor(MockChatEntitlementService)],
      [IDefaultAccountService, new SyncDescriptor(MockDefaultAccountService)],
      [IGitService, new SyncDescriptor(MockGitService)]
    ];
    for (const [serviceId, mockDescriptor] of overrides) {
      const idx = registry.findIndex(([id]) => id === serviceId);
      if (idx !== -1) {
        this._savedDescriptors.push([serviceId, registry[idx][1]]);
        registry[idx] = [serviceId, mockDescriptor];
      } else {
        registry.push([serviceId, mockDescriptor]);
      }
    }
    const workbench = await super.open();
    for (const [serviceId, original] of this._savedDescriptors) {
      const idx = registry.findIndex(([id]) => id === serviceId);
      if (idx !== -1) {
        registry[idx] = [serviceId, original];
      }
    }
    return workbench;
  }
  preseedFolder(storageService) {
    const mockFolderUri = URI.from({ scheme: "mock-fs", authority: "mock-repo", path: "/mock-repo" });
    const providerId = "default-copilot";
    const recentWorkspaces = JSON.stringify([{ uri: mockFolderUri.toJSON(), providerId, checked: true }]);
    storageService.store("sessions.recentlyPickedWorkspaces", recentWorkspaces, StorageScope.PROFILE, StorageTarget.MACHINE);
    console.log(`[Sessions Web Test] Pre-seeded folder: ${mockFolderUri.toString()}`);
  }
  createWorkbench(domElement, serviceCollection, logService) {
    registerMockFileSystemProvider(serviceCollection);
    this.preseedFolder(serviceCollection.get(IStorageService));
    return new SessionsWorkbench(domElement, void 0, serviceCollection, logService);
  }
}
export {
  TestSessionsBrowserMain
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcdGVzdFxcd2ViLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJNYWluV29ya2JlbmNoIH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvd2ViLm1haW4uanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoIGFzIFNlc3Npb25zV29ya2JlbmNoIH0gZnJvbSAnLi4vYnJvd3Nlci93b3JrYmVuY2guanMnO1xuaW1wb3J0IHsgU2Vzc2lvbnNCcm93c2VyTWFpbiB9IGZyb20gJy4uL2Jyb3dzZXIvd2ViLm1haW4uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnQsIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLCBJQ2hhdFNlbnRpbWVudCB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50LCBJRGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyLCBJQ29waWxvdFRva2VuSW5mbywgSVBvbGljeURhdGEgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50U2VydmljZSwgSUNoYXRBZ2VudERhdGEsIElDaGF0QWdlbnRJbXBsZW1lbnRhdGlvbiB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRQcm9ncmVzcyB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBJQ2hhdFNlc3Npb25JdGVtLCBJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlLCBDaGF0U2Vzc2lvblN0YXR1cywgSUNoYXRTZXNzaW9uSGlzdG9yeUl0ZW0sIElDaGF0U2Vzc2lvbkl0ZW1zRGVsdGEgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElHaXRTZXJ2aWNlLCBJR2l0RXh0ZW5zaW9uRGVsZWdhdGUsIElHaXRSZXBvc2l0b3J5IH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvZ2l0L2NvbW1vbi9naXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxCYWNrZW5kLCBJVGVybWluYWxCYWNrZW5kUmVnaXN0cnksIElQcm9jZXNzUmVhZHlFdmVudCwgSVByb2Nlc3NQcm9wZXJ0eSwgUHJvY2Vzc1Byb3BlcnR5VHlwZSwgVGVybWluYWxFeHRlbnNpb25zLCBJVGVybWluYWxQcm9jZXNzT3B0aW9ucywgSVNoZWxsTGF1bmNoQ29uZmlnIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElQcm9jZXNzRW52aXJvbm1lbnQgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IGdldFNpbmdsZXRvblNlcnZpY2VEZXNjcmlwdG9ycyB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU2VydmljZUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2ggfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvYnJvd3Nlci93ZWIuYXBpLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuXG4vKipcbiAqIE1vY2sgZmlsZXMgcHJlLXNlZWRlZCBpbiB0aGUgaW4tbWVtb3J5IGZpbGUgc3lzdGVtLiBUaGVzZSBtYXRjaCB0aGVcbiAqIHBhdGhzIGluIEVYSVNUSU5HX01PQ0tfRklMRVMgYW5kIGFyZSB1c2VkIGJ5IHRoZSBDaGF0RWRpdGluZ1NlcnZpY2VcbiAqIHRvIGNvbXB1dGUgYmVmb3JlL2FmdGVyIGRpZmZzLlxuICovXG5jb25zdCBNT0NLX0ZTX0ZJTEVTOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHQnL21vY2stcmVwby9zcmMvaW5kZXgudHMnOiAnZXhwb3J0IGZ1bmN0aW9uIG1haW4oKSB7XFxuXFx0Y29uc29sZS5sb2coXCJIZWxsbyBmcm9tIG1vY2sgcmVwb1wiKTtcXG59XFxuJyxcblx0Jy9tb2NrLXJlcG8vc3JjL3V0aWxzLnRzJzogJ2V4cG9ydCBmdW5jdGlvbiBhZGQoYTogbnVtYmVyLCBiOiBudW1iZXIpOiBudW1iZXIge1xcblxcdHJldHVybiBhICsgYjtcXG59XFxuJyxcblx0Jy9tb2NrLXJlcG8vcGFja2FnZS5qc29uJzogJ3tcXG5cXHRcIm5hbWVcIjogXCJtb2NrLXJlcG9cIixcXG5cXHRcInZlcnNpb25cIjogXCIxLjAuMFwiXFxufVxcbicsXG5cdCcvbW9jay1yZXBvL1JFQURNRS5tZCc6ICcjIE1vY2sgUmVwb3NpdG9yeVxcblxcblRoaXMgaXMgYSBtb2NrIHJlcG9zaXRvcnkgZm9yIEUyRSB0ZXN0aW5nLlxcbicsXG59O1xuXG4vKipcbiAqIFJlZ2lzdGVyIHRoZSBtb2NrLWZzOi8vIGZpbGUgc3lzdGVtIHByb3ZpZGVyIGRpcmVjdGx5IGluIHRoZSB3b3JrYmVuY2hcbiAqIHNvIGl0IGlzIGF2YWlsYWJsZSBpbW1lZGlhdGVseSBhdCBzdGFydHVwIFx1MjAxNCBiZWZvcmUgYW55IHNlcnZpY2VcbiAqIChTbmlwcGV0c1NlcnZpY2UsIFByb21wdEZpbGVzTG9jYXRvciwgTUNQLCBldGMuKSB0cmllcyB0byByZXNvbHZlXG4gKiBmaWxlcyBpbnNpZGUgdGhlIHdvcmtzcGFjZSBmb2xkZXIuXG4gKi9cbmZ1bmN0aW9uIHJlZ2lzdGVyTW9ja0ZpbGVTeXN0ZW1Qcm92aWRlcihzZXJ2aWNlQ29sbGVjdGlvbjogU2VydmljZUNvbGxlY3Rpb24pOiB2b2lkIHtcblx0Y29uc3QgZmlsZVNlcnZpY2UgPSBzZXJ2aWNlQ29sbGVjdGlvbi5nZXQoSUZpbGVTZXJ2aWNlKSBhcyBJRmlsZVNlcnZpY2U7XG5cdGNvbnN0IHByb3ZpZGVyID0gbmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCk7XG5cdGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ21vY2stZnMnLCBwcm92aWRlcik7XG5cblx0Ly8gUHJlLXBvcHVsYXRlIHRoZSBmaWxlcyBzbyBDaGF0RWRpdGluZ1NlcnZpY2UgY2FuIHJlYWQgb3JpZ2luYWxzIGZvciBkaWZmc1xuXHRmb3IgKGNvbnN0IFtmaWxlUGF0aCwgY29udGVudF0gb2YgT2JqZWN0LmVudHJpZXMoTU9DS19GU19GSUxFUykpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ21vY2stZnMnLCBhdXRob3JpdHk6ICdtb2NrLXJlcG8nLCBwYXRoOiBmaWxlUGF0aCB9KTtcblx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUodXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblx0fVxuXHRjb25zb2xlLmxvZygnW1Nlc3Npb25zIFdlYiBUZXN0XSBSZWdpc3RlcmVkIG1vY2stZnM6Ly8gcHJvdmlkZXIgd2l0aCBwcmUtc2VlZGVkIGZpbGVzJyk7XG59XG5cbmNvbnN0IE1PQ0tfQUNDT1VOVDogSURlZmF1bHRBY2NvdW50ID0ge1xuXHRhdXRoZW50aWNhdGlvblByb3ZpZGVyOiB7IGlkOiAnZ2l0aHViJywgbmFtZTogJ0dpdEh1YiAoTW9jayknLCBlbnRlcnByaXNlOiBmYWxzZSB9LFxuXHRhY2NvdW50TmFtZTogJ2UyZS10ZXN0LXVzZXInLFxuXHRzZXNzaW9uSWQ6ICdtb2NrLXNlc3Npb24tMScsXG5cdGVudGVycHJpc2U6IGZhbHNlLFxufTtcblxuLyoqXG4gKiBNb2NrIGltcGxlbWVudGF0aW9uIG9mIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHRoYXQgbWFrZXMgdGhlIFNlc3Npb25zXG4gKiB3aW5kb3cgdGhpbmsgdGhlIHVzZXIgaXMgc2lnbmVkIGluIHdpdGggYSBGcmVlIENvcGlsb3QgcGxhbi5cbiAqL1xuY2xhc3MgTW9ja0NoYXRFbnRpdGxlbWVudFNlcnZpY2UgaW1wbGVtZW50cyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFbnRpdGxlbWVudCA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUXVvdGFFeGNlZWRlZCA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUXVvdGFSZW1haW5pbmcgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVVzYWdlQmFzZWRCaWxsaW5nID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZW50aW1lbnQgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFub255bW91cyA9IEV2ZW50Lk5vbmU7XG5cblx0cmVhZG9ubHkgZW50aXRsZW1lbnQgPSBDaGF0RW50aXRsZW1lbnQuRnJlZTtcblx0cmVhZG9ubHkgZW50aXRsZW1lbnRPYnM6IElPYnNlcnZhYmxlPENoYXRFbnRpdGxlbWVudD4gPSBvYnNlcnZhYmxlVmFsdWUoJ2VudGl0bGVtZW50JywgQ2hhdEVudGl0bGVtZW50LkZyZWUpO1xuXG5cdHJlYWRvbmx5IGNsaWVudEJ5b2tFbmFibGVkID0gZmFsc2U7XG5cdHJlYWRvbmx5IGhhc0J5b2tNb2RlbHMgPSBmYWxzZTtcblx0cmVhZG9ubHkgb3JnYW5pc2F0aW9uczogc3RyaW5nW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlzSW50ZXJuYWwgPSBmYWxzZTtcblx0cmVhZG9ubHkgc2t1ID0gJ2ZyZWUnO1xuXHRyZWFkb25seSBjb3BpbG90VHJhY2tpbmdJZCA9ICdtb2NrLXRyYWNraW5nLWlkJztcblxuXHRyZWFkb25seSBxdW90YXMgPSB7fTtcblxuXHRyZWFkb25seSBzZW50aW1lbnQ6IElDaGF0U2VudGltZW50ID0geyBjb21wbGV0ZWQ6IHRydWUsIHJlZ2lzdGVyZWQ6IHRydWUgfTtcblx0cmVhZG9ubHkgc2VudGltZW50T2JzOiBJT2JzZXJ2YWJsZTxJQ2hhdFNlbnRpbWVudD4gPSBvYnNlcnZhYmxlVmFsdWUoJ3NlbnRpbWVudCcsIHsgY29tcGxldGVkOiB0cnVlLCByZWdpc3RlcmVkOiB0cnVlIH0pO1xuXG5cdHJlYWRvbmx5IGFub255bW91cyA9IGZhbHNlO1xuXHRyZWFkb25seSBhbm9ueW1vdXNPYnM6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gb2JzZXJ2YWJsZVZhbHVlKCdhbm9ueW1vdXMnLCBmYWxzZSk7XG5cblx0YWNjZXB0UXVvdGFzKCk6IHZvaWQgeyB9XG5cdGNsZWFyUXVvdGFzKCk6IHZvaWQgeyB9XG5cdG1hcmtBbm9ueW1vdXNSYXRlTGltaXRlZCgpOiB2b2lkIHsgfVxuXHRtYXJrU2V0dXBDb21wbGV0ZWQoKTogdm9pZCB7IH1cblx0c2V0Rm9yY2VIaWRkZW4oX2hpZGRlbjogYm9vbGVhbik6IHZvaWQgeyB9XG5cdGFzeW5jIHVwZGF0ZShfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7IH1cbn1cblxuLyoqXG4gKiBNb2NrIGltcGxlbWVudGF0aW9uIG9mIElEZWZhdWx0QWNjb3VudFNlcnZpY2UgdGhhdCByZXR1cm5zIGEgZmFrZVxuICogc2lnbmVkLWluIGFjY291bnQgc28gdGhlIFwiU2lnbiBJblwiIGJ1dHRvbiBpbiB0aGUgc2lkZWJhciBpcyBoaWRkZW4uXG4gKi9cbmNsYXNzIE1vY2tEZWZhdWx0QWNjb3VudFNlcnZpY2UgaW1wbGVtZW50cyBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZURlZmF1bHRBY2NvdW50ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQb2xpY3lEYXRhID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgcG9saWN5RGF0YTogSVBvbGljeURhdGEgfCBudWxsID0gbnVsbDtcblx0cmVhZG9ubHkgY3VycmVudERlZmF1bHRBY2NvdW50OiBJRGVmYXVsdEFjY291bnQgfCBudWxsID0gTU9DS19BQ0NPVU5UO1xuXHRyZWFkb25seSBjb3BpbG90VG9rZW5JbmZvOiBJQ29waWxvdFRva2VuSW5mbyB8IG51bGwgPSBudWxsO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvcGlsb3RUb2tlbkluZm8gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBtYW5hZ2VkU2V0dGluZ3NGZXRjaFN0YXR1czogbnVsbCA9IG51bGw7XG5cdHJlYWRvbmx5IG1hbmFnZWRTZXR0aW5nc0ZldGNoZWRBdDogbnVsbCA9IG51bGw7XG5cdHJlYWRvbmx5IG1hbmFnZWRTZXR0aW5nc1Jhd1Jlc3BvbnNlOiB1bmtub3duID0gbnVsbDtcblx0cmVhZG9ubHkgbWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yID0gbnVsbDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VNYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3IgPSBFdmVudC5Ob25lO1xuXG5cdGFzeW5jIGdldERlZmF1bHRBY2NvdW50KCk6IFByb21pc2U8SURlZmF1bHRBY2NvdW50IHwgbnVsbD4geyByZXR1cm4gTU9DS19BQ0NPVU5UOyB9XG5cdGdldERlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlcigpOiBJRGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyIHsgcmV0dXJuIE1PQ0tfQUNDT1VOVC5hdXRoZW50aWNhdGlvblByb3ZpZGVyOyB9XG5cdHJlc29sdmVHaXRIdWJVcmwocGF0aDogc3RyaW5nKTogc3RyaW5nIHsgcmV0dXJuIGBodHRwczovL2dpdGh1Yi5jb20vJHtwYXRofWA7IH1cblx0c2V0RGVmYXVsdEFjY291bnRQcm92aWRlcigpOiB2b2lkIHsgfVxuXHRhc3luYyByZWZyZXNoKCk6IFByb21pc2U8SURlZmF1bHRBY2NvdW50IHwgbnVsbD4geyByZXR1cm4gTU9DS19BQ0NPVU5UOyB9XG5cdGFzeW5jIHNpZ25JbigpOiBQcm9taXNlPElEZWZhdWx0QWNjb3VudCB8IG51bGw+IHsgcmV0dXJuIE1PQ0tfQUNDT1VOVDsgfVxuXHRhc3luYyBzaWduT3V0KCk6IFByb21pc2U8dm9pZD4geyB9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gTW9jayBjaGF0IHJlc3BvbnNlcyBhbmQgZmlsZSBjaGFuZ2VzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBQYXRocyB0aGF0IGV4aXN0IGluIHRoZSBtb2NrLWZzIGZpbGUgc3RvcmUgcHJlLXNlZWRlZCBieSB0aGUgbW9jayBleHRlbnNpb24uXG4gKiBVc2VkIHRvIGRldGVybWluZSB3aGV0aGVyIGEgdGV4dEVkaXQgc2hvdWxkIHJlcGxhY2UgZmlsZSBjb250ZW50IChleGlzdGluZylcbiAqIG9yIGluc2VydCBpbnRvIGFuIGVtcHR5IGJ1ZmZlciAobmV3IGZpbGUpLCBzbyB0aGUgcmVhbCBDaGF0RWRpdGluZ1NlcnZpY2VcbiAqIGNvbXB1dGVzIG1lYW5pbmdmdWwgYmVmb3JlL2FmdGVyIGRpZmZzLlxuICovXG5jb25zdCBFWElTVElOR19NT0NLX0ZJTEVTID0gbmV3IFNldChbJy9tb2NrLXJlcG8vc3JjL2luZGV4LnRzJywgJy9tb2NrLXJlcG8vc3JjL3V0aWxzLnRzJywgJy9tb2NrLXJlcG8vcGFja2FnZS5qc29uJywgJy9tb2NrLXJlcG8vUkVBRE1FLm1kJ10pO1xuXG5pbnRlcmZhY2UgTW9ja0ZpbGVFZGl0IHtcblx0dXJpOiBVUkk7XG5cdGNvbnRlbnQ6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIE1vY2tSZXNwb25zZSB7XG5cdHRleHQ6IHN0cmluZztcblx0ZmlsZUVkaXRzPzogTW9ja0ZpbGVFZGl0W107XG59XG5cbi8qKlxuICogRW1pdCB0ZXh0RWRpdCBwcm9ncmVzcyBpdGVtcyBmb3IgZWFjaCBmaWxlIGVkaXQgdXNpbmcgdGhlIHJlYWwgQ2hhdE1vZGVsXG4gKiBwaXBlbGluZS4gRXhpc3RpbmcgZmlsZXMgdXNlIGEgZnVsbC1maWxlIHJlcGxhY2VtZW50IHJhbmdlIHNvIHRoZSByZWFsXG4gKiBDaGF0RWRpdGluZ1NlcnZpY2UgY29tcHV0ZXMgYW4gYWNjdXJhdGUgZGlmZi4gTmV3IGZpbGVzIHVzZSBhblxuICogaW5zZXJ0LWF0LWJlZ2lubmluZyByYW5nZS5cbiAqL1xuZnVuY3Rpb24gZW1pdEZpbGVFZGl0cyhmaWxlRWRpdHM6IE1vY2tGaWxlRWRpdFtdLCBwcm9ncmVzczogKHBhcnRzOiBJQ2hhdFByb2dyZXNzW10pID0+IHZvaWQpOiB2b2lkIHtcblx0Zm9yIChjb25zdCBlZGl0IG9mIGZpbGVFZGl0cykge1xuXHRcdGNvbnN0IGlzRXhpc3RpbmdGaWxlID0gRVhJU1RJTkdfTU9DS19GSUxFUy5oYXMoZWRpdC51cmkucGF0aCk7XG5cdFx0Y29uc3QgcmFuZ2UgPSBpc0V4aXN0aW5nRmlsZVxuXHRcdFx0PyB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDk5OTk5LCBlbmRDb2x1bW46IDEgfVxuXHRcdFx0OiB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMSB9O1xuXHRcdGNvbnNvbGUubG9nKGBbU2Vzc2lvbnMgV2ViIFRlc3RdIEVtaXR0aW5nIHRleHRFZGl0IGZvciAke2VkaXQudXJpLnRvU3RyaW5nKCl9IChleGlzdGluZzogJHtpc0V4aXN0aW5nRmlsZX0sIHJhbmdlOiAke3JhbmdlLnN0YXJ0TGluZU51bWJlcn0tJHtyYW5nZS5lbmRMaW5lTnVtYmVyfSlgKTtcblx0XHRwcm9ncmVzcyhbe1xuXHRcdFx0a2luZDogJ3RleHRFZGl0Jyxcblx0XHRcdHVyaTogZWRpdC51cmksXG5cdFx0XHRlZGl0czogW3sgcmFuZ2UsIHRleHQ6IGVkaXQuY29udGVudCB9XSxcblx0XHRcdGRvbmU6IHRydWUsXG5cdFx0fV0pO1xuXHR9XG59XG5cbi8qKlxuICogUmV0dXJuIGNhbm5lZCByZXNwb25zZSB0ZXh0IGFuZCBmaWxlIGVkaXRzIGtleWVkIGJ5IHVzZXIgbWVzc2FnZSBrZXl3b3Jkcy5cbiAqXG4gKiBGaWxlIGVkaXRzIHRhcmdldCBVUklzIGluIHRoZSBtb2NrLWZzOi8vIGZpbGVzeXN0ZW0uIEVkaXRzIGZvciBleGlzdGluZ1xuICogZmlsZXMgcHJvZHVjZSByZWFsIGRpZmZzIChvcmlnaW5hbCBjb250ZW50IGZyb20gbW9jay1mcyBcdTIxOTIgbmV3IGNvbnRlbnQgaGVyZSkuXG4gKiBFZGl0cyBmb3IgbmV3IGZpbGVzIHByb2R1Y2UgXCJmaWxlIGNyZWF0ZWRcIiBlbnRyaWVzLlxuICovXG5mdW5jdGlvbiBnZXRNb2NrUmVzcG9uc2VXaXRoRWRpdHMobWVzc2FnZTogc3RyaW5nKTogTW9ja1Jlc3BvbnNlIHtcblx0aWYgKC9idWlsZHxjb21waWxlfGNyZWF0ZS9pLnRlc3QobWVzc2FnZSkpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dGV4dDogJ0lcXCdsbCBoZWxwIHlvdSBidWlsZCB0aGUgcHJvamVjdC4gSGVyZSBhcmUgdGhlIGNoYW5nZXM6Jyxcblx0XHRcdGZpbGVFZGl0czogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Ly8gTW9kaWZ5IGV4aXN0aW5nIGZpbGUgXHUyMDE0IGFkZHMgYnVpbGQgaW1wb3J0ICsgY2FsbFxuXHRcdFx0XHRcdHVyaTogVVJJLmZyb20oeyBzY2hlbWU6ICdtb2NrLWZzJywgYXV0aG9yaXR5OiAnbW9jay1yZXBvJywgcGF0aDogJy9tb2NrLXJlcG8vc3JjL2luZGV4LnRzJyB9KSxcblx0XHRcdFx0XHRjb250ZW50OiAnaW1wb3J0IHsgYnVpbGQgfSBmcm9tIFwiLi9idWlsZFwiO1xcblxcbmV4cG9ydCBmdW5jdGlvbiBtYWluKCkge1xcblxcdGNvbnNvbGUubG9nKFwiSGVsbG8gZnJvbSBtb2NrIHJlcG9cIik7XFxuXFx0YnVpbGQoKTtcXG59XFxuJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdC8vIE5ldyBmaWxlIFx1MjAxNCBjcmVhdGVzIGJ1aWxkIHNjcmlwdFxuXHRcdFx0XHRcdHVyaTogVVJJLmZyb20oeyBzY2hlbWU6ICdtb2NrLWZzJywgYXV0aG9yaXR5OiAnbW9jay1yZXBvJywgcGF0aDogJy9tb2NrLXJlcG8vc3JjL2J1aWxkLnRzJyB9KSxcblx0XHRcdFx0XHRjb250ZW50OiAnZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGJ1aWxkKCkge1xcblxcdGNvbnNvbGUubG9nKFwiQnVpbGRpbmcuLi5cIik7XFxuXFx0Y29uc29sZS5sb2coXCJCdWlsZCBjb21wbGV0ZSFcIik7XFxufVxcbicsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHQvLyBNb2RpZnkgZXhpc3RpbmcgZmlsZSBcdTIwMTQgYWRkcyBidWlsZCBzY3JpcHRcblx0XHRcdFx0XHR1cmk6IFVSSS5mcm9tKHsgc2NoZW1lOiAnbW9jay1mcycsIGF1dGhvcml0eTogJ21vY2stcmVwbycsIHBhdGg6ICcvbW9jay1yZXBvL3BhY2thZ2UuanNvbicgfSksXG5cdFx0XHRcdFx0Y29udGVudDogJ3tcXG5cXHRcIm5hbWVcIjogXCJtb2NrLXJlcG9cIixcXG5cXHRcInZlcnNpb25cIjogXCIxLjAuMFwiLFxcblxcdFwic2NyaXB0c1wiOiB7XFxuXFx0XFx0XCJidWlsZFwiOiBcIm5vZGUgc3JjL2J1aWxkLnRzXCJcXG5cXHR9XFxufVxcbicsXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdH07XG5cdH1cblx0aWYgKC9maXh8YnVnL2kudGVzdChtZXNzYWdlKSkge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0ZXh0OiAnSSBmb3VuZCB0aGUgaXNzdWUgYW5kIGFwcGxpZWQgdGhlIGZpeC4gVGhlIGlucHV0IHZhbGlkYXRpb24gaGFzIGJlZW4gYWRkZWQuJyxcblx0XHRcdGZpbGVFZGl0czogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Ly8gTW9kaWZ5IGV4aXN0aW5nIGZpbGUgXHUyMDE0IGFkZHMgaW5wdXQgdmFsaWRhdGlvblxuXHRcdFx0XHRcdHVyaTogVVJJLmZyb20oeyBzY2hlbWU6ICdtb2NrLWZzJywgYXV0aG9yaXR5OiAnbW9jay1yZXBvJywgcGF0aDogJy9tb2NrLXJlcG8vc3JjL3V0aWxzLnRzJyB9KSxcblx0XHRcdFx0XHRjb250ZW50OiAnZXhwb3J0IGZ1bmN0aW9uIGFkZChhOiBudW1iZXIsIGI6IG51bWJlcik6IG51bWJlciB7XFxuXFx0aWYgKHR5cGVvZiBhICE9PSBcIm51bWJlclwiIHx8IHR5cGVvZiBiICE9PSBcIm51bWJlclwiKSB7XFxuXFx0XFx0dGhyb3cgbmV3IFR5cGVFcnJvcihcIkJvdGggYXJndW1lbnRzIG11c3QgYmUgbnVtYmVyc1wiKTtcXG5cXHR9XFxuXFx0cmV0dXJuIGEgKyBiO1xcbn1cXG4nLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHR9O1xuXHR9XG5cdGlmICgvZXhwbGFpbnxkZXNjcmliZS9pLnRlc3QobWVzc2FnZSkpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dGV4dDogJ1RoaXMgcHJvamVjdCBoYXMgYSBzaW1wbGUgc3RydWN0dXJlIHdpdGggYSBtYWluIGVudHJ5IHBvaW50IGFuZCB1dGlsaXR5IGZ1bmN0aW9ucy4nLFxuXHRcdH07XG5cdH1cblx0cmV0dXJuIHtcblx0XHR0ZXh0OiAnSSB1bmRlcnN0YW5kIHlvdXIgcmVxdWVzdC4gTGV0IG1lIHdvcmsgb24gdGhhdC5cXG5cXG4xLiBSZXZpZXcgdGhlIGNvZGViYXNlXFxuMi4gTWFrZSBjaGFuZ2VzXFxuMy4gUnVuIHRlc3RzJyxcblx0fTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBXb3JrYmVuY2ggY29udHJpYnV0aW9uIFx1MjAxNCByZWdpc3RlcnMgbW9jayBjaGF0IGFnZW50IGFuZCBwcmUtc2VlZHMgZm9sZGVyXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY2xhc3MgTW9ja0NoYXRBZ2VudENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnc2Vzc2lvbnMudGVzdC5tb2NrQ2hhdEFnZW50JztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uSXRlbXM6IElDaGF0U2Vzc2lvbkl0ZW1bXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pdGVtc0NoYW5nZWRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8SUNoYXRTZXNzaW9uSXRlbXNEZWx0YT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkhpc3RvcnkgPSBuZXcgTWFwPHN0cmluZywgSUNoYXRTZXNzaW9uSGlzdG9yeUl0ZW1bXT4oKTtcblx0cHJpdmF0ZSBfd29ya3RyZWVDb3VudGVyID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0QWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZSxcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pdGVtc0NoYW5nZWRFbWl0dGVyKTtcblx0XHR0aGlzLnJlZ2lzdGVyTW9ja0FnZW50cygpO1xuXHRcdHRoaXMucmVnaXN0ZXJNb2NrU2Vzc2lvblByb3ZpZGVyKCk7XG5cdFx0dGhpcy5yZWdpc3Rlck1vY2tUZXJtaW5hbEJhY2tlbmQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUcmFjayBhIHNlc3Npb24gZm9yIHNpZGViYXIgZGlzcGxheSBhbmQgaGlzdG9yeSByZS1vcGVuaW5nLlxuXHQgKlxuXHQgKiBQb3B1bGF0ZXMgYElDaGF0U2Vzc2lvbkl0ZW0uY2hhbmdlc2Agd2l0aCBmaWxlIGNoYW5nZSBtZXRhZGF0YSBzbyB0aGVcblx0ICogQ2hhbmdlc1ZpZXdQYW5lIGNhbiByZW5kZXIgdGhlbSBmb3IgYmFja2dyb3VuZCAoY29waWxvdGNsaSkgc2Vzc2lvbnMuXG5cdCAqIEJhY2tncm91bmQgc2Vzc2lvbnMgcmVhZCBjaGFuZ2VzIGZyb20gYElBZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbGBcblx0ICogd2hpY2ggZmxvd3MgdGhyb3VnaCBmcm9tIGBJQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlci5pdGVtc2AuXG5cdCAqL1xuXHRwcml2YXRlIGFkZFNlc3Npb25JdGVtKHJlc291cmNlOiBVUkksIG1lc3NhZ2U6IHN0cmluZywgcmVzcG9uc2VUZXh0OiBzdHJpbmcsIGZpbGVFZGl0cz86IE1vY2tGaWxlRWRpdFtdKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXG5cdFx0Ly8gU3RvcmUgY29udmVyc2F0aW9uIGhpc3RvcnkgZm9yIHRoaXMgc2Vzc2lvbiAobmVlZGVkIGZvciByZS1vcGVuaW5nKVxuXHRcdGlmICghdGhpcy5fc2Vzc2lvbkhpc3RvcnkuaGFzKGtleSkpIHtcblx0XHRcdHRoaXMuX3Nlc3Npb25IaXN0b3J5LnNldChrZXksIFtdKTtcblx0XHR9XG5cdFx0dGhpcy5fc2Vzc2lvbkhpc3RvcnkuZ2V0KGtleSkhLnB1c2goXG5cdFx0XHR7IHR5cGU6ICdyZXF1ZXN0JywgcHJvbXB0OiBtZXNzYWdlLCBwYXJ0aWNpcGFudDogJ2NvcGlsb3QnIH0sXG5cdFx0XHR7IHR5cGU6ICdyZXNwb25zZScsIHBhcnRzOiBbeyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogeyB2YWx1ZTogcmVzcG9uc2VUZXh0LCBpc1RydXN0ZWQ6IGZhbHNlLCBzdXBwb3J0VGhlbWVJY29uczogZmFsc2UsIHN1cHBvcnRIdG1sOiBmYWxzZSB9IH1dLCBwYXJ0aWNpcGFudDogJ2NvcGlsb3QnIH0sXG5cdFx0KTtcblxuXHRcdC8vIEJ1aWxkIGZpbGUgY2hhbmdlcyBmb3IgdGhlIHNlc3Npb24gbGlzdCAodXNlZCBieSBDaGFuZ2VzVmlld1BhbmUgZm9yIGJhY2tncm91bmQgc2Vzc2lvbnMpXG5cdFx0Y29uc3QgY2hhbmdlczogSUNoYXRTZXNzaW9uRmlsZUNoYW5nZVtdIHwgdW5kZWZpbmVkID0gZmlsZUVkaXRzPy5tYXAoZWRpdCA9PiAoe1xuXHRcdFx0bW9kaWZpZWRVcmk6IGVkaXQudXJpLFxuXHRcdFx0aW5zZXJ0aW9uczogZWRpdC5jb250ZW50LnNwbGl0KCdcXG4nKS5sZW5ndGgsXG5cdFx0XHRkZWxldGlvbnM6IEVYSVNUSU5HX01PQ0tfRklMRVMuaGFzKGVkaXQudXJpLnBhdGgpID8gMSA6IDAsXG5cdFx0fSkpO1xuXG5cdFx0Ly8gQWRkIG9yIHVwZGF0ZSBzZXNzaW9uIGluIGxpc3Rcblx0XHRjb25zdCBleGlzdGluZ0luZGV4ID0gdGhpcy5fc2Vzc2lvbkl0ZW1zLmZpbmRJbmRleChzID0+IGlzRXF1YWwocy5yZXNvdXJjZSwgcmVzb3VyY2UpKTtcblx0XHRsZXQgYWRkZWRPclVwZGF0ZWQgPSBleGlzdGluZ0luZGV4ICE9PSAtMSA/IHsgLi4udGhpcy5fc2Vzc2lvbkl0ZW1zW2V4aXN0aW5nSW5kZXhdIH0gOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGFkZGVkT3JVcGRhdGVkKSB7XG5cdFx0XHRhZGRlZE9yVXBkYXRlZC50aW1pbmcgPSB7IC4uLmFkZGVkT3JVcGRhdGVkLnRpbWluZywgbGFzdFJlcXVlc3RTdGFydGVkOiBub3csIGxhc3RSZXF1ZXN0RW5kZWQ6IG5vdyB9O1xuXHRcdFx0aWYgKGNoYW5nZXMpIHtcblx0XHRcdFx0YWRkZWRPclVwZGF0ZWQuY2hhbmdlcyA9IGNoYW5nZXM7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zZXNzaW9uSXRlbXNbZXhpc3RpbmdJbmRleF0gPSBhZGRlZE9yVXBkYXRlZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YWRkZWRPclVwZGF0ZWQgPSB7XG5cdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRsYWJlbDogbWVzc2FnZS5zbGljZSgwLCA1MCkgfHwgJ01vY2sgU2Vzc2lvbicsXG5cdFx0XHRcdHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHR0aW1pbmc6IHsgY3JlYXRlZDogbm93LCBsYXN0UmVxdWVzdFN0YXJ0ZWQ6IG5vdywgbGFzdFJlcXVlc3RFbmRlZDogbm93IH0sXG5cdFx0XHRcdG1ldGFkYXRhOiB7IHdvcmt0cmVlUGF0aDogYC9tb2NrLXdvcmt0cmVlcy9zZXNzaW9uLSR7Kyt0aGlzLl93b3JrdHJlZUNvdW50ZXJ9YCB9LFxuXHRcdFx0XHQuLi4oY2hhbmdlcyA/IHsgY2hhbmdlcyB9IDoge30pLFxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX3Nlc3Npb25JdGVtcy5wdXNoKGFkZGVkT3JVcGRhdGVkKTtcblx0XHR9XG5cblx0XHRpZiAoYWRkZWRPclVwZGF0ZWQpIHtcblx0XHRcdHRoaXMuX2l0ZW1zQ2hhbmdlZEVtaXR0ZXIuZmlyZSh7IGFkZGVkT3JVcGRhdGVkOiBbYWRkZWRPclVwZGF0ZWRdIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJNb2NrQWdlbnRzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGFnZW50SWRzID0gWydjb3BpbG90Y2xpJywgJ2NvcGlsb3QtY2xvdWQtYWdlbnQnXTtcblx0XHRjb25zdCBleHRlbnNpb25JZCA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd2c2NvZGUuc2Vzc2lvbnMtZTJlLW1vY2snKTtcblx0XHRjb25zdCBzZWxmID0gdGhpcztcblxuXHRcdGZvciAoY29uc3QgYWdlbnRJZCBvZiBhZ2VudElkcykge1xuXHRcdFx0Y29uc3QgYWdlbnREYXRhOiBJQ2hhdEFnZW50RGF0YSA9IHtcblx0XHRcdFx0aWQ6IGFnZW50SWQsXG5cdFx0XHRcdG5hbWU6IGFnZW50SWQsXG5cdFx0XHRcdGZ1bGxOYW1lOiBgTW9jayBBZ2VudCAoJHthZ2VudElkfSlgLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ01vY2sgY2hhdCBhZ2VudCBmb3IgRTJFIHRlc3RpbmcnLFxuXHRcdFx0XHRleHRlbnNpb25JZCxcblx0XHRcdFx0ZXh0ZW5zaW9uVmVyc2lvbjogJzAuMC4xJyxcblx0XHRcdFx0ZXh0ZW5zaW9uUHVibGlzaGVySWQ6ICd2c2NvZGUnLFxuXHRcdFx0XHRleHRlbnNpb25EaXNwbGF5TmFtZTogJ1Nlc3Npb25zIEUyRSBNb2NrJyxcblx0XHRcdFx0aXNEZWZhdWx0OiBhZ2VudElkID09PSAnY29waWxvdGNsaScsXG5cdFx0XHRcdG1ldGFkYXRhOiB7fSxcblx0XHRcdFx0c2xhc2hDb21tYW5kczogW10sXG5cdFx0XHRcdGxvY2F0aW9uczogW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdLFxuXHRcdFx0XHRtb2RlczogW0NoYXRNb2RlS2luZC5BZ2VudF0sXG5cdFx0XHRcdGRpc2FtYmlndWF0aW9uOiBbXSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGFnZW50SW1wbDogSUNoYXRBZ2VudEltcGxlbWVudGF0aW9uID0ge1xuXHRcdFx0XHRhc3luYyBpbnZva2UocmVxdWVzdCwgcHJvZ3Jlc3M6IChwYXJ0czogSUNoYXRQcm9ncmVzc1tdKSA9PiB2b2lkLCBfaGlzdG9yeSwgX3Rva2VuKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5sb2coYFtTZXNzaW9ucyBXZWIgVGVzdF0gTW9jayBhZ2VudCBcIiR7YWdlbnRJZH1cIiBpbnZva2VkOiBcIiR7cmVxdWVzdC5tZXNzYWdlfVwiYCk7XG5cdFx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBnZXRNb2NrUmVzcG9uc2VXaXRoRWRpdHMocmVxdWVzdC5tZXNzYWdlKTtcblxuXHRcdFx0XHRcdC8vIFN0cmVhbSB0aGUgdGV4dCByZXNwb25zZVxuXHRcdFx0XHRcdHByb2dyZXNzKFt7XG5cdFx0XHRcdFx0XHRraW5kOiAnbWFya2Rvd25Db250ZW50Jyxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IHsgdmFsdWU6IHJlc3BvbnNlLnRleHQsIGlzVHJ1c3RlZDogZmFsc2UsIHN1cHBvcnRUaGVtZUljb25zOiBmYWxzZSwgc3VwcG9ydEh0bWw6IGZhbHNlIH0sXG5cdFx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdFx0Ly8gRW1pdCBmaWxlIGVkaXRzIHRocm91Z2ggdGhlIHJlYWwgQ2hhdE1vZGVsIHBpcGVsaW5lIHNvXG5cdFx0XHRcdFx0Ly8gQ2hhdEVkaXRpbmdTZXJ2aWNlIGNvbXB1dGVzIGFjdHVhbCBkaWZmc1xuXHRcdFx0XHRcdGlmIChyZXNwb25zZS5maWxlRWRpdHMpIHtcblx0XHRcdFx0XHRcdGVtaXRGaWxlRWRpdHMocmVzcG9uc2UuZmlsZUVkaXRzLCBwcm9ncmVzcyk7XG5cdFx0XHRcdFx0XHRjb25zb2xlLmxvZyhgW1Nlc3Npb25zIFdlYiBUZXN0XSBFbWl0dGVkICR7cmVzcG9uc2UuZmlsZUVkaXRzLmxlbmd0aH0gZmlsZSBlZGl0cyBPS2ApO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHNlbGYuYWRkU2Vzc2lvbkl0ZW0ocmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3QubWVzc2FnZSwgcmVzcG9uc2UudGV4dCwgcmVzcG9uc2UuZmlsZUVkaXRzKTtcblx0XHRcdFx0XHRyZXR1cm4geyBtZXRhZGF0YTogeyBtb2NrOiB0cnVlIH0gfTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdEFnZW50U2VydmljZS5yZWdpc3RlckR5bmFtaWNBZ2VudChhZ2VudERhdGEsIGFnZW50SW1wbCkpO1xuXHRcdFx0XHRjb25zb2xlLmxvZyhgW1Nlc3Npb25zIFdlYiBUZXN0XSBSZWdpc3RlcmVkIG1vY2sgYWdlbnQ6ICR7YWdlbnRJZH1gKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRjb25zb2xlLndhcm4oYFtTZXNzaW9ucyBXZWIgVGVzdF0gRmFpbGVkIHRvIHJlZ2lzdGVyIGFnZW50ICR7YWdlbnRJZH06YCwgZXJyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTW9ja1Nlc3Npb25Qcm92aWRlcigpOiB2b2lkIHtcblx0XHRjb25zdCBzY2hlbWVzID0gWydjb3BpbG90Y2xpJywgJ2NvcGlsb3QtY2xvdWQtYWdlbnQnXTtcblx0XHRjb25zdCBzZWxmID0gdGhpcztcblx0XHRmb3IgKGNvbnN0IHNjaGVtZSBvZiBzY2hlbWVzKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcihzY2hlbWUsIHtcblx0XHRcdFx0XHRhc3luYyBwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KHNlc3Npb25SZXNvdXJjZSwgX3Rva2VuKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBrZXkgPSBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdFx0XHRcdC8vIEVuc3VyZSB0aGUgaGlzdG9yeSBhcnJheSBpcyBzdG9yZWQgaW4gX3Nlc3Npb25IaXN0b3J5IHNvXG5cdFx0XHRcdFx0XHQvLyBhZGRTZXNzaW9uSXRlbSBwdXNoZXMgaW50byB0aGUgU0FNRSByZWZlcmVuY2UgcmV0dXJuZWQgaGVyZS5cblx0XHRcdFx0XHRcdGlmICghc2VsZi5fc2Vzc2lvbkhpc3RvcnkuaGFzKGtleSkpIHtcblx0XHRcdFx0XHRcdFx0c2VsZi5fc2Vzc2lvbkhpc3Rvcnkuc2V0KGtleSwgW10pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgaGlzdG9yeSA9IHNlbGYuX3Nlc3Npb25IaXN0b3J5LmdldChrZXkpITtcblx0XHRcdFx0XHRcdGNvbnNvbGUubG9nKGBbU2Vzc2lvbnMgV2ViIFRlc3RdIE9wZW5pbmcgc2Vzc2lvbiAke2tleX0gKCR7aGlzdG9yeS5sZW5ndGh9IGhpc3RvcnkgaXRlbXMpYCk7XG5cdFx0XHRcdFx0XHRjb25zdCBkaXNwb3NlRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0XHRcdFx0XHRjb25zdCBpc0NvbXBsZXRlID0gb2JzZXJ2YWJsZVZhbHVlKCdpc0NvbXBsZXRlJywgaGlzdG9yeS5sZW5ndGggPiAwKTtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRcdFx0aGlzdG9yeSxcblx0XHRcdFx0XHRcdFx0aXNDb21wbGV0ZU9iczogaXNDb21wbGV0ZSxcblx0XHRcdFx0XHRcdFx0b25XaWxsRGlzcG9zZTogZGlzcG9zZUVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRcdFx0XHRcdGFzeW5jIHJlcXVlc3RIYW5kbGVyKHJlcXVlc3QsIHByb2dyZXNzLCBfaGlzdG9yeSwgX3Rva2VuKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc29sZS5sb2coYFtTZXNzaW9ucyBXZWIgVGVzdF0gU2Vzc2lvbiByZXF1ZXN0OiBcIiR7cmVxdWVzdC5tZXNzYWdlfVwiYCk7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBnZXRNb2NrUmVzcG9uc2VXaXRoRWRpdHMocmVxdWVzdC5tZXNzYWdlKTtcblx0XHRcdFx0XHRcdFx0XHRwcm9ncmVzcyhbe1xuXHRcdFx0XHRcdFx0XHRcdFx0a2luZDogJ21hcmtkb3duQ29udGVudCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRjb250ZW50OiB7IHZhbHVlOiByZXNwb25zZS50ZXh0LCBpc1RydXN0ZWQ6IGZhbHNlLCBzdXBwb3J0VGhlbWVJY29uczogZmFsc2UsIHN1cHBvcnRIdG1sOiBmYWxzZSB9LFxuXHRcdFx0XHRcdFx0XHRcdH1dKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAocmVzcG9uc2UuZmlsZUVkaXRzKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRlbWl0RmlsZUVkaXRzKHJlc3BvbnNlLmZpbGVFZGl0cywgcHJvZ3Jlc3MpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRpc0NvbXBsZXRlLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRkaXNwb3NlKCkgeyBkaXNwb3NlRW1pdHRlci5maXJlKCk7IGRpc3Bvc2VFbWl0dGVyLmRpc3Bvc2UoKTsgfSxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdC8vIFJlZ2lzdGVyIGFuIGl0ZW0gY29udHJvbGxlciBzbyBzZXNzaW9ucyBhcHBlYXIgaW4gdGhlIHNpZGViYXIgbGlzdC5cblx0XHRcdFx0Ly8gT25seSBjb3BpbG90Y2xpIChCYWNrZ3JvdW5kKSBzZXNzaW9ucyBuZWVkIHJlYWwgaXRlbXMgXHUyMDE0IHRoZVxuXHRcdFx0XHQvLyBjb3BpbG90LWNsb3VkLWFnZW50IGNvbnRyb2xsZXIgbXVzdCByZXR1cm4gYW4gZW1wdHkgYXJyYXkgdG9cblx0XHRcdFx0Ly8gcHJldmVudCBpdCBmcm9tIG92ZXJ3cml0aW5nIHNlc3Npb25zIHdpdGggdGhlIHdyb25nIHByb3ZpZGVyVHlwZVxuXHRcdFx0XHQvLyBkdXJpbmcgYSBmdWxsIG1vZGVsIHJlc29sdmUuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXJJdGVtcyA9IHNjaGVtZSA9PT0gJ2NvcGlsb3RjbGknID8gdGhpcy5fc2Vzc2lvbkl0ZW1zIDogW107XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoc2NoZW1lLCB7XG5cdFx0XHRcdFx0b25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zOiB0aGlzLl9pdGVtc0NoYW5nZWRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0XHRcdGdldCBpdGVtcygpIHsgcmV0dXJuIGNvbnRyb2xsZXJJdGVtczsgfSxcblx0XHRcdFx0XHRhc3luYyByZWZyZXNoKCkgeyAvKiBpbi1tZW1vcnksIG5vLW9wICovIH0sXG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRjb25zb2xlLmxvZyhgW1Nlc3Npb25zIFdlYiBUZXN0XSBSZWdpc3RlcmVkIHNlc3Npb24gcHJvdmlkZXIgZm9yIHNjaGVtZTogJHtzY2hlbWV9YCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKGBbU2Vzc2lvbnMgV2ViIFRlc3RdIEZhaWxlZCB0byByZWdpc3RlciBzZXNzaW9uIHByb3ZpZGVyIGZvciAke3NjaGVtZX06YCwgZXJyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTW9ja1Rlcm1pbmFsQmFja2VuZCgpOiB2b2lkIHtcblx0XHRjb25zdCB0ZXJtaW5hbFNlcnZpY2UgPSB0aGlzLnRlcm1pbmFsU2VydmljZTtcblx0XHRjb25zdCBiYWNrZW5kID0gdGhpcy5jcmVhdGVNb2NrVGVybWluYWxCYWNrZW5kKCk7XG5cdFx0UmVnaXN0cnkuYXM8SVRlcm1pbmFsQmFja2VuZFJlZ2lzdHJ5PihUZXJtaW5hbEV4dGVuc2lvbnMuQmFja2VuZCkucmVnaXN0ZXJUZXJtaW5hbEJhY2tlbmQoYmFja2VuZCk7XG5cdFx0dGVybWluYWxTZXJ2aWNlLnJlZ2lzdGVyUHJvY2Vzc1N1cHBvcnQodHJ1ZSk7XG5cdFx0Y29uc29sZS5sb2coJ1tTZXNzaW9ucyBXZWIgVGVzdF0gUmVnaXN0ZXJlZCBtb2NrIHRlcm1pbmFsIGJhY2tlbmQnKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlTW9ja1Rlcm1pbmFsQmFja2VuZCgpOiBJVGVybWluYWxCYWNrZW5kIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVtb3RlQXV0aG9yaXR5OiB1bmRlZmluZWQsXG5cdFx0XHRpc1ZpcnR1YWxQcm9jZXNzOiBmYWxzZSxcblx0XHRcdGlzUmVzcG9uc2l2ZTogdHJ1ZSxcblx0XHRcdHdoZW5SZWFkeTogUHJvbWlzZS5yZXNvbHZlKCksXG5cdFx0XHRzZXRSZWFkeTogKCkgPT4geyB9LFxuXHRcdFx0b25EaWRSZXF1ZXN0RGV0YWNoOiBFdmVudC5Ob25lLFxuXHRcdFx0YXR0YWNoVG9Qcm9jZXNzOiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignTm90IHN1cHBvcnRlZCcpOyB9LFxuXHRcdFx0YXR0YWNoVG9SZXZpdmVkUHJvY2VzczogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQnKTsgfSxcblx0XHRcdGxpc3RQcm9jZXNzZXM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0Z2V0UHJvZmlsZXM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0Z2V0RGVmYXVsdFByb2ZpbGU6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGdldERlZmF1bHRTeXN0ZW1TaGVsbDogYXN5bmMgKCkgPT4gJy9iaW4vbW9jay1zaGVsbCcsXG5cdFx0XHRnZXRTaGVsbEVudmlyb25tZW50OiBhc3luYyAoKSA9PiAoe30pLFxuXHRcdFx0c2V0VGVybWluYWxMYXlvdXRJbmZvOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRnZXRUZXJtaW5hbExheW91dEluZm86IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdHJlZHVjZUNvbm5lY3Rpb25HcmFjZVRpbWU6ICgpID0+IHsgfSxcblx0XHRcdHJlcXVlc3REZXRhY2hJbnN0YW5jZTogKCkgPT4geyB9LFxuXHRcdFx0YWNjZXB0RGV0YWNoSW5zdGFuY2VSZXBseTogKCkgPT4geyB9LFxuXHRcdFx0cGVyc2lzdFRlcm1pbmFsU3RhdGU6ICgpID0+IHsgfSxcblx0XHRcdGNyZWF0ZVByb2Nlc3M6IGFzeW5jIChfc2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZywgX2N3ZDogc3RyaW5nIHwgVVJJLCBfY29sczogbnVtYmVyLCBfcm93czogbnVtYmVyLCBfdW5pY29kZVZlcnNpb246IHN0cmluZywgX2VudjogSVByb2Nlc3NFbnZpcm9ubWVudCwgX29wdGlvbnM6IElUZXJtaW5hbFByb2Nlc3NPcHRpb25zLCBfc2hvdWxkUGVyc2lzdDogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHRjb25zdCBvblByb2Nlc3NEYXRhID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXHRcdFx0XHRjb25zdCBvblByb2Nlc3NSZWFkeSA9IG5ldyBFbWl0dGVyPElQcm9jZXNzUmVhZHlFdmVudD4oKTtcblx0XHRcdFx0Y29uc3Qgb25Qcm9jZXNzRXhpdCA9IG5ldyBFbWl0dGVyPG51bWJlciB8IHVuZGVmaW5lZD4oKTtcblx0XHRcdFx0Y29uc3Qgb25EaWRDaGFuZ2VIYXNDaGlsZFByb2Nlc3NlcyA9IG5ldyBFbWl0dGVyPGJvb2xlYW4+KCk7XG5cdFx0XHRcdGNvbnN0IG9uRGlkQ2hhbmdlUHJvcGVydHkgPSBuZXcgRW1pdHRlcjxJUHJvY2Vzc1Byb3BlcnR5PFByb2Nlc3NQcm9wZXJ0eVR5cGU+PigpO1xuXG5cdFx0XHRcdC8vIFJlc29sdmUgY3dkIGZyb20gY3JlYXRlUHJvY2VzcyBhcmcgb3Igc2hlbGxMYXVuY2hDb25maWdcblx0XHRcdFx0Y29uc3QgcmF3Q3dkID0gX2N3ZCB8fCBfc2hlbGxMYXVuY2hDb25maWcuY3dkO1xuXHRcdFx0XHRjb25zdCBjd2QgPSAhcmF3Q3dkID8gJy8nIDogdHlwZW9mIHJhd0N3ZCA9PT0gJ3N0cmluZycgPyByYXdDd2QgOiByYXdDd2QucGF0aDtcblx0XHRcdFx0Y29uc29sZS5sb2coYFtTZXNzaW9ucyBXZWIgVGVzdF0gTW9jayB0ZXJtaW5hbCBjcmVhdGVQcm9jZXNzIGN3ZDogJyR7Y3dkfScgKHJhdyBfY3dkOiAnJHtfY3dkfScsIHNsYy5jd2Q6ICcke19zaGVsbExhdW5jaENvbmZpZy5jd2R9JylgKTtcblxuXHRcdFx0XHQvLyBGaXJlIHJlYWR5IGFmdGVyIGEgbWljcm90YXNrIHNvIHRoZSB0ZXJtaW5hbCBzZXJ2aWNlIGNhbiB3aXJlIHVwIGxpc3RlbmVyc1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRvblByb2Nlc3NSZWFkeS5maXJlKHsgcGlkOiAxLCBjd2QsIHdpbmRvd3NQdHk6IHVuZGVmaW5lZCB9KTtcblx0XHRcdFx0fSwgMCk7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZDogMCxcblx0XHRcdFx0XHRzaG91bGRQZXJzaXN0OiBmYWxzZSxcblx0XHRcdFx0XHRvblByb2Nlc3NEYXRhOiBvblByb2Nlc3NEYXRhLmV2ZW50LFxuXHRcdFx0XHRcdG9uUHJvY2Vzc1JlYWR5OiBvblByb2Nlc3NSZWFkeS5ldmVudCxcblx0XHRcdFx0XHRvbkRpZENoYW5nZUhhc0NoaWxkUHJvY2Vzc2VzOiBvbkRpZENoYW5nZUhhc0NoaWxkUHJvY2Vzc2VzLmV2ZW50LFxuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlUHJvcGVydHk6IG9uRGlkQ2hhbmdlUHJvcGVydHkuZXZlbnQsXG5cdFx0XHRcdFx0b25Qcm9jZXNzRXhpdDogb25Qcm9jZXNzRXhpdC5ldmVudCxcblx0XHRcdFx0XHRzdGFydDogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNodXRkb3duOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdFx0aW5wdXQ6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0XHRyZXNpemU6ICgpID0+IHsgfSxcblx0XHRcdFx0XHRjbGVhckJ1ZmZlcjogKCkgPT4geyB9LFxuXHRcdFx0XHRcdGFja25vd2xlZGdlRGF0YUV2ZW50OiAoKSA9PiB7IH0sXG5cdFx0XHRcdFx0c2V0VW5pY29kZVZlcnNpb246IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0XHRnZXRJbml0aWFsQ3dkOiBhc3luYyAoKSA9PiBjd2QsXG5cdFx0XHRcdFx0Z2V0Q3dkOiBhc3luYyAoKSA9PiBjd2QsXG5cdFx0XHRcdFx0Z2V0TGF0ZW5jeTogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRcdFx0cHJvY2Vzc0JpbmFyeTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRcdHJlZnJlc2hQcm9wZXJ0eTogYXN5bmMgKHByb3BlcnR5OiBQcm9jZXNzUHJvcGVydHlUeXBlKSA9PiB7IHRocm93IG5ldyBFcnJvcihgTm90IHN1cHBvcnRlZDogJHtwcm9wZXJ0eX1gKTsgfSxcblx0XHRcdFx0XHR1cGRhdGVQcm9wZXJ0eTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRcdGNsZWFyVW5yZXNwb25kZWRSZXF1ZXN0OiAoKSA9PiB7IH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9LFxuXHRcdFx0Z2V0V3NsUGF0aDogYXN5bmMgKG9yaWdpbmFsOiBzdHJpbmcsIF9kaXJlY3Rpb246ICd1bml4LXRvLXdpbicgfCAnd2luLXRvLXVuaXgnKSA9PiBvcmlnaW5hbCxcblx0XHRcdGdldEVudmlyb25tZW50OiBhc3luYyAoKSA9PiAoe30pLFxuXHRcdFx0Z2V0TGF0ZW5jeTogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRnZXRQZXJmb3JtYW5jZU1hcmtzOiAoKSA9PiBbXSxcblx0XHRcdHVwZGF0ZVRpdGxlOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHR1cGRhdGVJY29uOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRzZXROZXh0Q29tbWFuZElkOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRyZXN0YXJ0UHR5SG9zdDogKCkgPT4geyB9LFxuXHRcdFx0aW5zdGFsbEF1dG9SZXBseTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0dW5pbnN0YWxsQWxsQXV0b1JlcGxpZXM6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdG9uUHR5SG9zdFVucmVzcG9uc2l2ZTogRXZlbnQuTm9uZSxcblx0XHRcdG9uUHR5SG9zdFJlc3BvbnNpdmU6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvblB0eUhvc3RSZXN0YXJ0OiBFdmVudC5Ob25lLFxuXHRcdFx0b25QdHlIb3N0Q29ubmVjdGVkOiBFdmVudC5Ob25lLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJVGVybWluYWxCYWNrZW5kO1xuXHR9XG5cblxufVxuXG4vLyBSZWdpc3RlciB0aGUgY29udHJpYnV0aW9uIHNvIGl0IHJ1bnMgZHVyaW5nIHdvcmtiZW5jaCBzdGFydHVwXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoTW9ja0NoYXRBZ2VudENvbnRyaWJ1dGlvbi5JRCwgTW9ja0NoYXRBZ2VudENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tTdGFydHVwKTtcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBNb2NrR2l0U2VydmljZSBcdTIwMTQgcmVzb2x2ZXMgaW1tZWRpYXRlbHkgaW5zdGVhZCBvZiB3YWl0aW5nIDEwcyBmb3IgZGVsZWdhdGVcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5jbGFzcyBNb2NrR2l0U2VydmljZSBpbXBsZW1lbnRzIElHaXRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHJlcG9zaXRvcmllczogSXRlcmFibGU8SUdpdFJlcG9zaXRvcnk+ID0gW107XG5cdHNldERlbGVnYXRlKF9kZWxlZ2F0ZTogSUdpdEV4dGVuc2lvbkRlbGVnYXRlKSB7IHJldHVybiBEaXNwb3NhYmxlLk5vbmU7IH1cblx0YXN5bmMgb3BlblJlcG9zaXRvcnkoX3VyaTogVVJJKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBUZXN0U2Vzc2lvbnNCcm93c2VyTWFpblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogVGVzdCB2YXJpYW50IG9mIFNlc3Npb25zQnJvd3Nlck1haW4gdGhhdCBpbmplY3RzIG1vY2sgc2VydmljZXNcbiAqIGZvciBFMkUgdGVzdGluZy4gTW9jayBzaW5nbGV0b25zIGFyZSBwYXRjaGVkIGludG8gdGhlIGdsb2JhbFxuICogc2luZ2xldG9uIHJlZ2lzdHJ5IGJlZm9yZSBgc3VwZXIub3BlbigpYCBzbyB0aGV5IHRha2UgZWZmZWN0XG4gKiBkdXJpbmcgYm90aCBgQnJvd3Nlck1haW4uaW5pdFNlcnZpY2VzKClgIGFuZCBgV29ya2JlbmNoLmluaXRTZXJ2aWNlcygpYC5cbiAqIE9yaWdpbmFsIGRlc2NyaXB0b3JzIGFyZSByZXN0b3JlZCB3aGVuIHRoZSB3b3JrYmVuY2ggc2h1dHMgZG93bi5cbiAqL1xuZXhwb3J0IGNsYXNzIFRlc3RTZXNzaW9uc0Jyb3dzZXJNYWluIGV4dGVuZHMgU2Vzc2lvbnNCcm93c2VyTWFpbiB7XG5cblx0cHJpdmF0ZSBfc2F2ZWREZXNjcmlwdG9yczogW1NlcnZpY2VJZGVudGlmaWVyPGFueT4sIFN5bmNEZXNjcmlwdG9yPGFueT5dW10gPSBbXTtcblxuXHRvdmVycmlkZSBhc3luYyBvcGVuKCk6IFByb21pc2U8SVdvcmtiZW5jaD4ge1xuXHRcdC8vIFBhdGNoIHRoZSBnbG9iYWwgc2luZ2xldG9uIHJlZ2lzdHJ5IEJFRk9SRSBzdXBlci5vcGVuKCkgY2FsbHMgaW5pdFNlcnZpY2VzKCkuXG5cdFx0Ly8gZ2V0U2luZ2xldG9uU2VydmljZURlc2NyaXB0b3JzKCkgcmV0dXJucyB0aGUgbXV0YWJsZSBpbnRlcm5hbCBhcnJheSwgc29cblx0XHQvLyByZXBsYWNpbmcgZW50cmllcyBoZXJlIGVuc3VyZXMgYm90aCBCcm93c2VyTWFpbiBhbmQgV29ya2JlbmNoIHBpY2sgdXAgbW9ja3MuXG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBnZXRTaW5nbGV0b25TZXJ2aWNlRGVzY3JpcHRvcnMoKTtcblx0XHRjb25zdCBvdmVycmlkZXM6IFtTZXJ2aWNlSWRlbnRpZmllcjxhbnk+LCBTeW5jRGVzY3JpcHRvcjxhbnk+XVtdID0gW1xuXHRcdFx0W0lDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoTW9ja0NoYXRFbnRpdGxlbWVudFNlcnZpY2UpXSxcblx0XHRcdFtJRGVmYXVsdEFjY291bnRTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoTW9ja0RlZmF1bHRBY2NvdW50U2VydmljZSldLFxuXHRcdFx0W0lHaXRTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoTW9ja0dpdFNlcnZpY2UpXSxcblx0XHRdO1xuXHRcdGZvciAoY29uc3QgW3NlcnZpY2VJZCwgbW9ja0Rlc2NyaXB0b3JdIG9mIG92ZXJyaWRlcykge1xuXHRcdFx0Y29uc3QgaWR4ID0gcmVnaXN0cnkuZmluZEluZGV4KChbaWRdKSA9PiBpZCA9PT0gc2VydmljZUlkKTtcblx0XHRcdGlmIChpZHggIT09IC0xKSB7XG5cdFx0XHRcdHRoaXMuX3NhdmVkRGVzY3JpcHRvcnMucHVzaChbc2VydmljZUlkLCByZWdpc3RyeVtpZHhdWzFdXSk7XG5cdFx0XHRcdHJlZ2lzdHJ5W2lkeF0gPSBbc2VydmljZUlkLCBtb2NrRGVzY3JpcHRvcl07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZWdpc3RyeS5wdXNoKFtzZXJ2aWNlSWQsIG1vY2tEZXNjcmlwdG9yXSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya2JlbmNoID0gYXdhaXQgc3VwZXIub3BlbigpO1xuXG5cdFx0Ly8gUmVzdG9yZSBvcmlnaW5hbCBkZXNjcmlwdG9ycyBub3cgdGhhdCB0aGUgd29ya2JlbmNoIGhhcyBzdGFydGVkLFxuXHRcdC8vIHNvIHN1YnNlcXVlbnQgdGVzdHMgaW4gdGhlIHNhbWUgcHJvY2VzcyBhcmUgbm90IGFmZmVjdGVkLlxuXHRcdGZvciAoY29uc3QgW3NlcnZpY2VJZCwgb3JpZ2luYWxdIG9mIHRoaXMuX3NhdmVkRGVzY3JpcHRvcnMpIHtcblx0XHRcdGNvbnN0IGlkeCA9IHJlZ2lzdHJ5LmZpbmRJbmRleCgoW2lkXSkgPT4gaWQgPT09IHNlcnZpY2VJZCk7XG5cdFx0XHRpZiAoaWR4ICE9PSAtMSkge1xuXHRcdFx0XHRyZWdpc3RyeVtpZHhdID0gW3NlcnZpY2VJZCwgb3JpZ2luYWxdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB3b3JrYmVuY2g7XG5cdH1cblxuXHRwcml2YXRlIHByZXNlZWRGb2xkZXIoc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSk6IHZvaWQge1xuXHRcdGNvbnN0IG1vY2tGb2xkZXJVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ21vY2stZnMnLCBhdXRob3JpdHk6ICdtb2NrLXJlcG8nLCBwYXRoOiAnL21vY2stcmVwbycgfSk7XG5cdFx0Y29uc3QgcHJvdmlkZXJJZCA9ICdkZWZhdWx0LWNvcGlsb3QnO1xuXG5cdFx0Ly8gU2VlZCByZWNlbnQgd29ya3NwYWNlcyBzbyByZXNvbHZlV29ya3NwYWNlKCkgY2FuIGh5ZHJhdGUgdGhlIHNlbGVjdGlvblxuXHRcdGNvbnN0IHJlY2VudFdvcmtzcGFjZXMgPSBKU09OLnN0cmluZ2lmeShbeyB1cmk6IG1vY2tGb2xkZXJVcmkudG9KU09OKCksIHByb3ZpZGVySWQsIGNoZWNrZWQ6IHRydWUgfV0pO1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdzZXNzaW9ucy5yZWNlbnRseVBpY2tlZFdvcmtzcGFjZXMnLCByZWNlbnRXb3Jrc3BhY2VzLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdGNvbnNvbGUubG9nKGBbU2Vzc2lvbnMgV2ViIFRlc3RdIFByZS1zZWVkZWQgZm9sZGVyOiAke21vY2tGb2xkZXJVcmkudG9TdHJpbmcoKX1gKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVXb3JrYmVuY2goZG9tRWxlbWVudDogSFRNTEVsZW1lbnQsIHNlcnZpY2VDb2xsZWN0aW9uOiBTZXJ2aWNlQ29sbGVjdGlvbiwgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpOiBJQnJvd3Nlck1haW5Xb3JrYmVuY2gge1xuXHRcdC8vIFJlZ2lzdGVyIG1vY2stZnM6Ly8gcHJvdmlkZXIgc28gYWxsIHNlcnZpY2VzIGNhbiByZXNvbHZlIHdvcmtzcGFjZSBmaWxlc1xuXHRcdHJlZ2lzdGVyTW9ja0ZpbGVTeXN0ZW1Qcm92aWRlcihzZXJ2aWNlQ29sbGVjdGlvbik7XG5cblx0XHR0aGlzLnByZXNlZWRGb2xkZXIoc2VydmljZUNvbGxlY3Rpb24uZ2V0KElTdG9yYWdlU2VydmljZSkgYXMgSVN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdHJldHVybiBuZXcgU2Vzc2lvbnNXb3JrYmVuY2goZG9tRWxlbWVudCwgdW5kZWZpbmVkLCBzZXJ2aWNlQ29sbGVjdGlvbiwgbG9nU2VydmljZSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBUUEsU0FBUyxhQUFhLHlCQUF5QjtBQUMvQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLFNBQVMsYUFBYTtBQUUvQixTQUFzQix1QkFBdUI7QUFDN0MsU0FBUyxpQkFBaUIsK0JBQStDO0FBQ3pFLFNBQVMsOEJBQThC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
