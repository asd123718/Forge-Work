import assert from "assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { AgentHostCodexMultiRootEnabledConfigKey } from "../../../../common/agentHostSchema.js";
import { PROTOCOL_VERSION } from "../../../../common/state/protocol/version/registry.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import { buildDefaultChatUri, ROOT_STATE_URI } from "../../../../common/state/sessionState.js";
import { AgentHostE2EServerLease, dispatchTurn, removeTempDirs, resolveGitHubToken, startBackgroundApprovalLoop } from "../harness/agentHostE2ETestHarness.js";
import { defineAgentHostE2ETests } from "../suites/agentHostE2ESuites.js";
import { getActionEnvelope, isActionNotification } from "../../serverIntegrationTestHelpers.js";
import { CODEX_CONFIG } from "./codexTestConfiguration.js";
const RECORD = process.env["AGENT_HOST_REPLAY_RECORD"] === "1" || process.env["AGENT_HOST_UPDATE_SNAPSHOTS"] === "1";
const portableShellToolReplayEnabled = RECORD || process.platform !== "linux" || !CODEX_CONFIG.shellToolReplayUnstableOnLinux;
defineAgentHostE2ETests(CODEX_CONFIG);
(CODEX_CONFIG.enabled ? suite : suite.skip)("Agent Host E2E \u2014 Codex (Codex-specific)", function() {
  let client;
  let lease;
  const createdSessions = [];
  const tempDirs = [];
  suiteSetup(function() {
    lease = new AgentHostE2EServerLease(CODEX_CONFIG, { codexSdkRoot: CODEX_CONFIG.codexSdkRoot });
  });
  setup(async function() {
    this.timeout(6e4);
    if (!lease) {
      throw new Error("Agent Host E2E server lease was not initialized.");
    }
    ({ client } = await lease.acquire(this.currentTest?.title ?? "unknown"));
  });
  teardown(async function() {
    this.timeout(12e4);
    if (!lease) {
      throw new Error("Agent Host E2E server lease was not initialized.");
    }
    const failed = this.currentTest?.state === "failed";
    const errors = [];
    try {
      await lease.release(createdSessions, failed);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
    try {
      await removeTempDirs(tempDirs);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, `Failed to dispose Codex-specific E2E test resources: ${errors.map((error) => error.message).join("; ")}`);
    }
  });
  (portableShellToolReplayEnabled ? test : test.skip)("secondary workspace skill reaches the Codex model request", async function() {
    this.timeout(12e4);
    const parent = mkdtempSync(join(tmpdir(), "ahp-codex-multiroot-"));
    tempDirs.push(parent);
    const rootA = join(parent, "a");
    const rootB = join(parent, "b");
    const skillName = "secondary-root-marker";
    const marker = "CODEX_SECONDARY_ROOT_SKILL_MARKER_73";
    const skillDirectory = join(rootB, ".agents", "skills", skillName);
    const readSkillCommand = `node -e "process.stdout.write(require('fs').readFileSync('../b/.agents/skills/${skillName}/SKILL.md', 'utf8'))"`;
    mkdirSync(rootA, { recursive: true });
    mkdirSync(skillDirectory, { recursive: true });
    writeFileSync(join(skillDirectory, "SKILL.md"), [
      "---",
      `name: ${skillName}`,
      "description: Confirms that Codex loaded a skill from a secondary workspace root.",
      "---",
      "",
      `When invoked, follow this marker instruction: ${marker}`
    ].join("\n"));
    client.setWorkingDirectory(parent);
    await client.call("initialize", { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: "codex-multiroot-skill" }, 3e4);
    await client.call("authenticate", { channel: ROOT_STATE_URI, resource: "https://api.github.com", token: resolveGitHubToken() }, 3e4);
    await client.call("subscribe", { channel: ROOT_STATE_URI });
    let multiRootEnabled = false;
    try {
      client.dispatch({
        channel: ROOT_STATE_URI,
        clientSeq: 0,
        action: { type: ActionType.RootConfigChanged, config: { [AgentHostCodexMultiRootEnabledConfigKey]: true } }
      });
      await client.waitForNotification((n) => {
        if (!isActionNotification(n, ActionType.RootConfigChanged)) {
          return false;
        }
        const action = getActionEnvelope(n).action;
        return action.config?.[AgentHostCodexMultiRootEnabledConfigKey] === true;
      }, 3e4);
      multiRootEnabled = true;
      const sessionUri = URI.from({ scheme: CODEX_CONFIG.scheme, path: `/${generateUuid()}` }).toString();
      await client.call("createSession", {
        channel: sessionUri,
        provider: CODEX_CONFIG.provider,
        workingDirectories: [URI.file(rootA).toString(), URI.file(rootB).toString()],
        config: { isolation: "folder" }
      }, 3e4);
      createdSessions.push(sessionUri);
      await client.call("subscribe", { channel: sessionUri });
      await client.call("subscribe", { channel: buildDefaultChatUri(sessionUri) });
      client.dispatch({
        channel: sessionUri,
        clientSeq: 1,
        action: { type: ActionType.SessionTitleChanged, title: "Secondary workspace skill test" }
      });
      await client.waitForNotification((n) => isActionNotification(n, ActionType.SessionTitleChanged), 3e4);
      client.clearReceived();
      const prompt = `Use the ${skillName} skill. Read its SKILL.md by running exactly this shell command, with no modifications: \`${readSkillCommand}\`. Then reply with exactly done.`;
      const approvalLoop = startBackgroundApprovalLoop(client, {
        approvalSeqStart: 100,
        allow: [{ toolName: CODEX_CONFIG.shellToolName }]
      });
      try {
        dispatchTurn(client, sessionUri, "turn-secondary-skill", prompt, 2);
        await client.waitForNotification(
          (n) => isActionNotification(n, "chat/turnComplete") || isActionNotification(n, "chat/error"),
          9e4
        );
      } finally {
        await approvalLoop.stop();
      }
      const errors = client.receivedNotifications((n) => isActionNotification(n, "chat/error"));
      assert.deepStrictEqual({
        approvalErrors: approvalLoop.errors,
        errorCount: errors.length,
        modelRequestIncludesMarker: lease.observedModelRequestBodies.some((body) => body.includes(marker))
      }, {
        approvalErrors: [],
        errorCount: 0,
        modelRequestIncludesMarker: true
      });
    } finally {
      if (multiRootEnabled) {
        client.dispatch({
          channel: ROOT_STATE_URI,
          clientSeq: 3,
          action: { type: ActionType.RootConfigChanged, config: { [AgentHostCodexMultiRootEnabledConfigKey]: false } }
        });
        await client.waitForNotification((n) => {
          if (!isActionNotification(n, ActionType.RootConfigChanged)) {
            return false;
          }
          const action = getActionEnvelope(n).action;
          return action.config?.[AgentHostCodexMultiRootEnabledConfigKey] === false;
        }, 3e4);
      }
    }
  });
  suiteTeardown(async function() {
    this.timeout(12e4);
    await lease?.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxlMmVcXHByb3ZpZGVyc1xcY29kZXhBZ2VudEhvc3RFMkUuaW50ZWdyYXRpb25UZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLyoqXG4gKiBEZXRlcm1pbmlzdGljIEFnZW50IEhvc3QgZW5kLXRvLWVuZCB0ZXN0cyBmb3IgdGhlIGJ1bmRsZWQgQ29kZXggcHJvdmlkZXIuXG4gKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbWtkaXJTeW5jLCBta2R0ZW1wU3luYywgd3JpdGVGaWxlU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IHRtcGRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENvZGV4TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTY2hlbWEuanMnO1xuaW1wb3J0IHsgU3Vic2NyaWJlUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IFBST1RPQ09MX1ZFUlNJT04gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvdmVyc2lvbi9yZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IGJ1aWxkRGVmYXVsdENoYXRVcmksIFJPT1RfU1RBVEVfVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RFMkVTZXJ2ZXJMZWFzZSwgZGlzcGF0Y2hUdXJuLCByZW1vdmVUZW1wRGlycywgcmVzb2x2ZUdpdEh1YlRva2VuLCBzdGFydEJhY2tncm91bmRBcHByb3ZhbExvb3AgfSBmcm9tICcuLi9oYXJuZXNzL2FnZW50SG9zdEUyRVRlc3RIYXJuZXNzLmpzJztcbmltcG9ydCB7IGRlZmluZUFnZW50SG9zdEUyRVRlc3RzIH0gZnJvbSAnLi4vc3VpdGVzL2FnZW50SG9zdEUyRVN1aXRlcy5qcyc7XG5pbXBvcnQgeyBnZXRBY3Rpb25FbnZlbG9wZSwgaXNBY3Rpb25Ob3RpZmljYXRpb24sIFRlc3RQcm90b2NvbENsaWVudCB9IGZyb20gJy4uLy4uL3NlcnZlckludGVncmF0aW9uVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgQ09ERVhfQ09ORklHIH0gZnJvbSAnLi9jb2RleFRlc3RDb25maWd1cmF0aW9uLmpzJztcblxuY29uc3QgUkVDT1JEID0gcHJvY2Vzcy5lbnZbJ0FHRU5UX0hPU1RfUkVQTEFZX1JFQ09SRCddID09PSAnMScgfHwgcHJvY2Vzcy5lbnZbJ0FHRU5UX0hPU1RfVVBEQVRFX1NOQVBTSE9UUyddID09PSAnMSc7XG5jb25zdCBwb3J0YWJsZVNoZWxsVG9vbFJlcGxheUVuYWJsZWQgPSBSRUNPUkQgfHwgcHJvY2Vzcy5wbGF0Zm9ybSAhPT0gJ2xpbnV4JyB8fCAhQ09ERVhfQ09ORklHLnNoZWxsVG9vbFJlcGxheVVuc3RhYmxlT25MaW51eDtcblxuZGVmaW5lQWdlbnRIb3N0RTJFVGVzdHMoQ09ERVhfQ09ORklHKTtcblxuKENPREVYX0NPTkZJRy5lbmFibGVkID8gc3VpdGUgOiBzdWl0ZS5za2lwKSgnQWdlbnQgSG9zdCBFMkUgXHUyMDE0IENvZGV4IChDb2RleC1zcGVjaWZpYyknLCBmdW5jdGlvbiAoKSB7XG5cblx0bGV0IGNsaWVudDogVGVzdFByb3RvY29sQ2xpZW50O1xuXHRsZXQgbGVhc2U6IEFnZW50SG9zdEUyRVNlcnZlckxlYXNlIHwgdW5kZWZpbmVkO1xuXHRjb25zdCBjcmVhdGVkU2Vzc2lvbnM6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IHRlbXBEaXJzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdHN1aXRlU2V0dXAoZnVuY3Rpb24gKCkge1xuXHRcdGxlYXNlID0gbmV3IEFnZW50SG9zdEUyRVNlcnZlckxlYXNlKENPREVYX0NPTkZJRywgeyBjb2RleFNka1Jvb3Q6IENPREVYX0NPTkZJRy5jb2RleFNka1Jvb3QgfSk7XG5cdH0pO1xuXG5cdHNldHVwKGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoNjBfMDAwKTtcblx0XHRpZiAoIWxlYXNlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0FnZW50IEhvc3QgRTJFIHNlcnZlciBsZWFzZSB3YXMgbm90IGluaXRpYWxpemVkLicpO1xuXHRcdH1cblx0XHQoeyBjbGllbnQgfSA9IGF3YWl0IGxlYXNlLmFjcXVpcmUodGhpcy5jdXJyZW50VGVzdD8udGl0bGUgPz8gJ3Vua25vd24nKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTIwXzAwMCk7XG5cdFx0aWYgKCFsZWFzZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBZ2VudCBIb3N0IEUyRSBzZXJ2ZXIgbGVhc2Ugd2FzIG5vdCBpbml0aWFsaXplZC4nKTtcblx0XHR9XG5cdFx0Y29uc3QgZmFpbGVkID0gdGhpcy5jdXJyZW50VGVzdD8uc3RhdGUgPT09ICdmYWlsZWQnO1xuXHRcdGNvbnN0IGVycm9yczogRXJyb3JbXSA9IFtdO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBsZWFzZS5yZWxlYXNlKGNyZWF0ZWRTZXNzaW9ucywgZmFpbGVkKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0ZXJyb3JzLnB1c2goZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpKTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHJlbW92ZVRlbXBEaXJzKHRlbXBEaXJzKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0ZXJyb3JzLnB1c2goZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpKTtcblx0XHR9XG5cdFx0aWYgKGVycm9ycy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgQWdncmVnYXRlRXJyb3IoZXJyb3JzLCBgRmFpbGVkIHRvIGRpc3Bvc2UgQ29kZXgtc3BlY2lmaWMgRTJFIHRlc3QgcmVzb3VyY2VzOiAke2Vycm9ycy5tYXAoZXJyb3IgPT4gZXJyb3IubWVzc2FnZSkuam9pbignOyAnKX1gKTtcblx0XHR9XG5cdH0pO1xuXG5cdChwb3J0YWJsZVNoZWxsVG9vbFJlcGxheUVuYWJsZWQgPyB0ZXN0IDogdGVzdC5za2lwKSgnc2Vjb25kYXJ5IHdvcmtzcGFjZSBza2lsbCByZWFjaGVzIHRoZSBDb2RleCBtb2RlbCByZXF1ZXN0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxMjBfMDAwKTtcblxuXHRcdGNvbnN0IHBhcmVudCA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdhaHAtY29kZXgtbXVsdGlyb290LScpKTtcblx0XHR0ZW1wRGlycy5wdXNoKHBhcmVudCk7XG5cdFx0Y29uc3Qgcm9vdEEgPSBqb2luKHBhcmVudCwgJ2EnKTtcblx0XHRjb25zdCByb290QiA9IGpvaW4ocGFyZW50LCAnYicpO1xuXHRcdGNvbnN0IHNraWxsTmFtZSA9ICdzZWNvbmRhcnktcm9vdC1tYXJrZXInO1xuXHRcdGNvbnN0IG1hcmtlciA9ICdDT0RFWF9TRUNPTkRBUllfUk9PVF9TS0lMTF9NQVJLRVJfNzMnO1xuXHRcdGNvbnN0IHNraWxsRGlyZWN0b3J5ID0gam9pbihyb290QiwgJy5hZ2VudHMnLCAnc2tpbGxzJywgc2tpbGxOYW1lKTtcblx0XHRjb25zdCByZWFkU2tpbGxDb21tYW5kID0gYG5vZGUgLWUgXCJwcm9jZXNzLnN0ZG91dC53cml0ZShyZXF1aXJlKCdmcycpLnJlYWRGaWxlU3luYygnLi4vYi8uYWdlbnRzL3NraWxscy8ke3NraWxsTmFtZX0vU0tJTEwubWQnLCAndXRmOCcpKVwiYDtcblx0XHRta2RpclN5bmMocm9vdEEsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdG1rZGlyU3luYyhza2lsbERpcmVjdG9yeSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHNraWxsRGlyZWN0b3J5LCAnU0tJTEwubWQnKSwgW1xuXHRcdFx0Jy0tLScsXG5cdFx0XHRgbmFtZTogJHtza2lsbE5hbWV9YCxcblx0XHRcdCdkZXNjcmlwdGlvbjogQ29uZmlybXMgdGhhdCBDb2RleCBsb2FkZWQgYSBza2lsbCBmcm9tIGEgc2Vjb25kYXJ5IHdvcmtzcGFjZSByb290LicsXG5cdFx0XHQnLS0tJyxcblx0XHRcdCcnLFxuXHRcdFx0YFdoZW4gaW52b2tlZCwgZm9sbG93IHRoaXMgbWFya2VyIGluc3RydWN0aW9uOiAke21hcmtlcn1gLFxuXHRcdF0uam9pbignXFxuJykpO1xuXG5cdFx0Y2xpZW50LnNldFdvcmtpbmdEaXJlY3RvcnkocGFyZW50KTtcblx0XHRhd2FpdCBjbGllbnQuY2FsbCgnaW5pdGlhbGl6ZScsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHByb3RvY29sVmVyc2lvbnM6IFtQUk9UT0NPTF9WRVJTSU9OXSwgY2xpZW50SWQ6ICdjb2RleC1tdWx0aXJvb3Qtc2tpbGwnIH0sIDMwXzAwMCk7XG5cdFx0YXdhaXQgY2xpZW50LmNhbGwoJ2F1dGhlbnRpY2F0ZScsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsIHRva2VuOiByZXNvbHZlR2l0SHViVG9rZW4oKSB9LCAzMF8wMDApO1xuXHRcdGF3YWl0IGNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkkgfSk7XG5cdFx0bGV0IG11bHRpUm9vdEVuYWJsZWQgPSBmYWxzZTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdFx0Y2xpZW50U2VxOiAwLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCwgY29uZmlnOiB7IFtBZ2VudEhvc3RDb2RleE11bHRpUm9vdEVuYWJsZWRDb25maWdLZXldOiB0cnVlIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgcmVhZG9ubHkgY29uZmlnPzogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgYm9vbGVhbj4+IH07XG5cdFx0XHRcdHJldHVybiBhY3Rpb24uY29uZmlnPy5bQWdlbnRIb3N0Q29kZXhNdWx0aVJvb3RFbmFibGVkQ29uZmlnS2V5XSA9PT0gdHJ1ZTtcblx0XHRcdH0sIDMwXzAwMCk7XG5cdFx0XHRtdWx0aVJvb3RFbmFibGVkID0gdHJ1ZTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBDT0RFWF9DT05GSUcuc2NoZW1lLCBwYXRoOiBgLyR7Z2VuZXJhdGVVdWlkKCl9YCB9KS50b1N0cmluZygpO1xuXHRcdFx0YXdhaXQgY2xpZW50LmNhbGwoJ2NyZWF0ZVNlc3Npb24nLCB7XG5cdFx0XHRcdGNoYW5uZWw6IHNlc3Npb25VcmksXG5cdFx0XHRcdHByb3ZpZGVyOiBDT0RFWF9DT05GSUcucHJvdmlkZXIsXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKHJvb3RBKS50b1N0cmluZygpLCBVUkkuZmlsZShyb290QikudG9TdHJpbmcoKV0sXG5cdFx0XHRcdGNvbmZpZzogeyBpc29sYXRpb246ICdmb2xkZXInIH0sXG5cdFx0XHR9LCAzMF8wMDApO1xuXHRcdFx0Y3JlYXRlZFNlc3Npb25zLnB1c2goc2Vzc2lvblVyaSk7XG5cdFx0XHRhd2FpdCBjbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHNlc3Npb25VcmkgfSk7XG5cdFx0XHRhd2FpdCBjbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSkgfSk7XG5cdFx0XHRjbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0XHRjaGFubmVsOiBzZXNzaW9uVXJpLFxuXHRcdFx0XHRjbGllbnRTZXE6IDEsXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlOiAnU2Vjb25kYXJ5IHdvcmtzcGFjZSBza2lsbCB0ZXN0JyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sIEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCksIDMwXzAwMCk7XG5cdFx0XHRjbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXG5cdFx0XHRjb25zdCBwcm9tcHQgPSBgVXNlIHRoZSAke3NraWxsTmFtZX0gc2tpbGwuIFJlYWQgaXRzIFNLSUxMLm1kIGJ5IHJ1bm5pbmcgZXhhY3RseSB0aGlzIHNoZWxsIGNvbW1hbmQsIHdpdGggbm8gbW9kaWZpY2F0aW9uczogXFxgJHtyZWFkU2tpbGxDb21tYW5kfVxcYC4gVGhlbiByZXBseSB3aXRoIGV4YWN0bHkgZG9uZS5gO1xuXHRcdFx0Y29uc3QgYXBwcm92YWxMb29wID0gc3RhcnRCYWNrZ3JvdW5kQXBwcm92YWxMb29wKGNsaWVudCwge1xuXHRcdFx0XHRhcHByb3ZhbFNlcVN0YXJ0OiAxMDAsXG5cdFx0XHRcdGFsbG93OiBbeyB0b29sTmFtZTogQ09ERVhfQ09ORklHLnNoZWxsVG9vbE5hbWUgfV0sXG5cdFx0XHR9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGRpc3BhdGNoVHVybihjbGllbnQsIHNlc3Npb25VcmksICd0dXJuLXNlY29uZGFyeS1za2lsbCcsIHByb21wdCwgMik7XG5cdFx0XHRcdGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKFxuXHRcdFx0XHRcdG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdHVybkNvbXBsZXRlJykgfHwgaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvZXJyb3InKSxcblx0XHRcdFx0XHQ5MF8wMDAsXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBhcHByb3ZhbExvb3Auc3RvcCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlcnJvcnMgPSBjbGllbnQucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvZXJyb3InKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0YXBwcm92YWxFcnJvcnM6IGFwcHJvdmFsTG9vcC5lcnJvcnMsXG5cdFx0XHRcdGVycm9yQ291bnQ6IGVycm9ycy5sZW5ndGgsXG5cdFx0XHRcdG1vZGVsUmVxdWVzdEluY2x1ZGVzTWFya2VyOiBsZWFzZSEub2JzZXJ2ZWRNb2RlbFJlcXVlc3RCb2RpZXMuc29tZShib2R5ID0+IGJvZHkuaW5jbHVkZXMobWFya2VyKSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGFwcHJvdmFsRXJyb3JzOiBbXSxcblx0XHRcdFx0ZXJyb3JDb3VudDogMCxcblx0XHRcdFx0bW9kZWxSZXF1ZXN0SW5jbHVkZXNNYXJrZXI6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKG11bHRpUm9vdEVuYWJsZWQpIHtcblx0XHRcdFx0Y2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdFx0XHRjbGllbnRTZXE6IDMsXG5cdFx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsIGNvbmZpZzogeyBbQWdlbnRIb3N0Q29kZXhNdWx0aVJvb3RFbmFibGVkQ29uZmlnS2V5XTogZmFsc2UgfSB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRcdFx0aWYgKCFpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBhY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyByZWFkb25seSBjb25maWc/OiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBib29sZWFuPj4gfTtcblx0XHRcdFx0XHRyZXR1cm4gYWN0aW9uLmNvbmZpZz8uW0FnZW50SG9zdENvZGV4TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleV0gPT09IGZhbHNlO1xuXHRcdFx0XHR9LCAzMF8wMDApO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0c3VpdGVUZWFyZG93bihhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDEyMF8wMDApO1xuXHRcdGF3YWl0IGxlYXNlPy5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFTQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXLGFBQWEscUJBQXFCO0FBQ3RELFNBQVMsY0FBYztBQUN2QixTQUFTLFlBQVk7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMscUJBQXFCLHNCQUFzQjtBQUNwRCxTQUFTLHlCQUF5QixjQUFjLGdCQUFnQixvQkFBb0IsbUNBQW1DO0FBQ3ZILFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsbUJBQW1CLDRCQUFnRDtBQUM1RSxTQUFTLG9CQUFvQjtBQUU3QixNQUFNLFNBQVMsUUFBUSxJQUFJLDBCQUEwQixNQUFNLE9BQU8sUUFBUSxJQUFJLDZCQUE2QixNQUFNO0FBQ2pILE1BQU0saUNBQWlDLFVBQVUsUUFBUSxhQUFhLFdBQVcsQ0FBQyxhQUFhO0FBRS9GLHdCQUF3QixZQUFZO0FBQUEsQ0FFbkMsYUFBYSxVQUFVLFFBQVEsTUFB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
