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
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { OS } from "../../../../base/common/platform.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IChatDebugService } from "../common/chatDebugService.js";
import { isAgentHostTarget } from "../common/chatSessionsService.js";
import { getChatSessionType } from "../common/model/chatUri.js";
import { IChatAgentService } from "../common/participants/chatAgents.js";
import { IChatService } from "../common/chatService/chatService.js";
import { formatHookCommandLabel } from "../common/promptSyntax/hookSchema.js";
import { HookType } from "../common/promptSyntax/hookTypes.js";
import { PromptsType } from "../common/promptSyntax/promptTypes.js";
import { IPromptsService } from "../common/promptSyntax/service/promptsService.js";
import { lastInstructionsCollectionResult } from "../common/promptSyntax/computeAutomaticInstructions.js";
let PromptsDebugContribution = class extends Disposable {
  constructor(promptsService, chatAgentService, chatService, chatDebugService, logService) {
    super();
    this.promptsService = promptsService;
    /**
     * Maps debug event IDs to their discovery info, so that
     * {@link IChatDebugService.resolveEvent} can return rich details.
     */
    this._discoveryEventDetails = /* @__PURE__ */ new Map();
    this._customizationEventDetails = /* @__PURE__ */ new Map();
    this._loggedSessions = /* @__PURE__ */ new Set();
    this._register(chatService.onDidDisposeSession((e) => {
      for (const sessionResource of e.sessionResources) {
        this._loggedSessions.delete(sessionResource.toString());
      }
    }));
    this._register(chatAgentService.onWillInvokeAgent(async (e) => {
      const sessionKey = e.request.sessionResource.toString();
      const isFirstInvocation = !this._loggedSessions.has(sessionKey);
      this._loggedSessions.add(sessionKey);
      const sessionResource = e.request.sessionResource;
      if (isFirstInvocation) {
        const cts = new CancellationTokenSource();
        try {
          const discoveryTypes = isAgentHostTarget(getChatSessionType(sessionResource)) ? [PromptsType.instructions, PromptsType.hook] : [PromptsType.agent, PromptsType.instructions, PromptsType.prompt, PromptsType.skill, PromptsType.hook];
          const discoveryInfos = await Promise.all(discoveryTypes.map((type) => this.promptsService.getDiscoveryInfo(type, cts.token)));
          for (const discoveryInfo of discoveryInfos) {
            const { name, details } = this.getDiscoveryLogEntry(discoveryInfo);
            const eventId = generateUuid();
            this._discoveryEventDetails.set(eventId, discoveryInfo);
            if (this._discoveryEventDetails.size > PromptsDebugContribution.MAX_DISCOVERY_DETAILS) {
              const first = this._discoveryEventDetails.keys().next().value;
              if (first !== void 0) {
                this._discoveryEventDetails.delete(first);
              }
            }
            const loaded = discoveryInfo.files.filter((f) => f.status === "loaded").map((f) => f.promptPath.name ?? f.promptPath.uri.path.split("/").pop() ?? f.promptPath.uri.toString());
            const skipped = discoveryInfo.files.filter((f) => f.status === "skipped").map((f) => {
              const label = f.promptPath.uri.toString();
              return f.skipReason ? `${label} (${f.skipReason})` : label;
            });
            const folders = discoveryInfo.sourceFolders?.map((sf) => sf.uri.path) ?? [];
            const parts = [];
            if (details) {
              parts.push(details);
            }
            if (loaded.length > 0) {
              parts.push(`loaded: [${truncateList(loaded)}]`);
            }
            if (skipped.length > 0) {
              parts.push(`skipped: [${truncateList(skipped)}]`);
            }
            if (folders.length > 0) {
              parts.push(`folders: [${truncateList(folders)}]`);
            }
            const newDetails = parts.join(" | ") || void 0;
            chatDebugService.log(
              sessionResource,
              name,
              newDetails,
              void 0,
              { id: eventId, category: "discovery" }
            );
          }
        } catch (error) {
          logService.error("Error while logging prompt discovery info to chat debug service", error);
        } finally {
          cts.dispose();
        }
      }
      const lastResult = lastInstructionsCollectionResult;
      if (!isFirstInvocation && lastResult) {
        const { telemetryEvent: collectionEvent, debugInfo } = lastResult;
        let resolvedHooks;
        try {
          const hookDiscoveryInfo = await this.promptsService.getDiscoveryInfo(PromptsType.hook, CancellationToken.None);
          resolvedHooks = hookDiscoveryInfo.hooksInfo?.hooks;
        } catch (error) {
          logService.warn("Error while fetching hooks for customization debug event", error);
        }
        const parts = [];
        if (collectionEvent.applyingInstructionsCount > 0) {
          parts.push(localize("customizations.applying", "{0} applying", collectionEvent.applyingInstructionsCount));
        }
        if (collectionEvent.referencedInstructionsCount > 0) {
          parts.push(localize("customizations.referenced", "{0} referenced", collectionEvent.referencedInstructionsCount));
        }
        if (collectionEvent.agentInstructionsCount > 0) {
          parts.push(localize("customizations.agent", "{0} agent", collectionEvent.agentInstructionsCount));
        }
        if (collectionEvent.listedInstructionsCount > 0) {
          parts.push(localize("customizations.listed", "{0} listed", collectionEvent.listedInstructionsCount));
        }
        const durationStr = debugInfo.durationInMillis.toFixed(1);
        const summary = parts.length > 0 ? localize("customizationsResolved.details", "Resolved {0} customizations ({1}) in {2}ms", collectionEvent.totalInstructionsCount, parts.join(", "), durationStr) : localize("customizationsResolved.none", "No customizations resolved");
        const detailSummaries = debugInfo.debugDetails.map((e2) => {
          const detail = e2.reason ? `${e2.name} \u2014 ${e2.reason}` : e2.name;
          return `[${e2.category}] ${detail}`;
        });
        const details = detailSummaries.length > 0 ? `${summary} | ${detailSummaries.join(", ")}` : summary;
        const customizationEventId = generateUuid();
        this._customizationEventDetails.set(customizationEventId, { debugInfo, hooks: resolvedHooks });
        if (this._customizationEventDetails.size > PromptsDebugContribution.MAX_DISCOVERY_DETAILS) {
          const first = this._customizationEventDetails.keys().next().value;
          if (first !== void 0) {
            this._customizationEventDetails.delete(first);
          }
        }
        chatDebugService.log(
          sessionResource,
          localize("customizationsResolved", "Resolve Customizations"),
          details,
          void 0,
          { id: customizationEventId, category: "customization" }
        );
      }
    }));
    this._register(chatDebugService.registerProvider({
      provideChatDebugLog: async () => void 0,
      resolveChatDebugLogEvent: async (eventId) => {
        return this._resolveDiscoveryEvent(eventId) ?? this._resolveCustomizationEvent(eventId);
      }
    }));
  }
  getDiscoveryLogEntry(discoveryInfo) {
    const durationInMillis = discoveryInfo.durationInMillis.toFixed(1);
    const loadedCount = discoveryInfo.files.filter((file) => file.status === "loaded").length;
    const skippedCount = discoveryInfo.files.length - loadedCount;
    switch (discoveryInfo.type) {
      case PromptsType.prompt:
        return {
          name: localize("promptsService.loadSlashCommands", "Slash Commands Discovery"),
          details: loadedCount === 1 ? localize("promptsDebugContribution.resolvedSlashCommand", "Resolved {0} slash command in {1}ms", loadedCount, durationInMillis) : localize("promptsDebugContribution.resolvedSlashCommands", "Resolved {0} slash commands in {1}ms", loadedCount, durationInMillis)
        };
      case PromptsType.agent:
        return {
          name: localize("promptsService.loadAgents", "Agent Discovery"),
          details: loadedCount === 1 ? localize("promptsDebugContribution.resolvedAgent", "Resolved {0} agent in {1}ms", loadedCount, durationInMillis) : localize("promptsDebugContribution.resolvedAgents", "Resolved {0} agents in {1}ms", loadedCount, durationInMillis)
        };
      case PromptsType.skill:
        return {
          name: localize("promptsService.loadSkills", "Skill Discovery"),
          details: loadedCount === 1 ? localize("promptsDebugContribution.resolvedSkill", "Resolved {0} skill in {1}ms", loadedCount, durationInMillis) : localize("promptsDebugContribution.resolvedSkills", "Resolved {0} skills in {1}ms", loadedCount, durationInMillis)
        };
      case PromptsType.instructions:
        return {
          name: localize("promptsService.loadInstructions", "Instructions Discovery"),
          details: loadedCount === 1 ? localize("promptsDebugContribution.resolvedInstruction", "Resolved {0} instruction in {1}ms", loadedCount, durationInMillis) : localize("promptsDebugContribution.resolvedInstructions", "Resolved {0} instructions in {1}ms", loadedCount, durationInMillis)
        };
      case PromptsType.hook: {
        const hookDiscoveryInfo = discoveryInfo;
        const hookCount = hookDiscoveryInfo.hooksInfo ? Object.values(hookDiscoveryInfo.hooksInfo.hooks).reduce((total, hooks) => total + hooks.length, 0) : loadedCount;
        const details = skippedCount > 0 ? localize("promptsDebugContribution.resolvedHooksWithSkipped", "Resolved {0} hooks from {1} files in {2}ms, skipped {3}", hookCount, loadedCount, durationInMillis, skippedCount) : hookCount === 1 ? localize("promptsDebugContribution.resolvedHook", "Resolved {0} hook in {1}ms", hookCount, durationInMillis) : localize("promptsDebugContribution.resolvedHooks", "Resolved {0} hooks in {1}ms", hookCount, durationInMillis);
        return {
          name: localize("promptsService.loadHooks", "Hook Discovery"),
          details
        };
      }
    }
  }
  _resolveDiscoveryEvent(eventId) {
    const info = this._discoveryEventDetails.get(eventId);
    if (!info) {
      return void 0;
    }
    return this._toFileListContent(info);
  }
  _resolveCustomizationEvent(eventId) {
    const data = this._customizationEventDetails.get(eventId);
    if (!data) {
      return void 0;
    }
    const { debugInfo, hooks } = data;
    const logs = [...debugInfo.debugDetails];
    if (hooks) {
      for (const hookType of Object.values(HookType)) {
        const commands = hooks[hookType];
        if (commands && commands.length > 0) {
          for (const cmd of commands) {
            const commandLabel = formatHookCommandLabel(cmd, OS) || localize("hook.unknownCommand", "(unknown command)");
            logs.push({
              category: "hook",
              name: commandLabel,
              reason: hookType,
              uri: cmd.sourceUri
            });
          }
        }
      }
    }
    return {
      kind: "customizationSummary",
      resolutionLogs: logs,
      durationInMillis: debugInfo.durationInMillis,
      counts: {
        instructions: logs.filter((e) => e.category === "applying" || e.category === "referenced").length,
        skills: logs.filter((e) => e.category === "skill").length,
        agents: logs.filter((e) => e.category === "custom-agent").length,
        hooks: logs.filter((e) => e.category === "hook").length,
        skipped: logs.filter((e) => e.category === "skipped").length
      }
    };
  }
  _toFileListContent(info) {
    return {
      kind: "fileList",
      discoveryType: info.type,
      durationInMillis: info.durationInMillis,
      files: info.files.map((f) => ({
        uri: f.promptPath.uri,
        name: f.promptPath.name,
        status: f.status,
        storage: f.promptPath.storage,
        extensionId: f.promptPath.extension?.identifier.value,
        skipReason: f.skipReason,
        errorMessage: f.errorMessage,
        duplicateOf: f.duplicateOf
      })),
      sourceFolders: info.sourceFolders?.map((sf) => ({
        uri: sf.uri,
        storage: sf.storage
      }))
    };
  }
};
PromptsDebugContribution.ID = "workbench.contrib.promptsDebug";
PromptsDebugContribution.MAX_DISCOVERY_DETAILS = 1e4;
PromptsDebugContribution = __decorateClass([
  __decorateParam(0, IPromptsService),
  __decorateParam(1, IChatAgentService),
  __decorateParam(2, IChatService),
  __decorateParam(3, IChatDebugService),
  __decorateParam(4, ILogService)
], PromptsDebugContribution);
const MAX_LIST_ITEMS = 100;
function truncateList(items) {
  if (items.length <= MAX_LIST_ITEMS) {
    return items.join(", ");
  }
  return items.slice(0, MAX_LIST_ITEMS).join(", ") + ` (+${items.length - MAX_LIST_ITEMS} more)`;
}
export {
  PromptsDebugContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHByb21wdHNEZWJ1Z0NvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdERlYnVnQ3VzdG9taXphdGlvbkxvZ0VudHJ5LCBJQ2hhdERlYnVnRXZlbnRGaWxlTGlzdENvbnRlbnQsIElDaGF0RGVidWdSZXNvbHZlZEV2ZW50Q29udGVudCwgSUNoYXREZWJ1Z1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vY2hhdERlYnVnU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc0FnZW50SG9zdFRhcmdldCB9IGZyb20gJy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IElDaGF0QWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdEhvb2tzLCBmb3JtYXRIb29rQ29tbWFuZExhYmVsIH0gZnJvbSAnLi4vY29tbW9uL3Byb21wdFN5bnRheC9ob29rU2NoZW1hLmpzJztcbmltcG9ydCB7IEhvb2tUeXBlIH0gZnJvbSAnLi4vY29tbW9uL3Byb21wdFN5bnRheC9ob29rVHlwZXMuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUgfSBmcm9tICcuLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IElIb29rRGlzY292ZXJ5SW5mbywgdHlwZSBJbnN0cnVjdGlvbnNDb2xsZWN0aW9uRGVidWdJbmZvLCBJUHJvbXB0RGlzY292ZXJ5SW5mbywgSVByb21wdHNTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGxhc3RJbnN0cnVjdGlvbnNDb2xsZWN0aW9uUmVzdWx0IH0gZnJvbSAnLi4vY29tbW9uL3Byb21wdFN5bnRheC9jb21wdXRlQXV0b21hdGljSW5zdHJ1Y3Rpb25zLmpzJztcblxuaW50ZXJmYWNlIElDdXN0b21pemF0aW9uRXZlbnREYXRhIHtcblx0cmVhZG9ubHkgZGVidWdJbmZvOiBJbnN0cnVjdGlvbnNDb2xsZWN0aW9uRGVidWdJbmZvO1xuXHRyZWFkb25seSBob29rczogQ2hhdFJlcXVlc3RIb29rcyB8IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBCcmlkZ2VzIHByb21wdCBkaXNjb3ZlcnkgaW5mb3JtYXRpb24gdG8ge0BsaW5rIElDaGF0RGVidWdTZXJ2aWNlfS5cbiAqL1xuZXhwb3J0IGNsYXNzIFByb21wdHNEZWJ1Z0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIucHJvbXB0c0RlYnVnJztcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfRElTQ09WRVJZX0RFVEFJTFMgPSAxMF8wMDA7XG5cblx0LyoqXG5cdCAqIE1hcHMgZGVidWcgZXZlbnQgSURzIHRvIHRoZWlyIGRpc2NvdmVyeSBpbmZvLCBzbyB0aGF0XG5cdCAqIHtAbGluayBJQ2hhdERlYnVnU2VydmljZS5yZXNvbHZlRXZlbnR9IGNhbiByZXR1cm4gcmljaCBkZXRhaWxzLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzY292ZXJ5RXZlbnREZXRhaWxzID0gbmV3IE1hcDxzdHJpbmcsIElQcm9tcHREaXNjb3ZlcnlJbmZvPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXN0b21pemF0aW9uRXZlbnREZXRhaWxzID0gbmV3IE1hcDxzdHJpbmcsIElDdXN0b21pemF0aW9uRXZlbnREYXRhPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2dnZWRTZXNzaW9ucyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvbXB0c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9tcHRzU2VydmljZTogSVByb21wdHNTZXJ2aWNlLFxuXHRcdEBJQ2hhdEFnZW50U2VydmljZSBjaGF0QWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElDaGF0RGVidWdTZXJ2aWNlIGNoYXREZWJ1Z1NlcnZpY2U6IElDaGF0RGVidWdTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIENsZWFuIHVwIGxvZ2dlZC1zZXNzaW9uIGVudHJpZXMgd2hlbiBzZXNzaW9ucyBhcmUgZGlzcG9zZWQuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2hhdFNlcnZpY2Uub25EaWREaXNwb3NlU2Vzc2lvbihlID0+IHtcblx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvblJlc291cmNlIG9mIGUuc2Vzc2lvblJlc291cmNlcykge1xuXHRcdFx0XHR0aGlzLl9sb2dnZWRTZXNzaW9ucy5kZWxldGUoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEZvcndhcmQgZGlzY292ZXJ5IGxvZyBldmVudHMgdG8gdGhlIGRlYnVnIHNlcnZpY2UuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2hhdEFnZW50U2VydmljZS5vbldpbGxJbnZva2VBZ2VudChhc3luYyBlID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25LZXkgPSBlLnJlcXVlc3Quc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBpc0ZpcnN0SW52b2NhdGlvbiA9ICF0aGlzLl9sb2dnZWRTZXNzaW9ucy5oYXMoc2Vzc2lvbktleSk7XG5cdFx0XHR0aGlzLl9sb2dnZWRTZXNzaW9ucy5hZGQoc2Vzc2lvbktleSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IGUucmVxdWVzdC5zZXNzaW9uUmVzb3VyY2U7XG5cblx0XHRcdGlmIChpc0ZpcnN0SW52b2NhdGlvbikge1xuXHRcdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHQvLyBGb3IgYWdlbnQtaG9zdCAoQ29waWxvdCBDTEkpIHNlc3Npb25zLCBWUyBDb2RlIGNvcmUgc3RpbGwgY29sbGVjdHNcblx0XHRcdFx0XHQvLyBpbnN0cnVjdGlvbnMgYW5kIGhvb2tzIGFuZCBwYXNzZXMgdGhlbSBpbnRvIHRoZSBhZ2VudC1ob3N0IHJlcXVlc3QsXG5cdFx0XHRcdFx0Ly8gc28gdGhvc2UgZGlzY292ZXJ5IGV2ZW50cyBhcmUgcmVsZXZhbnQuIEFnZW50IC8gc2tpbGwgLyBzbGFzaC1jb21tYW5kXG5cdFx0XHRcdFx0Ly8gZGlzY292ZXJ5IHJlZmxlY3RzIFZTIENvZGUncyBvd24gY2hhdC1wYXJ0aWNpcGFudCBkaXNjb3ZlcnksIHdoaWNoIHRoZVxuXHRcdFx0XHRcdC8vIGFnZW50IGhvc3QgZG9lcyBub3QgY29uc3VtZSAodGhlIGFnZW50IGhvc3Qgc3VyZmFjZXMgaXRzIGFjdHVhbGx5IGxvYWRlZFxuXHRcdFx0XHRcdC8vIGN1c3RvbWl6YXRpb25zIHNlcGFyYXRlbHkpLCBzbyB3ZSBzdXBwcmVzcyB0aG9zZSB0byBhdm9pZCBub2lzZS5cblx0XHRcdFx0XHRjb25zdCBkaXNjb3ZlcnlUeXBlcyA9IGlzQWdlbnRIb3N0VGFyZ2V0KGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpKVxuXHRcdFx0XHRcdFx0PyBbUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBQcm9tcHRzVHlwZS5ob29rXVxuXHRcdFx0XHRcdFx0OiBbUHJvbXB0c1R5cGUuYWdlbnQsIFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgUHJvbXB0c1R5cGUucHJvbXB0LCBQcm9tcHRzVHlwZS5za2lsbCwgUHJvbXB0c1R5cGUuaG9va107XG5cdFx0XHRcdFx0Y29uc3QgZGlzY292ZXJ5SW5mb3MgPSBhd2FpdCBQcm9taXNlLmFsbChkaXNjb3ZlcnlUeXBlcy5tYXAodHlwZSA9PiB0aGlzLnByb21wdHNTZXJ2aWNlLmdldERpc2NvdmVyeUluZm8odHlwZSwgY3RzLnRva2VuKSkpO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZGlzY292ZXJ5SW5mbyBvZiBkaXNjb3ZlcnlJbmZvcykge1xuXHRcdFx0XHRcdFx0Y29uc3QgeyBuYW1lLCBkZXRhaWxzIH0gPSB0aGlzLmdldERpc2NvdmVyeUxvZ0VudHJ5KGRpc2NvdmVyeUluZm8pO1xuXHRcdFx0XHRcdFx0Y29uc3QgZXZlbnRJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXG5cdFx0XHRcdFx0XHR0aGlzLl9kaXNjb3ZlcnlFdmVudERldGFpbHMuc2V0KGV2ZW50SWQsIGRpc2NvdmVyeUluZm8pO1xuXG5cdFx0XHRcdFx0XHQvLyBFdmljdCBvbGRlc3QgZW50cmllcyB3aGVuIHRoZSBtYXAgZXhjZWVkcyB0aGUgY2FwLlxuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX2Rpc2NvdmVyeUV2ZW50RGV0YWlscy5zaXplID4gUHJvbXB0c0RlYnVnQ29udHJpYnV0aW9uLk1BWF9ESVNDT1ZFUllfREVUQUlMUykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBmaXJzdCA9IHRoaXMuX2Rpc2NvdmVyeUV2ZW50RGV0YWlscy5rZXlzKCkubmV4dCgpLnZhbHVlO1xuXHRcdFx0XHRcdFx0XHRpZiAoZmlyc3QgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2Rpc2NvdmVyeUV2ZW50RGV0YWlscy5kZWxldGUoZmlyc3QpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIEVucmljaCBkZXRhaWxzIHdpdGggZmlsZSBwYXRocyBzbyB0aGV5IGFwcGVhciBpbiB0aGUgZXZlbnRcblx0XHRcdFx0XHRcdC8vIHBheWxvYWQgKGUuZy4gZm9yd2FyZGVkIHZpYSBvbkRpZFJlY2VpdmVDaGF0RGVidWdFdmVudCB0byB0aGVcblx0XHRcdFx0XHRcdC8vIGV4dGVuc2lvbidzIEpTT05MIGZpbGUgbG9nZ2VyKS5cblx0XHRcdFx0XHRcdGNvbnN0IGxvYWRlZCA9IGRpc2NvdmVyeUluZm8uZmlsZXNcblx0XHRcdFx0XHRcdFx0LmZpbHRlcihmID0+IGYuc3RhdHVzID09PSAnbG9hZGVkJylcblx0XHRcdFx0XHRcdFx0Lm1hcChmID0+IGYucHJvbXB0UGF0aC5uYW1lID8/IGYucHJvbXB0UGF0aC51cmkucGF0aC5zcGxpdCgnLycpLnBvcCgpID8/IGYucHJvbXB0UGF0aC51cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0XHRjb25zdCBza2lwcGVkID0gZGlzY292ZXJ5SW5mby5maWxlcy5maWx0ZXIoZiA9PiBmLnN0YXR1cyA9PT0gJ3NraXBwZWQnKS5tYXAoZiA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxhYmVsID0gZi5wcm9tcHRQYXRoLnVyaS50b1N0cmluZygpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZi5za2lwUmVhc29uID8gYCR7bGFiZWx9ICgke2Yuc2tpcFJlYXNvbn0pYCA6IGxhYmVsO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRjb25zdCBmb2xkZXJzID0gZGlzY292ZXJ5SW5mby5zb3VyY2VGb2xkZXJzPy5tYXAoc2YgPT4gc2YudXJpLnBhdGgpID8/IFtdO1xuXHRcdFx0XHRcdFx0Y29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdFx0XHRpZiAoZGV0YWlscykge1xuXHRcdFx0XHRcdFx0XHRwYXJ0cy5wdXNoKGRldGFpbHMpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGxvYWRlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRcdHBhcnRzLnB1c2goYGxvYWRlZDogWyR7dHJ1bmNhdGVMaXN0KGxvYWRlZCl9XWApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKHNraXBwZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0XHRwYXJ0cy5wdXNoKGBza2lwcGVkOiBbJHt0cnVuY2F0ZUxpc3Qoc2tpcHBlZCl9XWApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGZvbGRlcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0XHRwYXJ0cy5wdXNoKGBmb2xkZXJzOiBbJHt0cnVuY2F0ZUxpc3QoZm9sZGVycyl9XWApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgbmV3RGV0YWlscyA9IHBhcnRzLmpvaW4oJyB8ICcpIHx8IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRcdFx0Y2hhdERlYnVnU2VydmljZS5sb2coXG5cdFx0XHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRcdFx0bmFtZSxcblx0XHRcdFx0XHRcdFx0bmV3RGV0YWlscyxcblx0XHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHR7IGlkOiBldmVudElkLCBjYXRlZ29yeTogJ2Rpc2NvdmVyeScgfSxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoJ0Vycm9yIHdoaWxlIGxvZ2dpbmcgcHJvbXB0IGRpc2NvdmVyeSBpbmZvIHRvIGNoYXQgZGVidWcgc2VydmljZScsIGVycm9yKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRjdHMuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIExvZyByZXNvbHZlZCBjdXN0b21pemF0aW9ucyBmcm9tIHRoZSBsYXN0IGluc3RydWN0aW9ucyBjb2xsZWN0aW9uLlxuXHRcdFx0Y29uc3QgbGFzdFJlc3VsdCA9IGxhc3RJbnN0cnVjdGlvbnNDb2xsZWN0aW9uUmVzdWx0O1xuXHRcdFx0aWYgKCFpc0ZpcnN0SW52b2NhdGlvbiAmJiBsYXN0UmVzdWx0KSB7XG5cdFx0XHRcdGNvbnN0IHsgdGVsZW1ldHJ5RXZlbnQ6IGNvbGxlY3Rpb25FdmVudCwgZGVidWdJbmZvIH0gPSBsYXN0UmVzdWx0O1xuXHRcdFx0XHQvLyBGZXRjaCB0aGUgY2FjaGVkIGhvb2sgZGlzY292ZXJ5IGluZm8uXG5cdFx0XHRcdGxldCByZXNvbHZlZEhvb2tzOiBDaGF0UmVxdWVzdEhvb2tzIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IGhvb2tEaXNjb3ZlcnlJbmZvID0gYXdhaXQgdGhpcy5wcm9tcHRzU2VydmljZS5nZXREaXNjb3ZlcnlJbmZvKFByb21wdHNUeXBlLmhvb2ssIENhbmNlbGxhdGlvblRva2VuLk5vbmUpIGFzIElIb29rRGlzY292ZXJ5SW5mbztcblx0XHRcdFx0XHRyZXNvbHZlZEhvb2tzID0gaG9va0Rpc2NvdmVyeUluZm8uaG9va3NJbmZvPy5ob29rcztcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRsb2dTZXJ2aWNlLndhcm4oJ0Vycm9yIHdoaWxlIGZldGNoaW5nIGhvb2tzIGZvciBjdXN0b21pemF0aW9uIGRlYnVnIGV2ZW50JywgZXJyb3IpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdGlmIChjb2xsZWN0aW9uRXZlbnQuYXBwbHlpbmdJbnN0cnVjdGlvbnNDb3VudCA+IDApIHtcblx0XHRcdFx0XHRwYXJ0cy5wdXNoKGxvY2FsaXplKCdjdXN0b21pemF0aW9ucy5hcHBseWluZycsICd7MH0gYXBwbHlpbmcnLCBjb2xsZWN0aW9uRXZlbnQuYXBwbHlpbmdJbnN0cnVjdGlvbnNDb3VudCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjb2xsZWN0aW9uRXZlbnQucmVmZXJlbmNlZEluc3RydWN0aW9uc0NvdW50ID4gMCkge1xuXHRcdFx0XHRcdHBhcnRzLnB1c2gobG9jYWxpemUoJ2N1c3RvbWl6YXRpb25zLnJlZmVyZW5jZWQnLCAnezB9IHJlZmVyZW5jZWQnLCBjb2xsZWN0aW9uRXZlbnQucmVmZXJlbmNlZEluc3RydWN0aW9uc0NvdW50KSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNvbGxlY3Rpb25FdmVudC5hZ2VudEluc3RydWN0aW9uc0NvdW50ID4gMCkge1xuXHRcdFx0XHRcdHBhcnRzLnB1c2gobG9jYWxpemUoJ2N1c3RvbWl6YXRpb25zLmFnZW50JywgJ3swfSBhZ2VudCcsIGNvbGxlY3Rpb25FdmVudC5hZ2VudEluc3RydWN0aW9uc0NvdW50KSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNvbGxlY3Rpb25FdmVudC5saXN0ZWRJbnN0cnVjdGlvbnNDb3VudCA+IDApIHtcblx0XHRcdFx0XHRwYXJ0cy5wdXNoKGxvY2FsaXplKCdjdXN0b21pemF0aW9ucy5saXN0ZWQnLCAnezB9IGxpc3RlZCcsIGNvbGxlY3Rpb25FdmVudC5saXN0ZWRJbnN0cnVjdGlvbnNDb3VudCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGR1cmF0aW9uU3RyID0gZGVidWdJbmZvLmR1cmF0aW9uSW5NaWxsaXMudG9GaXhlZCgxKTtcblx0XHRcdFx0Y29uc3Qgc3VtbWFyeSA9IHBhcnRzLmxlbmd0aCA+IDBcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjdXN0b21pemF0aW9uc1Jlc29sdmVkLmRldGFpbHMnLCAnUmVzb2x2ZWQgezB9IGN1c3RvbWl6YXRpb25zICh7MX0pIGluIHsyfW1zJywgY29sbGVjdGlvbkV2ZW50LnRvdGFsSW5zdHJ1Y3Rpb25zQ291bnQsIHBhcnRzLmpvaW4oJywgJyksIGR1cmF0aW9uU3RyKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2N1c3RvbWl6YXRpb25zUmVzb2x2ZWQubm9uZScsICdObyBjdXN0b21pemF0aW9ucyByZXNvbHZlZCcpO1xuXHRcdFx0XHRjb25zdCBkZXRhaWxTdW1tYXJpZXMgPSBkZWJ1Z0luZm8uZGVidWdEZXRhaWxzLm1hcChlID0+IHtcblx0XHRcdFx0XHRjb25zdCBkZXRhaWwgPSBlLnJlYXNvbiA/IGAke2UubmFtZX0gXHUyMDE0ICR7ZS5yZWFzb259YCA6IGUubmFtZTtcblx0XHRcdFx0XHRyZXR1cm4gYFske2UuY2F0ZWdvcnl9XSAke2RldGFpbH1gO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgZGV0YWlscyA9IGRldGFpbFN1bW1hcmllcy5sZW5ndGggPiAwXG5cdFx0XHRcdFx0PyBgJHtzdW1tYXJ5fSB8ICR7ZGV0YWlsU3VtbWFyaWVzLmpvaW4oJywgJyl9YFxuXHRcdFx0XHRcdDogc3VtbWFyeTtcblxuXHRcdFx0XHRjb25zdCBjdXN0b21pemF0aW9uRXZlbnRJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdFx0XHR0aGlzLl9jdXN0b21pemF0aW9uRXZlbnREZXRhaWxzLnNldChjdXN0b21pemF0aW9uRXZlbnRJZCwgeyBkZWJ1Z0luZm8sIGhvb2tzOiByZXNvbHZlZEhvb2tzIH0pO1xuXG5cdFx0XHRcdC8vIEV2aWN0IG9sZGVzdCBlbnRyaWVzIHdoZW4gdGhlIG1hcCBleGNlZWRzIHRoZSBjYXAuXG5cdFx0XHRcdGlmICh0aGlzLl9jdXN0b21pemF0aW9uRXZlbnREZXRhaWxzLnNpemUgPiBQcm9tcHRzRGVidWdDb250cmlidXRpb24uTUFYX0RJU0NPVkVSWV9ERVRBSUxTKSB7XG5cdFx0XHRcdFx0Y29uc3QgZmlyc3QgPSB0aGlzLl9jdXN0b21pemF0aW9uRXZlbnREZXRhaWxzLmtleXMoKS5uZXh0KCkudmFsdWU7XG5cdFx0XHRcdFx0aWYgKGZpcnN0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2N1c3RvbWl6YXRpb25FdmVudERldGFpbHMuZGVsZXRlKGZpcnN0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjaGF0RGVidWdTZXJ2aWNlLmxvZyhcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2N1c3RvbWl6YXRpb25zUmVzb2x2ZWQnLCAnUmVzb2x2ZSBDdXN0b21pemF0aW9ucycpLFxuXHRcdFx0XHRcdGRldGFpbHMsXG5cdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdHsgaWQ6IGN1c3RvbWl6YXRpb25FdmVudElkLCBjYXRlZ29yeTogJ2N1c3RvbWl6YXRpb24nIH0sXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdC8vIFJlZ2lzdGVyIGEgcmVzb2x2ZSBwcm92aWRlciBzbyBleHBhbmRpbmcgYSBkaXNjb3ZlcnkgZXZlbnRcblx0XHQvLyBpbiB0aGUgQWdlbnQgRGVidWcgTG9ncyBzaG93cyB0aGUgZnVsbCBmaWxlIGxpc3QuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2hhdERlYnVnU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKHtcblx0XHRcdHByb3ZpZGVDaGF0RGVidWdMb2c6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdHJlc29sdmVDaGF0RGVidWdMb2dFdmVudDogYXN5bmMgKGV2ZW50SWQpID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVEaXNjb3ZlcnlFdmVudChldmVudElkKSA/PyB0aGlzLl9yZXNvbHZlQ3VzdG9taXphdGlvbkV2ZW50KGV2ZW50SWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGlzY292ZXJ5TG9nRW50cnkoZGlzY292ZXJ5SW5mbzogSVByb21wdERpc2NvdmVyeUluZm8pOiB7IHJlYWRvbmx5IG5hbWU6IHN0cmluZzsgcmVhZG9ubHkgZGV0YWlscz86IHN0cmluZyB9IHtcblxuXHRcdGNvbnN0IGR1cmF0aW9uSW5NaWxsaXMgPSBkaXNjb3ZlcnlJbmZvLmR1cmF0aW9uSW5NaWxsaXMudG9GaXhlZCgxKTtcblx0XHRjb25zdCBsb2FkZWRDb3VudCA9IGRpc2NvdmVyeUluZm8uZmlsZXMuZmlsdGVyKGZpbGUgPT4gZmlsZS5zdGF0dXMgPT09ICdsb2FkZWQnKS5sZW5ndGg7XG5cdFx0Y29uc3Qgc2tpcHBlZENvdW50ID0gZGlzY292ZXJ5SW5mby5maWxlcy5sZW5ndGggLSBsb2FkZWRDb3VudDtcblxuXHRcdHN3aXRjaCAoZGlzY292ZXJ5SW5mby50eXBlKSB7XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLnByb21wdDpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgncHJvbXB0c1NlcnZpY2UubG9hZFNsYXNoQ29tbWFuZHMnLCAnU2xhc2ggQ29tbWFuZHMgRGlzY292ZXJ5JyksXG5cdFx0XHRcdFx0ZGV0YWlsczogbG9hZGVkQ291bnQgPT09IDFcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ3Byb21wdHNEZWJ1Z0NvbnRyaWJ1dGlvbi5yZXNvbHZlZFNsYXNoQ29tbWFuZCcsICdSZXNvbHZlZCB7MH0gc2xhc2ggY29tbWFuZCBpbiB7MX1tcycsIGxvYWRlZENvdW50LCBkdXJhdGlvbkluTWlsbGlzKVxuXHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgncHJvbXB0c0RlYnVnQ29udHJpYnV0aW9uLnJlc29sdmVkU2xhc2hDb21tYW5kcycsICdSZXNvbHZlZCB7MH0gc2xhc2ggY29tbWFuZHMgaW4gezF9bXMnLCBsb2FkZWRDb3VudCwgZHVyYXRpb25Jbk1pbGxpcylcblx0XHRcdFx0fTtcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuYWdlbnQ6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ3Byb21wdHNTZXJ2aWNlLmxvYWRBZ2VudHMnLCAnQWdlbnQgRGlzY292ZXJ5JyksXG5cdFx0XHRcdFx0ZGV0YWlsczogbG9hZGVkQ291bnQgPT09IDFcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ3Byb21wdHNEZWJ1Z0NvbnRyaWJ1dGlvbi5yZXNvbHZlZEFnZW50JywgJ1Jlc29sdmVkIHswfSBhZ2VudCBpbiB7MX1tcycsIGxvYWRlZENvdW50LCBkdXJhdGlvbkluTWlsbGlzKVxuXHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgncHJvbXB0c0RlYnVnQ29udHJpYnV0aW9uLnJlc29sdmVkQWdlbnRzJywgJ1Jlc29sdmVkIHswfSBhZ2VudHMgaW4gezF9bXMnLCBsb2FkZWRDb3VudCwgZHVyYXRpb25Jbk1pbGxpcylcblx0XHRcdFx0fTtcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuc2tpbGw6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ3Byb21wdHNTZXJ2aWNlLmxvYWRTa2lsbHMnLCAnU2tpbGwgRGlzY292ZXJ5JyksXG5cdFx0XHRcdFx0ZGV0YWlsczogbG9hZGVkQ291bnQgPT09IDFcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ3Byb21wdHNEZWJ1Z0NvbnRyaWJ1dGlvbi5yZXNvbHZlZFNraWxsJywgJ1Jlc29sdmVkIHswfSBza2lsbCBpbiB7MX1tcycsIGxvYWRlZENvdW50LCBkdXJhdGlvbkluTWlsbGlzKVxuXHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgncHJvbXB0c0RlYnVnQ29udHJpYnV0aW9uLnJlc29sdmVkU2tpbGxzJywgJ1Jlc29sdmVkIHswfSBza2lsbHMgaW4gezF9bXMnLCBsb2FkZWRDb3VudCwgZHVyYXRpb25Jbk1pbGxpcylcblx0XHRcdFx0fTtcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdwcm9tcHRzU2VydmljZS5sb2FkSW5zdHJ1Y3Rpb25zJywgJ0luc3RydWN0aW9ucyBEaXNjb3ZlcnknKSxcblx0XHRcdFx0XHRkZXRhaWxzOiBsb2FkZWRDb3VudCA9PT0gMVxuXHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgncHJvbXB0c0RlYnVnQ29udHJpYnV0aW9uLnJlc29sdmVkSW5zdHJ1Y3Rpb24nLCAnUmVzb2x2ZWQgezB9IGluc3RydWN0aW9uIGluIHsxfW1zJywgbG9hZGVkQ291bnQsIGR1cmF0aW9uSW5NaWxsaXMpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdwcm9tcHRzRGVidWdDb250cmlidXRpb24ucmVzb2x2ZWRJbnN0cnVjdGlvbnMnLCAnUmVzb2x2ZWQgezB9IGluc3RydWN0aW9ucyBpbiB7MX1tcycsIGxvYWRlZENvdW50LCBkdXJhdGlvbkluTWlsbGlzKVxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5ob29rOiB7XG5cdFx0XHRcdGNvbnN0IGhvb2tEaXNjb3ZlcnlJbmZvID0gZGlzY292ZXJ5SW5mbyBhcyBJSG9va0Rpc2NvdmVyeUluZm87XG5cdFx0XHRcdGNvbnN0IGhvb2tDb3VudCA9IGhvb2tEaXNjb3ZlcnlJbmZvLmhvb2tzSW5mb1xuXHRcdFx0XHRcdD8gT2JqZWN0LnZhbHVlcyhob29rRGlzY292ZXJ5SW5mby5ob29rc0luZm8uaG9va3MpLnJlZHVjZSgodG90YWwsIGhvb2tzKSA9PiB0b3RhbCArIGhvb2tzLmxlbmd0aCwgMClcblx0XHRcdFx0XHQ6IGxvYWRlZENvdW50O1xuXHRcdFx0XHRjb25zdCBkZXRhaWxzID0gc2tpcHBlZENvdW50ID4gMFxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ3Byb21wdHNEZWJ1Z0NvbnRyaWJ1dGlvbi5yZXNvbHZlZEhvb2tzV2l0aFNraXBwZWQnLCAnUmVzb2x2ZWQgezB9IGhvb2tzIGZyb20gezF9IGZpbGVzIGluIHsyfW1zLCBza2lwcGVkIHszfScsIGhvb2tDb3VudCwgbG9hZGVkQ291bnQsIGR1cmF0aW9uSW5NaWxsaXMsIHNraXBwZWRDb3VudClcblx0XHRcdFx0XHQ6IGhvb2tDb3VudCA9PT0gMVxuXHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgncHJvbXB0c0RlYnVnQ29udHJpYnV0aW9uLnJlc29sdmVkSG9vaycsICdSZXNvbHZlZCB7MH0gaG9vayBpbiB7MX1tcycsIGhvb2tDb3VudCwgZHVyYXRpb25Jbk1pbGxpcylcblx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ3Byb21wdHNEZWJ1Z0NvbnRyaWJ1dGlvbi5yZXNvbHZlZEhvb2tzJywgJ1Jlc29sdmVkIHswfSBob29rcyBpbiB7MX1tcycsIGhvb2tDb3VudCwgZHVyYXRpb25Jbk1pbGxpcyk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ3Byb21wdHNTZXJ2aWNlLmxvYWRIb29rcycsICdIb29rIERpc2NvdmVyeScpLFxuXHRcdFx0XHRcdGRldGFpbHNcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlRGlzY292ZXJ5RXZlbnQoZXZlbnRJZDogc3RyaW5nKTogSUNoYXREZWJ1Z1Jlc29sdmVkRXZlbnRDb250ZW50IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpbmZvID0gdGhpcy5fZGlzY292ZXJ5RXZlbnREZXRhaWxzLmdldChldmVudElkKTtcblx0XHRpZiAoIWluZm8pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3RvRmlsZUxpc3RDb250ZW50KGluZm8pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZUN1c3RvbWl6YXRpb25FdmVudChldmVudElkOiBzdHJpbmcpOiBJQ2hhdERlYnVnUmVzb2x2ZWRFdmVudENvbnRlbnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9jdXN0b21pemF0aW9uRXZlbnREZXRhaWxzLmdldChldmVudElkKTtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBkZWJ1Z0luZm8sIGhvb2tzIH0gPSBkYXRhO1xuXHRcdGNvbnN0IGxvZ3M6IElDaGF0RGVidWdDdXN0b21pemF0aW9uTG9nRW50cnlbXSA9IFsuLi5kZWJ1Z0luZm8uZGVidWdEZXRhaWxzXTtcblxuXHRcdC8vIEFkZCBob29rIGVudHJpZXMgZnJvbSB0aGUgcmVzb2x2ZWQgaG9va3MgXHUyMDE0IGVhY2ggY29tbWFuZCBjYXJyaWVzIGl0cyBzb3VyY2VVcmkuXG5cdFx0aWYgKGhvb2tzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGhvb2tUeXBlIG9mIE9iamVjdC52YWx1ZXMoSG9va1R5cGUpKSB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRzID0gaG9va3NbaG9va1R5cGVdO1xuXHRcdFx0XHRpZiAoY29tbWFuZHMgJiYgY29tbWFuZHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgY21kIG9mIGNvbW1hbmRzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjb21tYW5kTGFiZWwgPSBmb3JtYXRIb29rQ29tbWFuZExhYmVsKGNtZCwgT1MpIHx8IGxvY2FsaXplKCdob29rLnVua25vd25Db21tYW5kJywgJyh1bmtub3duIGNvbW1hbmQpJyk7XG5cdFx0XHRcdFx0XHRsb2dzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRjYXRlZ29yeTogJ2hvb2snLFxuXHRcdFx0XHRcdFx0XHRuYW1lOiBjb21tYW5kTGFiZWwsXG5cdFx0XHRcdFx0XHRcdHJlYXNvbjogaG9va1R5cGUsXG5cdFx0XHRcdFx0XHRcdHVyaTogY21kLnNvdXJjZVVyaSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnY3VzdG9taXphdGlvblN1bW1hcnknLFxuXHRcdFx0cmVzb2x1dGlvbkxvZ3M6IGxvZ3MsXG5cdFx0XHRkdXJhdGlvbkluTWlsbGlzOiBkZWJ1Z0luZm8uZHVyYXRpb25Jbk1pbGxpcyxcblx0XHRcdGNvdW50czoge1xuXHRcdFx0XHRpbnN0cnVjdGlvbnM6IGxvZ3MuZmlsdGVyKGUgPT4gZS5jYXRlZ29yeSA9PT0gJ2FwcGx5aW5nJyB8fCBlLmNhdGVnb3J5ID09PSAncmVmZXJlbmNlZCcpLmxlbmd0aCxcblx0XHRcdFx0c2tpbGxzOiBsb2dzLmZpbHRlcihlID0+IGUuY2F0ZWdvcnkgPT09ICdza2lsbCcpLmxlbmd0aCxcblx0XHRcdFx0YWdlbnRzOiBsb2dzLmZpbHRlcihlID0+IGUuY2F0ZWdvcnkgPT09ICdjdXN0b20tYWdlbnQnKS5sZW5ndGgsXG5cdFx0XHRcdGhvb2tzOiBsb2dzLmZpbHRlcihlID0+IGUuY2F0ZWdvcnkgPT09ICdob29rJykubGVuZ3RoLFxuXHRcdFx0XHRza2lwcGVkOiBsb2dzLmZpbHRlcihlID0+IGUuY2F0ZWdvcnkgPT09ICdza2lwcGVkJykubGVuZ3RoLFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9GaWxlTGlzdENvbnRlbnQoaW5mbzogSVByb21wdERpc2NvdmVyeUluZm8pOiBJQ2hhdERlYnVnRXZlbnRGaWxlTGlzdENvbnRlbnQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnZmlsZUxpc3QnLFxuXHRcdFx0ZGlzY292ZXJ5VHlwZTogaW5mby50eXBlLFxuXHRcdFx0ZHVyYXRpb25Jbk1pbGxpczogaW5mby5kdXJhdGlvbkluTWlsbGlzLFxuXHRcdFx0ZmlsZXM6IGluZm8uZmlsZXMubWFwKGYgPT4gKHtcblx0XHRcdFx0dXJpOiBmLnByb21wdFBhdGgudXJpLFxuXHRcdFx0XHRuYW1lOiBmLnByb21wdFBhdGgubmFtZSxcblx0XHRcdFx0c3RhdHVzOiBmLnN0YXR1cyxcblx0XHRcdFx0c3RvcmFnZTogZi5wcm9tcHRQYXRoLnN0b3JhZ2UsXG5cdFx0XHRcdGV4dGVuc2lvbklkOiBmLnByb21wdFBhdGguZXh0ZW5zaW9uPy5pZGVudGlmaWVyLnZhbHVlLFxuXHRcdFx0XHRza2lwUmVhc29uOiBmLnNraXBSZWFzb24sXG5cdFx0XHRcdGVycm9yTWVzc2FnZTogZi5lcnJvck1lc3NhZ2UsXG5cdFx0XHRcdGR1cGxpY2F0ZU9mOiBmLmR1cGxpY2F0ZU9mLFxuXHRcdFx0fSkpLFxuXHRcdFx0c291cmNlRm9sZGVyczogaW5mby5zb3VyY2VGb2xkZXJzPy5tYXAoc2YgPT4gKHtcblx0XHRcdFx0dXJpOiBzZi51cmksXG5cdFx0XHRcdHN0b3JhZ2U6IHNmLnN0b3JhZ2UsXG5cdFx0XHR9KSksXG5cdFx0fTtcblx0fVxufVxuXG5jb25zdCBNQVhfTElTVF9JVEVNUyA9IDEwMDtcblxuLyoqXG4gKiBKb2luIGEgbGlzdCBvZiBzdHJpbmdzLCB0cnVuY2F0aW5nIGFmdGVyIHtAbGluayBNQVhfTElTVF9JVEVNU30gZW50cmllcy5cbiAqIEZ1bGwgZGV0YWlscyBhcmUgYXZhaWxhYmxlIHZpYSB7QGxpbmsgSUNoYXREZWJ1Z1NlcnZpY2UucmVzb2x2ZUV2ZW50fS5cbiAqL1xuZnVuY3Rpb24gdHJ1bmNhdGVMaXN0KGl0ZW1zOiBzdHJpbmdbXSk6IHN0cmluZyB7XG5cdGlmIChpdGVtcy5sZW5ndGggPD0gTUFYX0xJU1RfSVRFTVMpIHtcblx0XHRyZXR1cm4gaXRlbXMuam9pbignLCAnKTtcblx0fVxuXG5cdHJldHVybiBpdGVtcy5zbGljZSgwLCBNQVhfTElTVF9JVEVNUykuam9pbignLCAnKSArIGAgKCske2l0ZW1zLmxlbmd0aCAtIE1BWF9MSVNUX0lURU1TfSBtb3JlKWA7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFVBQVU7QUFDbkIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUI7QUFFNUIsU0FBMEcseUJBQXlCO0FBQ25JLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQTJCLDhCQUE4QjtBQUN6RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1CQUFtQjtBQUM1QixTQUF5Rix1QkFBdUI7QUFDaEgsU0FBUyx3Q0FBd0M7QUFVMUMsSUFBTSwyQkFBTixjQUF1QyxXQUE2QztBQUFBLEVBYzFGLFlBQ21DLGdCQUNmLGtCQUNMLGFBQ0ssa0JBQ04sWUFDWjtBQUNELFVBQU07QUFONEI7QUFMbkM7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFp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
