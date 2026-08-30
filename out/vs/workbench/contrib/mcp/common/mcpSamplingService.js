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
import { asArray } from "../../../../base/common/arrays.js";
import { mapFindFirst } from "../../../../base/common/arraysFind.js";
import { Sequencer } from "../../../../base/common/async.js";
import { decodeBase64 } from "../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { isDefined } from "../../../../base/common/types.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, getConfigValueInTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { ChatConfiguration } from "../../chat/common/constants.js";
import { ChatMessageRole, ILanguageModelsService } from "../../chat/common/languageModels.js";
import { McpCommandIds } from "./mcpCommandIds.js";
import { mcpServerSamplingSection } from "./mcpConfiguration.js";
import { McpSamplingLog } from "./mcpSamplingLog.js";
import { McpError } from "./mcpTypes.js";
var ModelMatch = /* @__PURE__ */ ((ModelMatch2) => {
  ModelMatch2[ModelMatch2["UnsureAllowedDuringChat"] = 0] = "UnsureAllowedDuringChat";
  ModelMatch2[ModelMatch2["UnsureAllowedOutsideChat"] = 1] = "UnsureAllowedOutsideChat";
  ModelMatch2[ModelMatch2["NotAllowed"] = 2] = "NotAllowed";
  ModelMatch2[ModelMatch2["NoMatchingModel"] = 3] = "NoMatchingModel";
  return ModelMatch2;
})(ModelMatch || {});
let McpSamplingService = class extends Disposable {
  constructor(_languageModelsService, _configurationService, _dialogService, _notificationService, _commandService, instaService) {
    super();
    this._languageModelsService = _languageModelsService;
    this._configurationService = _configurationService;
    this._dialogService = _dialogService;
    this._notificationService = _notificationService;
    this._commandService = _commandService;
    this._sessionSets = {
      allowedDuringChat: /* @__PURE__ */ new Map(),
      allowedOutsideChat: /* @__PURE__ */ new Map()
    };
    this._modelSequencer = new Sequencer();
    this._logs = this._register(instaService.createInstance(McpSamplingLog));
  }
  async sample(opts, token = CancellationToken.None) {
    const messages = opts.params.messages.map((message) => {
      const content = asArray(message.content).map(
        (part) => part.type === "text" ? { type: "text", value: part.text } : part.type === "image" || part.type === "audio" ? { type: "image_url", value: { mimeType: part.mimeType, data: decodeBase64(part.data) } } : void 0
      ).filter(isDefined);
      if (!content.length) {
        return void 0;
      }
      return {
        role: message.role === "assistant" ? ChatMessageRole.Assistant : ChatMessageRole.User,
        content
      };
    }).filter(isDefined);
    if (opts.params.systemPrompt) {
      messages.unshift({ role: ChatMessageRole.System, content: [{ type: "text", value: opts.params.systemPrompt }] });
    }
    const model = await this._modelSequencer.queue(() => this._getMatchingModel(opts));
    const response = await this._languageModelsService.sendChatRequest(model, void 0, messages, {}, token);
    let responseText = "";
    const streaming = (async () => {
      for await (const part of response.stream) {
        if (Array.isArray(part)) {
          for (const p of part) {
            if (p.type === "text") {
              responseText += p.value;
            }
          }
        } else if (part.type === "text") {
          responseText += part.value;
        }
      }
    })();
    try {
      await Promise.all([response.result, streaming]);
      this._logs.add(opts.server, opts.params.messages, responseText, model);
      return {
        sample: {
          model,
          content: { type: "text", text: responseText },
          role: "assistant"
          // it came from the model!
        }
      };
    } catch (err) {
      throw McpError.unknown(err);
    }
  }
  hasLogs(server) {
    return this._logs.has(server);
  }
  getLogText(server) {
    return this._logs.getAsText(server);
  }
  async _getMatchingModel(opts) {
    const model = await this._getMatchingModelInner(opts.server, opts.isDuringToolCall, opts.params.modelPreferences);
    const globalAutoApprove = this._configurationService.getValue(ChatConfiguration.GlobalAutoApprove);
    if (model === 0 /* UnsureAllowedDuringChat */) {
      if (globalAutoApprove) {
        this._sessionSets.allowedDuringChat.set(opts.server.definition.id, true);
        return this._getMatchingModel(opts);
      }
      const retry = await this._showContextual(
        opts.isDuringToolCall,
        localize("mcp.sampling.allowDuringChat.title", 'Allow MCP tools from "{0}" to make LLM requests?', opts.server.definition.label),
        localize("mcp.sampling.allowDuringChat.desc", 'The MCP server "{0}" has issued a request to make a language model call. Do you want to allow it to make requests during chat?', opts.server.definition.label),
        this.allowButtons(opts.server, "allowedDuringChat")
      );
      if (retry) {
        return this._getMatchingModel(opts);
      }
      throw McpError.notAllowed();
    } else if (model === 1 /* UnsureAllowedOutsideChat */) {
      if (globalAutoApprove) {
        this._sessionSets.allowedOutsideChat.set(opts.server.definition.id, true);
        return this._getMatchingModel(opts);
      }
      const retry = await this._showContextual(
        opts.isDuringToolCall,
        localize("mcp.sampling.allowOutsideChat.title", 'Allow MCP server "{0}" to make LLM requests?', opts.server.definition.label),
        localize("mcp.sampling.allowOutsideChat.desc", 'The MCP server "{0}" has issued a request to make a language model call. Do you want to allow it to make requests, outside of tool calls during chat?', opts.server.definition.label),
        this.allowButtons(opts.server, "allowedOutsideChat")
      );
      if (retry) {
        return this._getMatchingModel(opts);
      }
      throw McpError.notAllowed();
    } else if (model === 2 /* NotAllowed */) {
      throw McpError.notAllowed();
    } else if (model === 3 /* NoMatchingModel */) {
      const newlyPickedModels = opts.isDuringToolCall ? await this._commandService.executeCommand(McpCommandIds.ConfigureSamplingModels, opts.server) : await this._notify(
        localize("mcp.sampling.needsModels", 'MCP server "{0}" triggered a language model request, but it has no allowlisted models.', opts.server.definition.label),
        {
          [localize("configure", "Configure")]: () => this._commandService.executeCommand(McpCommandIds.ConfigureSamplingModels, opts.server),
          [localize("cancel", "Cancel")]: () => Promise.resolve(void 0)
        }
      );
      if (newlyPickedModels) {
        return this._getMatchingModel(opts);
      }
      throw McpError.notAllowed();
    }
    return model;
  }
  allowButtons(server, key) {
    return {
      [localize("mcp.sampling.allow.inSession", "Allow in this Session")]: async () => {
        this._sessionSets[key].set(server.definition.id, true);
        return true;
      },
      [localize("mcp.sampling.allow.always", "Always")]: async () => {
        await this.updateConfig(server, (c) => c[key] = true);
        return true;
      },
      [localize("mcp.sampling.allow.notNow", "Not Now")]: async () => {
        this._sessionSets[key].set(server.definition.id, false);
        return false;
      },
      [localize("mcp.sampling.allow.never", "Never")]: async () => {
        await this.updateConfig(server, (c) => c[key] = false);
        return false;
      }
    };
  }
  async _showContextual(isDuringToolCall, title, message, buttons) {
    if (isDuringToolCall) {
      const result = await this._dialogService.prompt({
        type: "question",
        title,
        message,
        buttons: Object.entries(buttons).map(([label, run]) => ({ label, run }))
      });
      return await result.result;
    } else {
      return await this._notify(message, buttons);
    }
  }
  async _notify(message, buttons) {
    return await new Promise((resolve) => {
      const handle = this._notificationService.prompt(
        Severity.Info,
        message,
        Object.entries(buttons).map(([label, action]) => ({
          label,
          run: () => resolve(action())
        }))
      );
      Event.once(handle.onDidClose)(() => resolve(void 0));
    });
  }
  /**
   * Gets the matching model for the MCP server in this context, or
   * a reason why no model could be selected.
   */
  async _getMatchingModelInner(server, isDuringToolCall, preferences) {
    const config = this.getConfig(server);
    if (isDuringToolCall && !config.allowedDuringChat && !this._sessionSets.allowedDuringChat.has(server.definition.id)) {
      return config.allowedDuringChat === void 0 ? 0 /* UnsureAllowedDuringChat */ : 2 /* NotAllowed */;
    } else if (!isDuringToolCall && !config.allowedOutsideChat && !this._sessionSets.allowedOutsideChat.has(server.definition.id)) {
      return config.allowedOutsideChat === void 0 ? 1 /* UnsureAllowedOutsideChat */ : 2 /* NotAllowed */;
    }
    const foundModelIds = config.allowedModels?.filter((m) => !!this._languageModelsService.lookupLanguageModel(m)) || this._getDefaultModels();
    if (!foundModelIds.length) {
      return 3 /* NoMatchingModel */;
    }
    if (preferences?.hints) {
      const found = mapFindFirst(preferences.hints, (hint) => foundModelIds.find((model) => model.toLowerCase().includes(hint.name.toLowerCase())));
      if (found) {
        return found;
      }
    }
    return foundModelIds[0];
  }
  _getDefaultModels() {
    const candidates = this._languageModelsService.getLanguageModelIds().map((m) => {
      const model = this._languageModelsService.lookupLanguageModel(m);
      return model && !model.multiplierNumeric && !model.targetChatSessionType ? { model, id: m } : void 0;
    }).filter(isDefined);
    const someDefault = candidates.findIndex((c) => Object.values(c.model.isDefaultForLocation).some(Boolean));
    if (someDefault !== -1) {
      [candidates[0], candidates[someDefault]] = [candidates[someDefault], candidates[0]];
    }
    return candidates.map((c) => c.id);
  }
  _configKey(server) {
    return `${server.collection.label}: ${server.definition.label}`;
  }
  getConfig(server) {
    return this._getConfig(server).value || {};
  }
  /**
   * _getConfig reads the sampling config reads the `{ server: data }` mapping
   * from the appropriate config. We read from the most specific possible
   * config up to the default configuration location that the MCP server itself
   * is defined in. We don't go further because then workspace-specific servers
   * would get in the user settings which is not meaningful and could lead
   * to confusion.
   *
   * todo@connor4312: generalize this for other esttings when we have them
   */
  _getConfig(server) {
    const def = server.readDefinitions().get();
    const mostSpecificConfig = ConfigurationTarget.MEMORY;
    const leastSpecificConfig = def.collection?.configTarget || ConfigurationTarget.USER;
    const key = this._configKey(server);
    const resource = def.collection?.presentation?.origin;
    const configValue = this._configurationService.inspect(mcpServerSamplingSection, { resource });
    for (let target = mostSpecificConfig; target >= leastSpecificConfig; target--) {
      const mapping = getConfigValueInTarget(configValue, target);
      const config = mapping?.[key];
      if (config) {
        return { value: config, key, mapping, target, resource };
      }
    }
    return { value: void 0, mapping: getConfigValueInTarget(configValue, leastSpecificConfig), key, target: leastSpecificConfig, resource };
  }
  async updateConfig(server, mutate) {
    const { value, mapping, key, target, resource } = this._getConfig(server);
    const newConfig = { ...value };
    mutate(newConfig);
    await this._configurationService.updateValue(
      mcpServerSamplingSection,
      { ...mapping, [key]: newConfig },
      { resource },
      target
    );
    return newConfig;
  }
};
McpSamplingService = __decorateClass([
  __decorateParam(0, ILanguageModelsService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IDialogService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IInstantiationService)
], McpSamplingService);
export {
  McpSamplingService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcY29tbW9uXFxtY3BTYW1wbGluZ1NlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IG1hcEZpbmRGaXJzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5c0ZpbmQuanMnO1xuaW1wb3J0IHsgU2VxdWVuY2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZGVjb2RlQmFzZTY0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgZ2V0Q29uZmlnVmFsdWVJblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0SW1hZ2VNaW1lVHlwZSwgQ2hhdE1lc3NhZ2VSb2xlLCBJQ2hhdE1lc3NhZ2UsIElDaGF0TWVzc2FnZVBhcnQsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBNY3BDb21tYW5kSWRzIH0gZnJvbSAnLi9tY3BDb21tYW5kSWRzLmpzJztcbmltcG9ydCB7IElNY3BTZXJ2ZXJTYW1wbGluZ0NvbmZpZ3VyYXRpb24sIG1jcFNlcnZlclNhbXBsaW5nU2VjdGlvbiB9IGZyb20gJy4vbWNwQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBNY3BTYW1wbGluZ0xvZyB9IGZyb20gJy4vbWNwU2FtcGxpbmdMb2cuanMnO1xuaW1wb3J0IHsgSU1jcFNhbXBsaW5nU2VydmljZSwgSU1jcFNlcnZlciwgSVNhbXBsaW5nT3B0aW9ucywgSVNhbXBsaW5nUmVzdWx0LCBNY3BFcnJvciB9IGZyb20gJy4vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgTUNQIH0gZnJvbSAnLi9tb2RlbENvbnRleHRQcm90b2NvbC5qcyc7XG5cbmNvbnN0IGVudW0gTW9kZWxNYXRjaCB7XG5cdFVuc3VyZUFsbG93ZWREdXJpbmdDaGF0LFxuXHRVbnN1cmVBbGxvd2VkT3V0c2lkZUNoYXQsXG5cdE5vdEFsbG93ZWQsXG5cdE5vTWF0Y2hpbmdNb2RlbCxcbn1cblxuZXhwb3J0IGNsYXNzIE1jcFNhbXBsaW5nU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTWNwU2FtcGxpbmdTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblNldHMgPSB7XG5cdFx0YWxsb3dlZER1cmluZ0NoYXQ6IG5ldyBNYXA8c3RyaW5nLCBib29sZWFuPigpLFxuXHRcdGFsbG93ZWRPdXRzaWRlQ2hhdDogbmV3IE1hcDxzdHJpbmcsIGJvb2xlYW4+KCksXG5cdH07XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbG9nczogTWNwU2FtcGxpbmdMb2c7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxTZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2xvZ3MgPSB0aGlzLl9yZWdpc3RlcihpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwU2FtcGxpbmdMb2cpKTtcblx0fVxuXG5cdGFzeW5jIHNhbXBsZShvcHRzOiBJU2FtcGxpbmdPcHRpb25zLCB0b2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUpOiBQcm9taXNlPElTYW1wbGluZ1Jlc3VsdD4ge1xuXHRcdGNvbnN0IG1lc3NhZ2VzID0gb3B0cy5wYXJhbXMubWVzc2FnZXMubWFwKChtZXNzYWdlKTogSUNoYXRNZXNzYWdlIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQ6IElDaGF0TWVzc2FnZVBhcnRbXSA9IGFzQXJyYXkobWVzc2FnZS5jb250ZW50KS5tYXAoKHBhcnQpOiBJQ2hhdE1lc3NhZ2VQYXJ0IHwgdW5kZWZpbmVkID0+IHBhcnQudHlwZSA9PT0gJ3RleHQnXG5cdFx0XHRcdD8geyB0eXBlOiAndGV4dCcsIHZhbHVlOiBwYXJ0LnRleHQgfVxuXHRcdFx0XHQ6IHBhcnQudHlwZSA9PT0gJ2ltYWdlJyB8fCBwYXJ0LnR5cGUgPT09ICdhdWRpbydcblx0XHRcdFx0XHQ/IHsgdHlwZTogJ2ltYWdlX3VybCcsIHZhbHVlOiB7IG1pbWVUeXBlOiBwYXJ0Lm1pbWVUeXBlIGFzIENoYXRJbWFnZU1pbWVUeXBlLCBkYXRhOiBkZWNvZGVCYXNlNjQocGFydC5kYXRhKSB9IH1cblx0XHRcdFx0XHQ6IHVuZGVmaW5lZFxuXHRcdFx0KS5maWx0ZXIoaXNEZWZpbmVkKTtcblxuXHRcdFx0aWYgKCFjb250ZW50Lmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cm9sZTogbWVzc2FnZS5yb2xlID09PSAnYXNzaXN0YW50JyA/IENoYXRNZXNzYWdlUm9sZS5Bc3Npc3RhbnQgOiBDaGF0TWVzc2FnZVJvbGUuVXNlcixcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdH07XG5cdFx0fSkuZmlsdGVyKGlzRGVmaW5lZCk7XG5cblx0XHRpZiAob3B0cy5wYXJhbXMuc3lzdGVtUHJvbXB0KSB7XG5cdFx0XHRtZXNzYWdlcy51bnNoaWZ0KHsgcm9sZTogQ2hhdE1lc3NhZ2VSb2xlLlN5c3RlbSwgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB2YWx1ZTogb3B0cy5wYXJhbXMuc3lzdGVtUHJvbXB0IH1dIH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5fbW9kZWxTZXF1ZW5jZXIucXVldWUoKCkgPT4gdGhpcy5fZ2V0TWF0Y2hpbmdNb2RlbChvcHRzKSk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2Uuc2VuZENoYXRSZXF1ZXN0KG1vZGVsLCB1bmRlZmluZWQsIG1lc3NhZ2VzLCB7fSwgdG9rZW4pO1xuXG5cdFx0bGV0IHJlc3BvbnNlVGV4dCA9ICcnO1xuXG5cdFx0Ly8gTUNQIGRvZXNuJ3QgaGF2ZSBhIG5vdGlvbiBvZiBhIG11bHRpLXBhcnQgc2FtcGxpbmcgcmVzcG9uc2UsIHNvIHdlIG9ubHkgcHJlc2VydmUgdGV4dFxuXHRcdC8vIFJlZiBodHRwczovL2dpdGh1Yi5jb20vbW9kZWxjb250ZXh0cHJvdG9jb2wvbW9kZWxjb250ZXh0cHJvdG9jb2wvaXNzdWVzLzkxXG5cdFx0Y29uc3Qgc3RyZWFtaW5nID0gKGFzeW5jICgpID0+IHtcblx0XHRcdGZvciBhd2FpdCAoY29uc3QgcGFydCBvZiByZXNwb25zZS5zdHJlYW0pIHtcblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkocGFydCkpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHAgb2YgcGFydCkge1xuXHRcdFx0XHRcdFx0aWYgKHAudHlwZSA9PT0gJ3RleHQnKSB7XG5cdFx0XHRcdFx0XHRcdHJlc3BvbnNlVGV4dCArPSBwLnZhbHVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChwYXJ0LnR5cGUgPT09ICd0ZXh0Jykge1xuXHRcdFx0XHRcdHJlc3BvbnNlVGV4dCArPSBwYXJ0LnZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkoKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbcmVzcG9uc2UucmVzdWx0LCBzdHJlYW1pbmddKTtcblx0XHRcdHRoaXMuX2xvZ3MuYWRkKG9wdHMuc2VydmVyLCBvcHRzLnBhcmFtcy5tZXNzYWdlcywgcmVzcG9uc2VUZXh0LCBtb2RlbCk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzYW1wbGU6IHtcblx0XHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0XHRjb250ZW50OiB7IHR5cGU6ICd0ZXh0JywgdGV4dDogcmVzcG9uc2VUZXh0IH0sXG5cdFx0XHRcdFx0cm9sZTogJ2Fzc2lzdGFudCcsIC8vIGl0IGNhbWUgZnJvbSB0aGUgbW9kZWwhXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhyb3cgTWNwRXJyb3IudW5rbm93bihlcnIpO1xuXHRcdH1cblx0fVxuXG5cdGhhc0xvZ3Moc2VydmVyOiBJTWNwU2VydmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2xvZ3MuaGFzKHNlcnZlcik7XG5cdH1cblxuXHRnZXRMb2dUZXh0KHNlcnZlcjogSU1jcFNlcnZlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2xvZ3MuZ2V0QXNUZXh0KHNlcnZlcik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRNYXRjaGluZ01vZGVsKG9wdHM6IElTYW1wbGluZ09wdGlvbnMpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5fZ2V0TWF0Y2hpbmdNb2RlbElubmVyKG9wdHMuc2VydmVyLCBvcHRzLmlzRHVyaW5nVG9vbENhbGwsIG9wdHMucGFyYW1zLm1vZGVsUHJlZmVyZW5jZXMpO1xuXHRcdGNvbnN0IGdsb2JhbEF1dG9BcHByb3ZlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uR2xvYmFsQXV0b0FwcHJvdmUpO1xuXG5cdFx0aWYgKG1vZGVsID09PSBNb2RlbE1hdGNoLlVuc3VyZUFsbG93ZWREdXJpbmdDaGF0KSB7XG5cdFx0XHQvLyBJbiBZT0xPIG1vZGUsIGF1dG8tYXBwcm92ZSBNQ1Agc2FtcGxpbmcgcmVxdWVzdHMgd2l0aG91dCBwcm9tcHRpbmdcblx0XHRcdGlmIChnbG9iYWxBdXRvQXBwcm92ZSkge1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uU2V0cy5hbGxvd2VkRHVyaW5nQ2hhdC5zZXQob3B0cy5zZXJ2ZXIuZGVmaW5pdGlvbi5pZCwgdHJ1ZSk7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9nZXRNYXRjaGluZ01vZGVsKG9wdHMpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmV0cnkgPSBhd2FpdCB0aGlzLl9zaG93Q29udGV4dHVhbChcblx0XHRcdFx0b3B0cy5pc0R1cmluZ1Rvb2xDYWxsLFxuXHRcdFx0XHRsb2NhbGl6ZSgnbWNwLnNhbXBsaW5nLmFsbG93RHVyaW5nQ2hhdC50aXRsZScsICdBbGxvdyBNQ1AgdG9vbHMgZnJvbSBcInswfVwiIHRvIG1ha2UgTExNIHJlcXVlc3RzPycsIG9wdHMuc2VydmVyLmRlZmluaXRpb24ubGFiZWwpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnbWNwLnNhbXBsaW5nLmFsbG93RHVyaW5nQ2hhdC5kZXNjJywgJ1RoZSBNQ1Agc2VydmVyIFwiezB9XCIgaGFzIGlzc3VlZCBhIHJlcXVlc3QgdG8gbWFrZSBhIGxhbmd1YWdlIG1vZGVsIGNhbGwuIERvIHlvdSB3YW50IHRvIGFsbG93IGl0IHRvIG1ha2UgcmVxdWVzdHMgZHVyaW5nIGNoYXQ/Jywgb3B0cy5zZXJ2ZXIuZGVmaW5pdGlvbi5sYWJlbCksXG5cdFx0XHRcdHRoaXMuYWxsb3dCdXR0b25zKG9wdHMuc2VydmVyLCAnYWxsb3dlZER1cmluZ0NoYXQnKVxuXHRcdFx0KTtcblx0XHRcdGlmIChyZXRyeSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZ2V0TWF0Y2hpbmdNb2RlbChvcHRzKTtcblx0XHRcdH1cblx0XHRcdHRocm93IE1jcEVycm9yLm5vdEFsbG93ZWQoKTtcblx0XHR9IGVsc2UgaWYgKG1vZGVsID09PSBNb2RlbE1hdGNoLlVuc3VyZUFsbG93ZWRPdXRzaWRlQ2hhdCkge1xuXHRcdFx0Ly8gSW4gWU9MTyBtb2RlLCBhdXRvLWFwcHJvdmUgTUNQIHNhbXBsaW5nIHJlcXVlc3RzIHdpdGhvdXQgcHJvbXB0aW5nXG5cdFx0XHRpZiAoZ2xvYmFsQXV0b0FwcHJvdmUpIHtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvblNldHMuYWxsb3dlZE91dHNpZGVDaGF0LnNldChvcHRzLnNlcnZlci5kZWZpbml0aW9uLmlkLCB0cnVlKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2dldE1hdGNoaW5nTW9kZWwob3B0cyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXRyeSA9IGF3YWl0IHRoaXMuX3Nob3dDb250ZXh0dWFsKFxuXHRcdFx0XHRvcHRzLmlzRHVyaW5nVG9vbENhbGwsXG5cdFx0XHRcdGxvY2FsaXplKCdtY3Auc2FtcGxpbmcuYWxsb3dPdXRzaWRlQ2hhdC50aXRsZScsICdBbGxvdyBNQ1Agc2VydmVyIFwiezB9XCIgdG8gbWFrZSBMTE0gcmVxdWVzdHM/Jywgb3B0cy5zZXJ2ZXIuZGVmaW5pdGlvbi5sYWJlbCksXG5cdFx0XHRcdGxvY2FsaXplKCdtY3Auc2FtcGxpbmcuYWxsb3dPdXRzaWRlQ2hhdC5kZXNjJywgJ1RoZSBNQ1Agc2VydmVyIFwiezB9XCIgaGFzIGlzc3VlZCBhIHJlcXVlc3QgdG8gbWFrZSBhIGxhbmd1YWdlIG1vZGVsIGNhbGwuIERvIHlvdSB3YW50IHRvIGFsbG93IGl0IHRvIG1ha2UgcmVxdWVzdHMsIG91dHNpZGUgb2YgdG9vbCBjYWxscyBkdXJpbmcgY2hhdD8nLCBvcHRzLnNlcnZlci5kZWZpbml0aW9uLmxhYmVsKSxcblx0XHRcdFx0dGhpcy5hbGxvd0J1dHRvbnMob3B0cy5zZXJ2ZXIsICdhbGxvd2VkT3V0c2lkZUNoYXQnKVxuXHRcdFx0KTtcblx0XHRcdGlmIChyZXRyeSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZ2V0TWF0Y2hpbmdNb2RlbChvcHRzKTtcblx0XHRcdH1cblx0XHRcdHRocm93IE1jcEVycm9yLm5vdEFsbG93ZWQoKTtcblx0XHR9IGVsc2UgaWYgKG1vZGVsID09PSBNb2RlbE1hdGNoLk5vdEFsbG93ZWQpIHtcblx0XHRcdHRocm93IE1jcEVycm9yLm5vdEFsbG93ZWQoKTtcblx0XHR9IGVsc2UgaWYgKG1vZGVsID09PSBNb2RlbE1hdGNoLk5vTWF0Y2hpbmdNb2RlbCkge1xuXHRcdFx0Y29uc3QgbmV3bHlQaWNrZWRNb2RlbHMgPSBvcHRzLmlzRHVyaW5nVG9vbENhbGxcblx0XHRcdFx0PyBhd2FpdCB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxudW1iZXI+KE1jcENvbW1hbmRJZHMuQ29uZmlndXJlU2FtcGxpbmdNb2RlbHMsIG9wdHMuc2VydmVyKVxuXHRcdFx0XHQ6IGF3YWl0IHRoaXMuX25vdGlmeShcblx0XHRcdFx0XHRsb2NhbGl6ZSgnbWNwLnNhbXBsaW5nLm5lZWRzTW9kZWxzJywgJ01DUCBzZXJ2ZXIgXCJ7MH1cIiB0cmlnZ2VyZWQgYSBsYW5ndWFnZSBtb2RlbCByZXF1ZXN0LCBidXQgaXQgaGFzIG5vIGFsbG93bGlzdGVkIG1vZGVscy4nLCBvcHRzLnNlcnZlci5kZWZpbml0aW9uLmxhYmVsKSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRbbG9jYWxpemUoJ2NvbmZpZ3VyZScsICdDb25maWd1cmUnKV06ICgpID0+IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kPG51bWJlcj4oTWNwQ29tbWFuZElkcy5Db25maWd1cmVTYW1wbGluZ01vZGVscywgb3B0cy5zZXJ2ZXIpLFxuXHRcdFx0XHRcdFx0W2xvY2FsaXplKCdjYW5jZWwnLCAnQ2FuY2VsJyldOiAoKSA9PiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdCk7XG5cdFx0XHRpZiAobmV3bHlQaWNrZWRNb2RlbHMpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2dldE1hdGNoaW5nTW9kZWwob3B0cyk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBNY3BFcnJvci5ub3RBbGxvd2VkKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1vZGVsO1xuXHR9XG5cblx0cHJpdmF0ZSBhbGxvd0J1dHRvbnMoc2VydmVyOiBJTWNwU2VydmVyLCBrZXk6ICdhbGxvd2VkRHVyaW5nQ2hhdCcgfCAnYWxsb3dlZE91dHNpZGVDaGF0Jykge1xuXHRcdHJldHVybiB7XG5cdFx0XHRbbG9jYWxpemUoJ21jcC5zYW1wbGluZy5hbGxvdy5pblNlc3Npb24nLCAnQWxsb3cgaW4gdGhpcyBTZXNzaW9uJyldOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25TZXRzW2tleV0uc2V0KHNlcnZlci5kZWZpbml0aW9uLmlkLCB0cnVlKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9LFxuXHRcdFx0W2xvY2FsaXplKCdtY3Auc2FtcGxpbmcuYWxsb3cuYWx3YXlzJywgJ0Fsd2F5cycpXTogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZUNvbmZpZyhzZXJ2ZXIsIGMgPT4gY1trZXldID0gdHJ1ZSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSxcblx0XHRcdFtsb2NhbGl6ZSgnbWNwLnNhbXBsaW5nLmFsbG93Lm5vdE5vdycsICdOb3QgTm93JyldOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25TZXRzW2tleV0uc2V0KHNlcnZlci5kZWZpbml0aW9uLmlkLCBmYWxzZSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0sXG5cdFx0XHRbbG9jYWxpemUoJ21jcC5zYW1wbGluZy5hbGxvdy5uZXZlcicsICdOZXZlcicpXTogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZUNvbmZpZyhzZXJ2ZXIsIGMgPT4gY1trZXldID0gZmFsc2UpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zaG93Q29udGV4dHVhbDxUPihpc0R1cmluZ1Rvb2xDYWxsOiBib29sZWFuLCB0aXRsZTogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcsIGJ1dHRvbnM6IFJlY29yZDxzdHJpbmcsICgpID0+IFQ+KTogUHJvbWlzZTxBd2FpdGVkPFQ+IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKGlzRHVyaW5nVG9vbENhbGwpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2RpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdFx0dHlwZTogJ3F1ZXN0aW9uJyxcblx0XHRcdFx0dGl0bGU6IHRpdGxlLFxuXHRcdFx0XHRtZXNzYWdlLFxuXHRcdFx0XHRidXR0b25zOiBPYmplY3QuZW50cmllcyhidXR0b25zKS5tYXAoKFtsYWJlbCwgcnVuXSkgPT4gKHsgbGFiZWwsIHJ1biB9KSksXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBhd2FpdCByZXN1bHQucmVzdWx0O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fbm90aWZ5KG1lc3NhZ2UsIGJ1dHRvbnMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX25vdGlmeTxUPihtZXNzYWdlOiBzdHJpbmcsIGJ1dHRvbnM6IFJlY29yZDxzdHJpbmcsICgpID0+IFQ+KTogUHJvbWlzZTxBd2FpdGVkPFQ+IHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIGF3YWl0IG5ldyBQcm9taXNlPFQgfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRcdE9iamVjdC5lbnRyaWVzKGJ1dHRvbnMpLm1hcCgoW2xhYmVsLCBhY3Rpb25dKSA9PiAoe1xuXHRcdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gcmVzb2x2ZShhY3Rpb24oKSksXG5cdFx0XHRcdH0pKVxuXHRcdFx0KTtcblx0XHRcdEV2ZW50Lm9uY2UoaGFuZGxlLm9uRGlkQ2xvc2UpKCgpID0+IHJlc29sdmUodW5kZWZpbmVkKSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgbWF0Y2hpbmcgbW9kZWwgZm9yIHRoZSBNQ1Agc2VydmVyIGluIHRoaXMgY29udGV4dCwgb3Jcblx0ICogYSByZWFzb24gd2h5IG5vIG1vZGVsIGNvdWxkIGJlIHNlbGVjdGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZ2V0TWF0Y2hpbmdNb2RlbElubmVyKHNlcnZlcjogSU1jcFNlcnZlciwgaXNEdXJpbmdUb29sQ2FsbDogYm9vbGVhbiwgcHJlZmVyZW5jZXM6IE1DUC5Nb2RlbFByZWZlcmVuY2VzIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxNb2RlbE1hdGNoIHwgc3RyaW5nPiB7XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5nZXRDb25maWcoc2VydmVyKTtcblx0XHQvLyAxLiBFbnN1cmUgdGhlIHNlcnZlciBpcyBhbGxvd2VkIHRvIHNhbXBsZSBpbiB0aGlzIGNvbnRleHRcblx0XHRpZiAoaXNEdXJpbmdUb29sQ2FsbCAmJiAhY29uZmlnLmFsbG93ZWREdXJpbmdDaGF0ICYmICF0aGlzLl9zZXNzaW9uU2V0cy5hbGxvd2VkRHVyaW5nQ2hhdC5oYXMoc2VydmVyLmRlZmluaXRpb24uaWQpKSB7XG5cdFx0XHRyZXR1cm4gY29uZmlnLmFsbG93ZWREdXJpbmdDaGF0ID09PSB1bmRlZmluZWQgPyBNb2RlbE1hdGNoLlVuc3VyZUFsbG93ZWREdXJpbmdDaGF0IDogTW9kZWxNYXRjaC5Ob3RBbGxvd2VkO1xuXHRcdH0gZWxzZSBpZiAoIWlzRHVyaW5nVG9vbENhbGwgJiYgIWNvbmZpZy5hbGxvd2VkT3V0c2lkZUNoYXQgJiYgIXRoaXMuX3Nlc3Npb25TZXRzLmFsbG93ZWRPdXRzaWRlQ2hhdC5oYXMoc2VydmVyLmRlZmluaXRpb24uaWQpKSB7XG5cdFx0XHRyZXR1cm4gY29uZmlnLmFsbG93ZWRPdXRzaWRlQ2hhdCA9PT0gdW5kZWZpbmVkID8gTW9kZWxNYXRjaC5VbnN1cmVBbGxvd2VkT3V0c2lkZUNoYXQgOiBNb2RlbE1hdGNoLk5vdEFsbG93ZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gMi4gR2V0IHRoZSBjb25maWd1cmVkIG1vZGVscywgb3IgdGhlIGRlZmF1bHQgZnJlZSBtb2RlbChzKVxuXHRcdGNvbnN0IGZvdW5kTW9kZWxJZHMgPSBjb25maWcuYWxsb3dlZE1vZGVscz8uZmlsdGVyKG0gPT4gISF0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChtKSkgfHwgdGhpcy5fZ2V0RGVmYXVsdE1vZGVscygpO1xuXHRcdGlmICghZm91bmRNb2RlbElkcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBNb2RlbE1hdGNoLk5vTWF0Y2hpbmdNb2RlbDtcblx0XHR9XG5cblx0XHQvLyAzLiBJZiBwcmVmZXJlbmNlcyBhcmUgcHJvdmlkZWQsIHRyeSB0byBtYXRjaCB0aGVtIGZyb20gdGhlIGFsbG93ZWQgbW9kZWxzXG5cdFx0aWYgKHByZWZlcmVuY2VzPy5oaW50cykge1xuXHRcdFx0Y29uc3QgZm91bmQgPSBtYXBGaW5kRmlyc3QocHJlZmVyZW5jZXMuaGludHMsIGhpbnQgPT4gZm91bmRNb2RlbElkcy5maW5kKG1vZGVsID0+IG1vZGVsLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoaGludC5uYW1lIS50b0xvd2VyQ2FzZSgpKSkpO1xuXHRcdFx0aWYgKGZvdW5kKSB7XG5cdFx0XHRcdHJldHVybiBmb3VuZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZm91bmRNb2RlbElkc1swXTsgLy8gUmV0dXJuIHRoZSBmaXJzdCBtYXRjaGluZyBtb2RlbFxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RGVmYXVsdE1vZGVscygpIHtcblx0XHRjb25zdCBjYW5kaWRhdGVzID0gdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmdldExhbmd1YWdlTW9kZWxJZHMoKS5tYXAobSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2xhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKG0pO1xuXHRcdFx0cmV0dXJuIG1vZGVsICYmICFtb2RlbC5tdWx0aXBsaWVyTnVtZXJpYyAmJiAhbW9kZWwudGFyZ2V0Q2hhdFNlc3Npb25UeXBlID8geyBtb2RlbCwgaWQ6IG0gfSA6IHVuZGVmaW5lZDtcblx0XHR9KS5maWx0ZXIoaXNEZWZpbmVkKTtcblxuXHRcdGNvbnN0IHNvbWVEZWZhdWx0ID0gY2FuZGlkYXRlcy5maW5kSW5kZXgoYyA9PiBPYmplY3QudmFsdWVzKGMubW9kZWwuaXNEZWZhdWx0Rm9yTG9jYXRpb24pLnNvbWUoQm9vbGVhbikpO1xuXHRcdGlmIChzb21lRGVmYXVsdCAhPT0gLTEpIHtcblx0XHRcdFtjYW5kaWRhdGVzWzBdLCBjYW5kaWRhdGVzW3NvbWVEZWZhdWx0XV0gPSBbY2FuZGlkYXRlc1tzb21lRGVmYXVsdF0sIGNhbmRpZGF0ZXNbMF1dO1xuXHRcdH1cblxuXHRcdHJldHVybiBjYW5kaWRhdGVzLm1hcChjID0+IGMuaWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29uZmlnS2V5KHNlcnZlcjogSU1jcFNlcnZlcikge1xuXHRcdHJldHVybiBgJHtzZXJ2ZXIuY29sbGVjdGlvbi5sYWJlbH06ICR7c2VydmVyLmRlZmluaXRpb24ubGFiZWx9YDtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb25maWcoc2VydmVyOiBJTWNwU2VydmVyKTogSU1jcFNlcnZlclNhbXBsaW5nQ29uZmlndXJhdGlvbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldENvbmZpZyhzZXJ2ZXIpLnZhbHVlIHx8IHt9O1xuXHR9XG5cblx0LyoqXG5cdCAqIF9nZXRDb25maWcgcmVhZHMgdGhlIHNhbXBsaW5nIGNvbmZpZyByZWFkcyB0aGUgYHsgc2VydmVyOiBkYXRhIH1gIG1hcHBpbmdcblx0ICogZnJvbSB0aGUgYXBwcm9wcmlhdGUgY29uZmlnLiBXZSByZWFkIGZyb20gdGhlIG1vc3Qgc3BlY2lmaWMgcG9zc2libGVcblx0ICogY29uZmlnIHVwIHRvIHRoZSBkZWZhdWx0IGNvbmZpZ3VyYXRpb24gbG9jYXRpb24gdGhhdCB0aGUgTUNQIHNlcnZlciBpdHNlbGZcblx0ICogaXMgZGVmaW5lZCBpbi4gV2UgZG9uJ3QgZ28gZnVydGhlciBiZWNhdXNlIHRoZW4gd29ya3NwYWNlLXNwZWNpZmljIHNlcnZlcnNcblx0ICogd291bGQgZ2V0IGluIHRoZSB1c2VyIHNldHRpbmdzIHdoaWNoIGlzIG5vdCBtZWFuaW5nZnVsIGFuZCBjb3VsZCBsZWFkXG5cdCAqIHRvIGNvbmZ1c2lvbi5cblx0ICpcblx0ICogdG9kb0Bjb25ub3I0MzEyOiBnZW5lcmFsaXplIHRoaXMgZm9yIG90aGVyIGVzdHRpbmdzIHdoZW4gd2UgaGF2ZSB0aGVtXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRDb25maWcoc2VydmVyOiBJTWNwU2VydmVyKSB7XG5cdFx0Y29uc3QgZGVmID0gc2VydmVyLnJlYWREZWZpbml0aW9ucygpLmdldCgpO1xuXHRcdGNvbnN0IG1vc3RTcGVjaWZpY0NvbmZpZyA9IENvbmZpZ3VyYXRpb25UYXJnZXQuTUVNT1JZO1xuXHRcdGNvbnN0IGxlYXN0U3BlY2lmaWNDb25maWcgPSBkZWYuY29sbGVjdGlvbj8uY29uZmlnVGFyZ2V0IHx8IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUjtcblx0XHRjb25zdCBrZXkgPSB0aGlzLl9jb25maWdLZXkoc2VydmVyKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IGRlZi5jb2xsZWN0aW9uPy5wcmVzZW50YXRpb24/Lm9yaWdpbjtcblxuXHRcdGNvbnN0IGNvbmZpZ1ZhbHVlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxSZWNvcmQ8c3RyaW5nLCBJTWNwU2VydmVyU2FtcGxpbmdDb25maWd1cmF0aW9uPj4obWNwU2VydmVyU2FtcGxpbmdTZWN0aW9uLCB7IHJlc291cmNlIH0pO1xuXHRcdGZvciAobGV0IHRhcmdldCA9IG1vc3RTcGVjaWZpY0NvbmZpZzsgdGFyZ2V0ID49IGxlYXN0U3BlY2lmaWNDb25maWc7IHRhcmdldC0tKSB7XG5cdFx0XHRjb25zdCBtYXBwaW5nID0gZ2V0Q29uZmlnVmFsdWVJblRhcmdldChjb25maWdWYWx1ZSwgdGFyZ2V0KTtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IG1hcHBpbmc/LltrZXldO1xuXHRcdFx0aWYgKGNvbmZpZykge1xuXHRcdFx0XHRyZXR1cm4geyB2YWx1ZTogY29uZmlnLCBrZXksIG1hcHBpbmcsIHRhcmdldCwgcmVzb3VyY2UgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyB2YWx1ZTogdW5kZWZpbmVkLCBtYXBwaW5nOiBnZXRDb25maWdWYWx1ZUluVGFyZ2V0KGNvbmZpZ1ZhbHVlLCBsZWFzdFNwZWNpZmljQ29uZmlnKSwga2V5LCB0YXJnZXQ6IGxlYXN0U3BlY2lmaWNDb25maWcsIHJlc291cmNlIH07XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgdXBkYXRlQ29uZmlnKHNlcnZlcjogSU1jcFNlcnZlciwgbXV0YXRlOiAocjogSU1jcFNlcnZlclNhbXBsaW5nQ29uZmlndXJhdGlvbikgPT4gdW5rbm93bikge1xuXHRcdGNvbnN0IHsgdmFsdWUsIG1hcHBpbmcsIGtleSwgdGFyZ2V0LCByZXNvdXJjZSB9ID0gdGhpcy5fZ2V0Q29uZmlnKHNlcnZlcik7XG5cblx0XHRjb25zdCBuZXdDb25maWcgPSB7IC4uLnZhbHVlIH07XG5cdFx0bXV0YXRlKG5ld0NvbmZpZyk7XG5cblx0XHRhd2FpdCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShcblx0XHRcdG1jcFNlcnZlclNhbXBsaW5nU2VjdGlvbixcblx0XHRcdHsgLi4ubWFwcGluZywgW2tleV06IG5ld0NvbmZpZyB9LFxuXHRcdFx0eyByZXNvdXJjZSB9LFxuXHRcdFx0dGFyZ2V0LFxuXHRcdCk7XG5cdFx0cmV0dXJuIG5ld0NvbmZpZztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUJBQXFCLHdCQUF3Qiw2QkFBNkI7QUFDbkYsU0FBUyxzQkFB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
