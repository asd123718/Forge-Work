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
import assert from "assert";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { ILanguageService } from "../../../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { ConfigurationService } from "../../../../../../platform/configuration/common/configurationService.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { FileService } from "../../../../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { NullPolicyService } from "../../../../../../platform/policy/common/policy.js";
import { ChatModeKind } from "../../../common/constants.js";
import { getPromptFileType } from "../../../common/promptSyntax/config/promptFileLocations.js";
import { PromptsType } from "../../../common/promptSyntax/promptTypes.js";
import { MockFilesystem } from "./testUtils/mockFilesystem.js";
import { PromptFileParser } from "../../../common/promptSyntax/promptFileParser.js";
class ExpectedReference {
  constructor(dirname, ref) {
    this.ref = ref;
    this.uri = ref.content.startsWith("/") ? URI.file(ref.content) : URI.joinPath(dirname, ref.content);
  }
  /**
   * Range of the underlying file reference token.
   */
  get range() {
    return this.ref.range;
  }
  /**
   * String representation of the expected reference.
   */
  toString() {
    return `file-prompt:${this.uri.path}`;
  }
}
function toUri(filePath) {
  return URI.parse("testFs://" + filePath);
}
let TestPromptFileReference = class extends Disposable {
  constructor(fileStructure, rootFileUri, expectedReferences, fileService, instantiationService) {
    super();
    this.fileStructure = fileStructure;
    this.rootFileUri = rootFileUri;
    this.expectedReferences = expectedReferences;
    this.fileService = fileService;
    this.instantiationService = instantiationService;
    const fileSystemProvider = this._register(new InMemoryFileSystemProvider());
    this._register(this.fileService.registerProvider("testFs", fileSystemProvider));
  }
  /**
   * Run the test.
   */
  async run() {
    const mockFs = this.instantiationService.createInstance(MockFilesystem, this.fileStructure);
    await mockFs.mock(toUri("/"));
    const content = await this.fileService.readFile(this.rootFileUri);
    const ast = new PromptFileParser().parse(this.rootFileUri, content.value.toString());
    assert(ast.body, "Prompt file must have a body");
    const resolvedReferences = ast.body.fileReferences ?? [];
    for (let i = 0; i < this.expectedReferences.length; i++) {
      const expectedReference = this.expectedReferences[i];
      const resolvedReference = resolvedReferences[i];
      const resolvedUri = ast.body.resolveFilePath(resolvedReference.content);
      assert.equal(resolvedUri?.fsPath, expectedReference.uri.fsPath);
      assert.deepStrictEqual(resolvedReference.range, expectedReference.range);
    }
    assert.strictEqual(
      resolvedReferences.length,
      this.expectedReferences.length,
      [
        `
Expected(${this.expectedReferences.length}): [
 ${this.expectedReferences.join("\n ")}
]`,
        `Received(${resolvedReferences.length}): [
 ${resolvedReferences.join("\n ")}
]`
      ].join("\n")
    );
    const result = {};
    result.promptType = getPromptFileType(this.rootFileUri);
    if (ast.header) {
      for (const key of ["tools", "model", "agent", "applyTo", "description"]) {
        if (ast.header[key]) {
          result[key] = ast.header[key];
        }
      }
    }
    await mockFs.delete();
    return result;
  }
};
TestPromptFileReference = __decorateClass([
  __decorateParam(3, IFileService),
  __decorateParam(4, IInstantiationService)
], TestPromptFileReference);
function createFileReference(filePath, lineNumber, startColumnNumber) {
  const range = new Range(
    lineNumber,
    startColumnNumber + "#file:".length,
    lineNumber,
    startColumnNumber + "#file:".length + filePath.length
  );
  return {
    range,
    content: filePath,
    isMarkdownLink: false
  };
}
function createMarkdownReference(lineNumber, startColumnNumber, firstSeg, secondSeg) {
  const range = new Range(
    lineNumber,
    startColumnNumber + firstSeg.length + 1,
    lineNumber,
    startColumnNumber + firstSeg.length + secondSeg.length - 1
  );
  return {
    range,
    content: secondSeg.substring(1, secondSeg.length - 1),
    isMarkdownLink: true
  };
}
suite("PromptFileReference", function() {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  setup(async () => {
    const nullPolicyService = new NullPolicyService();
    const nullLogService = testDisposables.add(new NullLogService());
    const nullFileService = testDisposables.add(new FileService(nullLogService));
    const nullConfigService = testDisposables.add(new ConfigurationService(
      URI.file("/config.json"),
      nullFileService,
      nullPolicyService,
      nullLogService
    ));
    instantiationService = testDisposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, nullFileService);
    instantiationService.stub(ILogService, nullLogService);
    instantiationService.stub(IConfigurationService, nullConfigService);
    instantiationService.stub(IModelService, { getModel() {
      return null;
    } });
    instantiationService.stub(ILanguageService, {
      guessLanguageIdByFilepathOrFirstLine(uri) {
        return getPromptFileType(uri) ?? null;
      }
    });
  });
  test("resolves nested file references", async function() {
    const rootFolderName = "resolves-nested-file-references";
    const rootFolder = `/${rootFolderName}`;
    const rootUri = toUri(rootFolder);
    const test2 = testDisposables.add(instantiationService.createInstance(
      TestPromptFileReference,
      /**
       * The file structure to be created on the disk for the test.
       */
      [{
        name: rootFolderName,
        children: [
          {
            name: "file1.prompt.md",
            contents: "## Some Header\nsome contents\n "
          },
          {
            name: "file2.prompt.md",
            contents: "## Files\n	- this file #file:folder1/file3.prompt.md \n	- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!\n "
          },
          {
            name: "folder1",
            children: [
              {
                name: "file3.prompt.md",
                contents: `
[](./some-other-folder/non-existing-folder)
	- some seemingly random #file:${rootFolder}/folder1/some-other-folder/yetAnotherFolder\u{1F92D}/another-file.prompt.md contents
 some more	 content`
              },
              {
                name: "some-other-folder",
                children: [
                  {
                    name: "file4.prompt.md",
                    contents: "this file has a non-existing #file:./some-non-existing/file.prompt.md		reference\n\n\nand some\n non-prompt #file:./some-non-prompt-file.md		 	[](../../folder1/)	"
                  },
                  {
                    name: "file.txt",
                    contents: "contents of a non-prompt-snippet file"
                  },
                  {
                    name: "yetAnotherFolder\u{1F92D}",
                    children: [
                      {
                        name: "another-file.prompt.md",
                        contents: `[caption](${rootFolder}/folder1/some-other-folder)
another-file.prompt.md contents	 [#file:file.txt](../file.txt)`
                      },
                      {
                        name: "one_more_file_just_in_case.prompt.md",
                        contents: "one_more_file_just_in_case.prompt.md contents"
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }],
      /**
       * The root file path to start the resolve process from.
       */
      toUri(`/${rootFolderName}/file2.prompt.md`),
      /**
       * The expected references to be resolved.
       */
      [
        new ExpectedReference(
          rootUri,
          createFileReference("folder1/file3.prompt.md", 2, 14)
        ),
        new ExpectedReference(
          rootUri,
          createMarkdownReference(
            3,
            14,
            "[file4.prompt.md]",
            "(./folder1/some-other-folder/file4.prompt.md)"
          )
        )
      ]
    ));
    await test2.run();
  });
  suite("metadata", () => {
    test("tools", async function() {
      const rootFolderName = "resolves-nested-file-references";
      const rootFolder = `/${rootFolderName}`;
      const rootUri = toUri(rootFolder);
      const test2 = testDisposables.add(instantiationService.createInstance(
        TestPromptFileReference,
        /**
         * The file structure to be created on the disk for the test.
         */
        [{
          name: rootFolderName,
          children: [
            {
              name: "file1.prompt.md",
              contents: [
                "## Some Header",
                "some contents",
                " "
              ]
            },
            {
              name: "file2.prompt.md",
              contents: [
                "---",
                "description: 'Root prompt description.'",
                "tools: ['my-tool1']",
                'agent: "agent" ',
                "---",
                "## Files",
                "	- this file #file:folder1/file3.prompt.md ",
                "	- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!",
                " "
              ]
            },
            {
              name: "folder1",
              children: [
                {
                  name: "file3.prompt.md",
                  contents: [
                    "---",
                    "tools: [ 'my-tool1' , ]",
                    "---",
                    "",
                    "[](./some-other-folder/non-existing-folder)",
                    `	- some seemingly random #file:${rootFolder}/folder1/some-other-folder/yetAnotherFolder\u{1F92D}/another-file.prompt.md contents`,
                    " some more	 content"
                  ]
                },
                {
                  name: "some-other-folder",
                  children: [
                    {
                      name: "file4.prompt.md",
                      contents: [
                        "---",
                        `tools: ['my-tool1', "my-tool2", true, , ]`,
                        "something: true",
                        "agent: 'ask'	",
                        "---",
                        "this file has a non-existing #file:./some-non-existing/file.prompt.md		reference",
                        "",
                        "",
                        "and some",
                        " non-prompt #file:./some-non-prompt-file.md		 	[](../../folder1/)	"
                      ]
                    },
                    {
                      name: "file.txt",
                      contents: "contents of a non-prompt-snippet file"
                    },
                    {
                      name: "yetAnotherFolder\u{1F92D}",
                      children: [
                        {
                          name: "another-file.prompt.md",
                          contents: [
                            "---",
                            `tools: ['my-tool3', "my-tool2" ]`,
                            "---",
                            `[](${rootFolder}/folder1/some-other-folder)`,
                            "another-file.prompt.md contents	 [#file:file.txt](../file.txt)"
                          ]
                        },
                        {
                          name: "one_more_file_just_in_case.prompt.md",
                          contents: "one_more_file_just_in_case.prompt.md contents"
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }],
        /**
         * The root file path to start the resolve process from.
         */
        toUri(`/${rootFolderName}/file2.prompt.md`),
        /**
         * The expected references to be resolved.
         */
        [
          new ExpectedReference(
            rootUri,
            createFileReference("folder1/file3.prompt.md", 7, 14)
          ),
          new ExpectedReference(
            rootUri,
            createMarkdownReference(
              8,
              14,
              "[file4.prompt.md]",
              "(./folder1/some-other-folder/file4.prompt.md)"
            )
          )
        ]
      ));
      const metadata = await test2.run();
      assert.deepStrictEqual(
        metadata,
        {
          promptType: PromptsType.prompt,
          agent: "agent",
          description: "Root prompt description.",
          tools: ["my-tool1"]
        },
        "Must have correct metadata."
      );
    });
    suite("applyTo", () => {
      test("prompt language", async function() {
        const rootFolderName = "resolves-nested-file-references";
        const rootFolder = `/${rootFolderName}`;
        const rootUri = toUri(rootFolder);
        const test2 = testDisposables.add(instantiationService.createInstance(
          TestPromptFileReference,
          /**
           * The file structure to be created on the disk for the test.
           */
          [{
            name: rootFolderName,
            children: [
              {
                name: "file1.prompt.md",
                contents: [
                  "## Some Header",
                  "some contents",
                  " "
                ]
              },
              {
                name: "file2.prompt.md",
                contents: [
                  "---",
                  "applyTo: '**/*'",
                  "tools: [ 'my-tool12' , ]",
                  "description: 'Description of my prompt.'",
                  "---",
                  "## Files",
                  "	- this file #file:folder1/file3.prompt.md ",
                  "	- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!",
                  " "
                ]
              },
              {
                name: "folder1",
                children: [
                  {
                    name: "file3.prompt.md",
                    contents: [
                      "---",
                      "tools: [ 'my-tool1' , ]",
                      "---",
                      " some more	 content"
                    ]
                  },
                  {
                    name: "some-other-folder",
                    children: [
                      {
                        name: "file4.prompt.md",
                        contents: [
                          "---",
                          `tools: ['my-tool1', "my-tool2", true, , 'my-tool3' , ]`,
                          "something: true",
                          "agent: 'agent'	",
                          "---",
                          "",
                          "",
                          "and some more content"
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }],
          /**
           * The root file path to start the resolve process from.
           */
          toUri(`/${rootFolderName}/file2.prompt.md`),
          /**
           * The expected references to be resolved.
           */
          [
            new ExpectedReference(
              rootUri,
              createFileReference("folder1/file3.prompt.md", 7, 14)
            ),
            new ExpectedReference(
              rootUri,
              createMarkdownReference(
                8,
                14,
                "[file4.prompt.md]",
                "(./folder1/some-other-folder/file4.prompt.md)"
              )
            )
          ]
        ));
        const metadata = await test2.run();
        assert.deepStrictEqual(
          metadata,
          {
            promptType: PromptsType.prompt,
            description: "Description of my prompt.",
            tools: ["my-tool12"],
            applyTo: "**/*"
          },
          "Must have correct metadata."
        );
      });
      test("instructions language", async function() {
        const rootFolderName = "resolves-nested-file-references";
        const rootFolder = `/${rootFolderName}`;
        const rootUri = toUri(rootFolder);
        const test2 = testDisposables.add(instantiationService.createInstance(
          TestPromptFileReference,
          /**
           * The file structure to be created on the disk for the test.
           */
          [{
            name: rootFolderName,
            children: [
              {
                name: "file1.prompt.md",
                contents: [
                  "## Some Header",
                  "some contents",
                  " "
                ]
              },
              {
                name: "file2.instructions.md",
                contents: [
                  "---",
                  "applyTo: '**/*'",
                  "tools: [ 'my-tool12' , ]",
                  "description: 'Description of my instructions file.'",
                  "---",
                  "## Files",
                  "	- this file #file:folder1/file3.prompt.md ",
                  "	- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!",
                  " "
                ]
              },
              {
                name: "folder1",
                children: [
                  {
                    name: "file3.prompt.md",
                    contents: [
                      "---",
                      "tools: [ 'my-tool1' , ]",
                      "---",
                      " some more	 content"
                    ]
                  },
                  {
                    name: "some-other-folder",
                    children: [
                      {
                        name: "file4.prompt.md",
                        contents: [
                          "---",
                          `tools: ['my-tool1', "my-tool2", true, , 'my-tool3' , ]`,
                          "something: true",
                          "agent: 'agent'	",
                          "---",
                          "",
                          "",
                          "and some more content"
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }],
          /**
           * The root file path to start the resolve process from.
           */
          toUri(`/${rootFolderName}/file2.instructions.md`),
          /**
           * The expected references to be resolved.
           */
          [
            new ExpectedReference(
              rootUri,
              createFileReference("folder1/file3.prompt.md", 7, 14)
            ),
            new ExpectedReference(
              rootUri,
              createMarkdownReference(
                8,
                14,
                "[file4.prompt.md]",
                "(./folder1/some-other-folder/file4.prompt.md)"
              )
            )
          ]
        ));
        const metadata = await test2.run();
        assert.deepStrictEqual(
          metadata,
          {
            promptType: PromptsType.instructions,
            applyTo: "**/*",
            description: "Description of my instructions file.",
            tools: ["my-tool12"]
          },
          "Must have correct metadata."
        );
      });
    });
    suite("tools and agent compatibility", () => {
      test("ask agent", async function() {
        const rootFolderName = "resolves-nested-file-references";
        const rootFolder = `/${rootFolderName}`;
        const rootUri = toUri(rootFolder);
        const test2 = testDisposables.add(instantiationService.createInstance(
          TestPromptFileReference,
          /**
           * The file structure to be created on the disk for the test.
           */
          [{
            name: rootFolderName,
            children: [
              {
                name: "file1.prompt.md",
                contents: [
                  "## Some Header",
                  "some contents",
                  " "
                ]
              },
              {
                name: "file2.prompt.md",
                contents: [
                  "---",
                  "description: 'Description of my prompt.'",
                  'agent: "ask" ',
                  "---",
                  "## Files",
                  "	- this file #file:folder1/file3.prompt.md ",
                  "	- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!",
                  " "
                ]
              },
              {
                name: "folder1",
                children: [
                  {
                    name: "file3.prompt.md",
                    contents: [
                      "---",
                      "tools: [ 'my-tool1' , ]",
                      "agent: 'agent'	",
                      "---",
                      " some more	 content"
                    ]
                  },
                  {
                    name: "some-other-folder",
                    children: [
                      {
                        name: "file4.prompt.md",
                        contents: [
                          "---",
                          `tools: ['my-tool1', "my-tool2", true, , ]`,
                          "something: true",
                          "agent: 'ask'	",
                          "---",
                          "",
                          "",
                          "and some more content"
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }],
          /**
           * The root file path to start the resolve process from.
           */
          toUri(`/${rootFolderName}/file2.prompt.md`),
          /**
           * The expected references to be resolved.
           */
          [
            new ExpectedReference(
              rootUri,
              createFileReference("folder1/file3.prompt.md", 6, 14)
            ),
            new ExpectedReference(
              rootUri,
              createMarkdownReference(
                7,
                14,
                "[file4.prompt.md]",
                "(./folder1/some-other-folder/file4.prompt.md)"
              )
            )
          ]
        ));
        const metadata = await test2.run();
        assert.deepStrictEqual(
          metadata,
          {
            promptType: PromptsType.prompt,
            agent: ChatModeKind.Ask,
            description: "Description of my prompt."
          },
          "Must have correct metadata."
        );
      });
      test("edit agent", async function() {
        const rootFolderName = "resolves-nested-file-references";
        const rootFolder = `/${rootFolderName}`;
        const rootUri = toUri(rootFolder);
        const test2 = testDisposables.add(instantiationService.createInstance(
          TestPromptFileReference,
          /**
           * The file structure to be created on the disk for the test.
           */
          [{
            name: rootFolderName,
            children: [
              {
                name: "file1.prompt.md",
                contents: [
                  "## Some Header",
                  "some contents",
                  " "
                ]
              },
              {
                name: "file2.prompt.md",
                contents: [
                  "---",
                  "description: 'Description of my prompt.'",
                  'agent:		"edit"		',
                  "---",
                  "## Files",
                  "	- this file #file:folder1/file3.prompt.md ",
                  "	- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!",
                  " "
                ]
              },
              {
                name: "folder1",
                children: [
                  {
                    name: "file3.prompt.md",
                    contents: [
                      "---",
                      "tools: [ 'my-tool1' , ]",
                      "---",
                      " some more	 content"
                    ]
                  },
                  {
                    name: "some-other-folder",
                    children: [
                      {
                        name: "file4.prompt.md",
                        contents: [
                          "---",
                          `tools: ['my-tool1', "my-tool2", true, , ]`,
                          "something: true",
                          "agent: 'agent'	",
                          "---",
                          "",
                          "",
                          "and some more content"
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }],
          /**
           * The root file path to start the resolve process from.
           */
          toUri(`/${rootFolderName}/file2.prompt.md`),
          /**
           * The expected references to be resolved.
           */
          [
            new ExpectedReference(
              rootUri,
              createFileReference("folder1/file3.prompt.md", 6, 14)
            ),
            new ExpectedReference(
              rootUri,
              createMarkdownReference(
                7,
                14,
                "[file4.prompt.md]",
                "(./folder1/some-other-folder/file4.prompt.md)"
              )
            )
          ]
        ));
        const metadata = await test2.run();
        assert.deepStrictEqual(
          metadata,
          {
            promptType: PromptsType.prompt,
            agent: ChatModeKind.Edit,
            description: "Description of my prompt."
          },
          "Must have correct metadata."
        );
      });
      test("agent", async function() {
        const rootFolderName = "resolves-nested-file-references";
        const rootFolder = `/${rootFolderName}`;
        const rootUri = toUri(rootFolder);
        const test2 = testDisposables.add(instantiationService.createInstance(
          TestPromptFileReference,
          /**
           * The file structure to be created on the disk for the test.
           */
          [{
            name: rootFolderName,
            children: [
              {
                name: "file1.prompt.md",
                contents: [
                  "## Some Header",
                  "some contents",
                  " "
                ]
              },
              {
                name: "file2.prompt.md",
                contents: [
                  "---",
                  "description: 'Description of my prompt.'",
                  'agent: 		 "agent" 		 ',
                  "---",
                  "## Files",
                  "	- this file #file:folder1/file3.prompt.md ",
                  "	- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!",
                  " "
                ]
              },
              {
                name: "folder1",
                children: [
                  {
                    name: "file3.prompt.md",
                    contents: [
                      "---",
                      "tools: [ 'my-tool1' , ]",
                      "---",
                      " some more	 content"
                    ]
                  },
                  {
                    name: "some-other-folder",
                    children: [
                      {
                        name: "file4.prompt.md",
                        contents: [
                          "---",
                          `tools: ['my-tool1', "my-tool2", true, , 'my-tool3' , ]`,
                          "something: true",
                          "agent: 'agent'	",
                          "---",
                          "",
                          "",
                          "and some more content"
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }],
          /**
           * The root file path to start the resolve process from.
           */
          toUri(`/${rootFolderName}/file2.prompt.md`),
          /**
           * The expected references to be resolved.
           */
          [
            new ExpectedReference(
              rootUri,
              createFileReference("folder1/file3.prompt.md", 6, 14)
            ),
            new ExpectedReference(
              rootUri,
              createMarkdownReference(
                7,
                14,
                "[file4.prompt.md]",
                "(./folder1/some-other-folder/file4.prompt.md)"
              )
            )
          ]
        ));
        const metadata = await test2.run();
        assert.deepStrictEqual(
          metadata,
          {
            promptType: PromptsType.prompt,
            agent: ChatModeKind.Agent,
            description: "Description of my prompt."
          },
          "Must have correct metadata."
        );
      });
      test("no agent", async function() {
        const rootFolderName = "resolves-nested-file-references";
        const rootFolder = `/${rootFolderName}`;
        const rootUri = toUri(rootFolder);
        const test2 = testDisposables.add(instantiationService.createInstance(
          TestPromptFileReference,
          /**
           * The file structure to be created on the disk for the test.
           */
          [{
            name: rootFolderName,
            children: [
              {
                name: "file1.prompt.md",
                contents: [
                  "## Some Header",
                  "some contents",
                  " "
                ]
              },
              {
                name: "file2.prompt.md",
                contents: [
                  "---",
                  "tools: [ 'my-tool12' , ]",
                  "description: 'Description of the prompt file.'",
                  "---",
                  "## Files",
                  "	- this file #file:folder1/file3.prompt.md ",
                  "	- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!",
                  " "
                ]
              },
              {
                name: "folder1",
                children: [
                  {
                    name: "file3.prompt.md",
                    contents: [
                      "---",
                      "tools: [ 'my-tool1' , ]",
                      "---",
                      " some more	 content"
                    ]
                  },
                  {
                    name: "some-other-folder",
                    children: [
                      {
                        name: "file4.prompt.md",
                        contents: [
                          "---",
                          `tools: ['my-tool1', "my-tool2", true, , 'my-tool3' , ]`,
                          "something: true",
                          "agent: 'agent'	",
                          "---",
                          "",
                          "",
                          "and some more content"
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }],
          /**
           * The root file path to start the resolve process from.
           */
          toUri(`/${rootFolderName}/file2.prompt.md`),
          /**
           * The expected references to be resolved.
           */
          [
            new ExpectedReference(
              rootUri,
              createFileReference("folder1/file3.prompt.md", 6, 14)
            ),
            new ExpectedReference(
              rootUri,
              createMarkdownReference(
                7,
                14,
                "[file4.prompt.md]",
                "(./folder1/some-other-folder/file4.prompt.md)"
              )
            )
          ]
        ));
        const metadata = await test2.run();
        assert.deepStrictEqual(
          metadata,
          {
            promptType: PromptsType.prompt,
            tools: ["my-tool12"],
            description: "Description of the prompt file."
          },
          "Must have correct metadata."
        );
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxccHJvbXB0U3ludGF4XFxwcm9tcHRGaWxlUmVmZXJlbmNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgTnVsbFBvbGljeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wb2xpY3kvY29tbW9uL3BvbGljeS5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IGdldFByb21wdEZpbGVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9jb25maWcvcHJvbXB0RmlsZUxvY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgSU1vY2tGb2xkZXIsIE1vY2tGaWxlc3lzdGVtIH0gZnJvbSAnLi90ZXN0VXRpbHMvbW9ja0ZpbGVzeXN0ZW0uanMnO1xuaW1wb3J0IHsgSUJvZHlGaWxlUmVmZXJlbmNlLCBQcm9tcHRGaWxlUGFyc2VyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRGaWxlUGFyc2VyLmpzJztcblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgZmlsZSByZWZlcmVuY2Ugd2l0aCBhbiBleHBlY3RlZFxuICogZXJyb3IgY29uZGl0aW9uIHZhbHVlIGZvciB0ZXN0aW5nIHB1cnBvc2VzLlxuICovXG5jbGFzcyBFeHBlY3RlZFJlZmVyZW5jZSB7XG5cdC8qKlxuXHQgKiBVUkkgY29tcG9uZW50IG9mIHRoZSBleHBlY3RlZCByZWZlcmVuY2UuXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgdXJpOiBVUkk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZGlybmFtZTogVVJJLFxuXHRcdHB1YmxpYyByZWFkb25seSByZWY6IElCb2R5RmlsZVJlZmVyZW5jZSxcblx0KSB7XG5cdFx0dGhpcy51cmkgPSAocmVmLmNvbnRlbnQuc3RhcnRzV2l0aCgnLycpKVxuXHRcdFx0PyBVUkkuZmlsZShyZWYuY29udGVudClcblx0XHRcdDogVVJJLmpvaW5QYXRoKGRpcm5hbWUsIHJlZi5jb250ZW50KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSYW5nZSBvZiB0aGUgdW5kZXJseWluZyBmaWxlIHJlZmVyZW5jZSB0b2tlbi5cblx0ICovXG5cdHB1YmxpYyBnZXQgcmFuZ2UoKTogUmFuZ2Uge1xuXHRcdHJldHVybiB0aGlzLnJlZi5yYW5nZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhlIGV4cGVjdGVkIHJlZmVyZW5jZS5cblx0ICovXG5cdHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgZmlsZS1wcm9tcHQ6JHt0aGlzLnVyaS5wYXRofWA7XG5cdH1cbn1cblxuZnVuY3Rpb24gdG9VcmkoZmlsZVBhdGg6IHN0cmluZyk6IFVSSSB7XG5cdHJldHVybiBVUkkucGFyc2UoJ3Rlc3RGczovLycgKyBmaWxlUGF0aCk7XG59XG5cbi8qKlxuICogQSByZXVzYWJsZSB0ZXN0IHV0aWxpdHkgdG8gdGVzdCB0aGUgYFByb21wdEZpbGVSZWZlcmVuY2VgIGNsYXNzLlxuICovXG5jbGFzcyBUZXN0UHJvbXB0RmlsZVJlZmVyZW5jZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGZpbGVTdHJ1Y3R1cmU6IElNb2NrRm9sZGVyW10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSByb290RmlsZVVyaTogVVJJLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXhwZWN0ZWRSZWZlcmVuY2VzOiBFeHBlY3RlZFJlZmVyZW5jZVtdLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gY3JlYXRlIGluLW1lbW9yeSBmaWxlIHN5c3RlbVxuXHRcdGNvbnN0IGZpbGVTeXN0ZW1Qcm92aWRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ3Rlc3RGcycsIGZpbGVTeXN0ZW1Qcm92aWRlcikpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJ1biB0aGUgdGVzdC5cblx0ICovXG5cdHB1YmxpYyBhc3luYyBydW4oKTogUHJvbWlzZTxhbnk+IHtcblx0XHQvLyBjcmVhdGUgdGhlIGZpbGVzIHN0cnVjdHVyZSBvbiB0aGUgZGlza1xuXHRcdGNvbnN0IG1vY2tGcyA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9ja0ZpbGVzeXN0ZW0sIHRoaXMuZmlsZVN0cnVjdHVyZSk7XG5cdFx0YXdhaXQgbW9ja0ZzLm1vY2sodG9VcmkoJy8nKSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh0aGlzLnJvb3RGaWxlVXJpKTtcblxuXHRcdGNvbnN0IGFzdCA9IG5ldyBQcm9tcHRGaWxlUGFyc2VyKCkucGFyc2UodGhpcy5yb290RmlsZVVyaSwgY29udGVudC52YWx1ZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQoYXN0LmJvZHksICdQcm9tcHQgZmlsZSBtdXN0IGhhdmUgYSBib2R5Jyk7XG5cblx0XHQvLyByZXNvbHZlIHRoZSByb290IGZpbGUgcmVmZXJlbmNlIGluY2x1ZGluZyBhbGwgbmVzdGVkIHJlZmVyZW5jZXNcblx0XHRjb25zdCByZXNvbHZlZFJlZmVyZW5jZXMgPSBhc3QuYm9keS5maWxlUmVmZXJlbmNlcyA/PyBbXTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5leHBlY3RlZFJlZmVyZW5jZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGV4cGVjdGVkUmVmZXJlbmNlID0gdGhpcy5leHBlY3RlZFJlZmVyZW5jZXNbaV07XG5cdFx0XHRjb25zdCByZXNvbHZlZFJlZmVyZW5jZSA9IHJlc29sdmVkUmVmZXJlbmNlc1tpXTtcblxuXHRcdFx0Y29uc3QgcmVzb2x2ZWRVcmkgPSBhc3QuYm9keS5yZXNvbHZlRmlsZVBhdGgocmVzb2x2ZWRSZWZlcmVuY2UuY29udGVudCk7XG5cblx0XHRcdGFzc2VydC5lcXVhbChyZXNvbHZlZFVyaT8uZnNQYXRoLCBleHBlY3RlZFJlZmVyZW5jZS51cmkuZnNQYXRoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb2x2ZWRSZWZlcmVuY2UucmFuZ2UsIGV4cGVjdGVkUmVmZXJlbmNlLnJhbmdlKTtcblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRyZXNvbHZlZFJlZmVyZW5jZXMubGVuZ3RoLFxuXHRcdFx0dGhpcy5leHBlY3RlZFJlZmVyZW5jZXMubGVuZ3RoLFxuXHRcdFx0W1xuXHRcdFx0XHRgXFxuRXhwZWN0ZWQoJHt0aGlzLmV4cGVjdGVkUmVmZXJlbmNlcy5sZW5ndGh9KTogW1xcbiAke3RoaXMuZXhwZWN0ZWRSZWZlcmVuY2VzLmpvaW4oJ1xcbiAnKX1cXG5dYCxcblx0XHRcdFx0YFJlY2VpdmVkKCR7cmVzb2x2ZWRSZWZlcmVuY2VzLmxlbmd0aH0pOiBbXFxuICR7cmVzb2x2ZWRSZWZlcmVuY2VzLmpvaW4oJ1xcbiAnKX1cXG5dYCxcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlc3VsdDogYW55ID0ge307XG5cdFx0cmVzdWx0LnByb21wdFR5cGUgPSBnZXRQcm9tcHRGaWxlVHlwZSh0aGlzLnJvb3RGaWxlVXJpKTtcblx0XHRpZiAoYXN0LmhlYWRlcikge1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgWyd0b29scycsICdtb2RlbCcsICdhZ2VudCcsICdhcHBseVRvJywgJ2Rlc2NyaXB0aW9uJ10gYXMgY29uc3QpIHtcblx0XHRcdFx0aWYgKGFzdC5oZWFkZXJba2V5XSkge1xuXHRcdFx0XHRcdHJlc3VsdFtrZXldID0gYXN0LmhlYWRlcltrZXldO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXdhaXQgbW9ja0ZzLmRlbGV0ZSgpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG4vKipcbiAqIENyZWF0ZSBleHBlY3RlZCBmaWxlIHJlZmVyZW5jZSBmb3IgdGVzdGluZyBwdXJwb3Nlcy5cbiAqXG4gKiBOb3RlISBUaGlzIHV0aWxpdHkgYWxzbyB1c2UgZm9yIGBtYXJrZG93biBsaW5rc2AgYXQgdGhlIG1vbWVudC5cbiAqXG4gKiBAcGFyYW0gZmlsZVBhdGggVGhlIGV4cGVjdGVkIHBhdGggb2YgdGhlIGZpbGUgcmVmZXJlbmNlICh3aXRob3V0IHRoZSBgI2ZpbGU6YCBwcmVmaXgpLlxuICogQHBhcmFtIGxpbmVOdW1iZXIgVGhlIGV4cGVjdGVkIGxpbmUgbnVtYmVyIG9mIHRoZSBmaWxlIHJlZmVyZW5jZS5cbiAqIEBwYXJhbSBzdGFydENvbHVtbk51bWJlciBUaGUgZXhwZWN0ZWQgc3RhcnQgY29sdW1uIG51bWJlciBvZiB0aGUgZmlsZSByZWZlcmVuY2UuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZUZpbGVSZWZlcmVuY2UoZmlsZVBhdGg6IHN0cmluZywgbGluZU51bWJlcjogbnVtYmVyLCBzdGFydENvbHVtbk51bWJlcjogbnVtYmVyKTogSUJvZHlGaWxlUmVmZXJlbmNlIHtcblx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UoXG5cdFx0bGluZU51bWJlcixcblx0XHRzdGFydENvbHVtbk51bWJlciArICcjZmlsZTonLmxlbmd0aCxcblx0XHRsaW5lTnVtYmVyLFxuXHRcdHN0YXJ0Q29sdW1uTnVtYmVyICsgJyNmaWxlOicubGVuZ3RoICsgZmlsZVBhdGgubGVuZ3RoLFxuXHQpO1xuXG5cdHJldHVybiB7XG5cdFx0cmFuZ2UsXG5cdFx0Y29udGVudDogZmlsZVBhdGgsXG5cdFx0aXNNYXJrZG93bkxpbms6IGZhbHNlLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNYXJrZG93blJlZmVyZW5jZShsaW5lTnVtYmVyOiBudW1iZXIsIHN0YXJ0Q29sdW1uTnVtYmVyOiBudW1iZXIsIGZpcnN0U2VnOiBzdHJpbmcsIHNlY29uZFNlZzogc3RyaW5nKTogSUJvZHlGaWxlUmVmZXJlbmNlIHtcblx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UoXG5cdFx0bGluZU51bWJlcixcblx0XHRzdGFydENvbHVtbk51bWJlciArIGZpcnN0U2VnLmxlbmd0aCArIDEsXG5cdFx0bGluZU51bWJlcixcblx0XHRzdGFydENvbHVtbk51bWJlciArIGZpcnN0U2VnLmxlbmd0aCArIHNlY29uZFNlZy5sZW5ndGggLSAxLFxuXHQpO1xuXG5cdHJldHVybiB7XG5cdFx0cmFuZ2UsXG5cdFx0Y29udGVudDogc2Vjb25kU2VnLnN1YnN0cmluZygxLCBzZWNvbmRTZWcubGVuZ3RoIC0gMSksXG5cdFx0aXNNYXJrZG93bkxpbms6IHRydWUsXG5cdH07XG59XG5cbnN1aXRlKCdQcm9tcHRGaWxlUmVmZXJlbmNlJywgZnVuY3Rpb24gKCkge1xuXHRjb25zdCB0ZXN0RGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG51bGxQb2xpY3lTZXJ2aWNlID0gbmV3IE51bGxQb2xpY3lTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbnVsbExvZ1NlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRjb25zdCBudWxsRmlsZVNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShudWxsTG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IG51bGxDb25maWdTZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgQ29uZmlndXJhdGlvblNlcnZpY2UoXG5cdFx0XHRVUkkuZmlsZSgnL2NvbmZpZy5qc29uJyksXG5cdFx0XHRudWxsRmlsZVNlcnZpY2UsXG5cdFx0XHRudWxsUG9saWN5U2VydmljZSxcblx0XHRcdG51bGxMb2dTZXJ2aWNlLFxuXHRcdCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIG51bGxGaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbnVsbExvZ1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBudWxsQ29uZmlnU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTW9kZWxTZXJ2aWNlLCB7IGdldE1vZGVsKCkgeyByZXR1cm4gbnVsbDsgfSB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYW5ndWFnZVNlcnZpY2UsIHtcblx0XHRcdGd1ZXNzTGFuZ3VhZ2VJZEJ5RmlsZXBhdGhPckZpcnN0TGluZSh1cmk6IFVSSSkge1xuXHRcdFx0XHRyZXR1cm4gZ2V0UHJvbXB0RmlsZVR5cGUodXJpKSA/PyBudWxsO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlcyBuZXN0ZWQgZmlsZSByZWZlcmVuY2VzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ3Jlc29sdmVzLW5lc3RlZC1maWxlLXJlZmVyZW5jZXMnO1xuXHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRjb25zdCByb290VXJpID0gdG9Vcmkocm9vdEZvbGRlcik7XG5cblx0XHRjb25zdCB0ZXN0ID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0UHJvbXB0RmlsZVJlZmVyZW5jZSxcblx0XHRcdC8qKlxuXHRcdFx0ICogVGhlIGZpbGUgc3RydWN0dXJlIHRvIGJlIGNyZWF0ZWQgb24gdGhlIGRpc2sgZm9yIHRoZSB0ZXN0LlxuXHRcdFx0ICovXG5cdFx0XHRbe1xuXHRcdFx0XHRuYW1lOiByb290Rm9sZGVyTmFtZSxcblx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiAnIyMgU29tZSBIZWFkZXJcXG5zb21lIGNvbnRlbnRzXFxuICcsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiAnIyMgRmlsZXNcXG5cXHQtIHRoaXMgZmlsZSAjZmlsZTpmb2xkZXIxL2ZpbGUzLnByb21wdC5tZCBcXG5cXHQtIGFsc28gdGhpcyBbZmlsZTQucHJvbXB0Lm1kXSguL2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIvZmlsZTQucHJvbXB0Lm1kKSBwbGVhc2UhXFxuICcsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRuYW1lOiAnZm9sZGVyMScsXG5cdFx0XHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZpbGUzLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IGBcXG5bXSguL3NvbWUtb3RoZXItZm9sZGVyL25vbi1leGlzdGluZy1mb2xkZXIpXFxuXFx0LSBzb21lIHNlZW1pbmdseSByYW5kb20gI2ZpbGU6JHtyb290Rm9sZGVyfS9mb2xkZXIxL3NvbWUtb3RoZXItZm9sZGVyL3lldEFub3RoZXJGb2xkZXJcdUQ4M0VcdUREMkQvYW5vdGhlci1maWxlLnByb21wdC5tZCBjb250ZW50c1xcbiBzb21lIG1vcmVcXHQgY29udGVudGAsXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnc29tZS1vdGhlci1mb2xkZXInLFxuXHRcdFx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlNC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogJ3RoaXMgZmlsZSBoYXMgYSBub24tZXhpc3RpbmcgI2ZpbGU6Li9zb21lLW5vbi1leGlzdGluZy9maWxlLnByb21wdC5tZFxcdFxcdHJlZmVyZW5jZVxcblxcblxcbmFuZCBzb21lXFxuIG5vbi1wcm9tcHQgI2ZpbGU6Li9zb21lLW5vbi1wcm9tcHQtZmlsZS5tZFxcdFxcdCBcXHRbXSguLi8uLi9mb2xkZXIxLylcXHQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZpbGUudHh0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6ICdjb250ZW50cyBvZiBhIG5vbi1wcm9tcHQtc25pcHBldCBmaWxlJyxcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6ICd5ZXRBbm90aGVyRm9sZGVyXHVEODNFXHVERDJEJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnYW5vdGhlci1maWxlLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogYFtjYXB0aW9uXSgke3Jvb3RGb2xkZXJ9L2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIpXFxuYW5vdGhlci1maWxlLnByb21wdC5tZCBjb250ZW50c1xcdCBbI2ZpbGU6ZmlsZS50eHRdKC4uL2ZpbGUudHh0KWAsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnb25lX21vcmVfZmlsZV9qdXN0X2luX2Nhc2UucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiAnb25lX21vcmVfZmlsZV9qdXN0X2luX2Nhc2UucHJvbXB0Lm1kIGNvbnRlbnRzJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fV0sXG5cdFx0XHQvKipcblx0XHRcdCAqIFRoZSByb290IGZpbGUgcGF0aCB0byBzdGFydCB0aGUgcmVzb2x2ZSBwcm9jZXNzIGZyb20uXG5cdFx0XHQgKi9cblx0XHRcdHRvVXJpKGAvJHtyb290Rm9sZGVyTmFtZX0vZmlsZTIucHJvbXB0Lm1kYCksXG5cdFx0XHQvKipcblx0XHRcdCAqIFRoZSBleHBlY3RlZCByZWZlcmVuY2VzIHRvIGJlIHJlc29sdmVkLlxuXHRcdFx0ICovXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBFeHBlY3RlZFJlZmVyZW5jZShcblx0XHRcdFx0XHRyb290VXJpLFxuXHRcdFx0XHRcdGNyZWF0ZUZpbGVSZWZlcmVuY2UoJ2ZvbGRlcjEvZmlsZTMucHJvbXB0Lm1kJywgMiwgMTQpLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHRuZXcgRXhwZWN0ZWRSZWZlcmVuY2UoXG5cdFx0XHRcdFx0cm9vdFVyaSxcblx0XHRcdFx0XHRjcmVhdGVNYXJrZG93blJlZmVyZW5jZShcblx0XHRcdFx0XHRcdDMsIDE0LFxuXHRcdFx0XHRcdFx0J1tmaWxlNC5wcm9tcHQubWRdJywgJyguL2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIvZmlsZTQucHJvbXB0Lm1kKScsXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0KSxcblx0XHRcdF1cblx0XHQpKTtcblxuXHRcdGF3YWl0IHRlc3QucnVuKCk7XG5cdH0pO1xuXG5cblx0c3VpdGUoJ21ldGFkYXRhJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Rvb2xzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAncmVzb2x2ZXMtbmVzdGVkLWZpbGUtcmVmZXJlbmNlcyc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290VXJpID0gdG9Vcmkocm9vdEZvbGRlcik7XG5cblx0XHRcdGNvbnN0IHRlc3QgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RQcm9tcHRGaWxlUmVmZXJlbmNlLFxuXHRcdFx0XHQvKipcblx0XHRcdFx0ICogVGhlIGZpbGUgc3RydWN0dXJlIHRvIGJlIGNyZWF0ZWQgb24gdGhlIGRpc2sgZm9yIHRoZSB0ZXN0LlxuXHRcdFx0XHQgKi9cblx0XHRcdFx0W3tcblx0XHRcdFx0XHRuYW1lOiByb290Rm9sZGVyTmFtZSxcblx0XHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdFx0XHQnIyMgU29tZSBIZWFkZXInLFxuXHRcdFx0XHRcdFx0XHRcdCdzb21lIGNvbnRlbnRzJyxcblx0XHRcdFx0XHRcdFx0XHQnICcsXG5cdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ1Jvb3QgcHJvbXB0IGRlc2NyaXB0aW9uLlxcJycsXG5cdFx0XHRcdFx0XHRcdFx0J3Rvb2xzOiBbXFwnbXktdG9vbDFcXCddJyxcblx0XHRcdFx0XHRcdFx0XHQnYWdlbnQ6IFwiYWdlbnRcIiAnLFxuXHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdCcjIyBGaWxlcycsXG5cdFx0XHRcdFx0XHRcdFx0J1xcdC0gdGhpcyBmaWxlICNmaWxlOmZvbGRlcjEvZmlsZTMucHJvbXB0Lm1kICcsXG5cdFx0XHRcdFx0XHRcdFx0J1xcdC0gYWxzbyB0aGlzIFtmaWxlNC5wcm9tcHQubWRdKC4vZm9sZGVyMS9zb21lLW90aGVyLWZvbGRlci9maWxlNC5wcm9tcHQubWQpIHBsZWFzZSEnLFxuXHRcdFx0XHRcdFx0XHRcdCcgJyxcblx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdG5hbWU6ICdmb2xkZXIxJyxcblx0XHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHQndG9vbHM6IFsgXFwnbXktdG9vbDFcXCcgLCBdJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHQnW10oLi9zb21lLW90aGVyLWZvbGRlci9ub24tZXhpc3RpbmctZm9sZGVyKScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGBcXHQtIHNvbWUgc2VlbWluZ2x5IHJhbmRvbSAjZmlsZToke3Jvb3RGb2xkZXJ9L2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIveWV0QW5vdGhlckZvbGRlclx1RDgzRVx1REQyRC9hbm90aGVyLWZpbGUucHJvbXB0Lm1kIGNvbnRlbnRzYCxcblx0XHRcdFx0XHRcdFx0XHRcdFx0JyBzb21lIG1vcmVcXHQgY29udGVudCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0bmFtZTogJ3NvbWUtb3RoZXItZm9sZGVyJyxcblx0XHRcdFx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTQucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQndG9vbHM6IFtcXCdteS10b29sMVxcJywgXCJteS10b29sMlwiLCB0cnVlLCAsIF0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J3NvbWV0aGluZzogdHJ1ZScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnYWdlbnQ6IFxcJ2Fza1xcJ1xcdCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCd0aGlzIGZpbGUgaGFzIGEgbm9uLWV4aXN0aW5nICNmaWxlOi4vc29tZS1ub24tZXhpc3RpbmcvZmlsZS5wcm9tcHQubWRcXHRcXHRyZWZlcmVuY2UnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCdhbmQgc29tZScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnIG5vbi1wcm9tcHQgI2ZpbGU6Li9zb21lLW5vbi1wcm9tcHQtZmlsZS5tZFxcdFxcdCBcXHRbXSguLi8uLi9mb2xkZXIxLylcXHQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZS50eHQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiAnY29udGVudHMgb2YgYSBub24tcHJvbXB0LXNuaXBwZXQgZmlsZScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAneWV0QW5vdGhlckZvbGRlclx1RDgzRVx1REQyRCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2Fub3RoZXItZmlsZS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCd0b29sczogW1xcJ215LXRvb2wzXFwnLCBcIm15LXRvb2wyXCIgXScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0YFtdKCR7cm9vdEZvbGRlcn0vZm9sZGVyMS9zb21lLW90aGVyLWZvbGRlcilgLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCdhbm90aGVyLWZpbGUucHJvbXB0Lm1kIGNvbnRlbnRzXFx0IFsjZmlsZTpmaWxlLnR4dF0oLi4vZmlsZS50eHQpJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdvbmVfbW9yZV9maWxlX2p1c3RfaW5fY2FzZS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogJ29uZV9tb3JlX2ZpbGVfanVzdF9pbl9jYXNlLnByb21wdC5tZCBjb250ZW50cycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHQvKipcblx0XHRcdFx0ICogVGhlIHJvb3QgZmlsZSBwYXRoIHRvIHN0YXJ0IHRoZSByZXNvbHZlIHByb2Nlc3MgZnJvbS5cblx0XHRcdFx0ICovXG5cdFx0XHRcdHRvVXJpKGAvJHtyb290Rm9sZGVyTmFtZX0vZmlsZTIucHJvbXB0Lm1kYCksXG5cdFx0XHRcdC8qKlxuXHRcdFx0XHQgKiBUaGUgZXhwZWN0ZWQgcmVmZXJlbmNlcyB0byBiZSByZXNvbHZlZC5cblx0XHRcdFx0ICovXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRuZXcgRXhwZWN0ZWRSZWZlcmVuY2UoXG5cdFx0XHRcdFx0XHRyb290VXJpLFxuXHRcdFx0XHRcdFx0Y3JlYXRlRmlsZVJlZmVyZW5jZSgnZm9sZGVyMS9maWxlMy5wcm9tcHQubWQnLCA3LCAxNCksXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRuZXcgRXhwZWN0ZWRSZWZlcmVuY2UoXG5cdFx0XHRcdFx0XHRyb290VXJpLFxuXHRcdFx0XHRcdFx0Y3JlYXRlTWFya2Rvd25SZWZlcmVuY2UoXG5cdFx0XHRcdFx0XHRcdDgsIDE0LFxuXHRcdFx0XHRcdFx0XHQnW2ZpbGU0LnByb21wdC5tZF0nLCAnKC4vZm9sZGVyMS9zb21lLW90aGVyLWZvbGRlci9maWxlNC5wcm9tcHQubWQpJyxcblx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XVxuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IG1ldGFkYXRhID0gYXdhaXQgdGVzdC5ydW4oKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bWV0YWRhdGEsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsXG5cdFx0XHRcdFx0YWdlbnQ6ICdhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdSb290IHByb21wdCBkZXNjcmlwdGlvbi4nLFxuXHRcdFx0XHRcdHRvb2xzOiBbJ215LXRvb2wxJ10sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdNdXN0IGhhdmUgY29ycmVjdCBtZXRhZGF0YS4nLFxuXHRcdFx0KTtcblxuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ2FwcGx5VG8nLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdwcm9tcHQgbGFuZ3VhZ2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ3Jlc29sdmVzLW5lc3RlZC1maWxlLXJlZmVyZW5jZXMnO1xuXHRcdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRcdGNvbnN0IHJvb3RVcmkgPSB0b1VyaShyb290Rm9sZGVyKTtcblxuXHRcdFx0XHRjb25zdCB0ZXN0ID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0UHJvbXB0RmlsZVJlZmVyZW5jZSxcblx0XHRcdFx0XHQvKipcblx0XHRcdFx0XHQgKiBUaGUgZmlsZSBzdHJ1Y3R1cmUgdG8gYmUgY3JlYXRlZCBvbiB0aGUgZGlzayBmb3IgdGhlIHRlc3QuXG5cdFx0XHRcdFx0ICovXG5cdFx0XHRcdFx0W3tcblx0XHRcdFx0XHRcdG5hbWU6IHJvb3RGb2xkZXJOYW1lLFxuXHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHQnIyMgU29tZSBIZWFkZXInLFxuXHRcdFx0XHRcdFx0XHRcdFx0J3NvbWUgY29udGVudHMnLFxuXHRcdFx0XHRcdFx0XHRcdFx0JyAnLFxuXHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHQnYXBwbHlUbzogXFwnKiovKlxcJycsXG5cdFx0XHRcdFx0XHRcdFx0XHQndG9vbHM6IFsgXFwnbXktdG9vbDEyXFwnICwgXScsXG5cdFx0XHRcdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0Rlc2NyaXB0aW9uIG9mIG15IHByb21wdC5cXCcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHQnIyMgRmlsZXMnLFxuXHRcdFx0XHRcdFx0XHRcdFx0J1xcdC0gdGhpcyBmaWxlICNmaWxlOmZvbGRlcjEvZmlsZTMucHJvbXB0Lm1kICcsXG5cdFx0XHRcdFx0XHRcdFx0XHQnXFx0LSBhbHNvIHRoaXMgW2ZpbGU0LnByb21wdC5tZF0oLi9mb2xkZXIxL3NvbWUtb3RoZXItZm9sZGVyL2ZpbGU0LnByb21wdC5tZCkgcGxlYXNlIScsXG5cdFx0XHRcdFx0XHRcdFx0XHQnICcsXG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmb2xkZXIxJyxcblx0XHRcdFx0XHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQndG9vbHM6IFsgXFwnbXktdG9vbDFcXCcgLCBdJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnIHNvbWUgbW9yZVxcdCBjb250ZW50Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdzb21lLW90aGVyLWZvbGRlcicsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZpbGU0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J3Rvb2xzOiBbXFwnbXktdG9vbDFcXCcsIFwibXktdG9vbDJcIiwgdHJ1ZSwgLCBcXCdteS10b29sM1xcJyAsIF0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnc29tZXRoaW5nOiB0cnVlJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J2FnZW50OiBcXCdhZ2VudFxcJ1xcdCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCdhbmQgc29tZSBtb3JlIGNvbnRlbnQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHQvKipcblx0XHRcdFx0XHQgKiBUaGUgcm9vdCBmaWxlIHBhdGggdG8gc3RhcnQgdGhlIHJlc29sdmUgcHJvY2VzcyBmcm9tLlxuXHRcdFx0XHRcdCAqL1xuXHRcdFx0XHRcdHRvVXJpKGAvJHtyb290Rm9sZGVyTmFtZX0vZmlsZTIucHJvbXB0Lm1kYCksXG5cdFx0XHRcdFx0LyoqXG5cdFx0XHRcdFx0ICogVGhlIGV4cGVjdGVkIHJlZmVyZW5jZXMgdG8gYmUgcmVzb2x2ZWQuXG5cdFx0XHRcdFx0ICovXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0bmV3IEV4cGVjdGVkUmVmZXJlbmNlKFxuXHRcdFx0XHRcdFx0XHRyb290VXJpLFxuXHRcdFx0XHRcdFx0XHRjcmVhdGVGaWxlUmVmZXJlbmNlKCdmb2xkZXIxL2ZpbGUzLnByb21wdC5tZCcsIDcsIDE0KSxcblx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRuZXcgRXhwZWN0ZWRSZWZlcmVuY2UoXG5cdFx0XHRcdFx0XHRcdHJvb3RVcmksXG5cdFx0XHRcdFx0XHRcdGNyZWF0ZU1hcmtkb3duUmVmZXJlbmNlKFxuXHRcdFx0XHRcdFx0XHRcdDgsIDE0LFxuXHRcdFx0XHRcdFx0XHRcdCdbZmlsZTQucHJvbXB0Lm1kXScsICcoLi9mb2xkZXIxL3NvbWUtb3RoZXItZm9sZGVyL2ZpbGU0LnByb21wdC5tZCknLFxuXHRcdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCkpO1xuXG5cdFx0XHRcdGNvbnN0IG1ldGFkYXRhID0gYXdhaXQgdGVzdC5ydW4oKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdG1ldGFkYXRhLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHByb21wdFR5cGU6IFByb21wdHNUeXBlLnByb21wdCxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRGVzY3JpcHRpb24gb2YgbXkgcHJvbXB0LicsXG5cdFx0XHRcdFx0XHR0b29sczogWydteS10b29sMTInXSxcblx0XHRcdFx0XHRcdGFwcGx5VG86ICcqKi8qJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCdNdXN0IGhhdmUgY29ycmVjdCBtZXRhZGF0YS4nLFxuXHRcdFx0XHQpO1xuXG5cdFx0XHR9KTtcblxuXG5cdFx0XHR0ZXN0KCdpbnN0cnVjdGlvbnMgbGFuZ3VhZ2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ3Jlc29sdmVzLW5lc3RlZC1maWxlLXJlZmVyZW5jZXMnO1xuXHRcdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRcdGNvbnN0IHJvb3RVcmkgPSB0b1VyaShyb290Rm9sZGVyKTtcblxuXHRcdFx0XHRjb25zdCB0ZXN0ID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0UHJvbXB0RmlsZVJlZmVyZW5jZSxcblx0XHRcdFx0XHQvKipcblx0XHRcdFx0XHQgKiBUaGUgZmlsZSBzdHJ1Y3R1cmUgdG8gYmUgY3JlYXRlZCBvbiB0aGUgZGlzayBmb3IgdGhlIHRlc3QuXG5cdFx0XHRcdFx0ICovXG5cdFx0XHRcdFx0W3tcblx0XHRcdFx0XHRcdG5hbWU6IHJvb3RGb2xkZXJOYW1lLFxuXHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHQnIyMgU29tZSBIZWFkZXInLFxuXHRcdFx0XHRcdFx0XHRcdFx0J3NvbWUgY29udGVudHMnLFxuXHRcdFx0XHRcdFx0XHRcdFx0JyAnLFxuXHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTIuaW5zdHJ1Y3Rpb25zLm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHQnYXBwbHlUbzogXFwnKiovKlxcJycsXG5cdFx0XHRcdFx0XHRcdFx0XHQndG9vbHM6IFsgXFwnbXktdG9vbDEyXFwnICwgXScsXG5cdFx0XHRcdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0Rlc2NyaXB0aW9uIG9mIG15IGluc3RydWN0aW9ucyBmaWxlLlxcJycsXG5cdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdCcjIyBGaWxlcycsXG5cdFx0XHRcdFx0XHRcdFx0XHQnXFx0LSB0aGlzIGZpbGUgI2ZpbGU6Zm9sZGVyMS9maWxlMy5wcm9tcHQubWQgJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdcXHQtIGFsc28gdGhpcyBbZmlsZTQucHJvbXB0Lm1kXSguL2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIvZmlsZTQucHJvbXB0Lm1kKSBwbGVhc2UhJyxcblx0XHRcdFx0XHRcdFx0XHRcdCcgJyxcblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZvbGRlcjEnLFxuXHRcdFx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlMy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCd0b29sczogWyBcXCdteS10b29sMVxcJyAsIF0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCcgc29tZSBtb3JlXFx0IGNvbnRlbnQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bmFtZTogJ3NvbWUtb3RoZXItZm9sZGVyJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTQucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQndG9vbHM6IFtcXCdteS10b29sMVxcJywgXCJteS10b29sMlwiLCB0cnVlLCAsIFxcJ215LXRvb2wzXFwnICwgXScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCdzb21ldGhpbmc6IHRydWUnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnYWdlbnQ6IFxcJ2FnZW50XFwnXFx0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J2FuZCBzb21lIG1vcmUgY29udGVudCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdC8qKlxuXHRcdFx0XHRcdCAqIFRoZSByb290IGZpbGUgcGF0aCB0byBzdGFydCB0aGUgcmVzb2x2ZSBwcm9jZXNzIGZyb20uXG5cdFx0XHRcdFx0ICovXG5cdFx0XHRcdFx0dG9VcmkoYC8ke3Jvb3RGb2xkZXJOYW1lfS9maWxlMi5pbnN0cnVjdGlvbnMubWRgKSxcblx0XHRcdFx0XHQvKipcblx0XHRcdFx0XHQgKiBUaGUgZXhwZWN0ZWQgcmVmZXJlbmNlcyB0byBiZSByZXNvbHZlZC5cblx0XHRcdFx0XHQgKi9cblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRuZXcgRXhwZWN0ZWRSZWZlcmVuY2UoXG5cdFx0XHRcdFx0XHRcdHJvb3RVcmksXG5cdFx0XHRcdFx0XHRcdGNyZWF0ZUZpbGVSZWZlcmVuY2UoJ2ZvbGRlcjEvZmlsZTMucHJvbXB0Lm1kJywgNywgMTQpLFxuXHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdG5ldyBFeHBlY3RlZFJlZmVyZW5jZShcblx0XHRcdFx0XHRcdFx0cm9vdFVyaSxcblx0XHRcdFx0XHRcdFx0Y3JlYXRlTWFya2Rvd25SZWZlcmVuY2UoXG5cdFx0XHRcdFx0XHRcdFx0OCwgMTQsXG5cdFx0XHRcdFx0XHRcdFx0J1tmaWxlNC5wcm9tcHQubWRdJywgJyguL2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIvZmlsZTQucHJvbXB0Lm1kKScsXG5cdFx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KSk7XG5cblx0XHRcdFx0Y29uc3QgbWV0YWRhdGEgPSBhd2FpdCB0ZXN0LnJ1bigpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0bWV0YWRhdGEsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cHJvbXB0VHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRcdFx0YXBwbHlUbzogJyoqLyonLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdEZXNjcmlwdGlvbiBvZiBteSBpbnN0cnVjdGlvbnMgZmlsZS4nLFxuXHRcdFx0XHRcdFx0dG9vbHM6IFsnbXktdG9vbDEyJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQnTXVzdCBoYXZlIGNvcnJlY3QgbWV0YWRhdGEuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ3Rvb2xzIGFuZCBhZ2VudCBjb21wYXRpYmlsaXR5JywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnYXNrIGFnZW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdyZXNvbHZlcy1uZXN0ZWQtZmlsZS1yZWZlcmVuY2VzJztcblx0XHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0XHRjb25zdCByb290VXJpID0gdG9Vcmkocm9vdEZvbGRlcik7XG5cblx0XHRcdFx0Y29uc3QgdGVzdCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFByb21wdEZpbGVSZWZlcmVuY2UsXG5cdFx0XHRcdFx0LyoqXG5cdFx0XHRcdFx0ICogVGhlIGZpbGUgc3RydWN0dXJlIHRvIGJlIGNyZWF0ZWQgb24gdGhlIGRpc2sgZm9yIHRoZSB0ZXN0LlxuXHRcdFx0XHRcdCAqL1xuXHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRuYW1lOiByb290Rm9sZGVyTmFtZSxcblx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0XHRcdFx0JyMjIFNvbWUgSGVhZGVyJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdzb21lIGNvbnRlbnRzJyxcblx0XHRcdFx0XHRcdFx0XHRcdCcgJyxcblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZpbGUyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdEZXNjcmlwdGlvbiBvZiBteSBwcm9tcHQuXFwnJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdhZ2VudDogXCJhc2tcIiAnLFxuXHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHQnIyMgRmlsZXMnLFxuXHRcdFx0XHRcdFx0XHRcdFx0J1xcdC0gdGhpcyBmaWxlICNmaWxlOmZvbGRlcjEvZmlsZTMucHJvbXB0Lm1kICcsXG5cdFx0XHRcdFx0XHRcdFx0XHQnXFx0LSBhbHNvIHRoaXMgW2ZpbGU0LnByb21wdC5tZF0oLi9mb2xkZXIxL3NvbWUtb3RoZXItZm9sZGVyL2ZpbGU0LnByb21wdC5tZCkgcGxlYXNlIScsXG5cdFx0XHRcdFx0XHRcdFx0XHQnICcsXG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmb2xkZXIxJyxcblx0XHRcdFx0XHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQndG9vbHM6IFsgXFwnbXktdG9vbDFcXCcgLCBdJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnYWdlbnQ6IFxcJ2FnZW50XFwnXFx0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnIHNvbWUgbW9yZVxcdCBjb250ZW50Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdzb21lLW90aGVyLWZvbGRlcicsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZpbGU0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J3Rvb2xzOiBbXFwnbXktdG9vbDFcXCcsIFwibXktdG9vbDJcIiwgdHJ1ZSwgLCBdJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J3NvbWV0aGluZzogdHJ1ZScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCdhZ2VudDogXFwnYXNrXFwnXFx0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J2FuZCBzb21lIG1vcmUgY29udGVudCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdC8qKlxuXHRcdFx0XHRcdCAqIFRoZSByb290IGZpbGUgcGF0aCB0byBzdGFydCB0aGUgcmVzb2x2ZSBwcm9jZXNzIGZyb20uXG5cdFx0XHRcdFx0ICovXG5cdFx0XHRcdFx0dG9VcmkoYC8ke3Jvb3RGb2xkZXJOYW1lfS9maWxlMi5wcm9tcHQubWRgKSxcblx0XHRcdFx0XHQvKipcblx0XHRcdFx0XHQgKiBUaGUgZXhwZWN0ZWQgcmVmZXJlbmNlcyB0byBiZSByZXNvbHZlZC5cblx0XHRcdFx0XHQgKi9cblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRuZXcgRXhwZWN0ZWRSZWZlcmVuY2UoXG5cdFx0XHRcdFx0XHRcdHJvb3RVcmksXG5cdFx0XHRcdFx0XHRcdGNyZWF0ZUZpbGVSZWZlcmVuY2UoJ2ZvbGRlcjEvZmlsZTMucHJvbXB0Lm1kJywgNiwgMTQpLFxuXHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdG5ldyBFeHBlY3RlZFJlZmVyZW5jZShcblx0XHRcdFx0XHRcdFx0cm9vdFVyaSxcblx0XHRcdFx0XHRcdFx0Y3JlYXRlTWFya2Rvd25SZWZlcmVuY2UoXG5cdFx0XHRcdFx0XHRcdFx0NywgMTQsXG5cdFx0XHRcdFx0XHRcdFx0J1tmaWxlNC5wcm9tcHQubWRdJywgJyguL2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIvZmlsZTQucHJvbXB0Lm1kKScsXG5cdFx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KSk7XG5cblx0XHRcdFx0Y29uc3QgbWV0YWRhdGEgPSBhd2FpdCB0ZXN0LnJ1bigpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0bWV0YWRhdGEsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cHJvbXB0VHlwZTogUHJvbXB0c1R5cGUucHJvbXB0LFxuXHRcdFx0XHRcdFx0YWdlbnQ6IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0Rlc2NyaXB0aW9uIG9mIG15IHByb21wdC4nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J011c3QgaGF2ZSBjb3JyZWN0IG1ldGFkYXRhLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZWRpdCBhZ2VudCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAncmVzb2x2ZXMtbmVzdGVkLWZpbGUtcmVmZXJlbmNlcyc7XG5cdFx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdFx0Y29uc3Qgcm9vdFVyaSA9IHRvVXJpKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHRcdGNvbnN0IHRlc3QgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RQcm9tcHRGaWxlUmVmZXJlbmNlLFxuXHRcdFx0XHRcdC8qKlxuXHRcdFx0XHRcdCAqIFRoZSBmaWxlIHN0cnVjdHVyZSB0byBiZSBjcmVhdGVkIG9uIHRoZSBkaXNrIGZvciB0aGUgdGVzdC5cblx0XHRcdFx0XHQgKi9cblx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0bmFtZTogcm9vdEZvbGRlck5hbWUsXG5cdFx0XHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZpbGUxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdCcjIyBTb21lIEhlYWRlcicsXG5cdFx0XHRcdFx0XHRcdFx0XHQnc29tZSBjb250ZW50cycsXG5cdFx0XHRcdFx0XHRcdFx0XHQnICcsXG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnRGVzY3JpcHRpb24gb2YgbXkgcHJvbXB0LlxcJycsXG5cdFx0XHRcdFx0XHRcdFx0XHQnYWdlbnQ6XFx0XFx0XCJlZGl0XCJcXHRcXHQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHQnIyMgRmlsZXMnLFxuXHRcdFx0XHRcdFx0XHRcdFx0J1xcdC0gdGhpcyBmaWxlICNmaWxlOmZvbGRlcjEvZmlsZTMucHJvbXB0Lm1kICcsXG5cdFx0XHRcdFx0XHRcdFx0XHQnXFx0LSBhbHNvIHRoaXMgW2ZpbGU0LnByb21wdC5tZF0oLi9mb2xkZXIxL3NvbWUtb3RoZXItZm9sZGVyL2ZpbGU0LnByb21wdC5tZCkgcGxlYXNlIScsXG5cdFx0XHRcdFx0XHRcdFx0XHQnICcsXG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmb2xkZXIxJyxcblx0XHRcdFx0XHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQndG9vbHM6IFsgXFwnbXktdG9vbDFcXCcgLCBdJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnIHNvbWUgbW9yZVxcdCBjb250ZW50Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdzb21lLW90aGVyLWZvbGRlcicsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZpbGU0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J3Rvb2xzOiBbXFwnbXktdG9vbDFcXCcsIFwibXktdG9vbDJcIiwgdHJ1ZSwgLCBdJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J3NvbWV0aGluZzogdHJ1ZScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCdhZ2VudDogXFwnYWdlbnRcXCdcXHQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnYW5kIHNvbWUgbW9yZSBjb250ZW50Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0LyoqXG5cdFx0XHRcdFx0ICogVGhlIHJvb3QgZmlsZSBwYXRoIHRvIHN0YXJ0IHRoZSByZXNvbHZlIHByb2Nlc3MgZnJvbS5cblx0XHRcdFx0XHQgKi9cblx0XHRcdFx0XHR0b1VyaShgLyR7cm9vdEZvbGRlck5hbWV9L2ZpbGUyLnByb21wdC5tZGApLFxuXHRcdFx0XHRcdC8qKlxuXHRcdFx0XHRcdCAqIFRoZSBleHBlY3RlZCByZWZlcmVuY2VzIHRvIGJlIHJlc29sdmVkLlxuXHRcdFx0XHRcdCAqL1xuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdG5ldyBFeHBlY3RlZFJlZmVyZW5jZShcblx0XHRcdFx0XHRcdFx0cm9vdFVyaSxcblx0XHRcdFx0XHRcdFx0Y3JlYXRlRmlsZVJlZmVyZW5jZSgnZm9sZGVyMS9maWxlMy5wcm9tcHQubWQnLCA2LCAxNCksXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0bmV3IEV4cGVjdGVkUmVmZXJlbmNlKFxuXHRcdFx0XHRcdFx0XHRyb290VXJpLFxuXHRcdFx0XHRcdFx0XHRjcmVhdGVNYXJrZG93blJlZmVyZW5jZShcblx0XHRcdFx0XHRcdFx0XHQ3LCAxNCxcblx0XHRcdFx0XHRcdFx0XHQnW2ZpbGU0LnByb21wdC5tZF0nLCAnKC4vZm9sZGVyMS9zb21lLW90aGVyLWZvbGRlci9maWxlNC5wcm9tcHQubWQpJyxcblx0XHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpKTtcblxuXHRcdFx0XHRjb25zdCBtZXRhZGF0YSA9IGF3YWl0IHRlc3QucnVuKCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRtZXRhZGF0YSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsXG5cdFx0XHRcdFx0XHRhZ2VudDogQ2hhdE1vZGVLaW5kLkVkaXQsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0Rlc2NyaXB0aW9uIG9mIG15IHByb21wdC4nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J011c3QgaGF2ZSBjb3JyZWN0IG1ldGFkYXRhLicsXG5cdFx0XHRcdCk7XG5cblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdhZ2VudCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAncmVzb2x2ZXMtbmVzdGVkLWZpbGUtcmVmZXJlbmNlcyc7XG5cdFx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdFx0Y29uc3Qgcm9vdFVyaSA9IHRvVXJpKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHRcdGNvbnN0IHRlc3QgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RQcm9tcHRGaWxlUmVmZXJlbmNlLFxuXHRcdFx0XHRcdC8qKlxuXHRcdFx0XHRcdCAqIFRoZSBmaWxlIHN0cnVjdHVyZSB0byBiZSBjcmVhdGVkIG9uIHRoZSBkaXNrIGZvciB0aGUgdGVzdC5cblx0XHRcdFx0XHQgKi9cblx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0bmFtZTogcm9vdEZvbGRlck5hbWUsXG5cdFx0XHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZpbGUxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdCcjIyBTb21lIEhlYWRlcicsXG5cdFx0XHRcdFx0XHRcdFx0XHQnc29tZSBjb250ZW50cycsXG5cdFx0XHRcdFx0XHRcdFx0XHQnICcsXG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnRGVzY3JpcHRpb24gb2YgbXkgcHJvbXB0LlxcJycsXG5cdFx0XHRcdFx0XHRcdFx0XHQnYWdlbnQ6IFxcdFxcdCBcImFnZW50XCIgXFx0XFx0ICcsXG5cdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdCcjIyBGaWxlcycsXG5cdFx0XHRcdFx0XHRcdFx0XHQnXFx0LSB0aGlzIGZpbGUgI2ZpbGU6Zm9sZGVyMS9maWxlMy5wcm9tcHQubWQgJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdcXHQtIGFsc28gdGhpcyBbZmlsZTQucHJvbXB0Lm1kXSguL2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIvZmlsZTQucHJvbXB0Lm1kKSBwbGVhc2UhJyxcblx0XHRcdFx0XHRcdFx0XHRcdCcgJyxcblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZvbGRlcjEnLFxuXHRcdFx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlMy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCd0b29sczogWyBcXCdteS10b29sMVxcJyAsIF0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCcgc29tZSBtb3JlXFx0IGNvbnRlbnQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bmFtZTogJ3NvbWUtb3RoZXItZm9sZGVyJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTQucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQndG9vbHM6IFtcXCdteS10b29sMVxcJywgXCJteS10b29sMlwiLCB0cnVlLCAsIFxcJ215LXRvb2wzXFwnICwgXScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCdzb21ldGhpbmc6IHRydWUnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnYWdlbnQ6IFxcJ2FnZW50XFwnXFx0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J2FuZCBzb21lIG1vcmUgY29udGVudCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdC8qKlxuXHRcdFx0XHRcdCAqIFRoZSByb290IGZpbGUgcGF0aCB0byBzdGFydCB0aGUgcmVzb2x2ZSBwcm9jZXNzIGZyb20uXG5cdFx0XHRcdFx0ICovXG5cdFx0XHRcdFx0dG9VcmkoYC8ke3Jvb3RGb2xkZXJOYW1lfS9maWxlMi5wcm9tcHQubWRgKSxcblx0XHRcdFx0XHQvKipcblx0XHRcdFx0XHQgKiBUaGUgZXhwZWN0ZWQgcmVmZXJlbmNlcyB0byBiZSByZXNvbHZlZC5cblx0XHRcdFx0XHQgKi9cblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRuZXcgRXhwZWN0ZWRSZWZlcmVuY2UoXG5cdFx0XHRcdFx0XHRcdHJvb3RVcmksXG5cdFx0XHRcdFx0XHRcdGNyZWF0ZUZpbGVSZWZlcmVuY2UoJ2ZvbGRlcjEvZmlsZTMucHJvbXB0Lm1kJywgNiwgMTQpLFxuXHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdG5ldyBFeHBlY3RlZFJlZmVyZW5jZShcblx0XHRcdFx0XHRcdFx0cm9vdFVyaSxcblx0XHRcdFx0XHRcdFx0Y3JlYXRlTWFya2Rvd25SZWZlcmVuY2UoXG5cdFx0XHRcdFx0XHRcdFx0NywgMTQsXG5cdFx0XHRcdFx0XHRcdFx0J1tmaWxlNC5wcm9tcHQubWRdJywgJyguL2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIvZmlsZTQucHJvbXB0Lm1kKScsXG5cdFx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KSk7XG5cblx0XHRcdFx0Y29uc3QgbWV0YWRhdGEgPSBhd2FpdCB0ZXN0LnJ1bigpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0bWV0YWRhdGEsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cHJvbXB0VHlwZTogUHJvbXB0c1R5cGUucHJvbXB0LFxuXHRcdFx0XHRcdFx0YWdlbnQ6IENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRGVzY3JpcHRpb24gb2YgbXkgcHJvbXB0LicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQnTXVzdCBoYXZlIGNvcnJlY3QgbWV0YWRhdGEuJyxcblx0XHRcdFx0KTtcblxuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ25vIGFnZW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdyZXNvbHZlcy1uZXN0ZWQtZmlsZS1yZWZlcmVuY2VzJztcblx0XHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0XHRjb25zdCByb290VXJpID0gdG9Vcmkocm9vdEZvbGRlcik7XG5cblx0XHRcdFx0Y29uc3QgdGVzdCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFByb21wdEZpbGVSZWZlcmVuY2UsXG5cdFx0XHRcdFx0LyoqXG5cdFx0XHRcdFx0ICogVGhlIGZpbGUgc3RydWN0dXJlIHRvIGJlIGNyZWF0ZWQgb24gdGhlIGRpc2sgZm9yIHRoZSB0ZXN0LlxuXHRcdFx0XHRcdCAqL1xuXHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRuYW1lOiByb290Rm9sZGVyTmFtZSxcblx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0XHRcdFx0JyMjIFNvbWUgSGVhZGVyJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdzb21lIGNvbnRlbnRzJyxcblx0XHRcdFx0XHRcdFx0XHRcdCcgJyxcblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZpbGUyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0J3Rvb2xzOiBbIFxcJ215LXRvb2wxMlxcJyAsIF0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdEZXNjcmlwdGlvbiBvZiB0aGUgcHJvbXB0IGZpbGUuXFwnJyxcblx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0JyMjIEZpbGVzJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdcXHQtIHRoaXMgZmlsZSAjZmlsZTpmb2xkZXIxL2ZpbGUzLnByb21wdC5tZCAnLFxuXHRcdFx0XHRcdFx0XHRcdFx0J1xcdC0gYWxzbyB0aGlzIFtmaWxlNC5wcm9tcHQubWRdKC4vZm9sZGVyMS9zb21lLW90aGVyLWZvbGRlci9maWxlNC5wcm9tcHQubWQpIHBsZWFzZSEnLFxuXHRcdFx0XHRcdFx0XHRcdFx0JyAnLFxuXHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZm9sZGVyMScsXG5cdFx0XHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZpbGUzLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0J3Rvb2xzOiBbIFxcJ215LXRvb2wxXFwnICwgXScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0JyBzb21lIG1vcmVcXHQgY29udGVudCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnc29tZS1vdGhlci1mb2xkZXInLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlNC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCd0b29sczogW1xcJ215LXRvb2wxXFwnLCBcIm15LXRvb2wyXCIsIHRydWUsICwgXFwnbXktdG9vbDNcXCcgLCBdJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J3NvbWV0aGluZzogdHJ1ZScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCdhZ2VudDogXFwnYWdlbnRcXCdcXHQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnYW5kIHNvbWUgbW9yZSBjb250ZW50Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0LyoqXG5cdFx0XHRcdFx0ICogVGhlIHJvb3QgZmlsZSBwYXRoIHRvIHN0YXJ0IHRoZSByZXNvbHZlIHByb2Nlc3MgZnJvbS5cblx0XHRcdFx0XHQgKi9cblx0XHRcdFx0XHR0b1VyaShgLyR7cm9vdEZvbGRlck5hbWV9L2ZpbGUyLnByb21wdC5tZGApLFxuXHRcdFx0XHRcdC8qKlxuXHRcdFx0XHRcdCAqIFRoZSBleHBlY3RlZCByZWZlcmVuY2VzIHRvIGJlIHJlc29sdmVkLlxuXHRcdFx0XHRcdCAqL1xuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdG5ldyBFeHBlY3RlZFJlZmVyZW5jZShcblx0XHRcdFx0XHRcdFx0cm9vdFVyaSxcblx0XHRcdFx0XHRcdFx0Y3JlYXRlRmlsZVJlZmVyZW5jZSgnZm9sZGVyMS9maWxlMy5wcm9tcHQubWQnLCA2LCAxNCksXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0bmV3IEV4cGVjdGVkUmVmZXJlbmNlKFxuXHRcdFx0XHRcdFx0XHRyb290VXJpLFxuXHRcdFx0XHRcdFx0XHRjcmVhdGVNYXJrZG93blJlZmVyZW5jZShcblx0XHRcdFx0XHRcdFx0XHQ3LCAxNCxcblx0XHRcdFx0XHRcdFx0XHQnW2ZpbGU0LnByb21wdC5tZF0nLCAnKC4vZm9sZGVyMS9zb21lLW90aGVyLWZvbGRlci9maWxlNC5wcm9tcHQubWQpJyxcblx0XHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpKTtcblxuXHRcdFx0XHRjb25zdCBtZXRhZGF0YSA9IGF3YWl0IHRlc3QucnVuKCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRtZXRhZGF0YSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsXG5cdFx0XHRcdFx0XHR0b29sczogWydteS10b29sMTInXSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRGVzY3JpcHRpb24gb2YgdGhlIHByb21wdCBmaWxlLicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQnTXVzdCBoYXZlIGNvcnJlY3QgbWV0YWRhdGEuJyxcblx0XHRcdFx0KTtcblxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBc0Isc0JBQXNCO0FBQzVDLFNB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
