import assert from "assert";
import { mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { AgentHostConfigKey } from "../../../../common/agentHostCustomizationConfig.js";
import { customizationId, CustomizationType, ROOT_STATE_URI } from "../../../../common/state/sessionState.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import { createRealSession, driveTurnToCompletion } from "../harness/agentHostE2ETestHarness.js";
import { getActionEnvelope, isActionNotification } from "../../serverIntegrationTestHelpers.js";
function defineCustomizationDiscoveryTests(context) {
  const { config, createdSessions, tempDirs } = context;
  const enabled = context.tier === "parity" && config.provider === "copilotcli";
  function copilotTest(title, run) {
    if (context.tier !== "parity") {
      return;
    }
    (enabled ? test : test.skip)(title, function() {
      this.timeout(18e4);
      return run.call(this);
    });
  }
  function createWorkspace(prefix) {
    const workspace = mkdtempSync(join(tmpdir(), `ahp-customizations-${prefix}-`));
    tempDirs.push(workspace);
    mkdirSync(join(workspace, ".git"), { recursive: true });
    return workspace;
  }
  async function createDiscoverySession(prefix, workspace, mode, customizations) {
    const sessionUri = await createRealSession(context.client, config, `customizations-${prefix}`, createdSessions, URI.file(workspace));
    context.client.dispatch({
      channel: ROOT_STATE_URI,
      clientSeq: 1,
      action: { type: ActionType.RootConfigChanged, config: { [AgentHostConfigKey.SessionCustomizationDiscoveryMode]: mode } }
    });
    if (customizations) {
      context.client.dispatch({
        channel: sessionUri,
        clientSeq: 2,
        action: {
          type: ActionType.SessionActiveClientSet,
          activeClient: { clientId: `customizations-${prefix}`, tools: [], customizations: [...customizations] }
        }
      });
      await context.client.waitForNotification(
        (n) => isActionNotification(n, "session/activeClientSet") && getActionEnvelope(n).channel === sessionUri,
        3e4
      );
    }
    await driveTurnToCompletion(context.client, sessionUri, `turn-${prefix}`, 'Reply exactly "READY".', customizations ? 3 : 2);
    return sessionUri;
  }
  async function sessionCustomizations(sessionUri) {
    const read = async () => {
      const result = await context.client.call("subscribe", { channel: sessionUri });
      return result.snapshot.state.customizations ?? [];
    };
    let customizations = await read();
    if (customizations.length === 0) {
      await context.client.waitForNotification(
        (n) => isActionNotification(n, "session/customizationsChanged") && getActionEnvelope(n).channel === sessionUri && getActionEnvelope(n).action.customizations.length > 0,
        6e4
      );
      customizations = await read();
    }
    return customizations;
  }
  function directoryChildren(customizations, directory) {
    const found = customizations.find((customization) => customization.type === CustomizationType.Directory && customization.uri === URI.file(directory).toString());
    return (found?.children ?? []).map((child) => child.uri).sort();
  }
  function writeWorkspaceCustomizations(workspace) {
    const agent = join(workspace, ".github", "agents", "hello.agent.md");
    const instruction = join(workspace, ".github", "instructions", "policy.instructions.md");
    const skill = join(workspace, ".github", "skills", "hello-skill", "SKILL.md");
    const hook = join(workspace, ".github", "hooks", "pre-tool.json");
    for (const directory of [join(workspace, ".github", "agents"), join(workspace, ".github", "instructions"), join(workspace, ".github", "skills", "hello-skill"), join(workspace, ".github", "hooks")]) {
      mkdirSync(directory, { recursive: true });
    }
    writeFileSync(agent, "---\nname: Hello Agent\ndescription: Handles hello requests\n---\nYou are a test agent.");
    writeFileSync(instruction, '---\napplyTo:\n  - "**/*"\n---\nPrefer short answers.');
    writeFileSync(skill, "---\nname: hello-skill\ndescription: Says hello\n---\nReturn a greeting.");
    writeFileSync(hook, JSON.stringify({ PreToolUse: [] }));
    return { agent, instruction, skill, hook };
  }
  for (const mode of ["scan", "discover"]) {
    copilotTest(`customization discovery: ${mode} finds workspace agents instructions skills and hooks`, async function() {
      const workspace = createWorkspace(`all-${mode}`);
      const files = writeWorkspaceCustomizations(workspace);
      const sessionUri = await createDiscoverySession(`all-${mode}`, workspace, mode);
      const customizations = await sessionCustomizations(sessionUri);
      assert.deepStrictEqual({
        agents: directoryChildren(customizations, join(workspace, ".github", "agents")),
        instructions: directoryChildren(customizations, join(workspace, ".github", "instructions")),
        skills: directoryChildren(customizations, join(workspace, ".github", "skills")),
        hooks: directoryChildren(customizations, join(workspace, ".github", "hooks"))
      }, {
        agents: [URI.file(files.agent).toString()],
        instructions: [URI.file(files.instruction).toString()],
        skills: [URI.file(files.skill).toString()],
        hooks: [URI.file(files.hook).toString()]
      });
    });
  }
  copilotTest("customization discovery: discover groups fixed agent instruction files at the workspace root", async function() {
    const workspace = createWorkspace("agent-instructions");
    const files = [
      join(workspace, "AGENTS.md"),
      join(workspace, "CLAUDE.md"),
      join(workspace, ".github", "copilot-instructions.md")
    ];
    mkdirSync(join(workspace, ".github"), { recursive: true });
    for (const file of files) {
      writeFileSync(file, `Instructions from ${file}`);
    }
    const sessionUri = await createDiscoverySession("agent-instructions", workspace, "discover");
    const customizations = await sessionCustomizations(sessionUri);
    assert.deepStrictEqual(directoryChildren(customizations, workspace), files.map((file) => URI.file(file).toString()).sort());
  });
  copilotTest("customization discovery: configured plugin exposes its agent rule and skill children", async function() {
    const workspace = createWorkspace("plugin");
    const plugin = join(workspace, "plugin");
    mkdirSync(join(plugin, ".plugin"), { recursive: true });
    mkdirSync(join(plugin, "agents"), { recursive: true });
    mkdirSync(join(plugin, "rules"), { recursive: true });
    mkdirSync(join(plugin, "skills", "plugin-skill"), { recursive: true });
    writeFileSync(join(plugin, ".plugin", "plugin.json"), JSON.stringify({ name: "E2E Plugin" }));
    writeFileSync(join(plugin, "agents", "plugin.agent.md"), "---\nname: Plugin Agent\ndescription: Plugin agent\n---\nAct.");
    writeFileSync(join(plugin, "rules", "plugin.instructions.md"), '---\nname: Plugin Rule\napplyTo:\n  - "**/*"\n---\nRule.');
    writeFileSync(join(plugin, "skills", "plugin-skill", "SKILL.md"), "---\nname: plugin-skill\ndescription: Plugin skill\n---\nSkill.");
    const pluginUri = URI.file(plugin).toString();
    const clientCustomization = {
      type: CustomizationType.Plugin,
      id: customizationId(pluginUri),
      uri: pluginUri,
      name: "E2E Plugin",
      nonce: "1"
    };
    const sessionUri = await createDiscoverySession("plugin", workspace, "discover", [clientCustomization]);
    await context.client.waitForNotification((n) => {
      if (!isActionNotification(n, "session/customizationUpdated") || getActionEnvelope(n).channel !== sessionUri) {
        return false;
      }
      return getActionEnvelope(n).action.customization?.uri === pluginUri;
    }, 6e4);
    const customizations = await sessionCustomizations(sessionUri);
    const loaded = customizations.find((customization) => customization.type === CustomizationType.Plugin && customization.uri === pluginUri);
    assert.deepStrictEqual(
      (loaded?.children ?? []).map((child) => ({ type: child.type, name: child.name })).sort((a, b) => a.name.localeCompare(b.name)),
      [
        { type: CustomizationType.Agent, name: "Plugin Agent" },
        { type: CustomizationType.Rule, name: "plugin" },
        { type: CustomizationType.Skill, name: "plugin-skill" }
      ].sort((a, b) => a.name.localeCompare(b.name))
    );
  });
  copilotTest("customization discovery: filesystem watcher publishes a newly added agent", async function() {
    const workspace = createWorkspace("watch-agent");
    const agentsDirectory = join(workspace, ".github", "agents");
    const initial = join(agentsDirectory, "initial.agent.md");
    const added = join(agentsDirectory, "added.agent.md");
    mkdirSync(agentsDirectory, { recursive: true });
    writeFileSync(initial, "---\nname: Initial Agent\ndescription: Initial\n---\nInitial.");
    const sessionUri = await createDiscoverySession("watch-agent", workspace, "discover");
    await sessionCustomizations(sessionUri);
    context.client.clearReceived();
    writeFileSync(added, "---\nname: Added Agent\ndescription: Added\n---\nAdded.");
    await context.client.waitForNotification((n) => {
      if (!isActionNotification(n, "session/customizationsChanged") || getActionEnvelope(n).channel !== sessionUri) {
        return false;
      }
      const action = getActionEnvelope(n).action;
      return action.customizations.some((customization) => customization.type === CustomizationType.Directory && customization.uri === URI.file(agentsDirectory).toString() && customization.children?.some((child) => child.uri === URI.file(added).toString()));
    }, 6e4);
    assert.deepStrictEqual(directoryChildren(await sessionCustomizations(sessionUri), agentsDirectory), [
      URI.file(added).toString(),
      URI.file(initial).toString()
    ].sort());
  });
  copilotTest("customization discovery: filesystem watcher removes a deleted agent", async function() {
    const workspace = createWorkspace("watch-agent-delete");
    const agentsDirectory = join(workspace, ".github", "agents");
    const retained = join(agentsDirectory, "retained.agent.md");
    const removed = join(agentsDirectory, "removed.agent.md");
    mkdirSync(agentsDirectory, { recursive: true });
    writeFileSync(retained, "---\nname: Retained Agent\ndescription: Retained\n---\nRetained.");
    writeFileSync(removed, "---\nname: Removed Agent\ndescription: Removed\n---\nRemoved.");
    const sessionUri = await createDiscoverySession("watch-agent-delete", workspace, "discover");
    await sessionCustomizations(sessionUri);
    context.client.clearReceived();
    unlinkSync(removed);
    await context.client.waitForNotification((n) => {
      if (!isActionNotification(n, "session/customizationsChanged") || getActionEnvelope(n).channel !== sessionUri) {
        return false;
      }
      const action = getActionEnvelope(n).action;
      const directory = action.customizations.find((customization) => customization.type === CustomizationType.Directory && customization.uri === URI.file(agentsDirectory).toString());
      return directory !== void 0 && !!directory.children?.some((child) => child.uri === URI.file(retained).toString()) && !directory.children?.some((child) => child.uri === URI.file(removed).toString());
    }, 6e4);
    assert.deepStrictEqual(directoryChildren(await sessionCustomizations(sessionUri), agentsDirectory), [URI.file(retained).toString()]);
  });
  copilotTest("customization discovery: filesystem watcher updates an edited agent", async function() {
    const workspace = createWorkspace("watch-agent-update");
    const agentsDirectory = join(workspace, ".github", "agents");
    const agentFile = join(agentsDirectory, "editable.agent.md");
    mkdirSync(agentsDirectory, { recursive: true });
    writeFileSync(agentFile, "---\nname: Before Agent\ndescription: Before\n---\nBefore.");
    const sessionUri = await createDiscoverySession("watch-agent-update", workspace, "discover");
    await sessionCustomizations(sessionUri);
    context.client.clearReceived();
    writeFileSync(agentFile, "---\nname: After Agent\ndescription: After\n---\nAfter.");
    await context.client.waitForNotification((n) => {
      if (!isActionNotification(n, "session/customizationsChanged") || getActionEnvelope(n).channel !== sessionUri) {
        return false;
      }
      const action = getActionEnvelope(n).action;
      const directory2 = action.customizations.find((customization) => customization.type === CustomizationType.Directory && customization.uri === URI.file(agentsDirectory).toString());
      return directory2?.children?.some((child) => child.uri === URI.file(agentFile).toString() && child.name === "After Agent") ?? false;
    }, 6e4);
    const customizations = await sessionCustomizations(sessionUri);
    const directory = customizations.find((customization) => customization.type === CustomizationType.Directory && customization.uri === URI.file(agentsDirectory).toString());
    assert.deepStrictEqual(directory?.children?.map((child) => ({ uri: child.uri, name: child.name })), [{
      uri: URI.file(agentFile).toString(),
      name: "After Agent"
    }]);
  });
}
export {
  defineCustomizationDiscoveryTests
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxlMmVcXHN1aXRlc1xcY3VzdG9taXphdGlvbkRpc2NvdmVyeVN1aXRlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbWtkaXJTeW5jLCBta2R0ZW1wU3luYywgdW5saW5rU3luYywgd3JpdGVGaWxlU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IHRtcGRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb25maWdLZXksIHR5cGUgU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnlNb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2FnZW50SG9zdEN1c3RvbWl6YXRpb25Db25maWcuanMnO1xuaW1wb3J0IHsgY3VzdG9taXphdGlvbklkLCBDdXN0b21pemF0aW9uVHlwZSwgUk9PVF9TVEFURV9VUkksIHR5cGUgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbiwgdHlwZSBDdXN0b21pemF0aW9uLCB0eXBlIERpcmVjdG9yeUN1c3RvbWl6YXRpb24sIHR5cGUgUGx1Z2luQ3VzdG9taXphdGlvbiwgdHlwZSBTZXNzaW9uU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIHR5cGUgU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IFN1YnNjcmliZVJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVSZWFsU2Vzc2lvbiwgZHJpdmVUdXJuVG9Db21wbGV0aW9uIH0gZnJvbSAnLi4vaGFybmVzcy9hZ2VudEhvc3RFMkVUZXN0SGFybmVzcy5qcyc7XG5pbXBvcnQgeyBnZXRBY3Rpb25FbnZlbG9wZSwgaXNBY3Rpb25Ob3RpZmljYXRpb24gfSBmcm9tICcuLi8uLi9zZXJ2ZXJJbnRlZ3JhdGlvblRlc3RIZWxwZXJzLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50SG9zdEUyRVRlc3RDb250ZXh0IH0gZnJvbSAnLi9lMmVUZXN0Q29udGV4dC5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWZpbmVDdXN0b21pemF0aW9uRGlzY292ZXJ5VGVzdHMoY29udGV4dDogSUFnZW50SG9zdEUyRVRlc3RDb250ZXh0KTogdm9pZCB7XG5cdGNvbnN0IHsgY29uZmlnLCBjcmVhdGVkU2Vzc2lvbnMsIHRlbXBEaXJzIH0gPSBjb250ZXh0O1xuXHRjb25zdCBlbmFibGVkID0gY29udGV4dC50aWVyID09PSAncGFyaXR5JyAmJiBjb25maWcucHJvdmlkZXIgPT09ICdjb3BpbG90Y2xpJztcblxuXHRmdW5jdGlvbiBjb3BpbG90VGVzdCh0aXRsZTogc3RyaW5nLCBydW46IE1vY2hhLkFzeW5jRnVuYyk6IHZvaWQge1xuXHRcdGlmIChjb250ZXh0LnRpZXIgIT09ICdwYXJpdHknKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdChlbmFibGVkID8gdGVzdCA6IHRlc3Quc2tpcCkodGl0bGUsIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRcdHJldHVybiBydW4uY2FsbCh0aGlzKTtcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVdvcmtzcGFjZShwcmVmaXg6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgYGFocC1jdXN0b21pemF0aW9ucy0ke3ByZWZpeH0tYCkpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya3NwYWNlKTtcblx0XHRta2RpclN5bmMoam9pbih3b3Jrc3BhY2UsICcuZ2l0JyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdHJldHVybiB3b3Jrc3BhY2U7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBjcmVhdGVEaXNjb3ZlcnlTZXNzaW9uKHByZWZpeDogc3RyaW5nLCB3b3Jrc3BhY2U6IHN0cmluZywgbW9kZTogU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnlNb2RlLCBjdXN0b21pemF0aW9ucz86IHJlYWRvbmx5IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNvbnRleHQuY2xpZW50LCBjb25maWcsIGBjdXN0b21pemF0aW9ucy0ke3ByZWZpeH1gLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtzcGFjZSkpO1xuXHRcdGNvbnRleHQuY2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0Y2xpZW50U2VxOiAxLFxuXHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsIGNvbmZpZzogeyBbQWdlbnRIb3N0Q29uZmlnS2V5LlNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5TW9kZV06IG1vZGUgfSB9LFxuXHRcdH0pO1xuXHRcdGlmIChjdXN0b21pemF0aW9ucykge1xuXHRcdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0XHRjaGFubmVsOiBzZXNzaW9uVXJpLFxuXHRcdFx0XHRjbGllbnRTZXE6IDIsXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdFx0XHRhY3RpdmVDbGllbnQ6IHsgY2xpZW50SWQ6IGBjdXN0b21pemF0aW9ucy0ke3ByZWZpeH1gLCB0b29sczogW10sIGN1c3RvbWl6YXRpb25zOiBbLi4uY3VzdG9taXphdGlvbnNdIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnc2Vzc2lvbi9hY3RpdmVDbGllbnRTZXQnKSAmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBzZXNzaW9uVXJpLFxuXHRcdFx0XHQzMF8wMDAsXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksIGB0dXJuLSR7cHJlZml4fWAsICdSZXBseSBleGFjdGx5IFwiUkVBRFlcIi4nLCBjdXN0b21pemF0aW9ucyA/IDMgOiAyKTtcblx0XHRyZXR1cm4gc2Vzc2lvblVyaTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHNlc3Npb25DdXN0b21pemF0aW9ucyhzZXNzaW9uVXJpOiBzdHJpbmcpOiBQcm9taXNlPHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXT4ge1xuXHRcdGNvbnN0IHJlYWQgPSBhc3luYyAoKTogUHJvbWlzZTxyZWFkb25seSBDdXN0b21pemF0aW9uW10+ID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBzZXNzaW9uVXJpIH0pO1xuXHRcdFx0cmV0dXJuIChyZXN1bHQuc25hcHNob3QhLnN0YXRlIGFzIFNlc3Npb25TdGF0ZSkuY3VzdG9taXphdGlvbnMgPz8gW107XG5cdFx0fTtcblx0XHRsZXQgY3VzdG9taXphdGlvbnMgPSBhd2FpdCByZWFkKCk7XG5cdFx0aWYgKGN1c3RvbWl6YXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0YXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdzZXNzaW9uL2N1c3RvbWl6YXRpb25zQ2hhbmdlZCcpXG5cdFx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IHNlc3Npb25Vcmlcblx0XHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBTZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkQWN0aW9uKS5jdXN0b21pemF0aW9ucy5sZW5ndGggPiAwLFxuXHRcdFx0XHQ2MF8wMDAsXG5cdFx0XHQpO1xuXHRcdFx0Y3VzdG9taXphdGlvbnMgPSBhd2FpdCByZWFkKCk7XG5cdFx0fVxuXHRcdHJldHVybiBjdXN0b21pemF0aW9ucztcblx0fVxuXG5cdGZ1bmN0aW9uIGRpcmVjdG9yeUNoaWxkcmVuKGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10sIGRpcmVjdG9yeTogc3RyaW5nKTogcmVhZG9ubHkgc3RyaW5nW10ge1xuXHRcdGNvbnN0IGZvdW5kID0gY3VzdG9taXphdGlvbnMuZmluZCgoY3VzdG9taXphdGlvbik6IGN1c3RvbWl6YXRpb24gaXMgRGlyZWN0b3J5Q3VzdG9taXphdGlvbiA9PlxuXHRcdFx0Y3VzdG9taXphdGlvbi50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5EaXJlY3RvcnkgJiYgY3VzdG9taXphdGlvbi51cmkgPT09IFVSSS5maWxlKGRpcmVjdG9yeSkudG9TdHJpbmcoKSk7XG5cdFx0cmV0dXJuIChmb3VuZD8uY2hpbGRyZW4gPz8gW10pLm1hcChjaGlsZCA9PiBjaGlsZC51cmkpLnNvcnQoKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHdyaXRlV29ya3NwYWNlQ3VzdG9taXphdGlvbnMod29ya3NwYWNlOiBzdHJpbmcpOiB7XG5cdFx0cmVhZG9ubHkgYWdlbnQ6IHN0cmluZztcblx0XHRyZWFkb25seSBpbnN0cnVjdGlvbjogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHNraWxsOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgaG9vazogc3RyaW5nO1xuXHR9IHtcblx0XHRjb25zdCBhZ2VudCA9IGpvaW4od29ya3NwYWNlLCAnLmdpdGh1YicsICdhZ2VudHMnLCAnaGVsbG8uYWdlbnQubWQnKTtcblx0XHRjb25zdCBpbnN0cnVjdGlvbiA9IGpvaW4od29ya3NwYWNlLCAnLmdpdGh1YicsICdpbnN0cnVjdGlvbnMnLCAncG9saWN5Lmluc3RydWN0aW9ucy5tZCcpO1xuXHRcdGNvbnN0IHNraWxsID0gam9pbih3b3Jrc3BhY2UsICcuZ2l0aHViJywgJ3NraWxscycsICdoZWxsby1za2lsbCcsICdTS0lMTC5tZCcpO1xuXHRcdGNvbnN0IGhvb2sgPSBqb2luKHdvcmtzcGFjZSwgJy5naXRodWInLCAnaG9va3MnLCAncHJlLXRvb2wuanNvbicpO1xuXHRcdGZvciAoY29uc3QgZGlyZWN0b3J5IG9mIFtqb2luKHdvcmtzcGFjZSwgJy5naXRodWInLCAnYWdlbnRzJyksIGpvaW4od29ya3NwYWNlLCAnLmdpdGh1YicsICdpbnN0cnVjdGlvbnMnKSwgam9pbih3b3Jrc3BhY2UsICcuZ2l0aHViJywgJ3NraWxscycsICdoZWxsby1za2lsbCcpLCBqb2luKHdvcmtzcGFjZSwgJy5naXRodWInLCAnaG9va3MnKV0pIHtcblx0XHRcdG1rZGlyU3luYyhkaXJlY3RvcnksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdH1cblx0XHR3cml0ZUZpbGVTeW5jKGFnZW50LCAnLS0tXFxubmFtZTogSGVsbG8gQWdlbnRcXG5kZXNjcmlwdGlvbjogSGFuZGxlcyBoZWxsbyByZXF1ZXN0c1xcbi0tLVxcbllvdSBhcmUgYSB0ZXN0IGFnZW50LicpO1xuXHRcdHdyaXRlRmlsZVN5bmMoaW5zdHJ1Y3Rpb24sICctLS1cXG5hcHBseVRvOlxcbiAgLSBcIioqLypcIlxcbi0tLVxcblByZWZlciBzaG9ydCBhbnN3ZXJzLicpO1xuXHRcdHdyaXRlRmlsZVN5bmMoc2tpbGwsICctLS1cXG5uYW1lOiBoZWxsby1za2lsbFxcbmRlc2NyaXB0aW9uOiBTYXlzIGhlbGxvXFxuLS0tXFxuUmV0dXJuIGEgZ3JlZXRpbmcuJyk7XG5cdFx0d3JpdGVGaWxlU3luYyhob29rLCBKU09OLnN0cmluZ2lmeSh7IFByZVRvb2xVc2U6IFtdIH0pKTtcblx0XHRyZXR1cm4geyBhZ2VudCwgaW5zdHJ1Y3Rpb24sIHNraWxsLCBob29rIH07XG5cdH1cblxuXHRmb3IgKGNvbnN0IG1vZGUgb2YgWydzY2FuJywgJ2Rpc2NvdmVyJ10gYXMgY29uc3QpIHtcblx0XHRjb3BpbG90VGVzdChgY3VzdG9taXphdGlvbiBkaXNjb3Zlcnk6ICR7bW9kZX0gZmluZHMgd29ya3NwYWNlIGFnZW50cyBpbnN0cnVjdGlvbnMgc2tpbGxzIGFuZCBob29rc2AsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IGNyZWF0ZVdvcmtzcGFjZShgYWxsLSR7bW9kZX1gKTtcblx0XHRcdGNvbnN0IGZpbGVzID0gd3JpdGVXb3Jrc3BhY2VDdXN0b21pemF0aW9ucyh3b3Jrc3BhY2UpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZURpc2NvdmVyeVNlc3Npb24oYGFsbC0ke21vZGV9YCwgd29ya3NwYWNlLCBtb2RlKTtcblx0XHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zID0gYXdhaXQgc2Vzc2lvbkN1c3RvbWl6YXRpb25zKHNlc3Npb25VcmkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0YWdlbnRzOiBkaXJlY3RvcnlDaGlsZHJlbihjdXN0b21pemF0aW9ucywgam9pbih3b3Jrc3BhY2UsICcuZ2l0aHViJywgJ2FnZW50cycpKSxcblx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiBkaXJlY3RvcnlDaGlsZHJlbihjdXN0b21pemF0aW9ucywgam9pbih3b3Jrc3BhY2UsICcuZ2l0aHViJywgJ2luc3RydWN0aW9ucycpKSxcblx0XHRcdFx0c2tpbGxzOiBkaXJlY3RvcnlDaGlsZHJlbihjdXN0b21pemF0aW9ucywgam9pbih3b3Jrc3BhY2UsICcuZ2l0aHViJywgJ3NraWxscycpKSxcblx0XHRcdFx0aG9va3M6IGRpcmVjdG9yeUNoaWxkcmVuKGN1c3RvbWl6YXRpb25zLCBqb2luKHdvcmtzcGFjZSwgJy5naXRodWInLCAnaG9va3MnKSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGFnZW50czogW1VSSS5maWxlKGZpbGVzLmFnZW50KS50b1N0cmluZygpXSxcblx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiBbVVJJLmZpbGUoZmlsZXMuaW5zdHJ1Y3Rpb24pLnRvU3RyaW5nKCldLFxuXHRcdFx0XHRza2lsbHM6IFtVUkkuZmlsZShmaWxlcy5za2lsbCkudG9TdHJpbmcoKV0sXG5cdFx0XHRcdGhvb2tzOiBbVVJJLmZpbGUoZmlsZXMuaG9vaykudG9TdHJpbmcoKV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdGNvcGlsb3RUZXN0KCdjdXN0b21pemF0aW9uIGRpc2NvdmVyeTogZGlzY292ZXIgZ3JvdXBzIGZpeGVkIGFnZW50IGluc3RydWN0aW9uIGZpbGVzIGF0IHRoZSB3b3Jrc3BhY2Ugcm9vdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FnZW50LWluc3RydWN0aW9ucycpO1xuXHRcdGNvbnN0IGZpbGVzID0gW1xuXHRcdFx0am9pbih3b3Jrc3BhY2UsICdBR0VOVFMubWQnKSxcblx0XHRcdGpvaW4od29ya3NwYWNlLCAnQ0xBVURFLm1kJyksXG5cdFx0XHRqb2luKHdvcmtzcGFjZSwgJy5naXRodWInLCAnY29waWxvdC1pbnN0cnVjdGlvbnMubWQnKSxcblx0XHRdO1xuXHRcdG1rZGlyU3luYyhqb2luKHdvcmtzcGFjZSwgJy5naXRodWInKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0Zm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG5cdFx0XHR3cml0ZUZpbGVTeW5jKGZpbGUsIGBJbnN0cnVjdGlvbnMgZnJvbSAke2ZpbGV9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZURpc2NvdmVyeVNlc3Npb24oJ2FnZW50LWluc3RydWN0aW9ucycsIHdvcmtzcGFjZSwgJ2Rpc2NvdmVyJyk7XG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbnMgPSBhd2FpdCBzZXNzaW9uQ3VzdG9taXphdGlvbnMoc2Vzc2lvblVyaSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRpcmVjdG9yeUNoaWxkcmVuKGN1c3RvbWl6YXRpb25zLCB3b3Jrc3BhY2UpLCBmaWxlcy5tYXAoZmlsZSA9PiBVUkkuZmlsZShmaWxlKS50b1N0cmluZygpKS5zb3J0KCkpO1xuXHR9KTtcblxuXHRjb3BpbG90VGVzdCgnY3VzdG9taXphdGlvbiBkaXNjb3Zlcnk6IGNvbmZpZ3VyZWQgcGx1Z2luIGV4cG9zZXMgaXRzIGFnZW50IHJ1bGUgYW5kIHNraWxsIGNoaWxkcmVuJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGNyZWF0ZVdvcmtzcGFjZSgncGx1Z2luJyk7XG5cdFx0Y29uc3QgcGx1Z2luID0gam9pbih3b3Jrc3BhY2UsICdwbHVnaW4nKTtcblx0XHRta2RpclN5bmMoam9pbihwbHVnaW4sICcucGx1Z2luJyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdG1rZGlyU3luYyhqb2luKHBsdWdpbiwgJ2FnZW50cycpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRta2RpclN5bmMoam9pbihwbHVnaW4sICdydWxlcycpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRta2RpclN5bmMoam9pbihwbHVnaW4sICdza2lsbHMnLCAncGx1Z2luLXNraWxsJyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihwbHVnaW4sICcucGx1Z2luJywgJ3BsdWdpbi5qc29uJyksIEpTT04uc3RyaW5naWZ5KHsgbmFtZTogJ0UyRSBQbHVnaW4nIH0pKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4ocGx1Z2luLCAnYWdlbnRzJywgJ3BsdWdpbi5hZ2VudC5tZCcpLCAnLS0tXFxubmFtZTogUGx1Z2luIEFnZW50XFxuZGVzY3JpcHRpb246IFBsdWdpbiBhZ2VudFxcbi0tLVxcbkFjdC4nKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4ocGx1Z2luLCAncnVsZXMnLCAncGx1Z2luLmluc3RydWN0aW9ucy5tZCcpLCAnLS0tXFxubmFtZTogUGx1Z2luIFJ1bGVcXG5hcHBseVRvOlxcbiAgLSBcIioqLypcIlxcbi0tLVxcblJ1bGUuJyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHBsdWdpbiwgJ3NraWxscycsICdwbHVnaW4tc2tpbGwnLCAnU0tJTEwubWQnKSwgJy0tLVxcbm5hbWU6IHBsdWdpbi1za2lsbFxcbmRlc2NyaXB0aW9uOiBQbHVnaW4gc2tpbGxcXG4tLS1cXG5Ta2lsbC4nKTtcblx0XHRjb25zdCBwbHVnaW5VcmkgPSBVUkkuZmlsZShwbHVnaW4pLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgY2xpZW50Q3VzdG9taXphdGlvbjogQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbiA9IHtcblx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdGlkOiBjdXN0b21pemF0aW9uSWQocGx1Z2luVXJpKSxcblx0XHRcdHVyaTogcGx1Z2luVXJpLFxuXHRcdFx0bmFtZTogJ0UyRSBQbHVnaW4nLFxuXHRcdFx0bm9uY2U6ICcxJyxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZURpc2NvdmVyeVNlc3Npb24oJ3BsdWdpbicsIHdvcmtzcGFjZSwgJ2Rpc2NvdmVyJywgW2NsaWVudEN1c3RvbWl6YXRpb25dKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT4ge1xuXHRcdFx0aWYgKCFpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnc2Vzc2lvbi9jdXN0b21pemF0aW9uVXBkYXRlZCcpIHx8IGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgIT09IHNlc3Npb25VcmkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyBjdXN0b21pemF0aW9uPzogeyB1cmk/OiBzdHJpbmcgfSB9KS5jdXN0b21pemF0aW9uPy51cmkgPT09IHBsdWdpblVyaTtcblx0XHR9LCA2MF8wMDApO1xuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zID0gYXdhaXQgc2Vzc2lvbkN1c3RvbWl6YXRpb25zKHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IGxvYWRlZCA9IGN1c3RvbWl6YXRpb25zLmZpbmQoKGN1c3RvbWl6YXRpb24pOiBjdXN0b21pemF0aW9uIGlzIFBsdWdpbkN1c3RvbWl6YXRpb24gPT5cblx0XHRcdGN1c3RvbWl6YXRpb24udHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luICYmIGN1c3RvbWl6YXRpb24udXJpID09PSBwbHVnaW5VcmkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdChsb2FkZWQ/LmNoaWxkcmVuID8/IFtdKS5tYXAoY2hpbGQgPT4gKHsgdHlwZTogY2hpbGQudHlwZSwgbmFtZTogY2hpbGQubmFtZSB9KSkuc29ydCgoYSwgYikgPT4gYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKSksXG5cdFx0XHRbXG5cdFx0XHRcdHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuQWdlbnQsIG5hbWU6ICdQbHVnaW4gQWdlbnQnIH0sXG5cdFx0XHRcdHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUnVsZSwgbmFtZTogJ3BsdWdpbicgfSxcblx0XHRcdFx0eyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5Ta2lsbCwgbmFtZTogJ3BsdWdpbi1za2lsbCcgfSxcblx0XHRcdF0uc29ydCgoYSwgYikgPT4gYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKSksXG5cdFx0KTtcblx0fSk7XG5cblx0Y29waWxvdFRlc3QoJ2N1c3RvbWl6YXRpb24gZGlzY292ZXJ5OiBmaWxlc3lzdGVtIHdhdGNoZXIgcHVibGlzaGVzIGEgbmV3bHkgYWRkZWQgYWdlbnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gY3JlYXRlV29ya3NwYWNlKCd3YXRjaC1hZ2VudCcpO1xuXHRcdGNvbnN0IGFnZW50c0RpcmVjdG9yeSA9IGpvaW4od29ya3NwYWNlLCAnLmdpdGh1YicsICdhZ2VudHMnKTtcblx0XHRjb25zdCBpbml0aWFsID0gam9pbihhZ2VudHNEaXJlY3RvcnksICdpbml0aWFsLmFnZW50Lm1kJyk7XG5cdFx0Y29uc3QgYWRkZWQgPSBqb2luKGFnZW50c0RpcmVjdG9yeSwgJ2FkZGVkLmFnZW50Lm1kJyk7XG5cdFx0bWtkaXJTeW5jKGFnZW50c0RpcmVjdG9yeSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0d3JpdGVGaWxlU3luYyhpbml0aWFsLCAnLS0tXFxubmFtZTogSW5pdGlhbCBBZ2VudFxcbmRlc2NyaXB0aW9uOiBJbml0aWFsXFxuLS0tXFxuSW5pdGlhbC4nKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlRGlzY292ZXJ5U2Vzc2lvbignd2F0Y2gtYWdlbnQnLCB3b3Jrc3BhY2UsICdkaXNjb3ZlcicpO1xuXHRcdGF3YWl0IHNlc3Npb25DdXN0b21pemF0aW9ucyhzZXNzaW9uVXJpKTtcblx0XHRjb250ZXh0LmNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cblx0XHR3cml0ZUZpbGVTeW5jKGFkZGVkLCAnLS0tXFxubmFtZTogQWRkZWQgQWdlbnRcXG5kZXNjcmlwdGlvbjogQWRkZWRcXG4tLS1cXG5BZGRlZC4nKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT4ge1xuXHRcdFx0aWYgKCFpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnc2Vzc2lvbi9jdXN0b21pemF0aW9uc0NoYW5nZWQnKSB8fCBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsICE9PSBzZXNzaW9uVXJpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBTZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkQWN0aW9uO1xuXHRcdFx0cmV0dXJuIGFjdGlvbi5jdXN0b21pemF0aW9ucy5zb21lKGN1c3RvbWl6YXRpb24gPT5cblx0XHRcdFx0Y3VzdG9taXphdGlvbi50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5EaXJlY3Rvcnlcblx0XHRcdFx0JiYgY3VzdG9taXphdGlvbi51cmkgPT09IFVSSS5maWxlKGFnZW50c0RpcmVjdG9yeSkudG9TdHJpbmcoKVxuXHRcdFx0XHQmJiBjdXN0b21pemF0aW9uLmNoaWxkcmVuPy5zb21lKGNoaWxkID0+IGNoaWxkLnVyaSA9PT0gVVJJLmZpbGUoYWRkZWQpLnRvU3RyaW5nKCkpKTtcblx0XHR9LCA2MF8wMDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaXJlY3RvcnlDaGlsZHJlbihhd2FpdCBzZXNzaW9uQ3VzdG9taXphdGlvbnMoc2Vzc2lvblVyaSksIGFnZW50c0RpcmVjdG9yeSksIFtcblx0XHRcdFVSSS5maWxlKGFkZGVkKS50b1N0cmluZygpLFxuXHRcdFx0VVJJLmZpbGUoaW5pdGlhbCkudG9TdHJpbmcoKSxcblx0XHRdLnNvcnQoKSk7XG5cdH0pO1xuXG5cdGNvcGlsb3RUZXN0KCdjdXN0b21pemF0aW9uIGRpc2NvdmVyeTogZmlsZXN5c3RlbSB3YXRjaGVyIHJlbW92ZXMgYSBkZWxldGVkIGFnZW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGNyZWF0ZVdvcmtzcGFjZSgnd2F0Y2gtYWdlbnQtZGVsZXRlJyk7XG5cdFx0Y29uc3QgYWdlbnRzRGlyZWN0b3J5ID0gam9pbih3b3Jrc3BhY2UsICcuZ2l0aHViJywgJ2FnZW50cycpO1xuXHRcdGNvbnN0IHJldGFpbmVkID0gam9pbihhZ2VudHNEaXJlY3RvcnksICdyZXRhaW5lZC5hZ2VudC5tZCcpO1xuXHRcdGNvbnN0IHJlbW92ZWQgPSBqb2luKGFnZW50c0RpcmVjdG9yeSwgJ3JlbW92ZWQuYWdlbnQubWQnKTtcblx0XHRta2RpclN5bmMoYWdlbnRzRGlyZWN0b3J5LCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHR3cml0ZUZpbGVTeW5jKHJldGFpbmVkLCAnLS0tXFxubmFtZTogUmV0YWluZWQgQWdlbnRcXG5kZXNjcmlwdGlvbjogUmV0YWluZWRcXG4tLS1cXG5SZXRhaW5lZC4nKTtcblx0XHR3cml0ZUZpbGVTeW5jKHJlbW92ZWQsICctLS1cXG5uYW1lOiBSZW1vdmVkIEFnZW50XFxuZGVzY3JpcHRpb246IFJlbW92ZWRcXG4tLS1cXG5SZW1vdmVkLicpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVEaXNjb3ZlcnlTZXNzaW9uKCd3YXRjaC1hZ2VudC1kZWxldGUnLCB3b3Jrc3BhY2UsICdkaXNjb3ZlcicpO1xuXHRcdGF3YWl0IHNlc3Npb25DdXN0b21pemF0aW9ucyhzZXNzaW9uVXJpKTtcblx0XHRjb250ZXh0LmNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cblx0XHR1bmxpbmtTeW5jKHJlbW92ZWQpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRpZiAoIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdzZXNzaW9uL2N1c3RvbWl6YXRpb25zQ2hhbmdlZCcpIHx8IGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgIT09IHNlc3Npb25VcmkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIFNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWRBY3Rpb247XG5cdFx0XHRjb25zdCBkaXJlY3RvcnkgPSBhY3Rpb24uY3VzdG9taXphdGlvbnMuZmluZCgoY3VzdG9taXphdGlvbik6IGN1c3RvbWl6YXRpb24gaXMgRGlyZWN0b3J5Q3VzdG9taXphdGlvbiA9PlxuXHRcdFx0XHRjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkRpcmVjdG9yeSAmJiBjdXN0b21pemF0aW9uLnVyaSA9PT0gVVJJLmZpbGUoYWdlbnRzRGlyZWN0b3J5KS50b1N0cmluZygpKTtcblx0XHRcdHJldHVybiBkaXJlY3RvcnkgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHQmJiAhIWRpcmVjdG9yeS5jaGlsZHJlbj8uc29tZShjaGlsZCA9PiBjaGlsZC51cmkgPT09IFVSSS5maWxlKHJldGFpbmVkKS50b1N0cmluZygpKVxuXHRcdFx0XHQmJiAhZGlyZWN0b3J5LmNoaWxkcmVuPy5zb21lKGNoaWxkID0+IGNoaWxkLnVyaSA9PT0gVVJJLmZpbGUocmVtb3ZlZCkudG9TdHJpbmcoKSk7XG5cdFx0fSwgNjBfMDAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlyZWN0b3J5Q2hpbGRyZW4oYXdhaXQgc2Vzc2lvbkN1c3RvbWl6YXRpb25zKHNlc3Npb25VcmkpLCBhZ2VudHNEaXJlY3RvcnkpLCBbVVJJLmZpbGUocmV0YWluZWQpLnRvU3RyaW5nKCldKTtcblx0fSk7XG5cblx0Y29waWxvdFRlc3QoJ2N1c3RvbWl6YXRpb24gZGlzY292ZXJ5OiBmaWxlc3lzdGVtIHdhdGNoZXIgdXBkYXRlcyBhbiBlZGl0ZWQgYWdlbnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gY3JlYXRlV29ya3NwYWNlKCd3YXRjaC1hZ2VudC11cGRhdGUnKTtcblx0XHRjb25zdCBhZ2VudHNEaXJlY3RvcnkgPSBqb2luKHdvcmtzcGFjZSwgJy5naXRodWInLCAnYWdlbnRzJyk7XG5cdFx0Y29uc3QgYWdlbnRGaWxlID0gam9pbihhZ2VudHNEaXJlY3RvcnksICdlZGl0YWJsZS5hZ2VudC5tZCcpO1xuXHRcdG1rZGlyU3luYyhhZ2VudHNEaXJlY3RvcnksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdHdyaXRlRmlsZVN5bmMoYWdlbnRGaWxlLCAnLS0tXFxubmFtZTogQmVmb3JlIEFnZW50XFxuZGVzY3JpcHRpb246IEJlZm9yZVxcbi0tLVxcbkJlZm9yZS4nKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlRGlzY292ZXJ5U2Vzc2lvbignd2F0Y2gtYWdlbnQtdXBkYXRlJywgd29ya3NwYWNlLCAnZGlzY292ZXInKTtcblx0XHRhd2FpdCBzZXNzaW9uQ3VzdG9taXphdGlvbnMoc2Vzc2lvblVyaSk7XG5cdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXG5cdFx0d3JpdGVGaWxlU3luYyhhZ2VudEZpbGUsICctLS1cXG5uYW1lOiBBZnRlciBBZ2VudFxcbmRlc2NyaXB0aW9uOiBBZnRlclxcbi0tLVxcbkFmdGVyLicpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRpZiAoIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdzZXNzaW9uL2N1c3RvbWl6YXRpb25zQ2hhbmdlZCcpIHx8IGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgIT09IHNlc3Npb25VcmkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIFNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWRBY3Rpb247XG5cdFx0XHRjb25zdCBkaXJlY3RvcnkgPSBhY3Rpb24uY3VzdG9taXphdGlvbnMuZmluZCgoY3VzdG9taXphdGlvbik6IGN1c3RvbWl6YXRpb24gaXMgRGlyZWN0b3J5Q3VzdG9taXphdGlvbiA9PlxuXHRcdFx0XHRjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkRpcmVjdG9yeSAmJiBjdXN0b21pemF0aW9uLnVyaSA9PT0gVVJJLmZpbGUoYWdlbnRzRGlyZWN0b3J5KS50b1N0cmluZygpKTtcblx0XHRcdHJldHVybiBkaXJlY3Rvcnk/LmNoaWxkcmVuPy5zb21lKGNoaWxkID0+IGNoaWxkLnVyaSA9PT0gVVJJLmZpbGUoYWdlbnRGaWxlKS50b1N0cmluZygpICYmIGNoaWxkLm5hbWUgPT09ICdBZnRlciBBZ2VudCcpID8/IGZhbHNlO1xuXHRcdH0sIDYwXzAwMCk7XG5cblx0XHRjb25zdCBjdXN0b21pemF0aW9ucyA9IGF3YWl0IHNlc3Npb25DdXN0b21pemF0aW9ucyhzZXNzaW9uVXJpKTtcblx0XHRjb25zdCBkaXJlY3RvcnkgPSBjdXN0b21pemF0aW9ucy5maW5kKChjdXN0b21pemF0aW9uKTogY3VzdG9taXphdGlvbiBpcyBEaXJlY3RvcnlDdXN0b21pemF0aW9uID0+XG5cdFx0XHRjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkRpcmVjdG9yeSAmJiBjdXN0b21pemF0aW9uLnVyaSA9PT0gVVJJLmZpbGUoYWdlbnRzRGlyZWN0b3J5KS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRpcmVjdG9yeT8uY2hpbGRyZW4/Lm1hcChjaGlsZCA9PiAoeyB1cmk6IGNoaWxkLnVyaSwgbmFtZTogY2hpbGQubmFtZSB9KSksIFt7XG5cdFx0XHR1cmk6IFVSSS5maWxlKGFnZW50RmlsZSkudG9TdHJpbmcoKSxcblx0XHRcdG5hbWU6ICdBZnRlciBBZ2VudCcsXG5cdFx0fV0pO1xuXHR9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVcsYUFBYSxZQUFZLHFCQUFxQjtBQUNsRSxTQUFTLGNBQWM7QUFDdkIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsV0FBVztBQUNwQixTQUFTLDBCQUFrRTtBQUMzRSxTQUFTLGlCQUFpQixtQkFBbUIsc0JBQW9KO0FBQ2pNLFNBQVMsa0JBQTJEO0FBRXBFLFNBQVMsbUJBQW1CLDZCQUE2QjtBQUN6RCxTQUFTLG1CQUFtQiw0QkFBNEI7QUFHakQsU0FBUyxrQ0FBa0MsU0FBeUM7QUFDMUYsUUFBTSxFQUFFLFFBQVEsaUJBQWlCLFNBQVMsSUFBSTtBQUM5QyxRQUFNLFVBQVUsUUFBUSxTQUFTLFlBQVksT0FBTyxhQUFhO0FBRWpFLFdBQVMsWUFBWSxPQUFlLEtBQTRCO0FBQy9ELFFBQUksUUFBUSxTQUFTLFVBQVU7QUFDOUI7QUFBQSxJQUNEO0FBQ0EsS0FBQyxVQUFVLE9BQU8sS0FBSyxNQUFNLE9BQU8sV0FBWTtBQUMvQyxXQUFLLFFBQVEsSUFBTztBQUNwQixhQUFPLElBQUksS0FBSyxJQUFJO0FBQUEsSUFDckIsQ0FBQztBQUFBLEVBQ0Y7QUFFQSxXQUFTLGdCQUFnQixRQUF3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QU0sc0JBQXNCLFVBQVUsR0FBRyxlQUFlLEdBQUcsQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0FBQUEsRUFDcEksQ0FBQztBQUVELGNBQVksdUVBQXVFLGlCQUFrQjtBQUNwRyxVQUFNLFlBQVksZ0JBQWdCLG9CQUFvQjtBQUN0RCxVQUFNLGtCQUFrQixLQUFLLFdBQVcsV0FBVyxRQUFRO0FBQzNELFVBQU0sWUFBWSxLQUFLLGlCQUFpQixtQkFBbUI7QUFDM0QsY0FBVSxpQkFBaUIsRUFBRSxXQUFXLEtBQUssQ0FBQztBQUM5QyxrQkFBYyxXQUFXLDREQUE0RDtBQUNyRixVQUFNLGFBQWEsTUFBTSx1QkFBdUIsc0JBQXNCLFdBQVcsVUFBVTtBQUMzRixVQUFNLHNCQUFzQixVQUFVO0FBQ3RDLFlBQVEsT0FBTyxjQUFjO0FBRTdCLGtCQUFjLFdBQVcseURBQXlEO0FBQ2xGLFVBQU0sUUFBUSxPQUFPLG9CQUFvQixPQUFLO0FBQzdDLFVBQUksQ0FBQyxxQkFBcUIsR0FBRywrQkFBK0IsS0FBSyxrQkFBa0IsQ0FBQyxFQUFFLFlBQVksWUFBWTtBQUM3RyxlQUFPO0FBQUEsTUFDUjtBQUNBLFlBQU0sU0FBUyxrQkFBa0IsQ0FBQyxFQUFFO0FBQ3BDLFlBQU1BLGFBQVksT0FBTyxlQUFlLEtBQUssQ0FBQyxrQkFDN0MsY0FBYyxTQUFTLGtCQUFrQixhQUFhLGNBQWMsUUFBUSxJQUFJLEtBQUssZUFBZSxFQUFFLFNBQVMsQ0FBQztBQUNqSCxhQUFPQSxZQUFXLFVBQVUsS0FBSyxXQUFTLE1BQU0sUUFBUSxJQUFJLEtBQUssU0FBUyxFQUFFLFNBQVMsS0FBSyxNQUFNLFNBQVMsYUFBYSxLQUFLO0FBQUEsSUFDNUgsR0FBRyxHQUFNO0FBRVQsVUFBTSxpQkFBaUIsTUFBTSxzQkFBc0IsVUFBVTtBQUM3RCxVQUFNLFlBQVksZUFBZSxLQUFLLENBQUMsa0JBQ3RDLGNBQWMsU0FBUyxrQkFBa0IsYUFBYSxjQUFjLFFBQVEsSUFBSSxLQUFLLGVBQWUsRUFBRSxTQUFTLENBQUM7QUFDakgsV0FBTyxnQkFBZ0IsV0FBVyxVQUFVLElBQUksWUFBVSxFQUFFLEtBQUssTUFBTSxLQUFLLE1BQU0sTUFBTSxLQUFLLEVBQUUsR0FBRyxDQUFDO0FBQUEsTUFDbEcsS0FBSyxJQUFJLEtBQUssU0FBUyxFQUFFLFNBQVM7QUFBQSxNQUNsQyxNQUFNO0FBQUEsSUFDUCxDQUFDLENBQUM7QUFBQSxFQUNILENBQUM7QUFDRjsiLAogICJuYW1lcyI6IFsiZGlyZWN0b3J5Il0KfQo=
