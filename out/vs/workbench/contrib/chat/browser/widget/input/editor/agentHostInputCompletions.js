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
import { DisposableMap } from "../../../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../../../base/common/network.js";
import { assertType } from "../../../../../../../base/common/types.js";
import { localize } from "../../../../../../../nls.js";
import { AgentHostCompletionReferenceKind, chatReferenceVariableEntryId, toAgentHostCompletionVariableEntry, toChatReferenceDynamicVariableValue } from "../../../../common/attachments/chatVariableEntries.js";
import { CompletionItemKind } from "../../../../../../../editor/common/languages.js";
import { ILanguageFeaturesService } from "../../../../../../../editor/common/services/languageFeatures.js";
import { CommandsRegistry } from "../../../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../../../../platform/dialogs/common/dialogs.js";
import { IStorageService } from "../../../../../../../platform/storage/common/storage.js";
import { IWorkspaceContextService } from "../../../../../../../platform/workspace/common/workspace.js";
import { IAgentHostService } from "../../../../../../../platform/agentHost/common/agentService.js";
import { getCompletionAction } from "../../../../../../../platform/agentHost/common/meta/agentCompletionAttachmentMeta.js";
import { Registry } from "../../../../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../../../../../common/contributions.js";
import { LifecyclePhase } from "../../../../../../services/lifecycle/common/lifecycle.js";
import { ChatDynamicVariableModel } from "../../../attachments/chatDynamicVariables.js";
import { IChatSessionsService, isAgentHostTarget } from "../../../../common/chatSessionsService.js";
import { getChatSessionType } from "../../../../common/model/chatUri.js";
import { IChatWidgetService } from "../../../chat.js";
import { applyAgentHostCompletionAction, isPolicyBlockedCompletionAction } from "../../../agentHostCompletionAction.js";
import { applyAgentHostSessionConfigChange } from "../../../agentSessions/agentHost/applyAgentHostSessionConfig.js";
import { IAgentHostSessionWorkingDirectoryResolver } from "../../../agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js";
import { IAgentHostUntitledProvisionalSessionService } from "../../../agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js";
import { AgentHostInputCompletionsBase } from "./agentHostInputCompletionsBase.js";
let AgentHostInputCompletions = class extends AgentHostInputCompletionsBase {
  constructor(languageFeaturesService, _chatWidgetService, chatSessionsService, _configurationService) {
    super(languageFeaturesService, chatSessionsService);
    this._chatWidgetService = _chatWidgetService;
    this._configurationService = _configurationService;
    /** Per-scheme registrations of the Monaco completion provider. */
    this._registrations = this._register(new DisposableMap());
    this._register(CommandsRegistry.registerCommand(AgentHostInputCompletions.addReferenceCommand, (_services, arg) => {
      assertType(arg instanceof AgentHostReferenceArgument);
      arg.widget.getContrib(ChatDynamicVariableModel.ID)?.addReference({
        id: arg.id,
        range: arg.range,
        isFile: arg.isFile,
        isDirectory: arg.isDirectory,
        fullName: arg.displayName,
        data: arg.data,
        _meta: arg._meta
      });
    }));
    this._register(CommandsRegistry.registerCommand(AgentHostInputCompletions.configActionCommand, async (accessor, arg) => {
      assertType(arg instanceof AgentHostConfigActionArgument);
      const sessionResource = arg.widget.viewModel?.model.sessionResource;
      if (!sessionResource) {
        return;
      }
      const dialogService = accessor.get(IDialogService);
      const storageService = accessor.get(IStorageService);
      const services = {
        agentHostService: accessor.get(IAgentHostService),
        provisionalService: accessor.get(IAgentHostUntitledProvisionalSessionService),
        workingDirectoryResolver: accessor.get(IAgentHostSessionWorkingDirectoryResolver),
        workspaceContextService: accessor.get(IWorkspaceContextService),
        configurationService: accessor.get(IConfigurationService)
      };
      const applied = await applyAgentHostCompletionAction(arg.action, dialogService, storageService, async (config) => {
        await applyAgentHostSessionConfigChange(sessionResource, config, services);
      });
      if (applied && arg.reference) {
        arg.widget.getContrib(ChatDynamicVariableModel.ID)?.addReference({
          id: arg.reference.id,
          range: arg.reference.range,
          isFile: arg.reference.isFile,
          isDirectory: arg.reference.isDirectory,
          fullName: arg.reference.displayName,
          data: arg.reference.data,
          _meta: arg.reference._meta
        });
      }
    }));
    for (const scheme of this._chatSessionsService.getContentProviderSchemes()) {
      void this._registerForScheme(scheme);
    }
    this._register(this._chatSessionsService.onDidChangeContentProviderSchemes(({ added, removed }) => {
      for (const scheme of removed) {
        this._registrations.deleteAndDispose(scheme);
      }
      for (const scheme of added) {
        void this._registerForScheme(scheme);
      }
    }));
  }
  async _registerForScheme(scheme) {
    if (!isAgentHostTarget(scheme)) {
      return;
    }
    const triggerCharacters = await this._chatSessionsService.getChatInputCompletionTriggerCharacters(scheme);
    if (!triggerCharacters || triggerCharacters.length === 0) {
      return;
    }
    if (!this._chatSessionsService.getContentProviderSchemes().includes(scheme)) {
      return;
    }
    this._registrations.set(scheme, this._registerProvider(
      { scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true },
      `agentHostChatInputCompletions[${scheme}]`,
      triggerCharacters,
      scheme
    ));
  }
  _resolveContext(model, scheme) {
    const widget = this._chatWidgetService.getWidgetByInputUri(model.uri);
    if (!widget?.viewModel) {
      return void 0;
    }
    const sessionResource = widget.viewModel.model.sessionResource;
    if (getChatSessionType(sessionResource) !== scheme) {
      return void 0;
    }
    return { sessionResource, context: widget };
  }
  _buildItem(position, item, widget) {
    const replaceRange = AgentHostInputCompletions.computeRange(position, item);
    const attachment = item.attachment;
    switch (attachment.kind) {
      case "command": {
        const action = getCompletionAction(attachment._meta);
        if (action) {
          if (isPolicyBlockedCompletionAction(action, this._configurationService)) {
            return void 0;
          }
          const keep = item.insertText !== "";
          const label = item.label ?? item.insertText;
          const reference = keep ? AgentHostReferenceArgument.forCommand(widget, attachment.command, attachment.description, AgentHostInputCompletions._insertedTokenRange(replaceRange, item.insertText), attachment._meta) : void 0;
          return {
            label: { label, description: attachment.description },
            insertText: item.insertText,
            filterText: label,
            range: replaceRange,
            kind: CompletionItemKind.Text,
            detail: attachment.description,
            command: {
              id: AgentHostInputCompletions.configActionCommand,
              title: "",
              arguments: [new AgentHostConfigActionArgument(widget, action, reference)]
            }
          };
        }
        return {
          label: { label: item.insertText, description: attachment.description },
          insertText: item.insertText,
          filterText: item.insertText,
          range: replaceRange,
          kind: CompletionItemKind.Text,
          detail: attachment.description,
          command: {
            id: AgentHostInputCompletions.addReferenceCommand,
            title: "",
            arguments: [AgentHostReferenceArgument.forCommand(widget, attachment.command, attachment.description, AgentHostInputCompletions._insertedTokenRange(replaceRange, item.insertText), attachment._meta)]
          }
        };
      }
      case "skill": {
        const label = attachment.displayName ? "/" + attachment.displayName : item.insertText.trimEnd();
        return {
          label: { label, description: attachment.description },
          insertText: item.insertText,
          filterText: item.insertText,
          range: replaceRange,
          kind: CompletionItemKind.Text,
          detail: attachment.description,
          command: {
            id: AgentHostInputCompletions.addReferenceCommand,
            title: "",
            arguments: [AgentHostReferenceArgument.forSkill(widget, attachment.uri, attachment.displayName, AgentHostInputCompletions._insertedTokenRange(replaceRange, item.insertText), attachment._meta)]
          }
        };
      }
      case "chat": {
        const label = attachment.displayName ?? attachment.title;
        return {
          label: { label, description: localize("chatReferenceDescription", "Chat") },
          insertText: item.insertText,
          filterText: item.insertText,
          range: replaceRange,
          kind: CompletionItemKind.Reference,
          command: {
            id: AgentHostInputCompletions.addReferenceCommand,
            title: "",
            arguments: [AgentHostReferenceArgument.forChat(widget, attachment.uri, attachment.endTurn, attachment.title, attachment.displayName, AgentHostInputCompletions._insertedTokenRange(replaceRange, item.insertText), attachment._meta)]
          }
        };
      }
      default: {
        const label = attachment.displayName ?? item.insertText;
        const description = attachment.uri.path;
        return {
          label: { label, description },
          insertText: item.insertText,
          filterText: item.insertText,
          range: replaceRange,
          kind: attachment.isDirectory ? CompletionItemKind.Folder : CompletionItemKind.File,
          command: {
            id: AgentHostInputCompletions.addReferenceCommand,
            title: "",
            arguments: [AgentHostReferenceArgument.forResource(widget, attachment.uri, attachment.displayName, !!attachment.isDirectory, AgentHostInputCompletions._insertedRange(replaceRange, item.insertText), attachment._meta)]
          }
        };
      }
    }
  }
  static _insertedRange(replaceRange, insertText) {
    return replaceRange.replace.setEndPosition(replaceRange.replace.startLineNumber, replaceRange.replace.startColumn + insertText.length);
  }
  static _insertedTokenRange(replaceRange, insertText) {
    return this._insertedRange(replaceRange, insertText.trimEnd());
  }
};
AgentHostInputCompletions.addReferenceCommand = "_chatAgentHostAddReferenceCmd";
AgentHostInputCompletions.configActionCommand = "_chatAgentHostConfigActionCmd";
AgentHostInputCompletions = __decorateClass([
  __decorateParam(0, ILanguageFeaturesService),
  __decorateParam(1, IChatWidgetService),
  __decorateParam(2, IChatSessionsService),
  __decorateParam(3, IConfigurationService)
], AgentHostInputCompletions);
class AgentHostReferenceArgument {
  constructor(widget, id, data, displayName, isFile, isDirectory, range, _meta) {
    this.widget = widget;
    this.id = id;
    this.data = data;
    this.displayName = displayName;
    this.isFile = isFile;
    this.isDirectory = isDirectory;
    this.range = range;
    this._meta = _meta;
  }
  static forResource(widget, uri, displayName, isDirectory, range, _meta) {
    return new AgentHostReferenceArgument(widget, uri.toString(), uri, displayName, !isDirectory, isDirectory, range, _meta);
  }
  static forSkill(widget, uri, displayName, range, _meta) {
    const entry = toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Skill, displayName ?? uri.toString(), uri, _meta);
    return new AgentHostReferenceArgument(widget, entry.id, entry.value, displayName, false, false, range, _meta);
  }
  static forCommand(widget, command, description, range, _meta) {
    const entry = toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Command, description ?? command, command, _meta);
    return new AgentHostReferenceArgument(widget, entry.id, entry.value, description, false, false, range, _meta);
  }
  static forChat(widget, uri, endTurn, title, displayName, range, _meta) {
    return new AgentHostReferenceArgument(widget, chatReferenceVariableEntryId(uri, endTurn), toChatReferenceDynamicVariableValue(uri, endTurn), displayName ?? title, false, false, range, _meta);
  }
}
class AgentHostConfigActionArgument {
  constructor(widget, action, reference) {
    this.widget = widget;
    this.action = action;
    this.reference = reference;
  }
}
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(AgentHostInputCompletions, LifecyclePhase.Eventually);
export {
  AgentHostInputCompletions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXGVkaXRvclxcYWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGVNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgYXNzZXJ0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZCwgY2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnlJZCwgdG9BZ2VudEhvc3RDb21wbGV0aW9uVmFyaWFibGVFbnRyeSwgdG9DaGF0UmVmZXJlbmNlRHluYW1pY1ZhcmlhYmxlVmFsdWUsIHR5cGUgSUFnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZVZhbHVlLCB0eXBlIElDaGF0UmVmZXJlbmNlRHluYW1pY1ZhcmlhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uSXRlbSwgQ29tcGxldGlvbkl0ZW1LaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldENvbXBsZXRpb25BY3Rpb24sIHR5cGUgSUFnZW50SG9zdENvbXBsZXRpb25BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL21ldGEvYWdlbnRDb21wbGV0aW9uQXR0YWNobWVudE1ldGEuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hFeHRlbnNpb25zLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9hdHRhY2htZW50cy9jaGF0RHluYW1pY1ZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdElucHV0Q29tcGxldGlvbkl0ZW0sIElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBpc0FnZW50SG9zdFRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IGFwcGx5QWdlbnRIb3N0Q29tcGxldGlvbkFjdGlvbiwgaXNQb2xpY3lCbG9ja2VkQ29tcGxldGlvbkFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2FnZW50SG9zdENvbXBsZXRpb25BY3Rpb24uanMnO1xuaW1wb3J0IHsgYXBwbHlBZ2VudEhvc3RTZXNzaW9uQ29uZmlnQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYXBwbHlBZ2VudEhvc3RTZXNzaW9uQ29uZmlnLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlc29sdmVyIH0gZnJvbSAnLi4vLi4vLi4vYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdElucHV0Q29tcGxldGlvbnNCYXNlIH0gZnJvbSAnLi9hZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zQmFzZS5qcyc7XG4vKipcbiAqIENvbXBsZXRpb24gcHJvdmlkZXIgdGhhdCBkZWxlZ2F0ZXMgYEBgLW1lbnRpb24gKGFuZCBvdGhlciBzZXJ2ZXItZGVmaW5lZClcbiAqIGNvbXBsZXRpb25zIHRvIHRoZSBhZ2VudCBob3N0IGZvciBBSFAtYmFja2VkIGNoYXQgc2Vzc2lvbnMuXG4gKlxuICogUmVnaXN0cmF0aW9ucyBhcmUgbWFkZSBkeW5hbWljYWxseSBwZXIgY29udGVudC1wcm92aWRlciBzY2hlbWUgc28gZWFjaFxuICogY29ubmVjdGlvbiBjYW4gYW5ub3VuY2UgaXRzIG93biB0cmlnZ2VyIGNoYXJhY3RlcnMgdmlhIHRoZSBwcm90b2NvbCdzXG4gKiBgSW5pdGlhbGl6ZVJlc3VsdC5jb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnNgLiBXaGVuIGEgY29udGVudCBwcm92aWRlclxuICogaXMgcmVnaXN0ZXJlZCwgd2UgYXNrIGl0IGZvciBpdHMgdHJpZ2dlciBjaGFycyBhbmQgcmVnaXN0ZXIgYSBNb25hY29cbiAqIGNvbXBsZXRpb24gcHJvdmlkZXIgc2NvcGVkIHRvIHRoYXQgc2NoZW1lOyB3aGVuIGl0IGlzIHVucmVnaXN0ZXJlZCB3ZVxuICogdGVhciB0aGUgcmVnaXN0cmF0aW9uIGRvd24uXG4gKlxuICogVGhlIHByb3ZpZGVyIHVzZXMgdGhlIHNhbWUgYF9hZGRSZWZlcmVuY2VDbWRgIHBhdHRlcm4gYXNcbiAqIGBCdWlsdGluRHluYW1pY0NvbXBsZXRpb25zYDogd2hlbiBhbiBpdGVtIGlzIGFjY2VwdGVkLCBhIGNvbW1hbmQgcnVuc1xuICogdGhhdCBhZGRzIGFuIHtAbGluayBJRHluYW1pY1ZhcmlhYmxlfSBlbnRyeSB0byB0aGUgd2lkZ2V0J3MgdmFyaWFibGVcbiAqIG1vZGVsIHNvIHRoZSByZXNvdXJjZSBiZWNvbWVzIHBhcnQgb2YgdGhlIG91dGdvaW5nIHVzZXIgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNsYXNzIEFnZW50SG9zdElucHV0Q29tcGxldGlvbnMgZXh0ZW5kcyBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zQmFzZTxJQ2hhdFdpZGdldCwgc3RyaW5nPiB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgYWRkUmVmZXJlbmNlQ29tbWFuZCA9ICdfY2hhdEFnZW50SG9zdEFkZFJlZmVyZW5jZUNtZCc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IGNvbmZpZ0FjdGlvbkNvbW1hbmQgPSAnX2NoYXRBZ2VudEhvc3RDb25maWdBY3Rpb25DbWQnO1xuXG5cdC8qKiBQZXItc2NoZW1lIHJlZ2lzdHJhdGlvbnMgb2YgdGhlIE1vbmFjbyBjb21wbGV0aW9uIHByb3ZpZGVyLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWdpc3RyYXRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nPigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKEFnZW50SG9zdElucHV0Q29tcGxldGlvbnMuYWRkUmVmZXJlbmNlQ29tbWFuZCwgKF9zZXJ2aWNlcywgYXJnKSA9PiB7XG5cdFx0XHRhc3NlcnRUeXBlKGFyZyBpbnN0YW5jZW9mIEFnZW50SG9zdFJlZmVyZW5jZUFyZ3VtZW50KTtcblx0XHRcdGFyZy53aWRnZXQuZ2V0Q29udHJpYjxDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWw+KENoYXREeW5hbWljVmFyaWFibGVNb2RlbC5JRCk/LmFkZFJlZmVyZW5jZSh7XG5cdFx0XHRcdGlkOiBhcmcuaWQsXG5cdFx0XHRcdHJhbmdlOiBhcmcucmFuZ2UsXG5cdFx0XHRcdGlzRmlsZTogYXJnLmlzRmlsZSxcblx0XHRcdFx0aXNEaXJlY3Rvcnk6IGFyZy5pc0RpcmVjdG9yeSxcblx0XHRcdFx0ZnVsbE5hbWU6IGFyZy5kaXNwbGF5TmFtZSxcblx0XHRcdFx0ZGF0YTogYXJnLmRhdGEsXG5cdFx0XHRcdF9tZXRhOiBhcmcuX21ldGEsXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHQvLyBBY2NlcHQgaGFuZGxlciBmb3IgY29uZmlnLWFjdGlvbiBjb21wbGV0aW9ucyAocGVybWlzc2lvbi9tb2RlIHRvZ2dsZXMpLlxuXHRcdC8vIEFwcGxpZXMgdGhlIHNlc3Npb24tY29uZmlnIGNoYW5nZSAod2l0aCB0aGUgZWxldmF0ZWQtcGVybWlzc2lvblxuXHRcdC8vIGNvbmZpcm1hdGlvbikgYW5kLCBmb3Iga2VlcC10ZXh0IGl0ZW1zLCBhZGRzIHRoZSBhcmd1bWVudC1oaW50XG5cdFx0Ly8gcmVmZXJlbmNlLiBUb2dnbGUgaXRlbXMgaW5zZXJ0IG5vdGhpbmcsIHNvIHRoZXJlIGlzIG5vIHRleHQgdG8gcmVtb3ZlLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKEFnZW50SG9zdElucHV0Q29tcGxldGlvbnMuY29uZmlnQWN0aW9uQ29tbWFuZCwgYXN5bmMgKGFjY2Vzc29yLCBhcmcpID0+IHtcblx0XHRcdGFzc2VydFR5cGUoYXJnIGluc3RhbmNlb2YgQWdlbnRIb3N0Q29uZmlnQWN0aW9uQXJndW1lbnQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gYXJnLndpZGdldC52aWV3TW9kZWw/Lm1vZGVsLnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdGlmICghc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHNlcnZpY2VzID0ge1xuXHRcdFx0XHRhZ2VudEhvc3RTZXJ2aWNlOiBhY2Nlc3Nvci5nZXQoSUFnZW50SG9zdFNlcnZpY2UpLFxuXHRcdFx0XHRwcm92aXNpb25hbFNlcnZpY2U6IGFjY2Vzc29yLmdldChJQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlKSxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeVJlc29sdmVyOiBhY2Nlc3Nvci5nZXQoSUFnZW50SG9zdFNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVzb2x2ZXIpLFxuXHRcdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBhcHBsaWVkID0gYXdhaXQgYXBwbHlBZ2VudEhvc3RDb21wbGV0aW9uQWN0aW9uKGFyZy5hY3Rpb24sIGRpYWxvZ1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBhc3luYyBjb25maWcgPT4geyBhd2FpdCBhcHBseUFnZW50SG9zdFNlc3Npb25Db25maWdDaGFuZ2Uoc2Vzc2lvblJlc291cmNlLCBjb25maWcsIHNlcnZpY2VzKTsgfSk7XG5cdFx0XHRpZiAoYXBwbGllZCAmJiBhcmcucmVmZXJlbmNlKSB7XG5cdFx0XHRcdGFyZy53aWRnZXQuZ2V0Q29udHJpYjxDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWw+KENoYXREeW5hbWljVmFyaWFibGVNb2RlbC5JRCk/LmFkZFJlZmVyZW5jZSh7XG5cdFx0XHRcdFx0aWQ6IGFyZy5yZWZlcmVuY2UuaWQsXG5cdFx0XHRcdFx0cmFuZ2U6IGFyZy5yZWZlcmVuY2UucmFuZ2UsXG5cdFx0XHRcdFx0aXNGaWxlOiBhcmcucmVmZXJlbmNlLmlzRmlsZSxcblx0XHRcdFx0XHRpc0RpcmVjdG9yeTogYXJnLnJlZmVyZW5jZS5pc0RpcmVjdG9yeSxcblx0XHRcdFx0XHRmdWxsTmFtZTogYXJnLnJlZmVyZW5jZS5kaXNwbGF5TmFtZSxcblx0XHRcdFx0XHRkYXRhOiBhcmcucmVmZXJlbmNlLmRhdGEsXG5cdFx0XHRcdFx0X21ldGE6IGFyZy5yZWZlcmVuY2UuX21ldGEsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFN5bmMgZXhpc3RpbmcgcmVnaXN0cmF0aW9ucyBhbmQgb2JzZXJ2ZSBjaGFuZ2VzLlxuXHRcdGZvciAoY29uc3Qgc2NoZW1lIG9mIHRoaXMuX2NoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q29udGVudFByb3ZpZGVyU2NoZW1lcygpKSB7XG5cdFx0XHR2b2lkIHRoaXMuX3JlZ2lzdGVyRm9yU2NoZW1lKHNjaGVtZSk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYXRTZXNzaW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VDb250ZW50UHJvdmlkZXJTY2hlbWVzKCh7IGFkZGVkLCByZW1vdmVkIH0pID0+IHtcblx0XHRcdGZvciAoY29uc3Qgc2NoZW1lIG9mIHJlbW92ZWQpIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5kZWxldGVBbmREaXNwb3NlKHNjaGVtZSk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHNjaGVtZSBvZiBhZGRlZCkge1xuXHRcdFx0XHR2b2lkIHRoaXMuX3JlZ2lzdGVyRm9yU2NoZW1lKHNjaGVtZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVnaXN0ZXJGb3JTY2hlbWUoc2NoZW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWlzQWdlbnRIb3N0VGFyZ2V0KHNjaGVtZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdHJpZ2dlckNoYXJhY3RlcnMgPSBhd2FpdCB0aGlzLl9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldENoYXRJbnB1dENvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVycyhzY2hlbWUpO1xuXHRcdGlmICghdHJpZ2dlckNoYXJhY3RlcnMgfHwgdHJpZ2dlckNoYXJhY3RlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIHByb3ZpZGVyIG1heSBoYXZlIGJlZW4gcmVtb3ZlZCB3aGlsZSB3ZSB3ZXJlIGF3YWl0aW5nIHRoZVxuXHRcdC8vIHRyaWdnZXIgY2hhcmFjdGVycy4gUmUtY2hlY2sgYmVmb3JlIHJlZ2lzdGVyaW5nLlxuXHRcdGlmICghdGhpcy5fY2hhdFNlc3Npb25zU2VydmljZS5nZXRDb250ZW50UHJvdmlkZXJTY2hlbWVzKCkuaW5jbHVkZXMoc2NoZW1lKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KHNjaGVtZSwgdGhpcy5fcmVnaXN0ZXJQcm92aWRlcihcblx0XHRcdHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZUNoYXRJbnB1dCwgaGFzQWNjZXNzVG9BbGxNb2RlbHM6IHRydWUgfSxcblx0XHRcdGBhZ2VudEhvc3RDaGF0SW5wdXRDb21wbGV0aW9uc1ske3NjaGVtZX1dYCxcblx0XHRcdHRyaWdnZXJDaGFyYWN0ZXJzLFxuXHRcdFx0c2NoZW1lLFxuXHRcdCkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9yZXNvbHZlQ29udGV4dChtb2RlbDogSVRleHRNb2RlbCwgc2NoZW1lOiBzdHJpbmcpOiB7IHNlc3Npb25SZXNvdXJjZTogVVJJOyBjb250ZXh0OiBJQ2hhdFdpZGdldCB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeUlucHV0VXJpKG1vZGVsLnVyaSk7XG5cdFx0aWYgKCF3aWRnZXQ/LnZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gd2lkZ2V0LnZpZXdNb2RlbC5tb2RlbC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0Ly8gT25seSByZXNwb25kIHdoZW4gdGhlIGFjdGl2ZSBzZXNzaW9uIGlzIGhhbmRsZWQgYnkgdGhlIHNhbWVcblx0XHQvLyBjb250ZW50IHByb3ZpZGVyIHRoYXQgcmVnaXN0ZXJlZCB0aGlzIE1vbmFjbyBwcm92aWRlci5cblx0XHQvLyBXaXRob3V0IHRoaXMgY2hlY2ssIHR3byBwcm92aWRlcnMgc2hhcmluZyB0cmlnZ2VyIGNoYXJhY3RlcnNcblx0XHQvLyAoZS5nLiBib3RoIHJlZ2lzdGVyIGBAYCkgd291bGQgYm90aCBmaXJlIGFuZCBwcm9kdWNlIGR1cGxpY2F0ZVxuXHRcdC8vIFJQQ3MgLyBzdWdnZXN0aW9ucy5cblx0XHRpZiAoZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkgIT09IHNjaGVtZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHsgc2Vzc2lvblJlc291cmNlLCBjb250ZXh0OiB3aWRnZXQgfTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfYnVpbGRJdGVtKHBvc2l0aW9uOiBQb3NpdGlvbiwgaXRlbTogSUNoYXRJbnB1dENvbXBsZXRpb25JdGVtLCB3aWRnZXQ6IElDaGF0V2lkZ2V0KTogQ29tcGxldGlvbkl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlcGxhY2VSYW5nZSA9IEFnZW50SG9zdElucHV0Q29tcGxldGlvbnMuY29tcHV0ZVJhbmdlKHBvc2l0aW9uLCBpdGVtKTtcblx0XHRjb25zdCBhdHRhY2htZW50ID0gaXRlbS5hdHRhY2htZW50O1xuXHRcdHN3aXRjaCAoYXR0YWNobWVudC5raW5kKSB7XG5cdFx0XHRjYXNlICdjb21tYW5kJzoge1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBnZXRDb21wbGV0aW9uQWN0aW9uKGF0dGFjaG1lbnQuX21ldGEpO1xuXHRcdFx0XHRpZiAoYWN0aW9uKSB7XG5cdFx0XHRcdFx0Ly8gT21pdCBhbiBlbGV2YXRlZCBhdXRvLWFwcHJvdmUgdG9nZ2xlIChBbGxvdyBhbGwgLyBBc3Npc3RlZClcblx0XHRcdFx0XHQvLyB3aGVuIGVudGVycHJpc2UgcG9saWN5IGRpc2FibGVzIGdsb2JhbCBhdXRvLWFwcHJvdmFsLCByYXRoZXJcblx0XHRcdFx0XHQvLyB0aGFuIG9mZmVyaW5nIGFuIGl0ZW0gdGhhdCB3b3VsZCB3YXJuIHRoZW4gY2xhbXAgdG8gRGVmYXVsdC5cblx0XHRcdFx0XHRpZiAoaXNQb2xpY3lCbG9ja2VkQ29tcGxldGlvbkFjdGlvbihhY3Rpb24sIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gQ29uZmlnLWFjdGlvbiBjb21wbGV0aW9uIChwZXJtaXNzaW9uL21vZGUgdG9nZ2xlKS4gS2VlcC10ZXh0XG5cdFx0XHRcdFx0Ly8gaXRlbXMgKG5vbi1lbXB0eSBpbnNlcnRUZXh0KSByZXRhaW4gdGhlIGAvY29tbWFuZCBgIHRleHQgYW5kXG5cdFx0XHRcdFx0Ly8gYWRkIHRoZSBhcmd1bWVudC1oaW50IHJlZmVyZW5jZTsgdG9nZ2xlIGl0ZW1zIGluc2VydCBub3RoaW5nLlxuXHRcdFx0XHRcdGNvbnN0IGtlZXAgPSBpdGVtLmluc2VydFRleHQgIT09ICcnO1xuXHRcdFx0XHRcdGNvbnN0IGxhYmVsID0gaXRlbS5sYWJlbCA/PyBpdGVtLmluc2VydFRleHQ7XG5cdFx0XHRcdFx0Y29uc3QgcmVmZXJlbmNlID0ga2VlcFxuXHRcdFx0XHRcdFx0PyBBZ2VudEhvc3RSZWZlcmVuY2VBcmd1bWVudC5mb3JDb21tYW5kKHdpZGdldCwgYXR0YWNobWVudC5jb21tYW5kLCBhdHRhY2htZW50LmRlc2NyaXB0aW9uLCBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zLl9pbnNlcnRlZFRva2VuUmFuZ2UocmVwbGFjZVJhbmdlLCBpdGVtLmluc2VydFRleHQpLCBhdHRhY2htZW50Ll9tZXRhKVxuXHRcdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGxhYmVsOiB7IGxhYmVsLCBkZXNjcmlwdGlvbjogYXR0YWNobWVudC5kZXNjcmlwdGlvbiB9LFxuXHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogaXRlbS5pbnNlcnRUZXh0LFxuXHRcdFx0XHRcdFx0ZmlsdGVyVGV4dDogbGFiZWwsXG5cdFx0XHRcdFx0XHRyYW5nZTogcmVwbGFjZVJhbmdlLFxuXHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsXG5cdFx0XHRcdFx0XHRkZXRhaWw6IGF0dGFjaG1lbnQuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRcdGlkOiBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zLmNvbmZpZ0FjdGlvbkNvbW1hbmQsXG5cdFx0XHRcdFx0XHRcdHRpdGxlOiAnJyxcblx0XHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbbmV3IEFnZW50SG9zdENvbmZpZ0FjdGlvbkFyZ3VtZW50KHdpZGdldCwgYWN0aW9uLCByZWZlcmVuY2UpXSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiBpdGVtLmluc2VydFRleHQsIGRlc2NyaXB0aW9uOiBhdHRhY2htZW50LmRlc2NyaXB0aW9uIH0sXG5cdFx0XHRcdFx0aW5zZXJ0VGV4dDogaXRlbS5pbnNlcnRUZXh0LFxuXHRcdFx0XHRcdGZpbHRlclRleHQ6IGl0ZW0uaW5zZXJ0VGV4dCxcblx0XHRcdFx0XHRyYW5nZTogcmVwbGFjZVJhbmdlLFxuXHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5UZXh0LFxuXHRcdFx0XHRcdGRldGFpbDogYXR0YWNobWVudC5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogQWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucy5hZGRSZWZlcmVuY2VDb21tYW5kLFxuXHRcdFx0XHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbQWdlbnRIb3N0UmVmZXJlbmNlQXJndW1lbnQuZm9yQ29tbWFuZCh3aWRnZXQsIGF0dGFjaG1lbnQuY29tbWFuZCwgYXR0YWNobWVudC5kZXNjcmlwdGlvbiwgQWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucy5faW5zZXJ0ZWRUb2tlblJhbmdlKHJlcGxhY2VSYW5nZSwgaXRlbS5pbnNlcnRUZXh0KSwgYXR0YWNobWVudC5fbWV0YSldLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdza2lsbCc6IHtcblx0XHRcdFx0Y29uc3QgbGFiZWwgPSBhdHRhY2htZW50LmRpc3BsYXlOYW1lID8gJy8nICsgYXR0YWNobWVudC5kaXNwbGF5TmFtZSA6IGl0ZW0uaW5zZXJ0VGV4dC50cmltRW5kKCk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWwsIGRlc2NyaXB0aW9uOiBhdHRhY2htZW50LmRlc2NyaXB0aW9uIH0sXG5cdFx0XHRcdFx0aW5zZXJ0VGV4dDogaXRlbS5pbnNlcnRUZXh0LFxuXHRcdFx0XHRcdGZpbHRlclRleHQ6IGl0ZW0uaW5zZXJ0VGV4dCxcblx0XHRcdFx0XHRyYW5nZTogcmVwbGFjZVJhbmdlLFxuXHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5UZXh0LFxuXHRcdFx0XHRcdGRldGFpbDogYXR0YWNobWVudC5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogQWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucy5hZGRSZWZlcmVuY2VDb21tYW5kLFxuXHRcdFx0XHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbQWdlbnRIb3N0UmVmZXJlbmNlQXJndW1lbnQuZm9yU2tpbGwod2lkZ2V0LCBhdHRhY2htZW50LnVyaSwgYXR0YWNobWVudC5kaXNwbGF5TmFtZSwgQWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucy5faW5zZXJ0ZWRUb2tlblJhbmdlKHJlcGxhY2VSYW5nZSwgaXRlbS5pbnNlcnRUZXh0KSwgYXR0YWNobWVudC5fbWV0YSldLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdjaGF0Jzoge1xuXHRcdFx0XHRjb25zdCBsYWJlbCA9IGF0dGFjaG1lbnQuZGlzcGxheU5hbWUgPz8gYXR0YWNobWVudC50aXRsZTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRsYWJlbDogeyBsYWJlbCwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0UmVmZXJlbmNlRGVzY3JpcHRpb24nLCBcIkNoYXRcIikgfSxcblx0XHRcdFx0XHRpbnNlcnRUZXh0OiBpdGVtLmluc2VydFRleHQsXG5cdFx0XHRcdFx0ZmlsdGVyVGV4dDogaXRlbS5pbnNlcnRUZXh0LFxuXHRcdFx0XHRcdHJhbmdlOiByZXBsYWNlUmFuZ2UsXG5cdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlJlZmVyZW5jZSxcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogQWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucy5hZGRSZWZlcmVuY2VDb21tYW5kLFxuXHRcdFx0XHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbQWdlbnRIb3N0UmVmZXJlbmNlQXJndW1lbnQuZm9yQ2hhdCh3aWRnZXQsIGF0dGFjaG1lbnQudXJpLCBhdHRhY2htZW50LmVuZFR1cm4sIGF0dGFjaG1lbnQudGl0bGUsIGF0dGFjaG1lbnQuZGlzcGxheU5hbWUsIEFnZW50SG9zdElucHV0Q29tcGxldGlvbnMuX2luc2VydGVkVG9rZW5SYW5nZShyZXBsYWNlUmFuZ2UsIGl0ZW0uaW5zZXJ0VGV4dCksIGF0dGFjaG1lbnQuX21ldGEpXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRjb25zdCBsYWJlbCA9IGF0dGFjaG1lbnQuZGlzcGxheU5hbWUgPz8gaXRlbS5pbnNlcnRUZXh0O1xuXHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGF0dGFjaG1lbnQudXJpLnBhdGg7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWwsIGRlc2NyaXB0aW9uIH0sXG5cdFx0XHRcdFx0aW5zZXJ0VGV4dDogaXRlbS5pbnNlcnRUZXh0LFxuXHRcdFx0XHRcdGZpbHRlclRleHQ6IGl0ZW0uaW5zZXJ0VGV4dCxcblx0XHRcdFx0XHRyYW5nZTogcmVwbGFjZVJhbmdlLFxuXHRcdFx0XHRcdGtpbmQ6IGF0dGFjaG1lbnQuaXNEaXJlY3RvcnkgPyBDb21wbGV0aW9uSXRlbUtpbmQuRm9sZGVyIDogQ29tcGxldGlvbkl0ZW1LaW5kLkZpbGUsXG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IEFnZW50SG9zdElucHV0Q29tcGxldGlvbnMuYWRkUmVmZXJlbmNlQ29tbWFuZCxcblx0XHRcdFx0XHRcdHRpdGxlOiAnJyxcblx0XHRcdFx0XHRcdGFyZ3VtZW50czogW0FnZW50SG9zdFJlZmVyZW5jZUFyZ3VtZW50LmZvclJlc291cmNlKHdpZGdldCwgYXR0YWNobWVudC51cmksIGF0dGFjaG1lbnQuZGlzcGxheU5hbWUsICEhYXR0YWNobWVudC5pc0RpcmVjdG9yeSwgQWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucy5faW5zZXJ0ZWRSYW5nZShyZXBsYWNlUmFuZ2UsIGl0ZW0uaW5zZXJ0VGV4dCksIGF0dGFjaG1lbnQuX21ldGEpXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9pbnNlcnRlZFJhbmdlKHJlcGxhY2VSYW5nZTogeyByZXBsYWNlOiBSYW5nZSB9LCBpbnNlcnRUZXh0OiBzdHJpbmcpOiBSYW5nZSB7XG5cdFx0cmV0dXJuIHJlcGxhY2VSYW5nZS5yZXBsYWNlLnNldEVuZFBvc2l0aW9uKHJlcGxhY2VSYW5nZS5yZXBsYWNlLnN0YXJ0TGluZU51bWJlciwgcmVwbGFjZVJhbmdlLnJlcGxhY2Uuc3RhcnRDb2x1bW4gKyBpbnNlcnRUZXh0Lmxlbmd0aCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaW5zZXJ0ZWRUb2tlblJhbmdlKHJlcGxhY2VSYW5nZTogeyByZXBsYWNlOiBSYW5nZSB9LCBpbnNlcnRUZXh0OiBzdHJpbmcpOiBSYW5nZSB7XG5cdFx0cmV0dXJuIHRoaXMuX2luc2VydGVkUmFuZ2UocmVwbGFjZVJhbmdlLCBpbnNlcnRUZXh0LnRyaW1FbmQoKSk7XG5cdH1cbn1cblxuY2xhc3MgQWdlbnRIb3N0UmVmZXJlbmNlQXJndW1lbnQge1xuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHdpZGdldDogSUNoYXRXaWRnZXQsXG5cdFx0cmVhZG9ubHkgaWQ6IHN0cmluZyxcblx0XHRyZWFkb25seSBkYXRhOiBVUkkgfCBJQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlVmFsdWUgfCBJQ2hhdFJlZmVyZW5jZUR5bmFtaWNWYXJpYWJsZVZhbHVlLFxuXHRcdHJlYWRvbmx5IGRpc3BsYXlOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cmVhZG9ubHkgaXNGaWxlOiBib29sZWFuLFxuXHRcdHJlYWRvbmx5IGlzRGlyZWN0b3J5OiBib29sZWFuLFxuXHRcdHJlYWRvbmx5IHJhbmdlOiBSYW5nZSxcblx0XHRyZWFkb25seSBfbWV0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQsXG5cdCkgeyB9XG5cblx0c3RhdGljIGZvclJlc291cmNlKHdpZGdldDogSUNoYXRXaWRnZXQsIHVyaTogVVJJLCBkaXNwbGF5TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBpc0RpcmVjdG9yeTogYm9vbGVhbiwgcmFuZ2U6IFJhbmdlLCBfbWV0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBBZ2VudEhvc3RSZWZlcmVuY2VBcmd1bWVudCB7XG5cdFx0cmV0dXJuIG5ldyBBZ2VudEhvc3RSZWZlcmVuY2VBcmd1bWVudCh3aWRnZXQsIHVyaS50b1N0cmluZygpLCB1cmksIGRpc3BsYXlOYW1lLCAhaXNEaXJlY3RvcnksIGlzRGlyZWN0b3J5LCByYW5nZSwgX21ldGEpO1xuXHR9XG5cblx0c3RhdGljIGZvclNraWxsKHdpZGdldDogSUNoYXRXaWRnZXQsIHVyaTogVVJJLCBkaXNwbGF5TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCByYW5nZTogUmFuZ2UsIF9tZXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IEFnZW50SG9zdFJlZmVyZW5jZUFyZ3VtZW50IHtcblx0XHRjb25zdCBlbnRyeSA9IHRvQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlRW50cnkoQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQuU2tpbGwsIGRpc3BsYXlOYW1lID8/IHVyaS50b1N0cmluZygpLCB1cmksIF9tZXRhKTtcblx0XHRyZXR1cm4gbmV3IEFnZW50SG9zdFJlZmVyZW5jZUFyZ3VtZW50KHdpZGdldCwgZW50cnkuaWQsIGVudHJ5LnZhbHVlLCBkaXNwbGF5TmFtZSwgZmFsc2UsIGZhbHNlLCByYW5nZSwgX21ldGEpO1xuXHR9XG5cblx0c3RhdGljIGZvckNvbW1hbmQod2lkZ2V0OiBJQ2hhdFdpZGdldCwgY29tbWFuZDogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLCByYW5nZTogUmFuZ2UsIF9tZXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IEFnZW50SG9zdFJlZmVyZW5jZUFyZ3VtZW50IHtcblx0XHRjb25zdCBlbnRyeSA9IHRvQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlRW50cnkoQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQuQ29tbWFuZCwgZGVzY3JpcHRpb24gPz8gY29tbWFuZCwgY29tbWFuZCwgX21ldGEpO1xuXHRcdHJldHVybiBuZXcgQWdlbnRIb3N0UmVmZXJlbmNlQXJndW1lbnQod2lkZ2V0LCBlbnRyeS5pZCwgZW50cnkudmFsdWUsIGRlc2NyaXB0aW9uLCBmYWxzZSwgZmFsc2UsIHJhbmdlLCBfbWV0YSk7XG5cdH1cblxuXHRzdGF0aWMgZm9yQ2hhdCh3aWRnZXQ6IElDaGF0V2lkZ2V0LCB1cmk6IFVSSSwgZW5kVHVybjogc3RyaW5nIHwgdW5kZWZpbmVkLCB0aXRsZTogc3RyaW5nLCBkaXNwbGF5TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCByYW5nZTogUmFuZ2UsIF9tZXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IEFnZW50SG9zdFJlZmVyZW5jZUFyZ3VtZW50IHtcblx0XHQvLyBUaGUgcmVmZXJlbmNlZCBjaGF0IHJlc291cmNlIGFuZCBgZW5kVHVybmAgcmlkZSB0aHJvdWdoIHRoZSBkeW5hbWljXG5cdFx0Ly8gdmFyaWFibGUncyBgZGF0YWAgY2hhbm5lbCAobm90IGFuIG91dC1vZi1iYW5kIGBfbWV0YWAgYmFnKSwgc28gdGhlXG5cdFx0Ly8gcmVxdWVzdCBwYXJzZXIgY2FuIHJlYnVpbGQgdGhlIGZpcnN0LWNsYXNzIGBjaGF0UmVmZXJlbmNlYCBlbnRyeSB2aWFcblx0XHQvLyBgQ2hhdFJlcXVlc3REeW5hbWljVmFyaWFibGVQYXJ0LnRvVmFyaWFibGVFbnRyeSgpYC4gVGhlIHN0YWJsZSBpZFxuXHRcdC8vIGRlZHVwZXMgcmUtYWNjZXB0aW5nIHRoZSBzYW1lIHJlZmVyZW5jZS5cblx0XHRyZXR1cm4gbmV3IEFnZW50SG9zdFJlZmVyZW5jZUFyZ3VtZW50KHdpZGdldCwgY2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnlJZCh1cmksIGVuZFR1cm4pLCB0b0NoYXRSZWZlcmVuY2VEeW5hbWljVmFyaWFibGVWYWx1ZSh1cmksIGVuZFR1cm4pLCBkaXNwbGF5TmFtZSA/PyB0aXRsZSwgZmFsc2UsIGZhbHNlLCByYW5nZSwgX21ldGEpO1xuXHR9XG59XG5cbi8qKlxuICogQXJndW1lbnQgcGFzc2VkIHRvIHRoZSBjb25maWctYWN0aW9uIGFjY2VwdCBjb21tYW5kLiBDYXJyaWVzIHRoZSB0YXJnZXRcbiAqIHdpZGdldCwgdGhlIHtAbGluayBJQWdlbnRIb3N0Q29tcGxldGlvbkFjdGlvbn0gdG8gYXBwbHksIGFuZCBcdTIwMTQgZm9yIGtlZXAtdGV4dFxuICogaXRlbXMgXHUyMDE0IHRoZSBhcmd1bWVudC1oaW50IHJlZmVyZW5jZSB0byBhZGQgb25jZSBhcHBsaWVkLiBUb2dnbGUgaXRlbXMgaW5zZXJ0XG4gKiBub3RoaW5nLCBzbyBubyB0ZXh0IG5lZWRzIHRvIGJlIHJlbW92ZWQuXG4gKi9cbmNsYXNzIEFnZW50SG9zdENvbmZpZ0FjdGlvbkFyZ3VtZW50IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgd2lkZ2V0OiBJQ2hhdFdpZGdldCxcblx0XHRyZWFkb25seSBhY3Rpb246IElBZ2VudEhvc3RDb21wbGV0aW9uQWN0aW9uLFxuXHRcdHJlYWRvbmx5IHJlZmVyZW5jZTogQWdlbnRIb3N0UmVmZXJlbmNlQXJndW1lbnQgfCB1bmRlZmluZWQsXG5cdCkgeyB9XG59XG5cblJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zLCBMaWZlY3ljbGVQaGFzZS5FdmVudHVhbGx5KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsa0NBQWtDLDhCQUE4QixvQ0FBb0MsMkNBQTRIO0FBR3pPLFNBQXlCLDBCQUEwQjtBQUVuRCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUE0RDtBQUNyRSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGNBQWMsMkJBQTREO0FBQ25GLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQW1DLHNCQUFzQix5QkFBeUI7QUFDbEYsU0FBUywwQkFBMEI7QUFDbkMsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsZ0NBQWdDLHVDQUF1QztBQUNoRixTQUFTLHlDQUF5QztBQUNsRCxTQUFTLGlEQUFpRDtBQUMxRCxTQUFTLG1EQUFtRDtBQUM1RCxTQUFTLHFDQUFxQztBQWlCdkMsSUFBTSw0QkFBTixjQUF3Qyw4QkFBbUQ7QUFBQSxFQVFqRyxZQUMyQix5QkFDVyxvQkFDZixxQkFDa0IsdUJBQ3ZDO0FBQ0QsVUFBTSx5QkFBeUIsbUJBQW1CO0FBSmI7QUFFRztBQU56QztBQUFBLFNBQWlCLGlCQUFpQixLQUFLLFVBQVUsSUFBSSxjQUFzQixDQUFDO0FBVTNFLFNBQUssVUFBVSxpQkFBaUIsZ0JBQWdCLDBCQUEwQixxQkFBcUIsQ0FBQyxXQUFXLFFBQVE7QUFDbEgsaUJBQVcsZUFBZSwwQkFB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O0FBOU5hLDBCQUVZLHNCQUFzQjtBQUZsQywwQkFHWSxzQkFBc0I7QUFIbEMsNEJBQU47QUFBQSxFQVNKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FaVTtBQWdPYixNQUFNLDJCQUEyQjtBQUFBLEVBQ3hCLFlBQ0UsUUFDQSxJQUNBLE1BQ0EsYUFDQSxRQUNBLGFBQ0EsT0FDQSxPQUNSO0FBUlE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBLEVBQ047QUFBQSxFQUVKLE9BQU8sWUFBWSxRQUFxQixLQUFVLGFBQWlDLGFBQXNCLE9BQWMsT0FBd0U7QUFDOUwsV0FBTyxJQUFJLDJCQUEyQixRQUFRLElBQUksU0FBUyxHQUFHLEtBQUssYUFBYSxDQUFDLGFBQWEsYUFBYSxPQUFPLEtBQUs7QUFBQSxFQUN4SDtBQUFBLEVBRUEsT0FBTyxTQUFTLFFBQXFCLEtBQVUsYUFBaUMsT0FBYyxPQUF3RTtBQUNySyxVQUFNLFFBQVEsbUNBQW1DLGlDQUFpQyxPQUFPLGVBQWUsSUFBSSxTQUFTLEdBQUcsS0FBSyxLQUFLO0FBQ2xJLFdBQU8sSUFBSSwyQkFBMkIsUUFBUSxNQUFNLElBQUksTUFBTSxPQUFPLGFBQWEsT0FBTyxPQUFPLE9BQU8sS0FBSztBQUFBLEVBQzdHO0FBQUEsRUFFQSxPQUFPLFdBQVcsUUFBcUIsU0FBaUIsYUFBaUMsT0FBYyxPQUF3RTtBQUM5SyxVQUFNLFFBQVEsbUNBQW1DLGlDQUFpQyxTQUFTLGVBQWUsU0FBUyxTQUFTLEtBQUs7QUFDakksV0FBTyxJQUFJLDJCQUEyQixRQUFRLE1BQU0sSUFBSSxNQUFNLE9BQU8sYUFBYSxPQUFPLE9BQU8sT0FBTyxLQUFLO0FBQUEsRUFDN0c7QUFBQSxFQUVBLE9BQU8sUUFBUSxRQUFxQixLQUFVLFNBQTZCLE9BQWUsYUFBaUMsT0FBYyxPQUF3RTtBQU1oTixXQUFPLElBQUksMkJBQTJCLFFBQVEsNkJBQTZCLEtBQUssT0FBTyxHQUFHLG9DQUFvQyxLQUFLLE9BQU8sR0FBRyxlQUFlLE9BQU8sT0FBTyxPQUFPLE9BQU8sS0FBSztBQUFBLEVBQzlMO0FBQ0Q7QUFRQSxNQUFNLDhCQUE4QjtBQUFBLEVBQ25DLFlBQ1UsUUFDQSxRQUNBLFdBQ1I7QUFIUTtBQUNBO0FBQ0E7QUFBQSxFQUNOO0FBQ0w7QUFFQSxTQUFTLEdBQW9DLG9CQUFvQixTQUFTLEVBQUUsOEJBQThCLDJCQUEyQixlQUFlLFVBQVU7IiwKICAibmFtZXMiOiBbXQp9Cg==
