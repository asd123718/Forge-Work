import assert from "assert";
import { URI } from "../../../../../../base/common/uri.js";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { FileService } from "../../../../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { FileType, createFileSystemProviderError, FileSystemProviderErrorCode } from "../../../../../../platform/files/common/files.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { PromptFileSource, PromptsType } from "../../../common/promptSyntax/promptTypes.js";
import { PromptsStorage } from "../../../common/promptSyntax/service/promptsService.js";
import { createSkillFileUri, migrateCustomizations, migratePromptFileToSkill } from "../../../browser/aiCustomization/customizationMigration.js";
import { CUSTOMIZATION_MIGRATION_CATEGORIES, CustomizationMigrationCategoryId, getCustomizationMigrationCategory } from "../../../browser/aiCustomization/customizationMigrationCategories.js";
class DeleteFailingFileSystemProvider extends InMemoryFileSystemProvider {
  async delete(resource, options) {
    if (this.deleteFailureResource && isEqual(resource, this.deleteFailureResource)) {
      throw new Error("Expected delete failure");
    }
    await super.delete(resource, options);
  }
}
class ConcurrentTargetFileSystemProvider extends InMemoryFileSystemProvider {
  async writeFile(resource, content, options) {
    if (this.conflictResource && isEqual(resource, this.conflictResource)) {
      this.conflictResource = void 0;
      await super.writeFile(resource, VSBuffer.fromString("foreign content").buffer, {
        create: true,
        overwrite: true,
        unlock: false,
        atomic: false
      });
      throw createFileSystemProviderError("file exists already", FileSystemProviderErrorCode.FileExists);
    }
    await super.writeFile(resource, content, options);
  }
}
suite("customizationMigration", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("splits candidates into focused, non-overlapping categories", () => {
    const customizations = [
      { uri: URI.file("/workspace/.github/prompts/review.prompt.md"), storage: PromptsStorage.local, type: PromptsType.prompt, source: PromptFileSource.GitHubWorkspace },
      { uri: URI.file("/user-data/prompts/release.prompt.md"), storage: PromptsStorage.user, type: PromptsType.prompt, source: PromptFileSource.UserData },
      { uri: URI.file("/user-data/prompts/reviewer.agent.md"), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.UserData },
      { uri: URI.file("/user-data/prompts/style.instructions.md"), storage: PromptsStorage.user, type: PromptsType.instructions, source: PromptFileSource.UserData },
      { uri: URI.file("/home/test/.copilot/agents/planner.agent.md"), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.CopilotPersonal },
      { uri: URI.file("/workspace/.github/skills/deploy/SKILL.md"), storage: PromptsStorage.local, type: PromptsType.skill, source: PromptFileSource.GitHubWorkspace }
    ];
    const candidatesFor = (id) => customizations.filter((customization) => getCustomizationMigrationCategory(id).isCandidate(customization)).map((customization) => customization.uri.path);
    assert.deepStrictEqual({
      promptFiles: candidatesFor(CustomizationMigrationCategoryId.PromptFiles),
      userData: candidatesFor(CustomizationMigrationCategoryId.UserData),
      sourceTypes: CUSTOMIZATION_MIGRATION_CATEGORIES.map((category) => [category.id, [...category.sourceTypes]])
    }, {
      promptFiles: [
        "/workspace/.github/prompts/review.prompt.md",
        "/user-data/prompts/release.prompt.md"
      ],
      userData: [
        "/user-data/prompts/reviewer.agent.md",
        "/user-data/prompts/style.instructions.md"
      ],
      sourceTypes: [
        [CustomizationMigrationCategoryId.PromptFiles, [PromptsType.prompt]],
        [CustomizationMigrationCategoryId.UserData, [PromptsType.agent, PromptsType.instructions]]
      ]
    });
  });
  test("uses singular copy for one User Data customization", () => {
    const category = getCustomizationMigrationCategory(CustomizationMigrationCategoryId.UserData);
    const harnessLabel = "Copilot [Agent Host]";
    const agent = {
      uri: URI.file("/user-data/prompts/reviewer.agent.md"),
      storage: PromptsStorage.user,
      type: PromptsType.agent,
      source: PromptFileSource.UserData
    };
    const instruction = {
      uri: URI.file("/user-data/prompts/style.instructions.md"),
      storage: PromptsStorage.user,
      type: PromptsType.instructions,
      source: PromptFileSource.UserData
    };
    assert.deepStrictEqual({
      shortcut: category.getShortcutAriaLabel(1),
      agent: {
        card: category.getCardDescription([agent], harnessLabel),
        page: category.getPageDescription([agent], harnessLabel),
        confirmation: category.getConfirmation([agent], harnessLabel).detail
      },
      instruction: {
        card: category.getCardDescription([instruction], harnessLabel),
        page: category.getPageDescription([instruction], harnessLabel),
        confirmation: category.getConfirmation([instruction], harnessLabel).detail
      },
      mixed: {
        card: category.getCardDescription([agent, instruction], harnessLabel),
        confirmation: category.getConfirmation([agent, instruction], harnessLabel).detail
      },
      migrated: category.getMigratedMessage(1),
      failed: category.getFailedMessage(["reviewer.agent.md"], 0)
    }, {
      shortcut: "User data, 1 customization needs migration",
      agent: {
        card: "User data customizations are only used by VS Code. Found 1 agent that Copilot [Agent Host] ignores. Move it to keep it available.",
        page: "Found 1 agent in user data that local VS Code can still use, but Copilot [Agent Host] ignores. Move it to the harness agents folder to keep it available.",
        confirmation: "This moves 1 agent out of user data."
      },
      instruction: {
        card: "User data customizations are only used by VS Code. Found 1 instruction file that Copilot [Agent Host] ignores. Move it to keep it available.",
        page: "Found 1 instruction file in user data that local VS Code can still use, but Copilot [Agent Host] ignores. Move it to the harness instructions folder to keep it available.",
        confirmation: "This moves 1 instruction file out of user data."
      },
      mixed: {
        card: "User data customizations are only used by VS Code. Found 2 customizations that Copilot [Agent Host] ignores. Move them to keep them available.",
        confirmation: "This moves 2 customizations out of user data."
      },
      migrated: "Migrated 1 user data customization.",
      failed: "Failed to migrate 1 user data customization: reviewer.agent.md."
    });
  });
  test("migrates prompt headers into a skill file", () => {
    const promptFile = {
      uri: URI.file("/workspace/.github/prompts/review.prompt.md"),
      name: "Review Prompt",
      description: "Review the active change",
      storage: PromptsStorage.local,
      type: PromptsType.prompt,
      source: PromptFileSource.GitHubWorkspace
    };
    const content = [
      "---",
      'name: "Review Prompt"',
      'description: "Review the active change"',
      'argument-hint: "[diff]"',
      "tools: [read_file, edit_file]",
      "mode: code",
      "---",
      "## Steps",
      "",
      "- Review the diff"
    ].join("\n");
    const migrated = migratePromptFileToSkill(promptFile, content);
    assert.strictEqual(migrated.skillName, "review-prompt");
    assert.deepStrictEqual(migrated.unsupportedHeaderKeys, ["tools", "mode"]);
    assert.ok(migrated.content.includes("name: review-prompt"));
    assert.ok(migrated.content.includes("description: Review the active change"));
    assert.ok(migrated.content.includes("disable-model-invocation: true"));
    assert.ok(migrated.content.includes('argument-hint: "[diff]"'));
    assert.ok(!migrated.content.includes("tools: [read_file, edit_file]"));
    assert.ok(migrated.content.includes("## Steps"));
  });
  test("preserves argument-hint formatting from source prompt", () => {
    const promptFile = {
      uri: URI.file("/workspace/.github/prompts/review.prompt.md"),
      name: "Review Prompt",
      storage: PromptsStorage.local,
      type: PromptsType.prompt,
      source: PromptFileSource.GitHubWorkspace
    };
    const content = [
      "---",
      "name: Review Prompt",
      "description: Review the active change",
      "argument-hint: diff",
      "---",
      "Review body"
    ].join("\n");
    const migrated = migratePromptFileToSkill(promptFile, content);
    assert.ok(migrated.content.includes("argument-hint: diff"));
  });
  test("migrates mixed customizations and continues after per-file failures", async () => {
    const customizations = [
      {
        uri: URI.file("/workspace/.github/prompts/review.prompt.md"),
        name: "Review Prompt",
        storage: PromptsStorage.local,
        type: PromptsType.prompt,
        source: PromptFileSource.GitHubWorkspace
      },
      {
        uri: URI.file("/home/test/.vscode/prompts/planner.agent.md"),
        name: "Planner",
        storage: PromptsStorage.user,
        type: PromptsType.agent,
        source: PromptFileSource.UserData
      },
      {
        uri: URI.file("/home/test/.vscode/prompts/style.instructions.md"),
        name: "Style",
        storage: PromptsStorage.user,
        type: PromptsType.instructions,
        source: PromptFileSource.UserData
      },
      {
        uri: URI.file("/home/test/.vscode/prompts/failing.prompt.md"),
        name: "Failing Prompt",
        storage: PromptsStorage.user,
        type: PromptsType.prompt,
        source: PromptFileSource.UserData
      }
    ];
    const workspaceSkillRoot = { uri: URI.file("/workspace/.github/skills"), label: ".github/skills", source: PromptsStorage.local };
    const userSkillRoot = { uri: URI.file("/home/test/.copilot/skills"), label: "~/.copilot/skills", source: PromptsStorage.user };
    const userAgentRoot = { uri: URI.file("/home/test/.copilot/agents"), label: "~/.copilot/agents", source: PromptsStorage.user };
    const userInstructionsRoot = { uri: URI.file("/home/test/.copilot/instructions"), label: "~/.copilot/instructions", source: PromptsStorage.user };
    const targetFolders = /* @__PURE__ */ new Map([
      [PromptsType.skill, /* @__PURE__ */ new Map([[PromptsStorage.local, workspaceSkillRoot], [PromptsStorage.user, userSkillRoot]])],
      [PromptsType.agent, /* @__PURE__ */ new Map([[PromptsStorage.user, userAgentRoot]])],
      [PromptsType.instructions, /* @__PURE__ */ new Map([[PromptsStorage.user, userInstructionsRoot]])]
    ]);
    const fileService = store.add(new FileService(new NullLogService()));
    const fileSystemProvider = store.add(new InMemoryFileSystemProvider());
    store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
    await fileService.writeFile(customizations[0].uri, VSBuffer.fromString(["---", 'name: "Review Prompt"', "mode: code", "---", "Review body"].join("\n")));
    await fileService.writeFile(customizations[1].uri, VSBuffer.fromString("---\ndescription: Plan work\n---\nPlan."));
    await fileService.writeFile(customizations[2].uri, VSBuffer.fromString("---\ndescription: Use tabs\n---\nUse tabs."));
    await fileService.writeFile(URI.joinPath(userAgentRoot.uri, "planner.agent.md"), VSBuffer.fromString("existing"));
    const migrationErrors = [];
    const result = await migrateCustomizations(customizations, targetFolders, fileService, (error) => migrationErrors.push(error));
    const migratedSkillUri = createSkillFileUri(workspaceSkillRoot.uri, "review-prompt");
    const migratedAgentUri = URI.joinPath(userAgentRoot.uri, "planner-2.agent.md");
    const migratedInstructionsUri = URI.joinPath(userInstructionsRoot.uri, "style.instructions.md");
    const migratedSkillContent = (await fileService.readFile(migratedSkillUri)).value.toString();
    assert.deepStrictEqual({
      result: {
        ...result,
        migratedCustomizations: result.migratedCustomizations.map((customization) => ({ uri: customization.uri.path, type: customization.type }))
      },
      migratedSkillHasManualInvocation: migratedSkillContent.includes("disable-model-invocation: true"),
      migratedAgentContent: (await fileService.readFile(migratedAgentUri)).value.toString(),
      migratedInstructionsContent: (await fileService.readFile(migratedInstructionsUri)).value.toString(),
      originalsExist: await Promise.all(customizations.slice(0, 3).map((customization) => fileService.exists(customization.uri))),
      migrationErrorCount: migrationErrors.length
    }, {
      result: {
        migratedCount: 3,
        failedCustomizationFileNames: ["failing.prompt.md"],
        unsupportedHeaderKeys: ["mode"],
        migratedCustomizations: [
          { uri: migratedSkillUri.path, type: PromptsType.skill },
          { uri: migratedAgentUri.path, type: PromptsType.agent },
          { uri: migratedInstructionsUri.path, type: PromptsType.instructions }
        ]
      },
      migratedSkillHasManualInvocation: true,
      migratedAgentContent: "---\ndescription: Plan work\n---\nPlan.",
      migratedInstructionsContent: "---\ndescription: Use tabs\n---\nUse tabs.",
      originalsExist: [false, false, false],
      migrationErrorCount: 1
    });
  });
  test("migrates duplicate source identities before deleting the source", async () => {
    const sourceUri = URI.file("/home/test/shared.prompt.md");
    const customizations = [
      { uri: sourceUri, name: "Shared", storage: PromptsStorage.local, type: PromptsType.prompt, source: PromptFileSource.ConfigWorkspace },
      { uri: sourceUri, name: "Shared", storage: PromptsStorage.user, type: PromptsType.prompt, source: PromptFileSource.ConfigPersonal }
    ];
    const workspaceSkillRoot = { uri: URI.file("/workspace/.github/skills"), label: ".github/skills", source: PromptsStorage.local };
    const userSkillRoot = { uri: URI.file("/home/test/.copilot/skills"), label: "~/.copilot/skills", source: PromptsStorage.user };
    const targetFolders = /* @__PURE__ */ new Map([
      [PromptsType.skill, /* @__PURE__ */ new Map([[PromptsStorage.local, workspaceSkillRoot], [PromptsStorage.user, userSkillRoot]])]
    ]);
    const fileService = store.add(new FileService(new NullLogService()));
    const fileSystemProvider = store.add(new InMemoryFileSystemProvider());
    store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
    await fileService.writeFile(sourceUri, VSBuffer.fromString("---\nname: Shared\n---\nShared body"));
    const result = await migrateCustomizations(customizations, targetFolders, fileService);
    const workspaceSkillUri = createSkillFileUri(workspaceSkillRoot.uri, "shared");
    const userSkillUri = createSkillFileUri(userSkillRoot.uri, "shared");
    assert.deepStrictEqual({
      result: {
        ...result,
        migratedCustomizations: result.migratedCustomizations.map((customization) => ({ uri: customization.uri.path, type: customization.type }))
      },
      sourceExists: await fileService.exists(sourceUri),
      workspaceTargetExists: await fileService.exists(workspaceSkillUri),
      userTargetExists: await fileService.exists(userSkillUri)
    }, {
      result: {
        migratedCount: 2,
        failedCustomizationFileNames: [],
        unsupportedHeaderKeys: [],
        migratedCustomizations: [
          { uri: workspaceSkillUri.path, type: PromptsType.skill },
          { uri: userSkillUri.path, type: PromptsType.skill }
        ]
      },
      sourceExists: false,
      workspaceTargetExists: true,
      userTargetExists: true
    });
  });
  test("rolls back the target when deleting the source fails", async () => {
    const sourceUri = URI.file("/user-data/style.instructions.md");
    const customization = {
      uri: sourceUri,
      name: "Style",
      storage: PromptsStorage.user,
      type: PromptsType.instructions,
      source: PromptFileSource.UserData
    };
    const instructionsRoot = { uri: URI.file("/home/test/.copilot/instructions"), label: "~/.copilot/instructions", source: PromptsStorage.user };
    const targetFolders = /* @__PURE__ */ new Map([
      [PromptsType.instructions, /* @__PURE__ */ new Map([[PromptsStorage.user, instructionsRoot]])]
    ]);
    const fileService = store.add(new FileService(new NullLogService()));
    const fileSystemProvider = store.add(new DeleteFailingFileSystemProvider());
    store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
    await fileService.writeFile(sourceUri, VSBuffer.fromString("Use tabs."));
    fileSystemProvider.deleteFailureResource = sourceUri;
    const migrationErrors = [];
    const failedResult = await migrateCustomizations([customization], targetFolders, fileService, (error) => migrationErrors.push(error));
    const targetUri = URI.joinPath(instructionsRoot.uri, "style.instructions.md");
    const afterFailure = {
      sourceExists: await fileService.exists(sourceUri),
      targetExists: await fileService.exists(targetUri),
      migrationErrorCount: migrationErrors.length
    };
    fileSystemProvider.deleteFailureResource = void 0;
    const retriedResult = await migrateCustomizations([customization], targetFolders, fileService);
    assert.deepStrictEqual({
      failedResult,
      afterFailure,
      retriedResult: {
        ...retriedResult,
        migratedCustomizations: retriedResult.migratedCustomizations.map((item) => item.uri.path)
      },
      afterRetry: {
        sourceExists: await fileService.exists(sourceUri),
        targetExists: await fileService.exists(targetUri),
        suffixedTargetExists: await fileService.exists(URI.joinPath(instructionsRoot.uri, "style-2.instructions.md"))
      }
    }, {
      failedResult: {
        migratedCount: 0,
        failedCustomizationFileNames: ["style.instructions.md"],
        unsupportedHeaderKeys: [],
        migratedCustomizations: []
      },
      afterFailure: {
        sourceExists: true,
        targetExists: false,
        migrationErrorCount: 1
      },
      retriedResult: {
        migratedCount: 1,
        failedCustomizationFileNames: [],
        unsupportedHeaderKeys: [],
        migratedCustomizations: [targetUri.path]
      },
      afterRetry: {
        sourceExists: false,
        targetExists: true,
        suffixedTargetExists: false
      }
    });
  });
  test("does not overwrite or roll back a concurrently created target", async () => {
    const sourceUri = URI.file("/user-data/style.instructions.md");
    const customization = {
      uri: sourceUri,
      name: "Style",
      storage: PromptsStorage.user,
      type: PromptsType.instructions,
      source: PromptFileSource.UserData
    };
    const instructionsRoot = { uri: URI.file("/home/test/.copilot/instructions"), label: "~/.copilot/instructions", source: PromptsStorage.user };
    const targetFolders = /* @__PURE__ */ new Map([
      [PromptsType.instructions, /* @__PURE__ */ new Map([[PromptsStorage.user, instructionsRoot]])]
    ]);
    const fileService = store.add(new FileService(new NullLogService()));
    const fileSystemProvider = store.add(new ConcurrentTargetFileSystemProvider());
    store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
    await fileService.writeFile(sourceUri, VSBuffer.fromString("Use tabs."));
    const targetUri = URI.joinPath(instructionsRoot.uri, "style.instructions.md");
    fileSystemProvider.conflictResource = targetUri;
    const migrationErrors = [];
    const result = await migrateCustomizations([customization], targetFolders, fileService, (error) => migrationErrors.push(error));
    const targetEntries = await fileSystemProvider.readdir(instructionsRoot.uri);
    assert.deepStrictEqual({
      result,
      sourceExists: await fileService.exists(sourceUri),
      targetContent: (await fileService.readFile(targetUri)).value.toString(),
      targetEntries,
      migrationErrorCount: migrationErrors.length
    }, {
      result: {
        migratedCount: 0,
        failedCustomizationFileNames: ["style.instructions.md"],
        unsupportedHeaderKeys: [],
        migratedCustomizations: []
      },
      sourceExists: true,
      targetContent: "foreign content",
      targetEntries: [["style.instructions.md", FileType.File]],
      migrationErrorCount: 1
    });
  });
  test("can keep original customization files after migration", async () => {
    const customization = {
      uri: URI.file("/home/test/.vscode/prompts/style.instructions.md"),
      name: "Style",
      storage: PromptsStorage.user,
      type: PromptsType.instructions,
      source: PromptFileSource.UserData
    };
    const instructionsRoot = { uri: URI.file("/home/test/.copilot/instructions"), label: "~/.copilot/instructions", source: PromptsStorage.user };
    const fileService = store.add(new FileService(new NullLogService()));
    const fileSystemProvider = store.add(new InMemoryFileSystemProvider());
    store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
    await fileService.writeFile(customization.uri, VSBuffer.fromString("Use tabs."));
    const result = await migrateCustomizations(
      [customization],
      /* @__PURE__ */ new Map([[PromptsType.instructions, /* @__PURE__ */ new Map([[PromptsStorage.user, instructionsRoot]])]]),
      fileService,
      void 0,
      { deleteOriginalFiles: false }
    );
    const migratedUri = URI.joinPath(instructionsRoot.uri, "style.instructions.md");
    assert.deepStrictEqual({
      migratedCount: result.migratedCount,
      migratedUris: result.migratedCustomizations.map((item) => item.uri.path),
      originalExists: await fileService.exists(customization.uri),
      migratedExists: await fileService.exists(migratedUri)
    }, {
      migratedCount: 1,
      migratedUris: [migratedUri.path],
      originalExists: true,
      migratedExists: true
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFpQ3VzdG9taXphdGlvblxcY3VzdG9taXphdGlvbk1pZ3JhdGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBGaWxlVHlwZSwgSUZpbGVEZWxldGVPcHRpb25zLCBJRmlsZVdyaXRlT3B0aW9ucywgY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFByb21wdEZpbGVTb3VyY2UsIFByb21wdHNUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzU3RvcmFnZSwgdHlwZSBJUHJvbXB0UGF0aCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9taXphdGlvblNvdXJjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlU2tpbGxGaWxlVXJpLCBtaWdyYXRlQ3VzdG9taXphdGlvbnMsIG1pZ3JhdGVQcm9tcHRGaWxlVG9Ta2lsbCwgdHlwZSBDdXN0b21pemF0aW9uTWlncmF0aW9uVGFyZ2V0Rm9sZGVycyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2N1c3RvbWl6YXRpb25NaWdyYXRpb24uanMnO1xuaW1wb3J0IHsgQ1VTVE9NSVpBVElPTl9NSUdSQVRJT05fQ0FURUdPUklFUywgQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3J5SWQsIGdldEN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2N1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yaWVzLmpzJztcblxuY2xhc3MgRGVsZXRlRmFpbGluZ0ZpbGVTeXN0ZW1Qcm92aWRlciBleHRlbmRzIEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIHtcblx0ZGVsZXRlRmFpbHVyZVJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cblx0b3ZlcnJpZGUgYXN5bmMgZGVsZXRlKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IElGaWxlRGVsZXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmRlbGV0ZUZhaWx1cmVSZXNvdXJjZSAmJiBpc0VxdWFsKHJlc291cmNlLCB0aGlzLmRlbGV0ZUZhaWx1cmVSZXNvdXJjZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgZGVsZXRlIGZhaWx1cmUnKTtcblx0XHR9XG5cdFx0YXdhaXQgc3VwZXIuZGVsZXRlKHJlc291cmNlLCBvcHRpb25zKTtcblx0fVxufVxuXG5jbGFzcyBDb25jdXJyZW50VGFyZ2V0RmlsZVN5c3RlbVByb3ZpZGVyIGV4dGVuZHMgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIge1xuXHRjb25mbGljdFJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cblx0b3ZlcnJpZGUgYXN5bmMgd3JpdGVGaWxlKHJlc291cmNlOiBVUkksIGNvbnRlbnQ6IFVpbnQ4QXJyYXksIG9wdGlvbnM6IElGaWxlV3JpdGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuY29uZmxpY3RSZXNvdXJjZSAmJiBpc0VxdWFsKHJlc291cmNlLCB0aGlzLmNvbmZsaWN0UmVzb3VyY2UpKSB7XG5cdFx0XHR0aGlzLmNvbmZsaWN0UmVzb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRhd2FpdCBzdXBlci53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2ZvcmVpZ24gY29udGVudCcpLmJ1ZmZlciwge1xuXHRcdFx0XHRjcmVhdGU6IHRydWUsXG5cdFx0XHRcdG92ZXJ3cml0ZTogdHJ1ZSxcblx0XHRcdFx0dW5sb2NrOiBmYWxzZSxcblx0XHRcdFx0YXRvbWljOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdFx0dGhyb3cgY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IoJ2ZpbGUgZXhpc3RzIGFscmVhZHknLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZUV4aXN0cyk7XG5cdFx0fVxuXHRcdGF3YWl0IHN1cGVyLndyaXRlRmlsZShyZXNvdXJjZSwgY29udGVudCwgb3B0aW9ucyk7XG5cdH1cbn1cblxuc3VpdGUoJ2N1c3RvbWl6YXRpb25NaWdyYXRpb24nLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc3BsaXRzIGNhbmRpZGF0ZXMgaW50byBmb2N1c2VkLCBub24tb3ZlcmxhcHBpbmcgY2F0ZWdvcmllcycsICgpID0+IHtcblx0XHRjb25zdCBjdXN0b21pemF0aW9uczogSVByb21wdFBhdGhbXSA9IFtcblx0XHRcdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL3Byb21wdHMvcmV2aWV3LnByb21wdC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUucHJvbXB0LCBzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuR2l0SHViV29ya3NwYWNlIH0sXG5cdFx0XHR7IHVyaTogVVJJLmZpbGUoJy91c2VyLWRhdGEvcHJvbXB0cy9yZWxlYXNlLnByb21wdC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLCB0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsIHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5Vc2VyRGF0YSB9LFxuXHRcdFx0eyB1cmk6IFVSSS5maWxlKCcvdXNlci1kYXRhL3Byb21wdHMvcmV2aWV3ZXIuYWdlbnQubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlciwgdHlwZTogUHJvbXB0c1R5cGUuYWdlbnQsIHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5Vc2VyRGF0YSB9LFxuXHRcdFx0eyB1cmk6IFVSSS5maWxlKCcvdXNlci1kYXRhL3Byb21wdHMvc3R5bGUuaW5zdHJ1Y3Rpb25zLm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgc291cmNlOiBQcm9tcHRGaWxlU291cmNlLlVzZXJEYXRhIH0sXG5cdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9ob21lL3Rlc3QvLmNvcGlsb3QvYWdlbnRzL3BsYW5uZXIuYWdlbnQubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlciwgdHlwZTogUHJvbXB0c1R5cGUuYWdlbnQsIHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5Db3BpbG90UGVyc29uYWwgfSxcblx0XHRcdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscy9kZXBsb3kvU0tJTEwubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsLCBzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuR2l0SHViV29ya3NwYWNlIH0sXG5cdFx0XTtcblx0XHRjb25zdCBjYW5kaWRhdGVzRm9yID0gKGlkOiBDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnlJZCkgPT4gY3VzdG9taXphdGlvbnNcblx0XHRcdC5maWx0ZXIoY3VzdG9taXphdGlvbiA9PiBnZXRDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnkoaWQpLmlzQ2FuZGlkYXRlKGN1c3RvbWl6YXRpb24pKVxuXHRcdFx0Lm1hcChjdXN0b21pemF0aW9uID0+IGN1c3RvbWl6YXRpb24udXJpLnBhdGgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwcm9tcHRGaWxlczogY2FuZGlkYXRlc0ZvcihDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnlJZC5Qcm9tcHRGaWxlcyksXG5cdFx0XHR1c2VyRGF0YTogY2FuZGlkYXRlc0ZvcihDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnlJZC5Vc2VyRGF0YSksXG5cdFx0XHRzb3VyY2VUeXBlczogQ1VTVE9NSVpBVElPTl9NSUdSQVRJT05fQ0FURUdPUklFUy5tYXAoY2F0ZWdvcnkgPT4gW2NhdGVnb3J5LmlkLCBbLi4uY2F0ZWdvcnkuc291cmNlVHlwZXNdXSksXG5cdFx0fSwge1xuXHRcdFx0cHJvbXB0RmlsZXM6IFtcblx0XHRcdFx0Jy93b3Jrc3BhY2UvLmdpdGh1Yi9wcm9tcHRzL3Jldmlldy5wcm9tcHQubWQnLFxuXHRcdFx0XHQnL3VzZXItZGF0YS9wcm9tcHRzL3JlbGVhc2UucHJvbXB0Lm1kJyxcblx0XHRcdF0sXG5cdFx0XHR1c2VyRGF0YTogW1xuXHRcdFx0XHQnL3VzZXItZGF0YS9wcm9tcHRzL3Jldmlld2VyLmFnZW50Lm1kJyxcblx0XHRcdFx0Jy91c2VyLWRhdGEvcHJvbXB0cy9zdHlsZS5pbnN0cnVjdGlvbnMubWQnLFxuXHRcdFx0XSxcblx0XHRcdHNvdXJjZVR5cGVzOiBbXG5cdFx0XHRcdFtDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnlJZC5Qcm9tcHRGaWxlcywgW1Byb21wdHNUeXBlLnByb21wdF1dLFxuXHRcdFx0XHRbQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3J5SWQuVXNlckRhdGEsIFtQcm9tcHRzVHlwZS5hZ2VudCwgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zXV0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXG5cdHRlc3QoJ3VzZXMgc2luZ3VsYXIgY29weSBmb3Igb25lIFVzZXIgRGF0YSBjdXN0b21pemF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNhdGVnb3J5ID0gZ2V0Q3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3J5KEN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeUlkLlVzZXJEYXRhKTtcblx0XHRjb25zdCBoYXJuZXNzTGFiZWwgPSAnQ29waWxvdCBbQWdlbnQgSG9zdF0nO1xuXHRcdGNvbnN0IGFnZW50OiBJUHJvbXB0UGF0aCA9IHtcblx0XHRcdHVyaTogVVJJLmZpbGUoJy91c2VyLWRhdGEvcHJvbXB0cy9yZXZpZXdlci5hZ2VudC5tZCcpLFxuXHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlcixcblx0XHRcdHR5cGU6IFByb21wdHNUeXBlLmFnZW50LFxuXHRcdFx0c291cmNlOiBQcm9tcHRGaWxlU291cmNlLlVzZXJEYXRhLFxuXHRcdH07XG5cdFx0Y29uc3QgaW5zdHJ1Y3Rpb246IElQcm9tcHRQYXRoID0ge1xuXHRcdFx0dXJpOiBVUkkuZmlsZSgnL3VzZXItZGF0YS9wcm9tcHRzL3N0eWxlLmluc3RydWN0aW9ucy5tZCcpLFxuXHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlcixcblx0XHRcdHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyxcblx0XHRcdHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5Vc2VyRGF0YSxcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzaG9ydGN1dDogY2F0ZWdvcnkuZ2V0U2hvcnRjdXRBcmlhTGFiZWwoMSksXG5cdFx0XHRhZ2VudDoge1xuXHRcdFx0XHRjYXJkOiBjYXRlZ29yeS5nZXRDYXJkRGVzY3JpcHRpb24oW2FnZW50XSwgaGFybmVzc0xhYmVsKSxcblx0XHRcdFx0cGFnZTogY2F0ZWdvcnkuZ2V0UGFnZURlc2NyaXB0aW9uKFthZ2VudF0sIGhhcm5lc3NMYWJlbCksXG5cdFx0XHRcdGNvbmZpcm1hdGlvbjogY2F0ZWdvcnkuZ2V0Q29uZmlybWF0aW9uKFthZ2VudF0sIGhhcm5lc3NMYWJlbCkuZGV0YWlsLFxuXHRcdFx0fSxcblx0XHRcdGluc3RydWN0aW9uOiB7XG5cdFx0XHRcdGNhcmQ6IGNhdGVnb3J5LmdldENhcmREZXNjcmlwdGlvbihbaW5zdHJ1Y3Rpb25dLCBoYXJuZXNzTGFiZWwpLFxuXHRcdFx0XHRwYWdlOiBjYXRlZ29yeS5nZXRQYWdlRGVzY3JpcHRpb24oW2luc3RydWN0aW9uXSwgaGFybmVzc0xhYmVsKSxcblx0XHRcdFx0Y29uZmlybWF0aW9uOiBjYXRlZ29yeS5nZXRDb25maXJtYXRpb24oW2luc3RydWN0aW9uXSwgaGFybmVzc0xhYmVsKS5kZXRhaWwsXG5cdFx0XHR9LFxuXHRcdFx0bWl4ZWQ6IHtcblx0XHRcdFx0Y2FyZDogY2F0ZWdvcnkuZ2V0Q2FyZERlc2NyaXB0aW9uKFthZ2VudCwgaW5zdHJ1Y3Rpb25dLCBoYXJuZXNzTGFiZWwpLFxuXHRcdFx0XHRjb25maXJtYXRpb246IGNhdGVnb3J5LmdldENvbmZpcm1hdGlvbihbYWdlbnQsIGluc3RydWN0aW9uXSwgaGFybmVzc0xhYmVsKS5kZXRhaWwsXG5cdFx0XHR9LFxuXHRcdFx0bWlncmF0ZWQ6IGNhdGVnb3J5LmdldE1pZ3JhdGVkTWVzc2FnZSgxKSxcblx0XHRcdGZhaWxlZDogY2F0ZWdvcnkuZ2V0RmFpbGVkTWVzc2FnZShbJ3Jldmlld2VyLmFnZW50Lm1kJ10sIDApLFxuXHRcdH0sIHtcblx0XHRcdHNob3J0Y3V0OiAnVXNlciBkYXRhLCAxIGN1c3RvbWl6YXRpb24gbmVlZHMgbWlncmF0aW9uJyxcblx0XHRcdGFnZW50OiB7XG5cdFx0XHRcdGNhcmQ6ICdVc2VyIGRhdGEgY3VzdG9taXphdGlvbnMgYXJlIG9ubHkgdXNlZCBieSBWUyBDb2RlLiBGb3VuZCAxIGFnZW50IHRoYXQgQ29waWxvdCBbQWdlbnQgSG9zdF0gaWdub3Jlcy4gTW92ZSBpdCB0byBrZWVwIGl0IGF2YWlsYWJsZS4nLFxuXHRcdFx0XHRwYWdlOiAnRm91bmQgMSBhZ2VudCBpbiB1c2VyIGRhdGEgdGhhdCBsb2NhbCBWUyBDb2RlIGNhbiBzdGlsbCB1c2UsIGJ1dCBDb3BpbG90IFtBZ2VudCBIb3N0XSBpZ25vcmVzLiBNb3ZlIGl0IHRvIHRoZSBoYXJuZXNzIGFnZW50cyBmb2xkZXIgdG8ga2VlcCBpdCBhdmFpbGFibGUuJyxcblx0XHRcdFx0Y29uZmlybWF0aW9uOiAnVGhpcyBtb3ZlcyAxIGFnZW50IG91dCBvZiB1c2VyIGRhdGEuJyxcblx0XHRcdH0sXG5cdFx0XHRpbnN0cnVjdGlvbjoge1xuXHRcdFx0XHRjYXJkOiAnVXNlciBkYXRhIGN1c3RvbWl6YXRpb25zIGFyZSBvbmx5IHVzZWQgYnkgVlMgQ29kZS4gRm91bmQgMSBpbnN0cnVjdGlvbiBmaWxlIHRoYXQgQ29waWxvdCBbQWdlbnQgSG9zdF0gaWdub3Jlcy4gTW92ZSBpdCB0byBrZWVwIGl0IGF2YWlsYWJsZS4nLFxuXHRcdFx0XHRwYWdlOiAnRm91bmQgMSBpbnN0cnVjdGlvbiBmaWxlIGluIHVzZXIgZGF0YSB0aGF0IGxvY2FsIFZTIENvZGUgY2FuIHN0aWxsIHVzZSwgYnV0IENvcGlsb3QgW0FnZW50IEhvc3RdIGlnbm9yZXMuIE1vdmUgaXQgdG8gdGhlIGhhcm5lc3MgaW5zdHJ1Y3Rpb25zIGZvbGRlciB0byBrZWVwIGl0IGF2YWlsYWJsZS4nLFxuXHRcdFx0XHRjb25maXJtYXRpb246ICdUaGlzIG1vdmVzIDEgaW5zdHJ1Y3Rpb24gZmlsZSBvdXQgb2YgdXNlciBkYXRhLicsXG5cdFx0XHR9LFxuXHRcdFx0bWl4ZWQ6IHtcblx0XHRcdFx0Y2FyZDogJ1VzZXIgZGF0YSBjdXN0b21pemF0aW9ucyBhcmUgb25seSB1c2VkIGJ5IFZTIENvZGUuIEZvdW5kIDIgY3VzdG9taXphdGlvbnMgdGhhdCBDb3BpbG90IFtBZ2VudCBIb3N0XSBpZ25vcmVzLiBNb3ZlIHRoZW0gdG8ga2VlcCB0aGVtIGF2YWlsYWJsZS4nLFxuXHRcdFx0XHRjb25maXJtYXRpb246ICdUaGlzIG1vdmVzIDIgY3VzdG9taXphdGlvbnMgb3V0IG9mIHVzZXIgZGF0YS4nLFxuXHRcdFx0fSxcblx0XHRcdG1pZ3JhdGVkOiAnTWlncmF0ZWQgMSB1c2VyIGRhdGEgY3VzdG9taXphdGlvbi4nLFxuXHRcdFx0ZmFpbGVkOiAnRmFpbGVkIHRvIG1pZ3JhdGUgMSB1c2VyIGRhdGEgY3VzdG9taXphdGlvbjogcmV2aWV3ZXIuYWdlbnQubWQuJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbWlncmF0ZXMgcHJvbXB0IGhlYWRlcnMgaW50byBhIHNraWxsIGZpbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvbXB0RmlsZTogSVByb21wdFBhdGggPSB7XG5cdFx0XHR1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvcHJvbXB0cy9yZXZpZXcucHJvbXB0Lm1kJyksXG5cdFx0XHRuYW1lOiAnUmV2aWV3IFByb21wdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ1JldmlldyB0aGUgYWN0aXZlIGNoYW5nZScsXG5cdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCxcblx0XHRcdHR5cGU6IFByb21wdHNUeXBlLnByb21wdCxcblx0XHRcdHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5HaXRIdWJXb3Jrc3BhY2UsXG5cdFx0fTtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0Jy0tLScsXG5cdFx0XHQnbmFtZTogXCJSZXZpZXcgUHJvbXB0XCInLFxuXHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlJldmlldyB0aGUgYWN0aXZlIGNoYW5nZVwiJyxcblx0XHRcdCdhcmd1bWVudC1oaW50OiBcIltkaWZmXVwiJyxcblx0XHRcdCd0b29sczogW3JlYWRfZmlsZSwgZWRpdF9maWxlXScsXG5cdFx0XHQnbW9kZTogY29kZScsXG5cdFx0XHQnLS0tJyxcblx0XHRcdCcjIyBTdGVwcycsXG5cdFx0XHQnJyxcblx0XHRcdCctIFJldmlldyB0aGUgZGlmZicsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IG1pZ3JhdGVkID0gbWlncmF0ZVByb21wdEZpbGVUb1NraWxsKHByb21wdEZpbGUsIGNvbnRlbnQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pZ3JhdGVkLnNraWxsTmFtZSwgJ3Jldmlldy1wcm9tcHQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1pZ3JhdGVkLnVuc3VwcG9ydGVkSGVhZGVyS2V5cywgWyd0b29scycsICdtb2RlJ10pO1xuXHRcdGFzc2VydC5vayhtaWdyYXRlZC5jb250ZW50LmluY2x1ZGVzKCduYW1lOiByZXZpZXctcHJvbXB0JykpO1xuXHRcdGFzc2VydC5vayhtaWdyYXRlZC5jb250ZW50LmluY2x1ZGVzKCdkZXNjcmlwdGlvbjogUmV2aWV3IHRoZSBhY3RpdmUgY2hhbmdlJykpO1xuXHRcdGFzc2VydC5vayhtaWdyYXRlZC5jb250ZW50LmluY2x1ZGVzKCdkaXNhYmxlLW1vZGVsLWludm9jYXRpb246IHRydWUnKSk7XG5cdFx0YXNzZXJ0Lm9rKG1pZ3JhdGVkLmNvbnRlbnQuaW5jbHVkZXMoJ2FyZ3VtZW50LWhpbnQ6IFwiW2RpZmZdXCInKSk7XG5cdFx0YXNzZXJ0Lm9rKCFtaWdyYXRlZC5jb250ZW50LmluY2x1ZGVzKCd0b29sczogW3JlYWRfZmlsZSwgZWRpdF9maWxlXScpKTtcblx0XHRhc3NlcnQub2sobWlncmF0ZWQuY29udGVudC5pbmNsdWRlcygnIyMgU3RlcHMnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBhcmd1bWVudC1oaW50IGZvcm1hdHRpbmcgZnJvbSBzb3VyY2UgcHJvbXB0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb21wdEZpbGU6IElQcm9tcHRQYXRoID0ge1xuXHRcdFx0dXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL3Byb21wdHMvcmV2aWV3LnByb21wdC5tZCcpLFxuXHRcdFx0bmFtZTogJ1JldmlldyBQcm9tcHQnLFxuXHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsXG5cdFx0XHRzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuR2l0SHViV29ya3NwYWNlLFxuXHRcdH07XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCctLS0nLFxuXHRcdFx0J25hbWU6IFJldmlldyBQcm9tcHQnLFxuXHRcdFx0J2Rlc2NyaXB0aW9uOiBSZXZpZXcgdGhlIGFjdGl2ZSBjaGFuZ2UnLFxuXHRcdFx0J2FyZ3VtZW50LWhpbnQ6IGRpZmYnLFxuXHRcdFx0Jy0tLScsXG5cdFx0XHQnUmV2aWV3IGJvZHknLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCBtaWdyYXRlZCA9IG1pZ3JhdGVQcm9tcHRGaWxlVG9Ta2lsbChwcm9tcHRGaWxlLCBjb250ZW50KTtcblx0XHRhc3NlcnQub2sobWlncmF0ZWQuY29udGVudC5pbmNsdWRlcygnYXJndW1lbnQtaGludDogZGlmZicpKTtcblx0fSk7XG5cblx0dGVzdCgnbWlncmF0ZXMgbWl4ZWQgY3VzdG9taXphdGlvbnMgYW5kIGNvbnRpbnVlcyBhZnRlciBwZXItZmlsZSBmYWlsdXJlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjdXN0b21pemF0aW9uczogSVByb21wdFBhdGhbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL3Byb21wdHMvcmV2aWV3LnByb21wdC5tZCcpLFxuXHRcdFx0XHRuYW1lOiAnUmV2aWV3IFByb21wdCcsXG5cdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLFxuXHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsXG5cdFx0XHRcdHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5HaXRIdWJXb3Jrc3BhY2UsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvaG9tZS90ZXN0Ly52c2NvZGUvcHJvbXB0cy9wbGFubmVyLmFnZW50Lm1kJyksXG5cdFx0XHRcdG5hbWU6ICdQbGFubmVyJyxcblx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlcixcblx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuYWdlbnQsXG5cdFx0XHRcdHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5Vc2VyRGF0YSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9ob21lL3Rlc3QvLnZzY29kZS9wcm9tcHRzL3N0eWxlLmluc3RydWN0aW9ucy5tZCcpLFxuXHRcdFx0XHRuYW1lOiAnU3R5bGUnLFxuXHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLFxuXHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsXG5cdFx0XHRcdHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5Vc2VyRGF0YSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9ob21lL3Rlc3QvLnZzY29kZS9wcm9tcHRzL2ZhaWxpbmcucHJvbXB0Lm1kJyksXG5cdFx0XHRcdG5hbWU6ICdGYWlsaW5nIFByb21wdCcsXG5cdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsXG5cdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLnByb21wdCxcblx0XHRcdFx0c291cmNlOiBQcm9tcHRGaWxlU291cmNlLlVzZXJEYXRhLFxuXHRcdFx0fSxcblx0XHRdO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVNraWxsUm9vdDogSUN1c3RvbWl6YXRpb25Tb3VyY2VGb2xkZXIgPSB7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMnKSwgbGFiZWw6ICcuZ2l0aHViL3NraWxscycsIHNvdXJjZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfTtcblx0XHRjb25zdCB1c2VyU2tpbGxSb290OiBJQ3VzdG9taXphdGlvblNvdXJjZUZvbGRlciA9IHsgdXJpOiBVUkkuZmlsZSgnL2hvbWUvdGVzdC8uY29waWxvdC9za2lsbHMnKSwgbGFiZWw6ICd+Ly5jb3BpbG90L3NraWxscycsIHNvdXJjZTogUHJvbXB0c1N0b3JhZ2UudXNlciB9O1xuXHRcdGNvbnN0IHVzZXJBZ2VudFJvb3Q6IElDdXN0b21pemF0aW9uU291cmNlRm9sZGVyID0geyB1cmk6IFVSSS5maWxlKCcvaG9tZS90ZXN0Ly5jb3BpbG90L2FnZW50cycpLCBsYWJlbDogJ34vLmNvcGlsb3QvYWdlbnRzJywgc291cmNlOiBQcm9tcHRzU3RvcmFnZS51c2VyIH07XG5cdFx0Y29uc3QgdXNlckluc3RydWN0aW9uc1Jvb3Q6IElDdXN0b21pemF0aW9uU291cmNlRm9sZGVyID0geyB1cmk6IFVSSS5maWxlKCcvaG9tZS90ZXN0Ly5jb3BpbG90L2luc3RydWN0aW9ucycpLCBsYWJlbDogJ34vLmNvcGlsb3QvaW5zdHJ1Y3Rpb25zJywgc291cmNlOiBQcm9tcHRzU3RvcmFnZS51c2VyIH07XG5cdFx0Y29uc3QgdGFyZ2V0Rm9sZGVyczogQ3VzdG9taXphdGlvbk1pZ3JhdGlvblRhcmdldEZvbGRlcnMgPSBuZXcgTWFwKFtcblx0XHRcdFtQcm9tcHRzVHlwZS5za2lsbCwgbmV3IE1hcChbW1Byb21wdHNTdG9yYWdlLmxvY2FsLCB3b3Jrc3BhY2VTa2lsbFJvb3RdLCBbUHJvbXB0c1N0b3JhZ2UudXNlciwgdXNlclNraWxsUm9vdF1dKV0sXG5cdFx0XHRbUHJvbXB0c1R5cGUuYWdlbnQsIG5ldyBNYXAoW1tQcm9tcHRzU3RvcmFnZS51c2VyLCB1c2VyQWdlbnRSb290XV0pXSxcblx0XHRcdFtQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIG5ldyBNYXAoW1tQcm9tcHRzU3RvcmFnZS51c2VyLCB1c2VySW5zdHJ1Y3Rpb25zUm9vdF1dKV0sXG5cdFx0XSk7XG5cblx0XHRjb25zdCBmaWxlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBmaWxlU3lzdGVtUHJvdmlkZXIgPSBzdG9yZS5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdHN0b3JlLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuZmlsZSwgZmlsZVN5c3RlbVByb3ZpZGVyKSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGN1c3RvbWl6YXRpb25zWzBdLnVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhbJy0tLScsICduYW1lOiBcIlJldmlldyBQcm9tcHRcIicsICdtb2RlOiBjb2RlJywgJy0tLScsICdSZXZpZXcgYm9keSddLmpvaW4oJ1xcbicpKSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGN1c3RvbWl6YXRpb25zWzFdLnVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygnLS0tXFxuZGVzY3JpcHRpb246IFBsYW4gd29ya1xcbi0tLVxcblBsYW4uJykpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShjdXN0b21pemF0aW9uc1syXS51cmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJy0tLVxcbmRlc2NyaXB0aW9uOiBVc2UgdGFic1xcbi0tLVxcblVzZSB0YWJzLicpKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoVVJJLmpvaW5QYXRoKHVzZXJBZ2VudFJvb3QudXJpLCAncGxhbm5lci5hZ2VudC5tZCcpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdleGlzdGluZycpKTtcblxuXHRcdGNvbnN0IG1pZ3JhdGlvbkVycm9yczogRXJyb3JbXSA9IFtdO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1pZ3JhdGVDdXN0b21pemF0aW9ucyhjdXN0b21pemF0aW9ucywgdGFyZ2V0Rm9sZGVycywgZmlsZVNlcnZpY2UsIGVycm9yID0+IG1pZ3JhdGlvbkVycm9ycy5wdXNoKGVycm9yKSk7XG5cdFx0Y29uc3QgbWlncmF0ZWRTa2lsbFVyaSA9IGNyZWF0ZVNraWxsRmlsZVVyaSh3b3Jrc3BhY2VTa2lsbFJvb3QudXJpLCAncmV2aWV3LXByb21wdCcpO1xuXHRcdGNvbnN0IG1pZ3JhdGVkQWdlbnRVcmkgPSBVUkkuam9pblBhdGgodXNlckFnZW50Um9vdC51cmksICdwbGFubmVyLTIuYWdlbnQubWQnKTtcblx0XHRjb25zdCBtaWdyYXRlZEluc3RydWN0aW9uc1VyaSA9IFVSSS5qb2luUGF0aCh1c2VySW5zdHJ1Y3Rpb25zUm9vdC51cmksICdzdHlsZS5pbnN0cnVjdGlvbnMubWQnKTtcblx0XHRjb25zdCBtaWdyYXRlZFNraWxsQ29udGVudCA9IChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShtaWdyYXRlZFNraWxsVXJpKSkudmFsdWUudG9TdHJpbmcoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdC4uLnJlc3VsdCxcblx0XHRcdFx0bWlncmF0ZWRDdXN0b21pemF0aW9uczogcmVzdWx0Lm1pZ3JhdGVkQ3VzdG9taXphdGlvbnMubWFwKGN1c3RvbWl6YXRpb24gPT4gKHsgdXJpOiBjdXN0b21pemF0aW9uLnVyaS5wYXRoLCB0eXBlOiBjdXN0b21pemF0aW9uLnR5cGUgfSkpLFxuXHRcdFx0fSxcblx0XHRcdG1pZ3JhdGVkU2tpbGxIYXNNYW51YWxJbnZvY2F0aW9uOiBtaWdyYXRlZFNraWxsQ29udGVudC5pbmNsdWRlcygnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uOiB0cnVlJyksXG5cdFx0XHRtaWdyYXRlZEFnZW50Q29udGVudDogKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKG1pZ3JhdGVkQWdlbnRVcmkpKS52YWx1ZS50b1N0cmluZygpLFxuXHRcdFx0bWlncmF0ZWRJbnN0cnVjdGlvbnNDb250ZW50OiAoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUobWlncmF0ZWRJbnN0cnVjdGlvbnNVcmkpKS52YWx1ZS50b1N0cmluZygpLFxuXHRcdFx0b3JpZ2luYWxzRXhpc3Q6IGF3YWl0IFByb21pc2UuYWxsKGN1c3RvbWl6YXRpb25zLnNsaWNlKDAsIDMpLm1hcChjdXN0b21pemF0aW9uID0+IGZpbGVTZXJ2aWNlLmV4aXN0cyhjdXN0b21pemF0aW9uLnVyaSkpKSxcblx0XHRcdG1pZ3JhdGlvbkVycm9yQ291bnQ6IG1pZ3JhdGlvbkVycm9ycy5sZW5ndGgsXG5cdFx0fSwge1xuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdG1pZ3JhdGVkQ291bnQ6IDMsXG5cdFx0XHRcdGZhaWxlZEN1c3RvbWl6YXRpb25GaWxlTmFtZXM6IFsnZmFpbGluZy5wcm9tcHQubWQnXSxcblx0XHRcdFx0dW5zdXBwb3J0ZWRIZWFkZXJLZXlzOiBbJ21vZGUnXSxcblx0XHRcdFx0bWlncmF0ZWRDdXN0b21pemF0aW9uczogW1xuXHRcdFx0XHRcdHsgdXJpOiBtaWdyYXRlZFNraWxsVXJpLnBhdGgsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsIH0sXG5cdFx0XHRcdFx0eyB1cmk6IG1pZ3JhdGVkQWdlbnRVcmkucGF0aCwgdHlwZTogUHJvbXB0c1R5cGUuYWdlbnQgfSxcblx0XHRcdFx0XHR7IHVyaTogbWlncmF0ZWRJbnN0cnVjdGlvbnNVcmkucGF0aCwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdFx0bWlncmF0ZWRTa2lsbEhhc01hbnVhbEludm9jYXRpb246IHRydWUsXG5cdFx0XHRtaWdyYXRlZEFnZW50Q29udGVudDogJy0tLVxcbmRlc2NyaXB0aW9uOiBQbGFuIHdvcmtcXG4tLS1cXG5QbGFuLicsXG5cdFx0XHRtaWdyYXRlZEluc3RydWN0aW9uc0NvbnRlbnQ6ICctLS1cXG5kZXNjcmlwdGlvbjogVXNlIHRhYnNcXG4tLS1cXG5Vc2UgdGFicy4nLFxuXHRcdFx0b3JpZ2luYWxzRXhpc3Q6IFtmYWxzZSwgZmFsc2UsIGZhbHNlXSxcblx0XHRcdG1pZ3JhdGlvbkVycm9yQ291bnQ6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21pZ3JhdGVzIGR1cGxpY2F0ZSBzb3VyY2UgaWRlbnRpdGllcyBiZWZvcmUgZGVsZXRpbmcgdGhlIHNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzb3VyY2VVcmkgPSBVUkkuZmlsZSgnL2hvbWUvdGVzdC9zaGFyZWQucHJvbXB0Lm1kJyk7XG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbnM6IElQcm9tcHRQYXRoW10gPSBbXG5cdFx0XHR7IHVyaTogc291cmNlVXJpLCBuYW1lOiAnU2hhcmVkJywgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLnByb21wdCwgc291cmNlOiBQcm9tcHRGaWxlU291cmNlLkNvbmZpZ1dvcmtzcGFjZSB9LFxuXHRcdFx0eyB1cmk6IHNvdXJjZVVyaSwgbmFtZTogJ1NoYXJlZCcsIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsIHR5cGU6IFByb21wdHNUeXBlLnByb21wdCwgc291cmNlOiBQcm9tcHRGaWxlU291cmNlLkNvbmZpZ1BlcnNvbmFsIH0sXG5cdFx0XTtcblx0XHRjb25zdCB3b3Jrc3BhY2VTa2lsbFJvb3Q6IElDdXN0b21pemF0aW9uU291cmNlRm9sZGVyID0geyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzJyksIGxhYmVsOiAnLmdpdGh1Yi9za2lsbHMnLCBzb3VyY2U6IFByb21wdHNTdG9yYWdlLmxvY2FsIH07XG5cdFx0Y29uc3QgdXNlclNraWxsUm9vdDogSUN1c3RvbWl6YXRpb25Tb3VyY2VGb2xkZXIgPSB7IHVyaTogVVJJLmZpbGUoJy9ob21lL3Rlc3QvLmNvcGlsb3Qvc2tpbGxzJyksIGxhYmVsOiAnfi8uY29waWxvdC9za2lsbHMnLCBzb3VyY2U6IFByb21wdHNTdG9yYWdlLnVzZXIgfTtcblx0XHRjb25zdCB0YXJnZXRGb2xkZXJzOiBDdXN0b21pemF0aW9uTWlncmF0aW9uVGFyZ2V0Rm9sZGVycyA9IG5ldyBNYXAoW1xuXHRcdFx0W1Byb21wdHNUeXBlLnNraWxsLCBuZXcgTWFwKFtbUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHdvcmtzcGFjZVNraWxsUm9vdF0sIFtQcm9tcHRzU3RvcmFnZS51c2VyLCB1c2VyU2tpbGxSb290XV0pXSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IGZpbGVTeXN0ZW1Qcm92aWRlciA9IHN0b3JlLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0c3RvcmUuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5maWxlLCBmaWxlU3lzdGVtUHJvdmlkZXIpKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoc291cmNlVXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCctLS1cXG5uYW1lOiBTaGFyZWRcXG4tLS1cXG5TaGFyZWQgYm9keScpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1pZ3JhdGVDdXN0b21pemF0aW9ucyhjdXN0b21pemF0aW9ucywgdGFyZ2V0Rm9sZGVycywgZmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVNraWxsVXJpID0gY3JlYXRlU2tpbGxGaWxlVXJpKHdvcmtzcGFjZVNraWxsUm9vdC51cmksICdzaGFyZWQnKTtcblx0XHRjb25zdCB1c2VyU2tpbGxVcmkgPSBjcmVhdGVTa2lsbEZpbGVVcmkodXNlclNraWxsUm9vdC51cmksICdzaGFyZWQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdC4uLnJlc3VsdCxcblx0XHRcdFx0bWlncmF0ZWRDdXN0b21pemF0aW9uczogcmVzdWx0Lm1pZ3JhdGVkQ3VzdG9taXphdGlvbnMubWFwKGN1c3RvbWl6YXRpb24gPT4gKHsgdXJpOiBjdXN0b21pemF0aW9uLnVyaS5wYXRoLCB0eXBlOiBjdXN0b21pemF0aW9uLnR5cGUgfSkpLFxuXHRcdFx0fSxcblx0XHRcdHNvdXJjZUV4aXN0czogYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKHNvdXJjZVVyaSksXG5cdFx0XHR3b3Jrc3BhY2VUYXJnZXRFeGlzdHM6IGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyh3b3Jrc3BhY2VTa2lsbFVyaSksXG5cdFx0XHR1c2VyVGFyZ2V0RXhpc3RzOiBhd2FpdCBmaWxlU2VydmljZS5leGlzdHModXNlclNraWxsVXJpKSxcblx0XHR9LCB7XG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0bWlncmF0ZWRDb3VudDogMixcblx0XHRcdFx0ZmFpbGVkQ3VzdG9taXphdGlvbkZpbGVOYW1lczogW10sXG5cdFx0XHRcdHVuc3VwcG9ydGVkSGVhZGVyS2V5czogW10sXG5cdFx0XHRcdG1pZ3JhdGVkQ3VzdG9taXphdGlvbnM6IFtcblx0XHRcdFx0XHR7IHVyaTogd29ya3NwYWNlU2tpbGxVcmkucGF0aCwgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwgfSxcblx0XHRcdFx0XHR7IHVyaTogdXNlclNraWxsVXJpLnBhdGgsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdFx0c291cmNlRXhpc3RzOiBmYWxzZSxcblx0XHRcdHdvcmtzcGFjZVRhcmdldEV4aXN0czogdHJ1ZSxcblx0XHRcdHVzZXJUYXJnZXRFeGlzdHM6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JvbGxzIGJhY2sgdGhlIHRhcmdldCB3aGVuIGRlbGV0aW5nIHRoZSBzb3VyY2UgZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc291cmNlVXJpID0gVVJJLmZpbGUoJy91c2VyLWRhdGEvc3R5bGUuaW5zdHJ1Y3Rpb25zLm1kJyk7XG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbjogSVByb21wdFBhdGggPSB7XG5cdFx0XHR1cmk6IHNvdXJjZVVyaSxcblx0XHRcdG5hbWU6ICdTdHlsZScsXG5cdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLFxuXHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLFxuXHRcdFx0c291cmNlOiBQcm9tcHRGaWxlU291cmNlLlVzZXJEYXRhLFxuXHRcdH07XG5cdFx0Y29uc3QgaW5zdHJ1Y3Rpb25zUm9vdDogSUN1c3RvbWl6YXRpb25Tb3VyY2VGb2xkZXIgPSB7IHVyaTogVVJJLmZpbGUoJy9ob21lL3Rlc3QvLmNvcGlsb3QvaW5zdHJ1Y3Rpb25zJyksIGxhYmVsOiAnfi8uY29waWxvdC9pbnN0cnVjdGlvbnMnLCBzb3VyY2U6IFByb21wdHNTdG9yYWdlLnVzZXIgfTtcblx0XHRjb25zdCB0YXJnZXRGb2xkZXJzOiBDdXN0b21pemF0aW9uTWlncmF0aW9uVGFyZ2V0Rm9sZGVycyA9IG5ldyBNYXAoW1xuXHRcdFx0W1Byb21wdHNUeXBlLmluc3RydWN0aW9ucywgbmV3IE1hcChbW1Byb21wdHNTdG9yYWdlLnVzZXIsIGluc3RydWN0aW9uc1Jvb3RdXSldLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgZmlsZVN5c3RlbVByb3ZpZGVyID0gc3RvcmUuYWRkKG5ldyBEZWxldGVGYWlsaW5nRmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdHN0b3JlLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuZmlsZSwgZmlsZVN5c3RlbVByb3ZpZGVyKSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHNvdXJjZVVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygnVXNlIHRhYnMuJykpO1xuXHRcdGZpbGVTeXN0ZW1Qcm92aWRlci5kZWxldGVGYWlsdXJlUmVzb3VyY2UgPSBzb3VyY2VVcmk7XG5cblx0XHRjb25zdCBtaWdyYXRpb25FcnJvcnM6IEVycm9yW10gPSBbXTtcblx0XHRjb25zdCBmYWlsZWRSZXN1bHQgPSBhd2FpdCBtaWdyYXRlQ3VzdG9taXphdGlvbnMoW2N1c3RvbWl6YXRpb25dLCB0YXJnZXRGb2xkZXJzLCBmaWxlU2VydmljZSwgZXJyb3IgPT4gbWlncmF0aW9uRXJyb3JzLnB1c2goZXJyb3IpKTtcblx0XHRjb25zdCB0YXJnZXRVcmkgPSBVUkkuam9pblBhdGgoaW5zdHJ1Y3Rpb25zUm9vdC51cmksICdzdHlsZS5pbnN0cnVjdGlvbnMubWQnKTtcblx0XHRjb25zdCBhZnRlckZhaWx1cmUgPSB7XG5cdFx0XHRzb3VyY2VFeGlzdHM6IGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhzb3VyY2VVcmkpLFxuXHRcdFx0dGFyZ2V0RXhpc3RzOiBhd2FpdCBmaWxlU2VydmljZS5leGlzdHModGFyZ2V0VXJpKSxcblx0XHRcdG1pZ3JhdGlvbkVycm9yQ291bnQ6IG1pZ3JhdGlvbkVycm9ycy5sZW5ndGgsXG5cdFx0fTtcblxuXHRcdGZpbGVTeXN0ZW1Qcm92aWRlci5kZWxldGVGYWlsdXJlUmVzb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcmV0cmllZFJlc3VsdCA9IGF3YWl0IG1pZ3JhdGVDdXN0b21pemF0aW9ucyhbY3VzdG9taXphdGlvbl0sIHRhcmdldEZvbGRlcnMsIGZpbGVTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZmFpbGVkUmVzdWx0LFxuXHRcdFx0YWZ0ZXJGYWlsdXJlLFxuXHRcdFx0cmV0cmllZFJlc3VsdDoge1xuXHRcdFx0XHQuLi5yZXRyaWVkUmVzdWx0LFxuXHRcdFx0XHRtaWdyYXRlZEN1c3RvbWl6YXRpb25zOiByZXRyaWVkUmVzdWx0Lm1pZ3JhdGVkQ3VzdG9taXphdGlvbnMubWFwKGl0ZW0gPT4gaXRlbS51cmkucGF0aCksXG5cdFx0XHR9LFxuXHRcdFx0YWZ0ZXJSZXRyeToge1xuXHRcdFx0XHRzb3VyY2VFeGlzdHM6IGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhzb3VyY2VVcmkpLFxuXHRcdFx0XHR0YXJnZXRFeGlzdHM6IGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyh0YXJnZXRVcmkpLFxuXHRcdFx0XHRzdWZmaXhlZFRhcmdldEV4aXN0czogYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKFVSSS5qb2luUGF0aChpbnN0cnVjdGlvbnNSb290LnVyaSwgJ3N0eWxlLTIuaW5zdHJ1Y3Rpb25zLm1kJykpLFxuXHRcdFx0fSxcblx0XHR9LCB7XG5cdFx0XHRmYWlsZWRSZXN1bHQ6IHtcblx0XHRcdFx0bWlncmF0ZWRDb3VudDogMCxcblx0XHRcdFx0ZmFpbGVkQ3VzdG9taXphdGlvbkZpbGVOYW1lczogWydzdHlsZS5pbnN0cnVjdGlvbnMubWQnXSxcblx0XHRcdFx0dW5zdXBwb3J0ZWRIZWFkZXJLZXlzOiBbXSxcblx0XHRcdFx0bWlncmF0ZWRDdXN0b21pemF0aW9uczogW10sXG5cdFx0XHR9LFxuXHRcdFx0YWZ0ZXJGYWlsdXJlOiB7XG5cdFx0XHRcdHNvdXJjZUV4aXN0czogdHJ1ZSxcblx0XHRcdFx0dGFyZ2V0RXhpc3RzOiBmYWxzZSxcblx0XHRcdFx0bWlncmF0aW9uRXJyb3JDb3VudDogMSxcblx0XHRcdH0sXG5cdFx0XHRyZXRyaWVkUmVzdWx0OiB7XG5cdFx0XHRcdG1pZ3JhdGVkQ291bnQ6IDEsXG5cdFx0XHRcdGZhaWxlZEN1c3RvbWl6YXRpb25GaWxlTmFtZXM6IFtdLFxuXHRcdFx0XHR1bnN1cHBvcnRlZEhlYWRlcktleXM6IFtdLFxuXHRcdFx0XHRtaWdyYXRlZEN1c3RvbWl6YXRpb25zOiBbdGFyZ2V0VXJpLnBhdGhdLFxuXHRcdFx0fSxcblx0XHRcdGFmdGVyUmV0cnk6IHtcblx0XHRcdFx0c291cmNlRXhpc3RzOiBmYWxzZSxcblx0XHRcdFx0dGFyZ2V0RXhpc3RzOiB0cnVlLFxuXHRcdFx0XHRzdWZmaXhlZFRhcmdldEV4aXN0czogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBvdmVyd3JpdGUgb3Igcm9sbCBiYWNrIGEgY29uY3VycmVudGx5IGNyZWF0ZWQgdGFyZ2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNvdXJjZVVyaSA9IFVSSS5maWxlKCcvdXNlci1kYXRhL3N0eWxlLmluc3RydWN0aW9ucy5tZCcpO1xuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb246IElQcm9tcHRQYXRoID0ge1xuXHRcdFx0dXJpOiBzb3VyY2VVcmksXG5cdFx0XHRuYW1lOiAnU3R5bGUnLFxuXHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlcixcblx0XHRcdHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyxcblx0XHRcdHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5Vc2VyRGF0YSxcblx0XHR9O1xuXHRcdGNvbnN0IGluc3RydWN0aW9uc1Jvb3Q6IElDdXN0b21pemF0aW9uU291cmNlRm9sZGVyID0geyB1cmk6IFVSSS5maWxlKCcvaG9tZS90ZXN0Ly5jb3BpbG90L2luc3RydWN0aW9ucycpLCBsYWJlbDogJ34vLmNvcGlsb3QvaW5zdHJ1Y3Rpb25zJywgc291cmNlOiBQcm9tcHRzU3RvcmFnZS51c2VyIH07XG5cdFx0Y29uc3QgdGFyZ2V0Rm9sZGVyczogQ3VzdG9taXphdGlvbk1pZ3JhdGlvblRhcmdldEZvbGRlcnMgPSBuZXcgTWFwKFtcblx0XHRcdFtQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIG5ldyBNYXAoW1tQcm9tcHRzU3RvcmFnZS51c2VyLCBpbnN0cnVjdGlvbnNSb290XV0pXSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IGZpbGVTeXN0ZW1Qcm92aWRlciA9IHN0b3JlLmFkZChuZXcgQ29uY3VycmVudFRhcmdldEZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRzdG9yZS5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmZpbGUsIGZpbGVTeXN0ZW1Qcm92aWRlcikpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShzb3VyY2VVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ1VzZSB0YWJzLicpKTtcblx0XHRjb25zdCB0YXJnZXRVcmkgPSBVUkkuam9pblBhdGgoaW5zdHJ1Y3Rpb25zUm9vdC51cmksICdzdHlsZS5pbnN0cnVjdGlvbnMubWQnKTtcblx0XHRmaWxlU3lzdGVtUHJvdmlkZXIuY29uZmxpY3RSZXNvdXJjZSA9IHRhcmdldFVyaTtcblxuXHRcdGNvbnN0IG1pZ3JhdGlvbkVycm9yczogRXJyb3JbXSA9IFtdO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1pZ3JhdGVDdXN0b21pemF0aW9ucyhbY3VzdG9taXphdGlvbl0sIHRhcmdldEZvbGRlcnMsIGZpbGVTZXJ2aWNlLCBlcnJvciA9PiBtaWdyYXRpb25FcnJvcnMucHVzaChlcnJvcikpO1xuXHRcdGNvbnN0IHRhcmdldEVudHJpZXMgPSBhd2FpdCBmaWxlU3lzdGVtUHJvdmlkZXIucmVhZGRpcihpbnN0cnVjdGlvbnNSb290LnVyaSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc3VsdCxcblx0XHRcdHNvdXJjZUV4aXN0czogYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKHNvdXJjZVVyaSksXG5cdFx0XHR0YXJnZXRDb250ZW50OiAoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUodGFyZ2V0VXJpKSkudmFsdWUudG9TdHJpbmcoKSxcblx0XHRcdHRhcmdldEVudHJpZXMsXG5cdFx0XHRtaWdyYXRpb25FcnJvckNvdW50OiBtaWdyYXRpb25FcnJvcnMubGVuZ3RoLFxuXHRcdH0sIHtcblx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRtaWdyYXRlZENvdW50OiAwLFxuXHRcdFx0XHRmYWlsZWRDdXN0b21pemF0aW9uRmlsZU5hbWVzOiBbJ3N0eWxlLmluc3RydWN0aW9ucy5tZCddLFxuXHRcdFx0XHR1bnN1cHBvcnRlZEhlYWRlcktleXM6IFtdLFxuXHRcdFx0XHRtaWdyYXRlZEN1c3RvbWl6YXRpb25zOiBbXSxcblx0XHRcdH0sXG5cdFx0XHRzb3VyY2VFeGlzdHM6IHRydWUsXG5cdFx0XHR0YXJnZXRDb250ZW50OiAnZm9yZWlnbiBjb250ZW50Jyxcblx0XHRcdHRhcmdldEVudHJpZXM6IFtbJ3N0eWxlLmluc3RydWN0aW9ucy5tZCcsIEZpbGVUeXBlLkZpbGVdXSxcblx0XHRcdG1pZ3JhdGlvbkVycm9yQ291bnQ6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBrZWVwIG9yaWdpbmFsIGN1c3RvbWl6YXRpb24gZmlsZXMgYWZ0ZXIgbWlncmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb246IElQcm9tcHRQYXRoID0ge1xuXHRcdFx0dXJpOiBVUkkuZmlsZSgnL2hvbWUvdGVzdC8udnNjb2RlL3Byb21wdHMvc3R5bGUuaW5zdHJ1Y3Rpb25zLm1kJyksXG5cdFx0XHRuYW1lOiAnU3R5bGUnLFxuXHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlcixcblx0XHRcdHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyxcblx0XHRcdHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5Vc2VyRGF0YSxcblx0XHR9O1xuXHRcdGNvbnN0IGluc3RydWN0aW9uc1Jvb3Q6IElDdXN0b21pemF0aW9uU291cmNlRm9sZGVyID0geyB1cmk6IFVSSS5maWxlKCcvaG9tZS90ZXN0Ly5jb3BpbG90L2luc3RydWN0aW9ucycpLCBsYWJlbDogJ34vLmNvcGlsb3QvaW5zdHJ1Y3Rpb25zJywgc291cmNlOiBQcm9tcHRzU3RvcmFnZS51c2VyIH07XG5cblx0XHRjb25zdCBmaWxlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBmaWxlU3lzdGVtUHJvdmlkZXIgPSBzdG9yZS5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdHN0b3JlLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuZmlsZSwgZmlsZVN5c3RlbVByb3ZpZGVyKSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGN1c3RvbWl6YXRpb24udXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdVc2UgdGFicy4nKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtaWdyYXRlQ3VzdG9taXphdGlvbnMoXG5cdFx0XHRbY3VzdG9taXphdGlvbl0sXG5cdFx0XHRuZXcgTWFwKFtbUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBuZXcgTWFwKFtbUHJvbXB0c1N0b3JhZ2UudXNlciwgaW5zdHJ1Y3Rpb25zUm9vdF1dKV1dKSxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0eyBkZWxldGVPcmlnaW5hbEZpbGVzOiBmYWxzZSB9LFxuXHRcdCk7XG5cdFx0Y29uc3QgbWlncmF0ZWRVcmkgPSBVUkkuam9pblBhdGgoaW5zdHJ1Y3Rpb25zUm9vdC51cmksICdzdHlsZS5pbnN0cnVjdGlvbnMubWQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWlncmF0ZWRDb3VudDogcmVzdWx0Lm1pZ3JhdGVkQ291bnQsXG5cdFx0XHRtaWdyYXRlZFVyaXM6IHJlc3VsdC5taWdyYXRlZEN1c3RvbWl6YXRpb25zLm1hcChpdGVtID0+IGl0ZW0udXJpLnBhdGgpLFxuXHRcdFx0b3JpZ2luYWxFeGlzdHM6IGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhjdXN0b21pemF0aW9uLnVyaSksXG5cdFx0XHRtaWdyYXRlZEV4aXN0czogYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKG1pZ3JhdGVkVXJpKSxcblx0XHR9LCB7XG5cdFx0XHRtaWdyYXRlZENvdW50OiAxLFxuXHRcdFx0bWlncmF0ZWRVcmlzOiBbbWlncmF0ZWRVcmkucGF0aF0sXG5cdFx0XHRvcmlnaW5hbEV4aXN0czogdHJ1ZSxcblx0XHRcdG1pZ3JhdGVkRXhpc3RzOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsVUFBaUQsK0JBQStCLG1DQUFtQztBQUM1SCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUFrQixtQkFBbUI7QUFDOUMsU0FBUyxzQkFBd0M7QUFFakQsU0FBUyxvQkFBb0IsdUJBQXVCLGdDQUEwRTtBQUM5SCxTQUFTLG9DQUFvQyxrQ0FBa0MseUNBQXlDO0FBRXhILE1BQU0sd0NBQXdDLDJCQUEyQjtBQUFBLEVBR3hFLE1BQWUsT0FBTyxVQUFlLFNBQTRDO0FBQ2hGLFFBQUksS0FBSyx5QkFBeUIsUUFBUSxVQUFVLEtBQUsscUJBQXFCLEdBQUc7QUFDaEYsWUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsSUFDMUM7QUFDQSxVQUFNLE1BQU0sT0FBTyxVQUFVLE9BQU87QUFBQSxFQUNyQztBQUNEO0FBRUEsTUFBTSwyQ0FBMkMsMkJBQTJCO0FBQUEsRUFHM0UsTUFBZSxVQUFVLFVBQWUsU0FBcUIsU0FBMkM7QUFDdkcsUUFBSSxLQUFLLG9CQUFvQixRQUFRLFVBQVUsS0FBSyxnQkFBZ0IsR0FBRztBQUN0RSxXQUFLLG1CQUFtQjtBQUN4QixZQUFNLE1BQU0sVUFBVSxVQUFVLFNBQVMsV0FBVyxpQkFBaUIsRUFBRSxRQUFRO0FBQUEsUUFDOUUsUUFBUTtBQUFBLFFBQ1IsV0FBVztBQUFBLFFBQ1gsUUFBUTtBQUFBLFFBQ1IsUUFBUTtBQUFBLE1BQ1QsQ0FBQztBQUNELFlBQU0s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
