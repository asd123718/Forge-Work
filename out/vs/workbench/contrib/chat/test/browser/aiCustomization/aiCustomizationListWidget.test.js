import assert from "assert";
import { URI } from "../../../../../../base/common/uri.js";
import { Event } from "../../../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { derived, observableValue } from "../../../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { AICustomizationListWidget } from "../../../browser/aiCustomization/aiCustomizationListWidget.js";
import { IAICustomizationItemsModel } from "../../../browser/aiCustomization/aiCustomizationItemsModel.js";
import { extractExtensionIdFromPath, getCustomizationSecondaryText, truncateToFirstLine } from "../../../browser/aiCustomization/aiCustomizationListWidgetUtils.js";
import { AICustomizationManagementSection, IAICustomizationWorkspaceService } from "../../../common/aiCustomizationWorkspaceService.js";
import { ICustomizationHarnessService } from "../../../common/customizationHarnessService.js";
import { ContributionEnablementState } from "../../../common/enablement.js";
import { getChatSessionType } from "../../../common/model/chatUri.js";
import { IAgentPluginService } from "../../../common/plugins/agentPluginService.js";
import { IPromptsService } from "../../../common/promptSyntax/service/promptsService.js";
import { PromptsType } from "../../../common/promptSyntax/promptTypes.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { ResourceSet } from "../../../../../../base/common/map.js";
suite("aiCustomizationListWidget", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("truncateToFirstLine", () => {
    test("keeps first line when text has multiple lines", () => {
      assert.strictEqual(
        truncateToFirstLine("First line\nSecond line"),
        "First line"
      );
    });
    test("returns full text when no newline is present", () => {
      assert.strictEqual(
        truncateToFirstLine("No newline here. Even with sentences."),
        "No newline here. Even with sentences."
      );
    });
    test("handles carriage return line endings", () => {
      assert.strictEqual(
        truncateToFirstLine("First line\r\nSecond line"),
        "First line"
      );
    });
  });
  suite("getCustomizationSecondaryText", () => {
    test("keeps hook descriptions intact", () => {
      assert.strictEqual(
        getCustomizationSecondaryText('echo "setup". echo "run".', "hook.json", PromptsType.hook),
        'echo "setup". echo "run".'
      );
    });
    test("truncates non-hook descriptions to the first line", () => {
      assert.strictEqual(
        getCustomizationSecondaryText("Show the first line.\nHide the rest.", "prompt.md", PromptsType.prompt),
        "Show the first line."
      );
    });
    test("falls back to filename when description is missing", () => {
      assert.strictEqual(
        getCustomizationSecondaryText(void 0, "prompt.md", PromptsType.prompt),
        "prompt.md"
      );
    });
  });
  suite("extractExtensionIdFromPath", () => {
    test("extracts extension ID from copilot-chat extension path", () => {
      assert.strictEqual(
        extractExtensionIdFromPath("/Users/josh/.vscode-insiders/extensions/github.copilot-chat-0.43.2026040602/assets/prompts/skills/agent-customization/SKILL.md"),
        "github.copilot-chat"
      );
    });
    test("extracts extension ID from PR extension path", () => {
      assert.strictEqual(
        extractExtensionIdFromPath("/Users/josh/.vscode-insiders/extensions/github.vscode-pull-request-github-0.135.2026040604/src/lm/skills/SKILL.md"),
        "github.vscode-pull-request-github"
      );
    });
    test("extracts extension ID from Code OSS dev path", () => {
      assert.strictEqual(
        extractExtensionIdFromPath("/Users/josh/.vscode-oss-dev/extensions/github.copilot-chat-0.43.2026040602/assets/prompts/skills/troubleshoot/SKILL.md"),
        "github.copilot-chat"
      );
    });
    test("extracts extension ID from Windows-style path", () => {
      assert.strictEqual(
        extractExtensionIdFromPath("C:/Users/dev/.vscode/extensions/ms-python.python-2024.1.1/skills/SKILL.md"),
        "ms-python.python"
      );
    });
    test("returns undefined for workspace paths", () => {
      assert.strictEqual(
        extractExtensionIdFromPath("/Users/josh/git/vscode/.github/skills/accessibility/SKILL.md"),
        void 0
      );
    });
    test("returns undefined for user home paths", () => {
      assert.strictEqual(
        extractExtensionIdFromPath("/Users/josh/.copilot/skills/ios-project-setup/SKILL.md"),
        void 0
      );
    });
    test("returns undefined for plugin paths", () => {
      assert.strictEqual(
        extractExtensionIdFromPath("/Users/josh/.vscode-insiders/agent-plugins/github.com/microsoft/vscode-team-kit/model-council/skills/council-review/SKILL.md"),
        void 0
      );
    });
    test("returns undefined for bare extensions folder without version", () => {
      assert.strictEqual(
        extractExtensionIdFromPath("/workspace/extensions/my-extension/SKILL.md"),
        void 0
      );
    });
    test("extracts extension ID from User/globalStorage path (Copilot Chat ask agent)", () => {
      assert.strictEqual(
        extractExtensionIdFromPath("/Users/josh/.vscode-oss-dev/User/globalStorage/github.copilot-chat/ask-agent/Ask.agent.md"),
        "github.copilot-chat"
      );
    });
    test("extracts extension ID from User/globalStorage path on Insiders", () => {
      assert.strictEqual(
        extractExtensionIdFromPath("/Users/josh/Library/Application Support/Code - Insiders/User/globalStorage/github.copilot-chat/ask-agent/Ask.agent.md"),
        "github.copilot-chat"
      );
    });
    test("returns undefined for non-extension entries in globalStorage", () => {
      assert.strictEqual(
        extractExtensionIdFromPath("/Users/josh/.vscode-oss-dev/User/globalStorage/state.vscdb"),
        void 0
      );
    });
  });
  suite("disposed widget", () => {
    let disposables;
    let instaService;
    const searchBarHeight = 40;
    const headerHeight = 30;
    const setLayoutHeights = (widget, clientHeight) => {
      Object.defineProperty(widget.element, "clientHeight", { configurable: true, value: clientHeight });
      Object.defineProperty(widget.element.querySelector(".list-search-and-button-container"), "offsetHeight", { configurable: true, value: searchBarHeight });
      Object.defineProperty(widget.element.querySelector(".section-title-header"), "offsetHeight", { configurable: true, value: headerHeight });
    };
    const descriptor = {
      id: "test",
      label: "Test",
      icon: Codicon.settingsGear,
      itemProvider: {
        onDidChange: Event.None,
        provideChatSessionCustomizations: (sessionResource, token) => Promise.resolve(void 0)
      }
    };
    setup(() => {
      disposables = new DisposableStore();
      instaService = workbenchInstantiationService({}, disposables);
      instaService.stub(IPromptsService, {
        onDidChangeCustomAgents: Event.None,
        onDidChangeSlashCommands: Event.None,
        onDidChangeSkills: Event.None,
        onDidChangeHooks: Event.None,
        onDidChangeInstructions: Event.None,
        listPromptFiles: async () => [],
        getCustomAgents: async () => [],
        findAgentSkills: async () => [],
        getHooks: async () => void 0,
        getInstructionFiles: async () => [],
        getDisabledPromptFiles: () => new ResourceSet()
      });
      instaService.stub(IAICustomizationWorkspaceService, {
        activeProjectRoot: observableValue("test", void 0),
        getActiveProjectRoot: () => void 0,
        managementSections: [AICustomizationManagementSection.Agents],
        isSessionsWindow: false,
        welcomePageFeatures: { showGettingStartedBanner: false },
        getSkillUIIntegrations: () => /* @__PURE__ */ new Map(),
        hasOverrideProjectRoot: observableValue("test", false),
        commitFiles: async () => {
        },
        deleteFiles: async () => {
        },
        generateCustomization: async () => {
        },
        setOverrideProjectRoot: () => {
        },
        clearOverrideProjectRoot: () => {
        }
      });
      const activeSessionResource = observableValue("test", URI.parse("test:///session"));
      const activeHarness = derived((reader) => getChatSessionType(activeSessionResource.read(reader)));
      instaService.stub(ICustomizationHarnessService, {
        activeSessionResource,
        activeHarness,
        availableHarnesses: observableValue("test", [descriptor]),
        setActiveSession: () => {
        },
        getActiveDescriptor: () => descriptor,
        findHarnessById: (id) => id === descriptor.id ? descriptor : void 0,
        registerExternalHarness: () => ({ dispose() {
        } })
      });
      instaService.stub(IAgentPluginService, {
        plugins: observableValue("test", []),
        enablementModel: {
          readEnabled: () => ContributionEnablementState.EnabledProfile,
          readProfileEnabled: () => true,
          setEnabled: () => {
          },
          remove: () => {
          }
        }
      });
      instaService.stub(ICommandService, {
        executeCommand: async () => void 0,
        onWillExecuteCommand: Event.None,
        onDidExecuteCommand: Event.None
      });
      instaService.stub(IAICustomizationItemsModel, {
        getItems: () => observableValue("test", []),
        getCount: () => observableValue("test", 0),
        getPluginCount: () => observableValue("test", 0),
        getActiveItemSource: () => ({ onDidAICustomizationItemsChange: Event.None, fetchProviderItems: async () => [], fetchAICustomizationItems: async () => [], fetchSourceFolders: async () => [], sessionResource: activeSessionResource.get(), dispose() {
        } })
      });
    });
    teardown(() => disposables.dispose());
    test("generateDebugReport returns empty string when widget is disposed", async () => {
      const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
      widget.dispose();
      const result = await widget.generateDebugReport();
      assert.strictEqual(result, "");
    });
    test("uses the rendered container height for list layout when available", () => {
      const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
      document.body.appendChild(widget.element);
      disposables.add(toDisposable(() => widget.element.remove()));
      setLayoutHeights(widget, 500);
      widget.layout(900, 320);
      assert.strictEqual(widget.element.querySelector(".list-container").style.height, "430px");
    });
    test("falls back to supplied layout height when rendered container height is 0", () => {
      const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
      document.body.appendChild(widget.element);
      disposables.add(toDisposable(() => widget.element.remove()));
      setLayoutHeights(widget, 0);
      widget.layout(900, 320);
      assert.strictEqual(widget.element.querySelector(".list-container").style.height, "830px");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFpQ3VzdG9taXphdGlvblxcYWlDdXN0b21pemF0aW9uTGlzdFdpZGdldC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZGVyaXZlZCwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgQUlDdXN0b21pemF0aW9uTGlzdFdpZGdldCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbkxpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9haUN1c3RvbWl6YXRpb25JdGVtc01vZGVsLmpzJztcbmltcG9ydCB7IGV4dHJhY3RFeHRlbnNpb25JZEZyb21QYXRoLCBnZXRDdXN0b21pemF0aW9uU2Vjb25kYXJ5VGV4dCwgdHJ1bmNhdGVUb0ZpcnN0TGluZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbkxpc3RXaWRnZXRVdGlscy5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbiwgSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLCBJSGFybmVzc0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lbmFibGVtZW50LmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IElBZ2VudFBsdWdpblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGx1Z2lucy9hZ2VudFBsdWdpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByb21wdHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByb21wdHNUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuXG5zdWl0ZSgnYWlDdXN0b21pemF0aW9uTGlzdFdpZGdldCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ3RydW5jYXRlVG9GaXJzdExpbmUnLCAoKSA9PiB7XG5cdFx0dGVzdCgna2VlcHMgZmlyc3QgbGluZSB3aGVuIHRleHQgaGFzIG11bHRpcGxlIGxpbmVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHR0cnVuY2F0ZVRvRmlyc3RMaW5lKCdGaXJzdCBsaW5lXFxuU2Vjb25kIGxpbmUnKSxcblx0XHRcdFx0J0ZpcnN0IGxpbmUnXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmdWxsIHRleHQgd2hlbiBubyBuZXdsaW5lIGlzIHByZXNlbnQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHRydW5jYXRlVG9GaXJzdExpbmUoJ05vIG5ld2xpbmUgaGVyZS4gRXZlbiB3aXRoIHNlbnRlbmNlcy4nKSxcblx0XHRcdFx0J05vIG5ld2xpbmUgaGVyZS4gRXZlbiB3aXRoIHNlbnRlbmNlcy4nXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBjYXJyaWFnZSByZXR1cm4gbGluZSBlbmRpbmdzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHR0cnVuY2F0ZVRvRmlyc3RMaW5lKCdGaXJzdCBsaW5lXFxyXFxuU2Vjb25kIGxpbmUnKSxcblx0XHRcdFx0J0ZpcnN0IGxpbmUnXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0Q3VzdG9taXphdGlvblNlY29uZGFyeVRleHQnLCAoKSA9PiB7XG5cdFx0dGVzdCgna2VlcHMgaG9vayBkZXNjcmlwdGlvbnMgaW50YWN0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRDdXN0b21pemF0aW9uU2Vjb25kYXJ5VGV4dCgnZWNobyBcInNldHVwXCIuIGVjaG8gXCJydW5cIi4nLCAnaG9vay5qc29uJywgUHJvbXB0c1R5cGUuaG9vayksXG5cdFx0XHRcdCdlY2hvIFwic2V0dXBcIi4gZWNobyBcInJ1blwiLidcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cnVuY2F0ZXMgbm9uLWhvb2sgZGVzY3JpcHRpb25zIHRvIHRoZSBmaXJzdCBsaW5lJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRDdXN0b21pemF0aW9uU2Vjb25kYXJ5VGV4dCgnU2hvdyB0aGUgZmlyc3QgbGluZS5cXG5IaWRlIHRoZSByZXN0LicsICdwcm9tcHQubWQnLCBQcm9tcHRzVHlwZS5wcm9tcHQpLFxuXHRcdFx0XHQnU2hvdyB0aGUgZmlyc3QgbGluZS4nXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsbHMgYmFjayB0byBmaWxlbmFtZSB3aGVuIGRlc2NyaXB0aW9uIGlzIG1pc3NpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldEN1c3RvbWl6YXRpb25TZWNvbmRhcnlUZXh0KHVuZGVmaW5lZCwgJ3Byb21wdC5tZCcsIFByb21wdHNUeXBlLnByb21wdCksXG5cdFx0XHRcdCdwcm9tcHQubWQnXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZXh0cmFjdEV4dGVuc2lvbklkRnJvbVBhdGgnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZXh0cmFjdHMgZXh0ZW5zaW9uIElEIGZyb20gY29waWxvdC1jaGF0IGV4dGVuc2lvbiBwYXRoJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRleHRyYWN0RXh0ZW5zaW9uSWRGcm9tUGF0aCgnL1VzZXJzL2pvc2gvLnZzY29kZS1pbnNpZGVycy9leHRlbnNpb25zL2dpdGh1Yi5jb3BpbG90LWNoYXQtMC40My4yMDI2MDQwNjAyL2Fzc2V0cy9wcm9tcHRzL3NraWxscy9hZ2VudC1jdXN0b21pemF0aW9uL1NLSUxMLm1kJyksXG5cdFx0XHRcdCdnaXRodWIuY29waWxvdC1jaGF0J1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4dHJhY3RzIGV4dGVuc2lvbiBJRCBmcm9tIFBSIGV4dGVuc2lvbiBwYXRoJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRleHRyYWN0RXh0ZW5zaW9uSWRGcm9tUGF0aCgnL1VzZXJzL2pvc2gvLnZzY29kZS1pbnNpZGVycy9leHRlbnNpb25zL2dpdGh1Yi52c2NvZGUtcHVsbC1yZXF1ZXN0LWdpdGh1Yi0wLjEzNS4yMDI2MDQwNjA0L3NyYy9sbS9za2lsbHMvU0tJTEwubWQnKSxcblx0XHRcdFx0J2dpdGh1Yi52c2NvZGUtcHVsbC1yZXF1ZXN0LWdpdGh1Yidcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHRyYWN0cyBleHRlbnNpb24gSUQgZnJvbSBDb2RlIE9TUyBkZXYgcGF0aCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0ZXh0cmFjdEV4dGVuc2lvbklkRnJvbVBhdGgoJy9Vc2Vycy9qb3NoLy52c2NvZGUtb3NzLWRldi9leHRlbnNpb25zL2dpdGh1Yi5jb3BpbG90LWNoYXQtMC40My4yMDI2MDQwNjAyL2Fzc2V0cy9wcm9tcHRzL3NraWxscy90cm91Ymxlc2hvb3QvU0tJTEwubWQnKSxcblx0XHRcdFx0J2dpdGh1Yi5jb3BpbG90LWNoYXQnXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXh0cmFjdHMgZXh0ZW5zaW9uIElEIGZyb20gV2luZG93cy1zdHlsZSBwYXRoJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRleHRyYWN0RXh0ZW5zaW9uSWRGcm9tUGF0aCgnQzovVXNlcnMvZGV2Ly52c2NvZGUvZXh0ZW5zaW9ucy9tcy1weXRob24ucHl0aG9uLTIwMjQuMS4xL3NraWxscy9TS0lMTC5tZCcpLFxuXHRcdFx0XHQnbXMtcHl0aG9uLnB5dGhvbidcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3Igd29ya3NwYWNlIHBhdGhzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRleHRyYWN0RXh0ZW5zaW9uSWRGcm9tUGF0aCgnL1VzZXJzL2pvc2gvZ2l0L3ZzY29kZS8uZ2l0aHViL3NraWxscy9hY2Nlc3NpYmlsaXR5L1NLSUxMLm1kJyksXG5cdFx0XHRcdHVuZGVmaW5lZFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciB1c2VyIGhvbWUgcGF0aHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGV4dHJhY3RFeHRlbnNpb25JZEZyb21QYXRoKCcvVXNlcnMvam9zaC8uY29waWxvdC9za2lsbHMvaW9zLXByb2plY3Qtc2V0dXAvU0tJTEwubWQnKSxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIHBsdWdpbiBwYXRocycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0ZXh0cmFjdEV4dGVuc2lvbklkRnJvbVBhdGgoJy9Vc2Vycy9qb3NoLy52c2NvZGUtaW5zaWRlcnMvYWdlbnQtcGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUtdGVhbS1raXQvbW9kZWwtY291bmNpbC9za2lsbHMvY291bmNpbC1yZXZpZXcvU0tJTEwubWQnKSxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIGJhcmUgZXh0ZW5zaW9ucyBmb2xkZXIgd2l0aG91dCB2ZXJzaW9uJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRleHRyYWN0RXh0ZW5zaW9uSWRGcm9tUGF0aCgnL3dvcmtzcGFjZS9leHRlbnNpb25zL215LWV4dGVuc2lvbi9TS0lMTC5tZCcpLFxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHRyYWN0cyBleHRlbnNpb24gSUQgZnJvbSBVc2VyL2dsb2JhbFN0b3JhZ2UgcGF0aCAoQ29waWxvdCBDaGF0IGFzayBhZ2VudCknLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGV4dHJhY3RFeHRlbnNpb25JZEZyb21QYXRoKCcvVXNlcnMvam9zaC8udnNjb2RlLW9zcy1kZXYvVXNlci9nbG9iYWxTdG9yYWdlL2dpdGh1Yi5jb3BpbG90LWNoYXQvYXNrLWFnZW50L0Fzay5hZ2VudC5tZCcpLFxuXHRcdFx0XHQnZ2l0aHViLmNvcGlsb3QtY2hhdCdcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHRyYWN0cyBleHRlbnNpb24gSUQgZnJvbSBVc2VyL2dsb2JhbFN0b3JhZ2UgcGF0aCBvbiBJbnNpZGVycycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0ZXh0cmFjdEV4dGVuc2lvbklkRnJvbVBhdGgoJy9Vc2Vycy9qb3NoL0xpYnJhcnkvQXBwbGljYXRpb24gU3VwcG9ydC9Db2RlIC0gSW5zaWRlcnMvVXNlci9nbG9iYWxTdG9yYWdlL2dpdGh1Yi5jb3BpbG90LWNoYXQvYXNrLWFnZW50L0Fzay5hZ2VudC5tZCcpLFxuXHRcdFx0XHQnZ2l0aHViLmNvcGlsb3QtY2hhdCdcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3Igbm9uLWV4dGVuc2lvbiBlbnRyaWVzIGluIGdsb2JhbFN0b3JhZ2UnLCAoKSA9PiB7XG5cdFx0XHQvLyBlLmcuIGBzdGF0ZS52c2NkYmAgb3Igb3RoZXIgd29ya3NwYWNlIHN0b3JhZ2UgdGhhdCBsYWNrcyBhIHB1Ymxpc2hlci5uYW1lIHBhdHRlcm5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0ZXh0cmFjdEV4dGVuc2lvbklkRnJvbVBhdGgoJy9Vc2Vycy9qb3NoLy52c2NvZGUtb3NzLWRldi9Vc2VyL2dsb2JhbFN0b3JhZ2Uvc3RhdGUudnNjZGInKSxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZGlzcG9zZWQgd2lkZ2V0JywgKCkgPT4ge1xuXG5cdFx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdFx0bGV0IGluc3RhU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRcdGNvbnN0IHNlYXJjaEJhckhlaWdodCA9IDQwO1xuXHRcdGNvbnN0IGhlYWRlckhlaWdodCA9IDMwO1xuXHRcdGNvbnN0IHNldExheW91dEhlaWdodHMgPSAod2lkZ2V0OiBBSUN1c3RvbWl6YXRpb25MaXN0V2lkZ2V0LCBjbGllbnRIZWlnaHQ6IG51bWJlcik6IHZvaWQgPT4ge1xuXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KHdpZGdldC5lbGVtZW50LCAnY2xpZW50SGVpZ2h0JywgeyBjb25maWd1cmFibGU6IHRydWUsIHZhbHVlOiBjbGllbnRIZWlnaHQgfSk7XG5cdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkod2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcignLmxpc3Qtc2VhcmNoLWFuZC1idXR0b24tY29udGFpbmVyJykhLCAnb2Zmc2V0SGVpZ2h0JywgeyBjb25maWd1cmFibGU6IHRydWUsIHZhbHVlOiBzZWFyY2hCYXJIZWlnaHQgfSk7XG5cdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkod2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcignLnNlY3Rpb24tdGl0bGUtaGVhZGVyJykhLCAnb2Zmc2V0SGVpZ2h0JywgeyBjb25maWd1cmFibGU6IHRydWUsIHZhbHVlOiBoZWFkZXJIZWlnaHQgfSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGRlc2NyaXB0b3I6IElIYXJuZXNzRGVzY3JpcHRvciA9IHtcblx0XHRcdGlkOiAndGVzdCcsXG5cdFx0XHRsYWJlbDogJ1Rlc3QnLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5zZXR0aW5nc0dlYXIsXG5cdFx0XHRpdGVtUHJvdmlkZXI6IHtcblx0XHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdHByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zOiAoc2Vzc2lvblJlc291cmNlOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCksXG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGluc3RhU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHt9LCBkaXNwb3NhYmxlcyk7XG5cblx0XHRcdGluc3RhU2VydmljZS5zdHViKElQcm9tcHRzU2VydmljZSwge1xuXHRcdFx0XHRvbkRpZENoYW5nZUN1c3RvbUFnZW50czogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZENoYW5nZVNraWxsczogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRDaGFuZ2VIb29rczogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRDaGFuZ2VJbnN0cnVjdGlvbnM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdGxpc3RQcm9tcHRGaWxlczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRcdGdldEN1c3RvbUFnZW50czogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRcdGZpbmRBZ2VudFNraWxsczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRcdGdldEhvb2tzOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldEluc3RydWN0aW9uRmlsZXM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0XHRnZXREaXNhYmxlZFByb21wdEZpbGVzOiAoKSA9PiBuZXcgUmVzb3VyY2VTZXQoKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSwge1xuXHRcdFx0XHRhY3RpdmVQcm9qZWN0Um9vdDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0JywgdW5kZWZpbmVkKSxcblx0XHRcdFx0Z2V0QWN0aXZlUHJvamVjdFJvb3Q6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0bWFuYWdlbWVudFNlY3Rpb25zOiBbQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzXSxcblx0XHRcdFx0aXNTZXNzaW9uc1dpbmRvdzogZmFsc2UsXG5cdFx0XHRcdHdlbGNvbWVQYWdlRmVhdHVyZXM6IHsgc2hvd0dldHRpbmdTdGFydGVkQmFubmVyOiBmYWxzZSB9LFxuXHRcdFx0XHRnZXRTa2lsbFVJSW50ZWdyYXRpb25zOiAoKSA9PiBuZXcgTWFwKCksXG5cdFx0XHRcdGhhc092ZXJyaWRlUHJvamVjdFJvb3Q6IG9ic2VydmFibGVWYWx1ZSgndGVzdCcsIGZhbHNlKSxcblx0XHRcdFx0Y29tbWl0RmlsZXM6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0ZGVsZXRlRmlsZXM6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0Z2VuZXJhdGVDdXN0b21pemF0aW9uOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdHNldE92ZXJyaWRlUHJvamVjdFJvb3Q6ICgpID0+IHsgfSxcblx0XHRcdFx0Y2xlYXJPdmVycmlkZVByb2plY3RSb290OiAoKSA9PiB7IH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvblJlc291cmNlID0gb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0JywgVVJJLnBhcnNlKCd0ZXN0Oi8vL3Nlc3Npb24nKSk7XG5cdFx0XHRjb25zdCBhY3RpdmVIYXJuZXNzID0gZGVyaXZlZChyZWFkZXIgPT4gZ2V0Q2hhdFNlc3Npb25UeXBlKGFjdGl2ZVNlc3Npb25SZXNvdXJjZS5yZWFkKHJlYWRlcikpKTtcblxuXHRcdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSwge1xuXHRcdFx0XHRhY3RpdmVTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdGFjdGl2ZUhhcm5lc3MsXG5cdFx0XHRcdGF2YWlsYWJsZUhhcm5lc3Nlczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0JywgW2Rlc2NyaXB0b3JdKSxcblx0XHRcdFx0c2V0QWN0aXZlU2Vzc2lvbjogKCkgPT4geyB9LFxuXHRcdFx0XHRnZXRBY3RpdmVEZXNjcmlwdG9yOiAoKSA9PiBkZXNjcmlwdG9yLFxuXHRcdFx0XHRmaW5kSGFybmVzc0J5SWQ6IChpZCkgPT4gaWQgPT09IGRlc2NyaXB0b3IuaWQgPyBkZXNjcmlwdG9yIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZWdpc3RlckV4dGVybmFsSGFybmVzczogKCkgPT4gKHsgZGlzcG9zZSgpIHsgfSB9KSxcblx0XHRcdH0pO1xuXG5cdFx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJQWdlbnRQbHVnaW5TZXJ2aWNlLCB7XG5cdFx0XHRcdHBsdWdpbnM6IG9ic2VydmFibGVWYWx1ZSgndGVzdCcsIFtdKSxcblx0XHRcdFx0ZW5hYmxlbWVudE1vZGVsOiB7XG5cdFx0XHRcdFx0cmVhZEVuYWJsZWQ6ICgpID0+IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZSxcblx0XHRcdFx0XHRyZWFkUHJvZmlsZUVuYWJsZWQ6ICgpID0+IHRydWUsXG5cdFx0XHRcdFx0c2V0RW5hYmxlZDogKCkgPT4geyB9LFxuXHRcdFx0XHRcdHJlbW92ZTogKCkgPT4geyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGluc3RhU2VydmljZS5zdHViKElDb21tYW5kU2VydmljZSwge1xuXHRcdFx0XHRleGVjdXRlQ29tbWFuZDogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRvbldpbGxFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBUaGUgd2lkZ2V0IHJlYWRzIGl0ZW1zIGZyb20gdGhlIGl0ZW1zIG1vZGVsOyBzdHViIGl0IHdpdGggZW1wdHlcblx0XHRcdC8vIHBlci1zZWN0aW9uIG9ic2VydmFibGVzLiBUaGlzIGF2b2lkcyBuZWVkaW5nIHRvIHdpcmUgdXAgdGhlIGZ1bGxcblx0XHRcdC8vIFByb3ZpZGVyQ3VzdG9taXphdGlvbkl0ZW1Tb3VyY2UgcGlwZWxpbmUgaW4gdGVzdHMuXG5cdFx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCwge1xuXHRcdFx0XHRnZXRJdGVtczogKCkgPT4gb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0JywgW10gYXMgcmVhZG9ubHkgbmV2ZXJbXSksXG5cdFx0XHRcdGdldENvdW50OiAoKSA9PiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QnLCAwKSxcblx0XHRcdFx0Z2V0UGx1Z2luQ291bnQ6ICgpID0+IG9ic2VydmFibGVWYWx1ZSgndGVzdCcsIDApLFxuXHRcdFx0XHRnZXRBY3RpdmVJdGVtU291cmNlOiAoKSA9PiAoeyBvbkRpZEFJQ3VzdG9taXphdGlvbkl0ZW1zQ2hhbmdlOiBFdmVudC5Ob25lLCBmZXRjaFByb3ZpZGVySXRlbXM6IGFzeW5jICgpID0+IFtdLCBmZXRjaEFJQ3VzdG9taXphdGlvbkl0ZW1zOiBhc3luYyAoKSA9PiBbXSwgZmV0Y2hTb3VyY2VGb2xkZXJzOiBhc3luYyAoKSA9PiBbXSwgc2Vzc2lvblJlc291cmNlOiBhY3RpdmVTZXNzaW9uUmVzb3VyY2UuZ2V0KCksIGRpc3Bvc2UoKSB7IH0gfSksXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlYXJkb3duKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSk7XG5cblx0XHR0ZXN0KCdnZW5lcmF0ZURlYnVnUmVwb3J0IHJldHVybnMgZW1wdHkgc3RyaW5nIHdoZW4gd2lkZ2V0IGlzIGRpc3Bvc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShBSUN1c3RvbWl6YXRpb25MaXN0V2lkZ2V0KSk7XG5cdFx0XHR3aWRnZXQuZGlzcG9zZSgpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgd2lkZ2V0LmdlbmVyYXRlRGVidWdSZXBvcnQoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgdGhlIHJlbmRlcmVkIGNvbnRhaW5lciBoZWlnaHQgZm9yIGxpc3QgbGF5b3V0IHdoZW4gYXZhaWxhYmxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShBSUN1c3RvbWl6YXRpb25MaXN0V2lkZ2V0KSk7XG5cdFx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHdpZGdldC5lbGVtZW50KTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gd2lkZ2V0LmVsZW1lbnQucmVtb3ZlKCkpKTtcblxuXHRcdFx0c2V0TGF5b3V0SGVpZ2h0cyh3aWRnZXQsIDUwMCk7XG5cblx0XHRcdHdpZGdldC5sYXlvdXQoOTAwLCAzMjApO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5saXN0LWNvbnRhaW5lcicpIS5zdHlsZS5oZWlnaHQsICc0MzBweCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsbHMgYmFjayB0byBzdXBwbGllZCBsYXlvdXQgaGVpZ2h0IHdoZW4gcmVuZGVyZWQgY29udGFpbmVyIGhlaWdodCBpcyAwJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShBSUN1c3RvbWl6YXRpb25MaXN0V2lkZ2V0KSk7XG5cdFx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHdpZGdldC5lbGVtZW50KTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gd2lkZ2V0LmVsZW1lbnQucmVtb3ZlKCkpKTtcblxuXHRcdFx0c2V0TGF5b3V0SGVpZ2h0cyh3aWRnZXQsIDApO1xuXG5cdFx0XHR3aWRnZXQubGF5b3V0KDkwMCwgMzIwKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcubGlzdC1jb250YWluZXInKSEuc3R5bGUuaGVpZ2h0LCAnODMwcHgnKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFFcEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCLG9CQUFvQjtBQUM5QyxTQUFTLFNBQVMsdUJBQXVCO0FBQ3pDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsNEJBQTRCLCtCQUErQiwyQkFBMkI7QUFDL0YsU0FBUyxrQ0FBa0Msd0NBQXdDO0FBQ25GLFNBQVMsb0NBQXdEO0FBQ2pFLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZUFBZTtBQUN4QixTQUFTLG1CQUFtQjtBQUU1QixNQUFNLDZCQUE2QixNQUFNO0FBQ3hDLDBDQUF3QztBQUV4QyxRQUFNLHVCQUF1QixNQUFNO0FBQ2xDLFNBQUssaURBQWlELE1BQU07QUFDM0QsYUFBTztBQUFBLFFBQ04sb0JBQW9CLHlCQUF5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
