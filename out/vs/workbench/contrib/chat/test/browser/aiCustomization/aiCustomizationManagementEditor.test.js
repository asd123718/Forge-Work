import assert from "assert";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../../base/common/map.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { URI } from "../../../../../../base/common/uri.js";
import { AICustomizationManagementEditor } from "../../../browser/aiCustomization/aiCustomizationManagementEditor.js";
import { ChatConfiguration } from "../../../common/constants.js";
import { PromptsStorage } from "../../../common/promptSyntax/service/promptsService.js";
import { PromptFileSource, PromptsType, Target } from "../../../common/promptSyntax/promptTypes.js";
import { AICustomizationSources } from "../../../common/aiCustomizationWorkspaceService.js";
import { CustomizationMigrationCategoryId } from "../../../browser/aiCustomization/customizationMigrationCategories.js";
suite("aiCustomizationManagementEditor", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createConfigurationServiceStub(values = {}) {
    const merged = {
      [ChatConfiguration.ChatCustomizationsStructuredPreviewEnabled]: true,
      ...values
    };
    return {
      getValue: (key) => merged[key],
      setValue: (key, value) => {
        merged[key] = value;
      }
    };
  }
  function createTestEditor(hoverService, configurationService) {
    const editor = Object.create(AICustomizationManagementEditor.prototype);
    editor.currentEditingPromptType = void 0;
    editor.currentEditingSource = void 0;
    editor.currentEditingReadOnly = false;
    editor.customizationsByMigrationCategory = /* @__PURE__ */ new Map();
    editor.activeMigrationCategoryId = void 0;
    editor.editorDisplayMode = "preview";
    editor.editorPreviewFrontMatterContainer = document.createElement("div");
    editor.editorPreviewDisposables = new DisposableStore();
    editor.hoverService = hoverService ?? {
      setupManagedHover: () => ({
        dispose() {
        },
        show() {
        },
        hide() {
        },
        update() {
        }
      })
    };
    editor.configurationService = configurationService ?? createConfigurationServiceStub();
    editor.migrationListContainer = void 0;
    editor.migrationMigrateButton = void 0;
    editor.migrationTitleElement = void 0;
    editor.migrationDescriptionElement = void 0;
    editor.migrationBannerContainer = void 0;
    editor.migrationLinkElement = void 0;
    editor.migrationSearchQuery = "";
    editor.selectedCustomizationMigrationItems = new ResourceMap();
    editor.collapsedCustomizationMigrationGroups = /* @__PURE__ */ new Set();
    editor.migrationPageDisposables = editor.editorPreviewDisposables.add(new DisposableStore());
    editor.labelService = {
      getUriLabel: (uri) => uri.path
    };
    editor.showEmbeddedEditor = async () => {
    };
    editor.getActiveHarnessLabel = () => "Copilot [Agent Host]";
    editor.welcomePage = void 0;
    editor.contributedSectionContainers = /* @__PURE__ */ new Map();
    editor.editorPreviewRenderScheduler = {
      cancel() {
      },
      schedule() {
      }
    };
    editor.viewMode = "list";
    editor.dimension = void 0;
    editor.selectedSection = void 0;
    editor.setVisible(false);
    return editor;
  }
  function createScalarAttribute(key, value) {
    return {
      key,
      range: new Range(1, 1, 1, key.length + value.length + 1),
      value: {
        type: "scalar",
        value,
        range: new Range(1, 1, 1, value.length + 1),
        format: "double"
      }
    };
  }
  test("uses edit copy for built-in skills that support raw overrides", () => {
    const editor = createTestEditor();
    editor.currentEditingPromptType = PromptsType.skill;
    editor.currentEditingSource = AICustomizationSources.builtin;
    editor.currentEditingReadOnly = true;
    editor.editorDisplayMode = "preview";
    assert.strictEqual(editor.getEditorModeButtonLabel(), "Edit");
    assert.strictEqual(editor.getEditorModeButtonTooltip(), "Edit the raw markdown file");
    editor.editorPreviewDisposables.dispose();
  });
  test("uses view-raw copy for true read-only extension content", () => {
    const editor = createTestEditor();
    editor.currentEditingPromptType = PromptsType.agent;
    editor.currentEditingSource = AICustomizationSources.extension;
    editor.currentEditingReadOnly = true;
    editor.editorDisplayMode = "preview";
    assert.strictEqual(editor.getEditorModeButtonLabel(), "View Raw");
    assert.strictEqual(editor.getEditorModeButtonTooltip(), "Show the raw markdown file");
    editor.editorPreviewDisposables.dispose();
  });
  test("clicking a preview field help button opens the managed hover with focus", () => {
    let focused;
    const hoverService = {
      setupManagedHover: () => ({
        dispose() {
        },
        show(focus) {
          focused = focus;
        },
        hide() {
        },
        update() {
        }
      })
    };
    const editor = createTestEditor(hoverService);
    const container = editor.editorPreviewFrontMatterContainer;
    document.body.appendChild(container);
    try {
      editor.renderPreviewAttribute(createScalarAttribute("description", "Helpful text"), PromptsType.agent, Target.VSCode);
      const helpButton = container.querySelector("button.editor-preview-row-help");
      assert.ok(helpButton);
      helpButton.click();
      assert.strictEqual(focused, true);
    } finally {
      container.remove();
      editor.editorPreviewDisposables.dispose();
    }
  });
  test("hides preview button when structured preview setting is disabled", () => {
    const editor = createTestEditor(void 0, createConfigurationServiceStub({
      [ChatConfiguration.ChatCustomizationsStructuredPreviewEnabled]: false
    }));
    editor.currentEditingPromptType = PromptsType.agent;
    editor.currentEditingSource = AICustomizationSources.builtin;
    editor.currentEditingReadOnly = false;
    editor.editorDisplayMode = "preview";
    assert.strictEqual(editor.getEditorModeButtonLabel(), "");
    assert.strictEqual(editor.getEditorModeButtonTooltip(), "");
    editor.editorPreviewDisposables.dispose();
  });
  test("disabling the setting at runtime forces the editor back to raw mode", () => {
    const configurationService = createConfigurationServiceStub();
    const editor = createTestEditor(void 0, configurationService);
    editor.viewMode = "editor";
    editor.currentEditingPromptType = PromptsType.agent;
    editor.editorDisplayMode = "preview";
    assert.strictEqual(editor.getEditorModeButtonLabel(), "Edit");
    configurationService.setValue(ChatConfiguration.ChatCustomizationsStructuredPreviewEnabled, false);
    editor.onStructuredPreviewSettingChanged();
    assert.strictEqual(editor.editorDisplayMode, "raw");
    assert.strictEqual(editor.getEditorModeButtonLabel(), "");
    editor.editorPreviewDisposables.dispose();
  });
  test("gates each migration category on its own experimental setting", () => {
    const welcomePageCalls = [];
    const configurationService = createConfigurationServiceStub({
      [ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: false,
      [ChatConfiguration.ChatCustomizationsUserDataMigrationEnabled]: false
    });
    const editor = createTestEditor(void 0, configurationService);
    editor.customizationsByMigrationCategory = /* @__PURE__ */ new Map([
      [CustomizationMigrationCategoryId.PromptFiles, [{
        uri: URI.file("/workspace/.github/prompts/prompt.prompt.md"),
        storage: PromptsStorage.local,
        type: PromptsType.prompt,
        source: PromptFileSource.GitHubWorkspace
      }]],
      [CustomizationMigrationCategoryId.UserData, [{
        uri: URI.file("/user-data/prompts/legacy.agent.md"),
        storage: PromptsStorage.user,
        type: PromptsType.agent,
        source: PromptFileSource.UserData
      }]]
    ]);
    editor.welcomePage = {
      setMigrationCategories: (categories) => welcomePageCalls.push([...categories])
    };
    editor.refreshCustomizationMigrationUi();
    configurationService.setValue(ChatConfiguration.ChatCustomizationsUserDataMigrationEnabled, true);
    editor.refreshCustomizationMigrationUi();
    configurationService.setValue(ChatConfiguration.ChatCustomizationsPromptMigrationEnabled, true);
    editor.refreshCustomizationMigrationUi();
    assert.deepStrictEqual(welcomePageCalls.map((categories) => categories.map((category) => category.id)), [
      [],
      [CustomizationMigrationCategoryId.UserData],
      [CustomizationMigrationCategoryId.PromptFiles, CustomizationMigrationCategoryId.UserData]
    ]);
    editor.editorPreviewDisposables.dispose();
  });
  test("tracks migration selection by URI and storage", () => {
    const editor = createTestEditor(void 0, createConfigurationServiceStub({
      [ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true
    }));
    const sharedUri = URI.file("/home/user/shared.prompt.md");
    const workspacePrompt = {
      uri: sharedUri,
      storage: PromptsStorage.local,
      type: PromptsType.prompt,
      source: PromptFileSource.ConfigWorkspace
    };
    const userPrompt = {
      uri: sharedUri,
      storage: PromptsStorage.user,
      type: PromptsType.prompt,
      source: PromptFileSource.ConfigPersonal
    };
    const candidates = /* @__PURE__ */ new Map([
      [CustomizationMigrationCategoryId.PromptFiles, [workspacePrompt, userPrompt]]
    ]);
    editor.setCustomizationsToMigrate(candidates);
    editor.setCustomizationSelectedForMigration(workspacePrompt, false);
    editor.setCustomizationsToMigrate(candidates);
    assert.deepStrictEqual({
      workspaceSelected: editor.isCustomizationSelectedForMigration(workspacePrompt),
      userSelected: editor.isCustomizationSelectedForMigration(userPrompt),
      selectedStorages: [...editor.selectedCustomizationMigrationItems.get(sharedUri) ?? []]
    }, {
      workspaceSelected: false,
      userSelected: true,
      selectedStorages: [PromptsStorage.user]
    });
    editor.editorPreviewDisposables.dispose();
  });
  test("user data migration banner states the Settings Sync trade-off and replaces the description", () => {
    const editor = createTestEditor(void 0, createConfigurationServiceStub({
      [ChatConfiguration.ChatCustomizationsUserDataMigrationEnabled]: true,
      [ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true
    }));
    const userDataCustomizations = [
      {
        uri: URI.file("/user-data/prompts/legacy.agent.md"),
        name: "legacy.agent.md",
        storage: PromptsStorage.user,
        type: PromptsType.agent,
        source: PromptFileSource.UserData
      },
      {
        uri: URI.file("/user-data/prompts/style.instructions.md"),
        name: "style.instructions.md",
        storage: PromptsStorage.user,
        type: PromptsType.instructions,
        source: PromptFileSource.UserData
      }
    ];
    const promptFiles = [
      {
        uri: URI.file("/workspace/.github/prompts/review.prompt.md"),
        name: "review.prompt.md",
        storage: PromptsStorage.local,
        type: PromptsType.prompt,
        source: PromptFileSource.GitHubWorkspace
      }
    ];
    editor.customizationsByMigrationCategory = /* @__PURE__ */ new Map([
      [CustomizationMigrationCategoryId.UserData, userDataCustomizations],
      [CustomizationMigrationCategoryId.PromptFiles, promptFiles]
    ]);
    editor.selectedCustomizationMigrationItems = new ResourceMap();
    editor.migrationListContainer = document.createElement("div");
    editor.migrationTitleElement = document.createElement("h2");
    editor.migrationDescriptionElement = document.createElement("p");
    editor.migrationBannerContainer = document.createElement("div");
    editor.migrationLinkElement = document.createElement("a");
    editor.migrationMigrateButton = { enabled: false, label: "" };
    document.body.appendChild(editor.migrationListContainer);
    const readBanner = () => ({
      title: editor.migrationBannerContainer.querySelector(".customization-migration-banner-title")?.textContent ?? "",
      consequenceMentionsSync: (editor.migrationBannerContainer.querySelector(".customization-migration-banner-consequence")?.textContent ?? "").includes("Settings Sync"),
      bannerHidden: editor.migrationBannerContainer.style.display === "none",
      descriptionHidden: editor.migrationDescriptionElement.style.display === "none"
    });
    try {
      editor.activeMigrationCategoryId = CustomizationMigrationCategoryId.UserData;
      editor.renderCustomizationMigrationPage();
      const userData = readBanner();
      editor.activeMigrationCategoryId = CustomizationMigrationCategoryId.PromptFiles;
      editor.renderCustomizationMigrationPage();
      const prompts = readBanner();
      assert.deepStrictEqual({ userData, prompts }, {
        userData: {
          title: "2 customizations are not available to Copilot [Agent Host]",
          consequenceMentionsSync: true,
          bannerHidden: false,
          descriptionHidden: true
        },
        prompts: {
          title: "",
          consequenceMentionsSync: false,
          bannerHidden: true,
          descriptionHidden: false
        }
      });
    } finally {
      editor.migrationListContainer.remove();
      editor.migrationPageDisposables.dispose();
      editor.editorPreviewDisposables.dispose();
    }
  });
  test("opens a migration candidate through the shared Button widget", () => {
    const editor = createTestEditor(void 0, createConfigurationServiceStub({
      [ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true
    }));
    const promptFile = {
      uri: URI.file("/workspace/.github/prompts/review.prompt.md"),
      name: "Review",
      storage: PromptsStorage.local,
      type: PromptsType.prompt,
      source: PromptFileSource.GitHubWorkspace
    };
    const openedItems = [];
    editor.showEmbeddedEditor = async (...args) => {
      openedItems.push(args);
    };
    editor.customizationsByMigrationCategory = /* @__PURE__ */ new Map([[CustomizationMigrationCategoryId.PromptFiles, [promptFile]]]);
    editor.activeMigrationCategoryId = CustomizationMigrationCategoryId.PromptFiles;
    editor.migrationListContainer = document.createElement("div");
    editor.migrationMigrateButton = { enabled: false, label: "" };
    document.body.appendChild(editor.migrationListContainer);
    try {
      editor.renderCustomizationMigrationPage();
      const openButton = editor.migrationListContainer.querySelector(".prompt-migration-open-button");
      const activateWithKey = (key, keyCode) => {
        const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
        Object.defineProperty(event, "keyCode", { get: () => keyCode });
        openButton?.dispatchEvent(event);
      };
      activateWithKey("Enter", 13);
      activateWithKey(" ", 32);
      assert.deepStrictEqual({
        tagName: openButton?.tagName,
        role: openButton?.getAttribute("role"),
        ariaLabel: openButton?.getAttribute("aria-label"),
        openedItems
      }, {
        tagName: "A",
        role: "button",
        ariaLabel: "Open Review, /workspace/.github/prompts/review.prompt.md",
        openedItems: [
          [promptFile.uri, "Review", PromptsType.prompt, PromptsStorage.local, true],
          [promptFile.uri, "Review", PromptsType.prompt, PromptsStorage.local, true]
        ]
      });
    } finally {
      editor.migrationListContainer.remove();
      editor.migrationPageDisposables.dispose();
      editor.editorPreviewDisposables.dispose();
    }
  });
  test("customization migration groups can be collapsed independently", () => {
    const editor = createTestEditor(void 0, createConfigurationServiceStub({
      [ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true
    }));
    const promptFiles = [
      {
        uri: URI.file("/workspace/.github/prompts/workspace-a.prompt.md"),
        name: "workspace-a.prompt.md",
        storage: PromptsStorage.local,
        type: PromptsType.prompt,
        source: PromptFileSource.GitHubWorkspace
      },
      {
        uri: URI.file("/workspace/.github/prompts/workspace-b.prompt.md"),
        name: "workspace-b.prompt.md",
        storage: PromptsStorage.local,
        type: PromptsType.prompt,
        source: PromptFileSource.GitHubWorkspace
      },
      {
        uri: URI.file("/user-data/prompts/user-a.prompt.md"),
        name: "user-a.prompt.md",
        storage: PromptsStorage.user,
        type: PromptsType.prompt,
        source: PromptFileSource.UserData
      },
      {
        uri: URI.file("/user-data/prompts/user-b.prompt.md"),
        name: "user-b.prompt.md",
        storage: PromptsStorage.user,
        type: PromptsType.prompt,
        source: PromptFileSource.UserData
      }
    ];
    editor.customizationsByMigrationCategory = /* @__PURE__ */ new Map([[CustomizationMigrationCategoryId.PromptFiles, promptFiles]]);
    editor.activeMigrationCategoryId = CustomizationMigrationCategoryId.PromptFiles;
    for (const promptFile of promptFiles) {
      editor.setCustomizationSelectedForMigration(promptFile, true);
    }
    editor.migrationListContainer = document.createElement("div");
    editor.migrationTitleElement = document.createElement("h2");
    editor.migrationDescriptionElement = document.createElement("p");
    editor.migrationLinkElement = document.createElement("a");
    editor.migrationMigrateButton = { enabled: false, label: "" };
    document.body.appendChild(editor.migrationListContainer);
    try {
      editor.renderCustomizationMigrationPage();
      const groupToggles = [...editor.migrationListContainer.querySelectorAll(".prompt-migration-group-toggle")];
      assert.deepStrictEqual(groupToggles.map((button) => button.getAttribute("aria-expanded")), ["true", "true"]);
      groupToggles[0].click();
      const groupContainers = [...editor.migrationListContainer.querySelectorAll(".prompt-migration-group-items")];
      assert.deepStrictEqual(groupContainers.map((container) => container.style.display), ["none", ""]);
      assert.deepStrictEqual(
        [...editor.migrationListContainer.querySelectorAll(".prompt-migration-group-toggle")].map((button) => button.getAttribute("aria-expanded")),
        ["false", "true"]
      );
      editor.renderCustomizationMigrationPage();
      const rerenderedContainers = [...editor.migrationListContainer.querySelectorAll(".prompt-migration-group-items")];
      assert.deepStrictEqual(rerenderedContainers.map((container) => container.style.display), ["none", ""]);
    } finally {
      editor.migrationListContainer.remove();
      editor.migrationPageDisposables.dispose();
      editor.editorPreviewDisposables.dispose();
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFpQ3VzdG9taXphdGlvblxcYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJTWFuYWdlZEhvdmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9yLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0UGF0aCwgUHJvbXB0c1N0b3JhZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhlYWRlckF0dHJpYnV0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0RmlsZVBhcnNlci5qcyc7XG5pbXBvcnQgeyBQcm9tcHRGaWxlU291cmNlLCBQcm9tcHRzVHlwZSwgVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbiwgQUlDdXN0b21pemF0aW9uU291cmNlcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9haUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeUlkIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vY3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHR5cGUgeyBJQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3J5U3VtbWFyeSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbldlbGNvbWVQYWdlLmpzJztcblxuc3VpdGUoJ2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3InLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHR5cGUgVGVzdGFibGVFZGl0b3IgPSB7XG5cdFx0Y3VycmVudEVkaXRpbmdQcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSB8IHVuZGVmaW5lZDtcblx0XHRjdXJyZW50RWRpdGluZ1NvdXJjZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGN1cnJlbnRFZGl0aW5nUmVhZE9ubHk6IGJvb2xlYW47XG5cdFx0Y3VzdG9taXphdGlvbnNCeU1pZ3JhdGlvbkNhdGVnb3J5OiBNYXA8Q3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3J5SWQsIHJlYWRvbmx5IElQcm9tcHRQYXRoW10+O1xuXHRcdGFjdGl2ZU1pZ3JhdGlvbkNhdGVnb3J5SWQ6IEN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeUlkIHwgdW5kZWZpbmVkO1xuXHRcdGVkaXRvckRpc3BsYXlNb2RlOiAncHJldmlldycgfCAncmF3Jztcblx0XHRlZGl0b3JQcmV2aWV3RnJvbnRNYXR0ZXJDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRcdGVkaXRvclByZXZpZXdEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRcdGVkaXRvclByZXZpZXdSZW5kZXJTY2hlZHVsZXI6IHsgY2FuY2VsKCk6IHZvaWQ7IHNjaGVkdWxlKCk6IHZvaWQgfTtcblx0XHR2aWV3TW9kZTogJ2xpc3QnIHwgJ21pZ3JhdGlvbicgfCAnZWRpdG9yJyB8ICdtY3BEZXRhaWwnIHwgJ3BsdWdpbkRldGFpbCcgfCAndG9vbHNEZXRhaWwnO1xuXHRcdGRpbWVuc2lvbjogdW5kZWZpbmVkO1xuXHRcdGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRcdG1pZ3JhdGlvbkxpc3RDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRcdG1pZ3JhdGlvbk1pZ3JhdGVCdXR0b246IHsgZW5hYmxlZDogYm9vbGVhbjsgbGFiZWw6IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRcdG1pZ3JhdGlvblRpdGxlRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdFx0bWlncmF0aW9uRGVzY3JpcHRpb25FbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0XHRtaWdyYXRpb25CYW5uZXJDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRcdG1pZ3JhdGlvbkxpbmtFbGVtZW50OiBIVE1MQW5jaG9yRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0XHRtaWdyYXRpb25TZWFyY2hRdWVyeTogc3RyaW5nO1xuXHRcdHNlbGVjdGVkQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkl0ZW1zOiBSZXNvdXJjZU1hcDxTZXQ8UHJvbXB0c1N0b3JhZ2U+Pjtcblx0XHRjb2xsYXBzZWRDdXN0b21pemF0aW9uTWlncmF0aW9uR3JvdXBzOiBTZXQ8c3RyaW5nPjtcblx0XHRtaWdyYXRpb25QYWdlRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0XHRsYWJlbFNlcnZpY2U6IHsgZ2V0VXJpTGFiZWwodXJpOiBVUkksIG9wdGlvbnM/OiB7IHJlbGF0aXZlPzogYm9vbGVhbiB9KTogc3RyaW5nIH07XG5cdFx0c2hvd0VtYmVkZGVkRWRpdG9yKC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD47XG5cdFx0Z2V0QWN0aXZlSGFybmVzc0xhYmVsKCk6IHN0cmluZztcblx0XHR3ZWxjb21lUGFnZTogeyBzZXRNaWdyYXRpb25DYXRlZ29yaWVzKGNhdGVnb3JpZXM6IHJlYWRvbmx5IHVua25vd25bXSk6IHZvaWQgfSB8IHVuZGVmaW5lZDtcblx0XHRzZWxlY3RlZFNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnRyaWJ1dGVkU2VjdGlvbkNvbnRhaW5lcnM6IE1hcDxBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbiwgSFRNTEVsZW1lbnQ+O1xuXHRcdGdldEVkaXRvck1vZGVCdXR0b25MYWJlbCgpOiBzdHJpbmc7XG5cdFx0Z2V0RWRpdG9yTW9kZUJ1dHRvblRvb2x0aXAoKTogc3RyaW5nO1xuXHRcdHJlbmRlclByZXZpZXdBdHRyaWJ1dGUoYXR0cmlidXRlOiBJSGVhZGVyQXR0cmlidXRlLCBwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSwgdGFyZ2V0OiBUYXJnZXQpOiB2b2lkO1xuXHRcdG9uU3RydWN0dXJlZFByZXZpZXdTZXR0aW5nQ2hhbmdlZCgpOiB2b2lkO1xuXHRcdHJlZnJlc2hDdXN0b21pemF0aW9uTWlncmF0aW9uVWkoKTogdm9pZDtcblx0XHRyZW5kZXJDdXN0b21pemF0aW9uTWlncmF0aW9uUGFnZSgpOiB2b2lkO1xuXHRcdHNldEN1c3RvbWl6YXRpb25zVG9NaWdyYXRlKGNhbmRpZGF0ZXM6IE1hcDxDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnlJZCwgcmVhZG9ubHkgSVByb21wdFBhdGhbXT4pOiB2b2lkO1xuXHRcdGlzQ3VzdG9taXphdGlvblNlbGVjdGVkRm9yTWlncmF0aW9uKGN1c3RvbWl6YXRpb246IElQcm9tcHRQYXRoKTogYm9vbGVhbjtcblx0XHRzZXRDdXN0b21pemF0aW9uU2VsZWN0ZWRGb3JNaWdyYXRpb24oY3VzdG9taXphdGlvbjogSVByb21wdFBhdGgsIHNlbGVjdGVkOiBib29sZWFuKTogdm9pZDtcblx0XHR1cGRhdGVDb250ZW50VmlzaWJpbGl0eSgpOiB2b2lkO1xuXHRcdHNldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQ7XG5cdH07XG5cblx0ZnVuY3Rpb24gY3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2VTdHViKHZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fSk6IElDb25maWd1cmF0aW9uU2VydmljZSB7XG5cdFx0Ly8gRGVmYXVsdCB0byBlbmFibGluZyB0aGUgc3RydWN0dXJlZCBwcmV2aWV3IHNvIGV4aXN0aW5nIGFzc2VydGlvbnMgZXhlcmNpc2UgdGhlIHByZXZpZXcgcGF0aC5cblx0XHRjb25zdCBtZXJnZWQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge1xuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkNoYXRDdXN0b21pemF0aW9uc1N0cnVjdHVyZWRQcmV2aWV3RW5hYmxlZF06IHRydWUsXG5cdFx0XHQuLi52YWx1ZXMsXG5cdFx0fTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0VmFsdWU6IChrZXk6IHN0cmluZykgPT4gbWVyZ2VkW2tleV0sXG5cdFx0XHRzZXRWYWx1ZTogKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bikgPT4geyBtZXJnZWRba2V5XSA9IHZhbHVlOyB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ29uZmlndXJhdGlvblNlcnZpY2UgJiB7IHNldFZhbHVlKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IHZvaWQgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVRlc3RFZGl0b3IoaG92ZXJTZXJ2aWNlPzogSUhvdmVyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2U/OiBJQ29uZmlndXJhdGlvblNlcnZpY2UpOiBUZXN0YWJsZUVkaXRvciB7XG5cdFx0Y29uc3QgZWRpdG9yID0gT2JqZWN0LmNyZWF0ZShBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9yLnByb3RvdHlwZSkgYXMgdW5rbm93biBhcyBUZXN0YWJsZUVkaXRvcjtcblx0XHRlZGl0b3IuY3VycmVudEVkaXRpbmdQcm9tcHRUeXBlID0gdW5kZWZpbmVkO1xuXHRcdGVkaXRvci5jdXJyZW50RWRpdGluZ1NvdXJjZSA9IHVuZGVmaW5lZDtcblx0XHRlZGl0b3IuY3VycmVudEVkaXRpbmdSZWFkT25seSA9IGZhbHNlO1xuXHRcdGVkaXRvci5jdXN0b21pemF0aW9uc0J5TWlncmF0aW9uQ2F0ZWdvcnkgPSBuZXcgTWFwKCk7XG5cdFx0ZWRpdG9yLmFjdGl2ZU1pZ3JhdGlvbkNhdGVnb3J5SWQgPSB1bmRlZmluZWQ7XG5cdFx0ZWRpdG9yLmVkaXRvckRpc3BsYXlNb2RlID0gJ3ByZXZpZXcnO1xuXHRcdGVkaXRvci5lZGl0b3JQcmV2aWV3RnJvbnRNYXR0ZXJDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRlZGl0b3IuZWRpdG9yUHJldmlld0Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGVkaXRvci5ob3ZlclNlcnZpY2UgPSBob3ZlclNlcnZpY2UgPz8ge1xuXHRcdFx0c2V0dXBNYW5hZ2VkSG92ZXI6ICgpID0+ICh7XG5cdFx0XHRcdGRpc3Bvc2UoKSB7IH0sXG5cdFx0XHRcdHNob3coKSB7IH0sXG5cdFx0XHRcdGhpZGUoKSB7IH0sXG5cdFx0XHRcdHVwZGF0ZSgpIHsgfSxcblx0XHRcdH0pLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJSG92ZXJTZXJ2aWNlO1xuXHRcdGVkaXRvci5jb25maWd1cmF0aW9uU2VydmljZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID8/IGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlU3R1YigpO1xuXHRcdGVkaXRvci5taWdyYXRpb25MaXN0Q29udGFpbmVyID0gdW5kZWZpbmVkO1xuXHRcdGVkaXRvci5taWdyYXRpb25NaWdyYXRlQnV0dG9uID0gdW5kZWZpbmVkO1xuXHRcdGVkaXRvci5taWdyYXRpb25UaXRsZUVsZW1lbnQgPSB1bmRlZmluZWQ7XG5cdFx0ZWRpdG9yLm1pZ3JhdGlvbkRlc2NyaXB0aW9uRWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHRlZGl0b3IubWlncmF0aW9uQmFubmVyQ29udGFpbmVyID0gdW5kZWZpbmVkO1xuXHRcdGVkaXRvci5taWdyYXRpb25MaW5rRWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHRlZGl0b3IubWlncmF0aW9uU2VhcmNoUXVlcnkgPSAnJztcblx0XHRlZGl0b3Iuc2VsZWN0ZWRDdXN0b21pemF0aW9uTWlncmF0aW9uSXRlbXMgPSBuZXcgUmVzb3VyY2VNYXAoKTtcblx0XHRlZGl0b3IuY29sbGFwc2VkQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkdyb3VwcyA9IG5ldyBTZXQoKTtcblx0XHRlZGl0b3IubWlncmF0aW9uUGFnZURpc3Bvc2FibGVzID0gZWRpdG9yLmVkaXRvclByZXZpZXdEaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRlZGl0b3IubGFiZWxTZXJ2aWNlID0ge1xuXHRcdFx0Z2V0VXJpTGFiZWw6IHVyaSA9PiB1cmkucGF0aCxcblx0XHR9O1xuXHRcdGVkaXRvci5zaG93RW1iZWRkZWRFZGl0b3IgPSBhc3luYyAoKSA9PiB7IH07XG5cdFx0ZWRpdG9yLmdldEFjdGl2ZUhhcm5lc3NMYWJlbCA9ICgpID0+ICdDb3BpbG90IFtBZ2VudCBIb3N0XSc7XG5cdFx0ZWRpdG9yLndlbGNvbWVQYWdlID0gdW5kZWZpbmVkO1xuXHRcdGVkaXRvci5jb250cmlidXRlZFNlY3Rpb25Db250YWluZXJzID0gbmV3IE1hcCgpO1xuXHRcdGVkaXRvci5lZGl0b3JQcmV2aWV3UmVuZGVyU2NoZWR1bGVyID0ge1xuXHRcdFx0Y2FuY2VsKCk6IHZvaWQgeyB9LFxuXHRcdFx0c2NoZWR1bGUoKTogdm9pZCB7IH0sXG5cdFx0fTtcblx0XHRlZGl0b3Iudmlld01vZGUgPSAnbGlzdCc7XG5cdFx0ZWRpdG9yLmRpbWVuc2lvbiA9IHVuZGVmaW5lZDtcblx0XHRlZGl0b3Iuc2VsZWN0ZWRTZWN0aW9uID0gdW5kZWZpbmVkO1xuXHRcdGVkaXRvci5zZXRWaXNpYmxlKGZhbHNlKTtcblx0XHRyZXR1cm4gZWRpdG9yO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2NhbGFyQXR0cmlidXRlKGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogSUhlYWRlckF0dHJpYnV0ZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtleSxcblx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwga2V5Lmxlbmd0aCArIHZhbHVlLmxlbmd0aCArIDEpLFxuXHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0XHRcdHZhbHVlLFxuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIHZhbHVlLmxlbmd0aCArIDEpLFxuXHRcdFx0XHRmb3JtYXQ6ICdkb3VibGUnLFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgndXNlcyBlZGl0IGNvcHkgZm9yIGJ1aWx0LWluIHNraWxscyB0aGF0IHN1cHBvcnQgcmF3IG92ZXJyaWRlcycsICgpID0+IHtcblx0XHRjb25zdCBlZGl0b3IgPSBjcmVhdGVUZXN0RWRpdG9yKCk7XG5cdFx0ZWRpdG9yLmN1cnJlbnRFZGl0aW5nUHJvbXB0VHlwZSA9IFByb21wdHNUeXBlLnNraWxsO1xuXHRcdGVkaXRvci5jdXJyZW50RWRpdGluZ1NvdXJjZSA9IEFJQ3VzdG9taXphdGlvblNvdXJjZXMuYnVpbHRpbjtcblx0XHRlZGl0b3IuY3VycmVudEVkaXRpbmdSZWFkT25seSA9IHRydWU7XG5cdFx0ZWRpdG9yLmVkaXRvckRpc3BsYXlNb2RlID0gJ3ByZXZpZXcnO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRFZGl0b3JNb2RlQnV0dG9uTGFiZWwoKSwgJ0VkaXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldEVkaXRvck1vZGVCdXR0b25Ub29sdGlwKCksICdFZGl0IHRoZSByYXcgbWFya2Rvd24gZmlsZScpO1xuXG5cdFx0ZWRpdG9yLmVkaXRvclByZXZpZXdEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgdmlldy1yYXcgY29weSBmb3IgdHJ1ZSByZWFkLW9ubHkgZXh0ZW5zaW9uIGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yID0gY3JlYXRlVGVzdEVkaXRvcigpO1xuXHRcdGVkaXRvci5jdXJyZW50RWRpdGluZ1Byb21wdFR5cGUgPSBQcm9tcHRzVHlwZS5hZ2VudDtcblx0XHRlZGl0b3IuY3VycmVudEVkaXRpbmdTb3VyY2UgPSBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmV4dGVuc2lvbjtcblx0XHRlZGl0b3IuY3VycmVudEVkaXRpbmdSZWFkT25seSA9IHRydWU7XG5cdFx0ZWRpdG9yLmVkaXRvckRpc3BsYXlNb2RlID0gJ3ByZXZpZXcnO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRFZGl0b3JNb2RlQnV0dG9uTGFiZWwoKSwgJ1ZpZXcgUmF3Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRFZGl0b3JNb2RlQnV0dG9uVG9vbHRpcCgpLCAnU2hvdyB0aGUgcmF3IG1hcmtkb3duIGZpbGUnKTtcblxuXHRcdGVkaXRvci5lZGl0b3JQcmV2aWV3RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGlja2luZyBhIHByZXZpZXcgZmllbGQgaGVscCBidXR0b24gb3BlbnMgdGhlIG1hbmFnZWQgaG92ZXIgd2l0aCBmb2N1cycsICgpID0+IHtcblx0XHRsZXQgZm9jdXNlZDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBob3ZlclNlcnZpY2UgPSB7XG5cdFx0XHRzZXR1cE1hbmFnZWRIb3ZlcjogKCk6IElNYW5hZ2VkSG92ZXIgPT4gKHtcblx0XHRcdFx0ZGlzcG9zZSgpIHsgfSxcblx0XHRcdFx0c2hvdyhmb2N1cz86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRcdFx0XHRmb2N1c2VkID0gZm9jdXM7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGhpZGUoKTogdm9pZCB7IH0sXG5cdFx0XHRcdHVwZGF0ZSgpOiB2b2lkIHsgfSxcblx0XHRcdH0pLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJSG92ZXJTZXJ2aWNlO1xuXHRcdGNvbnN0IGVkaXRvciA9IGNyZWF0ZVRlc3RFZGl0b3IoaG92ZXJTZXJ2aWNlKTtcblx0XHRjb25zdCBjb250YWluZXIgPSBlZGl0b3IuZWRpdG9yUHJldmlld0Zyb250TWF0dGVyQ29udGFpbmVyITtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cblx0XHR0cnkge1xuXHRcdFx0ZWRpdG9yLnJlbmRlclByZXZpZXdBdHRyaWJ1dGUoY3JlYXRlU2NhbGFyQXR0cmlidXRlKCdkZXNjcmlwdGlvbicsICdIZWxwZnVsIHRleHQnKSwgUHJvbXB0c1R5cGUuYWdlbnQsIFRhcmdldC5WU0NvZGUpO1xuXG5cdFx0XHRjb25zdCBoZWxwQnV0dG9uID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvbi5lZGl0b3ItcHJldmlldy1yb3ctaGVscCcpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcblx0XHRcdGFzc2VydC5vayhoZWxwQnV0dG9uKTtcblxuXHRcdFx0aGVscEJ1dHRvbi5jbGljaygpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9jdXNlZCwgdHJ1ZSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNvbnRhaW5lci5yZW1vdmUoKTtcblx0XHRcdGVkaXRvci5lZGl0b3JQcmV2aWV3RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnaGlkZXMgcHJldmlldyBidXR0b24gd2hlbiBzdHJ1Y3R1cmVkIHByZXZpZXcgc2V0dGluZyBpcyBkaXNhYmxlZCcsICgpID0+IHtcblx0XHRjb25zdCBlZGl0b3IgPSBjcmVhdGVUZXN0RWRpdG9yKHVuZGVmaW5lZCwgY3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2VTdHViKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5DaGF0Q3VzdG9taXphdGlvbnNTdHJ1Y3R1cmVkUHJldmlld0VuYWJsZWRdOiBmYWxzZSxcblx0XHR9KSk7XG5cdFx0ZWRpdG9yLmN1cnJlbnRFZGl0aW5nUHJvbXB0VHlwZSA9IFByb21wdHNUeXBlLmFnZW50O1xuXHRcdGVkaXRvci5jdXJyZW50RWRpdGluZ1NvdXJjZSA9IEFJQ3VzdG9taXphdGlvblNvdXJjZXMuYnVpbHRpbjtcblx0XHRlZGl0b3IuY3VycmVudEVkaXRpbmdSZWFkT25seSA9IGZhbHNlO1xuXHRcdGVkaXRvci5lZGl0b3JEaXNwbGF5TW9kZSA9ICdwcmV2aWV3JztcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0RWRpdG9yTW9kZUJ1dHRvbkxhYmVsKCksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldEVkaXRvck1vZGVCdXR0b25Ub29sdGlwKCksICcnKTtcblxuXHRcdGVkaXRvci5lZGl0b3JQcmV2aWV3RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNhYmxpbmcgdGhlIHNldHRpbmcgYXQgcnVudGltZSBmb3JjZXMgdGhlIGVkaXRvciBiYWNrIHRvIHJhdyBtb2RlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gY3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2VTdHViKCkgYXMgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlICYgeyBzZXRWYWx1ZShrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pOiB2b2lkIH07XG5cdFx0Y29uc3QgZWRpdG9yID0gY3JlYXRlVGVzdEVkaXRvcih1bmRlZmluZWQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRlZGl0b3Iudmlld01vZGUgPSAnZWRpdG9yJztcblx0XHRlZGl0b3IuY3VycmVudEVkaXRpbmdQcm9tcHRUeXBlID0gUHJvbXB0c1R5cGUuYWdlbnQ7XG5cdFx0ZWRpdG9yLmVkaXRvckRpc3BsYXlNb2RlID0gJ3ByZXZpZXcnO1xuXG5cdFx0Ly8gU2FuaXR5OiBzZXR0aW5nIGlzIG9uIGFuZCBmaWxlIGlzIGVkaXRhYmxlLCBzbyBsYWJlbCBpcyBcIkVkaXRcIiAocHJldmlldyBtb2RlKS5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldEVkaXRvck1vZGVCdXR0b25MYWJlbCgpLCAnRWRpdCcpO1xuXG5cdFx0Ly8gRmxpcCB0aGUgc2V0dGluZyBvZmYgYW5kIHJ1biB0aGUgY2hhbmdlIGhhbmRsZXIuXG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VmFsdWUoQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdEN1c3RvbWl6YXRpb25zU3RydWN0dXJlZFByZXZpZXdFbmFibGVkLCBmYWxzZSk7XG5cdFx0ZWRpdG9yLm9uU3RydWN0dXJlZFByZXZpZXdTZXR0aW5nQ2hhbmdlZCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5lZGl0b3JEaXNwbGF5TW9kZSwgJ3JhdycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0RWRpdG9yTW9kZUJ1dHRvbkxhYmVsKCksICcnKTtcblxuXHRcdGVkaXRvci5lZGl0b3JQcmV2aWV3RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdnYXRlcyBlYWNoIG1pZ3JhdGlvbiBjYXRlZ29yeSBvbiBpdHMgb3duIGV4cGVyaW1lbnRhbCBzZXR0aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdlbGNvbWVQYWdlQ2FsbHM6IElDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnlTdW1tYXJ5W11bXSA9IFtdO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gY3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2VTdHViKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5DaGF0Q3VzdG9taXphdGlvbnNQcm9tcHRNaWdyYXRpb25FbmFibGVkXTogZmFsc2UsXG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdEN1c3RvbWl6YXRpb25zVXNlckRhdGFNaWdyYXRpb25FbmFibGVkXTogZmFsc2UsXG5cdFx0fSkgYXMgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlICYgeyBzZXRWYWx1ZShrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pOiB2b2lkIH07XG5cdFx0Y29uc3QgZWRpdG9yID0gY3JlYXRlVGVzdEVkaXRvcih1bmRlZmluZWQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRlZGl0b3IuY3VzdG9taXphdGlvbnNCeU1pZ3JhdGlvbkNhdGVnb3J5ID0gbmV3IE1hcChbXG5cdFx0XHRbQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3J5SWQuUHJvbXB0RmlsZXMsIFt7XG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9wcm9tcHRzL3Byb21wdC5wcm9tcHQubWQnKSxcblx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLnByb21wdCxcblx0XHRcdFx0c291cmNlOiBQcm9tcHRGaWxlU291cmNlLkdpdEh1YldvcmtzcGFjZSxcblx0XHRcdH0gYXMgSVByb21wdFBhdGhdXSxcblx0XHRcdFtDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnlJZC5Vc2VyRGF0YSwgW3tcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL3VzZXItZGF0YS9wcm9tcHRzL2xlZ2FjeS5hZ2VudC5tZCcpLFxuXHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLFxuXHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5hZ2VudCxcblx0XHRcdFx0c291cmNlOiBQcm9tcHRGaWxlU291cmNlLlVzZXJEYXRhLFxuXHRcdFx0fSBhcyBJUHJvbXB0UGF0aF1dLFxuXHRcdF0pO1xuXHRcdGVkaXRvci53ZWxjb21lUGFnZSA9IHtcblx0XHRcdHNldE1pZ3JhdGlvbkNhdGVnb3JpZXM6IGNhdGVnb3JpZXMgPT4gd2VsY29tZVBhZ2VDYWxscy5wdXNoKFsuLi5jYXRlZ29yaWVzIGFzIHJlYWRvbmx5IElDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnlTdW1tYXJ5W11dKSxcblx0XHR9O1xuXG5cdFx0ZWRpdG9yLnJlZnJlc2hDdXN0b21pemF0aW9uTWlncmF0aW9uVWkoKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRWYWx1ZShDaGF0Q29uZmlndXJhdGlvbi5DaGF0Q3VzdG9taXphdGlvbnNVc2VyRGF0YU1pZ3JhdGlvbkVuYWJsZWQsIHRydWUpO1xuXHRcdGVkaXRvci5yZWZyZXNoQ3VzdG9taXphdGlvbk1pZ3JhdGlvblVpKCk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VmFsdWUoQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdEN1c3RvbWl6YXRpb25zUHJvbXB0TWlncmF0aW9uRW5hYmxlZCwgdHJ1ZSk7XG5cdFx0ZWRpdG9yLnJlZnJlc2hDdXN0b21pemF0aW9uTWlncmF0aW9uVWkoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwod2VsY29tZVBhZ2VDYWxscy5tYXAoY2F0ZWdvcmllcyA9PiBjYXRlZ29yaWVzLm1hcChjYXRlZ29yeSA9PiBjYXRlZ29yeS5pZCkpLCBbXG5cdFx0XHRbXSxcblx0XHRcdFtDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnlJZC5Vc2VyRGF0YV0sXG5cdFx0XHRbQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3J5SWQuUHJvbXB0RmlsZXMsIEN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeUlkLlVzZXJEYXRhXSxcblx0XHRdKTtcblx0XHRlZGl0b3IuZWRpdG9yUHJldmlld0Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndHJhY2tzIG1pZ3JhdGlvbiBzZWxlY3Rpb24gYnkgVVJJIGFuZCBzdG9yYWdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGVkaXRvciA9IGNyZWF0ZVRlc3RFZGl0b3IodW5kZWZpbmVkLCBjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZVN0dWIoe1xuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkNoYXRDdXN0b21pemF0aW9uc1Byb21wdE1pZ3JhdGlvbkVuYWJsZWRdOiB0cnVlLFxuXHRcdH0pKTtcblx0XHRjb25zdCBzaGFyZWRVcmkgPSBVUkkuZmlsZSgnL2hvbWUvdXNlci9zaGFyZWQucHJvbXB0Lm1kJyk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlUHJvbXB0OiBJUHJvbXB0UGF0aCA9IHtcblx0XHRcdHVyaTogc2hhcmVkVXJpLFxuXHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsXG5cdFx0XHRzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuQ29uZmlnV29ya3NwYWNlLFxuXHRcdH07XG5cdFx0Y29uc3QgdXNlclByb21wdDogSVByb21wdFBhdGggPSB7XG5cdFx0XHR1cmk6IHNoYXJlZFVyaSxcblx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsXG5cdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsXG5cdFx0XHRzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuQ29uZmlnUGVyc29uYWwsXG5cdFx0fTtcblx0XHRjb25zdCBjYW5kaWRhdGVzID0gbmV3IE1hcDxDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnlJZCwgcmVhZG9ubHkgSVByb21wdFBhdGhbXT4oW1xuXHRcdFx0W0N1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeUlkLlByb21wdEZpbGVzLCBbd29ya3NwYWNlUHJvbXB0LCB1c2VyUHJvbXB0XV0sXG5cdFx0XSk7XG5cblx0XHRlZGl0b3Iuc2V0Q3VzdG9taXphdGlvbnNUb01pZ3JhdGUoY2FuZGlkYXRlcyk7XG5cdFx0ZWRpdG9yLnNldEN1c3RvbWl6YXRpb25TZWxlY3RlZEZvck1pZ3JhdGlvbih3b3Jrc3BhY2VQcm9tcHQsIGZhbHNlKTtcblx0XHRlZGl0b3Iuc2V0Q3VzdG9taXphdGlvbnNUb01pZ3JhdGUoY2FuZGlkYXRlcyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHdvcmtzcGFjZVNlbGVjdGVkOiBlZGl0b3IuaXNDdXN0b21pemF0aW9uU2VsZWN0ZWRGb3JNaWdyYXRpb24od29ya3NwYWNlUHJvbXB0KSxcblx0XHRcdHVzZXJTZWxlY3RlZDogZWRpdG9yLmlzQ3VzdG9taXphdGlvblNlbGVjdGVkRm9yTWlncmF0aW9uKHVzZXJQcm9tcHQpLFxuXHRcdFx0c2VsZWN0ZWRTdG9yYWdlczogWy4uLihlZGl0b3Iuc2VsZWN0ZWRDdXN0b21pemF0aW9uTWlncmF0aW9uSXRlbXMuZ2V0KHNoYXJlZFVyaSkgPz8gW10pXSxcblx0XHR9LCB7XG5cdFx0XHR3b3Jrc3BhY2VTZWxlY3RlZDogZmFsc2UsXG5cdFx0XHR1c2VyU2VsZWN0ZWQ6IHRydWUsXG5cdFx0XHRzZWxlY3RlZFN0b3JhZ2VzOiBbUHJvbXB0c1N0b3JhZ2UudXNlcl0sXG5cdFx0fSk7XG5cdFx0ZWRpdG9yLmVkaXRvclByZXZpZXdEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXIgZGF0YSBtaWdyYXRpb24gYmFubmVyIHN0YXRlcyB0aGUgU2V0dGluZ3MgU3luYyB0cmFkZS1vZmYgYW5kIHJlcGxhY2VzIHRoZSBkZXNjcmlwdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBlZGl0b3IgPSBjcmVhdGVUZXN0RWRpdG9yKHVuZGVmaW5lZCwgY3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2VTdHViKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5DaGF0Q3VzdG9taXphdGlvbnNVc2VyRGF0YU1pZ3JhdGlvbkVuYWJsZWRdOiB0cnVlLFxuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkNoYXRDdXN0b21pemF0aW9uc1Byb21wdE1pZ3JhdGlvbkVuYWJsZWRdOiB0cnVlLFxuXHRcdH0pKTtcblx0XHRjb25zdCB1c2VyRGF0YUN1c3RvbWl6YXRpb25zID0gW1xuXHRcdFx0e1xuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvdXNlci1kYXRhL3Byb21wdHMvbGVnYWN5LmFnZW50Lm1kJyksXG5cdFx0XHRcdG5hbWU6ICdsZWdhY3kuYWdlbnQubWQnLFxuXHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLFxuXHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5hZ2VudCxcblx0XHRcdFx0c291cmNlOiBQcm9tcHRGaWxlU291cmNlLlVzZXJEYXRhLFxuXHRcdFx0fSBhcyBJUHJvbXB0UGF0aCxcblx0XHRcdHtcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL3VzZXItZGF0YS9wcm9tcHRzL3N0eWxlLmluc3RydWN0aW9ucy5tZCcpLFxuXHRcdFx0XHRuYW1lOiAnc3R5bGUuaW5zdHJ1Y3Rpb25zLm1kJyxcblx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlcixcblx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuVXNlckRhdGEsXG5cdFx0XHR9IGFzIElQcm9tcHRQYXRoLFxuXHRcdF07XG5cdFx0Y29uc3QgcHJvbXB0RmlsZXMgPSBbXG5cdFx0XHR7XG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9wcm9tcHRzL3Jldmlldy5wcm9tcHQubWQnKSxcblx0XHRcdFx0bmFtZTogJ3Jldmlldy5wcm9tcHQubWQnLFxuXHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCxcblx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUucHJvbXB0LFxuXHRcdFx0XHRzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuR2l0SHViV29ya3NwYWNlLFxuXHRcdFx0fSBhcyBJUHJvbXB0UGF0aCxcblx0XHRdO1xuXHRcdGVkaXRvci5jdXN0b21pemF0aW9uc0J5TWlncmF0aW9uQ2F0ZWdvcnkgPSBuZXcgTWFwKFtcblx0XHRcdFtDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnlJZC5Vc2VyRGF0YSwgdXNlckRhdGFDdXN0b21pemF0aW9uc10sXG5cdFx0XHRbQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3J5SWQuUHJvbXB0RmlsZXMsIHByb21wdEZpbGVzXSxcblx0XHRdKTtcblx0XHRlZGl0b3Iuc2VsZWN0ZWRDdXN0b21pemF0aW9uTWlncmF0aW9uSXRlbXMgPSBuZXcgUmVzb3VyY2VNYXAoKTtcblx0XHRlZGl0b3IubWlncmF0aW9uTGlzdENvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGVkaXRvci5taWdyYXRpb25UaXRsZUVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdoMicpO1xuXHRcdGVkaXRvci5taWdyYXRpb25EZXNjcmlwdGlvbkVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJyk7XG5cdFx0ZWRpdG9yLm1pZ3JhdGlvbkJhbm5lckNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGVkaXRvci5taWdyYXRpb25MaW5rRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcblx0XHRlZGl0b3IubWlncmF0aW9uTWlncmF0ZUJ1dHRvbiA9IHsgZW5hYmxlZDogZmFsc2UsIGxhYmVsOiAnJyB9O1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZWRpdG9yLm1pZ3JhdGlvbkxpc3RDb250YWluZXIpO1xuXG5cdFx0Y29uc3QgcmVhZEJhbm5lciA9ICgpID0+ICh7XG5cdFx0XHR0aXRsZTogZWRpdG9yLm1pZ3JhdGlvbkJhbm5lckNvbnRhaW5lciEucXVlcnlTZWxlY3RvcignLmN1c3RvbWl6YXRpb24tbWlncmF0aW9uLWJhbm5lci10aXRsZScpPy50ZXh0Q29udGVudCA/PyAnJyxcblx0XHRcdGNvbnNlcXVlbmNlTWVudGlvbnNTeW5jOiAoZWRpdG9yLm1pZ3JhdGlvbkJhbm5lckNvbnRhaW5lciEucXVlcnlTZWxlY3RvcignLmN1c3RvbWl6YXRpb24tbWlncmF0aW9uLWJhbm5lci1jb25zZXF1ZW5jZScpPy50ZXh0Q29udGVudCA/PyAnJykuaW5jbHVkZXMoJ1NldHRpbmdzIFN5bmMnKSxcblx0XHRcdGJhbm5lckhpZGRlbjogZWRpdG9yLm1pZ3JhdGlvbkJhbm5lckNvbnRhaW5lciEuc3R5bGUuZGlzcGxheSA9PT0gJ25vbmUnLFxuXHRcdFx0ZGVzY3JpcHRpb25IaWRkZW46IGVkaXRvci5taWdyYXRpb25EZXNjcmlwdGlvbkVsZW1lbnQhLnN0eWxlLmRpc3BsYXkgPT09ICdub25lJyxcblx0XHR9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRlZGl0b3IuYWN0aXZlTWlncmF0aW9uQ2F0ZWdvcnlJZCA9IEN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeUlkLlVzZXJEYXRhO1xuXHRcdFx0ZWRpdG9yLnJlbmRlckN1c3RvbWl6YXRpb25NaWdyYXRpb25QYWdlKCk7XG5cdFx0XHRjb25zdCB1c2VyRGF0YSA9IHJlYWRCYW5uZXIoKTtcblxuXHRcdFx0Ly8gVGhlIHByb21wdC1maWxlIG1pZ3JhdGlvbiBrZWVwcyBpdHMgcGxhaW4gZGVzY3JpcHRpb24sIHdpdGggbm8gYmFubmVyLlxuXHRcdFx0ZWRpdG9yLmFjdGl2ZU1pZ3JhdGlvbkNhdGVnb3J5SWQgPSBDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnlJZC5Qcm9tcHRGaWxlcztcblx0XHRcdGVkaXRvci5yZW5kZXJDdXN0b21pemF0aW9uTWlncmF0aW9uUGFnZSgpO1xuXHRcdFx0Y29uc3QgcHJvbXB0cyA9IHJlYWRCYW5uZXIoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHVzZXJEYXRhLCBwcm9tcHRzIH0sIHtcblx0XHRcdFx0dXNlckRhdGE6IHtcblx0XHRcdFx0XHR0aXRsZTogJzIgY3VzdG9taXphdGlvbnMgYXJlIG5vdCBhdmFpbGFibGUgdG8gQ29waWxvdCBbQWdlbnQgSG9zdF0nLFxuXHRcdFx0XHRcdGNvbnNlcXVlbmNlTWVudGlvbnNTeW5jOiB0cnVlLFxuXHRcdFx0XHRcdGJhbm5lckhpZGRlbjogZmFsc2UsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb25IaWRkZW46IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHByb21wdHM6IHtcblx0XHRcdFx0XHR0aXRsZTogJycsXG5cdFx0XHRcdFx0Y29uc2VxdWVuY2VNZW50aW9uc1N5bmM6IGZhbHNlLFxuXHRcdFx0XHRcdGJhbm5lckhpZGRlbjogdHJ1ZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbkhpZGRlbjogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0ZWRpdG9yLm1pZ3JhdGlvbkxpc3RDb250YWluZXIucmVtb3ZlKCk7XG5cdFx0XHRlZGl0b3IubWlncmF0aW9uUGFnZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdGVkaXRvci5lZGl0b3JQcmV2aWV3RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnb3BlbnMgYSBtaWdyYXRpb24gY2FuZGlkYXRlIHRocm91Z2ggdGhlIHNoYXJlZCBCdXR0b24gd2lkZ2V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGVkaXRvciA9IGNyZWF0ZVRlc3RFZGl0b3IodW5kZWZpbmVkLCBjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZVN0dWIoe1xuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkNoYXRDdXN0b21pemF0aW9uc1Byb21wdE1pZ3JhdGlvbkVuYWJsZWRdOiB0cnVlLFxuXHRcdH0pKTtcblx0XHRjb25zdCBwcm9tcHRGaWxlOiBJUHJvbXB0UGF0aCA9IHtcblx0XHRcdHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9wcm9tcHRzL3Jldmlldy5wcm9tcHQubWQnKSxcblx0XHRcdG5hbWU6ICdSZXZpZXcnLFxuXHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsXG5cdFx0XHRzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuR2l0SHViV29ya3NwYWNlLFxuXHRcdH07XG5cdFx0Y29uc3Qgb3BlbmVkSXRlbXM6IHVua25vd25bXVtdID0gW107XG5cdFx0ZWRpdG9yLnNob3dFbWJlZGRlZEVkaXRvciA9IGFzeW5jICguLi5hcmdzOiB1bmtub3duW10pID0+IHsgb3BlbmVkSXRlbXMucHVzaChhcmdzKTsgfTtcblx0XHRlZGl0b3IuY3VzdG9taXphdGlvbnNCeU1pZ3JhdGlvbkNhdGVnb3J5ID0gbmV3IE1hcChbW0N1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeUlkLlByb21wdEZpbGVzLCBbcHJvbXB0RmlsZV1dXSk7XG5cdFx0ZWRpdG9yLmFjdGl2ZU1pZ3JhdGlvbkNhdGVnb3J5SWQgPSBDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnlJZC5Qcm9tcHRGaWxlcztcblx0XHRlZGl0b3IubWlncmF0aW9uTGlzdENvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGVkaXRvci5taWdyYXRpb25NaWdyYXRlQnV0dG9uID0geyBlbmFibGVkOiBmYWxzZSwgbGFiZWw6ICcnIH07XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChlZGl0b3IubWlncmF0aW9uTGlzdENvbnRhaW5lcik7XG5cblx0XHR0cnkge1xuXHRcdFx0ZWRpdG9yLnJlbmRlckN1c3RvbWl6YXRpb25NaWdyYXRpb25QYWdlKCk7XG5cdFx0XHRjb25zdCBvcGVuQnV0dG9uID0gZWRpdG9yLm1pZ3JhdGlvbkxpc3RDb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5wcm9tcHQtbWlncmF0aW9uLW9wZW4tYnV0dG9uJyk7XG5cdFx0XHRjb25zdCBhY3RpdmF0ZVdpdGhLZXkgPSAoa2V5OiBzdHJpbmcsIGtleUNvZGU6IG51bWJlcik6IHZvaWQgPT4ge1xuXHRcdFx0XHRjb25zdCBldmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXksIGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUgfSk7XG5cdFx0XHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShldmVudCwgJ2tleUNvZGUnLCB7IGdldDogKCkgPT4ga2V5Q29kZSB9KTtcblx0XHRcdFx0b3BlbkJ1dHRvbj8uZGlzcGF0Y2hFdmVudChldmVudCk7XG5cdFx0XHR9O1xuXHRcdFx0YWN0aXZhdGVXaXRoS2V5KCdFbnRlcicsIDEzKTtcblx0XHRcdGFjdGl2YXRlV2l0aEtleSgnICcsIDMyKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHRhZ05hbWU6IG9wZW5CdXR0b24/LnRhZ05hbWUsXG5cdFx0XHRcdHJvbGU6IG9wZW5CdXR0b24/LmdldEF0dHJpYnV0ZSgncm9sZScpLFxuXHRcdFx0XHRhcmlhTGFiZWw6IG9wZW5CdXR0b24/LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpLFxuXHRcdFx0XHRvcGVuZWRJdGVtcyxcblx0XHRcdH0sIHtcblx0XHRcdFx0dGFnTmFtZTogJ0EnLFxuXHRcdFx0XHRyb2xlOiAnYnV0dG9uJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnT3BlbiBSZXZpZXcsIC93b3Jrc3BhY2UvLmdpdGh1Yi9wcm9tcHRzL3Jldmlldy5wcm9tcHQubWQnLFxuXHRcdFx0XHRvcGVuZWRJdGVtczogW1xuXHRcdFx0XHRcdFtwcm9tcHRGaWxlLnVyaSwgJ1JldmlldycsIFByb21wdHNUeXBlLnByb21wdCwgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHRydWVdLFxuXHRcdFx0XHRcdFtwcm9tcHRGaWxlLnVyaSwgJ1JldmlldycsIFByb21wdHNUeXBlLnByb21wdCwgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHRydWVdLFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGVkaXRvci5taWdyYXRpb25MaXN0Q29udGFpbmVyLnJlbW92ZSgpO1xuXHRcdFx0ZWRpdG9yLm1pZ3JhdGlvblBhZ2VEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRlZGl0b3IuZWRpdG9yUHJldmlld0Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2N1c3RvbWl6YXRpb24gbWlncmF0aW9uIGdyb3VwcyBjYW4gYmUgY29sbGFwc2VkIGluZGVwZW5kZW50bHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yID0gY3JlYXRlVGVzdEVkaXRvcih1bmRlZmluZWQsIGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlU3R1Yih7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdEN1c3RvbWl6YXRpb25zUHJvbXB0TWlncmF0aW9uRW5hYmxlZF06IHRydWUsXG5cdFx0fSkpO1xuXHRcdGNvbnN0IHByb21wdEZpbGVzID0gW1xuXHRcdFx0e1xuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvcHJvbXB0cy93b3Jrc3BhY2UtYS5wcm9tcHQubWQnKSxcblx0XHRcdFx0bmFtZTogJ3dvcmtzcGFjZS1hLnByb21wdC5tZCcsXG5cdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLFxuXHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsXG5cdFx0XHRcdHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5HaXRIdWJXb3Jrc3BhY2UsXG5cdFx0XHR9IGFzIElQcm9tcHRQYXRoLFxuXHRcdFx0e1xuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvcHJvbXB0cy93b3Jrc3BhY2UtYi5wcm9tcHQubWQnKSxcblx0XHRcdFx0bmFtZTogJ3dvcmtzcGFjZS1iLnByb21wdC5tZCcsXG5cdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLFxuXHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsXG5cdFx0XHRcdHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5HaXRIdWJXb3Jrc3BhY2UsXG5cdFx0XHR9IGFzIElQcm9tcHRQYXRoLFxuXHRcdFx0e1xuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvdXNlci1kYXRhL3Byb21wdHMvdXNlci1hLnByb21wdC5tZCcpLFxuXHRcdFx0XHRuYW1lOiAndXNlci1hLnByb21wdC5tZCcsXG5cdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsXG5cdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLnByb21wdCxcblx0XHRcdFx0c291cmNlOiBQcm9tcHRGaWxlU291cmNlLlVzZXJEYXRhLFxuXHRcdFx0fSBhcyBJUHJvbXB0UGF0aCxcblx0XHRcdHtcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL3VzZXItZGF0YS9wcm9tcHRzL3VzZXItYi5wcm9tcHQubWQnKSxcblx0XHRcdFx0bmFtZTogJ3VzZXItYi5wcm9tcHQubWQnLFxuXHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLFxuXHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsXG5cdFx0XHRcdHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5Vc2VyRGF0YSxcblx0XHRcdH0gYXMgSVByb21wdFBhdGgsXG5cdFx0XTtcblx0XHRlZGl0b3IuY3VzdG9taXphdGlvbnNCeU1pZ3JhdGlvbkNhdGVnb3J5ID0gbmV3IE1hcChbW0N1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeUlkLlByb21wdEZpbGVzLCBwcm9tcHRGaWxlc11dKTtcblx0XHRlZGl0b3IuYWN0aXZlTWlncmF0aW9uQ2F0ZWdvcnlJZCA9IEN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeUlkLlByb21wdEZpbGVzO1xuXHRcdGZvciAoY29uc3QgcHJvbXB0RmlsZSBvZiBwcm9tcHRGaWxlcykge1xuXHRcdFx0ZWRpdG9yLnNldEN1c3RvbWl6YXRpb25TZWxlY3RlZEZvck1pZ3JhdGlvbihwcm9tcHRGaWxlLCB0cnVlKTtcblx0XHR9XG5cdFx0ZWRpdG9yLm1pZ3JhdGlvbkxpc3RDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRlZGl0b3IubWlncmF0aW9uVGl0bGVFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaDInKTtcblx0XHRlZGl0b3IubWlncmF0aW9uRGVzY3JpcHRpb25FbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xuXHRcdGVkaXRvci5taWdyYXRpb25MaW5rRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcblx0XHRlZGl0b3IubWlncmF0aW9uTWlncmF0ZUJ1dHRvbiA9IHsgZW5hYmxlZDogZmFsc2UsIGxhYmVsOiAnJyB9O1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZWRpdG9yLm1pZ3JhdGlvbkxpc3RDb250YWluZXIpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGVkaXRvci5yZW5kZXJDdXN0b21pemF0aW9uTWlncmF0aW9uUGFnZSgpO1xuXG5cdFx0XHRjb25zdCBncm91cFRvZ2dsZXMgPSBbLi4uZWRpdG9yLm1pZ3JhdGlvbkxpc3RDb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLnByb21wdC1taWdyYXRpb24tZ3JvdXAtdG9nZ2xlJyldIGFzIEhUTUxCdXR0b25FbGVtZW50W107XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyb3VwVG9nZ2xlcy5tYXAoYnV0dG9uID0+IGJ1dHRvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSksIFsndHJ1ZScsICd0cnVlJ10pO1xuXG5cdFx0XHRncm91cFRvZ2dsZXNbMF0uY2xpY2soKTtcblxuXHRcdFx0Y29uc3QgZ3JvdXBDb250YWluZXJzID0gWy4uLmVkaXRvci5taWdyYXRpb25MaXN0Q29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5wcm9tcHQtbWlncmF0aW9uLWdyb3VwLWl0ZW1zJyldIGFzIEhUTUxFbGVtZW50W107XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyb3VwQ29udGFpbmVycy5tYXAoY29udGFpbmVyID0+IGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5KSwgWydub25lJywgJyddKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFsuLi5lZGl0b3IubWlncmF0aW9uTGlzdENvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcucHJvbXB0LW1pZ3JhdGlvbi1ncm91cC10b2dnbGUnKV0ubWFwKGJ1dHRvbiA9PiBidXR0b24uZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykpLFxuXHRcdFx0XHRbJ2ZhbHNlJywgJ3RydWUnXSxcblx0XHRcdCk7XG5cblx0XHRcdGVkaXRvci5yZW5kZXJDdXN0b21pemF0aW9uTWlncmF0aW9uUGFnZSgpO1xuXG5cdFx0XHRjb25zdCByZXJlbmRlcmVkQ29udGFpbmVycyA9IFsuLi5lZGl0b3IubWlncmF0aW9uTGlzdENvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcucHJvbXB0LW1pZ3JhdGlvbi1ncm91cC1pdGVtcycpXSBhcyBIVE1MRWxlbWVudFtdO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXJlbmRlcmVkQ29udGFpbmVycy5tYXAoY29udGFpbmVyID0+IGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5KSwgWydub25lJywgJyddKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0ZWRpdG9yLm1pZ3JhdGlvbkxpc3RDb250YWluZXIucmVtb3ZlKCk7XG5cdFx0XHRlZGl0b3IubWlncmF0aW9uUGFnZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdGVkaXRvci5lZGl0b3JQcmV2aWV3RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGFBQWE7QUFJdEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMseUJBQXlCO0FBQ2xDLFNBQXNCLHNCQUFzQjtBQUU1QyxTQUFTLGtCQUFrQixhQUFhLGNBQWM7QUFDdEQsU0FBMkMsOEJBQThCO0FBQ3pFLFNBQVMsd0NBQXdDO0FBR2pELE1BQU0sbUNBQW1DLE1BQU07QUFDOUMsMENBQXdDO0FBNkN4QyxXQUFTLCtCQUErQixTQUFrQyxDQUFDLEdBQTBCO0FBRXBHLFVBQU0sU0FBa0M7QUFBQSxNQUN2QyxDQUFDLGtCQUFrQiwwQ0FBMEMsR0FBRztBQUFBLE1BQ2hFLEdBQUc7QUFBQSxJQUNKO0FBQ0EsV0FBTztBQUFBLE1BQ04sVUFBVSxDQUFDLFFBQWdCLE9BQU8sR0FBRztBQUFBLE1BQ3JDLFVBQVUsQ0FBQyxLQUFhLFVBQW1CO0FBQUUsZUFBTyxHQUFHLElBQUk7QUFBQSxNQUFPO0FBQUEsSUFDbkU7QUFBQSxFQUNEO0FBRUEsV0FBUyxpQkFBaUIsY0FBOEIsc0JBQThEO0FBQ3JILFVBQU0sU0FBUyxPQUFPLE9BQU8sZ0NBQWdDLFNBQVM7QUFDdEUsV0FBTywyQkFBMkI7QUFDbEMsV0FBTyx1QkFBdUI7QUFDOUIsV0FBTyx5QkFBeUI7QUFDaEMsV0FBTyxvQ0FBb0Msb0JBQUksSUFBSTtBQUNuRCxXQUFPLDRCQUE0QjtBQUNuQyxXQUFPLG9CQUFvQjtBQUMzQixXQUFPLG9DQUFvQyxTQUFTLGNBQWMsS0FBSztBQUN2RSxXQUFPLDJCQUEyQixJQUFJLGdCQUFnQjtBQUN0RCxXQUFPLGVBQWUsZ0JBQWdCO0FBQUEsTUFDckMsbUJBQW1CLE9BQU87QUFBQSxRQUN6QixVQUFVO0FBQUEsUUFBRTtBQUFBLFFBQ1osT0FBTztBQUFBLFFBQUU7QUFBQSxRQUNULE9BQU87QUFBQSxRQUFFO0FBQUEsUUFDVCxTQUFTO0FBQUEsUUFBRTtBQUFBLE1BQ1o7QUFBQSxJQUNEO0FBQ0EsV0FBTyx1QkFBdUIsd0JBQXdCLCtCQUErQjtBQUNyRixXQUFPLHlCQUF5QjtBQUNoQyxXQUFPLHlCQUF5QjtBQUNoQyxXQUFPLHdCQUF3QjtBQUMvQixXQUFPLDhCQUE4QjtBQUNyQyxXQUFPLDJCQUEyQjtBQUNsQyxXQUFPLHVCQUF1QjtBQUM5QixXQUFPLHVCQUF1QjtBQUM5QixXQUFPLHNDQUFzQyxJQUFJLFlBQVk7QUFDN0QsV0FBTyx3Q0FBd0Msb0JBQUksSUFBSTtBQUN2RCxXQUFPLDJCQUEyQixPQUFPLHlCQUF5QixJQUFJLElBQUksZ0JBQWdCLENBQUM7QUFDM0YsV0FBTyxlQUFlO0FBQUEsTUFDckIsYUFBYSxTQUFPLElBQUk7QUFBQSxJQUN6QjtBQUNBLFdBQU8scUJBQXFCLFlBQVk7QUFBQSxJQUFFO0FBQzFDLFdBQU8sd0JBQXdCLE1BQU07QUFDckMsV0FBTyxjQUFjO0FBQ3JCLFdBQU8sK0JBQStCLG9CQUFJLElBQUk7QUFDOUMsV0FBTywrQkFBK0I7QUFBQSxNQUNyQyxTQUFlO0FBQUEsTUFBRTtBQUFBLE1BQ2pCLFdBQWlCO0FBQUEsTUFBRTtBQUFBLElBQ3BCO0FBQ0EsV0FBTyxXQUFXO0FBQ2xCLFdBQU8sWUFBWTtBQUNuQixXQUFPLGtCQUFrQjtBQUN6QixXQUFPLFdBQVcsS0FBSztBQUN2QixXQUFPO0FBQUEsRUFDUjtBQUVBLFdBQVMsc0JBQXNCLEtBQWEsT0FBaUM7QUFDNUUsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLElBQUksU0FBUyxNQUFNLFNBQVMsQ0FBQztBQUFBLE1BQ3ZELE9BQU87QUFBQSxRQUNOLE1BQU07QUFBQSxRQUNOO0FBQUEsUUFDQSxPQUFPLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxNQUFNLFNBQVMsQ0FBQztBQUFBLFFBQzFDLFFBQVE7QUFBQSxNQUNUO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFFQSxPQUFLLGlFQUFpRSxNQUFNO0FBQzNFLFVBQU0sU0FBUyxpQkFBaUI7QUFDaEMsV0FBTywyQkFBMkIsWUFBWTtBQUM5QyxXQUFPLHVCQUF1Qix1QkFBdUI7QUFDckQsV0FBTyx5QkFBeUI7QUFDaEMsV0FBTyxvQkFBb0I7QUFFM0IsV0FBTyxZQUFZLE9BQU8seUJBQXlCLEdBQUcsTUFBTTtBQUM1RCxXQUFPLFlBQVksT0FBTywyQkFBMkIsR0FBRyw0QkFBNEI7QUFFcEYsV0FBTyx5QkFBeUIsUUFBUTtBQUFBLEVBQ3pDLENBQUM7QUFFRCxPQUFLLDJEQUEyRCxNQUFNO0FBQ3JFLFVBQU0sU0FBUyxpQkFBaUI7QUFDaEMsV0FBTywyQkFBMkIsWUFBWTtBQUM5QyxXQUFPLHVCQUF1Qix1QkFBdUI7QUFDckQsV0FBTyx5QkFBeUI7QUFDaEMsV0FBTyxvQkFBb0I7QUFFM0IsV0FBTyxZQUFZLE9BQU8seUJBQXlCLEdBQUcsVUFBVTtBQUNoRSxXQUFPLFlBQVksT0FBTywyQkFBMkIsR0FBRyw0QkFBNEI7QUFFcEYsV0FBTyx5QkFBeUIsUUFBUTtBQUFBLEVBQ3pDLENBQUM7QUFFRCxPQUFLLDJFQUEyRSxNQUFNO0FBQ3JGLFFBQUk7QUFDSixVQUFNLGVBQWU7QUFBQSxNQUNwQixtQkFBbUIsT0FBc0I7QUFBQSxRQUN4QyxVQUFVO0FBQUEsUUFBRTtBQUFBLFFBQ1osS0FBSyxPQUF1QjtBQUMzQixvQkFBVTtBQUFBLFFBQ1g7QUFBQSxRQUNBLE9BQWE7QUFBQSxRQUFFO0FBQUEsUUFDZixTQUFlO0FBQUEsUUFBRTtBQUFBLE1BQ2xCO0FBQUEsSUFDRDtBQUNBLFVBQU0sU0FBUyxpQkFBaUIsWUFBWTtBQUM1QyxVQUFNLFlBQVksT0FBTztBQUN6QixhQUFTLEtBQUssWUFBWSxTQUFTO0FBRW5DLFFBQUk7QUFDSCxhQUFPLHVCQUF1QixzQkFBc0IsZUFBZSxjQUFjLEdBQUcsWUFBWSxPQUFPLE9BQU8sTUFBTTtBQUVwSCxZQUFNLGFBQWEsVUFBVSxjQUFjLGdDQUFnQztBQUMzRSxhQUFPLEdBQUcsVUFBVTtBQUVwQixpQkFBVyxNQUFNO0FBRWpCLGFBQU8sWUFBWSxTQUFTLElBQUk7QUFBQSxJQUNqQyxVQUFFO0FBQ0QsZ0JBQVUsT0FBTztBQUNqQixhQUFPLHlCQUF5QixRQUFRO0FBQUEsSUFDekM7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLG9FQUFvRSxNQUFNO0FBQzlFLFVBQU0sU0FBUyxpQkFBaUIsUUFBVywrQkFBK0I7QUFBQSxNQUN6RSxDQUFDLGtCQUFrQiwwQ0FBMEMsR0FBRztBQUFBLElBQ2pFLENBQUMsQ0FBQztBQUNGLFdBQU8sMkJBQTJCLFlBQVk7QUFDOUMsV0FBTyx1QkFBdUIsdUJBQXVCO0FBQ3JELFdBQU8seUJBQXlCO0FBQ2hDLFdBQU8sb0JBQW9CO0FBRTNCLFdBQU8sWUFBWSxPQUFPLHlCQUF5QixHQUFHLEVBQUU7QUFDeEQsV0FBTyxZQUFZLE9BQU8sMkJBQTJCLEdBQUcsRUFBRTtBQUUxRCxXQUFPLHlCQUF5QixRQUFRO0FBQUEsRUFDekMsQ0FBQztBQUVELE9BQUssdUVBQXVFLE1BQU07QUFDakYsVUFBTSx1QkFBdUIsK0JBQStCO0FBQzVELFVBQU0sU0FBUyxpQkFBaUIsUUFBVyxvQkFBb0I7QUFDL0QsV0FBTyxXQUFXO0FBQ2xCLFdBQU8sMkJBQTJCLFlBQVk7QUFDOUMsV0FBTyxvQkFBb0I7QUFHM0IsV0FBTyxZQUFZLE9BQU8seUJBQXlCLEdBQUcsTUFBTTtBQUc1RCx5QkFBcUIsU0FBUyxrQkFBa0IsNENBQTRDLEtBQUs7QUFDakcsV0FBTyxrQ0FBa0M7QUFFekMsV0FBTyxZQUFZLE9BQU8sbUJBQW1CLEtBQUs7QUFDbEQsV0FBTyxZQUFZLE9BQU8seUJBQXlCLEdBQUcsRUFBRTtBQUV4RCxXQUFPLHlCQUF5QixRQUFRO0FBQUEsRUFDekMsQ0FBQztBQUVELE9BQUssaUVBQWlFLE1BQU07QUFDM0UsVUFBTSxtQkFBK0QsQ0FBQztBQUN0RSxVQUFNLHVCQUF1QiwrQkFBK0I7QUFBQSxNQUMzRCxDQUFDLGtCQUFrQix3Q0FBd0MsR0FBRztBQUFBLE1BQzlELENBQUMsa0JBQWtCLDBDQUEwQyxHQUFHO0FBQUEsSUFDakUsQ0FBQztBQUNELFVBQU0sU0FBUyxpQkFBaUIsUUFBVyxvQkFBb0I7QUFDL0QsV0FBTyxvQ0FBb0Msb0JBQUksSUFBSTtBQUFBLE1BQ2xELENBQUMsaUNBQWlDLGFBQWEsQ0FBQztBQUFBLFFBQy9DLEtBQUssSUFBSSxLQUFLLDZDQUE2QztBQUFBLFFBQzNELFNBQVMsZUFBZTtBQUFBLFFBQ3hCLE1BQU0sWUFBWTtBQUFBLFFBQ2xCLFFBQVEsaUJBQWlCO0FBQUEsTUFDMUIsQ0FBZ0IsQ0FBQztBQUFBLE1BQ2pCLENBQUMsaUNBQWlDLFVBQVUsQ0FBQztBQUFBLFFBQzVDLEtBQUssSUFBSSxLQUFLLG9DQUFvQztBQUFBLFFBQ2xELFNBQVMsZUFBZTtBQUFBLFFBQ3hCLE1BQU0sWUFBWTtBQUFBLFFBQ2xCLFFBQVEsaUJBQWlCO0FBQUEsTUFDMUIsQ0FBZ0IsQ0FBQztBQUFBLElBQ2xCLENBQUM7QUFDRCxXQUFPLGNBQWM7QUFBQSxNQUNwQix3QkFBd0IsZ0JBQWMsaUJBQWlCLEtBQUssQ0FBQyxHQUFHLFVBQStELENBQUM7QUFBQSxJQUNqSTtBQUVBLFdBQU8sZ0NBQWdDO0FBQ3ZDLHlCQUFxQixTQUFTLGtCQUFrQiw0Q0FBNEMsSUFBSTtBQUNoRyxXQUFPLGdDQUFnQztBQUN2Qyx5QkFBcUIsU0FBUyxrQkFBa0IsMENBQTBDLElBQUk7QUFDOUYsV0FBTyxnQ0FBZ0M7QUFFdkMsV0FBTyxnQkFBZ0IsaUJBQWlCLElBQUksZ0JBQWMsV0FBVyxJQUFJLGNBQVksU0FBUyxFQUFFLENBQUMsR0FBRztBQUFBLE1BQ25HLENBQUM7QUFBQSxNQUNELENBQUMsaUNBQWlDLFFBQVE7QUFBQSxNQUMxQyxDQUFDLGlDQUFpQyxhQUFhLGlDQUFpQyxRQUFRO0FBQUEsSUFDekYsQ0FBQztBQUNELFdBQU8seUJBQXlCLFFBQVE7QUFBQSxFQUN6QyxDQUFDO0FBRUQsT0FBSyxpREFBaUQsTUFBTTtBQUMzRCxVQUFNLFNBQVMsaUJBQWlCLFFBQVcsK0JBQStCO0FBQUEsTUFDekUsQ0FBQyxrQkFBa0Isd0NBQXdDLEdBQUc7QUFBQSxJQUMvRCxDQUFDLENBQUM7QUFDRixVQUFNLFlBQVksSUFBSSxLQUFLLDZCQUE2QjtBQUN4RCxVQUFNLGtCQUErQjtBQUFBLE1BQ3BDLEtBQUs7QUFBQSxNQUNMLFNBQVMsZUFBZTtBQUFBLE1BQ3hCLE1BQU0sWUFBWTtBQUFBLE1BQ2xCLFFBQVEsaUJBQWlCO0FBQUEsSUFDMUI7QUFDQSxVQUFNLGFBQTBCO0FBQUEsTUFDL0IsS0FBSztBQUFBLE1BQ0wsU0FBUyxlQUFlO0FBQUEsTUFDeEIsTUFBTSxZQUFZO0FBQUEsTUFDbEIsUUFBUSxpQkFBaUI7QUFBQSxJQUMxQjtBQUNBLFVBQU0sYUFBYSxvQkFBSSxJQUE4RDtBQUFBLE1BQ3BGLENBQUMsaUNBQWlDLGFBQWEsQ0FBQyxpQkFBaUIsVUFBVSxDQUFDO0FBQUEsSUFDN0UsQ0FBQztBQUVELFdBQU8sMkJBQTJCLFVBQVU7QUFDNUMsV0FBTyxxQ0FBcUMsaUJBQWlCLEtBQUs7QUFDbEUsV0FBTywyQkFBMkIsVUFBVTtBQUU1QyxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLG1CQUFtQixPQUFPLG9DQUFvQyxlQUFlO0FBQUEsTUFDN0UsY0FBYyxPQUFPLG9DQUFvQyxVQUFVO0FBQUEsTUFDbkUsa0JBQWtCLENBQUMsR0FBSSxPQUFPLG9DQUFvQyxJQUFJLFNBQVMsS0FBSyxDQUFDLENBQUU7QUFBQSxJQUN4RixHQUFHO0FBQUEsTUFDRixtQkFBbUI7QUFBQSxNQUNuQixjQUFjO0FBQUEsTUFDZCxrQkFBa0IsQ0FBQyxlQUFlLElBQUk7QUFBQSxJQUN2QyxDQUFDO0FBQ0QsV0FBTyx5QkFBeUIsUUFBUTtBQUFBLEVBQ3pDLENBQUM7QUFFRCxPQUFLLDhGQUE4RixNQUFNO0FBQ3hHLFVBQU0sU0FBUyxpQkFBaUIsUUFBVywrQkFBK0I7QUFBQSxNQUN6RSxDQUFDLGtCQUFrQiwwQ0FBMEMsR0FBRztBQUFBLE1BQ2hFLENBQUMsa0JBQWtCLHdDQUF3QyxHQUFHO0FBQUEsSUFDL0QsQ0FBQyxDQUFDO0FBQ0YsVUFBTSx5QkFBeUI7QUFBQSxNQUM5QjtBQUFBLFFBQ0MsS0FBSyxJQUFJLEtBQUssb0NBQW9DO0FBQUEsUUFDbEQsTUFBTTtBQUFBLFFBQ04sU0FBUyxlQUFlO0FBQUEsUUFDeEIsTUFBTSxZQUFZO0FBQUEsUUFDbEIsUUFBUSxpQkFBaUI7QUFBQSxNQUMxQjtBQUFBLE1BQ0E7QUFBQSxRQUNDLEtBQUssSUFBSSxLQUFLLDBDQUEwQztBQUFBLFFBQ3hELE1BQU07QUFBQSxRQUNOLFNBQVMsZUFBZTtBQUFBLFFBQ3hCLE1BQU0sWUFBWTtBQUFBLFFBQ2xCLFFBQVEsaUJBQWlCO0FBQUEsTUFDMUI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxjQUFjO0FBQUEsTUFDbkI7QUFBQSxRQUNDLEtBQUssSUFBSSxLQUFLLDZDQUE2QztBQUFBLFFBQzNELE1BQU07QUFBQSxRQUNOLFNBQVMsZUFBZTtBQUFBLFFBQ3hCLE1BQU0sWUFBWTtBQUFBLFFBQ2xCLFFBQVEsaUJBQWlCO0FBQUEsTUFDMUI7QUFBQSxJQUNEO0FBQ0EsV0FBTyxvQ0FBb0Msb0JBQUksSUFBSTtBQUFBLE1BQ2xELENBQUMsaUNBQWlDLFVBQVUsc0JBQXNCO0FBQUEsTUFDbEUsQ0FBQyxpQ0FBaUMsYUFBYSxXQUFXO0FBQUEsSUFDM0QsQ0FBQztBQUNELFdBQU8sc0NBQXNDLElBQUksWUFBWTtBQUM3RCxXQUFPLHlCQUF5QixTQUFTLGNBQWMsS0FBSztBQUM1RCxXQUFPLHdCQUF3QixTQUFTLGNBQWMsSUFBSTtBQUMxRCxXQUFPLDhCQUE4QixTQUFTLGNBQWMsR0FBRztBQUMvRCxXQUFPLDJCQUEyQixTQUFTLGNBQWMsS0FBSztBQUM5RCxXQUFPLHVCQUF1QixTQUFTLGNBQWMsR0FBRztBQUN4RCxXQUFPLHlCQUF5QixFQUFFLFNBQVMsT0FBTyxPQUFPLEdBQUc7QUFDNUQsYUFBUyxLQUFLLFlBQVksT0FBTyxzQkFBc0I7QUFFdkQsVUFBTSxhQUFhLE9BQU87QUFBQSxNQUN6QixPQUFPLE9BQU8seUJBQTBCLGNBQWMsdUNBQXVDLEdBQUcsZUFBZTtBQUFBLE1BQy9HLDBCQUEwQixPQUFPLHlCQUEwQixjQUFjLDZDQUE2QyxHQUFHLGVBQWUsSUFBSSxTQUFTLGVBQWU7QUFBQSxNQUNwSyxjQUFjLE9BQU8seUJBQTBCLE1BQU0sWUFBWTtBQUFBLE1BQ2pFLG1CQUFtQixPQUFPLDRCQUE2QixNQUFNLFlBQVk7QUFBQSxJQUMxRTtBQUVBLFFBQUk7QUFDSCxhQUFPLDRCQUE0QixpQ0FBaUM7QUFDcEUsYUFBTyxpQ0FBaUM7QUFDeEMsWUFBTSxXQUFXLFdBQVc7QUFHNUIsYUFBTyw0QkFBNEIsaUNBQWlDO0FBQ3BFLGFBQU8saUNBQWlDO0FBQ3hDLFlBQU0sVUFBVSxXQUFXO0FBRTNCLGFBQU8sZ0JBQWdCLEVBQUUsVUFBVSxRQUFRLEdBQUc7QUFBQSxRQUM3QyxVQUFVO0FBQUEsVUFDVCxPQUFPO0FBQUEsVUFDUCx5QkFBeUI7QUFBQSxVQUN6QixjQUFjO0FBQUEsVUFDZCxtQkFBbUI7QUFBQSxRQUNwQjtBQUFBLFFBQ0EsU0FBUztBQUFBLFVBQ1IsT0FBTztBQUFBLFVBQ1AseUJBQXlCO0FBQUEsVUFDekIsY0FBYztBQUFBLFVBQ2QsbUJBQW1CO0FBQUEsUUFDcEI7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLFVBQUU7QUFDRCxhQUFPLHVCQUF1QixPQUFPO0FBQ3JDLGFBQU8seUJBQXlCLFFBQVE7QUFDeEMsYUFBTyx5QkFBeUIsUUFBUTtBQUFBLElBQ3pDO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxnRUFBZ0UsTUFBTTtBQUMxRSxVQUFNLFNBQVMsaUJBQWlCLFFBQVcsK0JBQStCO0FBQUEsTUFDekUsQ0FBQyxrQkFBa0Isd0NBQXdDLEdBQUc7QUFBQSxJQUMvRCxDQUFDLENBQUM7QUFDRixVQUFNLGFBQTBCO0FBQUEsTUFDL0IsS0FBSyxJQUFJLEtBQUssNkNBQTZDO0FBQUEsTUFDM0QsTUFBTTtBQUFBLE1BQ04sU0FBUyxlQUFlO0FBQUEsTUFDeEIsTUFBTSxZQUFZO0FBQUEsTUFDbEIsUUFBUSxpQkFBaUI7QUFBQSxJQUMxQjtBQUNBLFVBQU0sY0FBMkIsQ0FBQztBQUNsQyxXQUFPLHFCQUFxQixVQUFVLFNBQW9CO0FBQUUsa0JBQVksS0FBSyxJQUFJO0FBQUEsSUFBRztBQUNwRixXQUFPLG9DQUFvQyxvQkFBSSxJQUFJLENBQUMsQ0FBQyxpQ0FBaUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7QUFDakgsV0FBTyw0QkFBNEIsaUNBQWlDO0FBQ3BFLFdBQU8seUJBQXlCLFNBQVMsY0FBYyxLQUFLO0FBQzVELFdBQU8seUJBQXlCLEVBQUUsU0FBUyxPQUFPLE9BQU8sR0FBRztBQUM1RCxhQUFTLEtBQUssWUFBWSxPQUFPLHNCQUFzQjtBQUV2RCxRQUFJO0FBQ0gsYUFBTyxpQ0FBaUM7QUFDeEMsWUFBTSxhQUFhLE9BQU8sdUJBQXVCLGNBQTJCLCtCQUErQjtBQUMzRyxZQUFNLGtCQUFrQixDQUFDLEtBQWEsWUFBMEI7QUFDL0QsY0FBTSxRQUFRLElBQUksY0FBYyxXQUFXLEVBQUUsS0FBSyxTQUFTLE1BQU0sWUFBWSxLQUFLLENBQUM7QUFDbkYsZUFBTyxlQUFlLE9BQU8sV0FBVyxFQUFFLEtBQUssTUFBTSxRQUFRLENBQUM7QUFDOUQsb0JBQVksY0FBYyxLQUFLO0FBQUEsTUFDaEM7QUFDQSxzQkFBZ0IsU0FBUyxFQUFFO0FBQzNCLHNCQUFnQixLQUFLLEVBQUU7QUFFdkIsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixTQUFTLFlBQVk7QUFBQSxRQUNyQixNQUFNLFlBQVksYUFBYSxNQUFNO0FBQUEsUUFDckMsV0FBVyxZQUFZLGFBQWEsWUFBWTtBQUFBLFFBQ2hEO0FBQUEsTUFDRCxHQUFHO0FBQUEsUUFDRixTQUFTO0FBQUEsUUFDVCxNQUFNO0FBQUEsUUFDTixXQUFXO0FBQUEsUUFDWCxhQUFhO0FBQUEsVUFDWixDQUFDLFdBQVcsS0FBSyxVQUFVLFlBQVksUUFBUSxlQUFlLE9BQU8sSUFBSTtBQUFBLFVBQ3pFLENBQUMsV0FBVyxLQUFLLFVBQVUsWUFBWSxRQUFRLGVBQWUsT0FBTyxJQUFJO0FBQUEsUUFDMUU7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLFVBQUU7QUFDRCxhQUFPLHVCQUF1QixPQUFPO0FBQ3JDLGFBQU8seUJBQXlCLFFBQVE7QUFDeEMsYUFBTyx5QkFBeUIsUUFBUTtBQUFBLElBQ3pDO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxpRUFBaUUsTUFBTTtBQUMzRSxVQUFNLFNBQVMsaUJBQWlCLFFBQVcsK0JBQStCO0FBQUEsTUFDekUsQ0FBQyxrQkFBa0Isd0NBQXdDLEdBQUc7QUFBQSxJQUMvRCxDQUFDLENBQUM7QUFDRixVQUFNLGNBQWM7QUFBQSxNQUNuQjtBQUFBLFFBQ0MsS0FBSyxJQUFJLEtBQUssa0RBQWtEO0FBQUEsUUFDaEUsTUFBTTtBQUFBLFFBQ04sU0FBUyxlQUFlO0FBQUEsUUFDeEIsTUFBTSxZQUFZO0FBQUEsUUFDbEIsUUFBUSxpQkFBaUI7QUFBQSxNQUMxQjtBQUFBLE1BQ0E7QUFBQSxRQUNDLEtBQUssSUFBSSxLQUFLLGtEQUFrRDtBQUFBLFFBQ2hFLE1BQU07QUFBQSxRQUNOLFNBQVMsZUFBZTtBQUFBLFFBQ3hCLE1BQU0sWUFBWTtBQUFBLFFBQ2xCLFFBQVEsaUJBQWlCO0FBQUEsTUFDMUI7QUFBQSxNQUNBO0FBQUEsUUFDQyxLQUFLLElBQUksS0FBSyxxQ0FBcUM7QUFBQSxRQUNuRCxNQUFNO0FBQUEsUUFDTixTQUFTLGVBQWU7QUFBQSxRQUN4QixNQUFNLFlBQVk7QUFBQSxRQUNsQixRQUFRLGlCQUFpQjtBQUFBLE1BQzFCO0FBQUEsTUFDQTtBQUFBLFFBQ0MsS0FBSyxJQUFJLEtBQUsscUNBQXFDO0FBQUEsUUFDbkQsTUFBTTtBQUFBLFFBQ04sU0FBUyxlQUFlO0FBQUEsUUFDeEIsTUFBTSxZQUFZO0FBQUEsUUFDbEIsUUFBUSxpQkFBaUI7QUFBQSxNQUMxQjtBQUFBLElBQ0Q7QUFDQSxXQUFPLG9DQUFvQyxvQkFBSSxJQUFJLENBQUMsQ0FBQyxpQ0FBaUMsYUFBYSxXQUFXLENBQUMsQ0FBQztBQUNoSCxXQUFPLDRCQUE0QixpQ0FBaUM7QUFDcEUsZUFBVyxjQUFjLGFBQWE7QUFDckMsYUFBTyxxQ0FBcUMsWUFBWSxJQUFJO0FBQUEsSUFDN0Q7QUFDQSxXQUFPLHlCQUF5QixTQUFTLGNBQWMsS0FBSztBQUM1RCxXQUFPLHdCQUF3QixTQUFTLGNBQWMsSUFBSTtBQUMxRCxXQUFPLDhCQUE4QixTQUFTLGNBQWMsR0FBRztBQUMvRCxXQUFPLHVCQUF1QixTQUFTLGNBQWMsR0FBRztBQUN4RCxXQUFPLHlCQUF5QixFQUFFLFNBQVMsT0FBTyxPQUFPLEdBQUc7QUFDNUQsYUFBUyxLQUFLLFlBQVksT0FBTyxzQkFBc0I7QUFFdkQsUUFBSTtBQUNILGFBQU8saUNBQWlDO0FBRXhDLFlBQU0sZUFBZSxDQUFDLEdBQUcsT0FBTyx1QkFBdUIsaUJBQWlCLGdDQUFnQyxDQUFDO0FBQ3pHLGFBQU8sZ0JBQWdCLGFBQWEsSUFBSSxZQUFVLE9BQU8sYUFBYSxlQUFlLENBQUMsR0FBRyxDQUFDLFFBQVEsTUFBTSxDQUFDO0FBRXpHLG1CQUFhLENBQUMsRUFBRSxNQUFNO0FBRXRCLFlBQU0sa0JBQWtCLENBQUMsR0FBRyxPQUFPLHVCQUF1QixpQkFBaUIsK0JBQStCLENBQUM7QUFDM0csYUFBTyxnQkFBZ0IsZ0JBQWdCLElBQUksZUFBYSxVQUFVLE1BQU0sT0FBTyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7QUFDOUYsYUFBTztBQUFBLFFBQ04sQ0FBQyxHQUFHLE9BQU8sdUJBQXVCLGlCQUFpQixnQ0FBZ0MsQ0FBQyxFQUFFLElBQUksWUFBVSxPQUFPLGFBQWEsZUFBZSxDQUFDO0FBQUEsUUFDeEksQ0FBQyxTQUFTLE1BQU07QUFBQSxNQUNqQjtBQUVBLGFBQU8saUNBQWlDO0FBRXhDLFlBQU0sdUJBQXVCLENBQUMsR0FBRyxPQUFPLHVCQUF1QixpQkFBaUIsK0JBQStCLENBQUM7QUFDaEgsYUFBTyxnQkFBZ0IscUJBQXFCLElBQUksZUFBYSxVQUFVLE1BQU0sT0FBTyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7QUFBQSxJQUNwRyxVQUFFO0FBQ0QsYUFBTyx1QkFBdUIsT0FBTztBQUNyQyxhQUFPLHlCQUF5QixRQUFRO0FBQ3hDLGFBQU8seUJBQXlCLFFBQVE7QUFBQSxJQUN6QztBQUFBLEVBQ0QsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
