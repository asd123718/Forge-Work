import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { upcastPartial } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { InMemoryFileSystemProvider } from "../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { FileService } from "../../../../../../platform/files/common/fileService.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { CustomizationType } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { CustomizationEnablementKind } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { AgentCustomizationItemProvider } from "../../../browser/agentSessions/agentHost/agentCustomizationItemProvider.js";
import { NullAgentHostCustomizationService } from "../../../browser/agentSessions/agentHost/agentHostCustomizationService.js";
import { AICustomizationSources } from "../../../common/aiCustomizationWorkspaceService.js";
import { PromptsType } from "../../../common/promptSyntax/promptTypes.js";
import { SYNCED_CUSTOMIZATION_SCHEME } from "../../../../../../workbench/services/agentHost/common/agentHostFileSystemService.js";
suite("AgentCustomizationItemProvider", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("surfaces draft agents in management customizations before session state exists", async () => {
    class TestCustomizationService extends NullAgentHostCustomizationService {
      getWorkingDirectories() {
        return ["file:///workspace"];
      }
    }
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "local",
      void 0,
      void 0,
      upcastPartial({}),
      new NullLogService(),
      new TestCustomizationService()
    ));
    const agent = {
      type: CustomizationType.Agent,
      id: "file:///workspace/.github/agents/reviewer.agent.md",
      uri: "file:///workspace/.github/agents/reviewer.agent.md",
      name: "Reviewer",
      description: "Reviews changes",
      disableUserInvocation: true
    };
    provider.setDraftCustomAgents(observableValue("draftAgents", [agent]));
    const items = await provider.provideChatSessionCustomizations(URI.parse("agent-host-codex:///draft"), CancellationToken.None);
    assert.deepStrictEqual(items, [{
      itemKey: agent.id,
      uri: URI.parse(agent.uri),
      type: PromptsType.agent,
      name: agent.name,
      description: agent.description,
      source: AICustomizationSources.local,
      extensionId: void 0,
      pluginUri: void 0,
      enabled: true,
      userInvocable: false
    }]);
  });
  test("surfaces draft bundle agents skills and instructions before session state exists", async () => {
    const bundleUri = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/bundle" });
    const workspaceAgentUri = URI.file("/workspace/.github/agents/reviewer.agent.md");
    const workspaceSkillUri = URI.file("/workspace/.github/skills/review/SKILL.md");
    const workspaceInstructionsUri = URI.file("/workspace/.github/instructions/review.instructions.md");
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider(SYNCED_CUSTOMIZATION_SCHEME, disposables.add(new InMemoryFileSystemProvider())));
    await fileService.writeFile(URI.joinPath(bundleUri, "agents", "reviewer.agent.md"), VSBuffer.fromString("---\nname: Reviewer\ndescription: Reviews changes\n---\nReview carefully."));
    await fileService.writeFile(URI.joinPath(bundleUri, "skills", "review", "SKILL.md"), VSBuffer.fromString("---\nname: Review Skill\ndescription: Reviews code\n---\nReview code."));
    await fileService.writeFile(URI.joinPath(bundleUri, "rules", "review.instructions.md"), VSBuffer.fromString("---\nname: Review Instructions\ndescription: Review rules\n---\nFollow review rules."));
    class TestCustomizationService extends NullAgentHostCustomizationService {
      getWorkingDirectories() {
        return ["file:///workspace"];
      }
      getCustomizations() {
        return [];
      }
    }
    const origins = /* @__PURE__ */ new Map([
      [URI.joinPath(bundleUri, "agents", "reviewer.agent.md").toString(), workspaceAgentUri],
      [URI.joinPath(bundleUri, "skills", "review", "SKILL.md").toString(), workspaceSkillUri],
      [URI.joinPath(bundleUri, "rules", "review.instructions.md").toString(), workspaceInstructionsUri]
    ]);
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "local",
      void 0,
      (syncedUri) => {
        const uri = origins.get(syncedUri.toString());
        return uri ? { uri, source: AICustomizationSources.local } : void 0;
      },
      fileService,
      new NullLogService(),
      new TestCustomizationService()
    ));
    provider.setDraftCustomAgents(observableValue("draftAgents", [{
      type: CustomizationType.Agent,
      id: workspaceAgentUri.toString(),
      uri: workspaceAgentUri.toString(),
      name: "Reviewer",
      description: "Reviews changes"
    }]));
    provider.setDraftCustomizations(observableValue("draftCustomizations", [{
      type: CustomizationType.Plugin,
      id: bundleUri.toString(),
      uri: bundleUri.toString(),
      name: "VS Code Synced Data",
      nonce: "1"
    }]));
    const items = await provider.provideChatSessionCustomizations(URI.parse("agent-host-codex:///draft"), CancellationToken.None);
    assert.deepStrictEqual(items.map((item) => ({ type: item.type, name: item.name, uri: item.uri.toString() })), [
      { type: PromptsType.agent, name: "Reviewer", uri: workspaceAgentUri.toString() },
      { type: PromptsType.instructions, name: "Review Instructions", uri: workspaceInstructionsUri.toString() },
      { type: PromptsType.skill, name: "Review Skill", uri: workspaceSkillUri.toString() }
    ]);
  });
  test("surfaces only the host-published winning disabled reason", async () => {
    const customizations = [
      {
        type: CustomizationType.Plugin,
        id: "plugin-1",
        uri: "file:///plugins/one",
        name: "Plugin One",
        enablement: [
          { kind: CustomizationEnablementKind.Session, enabled: false },
          { kind: CustomizationEnablementKind.Global, enabled: true }
        ]
      },
      {
        type: CustomizationType.Plugin,
        id: "plugin-2",
        uri: "file:///plugins/two",
        name: "Plugin Two"
      }
    ];
    class TestCustomizationService extends NullAgentHostCustomizationService {
      getCustomizations() {
        return customizations;
      }
    }
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "local",
      void 0,
      void 0,
      upcastPartial({}),
      new NullLogService(),
      new TestCustomizationService()
    ));
    const items = await provider.provideChatSessionCustomizations(URI.parse("agent-host-codex:///session"), CancellationToken.None);
    assert.deepStrictEqual(items.map((item) => ({
      name: item.name,
      enabled: item.enabled,
      disabledReason: item.disabledReason
    })), [
      {
        name: "Plugin One",
        enabled: false,
        disabledReason: { source: "scope", scope: CustomizationEnablementKind.Session }
      },
      {
        name: "Plugin Two",
        enabled: true,
        disabledReason: void 0
      }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50Q3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgdXBjYXN0UGFydGlhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25UeXBlLCB0eXBlIEFnZW50Q3VzdG9taXphdGlvbiwgdHlwZSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uLCB0eXBlIEN1c3RvbWl6YXRpb24sIHR5cGUgUGx1Z2luQ3VzdG9taXphdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgQWdlbnRDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgTnVsbEFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FpQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdEZpbGVTeXN0ZW1TZXJ2aWNlLmpzJztcblxuc3VpdGUoJ0FnZW50Q3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlcicsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdzdXJmYWNlcyBkcmFmdCBhZ2VudHMgaW4gbWFuYWdlbWVudCBjdXN0b21pemF0aW9ucyBiZWZvcmUgc2Vzc2lvbiBzdGF0ZSBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y2xhc3MgVGVzdEN1c3RvbWl6YXRpb25TZXJ2aWNlIGV4dGVuZHMgTnVsbEFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIHtcblx0XHRcdG92ZXJyaWRlIGdldFdvcmtpbmdEaXJlY3RvcmllcygpOiByZWFkb25seSBzdHJpbmdbXSB7XG5cdFx0XHRcdHJldHVybiBbJ2ZpbGU6Ly8vd29ya3NwYWNlJ107XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlcihcblx0XHRcdCdsb2NhbCcsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1cGNhc3RQYXJ0aWFsPElGaWxlU2VydmljZT4oe30pLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRuZXcgVGVzdEN1c3RvbWl6YXRpb25TZXJ2aWNlKCksXG5cdFx0KSk7XG5cdFx0Y29uc3QgYWdlbnQ6IEFnZW50Q3VzdG9taXphdGlvbiA9IHtcblx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50LFxuXHRcdFx0aWQ6ICdmaWxlOi8vL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9yZXZpZXdlci5hZ2VudC5tZCcsXG5cdFx0XHR1cmk6ICdmaWxlOi8vL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9yZXZpZXdlci5hZ2VudC5tZCcsXG5cdFx0XHRuYW1lOiAnUmV2aWV3ZXInLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdSZXZpZXdzIGNoYW5nZXMnLFxuXHRcdFx0ZGlzYWJsZVVzZXJJbnZvY2F0aW9uOiB0cnVlLFxuXHRcdH07XG5cdFx0cHJvdmlkZXIuc2V0RHJhZnRDdXN0b21BZ2VudHMob2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IEFnZW50Q3VzdG9taXphdGlvbltdPignZHJhZnRBZ2VudHMnLCBbYWdlbnRdKSk7XG5cblx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb2RleDovLy9kcmFmdCcpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMsIFt7XG5cdFx0XHRpdGVtS2V5OiBhZ2VudC5pZCxcblx0XHRcdHVyaTogVVJJLnBhcnNlKGFnZW50LnVyaSksXG5cdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5hZ2VudCxcblx0XHRcdG5hbWU6IGFnZW50Lm5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogYWdlbnQuZGVzY3JpcHRpb24sXG5cdFx0XHRzb3VyY2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZXMubG9jYWwsXG5cdFx0XHRleHRlbnNpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0cGx1Z2luVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0dXNlckludm9jYWJsZTogZmFsc2UsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdXJmYWNlcyBkcmFmdCBidW5kbGUgYWdlbnRzIHNraWxscyBhbmQgaW5zdHJ1Y3Rpb25zIGJlZm9yZSBzZXNzaW9uIHN0YXRlIGV4aXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL2J1bmRsZScgfSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlQWdlbnRVcmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9yZXZpZXdlci5hZ2VudC5tZCcpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVNraWxsVXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvcmV2aWV3L1NLSUxMLm1kJyk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlSW5zdHJ1Y3Rpb25zVXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvcmV2aWV3Lmluc3RydWN0aW9ucy5tZCcpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuam9pblBhdGgoYnVuZGxlVXJpLCAnYWdlbnRzJywgJ3Jldmlld2VyLmFnZW50Lm1kJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJy0tLVxcbm5hbWU6IFJldmlld2VyXFxuZGVzY3JpcHRpb246IFJldmlld3MgY2hhbmdlc1xcbi0tLVxcblJldmlldyBjYXJlZnVsbHkuJykpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuam9pblBhdGgoYnVuZGxlVXJpLCAnc2tpbGxzJywgJ3JldmlldycsICdTS0lMTC5tZCcpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCctLS1cXG5uYW1lOiBSZXZpZXcgU2tpbGxcXG5kZXNjcmlwdGlvbjogUmV2aWV3cyBjb2RlXFxuLS0tXFxuUmV2aWV3IGNvZGUuJykpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuam9pblBhdGgoYnVuZGxlVXJpLCAncnVsZXMnLCAncmV2aWV3Lmluc3RydWN0aW9ucy5tZCcpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCctLS1cXG5uYW1lOiBSZXZpZXcgSW5zdHJ1Y3Rpb25zXFxuZGVzY3JpcHRpb246IFJldmlldyBydWxlc1xcbi0tLVxcbkZvbGxvdyByZXZpZXcgcnVsZXMuJykpO1xuXG5cdFx0Y2xhc3MgVGVzdEN1c3RvbWl6YXRpb25TZXJ2aWNlIGV4dGVuZHMgTnVsbEFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIHtcblx0XHRcdG92ZXJyaWRlIGdldFdvcmtpbmdEaXJlY3RvcmllcygpOiByZWFkb25seSBzdHJpbmdbXSB7XG5cdFx0XHRcdHJldHVybiBbJ2ZpbGU6Ly8vd29ya3NwYWNlJ107XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBnZXRDdXN0b21pemF0aW9ucygpOiByZWFkb25seSBDdXN0b21pemF0aW9uW10ge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3JpZ2lucyA9IG5ldyBNYXAoW1xuXHRcdFx0W1VSSS5qb2luUGF0aChidW5kbGVVcmksICdhZ2VudHMnLCAncmV2aWV3ZXIuYWdlbnQubWQnKS50b1N0cmluZygpLCB3b3Jrc3BhY2VBZ2VudFVyaV0sXG5cdFx0XHRbVVJJLmpvaW5QYXRoKGJ1bmRsZVVyaSwgJ3NraWxscycsICdyZXZpZXcnLCAnU0tJTEwubWQnKS50b1N0cmluZygpLCB3b3Jrc3BhY2VTa2lsbFVyaV0sXG5cdFx0XHRbVVJJLmpvaW5QYXRoKGJ1bmRsZVVyaSwgJ3J1bGVzJywgJ3Jldmlldy5pbnN0cnVjdGlvbnMubWQnKS50b1N0cmluZygpLCB3b3Jrc3BhY2VJbnN0cnVjdGlvbnNVcmldLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIoXG5cdFx0XHQnbG9jYWwnLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0c3luY2VkVXJpID0+IHtcblx0XHRcdFx0Y29uc3QgdXJpID0gb3JpZ2lucy5nZXQoc3luY2VkVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRyZXR1cm4gdXJpID8geyB1cmksIHNvdXJjZTogQUlDdXN0b21pemF0aW9uU291cmNlcy5sb2NhbCB9IDogdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRuZXcgVGVzdEN1c3RvbWl6YXRpb25TZXJ2aWNlKCksXG5cdFx0KSk7XG5cdFx0cHJvdmlkZXIuc2V0RHJhZnRDdXN0b21BZ2VudHMob2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IEFnZW50Q3VzdG9taXphdGlvbltdPignZHJhZnRBZ2VudHMnLCBbe1xuXHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuQWdlbnQsXG5cdFx0XHRpZDogd29ya3NwYWNlQWdlbnRVcmkudG9TdHJpbmcoKSxcblx0XHRcdHVyaTogd29ya3NwYWNlQWdlbnRVcmkudG9TdHJpbmcoKSxcblx0XHRcdG5hbWU6ICdSZXZpZXdlcicsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ1Jldmlld3MgY2hhbmdlcycsXG5cdFx0fV0pKTtcblx0XHRwcm92aWRlci5zZXREcmFmdEN1c3RvbWl6YXRpb25zKG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10+KCdkcmFmdEN1c3RvbWl6YXRpb25zJywgW3tcblx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdGlkOiBidW5kbGVVcmkudG9TdHJpbmcoKSxcblx0XHRcdHVyaTogYnVuZGxlVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRuYW1lOiAnVlMgQ29kZSBTeW5jZWQgRGF0YScsXG5cdFx0XHRub25jZTogJzEnLFxuXHRcdH1dKSk7XG5cblx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb2RleDovLy9kcmFmdCcpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMubWFwKGl0ZW0gPT4gKHsgdHlwZTogaXRlbS50eXBlLCBuYW1lOiBpdGVtLm5hbWUsIHVyaTogaXRlbS51cmkudG9TdHJpbmcoKSB9KSksIFtcblx0XHRcdHsgdHlwZTogUHJvbXB0c1R5cGUuYWdlbnQsIG5hbWU6ICdSZXZpZXdlcicsIHVyaTogd29ya3NwYWNlQWdlbnRVcmkudG9TdHJpbmcoKSB9LFxuXHRcdFx0eyB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIG5hbWU6ICdSZXZpZXcgSW5zdHJ1Y3Rpb25zJywgdXJpOiB3b3Jrc3BhY2VJbnN0cnVjdGlvbnNVcmkudG9TdHJpbmcoKSB9LFxuXHRcdFx0eyB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCwgbmFtZTogJ1JldmlldyBTa2lsbCcsIHVyaTogd29ya3NwYWNlU2tpbGxVcmkudG9TdHJpbmcoKSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdXJmYWNlcyBvbmx5IHRoZSBob3N0LXB1Ymxpc2hlZCB3aW5uaW5nIGRpc2FibGVkIHJlYXNvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjdXN0b21pemF0aW9uczogUGx1Z2luQ3VzdG9taXphdGlvbltdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0XHRcdGlkOiAncGx1Z2luLTEnLFxuXHRcdFx0XHR1cmk6ICdmaWxlOi8vL3BsdWdpbnMvb25lJyxcblx0XHRcdFx0bmFtZTogJ1BsdWdpbiBPbmUnLFxuXHRcdFx0XHRlbmFibGVtZW50OiBbXG5cdFx0XHRcdFx0eyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuU2Vzc2lvbiwgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdFx0XHR7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IHRydWUgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdFx0aWQ6ICdwbHVnaW4tMicsXG5cdFx0XHRcdHVyaTogJ2ZpbGU6Ly8vcGx1Z2lucy90d28nLFxuXHRcdFx0XHRuYW1lOiAnUGx1Z2luIFR3bycsXG5cdFx0XHR9LFxuXHRcdF07XG5cdFx0Y2xhc3MgVGVzdEN1c3RvbWl6YXRpb25TZXJ2aWNlIGV4dGVuZHMgTnVsbEFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIHtcblx0XHRcdG92ZXJyaWRlIGdldEN1c3RvbWl6YXRpb25zKCk6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSB7XG5cdFx0XHRcdHJldHVybiBjdXN0b21pemF0aW9ucztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyKFxuXHRcdFx0J2xvY2FsJyxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVwY2FzdFBhcnRpYWw8SUZpbGVTZXJ2aWNlPih7fSksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdG5ldyBUZXN0Q3VzdG9taXphdGlvblNlcnZpY2UoKSxcblx0XHQpKTtcblx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb2RleDovLy9zZXNzaW9uJyksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcy5tYXAoaXRlbSA9PiAoe1xuXHRcdFx0bmFtZTogaXRlbS5uYW1lLFxuXHRcdFx0ZW5hYmxlZDogaXRlbS5lbmFibGVkLFxuXHRcdFx0ZGlzYWJsZWRSZWFzb246IGl0ZW0uZGlzYWJsZWRSZWFzb24sXG5cdFx0fSkpLCBbXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6ICdQbHVnaW4gT25lJyxcblx0XHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdGRpc2FibGVkUmVhc29uOiB7IHNvdXJjZTogJ3Njb3BlJywgc2NvcGU6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5TZXNzaW9uIH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiAnUGx1Z2luIFR3bycsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGRpc2FibGVkUmVhc29uOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdz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
