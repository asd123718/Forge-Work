import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { FileService } from "../../../../../platform/files/common/fileService.js";
import { Schemas } from "../../../../../base/common/network.js";
import { InMemoryFileSystemProvider } from "../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { EditSessionsContribution } from "../../browser/editSessions.contribution.js";
import { ProgressService } from "../../../../services/progress/browser/progressService.js";
import { IProgressService } from "../../../../../platform/progress/common/progress.js";
import { ISCMService } from "../../../scm/common/scm.js";
import { SCMService } from "../../../scm/common/scmService.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../../platform/workspace/common/workspace.js";
import { mock } from "../../../../../base/test/common/mock.js";
import * as sinon from "sinon";
import assert from "assert";
import { ChangeType, FileType, IEditSessionsLogService, IEditSessionsStorageService } from "../../common/editSessions.js";
import { URI } from "../../../../../base/common/uri.js";
import { joinPath } from "../../../../../base/common/resources.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { TestNotificationService } from "../../../../../platform/notification/test/common/testNotificationService.js";
import { TestEnvironmentService } from "../../../../test/browser/workbenchTestServices.js";
import { IEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { Event } from "../../../../../base/common/event.js";
import { IViewDescriptorService } from "../../../../common/views.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { ILifecycleService } from "../../../../services/lifecycle/common/lifecycle.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { IRemoteAgentService } from "../../../../services/remote/common/remoteAgentService.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { IEditSessionIdentityService } from "../../../../../platform/workspace/common/editSessions.js";
import { IUserDataProfilesService } from "../../../../../platform/userDataProfile/common/userDataProfile.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { TestStorageService } from "../../../../test/common/workbenchTestServices.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { UriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentityService.js";
import { IWorkspaceIdentityService, WorkspaceIdentityService } from "../../../../services/workspaces/common/workspaceIdentityService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
const folderName = "test-folder";
const folderUri = URI.file(`/${folderName}`);
suite("Edit session sync", () => {
  let instantiationService;
  let editSessionsContribution;
  let fileService;
  let sandbox;
  const disposables = new DisposableStore();
  suiteSetup(() => {
    sandbox = sinon.createSandbox();
    instantiationService = new TestInstantiationService();
    const logService = new NullLogService();
    fileService = disposables.add(new FileService(logService));
    const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
    fileService.registerProvider(Schemas.file, fileSystemProvider);
    instantiationService.stub(IEditSessionsLogService, logService);
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(ILifecycleService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onWillShutdown = Event.None;
      }
    }());
    instantiationService.stub(INotificationService, new TestNotificationService());
    instantiationService.stub(IProductService, { "editSessions.store": { url: "https://test.com", canSwitch: true, authenticationProviders: {} } });
    instantiationService.stub(IStorageService, new TestStorageService());
    instantiationService.stub(IUriIdentityService, new UriIdentityService(fileService));
    instantiationService.stub(IEditSessionsStorageService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidSignIn = Event.None;
        this.onDidSignOut = Event.None;
      }
    }());
    instantiationService.stub(IExtensionService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeExtensions = Event.None;
      }
    }());
    instantiationService.stub(IProgressService, ProgressService);
    instantiationService.stub(ISCMService, SCMService);
    instantiationService.stub(IEnvironmentService, TestEnvironmentService);
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    instantiationService.stub(IDialogService, new class extends mock() {
      async prompt(prompt) {
        const result = prompt.buttons?.[0].run({ checkboxChecked: false });
        return { result };
      }
      async confirm() {
        return { confirmed: false };
      }
    }());
    instantiationService.stub(IRemoteAgentService, new class extends mock() {
      async getEnvironment() {
        return null;
      }
    }());
    instantiationService.stub(IConfigurationService, new TestConfigurationService({ workbench: { experimental: { editSessions: { enabled: true } } } }));
    instantiationService.stub(IWorkspaceContextService, new class extends mock() {
      getWorkspace() {
        return {
          id: "workspace-id",
          folders: [{
            uri: folderUri,
            name: folderName,
            index: 0,
            toResource: (relativePath) => joinPath(folderUri, relativePath)
          }]
        };
      }
      getWorkbenchState() {
        return WorkbenchState.FOLDER;
      }
    }());
    instantiationService.stub(ISCMService, "_repositories", /* @__PURE__ */ new Map());
    instantiationService.stub(IContextKeyService, new MockContextKeyService());
    instantiationService.stub(IThemeService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidColorThemeChange = Event.None;
        this.onDidFileIconThemeChange = Event.None;
      }
    }());
    instantiationService.stub(IViewDescriptorService, {
      onDidChangeLocation: Event.None
    });
    instantiationService.stub(ITextModelService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.registerTextModelContentProvider = () => ({ dispose: () => {
        } });
      }
    }());
    instantiationService.stub(IEditorService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.saveAll = async (_options) => {
          return { success: true, editors: [] };
        };
      }
    }());
    instantiationService.stub(IEditSessionIdentityService, new class extends mock() {
      async getEditSessionIdentifier() {
        return "test-identity";
      }
    }());
    instantiationService.set(IWorkspaceIdentityService, instantiationService.createInstance(WorkspaceIdentityService));
    instantiationService.stub(IUserDataProfilesService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.defaultProfile = {
          id: "default",
          name: "Default",
          isDefault: true,
          location: URI.file("location"),
          globalStorageHome: URI.file("globalStorageHome"),
          settingsResource: URI.file("settingsResource"),
          keybindingsResource: URI.file("keybindingsResource"),
          tasksResource: URI.file("tasksResource"),
          mcpResource: URI.file("mcp.json"),
          languageModelsResource: URI.file("chatLanguageModels.json"),
          snippetsHome: URI.file("snippetsHome"),
          promptsHome: URI.file("promptsHome"),
          extensionsResource: URI.file("extensionsResource"),
          cacheHome: URI.file("cacheHome"),
          agentPluginsHome: URI.file("agentPluginsHome")
        };
      }
    }());
    editSessionsContribution = instantiationService.createInstance(EditSessionsContribution);
  });
  teardown(() => {
    sinon.restore();
    disposables.clear();
  });
  suiteTeardown(() => {
    disposables.dispose();
  });
  test("Can apply edit session", async function() {
    const fileUri = joinPath(folderUri, "dir1", "README.md");
    const fileContents = "# readme";
    const editSession = {
      version: 1,
      folders: [
        {
          name: folderName,
          workingChanges: [
            {
              relativeFilePath: "dir1/README.md",
              fileType: FileType.File,
              contents: fileContents,
              type: ChangeType.Addition
            }
          ]
        }
      ]
    };
    const readStub = sandbox.stub().returns({ content: JSON.stringify(editSession), ref: "0" });
    instantiationService.stub(IEditSessionsStorageService, "read", readStub);
    await fileService.createFolder(folderUri);
    await editSessionsContribution.resumeEditSession();
    assert.equal((await fileService.readFile(fileUri)).value.toString(), fileContents);
  });
  test("Path traversal in edit session is blocked (posix)", async function() {
    const escapedUri = joinPath(folderUri, "..", "PROBE_escape");
    const editSession = {
      version: 1,
      folders: [
        {
          name: folderName,
          workingChanges: [
            {
              relativeFilePath: "../../PROBE_escape",
              fileType: FileType.File,
              contents: "escaped",
              type: ChangeType.Addition
            }
          ]
        }
      ]
    };
    const readStub = sandbox.stub().returns({ content: JSON.stringify(editSession), ref: "0" });
    instantiationService.stub(IEditSessionsStorageService, "read", readStub);
    await fileService.createFolder(folderUri);
    await editSessionsContribution.resumeEditSession();
    assert.strictEqual(await fileService.exists(escapedUri), false);
  });
  test("Path traversal in edit session is blocked (windows-style backslash)", async function() {
    const escapedUri = joinPath(folderUri, "..", "PROBE_escape_win");
    const editSession = {
      version: 1,
      folders: [
        {
          name: folderName,
          workingChanges: [
            {
              relativeFilePath: "..\\..\\PROBE_escape_win",
              fileType: FileType.File,
              contents: "escaped",
              type: ChangeType.Addition
            }
          ]
        }
      ]
    };
    const readStub = sandbox.stub().returns({ content: JSON.stringify(editSession), ref: "0" });
    instantiationService.stub(IEditSessionsStorageService, "read", readStub);
    await fileService.createFolder(folderUri);
    await editSessionsContribution.resumeEditSession();
    assert.strictEqual(await fileService.exists(escapedUri), false);
  });
  test("Valid change is applied while traversal sibling is blocked", async function() {
    const validFileUri = joinPath(folderUri, "dir1", "README.md");
    const escapedUri = joinPath(folderUri, "..", "PROBE_escape_mixed");
    const fileContents = "# readme";
    const editSession = {
      version: 1,
      folders: [
        {
          name: folderName,
          workingChanges: [
            {
              relativeFilePath: "dir1/README.md",
              fileType: FileType.File,
              contents: fileContents,
              type: ChangeType.Addition
            },
            {
              relativeFilePath: "../../PROBE_escape_mixed",
              fileType: FileType.File,
              contents: "escaped",
              type: ChangeType.Addition
            }
          ]
        }
      ]
    };
    const readStub = sandbox.stub().returns({ content: JSON.stringify(editSession), ref: "0" });
    instantiationService.stub(IEditSessionsStorageService, "read", readStub);
    await fileService.createFolder(folderUri);
    await editSessionsContribution.resumeEditSession();
    assert.strictEqual((await fileService.readFile(validFileUri)).value.toString(), fileContents);
    assert.strictEqual(await fileService.exists(escapedUri), false);
  });
  test("Edit session not stored if there are no edits", async function() {
    const writeStub = sandbox.stub();
    instantiationService.stub(IEditSessionsStorageService, "write", writeStub);
    await fileService.createFolder(folderUri);
    await editSessionsContribution.storeEditSession(true, CancellationToken.None);
    assert.equal(writeStub.called, false);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGVkaXRTZXNzaW9uc1xcdGVzdFxcYnJvd3NlclxcZWRpdFNlc3Npb25zLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgRWRpdFNlc3Npb25zQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9lZGl0U2Vzc2lvbnMuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IFByb2dyZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Byb2dyZXNzL2Jyb3dzZXIvcHJvZ3Jlc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSVNDTVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zY20vY29tbW9uL3NjbS5qcyc7XG5pbXBvcnQgeyBTQ01TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2NtL2NvbW1vbi9zY21TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0ICogYXMgc2lub24gZnJvbSAnc2lub24nO1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2hhbmdlVHlwZSwgRmlsZVR5cGUsIElFZGl0U2Vzc2lvbnNMb2dTZXJ2aWNlLCBJRWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdFNlc3Npb25zLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL3Rlc3QvY29tbW9uL3Rlc3ROb3RpZmljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgTW9ja0NvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy90ZXN0L2NvbW1vbi9tb2NrS2V5YmluZGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlLCBJUHJvbXB0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSwgSVNhdmVBbGxFZGl0b3JzT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElFZGl0U2Vzc2lvbklkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vZWRpdFNlc3Npb25zLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgVGVzdFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlSWRlbnRpdHlTZXJ2aWNlLCBXb3Jrc3BhY2VJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VJZGVudGl0eVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbmNvbnN0IGZvbGRlck5hbWUgPSAndGVzdC1mb2xkZXInO1xuY29uc3QgZm9sZGVyVXJpID0gVVJJLmZpbGUoYC8ke2ZvbGRlck5hbWV9YCk7XG5cbnN1aXRlKCdFZGl0IHNlc3Npb24gc3luYycsICgpID0+IHtcblxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGVkaXRTZXNzaW9uc0NvbnRyaWJ1dGlvbjogRWRpdFNlc3Npb25zQ29udHJpYnV0aW9uO1xuXHRsZXQgZmlsZVNlcnZpY2U6IEZpbGVTZXJ2aWNlO1xuXHRsZXQgc2FuZGJveDogc2lub24uU2lub25TYW5kYm94O1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHN1aXRlU2V0dXAoKCkgPT4ge1xuXG5cdFx0c2FuZGJveCA9IHNpbm9uLmNyZWF0ZVNhbmRib3goKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpO1xuXG5cdFx0Ly8gU2V0IHVwIGZpbGVzeXN0ZW1cblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0ZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBmaWxlU3lzdGVtUHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5maWxlLCBmaWxlU3lzdGVtUHJvdmlkZXIpO1xuXG5cdFx0Ly8gU3R1YiBvdXQgYWxsIHNlcnZpY2VzXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdFNlc3Npb25zTG9nU2VydmljZSwgbG9nU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMaWZlY3ljbGVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMaWZlY3ljbGVTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIG9uV2lsbFNodXRkb3duID0gRXZlbnQuTm9uZTtcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RpZmljYXRpb25TZXJ2aWNlLCBuZXcgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZHVjdFNlcnZpY2UsIHsgJ2VkaXRTZXNzaW9ucy5zdG9yZSc6IHsgdXJsOiAnaHR0cHM6Ly90ZXN0LmNvbScsIGNhblN3aXRjaDogdHJ1ZSwgYXV0aGVudGljYXRpb25Qcm92aWRlcnM6IHt9IH0gfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXJpSWRlbnRpdHlTZXJ2aWNlLCBuZXcgVXJpSWRlbnRpdHlTZXJ2aWNlKGZpbGVTZXJ2aWNlKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIG9uRGlkU2lnbkluID0gRXZlbnQuTm9uZTtcblx0XHRcdG92ZXJyaWRlIG9uRGlkU2lnbk91dCA9IEV2ZW50Lk5vbmU7XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0ZW5zaW9uU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBvbkRpZENoYW5nZUV4dGVuc2lvbnMgPSBFdmVudC5Ob25lO1xuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTQ01TZXJ2aWNlLCBTQ01TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFbnZpcm9ubWVudFNlcnZpY2UsIFRlc3RFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWFsb2dTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElEaWFsb2dTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIHByb21wdChwcm9tcHQ6IElQcm9tcHQ8YW55Pikge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBwcm9tcHQuYnV0dG9ucz8uWzBdLnJ1bih7IGNoZWNrYm94Q2hlY2tlZDogZmFsc2UgfSk7XG5cdFx0XHRcdHJldHVybiB7IHJlc3VsdCB9O1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgY29uZmlybSgpIHtcblx0XHRcdFx0cmV0dXJuIHsgY29uZmlybWVkOiBmYWxzZSB9O1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJlbW90ZUFnZW50U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUmVtb3RlQWdlbnRTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIGdldEVudmlyb25tZW50KCkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7IHdvcmtiZW5jaDogeyBleHBlcmltZW50YWw6IHsgZWRpdFNlc3Npb25zOiB7IGVuYWJsZWQ6IHRydWUgfSB9IH0gfSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3Jrc3BhY2VDb250ZXh0U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXRXb3Jrc3BhY2UoKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aWQ6ICd3b3Jrc3BhY2UtaWQnLFxuXHRcdFx0XHRcdGZvbGRlcnM6IFt7XG5cdFx0XHRcdFx0XHR1cmk6IGZvbGRlclVyaSxcblx0XHRcdFx0XHRcdG5hbWU6IGZvbGRlck5hbWUsXG5cdFx0XHRcdFx0XHRpbmRleDogMCxcblx0XHRcdFx0XHRcdHRvUmVzb3VyY2U6IChyZWxhdGl2ZVBhdGg6IHN0cmluZykgPT4gam9pblBhdGgoZm9sZGVyVXJpLCByZWxhdGl2ZVBhdGgpXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGdldFdvcmtiZW5jaFN0YXRlKCkge1xuXHRcdFx0XHRyZXR1cm4gV29ya2JlbmNoU3RhdGUuRk9MREVSO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gU3R1YiByZXBvc2l0b3JpZXNcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTQ01TZXJ2aWNlLCAnX3JlcG9zaXRvcmllcycsIG5ldyBNYXAoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGhlbWVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElUaGVtZVNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgb25EaWRDb2xvclRoZW1lQ2hhbmdlID0gRXZlbnQuTm9uZTtcblx0XHRcdG92ZXJyaWRlIG9uRGlkRmlsZUljb25UaGVtZUNoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCB7XG5cdFx0XHRvbkRpZENoYW5nZUxvY2F0aW9uOiBFdmVudC5Ob25lXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGV4dE1vZGVsU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVGV4dE1vZGVsU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWdpc3RlclRleHRNb2RlbENvbnRlbnRQcm92aWRlciA9ICgpID0+ICh7IGRpc3Bvc2U6ICgpID0+IHsgfSB9KTtcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFZGl0b3JTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHNhdmVBbGwgPSBhc3luYyAoX29wdGlvbnM6IElTYXZlQWxsRWRpdG9yc09wdGlvbnMpID0+IHsgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZWRpdG9yczogW10gfTsgfTtcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFZGl0U2Vzc2lvbklkZW50aXR5U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdFNlc3Npb25JZGVudGl0eVNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0RWRpdFNlc3Npb25JZGVudGlmaWVyKCkge1xuXHRcdFx0XHRyZXR1cm4gJ3Rlc3QtaWRlbnRpdHknO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJV29ya3NwYWNlSWRlbnRpdHlTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3Jrc3BhY2VJZGVudGl0eVNlcnZpY2UpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVXNlckRhdGFQcm9maWxlc1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgZGVmYXVsdFByb2ZpbGUgPSB7XG5cdFx0XHRcdGlkOiAnZGVmYXVsdCcsXG5cdFx0XHRcdG5hbWU6ICdEZWZhdWx0Jyxcblx0XHRcdFx0aXNEZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRsb2NhdGlvbjogVVJJLmZpbGUoJ2xvY2F0aW9uJyksXG5cdFx0XHRcdGdsb2JhbFN0b3JhZ2VIb21lOiBVUkkuZmlsZSgnZ2xvYmFsU3RvcmFnZUhvbWUnKSxcblx0XHRcdFx0c2V0dGluZ3NSZXNvdXJjZTogVVJJLmZpbGUoJ3NldHRpbmdzUmVzb3VyY2UnKSxcblx0XHRcdFx0a2V5YmluZGluZ3NSZXNvdXJjZTogVVJJLmZpbGUoJ2tleWJpbmRpbmdzUmVzb3VyY2UnKSxcblx0XHRcdFx0dGFza3NSZXNvdXJjZTogVVJJLmZpbGUoJ3Rhc2tzUmVzb3VyY2UnKSxcblx0XHRcdFx0bWNwUmVzb3VyY2U6IFVSSS5maWxlKCdtY3AuanNvbicpLFxuXHRcdFx0XHRsYW5ndWFnZU1vZGVsc1Jlc291cmNlOiBVUkkuZmlsZSgnY2hhdExhbmd1YWdlTW9kZWxzLmpzb24nKSxcblx0XHRcdFx0c25pcHBldHNIb21lOiBVUkkuZmlsZSgnc25pcHBldHNIb21lJyksXG5cdFx0XHRcdHByb21wdHNIb21lOiBVUkkuZmlsZSgncHJvbXB0c0hvbWUnKSxcblx0XHRcdFx0ZXh0ZW5zaW9uc1Jlc291cmNlOiBVUkkuZmlsZSgnZXh0ZW5zaW9uc1Jlc291cmNlJyksXG5cdFx0XHRcdGNhY2hlSG9tZTogVVJJLmZpbGUoJ2NhY2hlSG9tZScpLFxuXHRcdFx0XHRhZ2VudFBsdWdpbnNIb21lOiBVUkkuZmlsZSgnYWdlbnRQbHVnaW5zSG9tZScpLFxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdGVkaXRTZXNzaW9uc0NvbnRyaWJ1dGlvbiA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRTZXNzaW9uc0NvbnRyaWJ1dGlvbik7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRzaW5vbi5yZXN0b3JlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0c3VpdGVUZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdDYW4gYXBwbHkgZWRpdCBzZXNzaW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGVVcmkgPSBqb2luUGF0aChmb2xkZXJVcmksICdkaXIxJywgJ1JFQURNRS5tZCcpO1xuXHRcdGNvbnN0IGZpbGVDb250ZW50cyA9ICcjIHJlYWRtZSc7XG5cdFx0Y29uc3QgZWRpdFNlc3Npb24gPSB7XG5cdFx0XHR2ZXJzaW9uOiAxLFxuXHRcdFx0Zm9sZGVyczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogZm9sZGVyTmFtZSxcblx0XHRcdFx0XHR3b3JraW5nQ2hhbmdlczogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRyZWxhdGl2ZUZpbGVQYXRoOiAnZGlyMS9SRUFETUUubWQnLFxuXHRcdFx0XHRcdFx0XHRmaWxlVHlwZTogRmlsZVR5cGUuRmlsZSxcblx0XHRcdFx0XHRcdFx0Y29udGVudHM6IGZpbGVDb250ZW50cyxcblx0XHRcdFx0XHRcdFx0dHlwZTogQ2hhbmdlVHlwZS5BZGRpdGlvblxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH07XG5cblx0XHQvLyBTdHViIHN5bmMgc2VydmljZSB0byByZXR1cm4gZWRpdCBzZXNzaW9uIGRhdGFcblx0XHRjb25zdCByZWFkU3R1YiA9IHNhbmRib3guc3R1YigpLnJldHVybnMoeyBjb250ZW50OiBKU09OLnN0cmluZ2lmeShlZGl0U2Vzc2lvbiksIHJlZjogJzAnIH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLCAncmVhZCcsIHJlYWRTdHViKTtcblxuXHRcdC8vIENyZWF0ZSByb290IGZvbGRlclxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihmb2xkZXJVcmkpO1xuXG5cdFx0Ly8gUmVzdW1lIGVkaXQgc2Vzc2lvblxuXHRcdGF3YWl0IGVkaXRTZXNzaW9uc0NvbnRyaWJ1dGlvbi5yZXN1bWVFZGl0U2Vzc2lvbigpO1xuXG5cdFx0Ly8gVmVyaWZ5IGVkaXQgc2Vzc2lvbiB3YXMgY29ycmVjdGx5IGFwcGxpZWRcblx0XHRhc3NlcnQuZXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKGZpbGVVcmkpKS52YWx1ZS50b1N0cmluZygpLCBmaWxlQ29udGVudHMpO1xuXHR9KTtcblxuXHR0ZXN0KCdQYXRoIHRyYXZlcnNhbCBpbiBlZGl0IHNlc3Npb24gaXMgYmxvY2tlZCAocG9zaXgpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGVzY2FwZWRVcmkgPSBqb2luUGF0aChmb2xkZXJVcmksICcuLicsICdQUk9CRV9lc2NhcGUnKTtcblx0XHRjb25zdCBlZGl0U2Vzc2lvbiA9IHtcblx0XHRcdHZlcnNpb246IDEsXG5cdFx0XHRmb2xkZXJzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRuYW1lOiBmb2xkZXJOYW1lLFxuXHRcdFx0XHRcdHdvcmtpbmdDaGFuZ2VzOiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdHJlbGF0aXZlRmlsZVBhdGg6ICcuLi8uLi9QUk9CRV9lc2NhcGUnLFxuXHRcdFx0XHRcdFx0XHRmaWxlVHlwZTogRmlsZVR5cGUuRmlsZSxcblx0XHRcdFx0XHRcdFx0Y29udGVudHM6ICdlc2NhcGVkJyxcblx0XHRcdFx0XHRcdFx0dHlwZTogQ2hhbmdlVHlwZS5BZGRpdGlvblxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH07XG5cblx0XHRjb25zdCByZWFkU3R1YiA9IHNhbmRib3guc3R1YigpLnJldHVybnMoeyBjb250ZW50OiBKU09OLnN0cmluZ2lmeShlZGl0U2Vzc2lvbiksIHJlZjogJzAnIH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLCAncmVhZCcsIHJlYWRTdHViKTtcblxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihmb2xkZXJVcmkpO1xuXHRcdGF3YWl0IGVkaXRTZXNzaW9uc0NvbnRyaWJ1dGlvbi5yZXN1bWVFZGl0U2Vzc2lvbigpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhlc2NhcGVkVXJpKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdQYXRoIHRyYXZlcnNhbCBpbiBlZGl0IHNlc3Npb24gaXMgYmxvY2tlZCAod2luZG93cy1zdHlsZSBiYWNrc2xhc2gpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGVzY2FwZWRVcmkgPSBqb2luUGF0aChmb2xkZXJVcmksICcuLicsICdQUk9CRV9lc2NhcGVfd2luJyk7XG5cdFx0Y29uc3QgZWRpdFNlc3Npb24gPSB7XG5cdFx0XHR2ZXJzaW9uOiAxLFxuXHRcdFx0Zm9sZGVyczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogZm9sZGVyTmFtZSxcblx0XHRcdFx0XHR3b3JraW5nQ2hhbmdlczogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRyZWxhdGl2ZUZpbGVQYXRoOiAnLi5cXFxcLi5cXFxcUFJPQkVfZXNjYXBlX3dpbicsXG5cdFx0XHRcdFx0XHRcdGZpbGVUeXBlOiBGaWxlVHlwZS5GaWxlLFxuXHRcdFx0XHRcdFx0XHRjb250ZW50czogJ2VzY2FwZWQnLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiBDaGFuZ2VUeXBlLkFkZGl0aW9uXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlYWRTdHViID0gc2FuZGJveC5zdHViKCkucmV0dXJucyh7IGNvbnRlbnQ6IEpTT04uc3RyaW5naWZ5KGVkaXRTZXNzaW9uKSwgcmVmOiAnMCcgfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UsICdyZWFkJywgcmVhZFN0dWIpO1xuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKGZvbGRlclVyaSk7XG5cdFx0YXdhaXQgZWRpdFNlc3Npb25zQ29udHJpYnV0aW9uLnJlc3VtZUVkaXRTZXNzaW9uKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKGVzY2FwZWRVcmkpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ZhbGlkIGNoYW5nZSBpcyBhcHBsaWVkIHdoaWxlIHRyYXZlcnNhbCBzaWJsaW5nIGlzIGJsb2NrZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmFsaWRGaWxlVXJpID0gam9pblBhdGgoZm9sZGVyVXJpLCAnZGlyMScsICdSRUFETUUubWQnKTtcblx0XHRjb25zdCBlc2NhcGVkVXJpID0gam9pblBhdGgoZm9sZGVyVXJpLCAnLi4nLCAnUFJPQkVfZXNjYXBlX21peGVkJyk7XG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRzID0gJyMgcmVhZG1lJztcblx0XHRjb25zdCBlZGl0U2Vzc2lvbiA9IHtcblx0XHRcdHZlcnNpb246IDEsXG5cdFx0XHRmb2xkZXJzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRuYW1lOiBmb2xkZXJOYW1lLFxuXHRcdFx0XHRcdHdvcmtpbmdDaGFuZ2VzOiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdHJlbGF0aXZlRmlsZVBhdGg6ICdkaXIxL1JFQURNRS5tZCcsXG5cdFx0XHRcdFx0XHRcdGZpbGVUeXBlOiBGaWxlVHlwZS5GaWxlLFxuXHRcdFx0XHRcdFx0XHRjb250ZW50czogZmlsZUNvbnRlbnRzLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiBDaGFuZ2VUeXBlLkFkZGl0aW9uXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRyZWxhdGl2ZUZpbGVQYXRoOiAnLi4vLi4vUFJPQkVfZXNjYXBlX21peGVkJyxcblx0XHRcdFx0XHRcdFx0ZmlsZVR5cGU6IEZpbGVUeXBlLkZpbGUsXG5cdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiAnZXNjYXBlZCcsXG5cdFx0XHRcdFx0XHRcdHR5cGU6IENoYW5nZVR5cGUuQWRkaXRpb25cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVhZFN0dWIgPSBzYW5kYm94LnN0dWIoKS5yZXR1cm5zKHsgY29udGVudDogSlNPTi5zdHJpbmdpZnkoZWRpdFNlc3Npb24pLCByZWY6ICcwJyB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZSwgJ3JlYWQnLCByZWFkU3R1Yik7XG5cblx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIoZm9sZGVyVXJpKTtcblx0XHRhd2FpdCBlZGl0U2Vzc2lvbnNDb250cmlidXRpb24ucmVzdW1lRWRpdFNlc3Npb24oKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUodmFsaWRGaWxlVXJpKSkudmFsdWUudG9TdHJpbmcoKSwgZmlsZUNvbnRlbnRzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKGVzY2FwZWRVcmkpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VkaXQgc2Vzc2lvbiBub3Qgc3RvcmVkIGlmIHRoZXJlIGFyZSBubyBlZGl0cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3cml0ZVN0dWIgPSBzYW5kYm94LnN0dWIoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZSwgJ3dyaXRlJywgd3JpdGVTdHViKTtcblxuXHRcdC8vIENyZWF0ZSByb290IGZvbGRlclxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihmb2xkZXJVcmkpO1xuXG5cdFx0YXdhaXQgZWRpdFNlc3Npb25zQ29udHJpYnV0aW9uLnN0b3JlRWRpdFNlc3Npb24odHJ1ZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHQvLyBWZXJpZnkgdGhhdCB3ZSBkaWQgbm90IGF0dGVtcHQgdG8gd3JpdGUgdGhlIGVkaXQgc2Vzc2lvblxuXHRcdGFzc2VydC5lcXVhbCh3cml0ZVN0dWIuY2FsbGVkLCBmYWxzZSk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7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
