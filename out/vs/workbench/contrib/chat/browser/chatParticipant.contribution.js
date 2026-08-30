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
import { coalesce, isNonEmptyArray } from "../../../../base/common/arrays.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { Event } from "../../../../base/common/event.js";
import { createCommandUri, MarkdownString } from "../../../../base/common/htmlContent.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableMap, DisposableStore } from "../../../../base/common/lifecycle.js";
import * as strings from "../../../../base/common/strings.js";
import { localize, localize2 } from "../../../../nls.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { ViewPaneContainer } from "../../../browser/parts/views/viewPaneContainer.js";
import { ViewContainerLocation, Extensions as ViewExtensions } from "../../../common/views.js";
import { Extensions } from "../../../services/extensionManagement/common/extensionFeatures.js";
import { isProposedApiEnabled } from "../../../services/extensions/common/extensions.js";
import * as extensionsRegistry from "../../../services/extensions/common/extensionsRegistry.js";
import { showExtensionsWithIdsCommandId } from "../../extensions/browser/extensionsActions.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { IChatAgentService } from "../common/participants/chatAgents.js";
import { ChatContextKeys } from "../common/actions/chatContextKeys.js";
import { ChatAgentLocation, ChatModeKind } from "../common/constants.js";
import { ChatViewId, ChatViewContainerId } from "./chat.js";
import { ChatViewPane } from "./widgetHosts/viewPane/chatViewPane.js";
const chatViewIcon = registerIcon("chat-view-icon", Codicon.openai, localize("chatViewIcon", "View icon of the Codex view."));
const chatViewContainer = Registry.as(ViewExtensions.ViewContainersRegistry).registerViewContainer({
  id: ChatViewContainerId,
  title: localize2("chat.viewContainer.label", "Codex"),
  icon: chatViewIcon,
  ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [ChatViewContainerId, { mergeViewWithContainerWhenSingleView: true }]),
  storageId: ChatViewContainerId,
  hideIfEmpty: true,
  order: 1
}, ViewContainerLocation.AuxiliaryBar, { isDefault: true, doNotRegisterOpenCommand: true });
const chatViewDescriptor = {
  id: ChatViewId,
  containerIcon: chatViewContainer.icon,
  containerTitle: chatViewContainer.title.value,
  singleViewPaneContainerTitle: chatViewContainer.title.value,
  name: localize2("chat.viewContainer.label", "Codex"),
  canToggleVisibility: false,
  canMoveView: true,
  openCommandActionDescriptor: {
    id: ChatViewContainerId,
    title: chatViewContainer.title,
    mnemonicTitle: localize({ key: "miToggleChat", comment: ["&& denotes a mnemonic"] }, "&&Codex"),
    keybindings: {
      primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyI,
      mac: {
        primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KeyI
      }
    },
    order: 1
  },
  ctorDescriptor: new SyncDescriptor(ChatViewPane),
  when: ContextKeyExpr.and(
    ChatContextKeys.accountPolicyGateActive.negate(),
    ContextKeyExpr.or(
      ContextKeyExpr.and(
        ChatContextKeys.Setup.hidden.negate(),
        ChatContextKeys.Setup.disabledInWorkspace.negate()
      ),
      ChatContextKeys.panelParticipantRegistered,
      ChatContextKeys.extensionInvalid
    )
  )
};
Registry.as(ViewExtensions.ViewsRegistry).registerViews([chatViewDescriptor], chatViewContainer);
const chatParticipantExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "chatParticipants",
  jsonSchema: {
    description: localize("vscode.extension.contributes.chatParticipant", "Contributes a chat participant"),
    type: "array",
    items: {
      additionalProperties: false,
      type: "object",
      defaultSnippets: [{ body: { name: "", description: "" } }],
      required: ["name", "id"],
      properties: {
        id: {
          description: localize("chatParticipantId", "A unique id for this chat participant."),
          type: "string"
        },
        name: {
          description: localize("chatParticipantName", "User-facing name for this chat participant. The user will use '@' with this name to invoke the participant. Name must not contain whitespace."),
          type: "string",
          pattern: "^[\\w-]+$"
        },
        fullName: {
          markdownDescription: localize("chatParticipantFullName", "The full name of this chat participant, which is shown as the label for responses coming from this participant. If not provided, {0} is used.", "`name`"),
          type: "string"
        },
        description: {
          description: localize("chatParticipantDescription", "A description of this chat participant, shown in the UI."),
          type: "string"
        },
        isSticky: {
          description: localize("chatCommandSticky", "Whether invoking the command puts the chat into a persistent mode, where the command is automatically added to the chat input for the next message."),
          type: "boolean"
        },
        sampleRequest: {
          description: localize("chatSampleRequest", "When the user clicks this participant in `/help`, this text will be submitted to the participant."),
          type: "string"
        },
        when: {
          description: localize("chatParticipantWhen", "A condition which must be true to enable this participant."),
          type: "string"
        },
        disambiguation: {
          description: localize("chatParticipantDisambiguation", "Metadata to help with automatically routing user questions to this chat participant."),
          type: "array",
          items: {
            additionalProperties: false,
            type: "object",
            defaultSnippets: [{ body: { category: "", description: "", examples: [] } }],
            required: ["category", "description", "examples"],
            properties: {
              category: {
                markdownDescription: localize("chatParticipantDisambiguationCategory", "A detailed name for this category, e.g. `workspace_questions` or `web_questions`."),
                type: "string"
              },
              description: {
                description: localize("chatParticipantDisambiguationDescription", "A detailed description of the kinds of questions that are suitable for this chat participant."),
                type: "string"
              },
              examples: {
                description: localize("chatParticipantDisambiguationExamples", "A list of representative example questions that are suitable for this chat participant."),
                type: "array"
              }
            }
          }
        },
        commands: {
          markdownDescription: localize("chatCommandsDescription", "Commands available for this chat participant, which the user can invoke with a `/`."),
          type: "array",
          items: {
            additionalProperties: false,
            type: "object",
            defaultSnippets: [{ body: { name: "", description: "" } }],
            required: ["name"],
            properties: {
              name: {
                description: localize("chatCommand", "A short name by which this command is referred to in the UI, e.g. `fix` or `explain` for commands that fix an issue or explain code. The name should be unique among the commands provided by this participant."),
                type: "string"
              },
              description: {
                description: localize("chatCommandDescription", "A description of this command."),
                type: "string"
              },
              when: {
                description: localize("chatCommandWhen", "A condition which must be true to enable this command."),
                type: "string"
              },
              sampleRequest: {
                description: localize("chatCommandSampleRequest", "When the user clicks this command in `/help`, this text will be submitted to the participant."),
                type: "string"
              },
              isSticky: {
                description: localize("chatCommandSticky", "Whether invoking the command puts the chat into a persistent mode, where the command is automatically added to the chat input for the next message."),
                type: "boolean"
              },
              disambiguation: {
                description: localize("chatCommandDisambiguation", "Metadata to help with automatically routing user questions to this chat command."),
                type: "array",
                items: {
                  additionalProperties: false,
                  type: "object",
                  defaultSnippets: [{ body: { category: "", description: "", examples: [] } }],
                  required: ["category", "description", "examples"],
                  properties: {
                    category: {
                      markdownDescription: localize("chatCommandDisambiguationCategory", "A detailed name for this category, e.g. `workspace_questions` or `web_questions`."),
                      type: "string"
                    },
                    description: {
                      description: localize("chatCommandDisambiguationDescription", "A detailed description of the kinds of questions that are suitable for this chat command."),
                      type: "string"
                    },
                    examples: {
                      description: localize("chatCommandDisambiguationExamples", "A list of representative example questions that are suitable for this chat command."),
                      type: "array"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  activationEventsGenerator: function* (contributions) {
    for (const contrib of contributions) {
      yield `onChatParticipant:${contrib.id}`;
    }
  }
});
let ChatExtensionPointHandler = class {
  constructor(_chatAgentService) {
    this._chatAgentService = _chatAgentService;
    this._participantRegistrationDisposables = new DisposableMap();
    this.handleAndRegisterChatExtensions();
  }
  handleAndRegisterChatExtensions() {
    chatParticipantExtensionPoint.setHandler((extensions, delta) => {
      for (const extension of delta.added) {
        for (const providerDescriptor of extension.value) {
          if (!providerDescriptor.name?.match(/^[\w-]+$/)) {
            extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register participant with invalid name: ${providerDescriptor.name}. Name must match /^[\\w-]+$/.`);
            continue;
          }
          if (providerDescriptor.fullName && strings.AmbiguousCharacters.getInstance(/* @__PURE__ */ new Set()).containsAmbiguousCharacter(providerDescriptor.fullName)) {
            extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register participant with fullName that contains ambiguous characters: ${providerDescriptor.fullName}.`);
            continue;
          }
          if (providerDescriptor.fullName && strings.InvisibleCharacters.containsInvisibleCharacter(providerDescriptor.fullName.replace(/ /g, ""))) {
            extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register participant with fullName that contains invisible characters: ${providerDescriptor.fullName}.`);
            continue;
          }
          if ((providerDescriptor.isDefault || providerDescriptor.modes) && !isProposedApiEnabled(extension.description, "defaultChatParticipant")) {
            extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT use API proposal: defaultChatParticipant.`);
            continue;
          }
          if (providerDescriptor.locations && !isProposedApiEnabled(extension.description, "chatParticipantAdditions")) {
            extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT use API proposal: chatParticipantAdditions.`);
            continue;
          }
          if (!providerDescriptor.id || !providerDescriptor.name) {
            extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register participant without both id and name.`);
            continue;
          }
          const participantsDisambiguation = [];
          if (providerDescriptor.disambiguation?.length) {
            participantsDisambiguation.push(...providerDescriptor.disambiguation.map((d) => ({
              ...d,
              category: d.category ?? d.categoryName
            })));
          }
          try {
            const store = new DisposableStore();
            store.add(this._chatAgentService.registerAgent(
              providerDescriptor.id,
              {
                extensionId: extension.description.identifier,
                extensionVersion: extension.description.version,
                publisherDisplayName: extension.description.publisherDisplayName ?? extension.description.publisher,
                // May not be present in OSS
                extensionPublisherId: extension.description.publisher,
                extensionDisplayName: extension.description.displayName ?? extension.description.name,
                id: providerDescriptor.id,
                description: providerDescriptor.description,
                when: providerDescriptor.when,
                metadata: {
                  isSticky: providerDescriptor.isSticky,
                  sampleRequest: providerDescriptor.sampleRequest
                },
                name: providerDescriptor.name,
                fullName: providerDescriptor.fullName,
                isDefault: providerDescriptor.isDefault,
                locations: isNonEmptyArray(providerDescriptor.locations) ? providerDescriptor.locations.map(ChatAgentLocation.fromRaw) : [ChatAgentLocation.Chat],
                modes: providerDescriptor.isDefault ? providerDescriptor.modes ?? [ChatModeKind.Ask] : [ChatModeKind.Agent, ChatModeKind.Ask, ChatModeKind.Edit],
                slashCommands: providerDescriptor.commands ?? [],
                disambiguation: coalesce(participantsDisambiguation.flat())
              }
            ));
            this._participantRegistrationDisposables.set(
              getParticipantKey(extension.description.identifier, providerDescriptor.id),
              store
            );
          } catch (e) {
            extension.collector.error(`Failed to register participant ${providerDescriptor.id}: ${toErrorMessage(e, true)}`);
          }
        }
      }
      for (const extension of delta.removed) {
        for (const providerDescriptor of extension.value) {
          this._participantRegistrationDisposables.deleteAndDispose(getParticipantKey(extension.description.identifier, providerDescriptor.id));
        }
      }
    });
  }
};
ChatExtensionPointHandler.ID = "workbench.contrib.chatExtensionPointHandler";
ChatExtensionPointHandler = __decorateClass([
  __decorateParam(0, IChatAgentService)
], ChatExtensionPointHandler);
function getParticipantKey(extensionId, participantName) {
  return `${extensionId.value}_${participantName}`;
}
let ChatCompatibilityNotifier = class extends Disposable {
  constructor(extensionsWorkbenchService, contextKeyService, productService) {
    super();
    this.productService = productService;
    this.registeredWelcomeView = false;
    const isInvalid = ChatContextKeys.extensionInvalid.bindTo(contextKeyService);
    this._register(Event.runAndSubscribe(
      extensionsWorkbenchService.onDidChangeExtensionsNotification,
      () => {
        const notification = extensionsWorkbenchService.getExtensionsNotification();
        const chatExtension = notification?.extensions.find((ext) => ExtensionIdentifier.equals(ext.identifier.id, this.productService.defaultChatAgent?.chatExtensionId));
        if (chatExtension) {
          isInvalid.set(true);
          this.registerWelcomeView(chatExtension);
        } else {
          isInvalid.set(false);
        }
      }
    ));
  }
  registerWelcomeView(chatExtension) {
    if (this.registeredWelcomeView) {
      return;
    }
    this.registeredWelcomeView = true;
    const showExtensionLabel = localize("showExtension", "Show Extension");
    const mainMessage = localize("chatFailErrorMessage", "Chat failed to load because the installed version of the Copilot Chat extension is not compatible with this version of {0}. Please ensure that the Copilot Chat extension is up to date.", this.productService.nameLong);
    const commandButton = `[${showExtensionLabel}](${createCommandUri(showExtensionsWithIdsCommandId, [this.productService.defaultChatAgent?.chatExtensionId])})`;
    const versionMessage = `Copilot Chat version: ${chatExtension.version}`;
    const viewsRegistry = Registry.as(ViewExtensions.ViewsRegistry);
    this._register(viewsRegistry.registerViewWelcomeContent(ChatViewId, {
      content: [mainMessage, commandButton, versionMessage].join("\n\n"),
      when: ChatContextKeys.extensionInvalid
    }));
  }
};
ChatCompatibilityNotifier.ID = "workbench.contrib.chatCompatNotifier";
ChatCompatibilityNotifier = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IProductService)
], ChatCompatibilityNotifier);
class ChatParticipantDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.chatParticipants;
  }
  render(manifest) {
    const nonDefaultContributions = manifest.contributes?.chatParticipants?.filter((c) => !c.isDefault) ?? [];
    if (!nonDefaultContributions.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      localize("participantName", "Name"),
      localize("participantFullName", "Full Name"),
      localize("participantDescription", "Description"),
      localize("participantCommands", "Commands")
    ];
    const rows = nonDefaultContributions.map((d) => {
      return [
        "@" + d.name,
        d.fullName,
        d.description ?? "-",
        d.commands?.length ? new MarkdownString(d.commands.map((c) => `- /` + c.name).join("\n")) : "-"
      ];
    });
    return {
      data: {
        headers,
        rows
      },
      dispose: () => {
      }
    };
  }
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "chatParticipants",
  label: localize("chatParticipants", "Chat Participants"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(ChatParticipantDataRenderer)
});
export {
  ChatCompatibilityNotifier,
  ChatExtensionPointHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRQYXJ0aWNpcGFudC5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBjb2FsZXNjZSwgaXNOb25FbXB0eUFycmF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGNyZWF0ZUNvbW1hbmRVcmksIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIsIElFeHRlbnNpb25NYW5pZmVzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFZpZXdQYW5lQ29udGFpbmVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZUNvbnRhaW5lci5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSVZpZXdDb250YWluZXJzUmVnaXN0cnksIElWaWV3RGVzY3JpcHRvciwgSVZpZXdzUmVnaXN0cnksIFZpZXdDb250YWluZXIsIFZpZXdDb250YWluZXJMb2NhdGlvbiwgRXh0ZW5zaW9ucyBhcyBWaWV3RXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSwgSUV4dGVuc2lvbkZlYXR1cmVUYWJsZVJlbmRlcmVyLCBJUmVuZGVyZWREYXRhLCBJUm93RGF0YSwgSVRhYmxlRGF0YSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkZlYXR1cmVzLmpzJztcbmltcG9ydCB7IGlzUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgKiBhcyBleHRlbnNpb25zUmVnaXN0cnkgZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IHNob3dFeHRlbnNpb25zV2l0aElkc0NvbW1hbmRJZCB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvYnJvd3Nlci9leHRlbnNpb25zQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uLCBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElDaGF0QWdlbnREYXRhLCBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSVJhd0NoYXRQYXJ0aWNpcGFudENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdFBhcnRpY2lwYW50Q29udHJpYlR5cGVzLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IENoYXRWaWV3SWQsIENoYXRWaWV3Q29udGFpbmVySWQgfSBmcm9tICcuL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdQYW5lIH0gZnJvbSAnLi93aWRnZXRIb3N0cy92aWV3UGFuZS9jaGF0Vmlld1BhbmUuanMnO1xuXG4vLyAtLS0gQ2hhdCBDb250YWluZXIgJiAgVmlldyBSZWdpc3RyYXRpb25cblxuY29uc3QgY2hhdFZpZXdJY29uID0gcmVnaXN0ZXJJY29uKCdjaGF0LXZpZXctaWNvbicsIENvZGljb24ub3BlbmFpLCBsb2NhbGl6ZSgnY2hhdFZpZXdJY29uJywgJ1ZpZXcgaWNvbiBvZiB0aGUgQ29kZXggdmlldy4nKSk7XG5cbmNvbnN0IGNoYXRWaWV3Q29udGFpbmVyOiBWaWV3Q29udGFpbmVyID0gUmVnaXN0cnkuYXM8SVZpZXdDb250YWluZXJzUmVnaXN0cnk+KFZpZXdFeHRlbnNpb25zLlZpZXdDb250YWluZXJzUmVnaXN0cnkpLnJlZ2lzdGVyVmlld0NvbnRhaW5lcih7XG5cdGlkOiBDaGF0Vmlld0NvbnRhaW5lcklkLFxuXHR0aXRsZTogbG9jYWxpemUyKCdjaGF0LnZpZXdDb250YWluZXIubGFiZWwnLCBcIkNvZGV4XCIpLFxuXHRpY29uOiBjaGF0Vmlld0ljb24sXG5cdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoVmlld1BhbmVDb250YWluZXIsIFtDaGF0Vmlld0NvbnRhaW5lcklkLCB7IG1lcmdlVmlld1dpdGhDb250YWluZXJXaGVuU2luZ2xlVmlldzogdHJ1ZSB9XSksXG5cdHN0b3JhZ2VJZDogQ2hhdFZpZXdDb250YWluZXJJZCxcblx0aGlkZUlmRW1wdHk6IHRydWUsXG5cdG9yZGVyOiAxLFxufSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhciwgeyBpc0RlZmF1bHQ6IHRydWUsIGRvTm90UmVnaXN0ZXJPcGVuQ29tbWFuZDogdHJ1ZSB9KTtcblxuY29uc3QgY2hhdFZpZXdEZXNjcmlwdG9yOiBJVmlld0Rlc2NyaXB0b3IgPSB7XG5cdGlkOiBDaGF0Vmlld0lkLFxuXHRjb250YWluZXJJY29uOiBjaGF0Vmlld0NvbnRhaW5lci5pY29uLFxuXHRjb250YWluZXJUaXRsZTogY2hhdFZpZXdDb250YWluZXIudGl0bGUudmFsdWUsXG5cdHNpbmdsZVZpZXdQYW5lQ29udGFpbmVyVGl0bGU6IGNoYXRWaWV3Q29udGFpbmVyLnRpdGxlLnZhbHVlLFxuXHRuYW1lOiBsb2NhbGl6ZTIoJ2NoYXQudmlld0NvbnRhaW5lci5sYWJlbCcsIFwiQ29kZXhcIiksXG5cdGNhblRvZ2dsZVZpc2liaWxpdHk6IGZhbHNlLFxuXHRjYW5Nb3ZlVmlldzogdHJ1ZSxcblx0b3BlbkNvbW1hbmRBY3Rpb25EZXNjcmlwdG9yOiB7XG5cdFx0aWQ6IENoYXRWaWV3Q29udGFpbmVySWQsXG5cdFx0dGl0bGU6IGNoYXRWaWV3Q29udGFpbmVyLnRpdGxlLFxuXHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlUb2dnbGVDaGF0JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQ29kZXhcIiksXG5cdFx0a2V5YmluZGluZ3M6IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5SSxcblx0XHRcdG1hYzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5LZXlJXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRvcmRlcjogMVxuXHR9LFxuXHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKENoYXRWaWV3UGFuZSksXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRDaGF0Q29udGV4dEtleXMuYWNjb3VudFBvbGljeUdhdGVBY3RpdmUubmVnYXRlKCksXG5cdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdENoYXRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCksXG5cdFx0XHRcdENoYXRDb250ZXh0S2V5cy5TZXR1cC5kaXNhYmxlZEluV29ya3NwYWNlLm5lZ2F0ZSgpLFxuXHRcdFx0KSxcblx0XHRcdENoYXRDb250ZXh0S2V5cy5wYW5lbFBhcnRpY2lwYW50UmVnaXN0ZXJlZCxcblx0XHRcdENoYXRDb250ZXh0S2V5cy5leHRlbnNpb25JbnZhbGlkXG5cdFx0KVxuXHQpXG59O1xuUmVnaXN0cnkuYXM8SVZpZXdzUmVnaXN0cnk+KFZpZXdFeHRlbnNpb25zLlZpZXdzUmVnaXN0cnkpLnJlZ2lzdGVyVmlld3MoW2NoYXRWaWV3RGVzY3JpcHRvcl0sIGNoYXRWaWV3Q29udGFpbmVyKTtcblxuY29uc3QgY2hhdFBhcnRpY2lwYW50RXh0ZW5zaW9uUG9pbnQgPSBleHRlbnNpb25zUmVnaXN0cnkuRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8SVJhd0NoYXRQYXJ0aWNpcGFudENvbnRyaWJ1dGlvbltdPih7XG5cdGV4dGVuc2lvblBvaW50OiAnY2hhdFBhcnRpY2lwYW50cycsXG5cdGpzb25TY2hlbWE6IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuY2hhdFBhcnRpY2lwYW50JywgJ0NvbnRyaWJ1dGVzIGEgY2hhdCBwYXJ0aWNpcGFudCcpLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0aXRlbXM6IHtcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiB7IG5hbWU6ICcnLCBkZXNjcmlwdGlvbjogJycgfSB9XSxcblx0XHRcdHJlcXVpcmVkOiBbJ25hbWUnLCAnaWQnXSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0aWQ6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRQYXJ0aWNpcGFudElkJywgXCJBIHVuaXF1ZSBpZCBmb3IgdGhpcyBjaGF0IHBhcnRpY2lwYW50LlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRuYW1lOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0UGFydGljaXBhbnROYW1lJywgXCJVc2VyLWZhY2luZyBuYW1lIGZvciB0aGlzIGNoYXQgcGFydGljaXBhbnQuIFRoZSB1c2VyIHdpbGwgdXNlICdAJyB3aXRoIHRoaXMgbmFtZSB0byBpbnZva2UgdGhlIHBhcnRpY2lwYW50LiBOYW1lIG11c3Qgbm90IGNvbnRhaW4gd2hpdGVzcGFjZS5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0cGF0dGVybjogJ15bXFxcXHctXSskJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRmdWxsTmFtZToge1xuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0UGFydGljaXBhbnRGdWxsTmFtZScsIFwiVGhlIGZ1bGwgbmFtZSBvZiB0aGlzIGNoYXQgcGFydGljaXBhbnQsIHdoaWNoIGlzIHNob3duIGFzIHRoZSBsYWJlbCBmb3IgcmVzcG9uc2VzIGNvbWluZyBmcm9tIHRoaXMgcGFydGljaXBhbnQuIElmIG5vdCBwcm92aWRlZCwgezB9IGlzIHVzZWQuXCIsICdgbmFtZWAnKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFBhcnRpY2lwYW50RGVzY3JpcHRpb24nLCBcIkEgZGVzY3JpcHRpb24gb2YgdGhpcyBjaGF0IHBhcnRpY2lwYW50LCBzaG93biBpbiB0aGUgVUkuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGlzU3RpY2t5OiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0Q29tbWFuZFN0aWNreScsIFwiV2hldGhlciBpbnZva2luZyB0aGUgY29tbWFuZCBwdXRzIHRoZSBjaGF0IGludG8gYSBwZXJzaXN0ZW50IG1vZGUsIHdoZXJlIHRoZSBjb21tYW5kIGlzIGF1dG9tYXRpY2FsbHkgYWRkZWQgdG8gdGhlIGNoYXQgaW5wdXQgZm9yIHRoZSBuZXh0IG1lc3NhZ2UuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRzYW1wbGVSZXF1ZXN0OiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0U2FtcGxlUmVxdWVzdCcsIFwiV2hlbiB0aGUgdXNlciBjbGlja3MgdGhpcyBwYXJ0aWNpcGFudCBpbiBgL2hlbHBgLCB0aGlzIHRleHQgd2lsbCBiZSBzdWJtaXR0ZWQgdG8gdGhlIHBhcnRpY2lwYW50LlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR3aGVuOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0UGFydGljaXBhbnRXaGVuJywgXCJBIGNvbmRpdGlvbiB3aGljaCBtdXN0IGJlIHRydWUgdG8gZW5hYmxlIHRoaXMgcGFydGljaXBhbnQuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRpc2FtYmlndWF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0UGFydGljaXBhbnREaXNhbWJpZ3VhdGlvbicsIFwiTWV0YWRhdGEgdG8gaGVscCB3aXRoIGF1dG9tYXRpY2FsbHkgcm91dGluZyB1c2VyIHF1ZXN0aW9ucyB0byB0aGlzIGNoYXQgcGFydGljaXBhbnQuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiB7IGNhdGVnb3J5OiAnJywgZGVzY3JpcHRpb246ICcnLCBleGFtcGxlczogW10gfSB9XSxcblx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ2NhdGVnb3J5JywgJ2Rlc2NyaXB0aW9uJywgJ2V4YW1wbGVzJ10sXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdGNhdGVnb3J5OiB7XG5cdFx0XHRcdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRQYXJ0aWNpcGFudERpc2FtYmlndWF0aW9uQ2F0ZWdvcnknLCBcIkEgZGV0YWlsZWQgbmFtZSBmb3IgdGhpcyBjYXRlZ29yeSwgZS5nLiBgd29ya3NwYWNlX3F1ZXN0aW9uc2Agb3IgYHdlYl9xdWVzdGlvbnNgLlwiKSxcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFBhcnRpY2lwYW50RGlzYW1iaWd1YXRpb25EZXNjcmlwdGlvbicsIFwiQSBkZXRhaWxlZCBkZXNjcmlwdGlvbiBvZiB0aGUga2luZHMgb2YgcXVlc3Rpb25zIHRoYXQgYXJlIHN1aXRhYmxlIGZvciB0aGlzIGNoYXQgcGFydGljaXBhbnQuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGV4YW1wbGVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0UGFydGljaXBhbnREaXNhbWJpZ3VhdGlvbkV4YW1wbGVzJywgXCJBIGxpc3Qgb2YgcmVwcmVzZW50YXRpdmUgZXhhbXBsZSBxdWVzdGlvbnMgdGhhdCBhcmUgc3VpdGFibGUgZm9yIHRoaXMgY2hhdCBwYXJ0aWNpcGFudC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5J1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0Y29tbWFuZHM6IHtcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdENvbW1hbmRzRGVzY3JpcHRpb24nLCBcIkNvbW1hbmRzIGF2YWlsYWJsZSBmb3IgdGhpcyBjaGF0IHBhcnRpY2lwYW50LCB3aGljaCB0aGUgdXNlciBjYW4gaW52b2tlIHdpdGggYSBgL2AuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiB7IG5hbWU6ICcnLCBkZXNjcmlwdGlvbjogJycgfSB9XSxcblx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ25hbWUnXSxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0bmFtZToge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdENvbW1hbmQnLCBcIkEgc2hvcnQgbmFtZSBieSB3aGljaCB0aGlzIGNvbW1hbmQgaXMgcmVmZXJyZWQgdG8gaW4gdGhlIFVJLCBlLmcuIGBmaXhgIG9yIGBleHBsYWluYCBmb3IgY29tbWFuZHMgdGhhdCBmaXggYW4gaXNzdWUgb3IgZXhwbGFpbiBjb2RlLiBUaGUgbmFtZSBzaG91bGQgYmUgdW5pcXVlIGFtb25nIHRoZSBjb21tYW5kcyBwcm92aWRlZCBieSB0aGlzIHBhcnRpY2lwYW50LlwiKSxcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdENvbW1hbmREZXNjcmlwdGlvbicsIFwiQSBkZXNjcmlwdGlvbiBvZiB0aGlzIGNvbW1hbmQuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHdoZW46IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRDb21tYW5kV2hlbicsIFwiQSBjb25kaXRpb24gd2hpY2ggbXVzdCBiZSB0cnVlIHRvIGVuYWJsZSB0aGlzIGNvbW1hbmQuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHNhbXBsZVJlcXVlc3Q6IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRDb21tYW5kU2FtcGxlUmVxdWVzdCcsIFwiV2hlbiB0aGUgdXNlciBjbGlja3MgdGhpcyBjb21tYW5kIGluIGAvaGVscGAsIHRoaXMgdGV4dCB3aWxsIGJlIHN1Ym1pdHRlZCB0byB0aGUgcGFydGljaXBhbnQuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGlzU3RpY2t5OiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0Q29tbWFuZFN0aWNreScsIFwiV2hldGhlciBpbnZva2luZyB0aGUgY29tbWFuZCBwdXRzIHRoZSBjaGF0IGludG8gYSBwZXJzaXN0ZW50IG1vZGUsIHdoZXJlIHRoZSBjb21tYW5kIGlzIGF1dG9tYXRpY2FsbHkgYWRkZWQgdG8gdGhlIGNoYXQgaW5wdXQgZm9yIHRoZSBuZXh0IG1lc3NhZ2UuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRkaXNhbWJpZ3VhdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdENvbW1hbmREaXNhbWJpZ3VhdGlvbicsIFwiTWV0YWRhdGEgdG8gaGVscCB3aXRoIGF1dG9tYXRpY2FsbHkgcm91dGluZyB1c2VyIHF1ZXN0aW9ucyB0byB0aGlzIGNoYXQgY29tbWFuZC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgY2F0ZWdvcnk6ICcnLCBkZXNjcmlwdGlvbjogJycsIGV4YW1wbGVzOiBbXSB9IH1dLFxuXHRcdFx0XHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsnY2F0ZWdvcnknLCAnZGVzY3JpcHRpb24nLCAnZXhhbXBsZXMnXSxcblx0XHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y2F0ZWdvcnk6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdENvbW1hbmREaXNhbWJpZ3VhdGlvbkNhdGVnb3J5JywgXCJBIGRldGFpbGVkIG5hbWUgZm9yIHRoaXMgY2F0ZWdvcnksIGUuZy4gYHdvcmtzcGFjZV9xdWVzdGlvbnNgIG9yIGB3ZWJfcXVlc3Rpb25zYC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRDb21tYW5kRGlzYW1iaWd1YXRpb25EZXNjcmlwdGlvbicsIFwiQSBkZXRhaWxlZCBkZXNjcmlwdGlvbiBvZiB0aGUga2luZHMgb2YgcXVlc3Rpb25zIHRoYXQgYXJlIHN1aXRhYmxlIGZvciB0aGlzIGNoYXQgY29tbWFuZC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZXhhbXBsZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRDb21tYW5kRGlzYW1iaWd1YXRpb25FeGFtcGxlcycsIFwiQSBsaXN0IG9mIHJlcHJlc2VudGF0aXZlIGV4YW1wbGUgcXVlc3Rpb25zIHRoYXQgYXJlIHN1aXRhYmxlIGZvciB0aGlzIGNoYXQgY29tbWFuZC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5J1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHR9XG5cdH0sXG5cdGFjdGl2YXRpb25FdmVudHNHZW5lcmF0b3I6IGZ1bmN0aW9uKiAoY29udHJpYnV0aW9uczogcmVhZG9ubHkgSVJhd0NoYXRQYXJ0aWNpcGFudENvbnRyaWJ1dGlvbltdKSB7XG5cdFx0Zm9yIChjb25zdCBjb250cmliIG9mIGNvbnRyaWJ1dGlvbnMpIHtcblx0XHRcdHlpZWxkIGBvbkNoYXRQYXJ0aWNpcGFudDoke2NvbnRyaWIuaWR9YDtcblx0XHR9XG5cdH0sXG59KTtcblxuZXhwb3J0IGNsYXNzIENoYXRFeHRlbnNpb25Qb2ludEhhbmRsZXIgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY2hhdEV4dGVuc2lvblBvaW50SGFuZGxlcic7XG5cblx0cHJpdmF0ZSBfcGFydGljaXBhbnRSZWdpc3RyYXRpb25EaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZz4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuaGFuZGxlQW5kUmVnaXN0ZXJDaGF0RXh0ZW5zaW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVBbmRSZWdpc3RlckNoYXRFeHRlbnNpb25zKCk6IHZvaWQge1xuXHRcdGNoYXRQYXJ0aWNpcGFudEV4dGVuc2lvblBvaW50LnNldEhhbmRsZXIoKGV4dGVuc2lvbnMsIGRlbHRhKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBkZWx0YS5hZGRlZCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyRGVzY3JpcHRvciBvZiBleHRlbnNpb24udmFsdWUpIHtcblx0XHRcdFx0XHRpZiAoIXByb3ZpZGVyRGVzY3JpcHRvci5uYW1lPy5tYXRjaCgvXltcXHctXSskLykpIHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IoYEV4dGVuc2lvbiAnJHtleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZX0nIENBTk5PVCByZWdpc3RlciBwYXJ0aWNpcGFudCB3aXRoIGludmFsaWQgbmFtZTogJHtwcm92aWRlckRlc2NyaXB0b3IubmFtZX0uIE5hbWUgbXVzdCBtYXRjaCAvXltcXFxcdy1dKyQvLmApO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHByb3ZpZGVyRGVzY3JpcHRvci5mdWxsTmFtZSAmJiBzdHJpbmdzLkFtYmlndW91c0NoYXJhY3RlcnMuZ2V0SW5zdGFuY2UobmV3IFNldCgpKS5jb250YWluc0FtYmlndW91c0NoYXJhY3Rlcihwcm92aWRlckRlc2NyaXB0b3IuZnVsbE5hbWUpKSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmVycm9yKGBFeHRlbnNpb24gJyR7ZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWV9JyBDQU5OT1QgcmVnaXN0ZXIgcGFydGljaXBhbnQgd2l0aCBmdWxsTmFtZSB0aGF0IGNvbnRhaW5zIGFtYmlndW91cyBjaGFyYWN0ZXJzOiAke3Byb3ZpZGVyRGVzY3JpcHRvci5mdWxsTmFtZX0uYCk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBTcGFjZXMgYXJlIGFsbG93ZWQgYnV0IGNvbnNpZGVyZWQgXCJpbnZpc2libGVcIlxuXHRcdFx0XHRcdGlmIChwcm92aWRlckRlc2NyaXB0b3IuZnVsbE5hbWUgJiYgc3RyaW5ncy5JbnZpc2libGVDaGFyYWN0ZXJzLmNvbnRhaW5zSW52aXNpYmxlQ2hhcmFjdGVyKHByb3ZpZGVyRGVzY3JpcHRvci5mdWxsTmFtZS5yZXBsYWNlKC8gL2csICcnKSkpIHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IoYEV4dGVuc2lvbiAnJHtleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZX0nIENBTk5PVCByZWdpc3RlciBwYXJ0aWNpcGFudCB3aXRoIGZ1bGxOYW1lIHRoYXQgY29udGFpbnMgaW52aXNpYmxlIGNoYXJhY3RlcnM6ICR7cHJvdmlkZXJEZXNjcmlwdG9yLmZ1bGxOYW1lfS5gKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICgocHJvdmlkZXJEZXNjcmlwdG9yLmlzRGVmYXVsdCB8fCBwcm92aWRlckRlc2NyaXB0b3IubW9kZXMpICYmICFpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24uZGVzY3JpcHRpb24sICdkZWZhdWx0Q2hhdFBhcnRpY2lwYW50JykpIHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IoYEV4dGVuc2lvbiAnJHtleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZX0nIENBTk5PVCB1c2UgQVBJIHByb3Bvc2FsOiBkZWZhdWx0Q2hhdFBhcnRpY2lwYW50LmApO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHByb3ZpZGVyRGVzY3JpcHRvci5sb2NhdGlvbnMgJiYgIWlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbi5kZXNjcmlwdGlvbiwgJ2NoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucycpKSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmVycm9yKGBFeHRlbnNpb24gJyR7ZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWV9JyBDQU5OT1QgdXNlIEFQSSBwcm9wb3NhbDogY2hhdFBhcnRpY2lwYW50QWRkaXRpb25zLmApO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKCFwcm92aWRlckRlc2NyaXB0b3IuaWQgfHwgIXByb3ZpZGVyRGVzY3JpcHRvci5uYW1lKSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmVycm9yKGBFeHRlbnNpb24gJyR7ZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWV9JyBDQU5OT1QgcmVnaXN0ZXIgcGFydGljaXBhbnQgd2l0aG91dCBib3RoIGlkIGFuZCBuYW1lLmApO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgcGFydGljaXBhbnRzRGlzYW1iaWd1YXRpb246IHtcblx0XHRcdFx0XHRcdGNhdGVnb3J5OiBzdHJpbmc7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRcdFx0XHRcdFx0ZXhhbXBsZXM6IHN0cmluZ1tdO1xuXHRcdFx0XHRcdH1bXSA9IFtdO1xuXG5cdFx0XHRcdFx0aWYgKHByb3ZpZGVyRGVzY3JpcHRvci5kaXNhbWJpZ3VhdGlvbj8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRwYXJ0aWNpcGFudHNEaXNhbWJpZ3VhdGlvbi5wdXNoKC4uLnByb3ZpZGVyRGVzY3JpcHRvci5kaXNhbWJpZ3VhdGlvbi5tYXAoKGQpID0+ICh7XG5cdFx0XHRcdFx0XHRcdC4uLmQsIGNhdGVnb3J5OiBkLmNhdGVnb3J5ID8/IGQuY2F0ZWdvcnlOYW1lXG5cdFx0XHRcdFx0XHR9KSkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0XHRcdHN0b3JlLmFkZCh0aGlzLl9jaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnQoXG5cdFx0XHRcdFx0XHRcdHByb3ZpZGVyRGVzY3JpcHRvci5pZCxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdGV4dGVuc2lvbklkOiBleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllcixcblx0XHRcdFx0XHRcdFx0XHRleHRlbnNpb25WZXJzaW9uOiBleHRlbnNpb24uZGVzY3JpcHRpb24udmVyc2lvbixcblx0XHRcdFx0XHRcdFx0XHRwdWJsaXNoZXJEaXNwbGF5TmFtZTogZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLnB1Ymxpc2hlckRpc3BsYXlOYW1lID8/IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5wdWJsaXNoZXIsIC8vIE1heSBub3QgYmUgcHJlc2VudCBpbiBPU1Ncblx0XHRcdFx0XHRcdFx0XHRleHRlbnNpb25QdWJsaXNoZXJJZDogZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLnB1Ymxpc2hlcixcblx0XHRcdFx0XHRcdFx0XHRleHRlbnNpb25EaXNwbGF5TmFtZTogZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmRpc3BsYXlOYW1lID8/IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5uYW1lLFxuXHRcdFx0XHRcdFx0XHRcdGlkOiBwcm92aWRlckRlc2NyaXB0b3IuaWQsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHByb3ZpZGVyRGVzY3JpcHRvci5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdFx0XHR3aGVuOiBwcm92aWRlckRlc2NyaXB0b3Iud2hlbixcblx0XHRcdFx0XHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdFx0XHRcdFx0aXNTdGlja3k6IHByb3ZpZGVyRGVzY3JpcHRvci5pc1N0aWNreSxcblx0XHRcdFx0XHRcdFx0XHRcdHNhbXBsZVJlcXVlc3Q6IHByb3ZpZGVyRGVzY3JpcHRvci5zYW1wbGVSZXF1ZXN0LFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogcHJvdmlkZXJEZXNjcmlwdG9yLm5hbWUsXG5cdFx0XHRcdFx0XHRcdFx0ZnVsbE5hbWU6IHByb3ZpZGVyRGVzY3JpcHRvci5mdWxsTmFtZSxcblx0XHRcdFx0XHRcdFx0XHRpc0RlZmF1bHQ6IHByb3ZpZGVyRGVzY3JpcHRvci5pc0RlZmF1bHQsXG5cdFx0XHRcdFx0XHRcdFx0bG9jYXRpb25zOiBpc05vbkVtcHR5QXJyYXkocHJvdmlkZXJEZXNjcmlwdG9yLmxvY2F0aW9ucykgP1xuXHRcdFx0XHRcdFx0XHRcdFx0cHJvdmlkZXJEZXNjcmlwdG9yLmxvY2F0aW9ucy5tYXAoQ2hhdEFnZW50TG9jYXRpb24uZnJvbVJhdykgOlxuXHRcdFx0XHRcdFx0XHRcdFx0W0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdLFxuXHRcdFx0XHRcdFx0XHRcdG1vZGVzOiBwcm92aWRlckRlc2NyaXB0b3IuaXNEZWZhdWx0ID8gKHByb3ZpZGVyRGVzY3JpcHRvci5tb2RlcyA/PyBbQ2hhdE1vZGVLaW5kLkFza10pIDogW0NoYXRNb2RlS2luZC5BZ2VudCwgQ2hhdE1vZGVLaW5kLkFzaywgQ2hhdE1vZGVLaW5kLkVkaXRdLFxuXHRcdFx0XHRcdFx0XHRcdHNsYXNoQ29tbWFuZHM6IHByb3ZpZGVyRGVzY3JpcHRvci5jb21tYW5kcyA/PyBbXSxcblx0XHRcdFx0XHRcdFx0XHRkaXNhbWJpZ3VhdGlvbjogY29hbGVzY2UocGFydGljaXBhbnRzRGlzYW1iaWd1YXRpb24uZmxhdCgpKSxcblx0XHRcdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSUNoYXRBZ2VudERhdGEpKTtcblxuXHRcdFx0XHRcdFx0dGhpcy5fcGFydGljaXBhbnRSZWdpc3RyYXRpb25EaXNwb3NhYmxlcy5zZXQoXG5cdFx0XHRcdFx0XHRcdGdldFBhcnRpY2lwYW50S2V5KGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLCBwcm92aWRlckRlc2NyaXB0b3IuaWQpLFxuXHRcdFx0XHRcdFx0XHRzdG9yZVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmVycm9yKGBGYWlsZWQgdG8gcmVnaXN0ZXIgcGFydGljaXBhbnQgJHtwcm92aWRlckRlc2NyaXB0b3IuaWR9OiAke3RvRXJyb3JNZXNzYWdlKGUsIHRydWUpfWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBkZWx0YS5yZW1vdmVkKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgcHJvdmlkZXJEZXNjcmlwdG9yIG9mIGV4dGVuc2lvbi52YWx1ZSkge1xuXHRcdFx0XHRcdHRoaXMuX3BhcnRpY2lwYW50UmVnaXN0cmF0aW9uRGlzcG9zYWJsZXMuZGVsZXRlQW5kRGlzcG9zZShnZXRQYXJ0aWNpcGFudEtleShleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllciwgcHJvdmlkZXJEZXNjcmlwdG9yLmlkKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRQYXJ0aWNpcGFudEtleShleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgcGFydGljaXBhbnROYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7ZXh0ZW5zaW9uSWQudmFsdWV9XyR7cGFydGljaXBhbnROYW1lfWA7XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0Q29tcGF0aWJpbGl0eU5vdGlmaWVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY2hhdENvbXBhdE5vdGlmaWVyJztcblxuXHRwcml2YXRlIHJlZ2lzdGVyZWRXZWxjb21lVmlldyA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBJdCBtYXkgYmUgYmV0dGVyIHRvIGhhdmUgc29tZSBnZW5lcmljIFVJIGZvciB0aGlzLCBmb3IgYW55IGV4dGVuc2lvbiB0aGF0IGlzIGluY29tcGF0aWJsZSxcblx0XHQvLyBidXQgdGhpcyBpcyBvbmx5IGVuYWJsZWQgZm9yIENoYXQgbm93IGFuZCBpdCBuZWVkcyB0byBiZSBvYnZpb3VzLlxuXHRcdGNvbnN0IGlzSW52YWxpZCA9IENoYXRDb250ZXh0S2V5cy5leHRlbnNpb25JbnZhbGlkLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKFxuXHRcdFx0ZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25zTm90aWZpY2F0aW9uLFxuXHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRjb25zdCBub3RpZmljYXRpb24gPSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5nZXRFeHRlbnNpb25zTm90aWZpY2F0aW9uKCk7XG5cdFx0XHRcdGNvbnN0IGNoYXRFeHRlbnNpb24gPSBub3RpZmljYXRpb24/LmV4dGVuc2lvbnMuZmluZChleHQgPT4gRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMoZXh0LmlkZW50aWZpZXIuaWQsIHRoaXMucHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudD8uY2hhdEV4dGVuc2lvbklkKSk7XG5cdFx0XHRcdGlmIChjaGF0RXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0aXNJbnZhbGlkLnNldCh0cnVlKTtcblx0XHRcdFx0XHR0aGlzLnJlZ2lzdGVyV2VsY29tZVZpZXcoY2hhdEV4dGVuc2lvbik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aXNJbnZhbGlkLnNldChmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJXZWxjb21lVmlldyhjaGF0RXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKSB7XG5cdFx0aWYgKHRoaXMucmVnaXN0ZXJlZFdlbGNvbWVWaWV3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5yZWdpc3RlcmVkV2VsY29tZVZpZXcgPSB0cnVlO1xuXHRcdGNvbnN0IHNob3dFeHRlbnNpb25MYWJlbCA9IGxvY2FsaXplKCdzaG93RXh0ZW5zaW9uJywgXCJTaG93IEV4dGVuc2lvblwiKTtcblx0XHRjb25zdCBtYWluTWVzc2FnZSA9IGxvY2FsaXplKCdjaGF0RmFpbEVycm9yTWVzc2FnZScsIFwiQ2hhdCBmYWlsZWQgdG8gbG9hZCBiZWNhdXNlIHRoZSBpbnN0YWxsZWQgdmVyc2lvbiBvZiB0aGUgQ29waWxvdCBDaGF0IGV4dGVuc2lvbiBpcyBub3QgY29tcGF0aWJsZSB3aXRoIHRoaXMgdmVyc2lvbiBvZiB7MH0uIFBsZWFzZSBlbnN1cmUgdGhhdCB0aGUgQ29waWxvdCBDaGF0IGV4dGVuc2lvbiBpcyB1cCB0byBkYXRlLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKTtcblx0XHRjb25zdCBjb21tYW5kQnV0dG9uID0gYFske3Nob3dFeHRlbnNpb25MYWJlbH1dKCR7Y3JlYXRlQ29tbWFuZFVyaShzaG93RXh0ZW5zaW9uc1dpdGhJZHNDb21tYW5kSWQsIFt0aGlzLnByb2R1Y3RTZXJ2aWNlLmRlZmF1bHRDaGF0QWdlbnQ/LmNoYXRFeHRlbnNpb25JZF0pfSlgO1xuXHRcdGNvbnN0IHZlcnNpb25NZXNzYWdlID0gYENvcGlsb3QgQ2hhdCB2ZXJzaW9uOiAke2NoYXRFeHRlbnNpb24udmVyc2lvbn1gO1xuXHRcdGNvbnN0IHZpZXdzUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJVmlld3NSZWdpc3RyeT4oVmlld0V4dGVuc2lvbnMuVmlld3NSZWdpc3RyeSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdXZWxjb21lQ29udGVudChDaGF0Vmlld0lkLCB7XG5cdFx0XHRjb250ZW50OiBbbWFpbk1lc3NhZ2UsIGNvbW1hbmRCdXR0b24sIHZlcnNpb25NZXNzYWdlXS5qb2luKCdcXG5cXG4nKSxcblx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5leHRlbnNpb25JbnZhbGlkLFxuXHRcdH0pKTtcblx0fVxufVxuXG5jbGFzcyBDaGF0UGFydGljaXBhbnREYXRhUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dGVuc2lvbkZlYXR1cmVUYWJsZVJlbmRlcmVyIHtcblx0cmVhZG9ubHkgdHlwZSA9ICd0YWJsZSc7XG5cblx0c2hvdWxkUmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFtYW5pZmVzdC5jb250cmlidXRlcz8uY2hhdFBhcnRpY2lwYW50cztcblx0fVxuXG5cdHJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogSVJlbmRlcmVkRGF0YTxJVGFibGVEYXRhPiB7XG5cdFx0Y29uc3Qgbm9uRGVmYXVsdENvbnRyaWJ1dGlvbnMgPSBtYW5pZmVzdC5jb250cmlidXRlcz8uY2hhdFBhcnRpY2lwYW50cz8uZmlsdGVyKGMgPT4gIWMuaXNEZWZhdWx0KSA/PyBbXTtcblx0XHRpZiAoIW5vbkRlZmF1bHRDb250cmlidXRpb25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHsgZGF0YTogeyBoZWFkZXJzOiBbXSwgcm93czogW10gfSwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGVhZGVycyA9IFtcblx0XHRcdGxvY2FsaXplKCdwYXJ0aWNpcGFudE5hbWUnLCBcIk5hbWVcIiksXG5cdFx0XHRsb2NhbGl6ZSgncGFydGljaXBhbnRGdWxsTmFtZScsIFwiRnVsbCBOYW1lXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3BhcnRpY2lwYW50RGVzY3JpcHRpb24nLCBcIkRlc2NyaXB0aW9uXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3BhcnRpY2lwYW50Q29tbWFuZHMnLCBcIkNvbW1hbmRzXCIpLFxuXHRcdF07XG5cblx0XHRjb25zdCByb3dzOiBJUm93RGF0YVtdW10gPSBub25EZWZhdWx0Q29udHJpYnV0aW9ucy5tYXAoZCA9PiB7XG5cdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHQnQCcgKyBkLm5hbWUsXG5cdFx0XHRcdGQuZnVsbE5hbWUsXG5cdFx0XHRcdGQuZGVzY3JpcHRpb24gPz8gJy0nLFxuXHRcdFx0XHRkLmNvbW1hbmRzPy5sZW5ndGggPyBuZXcgTWFya2Rvd25TdHJpbmcoZC5jb21tYW5kcy5tYXAoYyA9PiBgLSAvYCArIGMubmFtZSkuam9pbignXFxuJykpIDogJy0nXG5cdFx0XHRdO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0cm93c1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdH07XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnk+KEV4dGVuc2lvbnMuRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSkucmVnaXN0ZXJFeHRlbnNpb25GZWF0dXJlKHtcblx0aWQ6ICdjaGF0UGFydGljaXBhbnRzJyxcblx0bGFiZWw6IGxvY2FsaXplKCdjaGF0UGFydGljaXBhbnRzJywgXCJDaGF0IFBhcnRpY2lwYW50c1wiKSxcblx0YWNjZXNzOiB7XG5cdFx0Y2FuVG9nZ2xlOiBmYWxzZVxuXHR9LFxuXHRyZW5kZXJlcjogbmV3IFN5bmNEZXNjcmlwdG9yKENoYXRQYXJ0aWNpcGFudERhdGFSZW5kZXJlciksXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxVQUFVLHVCQUF1QjtBQUMxQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQWtCLHNCQUFzQjtBQUNqRCxTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLFlBQVksZUFBZSx1QkFBdUI7QUFDM0QsWUFBWSxhQUFhO0FBQ3pCLFNBQVMsVUFBVSxpQkFBaUI7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
