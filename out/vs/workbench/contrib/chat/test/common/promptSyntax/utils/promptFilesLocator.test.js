import assert from "assert";
import { CancellationToken, CancellationTokenSource } from "../../../../../../../base/common/cancellation.js";
import { match } from "../../../../../../../base/common/glob.js";
import { Schemas } from "../../../../../../../base/common/network.js";
import { basename, relativePath } from "../../../../../../../base/common/resources.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { mock } from "../../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../../../../platform/files/common/files.js";
import { FileService } from "../../../../../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { TestInstantiationService } from "../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../../platform/log/common/log.js";
import { IWorkspaceContextService } from "../../../../../../../platform/workspace/common/workspace.js";
import { IWorkbenchEnvironmentService } from "../../../../../../services/environment/common/environmentService.js";
import { ISearchService } from "../../../../../../services/search/common/search.js";
import { IUserDataProfileService } from "../../../../../../services/userDataProfile/common/userDataProfile.js";
import { IPathService } from "../../../../../../services/path/common/pathService.js";
import { PromptsConfig } from "../../../../common/promptSyntax/config/config.js";
import { getSourceDescription, PromptFileSource, PromptsType } from "../../../../common/promptSyntax/promptTypes.js";
import { hasGlobPattern, isValidGlob, isValidPromptFolderPath, PromptFilesLocator } from "../../../../common/promptSyntax/utils/promptFilesLocator.js";
import { mockFiles } from "../testUtils/mockFilesystem.js";
import { mockService } from "./mock.js";
import { TestUserDataProfileService, TestWorkspaceTrustManagementService } from "../../../../../../test/common/workbenchTestServices.js";
import { PromptsStorage } from "../../../../common/promptSyntax/service/promptsService.js";
import { runWithFakedTimers } from "../../../../../../../base/test/common/timeTravelScheduler.js";
import { IWorkspaceTrustManagementService } from "../../../../../../../platform/workspace/common/workspaceTrust.js";
function mockConfigService(configValues) {
  return mockService({
    getValue(key) {
      if (typeof key === "object") {
        return {};
      }
      if (typeof key !== "string") {
        assert.fail(`Unsupported configuration key '${key}'.`);
      }
      if (configValues.hasOwnProperty(key)) {
        return configValues[key];
      }
      assert.fail(`Unsupported configuration key '${key}'.`);
    }
  });
}
function mockWorkspaceService(folders) {
  return mockService({
    getWorkspace() {
      return new class extends mock() {
        constructor() {
          super(...arguments);
          this.folders = folders;
        }
      }();
    },
    getWorkspaceFolder() {
      return null;
    }
  });
}
function testT(name, fn) {
  return test(name, () => runWithFakedTimers({ useFakeTimers: true }, fn));
}
suite("PromptFilesLocator", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let fileService;
  const configValues = {};
  let workspaceTrustService;
  const setLocations = (value) => {
    configValues[PromptsConfig.PROMPT_LOCATIONS_KEY] = value;
    configValues[PromptsConfig.INSTRUCTIONS_LOCATION_KEY] = value;
    configValues[PromptsConfig.MODE_LOCATION_KEY] = value;
    configValues[PromptsConfig.SKILLS_LOCATION_KEY] = value;
  };
  const setWorkspaceFolders = (paths) => {
    const workspaceFolders = paths.map((path, index) => {
      const uri = URI.file(path);
      return new class extends mock() {
        constructor() {
          super(...arguments);
          this.uri = uri;
          this.name = basename(uri);
          this.index = index;
        }
      }();
    });
    instantiationService.stub(IWorkspaceContextService, mockWorkspaceService(workspaceFolders));
  };
  setup(async () => {
    instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(ILogService, new NullLogService());
    fileService = disposables.add(instantiationService.createInstance(FileService));
    const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
    instantiationService.stub(IFileService, fileService);
    workspaceTrustService = disposables.add(new TestWorkspaceTrustManagementService());
    instantiationService.stub(IWorkspaceTrustManagementService, workspaceTrustService);
    for (const key of Object.keys(configValues)) {
      delete configValues[key];
    }
    Object.assign(configValues, {
      "explorer.excludeGitIgnore": false,
      "files.exclude": {},
      "search.exclude": {},
      [PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS]: false
    });
    instantiationService.stub(IConfigurationService, mockConfigService(configValues));
    setWorkspaceFolders([]);
    instantiationService.stub(IWorkbenchEnvironmentService, {});
    instantiationService.stub(IUserDataProfileService, new TestUserDataProfileService());
    instantiationService.stub(ISearchService, {
      schemeHasFileSearchProvider(scheme) {
        return true;
      },
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
    instantiationService.stub(IPathService, {
      userHome(options) {
        const uri = URI.file("/Users/legomushroom");
        if (options?.preferLocal) {
          return uri;
        }
        return Promise.resolve(uri);
      }
    });
  });
  suite("empty workspace", () => {
    const EMPTY_WORKSPACE = [];
    suite("empty filesystem", () => {
      testT("no config value", async () => {
        setLocations(void 0);
        setWorkspaceFolders(EMPTY_WORKSPACE);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        assertOutcome(
          await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
          [],
          "No prompts must be found."
        );
      });
      testT("object config value", async () => {
        setLocations({
          "/Users/legomushroom/repos/prompts/": true,
          "/tmp/prompts/": false
        });
        setWorkspaceFolders(EMPTY_WORKSPACE);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        assertOutcome(
          await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
          [],
          "No prompts must be found."
        );
      });
      testT("array config value", async () => {
        setLocations([
          "relative/path/to/prompts/",
          "/abs/path"
        ]);
        setWorkspaceFolders(EMPTY_WORKSPACE);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        assertOutcome(
          await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
          [],
          "No prompts must be found."
        );
      });
      testT("null config value", async () => {
        setLocations(null);
        setWorkspaceFolders(EMPTY_WORKSPACE);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        assertOutcome(
          await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
          [],
          "No prompts must be found."
        );
      });
      testT("string config value", async () => {
        setLocations("/etc/hosts/prompts");
        setWorkspaceFolders(EMPTY_WORKSPACE);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        assertOutcome(
          await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
          [],
          "No prompts must be found."
        );
      });
    });
    suite("non-empty filesystem", () => {
      testT("core logic", async () => {
        setLocations({
          "/Users/legomushroom/repos/prompts": true,
          "/tmp/prompts/": true,
          "/absolute/path/prompts": false,
          ".copilot/prompts": true
        });
        setWorkspaceFolders(EMPTY_WORKSPACE);
        await mockFiles(fileService, [
          {
            path: "/Users/legomushroom/repos/prompts/test.prompt.md",
            contents: ["Hello, World!"]
          },
          {
            path: "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
            contents: ["some file content goes here"]
          },
          {
            path: "/tmp/prompts/translate.to-rust.prompt.md",
            contents: ["some more random file contents"]
          },
          {
            path: "/absolute/path/prompts/some-prompt-file.prompt.md",
            contents: ["hey hey hey"]
          }
        ]);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        assertOutcome(
          await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
          [
            "/Users/legomushroom/repos/prompts/test.prompt.md",
            "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
            "/tmp/prompts/translate.to-rust.prompt.md"
          ],
          "Must find correct prompts."
        );
      });
      suite("absolute", () => {
        testT("wild card", async () => {
          const settings = [
            "/Users/legomushroom/repos/vscode/**",
            "/Users/legomushroom/repos/vscode/**/*.prompt.md",
            "/Users/legomushroom/repos/vscode/**/*.md",
            "/Users/legomushroom/repos/vscode/**/*",
            "/Users/legomushroom/repos/vscode/deps/**",
            "/Users/legomushroom/repos/vscode/deps/**/*.prompt.md",
            "/Users/legomushroom/repos/vscode/deps/**/*",
            "/Users/legomushroom/repos/vscode/deps/**/*.md",
            "/Users/legomushroom/repos/vscode/**/text/**",
            "/Users/legomushroom/repos/vscode/**/text/**/*",
            "/Users/legomushroom/repos/vscode/**/text/**/*.md",
            "/Users/legomushroom/repos/vscode/**/text/**/*.prompt.md",
            "/Users/legomushroom/repos/vscode/deps/text/**",
            "/Users/legomushroom/repos/vscode/deps/text/**/*",
            "/Users/legomushroom/repos/vscode/deps/text/**/*.md",
            "/Users/legomushroom/repos/vscode/deps/text/**/*.prompt.md"
          ];
          for (const setting of settings) {
            setLocations({ [setting]: true });
            setWorkspaceFolders(EMPTY_WORKSPACE);
            await mockFiles(fileService, [
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/my.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md",
                contents: ["oh hi, rabot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/readme.md",
                contents: ["non prompt file"]
              }
            ]);
            const locator = instantiationService.createInstance(PromptFilesLocator);
            assertOutcome(
              await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
              [
                "/Users/legomushroom/repos/vscode/deps/text/my.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md"
              ],
              "Must find correct prompts."
            );
          }
        });
        testT(`specific`, async () => {
          const testSettings = [
            [
              "/Users/legomushroom/repos/vscode/**/*specific*"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/*specific*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/*specific*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/specific*",
              "/Users/legomushroom/repos/vscode/**/unspecific1.prompt.md",
              "/Users/legomushroom/repos/vscode/**/unspecific2.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/**/unspecific*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/nested/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/**/nested/unspecific*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/nested/*specific*"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/*spec*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/*spec*"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/*spec*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/deps/**/*spec*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/text/**/*spec*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/nested/*spec*"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/nested/*specific*"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/**/*specific*"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/**/specific*",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/**/specific*.md",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/**/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific1.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific2.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/**/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific1*.md",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific2*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/**/*specific*"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/**/specific*",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/**/specific*.md",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/**/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific1.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific2.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/**/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific1*.md",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific2*.md"
            ]
          ];
          for (const settings of testSettings) {
            const vscodeSettings = {};
            for (const setting of settings) {
              vscodeSettings[setting] = true;
            }
            setLocations(vscodeSettings);
            setWorkspaceFolders(EMPTY_WORKSPACE);
            await mockFiles(fileService, [
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/my.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/default.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md",
                contents: ["oh hi, rawbot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/readme.md",
                contents: ["non prompt file"]
              }
            ]);
            const locator = instantiationService.createInstance(PromptFilesLocator);
            assertOutcome(
              await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
              [
                "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md"
              ],
              "Must find correct prompts."
            );
          }
        });
      });
    });
  });
  suite("single-root workspace", () => {
    suite("glob pattern", () => {
      suite("relative", () => {
        testT("wild card", async () => {
          const testSettings = [
            "**",
            "**/*.prompt.md",
            "**/*.md",
            "**/*",
            "deps/**",
            "deps/**/*.prompt.md",
            "deps/**/*",
            "deps/**/*.md",
            "**/text/**",
            "**/text/**/*",
            "**/text/**/*.md",
            "**/text/**/*.prompt.md",
            "deps/text/**",
            "deps/text/**/*",
            "deps/text/**/*.md",
            "deps/text/**/*.prompt.md"
          ];
          for (const setting of testSettings) {
            setLocations({ [setting]: true });
            setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
            await mockFiles(fileService, [
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/my.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md",
                contents: ["oh hi, rabot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/readme.md",
                contents: ["non prompt file"]
              }
            ]);
            const locator = instantiationService.createInstance(PromptFilesLocator);
            assertOutcome(
              await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
              [
                "/Users/legomushroom/repos/vscode/deps/text/my.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md"
              ],
              "Must find correct prompts."
            );
          }
        });
        testT(`specific`, async () => {
          const testSettings = [
            [
              "**/*specific*"
            ],
            [
              "**/*specific*.prompt.md"
            ],
            [
              "**/*specific*.md"
            ],
            [
              "**/specific*",
              "**/unspecific1.prompt.md",
              "**/unspecific2.prompt.md"
            ],
            [
              "**/specific.prompt.md",
              "**/unspecific*.prompt.md"
            ],
            [
              "**/nested/specific.prompt.md",
              "**/nested/unspecific*.prompt.md"
            ],
            [
              "**/nested/*specific*"
            ],
            [
              "**/*spec*.prompt.md"
            ],
            [
              "**/*spec*"
            ],
            [
              "**/*spec*.md"
            ],
            [
              "**/deps/**/*spec*.md"
            ],
            [
              "**/text/**/*spec*.md"
            ],
            [
              "deps/text/nested/*spec*"
            ],
            [
              "deps/text/nested/*specific*"
            ],
            [
              "deps/**/*specific*"
            ],
            [
              "deps/**/specific*",
              "deps/**/unspecific*.prompt.md"
            ],
            [
              "deps/**/specific*.md",
              "deps/**/unspecific*.md"
            ],
            [
              "deps/**/specific.prompt.md",
              "deps/**/unspecific1.prompt.md",
              "deps/**/unspecific2.prompt.md"
            ],
            [
              "deps/**/specific.prompt.md",
              "deps/**/unspecific1*.md",
              "deps/**/unspecific2*.md"
            ],
            [
              "deps/text/**/*specific*"
            ],
            [
              "deps/text/**/specific*",
              "deps/text/**/unspecific*.prompt.md"
            ],
            [
              "deps/text/**/specific*.md",
              "deps/text/**/unspecific*.md"
            ],
            [
              "deps/text/**/specific.prompt.md",
              "deps/text/**/unspecific1.prompt.md",
              "deps/text/**/unspecific2.prompt.md"
            ],
            [
              "deps/text/**/specific.prompt.md",
              "deps/text/**/unspecific1*.md",
              "deps/text/**/unspecific2*.md"
            ]
          ];
          for (const settings of testSettings) {
            const vscodeSettings = {};
            for (const setting of settings) {
              vscodeSettings[setting] = true;
            }
            setLocations(vscodeSettings);
            setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
            await mockFiles(fileService, [
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/my.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/default.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md",
                contents: ["oh hi, rawbot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/readme.md",
                contents: ["non prompt file"]
              }
            ]);
            const locator = instantiationService.createInstance(PromptFilesLocator);
            assertOutcome(
              await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
              [
                "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md"
              ],
              "Must find correct prompts."
            );
          }
        });
      });
      suite("absolute", () => {
        testT("wild card", async () => {
          const settings = [
            "/Users/legomushroom/repos/vscode/**",
            "/Users/legomushroom/repos/vscode/**/*.prompt.md",
            "/Users/legomushroom/repos/vscode/**/*.md",
            "/Users/legomushroom/repos/vscode/**/*",
            "/Users/legomushroom/repos/vscode/deps/**",
            "/Users/legomushroom/repos/vscode/deps/**/*.prompt.md",
            "/Users/legomushroom/repos/vscode/deps/**/*",
            "/Users/legomushroom/repos/vscode/deps/**/*.md",
            "/Users/legomushroom/repos/vscode/**/text/**",
            "/Users/legomushroom/repos/vscode/**/text/**/*",
            "/Users/legomushroom/repos/vscode/**/text/**/*.md",
            "/Users/legomushroom/repos/vscode/**/text/**/*.prompt.md",
            "/Users/legomushroom/repos/vscode/deps/text/**",
            "/Users/legomushroom/repos/vscode/deps/text/**/*",
            "/Users/legomushroom/repos/vscode/deps/text/**/*.md",
            "/Users/legomushroom/repos/vscode/deps/text/**/*.prompt.md"
          ];
          for (const setting of settings) {
            setLocations({ [setting]: true });
            setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
            await mockFiles(fileService, [
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/my.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md",
                contents: ["oh hi, rabot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/readme.md",
                contents: ["non prompt file"]
              }
            ]);
            const locator = instantiationService.createInstance(PromptFilesLocator);
            assertOutcome(
              await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
              [
                "/Users/legomushroom/repos/vscode/deps/text/my.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md"
              ],
              "Must find correct prompts."
            );
          }
        });
        testT(`specific`, async () => {
          const testSettings = [
            [
              "/Users/legomushroom/repos/vscode/**/*specific*"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/*specific*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/*specific*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/specific*",
              "/Users/legomushroom/repos/vscode/**/unspecific1.prompt.md",
              "/Users/legomushroom/repos/vscode/**/unspecific2.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/**/unspecific*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/nested/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/**/nested/unspecific*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/nested/*specific*"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/*spec*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/*spec*"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/*spec*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/deps/**/*spec*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/text/**/*spec*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/nested/*spec*"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/nested/*specific*"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/**/*specific*"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/**/specific*",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/**/specific*.md",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/**/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific1.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific2.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/**/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific1*.md",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific2*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/**/*specific*"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/**/specific*",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/**/specific*.md",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/**/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific1.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific2.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/**/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific1*.md",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific2*.md"
            ]
          ];
          for (const settings of testSettings) {
            const vscodeSettings = {};
            for (const setting of settings) {
              vscodeSettings[setting] = true;
            }
            setLocations(vscodeSettings);
            setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
            await mockFiles(fileService, [
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/my.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/default.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md",
                contents: ["oh hi, rawbot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/readme.md",
                contents: ["non prompt file"]
              }
            ]);
            const locator = instantiationService.createInstance(PromptFilesLocator);
            assertOutcome(
              await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
              [
                "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md"
              ],
              "Must find correct prompts."
            );
          }
        });
      });
    });
  });
  testT("core logic", async () => {
    setLocations({
      "/Users/legomushroom/repos/prompts": true,
      "/tmp/prompts/": true,
      "/absolute/path/prompts": false,
      ".copilot/prompts": true
    });
    setWorkspaceFolders([
      "/Users/legomushroom/repos/vscode"
    ]);
    await mockFiles(fileService, [
      {
        path: "/Users/legomushroom/repos/prompts/test.prompt.md",
        contents: ["Hello, World!"]
      },
      {
        path: "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
        contents: ["some file content goes here"]
      },
      {
        path: "/tmp/prompts/translate.to-rust.prompt.md",
        contents: ["some more random file contents"]
      },
      {
        path: "/absolute/path/prompts/some-prompt-file.prompt.md",
        contents: ["hey hey hey"]
      },
      {
        path: "/Users/legomushroom/repos/vscode/.copilot/prompts/default.prompt.md",
        contents: ["oh hi, robot!"]
      },
      {
        path: "/Users/legomushroom/repos/vscode/.github/prompts/my.prompt.md",
        contents: ["oh hi, bot!"]
      }
    ]);
    const locator = instantiationService.createInstance(PromptFilesLocator);
    assertOutcome(
      await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
      [
        "/Users/legomushroom/repos/vscode/.github/prompts/my.prompt.md",
        "/Users/legomushroom/repos/prompts/test.prompt.md",
        "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
        "/tmp/prompts/translate.to-rust.prompt.md",
        "/Users/legomushroom/repos/vscode/.copilot/prompts/default.prompt.md"
      ],
      "Must find correct prompts."
    );
  });
  testT("with disabled `.github/prompts` location", async () => {
    setLocations({
      "/Users/legomushroom/repos/prompts": true,
      "/tmp/prompts/": true,
      "/absolute/path/prompts": false,
      ".copilot/prompts": true,
      ".github/prompts": false
    });
    setWorkspaceFolders([
      "/Users/legomushroom/repos/vscode"
    ]);
    await mockFiles(fileService, [
      {
        path: "/Users/legomushroom/repos/prompts/test.prompt.md",
        contents: ["Hello, World!"]
      },
      {
        path: "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
        contents: ["some file content goes here"]
      },
      {
        path: "/tmp/prompts/translate.to-rust.prompt.md",
        contents: ["some more random file contents"]
      },
      {
        path: "/absolute/path/prompts/some-prompt-file.prompt.md",
        contents: ["hey hey hey"]
      },
      {
        path: "/Users/legomushroom/repos/vscode/.copilot/prompts/default.prompt.md",
        contents: ["oh hi, robot!"]
      },
      {
        path: "/Users/legomushroom/repos/vscode/.github/prompts/my.prompt.md",
        contents: ["oh hi, bot!"]
      },
      {
        path: "/Users/legomushroom/repos/vscode/.github/prompts/your.prompt.md",
        contents: ["oh hi, bot!"]
      }
    ]);
    const locator = instantiationService.createInstance(PromptFilesLocator);
    assertOutcome(
      await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
      [
        "/Users/legomushroom/repos/prompts/test.prompt.md",
        "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
        "/tmp/prompts/translate.to-rust.prompt.md",
        "/Users/legomushroom/repos/vscode/.copilot/prompts/default.prompt.md"
      ],
      "Must find correct prompts."
    );
  });
  suite("multi-root workspace", () => {
    suite("core logic", () => {
      testT("without top-level `.github` folder", async () => {
        setLocations({
          "/Users/legomushroom/repos/prompts": true,
          "/tmp/prompts/": true,
          "/absolute/path/prompts": false,
          ".copilot/prompts": false
        });
        setWorkspaceFolders([
          "/Users/legomushroom/repos/vscode",
          "/Users/legomushroom/repos/node"
        ]);
        await mockFiles(fileService, [
          {
            path: "/Users/legomushroom/repos/prompts/test.prompt.md",
            contents: ["Hello, World!"]
          },
          {
            path: "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
            contents: ["some file content goes here"]
          },
          {
            path: "/tmp/prompts/translate.to-rust.prompt.md",
            contents: ["some more random file contents"]
          },
          {
            path: "/absolute/path/prompts/some-prompt-file.prompt.md",
            contents: ["hey hey hey"]
          },
          {
            path: "/Users/legomushroom/repos/vscode/.copilot/prompts/prompt1.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md",
            contents: ["oh hi, bot!"]
          },
          {
            path: "/Users/legomushroom/repos/node/.copilot/prompts/prompt5.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md",
            contents: ["file contents"]
          },
          {
            path: "/Users/legomushroom/repos/.github/prompts/prompt-name.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/Users/legomushroom/repos/.github/prompts/name-of-the-prompt.prompt.md",
            contents: ["oh hi, raw bot!"]
          }
        ]);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        assertOutcome(
          await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
          [
            "/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md",
            "/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md",
            "/Users/legomushroom/repos/prompts/test.prompt.md",
            "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
            "/tmp/prompts/translate.to-rust.prompt.md"
          ],
          "Must find correct prompts."
        );
      });
      testT("with top-level `.github` folder", async () => {
        setLocations({
          "/Users/legomushroom/repos/prompts": true,
          "/tmp/prompts/": true,
          "/absolute/path/prompts": false,
          ".copilot/prompts": false
        });
        setWorkspaceFolders([
          "/Users/legomushroom/repos/vscode",
          "/Users/legomushroom/repos/node",
          "/var/shared/prompts"
        ]);
        await mockFiles(fileService, [
          {
            path: "/Users/legomushroom/repos/prompts/test.prompt.md",
            contents: ["Hello, World!"]
          },
          {
            path: "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
            contents: ["some file content goes here"]
          },
          {
            path: "/tmp/prompts/translate.to-rust.prompt.md",
            contents: ["some more random file contents"]
          },
          {
            path: "/absolute/path/prompts/some-prompt-file.prompt.md",
            contents: ["hey hey hey"]
          },
          {
            path: "/Users/legomushroom/repos/vscode/.copilot/prompts/prompt1.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md",
            contents: ["oh hi, bot!"]
          },
          {
            path: "/Users/legomushroom/repos/node/.copilot/prompts/prompt5.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md",
            contents: ["file contents"]
          },
          {
            path: "/var/shared/prompts/.github/prompts/prompt-name.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/var/shared/prompts/.github/prompts/name-of-the-prompt.prompt.md",
            contents: ["oh hi, raw bot!"]
          }
        ]);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        assertOutcome(
          await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
          [
            "/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md",
            "/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md",
            "/var/shared/prompts/.github/prompts/prompt-name.prompt.md",
            "/var/shared/prompts/.github/prompts/name-of-the-prompt.prompt.md",
            "/Users/legomushroom/repos/prompts/test.prompt.md",
            "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
            "/tmp/prompts/translate.to-rust.prompt.md"
          ],
          "Must find correct prompts."
        );
      });
      testT("with disabled `.github/prompts` location", async () => {
        setLocations({
          "/Users/legomushroom/repos/prompts": true,
          "/tmp/prompts/": true,
          "/absolute/path/prompts": false,
          ".copilot/prompts": false,
          ".github/prompts": false
        });
        setWorkspaceFolders([
          "/Users/legomushroom/repos/vscode",
          "/Users/legomushroom/repos/node",
          "/var/shared/prompts"
        ]);
        await mockFiles(fileService, [
          {
            path: "/Users/legomushroom/repos/prompts/test.prompt.md",
            contents: ["Hello, World!"]
          },
          {
            path: "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
            contents: ["some file content goes here"]
          },
          {
            path: "/tmp/prompts/translate.to-rust.prompt.md",
            contents: ["some more random file contents"]
          },
          {
            path: "/absolute/path/prompts/some-prompt-file.prompt.md",
            contents: ["hey hey hey"]
          },
          {
            path: "/Users/legomushroom/repos/vscode/.copilot/prompts/prompt1.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md",
            contents: ["oh hi, bot!"]
          },
          {
            path: "/Users/legomushroom/repos/node/.copilot/prompts/prompt5.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md",
            contents: ["file contents"]
          },
          {
            path: "/var/shared/prompts/.github/prompts/prompt-name.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/var/shared/prompts/.github/prompts/name-of-the-prompt.prompt.md",
            contents: ["oh hi, raw bot!"]
          }
        ]);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        assertOutcome(
          await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
          [
            "/Users/legomushroom/repos/prompts/test.prompt.md",
            "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
            "/tmp/prompts/translate.to-rust.prompt.md"
          ],
          "Must find correct prompts."
        );
      });
      testT("mixed", async () => {
        setLocations({
          "/Users/legomushroom/repos/**/*test*": true,
          ".copilot/prompts": false,
          ".github/prompts": true,
          "/absolute/path/prompts/some-prompt-file.prompt.md": true
        });
        setWorkspaceFolders([
          "/Users/legomushroom/repos/vscode",
          "/Users/legomushroom/repos/node",
          "/var/shared/prompts"
        ]);
        await mockFiles(fileService, [
          {
            path: "/Users/legomushroom/repos/prompts/test.prompt.md",
            contents: ["Hello, World!"]
          },
          {
            path: "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
            contents: ["some file content goes here"]
          },
          {
            path: "/Users/legomushroom/repos/prompts/elf.prompt.md",
            contents: ["haalo!"]
          },
          {
            path: "/tmp/prompts/translate.to-rust.prompt.md",
            contents: ["some more random file contents"]
          },
          {
            path: "/absolute/path/prompts/some-prompt-file.prompt.md",
            contents: ["hey hey hey"]
          },
          {
            path: "/Users/legomushroom/repos/vscode/.copilot/prompts/prompt1.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md",
            contents: ["oh hi, bot!"]
          },
          {
            path: "/Users/legomushroom/repos/node/.copilot/prompts/prompt5.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md",
            contents: ["file contents"]
          },
          {
            path: "/var/shared/prompts/.github/prompts/prompt-name.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/var/shared/prompts/.github/prompts/name-of-the-prompt.prompt.md",
            contents: ["oh hi, raw bot!"]
          }
        ]);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        assertOutcome(
          await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
          [
            // all of these are due to the `.github/prompts` setting
            "/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md",
            "/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md",
            "/var/shared/prompts/.github/prompts/prompt-name.prompt.md",
            "/var/shared/prompts/.github/prompts/name-of-the-prompt.prompt.md",
            // all of these are due to the `/Users/legomushroom/repos/**/*test*` setting
            "/Users/legomushroom/repos/prompts/test.prompt.md",
            "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
            // this one is due to the specific `/absolute/path/prompts/some-prompt-file.prompt.md` setting
            "/absolute/path/prompts/some-prompt-file.prompt.md"
          ],
          "Must find correct prompts."
        );
      });
    });
    suite("glob pattern", () => {
      suite("relative", () => {
        testT("wild card", async () => {
          const testSettings = [
            "**",
            "**/*.prompt.md",
            "**/*.md",
            "**/*",
            "gen*/**",
            "gen*/**/*.prompt.md",
            "gen*/**/*",
            "gen*/**/*.md",
            "**/gen*/**",
            "**/gen*/**/*",
            "**/gen*/**/*.md",
            "**/gen*/**/*.prompt.md",
            "{generic,general,gen}/**",
            "{generic,general,gen}/**/*.prompt.md",
            "{generic,general,gen}/**/*",
            "{generic,general,gen}/**/*.md",
            "**/{generic,general,gen}/**",
            "**/{generic,general,gen}/**/*",
            "**/{generic,general,gen}/**/*.md",
            "**/{generic,general,gen}/**/*.prompt.md"
          ];
          for (const setting of testSettings) {
            setLocations({ [setting]: true });
            setWorkspaceFolders([
              "/Users/legomushroom/repos/vscode",
              "/Users/legomushroom/repos/prompts"
            ]);
            await mockFiles(fileService, [
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/my.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md",
                contents: ["oh hi, rabot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/readme.md",
                contents: ["non prompt file"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/common.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/license.md",
                contents: ["non prompt file"]
              }
            ]);
            const locator = instantiationService.createInstance(PromptFilesLocator);
            assertOutcome(
              await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
              [
                "/Users/legomushroom/repos/vscode/gen/text/my.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md",
                // -
                "/Users/legomushroom/repos/prompts/general/common.prompt.md",
                "/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md"
              ],
              "Must find correct prompts."
            );
          }
        });
        testT(`specific`, async () => {
          const testSettings = [
            [
              "**/my.prompt.md",
              "**/*specific*",
              "**/*common*"
            ],
            [
              "**/my.prompt.md",
              "**/*specific*.prompt.md",
              "**/*common*.prompt.md"
            ],
            [
              "**/my*.md",
              "**/*specific*.md",
              "**/*common*.md"
            ],
            [
              "**/my*.md",
              "**/specific*",
              "**/unspecific*",
              "**/common*",
              "**/uncommon*"
            ],
            [
              "**/my.prompt.md",
              "**/specific.prompt.md",
              "**/unspecific1.prompt.md",
              "**/unspecific2.prompt.md",
              "**/common.prompt.md",
              "**/uncommon-10.prompt.md"
            ],
            [
              "gen*/**/my.prompt.md",
              "gen*/**/*specific*",
              "gen*/**/*common*"
            ],
            [
              "gen*/**/my.prompt.md",
              "gen*/**/*specific*.prompt.md",
              "gen*/**/*common*.prompt.md"
            ],
            [
              "gen*/**/my*.md",
              "gen*/**/*specific*.md",
              "gen*/**/*common*.md"
            ],
            [
              "gen*/**/my*.md",
              "gen*/**/specific*",
              "gen*/**/unspecific*",
              "gen*/**/common*",
              "gen*/**/uncommon*"
            ],
            [
              "gen*/**/my.prompt.md",
              "gen*/**/specific.prompt.md",
              "gen*/**/unspecific1.prompt.md",
              "gen*/**/unspecific2.prompt.md",
              "gen*/**/common.prompt.md",
              "gen*/**/uncommon-10.prompt.md"
            ],
            [
              "gen/text/my.prompt.md",
              "gen/text/nested/specific.prompt.md",
              "gen/text/nested/unspecific1.prompt.md",
              "gen/text/nested/unspecific2.prompt.md",
              "general/common.prompt.md",
              "general/uncommon-10.prompt.md"
            ],
            [
              "gen/text/my.prompt.md",
              "gen/text/nested/*specific*",
              "general/*common*"
            ],
            [
              "gen/text/my.prompt.md",
              "gen/text/**/specific.prompt.md",
              "gen/text/**/unspecific1.prompt.md",
              "gen/text/**/unspecific2.prompt.md",
              "general/*"
            ],
            [
              "{gen,general}/**/my.prompt.md",
              "{gen,general}/**/*specific*",
              "{gen,general}/**/*common*"
            ],
            [
              "{gen,general}/**/my.prompt.md",
              "{gen,general}/**/*specific*.prompt.md",
              "{gen,general}/**/*common*.prompt.md"
            ],
            [
              "{gen,general}/**/my*.md",
              "{gen,general}/**/*specific*.md",
              "{gen,general}/**/*common*.md"
            ],
            [
              "{gen,general}/**/my*.md",
              "{gen,general}/**/specific*",
              "{gen,general}/**/unspecific*",
              "{gen,general}/**/common*",
              "{gen,general}/**/uncommon*"
            ],
            [
              "{gen,general}/**/my.prompt.md",
              "{gen,general}/**/specific.prompt.md",
              "{gen,general}/**/unspecific1.prompt.md",
              "{gen,general}/**/unspecific2.prompt.md",
              "{gen,general}/**/common.prompt.md",
              "{gen,general}/**/uncommon-10.prompt.md"
            ]
          ];
          for (const settings of testSettings) {
            const vscodeSettings = {};
            for (const setting of settings) {
              vscodeSettings[setting] = true;
            }
            setLocations(vscodeSettings);
            setWorkspaceFolders([
              "/Users/legomushroom/repos/vscode",
              "/Users/legomushroom/repos/prompts"
            ]);
            await mockFiles(fileService, [
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/my.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md",
                contents: ["oh hi, rabot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/readme.md",
                contents: ["non prompt file"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/common.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/license.md",
                contents: ["non prompt file"]
              }
            ]);
            const locator = instantiationService.createInstance(PromptFilesLocator);
            assertOutcome(
              await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
              [
                "/Users/legomushroom/repos/vscode/gen/text/my.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md",
                // -
                "/Users/legomushroom/repos/prompts/general/common.prompt.md",
                "/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md"
              ],
              "Must find correct prompts."
            );
          }
        });
      });
      suite("absolute", () => {
        testT("wild card", async () => {
          const testSettings = [
            "/Users/legomushroom/repos/**",
            "/Users/legomushroom/repos/**/*.prompt.md",
            "/Users/legomushroom/repos/**/*.md",
            "/Users/legomushroom/repos/**/*",
            "/Users/legomushroom/repos/**/gen*/**",
            "/Users/legomushroom/repos/**/gen*/**/*.prompt.md",
            "/Users/legomushroom/repos/**/gen*/**/*",
            "/Users/legomushroom/repos/**/gen*/**/*.md",
            "/Users/legomushroom/repos/**/gen*/**",
            "/Users/legomushroom/repos/**/gen*/**/*",
            "/Users/legomushroom/repos/**/gen*/**/*.md",
            "/Users/legomushroom/repos/**/gen*/**/*.prompt.md",
            "/Users/legomushroom/repos/{vscode,prompts}/**",
            "/Users/legomushroom/repos/{vscode,prompts}/**/*.prompt.md",
            "/Users/legomushroom/repos/{vscode,prompts}/**/*.md",
            "/Users/legomushroom/repos/{vscode,prompts}/**/*",
            "/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**",
            "/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**/*.prompt.md",
            "/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**/*",
            "/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**/*.md",
            "/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**",
            "/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**/*",
            "/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**/*.md",
            "/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**/*.prompt.md",
            "/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**",
            "/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**/*.prompt.md",
            "/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**/*",
            "/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**/*.md",
            "/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**",
            "/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**/*",
            "/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**/*.md",
            "/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**/*.prompt.md"
          ];
          for (const setting of testSettings) {
            setLocations({ [setting]: true });
            setWorkspaceFolders([
              "/Users/legomushroom/repos/vscode",
              "/Users/legomushroom/repos/prompts"
            ]);
            await mockFiles(fileService, [
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/my.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md",
                contents: ["oh hi, rabot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/readme.md",
                contents: ["non prompt file"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/common.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/license.md",
                contents: ["non prompt file"]
              }
            ]);
            const locator = instantiationService.createInstance(PromptFilesLocator);
            assertOutcome(
              await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
              [
                "/Users/legomushroom/repos/vscode/gen/text/my.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md",
                // -
                "/Users/legomushroom/repos/prompts/general/common.prompt.md",
                "/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md"
              ],
              "Must find correct prompts."
            );
          }
        });
        testT(`specific`, async () => {
          const testSettings = [
            [
              "/Users/legomushroom/repos/**/my.prompt.md",
              "/Users/legomushroom/repos/**/*specific*",
              "/Users/legomushroom/repos/**/*common*"
            ],
            [
              "/Users/legomushroom/repos/**/my.prompt.md",
              "/Users/legomushroom/repos/**/*specific*.prompt.md",
              "/Users/legomushroom/repos/**/*common*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/**/my*.md",
              "/Users/legomushroom/repos/**/*specific*.md",
              "/Users/legomushroom/repos/**/*common*.md"
            ],
            [
              "/Users/legomushroom/repos/**/my*.md",
              "/Users/legomushroom/repos/**/specific*",
              "/Users/legomushroom/repos/**/unspecific*",
              "/Users/legomushroom/repos/**/common*",
              "/Users/legomushroom/repos/**/uncommon*"
            ],
            [
              "/Users/legomushroom/repos/**/my.prompt.md",
              "/Users/legomushroom/repos/**/specific.prompt.md",
              "/Users/legomushroom/repos/**/unspecific1.prompt.md",
              "/Users/legomushroom/repos/**/unspecific2.prompt.md",
              "/Users/legomushroom/repos/**/common.prompt.md",
              "/Users/legomushroom/repos/**/uncommon-10.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/**/gen*/**/my.prompt.md",
              "/Users/legomushroom/repos/**/gen*/**/*specific*",
              "/Users/legomushroom/repos/**/gen*/**/*common*"
            ],
            [
              "/Users/legomushroom/repos/**/gen*/**/my.prompt.md",
              "/Users/legomushroom/repos/**/gen*/**/*specific*.prompt.md",
              "/Users/legomushroom/repos/**/gen*/**/*common*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/**/gen*/**/my*.md",
              "/Users/legomushroom/repos/**/gen*/**/*specific*.md",
              "/Users/legomushroom/repos/**/gen*/**/*common*.md"
            ],
            [
              "/Users/legomushroom/repos/**/gen*/**/my*.md",
              "/Users/legomushroom/repos/**/gen*/**/specific*",
              "/Users/legomushroom/repos/**/gen*/**/unspecific*",
              "/Users/legomushroom/repos/**/gen*/**/common*",
              "/Users/legomushroom/repos/**/gen*/**/uncommon*"
            ],
            [
              "/Users/legomushroom/repos/**/gen*/**/my.prompt.md",
              "/Users/legomushroom/repos/**/gen*/**/specific.prompt.md",
              "/Users/legomushroom/repos/**/gen*/**/unspecific1.prompt.md",
              "/Users/legomushroom/repos/**/gen*/**/unspecific2.prompt.md",
              "/Users/legomushroom/repos/**/gen*/**/common.prompt.md",
              "/Users/legomushroom/repos/**/gen*/**/uncommon-10.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/gen/text/my.prompt.md",
              "/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md",
              "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md",
              "/Users/legomushroom/repos/prompts/general/common.prompt.md",
              "/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/gen/text/my.prompt.md",
              "/Users/legomushroom/repos/vscode/gen/text/nested/*specific*",
              "/Users/legomushroom/repos/prompts/general/*common*"
            ],
            [
              "/Users/legomushroom/repos/vscode/gen/text/my.prompt.md",
              "/Users/legomushroom/repos/vscode/gen/text/**/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/gen/text/**/unspecific1.prompt.md",
              "/Users/legomushroom/repos/vscode/gen/text/**/unspecific2.prompt.md",
              "/Users/legomushroom/repos/prompts/general/*"
            ],
            [
              "/Users/legomushroom/repos/**/{gen,general}/**/my.prompt.md",
              "/Users/legomushroom/repos/**/{gen,general}/**/*specific*",
              "/Users/legomushroom/repos/**/{gen,general}/**/*common*"
            ],
            [
              "/Users/legomushroom/repos/**/{gen,general}/**/my.prompt.md",
              "/Users/legomushroom/repos/**/{gen,general}/**/*specific*.prompt.md",
              "/Users/legomushroom/repos/**/{gen,general}/**/*common*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/**/{gen,general}/**/my*.md",
              "/Users/legomushroom/repos/**/{gen,general}/**/*specific*.md",
              "/Users/legomushroom/repos/**/{gen,general}/**/*common*.md"
            ],
            [
              "/Users/legomushroom/repos/**/{gen,general}/**/my*.md",
              "/Users/legomushroom/repos/**/{gen,general}/**/specific*",
              "/Users/legomushroom/repos/**/{gen,general}/**/unspecific*",
              "/Users/legomushroom/repos/**/{gen,general}/**/common*",
              "/Users/legomushroom/repos/**/{gen,general}/**/uncommon*"
            ],
            [
              "/Users/legomushroom/repos/**/{gen,general}/**/my.prompt.md",
              "/Users/legomushroom/repos/**/{gen,general}/**/specific.prompt.md",
              "/Users/legomushroom/repos/**/{gen,general}/**/unspecific1.prompt.md",
              "/Users/legomushroom/repos/**/{gen,general}/**/unspecific2.prompt.md",
              "/Users/legomushroom/repos/**/{gen,general}/**/common.prompt.md",
              "/Users/legomushroom/repos/**/{gen,general}/**/uncommon-10.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/my.prompt.md",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/*specific*",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/*common*"
            ],
            [
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/my.prompt.md",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/*specific*.prompt.md",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/*common*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/my*.md",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/*specific*.md",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/*common*.md"
            ],
            [
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/my*.md",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/specific*",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/unspecific*",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/common*",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/uncommon*"
            ],
            [
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/my.prompt.md",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/specific.prompt.md",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/unspecific1.prompt.md",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/unspecific2.prompt.md",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/common.prompt.md",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/uncommon-10.prompt.md"
            ]
          ];
          for (const settings of testSettings) {
            const vscodeSettings = {};
            for (const setting of settings) {
              vscodeSettings[setting] = true;
            }
            setLocations(vscodeSettings);
            setWorkspaceFolders([
              "/Users/legomushroom/repos/vscode",
              "/Users/legomushroom/repos/prompts"
            ]);
            await mockFiles(fileService, [
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/my.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md",
                contents: ["oh hi, rabot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/readme.md",
                contents: ["non prompt file"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/common.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/license.md",
                contents: ["non prompt file"]
              }
            ]);
            const locator = instantiationService.createInstance(PromptFilesLocator);
            assertOutcome(
              await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
              [
                "/Users/legomushroom/repos/vscode/gen/text/my.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md",
                // -
                "/Users/legomushroom/repos/prompts/general/common.prompt.md",
                "/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md"
              ],
              "Must find correct prompts."
            );
          }
        });
      });
    });
  });
  suite("instructions", () => {
    testT("finds instructions files in subdirectories of .github/instructions", async () => {
      setLocations({
        ".github/instructions": true,
        ".claude/rules": false,
        "~/.copilot/instructions": false
      });
      setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
      await mockFiles(fileService, [
        {
          path: "/Users/legomushroom/repos/vscode/.github/instructions/root.instructions.md",
          contents: ["root instructions"]
        },
        {
          path: "/Users/legomushroom/repos/vscode/.github/instructions/frontend/react.instructions.md",
          contents: ["react instructions"]
        },
        {
          path: "/Users/legomushroom/repos/vscode/.github/instructions/frontend/css.instructions.md",
          contents: ["css instructions"]
        },
        {
          path: "/Users/legomushroom/repos/vscode/.github/instructions/backend/api.instructions.md",
          contents: ["api instructions"]
        }
      ]);
      const locator = instantiationService.createInstance(PromptFilesLocator);
      assertOutcome(
        await locator.listFiles(PromptsType.instructions, PromptsStorage.local, CancellationToken.None),
        [
          "/Users/legomushroom/repos/vscode/.github/instructions/root.instructions.md",
          "/Users/legomushroom/repos/vscode/.github/instructions/frontend/react.instructions.md",
          "/Users/legomushroom/repos/vscode/.github/instructions/frontend/css.instructions.md",
          "/Users/legomushroom/repos/vscode/.github/instructions/backend/api.instructions.md"
        ],
        "Must find instructions files recursively in subdirectories of .github/instructions."
      );
    });
  });
  suite("skills", () => {
    suite("findAgentSkills", () => {
      testT("finds skill files in configured locations", async () => {
        setLocations({
          ".claude/skills": true,
          // disable other defaults
          ".github/skills": false,
          "~/.copilot/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, [
          {
            path: "/Users/legomushroom/repos/vscode/.claude/skills/pptx/SKILL.md",
            contents: ["# PPTX Skill"]
          },
          {
            path: "/Users/legomushroom/repos/vscode/.claude/skills/excel/SKILL.md",
            contents: ["# Excel Skill"]
          }
        ]);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const skills = await locator.findAgentSkills(CancellationToken.None);
        assertOutcome(
          skills.map((s) => s.uri),
          [
            "/Users/legomushroom/repos/vscode/.claude/skills/pptx/SKILL.md",
            "/Users/legomushroom/repos/vscode/.claude/skills/excel/SKILL.md"
          ],
          "Must find skill files."
        );
      });
      testT("ignores folders without SKILL.md", async () => {
        setLocations({
          ".claude/skills": true,
          // disable other defaults
          ".github/skills": false,
          "~/.copilot/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, [
          {
            path: "/Users/legomushroom/repos/vscode/.claude/skills/valid-skill/SKILL.md",
            contents: ["# Valid Skill"]
          },
          {
            path: "/Users/legomushroom/repos/vscode/.claude/skills/invalid-skill/readme.md",
            contents: ["Not a skill file"]
          },
          {
            path: "/Users/legomushroom/repos/vscode/.claude/skills/another-invalid/index.js",
            contents: ['console.log("not a skill")']
          }
        ]);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const skills = await locator.findAgentSkills(CancellationToken.None);
        assertOutcome(
          skills.map((s) => s.uri),
          [
            "/Users/legomushroom/repos/vscode/.claude/skills/valid-skill/SKILL.md"
          ],
          "Must only find folders with SKILL.md."
        );
      });
      testT("returns empty array when no skills exist", async () => {
        setLocations({
          ".claude/skills": true,
          // disable other defaults
          ".github/skills": false,
          "~/.copilot/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const skills = await locator.findAgentSkills(CancellationToken.None);
        assertOutcome(
          skills.map((s) => s.uri),
          [],
          "Must return empty array when no skills exist."
        );
      });
      testT("returns empty array when skill folder does not exist", async () => {
        setLocations({
          ".claude/skills": true,
          // disable other defaults
          ".github/skills": false,
          "~/.copilot/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const skills = await locator.findAgentSkills(CancellationToken.None);
        assertOutcome(
          skills.map((s) => s.uri),
          [],
          "Must return empty array when folder does not exist."
        );
      });
      testT("finds skills across multiple workspace folders", async () => {
        setLocations({
          ".claude/skills": true,
          // disable other defaults
          ".github/skills": false,
          "~/.copilot/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders([
          "/Users/legomushroom/repos/vscode",
          "/Users/legomushroom/repos/node"
        ]);
        await mockFiles(fileService, [
          {
            path: "/Users/legomushroom/repos/vscode/.claude/skills/skill-a/SKILL.md",
            contents: ["# Skill A"]
          },
          {
            path: "/Users/legomushroom/repos/node/.claude/skills/skill-b/SKILL.md",
            contents: ["# Skill B"]
          }
        ]);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const skills = await locator.findAgentSkills(CancellationToken.None);
        assertOutcome(
          skills.map((s) => s.uri),
          [
            "/Users/legomushroom/repos/vscode/.claude/skills/skill-a/SKILL.md",
            "/Users/legomushroom/repos/node/.claude/skills/skill-b/SKILL.md"
          ],
          "Must find skills across all workspace folders."
        );
      });
    });
    suite("listFiles with PromptsType.skill", () => {
      testT("does not list skills when location is disabled", async () => {
        setLocations({
          ".claude/skills": false,
          // disable other defaults
          ".github/skills": false,
          "~/.copilot/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, [
          {
            path: "/Users/legomushroom/repos/vscode/.claude/skills/pptx/SKILL.md",
            contents: ["# PPTX Skill"]
          }
        ]);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const files = await locator.listFiles(PromptsType.skill, PromptsStorage.local, CancellationToken.None);
        assertOutcome(
          files,
          [],
          "Must not list skills when location is disabled."
        );
      });
    });
    suite("toAbsoluteLocationsForSkills path validation", () => {
      testT("rejects glob patterns in skill paths via getConfigBasedSourceFolders", async () => {
        setLocations({
          "skills/**": true,
          "skills/*": true,
          "**/skills": true,
          // disable defaults
          ".github/skills": false,
          ".agents/skills": false,
          ".claude/skills": false,
          "~/.copilot/skills": false,
          "~/.agents/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
        assertOutcome(
          folders,
          [],
          "Must reject glob patterns in skill paths."
        );
      });
      testT("rejects absolute paths in skill paths via getConfigBasedSourceFolders", async () => {
        setLocations({
          "/absolute/path/skills": true,
          // disable defaults
          ".github/skills": false,
          ".agents/skills": false,
          ".claude/skills": false,
          "~/.copilot/skills": false,
          "~/.agents/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
        assertOutcome(
          folders,
          [],
          "Must reject absolute paths in skill paths."
        );
      });
      testT("accepts relative paths in skill paths via getConfigBasedSourceFolders", async () => {
        setLocations({
          "./my-skills": true,
          "custom/skills": true,
          // disable defaults
          ".github/skills": false,
          ".agents/skills": false,
          ".claude/skills": false,
          "~/.copilot/skills": false,
          "~/.agents/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
        assertOutcome(
          folders,
          [
            "/Users/legomushroom/repos/vscode/my-skills",
            "/Users/legomushroom/repos/vscode/custom/skills"
          ],
          "Must accept relative paths in skill paths."
        );
      });
      testT("accepts parent relative paths for monorepos via getConfigBasedSourceFolders", async () => {
        setLocations({
          "../shared-skills": true,
          // disable defaults
          ".github/skills": false,
          ".agents/skills": false,
          ".claude/skills": false,
          "~/.copilot/skills": false,
          "~/.agents/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
        assertOutcome(
          folders,
          [
            "/Users/legomushroom/repos/shared-skills"
          ],
          "Must accept parent relative paths for monorepos."
        );
      });
      testT("accepts tilde paths for user home skills", async () => {
        setLocations({
          "~/my-skills": true,
          // disable defaults
          ".github/skills": false,
          ".agents/skills": false,
          ".claude/skills": false,
          "~/.copilot/skills": false,
          "~/.agents/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
        assertOutcome(
          folders,
          [
            "/Users/legomushroom/my-skills"
          ],
          "Must accept tilde paths for user home skills."
        );
      });
    });
    suite("getConfigBasedSourceFolders for skills", () => {
      testT("returns source folders without glob processing", async () => {
        setLocations({
          ".claude/skills": true,
          "custom-skills": true,
          // explicitly disable other defaults we don't want for this test
          ".github/skills": false,
          ".agents/skills": false,
          "~/.copilot/skills": false,
          "~/.agents/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders([
          "/Users/legomushroom/repos/vscode",
          "/Users/legomushroom/repos/node"
        ]);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
        assertOutcome(
          folders,
          [
            "/Users/legomushroom/repos/vscode/.claude/skills",
            "/Users/legomushroom/repos/node/.claude/skills",
            "/Users/legomushroom/repos/vscode/custom-skills",
            "/Users/legomushroom/repos/node/custom-skills"
          ],
          "Must return skill source folders without glob processing."
        );
      });
      testT("filters out invalid skill paths from source folders", async () => {
        setLocations({
          ".claude/skills": true,
          "skills/**": true,
          // glob - should be filtered out
          "/absolute/skills": true,
          // absolute - should be filtered out
          // explicitly disable other defaults we don't want for this test
          ".github/skills": false,
          ".agents/skills": false,
          "~/.copilot/skills": false,
          "~/.agents/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
        assertOutcome(
          folders,
          [
            "/Users/legomushroom/repos/vscode/.claude/skills"
          ],
          "Must filter out invalid skill paths."
        );
      });
      testT("includes default skill source folders from defaults", async () => {
        setLocations({
          "custom-skills": true
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
        assertOutcome(
          folders,
          [
            // defaults
            "/Users/legomushroom/repos/vscode/.agents/skills",
            "/Users/legomushroom/repos/vscode/.github/skills",
            "/Users/legomushroom/repos/vscode/.claude/skills",
            "/Users/legomushroom/.agents/skills",
            "/Users/legomushroom/.copilot/skills",
            "/Users/legomushroom/.claude/skills",
            // custom
            "/Users/legomushroom/repos/vscode/custom-skills"
          ],
          "Must include default skill source folders."
        );
      });
    });
  });
  suite("isValidGlob", () => {
    testT("valid patterns", async () => {
      const globs = [
        "**",
        "*",
        "**",
        "**/*",
        "**/*.prompt.md",
        "/Users/legomushroom/**/*.prompt.md",
        "/Users/legomushroom/*.prompt.md",
        "/Users/legomushroom/*",
        "/Users/legomushroom/repos/{repo1,test}",
        "/Users/legomushroom/repos/{repo1,test}/**",
        "/Users/legomushroom/repos/{repo1,test}/*",
        "/Users/legomushroom/**/{repo1,test}/**",
        "/Users/legomushroom/**/{repo1,test}",
        "/Users/legomushroom/**/{repo1,test}/*",
        "/Users/legomushroom/**/repo[1,2,3]",
        "/Users/legomushroom/**/repo[1,2,3]/**",
        "/Users/legomushroom/**/repo[1,2,3]/*",
        "/Users/legomushroom/**/repo[1,2,3]/**/*.prompt.md",
        "repo[1,2,3]/**/*.prompt.md",
        "repo[[1,2,3]/**/*.prompt.md",
        "{repo1,test}/*.prompt.md",
        "{repo1,test}/*",
        "/{repo1,test}/*",
        "/{repo1,test}}/*"
      ];
      for (const glob of globs) {
        assert(
          isValidGlob(glob) === true,
          `'${glob}' must be a 'valid' glob pattern.`
        );
      }
    });
    testT("invalid patterns", async () => {
      const globs = [
        ".",
        "\\*",
        "\\?",
        "\\*\\?\\*",
        "repo[1,2,3",
        "repo1,2,3]",
        "repo\\[1,2,3]",
        "repo[1,2,3\\]",
        "repo\\[1,2,3\\]",
        "{repo1,repo2",
        "repo1,repo2}",
        "\\{repo1,repo2}",
        "{repo1,repo2\\}",
        "\\{repo1,repo2\\}",
        "/Users/legomushroom/repos",
        "/Users/legomushroom/repo[1,2,3",
        "/Users/legomushroom/repo1,2,3]",
        "/Users/legomushroom/repo\\[1,2,3]",
        "/Users/legomushroom/repo[1,2,3\\]",
        "/Users/legomushroom/repo\\[1,2,3\\]",
        "/Users/legomushroom/{repo1,repo2",
        "/Users/legomushroom/repo1,repo2}",
        "/Users/legomushroom/\\{repo1,repo2}",
        "/Users/legomushroom/{repo1,repo2\\}",
        "/Users/legomushroom/\\{repo1,repo2\\}"
      ];
      for (const glob of globs) {
        assert(
          isValidGlob(glob) === false,
          `'${glob}' must be an 'invalid' glob pattern.`
        );
      }
    });
  });
  suite("isValidSkillPath", () => {
    testT("accepts relative paths", async () => {
      const validPaths = [
        "someFolder",
        "./someFolder",
        "my-skills",
        "./my-skills",
        "folder/subfolder",
        "./folder/subfolder"
      ];
      for (const path of validPaths) {
        assert.strictEqual(
          isValidPromptFolderPath(path),
          true,
          `'${path}' must be accepted as a valid skill path (relative path).`
        );
      }
    });
    testT("accepts user home paths", async () => {
      const validPaths = [
        "~/folder",
        "~/.copilot/skills",
        "~/.claude/skills",
        "~/my-skills"
      ];
      for (const path of validPaths) {
        assert.strictEqual(
          isValidPromptFolderPath(path),
          true,
          `'${path}' must be accepted as a valid skill path (user home path).`
        );
      }
    });
    testT("accepts parent relative paths for monorepos", async () => {
      const validPaths = [
        "../folder",
        "../shared-skills",
        "../../common/skills",
        "../parent/folder"
      ];
      for (const path of validPaths) {
        assert.strictEqual(
          isValidPromptFolderPath(path),
          true,
          `'${path}' must be accepted as a valid skill path (parent relative path).`
        );
      }
    });
    testT("rejects absolute paths", async () => {
      const invalidPaths = [
        // Unix absolute paths
        "/Users/username/skills",
        "/absolute/path",
        "/usr/local/skills",
        // Windows absolute paths
        "C:\\Users\\skills",
        "D:/skills",
        "c:\\folder"
      ];
      for (const path of invalidPaths) {
        assert.strictEqual(
          isValidPromptFolderPath(path),
          false,
          `'${path}' must be rejected (absolute paths not supported for portability).`
        );
      }
    });
    testT("rejects tilde paths without path separator", async () => {
      const invalidPaths = [
        "~abc",
        "~skills",
        "~.config",
        // Windows-style backslash paths are not supported for cross-platform sharing
        "~\\folder",
        "~\\.copilot\\skills"
      ];
      for (const path of invalidPaths) {
        assert.strictEqual(
          isValidPromptFolderPath(path),
          false,
          `'${path}' must be rejected (tilde must be followed by / only, not \\).`
        );
      }
    });
    testT("rejects paths with backslashes", async () => {
      const invalidPaths = [
        "folder\\subfolder",
        ".\\skills",
        "..\\parent\\folder",
        "my\\skills\\folder"
      ];
      for (const path of invalidPaths) {
        assert.strictEqual(
          isValidPromptFolderPath(path),
          false,
          `'${path}' must be rejected (backslash paths not supported for cross-platform sharing).`
        );
      }
    });
    testT("rejects glob patterns", async () => {
      const invalidPaths = [
        "skills/*",
        "skills/**",
        "**/skills",
        "skills/*.md",
        "skills/**/*.md",
        "{skill1,skill2}",
        "skill[1,2,3]",
        "skills?",
        "./skills/*",
        "~/skills/**"
      ];
      for (const path of invalidPaths) {
        assert.strictEqual(
          isValidPromptFolderPath(path),
          false,
          `'${path}' must be rejected (glob patterns not supported for performance).`
        );
      }
    });
    testT("rejects empty or whitespace paths", async () => {
      const invalidPaths = [
        "",
        "   ",
        "	",
        "\n"
      ];
      for (const path of invalidPaths) {
        assert.strictEqual(
          isValidPromptFolderPath(path),
          false,
          `'${path}' must be rejected (empty or whitespace only).`
        );
      }
    });
    testT("handles paths with spaces", async () => {
      const validPaths = [
        "my skills",
        "./my skills/folder",
        "~/my skills",
        "../shared skills"
      ];
      for (const path of validPaths) {
        assert.strictEqual(
          isValidPromptFolderPath(path),
          true,
          `'${path}' must be accepted (paths with spaces are valid).`
        );
      }
    });
  });
  suite("hasGlobPattern", () => {
    testT("detects single wildcard", async () => {
      const pathsWithGlob = [
        "skills/*",
        "my-skills/*",
        "*.md",
        "*/folder"
      ];
      for (const path of pathsWithGlob) {
        assert.strictEqual(
          hasGlobPattern(path),
          true,
          `'${path}' must be detected as having a glob pattern.`
        );
      }
    });
    testT("detects double wildcard", async () => {
      const pathsWithGlob = [
        "skills/**",
        "**/skills",
        "**/*.md",
        "a/**/b"
      ];
      for (const path of pathsWithGlob) {
        assert.strictEqual(
          hasGlobPattern(path),
          true,
          `'${path}' must be detected as having a glob pattern.`
        );
      }
    });
    testT("returns false for paths without wildcards", async () => {
      const pathsWithoutGlob = [
        "skills",
        "./skills/folder",
        "~/skills",
        "../parent/folder",
        ".github/prompts"
      ];
      for (const path of pathsWithoutGlob) {
        assert.strictEqual(
          hasGlobPattern(path),
          false,
          `'${path}' must not be detected as having a glob pattern.`
        );
      }
    });
  });
  suite("getConfigBasedSourceFolders", () => {
    testT("gets unambiguous list of folders", async () => {
      setLocations({
        ".github/prompts": true,
        "/Users/**/repos/**": true,
        "gen/text/**": true,
        "gen/text/nested/*.prompt.md": true,
        "general/*": true,
        "/Users/legomushroom/repos/vscode/my-prompts": true,
        "/Users/legomushroom/repos/vscode/your-prompts/*.md": true,
        "/Users/legomushroom/repos/prompts/shared-prompts/*": true
      });
      setWorkspaceFolders([
        "/Users/legomushroom/repos/vscode",
        "/Users/legomushroom/repos/prompts"
      ]);
      await mockFiles(fileService, []);
      const locator = instantiationService.createInstance(PromptFilesLocator);
      assertOutcome(
        await locator.getConfigBasedSourceFolders(PromptsType.prompt),
        [
          "/Users/legomushroom/repos/vscode/.github/prompts",
          "/Users/legomushroom/repos/prompts/.github/prompts",
          "/Users/legomushroom/repos/vscode/gen/text/nested",
          "/Users/legomushroom/repos/prompts/gen/text/nested",
          "/Users/legomushroom/repos/vscode/general",
          "/Users/legomushroom/repos/prompts/general",
          "/Users/legomushroom/repos/vscode/my-prompts",
          "/Users/legomushroom/repos/vscode/your-prompts",
          "/Users/legomushroom/repos/prompts/shared-prompts"
        ],
        "Must find correct prompts."
      );
    });
  });
  suite("findAgentMDsInWorkspace", () => {
    testT("finds AGENTS.md files using FileSearchProvider", async () => {
      setWorkspaceFolders(["/Users/legomushroom/repos/workspace"]);
      await mockFiles(fileService, [
        {
          path: "/Users/legomushroom/repos/workspace/AGENTS.md",
          contents: ["# Root agents"]
        },
        {
          path: "/Users/legomushroom/repos/workspace/src/AGENTS.md",
          contents: ["# Src agents"]
        }
      ]);
      const locator = instantiationService.createInstance(PromptFilesLocator);
      const result = (await locator.findAgentMDsInWorkspace(CancellationToken.None)).map((f) => f.uri);
      assertOutcome(
        result,
        [
          "/Users/legomushroom/repos/workspace/AGENTS.md",
          "/Users/legomushroom/repos/workspace/src/AGENTS.md"
        ],
        "Must find all AGENTS.md files using search service."
      );
    });
    testT("finds AGENTS.md files using file service fallback", async () => {
      setWorkspaceFolders(["/Users/legomushroom/repos/workspace"]);
      await mockFiles(fileService, [
        {
          path: "/Users/legomushroom/repos/workspace/AGENTS.md",
          contents: ["# Root agents"]
        },
        {
          path: "/Users/legomushroom/repos/workspace/src/AGENTS.md",
          contents: ["# Src agents"]
        },
        {
          path: "/Users/legomushroom/repos/workspace/src/nested/AGENTS.md",
          contents: ["# Nested agents"]
        }
      ]);
      instantiationService.stub(ISearchService, {
        schemeHasFileSearchProvider: () => false,
        async fileSearch() {
          throw new Error("FileSearchProvider not available");
        }
      });
      const locator = instantiationService.createInstance(PromptFilesLocator);
      const result = (await locator.findAgentMDsInWorkspace(CancellationToken.None)).map((f) => f.uri);
      assertOutcome(
        result,
        [
          "/Users/legomushroom/repos/workspace/AGENTS.md",
          "/Users/legomushroom/repos/workspace/src/AGENTS.md",
          "/Users/legomushroom/repos/workspace/src/nested/AGENTS.md"
        ],
        "Must find all AGENTS.md files using file service fallback."
      );
    });
    testT("handles cancellation token in file service fallback", async () => {
      setWorkspaceFolders(["/Users/legomushroom/repos/workspace"]);
      await mockFiles(fileService, [
        {
          path: "/Users/legomushroom/repos/workspace/AGENTS.md",
          contents: ["# Root agents"]
        }
      ]);
      instantiationService.stub(ISearchService, {
        schemeHasFileSearchProvider: () => false,
        async fileSearch() {
          throw new Error("FileSearchProvider not available");
        }
      });
      const locator = instantiationService.createInstance(PromptFilesLocator);
      const source = new CancellationTokenSource();
      source.cancel();
      const result = (await locator.findAgentMDsInWorkspace(source.token)).map((f) => f.uri);
      assertOutcome(
        result,
        [],
        "Must return empty array when cancelled."
      );
    });
  });
  suite("getWorkspaceFolderRoots", () => {
    let locator;
    const setWorkspaceFoldersForRoots = (paths) => {
      setWorkspaceFolders(paths);
      locator = instantiationService.createInstance(PromptFilesLocator);
    };
    testT("returns only workspace folder when it has .git", async () => {
      setWorkspaceFoldersForRoots(["/repos/my-project"]);
      await mockFiles(fileService, [
        { path: "/repos/my-project/.git/HEAD", contents: ["ref: refs/heads/main"] },
        { path: "/repos/my-project/src/index.ts", contents: ["export {};"] }
      ]);
      const roots = await locator.getWorkspaceFolderRoots(true);
      assert.deepStrictEqual(
        roots.map((r) => r.path),
        ["/repos/my-project"],
        "Should only return the workspace folder itself when it has .git"
      );
    });
    testT("walks up to parent with .git when workspace folder has no .git", async () => {
      setWorkspaceFoldersForRoots(["/repos/monorepo/packages/my-app"]);
      await mockFiles(fileService, [
        { path: "/repos/monorepo/.git/HEAD", contents: ["ref: refs/heads/main"] },
        { path: "/repos/monorepo/packages/my-app/src/index.ts", contents: ["export {};"] }
      ]);
      workspaceTrustService.setTrustedUris([URI.file("/repos/monorepo")]);
      const roots = await locator.getWorkspaceFolderRoots(true);
      assert.deepStrictEqual(
        roots.map((r) => r.path).sort(),
        [
          "/repos/monorepo",
          "/repos/monorepo/packages",
          "/repos/monorepo/packages/my-app"
        ].sort(),
        "Should include workspace folder and all parents up to the one with .git"
      );
    });
    testT("does not walk up when includeParents is false", async () => {
      setWorkspaceFoldersForRoots(["/repos/monorepo/packages/my-app"]);
      await mockFiles(fileService, [
        { path: "/repos/monorepo/.git/HEAD", contents: ["ref: refs/heads/main"] },
        { path: "/repos/monorepo/packages/my-app/src/index.ts", contents: ["export {};"] }
      ]);
      workspaceTrustService.setTrustedUris([URI.file("/repos/monorepo")]);
      const roots = await locator.getWorkspaceFolderRoots(false);
      assert.deepStrictEqual(
        roots.map((r) => r.path),
        ["/repos/monorepo/packages/my-app"],
        "Should only return workspace folders when includeParents is false"
      );
    });
    testT("excludes vscode-agent-host workspace folders", async () => {
      const localFolder = URI.file("/repos/local-project");
      const agentHostFolder = URI.from({ scheme: "vscode-agent-host", authority: "remote", path: "/repos/remote-project" });
      const folders = [localFolder, agentHostFolder].map((uri, index) => new class extends mock() {
        constructor() {
          super(...arguments);
          this.uri = uri;
          this.name = basename(uri);
          this.index = index;
        }
      }());
      instantiationService.stub(IWorkspaceContextService, mockWorkspaceService(folders));
      locator = instantiationService.createInstance(PromptFilesLocator);
      await mockFiles(fileService, [
        { path: "/repos/local-project/.git/HEAD", contents: ["ref: refs/heads/main"] }
      ]);
      const roots = await locator.getWorkspaceFolderRoots(true);
      assert.deepStrictEqual(
        roots.map((r) => r.toString()),
        [localFolder.toString()],
        "Should exclude vscode-agent-host workspace folders from prompt-file discovery roots"
      );
    });
    testT("returns only workspace folder when no .git is found", async () => {
      setWorkspaceFoldersForRoots(["/Users/legomushroom/my-project"]);
      await mockFiles(fileService, [
        { path: "/Users/legomushroom/my-project/src/index.ts", contents: ["export {};"] }
      ]);
      const roots = await locator.getWorkspaceFolderRoots(true);
      assert.deepStrictEqual(
        roots.map((r) => r.path),
        ["/Users/legomushroom/my-project"],
        "Should only return the workspace folder when no .git is found in any parent"
      );
    });
  });
  suite("getHookSourceFolders", () => {
    testT("returns source metadata for hook folders", async () => {
      configValues[PromptsConfig.HOOKS_LOCATION_KEY] = {
        ".github/hooks": true,
        "~/.copilot/hooks": true,
        // disable Claude paths (which are filtered out anyway)
        ".claude/settings.json": false,
        ".claude/settings.local.json": false,
        "~/.claude/settings.json": false
      };
      setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
      await mockFiles(fileService, []);
      const locator = instantiationService.createInstance(PromptFilesLocator);
      const folders = await locator.getHookSourceFolders();
      assert.deepStrictEqual(
        folders.map((f) => ({ path: f.uri.path, source: f.source, storage: f.storage })),
        [
          { path: "/Users/legomushroom/repos/vscode/.github/hooks", source: PromptFileSource.GitHubWorkspace, storage: PromptsStorage.local },
          { path: "/Users/legomushroom/.copilot/hooks", source: PromptFileSource.CopilotPersonal, storage: PromptsStorage.user }
        ]
      );
    });
    testT("excludes Claude paths", async () => {
      configValues[PromptsConfig.HOOKS_LOCATION_KEY] = {
        ".github/hooks": true,
        ".claude/settings.json": true,
        ".claude/settings.local.json": true,
        "~/.claude/settings.json": true,
        "~/.copilot/hooks": true
      };
      setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
      await mockFiles(fileService, []);
      const locator = instantiationService.createInstance(PromptFilesLocator);
      const folders = await locator.getHookSourceFolders();
      const paths = folders.map((f) => f.uri.path);
      assert.ok(!paths.some((p) => p.includes(".claude")), "Claude paths must be excluded");
      assert.deepStrictEqual(paths, [
        "/Users/legomushroom/repos/vscode/.github/hooks",
        "/Users/legomushroom/.copilot/hooks"
      ]);
    });
  });
  suite("listFiles with PromptsType.hook", () => {
    testT("only returns targeted json files, not sibling json files", async () => {
      configValues[PromptsConfig.HOOKS_LOCATION_KEY] = {
        ".claude/settings.json": true,
        ".claude/settings.local.json": true,
        "~/.claude/settings.json": true,
        ".github/hooks": true,
        "~/.copilot/hooks": true
      };
      setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
      await mockFiles(fileService, [
        // targeted files that should be found
        { path: "/Users/legomushroom/repos/vscode/.claude/settings.json", contents: ["{}"] },
        { path: "/Users/legomushroom/repos/vscode/.claude/settings.local.json", contents: ["{}"] },
        // sibling files in .claude/ that should NOT be found
        { path: "/Users/legomushroom/repos/vscode/.claude/config.json", contents: ["{}"] },
        { path: "/Users/legomushroom/repos/vscode/.claude/stats-cache.json", contents: ["{}"] },
        // hook directory files that should be found
        { path: "/Users/legomushroom/repos/vscode/.github/hooks/pre-commit.json", contents: ["{}"] }
      ]);
      const locator = instantiationService.createInstance(PromptFilesLocator);
      const files = await locator.listFiles(PromptsType.hook, PromptsStorage.local, CancellationToken.None);
      assert.deepStrictEqual(
        files.map((f) => f.path).sort(),
        [
          "/Users/legomushroom/repos/vscode/.claude/settings.json",
          "/Users/legomushroom/repos/vscode/.claude/settings.local.json",
          "/Users/legomushroom/repos/vscode/.github/hooks/pre-commit.json"
        ]
      );
    });
    testT("returns hook files from user home specific json paths", async () => {
      configValues[PromptsConfig.HOOKS_LOCATION_KEY] = {
        "~/.claude/settings.json": true,
        "~/.copilot/hooks": true
      };
      setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
      await mockFiles(fileService, [
        // targeted user file
        { path: "/Users/legomushroom/.claude/settings.json", contents: ["{}"] },
        // sibling files that should NOT be found
        { path: "/Users/legomushroom/.claude/config.json", contents: ["{}"] },
        { path: "/Users/legomushroom/.claude/stats-cache.json", contents: ["{}"] },
        // hook directory files
        { path: "/Users/legomushroom/.copilot/hooks/my-hook.json", contents: ["{}"] }
      ]);
      const locator = instantiationService.createInstance(PromptFilesLocator);
      const files = await locator.listFiles(PromptsType.hook, PromptsStorage.user, CancellationToken.None);
      assert.deepStrictEqual(
        files.map((f) => f.path).sort(),
        [
          "/Users/legomushroom/.claude/settings.json",
          "/Users/legomushroom/.copilot/hooks/my-hook.json"
        ]
      );
    });
  });
  suite("getSourceDescription", () => {
    test("returns descriptions for all known folder sources", () => {
      const folderSources = [
        PromptFileSource.AgentsWorkspace,
        PromptFileSource.AgentsPersonal,
        PromptFileSource.GitHubWorkspace,
        PromptFileSource.CopilotPersonal,
        PromptFileSource.ClaudeWorkspace,
        PromptFileSource.ClaudeWorkspaceLocal,
        PromptFileSource.ClaudePersonal,
        PromptFileSource.UserData,
        PromptFileSource.ConfigWorkspace,
        PromptFileSource.ConfigPersonal
      ];
      for (const source of folderSources) {
        const description = getSourceDescription(source);
        assert.ok(typeof description === "string" && description.length > 0, `Expected a description for ${source}`);
      }
    });
    test("returns undefined for extension/plugin sources", () => {
      assert.strictEqual(getSourceDescription(PromptFileSource.ExtensionContribution), void 0);
      assert.strictEqual(getSourceDescription(PromptFileSource.ExtensionAPI), void 0);
      assert.strictEqual(getSourceDescription(PromptFileSource.Plugin), void 0);
    });
  });
});
function assertOutcome(actual, expected, message) {
  assert.deepStrictEqual(actual.map((uri) => uri.path), expected, message);
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxccHJvbXB0U3ludGF4XFx1dGlsc1xccHJvbXB0RmlsZXNMb2NhdG9yLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgbWF0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCByZWxhdGl2ZVBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcywgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZSwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVNYXRjaCwgSUZpbGVRdWVyeSwgSVNlYXJjaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByb21wdHNDb25maWcgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9jb25maWcuanMnO1xuaW1wb3J0IHsgZ2V0U291cmNlRGVzY3JpcHRpb24sIFByb21wdEZpbGVTb3VyY2UsIFByb21wdHNUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBoYXNHbG9iUGF0dGVybiwgaXNWYWxpZEdsb2IsIGlzVmFsaWRQcm9tcHRGb2xkZXJQYXRoLCBQcm9tcHRGaWxlc0xvY2F0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3V0aWxzL3Byb21wdEZpbGVzTG9jYXRvci5qcyc7XG5pbXBvcnQgeyBtb2NrRmlsZXMgfSBmcm9tICcuLi90ZXN0VXRpbHMvbW9ja0ZpbGVzeXN0ZW0uanMnO1xuaW1wb3J0IHsgbW9ja1NlcnZpY2UgfSBmcm9tICcuL21vY2suanMnO1xuaW1wb3J0IHsgVGVzdFVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsIFRlc3RXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IFByb21wdHNTdG9yYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuXG4vKipcbiAqIE1vY2tlZCBpbnN0YW5jZSBvZiB7QGxpbmsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlfS5cbiAqL1xuZnVuY3Rpb24gbW9ja0NvbmZpZ1NlcnZpY2UoY29uZmlnVmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IElDb25maWd1cmF0aW9uU2VydmljZSB7XG5cdHJldHVybiBtb2NrU2VydmljZTxJQ29uZmlndXJhdGlvblNlcnZpY2U+KHtcblx0XHRnZXRWYWx1ZShrZXk/OiBzdHJpbmcgfCBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcykge1xuXHRcdFx0Ly8gSGFuZGxlIG9iamVjdCBjb25maWd1cmF0aW9uIG92ZXJyaWRlcyAoZS5nLiwgZm9yIGZpbGUgZXhjbHVkZSBwYXR0ZXJucylcblx0XHRcdGlmICh0eXBlb2Yga2V5ID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRyZXR1cm4ge307XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mIGtleSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0YXNzZXJ0LmZhaWwoYFVuc3VwcG9ydGVkIGNvbmZpZ3VyYXRpb24ga2V5ICcke2tleX0nLmApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbmZpZ1ZhbHVlcy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG5cdFx0XHRcdHJldHVybiBjb25maWdWYWx1ZXNba2V5XTtcblx0XHRcdH1cblx0XHRcdGFzc2VydC5mYWlsKGBVbnN1cHBvcnRlZCBjb25maWd1cmF0aW9uIGtleSAnJHtrZXl9Jy5gKTtcblx0XHR9LFxuXHR9KTtcbn1cblxuLyoqXG4gKiBNb2NrZWQgaW5zdGFuY2Ugb2Yge0BsaW5rIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZX0uXG4gKi9cbmZ1bmN0aW9uIG1vY2tXb3Jrc3BhY2VTZXJ2aWNlKGZvbGRlcnM6IElXb3Jrc3BhY2VGb2xkZXJbXSk6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB7XG5cdHJldHVybiBtb2NrU2VydmljZTxJV29ya3NwYWNlQ29udGV4dFNlcnZpY2U+KHtcblx0XHRnZXRXb3Jrc3BhY2UoKTogSVdvcmtzcGFjZSB7XG5cdFx0XHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya3NwYWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgZm9sZGVycyA9IGZvbGRlcnM7XG5cdFx0XHR9O1xuXHRcdH0sXG5cdFx0Z2V0V29ya3NwYWNlRm9sZGVyKCk6IElXb3Jrc3BhY2VGb2xkZXIgfCBudWxsIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHR9KTtcbn1cblxuZnVuY3Rpb24gdGVzdFQobmFtZTogc3RyaW5nLCBmbjogKCkgPT4gUHJvbWlzZTx2b2lkPik6IE1vY2hhLlRlc3Qge1xuXHRyZXR1cm4gdGVzdChuYW1lLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGZuKSk7XG59XG5cbnN1aXRlKCdQcm9tcHRGaWxlc0xvY2F0b3InLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlO1xuXHRjb25zdCBjb25maWdWYWx1ZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG5cdGxldCB3b3Jrc3BhY2VUcnVzdFNlcnZpY2U6IFRlc3RXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlO1xuXG5cdC8vIFNldHMgYWxsIHByb21wdCBmaWxlIGxvY2F0aW9uIGNvbmZpZyBrZXlzIHRvIHRoZSBzYW1lIHZhbHVlXG5cdGNvbnN0IHNldExvY2F0aW9ucyA9ICh2YWx1ZTogdW5rbm93bikgPT4ge1xuXHRcdGNvbmZpZ1ZhbHVlc1tQcm9tcHRzQ29uZmlnLlBST01QVF9MT0NBVElPTlNfS0VZXSA9IHZhbHVlO1xuXHRcdGNvbmZpZ1ZhbHVlc1tQcm9tcHRzQ29uZmlnLklOU1RSVUNUSU9OU19MT0NBVElPTl9LRVldID0gdmFsdWU7XG5cdFx0Y29uZmlnVmFsdWVzW1Byb21wdHNDb25maWcuTU9ERV9MT0NBVElPTl9LRVldID0gdmFsdWU7XG5cdFx0Y29uZmlnVmFsdWVzW1Byb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWV0gPSB2YWx1ZTtcblx0fTtcblxuXHQvLyBTdHVicyB3b3Jrc3BhY2UgY29udGV4dCBzZXJ2aWNlIHdpdGggdGhlIGdpdmVuIGZvbGRlciBwYXRoc1xuXHRjb25zdCBzZXRXb3Jrc3BhY2VGb2xkZXJzID0gKHBhdGhzOiBzdHJpbmdbXSkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcnMgPSBwYXRocy5tYXAoKHBhdGgsIGluZGV4KSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZShwYXRoKTtcblx0XHRcdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3Jrc3BhY2VGb2xkZXI+KCkge1xuXHRcdFx0XHRvdmVycmlkZSB1cmkgPSB1cmk7XG5cdFx0XHRcdG92ZXJyaWRlIG5hbWUgPSBiYXNlbmFtZSh1cmkpO1xuXHRcdFx0XHRvdmVycmlkZSBpbmRleCA9IGluZGV4O1xuXHRcdFx0fTtcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgbW9ja1dvcmtzcGFjZVNlcnZpY2Uod29ya3NwYWNlRm9sZGVycykpO1xuXHR9O1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZpbGVTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgZmlsZVN5c3RlbVByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmZpbGUsIGZpbGVTeXN0ZW1Qcm92aWRlcikpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cblx0XHR3b3Jrc3BhY2VUcnVzdFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIHdvcmtzcGFjZVRydXN0U2VydmljZSk7XG5cblx0XHQvLyBSZXNldCBjb25maWcgdmFsdWVzIHRvIGRlZmF1bHRzXG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoY29uZmlnVmFsdWVzKSkge1xuXHRcdFx0ZGVsZXRlIGNvbmZpZ1ZhbHVlc1trZXldO1xuXHRcdH1cblx0XHRPYmplY3QuYXNzaWduKGNvbmZpZ1ZhbHVlcywge1xuXHRcdFx0J2V4cGxvcmVyLmV4Y2x1ZGVHaXRJZ25vcmUnOiBmYWxzZSxcblx0XHRcdCdmaWxlcy5leGNsdWRlJzoge30sXG5cdFx0XHQnc2VhcmNoLmV4Y2x1ZGUnOiB7fSxcblx0XHRcdFtQcm9tcHRzQ29uZmlnLlVTRV9DVVNUT01JWkFUSU9OU19JTl9QQVJFTlRfUkVQT1NdOiBmYWxzZSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgbW9ja0NvbmZpZ1NlcnZpY2UoY29uZmlnVmFsdWVzKSk7XG5cblx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFtdKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSwge30gYXMgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckRhdGFQcm9maWxlU2VydmljZSwgbmV3IFRlc3RVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlYXJjaFNlcnZpY2UsIHtcblx0XHRcdHNjaGVtZUhhc0ZpbGVTZWFyY2hQcm92aWRlcihzY2hlbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0sXG5cdFx0XHRhc3luYyBmaWxlU2VhcmNoKHF1ZXJ5OiBJRmlsZVF1ZXJ5KSB7XG5cdFx0XHRcdGNvbnN0IGZpbmRGaWxlc0luTG9jYXRpb24gPSBhc3luYyAobG9jYXRpb246IFVSSSwgcmVzdWx0czogVVJJW10gPSBbXSkgPT4ge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCByZXNvbHZlID0gYXdhaXQgZmlsZVNlcnZpY2UucmVzb2x2ZShsb2NhdGlvbik7XG5cdFx0XHRcdFx0XHRpZiAocmVzb2x2ZS5pc0ZpbGUpIHtcblx0XHRcdFx0XHRcdFx0cmVzdWx0cy5wdXNoKHJlc29sdmUucmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChyZXNvbHZlLmlzRGlyZWN0b3J5ICYmIHJlc29sdmUuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiByZXNvbHZlLmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgZmluZEZpbGVzSW5Mb2NhdGlvbihjaGlsZC5yZXNvdXJjZSwgcmVzdWx0cyk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0cztcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0czogSUZpbGVNYXRjaFtdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgZm9sZGVyUXVlcnkgb2YgcXVlcnkuZm9sZGVyUXVlcmllcykge1xuXHRcdFx0XHRcdGNvbnN0IGFsbEZpbGVzID0gYXdhaXQgZmluZEZpbGVzSW5Mb2NhdGlvbihmb2xkZXJRdWVyeS5mb2xkZXIpO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgYWxsRmlsZXMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHBhdGhJbkZvbGRlciA9IHJlbGF0aXZlUGF0aChmb2xkZXJRdWVyeS5mb2xkZXIsIHJlc291cmNlKSA/PyAnJztcblx0XHRcdFx0XHRcdGlmIChxdWVyeS5maWxlUGF0dGVybiA9PT0gdW5kZWZpbmVkIHx8IG1hdGNoKHF1ZXJ5LmZpbGVQYXR0ZXJuLCBwYXRoSW5Gb2xkZXIpKSB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdHMucHVzaCh7IHJlc291cmNlIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyByZXN1bHRzLCBtZXNzYWdlczogW10gfTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQYXRoU2VydmljZSwge1xuXHRcdFx0dXNlckhvbWUob3B0aW9ucz86IHsgcHJlZmVyTG9jYWw6IGJvb2xlYW4gfSk6IFVSSSB8IFByb21pc2U8VVJJPiB7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvVXNlcnMvbGVnb211c2hyb29tJyk7XG5cdFx0XHRcdGlmIChvcHRpb25zPy5wcmVmZXJMb2NhbCkge1xuXHRcdFx0XHRcdHJldHVybiB1cmk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1cmkpO1xuXHRcdFx0fVxuXHRcdH0gYXMgSVBhdGhTZXJ2aWNlKTtcblx0fSk7XG5cblx0c3VpdGUoJ2VtcHR5IHdvcmtzcGFjZScsICgpID0+IHtcblx0XHRjb25zdCBFTVBUWV9XT1JLU1BBQ0U6IHN0cmluZ1tdID0gW107XG5cblx0XHRzdWl0ZSgnZW1wdHkgZmlsZXN5c3RlbScsICgpID0+IHtcblx0XHRcdHRlc3RUKCdubyBjb25maWcgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldExvY2F0aW9ucyh1bmRlZmluZWQpO1xuXHRcdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKEVNUFRZX1dPUktTUEFDRSk7XG5cdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW10pO1xuXHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdGF3YWl0IGxvY2F0b3IubGlzdEZpbGVzKFByb21wdHNUeXBlLnByb21wdCwgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XHRcdFtdLFxuXHRcdFx0XHRcdCdObyBwcm9tcHRzIG11c3QgYmUgZm91bmQuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0VCgnb2JqZWN0IGNvbmZpZyB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0TG9jYXRpb25zKHtcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzLyc6IHRydWUsXG5cdFx0XHRcdFx0Jy90bXAvcHJvbXB0cy8nOiBmYWxzZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoRU1QVFlfV09SS1NQQUNFKTtcblx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXSk7XG5cdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdFx0YXdhaXQgbG9jYXRvci5saXN0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRcdFx0W10sXG5cdFx0XHRcdFx0J05vIHByb21wdHMgbXVzdCBiZSBmb3VuZC4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3RUKCdhcnJheSBjb25maWcgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldExvY2F0aW9ucyhbXG5cdFx0XHRcdFx0J3JlbGF0aXZlL3BhdGgvdG8vcHJvbXB0cy8nLFxuXHRcdFx0XHRcdCcvYWJzL3BhdGgnLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhFTVBUWV9XT1JLU1BBQ0UpO1xuXHRcdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtdKTtcblx0XHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0XHRhd2FpdCBsb2NhdG9yLmxpc3RGaWxlcyhQcm9tcHRzVHlwZS5wcm9tcHQsIFByb21wdHNTdG9yYWdlLmxvY2FsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0XHRbXSxcblx0XHRcdFx0XHQnTm8gcHJvbXB0cyBtdXN0IGJlIGZvdW5kLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdFQoJ251bGwgY29uZmlnIHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRMb2NhdGlvbnMobnVsbCk7XG5cdFx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoRU1QVFlfV09SS1NQQUNFKTtcblx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXSk7XG5cdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdFx0YXdhaXQgbG9jYXRvci5saXN0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRcdFx0W10sXG5cdFx0XHRcdFx0J05vIHByb21wdHMgbXVzdCBiZSBmb3VuZC4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3RUKCdzdHJpbmcgY29uZmlnIHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRMb2NhdGlvbnMoJy9ldGMvaG9zdHMvcHJvbXB0cycpO1xuXHRcdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKEVNUFRZX1dPUktTUEFDRSk7XG5cdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW10pO1xuXHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdGF3YWl0IGxvY2F0b3IubGlzdEZpbGVzKFByb21wdHNUeXBlLnByb21wdCwgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XHRcdFtdLFxuXHRcdFx0XHRcdCdObyBwcm9tcHRzIG11c3QgYmUgZm91bmQuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ25vbi1lbXB0eSBmaWxlc3lzdGVtJywgKCkgPT4ge1xuXHRcdFx0dGVzdFQoJ2NvcmUgbG9naWMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldExvY2F0aW9ucyh7XG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cyc6IHRydWUsXG5cdFx0XHRcdFx0Jy90bXAvcHJvbXB0cy8nOiB0cnVlLFxuXHRcdFx0XHRcdCcvYWJzb2x1dGUvcGF0aC9wcm9tcHRzJzogZmFsc2UsXG5cdFx0XHRcdFx0Jy5jb3BpbG90L3Byb21wdHMnOiB0cnVlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhFTVBUWV9XT1JLU1BBQ0UpO1xuXHRcdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL3Rlc3QucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ0hlbGxvLCBXb3JsZCEnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvcmVmYWN0b3ItdGVzdHMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ3NvbWUgZmlsZSBjb250ZW50IGdvZXMgaGVyZSddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy90bXAvcHJvbXB0cy90cmFuc2xhdGUudG8tcnVzdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnc29tZSBtb3JlIHJhbmRvbSBmaWxlIGNvbnRlbnRzJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL2Fic29sdXRlL3BhdGgvcHJvbXB0cy9zb21lLXByb21wdC1maWxlLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydoZXkgaGV5IGhleSddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdGF3YWl0IGxvY2F0b3IubGlzdEZpbGVzKFByb21wdHNUeXBlLnByb21wdCwgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvdGVzdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9yZWZhY3Rvci10ZXN0cy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Jy90bXAvcHJvbXB0cy90cmFuc2xhdGUudG8tcnVzdC5wcm9tcHQubWQnXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHQnTXVzdCBmaW5kIGNvcnJlY3QgcHJvbXB0cy4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHN1aXRlKCdhYnNvbHV0ZScsICgpID0+IHtcblx0XHRcdFx0dGVzdFQoJ3dpbGQgY2FyZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBzZXR0aW5ncyA9IFtcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKicsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqLyoubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqLyonLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvKionLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvKiovKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvKiovKicsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy8qKi8qLm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi90ZXh0LyoqJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi90ZXh0LyoqLyonLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqL3RleHQvKiovKi5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovdGV4dC8qKi8qLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0LyoqJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvKiovKicsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0LyoqLyoubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC8qKi8qLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XTtcblxuXHRcdFx0XHRcdGZvciAoY29uc3Qgc2V0dGluZyBvZiBzZXR0aW5ncykge1xuXHRcdFx0XHRcdFx0c2V0TG9jYXRpb25zKHsgW3NldHRpbmddOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhFTVBUWV9XT1JLU1BBQ0UpO1xuXHRcdFx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJvYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcmFib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC9yZWFkbWUubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ25vbiBwcm9tcHQgZmlsZSddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0XHRcdFx0YXdhaXQgbG9jYXRvci5saXN0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdCdNdXN0IGZpbmQgY29ycmVjdCBwcm9tcHRzLicsXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdFQoYHNwZWNpZmljYCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRlc3RTZXR0aW5ncyA9IFtcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqLypzcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqLypzcGVjaWZpYyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi8qc3BlY2lmaWMqLm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi9zcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqL3Vuc3BlY2lmaWMqLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovbmVzdGVkL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi9uZXN0ZWQvdW5zcGVjaWZpYyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi9uZXN0ZWQvKnNwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovKnNwZWMqLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovKnNwZWMqJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi8qc3BlYyoubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqL2RlcHMvKiovKnNwZWMqLm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi90ZXh0LyoqLypzcGVjKi5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC8qc3BlYyonLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvKnNwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy8qKi8qc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzLyoqL3NwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzLyoqL3Vuc3BlY2lmaWMqLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy8qKi9zcGVjaWZpYyoubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy8qKi91bnNwZWNpZmljKi5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy8qKi9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy8qKi91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy8qKi91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvKiovc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvKiovdW5zcGVjaWZpYzEqLm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvKiovdW5zcGVjaWZpYzIqLm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvKiovKnNwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0LyoqL3NwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvKiovdW5zcGVjaWZpYyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvKiovc3BlY2lmaWMqLm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC8qKi91bnNwZWNpZmljKi5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0LyoqL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvKiovdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC8qKi91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC8qKi9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0LyoqL3Vuc3BlY2lmaWMxKi5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvKiovdW5zcGVjaWZpYzIqLm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XTtcblxuXHRcdFx0XHRcdGZvciAoY29uc3Qgc2V0dGluZ3Mgb2YgdGVzdFNldHRpbmdzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB2c2NvZGVTZXR0aW5nczogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4gPSB7fTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3Qgc2V0dGluZyBvZiBzZXR0aW5ncykge1xuXHRcdFx0XHRcdFx0XHR2c2NvZGVTZXR0aW5nc1tzZXR0aW5nXSA9IHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHNldExvY2F0aW9ucyh2c2NvZGVTZXR0aW5ncyk7XG5cdFx0XHRcdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKEVNUFRZX1dPUktTUEFDRSk7XG5cdFx0XHRcdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvZGVmYXVsdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCByb2JvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJhd2JvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3JlYWRtZS5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnbm9uIHByb21wdCBmaWxlJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdFx0XHRhd2FpdCBsb2NhdG9yLmxpc3RGaWxlcyhQcm9tcHRzVHlwZS5wcm9tcHQsIFByb21wdHNTdG9yYWdlLmxvY2FsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHQnTXVzdCBmaW5kIGNvcnJlY3QgcHJvbXB0cy4nLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzaW5nbGUtcm9vdCB3b3Jrc3BhY2UnLCAoKSA9PiB7XG5cdFx0c3VpdGUoJ2dsb2IgcGF0dGVybicsICgpID0+IHtcblx0XHRcdHN1aXRlKCdyZWxhdGl2ZScsICgpID0+IHtcblx0XHRcdFx0dGVzdFQoJ3dpbGQgY2FyZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCB0ZXN0U2V0dGluZ3MgPSBbXG5cdFx0XHRcdFx0XHQnKionLFxuXHRcdFx0XHRcdFx0JyoqLyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcqKi8qLm1kJyxcblx0XHRcdFx0XHRcdCcqKi8qJyxcblx0XHRcdFx0XHRcdCdkZXBzLyoqJyxcblx0XHRcdFx0XHRcdCdkZXBzLyoqLyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCdkZXBzLyoqLyonLFxuXHRcdFx0XHRcdFx0J2RlcHMvKiovKi5tZCcsXG5cdFx0XHRcdFx0XHQnKiovdGV4dC8qKicsXG5cdFx0XHRcdFx0XHQnKiovdGV4dC8qKi8qJyxcblx0XHRcdFx0XHRcdCcqKi90ZXh0LyoqLyoubWQnLFxuXHRcdFx0XHRcdFx0JyoqL3RleHQvKiovKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0J2RlcHMvdGV4dC8qKicsXG5cdFx0XHRcdFx0XHQnZGVwcy90ZXh0LyoqLyonLFxuXHRcdFx0XHRcdFx0J2RlcHMvdGV4dC8qKi8qLm1kJyxcblx0XHRcdFx0XHRcdCdkZXBzL3RleHQvKiovKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdF07XG5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmcgb2YgdGVzdFNldHRpbmdzKSB7XG5cdFx0XHRcdFx0XHRzZXRMb2NhdGlvbnMoeyBbc2V0dGluZ106IHRydWUgfSk7XG5cdFx0XHRcdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFsnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnXSk7XG5cdFx0XHRcdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcm9ib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCByYWJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3JlYWRtZS5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnbm9uIHByb21wdCBmaWxlJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdFx0XHRhd2FpdCBsb2NhdG9yLmxpc3RGaWxlcyhQcm9tcHRzVHlwZS5wcm9tcHQsIFByb21wdHNTdG9yYWdlLmxvY2FsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0J011c3QgZmluZCBjb3JyZWN0IHByb21wdHMuJyxcblx0XHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3RUKGBzcGVjaWZpY2AsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCB0ZXN0U2V0dGluZ3MgPSBbXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcqKi8qc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcqKi8qc3BlY2lmaWMqLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnKiovKnNwZWNpZmljKi5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnKiovc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdFx0JyoqL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcqKi91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0JyoqL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcqKi91bnNwZWNpZmljKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0JyoqL25lc3RlZC9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnKiovbmVzdGVkL3Vuc3BlY2lmaWMqLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnKiovbmVzdGVkLypzcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0JyoqLypzcGVjKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0JyoqLypzcGVjKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnKiovKnNwZWMqLm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcqKi9kZXBzLyoqLypzcGVjKi5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnKiovdGV4dC8qKi8qc3BlYyoubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0J2RlcHMvdGV4dC9uZXN0ZWQvKnNwZWMqJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCdkZXBzL3RleHQvbmVzdGVkLypzcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0J2RlcHMvKiovKnNwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnZGVwcy8qKi9zcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XHQnZGVwcy8qKi91bnNwZWNpZmljKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0J2RlcHMvKiovc3BlY2lmaWMqLm1kJyxcblx0XHRcdFx0XHRcdFx0J2RlcHMvKiovdW5zcGVjaWZpYyoubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0J2RlcHMvKiovc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0J2RlcHMvKiovdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0J2RlcHMvKiovdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCdkZXBzLyoqL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCdkZXBzLyoqL3Vuc3BlY2lmaWMxKi5tZCcsXG5cdFx0XHRcdFx0XHRcdCdkZXBzLyoqL3Vuc3BlY2lmaWMyKi5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnZGVwcy90ZXh0LyoqLypzcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0J2RlcHMvdGV4dC8qKi9zcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XHQnZGVwcy90ZXh0LyoqL3Vuc3BlY2lmaWMqLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnZGVwcy90ZXh0LyoqL3NwZWNpZmljKi5tZCcsXG5cdFx0XHRcdFx0XHRcdCdkZXBzL3RleHQvKiovdW5zcGVjaWZpYyoubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0J2RlcHMvdGV4dC8qKi9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnZGVwcy90ZXh0LyoqL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCdkZXBzL3RleHQvKiovdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCdkZXBzL3RleHQvKiovc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0J2RlcHMvdGV4dC8qKi91bnNwZWNpZmljMSoubWQnLFxuXHRcdFx0XHRcdFx0XHQnZGVwcy90ZXh0LyoqL3Vuc3BlY2lmaWMyKi5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdF07XG5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmdzIG9mIHRlc3RTZXR0aW5ncykge1xuXHRcdFx0XHRcdFx0Y29uc3QgdnNjb2RlU2V0dGluZ3M6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+ID0ge307XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmcgb2Ygc2V0dGluZ3MpIHtcblx0XHRcdFx0XHRcdFx0dnNjb2RlU2V0dGluZ3Nbc2V0dGluZ10gPSB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRzZXRMb2NhdGlvbnModnNjb2RlU2V0dGluZ3MpO1xuXHRcdFx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlJ10pO1xuXHRcdFx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL2RlZmF1bHQucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcm9ib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCByYXdib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC9yZWFkbWUubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ25vbiBwcm9tcHQgZmlsZSddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0XHRcdFx0YXdhaXQgbG9jYXRvci5saXN0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0J011c3QgZmluZCBjb3JyZWN0IHByb21wdHMuJyxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRzdWl0ZSgnYWJzb2x1dGUnLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3RUKCd3aWxkIGNhcmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgc2V0dGluZ3MgPSBbXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKionLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqLyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi8qLm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi8qJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzLyoqJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzLyoqLyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzLyoqLyonLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvKiovKi5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovdGV4dC8qKicsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovdGV4dC8qKi8qJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi90ZXh0LyoqLyoubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqL3RleHQvKiovKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC8qKicsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0LyoqLyonLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC8qKi8qLm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvKiovKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdF07XG5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmcgb2Ygc2V0dGluZ3MpIHtcblxuXHRcdFx0XHRcdFx0c2V0TG9jYXRpb25zKHsgW3NldHRpbmddOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlJ10pO1xuXHRcdFx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJvYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcmFib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC9yZWFkbWUubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ25vbiBwcm9tcHQgZmlsZSddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0XHRcdFx0YXdhaXQgbG9jYXRvci5saXN0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdCdNdXN0IGZpbmQgY29ycmVjdCBwcm9tcHRzLicsXG5cdFx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0ZXN0VChgc3BlY2lmaWNgLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdGVzdFNldHRpbmdzID0gW1xuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovKnNwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovKnNwZWNpZmljKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqLypzcGVjaWZpYyoubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqL3NwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovdW5zcGVjaWZpYyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi9uZXN0ZWQvc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqL25lc3RlZC91bnNwZWNpZmljKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqL25lc3RlZC8qc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi8qc3BlYyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi8qc3BlYyonLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqLypzcGVjKi5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovZGVwcy8qKi8qc3BlYyoubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqL3RleHQvKiovKnNwZWMqLm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkLypzcGVjKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC8qc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzLyoqLypzcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvKiovc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvKiovdW5zcGVjaWZpYyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzLyoqL3NwZWNpZmljKi5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzLyoqL3Vuc3BlY2lmaWMqLm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzLyoqL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzLyoqL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzLyoqL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy8qKi9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy8qKi91bnNwZWNpZmljMSoubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy8qKi91bnNwZWNpZmljMioubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC8qKi8qc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvKiovc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC8qKi91bnNwZWNpZmljKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC8qKi9zcGVjaWZpYyoubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0LyoqL3Vuc3BlY2lmaWMqLm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvKiovc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC8qKi91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0LyoqL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0LyoqL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvKiovdW5zcGVjaWZpYzEqLm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC8qKi91bnNwZWNpZmljMioubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRdO1xuXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzZXR0aW5ncyBvZiB0ZXN0U2V0dGluZ3MpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHZzY29kZVNldHRpbmdzOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPiA9IHt9O1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBzZXR0aW5nIG9mIHNldHRpbmdzKSB7XG5cdFx0XHRcdFx0XHRcdHZzY29kZVNldHRpbmdzW3NldHRpbmddID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0c2V0TG9jYXRpb25zKHZzY29kZVNldHRpbmdzKTtcblx0XHRcdFx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoWycvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZSddKTtcblx0XHRcdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC9kZWZhdWx0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJvYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcmF3Ym90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvcmVhZG1lLm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydub24gcHJvbXB0IGZpbGUnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdFx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdFx0XHRcdGF3YWl0IGxvY2F0b3IubGlzdEZpbGVzKFByb21wdHNUeXBlLnByb21wdCwgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdCdNdXN0IGZpbmQgY29ycmVjdCBwcm9tcHRzLicsXG5cdFx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0VCgnY29yZSBsb2dpYycsIGFzeW5jICgpID0+IHtcblx0XHRzZXRMb2NhdGlvbnMoe1xuXHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cyc6IHRydWUsXG5cdFx0XHQnL3RtcC9wcm9tcHRzLyc6IHRydWUsXG5cdFx0XHQnL2Fic29sdXRlL3BhdGgvcHJvbXB0cyc6IGZhbHNlLFxuXHRcdFx0Jy5jb3BpbG90L3Byb21wdHMnOiB0cnVlLFxuXHRcdH0pO1xuXHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoW1xuXHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlJyxcblx0XHRdKTtcblx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdHtcblx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy90ZXN0LnByb21wdC5tZCcsXG5cdFx0XHRcdGNvbnRlbnRzOiBbJ0hlbGxvLCBXb3JsZCEnXSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvcmVmYWN0b3ItdGVzdHMucHJvbXB0Lm1kJyxcblx0XHRcdFx0Y29udGVudHM6IFsnc29tZSBmaWxlIGNvbnRlbnQgZ29lcyBoZXJlJ10sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRwYXRoOiAnL3RtcC9wcm9tcHRzL3RyYW5zbGF0ZS50by1ydXN0LnByb21wdC5tZCcsXG5cdFx0XHRcdGNvbnRlbnRzOiBbJ3NvbWUgbW9yZSByYW5kb20gZmlsZSBjb250ZW50cyddLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cGF0aDogJy9hYnNvbHV0ZS9wYXRoL3Byb21wdHMvc29tZS1wcm9tcHQtZmlsZS5wcm9tcHQubWQnLFxuXHRcdFx0XHRjb250ZW50czogWydoZXkgaGV5IGhleSddLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5jb3BpbG90L3Byb21wdHMvZGVmYXVsdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcm9ib3QhJ10sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmdpdGh1Yi9wcm9tcHRzL215LnByb21wdC5tZCcsXG5cdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdGF3YWl0IGxvY2F0b3IubGlzdEZpbGVzKFByb21wdHNUeXBlLnByb21wdCwgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0W1xuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmdpdGh1Yi9wcm9tcHRzL215LnByb21wdC5tZCcsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvdGVzdC5wcm9tcHQubWQnLFxuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL3JlZmFjdG9yLXRlc3RzLnByb21wdC5tZCcsXG5cdFx0XHRcdCcvdG1wL3Byb21wdHMvdHJhbnNsYXRlLnRvLXJ1c3QucHJvbXB0Lm1kJyxcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5jb3BpbG90L3Byb21wdHMvZGVmYXVsdC5wcm9tcHQubWQnLFxuXHRcdFx0XSxcblx0XHRcdCdNdXN0IGZpbmQgY29ycmVjdCBwcm9tcHRzLicsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdFQoJ3dpdGggZGlzYWJsZWQgYC5naXRodWIvcHJvbXB0c2AgbG9jYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0TG9jYXRpb25zKHtcblx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMnOiB0cnVlLFxuXHRcdFx0Jy90bXAvcHJvbXB0cy8nOiB0cnVlLFxuXHRcdFx0Jy9hYnNvbHV0ZS9wYXRoL3Byb21wdHMnOiBmYWxzZSxcblx0XHRcdCcuY29waWxvdC9wcm9tcHRzJzogdHJ1ZSxcblx0XHRcdCcuZ2l0aHViL3Byb21wdHMnOiBmYWxzZSxcblx0XHR9KTtcblx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFtcblx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZScsXG5cdFx0XSk7XG5cdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvdGVzdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRjb250ZW50czogWydIZWxsbywgV29ybGQhJ10sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL3JlZmFjdG9yLXRlc3RzLnByb21wdC5tZCcsXG5cdFx0XHRcdGNvbnRlbnRzOiBbJ3NvbWUgZmlsZSBjb250ZW50IGdvZXMgaGVyZSddLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cGF0aDogJy90bXAvcHJvbXB0cy90cmFuc2xhdGUudG8tcnVzdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRjb250ZW50czogWydzb21lIG1vcmUgcmFuZG9tIGZpbGUgY29udGVudHMnXSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHBhdGg6ICcvYWJzb2x1dGUvcGF0aC9wcm9tcHRzL3NvbWUtcHJvbXB0LWZpbGUucHJvbXB0Lm1kJyxcblx0XHRcdFx0Y29udGVudHM6IFsnaGV5IGhleSBoZXknXSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uY29waWxvdC9wcm9tcHRzL2RlZmF1bHQucHJvbXB0Lm1kJyxcblx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJvYm90ISddLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5naXRodWIvcHJvbXB0cy9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgYm90ISddLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5naXRodWIvcHJvbXB0cy95b3VyLnByb21wdC5tZCcsXG5cdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdGF3YWl0IGxvY2F0b3IubGlzdEZpbGVzKFByb21wdHNUeXBlLnByb21wdCwgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0W1xuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL3Rlc3QucHJvbXB0Lm1kJyxcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9yZWZhY3Rvci10ZXN0cy5wcm9tcHQubWQnLFxuXHRcdFx0XHQnL3RtcC9wcm9tcHRzL3RyYW5zbGF0ZS50by1ydXN0LnByb21wdC5tZCcsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uY29waWxvdC9wcm9tcHRzL2RlZmF1bHQucHJvbXB0Lm1kJyxcblx0XHRcdF0sXG5cdFx0XHQnTXVzdCBmaW5kIGNvcnJlY3QgcHJvbXB0cy4nLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdtdWx0aS1yb290IHdvcmtzcGFjZScsICgpID0+IHtcblx0XHRzdWl0ZSgnY29yZSBsb2dpYycsICgpID0+IHtcblx0XHRcdHRlc3RUKCd3aXRob3V0IHRvcC1sZXZlbCBgLmdpdGh1YmAgZm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRMb2NhdGlvbnMoe1xuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMnOiB0cnVlLFxuXHRcdFx0XHRcdCcvdG1wL3Byb21wdHMvJzogdHJ1ZSxcblx0XHRcdFx0XHQnL2Fic29sdXRlL3BhdGgvcHJvbXB0cyc6IGZhbHNlLFxuXHRcdFx0XHRcdCcuY29waWxvdC9wcm9tcHRzJzogZmFsc2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFtcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnLFxuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL25vZGUnLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy90ZXN0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydIZWxsbywgV29ybGQhJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL3JlZmFjdG9yLXRlc3RzLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydzb21lIGZpbGUgY29udGVudCBnb2VzIGhlcmUnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvdG1wL3Byb21wdHMvdHJhbnNsYXRlLnRvLXJ1c3QucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ3NvbWUgbW9yZSByYW5kb20gZmlsZSBjb250ZW50cyddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9hYnNvbHV0ZS9wYXRoL3Byb21wdHMvc29tZS1wcm9tcHQtZmlsZS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnaGV5IGhleSBoZXknXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uY29waWxvdC9wcm9tcHRzL3Byb21wdDEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCByb2JvdCEnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uZ2l0aHViL3Byb21wdHMvZGVmYXVsdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL25vZGUvLmNvcGlsb3QvcHJvbXB0cy9wcm9tcHQ1LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcm9ib3QhJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9ub2RlLy5naXRodWIvcHJvbXB0cy9yZWZhY3Rvci1zdGF0aWMtY2xhc3Nlcy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnZmlsZSBjb250ZW50cyddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvLmdpdGh1Yi9wcm9tcHRzL3Byb21wdC1uYW1lLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcm9ib3QhJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8uZ2l0aHViL3Byb21wdHMvbmFtZS1vZi10aGUtcHJvbXB0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcmF3IGJvdCEnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0XHRhd2FpdCBsb2NhdG9yLmxpc3RGaWxlcyhQcm9tcHRzVHlwZS5wcm9tcHQsIFByb21wdHNTdG9yYWdlLmxvY2FsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmdpdGh1Yi9wcm9tcHRzL2RlZmF1bHQucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL25vZGUvLmdpdGh1Yi9wcm9tcHRzL3JlZmFjdG9yLXN0YXRpYy1jbGFzc2VzLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL3Rlc3QucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvcmVmYWN0b3ItdGVzdHMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvdG1wL3Byb21wdHMvdHJhbnNsYXRlLnRvLXJ1c3QucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdCdNdXN0IGZpbmQgY29ycmVjdCBwcm9tcHRzLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdFQoJ3dpdGggdG9wLWxldmVsIGAuZ2l0aHViYCBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldExvY2F0aW9ucyh7XG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cyc6IHRydWUsXG5cdFx0XHRcdFx0Jy90bXAvcHJvbXB0cy8nOiB0cnVlLFxuXHRcdFx0XHRcdCcvYWJzb2x1dGUvcGF0aC9wcm9tcHRzJzogZmFsc2UsXG5cdFx0XHRcdFx0Jy5jb3BpbG90L3Byb21wdHMnOiBmYWxzZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoW1xuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZScsXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mvbm9kZScsXG5cdFx0XHRcdFx0Jy92YXIvc2hhcmVkL3Byb21wdHMnLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy90ZXN0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydIZWxsbywgV29ybGQhJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL3JlZmFjdG9yLXRlc3RzLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydzb21lIGZpbGUgY29udGVudCBnb2VzIGhlcmUnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvdG1wL3Byb21wdHMvdHJhbnNsYXRlLnRvLXJ1c3QucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ3NvbWUgbW9yZSByYW5kb20gZmlsZSBjb250ZW50cyddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9hYnNvbHV0ZS9wYXRoL3Byb21wdHMvc29tZS1wcm9tcHQtZmlsZS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnaGV5IGhleSBoZXknXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uY29waWxvdC9wcm9tcHRzL3Byb21wdDEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCByb2JvdCEnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uZ2l0aHViL3Byb21wdHMvZGVmYXVsdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL25vZGUvLmNvcGlsb3QvcHJvbXB0cy9wcm9tcHQ1LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcm9ib3QhJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9ub2RlLy5naXRodWIvcHJvbXB0cy9yZWZhY3Rvci1zdGF0aWMtY2xhc3Nlcy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnZmlsZSBjb250ZW50cyddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy92YXIvc2hhcmVkL3Byb21wdHMvLmdpdGh1Yi9wcm9tcHRzL3Byb21wdC1uYW1lLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcm9ib3QhJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL3Zhci9zaGFyZWQvcHJvbXB0cy8uZ2l0aHViL3Byb21wdHMvbmFtZS1vZi10aGUtcHJvbXB0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcmF3IGJvdCEnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0XHRhd2FpdCBsb2NhdG9yLmxpc3RGaWxlcyhQcm9tcHRzVHlwZS5wcm9tcHQsIFByb21wdHNTdG9yYWdlLmxvY2FsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmdpdGh1Yi9wcm9tcHRzL2RlZmF1bHQucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL25vZGUvLmdpdGh1Yi9wcm9tcHRzL3JlZmFjdG9yLXN0YXRpYy1jbGFzc2VzLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQnL3Zhci9zaGFyZWQvcHJvbXB0cy8uZ2l0aHViL3Byb21wdHMvcHJvbXB0LW5hbWUucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvdmFyL3NoYXJlZC9wcm9tcHRzLy5naXRodWIvcHJvbXB0cy9uYW1lLW9mLXRoZS1wcm9tcHQucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvdGVzdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9yZWZhY3Rvci10ZXN0cy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Jy90bXAvcHJvbXB0cy90cmFuc2xhdGUudG8tcnVzdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0J011c3QgZmluZCBjb3JyZWN0IHByb21wdHMuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0VCgnd2l0aCBkaXNhYmxlZCBgLmdpdGh1Yi9wcm9tcHRzYCBsb2NhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0TG9jYXRpb25zKHtcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzJzogdHJ1ZSxcblx0XHRcdFx0XHQnL3RtcC9wcm9tcHRzLyc6IHRydWUsXG5cdFx0XHRcdFx0Jy9hYnNvbHV0ZS9wYXRoL3Byb21wdHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnLmNvcGlsb3QvcHJvbXB0cyc6IGZhbHNlLFxuXHRcdFx0XHRcdCcuZ2l0aHViL3Byb21wdHMnOiBmYWxzZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoW1xuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZScsXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mvbm9kZScsXG5cdFx0XHRcdFx0Jy92YXIvc2hhcmVkL3Byb21wdHMnLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy90ZXN0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydIZWxsbywgV29ybGQhJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL3JlZmFjdG9yLXRlc3RzLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydzb21lIGZpbGUgY29udGVudCBnb2VzIGhlcmUnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvdG1wL3Byb21wdHMvdHJhbnNsYXRlLnRvLXJ1c3QucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ3NvbWUgbW9yZSByYW5kb20gZmlsZSBjb250ZW50cyddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9hYnNvbHV0ZS9wYXRoL3Byb21wdHMvc29tZS1wcm9tcHQtZmlsZS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnaGV5IGhleSBoZXknXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uY29waWxvdC9wcm9tcHRzL3Byb21wdDEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCByb2JvdCEnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uZ2l0aHViL3Byb21wdHMvZGVmYXVsdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL25vZGUvLmNvcGlsb3QvcHJvbXB0cy9wcm9tcHQ1LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcm9ib3QhJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9ub2RlLy5naXRodWIvcHJvbXB0cy9yZWZhY3Rvci1zdGF0aWMtY2xhc3Nlcy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnZmlsZSBjb250ZW50cyddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy92YXIvc2hhcmVkL3Byb21wdHMvLmdpdGh1Yi9wcm9tcHRzL3Byb21wdC1uYW1lLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcm9ib3QhJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL3Zhci9zaGFyZWQvcHJvbXB0cy8uZ2l0aHViL3Byb21wdHMvbmFtZS1vZi10aGUtcHJvbXB0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcmF3IGJvdCEnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0XHRhd2FpdCBsb2NhdG9yLmxpc3RGaWxlcyhQcm9tcHRzVHlwZS5wcm9tcHQsIFByb21wdHNTdG9yYWdlLmxvY2FsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL3Rlc3QucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvcmVmYWN0b3ItdGVzdHMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvdG1wL3Byb21wdHMvdHJhbnNsYXRlLnRvLXJ1c3QucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdCdNdXN0IGZpbmQgY29ycmVjdCBwcm9tcHRzLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdFQoJ21peGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRMb2NhdGlvbnMoe1xuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqLyp0ZXN0Kic6IHRydWUsXG5cdFx0XHRcdFx0Jy5jb3BpbG90L3Byb21wdHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnLmdpdGh1Yi9wcm9tcHRzJzogdHJ1ZSxcblx0XHRcdFx0XHQnL2Fic29sdXRlL3BhdGgvcHJvbXB0cy9zb21lLXByb21wdC1maWxlLnByb21wdC5tZCc6IHRydWUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFtcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnLFxuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL25vZGUnLFxuXHRcdFx0XHRcdCcvdmFyL3NoYXJlZC9wcm9tcHRzJyxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvdGVzdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnSGVsbG8sIFdvcmxkISddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9yZWZhY3Rvci10ZXN0cy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnc29tZSBmaWxlIGNvbnRlbnQgZ29lcyBoZXJlJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL2VsZi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnaGFhbG8hJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL3RtcC9wcm9tcHRzL3RyYW5zbGF0ZS50by1ydXN0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydzb21lIG1vcmUgcmFuZG9tIGZpbGUgY29udGVudHMnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvYWJzb2x1dGUvcGF0aC9wcm9tcHRzL3NvbWUtcHJvbXB0LWZpbGUucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ2hleSBoZXkgaGV5J10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmNvcGlsb3QvcHJvbXB0cy9wcm9tcHQxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcm9ib3QhJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmdpdGh1Yi9wcm9tcHRzL2RlZmF1bHQucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9ub2RlLy5jb3BpbG90L3Byb21wdHMvcHJvbXB0NS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJvYm90ISddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mvbm9kZS8uZ2l0aHViL3Byb21wdHMvcmVmYWN0b3Itc3RhdGljLWNsYXNzZXMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ2ZpbGUgY29udGVudHMnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvdmFyL3NoYXJlZC9wcm9tcHRzLy5naXRodWIvcHJvbXB0cy9wcm9tcHQtbmFtZS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJvYm90ISddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy92YXIvc2hhcmVkL3Byb21wdHMvLmdpdGh1Yi9wcm9tcHRzL25hbWUtb2YtdGhlLXByb21wdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJhdyBib3QhJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdFx0YXdhaXQgbG9jYXRvci5saXN0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0Ly8gYWxsIG9mIHRoZXNlIGFyZSBkdWUgdG8gdGhlIGAuZ2l0aHViL3Byb21wdHNgIHNldHRpbmdcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uZ2l0aHViL3Byb21wdHMvZGVmYXVsdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mvbm9kZS8uZ2l0aHViL3Byb21wdHMvcmVmYWN0b3Itc3RhdGljLWNsYXNzZXMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvdmFyL3NoYXJlZC9wcm9tcHRzLy5naXRodWIvcHJvbXB0cy9wcm9tcHQtbmFtZS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Jy92YXIvc2hhcmVkL3Byb21wdHMvLmdpdGh1Yi9wcm9tcHRzL25hbWUtb2YtdGhlLXByb21wdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Ly8gYWxsIG9mIHRoZXNlIGFyZSBkdWUgdG8gdGhlIGAvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqLyp0ZXN0KmAgc2V0dGluZ1xuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy90ZXN0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL3JlZmFjdG9yLXRlc3RzLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQvLyB0aGlzIG9uZSBpcyBkdWUgdG8gdGhlIHNwZWNpZmljIGAvYWJzb2x1dGUvcGF0aC9wcm9tcHRzL3NvbWUtcHJvbXB0LWZpbGUucHJvbXB0Lm1kYCBzZXR0aW5nXG5cdFx0XHRcdFx0XHQnL2Fic29sdXRlL3BhdGgvcHJvbXB0cy9zb21lLXByb21wdC1maWxlLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHQnTXVzdCBmaW5kIGNvcnJlY3QgcHJvbXB0cy4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnZ2xvYiBwYXR0ZXJuJywgKCkgPT4ge1xuXHRcdFx0c3VpdGUoJ3JlbGF0aXZlJywgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0VCgnd2lsZCBjYXJkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRlc3RTZXR0aW5ncyA9IFtcblx0XHRcdFx0XHRcdCcqKicsXG5cdFx0XHRcdFx0XHQnKiovKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0JyoqLyoubWQnLFxuXHRcdFx0XHRcdFx0JyoqLyonLFxuXHRcdFx0XHRcdFx0J2dlbiovKionLFxuXHRcdFx0XHRcdFx0J2dlbiovKiovKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0J2dlbiovKiovKicsXG5cdFx0XHRcdFx0XHQnZ2VuKi8qKi8qLm1kJyxcblx0XHRcdFx0XHRcdCcqKi9nZW4qLyoqJyxcblx0XHRcdFx0XHRcdCcqKi9nZW4qLyoqLyonLFxuXHRcdFx0XHRcdFx0JyoqL2dlbiovKiovKi5tZCcsXG5cdFx0XHRcdFx0XHQnKiovZ2VuKi8qKi8qLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQne2dlbmVyaWMsZ2VuZXJhbCxnZW59LyoqJyxcblx0XHRcdFx0XHRcdCd7Z2VuZXJpYyxnZW5lcmFsLGdlbn0vKiovKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0J3tnZW5lcmljLGdlbmVyYWwsZ2VufS8qKi8qJyxcblx0XHRcdFx0XHRcdCd7Z2VuZXJpYyxnZW5lcmFsLGdlbn0vKiovKi5tZCcsXG5cdFx0XHRcdFx0XHQnKiove2dlbmVyaWMsZ2VuZXJhbCxnZW59LyoqJyxcblx0XHRcdFx0XHRcdCcqKi97Z2VuZXJpYyxnZW5lcmFsLGdlbn0vKiovKicsXG5cdFx0XHRcdFx0XHQnKiove2dlbmVyaWMsZ2VuZXJhbCxnZW59LyoqLyoubWQnLFxuXHRcdFx0XHRcdFx0JyoqL3tnZW5lcmljLGdlbmVyYWwsZ2VufS8qKi8qLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XTtcblxuXHRcdFx0XHRcdGZvciAoY29uc3Qgc2V0dGluZyBvZiB0ZXN0U2V0dGluZ3MpIHtcblxuXHRcdFx0XHRcdFx0c2V0TG9jYXRpb25zKHsgW3NldHRpbmddOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZScsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMnLFxuXHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcm9ib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJhYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L25lc3RlZC9yZWFkbWUubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ25vbiBwcm9tcHQgZmlsZSddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9nZW5lcmFsL2NvbW1vbi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL2dlbmVyYWwvdW5jb21tb24tMTAucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcm9ib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL2dlbmVyYWwvbGljZW5zZS5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnbm9uIHByb21wdCBmaWxlJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdFx0XHRhd2FpdCBsb2NhdG9yLmxpc3RGaWxlcyhQcm9tcHRzVHlwZS5wcm9tcHQsIFByb21wdHNTdG9yYWdlLmxvY2FsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9uZXN0ZWQvc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L25lc3RlZC91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdC8vIC1cblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL2dlbmVyYWwvY29tbW9uLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9nZW5lcmFsL3VuY29tbW9uLTEwLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdCdNdXN0IGZpbmQgY29ycmVjdCBwcm9tcHRzLicsXG5cdFx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0ZXN0VChgc3BlY2lmaWNgLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdGVzdFNldHRpbmdzID0gW1xuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnKiovbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0JyoqLypzcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XHQnKiovKmNvbW1vbionLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0JyoqL215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcqKi8qc3BlY2lmaWMqLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcqKi8qY29tbW9uKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0JyoqL215Ki5tZCcsXG5cdFx0XHRcdFx0XHRcdCcqKi8qc3BlY2lmaWMqLm1kJyxcblx0XHRcdFx0XHRcdFx0JyoqLypjb21tb24qLm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcqKi9teSoubWQnLFxuXHRcdFx0XHRcdFx0XHQnKiovc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdFx0JyoqL3Vuc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdFx0JyoqL2NvbW1vbionLFxuXHRcdFx0XHRcdFx0XHQnKiovdW5jb21tb24qJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcqKi9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnKiovc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0JyoqL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcqKi91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnKiovY29tbW9uLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcqKi91bmNvbW1vbi0xMC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0J2dlbiovKiovbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0J2dlbiovKiovKnNwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRcdCdnZW4qLyoqLypjb21tb24qJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCdnZW4qLyoqL215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCdnZW4qLyoqLypzcGVjaWZpYyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0J2dlbiovKiovKmNvbW1vbioucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCdnZW4qLyoqL215Ki5tZCcsXG5cdFx0XHRcdFx0XHRcdCdnZW4qLyoqLypzcGVjaWZpYyoubWQnLFxuXHRcdFx0XHRcdFx0XHQnZ2VuKi8qKi8qY29tbW9uKi5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnZ2VuKi8qKi9teSoubWQnLFxuXHRcdFx0XHRcdFx0XHQnZ2VuKi8qKi9zcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XHQnZ2VuKi8qKi91bnNwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRcdCdnZW4qLyoqL2NvbW1vbionLFxuXHRcdFx0XHRcdFx0XHQnZ2VuKi8qKi91bmNvbW1vbionLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0J2dlbiovKiovbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0J2dlbiovKiovc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0J2dlbiovKiovdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0J2dlbiovKiovdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0J2dlbiovKiovY29tbW9uLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCdnZW4qLyoqL3VuY29tbW9uLTEwLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnZ2VuL3RleHQvbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0J2dlbi90ZXh0L25lc3RlZC9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnZ2VuL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCdnZW4vdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0J2dlbmVyYWwvY29tbW9uLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCdnZW5lcmFsL3VuY29tbW9uLTEwLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnZ2VuL3RleHQvbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0J2dlbi90ZXh0L25lc3RlZC8qc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdFx0J2dlbmVyYWwvKmNvbW1vbionLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0J2dlbi90ZXh0L215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCdnZW4vdGV4dC8qKi9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnZ2VuL3RleHQvKiovdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0J2dlbi90ZXh0LyoqL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCdnZW5lcmFsLyonLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0J3tnZW4sZ2VuZXJhbH0vKiovbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0J3tnZW4sZ2VuZXJhbH0vKiovKnNwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRcdCd7Z2VuLGdlbmVyYWx9LyoqLypjb21tb24qJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCd7Z2VuLGdlbmVyYWx9LyoqL215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCd7Z2VuLGdlbmVyYWx9LyoqLypzcGVjaWZpYyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0J3tnZW4sZ2VuZXJhbH0vKiovKmNvbW1vbioucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCd7Z2VuLGdlbmVyYWx9LyoqL215Ki5tZCcsXG5cdFx0XHRcdFx0XHRcdCd7Z2VuLGdlbmVyYWx9LyoqLypzcGVjaWZpYyoubWQnLFxuXHRcdFx0XHRcdFx0XHQne2dlbixnZW5lcmFsfS8qKi8qY29tbW9uKi5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQne2dlbixnZW5lcmFsfS8qKi9teSoubWQnLFxuXHRcdFx0XHRcdFx0XHQne2dlbixnZW5lcmFsfS8qKi9zcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XHQne2dlbixnZW5lcmFsfS8qKi91bnNwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRcdCd7Z2VuLGdlbmVyYWx9LyoqL2NvbW1vbionLFxuXHRcdFx0XHRcdFx0XHQne2dlbixnZW5lcmFsfS8qKi91bmNvbW1vbionLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0J3tnZW4sZ2VuZXJhbH0vKiovbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0J3tnZW4sZ2VuZXJhbH0vKiovc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0J3tnZW4sZ2VuZXJhbH0vKiovdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0J3tnZW4sZ2VuZXJhbH0vKiovdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0J3tnZW4sZ2VuZXJhbH0vKiovY29tbW9uLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCd7Z2VuLGdlbmVyYWx9LyoqL3VuY29tbW9uLTEwLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdF07XG5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmdzIG9mIHRlc3RTZXR0aW5ncykge1xuXHRcdFx0XHRcdFx0Y29uc3QgdnNjb2RlU2V0dGluZ3M6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+ID0ge307XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmcgb2Ygc2V0dGluZ3MpIHtcblx0XHRcdFx0XHRcdFx0dnNjb2RlU2V0dGluZ3Nbc2V0dGluZ10gPSB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRzZXRMb2NhdGlvbnModnNjb2RlU2V0dGluZ3MpO1xuXHRcdFx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZScsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMnLFxuXHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcm9ib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJhYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L25lc3RlZC9yZWFkbWUubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ25vbiBwcm9tcHQgZmlsZSddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9nZW5lcmFsL2NvbW1vbi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL2dlbmVyYWwvdW5jb21tb24tMTAucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcm9ib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL2dlbmVyYWwvbGljZW5zZS5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnbm9uIHByb21wdCBmaWxlJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdFx0XHRhd2FpdCBsb2NhdG9yLmxpc3RGaWxlcyhQcm9tcHRzVHlwZS5wcm9tcHQsIFByb21wdHNTdG9yYWdlLmxvY2FsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9uZXN0ZWQvc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L25lc3RlZC91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdC8vIC1cblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL2dlbmVyYWwvY29tbW9uLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9nZW5lcmFsL3VuY29tbW9uLTEwLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdCdNdXN0IGZpbmQgY29ycmVjdCBwcm9tcHRzLicsXG5cdFx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRzdWl0ZSgnYWJzb2x1dGUnLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3RUKCd3aWxkIGNhcmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdGVzdFNldHRpbmdzID0gW1xuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKionLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovKi5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi8qJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2dlbiovKionLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovZ2VuKi8qKi8qLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9nZW4qLyoqLyonLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovZ2VuKi8qKi8qLm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2dlbiovKionLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovZ2VuKi8qKi8qJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2dlbiovKiovKi5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9nZW4qLyoqLyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3t2c2NvZGUscHJvbXB0c30vKionLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3ZzY29kZSxwcm9tcHRzfS8qKi8qLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97dnNjb2RlLHByb21wdHN9LyoqLyoubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3ZzY29kZSxwcm9tcHRzfS8qKi8qJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3t2c2NvZGUscHJvbXB0c30vKiovZ2VuKi8qKicsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97dnNjb2RlLHByb21wdHN9LyoqL2dlbiovKiovKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3ZzY29kZSxwcm9tcHRzfS8qKi9nZW4qLyoqLyonLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3ZzY29kZSxwcm9tcHRzfS8qKi9nZW4qLyoqLyoubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3ZzY29kZSxwcm9tcHRzfS8qKi9nZW4qLyoqJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3t2c2NvZGUscHJvbXB0c30vKiovZ2VuKi8qKi8qJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3t2c2NvZGUscHJvbXB0c30vKiovZ2VuKi8qKi8qLm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3t2c2NvZGUscHJvbXB0c30vKiovZ2VuKi8qKi8qLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97dnNjb2RlLHByb21wdHN9LyoqL3tnZW5lcmFsLGdlbn0vKionLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3ZzY29kZSxwcm9tcHRzfS8qKi97Z2VuZXJhbCxnZW59LyoqLyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3t2c2NvZGUscHJvbXB0c30vKiove2dlbmVyYWwsZ2VufS8qKi8qJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3t2c2NvZGUscHJvbXB0c30vKiove2dlbmVyYWwsZ2VufS8qKi8qLm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3t2c2NvZGUscHJvbXB0c30vKiove2dlbmVyYWwsZ2VufS8qKicsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97dnNjb2RlLHByb21wdHN9LyoqL3tnZW5lcmFsLGdlbn0vKiovKicsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97dnNjb2RlLHByb21wdHN9LyoqL3tnZW5lcmFsLGdlbn0vKiovKi5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97dnNjb2RlLHByb21wdHN9LyoqL3tnZW5lcmFsLGdlbn0vKiovKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdF07XG5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmcgb2YgdGVzdFNldHRpbmdzKSB7XG5cdFx0XHRcdFx0XHRzZXRMb2NhdGlvbnMoeyBbc2V0dGluZ106IHRydWUgfSk7XG5cdFx0XHRcdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cycsXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9uZXN0ZWQvc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L25lc3RlZC91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCByb2JvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcmFib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkL3JlYWRtZS5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnbm9uIHByb21wdCBmaWxlJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL2dlbmVyYWwvY29tbW9uLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvZ2VuZXJhbC91bmNvbW1vbi0xMC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCByb2JvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvZ2VuZXJhbC9saWNlbnNlLm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydub24gcHJvbXB0IGZpbGUnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdFx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdFx0XHRcdGF3YWl0IGxvY2F0b3IubGlzdEZpbGVzKFByb21wdHNUeXBlLnByb21wdCwgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L25lc3RlZC9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Ly8gLVxuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvZ2VuZXJhbC9jb21tb24ucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL2dlbmVyYWwvdW5jb21tb24tMTAucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0J011c3QgZmluZCBjb3JyZWN0IHByb21wdHMuJyxcblx0XHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3RUKGBzcGVjaWZpY2AsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCB0ZXN0U2V0dGluZ3MgPSBbXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqLypzcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi8qY29tbW9uKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi8qc3BlY2lmaWMqLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqLypjb21tb24qLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9teSoubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi8qc3BlY2lmaWMqLm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovKmNvbW1vbioubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovbXkqLm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovdW5zcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9jb21tb24qJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovdW5jb21tb24qJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2NvbW1vbi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi91bmNvbW1vbi0xMC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovZ2VuKi8qKi9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9nZW4qLyoqLypzcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9nZW4qLyoqLypjb21tb24qJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2dlbiovKiovbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovZ2VuKi8qKi8qc3BlY2lmaWMqLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2dlbiovKiovKmNvbW1vbioucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2dlbiovKiovbXkqLm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovZ2VuKi8qKi8qc3BlY2lmaWMqLm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovZ2VuKi8qKi8qY29tbW9uKi5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9nZW4qLyoqL215Ki5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2dlbiovKiovc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovZ2VuKi8qKi91bnNwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2dlbiovKiovY29tbW9uKicsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2dlbiovKiovdW5jb21tb24qJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2dlbiovKiovbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovZ2VuKi8qKi9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9nZW4qLyoqL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2dlbiovKiovdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovZ2VuKi8qKi9jb21tb24ucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovZ2VuKi8qKi91bmNvbW1vbi0xMC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9uZXN0ZWQvc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L25lc3RlZC91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvZ2VuZXJhbC9jb21tb24ucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9nZW5lcmFsL3VuY29tbW9uLTEwLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L25lc3RlZC8qc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9nZW5lcmFsLypjb21tb24qJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvKiovc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0LyoqL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC8qKi91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL2dlbmVyYWwvKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi97Z2VuLGdlbmVyYWx9LyoqL215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL3tnZW4sZ2VuZXJhbH0vKiovKnNwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL3tnZW4sZ2VuZXJhbH0vKiovKmNvbW1vbionLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiove2dlbixnZW5lcmFsfS8qKi9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi97Z2VuLGdlbmVyYWx9LyoqLypzcGVjaWZpYyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiove2dlbixnZW5lcmFsfS8qKi8qY29tbW9uKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiove2dlbixnZW5lcmFsfS8qKi9teSoubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi97Z2VuLGdlbmVyYWx9LyoqLypzcGVjaWZpYyoubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi97Z2VuLGdlbmVyYWx9LyoqLypjb21tb24qLm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL3tnZW4sZ2VuZXJhbH0vKiovbXkqLm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiove2dlbixnZW5lcmFsfS8qKi9zcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi97Z2VuLGdlbmVyYWx9LyoqL3Vuc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiove2dlbixnZW5lcmFsfS8qKi9jb21tb24qJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiove2dlbixnZW5lcmFsfS8qKi91bmNvbW1vbionLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiove2dlbixnZW5lcmFsfS8qKi9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi97Z2VuLGdlbmVyYWx9LyoqL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL3tnZW4sZ2VuZXJhbH0vKiovdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiove2dlbixnZW5lcmFsfS8qKi91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi97Z2VuLGdlbmVyYWx9LyoqL2NvbW1vbi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi97Z2VuLGdlbmVyYWx9LyoqL3VuY29tbW9uLTEwLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97cHJvbXB0cyx2c2NvZGUsY29waWxvdH0ve2dlbixnZW5lcmFsfS8qKi9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97cHJvbXB0cyx2c2NvZGUsY29waWxvdH0ve2dlbixnZW5lcmFsfS8qKi8qc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3Byb21wdHMsdnNjb2RlLGNvcGlsb3R9L3tnZW4sZ2VuZXJhbH0vKiovKmNvbW1vbionLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3Byb21wdHMsdnNjb2RlLGNvcGlsb3R9L3tnZW4sZ2VuZXJhbH0vKiovbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3Byb21wdHMsdnNjb2RlLGNvcGlsb3R9L3tnZW4sZ2VuZXJhbH0vKiovKnNwZWNpZmljKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97cHJvbXB0cyx2c2NvZGUsY29waWxvdH0ve2dlbixnZW5lcmFsfS8qKi8qY29tbW9uKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3Byb21wdHMsdnNjb2RlLGNvcGlsb3R9L3tnZW4sZ2VuZXJhbH0vKiovbXkqLm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3Byb21wdHMsdnNjb2RlLGNvcGlsb3R9L3tnZW4sZ2VuZXJhbH0vKiovKnNwZWNpZmljKi5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3twcm9tcHRzLHZzY29kZSxjb3BpbG90fS97Z2VuLGdlbmVyYWx9LyoqLypjb21tb24qLm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3twcm9tcHRzLHZzY29kZSxjb3BpbG90fS97Z2VuLGdlbmVyYWx9LyoqL215Ki5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3twcm9tcHRzLHZzY29kZSxjb3BpbG90fS97Z2VuLGdlbmVyYWx9LyoqL3NwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3twcm9tcHRzLHZzY29kZSxjb3BpbG90fS97Z2VuLGdlbmVyYWx9LyoqL3Vuc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3Byb21wdHMsdnNjb2RlLGNvcGlsb3R9L3tnZW4sZ2VuZXJhbH0vKiovY29tbW9uKicsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3twcm9tcHRzLHZzY29kZSxjb3BpbG90fS97Z2VuLGdlbmVyYWx9LyoqL3VuY29tbW9uKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97cHJvbXB0cyx2c2NvZGUsY29waWxvdH0ve2dlbixnZW5lcmFsfS8qKi9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97cHJvbXB0cyx2c2NvZGUsY29waWxvdH0ve2dlbixnZW5lcmFsfS8qKi9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97cHJvbXB0cyx2c2NvZGUsY29waWxvdH0ve2dlbixnZW5lcmFsfS8qKi91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97cHJvbXB0cyx2c2NvZGUsY29waWxvdH0ve2dlbixnZW5lcmFsfS8qKi91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97cHJvbXB0cyx2c2NvZGUsY29waWxvdH0ve2dlbixnZW5lcmFsfS8qKi9jb21tb24ucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3Byb21wdHMsdnNjb2RlLGNvcGlsb3R9L3tnZW4sZ2VuZXJhbH0vKiovdW5jb21tb24tMTAucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XTtcblxuXHRcdFx0XHRcdGZvciAoY29uc3Qgc2V0dGluZ3Mgb2YgdGVzdFNldHRpbmdzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB2c2NvZGVTZXR0aW5nczogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4gPSB7fTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3Qgc2V0dGluZyBvZiBzZXR0aW5ncykge1xuXHRcdFx0XHRcdFx0XHR2c2NvZGVTZXR0aW5nc1tzZXR0aW5nXSA9IHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHNldExvY2F0aW9ucyh2c2NvZGVTZXR0aW5ncyk7XG5cdFx0XHRcdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cycsXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9uZXN0ZWQvc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L25lc3RlZC91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCByb2JvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcmFib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkL3JlYWRtZS5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnbm9uIHByb21wdCBmaWxlJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL2dlbmVyYWwvY29tbW9uLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvZ2VuZXJhbC91bmNvbW1vbi0xMC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCByb2JvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvZ2VuZXJhbC9saWNlbnNlLm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydub24gcHJvbXB0IGZpbGUnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdFx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdFx0XHRcdGF3YWl0IGxvY2F0b3IubGlzdEZpbGVzKFByb21wdHNUeXBlLnByb21wdCwgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L25lc3RlZC9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Ly8gLVxuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvZ2VuZXJhbC9jb21tb24ucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL2dlbmVyYWwvdW5jb21tb24tMTAucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0J011c3QgZmluZCBjb3JyZWN0IHByb21wdHMuJyxcblx0XHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpbnN0cnVjdGlvbnMnLCAoKSA9PiB7XG5cdFx0dGVzdFQoJ2ZpbmRzIGluc3RydWN0aW9ucyBmaWxlcyBpbiBzdWJkaXJlY3RvcmllcyBvZiAuZ2l0aHViL2luc3RydWN0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldExvY2F0aW9ucyh7XG5cdFx0XHRcdCcuZ2l0aHViL2luc3RydWN0aW9ucyc6IHRydWUsXG5cdFx0XHRcdCcuY2xhdWRlL3J1bGVzJzogZmFsc2UsXG5cdFx0XHRcdCd+Ly5jb3BpbG90L2luc3RydWN0aW9ucyc6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFsnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnXSk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uZ2l0aHViL2luc3RydWN0aW9ucy9yb290Lmluc3RydWN0aW9ucy5tZCcsXG5cdFx0XHRcdFx0Y29udGVudHM6IFsncm9vdCBpbnN0cnVjdGlvbnMnXSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uZ2l0aHViL2luc3RydWN0aW9ucy9mcm9udGVuZC9yZWFjdC5pbnN0cnVjdGlvbnMubWQnLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbJ3JlYWN0IGluc3RydWN0aW9ucyddLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL2Zyb250ZW5kL2Nzcy5pbnN0cnVjdGlvbnMubWQnLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbJ2NzcyBpbnN0cnVjdGlvbnMnXSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uZ2l0aHViL2luc3RydWN0aW9ucy9iYWNrZW5kL2FwaS5pbnN0cnVjdGlvbnMubWQnLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbJ2FwaSBpbnN0cnVjdGlvbnMnXSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdGF3YWl0IGxvY2F0b3IubGlzdEZpbGVzKFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL3Jvb3QuaW5zdHJ1Y3Rpb25zLm1kJyxcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvZnJvbnRlbmQvcmVhY3QuaW5zdHJ1Y3Rpb25zLm1kJyxcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvZnJvbnRlbmQvY3NzLmluc3RydWN0aW9ucy5tZCcsXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL2JhY2tlbmQvYXBpLmluc3RydWN0aW9ucy5tZCcsXG5cdFx0XHRcdF0sXG5cdFx0XHRcdCdNdXN0IGZpbmQgaW5zdHJ1Y3Rpb25zIGZpbGVzIHJlY3Vyc2l2ZWx5IGluIHN1YmRpcmVjdG9yaWVzIG9mIC5naXRodWIvaW5zdHJ1Y3Rpb25zLicsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2tpbGxzJywgKCkgPT4ge1xuXHRcdHN1aXRlKCdmaW5kQWdlbnRTa2lsbHMnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0VCgnZmluZHMgc2tpbGwgZmlsZXMgaW4gY29uZmlndXJlZCBsb2NhdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldExvY2F0aW9ucyh7XG5cdFx0XHRcdFx0Jy5jbGF1ZGUvc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHQvLyBkaXNhYmxlIG90aGVyIGRlZmF1bHRzXG5cdFx0XHRcdFx0Jy5naXRodWIvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0J34vLmNvcGlsb3Qvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0J34vLmNsYXVkZS9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoWycvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZSddKTtcblx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5jbGF1ZGUvc2tpbGxzL3BwdHgvU0tJTEwubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnIyBQUFRYIFNraWxsJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmNsYXVkZS9za2lsbHMvZXhjZWwvU0tJTEwubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnIyBFeGNlbCBTa2lsbCddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRjb25zdCBza2lsbHMgPSBhd2FpdCBsb2NhdG9yLmZpbmRBZ2VudFNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0XHRza2lsbHMubWFwKHMgPT4gcy51cmkpLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uY2xhdWRlL3NraWxscy9wcHR4L1NLSUxMLm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uY2xhdWRlL3NraWxscy9leGNlbC9TS0lMTC5tZCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHQnTXVzdCBmaW5kIHNraWxsIGZpbGVzLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdFQoJ2lnbm9yZXMgZm9sZGVycyB3aXRob3V0IFNLSUxMLm1kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRMb2NhdGlvbnMoe1xuXHRcdFx0XHRcdCcuY2xhdWRlL3NraWxscyc6IHRydWUsXG5cdFx0XHRcdFx0Ly8gZGlzYWJsZSBvdGhlciBkZWZhdWx0c1xuXHRcdFx0XHRcdCcuZ2l0aHViL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCd+Ly5jb3BpbG90L3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCd+Ly5jbGF1ZGUvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFsnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnXSk7XG5cdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uY2xhdWRlL3NraWxscy92YWxpZC1za2lsbC9TS0lMTC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWycjIFZhbGlkIFNraWxsJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmNsYXVkZS9za2lsbHMvaW52YWxpZC1za2lsbC9yZWFkbWUubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnTm90IGEgc2tpbGwgZmlsZSddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5jbGF1ZGUvc2tpbGxzL2Fub3RoZXItaW52YWxpZC9pbmRleC5qcycsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydjb25zb2xlLmxvZyhcIm5vdCBhIHNraWxsXCIpJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdGNvbnN0IHNraWxscyA9IGF3YWl0IGxvY2F0b3IuZmluZEFnZW50U2tpbGxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdHNraWxscy5tYXAocyA9PiBzLnVyaSksXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5jbGF1ZGUvc2tpbGxzL3ZhbGlkLXNraWxsL1NLSUxMLm1kJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdCdNdXN0IG9ubHkgZmluZCBmb2xkZXJzIHdpdGggU0tJTEwubWQuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0VCgncmV0dXJucyBlbXB0eSBhcnJheSB3aGVuIG5vIHNraWxscyBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0TG9jYXRpb25zKHtcblx0XHRcdFx0XHQnLmNsYXVkZS9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdC8vIGRpc2FibGUgb3RoZXIgZGVmYXVsdHNcblx0XHRcdFx0XHQnLmdpdGh1Yi9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uY29waWxvdC9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uY2xhdWRlL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlJ10pO1xuXHRcdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtdKTtcblx0XHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdFx0Y29uc3Qgc2tpbGxzID0gYXdhaXQgbG9jYXRvci5maW5kQWdlbnRTa2lsbHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdFx0c2tpbGxzLm1hcChzID0+IHMudXJpKSxcblx0XHRcdFx0XHRbXSxcblx0XHRcdFx0XHQnTXVzdCByZXR1cm4gZW1wdHkgYXJyYXkgd2hlbiBubyBza2lsbHMgZXhpc3QuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0VCgncmV0dXJucyBlbXB0eSBhcnJheSB3aGVuIHNraWxsIGZvbGRlciBkb2VzIG5vdCBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0TG9jYXRpb25zKHtcblx0XHRcdFx0XHQnLmNsYXVkZS9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdC8vIGRpc2FibGUgb3RoZXIgZGVmYXVsdHNcblx0XHRcdFx0XHQnLmdpdGh1Yi9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uY29waWxvdC9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uY2xhdWRlL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlJ10pO1xuXHRcdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtdKTtcblx0XHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdFx0Y29uc3Qgc2tpbGxzID0gYXdhaXQgbG9jYXRvci5maW5kQWdlbnRTa2lsbHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdFx0c2tpbGxzLm1hcChzID0+IHMudXJpKSxcblx0XHRcdFx0XHRbXSxcblx0XHRcdFx0XHQnTXVzdCByZXR1cm4gZW1wdHkgYXJyYXkgd2hlbiBmb2xkZXIgZG9lcyBub3QgZXhpc3QuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0VCgnZmluZHMgc2tpbGxzIGFjcm9zcyBtdWx0aXBsZSB3b3Jrc3BhY2UgZm9sZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0TG9jYXRpb25zKHtcblx0XHRcdFx0XHQnLmNsYXVkZS9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdC8vIGRpc2FibGUgb3RoZXIgZGVmYXVsdHNcblx0XHRcdFx0XHQnLmdpdGh1Yi9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uY29waWxvdC9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uY2xhdWRlL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlJyxcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9ub2RlJyxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uY2xhdWRlL3NraWxscy9za2lsbC1hL1NLSUxMLm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJyMgU2tpbGwgQSddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mvbm9kZS8uY2xhdWRlL3NraWxscy9za2lsbC1iL1NLSUxMLm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJyMgU2tpbGwgQiddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRjb25zdCBza2lsbHMgPSBhd2FpdCBsb2NhdG9yLmZpbmRBZ2VudFNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0XHRza2lsbHMubWFwKHMgPT4gcy51cmkpLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uY2xhdWRlL3NraWxscy9za2lsbC1hL1NLSUxMLm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL25vZGUvLmNsYXVkZS9za2lsbHMvc2tpbGwtYi9TS0lMTC5tZCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHQnTXVzdCBmaW5kIHNraWxscyBhY3Jvc3MgYWxsIHdvcmtzcGFjZSBmb2xkZXJzLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdsaXN0RmlsZXMgd2l0aCBQcm9tcHRzVHlwZS5za2lsbCcsICgpID0+IHtcblx0XHRcdHRlc3RUKCdkb2VzIG5vdCBsaXN0IHNraWxscyB3aGVuIGxvY2F0aW9uIGlzIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRMb2NhdGlvbnMoe1xuXHRcdFx0XHRcdCcuY2xhdWRlL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdC8vIGRpc2FibGUgb3RoZXIgZGVmYXVsdHNcblx0XHRcdFx0XHQnLmdpdGh1Yi9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uY29waWxvdC9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uY2xhdWRlL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlJ10pO1xuXHRcdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmNsYXVkZS9za2lsbHMvcHB0eC9TS0lMTC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWycjIFBQVFggU2tpbGwnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdFx0Y29uc3QgZmlsZXMgPSBhd2FpdCBsb2NhdG9yLmxpc3RGaWxlcyhQcm9tcHRzVHlwZS5za2lsbCwgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdGZpbGVzLFxuXHRcdFx0XHRcdFtdLFxuXHRcdFx0XHRcdCdNdXN0IG5vdCBsaXN0IHNraWxscyB3aGVuIGxvY2F0aW9uIGlzIGRpc2FibGVkLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCd0b0Fic29sdXRlTG9jYXRpb25zRm9yU2tpbGxzIHBhdGggdmFsaWRhdGlvbicsICgpID0+IHtcblx0XHRcdHRlc3RUKCdyZWplY3RzIGdsb2IgcGF0dGVybnMgaW4gc2tpbGwgcGF0aHMgdmlhIGdldENvbmZpZ0Jhc2VkU291cmNlRm9sZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0TG9jYXRpb25zKHtcblx0XHRcdFx0XHQnc2tpbGxzLyoqJzogdHJ1ZSxcblx0XHRcdFx0XHQnc2tpbGxzLyonOiB0cnVlLFxuXHRcdFx0XHRcdCcqKi9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdC8vIGRpc2FibGUgZGVmYXVsdHNcblx0XHRcdFx0XHQnLmdpdGh1Yi9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnLmFnZW50cy9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnLmNsYXVkZS9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uY29waWxvdC9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uYWdlbnRzL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCd+Ly5jbGF1ZGUvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFsnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnXSk7XG5cdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW10pO1xuXHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRjb25zdCBmb2xkZXJzID0gYXdhaXQgbG9jYXRvci5nZXRDb25maWdCYXNlZFNvdXJjZUZvbGRlcnMoUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdGZvbGRlcnMsXG5cdFx0XHRcdFx0W10sXG5cdFx0XHRcdFx0J011c3QgcmVqZWN0IGdsb2IgcGF0dGVybnMgaW4gc2tpbGwgcGF0aHMuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0VCgncmVqZWN0cyBhYnNvbHV0ZSBwYXRocyBpbiBza2lsbCBwYXRocyB2aWEgZ2V0Q29uZmlnQmFzZWRTb3VyY2VGb2xkZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRMb2NhdGlvbnMoe1xuXHRcdFx0XHRcdCcvYWJzb2x1dGUvcGF0aC9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdC8vIGRpc2FibGUgZGVmYXVsdHNcblx0XHRcdFx0XHQnLmdpdGh1Yi9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnLmFnZW50cy9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnLmNsYXVkZS9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uY29waWxvdC9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uYWdlbnRzL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCd+Ly5jbGF1ZGUvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFsnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnXSk7XG5cdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW10pO1xuXHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRjb25zdCBmb2xkZXJzID0gYXdhaXQgbG9jYXRvci5nZXRDb25maWdCYXNlZFNvdXJjZUZvbGRlcnMoUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdGZvbGRlcnMsXG5cdFx0XHRcdFx0W10sXG5cdFx0XHRcdFx0J011c3QgcmVqZWN0IGFic29sdXRlIHBhdGhzIGluIHNraWxsIHBhdGhzLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdFQoJ2FjY2VwdHMgcmVsYXRpdmUgcGF0aHMgaW4gc2tpbGwgcGF0aHMgdmlhIGdldENvbmZpZ0Jhc2VkU291cmNlRm9sZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0TG9jYXRpb25zKHtcblx0XHRcdFx0XHQnLi9teS1za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdCdjdXN0b20vc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHQvLyBkaXNhYmxlIGRlZmF1bHRzXG5cdFx0XHRcdFx0Jy5naXRodWIvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0Jy5hZ2VudHMvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0Jy5jbGF1ZGUvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0J34vLmNvcGlsb3Qvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0J34vLmFnZW50cy9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uY2xhdWRlL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlJ10pO1xuXHRcdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtdKTtcblx0XHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdFx0Y29uc3QgZm9sZGVycyA9IGF3YWl0IGxvY2F0b3IuZ2V0Q29uZmlnQmFzZWRTb3VyY2VGb2xkZXJzKFByb21wdHNUeXBlLnNraWxsKTtcblx0XHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0XHRmb2xkZXJzLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9teS1za2lsbHMnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2N1c3RvbS9za2lsbHMnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0J011c3QgYWNjZXB0IHJlbGF0aXZlIHBhdGhzIGluIHNraWxsIHBhdGhzLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdFQoJ2FjY2VwdHMgcGFyZW50IHJlbGF0aXZlIHBhdGhzIGZvciBtb25vcmVwb3MgdmlhIGdldENvbmZpZ0Jhc2VkU291cmNlRm9sZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0TG9jYXRpb25zKHtcblx0XHRcdFx0XHQnLi4vc2hhcmVkLXNraWxscyc6IHRydWUsXG5cdFx0XHRcdFx0Ly8gZGlzYWJsZSBkZWZhdWx0c1xuXHRcdFx0XHRcdCcuZ2l0aHViL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCcuYWdlbnRzL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCcuY2xhdWRlL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCd+Ly5jb3BpbG90L3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCd+Ly5hZ2VudHMvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0J34vLmNsYXVkZS9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoWycvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZSddKTtcblx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXSk7XG5cdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdGNvbnN0IGZvbGRlcnMgPSBhd2FpdCBsb2NhdG9yLmdldENvbmZpZ0Jhc2VkU291cmNlRm9sZGVycyhQcm9tcHRzVHlwZS5za2lsbCk7XG5cdFx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdFx0Zm9sZGVycyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9zaGFyZWQtc2tpbGxzJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdCdNdXN0IGFjY2VwdCBwYXJlbnQgcmVsYXRpdmUgcGF0aHMgZm9yIG1vbm9yZXBvcy4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3RUKCdhY2NlcHRzIHRpbGRlIHBhdGhzIGZvciB1c2VyIGhvbWUgc2tpbGxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRMb2NhdGlvbnMoe1xuXHRcdFx0XHRcdCd+L215LXNraWxscyc6IHRydWUsXG5cdFx0XHRcdFx0Ly8gZGlzYWJsZSBkZWZhdWx0c1xuXHRcdFx0XHRcdCcuZ2l0aHViL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCcuYWdlbnRzL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCcuY2xhdWRlL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCd+Ly5jb3BpbG90L3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCd+Ly5hZ2VudHMvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0J34vLmNsYXVkZS9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoWycvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZSddKTtcblx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXSk7XG5cdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdGNvbnN0IGZvbGRlcnMgPSBhd2FpdCBsb2NhdG9yLmdldENvbmZpZ0Jhc2VkU291cmNlRm9sZGVycyhQcm9tcHRzVHlwZS5za2lsbCk7XG5cdFx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdFx0Zm9sZGVycyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9teS1za2lsbHMnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0J011c3QgYWNjZXB0IHRpbGRlIHBhdGhzIGZvciB1c2VyIGhvbWUgc2tpbGxzLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdnZXRDb25maWdCYXNlZFNvdXJjZUZvbGRlcnMgZm9yIHNraWxscycsICgpID0+IHtcblx0XHRcdHRlc3RUKCdyZXR1cm5zIHNvdXJjZSBmb2xkZXJzIHdpdGhvdXQgZ2xvYiBwcm9jZXNzaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRMb2NhdGlvbnMoe1xuXHRcdFx0XHRcdCcuY2xhdWRlL3NraWxscyc6IHRydWUsXG5cdFx0XHRcdFx0J2N1c3RvbS1za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdC8vIGV4cGxpY2l0bHkgZGlzYWJsZSBvdGhlciBkZWZhdWx0cyB3ZSBkb24ndCB3YW50IGZvciB0aGlzIHRlc3Rcblx0XHRcdFx0XHQnLmdpdGh1Yi9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnLmFnZW50cy9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uY29waWxvdC9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uYWdlbnRzL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCd+Ly5jbGF1ZGUvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFtcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnLFxuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL25vZGUnLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXSk7XG5cdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdGNvbnN0IGZvbGRlcnMgPSBhd2FpdCBsb2NhdG9yLmdldENvbmZpZ0Jhc2VkU291cmNlRm9sZGVycyhQcm9tcHRzVHlwZS5za2lsbCk7XG5cdFx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdFx0Zm9sZGVycyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmNsYXVkZS9za2lsbHMnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mvbm9kZS8uY2xhdWRlL3NraWxscycsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvY3VzdG9tLXNraWxscycsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9ub2RlL2N1c3RvbS1za2lsbHMnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0J011c3QgcmV0dXJuIHNraWxsIHNvdXJjZSBmb2xkZXJzIHdpdGhvdXQgZ2xvYiBwcm9jZXNzaW5nLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdFQoJ2ZpbHRlcnMgb3V0IGludmFsaWQgc2tpbGwgcGF0aHMgZnJvbSBzb3VyY2UgZm9sZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0TG9jYXRpb25zKHtcblx0XHRcdFx0XHQnLmNsYXVkZS9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdCdza2lsbHMvKionOiB0cnVlLCAvLyBnbG9iIC0gc2hvdWxkIGJlIGZpbHRlcmVkIG91dFxuXHRcdFx0XHRcdCcvYWJzb2x1dGUvc2tpbGxzJzogdHJ1ZSwgLy8gYWJzb2x1dGUgLSBzaG91bGQgYmUgZmlsdGVyZWQgb3V0XG5cdFx0XHRcdFx0Ly8gZXhwbGljaXRseSBkaXNhYmxlIG90aGVyIGRlZmF1bHRzIHdlIGRvbid0IHdhbnQgZm9yIHRoaXMgdGVzdFxuXHRcdFx0XHRcdCcuZ2l0aHViL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCcuYWdlbnRzL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCd+Ly5jb3BpbG90L3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCd+Ly5hZ2VudHMvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0J34vLmNsYXVkZS9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoWycvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZSddKTtcblx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXSk7XG5cdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdGNvbnN0IGZvbGRlcnMgPSBhd2FpdCBsb2NhdG9yLmdldENvbmZpZ0Jhc2VkU291cmNlRm9sZGVycyhQcm9tcHRzVHlwZS5za2lsbCk7XG5cdFx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdFx0Zm9sZGVycyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmNsYXVkZS9za2lsbHMnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0J011c3QgZmlsdGVyIG91dCBpbnZhbGlkIHNraWxsIHBhdGhzLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdFQoJ2luY2x1ZGVzIGRlZmF1bHQgc2tpbGwgc291cmNlIGZvbGRlcnMgZnJvbSBkZWZhdWx0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0TG9jYXRpb25zKHtcblx0XHRcdFx0XHQnY3VzdG9tLXNraWxscyc6IHRydWUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFsnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnXSk7XG5cdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW10pO1xuXHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRjb25zdCBmb2xkZXJzID0gYXdhaXQgbG9jYXRvci5nZXRDb25maWdCYXNlZFNvdXJjZUZvbGRlcnMoUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdGZvbGRlcnMsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0Ly8gZGVmYXVsdHNcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uYWdlbnRzL3NraWxscycsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmdpdGh1Yi9za2lsbHMnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5jbGF1ZGUvc2tpbGxzJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tLy5hZ2VudHMvc2tpbGxzJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tLy5jb3BpbG90L3NraWxscycsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS8uY2xhdWRlL3NraWxscycsXG5cdFx0XHRcdFx0XHQvLyBjdXN0b21cblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9jdXN0b20tc2tpbGxzJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdCdNdXN0IGluY2x1ZGUgZGVmYXVsdCBza2lsbCBzb3VyY2UgZm9sZGVycy4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpc1ZhbGlkR2xvYicsICgpID0+IHtcblx0XHR0ZXN0VCgndmFsaWQgcGF0dGVybnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBnbG9icyA9IFtcblx0XHRcdFx0JyoqJyxcblx0XHRcdFx0J1xcKicsXG5cdFx0XHRcdCdcXCoqJyxcblx0XHRcdFx0JyoqLyonLFxuXHRcdFx0XHQnKiovKi5wcm9tcHQubWQnLFxuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS8qKi8qLnByb21wdC5tZCcsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tLyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vKicsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3tyZXBvMSx0ZXN0fScsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3tyZXBvMSx0ZXN0fS8qKicsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3tyZXBvMSx0ZXN0fS8qJyxcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vKiove3JlcG8xLHRlc3R9LyoqJyxcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vKiove3JlcG8xLHRlc3R9Jyxcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vKiove3JlcG8xLHRlc3R9LyonLFxuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS8qKi9yZXBvWzEsMiwzXScsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tLyoqL3JlcG9bMSwyLDNdLyoqJyxcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vKiovcmVwb1sxLDIsM10vKicsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tLyoqL3JlcG9bMSwyLDNdLyoqLyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0J3JlcG9bMSwyLDNdLyoqLyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0J3JlcG9bWzEsMiwzXS8qKi8qLnByb21wdC5tZCcsXG5cdFx0XHRcdCd7cmVwbzEsdGVzdH0vKi5wcm9tcHQubWQnLFxuXHRcdFx0XHQne3JlcG8xLHRlc3R9LyonLFxuXHRcdFx0XHQnL3tyZXBvMSx0ZXN0fS8qJyxcblx0XHRcdFx0Jy97cmVwbzEsdGVzdH19LyonLFxuXHRcdFx0XTtcblxuXHRcdFx0Zm9yIChjb25zdCBnbG9iIG9mIGdsb2JzKSB7XG5cdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHQoaXNWYWxpZEdsb2IoZ2xvYikgPT09IHRydWUpLFxuXHRcdFx0XHRcdGAnJHtnbG9ifScgbXVzdCBiZSBhICd2YWxpZCcgZ2xvYiBwYXR0ZXJuLmAsXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0VCgnaW52YWxpZCBwYXR0ZXJucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGdsb2JzID0gW1xuXHRcdFx0XHQnLicsXG5cdFx0XHRcdCdcXFxcKicsXG5cdFx0XHRcdCdcXFxcPycsXG5cdFx0XHRcdCdcXFxcKlxcXFw/XFxcXConLFxuXHRcdFx0XHQncmVwb1sxLDIsMycsXG5cdFx0XHRcdCdyZXBvMSwyLDNdJyxcblx0XHRcdFx0J3JlcG9cXFxcWzEsMiwzXScsXG5cdFx0XHRcdCdyZXBvWzEsMiwzXFxcXF0nLFxuXHRcdFx0XHQncmVwb1xcXFxbMSwyLDNcXFxcXScsXG5cdFx0XHRcdCd7cmVwbzEscmVwbzInLFxuXHRcdFx0XHQncmVwbzEscmVwbzJ9Jyxcblx0XHRcdFx0J1xcXFx7cmVwbzEscmVwbzJ9Jyxcblx0XHRcdFx0J3tyZXBvMSxyZXBvMlxcXFx9Jyxcblx0XHRcdFx0J1xcXFx7cmVwbzEscmVwbzJcXFxcfScsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zJyxcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb1sxLDIsMycsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG8xLDIsM10nLFxuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvXFxcXFsxLDIsM10nLFxuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvWzEsMiwzXFxcXF0nLFxuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvXFxcXFsxLDIsM1xcXFxdJyxcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20ve3JlcG8xLHJlcG8yJyxcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwbzEscmVwbzJ9Jyxcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vXFxcXHtyZXBvMSxyZXBvMn0nLFxuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS97cmVwbzEscmVwbzJcXFxcfScsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL1xcXFx7cmVwbzEscmVwbzJcXFxcfScsXG5cdFx0XHRdO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGdsb2Igb2YgZ2xvYnMpIHtcblx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdChpc1ZhbGlkR2xvYihnbG9iKSA9PT0gZmFsc2UpLFxuXHRcdFx0XHRcdGAnJHtnbG9ifScgbXVzdCBiZSBhbiAnaW52YWxpZCcgZ2xvYiBwYXR0ZXJuLmAsXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpc1ZhbGlkU2tpbGxQYXRoJywgKCkgPT4ge1xuXHRcdHRlc3RUKCdhY2NlcHRzIHJlbGF0aXZlIHBhdGhzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdmFsaWRQYXRocyA9IFtcblx0XHRcdFx0J3NvbWVGb2xkZXInLFxuXHRcdFx0XHQnLi9zb21lRm9sZGVyJyxcblx0XHRcdFx0J215LXNraWxscycsXG5cdFx0XHRcdCcuL215LXNraWxscycsXG5cdFx0XHRcdCdmb2xkZXIvc3ViZm9sZGVyJyxcblx0XHRcdFx0Jy4vZm9sZGVyL3N1YmZvbGRlcicsXG5cdFx0XHRdO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHBhdGggb2YgdmFsaWRQYXRocykge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0aXNWYWxpZFByb21wdEZvbGRlclBhdGgocGF0aCksXG5cdFx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0XHRgJyR7cGF0aH0nIG11c3QgYmUgYWNjZXB0ZWQgYXMgYSB2YWxpZCBza2lsbCBwYXRoIChyZWxhdGl2ZSBwYXRoKS5gLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdFQoJ2FjY2VwdHMgdXNlciBob21lIHBhdGhzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdmFsaWRQYXRocyA9IFtcblx0XHRcdFx0J34vZm9sZGVyJyxcblx0XHRcdFx0J34vLmNvcGlsb3Qvc2tpbGxzJyxcblx0XHRcdFx0J34vLmNsYXVkZS9za2lsbHMnLFxuXHRcdFx0XHQnfi9teS1za2lsbHMnLFxuXHRcdFx0XTtcblxuXHRcdFx0Zm9yIChjb25zdCBwYXRoIG9mIHZhbGlkUGF0aHMpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGlzVmFsaWRQcm9tcHRGb2xkZXJQYXRoKHBhdGgpLFxuXHRcdFx0XHRcdHRydWUsXG5cdFx0XHRcdFx0YCcke3BhdGh9JyBtdXN0IGJlIGFjY2VwdGVkIGFzIGEgdmFsaWQgc2tpbGwgcGF0aCAodXNlciBob21lIHBhdGgpLmAsXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0VCgnYWNjZXB0cyBwYXJlbnQgcmVsYXRpdmUgcGF0aHMgZm9yIG1vbm9yZXBvcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHZhbGlkUGF0aHMgPSBbXG5cdFx0XHRcdCcuLi9mb2xkZXInLFxuXHRcdFx0XHQnLi4vc2hhcmVkLXNraWxscycsXG5cdFx0XHRcdCcuLi8uLi9jb21tb24vc2tpbGxzJyxcblx0XHRcdFx0Jy4uL3BhcmVudC9mb2xkZXInLFxuXHRcdFx0XTtcblxuXHRcdFx0Zm9yIChjb25zdCBwYXRoIG9mIHZhbGlkUGF0aHMpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGlzVmFsaWRQcm9tcHRGb2xkZXJQYXRoKHBhdGgpLFxuXHRcdFx0XHRcdHRydWUsXG5cdFx0XHRcdFx0YCcke3BhdGh9JyBtdXN0IGJlIGFjY2VwdGVkIGFzIGEgdmFsaWQgc2tpbGwgcGF0aCAocGFyZW50IHJlbGF0aXZlIHBhdGgpLmAsXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0VCgncmVqZWN0cyBhYnNvbHV0ZSBwYXRocycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGludmFsaWRQYXRocyA9IFtcblx0XHRcdFx0Ly8gVW5peCBhYnNvbHV0ZSBwYXRoc1xuXHRcdFx0XHQnL1VzZXJzL3VzZXJuYW1lL3NraWxscycsXG5cdFx0XHRcdCcvYWJzb2x1dGUvcGF0aCcsXG5cdFx0XHRcdCcvdXNyL2xvY2FsL3NraWxscycsXG5cdFx0XHRcdC8vIFdpbmRvd3MgYWJzb2x1dGUgcGF0aHNcblx0XHRcdFx0J0M6XFxcXFVzZXJzXFxcXHNraWxscycsXG5cdFx0XHRcdCdEOi9za2lsbHMnLFxuXHRcdFx0XHQnYzpcXFxcZm9sZGVyJyxcblx0XHRcdF07XG5cblx0XHRcdGZvciAoY29uc3QgcGF0aCBvZiBpbnZhbGlkUGF0aHMpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGlzVmFsaWRQcm9tcHRGb2xkZXJQYXRoKHBhdGgpLFxuXHRcdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRcdGAnJHtwYXRofScgbXVzdCBiZSByZWplY3RlZCAoYWJzb2x1dGUgcGF0aHMgbm90IHN1cHBvcnRlZCBmb3IgcG9ydGFiaWxpdHkpLmAsXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0VCgncmVqZWN0cyB0aWxkZSBwYXRocyB3aXRob3V0IHBhdGggc2VwYXJhdG9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW52YWxpZFBhdGhzID0gW1xuXHRcdFx0XHQnfmFiYycsXG5cdFx0XHRcdCd+c2tpbGxzJyxcblx0XHRcdFx0J34uY29uZmlnJyxcblx0XHRcdFx0Ly8gV2luZG93cy1zdHlsZSBiYWNrc2xhc2ggcGF0aHMgYXJlIG5vdCBzdXBwb3J0ZWQgZm9yIGNyb3NzLXBsYXRmb3JtIHNoYXJpbmdcblx0XHRcdFx0J35cXFxcZm9sZGVyJyxcblx0XHRcdFx0J35cXFxcLmNvcGlsb3RcXFxcc2tpbGxzJyxcblx0XHRcdF07XG5cblx0XHRcdGZvciAoY29uc3QgcGF0aCBvZiBpbnZhbGlkUGF0aHMpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGlzVmFsaWRQcm9tcHRGb2xkZXJQYXRoKHBhdGgpLFxuXHRcdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRcdGAnJHtwYXRofScgbXVzdCBiZSByZWplY3RlZCAodGlsZGUgbXVzdCBiZSBmb2xsb3dlZCBieSAvIG9ubHksIG5vdCBcXFxcKS5gLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdFQoJ3JlamVjdHMgcGF0aHMgd2l0aCBiYWNrc2xhc2hlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGludmFsaWRQYXRocyA9IFtcblx0XHRcdFx0J2ZvbGRlclxcXFxzdWJmb2xkZXInLFxuXHRcdFx0XHQnLlxcXFxza2lsbHMnLFxuXHRcdFx0XHQnLi5cXFxccGFyZW50XFxcXGZvbGRlcicsXG5cdFx0XHRcdCdteVxcXFxza2lsbHNcXFxcZm9sZGVyJyxcblx0XHRcdF07XG5cblx0XHRcdGZvciAoY29uc3QgcGF0aCBvZiBpbnZhbGlkUGF0aHMpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGlzVmFsaWRQcm9tcHRGb2xkZXJQYXRoKHBhdGgpLFxuXHRcdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRcdGAnJHtwYXRofScgbXVzdCBiZSByZWplY3RlZCAoYmFja3NsYXNoIHBhdGhzIG5vdCBzdXBwb3J0ZWQgZm9yIGNyb3NzLXBsYXRmb3JtIHNoYXJpbmcpLmAsXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0VCgncmVqZWN0cyBnbG9iIHBhdHRlcm5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW52YWxpZFBhdGhzID0gW1xuXHRcdFx0XHQnc2tpbGxzLyonLFxuXHRcdFx0XHQnc2tpbGxzLyoqJyxcblx0XHRcdFx0JyoqL3NraWxscycsXG5cdFx0XHRcdCdza2lsbHMvKi5tZCcsXG5cdFx0XHRcdCdza2lsbHMvKiovKi5tZCcsXG5cdFx0XHRcdCd7c2tpbGwxLHNraWxsMn0nLFxuXHRcdFx0XHQnc2tpbGxbMSwyLDNdJyxcblx0XHRcdFx0J3NraWxscz8nLFxuXHRcdFx0XHQnLi9za2lsbHMvKicsXG5cdFx0XHRcdCd+L3NraWxscy8qKicsXG5cdFx0XHRdO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHBhdGggb2YgaW52YWxpZFBhdGhzKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0XHRpc1ZhbGlkUHJvbXB0Rm9sZGVyUGF0aChwYXRoKSxcblx0XHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0XHRgJyR7cGF0aH0nIG11c3QgYmUgcmVqZWN0ZWQgKGdsb2IgcGF0dGVybnMgbm90IHN1cHBvcnRlZCBmb3IgcGVyZm9ybWFuY2UpLmAsXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0VCgncmVqZWN0cyBlbXB0eSBvciB3aGl0ZXNwYWNlIHBhdGhzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW52YWxpZFBhdGhzID0gW1xuXHRcdFx0XHQnJyxcblx0XHRcdFx0JyAgICcsXG5cdFx0XHRcdCdcXHQnLFxuXHRcdFx0XHQnXFxuJyxcblx0XHRcdF07XG5cblx0XHRcdGZvciAoY29uc3QgcGF0aCBvZiBpbnZhbGlkUGF0aHMpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGlzVmFsaWRQcm9tcHRGb2xkZXJQYXRoKHBhdGgpLFxuXHRcdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRcdGAnJHtwYXRofScgbXVzdCBiZSByZWplY3RlZCAoZW1wdHkgb3Igd2hpdGVzcGFjZSBvbmx5KS5gLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdFQoJ2hhbmRsZXMgcGF0aHMgd2l0aCBzcGFjZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB2YWxpZFBhdGhzID0gW1xuXHRcdFx0XHQnbXkgc2tpbGxzJyxcblx0XHRcdFx0Jy4vbXkgc2tpbGxzL2ZvbGRlcicsXG5cdFx0XHRcdCd+L215IHNraWxscycsXG5cdFx0XHRcdCcuLi9zaGFyZWQgc2tpbGxzJyxcblx0XHRcdF07XG5cblx0XHRcdGZvciAoY29uc3QgcGF0aCBvZiB2YWxpZFBhdGhzKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0XHRpc1ZhbGlkUHJvbXB0Rm9sZGVyUGF0aChwYXRoKSxcblx0XHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRcdGAnJHtwYXRofScgbXVzdCBiZSBhY2NlcHRlZCAocGF0aHMgd2l0aCBzcGFjZXMgYXJlIHZhbGlkKS5gLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaGFzR2xvYlBhdHRlcm4nLCAoKSA9PiB7XG5cdFx0dGVzdFQoJ2RldGVjdHMgc2luZ2xlIHdpbGRjYXJkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGF0aHNXaXRoR2xvYiA9IFtcblx0XHRcdFx0J3NraWxscy8qJyxcblx0XHRcdFx0J215LXNraWxscy8qJyxcblx0XHRcdFx0JyoubWQnLFxuXHRcdFx0XHQnKi9mb2xkZXInLFxuXHRcdFx0XTtcblxuXHRcdFx0Zm9yIChjb25zdCBwYXRoIG9mIHBhdGhzV2l0aEdsb2IpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGhhc0dsb2JQYXR0ZXJuKHBhdGgpLFxuXHRcdFx0XHRcdHRydWUsXG5cdFx0XHRcdFx0YCcke3BhdGh9JyBtdXN0IGJlIGRldGVjdGVkIGFzIGhhdmluZyBhIGdsb2IgcGF0dGVybi5gLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdFQoJ2RldGVjdHMgZG91YmxlIHdpbGRjYXJkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGF0aHNXaXRoR2xvYiA9IFtcblx0XHRcdFx0J3NraWxscy8qKicsXG5cdFx0XHRcdCcqKi9za2lsbHMnLFxuXHRcdFx0XHQnKiovKi5tZCcsXG5cdFx0XHRcdCdhLyoqL2InLFxuXHRcdFx0XTtcblxuXHRcdFx0Zm9yIChjb25zdCBwYXRoIG9mIHBhdGhzV2l0aEdsb2IpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGhhc0dsb2JQYXR0ZXJuKHBhdGgpLFxuXHRcdFx0XHRcdHRydWUsXG5cdFx0XHRcdFx0YCcke3BhdGh9JyBtdXN0IGJlIGRldGVjdGVkIGFzIGhhdmluZyBhIGdsb2IgcGF0dGVybi5gLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdFQoJ3JldHVybnMgZmFsc2UgZm9yIHBhdGhzIHdpdGhvdXQgd2lsZGNhcmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGF0aHNXaXRob3V0R2xvYiA9IFtcblx0XHRcdFx0J3NraWxscycsXG5cdFx0XHRcdCcuL3NraWxscy9mb2xkZXInLFxuXHRcdFx0XHQnfi9za2lsbHMnLFxuXHRcdFx0XHQnLi4vcGFyZW50L2ZvbGRlcicsXG5cdFx0XHRcdCcuZ2l0aHViL3Byb21wdHMnLFxuXHRcdFx0XTtcblxuXHRcdFx0Zm9yIChjb25zdCBwYXRoIG9mIHBhdGhzV2l0aG91dEdsb2IpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGhhc0dsb2JQYXR0ZXJuKHBhdGgpLFxuXHRcdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRcdGAnJHtwYXRofScgbXVzdCBub3QgYmUgZGV0ZWN0ZWQgYXMgaGF2aW5nIGEgZ2xvYiBwYXR0ZXJuLmAsXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRDb25maWdCYXNlZFNvdXJjZUZvbGRlcnMnLCAoKSA9PiB7XG5cdFx0dGVzdFQoJ2dldHMgdW5hbWJpZ3VvdXMgbGlzdCBvZiBmb2xkZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0TG9jYXRpb25zKHtcblx0XHRcdFx0Jy5naXRodWIvcHJvbXB0cyc6IHRydWUsXG5cdFx0XHRcdCcvVXNlcnMvKiovcmVwb3MvKionOiB0cnVlLFxuXHRcdFx0XHQnZ2VuL3RleHQvKionOiB0cnVlLFxuXHRcdFx0XHQnZ2VuL3RleHQvbmVzdGVkLyoucHJvbXB0Lm1kJzogdHJ1ZSxcblx0XHRcdFx0J2dlbmVyYWwvKic6IHRydWUsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9teS1wcm9tcHRzJzogdHJ1ZSxcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL3lvdXItcHJvbXB0cy8qLm1kJzogdHJ1ZSxcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9zaGFyZWQtcHJvbXB0cy8qJzogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZScsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMnLFxuXHRcdFx0XSk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtdKTtcblx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRhd2FpdCBsb2NhdG9yLmdldENvbmZpZ0Jhc2VkU291cmNlRm9sZGVycyhQcm9tcHRzVHlwZS5wcm9tcHQpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5naXRodWIvcHJvbXB0cycsXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy8uZ2l0aHViL3Byb21wdHMnLFxuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9uZXN0ZWQnLFxuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvZ2VuL3RleHQvbmVzdGVkJyxcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuZXJhbCcsXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9nZW5lcmFsJyxcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvbXktcHJvbXB0cycsXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL3lvdXItcHJvbXB0cycsXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9zaGFyZWQtcHJvbXB0cycsXG5cdFx0XHRcdF0sXG5cdFx0XHRcdCdNdXN0IGZpbmQgY29ycmVjdCBwcm9tcHRzLicsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZmluZEFnZW50TURzSW5Xb3Jrc3BhY2UnLCAoKSA9PiB7XG5cdFx0dGVzdFQoJ2ZpbmRzIEFHRU5UUy5tZCBmaWxlcyB1c2luZyBGaWxlU2VhcmNoUHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFsnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy93b3Jrc3BhY2UnXSk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3dvcmtzcGFjZS9BR0VOVFMubWQnLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbJyMgUm9vdCBhZ2VudHMnXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mvd29ya3NwYWNlL3NyYy9BR0VOVFMubWQnLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbJyMgU3JjIGFnZW50cyddXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IChhd2FpdCBsb2NhdG9yLmZpbmRBZ2VudE1Ec0luV29ya3NwYWNlKENhbmNlbGxhdGlvblRva2VuLk5vbmUpKS5tYXAoZiA9PiBmLnVyaSk7XG5cdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRyZXN1bHQsXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy93b3Jrc3BhY2UvQUdFTlRTLm1kJyxcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy93b3Jrc3BhY2Uvc3JjL0FHRU5UUy5tZCdcblx0XHRcdFx0XSxcblx0XHRcdFx0J011c3QgZmluZCBhbGwgQUdFTlRTLm1kIGZpbGVzIHVzaW5nIHNlYXJjaCBzZXJ2aWNlLidcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0VCgnZmluZHMgQUdFTlRTLm1kIGZpbGVzIHVzaW5nIGZpbGUgc2VydmljZSBmYWxsYmFjaycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoWycvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3dvcmtzcGFjZSddKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mvd29ya3NwYWNlL0FHRU5UUy5tZCcsXG5cdFx0XHRcdFx0Y29udGVudHM6IFsnIyBSb290IGFnZW50cyddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy93b3Jrc3BhY2Uvc3JjL0FHRU5UUy5tZCcsXG5cdFx0XHRcdFx0Y29udGVudHM6IFsnIyBTcmMgYWdlbnRzJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3dvcmtzcGFjZS9zcmMvbmVzdGVkL0FHRU5UUy5tZCcsXG5cdFx0XHRcdFx0Y29udGVudHM6IFsnIyBOZXN0ZWQgYWdlbnRzJ11cblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZWFyY2hTZXJ2aWNlLCB7XG5cdFx0XHRcdHNjaGVtZUhhc0ZpbGVTZWFyY2hQcm92aWRlcjogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdGFzeW5jIGZpbGVTZWFyY2goKSB7IHRocm93IG5ldyBFcnJvcignRmlsZVNlYXJjaFByb3ZpZGVyIG5vdCBhdmFpbGFibGUnKTsgfVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gKGF3YWl0IGxvY2F0b3IuZmluZEFnZW50TURzSW5Xb3Jrc3BhY2UoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLm1hcChmID0+IGYudXJpKTtcblx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdHJlc3VsdCxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3dvcmtzcGFjZS9BR0VOVFMubWQnLFxuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3dvcmtzcGFjZS9zcmMvQUdFTlRTLm1kJyxcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy93b3Jrc3BhY2Uvc3JjL25lc3RlZC9BR0VOVFMubWQnXG5cdFx0XHRcdF0sXG5cdFx0XHRcdCdNdXN0IGZpbmQgYWxsIEFHRU5UUy5tZCBmaWxlcyB1c2luZyBmaWxlIHNlcnZpY2UgZmFsbGJhY2suJ1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3RUKCdoYW5kbGVzIGNhbmNlbGxhdGlvbiB0b2tlbiBpbiBmaWxlIHNlcnZpY2UgZmFsbGJhY2snLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFsnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy93b3Jrc3BhY2UnXSk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3dvcmtzcGFjZS9BR0VOVFMubWQnLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbJyMgUm9vdCBhZ2VudHMnXVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlYXJjaFNlcnZpY2UsIHtcblx0XHRcdFx0c2NoZW1lSGFzRmlsZVNlYXJjaFByb3ZpZGVyOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0YXN5bmMgZmlsZVNlYXJjaCgpIHsgdGhyb3cgbmV3IEVycm9yKCdGaWxlU2VhcmNoUHJvdmlkZXIgbm90IGF2YWlsYWJsZScpOyB9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRjb25zdCBzb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdC8vIENhbmNlbCBpbW1lZGlhdGVseVxuXHRcdFx0c291cmNlLmNhbmNlbCgpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gKGF3YWl0IGxvY2F0b3IuZmluZEFnZW50TURzSW5Xb3Jrc3BhY2Uoc291cmNlLnRva2VuKSkubWFwKGYgPT4gZi51cmkpO1xuXHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0cmVzdWx0LFxuXHRcdFx0XHRbXSxcblx0XHRcdFx0J011c3QgcmV0dXJuIGVtcHR5IGFycmF5IHdoZW4gY2FuY2VsbGVkLidcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0fSk7XG5cblx0c3VpdGUoJ2dldFdvcmtzcGFjZUZvbGRlclJvb3RzJywgKCkgPT4ge1xuXHRcdGxldCBsb2NhdG9yOiBQcm9tcHRGaWxlc0xvY2F0b3I7XG5cblx0XHQvLyBPdmVycmlkZSBzZXRXb3Jrc3BhY2VGb2xkZXJzIHRvIGFsc28gY3JlYXRlIHRoZSBsb2NhdG9yXG5cdFx0Y29uc3Qgc2V0V29ya3NwYWNlRm9sZGVyc0ZvclJvb3RzID0gKHBhdGhzOiBzdHJpbmdbXSkgPT4ge1xuXHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhwYXRocyk7XG5cdFx0XHRsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblx0XHR9O1xuXG5cdFx0dGVzdFQoJ3JldHVybnMgb25seSB3b3Jrc3BhY2UgZm9sZGVyIHdoZW4gaXQgaGFzIC5naXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzRm9yUm9vdHMoWycvcmVwb3MvbXktcHJvamVjdCddKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7IHBhdGg6ICcvcmVwb3MvbXktcHJvamVjdC8uZ2l0L0hFQUQnLCBjb250ZW50czogWydyZWY6IHJlZnMvaGVhZHMvbWFpbiddIH0sXG5cdFx0XHRcdHsgcGF0aDogJy9yZXBvcy9teS1wcm9qZWN0L3NyYy9pbmRleC50cycsIGNvbnRlbnRzOiBbJ2V4cG9ydCB7fTsnXSB9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHJvb3RzID0gYXdhaXQgbG9jYXRvci5nZXRXb3Jrc3BhY2VGb2xkZXJSb290cyh0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJvb3RzLm1hcChyID0+IHIucGF0aCksXG5cdFx0XHRcdFsnL3JlcG9zL215LXByb2plY3QnXSxcblx0XHRcdFx0J1Nob3VsZCBvbmx5IHJldHVybiB0aGUgd29ya3NwYWNlIGZvbGRlciBpdHNlbGYgd2hlbiBpdCBoYXMgLmdpdCcsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdFQoJ3dhbGtzIHVwIHRvIHBhcmVudCB3aXRoIC5naXQgd2hlbiB3b3Jrc3BhY2UgZm9sZGVyIGhhcyBubyAuZ2l0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0V29ya3NwYWNlRm9sZGVyc0ZvclJvb3RzKFsnL3JlcG9zL21vbm9yZXBvL3BhY2thZ2VzL215LWFwcCddKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7IHBhdGg6ICcvcmVwb3MvbW9ub3JlcG8vLmdpdC9IRUFEJywgY29udGVudHM6IFsncmVmOiByZWZzL2hlYWRzL21haW4nXSB9LFxuXHRcdFx0XHR7IHBhdGg6ICcvcmVwb3MvbW9ub3JlcG8vcGFja2FnZXMvbXktYXBwL3NyYy9pbmRleC50cycsIGNvbnRlbnRzOiBbJ2V4cG9ydCB7fTsnXSB9LFxuXHRcdFx0XSk7XG5cblx0XHRcdHdvcmtzcGFjZVRydXN0U2VydmljZS5zZXRUcnVzdGVkVXJpcyhbVVJJLmZpbGUoJy9yZXBvcy9tb25vcmVwbycpXSk7XG5cblx0XHRcdGNvbnN0IHJvb3RzID0gYXdhaXQgbG9jYXRvci5nZXRXb3Jrc3BhY2VGb2xkZXJSb290cyh0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJvb3RzLm1hcChyID0+IHIucGF0aCkuc29ydCgpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Jy9yZXBvcy9tb25vcmVwbycsXG5cdFx0XHRcdFx0Jy9yZXBvcy9tb25vcmVwby9wYWNrYWdlcycsXG5cdFx0XHRcdFx0Jy9yZXBvcy9tb25vcmVwby9wYWNrYWdlcy9teS1hcHAnLFxuXHRcdFx0XHRdLnNvcnQoKSxcblx0XHRcdFx0J1Nob3VsZCBpbmNsdWRlIHdvcmtzcGFjZSBmb2xkZXIgYW5kIGFsbCBwYXJlbnRzIHVwIHRvIHRoZSBvbmUgd2l0aCAuZ2l0Jyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0VCgnZG9lcyBub3Qgd2FsayB1cCB3aGVuIGluY2x1ZGVQYXJlbnRzIGlzIGZhbHNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0V29ya3NwYWNlRm9sZGVyc0ZvclJvb3RzKFsnL3JlcG9zL21vbm9yZXBvL3BhY2thZ2VzL215LWFwcCddKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7IHBhdGg6ICcvcmVwb3MvbW9ub3JlcG8vLmdpdC9IRUFEJywgY29udGVudHM6IFsncmVmOiByZWZzL2hlYWRzL21haW4nXSB9LFxuXHRcdFx0XHR7IHBhdGg6ICcvcmVwb3MvbW9ub3JlcG8vcGFja2FnZXMvbXktYXBwL3NyYy9pbmRleC50cycsIGNvbnRlbnRzOiBbJ2V4cG9ydCB7fTsnXSB9LFxuXHRcdFx0XSk7XG5cblx0XHRcdHdvcmtzcGFjZVRydXN0U2VydmljZS5zZXRUcnVzdGVkVXJpcyhbVVJJLmZpbGUoJy9yZXBvcy9tb25vcmVwbycpXSk7XG5cblx0XHRcdGNvbnN0IHJvb3RzID0gYXdhaXQgbG9jYXRvci5nZXRXb3Jrc3BhY2VGb2xkZXJSb290cyhmYWxzZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyb290cy5tYXAociA9PiByLnBhdGgpLFxuXHRcdFx0XHRbJy9yZXBvcy9tb25vcmVwby9wYWNrYWdlcy9teS1hcHAnXSxcblx0XHRcdFx0J1Nob3VsZCBvbmx5IHJldHVybiB3b3Jrc3BhY2UgZm9sZGVycyB3aGVuIGluY2x1ZGVQYXJlbnRzIGlzIGZhbHNlJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0VCgnZXhjbHVkZXMgdnNjb2RlLWFnZW50LWhvc3Qgd29ya3NwYWNlIGZvbGRlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBBZ2VudCBob3N0IGZvbGRlcnMgc3VyZmFjZSBjdXN0b21pemF0aW9ucyB0aHJvdWdoIEFIUCwgbm90IHZpYVxuXHRcdFx0Ly8gZmlsZXN5c3RlbSBzY2FubmluZy4gSW5jbHVkaW5nIHRoZW0gaGVyZSB3b3VsZCBpc3N1ZSBhIGByZXNvdXJjZUxpc3RgXG5cdFx0XHQvLyBKU09OLVJQQyBwZXIgY29uZmlndXJlZCBsb2NhdGlvbiBmb3IgZXZlcnkgbm9uZXhpc3RlbnQgYC5naXRodWJgIC9cblx0XHRcdC8vIGAuY2xhdWRlYCBmb2xkZXIgb24gdGhlIHJlbW90ZS5cblx0XHRcdGNvbnN0IGxvY2FsRm9sZGVyID0gVVJJLmZpbGUoJy9yZXBvcy9sb2NhbC1wcm9qZWN0Jyk7XG5cdFx0XHRjb25zdCBhZ2VudEhvc3RGb2xkZXIgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ3ZzY29kZS1hZ2VudC1ob3N0JywgYXV0aG9yaXR5OiAncmVtb3RlJywgcGF0aDogJy9yZXBvcy9yZW1vdGUtcHJvamVjdCcgfSk7XG5cdFx0XHRjb25zdCBmb2xkZXJzID0gW2xvY2FsRm9sZGVyLCBhZ2VudEhvc3RGb2xkZXJdLm1hcCgodXJpLCBpbmRleCkgPT4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya3NwYWNlRm9sZGVyPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgdXJpID0gdXJpO1xuXHRcdFx0XHRvdmVycmlkZSBuYW1lID0gYmFzZW5hbWUodXJpKTtcblx0XHRcdFx0b3ZlcnJpZGUgaW5kZXggPSBpbmRleDtcblx0XHRcdH0pO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIG1vY2tXb3Jrc3BhY2VTZXJ2aWNlKGZvbGRlcnMpKTtcblx0XHRcdGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHsgcGF0aDogJy9yZXBvcy9sb2NhbC1wcm9qZWN0Ly5naXQvSEVBRCcsIGNvbnRlbnRzOiBbJ3JlZjogcmVmcy9oZWFkcy9tYWluJ10gfSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByb290cyA9IGF3YWl0IGxvY2F0b3IuZ2V0V29ya3NwYWNlRm9sZGVyUm9vdHModHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyb290cy5tYXAociA9PiByLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRbbG9jYWxGb2xkZXIudG9TdHJpbmcoKV0sXG5cdFx0XHRcdCdTaG91bGQgZXhjbHVkZSB2c2NvZGUtYWdlbnQtaG9zdCB3b3Jrc3BhY2UgZm9sZGVycyBmcm9tIHByb21wdC1maWxlIGRpc2NvdmVyeSByb290cycsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdFQoJ3JldHVybnMgb25seSB3b3Jrc3BhY2UgZm9sZGVyIHdoZW4gbm8gLmdpdCBpcyBmb3VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnNGb3JSb290cyhbJy9Vc2Vycy9sZWdvbXVzaHJvb20vbXktcHJvamVjdCddKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7IHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL215LXByb2plY3Qvc3JjL2luZGV4LnRzJywgY29udGVudHM6IFsnZXhwb3J0IHt9OyddIH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3Qgcm9vdHMgPSBhd2FpdCBsb2NhdG9yLmdldFdvcmtzcGFjZUZvbGRlclJvb3RzKHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cm9vdHMubWFwKHIgPT4gci5wYXRoKSxcblx0XHRcdFx0WycvVXNlcnMvbGVnb211c2hyb29tL215LXByb2plY3QnXSxcblx0XHRcdFx0J1Nob3VsZCBvbmx5IHJldHVybiB0aGUgd29ya3NwYWNlIGZvbGRlciB3aGVuIG5vIC5naXQgaXMgZm91bmQgaW4gYW55IHBhcmVudCcsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblx0c3VpdGUoJ2dldEhvb2tTb3VyY2VGb2xkZXJzJywgKCkgPT4ge1xuXHRcdHRlc3RUKCdyZXR1cm5zIHNvdXJjZSBtZXRhZGF0YSBmb3IgaG9vayBmb2xkZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uZmlnVmFsdWVzW1Byb21wdHNDb25maWcuSE9PS1NfTE9DQVRJT05fS0VZXSA9IHtcblx0XHRcdFx0Jy5naXRodWIvaG9va3MnOiB0cnVlLFxuXHRcdFx0XHQnfi8uY29waWxvdC9ob29rcyc6IHRydWUsXG5cdFx0XHRcdC8vIGRpc2FibGUgQ2xhdWRlIHBhdGhzICh3aGljaCBhcmUgZmlsdGVyZWQgb3V0IGFueXdheSlcblx0XHRcdFx0Jy5jbGF1ZGUvc2V0dGluZ3MuanNvbic6IGZhbHNlLFxuXHRcdFx0XHQnLmNsYXVkZS9zZXR0aW5ncy5sb2NhbC5qc29uJzogZmFsc2UsXG5cdFx0XHRcdCd+Ly5jbGF1ZGUvc2V0dGluZ3MuanNvbic6IGZhbHNlLFxuXHRcdFx0fTtcblx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoWycvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZSddKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW10pO1xuXHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdGNvbnN0IGZvbGRlcnMgPSBhd2FpdCBsb2NhdG9yLmdldEhvb2tTb3VyY2VGb2xkZXJzKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGZvbGRlcnMubWFwKGYgPT4gKHsgcGF0aDogZi51cmkucGF0aCwgc291cmNlOiBmLnNvdXJjZSwgc3RvcmFnZTogZi5zdG9yYWdlIH0pKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgcGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5naXRodWIvaG9va3MnLCBzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuR2l0SHViV29ya3NwYWNlLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCB9LFxuXHRcdFx0XHRcdHsgcGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vLmNvcGlsb3QvaG9va3MnLCBzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuQ29waWxvdFBlcnNvbmFsLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdFQoJ2V4Y2x1ZGVzIENsYXVkZSBwYXRocycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbmZpZ1ZhbHVlc1tQcm9tcHRzQ29uZmlnLkhPT0tTX0xPQ0FUSU9OX0tFWV0gPSB7XG5cdFx0XHRcdCcuZ2l0aHViL2hvb2tzJzogdHJ1ZSxcblx0XHRcdFx0Jy5jbGF1ZGUvc2V0dGluZ3MuanNvbic6IHRydWUsXG5cdFx0XHRcdCcuY2xhdWRlL3NldHRpbmdzLmxvY2FsLmpzb24nOiB0cnVlLFxuXHRcdFx0XHQnfi8uY2xhdWRlL3NldHRpbmdzLmpzb24nOiB0cnVlLFxuXHRcdFx0XHQnfi8uY29waWxvdC9ob29rcyc6IHRydWUsXG5cdFx0XHR9O1xuXHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlJ10pO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXSk7XG5cdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0Y29uc3QgZm9sZGVycyA9IGF3YWl0IGxvY2F0b3IuZ2V0SG9va1NvdXJjZUZvbGRlcnMoKTtcblxuXHRcdFx0Ly8gQ2xhdWRlIHBhdGhzIHNob3VsZCBiZSBmaWx0ZXJlZCBvdXRcblx0XHRcdGNvbnN0IHBhdGhzID0gZm9sZGVycy5tYXAoZiA9PiBmLnVyaS5wYXRoKTtcblx0XHRcdGFzc2VydC5vayghcGF0aHMuc29tZShwID0+IHAuaW5jbHVkZXMoJy5jbGF1ZGUnKSksICdDbGF1ZGUgcGF0aHMgbXVzdCBiZSBleGNsdWRlZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXRocywgW1xuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmdpdGh1Yi9ob29rcycsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tLy5jb3BpbG90L2hvb2tzJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbGlzdEZpbGVzIHdpdGggUHJvbXB0c1R5cGUuaG9vaycsICgpID0+IHtcblx0XHR0ZXN0VCgnb25seSByZXR1cm5zIHRhcmdldGVkIGpzb24gZmlsZXMsIG5vdCBzaWJsaW5nIGpzb24gZmlsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25maWdWYWx1ZXNbUHJvbXB0c0NvbmZpZy5IT09LU19MT0NBVElPTl9LRVldID0ge1xuXHRcdFx0XHQnLmNsYXVkZS9zZXR0aW5ncy5qc29uJzogdHJ1ZSxcblx0XHRcdFx0Jy5jbGF1ZGUvc2V0dGluZ3MubG9jYWwuanNvbic6IHRydWUsXG5cdFx0XHRcdCd+Ly5jbGF1ZGUvc2V0dGluZ3MuanNvbic6IHRydWUsXG5cdFx0XHRcdCcuZ2l0aHViL2hvb2tzJzogdHJ1ZSxcblx0XHRcdFx0J34vLmNvcGlsb3QvaG9va3MnOiB0cnVlLFxuXHRcdFx0fTtcblx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoWycvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZSddKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHQvLyB0YXJnZXRlZCBmaWxlcyB0aGF0IHNob3VsZCBiZSBmb3VuZFxuXHRcdFx0XHR7IHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uY2xhdWRlL3NldHRpbmdzLmpzb24nLCBjb250ZW50czogWyd7fSddIH0sXG5cdFx0XHRcdHsgcGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5jbGF1ZGUvc2V0dGluZ3MubG9jYWwuanNvbicsIGNvbnRlbnRzOiBbJ3t9J10gfSxcblx0XHRcdFx0Ly8gc2libGluZyBmaWxlcyBpbiAuY2xhdWRlLyB0aGF0IHNob3VsZCBOT1QgYmUgZm91bmRcblx0XHRcdFx0eyBwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmNsYXVkZS9jb25maWcuanNvbicsIGNvbnRlbnRzOiBbJ3t9J10gfSxcblx0XHRcdFx0eyBwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmNsYXVkZS9zdGF0cy1jYWNoZS5qc29uJywgY29udGVudHM6IFsne30nXSB9LFxuXHRcdFx0XHQvLyBob29rIGRpcmVjdG9yeSBmaWxlcyB0aGF0IHNob3VsZCBiZSBmb3VuZFxuXHRcdFx0XHR7IHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uZ2l0aHViL2hvb2tzL3ByZS1jb21taXQuanNvbicsIGNvbnRlbnRzOiBbJ3t9J10gfSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdGNvbnN0IGZpbGVzID0gYXdhaXQgbG9jYXRvci5saXN0RmlsZXMoUHJvbXB0c1R5cGUuaG9vaywgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0ZmlsZXMubWFwKGYgPT4gZi5wYXRoKS5zb3J0KCksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmNsYXVkZS9zZXR0aW5ncy5qc29uJyxcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmNsYXVkZS9zZXR0aW5ncy5sb2NhbC5qc29uJyxcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmdpdGh1Yi9ob29rcy9wcmUtY29tbWl0Lmpzb24nLFxuXHRcdFx0XHRdLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3RUKCdyZXR1cm5zIGhvb2sgZmlsZXMgZnJvbSB1c2VyIGhvbWUgc3BlY2lmaWMganNvbiBwYXRocycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbmZpZ1ZhbHVlc1tQcm9tcHRzQ29uZmlnLkhPT0tTX0xPQ0FUSU9OX0tFWV0gPSB7XG5cdFx0XHRcdCd+Ly5jbGF1ZGUvc2V0dGluZ3MuanNvbic6IHRydWUsXG5cdFx0XHRcdCd+Ly5jb3BpbG90L2hvb2tzJzogdHJ1ZSxcblx0XHRcdH07XG5cdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFsnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnXSk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0Ly8gdGFyZ2V0ZWQgdXNlciBmaWxlXG5cdFx0XHRcdHsgcGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vLmNsYXVkZS9zZXR0aW5ncy5qc29uJywgY29udGVudHM6IFsne30nXSB9LFxuXHRcdFx0XHQvLyBzaWJsaW5nIGZpbGVzIHRoYXQgc2hvdWxkIE5PVCBiZSBmb3VuZFxuXHRcdFx0XHR7IHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tLy5jbGF1ZGUvY29uZmlnLmpzb24nLCBjb250ZW50czogWyd7fSddIH0sXG5cdFx0XHRcdHsgcGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vLmNsYXVkZS9zdGF0cy1jYWNoZS5qc29uJywgY29udGVudHM6IFsne30nXSB9LFxuXHRcdFx0XHQvLyBob29rIGRpcmVjdG9yeSBmaWxlc1xuXHRcdFx0XHR7IHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tLy5jb3BpbG90L2hvb2tzL215LWhvb2suanNvbicsIGNvbnRlbnRzOiBbJ3t9J10gfSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdGNvbnN0IGZpbGVzID0gYXdhaXQgbG9jYXRvci5saXN0RmlsZXMoUHJvbXB0c1R5cGUuaG9vaywgUHJvbXB0c1N0b3JhZ2UudXNlciwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRmaWxlcy5tYXAoZiA9PiBmLnBhdGgpLnNvcnQoKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tLy5jbGF1ZGUvc2V0dGluZ3MuanNvbicsXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vLmNvcGlsb3QvaG9va3MvbXktaG9vay5qc29uJyxcblx0XHRcdFx0XSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRTb3VyY2VEZXNjcmlwdGlvbicsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIGRlc2NyaXB0aW9ucyBmb3IgYWxsIGtub3duIGZvbGRlciBzb3VyY2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZm9sZGVyU291cmNlczogUHJvbXB0RmlsZVNvdXJjZVtdID0gW1xuXHRcdFx0XHRQcm9tcHRGaWxlU291cmNlLkFnZW50c1dvcmtzcGFjZSxcblx0XHRcdFx0UHJvbXB0RmlsZVNvdXJjZS5BZ2VudHNQZXJzb25hbCxcblx0XHRcdFx0UHJvbXB0RmlsZVNvdXJjZS5HaXRIdWJXb3Jrc3BhY2UsXG5cdFx0XHRcdFByb21wdEZpbGVTb3VyY2UuQ29waWxvdFBlcnNvbmFsLFxuXHRcdFx0XHRQcm9tcHRGaWxlU291cmNlLkNsYXVkZVdvcmtzcGFjZSxcblx0XHRcdFx0UHJvbXB0RmlsZVNvdXJjZS5DbGF1ZGVXb3Jrc3BhY2VMb2NhbCxcblx0XHRcdFx0UHJvbXB0RmlsZVNvdXJjZS5DbGF1ZGVQZXJzb25hbCxcblx0XHRcdFx0UHJvbXB0RmlsZVNvdXJjZS5Vc2VyRGF0YSxcblx0XHRcdFx0UHJvbXB0RmlsZVNvdXJjZS5Db25maWdXb3Jrc3BhY2UsXG5cdFx0XHRcdFByb21wdEZpbGVTb3VyY2UuQ29uZmlnUGVyc29uYWwsXG5cdFx0XHRdO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHNvdXJjZSBvZiBmb2xkZXJTb3VyY2VzKSB7XG5cdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gZ2V0U291cmNlRGVzY3JpcHRpb24oc291cmNlKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHR5cGVvZiBkZXNjcmlwdGlvbiA9PT0gJ3N0cmluZycgJiYgZGVzY3JpcHRpb24ubGVuZ3RoID4gMCwgYEV4cGVjdGVkIGEgZGVzY3JpcHRpb24gZm9yICR7c291cmNlfWApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIGV4dGVuc2lvbi9wbHVnaW4gc291cmNlcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTb3VyY2VEZXNjcmlwdGlvbihQcm9tcHRGaWxlU291cmNlLkV4dGVuc2lvbkNvbnRyaWJ1dGlvbiksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U291cmNlRGVzY3JpcHRpb24oUHJvbXB0RmlsZVNvdXJjZS5FeHRlbnNpb25BUEkpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNvdXJjZURlc2NyaXB0aW9uKFByb21wdEZpbGVTb3VyY2UuUGx1Z2luKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuZnVuY3Rpb24gYXNzZXJ0T3V0Y29tZShhY3R1YWw6IHJlYWRvbmx5IFVSSVtdLCBleHBlY3RlZDogc3RyaW5nW10sIG1lc3NhZ2U6IHN0cmluZykge1xuXHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5tYXAoKHVyaSkgPT4gdXJpLnBhdGgpLCBleHBlY3RlZCwgbWVzc2FnZSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsYUFBYTtBQUN0QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxVQUFVLG9CQUFvQjtBQUN2QyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQWtDLDZCQUE2QjtBQUMvRCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQXFCLGdDQUFrRDtBQUN2RSxTQUFTLG9DQUFvQztBQUM3QyxTQUFpQyxzQkFBc0I7QUFDdkQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0Isa0JBQWtCLG1CQUFtQjtBQUNwRSxTQUFTLGdCQUFnQixhQUFhLHlCQUF5QiwwQkFBMEI7QUFDekYsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw0QkFBNEIsMkNBQTJDO0FBQ2hGLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsd0NBQXdDO0FBS2pELFNBQVMsa0JBQWtCLGNBQThEO0FBQ3hGLFNBQU8sWUFBbUM7QUFBQSxJQUN6QyxTQUFTLEtBQXdDO0FBRWhELFVBQUksT0FBTyxRQUFRLFVBQVU7QUFDNUIs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QSxjQUN4RjtBQUFBLGdCQUNDO0FBQUEsZ0JBQ0E7QUFBQSxnQkFDQTtBQUFBLGdCQUNBO0FBQUEsY0FDRDtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUFBLFFBQ0QsQ0FBQztBQUVELGNBQU0sWUFBWSxZQUFZO0FBQzdCLGdCQUFNLGVBQWU7QUFBQSxZQUNwQjtBQUFBLGNBQ0M7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEs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LGdCQUNBO0FBQUEsY0FDRDtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsVUFFRDtBQUFBLFFBQ0QsQ0FBQztBQUVELGNBQU0sWUFBWSxZQUFZO0FBQzdCLGdCQUFNLGVBQWU7QUFBQSxZQUNwQjtBQUFBLGNBQ0M7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7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O0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUVBLHFCQUFXLFlBQVksY0FB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O0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFFQSxxQkFBVyxZQUFZLGNBQWM7QUFDcEMsa0JBQU0saUJBQTBDLENBQUM7QUFDakQsdUJBQVcsV0FBVyxVQUFVO0FBQy9CLDZCQUFlLE9BQU8sSUFBSTtBQUFBLFlBQzNCO0FBRUEseUJBQWEsY0FBYztBQUMzQixnQ0FBb0I7QUFBQSxjQUNuQjtBQUFBLGNBQ0E7QUFBQSxZQUNELENBQUM7QUFDRCxrQkFBTSxVQUFVLGFBQWE7QUFBQSxjQUM1QjtBQUFBLGdCQUNDLE1BQU07QUFBQSxnQkFDTixVQUFVLENBQUMsYUFBYTtBQUFBLGNBQ3pCO0FBQUEsY0FDQTtBQUFBLGdCQUNDLE1BQU07QUFBQSxnQkFDTixVQUFVLENBQUMsYUFBYTtBQUFBLGNBQ3pCO0FBQUEsY0FDQTtBQUFBLGdCQUNDLE1BQU07QUFBQSxnQkFDTixVQUFVLENBQUMsZUFBZTtBQUFBLGNBQzNCO0FBQUEsY0FDQTtBQUFBLGdCQUNDLE1BQU07QUFBQSxnQkFDTixVQUFVLENBQUMsZUFBZTtBQUFBLGNBQzNCO0FBQUEsY0FDQTtBQUFBLGdCQUNDLE1BQU07QUFBQSxnQkFDTixVQUFVLENBQUMsaUJBQWlCO0FBQUEsY0FDN0I7QUFBQSxjQUNBO0FBQUEsZ0JBQ0MsTUFBTTtBQUFBLGdCQUNOLFVBQVUsQ0FBQyxhQUFhO0FBQUEsY0FDekI7QUFBQSxjQUNBO0FBQUEsZ0JBQ0MsTUFBTTtBQUFBLGdCQUNOLFVBQVUsQ0FBQyxlQUFlO0FBQUEsY0FDM0I7QUFBQSxjQUNBO0FBQUEsZ0JBQ0MsTUFBTTtBQUFBLGdCQUNOLFVBQVUsQ0FBQyxpQkFBaUI7QUFBQSxjQUM3QjtBQUFBLFlBQ0QsQ0FBQztBQUNELGtCQUFNLFVBQVUscUJBQXFCLGVBQWUsa0JBQWtCO0FBRXRFO0FBQUEsY0FDQyxNQUFNLFFBQVEsVUFBVSxZQUFZLFFBQVEsZUFBZSxPQUFPLGtCQUFrQixJQUFJO0FBQUEsY0FDeEY7QUFBQSxnQkFDQztBQUFBLGdCQUNBO0FBQUEsZ0JBQ0E7QUFBQSxnQkFDQTtBQUFBO0FBQUEsZ0JBRUE7QUFBQSxnQkFDQTtBQUFBLGNBQ0Q7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFVBRUQ7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGLENBQUM7QUFFRCxZQUFNLFlBQVksTUFBTTtBQUN2QixjQUFNLGFBQWEsWUFBWTtBQUM5QixnQkFBTSxlQUFlO0FBQUEsWUFDcEI7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUVBLHFCQUFXLFdBQVcsY0FBYztBQUNuQyx5QkFBYSxFQUFFLENBQUMsT0FBTyxHQUFHLEtBQUssQ0FBQztBQUNoQyxnQ0FBb0I7QUFBQSxjQUNuQjtBQUFBLGNBQ0E7QUFBQSxZQUNELENBQUM7QUFDRCxrQkFBTSxVQUFVLGFBQWE7QUFBQSxjQUM1QjtBQUFBLGdCQUNDLE1BQU07QUFBQSxnQkFDTixVQUFVLENBQUMsYUFBYTtBQUFBLGNBQ3pCO0FBQUEsY0FDQTtBQUFBLGdCQUNDLE1BQU07QUFBQSxnQkFDTixVQUFVLENBQUMsYUFBYTtBQUFBLGNBQ3pCO0FBQUEsY0FDQTtBQUFBLGdCQUNDLE1BQU07QUFBQSxnQkFDTixVQUFVLENBQUMsZUFBZTtBQUFBLGNBQzNCO0FBQUEsY0FDQTtBQUFBLGdCQUNDLE1BQU07QUFBQSxnQkFDTixVQUFVLENBQUMsZUFBZTtBQUFBLGNBQzNCO0FBQUEsY0FDQTtBQUFBLGdCQUNDLE1BQU07QUFBQSxnQkFDTixVQUFVLENBQUMsaUJBQWlCO0FBQUEsY0FDN0I7QUFBQSxjQUNBO0FBQUEsZ0JBQ0MsTUFBTTtBQUFBLGdCQUNOLFVBQVUsQ0FBQyxhQUFhO0FBQUEsY0FDekI7QUFBQSxjQUNBO0FBQUEsZ0JBQ0MsTUFBTTtBQUFBLGdCQUNOLFVBQVUsQ0FBQyxlQUFlO0FBQUEsY0FDM0I7QUFBQSxjQUNBO0FBQUEsZ0JBQ0MsTUFBTTtBQUFBLGdCQUNOLFVBQVUsQ0FBQyxpQkFBaUI7QUFBQSxjQUM3QjtBQUFBLFlBQ0QsQ0FBQztBQUNELGtCQUFNLFVBQVUscUJBQXFCLGVBQWUsa0JBQWtCO0FBRXRFO0FBQUEsY0FDQyxNQUFNLFFBQVEsVUFBVSxZQUFZLFFBQVEsZUFBZSxPQUFPLGtCQUFrQixJQUFJO0FBQUEsY0FDeEY7QUFBQSxnQkFDQztBQUFBLGdCQUNBO0FBQUEsZ0JBQ0E7QUFBQSxnQkFDQTtBQUFBO0FBQUEsZ0JBRUE7QUFBQSxnQkFDQTtBQUFBLGNBQ0Q7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFVBRUQ7QUFBQSxRQUNELENBQUM7QUFFRCxjQUFNLFlBQVksWUFBWTtBQUM3QixnQkFBTSxlQUFlO0FBQUEsWUFDcEI7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUVBLHFCQUFXLFlBQVksY0FBYztBQUNwQyxrQkFBTSxpQkFBMEMsQ0FBQztBQUNqRCx1QkFBVyxXQUFXLFVBQVU7QUFDL0IsNkJBQWUsT0FBTyxJQUFJO0FBQUEsWUFDM0I7QUFFQSx5QkFBYSxjQUFjO0FBQzNCLGdDQUFvQjtBQUFBLGNBQ25CO0FBQUEsY0FDQTtBQUFBLFlBQ0QsQ0FBQztBQUNELGtCQUFNLFVBQVUsYUFBYTtBQUFBLGNBQzVCO0FBQUEsZ0JBQ0MsTUFBTTtBQUFBLGdCQUNOLFVBQVUsQ0FBQyxhQUFhO0FBQUEsY0FDekI7QUFBQSxjQUNBO0FBQUEsZ0JBQ0MsTUFBTTtBQUFBLGdCQUNOLFVBQVUsQ0FBQyxhQUFhO0FBQUEsY0FDekI7QUFBQSxjQUNBO0FBQUEsZ0JBQ0MsTUFBTTtBQUFBLGdCQUNOLFVBQVUsQ0FBQyxlQUFlO0FBQUEsY0FDM0I7QUFBQSxjQUNBO0FBQUEsZ0JBQ0MsTUFBTTtBQUFBLGdCQUNOLFVBQVUsQ0FBQyxlQUFlO0FBQUEsY0FDM0I7QUFBQSxjQUNBO0FBQUEsZ0JBQ0MsTUFBTTtBQUFBLGdCQUNOLFVBQVUsQ0FBQyxpQkFBaUI7QUFBQSxjQUM3QjtBQUFBLGNBQ0E7QUFBQSxnQkFDQyxNQUFNO0FBQUEsZ0JBQ04sVUFBVSxDQUFDLGFBQWE7QUFBQSxjQUN6QjtBQUFBLGNBQ0E7QUFBQSxnQkFDQyxNQUFNO0FBQUEsZ0JBQ04sVUFBVSxDQUFDLGVBQWU7QUFBQSxjQUMzQjtBQUFBLGNBQ0E7QUFBQSxnQkFDQyxNQUFNO0FBQUEsZ0JBQ04sVUFBVSxDQUFDLGlCQUFpQjtBQUFBLGNBQzdCO0FBQUEsWUFDRCxDQUFDO0FBQ0Qsa0JBQU0sVUFBVSxxQkFBcUIsZUFBZSxrQkFBa0I7QUFFdEU7QUFBQSxjQUNDLE1BQU0sUUFBUSxVQUFVLFlBQVksUUFBUSxlQUFlLE9BQU8sa0JBQWtCLElBQUk7QUFBQSxjQUN4RjtBQUFBLGdCQUNDO0FBQUEsZ0JBQ0E7QUFBQSxnQkFDQTtBQUFBLGdCQUNBO0FBQUE7QUFBQSxnQkFFQTtBQUFBLGdCQUNBO0FBQUEsY0FDRDtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsVUFFRDtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sZ0JBQWdCLE1BQU07QUFDM0IsVUFBTSxzRUFBc0UsWUFBWTtBQUN2RixtQkFBYTtBQUFBLFFBQ1osd0JBQXdCO0FBQUEsUUFDeEIsaUJBQWlCO0FBQUEsUUFDakIsMkJBQTJCO0FBQUEsTUFDNUIsQ0FBQztBQUNELDBCQUFvQixDQUFDLGtDQUFrQyxDQUFDO0FBQ3hELFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLFVBQVUsQ0FBQyxtQkFBbUI7QUFBQSxRQUMvQjtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLFVBQVUsQ0FBQyxvQkFBb0I7QUFBQSxRQUNoQztBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLFVBQVUsQ0FBQyxrQkFBa0I7QUFBQSxRQUM5QjtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLFVBQVUsQ0FBQyxrQkFBa0I7QUFBQSxRQUM5QjtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSxxQkFBcUIsZUFBZSxrQkFBa0I7QUFFdEU7QUFBQSxRQUNDLE1BQU0sUUFBUSxVQUFVLFlBQVksY0FBYyxlQUFlLE9BQU8sa0JBQWtCLElBQUk7QUFBQSxRQUM5RjtBQUFBLFVBQ0M7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLFVBQVUsTUFBTTtBQUNyQixVQUFNLG1CQUFtQixNQUFNO0FBQzlCLFlBQU0sNkNBQTZDLFlBQVk7QUFDOUQscUJBQWE7QUFBQSxVQUNaLGtCQUFrQjtBQUFBO0FBQUEsVUFFbEIsa0JBQWtCO0FBQUEsVUFDbEIscUJBQXFCO0FBQUEsVUFDckIsb0JBQW9CO0FBQUEsUUFDckIsQ0FBQztBQUNELDRCQUFvQixDQUFDLGtDQUFrQyxDQUFDO0FBQ3hELGNBQU0sVUFBVSxhQUFhO0FBQUEsVUFDNUI7QUFBQSxZQUNDLE1BQU07QUFBQSxZQUNOLFVBQVUsQ0FBQyxjQUFjO0FBQUEsVUFDMUI7QUFBQSxVQUNBO0FBQUEsWUFDQyxNQUFNO0FBQUEsWUFDTixVQUFVLENBQUMsZUFBZTtBQUFBLFVBQzNCO0FBQUEsUUFDRCxDQUFDO0FBQ0QsY0FBTSxVQUFVLHFCQUFxQixlQUFlLGtCQUFrQjtBQUV0RSxjQUFNLFNBQVMsTUFBTSxRQUFRLGdCQUFnQixrQkFBa0IsSUFBSTtBQUNuRTtBQUFBLFVBQ0MsT0FBTyxJQUFJLE9BQUssRUFBRSxHQUFHO0FBQUEsVUFDckI7QUFBQSxZQUNDO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sb0NBQW9DLFlBQVk7QUFDckQscUJBQWE7QUFBQSxVQUNaLGtCQUFrQjtBQUFBO0FBQUEsVUFFbEIsa0JBQWtCO0FBQUEsVUFDbEIscUJBQXFCO0FBQUEsVUFDckIsb0JBQW9CO0FBQUEsUUFDckIsQ0FBQztBQUNELDRCQUFvQixDQUFDLGtDQUFrQyxDQUFDO0FBQ3hELGNBQU0sVUFBVSxhQUFhO0FBQUEsVUFDNUI7QUFBQSxZQUNDLE1BQU07QUFBQSxZQUNOLFVBQVUsQ0FBQyxlQUFlO0FBQUEsVUFDM0I7QUFBQSxVQUNBO0FBQUEsWUFDQyxNQUFNO0FBQUEsWUFDTixVQUFVLENBQUMsa0JBQWtCO0FBQUEsVUFDOUI7QUFBQSxVQUNBO0FBQUEsWUFDQyxNQUFNO0FBQUEsWUFDTixVQUFVLENBQUMsNEJBQTRCO0FBQUEsVUFDeEM7QUFBQSxRQUNELENBQUM7QUFDRCxjQUFNLFVBQVUscUJBQXFCLGVBQWUsa0JBQWtCO0FBRXRFLGNBQU0sU0FBUyxNQUFNLFFBQVEsZ0JBQWdCLGtCQUFrQixJQUFJO0FBQ25FO0FBQUEsVUFDQyxPQUFPLElBQUksT0FBSyxFQUFFLEdBQUc7QUFBQSxVQUNyQjtBQUFBLFlBQ0M7QUFBQSxVQUNEO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLDRDQUE0QyxZQUFZO0FBQzdELHFCQUFhO0FBQUEsVUFDWixrQkFBa0I7QUFBQTtBQUFBLFVBRWxCLGtCQUFrQjtBQUFBLFVBQ2xCLHFCQUFxQjtBQUFBLFVBQ3JCLG9CQUFvQjtBQUFBLFFBQ3JCLENBQUM7QUFDRCw0QkFBb0IsQ0FBQyxrQ0FBa0MsQ0FBQztBQUN4RCxjQUFNLFVBQVUsYUFBYSxDQUFDLENBQUM7QUFDL0IsY0FBTSxVQUFVLHFCQUFxQixlQUFlLGtCQUFrQjtBQUV0RSxjQUFNLFNBQVMsTUFBTSxRQUFRLGdCQUFnQixrQkFBa0IsSUFBSTtBQUNuRTtBQUFBLFVBQ0MsT0FBTyxJQUFJLE9BQUssRUFBRSxHQUFHO0FBQUEsVUFDckIsQ0FBQztBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSx3REFBd0QsWUFBWTtBQUN6RSxxQkFBYTtBQUFBLFVBQ1osa0JBQWtCO0FBQUE7QUFBQSxVQUVsQixrQkFBa0I7QUFBQSxVQUNsQixxQkFBcUI7QUFBQSxVQUNyQixvQkFBb0I7QUFBQSxRQUNyQixDQUFDO0FBQ0QsNEJBQW9CLENBQUMsa0NBQWtDLENBQUM7QUFDeEQsY0FBTSxVQUFVLGFBQWEsQ0FBQyxDQUFDO0FBQy9CLGNBQU0sVUFBVSxxQkFBcUIsZUFBZSxrQkFBa0I7QUFFdEUsY0FBTSxTQUFTLE1BQU0sUUFBUSxnQkFBZ0Isa0JBQWtCLElBQUk7QUFDbkU7QUFBQSxVQUNDLE9BQU8sSUFBSSxPQUFLLEVBQUUsR0FBRztBQUFBLFVBQ3JCLENBQUM7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sa0RBQWtELFlBQVk7QUFDbkUscUJBQWE7QUFBQSxVQUNaLGtCQUFrQjtBQUFBO0FBQUEsVUFFbEIsa0JBQWtCO0FBQUEsVUFDbEIscUJBQXFCO0FBQUEsVUFDckIsb0JBQW9CO0FBQUEsUUFDckIsQ0FBQztBQUNELDRCQUFvQjtBQUFBLFVBQ25CO0FBQUEsVUFDQTtBQUFBLFFBQ0QsQ0FBQztBQUNELGNBQU0sVUFBVSxhQUFhO0FBQUEsVUFDNUI7QUFBQSxZQUNDLE1BQU07QUFBQSxZQUNOLFVBQVUsQ0FBQyxXQUFXO0FBQUEsVUFDdkI7QUFBQSxVQUNBO0FBQUEsWUFDQyxNQUFNO0FBQUEsWUFDTixVQUFVLENBQUMsV0FBVztBQUFBLFVBQ3ZCO0FBQUEsUUFDRCxDQUFDO0FBQ0QsY0FBTSxVQUFVLHFCQUFxQixlQUFlLGtCQUFrQjtBQUV0RSxjQUFNLFNBQVMsTUFBTSxRQUFRLGdCQUFnQixrQkFBa0IsSUFBSTtBQUNuRTtBQUFBLFVBQ0MsT0FBTyxJQUFJLE9BQUssRUFBRSxHQUFHO0FBQUEsVUFDckI7QUFBQSxZQUNDO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFVBQU0sb0NBQW9DLE1BQU07QUFDL0MsWUFBTSxrREFBa0QsWUFBWTtBQUNuRSxxQkFBYTtBQUFBLFVBQ1osa0JBQWtCO0FBQUE7QUFBQSxVQUVsQixrQkFBa0I7QUFBQSxVQUNsQixxQkFBcUI7QUFBQSxVQUNyQixvQkFBb0I7QUFBQSxRQUNyQixDQUFDO0FBQ0QsNEJBQW9CLENBQUMsa0NBQWtDLENBQUM7QUFDeEQsY0FBTSxVQUFVLGFBQWE7QUFBQSxVQUM1QjtBQUFBLFlBQ0MsTUFBTTtBQUFBLFlBQ04sVUFBVSxDQUFDLGNBQWM7QUFBQSxVQUMxQjtBQUFBLFFBQ0QsQ0FBQztBQUNELGNBQU0sVUFBVSxxQkFBcUIsZUFBZSxrQkFBa0I7QUFFdEUsY0FBTSxRQUFRLE1BQU0sUUFBUSxVQUFVLFlBQVksT0FBTyxlQUFlLE9BQU8sa0JBQWtCLElBQUk7QUFDckc7QUFBQSxVQUNDO0FBQUEsVUFDQSxDQUFDO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxVQUFNLGdEQUFnRCxNQUFNO0FBQzNELFlBQU0sd0VBQXdFLFlBQVk7QUFDekYscUJBQWE7QUFBQSxVQUNaLGFBQWE7QUFBQSxVQUNiLFlBQVk7QUFBQSxVQUNaLGFBQWE7QUFBQTtBQUFBLFVBRWIsa0JBQWtCO0FBQUEsVUFDbEIsa0JBQWtCO0FBQUEsVUFDbEIsa0JBQWtCO0FBQUEsVUFDbEIscUJBQXFCO0FBQUEsVUFDckIsb0JBQW9CO0FBQUEsVUFDcEIsb0JBQW9CO0FBQUEsUUFDckIsQ0FBQztBQUNELDRCQUFvQixDQUFDLGtDQUFrQyxDQUFDO0FBQ3hELGNBQU0sVUFBVSxhQUFhLENBQUMsQ0FBQztBQUMvQixjQUFNLFVBQVUscUJBQXFCLGVBQWUsa0JBQWtCO0FBRXRFLGNBQU0sVUFBVSxNQUFNLFFBQVEsNEJBQTRCLFlBQVksS0FBSztBQUMzRTtBQUFBLFVBQ0M7QUFBQSxVQUNBLENBQUM7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0seUVBQXlFLFlBQVk7QUFDMUYscUJBQWE7QUFBQSxVQUNaLHlCQUF5QjtBQUFBO0FBQUEsVUFFekIsa0JBQWtCO0FBQUEsVUFDbEIsa0JBQWtCO0FBQUEsVUFDbEIsa0JBQWtCO0FBQUEsVUFDbEIscUJBQXFCO0FBQUEsVUFDckIsb0JBQW9CO0FBQUEsVUFDcEIsb0JBQW9CO0FBQUEsUUFDckIsQ0FBQztBQUNELDRCQUFvQixDQUFDLGtDQUFrQyxDQUFDO0FBQ3hELGNBQU0sVUFBVSxhQUFhLENBQUMsQ0FBQztBQUMvQixjQUFNLFVBQVUscUJBQXFCLGVBQWUsa0JBQWtCO0FBRXRFLGNBQU0sVUFBVSxNQUFNLFFBQVEsNEJBQTRCLFlBQVksS0FBSztBQUMzRTtBQUFBLFVBQ0M7QUFBQSxVQUNBLENBQUM7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0seUVBQXlFLFlBQVk7QUFDMUYscUJBQWE7QUFBQSxVQUNaLGVBQWU7QUFBQSxVQUNmLGlCQUFpQjtBQUFBO0FBQUEsVUFFakIsa0JBQWtCO0FBQUEsVUFDbEIsa0JBQWtCO0FBQUEsVUFDbEIsa0JBQWtCO0FBQUEsVUFDbEIscUJBQXFCO0FBQUEsVUFDckIsb0JBQW9CO0FBQUEsVUFDcEIsb0JBQW9CO0FBQUEsUUFDckIsQ0FBQztBQUNELDRCQUFvQixDQUFDLGtDQUFrQyxDQUFDO0FBQ3hELGNBQU0sVUFBVSxhQUFhLENBQUMsQ0FBQztBQUMvQixjQUFNLFVBQVUscUJBQXFCLGVBQWUsa0JBQWtCO0FBRXRFLGNBQU0sVUFBVSxNQUFNLFFBQVEsNEJBQTRCLFlBQVksS0FBSztBQUMzRTtBQUFBLFVBQ0M7QUFBQSxVQUNBO0FBQUEsWUFDQztBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLCtFQUErRSxZQUFZO0FBQ2hHLHFCQUFhO0FBQUEsVUFDWixvQkFBb0I7QUFBQTtBQUFBLFVBRXBCLGtCQUFrQjtBQUFBLFVBQ2xCLGtCQUFrQjtBQUFBLFVBQ2xCLGtCQUFrQjtBQUFBLFVBQ2xCLHFCQUFxQjtBQUFBLFVBQ3JCLG9CQUFvQjtBQUFBLFVBQ3BCLG9CQUFvQjtBQUFBLFFBQ3JCLENBQUM7QUFDRCw0QkFBb0IsQ0FBQyxrQ0FBa0MsQ0FBQztBQUN4RCxjQUFNLFVBQVUsYUFBYSxDQUFDLENBQUM7QUFDL0IsY0FBTSxVQUFVLHFCQUFxQixlQUFlLGtCQUFrQjtBQUV0RSxjQUFNLFVBQVUsTUFBTSxRQUFRLDRCQUE0QixZQUFZLEtBQUs7QUFDM0U7QUFBQSxVQUNDO0FBQUEsVUFDQTtBQUFBLFlBQ0M7QUFBQSxVQUNEO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLDRDQUE0QyxZQUFZO0FBQzdELHFCQUFhO0FBQUEsVUFDWixlQUFlO0FBQUE7QUFBQSxVQUVmLGtCQUFrQjtBQUFBLFVBQ2xCLGtCQUFrQjtBQUFBLFVBQ2xCLGtCQUFrQjtBQUFBLFVBQ2xCLHFCQUFxQjtBQUFBLFVBQ3JCLG9CQUFvQjtBQUFBLFVBQ3BCLG9CQUFvQjtBQUFBLFFBQ3JCLENBQUM7QUFDRCw0QkFBb0IsQ0FBQyxrQ0FBa0MsQ0FBQztBQUN4RCxjQUFNLFVBQVUsYUFBYSxDQUFDLENBQUM7QUFDL0IsY0FBTSxVQUFVLHFCQUFxQixlQUFlLGtCQUFrQjtBQUV0RSxjQUFNLFVBQVUsTUFBTSxRQUFRLDRCQUE0QixZQUFZLEtBQUs7QUFDM0U7QUFBQSxVQUNDO0FBQUEsVUFDQTtBQUFBLFlBQ0M7QUFBQSxVQUNEO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxVQUFNLDBDQUEwQyxNQUFNO0FBQ3JELFlBQU0sa0RBQWtELFlBQVk7QUFDbkUscUJBQWE7QUFBQSxVQUNaLGtCQUFrQjtBQUFBLFVBQ2xCLGlCQUFpQjtBQUFBO0FBQUEsVUFFakIsa0JBQWtCO0FBQUEsVUFDbEIsa0JBQWtCO0FBQUEsVUFDbEIscUJBQXFCO0FBQUEsVUFDckIsb0JBQW9CO0FBQUEsVUFDcEIsb0JBQW9CO0FBQUEsUUFDckIsQ0FBQztBQUNELDRCQUFvQjtBQUFBLFVBQ25CO0FBQUEsVUFDQTtBQUFBLFFBQ0QsQ0FBQztBQUNELGNBQU0sVUFBVSxhQUFhLENBQUMsQ0FBQztBQUMvQixjQUFNLFVBQVUscUJBQXFCLGVBQWUsa0JBQWtCO0FBRXRFLGNBQU0sVUFBVSxNQUFNLFFBQVEsNEJBQTRCLFlBQVksS0FBSztBQUMzRTtBQUFBLFVBQ0M7QUFBQSxVQUNBO0FBQUEsWUFDQztBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sdURBQXVELFlBQVk7QUFDeEUscUJBQWE7QUFBQSxVQUNaLGtCQUFrQjtBQUFBLFVBQ2xCLGFBQWE7QUFBQTtBQUFBLFVBQ2Isb0JBQW9CO0FBQUE7QUFBQTtBQUFBLFVBRXBCLGtCQUFrQjtBQUFBLFVBQ2xCLGtCQUFrQjtBQUFBLFVBQ2xCLHFCQUFxQjtBQUFBLFVBQ3JCLG9CQUFvQjtBQUFBLFVBQ3BCLG9CQUFvQjtBQUFBLFFBQ3JCLENBQUM7QUFDRCw0QkFBb0IsQ0FBQyxrQ0FBa0MsQ0FBQztBQUN4RCxjQUFNLFVBQVUsYUFBYSxDQUFDLENBQUM7QUFDL0IsY0FBTSxVQUFVLHFCQUFxQixlQUFlLGtCQUFrQjtBQUV0RSxjQUFNLFVBQVUsTUFBTSxRQUFRLDRCQUE0QixZQUFZLEtBQUs7QUFDM0U7QUFBQSxVQUNDO0FBQUEsVUFDQTtBQUFBLFlBQ0M7QUFBQSxVQUNEO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLHVEQUF1RCxZQUFZO0FBQ3hFLHFCQUFhO0FBQUEsVUFDWixpQkFBaUI7QUFBQSxRQUNsQixDQUFDO0FBQ0QsNEJBQW9CLENBQUMsa0NBQWtDLENBQUM7QUFDeEQsY0FBTSxVQUFVLGFBQWEsQ0FBQyxDQUFDO0FBQy9CLGNBQU0sVUFBVSxxQkFBcUIsZUFBZSxrQkFBa0I7QUFFdEUsY0FBTSxVQUFVLE1BQU0sUUFBUSw0QkFBNEIsWUFBWSxLQUFLO0FBQzNFO0FBQUEsVUFDQztBQUFBLFVBQ0E7QUFBQTtBQUFBLFlBRUM7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBO0FBQUEsWUFFQTtBQUFBLFVBQ0Q7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sZUFBZSxNQUFNO0FBQzFCLFVBQU0sa0JBQWtCLFlBQVk7QUFDbkMsWUFBTSxRQUFRO0FBQUEsUUFDYjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUVBLGlCQUFXLFFBQVEsT0FBTztBQUN6QjtBQUFBLFVBQ0UsWUFBWSxJQUFJLE1BQU07QUFBQSxVQUN2QixJQUFJLElBQUk7QUFBQSxRQUNUO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sb0JBQW9CLFlBQVk7QUFDckMsWUFBTSxRQUFRO0FBQUEsUUFDYjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFFQSxpQkFBVyxRQUFRLE9BQU87QUFDekI7QUFBQSxVQUNFLFlBQVksSUFBSSxNQUFNO0FBQUEsVUFDdkIsSUFBSSxJQUFJO0FBQUEsUUFDVDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLG9CQUFvQixNQUFNO0FBQy9CLFVBQU0sMEJBQTBCLFlBQVk7QUFDM0MsWUFBTSxhQUFhO0FBQUEsUUFDbEI7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFFQSxpQkFBVyxRQUFRLFlBQVk7QUFDOUIsZUFBTztBQUFBLFVBQ04sd0JBQXdCLElBQUk7QUFBQSxVQUM1QjtBQUFBLFVBQ0EsSUFBSSxJQUFJO0FBQUEsUUFDVDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLDJCQUEyQixZQUFZO0FBQzVDLFlBQU0sYUFBYTtBQUFBLFFBQ2xCO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUVBLGlCQUFXLFFBQVEsWUFBWTtBQUM5QixlQUFPO0FBQUEsVUFDTix3QkFBd0IsSUFBSTtBQUFBLFVBQzVCO0FBQUEsVUFDQSxJQUFJLElBQUk7QUFBQSxRQUNUO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sK0NBQStDLFlBQVk7QUFDaEUsWUFBTSxhQUFhO0FBQUEsUUFDbEI7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBRUEsaUJBQVcsUUFBUSxZQUFZO0FBQzlCLGVBQU87QUFBQSxVQUNOLHdCQUF3QixJQUFJO0FBQUEsVUFDNUI7QUFBQSxVQUNBLElBQUksSUFBSTtBQUFBLFFBQ1Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSwwQkFBMEIsWUFBWTtBQUMzQyxZQUFNLGVBQWU7QUFBQTtBQUFBLFFBRXBCO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQTtBQUFBLFFBRUE7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFFQSxpQkFBVyxRQUFRLGNBQWM7QUFDaEMsZUFBTztBQUFBLFVBQ04sd0JBQXdCLElBQUk7QUFBQSxVQUM1QjtBQUFBLFVBQ0EsSUFBSSxJQUFJO0FBQUEsUUFDVDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLDhDQUE4QyxZQUFZO0FBQy9ELFlBQU0sZUFBZTtBQUFBLFFBQ3BCO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQTtBQUFBLFFBRUE7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUVBLGlCQUFXLFFBQVEsY0FBYztBQUNoQyxlQUFPO0FBQUEsVUFDTix3QkFBd0IsSUFBSTtBQUFBLFVBQzVCO0FBQUEsVUFDQSxJQUFJLElBQUk7QUFBQSxRQUNUO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sa0NBQWtDLFlBQVk7QUFDbkQsWUFBTSxlQUFlO0FBQUEsUUFDcEI7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBRUEsaUJBQVcsUUFBUSxjQUFjO0FBQ2hDLGVBQU87QUFBQSxVQUNOLHdCQUF3QixJQUFJO0FBQUEsVUFDNUI7QUFBQSxVQUNBLElBQUksSUFBSTtBQUFBLFFBQ1Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSx5QkFBeUIsWUFBWTtBQUMxQyxZQUFNLGVBQWU7QUFBQSxRQUNwQjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFFQSxpQkFBVyxRQUFRLGNBQWM7QUFDaEMsZUFBTztBQUFBLFVBQ04sd0JBQXdCLElBQUk7QUFBQSxVQUM1QjtBQUFBLFVBQ0EsSUFBSSxJQUFJO0FBQUEsUUFDVDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLHFDQUFxQyxZQUFZO0FBQ3RELFlBQU0sZUFBZTtBQUFBLFFBQ3BCO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUVBLGlCQUFXLFFBQVEsY0FBYztBQUNoQyxlQUFPO0FBQUEsVUFDTix3QkFBd0IsSUFBSTtBQUFBLFVBQzVCO0FBQUEsVUFDQSxJQUFJLElBQUk7QUFBQSxRQUNUO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sNkJBQTZCLFlBQVk7QUFDOUMsWUFBTSxhQUFhO0FBQUEsUUFDbEI7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBRUEsaUJBQVcsUUFBUSxZQUFZO0FBQzlCLGVBQU87QUFBQSxVQUNOLHdCQUF3QixJQUFJO0FBQUEsVUFDNUI7QUFBQSxVQUNBLElBQUksSUFBSTtBQUFBLFFBQ1Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxrQkFBa0IsTUFBTTtBQUM3QixVQUFNLDJCQUEyQixZQUFZO0FBQzVDLFlBQU0sZ0JBQWdCO0FBQUEsUUFDckI7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBRUEsaUJBQVcsUUFBUSxlQUFlO0FBQ2pDLGVBQU87QUFBQSxVQUNOLGVBQWUsSUFBSTtBQUFBLFVBQ25CO0FBQUEsVUFDQSxJQUFJLElBQUk7QUFBQSxRQUNUO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sMkJBQTJCLFlBQVk7QUFDNUMsWUFBTSxnQkFBZ0I7QUFBQSxRQUNyQjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFFQSxpQkFBVyxRQUFRLGVBQWU7QUFDakMsZUFBTztBQUFBLFVBQ04sZUFBZSxJQUFJO0FBQUEsVUFDbkI7QUFBQSxVQUNBLElBQUksSUFBSTtBQUFBLFFBQ1Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSw2Q0FBNkMsWUFBWTtBQUM5RCxZQUFNLG1CQUFtQjtBQUFBLFFBQ3hCO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFFQSxpQkFBVyxRQUFRLGtCQUFrQjtBQUNwQyxlQUFPO0FBQUEsVUFDTixlQUFlLElBQUk7QUFBQSxVQUNuQjtBQUFBLFVBQ0EsSUFBSSxJQUFJO0FBQUEsUUFDVDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLCtCQUErQixNQUFNO0FBQzFDLFVBQU0sb0NBQW9DLFlBQVk7QUFDckQsbUJBQWE7QUFBQSxRQUNaLG1CQUFtQjtBQUFBLFFBQ25CLHNCQUFzQjtBQUFBLFFBQ3RCLGVBQWU7QUFBQSxRQUNmLCtCQUErQjtBQUFBLFFBQy9CLGFBQWE7QUFBQSxRQUNiLCtDQUErQztBQUFBLFFBQy9DLHNEQUFzRDtBQUFBLFFBQ3RELHNEQUFzRDtBQUFBLE1BQ3ZELENBQUM7QUFDRCwwQkFBb0I7QUFBQSxRQUNuQjtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFDRCxZQUFNLFVBQVUsYUFBYSxDQUFDLENBQUM7QUFDL0IsWUFBTSxVQUFVLHFCQUFxQixlQUFlLGtCQUFrQjtBQUV0RTtBQUFBLFFBQ0MsTUFBTSxRQUFRLDRCQUE0QixZQUFZLE1BQU07QUFBQSxRQUM1RDtBQUFBLFVBQ0M7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sMkJBQTJCLE1BQU07QUFDdEMsVUFBTSxrREFBa0QsWUFBWTtBQUNuRSwwQkFBb0IsQ0FBQyxxQ0FBcUMsQ0FBQztBQUMzRCxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixVQUFVLENBQUMsZUFBZTtBQUFBLFFBQzNCO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQ04sVUFBVSxDQUFDLGNBQWM7QUFBQSxRQUMxQjtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSxxQkFBcUIsZUFBZSxrQkFBa0I7QUFFdEUsWUFBTSxVQUFVLE1BQU0sUUFBUSx3QkFBd0Isa0JBQWtCLElBQUksR0FBRyxJQUFJLE9BQUssRUFBRSxHQUFHO0FBQzdGO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxVQUNDO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0scURBQXFELFlBQVk7QUFDdEUsMEJBQW9CLENBQUMscUNBQXFDLENBQUM7QUFDM0QsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQ04sVUFBVSxDQUFDLGVBQWU7QUFBQSxRQUMzQjtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLFVBQVUsQ0FBQyxjQUFjO0FBQUEsUUFDMUI7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixVQUFVLENBQUMsaUJBQWlCO0FBQUEsUUFDN0I7QUFBQSxNQUNELENBQUM7QUFDRCwyQkFBcUIsS0FBSyxnQkFBZ0I7QUFBQSxRQUN6Qyw2QkFBNkIsTUFBTTtBQUFBLFFBQ25DLE1BQU0sYUFBYTtBQUFFLGdCQUFNLElBQUksTUFBTSxrQ0FBa0M7QUFBQSxRQUFHO0FBQUEsTUFDM0UsQ0FBQztBQUNELFlBQU0sVUFBVSxxQkFBcUIsZUFBZSxrQkFBa0I7QUFFdEUsWUFBTSxVQUFVLE1BQU0sUUFBUSx3QkFBd0Isa0JBQWtCLElBQUksR0FBRyxJQUFJLE9BQUssRUFBRSxHQUFHO0FBQzdGO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxVQUNDO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLHVEQUF1RCxZQUFZO0FBQ3hFLDBCQUFvQixDQUFDLHFDQUFxQyxDQUFDO0FBQzNELFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLFVBQVUsQ0FBQyxlQUFlO0FBQUEsUUFDM0I7QUFBQSxNQUNELENBQUM7QUFDRCwyQkFBcUIsS0FBSyxnQkFBZ0I7QUFBQSxRQUN6Qyw2QkFBNkIsTUFBTTtBQUFBLFFBQ25DLE1BQU0sYUFBYTtBQUFFLGdCQUFNLElBQUksTUFBTSxrQ0FBa0M7QUFBQSxRQUFHO0FBQUEsTUFDM0UsQ0FBQztBQUNELFlBQU0sVUFBVSxxQkFBcUIsZUFBZSxrQkFBa0I7QUFFdEUsWUFBTSxTQUFTLElBQUksd0JBQXdCO0FBRTNDLGFBQU8sT0FBTztBQUNkLFlBQU0sVUFBVSxNQUFNLFFBQVEsd0JBQXdCLE9BQU8sS0FBSyxHQUFHLElBQUksT0FBSyxFQUFFLEdBQUc7QUFDbkY7QUFBQSxRQUNDO0FBQUEsUUFDQSxDQUFDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUVGLENBQUM7QUFFRCxRQUFNLDJCQUEyQixNQUFNO0FBQ3RDLFFBQUk7QUFHSixVQUFNLDhCQUE4QixDQUFDLFVBQW9CO0FBQ3hELDBCQUFvQixLQUFLO0FBQ3pCLGdCQUFVLHFCQUFxQixlQUFlLGtCQUFrQjtBQUFBLElBQ2pFO0FBRUEsVUFBTSxrREFBa0QsWUFBWTtBQUNuRSxrQ0FBNEIsQ0FBQyxtQkFBbUIsQ0FBQztBQUNqRCxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCLEVBQUUsTUFBTSwrQkFBK0IsVUFBVSxDQUFDLHNCQUFzQixFQUFFO0FBQUEsUUFDMUUsRUFBRSxNQUFNLGtDQUFrQyxVQUFVLENBQUMsWUFBWSxFQUFFO0FBQUEsTUFDcEUsQ0FBQztBQUVELFlBQU0sUUFBUSxNQUFNLFFBQVEsd0JBQXdCLElBQUk7QUFDeEQsYUFBTztBQUFBLFFBQ04sTUFBTSxJQUFJLE9BQUssRUFBRSxJQUFJO0FBQUEsUUFDckIsQ0FBQyxtQkFBbUI7QUFBQSxRQUNwQjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLGtFQUFrRSxZQUFZO0FBQ25GLGtDQUE0QixDQUFDLGlDQUFpQyxDQUFDO0FBQy9ELFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUIsRUFBRSxNQUFNLDZCQUE2QixVQUFVLENBQUMsc0JBQXNCLEVBQUU7QUFBQSxRQUN4RSxFQUFFLE1BQU0sZ0RBQWdELFVBQVUsQ0FBQyxZQUFZLEVBQUU7QUFBQSxNQUNsRixDQUFDO0FBRUQsNEJBQXNCLGVBQWUsQ0FBQyxJQUFJLEtBQUssaUJBQWlCLENBQUMsQ0FBQztBQUVsRSxZQUFNLFFBQVEsTUFBTSxRQUFRLHdCQUF3QixJQUFJO0FBQ3hELGFBQU87QUFBQSxRQUNOLE1BQU0sSUFBSSxPQUFLLEVBQUUsSUFBSSxFQUFFLEtBQUs7QUFBQSxRQUM1QjtBQUFBLFVBQ0M7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0QsRUFBRSxLQUFLO0FBQUEsUUFDUDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLGlEQUFpRCxZQUFZO0FBQ2xFLGtDQUE0QixDQUFDLGlDQUFpQyxDQUFDO0FBQy9ELFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUIsRUFBRSxNQUFNLDZCQUE2QixVQUFVLENBQUMsc0JBQXNCLEVBQUU7QUFBQSxRQUN4RSxFQUFFLE1BQU0sZ0RBQWdELFVBQVUsQ0FBQyxZQUFZLEVBQUU7QUFBQSxNQUNsRixDQUFDO0FBRUQsNEJBQXNCLGVBQWUsQ0FBQyxJQUFJLEtBQUssaUJBQWlCLENBQUMsQ0FBQztBQUVsRSxZQUFNLFFBQVEsTUFBTSxRQUFRLHdCQUF3QixLQUFLO0FBQ3pELGFBQU87QUFBQSxRQUNOLE1BQU0sSUFBSSxPQUFLLEVBQUUsSUFBSTtBQUFBLFFBQ3JCLENBQUMsaUNBQWlDO0FBQUEsUUFDbEM7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSxnREFBZ0QsWUFBWTtBQUtqRSxZQUFNLGNBQWMsSUFBSSxLQUFLLHNCQUFzQjtBQUNuRCxZQUFNLGtCQUFrQixJQUFJLEtBQUssRUFBRSxRQUFRLHFCQUFxQixXQUFXLFVBQVUsTUFBTSx3QkFBd0IsQ0FBQztBQUNwSCxZQUFNLFVBQVUsQ0FBQyxhQUFhLGVBQWUsRUFBRSxJQUFJLENBQUMsS0FBSyxVQUFVLElBQUksY0FBYyxLQUF1QixFQUFFO0FBQUEsUUFBdkM7QUFBQTtBQUN0RSxlQUFTLE1BQU07QUFDZixlQUFTLE9BQU8sU0FBUyxHQUFHO0FBQzVCLGVBQVMsUUFBUTtBQUFBO0FBQUEsTUFDbEIsR0FBQztBQUNELDJCQUFxQixLQUFLLDBCQUEwQixxQkFBcUIsT0FBTyxDQUFDO0FBQ2pGLGdCQUFVLHFCQUFxQixlQUFlLGtCQUFrQjtBQUNoRSxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCLEVBQUUsTUFBTSxrQ0FBa0MsVUFBVSxDQUFDLHNCQUFzQixFQUFFO0FBQUEsTUFDOUUsQ0FBQztBQUVELFlBQU0sUUFBUSxNQUFNLFFBQVEsd0JBQXdCLElBQUk7QUFDeEQsYUFBTztBQUFBLFFBQ04sTUFBTSxJQUFJLE9BQUssRUFBRSxTQUFTLENBQUM7QUFBQSxRQUMzQixDQUFDLFlBQVksU0FBUyxDQUFDO0FBQUEsUUFDdkI7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSx1REFBdUQsWUFBWTtBQUN4RSxrQ0FBNEIsQ0FBQyxnQ0FBZ0MsQ0FBQztBQUM5RCxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCLEVBQUUsTUFBTSwrQ0FBK0MsVUFBVSxDQUFDLFlBQVksRUFBRTtBQUFBLE1BQ2pGLENBQUM7QUFFRCxZQUFNLFFBQVEsTUFBTSxRQUFRLHdCQUF3QixJQUFJO0FBQ3hELGFBQU87QUFBQSxRQUNOLE1BQU0sSUFBSSxPQUFLLEVBQUUsSUFBSTtBQUFBLFFBQ3JCLENBQUMsZ0NBQWdDO0FBQUEsUUFDakM7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0QsUUFBTSx3QkFBd0IsTUFBTTtBQUNuQyxVQUFNLDRDQUE0QyxZQUFZO0FBQzdELG1CQUFhLGNBQWMsa0JBQWtCLElBQUk7QUFBQSxRQUNoRCxpQkFBaUI7QUFBQSxRQUNqQixvQkFBb0I7QUFBQTtBQUFBLFFBRXBCLHlCQUF5QjtBQUFBLFFBQ3pCLCtCQUErQjtBQUFBLFFBQy9CLDJCQUEyQjtBQUFBLE1BQzVCO0FBQ0EsMEJBQW9CLENBQUMsa0NBQWtDLENBQUM7QUFDeEQsWUFBTSxVQUFVLGFBQWEsQ0FBQyxDQUFDO0FBQy9CLFlBQU0sVUFBVSxxQkFBcUIsZUFBZSxrQkFBa0I7QUFFdEUsWUFBTSxVQUFVLE1BQU0sUUFBUSxxQkFBcUI7QUFFbkQsYUFBTztBQUFBLFFBQ04sUUFBUSxJQUFJLFFBQU0sRUFBRSxNQUFNLEVBQUUsSUFBSSxNQUFNLFFBQVEsRUFBRSxRQUFRLFNBQVMsRUFBRSxRQUFRLEVBQUU7QUFBQSxRQUM3RTtBQUFBLFVBQ0MsRUFBRSxNQUFNLGtEQUFrRCxRQUFRLGlCQUFpQixpQkFBaUIsU0FBUyxlQUFlLE1BQU07QUFBQSxVQUNsSSxFQUFFLE1BQU0sc0NBQXNDLFFBQVEsaUJBQWlCLGlCQUFpQixTQUFTLGVBQWUsS0FBSztBQUFBLFFBQ3RIO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0seUJBQXlCLFlBQVk7QUFDMUMsbUJBQWEsY0FBYyxrQkFBa0IsSUFBSTtBQUFBLFFBQ2hELGlCQUFpQjtBQUFBLFFBQ2pCLHlCQUF5QjtBQUFBLFFBQ3pCLCtCQUErQjtBQUFBLFFBQy9CLDJCQUEyQjtBQUFBLFFBQzNCLG9CQUFvQjtBQUFBLE1BQ3JCO0FBQ0EsMEJBQW9CLENBQUMsa0NBQWtDLENBQUM7QUFDeEQsWUFBTSxVQUFVLGFBQWEsQ0FBQyxDQUFDO0FBQy9CLFlBQU0sVUFBVSxxQkFBcUIsZUFBZSxrQkFBa0I7QUFFdEUsWUFBTSxVQUFVLE1BQU0sUUFBUSxxQkFBcUI7QUFHbkQsWUFBTSxRQUFRLFFBQVEsSUFBSSxPQUFLLEVBQUUsSUFBSSxJQUFJO0FBQ3pDLGFBQU8sR0FBRyxDQUFDLE1BQU0sS0FBSyxPQUFLLEVBQUUsU0FBUyxTQUFTLENBQUMsR0FBRywrQkFBK0I7QUFDbEYsYUFBTyxnQkFBZ0IsT0FBTztBQUFBLFFBQzdCO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sbUNBQW1DLE1BQU07QUFDOUMsVUFBTSw0REFBNEQsWUFBWTtBQUM3RSxtQkFBYSxjQUFjLGtCQUFrQixJQUFJO0FBQUEsUUFDaEQseUJBQXlCO0FBQUEsUUFDekIsK0JBQStCO0FBQUEsUUFDL0IsMkJBQTJCO0FBQUEsUUFDM0IsaUJBQWlCO0FBQUEsUUFDakIsb0JBQW9CO0FBQUEsTUFDckI7QUFDQSwwQkFBb0IsQ0FBQyxrQ0FBa0MsQ0FBQztBQUN4RCxZQUFNLFVBQVUsYUFBYTtBQUFBO0FBQUEsUUFFNUIsRUFBRSxNQUFNLDBEQUEwRCxVQUFVLENBQUMsSUFBSSxFQUFFO0FBQUEsUUFDbkYsRUFBRSxNQUFNLGdFQUFnRSxVQUFVLENBQUMsSUFBSSxFQUFFO0FBQUE7QUFBQSxRQUV6RixFQUFFLE1BQU0sd0RBQXdELFVBQVUsQ0FBQyxJQUFJLEVBQUU7QUFBQSxRQUNqRixFQUFFLE1BQU0sNkRBQTZELFVBQVUsQ0FBQyxJQUFJLEVBQUU7QUFBQTtBQUFBLFFBRXRGLEVBQUUsTUFBTSxrRUFBa0UsVUFBVSxDQUFDLElBQUksRUFBRTtBQUFBLE1BQzVGLENBQUM7QUFDRCxZQUFNLFVBQVUscUJBQXFCLGVBQWUsa0JBQWtCO0FBRXRFLFlBQU0sUUFBUSxNQUFNLFFBQVEsVUFBVSxZQUFZLE1BQU0sZUFBZSxPQUFPLGtCQUFrQixJQUFJO0FBQ3BHLGFBQU87QUFBQSxRQUNOLE1BQU0sSUFBSSxPQUFLLEVBQUUsSUFBSSxFQUFFLEtBQUs7QUFBQSxRQUM1QjtBQUFBLFVBQ0M7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSx5REFBeUQsWUFBWTtBQUMxRSxtQkFBYSxjQUFjLGtCQUFrQixJQUFJO0FBQUEsUUFDaEQsMkJBQTJCO0FBQUEsUUFDM0Isb0JBQW9CO0FBQUEsTUFDckI7QUFDQSwwQkFBb0IsQ0FBQyxrQ0FBa0MsQ0FBQztBQUN4RCxZQUFNLFVBQVUsYUFBYTtBQUFBO0FBQUEsUUFFNUIsRUFBRSxNQUFNLDZDQUE2QyxVQUFVLENBQUMsSUFBSSxFQUFFO0FBQUE7QUFBQSxRQUV0RSxFQUFFLE1BQU0sMkNBQTJDLFVBQVUsQ0FBQyxJQUFJLEVBQUU7QUFBQSxRQUNwRSxFQUFFLE1BQU0sZ0RBQWdELFVBQVUsQ0FBQyxJQUFJLEVBQUU7QUFBQTtBQUFBLFFBRXpFLEVBQUUsTUFBTSxtREFBbUQsVUFBVSxDQUFDLElBQUksRUFBRTtBQUFBLE1BQzdFLENBQUM7QUFDRCxZQUFNLFVBQVUscUJBQXFCLGVBQWUsa0JBQWtCO0FBRXRFLFlBQU0sUUFBUSxNQUFNLFFBQVEsVUFBVSxZQUFZLE1BQU0sZUFBZSxNQUFNLGtCQUFrQixJQUFJO0FBQ25HLGFBQU87QUFBQSxRQUNOLE1BQU0sSUFBSSxPQUFLLEVBQUUsSUFBSSxFQUFFLEtBQUs7QUFBQSxRQUM1QjtBQUFBLFVBQ0M7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHdCQUF3QixNQUFNO0FBQ25DLFNBQUsscURBQXFELE1BQU07QUFDL0QsWUFBTSxnQkFBb0M7QUFBQSxRQUN6QyxpQkFBaUI7QUFBQSxRQUNqQixpQkFBaUI7QUFBQSxRQUNqQixpQkFBaUI7QUFBQSxRQUNqQixpQkFBaUI7QUFBQSxRQUNqQixpQkFBaUI7QUFBQSxRQUNqQixpQkFBaUI7QUFBQSxRQUNqQixpQkFBaUI7QUFBQSxRQUNqQixpQkFBaUI7QUFBQSxRQUNqQixpQkFBaUI7QUFBQSxRQUNqQixpQkFBaUI7QUFBQSxNQUNsQjtBQUVBLGlCQUFXLFVBQVUsZUFBZTtBQUNuQyxjQUFNLGNBQWMscUJBQXFCLE1BQU07QUFDL0MsZUFBTyxHQUFHLE9BQU8sZ0JBQWdCLFlBQVksWUFBWSxTQUFTLEdBQUcsOEJBQThCLE1BQU0sRUFBRTtBQUFBLE1BQzVHO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxrREFBa0QsTUFBTTtBQUM1RCxhQUFPLFlBQVkscUJBQXFCLGlCQUFpQixxQkFBcUIsR0FBRyxNQUFTO0FBQzFGLGFBQU8sWUFBWSxxQkFBcUIsaUJBQWlCLFlBQVksR0FBRyxNQUFTO0FBQ2pGLGFBQU8sWUFBWSxxQkFBcUIsaUJBQWlCLE1BQU0sR0FBRyxNQUFTO0FBQUEsSUFDNUUsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7QUFFRCxTQUFTLGNBQWMsUUFBd0IsVUFBb0IsU0FBaUI7QUFDbkYsU0FBTyxnQkFBZ0IsT0FBTyxJQUFJLENBQUMsUUFBUSxJQUFJLElBQUksR0FBRyxVQUFVLE9BQU87QUFDeEU7IiwKICAibmFtZXMiOiBbInJlc3VsdHMiXQp9Cg==
