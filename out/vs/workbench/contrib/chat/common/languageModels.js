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
import { SequencerByKey, timeout } from "../../../../base/common/async.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { CancellationError, getErrorMessage, isCancellationError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { hash } from "../../../../base/common/hash.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { equals } from "../../../../base/common/objects.js";
import Severity from "../../../../base/common/severity.js";
import { format, isFalsyOrWhitespace } from "../../../../base/common/strings.js";
import { SubmenuAction } from "../../../../base/common/actions.js";
import { isObject, isString } from "../../../../base/common/types.js";
import { Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService, NeverShowAgainScope } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { asJson, IRequestService } from "../../../../platform/request/common/request.js";
import { IQuickInputService, QuickInputHideReason } from "../../../../platform/quickinput/common/quickInput.js";
import { ISecretStorageService } from "../../../../platform/secrets/common/secrets.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { ExtensionsRegistry } from "../../../services/extensions/common/extensionsRegistry.js";
import { ChatContextKeys } from "./actions/chatContextKeys.js";
import { ILanguageModelsConfigurationService } from "./languageModelsConfiguration.js";
const COPILOT_VENDOR_ID = "copilot";
function isLanguageModelVendorAbsenceConclusive(vendor, hasLiveModels, hasResolved) {
  return hasLiveModels || hasResolved && vendor !== COPILOT_VENDOR_ID;
}
const BUILT_IN_BYOK_VENDOR_IDS = /* @__PURE__ */ new Set([
  "openai",
  "anthropic",
  "gemini",
  "ollama",
  "openrouter",
  "azure",
  "xai",
  "customoai",
  "customendpoint"
]);
const THIRD_PARTY_PROVIDER_TELEMETRY_NAME = "3p-extension";
const BUILT_IN_BYOK_EXTENSION_IDS = [
  "github.copilot-chat",
  "github.copilot"
];
function getByokProviderTelemetryName(vendor, extension) {
  if (!vendor || vendor === COPILOT_VENDOR_ID) {
    return void 0;
  }
  if (BUILT_IN_BYOK_VENDOR_IDS.has(vendor) && extension && BUILT_IN_BYOK_EXTENSION_IDS.some((id) => ExtensionIdentifier.equals(extension, id))) {
    return vendor;
  }
  return THIRD_PARTY_PROVIDER_TELEMETRY_NAME;
}
var ChatMessageRole = /* @__PURE__ */ ((ChatMessageRole2) => {
  ChatMessageRole2[ChatMessageRole2["System"] = 0] = "System";
  ChatMessageRole2[ChatMessageRole2["User"] = 1] = "User";
  ChatMessageRole2[ChatMessageRole2["Assistant"] = 2] = "Assistant";
  return ChatMessageRole2;
})(ChatMessageRole || {});
var LanguageModelPartAudience = /* @__PURE__ */ ((LanguageModelPartAudience2) => {
  LanguageModelPartAudience2[LanguageModelPartAudience2["Assistant"] = 0] = "Assistant";
  LanguageModelPartAudience2[LanguageModelPartAudience2["User"] = 1] = "User";
  LanguageModelPartAudience2[LanguageModelPartAudience2["Extension"] = 2] = "Extension";
  return LanguageModelPartAudience2;
})(LanguageModelPartAudience || {});
var ChatImageMimeType = /* @__PURE__ */ ((ChatImageMimeType2) => {
  ChatImageMimeType2["PNG"] = "image/png";
  ChatImageMimeType2["JPEG"] = "image/jpeg";
  ChatImageMimeType2["GIF"] = "image/gif";
  ChatImageMimeType2["WEBP"] = "image/webp";
  ChatImageMimeType2["BMP"] = "image/bmp";
  return ChatImageMimeType2;
})(ChatImageMimeType || {});
var ImageDetailLevel = /* @__PURE__ */ ((ImageDetailLevel2) => {
  ImageDetailLevel2["Low"] = "low";
  ImageDetailLevel2["High"] = "high";
  return ImageDetailLevel2;
})(ImageDetailLevel || {});
var ILanguageModelChatMetadata;
((ILanguageModelChatMetadata2) => {
  function suitableForAgentMode(metadata) {
    const supportsToolsAgent = typeof metadata.capabilities?.agentMode === "undefined" || metadata.capabilities.agentMode;
    return supportsToolsAgent && !!metadata.capabilities?.toolCalling;
  }
  ILanguageModelChatMetadata2.suitableForAgentMode = suitableForAgentMode;
  function asQualifiedName(metadata) {
    return `${metadata.name} (${metadata.vendor})`;
  }
  ILanguageModelChatMetadata2.asQualifiedName = asQualifiedName;
  function matchesQualifiedName(name, metadata) {
    if (metadata.vendor === COPILOT_VENDOR_ID && name === metadata.name) {
      return true;
    }
    return name === asQualifiedName(metadata);
  }
  ILanguageModelChatMetadata2.matchesQualifiedName = matchesQualifiedName;
  function hasPromoDiscount(metadata) {
    return !!metadata.promo && metadata.promo.discountPercent > 0;
  }
  ILanguageModelChatMetadata2.hasPromoDiscount = hasPromoDiscount;
  function hasPromoMessage(metadata) {
    return !!metadata.promo && metadata.promo.discountPercent >= 0 && !!metadata.promo.message;
  }
  ILanguageModelChatMetadata2.hasPromoMessage = hasPromoMessage;
  function getPromoEndsAtLabel(endsAt) {
    if (!endsAt) {
      return void 0;
    }
    const endsAtDate = new Date(endsAt);
    if (isNaN(endsAtDate.getTime())) {
      return void 0;
    }
    const formattedDate = endsAtDate.toLocaleDateString(void 0, { year: "numeric", month: "long", day: "numeric" });
    return localize("chat.promo.endsAt", "Ends {0}.", formattedDate);
  }
  ILanguageModelChatMetadata2.getPromoEndsAtLabel = getPromoEndsAtLabel;
  ILanguageModelChatMetadata2.autoModelSelectionDocsUrl = "https://docs.github.com/en/copilot/concepts/models/auto-model-selection";
  function getAutoModelDescription(discountPercent) {
    const base = localize("autoModel.description", "Auto routes based on your task and real-time system health and model performance.");
    const learnMore = localize("autoModel.learnMore", "[Learn More]({0})", ILanguageModelChatMetadata2.autoModelSelectionDocsUrl);
    if (typeof discountPercent === "number" && discountPercent > 0) {
      const discount = localize("autoModel.discount", "Models routed via auto receive a {0}% discount.", discountPercent);
      return `${base} ${discount} ${learnMore}`;
    }
    return `${base} ${learnMore}`;
  }
  ILanguageModelChatMetadata2.getAutoModelDescription = getAutoModelDescription;
  function getAgentHostByokManageModelsIdentifier(metadata) {
    return metadata.byokModelIdentifier;
  }
  ILanguageModelChatMetadata2.getAgentHostByokManageModelsIdentifier = getAgentHostByokManageModelsIdentifier;
})(ILanguageModelChatMetadata || (ILanguageModelChatMetadata = {}));
async function getTextResponseFromStream(response) {
  let responseText = "";
  const streaming = (async () => {
    if (!response?.stream) {
      return;
    }
    for await (const part of response.stream) {
      if (Array.isArray(part)) {
        for (const item of part) {
          if (item.type === "text") {
            responseText += item.value;
          }
        }
      } else if (part.type === "text") {
        responseText += part.value;
      }
    }
  })();
  try {
    await Promise.all([response.result, streaming]);
    return responseText;
  } catch (err) {
    if (responseText) {
      return responseText;
    }
    throw err;
  }
}
function isILanguageModelChatSelector(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value;
  return (obj.name === void 0 || typeof obj.name === "string") && (obj.id === void 0 || typeof obj.id === "string") && (obj.vendor === void 0 || typeof obj.vendor === "string") && (obj.version === void 0 || typeof obj.version === "string") && (obj.family === void 0 || typeof obj.family === "string") && (obj.tokens === void 0 || typeof obj.tokens === "number") && (obj.extension === void 0 || typeof obj.extension === "object");
}
const ILanguageModelsService = createDecorator("ILanguageModelsService");
function getLanguageModelProviderDisplayName(languageModelsService, vendor) {
  if (vendor === "copilotcli") {
    return localize("chat.languageModelProvider.copilot", "Copilot");
  }
  const descriptor = languageModelsService.getVendors().find((candidate) => candidate.vendor === vendor);
  return descriptor?.displayName ?? vendor.charAt(0).toUpperCase() + vendor.slice(1);
}
function getLanguageModelDisplayNameWithProvider(model, languageModelsService) {
  const { metadata } = model;
  if (!metadata.isBYOK && !metadata.byokModelIdentifier) {
    return metadata.name;
  }
  const originalIdentifier = metadata.byokModelIdentifier ?? model.identifier;
  const originalMetadata = metadata.byokModelIdentifier ? languageModelsService.lookupLanguageModel(originalIdentifier) : metadata;
  const providerVendor = originalMetadata?.vendor ?? metadata.modelGroup?.id ?? metadata.vendor;
  const providerName = getLanguageModelProviderDisplayName(languageModelsService, providerVendor);
  const identifierSuffix = originalMetadata?.id;
  const modelName = identifierSuffix && metadata.name.endsWith(` (${identifierSuffix})`) ? metadata.name.slice(0, -identifierSuffix.length - 3) : metadata.name;
  const groupName = languageModelsService.getLanguageModelGroups(providerVendor).find((group) => group.modelIdentifiers.includes(originalIdentifier))?.group?.name;
  return groupName && groupName !== providerName ? localize("chat.languageModelNameWithProviderAndGroup", "{0}/{1}/{2}", providerName, groupName, modelName) : localize("chat.languageModelNameWithProvider", "{0}/{1}", providerName, modelName);
}
const languageModelChatProviderType = {
  type: "object",
  required: ["vendor", "displayName"],
  properties: {
    vendor: {
      type: "string",
      description: localize("vscode.extension.contributes.languageModels.vendor", "A globally unique vendor of language model chat provider.")
    },
    displayName: {
      type: "string",
      description: localize("vscode.extension.contributes.languageModels.displayName", "The display name of the language model chat provider.")
    },
    configuration: {
      type: "object",
      description: localize("vscode.extension.contributes.languageModels.configuration", "Configuration options for the language model chat provider."),
      anyOf: [
        {
          $ref: "http://json-schema.org/draft-07/schema#"
        },
        {
          properties: {
            properties: {
              type: "object",
              additionalProperties: {
                $ref: "http://json-schema.org/draft-07/schema#",
                properties: {
                  secret: {
                    type: "boolean",
                    description: localize("vscode.extension.contributes.languageModels.configuration.secret", "Whether the property is a secret.")
                  }
                }
              }
            },
            additionalProperties: {
              $ref: "http://json-schema.org/draft-07/schema#",
              properties: {
                secret: {
                  type: "boolean",
                  description: localize("vscode.extension.contributes.languageModels.configuration.secret", "Whether the property is a secret.")
                }
              }
            }
          }
        }
      ]
    },
    managementCommand: {
      type: "string",
      description: localize("vscode.extension.contributes.languageModels.managementCommand", "A command to manage the language model chat provider, e.g. 'Manage Copilot models'. This is used in the chat model picker. If not provided, a gear icon is not rendered during vendor selection."),
      deprecated: true,
      deprecationMessage: localize("vscode.extension.contributes.languageModels.managementCommand.deprecated", "The managementCommand property is deprecated and will be removed in a future release. Use the new configuration property instead.")
    },
    deprecation: {
      type: "object",
      description: localize("vscode.extension.contributes.languageModels.deprecation", "Marks this language model chat provider as deprecated. When set, the Manage Models view renders the provider with a link pointing to a replacement."),
      properties: {
        link: {
          type: "string",
          description: localize("vscode.extension.contributes.languageModels.deprecation.link", "A URL opened when the user clicks the deprecation link shown next to the provider name. Use a 'vscode:extension/<publisher>.<name>' URI to open a replacement extension in the Extensions view.")
        }
      }
    },
    when: {
      type: "string",
      description: localize("vscode.extension.contributes.languageModels.when", "Condition which must be true to show this language model chat provider in the Manage Models list.")
    }
  }
};
function resolveProviderDeprecationLink(link, urlProtocol) {
  const uri = URI.parse(link);
  return uri.scheme === Schemas.vscode && urlProtocol ? uri.with({ scheme: urlProtocol }) : uri;
}
const languageModelChatProviderExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "languageModelChatProviders",
  jsonSchema: {
    description: localize("vscode.extension.contributes.languageModelChatProviders", "Contribute language model chat providers of a specific vendor."),
    oneOf: [
      languageModelChatProviderType,
      {
        type: "array",
        items: languageModelChatProviderType
      }
    ]
  },
  activationEventsGenerator: function* (contribs) {
    for (const contrib of contribs) {
      yield `onLanguageModelChatProvider:${contrib.vendor}`;
    }
  }
});
const CHAT_MODEL_RECENTLY_USED_STORAGE_KEY = "chatModelRecentlyUsed";
const CHAT_MODEL_PINNED_STORAGE_KEY = "chatModelPinned";
const CHAT_MODEL_VISIBILITY_STORAGE_KEY = "chatModelVisibility";
const AUTO_MODEL_IDENTIFIER = "copilot/auto";
function isAutoLanguageModel(model) {
  return model?.metadata.id === "auto" || model?.identifier === AUTO_MODEL_IDENTIFIER;
}
const CHAT_PARTICIPANT_NAME_REGISTRY_STORAGE_KEY = "chat.participantNameRegistry";
const CHAT_MODELS_CONTROL_STORAGE_KEY = "chat.modelsControl";
function createModelConfigurationActions(schema, currentConfig, setValue) {
  if (!schema?.properties) {
    return [];
  }
  const actions = [];
  for (const [key, propSchema] of Object.entries(schema.properties)) {
    if (!propSchema.enum || !Array.isArray(propSchema.enum) || propSchema.enum.length < 1) {
      continue;
    }
    const currentValue = currentConfig[key] ?? propSchema.default;
    const label = (typeof propSchema.title === "string" ? propSchema.title : void 0) ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (s) => s.toUpperCase());
    const defaultValue = propSchema.default;
    const enumItemLabels = propSchema.enumItemLabels;
    const enumDescriptions = propSchema.enumDescriptions;
    const enumActions = propSchema.enum.map((value, index) => {
      const itemLabel = enumItemLabels?.[index] ?? String(value);
      const displayLabel = value === defaultValue ? localize("models.enumDefault", "{0} (default)", itemLabel) : itemLabel;
      const tooltip = enumDescriptions?.[index] ?? "";
      return {
        id: `configureModel.${key}.${value}`,
        label: displayLabel,
        class: void 0,
        enabled: true,
        tooltip,
        checked: currentValue === value,
        run: () => setValue(key, value)
      };
    });
    actions.push(new SubmenuAction(`configureModel.${key}`, label, enumActions));
  }
  return actions;
}
let LanguageModelsService = class {
  constructor(_extensionService, _logService, _storageService, _contextKeyService, _languageModelsConfigurationService, _quickInputService, _secretStorageService, _productService, _requestService, _notificationService, _openerService, _telemetryService) {
    this._extensionService = _extensionService;
    this._logService = _logService;
    this._storageService = _storageService;
    this._contextKeyService = _contextKeyService;
    this._languageModelsConfigurationService = _languageModelsConfigurationService;
    this._quickInputService = _quickInputService;
    this._secretStorageService = _secretStorageService;
    this._productService = _productService;
    this._requestService = _requestService;
    this._notificationService = _notificationService;
    this._openerService = _openerService;
    this._telemetryService = _telemetryService;
    this._store = new DisposableStore();
    this._providers = /* @__PURE__ */ new Map();
    this._vendors = /* @__PURE__ */ new Map();
    /** Vendors for which a deprecation notice has already been shown this session. */
    this._deprecationNoticeShownVendors = /* @__PURE__ */ new Set();
    this._onDidChangeLanguageModelVendors = this._store.add(new Emitter());
    this.onDidChangeLanguageModelVendors = this._onDidChangeLanguageModelVendors.event;
    this._modelsGroups = /* @__PURE__ */ new Map();
    this._modelCache = /* @__PURE__ */ new Map();
    this._resolveLMSequencer = new SequencerByKey();
    this._modelConfigurations = /* @__PURE__ */ new Map();
    this._onLanguageModelChange = this._store.add(new Emitter());
    this.onDidChangeLanguageModels = this._onLanguageModelChange.event;
    this._recentlyUsedModelIds = [];
    this._pinnedModelIds = [];
    this._hiddenModelIds = /* @__PURE__ */ new Set();
    this._onDidChangeModelsControlManifest = this._store.add(new Emitter());
    this.onDidChangeModelsControlManifest = this._onDidChangeModelsControlManifest.event;
    this._onDidChangePinnedModels = this._store.add(new Emitter());
    this.onDidChangePinnedModels = this._onDidChangePinnedModels.event;
    this._onDidChangeModelVisibility = this._store.add(new Emitter());
    this.onDidChangeModelVisibility = this._onDidChangeModelVisibility.event;
    this._modelsControlManifest = { free: {}, paid: {} };
    this._chatControlDisposed = false;
    this._restrictedChatParticipants = observableValue(this, /* @__PURE__ */ Object.create(null));
    this.restrictedChatParticipants = this._restrictedChatParticipants;
    this._hasUserSelectableModels = ChatContextKeys.languageModelsAreUserSelectable.bindTo(_contextKeyService);
    this._hasNonCopilotUserSelectableModels = ChatContextKeys.nonCopilotLanguageModelsAreUserSelectable.bindTo(_contextKeyService);
    this._recentlyUsedModelIds = this._readRecentlyUsedModels();
    this._pinnedModelIds = this._readPinnedModels();
    this._readVisibility();
    this._initChatControlData();
    this._store.add(this.onDidChangeLanguageModels(() => {
      let hasUserSelectable = false;
      let hasNonCopilotUserSelectable = false;
      for (const model of this._modelCache.values()) {
        if (model.isUserSelectable === false) {
          continue;
        }
        hasUserSelectable = true;
        if (model.vendor !== COPILOT_VENDOR_ID) {
          hasNonCopilotUserSelectable = true;
          break;
        }
      }
      this._hasUserSelectableModels.set(hasUserSelectable);
      this._hasNonCopilotUserSelectableModels.set(hasNonCopilotUserSelectable);
      this._refreshModelsControlManifest();
    }));
    this._store.add(this._languageModelsConfigurationService.onDidChangeLanguageModelGroups((changedGroups) => this._onDidChangeLanguageModelGroups(changedGroups)));
    this._store.add(languageModelChatProviderExtensionPoint.setHandler((extensions, { added, removed }) => {
      const addedVendors = [];
      const removedVendors = [];
      for (const extension of added) {
        for (const item of Iterable.wrap(extension.value)) {
          if (this._vendors.has(item.vendor)) {
            extension.collector.error(localize("vscode.extension.contributes.languageModels.vendorAlreadyRegistered", "The vendor '{0}' is already registered and cannot be registered twice", item.vendor));
            continue;
          }
          if (isFalsyOrWhitespace(item.vendor)) {
            extension.collector.error(localize("vscode.extension.contributes.languageModels.emptyVendor", "The vendor field cannot be empty."));
            continue;
          }
          if (item.vendor.trim() !== item.vendor) {
            extension.collector.error(localize("vscode.extension.contributes.languageModels.whitespaceVendor", "The vendor field cannot start or end with whitespace."));
            continue;
          }
          addedVendors.push(item);
        }
      }
      for (const extension of removed) {
        for (const item of Iterable.wrap(extension.value)) {
          removedVendors.push(item);
        }
      }
      this.deltaLanguageModelChatProviderDescriptors(addedVendors, removedVendors);
    }));
  }
  deltaLanguageModelChatProviderDescriptors(added, removed) {
    const addedVendorIds = [];
    const removedVendorIds = [];
    for (const item of added) {
      if (this._vendors.has(item.vendor)) {
        this._logService.error(`The vendor '${item.vendor}' is already registered and cannot be registered twice`);
        continue;
      }
      if (isFalsyOrWhitespace(item.vendor)) {
        this._logService.error("The vendor field cannot be empty.");
        continue;
      }
      if (item.vendor.trim() !== item.vendor) {
        this._logService.error("The vendor field cannot start or end with whitespace.");
        continue;
      }
      const vendor = {
        vendor: item.vendor,
        displayName: item.displayName,
        configuration: item.configuration,
        managementCommand: item.managementCommand,
        deprecation: item.deprecation,
        when: item.when,
        isDefault: item.vendor === COPILOT_VENDOR_ID
      };
      this._vendors.set(item.vendor, vendor);
      addedVendorIds.push(item.vendor);
    }
    for (const item of removed) {
      this._vendors.delete(item.vendor);
      this._providers.delete(item.vendor);
      this._clearModelCache(item.vendor);
      this._modelsGroups.delete(item.vendor);
      removedVendorIds.push(item.vendor);
    }
    for (const [vendor, _] of this._providers) {
      if (!this._vendors.has(vendor)) {
        this._providers.delete(vendor);
      }
    }
    if (addedVendorIds.length > 0 || removedVendorIds.length > 0) {
      this._onDidChangeLanguageModelVendors.fire([...addedVendorIds, ...removedVendorIds]);
      if (removedVendorIds.length > 0) {
        for (const vendor of removedVendorIds) {
          this._onLanguageModelChange.fire(vendor);
        }
      }
    }
  }
  async _onDidChangeLanguageModelGroups(changedGroups) {
    const changedVendors = new Set(changedGroups.map((g) => g.vendor));
    await Promise.all(Array.from(changedVendors).map((vendor) => this._resolveAllLanguageModels(vendor, true)));
  }
  getVendors() {
    return Array.from(this._vendors.values()).filter((vendor) => {
      if (!vendor.when) {
        return true;
      }
      const whenClause = ContextKeyExpr.deserialize(vendor.when);
      return whenClause ? this._contextKeyService.contextMatchesRules(whenClause) : false;
    });
  }
  getLanguageModelIds() {
    return Array.from(this._modelCache.keys());
  }
  lookupLanguageModel(modelIdentifier) {
    return this._modelCache.get(modelIdentifier);
  }
  lookupLanguageModelByQualifiedName(referenceName) {
    for (const [identifier, model] of this._modelCache.entries()) {
      if (ILanguageModelChatMetadata.matchesQualifiedName(referenceName, model)) {
        return { metadata: model, identifier };
      }
    }
    return void 0;
  }
  async _resolveAllLanguageModels(vendorId, silent) {
    const vendor = this._vendors.get(vendorId);
    if (!vendor) {
      return;
    }
    let provider = this._providers.get(vendorId);
    if (!provider) {
      await this._extensionService.activateByEvent(`onLanguageModelChatProvider:${vendorId}`);
      provider = this._providers.get(vendorId);
    }
    if (!provider) {
      this._logService.warn(`[LM] No provider registered for vendor ${vendorId}`);
      return;
    }
    return this._resolveLMSequencer.queue(vendorId, async () => {
      const allModels = [];
      const languageModelsGroups = [];
      try {
        const models = await provider.provideLanguageModelChatInfo({ silent }, CancellationToken.None);
        if (models.length) {
          allModels.push(...models);
          const modelIdentifiers = [];
          for (const m of models) {
            if (vendor.isDefault) {
              if (m.metadata.isUserSelectable !== false) {
                modelIdentifiers.push(m.identifier);
              } else {
                this._logService.trace(`[LM] Skipping model ${m.identifier} from model picker as it is not user selectable.`);
              }
            } else {
              modelIdentifiers.push(m.identifier);
            }
          }
          languageModelsGroups.push({ modelIdentifiers });
        }
      } catch (error) {
        languageModelsGroups.push({
          modelIdentifiers: [],
          status: {
            message: getErrorMessage(error),
            severity: Severity.Error
          }
        });
      }
      const groups = this._languageModelsConfigurationService.getLanguageModelsProviderGroups();
      const perModelConfigurations = /* @__PURE__ */ new Map();
      for (const group of groups) {
        if (group.vendor !== vendorId) {
          continue;
        }
        if (!vendor.configuration && allModels.length > 0) {
          if (group.settings) {
            for (const model of allModels) {
              const modelConfig = group.settings[model.metadata.id];
              if (modelConfig) {
                perModelConfigurations.set(model.identifier, { ...modelConfig });
              }
            }
          }
          languageModelsGroups.push({ group, modelIdentifiers: [] });
          continue;
        }
        const configuration = await this._resolveConfiguration(group, vendor.configuration);
        try {
          const models = await provider.provideLanguageModelChatInfo({ group: group.name, silent, configuration }, CancellationToken.None);
          if (models.length) {
            for (let i = 0; i < models.length; i++) {
              if (!models[i].metadata.detail) {
                models[i] = { ...models[i], metadata: { ...models[i].metadata, detail: group.name } };
              }
            }
            allModels.push(...models);
            languageModelsGroups.push({ group, modelIdentifiers: models.map((m) => m.identifier) });
          }
          if (group.settings) {
            for (const model of models) {
              const modelConfig = group.settings[model.metadata.id];
              if (modelConfig) {
                perModelConfigurations.set(model.identifier, { ...modelConfig });
              }
            }
          }
        } catch (error) {
          languageModelsGroups.push({
            group,
            modelIdentifiers: [],
            status: {
              message: getErrorMessage(error),
              severity: Severity.Error
            }
          });
        }
      }
      const wasResolved = this._modelsGroups.has(vendorId);
      const oldGroups = this._modelsGroups.get(vendorId) ?? [];
      this._modelsGroups.set(vendorId, languageModelsGroups);
      const oldModels = this._clearModelCache(vendorId);
      let hasChanges = !wasResolved;
      for (const model of allModels) {
        if (this._modelCache.has(model.identifier)) {
          this._logService.warn(`[LM] Model ${model.identifier} is already registered. Skipping.`);
          continue;
        }
        this._modelCache.set(model.identifier, model.metadata);
        hasChanges = hasChanges || !equals(oldModels.get(model.identifier), model.metadata);
        oldModels.delete(model.identifier);
      }
      this._logService.trace(`[LM] Resolved language models for vendor ${vendorId}`, allModels);
      hasChanges = hasChanges || oldModels.size > 0;
      if (!hasChanges) {
        hasChanges = this._hasGroupStructureChanged(oldGroups, languageModelsGroups);
      }
      this._clearModelConfigurations(vendorId);
      for (const [identifier, config] of perModelConfigurations) {
        if (this._modelCache.has(identifier)) {
          this._modelConfigurations.set(identifier, config);
        }
      }
      if (hasChanges) {
        this._onLanguageModelChange.fire(vendorId);
      } else {
        this._logService.trace(`[LM] No changes in language models for vendor ${vendorId}`);
      }
    });
  }
  _hasGroupStructureChanged(oldGroups, newGroups) {
    if (oldGroups.length !== newGroups.length) {
      return true;
    }
    for (let i = 0; i < oldGroups.length; i++) {
      const oldGroup = oldGroups[i];
      const newGroup = newGroups[i];
      if (oldGroup.group?.name !== newGroup.group?.name || oldGroup.group?.vendor !== newGroup.group?.vendor || oldGroup.status?.message !== newGroup.status?.message || oldGroup.status?.severity !== newGroup.status?.severity || oldGroup.modelIdentifiers.length !== newGroup.modelIdentifiers.length) {
        return true;
      }
    }
    return false;
  }
  getLanguageModelGroups(vendor) {
    return this._modelsGroups.get(vendor) ?? [];
  }
  hasResolvedVendor(vendor) {
    return this._modelsGroups.has(vendor);
  }
  async selectLanguageModels(selector) {
    if (selector.vendor) {
      await this._resolveAllLanguageModels(selector.vendor, true);
    } else {
      const allVendors = Array.from(this._vendors.keys());
      await Promise.all(allVendors.map((vendor) => this._resolveAllLanguageModels(vendor, true)));
    }
    const result = [];
    for (const [internalModelIdentifier, model] of this._modelCache) {
      if ((selector.vendor === void 0 || model.vendor === selector.vendor) && (selector.family === void 0 || model.family === selector.family) && (selector.version === void 0 || model.version === selector.version) && (selector.id === void 0 || model.id === selector.id)) {
        result.push(internalModelIdentifier);
      }
    }
    this._logService.trace("[LM] selected language models", selector, result);
    return result;
  }
  registerLanguageModelProvider(vendor, provider) {
    this._logService.trace("[LM] registering language model provider", vendor, provider);
    if (!this._vendors.has(vendor)) {
      throw new Error(`Chat model provider uses UNKNOWN vendor ${vendor}.`);
    }
    if (this._providers.has(vendor)) {
      throw new Error(`Chat model provider for vendor ${vendor} is already registered.`);
    }
    this._providers.set(vendor, provider);
    const modelChangeListener = provider.onDidChange(() => {
      this._resolveAllLanguageModels(vendor, true);
    });
    return toDisposable(() => {
      this._logService.trace("[LM] UNregistered language model provider", vendor);
      this._clearModelCache(vendor);
      this._modelsGroups.delete(vendor);
      this._providers.delete(vendor);
      modelChangeListener.dispose();
    });
  }
  async sendChatRequest(modelId, from, messages, options, token) {
    const metadata = this._modelCache.get(modelId);
    const provider = this._providers.get(metadata?.vendor || "");
    if (!provider) {
      throw new Error(`Chat provider for model ${modelId} is not registered.`);
    }
    if (metadata) {
      this._logProviderUsageTelemetry(metadata);
      this._maybeShowProviderDeprecationNotice(metadata);
    }
    const configuration = this.getModelConfiguration(modelId);
    const mergedOptions = configuration ? { ...options, configuration: { ...configuration, ...options.configuration } } : options;
    return provider.sendChatRequest(modelId, messages, from, mergedOptions, token);
  }
  /**
   * When a chat request is made against a deprecated provider (one that contributes a
   * `deprecation.link`), prompt the user once per session to install the replacement
   * extension. The notification can be dismissed, and offers a "Don't Show Again" choice that
   * is persisted across sessions via the notification service's `neverShowAgain` support.
   */
  _maybeShowProviderDeprecationNotice(metadata) {
    const vendor = this._vendors.get(metadata.vendor);
    const link = vendor?.deprecation?.link;
    if (!link) {
      return;
    }
    if (this._deprecationNoticeShownVendors.has(metadata.vendor)) {
      return;
    }
    this._deprecationNoticeShownVendors.add(metadata.vendor);
    const providerName = (vendor.displayName || metadata.vendor).replace(/\s*\(deprecated\)\s*$/i, "");
    this._notificationService.prompt(
      Severity.Info,
      localize("chat.providerDeprecation.message", "The internal {0} language model provider is being deprecated. Please migrate to the official extension.", providerName),
      [{
        label: localize("chat.providerDeprecation.install", "Install Extension"),
        run: () => {
          this._openerService.open(resolveProviderDeprecationLink(link, this._productService.urlProtocol));
        }
      }],
      {
        neverShowAgain: { id: `chat.providerDeprecation.${metadata.vendor}`, scope: NeverShowAgainScope.APPLICATION }
      }
    );
  }
  /**
   * Reports which in-built BYOK provider (or third-party extension) backs a model request. First-party
   * Copilot models are intentionally not reported here (see {@link getByokProviderTelemetryName}).
   */
  _logProviderUsageTelemetry(metadata) {
    const provider = getByokProviderTelemetryName(metadata?.vendor, metadata?.extension);
    if (!provider) {
      return;
    }
    this._telemetryService.publicLog2("chat.languageModelRequest", {
      provider,
      isBYOK: !!metadata?.isBYOK
    });
  }
  _resolveModelConfigurationWithDefaults(modelId, metadata) {
    const userConfig = this._modelConfigurations.get(modelId);
    const schema = metadata?.configurationSchema;
    if (!schema?.properties && !userConfig) {
      return void 0;
    }
    const defaults = {};
    if (schema?.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (propSchema.default !== void 0) {
          defaults[key] = propSchema.default;
        }
      }
    }
    if (!userConfig && Object.keys(defaults).length === 0) {
      return void 0;
    }
    return { ...defaults, ...userConfig };
  }
  computeTokenLength(modelId, message, token) {
    const model = this._modelCache.get(modelId);
    if (!model) {
      throw new Error(`Chat model ${modelId} could not be found.`);
    }
    const provider = this._providers.get(model.vendor);
    if (!provider) {
      throw new Error(`Chat provider for model ${modelId} is not registered.`);
    }
    return provider.provideTokenCount(modelId, message, token);
  }
  getModelConfiguration(modelId) {
    const metadata = this._modelCache.get(modelId);
    return this._resolveModelConfigurationWithDefaults(modelId, metadata);
  }
  async setModelConfiguration(modelId, values) {
    const metadata = this._modelCache.get(modelId);
    if (!metadata) {
      return;
    }
    const allGroups = this._languageModelsConfigurationService.getLanguageModelsProviderGroups();
    let group;
    group = allGroups.find((g) => g.vendor === metadata.vendor && g.settings?.[metadata.id] !== void 0);
    if (!group) {
      const vendorGroups = this._modelsGroups.get(metadata.vendor);
      const containingGroup = vendorGroups?.find((vg) => vg.modelIdentifiers.includes(modelId) && vg.group)?.group;
      if (containingGroup) {
        group = allGroups.find((g) => g.vendor === containingGroup.vendor && g.name === containingGroup.name) ?? containingGroup;
      }
    }
    if (!group) {
      group = allGroups.find((g) => g.vendor === metadata.vendor);
    }
    const existingConfig = this._modelConfigurations.get(modelId) ?? {};
    const updatedConfig = { ...existingConfig, ...values };
    const schema = metadata.configurationSchema;
    if (schema?.properties) {
      for (const [key, value] of Object.entries(updatedConfig)) {
        const propSchema = schema.properties[key];
        if (propSchema?.default !== void 0 && propSchema.default === value) {
          delete updatedConfig[key];
        }
      }
    }
    if (group) {
      const existingSettings = group.settings ?? {};
      let updatedSettings;
      if (Object.keys(updatedConfig).length === 0) {
        updatedSettings = { ...existingSettings };
        delete updatedSettings[metadata.id];
      } else {
        updatedSettings = { ...existingSettings, [metadata.id]: updatedConfig };
      }
      const updatedGroup = {
        ...group,
        settings: Object.keys(updatedSettings).length > 0 ? updatedSettings : void 0
      };
      if (!updatedGroup.settings && Object.keys(updatedGroup).filter((k) => k !== "name" && k !== "vendor" && k !== "range" && k !== "modelsRange" && k !== "settings").length === 0) {
        await this._languageModelsConfigurationService.removeLanguageModelsProviderGroup(group);
      } else {
        await this._languageModelsConfigurationService.updateLanguageModelsProviderGroup(group, updatedGroup);
      }
    } else if (Object.keys(updatedConfig).length > 0) {
      const vendor = this._vendors.get(metadata.vendor);
      if (!vendor) {
        return;
      }
      const newGroup = {
        name: vendor.displayName,
        vendor: metadata.vendor,
        settings: { [metadata.id]: updatedConfig }
      };
      await this._languageModelsConfigurationService.addLanguageModelsProviderGroup(newGroup);
    }
    if (Object.keys(updatedConfig).length > 0) {
      this._modelConfigurations.set(modelId, updatedConfig);
    } else {
      this._modelConfigurations.delete(modelId);
    }
    this._onLanguageModelChange.fire(metadata.vendor);
  }
  getModelConfigurationActions(modelId) {
    const metadata = this._modelCache.get(modelId);
    const currentConfig = this._modelConfigurations.get(modelId) ?? {};
    return createModelConfigurationActions(
      metadata?.configurationSchema,
      currentConfig,
      (key, value) => this.setModelConfiguration(modelId, { [key]: value })
    );
  }
  async configureLanguageModelsProviderGroup(vendorId, providerGroupName) {
    const vendor = this.getVendors().find(({ vendor: vendor2 }) => vendor2 === vendorId);
    if (!vendor) {
      throw new Error(`Vendor ${vendorId} not found.`);
    }
    if (vendor.managementCommand) {
      await this._resolveAllLanguageModels(vendor.vendor, false);
      return;
    }
    const languageModelProviderGroups = this._languageModelsConfigurationService.getLanguageModelsProviderGroups();
    const existing = languageModelProviderGroups.find((g) => g.vendor === vendorId && g.name === providerGroupName);
    const name = await this.promptForName(languageModelProviderGroups, vendor, existing);
    if (!name) {
      return;
    }
    const existingConfiguration = existing ? await this._resolveConfiguration(existing, vendor.configuration) : void 0;
    try {
      const configuration = vendor.configuration ? await this.promptForConfiguration(name, vendor.configuration, existingConfiguration) : void 0;
      if (vendor.configuration && !configuration) {
        return;
      }
      const languageModelProviderGroup = await this._resolveLanguageModelProviderGroup(name, vendorId, configuration, vendor.configuration);
      const saved = existing ? await this._languageModelsConfigurationService.updateLanguageModelsProviderGroup(existing, languageModelProviderGroup) : await this._languageModelsConfigurationService.addLanguageModelsProviderGroup(languageModelProviderGroup);
      if (vendor.configuration && this.requireConfiguring(vendor.configuration)) {
        const snippet = this.getSnippetForFirstUnconfiguredProperty(configuration ?? {}, vendor.configuration);
        await this._languageModelsConfigurationService.configureLanguageModels({ group: saved, snippet });
      }
    } catch (error) {
      if (isCancellationError(error)) {
        return;
      }
      throw error;
    }
  }
  async renameLanguageModelsProviderGroup(vendorId, providerGroupName) {
    const vendor = this.getVendors().find(({ vendor: vendor2 }) => vendor2 === vendorId);
    if (!vendor) {
      throw new Error(`Vendor ${vendorId} not found.`);
    }
    const languageModelProviderGroups = this._languageModelsConfigurationService.getLanguageModelsProviderGroups();
    const existing = languageModelProviderGroups.find((group) => group.vendor === vendorId && group.name === providerGroupName);
    if (!existing) {
      throw new Error(`Language model provider group ${providerGroupName} for vendor ${vendorId} not found.`);
    }
    const name = await this.promptForName(languageModelProviderGroups, vendor, existing);
    if (!name || name === existing.name) {
      return;
    }
    await this._languageModelsConfigurationService.updateLanguageModelsProviderGroup(existing, { ...existing, name });
  }
  async updateLanguageModelsProviderGroupApiKey(vendorId, providerGroupName) {
    const vendor = this.getVendors().find(({ vendor: vendor2 }) => vendor2 === vendorId);
    const schema = vendor?.configuration;
    const apiKeySchema = schema?.properties?.apiKey;
    if (!vendor || !schema || !apiKeySchema) {
      return;
    }
    const existing = this._languageModelsConfigurationService.getLanguageModelsProviderGroups().find((group) => group.vendor === vendorId && group.name === providerGroupName);
    if (!existing) {
      throw new Error(`Language model provider group ${providerGroupName} for vendor ${vendorId} not found.`);
    }
    try {
      const existingConfiguration = await this._resolveConfiguration(existing, schema);
      const apiKey = await this.promptForValue(existing.name, "apiKey", apiKeySchema, !!schema.required?.includes("apiKey"), existingConfiguration);
      if (apiKey === void 0 || apiKey === existingConfiguration.apiKey) {
        return;
      }
      const configuration = { ...existingConfiguration, apiKey };
      const updated = {
        ...await this._resolveLanguageModelProviderGroup(existing.name, vendorId, configuration, schema),
        settings: existing.settings
      };
      await this._languageModelsConfigurationService.updateLanguageModelsProviderGroup(existing, updated);
      await this._deleteSecretsInConfiguration(existing, schema);
    } catch (error) {
      if (isCancellationError(error)) {
        return;
      }
      throw error;
    }
  }
  async addLanguageModelsProviderGroupModel(vendorId, providerGroupName) {
    const vendor = this.getVendors().find(({ vendor: vendor2 }) => vendor2 === vendorId);
    const schema = vendor?.configuration;
    const modelsSchema = schema?.properties?.models;
    if (!vendor || !modelsSchema) {
      return;
    }
    const group = this._languageModelsConfigurationService.getLanguageModelsProviderGroups().find((group2) => group2.vendor === vendorId && group2.name === providerGroupName);
    if (!group) {
      throw new Error(`Language model provider group ${providerGroupName} for vendor ${vendorId} not found.`);
    }
    const hasModels = Array.isArray(group.models);
    const snippet = hasModels ? this.getSnippetForArrayItem(modelsSchema) : this.getSnippetForProperty("models", modelsSchema);
    if (!snippet) {
      return;
    }
    await this._languageModelsConfigurationService.configureLanguageModels({
      group,
      snippet,
      snippetTarget: hasModels ? "models" : "group"
    });
  }
  async openLanguageModelsProviderGroupSettings(vendorId, providerGroupName) {
    const group = this._languageModelsConfigurationService.getLanguageModelsProviderGroups().find((group2) => group2.vendor === vendorId && group2.name === providerGroupName);
    if (!group) {
      throw new Error(`Language model provider group ${providerGroupName} for vendor ${vendorId} not found.`);
    }
    await this._languageModelsConfigurationService.configureLanguageModels({ group });
  }
  async configureModel(modelId) {
    const metadata = this._modelCache.get(modelId);
    if (!metadata || !metadata.configurationSchema) {
      return;
    }
    const vendorGroups = this._modelsGroups.get(metadata.vendor);
    let group;
    if (vendorGroups) {
      for (const vg of vendorGroups) {
        if (vg.modelIdentifiers.includes(modelId) && vg.group) {
          group = vg.group;
          break;
        }
      }
    }
    if (!group) {
      const vendor = this.getVendors().find((v) => v.vendor === metadata.vendor);
      if (!vendor) {
        return;
      }
      const groupName = vendor.displayName;
      const newGroup = { name: groupName, vendor: metadata.vendor, settings: { [metadata.id]: {} } };
      group = await this._languageModelsConfigurationService.addLanguageModelsProviderGroup(newGroup);
      await this._resolveAllLanguageModels(metadata.vendor, true);
    }
    const snippet = this._getModelConfigurationSnippet(metadata.id, metadata.configurationSchema);
    await this._languageModelsConfigurationService.configureLanguageModels({ group, snippet });
  }
  _getModelConfigurationSnippet(modelId, schema) {
    const properties = [];
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (propSchema.defaultSnippets?.[0]) {
          const snippet = propSchema.defaultSnippets[0];
          let bodyText = snippet.bodyText ?? JSON.stringify(snippet.body, null, "			");
          bodyText = bodyText.replace(/"(\^[^"]*)"/g, (_, value) => value.substring(1));
          properties.push(`			"${key}": ${bodyText}`);
        } else if (propSchema.default !== void 0) {
          properties.push(`			"${key}": ${JSON.stringify(propSchema.default)}`);
        } else {
          properties.push(`			"${key}": \${${key}}`);
        }
      }
    }
    const modelContent = properties.length > 0 ? `{
${properties.join(",\n")}
		}` : "{\n			$0\n		}";
    return `"settings": {
		"${modelId}": ${modelContent}
	}`;
  }
  async addLanguageModelsProviderGroup(name, vendorId, configuration) {
    const vendor = this.getVendors().find(({ vendor: vendor2 }) => vendor2 === vendorId);
    if (!vendor) {
      throw new Error(`Vendor ${vendorId} not found.`);
    }
    const languageModelProviderGroup = await this._resolveLanguageModelProviderGroup(name, vendorId, configuration, vendor.configuration);
    await this._languageModelsConfigurationService.addLanguageModelsProviderGroup(languageModelProviderGroup);
  }
  async removeLanguageModelsProviderGroup(vendorId, providerGroupName) {
    const vendor = this.getVendors().find(({ vendor: vendor2 }) => vendor2 === vendorId);
    if (!vendor) {
      throw new Error(`Vendor ${vendorId} not found.`);
    }
    const languageModelProviderGroups = this._languageModelsConfigurationService.getLanguageModelsProviderGroups();
    const existing = languageModelProviderGroups.find((g) => g.vendor === vendorId && g.name === providerGroupName);
    if (!existing) {
      throw new Error(`Language model provider group ${providerGroupName} for vendor ${vendorId} not found.`);
    }
    await this._deleteSecretsInConfiguration(existing, vendor.configuration);
    await this._languageModelsConfigurationService.removeLanguageModelsProviderGroup(existing);
  }
  requireConfiguring(schema) {
    if (schema.additionalProperties) {
      return true;
    }
    if (!schema.properties) {
      return false;
    }
    for (const property of Object.keys(schema.properties)) {
      if (!this.canPromptForProperty(schema.properties[property])) {
        return true;
      }
    }
    return false;
  }
  getSnippetForFirstUnconfiguredProperty(configuration, schema) {
    if (!schema.properties) {
      return void 0;
    }
    for (const property of Object.keys(schema.properties)) {
      if (configuration[property] === void 0) {
        const propertySchema = schema.properties[property];
        const snippet = this.getSnippetForProperty(property, propertySchema);
        if (snippet) {
          return snippet;
        }
      }
    }
    return void 0;
  }
  getSnippetForProperty(property, propertySchema) {
    const bodyText = this.getDefaultSnippetBodyText(propertySchema);
    return bodyText ? `"${property}": ${bodyText}` : void 0;
  }
  getSnippetForArrayItem(propertySchema) {
    return this.getDefaultSnippetBodyText(propertySchema, true);
  }
  getDefaultSnippetBodyText(propertySchema, arrayItem = false) {
    const snippet = propertySchema.defaultSnippets?.[0];
    if (!snippet) {
      return void 0;
    }
    const bodyText = arrayItem ? Array.isArray(snippet.body) && snippet.body.length > 0 ? JSON.stringify(snippet.body[0], null, "	") : void 0 : snippet.bodyText ?? JSON.stringify(snippet.body, null, "	");
    if (!bodyText) {
      return void 0;
    }
    return bodyText.replace(/"(\^[^"]*)"/g, (_, value) => value.substring(1));
  }
  async promptForName(languageModelProviderGroups, vendor, existing) {
    let providerGroupName = existing?.name;
    if (!providerGroupName) {
      providerGroupName = vendor.displayName;
      let count = 1;
      while (languageModelProviderGroups.some((g) => g.vendor === vendor.vendor && g.name === providerGroupName)) {
        count++;
        providerGroupName = `${vendor.displayName} ${count}`;
      }
    }
    let result;
    const disposables = new DisposableStore();
    try {
      await new Promise((resolve) => {
        const inputBox = disposables.add(this._quickInputService.createInputBox());
        inputBox.title = localize("configureLanguageModelGroup", "Group Name");
        inputBox.placeholder = localize("languageModelGroupName", "Enter a name for the group");
        inputBox.value = providerGroupName;
        inputBox.ignoreFocusOut = true;
        disposables.add(inputBox.onDidChangeValue((value) => {
          if (!value) {
            inputBox.validationMessage = localize("enterName", "Please enter a name");
            inputBox.severity = Severity.Error;
            return;
          }
          if (languageModelProviderGroups.some((group) => group !== existing && group.vendor === vendor.vendor && group.name === value)) {
            inputBox.validationMessage = localize("nameExists", "A language models group with this name already exists");
            inputBox.severity = Severity.Error;
            return;
          }
          inputBox.validationMessage = void 0;
          inputBox.severity = Severity.Ignore;
        }));
        disposables.add(inputBox.onDidAccept(async () => {
          result = inputBox.value;
          inputBox.hide();
        }));
        disposables.add(inputBox.onDidHide(() => resolve()));
        inputBox.show();
      });
    } finally {
      disposables.dispose();
    }
    return result;
  }
  async promptForConfiguration(groupName, configuration, existing) {
    if (!configuration.properties) {
      return;
    }
    const result = existing ? { ...existing } : {};
    for (const property of Object.keys(configuration.properties)) {
      const propertySchema = configuration.properties[property];
      const required = !!configuration.required?.includes(property);
      const value = await this.promptForValue(groupName, property, propertySchema, required, existing);
      if (value !== void 0) {
        result[property] = value;
      }
    }
    return result;
  }
  async promptForValue(groupName, property, propertySchema, required, existing) {
    if (!propertySchema) {
      return void 0;
    }
    if (!this.canPromptForProperty(propertySchema)) {
      return void 0;
    }
    if (propertySchema.type === "array" && propertySchema.items && !Array.isArray(propertySchema.items) && propertySchema.items.enum) {
      const selectedItems = await this.promptForArray(groupName, property, propertySchema);
      if (selectedItems === void 0) {
        return void 0;
      }
      return selectedItems;
    }
    if (propertySchema.type === "string" && Array.isArray(propertySchema.enum) && propertySchema.enum.length > 0) {
      return this.promptForEnum(groupName, property, propertySchema, existing);
    }
    const value = await this.promptForInput(groupName, property, propertySchema, required, existing);
    if (value === void 0) {
      return void 0;
    }
    return value;
  }
  canPromptForProperty(propertySchema) {
    if (!propertySchema || typeof propertySchema === "boolean") {
      return false;
    }
    if (propertySchema.type === "array" && propertySchema.items && !Array.isArray(propertySchema.items) && propertySchema.items.enum) {
      return true;
    }
    if (propertySchema.type === "string" || propertySchema.type === "number" || propertySchema.type === "integer" || propertySchema.type === "boolean") {
      return true;
    }
    return false;
  }
  getDescriptionPlaintext(propertySchema) {
    if (propertySchema.description) {
      return propertySchema.description;
    }
    const md = propertySchema.markdownDescription;
    if (!md) {
      return void 0;
    }
    return md.replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  }
  async promptForArray(groupName, property, propertySchema) {
    if (!propertySchema.items || Array.isArray(propertySchema.items) || !propertySchema.items.enum) {
      return void 0;
    }
    const items = propertySchema.items.enum;
    const disposables = new DisposableStore();
    try {
      return await new Promise((resolve) => {
        const quickPick = disposables.add(this._quickInputService.createQuickPick());
        quickPick.title = `${groupName}: ${propertySchema.title ?? property}`;
        quickPick.items = items.map((item) => ({ label: item }));
        quickPick.placeholder = this.getDescriptionPlaintext(propertySchema) ?? localize("selectValue", "Select value for {0}", property);
        quickPick.canSelectMany = true;
        quickPick.ignoreFocusOut = true;
        disposables.add(quickPick.onDidAccept(() => {
          resolve(quickPick.selectedItems.map((item) => item.label));
          quickPick.hide();
        }));
        disposables.add(quickPick.onDidHide(() => {
          resolve(void 0);
        }));
        quickPick.show();
      });
    } finally {
      disposables.dispose();
    }
  }
  async promptForEnum(groupName, property, propertySchema, existing) {
    const values = propertySchema.enum;
    if (!Array.isArray(values) || values.length === 0) {
      return void 0;
    }
    const enumDescriptions = propertySchema.enumDescriptions;
    const enumItemLabels = Array.isArray(propertySchema.enumItemLabels) ? propertySchema.enumItemLabels : void 0;
    const initial = existing?.[property] !== void 0 ? String(existing[property]) : propertySchema.default !== void 0 ? String(propertySchema.default) : void 0;
    const items = values.map((value, index) => ({
      label: enumItemLabels?.[index] ?? String(value),
      description: enumDescriptions?.[index],
      id: String(value)
    }));
    const disposables = new DisposableStore();
    try {
      return await new Promise((resolve) => {
        const quickPick = disposables.add(this._quickInputService.createQuickPick());
        quickPick.title = `${groupName}: ${propertySchema.title ?? property}`;
        quickPick.items = items;
        quickPick.placeholder = this.getDescriptionPlaintext(propertySchema) ?? localize("selectValue", "Select value for {0}", property);
        quickPick.ignoreFocusOut = true;
        if (initial !== void 0) {
          const match = items.find((item) => item.id === initial);
          if (match) {
            quickPick.activeItems = [match];
          }
        }
        disposables.add(quickPick.onDidAccept(() => {
          const selected = quickPick.selectedItems[0];
          resolve(selected?.id);
          quickPick.hide();
        }));
        disposables.add(quickPick.onDidHide(() => {
          resolve(void 0);
        }));
        quickPick.show();
      });
    } finally {
      disposables.dispose();
    }
  }
  async promptForInput(groupName, property, propertySchema, required, existing) {
    const disposables = new DisposableStore();
    try {
      const validate = (value2) => {
        if (!value2 && required) {
          return localize("valueRequired", "Value is required");
        }
        return void 0;
      };
      const value = await new Promise((resolve, reject) => {
        const inputBox = disposables.add(this._quickInputService.createInputBox());
        inputBox.title = `${groupName}: ${propertySchema.title ?? property}`;
        inputBox.placeholder = localize("enterValue", "Enter value for {0}", property);
        inputBox.password = !!propertySchema.secret;
        inputBox.ignoreFocusOut = true;
        if (existing?.[property]) {
          inputBox.value = String(existing?.[property]);
        } else if (propertySchema.default) {
          inputBox.value = String(propertySchema.default);
        }
        const promptText = this.getDescriptionPlaintext(propertySchema);
        if (promptText) {
          inputBox.prompt = promptText;
        }
        disposables.add(inputBox.onDidChangeValue((value2) => {
          const message = validate(value2);
          if (message) {
            inputBox.validationMessage = message;
            inputBox.severity = Severity.Error;
          } else {
            inputBox.validationMessage = void 0;
            inputBox.severity = Severity.Ignore;
          }
        }));
        disposables.add(inputBox.onDidAccept(() => {
          const message = validate(inputBox.value);
          if (message) {
            inputBox.validationMessage = message;
            inputBox.severity = Severity.Error;
            return;
          }
          resolve(inputBox.value);
          inputBox.hide();
        }));
        disposables.add(inputBox.onDidHide((e) => {
          if (e.reason === QuickInputHideReason.Gesture) {
            reject(new CancellationError());
          } else {
            resolve(void 0);
          }
        }));
        inputBox.show();
      });
      if (!value) {
        return void 0;
      }
      if (propertySchema.type === "number" || propertySchema.type === "integer") {
        return Number(value);
      } else if (propertySchema.type === "boolean") {
        return value === "true";
      } else {
        return value;
      }
    } finally {
      disposables.dispose();
    }
  }
  encodeSecretKey(property) {
    return format(LanguageModelsService.SECRET_INPUT, property);
  }
  decodeSecretKey(secretInput) {
    if (!isString(secretInput)) {
      return void 0;
    }
    return secretInput.substring(secretInput.indexOf(":") + 1, secretInput.length - 1);
  }
  _clearModelCache(vendor) {
    const removed = /* @__PURE__ */ new Map();
    for (const [id, model] of this._modelCache.entries()) {
      if (model.vendor === vendor) {
        removed.set(id, model);
        this._modelCache.delete(id);
      }
    }
    return removed;
  }
  _clearModelConfigurations(vendor) {
    for (const [id] of this._modelConfigurations) {
      if (this._modelCache.get(id)?.vendor === vendor || id.startsWith(`${vendor}/`)) {
        this._modelConfigurations.delete(id);
      }
    }
  }
  async _resolveConfiguration(group, schema) {
    if (!schema) {
      return {};
    }
    const result = {};
    for (const key in group) {
      if (key === "vendor" || key === "name" || key === "range" || key === "modelsRange" || key === "settings") {
        continue;
      }
      let value = group[key];
      if (schema.properties?.[key]?.secret) {
        const secretKey = this.decodeSecretKey(value);
        value = secretKey ? await this._secretStorageService.get(secretKey) : void 0;
      }
      result[key] = value;
    }
    return result;
  }
  async _resolveLanguageModelProviderGroup(name, vendor, configuration, schema) {
    if (!schema) {
      return { name, vendor };
    }
    const result = {};
    for (const key in configuration) {
      let value = configuration[key];
      if (schema.properties?.[key]?.secret && isString(value)) {
        const secretKey = `${LanguageModelsService.SECRET_KEY_PREFIX}${hash(generateUuid()).toString(16)}`;
        await this._secretStorageService.set(secretKey, key === "apiKey" ? value.trim() : value);
        value = this.encodeSecretKey(secretKey);
      }
      result[key] = value;
    }
    return { name, vendor, ...result };
  }
  async _deleteSecretsInConfiguration(group, schema) {
    if (!schema) {
      return;
    }
    const { vendor, name, range, modelsRange, ...configuration } = group;
    for (const key in configuration) {
      const value = group[key];
      if (schema.properties?.[key]?.secret) {
        const secretKey = this.decodeSecretKey(value);
        if (secretKey) {
          await this._secretStorageService.delete(secretKey);
        }
      }
    }
  }
  async migrateLanguageModelsProviderGroup(languageModelsProviderGroup) {
    const { vendor, name, ...configuration } = languageModelsProviderGroup;
    if (!this._vendors.get(vendor)) {
      throw new Error(`Vendor ${vendor} not found.`);
    }
    await this._extensionService.activateByEvent(`onLanguageModelChatProvider:${vendor}`);
    const provider = this._providers.get(vendor);
    if (!provider) {
      throw new Error(`Chat model provider for vendor ${vendor} is not registered.`);
    }
    await provider.provideLanguageModelChatInfo({ group: name, silent: false, configuration }, CancellationToken.None);
    await this.addLanguageModelsProviderGroup(name, vendor, configuration);
  }
  //#region Recently used models
  _readRecentlyUsedModels() {
    return this._storageService.getObject(CHAT_MODEL_RECENTLY_USED_STORAGE_KEY, StorageScope.PROFILE, []);
  }
  _saveRecentlyUsedModels() {
    this._storageService.store(CHAT_MODEL_RECENTLY_USED_STORAGE_KEY, this._recentlyUsedModelIds, StorageScope.PROFILE, StorageTarget.USER);
  }
  getRecentlyUsedModelIds() {
    return this._recentlyUsedModelIds.filter((id) => this._modelCache.has(id) && id !== AUTO_MODEL_IDENTIFIER).slice(0, 4);
  }
  addToRecentlyUsedList(modelIdentifier) {
    if (modelIdentifier === AUTO_MODEL_IDENTIFIER) {
      return;
    }
    const index = this._recentlyUsedModelIds.indexOf(modelIdentifier);
    if (index !== -1) {
      this._recentlyUsedModelIds.splice(index, 1);
    }
    this._recentlyUsedModelIds.unshift(modelIdentifier);
    if (this._recentlyUsedModelIds.length > 20) {
      this._recentlyUsedModelIds.length = 20;
    }
    this._saveRecentlyUsedModels();
  }
  clearRecentlyUsedList() {
    this._recentlyUsedModelIds = [];
    this._saveRecentlyUsedModels();
  }
  //#endregion
  //#region Pinned models
  _readPinnedModels() {
    return this._storageService.getObject(CHAT_MODEL_PINNED_STORAGE_KEY, StorageScope.PROFILE, []);
  }
  _savePinnedModels() {
    this._storageService.store(CHAT_MODEL_PINNED_STORAGE_KEY, this._pinnedModelIds, StorageScope.PROFILE, StorageTarget.USER);
  }
  getPinnedModelIds() {
    return this._pinnedModelIds.filter((id) => id !== AUTO_MODEL_IDENTIFIER && this._modelCache.has(id));
  }
  pinModel(modelIdentifier) {
    if (modelIdentifier === AUTO_MODEL_IDENTIFIER || this._pinnedModelIds.includes(modelIdentifier)) {
      return;
    }
    this._pinnedModelIds.push(modelIdentifier);
    this._savePinnedModels();
    this._onDidChangePinnedModels.fire();
  }
  unpinModel(modelIdentifier) {
    const index = this._pinnedModelIds.indexOf(modelIdentifier);
    if (index === -1) {
      return;
    }
    this._pinnedModelIds.splice(index, 1);
    this._savePinnedModels();
    this._onDidChangePinnedModels.fire();
  }
  isModelPinned(modelIdentifier) {
    return modelIdentifier !== AUTO_MODEL_IDENTIFIER && this._pinnedModelIds.includes(modelIdentifier);
  }
  //#endregion
  //#region Model visibility
  _getGroupNameForVendor(vendor) {
    return this._vendors.get(vendor)?.displayName ?? vendor;
  }
  _getModelIdsInGroup(vendor, groupName) {
    const vendorGroups = this._modelsGroups.get(vendor);
    if (!vendorGroups) {
      return [];
    }
    const result = [];
    const fallbackName = this._getGroupNameForVendor(vendor);
    for (const g of vendorGroups) {
      const name = g.group?.name ?? fallbackName;
      if (name === groupName) {
        for (const id of g.modelIdentifiers) {
          const metadata = this._modelCache.get(id);
          if (metadata && ILanguageModelChatMetadata.getAgentHostByokManageModelsIdentifier(metadata) !== void 0) {
            continue;
          }
          result.push(id);
        }
      }
    }
    return result;
  }
  _readVisibility() {
    const raw = this._storageService.getObject(CHAT_MODEL_VISIBILITY_STORAGE_KEY, StorageScope.PROFILE, {});
    this._hiddenModelIds = new Set(Array.isArray(raw?.hiddenModels) ? raw.hiddenModels : []);
  }
  _saveVisibility() {
    this._storageService.store(
      CHAT_MODEL_VISIBILITY_STORAGE_KEY,
      { hiddenModels: Array.from(this._hiddenModelIds) },
      StorageScope.PROFILE,
      StorageTarget.USER
    );
  }
  isGroupHidden(vendor, groupName) {
    const modelIds = this._getModelIdsInGroup(vendor, groupName);
    return modelIds.length > 0 && modelIds.every((id) => this._hiddenModelIds.has(id));
  }
  isModelHidden(modelIdentifier) {
    return this._hiddenModelIds.has(modelIdentifier);
  }
  setGroupHidden(vendor, groupName, hidden) {
    this.setModelsHidden(this._getModelIdsInGroup(vendor, groupName), hidden);
  }
  setModelHidden(modelIdentifier, hidden) {
    this.setModelsHidden([modelIdentifier], hidden);
  }
  setModelsHidden(modelIdentifiers, hidden) {
    let changed = false;
    for (const id of modelIdentifiers) {
      if (hidden) {
        if (!this._hiddenModelIds.has(id)) {
          this._hiddenModelIds.add(id);
          changed = true;
        }
      } else if (this._hiddenModelIds.delete(id)) {
        changed = true;
      }
    }
    if (changed) {
      this._saveVisibility();
      this._onDidChangeModelVisibility.fire();
    }
  }
  getHiddenModelIds() {
    return Array.from(this._hiddenModelIds);
  }
  //#endregion
  //#region Models control manifest
  getModelsControlManifest() {
    return this._modelsControlManifest;
  }
  _setModelsControlManifest(response) {
    this._modelsControlRawResponse = response;
    this._refreshModelsControlManifest();
  }
  _refreshModelsControlManifest() {
    const response = this._modelsControlRawResponse;
    const free = {};
    const paid = {};
    if (response?.free) {
      const freeEntries = Array.isArray(response.free) ? response.free : Object.values(response.free);
      for (const entry of freeEntries) {
        if (!entry || !isObject(entry)) {
          continue;
        }
        free[entry.id] = { label: entry.label, featured: entry.featured, exists: this._modelCache.has(`copilot/${entry.id}`) };
      }
    }
    if (response?.paid) {
      const paidEntries = Array.isArray(response.paid) ? response.paid : Object.values(response.paid);
      for (const entry of paidEntries) {
        if (!entry || !isObject(entry)) {
          continue;
        }
        paid[entry.id] = { label: entry.label, featured: entry.featured, minVSCodeVersion: entry.minVSCodeVersion, exists: this._modelCache.has(`copilot/${entry.id}`) };
      }
    }
    this._modelsControlManifest = { free, paid };
    this._onDidChangeModelsControlManifest.fire(this._modelsControlManifest);
  }
  //#region Chat control data
  _initChatControlData() {
    this._chatControlUrl = this._productService.chatParticipantRegistry;
    if (!this._chatControlUrl) {
      return;
    }
    const raw = this._storageService.get(CHAT_PARTICIPANT_NAME_REGISTRY_STORAGE_KEY, StorageScope.APPLICATION);
    try {
      this._restrictedChatParticipants.set(JSON.parse(raw ?? "{}"), void 0);
    } catch (err) {
      this._storageService.remove(CHAT_PARTICIPANT_NAME_REGISTRY_STORAGE_KEY, StorageScope.APPLICATION);
    }
    const rawModels = this._storageService.get(CHAT_MODELS_CONTROL_STORAGE_KEY, StorageScope.APPLICATION);
    try {
      const models = JSON.parse(rawModels ?? "{}");
      if (isObject(models)) {
        this._setModelsControlManifest(models);
      }
    } catch (err) {
      this._storageService.remove(CHAT_MODELS_CONTROL_STORAGE_KEY, StorageScope.APPLICATION);
    }
    this._refreshChatControlData();
  }
  _refreshChatControlData() {
    if (this._chatControlDisposed) {
      return;
    }
    this._fetchChatControlData().catch((err) => this._logService.warn("Failed to fetch chat control data", err)).then(() => timeout(5 * 60 * 1e3)).then(() => this._refreshChatControlData());
  }
  async _fetchChatControlData() {
    this._logService.trace("[LM] Fetching chat control data from", this._chatControlUrl);
    let context;
    try {
      context = await this._requestService.request({ type: "GET", url: this._chatControlUrl, callSite: "languageModels.fetchChatControlData" }, CancellationToken.None);
    } catch (err) {
      this._logService.warn("[LM] Failed to request chat control data", getErrorMessage(err));
      return;
    }
    if (context.res.statusCode !== 200) {
      this._logService.warn(`[LM] Chat control data request failed with status ${context.res.statusCode}`);
      return;
    }
    let result;
    try {
      result = await asJson(context);
    } catch (err) {
      this._logService.warn("[LM] Failed to parse chat control response", getErrorMessage(err));
      return;
    }
    this._logService.trace("[LM] Received chat control response", result ? Object.keys(result) : "null");
    if (!result || result.version !== 1) {
      this._logService.warn("[LM] Unexpected chat control response version", result?.version);
      return;
    }
    const registry = result.restrictedChatParticipants;
    this._restrictedChatParticipants.set(registry, void 0);
    this._storageService.store(CHAT_PARTICIPANT_NAME_REGISTRY_STORAGE_KEY, JSON.stringify(registry), StorageScope.APPLICATION, StorageTarget.MACHINE);
    if (result.models) {
      this._logService.trace("[LM] Updating models control manifest", { freeCount: Object.keys(result.models.free ?? {}).length, paidCount: Object.keys(result.models.paid ?? {}).length });
      this._setModelsControlManifest(result.models);
      this._storageService.store(CHAT_MODELS_CONTROL_STORAGE_KEY, JSON.stringify(result.models), StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
  }
  //#endregion
  dispose() {
    this._chatControlDisposed = true;
    this._store.dispose();
    this._providers.clear();
  }
};
LanguageModelsService.SECRET_KEY_PREFIX = "chat.lm.secret.";
LanguageModelsService.SECRET_INPUT = "${input:{0}}";
LanguageModelsService = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, ILanguageModelsConfigurationService),
  __decorateParam(5, IQuickInputService),
  __decorateParam(6, ISecretStorageService),
  __decorateParam(7, IProductService),
  __decorateParam(8, IRequestService),
  __decorateParam(9, INotificationService),
  __decorateParam(10, IOpenerService),
  __decorateParam(11, ITelemetryService)
], LanguageModelsService);
export {
  COPILOT_VENDOR_ID,
  ChatImageMimeType,
  ChatMessageRole,
  ILanguageModelChatMetadata,
  ILanguageModelsService,
  ImageDetailLevel,
  LanguageModelPartAudience,
  LanguageModelsService,
  THIRD_PARTY_PROVIDER_TELEMETRY_NAME,
  createModelConfigurationActions,
  getByokProviderTelemetryName,
  getLanguageModelDisplayNameWithProvider,
  getLanguageModelProviderDisplayName,
  getTextResponseFromStream,
  isAutoLanguageModel,
  isILanguageModelChatSelector,
  isLanguageModelVendorAbsenceConclusive,
  languageModelChatProviderExtensionPoint,
  resolveProviderDeprecationLink
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcbGFuZ3VhZ2VNb2RlbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBTZXF1ZW5jZXJCeUtleSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IsIGdldEVycm9yTWVzc2FnZSwgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEsIFR5cGVGcm9tSnNvblNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IGZvcm1hdCwgaXNGYWxzeU9yV2hpdGVzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIFN1Ym1lbnVBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGlzT2JqZWN0LCBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIE5ldmVyU2hvd0FnYWluU2NvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFzSnNvbiwgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtLCBRdWlja0lucHV0SGlkZVJlYXNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVNlY3JldFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc2VjcmV0cy9jb21tb24vc2VjcmV0cy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24gfSBmcm9tICcuL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwLCBJTGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4vbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uLmpzJztcblxuLyoqXG4gKiBWZW5kb3IgaWQgdXNlZCBmb3IgdGhlIGJ1aWx0LWluIEdpdEh1YiBDb3BpbG90IGxhbmd1YWdlIG1vZGVsIHByb3ZpZGVyLiBUcmVhdGVkIGFzIHRoZSBkZWZhdWx0XG4gKiB2ZW5kb3IgYWNyb3NzIHRoZSBjaGF0IHN0YWNrIChzZWUgYElMYW5ndWFnZU1vZGVsUHJvdmlkZXJEZXNjcmlwdG9yLmlzRGVmYXVsdGApLlxuICovXG5leHBvcnQgY29uc3QgQ09QSUxPVF9WRU5ET1JfSUQgPSAnY29waWxvdCc7XG5cbi8qKiBXaGV0aGVyIGEgbWlzc2luZyBtb2RlbCBpcyBjb25jbHVzaXZlbHkgYWJzZW50IGZyb20gYSB2ZW5kb3IncyBsaXZlIG1vZGVsIGxpc3QuIEVtcHR5IENvcGlsb3QgcmVzdWx0cyByZW1haW4gdHJhbnNpZW50IHdoaWxlIHRva2VuLWJhY2tlZCBkaXNjb3ZlcnkgY29tcGxldGVzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzTGFuZ3VhZ2VNb2RlbFZlbmRvckFic2VuY2VDb25jbHVzaXZlKHZlbmRvcjogc3RyaW5nLCBoYXNMaXZlTW9kZWxzOiBib29sZWFuLCBoYXNSZXNvbHZlZDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaGFzTGl2ZU1vZGVscyB8fCAoaGFzUmVzb2x2ZWQgJiYgdmVuZG9yICE9PSBDT1BJTE9UX1ZFTkRPUl9JRCk7XG59XG5cbi8qKlxuICogVmVuZG9yIGlkcyBvZiB0aGUgQllPSyBsYW5ndWFnZS1tb2RlbCBwcm92aWRlcnMgdGhhdCBzaGlwIGluLWJ1aWx0IHdpdGggdGhlIEdpdEh1YiBDb3BpbG90IENoYXRcbiAqIGV4dGVuc2lvbi4gRWFjaCBwcm92aWRlcidzIHZlbmRvciBpZCBpcyBgcHJvdmlkZXJOYW1lLnRvTG93ZXJDYXNlKClgIChzZWVcbiAqIGBleHRlbnNpb25zL2NvcGlsb3Qvc3JjL2V4dGVuc2lvbi9ieW9rL3ZzY29kZS1ub2RlLypQcm92aWRlci50c2ApLiBUaGlzIGxpc3QgaXMgaW50ZW50aW9uYWxseVxuICogaGFyZGNvZGVkOiB0aGUgaW4tYnVpbHQgcHJvdmlkZXIgc2V0IGlzIHN0YWJsZSBhbmQga25vd24gYWhlYWQgb2YgdGltZSwgd2hpY2ggbGV0cyB1cyByZXBvcnQgdGhlc2VcbiAqIHByb3ZpZGVycyBieSBuYW1lIHdoaWxlIGJ1Y2tldGluZyBldmVyeSBvdGhlciAodGhpcmQtcGFydHkpIHByb3ZpZGVyIGFzIGAzcC1leHRlbnNpb25gLlxuICovXG5jb25zdCBCVUlMVF9JTl9CWU9LX1ZFTkRPUl9JRFMgPSBuZXcgU2V0PHN0cmluZz4oW1xuXHQnb3BlbmFpJyxcblx0J2FudGhyb3BpYycsXG5cdCdnZW1pbmknLFxuXHQnb2xsYW1hJyxcblx0J29wZW5yb3V0ZXInLFxuXHQnYXp1cmUnLFxuXHQneGFpJyxcblx0J2N1c3RvbW9haScsXG5cdCdjdXN0b21lbmRwb2ludCcsXG5dKTtcblxuLyoqXG4gKiBCdWNrZXQgcmVwb3J0ZWQgZm9yIGFueSBub24tQ29waWxvdCBwcm92aWRlciB0aGF0IGlzIG5vdCBhbiBpbi1idWlsdCBCWU9LIHByb3ZpZGVyLCBpLmUuIGEgbW9kZWxcbiAqIGNvbnRyaWJ1dGVkIGJ5IGEgdGhpcmQtcGFydHkgZXh0ZW5zaW9uLiBXZSBuZXZlciByZXBvcnQgdGhlIHRoaXJkLXBhcnR5IHZlbmRvciBpZCBkaXJlY3RseSB0byBhdm9pZFxuICogbG9nZ2luZyBwb3RlbnRpYWxseSBpZGVudGlmeWluZyB2YWx1ZXMuXG4gKi9cbmV4cG9ydCBjb25zdCBUSElSRF9QQVJUWV9QUk9WSURFUl9URUxFTUVUUllfTkFNRSA9ICczcC1leHRlbnNpb24nO1xuXG5jb25zdCBCVUlMVF9JTl9CWU9LX0VYVEVOU0lPTl9JRFMgPSBbXG5cdCdnaXRodWIuY29waWxvdC1jaGF0Jyxcblx0J2dpdGh1Yi5jb3BpbG90Jyxcbl07XG5cbi8qKlxuICogTm9ybWFsaXplcyBhIG5vbi1Db3BpbG90IG1vZGVsIHZlbmRvciBpbnRvIGEgbm9uLWlkZW50aWZ5aW5nIHByb3ZpZGVyIG5hbWUgc3VpdGFibGUgZm9yIHRlbGVtZXRyeTpcbiAqIHRoZSBpbi1idWlsdCBCWU9LIHZlbmRvciBpZCAoZS5nLiBgb3BlbmFpYCwgYG9sbGFtYWApIHdoZW4gY29udHJpYnV0ZWQgYnkgdGhlIGJ1aWx0LWluIENvcGlsb3RcbiAqIGV4dGVuc2lvbnMsIG9yIHtAbGluayBUSElSRF9QQVJUWV9QUk9WSURFUl9URUxFTUVUUllfTkFNRX0gb3RoZXJ3aXNlLiBSZXR1cm5zIGB1bmRlZmluZWRgIGZvciB0aGVcbiAqIGZpcnN0LXBhcnR5IENvcGlsb3QgdmVuZG9yIChvciBubyB2ZW5kb3IpIHNvIGNhbGxlcnMgc2tpcCBsb2dnaW5nIGZpcnN0LXBhcnR5IHVzYWdlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Qnlva1Byb3ZpZGVyVGVsZW1ldHJ5TmFtZSh2ZW5kb3I6IHN0cmluZyB8IHVuZGVmaW5lZCwgZXh0ZW5zaW9uOiBFeHRlbnNpb25JZGVudGlmaWVyIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKCF2ZW5kb3IgfHwgdmVuZG9yID09PSBDT1BJTE9UX1ZFTkRPUl9JRCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKEJVSUxUX0lOX0JZT0tfVkVORE9SX0lEUy5oYXModmVuZG9yKSAmJiBleHRlbnNpb24gJiYgQlVJTFRfSU5fQllPS19FWFRFTlNJT05fSURTLnNvbWUoaWQgPT4gRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMoZXh0ZW5zaW9uLCBpZCkpKSB7XG5cdFx0cmV0dXJuIHZlbmRvcjtcblx0fVxuXHRyZXR1cm4gVEhJUkRfUEFSVFlfUFJPVklERVJfVEVMRU1FVFJZX05BTUU7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIENoYXRNZXNzYWdlUm9sZSB7XG5cdFN5c3RlbSxcblx0VXNlcixcblx0QXNzaXN0YW50LFxufVxuXG5leHBvcnQgZW51bSBMYW5ndWFnZU1vZGVsUGFydEF1ZGllbmNlIHtcblx0QXNzaXN0YW50ID0gMCxcblx0VXNlciA9IDEsXG5cdEV4dGVuc2lvbiA9IDIsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRNZXNzYWdlVGV4dFBhcnQge1xuXHR0eXBlOiAndGV4dCc7XG5cdHZhbHVlOiBzdHJpbmc7XG5cdGF1ZGllbmNlPzogTGFuZ3VhZ2VNb2RlbFBhcnRBdWRpZW5jZVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0TWVzc2FnZUltYWdlUGFydCB7XG5cdHR5cGU6ICdpbWFnZV91cmwnO1xuXHR2YWx1ZTogSUNoYXRJbWFnZVVSTFBhcnQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRNZXNzYWdlVGhpbmtpbmdQYXJ0IHtcblx0dHlwZTogJ3RoaW5raW5nJztcblx0dmFsdWU6IHN0cmluZyB8IHN0cmluZ1tdO1xuXHRpZD86IHN0cmluZztcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0bWV0YWRhdGE/OiB7IHJlYWRvbmx5IFtrZXk6IHN0cmluZ106IGFueSB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0TWVzc2FnZURhdGFQYXJ0IHtcblx0dHlwZTogJ2RhdGEnO1xuXHRtaW1lVHlwZTogc3RyaW5nO1xuXHRkYXRhOiBWU0J1ZmZlcjtcblx0YXVkaWVuY2U/OiBMYW5ndWFnZU1vZGVsUGFydEF1ZGllbmNlW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRJbWFnZVVSTFBhcnQge1xuXHQvKipcblx0ICogVGhlIGltYWdlJ3MgTUlNRSB0eXBlIChlLmcuLCBcImltYWdlL3BuZ1wiLCBcImltYWdlL2pwZWdcIikuXG5cdCAqL1xuXHRtaW1lVHlwZTogQ2hhdEltYWdlTWltZVR5cGU7XG5cblx0LyoqXG5cdCAqIFRoZSByYXcgYmluYXJ5IGRhdGEgb2YgdGhlIGltYWdlLCBlbmNvZGVkIGFzIGEgVWludDhBcnJheS4gTm90ZTogZG8gbm90IHVzZSBiYXNlNjQgZW5jb2RpbmcuIE1heGltdW0gaW1hZ2Ugc2l6ZSBpcyA1TUIuXG5cdCAqL1xuXHRkYXRhOiBWU0J1ZmZlcjtcbn1cblxuLyoqXG4gKiBFbnVtIGZvciBzdXBwb3J0ZWQgaW1hZ2UgTUlNRSB0eXBlcy5cbiAqL1xuZXhwb3J0IGVudW0gQ2hhdEltYWdlTWltZVR5cGUge1xuXHRQTkcgPSAnaW1hZ2UvcG5nJyxcblx0SlBFRyA9ICdpbWFnZS9qcGVnJyxcblx0R0lGID0gJ2ltYWdlL2dpZicsXG5cdFdFQlAgPSAnaW1hZ2Uvd2VicCcsXG5cdEJNUCA9ICdpbWFnZS9ibXAnLFxufVxuXG4vKipcbiAqIFNwZWNpZmllcyB0aGUgZGV0YWlsIGxldmVsIG9mIHRoZSBpbWFnZS5cbiAqL1xuZXhwb3J0IGVudW0gSW1hZ2VEZXRhaWxMZXZlbCB7XG5cdExvdyA9ICdsb3cnLFxuXHRIaWdoID0gJ2hpZ2gnXG59XG5cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdE1lc3NhZ2VUb29sUmVzdWx0UGFydCB7XG5cdHR5cGU6ICd0b29sX3Jlc3VsdCc7XG5cdHRvb2xDYWxsSWQ6IHN0cmluZztcblx0dmFsdWU6IChJQ2hhdFJlc3BvbnNlVGV4dFBhcnQgfCBJQ2hhdFJlc3BvbnNlUHJvbXB0VHN4UGFydCB8IElDaGF0UmVzcG9uc2VEYXRhUGFydClbXTtcblx0aXNFcnJvcj86IGJvb2xlYW47XG59XG5cbmV4cG9ydCB0eXBlIElDaGF0TWVzc2FnZVBhcnQgPSBJQ2hhdE1lc3NhZ2VUZXh0UGFydCB8IElDaGF0TWVzc2FnZVRvb2xSZXN1bHRQYXJ0IHwgSUNoYXRSZXNwb25zZVRvb2xVc2VQYXJ0IHwgSUNoYXRNZXNzYWdlSW1hZ2VQYXJ0IHwgSUNoYXRNZXNzYWdlRGF0YVBhcnQgfCBJQ2hhdE1lc3NhZ2VUaGlua2luZ1BhcnQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRNZXNzYWdlIHtcblx0cmVhZG9ubHkgbmFtZT86IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcm9sZTogQ2hhdE1lc3NhZ2VSb2xlO1xuXHRyZWFkb25seSBjb250ZW50OiBJQ2hhdE1lc3NhZ2VQYXJ0W107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZXNwb25zZVRleHRQYXJ0IHtcblx0dHlwZTogJ3RleHQnO1xuXHR2YWx1ZTogc3RyaW5nO1xuXHRhdWRpZW5jZT86IExhbmd1YWdlTW9kZWxQYXJ0QXVkaWVuY2VbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlc3BvbnNlUHJvbXB0VHN4UGFydCB7XG5cdHR5cGU6ICdwcm9tcHRfdHN4Jztcblx0dmFsdWU6IHVua25vd247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZXNwb25zZURhdGFQYXJ0IHtcblx0dHlwZTogJ2RhdGEnO1xuXHRtaW1lVHlwZTogc3RyaW5nO1xuXHRkYXRhOiBWU0J1ZmZlcjtcblx0YXVkaWVuY2U/OiBMYW5ndWFnZU1vZGVsUGFydEF1ZGllbmNlW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZXNwb25zZVRvb2xVc2VQYXJ0IHtcblx0dHlwZTogJ3Rvb2xfdXNlJztcblx0bmFtZTogc3RyaW5nO1xuXHR0b29sQ2FsbElkOiBzdHJpbmc7XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdHBhcmFtZXRlcnM6IGFueTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlc3BvbnNlVGhpbmtpbmdQYXJ0IHtcblx0dHlwZTogJ3RoaW5raW5nJztcblx0dmFsdWU6IHN0cmluZyB8IHN0cmluZ1tdO1xuXHRpZD86IHN0cmluZztcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0bWV0YWRhdGE/OiB7IHJlYWRvbmx5IFtrZXk6IHN0cmluZ106IGFueSB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UmVzcG9uc2VQdWxsUmVxdWVzdFBhcnQge1xuXHR0eXBlOiAncHVsbFJlcXVlc3QnO1xuXHR1cmk6IFVSSTtcblx0dGl0bGU6IHN0cmluZztcblx0ZGVzY3JpcHRpb246IHN0cmluZztcblx0YXV0aG9yOiBzdHJpbmc7XG5cdGxpbmtUYWc6IHN0cmluZztcbn1cblxuZXhwb3J0IHR5cGUgSUNoYXRSZXNwb25zZVBhcnQgPSBJQ2hhdFJlc3BvbnNlVGV4dFBhcnQgfCBJQ2hhdFJlc3BvbnNlVG9vbFVzZVBhcnQgfCBJQ2hhdFJlc3BvbnNlRGF0YVBhcnQgfCBJQ2hhdFJlc3BvbnNlVGhpbmtpbmdQYXJ0O1xuXG5leHBvcnQgdHlwZSBJRXh0ZW5kZWRDaGF0UmVzcG9uc2VQYXJ0ID0gSUNoYXRSZXNwb25zZVB1bGxSZXF1ZXN0UGFydDtcblxuZXhwb3J0IGludGVyZmFjZSBJTGFuZ3VhZ2VNb2RlbENvbmZpZ3VyYXRpb25TY2hlbWEgZXh0ZW5kcyBJSlNPTlNjaGVtYSB7XG5cdHByb3BlcnRpZXM/OiB7XG5cdFx0W2tleTogc3RyaW5nXTogSUpTT05TY2hlbWEgJiB7XG5cdFx0XHQvKiogV2hlbiBzZXQgdG8gYCduYXZpZ2F0aW9uJ2AsIHRoZSBwcm9wZXJ0eSBpcyBzaG93biBhcyBhIHByaW1hcnkgYWN0aW9uIGluIHRoZSBtb2RlbCBwaWNrZXIuICovXG5cdFx0XHRncm91cD86IHN0cmluZztcblx0XHRcdC8qKiBMYWJlbHMgZm9yIGVudW0gdmFsdWVzLiBJZiBwcm92aWRlZCwgdGhlc2UgYXJlIHNob3duIGluc3RlYWQgb2YgdGhlIHJhdyBlbnVtIHZhbHVlcy4gKi9cblx0XHRcdGVudW1JdGVtTGFiZWxzPzogc3RyaW5nW107XG5cdFx0fTtcblx0fTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSB7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbjogRXh0ZW5zaW9uSWRlbnRpZmllcjtcblxuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHZlbmRvcjogc3RyaW5nO1xuXHRyZWFkb25seSB2ZXJzaW9uOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRvb2x0aXA/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRldGFpbD86IHN0cmluZztcblx0cmVhZG9ubHkgbXVsdGlwbGllck51bWVyaWM/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGlzQllPSz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHByaWNpbmc/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGlucHV0Q29zdD86IG51bWJlcjtcblx0cmVhZG9ubHkgY2FjaGVDb3N0PzogbnVtYmVyO1xuXHRyZWFkb25seSBjYWNoZVdyaXRlQ29zdD86IG51bWJlcjtcblx0cmVhZG9ubHkgb3V0cHV0Q29zdD86IG51bWJlcjtcblx0cmVhZG9ubHkgbG9uZ0NvbnRleHRJbnB1dENvc3Q/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGxvbmdDb250ZXh0Q2FjaGVDb3N0PzogbnVtYmVyO1xuXHRyZWFkb25seSBsb25nQ29udGV4dENhY2hlV3JpdGVDb3N0PzogbnVtYmVyO1xuXHRyZWFkb25seSBsb25nQ29udGV4dE91dHB1dENvc3Q/OiBudW1iZXI7XG5cdHJlYWRvbmx5IHByaWNlQ2F0ZWdvcnk/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNhdGVnb3J5Pzogc3RyaW5nO1xuXHRyZWFkb25seSBmYW1pbHk6IHN0cmluZztcblx0cmVhZG9ubHkgbWF4SW5wdXRUb2tlbnM6IG51bWJlcjtcblx0cmVhZG9ubHkgbWF4T3V0cHV0VG9rZW5zOiBudW1iZXI7XG5cblx0cmVhZG9ubHkgaXNEZWZhdWx0Rm9yTG9jYXRpb246IHsgW0sgaW4gQ2hhdEFnZW50TG9jYXRpb25dPzogYm9vbGVhbiB9O1xuXHRyZWFkb25seSBpc1VzZXJTZWxlY3RhYmxlPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc3RhdHVzSWNvbj86IFRoZW1lSWNvbjtcblx0cmVhZG9ubHkgYXV0aD86IHtcblx0XHRyZWFkb25seSBwcm92aWRlckxhYmVsOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgYWNjb3VudExhYmVsPzogc3RyaW5nO1xuXHR9O1xuXHRyZWFkb25seSBjYXBhYmlsaXRpZXM/OiB7XG5cdFx0cmVhZG9ubHkgdmlzaW9uPzogYm9vbGVhbjtcblx0XHRyZWFkb25seSB0b29sQ2FsbGluZz86IGJvb2xlYW47XG5cdFx0cmVhZG9ubHkgYWdlbnRNb2RlPzogYm9vbGVhbjtcblx0XHRyZWFkb25seSBlZGl0VG9vbHM/OiBSZWFkb25seUFycmF5PHN0cmluZz47XG5cdH07XG5cdC8qKlxuXHQgKiBXaGVuIHNldCwgdGhpcyBtb2RlbCBpcyBvbmx5IHNob3duIGluIHRoZSBtb2RlbCBwaWNrZXIgZm9yIHRoZSBzcGVjaWZpZWQgY2hhdCBzZXNzaW9uIHR5cGUuXG5cdCAqIE1vZGVscyB3aXRoIHRoaXMgcHJvcGVydHkgYXJlIGV4Y2x1ZGVkIGZyb20gdGhlIGdlbmVyYWwgbW9kZWwgcGlja2VyIGFuZCBvbmx5IGFwcGVhclxuXHQgKiB3aGVuIHRoZSB1c2VyIGlzIGluIGEgc2Vzc2lvbiBtYXRjaGluZyB0aGlzIHR5cGUuXG5cdCAqL1xuXHRyZWFkb25seSB0YXJnZXRDaGF0U2Vzc2lvblR5cGU/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBPcHRpb25hbCBncm91cGluZyBoaW50IGZvciB0aGUgbW9kZWwgcGlja2VyLiBXaGVuIHNldCwgdGhlIHBpY2tlciBidWNrZXRzIHRoaXMgbW9kZWxcblx0ICogdW5kZXIgYSBzdWItZ3JvdXAgd2l0aGluIGl0cyB2ZW5kb3IsIGlkZW50aWZpZWQgYnkgdGhpcyB2ZW5kb3IgaWQgXHUyMDE0IGUuZy4gYWdlbnQtaG9zdCBtb2RlbHMsXG5cdCAqIHdoaWNoIGFsbCBzaGFyZSBvbmUgdmVuZG9yLCBncm91cGVkIGJ5IHRoZWlyIHVwc3RyZWFtIHByb3ZpZGVyIFx1MjAxNCBpbnN0ZWFkIG9mIGEgc2luZ2xlXG5cdCAqIHZlbmRvci13aWRlIGJ1Y2tldC4gVGhlIGRpc3BsYXkgbmFtZSBpcyByZXNvbHZlZCBmcm9tIHRoZSB2ZW5kb3IgcmVnaXN0cnlcblx0ICogKHtAbGluayBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmdldFZlbmRvcnN9KSwgdGhlIHNhbWUgc291cmNlIHVzZWQgZm9yIGV2ZXJ5IG90aGVyIHZlbmRvci5cblx0ICogUHJlc2VudGF0aW9uLW9ubHk7IGl0IGRvZXMgbm90IGFmZmVjdCBtb2RlbCBzZWxlY3Rpb24gb3Igcm91dGluZy5cblx0ICovXG5cdHJlYWRvbmx5IG1vZGVsR3JvdXA/OiB7XG5cdFx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0XHQvKipcblx0XHQgKiBJZGVudGlmaWVzIGEgdHJ1c3RlZCBzb3VyY2UgcHJlc2VudGF0aW9uIG93bmVkIGJ5IHRoaXMgbW9kZWwncyB2ZW5kb3IuXG5cdFx0ICogU291cmNlIGlkcyBhcmUgcmVzb2x2ZWQgdG9nZXRoZXIgd2l0aCB7QGxpbmsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEudmVuZG9yfSxcblx0XHQgKiBzbyBhbm90aGVyIHZlbmRvciBjYW5ub3QgY2xhaW0gdGhlIHNhbWUgcHJlc2VudGF0aW9uIGJ5IHJldXNpbmcgdGhlIGlkLlxuXHRcdCAqL1xuXHRcdHJlYWRvbmx5IHNvdXJjZUlkPzogc3RyaW5nO1xuXHR9O1xuXHQvKipcblx0ICogRm9yIGFuIGFnZW50LWhvc3QgY29weSBvZiBhbiBleHRlbnNpb24tcHJvdmlkZWQgQllPSyBtb2RlbCwgdGhlIGlkZW50aWZpZXIgdGhlXG5cdCAqIG9yaWdpbmFsIG1vZGVsIGlzIHJlZ2lzdGVyZWQgdW5kZXIgaW4gdGhlIHJlbmRlcmVyJ3MgTE0gc2VydmljZVxuXHQgKiAoYHRvTW9kZWxJZGVudGlmaWVyKHZlbmRvciwgZ3JvdXAsIGlkKWAgXHUyMDE0IGA8dmVuZG9yPi88Z3JvdXA+LzxpZD5gIG9yIGA8dmVuZG9yPi88aWQ+YCkuXG5cdCAqIFRoaXMgaXMgZXhhY3RseSB0aGUgaWQgdGhlIFwiTWFuYWdlIE1vZGVsc1wiIHZpZXcga2V5cyB2aXNpYmlsaXR5IGJ5OyBpdCBpcyBjYXJyaWVkXG5cdCAqIGFjcm9zcyB0aGUgYWdlbnQtaG9zdCBicmlkZ2UgYW5kIHN1cmZhY2VkIGhlcmUgc28gdGhlIG1vZGVsIHBpY2tlciBjYW4gaG9ub3VyIHRoZVxuXHQgKiBtb2RlbCdzIHZpc2liaWxpdHkgdG9nZ2xlLiBBYnNlbnQgZm9yIG5hdGl2ZSBhZ2VudC1ob3N0IG1vZGVscyBhbmQgbm9uLWFnZW50LWhvc3Rcblx0ICogbW9kZWxzLlxuXHQgKi9cblx0cmVhZG9ubHkgYnlva01vZGVsSWRlbnRpZmllcj86IHN0cmluZztcblx0LyoqXG5cdCAqIEFuIG9wdGlvbmFsIEpTT04gc2NoZW1hIGRlc2NyaWJpbmcgdGhlIHBlci1tb2RlbCBjb25maWd1cmF0aW9uIG9wdGlvbnMuXG5cdCAqIFVzZWQgdG8gdmFsaWRhdGUgdXNlci1wcm92aWRlZCBwZXItbW9kZWwgY29uZmlndXJhdGlvbiBpbiBgY2hhdExhbmd1YWdlTW9kZWxzLmpzb25gLlxuXHQgKi9cblx0cmVhZG9ubHkgY29uZmlndXJhdGlvblNjaGVtYT86IElMYW5ndWFnZU1vZGVsQ29uZmlndXJhdGlvblNjaGVtYTtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIHdhcm5pbmcgdGV4dCB0byBkaXNwbGF5IGluIHRoZSBtb2RlbCBwaWNrZXIgaG92ZXIgYXMgYSB3YXJuaW5nIGJhbm5lci5cblx0ICogVGhlIGtleXMgYXJlIHdhcm5pbmcgY2F0ZWdvcmllcyAoZS5nLiBcImRhdGFfcmV0ZW50aW9uXCIpIGFuZCB0aGUgdmFsdWVzIGFyZSBtYXJrZG93biBzdHJpbmdzLlxuXHQgKi9cblx0cmVhZG9ubHkgd2FybmluZ1RleHQ/OiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+O1xuXHQvKipcblx0ICogT3B0aW9uYWwgcHJvbW90aW9uYWwgaW5mb3JtYXRpb24gZm9yIHRoaXMgbW9kZWwuIEEgcG9zaXRpdmUgYGRpc2NvdW50UGVyY2VudGBcblx0ICogc3VyZmFjZXMgdGhlIGZ1bGwgcHJvbW90aW9uYWwgVUk7IGAwYCBpcyBhIG1lc3NhZ2Utb25seSBwcm9tbyB0aGF0IGZlYXR1cmVzIHRoZVxuXHQgKiBtb2RlbCB3aXRob3V0IGEgcHJpY2UgY2hhbmdlOyBhIG5lZ2F0aXZlIHZhbHVlIGlzIG1hbGZvcm1lZCBhbmQgaXMgaWdub3JlZC5cblx0ICogYGVuZHNBdGAgaXMgb3B0aW9uYWwgXHUyMDE0IG9wZW4tZW5kZWQgcHJvbW9zIG9taXQgaXQgYW5kIHJlbmRlciBubyBlbmQgZGF0ZS5cblx0ICovXG5cdHJlYWRvbmx5IHByb21vPzoge1xuXHRcdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgZGlzY291bnRQZXJjZW50OiBudW1iZXI7XG5cdFx0cmVhZG9ubHkgZW5kc0F0Pzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IG1lc3NhZ2U6IHN0cmluZztcblx0fTtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSB7XG5cdGV4cG9ydCBmdW5jdGlvbiBzdWl0YWJsZUZvckFnZW50TW9kZShtZXRhZGF0YTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEpOiBib29sZWFuIHtcblx0XHRjb25zdCBzdXBwb3J0c1Rvb2xzQWdlbnQgPSB0eXBlb2YgbWV0YWRhdGEuY2FwYWJpbGl0aWVzPy5hZ2VudE1vZGUgPT09ICd1bmRlZmluZWQnIHx8IG1ldGFkYXRhLmNhcGFiaWxpdGllcy5hZ2VudE1vZGU7XG5cdFx0cmV0dXJuIHN1cHBvcnRzVG9vbHNBZ2VudCAmJiAhIW1ldGFkYXRhLmNhcGFiaWxpdGllcz8udG9vbENhbGxpbmc7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gYXNRdWFsaWZpZWROYW1lKG1ldGFkYXRhOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke21ldGFkYXRhLm5hbWV9ICgke21ldGFkYXRhLnZlbmRvcn0pYDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBtYXRjaGVzUXVhbGlmaWVkTmFtZShuYW1lOiBzdHJpbmcsIG1ldGFkYXRhOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSk6IGJvb2xlYW4ge1xuXHRcdGlmIChtZXRhZGF0YS52ZW5kb3IgPT09IENPUElMT1RfVkVORE9SX0lEICYmIG5hbWUgPT09IG1ldGFkYXRhLm5hbWUpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gbmFtZSA9PT0gYXNRdWFsaWZpZWROYW1lKG1ldGFkYXRhKTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBoYXNQcm9tb0Rpc2NvdW50KG1ldGFkYXRhOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSk6IG1ldGFkYXRhIGlzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhICYgeyByZWFkb25seSBwcm9tbzogTm9uTnVsbGFibGU8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFbJ3Byb21vJ10+IH0ge1xuXHRcdHJldHVybiAhIW1ldGFkYXRhLnByb21vICYmIG1ldGFkYXRhLnByb21vLmRpc2NvdW50UGVyY2VudCA+IDA7XG5cdH1cblxuXHQvKiogV2hldGhlciB0aGUgbW9kZWwgaGFzIGEgcHJvbW8gbWVzc2FnZSB0byBzdXJmYWNlLCBpbmNsdWRpbmcgbWVzc2FnZS1vbmx5ICgwJSkgcHJvbW9zLiAqL1xuXHRleHBvcnQgZnVuY3Rpb24gaGFzUHJvbW9NZXNzYWdlKG1ldGFkYXRhOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSk6IG1ldGFkYXRhIGlzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhICYgeyByZWFkb25seSBwcm9tbzogTm9uTnVsbGFibGU8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFbJ3Byb21vJ10+IH0ge1xuXHRcdHJldHVybiAhIW1ldGFkYXRhLnByb21vICYmIG1ldGFkYXRhLnByb21vLmRpc2NvdW50UGVyY2VudCA+PSAwICYmICEhbWV0YWRhdGEucHJvbW8ubWVzc2FnZTtcblx0fVxuXG5cdC8qKiBUaGUgbG9jYWxpemVkIFwiRW5kcyB7ZGF0ZX0uXCIgc2VudGVuY2UsIG9yIGB1bmRlZmluZWRgIGZvciBhIG1pc3Npbmcgb3IgdW5wYXJzYWJsZSBlbmQgZGF0ZS4gKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIGdldFByb21vRW5kc0F0TGFiZWwoZW5kc0F0OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghZW5kc0F0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBlbmRzQXREYXRlID0gbmV3IERhdGUoZW5kc0F0KTtcblx0XHRpZiAoaXNOYU4oZW5kc0F0RGF0ZS5nZXRUaW1lKCkpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBmb3JtYXR0ZWREYXRlID0gZW5kc0F0RGF0ZS50b0xvY2FsZURhdGVTdHJpbmcodW5kZWZpbmVkLCB7IHllYXI6ICdudW1lcmljJywgbW9udGg6ICdsb25nJywgZGF5OiAnbnVtZXJpYycgfSk7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0LnByb21vLmVuZHNBdCcsIFwiRW5kcyB7MH0uXCIsIGZvcm1hdHRlZERhdGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERvY3VtZW50YXRpb24gbGluayBleHBsYWluaW5nIGhvdyBBdXRvIG1vZGVsIHNlbGVjdGlvbiB3b3Jrcy5cblx0ICogTk9URTogQWxzbyBkZWZpbmVkIGluIGV4dGVuc2lvbnMvY29waWxvdC9zcmMvZXh0ZW5zaW9uL2NvbnZlcnNhdGlvbi9jb21tb24vbGFuZ3VhZ2VNb2RlbEFjY2Vzcy50cyBcdTIwMTQga2VlcCBpbiBzeW5jLlxuXHQgKi9cblx0ZXhwb3J0IGNvbnN0IGF1dG9Nb2RlbFNlbGVjdGlvbkRvY3NVcmwgPSAnaHR0cHM6Ly9kb2NzLmdpdGh1Yi5jb20vZW4vY29waWxvdC9jb25jZXB0cy9tb2RlbHMvYXV0by1tb2RlbC1zZWxlY3Rpb24nO1xuXG5cdC8qKlxuXHQgKiBCdWlsZHMgdGhlIHNoYXJlZCBkZXNjcmlwdGlvbiBzaG93biBmb3IgdGhlIEF1dG8gbW9kZWwsIHJlbmRlcmVkIGFzIE1hcmtkb3duXG5cdCAqIChpdCBjb250YWlucyBhIFwiTGVhcm4gTW9yZVwiIGxpbmspLiBUaGUgZGlzY291bnQgc2VudGVuY2UgaXMgb25seSBpbmNsdWRlZFxuXHQgKiB3aGVuIGEgcG9zaXRpdmUgZGlzY291bnQgaXMgcHJvdmlkZWQuXG5cdCAqXG5cdCAqIEBwYXJhbSBkaXNjb3VudFBlcmNlbnQgV2hvbGUtbnVtYmVyIHBlcmNlbnRhZ2UgKGUuZy4gYDEwYCBmb3IgMTAlKS4gV2hlblxuXHQgKiBvbWl0dGVkIG9yIG5vdCBwb3NpdGl2ZSwgdGhlIGRpc2NvdW50IHNlbnRlbmNlIGlzIGxlZnQgb3V0IGVudGlyZWx5LlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIGdldEF1dG9Nb2RlbERlc2NyaXB0aW9uKGRpc2NvdW50UGVyY2VudD86IG51bWJlcik6IHN0cmluZyB7XG5cdFx0Y29uc3QgYmFzZSA9IGxvY2FsaXplKCdhdXRvTW9kZWwuZGVzY3JpcHRpb24nLCBcIkF1dG8gcm91dGVzIGJhc2VkIG9uIHlvdXIgdGFzayBhbmQgcmVhbC10aW1lIHN5c3RlbSBoZWFsdGggYW5kIG1vZGVsIHBlcmZvcm1hbmNlLlwiKTtcblx0XHRjb25zdCBsZWFybk1vcmUgPSBsb2NhbGl6ZSgnYXV0b01vZGVsLmxlYXJuTW9yZScsIFwiW0xlYXJuIE1vcmVdKHswfSlcIiwgYXV0b01vZGVsU2VsZWN0aW9uRG9jc1VybCk7XG5cdFx0aWYgKHR5cGVvZiBkaXNjb3VudFBlcmNlbnQgPT09ICdudW1iZXInICYmIGRpc2NvdW50UGVyY2VudCA+IDApIHtcblx0XHRcdGNvbnN0IGRpc2NvdW50ID0gbG9jYWxpemUoJ2F1dG9Nb2RlbC5kaXNjb3VudCcsIFwiTW9kZWxzIHJvdXRlZCB2aWEgYXV0byByZWNlaXZlIGEgezB9JSBkaXNjb3VudC5cIiwgZGlzY291bnRQZXJjZW50KTtcblx0XHRcdHJldHVybiBgJHtiYXNlfSAke2Rpc2NvdW50fSAke2xlYXJuTW9yZX1gO1xuXHRcdH1cblx0XHRyZXR1cm4gYCR7YmFzZX0gJHtsZWFybk1vcmV9YDtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgXCJNYW5hZ2UgTW9kZWxzXCIgaWRlbnRpZmllciB0aGF0IGFuIGFnZW50LWhvc3QgY29weSBvZiBhbiBleHRlbnNpb24tcHJvdmlkZWRcblx0ICogQllPSyBtb2RlbCBpcyB0b2dnbGVkIHVuZGVyLCBvciBgdW5kZWZpbmVkYCB3aGVuIHRoZSBtb2RlbCBpcyBub3Qgc3VjaCBhIGNvcHkuXG5cdCAqXG5cdCAqIEFnZW50LWhvc3QgQllPSyBtb2RlbHMgbWFrZSBhIHJvdW5kIHRyaXAgdGhhdCByZXdyaXRlcyB0aGVpciBpZCAodGhlIG5vZGUgYWdlbnQgaG9zdFxuXHQgKiByZS1hZHZlcnRpc2VzIHRoZSBleHRlbnNpb24gbW9kZWwgdW5kZXIgdGhlIGFnZW50LWhvc3QgdmVuZG9yKS4gVGhlaXIgb3JpZ2luYWwgTE1cblx0ICogc2VydmljZSBpZGVudGlmaWVyIFx1MjAxNCBgdG9Nb2RlbElkZW50aWZpZXIodmVuZG9yLCBncm91cCwgaWQpYCwgaS5lLiBgPHZlbmRvcj4vPGdyb3VwPi88aWQ+YFxuXHQgKiBvciBgPHZlbmRvcj4vPGlkPmAsIHdoaWNoIGlzIHdoYXQgdGhlIE1hbmFnZSBNb2RlbHMgdmlldyBzdG9yZXMgd2hlbiBoaWRpbmcgdGhlIG1vZGVsIFx1MjAxNFxuXHQgKiBpcyBjYXJyaWVkIGFjcm9zcyB0aGUgYnJpZGdlIGFuZCBzdXJmYWNlZCBvbiB7QGxpbmsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEuYnlva01vZGVsSWRlbnRpZmllcn0uXG5cdCAqIFRoaXMgcmV0dXJucyBpdCwgc28gY2FsbGVycyBjYW4gbWF0Y2ggdGhlIGNvcHkgYWdhaW5zdCB0aGUgdXNlcidzIHZpc2liaWxpdHkgdG9nZ2xlcy5cblx0ICpcblx0ICogUmV0dXJucyBgdW5kZWZpbmVkYCBmb3IgbW9kZWxzIHRoYXQgYXJlIG5vdCBhZ2VudC1ob3N0IEJZT0sgY29waWVzIChuYXRpdmUgaGFybmVzc1xuXHQgKiBtb2RlbHMgYW5kIG5vbi1hZ2VudC1ob3N0IG1vZGVscyksIHdoaWNoIGFyZSBtYXRjaGVkIGJ5IHRoZWlyIG93biBpZGVudGlmaWVyIGluc3RlYWQuXG5cdCAqL1xuXHRleHBvcnQgZnVuY3Rpb24gZ2V0QWdlbnRIb3N0Qnlva01hbmFnZU1vZGVsc0lkZW50aWZpZXIobWV0YWRhdGE6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gbWV0YWRhdGEuYnlva01vZGVsSWRlbnRpZmllcjtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMYW5ndWFnZU1vZGVsQ2hhdFJlc3BvbnNlIHtcblx0c3RyZWFtOiBBc3luY0l0ZXJhYmxlPElDaGF0UmVzcG9uc2VQYXJ0IHwgSUNoYXRSZXNwb25zZVBhcnRbXT47XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdHJlc3VsdDogUHJvbWlzZTxhbnk+O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0VGV4dFJlc3BvbnNlRnJvbVN0cmVhbShyZXNwb25zZTogSUxhbmd1YWdlTW9kZWxDaGF0UmVzcG9uc2UpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRsZXQgcmVzcG9uc2VUZXh0ID0gJyc7XG5cdGNvbnN0IHN0cmVhbWluZyA9IChhc3luYyAoKSA9PiB7XG5cdFx0aWYgKCFyZXNwb25zZT8uc3RyZWFtKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvciBhd2FpdCAoY29uc3QgcGFydCBvZiByZXNwb25zZS5zdHJlYW0pIHtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KHBhcnQpKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBwYXJ0KSB7XG5cdFx0XHRcdFx0aWYgKGl0ZW0udHlwZSA9PT0gJ3RleHQnKSB7XG5cdFx0XHRcdFx0XHRyZXNwb25zZVRleHQgKz0gaXRlbS52YWx1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAocGFydC50eXBlID09PSAndGV4dCcpIHtcblx0XHRcdFx0cmVzcG9uc2VUZXh0ICs9IHBhcnQudmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KSgpO1xuXG5cdHRyeSB7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW3Jlc3BvbnNlLnJlc3VsdCwgc3RyZWFtaW5nXSk7XG5cdFx0cmV0dXJuIHJlc3BvbnNlVGV4dDtcblx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0aWYgKHJlc3BvbnNlVGV4dCkge1xuXHRcdFx0cmV0dXJuIHJlc3BvbnNlVGV4dDtcblx0XHR9XG5cdFx0dGhyb3cgZXJyO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXIge1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD47XG5cdHByb3ZpZGVMYW5ndWFnZU1vZGVsQ2hhdEluZm8ob3B0aW9uczogSUxhbmd1YWdlTW9kZWxDaGF0SW5mb09wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyW10+O1xuXHRzZW5kQ2hhdFJlcXVlc3QobW9kZWxJZDogc3RyaW5nLCBtZXNzYWdlczogSUNoYXRNZXNzYWdlW10sIGZyb206IEV4dGVuc2lvbklkZW50aWZpZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM6IElMYW5ndWFnZU1vZGVsQ2hhdFJlcXVlc3RPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElMYW5ndWFnZU1vZGVsQ2hhdFJlc3BvbnNlPjtcblx0cHJvdmlkZVRva2VuQ291bnQobW9kZWxJZDogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcgfCBJQ2hhdE1lc3NhZ2UsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bnVtYmVyPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGFuZ3VhZ2VNb2RlbENoYXQge1xuXHRtZXRhZGF0YTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE7XG5cdHNlbmRDaGF0UmVxdWVzdChtZXNzYWdlczogSUNoYXRNZXNzYWdlW10sIGZyb206IEV4dGVuc2lvbklkZW50aWZpZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM6IElMYW5ndWFnZU1vZGVsQ2hhdFJlcXVlc3RPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElMYW5ndWFnZU1vZGVsQ2hhdFJlc3BvbnNlPjtcblx0cHJvdmlkZVRva2VuQ291bnQobWVzc2FnZTogc3RyaW5nIHwgSUNoYXRNZXNzYWdlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPG51bWJlcj47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxhbmd1YWdlTW9kZWxDaGF0U2VsZWN0b3Ige1xuXHRyZWFkb25seSBuYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBpZD86IHN0cmluZztcblx0cmVhZG9ubHkgdmVuZG9yPzogc3RyaW5nO1xuXHRyZWFkb25seSB2ZXJzaW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBmYW1pbHk/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRva2Vucz86IG51bWJlcjtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uPzogRXh0ZW5zaW9uSWRlbnRpZmllcjtcbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gaXNJTGFuZ3VhZ2VNb2RlbENoYXRTZWxlY3Rvcih2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIElMYW5ndWFnZU1vZGVsQ2hhdFNlbGVjdG9yIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcgfHwgdmFsdWUgPT09IG51bGwpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3Qgb2JqID0gdmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdHJldHVybiAoXG5cdFx0KG9iai5uYW1lID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIG9iai5uYW1lID09PSAnc3RyaW5nJykgJiZcblx0XHQob2JqLmlkID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIG9iai5pZCA9PT0gJ3N0cmluZycpICYmXG5cdFx0KG9iai52ZW5kb3IgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2Ygb2JqLnZlbmRvciA9PT0gJ3N0cmluZycpICYmXG5cdFx0KG9iai52ZXJzaW9uID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIG9iai52ZXJzaW9uID09PSAnc3RyaW5nJykgJiZcblx0XHQob2JqLmZhbWlseSA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiBvYmouZmFtaWx5ID09PSAnc3RyaW5nJykgJiZcblx0XHQob2JqLnRva2VucyA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiBvYmoudG9rZW5zID09PSAnbnVtYmVyJykgJiZcblx0XHQob2JqLmV4dGVuc2lvbiA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiBvYmouZXh0ZW5zaW9uID09PSAnb2JqZWN0Jylcblx0KTtcbn1cblxuZXhwb3J0IGNvbnN0IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUxhbmd1YWdlTW9kZWxzU2VydmljZT4oJ0lMYW5ndWFnZU1vZGVsc1NlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIge1xuXHRtZXRhZGF0YTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE7XG5cdGlkZW50aWZpZXI6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGFuZ3VhZ2VNb2RlbENoYXRJbmZvT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGdyb3VwPzogc3RyaW5nO1xuXHRyZWFkb25seSBzaWxlbnQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNvbmZpZ3VyYXRpb24/OiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGFuZ3VhZ2VNb2RlbENoYXRSZXF1ZXN0T3B0aW9ucyB7XG5cdHJlYWRvbmx5IG1vZGVsT3B0aW9ucz86IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+O1xuXHRyZWFkb25seSBjb25maWd1cmF0aW9uPzogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj47XG5cdHJlYWRvbmx5IGluY2x1ZGVFbmNyeXB0ZWRUaGlua2luZz86IGJvb2xlYW47XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdHJlYWRvbmx5IFtuYW1lOiBzdHJpbmddOiBhbnk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxhbmd1YWdlTW9kZWxzR3JvdXAge1xuXHRyZWFkb25seSBncm91cD86IElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXA7XG5cdHJlYWRvbmx5IG1vZGVsSWRlbnRpZmllcnM6IHN0cmluZ1tdO1xuXHRyZWFkb25seSBzdGF0dXM/OiB7XG5cdFx0cmVhZG9ubHkgbWVzc2FnZTogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHNldmVyaXR5OiBTZXZlcml0eTtcblx0fTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsVmVuZG9yczogRXZlbnQ8cmVhZG9ubHkgc3RyaW5nW10+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzOiBFdmVudDxzdHJpbmc+O1xuXG5cdGdldExhbmd1YWdlTW9kZWxJZHMoKTogc3RyaW5nW107XG5cblx0Z2V0VmVuZG9ycygpOiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGVzY3JpcHRvcltdO1xuXG5cdGxvb2t1cExhbmd1YWdlTW9kZWwobW9kZWxJZDogc3RyaW5nKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEZpbmQgYSBtb2RlbCBieSBpdHMgcXVhbGlmaWVkIG5hbWUuIFRoZSBxdWFsaWZpZWQgbmFtZSBpcyB3aGF0IGlzIHVzZWQgaW4gcHJvbXB0IGFuZCBhZ2VudCBmaWxlcyBhbmQgaXMgaW4gdGhlIGZvcm1hdCBcIk1vZGVsIE5hbWUgKFZlbmRvcilcIi5cblx0ICovXG5cdGxvb2t1cExhbmd1YWdlTW9kZWxCeVF1YWxpZmllZE5hbWUocXVhbGlmaWVkTmFtZTogc3RyaW5nKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkO1xuXG5cdGdldExhbmd1YWdlTW9kZWxHcm91cHModmVuZG9yOiBzdHJpbmcpOiBJTGFuZ3VhZ2VNb2RlbHNHcm91cFtdO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdGhlIGdpdmVuIHZlbmRvcidzIHByb3ZpZGVyIGhhcyBjb21wbGV0ZWQgYXQgbGVhc3Qgb25lXG5cdCAqIG1vZGVsIHJlc29sdXRpb24gc2luY2UgcmVnaXN0cmF0aW9uLiBBIGBmYWxzZWAgcmVzdWx0IGluZGljYXRlcyB0aGVcblx0ICogdmVuZG9yIGlzIHN0aWxsIGluIGEgc3RhcnR1cC9yZWxvYWQgcmFjZSB3aGVyZSBpdHMgbW9kZWwgbGlzdCBpc24ndCB5ZXRcblx0ICogYXV0aG9yaXRhdGl2ZSBcdTIwMTQgY2FsbGVycyBjYW4gZmFsbCBiYWNrIHRvIGEgY2FjaGVkIGxpc3QgaW4gdGhhdCBjYXNlLlxuXHQgKi9cblx0aGFzUmVzb2x2ZWRWZW5kb3IodmVuZG9yOiBzdHJpbmcpOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBHaXZlbiBhIHNlbGVjdG9yLCByZXR1cm5zIGEgbGlzdCBvZiBtb2RlbCBpZGVudGlmaWVyc1xuXHQgKiBAcGFyYW0gc2VsZWN0b3IgVGhlIHNlbGVjdG9yIHRvIGxvb2t1cCBmb3IgbGFuZ3VhZ2UgbW9kZWxzLiBJZiB0aGUgc2VsZWN0b3IgaXMgZW1wdHksIGFsbCBsYW5ndWFnZSBtb2RlbHMgYXJlIHJldHVybmVkLlxuXHQgKi9cblx0c2VsZWN0TGFuZ3VhZ2VNb2RlbHMoc2VsZWN0b3I6IElMYW5ndWFnZU1vZGVsQ2hhdFNlbGVjdG9yKTogUHJvbWlzZTxzdHJpbmdbXT47XG5cblx0cmVnaXN0ZXJMYW5ndWFnZU1vZGVsUHJvdmlkZXIodmVuZG9yOiBzdHJpbmcsIHByb3ZpZGVyOiBJTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlcik6IElEaXNwb3NhYmxlO1xuXG5cdGRlbHRhTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlckRlc2NyaXB0b3JzKGFkZGVkOiBJVXNlckZyaWVuZGx5TGFuZ3VhZ2VNb2RlbFtdLCByZW1vdmVkOiBJVXNlckZyaWVuZGx5TGFuZ3VhZ2VNb2RlbFtdKTogdm9pZDtcblxuXHRzZW5kQ2hhdFJlcXVlc3QobW9kZWxJZDogc3RyaW5nLCBmcm9tOiBFeHRlbnNpb25JZGVudGlmaWVyIHwgdW5kZWZpbmVkLCBtZXNzYWdlczogSUNoYXRNZXNzYWdlW10sIG9wdGlvbnM6IElMYW5ndWFnZU1vZGVsQ2hhdFJlcXVlc3RPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElMYW5ndWFnZU1vZGVsQ2hhdFJlc3BvbnNlPjtcblxuXHRjb21wdXRlVG9rZW5MZW5ndGgobW9kZWxJZDogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcgfCBJQ2hhdE1lc3NhZ2UsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bnVtYmVyPjtcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgcmVzb2x2ZWQgcGVyLW1vZGVsIGNvbmZpZ3VyYXRpb24gZm9yIHRoZSBnaXZlbiBtb2RlbCBpZGVudGlmaWVyLlxuXHQgKiBJbmNsdWRlcyBzY2hlbWEgZGVmYXVsdHMgd2l0aCB1c2VyIG92ZXJyaWRlcyBhcHBsaWVkIG9uIHRvcC5cblx0ICogUmV0dXJucyB1bmRlZmluZWQgaWYgdGhlIG1vZGVsIGhhcyBubyBjb25maWd1cmF0aW9uIHNjaGVtYSBhbmQgbm8gdXNlciBjb25maWcuXG5cdCAqL1xuXHRnZXRNb2RlbENvbmZpZ3VyYXRpb24obW9kZWxJZDogc3RyaW5nKTogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlIHBlci1tb2RlbCBjb25maWd1cmF0aW9uIGZvciB0aGUgZ2l2ZW4gbW9kZWwuXG5cdCAqIE1lcmdlcyB0aGUgcHJvdmlkZWQgdmFsdWVzIGludG8gdGhlIGV4aXN0aW5nIGNvbmZpZ3VyYXRpb24uXG5cdCAqL1xuXHRzZXRNb2RlbENvbmZpZ3VyYXRpb24obW9kZWxJZDogc3RyaW5nLCB2YWx1ZXM6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+KTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKipcblx0ICogUmV0dXJucyBhY3Rpb25zIGZvciBjb25maWd1cmluZyB0aGUgZ2l2ZW4gbW9kZWwgYmFzZWQgb24gaXRzIGNvbmZpZ3VyYXRpb24gc2NoZW1hLlxuXHQgKiBGb3IgZW51bSBwcm9wZXJ0aWVzLCByZXR1cm5zIHN1Ym1lbnUgYWN0aW9ucyB3aXRoIGNoZWNrYWJsZSB2YWx1ZXMuXG5cdCAqIFJldHVybnMgYW4gZW1wdHkgYXJyYXkgaWYgdGhlIG1vZGVsIGhhcyBubyBjb25maWd1cmF0aW9uIHNjaGVtYS5cblx0ICovXG5cdGdldE1vZGVsQ29uZmlndXJhdGlvbkFjdGlvbnMobW9kZWxJZDogc3RyaW5nKTogSUFjdGlvbltdO1xuXG5cdGFkZExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cChuYW1lOiBzdHJpbmcsIHZlbmRvcklkOiBzdHJpbmcsIGNvbmZpZ3VyYXRpb246IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPjtcblxuXHRyZW1vdmVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAodmVuZG9ySWQ6IHN0cmluZywgcHJvdmlkZXJHcm91cE5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG5cblx0Y29uZmlndXJlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKHZlbmRvcklkOiBzdHJpbmcsIG5hbWU/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdHJlbmFtZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCh2ZW5kb3JJZDogc3RyaW5nLCBwcm92aWRlckdyb3VwTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcblxuXHR1cGRhdGVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBBcGlLZXkodmVuZG9ySWQ6IHN0cmluZywgcHJvdmlkZXJHcm91cE5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG5cblx0YWRkTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwTW9kZWwodmVuZG9ySWQ6IHN0cmluZywgcHJvdmlkZXJHcm91cE5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG5cblx0b3Blbkxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cFNldHRpbmdzKHZlbmRvcklkOiBzdHJpbmcsIHByb3ZpZGVyR3JvdXBOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBPcGVucyB0aGUgbGFuZ3VhZ2UgbW9kZWxzIGNvbmZpZ3VyYXRpb24gZmlsZSBhbmQgbmF2aWdhdGVzIHRvXG5cdCAqIG9yIGNyZWF0ZXMgdGhlIHBlci1tb2RlbCBjb25maWd1cmF0aW9uIGZvciB0aGUgZ2l2ZW4gbW9kZWwuXG5cdCAqL1xuXHRjb25maWd1cmVNb2RlbChtb2RlbElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdG1pZ3JhdGVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAobGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwOiBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgbW9zdCByZWNlbnRseSB1c2VkIG1vZGVsIGlkZW50aWZpZXJzLCBvcmRlcmVkIGJ5IG1vc3QtcmVjZW50LWZpcnN0LlxuXHQgKiBAcGFyYW0gbWF4Q291bnQgTWF4aW11bSBudW1iZXIgb2YgZW50cmllcyB0byByZXR1cm4gKGRlZmF1bHQgNykuXG5cdCAqL1xuXHRnZXRSZWNlbnRseVVzZWRNb2RlbElkcygpOiBzdHJpbmdbXTtcblxuXHQvKipcblx0ICogUmVjb3JkcyB0aGF0IGEgbW9kZWwgd2FzIHVzZWQsIHVwZGF0aW5nIHRoZSByZWNlbnRseSB1c2VkIGxpc3QuXG5cdCAqL1xuXHRhZGRUb1JlY2VudGx5VXNlZExpc3QobW9kZWxJZGVudGlmaWVyOiBzdHJpbmcpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBDbGVhcnMgdGhlIHJlY2VudGx5IHVzZWQgbW9kZWwgbGlzdC5cblx0ICovXG5cdGNsZWFyUmVjZW50bHlVc2VkTGlzdCgpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBwaW5uZWQgbW9kZWwgaWRlbnRpZmllcnMsIGluIHRoZSBvcmRlciB0aGV5IHdlcmUgcGlubmVkLlxuXHQgKi9cblx0Z2V0UGlubmVkTW9kZWxJZHMoKTogc3RyaW5nW107XG5cblx0LyoqXG5cdCAqIFBpbnMgYSBtb2RlbCBzbyBpdCBhcHBlYXJzIGluIHRoZSBwaW5uZWQgc2VjdGlvbiBvZiB0aGUgbW9kZWwgcGlja2VyLlxuXHQgKi9cblx0cGluTW9kZWwobW9kZWxJZGVudGlmaWVyOiBzdHJpbmcpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBVbnBpbnMgYSBtb2RlbCwgcmVtb3ZpbmcgaXQgZnJvbSB0aGUgcGlubmVkIHNlY3Rpb24uXG5cdCAqL1xuXHR1bnBpbk1vZGVsKG1vZGVsSWRlbnRpZmllcjogc3RyaW5nKTogdm9pZDtcblxuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIHRoZSBnaXZlbiBtb2RlbCBpcyBwaW5uZWQuXG5cdCAqL1xuXHRpc01vZGVsUGlubmVkKG1vZGVsSWRlbnRpZmllcjogc3RyaW5nKTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogRmlyZXMgd2hlbiB0aGUgcGlubmVkIG1vZGVscyBsaXN0IGNoYW5nZXMuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVBpbm5lZE1vZGVsczogRXZlbnQ8dm9pZD47XG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciB0aGUgZ2l2ZW4gbW9kZWwgaXMgaGlkZGVuIGZyb20gdGhlIGNoYXQgbW9kZWwgcGlja2VyLlxuXHQgKi9cblx0aXNNb2RlbEhpZGRlbihtb2RlbElkZW50aWZpZXI6IHN0cmluZyk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciBldmVyeSByZXNvbHZlZCBtb2RlbCBpbiB0aGUgZ2l2ZW4gKHZlbmRvciwgZ3JvdXBOYW1lKVxuXHQgKiBidWNrZXQgaXMgaGlkZGVuIGZyb20gdGhlIGNoYXQgbW9kZWwgcGlja2VyLlxuXHQgKi9cblx0aXNHcm91cEhpZGRlbih2ZW5kb3I6IHN0cmluZywgZ3JvdXBOYW1lOiBzdHJpbmcpOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBIaWRlIG9yIHNob3cgYSBzaW5nbGUgbW9kZWwgaW4gdGhlIGNoYXQgbW9kZWwgcGlja2VyLlxuXHQgKi9cblx0c2V0TW9kZWxIaWRkZW4obW9kZWxJZGVudGlmaWVyOiBzdHJpbmcsIGhpZGRlbjogYm9vbGVhbik6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEhpZGUgb3Igc2hvdyBtdWx0aXBsZSBleGFjdCBtb2RlbCBpZGVudGlmaWVycyBpbiB0aGUgY2hhdCBtb2RlbCBwaWNrZXIuXG5cdCAqL1xuXHRzZXRNb2RlbHNIaWRkZW4obW9kZWxJZGVudGlmaWVyczogcmVhZG9ubHkgc3RyaW5nW10sIGhpZGRlbjogYm9vbGVhbik6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEhpZGUgb3Igc2hvdyBldmVyeSBtb2RlbCBpbiBhICh2ZW5kb3IsIGdyb3VwTmFtZSkgYnVja2V0LlxuXHQgKi9cblx0c2V0R3JvdXBIaWRkZW4odmVuZG9yOiBzdHJpbmcsIGdyb3VwTmFtZTogc3RyaW5nLCBoaWRkZW46IGJvb2xlYW4pOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBwZXJzaXN0ZWQgcGVyLW1vZGVsIGhpZGRlbiBpZGVudGlmaWVycy5cblx0ICovXG5cdGdldEhpZGRlbk1vZGVsSWRzKCk6IHN0cmluZ1tdO1xuXG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuIGFueSBtb2RlbCBvciBncm91cCB2aXNpYmlsaXR5IHN0YXRlIGNoYW5nZXMuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU1vZGVsVmlzaWJpbGl0eTogRXZlbnQ8dm9pZD47XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIG1vZGVscyBmcm9tIHRoZSBjb250cm9sIG1hbmlmZXN0LFxuXHQgKiBzZXBhcmF0ZWQgaW50byBmcmVlIGFuZCBwYWlkIHRpZXJzLlxuXHQgKi9cblx0Z2V0TW9kZWxzQ29udHJvbE1hbmlmZXN0KCk6IElNb2RlbHNDb250cm9sTWFuaWZlc3Q7XG5cblx0LyoqXG5cdCAqIEZpcmVzIHdoZW4gbW9kZWxzIGNvbnRyb2wgbWFuaWZlc3QgY2hhbmdlcy5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWxzQ29udHJvbE1hbmlmZXN0OiBFdmVudDxJTW9kZWxzQ29udHJvbE1hbmlmZXN0PjtcblxuXHQvKipcblx0ICogT2JzZXJ2YWJsZSBtYXAgb2YgcmVzdHJpY3RlZCBjaGF0IHBhcnRpY2lwYW50IG5hbWVzIHRvIGFsbG93ZWQgZXh0ZW5zaW9uIHB1Ymxpc2hlci9JRHMuXG5cdCAqIEZldGNoZWQgZnJvbSB0aGUgY2hhdCBjb250cm9sIG1hbmlmZXN0LlxuXHQgKi9cblx0cmVhZG9ubHkgcmVzdHJpY3RlZENoYXRQYXJ0aWNpcGFudHM6IElPYnNlcnZhYmxlPHsgW25hbWU6IHN0cmluZ106IHN0cmluZ1tdIH0+O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGlzcGxheU5hbWUobGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCB2ZW5kb3I6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICh2ZW5kb3IgPT09ICdjb3BpbG90Y2xpJykge1xuXHRcdC8vIEB2cml0YW50MjQ6IFRoaXMgaXMgdGVtcG9yYXJ5IHVudGlsIHdlIGhhdmUgZGlzdGluY3QgdmVuZG9ycyBmb3IgQ29waWxvdCBDTEkgYW5kIENvcGlsb3QgQ2hhdC5cblx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXQubGFuZ3VhZ2VNb2RlbFByb3ZpZGVyLmNvcGlsb3QnLCBcIkNvcGlsb3RcIik7XG5cdH1cblx0Y29uc3QgZGVzY3JpcHRvciA9IGxhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRWZW5kb3JzKCkuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLnZlbmRvciA9PT0gdmVuZG9yKTtcblx0cmV0dXJuIGRlc2NyaXB0b3I/LmRpc3BsYXlOYW1lID8/IHZlbmRvci5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHZlbmRvci5zbGljZSgxKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldExhbmd1YWdlTW9kZWxEaXNwbGF5TmFtZVdpdGhQcm92aWRlcihtb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyLCBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UpOiBzdHJpbmcge1xuXHRjb25zdCB7IG1ldGFkYXRhIH0gPSBtb2RlbDtcblx0aWYgKCFtZXRhZGF0YS5pc0JZT0sgJiYgIW1ldGFkYXRhLmJ5b2tNb2RlbElkZW50aWZpZXIpIHtcblx0XHRyZXR1cm4gbWV0YWRhdGEubmFtZTtcblx0fVxuXG5cdGNvbnN0IG9yaWdpbmFsSWRlbnRpZmllciA9IG1ldGFkYXRhLmJ5b2tNb2RlbElkZW50aWZpZXIgPz8gbW9kZWwuaWRlbnRpZmllcjtcblx0Y29uc3Qgb3JpZ2luYWxNZXRhZGF0YSA9IG1ldGFkYXRhLmJ5b2tNb2RlbElkZW50aWZpZXIgPyBsYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChvcmlnaW5hbElkZW50aWZpZXIpIDogbWV0YWRhdGE7XG5cdGNvbnN0IHByb3ZpZGVyVmVuZG9yID0gb3JpZ2luYWxNZXRhZGF0YT8udmVuZG9yID8/IG1ldGFkYXRhLm1vZGVsR3JvdXA/LmlkID8/IG1ldGFkYXRhLnZlbmRvcjtcblx0Y29uc3QgcHJvdmlkZXJOYW1lID0gZ2V0TGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGlzcGxheU5hbWUobGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBwcm92aWRlclZlbmRvcik7XG5cdGNvbnN0IGlkZW50aWZpZXJTdWZmaXggPSBvcmlnaW5hbE1ldGFkYXRhPy5pZDtcblx0Y29uc3QgbW9kZWxOYW1lID0gaWRlbnRpZmllclN1ZmZpeCAmJiBtZXRhZGF0YS5uYW1lLmVuZHNXaXRoKGAgKCR7aWRlbnRpZmllclN1ZmZpeH0pYClcblx0XHQ/IG1ldGFkYXRhLm5hbWUuc2xpY2UoMCwgLWlkZW50aWZpZXJTdWZmaXgubGVuZ3RoIC0gMylcblx0XHQ6IG1ldGFkYXRhLm5hbWU7XG5cdGNvbnN0IGdyb3VwTmFtZSA9IGxhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRMYW5ndWFnZU1vZGVsR3JvdXBzKHByb3ZpZGVyVmVuZG9yKVxuXHRcdC5maW5kKGdyb3VwID0+IGdyb3VwLm1vZGVsSWRlbnRpZmllcnMuaW5jbHVkZXMob3JpZ2luYWxJZGVudGlmaWVyKSlcblx0XHQ/Lmdyb3VwPy5uYW1lO1xuXHRyZXR1cm4gZ3JvdXBOYW1lICYmIGdyb3VwTmFtZSAhPT0gcHJvdmlkZXJOYW1lXG5cdFx0PyBsb2NhbGl6ZSgnY2hhdC5sYW5ndWFnZU1vZGVsTmFtZVdpdGhQcm92aWRlckFuZEdyb3VwJywgXCJ7MH0vezF9L3syfVwiLCBwcm92aWRlck5hbWUsIGdyb3VwTmFtZSwgbW9kZWxOYW1lKVxuXHRcdDogbG9jYWxpemUoJ2NoYXQubGFuZ3VhZ2VNb2RlbE5hbWVXaXRoUHJvdmlkZXInLCBcInswfS97MX1cIiwgcHJvdmlkZXJOYW1lLCBtb2RlbE5hbWUpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNb2RlbENvbnRyb2xFbnRyeSB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGZlYXR1cmVkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgbWluVlNDb2RlVmVyc2lvbj86IHN0cmluZztcblx0cmVhZG9ubHkgZXhpc3RzOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNb2RlbHNDb250cm9sTWFuaWZlc3Qge1xuXHRyZWFkb25seSBmcmVlOiBJU3RyaW5nRGljdGlvbmFyeTxJTW9kZWxDb250cm9sRW50cnk+O1xuXHRyZWFkb25seSBwYWlkOiBJU3RyaW5nRGljdGlvbmFyeTxJTW9kZWxDb250cm9sRW50cnk+O1xufVxuXG5jb25zdCBsYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyVHlwZSA9IHtcblx0dHlwZTogJ29iamVjdCcsXG5cdHJlcXVpcmVkOiBbJ3ZlbmRvcicsICdkaXNwbGF5TmFtZSddLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0dmVuZG9yOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5sYW5ndWFnZU1vZGVscy52ZW5kb3InLCBcIkEgZ2xvYmFsbHkgdW5pcXVlIHZlbmRvciBvZiBsYW5ndWFnZSBtb2RlbCBjaGF0IHByb3ZpZGVyLlwiKVxuXHRcdH0sXG5cdFx0ZGlzcGxheU5hbWU6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxhbmd1YWdlTW9kZWxzLmRpc3BsYXlOYW1lJywgXCJUaGUgZGlzcGxheSBuYW1lIG9mIHRoZSBsYW5ndWFnZSBtb2RlbCBjaGF0IHByb3ZpZGVyLlwiKVxuXHRcdH0sXG5cdFx0Y29uZmlndXJhdGlvbjoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubGFuZ3VhZ2VNb2RlbHMuY29uZmlndXJhdGlvbicsIFwiQ29uZmlndXJhdGlvbiBvcHRpb25zIGZvciB0aGUgbGFuZ3VhZ2UgbW9kZWwgY2hhdCBwcm92aWRlci5cIiksXG5cdFx0XHRhbnlPZjogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0JHJlZjogJ2h0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDcvc2NoZW1hIydcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0JHJlZjogJ2h0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDcvc2NoZW1hIycsXG5cdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0c2VjcmV0OiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxhbmd1YWdlTW9kZWxzLmNvbmZpZ3VyYXRpb24uc2VjcmV0JywgXCJXaGV0aGVyIHRoZSBwcm9wZXJ0eSBpcyBhIHNlY3JldC5cIilcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHQkcmVmOiAnaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNy9zY2hlbWEjJyxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdHNlY3JldDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxhbmd1YWdlTW9kZWxzLmNvbmZpZ3VyYXRpb24uc2VjcmV0JywgXCJXaGV0aGVyIHRoZSBwcm9wZXJ0eSBpcyBhIHNlY3JldC5cIilcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdF1cblxuXHRcdH0sXG5cdFx0bWFuYWdlbWVudENvbW1hbmQ6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxhbmd1YWdlTW9kZWxzLm1hbmFnZW1lbnRDb21tYW5kJywgXCJBIGNvbW1hbmQgdG8gbWFuYWdlIHRoZSBsYW5ndWFnZSBtb2RlbCBjaGF0IHByb3ZpZGVyLCBlLmcuICdNYW5hZ2UgQ29waWxvdCBtb2RlbHMnLiBUaGlzIGlzIHVzZWQgaW4gdGhlIGNoYXQgbW9kZWwgcGlja2VyLiBJZiBub3QgcHJvdmlkZWQsIGEgZ2VhciBpY29uIGlzIG5vdCByZW5kZXJlZCBkdXJpbmcgdmVuZG9yIHNlbGVjdGlvbi5cIiksXG5cdFx0XHRkZXByZWNhdGVkOiB0cnVlLFxuXHRcdFx0ZGVwcmVjYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5sYW5ndWFnZU1vZGVscy5tYW5hZ2VtZW50Q29tbWFuZC5kZXByZWNhdGVkJywgXCJUaGUgbWFuYWdlbWVudENvbW1hbmQgcHJvcGVydHkgaXMgZGVwcmVjYXRlZCBhbmQgd2lsbCBiZSByZW1vdmVkIGluIGEgZnV0dXJlIHJlbGVhc2UuIFVzZSB0aGUgbmV3IGNvbmZpZ3VyYXRpb24gcHJvcGVydHkgaW5zdGVhZC5cIilcblx0XHR9LFxuXHRcdGRlcHJlY2F0aW9uOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5sYW5ndWFnZU1vZGVscy5kZXByZWNhdGlvbicsIFwiTWFya3MgdGhpcyBsYW5ndWFnZSBtb2RlbCBjaGF0IHByb3ZpZGVyIGFzIGRlcHJlY2F0ZWQuIFdoZW4gc2V0LCB0aGUgTWFuYWdlIE1vZGVscyB2aWV3IHJlbmRlcnMgdGhlIHByb3ZpZGVyIHdpdGggYSBsaW5rIHBvaW50aW5nIHRvIGEgcmVwbGFjZW1lbnQuXCIpLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRsaW5rOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxhbmd1YWdlTW9kZWxzLmRlcHJlY2F0aW9uLmxpbmsnLCBcIkEgVVJMIG9wZW5lZCB3aGVuIHRoZSB1c2VyIGNsaWNrcyB0aGUgZGVwcmVjYXRpb24gbGluayBzaG93biBuZXh0IHRvIHRoZSBwcm92aWRlciBuYW1lLiBVc2UgYSAndnNjb2RlOmV4dGVuc2lvbi88cHVibGlzaGVyPi48bmFtZT4nIFVSSSB0byBvcGVuIGEgcmVwbGFjZW1lbnQgZXh0ZW5zaW9uIGluIHRoZSBFeHRlbnNpb25zIHZpZXcuXCIpXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRcdHdoZW46IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxhbmd1YWdlTW9kZWxzLndoZW4nLCBcIkNvbmRpdGlvbiB3aGljaCBtdXN0IGJlIHRydWUgdG8gc2hvdyB0aGlzIGxhbmd1YWdlIG1vZGVsIGNoYXQgcHJvdmlkZXIgaW4gdGhlIE1hbmFnZSBNb2RlbHMgbGlzdC5cIilcblx0XHR9XG5cdH1cbn0gYXMgY29uc3Qgc2F0aXNmaWVzIElKU09OU2NoZW1hO1xuXG5leHBvcnQgdHlwZSBJVXNlckZyaWVuZGx5TGFuZ3VhZ2VNb2RlbCA9IE9taXQ8VHlwZUZyb21Kc29uU2NoZW1hPHR5cGVvZiBsYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyVHlwZT4sICdkZXByZWNhdGlvbic+ICYge1xuXHQvKipcblx0ICogTWFya3MgYSBwcm92aWRlciBhcyBkZXByZWNhdGVkLiBUaGUgTWFuYWdlIE1vZGVscyB2aWV3IHJlbmRlcnMgYSBsaW5rXG5cdCAqIChwb2ludGluZyB0byBhIHJlcGxhY2VtZW50LCBlLmcuIGEgYHZzY29kZTpleHRlbnNpb24vPHB1Ymxpc2hlcj4uPG5hbWU+YCBVUkkpXG5cdCAqIG5leHQgdG8gdGhlIHByb3ZpZGVyIG5hbWUuIE9wdGlvbmFsIHNvIGV4aXN0aW5nIHByb3ZpZGVyIGRlc2NyaXB0b3JzIGFyZSB1bmFmZmVjdGVkLlxuXHQgKi9cblx0cmVhZG9ubHkgZGVwcmVjYXRpb24/OiB7IHJlYWRvbmx5IGxpbms/OiBzdHJpbmcgfTtcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxhbmd1YWdlTW9kZWxQcm92aWRlckRlc2NyaXB0b3IgZXh0ZW5kcyBJVXNlckZyaWVuZGx5TGFuZ3VhZ2VNb2RlbCB7XG5cdHJlYWRvbmx5IGlzRGVmYXVsdDogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBSZXNvbHZlcyBhIHByb3ZpZGVyIGBkZXByZWNhdGlvbi5saW5rYCBmb3Igb3BlbmluZyBpbnNpZGUgdGhlIGN1cnJlbnQgYnVpbGQuIENvbnRyaWJ1dGlvbnMgcG9pbnRcbiAqIGF0IHRoZSByZXBsYWNlbWVudCBleHRlbnNpb24gd2l0aCBhIHN0YWJsZSBgdnNjb2RlOmV4dGVuc2lvbi88aWQ+YCBVUkksIGJ1dCB0aGUgVVJMIHNlcnZpY2Ugb25seVxuICogcm91dGVzIFVSSXMgd2hvc2Ugc2NoZW1lIG1hdGNoZXMgdGhpcyBidWlsZCdzIGB1cmxQcm90b2NvbGAgKGUuZy4gYGNvZGUtb3NzYCwgYHZzY29kZS1pbnNpZGVyc2ApLlxuICogVGhlIGB2c2NvZGU6YCBzY2hlbWUgaXMgdGhlcmVmb3JlIHJld3JpdHRlbiB0byB0aGUgY3VycmVudCBwcm90b2NvbCBzbyB0aGUgZXh0ZW5zaW9ucyBVUkwgaGFuZGxlclxuICogb3BlbnMgdGhlIGV4dGVuc2lvbjsgd2l0aG91dCB0aGlzIHRoZSBvcGVuZXIgZmFsbHMgYmFjayB0byB0cmVhdGluZyB0aGUgVVJJIGFzIGEgKG5vbi1leGlzdGVudClcbiAqIGZpbGUgcmVzb3VyY2UgYW5kIGZhaWxzLiBPdGhlciBzY2hlbWVzIChodHRwKHMpLCBjb21tYW5kKSBhcmUgcmV0dXJuZWQgdW5jaGFuZ2VkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZVByb3ZpZGVyRGVwcmVjYXRpb25MaW5rKGxpbms6IHN0cmluZywgdXJsUHJvdG9jb2w6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFVSSSB7XG5cdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShsaW5rKTtcblx0cmV0dXJuIHVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlICYmIHVybFByb3RvY29sID8gdXJpLndpdGgoeyBzY2hlbWU6IHVybFByb3RvY29sIH0pIDogdXJpO1xufVxuXG5leHBvcnQgY29uc3QgbGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlckV4dGVuc2lvblBvaW50ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8SVVzZXJGcmllbmRseUxhbmd1YWdlTW9kZWwgfCBJVXNlckZyaWVuZGx5TGFuZ3VhZ2VNb2RlbFtdPih7XG5cdGV4dGVuc2lvblBvaW50OiAnbGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlcnMnLFxuXHRqc29uU2NoZW1hOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXJzJywgXCJDb250cmlidXRlIGxhbmd1YWdlIG1vZGVsIGNoYXQgcHJvdmlkZXJzIG9mIGEgc3BlY2lmaWMgdmVuZG9yLlwiKSxcblx0XHRvbmVPZjogW1xuXHRcdFx0bGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlclR5cGUsXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGl0ZW1zOiBsYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyVHlwZVxuXHRcdFx0fVxuXHRcdF1cblx0fSxcblx0YWN0aXZhdGlvbkV2ZW50c0dlbmVyYXRvcjogZnVuY3Rpb24qIChjb250cmliczogcmVhZG9ubHkgSVVzZXJGcmllbmRseUxhbmd1YWdlTW9kZWxbXSkge1xuXHRcdGZvciAoY29uc3QgY29udHJpYiBvZiBjb250cmlicykge1xuXHRcdFx0eWllbGQgYG9uTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlcjoke2NvbnRyaWIudmVuZG9yfWA7XG5cdFx0fVxuXHR9XG59KTtcblxuY29uc3QgQ0hBVF9NT0RFTF9SRUNFTlRMWV9VU0VEX1NUT1JBR0VfS0VZID0gJ2NoYXRNb2RlbFJlY2VudGx5VXNlZCc7XG5jb25zdCBDSEFUX01PREVMX1BJTk5FRF9TVE9SQUdFX0tFWSA9ICdjaGF0TW9kZWxQaW5uZWQnO1xuY29uc3QgQ0hBVF9NT0RFTF9WSVNJQklMSVRZX1NUT1JBR0VfS0VZID0gJ2NoYXRNb2RlbFZpc2liaWxpdHknO1xuXG4vKipcbiAqIFRoZSBpZGVudGlmaWVyIGZvciB0aGUgQXV0byBtb2RlbCB3aGljaCBkeW5hbWljYWxseSByb3V0ZXMgdG8gdGhlIGJlc3QgYmFja2VuZC5cbiAqIEF1dG8gc2hvdWxkIG5ldmVyIGFwcGVhciBpbiB1c2VyLWN1cmF0ZWQgbGlzdHMgKE1SVSwgcGlubmVkKS5cbiAqL1xuY29uc3QgQVVUT19NT0RFTF9JREVOVElGSUVSID0gJ2NvcGlsb3QvYXV0byc7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0F1dG9MYW5ndWFnZU1vZGVsKG1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0cmV0dXJuIG1vZGVsPy5tZXRhZGF0YS5pZCA9PT0gJ2F1dG8nIHx8IG1vZGVsPy5pZGVudGlmaWVyID09PSBBVVRPX01PREVMX0lERU5USUZJRVI7XG59XG5cbmNvbnN0IENIQVRfUEFSVElDSVBBTlRfTkFNRV9SRUdJU1RSWV9TVE9SQUdFX0tFWSA9ICdjaGF0LnBhcnRpY2lwYW50TmFtZVJlZ2lzdHJ5JztcbmNvbnN0IENIQVRfTU9ERUxTX0NPTlRST0xfU1RPUkFHRV9LRVkgPSAnY2hhdC5tb2RlbHNDb250cm9sJztcblxuaW50ZXJmYWNlIElDaGF0Q29udHJvbFJlc3BvbnNlIHtcblx0cmVhZG9ubHkgdmVyc2lvbjogbnVtYmVyO1xuXHRyZWFkb25seSByZXN0cmljdGVkQ2hhdFBhcnRpY2lwYW50czogeyBbbmFtZTogc3RyaW5nXTogc3RyaW5nW10gfTtcblx0cmVhZG9ubHkgbW9kZWxzPzoge1xuXHRcdHJlYWRvbmx5IGZyZWU/OiBSZWNvcmQ8c3RyaW5nLCB7IHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7IHJlYWRvbmx5IGZlYXR1cmVkPzogYm9vbGVhbiB9Pjtcblx0XHRyZWFkb25seSBwYWlkPzogUmVjb3JkPHN0cmluZywgeyByZWFkb25seSBsYWJlbDogc3RyaW5nOyByZWFkb25seSBmZWF0dXJlZD86IGJvb2xlYW47IHJlYWRvbmx5IG1pblZTQ29kZVZlcnNpb24/OiBzdHJpbmcgfT47XG5cdH07XG59XG5cbi8qKlxuICogQnVpbGRzIHRoZSBwZXItbW9kZWwgY29uZmlndXJhdGlvbiBzdWJtZW51IGFjdGlvbnMgZnJvbSBhIG1vZGVsJ3NcbiAqIHtAbGluayBJTGFuZ3VhZ2VNb2RlbENvbmZpZ3VyYXRpb25TY2hlbWF9LiBUaGUgY3VycmVudCB2YWx1ZSBpcyByZWFkIGZyb21cbiAqIGBjdXJyZW50Q29uZmlnYCBhbmQgc2VsZWN0aW9ucyBhcmUgcm91dGVkIHRocm91Z2ggYHNldFZhbHVlYCwgYWxsb3dpbmcgdGhlXG4gKiBjYWxsZXIgdG8gZGVjaWRlIHdoZXRoZXIgY2hhbmdlcyBhcHBseSBnbG9iYWxseSBvciB0byBhIHBlci1lZGl0b3Igb3ZlcnJpZGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNb2RlbENvbmZpZ3VyYXRpb25BY3Rpb25zKFxuXHRzY2hlbWE6IElMYW5ndWFnZU1vZGVsQ29uZmlndXJhdGlvblNjaGVtYSB8IHVuZGVmaW5lZCxcblx0Y3VycmVudENvbmZpZzogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4sXG5cdHNldFZhbHVlOiAoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKSA9PiB2b2lkLFxuKTogSUFjdGlvbltdIHtcblx0aWYgKCFzY2hlbWE/LnByb3BlcnRpZXMpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblxuXHRmb3IgKGNvbnN0IFtrZXksIHByb3BTY2hlbWFdIG9mIE9iamVjdC5lbnRyaWVzKHNjaGVtYS5wcm9wZXJ0aWVzKSkge1xuXHRcdGlmICghcHJvcFNjaGVtYS5lbnVtIHx8ICFBcnJheS5pc0FycmF5KHByb3BTY2hlbWEuZW51bSkgfHwgcHJvcFNjaGVtYS5lbnVtLmxlbmd0aCA8IDEpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCBjdXJyZW50VmFsdWUgPSBjdXJyZW50Q29uZmlnW2tleV0gPz8gcHJvcFNjaGVtYS5kZWZhdWx0O1xuXHRcdGNvbnN0IGxhYmVsID0gKHR5cGVvZiBwcm9wU2NoZW1hLnRpdGxlID09PSAnc3RyaW5nJyA/IHByb3BTY2hlbWEudGl0bGUgOiB1bmRlZmluZWQpXG5cdFx0XHQ/PyBrZXkucmVwbGFjZSgvKFthLXpdKShbQS1aXSkvZywgJyQxICQyJylcblx0XHRcdFx0LnJlcGxhY2UoL14uLywgcyA9PiBzLnRvVXBwZXJDYXNlKCkpO1xuXHRcdGNvbnN0IGRlZmF1bHRWYWx1ZSA9IHByb3BTY2hlbWEuZGVmYXVsdDtcblx0XHRjb25zdCBlbnVtSXRlbUxhYmVscyA9IHByb3BTY2hlbWEuZW51bUl0ZW1MYWJlbHM7XG5cdFx0Y29uc3QgZW51bURlc2NyaXB0aW9ucyA9IHByb3BTY2hlbWEuZW51bURlc2NyaXB0aW9ucztcblx0XHRjb25zdCBlbnVtQWN0aW9uczogSUFjdGlvbltdID0gcHJvcFNjaGVtYS5lbnVtLm1hcCgodmFsdWU6IHVua25vd24sIGluZGV4OiBudW1iZXIpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1MYWJlbCA9IGVudW1JdGVtTGFiZWxzPy5baW5kZXhdID8/IFN0cmluZyh2YWx1ZSk7XG5cdFx0XHRjb25zdCBkaXNwbGF5TGFiZWwgPSB2YWx1ZSA9PT0gZGVmYXVsdFZhbHVlID8gbG9jYWxpemUoJ21vZGVscy5lbnVtRGVmYXVsdCcsIFwiezB9IChkZWZhdWx0KVwiLCBpdGVtTGFiZWwpIDogaXRlbUxhYmVsO1xuXHRcdFx0Y29uc3QgdG9vbHRpcCA9IGVudW1EZXNjcmlwdGlvbnM/LltpbmRleF0gPz8gJyc7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogYGNvbmZpZ3VyZU1vZGVsLiR7a2V5fS4ke3ZhbHVlfWAsXG5cdFx0XHRcdGxhYmVsOiBkaXNwbGF5TGFiZWwsXG5cdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHRvb2x0aXAsXG5cdFx0XHRcdGNoZWNrZWQ6IGN1cnJlbnRWYWx1ZSA9PT0gdmFsdWUsXG5cdFx0XHRcdHJ1bjogKCkgPT4gc2V0VmFsdWUoa2V5LCB2YWx1ZSlcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0YWN0aW9ucy5wdXNoKG5ldyBTdWJtZW51QWN0aW9uKGBjb25maWd1cmVNb2RlbC4ke2tleX1gLCBsYWJlbCwgZW51bUFjdGlvbnMpKTtcblx0fVxuXG5cdHJldHVybiBhY3Rpb25zO1xufVxuXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIGltcGxlbWVudHMgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgU0VDUkVUX0tFWV9QUkVGSVggPSAnY2hhdC5sbS5zZWNyZXQuJztcblx0cHJpdmF0ZSBzdGF0aWMgU0VDUkVUX0lOUFVUID0gJyR7aW5wdXQ6ezB9fSc7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVycyA9IG5ldyBNYXA8c3RyaW5nLCBJTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdmVuZG9ycyA9IG5ldyBNYXA8c3RyaW5nLCBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGVzY3JpcHRvcj4oKTtcblxuXHQvKiogVmVuZG9ycyBmb3Igd2hpY2ggYSBkZXByZWNhdGlvbiBub3RpY2UgaGFzIGFscmVhZHkgYmVlbiBzaG93biB0aGlzIHNlc3Npb24uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlcHJlY2F0aW9uTm90aWNlU2hvd25WZW5kb3JzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsVmVuZG9ycyA9IHRoaXMuX3N0b3JlLmFkZChuZXcgRW1pdHRlcjxzdHJpbmdbXT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbFZlbmRvcnMgPSB0aGlzLl9vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxWZW5kb3JzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsc0dyb3VwcyA9IG5ldyBNYXA8c3RyaW5nLCBJTGFuZ3VhZ2VNb2RlbHNHcm91cFtdPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvbHZlTE1TZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyQnlLZXk8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbENvbmZpZ3VyYXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNVc2VyU2VsZWN0YWJsZU1vZGVsczogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hhc05vbkNvcGlsb3RVc2VyU2VsZWN0YWJsZU1vZGVsczogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25MYW5ndWFnZU1vZGVsQ2hhbmdlID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHM6IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vbkxhbmd1YWdlTW9kZWxDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfcmVjZW50bHlVc2VkTW9kZWxJZHM6IHN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgX3Bpbm5lZE1vZGVsSWRzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdHByaXZhdGUgX2hpZGRlbk1vZGVsSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VNb2RlbHNDb250cm9sTWFuaWZlc3QgPSB0aGlzLl9zdG9yZS5hZGQobmV3IEVtaXR0ZXI8SU1vZGVsc0NvbnRyb2xNYW5pZmVzdD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWxzQ29udHJvbE1hbmlmZXN0ID0gdGhpcy5fb25EaWRDaGFuZ2VNb2RlbHNDb250cm9sTWFuaWZlc3QuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQaW5uZWRNb2RlbHMgPSB0aGlzLl9zdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUGlubmVkTW9kZWxzID0gdGhpcy5fb25EaWRDaGFuZ2VQaW5uZWRNb2RlbHMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VNb2RlbFZpc2liaWxpdHkgPSB0aGlzLl9zdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWxWaXNpYmlsaXR5ID0gdGhpcy5fb25EaWRDaGFuZ2VNb2RlbFZpc2liaWxpdHkuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfbW9kZWxzQ29udHJvbE1hbmlmZXN0OiBJTW9kZWxzQ29udHJvbE1hbmlmZXN0ID0geyBmcmVlOiB7fSwgcGFpZDoge30gfTtcblx0cHJpdmF0ZSBfbW9kZWxzQ29udHJvbFJhd1Jlc3BvbnNlOiBJQ2hhdENvbnRyb2xSZXNwb25zZVsnbW9kZWxzJ10gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfY2hhdENvbnRyb2xVcmw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY2hhdENvbnRyb2xEaXNwb3NlZCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc3RyaWN0ZWRDaGF0UGFydGljaXBhbnRzID0gb2JzZXJ2YWJsZVZhbHVlPHsgW25hbWU6IHN0cmluZ106IHN0cmluZ1tdIH0+KHRoaXMsIE9iamVjdC5jcmVhdGUobnVsbCkpO1xuXHRyZWFkb25seSByZXN0cmljdGVkQ2hhdFBhcnRpY2lwYW50czogSU9ic2VydmFibGU8eyBbbmFtZTogc3RyaW5nXTogc3RyaW5nW10gfT4gPSB0aGlzLl9yZXN0cmljdGVkQ2hhdFBhcnRpY2lwYW50cztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASVNlY3JldFN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3NlY3JldFN0b3JhZ2VTZXJ2aWNlOiBJU2VjcmV0U3RvcmFnZVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJUmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVxdWVzdFNlcnZpY2U6IElSZXF1ZXN0U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5faGFzVXNlclNlbGVjdGFibGVNb2RlbHMgPSBDaGF0Q29udGV4dEtleXMubGFuZ3VhZ2VNb2RlbHNBcmVVc2VyU2VsZWN0YWJsZS5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9oYXNOb25Db3BpbG90VXNlclNlbGVjdGFibGVNb2RlbHMgPSBDaGF0Q29udGV4dEtleXMubm9uQ29waWxvdExhbmd1YWdlTW9kZWxzQXJlVXNlclNlbGVjdGFibGUuYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVjZW50bHlVc2VkTW9kZWxJZHMgPSB0aGlzLl9yZWFkUmVjZW50bHlVc2VkTW9kZWxzKCk7XG5cdFx0dGhpcy5fcGlubmVkTW9kZWxJZHMgPSB0aGlzLl9yZWFkUGlubmVkTW9kZWxzKCk7XG5cdFx0dGhpcy5fcmVhZFZpc2liaWxpdHkoKTtcblx0XHR0aGlzLl9pbml0Q2hhdENvbnRyb2xEYXRhKCk7XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzKCgpID0+IHtcblx0XHRcdGxldCBoYXNVc2VyU2VsZWN0YWJsZSA9IGZhbHNlO1xuXHRcdFx0bGV0IGhhc05vbkNvcGlsb3RVc2VyU2VsZWN0YWJsZSA9IGZhbHNlO1xuXHRcdFx0Zm9yIChjb25zdCBtb2RlbCBvZiB0aGlzLl9tb2RlbENhY2hlLnZhbHVlcygpKSB7XG5cdFx0XHRcdGlmIChtb2RlbC5pc1VzZXJTZWxlY3RhYmxlID09PSBmYWxzZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGhhc1VzZXJTZWxlY3RhYmxlID0gdHJ1ZTtcblx0XHRcdFx0aWYgKG1vZGVsLnZlbmRvciAhPT0gQ09QSUxPVF9WRU5ET1JfSUQpIHtcblx0XHRcdFx0XHRoYXNOb25Db3BpbG90VXNlclNlbGVjdGFibGUgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9oYXNVc2VyU2VsZWN0YWJsZU1vZGVscy5zZXQoaGFzVXNlclNlbGVjdGFibGUpO1xuXHRcdFx0dGhpcy5faGFzTm9uQ29waWxvdFVzZXJTZWxlY3RhYmxlTW9kZWxzLnNldChoYXNOb25Db3BpbG90VXNlclNlbGVjdGFibGUpO1xuXHRcdFx0dGhpcy5fcmVmcmVzaE1vZGVsc0NvbnRyb2xNYW5pZmVzdCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5fbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxHcm91cHMoY2hhbmdlZEdyb3VwcyA9PiB0aGlzLl9vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxHcm91cHMoY2hhbmdlZEdyb3VwcykpKTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZChsYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyRXh0ZW5zaW9uUG9pbnQuc2V0SGFuZGxlcigoZXh0ZW5zaW9ucywgeyBhZGRlZCwgcmVtb3ZlZCB9KSA9PiB7XG5cdFx0XHRjb25zdCBhZGRlZFZlbmRvcnM6IElVc2VyRnJpZW5kbHlMYW5ndWFnZU1vZGVsW10gPSBbXTtcblx0XHRcdGNvbnN0IHJlbW92ZWRWZW5kb3JzOiBJVXNlckZyaWVuZGx5TGFuZ3VhZ2VNb2RlbFtdID0gW107XG5cblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGFkZGVkKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBJdGVyYWJsZS53cmFwKGV4dGVuc2lvbi52YWx1ZSkpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5fdmVuZG9ycy5oYXMoaXRlbS52ZW5kb3IpKSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxhbmd1YWdlTW9kZWxzLnZlbmRvckFscmVhZHlSZWdpc3RlcmVkJywgXCJUaGUgdmVuZG9yICd7MH0nIGlzIGFscmVhZHkgcmVnaXN0ZXJlZCBhbmQgY2Fubm90IGJlIHJlZ2lzdGVyZWQgdHdpY2VcIiwgaXRlbS52ZW5kb3IpKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoaXNGYWxzeU9yV2hpdGVzcGFjZShpdGVtLnZlbmRvcikpIHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubGFuZ3VhZ2VNb2RlbHMuZW1wdHlWZW5kb3InLCBcIlRoZSB2ZW5kb3IgZmllbGQgY2Fubm90IGJlIGVtcHR5LlwiKSk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGl0ZW0udmVuZG9yLnRyaW0oKSAhPT0gaXRlbS52ZW5kb3IpIHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubGFuZ3VhZ2VNb2RlbHMud2hpdGVzcGFjZVZlbmRvcicsIFwiVGhlIHZlbmRvciBmaWVsZCBjYW5ub3Qgc3RhcnQgb3IgZW5kIHdpdGggd2hpdGVzcGFjZS5cIikpO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGFkZGVkVmVuZG9ycy5wdXNoKGl0ZW0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIHJlbW92ZWQpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIEl0ZXJhYmxlLndyYXAoZXh0ZW5zaW9uLnZhbHVlKSkge1xuXHRcdFx0XHRcdHJlbW92ZWRWZW5kb3JzLnB1c2goaXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5kZWx0YUxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXJEZXNjcmlwdG9ycyhhZGRlZFZlbmRvcnMsIHJlbW92ZWRWZW5kb3JzKTtcblx0XHR9KSk7XG5cdH1cblxuXHRkZWx0YUxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXJEZXNjcmlwdG9ycyhhZGRlZDogSVVzZXJGcmllbmRseUxhbmd1YWdlTW9kZWxbXSwgcmVtb3ZlZDogSVVzZXJGcmllbmRseUxhbmd1YWdlTW9kZWxbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGFkZGVkVmVuZG9ySWRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHJlbW92ZWRWZW5kb3JJZHM6IHN0cmluZ1tdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgYWRkZWQpIHtcblx0XHRcdGlmICh0aGlzLl92ZW5kb3JzLmhhcyhpdGVtLnZlbmRvcikpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgVGhlIHZlbmRvciAnJHtpdGVtLnZlbmRvcn0nIGlzIGFscmVhZHkgcmVnaXN0ZXJlZCBhbmQgY2Fubm90IGJlIHJlZ2lzdGVyZWQgdHdpY2VgKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNGYWxzeU9yV2hpdGVzcGFjZShpdGVtLnZlbmRvcikpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignVGhlIHZlbmRvciBmaWVsZCBjYW5ub3QgYmUgZW1wdHkuJyk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGl0ZW0udmVuZG9yLnRyaW0oKSAhPT0gaXRlbS52ZW5kb3IpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignVGhlIHZlbmRvciBmaWVsZCBjYW5ub3Qgc3RhcnQgb3IgZW5kIHdpdGggd2hpdGVzcGFjZS4nKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB2ZW5kb3I6IElMYW5ndWFnZU1vZGVsUHJvdmlkZXJEZXNjcmlwdG9yID0ge1xuXHRcdFx0XHR2ZW5kb3I6IGl0ZW0udmVuZG9yLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogaXRlbS5kaXNwbGF5TmFtZSxcblx0XHRcdFx0Y29uZmlndXJhdGlvbjogaXRlbS5jb25maWd1cmF0aW9uLFxuXHRcdFx0XHRtYW5hZ2VtZW50Q29tbWFuZDogaXRlbS5tYW5hZ2VtZW50Q29tbWFuZCxcblx0XHRcdFx0ZGVwcmVjYXRpb246IGl0ZW0uZGVwcmVjYXRpb24sXG5cdFx0XHRcdHdoZW46IGl0ZW0ud2hlbixcblx0XHRcdFx0aXNEZWZhdWx0OiBpdGVtLnZlbmRvciA9PT0gQ09QSUxPVF9WRU5ET1JfSURcblx0XHRcdH07XG5cdFx0XHR0aGlzLl92ZW5kb3JzLnNldChpdGVtLnZlbmRvciwgdmVuZG9yKTtcblx0XHRcdGFkZGVkVmVuZG9ySWRzLnB1c2goaXRlbS52ZW5kb3IpO1xuXHRcdFx0Ly8gSGF2ZSBzb21lIG1vZGVscyB3ZSB3YW50IGZyb20gdGhpcyB2ZW5kb3IsIHNvIGFjdGl2YXRlIHRoZSBleHRlbnNpb25cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgcmVtb3ZlZCkge1xuXHRcdFx0dGhpcy5fdmVuZG9ycy5kZWxldGUoaXRlbS52ZW5kb3IpO1xuXHRcdFx0dGhpcy5fcHJvdmlkZXJzLmRlbGV0ZShpdGVtLnZlbmRvcik7XG5cdFx0XHR0aGlzLl9jbGVhck1vZGVsQ2FjaGUoaXRlbS52ZW5kb3IpO1xuXHRcdFx0dGhpcy5fbW9kZWxzR3JvdXBzLmRlbGV0ZShpdGVtLnZlbmRvcik7XG5cdFx0XHRyZW1vdmVkVmVuZG9ySWRzLnB1c2goaXRlbS52ZW5kb3IpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgW3ZlbmRvciwgX10gb2YgdGhpcy5fcHJvdmlkZXJzKSB7XG5cdFx0XHRpZiAoIXRoaXMuX3ZlbmRvcnMuaGFzKHZlbmRvcikpIHtcblx0XHRcdFx0dGhpcy5fcHJvdmlkZXJzLmRlbGV0ZSh2ZW5kb3IpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChhZGRlZFZlbmRvcklkcy5sZW5ndGggPiAwIHx8IHJlbW92ZWRWZW5kb3JJZHMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsVmVuZG9ycy5maXJlKFsuLi5hZGRlZFZlbmRvcklkcywgLi4ucmVtb3ZlZFZlbmRvcklkc10pO1xuXHRcdFx0aWYgKHJlbW92ZWRWZW5kb3JJZHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHZlbmRvciBvZiByZW1vdmVkVmVuZG9ySWRzKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25MYW5ndWFnZU1vZGVsQ2hhbmdlLmZpcmUodmVuZG9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbEdyb3VwcyhjaGFuZ2VkR3JvdXBzOiByZWFkb25seSBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjaGFuZ2VkVmVuZG9ycyA9IG5ldyBTZXQoY2hhbmdlZEdyb3Vwcy5tYXAoZyA9PiBnLnZlbmRvcikpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKEFycmF5LmZyb20oY2hhbmdlZFZlbmRvcnMpLm1hcCh2ZW5kb3IgPT4gdGhpcy5fcmVzb2x2ZUFsbExhbmd1YWdlTW9kZWxzKHZlbmRvciwgdHJ1ZSkpKTtcblx0fVxuXG5cdGdldFZlbmRvcnMoKTogSUxhbmd1YWdlTW9kZWxQcm92aWRlckRlc2NyaXB0b3JbXSB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5fdmVuZG9ycy52YWx1ZXMoKSlcblx0XHRcdC5maWx0ZXIodmVuZG9yID0+IHtcblx0XHRcdFx0aWYgKCF2ZW5kb3Iud2hlbikge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlOyAvLyBObyB3aGVuIGNsYXVzZSBtZWFucyBhbHdheXMgdmlzaWJsZVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHdoZW5DbGF1c2UgPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZSh2ZW5kb3Iud2hlbik7XG5cdFx0XHRcdHJldHVybiB3aGVuQ2xhdXNlID8gdGhpcy5fY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyh3aGVuQ2xhdXNlKSA6IGZhbHNlO1xuXHRcdFx0fSk7XG5cdH1cblxuXHRnZXRMYW5ndWFnZU1vZGVsSWRzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLl9tb2RlbENhY2hlLmtleXMoKSk7XG5cdH1cblxuXHRsb29rdXBMYW5ndWFnZU1vZGVsKG1vZGVsSWRlbnRpZmllcjogc3RyaW5nKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbENhY2hlLmdldChtb2RlbElkZW50aWZpZXIpO1xuXHR9XG5cblx0bG9va3VwTGFuZ3VhZ2VNb2RlbEJ5UXVhbGlmaWVkTmFtZShyZWZlcmVuY2VOYW1lOiBzdHJpbmcpOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgW2lkZW50aWZpZXIsIG1vZGVsXSBvZiB0aGlzLl9tb2RlbENhY2hlLmVudHJpZXMoKSkge1xuXHRcdFx0aWYgKElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLm1hdGNoZXNRdWFsaWZpZWROYW1lKHJlZmVyZW5jZU5hbWUsIG1vZGVsKSkge1xuXHRcdFx0XHRyZXR1cm4geyBtZXRhZGF0YTogbW9kZWwsIGlkZW50aWZpZXIgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVBbGxMYW5ndWFnZU1vZGVscyh2ZW5kb3JJZDogc3RyaW5nLCBzaWxlbnQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGNvbnN0IHZlbmRvciA9IHRoaXMuX3ZlbmRvcnMuZ2V0KHZlbmRvcklkKTtcblxuXHRcdGlmICghdmVuZG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSWYgYSBwcm92aWRlciBpcyBhbHJlYWR5IHJlZ2lzdGVyZWQgKGUuZy4gYSByZW5kZXJlci1zaWRlIHByb3ZpZGVyXG5cdFx0Ly8gc3VjaCBhcyB0aGUgYWdlbnQgaG9zdCksIHNraXAgdGhlIGFjdGl2YXRpb24gd2FpdCBcdTIwMTQgdGhlcmUncyBub3RoaW5nXG5cdFx0Ly8gbW9yZSBmb3IgYW4gZXh0ZW5zaW9uIHRvIGNvbnRyaWJ1dGUsIGFuZCB3YWl0aW5nIHdvdWxkIGJsb2NrIG9uXG5cdFx0Ly8gZXh0ZW5zaW9uIGhvc3Qgc3RhcnR1cCB1bm5lY2Vzc2FyaWx5LlxuXHRcdGxldCBwcm92aWRlciA9IHRoaXMuX3Byb3ZpZGVycy5nZXQodmVuZG9ySWQpO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdC8vIEFjdGl2YXRlIGV4dGVuc2lvbnMgYmVmb3JlIHJlcXVlc3RpbmcgdG8gcmVzb2x2ZSB0aGUgbW9kZWxzXG5cdFx0XHRhd2FpdCB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudChgb25MYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyOiR7dmVuZG9ySWR9YCk7XG5cdFx0XHRwcm92aWRlciA9IHRoaXMuX3Byb3ZpZGVycy5nZXQodmVuZG9ySWQpO1xuXHRcdH1cblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtMTV0gTm8gcHJvdmlkZXIgcmVnaXN0ZXJlZCBmb3IgdmVuZG9yICR7dmVuZG9ySWR9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVMTVNlcXVlbmNlci5xdWV1ZSh2ZW5kb3JJZCwgYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHRjb25zdCBhbGxNb2RlbHM6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdID0gW107XG5cdFx0XHRjb25zdCBsYW5ndWFnZU1vZGVsc0dyb3VwczogSUxhbmd1YWdlTW9kZWxzR3JvdXBbXSA9IFtdO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBtb2RlbHMgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlTGFuZ3VhZ2VNb2RlbENoYXRJbmZvKHsgc2lsZW50IH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRpZiAobW9kZWxzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGFsbE1vZGVscy5wdXNoKC4uLm1vZGVscyk7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWxJZGVudGlmaWVycyA9IFtdO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgbSBvZiBtb2RlbHMpIHtcblx0XHRcdFx0XHRcdGlmICh2ZW5kb3IuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdFx0XHRcdC8vIFNwZWNpYWwgY2FzZSBmb3IgY29waWxvdCBtb2RlbHMgLSB0aGV5IGFyZSBhbGwgdXNlciBzZWxlY3RhYmxlIHVubGVzcyBtYXJrZWQgb3RoZXJ3aXNlXG5cdFx0XHRcdFx0XHRcdGlmIChtLm1ldGFkYXRhLmlzVXNlclNlbGVjdGFibGUgIT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0XHRcdFx0bW9kZWxJZGVudGlmaWVycy5wdXNoKG0uaWRlbnRpZmllcik7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0xNXSBTa2lwcGluZyBtb2RlbCAke20uaWRlbnRpZmllcn0gZnJvbSBtb2RlbCBwaWNrZXIgYXMgaXQgaXMgbm90IHVzZXIgc2VsZWN0YWJsZS5gKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0bW9kZWxJZGVudGlmaWVycy5wdXNoKG0uaWRlbnRpZmllcik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGxhbmd1YWdlTW9kZWxzR3JvdXBzLnB1c2goeyBtb2RlbElkZW50aWZpZXJzIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRsYW5ndWFnZU1vZGVsc0dyb3Vwcy5wdXNoKHtcblx0XHRcdFx0XHRtb2RlbElkZW50aWZpZXJzOiBbXSxcblx0XHRcdFx0XHRzdGF0dXM6IHtcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IGdldEVycm9yTWVzc2FnZShlcnJvciksXG5cdFx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3Jcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBncm91cHMgPSB0aGlzLl9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMoKTtcblx0XHRcdGNvbnN0IHBlck1vZGVsQ29uZmlndXJhdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIGdyb3Vwcykge1xuXHRcdFx0XHRpZiAoZ3JvdXAudmVuZG9yICE9PSB2ZW5kb3JJZCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRm9yIHZlbmRvcnMgd2l0aG91dCBhIGNvbmZpZ3VyYXRpb24gc2NoZW1hIHdob3NlIG1vZGVscyB3ZXJlIGFscmVhZHlcblx0XHRcdFx0Ly8gcmVzb2x2ZWQgaW4gdGhlIGluaXRpYWwgKGdyb3VwbGVzcykgbG9hZCwgZ3JvdXBzIG9ubHkgY2FycnkgcGVyLW1vZGVsXG5cdFx0XHRcdC8vIHNldHRpbmdzIGFuZCBzaG91bGQgbm90IHRyaWdnZXIgYSBzZXBhcmF0ZSBtb2RlbCByZXNvbHV0aW9uIGNhbGwuXG5cdFx0XHRcdC8vIEluc3RlYWQsIGFwcGx5IHRoZSBwZXItbW9kZWwgY29uZmlnIHRvIHRoZSBhbHJlYWR5LXJlc29sdmVkIG1vZGVscy5cblx0XHRcdFx0aWYgKCF2ZW5kb3IuY29uZmlndXJhdGlvbiAmJiBhbGxNb2RlbHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGlmIChncm91cC5zZXR0aW5ncykge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBtb2RlbCBvZiBhbGxNb2RlbHMpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbW9kZWxDb25maWcgPSBncm91cC5zZXR0aW5nc1ttb2RlbC5tZXRhZGF0YS5pZF07XG5cdFx0XHRcdFx0XHRcdGlmIChtb2RlbENvbmZpZykge1xuXHRcdFx0XHRcdFx0XHRcdC8vIFN0b3JlIHJhdyBjb25maWcgKHdpdGhvdXQgcmVzb2x2aW5nIHNlY3JldHMpIHRvIGF2b2lkIGxlYWtpbmcgc2VjcmV0cyBvbiBwZXJzaXN0XG5cdFx0XHRcdFx0XHRcdFx0cGVyTW9kZWxDb25maWd1cmF0aW9ucy5zZXQobW9kZWwuaWRlbnRpZmllciwgeyAuLi5tb2RlbENvbmZpZyB9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsYW5ndWFnZU1vZGVsc0dyb3Vwcy5wdXNoKHsgZ3JvdXAsIG1vZGVsSWRlbnRpZmllcnM6IFtdIH0pO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IGF3YWl0IHRoaXMuX3Jlc29sdmVDb25maWd1cmF0aW9uKGdyb3VwLCB2ZW5kb3IuY29uZmlndXJhdGlvbik7XG5cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbHMgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlTGFuZ3VhZ2VNb2RlbENoYXRJbmZvKHsgZ3JvdXA6IGdyb3VwLm5hbWUsIHNpbGVudCwgY29uZmlndXJhdGlvbiB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0XHRpZiAobW9kZWxzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0Ly8gUHJvdmlkZSBhIHNlbnNpYmxlIGRlZmF1bHQgZm9yIGBtZXRhZGF0YS5kZXRhaWxgIHNvIHRoYXRcblx0XHRcdFx0XHRcdC8vIG11bHRpcGxlIGluc3RhbmNlcyBvZiB0aGUgc2FtZSB2ZW5kb3IgKGUuZy4gbXVsdGlwbGVcblx0XHRcdFx0XHRcdC8vIE9sbGFtYSBzZXJ2ZXJzKSBhcmUgZGlzdGluZ3Vpc2hhYmxlIGluIHRoZSBtb2RlbCBwaWNrZXIuXG5cdFx0XHRcdFx0XHQvLyBQcm92aWRlcnMgdGhhdCBzdXBwbHkgdGhlaXIgb3duIGBkZXRhaWxgIGtlZXAgaXQ7IHdoZW5cblx0XHRcdFx0XHRcdC8vIHRoZSBwcm92aWRlciBkb2VzIG5vdCBzZXQgb25lLCBmYWxsIGJhY2sgdG8gdGhlIHVzZXItXG5cdFx0XHRcdFx0XHQvLyBjb25maWd1cmVkIGdyb3VwIG5hbWUuXG5cdFx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG1vZGVscy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0XHRpZiAoIW1vZGVsc1tpXS5tZXRhZGF0YS5kZXRhaWwpIHtcblx0XHRcdFx0XHRcdFx0XHRtb2RlbHNbaV0gPSB7IC4uLm1vZGVsc1tpXSwgbWV0YWRhdGE6IHsgLi4ubW9kZWxzW2ldLm1ldGFkYXRhLCBkZXRhaWw6IGdyb3VwLm5hbWUgfSB9O1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRhbGxNb2RlbHMucHVzaCguLi5tb2RlbHMpO1xuXHRcdFx0XHRcdFx0bGFuZ3VhZ2VNb2RlbHNHcm91cHMucHVzaCh7IGdyb3VwLCBtb2RlbElkZW50aWZpZXJzOiBtb2RlbHMubWFwKG0gPT4gbS5pZGVudGlmaWVyKSB9KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBDb2xsZWN0IHBlci1tb2RlbCBjb25maWd1cmF0aW9ucyBmcm9tIHRoZSBncm91cFxuXHRcdFx0XHRcdGlmIChncm91cC5zZXR0aW5ncykge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBtb2RlbCBvZiBtb2RlbHMpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbW9kZWxDb25maWcgPSBncm91cC5zZXR0aW5nc1ttb2RlbC5tZXRhZGF0YS5pZF07XG5cdFx0XHRcdFx0XHRcdGlmIChtb2RlbENvbmZpZykge1xuXHRcdFx0XHRcdFx0XHRcdC8vIFN0b3JlIHJhdyBjb25maWcgKHdpdGhvdXQgcmVzb2x2aW5nIHNlY3JldHMpIHRvIGF2b2lkIGxlYWtpbmcgc2VjcmV0cyBvbiBwZXJzaXN0XG5cdFx0XHRcdFx0XHRcdFx0cGVyTW9kZWxDb25maWd1cmF0aW9ucy5zZXQobW9kZWwuaWRlbnRpZmllciwgeyAuLi5tb2RlbENvbmZpZyB9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRsYW5ndWFnZU1vZGVsc0dyb3Vwcy5wdXNoKHtcblx0XHRcdFx0XHRcdGdyb3VwLFxuXHRcdFx0XHRcdFx0bW9kZWxJZGVudGlmaWVyczogW10sXG5cdFx0XHRcdFx0XHRzdGF0dXM6IHtcblx0XHRcdFx0XHRcdFx0bWVzc2FnZTogZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSxcblx0XHRcdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgd2FzUmVzb2x2ZWQgPSB0aGlzLl9tb2RlbHNHcm91cHMuaGFzKHZlbmRvcklkKTtcblx0XHRcdGNvbnN0IG9sZEdyb3VwcyA9IHRoaXMuX21vZGVsc0dyb3Vwcy5nZXQodmVuZG9ySWQpID8/IFtdO1xuXHRcdFx0dGhpcy5fbW9kZWxzR3JvdXBzLnNldCh2ZW5kb3JJZCwgbGFuZ3VhZ2VNb2RlbHNHcm91cHMpO1xuXHRcdFx0Y29uc3Qgb2xkTW9kZWxzID0gdGhpcy5fY2xlYXJNb2RlbENhY2hlKHZlbmRvcklkKTtcblx0XHRcdGxldCBoYXNDaGFuZ2VzID0gIXdhc1Jlc29sdmVkO1xuXHRcdFx0Zm9yIChjb25zdCBtb2RlbCBvZiBhbGxNb2RlbHMpIHtcblx0XHRcdFx0aWYgKHRoaXMuX21vZGVsQ2FjaGUuaGFzKG1vZGVsLmlkZW50aWZpZXIpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbTE1dIE1vZGVsICR7bW9kZWwuaWRlbnRpZmllcn0gaXMgYWxyZWFkeSByZWdpc3RlcmVkLiBTa2lwcGluZy5gKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9tb2RlbENhY2hlLnNldChtb2RlbC5pZGVudGlmaWVyLCBtb2RlbC5tZXRhZGF0YSk7XG5cdFx0XHRcdGhhc0NoYW5nZXMgPSBoYXNDaGFuZ2VzIHx8ICFlcXVhbHMob2xkTW9kZWxzLmdldChtb2RlbC5pZGVudGlmaWVyKSwgbW9kZWwubWV0YWRhdGEpO1xuXHRcdFx0XHRvbGRNb2RlbHMuZGVsZXRlKG1vZGVsLmlkZW50aWZpZXIpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0xNXSBSZXNvbHZlZCBsYW5ndWFnZSBtb2RlbHMgZm9yIHZlbmRvciAke3ZlbmRvcklkfWAsIGFsbE1vZGVscyk7XG5cdFx0XHRoYXNDaGFuZ2VzID0gaGFzQ2hhbmdlcyB8fCBvbGRNb2RlbHMuc2l6ZSA+IDA7XG5cblx0XHRcdC8vIEFsc28gZGV0ZWN0IGdyb3VwIHN0cnVjdHVyZSBjaGFuZ2VzIChhZGRlZC9yZW1vdmVkIGdyb3Vwcywgc3RhdHVzIGNoYW5nZXMpXG5cdFx0XHQvLyBzbyB0aGUgVUkgdXBkYXRlcyBldmVuIHdoZW4gaW5kaXZpZHVhbCBtb2RlbHMgaGF2ZW4ndCBjaGFuZ2VkXG5cdFx0XHRpZiAoIWhhc0NoYW5nZXMpIHtcblx0XHRcdFx0aGFzQ2hhbmdlcyA9IHRoaXMuX2hhc0dyb3VwU3RydWN0dXJlQ2hhbmdlZChvbGRHcm91cHMsIGxhbmd1YWdlTW9kZWxzR3JvdXBzKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVXBkYXRlIHBlci1tb2RlbCBjb25maWd1cmF0aW9ucyBmb3IgdGhpcyB2ZW5kb3Jcblx0XHRcdHRoaXMuX2NsZWFyTW9kZWxDb25maWd1cmF0aW9ucyh2ZW5kb3JJZCk7XG5cdFx0XHRmb3IgKGNvbnN0IFtpZGVudGlmaWVyLCBjb25maWddIG9mIHBlck1vZGVsQ29uZmlndXJhdGlvbnMpIHtcblx0XHRcdFx0aWYgKHRoaXMuX21vZGVsQ2FjaGUuaGFzKGlkZW50aWZpZXIpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbW9kZWxDb25maWd1cmF0aW9ucy5zZXQoaWRlbnRpZmllciwgY29uZmlnKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaGFzQ2hhbmdlcykge1xuXHRcdFx0XHR0aGlzLl9vbkxhbmd1YWdlTW9kZWxDaGFuZ2UuZmlyZSh2ZW5kb3JJZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbTE1dIE5vIGNoYW5nZXMgaW4gbGFuZ3VhZ2UgbW9kZWxzIGZvciB2ZW5kb3IgJHt2ZW5kb3JJZH1gKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2hhc0dyb3VwU3RydWN0dXJlQ2hhbmdlZChvbGRHcm91cHM6IHJlYWRvbmx5IElMYW5ndWFnZU1vZGVsc0dyb3VwW10sIG5ld0dyb3VwczogcmVhZG9ubHkgSUxhbmd1YWdlTW9kZWxzR3JvdXBbXSk6IGJvb2xlYW4ge1xuXHRcdGlmIChvbGRHcm91cHMubGVuZ3RoICE9PSBuZXdHcm91cHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBvbGRHcm91cHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IG9sZEdyb3VwID0gb2xkR3JvdXBzW2ldO1xuXHRcdFx0Y29uc3QgbmV3R3JvdXAgPSBuZXdHcm91cHNbaV07XG5cdFx0XHRpZiAob2xkR3JvdXAuZ3JvdXA/Lm5hbWUgIT09IG5ld0dyb3VwLmdyb3VwPy5uYW1lXG5cdFx0XHRcdHx8IG9sZEdyb3VwLmdyb3VwPy52ZW5kb3IgIT09IG5ld0dyb3VwLmdyb3VwPy52ZW5kb3Jcblx0XHRcdFx0fHwgb2xkR3JvdXAuc3RhdHVzPy5tZXNzYWdlICE9PSBuZXdHcm91cC5zdGF0dXM/Lm1lc3NhZ2Vcblx0XHRcdFx0fHwgb2xkR3JvdXAuc3RhdHVzPy5zZXZlcml0eSAhPT0gbmV3R3JvdXAuc3RhdHVzPy5zZXZlcml0eVxuXHRcdFx0XHR8fCBvbGRHcm91cC5tb2RlbElkZW50aWZpZXJzLmxlbmd0aCAhPT0gbmV3R3JvdXAubW9kZWxJZGVudGlmaWVycy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGdldExhbmd1YWdlTW9kZWxHcm91cHModmVuZG9yOiBzdHJpbmcpOiBJTGFuZ3VhZ2VNb2RlbHNHcm91cFtdIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxzR3JvdXBzLmdldCh2ZW5kb3IpID8/IFtdO1xuXHR9XG5cblx0aGFzUmVzb2x2ZWRWZW5kb3IodmVuZG9yOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxzR3JvdXBzLmhhcyh2ZW5kb3IpO1xuXHR9XG5cblx0YXN5bmMgc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoc2VsZWN0b3I6IElMYW5ndWFnZU1vZGVsQ2hhdFNlbGVjdG9yKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXG5cdFx0aWYgKHNlbGVjdG9yLnZlbmRvcikge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVzb2x2ZUFsbExhbmd1YWdlTW9kZWxzKHNlbGVjdG9yLnZlbmRvciwgdHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGFsbFZlbmRvcnMgPSBBcnJheS5mcm9tKHRoaXMuX3ZlbmRvcnMua2V5cygpKTtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGFsbFZlbmRvcnMubWFwKHZlbmRvciA9PiB0aGlzLl9yZXNvbHZlQWxsTGFuZ3VhZ2VNb2RlbHModmVuZG9yLCB0cnVlKSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgW2ludGVybmFsTW9kZWxJZGVudGlmaWVyLCBtb2RlbF0gb2YgdGhpcy5fbW9kZWxDYWNoZSkge1xuXHRcdFx0aWYgKChzZWxlY3Rvci52ZW5kb3IgPT09IHVuZGVmaW5lZCB8fCBtb2RlbC52ZW5kb3IgPT09IHNlbGVjdG9yLnZlbmRvcilcblx0XHRcdFx0JiYgKHNlbGVjdG9yLmZhbWlseSA9PT0gdW5kZWZpbmVkIHx8IG1vZGVsLmZhbWlseSA9PT0gc2VsZWN0b3IuZmFtaWx5KVxuXHRcdFx0XHQmJiAoc2VsZWN0b3IudmVyc2lvbiA9PT0gdW5kZWZpbmVkIHx8IG1vZGVsLnZlcnNpb24gPT09IHNlbGVjdG9yLnZlcnNpb24pXG5cdFx0XHRcdCYmIChzZWxlY3Rvci5pZCA9PT0gdW5kZWZpbmVkIHx8IG1vZGVsLmlkID09PSBzZWxlY3Rvci5pZCkpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goaW50ZXJuYWxNb2RlbElkZW50aWZpZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1tMTV0gc2VsZWN0ZWQgbGFuZ3VhZ2UgbW9kZWxzJywgc2VsZWN0b3IsIHJlc3VsdCk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cmVnaXN0ZXJMYW5ndWFnZU1vZGVsUHJvdmlkZXIodmVuZG9yOiBzdHJpbmcsIHByb3ZpZGVyOiBJTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdbTE1dIHJlZ2lzdGVyaW5nIGxhbmd1YWdlIG1vZGVsIHByb3ZpZGVyJywgdmVuZG9yLCBwcm92aWRlcik7XG5cblx0XHRpZiAoIXRoaXMuX3ZlbmRvcnMuaGFzKHZlbmRvcikpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2hhdCBtb2RlbCBwcm92aWRlciB1c2VzIFVOS05PV04gdmVuZG9yICR7dmVuZG9yfS5gKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3Byb3ZpZGVycy5oYXModmVuZG9yKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDaGF0IG1vZGVsIHByb3ZpZGVyIGZvciB2ZW5kb3IgJHt2ZW5kb3J9IGlzIGFscmVhZHkgcmVnaXN0ZXJlZC5gKTtcblx0XHR9XG5cblx0XHR0aGlzLl9wcm92aWRlcnMuc2V0KHZlbmRvciwgcHJvdmlkZXIpO1xuXG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VMaXN0ZW5lciA9IHByb3ZpZGVyLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX3Jlc29sdmVBbGxMYW5ndWFnZU1vZGVscyh2ZW5kb3IsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdbTE1dIFVOcmVnaXN0ZXJlZCBsYW5ndWFnZSBtb2RlbCBwcm92aWRlcicsIHZlbmRvcik7XG5cdFx0XHR0aGlzLl9jbGVhck1vZGVsQ2FjaGUodmVuZG9yKTtcblx0XHRcdHRoaXMuX21vZGVsc0dyb3Vwcy5kZWxldGUodmVuZG9yKTtcblx0XHRcdHRoaXMuX3Byb3ZpZGVycy5kZWxldGUodmVuZG9yKTtcblx0XHRcdG1vZGVsQ2hhbmdlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgc2VuZENoYXRSZXF1ZXN0KG1vZGVsSWQ6IHN0cmluZywgZnJvbTogRXh0ZW5zaW9uSWRlbnRpZmllciB8IHVuZGVmaW5lZCwgbWVzc2FnZXM6IElDaGF0TWVzc2FnZVtdLCBvcHRpb25zOiBJTGFuZ3VhZ2VNb2RlbENoYXRSZXF1ZXN0T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTGFuZ3VhZ2VNb2RlbENoYXRSZXNwb25zZT4ge1xuXHRcdGNvbnN0IG1ldGFkYXRhID0gdGhpcy5fbW9kZWxDYWNoZS5nZXQobW9kZWxJZCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9wcm92aWRlcnMuZ2V0KG1ldGFkYXRhPy52ZW5kb3IgfHwgJycpO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2hhdCBwcm92aWRlciBmb3IgbW9kZWwgJHttb2RlbElkfSBpcyBub3QgcmVnaXN0ZXJlZC5gKTtcblx0XHR9XG5cdFx0aWYgKG1ldGFkYXRhKSB7XG5cdFx0XHR0aGlzLl9sb2dQcm92aWRlclVzYWdlVGVsZW1ldHJ5KG1ldGFkYXRhKTtcblx0XHRcdHRoaXMuX21heWJlU2hvd1Byb3ZpZGVyRGVwcmVjYXRpb25Ob3RpY2UobWV0YWRhdGEpO1xuXHRcdH1cblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gdGhpcy5nZXRNb2RlbENvbmZpZ3VyYXRpb24obW9kZWxJZCk7XG5cdFx0Y29uc3QgbWVyZ2VkT3B0aW9ucyA9IGNvbmZpZ3VyYXRpb24gPyB7IC4uLm9wdGlvbnMsIGNvbmZpZ3VyYXRpb246IHsgLi4uY29uZmlndXJhdGlvbiwgLi4ub3B0aW9ucy5jb25maWd1cmF0aW9uIH0gfSA6IG9wdGlvbnM7XG5cdFx0cmV0dXJuIHByb3ZpZGVyLnNlbmRDaGF0UmVxdWVzdChtb2RlbElkLCBtZXNzYWdlcywgZnJvbSwgbWVyZ2VkT3B0aW9ucywgdG9rZW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZW4gYSBjaGF0IHJlcXVlc3QgaXMgbWFkZSBhZ2FpbnN0IGEgZGVwcmVjYXRlZCBwcm92aWRlciAob25lIHRoYXQgY29udHJpYnV0ZXMgYVxuXHQgKiBgZGVwcmVjYXRpb24ubGlua2ApLCBwcm9tcHQgdGhlIHVzZXIgb25jZSBwZXIgc2Vzc2lvbiB0byBpbnN0YWxsIHRoZSByZXBsYWNlbWVudFxuXHQgKiBleHRlbnNpb24uIFRoZSBub3RpZmljYXRpb24gY2FuIGJlIGRpc21pc3NlZCwgYW5kIG9mZmVycyBhIFwiRG9uJ3QgU2hvdyBBZ2FpblwiIGNob2ljZSB0aGF0XG5cdCAqIGlzIHBlcnNpc3RlZCBhY3Jvc3Mgc2Vzc2lvbnMgdmlhIHRoZSBub3RpZmljYXRpb24gc2VydmljZSdzIGBuZXZlclNob3dBZ2FpbmAgc3VwcG9ydC5cblx0ICovXG5cdHByaXZhdGUgX21heWJlU2hvd1Byb3ZpZGVyRGVwcmVjYXRpb25Ob3RpY2UobWV0YWRhdGE6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgdmVuZG9yID0gdGhpcy5fdmVuZG9ycy5nZXQobWV0YWRhdGEudmVuZG9yKTtcblx0XHRjb25zdCBsaW5rID0gdmVuZG9yPy5kZXByZWNhdGlvbj8ubGluaztcblx0XHRpZiAoIWxpbmspIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2RlcHJlY2F0aW9uTm90aWNlU2hvd25WZW5kb3JzLmhhcyhtZXRhZGF0YS52ZW5kb3IpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2RlcHJlY2F0aW9uTm90aWNlU2hvd25WZW5kb3JzLmFkZChtZXRhZGF0YS52ZW5kb3IpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXJOYW1lID0gKHZlbmRvci5kaXNwbGF5TmFtZSB8fCBtZXRhZGF0YS52ZW5kb3IpLnJlcGxhY2UoL1xccypcXChkZXByZWNhdGVkXFwpXFxzKiQvaSwgJycpO1xuXHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFxuXHRcdFx0U2V2ZXJpdHkuSW5mbyxcblx0XHRcdGxvY2FsaXplKCdjaGF0LnByb3ZpZGVyRGVwcmVjYXRpb24ubWVzc2FnZScsIFwiVGhlIGludGVybmFsIHswfSBsYW5ndWFnZSBtb2RlbCBwcm92aWRlciBpcyBiZWluZyBkZXByZWNhdGVkLiBQbGVhc2UgbWlncmF0ZSB0byB0aGUgb2ZmaWNpYWwgZXh0ZW5zaW9uLlwiLCBwcm92aWRlck5hbWUpLFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0LnByb3ZpZGVyRGVwcmVjYXRpb24uaW5zdGFsbCcsIFwiSW5zdGFsbCBFeHRlbnNpb25cIiksXG5cdFx0XHRcdHJ1bjogKCkgPT4geyB0aGlzLl9vcGVuZXJTZXJ2aWNlLm9wZW4ocmVzb2x2ZVByb3ZpZGVyRGVwcmVjYXRpb25MaW5rKGxpbmssIHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnVybFByb3RvY29sKSk7IH1cblx0XHRcdH1dLFxuXHRcdFx0e1xuXHRcdFx0XHRuZXZlclNob3dBZ2FpbjogeyBpZDogYGNoYXQucHJvdmlkZXJEZXByZWNhdGlvbi4ke21ldGFkYXRhLnZlbmRvcn1gLCBzY29wZTogTmV2ZXJTaG93QWdhaW5TY29wZS5BUFBMSUNBVElPTiB9XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXBvcnRzIHdoaWNoIGluLWJ1aWx0IEJZT0sgcHJvdmlkZXIgKG9yIHRoaXJkLXBhcnR5IGV4dGVuc2lvbikgYmFja3MgYSBtb2RlbCByZXF1ZXN0LiBGaXJzdC1wYXJ0eVxuXHQgKiBDb3BpbG90IG1vZGVscyBhcmUgaW50ZW50aW9uYWxseSBub3QgcmVwb3J0ZWQgaGVyZSAoc2VlIHtAbGluayBnZXRCeW9rUHJvdmlkZXJUZWxlbWV0cnlOYW1lfSkuXG5cdCAqL1xuXHRwcml2YXRlIF9sb2dQcm92aWRlclVzYWdlVGVsZW1ldHJ5KG1ldGFkYXRhOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZ2V0Qnlva1Byb3ZpZGVyVGVsZW1ldHJ5TmFtZShtZXRhZGF0YT8udmVuZG9yLCBtZXRhZGF0YT8uZXh0ZW5zaW9uKTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHR5cGUgTGFuZ3VhZ2VNb2RlbFJlcXVlc3RFdmVudCA9IHtcblx0XHRcdHByb3ZpZGVyOiBzdHJpbmc7XG5cdFx0XHRpc0JZT0s6IGJvb2xlYW47XG5cdFx0fTtcblx0XHR0eXBlIExhbmd1YWdlTW9kZWxSZXF1ZXN0Q2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRwcm92aWRlcjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ05vcm1hbGl6ZWQgbm9uLUNvcGlsb3QgbW9kZWwgcHJvdmlkZXI6IGFuIGluLWJ1aWx0IEJZT0sgdmVuZG9yIGlkIChmb3IgbW9kZWxzIGNvbnRyaWJ1dGVkIGJ5IHRoZSBidWlsdC1pbiBDb3BpbG90IGV4dGVuc2lvbnMpIG9yIFwiM3AtZXh0ZW5zaW9uXCIgZm9yIGFueSB0aGlyZC1wYXJ0eSBleHRlbnNpb24gcHJvdmlkZXIuJyB9O1xuXHRcdFx0aXNCWU9LOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnV2hldGhlciB0aGUgbW9kZWwgaXMgYSBCWU9LIG1vZGVsLicgfTtcblx0XHRcdG93bmVyOiAndnJpdGFudDI0Jztcblx0XHRcdGNvbW1lbnQ6ICdUcmFja3Mgd2hpY2ggbm9uLUNvcGlsb3QgbGFuZ3VhZ2UtbW9kZWwgcHJvdmlkZXIgaXMgdXNlZCBwZXIgcmVxdWVzdCB0byB1bmRlcnN0YW5kIGFkb3B0aW9uIG9mIGluLWJ1aWx0IENvcGlsb3QgQllPSyBwcm92aWRlcnMgdnMgdGhpcmQtcGFydHkgZXh0ZW5zaW9uIHByb3ZpZGVycy4nO1xuXHRcdH07XG5cdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPExhbmd1YWdlTW9kZWxSZXF1ZXN0RXZlbnQsIExhbmd1YWdlTW9kZWxSZXF1ZXN0Q2xhc3NpZmljYXRpb24+KCdjaGF0Lmxhbmd1YWdlTW9kZWxSZXF1ZXN0Jywge1xuXHRcdFx0cHJvdmlkZXIsXG5cdFx0XHRpc0JZT0s6ICEhbWV0YWRhdGE/LmlzQllPSyxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVNb2RlbENvbmZpZ3VyYXRpb25XaXRoRGVmYXVsdHMobW9kZWxJZDogc3RyaW5nLCBtZXRhZGF0YTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgfCB1bmRlZmluZWQpOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdXNlckNvbmZpZyA9IHRoaXMuX21vZGVsQ29uZmlndXJhdGlvbnMuZ2V0KG1vZGVsSWQpO1xuXHRcdGNvbnN0IHNjaGVtYSA9IG1ldGFkYXRhPy5jb25maWd1cmF0aW9uU2NoZW1hO1xuXG5cdFx0aWYgKCFzY2hlbWE/LnByb3BlcnRpZXMgJiYgIXVzZXJDb25maWcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gU3RhcnQgd2l0aCBzY2hlbWEgZGVmYXVsdHNcblx0XHRjb25zdCBkZWZhdWx0czogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gPSB7fTtcblx0XHRpZiAoc2NoZW1hPy5wcm9wZXJ0aWVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHByb3BTY2hlbWFdIG9mIE9iamVjdC5lbnRyaWVzKHNjaGVtYS5wcm9wZXJ0aWVzKSkge1xuXHRcdFx0XHRpZiAocHJvcFNjaGVtYS5kZWZhdWx0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRkZWZhdWx0c1trZXldID0gcHJvcFNjaGVtYS5kZWZhdWx0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCF1c2VyQ29uZmlnICYmIE9iamVjdC5rZXlzKGRlZmF1bHRzKS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gVXNlciBjb25maWcgb3ZlcnJpZGVzIGRlZmF1bHRzXG5cdFx0cmV0dXJuIHsgLi4uZGVmYXVsdHMsIC4uLnVzZXJDb25maWcgfTtcblx0fVxuXG5cdGNvbXB1dGVUb2tlbkxlbmd0aChtb2RlbElkOiBzdHJpbmcsIG1lc3NhZ2U6IHN0cmluZyB8IElDaGF0TWVzc2FnZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX21vZGVsQ2FjaGUuZ2V0KG1vZGVsSWQpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2hhdCBtb2RlbCAke21vZGVsSWR9IGNvdWxkIG5vdCBiZSBmb3VuZC5gKTtcblx0XHR9XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9wcm92aWRlcnMuZ2V0KG1vZGVsLnZlbmRvcik7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDaGF0IHByb3ZpZGVyIGZvciBtb2RlbCAke21vZGVsSWR9IGlzIG5vdCByZWdpc3RlcmVkLmApO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJvdmlkZXIucHJvdmlkZVRva2VuQ291bnQobW9kZWxJZCwgbWVzc2FnZSwgdG9rZW4pO1xuXHR9XG5cblx0Z2V0TW9kZWxDb25maWd1cmF0aW9uKG1vZGVsSWQ6IHN0cmluZyk6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtZXRhZGF0YSA9IHRoaXMuX21vZGVsQ2FjaGUuZ2V0KG1vZGVsSWQpO1xuXHRcdHJldHVybiB0aGlzLl9yZXNvbHZlTW9kZWxDb25maWd1cmF0aW9uV2l0aERlZmF1bHRzKG1vZGVsSWQsIG1ldGFkYXRhKTtcblx0fVxuXG5cdGFzeW5jIHNldE1vZGVsQ29uZmlndXJhdGlvbihtb2RlbElkOiBzdHJpbmcsIHZhbHVlczogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtZXRhZGF0YSA9IHRoaXMuX21vZGVsQ2FjaGUuZ2V0KG1vZGVsSWQpO1xuXHRcdGlmICghbWV0YWRhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBGaW5kIHRoZSBncm91cCBmcm9tIHRoZSBjb25maWd1cmF0aW9uIHNlcnZpY2UgKHNvdXJjZSBvZiB0cnV0aClcblx0XHRjb25zdCBhbGxHcm91cHMgPSB0aGlzLl9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMoKTtcblx0XHRsZXQgZ3JvdXA6IElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAgfCB1bmRlZmluZWQ7XG5cblx0XHQvLyBGaXJzdCB0cnkgdG8gZmluZCBhIGdyb3VwIHRoYXQgYWxyZWFkeSBoYXMgY29uZmlnIGZvciB0aGlzIG1vZGVsLlxuXHRcdGdyb3VwID0gYWxsR3JvdXBzLmZpbmQoZyA9PiBnLnZlbmRvciA9PT0gbWV0YWRhdGEudmVuZG9yICYmIGcuc2V0dGluZ3M/LlttZXRhZGF0YS5pZF0gIT09IHVuZGVmaW5lZCk7XG5cblx0XHQvLyBPdGhlcndpc2UgZmluZCB0aGUgZ3JvdXAgdGhhdCBhY3R1YWxseSAqZGVmaW5lcyogdGhpcyBtb2RlbC4gU2V2ZXJhbFxuXHRcdC8vIGdyb3VwcyBjYW4gc2hhcmUgdGhlIHNhbWUgYHZlbmRvcmAgKGUuZy4gbXVsdGlwbGUgYGN1c3RvbWVuZHBvaW50YFxuXHRcdC8vIHByb3ZpZGVycyBsaWtlIERlZXBTZWVrIGFuZCBNeUN1c3RvbSksIHNvIG1hdGNoaW5nIGJ5IHZlbmRvciBhbG9uZSB3b3VsZFxuXHRcdC8vIHdyaXRlIHRoZSBjb25maWcgdG8gdGhlIGZpcnN0IGdyb3VwIG9mIHRoYXQgdmVuZG9yIFx1MjAxNCBub3QgdGhlIG9uZSB0aGVcblx0XHQvLyBtb2RlbCBiZWxvbmdzIHRvLiBSZXNvbHZlIHZpYSB0aGUgbW9kZWxcdTIxOTJncm91cCBtYXAgaW5zdGVhZC4gU2VlICMzMjI4NzIuXG5cdFx0aWYgKCFncm91cCkge1xuXHRcdFx0Y29uc3QgdmVuZG9yR3JvdXBzID0gdGhpcy5fbW9kZWxzR3JvdXBzLmdldChtZXRhZGF0YS52ZW5kb3IpO1xuXHRcdFx0Y29uc3QgY29udGFpbmluZ0dyb3VwID0gdmVuZG9yR3JvdXBzPy5maW5kKHZnID0+IHZnLm1vZGVsSWRlbnRpZmllcnMuaW5jbHVkZXMobW9kZWxJZCkgJiYgdmcuZ3JvdXApPy5ncm91cDtcblx0XHRcdGlmIChjb250YWluaW5nR3JvdXApIHtcblx0XHRcdFx0Z3JvdXAgPSBhbGxHcm91cHMuZmluZChnID0+IGcudmVuZG9yID09PSBjb250YWluaW5nR3JvdXAudmVuZG9yICYmIGcubmFtZSA9PT0gY29udGFpbmluZ0dyb3VwLm5hbWUpID8/IGNvbnRhaW5pbmdHcm91cDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBcyBhIGxhc3QgcmVzb3J0IChtb2RlbCBub3QgeWV0IHJlc29sdmVkIGludG8gYW55IGdyb3VwKSwgZmFsbCBiYWNrIHRvXG5cdFx0Ly8gYW55IGdyb3VwIGZvciB0aGlzIHZlbmRvci5cblx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRncm91cCA9IGFsbEdyb3Vwcy5maW5kKGcgPT4gZy52ZW5kb3IgPT09IG1ldGFkYXRhLnZlbmRvcik7XG5cdFx0fVxuXG5cdFx0Ly8gTWVyZ2UgbmV3IHZhbHVlcyBpbnRvIGV4aXN0aW5nIGNvbmZpZywgcmVtb3ZpbmcgcHJvcGVydGllcyBzZXQgdG8gdGhlaXIgc2NoZW1hIGRlZmF1bHRcblx0XHRjb25zdCBleGlzdGluZ0NvbmZpZyA9IHRoaXMuX21vZGVsQ29uZmlndXJhdGlvbnMuZ2V0KG1vZGVsSWQpID8/IHt9O1xuXHRcdGNvbnN0IHVwZGF0ZWRDb25maWcgPSB7IC4uLmV4aXN0aW5nQ29uZmlnLCAuLi52YWx1ZXMgfTtcblx0XHRjb25zdCBzY2hlbWEgPSBtZXRhZGF0YS5jb25maWd1cmF0aW9uU2NoZW1hO1xuXHRcdGlmIChzY2hlbWE/LnByb3BlcnRpZXMpIHtcblx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHVwZGF0ZWRDb25maWcpKSB7XG5cdFx0XHRcdGNvbnN0IHByb3BTY2hlbWEgPSBzY2hlbWEucHJvcGVydGllc1trZXldO1xuXHRcdFx0XHRpZiAocHJvcFNjaGVtYT8uZGVmYXVsdCAhPT0gdW5kZWZpbmVkICYmIHByb3BTY2hlbWEuZGVmYXVsdCA9PT0gdmFsdWUpIHtcblx0XHRcdFx0XHRkZWxldGUgdXBkYXRlZENvbmZpZ1trZXldO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGdyb3VwKSB7XG5cdFx0XHRjb25zdCBleGlzdGluZ1NldHRpbmdzID0gKGdyb3VwLnNldHRpbmdzIGFzIElTdHJpbmdEaWN0aW9uYXJ5PElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+PiB8IHVuZGVmaW5lZCkgPz8ge307XG5cdFx0XHRsZXQgdXBkYXRlZFNldHRpbmdzOiBJU3RyaW5nRGljdGlvbmFyeTxJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPj47XG5cdFx0XHRpZiAoT2JqZWN0LmtleXModXBkYXRlZENvbmZpZykubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHVwZGF0ZWRTZXR0aW5ncyA9IHsgLi4uZXhpc3RpbmdTZXR0aW5ncyB9O1xuXHRcdFx0XHRkZWxldGUgdXBkYXRlZFNldHRpbmdzW21ldGFkYXRhLmlkXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHVwZGF0ZWRTZXR0aW5ncyA9IHsgLi4uZXhpc3RpbmdTZXR0aW5ncywgW21ldGFkYXRhLmlkXTogdXBkYXRlZENvbmZpZyB9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdXBkYXRlZEdyb3VwOiBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwID0ge1xuXHRcdFx0XHQuLi5ncm91cCxcblx0XHRcdFx0c2V0dGluZ3M6IE9iamVjdC5rZXlzKHVwZGF0ZWRTZXR0aW5ncykubGVuZ3RoID4gMCA/IHVwZGF0ZWRTZXR0aW5ncyA6IHVuZGVmaW5lZFxuXHRcdFx0fTtcblx0XHRcdGlmICghdXBkYXRlZEdyb3VwLnNldHRpbmdzICYmIE9iamVjdC5rZXlzKHVwZGF0ZWRHcm91cCkuZmlsdGVyKGsgPT4gayAhPT0gJ25hbWUnICYmIGsgIT09ICd2ZW5kb3InICYmIGsgIT09ICdyYW5nZScgJiYgayAhPT0gJ21vZGVsc1JhbmdlJyAmJiBrICE9PSAnc2V0dGluZ3MnKS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0Ly8gUmVtb3ZlIHRoZSBncm91cCBlbnRpcmVseSBpZiBpdCBvbmx5IGhhZCBtb2RlbCBjb25maWdcblx0XHRcdFx0YXdhaXQgdGhpcy5fbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZS5yZW1vdmVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAoZ3JvdXApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAoZ3JvdXAsIHVwZGF0ZWRHcm91cCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChPYmplY3Qua2V5cyh1cGRhdGVkQ29uZmlnKS5sZW5ndGggPiAwKSB7XG5cdFx0XHQvLyBPbmx5IGNyZWF0ZSBhIG5ldyBncm91cCBpZiB0aGVyZSdzIG5vbi1kZWZhdWx0IGNvbmZpZ1xuXHRcdFx0Ly8gVXNlIF92ZW5kb3JzIGRpcmVjdGx5IGluc3RlYWQgb2YgZ2V0VmVuZG9ycygpIHdoaWNoIGZpbHRlcnMgYnkgYHdoZW5gIGNsYXVzZSxcblx0XHRcdC8vIGJlY2F1c2Ugd2UgbmVlZCB0byBzdG9yZSBjb25maWcgZm9yIGFsbCB2ZW5kb3JzIHJlZ2FyZGxlc3Mgb2YgVUkgdmlzaWJpbGl0eS5cblx0XHRcdGNvbnN0IHZlbmRvciA9IHRoaXMuX3ZlbmRvcnMuZ2V0KG1ldGFkYXRhLnZlbmRvcik7XG5cdFx0XHRpZiAoIXZlbmRvcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBuZXdHcm91cDogSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCA9IHtcblx0XHRcdFx0bmFtZTogdmVuZG9yLmRpc3BsYXlOYW1lLFxuXHRcdFx0XHR2ZW5kb3I6IG1ldGFkYXRhLnZlbmRvcixcblx0XHRcdFx0c2V0dGluZ3M6IHsgW21ldGFkYXRhLmlkXTogdXBkYXRlZENvbmZpZyB9XG5cdFx0XHR9O1xuXHRcdFx0YXdhaXQgdGhpcy5fbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZS5hZGRMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAobmV3R3JvdXApO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSB0aGUgaW4tbWVtb3J5IGNhY2hlXG5cdFx0aWYgKE9iamVjdC5rZXlzKHVwZGF0ZWRDb25maWcpLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX21vZGVsQ29uZmlndXJhdGlvbnMuc2V0KG1vZGVsSWQsIHVwZGF0ZWRDb25maWcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9tb2RlbENvbmZpZ3VyYXRpb25zLmRlbGV0ZShtb2RlbElkKTtcblx0XHR9XG5cblx0XHQvLyBOb3RpZnkgbGlzdGVuZXJzIHNvIFVJIChlLmcuLCBtb2RlbCBwaWNrZXIgbGFiZWwpIHVwZGF0ZXNcblx0XHR0aGlzLl9vbkxhbmd1YWdlTW9kZWxDaGFuZ2UuZmlyZShtZXRhZGF0YS52ZW5kb3IpO1xuXHR9XG5cblx0Z2V0TW9kZWxDb25maWd1cmF0aW9uQWN0aW9ucyhtb2RlbElkOiBzdHJpbmcpOiBJQWN0aW9uW10ge1xuXHRcdGNvbnN0IG1ldGFkYXRhID0gdGhpcy5fbW9kZWxDYWNoZS5nZXQobW9kZWxJZCk7XG5cdFx0Y29uc3QgY3VycmVudENvbmZpZyA9IHRoaXMuX21vZGVsQ29uZmlndXJhdGlvbnMuZ2V0KG1vZGVsSWQpID8/IHt9O1xuXHRcdHJldHVybiBjcmVhdGVNb2RlbENvbmZpZ3VyYXRpb25BY3Rpb25zKFxuXHRcdFx0bWV0YWRhdGE/LmNvbmZpZ3VyYXRpb25TY2hlbWEsXG5cdFx0XHRjdXJyZW50Q29uZmlnLFxuXHRcdFx0KGtleSwgdmFsdWUpID0+IHRoaXMuc2V0TW9kZWxDb25maWd1cmF0aW9uKG1vZGVsSWQsIHsgW2tleV06IHZhbHVlIH0pXG5cdFx0KTtcblx0fVxuXG5cdGFzeW5jIGNvbmZpZ3VyZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCh2ZW5kb3JJZDogc3RyaW5nLCBwcm92aWRlckdyb3VwTmFtZT86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Y29uc3QgdmVuZG9yID0gdGhpcy5nZXRWZW5kb3JzKCkuZmluZCgoeyB2ZW5kb3IgfSkgPT4gdmVuZG9yID09PSB2ZW5kb3JJZCk7XG5cdFx0aWYgKCF2ZW5kb3IpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVmVuZG9yICR7dmVuZG9ySWR9IG5vdCBmb3VuZC5gKTtcblx0XHR9XG5cblx0XHRpZiAodmVuZG9yLm1hbmFnZW1lbnRDb21tYW5kKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZXNvbHZlQWxsTGFuZ3VhZ2VNb2RlbHModmVuZG9yLnZlbmRvciwgZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhbmd1YWdlTW9kZWxQcm92aWRlckdyb3VwcyA9IHRoaXMuX2xhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwcygpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gbGFuZ3VhZ2VNb2RlbFByb3ZpZGVyR3JvdXBzLmZpbmQoZyA9PiBnLnZlbmRvciA9PT0gdmVuZG9ySWQgJiYgZy5uYW1lID09PSBwcm92aWRlckdyb3VwTmFtZSk7XG5cblx0XHRjb25zdCBuYW1lID0gYXdhaXQgdGhpcy5wcm9tcHRGb3JOYW1lKGxhbmd1YWdlTW9kZWxQcm92aWRlckdyb3VwcywgdmVuZG9yLCBleGlzdGluZyk7XG5cdFx0aWYgKCFuYW1lKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhpc3RpbmdDb25maWd1cmF0aW9uID0gZXhpc3RpbmcgPyBhd2FpdCB0aGlzLl9yZXNvbHZlQ29uZmlndXJhdGlvbihleGlzdGluZywgdmVuZG9yLmNvbmZpZ3VyYXRpb24pIDogdW5kZWZpbmVkO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSB2ZW5kb3IuY29uZmlndXJhdGlvbiA/IGF3YWl0IHRoaXMucHJvbXB0Rm9yQ29uZmlndXJhdGlvbihuYW1lLCB2ZW5kb3IuY29uZmlndXJhdGlvbiwgZXhpc3RpbmdDb25maWd1cmF0aW9uKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmICh2ZW5kb3IuY29uZmlndXJhdGlvbiAmJiAhY29uZmlndXJhdGlvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxhbmd1YWdlTW9kZWxQcm92aWRlckdyb3VwID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUxhbmd1YWdlTW9kZWxQcm92aWRlckdyb3VwKG5hbWUsIHZlbmRvcklkLCBjb25maWd1cmF0aW9uLCB2ZW5kb3IuY29uZmlndXJhdGlvbik7XG5cdFx0XHRjb25zdCBzYXZlZCA9IGV4aXN0aW5nXG5cdFx0XHRcdD8gYXdhaXQgdGhpcy5fbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAoZXhpc3RpbmcsIGxhbmd1YWdlTW9kZWxQcm92aWRlckdyb3VwKVxuXHRcdFx0XHQ6IGF3YWl0IHRoaXMuX2xhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UuYWRkTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKGxhbmd1YWdlTW9kZWxQcm92aWRlckdyb3VwKTtcblxuXHRcdFx0aWYgKHZlbmRvci5jb25maWd1cmF0aW9uICYmIHRoaXMucmVxdWlyZUNvbmZpZ3VyaW5nKHZlbmRvci5jb25maWd1cmF0aW9uKSkge1xuXHRcdFx0XHRjb25zdCBzbmlwcGV0ID0gdGhpcy5nZXRTbmlwcGV0Rm9yRmlyc3RVbmNvbmZpZ3VyZWRQcm9wZXJ0eShjb25maWd1cmF0aW9uID8/IHt9LCB2ZW5kb3IuY29uZmlndXJhdGlvbik7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2xhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlndXJlTGFuZ3VhZ2VNb2RlbHMoeyBncm91cDogc2F2ZWQsIHNuaXBwZXQgfSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZW5hbWVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAodmVuZG9ySWQ6IHN0cmluZywgcHJvdmlkZXJHcm91cE5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHZlbmRvciA9IHRoaXMuZ2V0VmVuZG9ycygpLmZpbmQoKHsgdmVuZG9yIH0pID0+IHZlbmRvciA9PT0gdmVuZG9ySWQpO1xuXHRcdGlmICghdmVuZG9yKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFZlbmRvciAke3ZlbmRvcklkfSBub3QgZm91bmQuYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbFByb3ZpZGVyR3JvdXBzID0gdGhpcy5fbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKCk7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBsYW5ndWFnZU1vZGVsUHJvdmlkZXJHcm91cHMuZmluZChncm91cCA9PiBncm91cC52ZW5kb3IgPT09IHZlbmRvcklkICYmIGdyb3VwLm5hbWUgPT09IHByb3ZpZGVyR3JvdXBOYW1lKTtcblx0XHRpZiAoIWV4aXN0aW5nKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYExhbmd1YWdlIG1vZGVsIHByb3ZpZGVyIGdyb3VwICR7cHJvdmlkZXJHcm91cE5hbWV9IGZvciB2ZW5kb3IgJHt2ZW5kb3JJZH0gbm90IGZvdW5kLmApO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5hbWUgPSBhd2FpdCB0aGlzLnByb21wdEZvck5hbWUobGFuZ3VhZ2VNb2RlbFByb3ZpZGVyR3JvdXBzLCB2ZW5kb3IsIGV4aXN0aW5nKTtcblx0XHRpZiAoIW5hbWUgfHwgbmFtZSA9PT0gZXhpc3RpbmcubmFtZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX2xhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKGV4aXN0aW5nLCB7IC4uLmV4aXN0aW5nLCBuYW1lIH0pO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwQXBpS2V5KHZlbmRvcklkOiBzdHJpbmcsIHByb3ZpZGVyR3JvdXBOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2ZW5kb3IgPSB0aGlzLmdldFZlbmRvcnMoKS5maW5kKCh7IHZlbmRvciB9KSA9PiB2ZW5kb3IgPT09IHZlbmRvcklkKTtcblx0XHRjb25zdCBzY2hlbWEgPSB2ZW5kb3I/LmNvbmZpZ3VyYXRpb24gYXMgSUpTT05TY2hlbWEgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYXBpS2V5U2NoZW1hID0gc2NoZW1hPy5wcm9wZXJ0aWVzPy5hcGlLZXk7XG5cdFx0aWYgKCF2ZW5kb3IgfHwgIXNjaGVtYSB8fCAhYXBpS2V5U2NoZW1hKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMoKS5maW5kKGdyb3VwID0+IGdyb3VwLnZlbmRvciA9PT0gdmVuZG9ySWQgJiYgZ3JvdXAubmFtZSA9PT0gcHJvdmlkZXJHcm91cE5hbWUpO1xuXHRcdGlmICghZXhpc3RpbmcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTGFuZ3VhZ2UgbW9kZWwgcHJvdmlkZXIgZ3JvdXAgJHtwcm92aWRlckdyb3VwTmFtZX0gZm9yIHZlbmRvciAke3ZlbmRvcklkfSBub3QgZm91bmQuYCk7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nQ29uZmlndXJhdGlvbiA9IGF3YWl0IHRoaXMuX3Jlc29sdmVDb25maWd1cmF0aW9uKGV4aXN0aW5nLCBzY2hlbWEpO1xuXHRcdFx0Y29uc3QgYXBpS2V5ID0gYXdhaXQgdGhpcy5wcm9tcHRGb3JWYWx1ZShleGlzdGluZy5uYW1lLCAnYXBpS2V5JywgYXBpS2V5U2NoZW1hLCAhIXNjaGVtYS5yZXF1aXJlZD8uaW5jbHVkZXMoJ2FwaUtleScpLCBleGlzdGluZ0NvbmZpZ3VyYXRpb24pO1xuXHRcdFx0aWYgKGFwaUtleSA9PT0gdW5kZWZpbmVkIHx8IGFwaUtleSA9PT0gZXhpc3RpbmdDb25maWd1cmF0aW9uLmFwaUtleSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSB7IC4uLmV4aXN0aW5nQ29uZmlndXJhdGlvbiwgYXBpS2V5IH07XG5cdFx0XHRjb25zdCB1cGRhdGVkID0ge1xuXHRcdFx0XHQuLi5hd2FpdCB0aGlzLl9yZXNvbHZlTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyR3JvdXAoZXhpc3RpbmcubmFtZSwgdmVuZG9ySWQsIGNvbmZpZ3VyYXRpb24sIHNjaGVtYSksXG5cdFx0XHRcdHNldHRpbmdzOiBleGlzdGluZy5zZXR0aW5nc1xuXHRcdFx0fTtcblx0XHRcdGF3YWl0IHRoaXMuX2xhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKGV4aXN0aW5nLCB1cGRhdGVkKTtcblx0XHRcdGF3YWl0IHRoaXMuX2RlbGV0ZVNlY3JldHNJbkNvbmZpZ3VyYXRpb24oZXhpc3RpbmcsIHNjaGVtYSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBhZGRMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBNb2RlbCh2ZW5kb3JJZDogc3RyaW5nLCBwcm92aWRlckdyb3VwTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdmVuZG9yID0gdGhpcy5nZXRWZW5kb3JzKCkuZmluZCgoeyB2ZW5kb3IgfSkgPT4gdmVuZG9yID09PSB2ZW5kb3JJZCk7XG5cdFx0Y29uc3Qgc2NoZW1hID0gdmVuZG9yPy5jb25maWd1cmF0aW9uIGFzIElKU09OU2NoZW1hIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG1vZGVsc1NjaGVtYSA9IHNjaGVtYT8ucHJvcGVydGllcz8ubW9kZWxzO1xuXHRcdGlmICghdmVuZG9yIHx8ICFtb2RlbHNTY2hlbWEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBncm91cCA9IHRoaXMuX2xhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwcygpLmZpbmQoZ3JvdXAgPT4gZ3JvdXAudmVuZG9yID09PSB2ZW5kb3JJZCAmJiBncm91cC5uYW1lID09PSBwcm92aWRlckdyb3VwTmFtZSk7XG5cdFx0aWYgKCFncm91cCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBMYW5ndWFnZSBtb2RlbCBwcm92aWRlciBncm91cCAke3Byb3ZpZGVyR3JvdXBOYW1lfSBmb3IgdmVuZG9yICR7dmVuZG9ySWR9IG5vdCBmb3VuZC5gKTtcblx0XHR9XG5cblx0XHRjb25zdCBoYXNNb2RlbHMgPSBBcnJheS5pc0FycmF5KGdyb3VwLm1vZGVscyk7XG5cdFx0Y29uc3Qgc25pcHBldCA9IGhhc01vZGVscyA/IHRoaXMuZ2V0U25pcHBldEZvckFycmF5SXRlbShtb2RlbHNTY2hlbWEpIDogdGhpcy5nZXRTbmlwcGV0Rm9yUHJvcGVydHkoJ21vZGVscycsIG1vZGVsc1NjaGVtYSk7XG5cdFx0aWYgKCFzbmlwcGV0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZS5jb25maWd1cmVMYW5ndWFnZU1vZGVscyh7XG5cdFx0XHRncm91cCxcblx0XHRcdHNuaXBwZXQsXG5cdFx0XHRzbmlwcGV0VGFyZ2V0OiBoYXNNb2RlbHMgPyAnbW9kZWxzJyA6ICdncm91cCdcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIG9wZW5MYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBTZXR0aW5ncyh2ZW5kb3JJZDogc3RyaW5nLCBwcm92aWRlckdyb3VwTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLl9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMoKS5maW5kKGdyb3VwID0+IGdyb3VwLnZlbmRvciA9PT0gdmVuZG9ySWQgJiYgZ3JvdXAubmFtZSA9PT0gcHJvdmlkZXJHcm91cE5hbWUpO1xuXHRcdGlmICghZ3JvdXApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTGFuZ3VhZ2UgbW9kZWwgcHJvdmlkZXIgZ3JvdXAgJHtwcm92aWRlckdyb3VwTmFtZX0gZm9yIHZlbmRvciAke3ZlbmRvcklkfSBub3QgZm91bmQuYCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZS5jb25maWd1cmVMYW5ndWFnZU1vZGVscyh7IGdyb3VwIH0pO1xuXHR9XG5cblx0YXN5bmMgY29uZmlndXJlTW9kZWwobW9kZWxJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSB0aGlzLl9tb2RlbENhY2hlLmdldChtb2RlbElkKTtcblx0XHRpZiAoIW1ldGFkYXRhIHx8ICFtZXRhZGF0YS5jb25maWd1cmF0aW9uU2NoZW1hKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRmluZCB0aGUgZ3JvdXAgdGhhdCBjb250YWlucyB0aGlzIG1vZGVsXG5cdFx0Y29uc3QgdmVuZG9yR3JvdXBzID0gdGhpcy5fbW9kZWxzR3JvdXBzLmdldChtZXRhZGF0YS52ZW5kb3IpO1xuXHRcdGxldCBncm91cDogSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCB8IHVuZGVmaW5lZDtcblx0XHRpZiAodmVuZG9yR3JvdXBzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHZnIG9mIHZlbmRvckdyb3Vwcykge1xuXHRcdFx0XHRpZiAodmcubW9kZWxJZGVudGlmaWVycy5pbmNsdWRlcyhtb2RlbElkKSAmJiB2Zy5ncm91cCkge1xuXHRcdFx0XHRcdGdyb3VwID0gdmcuZ3JvdXA7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgbW9kZWwgZG9lc24ndCBiZWxvbmcgdG8gYW55IGNvbmZpZ3VyZWQgZ3JvdXAsIGNyZWF0ZSBvbmVcblx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRjb25zdCB2ZW5kb3IgPSB0aGlzLmdldFZlbmRvcnMoKS5maW5kKHYgPT4gdi52ZW5kb3IgPT09IG1ldGFkYXRhLnZlbmRvcik7XG5cdFx0XHRpZiAoIXZlbmRvcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBncm91cE5hbWUgPSB2ZW5kb3IuZGlzcGxheU5hbWU7XG5cdFx0XHRjb25zdCBuZXdHcm91cDogSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCA9IHsgbmFtZTogZ3JvdXBOYW1lLCB2ZW5kb3I6IG1ldGFkYXRhLnZlbmRvciwgc2V0dGluZ3M6IHsgW21ldGFkYXRhLmlkXToge30gfSB9O1xuXHRcdFx0Z3JvdXAgPSBhd2FpdCB0aGlzLl9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmFkZExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cChuZXdHcm91cCk7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZXNvbHZlQWxsTGFuZ3VhZ2VNb2RlbHMobWV0YWRhdGEudmVuZG9yLCB0cnVlKTtcblx0XHR9XG5cblx0XHQvLyBHZW5lcmF0ZSBhIHNuaXBwZXQgZm9yIHRoZSBtb2RlbCdzIGNvbmZpZ3VyYXRpb24gc2NoZW1hXG5cdFx0Y29uc3Qgc25pcHBldCA9IHRoaXMuX2dldE1vZGVsQ29uZmlndXJhdGlvblNuaXBwZXQobWV0YWRhdGEuaWQsIG1ldGFkYXRhLmNvbmZpZ3VyYXRpb25TY2hlbWEpO1xuXHRcdGF3YWl0IHRoaXMuX2xhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlndXJlTGFuZ3VhZ2VNb2RlbHMoeyBncm91cCwgc25pcHBldCB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE1vZGVsQ29uZmlndXJhdGlvblNuaXBwZXQobW9kZWxJZDogc3RyaW5nLCBzY2hlbWE6IElMYW5ndWFnZU1vZGVsQ29uZmlndXJhdGlvblNjaGVtYSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgcHJvcGVydGllczogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAoc2NoZW1hLnByb3BlcnRpZXMpIHtcblx0XHRcdGZvciAoY29uc3QgW2tleSwgcHJvcFNjaGVtYV0gb2YgT2JqZWN0LmVudHJpZXMoc2NoZW1hLnByb3BlcnRpZXMpKSB7XG5cdFx0XHRcdGlmIChwcm9wU2NoZW1hLmRlZmF1bHRTbmlwcGV0cz8uWzBdKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc25pcHBldCA9IHByb3BTY2hlbWEuZGVmYXVsdFNuaXBwZXRzWzBdO1xuXHRcdFx0XHRcdGxldCBib2R5VGV4dCA9IHNuaXBwZXQuYm9keVRleHQgPz8gSlNPTi5zdHJpbmdpZnkoc25pcHBldC5ib2R5LCBudWxsLCAnXFx0XFx0XFx0Jyk7XG5cdFx0XHRcdFx0Ym9keVRleHQgPSBib2R5VGV4dC5yZXBsYWNlKC9cIihcXF5bXlwiXSopXCIvZywgKF8sIHZhbHVlKSA9PiB2YWx1ZS5zdWJzdHJpbmcoMSkpO1xuXHRcdFx0XHRcdHByb3BlcnRpZXMucHVzaChgXFx0XFx0XFx0XCIke2tleX1cIjogJHtib2R5VGV4dH1gKTtcblx0XHRcdFx0fSBlbHNlIGlmIChwcm9wU2NoZW1hLmRlZmF1bHQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHByb3BlcnRpZXMucHVzaChgXFx0XFx0XFx0XCIke2tleX1cIjogJHtKU09OLnN0cmluZ2lmeShwcm9wU2NoZW1hLmRlZmF1bHQpfWApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHByb3BlcnRpZXMucHVzaChgXFx0XFx0XFx0XCIke2tleX1cIjogJFxceyR7a2V5fVxcfWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsQ29udGVudCA9IHByb3BlcnRpZXMubGVuZ3RoID4gMFxuXHRcdFx0PyBge1xcbiR7cHJvcGVydGllcy5qb2luKCcsXFxuJyl9XFxuXFx0XFx0fWBcblx0XHRcdDogJ3tcXG5cXHRcXHRcXHQkMFxcblxcdFxcdH0nO1xuXHRcdHJldHVybiBgXCJzZXR0aW5nc1wiOiB7XFxuXFx0XFx0XCIke21vZGVsSWR9XCI6ICR7bW9kZWxDb250ZW50fVxcblxcdH1gO1xuXHR9XG5cblx0YXN5bmMgYWRkTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKG5hbWU6IHN0cmluZywgdmVuZG9ySWQ6IHN0cmluZywgY29uZmlndXJhdGlvbjogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2ZW5kb3IgPSB0aGlzLmdldFZlbmRvcnMoKS5maW5kKCh7IHZlbmRvciB9KSA9PiB2ZW5kb3IgPT09IHZlbmRvcklkKTtcblx0XHRpZiAoIXZlbmRvcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBWZW5kb3IgJHt2ZW5kb3JJZH0gbm90IGZvdW5kLmApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhbmd1YWdlTW9kZWxQcm92aWRlckdyb3VwID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUxhbmd1YWdlTW9kZWxQcm92aWRlckdyb3VwKG5hbWUsIHZlbmRvcklkLCBjb25maWd1cmF0aW9uLCB2ZW5kb3IuY29uZmlndXJhdGlvbik7XG5cdFx0YXdhaXQgdGhpcy5fbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZS5hZGRMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAobGFuZ3VhZ2VNb2RlbFByb3ZpZGVyR3JvdXApO1xuXHR9XG5cblx0YXN5bmMgcmVtb3ZlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKHZlbmRvcklkOiBzdHJpbmcsIHByb3ZpZGVyR3JvdXBOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2ZW5kb3IgPSB0aGlzLmdldFZlbmRvcnMoKS5maW5kKCh7IHZlbmRvciB9KSA9PiB2ZW5kb3IgPT09IHZlbmRvcklkKTtcblx0XHRpZiAoIXZlbmRvcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBWZW5kb3IgJHt2ZW5kb3JJZH0gbm90IGZvdW5kLmApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhbmd1YWdlTW9kZWxQcm92aWRlckdyb3VwcyA9IHRoaXMuX2xhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwcygpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gbGFuZ3VhZ2VNb2RlbFByb3ZpZGVyR3JvdXBzLmZpbmQoZyA9PiBnLnZlbmRvciA9PT0gdmVuZG9ySWQgJiYgZy5uYW1lID09PSBwcm92aWRlckdyb3VwTmFtZSk7XG5cblx0XHRpZiAoIWV4aXN0aW5nKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYExhbmd1YWdlIG1vZGVsIHByb3ZpZGVyIGdyb3VwICR7cHJvdmlkZXJHcm91cE5hbWV9IGZvciB2ZW5kb3IgJHt2ZW5kb3JJZH0gbm90IGZvdW5kLmApO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX2RlbGV0ZVNlY3JldHNJbkNvbmZpZ3VyYXRpb24oZXhpc3RpbmcsIHZlbmRvci5jb25maWd1cmF0aW9uKTtcblx0XHRhd2FpdCB0aGlzLl9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlbW92ZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cChleGlzdGluZyk7XG5cdH1cblxuXHRwcml2YXRlIHJlcXVpcmVDb25maWd1cmluZyhzY2hlbWE6IElKU09OU2NoZW1hKTogYm9vbGVhbiB7XG5cdFx0aWYgKHNjaGVtYS5hZGRpdGlvbmFsUHJvcGVydGllcykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICghc2NoZW1hLnByb3BlcnRpZXMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBwcm9wZXJ0eSBvZiBPYmplY3Qua2V5cyhzY2hlbWEucHJvcGVydGllcykpIHtcblx0XHRcdGlmICghdGhpcy5jYW5Qcm9tcHRGb3JQcm9wZXJ0eShzY2hlbWEucHJvcGVydGllc1twcm9wZXJ0eV0pKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGdldFNuaXBwZXRGb3JGaXJzdFVuY29uZmlndXJlZFByb3BlcnR5KGNvbmZpZ3VyYXRpb246IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+LCBzY2hlbWE6IElKU09OU2NoZW1hKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXNjaGVtYS5wcm9wZXJ0aWVzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHByb3BlcnR5IG9mIE9iamVjdC5rZXlzKHNjaGVtYS5wcm9wZXJ0aWVzKSkge1xuXHRcdFx0aWYgKGNvbmZpZ3VyYXRpb25bcHJvcGVydHldID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3QgcHJvcGVydHlTY2hlbWEgPSBzY2hlbWEucHJvcGVydGllc1twcm9wZXJ0eV07XG5cdFx0XHRcdGNvbnN0IHNuaXBwZXQgPSB0aGlzLmdldFNuaXBwZXRGb3JQcm9wZXJ0eShwcm9wZXJ0eSwgcHJvcGVydHlTY2hlbWEpO1xuXHRcdFx0XHRpZiAoc25pcHBldCkge1xuXHRcdFx0XHRcdHJldHVybiBzbmlwcGV0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldFNuaXBwZXRGb3JQcm9wZXJ0eShwcm9wZXJ0eTogc3RyaW5nLCBwcm9wZXJ0eVNjaGVtYTogSUpTT05TY2hlbWEpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGJvZHlUZXh0ID0gdGhpcy5nZXREZWZhdWx0U25pcHBldEJvZHlUZXh0KHByb3BlcnR5U2NoZW1hKTtcblx0XHRyZXR1cm4gYm9keVRleHQgPyBgXCIke3Byb3BlcnR5fVwiOiAke2JvZHlUZXh0fWAgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldFNuaXBwZXRGb3JBcnJheUl0ZW0ocHJvcGVydHlTY2hlbWE6IElKU09OU2NoZW1hKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nZXREZWZhdWx0U25pcHBldEJvZHlUZXh0KHByb3BlcnR5U2NoZW1hLCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGVmYXVsdFNuaXBwZXRCb2R5VGV4dChwcm9wZXJ0eVNjaGVtYTogSUpTT05TY2hlbWEsIGFycmF5SXRlbSA9IGZhbHNlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzbmlwcGV0ID0gcHJvcGVydHlTY2hlbWEuZGVmYXVsdFNuaXBwZXRzPy5bMF07XG5cdFx0aWYgKCFzbmlwcGV0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJvZHlUZXh0ID0gYXJyYXlJdGVtXG5cdFx0XHQ/IEFycmF5LmlzQXJyYXkoc25pcHBldC5ib2R5KSAmJiBzbmlwcGV0LmJvZHkubGVuZ3RoID4gMCA/IEpTT04uc3RyaW5naWZ5KHNuaXBwZXQuYm9keVswXSwgbnVsbCwgJ1xcdCcpIDogdW5kZWZpbmVkXG5cdFx0XHQ6IHNuaXBwZXQuYm9keVRleHQgPz8gSlNPTi5zdHJpbmdpZnkoc25pcHBldC5ib2R5LCBudWxsLCAnXFx0Jyk7XG5cdFx0aWYgKCFib2R5VGV4dCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gYm9keVRleHQucmVwbGFjZSgvXCIoXFxeW15cIl0qKVwiL2csIChfLCB2YWx1ZSkgPT4gdmFsdWUuc3Vic3RyaW5nKDEpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcHJvbXB0Rm9yTmFtZShsYW5ndWFnZU1vZGVsUHJvdmlkZXJHcm91cHM6IHJlYWRvbmx5IElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBbXSwgdmVuZG9yOiBJVXNlckZyaWVuZGx5TGFuZ3VhZ2VNb2RlbCwgZXhpc3Rpbmc6IElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAgfCB1bmRlZmluZWQpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGxldCBwcm92aWRlckdyb3VwTmFtZSA9IGV4aXN0aW5nPy5uYW1lO1xuXHRcdGlmICghcHJvdmlkZXJHcm91cE5hbWUpIHtcblx0XHRcdHByb3ZpZGVyR3JvdXBOYW1lID0gdmVuZG9yLmRpc3BsYXlOYW1lO1xuXHRcdFx0bGV0IGNvdW50ID0gMTtcblx0XHRcdHdoaWxlIChsYW5ndWFnZU1vZGVsUHJvdmlkZXJHcm91cHMuc29tZShnID0+IGcudmVuZG9yID09PSB2ZW5kb3IudmVuZG9yICYmIGcubmFtZSA9PT0gcHJvdmlkZXJHcm91cE5hbWUpKSB7XG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0XHRcdHByb3ZpZGVyR3JvdXBOYW1lID0gYCR7dmVuZG9yLmRpc3BsYXlOYW1lfSAke2NvdW50fWA7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IHJlc3VsdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0Y29uc3QgaW5wdXRCb3ggPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlSW5wdXRCb3goKSk7XG5cdFx0XHRcdGlucHV0Qm94LnRpdGxlID0gbG9jYWxpemUoJ2NvbmZpZ3VyZUxhbmd1YWdlTW9kZWxHcm91cCcsIFwiR3JvdXAgTmFtZVwiKTtcblx0XHRcdFx0aW5wdXRCb3gucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnbGFuZ3VhZ2VNb2RlbEdyb3VwTmFtZScsIFwiRW50ZXIgYSBuYW1lIGZvciB0aGUgZ3JvdXBcIik7XG5cdFx0XHRcdGlucHV0Qm94LnZhbHVlID0gcHJvdmlkZXJHcm91cE5hbWU7XG5cdFx0XHRcdGlucHV0Qm94Lmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoaW5wdXRCb3gub25EaWRDaGFuZ2VWYWx1ZSh2YWx1ZSA9PiB7XG5cdFx0XHRcdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0XHRcdFx0aW5wdXRCb3gudmFsaWRhdGlvbk1lc3NhZ2UgPSBsb2NhbGl6ZSgnZW50ZXJOYW1lJywgXCJQbGVhc2UgZW50ZXIgYSBuYW1lXCIpO1xuXHRcdFx0XHRcdFx0aW5wdXRCb3guc2V2ZXJpdHkgPSBTZXZlcml0eS5FcnJvcjtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGxhbmd1YWdlTW9kZWxQcm92aWRlckdyb3Vwcy5zb21lKGdyb3VwID0+IGdyb3VwICE9PSBleGlzdGluZyAmJiBncm91cC52ZW5kb3IgPT09IHZlbmRvci52ZW5kb3IgJiYgZ3JvdXAubmFtZSA9PT0gdmFsdWUpKSB7XG5cdFx0XHRcdFx0XHRpbnB1dEJveC52YWxpZGF0aW9uTWVzc2FnZSA9IGxvY2FsaXplKCduYW1lRXhpc3RzJywgXCJBIGxhbmd1YWdlIG1vZGVscyBncm91cCB3aXRoIHRoaXMgbmFtZSBhbHJlYWR5IGV4aXN0c1wiKTtcblx0XHRcdFx0XHRcdGlucHV0Qm94LnNldmVyaXR5ID0gU2V2ZXJpdHkuRXJyb3I7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlucHV0Qm94LnZhbGlkYXRpb25NZXNzYWdlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlucHV0Qm94LnNldmVyaXR5ID0gU2V2ZXJpdHkuSWdub3JlO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChpbnB1dEJveC5vbkRpZEFjY2VwdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gaW5wdXRCb3gudmFsdWU7XG5cdFx0XHRcdFx0aW5wdXRCb3guaGlkZSgpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChpbnB1dEJveC5vbkRpZEhpZGUoKCkgPT4gcmVzb2x2ZSgpKSk7XG5cdFx0XHRcdGlucHV0Qm94LnNob3coKTtcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHByb21wdEZvckNvbmZpZ3VyYXRpb24oZ3JvdXBOYW1lOiBzdHJpbmcsIGNvbmZpZ3VyYXRpb246IElKU09OU2NoZW1hLCBleGlzdGluZzogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gfCB1bmRlZmluZWQpOiBQcm9taXNlPElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCFjb25maWd1cmF0aW9uLnByb3BlcnRpZXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQ6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+ID0gZXhpc3RpbmcgPyB7IC4uLmV4aXN0aW5nIH0gOiB7fTtcblxuXHRcdGZvciAoY29uc3QgcHJvcGVydHkgb2YgT2JqZWN0LmtleXMoY29uZmlndXJhdGlvbi5wcm9wZXJ0aWVzKSkge1xuXHRcdFx0Y29uc3QgcHJvcGVydHlTY2hlbWEgPSBjb25maWd1cmF0aW9uLnByb3BlcnRpZXNbcHJvcGVydHldO1xuXHRcdFx0Y29uc3QgcmVxdWlyZWQgPSAhIWNvbmZpZ3VyYXRpb24ucmVxdWlyZWQ/LmluY2x1ZGVzKHByb3BlcnR5KTtcblx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5wcm9tcHRGb3JWYWx1ZShncm91cE5hbWUsIHByb3BlcnR5LCBwcm9wZXJ0eVNjaGVtYSwgcmVxdWlyZWQsIGV4aXN0aW5nKTtcblx0XHRcdGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJlc3VsdFtwcm9wZXJ0eV0gPSB2YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwcm9tcHRGb3JWYWx1ZShncm91cE5hbWU6IHN0cmluZywgcHJvcGVydHk6IHN0cmluZywgcHJvcGVydHlTY2hlbWE6IElKU09OU2NoZW1hIHwgdW5kZWZpbmVkLCByZXF1aXJlZDogYm9vbGVhbiwgZXhpc3Rpbmc6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHwgdW5kZWZpbmVkKTogUHJvbWlzZTx1bmtub3duIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCFwcm9wZXJ0eVNjaGVtYSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuY2FuUHJvbXB0Rm9yUHJvcGVydHkocHJvcGVydHlTY2hlbWEpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChwcm9wZXJ0eVNjaGVtYS50eXBlID09PSAnYXJyYXknICYmIHByb3BlcnR5U2NoZW1hLml0ZW1zICYmICFBcnJheS5pc0FycmF5KHByb3BlcnR5U2NoZW1hLml0ZW1zKSAmJiBwcm9wZXJ0eVNjaGVtYS5pdGVtcy5lbnVtKSB7XG5cdFx0XHRjb25zdCBzZWxlY3RlZEl0ZW1zID0gYXdhaXQgdGhpcy5wcm9tcHRGb3JBcnJheShncm91cE5hbWUsIHByb3BlcnR5LCBwcm9wZXJ0eVNjaGVtYSk7XG5cdFx0XHRpZiAoc2VsZWN0ZWRJdGVtcyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gc2VsZWN0ZWRJdGVtcztcblx0XHR9XG5cblx0XHRpZiAocHJvcGVydHlTY2hlbWEudHlwZSA9PT0gJ3N0cmluZycgJiYgQXJyYXkuaXNBcnJheShwcm9wZXJ0eVNjaGVtYS5lbnVtKSAmJiBwcm9wZXJ0eVNjaGVtYS5lbnVtLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiB0aGlzLnByb21wdEZvckVudW0oZ3JvdXBOYW1lLCBwcm9wZXJ0eSwgcHJvcGVydHlTY2hlbWEsIGV4aXN0aW5nKTtcblx0XHR9XG5cblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMucHJvbXB0Rm9ySW5wdXQoZ3JvdXBOYW1lLCBwcm9wZXJ0eSwgcHJvcGVydHlTY2hlbWEsIHJlcXVpcmVkLCBleGlzdGluZyk7XG5cdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBjYW5Qcm9tcHRGb3JQcm9wZXJ0eShwcm9wZXJ0eVNjaGVtYTogSUpTT05TY2hlbWEgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoIXByb3BlcnR5U2NoZW1hIHx8IHR5cGVvZiBwcm9wZXJ0eVNjaGVtYSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHByb3BlcnR5U2NoZW1hLnR5cGUgPT09ICdhcnJheScgJiYgcHJvcGVydHlTY2hlbWEuaXRlbXMgJiYgIUFycmF5LmlzQXJyYXkocHJvcGVydHlTY2hlbWEuaXRlbXMpICYmIHByb3BlcnR5U2NoZW1hLml0ZW1zLmVudW0pIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChwcm9wZXJ0eVNjaGVtYS50eXBlID09PSAnc3RyaW5nJyB8fCBwcm9wZXJ0eVNjaGVtYS50eXBlID09PSAnbnVtYmVyJyB8fCBwcm9wZXJ0eVNjaGVtYS50eXBlID09PSAnaW50ZWdlcicgfHwgcHJvcGVydHlTY2hlbWEudHlwZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGdldERlc2NyaXB0aW9uUGxhaW50ZXh0KHByb3BlcnR5U2NoZW1hOiBJSlNPTlNjaGVtYSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHByb3BlcnR5U2NoZW1hLmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRyZXR1cm4gcHJvcGVydHlTY2hlbWEuZGVzY3JpcHRpb247XG5cdFx0fVxuXHRcdGNvbnN0IG1kID0gcHJvcGVydHlTY2hlbWEubWFya2Rvd25EZXNjcmlwdGlvbjtcblx0XHRpZiAoIW1kKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHQvLyBRdWljayBpbnB1dCByZW5kZXJzIHBsYWluIHRleHQgb25seS4gU3RyaXAgdGhlIGlubGluZSBtYXJrZG93biBmZWF0dXJlcyB1c2VkIGJ5XG5cdFx0Ly8gb3VyIHNjaGVtYXMgKGlubGluZSBjb2RlLCBib2xkL2l0YWxpYywgbGlua3MpIHNvIHVzZXJzIHNlZSByZWFkYWJsZSBoZWxwLlxuXHRcdHJldHVybiBtZFxuXHRcdFx0LnJlcGxhY2UoL2AoW15gXSspYC9nLCAnJDEnKVxuXHRcdFx0LnJlcGxhY2UoL1xcKlxcKihbXipdKylcXCpcXCovZywgJyQxJylcblx0XHRcdC5yZXBsYWNlKC9cXCooW14qXSspXFwqL2csICckMScpXG5cdFx0XHQucmVwbGFjZSgvXFxbKFteXFxdXSspXFxdXFwoW14pXStcXCkvZywgJyQxJyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHByb21wdEZvckFycmF5KGdyb3VwTmFtZTogc3RyaW5nLCBwcm9wZXJ0eTogc3RyaW5nLCBwcm9wZXJ0eVNjaGVtYTogSUpTT05TY2hlbWEpOiBQcm9taXNlPHN0cmluZ1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCFwcm9wZXJ0eVNjaGVtYS5pdGVtcyB8fCBBcnJheS5pc0FycmF5KHByb3BlcnR5U2NoZW1hLml0ZW1zKSB8fCAhcHJvcGVydHlTY2hlbWEuaXRlbXMuZW51bSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgaXRlbXMgPSBwcm9wZXJ0eVNjaGVtYS5pdGVtcy5lbnVtO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgbmV3IFByb21pc2U8c3RyaW5nW10gfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRjb25zdCBxdWlja1BpY2sgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrKCkpO1xuXHRcdFx0XHRxdWlja1BpY2sudGl0bGUgPSBgJHtncm91cE5hbWV9OiAke3Byb3BlcnR5U2NoZW1hLnRpdGxlID8/IHByb3BlcnR5fWA7XG5cdFx0XHRcdHF1aWNrUGljay5pdGVtcyA9IGl0ZW1zLm1hcChpdGVtID0+ICh7IGxhYmVsOiBpdGVtIH0pKTtcblx0XHRcdFx0cXVpY2tQaWNrLnBsYWNlaG9sZGVyID0gdGhpcy5nZXREZXNjcmlwdGlvblBsYWludGV4dChwcm9wZXJ0eVNjaGVtYSkgPz8gbG9jYWxpemUoJ3NlbGVjdFZhbHVlJywgXCJTZWxlY3QgdmFsdWUgZm9yIHswfVwiLCBwcm9wZXJ0eSk7XG5cdFx0XHRcdHF1aWNrUGljay5jYW5TZWxlY3RNYW55ID0gdHJ1ZTtcblx0XHRcdFx0cXVpY2tQaWNrLmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdFx0XHRyZXNvbHZlKHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zLm1hcChpdGVtID0+IGl0ZW0ubGFiZWwpKTtcblx0XHRcdFx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0cXVpY2tQaWNrLnNob3coKTtcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwcm9tcHRGb3JFbnVtKGdyb3VwTmFtZTogc3RyaW5nLCBwcm9wZXJ0eTogc3RyaW5nLCBwcm9wZXJ0eVNjaGVtYTogSUpTT05TY2hlbWEgJiB7IGVudW1JdGVtTGFiZWxzPzogc3RyaW5nW10gfSwgZXhpc3Rpbmc6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHwgdW5kZWZpbmVkKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB2YWx1ZXMgPSBwcm9wZXJ0eVNjaGVtYS5lbnVtO1xuXHRcdGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZXMpIHx8IHZhbHVlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGVudW1EZXNjcmlwdGlvbnMgPSBwcm9wZXJ0eVNjaGVtYS5lbnVtRGVzY3JpcHRpb25zO1xuXHRcdGNvbnN0IGVudW1JdGVtTGFiZWxzID0gQXJyYXkuaXNBcnJheShwcm9wZXJ0eVNjaGVtYS5lbnVtSXRlbUxhYmVscykgPyBwcm9wZXJ0eVNjaGVtYS5lbnVtSXRlbUxhYmVscyA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBpbml0aWFsID0gZXhpc3Rpbmc/Lltwcm9wZXJ0eV0gIT09IHVuZGVmaW5lZCA/IFN0cmluZyhleGlzdGluZ1twcm9wZXJ0eV0pIDogKHByb3BlcnR5U2NoZW1hLmRlZmF1bHQgIT09IHVuZGVmaW5lZCA/IFN0cmluZyhwcm9wZXJ0eVNjaGVtYS5kZWZhdWx0KSA6IHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgaXRlbXM6IElRdWlja1BpY2tJdGVtW10gPSB2YWx1ZXMubWFwKCh2YWx1ZSwgaW5kZXgpID0+ICh7XG5cdFx0XHRsYWJlbDogZW51bUl0ZW1MYWJlbHM/LltpbmRleF0gPz8gU3RyaW5nKHZhbHVlKSxcblx0XHRcdGRlc2NyaXB0aW9uOiBlbnVtRGVzY3JpcHRpb25zPy5baW5kZXhdLFxuXHRcdFx0aWQ6IFN0cmluZyh2YWx1ZSlcblx0XHR9KSk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBuZXcgUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRjb25zdCBxdWlja1BpY2sgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtPigpKTtcblx0XHRcdFx0cXVpY2tQaWNrLnRpdGxlID0gYCR7Z3JvdXBOYW1lfTogJHtwcm9wZXJ0eVNjaGVtYS50aXRsZSA/PyBwcm9wZXJ0eX1gO1xuXHRcdFx0XHRxdWlja1BpY2suaXRlbXMgPSBpdGVtcztcblx0XHRcdFx0cXVpY2tQaWNrLnBsYWNlaG9sZGVyID0gdGhpcy5nZXREZXNjcmlwdGlvblBsYWludGV4dChwcm9wZXJ0eVNjaGVtYSkgPz8gbG9jYWxpemUoJ3NlbGVjdFZhbHVlJywgXCJTZWxlY3QgdmFsdWUgZm9yIHswfVwiLCBwcm9wZXJ0eSk7XG5cdFx0XHRcdHF1aWNrUGljay5pZ25vcmVGb2N1c091dCA9IHRydWU7XG5cdFx0XHRcdGlmIChpbml0aWFsICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjb25zdCBtYXRjaCA9IGl0ZW1zLmZpbmQoaXRlbSA9PiBpdGVtLmlkID09PSBpbml0aWFsKTtcblx0XHRcdFx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdFx0XHRcdHF1aWNrUGljay5hY3RpdmVJdGVtcyA9IFttYXRjaF07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWQgPSBxdWlja1BpY2suc2VsZWN0ZWRJdGVtc1swXTtcblx0XHRcdFx0XHRyZXNvbHZlKHNlbGVjdGVkPy5pZCk7XG5cdFx0XHRcdFx0cXVpY2tQaWNrLmhpZGUoKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHF1aWNrUGljay5zaG93KCk7XG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcHJvbXB0Rm9ySW5wdXQoZ3JvdXBOYW1lOiBzdHJpbmcsIHByb3BlcnR5OiBzdHJpbmcsIHByb3BlcnR5U2NoZW1hOiBJSlNPTlNjaGVtYSwgcmVxdWlyZWQ6IGJvb2xlYW4sIGV4aXN0aW5nOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiB8IHVuZGVmaW5lZCk6IFByb21pc2U8c3RyaW5nIHwgbnVtYmVyIHwgYm9vbGVhbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB2YWxpZGF0ZSA9ICh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0aWYgKCF2YWx1ZSAmJiByZXF1aXJlZCkge1xuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgndmFsdWVSZXF1aXJlZCcsIFwiVmFsdWUgaXMgcmVxdWlyZWRcIik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgbmV3IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IGlucHV0Qm94ID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZUlucHV0Qm94KCkpO1xuXHRcdFx0XHRpbnB1dEJveC50aXRsZSA9IGAke2dyb3VwTmFtZX06ICR7cHJvcGVydHlTY2hlbWEudGl0bGUgPz8gcHJvcGVydHl9YDtcblx0XHRcdFx0aW5wdXRCb3gucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnZW50ZXJWYWx1ZScsIFwiRW50ZXIgdmFsdWUgZm9yIHswfVwiLCBwcm9wZXJ0eSk7XG5cdFx0XHRcdGlucHV0Qm94LnBhc3N3b3JkID0gISFwcm9wZXJ0eVNjaGVtYS5zZWNyZXQ7XG5cdFx0XHRcdGlucHV0Qm94Lmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblx0XHRcdFx0aWYgKGV4aXN0aW5nPy5bcHJvcGVydHldKSB7XG5cdFx0XHRcdFx0aW5wdXRCb3gudmFsdWUgPSBTdHJpbmcoZXhpc3Rpbmc/Lltwcm9wZXJ0eV0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHByb3BlcnR5U2NoZW1hLmRlZmF1bHQpIHtcblx0XHRcdFx0XHRpbnB1dEJveC52YWx1ZSA9IFN0cmluZyhwcm9wZXJ0eVNjaGVtYS5kZWZhdWx0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBwcm9tcHRUZXh0ID0gdGhpcy5nZXREZXNjcmlwdGlvblBsYWludGV4dChwcm9wZXJ0eVNjaGVtYSk7XG5cdFx0XHRcdGlmIChwcm9tcHRUZXh0KSB7XG5cdFx0XHRcdFx0aW5wdXRCb3gucHJvbXB0ID0gcHJvbXB0VGV4dDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChpbnB1dEJveC5vbkRpZENoYW5nZVZhbHVlKHZhbHVlID0+IHtcblx0XHRcdFx0XHRjb25zdCBtZXNzYWdlID0gdmFsaWRhdGUodmFsdWUpO1xuXHRcdFx0XHRcdGlmIChtZXNzYWdlKSB7XG5cdFx0XHRcdFx0XHRpbnB1dEJveC52YWxpZGF0aW9uTWVzc2FnZSA9IG1lc3NhZ2U7XG5cdFx0XHRcdFx0XHRpbnB1dEJveC5zZXZlcml0eSA9IFNldmVyaXR5LkVycm9yO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRpbnB1dEJveC52YWxpZGF0aW9uTWVzc2FnZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdGlucHV0Qm94LnNldmVyaXR5ID0gU2V2ZXJpdHkuSWdub3JlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChpbnB1dEJveC5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IHZhbGlkYXRlKGlucHV0Qm94LnZhbHVlKTtcblx0XHRcdFx0XHRpZiAobWVzc2FnZSkge1xuXHRcdFx0XHRcdFx0aW5wdXRCb3gudmFsaWRhdGlvbk1lc3NhZ2UgPSBtZXNzYWdlO1xuXHRcdFx0XHRcdFx0aW5wdXRCb3guc2V2ZXJpdHkgPSBTZXZlcml0eS5FcnJvcjtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmVzb2x2ZShpbnB1dEJveC52YWx1ZSk7XG5cdFx0XHRcdFx0aW5wdXRCb3guaGlkZSgpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGlucHV0Qm94Lm9uRGlkSGlkZSgoZSkgPT4ge1xuXHRcdFx0XHRcdGlmIChlLnJlYXNvbiA9PT0gUXVpY2tJbnB1dEhpZGVSZWFzb24uR2VzdHVyZSkge1xuXHRcdFx0XHRcdFx0cmVqZWN0KG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdGlucHV0Qm94LnNob3coKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIFVzZXIgY2FuY2VsbGVkXG5cdFx0XHR9XG5cblx0XHRcdGlmIChwcm9wZXJ0eVNjaGVtYS50eXBlID09PSAnbnVtYmVyJyB8fCBwcm9wZXJ0eVNjaGVtYS50eXBlID09PSAnaW50ZWdlcicpIHtcblx0XHRcdFx0cmV0dXJuIE51bWJlcih2YWx1ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKHByb3BlcnR5U2NoZW1hLnR5cGUgPT09ICdib29sZWFuJykge1xuXHRcdFx0XHRyZXR1cm4gdmFsdWUgPT09ICd0cnVlJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHRcdH1cblxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBlbmNvZGVTZWNyZXRLZXkocHJvcGVydHk6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGZvcm1hdChMYW5ndWFnZU1vZGVsc1NlcnZpY2UuU0VDUkVUX0lOUFVULCBwcm9wZXJ0eSk7XG5cdH1cblxuXHRwcml2YXRlIGRlY29kZVNlY3JldEtleShzZWNyZXRJbnB1dDogdW5rbm93bik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFpc1N0cmluZyhzZWNyZXRJbnB1dCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBzZWNyZXRJbnB1dC5zdWJzdHJpbmcoc2VjcmV0SW5wdXQuaW5kZXhPZignOicpICsgMSwgc2VjcmV0SW5wdXQubGVuZ3RoIC0gMSk7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhck1vZGVsQ2FjaGUodmVuZG9yOiBzdHJpbmcpOiBNYXA8c3RyaW5nLCBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YT4ge1xuXHRcdGNvbnN0IHJlbW92ZWQgPSBuZXcgTWFwPHN0cmluZywgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE+KCk7XG5cdFx0Zm9yIChjb25zdCBbaWQsIG1vZGVsXSBvZiB0aGlzLl9tb2RlbENhY2hlLmVudHJpZXMoKSkge1xuXHRcdFx0aWYgKG1vZGVsLnZlbmRvciA9PT0gdmVuZG9yKSB7XG5cdFx0XHRcdHJlbW92ZWQuc2V0KGlkLCBtb2RlbCk7XG5cdFx0XHRcdHRoaXMuX21vZGVsQ2FjaGUuZGVsZXRlKGlkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlbW92ZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhck1vZGVsQ29uZmlndXJhdGlvbnModmVuZG9yOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFtpZF0gb2YgdGhpcy5fbW9kZWxDb25maWd1cmF0aW9ucykge1xuXHRcdFx0aWYgKHRoaXMuX21vZGVsQ2FjaGUuZ2V0KGlkKT8udmVuZG9yID09PSB2ZW5kb3IgfHwgaWQuc3RhcnRzV2l0aChgJHt2ZW5kb3J9L2ApKSB7XG5cdFx0XHRcdHRoaXMuX21vZGVsQ29uZmlndXJhdGlvbnMuZGVsZXRlKGlkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlQ29uZmlndXJhdGlvbihncm91cDogSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCwgc2NoZW1hOiBJSlNPTlNjaGVtYSB8IHVuZGVmaW5lZCk6IFByb21pc2U8SVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4+IHtcblx0XHRpZiAoIXNjaGVtYSkge1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gPSB7fTtcblx0XHRmb3IgKGNvbnN0IGtleSBpbiBncm91cCkge1xuXHRcdFx0aWYgKGtleSA9PT0gJ3ZlbmRvcicgfHwga2V5ID09PSAnbmFtZScgfHwga2V5ID09PSAncmFuZ2UnIHx8IGtleSA9PT0gJ21vZGVsc1JhbmdlJyB8fCBrZXkgPT09ICdzZXR0aW5ncycpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRsZXQgdmFsdWUgPSBncm91cFtrZXldO1xuXHRcdFx0aWYgKHNjaGVtYS5wcm9wZXJ0aWVzPy5ba2V5XT8uc2VjcmV0KSB7XG5cdFx0XHRcdGNvbnN0IHNlY3JldEtleSA9IHRoaXMuZGVjb2RlU2VjcmV0S2V5KHZhbHVlKTtcblx0XHRcdFx0dmFsdWUgPSBzZWNyZXRLZXkgPyBhd2FpdCB0aGlzLl9zZWNyZXRTdG9yYWdlU2VydmljZS5nZXQoc2VjcmV0S2V5KSA6IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJlc3VsdFtrZXldID0gdmFsdWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVMYW5ndWFnZU1vZGVsUHJvdmlkZXJHcm91cChuYW1lOiBzdHJpbmcsIHZlbmRvcjogc3RyaW5nLCBjb25maWd1cmF0aW9uOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiB8IHVuZGVmaW5lZCwgc2NoZW1hOiBJSlNPTlNjaGVtYSB8IHVuZGVmaW5lZCk6IFByb21pc2U8SUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cD4ge1xuXHRcdGlmICghc2NoZW1hKSB7XG5cdFx0XHRyZXR1cm4geyBuYW1lLCB2ZW5kb3IgfTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQ6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+ID0ge307XG5cdFx0Zm9yIChjb25zdCBrZXkgaW4gY29uZmlndXJhdGlvbikge1xuXHRcdFx0bGV0IHZhbHVlID0gY29uZmlndXJhdGlvbltrZXldO1xuXHRcdFx0aWYgKHNjaGVtYS5wcm9wZXJ0aWVzPy5ba2V5XT8uc2VjcmV0ICYmIGlzU3RyaW5nKHZhbHVlKSkge1xuXHRcdFx0XHRjb25zdCBzZWNyZXRLZXkgPSBgJHtMYW5ndWFnZU1vZGVsc1NlcnZpY2UuU0VDUkVUX0tFWV9QUkVGSVh9JHtoYXNoKGdlbmVyYXRlVXVpZCgpKS50b1N0cmluZygxNil9YDtcblx0XHRcdFx0YXdhaXQgdGhpcy5fc2VjcmV0U3RvcmFnZVNlcnZpY2Uuc2V0KHNlY3JldEtleSwga2V5ID09PSAnYXBpS2V5JyA/IHZhbHVlLnRyaW0oKSA6IHZhbHVlKTtcblx0XHRcdFx0dmFsdWUgPSB0aGlzLmVuY29kZVNlY3JldEtleShzZWNyZXRLZXkpO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0W2tleV0gPSB2YWx1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBuYW1lLCB2ZW5kb3IsIC4uLnJlc3VsdCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZGVsZXRlU2VjcmV0c0luQ29uZmlndXJhdGlvbihncm91cDogSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCwgc2NoZW1hOiBJSlNPTlNjaGVtYSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghc2NoZW1hKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyB2ZW5kb3IsIG5hbWUsIHJhbmdlLCBtb2RlbHNSYW5nZSwgLi4uY29uZmlndXJhdGlvbiB9ID0gZ3JvdXA7XG5cdFx0Zm9yIChjb25zdCBrZXkgaW4gY29uZmlndXJhdGlvbikge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBncm91cFtrZXldO1xuXHRcdFx0aWYgKHNjaGVtYS5wcm9wZXJ0aWVzPy5ba2V5XT8uc2VjcmV0KSB7XG5cdFx0XHRcdGNvbnN0IHNlY3JldEtleSA9IHRoaXMuZGVjb2RlU2VjcmV0S2V5KHZhbHVlKTtcblx0XHRcdFx0aWYgKHNlY3JldEtleSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3NlY3JldFN0b3JhZ2VTZXJ2aWNlLmRlbGV0ZShzZWNyZXRLZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgbWlncmF0ZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cChsYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXA6IElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXApOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB7IHZlbmRvciwgbmFtZSwgLi4uY29uZmlndXJhdGlvbiB9ID0gbGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwO1xuXHRcdGlmICghdGhpcy5fdmVuZG9ycy5nZXQodmVuZG9yKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBWZW5kb3IgJHt2ZW5kb3J9IG5vdCBmb3VuZC5gKTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudChgb25MYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyOiR7dmVuZG9yfWApO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fcHJvdmlkZXJzLmdldCh2ZW5kb3IpO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2hhdCBtb2RlbCBwcm92aWRlciBmb3IgdmVuZG9yICR7dmVuZG9yfSBpcyBub3QgcmVnaXN0ZXJlZC5gKTtcblx0XHR9XG5cblx0XHRhd2FpdCBwcm92aWRlci5wcm92aWRlTGFuZ3VhZ2VNb2RlbENoYXRJbmZvKHsgZ3JvdXA6IG5hbWUsIHNpbGVudDogZmFsc2UsIGNvbmZpZ3VyYXRpb24gfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhd2FpdCB0aGlzLmFkZExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cChuYW1lLCB2ZW5kb3IsIGNvbmZpZ3VyYXRpb24pO1xuXHR9XG5cblx0Ly8jcmVnaW9uIFJlY2VudGx5IHVzZWQgbW9kZWxzXG5cblx0cHJpdmF0ZSBfcmVhZFJlY2VudGx5VXNlZE1vZGVscygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldE9iamVjdDxzdHJpbmdbXT4oQ0hBVF9NT0RFTF9SRUNFTlRMWV9VU0VEX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgW10pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2F2ZVJlY2VudGx5VXNlZE1vZGVscygpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShDSEFUX01PREVMX1JFQ0VOVExZX1VTRURfU1RPUkFHRV9LRVksIHRoaXMuX3JlY2VudGx5VXNlZE1vZGVsSWRzLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG5cdGdldFJlY2VudGx5VXNlZE1vZGVsSWRzKCk6IHN0cmluZ1tdIHtcblx0XHQvLyBGaWx0ZXIgdG8gb25seSBpbmNsdWRlIG1vZGVscyB0aGF0IHN0aWxsIGV4aXN0IGluIHRoZSBjYWNoZVxuXHRcdHJldHVybiB0aGlzLl9yZWNlbnRseVVzZWRNb2RlbElkc1xuXHRcdFx0LmZpbHRlcihpZCA9PiB0aGlzLl9tb2RlbENhY2hlLmhhcyhpZCkgJiYgaWQgIT09IEFVVE9fTU9ERUxfSURFTlRJRklFUilcblx0XHRcdC5zbGljZSgwLCA0KTtcblx0fVxuXG5cdGFkZFRvUmVjZW50bHlVc2VkTGlzdChtb2RlbElkZW50aWZpZXI6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChtb2RlbElkZW50aWZpZXIgPT09IEFVVE9fTU9ERUxfSURFTlRJRklFUikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSBpZiBhbHJlYWR5IHByZXNlbnQgKHRvIG1vdmUgdG8gZnJvbnQpXG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9yZWNlbnRseVVzZWRNb2RlbElkcy5pbmRleE9mKG1vZGVsSWRlbnRpZmllcik7XG5cdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0dGhpcy5fcmVjZW50bHlVc2VkTW9kZWxJZHMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHR9XG5cdFx0Ly8gQWRkIHRvIGZyb250XG5cdFx0dGhpcy5fcmVjZW50bHlVc2VkTW9kZWxJZHMudW5zaGlmdChtb2RlbElkZW50aWZpZXIpO1xuXHRcdC8vIENhcCBhdCBhIHJlYXNvbmFibGUgbWF4IHRvIGF2b2lkIHVuYm91bmRlZCBncm93dGhcblx0XHRpZiAodGhpcy5fcmVjZW50bHlVc2VkTW9kZWxJZHMubGVuZ3RoID4gMjApIHtcblx0XHRcdHRoaXMuX3JlY2VudGx5VXNlZE1vZGVsSWRzLmxlbmd0aCA9IDIwO1xuXHRcdH1cblx0XHR0aGlzLl9zYXZlUmVjZW50bHlVc2VkTW9kZWxzKCk7XG5cdH1cblxuXHRjbGVhclJlY2VudGx5VXNlZExpc3QoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVjZW50bHlVc2VkTW9kZWxJZHMgPSBbXTtcblx0XHR0aGlzLl9zYXZlUmVjZW50bHlVc2VkTW9kZWxzKCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gUGlubmVkIG1vZGVsc1xuXG5cdHByaXZhdGUgX3JlYWRQaW5uZWRNb2RlbHMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXRPYmplY3Q8c3RyaW5nW10+KENIQVRfTU9ERUxfUElOTkVEX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgW10pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2F2ZVBpbm5lZE1vZGVscygpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShDSEFUX01PREVMX1BJTk5FRF9TVE9SQUdFX0tFWSwgdGhpcy5fcGlubmVkTW9kZWxJZHMsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHR9XG5cblx0Z2V0UGlubmVkTW9kZWxJZHMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLl9waW5uZWRNb2RlbElkcy5maWx0ZXIoaWQgPT4gaWQgIT09IEFVVE9fTU9ERUxfSURFTlRJRklFUiAmJiB0aGlzLl9tb2RlbENhY2hlLmhhcyhpZCkpO1xuXHR9XG5cblx0cGluTW9kZWwobW9kZWxJZGVudGlmaWVyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAobW9kZWxJZGVudGlmaWVyID09PSBBVVRPX01PREVMX0lERU5USUZJRVIgfHwgdGhpcy5fcGlubmVkTW9kZWxJZHMuaW5jbHVkZXMobW9kZWxJZGVudGlmaWVyKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9waW5uZWRNb2RlbElkcy5wdXNoKG1vZGVsSWRlbnRpZmllcik7XG5cdFx0dGhpcy5fc2F2ZVBpbm5lZE1vZGVscygpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUGlubmVkTW9kZWxzLmZpcmUoKTtcblx0fVxuXG5cdHVucGluTW9kZWwobW9kZWxJZGVudGlmaWVyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuX3Bpbm5lZE1vZGVsSWRzLmluZGV4T2YobW9kZWxJZGVudGlmaWVyKTtcblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Bpbm5lZE1vZGVsSWRzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0dGhpcy5fc2F2ZVBpbm5lZE1vZGVscygpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUGlubmVkTW9kZWxzLmZpcmUoKTtcblx0fVxuXG5cdGlzTW9kZWxQaW5uZWQobW9kZWxJZGVudGlmaWVyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gbW9kZWxJZGVudGlmaWVyICE9PSBBVVRPX01PREVMX0lERU5USUZJRVIgJiYgdGhpcy5fcGlubmVkTW9kZWxJZHMuaW5jbHVkZXMobW9kZWxJZGVudGlmaWVyKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBNb2RlbCB2aXNpYmlsaXR5XG5cblx0cHJpdmF0ZSBfZ2V0R3JvdXBOYW1lRm9yVmVuZG9yKHZlbmRvcjogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fdmVuZG9ycy5nZXQodmVuZG9yKT8uZGlzcGxheU5hbWUgPz8gdmVuZG9yO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TW9kZWxJZHNJbkdyb3VwKHZlbmRvcjogc3RyaW5nLCBncm91cE5hbWU6IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCB2ZW5kb3JHcm91cHMgPSB0aGlzLl9tb2RlbHNHcm91cHMuZ2V0KHZlbmRvcik7XG5cdFx0aWYgKCF2ZW5kb3JHcm91cHMpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGZhbGxiYWNrTmFtZSA9IHRoaXMuX2dldEdyb3VwTmFtZUZvclZlbmRvcih2ZW5kb3IpO1xuXHRcdGZvciAoY29uc3QgZyBvZiB2ZW5kb3JHcm91cHMpIHtcblx0XHRcdGNvbnN0IG5hbWUgPSBnLmdyb3VwPy5uYW1lID8/IGZhbGxiYWNrTmFtZTtcblx0XHRcdGlmIChuYW1lID09PSBncm91cE5hbWUpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBpZCBvZiBnLm1vZGVsSWRlbnRpZmllcnMpIHtcblx0XHRcdFx0XHQvLyBFeGNsdWRlIGFnZW50LWhvc3QgQllPSyBjb3BpZXMuIFRoZXkgYXJlIG5vdCBzaG93biBhcyByb3dzIGluIHRoaXNcblx0XHRcdFx0XHQvLyBncm91cCAodGhleSBzdXJmYWNlIHVuZGVyIHRoZWlyIHJlYWwgcHJvdmlkZXIpLCBzbyBncm91cC1sZXZlbFxuXHRcdFx0XHRcdC8vIHZpc2liaWxpdHkgdG9nZ2xlcyAoYGlzR3JvdXBIaWRkZW5gIC8gYHNldEdyb3VwSGlkZGVuYCkgbXVzdCBub3Rcblx0XHRcdFx0XHQvLyB0b3VjaCB0aGVtIFx1MjAxNCBvdGhlcndpc2UgaGlkaW5nIHRoZSBhZ2VudC1ob3N0IGdyb3VwIHdvdWxkIGZsaXAgdGhlXG5cdFx0XHRcdFx0Ly8gaGlkZGVuIHN0YXRlIG9mIHRoZXNlIGNvcGllcyBpbiB0aGUgdW5kZXJseWluZyBtb2RlbCBzZXQgZXZlbiB0aG91Z2hcblx0XHRcdFx0XHQvLyB0aGUgVUkgbmV2ZXIgbGlzdHMgdGhlbSBoZXJlLiBUaGVpciB2aXNpYmlsaXR5IGlzIG93bmVkIGJ5IHRoZSByZWFsXG5cdFx0XHRcdFx0Ly8gcHJvdmlkZXIgcm93IGFuZCBob25vdXJlZCBpbiB0aGUgcGlja2VyIHZpYSB0aGUgcmVjb25zdHJ1Y3RlZCBpZC5cblx0XHRcdFx0XHRjb25zdCBtZXRhZGF0YSA9IHRoaXMuX21vZGVsQ2FjaGUuZ2V0KGlkKTtcblx0XHRcdFx0XHRpZiAobWV0YWRhdGEgJiYgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEuZ2V0QWdlbnRIb3N0Qnlva01hbmFnZU1vZGVsc0lkZW50aWZpZXIobWV0YWRhdGEpICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXN1bHQucHVzaChpZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX3JlYWRWaXNpYmlsaXR5KCk6IHZvaWQge1xuXHRcdGNvbnN0IHJhdyA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldE9iamVjdDx7IGhpZGRlbk1vZGVscz86IHN0cmluZ1tdIH0+KENIQVRfTU9ERUxfVklTSUJJTElUWV9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIHt9KTtcblx0XHR0aGlzLl9oaWRkZW5Nb2RlbElkcyA9IG5ldyBTZXQoQXJyYXkuaXNBcnJheShyYXc/LmhpZGRlbk1vZGVscykgPyByYXcuaGlkZGVuTW9kZWxzIDogW10pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2F2ZVZpc2liaWxpdHkoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoXG5cdFx0XHRDSEFUX01PREVMX1ZJU0lCSUxJVFlfU1RPUkFHRV9LRVksXG5cdFx0XHR7IGhpZGRlbk1vZGVsczogQXJyYXkuZnJvbSh0aGlzLl9oaWRkZW5Nb2RlbElkcykgfSxcblx0XHRcdFN0b3JhZ2VTY29wZS5QUk9GSUxFLFxuXHRcdFx0U3RvcmFnZVRhcmdldC5VU0VSLFxuXHRcdCk7XG5cdH1cblxuXHRpc0dyb3VwSGlkZGVuKHZlbmRvcjogc3RyaW5nLCBncm91cE5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG1vZGVsSWRzID0gdGhpcy5fZ2V0TW9kZWxJZHNJbkdyb3VwKHZlbmRvciwgZ3JvdXBOYW1lKTtcblx0XHRyZXR1cm4gbW9kZWxJZHMubGVuZ3RoID4gMCAmJiBtb2RlbElkcy5ldmVyeShpZCA9PiB0aGlzLl9oaWRkZW5Nb2RlbElkcy5oYXMoaWQpKTtcblx0fVxuXG5cdGlzTW9kZWxIaWRkZW4obW9kZWxJZGVudGlmaWVyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faGlkZGVuTW9kZWxJZHMuaGFzKG1vZGVsSWRlbnRpZmllcik7XG5cdH1cblxuXHRzZXRHcm91cEhpZGRlbih2ZW5kb3I6IHN0cmluZywgZ3JvdXBOYW1lOiBzdHJpbmcsIGhpZGRlbjogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuc2V0TW9kZWxzSGlkZGVuKHRoaXMuX2dldE1vZGVsSWRzSW5Hcm91cCh2ZW5kb3IsIGdyb3VwTmFtZSksIGhpZGRlbik7XG5cdH1cblxuXHRzZXRNb2RlbEhpZGRlbihtb2RlbElkZW50aWZpZXI6IHN0cmluZywgaGlkZGVuOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5zZXRNb2RlbHNIaWRkZW4oW21vZGVsSWRlbnRpZmllcl0sIGhpZGRlbik7XG5cdH1cblxuXHRzZXRNb2RlbHNIaWRkZW4obW9kZWxJZGVudGlmaWVyczogcmVhZG9ubHkgc3RyaW5nW10sIGhpZGRlbjogYm9vbGVhbik6IHZvaWQge1xuXHRcdGxldCBjaGFuZ2VkID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCBpZCBvZiBtb2RlbElkZW50aWZpZXJzKSB7XG5cdFx0XHRpZiAoaGlkZGVuKSB7XG5cdFx0XHRcdGlmICghdGhpcy5faGlkZGVuTW9kZWxJZHMuaGFzKGlkKSkge1xuXHRcdFx0XHRcdHRoaXMuX2hpZGRlbk1vZGVsSWRzLmFkZChpZCk7XG5cdFx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAodGhpcy5faGlkZGVuTW9kZWxJZHMuZGVsZXRlKGlkKSkge1xuXHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGNoYW5nZWQpIHtcblx0XHRcdHRoaXMuX3NhdmVWaXNpYmlsaXR5KCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZU1vZGVsVmlzaWJpbGl0eS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0SGlkZGVuTW9kZWxJZHMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMuX2hpZGRlbk1vZGVsSWRzKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBNb2RlbHMgY29udHJvbCBtYW5pZmVzdFxuXG5cdGdldE1vZGVsc0NvbnRyb2xNYW5pZmVzdCgpOiBJTW9kZWxzQ29udHJvbE1hbmlmZXN0IHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxzQ29udHJvbE1hbmlmZXN0O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0TW9kZWxzQ29udHJvbE1hbmlmZXN0KHJlc3BvbnNlOiBJQ2hhdENvbnRyb2xSZXNwb25zZVsnbW9kZWxzJ10pOiB2b2lkIHtcblx0XHR0aGlzLl9tb2RlbHNDb250cm9sUmF3UmVzcG9uc2UgPSByZXNwb25zZTtcblx0XHR0aGlzLl9yZWZyZXNoTW9kZWxzQ29udHJvbE1hbmlmZXN0KCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWZyZXNoTW9kZWxzQ29udHJvbE1hbmlmZXN0KCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gdGhpcy5fbW9kZWxzQ29udHJvbFJhd1Jlc3BvbnNlO1xuXHRcdGNvbnN0IGZyZWU6IElTdHJpbmdEaWN0aW9uYXJ5PElNb2RlbENvbnRyb2xFbnRyeT4gPSB7fTtcblx0XHRjb25zdCBwYWlkOiBJU3RyaW5nRGljdGlvbmFyeTxJTW9kZWxDb250cm9sRW50cnk+ID0ge307XG5cblx0XHRpZiAocmVzcG9uc2U/LmZyZWUpIHtcblx0XHRcdGNvbnN0IGZyZWVFbnRyaWVzID0gQXJyYXkuaXNBcnJheShyZXNwb25zZS5mcmVlKSA/IHJlc3BvbnNlLmZyZWUgOiBPYmplY3QudmFsdWVzKHJlc3BvbnNlLmZyZWUpO1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBmcmVlRW50cmllcykge1xuXHRcdFx0XHRpZiAoIWVudHJ5IHx8ICFpc09iamVjdChlbnRyeSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmcmVlW2VudHJ5LmlkXSA9IHsgbGFiZWw6IGVudHJ5LmxhYmVsLCBmZWF0dXJlZDogZW50cnkuZmVhdHVyZWQsIGV4aXN0czogdGhpcy5fbW9kZWxDYWNoZS5oYXMoYGNvcGlsb3QvJHtlbnRyeS5pZH1gKSB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChyZXNwb25zZT8ucGFpZCkge1xuXHRcdFx0Y29uc3QgcGFpZEVudHJpZXMgPSBBcnJheS5pc0FycmF5KHJlc3BvbnNlLnBhaWQpID8gcmVzcG9uc2UucGFpZCA6IE9iamVjdC52YWx1ZXMocmVzcG9uc2UucGFpZCk7XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHBhaWRFbnRyaWVzKSB7XG5cdFx0XHRcdGlmICghZW50cnkgfHwgIWlzT2JqZWN0KGVudHJ5KSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHBhaWRbZW50cnkuaWRdID0geyBsYWJlbDogZW50cnkubGFiZWwsIGZlYXR1cmVkOiBlbnRyeS5mZWF0dXJlZCwgbWluVlNDb2RlVmVyc2lvbjogZW50cnkubWluVlNDb2RlVmVyc2lvbiwgZXhpc3RzOiB0aGlzLl9tb2RlbENhY2hlLmhhcyhgY29waWxvdC8ke2VudHJ5LmlkfWApIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fbW9kZWxzQ29udHJvbE1hbmlmZXN0ID0geyBmcmVlLCBwYWlkIH07XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbHNDb250cm9sTWFuaWZlc3QuZmlyZSh0aGlzLl9tb2RlbHNDb250cm9sTWFuaWZlc3QpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIENoYXQgY29udHJvbCBkYXRhXG5cdHByaXZhdGUgX2luaXRDaGF0Q29udHJvbERhdGEoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2hhdENvbnRyb2xVcmwgPSB0aGlzLl9wcm9kdWN0U2VydmljZS5jaGF0UGFydGljaXBhbnRSZWdpc3RyeTtcblx0XHRpZiAoIXRoaXMuX2NoYXRDb250cm9sVXJsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVzdG9yZSBwYXJ0aWNpcGFudCByZWdpc3RyeSBmcm9tIHN0b3JhZ2Vcblx0XHRjb25zdCByYXcgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoQ0hBVF9QQVJUSUNJUEFOVF9OQU1FX1JFR0lTVFJZX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9yZXN0cmljdGVkQ2hhdFBhcnRpY2lwYW50cy5zZXQoSlNPTi5wYXJzZShyYXcgPz8gJ3t9JyksIHVuZGVmaW5lZCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5yZW1vdmUoQ0hBVF9QQVJUSUNJUEFOVF9OQU1FX1JFR0lTVFJZX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdH1cblxuXHRcdC8vIFJlc3RvcmUgbW9kZWxzIGNvbnRyb2wgbWFuaWZlc3QgZnJvbSBzdG9yYWdlXG5cdFx0Y29uc3QgcmF3TW9kZWxzID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KENIQVRfTU9ERUxTX0NPTlRST0xfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG1vZGVscyA9IEpTT04ucGFyc2UocmF3TW9kZWxzID8/ICd7fScpO1xuXHRcdFx0aWYgKGlzT2JqZWN0KG1vZGVscykpIHtcblx0XHRcdFx0dGhpcy5fc2V0TW9kZWxzQ29udHJvbE1hbmlmZXN0KG1vZGVscyk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5yZW1vdmUoQ0hBVF9NT0RFTFNfQ09OVFJPTF9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWZyZXNoQ2hhdENvbnRyb2xEYXRhKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWZyZXNoQ2hhdENvbnRyb2xEYXRhKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jaGF0Q29udHJvbERpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZmV0Y2hDaGF0Q29udHJvbERhdGEoKVxuXHRcdFx0LmNhdGNoKGVyciA9PiB0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ0ZhaWxlZCB0byBmZXRjaCBjaGF0IGNvbnRyb2wgZGF0YScsIGVycikpXG5cdFx0XHQudGhlbigoKSA9PiB0aW1lb3V0KDUgKiA2MCAqIDEwMDApKSAvLyBldmVyeSA1IG1pbnV0ZXNcblx0XHRcdC50aGVuKCgpID0+IHRoaXMuX3JlZnJlc2hDaGF0Q29udHJvbERhdGEoKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9mZXRjaENoYXRDb250cm9sRGF0YSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdbTE1dIEZldGNoaW5nIGNoYXQgY29udHJvbCBkYXRhIGZyb20nLCB0aGlzLl9jaGF0Q29udHJvbFVybCk7XG5cblx0XHRsZXQgY29udGV4dDtcblx0XHR0cnkge1xuXHRcdFx0Y29udGV4dCA9IGF3YWl0IHRoaXMuX3JlcXVlc3RTZXJ2aWNlLnJlcXVlc3QoeyB0eXBlOiAnR0VUJywgdXJsOiB0aGlzLl9jaGF0Q29udHJvbFVybCEsIGNhbGxTaXRlOiAnbGFuZ3VhZ2VNb2RlbHMuZmV0Y2hDaGF0Q29udHJvbERhdGEnIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbTE1dIEZhaWxlZCB0byByZXF1ZXN0IGNoYXQgY29udHJvbCBkYXRhJywgZ2V0RXJyb3JNZXNzYWdlKGVycikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChjb250ZXh0LnJlcy5zdGF0dXNDb2RlICE9PSAyMDApIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0xNXSBDaGF0IGNvbnRyb2wgZGF0YSByZXF1ZXN0IGZhaWxlZCB3aXRoIHN0YXR1cyAke2NvbnRleHQucmVzLnN0YXR1c0NvZGV9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHJlc3VsdDogSUNoYXRDb250cm9sUmVzcG9uc2UgfCBudWxsO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXN1bHQgPSBhd2FpdCBhc0pzb248SUNoYXRDb250cm9sUmVzcG9uc2U+KGNvbnRleHQpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbTE1dIEZhaWxlZCB0byBwYXJzZSBjaGF0IGNvbnRyb2wgcmVzcG9uc2UnLCBnZXRFcnJvck1lc3NhZ2UoZXJyKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnW0xNXSBSZWNlaXZlZCBjaGF0IGNvbnRyb2wgcmVzcG9uc2UnLCByZXN1bHQgPyBPYmplY3Qua2V5cyhyZXN1bHQpIDogJ251bGwnKTtcblxuXHRcdGlmICghcmVzdWx0IHx8IHJlc3VsdC52ZXJzaW9uICE9PSAxKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1tMTV0gVW5leHBlY3RlZCBjaGF0IGNvbnRyb2wgcmVzcG9uc2UgdmVyc2lvbicsIHJlc3VsdD8udmVyc2lvbik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHJlc3RyaWN0ZWQgY2hhdCBwYXJ0aWNpcGFudHNcblx0XHRjb25zdCByZWdpc3RyeSA9IHJlc3VsdC5yZXN0cmljdGVkQ2hhdFBhcnRpY2lwYW50cztcblx0XHR0aGlzLl9yZXN0cmljdGVkQ2hhdFBhcnRpY2lwYW50cy5zZXQocmVnaXN0cnksIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ0hBVF9QQVJUSUNJUEFOVF9OQU1FX1JFR0lTVFJZX1NUT1JBR0VfS0VZLCBKU09OLnN0cmluZ2lmeShyZWdpc3RyeSksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdC8vIFVwZGF0ZSBtb2RlbHMgY29udHJvbCBtYW5pZmVzdFxuXHRcdGlmIChyZXN1bHQubW9kZWxzKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdbTE1dIFVwZGF0aW5nIG1vZGVscyBjb250cm9sIG1hbmlmZXN0JywgeyBmcmVlQ291bnQ6IE9iamVjdC5rZXlzKHJlc3VsdC5tb2RlbHMuZnJlZSA/PyB7fSkubGVuZ3RoLCBwYWlkQ291bnQ6IE9iamVjdC5rZXlzKHJlc3VsdC5tb2RlbHMucGFpZCA/PyB7fSkubGVuZ3RoIH0pO1xuXHRcdFx0dGhpcy5fc2V0TW9kZWxzQ29udHJvbE1hbmlmZXN0KHJlc3VsdC5tb2RlbHMpO1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ0hBVF9NT0RFTFNfQ09OVFJPTF9TVE9SQUdFX0tFWSwgSlNPTi5zdHJpbmdpZnkocmVzdWx0Lm1vZGVscyksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuX2NoYXRDb250cm9sRGlzcG9zZWQgPSB0cnVlO1xuXHRcdHRoaXMuX3N0b3JlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9wcm92aWRlcnMuY2xlYXIoKTtc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TztBQUN4QixTQUFLLDRCQUE0QixJQUFJLFVBQVUsTUFBUztBQUN4RCxTQUFLLGdCQUFnQixNQUFNLDRDQUE0QyxLQUFLLFVBQVUsUUFBUSxHQUFHLGFBQWEsYUFBYSxjQUFjLE9BQU87QUFHaEosUUFBSSxPQUFPLFFBQVE7QUFDbEIsV0FBSyxZQUFZLE1BQU0seUNBQXlDLEVBQUUsV0FBVyxPQUFPLEtBQUssT0FBTyxPQUFPLFFBQVEsQ0FBQyxDQUFDLEVBQUUsUUFBUSxXQUFXLE9BQU8sS0FBSyxPQUFPLE9BQU8sUUFBUSxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUM7QUFDcEwsV0FBSywwQkFBMEIsT0FBTyxNQUFNO0FBQzVDLFdBQUssZ0JBQWdCLE1BQU0saUNBQWlDLEtBQUssVUFBVSxPQUFPLE1BQU0sR0FBRyxhQUFhLGFBQWEsY0FBYyxPQUFPO0FBQUEsSUFDM0k7QUFBQSxFQUNEO0FBQUE7QUFBQSxFQUlBLFVBQVU7QUFDVCxTQUFLLHVCQUF1QjtBQUM1QixTQUFLLE9BQU8sUUFBUTtBQUNwQixTQUFLLFdBQVcsTUFBTTtBQUFBLEVBQ3ZCO0FBRUQ7QUF6bERhLHNCQUVHLG9CQUFvQjtBQUZ2QixzQkFHRyxlQUFlO0FBSGxCLHdCQUFOO0FBQUEsRUFvREo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBL0RVOyIsCiAgIm5hbWVzIjogWyJDaGF0TWVzc2FnZVJvbGUiLCAiTGFuZ3VhZ2VNb2RlbFBhcnRBdWRpZW5jZSIsICJDaGF0SW1hZ2VNaW1lVHlwZSIsICJJbWFnZURldGFpbExldmVsIiwgIklMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIiwgInZlbmRvciIsICJncm91cCIsICJ2YWx1ZSJdCn0K
