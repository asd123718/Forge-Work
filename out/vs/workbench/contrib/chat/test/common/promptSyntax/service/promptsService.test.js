import assert from "assert";
import * as sinon from "sinon";
import { DeferredPromise } from "../../../../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../../../../base/common/event.js";
import { match } from "../../../../../../../base/common/glob.js";
import { ResourceSet } from "../../../../../../../base/common/map.js";
import { Schemas } from "../../../../../../../base/common/network.js";
import { observableValue } from "../../../../../../../base/common/observable.js";
import { basename, relativePath } from "../../../../../../../base/common/resources.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { Range } from "../../../../../../../editor/common/core/range.js";
import { ILanguageService } from "../../../../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../../../../editor/common/services/model.js";
import { ModelService } from "../../../../../../../editor/common/services/modelService.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ExtensionIdentifier } from "../../../../../../../platform/extensions/common/extensions.js";
import { IFileService } from "../../../../../../../platform/files/common/files.js";
import { FileService } from "../../../../../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { TestInstantiationService } from "../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILabelService } from "../../../../../../../platform/label/common/label.js";
import { ILogService, NullLogService } from "../../../../../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../../../platform/telemetry/common/telemetryUtils.js";
import { IWorkspaceContextService } from "../../../../../../../platform/workspace/common/workspace.js";
import { testWorkspace } from "../../../../../../../platform/workspace/test/common/testWorkspace.js";
import { IWorkbenchEnvironmentService } from "../../../../../../services/environment/common/environmentService.js";
import { IFilesConfigurationService } from "../../../../../../services/filesConfiguration/common/filesConfigurationService.js";
import { IUserDataProfileService } from "../../../../../../services/userDataProfile/common/userDataProfile.js";
import { toUserDataProfile } from "../../../../../../../platform/userDataProfile/common/userDataProfile.js";
import { TestContextService, TestUserDataProfileService, TestWorkspaceTrustManagementService } from "../../../../../../test/common/workbenchTestServices.js";
import { ChatRequestVariableSet, isPromptFileVariableEntry, toFileVariableEntry } from "../../../../common/attachments/chatVariableEntries.js";
import { ComputeAutomaticInstructions, newInstructionsCollectionEvent, newInstructionsCollectionDebugInfo } from "../../../../common/promptSyntax/computeAutomaticInstructions.js";
import { PromptsConfig } from "../../../../common/promptSyntax/config/config.js";
import { AGENTS_SOURCE_FOLDER, CLAUDE_CONFIG_FOLDER, HOOKS_SOURCE_FOLDER, INSTRUCTION_FILE_EXTENSION, INSTRUCTIONS_DEFAULT_SOURCE_FOLDER, LEGACY_MODE_DEFAULT_SOURCE_FOLDER, PROMPT_DEFAULT_SOURCE_FOLDER, PROMPT_FILE_EXTENSION } from "../../../../common/promptSyntax/config/promptFileLocations.js";
import { INSTRUCTIONS_LANGUAGE_ID, PROMPT_LANGUAGE_ID, PromptFileSource, PromptsType, Target } from "../../../../common/promptSyntax/promptTypes.js";
import { IAgentSource, IPromptsService, PromptsStorage } from "../../../../common/promptSyntax/service/promptsService.js";
import { PromptsService } from "../../../../common/promptSyntax/service/promptsServiceImpl.js";
import { mockFiles } from "../testUtils/mockFilesystem.js";
import { InMemoryStorageService, IStorageService } from "../../../../../../../platform/storage/common/storage.js";
import { IPathService } from "../../../../../../services/path/common/pathService.js";
import { ISearchService } from "../../../../../../services/search/common/search.js";
import { IExtensionService } from "../../../../../../services/extensions/common/extensions.js";
import { IRemoteAgentService } from "../../../../../../services/remote/common/remoteAgentService.js";
import { ChatConfiguration, ChatModeKind } from "../../../../common/constants.js";
import { HookType } from "../../../../common/promptSyntax/hookTypes.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { MockContextKeyService } from "../../../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { IAgentPluginService } from "../../../../common/plugins/agentPluginService.js";
import { PluginFormat } from "../../../../../../../platform/agentPlugins/common/pluginParsers.js";
import { IWorkspaceTrustManagementService } from "../../../../../../../platform/workspace/common/workspaceTrust.js";
import { COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG, COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG } from "../../../../../../../platform/policy/common/copilotManagedSettings.js";
class TestPromptContextKeyService extends MockContextKeyService {
  constructor() {
    super(...arguments);
    this._onDidChangeContextEmitter = new Emitter();
    this._rulesMatch = false;
  }
  get onDidChangeContext() {
    return this._onDidChangeContextEmitter.event;
  }
  contextMatchesRules() {
    return this._rulesMatch;
  }
  setRulesMatch(value) {
    this._rulesMatch = value;
  }
  fireDidChangeContext(keys) {
    const changedKeys = new Set(keys);
    this._onDidChangeContextEmitter.fire({
      affectsSome: (trackedKeys) => keys.some((key) => trackedKeys.has(key)),
      allKeysContainedIn: (trackedKeys) => Array.from(changedKeys).every((key) => trackedKeys.has(key))
    });
  }
  dispose() {
    this._onDidChangeContextEmitter.dispose();
    super.dispose();
  }
}
suite("PromptsService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let service;
  let instaService;
  let workspaceContextService;
  let testConfigService;
  let fileService;
  let testPluginsObservable;
  let workspaceTrustService;
  let logService;
  setup(async () => {
    instaService = disposables.add(new TestInstantiationService());
    logService = new NullLogService();
    instaService.stub(ILogService, logService);
    workspaceContextService = new TestContextService();
    instaService.stub(IWorkspaceContextService, workspaceContextService);
    testConfigService = new TestConfigurationService();
    testConfigService.setUserConfiguration(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES, true);
    testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_MD, true);
    testConfigService.setUserConfiguration(PromptsConfig.USE_NESTED_AGENT_MD, false);
    testConfigService.setUserConfiguration(PromptsConfig.INCLUDE_REFERENCED_INSTRUCTIONS, true);
    testConfigService.setUserConfiguration(PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS, true);
    testConfigService.setUserConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS, false);
    testConfigService.setUserConfiguration(PromptsConfig.INSTRUCTIONS_LOCATION_KEY, { [INSTRUCTIONS_DEFAULT_SOURCE_FOLDER]: true });
    testConfigService.setUserConfiguration(PromptsConfig.PROMPT_LOCATIONS_KEY, { [PROMPT_DEFAULT_SOURCE_FOLDER]: true });
    testConfigService.setUserConfiguration(PromptsConfig.MODE_LOCATION_KEY, { [LEGACY_MODE_DEFAULT_SOURCE_FOLDER]: true });
    testConfigService.setUserConfiguration(PromptsConfig.AGENTS_LOCATION_KEY, { [AGENTS_SOURCE_FOLDER]: true });
    instaService.stub(IConfigurationService, testConfigService);
    instaService.stub(IWorkbenchEnvironmentService, {});
    instaService.stub(IUserDataProfileService, new TestUserDataProfileService());
    instaService.stub(ITelemetryService, NullTelemetryService);
    instaService.stub(IStorageService, InMemoryStorageService);
    instaService.stub(IExtensionService, {
      whenInstalledExtensionsRegistered: () => Promise.resolve(true),
      activateByEvent: () => Promise.resolve()
    });
    fileService = disposables.add(instaService.createInstance(FileService));
    instaService.stub(IFileService, fileService);
    const modelService = disposables.add(instaService.createInstance(ModelService));
    instaService.stub(IModelService, modelService);
    instaService.stub(ILanguageService, {
      guessLanguageIdByFilepathOrFirstLine(uri) {
        if (uri.path.endsWith(PROMPT_FILE_EXTENSION)) {
          return PROMPT_LANGUAGE_ID;
        }
        if (uri.path.endsWith(INSTRUCTION_FILE_EXTENSION)) {
          return INSTRUCTIONS_LANGUAGE_ID;
        }
        return "plaintext";
      }
    });
    instaService.stub(ILabelService, { getUriLabel: (uri) => uri.path });
    const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
    instaService.stub(IFilesConfigurationService, { updateReadonly: () => Promise.resolve() });
    const pathService = {
      userHome: () => {
        return Promise.resolve(URI.file("/home/user"));
      }
    };
    instaService.stub(IPathService, pathService);
    instaService.stub(ISearchService, {
      schemeHasFileSearchProvider: () => true,
      async fileSearch(query) {
        const findFilesInLocation = async (location, results2 = []) => {
          try {
            const resolve = await fileService.resolve(location);
            if (resolve.isFile) {
              results2.push(resolve.resource);
            } else if (resolve.isDirectory && resolve.children) {
              for (const child of resolve.children) {
                await findFilesInLocation(child.resource, results2);
              }
            }
          } catch (error) {
          }
          return results2;
        };
        const results = [];
        for (const folderQuery of query.folderQueries) {
          const allFiles = await findFilesInLocation(folderQuery.folder);
          for (const resource of allFiles) {
            const pathInFolder = relativePath(folderQuery.folder, resource) ?? "";
            if (query.filePattern === void 0 || match(query.filePattern, pathInFolder)) {
              results.push({ resource });
            }
          }
        }
        return { results, messages: [] };
      }
    });
    instaService.stub(IRemoteAgentService, {
      getEnvironment: () => Promise.resolve(null),
      getConnection: () => null
    });
    instaService.stub(IContextKeyService, new MockContextKeyService());
    workspaceTrustService = disposables.add(new TestWorkspaceTrustManagementService());
    workspaceTrustService.getUriTrustInfo = (uri) => Promise.resolve({ trusted: true, uri });
    instaService.stub(IWorkspaceTrustManagementService, workspaceTrustService);
    testPluginsObservable = observableValue("testPlugins", []);
    instaService.stub(IAgentPluginService, {
      plugins: testPluginsObservable,
      enablementModel: { readEnabled: () => 2, readProfileEnabled: () => true, setEnabled: () => {
      }, remove: () => {
      } }
    });
    service = disposables.add(instaService.createInstance(PromptsService));
    instaService.stub(IPromptsService, service);
  });
  test("lists local prompt files relative to an explicit root and its parent repository", async () => {
    const parentRoot = URI.file("/parent-repo");
    const explicitRoot = URI.joinPath(parentRoot, "packages/explicit-root");
    const siblingRoot = URI.file("/sibling-root");
    workspaceContextService.setWorkspace(testWorkspace(explicitRoot, siblingRoot));
    testConfigService.setUserConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS, true);
    await mockFiles(fileService, [
      { path: "/parent-repo/.git/HEAD", contents: ["ref: refs/heads/main"] },
      { path: "/parent-repo/.github/prompts/parent.prompt.md", contents: ["parent"] },
      { path: "/parent-repo/packages/explicit-root/.github/prompts/explicit.prompt.md", contents: ["explicit"] },
      { path: "/sibling-root/.github/prompts/sibling.prompt.md", contents: ["sibling"] }
    ]);
    const files = await service.listPromptFilesForStorage(PromptsType.prompt, PromptsStorage.local, CancellationToken.None, explicitRoot);
    assert.deepStrictEqual(files.map((file) => file.uri.path), [
      "/parent-repo/packages/explicit-root/.github/prompts/explicit.prompt.md",
      "/parent-repo/.github/prompts/parent.prompt.md"
    ]);
  });
  suite("IAgentSource.isEquals", () => {
    test("returns true for equivalent local sources", () => {
      const left = { storage: PromptsStorage.local };
      const right = { storage: PromptsStorage.local };
      assert.strictEqual(IAgentSource.isEquals(left, right), true);
    });
    test("returns true for equivalent extension sources", () => {
      const left = { storage: PromptsStorage.extension, extensionId: new ExtensionIdentifier("ms.vscode") };
      const right = { storage: PromptsStorage.extension, extensionId: new ExtensionIdentifier("ms.vscode") };
      assert.strictEqual(IAgentSource.isEquals(left, right), true);
    });
    test("returns false for different plugin source URIs", () => {
      const left = { storage: PromptsStorage.plugin, pluginUri: URI.file("/workspace/plugin-a") };
      const right = { storage: PromptsStorage.plugin, pluginUri: URI.file("/workspace/plugin-b") };
      assert.strictEqual(IAgentSource.isEquals(left, right), false);
    });
  });
  suite("voice instructions", () => {
    test("combines user and trusted workspace voice.md files", async () => {
      const rootFolderUri = URI.file("/workspace");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        { path: "/home/user/.copilot/voice.md", contents: ["Use short paragraphs."] },
        { path: "/workspace/.github/voice.md", contents: ["Spell the product name as Contoso DB."] }
      ]);
      const instructions = await service.getVoiceInstructions(CancellationToken.None);
      assert.strictEqual(instructions, "Use short paragraphs.\n\nSpell the product name as Contoso DB.");
    });
    test("excludes workspace voice.md when the workspace is untrusted", async () => {
      const rootFolderUri = URI.file("/workspace");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await workspaceTrustService.setWorkspaceTrust(false);
      await mockFiles(fileService, [
        { path: "/home/user/.copilot/voice.md", contents: ["Use short paragraphs."] },
        { path: "/workspace/.github/voice.md", contents: ["Untrusted workspace guidance."] }
      ]);
      const instructions = await service.getVoiceInstructions(CancellationToken.None);
      assert.strictEqual(instructions, "Use short paragraphs.");
    });
    test("cancels in-flight voice instruction reads", async () => {
      const cts = new CancellationTokenSource();
      const readStarted = new DeferredPromise();
      const readFileStub = sinon.stub(fileService, "readFile").callsFake(async (_resource, _options, token) => {
        readStarted.complete();
        await new Promise((resolve) => {
          const listener = token.onCancellationRequested(() => {
            listener.dispose();
            resolve();
          });
        });
        throw new CancellationError();
      });
      try {
        const instructions = service.getVoiceInstructions(cts.token);
        await readStarted.p;
        cts.cancel();
        assert.strictEqual(await instructions, void 0);
      } finally {
        readFileStub.restore();
        cts.dispose();
      }
    });
  });
  suite("dictation instructions", () => {
    test("combines user and trusted workspace dictation.md files separately from voice.md", async () => {
      const rootFolderUri = URI.file("/workspace");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        { path: "/home/user/.copilot/dictation.md", contents: ["Use short paragraphs."] },
        { path: "/workspace/.github/dictation.md", contents: ["Spell the product name as Contoso DB."] },
        { path: "/home/user/.copilot/voice.md", contents: ["Keep spoken responses concise."] }
      ]);
      const instructions = await service.getDictationInstructions(CancellationToken.None);
      assert.strictEqual(instructions, "Use short paragraphs.\n\nSpell the product name as Contoso DB.");
    });
    test("excludes workspace dictation.md when the workspace is untrusted", async () => {
      const rootFolderUri = URI.file("/workspace");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await workspaceTrustService.setWorkspaceTrust(false);
      await mockFiles(fileService, [
        { path: "/home/user/.copilot/dictation.md", contents: ["Use short paragraphs."] },
        { path: "/workspace/.github/dictation.md", contents: ["Untrusted workspace guidance."] }
      ]);
      const instructions = await service.getDictationInstructions(CancellationToken.None);
      assert.strictEqual(instructions, "Use short paragraphs.");
    });
  });
  suite("parse", () => {
    test("explicit", async function() {
      const rootFolderName = "resolves-nested-file-references";
      const rootFolder = `/${rootFolderName}`;
      const rootFileName = "file2.prompt.md";
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const rootFileUri = URI.joinPath(rootFolderUri, rootFileName);
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/file1.prompt.md`,
          contents: [
            "## Some Header",
            "some contents",
            " "
          ]
        },
        {
          path: `${rootFolder}/${rootFileName}`,
          contents: [
            "---",
            "description: 'Root prompt description.'",
            "tools: ['my-tool1', , tool]",
            'agent: "agent" ',
            "---",
            "## Files",
            "	- this file #file:folder1/file3.prompt.md ",
            "	- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!",
            "## Vars",
            "	- #tool:my-tool",
            "	- #tool:my-other-tool",
            " "
          ]
        },
        {
          path: `${rootFolder}/folder1/file3.prompt.md`,
          contents: [
            "---",
            "tools: [ false, 'my-tool1' , ]",
            "agent: 'edit'",
            "---",
            "",
            "[](./some-other-folder/non-existing-folder)",
            `	- some seemingly random #file:${rootFolder}/folder1/some-other-folder/yetAnotherFolder\u{1F92D}/another-file.instructions.md contents`,
            " some more	 content"
          ]
        },
        {
          path: `${rootFolder}/folder1/some-other-folder/file4.prompt.md`,
          contents: [
            "---",
            `tools: ['my-tool1', "my-tool2", true, , ]`,
            "something: true",
            "agent: 'ask'	",
            'description: "File 4 splendid description."',
            "---",
            "this file has a non-existing #file:./some-non-existing/file.prompt.md		reference",
            "",
            "",
            "and some",
            " non-prompt #file:./some-non-prompt-file.md		 	[](../../folder1/)	"
          ]
        },
        {
          path: `${rootFolder}/folder1/some-other-folder/file.txt`,
          contents: [
            "---",
            'description: "Non-prompt file description".',
            'tools: ["my-tool-24"]',
            "---"
          ]
        },
        {
          path: `${rootFolder}/folder1/some-other-folder/yetAnotherFolder\u{1F92D}/another-file.instructions.md`,
          contents: [
            "---",
            'description: "Another file description."',
            `tools: ['my-tool3', "my-tool2" ]`,
            'applyTo: "**/*.tsx"',
            "---",
            `[](${rootFolder}/folder1/some-other-folder)`,
            "another-file.instructions.md contents	 [#file:file.txt](../file.txt)"
          ]
        },
        {
          path: `${rootFolder}/folder1/some-other-folder/yetAnotherFolder\u{1F92D}/one_more_file_just_in_case.prompt.md`,
          contents: ["one_more_file_just_in_case.prompt.md contents"]
        }
      ]);
      const file3 = URI.joinPath(rootFolderUri, "folder1/file3.prompt.md");
      const file4 = URI.joinPath(rootFolderUri, "folder1/some-other-folder/file4.prompt.md");
      const someOtherFolder = URI.joinPath(rootFolderUri, "/folder1/some-other-folder");
      const someOtherFolderFile = URI.joinPath(rootFolderUri, "/folder1/some-other-folder/file.txt");
      const nonExistingFolder = URI.joinPath(rootFolderUri, "folder1/some-other-folder/non-existing-folder");
      const yetAnotherFile = URI.joinPath(rootFolderUri, "folder1/some-other-folder/yetAnotherFolder\u{1F92D}/another-file.instructions.md");
      const result1 = await service.parseNew(rootFileUri, CancellationToken.None);
      assert.deepEqual(result1.uri, rootFileUri);
      assert.deepEqual(result1.header?.description, "Root prompt description.");
      assert.deepEqual(result1.header?.tools, ["my-tool1", "tool"]);
      assert.deepEqual(result1.header?.agent, "agent");
      assert.ok(result1.body);
      assert.deepEqual(
        result1.body.fileReferences.map((r) => result1.body?.resolveFilePath(r.content)),
        [file3, file4]
      );
      assert.deepEqual(
        result1.body.variableReferences,
        [
          { name: "my-tool", range: new Range(10, 10, 10, 17), offset: 240, fullLength: 13 },
          { name: "my-other-tool", range: new Range(11, 10, 11, 23), offset: 257, fullLength: 19 }
        ]
      );
      const result2 = await service.parseNew(file3, CancellationToken.None);
      assert.deepEqual(result2.uri, file3);
      assert.deepEqual(result2.header?.agent, "edit");
      assert.ok(result2.body);
      assert.deepEqual(
        result2.body.fileReferences.map((r) => result2.body?.resolveFilePath(r.content)),
        [nonExistingFolder, yetAnotherFile]
      );
      const result3 = await service.parseNew(yetAnotherFile, CancellationToken.None);
      assert.deepEqual(result3.uri, yetAnotherFile);
      assert.deepEqual(result3.header?.description, "Another file description.");
      assert.deepEqual(result3.header?.applyTo, "**/*.tsx");
      assert.ok(result3.body);
      assert.deepEqual(
        result3.body.fileReferences.map((r) => result3.body?.resolveFilePath(r.content)),
        [someOtherFolder, someOtherFolderFile]
      );
      assert.deepEqual(result3.body.variableReferences, []);
      const result4 = await service.parseNew(file4, CancellationToken.None);
      assert.deepEqual(result4.uri, file4);
      assert.deepEqual(result4.header?.description, "File 4 splendid description.");
      assert.ok(result4.body);
      assert.deepEqual(
        result4.body.fileReferences.map((r) => result4.body?.resolveFilePath(r.content)),
        [
          URI.joinPath(rootFolderUri, "/folder1/some-other-folder/some-non-existing/file.prompt.md"),
          URI.joinPath(rootFolderUri, "/folder1/some-other-folder/some-non-prompt-file.md"),
          URI.joinPath(rootFolderUri, "/folder1/")
        ]
      );
      assert.deepEqual(result4.body.variableReferences, []);
    });
  });
  suite("findInstructionFilesFor", () => {
    teardown(() => {
      sinon.restore();
    });
    test("finds correct instruction files", async () => {
      const rootFolderName = "finds-instruction-files";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const userPromptsFolderName = "/tmp/user-data/prompts";
      const userPromptsFolderUri = URI.file(userPromptsFolderName);
      sinon.stub(service, "listPromptFiles").returns(Promise.resolve([
        // local instructions
        {
          uri: URI.joinPath(rootFolderUri, ".github/prompts/file1.instructions.md"),
          storage: PromptsStorage.local,
          type: PromptsType.instructions
        },
        {
          uri: URI.joinPath(rootFolderUri, ".github/prompts/file2.instructions.md"),
          storage: PromptsStorage.local,
          type: PromptsType.instructions
        },
        {
          uri: URI.joinPath(rootFolderUri, ".github/prompts/file3.instructions.md"),
          storage: PromptsStorage.local,
          type: PromptsType.instructions
        },
        {
          uri: URI.joinPath(rootFolderUri, ".github/prompts/file4.instructions.md"),
          storage: PromptsStorage.local,
          type: PromptsType.instructions
        },
        // user instructions
        {
          uri: URI.joinPath(userPromptsFolderUri, "file10.instructions.md"),
          storage: PromptsStorage.user,
          type: PromptsType.instructions
        },
        {
          uri: URI.joinPath(userPromptsFolderUri, "file11.instructions.md"),
          storage: PromptsStorage.user,
          type: PromptsType.instructions
        }
      ]));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/file1.prompt.md`,
          contents: [
            "## Some Header",
            "some contents",
            " "
          ]
        },
        {
          path: `${rootFolder}/.github/prompts/file1.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 1.'",
            'applyTo: "**/*.tsx"',
            "---",
            "Some instructions 1 contents."
          ]
        },
        {
          path: `${rootFolder}/.github/prompts/file2.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 2.'",
            'applyTo: "**/folder1/*.tsx"',
            "---",
            "Some instructions 2 contents."
          ]
        },
        {
          path: `${rootFolder}/.github/prompts/file3.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 3.'",
            'applyTo: "**/folder2/*.tsx"',
            "---",
            "Some instructions 3 contents."
          ]
        },
        {
          path: `${rootFolder}/.github/prompts/file4.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 4.'",
            'applyTo: "src/build/*.tsx"',
            "---",
            "Some instructions 4 contents."
          ]
        },
        {
          path: `${rootFolder}/.github/prompts/file5.prompt.md`,
          contents: [
            "---",
            "description: 'Prompt file 5.'",
            "---",
            "Some prompt 5 contents."
          ]
        },
        {
          path: `${rootFolder}/folder1/main.tsx`,
          contents: [
            'console.log("Haalou!")'
          ]
        }
      ]);
      await mockFiles(fileService, [
        {
          path: `${userPromptsFolderName}/file10.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 10.'",
            'applyTo: "**/folder1/*.tsx"',
            "---",
            "Some instructions 10 contents."
          ]
        },
        {
          path: `${userPromptsFolderName}/file11.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 11.'",
            'applyTo: "**/folder1/*.py"',
            "---",
            "Some instructions 11 contents."
          ]
        },
        {
          path: `${userPromptsFolderName}/file12.prompt.md`,
          contents: [
            "---",
            "description: 'Prompt file 12.'",
            "---",
            "Some prompt 12 contents."
          ]
        }
      ]);
      const instructionFiles = await service.getInstructionFiles(CancellationToken.None);
      const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, void 0, void 0, "local");
      const context = {
        files: new ResourceSet([
          URI.joinPath(rootFolderUri, "folder1/main.tsx")
        ]),
        instructions: new ResourceSet()
      };
      const result = new ChatRequestVariableSet();
      await contextComputer.addApplyingInstructions(instructionFiles, context, result, newInstructionsCollectionEvent(), newInstructionsCollectionDebugInfo(), CancellationToken.None);
      assert.deepStrictEqual(
        result.asArray().map((i) => isPromptFileVariableEntry(i) ? i.value.path : void 0),
        [
          // local instructions
          URI.joinPath(rootFolderUri, ".github/prompts/file1.instructions.md").path,
          URI.joinPath(rootFolderUri, ".github/prompts/file2.instructions.md").path,
          // user instructions
          URI.joinPath(userPromptsFolderUri, "file10.instructions.md").path
        ],
        "Must find correct instruction files."
      );
    });
    test("does not have duplicates", async () => {
      const rootFolderName = "finds-instruction-files-without-duplicates";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const userPromptsFolderName = "/tmp/user-data/prompts";
      const userPromptsFolderUri = URI.file(userPromptsFolderName);
      sinon.stub(service, "listPromptFiles").returns(Promise.resolve([
        // local instructions
        {
          uri: URI.joinPath(rootFolderUri, ".github/prompts/file1.instructions.md"),
          storage: PromptsStorage.local,
          type: PromptsType.instructions
        },
        {
          uri: URI.joinPath(rootFolderUri, ".github/prompts/file2.instructions.md"),
          storage: PromptsStorage.local,
          type: PromptsType.instructions
        },
        {
          uri: URI.joinPath(rootFolderUri, ".github/prompts/file3.instructions.md"),
          storage: PromptsStorage.local,
          type: PromptsType.instructions
        },
        {
          uri: URI.joinPath(rootFolderUri, ".github/prompts/file4.instructions.md"),
          storage: PromptsStorage.local,
          type: PromptsType.instructions
        },
        // user instructions
        {
          uri: URI.joinPath(userPromptsFolderUri, "file10.instructions.md"),
          storage: PromptsStorage.user,
          type: PromptsType.instructions
        },
        {
          uri: URI.joinPath(userPromptsFolderUri, "file11.instructions.md"),
          storage: PromptsStorage.user,
          type: PromptsType.instructions
        }
      ]));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/file1.prompt.md`,
          contents: [
            "## Some Header",
            "some contents",
            " "
          ]
        },
        {
          path: `${rootFolder}/.github/prompts/file1.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 1.'",
            'applyTo: "**/*.tsx"',
            "---",
            "Some instructions 1 contents."
          ]
        },
        {
          path: `${rootFolder}/.github/prompts/file2.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 2.'",
            'applyTo: "**/folder1/*.tsx"',
            "---",
            "Some instructions 2 contents. [](./file1.instructions.md)"
          ]
        },
        {
          path: `${rootFolder}/.github/prompts/file3.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 3.'",
            'applyTo: "**/folder2/*.tsx"',
            "---",
            "Some instructions 3 contents."
          ]
        },
        {
          path: `${rootFolder}/.github/prompts/file4.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 4.'",
            'applyTo: "src/build/*.tsx"',
            "---",
            "[](./file3.instructions.md) Some instructions 4 contents."
          ]
        },
        {
          path: `${rootFolder}/.github/prompts/file5.prompt.md`,
          contents: [
            "---",
            "description: 'Prompt file 5.'",
            "---",
            "Some prompt 5 contents."
          ]
        },
        {
          path: `${rootFolder}/folder1/main.tsx`,
          contents: [
            'console.log("Haalou!")'
          ]
        }
      ]);
      await mockFiles(fileService, [
        {
          path: `${userPromptsFolderName}/file10.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 10.'",
            'applyTo: "**/folder1/*.tsx"',
            "---",
            "Some instructions 10 contents."
          ]
        },
        {
          path: `${userPromptsFolderName}/file11.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 11.'",
            'applyTo: "**/folder1/*.py"',
            "---",
            "Some instructions 11 contents."
          ]
        },
        {
          path: `${userPromptsFolderName}/file12.prompt.md`,
          contents: [
            "---",
            "description: 'Prompt file 12.'",
            "---",
            "Some prompt 12 contents."
          ]
        }
      ]);
      const instructionFiles = await service.getInstructionFiles(CancellationToken.None);
      const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, void 0, void 0, "local");
      const context = {
        files: new ResourceSet([
          URI.joinPath(rootFolderUri, "folder1/main.tsx"),
          URI.joinPath(rootFolderUri, "folder1/index.tsx"),
          URI.joinPath(rootFolderUri, "folder1/constants.tsx")
        ]),
        instructions: new ResourceSet()
      };
      const result = new ChatRequestVariableSet();
      await contextComputer.addApplyingInstructions(instructionFiles, context, result, newInstructionsCollectionEvent(), newInstructionsCollectionDebugInfo(), CancellationToken.None);
      assert.deepStrictEqual(
        result.asArray().map((i) => isPromptFileVariableEntry(i) ? i.value.path : void 0),
        [
          // local instructions
          URI.joinPath(rootFolderUri, ".github/prompts/file1.instructions.md").path,
          URI.joinPath(rootFolderUri, ".github/prompts/file2.instructions.md").path,
          // user instructions
          URI.joinPath(userPromptsFolderUri, "file10.instructions.md").path
        ],
        "Must find correct instruction files."
      );
    });
    test("copilot-instructions and AGENTS.md", async () => {
      const rootFolderName = "copilot-instructions-and-agents";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/codestyle.md`,
          contents: [
            "Can you see this?"
          ]
        },
        {
          path: `${rootFolder}/AGENTS.md`,
          contents: [
            "What about this?"
          ]
        },
        {
          path: `${rootFolder}/README.md`,
          contents: [
            "Thats my project?"
          ]
        },
        {
          path: `${rootFolder}/.github/copilot-instructions.md`,
          contents: [
            "Be nice and friendly. Also look at instructions at #file:../codestyle.md and [more-codestyle.md](./more-codestyle.md)."
          ]
        },
        {
          path: `${rootFolder}/.github/more-codestyle.md`,
          contents: [
            "I like it clean."
          ]
        },
        {
          path: `${rootFolder}/folder1/AGENTS.md`,
          contents: [
            "An AGENTS.md file in another repo"
          ]
        }
      ]);
      const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, void 0, void 0, "local");
      const context = new ChatRequestVariableSet();
      context.add(toFileVariableEntry(URI.joinPath(rootFolderUri, "README.md")));
      await contextComputer.collect(context, CancellationToken.None);
      assert.deepStrictEqual(
        context.asArray().map((i) => isPromptFileVariableEntry(i) ? i.value.path : void 0).filter((e) => !!e).sort(),
        [
          URI.joinPath(rootFolderUri, ".github/copilot-instructions.md").path,
          URI.joinPath(rootFolderUri, ".github/more-codestyle.md").path,
          URI.joinPath(rootFolderUri, "AGENTS.md").path,
          URI.joinPath(rootFolderUri, "codestyle.md").path
        ].sort(),
        "Must find correct instruction files."
      );
    });
    test("exposes onDidChangeAgentInstructions", async () => {
      const disposable = service.onDidChangeAgentInstructions(() => {
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      disposable.dispose();
    });
  });
  suite("getCustomAgents", () => {
    teardown(() => {
      sinon.restore();
    });
    test("header with handOffs", async () => {
      const rootFolderName = "custom-agents-with-handoffs";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/agents/agent1.agent.md`,
          contents: [
            "---",
            "description: 'Agent file 1.'",
            'handoffs: [ { agent: "Edit", label: "Do it", prompt: "Do it now" } ]',
            "---"
          ]
        }
      ]);
      const result = (await service.getCustomAgents(CancellationToken.None)).map((agent) => ({ ...agent, uri: URI.from(agent.uri) }));
      const expected = [
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/agent1.agent.md").toString(),
          name: "agent1",
          description: "Agent file 1.",
          handOffs: [{ agent: "Edit", label: "Do it", prompt: "Do it now" }],
          agentInstructions: {
            content: "",
            toolReferences: [],
            metadata: void 0
          },
          model: void 0,
          argumentHint: void 0,
          tools: void 0,
          target: Target.Undefined,
          visibility: { userInvocable: true, agentInvocable: true },
          agents: void 0,
          hooks: void 0,
          sessionTypes: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/agent1.agent.md"),
          source: { storage: PromptsStorage.local },
          enabled: true
        }
      ];
      assert.deepEqual(
        result,
        expected,
        "Must get custom agents."
      );
    });
    test("body with tool references", async () => {
      const rootFolderName = "custom-agents";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/agents/agent1.agent.md`,
          contents: [
            "---",
            "description: 'Agent file 1.'",
            "tools: [ tool1, tool2 ]",
            "---",
            "Do it with #tool:tool1"
          ]
        },
        {
          path: `${rootFolder}/.github/agents/agent2.agent.md`,
          contents: [
            "First use #tool:tool2\nThen use #tool:tool1"
          ]
        }
      ]);
      const result = (await service.getCustomAgents(CancellationToken.None)).map((agent) => ({ ...agent, uri: URI.from(agent.uri) }));
      const expected = [
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/agent1.agent.md").toString(),
          name: "agent1",
          description: "Agent file 1.",
          tools: ["tool1", "tool2"],
          agentInstructions: {
            content: "Do it with #tool:tool1",
            toolReferences: [{ name: "tool1", range: { start: 11, endExclusive: 22 } }],
            metadata: void 0
          },
          handOffs: void 0,
          model: void 0,
          argumentHint: void 0,
          target: Target.Undefined,
          visibility: { userInvocable: true, agentInvocable: true },
          agents: void 0,
          hooks: void 0,
          sessionTypes: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/agent1.agent.md"),
          source: { storage: PromptsStorage.local },
          enabled: true
        },
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/agent2.agent.md").toString(),
          name: "agent2",
          agentInstructions: {
            content: "First use #tool:tool2\nThen use #tool:tool1",
            toolReferences: [
              { name: "tool1", range: { start: 31, endExclusive: 42 } },
              { name: "tool2", range: { start: 10, endExclusive: 21 } }
            ],
            metadata: void 0
          },
          hooks: void 0,
          sessionTypes: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/agent2.agent.md"),
          source: { storage: PromptsStorage.local },
          target: Target.Undefined,
          visibility: { userInvocable: true, agentInvocable: true },
          enabled: true
        }
      ];
      assert.deepEqual(
        result,
        expected,
        "Must get custom agents."
      );
    });
    test("header with argumentHint", async () => {
      const rootFolderName = "custom-agents-with-argument-hint";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/agents/agent1.agent.md`,
          contents: [
            "---",
            "description: 'Code review agent.'",
            "argument-hint: 'Provide file path or code snippet to review'",
            "tools: [ code-analyzer, linter ]",
            "---",
            "I will help review your code for best practices."
          ]
        },
        {
          path: `${rootFolder}/.github/agents/agent2.agent.md`,
          contents: [
            "---",
            "description: 'Documentation generator.'",
            "argument-hint: 'Specify function or class name to document'",
            "---",
            "I generate comprehensive documentation."
          ]
        }
      ]);
      const result = (await service.getCustomAgents(CancellationToken.None)).map((agent) => ({ ...agent, uri: URI.from(agent.uri) }));
      const expected = [
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/agent1.agent.md").toString(),
          name: "agent1",
          description: "Code review agent.",
          argumentHint: "Provide file path or code snippet to review",
          tools: ["code-analyzer", "linter"],
          agentInstructions: {
            content: "I will help review your code for best practices.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          model: void 0,
          target: Target.Undefined,
          visibility: { userInvocable: true, agentInvocable: true },
          agents: void 0,
          hooks: void 0,
          sessionTypes: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/agent1.agent.md"),
          source: { storage: PromptsStorage.local },
          enabled: true
        },
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/agent2.agent.md").toString(),
          name: "agent2",
          description: "Documentation generator.",
          argumentHint: "Specify function or class name to document",
          agentInstructions: {
            content: "I generate comprehensive documentation.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          model: void 0,
          tools: void 0,
          target: Target.Undefined,
          visibility: { userInvocable: true, agentInvocable: true },
          agents: void 0,
          hooks: void 0,
          sessionTypes: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/agent2.agent.md"),
          source: { storage: PromptsStorage.local },
          enabled: true
        }
      ];
      assert.deepEqual(
        result,
        expected,
        "Must get custom agents with argumentHint."
      );
    });
    test("header with target", async () => {
      const rootFolderName = "custom-agents-with-target";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/agents/github-agent.agent.md`,
          contents: [
            "---",
            "description: 'GitHub Copilot specialized agent.'",
            "target: 'github-copilot'",
            "tools: [ github-api, code-search ]",
            "---",
            "I am optimized for GitHub Copilot workflows."
          ]
        },
        {
          path: `${rootFolder}/.github/agents/vscode-agent.agent.md`,
          contents: [
            "---",
            "description: 'VS Code specialized agent.'",
            "target: 'vscode'",
            "model: 'gpt-4'",
            "---",
            "I am specialized for VS Code editor tasks."
          ]
        },
        {
          path: `${rootFolder}/.github/agents/generic-agent.agent.md`,
          contents: [
            "---",
            "description: 'Generic agent without target.'",
            "---",
            "I work everywhere."
          ]
        }
      ]);
      const result = (await service.getCustomAgents(CancellationToken.None)).map((agent) => ({ ...agent, uri: URI.from(agent.uri) }));
      const expected = [
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/github-agent.agent.md").toString(),
          name: "github-agent",
          description: "GitHub Copilot specialized agent.",
          target: Target.GitHubCopilot,
          tools: ["github-api", "code-search"],
          agentInstructions: {
            content: "I am optimized for GitHub Copilot workflows.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          model: void 0,
          argumentHint: void 0,
          visibility: { userInvocable: true, agentInvocable: true },
          agents: void 0,
          hooks: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/github-agent.agent.md"),
          sessionTypes: void 0,
          source: { storage: PromptsStorage.local },
          enabled: true
        },
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/vscode-agent.agent.md").toString(),
          name: "vscode-agent",
          description: "VS Code specialized agent.",
          target: Target.VSCode,
          model: ["gpt-4"],
          agentInstructions: {
            content: "I am specialized for VS Code editor tasks.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          argumentHint: void 0,
          tools: void 0,
          visibility: { userInvocable: true, agentInvocable: true },
          agents: void 0,
          hooks: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/vscode-agent.agent.md"),
          sessionTypes: void 0,
          source: { storage: PromptsStorage.local },
          enabled: true
        },
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/generic-agent.agent.md").toString(),
          name: "generic-agent",
          description: "Generic agent without target.",
          agentInstructions: {
            content: "I work everywhere.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          model: void 0,
          argumentHint: void 0,
          tools: void 0,
          target: Target.Undefined,
          visibility: { userInvocable: true, agentInvocable: true },
          agents: void 0,
          hooks: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/generic-agent.agent.md"),
          sessionTypes: void 0,
          source: { storage: PromptsStorage.local },
          enabled: true
        }
      ];
      assert.deepEqual(
        result,
        expected,
        "Must get custom agents with target attribute."
      );
    });
    test("claude agent maps tools and model to vscode equivalents", async () => {
      const rootFolderName = "claude-agent-mapping";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          // Claude agent with tools and model that should be mapped
          path: `${rootFolder}/.claude/agents/claude-agent.md`,
          contents: [
            "---",
            "description: 'Claude agent with tools and model.'",
            "tools: [ Read, Edit, Bash ]",
            "model: opus",
            "---",
            "I am a Claude agent."
          ]
        },
        {
          // Claude agent with more tools, some with empty equivalents
          path: `${rootFolder}/.claude/agents/claude-agent2.md`,
          contents: [
            "---",
            "description: 'Claude agent with various tools.'",
            "tools: [ Glob, Grep, Write, Task, Skill ]",
            "model: sonnet",
            "---",
            "I am another Claude agent."
          ]
        },
        {
          // Non-Claude agent should NOT have tools/model mapped
          path: `${rootFolder}/.github/agents/copilot-agent.agent.md`,
          contents: [
            "---",
            "description: 'Copilot agent with same tool names.'",
            "target: 'github-copilot'",
            "tools: [ Read, Edit ]",
            "model: gpt-4",
            "---",
            "I am a Copilot agent."
          ]
        }
      ]);
      const result = (await service.getCustomAgents(CancellationToken.None)).map((agent) => ({ ...agent, uri: URI.from(agent.uri) }));
      const expected = [
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/copilot-agent.agent.md").toString(),
          name: "copilot-agent",
          description: "Copilot agent with same tool names.",
          target: Target.GitHubCopilot,
          // Non-Claude agent: tools and model stay as-is
          tools: ["Read", "Edit"],
          model: ["gpt-4"],
          agentInstructions: {
            content: "I am a Copilot agent.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          argumentHint: void 0,
          visibility: { userInvocable: true, agentInvocable: true },
          agents: void 0,
          hooks: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/copilot-agent.agent.md"),
          sessionTypes: void 0,
          source: { storage: PromptsStorage.local },
          enabled: true
        },
        {
          id: URI.joinPath(rootFolderUri, ".claude/agents/claude-agent.md").toString(),
          name: "claude-agent",
          description: "Claude agent with tools and model.",
          target: Target.Claude,
          // Claude tools mapped to vscode equivalents
          tools: ["read/readFile", "read/getNotebookSummary", "edit/editNotebook", "edit/editFiles", "execute"],
          // Claude model mapped to vscode equivalent
          model: ["Claude Opus 4.6 (copilot)"],
          agentInstructions: {
            content: "I am a Claude agent.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          argumentHint: void 0,
          visibility: { userInvocable: true, agentInvocable: true },
          agents: void 0,
          hooks: void 0,
          uri: URI.joinPath(rootFolderUri, ".claude/agents/claude-agent.md"),
          sessionTypes: void 0,
          source: { storage: PromptsStorage.local },
          enabled: true
        },
        {
          id: URI.joinPath(rootFolderUri, ".claude/agents/claude-agent2.md").toString(),
          name: "claude-agent2",
          description: "Claude agent with various tools.",
          target: Target.Claude,
          // Tools mapped: Glob->search/fileSearch, Grep->search/textSearch, Write->edit/create*, Task->agent, Skill->[] (empty)
          tools: ["search/fileSearch", "search/textSearch", "edit/createDirectory", "edit/createFile", "edit/createJupyterNotebook", "agent"],
          model: ["Claude Sonnet 4.5 (copilot)"],
          agentInstructions: {
            content: "I am another Claude agent.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          argumentHint: void 0,
          visibility: { userInvocable: true, agentInvocable: true },
          agents: void 0,
          hooks: void 0,
          uri: URI.joinPath(rootFolderUri, ".claude/agents/claude-agent2.md"),
          sessionTypes: void 0,
          source: { storage: PromptsStorage.local },
          enabled: true
        }
      ];
      assert.deepEqual(
        result,
        expected,
        "Claude tools and models must be mapped to VS Code equivalents; non-Claude agents must remain unchanged."
      );
    });
    test("agents with .md extension should be recognized, except README.md", async () => {
      const rootFolderName = "custom-agents-md-extension";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/agents/demonstrate.md`,
          contents: [
            "---",
            "description: 'Demonstrate agent.'",
            "tools: [ demo-tool ]",
            "---",
            "This is a demonstration agent using .md extension."
          ]
        },
        {
          path: `${rootFolder}/.github/agents/README.md`,
          contents: [
            "This is a README file."
          ]
        }
      ]);
      const result = (await service.getCustomAgents(CancellationToken.None)).map((agent) => ({ ...agent, uri: URI.from(agent.uri) }));
      const expected = [
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/demonstrate.md").toString(),
          name: "demonstrate",
          description: "Demonstrate agent.",
          tools: ["demo-tool"],
          agentInstructions: {
            content: "This is a demonstration agent using .md extension.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          model: void 0,
          argumentHint: void 0,
          target: Target.Undefined,
          visibility: { userInvocable: true, agentInvocable: true },
          agents: void 0,
          hooks: void 0,
          sessionTypes: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/demonstrate.md"),
          source: { storage: PromptsStorage.local },
          enabled: true
        }
      ];
      assert.deepEqual(
        result,
        expected,
        "Must recognize .md files as agents, except README.md"
      );
    });
    test("header with agents", async () => {
      const rootFolderName = "custom-agents-with-restrictions";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/agents/restricted-agent.agent.md`,
          contents: [
            "---",
            "description: 'Agent with restricted access.'",
            "agents: [ subagent1, subagent2 ]",
            "tools: [ tool1 ]",
            "---",
            "This agent has restricted access."
          ]
        },
        {
          path: `${rootFolder}/.github/agents/no-access-agent.agent.md`,
          contents: [
            "---",
            "description: 'Agent with no access to subagents, skills, or instructions.'",
            "agents: []",
            "---",
            "This agent has no access."
          ]
        },
        {
          path: `${rootFolder}/.github/agents/full-access-agent.agent.md`,
          contents: [
            "---",
            "description: 'Agent with full access.'",
            'agents: [ "*" ]',
            "---",
            "This agent has full access."
          ]
        }
      ]);
      const result = (await service.getCustomAgents(CancellationToken.None)).map((agent) => ({ ...agent, uri: URI.from(agent.uri) }));
      const expected = [
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/restricted-agent.agent.md").toString(),
          name: "restricted-agent",
          description: "Agent with restricted access.",
          agents: ["subagent1", "subagent2"],
          tools: ["tool1"],
          agentInstructions: {
            content: "This agent has restricted access.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          model: void 0,
          argumentHint: void 0,
          target: Target.Undefined,
          visibility: { userInvocable: true, agentInvocable: true },
          hooks: void 0,
          sessionTypes: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/restricted-agent.agent.md"),
          source: { storage: PromptsStorage.local },
          enabled: true
        },
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/no-access-agent.agent.md").toString(),
          name: "no-access-agent",
          description: "Agent with no access to subagents, skills, or instructions.",
          agents: [],
          agentInstructions: {
            content: "This agent has no access.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          model: void 0,
          argumentHint: void 0,
          tools: void 0,
          target: Target.Undefined,
          visibility: { userInvocable: true, agentInvocable: true },
          hooks: void 0,
          sessionTypes: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/no-access-agent.agent.md"),
          source: { storage: PromptsStorage.local },
          enabled: true
        },
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/full-access-agent.agent.md").toString(),
          name: "full-access-agent",
          description: "Agent with full access.",
          agents: ["*"],
          agentInstructions: {
            content: "This agent has full access.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          model: void 0,
          argumentHint: void 0,
          tools: void 0,
          target: Target.Undefined,
          visibility: { userInvocable: true, agentInvocable: true },
          hooks: void 0,
          sessionTypes: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/full-access-agent.agent.md"),
          source: { storage: PromptsStorage.local },
          enabled: true
        }
      ];
      assert.deepEqual(
        result,
        expected,
        "Must get custom agents with agents, skills, and instructions attributes."
      );
    });
    test("header with infer: false sets agentInvocable to false", async () => {
      const rootFolderName = "custom-agents-infer-false";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/agents/agent-infer-false.agent.md`,
          contents: [
            "---",
            "description: 'Agent with infer: false.'",
            "infer: false",
            "---",
            "I should not be invocable by the model."
          ]
        },
        {
          path: `${rootFolder}/.github/agents/agent-infer-true.agent.md`,
          contents: [
            "---",
            "description: 'Agent with infer: true.'",
            "infer: true",
            "---",
            "I should be invocable by the model."
          ]
        },
        {
          path: `${rootFolder}/.github/agents/agent-no-infer.agent.md`,
          contents: [
            "---",
            "description: 'Agent without infer.'",
            "---",
            "I should default to being invocable by the model."
          ]
        }
      ]);
      const result = (await service.getCustomAgents(CancellationToken.None)).map((agent) => ({ ...agent, uri: URI.from(agent.uri) }));
      const inferFalseAgent = result.find((a) => a.name === "agent-infer-false");
      assert.ok(inferFalseAgent, "Should find agent with infer: false");
      assert.strictEqual(inferFalseAgent.visibility.agentInvocable, false, "infer: false should set agentInvocable to false");
      const inferTrueAgent = result.find((a) => a.name === "agent-infer-true");
      assert.ok(inferTrueAgent, "Should find agent with infer: true");
      assert.strictEqual(inferTrueAgent.visibility.agentInvocable, true, "infer: true should set agentInvocable to true");
      const noInferAgent = result.find((a) => a.name === "agent-no-infer");
      assert.ok(noInferAgent, "Should find agent without infer");
      assert.strictEqual(noInferAgent.visibility.agentInvocable, true, "missing infer should default agentInvocable to true");
    });
    test("agents from user data folder", async () => {
      const rootFolderName = "custom-agents-user-data";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const userPromptsFolder = "/user-data/prompts";
      const userPromptsFolderUri = URI.file(userPromptsFolder);
      const customUserDataProfileService = {
        _serviceBrand: void 0,
        onDidChangeCurrentProfile: Event.None,
        currentProfile: {
          ...toUserDataProfile("test", "test", URI.file(userPromptsFolder).with({ path: "/user-data" }), URI.file("/cache")),
          promptsHome: userPromptsFolderUri
        },
        updateCurrentProfile: async () => {
        }
      };
      instaService.stub(IUserDataProfileService, customUserDataProfileService);
      service.dispose();
      const testService = disposables.add(instaService.createInstance(PromptsService));
      await mockFiles(fileService, [
        // Workspace agent
        {
          path: `${rootFolder}/.github/agents/workspace-agent.agent.md`,
          contents: [
            "---",
            "description: 'Workspace agent.'",
            "---",
            "I am a workspace agent."
          ]
        },
        // User data agent
        {
          path: `${userPromptsFolder}/user-agent.agent.md`,
          contents: [
            "---",
            "description: 'User data agent.'",
            "tools: [ user-tool ]",
            "---",
            "I am a user data agent."
          ]
        },
        // Another user data agent without header
        {
          path: `${userPromptsFolder}/simple-user-agent.agent.md`,
          contents: [
            "A simple user agent without header."
          ]
        }
      ]);
      const result = (await testService.getCustomAgents(CancellationToken.None)).map((agent) => ({ ...agent, uri: URI.from(agent.uri) }));
      assert.strictEqual(result.length, 3, "Should find 3 agents (1 workspace + 2 user data)");
      const workspaceAgent = result.find((a) => a.source.storage === PromptsStorage.local);
      assert.ok(workspaceAgent, "Should find workspace agent");
      assert.strictEqual(workspaceAgent.name, "workspace-agent");
      assert.strictEqual(workspaceAgent.description, "Workspace agent.");
      const userAgents = result.filter((a) => a.source.storage === PromptsStorage.user);
      assert.strictEqual(userAgents.length, 2, "Should find 2 user data agents");
      const userAgentWithHeader = userAgents.find((a) => a.name === "user-agent");
      assert.ok(userAgentWithHeader, "Should find user agent with header");
      assert.strictEqual(userAgentWithHeader.description, "User data agent.");
      assert.deepStrictEqual(userAgentWithHeader.tools, ["user-tool"]);
      const simpleUserAgent = userAgents.find((a) => a.name === "simple-user-agent");
      assert.ok(simpleUserAgent, "Should find simple user agent");
      assert.strictEqual(simpleUserAgent.agentInstructions.content, "A simple user agent without header.");
    });
    test("disabled agents are reported with enabled: false", async () => {
      const rootFolderName = "custom-agents-disabled";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      instaService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
      service.dispose();
      const testService = disposables.add(instaService.createInstance(PromptsService));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/agents/enabled-agent.agent.md`,
          contents: [
            "---",
            "description: 'Enabled agent.'",
            "---",
            "I am enabled."
          ]
        },
        {
          path: `${rootFolder}/.github/agents/disabled-agent.agent.md`,
          contents: [
            "---",
            "description: 'Disabled agent.'",
            "---",
            "I am disabled."
          ]
        },
        {
          path: `${rootFolder}/.github/agents/another-disabled-agent.agent.md`,
          contents: [
            "---",
            "description: 'Another disabled agent.'",
            "---",
            "I am also disabled."
          ]
        }
      ]);
      const initial = await testService.getCustomAgents(CancellationToken.None);
      const toDisable = initial.filter((a) => a.name === "disabled-agent" || a.name === "another-disabled-agent");
      const disabledUris = new ResourceSet();
      for (const a of toDisable) {
        disabledUris.add(URI.from(a.uri));
      }
      testService.setDisabledPromptFiles(PromptsType.agent, disabledUris);
      const persisted = testService.getDisabledPromptFiles(PromptsType.agent);
      assert.strictEqual(persisted.size, 2, `Expected 2 disabled agents, got ${persisted.size}`);
      const result = await testService.getCustomAgents(CancellationToken.None);
      assert.strictEqual(result.length, 3, "Should still discover all 3 agents");
      const enabledAgent = result.find((a) => a.name === "enabled-agent");
      assert.ok(enabledAgent, "Should find enabled-agent");
      assert.strictEqual(enabledAgent.enabled, true, "enabled-agent should be enabled");
      const disabledAgent = result.find((a) => a.name === "disabled-agent");
      assert.ok(disabledAgent, "Should find disabled-agent");
      assert.strictEqual(disabledAgent.enabled, false, "disabled-agent should be disabled");
      const anotherDisabledAgent = result.find((a) => a.name === "another-disabled-agent");
      assert.ok(anotherDisabledAgent, "Should find another-disabled-agent");
      assert.strictEqual(anotherDisabledAgent.enabled, false, "another-disabled-agent should be disabled");
    });
    test("getDiscoveryInfo reports enabled and disabled agents", async () => {
      const rootFolderName = "discovery-info-agents";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      instaService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
      service.dispose();
      const testService = disposables.add(instaService.createInstance(PromptsService));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/agents/enabled-agent.agent.md`,
          contents: [
            "---",
            "description: 'Enabled agent.'",
            "---",
            "I am enabled."
          ]
        },
        {
          path: `${rootFolder}/.github/agents/disabled-agent.agent.md`,
          contents: [
            "---",
            "description: 'Disabled agent.'",
            "---",
            "I am disabled."
          ]
        }
      ]);
      const initial = await testService.getCustomAgents(CancellationToken.None);
      const disabled = initial.find((a) => a.name === "disabled-agent");
      assert.ok(disabled, "Should find disabled-agent in initial discovery");
      const disabledUris = new ResourceSet();
      disabledUris.add(URI.from(disabled.uri));
      testService.setDisabledPromptFiles(PromptsType.agent, disabledUris);
      const discoveryInfo = await testService.getDiscoveryInfo(PromptsType.agent, CancellationToken.None);
      assert.strictEqual(discoveryInfo.type, PromptsType.agent);
      assert.strictEqual(discoveryInfo.files.length, 2, "Discovery should include both agents");
      const enabledFile = discoveryInfo.files.find((f) => f.promptPath.uri.path.endsWith("enabled-agent.agent.md"));
      assert.ok(enabledFile, "Should report enabled-agent in discovery info");
      assert.strictEqual(enabledFile.status, "loaded", "Enabled agent should be loaded");
      assert.strictEqual(enabledFile.skipReason, void 0, "Enabled agent should not have a skip reason");
      assert.ok(enabledFile.agent, "Enabled agent file should carry resolved agent");
      assert.strictEqual(enabledFile.agent.enabled, true);
      const disabledFile = discoveryInfo.files.find((f) => f.promptPath.uri.path.endsWith("disabled-agent.agent.md"));
      assert.ok(disabledFile, "Should report disabled-agent in discovery info");
      assert.strictEqual(disabledFile.status, "skipped", "Disabled agent should be skipped");
      assert.strictEqual(disabledFile.skipReason, "disabled", 'Disabled agent should have skipReason "disabled"');
      assert.ok(disabledFile.agent, "Disabled agent file should still carry resolved agent");
      assert.strictEqual(disabledFile.agent.enabled, false);
    });
  });
  suite("listPromptFiles - prompts", () => {
    test("prompts from user data folder", async () => {
      const rootFolderName = "prompts-user-data";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const userPromptsFolder = "/home/user/user-data-prompts";
      const userPromptsFolderUri = URI.file(userPromptsFolder);
      testConfigService.setUserConfiguration(PromptsConfig.PROMPT_LOCATIONS_KEY, {
        [PROMPT_DEFAULT_SOURCE_FOLDER]: true,
        "~/.copilot/prompts": true,
        "~/shared-prompts": true,
        "/home/user/shared-prompts": true,
        "~/user-data-prompts": true,
        [userPromptsFolder]: true,
        [`${userPromptsFolder}/team`]: true
      });
      const customUserDataProfileService = {
        _serviceBrand: void 0,
        onDidChangeCurrentProfile: Event.None,
        currentProfile: {
          ...toUserDataProfile("test", "test", URI.file(userPromptsFolder).with({ path: "/user-data" }), URI.file("/cache")),
          promptsHome: userPromptsFolderUri
        },
        updateCurrentProfile: async () => {
        }
      };
      instaService.stub(IUserDataProfileService, customUserDataProfileService);
      service.dispose();
      const testService = disposables.add(instaService.createInstance(PromptsService));
      await mockFiles(fileService, [
        // Workspace prompt
        {
          path: `${rootFolder}/.github/prompts/workspace-prompt.prompt.md`,
          contents: [
            "---",
            "description: 'Workspace prompt.'",
            "---",
            "I am a workspace prompt."
          ]
        },
        // User data prompt
        {
          path: `${userPromptsFolder}/user-prompt.prompt.md`,
          contents: [
            "---",
            "description: 'User data prompt.'",
            "---",
            "I am a user data prompt."
          ]
        },
        {
          path: "/home/user/shared-prompts/shared.prompt.md",
          contents: [
            "---",
            "description: 'Shared configured prompt.'",
            "---",
            "I am configured for both storages."
          ]
        },
        {
          path: `${userPromptsFolder}/team/team.prompt.md`,
          contents: [
            "---",
            "description: 'Nested user data prompt.'",
            "---",
            "I am a nested user data prompt."
          ]
        },
        {
          path: "/home/user/.copilot/prompts/personal.prompt.md",
          contents: [
            "---",
            "description: 'Personal prompt.'",
            "---",
            "I am a personal prompt."
          ]
        }
      ]);
      const [allPrompts, userPrompts, workspacePrompts] = await Promise.all([
        testService.listPromptFiles(PromptsType.prompt, CancellationToken.None),
        testService.listPromptFilesForStorage(PromptsType.prompt, PromptsStorage.user, CancellationToken.None),
        testService.listPromptFilesForStorage(PromptsType.prompt, PromptsStorage.local, CancellationToken.None)
      ]);
      const summarize = (prompts) => prompts.map((prompt) => ({ file: basename(prompt.uri), storage: prompt.storage, source: prompt.source })).sort((a, b) => `${a.file}:${a.storage}`.localeCompare(`${b.file}:${b.storage}`));
      assert.deepStrictEqual({
        allPrompts: summarize(allPrompts),
        userPrompts: summarize(userPrompts),
        workspacePrompts: summarize(workspacePrompts)
      }, {
        allPrompts: [
          { file: "personal.prompt.md", storage: PromptsStorage.user, source: PromptFileSource.ConfigPersonal },
          { file: "shared.prompt.md", storage: PromptsStorage.local, source: PromptFileSource.ConfigWorkspace },
          { file: "shared.prompt.md", storage: PromptsStorage.user, source: PromptFileSource.ConfigPersonal },
          { file: "team.prompt.md", storage: PromptsStorage.user, source: PromptFileSource.UserData },
          { file: "user-prompt.prompt.md", storage: PromptsStorage.user, source: PromptFileSource.UserData },
          { file: "workspace-prompt.prompt.md", storage: PromptsStorage.local, source: PromptFileSource.GitHubWorkspace }
        ],
        userPrompts: [
          { file: "personal.prompt.md", storage: PromptsStorage.user, source: PromptFileSource.ConfigPersonal },
          { file: "shared.prompt.md", storage: PromptsStorage.user, source: PromptFileSource.ConfigPersonal },
          { file: "team.prompt.md", storage: PromptsStorage.user, source: PromptFileSource.UserData },
          { file: "user-prompt.prompt.md", storage: PromptsStorage.user, source: PromptFileSource.UserData }
        ],
        workspacePrompts: [
          { file: "shared.prompt.md", storage: PromptsStorage.local, source: PromptFileSource.ConfigWorkspace },
          { file: "workspace-prompt.prompt.md", storage: PromptsStorage.local, source: PromptFileSource.GitHubWorkspace }
        ]
      });
    });
  });
  suite("listPromptFiles - instructions", () => {
    test("instructions from user data folder", async () => {
      const rootFolderName = "instructions-user-data";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const userPromptsFolder = "/home/user/user-data-prompts";
      const userPromptsFolderUri = URI.file(userPromptsFolder);
      testConfigService.setUserConfiguration(PromptsConfig.INSTRUCTIONS_LOCATION_KEY, {
        [INSTRUCTIONS_DEFAULT_SOURCE_FOLDER]: true,
        "~/": true,
        "/home/user": true
      });
      const customUserDataProfileService = {
        _serviceBrand: void 0,
        onDidChangeCurrentProfile: Event.None,
        currentProfile: {
          ...toUserDataProfile("test", "test", URI.file(userPromptsFolder).with({ path: "/user-data" }), URI.file("/cache")),
          promptsHome: userPromptsFolderUri
        },
        updateCurrentProfile: async () => {
        }
      };
      instaService.stub(IUserDataProfileService, customUserDataProfileService);
      service.dispose();
      const testService = disposables.add(instaService.createInstance(PromptsService));
      await mockFiles(fileService, [
        // Workspace instructions
        {
          path: `${rootFolder}/.github/instructions/workspace-instructions.instructions.md`,
          contents: [
            "---",
            "description: 'Workspace instructions.'",
            'applyTo: "**/*.ts"',
            "---",
            "I am workspace instructions."
          ]
        },
        // User data instructions
        {
          path: `${userPromptsFolder}/user-instructions.instructions.md`,
          contents: [
            "---",
            "description: 'User data instructions.'",
            'applyTo: "**/*.tsx"',
            "---",
            "I am user data instructions."
          ]
        }
      ]);
      const [allInstructions, userInstructions, workspaceInstructions] = await Promise.all([
        testService.listPromptFiles(PromptsType.instructions, CancellationToken.None),
        testService.listPromptFilesForStorage(PromptsType.instructions, PromptsStorage.user, CancellationToken.None),
        testService.listPromptFilesForStorage(PromptsType.instructions, PromptsStorage.local, CancellationToken.None)
      ]);
      const summarize = (instructions) => instructions.map((instruction) => ({ file: basename(instruction.uri), storage: instruction.storage, source: instruction.source })).sort((a, b) => a.file.localeCompare(b.file));
      assert.deepStrictEqual({
        allInstructions: summarize(allInstructions),
        userInstructions: summarize(userInstructions),
        workspaceInstructions: summarize(workspaceInstructions)
      }, {
        allInstructions: [
          { file: "user-instructions.instructions.md", storage: PromptsStorage.user, source: PromptFileSource.UserData },
          { file: "workspace-instructions.instructions.md", storage: PromptsStorage.local, source: PromptFileSource.GitHubWorkspace }
        ],
        userInstructions: [
          { file: "user-instructions.instructions.md", storage: PromptsStorage.user, source: PromptFileSource.UserData }
        ],
        workspaceInstructions: [
          { file: "workspace-instructions.instructions.md", storage: PromptsStorage.local, source: PromptFileSource.GitHubWorkspace }
        ]
      });
    });
  });
  suite("listPromptFiles - skills ", () => {
    teardown(() => {
      sinon.restore();
    });
    test("should list skill files from workspace", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "list-skills-workspace";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/skill1/SKILL.md`,
          contents: [
            "---",
            'name: "Skill 1"',
            'description: "First skill"',
            "---",
            "Skill 1 content"
          ]
        },
        {
          path: `${rootFolder}/.claude/skills/skill2/SKILL.md`,
          contents: [
            "---",
            'name: "Skill 2"',
            'description: "Second skill"',
            "---",
            "Skill 2 content"
          ]
        }
      ]);
      const result = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
      assert.strictEqual(result.length, 2, "Should find 2 skills");
      const skill1 = result.find((s) => s.uri.path.includes("skill1"));
      assert.ok(skill1, "Should find skill1");
      assert.strictEqual(skill1.type, PromptsType.skill);
      assert.strictEqual(skill1.storage, PromptsStorage.local);
      const skill2 = result.find((s) => s.uri.path.includes("skill2"));
      assert.ok(skill2, "Should find skill2");
      assert.strictEqual(skill2.type, PromptsType.skill);
      assert.strictEqual(skill2.storage, PromptsStorage.local);
    });
    test("should list skill files from user home", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "list-skills-user-home";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: "/home/user/.copilot/skills/personal-skill/SKILL.md",
          contents: [
            "---",
            'name: "Personal Skill"',
            'description: "A personal skill"',
            "---",
            "Personal skill content"
          ]
        },
        {
          path: "/home/user/.claude/skills/claude-personal/SKILL.md",
          contents: [
            "---",
            'name: "Claude Personal Skill"',
            'description: "A Claude personal skill"',
            "---",
            "Claude personal skill content"
          ]
        }
      ]);
      const result = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
      const personalSkills = result.filter((s) => s.storage === PromptsStorage.user);
      assert.strictEqual(personalSkills.length, 2, "Should find 2 personal skills");
      const copilotSkill = personalSkills.find((s) => s.uri.path.includes(".copilot"));
      assert.ok(copilotSkill, "Should find copilot personal skill");
      const claudeSkill = personalSkills.find((s) => s.uri.path.includes(CLAUDE_CONFIG_FOLDER));
      assert.ok(claudeSkill, "Should find claude personal skill");
    });
    test("should not list skills when not in skill folder structure", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      const rootFolderName = "no-skills";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/prompts/SKILL.md`,
          contents: [
            "---",
            'name: "Not a skill"',
            "---",
            "This is in prompts folder, not skills"
          ]
        },
        {
          path: `${rootFolder}/SKILL.md`,
          contents: [
            "---",
            'name: "Root skill"',
            "---",
            "This is in root, not skills folder"
          ]
        }
      ]);
      const result = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
      assert.strictEqual(result.length, 0, "Should not find any skills in non-skill locations");
    });
    test("should handle mixed workspace and user home skills", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "mixed-skills";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        // Workspace skills
        {
          path: `${rootFolder}/.github/skills/workspace-skill/SKILL.md`,
          contents: [
            "---",
            'name: "Workspace Skill"',
            'description: "A workspace skill"',
            "---",
            "Workspace skill content"
          ]
        },
        // User home skills
        {
          path: "/home/user/.copilot/skills/personal-skill/SKILL.md",
          contents: [
            "---",
            'name: "Personal Skill"',
            'description: "A personal skill"',
            "---",
            "Personal skill content"
          ]
        }
      ]);
      const result = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
      const workspaceSkills = result.filter((s) => s.storage === PromptsStorage.local);
      const userSkills = result.filter((s) => s.storage === PromptsStorage.user);
      assert.strictEqual(workspaceSkills.length, 1, "Should find 1 workspace skill");
      assert.strictEqual(userSkills.length, 1, "Should find 1 user skill");
    });
    test("should respect disabled default paths via config", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {
        ".github/skills": false,
        ".claude/skills": true
      });
      const rootFolderName = "disabled-default-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/github-skill/SKILL.md`,
          contents: [
            "---",
            'name: "GitHub Skill"',
            'description: "Should NOT be found"',
            "---",
            "This skill is in a disabled folder"
          ]
        },
        {
          path: `${rootFolder}/.claude/skills/claude-skill/SKILL.md`,
          contents: [
            "---",
            'name: "Claude Skill"',
            'description: "Should be found"',
            "---",
            "This skill is in an enabled folder"
          ]
        }
      ]);
      const result = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
      assert.strictEqual(result.length, 1, "Should find only 1 skill (from enabled folder)");
      assert.ok(result[0].uri.path.includes(".claude/skills"), "Should only find skill from .claude/skills");
      assert.ok(!result[0].uri.path.includes(".github/skills"), "Should not find skill from disabled .github/skills");
    });
    test("should expand tilde paths in custom locations", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {
        ".github/skills": false,
        ".claude/skills": false,
        "~/my-custom-skills": true
      });
      const rootFolderName = "tilde-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: "/home/user/my-custom-skills/custom-skill/SKILL.md",
          contents: [
            "---",
            'name: "Custom Skill"',
            'description: "A skill from tilde path"',
            "---",
            "Skill content from ~/my-custom-skills"
          ]
        }
      ]);
      const result = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
      assert.strictEqual(result.length, 1, "Should find 1 skill from tilde-expanded path");
      assert.ok(result[0].uri.path.includes("/home/user/my-custom-skills"), "Path should be expanded from tilde");
    });
  });
  suite("getSourceFolders - skills", () => {
    test("includes user-level skill source folders", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderUri = URI.file("/skills-source-folders");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const folders = await service.getSourceFolders(PromptsType.skill);
      const userFolders = folders.filter((f) => f.storage === PromptsStorage.user);
      const localFolders = folders.filter((f) => f.storage === PromptsStorage.local);
      assert.ok(userFolders.length > 0, "Should include user-level skill source folders");
      assert.ok(localFolders.length > 0, "Should include workspace-level skill source folders");
      assert.ok(
        userFolders.some((f) => f.uri.path === "/home/user/.copilot/skills"),
        "Should include ~/.copilot/skills as a user source folder"
      );
    });
    test("excludes defaults explicitly disabled via configuration", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {
        ".github/skills": false,
        "~/.copilot/skills": false
      });
      const rootFolderUri = URI.file("/skills-disabled-defaults");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const folders = await service.getSourceFolders(PromptsType.skill);
      const paths = folders.map((f) => f.uri.path);
      assert.ok(!paths.some((p) => p.endsWith("/.github/skills")), "Disabled .github/skills must not appear");
      assert.ok(!paths.includes("/home/user/.copilot/skills"), "Disabled ~/.copilot/skills must not appear");
      assert.ok(paths.includes("/home/user/.agents/skills"), "Non-disabled ~/.agents/skills must still appear");
    });
  });
  suite("listPromptFiles - extensions", () => {
    test("Contributed prompt file", async () => {
      const uri = URI.parse("file://extensions/my-extension/textMate.instructions.md");
      const extension = {};
      const registered = service.registerContributedFile(
        PromptsType.instructions,
        uri,
        extension,
        "TextMate Instructions",
        "Instructions to follow when authoring TextMate grammars"
      );
      const actual = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      assert.strictEqual(actual.length, 1);
      assert.strictEqual(actual[0].uri.toString(), uri.toString());
      assert.strictEqual(actual[0].name, "TextMate Instructions");
      assert.strictEqual(actual[0].storage, PromptsStorage.extension);
      assert.strictEqual(actual[0].type, PromptsType.instructions);
      registered.dispose();
    });
    test("getInstructionFiles returns resolved metadata", async () => {
      const uri = URI.parse("file://extensions/my-extension/textMate.instructions.md");
      const extension = {
        identifier: { value: "test.my-extension" }
      };
      await mockFiles(fileService, [{
        path: uri.path,
        contents: [
          "---",
          "name: TextMate Instructions",
          "description: Instructions to follow when authoring TextMate grammars",
          'applyTo: "**/*.tmLanguage.json"',
          "---",
          "Use scopes carefully."
        ]
      }]);
      const registered = service.registerContributedFile(
        PromptsType.instructions,
        uri,
        extension,
        void 0,
        void 0
      );
      const actual = await service.getInstructionFiles(CancellationToken.None);
      assert.deepStrictEqual(actual.map(({ uri: uri2, name, description, pattern, storage, source, pluginUri, extension: extension2 }) => ({ uri: uri2, name, description, applyTo: pattern, storage, source, pluginUri, extension: extension2 })), [{
        uri,
        name: "TextMate Instructions",
        description: "Instructions to follow when authoring TextMate grammars",
        applyTo: "**/*.tmLanguage.json",
        storage: PromptsStorage.extension,
        source: PromptFileSource.ExtensionContribution,
        pluginUri: void 0,
        extension
      }]);
      registered.dispose();
    });
    test("Custom agent provider", async () => {
      const agentUri = URI.parse("file://extensions/my-extension/myAgent.agent.md");
      const extension = {
        identifier: { value: "test.my-extension" },
        enabledApiProposals: ["chatParticipantPrivate"]
      };
      await mockFiles(fileService, [
        {
          path: agentUri.path,
          contents: [
            "---",
            "description: 'My custom agent from provider'",
            "tools: [ tool1, tool2 ]",
            "---",
            "I am a custom agent from a provider."
          ]
        }
      ]);
      const provider = {
        providePromptFiles: async (_context, _token) => {
          return [
            {
              uri: agentUri
            }
          ];
        }
      };
      const registered = service.registerPromptFileProvider(extension, PromptsType.agent, provider);
      const actual = await service.getCustomAgents(CancellationToken.None);
      assert.strictEqual(actual.length, 1);
      assert.strictEqual(actual[0].name, "myAgent");
      assert.strictEqual(actual[0].description, "My custom agent from provider");
      assert.strictEqual(actual[0].uri.toString(), agentUri.toString());
      assert.strictEqual(actual[0].source.storage, PromptsStorage.extension);
      registered.dispose();
      const actualAfterDispose = await service.getCustomAgents(CancellationToken.None);
      assert.strictEqual(actualAfterDispose.length, 0);
    });
    test("Canceled prompt file provider is skipped without logging", async () => {
      const extension = {
        identifier: { value: "test.my-extension" },
        enabledApiProposals: ["chatParticipantPrivate"]
      };
      const logErrorSpy = sinon.spy(logService, "error");
      const registered = service.registerPromptFileProvider(extension, PromptsType.instructions, {
        providePromptFiles: async () => {
          throw new CancellationError();
        }
      });
      try {
        const files = await service.listPromptFilesForStorage(PromptsType.instructions, PromptsStorage.extension, CancellationToken.None);
        assert.deepStrictEqual({ files, errorCalls: logErrorSpy.callCount }, { files: [], errorCalls: 0 });
      } finally {
        registered.dispose();
        logErrorSpy.restore();
      }
    });
    test("Prompt file provider error is logged and skipped", async () => {
      const extension = {
        identifier: { value: "test.my-extension" },
        enabledApiProposals: ["chatParticipantPrivate"]
      };
      const logErrorSpy = sinon.spy(logService, "error");
      const registered = service.registerPromptFileProvider(extension, PromptsType.instructions, {
        providePromptFiles: async () => {
          throw new Error("provider failed");
        }
      });
      try {
        const files = await service.listPromptFilesForStorage(PromptsType.instructions, PromptsStorage.extension, CancellationToken.None);
        assert.deepStrictEqual({ files, errorCalls: logErrorSpy.callCount }, { files: [], errorCalls: 1 });
      } finally {
        registered.dispose();
        logErrorSpy.restore();
      }
    });
    test("Canceled provider listing stops without logging an error", async () => {
      const extension = {
        identifier: { value: "test.my-extension" },
        enabledApiProposals: ["chatParticipantPrivate"]
      };
      const cancellationTokenSource = disposables.add(new CancellationTokenSource());
      let secondProviderCalled = false;
      disposables.add(service.registerPromptFileProvider(extension, PromptsType.agent, {
        providePromptFiles: async () => {
          cancellationTokenSource.cancel();
          throw new CancellationError();
        }
      }));
      disposables.add(service.registerPromptFileProvider(extension, PromptsType.agent, {
        providePromptFiles: async () => {
          secondProviderCalled = true;
          return [];
        }
      }));
      const errorSpy = sinon.spy(logService, "error");
      try {
        await service.listPromptFiles(PromptsType.agent, cancellationTokenSource.token);
        assert.deepStrictEqual({
          secondProviderCalled,
          errorCount: errorSpy.callCount
        }, {
          secondProviderCalled: false,
          errorCount: 0
        });
      } finally {
        errorSpy.restore();
      }
    });
    test("Contributed agent file that does not exist should not crash", async () => {
      const nonExistentUri = URI.parse("file://extensions/my-extension/nonexistent.agent.md");
      const existingUri = URI.parse("file://extensions/my-extension/existing.agent.md");
      const extension = {
        identifier: { value: "test.my-extension" }
      };
      await mockFiles(fileService, [
        {
          path: existingUri.path,
          contents: [
            "---",
            "name: 'Existing Agent'",
            "description: 'An agent that exists'",
            "---",
            "I am an existing agent."
          ]
        }
      ]);
      const registered1 = service.registerContributedFile(
        PromptsType.agent,
        nonExistentUri,
        extension,
        "NonExistent Agent",
        "An agent that does not exist"
      );
      const registered2 = service.registerContributedFile(
        PromptsType.agent,
        existingUri,
        extension,
        "Existing Agent",
        "An agent that exists"
      );
      const agents = await service.getCustomAgents(CancellationToken.None);
      assert.strictEqual(agents.length, 1, "Should only return the agent that exists");
      assert.strictEqual(agents[0].name, "Existing Agent");
      assert.strictEqual(agents[0].description, "An agent that exists");
      assert.strictEqual(agents[0].uri.toString(), existingUri.toString());
      registered1.dispose();
      registered2.dispose();
    });
    test("Contributed file with when clause is filtered inside PromptsService", async () => {
      const uri = URI.parse("file://extensions/my-extension/conditional.instructions.md");
      const extension = {};
      const contextKeyService = instaService.get(IContextKeyService);
      const contextMatchesRulesStub = sinon.stub(contextKeyService, "contextMatchesRules").returns(false);
      const registered = service.registerContributedFile(
        PromptsType.instructions,
        uri,
        extension,
        "Conditional Instructions",
        "Only when enabled",
        "myFeature.enabled"
      );
      const files = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      assert.strictEqual(files.length, 0, "Should be filtered out when the when clause does not match");
      registered.dispose();
      contextMatchesRulesStub.restore();
      const enabledContextMatchesRulesStub = sinon.stub(contextKeyService, "contextMatchesRules").returns(true);
      const enabledRegistration = service.registerContributedFile(
        PromptsType.instructions,
        uri,
        extension,
        "Conditional Instructions",
        "Only when enabled",
        "myFeature.enabled"
      );
      const enabledFiles = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      assert.strictEqual(enabledFiles.length, 1, "Should be included when the when clause matches");
      assert.strictEqual(enabledFiles[0].uri.toString(), uri.toString());
      enabledRegistration.dispose();
      enabledContextMatchesRulesStub.restore();
    });
    test("Provider file with when clause is filtered inside PromptsService", async () => {
      const uri = URI.parse("file://extensions/test/myInstruction.instructions.md");
      const extension = {
        identifier: { value: "test.my-extension" },
        enabledApiProposals: ["chatParticipantPrivate"]
      };
      const contextKeyService = instaService.get(IContextKeyService);
      const registered = service.registerPromptFileProvider(extension, PromptsType.instructions, {
        providePromptFiles: async () => [{ uri, when: "chatSessionType == local" }]
      });
      const contextMatchesRulesStub = sinon.stub(contextKeyService, "contextMatchesRules").returns(false);
      const files = await service.listPromptFilesForStorage(PromptsType.instructions, PromptsStorage.extension, CancellationToken.None);
      assert.strictEqual(files.length, 0, "Should be filtered out when the when clause does not match");
      contextMatchesRulesStub.restore();
      const enabledContextMatchesRulesStub = sinon.stub(contextKeyService, "contextMatchesRules").returns(true);
      const enabledFiles = await service.listPromptFilesForStorage(PromptsType.instructions, PromptsStorage.extension, CancellationToken.None);
      assert.strictEqual(enabledFiles.length, 1, "Should be included when the when clause matches");
      assert.strictEqual(enabledFiles[0].uri.toString(), uri.toString());
      enabledContextMatchesRulesStub.restore();
      registered.dispose();
    });
    test("Provider when keys invalidate cached results when context changes", async () => {
      const contextKeyService = disposables.add(new TestPromptContextKeyService());
      instaService.stub(IContextKeyService, contextKeyService);
      const promptsService = disposables.add(instaService.createInstance(PromptsService));
      instaService.stub(IPromptsService, promptsService);
      const uri = URI.parse("file://extensions/test/conditional.instructions.md");
      await mockFiles(fileService, [{
        path: uri.path,
        contents: [
          "---",
          'description: "Conditional Instructions"',
          "---",
          "Instruction body"
        ]
      }]);
      const extension = {
        identifier: { value: "test.my-extension" },
        enabledApiProposals: ["chatParticipantPrivate"]
      };
      const registered = promptsService.registerPromptFileProvider(extension, PromptsType.instructions, {
        providePromptFiles: async () => [{ uri, when: "myFeature.enabled" }]
      });
      contextKeyService.setRulesMatch(true);
      const enabledFiles = await promptsService.getInstructionFiles(CancellationToken.None);
      assert.strictEqual(enabledFiles.length, 1, "Should include the provider instruction when the context matches");
      contextKeyService.setRulesMatch(false);
      contextKeyService.fireDidChangeContext(["myFeature.enabled"]);
      const disabledFiles = await promptsService.getInstructionFiles(CancellationToken.None);
      assert.strictEqual(disabledFiles.length, 0, "Should invalidate the cached provider instruction when the tracked key changes");
      registered.dispose();
    });
    test("Contributed file sessionTypes metadata is preserved in core prompt models", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const agentUri = URI.parse("file://extensions/my-extension/contributed.agent.md");
      const instructionUri = URI.parse("file://extensions/my-extension/contributed.instructions.md");
      const promptUri = URI.parse("file://extensions/my-extension/contributed.prompt.md");
      const skillUri = URI.parse("file://extensions/my-extension/contributed-skill/SKILL.md");
      const extension = {
        identifier: { value: "test.my-extension" }
      };
      const sessionTypes = ["copilotcli"];
      await mockFiles(fileService, [
        {
          path: agentUri.path,
          contents: [
            "---",
            'name: "contributed-agent"',
            'description: "Contributed agent"',
            "---",
            "Agent body"
          ]
        },
        {
          path: instructionUri.path,
          contents: [
            "---",
            'name: "contributed-instruction"',
            'description: "Contributed instruction"',
            "---",
            "Instruction body"
          ]
        },
        {
          path: promptUri.path,
          contents: [
            "---",
            'name: "contributed-prompt"',
            'description: "Contributed prompt"',
            "---",
            "Prompt body"
          ]
        },
        {
          path: skillUri.path,
          contents: [
            "---",
            'name: "contributed-skill"',
            'description: "Contributed skill"',
            "---",
            "Skill body"
          ]
        }
      ]);
      const registrations = [
        service.registerContributedFile(PromptsType.agent, agentUri, extension, void 0, void 0, void 0, sessionTypes),
        service.registerContributedFile(PromptsType.instructions, instructionUri, extension, void 0, void 0, void 0, sessionTypes),
        service.registerContributedFile(PromptsType.prompt, promptUri, extension, void 0, void 0, void 0, sessionTypes),
        service.registerContributedFile(PromptsType.skill, skillUri, extension, void 0, void 0, void 0, sessionTypes)
      ];
      try {
        const agent = (await service.getCustomAgents(CancellationToken.None)).find((item) => item.uri.toString() === agentUri.toString());
        const instruction = (await service.getInstructionFiles(CancellationToken.None)).find((item) => item.uri.toString() === instructionUri.toString());
        const prompt = (await service.getPromptSlashCommands(CancellationToken.None)).find((item) => item.uri.toString() === promptUri.toString());
        const skill = (await service.findAgentSkills(CancellationToken.None))?.find((item) => item.uri.toString() === skillUri.toString());
        assert.deepStrictEqual(agent?.sessionTypes, sessionTypes);
        assert.deepStrictEqual(instruction?.sessionTypes, sessionTypes);
        assert.deepStrictEqual(prompt?.sessionTypes, sessionTypes);
        assert.deepStrictEqual(skill?.sessionTypes, sessionTypes);
      } finally {
        for (const registration of registrations) {
          registration.dispose();
        }
      }
    });
  });
  suite("listPromptFiles - parent repo folder", () => {
    test("should find prompts, instructions, and agents in a parent repo folder", async () => {
      const parentFolder = "/repos/collect-prompt-parent-test";
      const rootFolder = `${parentFolder}/repo`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        // .git in parent marks it as a repo root
        {
          path: `${parentFolder}/.git/HEAD`,
          contents: ["ref: refs/heads/main"]
        },
        // Applying instruction in parent
        {
          path: `${parentFolder}/.github/instructions/typescript.instructions.md`,
          contents: [
            "---",
            "description: 'Parent TypeScript instructions'",
            'applyTo: "**/*.ts"',
            "---",
            "Parent TypeScript coding standards"
          ]
        },
        // Prompt file in parent
        {
          path: `${parentFolder}/.github/prompts/help.prompt.md`,
          contents: [
            "---",
            "description: 'Parent help prompt'",
            "---",
            "Help the user with their question"
          ]
        },
        // Agent file in parent
        {
          path: `${parentFolder}/.github/agents/reviewer.agent.md`,
          contents: [
            "---",
            "description: 'Parent code reviewer agent'",
            "---",
            "You are a code reviewer"
          ]
        },
        {
          path: `${rootFolder}/src/file.ts`,
          contents: ['console.log("test");']
        }
      ]);
      await testConfigService.setUserConfiguration(PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS, true);
      await testConfigService.setUserConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS, false);
      let promptFiles = await service.listPromptFiles(PromptsType.prompt, CancellationToken.None);
      let agentFiles = await service.listPromptFiles(PromptsType.agent, CancellationToken.None);
      let instructionFiles = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      assert.ok(!promptFiles.some((f) => f.uri.path.includes(parentFolder)), "Should not find parent prompt files when parent search is disabled");
      assert.ok(!agentFiles.some((f) => f.uri.path.includes(parentFolder)), "Should not find parent agent files when parent search is disabled");
      assert.ok(!instructionFiles.some((f) => f.uri.path.includes(parentFolder)), "Should not find parent instruction files when parent search is disabled");
      testConfigService.setUserConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS, true);
      fireConfigChange(testConfigService, PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS);
      promptFiles = await service.listPromptFiles(PromptsType.prompt, CancellationToken.None);
      agentFiles = await service.listPromptFiles(PromptsType.agent, CancellationToken.None);
      instructionFiles = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      const promptPaths = promptFiles.map((f) => f.uri.path);
      const agentPaths = agentFiles.map((f) => f.uri.path);
      const instructionPaths = instructionFiles.map((f) => f.uri.path);
      assert.ok(promptPaths.includes(`${parentFolder}/.github/prompts/help.prompt.md`), "Should find parent prompt file when parent search is enabled");
      assert.ok(agentPaths.includes(`${parentFolder}/.github/agents/reviewer.agent.md`), "Should find parent agent file when parent search is enabled");
      assert.ok(instructionPaths.includes(`${parentFolder}/.github/instructions/typescript.instructions.md`), "Should find parent instruction file when parent search is enabled");
    });
    test("should not find files in an untrusted parent repo folder", async () => {
      const parentFolder = "/repos/untrusted-parent-test";
      const rootFolder = `${parentFolder}/repo`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        // .git in parent marks it as a repo root
        {
          path: `${parentFolder}/.git/HEAD`,
          contents: ["ref: refs/heads/main"]
        },
        // Applying instruction in parent
        {
          path: `${parentFolder}/.github/instructions/typescript.instructions.md`,
          contents: [
            "---",
            "description: 'Parent TypeScript instructions'",
            'applyTo: "**/*.ts"',
            "---",
            "Parent TypeScript coding standards"
          ]
        },
        // Prompt file in parent
        {
          path: `${parentFolder}/.github/prompts/help.prompt.md`,
          contents: [
            "---",
            "description: 'Parent help prompt'",
            "---",
            "Help the user with their question"
          ]
        },
        // Agent file in parent
        {
          path: `${parentFolder}/.github/agents/reviewer.agent.md`,
          contents: [
            "---",
            "description: 'Parent code reviewer agent'",
            "---",
            "You are a code reviewer"
          ]
        },
        {
          path: `${rootFolder}/src/file.ts`,
          contents: ['console.log("test");']
        }
      ]);
      testConfigService.setUserConfiguration(PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS, true);
      testConfigService.setUserConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS, true);
      fireConfigChange(testConfigService, PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS, PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS);
      workspaceTrustService.getUriTrustInfo = (uri) => {
        if (uri.path === parentFolder) {
          return Promise.resolve({ trusted: false, uri });
        }
        return Promise.resolve({ trusted: true, uri });
      };
      const promptFiles = await service.listPromptFiles(PromptsType.prompt, CancellationToken.None);
      const agentFiles = await service.listPromptFiles(PromptsType.agent, CancellationToken.None);
      const instructionFiles = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      assert.ok(!promptFiles.some((f) => f.uri.path.includes(parentFolder)), "Should not find parent prompt files when parent repo is untrusted");
      assert.ok(!agentFiles.some((f) => f.uri.path.includes(parentFolder)), "Should not find parent agent files when parent repo is untrusted");
      assert.ok(!instructionFiles.some((f) => f.uri.path.includes(parentFolder)), "Should not find parent instruction files when parent repo is untrusted");
    });
  });
  test("Instructions provider", async () => {
    const instructionUri = URI.parse("file://extensions/my-extension/myInstruction.instructions.md");
    const extension = {
      identifier: { value: "test.my-extension" },
      enabledApiProposals: ["chatParticipantPrivate"]
    };
    await mockFiles(fileService, [
      {
        path: instructionUri.path,
        contents: [
          "# Test instruction content"
        ]
      }
    ]);
    const provider = {
      providePromptFiles: async (_context, _token) => {
        return [
          {
            uri: instructionUri
          }
        ];
      }
    };
    const registered = service.registerPromptFileProvider(extension, PromptsType.instructions, provider);
    const actual = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
    const providerInstruction = actual.find((i) => i.uri.toString() === instructionUri.toString());
    assert.ok(providerInstruction, "Provider instruction should be found");
    assert.strictEqual(providerInstruction.uri.toString(), instructionUri.toString());
    assert.strictEqual(providerInstruction.storage, PromptsStorage.extension);
    assert.strictEqual(providerInstruction.source, PromptFileSource.ExtensionAPI);
    registered.dispose();
    const actualAfterDispose = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
    const foundAfterDispose = actualAfterDispose.find((i) => i.uri.toString() === instructionUri.toString());
    assert.strictEqual(foundAfterDispose, void 0);
  });
  test("Provider sessionTypes metadata is preserved in core prompt models", async () => {
    testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
    testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
    const agentUri = URI.parse("file://extensions/my-extension/enabled.agent.md");
    const instructionUri = URI.parse("file://extensions/my-extension/enabled.instructions.md");
    const promptUri = URI.parse("file://extensions/my-extension/enabled.prompt.md");
    const skillUri = URI.parse("file://extensions/my-extension/enabled-skill/SKILL.md");
    const extension = {
      identifier: { value: "test.my-extension" },
      enabledApiProposals: ["chatParticipantPrivate"]
    };
    const sessionTypes = ["copilotcli"];
    await mockFiles(fileService, [
      {
        path: agentUri.path,
        contents: [
          "---",
          'name: "enabled-agent"',
          'description: "An enabled agent"',
          "---",
          "Agent body"
        ]
      },
      {
        path: instructionUri.path,
        contents: [
          "---",
          'name: "enabled-instruction"',
          'description: "An enabled instruction"',
          "---",
          "Instruction body"
        ]
      },
      {
        path: promptUri.path,
        contents: [
          "---",
          'name: "enabled-prompt"',
          'description: "An enabled prompt"',
          "---",
          "Prompt body"
        ]
      },
      {
        path: skillUri.path,
        contents: [
          "---",
          'name: "enabled-skill"',
          'description: "An enabled skill"',
          "---",
          "Skill body"
        ]
      }
    ]);
    const registrations = [
      service.registerPromptFileProvider(extension, PromptsType.agent, {
        providePromptFiles: async () => [{ uri: agentUri, sessionTypes }]
      }),
      service.registerPromptFileProvider(extension, PromptsType.instructions, {
        providePromptFiles: async () => [{ uri: instructionUri, sessionTypes }]
      }),
      service.registerPromptFileProvider(extension, PromptsType.prompt, {
        providePromptFiles: async () => [{ uri: promptUri, sessionTypes }]
      }),
      service.registerPromptFileProvider(extension, PromptsType.skill, {
        providePromptFiles: async () => [{ uri: skillUri, sessionTypes }]
      })
    ];
    try {
      const agent = (await service.getCustomAgents(CancellationToken.None)).find((item) => item.uri.toString() === agentUri.toString());
      const instruction = (await service.getInstructionFiles(CancellationToken.None)).find((item) => item.uri.toString() === instructionUri.toString());
      const prompt = (await service.getPromptSlashCommands(CancellationToken.None)).find((item) => item.uri.toString() === promptUri.toString());
      const skill = (await service.findAgentSkills(CancellationToken.None))?.find((item) => item.uri.toString() === skillUri.toString());
      assert.deepStrictEqual(agent?.sessionTypes, sessionTypes);
      assert.deepStrictEqual(instruction?.sessionTypes, sessionTypes);
      assert.deepStrictEqual(prompt?.sessionTypes, sessionTypes);
      assert.deepStrictEqual(skill?.sessionTypes, sessionTypes);
    } finally {
      for (const registration of registrations) {
        registration.dispose();
      }
    }
  });
  test("Prompt file provider", async () => {
    const promptUri = URI.parse("file://extensions/my-extension/myPrompt.prompt.md");
    const extension = {
      identifier: { value: "test.my-extension" },
      enabledApiProposals: ["chatParticipantPrivate"]
    };
    await mockFiles(fileService, [
      {
        path: promptUri.path,
        contents: [
          "# Test prompt content"
        ]
      }
    ]);
    const provider = {
      providePromptFiles: async (_context, _token) => {
        return [
          {
            uri: promptUri
          }
        ];
      }
    };
    const registered = service.registerPromptFileProvider(extension, PromptsType.prompt, provider);
    const actual = await service.listPromptFiles(PromptsType.prompt, CancellationToken.None);
    const providerPrompt = actual.find((i) => i.uri.toString() === promptUri.toString());
    assert.ok(providerPrompt, "Provider prompt should be found");
    assert.strictEqual(providerPrompt.uri.toString(), promptUri.toString());
    assert.strictEqual(providerPrompt.storage, PromptsStorage.extension);
    assert.strictEqual(providerPrompt.source, PromptFileSource.ExtensionAPI);
    registered.dispose();
    const actualAfterDispose = await service.listPromptFiles(PromptsType.prompt, CancellationToken.None);
    const foundAfterDispose = actualAfterDispose.find((i) => i.uri.toString() === promptUri.toString());
    assert.strictEqual(foundAfterDispose, void 0);
  });
  test("Skill file provider", async () => {
    const skillUri = URI.parse("file://extensions/my-extension/mySkill/SKILL.md");
    const extension = {
      identifier: { value: "test.my-extension" },
      enabledApiProposals: ["chatParticipantPrivate"]
    };
    await mockFiles(fileService, [
      {
        path: skillUri.path,
        contents: [
          "---",
          'name: "My Custom Skill"',
          'description: "A custom skill from provider"',
          "---",
          "Custom skill content."
        ]
      }
    ]);
    const provider = {
      providePromptFiles: async (_context, _token) => {
        return [
          {
            uri: skillUri
          }
        ];
      }
    };
    const registered = service.registerPromptFileProvider(extension, PromptsType.skill, provider);
    const actual = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
    const providerSkill = actual.find((i) => i.uri.toString() === skillUri.toString());
    assert.ok(providerSkill, "Provider skill should be found");
    assert.strictEqual(providerSkill.uri.toString(), skillUri.toString());
    assert.strictEqual(providerSkill.storage, PromptsStorage.extension);
    assert.strictEqual(providerSkill.source, PromptFileSource.ExtensionAPI);
    registered.dispose();
    const actualAfterDispose = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
    const foundAfterDispose = actualAfterDispose.find((i) => i.uri.toString() === skillUri.toString());
    assert.strictEqual(foundAfterDispose, void 0);
  });
  suite("findAgentSkills", () => {
    teardown(() => {
      sinon.restore();
    });
    test("should return undefined when USE_AGENT_SKILLS is disabled", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, false);
      const result = await service.findAgentSkills(CancellationToken.None);
      assert.strictEqual(result, void 0);
    });
    test("should find skills in workspace and user home", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "agent-skills-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/GitHub Skill 1/SKILL.md`,
          contents: [
            "---",
            'name: "GitHub Skill 1"',
            'description: "A GitHub skill for testing"',
            "---",
            "This is GitHub skill 1 content"
          ]
        },
        {
          path: `${rootFolder}/.claude/skills/Claude Skill 1/SKILL.md`,
          contents: [
            "---",
            'name: "Claude Skill 1"',
            'description: "A Claude skill for testing"',
            "---",
            "This is Claude skill 1 content"
          ]
        },
        {
          path: `${rootFolder}/.claude/skills/invalid-skill/SKILL.md`,
          contents: [
            "---",
            'description: "Invalid skill, no name"',
            "---",
            "This is invalid skill content"
          ]
        },
        {
          path: `${rootFolder}/.github/skills/not-a-skill-dir/README.md`,
          contents: ["This is not a skill"]
        },
        {
          path: "/home/user/.claude/skills/Personal Skill 1/SKILL.md",
          contents: [
            "---",
            'name: "Personal Skill 1"',
            'description: "A personal skill for testing"',
            "---",
            "This is personal skill 1 content"
          ]
        },
        {
          path: "/home/user/.claude/skills/not-a-skill/other-file.md",
          contents: ["Not a skill file"]
        },
        {
          path: "/home/user/.copilot/skills/Copilot Skill 1/SKILL.md",
          contents: [
            "---",
            'name: "Copilot Skill 1"',
            'description: "A Copilot skill for testing"',
            "---",
            "This is Copilot skill 1 content"
          ]
        }
      ]);
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results when agent skills are enabled");
      const result = allResult;
      assert.strictEqual(result.length, 5, "Should find 5 skills total");
      const projectSkills = result.filter((skill) => skill.storage === PromptsStorage.local);
      assert.strictEqual(projectSkills.length, 3, "Should find 3 project skills");
      const githubSkill1 = projectSkills.find((skill) => skill.name === "GitHub Skill 1");
      assert.ok(githubSkill1, "Should find GitHub skill 1");
      assert.strictEqual(githubSkill1.description, "A GitHub skill for testing");
      assert.strictEqual(githubSkill1.uri.path, `${rootFolder}/.github/skills/GitHub Skill 1/SKILL.md`);
      const claudeSkill1 = projectSkills.find((skill) => skill.name === "Claude Skill 1");
      assert.ok(claudeSkill1, "Should find Claude skill 1");
      assert.strictEqual(claudeSkill1.description, "A Claude skill for testing");
      assert.strictEqual(claudeSkill1.uri.path, `${rootFolder}/.claude/skills/Claude Skill 1/SKILL.md`);
      const invalidSkill = projectSkills.find((skill) => skill.name === "invalid-skill");
      assert.ok(invalidSkill, "Should find invalid-skill using folder name as fallback");
      assert.strictEqual(invalidSkill.description, "Invalid skill, no name");
      assert.strictEqual(invalidSkill.uri.path, `${rootFolder}/.claude/skills/invalid-skill/SKILL.md`);
      const personalSkills = result.filter((skill) => skill.storage === PromptsStorage.user);
      assert.strictEqual(personalSkills.length, 2, "Should find 2 personal skills");
      const personalSkill1 = personalSkills.find((skill) => skill.name === "Personal Skill 1");
      assert.ok(personalSkill1, "Should find Personal Skill 1");
      assert.strictEqual(personalSkill1.description, "A personal skill for testing");
      assert.strictEqual(personalSkill1.uri.path, "/home/user/.claude/skills/Personal Skill 1/SKILL.md");
      const copilotSkill1 = personalSkills.find((skill) => skill.name === "Copilot Skill 1");
      assert.ok(copilotSkill1, "Should find Copilot Skill 1");
      assert.strictEqual(copilotSkill1.description, "A Copilot skill for testing");
      assert.strictEqual(copilotSkill1.uri.path, "/home/user/.copilot/skills/Copilot Skill 1/SKILL.md");
    });
    test("should handle parsing errors gracefully", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "skills-error-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/Valid Skill/SKILL.md`,
          contents: [
            "---",
            'name: "Valid Skill"',
            'description: "A valid skill"',
            "---",
            "Valid skill content"
          ]
        },
        {
          path: `${rootFolder}/.claude/skills/invalid-skill/SKILL.md`,
          contents: [
            "---",
            "invalid yaml: [unclosed",
            "---",
            "Invalid skill content"
          ]
        }
      ]);
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results even with parsing errors");
      const result = allResult;
      assert.strictEqual(result.length, 2, "Should find 2 skills");
      const validSkill = result.find((s) => s.name === "Valid Skill");
      assert.ok(validSkill, "Should find the valid skill");
      assert.strictEqual(validSkill.storage, PromptsStorage.local);
      const invalidSkill = result.find((s) => s.name === "invalid-skill");
      assert.ok(invalidSkill, "Should find skill with folder name as fallback despite malformed YAML");
      assert.strictEqual(invalidSkill.storage, PromptsStorage.local);
    });
    test("should return empty array when no skills found", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      const rootFolderName = "empty-workspace";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, []);
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results array");
      const result = allResult;
      assert.strictEqual(result.length, 0, "Should find no skills");
    });
    test("should truncate long names and descriptions", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "truncation-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const longName = "A".repeat(100);
      const truncatedName = "A".repeat(64);
      const longDescription = "B".repeat(1500);
      await mockFiles(fileService, [
        {
          // Folder name must match the truncated skill name
          path: `${rootFolder}/.github/skills/${truncatedName}/SKILL.md`,
          contents: [
            "---",
            `name: "${longName}"`,
            `description: "${longDescription}"`,
            "---",
            "Skill content"
          ]
        }
      ]);
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results");
      const result = allResult;
      assert.strictEqual(result.length, 1, "Should find 1 skill");
      assert.strictEqual(result[0].name.length, 64, "Name should be truncated to 64 characters");
      assert.strictEqual(result[0].description?.length, 1024, "Description should be truncated to 1024 characters");
    });
    test("should remove XML tags from name and description", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "xml-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/Skill with XML tags/SKILL.md`,
          contents: [
            "---",
            'name: "Skill <b>with</b> <em>XML</em> tags"',
            'description: "Description with <strong>HTML</strong> and <span>other</span> tags"',
            "---",
            "Skill content"
          ]
        }
      ]);
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results");
      const result = allResult;
      assert.strictEqual(result.length, 1, "Should find 1 skill");
      assert.strictEqual(result[0].name, "Skill with XML tags", "XML tags should be removed from name");
      assert.strictEqual(result[0].description, "Description with HTML and other tags", "XML tags should be removed from description");
    });
    test("should handle both truncation and XML removal", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "combined-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const longNameWithXml = "<p>" + "A".repeat(100) + "</p>";
      const truncatedName = "A".repeat(64);
      const longDescWithXml = "<div>" + "B".repeat(1500) + "</div>";
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/${truncatedName}/SKILL.md`,
          contents: [
            "---",
            `name: "${longNameWithXml}"`,
            `description: "${longDescWithXml}"`,
            "---",
            "Skill content"
          ]
        }
      ]);
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results");
      const result = allResult;
      assert.strictEqual(result.length, 1, "Should find 1 skill");
      assert.ok(!result[0].name.includes("<"), "Name should not contain XML tags");
      assert.ok(!result[0].name.includes(">"), "Name should not contain XML tags");
      assert.strictEqual(result[0].name.length, 64, "Name should be truncated to 64 characters");
      assert.ok(!result[0].description?.includes("<"), "Description should not contain XML tags");
      assert.ok(!result[0].description?.includes(">"), "Description should not contain XML tags");
      assert.strictEqual(result[0].description?.length, 1024, "Description should be truncated to 1024 characters");
    });
    test("should skip duplicate skill names and keep first by priority", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "duplicate-skills-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/Duplicate Skill/SKILL.md`,
          contents: [
            "---",
            'name: "Duplicate Skill"',
            'description: "Workspace version"',
            "---",
            "Workspace skill content"
          ]
        },
        {
          path: "/home/user/.copilot/skills/Duplicate Skill/SKILL.md",
          contents: [
            "---",
            'name: "Duplicate Skill"',
            'description: "User version - should be skipped"',
            "---",
            "User skill content"
          ]
        },
        {
          path: `${rootFolder}/.claude/skills/Unique Skill/SKILL.md`,
          contents: [
            "---",
            'name: "Unique Skill"',
            'description: "A unique skill"',
            "---",
            "Unique skill content"
          ]
        }
      ]);
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results");
      const result = allResult;
      assert.strictEqual(result.length, 2, "Should find 2 skills (duplicate skipped)");
      const duplicateSkill = result.find((s) => s.name === "Duplicate Skill");
      assert.ok(duplicateSkill, "Should find the duplicate skill");
      assert.strictEqual(duplicateSkill.description, "Workspace version", "Should keep workspace version (higher priority)");
      assert.strictEqual(duplicateSkill.storage, PromptsStorage.local, "Should be from workspace");
      const uniqueSkill = result.find((s) => s.name === "Unique Skill");
      assert.ok(uniqueSkill, "Should find the unique skill");
    });
    test("should prioritize skills by source: workspace > user > extension", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "priority-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: "/home/user/.copilot/skills/Priority Skill/SKILL.md",
          contents: [
            "---",
            'name: "Priority Skill"',
            'description: "User version"',
            "---",
            "User skill content"
          ]
        },
        {
          path: `${rootFolder}/.github/skills/Priority Skill/SKILL.md`,
          contents: [
            "---",
            'name: "Priority Skill"',
            'description: "Workspace version - highest priority"',
            "---",
            "Workspace skill content"
          ]
        }
      ]);
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results");
      const result = allResult;
      assert.strictEqual(result.length, 1, "Should find 1 skill (duplicates resolved by priority)");
      assert.strictEqual(result[0].description, "Workspace version - highest priority", "Workspace should win over user");
      assert.strictEqual(result[0].storage, PromptsStorage.local);
    });
    test("should include skills where name does not match folder name using folder name as fallback", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "name-mismatch-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          // Folder name "wrong-folder-name" doesn't match skill name "Correct Skill Name"
          path: `${rootFolder}/.github/skills/wrong-folder-name/SKILL.md`,
          contents: [
            "---",
            'name: "Correct Skill Name"',
            'description: "This skill should use folder name as fallback"',
            "---",
            "Skill content"
          ]
        },
        {
          // Folder name matches skill name
          path: `${rootFolder}/.github/skills/Valid Skill/SKILL.md`,
          contents: [
            "---",
            'name: "Valid Skill"',
            'description: "This skill should be found"',
            "---",
            "Valid skill content"
          ]
        }
      ]);
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results");
      const result = allResult;
      assert.strictEqual(result.length, 2, "Should find both skills");
      const mismatchedSkill = result.find((s) => s.name === "wrong-folder-name");
      assert.ok(mismatchedSkill, "Should find skill with folder name as fallback");
      assert.strictEqual(mismatchedSkill.description, "This skill should use folder name as fallback");
      const validSkill = result.find((s) => s.name === "Valid Skill");
      assert.ok(validSkill, "Should find the valid skill");
    });
    test("should include skills with missing name attribute using folder name as fallback", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "missing-name-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/no-name-skill/SKILL.md`,
          contents: [
            "---",
            'description: "This skill has no name attribute"',
            "---",
            "Skill content without name"
          ]
        },
        {
          path: `${rootFolder}/.github/skills/Valid Named Skill/SKILL.md`,
          contents: [
            "---",
            'name: "Valid Named Skill"',
            'description: "This skill has a name"',
            "---",
            "Valid skill content"
          ]
        }
      ]);
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results");
      const result = allResult;
      assert.strictEqual(result.length, 2, "Should find both skills");
      const noNameSkill = result.find((s) => s.name === "no-name-skill");
      assert.ok(noNameSkill, "Should find skill with folder name as fallback");
      assert.strictEqual(noNameSkill.description, "This skill has no name attribute");
      const validSkill = result.find((s) => s.name === "Valid Named Skill");
      assert.ok(validSkill, "Should find skill with name attribute");
    });
    test("should include extension-provided skills in findAgentSkills", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "extension-skills-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const extensionSkillUri = URI.parse("file://extensions/my-extension/Extension Skill/SKILL.md");
      const extension = {
        identifier: { value: "test.my-extension" },
        enabledApiProposals: ["chatParticipantPrivate"]
      };
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/Workspace Skill/SKILL.md`,
          contents: [
            "---",
            'name: "Workspace Skill"',
            'description: "A workspace skill"',
            "---",
            "Workspace skill content"
          ]
        },
        {
          path: extensionSkillUri.path,
          contents: [
            "---",
            'name: "Extension Skill"',
            'description: "A skill from extension provider"',
            "---",
            "Extension skill content"
          ]
        }
      ]);
      const provider = {
        providePromptFiles: async (_context, _token) => {
          return [{ uri: extensionSkillUri }];
        }
      };
      const registered = service.registerPromptFileProvider(extension, PromptsType.skill, provider);
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results");
      const result = allResult;
      assert.strictEqual(result.length, 2, "Should find 2 skills (workspace + extension)");
      const workspaceSkill = result.find((s) => s.name === "Workspace Skill");
      assert.ok(workspaceSkill, "Should find workspace skill");
      assert.strictEqual(workspaceSkill.storage, PromptsStorage.local);
      const extensionSkill = result.find((s) => s.name === "Extension Skill");
      assert.ok(extensionSkill, "Should find extension skill");
      assert.strictEqual(extensionSkill.storage, PromptsStorage.extension);
      registered.dispose();
    });
    test("should include contributed skill files in findAgentSkills", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "contributed-skills-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const contributedSkillUri = URI.parse("file://extensions/my-extension/Contributed Skill/SKILL.md");
      const extension = {
        identifier: { value: "test.my-extension" }
      };
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/Local Skill/SKILL.md`,
          contents: [
            "---",
            'name: "Local Skill"',
            'description: "A local skill"',
            "---",
            "Local skill content"
          ]
        },
        {
          path: contributedSkillUri.path,
          contents: [
            "---",
            'name: "Contributed Skill"',
            'description: "A contributed skill from extension"',
            "---",
            "Contributed skill content"
          ]
        }
      ]);
      const registered = service.registerContributedFile(
        PromptsType.skill,
        contributedSkillUri,
        extension,
        "Contributed Skill",
        "A contributed skill from extension"
      );
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results");
      const result = allResult;
      assert.strictEqual(result.length, 2, "Should find 2 skills (local + contributed)");
      const localSkill = result.find((s) => s.name === "Local Skill");
      assert.ok(localSkill, "Should find local skill");
      assert.strictEqual(localSkill.storage, PromptsStorage.local);
      const contributedSkill = result.find((s) => s.name === "Contributed Skill");
      assert.ok(contributedSkill, "Should find contributed skill");
      assert.strictEqual(contributedSkill.storage, PromptsStorage.extension);
      registered.dispose();
      const resultAfterDispose = await service.findAgentSkills(CancellationToken.None);
      assert.strictEqual(resultAfterDispose?.length, 1, "Should find 1 skill after disposal");
      assert.strictEqual(resultAfterDispose?.[0].name, "Local Skill");
    });
    test("should use folder name for contributed skill with missing name", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "contributed-no-name-test";
      const rootFolder = `/${rootFolderName}`;
      workspaceContextService.setWorkspace(testWorkspace(URI.file(rootFolder)));
      const contributedSkillUri = URI.parse("file://extensions/my-extension/my-skill/SKILL.md");
      const extension = { identifier: { value: "test.my-extension" } };
      await mockFiles(fileService, [
        {
          path: contributedSkillUri.path,
          contents: [
            "---",
            'description: "A skill without a name"',
            "---",
            "Skill content"
          ]
        }
      ]);
      const registered = service.registerContributedFile(PromptsType.skill, contributedSkillUri, extension, void 0, void 0);
      const result = await service.findAgentSkills(CancellationToken.None);
      assert.ok(result, "Should return results");
      const skill = result.find((s) => s.name === "my-skill");
      assert.ok(skill, "Should find skill using folder name as fallback");
      assert.strictEqual(skill.description, "A skill without a name");
      registered.dispose();
    });
    test("should accept contributed skill with missing description", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "contributed-no-desc-test";
      const rootFolder = `/${rootFolderName}`;
      workspaceContextService.setWorkspace(testWorkspace(URI.file(rootFolder)));
      const contributedSkillUri = URI.parse("file://extensions/my-extension/no-desc-skill/SKILL.md");
      const extension = { identifier: { value: "test.my-extension" } };
      await mockFiles(fileService, [
        {
          path: contributedSkillUri.path,
          contents: [
            "---",
            'name: "no-desc-skill"',
            "---",
            "Skill content without description"
          ]
        }
      ]);
      const registered = service.registerContributedFile(PromptsType.skill, contributedSkillUri, extension, void 0, void 0);
      const result = await service.findAgentSkills(CancellationToken.None);
      assert.ok(result, "Should return results");
      const skill = result.find((s) => s.name === "no-desc-skill");
      assert.ok(skill, "Should find skill even without description");
      assert.strictEqual(skill.description, void 0);
      registered.dispose();
    });
    test("should override contributed skill name with folder name on mismatch", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "contributed-mismatch-test";
      const rootFolder = `/${rootFolderName}`;
      workspaceContextService.setWorkspace(testWorkspace(URI.file(rootFolder)));
      const contributedSkillUri = URI.parse("file://extensions/my-extension/actual-folder/SKILL.md");
      const extension = { identifier: { value: "test.my-extension" } };
      await mockFiles(fileService, [
        {
          path: contributedSkillUri.path,
          contents: [
            "---",
            'name: "wrong-name"',
            'description: "A skill with mismatched name"',
            "---",
            "Skill content"
          ]
        }
      ]);
      const registered = service.registerContributedFile(PromptsType.skill, contributedSkillUri, extension, void 0, void 0);
      const result = await service.findAgentSkills(CancellationToken.None);
      assert.ok(result, "Should return results");
      const skill = result.find((s) => s.name === "actual-folder");
      assert.ok(skill, "Should find skill using folder name instead of mismatched name");
      assert.strictEqual(skill.description, "A skill with mismatched name");
      registered.dispose();
    });
  });
  suite("getPromptSlashCommands - prompt discovery", () => {
    teardown(() => {
      sinon.restore();
    });
    test("CancellationError from parseNew is skipped without logging", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, false);
      const promptUri = URI.parse("file://extensions/my-extension/cancelled.prompt.md");
      const logErrorSpy = sinon.spy(logService, "error");
      sinon.stub(service, "listPromptFiles").callsFake(async (type) => {
        return type === PromptsType.prompt ? [{ uri: promptUri, storage: PromptsStorage.local, type: PromptsType.prompt }] : [];
      });
      sinon.stub(service, "parseNew").rejects(new CancellationError());
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const discoveryInfo = await service.getDiscoveryInfo(PromptsType.prompt, CancellationToken.None);
      assert.deepStrictEqual(slashCommands, []);
      assert.strictEqual(logErrorSpy.called, false);
      assert.strictEqual(discoveryInfo.files.length, 1);
      assert.strictEqual(discoveryInfo.files[0].status, "skipped");
      assert.strictEqual(discoveryInfo.files[0].skipReason, "parse-error");
    });
  });
  suite("getPromptSlashCommands - skills", () => {
    teardown(() => {
      sinon.restore();
    });
    test("should include skills from workspace as slash commands", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "slash-commands-workspace-skills";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/workspace-skill/SKILL.md`,
          contents: [
            "---",
            'name: "workspace-skill"',
            'description: "A workspace skill that should appear as slash command"',
            "---",
            "Workspace skill content"
          ]
        },
        {
          path: `${rootFolder}/.claude/skills/another-skill/SKILL.md`,
          contents: [
            "---",
            'name: "another-skill"',
            'description: "Another skill from workspace"',
            "---",
            "Another skill content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const workspaceSkillCommand = slashCommands.find((cmd) => cmd.name === "workspace-skill");
      assert.ok(workspaceSkillCommand, "Should find workspace skill as slash command");
      assert.strictEqual(workspaceSkillCommand.description, "A workspace skill that should appear as slash command");
      assert.strictEqual(workspaceSkillCommand.storage, PromptsStorage.local);
      assert.strictEqual(workspaceSkillCommand.type, PromptsType.skill);
      const anotherSkillCommand = slashCommands.find((cmd) => cmd.name === "another-skill");
      assert.ok(anotherSkillCommand, "Should find another skill as slash command");
      assert.strictEqual(anotherSkillCommand.description, "Another skill from workspace");
      assert.strictEqual(anotherSkillCommand.storage, PromptsStorage.local);
    });
    test("should deduplicate skills with the same name from symlinked locations", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "slash-commands-symlinked-skills";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: "/home/user/.agents/skills/deploy/SKILL.md",
          contents: [
            "---",
            'name: "deploy"',
            'description: "Deploy skill"',
            "---",
            "Deploy skill content"
          ]
        },
        {
          path: "/home/user/.claude/skills/deploy/SKILL.md",
          contents: [
            "---",
            'name: "deploy"',
            'description: "Deploy skill"',
            "---",
            "Deploy skill content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const deployCommands = slashCommands.filter((cmd) => cmd.name === "deploy");
      assert.strictEqual(deployCommands.length, 1, "Duplicated skill should appear only once as a slash command");
    });
    test("should include skills from user storage as slash commands", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "slash-commands-user-skills";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: "/home/user/.copilot/skills/personal-skill/SKILL.md",
          contents: [
            "---",
            'name: "personal-skill"',
            'description: "A personal skill from user storage"',
            "---",
            "Personal skill content"
          ]
        },
        {
          path: "/home/user/.claude/skills/claude-personal/SKILL.md",
          contents: [
            "---",
            'name: "claude-personal"',
            'description: "A Claude personal skill"',
            "---",
            "Claude personal skill content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const personalSkillCommand = slashCommands.find((cmd) => cmd.name === "personal-skill");
      assert.ok(personalSkillCommand, "Should find personal skill as slash command");
      assert.strictEqual(personalSkillCommand.description, "A personal skill from user storage");
      assert.strictEqual(personalSkillCommand.storage, PromptsStorage.user);
      assert.strictEqual(personalSkillCommand.type, PromptsType.skill);
      const claudePersonalCommand = slashCommands.find((cmd) => cmd.name === "claude-personal");
      assert.ok(claudePersonalCommand, "Should find Claude personal skill as slash command");
      assert.strictEqual(claudePersonalCommand.description, "A Claude personal skill");
      assert.strictEqual(claudePersonalCommand.storage, PromptsStorage.user);
    });
    test("should include skills from extension providers as slash commands", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "slash-commands-provider-skills";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const providerSkillUri = URI.parse("file://extensions/my-extension/provider-skill/SKILL.md");
      const extension = {
        identifier: { value: "test.my-extension" },
        enabledApiProposals: ["chatParticipantPrivate"]
      };
      await mockFiles(fileService, [
        {
          path: providerSkillUri.path,
          contents: [
            "---",
            'name: "provider-skill"',
            'description: "A skill from extension provider"',
            "---",
            "Provider skill content"
          ]
        }
      ]);
      const provider = {
        providePromptFiles: async (_context, _token) => {
          return [{ uri: providerSkillUri }];
        }
      };
      const registered = service.registerPromptFileProvider(extension, PromptsType.skill, provider);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const providerSkillCommand = slashCommands.find((cmd) => cmd.name === "provider-skill");
      assert.ok(providerSkillCommand, "Should find provider skill as slash command");
      assert.strictEqual(providerSkillCommand.description, "A skill from extension provider");
      assert.strictEqual(providerSkillCommand.storage, PromptsStorage.extension);
      assert.strictEqual(providerSkillCommand.type, PromptsType.skill);
      assert.strictEqual(providerSkillCommand.source, PromptFileSource.ExtensionAPI);
      registered.dispose();
      const slashCommandsAfterDispose = await service.getPromptSlashCommands(CancellationToken.None);
      const foundAfterDispose = slashCommandsAfterDispose.find((cmd) => cmd.name === "provider-skill");
      assert.strictEqual(foundAfterDispose, void 0, "Should not find provider skill after disposal");
    });
    test("should include skills from extension contributions as slash commands", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "slash-commands-contributed-skills";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const contributedSkillUri = URI.parse("file://extensions/my-extension/contributed-skill/SKILL.md");
      const extension = {
        identifier: { value: "test.my-extension" }
      };
      await mockFiles(fileService, [
        {
          path: contributedSkillUri.path,
          contents: [
            "---",
            'name: "contributed-skill"',
            'description: "A skill from extension contribution"',
            "---",
            "Contributed skill content"
          ]
        }
      ]);
      const registered = service.registerContributedFile(
        PromptsType.skill,
        contributedSkillUri,
        extension,
        "contributed-skill",
        "A skill from extension contribution"
      );
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const contributedSkillCommand = slashCommands.find((cmd) => cmd.name === "contributed-skill");
      assert.ok(contributedSkillCommand, "Should find contributed skill as slash command");
      assert.strictEqual(contributedSkillCommand.description, "A skill from extension contribution");
      assert.strictEqual(contributedSkillCommand.storage, PromptsStorage.extension);
      assert.strictEqual(contributedSkillCommand.type, PromptsType.skill);
      assert.strictEqual(contributedSkillCommand.source, PromptFileSource.ExtensionContribution);
      registered.dispose();
      const slashCommandsAfterDispose = await service.getPromptSlashCommands(CancellationToken.None);
      const foundAfterDispose = slashCommandsAfterDispose.find((cmd) => cmd.name === "contributed-skill");
      assert.strictEqual(foundAfterDispose, void 0, "Should not find contributed skill after disposal");
    });
    test("should combine prompt files and skills as slash commands", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "slash-commands-combined";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/prompts/my-prompt.prompt.md`,
          contents: [
            "---",
            'name: "my-prompt"',
            'description: "A regular prompt file"',
            "---",
            "Prompt content"
          ]
        },
        {
          path: `${rootFolder}/.github/skills/my-skill/SKILL.md`,
          contents: [
            "---",
            'name: "my-skill"',
            'description: "A skill file"',
            "---",
            "Skill content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const promptCommand = slashCommands.find((cmd) => cmd.name === "my-prompt");
      assert.ok(promptCommand, "Should find prompt file as slash command");
      assert.strictEqual(promptCommand.type, PromptsType.prompt);
      const skillCommand = slashCommands.find((cmd) => cmd.name === "my-skill");
      assert.ok(skillCommand, "Should find skill file as slash command");
      assert.strictEqual(skillCommand.type, PromptsType.skill);
    });
    test("should fire change event when provider registers/unregisters", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "slash-commands-cache-invalidation";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const providerSkillUri = URI.parse("file://extensions/my-extension/test-skill/SKILL.md");
      const extension = {
        identifier: { value: "test.my-extension" },
        enabledApiProposals: ["chatParticipantPrivate"]
      };
      await mockFiles(fileService, [
        {
          path: providerSkillUri.path,
          contents: [
            "---",
            'name: "test-skill"',
            'description: "Test skill"',
            "---",
            "Test skill content"
          ]
        }
      ]);
      let changeEventCount = 0;
      const disposable = service.onDidChangeSlashCommands(() => {
        changeEventCount++;
      });
      const provider = {
        providePromptFiles: async (_context, _token) => {
          return [{ uri: providerSkillUri }];
        }
      };
      const registered = service.registerPromptFileProvider(extension, PromptsType.skill, provider);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const commandsWithProvider = await service.getPromptSlashCommands(CancellationToken.None);
      const skillCommand = commandsWithProvider.find((cmd) => cmd.name === "test-skill");
      assert.ok(skillCommand, "Should find skill from provider");
      registered.dispose();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const commandsAfterDispose = await service.getPromptSlashCommands(CancellationToken.None);
      const skillAfterDispose = commandsAfterDispose.find((cmd) => cmd.name === "test-skill");
      assert.strictEqual(skillAfterDispose, void 0, "Should not find skill after provider disposal");
      assert.ok(changeEventCount >= 2, "Change event should fire when provider registers and unregisters");
      disposable.dispose();
    });
    test("should use filename as fallback for skills with missing name", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "slash-commands-fallback-name";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/no-name/SKILL.md`,
          contents: [
            "---",
            'description: "Skill without name"',
            "---",
            "Skill content"
          ]
        },
        {
          path: `${rootFolder}/.github/skills/valid-skill/SKILL.md`,
          contents: [
            "---",
            'name: "valid-skill"',
            'description: "A valid skill"',
            "---",
            "Valid skill content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const fallbackNameCommand = slashCommands.find((cmd) => cmd.name === "no-name");
      assert.ok(fallbackNameCommand, "Should find skill with fallback name from folder name");
      assert.strictEqual(fallbackNameCommand.description, "Skill without name");
      const validSkillCommand = slashCommands.find((cmd) => cmd.name === "valid-skill");
      assert.ok(validSkillCommand, "Should find valid skill");
    });
    test("should use folder name as slash command name when frontmatter name differs", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "slash-commands-folder-name-override";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/test/SKILL.md`,
          contents: [
            "---",
            'name: "foo"',
            'description: "A skill with mismatched frontmatter name"',
            "---",
            "say hiya!"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const folderNameCommand = slashCommands.find((cmd) => cmd.name === "test");
      assert.ok(folderNameCommand, "Should find skill using folder name as slash command name");
      assert.strictEqual(folderNameCommand.description, "A skill with mismatched frontmatter name");
      const frontmatterNameCommand = slashCommands.find((cmd) => cmd.name === "foo");
      assert.strictEqual(frontmatterNameCommand, void 0, "Should not find skill using frontmatter name");
    });
    test("should not duplicate slash commands with same name from different types", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "slash-commands-no-duplicates";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/prompts/duplicate-name.prompt.md`,
          contents: [
            "---",
            'name: "duplicate-name"',
            'description: "A prompt file"',
            "---",
            "Prompt content"
          ]
        },
        {
          path: `${rootFolder}/.github/skills/duplicate-name/SKILL.md`,
          contents: [
            "---",
            'name: "duplicate-name"',
            'description: "A skill file"',
            "---",
            "Skill content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const duplicateCommands = slashCommands.filter((cmd) => cmd.name === "duplicate-name");
      assert.strictEqual(duplicateCommands.length, 2, "Should return both prompt and skill with same name");
      const promptCommand = duplicateCommands.find((cmd) => cmd.type === PromptsType.prompt);
      assert.ok(promptCommand, "Should find prompt command");
      const skillCommand = duplicateCommands.find((cmd) => cmd.type === PromptsType.skill);
      assert.ok(skillCommand, "Should find skill command");
    });
    test("should respect skill disable configuration (USE_AGENT_SKILLS)", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, false);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "slash-commands-skills-disabled";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/prompts/my-prompt.prompt.md`,
          contents: [
            "---",
            'name: "my-prompt"',
            'description: "A prompt"',
            "---",
            "Prompt content"
          ]
        },
        {
          path: `${rootFolder}/.github/skills/my-skill/SKILL.md`,
          contents: [
            "---",
            'name: "my-skill"',
            'description: "A skill"',
            "---",
            "Skill content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const promptCommand = slashCommands.find((cmd) => cmd.name === "my-prompt");
      assert.ok(promptCommand, "Should find prompt command even when skills are disabled");
      const skillCommand = slashCommands.find((cmd) => cmd.name === "my-skill");
      assert.strictEqual(skillCommand, void 0, "Should not find skill command when skills are disabled");
    });
  });
  suite("getPromptSlashCommands - userInvocable filtering", () => {
    teardown(() => {
      sinon.restore();
    });
    test("should return correct userInvocable value for skills with user-invocable: false", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "user-invocable-false";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/hidden-skill/SKILL.md`,
          contents: [
            "---",
            'name: "hidden-skill"',
            'description: "A skill hidden from the / menu"',
            "user-invocable: false",
            "---",
            "Hidden skill content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const hiddenSkillCommand = slashCommands.find((cmd) => cmd.name === "hidden-skill");
      assert.ok(hiddenSkillCommand, "Should find hidden skill in slash commands");
      assert.strictEqual(
        hiddenSkillCommand.userInvocable,
        false,
        "Should have userInvocable=false in parsed header"
      );
      const filteredCommands = slashCommands.filter((c) => c.userInvocable);
      const hiddenSkillInFiltered = filteredCommands.find((cmd) => cmd.name === "hidden-skill");
      assert.strictEqual(
        hiddenSkillInFiltered,
        void 0,
        "Hidden skill should be filtered out when applying userInvocable filter"
      );
    });
    test("should return correct userInvocable value for skills with user-invocable: true", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "user-invocable-true";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/visible-skill/SKILL.md`,
          contents: [
            "---",
            'name: "visible-skill"',
            'description: "A skill visible in the / menu"',
            "user-invocable: true",
            "---",
            "Visible skill content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const visibleSkillCommand = slashCommands.find((cmd) => cmd.name === "visible-skill");
      assert.ok(visibleSkillCommand, "Should find visible skill in slash commands");
      assert.strictEqual(
        visibleSkillCommand.userInvocable,
        true,
        "Should have userInvocable=true in parsed header"
      );
      const filteredCommands = slashCommands.filter((c) => c.userInvocable);
      const visibleSkillInFiltered = filteredCommands.find((cmd) => cmd.name === "visible-skill");
      assert.ok(
        visibleSkillInFiltered,
        "Visible skill should be included when applying userInvocable filter"
      );
    });
    test("should default to true for skills without user-invocable attribute", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "user-invocable-undefined";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/default-skill/SKILL.md`,
          contents: [
            "---",
            'name: "default-skill"',
            'description: "A skill without explicit user-invocable"',
            "---",
            "Default skill content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const defaultSkillCommand = slashCommands.find((cmd) => cmd.name === "default-skill");
      assert.ok(defaultSkillCommand, "Should find default skill in slash commands");
      assert.strictEqual(defaultSkillCommand.userInvocable, true, "Should have userInvocable=true when attribute is not specified");
      const filteredCommands = slashCommands.filter((c) => c.userInvocable);
      const defaultSkillInFiltered = filteredCommands.find((cmd) => cmd.name === "default-skill");
      assert.ok(
        defaultSkillInFiltered,
        "Skill without user-invocable attribute should be included when applying userInvocable filter"
      );
    });
    test("should handle prompts with user-invocable: false", async () => {
      const rootFolderName = "prompt-user-invocable-false";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/prompts/hidden-prompt.prompt.md`,
          contents: [
            "---",
            'name: "hidden-prompt"',
            'description: "A prompt hidden from the / menu"',
            "user-invocable: false",
            "---",
            "Hidden prompt content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const hiddenPromptCommand = slashCommands.find((cmd) => cmd.name === "hidden-prompt");
      assert.ok(hiddenPromptCommand, "Should find hidden prompt in slash commands");
      assert.strictEqual(
        hiddenPromptCommand.userInvocable,
        false,
        "Should have userInvocable=false in parsed header"
      );
      const filteredCommands = slashCommands.filter((c) => c.userInvocable);
      const hiddenPromptInFiltered = filteredCommands.find((cmd) => cmd.name === "hidden-prompt");
      assert.strictEqual(
        hiddenPromptInFiltered,
        void 0,
        "Hidden prompt should be filtered out when applying userInvocable filter"
      );
    });
    test("should correctly filter mixed user-invocable values", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "mixed-user-invocable";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/prompts/visible-prompt.prompt.md`,
          contents: [
            "---",
            'name: "visible-prompt"',
            'description: "A visible prompt"',
            "---",
            "Visible prompt content"
          ]
        },
        {
          path: `${rootFolder}/.github/prompts/hidden-prompt.prompt.md`,
          contents: [
            "---",
            'name: "hidden-prompt"',
            'description: "A hidden prompt"',
            "user-invocable: false",
            "---",
            "Hidden prompt content"
          ]
        },
        {
          path: `${rootFolder}/.github/skills/visible-skill/SKILL.md`,
          contents: [
            "---",
            'name: "visible-skill"',
            'description: "A visible skill"',
            "user-invocable: true",
            "---",
            "Visible skill content"
          ]
        },
        {
          path: `${rootFolder}/.github/skills/hidden-skill/SKILL.md`,
          contents: [
            "---",
            'name: "hidden-skill"',
            'description: "A hidden skill"',
            "user-invocable: false",
            "---",
            "Hidden skill content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      assert.strictEqual(slashCommands.length, 4, "Should find all 4 commands");
      const filteredCommands = slashCommands.filter((c) => c.userInvocable);
      assert.strictEqual(filteredCommands.length, 2, "Should have 2 commands after filtering");
      assert.ok(filteredCommands.find((c) => c.name === "visible-prompt"), "visible-prompt should be included");
      assert.ok(filteredCommands.find((c) => c.name === "visible-skill"), "visible-skill should be included");
      assert.strictEqual(filteredCommands.find((c) => c.name === "hidden-prompt"), void 0, "hidden-prompt should be excluded");
      assert.strictEqual(filteredCommands.find((c) => c.name === "hidden-skill"), void 0, "hidden-skill should be excluded");
    });
    test("should handle skills with missing header gracefully", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "missing-header";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/no-header-skill/SKILL.md`,
          contents: [
            "This skill has no YAML header at all.",
            "Just plain markdown content."
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const noHeaderSkill = slashCommands.find((cmd) => cmd.uri.path.includes("no-header-skill"));
      assert.ok(noHeaderSkill, "Should find skill without header in slash commands");
      const filteredCommands = slashCommands.filter((c) => c.userInvocable);
      const noHeaderSkillInFiltered = filteredCommands.find((cmd) => cmd.uri.path.includes("no-header-skill"));
      assert.ok(
        noHeaderSkillInFiltered,
        "Skill without header should be included when applying userInvocable filter (defaults to true)"
      );
    });
    test("plugin skills include plugin name prefix in slash command name", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const skillUri = URI.file("/plugins/my-plugin/skills/deploy/SKILL.md");
      await mockFiles(fileService, [
        {
          path: skillUri.path,
          contents: [
            "---",
            'description: "Deploy skill from plugin"',
            "---",
            "Deploy skill content"
          ]
        }
      ]);
      const enablement = observableValue(
        "testPluginEnablement",
        2
        /* ContributionEnablementState.EnabledProfile */
      );
      const plugin = {
        uri: URI.file("/plugins/my-plugin"),
        format: PluginFormat.Copilot,
        label: "my-plugin",
        enablement,
        remove: () => {
        },
        hooks: observableValue("testPluginHooks", []),
        commands: observableValue("testPluginCommands", []),
        skills: observableValue("testPluginSkills", [{ uri: skillUri, name: "deploy" }]),
        agents: observableValue("testPluginAgents", []),
        instructions: observableValue("testPluginInstructions", []),
        mcpServerDefinitions: observableValue("testPluginMcpServerDefinitions", [])
      };
      testPluginsObservable.set([plugin], void 0);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const skillCommand = slashCommands.find((cmd) => cmd.name === "my-plugin:deploy");
      assert.ok(skillCommand, "Plugin skill should have plugin prefix in slash command name");
      assert.strictEqual(skillCommand.storage, PromptsStorage.plugin);
      assert.strictEqual(skillCommand.type, PromptsType.skill);
      testPluginsObservable.set([], void 0);
    });
    test("plugin skill frontmatter name is qualified with plugin prefix", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const skillUri = URI.file("/plugins/devtools/skills/ci/SKILL.md");
      await mockFiles(fileService, [
        {
          path: skillUri.path,
          contents: [
            "---",
            'name: "run-ci"',
            'description: "Run CI pipeline"',
            "---",
            "CI skill content"
          ]
        }
      ]);
      const enablement = observableValue(
        "testPluginEnablement",
        2
        /* ContributionEnablementState.EnabledProfile */
      );
      const plugin = {
        uri: URI.file("/plugins/devtools"),
        format: PluginFormat.Copilot,
        label: "devtools",
        enablement,
        remove: () => {
        },
        hooks: observableValue("testPluginHooks", []),
        commands: observableValue("testPluginCommands", []),
        skills: observableValue("testPluginSkills", [{ uri: skillUri, name: "ci" }]),
        agents: observableValue("testPluginAgents", []),
        instructions: observableValue("testPluginInstructions", []),
        mcpServerDefinitions: observableValue("testPluginMcpServerDefinitions", [])
      };
      testPluginsObservable.set([plugin], void 0);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const skillCommand = slashCommands.find((cmd) => cmd.name === "devtools:ci");
      assert.ok(skillCommand, "Plugin skill folder name should be qualified with plugin prefix");
      assert.strictEqual(skillCommand.description, "Run CI pipeline");
      assert.strictEqual(
        slashCommands.find((cmd) => cmd.name === "devtools:run-ci"),
        void 0,
        "Frontmatter skill name should not appear as slash command"
      );
      assert.strictEqual(
        slashCommands.find((cmd) => cmd.name === "run-ci"),
        void 0,
        "Unprefixed skill name should not appear as slash command"
      );
      testPluginsObservable.set([], void 0);
    });
    test("plugin skill slash command prefix uses plugin label when install path is a pinned SHA", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const pluginUri = URI.file("/cache/agentPlugins/github/datadog/sha_b003fcad48c3a935ffe04b6218f5cf58fe2b6760");
      const skillUri = URI.joinPath(pluginUri, "skills", "ddsetup", "SKILL.md");
      await mockFiles(fileService, [
        {
          path: skillUri.path,
          contents: [
            "---",
            'name: "ddsetup"',
            'description: "Set up Datadog"',
            "---",
            "Datadog setup skill content"
          ]
        }
      ]);
      const enablement = observableValue(
        "testPluginEnablement",
        2
        /* ContributionEnablementState.EnabledProfile */
      );
      const plugin = {
        uri: pluginUri,
        format: PluginFormat.Copilot,
        label: "datadog",
        enablement,
        remove: () => {
        },
        hooks: observableValue("testPluginHooks", []),
        commands: observableValue("testPluginCommands", []),
        skills: observableValue("testPluginSkills", [{ uri: skillUri, name: "ddsetup" }]),
        agents: observableValue("testPluginAgents", []),
        instructions: observableValue("testPluginInstructions", []),
        mcpServerDefinitions: observableValue("testPluginMcpServerDefinitions", [])
      };
      testPluginsObservable.set([plugin], void 0);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      assert.deepStrictEqual(slashCommands.filter((command) => command.uri.toString() === skillUri.toString()).map((command) => ({ name: command.name, description: command.description, type: command.type, storage: command.storage })), [{
        name: "datadog:ddsetup",
        description: "Set up Datadog",
        type: PromptsType.skill,
        storage: PromptsStorage.plugin
      }]);
      testPluginsObservable.set([], void 0);
    });
  });
  suite("customization lockdown", () => {
    test("policy changes invalidate cached standalone agent locations", async () => {
      const rootFolderUri = URI.file("/dynamic-agent-lockdown");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [{
        path: "/dynamic-agent-lockdown/.github/agents/reviewer.agent.md",
        contents: ["---", 'description: "Review code"', "---"]
      }]);
      assert.strictEqual((await service.getCustomAgents(CancellationToken.None)).length, 1);
      testConfigService.setUserConfiguration(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG, true);
      fireConfigChange(testConfigService, COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG);
      assert.deepStrictEqual(await service.getCustomAgents(CancellationToken.None), []);
    });
    test("plugin-only lockdown filters workspace agents without affecting prompts", async () => {
      const rootFolderUri = URI.file("/lockdown-agents");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      testConfigService.setUserConfiguration(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG, true);
      await mockFiles(fileService, [
        {
          path: "/lockdown-agents/.github/agents/reviewer.agent.md",
          contents: ["---", 'description: "Review code"', "---"]
        },
        {
          path: "/lockdown-agents/.github/prompts/review.prompt.md",
          contents: ["---", 'description: "Review prompt"', "---"]
        }
      ]);
      assert.deepStrictEqual(await service.getCustomAgents(CancellationToken.None), []);
      assert.strictEqual((await service.listPromptFiles(PromptsType.prompt, CancellationToken.None)).length, 1);
    });
    test("skill lockdown filters standalone skills before discovery and preserves plugin skills", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG, true);
      const rootFolderUri = URI.file("/lockdown-skills");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [{
        path: "/lockdown-skills/.github/skills/workspace-skill/SKILL.md",
        contents: ["---", 'name: "workspace-skill"', 'description: "Workspace"', "---"]
      }, {
        path: "/plugins/managed/skills/plugin-skill/SKILL.md",
        contents: ["---", 'name: "plugin-skill"', 'description: "Plugin"', "---"]
      }]);
      const plugin = {
        uri: URI.file("/plugins/managed"),
        format: PluginFormat.Copilot,
        label: "managed",
        enablement: observableValue(
          "lockdownPluginEnablement",
          2
          /* ContributionEnablementState.EnabledProfile */
        ),
        hooks: observableValue("lockdownPluginHooks", []),
        commands: observableValue("lockdownPluginCommands", []),
        skills: observableValue("lockdownPluginSkills", [{ uri: URI.file("/plugins/managed/skills/plugin-skill/SKILL.md"), name: "plugin-skill" }]),
        agents: observableValue("lockdownPluginAgents", []),
        instructions: observableValue("lockdownPluginInstructions", []),
        mcpServerDefinitions: observableValue("lockdownPluginMcpServers", [])
      };
      testPluginsObservable.set([plugin], void 0);
      const skills = await service.findAgentSkills(CancellationToken.None);
      assert.deepStrictEqual(skills?.map((skill) => ({ name: skill.name, storage: skill.storage })), [
        { name: "plugin-skill", storage: PromptsStorage.plugin }
      ]);
    });
    test("plugin-only lockdown filters standalone instructions and preserves plugin instructions", async () => {
      testConfigService.setUserConfiguration(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG, true);
      const rootFolderUri = URI.file("/lockdown-instructions");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const workspaceInstructionUri = URI.joinPath(rootFolderUri, ".github", "instructions", "workspace.instructions.md");
      const pluginUri = URI.file("/plugins/managed");
      const pluginInstructionUri = URI.joinPath(pluginUri, "rules", "plugin.instructions.md");
      await mockFiles(fileService, [{
        path: workspaceInstructionUri.path,
        contents: ["---", 'description: "Workspace"', "---"]
      }, {
        path: pluginInstructionUri.path,
        contents: ["---", 'description: "Plugin"', "---"]
      }]);
      const plugin = {
        uri: pluginUri,
        format: PluginFormat.Copilot,
        label: "managed",
        enablement: observableValue(
          "lockdownInstructionPluginEnablement",
          2
          /* ContributionEnablementState.EnabledProfile */
        ),
        hooks: observableValue("lockdownInstructionPluginHooks", []),
        commands: observableValue("lockdownInstructionPluginCommands", []),
        skills: observableValue("lockdownInstructionPluginSkills", []),
        agents: observableValue("lockdownInstructionPluginAgents", []),
        instructions: observableValue("lockdownPluginInstructions", [{ uri: pluginInstructionUri, name: "plugin" }]),
        mcpServerDefinitions: observableValue("lockdownInstructionPluginMcpServers", [])
      };
      testPluginsObservable.set([plugin], void 0);
      const instructions = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      assert.deepStrictEqual(instructions.map((instruction) => ({
        uri: instruction.uri.toString(),
        storage: instruction.storage
      })), [{
        uri: pluginInstructionUri.toString(),
        storage: PromptsStorage.plugin
      }]);
    });
    test("plugin-only lockdown filters workspace agent instruction files", async () => {
      testConfigService.setUserConfiguration(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG, true);
      const rootFolderUri = URI.file("/lockdown-agent-instructions");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [{
        path: URI.joinPath(rootFolderUri, "AGENTS.md").path,
        contents: ["Workspace agent instructions"]
      }, {
        path: URI.joinPath(rootFolderUri, "CLAUDE.md").path,
        contents: ["Workspace Claude instructions"]
      }]);
      assert.deepStrictEqual(await service.listAgentInstructions(CancellationToken.None, void 0), []);
      assert.deepStrictEqual(await service.listNestedAgentMDs(CancellationToken.None), []);
    });
    test("plugin-only lockdown removes standalone agents with embedded hooks", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
      testConfigService.setUserConfiguration(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG, true);
      const rootFolderUri = URI.file("/lockdown-agent-hooks");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [{
        path: "/lockdown-agent-hooks/.github/agents/reviewer.agent.md",
        contents: [
          "---",
          'description: "Review code"',
          "hooks:",
          "  PreToolUse:",
          "    - type: command",
          '      command: "echo blocked"',
          "---"
        ]
      }]);
      const agents = await service.getCustomAgents(CancellationToken.None);
      assert.deepStrictEqual(agents, []);
    });
    test("managed-only hooks preserve frontmatter hooks from force-enabled plugin agents", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
      testConfigService.setUserConfiguration(COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG, true);
      const pluginUri = URI.file("/home/user/.copilot/installed-plugins/managed-marketplace/managed-plugin");
      const agentUri = URI.joinPath(pluginUri, "agents", "reviewer.agent.md");
      await mockFiles(fileService, [{
        path: agentUri.path,
        contents: [
          "---",
          'description: "Review code"',
          "hooks:",
          "  PreToolUse:",
          "    - type: command",
          '      command: "echo managed"',
          "---"
        ]
      }]);
      const originalInspect = testConfigService.inspect.bind(testConfigService);
      testConfigService.inspect = (key, overrides) => {
        const inspected = originalInspect(key, overrides);
        return key === ChatConfiguration.EnabledPlugins ? { ...inspected, policyValue: { "managed-plugin@managed-marketplace": true } } : inspected;
      };
      const plugin = {
        uri: pluginUri,
        format: PluginFormat.Copilot,
        label: "managed-plugin",
        enablement: observableValue(
          "managedPluginEnablement",
          2
          /* ContributionEnablementState.EnabledProfile */
        ),
        hooks: observableValue("managedPluginHooks", []),
        commands: observableValue("managedPluginCommands", []),
        skills: observableValue("managedPluginSkills", []),
        agents: observableValue("managedPluginAgents", [{ uri: agentUri, name: "reviewer" }]),
        instructions: observableValue("managedPluginInstructions", []),
        mcpServerDefinitions: observableValue("managedPluginMcpServers", [])
      };
      testPluginsObservable.set([plugin], void 0);
      fireConfigChange(testConfigService, COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG, ChatConfiguration.EnabledPlugins);
      const agents = await service.getCustomAgents(CancellationToken.None);
      assert.strictEqual(agents.length, 1);
      assert.strictEqual(agents[0].hooks?.[HookType.PreToolUse]?.[0].command, "echo managed");
    });
  });
  suite("hooks", () => {
    const createTestPlugin = (path, initialHooks) => {
      const enablement = observableValue(
        "testPluginEnablement",
        2
        /* ContributionEnablementState.EnabledProfile */
      );
      const hooks = observableValue("testPluginHooks", initialHooks);
      const commands = observableValue("testPluginCommands", []);
      const skills = observableValue("testPluginSkills", []);
      const agents = observableValue("testPluginAgents", []);
      const instructions = observableValue("testPluginInstructions", []);
      const mcpServerDefinitions = observableValue("testPluginMcpServerDefinitions", []);
      return {
        plugin: {
          uri: URI.file(path),
          format: PluginFormat.Copilot,
          label: basename(URI.file(path)),
          enablement,
          remove: () => {
          },
          hooks,
          commands,
          skills,
          agents,
          instructions,
          mcpServerDefinitions
        },
        hooks
      };
    };
    test("multi-root workspace resolves cwd to per-hook-file workspace folder", async function() {
      const folder1Uri = URI.file("/workspace-a");
      const folder2Uri = URI.file("/workspace-b");
      workspaceContextService.setWorkspace(testWorkspace(folder1Uri, folder2Uri));
      testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
      testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, { [HOOKS_SOURCE_FOLDER]: true });
      await mockFiles(fileService, [
        {
          path: "/workspace-a/.github/hooks/my-hook.json",
          contents: [
            JSON.stringify({
              hooks: {
                [HookType.PreToolUse]: [
                  { type: "command", command: "echo folder-a" }
                ]
              }
            })
          ]
        },
        {
          path: "/workspace-b/.github/hooks/my-hook.json",
          contents: [
            JSON.stringify({
              hooks: {
                [HookType.PreToolUse]: [
                  { type: "command", command: "echo folder-b" }
                ]
              }
            })
          ]
        }
      ]);
      const result = await service.getHooks(CancellationToken.None);
      assert.ok(result, "Expected hooks result");
      const preToolUseHooks = result.hooks[HookType.PreToolUse];
      assert.ok(preToolUseHooks, "Expected PreToolUse hooks");
      assert.strictEqual(preToolUseHooks.length, 2, "Expected two PreToolUse hooks");
      const hookA = preToolUseHooks.find((h) => h.command === "echo folder-a");
      const hookB = preToolUseHooks.find((h) => h.command === "echo folder-b");
      assert.ok(hookA, "Expected hook from folder-a");
      assert.ok(hookB, "Expected hook from folder-b");
      assert.strictEqual(hookA.cwd?.path, folder1Uri.path, "Hook from folder-a should have cwd pointing to workspace-a");
      assert.strictEqual(hookB.cwd?.path, folder2Uri.path, "Hook from folder-b should have cwd pointing to workspace-b");
    });
    test("includes hooks from agent plugins", async function() {
      testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
      testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, {});
      const { plugin } = createTestPlugin("/plugins/test-plugin", [{
        type: HookType.PreToolUse,
        originalId: "plugin-pre-tool-use",
        hooks: [{ command: "echo from-plugin" }],
        uri: URI.file("/plugins/test-plugin/hooks.json")
      }]);
      testPluginsObservable.set([plugin], void 0);
      const result = await service.getHooks(CancellationToken.None);
      assert.ok(result, "Expected hooks result");
      assert.deepStrictEqual(result.hooks[HookType.PreToolUse], [{
        command: "echo from-plugin",
        sourceUri: URI.file("/plugins/test-plugin/hooks.json")
      }], "Expected plugin hooks to be included in computed hooks");
    });
    test("managed-only hooks block standalone and unmanaged plugin hooks", async function() {
      const rootFolderUri = URI.file("/managed-hooks-only");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
      testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, { [HOOKS_SOURCE_FOLDER]: true });
      testConfigService.setUserConfiguration(COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG, true);
      fireConfigChange(testConfigService, COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG);
      await mockFiles(fileService, [{
        path: "/managed-hooks-only/.github/hooks/hooks.json",
        contents: [JSON.stringify({ hooks: { [HookType.PreToolUse]: [{ type: "command", command: "echo workspace" }] } })]
      }]);
      const { plugin } = createTestPlugin("/plugins/unmanaged", [{
        type: HookType.PreToolUse,
        originalId: "plugin-hook",
        hooks: [{ command: "echo plugin" }],
        uri: URI.file("/plugins/unmanaged/hooks.json")
      }]);
      testPluginsObservable.set([plugin], void 0);
      assert.strictEqual(await service.getHooks(CancellationToken.None), void 0);
      assert.deepStrictEqual(await service.listPromptFiles(PromptsType.hook, CancellationToken.None), []);
    });
    test("recomputes hooks when agent plugin hooks change", async function() {
      testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
      testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, {});
      const { plugin, hooks } = createTestPlugin("/plugins/test-plugin", [{
        type: HookType.PreToolUse,
        originalId: "plugin-pre-tool-use",
        hooks: [{ command: "echo before" }],
        uri: URI.file("/plugins/test-plugin/hooks.json")
      }]);
      testPluginsObservable.set([plugin], void 0);
      const before = await service.getHooks(CancellationToken.None);
      assert.ok(before, "Expected hooks result before plugin update");
      assert.deepStrictEqual(before.hooks[HookType.PreToolUse], [{ command: "echo before", sourceUri: URI.file("/plugins/test-plugin/hooks.json") }]);
      hooks.set([{
        type: HookType.PreToolUse,
        originalId: "plugin-pre-tool-use",
        hooks: [{ command: "echo after" }],
        uri: URI.file("/plugins/test-plugin/hooks.json")
      }], void 0);
      const after = await service.getHooks(CancellationToken.None);
      assert.ok(after, "Expected hooks result after plugin update");
      assert.deepStrictEqual(after.hooks[HookType.PreToolUse], [{ command: "echo after", sourceUri: URI.file("/plugins/test-plugin/hooks.json") }]);
    });
    test("returns undefined when workspace is untrusted", async function() {
      workspaceContextService.setWorkspace(testWorkspace(URI.file("/test-workspace")));
      testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
      testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, { [HOOKS_SOURCE_FOLDER]: true });
      await mockFiles(fileService, [
        {
          path: "/test-workspace/.github/hooks/my-hook.json",
          contents: [
            JSON.stringify({
              hooks: {
                [HookType.PreToolUse]: [
                  { type: "command", command: "echo test" }
                ]
              }
            })
          ]
        }
      ]);
      const trustedResult = await service.getHooks(CancellationToken.None);
      assert.ok(trustedResult, "Expected hooks when workspace is trusted");
      assert.strictEqual(trustedResult.hooks[HookType.PreToolUse]?.length, 1);
      await workspaceTrustService.setWorkspaceTrust(false);
      const untrustedResult = await service.getHooks(CancellationToken.None);
      assert.strictEqual(untrustedResult, void 0, "Expected undefined hooks when workspace is untrusted");
      await workspaceTrustService.setWorkspaceTrust(true);
      const reTrustedResult = await service.getHooks(CancellationToken.None);
      assert.ok(reTrustedResult, "Expected hooks after workspace becomes trusted again");
      assert.strictEqual(reTrustedResult.hooks[HookType.PreToolUse]?.length, 1);
    });
    test("suppresses plugin hooks when workspace is untrusted", async function() {
      testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
      testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, {});
      const { plugin } = createTestPlugin("/plugins/test-plugin", [{
        type: HookType.PreToolUse,
        originalId: "plugin-pre-tool-use",
        hooks: [{ command: "echo from-plugin" }],
        uri: URI.file("/plugins/test-plugin/hooks.json")
      }]);
      testPluginsObservable.set([plugin], void 0);
      await workspaceTrustService.setWorkspaceTrust(false);
      const result = await service.getHooks(CancellationToken.None);
      assert.strictEqual(result, void 0, "Expected undefined hooks when workspace is untrusted, even with plugin hooks");
    });
    test("Claude hooks with disableAllHooks should not report hasDisabledClaudeHooks when Claude hooks setting is off", async function() {
      const workspaceUri = URI.file("/test-workspace");
      workspaceContextService.setWorkspace(testWorkspace(workspaceUri));
      testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
      testConfigService.setUserConfiguration(PromptsConfig.USE_CLAUDE_HOOKS, false);
      testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, { [HOOKS_SOURCE_FOLDER]: true });
      await mockFiles(fileService, [
        {
          path: "/test-workspace/.claude/settings.json",
          contents: [
            JSON.stringify({
              disableAllHooks: true,
              hooks: {
                PreToolUse: [{ type: "command", command: "echo disabled-claude-hook" }]
              }
            })
          ]
        }
      ]);
      const result = await service.getHooks(CancellationToken.None);
      assert.strictEqual(result, void 0, "Expected no hooks result");
    });
    test("plugin hooks appear in hook discovery info files", async function() {
      const workspaceUri = URI.file("/test-workspace");
      workspaceContextService.setWorkspace(testWorkspace(workspaceUri));
      testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
      testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, { [HOOKS_SOURCE_FOLDER]: true });
      const pluginHookUri = URI.file("/plugins/test-plugin/hooks.json");
      const { plugin } = createTestPlugin("/plugins/test-plugin", [{
        type: HookType.PreToolUse,
        originalId: "plugin-pre-tool-use",
        hooks: [{ command: "echo from-plugin" }],
        uri: pluginHookUri
      }]);
      testPluginsObservable.set([plugin], void 0);
      const result = await service.getHooks(CancellationToken.None);
      const capturedDiscoveryInfo = await service.getDiscoveryInfo(PromptsType.hook, CancellationToken.None);
      assert.ok(result, "Expected hooks result with plugin hooks");
      assert.ok(capturedDiscoveryInfo, "Expected discovery info to be logged");
      const pluginFile = capturedDiscoveryInfo.files.find(
        (f) => f.promptPath.storage === PromptsStorage.plugin
      );
      assert.ok(pluginFile, "Plugin hook file should be present in discovery info files");
    });
  });
  suite("plugin instructions", () => {
    function createPluginWithInstructions(path, initialInstructions) {
      const enablement = observableValue(
        "testPluginEnablement",
        2
        /* ContributionEnablementState.EnabledProfile */
      );
      const hooks = observableValue("testPluginHooks", []);
      const commands = observableValue("testPluginCommands", []);
      const skills = observableValue("testPluginSkills", []);
      const agents = observableValue("testPluginAgents", []);
      const instructions = observableValue("testPluginInstructions", initialInstructions);
      const mcpServerDefinitions = observableValue("testPluginMcpServerDefinitions", []);
      return {
        plugin: {
          uri: URI.file(path),
          format: PluginFormat.Copilot,
          label: basename(URI.file(path)),
          enablement,
          remove: () => {
          },
          hooks,
          commands,
          skills,
          agents,
          instructions,
          mcpServerDefinitions
        },
        instructions
      };
    }
    test("lists plugin instructions via listPromptFiles", async function() {
      const ruleUri = URI.file("/plugins/test-plugin/rules/prefer-const.mdc");
      const { plugin } = createPluginWithInstructions("/plugins/test-plugin", [
        { uri: ruleUri, name: "prefer-const" }
      ]);
      testPluginsObservable.set([plugin], void 0);
      const result = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      const pluginInstruction = result.find((p) => p.uri.toString() === ruleUri.toString());
      assert.ok(pluginInstruction, "Plugin instruction should appear in listPromptFiles");
      assert.strictEqual(pluginInstruction.storage, PromptsStorage.plugin);
    });
    test("updates listed instructions when plugin instructions change", async function() {
      const ruleUri1 = URI.file("/plugins/test-plugin/rules/rule-a.mdc");
      const ruleUri2 = URI.file("/plugins/test-plugin/rules/rule-b.mdc");
      const { plugin, instructions } = createPluginWithInstructions("/plugins/test-plugin", [
        { uri: ruleUri1, name: "rule-a" }
      ]);
      testPluginsObservable.set([plugin], void 0);
      const before = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      const beforePlugin = before.filter((p) => p.storage === PromptsStorage.plugin);
      assert.strictEqual(beforePlugin.length, 1);
      const eventFired = new Promise((resolve) => {
        const disposable = service.onDidChangeInstructions(() => {
          disposable.dispose();
          resolve();
        });
      });
      instructions.set([
        { uri: ruleUri1, name: "rule-a" },
        { uri: ruleUri2, name: "rule-b" }
      ], void 0);
      await eventFired;
      const after = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      const afterPlugin = after.filter((p) => p.storage === PromptsStorage.plugin);
      assert.strictEqual(afterPlugin.length, 2);
    });
    test("removes instructions when plugin is removed", async function() {
      const ruleUri = URI.file("/plugins/test-plugin/rules/rule-a.mdc");
      const { plugin } = createPluginWithInstructions("/plugins/test-plugin", [
        { uri: ruleUri, name: "rule-a" }
      ]);
      testPluginsObservable.set([plugin], void 0);
      const withPlugin = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      assert.ok(withPlugin.some((p) => p.storage === PromptsStorage.plugin));
      testPluginsObservable.set([], void 0);
      const withoutPlugin = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      assert.ok(!withoutPlugin.some((p) => p.storage === PromptsStorage.plugin));
    });
    test("namespaces plugin instruction names with plugin folder", async function() {
      const ruleUri = URI.file("/plugins/deploy-tools/rules/lint-check.mdc");
      const { plugin } = createPluginWithInstructions("/plugins/deploy-tools", [
        { uri: ruleUri, name: "lint-check" }
      ]);
      testPluginsObservable.set([plugin], void 0);
      const result = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      const pluginInstruction = result.find((p) => p.uri.toString() === ruleUri.toString());
      assert.ok(pluginInstruction, "Plugin instruction should be listed");
      assert.strictEqual(pluginInstruction.name, "deploy-tools:lint-check");
    });
  });
});
function fireConfigChange(configService, ...key) {
  configService.onDidChangeConfigurationEmitter.fire({
    affectsConfiguration: (k) => key.includes(k)
  });
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxccHJvbXB0U3ludGF4XFxzZXJ2aWNlXFxwcm9tcHRzU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgc2lub24gZnJvbSAnc2lub24nO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgbWF0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCB7IFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElTZXR0YWJsZU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIHJlbGF0aXZlUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCwgSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMsIElDb25maWd1cmF0aW9uU2VydmljZSwgSUNvbmZpZ3VyYXRpb25WYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciwgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyB0ZXN0V29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL3Rlc3QvY29tbW9uL3Rlc3RXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyB0b1VzZXJEYXRhUHJvZmlsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IFRlc3RDb250ZXh0U2VydmljZSwgVGVzdFVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsIFRlc3RXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0VmFyaWFibGVTZXQsIGlzUHJvbXB0RmlsZVZhcmlhYmxlRW50cnksIHRvRmlsZVZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBDb21wdXRlQXV0b21hdGljSW5zdHJ1Y3Rpb25zLCBuZXdJbnN0cnVjdGlvbnNDb2xsZWN0aW9uRXZlbnQsIG5ld0luc3RydWN0aW9uc0NvbGxlY3Rpb25EZWJ1Z0luZm8gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2NvbXB1dGVBdXRvbWF0aWNJbnN0cnVjdGlvbnMuanMnO1xuaW1wb3J0IHsgUHJvbXB0c0NvbmZpZyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvY29uZmlnL2NvbmZpZy5qcyc7XG5pbXBvcnQgeyBBR0VOVFNfU09VUkNFX0ZPTERFUiwgQ0xBVURFX0NPTkZJR19GT0xERVIsIEhPT0tTX1NPVVJDRV9GT0xERVIsIElOU1RSVUNUSU9OX0ZJTEVfRVhURU5TSU9OLCBJTlNUUlVDVElPTlNfREVGQVVMVF9TT1VSQ0VfRk9MREVSLCBMRUdBQ1lfTU9ERV9ERUZBVUxUX1NPVVJDRV9GT0xERVIsIFBST01QVF9ERUZBVUxUX1NPVVJDRV9GT0xERVIsIFBST01QVF9GSUxFX0VYVEVOU0lPTiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvY29uZmlnL3Byb21wdEZpbGVMb2NhdGlvbnMuanMnO1xuaW1wb3J0IHsgSU5TVFJVQ1RJT05TX0xBTkdVQUdFX0lELCBQUk9NUFRfTEFOR1VBR0VfSUQsIFByb21wdEZpbGVTb3VyY2UsIFByb21wdHNUeXBlLCBUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IElBZ2VudERpc2NvdmVyeVJlc3VsdCwgSUFnZW50U291cmNlLCBJQ3VzdG9tQWdlbnQsIElQcm9tcHRGaWxlQ29udGV4dCwgSVByb21wdFBhdGgsIElQcm9tcHRzU2VydmljZSwgUHJvbXB0c1N0b3JhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IG1vY2tGaWxlcyB9IGZyb20gJy4uL3Rlc3RVdGlscy9tb2NrRmlsZXN5c3RlbS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLCBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlTWF0Y2gsIElGaWxlUXVlcnksIElTZWFyY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBIb29rVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvaG9va1R5cGVzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5Q2hhbmdlRXZlbnQsIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgTW9ja0NvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy90ZXN0L2NvbW1vbi9tb2NrS2V5YmluZGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luLCBJQWdlbnRQbHVnaW5BZ2VudCwgSUFnZW50UGx1Z2luQ29tbWFuZCwgSUFnZW50UGx1Z2luSG9vaywgSUFnZW50UGx1Z2luSW5zdHJ1Y3Rpb24sIElBZ2VudFBsdWdpbk1jcFNlcnZlckRlZmluaXRpb24sIElBZ2VudFBsdWdpblNlcnZpY2UsIElBZ2VudFBsdWdpblNraWxsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3BsdWdpbnMvYWdlbnRQbHVnaW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFBsdWdpbkZvcm1hdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50UGx1Z2lucy9jb21tb24vcGx1Z2luUGFyc2Vycy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgQ09QSUxPVF9BTExPV19NQU5BR0VEX0hPT0tTX09OTFlfQ09ORklHLCBDT1BJTE9UX1NUUklDVF9QTFVHSU5fT05MWV9DVVNUT01JWkFUSU9OX0NPTkZJRyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3BvbGljeS9jb21tb24vY29waWxvdE1hbmFnZWRTZXR0aW5ncy5qcyc7XG5cbmNsYXNzIFRlc3RQcm9tcHRDb250ZXh0S2V5U2VydmljZSBleHRlbmRzIE1vY2tDb250ZXh0S2V5U2VydmljZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGV4dEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxJQ29udGV4dEtleUNoYW5nZUV2ZW50PigpO1xuXHRwcml2YXRlIF9ydWxlc01hdGNoID0gZmFsc2U7XG5cblx0b3ZlcnJpZGUgZ2V0IG9uRGlkQ2hhbmdlQ29udGV4dCgpOiBFdmVudDxJQ29udGV4dEtleUNoYW5nZUV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlQ29udGV4dEVtaXR0ZXIuZXZlbnQ7XG5cdH1cblxuXHRvdmVycmlkZSBjb250ZXh0TWF0Y2hlc1J1bGVzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9ydWxlc01hdGNoO1xuXHR9XG5cblx0c2V0UnVsZXNNYXRjaCh2YWx1ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3J1bGVzTWF0Y2ggPSB2YWx1ZTtcblx0fVxuXG5cdGZpcmVEaWRDaGFuZ2VDb250ZXh0KGtleXM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhbmdlZEtleXMgPSBuZXcgU2V0KGtleXMpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGV4dEVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRhZmZlY3RzU29tZTogdHJhY2tlZEtleXMgPT4ga2V5cy5zb21lKGtleSA9PiB0cmFja2VkS2V5cy5oYXMoa2V5KSksXG5cdFx0XHRhbGxLZXlzQ29udGFpbmVkSW46IHRyYWNrZWRLZXlzID0+IEFycmF5LmZyb20oY2hhbmdlZEtleXMpLmV2ZXJ5KGtleSA9PiB0cmFja2VkS2V5cy5oYXMoa2V5KSksXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGV4dEVtaXR0ZXIuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5zdWl0ZSgnUHJvbXB0c1NlcnZpY2UnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IHNlcnZpY2U6IElQcm9tcHRzU2VydmljZTtcblx0bGV0IGluc3RhU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IFRlc3RDb250ZXh0U2VydmljZTtcblx0bGV0IHRlc3RDb25maWdTZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGxldCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlO1xuXHRsZXQgdGVzdFBsdWdpbnNPYnNlcnZhYmxlOiBJU2V0dGFibGVPYnNlcnZhYmxlPHJlYWRvbmx5IElBZ2VudFBsdWdpbltdPjtcblx0bGV0IHdvcmtzcGFjZVRydXN0U2VydmljZTogVGVzdFdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U7XG5cdGxldCBsb2dTZXJ2aWNlOiBOdWxsTG9nU2VydmljZTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0aW5zdGFTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0bG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGluc3RhU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblxuXHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlID0gbmV3IFRlc3RDb250ZXh0U2VydmljZSgpO1xuXHRcdGluc3RhU2VydmljZS5zdHViKElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXG5cdFx0dGVzdENvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQ09QSUxPVF9JTlNUUlVDVElPTl9GSUxFUywgdHJ1ZSk7XG5cdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfTUQsIHRydWUpO1xuXHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX05FU1RFRF9BR0VOVF9NRCwgZmFsc2UpO1xuXHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuSU5DTFVERV9SRUZFUkVOQ0VEX0lOU1RSVUNUSU9OUywgdHJ1ZSk7XG5cdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5JTkNMVURFX0FQUExZSU5HX0lOU1RSVUNUSU9OUywgdHJ1ZSk7XG5cdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQ1VTVE9NSVpBVElPTlNfSU5fUEFSRU5UX1JFUE9TLCBmYWxzZSk7XG5cdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5JTlNUUlVDVElPTlNfTE9DQVRJT05fS0VZLCB7IFtJTlNUUlVDVElPTlNfREVGQVVMVF9TT1VSQ0VfRk9MREVSXTogdHJ1ZSB9KTtcblx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlBST01QVF9MT0NBVElPTlNfS0VZLCB7IFtQUk9NUFRfREVGQVVMVF9TT1VSQ0VfRk9MREVSXTogdHJ1ZSB9KTtcblx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLk1PREVfTE9DQVRJT05fS0VZLCB7IFtMRUdBQ1lfTU9ERV9ERUZBVUxUX1NPVVJDRV9GT0xERVJdOiB0cnVlIH0pO1xuXHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuQUdFTlRTX0xPQ0FUSU9OX0tFWSwgeyBbQUdFTlRTX1NPVVJDRV9GT0xERVJdOiB0cnVlIH0pO1xuXG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0ZXN0Q29uZmlnU2VydmljZSk7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSwge30pO1xuXHRcdGluc3RhU2VydmljZS5zdHViKElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLCBuZXcgVGVzdFVzZXJEYXRhUHJvZmlsZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIEluTWVtb3J5U3RvcmFnZVNlcnZpY2UpO1xuXHRcdGluc3RhU2VydmljZS5zdHViKElFeHRlbnNpb25TZXJ2aWNlLCB7XG5cdFx0XHR3aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQ6ICgpID0+IFByb21pc2UucmVzb2x2ZSh0cnVlKSxcblx0XHRcdGFjdGl2YXRlQnlFdmVudDogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKClcblx0XHR9KTtcblxuXHRcdGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShGaWxlU2VydmljZSkpO1xuXHRcdGluc3RhU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbW9kZWxTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShNb2RlbFNlcnZpY2UpKTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJTW9kZWxTZXJ2aWNlLCBtb2RlbFNlcnZpY2UpO1xuXHRcdGluc3RhU2VydmljZS5zdHViKElMYW5ndWFnZVNlcnZpY2UsIHtcblx0XHRcdGd1ZXNzTGFuZ3VhZ2VJZEJ5RmlsZXBhdGhPckZpcnN0TGluZSh1cmk6IFVSSSkge1xuXHRcdFx0XHRpZiAodXJpLnBhdGguZW5kc1dpdGgoUFJPTVBUX0ZJTEVfRVhURU5TSU9OKSkge1xuXHRcdFx0XHRcdHJldHVybiBQUk9NUFRfTEFOR1VBR0VfSUQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodXJpLnBhdGguZW5kc1dpdGgoSU5TVFJVQ1RJT05fRklMRV9FWFRFTlNJT04pKSB7XG5cdFx0XHRcdFx0cmV0dXJuIElOU1RSVUNUSU9OU19MQU5HVUFHRV9JRDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiAncGxhaW50ZXh0Jztcblx0XHRcdH1cblx0XHR9KTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJTGFiZWxTZXJ2aWNlLCB7IGdldFVyaUxhYmVsOiAodXJpOiBVUkkpID0+IHVyaS5wYXRoIH0pO1xuXG5cdFx0Y29uc3QgZmlsZVN5c3RlbVByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmZpbGUsIGZpbGVTeXN0ZW1Qcm92aWRlcikpO1xuXG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsIHsgdXBkYXRlUmVhZG9ubHk6ICgpID0+IFByb21pc2UucmVzb2x2ZSgpIH0pO1xuXG5cdFx0Y29uc3QgcGF0aFNlcnZpY2UgPSB7XG5cdFx0XHR1c2VySG9tZTogKCk6IFVSSSB8IFByb21pc2U8VVJJPiA9PiB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoVVJJLmZpbGUoJy9ob21lL3VzZXInKSk7XG5cdFx0XHR9LFxuXHRcdH0gYXMgSVBhdGhTZXJ2aWNlO1xuXHRcdGluc3RhU2VydmljZS5zdHViKElQYXRoU2VydmljZSwgcGF0aFNlcnZpY2UpO1xuXG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSVNlYXJjaFNlcnZpY2UsIHtcblx0XHRcdHNjaGVtZUhhc0ZpbGVTZWFyY2hQcm92aWRlcjogKCkgPT4gdHJ1ZSxcblx0XHRcdGFzeW5jIGZpbGVTZWFyY2gocXVlcnk6IElGaWxlUXVlcnkpIHtcblx0XHRcdFx0Ly8gbW9jayB0aGUgc2VhcmNoIHNlcnZpY2UgLSByZWN1cnNpdmVseSBmaW5kIGZpbGVzIG1hdGNoaW5nIHBhdHRlcm5cblx0XHRcdFx0Y29uc3QgZmluZEZpbGVzSW5Mb2NhdGlvbiA9IGFzeW5jIChsb2NhdGlvbjogVVJJLCByZXN1bHRzOiBVUklbXSA9IFtdKTogUHJvbWlzZTxVUklbXT4gPT4ge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCByZXNvbHZlID0gYXdhaXQgZmlsZVNlcnZpY2UucmVzb2x2ZShsb2NhdGlvbik7XG5cdFx0XHRcdFx0XHRpZiAocmVzb2x2ZS5pc0ZpbGUpIHtcblx0XHRcdFx0XHRcdFx0cmVzdWx0cy5wdXNoKHJlc29sdmUucmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChyZXNvbHZlLmlzRGlyZWN0b3J5ICYmIHJlc29sdmUuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiByZXNvbHZlLmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgZmluZEZpbGVzSW5Mb2NhdGlvbihjaGlsZC5yZXNvdXJjZSwgcmVzdWx0cyk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0Ly8gZm9sZGVyIGRvZXNuJ3QgZXhpc3Rcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdHM7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0czogSUZpbGVNYXRjaFtdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgZm9sZGVyUXVlcnkgb2YgcXVlcnkuZm9sZGVyUXVlcmllcykge1xuXHRcdFx0XHRcdGNvbnN0IGFsbEZpbGVzID0gYXdhaXQgZmluZEZpbGVzSW5Mb2NhdGlvbihmb2xkZXJRdWVyeS5mb2xkZXIpO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgYWxsRmlsZXMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHBhdGhJbkZvbGRlciA9IHJlbGF0aXZlUGF0aChmb2xkZXJRdWVyeS5mb2xkZXIsIHJlc291cmNlKSA/PyAnJztcblx0XHRcdFx0XHRcdGlmIChxdWVyeS5maWxlUGF0dGVybiA9PT0gdW5kZWZpbmVkIHx8IG1hdGNoKHF1ZXJ5LmZpbGVQYXR0ZXJuLCBwYXRoSW5Gb2xkZXIpKSB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdHMucHVzaCh7IHJlc291cmNlIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyByZXN1bHRzLCBtZXNzYWdlczogW10gfTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGluc3RhU2VydmljZS5zdHViKElSZW1vdGVBZ2VudFNlcnZpY2UsIHtcblx0XHRcdGdldEVudmlyb25tZW50OiAoKSA9PiBQcm9taXNlLnJlc29sdmUobnVsbCksXG5cdFx0XHRnZXRDb25uZWN0aW9uOiAoKSA9PiBudWxsLFxuXHRcdH0pO1xuXG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUNvbnRleHRLZXlTZXJ2aWNlLCBuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpO1xuXG5cdFx0d29ya3NwYWNlVHJ1c3RTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0V29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSgpKTtcblx0XHR3b3Jrc3BhY2VUcnVzdFNlcnZpY2UuZ2V0VXJpVHJ1c3RJbmZvID0gKHVyaTogVVJJKSA9PiBQcm9taXNlLnJlc29sdmUoeyB0cnVzdGVkOiB0cnVlLCB1cmkgfSk7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIHdvcmtzcGFjZVRydXN0U2VydmljZSk7XG5cblx0XHR0ZXN0UGx1Z2luc09ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50UGx1Z2luW10+KCd0ZXN0UGx1Z2lucycsIFtdKTtcblxuXHRcdGluc3RhU2VydmljZS5zdHViKElBZ2VudFBsdWdpblNlcnZpY2UsIHtcblx0XHRcdHBsdWdpbnM6IHRlc3RQbHVnaW5zT2JzZXJ2YWJsZSxcblx0XHRcdGVuYWJsZW1lbnRNb2RlbDogeyByZWFkRW5hYmxlZDogKCkgPT4gMiAvKiBFbmFibGVkUHJvZmlsZSAqLywgcmVhZFByb2ZpbGVFbmFibGVkOiAoKSA9PiB0cnVlLCBzZXRFbmFibGVkOiAoKSA9PiB7IH0sIHJlbW92ZTogKCkgPT4geyB9IH0sXG5cdFx0fSk7XG5cblx0XHRzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRzU2VydmljZSkpO1xuXHRcdGluc3RhU2VydmljZS5zdHViKElQcm9tcHRzU2VydmljZSwgc2VydmljZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpc3RzIGxvY2FsIHByb21wdCBmaWxlcyByZWxhdGl2ZSB0byBhbiBleHBsaWNpdCByb290IGFuZCBpdHMgcGFyZW50IHJlcG9zaXRvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyZW50Um9vdCA9IFVSSS5maWxlKCcvcGFyZW50LXJlcG8nKTtcblx0XHRjb25zdCBleHBsaWNpdFJvb3QgPSBVUkkuam9pblBhdGgocGFyZW50Um9vdCwgJ3BhY2thZ2VzL2V4cGxpY2l0LXJvb3QnKTtcblx0XHRjb25zdCBzaWJsaW5nUm9vdCA9IFVSSS5maWxlKCcvc2libGluZy1yb290Jyk7XG5cdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2UoZXhwbGljaXRSb290LCBzaWJsaW5nUm9vdCkpO1xuXHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0NVU1RPTUlaQVRJT05TX0lOX1BBUkVOVF9SRVBPUywgdHJ1ZSk7XG5cdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHR7IHBhdGg6ICcvcGFyZW50LXJlcG8vLmdpdC9IRUFEJywgY29udGVudHM6IFsncmVmOiByZWZzL2hlYWRzL21haW4nXSB9LFxuXHRcdFx0eyBwYXRoOiAnL3BhcmVudC1yZXBvLy5naXRodWIvcHJvbXB0cy9wYXJlbnQucHJvbXB0Lm1kJywgY29udGVudHM6IFsncGFyZW50J10gfSxcblx0XHRcdHsgcGF0aDogJy9wYXJlbnQtcmVwby9wYWNrYWdlcy9leHBsaWNpdC1yb290Ly5naXRodWIvcHJvbXB0cy9leHBsaWNpdC5wcm9tcHQubWQnLCBjb250ZW50czogWydleHBsaWNpdCddIH0sXG5cdFx0XHR7IHBhdGg6ICcvc2libGluZy1yb290Ly5naXRodWIvcHJvbXB0cy9zaWJsaW5nLnByb21wdC5tZCcsIGNvbnRlbnRzOiBbJ3NpYmxpbmcnXSB9LFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgZmlsZXMgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2UoUHJvbXB0c1R5cGUucHJvbXB0LCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgZXhwbGljaXRSb290KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlsZXMubWFwKGZpbGUgPT4gZmlsZS51cmkucGF0aCksIFtcblx0XHRcdCcvcGFyZW50LXJlcG8vcGFja2FnZXMvZXhwbGljaXQtcm9vdC8uZ2l0aHViL3Byb21wdHMvZXhwbGljaXQucHJvbXB0Lm1kJyxcblx0XHRcdCcvcGFyZW50LXJlcG8vLmdpdGh1Yi9wcm9tcHRzL3BhcmVudC5wcm9tcHQubWQnLFxuXHRcdF0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnSUFnZW50U291cmNlLmlzRXF1YWxzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgdHJ1ZSBmb3IgZXF1aXZhbGVudCBsb2NhbCBzb3VyY2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGVmdDogSUFnZW50U291cmNlID0geyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCB9O1xuXHRcdFx0Y29uc3QgcmlnaHQ6IElBZ2VudFNvdXJjZSA9IHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKElBZ2VudFNvdXJjZS5pc0VxdWFscyhsZWZ0LCByaWdodCksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB0cnVlIGZvciBlcXVpdmFsZW50IGV4dGVuc2lvbiBzb3VyY2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGVmdDogSUFnZW50U291cmNlID0geyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIGV4dGVuc2lvbklkOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignbXMudnNjb2RlJykgfTtcblx0XHRcdGNvbnN0IHJpZ2h0OiBJQWdlbnRTb3VyY2UgPSB7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbiwgZXh0ZW5zaW9uSWQ6IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCdtcy52c2NvZGUnKSB9O1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoSUFnZW50U291cmNlLmlzRXF1YWxzKGxlZnQsIHJpZ2h0KSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZhbHNlIGZvciBkaWZmZXJlbnQgcGx1Z2luIHNvdXJjZSBVUklzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGVmdDogSUFnZW50U291cmNlID0geyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5wbHVnaW4sIHBsdWdpblVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvcGx1Z2luLWEnKSB9O1xuXHRcdFx0Y29uc3QgcmlnaHQ6IElBZ2VudFNvdXJjZSA9IHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UucGx1Z2luLCBwbHVnaW5Vcmk6IFVSSS5maWxlKCcvd29ya3NwYWNlL3BsdWdpbi1iJykgfTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKElBZ2VudFNvdXJjZS5pc0VxdWFscyhsZWZ0LCByaWdodCksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3ZvaWNlIGluc3RydWN0aW9ucycsICgpID0+IHtcblx0XHR0ZXN0KCdjb21iaW5lcyB1c2VyIGFuZCB0cnVzdGVkIHdvcmtzcGFjZSB2b2ljZS5tZCBmaWxlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZScpO1xuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHsgcGF0aDogJy9ob21lL3VzZXIvLmNvcGlsb3Qvdm9pY2UubWQnLCBjb250ZW50czogWydVc2Ugc2hvcnQgcGFyYWdyYXBocy4nXSB9LFxuXHRcdFx0XHR7IHBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvdm9pY2UubWQnLCBjb250ZW50czogWydTcGVsbCB0aGUgcHJvZHVjdCBuYW1lIGFzIENvbnRvc28gREIuJ10gfSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBpbnN0cnVjdGlvbnMgPSBhd2FpdCBzZXJ2aWNlLmdldFZvaWNlSW5zdHJ1Y3Rpb25zKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdHJ1Y3Rpb25zLCAnVXNlIHNob3J0IHBhcmFncmFwaHMuXFxuXFxuU3BlbGwgdGhlIHByb2R1Y3QgbmFtZSBhcyBDb250b3NvIERCLicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhjbHVkZXMgd29ya3NwYWNlIHZvaWNlLm1kIHdoZW4gdGhlIHdvcmtzcGFjZSBpcyB1bnRydXN0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UnKTtcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblx0XHRcdGF3YWl0IHdvcmtzcGFjZVRydXN0U2VydmljZS5zZXRXb3Jrc3BhY2VUcnVzdChmYWxzZSk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0eyBwYXRoOiAnL2hvbWUvdXNlci8uY29waWxvdC92b2ljZS5tZCcsIGNvbnRlbnRzOiBbJ1VzZSBzaG9ydCBwYXJhZ3JhcGhzLiddIH0sXG5cdFx0XHRcdHsgcGF0aDogJy93b3Jrc3BhY2UvLmdpdGh1Yi92b2ljZS5tZCcsIGNvbnRlbnRzOiBbJ1VudHJ1c3RlZCB3b3Jrc3BhY2UgZ3VpZGFuY2UuJ10gfSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBpbnN0cnVjdGlvbnMgPSBhd2FpdCBzZXJ2aWNlLmdldFZvaWNlSW5zdHJ1Y3Rpb25zKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdHJ1Y3Rpb25zLCAnVXNlIHNob3J0IHBhcmFncmFwaHMuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYW5jZWxzIGluLWZsaWdodCB2b2ljZSBpbnN0cnVjdGlvbiByZWFkcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0Y29uc3QgcmVhZFN0YXJ0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRjb25zdCByZWFkRmlsZVN0dWIgPSBzaW5vbi5zdHViKGZpbGVTZXJ2aWNlLCAncmVhZEZpbGUnKS5jYWxsc0Zha2UoYXN5bmMgKF9yZXNvdXJjZSwgX29wdGlvbnMsIHRva2VuKSA9PiB7XG5cdFx0XHRcdHJlYWRTdGFydGVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGxpc3RlbmVyID0gdG9rZW4hLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGluc3RydWN0aW9ucyA9IHNlcnZpY2UuZ2V0Vm9pY2VJbnN0cnVjdGlvbnMoY3RzLnRva2VuKTtcblx0XHRcdFx0YXdhaXQgcmVhZFN0YXJ0ZWQucDtcblx0XHRcdFx0Y3RzLmNhbmNlbCgpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgaW5zdHJ1Y3Rpb25zLCB1bmRlZmluZWQpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0cmVhZEZpbGVTdHViLnJlc3RvcmUoKTtcblx0XHRcdFx0Y3RzLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2RpY3RhdGlvbiBpbnN0cnVjdGlvbnMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnY29tYmluZXMgdXNlciBhbmQgdHJ1c3RlZCB3b3Jrc3BhY2UgZGljdGF0aW9uLm1kIGZpbGVzIHNlcGFyYXRlbHkgZnJvbSB2b2ljZS5tZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZScpO1xuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHsgcGF0aDogJy9ob21lL3VzZXIvLmNvcGlsb3QvZGljdGF0aW9uLm1kJywgY29udGVudHM6IFsnVXNlIHNob3J0IHBhcmFncmFwaHMuJ10gfSxcblx0XHRcdFx0eyBwYXRoOiAnL3dvcmtzcGFjZS8uZ2l0aHViL2RpY3RhdGlvbi5tZCcsIGNvbnRlbnRzOiBbJ1NwZWxsIHRoZSBwcm9kdWN0IG5hbWUgYXMgQ29udG9zbyBEQi4nXSB9LFxuXHRcdFx0XHR7IHBhdGg6ICcvaG9tZS91c2VyLy5jb3BpbG90L3ZvaWNlLm1kJywgY29udGVudHM6IFsnS2VlcCBzcG9rZW4gcmVzcG9uc2VzIGNvbmNpc2UuJ10gfSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBpbnN0cnVjdGlvbnMgPSBhd2FpdCBzZXJ2aWNlLmdldERpY3RhdGlvbkluc3RydWN0aW9ucyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RydWN0aW9ucywgJ1VzZSBzaG9ydCBwYXJhZ3JhcGhzLlxcblxcblNwZWxsIHRoZSBwcm9kdWN0IG5hbWUgYXMgQ29udG9zbyBEQi4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4Y2x1ZGVzIHdvcmtzcGFjZSBkaWN0YXRpb24ubWQgd2hlbiB0aGUgd29ya3NwYWNlIGlzIHVudHJ1c3RlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZScpO1xuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXHRcdFx0YXdhaXQgd29ya3NwYWNlVHJ1c3RTZXJ2aWNlLnNldFdvcmtzcGFjZVRydXN0KGZhbHNlKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7IHBhdGg6ICcvaG9tZS91c2VyLy5jb3BpbG90L2RpY3RhdGlvbi5tZCcsIGNvbnRlbnRzOiBbJ1VzZSBzaG9ydCBwYXJhZ3JhcGhzLiddIH0sXG5cdFx0XHRcdHsgcGF0aDogJy93b3Jrc3BhY2UvLmdpdGh1Yi9kaWN0YXRpb24ubWQnLCBjb250ZW50czogWydVbnRydXN0ZWQgd29ya3NwYWNlIGd1aWRhbmNlLiddIH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgaW5zdHJ1Y3Rpb25zID0gYXdhaXQgc2VydmljZS5nZXREaWN0YXRpb25JbnN0cnVjdGlvbnMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0cnVjdGlvbnMsICdVc2Ugc2hvcnQgcGFyYWdyYXBocy4nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3BhcnNlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2V4cGxpY2l0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAncmVzb2x2ZXMtbmVzdGVkLWZpbGUtcmVmZXJlbmNlcyc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cblx0XHRcdGNvbnN0IHJvb3RGaWxlTmFtZSA9ICdmaWxlMi5wcm9tcHQubWQnO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZpbGVVcmkgPSBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgcm9vdEZpbGVOYW1lKTtcblxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS9maWxlMS5wcm9tcHQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnIyMgU29tZSBIZWFkZXInLFxuXHRcdFx0XHRcdFx0J3NvbWUgY29udGVudHMnLFxuXHRcdFx0XHRcdFx0JyAnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8ke3Jvb3RGaWxlTmFtZX1gLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnUm9vdCBwcm9tcHQgZGVzY3JpcHRpb24uXFwnJyxcblx0XHRcdFx0XHRcdCd0b29sczogW1xcJ215LXRvb2wxXFwnLCAsIHRvb2xdJyxcblx0XHRcdFx0XHRcdCdhZ2VudDogXCJhZ2VudFwiICcsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCcjIyBGaWxlcycsXG5cdFx0XHRcdFx0XHQnXFx0LSB0aGlzIGZpbGUgI2ZpbGU6Zm9sZGVyMS9maWxlMy5wcm9tcHQubWQgJyxcblx0XHRcdFx0XHRcdCdcXHQtIGFsc28gdGhpcyBbZmlsZTQucHJvbXB0Lm1kXSguL2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIvZmlsZTQucHJvbXB0Lm1kKSBwbGVhc2UhJyxcblx0XHRcdFx0XHRcdCcjIyBWYXJzJyxcblx0XHRcdFx0XHRcdCdcXHQtICN0b29sOm15LXRvb2wnLFxuXHRcdFx0XHRcdFx0J1xcdC0gI3Rvb2w6bXktb3RoZXItdG9vbCcsXG5cdFx0XHRcdFx0XHQnICcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9L2ZvbGRlcjEvZmlsZTMucHJvbXB0Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQndG9vbHM6IFsgZmFsc2UsIFxcJ215LXRvb2wxXFwnICwgXScsXG5cdFx0XHRcdFx0XHQnYWdlbnQ6IFxcJ2VkaXRcXCcnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHRcdCdbXSguL3NvbWUtb3RoZXItZm9sZGVyL25vbi1leGlzdGluZy1mb2xkZXIpJyxcblx0XHRcdFx0XHRcdGBcXHQtIHNvbWUgc2VlbWluZ2x5IHJhbmRvbSAjZmlsZToke3Jvb3RGb2xkZXJ9L2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIveWV0QW5vdGhlckZvbGRlclx1RDgzRVx1REQyRC9hbm90aGVyLWZpbGUuaW5zdHJ1Y3Rpb25zLm1kIGNvbnRlbnRzYCxcblx0XHRcdFx0XHRcdCcgc29tZSBtb3JlXFx0IGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS9mb2xkZXIxL3NvbWUtb3RoZXItZm9sZGVyL2ZpbGU0LnByb21wdC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J3Rvb2xzOiBbXFwnbXktdG9vbDFcXCcsIFwibXktdG9vbDJcIiwgdHJ1ZSwgLCBdJyxcblx0XHRcdFx0XHRcdCdzb21ldGhpbmc6IHRydWUnLFxuXHRcdFx0XHRcdFx0J2FnZW50OiBcXCdhc2tcXCdcXHQnLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkZpbGUgNCBzcGxlbmRpZCBkZXNjcmlwdGlvbi5cIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCd0aGlzIGZpbGUgaGFzIGEgbm9uLWV4aXN0aW5nICNmaWxlOi4vc29tZS1ub24tZXhpc3RpbmcvZmlsZS5wcm9tcHQubWRcXHRcXHRyZWZlcmVuY2UnLFxuXHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHRcdCdhbmQgc29tZScsXG5cdFx0XHRcdFx0XHQnIG5vbi1wcm9tcHQgI2ZpbGU6Li9zb21lLW5vbi1wcm9tcHQtZmlsZS5tZFxcdFxcdCBcXHRbXSguLi8uLi9mb2xkZXIxLylcXHQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS9mb2xkZXIxL3NvbWUtb3RoZXItZm9sZGVyL2ZpbGUudHh0YCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiTm9uLXByb21wdCBmaWxlIGRlc2NyaXB0aW9uXCIuJyxcblx0XHRcdFx0XHRcdCd0b29sczogW1wibXktdG9vbC0yNFwiXScsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vZm9sZGVyMS9zb21lLW90aGVyLWZvbGRlci95ZXRBbm90aGVyRm9sZGVyXHVEODNFXHVERDJEL2Fub3RoZXItZmlsZS5pbnN0cnVjdGlvbnMubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBbm90aGVyIGZpbGUgZGVzY3JpcHRpb24uXCInLFxuXHRcdFx0XHRcdFx0J3Rvb2xzOiBbXFwnbXktdG9vbDNcXCcsIFwibXktdG9vbDJcIiBdJyxcblx0XHRcdFx0XHRcdCdhcHBseVRvOiBcIioqLyoudHN4XCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRgW10oJHtyb290Rm9sZGVyfS9mb2xkZXIxL3NvbWUtb3RoZXItZm9sZGVyKWAsXG5cdFx0XHRcdFx0XHQnYW5vdGhlci1maWxlLmluc3RydWN0aW9ucy5tZCBjb250ZW50c1xcdCBbI2ZpbGU6ZmlsZS50eHRdKC4uL2ZpbGUudHh0KScsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9L2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIveWV0QW5vdGhlckZvbGRlclx1RDgzRVx1REQyRC9vbmVfbW9yZV9maWxlX2p1c3RfaW5fY2FzZS5wcm9tcHQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29uZV9tb3JlX2ZpbGVfanVzdF9pbl9jYXNlLnByb21wdC5tZCBjb250ZW50cyddLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGZpbGUzID0gVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICdmb2xkZXIxL2ZpbGUzLnByb21wdC5tZCcpO1xuXHRcdFx0Y29uc3QgZmlsZTQgPSBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJ2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIvZmlsZTQucHJvbXB0Lm1kJyk7XG5cdFx0XHRjb25zdCBzb21lT3RoZXJGb2xkZXIgPSBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy9mb2xkZXIxL3NvbWUtb3RoZXItZm9sZGVyJyk7XG5cdFx0XHRjb25zdCBzb21lT3RoZXJGb2xkZXJGaWxlID0gVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcvZm9sZGVyMS9zb21lLW90aGVyLWZvbGRlci9maWxlLnR4dCcpO1xuXHRcdFx0Y29uc3Qgbm9uRXhpc3RpbmdGb2xkZXIgPSBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJ2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIvbm9uLWV4aXN0aW5nLWZvbGRlcicpO1xuXHRcdFx0Y29uc3QgeWV0QW5vdGhlckZpbGUgPSBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJ2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIveWV0QW5vdGhlckZvbGRlclx1RDgzRVx1REQyRC9hbm90aGVyLWZpbGUuaW5zdHJ1Y3Rpb25zLm1kJyk7XG5cblxuXHRcdFx0Y29uc3QgcmVzdWx0MSA9IGF3YWl0IHNlcnZpY2UucGFyc2VOZXcocm9vdEZpbGVVcmksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQxLnVyaSwgcm9vdEZpbGVVcmkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQxLmhlYWRlcj8uZGVzY3JpcHRpb24sICdSb290IHByb21wdCBkZXNjcmlwdGlvbi4nKTtcblx0XHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0MS5oZWFkZXI/LnRvb2xzLCBbJ215LXRvb2wxJywgJ3Rvb2wnXSk7XG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdDEuaGVhZGVyPy5hZ2VudCwgJ2FnZW50Jyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0MS5ib2R5KTtcblx0XHRcdGFzc2VydC5kZWVwRXF1YWwoXG5cdFx0XHRcdHJlc3VsdDEuYm9keS5maWxlUmVmZXJlbmNlcy5tYXAociA9PiByZXN1bHQxLmJvZHk/LnJlc29sdmVGaWxlUGF0aChyLmNvbnRlbnQpKSxcblx0XHRcdFx0W2ZpbGUzLCBmaWxlNF0sXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChcblx0XHRcdFx0cmVzdWx0MS5ib2R5LnZhcmlhYmxlUmVmZXJlbmNlcyxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgbmFtZTogJ215LXRvb2wnLCByYW5nZTogbmV3IFJhbmdlKDEwLCAxMCwgMTAsIDE3KSwgb2Zmc2V0OiAyNDAsIGZ1bGxMZW5ndGg6IDEzIH0sXG5cdFx0XHRcdFx0eyBuYW1lOiAnbXktb3RoZXItdG9vbCcsIHJhbmdlOiBuZXcgUmFuZ2UoMTEsIDEwLCAxMSwgMjMpLCBvZmZzZXQ6IDI1NywgZnVsbExlbmd0aDogMTkgfSxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0MiA9IGF3YWl0IHNlcnZpY2UucGFyc2VOZXcoZmlsZTMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQyLnVyaSwgZmlsZTMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQyLmhlYWRlcj8uYWdlbnQsICdlZGl0Jyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0Mi5ib2R5KTtcblx0XHRcdGFzc2VydC5kZWVwRXF1YWwoXG5cdFx0XHRcdHJlc3VsdDIuYm9keS5maWxlUmVmZXJlbmNlcy5tYXAociA9PiByZXN1bHQyLmJvZHk/LnJlc29sdmVGaWxlUGF0aChyLmNvbnRlbnQpKSxcblx0XHRcdFx0W25vbkV4aXN0aW5nRm9sZGVyLCB5ZXRBbm90aGVyRmlsZV0sXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQzID0gYXdhaXQgc2VydmljZS5wYXJzZU5ldyh5ZXRBbm90aGVyRmlsZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdDMudXJpLCB5ZXRBbm90aGVyRmlsZSk7XG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdDMuaGVhZGVyPy5kZXNjcmlwdGlvbiwgJ0Fub3RoZXIgZmlsZSBkZXNjcmlwdGlvbi4nKTtcblx0XHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0My5oZWFkZXI/LmFwcGx5VG8sICcqKi8qLnRzeCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdDMuYm9keSk7XG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKFxuXHRcdFx0XHRyZXN1bHQzLmJvZHkuZmlsZVJlZmVyZW5jZXMubWFwKHIgPT4gcmVzdWx0My5ib2R5Py5yZXNvbHZlRmlsZVBhdGgoci5jb250ZW50KSksXG5cdFx0XHRcdFtzb21lT3RoZXJGb2xkZXIsIHNvbWVPdGhlckZvbGRlckZpbGVdLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0My5ib2R5LnZhcmlhYmxlUmVmZXJlbmNlcywgW10pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQ0ID0gYXdhaXQgc2VydmljZS5wYXJzZU5ldyhmaWxlNCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdDQudXJpLCBmaWxlNCk7XG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdDQuaGVhZGVyPy5kZXNjcmlwdGlvbiwgJ0ZpbGUgNCBzcGxlbmRpZCBkZXNjcmlwdGlvbi4nKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQ0LmJvZHkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChcblx0XHRcdFx0cmVzdWx0NC5ib2R5LmZpbGVSZWZlcmVuY2VzLm1hcChyID0+IHJlc3VsdDQuYm9keT8ucmVzb2x2ZUZpbGVQYXRoKHIuY29udGVudCkpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0VVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcvZm9sZGVyMS9zb21lLW90aGVyLWZvbGRlci9zb21lLW5vbi1leGlzdGluZy9maWxlLnByb21wdC5tZCcpLFxuXHRcdFx0XHRcdFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnL2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIvc29tZS1ub24tcHJvbXB0LWZpbGUubWQnKSxcblx0XHRcdFx0XHRVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy9mb2xkZXIxLycpLFxuXHRcdFx0XHRdLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0NC5ib2R5LnZhcmlhYmxlUmVmZXJlbmNlcywgW10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZmluZEluc3RydWN0aW9uRmlsZXNGb3InLCAoKSA9PiB7XG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0c2lub24ucmVzdG9yZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmluZHMgY29ycmVjdCBpbnN0cnVjdGlvbiBmaWxlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ2ZpbmRzLWluc3RydWN0aW9uLWZpbGVzJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRjb25zdCB1c2VyUHJvbXB0c0ZvbGRlck5hbWUgPSAnL3RtcC91c2VyLWRhdGEvcHJvbXB0cyc7XG5cdFx0XHRjb25zdCB1c2VyUHJvbXB0c0ZvbGRlclVyaSA9IFVSSS5maWxlKHVzZXJQcm9tcHRzRm9sZGVyTmFtZSk7XG5cblx0XHRcdHNpbm9uLnN0dWIoc2VydmljZSwgJ2xpc3RQcm9tcHRGaWxlcycpXG5cdFx0XHRcdC5yZXR1cm5zKFByb21pc2UucmVzb2x2ZShbXG5cdFx0XHRcdFx0Ly8gbG9jYWwgaW5zdHJ1Y3Rpb25zXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvcHJvbXB0cy9maWxlMS5pbnN0cnVjdGlvbnMubWQnKSxcblx0XHRcdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLFxuXHRcdFx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvcHJvbXB0cy9maWxlMi5pbnN0cnVjdGlvbnMubWQnKSxcblx0XHRcdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLFxuXHRcdFx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvcHJvbXB0cy9maWxlMy5pbnN0cnVjdGlvbnMubWQnKSxcblx0XHRcdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLFxuXHRcdFx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvcHJvbXB0cy9maWxlNC5pbnN0cnVjdGlvbnMubWQnKSxcblx0XHRcdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLFxuXHRcdFx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Ly8gdXNlciBpbnN0cnVjdGlvbnNcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aCh1c2VyUHJvbXB0c0ZvbGRlclVyaSwgJ2ZpbGUxMC5pbnN0cnVjdGlvbnMubWQnKSxcblx0XHRcdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsXG5cdFx0XHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aCh1c2VyUHJvbXB0c0ZvbGRlclVyaSwgJ2ZpbGUxMS5pbnN0cnVjdGlvbnMubWQnKSxcblx0XHRcdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsXG5cdFx0XHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSkpO1xuXG5cdFx0XHQvLyBtb2NrIGN1cnJlbnQgd29ya3NwYWNlIGZpbGUgc3RydWN0dXJlXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9L2ZpbGUxLnByb21wdC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCcjIyBTb21lIEhlYWRlcicsXG5cdFx0XHRcdFx0XHQnc29tZSBjb250ZW50cycsXG5cdFx0XHRcdFx0XHQnICcsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9wcm9tcHRzL2ZpbGUxLmluc3RydWN0aW9ucy5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdJbnN0cnVjdGlvbnMgZmlsZSAxLlxcJycsXG5cdFx0XHRcdFx0XHQnYXBwbHlUbzogXCIqKi8qLnRzeFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NvbWUgaW5zdHJ1Y3Rpb25zIDEgY29udGVudHMuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3Byb21wdHMvZmlsZTIuaW5zdHJ1Y3Rpb25zLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0luc3RydWN0aW9ucyBmaWxlIDIuXFwnJyxcblx0XHRcdFx0XHRcdCdhcHBseVRvOiBcIioqL2ZvbGRlcjEvKi50c3hcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdTb21lIGluc3RydWN0aW9ucyAyIGNvbnRlbnRzLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9wcm9tcHRzL2ZpbGUzLmluc3RydWN0aW9ucy5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdJbnN0cnVjdGlvbnMgZmlsZSAzLlxcJycsXG5cdFx0XHRcdFx0XHQnYXBwbHlUbzogXCIqKi9mb2xkZXIyLyoudHN4XCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnU29tZSBpbnN0cnVjdGlvbnMgMyBjb250ZW50cy4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvcHJvbXB0cy9maWxlNC5pbnN0cnVjdGlvbnMubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnSW5zdHJ1Y3Rpb25zIGZpbGUgNC5cXCcnLFxuXHRcdFx0XHRcdFx0J2FwcGx5VG86IFwic3JjL2J1aWxkLyoudHN4XCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnU29tZSBpbnN0cnVjdGlvbnMgNCBjb250ZW50cy4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvcHJvbXB0cy9maWxlNS5wcm9tcHQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnUHJvbXB0IGZpbGUgNS5cXCcnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnU29tZSBwcm9tcHQgNSBjb250ZW50cy4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9L2ZvbGRlcjEvbWFpbi50c3hgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnY29uc29sZS5sb2coXCJIYWFsb3UhXCIpJ1xuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIG1vY2sgdXNlciBkYXRhIGluc3RydWN0aW9uc1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHt1c2VyUHJvbXB0c0ZvbGRlck5hbWV9L2ZpbGUxMC5pbnN0cnVjdGlvbnMubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnSW5zdHJ1Y3Rpb25zIGZpbGUgMTAuXFwnJyxcblx0XHRcdFx0XHRcdCdhcHBseVRvOiBcIioqL2ZvbGRlcjEvKi50c3hcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdTb21lIGluc3RydWN0aW9ucyAxMCBjb250ZW50cy4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3VzZXJQcm9tcHRzRm9sZGVyTmFtZX0vZmlsZTExLmluc3RydWN0aW9ucy5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdJbnN0cnVjdGlvbnMgZmlsZSAxMS5cXCcnLFxuXHRcdFx0XHRcdFx0J2FwcGx5VG86IFwiKiovZm9sZGVyMS8qLnB5XCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnU29tZSBpbnN0cnVjdGlvbnMgMTEgY29udGVudHMuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHt1c2VyUHJvbXB0c0ZvbGRlck5hbWV9L2ZpbGUxMi5wcm9tcHQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnUHJvbXB0IGZpbGUgMTIuXFwnJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NvbWUgcHJvbXB0IDEyIGNvbnRlbnRzLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgaW5zdHJ1Y3Rpb25GaWxlcyA9IGF3YWl0IHNlcnZpY2UuZ2V0SW5zdHJ1Y3Rpb25GaWxlcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IGNvbnRleHRDb21wdXRlciA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb21wdXRlQXV0b21hdGljSW5zdHJ1Y3Rpb25zLCBDaGF0TW9kZUtpbmQuQWdlbnQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAnbG9jYWwnKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSB7XG5cdFx0XHRcdGZpbGVzOiBuZXcgUmVzb3VyY2VTZXQoW1xuXHRcdFx0XHRcdFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnZm9sZGVyMS9tYWluLnRzeCcpLFxuXHRcdFx0XHRdKSxcblx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiBuZXcgUmVzb3VyY2VTZXQoKSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBuZXcgQ2hhdFJlcXVlc3RWYXJpYWJsZVNldCgpO1xuXG5cdFx0XHRhd2FpdCBjb250ZXh0Q29tcHV0ZXIuYWRkQXBwbHlpbmdJbnN0cnVjdGlvbnMoaW5zdHJ1Y3Rpb25GaWxlcywgY29udGV4dCwgcmVzdWx0LCBuZXdJbnN0cnVjdGlvbnNDb2xsZWN0aW9uRXZlbnQoKSwgbmV3SW5zdHJ1Y3Rpb25zQ29sbGVjdGlvbkRlYnVnSW5mbygpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cmVzdWx0LmFzQXJyYXkoKS5tYXAoaSA9PiBpc1Byb21wdEZpbGVWYXJpYWJsZUVudHJ5KGkpID8gaS52YWx1ZS5wYXRoIDogdW5kZWZpbmVkKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdC8vIGxvY2FsIGluc3RydWN0aW9uc1xuXHRcdFx0XHRcdFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9wcm9tcHRzL2ZpbGUxLmluc3RydWN0aW9ucy5tZCcpLnBhdGgsXG5cdFx0XHRcdFx0VVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL3Byb21wdHMvZmlsZTIuaW5zdHJ1Y3Rpb25zLm1kJykucGF0aCxcblx0XHRcdFx0XHQvLyB1c2VyIGluc3RydWN0aW9uc1xuXHRcdFx0XHRcdFVSSS5qb2luUGF0aCh1c2VyUHJvbXB0c0ZvbGRlclVyaSwgJ2ZpbGUxMC5pbnN0cnVjdGlvbnMubWQnKS5wYXRoLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHQnTXVzdCBmaW5kIGNvcnJlY3QgaW5zdHJ1Y3Rpb24gZmlsZXMuJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBoYXZlIGR1cGxpY2F0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdmaW5kcy1pbnN0cnVjdGlvbi1maWxlcy13aXRob3V0LWR1cGxpY2F0ZXMnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdGNvbnN0IHVzZXJQcm9tcHRzRm9sZGVyTmFtZSA9ICcvdG1wL3VzZXItZGF0YS9wcm9tcHRzJztcblx0XHRcdGNvbnN0IHVzZXJQcm9tcHRzRm9sZGVyVXJpID0gVVJJLmZpbGUodXNlclByb21wdHNGb2xkZXJOYW1lKTtcblxuXHRcdFx0c2lub24uc3R1YihzZXJ2aWNlLCAnbGlzdFByb21wdEZpbGVzJylcblx0XHRcdFx0LnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKFtcblx0XHRcdFx0XHQvLyBsb2NhbCBpbnN0cnVjdGlvbnNcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9wcm9tcHRzL2ZpbGUxLmluc3RydWN0aW9ucy5tZCcpLFxuXHRcdFx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9wcm9tcHRzL2ZpbGUyLmluc3RydWN0aW9ucy5tZCcpLFxuXHRcdFx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9wcm9tcHRzL2ZpbGUzLmluc3RydWN0aW9ucy5tZCcpLFxuXHRcdFx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9wcm9tcHRzL2ZpbGU0Lmluc3RydWN0aW9ucy5tZCcpLFxuXHRcdFx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQvLyB1c2VyIGluc3RydWN0aW9uc1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHVyaTogVVJJLmpvaW5QYXRoKHVzZXJQcm9tcHRzRm9sZGVyVXJpLCAnZmlsZTEwLmluc3RydWN0aW9ucy5tZCcpLFxuXHRcdFx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlcixcblx0XHRcdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHVyaTogVVJJLmpvaW5QYXRoKHVzZXJQcm9tcHRzRm9sZGVyVXJpLCAnZmlsZTExLmluc3RydWN0aW9ucy5tZCcpLFxuXHRcdFx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlcixcblx0XHRcdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdKSk7XG5cblx0XHRcdC8vIG1vY2sgY3VycmVudCB3b3Jrc3BhY2UgZmlsZSBzdHJ1Y3R1cmVcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vZmlsZTEucHJvbXB0Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0JyMjIFNvbWUgSGVhZGVyJyxcblx0XHRcdFx0XHRcdCdzb21lIGNvbnRlbnRzJyxcblx0XHRcdFx0XHRcdCcgJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3Byb21wdHMvZmlsZTEuaW5zdHJ1Y3Rpb25zLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0luc3RydWN0aW9ucyBmaWxlIDEuXFwnJyxcblx0XHRcdFx0XHRcdCdhcHBseVRvOiBcIioqLyoudHN4XCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnU29tZSBpbnN0cnVjdGlvbnMgMSBjb250ZW50cy4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvcHJvbXB0cy9maWxlMi5pbnN0cnVjdGlvbnMubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnSW5zdHJ1Y3Rpb25zIGZpbGUgMi5cXCcnLFxuXHRcdFx0XHRcdFx0J2FwcGx5VG86IFwiKiovZm9sZGVyMS8qLnRzeFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NvbWUgaW5zdHJ1Y3Rpb25zIDIgY29udGVudHMuIFtdKC4vZmlsZTEuaW5zdHJ1Y3Rpb25zLm1kKScsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9wcm9tcHRzL2ZpbGUzLmluc3RydWN0aW9ucy5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdJbnN0cnVjdGlvbnMgZmlsZSAzLlxcJycsXG5cdFx0XHRcdFx0XHQnYXBwbHlUbzogXCIqKi9mb2xkZXIyLyoudHN4XCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnU29tZSBpbnN0cnVjdGlvbnMgMyBjb250ZW50cy4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvcHJvbXB0cy9maWxlNC5pbnN0cnVjdGlvbnMubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnSW5zdHJ1Y3Rpb25zIGZpbGUgNC5cXCcnLFxuXHRcdFx0XHRcdFx0J2FwcGx5VG86IFwic3JjL2J1aWxkLyoudHN4XCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnW10oLi9maWxlMy5pbnN0cnVjdGlvbnMubWQpIFNvbWUgaW5zdHJ1Y3Rpb25zIDQgY29udGVudHMuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3Byb21wdHMvZmlsZTUucHJvbXB0Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ1Byb21wdCBmaWxlIDUuXFwnJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NvbWUgcHJvbXB0IDUgY29udGVudHMuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS9mb2xkZXIxL21haW4udHN4YCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0J2NvbnNvbGUubG9nKFwiSGFhbG91IVwiKSdcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBtb2NrIHVzZXIgZGF0YSBpbnN0cnVjdGlvbnNcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7dXNlclByb21wdHNGb2xkZXJOYW1lfS9maWxlMTAuaW5zdHJ1Y3Rpb25zLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0luc3RydWN0aW9ucyBmaWxlIDEwLlxcJycsXG5cdFx0XHRcdFx0XHQnYXBwbHlUbzogXCIqKi9mb2xkZXIxLyoudHN4XCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnU29tZSBpbnN0cnVjdGlvbnMgMTAgY29udGVudHMuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHt1c2VyUHJvbXB0c0ZvbGRlck5hbWV9L2ZpbGUxMS5pbnN0cnVjdGlvbnMubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnSW5zdHJ1Y3Rpb25zIGZpbGUgMTEuXFwnJyxcblx0XHRcdFx0XHRcdCdhcHBseVRvOiBcIioqL2ZvbGRlcjEvKi5weVwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NvbWUgaW5zdHJ1Y3Rpb25zIDExIGNvbnRlbnRzLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7dXNlclByb21wdHNGb2xkZXJOYW1lfS9maWxlMTIucHJvbXB0Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ1Byb21wdCBmaWxlIDEyLlxcJycsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdTb21lIHByb21wdCAxMiBjb250ZW50cy4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGluc3RydWN0aW9uRmlsZXMgPSBhd2FpdCBzZXJ2aWNlLmdldEluc3RydWN0aW9uRmlsZXMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCBjb250ZXh0Q29tcHV0ZXIgPSBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29tcHV0ZUF1dG9tYXRpY0luc3RydWN0aW9ucywgQ2hhdE1vZGVLaW5kLkFnZW50LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ2xvY2FsJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0ge1xuXHRcdFx0XHRmaWxlczogbmV3IFJlc291cmNlU2V0KFtcblx0XHRcdFx0XHRVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJ2ZvbGRlcjEvbWFpbi50c3gnKSxcblx0XHRcdFx0XHRVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJ2ZvbGRlcjEvaW5kZXgudHN4JyksXG5cdFx0XHRcdFx0VVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICdmb2xkZXIxL2NvbnN0YW50cy50c3gnKSxcblx0XHRcdFx0XSksXG5cdFx0XHRcdGluc3RydWN0aW9uczogbmV3IFJlc291cmNlU2V0KCksXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBuZXcgQ2hhdFJlcXVlc3RWYXJpYWJsZVNldCgpO1xuXHRcdFx0YXdhaXQgY29udGV4dENvbXB1dGVyLmFkZEFwcGx5aW5nSW5zdHJ1Y3Rpb25zKGluc3RydWN0aW9uRmlsZXMsIGNvbnRleHQsIHJlc3VsdCwgbmV3SW5zdHJ1Y3Rpb25zQ29sbGVjdGlvbkV2ZW50KCksIG5ld0luc3RydWN0aW9uc0NvbGxlY3Rpb25EZWJ1Z0luZm8oKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlc3VsdC5hc0FycmF5KCkubWFwKGkgPT4gaXNQcm9tcHRGaWxlVmFyaWFibGVFbnRyeShpKSA/IGkudmFsdWUucGF0aCA6IHVuZGVmaW5lZCksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQvLyBsb2NhbCBpbnN0cnVjdGlvbnNcblx0XHRcdFx0XHRVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvcHJvbXB0cy9maWxlMS5pbnN0cnVjdGlvbnMubWQnKS5wYXRoLFxuXHRcdFx0XHRcdFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9wcm9tcHRzL2ZpbGUyLmluc3RydWN0aW9ucy5tZCcpLnBhdGgsXG5cdFx0XHRcdFx0Ly8gdXNlciBpbnN0cnVjdGlvbnNcblx0XHRcdFx0XHRVUkkuam9pblBhdGgodXNlclByb21wdHNGb2xkZXJVcmksICdmaWxlMTAuaW5zdHJ1Y3Rpb25zLm1kJykucGF0aCxcblx0XHRcdFx0XSxcblx0XHRcdFx0J011c3QgZmluZCBjb3JyZWN0IGluc3RydWN0aW9uIGZpbGVzLicsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29waWxvdC1pbnN0cnVjdGlvbnMgYW5kIEFHRU5UUy5tZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLWFuZC1hZ2VudHMnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdC8vIG1vY2sgY3VycmVudCB3b3Jrc3BhY2UgZmlsZSBzdHJ1Y3R1cmVcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vY29kZXN0eWxlLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0J0NhbiB5b3Ugc2VlIHRoaXM/Jyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS9BR0VOVFMubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnV2hhdCBhYm91dCB0aGlzPycsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vUkVBRE1FLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0J1RoYXRzIG15IHByb2plY3Q/Jyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0J0JlIG5pY2UgYW5kIGZyaWVuZGx5LiBBbHNvIGxvb2sgYXQgaW5zdHJ1Y3Rpb25zIGF0ICNmaWxlOi4uL2NvZGVzdHlsZS5tZCBhbmQgW21vcmUtY29kZXN0eWxlLm1kXSguL21vcmUtY29kZXN0eWxlLm1kKS4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvbW9yZS1jb2Rlc3R5bGUubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnSSBsaWtlIGl0IGNsZWFuLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vZm9sZGVyMS9BR0VOVFMubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnQW4gQUdFTlRTLm1kIGZpbGUgaW4gYW5vdGhlciByZXBvJ1xuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cblxuXHRcdFx0Y29uc3QgY29udGV4dENvbXB1dGVyID0gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbXB1dGVBdXRvbWF0aWNJbnN0cnVjdGlvbnMsIENoYXRNb2RlS2luZC5BZ2VudCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsICdsb2NhbCcpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IG5ldyBDaGF0UmVxdWVzdFZhcmlhYmxlU2V0KCk7XG5cdFx0XHRjb250ZXh0LmFkZCh0b0ZpbGVWYXJpYWJsZUVudHJ5KFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnUkVBRE1FLm1kJykpKTtcblxuXHRcdFx0YXdhaXQgY29udGV4dENvbXB1dGVyLmNvbGxlY3QoY29udGV4dCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGNvbnRleHQuYXNBcnJheSgpLm1hcChpID0+IGlzUHJvbXB0RmlsZVZhcmlhYmxlRW50cnkoaSkgPyBpLnZhbHVlLnBhdGggOiB1bmRlZmluZWQpLmZpbHRlcihlID0+ICEhZSkuc29ydCgpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0VVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJykucGF0aCxcblx0XHRcdFx0XHRVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvbW9yZS1jb2Rlc3R5bGUubWQnKS5wYXRoLFxuXHRcdFx0XHRcdFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnQUdFTlRTLm1kJykucGF0aCxcblx0XHRcdFx0XHRVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJ2NvZGVzdHlsZS5tZCcpLnBhdGgsXG5cdFx0XHRcdF0uc29ydCgpLFxuXHRcdFx0XHQnTXVzdCBmaW5kIGNvcnJlY3QgaW5zdHJ1Y3Rpb24gZmlsZXMuJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHBvc2VzIG9uRGlkQ2hhbmdlQWdlbnRJbnN0cnVjdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gc2VydmljZS5vbkRpZENoYW5nZUFnZW50SW5zdHJ1Y3Rpb25zKCgpID0+IHsgfSk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRDdXN0b21BZ2VudHMnLCAoKSA9PiB7XG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0c2lub24ucmVzdG9yZSgpO1xuXHRcdH0pO1xuXG5cblx0XHR0ZXN0KCdoZWFkZXIgd2l0aCBoYW5kT2ZmcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ2N1c3RvbS1hZ2VudHMtd2l0aC1oYW5kb2Zmcyc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL2FnZW50cy9hZ2VudDEuYWdlbnQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnQWdlbnQgZmlsZSAxLlxcJycsXG5cdFx0XHRcdFx0XHQnaGFuZG9mZnM6IFsgeyBhZ2VudDogXCJFZGl0XCIsIGxhYmVsOiBcIkRvIGl0XCIsIHByb21wdDogXCJEbyBpdCBub3dcIiB9IF0nLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gKGF3YWl0IHNlcnZpY2UuZ2V0Q3VzdG9tQWdlbnRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpKS5tYXAoYWdlbnQgPT4gKHsgLi4uYWdlbnQsIHVyaTogVVJJLmZyb20oYWdlbnQudXJpKSB9KSk7XG5cdFx0XHRjb25zdCBleHBlY3RlZDogSUN1c3RvbUFnZW50W10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL2FnZW50cy9hZ2VudDEuYWdlbnQubWQnKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdG5hbWU6ICdhZ2VudDEnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnQWdlbnQgZmlsZSAxLicsXG5cdFx0XHRcdFx0aGFuZE9mZnM6IFt7IGFnZW50OiAnRWRpdCcsIGxhYmVsOiAnRG8gaXQnLCBwcm9tcHQ6ICdEbyBpdCBub3cnIH1dLFxuXHRcdFx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiAnJyxcblx0XHRcdFx0XHRcdHRvb2xSZWZlcmVuY2VzOiBbXSxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG1vZGVsOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0YXJndW1lbnRIaW50OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dG9vbHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0YXJnZXQ6IFRhcmdldC5VbmRlZmluZWQsXG5cdFx0XHRcdFx0dmlzaWJpbGl0eTogeyB1c2VySW52b2NhYmxlOiB0cnVlLCBhZ2VudEludm9jYWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdGFnZW50czogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGhvb2tzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c2Vzc2lvblR5cGVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvYWdlbnRzL2FnZW50MS5hZ2VudC5tZCcpLFxuXHRcdFx0XHRcdHNvdXJjZTogeyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCB9LFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKFxuXHRcdFx0XHRyZXN1bHQsXG5cdFx0XHRcdGV4cGVjdGVkLFxuXHRcdFx0XHQnTXVzdCBnZXQgY3VzdG9tIGFnZW50cy4nLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2JvZHkgd2l0aCB0b29sIHJlZmVyZW5jZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdjdXN0b20tYWdlbnRzJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHQvLyBtb2NrIGN1cnJlbnQgd29ya3NwYWNlIGZpbGUgc3RydWN0dXJlXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvYWdlbnRzL2FnZW50MS5hZ2VudC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdBZ2VudCBmaWxlIDEuXFwnJyxcblx0XHRcdFx0XHRcdCd0b29sczogWyB0b29sMSwgdG9vbDIgXScsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdEbyBpdCB3aXRoICN0b29sOnRvb2wxJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL2FnZW50cy9hZ2VudDIuYWdlbnQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnRmlyc3QgdXNlICN0b29sOnRvb2wyXFxuVGhlbiB1c2UgI3Rvb2w6dG9vbDEnLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IChhd2FpdCBzZXJ2aWNlLmdldEN1c3RvbUFnZW50cyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkubWFwKGFnZW50ID0+ICh7IC4uLmFnZW50LCB1cmk6IFVSSS5mcm9tKGFnZW50LnVyaSkgfSkpO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWQ6IElDdXN0b21BZ2VudFtdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9hZ2VudHMvYWdlbnQxLmFnZW50Lm1kJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRuYW1lOiAnYWdlbnQxJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0FnZW50IGZpbGUgMS4nLFxuXHRcdFx0XHRcdHRvb2xzOiBbJ3Rvb2wxJywgJ3Rvb2wyJ10sXG5cdFx0XHRcdFx0YWdlbnRJbnN0cnVjdGlvbnM6IHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6ICdEbyBpdCB3aXRoICN0b29sOnRvb2wxJyxcblx0XHRcdFx0XHRcdHRvb2xSZWZlcmVuY2VzOiBbeyBuYW1lOiAndG9vbDEnLCByYW5nZTogeyBzdGFydDogMTEsIGVuZEV4Y2x1c2l2ZTogMjIgfSB9XSxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGhhbmRPZmZzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kZWw6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRhcmd1bWVudEhpbnQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0YXJnZXQ6IFRhcmdldC5VbmRlZmluZWQsXG5cdFx0XHRcdFx0dmlzaWJpbGl0eTogeyB1c2VySW52b2NhYmxlOiB0cnVlLCBhZ2VudEludm9jYWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdGFnZW50czogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGhvb2tzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c2Vzc2lvblR5cGVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvYWdlbnRzL2FnZW50MS5hZ2VudC5tZCcpLFxuXHRcdFx0XHRcdHNvdXJjZTogeyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCB9LFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL2FnZW50cy9hZ2VudDIuYWdlbnQubWQnKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdG5hbWU6ICdhZ2VudDInLFxuXHRcdFx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiAnRmlyc3QgdXNlICN0b29sOnRvb2wyXFxuVGhlbiB1c2UgI3Rvb2w6dG9vbDEnLFxuXHRcdFx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IFtcblx0XHRcdFx0XHRcdFx0eyBuYW1lOiAndG9vbDEnLCByYW5nZTogeyBzdGFydDogMzEsIGVuZEV4Y2x1c2l2ZTogNDIgfSB9LFxuXHRcdFx0XHRcdFx0XHR7IG5hbWU6ICd0b29sMicsIHJhbmdlOiB7IHN0YXJ0OiAxMCwgZW5kRXhjbHVzaXZlOiAyMSB9IH1cblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRtZXRhZGF0YTogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRob29rczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNlc3Npb25UeXBlczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVyaTogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL2FnZW50cy9hZ2VudDIuYWdlbnQubWQnKSxcblx0XHRcdFx0XHRzb3VyY2U6IHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfSxcblx0XHRcdFx0XHR0YXJnZXQ6IFRhcmdldC5VbmRlZmluZWQsXG5cdFx0XHRcdFx0dmlzaWJpbGl0eTogeyB1c2VySW52b2NhYmxlOiB0cnVlLCBhZ2VudEludm9jYWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdH1cblx0XHRcdF07XG5cblx0XHRcdGFzc2VydC5kZWVwRXF1YWwoXG5cdFx0XHRcdHJlc3VsdCxcblx0XHRcdFx0ZXhwZWN0ZWQsXG5cdFx0XHRcdCdNdXN0IGdldCBjdXN0b20gYWdlbnRzLicsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGVhZGVyIHdpdGggYXJndW1lbnRIaW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnY3VzdG9tLWFnZW50cy13aXRoLWFyZ3VtZW50LWhpbnQnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9hZ2VudHMvYWdlbnQxLmFnZW50Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0NvZGUgcmV2aWV3IGFnZW50LlxcJycsXG5cdFx0XHRcdFx0XHQnYXJndW1lbnQtaGludDogXFwnUHJvdmlkZSBmaWxlIHBhdGggb3IgY29kZSBzbmlwcGV0IHRvIHJldmlld1xcJycsXG5cdFx0XHRcdFx0XHQndG9vbHM6IFsgY29kZS1hbmFseXplciwgbGludGVyIF0nLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSSB3aWxsIGhlbHAgcmV2aWV3IHlvdXIgY29kZSBmb3IgYmVzdCBwcmFjdGljZXMuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL2FnZW50cy9hZ2VudDIuYWdlbnQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnRG9jdW1lbnRhdGlvbiBnZW5lcmF0b3IuXFwnJyxcblx0XHRcdFx0XHRcdCdhcmd1bWVudC1oaW50OiBcXCdTcGVjaWZ5IGZ1bmN0aW9uIG9yIGNsYXNzIG5hbWUgdG8gZG9jdW1lbnRcXCcnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSSBnZW5lcmF0ZSBjb21wcmVoZW5zaXZlIGRvY3VtZW50YXRpb24uJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSAoYXdhaXQgc2VydmljZS5nZXRDdXN0b21BZ2VudHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLm1hcChhZ2VudCA9PiAoeyAuLi5hZ2VudCwgdXJpOiBVUkkuZnJvbShhZ2VudC51cmkpIH0pKTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkOiBJQ3VzdG9tQWdlbnRbXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvYWdlbnRzL2FnZW50MS5hZ2VudC5tZCcpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0bmFtZTogJ2FnZW50MScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdDb2RlIHJldmlldyBhZ2VudC4nLFxuXHRcdFx0XHRcdGFyZ3VtZW50SGludDogJ1Byb3ZpZGUgZmlsZSBwYXRoIG9yIGNvZGUgc25pcHBldCB0byByZXZpZXcnLFxuXHRcdFx0XHRcdHRvb2xzOiBbJ2NvZGUtYW5hbHl6ZXInLCAnbGludGVyJ10sXG5cdFx0XHRcdFx0YWdlbnRJbnN0cnVjdGlvbnM6IHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6ICdJIHdpbGwgaGVscCByZXZpZXcgeW91ciBjb2RlIGZvciBiZXN0IHByYWN0aWNlcy4nLFxuXHRcdFx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IFtdLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0aGFuZE9mZnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RlbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRhcmdldDogVGFyZ2V0LlVuZGVmaW5lZCxcblx0XHRcdFx0XHR2aXNpYmlsaXR5OiB7IHVzZXJJbnZvY2FibGU6IHRydWUsIGFnZW50SW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0YWdlbnRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0aG9va3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzZXNzaW9uVHlwZXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9hZ2VudHMvYWdlbnQxLmFnZW50Lm1kJyksXG5cdFx0XHRcdFx0c291cmNlOiB7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsIH0sXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvYWdlbnRzL2FnZW50Mi5hZ2VudC5tZCcpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0bmFtZTogJ2FnZW50MicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdEb2N1bWVudGF0aW9uIGdlbmVyYXRvci4nLFxuXHRcdFx0XHRcdGFyZ3VtZW50SGludDogJ1NwZWNpZnkgZnVuY3Rpb24gb3IgY2xhc3MgbmFtZSB0byBkb2N1bWVudCcsXG5cdFx0XHRcdFx0YWdlbnRJbnN0cnVjdGlvbnM6IHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6ICdJIGdlbmVyYXRlIGNvbXByZWhlbnNpdmUgZG9jdW1lbnRhdGlvbi4nLFxuXHRcdFx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IFtdLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0aGFuZE9mZnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RlbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRvb2xzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dGFyZ2V0OiBUYXJnZXQuVW5kZWZpbmVkLFxuXHRcdFx0XHRcdHZpc2liaWxpdHk6IHsgdXNlckludm9jYWJsZTogdHJ1ZSwgYWdlbnRJbnZvY2FibGU6IHRydWUgfSxcblx0XHRcdFx0XHRhZ2VudHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRob29rczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNlc3Npb25UeXBlczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVyaTogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL2FnZW50cy9hZ2VudDIuYWdlbnQubWQnKSxcblx0XHRcdFx0XHRzb3VyY2U6IHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfSxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChcblx0XHRcdFx0cmVzdWx0LFxuXHRcdFx0XHRleHBlY3RlZCxcblx0XHRcdFx0J011c3QgZ2V0IGN1c3RvbSBhZ2VudHMgd2l0aCBhcmd1bWVudEhpbnQuJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoZWFkZXIgd2l0aCB0YXJnZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdjdXN0b20tYWdlbnRzLXdpdGgtdGFyZ2V0Jztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvYWdlbnRzL2dpdGh1Yi1hZ2VudC5hZ2VudC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdHaXRIdWIgQ29waWxvdCBzcGVjaWFsaXplZCBhZ2VudC5cXCcnLFxuXHRcdFx0XHRcdFx0J3RhcmdldDogXFwnZ2l0aHViLWNvcGlsb3RcXCcnLFxuXHRcdFx0XHRcdFx0J3Rvb2xzOiBbIGdpdGh1Yi1hcGksIGNvZGUtc2VhcmNoIF0nLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSSBhbSBvcHRpbWl6ZWQgZm9yIEdpdEh1YiBDb3BpbG90IHdvcmtmbG93cy4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvYWdlbnRzL3ZzY29kZS1hZ2VudC5hZ2VudC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdWUyBDb2RlIHNwZWNpYWxpemVkIGFnZW50LlxcJycsXG5cdFx0XHRcdFx0XHQndGFyZ2V0OiBcXCd2c2NvZGVcXCcnLFxuXHRcdFx0XHRcdFx0J21vZGVsOiBcXCdncHQtNFxcJycsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdJIGFtIHNwZWNpYWxpemVkIGZvciBWUyBDb2RlIGVkaXRvciB0YXNrcy4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvYWdlbnRzL2dlbmVyaWMtYWdlbnQuYWdlbnQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnR2VuZXJpYyBhZ2VudCB3aXRob3V0IHRhcmdldC5cXCcnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSSB3b3JrIGV2ZXJ5d2hlcmUuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSAoYXdhaXQgc2VydmljZS5nZXRDdXN0b21BZ2VudHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLm1hcChhZ2VudCA9PiAoeyAuLi5hZ2VudCwgdXJpOiBVUkkuZnJvbShhZ2VudC51cmkpIH0pKTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkOiBJQ3VzdG9tQWdlbnRbXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvYWdlbnRzL2dpdGh1Yi1hZ2VudC5hZ2VudC5tZCcpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0bmFtZTogJ2dpdGh1Yi1hZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdHaXRIdWIgQ29waWxvdCBzcGVjaWFsaXplZCBhZ2VudC4nLFxuXHRcdFx0XHRcdHRhcmdldDogVGFyZ2V0LkdpdEh1YkNvcGlsb3QsXG5cdFx0XHRcdFx0dG9vbHM6IFsnZ2l0aHViLWFwaScsICdjb2RlLXNlYXJjaCddLFxuXHRcdFx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiAnSSBhbSBvcHRpbWl6ZWQgZm9yIEdpdEh1YiBDb3BpbG90IHdvcmtmbG93cy4nLFxuXHRcdFx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IFtdLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0aGFuZE9mZnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RlbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGFyZ3VtZW50SGludDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHZpc2liaWxpdHk6IHsgdXNlckludm9jYWJsZTogdHJ1ZSwgYWdlbnRJbnZvY2FibGU6IHRydWUgfSxcblx0XHRcdFx0XHRhZ2VudHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRob29rczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVyaTogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL2FnZW50cy9naXRodWItYWdlbnQuYWdlbnQubWQnKSxcblx0XHRcdFx0XHRzZXNzaW9uVHlwZXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzb3VyY2U6IHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfSxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9hZ2VudHMvdnNjb2RlLWFnZW50LmFnZW50Lm1kJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRuYW1lOiAndnNjb2RlLWFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1ZTIENvZGUgc3BlY2lhbGl6ZWQgYWdlbnQuJyxcblx0XHRcdFx0XHR0YXJnZXQ6IFRhcmdldC5WU0NvZGUsXG5cdFx0XHRcdFx0bW9kZWw6IFsnZ3B0LTQnXSxcblx0XHRcdFx0XHRhZ2VudEluc3RydWN0aW9uczoge1xuXHRcdFx0XHRcdFx0Y29udGVudDogJ0kgYW0gc3BlY2lhbGl6ZWQgZm9yIFZTIENvZGUgZWRpdG9yIHRhc2tzLicsXG5cdFx0XHRcdFx0XHR0b29sUmVmZXJlbmNlczogW10sXG5cdFx0XHRcdFx0XHRtZXRhZGF0YTogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRoYW5kT2ZmczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGFyZ3VtZW50SGludDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRvb2xzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dmlzaWJpbGl0eTogeyB1c2VySW52b2NhYmxlOiB0cnVlLCBhZ2VudEludm9jYWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdGFnZW50czogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGhvb2tzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvYWdlbnRzL3ZzY29kZS1hZ2VudC5hZ2VudC5tZCcpLFxuXHRcdFx0XHRcdHNlc3Npb25UeXBlczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNvdXJjZTogeyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCB9LFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL2FnZW50cy9nZW5lcmljLWFnZW50LmFnZW50Lm1kJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRuYW1lOiAnZ2VuZXJpYy1hZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdHZW5lcmljIGFnZW50IHdpdGhvdXQgdGFyZ2V0LicsXG5cdFx0XHRcdFx0YWdlbnRJbnN0cnVjdGlvbnM6IHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6ICdJIHdvcmsgZXZlcnl3aGVyZS4nLFxuXHRcdFx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IFtdLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0aGFuZE9mZnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RlbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGFyZ3VtZW50SGludDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRvb2xzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dGFyZ2V0OiBUYXJnZXQuVW5kZWZpbmVkLFxuXHRcdFx0XHRcdHZpc2liaWxpdHk6IHsgdXNlckludm9jYWJsZTogdHJ1ZSwgYWdlbnRJbnZvY2FibGU6IHRydWUgfSxcblx0XHRcdFx0XHRhZ2VudHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRob29rczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVyaTogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL2FnZW50cy9nZW5lcmljLWFnZW50LmFnZW50Lm1kJyksXG5cdFx0XHRcdFx0c2Vzc2lvblR5cGVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c291cmNlOiB7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsIH0sXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGFzc2VydC5kZWVwRXF1YWwoXG5cdFx0XHRcdHJlc3VsdCxcblx0XHRcdFx0ZXhwZWN0ZWQsXG5cdFx0XHRcdCdNdXN0IGdldCBjdXN0b20gYWdlbnRzIHdpdGggdGFyZ2V0IGF0dHJpYnV0ZS4nLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NsYXVkZSBhZ2VudCBtYXBzIHRvb2xzIGFuZCBtb2RlbCB0byB2c2NvZGUgZXF1aXZhbGVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdjbGF1ZGUtYWdlbnQtbWFwcGluZyc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHQvLyBDbGF1ZGUgYWdlbnQgd2l0aCB0b29scyBhbmQgbW9kZWwgdGhhdCBzaG91bGQgYmUgbWFwcGVkXG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmNsYXVkZS9hZ2VudHMvY2xhdWRlLWFnZW50Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0NsYXVkZSBhZ2VudCB3aXRoIHRvb2xzIGFuZCBtb2RlbC5cXCcnLFxuXHRcdFx0XHRcdFx0J3Rvb2xzOiBbIFJlYWQsIEVkaXQsIEJhc2ggXScsXG5cdFx0XHRcdFx0XHQnbW9kZWw6IG9wdXMnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSSBhbSBhIENsYXVkZSBhZ2VudC4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdC8vIENsYXVkZSBhZ2VudCB3aXRoIG1vcmUgdG9vbHMsIHNvbWUgd2l0aCBlbXB0eSBlcXVpdmFsZW50c1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5jbGF1ZGUvYWdlbnRzL2NsYXVkZS1hZ2VudDIubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnQ2xhdWRlIGFnZW50IHdpdGggdmFyaW91cyB0b29scy5cXCcnLFxuXHRcdFx0XHRcdFx0J3Rvb2xzOiBbIEdsb2IsIEdyZXAsIFdyaXRlLCBUYXNrLCBTa2lsbCBdJyxcblx0XHRcdFx0XHRcdCdtb2RlbDogc29ubmV0Jyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0kgYW0gYW5vdGhlciBDbGF1ZGUgYWdlbnQuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHQvLyBOb24tQ2xhdWRlIGFnZW50IHNob3VsZCBOT1QgaGF2ZSB0b29scy9tb2RlbCBtYXBwZWRcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL2FnZW50cy9jb3BpbG90LWFnZW50LmFnZW50Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0NvcGlsb3QgYWdlbnQgd2l0aCBzYW1lIHRvb2wgbmFtZXMuXFwnJyxcblx0XHRcdFx0XHRcdCd0YXJnZXQ6IFxcJ2dpdGh1Yi1jb3BpbG90XFwnJyxcblx0XHRcdFx0XHRcdCd0b29sczogWyBSZWFkLCBFZGl0IF0nLFxuXHRcdFx0XHRcdFx0J21vZGVsOiBncHQtNCcsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdJIGFtIGEgQ29waWxvdCBhZ2VudC4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSAoYXdhaXQgc2VydmljZS5nZXRDdXN0b21BZ2VudHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLm1hcChhZ2VudCA9PiAoeyAuLi5hZ2VudCwgdXJpOiBVUkkuZnJvbShhZ2VudC51cmkpIH0pKTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkOiBJQ3VzdG9tQWdlbnRbXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvYWdlbnRzL2NvcGlsb3QtYWdlbnQuYWdlbnQubWQnKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdG5hbWU6ICdjb3BpbG90LWFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0NvcGlsb3QgYWdlbnQgd2l0aCBzYW1lIHRvb2wgbmFtZXMuJyxcblx0XHRcdFx0XHR0YXJnZXQ6IFRhcmdldC5HaXRIdWJDb3BpbG90LFxuXHRcdFx0XHRcdC8vIE5vbi1DbGF1ZGUgYWdlbnQ6IHRvb2xzIGFuZCBtb2RlbCBzdGF5IGFzLWlzXG5cdFx0XHRcdFx0dG9vbHM6IFsnUmVhZCcsICdFZGl0J10sXG5cdFx0XHRcdFx0bW9kZWw6IFsnZ3B0LTQnXSxcblx0XHRcdFx0XHRhZ2VudEluc3RydWN0aW9uczoge1xuXHRcdFx0XHRcdFx0Y29udGVudDogJ0kgYW0gYSBDb3BpbG90IGFnZW50LicsXG5cdFx0XHRcdFx0XHR0b29sUmVmZXJlbmNlczogW10sXG5cdFx0XHRcdFx0XHRtZXRhZGF0YTogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRoYW5kT2ZmczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGFyZ3VtZW50SGludDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHZpc2liaWxpdHk6IHsgdXNlckludm9jYWJsZTogdHJ1ZSwgYWdlbnRJbnZvY2FibGU6IHRydWUgfSxcblx0XHRcdFx0XHRhZ2VudHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRob29rczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVyaTogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL2FnZW50cy9jb3BpbG90LWFnZW50LmFnZW50Lm1kJyksXG5cdFx0XHRcdFx0c2Vzc2lvblR5cGVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c291cmNlOiB7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsIH0sXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5jbGF1ZGUvYWdlbnRzL2NsYXVkZS1hZ2VudC5tZCcpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0bmFtZTogJ2NsYXVkZS1hZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdDbGF1ZGUgYWdlbnQgd2l0aCB0b29scyBhbmQgbW9kZWwuJyxcblx0XHRcdFx0XHR0YXJnZXQ6IFRhcmdldC5DbGF1ZGUsXG5cdFx0XHRcdFx0Ly8gQ2xhdWRlIHRvb2xzIG1hcHBlZCB0byB2c2NvZGUgZXF1aXZhbGVudHNcblx0XHRcdFx0XHR0b29sczogWydyZWFkL3JlYWRGaWxlJywgJ3JlYWQvZ2V0Tm90ZWJvb2tTdW1tYXJ5JywgJ2VkaXQvZWRpdE5vdGVib29rJywgJ2VkaXQvZWRpdEZpbGVzJywgJ2V4ZWN1dGUnXSxcblx0XHRcdFx0XHQvLyBDbGF1ZGUgbW9kZWwgbWFwcGVkIHRvIHZzY29kZSBlcXVpdmFsZW50XG5cdFx0XHRcdFx0bW9kZWw6IFsnQ2xhdWRlIE9wdXMgNC42IChjb3BpbG90KSddLFxuXHRcdFx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiAnSSBhbSBhIENsYXVkZSBhZ2VudC4nLFxuXHRcdFx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IFtdLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0aGFuZE9mZnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRhcmd1bWVudEhpbnQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR2aXNpYmlsaXR5OiB7IHVzZXJJbnZvY2FibGU6IHRydWUsIGFnZW50SW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0YWdlbnRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0aG9va3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmNsYXVkZS9hZ2VudHMvY2xhdWRlLWFnZW50Lm1kJyksXG5cdFx0XHRcdFx0c2Vzc2lvblR5cGVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c291cmNlOiB7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsIH0sXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5jbGF1ZGUvYWdlbnRzL2NsYXVkZS1hZ2VudDIubWQnKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdG5hbWU6ICdjbGF1ZGUtYWdlbnQyJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0NsYXVkZSBhZ2VudCB3aXRoIHZhcmlvdXMgdG9vbHMuJyxcblx0XHRcdFx0XHR0YXJnZXQ6IFRhcmdldC5DbGF1ZGUsXG5cdFx0XHRcdFx0Ly8gVG9vbHMgbWFwcGVkOiBHbG9iLT5zZWFyY2gvZmlsZVNlYXJjaCwgR3JlcC0+c2VhcmNoL3RleHRTZWFyY2gsIFdyaXRlLT5lZGl0L2NyZWF0ZSosIFRhc2stPmFnZW50LCBTa2lsbC0+W10gKGVtcHR5KVxuXHRcdFx0XHRcdHRvb2xzOiBbJ3NlYXJjaC9maWxlU2VhcmNoJywgJ3NlYXJjaC90ZXh0U2VhcmNoJywgJ2VkaXQvY3JlYXRlRGlyZWN0b3J5JywgJ2VkaXQvY3JlYXRlRmlsZScsICdlZGl0L2NyZWF0ZUp1cHl0ZXJOb3RlYm9vaycsICdhZ2VudCddLFxuXHRcdFx0XHRcdG1vZGVsOiBbJ0NsYXVkZSBTb25uZXQgNC41IChjb3BpbG90KSddLFxuXHRcdFx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiAnSSBhbSBhbm90aGVyIENsYXVkZSBhZ2VudC4nLFxuXHRcdFx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IFtdLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0aGFuZE9mZnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRhcmd1bWVudEhpbnQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR2aXNpYmlsaXR5OiB7IHVzZXJJbnZvY2FibGU6IHRydWUsIGFnZW50SW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0YWdlbnRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0aG9va3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmNsYXVkZS9hZ2VudHMvY2xhdWRlLWFnZW50Mi5tZCcpLFxuXHRcdFx0XHRcdHNlc3Npb25UeXBlczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNvdXJjZTogeyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCB9LFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKFxuXHRcdFx0XHRyZXN1bHQsXG5cdFx0XHRcdGV4cGVjdGVkLFxuXHRcdFx0XHQnQ2xhdWRlIHRvb2xzIGFuZCBtb2RlbHMgbXVzdCBiZSBtYXBwZWQgdG8gVlMgQ29kZSBlcXVpdmFsZW50czsgbm9uLUNsYXVkZSBhZ2VudHMgbXVzdCByZW1haW4gdW5jaGFuZ2VkLicsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cblx0XHR0ZXN0KCdhZ2VudHMgd2l0aCAubWQgZXh0ZW5zaW9uIHNob3VsZCBiZSByZWNvZ25pemVkLCBleGNlcHQgUkVBRE1FLm1kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnY3VzdG9tLWFnZW50cy1tZC1leHRlbnNpb24nO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9hZ2VudHMvZGVtb25zdHJhdGUubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnRGVtb25zdHJhdGUgYWdlbnQuXFwnJyxcblx0XHRcdFx0XHRcdCd0b29sczogWyBkZW1vLXRvb2wgXScsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdUaGlzIGlzIGEgZGVtb25zdHJhdGlvbiBhZ2VudCB1c2luZyAubWQgZXh0ZW5zaW9uLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9hZ2VudHMvUkVBRE1FLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0J1RoaXMgaXMgYSBSRUFETUUgZmlsZS4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IChhd2FpdCBzZXJ2aWNlLmdldEN1c3RvbUFnZW50cyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkubWFwKGFnZW50ID0+ICh7IC4uLmFnZW50LCB1cmk6IFVSSS5mcm9tKGFnZW50LnVyaSkgfSkpO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWQ6IElDdXN0b21BZ2VudFtdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9hZ2VudHMvZGVtb25zdHJhdGUubWQnKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdG5hbWU6ICdkZW1vbnN0cmF0ZScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdEZW1vbnN0cmF0ZSBhZ2VudC4nLFxuXHRcdFx0XHRcdHRvb2xzOiBbJ2RlbW8tdG9vbCddLFxuXHRcdFx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiAnVGhpcyBpcyBhIGRlbW9uc3RyYXRpb24gYWdlbnQgdXNpbmcgLm1kIGV4dGVuc2lvbi4nLFxuXHRcdFx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IFtdLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0aGFuZE9mZnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RlbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGFyZ3VtZW50SGludDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRhcmdldDogVGFyZ2V0LlVuZGVmaW5lZCxcblx0XHRcdFx0XHR2aXNpYmlsaXR5OiB7IHVzZXJJbnZvY2FibGU6IHRydWUsIGFnZW50SW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0YWdlbnRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0aG9va3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzZXNzaW9uVHlwZXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9hZ2VudHMvZGVtb25zdHJhdGUubWQnKSxcblx0XHRcdFx0XHRzb3VyY2U6IHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfSxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHR9XG5cdFx0XHRdO1xuXG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKFxuXHRcdFx0XHRyZXN1bHQsXG5cdFx0XHRcdGV4cGVjdGVkLFxuXHRcdFx0XHQnTXVzdCByZWNvZ25pemUgLm1kIGZpbGVzIGFzIGFnZW50cywgZXhjZXB0IFJFQURNRS5tZCcsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGVhZGVyIHdpdGggYWdlbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnY3VzdG9tLWFnZW50cy13aXRoLXJlc3RyaWN0aW9ucyc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL2FnZW50cy9yZXN0cmljdGVkLWFnZW50LmFnZW50Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0FnZW50IHdpdGggcmVzdHJpY3RlZCBhY2Nlc3MuXFwnJyxcblx0XHRcdFx0XHRcdCdhZ2VudHM6IFsgc3ViYWdlbnQxLCBzdWJhZ2VudDIgXScsXG5cdFx0XHRcdFx0XHQndG9vbHM6IFsgdG9vbDEgXScsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdUaGlzIGFnZW50IGhhcyByZXN0cmljdGVkIGFjY2Vzcy4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvYWdlbnRzL25vLWFjY2Vzcy1hZ2VudC5hZ2VudC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdBZ2VudCB3aXRoIG5vIGFjY2VzcyB0byBzdWJhZ2VudHMsIHNraWxscywgb3IgaW5zdHJ1Y3Rpb25zLlxcJycsXG5cdFx0XHRcdFx0XHQnYWdlbnRzOiBbXScsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdUaGlzIGFnZW50IGhhcyBubyBhY2Nlc3MuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL2FnZW50cy9mdWxsLWFjY2Vzcy1hZ2VudC5hZ2VudC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdBZ2VudCB3aXRoIGZ1bGwgYWNjZXNzLlxcJycsXG5cdFx0XHRcdFx0XHQnYWdlbnRzOiBbIFwiKlwiIF0nLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnVGhpcyBhZ2VudCBoYXMgZnVsbCBhY2Nlc3MuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSAoYXdhaXQgc2VydmljZS5nZXRDdXN0b21BZ2VudHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLm1hcChhZ2VudCA9PiAoeyAuLi5hZ2VudCwgdXJpOiBVUkkuZnJvbShhZ2VudC51cmkpIH0pKTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkOiBJQ3VzdG9tQWdlbnRbXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvYWdlbnRzL3Jlc3RyaWN0ZWQtYWdlbnQuYWdlbnQubWQnKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdG5hbWU6ICdyZXN0cmljdGVkLWFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0FnZW50IHdpdGggcmVzdHJpY3RlZCBhY2Nlc3MuJyxcblx0XHRcdFx0XHRhZ2VudHM6IFsnc3ViYWdlbnQxJywgJ3N1YmFnZW50MiddLFxuXHRcdFx0XHRcdHRvb2xzOiBbJ3Rvb2wxJ10sXG5cdFx0XHRcdFx0YWdlbnRJbnN0cnVjdGlvbnM6IHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6ICdUaGlzIGFnZW50IGhhcyByZXN0cmljdGVkIGFjY2Vzcy4nLFxuXHRcdFx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IFtdLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0aGFuZE9mZnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RlbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGFyZ3VtZW50SGludDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRhcmdldDogVGFyZ2V0LlVuZGVmaW5lZCxcblx0XHRcdFx0XHR2aXNpYmlsaXR5OiB7IHVzZXJJbnZvY2FibGU6IHRydWUsIGFnZW50SW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0aG9va3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzZXNzaW9uVHlwZXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9hZ2VudHMvcmVzdHJpY3RlZC1hZ2VudC5hZ2VudC5tZCcpLFxuXHRcdFx0XHRcdHNvdXJjZTogeyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCB9LFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL2FnZW50cy9uby1hY2Nlc3MtYWdlbnQuYWdlbnQubWQnKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdG5hbWU6ICduby1hY2Nlc3MtYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnQWdlbnQgd2l0aCBubyBhY2Nlc3MgdG8gc3ViYWdlbnRzLCBza2lsbHMsIG9yIGluc3RydWN0aW9ucy4nLFxuXHRcdFx0XHRcdGFnZW50czogW10sXG5cdFx0XHRcdFx0YWdlbnRJbnN0cnVjdGlvbnM6IHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6ICdUaGlzIGFnZW50IGhhcyBubyBhY2Nlc3MuJyxcblx0XHRcdFx0XHRcdHRvb2xSZWZlcmVuY2VzOiBbXSxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGhhbmRPZmZzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kZWw6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRhcmd1bWVudEhpbnQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0b29sczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRhcmdldDogVGFyZ2V0LlVuZGVmaW5lZCxcblx0XHRcdFx0XHR2aXNpYmlsaXR5OiB7IHVzZXJJbnZvY2FibGU6IHRydWUsIGFnZW50SW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0aG9va3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzZXNzaW9uVHlwZXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9hZ2VudHMvbm8tYWNjZXNzLWFnZW50LmFnZW50Lm1kJyksXG5cdFx0XHRcdFx0c291cmNlOiB7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsIH0sXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvYWdlbnRzL2Z1bGwtYWNjZXNzLWFnZW50LmFnZW50Lm1kJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRuYW1lOiAnZnVsbC1hY2Nlc3MtYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnQWdlbnQgd2l0aCBmdWxsIGFjY2Vzcy4nLFxuXHRcdFx0XHRcdGFnZW50czogWycqJ10sXG5cdFx0XHRcdFx0YWdlbnRJbnN0cnVjdGlvbnM6IHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6ICdUaGlzIGFnZW50IGhhcyBmdWxsIGFjY2Vzcy4nLFxuXHRcdFx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IFtdLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0aGFuZE9mZnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RlbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGFyZ3VtZW50SGludDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRvb2xzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dGFyZ2V0OiBUYXJnZXQuVW5kZWZpbmVkLFxuXHRcdFx0XHRcdHZpc2liaWxpdHk6IHsgdXNlckludm9jYWJsZTogdHJ1ZSwgYWdlbnRJbnZvY2FibGU6IHRydWUgfSxcblx0XHRcdFx0XHRob29rczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNlc3Npb25UeXBlczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVyaTogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL2FnZW50cy9mdWxsLWFjY2Vzcy1hZ2VudC5hZ2VudC5tZCcpLFxuXHRcdFx0XHRcdHNvdXJjZTogeyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCB9LFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKFxuXHRcdFx0XHRyZXN1bHQsXG5cdFx0XHRcdGV4cGVjdGVkLFxuXHRcdFx0XHQnTXVzdCBnZXQgY3VzdG9tIGFnZW50cyB3aXRoIGFnZW50cywgc2tpbGxzLCBhbmQgaW5zdHJ1Y3Rpb25zIGF0dHJpYnV0ZXMuJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoZWFkZXIgd2l0aCBpbmZlcjogZmFsc2Ugc2V0cyBhZ2VudEludm9jYWJsZSB0byBmYWxzZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ2N1c3RvbS1hZ2VudHMtaW5mZXItZmFsc2UnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9hZ2VudHMvYWdlbnQtaW5mZXItZmFsc2UuYWdlbnQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnQWdlbnQgd2l0aCBpbmZlcjogZmFsc2UuXFwnJyxcblx0XHRcdFx0XHRcdCdpbmZlcjogZmFsc2UnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSSBzaG91bGQgbm90IGJlIGludm9jYWJsZSBieSB0aGUgbW9kZWwuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL2FnZW50cy9hZ2VudC1pbmZlci10cnVlLmFnZW50Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0FnZW50IHdpdGggaW5mZXI6IHRydWUuXFwnJyxcblx0XHRcdFx0XHRcdCdpbmZlcjogdHJ1ZScsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdJIHNob3VsZCBiZSBpbnZvY2FibGUgYnkgdGhlIG1vZGVsLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9hZ2VudHMvYWdlbnQtbm8taW5mZXIuYWdlbnQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnQWdlbnQgd2l0aG91dCBpbmZlci5cXCcnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSSBzaG91bGQgZGVmYXVsdCB0byBiZWluZyBpbnZvY2FibGUgYnkgdGhlIG1vZGVsLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gKGF3YWl0IHNlcnZpY2UuZ2V0Q3VzdG9tQWdlbnRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpKS5tYXAoYWdlbnQgPT4gKHsgLi4uYWdlbnQsIHVyaTogVVJJLmZyb20oYWdlbnQudXJpKSB9KSk7XG5cblx0XHRcdGNvbnN0IGluZmVyRmFsc2VBZ2VudCA9IHJlc3VsdC5maW5kKGEgPT4gYS5uYW1lID09PSAnYWdlbnQtaW5mZXItZmFsc2UnKTtcblx0XHRcdGFzc2VydC5vayhpbmZlckZhbHNlQWdlbnQsICdTaG91bGQgZmluZCBhZ2VudCB3aXRoIGluZmVyOiBmYWxzZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluZmVyRmFsc2VBZ2VudC52aXNpYmlsaXR5LmFnZW50SW52b2NhYmxlLCBmYWxzZSwgJ2luZmVyOiBmYWxzZSBzaG91bGQgc2V0IGFnZW50SW52b2NhYmxlIHRvIGZhbHNlJyk7XG5cblx0XHRcdGNvbnN0IGluZmVyVHJ1ZUFnZW50ID0gcmVzdWx0LmZpbmQoYSA9PiBhLm5hbWUgPT09ICdhZ2VudC1pbmZlci10cnVlJyk7XG5cdFx0XHRhc3NlcnQub2soaW5mZXJUcnVlQWdlbnQsICdTaG91bGQgZmluZCBhZ2VudCB3aXRoIGluZmVyOiB0cnVlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5mZXJUcnVlQWdlbnQudmlzaWJpbGl0eS5hZ2VudEludm9jYWJsZSwgdHJ1ZSwgJ2luZmVyOiB0cnVlIHNob3VsZCBzZXQgYWdlbnRJbnZvY2FibGUgdG8gdHJ1ZScpO1xuXG5cdFx0XHRjb25zdCBub0luZmVyQWdlbnQgPSByZXN1bHQuZmluZChhID0+IGEubmFtZSA9PT0gJ2FnZW50LW5vLWluZmVyJyk7XG5cdFx0XHRhc3NlcnQub2sobm9JbmZlckFnZW50LCAnU2hvdWxkIGZpbmQgYWdlbnQgd2l0aG91dCBpbmZlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vSW5mZXJBZ2VudC52aXNpYmlsaXR5LmFnZW50SW52b2NhYmxlLCB0cnVlLCAnbWlzc2luZyBpbmZlciBzaG91bGQgZGVmYXVsdCBhZ2VudEludm9jYWJsZSB0byB0cnVlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZ2VudHMgZnJvbSB1c2VyIGRhdGEgZm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnY3VzdG9tLWFnZW50cy11c2VyLWRhdGEnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdGNvbnN0IHVzZXJQcm9tcHRzRm9sZGVyID0gJy91c2VyLWRhdGEvcHJvbXB0cyc7XG5cdFx0XHRjb25zdCB1c2VyUHJvbXB0c0ZvbGRlclVyaSA9IFVSSS5maWxlKHVzZXJQcm9tcHRzRm9sZGVyKTtcblxuXHRcdFx0Ly8gT3ZlcnJpZGUgdGhlIHVzZXIgZGF0YSBwcm9maWxlIHNlcnZpY2UgdG8gdXNlIGEgZmlsZTovLyBVUkkgdGhhdCB0aGUgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgc3VwcG9ydHNcblx0XHRcdGNvbnN0IGN1c3RvbVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgPSB7XG5cdFx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0b25EaWRDaGFuZ2VDdXJyZW50UHJvZmlsZTogRXZlbnQuTm9uZSxcblx0XHRcdFx0Y3VycmVudFByb2ZpbGU6IHtcblx0XHRcdFx0XHQuLi50b1VzZXJEYXRhUHJvZmlsZSgndGVzdCcsICd0ZXN0JywgVVJJLmZpbGUodXNlclByb21wdHNGb2xkZXIpLndpdGgoeyBwYXRoOiAnL3VzZXItZGF0YScgfSksIFVSSS5maWxlKCcvY2FjaGUnKSksXG5cdFx0XHRcdFx0cHJvbXB0c0hvbWU6IHVzZXJQcm9tcHRzRm9sZGVyVXJpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR1cGRhdGVDdXJyZW50UHJvZmlsZTogYXN5bmMgKCkgPT4geyB9XG5cdFx0XHR9O1xuXHRcdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsIGN1c3RvbVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UpO1xuXG5cdFx0XHQvLyBSZWNyZWF0ZSB0aGUgc2VydmljZSB3aXRoIHRoZSBuZXcgc3R1YiAoZGlzcG9zZSBleGlzdGluZyB0byBhdm9pZCBkdXBsaWNhdGUgZmlsZXN5c3RlbSByZWdpc3RyYXRpb24pXG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRzU2VydmljZSkpO1xuXG5cdFx0XHQvLyBDcmVhdGUgYWdlbnQgZmlsZXMgaW4gYm90aCB3b3Jrc3BhY2UgYW5kIHVzZXIgZGF0YSBmb2xkZXJcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHQvLyBXb3Jrc3BhY2UgYWdlbnRcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvYWdlbnRzL3dvcmtzcGFjZS1hZ2VudC5hZ2VudC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdXb3Jrc3BhY2UgYWdlbnQuXFwnJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0kgYW0gYSB3b3Jrc3BhY2UgYWdlbnQuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdC8vIFVzZXIgZGF0YSBhZ2VudFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7dXNlclByb21wdHNGb2xkZXJ9L3VzZXItYWdlbnQuYWdlbnQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnVXNlciBkYXRhIGFnZW50LlxcJycsXG5cdFx0XHRcdFx0XHQndG9vbHM6IFsgdXNlci10b29sIF0nLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSSBhbSBhIHVzZXIgZGF0YSBhZ2VudC4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0Ly8gQW5vdGhlciB1c2VyIGRhdGEgYWdlbnQgd2l0aG91dCBoZWFkZXJcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3VzZXJQcm9tcHRzRm9sZGVyfS9zaW1wbGUtdXNlci1hZ2VudC5hZ2VudC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCdBIHNpbXBsZSB1c2VyIGFnZW50IHdpdGhvdXQgaGVhZGVyLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gKGF3YWl0IHRlc3RTZXJ2aWNlLmdldEN1c3RvbUFnZW50cyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkubWFwKGFnZW50ID0+ICh7IC4uLmFnZW50LCB1cmk6IFVSSS5mcm9tKGFnZW50LnVyaSkgfSkpO1xuXG5cdFx0XHQvLyBTaG91bGQgZmluZCBhZ2VudHMgZnJvbSBib3RoIHdvcmtzcGFjZSBhbmQgdXNlciBkYXRhXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMywgJ1Nob3VsZCBmaW5kIDMgYWdlbnRzICgxIHdvcmtzcGFjZSArIDIgdXNlciBkYXRhKScpO1xuXG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VBZ2VudCA9IHJlc3VsdC5maW5kKGEgPT4gYS5zb3VyY2Uuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UubG9jYWwpO1xuXHRcdFx0YXNzZXJ0Lm9rKHdvcmtzcGFjZUFnZW50LCAnU2hvdWxkIGZpbmQgd29ya3NwYWNlIGFnZW50Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya3NwYWNlQWdlbnQubmFtZSwgJ3dvcmtzcGFjZS1hZ2VudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtzcGFjZUFnZW50LmRlc2NyaXB0aW9uLCAnV29ya3NwYWNlIGFnZW50LicpO1xuXG5cdFx0XHRjb25zdCB1c2VyQWdlbnRzID0gcmVzdWx0LmZpbHRlcihhID0+IGEuc291cmNlLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnVzZXIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVzZXJBZ2VudHMubGVuZ3RoLCAyLCAnU2hvdWxkIGZpbmQgMiB1c2VyIGRhdGEgYWdlbnRzJyk7XG5cblx0XHRcdGNvbnN0IHVzZXJBZ2VudFdpdGhIZWFkZXIgPSB1c2VyQWdlbnRzLmZpbmQoYSA9PiBhLm5hbWUgPT09ICd1c2VyLWFnZW50Jyk7XG5cdFx0XHRhc3NlcnQub2sodXNlckFnZW50V2l0aEhlYWRlciwgJ1Nob3VsZCBmaW5kIHVzZXIgYWdlbnQgd2l0aCBoZWFkZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1c2VyQWdlbnRXaXRoSGVhZGVyLmRlc2NyaXB0aW9uLCAnVXNlciBkYXRhIGFnZW50LicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1c2VyQWdlbnRXaXRoSGVhZGVyLnRvb2xzLCBbJ3VzZXItdG9vbCddKTtcblxuXHRcdFx0Y29uc3Qgc2ltcGxlVXNlckFnZW50ID0gdXNlckFnZW50cy5maW5kKGEgPT4gYS5uYW1lID09PSAnc2ltcGxlLXVzZXItYWdlbnQnKTtcblx0XHRcdGFzc2VydC5vayhzaW1wbGVVc2VyQWdlbnQsICdTaG91bGQgZmluZCBzaW1wbGUgdXNlciBhZ2VudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNpbXBsZVVzZXJBZ2VudC5hZ2VudEluc3RydWN0aW9ucy5jb250ZW50LCAnQSBzaW1wbGUgdXNlciBhZ2VudCB3aXRob3V0IGhlYWRlci4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc2FibGVkIGFnZW50cyBhcmUgcmVwb3J0ZWQgd2l0aCBlbmFibGVkOiBmYWxzZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ2N1c3RvbS1hZ2VudHMtZGlzYWJsZWQnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdC8vIFVzZSBhIHJlYWwgSW5NZW1vcnlTdG9yYWdlU2VydmljZSBpbnN0YW5jZSBzbyBkaXNhYmxlZCBzdGF0ZSBhY3R1YWxseSBwZXJzaXN0c1xuXHRcdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0c1NlcnZpY2UpKTtcblxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL2FnZW50cy9lbmFibGVkLWFnZW50LmFnZW50Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0VuYWJsZWQgYWdlbnQuXFwnJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0kgYW0gZW5hYmxlZC4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvYWdlbnRzL2Rpc2FibGVkLWFnZW50LmFnZW50Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0Rpc2FibGVkIGFnZW50LlxcJycsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdJIGFtIGRpc2FibGVkLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9hZ2VudHMvYW5vdGhlci1kaXNhYmxlZC1hZ2VudC5hZ2VudC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdBbm90aGVyIGRpc2FibGVkIGFnZW50LlxcJycsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdJIGFtIGFsc28gZGlzYWJsZWQuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBGaXJzdCBsb2FkIHRvIGRpc2NvdmVyIFVSSXMgYXMgdGhlIHNlcnZpY2Ugc2VlcyB0aGVtXG5cdFx0XHRjb25zdCBpbml0aWFsID0gYXdhaXQgdGVzdFNlcnZpY2UuZ2V0Q3VzdG9tQWdlbnRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3QgdG9EaXNhYmxlID0gaW5pdGlhbC5maWx0ZXIoYSA9PiBhLm5hbWUgPT09ICdkaXNhYmxlZC1hZ2VudCcgfHwgYS5uYW1lID09PSAnYW5vdGhlci1kaXNhYmxlZC1hZ2VudCcpO1xuXG5cdFx0XHQvLyBEaXNhYmxlIHR3byBvZiB0aGUgdGhyZWUgYWdlbnRzXG5cdFx0XHRjb25zdCBkaXNhYmxlZFVyaXMgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHRcdGZvciAoY29uc3QgYSBvZiB0b0Rpc2FibGUpIHtcblx0XHRcdFx0ZGlzYWJsZWRVcmlzLmFkZChVUkkuZnJvbShhLnVyaSkpO1xuXHRcdFx0fVxuXHRcdFx0dGVzdFNlcnZpY2Uuc2V0RGlzYWJsZWRQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5hZ2VudCwgZGlzYWJsZWRVcmlzKTtcblxuXHRcdFx0Ly8gU2FuaXR5IGNoZWNrOiB0aGUgc2VydmljZSByZXBvcnRzIHRoZSBVUklzIGFzIGRpc2FibGVkXG5cdFx0XHRjb25zdCBwZXJzaXN0ZWQgPSB0ZXN0U2VydmljZS5nZXREaXNhYmxlZFByb21wdEZpbGVzKFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZXJzaXN0ZWQuc2l6ZSwgMiwgYEV4cGVjdGVkIDIgZGlzYWJsZWQgYWdlbnRzLCBnb3QgJHtwZXJzaXN0ZWQuc2l6ZX1gKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVzdFNlcnZpY2UuZ2V0Q3VzdG9tQWdlbnRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMywgJ1Nob3VsZCBzdGlsbCBkaXNjb3ZlciBhbGwgMyBhZ2VudHMnKTtcblxuXHRcdFx0Y29uc3QgZW5hYmxlZEFnZW50ID0gcmVzdWx0LmZpbmQoYSA9PiBhLm5hbWUgPT09ICdlbmFibGVkLWFnZW50Jyk7XG5cdFx0XHRhc3NlcnQub2soZW5hYmxlZEFnZW50LCAnU2hvdWxkIGZpbmQgZW5hYmxlZC1hZ2VudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuYWJsZWRBZ2VudC5lbmFibGVkLCB0cnVlLCAnZW5hYmxlZC1hZ2VudCBzaG91bGQgYmUgZW5hYmxlZCcpO1xuXG5cdFx0XHRjb25zdCBkaXNhYmxlZEFnZW50ID0gcmVzdWx0LmZpbmQoYSA9PiBhLm5hbWUgPT09ICdkaXNhYmxlZC1hZ2VudCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGRpc2FibGVkQWdlbnQsICdTaG91bGQgZmluZCBkaXNhYmxlZC1hZ2VudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc2FibGVkQWdlbnQuZW5hYmxlZCwgZmFsc2UsICdkaXNhYmxlZC1hZ2VudCBzaG91bGQgYmUgZGlzYWJsZWQnKTtcblxuXHRcdFx0Y29uc3QgYW5vdGhlckRpc2FibGVkQWdlbnQgPSByZXN1bHQuZmluZChhID0+IGEubmFtZSA9PT0gJ2Fub3RoZXItZGlzYWJsZWQtYWdlbnQnKTtcblx0XHRcdGFzc2VydC5vayhhbm90aGVyRGlzYWJsZWRBZ2VudCwgJ1Nob3VsZCBmaW5kIGFub3RoZXItZGlzYWJsZWQtYWdlbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhbm90aGVyRGlzYWJsZWRBZ2VudC5lbmFibGVkLCBmYWxzZSwgJ2Fub3RoZXItZGlzYWJsZWQtYWdlbnQgc2hvdWxkIGJlIGRpc2FibGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXREaXNjb3ZlcnlJbmZvIHJlcG9ydHMgZW5hYmxlZCBhbmQgZGlzYWJsZWQgYWdlbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnZGlzY292ZXJ5LWluZm8tYWdlbnRzJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHQvLyBVc2UgYSByZWFsIEluTWVtb3J5U3RvcmFnZVNlcnZpY2UgaW5zdGFuY2Ugc28gZGlzYWJsZWQgc3RhdGUgYWN0dWFsbHkgcGVyc2lzdHNcblx0XHRcdGluc3RhU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdHNTZXJ2aWNlKSk7XG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9hZ2VudHMvZW5hYmxlZC1hZ2VudC5hZ2VudC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdFbmFibGVkIGFnZW50LlxcJycsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdJIGFtIGVuYWJsZWQuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL2FnZW50cy9kaXNhYmxlZC1hZ2VudC5hZ2VudC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdEaXNhYmxlZCBhZ2VudC5cXCcnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSSBhbSBkaXNhYmxlZC4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIERpc2NvdmVyIHRoZSBVUklzIGFzIHRoZSBzZXJ2aWNlIHNlZXMgdGhlbSwgdGhlbiBkaXNhYmxlIG9uZVxuXHRcdFx0Y29uc3QgaW5pdGlhbCA9IGF3YWl0IHRlc3RTZXJ2aWNlLmdldEN1c3RvbUFnZW50cyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IGRpc2FibGVkID0gaW5pdGlhbC5maW5kKGEgPT4gYS5uYW1lID09PSAnZGlzYWJsZWQtYWdlbnQnKTtcblx0XHRcdGFzc2VydC5vayhkaXNhYmxlZCwgJ1Nob3VsZCBmaW5kIGRpc2FibGVkLWFnZW50IGluIGluaXRpYWwgZGlzY292ZXJ5Jyk7XG5cblx0XHRcdGNvbnN0IGRpc2FibGVkVXJpcyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRcdFx0ZGlzYWJsZWRVcmlzLmFkZChVUkkuZnJvbShkaXNhYmxlZC51cmkpKTtcblx0XHRcdHRlc3RTZXJ2aWNlLnNldERpc2FibGVkUHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuYWdlbnQsIGRpc2FibGVkVXJpcyk7XG5cblx0XHRcdGNvbnN0IGRpc2NvdmVyeUluZm8gPSBhd2FpdCB0ZXN0U2VydmljZS5nZXREaXNjb3ZlcnlJbmZvKFByb21wdHNUeXBlLmFnZW50LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNjb3ZlcnlJbmZvLnR5cGUsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNjb3ZlcnlJbmZvLmZpbGVzLmxlbmd0aCwgMiwgJ0Rpc2NvdmVyeSBzaG91bGQgaW5jbHVkZSBib3RoIGFnZW50cycpO1xuXG5cdFx0XHRjb25zdCBlbmFibGVkRmlsZSA9IGRpc2NvdmVyeUluZm8uZmlsZXMuZmluZChmID0+IGYucHJvbXB0UGF0aC51cmkucGF0aC5lbmRzV2l0aCgnZW5hYmxlZC1hZ2VudC5hZ2VudC5tZCcpKSBhcyBJQWdlbnREaXNjb3ZlcnlSZXN1bHQgfCB1bmRlZmluZWQ7XG5cdFx0XHRhc3NlcnQub2soZW5hYmxlZEZpbGUsICdTaG91bGQgcmVwb3J0IGVuYWJsZWQtYWdlbnQgaW4gZGlzY292ZXJ5IGluZm8nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmFibGVkRmlsZS5zdGF0dXMsICdsb2FkZWQnLCAnRW5hYmxlZCBhZ2VudCBzaG91bGQgYmUgbG9hZGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5hYmxlZEZpbGUuc2tpcFJlYXNvbiwgdW5kZWZpbmVkLCAnRW5hYmxlZCBhZ2VudCBzaG91bGQgbm90IGhhdmUgYSBza2lwIHJlYXNvbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKGVuYWJsZWRGaWxlLmFnZW50LCAnRW5hYmxlZCBhZ2VudCBmaWxlIHNob3VsZCBjYXJyeSByZXNvbHZlZCBhZ2VudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuYWJsZWRGaWxlLmFnZW50LmVuYWJsZWQsIHRydWUpO1xuXG5cdFx0XHRjb25zdCBkaXNhYmxlZEZpbGUgPSBkaXNjb3ZlcnlJbmZvLmZpbGVzLmZpbmQoZiA9PiBmLnByb21wdFBhdGgudXJpLnBhdGguZW5kc1dpdGgoJ2Rpc2FibGVkLWFnZW50LmFnZW50Lm1kJykpIGFzIElBZ2VudERpc2NvdmVyeVJlc3VsdCB8IHVuZGVmaW5lZDtcblx0XHRcdGFzc2VydC5vayhkaXNhYmxlZEZpbGUsICdTaG91bGQgcmVwb3J0IGRpc2FibGVkLWFnZW50IGluIGRpc2NvdmVyeSBpbmZvJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzYWJsZWRGaWxlLnN0YXR1cywgJ3NraXBwZWQnLCAnRGlzYWJsZWQgYWdlbnQgc2hvdWxkIGJlIHNraXBwZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNhYmxlZEZpbGUuc2tpcFJlYXNvbiwgJ2Rpc2FibGVkJywgJ0Rpc2FibGVkIGFnZW50IHNob3VsZCBoYXZlIHNraXBSZWFzb24gXCJkaXNhYmxlZFwiJyk7XG5cdFx0XHRhc3NlcnQub2soZGlzYWJsZWRGaWxlLmFnZW50LCAnRGlzYWJsZWQgYWdlbnQgZmlsZSBzaG91bGQgc3RpbGwgY2FycnkgcmVzb2x2ZWQgYWdlbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNhYmxlZEZpbGUuYWdlbnQuZW5hYmxlZCwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbGlzdFByb21wdEZpbGVzIC0gcHJvbXB0cycsICgpID0+IHtcblx0XHR0ZXN0KCdwcm9tcHRzIGZyb20gdXNlciBkYXRhIGZvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ3Byb21wdHMtdXNlci1kYXRhJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRjb25zdCB1c2VyUHJvbXB0c0ZvbGRlciA9ICcvaG9tZS91c2VyL3VzZXItZGF0YS1wcm9tcHRzJztcblx0XHRcdGNvbnN0IHVzZXJQcm9tcHRzRm9sZGVyVXJpID0gVVJJLmZpbGUodXNlclByb21wdHNGb2xkZXIpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5QUk9NUFRfTE9DQVRJT05TX0tFWSwge1xuXHRcdFx0XHRbUFJPTVBUX0RFRkFVTFRfU09VUkNFX0ZPTERFUl06IHRydWUsXG5cdFx0XHRcdCd+Ly5jb3BpbG90L3Byb21wdHMnOiB0cnVlLFxuXHRcdFx0XHQnfi9zaGFyZWQtcHJvbXB0cyc6IHRydWUsXG5cdFx0XHRcdCcvaG9tZS91c2VyL3NoYXJlZC1wcm9tcHRzJzogdHJ1ZSxcblx0XHRcdFx0J34vdXNlci1kYXRhLXByb21wdHMnOiB0cnVlLFxuXHRcdFx0XHRbdXNlclByb21wdHNGb2xkZXJdOiB0cnVlLFxuXHRcdFx0XHRbYCR7dXNlclByb21wdHNGb2xkZXJ9L3RlYW1gXTogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBPdmVycmlkZSB0aGUgdXNlciBkYXRhIHByb2ZpbGUgc2VydmljZVxuXHRcdFx0Y29uc3QgY3VzdG9tVXNlckRhdGFQcm9maWxlU2VydmljZSA9IHtcblx0XHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRvbkRpZENoYW5nZUN1cnJlbnRQcm9maWxlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRjdXJyZW50UHJvZmlsZToge1xuXHRcdFx0XHRcdC4uLnRvVXNlckRhdGFQcm9maWxlKCd0ZXN0JywgJ3Rlc3QnLCBVUkkuZmlsZSh1c2VyUHJvbXB0c0ZvbGRlcikud2l0aCh7IHBhdGg6ICcvdXNlci1kYXRhJyB9KSwgVVJJLmZpbGUoJy9jYWNoZScpKSxcblx0XHRcdFx0XHRwcm9tcHRzSG9tZTogdXNlclByb21wdHNGb2xkZXJVcmksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHVwZGF0ZUN1cnJlbnRQcm9maWxlOiBhc3luYyAoKSA9PiB7IH1cblx0XHRcdH07XG5cdFx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJVXNlckRhdGFQcm9maWxlU2VydmljZSwgY3VzdG9tVXNlckRhdGFQcm9maWxlU2VydmljZSk7XG5cblx0XHRcdC8vIFJlY3JlYXRlIHRoZSBzZXJ2aWNlIHdpdGggdGhlIG5ldyBzdHViIChkaXNwb3NlIGV4aXN0aW5nIHRvIGF2b2lkIGR1cGxpY2F0ZSBmaWxlc3lzdGVtIHJlZ2lzdHJhdGlvbilcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdHNTZXJ2aWNlKSk7XG5cblx0XHRcdC8vIENyZWF0ZSBwcm9tcHQgZmlsZXMgaW4gd29ya3NwYWNlLCBVc2VyIERhdGEsIGFuZCBhIGNvbmZpZ3VyZWQgcGVyc29uYWwgZm9sZGVyLlxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdC8vIFdvcmtzcGFjZSBwcm9tcHRcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvcHJvbXB0cy93b3Jrc3BhY2UtcHJvbXB0LnByb21wdC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdXb3Jrc3BhY2UgcHJvbXB0LlxcJycsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdJIGFtIGEgd29ya3NwYWNlIHByb21wdC4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0Ly8gVXNlciBkYXRhIHByb21wdFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7dXNlclByb21wdHNGb2xkZXJ9L3VzZXItcHJvbXB0LnByb21wdC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdVc2VyIGRhdGEgcHJvbXB0LlxcJycsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdJIGFtIGEgdXNlciBkYXRhIHByb21wdC4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvaG9tZS91c2VyL3NoYXJlZC1wcm9tcHRzL3NoYXJlZC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnU2hhcmVkIGNvbmZpZ3VyZWQgcHJvbXB0LlxcJycsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdJIGFtIGNvbmZpZ3VyZWQgZm9yIGJvdGggc3RvcmFnZXMuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHt1c2VyUHJvbXB0c0ZvbGRlcn0vdGVhbS90ZWFtLnByb21wdC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdOZXN0ZWQgdXNlciBkYXRhIHByb21wdC5cXCcnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSSBhbSBhIG5lc3RlZCB1c2VyIGRhdGEgcHJvbXB0LicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9ob21lL3VzZXIvLmNvcGlsb3QvcHJvbXB0cy9wZXJzb25hbC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnUGVyc29uYWwgcHJvbXB0LlxcJycsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdJIGFtIGEgcGVyc29uYWwgcHJvbXB0LicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgW2FsbFByb21wdHMsIHVzZXJQcm9tcHRzLCB3b3Jrc3BhY2VQcm9tcHRzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0dGVzdFNlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLnByb21wdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRcdHRlc3RTZXJ2aWNlLmxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2UoUHJvbXB0c1R5cGUucHJvbXB0LCBQcm9tcHRzU3RvcmFnZS51c2VyLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0dGVzdFNlcnZpY2UubGlzdFByb21wdEZpbGVzRm9yU3RvcmFnZShQcm9tcHRzVHlwZS5wcm9tcHQsIFByb21wdHNTdG9yYWdlLmxvY2FsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3Qgc3VtbWFyaXplID0gKHByb21wdHM6IHJlYWRvbmx5IElQcm9tcHRQYXRoW10pID0+IHByb21wdHNcblx0XHRcdFx0Lm1hcChwcm9tcHQgPT4gKHsgZmlsZTogYmFzZW5hbWUocHJvbXB0LnVyaSksIHN0b3JhZ2U6IHByb21wdC5zdG9yYWdlLCBzb3VyY2U6IHByb21wdC5zb3VyY2UgfSkpXG5cdFx0XHRcdC5zb3J0KChhLCBiKSA9PiBgJHthLmZpbGV9OiR7YS5zdG9yYWdlfWAubG9jYWxlQ29tcGFyZShgJHtiLmZpbGV9OiR7Yi5zdG9yYWdlfWApKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGFsbFByb21wdHM6IHN1bW1hcml6ZShhbGxQcm9tcHRzKSxcblx0XHRcdFx0dXNlclByb21wdHM6IHN1bW1hcml6ZSh1c2VyUHJvbXB0cyksXG5cdFx0XHRcdHdvcmtzcGFjZVByb21wdHM6IHN1bW1hcml6ZSh3b3Jrc3BhY2VQcm9tcHRzKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0YWxsUHJvbXB0czogW1xuXHRcdFx0XHRcdHsgZmlsZTogJ3BlcnNvbmFsLnByb21wdC5tZCcsIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsIHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5Db25maWdQZXJzb25hbCB9LFxuXHRcdFx0XHRcdHsgZmlsZTogJ3NoYXJlZC5wcm9tcHQubWQnLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgc291cmNlOiBQcm9tcHRGaWxlU291cmNlLkNvbmZpZ1dvcmtzcGFjZSB9LFxuXHRcdFx0XHRcdHsgZmlsZTogJ3NoYXJlZC5wcm9tcHQubWQnLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLCBzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuQ29uZmlnUGVyc29uYWwgfSxcblx0XHRcdFx0XHR7IGZpbGU6ICd0ZWFtLnByb21wdC5tZCcsIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsIHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5Vc2VyRGF0YSB9LFxuXHRcdFx0XHRcdHsgZmlsZTogJ3VzZXItcHJvbXB0LnByb21wdC5tZCcsIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsIHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5Vc2VyRGF0YSB9LFxuXHRcdFx0XHRcdHsgZmlsZTogJ3dvcmtzcGFjZS1wcm9tcHQucHJvbXB0Lm1kJywgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5HaXRIdWJXb3Jrc3BhY2UgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0dXNlclByb21wdHM6IFtcblx0XHRcdFx0XHR7IGZpbGU6ICdwZXJzb25hbC5wcm9tcHQubWQnLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLCBzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuQ29uZmlnUGVyc29uYWwgfSxcblx0XHRcdFx0XHR7IGZpbGU6ICdzaGFyZWQucHJvbXB0Lm1kJywgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlciwgc291cmNlOiBQcm9tcHRGaWxlU291cmNlLkNvbmZpZ1BlcnNvbmFsIH0sXG5cdFx0XHRcdFx0eyBmaWxlOiAndGVhbS5wcm9tcHQubWQnLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLCBzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuVXNlckRhdGEgfSxcblx0XHRcdFx0XHR7IGZpbGU6ICd1c2VyLXByb21wdC5wcm9tcHQubWQnLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLCBzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuVXNlckRhdGEgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0d29ya3NwYWNlUHJvbXB0czogW1xuXHRcdFx0XHRcdHsgZmlsZTogJ3NoYXJlZC5wcm9tcHQubWQnLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgc291cmNlOiBQcm9tcHRGaWxlU291cmNlLkNvbmZpZ1dvcmtzcGFjZSB9LFxuXHRcdFx0XHRcdHsgZmlsZTogJ3dvcmtzcGFjZS1wcm9tcHQucHJvbXB0Lm1kJywgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5HaXRIdWJXb3Jrc3BhY2UgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbGlzdFByb21wdEZpbGVzIC0gaW5zdHJ1Y3Rpb25zJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2luc3RydWN0aW9ucyBmcm9tIHVzZXIgZGF0YSBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdpbnN0cnVjdGlvbnMtdXNlci1kYXRhJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRjb25zdCB1c2VyUHJvbXB0c0ZvbGRlciA9ICcvaG9tZS91c2VyL3VzZXItZGF0YS1wcm9tcHRzJztcblx0XHRcdGNvbnN0IHVzZXJQcm9tcHRzRm9sZGVyVXJpID0gVVJJLmZpbGUodXNlclByb21wdHNGb2xkZXIpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5JTlNUUlVDVElPTlNfTE9DQVRJT05fS0VZLCB7XG5cdFx0XHRcdFtJTlNUUlVDVElPTlNfREVGQVVMVF9TT1VSQ0VfRk9MREVSXTogdHJ1ZSxcblx0XHRcdFx0J34vJzogdHJ1ZSxcblx0XHRcdFx0Jy9ob21lL3VzZXInOiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIE92ZXJyaWRlIHRoZSB1c2VyIGRhdGEgcHJvZmlsZSBzZXJ2aWNlXG5cdFx0XHRjb25zdCBjdXN0b21Vc2VyRGF0YVByb2ZpbGVTZXJ2aWNlID0ge1xuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdG9uRGlkQ2hhbmdlQ3VycmVudFByb2ZpbGU6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdGN1cnJlbnRQcm9maWxlOiB7XG5cdFx0XHRcdFx0Li4udG9Vc2VyRGF0YVByb2ZpbGUoJ3Rlc3QnLCAndGVzdCcsIFVSSS5maWxlKHVzZXJQcm9tcHRzRm9sZGVyKS53aXRoKHsgcGF0aDogJy91c2VyLWRhdGEnIH0pLCBVUkkuZmlsZSgnL2NhY2hlJykpLFxuXHRcdFx0XHRcdHByb21wdHNIb21lOiB1c2VyUHJvbXB0c0ZvbGRlclVyaSxcblx0XHRcdFx0fSxcblx0XHRcdFx0dXBkYXRlQ3VycmVudFByb2ZpbGU6IGFzeW5jICgpID0+IHsgfVxuXHRcdFx0fTtcblx0XHRcdGluc3RhU2VydmljZS5zdHViKElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLCBjdXN0b21Vc2VyRGF0YVByb2ZpbGVTZXJ2aWNlKTtcblxuXHRcdFx0Ly8gUmVjcmVhdGUgdGhlIHNlcnZpY2Ugd2l0aCB0aGUgbmV3IHN0dWIgKGRpc3Bvc2UgZXhpc3RpbmcgdG8gYXZvaWQgZHVwbGljYXRlIGZpbGVzeXN0ZW0gcmVnaXN0cmF0aW9uKVxuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0c1NlcnZpY2UpKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGluc3RydWN0aW9ucyBmaWxlcyBpbiBib3RoIHdvcmtzcGFjZSBhbmQgdXNlciBkYXRhIGZvbGRlclxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdC8vIFdvcmtzcGFjZSBpbnN0cnVjdGlvbnNcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvaW5zdHJ1Y3Rpb25zL3dvcmtzcGFjZS1pbnN0cnVjdGlvbnMuaW5zdHJ1Y3Rpb25zLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ1dvcmtzcGFjZSBpbnN0cnVjdGlvbnMuXFwnJyxcblx0XHRcdFx0XHRcdCdhcHBseVRvOiBcIioqLyoudHNcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdJIGFtIHdvcmtzcGFjZSBpbnN0cnVjdGlvbnMuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdC8vIFVzZXIgZGF0YSBpbnN0cnVjdGlvbnNcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3VzZXJQcm9tcHRzRm9sZGVyfS91c2VyLWluc3RydWN0aW9ucy5pbnN0cnVjdGlvbnMubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnVXNlciBkYXRhIGluc3RydWN0aW9ucy5cXCcnLFxuXHRcdFx0XHRcdFx0J2FwcGx5VG86IFwiKiovKi50c3hcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdJIGFtIHVzZXIgZGF0YSBpbnN0cnVjdGlvbnMuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBbYWxsSW5zdHJ1Y3Rpb25zLCB1c2VySW5zdHJ1Y3Rpb25zLCB3b3Jrc3BhY2VJbnN0cnVjdGlvbnNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHR0ZXN0U2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0dGVzdFNlcnZpY2UubGlzdFByb21wdEZpbGVzRm9yU3RvcmFnZShQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIFByb21wdHNTdG9yYWdlLnVzZXIsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XHR0ZXN0U2VydmljZS5saXN0UHJvbXB0RmlsZXNGb3JTdG9yYWdlKFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBzdW1tYXJpemUgPSAoaW5zdHJ1Y3Rpb25zOiByZWFkb25seSBJUHJvbXB0UGF0aFtdKSA9PiBpbnN0cnVjdGlvbnNcblx0XHRcdFx0Lm1hcChpbnN0cnVjdGlvbiA9PiAoeyBmaWxlOiBiYXNlbmFtZShpbnN0cnVjdGlvbi51cmkpLCBzdG9yYWdlOiBpbnN0cnVjdGlvbi5zdG9yYWdlLCBzb3VyY2U6IGluc3RydWN0aW9uLnNvdXJjZSB9KSlcblx0XHRcdFx0LnNvcnQoKGEsIGIpID0+IGEuZmlsZS5sb2NhbGVDb21wYXJlKGIuZmlsZSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0YWxsSW5zdHJ1Y3Rpb25zOiBzdW1tYXJpemUoYWxsSW5zdHJ1Y3Rpb25zKSxcblx0XHRcdFx0dXNlckluc3RydWN0aW9uczogc3VtbWFyaXplKHVzZXJJbnN0cnVjdGlvbnMpLFxuXHRcdFx0XHR3b3Jrc3BhY2VJbnN0cnVjdGlvbnM6IHN1bW1hcml6ZSh3b3Jrc3BhY2VJbnN0cnVjdGlvbnMpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRhbGxJbnN0cnVjdGlvbnM6IFtcblx0XHRcdFx0XHR7IGZpbGU6ICd1c2VyLWluc3RydWN0aW9ucy5pbnN0cnVjdGlvbnMubWQnLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLCBzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuVXNlckRhdGEgfSxcblx0XHRcdFx0XHR7IGZpbGU6ICd3b3Jrc3BhY2UtaW5zdHJ1Y3Rpb25zLmluc3RydWN0aW9ucy5tZCcsIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCBzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuR2l0SHViV29ya3NwYWNlIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdHVzZXJJbnN0cnVjdGlvbnM6IFtcblx0XHRcdFx0XHR7IGZpbGU6ICd1c2VyLWluc3RydWN0aW9ucy5pbnN0cnVjdGlvbnMubWQnLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLCBzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuVXNlckRhdGEgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0d29ya3NwYWNlSW5zdHJ1Y3Rpb25zOiBbXG5cdFx0XHRcdFx0eyBmaWxlOiAnd29ya3NwYWNlLWluc3RydWN0aW9ucy5pbnN0cnVjdGlvbnMubWQnLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgc291cmNlOiBQcm9tcHRGaWxlU291cmNlLkdpdEh1YldvcmtzcGFjZSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdsaXN0UHJvbXB0RmlsZXMgLSBza2lsbHMgJywgKCkgPT4ge1xuXHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdHNpbm9uLnJlc3RvcmUoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBsaXN0IHNraWxsIGZpbGVzIGZyb20gd29ya3NwYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdsaXN0LXNraWxscy13b3Jrc3BhY2UnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9za2lsbHMvc2tpbGwxL1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJTa2lsbCAxXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkZpcnN0IHNraWxsXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnU2tpbGwgMSBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmNsYXVkZS9za2lsbHMvc2tpbGwyL1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJTa2lsbCAyXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlNlY29uZCBza2lsbFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NraWxsIDIgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5za2lsbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyLCAnU2hvdWxkIGZpbmQgMiBza2lsbHMnKTtcblxuXHRcdFx0Y29uc3Qgc2tpbGwxID0gcmVzdWx0LmZpbmQocyA9PiBzLnVyaS5wYXRoLmluY2x1ZGVzKCdza2lsbDEnKSk7XG5cdFx0XHRhc3NlcnQub2soc2tpbGwxLCAnU2hvdWxkIGZpbmQgc2tpbGwxJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2tpbGwxLnR5cGUsIFByb21wdHNUeXBlLnNraWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChza2lsbDEuc3RvcmFnZSwgUHJvbXB0c1N0b3JhZ2UubG9jYWwpO1xuXG5cdFx0XHRjb25zdCBza2lsbDIgPSByZXN1bHQuZmluZChzID0+IHMudXJpLnBhdGguaW5jbHVkZXMoJ3NraWxsMicpKTtcblx0XHRcdGFzc2VydC5vayhza2lsbDIsICdTaG91bGQgZmluZCBza2lsbDInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChza2lsbDIudHlwZSwgUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNraWxsMi5zdG9yYWdlLCBQcm9tcHRzU3RvcmFnZS5sb2NhbCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbGlzdCBza2lsbCBmaWxlcyBmcm9tIHVzZXIgaG9tZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnbGlzdC1za2lsbHMtdXNlci1ob21lJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvaG9tZS91c2VyLy5jb3BpbG90L3NraWxscy9wZXJzb25hbC1za2lsbC9TS0lMTC5tZCcsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiUGVyc29uYWwgU2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSBwZXJzb25hbCBza2lsbFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1BlcnNvbmFsIHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL2hvbWUvdXNlci8uY2xhdWRlL3NraWxscy9jbGF1ZGUtcGVyc29uYWwvU0tJTEwubWQnLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIkNsYXVkZSBQZXJzb25hbCBTa2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIENsYXVkZSBwZXJzb25hbCBza2lsbFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0NsYXVkZSBwZXJzb25hbCBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLnNraWxsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Y29uc3QgcGVyc29uYWxTa2lsbHMgPSByZXN1bHQuZmlsdGVyKHMgPT4gcy5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS51c2VyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZXJzb25hbFNraWxscy5sZW5ndGgsIDIsICdTaG91bGQgZmluZCAyIHBlcnNvbmFsIHNraWxscycpO1xuXG5cdFx0XHRjb25zdCBjb3BpbG90U2tpbGwgPSBwZXJzb25hbFNraWxscy5maW5kKHMgPT4gcy51cmkucGF0aC5pbmNsdWRlcygnLmNvcGlsb3QnKSk7XG5cdFx0XHRhc3NlcnQub2soY29waWxvdFNraWxsLCAnU2hvdWxkIGZpbmQgY29waWxvdCBwZXJzb25hbCBza2lsbCcpO1xuXG5cdFx0XHRjb25zdCBjbGF1ZGVTa2lsbCA9IHBlcnNvbmFsU2tpbGxzLmZpbmQocyA9PiBzLnVyaS5wYXRoLmluY2x1ZGVzKENMQVVERV9DT05GSUdfRk9MREVSKSk7XG5cdFx0XHRhc3NlcnQub2soY2xhdWRlU2tpbGwsICdTaG91bGQgZmluZCBjbGF1ZGUgcGVyc29uYWwgc2tpbGwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgbGlzdCBza2lsbHMgd2hlbiBub3QgaW4gc2tpbGwgZm9sZGVyIHN0cnVjdHVyZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ25vLXNraWxscyc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGZpbGVzIGluIG5vbi1za2lsbCBsb2NhdGlvbnNcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9wcm9tcHRzL1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJOb3QgYSBza2lsbFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1RoaXMgaXMgaW4gcHJvbXB0cyBmb2xkZXIsIG5vdCBza2lsbHMnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS9TS0lMTC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiUm9vdCBza2lsbFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1RoaXMgaXMgaW4gcm9vdCwgbm90IHNraWxscyBmb2xkZXInLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuc2tpbGwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMCwgJ1Nob3VsZCBub3QgZmluZCBhbnkgc2tpbGxzIGluIG5vbi1za2lsbCBsb2NhdGlvbnMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbWl4ZWQgd29ya3NwYWNlIGFuZCB1c2VyIGhvbWUgc2tpbGxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdtaXhlZC1za2lsbHMnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHQvLyBXb3Jrc3BhY2Ugc2tpbGxzXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3NraWxscy93b3Jrc3BhY2Utc2tpbGwvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIldvcmtzcGFjZSBTa2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIHdvcmtzcGFjZSBza2lsbFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1dvcmtzcGFjZSBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQvLyBVc2VyIGhvbWUgc2tpbGxzXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL2hvbWUvdXNlci8uY29waWxvdC9za2lsbHMvcGVyc29uYWwtc2tpbGwvU0tJTEwubWQnLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIlBlcnNvbmFsIFNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgcGVyc29uYWwgc2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdQZXJzb25hbCBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLnNraWxsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Y29uc3Qgd29ya3NwYWNlU2tpbGxzID0gcmVzdWx0LmZpbHRlcihzID0+IHMuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UubG9jYWwpO1xuXHRcdFx0Y29uc3QgdXNlclNraWxscyA9IHJlc3VsdC5maWx0ZXIocyA9PiBzLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnVzZXIpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya3NwYWNlU2tpbGxzLmxlbmd0aCwgMSwgJ1Nob3VsZCBmaW5kIDEgd29ya3NwYWNlIHNraWxsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXNlclNraWxscy5sZW5ndGgsIDEsICdTaG91bGQgZmluZCAxIHVzZXIgc2tpbGwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXNwZWN0IGRpc2FibGVkIGRlZmF1bHQgcGF0aHMgdmlhIGNvbmZpZycsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHQvLyBEaXNhYmxlIC5naXRodWIvc2tpbGxzLCBvbmx5IC5jbGF1ZGUvc2tpbGxzIHNob3VsZCBiZSBzZWFyY2hlZFxuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7XG5cdFx0XHRcdCcuZ2l0aHViL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHQnLmNsYXVkZS9za2lsbHMnOiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ2Rpc2FibGVkLWRlZmF1bHQtdGVzdCc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3NraWxscy9naXRodWItc2tpbGwvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIkdpdEh1YiBTa2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJTaG91bGQgTk9UIGJlIGZvdW5kXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnVGhpcyBza2lsbCBpcyBpbiBhIGRpc2FibGVkIGZvbGRlcicsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5jbGF1ZGUvc2tpbGxzL2NsYXVkZS1za2lsbC9TS0lMTC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiQ2xhdWRlIFNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlNob3VsZCBiZSBmb3VuZFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1RoaXMgc2tpbGwgaXMgaW4gYW4gZW5hYmxlZCBmb2xkZXInLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuc2tpbGwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSwgJ1Nob3VsZCBmaW5kIG9ubHkgMSBza2lsbCAoZnJvbSBlbmFibGVkIGZvbGRlciknKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHRbMF0udXJpLnBhdGguaW5jbHVkZXMoJy5jbGF1ZGUvc2tpbGxzJyksICdTaG91bGQgb25seSBmaW5kIHNraWxsIGZyb20gLmNsYXVkZS9za2lsbHMnKTtcblx0XHRcdGFzc2VydC5vayghcmVzdWx0WzBdLnVyaS5wYXRoLmluY2x1ZGVzKCcuZ2l0aHViL3NraWxscycpLCAnU2hvdWxkIG5vdCBmaW5kIHNraWxsIGZyb20gZGlzYWJsZWQgLmdpdGh1Yi9za2lsbHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBleHBhbmQgdGlsZGUgcGF0aHMgaW4gY3VzdG9tIGxvY2F0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHQvLyBBZGQgYSB0aWxkZSBwYXRoIGFzIGN1c3RvbSBsb2NhdGlvblxuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7XG5cdFx0XHRcdCcuZ2l0aHViL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHQnLmNsYXVkZS9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0J34vbXktY3VzdG9tLXNraWxscyc6IHRydWUsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAndGlsZGUtdGVzdCc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Ly8gVGhlIG1vY2sgdXNlciBob21lIGlzIC9ob21lL3VzZXIsIHNvIH4vbXktY3VzdG9tLXNraWxscyBzaG91bGQgcmVzb2x2ZSB0byAvaG9tZS91c2VyL215LWN1c3RvbS1za2lsbHNcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9ob21lL3VzZXIvbXktY3VzdG9tLXNraWxscy9jdXN0b20tc2tpbGwvU0tJTEwubWQnLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIkN1c3RvbSBTa2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIHNraWxsIGZyb20gdGlsZGUgcGF0aFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NraWxsIGNvbnRlbnQgZnJvbSB+L215LWN1c3RvbS1za2lsbHMnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuc2tpbGwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSwgJ1Nob3VsZCBmaW5kIDEgc2tpbGwgZnJvbSB0aWxkZS1leHBhbmRlZCBwYXRoJyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0WzBdLnVyaS5wYXRoLmluY2x1ZGVzKCcvaG9tZS91c2VyL215LWN1c3RvbS1za2lsbHMnKSwgJ1BhdGggc2hvdWxkIGJlIGV4cGFuZGVkIGZyb20gdGlsZGUnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldFNvdXJjZUZvbGRlcnMgLSBza2lsbHMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnaW5jbHVkZXMgdXNlci1sZXZlbCBza2lsbCBzb3VyY2UgZm9sZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKCcvc2tpbGxzLXNvdXJjZS1mb2xkZXJzJyk7XG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdGNvbnN0IGZvbGRlcnMgPSBhd2FpdCBzZXJ2aWNlLmdldFNvdXJjZUZvbGRlcnMoUHJvbXB0c1R5cGUuc2tpbGwpO1xuXG5cdFx0XHRjb25zdCB1c2VyRm9sZGVycyA9IGZvbGRlcnMuZmlsdGVyKGYgPT4gZi5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS51c2VyKTtcblx0XHRcdGNvbnN0IGxvY2FsRm9sZGVycyA9IGZvbGRlcnMuZmlsdGVyKGYgPT4gZi5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5sb2NhbCk7XG5cblx0XHRcdGFzc2VydC5vayh1c2VyRm9sZGVycy5sZW5ndGggPiAwLCAnU2hvdWxkIGluY2x1ZGUgdXNlci1sZXZlbCBza2lsbCBzb3VyY2UgZm9sZGVycycpO1xuXHRcdFx0YXNzZXJ0Lm9rKGxvY2FsRm9sZGVycy5sZW5ndGggPiAwLCAnU2hvdWxkIGluY2x1ZGUgd29ya3NwYWNlLWxldmVsIHNraWxsIHNvdXJjZSBmb2xkZXJzJyk7XG5cdFx0XHRhc3NlcnQub2soXG5cdFx0XHRcdHVzZXJGb2xkZXJzLnNvbWUoZiA9PiBmLnVyaS5wYXRoID09PSAnL2hvbWUvdXNlci8uY29waWxvdC9za2lsbHMnKSxcblx0XHRcdFx0J1Nob3VsZCBpbmNsdWRlIH4vLmNvcGlsb3Qvc2tpbGxzIGFzIGEgdXNlciBzb3VyY2UgZm9sZGVyJ1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4Y2x1ZGVzIGRlZmF1bHRzIGV4cGxpY2l0bHkgZGlzYWJsZWQgdmlhIGNvbmZpZ3VyYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7XG5cdFx0XHRcdCcuZ2l0aHViL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHQnfi8uY29waWxvdC9za2lsbHMnOiBmYWxzZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUoJy9za2lsbHMtZGlzYWJsZWQtZGVmYXVsdHMnKTtcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Y29uc3QgZm9sZGVycyA9IGF3YWl0IHNlcnZpY2UuZ2V0U291cmNlRm9sZGVycyhQcm9tcHRzVHlwZS5za2lsbCk7XG5cdFx0XHRjb25zdCBwYXRocyA9IGZvbGRlcnMubWFwKGYgPT4gZi51cmkucGF0aCk7XG5cblx0XHRcdGFzc2VydC5vayghcGF0aHMuc29tZShwID0+IHAuZW5kc1dpdGgoJy8uZ2l0aHViL3NraWxscycpKSwgJ0Rpc2FibGVkIC5naXRodWIvc2tpbGxzIG11c3Qgbm90IGFwcGVhcicpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFwYXRocy5pbmNsdWRlcygnL2hvbWUvdXNlci8uY29waWxvdC9za2lsbHMnKSwgJ0Rpc2FibGVkIH4vLmNvcGlsb3Qvc2tpbGxzIG11c3Qgbm90IGFwcGVhcicpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBhdGhzLmluY2x1ZGVzKCcvaG9tZS91c2VyLy5hZ2VudHMvc2tpbGxzJyksICdOb24tZGlzYWJsZWQgfi8uYWdlbnRzL3NraWxscyBtdXN0IHN0aWxsIGFwcGVhcicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbGlzdFByb21wdEZpbGVzIC0gZXh0ZW5zaW9ucycsICgpID0+IHtcblxuXHRcdHRlc3QoJ0NvbnRyaWJ1dGVkIHByb21wdCBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vZXh0ZW5zaW9ucy9teS1leHRlbnNpb24vdGV4dE1hdGUuaW5zdHJ1Y3Rpb25zLm1kJyk7XG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSB7fSBhcyBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cdFx0XHRjb25zdCByZWdpc3RlcmVkID0gc2VydmljZS5yZWdpc3RlckNvbnRyaWJ1dGVkRmlsZShQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsXG5cdFx0XHRcdHVyaSxcblx0XHRcdFx0ZXh0ZW5zaW9uLFxuXHRcdFx0XHQnVGV4dE1hdGUgSW5zdHJ1Y3Rpb25zJyxcblx0XHRcdFx0J0luc3RydWN0aW9ucyB0byBmb2xsb3cgd2hlbiBhdXRob3JpbmcgVGV4dE1hdGUgZ3JhbW1hcnMnLFxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxbMF0udXJpLnRvU3RyaW5nKCksIHVyaS50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxbMF0ubmFtZSwgJ1RleHRNYXRlIEluc3RydWN0aW9ucycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbFswXS5zdG9yYWdlLCBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbFswXS50eXBlLCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpO1xuXHRcdFx0cmVnaXN0ZXJlZC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRJbnN0cnVjdGlvbkZpbGVzIHJldHVybnMgcmVzb2x2ZWQgbWV0YWRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9leHRlbnNpb25zL215LWV4dGVuc2lvbi90ZXh0TWF0ZS5pbnN0cnVjdGlvbnMubWQnKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IHtcblx0XHRcdFx0aWRlbnRpZmllcjogeyB2YWx1ZTogJ3Rlc3QubXktZXh0ZW5zaW9uJyB9XG5cdFx0XHR9IGFzIElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbe1xuXHRcdFx0XHRwYXRoOiB1cmkucGF0aCxcblx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogVGV4dE1hdGUgSW5zdHJ1Y3Rpb25zJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IEluc3RydWN0aW9ucyB0byBmb2xsb3cgd2hlbiBhdXRob3JpbmcgVGV4dE1hdGUgZ3JhbW1hcnMnLFxuXHRcdFx0XHRcdCdhcHBseVRvOiBcIioqLyoudG1MYW5ndWFnZS5qc29uXCInLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdVc2Ugc2NvcGVzIGNhcmVmdWxseS4nLFxuXHRcdFx0XHRdXG5cdFx0XHR9XSk7XG5cblx0XHRcdGNvbnN0IHJlZ2lzdGVyZWQgPSBzZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0ZWRGaWxlKFxuXHRcdFx0XHRQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsXG5cdFx0XHRcdHVyaSxcblx0XHRcdFx0ZXh0ZW5zaW9uLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHNlcnZpY2UuZ2V0SW5zdHJ1Y3Rpb25GaWxlcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLm1hcCgoeyB1cmksIG5hbWUsIGRlc2NyaXB0aW9uLCBwYXR0ZXJuLCBzdG9yYWdlLCBzb3VyY2UsIHBsdWdpblVyaSwgZXh0ZW5zaW9uIH0pID0+ICh7IHVyaSwgbmFtZSwgZGVzY3JpcHRpb24sIGFwcGx5VG86IHBhdHRlcm4sIHN0b3JhZ2UsIHNvdXJjZSwgcGx1Z2luVXJpLCBleHRlbnNpb24gfSkpLCBbe1xuXHRcdFx0XHR1cmksXG5cdFx0XHRcdG5hbWU6ICdUZXh0TWF0ZSBJbnN0cnVjdGlvbnMnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ0luc3RydWN0aW9ucyB0byBmb2xsb3cgd2hlbiBhdXRob3JpbmcgVGV4dE1hdGUgZ3JhbW1hcnMnLFxuXHRcdFx0XHRhcHBseVRvOiAnKiovKi50bUxhbmd1YWdlLmpzb24nLFxuXHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sXG5cdFx0XHRcdHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5FeHRlbnNpb25Db250cmlidXRpb24sXG5cdFx0XHRcdHBsdWdpblVyaTogdW5kZWZpbmVkLFxuXHRcdFx0XHRleHRlbnNpb24sXG5cdFx0XHR9XSk7XG5cblx0XHRcdHJlZ2lzdGVyZWQuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ3VzdG9tIGFnZW50IHByb3ZpZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnRVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9leHRlbnNpb25zL215LWV4dGVuc2lvbi9teUFnZW50LmFnZW50Lm1kJyk7XG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSB7XG5cdFx0XHRcdGlkZW50aWZpZXI6IHsgdmFsdWU6ICd0ZXN0Lm15LWV4dGVuc2lvbicgfSxcblx0XHRcdFx0ZW5hYmxlZEFwaVByb3Bvc2FsczogWydjaGF0UGFydGljaXBhbnRQcml2YXRlJ11cblx0XHRcdH0gYXMgdW5rbm93biBhcyBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cblx0XHRcdC8vIE1vY2sgdGhlIGFnZW50IGZpbGUgY29udGVudFxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBhZ2VudFVyaS5wYXRoLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnTXkgY3VzdG9tIGFnZW50IGZyb20gcHJvdmlkZXJcXCcnLFxuXHRcdFx0XHRcdFx0J3Rvb2xzOiBbIHRvb2wxLCB0b29sMiBdJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0kgYW0gYSBjdXN0b20gYWdlbnQgZnJvbSBhIHByb3ZpZGVyLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB7XG5cdFx0XHRcdHByb3ZpZGVQcm9tcHRGaWxlczogYXN5bmMgKF9jb250ZXh0OiBJUHJvbXB0RmlsZUNvbnRleHQsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHR1cmk6IGFnZW50VXJpXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IHNlcnZpY2UucmVnaXN0ZXJQcm9tcHRGaWxlUHJvdmlkZXIoZXh0ZW5zaW9uLCBQcm9tcHRzVHlwZS5hZ2VudCwgcHJvdmlkZXIpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBzZXJ2aWNlLmdldEN1c3RvbUFnZW50cyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxbMF0ubmFtZSwgJ215QWdlbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxbMF0uZGVzY3JpcHRpb24sICdNeSBjdXN0b20gYWdlbnQgZnJvbSBwcm92aWRlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbFswXS51cmkudG9TdHJpbmcoKSwgYWdlbnRVcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsWzBdLnNvdXJjZS5zdG9yYWdlLCBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24pO1xuXG5cdFx0XHRyZWdpc3RlcmVkLmRpc3Bvc2UoKTtcblxuXHRcdFx0Ly8gQWZ0ZXIgZGlzcG9zYWwsIHRoZSBhZ2VudCBzaG91bGQgbm8gbG9uZ2VyIGJlIGxpc3RlZFxuXHRcdFx0Y29uc3QgYWN0dWFsQWZ0ZXJEaXNwb3NlID0gYXdhaXQgc2VydmljZS5nZXRDdXN0b21BZ2VudHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsQWZ0ZXJEaXNwb3NlLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDYW5jZWxlZCBwcm9tcHQgZmlsZSBwcm92aWRlciBpcyBza2lwcGVkIHdpdGhvdXQgbG9nZ2luZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IHtcblx0XHRcdFx0aWRlbnRpZmllcjogeyB2YWx1ZTogJ3Rlc3QubXktZXh0ZW5zaW9uJyB9LFxuXHRcdFx0XHRlbmFibGVkQXBpUHJvcG9zYWxzOiBbJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnXVxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblx0XHRcdGNvbnN0IGxvZ0Vycm9yU3B5ID0gc2lub24uc3B5KGxvZ1NlcnZpY2UsICdlcnJvcicpO1xuXHRcdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IHNlcnZpY2UucmVnaXN0ZXJQcm9tcHRGaWxlUHJvdmlkZXIoZXh0ZW5zaW9uLCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIHtcblx0XHRcdFx0cHJvdmlkZVByb21wdEZpbGVzOiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpOyB9XG5cdFx0XHR9KTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZmlsZXMgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2UoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgZmlsZXMsIGVycm9yQ2FsbHM6IGxvZ0Vycm9yU3B5LmNhbGxDb3VudCB9LCB7IGZpbGVzOiBbXSwgZXJyb3JDYWxsczogMCB9KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHJlZ2lzdGVyZWQuZGlzcG9zZSgpO1xuXHRcdFx0XHRsb2dFcnJvclNweS5yZXN0b3JlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdQcm9tcHQgZmlsZSBwcm92aWRlciBlcnJvciBpcyBsb2dnZWQgYW5kIHNraXBwZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSB7XG5cdFx0XHRcdGlkZW50aWZpZXI6IHsgdmFsdWU6ICd0ZXN0Lm15LWV4dGVuc2lvbicgfSxcblx0XHRcdFx0ZW5hYmxlZEFwaVByb3Bvc2FsczogWydjaGF0UGFydGljaXBhbnRQcml2YXRlJ11cblx0XHRcdH0gYXMgdW5rbm93biBhcyBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cdFx0XHRjb25zdCBsb2dFcnJvclNweSA9IHNpbm9uLnNweShsb2dTZXJ2aWNlLCAnZXJyb3InKTtcblx0XHRcdGNvbnN0IHJlZ2lzdGVyZWQgPSBzZXJ2aWNlLnJlZ2lzdGVyUHJvbXB0RmlsZVByb3ZpZGVyKGV4dGVuc2lvbiwgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCB7XG5cdFx0XHRcdHByb3ZpZGVQcm9tcHRGaWxlczogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ3Byb3ZpZGVyIGZhaWxlZCcpOyB9XG5cdFx0XHR9KTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZmlsZXMgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2UoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgZmlsZXMsIGVycm9yQ2FsbHM6IGxvZ0Vycm9yU3B5LmNhbGxDb3VudCB9LCB7IGZpbGVzOiBbXSwgZXJyb3JDYWxsczogMSB9KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHJlZ2lzdGVyZWQuZGlzcG9zZSgpO1xuXHRcdFx0XHRsb2dFcnJvclNweS5yZXN0b3JlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDYW5jZWxlZCBwcm92aWRlciBsaXN0aW5nIHN0b3BzIHdpdGhvdXQgbG9nZ2luZyBhbiBlcnJvcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IHtcblx0XHRcdFx0aWRlbnRpZmllcjogeyB2YWx1ZTogJ3Rlc3QubXktZXh0ZW5zaW9uJyB9LFxuXHRcdFx0XHRlbmFibGVkQXBpUHJvcG9zYWxzOiBbJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnXVxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblx0XHRcdGNvbnN0IGNhbmNlbGxhdGlvblRva2VuU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0XHRcdGxldCBzZWNvbmRQcm92aWRlckNhbGxlZCA9IGZhbHNlO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm9tcHRGaWxlUHJvdmlkZXIoZXh0ZW5zaW9uLCBQcm9tcHRzVHlwZS5hZ2VudCwge1xuXHRcdFx0XHRwcm92aWRlUHJvbXB0RmlsZXM6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS5jYW5jZWwoKTtcblx0XHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm9tcHRGaWxlUHJvdmlkZXIoZXh0ZW5zaW9uLCBQcm9tcHRzVHlwZS5hZ2VudCwge1xuXHRcdFx0XHRwcm92aWRlUHJvbXB0RmlsZXM6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRzZWNvbmRQcm92aWRlckNhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCBlcnJvclNweSA9IHNpbm9uLnNweShsb2dTZXJ2aWNlLCAnZXJyb3InKTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuYWdlbnQsIGNhbmNlbGxhdGlvblRva2VuU291cmNlLnRva2VuKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0XHRzZWNvbmRQcm92aWRlckNhbGxlZCxcblx0XHRcdFx0XHRlcnJvckNvdW50OiBlcnJvclNweS5jYWxsQ291bnQsXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRzZWNvbmRQcm92aWRlckNhbGxlZDogZmFsc2UsXG5cdFx0XHRcdFx0ZXJyb3JDb3VudDogMCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRlcnJvclNweS5yZXN0b3JlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDb250cmlidXRlZCBhZ2VudCBmaWxlIHRoYXQgZG9lcyBub3QgZXhpc3Qgc2hvdWxkIG5vdCBjcmFzaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG5vbkV4aXN0ZW50VXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vZXh0ZW5zaW9ucy9teS1leHRlbnNpb24vbm9uZXhpc3RlbnQuYWdlbnQubWQnKTtcblx0XHRcdGNvbnN0IGV4aXN0aW5nVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vZXh0ZW5zaW9ucy9teS1leHRlbnNpb24vZXhpc3RpbmcuYWdlbnQubWQnKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IHtcblx0XHRcdFx0aWRlbnRpZmllcjogeyB2YWx1ZTogJ3Rlc3QubXktZXh0ZW5zaW9uJyB9XG5cdFx0XHR9IGFzIHVua25vd24gYXMgSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXG5cdFx0XHQvLyBPbmx5IGNyZWF0ZSB0aGUgZXhpc3RpbmcgZmlsZVxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBleGlzdGluZ1VyaS5wYXRoLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcXCdFeGlzdGluZyBBZ2VudFxcJycsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0FuIGFnZW50IHRoYXQgZXhpc3RzXFwnJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0kgYW0gYW4gZXhpc3RpbmcgYWdlbnQuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBSZWdpc3RlciBib3RoIGFnZW50cyAob25lIGV4aXN0cywgb25lIGRvZXNuJ3QpXG5cdFx0XHRjb25zdCByZWdpc3RlcmVkMSA9IHNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRlZEZpbGUoXG5cdFx0XHRcdFByb21wdHNUeXBlLmFnZW50LFxuXHRcdFx0XHRub25FeGlzdGVudFVyaSxcblx0XHRcdFx0ZXh0ZW5zaW9uLFxuXHRcdFx0XHQnTm9uRXhpc3RlbnQgQWdlbnQnLFxuXHRcdFx0XHQnQW4gYWdlbnQgdGhhdCBkb2VzIG5vdCBleGlzdCcsXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCByZWdpc3RlcmVkMiA9IHNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRlZEZpbGUoXG5cdFx0XHRcdFByb21wdHNUeXBlLmFnZW50LFxuXHRcdFx0XHRleGlzdGluZ1VyaSxcblx0XHRcdFx0ZXh0ZW5zaW9uLFxuXHRcdFx0XHQnRXhpc3RpbmcgQWdlbnQnLFxuXHRcdFx0XHQnQW4gYWdlbnQgdGhhdCBleGlzdHMnLFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHRoYXQgZ2V0Q3VzdG9tQWdlbnRzIGRvZXNuJ3QgY3Jhc2ggYW5kIHJldHVybnMgb25seSB0aGUgdmFsaWQgYWdlbnRcblx0XHRcdGNvbnN0IGFnZW50cyA9IGF3YWl0IHNlcnZpY2UuZ2V0Q3VzdG9tQWdlbnRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHQvLyBTaG91bGQgb25seSBnZXQgdGhlIGV4aXN0aW5nIGFnZW50LCBub3QgdGhlIG5vbi1leGlzdGVudCBvbmVcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudHMubGVuZ3RoLCAxLCAnU2hvdWxkIG9ubHkgcmV0dXJuIHRoZSBhZ2VudCB0aGF0IGV4aXN0cycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50c1swXS5uYW1lLCAnRXhpc3RpbmcgQWdlbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudHNbMF0uZGVzY3JpcHRpb24sICdBbiBhZ2VudCB0aGF0IGV4aXN0cycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50c1swXS51cmkudG9TdHJpbmcoKSwgZXhpc3RpbmdVcmkudG9TdHJpbmcoKSk7XG5cblx0XHRcdHJlZ2lzdGVyZWQxLmRpc3Bvc2UoKTtcblx0XHRcdHJlZ2lzdGVyZWQyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0NvbnRyaWJ1dGVkIGZpbGUgd2l0aCB3aGVuIGNsYXVzZSBpcyBmaWx0ZXJlZCBpbnNpZGUgUHJvbXB0c1NlcnZpY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9leHRlbnNpb25zL215LWV4dGVuc2lvbi9jb25kaXRpb25hbC5pbnN0cnVjdGlvbnMubWQnKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IHt9IGFzIElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblx0XHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gaW5zdGFTZXJ2aWNlLmdldChJQ29udGV4dEtleVNlcnZpY2UpIGFzIE1vY2tDb250ZXh0S2V5U2VydmljZTtcblx0XHRcdGNvbnN0IGNvbnRleHRNYXRjaGVzUnVsZXNTdHViID0gc2lub24uc3R1Yihjb250ZXh0S2V5U2VydmljZSwgJ2NvbnRleHRNYXRjaGVzUnVsZXMnKS5yZXR1cm5zKGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IHNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRlZEZpbGUoXG5cdFx0XHRcdFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgdXJpLCBleHRlbnNpb24sXG5cdFx0XHRcdCdDb25kaXRpb25hbCBJbnN0cnVjdGlvbnMnLCAnT25seSB3aGVuIGVuYWJsZWQnLCAnbXlGZWF0dXJlLmVuYWJsZWQnLFxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgZmlsZXMgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVzLmxlbmd0aCwgMCwgJ1Nob3VsZCBiZSBmaWx0ZXJlZCBvdXQgd2hlbiB0aGUgd2hlbiBjbGF1c2UgZG9lcyBub3QgbWF0Y2gnKTtcblxuXHRcdFx0cmVnaXN0ZXJlZC5kaXNwb3NlKCk7XG5cdFx0XHRjb250ZXh0TWF0Y2hlc1J1bGVzU3R1Yi5yZXN0b3JlKCk7XG5cblx0XHRcdGNvbnN0IGVuYWJsZWRDb250ZXh0TWF0Y2hlc1J1bGVzU3R1YiA9IHNpbm9uLnN0dWIoY29udGV4dEtleVNlcnZpY2UsICdjb250ZXh0TWF0Y2hlc1J1bGVzJykucmV0dXJucyh0cnVlKTtcblx0XHRcdGNvbnN0IGVuYWJsZWRSZWdpc3RyYXRpb24gPSBzZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0ZWRGaWxlKFxuXHRcdFx0XHRQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIHVyaSwgZXh0ZW5zaW9uLFxuXHRcdFx0XHQnQ29uZGl0aW9uYWwgSW5zdHJ1Y3Rpb25zJywgJ09ubHkgd2hlbiBlbmFibGVkJywgJ215RmVhdHVyZS5lbmFibGVkJyxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IGVuYWJsZWRGaWxlcyA9IGF3YWl0IHNlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5hYmxlZEZpbGVzLmxlbmd0aCwgMSwgJ1Nob3VsZCBiZSBpbmNsdWRlZCB3aGVuIHRoZSB3aGVuIGNsYXVzZSBtYXRjaGVzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5hYmxlZEZpbGVzWzBdLnVyaS50b1N0cmluZygpLCB1cmkudG9TdHJpbmcoKSk7XG5cblx0XHRcdGVuYWJsZWRSZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXHRcdFx0ZW5hYmxlZENvbnRleHRNYXRjaGVzUnVsZXNTdHViLnJlc3RvcmUoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1Byb3ZpZGVyIGZpbGUgd2l0aCB3aGVuIGNsYXVzZSBpcyBmaWx0ZXJlZCBpbnNpZGUgUHJvbXB0c1NlcnZpY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9leHRlbnNpb25zL3Rlc3QvbXlJbnN0cnVjdGlvbi5pbnN0cnVjdGlvbnMubWQnKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IHtcblx0XHRcdFx0aWRlbnRpZmllcjogeyB2YWx1ZTogJ3Rlc3QubXktZXh0ZW5zaW9uJyB9LFxuXHRcdFx0XHRlbmFibGVkQXBpUHJvcG9zYWxzOiBbJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnXVxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblx0XHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gaW5zdGFTZXJ2aWNlLmdldChJQ29udGV4dEtleVNlcnZpY2UpIGFzIE1vY2tDb250ZXh0S2V5U2VydmljZTtcblxuXHRcdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IHNlcnZpY2UucmVnaXN0ZXJQcm9tcHRGaWxlUHJvdmlkZXIoZXh0ZW5zaW9uLCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIHtcblx0XHRcdFx0cHJvdmlkZVByb21wdEZpbGVzOiBhc3luYyAoKSA9PiBbeyB1cmksIHdoZW46ICdjaGF0U2Vzc2lvblR5cGUgPT0gbG9jYWwnIH1dXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgY29udGV4dE1hdGNoZXNSdWxlc1N0dWIgPSBzaW5vbi5zdHViKGNvbnRleHRLZXlTZXJ2aWNlLCAnY29udGV4dE1hdGNoZXNSdWxlcycpLnJldHVybnMoZmFsc2UpO1xuXHRcdFx0Y29uc3QgZmlsZXMgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2UoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVzLmxlbmd0aCwgMCwgJ1Nob3VsZCBiZSBmaWx0ZXJlZCBvdXQgd2hlbiB0aGUgd2hlbiBjbGF1c2UgZG9lcyBub3QgbWF0Y2gnKTtcblx0XHRcdGNvbnRleHRNYXRjaGVzUnVsZXNTdHViLnJlc3RvcmUoKTtcblxuXHRcdFx0Y29uc3QgZW5hYmxlZENvbnRleHRNYXRjaGVzUnVsZXNTdHViID0gc2lub24uc3R1Yihjb250ZXh0S2V5U2VydmljZSwgJ2NvbnRleHRNYXRjaGVzUnVsZXMnKS5yZXR1cm5zKHRydWUpO1xuXHRcdFx0Y29uc3QgZW5hYmxlZEZpbGVzID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXNGb3JTdG9yYWdlKFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmFibGVkRmlsZXMubGVuZ3RoLCAxLCAnU2hvdWxkIGJlIGluY2x1ZGVkIHdoZW4gdGhlIHdoZW4gY2xhdXNlIG1hdGNoZXMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmFibGVkRmlsZXNbMF0udXJpLnRvU3RyaW5nKCksIHVyaS50b1N0cmluZygpKTtcblx0XHRcdGVuYWJsZWRDb250ZXh0TWF0Y2hlc1J1bGVzU3R1Yi5yZXN0b3JlKCk7XG5cblx0XHRcdHJlZ2lzdGVyZWQuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnUHJvdmlkZXIgd2hlbiBrZXlzIGludmFsaWRhdGUgY2FjaGVkIHJlc3VsdHMgd2hlbiBjb250ZXh0IGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFByb21wdENvbnRleHRLZXlTZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUNvbnRleHRLZXlTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRjb25zdCBwcm9tcHRzU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0c1NlcnZpY2UpKTtcblx0XHRcdGluc3RhU2VydmljZS5zdHViKElQcm9tcHRzU2VydmljZSwgcHJvbXB0c1NlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9leHRlbnNpb25zL3Rlc3QvY29uZGl0aW9uYWwuaW5zdHJ1Y3Rpb25zLm1kJyk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFt7XG5cdFx0XHRcdHBhdGg6IHVyaS5wYXRoLFxuXHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJDb25kaXRpb25hbCBJbnN0cnVjdGlvbnNcIicsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J0luc3RydWN0aW9uIGJvZHknLFxuXHRcdFx0XHRdLFxuXHRcdFx0fV0pO1xuXG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSB7XG5cdFx0XHRcdGlkZW50aWZpZXI6IHsgdmFsdWU6ICd0ZXN0Lm15LWV4dGVuc2lvbicgfSxcblx0XHRcdFx0ZW5hYmxlZEFwaVByb3Bvc2FsczogWydjaGF0UGFydGljaXBhbnRQcml2YXRlJ11cblx0XHRcdH0gYXMgdW5rbm93biBhcyBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cblx0XHRcdGNvbnN0IHJlZ2lzdGVyZWQgPSBwcm9tcHRzU2VydmljZS5yZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihleHRlbnNpb24sIFByb21wdHNUeXBlLmluc3RydWN0aW9ucywge1xuXHRcdFx0XHRwcm92aWRlUHJvbXB0RmlsZXM6IGFzeW5jICgpID0+IFt7IHVyaSwgd2hlbjogJ215RmVhdHVyZS5lbmFibGVkJyB9XVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLnNldFJ1bGVzTWF0Y2godHJ1ZSk7XG5cdFx0XHRjb25zdCBlbmFibGVkRmlsZXMgPSBhd2FpdCBwcm9tcHRzU2VydmljZS5nZXRJbnN0cnVjdGlvbkZpbGVzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuYWJsZWRGaWxlcy5sZW5ndGgsIDEsICdTaG91bGQgaW5jbHVkZSB0aGUgcHJvdmlkZXIgaW5zdHJ1Y3Rpb24gd2hlbiB0aGUgY29udGV4dCBtYXRjaGVzJyk7XG5cblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLnNldFJ1bGVzTWF0Y2goZmFsc2UpO1xuXHRcdFx0Y29udGV4dEtleVNlcnZpY2UuZmlyZURpZENoYW5nZUNvbnRleHQoWydteUZlYXR1cmUuZW5hYmxlZCddKTtcblx0XHRcdGNvbnN0IGRpc2FibGVkRmlsZXMgPSBhd2FpdCBwcm9tcHRzU2VydmljZS5nZXRJbnN0cnVjdGlvbkZpbGVzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc2FibGVkRmlsZXMubGVuZ3RoLCAwLCAnU2hvdWxkIGludmFsaWRhdGUgdGhlIGNhY2hlZCBwcm92aWRlciBpbnN0cnVjdGlvbiB3aGVuIHRoZSB0cmFja2VkIGtleSBjaGFuZ2VzJyk7XG5cblx0XHRcdHJlZ2lzdGVyZWQuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ29udHJpYnV0ZWQgZmlsZSBzZXNzaW9uVHlwZXMgbWV0YWRhdGEgaXMgcHJlc2VydmVkIGluIGNvcmUgcHJvbXB0IG1vZGVscycsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3QgYWdlbnRVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9leHRlbnNpb25zL215LWV4dGVuc2lvbi9jb250cmlidXRlZC5hZ2VudC5tZCcpO1xuXHRcdFx0Y29uc3QgaW5zdHJ1Y3Rpb25VcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9leHRlbnNpb25zL215LWV4dGVuc2lvbi9jb250cmlidXRlZC5pbnN0cnVjdGlvbnMubWQnKTtcblx0XHRcdGNvbnN0IHByb21wdFVyaSA9IFVSSS5wYXJzZSgnZmlsZTovL2V4dGVuc2lvbnMvbXktZXh0ZW5zaW9uL2NvbnRyaWJ1dGVkLnByb21wdC5tZCcpO1xuXHRcdFx0Y29uc3Qgc2tpbGxVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9leHRlbnNpb25zL215LWV4dGVuc2lvbi9jb250cmlidXRlZC1za2lsbC9TS0lMTC5tZCcpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0ge1xuXHRcdFx0XHRpZGVudGlmaWVyOiB7IHZhbHVlOiAndGVzdC5teS1leHRlbnNpb24nIH0sXG5cdFx0XHR9IGFzIElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblx0XHRcdGNvbnN0IHNlc3Npb25UeXBlcyA9IFsnY29waWxvdGNsaSddO1xuXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGFnZW50VXJpLnBhdGgsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiY29udHJpYnV0ZWQtYWdlbnRcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQ29udHJpYnV0ZWQgYWdlbnRcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdBZ2VudCBib2R5Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogaW5zdHJ1Y3Rpb25VcmkucGF0aCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJjb250cmlidXRlZC1pbnN0cnVjdGlvblwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJDb250cmlidXRlZCBpbnN0cnVjdGlvblwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0luc3RydWN0aW9uIGJvZHknLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBwcm9tcHRVcmkucGF0aCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJjb250cmlidXRlZC1wcm9tcHRcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQ29udHJpYnV0ZWQgcHJvbXB0XCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnUHJvbXB0IGJvZHknLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBza2lsbFVyaS5wYXRoLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcImNvbnRyaWJ1dGVkLXNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkNvbnRyaWJ1dGVkIHNraWxsXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnU2tpbGwgYm9keScsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZWdpc3RyYXRpb25zID0gW1xuXHRcdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0ZWRGaWxlKFByb21wdHNUeXBlLmFnZW50LCBhZ2VudFVyaSwgZXh0ZW5zaW9uLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBzZXNzaW9uVHlwZXMpLFxuXHRcdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0ZWRGaWxlKFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgaW5zdHJ1Y3Rpb25VcmksIGV4dGVuc2lvbiwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgc2Vzc2lvblR5cGVzKSxcblx0XHRcdFx0c2VydmljZS5yZWdpc3RlckNvbnRyaWJ1dGVkRmlsZShQcm9tcHRzVHlwZS5wcm9tcHQsIHByb21wdFVyaSwgZXh0ZW5zaW9uLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBzZXNzaW9uVHlwZXMpLFxuXHRcdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0ZWRGaWxlKFByb21wdHNUeXBlLnNraWxsLCBza2lsbFVyaSwgZXh0ZW5zaW9uLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBzZXNzaW9uVHlwZXMpLFxuXHRcdFx0XTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgYWdlbnQgPSAoYXdhaXQgc2VydmljZS5nZXRDdXN0b21BZ2VudHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLmZpbmQoaXRlbSA9PiBpdGVtLnVyaS50b1N0cmluZygpID09PSBhZ2VudFVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0Y29uc3QgaW5zdHJ1Y3Rpb24gPSAoYXdhaXQgc2VydmljZS5nZXRJbnN0cnVjdGlvbkZpbGVzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpKS5maW5kKGl0ZW0gPT4gaXRlbS51cmkudG9TdHJpbmcoKSA9PT0gaW5zdHJ1Y3Rpb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGNvbnN0IHByb21wdCA9IChhd2FpdCBzZXJ2aWNlLmdldFByb21wdFNsYXNoQ29tbWFuZHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLmZpbmQoaXRlbSA9PiBpdGVtLnVyaS50b1N0cmluZygpID09PSBwcm9tcHRVcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGNvbnN0IHNraWxsID0gKGF3YWl0IHNlcnZpY2UuZmluZEFnZW50U2tpbGxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpKT8uZmluZChpdGVtID0+IGl0ZW0udXJpLnRvU3RyaW5nKCkgPT09IHNraWxsVXJpLnRvU3RyaW5nKCkpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQ/LnNlc3Npb25UeXBlcywgc2Vzc2lvblR5cGVzKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpbnN0cnVjdGlvbj8uc2Vzc2lvblR5cGVzLCBzZXNzaW9uVHlwZXMpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb21wdD8uc2Vzc2lvblR5cGVzLCBzZXNzaW9uVHlwZXMpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNraWxsPy5zZXNzaW9uVHlwZXMsIHNlc3Npb25UeXBlcyk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHJlZ2lzdHJhdGlvbiBvZiByZWdpc3RyYXRpb25zKSB7XG5cdFx0XHRcdFx0cmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbGlzdFByb21wdEZpbGVzIC0gcGFyZW50IHJlcG8gZm9sZGVyJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBmaW5kIHByb21wdHMsIGluc3RydWN0aW9ucywgYW5kIGFnZW50cyBpbiBhIHBhcmVudCByZXBvIGZvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHBhcmVudEZvbGRlciA9ICcvcmVwb3MvY29sbGVjdC1wcm9tcHQtcGFyZW50LXRlc3QnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAke3BhcmVudEZvbGRlcn0vcmVwb2A7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdC8vIC5naXQgaW4gcGFyZW50IG1hcmtzIGl0IGFzIGEgcmVwbyByb290XG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtwYXJlbnRGb2xkZXJ9Ly5naXQvSEVBRGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFsncmVmOiByZWZzL2hlYWRzL21haW4nXSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Ly8gQXBwbHlpbmcgaW5zdHJ1Y3Rpb24gaW4gcGFyZW50XG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtwYXJlbnRGb2xkZXJ9Ly5naXRodWIvaW5zdHJ1Y3Rpb25zL3R5cGVzY3JpcHQuaW5zdHJ1Y3Rpb25zLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ1BhcmVudCBUeXBlU2NyaXB0IGluc3RydWN0aW9uc1xcJycsXG5cdFx0XHRcdFx0XHQnYXBwbHlUbzogXCIqKi8qLnRzXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnUGFyZW50IFR5cGVTY3JpcHQgY29kaW5nIHN0YW5kYXJkcycsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQvLyBQcm9tcHQgZmlsZSBpbiBwYXJlbnRcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3BhcmVudEZvbGRlcn0vLmdpdGh1Yi9wcm9tcHRzL2hlbHAucHJvbXB0Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ1BhcmVudCBoZWxwIHByb21wdFxcJycsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdIZWxwIHRoZSB1c2VyIHdpdGggdGhlaXIgcXVlc3Rpb24nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0Ly8gQWdlbnQgZmlsZSBpbiBwYXJlbnRcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3BhcmVudEZvbGRlcn0vLmdpdGh1Yi9hZ2VudHMvcmV2aWV3ZXIuYWdlbnQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnUGFyZW50IGNvZGUgcmV2aWV3ZXIgYWdlbnRcXCcnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnWW91IGFyZSBhIGNvZGUgcmV2aWV3ZXInLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9L3NyYy9maWxlLnRzYCxcblx0XHRcdFx0XHRjb250ZW50czogWydjb25zb2xlLmxvZyhcInRlc3RcIik7J10sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXG5cblx0XHRcdGF3YWl0IHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuSU5DTFVERV9BUFBMWUlOR19JTlNUUlVDVElPTlMsIHRydWUpO1xuXHRcdFx0YXdhaXQgdGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQ1VTVE9NSVpBVElPTlNfSU5fUEFSRU5UX1JFUE9TLCBmYWxzZSk7XG5cblx0XHRcdC8vIFdpdGggcGFyZW50IHNlYXJjaCBkaXNhYmxlZCwgc2hvdWxkIG5vdCBmaW5kIHBhcmVudCBmaWxlc1xuXHRcdFx0bGV0IHByb21wdEZpbGVzID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGxldCBhZ2VudEZpbGVzID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuYWdlbnQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0bGV0IGluc3RydWN0aW9uRmlsZXMgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQub2soIXByb21wdEZpbGVzLnNvbWUoZiA9PiBmLnVyaS5wYXRoLmluY2x1ZGVzKHBhcmVudEZvbGRlcikpLCAnU2hvdWxkIG5vdCBmaW5kIHBhcmVudCBwcm9tcHQgZmlsZXMgd2hlbiBwYXJlbnQgc2VhcmNoIGlzIGRpc2FibGVkJyk7XG5cdFx0XHRhc3NlcnQub2soIWFnZW50RmlsZXMuc29tZShmID0+IGYudXJpLnBhdGguaW5jbHVkZXMocGFyZW50Rm9sZGVyKSksICdTaG91bGQgbm90IGZpbmQgcGFyZW50IGFnZW50IGZpbGVzIHdoZW4gcGFyZW50IHNlYXJjaCBpcyBkaXNhYmxlZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFpbnN0cnVjdGlvbkZpbGVzLnNvbWUoZiA9PiBmLnVyaS5wYXRoLmluY2x1ZGVzKHBhcmVudEZvbGRlcikpLCAnU2hvdWxkIG5vdCBmaW5kIHBhcmVudCBpbnN0cnVjdGlvbiBmaWxlcyB3aGVuIHBhcmVudCBzZWFyY2ggaXMgZGlzYWJsZWQnKTtcblxuXHRcdFx0Ly8gV2l0aCBwYXJlbnQgc2VhcmNoIGVuYWJsZWQsIHNob3VsZCBmaW5kIHBhcmVudCBmaWxlc1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQ1VTVE9NSVpBVElPTlNfSU5fUEFSRU5UX1JFUE9TLCB0cnVlKTtcblx0XHRcdGZpcmVDb25maWdDaGFuZ2UodGVzdENvbmZpZ1NlcnZpY2UsIFByb21wdHNDb25maWcuVVNFX0NVU1RPTUlaQVRJT05TX0lOX1BBUkVOVF9SRVBPUyk7XG5cblx0XHRcdHByb21wdEZpbGVzID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFnZW50RmlsZXMgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5hZ2VudCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRpbnN0cnVjdGlvbkZpbGVzID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Y29uc3QgcHJvbXB0UGF0aHMgPSBwcm9tcHRGaWxlcy5tYXAoZiA9PiBmLnVyaS5wYXRoKTtcblx0XHRcdGNvbnN0IGFnZW50UGF0aHMgPSBhZ2VudEZpbGVzLm1hcChmID0+IGYudXJpLnBhdGgpO1xuXHRcdFx0Y29uc3QgaW5zdHJ1Y3Rpb25QYXRocyA9IGluc3RydWN0aW9uRmlsZXMubWFwKGYgPT4gZi51cmkucGF0aCk7XG5cblx0XHRcdGFzc2VydC5vayhwcm9tcHRQYXRocy5pbmNsdWRlcyhgJHtwYXJlbnRGb2xkZXJ9Ly5naXRodWIvcHJvbXB0cy9oZWxwLnByb21wdC5tZGApLCAnU2hvdWxkIGZpbmQgcGFyZW50IHByb21wdCBmaWxlIHdoZW4gcGFyZW50IHNlYXJjaCBpcyBlbmFibGVkJyk7XG5cdFx0XHRhc3NlcnQub2soYWdlbnRQYXRocy5pbmNsdWRlcyhgJHtwYXJlbnRGb2xkZXJ9Ly5naXRodWIvYWdlbnRzL3Jldmlld2VyLmFnZW50Lm1kYCksICdTaG91bGQgZmluZCBwYXJlbnQgYWdlbnQgZmlsZSB3aGVuIHBhcmVudCBzZWFyY2ggaXMgZW5hYmxlZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGluc3RydWN0aW9uUGF0aHMuaW5jbHVkZXMoYCR7cGFyZW50Rm9sZGVyfS8uZ2l0aHViL2luc3RydWN0aW9ucy90eXBlc2NyaXB0Lmluc3RydWN0aW9ucy5tZGApLCAnU2hvdWxkIGZpbmQgcGFyZW50IGluc3RydWN0aW9uIGZpbGUgd2hlbiBwYXJlbnQgc2VhcmNoIGlzIGVuYWJsZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZmluZCBmaWxlcyBpbiBhbiB1bnRydXN0ZWQgcGFyZW50IHJlcG8gZm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFyZW50Rm9sZGVyID0gJy9yZXBvcy91bnRydXN0ZWQtcGFyZW50LXRlc3QnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAke3BhcmVudEZvbGRlcn0vcmVwb2A7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdC8vIC5naXQgaW4gcGFyZW50IG1hcmtzIGl0IGFzIGEgcmVwbyByb290XG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtwYXJlbnRGb2xkZXJ9Ly5naXQvSEVBRGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFsncmVmOiByZWZzL2hlYWRzL21haW4nXSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Ly8gQXBwbHlpbmcgaW5zdHJ1Y3Rpb24gaW4gcGFyZW50XG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtwYXJlbnRGb2xkZXJ9Ly5naXRodWIvaW5zdHJ1Y3Rpb25zL3R5cGVzY3JpcHQuaW5zdHJ1Y3Rpb25zLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ1BhcmVudCBUeXBlU2NyaXB0IGluc3RydWN0aW9uc1xcJycsXG5cdFx0XHRcdFx0XHQnYXBwbHlUbzogXCIqKi8qLnRzXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnUGFyZW50IFR5cGVTY3JpcHQgY29kaW5nIHN0YW5kYXJkcycsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQvLyBQcm9tcHQgZmlsZSBpbiBwYXJlbnRcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3BhcmVudEZvbGRlcn0vLmdpdGh1Yi9wcm9tcHRzL2hlbHAucHJvbXB0Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ1BhcmVudCBoZWxwIHByb21wdFxcJycsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdIZWxwIHRoZSB1c2VyIHdpdGggdGhlaXIgcXVlc3Rpb24nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0Ly8gQWdlbnQgZmlsZSBpbiBwYXJlbnRcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3BhcmVudEZvbGRlcn0vLmdpdGh1Yi9hZ2VudHMvcmV2aWV3ZXIuYWdlbnQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnUGFyZW50IGNvZGUgcmV2aWV3ZXIgYWdlbnRcXCcnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnWW91IGFyZSBhIGNvZGUgcmV2aWV3ZXInLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9L3NyYy9maWxlLnRzYCxcblx0XHRcdFx0XHRjb250ZW50czogWydjb25zb2xlLmxvZyhcInRlc3RcIik7J10sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5JTkNMVURFX0FQUExZSU5HX0lOU1RSVUNUSU9OUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9DVVNUT01JWkFUSU9OU19JTl9QQVJFTlRfUkVQT1MsIHRydWUpO1xuXHRcdFx0ZmlyZUNvbmZpZ0NoYW5nZSh0ZXN0Q29uZmlnU2VydmljZSwgUHJvbXB0c0NvbmZpZy5JTkNMVURFX0FQUExZSU5HX0lOU1RSVUNUSU9OUywgUHJvbXB0c0NvbmZpZy5VU0VfQ1VTVE9NSVpBVElPTlNfSU5fUEFSRU5UX1JFUE9TKTtcblxuXG5cdFx0XHQvLyBNYXJrIHRoZSBwYXJlbnQgcmVwbyByb290IGFzIHVudHJ1c3RlZFxuXHRcdFx0d29ya3NwYWNlVHJ1c3RTZXJ2aWNlLmdldFVyaVRydXN0SW5mbyA9ICh1cmk6IFVSSSkgPT4ge1xuXHRcdFx0XHRpZiAodXJpLnBhdGggPT09IHBhcmVudEZvbGRlcikge1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoeyB0cnVzdGVkOiBmYWxzZSwgdXJpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoeyB0cnVzdGVkOiB0cnVlLCB1cmkgfSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBwcm9tcHRGaWxlcyA9IGF3YWl0IHNlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLnByb21wdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCBhZ2VudEZpbGVzID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuYWdlbnQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3QgaW5zdHJ1Y3Rpb25GaWxlcyA9IGF3YWl0IHNlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5vayghcHJvbXB0RmlsZXMuc29tZShmID0+IGYudXJpLnBhdGguaW5jbHVkZXMocGFyZW50Rm9sZGVyKSksICdTaG91bGQgbm90IGZpbmQgcGFyZW50IHByb21wdCBmaWxlcyB3aGVuIHBhcmVudCByZXBvIGlzIHVudHJ1c3RlZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFhZ2VudEZpbGVzLnNvbWUoZiA9PiBmLnVyaS5wYXRoLmluY2x1ZGVzKHBhcmVudEZvbGRlcikpLCAnU2hvdWxkIG5vdCBmaW5kIHBhcmVudCBhZ2VudCBmaWxlcyB3aGVuIHBhcmVudCByZXBvIGlzIHVudHJ1c3RlZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFpbnN0cnVjdGlvbkZpbGVzLnNvbWUoZiA9PiBmLnVyaS5wYXRoLmluY2x1ZGVzKHBhcmVudEZvbGRlcikpLCAnU2hvdWxkIG5vdCBmaW5kIHBhcmVudCBpbnN0cnVjdGlvbiBmaWxlcyB3aGVuIHBhcmVudCByZXBvIGlzIHVudHJ1c3RlZCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnN0cnVjdGlvbnMgcHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdHJ1Y3Rpb25VcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9leHRlbnNpb25zL215LWV4dGVuc2lvbi9teUluc3RydWN0aW9uLmluc3RydWN0aW9ucy5tZCcpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbiA9IHtcblx0XHRcdGlkZW50aWZpZXI6IHsgdmFsdWU6ICd0ZXN0Lm15LWV4dGVuc2lvbicgfSxcblx0XHRcdGVuYWJsZWRBcGlQcm9wb3NhbHM6IFsnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZSddXG5cdFx0fSBhcyB1bmtub3duIGFzIElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblxuXHRcdC8vIE1vY2sgdGhlIGluc3RydWN0aW9uIGZpbGUgY29udGVudFxuXHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0e1xuXHRcdFx0XHRwYXRoOiBpbnN0cnVjdGlvblVyaS5wYXRoLFxuXHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdCcjIFRlc3QgaW5zdHJ1Y3Rpb24gY29udGVudCdcblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB7XG5cdFx0XHRwcm92aWRlUHJvbXB0RmlsZXM6IGFzeW5jIChfY29udGV4dDogSVByb21wdEZpbGVDb250ZXh0LCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dXJpOiBpbnN0cnVjdGlvblVyaVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IHNlcnZpY2UucmVnaXN0ZXJQcm9tcHRGaWxlUHJvdmlkZXIoZXh0ZW5zaW9uLCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIHByb3ZpZGVyKTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHNlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXJJbnN0cnVjdGlvbiA9IGFjdHVhbC5maW5kKGkgPT4gaS51cmkudG9TdHJpbmcoKSA9PT0gaW5zdHJ1Y3Rpb25VcmkudG9TdHJpbmcoKSk7XG5cblx0XHRhc3NlcnQub2socHJvdmlkZXJJbnN0cnVjdGlvbiwgJ1Byb3ZpZGVyIGluc3RydWN0aW9uIHNob3VsZCBiZSBmb3VuZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlckluc3RydWN0aW9uIS51cmkudG9TdHJpbmcoKSwgaW5zdHJ1Y3Rpb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVySW5zdHJ1Y3Rpb24hLnN0b3JhZ2UsIFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVySW5zdHJ1Y3Rpb24hLnNvdXJjZSwgUHJvbXB0RmlsZVNvdXJjZS5FeHRlbnNpb25BUEkpO1xuXG5cdFx0cmVnaXN0ZXJlZC5kaXNwb3NlKCk7XG5cblx0XHQvLyBBZnRlciBkaXNwb3NhbCwgdGhlIGluc3RydWN0aW9uIHNob3VsZCBubyBsb25nZXIgYmUgbGlzdGVkXG5cdFx0Y29uc3QgYWN0dWFsQWZ0ZXJEaXNwb3NlID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBmb3VuZEFmdGVyRGlzcG9zZSA9IGFjdHVhbEFmdGVyRGlzcG9zZS5maW5kKGkgPT4gaS51cmkudG9TdHJpbmcoKSA9PT0gaW5zdHJ1Y3Rpb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kQWZ0ZXJEaXNwb3NlLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdQcm92aWRlciBzZXNzaW9uVHlwZXMgbWV0YWRhdGEgaXMgcHJlc2VydmVkIGluIGNvcmUgcHJvbXB0IG1vZGVscycsIGFzeW5jICgpID0+IHtcblx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0Y29uc3QgYWdlbnRVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9leHRlbnNpb25zL215LWV4dGVuc2lvbi9lbmFibGVkLmFnZW50Lm1kJyk7XG5cdFx0Y29uc3QgaW5zdHJ1Y3Rpb25VcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9leHRlbnNpb25zL215LWV4dGVuc2lvbi9lbmFibGVkLmluc3RydWN0aW9ucy5tZCcpO1xuXHRcdGNvbnN0IHByb21wdFVyaSA9IFVSSS5wYXJzZSgnZmlsZTovL2V4dGVuc2lvbnMvbXktZXh0ZW5zaW9uL2VuYWJsZWQucHJvbXB0Lm1kJyk7XG5cdFx0Y29uc3Qgc2tpbGxVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9leHRlbnNpb25zL215LWV4dGVuc2lvbi9lbmFibGVkLXNraWxsL1NLSUxMLm1kJyk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0ge1xuXHRcdFx0aWRlbnRpZmllcjogeyB2YWx1ZTogJ3Rlc3QubXktZXh0ZW5zaW9uJyB9LFxuXHRcdFx0ZW5hYmxlZEFwaVByb3Bvc2FsczogWydjaGF0UGFydGljaXBhbnRQcml2YXRlJ11cblx0XHR9IGFzIHVua25vd24gYXMgSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGVzID0gWydjb3BpbG90Y2xpJ107XG5cblx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdHtcblx0XHRcdFx0cGF0aDogYWdlbnRVcmkucGF0aCxcblx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogXCJlbmFibGVkLWFnZW50XCInLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBbiBlbmFibGVkIGFnZW50XCInLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdBZ2VudCBib2R5Jyxcblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cGF0aDogaW5zdHJ1Y3Rpb25VcmkucGF0aCxcblx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogXCJlbmFibGVkLWluc3RydWN0aW9uXCInLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBbiBlbmFibGVkIGluc3RydWN0aW9uXCInLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdJbnN0cnVjdGlvbiBib2R5Jyxcblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cGF0aDogcHJvbXB0VXJpLnBhdGgsXG5cdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J25hbWU6IFwiZW5hYmxlZC1wcm9tcHRcIicsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkFuIGVuYWJsZWQgcHJvbXB0XCInLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdQcm9tcHQgYm9keScsXG5cdFx0XHRcdF1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHBhdGg6IHNraWxsVXJpLnBhdGgsXG5cdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J25hbWU6IFwiZW5hYmxlZC1za2lsbFwiJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQW4gZW5hYmxlZCBza2lsbFwiJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnU2tpbGwgYm9keScsXG5cdFx0XHRcdF1cblx0XHRcdH0sXG5cdFx0XSk7XG5cblx0XHRjb25zdCByZWdpc3RyYXRpb25zID0gW1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihleHRlbnNpb24sIFByb21wdHNUeXBlLmFnZW50LCB7XG5cdFx0XHRcdHByb3ZpZGVQcm9tcHRGaWxlczogYXN5bmMgKCkgPT4gW3sgdXJpOiBhZ2VudFVyaSwgc2Vzc2lvblR5cGVzIH1dXG5cdFx0XHR9KSxcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm9tcHRGaWxlUHJvdmlkZXIoZXh0ZW5zaW9uLCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIHtcblx0XHRcdFx0cHJvdmlkZVByb21wdEZpbGVzOiBhc3luYyAoKSA9PiBbeyB1cmk6IGluc3RydWN0aW9uVXJpLCBzZXNzaW9uVHlwZXMgfV1cblx0XHRcdH0pLFxuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihleHRlbnNpb24sIFByb21wdHNUeXBlLnByb21wdCwge1xuXHRcdFx0XHRwcm92aWRlUHJvbXB0RmlsZXM6IGFzeW5jICgpID0+IFt7IHVyaTogcHJvbXB0VXJpLCBzZXNzaW9uVHlwZXMgfV1cblx0XHRcdH0pLFxuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihleHRlbnNpb24sIFByb21wdHNUeXBlLnNraWxsLCB7XG5cdFx0XHRcdHByb3ZpZGVQcm9tcHRGaWxlczogYXN5bmMgKCkgPT4gW3sgdXJpOiBza2lsbFVyaSwgc2Vzc2lvblR5cGVzIH1dXG5cdFx0XHR9KSxcblx0XHRdO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGFnZW50ID0gKGF3YWl0IHNlcnZpY2UuZ2V0Q3VzdG9tQWdlbnRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpKS5maW5kKGl0ZW0gPT4gaXRlbS51cmkudG9TdHJpbmcoKSA9PT0gYWdlbnRVcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCBpbnN0cnVjdGlvbiA9IChhd2FpdCBzZXJ2aWNlLmdldEluc3RydWN0aW9uRmlsZXMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLmZpbmQoaXRlbSA9PiBpdGVtLnVyaS50b1N0cmluZygpID09PSBpbnN0cnVjdGlvblVyaS50b1N0cmluZygpKTtcblx0XHRcdGNvbnN0IHByb21wdCA9IChhd2FpdCBzZXJ2aWNlLmdldFByb21wdFNsYXNoQ29tbWFuZHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLmZpbmQoaXRlbSA9PiBpdGVtLnVyaS50b1N0cmluZygpID09PSBwcm9tcHRVcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCBza2lsbCA9IChhd2FpdCBzZXJ2aWNlLmZpbmRBZ2VudFNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSk/LmZpbmQoaXRlbSA9PiBpdGVtLnVyaS50b1N0cmluZygpID09PSBza2lsbFVyaS50b1N0cmluZygpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudD8uc2Vzc2lvblR5cGVzLCBzZXNzaW9uVHlwZXMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpbnN0cnVjdGlvbj8uc2Vzc2lvblR5cGVzLCBzZXNzaW9uVHlwZXMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm9tcHQ/LnNlc3Npb25UeXBlcywgc2Vzc2lvblR5cGVzKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2tpbGw/LnNlc3Npb25UeXBlcywgc2Vzc2lvblR5cGVzKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Zm9yIChjb25zdCByZWdpc3RyYXRpb24gb2YgcmVnaXN0cmF0aW9ucykge1xuXHRcdFx0XHRyZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnUHJvbXB0IGZpbGUgcHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvbXB0VXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vZXh0ZW5zaW9ucy9teS1leHRlbnNpb24vbXlQcm9tcHQucHJvbXB0Lm1kJyk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0ge1xuXHRcdFx0aWRlbnRpZmllcjogeyB2YWx1ZTogJ3Rlc3QubXktZXh0ZW5zaW9uJyB9LFxuXHRcdFx0ZW5hYmxlZEFwaVByb3Bvc2FsczogWydjaGF0UGFydGljaXBhbnRQcml2YXRlJ11cblx0XHR9IGFzIHVua25vd24gYXMgSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXG5cdFx0Ly8gTW9jayB0aGUgcHJvbXB0IGZpbGUgY29udGVudFxuXHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0e1xuXHRcdFx0XHRwYXRoOiBwcm9tcHRVcmkucGF0aCxcblx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHQnIyBUZXN0IHByb21wdCBjb250ZW50J1xuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0XSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHtcblx0XHRcdHByb3ZpZGVQcm9tcHRGaWxlczogYXN5bmMgKF9jb250ZXh0OiBJUHJvbXB0RmlsZUNvbnRleHQsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR1cmk6IHByb21wdFVyaVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IHNlcnZpY2UucmVnaXN0ZXJQcm9tcHRGaWxlUHJvdmlkZXIoZXh0ZW5zaW9uLCBQcm9tcHRzVHlwZS5wcm9tcHQsIHByb3ZpZGVyKTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHNlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLnByb21wdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXJQcm9tcHQgPSBhY3R1YWwuZmluZChpID0+IGkudXJpLnRvU3RyaW5nKCkgPT09IHByb21wdFVyaS50b1N0cmluZygpKTtcblxuXHRcdGFzc2VydC5vayhwcm92aWRlclByb21wdCwgJ1Byb3ZpZGVyIHByb21wdCBzaG91bGQgYmUgZm91bmQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJQcm9tcHQhLnVyaS50b1N0cmluZygpLCBwcm9tcHRVcmkudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyUHJvbXB0IS5zdG9yYWdlLCBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlclByb21wdCEuc291cmNlLCBQcm9tcHRGaWxlU291cmNlLkV4dGVuc2lvbkFQSSk7XG5cblx0XHRyZWdpc3RlcmVkLmRpc3Bvc2UoKTtcblxuXHRcdC8vIEFmdGVyIGRpc3Bvc2FsLCB0aGUgcHJvbXB0IHNob3VsZCBubyBsb25nZXIgYmUgbGlzdGVkXG5cdFx0Y29uc3QgYWN0dWFsQWZ0ZXJEaXNwb3NlID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBmb3VuZEFmdGVyRGlzcG9zZSA9IGFjdHVhbEFmdGVyRGlzcG9zZS5maW5kKGkgPT4gaS51cmkudG9TdHJpbmcoKSA9PT0gcHJvbXB0VXJpLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZEFmdGVyRGlzcG9zZSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnU2tpbGwgZmlsZSBwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBza2lsbFVyaSA9IFVSSS5wYXJzZSgnZmlsZTovL2V4dGVuc2lvbnMvbXktZXh0ZW5zaW9uL215U2tpbGwvU0tJTEwubWQnKTtcblx0XHRjb25zdCBleHRlbnNpb24gPSB7XG5cdFx0XHRpZGVudGlmaWVyOiB7IHZhbHVlOiAndGVzdC5teS1leHRlbnNpb24nIH0sXG5cdFx0XHRlbmFibGVkQXBpUHJvcG9zYWxzOiBbJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnXVxuXHRcdH0gYXMgdW5rbm93biBhcyBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cblx0XHQvLyBNb2NrIHRoZSBza2lsbCBmaWxlIGNvbnRlbnRcblx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdHtcblx0XHRcdFx0cGF0aDogc2tpbGxVcmkucGF0aCxcblx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogXCJNeSBDdXN0b20gU2tpbGxcIicsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgY3VzdG9tIHNraWxsIGZyb20gcHJvdmlkZXJcIicsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J0N1c3RvbSBza2lsbCBjb250ZW50LicsXG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHRdKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0ge1xuXHRcdFx0cHJvdmlkZVByb21wdEZpbGVzOiBhc3luYyAoX2NvbnRleHQ6IElQcm9tcHRGaWxlQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHVyaTogc2tpbGxVcmlcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF07XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlZ2lzdGVyZWQgPSBzZXJ2aWNlLnJlZ2lzdGVyUHJvbXB0RmlsZVByb3ZpZGVyKGV4dGVuc2lvbiwgUHJvbXB0c1R5cGUuc2tpbGwsIHByb3ZpZGVyKTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHNlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLnNraWxsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBwcm92aWRlclNraWxsID0gYWN0dWFsLmZpbmQoaSA9PiBpLnVyaS50b1N0cmluZygpID09PSBza2lsbFVyaS50b1N0cmluZygpKTtcblxuXHRcdGFzc2VydC5vayhwcm92aWRlclNraWxsLCAnUHJvdmlkZXIgc2tpbGwgc2hvdWxkIGJlIGZvdW5kJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyU2tpbGwhLnVyaS50b1N0cmluZygpLCBza2lsbFVyaS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJTa2lsbCEuc3RvcmFnZSwgUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJTa2lsbCEuc291cmNlLCBQcm9tcHRGaWxlU291cmNlLkV4dGVuc2lvbkFQSSk7XG5cblx0XHRyZWdpc3RlcmVkLmRpc3Bvc2UoKTtcblxuXHRcdC8vIEFmdGVyIGRpc3Bvc2FsLCB0aGUgc2tpbGwgc2hvdWxkIG5vIGxvbmdlciBiZSBsaXN0ZWRcblx0XHRjb25zdCBhY3R1YWxBZnRlckRpc3Bvc2UgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5za2lsbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgZm91bmRBZnRlckRpc3Bvc2UgPSBhY3R1YWxBZnRlckRpc3Bvc2UuZmluZChpID0+IGkudXJpLnRvU3RyaW5nKCkgPT09IHNraWxsVXJpLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZEFmdGVyRGlzcG9zZSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0c3VpdGUoJ2ZpbmRBZ2VudFNraWxscycsICgpID0+IHtcblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRzaW5vbi5yZXN0b3JlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCB3aGVuIFVTRV9BR0VOVF9TS0lMTFMgaXMgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5maW5kQWdlbnRTa2lsbHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGZpbmQgc2tpbGxzIGluIHdvcmtzcGFjZSBhbmQgdXNlciBob21lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdhZ2VudC1za2lsbHMtdGVzdCc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIG1vY2sgZmlsZXN5c3RlbSB3aXRoIHNraWxscyBpbiBib3RoIC5naXRodWIvc2tpbGxzIGFuZCAuY2xhdWRlL3NraWxsc1xuXHRcdFx0Ly8gRm9sZGVyIG5hbWVzIG11c3QgbWF0Y2ggdGhlIHNraWxsIG5hbWVzIGV4YWN0bHkgKHBlciBhZ2VudHNraWxscy5pbyBzcGVjaWZpY2F0aW9uKVxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3NraWxscy9HaXRIdWIgU2tpbGwgMS9TS0lMTC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiR2l0SHViIFNraWxsIDFcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSBHaXRIdWIgc2tpbGwgZm9yIHRlc3RpbmdcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdUaGlzIGlzIEdpdEh1YiBza2lsbCAxIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uY2xhdWRlL3NraWxscy9DbGF1ZGUgU2tpbGwgMS9TS0lMTC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiQ2xhdWRlIFNraWxsIDFcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSBDbGF1ZGUgc2tpbGwgZm9yIHRlc3RpbmdcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdUaGlzIGlzIENsYXVkZSBza2lsbCAxIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uY2xhdWRlL3NraWxscy9pbnZhbGlkLXNraWxsL1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiSW52YWxpZCBza2lsbCwgbm8gbmFtZVwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1RoaXMgaXMgaW52YWxpZCBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9za2lsbHMvbm90LWEtc2tpbGwtZGlyL1JFQURNRS5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFsnVGhpcyBpcyBub3QgYSBza2lsbCddLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9ob21lL3VzZXIvLmNsYXVkZS9za2lsbHMvUGVyc29uYWwgU2tpbGwgMS9TS0lMTC5tZCcsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiUGVyc29uYWwgU2tpbGwgMVwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIHBlcnNvbmFsIHNraWxsIGZvciB0ZXN0aW5nXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnVGhpcyBpcyBwZXJzb25hbCBza2lsbCAxIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL2hvbWUvdXNlci8uY2xhdWRlL3NraWxscy9ub3QtYS1za2lsbC9vdGhlci1maWxlLm1kJyxcblx0XHRcdFx0XHRjb250ZW50czogWydOb3QgYSBza2lsbCBmaWxlJ10sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL2hvbWUvdXNlci8uY29waWxvdC9za2lsbHMvQ29waWxvdCBTa2lsbCAxL1NLSUxMLm1kJyxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJDb3BpbG90IFNraWxsIDFcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSBDb3BpbG90IHNraWxsIGZvciB0ZXN0aW5nXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnVGhpcyBpcyBDb3BpbG90IHNraWxsIDEgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBhbGxSZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmZpbmRBZ2VudFNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGFsbFJlc3VsdCwgJ1Nob3VsZCByZXR1cm4gcmVzdWx0cyB3aGVuIGFnZW50IHNraWxscyBhcmUgZW5hYmxlZCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWxsUmVzdWx0O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDUsICdTaG91bGQgZmluZCA1IHNraWxscyB0b3RhbCcpO1xuXG5cdFx0XHQvLyBDaGVjayBwcm9qZWN0IHNraWxscyAoYm90aCBmcm9tIC5naXRodWIvc2tpbGxzIGFuZCAuY2xhdWRlL3NraWxscylcblx0XHRcdGNvbnN0IHByb2plY3RTa2lsbHMgPSByZXN1bHQuZmlsdGVyKHNraWxsID0+IHNraWxsLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmxvY2FsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9qZWN0U2tpbGxzLmxlbmd0aCwgMywgJ1Nob3VsZCBmaW5kIDMgcHJvamVjdCBza2lsbHMnKTtcblxuXHRcdFx0Y29uc3QgZ2l0aHViU2tpbGwxID0gcHJvamVjdFNraWxscy5maW5kKHNraWxsID0+IHNraWxsLm5hbWUgPT09ICdHaXRIdWIgU2tpbGwgMScpO1xuXHRcdFx0YXNzZXJ0Lm9rKGdpdGh1YlNraWxsMSwgJ1Nob3VsZCBmaW5kIEdpdEh1YiBza2lsbCAxJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2l0aHViU2tpbGwxLmRlc2NyaXB0aW9uLCAnQSBHaXRIdWIgc2tpbGwgZm9yIHRlc3RpbmcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnaXRodWJTa2lsbDEudXJpLnBhdGgsIGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvc2tpbGxzL0dpdEh1YiBTa2lsbCAxL1NLSUxMLm1kYCk7XG5cblx0XHRcdGNvbnN0IGNsYXVkZVNraWxsMSA9IHByb2plY3RTa2lsbHMuZmluZChza2lsbCA9PiBza2lsbC5uYW1lID09PSAnQ2xhdWRlIFNraWxsIDEnKTtcblx0XHRcdGFzc2VydC5vayhjbGF1ZGVTa2lsbDEsICdTaG91bGQgZmluZCBDbGF1ZGUgc2tpbGwgMScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsYXVkZVNraWxsMS5kZXNjcmlwdGlvbiwgJ0EgQ2xhdWRlIHNraWxsIGZvciB0ZXN0aW5nJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xhdWRlU2tpbGwxLnVyaS5wYXRoLCBgJHtyb290Rm9sZGVyfS8uY2xhdWRlL3NraWxscy9DbGF1ZGUgU2tpbGwgMS9TS0lMTC5tZGApO1xuXG5cdFx0XHQvLyBUaGUgaW52YWxpZC1za2lsbCAobm8gbmFtZSBhdHRyaWJ1dGUpIHNob3VsZCBub3cgdXNlIGZvbGRlciBuYW1lIGFzIGZhbGxiYWNrXG5cdFx0XHRjb25zdCBpbnZhbGlkU2tpbGwgPSBwcm9qZWN0U2tpbGxzLmZpbmQoc2tpbGwgPT4gc2tpbGwubmFtZSA9PT0gJ2ludmFsaWQtc2tpbGwnKTtcblx0XHRcdGFzc2VydC5vayhpbnZhbGlkU2tpbGwsICdTaG91bGQgZmluZCBpbnZhbGlkLXNraWxsIHVzaW5nIGZvbGRlciBuYW1lIGFzIGZhbGxiYWNrJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52YWxpZFNraWxsLmRlc2NyaXB0aW9uLCAnSW52YWxpZCBza2lsbCwgbm8gbmFtZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludmFsaWRTa2lsbC51cmkucGF0aCwgYCR7cm9vdEZvbGRlcn0vLmNsYXVkZS9za2lsbHMvaW52YWxpZC1za2lsbC9TS0lMTC5tZGApO1xuXG5cdFx0XHQvLyBDaGVjayBwZXJzb25hbCBza2lsbHNcblx0XHRcdGNvbnN0IHBlcnNvbmFsU2tpbGxzID0gcmVzdWx0LmZpbHRlcihza2lsbCA9PiBza2lsbC5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS51c2VyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZXJzb25hbFNraWxscy5sZW5ndGgsIDIsICdTaG91bGQgZmluZCAyIHBlcnNvbmFsIHNraWxscycpO1xuXG5cdFx0XHRjb25zdCBwZXJzb25hbFNraWxsMSA9IHBlcnNvbmFsU2tpbGxzLmZpbmQoc2tpbGwgPT4gc2tpbGwubmFtZSA9PT0gJ1BlcnNvbmFsIFNraWxsIDEnKTtcblx0XHRcdGFzc2VydC5vayhwZXJzb25hbFNraWxsMSwgJ1Nob3VsZCBmaW5kIFBlcnNvbmFsIFNraWxsIDEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZXJzb25hbFNraWxsMS5kZXNjcmlwdGlvbiwgJ0EgcGVyc29uYWwgc2tpbGwgZm9yIHRlc3RpbmcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZXJzb25hbFNraWxsMS51cmkucGF0aCwgJy9ob21lL3VzZXIvLmNsYXVkZS9za2lsbHMvUGVyc29uYWwgU2tpbGwgMS9TS0lMTC5tZCcpO1xuXG5cdFx0XHRjb25zdCBjb3BpbG90U2tpbGwxID0gcGVyc29uYWxTa2lsbHMuZmluZChza2lsbCA9PiBza2lsbC5uYW1lID09PSAnQ29waWxvdCBTa2lsbCAxJyk7XG5cdFx0XHRhc3NlcnQub2soY29waWxvdFNraWxsMSwgJ1Nob3VsZCBmaW5kIENvcGlsb3QgU2tpbGwgMScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvcGlsb3RTa2lsbDEuZGVzY3JpcHRpb24sICdBIENvcGlsb3Qgc2tpbGwgZm9yIHRlc3RpbmcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3BpbG90U2tpbGwxLnVyaS5wYXRoLCAnL2hvbWUvdXNlci8uY29waWxvdC9za2lsbHMvQ29waWxvdCBTa2lsbCAxL1NLSUxMLm1kJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHBhcnNpbmcgZXJyb3JzIGdyYWNlZnVsbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ3NraWxscy1lcnJvci10ZXN0Jztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHQvLyBDcmVhdGUgbW9jayBmaWxlc3lzdGVtIHdpdGggbWFsZm9ybWVkIHNraWxsIGZpbGUgaW4gLmdpdGh1Yi9za2lsbHNcblx0XHRcdC8vIEZvbGRlciBuYW1lcyBtdXN0IG1hdGNoIHRoZSBza2lsbCBuYW1lcyBleGFjdGx5XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvc2tpbGxzL1ZhbGlkIFNraWxsL1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJWYWxpZCBTa2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIHZhbGlkIHNraWxsXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnVmFsaWQgc2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5jbGF1ZGUvc2tpbGxzL2ludmFsaWQtc2tpbGwvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdpbnZhbGlkIHlhbWw6IFt1bmNsb3NlZCcsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdJbnZhbGlkIHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgYWxsUmVzdWx0ID0gYXdhaXQgc2VydmljZS5maW5kQWdlbnRTa2lsbHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdC8vIFNob3VsZCByZXR1cm4gYm90aCBza2lsbHMgLSB0aGUgbWFsZm9ybWVkIG9uZSB1c2VzIGZvbGRlciBuYW1lIGFzIGZhbGxiYWNrXG5cdFx0XHRhc3NlcnQub2soYWxsUmVzdWx0LCAnU2hvdWxkIHJldHVybiByZXN1bHRzIGV2ZW4gd2l0aCBwYXJzaW5nIGVycm9ycycpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWxsUmVzdWx0O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIsICdTaG91bGQgZmluZCAyIHNraWxscycpO1xuXG5cdFx0XHRjb25zdCB2YWxpZFNraWxsID0gcmVzdWx0LmZpbmQocyA9PiBzLm5hbWUgPT09ICdWYWxpZCBTa2lsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbGlkU2tpbGwsICdTaG91bGQgZmluZCB0aGUgdmFsaWQgc2tpbGwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWxpZFNraWxsLnN0b3JhZ2UsIFByb21wdHNTdG9yYWdlLmxvY2FsKTtcblxuXHRcdFx0Y29uc3QgaW52YWxpZFNraWxsID0gcmVzdWx0LmZpbmQocyA9PiBzLm5hbWUgPT09ICdpbnZhbGlkLXNraWxsJyk7XG5cdFx0XHRhc3NlcnQub2soaW52YWxpZFNraWxsLCAnU2hvdWxkIGZpbmQgc2tpbGwgd2l0aCBmb2xkZXIgbmFtZSBhcyBmYWxsYmFjayBkZXNwaXRlIG1hbGZvcm1lZCBZQU1MJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52YWxpZFNraWxsLnN0b3JhZ2UsIFByb21wdHNTdG9yYWdlLmxvY2FsKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gZW1wdHkgYXJyYXkgd2hlbiBubyBza2lsbHMgZm91bmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdlbXB0eS13b3Jrc3BhY2UnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdC8vIENyZWF0ZSBlbXB0eSBtb2NrIGZpbGVzeXN0ZW1cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW10pO1xuXG5cdFx0XHRjb25zdCBhbGxSZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmZpbmRBZ2VudFNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGFsbFJlc3VsdCwgJ1Nob3VsZCByZXR1cm4gcmVzdWx0cyBhcnJheScpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWxsUmVzdWx0O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDAsICdTaG91bGQgZmluZCBubyBza2lsbHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB0cnVuY2F0ZSBsb25nIG5hbWVzIGFuZCBkZXNjcmlwdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ3RydW5jYXRpb24tdGVzdCc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Y29uc3QgbG9uZ05hbWUgPSAnQScucmVwZWF0KDEwMCk7IC8vIEV4Y2VlZHMgNjQgY2hhcmFjdGVyc1xuXHRcdFx0Y29uc3QgdHJ1bmNhdGVkTmFtZSA9ICdBJy5yZXBlYXQoNjQpOyAvLyBFeHBlY3RlZCBhZnRlciB0cnVuY2F0aW9uXG5cdFx0XHRjb25zdCBsb25nRGVzY3JpcHRpb24gPSAnQicucmVwZWF0KDE1MDApOyAvLyBFeGNlZWRzIDEwMjQgY2hhcmFjdGVyc1xuXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdC8vIEZvbGRlciBuYW1lIG11c3QgbWF0Y2ggdGhlIHRydW5jYXRlZCBza2lsbCBuYW1lXG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9za2lsbHMvJHt0cnVuY2F0ZWROYW1lfS9TS0lMTC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0YG5hbWU6IFwiJHtsb25nTmFtZX1cImAsXG5cdFx0XHRcdFx0XHRgZGVzY3JpcHRpb246IFwiJHtsb25nRGVzY3JpcHRpb259XCJgLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnU2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBhbGxSZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmZpbmRBZ2VudFNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGFsbFJlc3VsdCwgJ1Nob3VsZCByZXR1cm4gcmVzdWx0cycpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWxsUmVzdWx0O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEsICdTaG91bGQgZmluZCAxIHNraWxsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLm5hbWUubGVuZ3RoLCA2NCwgJ05hbWUgc2hvdWxkIGJlIHRydW5jYXRlZCB0byA2NCBjaGFyYWN0ZXJzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmRlc2NyaXB0aW9uPy5sZW5ndGgsIDEwMjQsICdEZXNjcmlwdGlvbiBzaG91bGQgYmUgdHJ1bmNhdGVkIHRvIDEwMjQgY2hhcmFjdGVycycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlbW92ZSBYTUwgdGFncyBmcm9tIG5hbWUgYW5kIGRlc2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICd4bWwtdGVzdCc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Ly8gRm9sZGVyIG5hbWUgbXVzdCBtYXRjaCB0aGUgc2FuaXRpemVkIHNraWxsIG5hbWUgKHdpdGggWE1MIHRhZ3MgcmVtb3ZlZClcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9za2lsbHMvU2tpbGwgd2l0aCBYTUwgdGFncy9TS0lMTC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiU2tpbGwgPGI+d2l0aDwvYj4gPGVtPlhNTDwvZW0+IHRhZ3NcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiRGVzY3JpcHRpb24gd2l0aCA8c3Ryb25nPkhUTUw8L3N0cm9uZz4gYW5kIDxzcGFuPm90aGVyPC9zcGFuPiB0YWdzXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnU2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBhbGxSZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmZpbmRBZ2VudFNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGFsbFJlc3VsdCwgJ1Nob3VsZCByZXR1cm4gcmVzdWx0cycpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWxsUmVzdWx0O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEsICdTaG91bGQgZmluZCAxIHNraWxsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLm5hbWUsICdTa2lsbCB3aXRoIFhNTCB0YWdzJywgJ1hNTCB0YWdzIHNob3VsZCBiZSByZW1vdmVkIGZyb20gbmFtZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5kZXNjcmlwdGlvbiwgJ0Rlc2NyaXB0aW9uIHdpdGggSFRNTCBhbmQgb3RoZXIgdGFncycsICdYTUwgdGFncyBzaG91bGQgYmUgcmVtb3ZlZCBmcm9tIGRlc2NyaXB0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGJvdGggdHJ1bmNhdGlvbiBhbmQgWE1MIHJlbW92YWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ2NvbWJpbmVkLXRlc3QnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdGNvbnN0IGxvbmdOYW1lV2l0aFhtbCA9ICc8cD4nICsgJ0EnLnJlcGVhdCgxMDApICsgJzwvcD4nOyAvLyBFeGNlZWRzIDY0IGNoYXJzIGFuZCBoYXMgWE1MXG5cdFx0XHRjb25zdCB0cnVuY2F0ZWROYW1lID0gJ0EnLnJlcGVhdCg2NCk7IC8vIEV4cGVjdGVkIGFmdGVyIFhNTCByZW1vdmFsIGFuZCB0cnVuY2F0aW9uXG5cdFx0XHRjb25zdCBsb25nRGVzY1dpdGhYbWwgPSAnPGRpdj4nICsgJ0InLnJlcGVhdCgxNTAwKSArICc8L2Rpdj4nOyAvLyBFeGNlZWRzIDEwMjQgY2hhcnMgYW5kIGhhcyBYTUxcblxuXHRcdFx0Ly8gRm9sZGVyIG5hbWUgbXVzdCBtYXRjaCB0aGUgZnVsbHkgc2FuaXRpemVkIHNraWxsIG5hbWVcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9za2lsbHMvJHt0cnVuY2F0ZWROYW1lfS9TS0lMTC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0YG5hbWU6IFwiJHtsb25nTmFtZVdpdGhYbWx9XCJgLFxuXHRcdFx0XHRcdFx0YGRlc2NyaXB0aW9uOiBcIiR7bG9uZ0Rlc2NXaXRoWG1sfVwiYCxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgYWxsUmVzdWx0ID0gYXdhaXQgc2VydmljZS5maW5kQWdlbnRTa2lsbHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5vayhhbGxSZXN1bHQsICdTaG91bGQgcmV0dXJuIHJlc3VsdHMnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFsbFJlc3VsdDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxLCAnU2hvdWxkIGZpbmQgMSBza2lsbCcpO1xuXHRcdFx0Ly8gWE1MIHRhZ3MgYXJlIHJlbW92ZWQgZmlyc3QsIHRoZW4gdHJ1bmNhdGlvbiBoYXBwZW5zXG5cdFx0XHRhc3NlcnQub2soIXJlc3VsdFswXS5uYW1lLmluY2x1ZGVzKCc8JyksICdOYW1lIHNob3VsZCBub3QgY29udGFpbiBYTUwgdGFncycpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFyZXN1bHRbMF0ubmFtZS5pbmNsdWRlcygnPicpLCAnTmFtZSBzaG91bGQgbm90IGNvbnRhaW4gWE1MIHRhZ3MnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0ubmFtZS5sZW5ndGgsIDY0LCAnTmFtZSBzaG91bGQgYmUgdHJ1bmNhdGVkIHRvIDY0IGNoYXJhY3RlcnMnKTtcblx0XHRcdGFzc2VydC5vayghcmVzdWx0WzBdLmRlc2NyaXB0aW9uPy5pbmNsdWRlcygnPCcpLCAnRGVzY3JpcHRpb24gc2hvdWxkIG5vdCBjb250YWluIFhNTCB0YWdzJyk7XG5cdFx0XHRhc3NlcnQub2soIXJlc3VsdFswXS5kZXNjcmlwdGlvbj8uaW5jbHVkZXMoJz4nKSwgJ0Rlc2NyaXB0aW9uIHNob3VsZCBub3QgY29udGFpbiBYTUwgdGFncycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5kZXNjcmlwdGlvbj8ubGVuZ3RoLCAxMDI0LCAnRGVzY3JpcHRpb24gc2hvdWxkIGJlIHRydW5jYXRlZCB0byAxMDI0IGNoYXJhY3RlcnMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBza2lwIGR1cGxpY2F0ZSBza2lsbCBuYW1lcyBhbmQga2VlcCBmaXJzdCBieSBwcmlvcml0eScsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnZHVwbGljYXRlLXNraWxscy10ZXN0Jztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHQvLyBDcmVhdGUgc2tpbGxzIHdpdGggZHVwbGljYXRlIG5hbWVzIGluIGRpZmZlcmVudCBsb2NhdGlvbnNcblx0XHRcdC8vIFdvcmtzcGFjZSBza2lsbCBzaG91bGQgYmUga2VwdCAoaGlnaGVyIHByaW9yaXR5KSwgdXNlciBza2lsbCBzaG91bGQgYmUgc2tpcHBlZFxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3NraWxscy9EdXBsaWNhdGUgU2tpbGwvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIkR1cGxpY2F0ZSBTa2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJXb3Jrc3BhY2UgdmVyc2lvblwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1dvcmtzcGFjZSBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9ob21lL3VzZXIvLmNvcGlsb3Qvc2tpbGxzL0R1cGxpY2F0ZSBTa2lsbC9TS0lMTC5tZCcsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiRHVwbGljYXRlIFNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlVzZXIgdmVyc2lvbiAtIHNob3VsZCBiZSBza2lwcGVkXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnVXNlciBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmNsYXVkZS9za2lsbHMvVW5pcXVlIFNraWxsL1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJVbmlxdWUgU2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSB1bmlxdWUgc2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdVbmlxdWUgc2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBhbGxSZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmZpbmRBZ2VudFNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGFsbFJlc3VsdCwgJ1Nob3VsZCByZXR1cm4gcmVzdWx0cycpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWxsUmVzdWx0O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIsICdTaG91bGQgZmluZCAyIHNraWxscyAoZHVwbGljYXRlIHNraXBwZWQpJyk7XG5cblx0XHRcdGNvbnN0IGR1cGxpY2F0ZVNraWxsID0gcmVzdWx0LmZpbmQocyA9PiBzLm5hbWUgPT09ICdEdXBsaWNhdGUgU2tpbGwnKTtcblx0XHRcdGFzc2VydC5vayhkdXBsaWNhdGVTa2lsbCwgJ1Nob3VsZCBmaW5kIHRoZSBkdXBsaWNhdGUgc2tpbGwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkdXBsaWNhdGVTa2lsbC5kZXNjcmlwdGlvbiwgJ1dvcmtzcGFjZSB2ZXJzaW9uJywgJ1Nob3VsZCBrZWVwIHdvcmtzcGFjZSB2ZXJzaW9uIChoaWdoZXIgcHJpb3JpdHkpJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZHVwbGljYXRlU2tpbGwuc3RvcmFnZSwgUHJvbXB0c1N0b3JhZ2UubG9jYWwsICdTaG91bGQgYmUgZnJvbSB3b3Jrc3BhY2UnKTtcblxuXHRcdFx0Y29uc3QgdW5pcXVlU2tpbGwgPSByZXN1bHQuZmluZChzID0+IHMubmFtZSA9PT0gJ1VuaXF1ZSBTa2lsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHVuaXF1ZVNraWxsLCAnU2hvdWxkIGZpbmQgdGhlIHVuaXF1ZSBza2lsbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHByaW9yaXRpemUgc2tpbGxzIGJ5IHNvdXJjZTogd29ya3NwYWNlID4gdXNlciA+IGV4dGVuc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAncHJpb3JpdHktdGVzdCc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIHNraWxscyBmcm9tIGRpZmZlcmVudCBzb3VyY2VzIHdpdGggc2FtZSBuYW1lXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvaG9tZS91c2VyLy5jb3BpbG90L3NraWxscy9Qcmlvcml0eSBTa2lsbC9TS0lMTC5tZCcsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiUHJpb3JpdHkgU2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVXNlciB2ZXJzaW9uXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnVXNlciBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9za2lsbHMvUHJpb3JpdHkgU2tpbGwvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIlByaW9yaXR5IFNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIldvcmtzcGFjZSB2ZXJzaW9uIC0gaGlnaGVzdCBwcmlvcml0eVwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1dvcmtzcGFjZSBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGFsbFJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZmluZEFnZW50U2tpbGxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQub2soYWxsUmVzdWx0LCAnU2hvdWxkIHJldHVybiByZXN1bHRzJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhbGxSZXN1bHQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSwgJ1Nob3VsZCBmaW5kIDEgc2tpbGwgKGR1cGxpY2F0ZXMgcmVzb2x2ZWQgYnkgcHJpb3JpdHkpJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmRlc2NyaXB0aW9uLCAnV29ya3NwYWNlIHZlcnNpb24gLSBoaWdoZXN0IHByaW9yaXR5JywgJ1dvcmtzcGFjZSBzaG91bGQgd2luIG92ZXIgdXNlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5zdG9yYWdlLCBQcm9tcHRzU3RvcmFnZS5sb2NhbCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaW5jbHVkZSBza2lsbHMgd2hlcmUgbmFtZSBkb2VzIG5vdCBtYXRjaCBmb2xkZXIgbmFtZSB1c2luZyBmb2xkZXIgbmFtZSBhcyBmYWxsYmFjaycsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnbmFtZS1taXNtYXRjaC10ZXN0Jztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdC8vIEZvbGRlciBuYW1lIFwid3JvbmctZm9sZGVyLW5hbWVcIiBkb2Vzbid0IG1hdGNoIHNraWxsIG5hbWUgXCJDb3JyZWN0IFNraWxsIE5hbWVcIlxuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvc2tpbGxzL3dyb25nLWZvbGRlci1uYW1lL1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJDb3JyZWN0IFNraWxsIE5hbWVcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGhpcyBza2lsbCBzaG91bGQgdXNlIGZvbGRlciBuYW1lIGFzIGZhbGxiYWNrXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnU2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdC8vIEZvbGRlciBuYW1lIG1hdGNoZXMgc2tpbGwgbmFtZVxuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvc2tpbGxzL1ZhbGlkIFNraWxsL1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJWYWxpZCBTa2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUaGlzIHNraWxsIHNob3VsZCBiZSBmb3VuZFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1ZhbGlkIHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgYWxsUmVzdWx0ID0gYXdhaXQgc2VydmljZS5maW5kQWdlbnRTa2lsbHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5vayhhbGxSZXN1bHQsICdTaG91bGQgcmV0dXJuIHJlc3VsdHMnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFsbFJlc3VsdDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyLCAnU2hvdWxkIGZpbmQgYm90aCBza2lsbHMnKTtcblxuXHRcdFx0Y29uc3QgbWlzbWF0Y2hlZFNraWxsID0gcmVzdWx0LmZpbmQocyA9PiBzLm5hbWUgPT09ICd3cm9uZy1mb2xkZXItbmFtZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1pc21hdGNoZWRTa2lsbCwgJ1Nob3VsZCBmaW5kIHNraWxsIHdpdGggZm9sZGVyIG5hbWUgYXMgZmFsbGJhY2snKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaXNtYXRjaGVkU2tpbGwuZGVzY3JpcHRpb24sICdUaGlzIHNraWxsIHNob3VsZCB1c2UgZm9sZGVyIG5hbWUgYXMgZmFsbGJhY2snKTtcblxuXHRcdFx0Y29uc3QgdmFsaWRTa2lsbCA9IHJlc3VsdC5maW5kKHMgPT4gcy5uYW1lID09PSAnVmFsaWQgU2tpbGwnKTtcblx0XHRcdGFzc2VydC5vayh2YWxpZFNraWxsLCAnU2hvdWxkIGZpbmQgdGhlIHZhbGlkIHNraWxsJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaW5jbHVkZSBza2lsbHMgd2l0aCBtaXNzaW5nIG5hbWUgYXR0cmlidXRlIHVzaW5nIGZvbGRlciBuYW1lIGFzIGZhbGxiYWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdtaXNzaW5nLW5hbWUtdGVzdCc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3NraWxscy9uby1uYW1lLXNraWxsL1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGhpcyBza2lsbCBoYXMgbm8gbmFtZSBhdHRyaWJ1dGVcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdTa2lsbCBjb250ZW50IHdpdGhvdXQgbmFtZScsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvc2tpbGxzL1ZhbGlkIE5hbWVkIFNraWxsL1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJWYWxpZCBOYW1lZCBTa2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUaGlzIHNraWxsIGhhcyBhIG5hbWVcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdWYWxpZCBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGFsbFJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZmluZEFnZW50U2tpbGxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQub2soYWxsUmVzdWx0LCAnU2hvdWxkIHJldHVybiByZXN1bHRzJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhbGxSZXN1bHQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMiwgJ1Nob3VsZCBmaW5kIGJvdGggc2tpbGxzJyk7XG5cblx0XHRcdGNvbnN0IG5vTmFtZVNraWxsID0gcmVzdWx0LmZpbmQocyA9PiBzLm5hbWUgPT09ICduby1uYW1lLXNraWxsJyk7XG5cdFx0XHRhc3NlcnQub2sobm9OYW1lU2tpbGwsICdTaG91bGQgZmluZCBza2lsbCB3aXRoIGZvbGRlciBuYW1lIGFzIGZhbGxiYWNrJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9OYW1lU2tpbGwuZGVzY3JpcHRpb24sICdUaGlzIHNraWxsIGhhcyBubyBuYW1lIGF0dHJpYnV0ZScpO1xuXG5cdFx0XHRjb25zdCB2YWxpZFNraWxsID0gcmVzdWx0LmZpbmQocyA9PiBzLm5hbWUgPT09ICdWYWxpZCBOYW1lZCBTa2lsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbGlkU2tpbGwsICdTaG91bGQgZmluZCBza2lsbCB3aXRoIG5hbWUgYXR0cmlidXRlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaW5jbHVkZSBleHRlbnNpb24tcHJvdmlkZWQgc2tpbGxzIGluIGZpbmRBZ2VudFNraWxscycsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnZXh0ZW5zaW9uLXNraWxscy10ZXN0Jztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRjb25zdCBleHRlbnNpb25Ta2lsbFVyaSA9IFVSSS5wYXJzZSgnZmlsZTovL2V4dGVuc2lvbnMvbXktZXh0ZW5zaW9uL0V4dGVuc2lvbiBTa2lsbC9TS0lMTC5tZCcpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0ge1xuXHRcdFx0XHRpZGVudGlmaWVyOiB7IHZhbHVlOiAndGVzdC5teS1leHRlbnNpb24nIH0sXG5cdFx0XHRcdGVuYWJsZWRBcGlQcm9wb3NhbHM6IFsnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZSddXG5cdFx0XHR9IGFzIHVua25vd24gYXMgSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXG5cdFx0XHQvLyBDcmVhdGUgd29ya3NwYWNlIHNraWxsIGFuZCBleHRlbnNpb24gc2tpbGxcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9za2lsbHMvV29ya3NwYWNlIFNraWxsL1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJXb3Jrc3BhY2UgU2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSB3b3Jrc3BhY2Ugc2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdXb3Jrc3BhY2Ugc2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGV4dGVuc2lvblNraWxsVXJpLnBhdGgsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiRXh0ZW5zaW9uIFNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgc2tpbGwgZnJvbSBleHRlbnNpb24gcHJvdmlkZXJcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdFeHRlbnNpb24gc2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBwcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZVByb21wdEZpbGVzOiBhc3luYyAoX2NvbnRleHQ6IElQcm9tcHRGaWxlQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBbeyB1cmk6IGV4dGVuc2lvblNraWxsVXJpIH1dO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZWdpc3RlcmVkID0gc2VydmljZS5yZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihleHRlbnNpb24sIFByb21wdHNUeXBlLnNraWxsLCBwcm92aWRlcik7XG5cblx0XHRcdGNvbnN0IGFsbFJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZmluZEFnZW50U2tpbGxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQub2soYWxsUmVzdWx0LCAnU2hvdWxkIHJldHVybiByZXN1bHRzJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhbGxSZXN1bHQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMiwgJ1Nob3VsZCBmaW5kIDIgc2tpbGxzICh3b3Jrc3BhY2UgKyBleHRlbnNpb24pJyk7XG5cblx0XHRcdGNvbnN0IHdvcmtzcGFjZVNraWxsID0gcmVzdWx0LmZpbmQocyA9PiBzLm5hbWUgPT09ICdXb3Jrc3BhY2UgU2tpbGwnKTtcblx0XHRcdGFzc2VydC5vayh3b3Jrc3BhY2VTa2lsbCwgJ1Nob3VsZCBmaW5kIHdvcmtzcGFjZSBza2lsbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtzcGFjZVNraWxsLnN0b3JhZ2UsIFByb21wdHNTdG9yYWdlLmxvY2FsKTtcblxuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uU2tpbGwgPSByZXN1bHQuZmluZChzID0+IHMubmFtZSA9PT0gJ0V4dGVuc2lvbiBTa2lsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGV4dGVuc2lvblNraWxsLCAnU2hvdWxkIGZpbmQgZXh0ZW5zaW9uIHNraWxsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0ZW5zaW9uU2tpbGwuc3RvcmFnZSwgUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uKTtcblxuXHRcdFx0cmVnaXN0ZXJlZC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaW5jbHVkZSBjb250cmlidXRlZCBza2lsbCBmaWxlcyBpbiBmaW5kQWdlbnRTa2lsbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ2NvbnRyaWJ1dGVkLXNraWxscy10ZXN0Jztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRjb25zdCBjb250cmlidXRlZFNraWxsVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vZXh0ZW5zaW9ucy9teS1leHRlbnNpb24vQ29udHJpYnV0ZWQgU2tpbGwvU0tJTEwubWQnKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IHtcblx0XHRcdFx0aWRlbnRpZmllcjogeyB2YWx1ZTogJ3Rlc3QubXktZXh0ZW5zaW9uJyB9XG5cdFx0XHR9IGFzIHVua25vd24gYXMgSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvc2tpbGxzL0xvY2FsIFNraWxsL1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJMb2NhbCBTa2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIGxvY2FsIHNraWxsXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnTG9jYWwgc2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGNvbnRyaWJ1dGVkU2tpbGxVcmkucGF0aCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJDb250cmlidXRlZCBTa2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIGNvbnRyaWJ1dGVkIHNraWxsIGZyb20gZXh0ZW5zaW9uXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnQ29udHJpYnV0ZWQgc2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZWdpc3RlcmVkID0gc2VydmljZS5yZWdpc3RlckNvbnRyaWJ1dGVkRmlsZShcblx0XHRcdFx0UHJvbXB0c1R5cGUuc2tpbGwsXG5cdFx0XHRcdGNvbnRyaWJ1dGVkU2tpbGxVcmksXG5cdFx0XHRcdGV4dGVuc2lvbixcblx0XHRcdFx0J0NvbnRyaWJ1dGVkIFNraWxsJyxcblx0XHRcdFx0J0EgY29udHJpYnV0ZWQgc2tpbGwgZnJvbSBleHRlbnNpb24nXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCBhbGxSZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmZpbmRBZ2VudFNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGFsbFJlc3VsdCwgJ1Nob3VsZCByZXR1cm4gcmVzdWx0cycpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWxsUmVzdWx0O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIsICdTaG91bGQgZmluZCAyIHNraWxscyAobG9jYWwgKyBjb250cmlidXRlZCknKTtcblxuXHRcdFx0Y29uc3QgbG9jYWxTa2lsbCA9IHJlc3VsdC5maW5kKHMgPT4gcy5uYW1lID09PSAnTG9jYWwgU2tpbGwnKTtcblx0XHRcdGFzc2VydC5vayhsb2NhbFNraWxsLCAnU2hvdWxkIGZpbmQgbG9jYWwgc2tpbGwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhbFNraWxsLnN0b3JhZ2UsIFByb21wdHNTdG9yYWdlLmxvY2FsKTtcblxuXHRcdFx0Y29uc3QgY29udHJpYnV0ZWRTa2lsbCA9IHJlc3VsdC5maW5kKHMgPT4gcy5uYW1lID09PSAnQ29udHJpYnV0ZWQgU2tpbGwnKTtcblx0XHRcdGFzc2VydC5vayhjb250cmlidXRlZFNraWxsLCAnU2hvdWxkIGZpbmQgY29udHJpYnV0ZWQgc2tpbGwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cmlidXRlZFNraWxsLnN0b3JhZ2UsIFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbik7XG5cblx0XHRcdHJlZ2lzdGVyZWQuZGlzcG9zZSgpO1xuXG5cdFx0XHQvLyBBZnRlciBkaXNwb3NhbCwgb25seSBsb2NhbCBza2lsbCBzaG91bGQgcmVtYWluXG5cdFx0XHRjb25zdCByZXN1bHRBZnRlckRpc3Bvc2UgPSBhd2FpdCBzZXJ2aWNlLmZpbmRBZ2VudFNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRBZnRlckRpc3Bvc2U/Lmxlbmd0aCwgMSwgJ1Nob3VsZCBmaW5kIDEgc2tpbGwgYWZ0ZXIgZGlzcG9zYWwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRBZnRlckRpc3Bvc2U/LlswXS5uYW1lLCAnTG9jYWwgU2tpbGwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgZm9sZGVyIG5hbWUgZm9yIGNvbnRyaWJ1dGVkIHNraWxsIHdpdGggbWlzc2luZyBuYW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdjb250cmlidXRlZC1uby1uYW1lLXRlc3QnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2UoVVJJLmZpbGUocm9vdEZvbGRlcikpKTtcblxuXHRcdFx0Y29uc3QgY29udHJpYnV0ZWRTa2lsbFVyaSA9IFVSSS5wYXJzZSgnZmlsZTovL2V4dGVuc2lvbnMvbXktZXh0ZW5zaW9uL215LXNraWxsL1NLSUxMLm1kJyk7XG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSB7IGlkZW50aWZpZXI6IHsgdmFsdWU6ICd0ZXN0Lm15LWV4dGVuc2lvbicgfSB9IGFzIHVua25vd24gYXMgSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGNvbnRyaWJ1dGVkU2tpbGxVcmkucGF0aCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSBza2lsbCB3aXRob3V0IGEgbmFtZVwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IHNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRlZEZpbGUoUHJvbXB0c1R5cGUuc2tpbGwsIGNvbnRyaWJ1dGVkU2tpbGxVcmksIGV4dGVuc2lvbiwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmZpbmRBZ2VudFNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQsICdTaG91bGQgcmV0dXJuIHJlc3VsdHMnKTtcblxuXHRcdFx0Y29uc3Qgc2tpbGwgPSByZXN1bHQuZmluZChzID0+IHMubmFtZSA9PT0gJ215LXNraWxsJyk7XG5cdFx0XHRhc3NlcnQub2soc2tpbGwsICdTaG91bGQgZmluZCBza2lsbCB1c2luZyBmb2xkZXIgbmFtZSBhcyBmYWxsYmFjaycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNraWxsLmRlc2NyaXB0aW9uLCAnQSBza2lsbCB3aXRob3V0IGEgbmFtZScpO1xuXG5cdFx0XHRyZWdpc3RlcmVkLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBhY2NlcHQgY29udHJpYnV0ZWQgc2tpbGwgd2l0aCBtaXNzaW5nIGRlc2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdjb250cmlidXRlZC1uby1kZXNjLXRlc3QnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2UoVVJJLmZpbGUocm9vdEZvbGRlcikpKTtcblxuXHRcdFx0Y29uc3QgY29udHJpYnV0ZWRTa2lsbFVyaSA9IFVSSS5wYXJzZSgnZmlsZTovL2V4dGVuc2lvbnMvbXktZXh0ZW5zaW9uL25vLWRlc2Mtc2tpbGwvU0tJTEwubWQnKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IHsgaWRlbnRpZmllcjogeyB2YWx1ZTogJ3Rlc3QubXktZXh0ZW5zaW9uJyB9IH0gYXMgdW5rbm93biBhcyBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogY29udHJpYnV0ZWRTa2lsbFVyaS5wYXRoLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIm5vLWRlc2Mtc2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdTa2lsbCBjb250ZW50IHdpdGhvdXQgZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IHNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRlZEZpbGUoUHJvbXB0c1R5cGUuc2tpbGwsIGNvbnRyaWJ1dGVkU2tpbGxVcmksIGV4dGVuc2lvbiwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmZpbmRBZ2VudFNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQsICdTaG91bGQgcmV0dXJuIHJlc3VsdHMnKTtcblxuXHRcdFx0Y29uc3Qgc2tpbGwgPSByZXN1bHQuZmluZChzID0+IHMubmFtZSA9PT0gJ25vLWRlc2Mtc2tpbGwnKTtcblx0XHRcdGFzc2VydC5vayhza2lsbCwgJ1Nob3VsZCBmaW5kIHNraWxsIGV2ZW4gd2l0aG91dCBkZXNjcmlwdGlvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNraWxsLmRlc2NyaXB0aW9uLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRyZWdpc3RlcmVkLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBvdmVycmlkZSBjb250cmlidXRlZCBza2lsbCBuYW1lIHdpdGggZm9sZGVyIG5hbWUgb24gbWlzbWF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ2NvbnRyaWJ1dGVkLW1pc21hdGNoLXRlc3QnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2UoVVJJLmZpbGUocm9vdEZvbGRlcikpKTtcblxuXHRcdFx0Y29uc3QgY29udHJpYnV0ZWRTa2lsbFVyaSA9IFVSSS5wYXJzZSgnZmlsZTovL2V4dGVuc2lvbnMvbXktZXh0ZW5zaW9uL2FjdHVhbC1mb2xkZXIvU0tJTEwubWQnKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IHsgaWRlbnRpZmllcjogeyB2YWx1ZTogJ3Rlc3QubXktZXh0ZW5zaW9uJyB9IH0gYXMgdW5rbm93biBhcyBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogY29udHJpYnV0ZWRTa2lsbFVyaS5wYXRoLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIndyb25nLW5hbWVcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSBza2lsbCB3aXRoIG1pc21hdGNoZWQgbmFtZVwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IHNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRlZEZpbGUoUHJvbXB0c1R5cGUuc2tpbGwsIGNvbnRyaWJ1dGVkU2tpbGxVcmksIGV4dGVuc2lvbiwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmZpbmRBZ2VudFNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQsICdTaG91bGQgcmV0dXJuIHJlc3VsdHMnKTtcblxuXHRcdFx0Y29uc3Qgc2tpbGwgPSByZXN1bHQuZmluZChzID0+IHMubmFtZSA9PT0gJ2FjdHVhbC1mb2xkZXInKTtcblx0XHRcdGFzc2VydC5vayhza2lsbCwgJ1Nob3VsZCBmaW5kIHNraWxsIHVzaW5nIGZvbGRlciBuYW1lIGluc3RlYWQgb2YgbWlzbWF0Y2hlZCBuYW1lJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2tpbGwuZGVzY3JpcHRpb24sICdBIHNraWxsIHdpdGggbWlzbWF0Y2hlZCBuYW1lJyk7XG5cblx0XHRcdHJlZ2lzdGVyZWQuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyAtIHByb21wdCBkaXNjb3ZlcnknLCAoKSA9PiB7XG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0c2lub24ucmVzdG9yZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2FuY2VsbGF0aW9uRXJyb3IgZnJvbSBwYXJzZU5ldyBpcyBza2lwcGVkIHdpdGhvdXQgbG9nZ2luZycsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwcm9tcHRVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9leHRlbnNpb25zL215LWV4dGVuc2lvbi9jYW5jZWxsZWQucHJvbXB0Lm1kJyk7XG5cdFx0XHRjb25zdCBsb2dFcnJvclNweSA9IHNpbm9uLnNweShsb2dTZXJ2aWNlLCAnZXJyb3InKTtcblx0XHRcdHNpbm9uLnN0dWIoc2VydmljZSwgJ2xpc3RQcm9tcHRGaWxlcycpLmNhbGxzRmFrZShhc3luYyAodHlwZTogUHJvbXB0c1R5cGUpID0+IHtcblx0XHRcdFx0cmV0dXJuIHR5cGUgPT09IFByb21wdHNUeXBlLnByb21wdFxuXHRcdFx0XHRcdD8gW3sgdXJpOiBwcm9tcHRVcmksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQgfSBhcyBJUHJvbXB0UGF0aF1cblx0XHRcdFx0XHQ6IFtdO1xuXHRcdFx0fSk7XG5cdFx0XHRzaW5vbi5zdHViKHNlcnZpY2UsICdwYXJzZU5ldycpLnJlamVjdHMobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXG5cdFx0XHRjb25zdCBzbGFzaENvbW1hbmRzID0gYXdhaXQgc2VydmljZS5nZXRQcm9tcHRTbGFzaENvbW1hbmRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3QgZGlzY292ZXJ5SW5mbyA9IGF3YWl0IHNlcnZpY2UuZ2V0RGlzY292ZXJ5SW5mbyhQcm9tcHRzVHlwZS5wcm9tcHQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNsYXNoQ29tbWFuZHMsIFtdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2dFcnJvclNweS5jYWxsZWQsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNjb3ZlcnlJbmZvLmZpbGVzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzY292ZXJ5SW5mby5maWxlc1swXS5zdGF0dXMsICdza2lwcGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzY292ZXJ5SW5mby5maWxlc1swXS5za2lwUmVhc29uLCAncGFyc2UtZXJyb3InKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldFByb21wdFNsYXNoQ29tbWFuZHMgLSBza2lsbHMnLCAoKSA9PiB7XG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0c2lub24ucmVzdG9yZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGluY2x1ZGUgc2tpbGxzIGZyb20gd29ya3NwYWNlIGFzIHNsYXNoIGNvbW1hbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdzbGFzaC1jb21tYW5kcy13b3Jrc3BhY2Utc2tpbGxzJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHQvLyBDcmVhdGUgc2tpbGwgZmlsZXMgaW4gd29ya3NwYWNlXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvc2tpbGxzL3dvcmtzcGFjZS1za2lsbC9TS0lMTC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwid29ya3NwYWNlLXNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgd29ya3NwYWNlIHNraWxsIHRoYXQgc2hvdWxkIGFwcGVhciBhcyBzbGFzaCBjb21tYW5kXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnV29ya3NwYWNlIHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uY2xhdWRlL3NraWxscy9hbm90aGVyLXNraWxsL1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJhbm90aGVyLXNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkFub3RoZXIgc2tpbGwgZnJvbSB3b3Jrc3BhY2VcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdBbm90aGVyIHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3Qgc2xhc2hDb21tYW5kcyA9IGF3YWl0IHNlcnZpY2UuZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Y29uc3Qgd29ya3NwYWNlU2tpbGxDb21tYW5kID0gc2xhc2hDb21tYW5kcy5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ3dvcmtzcGFjZS1za2lsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHdvcmtzcGFjZVNraWxsQ29tbWFuZCwgJ1Nob3VsZCBmaW5kIHdvcmtzcGFjZSBza2lsbCBhcyBzbGFzaCBjb21tYW5kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya3NwYWNlU2tpbGxDb21tYW5kLmRlc2NyaXB0aW9uLCAnQSB3b3Jrc3BhY2Ugc2tpbGwgdGhhdCBzaG91bGQgYXBwZWFyIGFzIHNsYXNoIGNvbW1hbmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3Jrc3BhY2VTa2lsbENvbW1hbmQuc3RvcmFnZSwgUHJvbXB0c1N0b3JhZ2UubG9jYWwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtzcGFjZVNraWxsQ29tbWFuZC50eXBlLCBQcm9tcHRzVHlwZS5za2lsbCk7XG5cblx0XHRcdGNvbnN0IGFub3RoZXJTa2lsbENvbW1hbmQgPSBzbGFzaENvbW1hbmRzLmZpbmQoY21kID0+IGNtZC5uYW1lID09PSAnYW5vdGhlci1za2lsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFub3RoZXJTa2lsbENvbW1hbmQsICdTaG91bGQgZmluZCBhbm90aGVyIHNraWxsIGFzIHNsYXNoIGNvbW1hbmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhbm90aGVyU2tpbGxDb21tYW5kLmRlc2NyaXB0aW9uLCAnQW5vdGhlciBza2lsbCBmcm9tIHdvcmtzcGFjZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFub3RoZXJTa2lsbENvbW1hbmQuc3RvcmFnZSwgUHJvbXB0c1N0b3JhZ2UubG9jYWwpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRlZHVwbGljYXRlIHNraWxscyB3aXRoIHRoZSBzYW1lIG5hbWUgZnJvbSBzeW1saW5rZWQgbG9jYXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdzbGFzaC1jb21tYW5kcy1zeW1saW5rZWQtc2tpbGxzJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHQvLyBgbnB4IHNraWxsc2AgaW5zdGFsbHMgdG8gYH4vLmFnZW50cy9za2lsbHNgIGFuZCBzeW1saW5rc1xuXHRcdFx0Ly8gYH4vLmNsYXVkZS9za2lsbHNgIHRvIGl0LCBzbyB0aGUgc2FtZSBza2lsbCBpcyBkaXNjb3ZlcmVkIHVuZGVyIHR3b1xuXHRcdFx0Ly8gZGVmYXVsdCB1c2VyIGxvY2F0aW9ucy4gVGhleSBtdXN0IGNvbGxhcHNlIHRvIGEgc2luZ2xlIHNsYXNoIGNvbW1hbmQuXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvaG9tZS91c2VyLy5hZ2VudHMvc2tpbGxzL2RlcGxveS9TS0lMTC5tZCcsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiZGVwbG95XCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkRlcGxveSBza2lsbFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0RlcGxveSBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9ob21lL3VzZXIvLmNsYXVkZS9za2lsbHMvZGVwbG95L1NLSUxMLm1kJyxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJkZXBsb3lcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiRGVwbG95IHNraWxsXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnRGVwbG95IHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3Qgc2xhc2hDb21tYW5kcyA9IGF3YWl0IHNlcnZpY2UuZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Y29uc3QgZGVwbG95Q29tbWFuZHMgPSBzbGFzaENvbW1hbmRzLmZpbHRlcihjbWQgPT4gY21kLm5hbWUgPT09ICdkZXBsb3knKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXBsb3lDb21tYW5kcy5sZW5ndGgsIDEsICdEdXBsaWNhdGVkIHNraWxsIHNob3VsZCBhcHBlYXIgb25seSBvbmNlIGFzIGEgc2xhc2ggY29tbWFuZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGluY2x1ZGUgc2tpbGxzIGZyb20gdXNlciBzdG9yYWdlIGFzIHNsYXNoIGNvbW1hbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdzbGFzaC1jb21tYW5kcy11c2VyLXNraWxscyc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIHNraWxsIGZpbGVzIGluIHVzZXIgc3RvcmFnZSAocGVyc29uYWwgc2tpbGxzKVxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL2hvbWUvdXNlci8uY29waWxvdC9za2lsbHMvcGVyc29uYWwtc2tpbGwvU0tJTEwubWQnLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcInBlcnNvbmFsLXNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgcGVyc29uYWwgc2tpbGwgZnJvbSB1c2VyIHN0b3JhZ2VcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdQZXJzb25hbCBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9ob21lL3VzZXIvLmNsYXVkZS9za2lsbHMvY2xhdWRlLXBlcnNvbmFsL1NLSUxMLm1kJyxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJjbGF1ZGUtcGVyc29uYWxcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSBDbGF1ZGUgcGVyc29uYWwgc2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdDbGF1ZGUgcGVyc29uYWwgc2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBzbGFzaENvbW1hbmRzID0gYXdhaXQgc2VydmljZS5nZXRQcm9tcHRTbGFzaENvbW1hbmRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRjb25zdCBwZXJzb25hbFNraWxsQ29tbWFuZCA9IHNsYXNoQ29tbWFuZHMuZmluZChjbWQgPT4gY21kLm5hbWUgPT09ICdwZXJzb25hbC1za2lsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBlcnNvbmFsU2tpbGxDb21tYW5kLCAnU2hvdWxkIGZpbmQgcGVyc29uYWwgc2tpbGwgYXMgc2xhc2ggY29tbWFuZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlcnNvbmFsU2tpbGxDb21tYW5kLmRlc2NyaXB0aW9uLCAnQSBwZXJzb25hbCBza2lsbCBmcm9tIHVzZXIgc3RvcmFnZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlcnNvbmFsU2tpbGxDb21tYW5kLnN0b3JhZ2UsIFByb21wdHNTdG9yYWdlLnVzZXIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlcnNvbmFsU2tpbGxDb21tYW5kLnR5cGUsIFByb21wdHNUeXBlLnNraWxsKTtcblxuXHRcdFx0Y29uc3QgY2xhdWRlUGVyc29uYWxDb21tYW5kID0gc2xhc2hDb21tYW5kcy5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ2NsYXVkZS1wZXJzb25hbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNsYXVkZVBlcnNvbmFsQ29tbWFuZCwgJ1Nob3VsZCBmaW5kIENsYXVkZSBwZXJzb25hbCBza2lsbCBhcyBzbGFzaCBjb21tYW5kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xhdWRlUGVyc29uYWxDb21tYW5kLmRlc2NyaXB0aW9uLCAnQSBDbGF1ZGUgcGVyc29uYWwgc2tpbGwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGF1ZGVQZXJzb25hbENvbW1hbmQuc3RvcmFnZSwgUHJvbXB0c1N0b3JhZ2UudXNlcik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaW5jbHVkZSBza2lsbHMgZnJvbSBleHRlbnNpb24gcHJvdmlkZXJzIGFzIHNsYXNoIGNvbW1hbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdzbGFzaC1jb21tYW5kcy1wcm92aWRlci1za2lsbHMnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdGNvbnN0IHByb3ZpZGVyU2tpbGxVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9leHRlbnNpb25zL215LWV4dGVuc2lvbi9wcm92aWRlci1za2lsbC9TS0lMTC5tZCcpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0ge1xuXHRcdFx0XHRpZGVudGlmaWVyOiB7IHZhbHVlOiAndGVzdC5teS1leHRlbnNpb24nIH0sXG5cdFx0XHRcdGVuYWJsZWRBcGlQcm9wb3NhbHM6IFsnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZSddXG5cdFx0XHR9IGFzIHVua25vd24gYXMgSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXG5cdFx0XHQvLyBNb2NrIHRoZSBza2lsbCBmaWxlIGNvbnRlbnRcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogcHJvdmlkZXJTa2lsbFVyaS5wYXRoLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcInByb3ZpZGVyLXNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgc2tpbGwgZnJvbSBleHRlbnNpb24gcHJvdmlkZXJcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdQcm92aWRlciBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHByb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlUHJvbXB0RmlsZXM6IGFzeW5jIChfY29udGV4dDogSVByb21wdEZpbGVDb250ZXh0LCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIFt7IHVyaTogcHJvdmlkZXJTa2lsbFVyaSB9XTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IHNlcnZpY2UucmVnaXN0ZXJQcm9tcHRGaWxlUHJvdmlkZXIoZXh0ZW5zaW9uLCBQcm9tcHRzVHlwZS5za2lsbCwgcHJvdmlkZXIpO1xuXG5cdFx0XHRjb25zdCBzbGFzaENvbW1hbmRzID0gYXdhaXQgc2VydmljZS5nZXRQcm9tcHRTbGFzaENvbW1hbmRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRjb25zdCBwcm92aWRlclNraWxsQ29tbWFuZCA9IHNsYXNoQ29tbWFuZHMuZmluZChjbWQgPT4gY21kLm5hbWUgPT09ICdwcm92aWRlci1za2lsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHByb3ZpZGVyU2tpbGxDb21tYW5kLCAnU2hvdWxkIGZpbmQgcHJvdmlkZXIgc2tpbGwgYXMgc2xhc2ggY29tbWFuZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyU2tpbGxDb21tYW5kLmRlc2NyaXB0aW9uLCAnQSBza2lsbCBmcm9tIGV4dGVuc2lvbiBwcm92aWRlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyU2tpbGxDb21tYW5kLnN0b3JhZ2UsIFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJTa2lsbENvbW1hbmQudHlwZSwgUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyU2tpbGxDb21tYW5kLnNvdXJjZSwgUHJvbXB0RmlsZVNvdXJjZS5FeHRlbnNpb25BUEkpO1xuXG5cdFx0XHRyZWdpc3RlcmVkLmRpc3Bvc2UoKTtcblxuXHRcdFx0Ly8gQWZ0ZXIgZGlzcG9zYWwsIHRoZSBwcm92aWRlciBza2lsbCBzaG91bGQgbm8gbG9uZ2VyIGFwcGVhclxuXHRcdFx0Y29uc3Qgc2xhc2hDb21tYW5kc0FmdGVyRGlzcG9zZSA9IGF3YWl0IHNlcnZpY2UuZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IGZvdW5kQWZ0ZXJEaXNwb3NlID0gc2xhc2hDb21tYW5kc0FmdGVyRGlzcG9zZS5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ3Byb3ZpZGVyLXNraWxsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91bmRBZnRlckRpc3Bvc2UsIHVuZGVmaW5lZCwgJ1Nob3VsZCBub3QgZmluZCBwcm92aWRlciBza2lsbCBhZnRlciBkaXNwb3NhbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGluY2x1ZGUgc2tpbGxzIGZyb20gZXh0ZW5zaW9uIGNvbnRyaWJ1dGlvbnMgYXMgc2xhc2ggY29tbWFuZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ3NsYXNoLWNvbW1hbmRzLWNvbnRyaWJ1dGVkLXNraWxscyc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Y29uc3QgY29udHJpYnV0ZWRTa2lsbFVyaSA9IFVSSS5wYXJzZSgnZmlsZTovL2V4dGVuc2lvbnMvbXktZXh0ZW5zaW9uL2NvbnRyaWJ1dGVkLXNraWxsL1NLSUxMLm1kJyk7XG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSB7XG5cdFx0XHRcdGlkZW50aWZpZXI6IHsgdmFsdWU6ICd0ZXN0Lm15LWV4dGVuc2lvbicgfVxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblxuXHRcdFx0Ly8gTW9jayB0aGUgc2tpbGwgZmlsZSBjb250ZW50XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGNvbnRyaWJ1dGVkU2tpbGxVcmkucGF0aCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJjb250cmlidXRlZC1za2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIHNraWxsIGZyb20gZXh0ZW5zaW9uIGNvbnRyaWJ1dGlvblwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0NvbnRyaWJ1dGVkIHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IHNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRlZEZpbGUoXG5cdFx0XHRcdFByb21wdHNUeXBlLnNraWxsLFxuXHRcdFx0XHRjb250cmlidXRlZFNraWxsVXJpLFxuXHRcdFx0XHRleHRlbnNpb24sXG5cdFx0XHRcdCdjb250cmlidXRlZC1za2lsbCcsXG5cdFx0XHRcdCdBIHNraWxsIGZyb20gZXh0ZW5zaW9uIGNvbnRyaWJ1dGlvbidcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IHNsYXNoQ29tbWFuZHMgPSBhd2FpdCBzZXJ2aWNlLmdldFByb21wdFNsYXNoQ29tbWFuZHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGNvbnN0IGNvbnRyaWJ1dGVkU2tpbGxDb21tYW5kID0gc2xhc2hDb21tYW5kcy5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ2NvbnRyaWJ1dGVkLXNraWxsJyk7XG5cdFx0XHRhc3NlcnQub2soY29udHJpYnV0ZWRTa2lsbENvbW1hbmQsICdTaG91bGQgZmluZCBjb250cmlidXRlZCBza2lsbCBhcyBzbGFzaCBjb21tYW5kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJpYnV0ZWRTa2lsbENvbW1hbmQuZGVzY3JpcHRpb24sICdBIHNraWxsIGZyb20gZXh0ZW5zaW9uIGNvbnRyaWJ1dGlvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyaWJ1dGVkU2tpbGxDb21tYW5kLnN0b3JhZ2UsIFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJpYnV0ZWRTa2lsbENvbW1hbmQudHlwZSwgUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyaWJ1dGVkU2tpbGxDb21tYW5kLnNvdXJjZSwgUHJvbXB0RmlsZVNvdXJjZS5FeHRlbnNpb25Db250cmlidXRpb24pO1xuXG5cdFx0XHRyZWdpc3RlcmVkLmRpc3Bvc2UoKTtcblxuXHRcdFx0Ly8gQWZ0ZXIgZGlzcG9zYWwsIHRoZSBjb250cmlidXRlZCBza2lsbCBzaG91bGQgbm8gbG9uZ2VyIGFwcGVhclxuXHRcdFx0Y29uc3Qgc2xhc2hDb21tYW5kc0FmdGVyRGlzcG9zZSA9IGF3YWl0IHNlcnZpY2UuZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IGZvdW5kQWZ0ZXJEaXNwb3NlID0gc2xhc2hDb21tYW5kc0FmdGVyRGlzcG9zZS5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ2NvbnRyaWJ1dGVkLXNraWxsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91bmRBZnRlckRpc3Bvc2UsIHVuZGVmaW5lZCwgJ1Nob3VsZCBub3QgZmluZCBjb250cmlidXRlZCBza2lsbCBhZnRlciBkaXNwb3NhbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGNvbWJpbmUgcHJvbXB0IGZpbGVzIGFuZCBza2lsbHMgYXMgc2xhc2ggY29tbWFuZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ3NsYXNoLWNvbW1hbmRzLWNvbWJpbmVkJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHQvLyBDcmVhdGUgYm90aCBwcm9tcHQgZmlsZXMgYW5kIHNraWxsIGZpbGVzXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvcHJvbXB0cy9teS1wcm9tcHQucHJvbXB0Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJteS1wcm9tcHRcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSByZWd1bGFyIHByb21wdCBmaWxlXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnUHJvbXB0IGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwibXktc2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSBza2lsbCBmaWxlXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnU2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBzbGFzaENvbW1hbmRzID0gYXdhaXQgc2VydmljZS5nZXRQcm9tcHRTbGFzaENvbW1hbmRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRjb25zdCBwcm9tcHRDb21tYW5kID0gc2xhc2hDb21tYW5kcy5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ215LXByb21wdCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHByb21wdENvbW1hbmQsICdTaG91bGQgZmluZCBwcm9tcHQgZmlsZSBhcyBzbGFzaCBjb21tYW5kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvbXB0Q29tbWFuZC50eXBlLCBQcm9tcHRzVHlwZS5wcm9tcHQpO1xuXG5cdFx0XHRjb25zdCBza2lsbENvbW1hbmQgPSBzbGFzaENvbW1hbmRzLmZpbmQoY21kID0+IGNtZC5uYW1lID09PSAnbXktc2tpbGwnKTtcblx0XHRcdGFzc2VydC5vayhza2lsbENvbW1hbmQsICdTaG91bGQgZmluZCBza2lsbCBmaWxlIGFzIHNsYXNoIGNvbW1hbmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChza2lsbENvbW1hbmQudHlwZSwgUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGZpcmUgY2hhbmdlIGV2ZW50IHdoZW4gcHJvdmlkZXIgcmVnaXN0ZXJzL3VucmVnaXN0ZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdzbGFzaC1jb21tYW5kcy1jYWNoZS1pbnZhbGlkYXRpb24nO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdGNvbnN0IHByb3ZpZGVyU2tpbGxVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9leHRlbnNpb25zL215LWV4dGVuc2lvbi90ZXN0LXNraWxsL1NLSUxMLm1kJyk7XG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSB7XG5cdFx0XHRcdGlkZW50aWZpZXI6IHsgdmFsdWU6ICd0ZXN0Lm15LWV4dGVuc2lvbicgfSxcblx0XHRcdFx0ZW5hYmxlZEFwaVByb3Bvc2FsczogWydjaGF0UGFydGljaXBhbnRQcml2YXRlJ11cblx0XHRcdH0gYXMgdW5rbm93biBhcyBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogcHJvdmlkZXJTa2lsbFVyaS5wYXRoLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcInRlc3Qtc2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBza2lsbFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1Rlc3Qgc2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRsZXQgY2hhbmdlRXZlbnRDb3VudCA9IDA7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gc2VydmljZS5vbkRpZENoYW5nZVNsYXNoQ29tbWFuZHMoKCkgPT4ge1xuXHRcdFx0XHRjaGFuZ2VFdmVudENvdW50Kys7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB7XG5cdFx0XHRcdHByb3ZpZGVQcm9tcHRGaWxlczogYXN5bmMgKF9jb250ZXh0OiBJUHJvbXB0RmlsZUNvbnRleHQsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gW3sgdXJpOiBwcm92aWRlclNraWxsVXJpIH1dO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBSZWdpc3RlciBwcm92aWRlciBzaG91bGQgdHJpZ2dlciBjaGFuZ2Vcblx0XHRcdGNvbnN0IHJlZ2lzdGVyZWQgPSBzZXJ2aWNlLnJlZ2lzdGVyUHJvbXB0RmlsZVByb3ZpZGVyKGV4dGVuc2lvbiwgUHJvbXB0c1R5cGUuc2tpbGwsIHByb3ZpZGVyKTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDApKTtcblxuXHRcdFx0Y29uc3QgY29tbWFuZHNXaXRoUHJvdmlkZXIgPSBhd2FpdCBzZXJ2aWNlLmdldFByb21wdFNsYXNoQ29tbWFuZHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCBza2lsbENvbW1hbmQgPSBjb21tYW5kc1dpdGhQcm92aWRlci5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ3Rlc3Qtc2tpbGwnKTtcblx0XHRcdGFzc2VydC5vayhza2lsbENvbW1hbmQsICdTaG91bGQgZmluZCBza2lsbCBmcm9tIHByb3ZpZGVyJyk7XG5cblx0XHRcdC8vIERpc3Bvc2UgcHJvdmlkZXIgc2hvdWxkIHRyaWdnZXIgY2hhbmdlXG5cdFx0XHRyZWdpc3RlcmVkLmRpc3Bvc2UoKTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDApKTtcblxuXHRcdFx0Y29uc3QgY29tbWFuZHNBZnRlckRpc3Bvc2UgPSBhd2FpdCBzZXJ2aWNlLmdldFByb21wdFNsYXNoQ29tbWFuZHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCBza2lsbEFmdGVyRGlzcG9zZSA9IGNvbW1hbmRzQWZ0ZXJEaXNwb3NlLmZpbmQoY21kID0+IGNtZC5uYW1lID09PSAndGVzdC1za2lsbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNraWxsQWZ0ZXJEaXNwb3NlLCB1bmRlZmluZWQsICdTaG91bGQgbm90IGZpbmQgc2tpbGwgYWZ0ZXIgcHJvdmlkZXIgZGlzcG9zYWwnKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGNoYW5nZUV2ZW50Q291bnQgPj0gMiwgJ0NoYW5nZSBldmVudCBzaG91bGQgZmlyZSB3aGVuIHByb3ZpZGVyIHJlZ2lzdGVycyBhbmQgdW5yZWdpc3RlcnMnKTtcblxuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgZmlsZW5hbWUgYXMgZmFsbGJhY2sgZm9yIHNraWxscyB3aXRoIG1pc3NpbmcgbmFtZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnc2xhc2gtY29tbWFuZHMtZmFsbGJhY2stbmFtZSc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIHNraWxsIHdpdGhvdXQgbmFtZSBhdHRyaWJ1dGUgYnV0IHdpdGggZGVzY3JpcHRpb25cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9za2lsbHMvbm8tbmFtZS9TS0lMTC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlNraWxsIHdpdGhvdXQgbmFtZVwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3NraWxscy92YWxpZC1za2lsbC9TS0lMTC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwidmFsaWQtc2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSB2YWxpZCBza2lsbFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1ZhbGlkIHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3Qgc2xhc2hDb21tYW5kcyA9IGF3YWl0IHNlcnZpY2UuZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGluY2x1ZGUgc2tpbGwgd2l0aCBmYWxsYmFjayBuYW1lIGZyb20gZm9sZGVyIG5hbWVcblx0XHRcdGNvbnN0IGZhbGxiYWNrTmFtZUNvbW1hbmQgPSBzbGFzaENvbW1hbmRzLmZpbmQoY21kID0+IGNtZC5uYW1lID09PSAnbm8tbmFtZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKGZhbGxiYWNrTmFtZUNvbW1hbmQsICdTaG91bGQgZmluZCBza2lsbCB3aXRoIGZhbGxiYWNrIG5hbWUgZnJvbSBmb2xkZXIgbmFtZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhbGxiYWNrTmFtZUNvbW1hbmQuZGVzY3JpcHRpb24sICdTa2lsbCB3aXRob3V0IG5hbWUnKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGluY2x1ZGUgdmFsaWQgc2tpbGxcblx0XHRcdGNvbnN0IHZhbGlkU2tpbGxDb21tYW5kID0gc2xhc2hDb21tYW5kcy5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ3ZhbGlkLXNraWxsJyk7XG5cdFx0XHRhc3NlcnQub2sodmFsaWRTa2lsbENvbW1hbmQsICdTaG91bGQgZmluZCB2YWxpZCBza2lsbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSBmb2xkZXIgbmFtZSBhcyBzbGFzaCBjb21tYW5kIG5hbWUgd2hlbiBmcm9udG1hdHRlciBuYW1lIGRpZmZlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ3NsYXNoLWNvbW1hbmRzLWZvbGRlci1uYW1lLW92ZXJyaWRlJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvc2tpbGxzL3Rlc3QvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcImZvb1wiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIHNraWxsIHdpdGggbWlzbWF0Y2hlZCBmcm9udG1hdHRlciBuYW1lXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnc2F5IGhpeWEhJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHNsYXNoQ29tbWFuZHMgPSBhd2FpdCBzZXJ2aWNlLmdldFByb21wdFNsYXNoQ29tbWFuZHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGNvbnN0IGZvbGRlck5hbWVDb21tYW5kID0gc2xhc2hDb21tYW5kcy5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ3Rlc3QnKTtcblx0XHRcdGFzc2VydC5vayhmb2xkZXJOYW1lQ29tbWFuZCwgJ1Nob3VsZCBmaW5kIHNraWxsIHVzaW5nIGZvbGRlciBuYW1lIGFzIHNsYXNoIGNvbW1hbmQgbmFtZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbGRlck5hbWVDb21tYW5kLmRlc2NyaXB0aW9uLCAnQSBza2lsbCB3aXRoIG1pc21hdGNoZWQgZnJvbnRtYXR0ZXIgbmFtZScpO1xuXG5cdFx0XHRjb25zdCBmcm9udG1hdHRlck5hbWVDb21tYW5kID0gc2xhc2hDb21tYW5kcy5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ2ZvbycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZyb250bWF0dGVyTmFtZUNvbW1hbmQsIHVuZGVmaW5lZCwgJ1Nob3VsZCBub3QgZmluZCBza2lsbCB1c2luZyBmcm9udG1hdHRlciBuYW1lJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGR1cGxpY2F0ZSBzbGFzaCBjb21tYW5kcyB3aXRoIHNhbWUgbmFtZSBmcm9tIGRpZmZlcmVudCB0eXBlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnc2xhc2gtY29tbWFuZHMtbm8tZHVwbGljYXRlcyc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIHByb21wdCBhbmQgc2tpbGwgd2l0aCBzYW1lIG5hbWVcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9wcm9tcHRzL2R1cGxpY2F0ZS1uYW1lLnByb21wdC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiZHVwbGljYXRlLW5hbWVcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSBwcm9tcHQgZmlsZVwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1Byb21wdCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9za2lsbHMvZHVwbGljYXRlLW5hbWUvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcImR1cGxpY2F0ZS1uYW1lXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgc2tpbGwgZmlsZVwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3Qgc2xhc2hDb21tYW5kcyA9IGF3YWl0IHNlcnZpY2UuZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Y29uc3QgZHVwbGljYXRlQ29tbWFuZHMgPSBzbGFzaENvbW1hbmRzLmZpbHRlcihjbWQgPT4gY21kLm5hbWUgPT09ICdkdXBsaWNhdGUtbmFtZScpO1xuXHRcdFx0Ly8gQm90aCBzaG91bGQgYmUgcHJlc2VudCAtIHRoZSBmdW5jdGlvbiByZXR1cm5zIGFsbCBzbGFzaCBjb21tYW5kcyB3aXRob3V0IGRlZHVwbGljYXRpb25cblx0XHRcdC8vIFRoaXMgYWxsb3dzIHRoZSBjYWxsZXIgdG8gaGFuZGxlIG5hbWUgY29uZmxpY3RzIChlLmcuLCBwcm9tcHQgdGFrZXMgcHJlY2VkZW5jZSBvdmVyIHNraWxsKVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGR1cGxpY2F0ZUNvbW1hbmRzLmxlbmd0aCwgMiwgJ1Nob3VsZCByZXR1cm4gYm90aCBwcm9tcHQgYW5kIHNraWxsIHdpdGggc2FtZSBuYW1lJyk7XG5cblx0XHRcdGNvbnN0IHByb21wdENvbW1hbmQgPSBkdXBsaWNhdGVDb21tYW5kcy5maW5kKGNtZCA9PiBjbWQudHlwZSA9PT0gUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRcdGFzc2VydC5vayhwcm9tcHRDb21tYW5kLCAnU2hvdWxkIGZpbmQgcHJvbXB0IGNvbW1hbmQnKTtcblxuXHRcdFx0Y29uc3Qgc2tpbGxDb21tYW5kID0gZHVwbGljYXRlQ29tbWFuZHMuZmluZChjbWQgPT4gY21kLnR5cGUgPT09IFByb21wdHNUeXBlLnNraWxsKTtcblx0XHRcdGFzc2VydC5vayhza2lsbENvbW1hbmQsICdTaG91bGQgZmluZCBza2lsbCBjb21tYW5kJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVzcGVjdCBza2lsbCBkaXNhYmxlIGNvbmZpZ3VyYXRpb24gKFVTRV9BR0VOVF9TS0lMTFMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCBmYWxzZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnc2xhc2gtY29tbWFuZHMtc2tpbGxzLWRpc2FibGVkJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHQvLyBDcmVhdGUgYm90aCBwcm9tcHQgYW5kIHNraWxsXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvcHJvbXB0cy9teS1wcm9tcHQucHJvbXB0Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJteS1wcm9tcHRcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSBwcm9tcHRcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdQcm9tcHQgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvc2tpbGxzL215LXNraWxsL1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJteS1za2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIHNraWxsXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnU2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBzbGFzaENvbW1hbmRzID0gYXdhaXQgc2VydmljZS5nZXRQcm9tcHRTbGFzaENvbW1hbmRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRjb25zdCBwcm9tcHRDb21tYW5kID0gc2xhc2hDb21tYW5kcy5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ215LXByb21wdCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHByb21wdENvbW1hbmQsICdTaG91bGQgZmluZCBwcm9tcHQgY29tbWFuZCBldmVuIHdoZW4gc2tpbGxzIGFyZSBkaXNhYmxlZCcpO1xuXG5cdFx0XHRjb25zdCBza2lsbENvbW1hbmQgPSBzbGFzaENvbW1hbmRzLmZpbmQoY21kID0+IGNtZC5uYW1lID09PSAnbXktc2tpbGwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChza2lsbENvbW1hbmQsIHVuZGVmaW5lZCwgJ1Nob3VsZCBub3QgZmluZCBza2lsbCBjb21tYW5kIHdoZW4gc2tpbGxzIGFyZSBkaXNhYmxlZCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyAtIHVzZXJJbnZvY2FibGUgZmlsdGVyaW5nJywgKCkgPT4ge1xuXHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdHNpbm9uLnJlc3RvcmUoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gY29ycmVjdCB1c2VySW52b2NhYmxlIHZhbHVlIGZvciBza2lsbHMgd2l0aCB1c2VyLWludm9jYWJsZTogZmFsc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ3VzZXItaW52b2NhYmxlLWZhbHNlJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHQvLyBDcmVhdGUgYSBza2lsbCB3aXRoIHVzZXItaW52b2NhYmxlOiBmYWxzZSAoc2hvdWxkIGJlIGhpZGRlbiBmcm9tIC8gbWVudSlcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9za2lsbHMvaGlkZGVuLXNraWxsL1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJoaWRkZW4tc2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSBza2lsbCBoaWRkZW4gZnJvbSB0aGUgLyBtZW51XCInLFxuXHRcdFx0XHRcdFx0J3VzZXItaW52b2NhYmxlOiBmYWxzZScsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdIaWRkZW4gc2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBzbGFzaENvbW1hbmRzID0gYXdhaXQgc2VydmljZS5nZXRQcm9tcHRTbGFzaENvbW1hbmRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRjb25zdCBoaWRkZW5Ta2lsbENvbW1hbmQgPSBzbGFzaENvbW1hbmRzLmZpbmQoY21kID0+IGNtZC5uYW1lID09PSAnaGlkZGVuLXNraWxsJyk7XG5cdFx0XHRhc3NlcnQub2soaGlkZGVuU2tpbGxDb21tYW5kLCAnU2hvdWxkIGZpbmQgaGlkZGVuIHNraWxsIGluIHNsYXNoIGNvbW1hbmRzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlkZGVuU2tpbGxDb21tYW5kLnVzZXJJbnZvY2FibGUsIGZhbHNlLFxuXHRcdFx0XHQnU2hvdWxkIGhhdmUgdXNlckludm9jYWJsZT1mYWxzZSBpbiBwYXJzZWQgaGVhZGVyJyk7XG5cblx0XHRcdC8vIFZlcmlmeSB0aGUgZmlsdGVyaW5nIGxvZ2ljIHdvdWxkIGNvcnJlY3RseSBleGNsdWRlIHRoaXMgc2tpbGxcblx0XHRcdGNvbnN0IGZpbHRlcmVkQ29tbWFuZHMgPSBzbGFzaENvbW1hbmRzLmZpbHRlcihjID0+IGMudXNlckludm9jYWJsZSk7XG5cdFx0XHRjb25zdCBoaWRkZW5Ta2lsbEluRmlsdGVyZWQgPSBmaWx0ZXJlZENvbW1hbmRzLmZpbmQoY21kID0+IGNtZC5uYW1lID09PSAnaGlkZGVuLXNraWxsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlkZGVuU2tpbGxJbkZpbHRlcmVkLCB1bmRlZmluZWQsXG5cdFx0XHRcdCdIaWRkZW4gc2tpbGwgc2hvdWxkIGJlIGZpbHRlcmVkIG91dCB3aGVuIGFwcGx5aW5nIHVzZXJJbnZvY2FibGUgZmlsdGVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGNvcnJlY3QgdXNlckludm9jYWJsZSB2YWx1ZSBmb3Igc2tpbGxzIHdpdGggdXNlci1pbnZvY2FibGU6IHRydWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ3VzZXItaW52b2NhYmxlLXRydWUnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdC8vIENyZWF0ZSBhIHNraWxsIHdpdGggZXhwbGljaXQgdXNlci1pbnZvY2FibGU6IHRydWVcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9za2lsbHMvdmlzaWJsZS1za2lsbC9TS0lMTC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwidmlzaWJsZS1za2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIHNraWxsIHZpc2libGUgaW4gdGhlIC8gbWVudVwiJyxcblx0XHRcdFx0XHRcdCd1c2VyLWludm9jYWJsZTogdHJ1ZScsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdWaXNpYmxlIHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3Qgc2xhc2hDb21tYW5kcyA9IGF3YWl0IHNlcnZpY2UuZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Y29uc3QgdmlzaWJsZVNraWxsQ29tbWFuZCA9IHNsYXNoQ29tbWFuZHMuZmluZChjbWQgPT4gY21kLm5hbWUgPT09ICd2aXNpYmxlLXNraWxsJyk7XG5cdFx0XHRhc3NlcnQub2sodmlzaWJsZVNraWxsQ29tbWFuZCwgJ1Nob3VsZCBmaW5kIHZpc2libGUgc2tpbGwgaW4gc2xhc2ggY29tbWFuZHMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aXNpYmxlU2tpbGxDb21tYW5kLnVzZXJJbnZvY2FibGUsIHRydWUsXG5cdFx0XHRcdCdTaG91bGQgaGF2ZSB1c2VySW52b2NhYmxlPXRydWUgaW4gcGFyc2VkIGhlYWRlcicpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGhlIGZpbHRlcmluZyBsb2dpYyB3b3VsZCBjb3JyZWN0bHkgaW5jbHVkZSB0aGlzIHNraWxsXG5cdFx0XHRjb25zdCBmaWx0ZXJlZENvbW1hbmRzID0gc2xhc2hDb21tYW5kcy5maWx0ZXIoYyA9PiBjLnVzZXJJbnZvY2FibGUpO1xuXHRcdFx0Y29uc3QgdmlzaWJsZVNraWxsSW5GaWx0ZXJlZCA9IGZpbHRlcmVkQ29tbWFuZHMuZmluZChjbWQgPT4gY21kLm5hbWUgPT09ICd2aXNpYmxlLXNraWxsJyk7XG5cdFx0XHRhc3NlcnQub2sodmlzaWJsZVNraWxsSW5GaWx0ZXJlZCxcblx0XHRcdFx0J1Zpc2libGUgc2tpbGwgc2hvdWxkIGJlIGluY2x1ZGVkIHdoZW4gYXBwbHlpbmcgdXNlckludm9jYWJsZSBmaWx0ZXInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBkZWZhdWx0IHRvIHRydWUgZm9yIHNraWxscyB3aXRob3V0IHVzZXItaW52b2NhYmxlIGF0dHJpYnV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAndXNlci1pbnZvY2FibGUtdW5kZWZpbmVkJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHQvLyBDcmVhdGUgYSBza2lsbCB3aXRob3V0IHVzZXItaW52b2NhYmxlIGF0dHJpYnV0ZSAoc2hvdWxkIGRlZmF1bHQgdG8gdHJ1ZSlcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9za2lsbHMvZGVmYXVsdC1za2lsbC9TS0lMTC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiZGVmYXVsdC1za2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIHNraWxsIHdpdGhvdXQgZXhwbGljaXQgdXNlci1pbnZvY2FibGVcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdEZWZhdWx0IHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3Qgc2xhc2hDb21tYW5kcyA9IGF3YWl0IHNlcnZpY2UuZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Y29uc3QgZGVmYXVsdFNraWxsQ29tbWFuZCA9IHNsYXNoQ29tbWFuZHMuZmluZChjbWQgPT4gY21kLm5hbWUgPT09ICdkZWZhdWx0LXNraWxsJyk7XG5cdFx0XHRhc3NlcnQub2soZGVmYXVsdFNraWxsQ29tbWFuZCwgJ1Nob3VsZCBmaW5kIGRlZmF1bHQgc2tpbGwgaW4gc2xhc2ggY29tbWFuZHMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWZhdWx0U2tpbGxDb21tYW5kLnVzZXJJbnZvY2FibGUsIHRydWUsICdTaG91bGQgaGF2ZSB1c2VySW52b2NhYmxlPXRydWUgd2hlbiBhdHRyaWJ1dGUgaXMgbm90IHNwZWNpZmllZCcpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGhlIGZpbHRlcmluZyBsb2dpYyB3b3VsZCBjb3JyZWN0bHkgaW5jbHVkZSB0aGlzIHNraWxsICh1bmRlZmluZWQgIT09IGZhbHNlIGlzIHRydWUpXG5cdFx0XHRjb25zdCBmaWx0ZXJlZENvbW1hbmRzID0gc2xhc2hDb21tYW5kcy5maWx0ZXIoYyA9PiBjLnVzZXJJbnZvY2FibGUpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdFNraWxsSW5GaWx0ZXJlZCA9IGZpbHRlcmVkQ29tbWFuZHMuZmluZChjbWQgPT4gY21kLm5hbWUgPT09ICdkZWZhdWx0LXNraWxsJyk7XG5cdFx0XHRhc3NlcnQub2soZGVmYXVsdFNraWxsSW5GaWx0ZXJlZCxcblx0XHRcdFx0J1NraWxsIHdpdGhvdXQgdXNlci1pbnZvY2FibGUgYXR0cmlidXRlIHNob3VsZCBiZSBpbmNsdWRlZCB3aGVuIGFwcGx5aW5nIHVzZXJJbnZvY2FibGUgZmlsdGVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHByb21wdHMgd2l0aCB1c2VyLWludm9jYWJsZTogZmFsc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdwcm9tcHQtdXNlci1pbnZvY2FibGUtZmFsc2UnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdC8vIENyZWF0ZSBhIHByb21wdCB3aXRoIHVzZXItaW52b2NhYmxlOiBmYWxzZVxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3Byb21wdHMvaGlkZGVuLXByb21wdC5wcm9tcHQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcImhpZGRlbi1wcm9tcHRcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSBwcm9tcHQgaGlkZGVuIGZyb20gdGhlIC8gbWVudVwiJyxcblx0XHRcdFx0XHRcdCd1c2VyLWludm9jYWJsZTogZmFsc2UnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSGlkZGVuIHByb21wdCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHNsYXNoQ29tbWFuZHMgPSBhd2FpdCBzZXJ2aWNlLmdldFByb21wdFNsYXNoQ29tbWFuZHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGNvbnN0IGhpZGRlblByb21wdENvbW1hbmQgPSBzbGFzaENvbW1hbmRzLmZpbmQoY21kID0+IGNtZC5uYW1lID09PSAnaGlkZGVuLXByb21wdCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGhpZGRlblByb21wdENvbW1hbmQsICdTaG91bGQgZmluZCBoaWRkZW4gcHJvbXB0IGluIHNsYXNoIGNvbW1hbmRzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlkZGVuUHJvbXB0Q29tbWFuZC51c2VySW52b2NhYmxlLCBmYWxzZSxcblx0XHRcdFx0J1Nob3VsZCBoYXZlIHVzZXJJbnZvY2FibGU9ZmFsc2UgaW4gcGFyc2VkIGhlYWRlcicpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGhlIGZpbHRlcmluZyBsb2dpYyB3b3VsZCBjb3JyZWN0bHkgZXhjbHVkZSB0aGlzIHByb21wdFxuXHRcdFx0Y29uc3QgZmlsdGVyZWRDb21tYW5kcyA9IHNsYXNoQ29tbWFuZHMuZmlsdGVyKGMgPT4gYy51c2VySW52b2NhYmxlKTtcblx0XHRcdGNvbnN0IGhpZGRlblByb21wdEluRmlsdGVyZWQgPSBmaWx0ZXJlZENvbW1hbmRzLmZpbmQoY21kID0+IGNtZC5uYW1lID09PSAnaGlkZGVuLXByb21wdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpZGRlblByb21wdEluRmlsdGVyZWQsIHVuZGVmaW5lZCxcblx0XHRcdFx0J0hpZGRlbiBwcm9tcHQgc2hvdWxkIGJlIGZpbHRlcmVkIG91dCB3aGVuIGFwcGx5aW5nIHVzZXJJbnZvY2FibGUgZmlsdGVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgY29ycmVjdGx5IGZpbHRlciBtaXhlZCB1c2VyLWludm9jYWJsZSB2YWx1ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ21peGVkLXVzZXItaW52b2NhYmxlJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHQvLyBDcmVhdGUgYSBtaXggb2Ygc2tpbGxzIGFuZCBwcm9tcHRzIHdpdGggZGlmZmVyZW50IHVzZXItaW52b2NhYmxlIHZhbHVlc1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3Byb21wdHMvdmlzaWJsZS1wcm9tcHQucHJvbXB0Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJ2aXNpYmxlLXByb21wdFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIHZpc2libGUgcHJvbXB0XCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnVmlzaWJsZSBwcm9tcHQgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvcHJvbXB0cy9oaWRkZW4tcHJvbXB0LnByb21wdC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiaGlkZGVuLXByb21wdFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIGhpZGRlbiBwcm9tcHRcIicsXG5cdFx0XHRcdFx0XHQndXNlci1pbnZvY2FibGU6IGZhbHNlJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0hpZGRlbiBwcm9tcHQgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvc2tpbGxzL3Zpc2libGUtc2tpbGwvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcInZpc2libGUtc2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSB2aXNpYmxlIHNraWxsXCInLFxuXHRcdFx0XHRcdFx0J3VzZXItaW52b2NhYmxlOiB0cnVlJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1Zpc2libGUgc2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvc2tpbGxzL2hpZGRlbi1za2lsbC9TS0lMTC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiaGlkZGVuLXNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgaGlkZGVuIHNraWxsXCInLFxuXHRcdFx0XHRcdFx0J3VzZXItaW52b2NhYmxlOiBmYWxzZScsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdIaWRkZW4gc2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBzbGFzaENvbW1hbmRzID0gYXdhaXQgc2VydmljZS5nZXRQcm9tcHRTbGFzaENvbW1hbmRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHQvLyBBbGwgY29tbWFuZHMgc2hvdWxkIGJlIHByZXNlbnQgaW4gdGhlIHJhdyBsaXN0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2xhc2hDb21tYW5kcy5sZW5ndGgsIDQsICdTaG91bGQgZmluZCBhbGwgNCBjb21tYW5kcycpO1xuXG5cdFx0XHQvLyBBcHBseSB0aGUgc2FtZSBmaWx0ZXJpbmcgbG9naWMgYXMgY2hhdElucHV0Q29tcGxldGlvbnMudHNcblx0XHRcdGNvbnN0IGZpbHRlcmVkQ29tbWFuZHMgPSBzbGFzaENvbW1hbmRzLmZpbHRlcihjID0+IGMudXNlckludm9jYWJsZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXJlZENvbW1hbmRzLmxlbmd0aCwgMiwgJ1Nob3VsZCBoYXZlIDIgY29tbWFuZHMgYWZ0ZXIgZmlsdGVyaW5nJyk7XG5cdFx0XHRhc3NlcnQub2soZmlsdGVyZWRDb21tYW5kcy5maW5kKGMgPT4gYy5uYW1lID09PSAndmlzaWJsZS1wcm9tcHQnKSwgJ3Zpc2libGUtcHJvbXB0IHNob3VsZCBiZSBpbmNsdWRlZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGZpbHRlcmVkQ29tbWFuZHMuZmluZChjID0+IGMubmFtZSA9PT0gJ3Zpc2libGUtc2tpbGwnKSwgJ3Zpc2libGUtc2tpbGwgc2hvdWxkIGJlIGluY2x1ZGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyZWRDb21tYW5kcy5maW5kKGMgPT4gYy5uYW1lID09PSAnaGlkZGVuLXByb21wdCcpLCB1bmRlZmluZWQsICdoaWRkZW4tcHJvbXB0IHNob3VsZCBiZSBleGNsdWRlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlcmVkQ29tbWFuZHMuZmluZChjID0+IGMubmFtZSA9PT0gJ2hpZGRlbi1za2lsbCcpLCB1bmRlZmluZWQsICdoaWRkZW4tc2tpbGwgc2hvdWxkIGJlIGV4Y2x1ZGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHNraWxscyB3aXRoIG1pc3NpbmcgaGVhZGVyIGdyYWNlZnVsbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ21pc3NpbmctaGVhZGVyJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHQvLyBDcmVhdGUgYSBza2lsbCB3aXRob3V0IGFueSBZQU1MIGhlYWRlclxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3NraWxscy9uby1oZWFkZXItc2tpbGwvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnVGhpcyBza2lsbCBoYXMgbm8gWUFNTCBoZWFkZXIgYXQgYWxsLicsXG5cdFx0XHRcdFx0XHQnSnVzdCBwbGFpbiBtYXJrZG93biBjb250ZW50LicsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBzbGFzaENvbW1hbmRzID0gYXdhaXQgc2VydmljZS5nZXRQcm9tcHRTbGFzaENvbW1hbmRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHQvLyBGaW5kIHRoZSBza2lsbCBieSBjaGVja2luZyBhbGwgY29tbWFuZHMgKG5hbWUgd2lsbCBiZSBkZXJpdmVkIGZyb20gZmlsZW5hbWUpXG5cdFx0XHRjb25zdCBub0hlYWRlclNraWxsID0gc2xhc2hDb21tYW5kcy5maW5kKGNtZCA9PlxuXHRcdFx0XHRjbWQudXJpLnBhdGguaW5jbHVkZXMoJ25vLWhlYWRlci1za2lsbCcpKTtcblx0XHRcdGFzc2VydC5vayhub0hlYWRlclNraWxsLCAnU2hvdWxkIGZpbmQgc2tpbGwgd2l0aG91dCBoZWFkZXIgaW4gc2xhc2ggY29tbWFuZHMnKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHRoZSBmaWx0ZXJpbmcgbG9naWMgaGFuZGxlcyBtaXNzaW5nIGhlYWRlciBjb3JyZWN0bHlcblx0XHRcdC8vIHBhcnNlZFByb21wdEZpbGU/LmhlYWRlcj8udXNlckludm9jYWJsZVxuXHRcdFx0Ly8gV2hlbiBoZWFkZXIgaXMgdW5kZWZpbmVkOiB1bmRlZmluZWQgIT09IGZhbHNlIGlzIHRydWUsIHNvIHNraWxsIGlzIGluY2x1ZGVkXG5cdFx0XHRjb25zdCBmaWx0ZXJlZENvbW1hbmRzID0gc2xhc2hDb21tYW5kcy5maWx0ZXIoYyA9PiBjLnVzZXJJbnZvY2FibGUpO1xuXHRcdFx0Y29uc3Qgbm9IZWFkZXJTa2lsbEluRmlsdGVyZWQgPSBmaWx0ZXJlZENvbW1hbmRzLmZpbmQoY21kID0+XG5cdFx0XHRcdGNtZC51cmkucGF0aC5pbmNsdWRlcygnbm8taGVhZGVyLXNraWxsJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKG5vSGVhZGVyU2tpbGxJbkZpbHRlcmVkLFxuXHRcdFx0XHQnU2tpbGwgd2l0aG91dCBoZWFkZXIgc2hvdWxkIGJlIGluY2x1ZGVkIHdoZW4gYXBwbHlpbmcgdXNlckludm9jYWJsZSBmaWx0ZXIgKGRlZmF1bHRzIHRvIHRydWUpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwbHVnaW4gc2tpbGxzIGluY2x1ZGUgcGx1Z2luIG5hbWUgcHJlZml4IGluIHNsYXNoIGNvbW1hbmQgbmFtZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3Qgc2tpbGxVcmkgPSBVUkkuZmlsZSgnL3BsdWdpbnMvbXktcGx1Z2luL3NraWxscy9kZXBsb3kvU0tJTEwubWQnKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogc2tpbGxVcmkucGF0aCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiRGVwbG95IHNraWxsIGZyb20gcGx1Z2luXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnRGVwbG95IHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZW5hYmxlbWVudCA9IG9ic2VydmFibGVWYWx1ZSgndGVzdFBsdWdpbkVuYWJsZW1lbnQnLCAyIC8qIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZSAqLyk7XG5cdFx0XHRjb25zdCBwbHVnaW46IElBZ2VudFBsdWdpbiA9IHtcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL3BsdWdpbnMvbXktcGx1Z2luJyksXG5cdFx0XHRcdGZvcm1hdDogUGx1Z2luRm9ybWF0LkNvcGlsb3QsXG5cdFx0XHRcdGxhYmVsOiAnbXktcGx1Z2luJyxcblx0XHRcdFx0ZW5hYmxlbWVudCxcblx0XHRcdFx0cmVtb3ZlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGhvb2tzOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3RQbHVnaW5Ib29rcycsIFtdKSxcblx0XHRcdFx0Y29tbWFuZHM6IG9ic2VydmFibGVWYWx1ZSgndGVzdFBsdWdpbkNvbW1hbmRzJywgW10pLFxuXHRcdFx0XHRza2lsbHM6IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRQbHVnaW5Ta2lsbFtdPigndGVzdFBsdWdpblNraWxscycsIFt7IHVyaTogc2tpbGxVcmksIG5hbWU6ICdkZXBsb3knIH1dKSxcblx0XHRcdFx0YWdlbnRzOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3RQbHVnaW5BZ2VudHMnLCBbXSksXG5cdFx0XHRcdGluc3RydWN0aW9uczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0UGx1Z2luSW5zdHJ1Y3Rpb25zJywgW10pLFxuXHRcdFx0XHRtY3BTZXJ2ZXJEZWZpbml0aW9uczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0UGx1Z2luTWNwU2VydmVyRGVmaW5pdGlvbnMnLCBbXSksXG5cdFx0XHR9O1xuXG5cdFx0XHR0ZXN0UGx1Z2luc09ic2VydmFibGUuc2V0KFtwbHVnaW5dLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBzbGFzaENvbW1hbmRzID0gYXdhaXQgc2VydmljZS5nZXRQcm9tcHRTbGFzaENvbW1hbmRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHQvLyBTaG91bGQgYmUgcHJlZml4ZWQgd2l0aCBwbHVnaW4gbmFtZVxuXHRcdFx0Y29uc3Qgc2tpbGxDb21tYW5kID0gc2xhc2hDb21tYW5kcy5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ215LXBsdWdpbjpkZXBsb3knKTtcblx0XHRcdGFzc2VydC5vayhza2lsbENvbW1hbmQsICdQbHVnaW4gc2tpbGwgc2hvdWxkIGhhdmUgcGx1Z2luIHByZWZpeCBpbiBzbGFzaCBjb21tYW5kIG5hbWUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChza2lsbENvbW1hbmQuc3RvcmFnZSwgUHJvbXB0c1N0b3JhZ2UucGx1Z2luKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChza2lsbENvbW1hbmQudHlwZSwgUHJvbXB0c1R5cGUuc2tpbGwpO1xuXG5cdFx0XHR0ZXN0UGx1Z2luc09ic2VydmFibGUuc2V0KFtdLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGx1Z2luIHNraWxsIGZyb250bWF0dGVyIG5hbWUgaXMgcXVhbGlmaWVkIHdpdGggcGx1Z2luIHByZWZpeCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3Qgc2tpbGxVcmkgPSBVUkkuZmlsZSgnL3BsdWdpbnMvZGV2dG9vbHMvc2tpbGxzL2NpL1NLSUxMLm1kJyk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IHNraWxsVXJpLnBhdGgsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwicnVuLWNpXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlJ1biBDSSBwaXBlbGluZVwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0NJIHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZW5hYmxlbWVudCA9IG9ic2VydmFibGVWYWx1ZSgndGVzdFBsdWdpbkVuYWJsZW1lbnQnLCAyIC8qIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZSAqLyk7XG5cdFx0XHRjb25zdCBwbHVnaW46IElBZ2VudFBsdWdpbiA9IHtcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL3BsdWdpbnMvZGV2dG9vbHMnKSxcblx0XHRcdFx0Zm9ybWF0OiBQbHVnaW5Gb3JtYXQuQ29waWxvdCxcblx0XHRcdFx0bGFiZWw6ICdkZXZ0b29scycsXG5cdFx0XHRcdGVuYWJsZW1lbnQsXG5cdFx0XHRcdHJlbW92ZTogKCkgPT4geyB9LFxuXHRcdFx0XHRob29rczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0UGx1Z2luSG9va3MnLCBbXSksXG5cdFx0XHRcdGNvbW1hbmRzOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3RQbHVnaW5Db21tYW5kcycsIFtdKSxcblx0XHRcdFx0c2tpbGxzOiBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50UGx1Z2luU2tpbGxbXT4oJ3Rlc3RQbHVnaW5Ta2lsbHMnLCBbeyB1cmk6IHNraWxsVXJpLCBuYW1lOiAnY2knIH1dKSxcblx0XHRcdFx0YWdlbnRzOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3RQbHVnaW5BZ2VudHMnLCBbXSksXG5cdFx0XHRcdGluc3RydWN0aW9uczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0UGx1Z2luSW5zdHJ1Y3Rpb25zJywgW10pLFxuXHRcdFx0XHRtY3BTZXJ2ZXJEZWZpbml0aW9uczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0UGx1Z2luTWNwU2VydmVyRGVmaW5pdGlvbnMnLCBbXSksXG5cdFx0XHR9O1xuXG5cdFx0XHR0ZXN0UGx1Z2luc09ic2VydmFibGUuc2V0KFtwbHVnaW5dLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBzbGFzaENvbW1hbmRzID0gYXdhaXQgc2VydmljZS5nZXRQcm9tcHRTbGFzaENvbW1hbmRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHQvLyBTa2lsbCBuYW1lIGlzIGRlcml2ZWQgZnJvbSBmb2xkZXIgbmFtZSAoY2kpLCBub3QgZnJvbnRtYXR0ZXIgbmFtZSAocnVuLWNpKSxcblx0XHRcdC8vIGFuZCBwcmVmaXhlZCB3aXRoIHRoZSBwbHVnaW4gbmFtZVxuXHRcdFx0Y29uc3Qgc2tpbGxDb21tYW5kID0gc2xhc2hDb21tYW5kcy5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ2RldnRvb2xzOmNpJyk7XG5cdFx0XHRhc3NlcnQub2soc2tpbGxDb21tYW5kLCAnUGx1Z2luIHNraWxsIGZvbGRlciBuYW1lIHNob3VsZCBiZSBxdWFsaWZpZWQgd2l0aCBwbHVnaW4gcHJlZml4Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2tpbGxDb21tYW5kLmRlc2NyaXB0aW9uLCAnUnVuIENJIHBpcGVsaW5lJyk7XG5cblx0XHRcdC8vIFRoZSBmcm9udG1hdHRlciBuYW1lIHNob3VsZCBub3QgYXBwZWFyXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2xhc2hDb21tYW5kcy5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ2RldnRvb2xzOnJ1bi1jaScpLCB1bmRlZmluZWQsXG5cdFx0XHRcdCdGcm9udG1hdHRlciBza2lsbCBuYW1lIHNob3VsZCBub3QgYXBwZWFyIGFzIHNsYXNoIGNvbW1hbmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbGFzaENvbW1hbmRzLmZpbmQoY21kID0+IGNtZC5uYW1lID09PSAncnVuLWNpJyksIHVuZGVmaW5lZCxcblx0XHRcdFx0J1VucHJlZml4ZWQgc2tpbGwgbmFtZSBzaG91bGQgbm90IGFwcGVhciBhcyBzbGFzaCBjb21tYW5kJyk7XG5cblx0XHRcdHRlc3RQbHVnaW5zT2JzZXJ2YWJsZS5zZXQoW10sIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwbHVnaW4gc2tpbGwgc2xhc2ggY29tbWFuZCBwcmVmaXggdXNlcyBwbHVnaW4gbGFiZWwgd2hlbiBpbnN0YWxsIHBhdGggaXMgYSBwaW5uZWQgU0hBJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCBwbHVnaW5VcmkgPSBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIvZGF0YWRvZy9zaGFfYjAwM2ZjYWQ0OGMzYTkzNWZmZTA0YjYyMThmNWNmNThmZTJiNjc2MCcpO1xuXHRcdFx0Y29uc3Qgc2tpbGxVcmkgPSBVUkkuam9pblBhdGgocGx1Z2luVXJpLCAnc2tpbGxzJywgJ2Rkc2V0dXAnLCAnU0tJTEwubWQnKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogc2tpbGxVcmkucGF0aCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJkZHNldHVwXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlNldCB1cCBEYXRhZG9nXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnRGF0YWRvZyBzZXR1cCBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGVuYWJsZW1lbnQgPSBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3RQbHVnaW5FbmFibGVtZW50JywgMiAvKiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFByb2ZpbGUgKi8pO1xuXHRcdFx0Y29uc3QgcGx1Z2luOiBJQWdlbnRQbHVnaW4gPSB7XG5cdFx0XHRcdHVyaTogcGx1Z2luVXJpLFxuXHRcdFx0XHRmb3JtYXQ6IFBsdWdpbkZvcm1hdC5Db3BpbG90LFxuXHRcdFx0XHRsYWJlbDogJ2RhdGFkb2cnLFxuXHRcdFx0XHRlbmFibGVtZW50LFxuXHRcdFx0XHRyZW1vdmU6ICgpID0+IHsgfSxcblx0XHRcdFx0aG9va3M6IG9ic2VydmFibGVWYWx1ZSgndGVzdFBsdWdpbkhvb2tzJywgW10pLFxuXHRcdFx0XHRjb21tYW5kczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0UGx1Z2luQ29tbWFuZHMnLCBbXSksXG5cdFx0XHRcdHNraWxsczogb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBZ2VudFBsdWdpblNraWxsW10+KCd0ZXN0UGx1Z2luU2tpbGxzJywgW3sgdXJpOiBza2lsbFVyaSwgbmFtZTogJ2Rkc2V0dXAnIH1dKSxcblx0XHRcdFx0YWdlbnRzOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3RQbHVnaW5BZ2VudHMnLCBbXSksXG5cdFx0XHRcdGluc3RydWN0aW9uczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0UGx1Z2luSW5zdHJ1Y3Rpb25zJywgW10pLFxuXHRcdFx0XHRtY3BTZXJ2ZXJEZWZpbml0aW9uczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0UGx1Z2luTWNwU2VydmVyRGVmaW5pdGlvbnMnLCBbXSksXG5cdFx0XHR9O1xuXG5cdFx0XHR0ZXN0UGx1Z2luc09ic2VydmFibGUuc2V0KFtwbHVnaW5dLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBzbGFzaENvbW1hbmRzID0gYXdhaXQgc2VydmljZS5nZXRQcm9tcHRTbGFzaENvbW1hbmRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNsYXNoQ29tbWFuZHNcblx0XHRcdFx0LmZpbHRlcihjb21tYW5kID0+IGNvbW1hbmQudXJpLnRvU3RyaW5nKCkgPT09IHNraWxsVXJpLnRvU3RyaW5nKCkpXG5cdFx0XHRcdC5tYXAoY29tbWFuZCA9PiAoeyBuYW1lOiBjb21tYW5kLm5hbWUsIGRlc2NyaXB0aW9uOiBjb21tYW5kLmRlc2NyaXB0aW9uLCB0eXBlOiBjb21tYW5kLnR5cGUsIHN0b3JhZ2U6IGNvbW1hbmQuc3RvcmFnZSB9KSksIFt7XG5cdFx0XHRcdFx0bmFtZTogJ2RhdGFkb2c6ZGRzZXR1cCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdTZXQgdXAgRGF0YWRvZycsXG5cdFx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuc2tpbGwsXG5cdFx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UucGx1Z2luLFxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdHRlc3RQbHVnaW5zT2JzZXJ2YWJsZS5zZXQoW10sIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjdXN0b21pemF0aW9uIGxvY2tkb3duJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3BvbGljeSBjaGFuZ2VzIGludmFsaWRhdGUgY2FjaGVkIHN0YW5kYWxvbmUgYWdlbnQgbG9jYXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKCcvZHluYW1pYy1hZ2VudC1sb2NrZG93bicpO1xuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbe1xuXHRcdFx0XHRwYXRoOiAnL2R5bmFtaWMtYWdlbnQtbG9ja2Rvd24vLmdpdGh1Yi9hZ2VudHMvcmV2aWV3ZXIuYWdlbnQubWQnLFxuXHRcdFx0XHRjb250ZW50czogWyctLS0nLCAnZGVzY3JpcHRpb246IFwiUmV2aWV3IGNvZGVcIicsICctLS0nXSxcblx0XHRcdH1dKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBzZXJ2aWNlLmdldEN1c3RvbUFnZW50cyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkubGVuZ3RoLCAxKTtcblxuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ09QSUxPVF9TVFJJQ1RfUExVR0lOX09OTFlfQ1VTVE9NSVpBVElPTl9DT05GSUcsIHRydWUpO1xuXHRcdFx0ZmlyZUNvbmZpZ0NoYW5nZSh0ZXN0Q29uZmlnU2VydmljZSwgQ09QSUxPVF9TVFJJQ1RfUExVR0lOX09OTFlfQ1VTVE9NSVpBVElPTl9DT05GSUcpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZ2V0Q3VzdG9tQWdlbnRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwbHVnaW4tb25seSBsb2NrZG93biBmaWx0ZXJzIHdvcmtzcGFjZSBhZ2VudHMgd2l0aG91dCBhZmZlY3RpbmcgcHJvbXB0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZSgnL2xvY2tkb3duLWFnZW50cycpO1xuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ09QSUxPVF9TVFJJQ1RfUExVR0lOX09OTFlfQ1VTVE9NSVpBVElPTl9DT05GSUcsIHRydWUpO1xuXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvbG9ja2Rvd24tYWdlbnRzLy5naXRodWIvYWdlbnRzL3Jldmlld2VyLmFnZW50Lm1kJyxcblx0XHRcdFx0XHRjb250ZW50czogWyctLS0nLCAnZGVzY3JpcHRpb246IFwiUmV2aWV3IGNvZGVcIicsICctLS0nXSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvbG9ja2Rvd24tYWdlbnRzLy5naXRodWIvcHJvbXB0cy9yZXZpZXcucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRjb250ZW50czogWyctLS0nLCAnZGVzY3JpcHRpb246IFwiUmV2aWV3IHByb21wdFwiJywgJy0tLSddLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5nZXRDdXN0b21BZ2VudHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksIFtdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkubGVuZ3RoLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraWxsIGxvY2tkb3duIGZpbHRlcnMgc3RhbmRhbG9uZSBza2lsbHMgYmVmb3JlIGRpc2NvdmVyeSBhbmQgcHJlc2VydmVzIHBsdWdpbiBza2lsbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ09QSUxPVF9TVFJJQ1RfUExVR0lOX09OTFlfQ1VTVE9NSVpBVElPTl9DT05GSUcsIHRydWUpO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKCcvbG9ja2Rvd24tc2tpbGxzJyk7XG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFt7XG5cdFx0XHRcdHBhdGg6ICcvbG9ja2Rvd24tc2tpbGxzLy5naXRodWIvc2tpbGxzL3dvcmtzcGFjZS1za2lsbC9TS0lMTC5tZCcsXG5cdFx0XHRcdGNvbnRlbnRzOiBbJy0tLScsICduYW1lOiBcIndvcmtzcGFjZS1za2lsbFwiJywgJ2Rlc2NyaXB0aW9uOiBcIldvcmtzcGFjZVwiJywgJy0tLSddLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvbWFuYWdlZC9za2lsbHMvcGx1Z2luLXNraWxsL1NLSUxMLm1kJyxcblx0XHRcdFx0Y29udGVudHM6IFsnLS0tJywgJ25hbWU6IFwicGx1Z2luLXNraWxsXCInLCAnZGVzY3JpcHRpb246IFwiUGx1Z2luXCInLCAnLS0tJ10sXG5cdFx0XHR9XSk7XG5cblx0XHRcdGNvbnN0IHBsdWdpbjogSUFnZW50UGx1Z2luID0ge1xuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvcGx1Z2lucy9tYW5hZ2VkJyksXG5cdFx0XHRcdGZvcm1hdDogUGx1Z2luRm9ybWF0LkNvcGlsb3QsXG5cdFx0XHRcdGxhYmVsOiAnbWFuYWdlZCcsXG5cdFx0XHRcdGVuYWJsZW1lbnQ6IG9ic2VydmFibGVWYWx1ZSgnbG9ja2Rvd25QbHVnaW5FbmFibGVtZW50JywgMiAvKiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFByb2ZpbGUgKi8pLFxuXHRcdFx0XHRob29rczogb2JzZXJ2YWJsZVZhbHVlKCdsb2NrZG93blBsdWdpbkhvb2tzJywgW10pLFxuXHRcdFx0XHRjb21tYW5kczogb2JzZXJ2YWJsZVZhbHVlKCdsb2NrZG93blBsdWdpbkNvbW1hbmRzJywgW10pLFxuXHRcdFx0XHRza2lsbHM6IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRQbHVnaW5Ta2lsbFtdPignbG9ja2Rvd25QbHVnaW5Ta2lsbHMnLCBbeyB1cmk6IFVSSS5maWxlKCcvcGx1Z2lucy9tYW5hZ2VkL3NraWxscy9wbHVnaW4tc2tpbGwvU0tJTEwubWQnKSwgbmFtZTogJ3BsdWdpbi1za2lsbCcgfV0pLFxuXHRcdFx0XHRhZ2VudHM6IG9ic2VydmFibGVWYWx1ZSgnbG9ja2Rvd25QbHVnaW5BZ2VudHMnLCBbXSksXG5cdFx0XHRcdGluc3RydWN0aW9uczogb2JzZXJ2YWJsZVZhbHVlKCdsb2NrZG93blBsdWdpbkluc3RydWN0aW9ucycsIFtdKSxcblx0XHRcdFx0bWNwU2VydmVyRGVmaW5pdGlvbnM6IG9ic2VydmFibGVWYWx1ZSgnbG9ja2Rvd25QbHVnaW5NY3BTZXJ2ZXJzJywgW10pLFxuXHRcdFx0fTtcblx0XHRcdHRlc3RQbHVnaW5zT2JzZXJ2YWJsZS5zZXQoW3BsdWdpbl0sIHVuZGVmaW5lZCk7XG5cblx0XHRcdGNvbnN0IHNraWxscyA9IGF3YWl0IHNlcnZpY2UuZmluZEFnZW50U2tpbGxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChza2lsbHM/Lm1hcChza2lsbCA9PiAoeyBuYW1lOiBza2lsbC5uYW1lLCBzdG9yYWdlOiBza2lsbC5zdG9yYWdlIH0pKSwgW1xuXHRcdFx0XHR7IG5hbWU6ICdwbHVnaW4tc2tpbGwnLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5wbHVnaW4gfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGx1Z2luLW9ubHkgbG9ja2Rvd24gZmlsdGVycyBzdGFuZGFsb25lIGluc3RydWN0aW9ucyBhbmQgcHJlc2VydmVzIHBsdWdpbiBpbnN0cnVjdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDT1BJTE9UX1NUUklDVF9QTFVHSU5fT05MWV9DVVNUT01JWkFUSU9OX0NPTkZJRywgdHJ1ZSk7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUoJy9sb2NrZG93bi1pbnN0cnVjdGlvbnMnKTtcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUluc3RydWN0aW9uVXJpID0gVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViJywgJ2luc3RydWN0aW9ucycsICd3b3Jrc3BhY2UuaW5zdHJ1Y3Rpb25zLm1kJyk7XG5cdFx0XHRjb25zdCBwbHVnaW5VcmkgPSBVUkkuZmlsZSgnL3BsdWdpbnMvbWFuYWdlZCcpO1xuXHRcdFx0Y29uc3QgcGx1Z2luSW5zdHJ1Y3Rpb25VcmkgPSBVUkkuam9pblBhdGgocGx1Z2luVXJpLCAncnVsZXMnLCAncGx1Z2luLmluc3RydWN0aW9ucy5tZCcpO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbe1xuXHRcdFx0XHRwYXRoOiB3b3Jrc3BhY2VJbnN0cnVjdGlvblVyaS5wYXRoLFxuXHRcdFx0XHRjb250ZW50czogWyctLS0nLCAnZGVzY3JpcHRpb246IFwiV29ya3NwYWNlXCInLCAnLS0tJ10sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHBhdGg6IHBsdWdpbkluc3RydWN0aW9uVXJpLnBhdGgsXG5cdFx0XHRcdGNvbnRlbnRzOiBbJy0tLScsICdkZXNjcmlwdGlvbjogXCJQbHVnaW5cIicsICctLS0nXSxcblx0XHRcdH1dKTtcblxuXHRcdFx0Y29uc3QgcGx1Z2luOiBJQWdlbnRQbHVnaW4gPSB7XG5cdFx0XHRcdHVyaTogcGx1Z2luVXJpLFxuXHRcdFx0XHRmb3JtYXQ6IFBsdWdpbkZvcm1hdC5Db3BpbG90LFxuXHRcdFx0XHRsYWJlbDogJ21hbmFnZWQnLFxuXHRcdFx0XHRlbmFibGVtZW50OiBvYnNlcnZhYmxlVmFsdWUoJ2xvY2tkb3duSW5zdHJ1Y3Rpb25QbHVnaW5FbmFibGVtZW50JywgMiAvKiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFByb2ZpbGUgKi8pLFxuXHRcdFx0XHRob29rczogb2JzZXJ2YWJsZVZhbHVlKCdsb2NrZG93bkluc3RydWN0aW9uUGx1Z2luSG9va3MnLCBbXSksXG5cdFx0XHRcdGNvbW1hbmRzOiBvYnNlcnZhYmxlVmFsdWUoJ2xvY2tkb3duSW5zdHJ1Y3Rpb25QbHVnaW5Db21tYW5kcycsIFtdKSxcblx0XHRcdFx0c2tpbGxzOiBvYnNlcnZhYmxlVmFsdWUoJ2xvY2tkb3duSW5zdHJ1Y3Rpb25QbHVnaW5Ta2lsbHMnLCBbXSksXG5cdFx0XHRcdGFnZW50czogb2JzZXJ2YWJsZVZhbHVlKCdsb2NrZG93bkluc3RydWN0aW9uUGx1Z2luQWdlbnRzJywgW10pLFxuXHRcdFx0XHRpbnN0cnVjdGlvbnM6IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRQbHVnaW5JbnN0cnVjdGlvbltdPignbG9ja2Rvd25QbHVnaW5JbnN0cnVjdGlvbnMnLCBbeyB1cmk6IHBsdWdpbkluc3RydWN0aW9uVXJpLCBuYW1lOiAncGx1Z2luJyB9XSksXG5cdFx0XHRcdG1jcFNlcnZlckRlZmluaXRpb25zOiBvYnNlcnZhYmxlVmFsdWUoJ2xvY2tkb3duSW5zdHJ1Y3Rpb25QbHVnaW5NY3BTZXJ2ZXJzJywgW10pLFxuXHRcdFx0fTtcblx0XHRcdHRlc3RQbHVnaW5zT2JzZXJ2YWJsZS5zZXQoW3BsdWdpbl0sIHVuZGVmaW5lZCk7XG5cblx0XHRcdGNvbnN0IGluc3RydWN0aW9ucyA9IGF3YWl0IHNlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGluc3RydWN0aW9ucy5tYXAoaW5zdHJ1Y3Rpb24gPT4gKHtcblx0XHRcdFx0dXJpOiBpbnN0cnVjdGlvbi51cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0c3RvcmFnZTogaW5zdHJ1Y3Rpb24uc3RvcmFnZSxcblx0XHRcdH0pKSwgW3tcblx0XHRcdFx0dXJpOiBwbHVnaW5JbnN0cnVjdGlvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5wbHVnaW4sXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwbHVnaW4tb25seSBsb2NrZG93biBmaWx0ZXJzIHdvcmtzcGFjZSBhZ2VudCBpbnN0cnVjdGlvbiBmaWxlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENPUElMT1RfU1RSSUNUX1BMVUdJTl9PTkxZX0NVU1RPTUlaQVRJT05fQ09ORklHLCB0cnVlKTtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZSgnL2xvY2tkb3duLWFnZW50LWluc3RydWN0aW9ucycpO1xuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbe1xuXHRcdFx0XHRwYXRoOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJ0FHRU5UUy5tZCcpLnBhdGgsXG5cdFx0XHRcdGNvbnRlbnRzOiBbJ1dvcmtzcGFjZSBhZ2VudCBpbnN0cnVjdGlvbnMnXSxcblx0XHRcdH0sIHtcblx0XHRcdFx0cGF0aDogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICdDTEFVREUubWQnKS5wYXRoLFxuXHRcdFx0XHRjb250ZW50czogWydXb3Jrc3BhY2UgQ2xhdWRlIGluc3RydWN0aW9ucyddLFxuXHRcdFx0fV0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UubGlzdEFnZW50SW5zdHJ1Y3Rpb25zKENhbmNlbGxhdGlvblRva2VuLk5vbmUsIHVuZGVmaW5lZCksIFtdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5saXN0TmVzdGVkQWdlbnRNRHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BsdWdpbi1vbmx5IGxvY2tkb3duIHJlbW92ZXMgc3RhbmRhbG9uZSBhZ2VudHMgd2l0aCBlbWJlZGRlZCBob29rcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0NIQVRfSE9PS1MsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ09QSUxPVF9TVFJJQ1RfUExVR0lOX09OTFlfQ1VTVE9NSVpBVElPTl9DT05GSUcsIHRydWUpO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKCcvbG9ja2Rvd24tYWdlbnQtaG9va3MnKTtcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW3tcblx0XHRcdFx0cGF0aDogJy9sb2NrZG93bi1hZ2VudC1ob29rcy8uZ2l0aHViL2FnZW50cy9yZXZpZXdlci5hZ2VudC5tZCcsXG5cdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlJldmlldyBjb2RlXCInLFxuXHRcdFx0XHRcdCdob29rczonLFxuXHRcdFx0XHRcdCcgIFByZVRvb2xVc2U6Jyxcblx0XHRcdFx0XHQnICAgIC0gdHlwZTogY29tbWFuZCcsXG5cdFx0XHRcdFx0JyAgICAgIGNvbW1hbmQ6IFwiZWNobyBibG9ja2VkXCInLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRdLFxuXHRcdFx0fV0pO1xuXG5cdFx0XHRjb25zdCBhZ2VudHMgPSBhd2FpdCBzZXJ2aWNlLmdldEN1c3RvbUFnZW50cyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYW5hZ2VkLW9ubHkgaG9va3MgcHJlc2VydmUgZnJvbnRtYXR0ZXIgaG9va3MgZnJvbSBmb3JjZS1lbmFibGVkIHBsdWdpbiBhZ2VudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9DSEFUX0hPT0tTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENPUElMT1RfQUxMT1dfTUFOQUdFRF9IT09LU19PTkxZX0NPTkZJRywgdHJ1ZSk7XG5cdFx0XHRjb25zdCBwbHVnaW5VcmkgPSBVUkkuZmlsZSgnL2hvbWUvdXNlci8uY29waWxvdC9pbnN0YWxsZWQtcGx1Z2lucy9tYW5hZ2VkLW1hcmtldHBsYWNlL21hbmFnZWQtcGx1Z2luJyk7XG5cdFx0XHRjb25zdCBhZ2VudFVyaSA9IFVSSS5qb2luUGF0aChwbHVnaW5VcmksICdhZ2VudHMnLCAncmV2aWV3ZXIuYWdlbnQubWQnKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW3tcblx0XHRcdFx0cGF0aDogYWdlbnRVcmkucGF0aCxcblx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiUmV2aWV3IGNvZGVcIicsXG5cdFx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdFx0JyAgUHJlVG9vbFVzZTonLFxuXHRcdFx0XHRcdCcgICAgLSB0eXBlOiBjb21tYW5kJyxcblx0XHRcdFx0XHQnICAgICAgY29tbWFuZDogXCJlY2hvIG1hbmFnZWRcIicsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdF0sXG5cdFx0XHR9XSk7XG5cblx0XHRcdGNvbnN0IG9yaWdpbmFsSW5zcGVjdCA9IHRlc3RDb25maWdTZXJ2aWNlLmluc3BlY3QuYmluZCh0ZXN0Q29uZmlnU2VydmljZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5pbnNwZWN0ID0gPFQ+KGtleTogc3RyaW5nLCBvdmVycmlkZXM/OiBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcyk6IElDb25maWd1cmF0aW9uVmFsdWU8VD4gPT4ge1xuXHRcdFx0XHRjb25zdCBpbnNwZWN0ZWQgPSBvcmlnaW5hbEluc3BlY3Q8VD4oa2V5LCBvdmVycmlkZXMpO1xuXHRcdFx0XHRyZXR1cm4ga2V5ID09PSBDaGF0Q29uZmlndXJhdGlvbi5FbmFibGVkUGx1Z2luc1xuXHRcdFx0XHRcdD8geyAuLi5pbnNwZWN0ZWQsIHBvbGljeVZhbHVlOiB7ICdtYW5hZ2VkLXBsdWdpbkBtYW5hZ2VkLW1hcmtldHBsYWNlJzogdHJ1ZSB9IGFzIFQgfVxuXHRcdFx0XHRcdDogaW5zcGVjdGVkO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcGx1Z2luOiBJQWdlbnRQbHVnaW4gPSB7XG5cdFx0XHRcdHVyaTogcGx1Z2luVXJpLFxuXHRcdFx0XHRmb3JtYXQ6IFBsdWdpbkZvcm1hdC5Db3BpbG90LFxuXHRcdFx0XHRsYWJlbDogJ21hbmFnZWQtcGx1Z2luJyxcblx0XHRcdFx0ZW5hYmxlbWVudDogb2JzZXJ2YWJsZVZhbHVlKCdtYW5hZ2VkUGx1Z2luRW5hYmxlbWVudCcsIDIgLyogQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlICovKSxcblx0XHRcdFx0aG9va3M6IG9ic2VydmFibGVWYWx1ZSgnbWFuYWdlZFBsdWdpbkhvb2tzJywgW10pLFxuXHRcdFx0XHRjb21tYW5kczogb2JzZXJ2YWJsZVZhbHVlKCdtYW5hZ2VkUGx1Z2luQ29tbWFuZHMnLCBbXSksXG5cdFx0XHRcdHNraWxsczogb2JzZXJ2YWJsZVZhbHVlKCdtYW5hZ2VkUGx1Z2luU2tpbGxzJywgW10pLFxuXHRcdFx0XHRhZ2VudHM6IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRQbHVnaW5BZ2VudFtdPignbWFuYWdlZFBsdWdpbkFnZW50cycsIFt7IHVyaTogYWdlbnRVcmksIG5hbWU6ICdyZXZpZXdlcicgfV0pLFxuXHRcdFx0XHRpbnN0cnVjdGlvbnM6IG9ic2VydmFibGVWYWx1ZSgnbWFuYWdlZFBsdWdpbkluc3RydWN0aW9ucycsIFtdKSxcblx0XHRcdFx0bWNwU2VydmVyRGVmaW5pdGlvbnM6IG9ic2VydmFibGVWYWx1ZSgnbWFuYWdlZFBsdWdpbk1jcFNlcnZlcnMnLCBbXSksXG5cdFx0XHR9O1xuXHRcdFx0dGVzdFBsdWdpbnNPYnNlcnZhYmxlLnNldChbcGx1Z2luXSwgdW5kZWZpbmVkKTtcblx0XHRcdGZpcmVDb25maWdDaGFuZ2UodGVzdENvbmZpZ1NlcnZpY2UsIENPUElMT1RfQUxMT1dfTUFOQUdFRF9IT09LU19PTkxZX0NPTkZJRywgQ2hhdENvbmZpZ3VyYXRpb24uRW5hYmxlZFBsdWdpbnMpO1xuXG5cdFx0XHRjb25zdCBhZ2VudHMgPSBhd2FpdCBzZXJ2aWNlLmdldEN1c3RvbUFnZW50cyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudHNbMF0uaG9va3M/LltIb29rVHlwZS5QcmVUb29sVXNlXT8uWzBdLmNvbW1hbmQsICdlY2hvIG1hbmFnZWQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2hvb2tzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNyZWF0ZVRlc3RQbHVnaW4gPSAocGF0aDogc3RyaW5nLCBpbml0aWFsSG9va3M6IHJlYWRvbmx5IElBZ2VudFBsdWdpbkhvb2tbXSk6IHsgcGx1Z2luOiBJQWdlbnRQbHVnaW47IGhvb2tzOiBJU2V0dGFibGVPYnNlcnZhYmxlPHJlYWRvbmx5IElBZ2VudFBsdWdpbkhvb2tbXT4gfSA9PiB7XG5cdFx0XHRjb25zdCBlbmFibGVtZW50ID0gb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0UGx1Z2luRW5hYmxlbWVudCcsIDIgLyogQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlICovKTtcblx0XHRcdGNvbnN0IGhvb2tzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBZ2VudFBsdWdpbkhvb2tbXT4oJ3Rlc3RQbHVnaW5Ib29rcycsIGluaXRpYWxIb29rcyk7XG5cdFx0XHRjb25zdCBjb21tYW5kcyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRQbHVnaW5Db21tYW5kW10+KCd0ZXN0UGx1Z2luQ29tbWFuZHMnLCBbXSk7XG5cdFx0XHRjb25zdCBza2lsbHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50UGx1Z2luU2tpbGxbXT4oJ3Rlc3RQbHVnaW5Ta2lsbHMnLCBbXSk7XG5cdFx0XHRjb25zdCBhZ2VudHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50UGx1Z2luQWdlbnRbXT4oJ3Rlc3RQbHVnaW5BZ2VudHMnLCBbXSk7XG5cdFx0XHRjb25zdCBpbnN0cnVjdGlvbnMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50UGx1Z2luSW5zdHJ1Y3Rpb25bXT4oJ3Rlc3RQbHVnaW5JbnN0cnVjdGlvbnMnLCBbXSk7XG5cdFx0XHRjb25zdCBtY3BTZXJ2ZXJEZWZpbml0aW9ucyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRQbHVnaW5NY3BTZXJ2ZXJEZWZpbml0aW9uW10+KCd0ZXN0UGx1Z2luTWNwU2VydmVyRGVmaW5pdGlvbnMnLCBbXSk7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHBsdWdpbjoge1xuXHRcdFx0XHRcdHVyaTogVVJJLmZpbGUocGF0aCksXG5cdFx0XHRcdFx0Zm9ybWF0OiBQbHVnaW5Gb3JtYXQuQ29waWxvdCxcblx0XHRcdFx0XHRsYWJlbDogYmFzZW5hbWUoVVJJLmZpbGUocGF0aCkpLFxuXHRcdFx0XHRcdGVuYWJsZW1lbnQsXG5cdFx0XHRcdFx0cmVtb3ZlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdFx0aG9va3MsXG5cdFx0XHRcdFx0Y29tbWFuZHMsXG5cdFx0XHRcdFx0c2tpbGxzLFxuXHRcdFx0XHRcdGFnZW50cyxcblx0XHRcdFx0XHRpbnN0cnVjdGlvbnMsXG5cdFx0XHRcdFx0bWNwU2VydmVyRGVmaW5pdGlvbnMsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGhvb2tzLFxuXHRcdFx0fTtcblx0XHR9O1xuXG5cdFx0dGVzdCgnbXVsdGktcm9vdCB3b3Jrc3BhY2UgcmVzb2x2ZXMgY3dkIHRvIHBlci1ob29rLWZpbGUgd29ya3NwYWNlIGZvbGRlcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGZvbGRlcjFVcmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS1hJyk7XG5cdFx0XHRjb25zdCBmb2xkZXIyVXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UtYicpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShmb2xkZXIxVXJpLCBmb2xkZXIyVXJpKSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9DSEFUX0hPT0tTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuSE9PS1NfTE9DQVRJT05fS0VZLCB7IFtIT09LU19TT1VSQ0VfRk9MREVSXTogdHJ1ZSB9KTtcblxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3dvcmtzcGFjZS1hLy5naXRodWIvaG9va3MvbXktaG9vay5qc29uJyxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0SlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFx0XHRcdFtIb29rVHlwZS5QcmVUb29sVXNlXTogW1xuXHRcdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIGZvbGRlci1hJyB9LFxuXHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy93b3Jrc3BhY2UtYi8uZ2l0aHViL2hvb2tzL215LWhvb2suanNvbicsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRcdFx0XHRbSG9va1R5cGUuUHJlVG9vbFVzZV06IFtcblx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBmb2xkZXItYicgfSxcblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmdldEhvb2tzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCwgJ0V4cGVjdGVkIGhvb2tzIHJlc3VsdCcpO1xuXG5cdFx0XHRjb25zdCBwcmVUb29sVXNlSG9va3MgPSByZXN1bHQuaG9va3NbSG9va1R5cGUuUHJlVG9vbFVzZV07XG5cdFx0XHRhc3NlcnQub2socHJlVG9vbFVzZUhvb2tzLCAnRXhwZWN0ZWQgUHJlVG9vbFVzZSBob29rcycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZVRvb2xVc2VIb29rcy5sZW5ndGgsIDIsICdFeHBlY3RlZCB0d28gUHJlVG9vbFVzZSBob29rcycpO1xuXG5cdFx0XHRjb25zdCBob29rQSA9IHByZVRvb2xVc2VIb29rcy5maW5kKGggPT4gaC5jb21tYW5kID09PSAnZWNobyBmb2xkZXItYScpO1xuXHRcdFx0Y29uc3QgaG9va0IgPSBwcmVUb29sVXNlSG9va3MuZmluZChoID0+IGguY29tbWFuZCA9PT0gJ2VjaG8gZm9sZGVyLWInKTtcblx0XHRcdGFzc2VydC5vayhob29rQSwgJ0V4cGVjdGVkIGhvb2sgZnJvbSBmb2xkZXItYScpO1xuXHRcdFx0YXNzZXJ0Lm9rKGhvb2tCLCAnRXhwZWN0ZWQgaG9vayBmcm9tIGZvbGRlci1iJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob29rQS5jd2Q/LnBhdGgsIGZvbGRlcjFVcmkucGF0aCwgJ0hvb2sgZnJvbSBmb2xkZXItYSBzaG91bGQgaGF2ZSBjd2QgcG9pbnRpbmcgdG8gd29ya3NwYWNlLWEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob29rQi5jd2Q/LnBhdGgsIGZvbGRlcjJVcmkucGF0aCwgJ0hvb2sgZnJvbSBmb2xkZXItYiBzaG91bGQgaGF2ZSBjd2QgcG9pbnRpbmcgdG8gd29ya3NwYWNlLWInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luY2x1ZGVzIGhvb2tzIGZyb20gYWdlbnQgcGx1Z2lucycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0NIQVRfSE9PS1MsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5IT09LU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3QgeyBwbHVnaW4gfSA9IGNyZWF0ZVRlc3RQbHVnaW4oJy9wbHVnaW5zL3Rlc3QtcGx1Z2luJywgW3tcblx0XHRcdFx0dHlwZTogSG9va1R5cGUuUHJlVG9vbFVzZSxcblx0XHRcdFx0b3JpZ2luYWxJZDogJ3BsdWdpbi1wcmUtdG9vbC11c2UnLFxuXHRcdFx0XHRob29rczogW3sgY29tbWFuZDogJ2VjaG8gZnJvbS1wbHVnaW4nIH1dLFxuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvcGx1Z2lucy90ZXN0LXBsdWdpbi9ob29rcy5qc29uJyksXG5cdFx0XHR9XSk7XG5cblx0XHRcdHRlc3RQbHVnaW5zT2JzZXJ2YWJsZS5zZXQoW3BsdWdpbl0sIHVuZGVmaW5lZCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZ2V0SG9va3MoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LCAnRXhwZWN0ZWQgaG9va3MgcmVzdWx0Jyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lmhvb2tzW0hvb2tUeXBlLlByZVRvb2xVc2VdLCBbe1xuXHRcdFx0XHRjb21tYW5kOiAnZWNobyBmcm9tLXBsdWdpbicsXG5cdFx0XHRcdHNvdXJjZVVyaTogVVJJLmZpbGUoJy9wbHVnaW5zL3Rlc3QtcGx1Z2luL2hvb2tzLmpzb24nKSxcblx0XHRcdH1dLCAnRXhwZWN0ZWQgcGx1Z2luIGhvb2tzIHRvIGJlIGluY2x1ZGVkIGluIGNvbXB1dGVkIGhvb2tzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYW5hZ2VkLW9ubHkgaG9va3MgYmxvY2sgc3RhbmRhbG9uZSBhbmQgdW5tYW5hZ2VkIHBsdWdpbiBob29rcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZSgnL21hbmFnZWQtaG9va3Mtb25seScpO1xuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQ0hBVF9IT09LUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLkhPT0tTX0xPQ0FUSU9OX0tFWSwgeyBbSE9PS1NfU09VUkNFX0ZPTERFUl06IHRydWUgfSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDT1BJTE9UX0FMTE9XX01BTkFHRURfSE9PS1NfT05MWV9DT05GSUcsIHRydWUpO1xuXHRcdFx0ZmlyZUNvbmZpZ0NoYW5nZSh0ZXN0Q29uZmlnU2VydmljZSwgQ09QSUxPVF9BTExPV19NQU5BR0VEX0hPT0tTX09OTFlfQ09ORklHKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW3tcblx0XHRcdFx0cGF0aDogJy9tYW5hZ2VkLWhvb2tzLW9ubHkvLmdpdGh1Yi9ob29rcy9ob29rcy5qc29uJyxcblx0XHRcdFx0Y29udGVudHM6IFtKU09OLnN0cmluZ2lmeSh7IGhvb2tzOiB7IFtIb29rVHlwZS5QcmVUb29sVXNlXTogW3sgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyB3b3Jrc3BhY2UnIH1dIH0gfSldLFxuXHRcdFx0fV0pO1xuXG5cdFx0XHRjb25zdCB7IHBsdWdpbiB9ID0gY3JlYXRlVGVzdFBsdWdpbignL3BsdWdpbnMvdW5tYW5hZ2VkJywgW3tcblx0XHRcdFx0dHlwZTogSG9va1R5cGUuUHJlVG9vbFVzZSxcblx0XHRcdFx0b3JpZ2luYWxJZDogJ3BsdWdpbi1ob29rJyxcblx0XHRcdFx0aG9va3M6IFt7IGNvbW1hbmQ6ICdlY2hvIHBsdWdpbicgfV0sXG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9wbHVnaW5zL3VubWFuYWdlZC9ob29rcy5qc29uJyksXG5cdFx0XHR9XSk7XG5cdFx0XHR0ZXN0UGx1Z2luc09ic2VydmFibGUuc2V0KFtwbHVnaW5dLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5nZXRIb29rcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuaG9vaywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlY29tcHV0ZXMgaG9va3Mgd2hlbiBhZ2VudCBwbHVnaW4gaG9va3MgY2hhbmdlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQ0hBVF9IT09LUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLkhPT0tTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCB7IHBsdWdpbiwgaG9va3MgfSA9IGNyZWF0ZVRlc3RQbHVnaW4oJy9wbHVnaW5zL3Rlc3QtcGx1Z2luJywgW3tcblx0XHRcdFx0dHlwZTogSG9va1R5cGUuUHJlVG9vbFVzZSxcblx0XHRcdFx0b3JpZ2luYWxJZDogJ3BsdWdpbi1wcmUtdG9vbC11c2UnLFxuXHRcdFx0XHRob29rczogW3sgY29tbWFuZDogJ2VjaG8gYmVmb3JlJyB9XSxcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL3BsdWdpbnMvdGVzdC1wbHVnaW4vaG9va3MuanNvbicpLFxuXHRcdFx0fV0pO1xuXG5cdFx0XHR0ZXN0UGx1Z2luc09ic2VydmFibGUuc2V0KFtwbHVnaW5dLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBiZWZvcmUgPSBhd2FpdCBzZXJ2aWNlLmdldEhvb2tzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJlZm9yZSwgJ0V4cGVjdGVkIGhvb2tzIHJlc3VsdCBiZWZvcmUgcGx1Z2luIHVwZGF0ZScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChiZWZvcmUuaG9va3NbSG9va1R5cGUuUHJlVG9vbFVzZV0sIFt7IGNvbW1hbmQ6ICdlY2hvIGJlZm9yZScsIHNvdXJjZVVyaTogVVJJLmZpbGUoJy9wbHVnaW5zL3Rlc3QtcGx1Z2luL2hvb2tzLmpzb24nKSB9XSk7XG5cblx0XHRcdGhvb2tzLnNldChbe1xuXHRcdFx0XHR0eXBlOiBIb29rVHlwZS5QcmVUb29sVXNlLFxuXHRcdFx0XHRvcmlnaW5hbElkOiAncGx1Z2luLXByZS10b29sLXVzZScsXG5cdFx0XHRcdGhvb2tzOiBbeyBjb21tYW5kOiAnZWNobyBhZnRlcicgfV0sXG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9wbHVnaW5zL3Rlc3QtcGx1Z2luL2hvb2tzLmpzb24nKSxcblx0XHRcdH1dLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBhZnRlciA9IGF3YWl0IHNlcnZpY2UuZ2V0SG9va3MoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQub2soYWZ0ZXIsICdFeHBlY3RlZCBob29rcyByZXN1bHQgYWZ0ZXIgcGx1Z2luIHVwZGF0ZScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZnRlci5ob29rc1tIb29rVHlwZS5QcmVUb29sVXNlXSwgW3sgY29tbWFuZDogJ2VjaG8gYWZ0ZXInLCBzb3VyY2VVcmk6IFVSSS5maWxlKCcvcGx1Z2lucy90ZXN0LXBsdWdpbi9ob29rcy5qc29uJykgfV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiB3b3Jrc3BhY2UgaXMgdW50cnVzdGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2UoVVJJLmZpbGUoJy90ZXN0LXdvcmtzcGFjZScpKSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9DSEFUX0hPT0tTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuSE9PS1NfTE9DQVRJT05fS0VZLCB7IFtIT09LU19TT1VSQ0VfRk9MREVSXTogdHJ1ZSB9KTtcblxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3Rlc3Qtd29ya3NwYWNlLy5naXRodWIvaG9va3MvbXktaG9vay5qc29uJyxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0SlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFx0XHRcdFtIb29rVHlwZS5QcmVUb29sVXNlXTogW1xuXHRcdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIHRlc3QnIH0sXG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gVHJ1c3RlZCB3b3Jrc3BhY2Ugc2hvdWxkIHJldHVybiBob29rc1xuXHRcdFx0Y29uc3QgdHJ1c3RlZFJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZ2V0SG9va3MoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQub2sodHJ1c3RlZFJlc3VsdCwgJ0V4cGVjdGVkIGhvb2tzIHdoZW4gd29ya3NwYWNlIGlzIHRydXN0ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVzdGVkUmVzdWx0Lmhvb2tzW0hvb2tUeXBlLlByZVRvb2xVc2VdPy5sZW5ndGgsIDEpO1xuXG5cdFx0XHQvLyBVbnRydXN0ZWQgd29ya3NwYWNlIHNob3VsZCByZXR1cm4gdW5kZWZpbmVkXG5cdFx0XHRhd2FpdCB3b3Jrc3BhY2VUcnVzdFNlcnZpY2Uuc2V0V29ya3NwYWNlVHJ1c3QoZmFsc2UpO1xuXHRcdFx0Y29uc3QgdW50cnVzdGVkUmVzdWx0ID0gYXdhaXQgc2VydmljZS5nZXRIb29rcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnRydXN0ZWRSZXN1bHQsIHVuZGVmaW5lZCwgJ0V4cGVjdGVkIHVuZGVmaW5lZCBob29rcyB3aGVuIHdvcmtzcGFjZSBpcyB1bnRydXN0ZWQnKTtcblxuXHRcdFx0Ly8gUmUtdHJ1c3Rpbmcgc2hvdWxkIHJldHVybiBob29rcyBhZ2FpblxuXHRcdFx0YXdhaXQgd29ya3NwYWNlVHJ1c3RTZXJ2aWNlLnNldFdvcmtzcGFjZVRydXN0KHRydWUpO1xuXHRcdFx0Y29uc3QgcmVUcnVzdGVkUmVzdWx0ID0gYXdhaXQgc2VydmljZS5nZXRIb29rcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5vayhyZVRydXN0ZWRSZXN1bHQsICdFeHBlY3RlZCBob29rcyBhZnRlciB3b3Jrc3BhY2UgYmVjb21lcyB0cnVzdGVkIGFnYWluJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVUcnVzdGVkUmVzdWx0Lmhvb2tzW0hvb2tUeXBlLlByZVRvb2xVc2VdPy5sZW5ndGgsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3VwcHJlc3NlcyBwbHVnaW4gaG9va3Mgd2hlbiB3b3Jrc3BhY2UgaXMgdW50cnVzdGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQ0hBVF9IT09LUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLkhPT0tTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCB7IHBsdWdpbiB9ID0gY3JlYXRlVGVzdFBsdWdpbignL3BsdWdpbnMvdGVzdC1wbHVnaW4nLCBbe1xuXHRcdFx0XHR0eXBlOiBIb29rVHlwZS5QcmVUb29sVXNlLFxuXHRcdFx0XHRvcmlnaW5hbElkOiAncGx1Z2luLXByZS10b29sLXVzZScsXG5cdFx0XHRcdGhvb2tzOiBbeyBjb21tYW5kOiAnZWNobyBmcm9tLXBsdWdpbicgfV0sXG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9wbHVnaW5zL3Rlc3QtcGx1Z2luL2hvb2tzLmpzb24nKSxcblx0XHRcdH1dKTtcblxuXHRcdFx0dGVzdFBsdWdpbnNPYnNlcnZhYmxlLnNldChbcGx1Z2luXSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXdhaXQgd29ya3NwYWNlVHJ1c3RTZXJ2aWNlLnNldFdvcmtzcGFjZVRydXN0KGZhbHNlKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZ2V0SG9va3MoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQsICdFeHBlY3RlZCB1bmRlZmluZWQgaG9va3Mgd2hlbiB3b3Jrc3BhY2UgaXMgdW50cnVzdGVkLCBldmVuIHdpdGggcGx1Z2luIGhvb2tzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDbGF1ZGUgaG9va3Mgd2l0aCBkaXNhYmxlQWxsSG9va3Mgc2hvdWxkIG5vdCByZXBvcnQgaGFzRGlzYWJsZWRDbGF1ZGVIb29rcyB3aGVuIENsYXVkZSBob29rcyBzZXR0aW5nIGlzIG9mZicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdC8vIEEgQ2xhdWRlIHNldHRpbmdzIGZpbGUgdGhhdCBoYXMgZGlzYWJsZUFsbEhvb2tzOiB0cnVlIGJ1dCBkZWZpbmVzIGhvb2tzLlxuXHRcdFx0Ly8gV2hlbiBVU0VfQ0xBVURFX0hPT0tTIGlzIGZhbHNlLCB0aGUgb2xkIGNvZGUgc2tpcHBlZCB0aGlzIGZpbGUgZHVlIHRvXG5cdFx0XHQvLyBkaXNhYmxlZEFsbEhvb2tzIGJlZm9yZSByZWFjaGluZyB0aGUgQ2xhdWRlIGNoZWNrLCBzbyBoYXNEaXNhYmxlZENsYXVkZUhvb2tzIHdhcyBmYWxzZS5cblx0XHRcdGNvbnN0IHdvcmtzcGFjZVVyaSA9IFVSSS5maWxlKCcvdGVzdC13b3Jrc3BhY2UnKTtcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHdvcmtzcGFjZVVyaSkpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQ0hBVF9IT09LUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9DTEFVREVfSE9PS1MsIGZhbHNlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuSE9PS1NfTE9DQVRJT05fS0VZLCB7IFtIT09LU19TT1VSQ0VfRk9MREVSXTogdHJ1ZSB9KTtcblxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3Rlc3Qtd29ya3NwYWNlLy5jbGF1ZGUvc2V0dGluZ3MuanNvbicsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRcdFx0ZGlzYWJsZUFsbEhvb2tzOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFx0XHRcdFByZVRvb2xVc2U6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gZGlzYWJsZWQtY2xhdWRlLWhvb2snIH1dLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmdldEhvb2tzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Ly8gTm8gaG9va3Mgc2hvdWxkIGJlIGNvbGxlY3RlZCAodGhlIG9ubHkgZmlsZSBoYXMgZGlzYWJsZUFsbEhvb2tzKVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkLCAnRXhwZWN0ZWQgbm8gaG9va3MgcmVzdWx0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwbHVnaW4gaG9va3MgYXBwZWFyIGluIGhvb2sgZGlzY292ZXJ5IGluZm8gZmlsZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHQvLyBQbHVnaW4gaG9va3Mgc2hvdWxkIGJlIHJlcG9ydGVkIGluIHRoZSBkaXNjb3ZlcnkgaW5mbyBmaWxlcyBhcnJheVxuXHRcdFx0Ly8gc28gdGhhdCBkaWFnbm9zdGljIHZpZXdzIGNhbiBkaXNwbGF5IHRoZW0uXG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VVcmkgPSBVUkkuZmlsZSgnL3Rlc3Qtd29ya3NwYWNlJyk7XG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZSh3b3Jrc3BhY2VVcmkpKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0NIQVRfSE9PS1MsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5IT09LU19MT0NBVElPTl9LRVksIHsgW0hPT0tTX1NPVVJDRV9GT0xERVJdOiB0cnVlIH0pO1xuXG5cdFx0XHRjb25zdCBwbHVnaW5Ib29rVXJpID0gVVJJLmZpbGUoJy9wbHVnaW5zL3Rlc3QtcGx1Z2luL2hvb2tzLmpzb24nKTtcblx0XHRcdGNvbnN0IHsgcGx1Z2luIH0gPSBjcmVhdGVUZXN0UGx1Z2luKCcvcGx1Z2lucy90ZXN0LXBsdWdpbicsIFt7XG5cdFx0XHRcdHR5cGU6IEhvb2tUeXBlLlByZVRvb2xVc2UsXG5cdFx0XHRcdG9yaWdpbmFsSWQ6ICdwbHVnaW4tcHJlLXRvb2wtdXNlJyxcblx0XHRcdFx0aG9va3M6IFt7IGNvbW1hbmQ6ICdlY2hvIGZyb20tcGx1Z2luJyB9XSxcblx0XHRcdFx0dXJpOiBwbHVnaW5Ib29rVXJpLFxuXHRcdFx0fV0pO1xuXG5cdFx0XHR0ZXN0UGx1Z2luc09ic2VydmFibGUuc2V0KFtwbHVnaW5dLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmdldEhvb2tzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3QgY2FwdHVyZWREaXNjb3ZlcnlJbmZvID0gYXdhaXQgc2VydmljZS5nZXREaXNjb3ZlcnlJbmZvKFByb21wdHNUeXBlLmhvb2ssIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0LCAnRXhwZWN0ZWQgaG9va3MgcmVzdWx0IHdpdGggcGx1Z2luIGhvb2tzJyk7XG5cdFx0XHRhc3NlcnQub2soY2FwdHVyZWREaXNjb3ZlcnlJbmZvLCAnRXhwZWN0ZWQgZGlzY292ZXJ5IGluZm8gdG8gYmUgbG9nZ2VkJyk7XG5cblx0XHRcdC8vIFBsdWdpbiBob29rIGZpbGUgc2hvdWxkIGFwcGVhciBpbiBkaXNjb3ZlcnkgZmlsZXNcblx0XHRcdGNvbnN0IHBsdWdpbkZpbGUgPSBjYXB0dXJlZERpc2NvdmVyeUluZm8hLmZpbGVzLmZpbmQoXG5cdFx0XHRcdGYgPT4gZi5wcm9tcHRQYXRoLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnBsdWdpblxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5vayhwbHVnaW5GaWxlLCAnUGx1Z2luIGhvb2sgZmlsZSBzaG91bGQgYmUgcHJlc2VudCBpbiBkaXNjb3ZlcnkgaW5mbyBmaWxlcycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncGx1Z2luIGluc3RydWN0aW9ucycsICgpID0+IHtcblx0XHRmdW5jdGlvbiBjcmVhdGVQbHVnaW5XaXRoSW5zdHJ1Y3Rpb25zKFxuXHRcdFx0cGF0aDogc3RyaW5nLFxuXHRcdFx0aW5pdGlhbEluc3RydWN0aW9uczogcmVhZG9ubHkgSUFnZW50UGx1Z2luSW5zdHJ1Y3Rpb25bXSxcblx0XHQpOiB7IHBsdWdpbjogSUFnZW50UGx1Z2luOyBpbnN0cnVjdGlvbnM6IElTZXR0YWJsZU9ic2VydmFibGU8cmVhZG9ubHkgSUFnZW50UGx1Z2luSW5zdHJ1Y3Rpb25bXT4gfSB7XG5cdFx0XHRjb25zdCBlbmFibGVtZW50ID0gb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0UGx1Z2luRW5hYmxlbWVudCcsIDIgLyogQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlICovKTtcblx0XHRcdGNvbnN0IGhvb2tzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBZ2VudFBsdWdpbkhvb2tbXT4oJ3Rlc3RQbHVnaW5Ib29rcycsIFtdKTtcblx0XHRcdGNvbnN0IGNvbW1hbmRzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBZ2VudFBsdWdpbkNvbW1hbmRbXT4oJ3Rlc3RQbHVnaW5Db21tYW5kcycsIFtdKTtcblx0XHRcdGNvbnN0IHNraWxscyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRQbHVnaW5Ta2lsbFtdPigndGVzdFBsdWdpblNraWxscycsIFtdKTtcblx0XHRcdGNvbnN0IGFnZW50cyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRQbHVnaW5BZ2VudFtdPigndGVzdFBsdWdpbkFnZW50cycsIFtdKTtcblx0XHRcdGNvbnN0IGluc3RydWN0aW9ucyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRQbHVnaW5JbnN0cnVjdGlvbltdPigndGVzdFBsdWdpbkluc3RydWN0aW9ucycsIGluaXRpYWxJbnN0cnVjdGlvbnMpO1xuXHRcdFx0Y29uc3QgbWNwU2VydmVyRGVmaW5pdGlvbnMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50UGx1Z2luTWNwU2VydmVyRGVmaW5pdGlvbltdPigndGVzdFBsdWdpbk1jcFNlcnZlckRlZmluaXRpb25zJywgW10pO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRwbHVnaW46IHtcblx0XHRcdFx0XHR1cmk6IFVSSS5maWxlKHBhdGgpLFxuXHRcdFx0XHRcdGZvcm1hdDogUGx1Z2luRm9ybWF0LkNvcGlsb3QsXG5cdFx0XHRcdFx0bGFiZWw6IGJhc2VuYW1lKFVSSS5maWxlKHBhdGgpKSxcblx0XHRcdFx0XHRlbmFibGVtZW50LFxuXHRcdFx0XHRcdHJlbW92ZTogKCkgPT4geyB9LFxuXHRcdFx0XHRcdGhvb2tzLFxuXHRcdFx0XHRcdGNvbW1hbmRzLFxuXHRcdFx0XHRcdHNraWxscyxcblx0XHRcdFx0XHRhZ2VudHMsXG5cdFx0XHRcdFx0aW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRcdG1jcFNlcnZlckRlZmluaXRpb25zLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpbnN0cnVjdGlvbnMsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ2xpc3RzIHBsdWdpbiBpbnN0cnVjdGlvbnMgdmlhIGxpc3RQcm9tcHRGaWxlcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHJ1bGVVcmkgPSBVUkkuZmlsZSgnL3BsdWdpbnMvdGVzdC1wbHVnaW4vcnVsZXMvcHJlZmVyLWNvbnN0Lm1kYycpO1xuXHRcdFx0Y29uc3QgeyBwbHVnaW4gfSA9IGNyZWF0ZVBsdWdpbldpdGhJbnN0cnVjdGlvbnMoJy9wbHVnaW5zL3Rlc3QtcGx1Z2luJywgW1xuXHRcdFx0XHR7IHVyaTogcnVsZVVyaSwgbmFtZTogJ3ByZWZlci1jb25zdCcgfSxcblx0XHRcdF0pO1xuXG5cdFx0XHR0ZXN0UGx1Z2luc09ic2VydmFibGUuc2V0KFtwbHVnaW5dLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3QgcGx1Z2luSW5zdHJ1Y3Rpb24gPSByZXN1bHQuZmluZChwID0+IHAudXJpLnRvU3RyaW5nKCkgPT09IHJ1bGVVcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQub2socGx1Z2luSW5zdHJ1Y3Rpb24sICdQbHVnaW4gaW5zdHJ1Y3Rpb24gc2hvdWxkIGFwcGVhciBpbiBsaXN0UHJvbXB0RmlsZXMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5JbnN0cnVjdGlvbiEuc3RvcmFnZSwgUHJvbXB0c1N0b3JhZ2UucGx1Z2luKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VwZGF0ZXMgbGlzdGVkIGluc3RydWN0aW9ucyB3aGVuIHBsdWdpbiBpbnN0cnVjdGlvbnMgY2hhbmdlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgcnVsZVVyaTEgPSBVUkkuZmlsZSgnL3BsdWdpbnMvdGVzdC1wbHVnaW4vcnVsZXMvcnVsZS1hLm1kYycpO1xuXHRcdFx0Y29uc3QgcnVsZVVyaTIgPSBVUkkuZmlsZSgnL3BsdWdpbnMvdGVzdC1wbHVnaW4vcnVsZXMvcnVsZS1iLm1kYycpO1xuXHRcdFx0Y29uc3QgeyBwbHVnaW4sIGluc3RydWN0aW9ucyB9ID0gY3JlYXRlUGx1Z2luV2l0aEluc3RydWN0aW9ucygnL3BsdWdpbnMvdGVzdC1wbHVnaW4nLCBbXG5cdFx0XHRcdHsgdXJpOiBydWxlVXJpMSwgbmFtZTogJ3J1bGUtYScgfSxcblx0XHRcdF0pO1xuXG5cdFx0XHR0ZXN0UGx1Z2luc09ic2VydmFibGUuc2V0KFtwbHVnaW5dLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBiZWZvcmUgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3QgYmVmb3JlUGx1Z2luID0gYmVmb3JlLmZpbHRlcihwID0+IHAuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UucGx1Z2luKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiZWZvcmVQbHVnaW4ubGVuZ3RoLCAxKTtcblxuXHRcdFx0Y29uc3QgZXZlbnRGaXJlZCA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gc2VydmljZS5vbkRpZENoYW5nZUluc3RydWN0aW9ucygoKSA9PiB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRpbnN0cnVjdGlvbnMuc2V0KFtcblx0XHRcdFx0eyB1cmk6IHJ1bGVVcmkxLCBuYW1lOiAncnVsZS1hJyB9LFxuXHRcdFx0XHR7IHVyaTogcnVsZVVyaTIsIG5hbWU6ICdydWxlLWInIH0sXG5cdFx0XHRdLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhd2FpdCBldmVudEZpcmVkO1xuXG5cdFx0XHRjb25zdCBhZnRlciA9IGF3YWl0IHNlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCBhZnRlclBsdWdpbiA9IGFmdGVyLmZpbHRlcihwID0+IHAuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UucGx1Z2luKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZnRlclBsdWdpbi5sZW5ndGgsIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlcyBpbnN0cnVjdGlvbnMgd2hlbiBwbHVnaW4gaXMgcmVtb3ZlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHJ1bGVVcmkgPSBVUkkuZmlsZSgnL3BsdWdpbnMvdGVzdC1wbHVnaW4vcnVsZXMvcnVsZS1hLm1kYycpO1xuXHRcdFx0Y29uc3QgeyBwbHVnaW4gfSA9IGNyZWF0ZVBsdWdpbldpdGhJbnN0cnVjdGlvbnMoJy9wbHVnaW5zL3Rlc3QtcGx1Z2luJywgW1xuXHRcdFx0XHR7IHVyaTogcnVsZVVyaSwgbmFtZTogJ3J1bGUtYScgfSxcblx0XHRcdF0pO1xuXG5cdFx0XHR0ZXN0UGx1Z2luc09ic2VydmFibGUuc2V0KFtwbHVnaW5dLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3Qgd2l0aFBsdWdpbiA9IGF3YWl0IHNlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQub2sod2l0aFBsdWdpbi5zb21lKHAgPT4gcC5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5wbHVnaW4pKTtcblxuXHRcdFx0dGVzdFBsdWdpbnNPYnNlcnZhYmxlLnNldChbXSwgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHdpdGhvdXRQbHVnaW4gPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKCF3aXRob3V0UGx1Z2luLnNvbWUocCA9PiBwLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnBsdWdpbikpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbmFtZXNwYWNlcyBwbHVnaW4gaW5zdHJ1Y3Rpb24gbmFtZXMgd2l0aCBwbHVnaW4gZm9sZGVyJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgcnVsZVVyaSA9IFVSSS5maWxlKCcvcGx1Z2lucy9kZXBsb3ktdG9vbHMvcnVsZXMvbGludC1jaGVjay5tZGMnKTtcblx0XHRcdGNvbnN0IHsgcGx1Z2luIH0gPSBjcmVhdGVQbHVnaW5XaXRoSW5zdHJ1Y3Rpb25zKCcvcGx1Z2lucy9kZXBsb3ktdG9vbHMnLCBbXG5cdFx0XHRcdHsgdXJpOiBydWxlVXJpLCBuYW1lOiAnbGludC1jaGVjaycgfSxcblx0XHRcdF0pO1xuXG5cdFx0XHR0ZXN0UGx1Z2luc09ic2VydmFibGUuc2V0KFtwbHVnaW5dLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3QgcGx1Z2luSW5zdHJ1Y3Rpb24gPSByZXN1bHQuZmluZChwID0+IHAudXJpLnRvU3RyaW5nKCkgPT09IHJ1bGVVcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQub2socGx1Z2luSW5zdHJ1Y3Rpb24sICdQbHVnaW4gaW5zdHJ1Y3Rpb24gc2hvdWxkIGJlIGxpc3RlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbkluc3RydWN0aW9uIS5uYW1lLCAnZGVwbG95LXRvb2xzOmxpbnQtY2hlY2snKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuZnVuY3Rpb24gZmlyZUNvbmZpZ0NoYW5nZShjb25maWdTZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UsIC4uLmtleTogc3RyaW5nW10pOiB2b2lkIHtcblx0Y29uZmlnU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoe1xuXHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiAoazogc3RyaW5nKSA9PiBrZXkuaW5jbHVkZXMoayksXG5cdH0gc2F0aXNmaWVzIFBhcnRpYWw8SUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudD4gYXMgdW5rbm93biBhcyBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFdBQVc7QUFDdkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsYUFBYTtBQUN0QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGVBQWU7QUFDeEIsU0FBOEIsdUJBQXVCO0FBQ3JELFNBQVMsVUFBVSxvQkFBb0I7QUFDdkMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsYUFBYTtBQUN0QixTQUFTLHdC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WUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBR0QsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTSxHQUFHLHFCQUFxQjtBQUFBLFVBQzlCLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0Ms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QUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBR0QsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTSxHQUFHLHFCQUFxQjtBQUFBLFVBQzlCLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLHFCQUFxQjtBQUFB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
