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
import { distinct } from "../../../../../base/common/arrays.js";
import { or, matchesCamelCase, matchesWords, matchesBaseContiguousSubString } from "../../../../../base/common/filters.js";
import { Emitter } from "../../../../../base/common/event.js";
import { getLanguageModelProviderDisplayName, ILanguageModelChatMetadata, ILanguageModelsService } from "../../../chat/common/languageModels.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { languageModelSourcePresentationRegistry } from "../../common/languageModelSourcePresentation.js";
const MODEL_ENTRY_TEMPLATE_ID = "model.entry.template";
const VENDOR_ENTRY_TEMPLATE_ID = "vendor.entry.template";
const GROUP_ENTRY_TEMPLATE_ID = "group.entry.template";
const wordFilter = or(matchesBaseContiguousSubString, matchesWords);
const CAPABILITY_REGEX = /@capability:\s*([^\s]+)/gi;
const PROVIDER_REGEX = /@provider:\s*((".+?")|([^\s]+))/gi;
const SEARCH_SUGGESTIONS = {
  FILTER_TYPES: [
    "@provider:",
    "@capability:"
  ],
  CAPABILITIES: [
    "@capability:tools",
    "@capability:vision",
    "@capability:agent"
  ]
};
function getManageModelsProviderLabel(model) {
  return model.provider.group.name;
}
function isLanguageModelProviderEntry(entry) {
  return entry.type === "vendor";
}
function isLanguageModelGroupEntry(entry) {
  return entry.type === "group";
}
function isStatusEntry(entry) {
  return entry.type === "status";
}
var ChatModelGroup = /* @__PURE__ */ ((ChatModelGroup2) => {
  ChatModelGroup2["Vendor"] = "vendor";
  return ChatModelGroup2;
})(ChatModelGroup || {});
let ChatModelsViewModel = class extends Disposable {
  constructor(languageModelsService) {
    super();
    this.languageModelsService = languageModelsService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._onDidChangeGrouping = this._register(new Emitter());
    this.onDidChangeGrouping = this._onDidChangeGrouping.event;
    this.languageModelGroupStatuses = [];
    this.languageModelGroups = [];
    this.collapsedGroups = /* @__PURE__ */ new Set();
    this.searchValue = "";
    this.modelsSorted = false;
    this._groupBy = "vendor" /* Vendor */;
    this._viewModelEntries = [];
    this.languageModels = [];
    this._register(this.languageModelsService.onDidChangeLanguageModels((vendor) => this.refreshVendor(vendor)));
    this._register(this.languageModelsService.onDidChangeModelVisibility(() => this.refreshVisibility()));
  }
  get groupBy() {
    return this._groupBy;
  }
  set groupBy(groupBy) {
    if (this._groupBy !== groupBy) {
      this._groupBy = groupBy;
      this.collapsedGroups.clear();
      this.languageModelGroups = this.groupModels(this.languageModels);
      this.doFilter();
      this._onDidChangeGrouping.fire(groupBy);
    }
  }
  get viewModelEntries() {
    return this._viewModelEntries;
  }
  splice(at, removed, added) {
    this._viewModelEntries.splice(at, removed, ...added);
    if (this.selectedEntry) {
      this.selectedEntry = this._viewModelEntries.find((entry) => entry.id === this.selectedEntry?.id);
    }
    this._onDidChange.fire({ at, removed, added });
  }
  shouldRefilter() {
    return !this.modelsSorted;
  }
  filter(searchValue) {
    if (searchValue !== this.searchValue) {
      this.searchValue = searchValue;
      this.collapsedGroups.clear();
      if (!this.modelsSorted) {
        this.languageModelGroups = this.groupModels(this.languageModels);
      }
      this.doFilter();
    }
    return this.viewModelEntries;
  }
  doFilter() {
    const viewModelEntries = [];
    const shouldShowGroupHeaders = this.languageModelGroups.length > 1 || this.languageModelGroups.some((group) => isLanguageModelProviderEntry(group.group) && group.group.sourcePresentation !== void 0);
    for (const group of this.languageModelGroups) {
      if (this.collapsedGroups.has(group.group.id)) {
        group.group.collapsed = true;
        if (shouldShowGroupHeaders) {
          viewModelEntries.push(group.group);
        }
        continue;
      }
      const groupEntries = [];
      if (group.status) {
        groupEntries.push(group.status);
      }
      groupEntries.push(...this.filterModels(group.models, this.searchValue));
      if (groupEntries.length > 0) {
        group.group.collapsed = false;
        if (shouldShowGroupHeaders) {
          viewModelEntries.push(group.group);
        }
        viewModelEntries.push(...groupEntries);
      }
    }
    this.splice(0, this._viewModelEntries.length, viewModelEntries);
  }
  filterModels(modelEntries, searchValue) {
    const providerNames = [];
    let providerMatch;
    PROVIDER_REGEX.lastIndex = 0;
    while ((providerMatch = PROVIDER_REGEX.exec(searchValue)) !== null) {
      const providerName = providerMatch[2] ? providerMatch[2].substring(1, providerMatch[2].length - 1) : providerMatch[3];
      providerNames.push(providerName);
    }
    if (providerNames.length > 0) {
      searchValue = searchValue.replace(PROVIDER_REGEX, "");
    }
    const capabilities = [];
    let capabilityMatch;
    CAPABILITY_REGEX.lastIndex = 0;
    while ((capabilityMatch = CAPABILITY_REGEX.exec(searchValue)) !== null) {
      capabilities.push(capabilityMatch[1].toLowerCase());
    }
    if (capabilities.length > 0) {
      searchValue = searchValue.replace(CAPABILITY_REGEX, "");
    }
    const quoteAtFirstChar = searchValue.charAt(0) === '"';
    const quoteAtLastChar = searchValue.charAt(searchValue.length - 1) === '"';
    const completeMatch = quoteAtFirstChar && quoteAtLastChar;
    if (quoteAtFirstChar) {
      searchValue = searchValue.substring(1);
    }
    if (quoteAtLastChar) {
      searchValue = searchValue.substring(0, searchValue.length - 1);
    }
    searchValue = searchValue.trim();
    const result = [];
    const words = searchValue.split(" ");
    const lowerProviders = providerNames.map((p) => p.toLowerCase().trim());
    for (const modelEntry of modelEntries) {
      if (lowerProviders.length > 0) {
        const matchesProvider = lowerProviders.some(
          (provider) => modelEntry.provider.vendor.vendor.toLowerCase() === provider || modelEntry.provider.vendor.displayName.toLowerCase() === provider || modelEntry.provider.group.vendor.toLowerCase() === provider || modelEntry.provider.group.name.toLowerCase() === provider
        );
        if (!matchesProvider) {
          continue;
        }
      }
      let matchedCapabilities = [];
      if (capabilities.length > 0) {
        if (!modelEntry.metadata.capabilities) {
          continue;
        }
        let matchesAll = true;
        for (const capability of capabilities) {
          const matchedForThisCapability = this.getMatchingCapabilities(modelEntry, capability);
          if (matchedForThisCapability.length === 0) {
            matchesAll = false;
            break;
          }
          matchedCapabilities.push(...matchedForThisCapability);
        }
        if (!matchesAll) {
          continue;
        }
        matchedCapabilities = distinct(matchedCapabilities);
      }
      let modelMatches;
      if (searchValue) {
        modelMatches = new ModelItemMatches(modelEntry, searchValue, words, completeMatch);
        if (!modelMatches.modelNameMatches && !modelMatches.modelIdMatches && !modelMatches.providerMatches && !modelMatches.capabilityMatches) {
          continue;
        }
      }
      const modelId = this.getModelId(modelEntry);
      result.push({
        type: "model",
        id: modelId,
        templateId: MODEL_ENTRY_TEMPLATE_ID,
        model: modelEntry,
        modelNameMatches: modelMatches?.modelNameMatches || void 0,
        modelIdMatches: modelMatches?.modelIdMatches || void 0,
        providerMatches: modelMatches?.providerMatches || void 0,
        capabilityMatches: matchedCapabilities.length ? matchedCapabilities : void 0
      });
    }
    return result;
  }
  getMatchingCapabilities(modelEntry, capability) {
    const matchedCapabilities = [];
    if (!modelEntry.metadata.capabilities) {
      return matchedCapabilities;
    }
    switch (capability) {
      case "tools":
      case "toolcalling":
        if (modelEntry.metadata.capabilities.toolCalling === true) {
          matchedCapabilities.push("toolCalling");
        }
        break;
      case "vision":
        if (modelEntry.metadata.capabilities.vision === true) {
          matchedCapabilities.push("vision");
        }
        break;
      case "agent":
      case "agentmode":
        if (modelEntry.metadata.capabilities.agentMode === true) {
          matchedCapabilities.push("agentMode");
        }
        break;
      default:
        if (modelEntry.metadata.capabilities.editTools) {
          for (const tool of modelEntry.metadata.capabilities.editTools) {
            if (tool.toLowerCase().includes(capability)) {
              matchedCapabilities.push(tool);
            }
          }
        }
        break;
    }
    return matchedCapabilities;
  }
  groupModels(languageModels) {
    const result = [];
    if (this.groupBy === "vendor" /* Vendor */) {
      for (const model of languageModels) {
        const groupId = this.getProviderGroupId(model.provider);
        let group = result.find((group2) => group2.group.id === groupId);
        if (!group) {
          group = {
            group: this.createLanguageModelProviderEntry(model.provider),
            models: []
          };
          result.push(group);
        }
        group.models.push(model);
      }
      for (const statusGroup of this.languageModelGroupStatuses) {
        const groupId = this.getProviderGroupId(statusGroup.provider);
        let group = result.find((group2) => group2.group.id === groupId);
        if (!group) {
          group = {
            group: this.createLanguageModelProviderEntry(statusGroup.provider),
            models: []
          };
          result.push(group);
        }
        group.status = {
          id: `status.${group.group.id}`,
          type: "status",
          ...statusGroup.status
        };
      }
      result.sort((a, b) => {
        if (a.models[0]?.provider.vendor.isDefault) {
          return -1;
        }
        if (b.models[0]?.provider.vendor.isDefault) {
          return 1;
        }
        return a.group.label.localeCompare(b.group.label);
      });
    }
    for (const group of result) {
      if (isLanguageModelProviderEntry(group.group)) {
        group.group.hidden = group.models.length > 0 && group.models.every((model) => model.hidden);
      }
      group.models.sort((a, b) => {
        if (a.provider.vendor.isDefault && b.provider.vendor.isDefault) {
          return a.metadata.name.localeCompare(b.metadata.name);
        }
        if (a.provider.vendor.isDefault) {
          return -1;
        }
        if (b.provider.vendor.isDefault) {
          return 1;
        }
        if (a.provider.group.name === b.provider.group.name) {
          return a.metadata.name.localeCompare(b.metadata.name);
        }
        return a.provider.group.name.localeCompare(b.provider.group.name);
      });
    }
    this.modelsSorted = true;
    return result;
  }
  createLanguageModelProviderEntry(provider) {
    const id = this.getProviderGroupId(provider);
    return {
      type: "vendor",
      id,
      label: provider.group.name,
      templateId: VENDOR_ENTRY_TEMPLATE_ID,
      collapsed: this.collapsedGroups.has(id),
      hidden: false,
      sourcePresentation: provider.sourcePresentation,
      vendorEntry: provider
    };
  }
  getVendors() {
    return [...this.languageModelsService.getVendors()].sort((a, b) => {
      if (a.isDefault) {
        return -1;
      }
      if (b.isDefault) {
        return 1;
      }
      return a.displayName.localeCompare(b.displayName);
    });
  }
  async refresh() {
    await this.languageModelsService.selectLanguageModels({});
    await this.refreshAllVendors();
  }
  async refreshAllVendors() {
    this.languageModels = [];
    this.languageModelGroupStatuses = [];
    for (const vendor of this.getVendors()) {
      this.addVendorModels(vendor);
    }
    this.languageModelGroups = this.groupModels(this.languageModels);
    this.doFilter();
  }
  refreshVendor(vendorId) {
    const vendor = this.getVendors().find((v) => v.vendor === vendorId);
    if (!vendor) {
      return;
    }
    this.languageModels = this.languageModels.filter((m) => m.provider.vendor.vendor !== vendorId);
    this.languageModelGroupStatuses = this.languageModelGroupStatuses.filter((s) => s.provider.vendor.vendor !== vendorId);
    this.addVendorModels(vendor);
    this.languageModelGroups = this.groupModels(this.languageModels);
    this.doFilter();
  }
  addVendorModels(vendor) {
    const models = [];
    const languageModelsGroups = this.languageModelsService.getLanguageModelGroups(vendor.vendor);
    for (const group of languageModelsGroups) {
      const defaultProvider = {
        group: group.group ?? {
          vendor: vendor.vendor,
          name: vendor.displayName
        },
        vendor
      };
      if (group.status) {
        this.languageModelGroupStatuses.push({
          provider: defaultProvider,
          status: {
            message: group.status.message,
            severity: group.status.severity
          }
        });
      }
      for (const identifier of group.modelIdentifiers) {
        const metadata = this.languageModelsService.lookupLanguageModel(identifier);
        if (!metadata) {
          continue;
        }
        if (vendor.isDefault && metadata.id === "auto") {
          continue;
        }
        if (ILanguageModelChatMetadata.getAgentHostByokManageModelsIdentifier(metadata) !== void 0) {
          continue;
        }
        const sourcePresentation = metadata.modelGroup?.sourceId ? languageModelSourcePresentationRegistry.get(metadata.vendor, metadata.modelGroup.sourceId) : void 0;
        const provider = metadata.modelGroup ? {
          vendor,
          group: {
            vendor: metadata.modelGroup.id,
            name: sourcePresentation?.label ?? getLanguageModelProviderDisplayName(this.languageModelsService, metadata.modelGroup.id)
          },
          sourceId: metadata.modelGroup.sourceId,
          sourcePresentation
        } : defaultProvider;
        models.push({
          identifier,
          metadata,
          provider,
          hidden: this.languageModelsService.isModelHidden(identifier)
        });
      }
    }
    this.languageModels.push(...models.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)));
  }
  getModelsForGroup(group) {
    if (isLanguageModelProviderEntry(group)) {
      return this.languageModels.filter(
        (m) => this.getProviderGroupId(m.provider) === group.id
      );
    }
    return this.languageModels;
  }
  toggleModelHidden(entry) {
    this.languageModelsService.setModelHidden(entry.model.identifier, !entry.model.hidden);
  }
  toggleGroupHidden(entry) {
    this.languageModelsService.setModelsHidden(this.getModelsForGroup(entry).map((model) => model.identifier), !entry.hidden);
  }
  setModelsHidden(entries, hidden) {
    this.languageModelsService.setModelsHidden(entries.map((entry) => entry.model.identifier), hidden);
  }
  refreshVisibility() {
    for (const model of this.languageModels) {
      model.hidden = this.languageModelsService.isModelHidden(model.identifier);
    }
    this.languageModelGroups = this.groupModels(this.languageModels);
    this.doFilter();
  }
  getModelId(modelEntry) {
    return `${modelEntry.provider.group.name}.${modelEntry.identifier}.${modelEntry.metadata.version}`;
  }
  getProviderGroupId(provider) {
    return `${provider.group.vendor}-${provider.group.name}-${provider.sourceId ?? "configured"}`;
  }
  toggleCollapsed(viewModelEntry) {
    const id = isLanguageModelGroupEntry(viewModelEntry) ? viewModelEntry.id : isLanguageModelProviderEntry(viewModelEntry) ? viewModelEntry.id : void 0;
    if (!id) {
      return;
    }
    this.selectedEntry = viewModelEntry;
    if (!this.collapsedGroups.delete(id)) {
      this.collapsedGroups.add(id);
    }
    this.doFilter();
  }
  collapseAll() {
    this.collapsedGroups.clear();
    for (const entry of this.viewModelEntries) {
      if (isLanguageModelProviderEntry(entry) || isLanguageModelGroupEntry(entry)) {
        this.collapsedGroups.add(entry.id);
      }
    }
    this.doFilter();
  }
  getConfiguredVendors() {
    const result = [];
    const seenVendors = /* @__PURE__ */ new Set();
    for (const modelEntry of this.languageModels) {
      if (!seenVendors.has(modelEntry.provider.group.name)) {
        seenVendors.add(modelEntry.provider.group.name);
        result.push(modelEntry.provider);
      }
    }
    return result;
  }
};
ChatModelsViewModel = __decorateClass([
  __decorateParam(0, ILanguageModelsService)
], ChatModelsViewModel);
class ModelItemMatches {
  constructor(modelEntry, searchValue, words, completeMatch) {
    this.modelNameMatches = null;
    this.modelIdMatches = null;
    this.providerMatches = null;
    this.capabilityMatches = null;
    if (!completeMatch) {
      this.modelNameMatches = modelEntry.metadata.name ? this.matches(searchValue, modelEntry.metadata.name, (word, wordToMatchAgainst) => matchesWords(word, wordToMatchAgainst, true), words) : null;
      this.modelIdMatches = this.matches(searchValue, modelEntry.metadata.id, or(matchesWords, matchesCamelCase), words);
      this.providerMatches = this.matches(searchValue, modelEntry.provider.group.name, (word, wordToMatchAgainst) => matchesWords(word, wordToMatchAgainst, true), words);
      if (modelEntry.metadata.capabilities) {
        const capabilityStrings = [];
        if (modelEntry.metadata.capabilities.toolCalling) {
          capabilityStrings.push("tools", "toolCalling");
        }
        if (modelEntry.metadata.capabilities.vision) {
          capabilityStrings.push("vision");
        }
        if (modelEntry.metadata.capabilities.agentMode) {
          capabilityStrings.push("agent", "agentMode");
        }
        if (modelEntry.metadata.capabilities.editTools) {
          capabilityStrings.push(...modelEntry.metadata.capabilities.editTools);
        }
        const capabilityString = capabilityStrings.join(" ");
        if (capabilityString) {
          this.capabilityMatches = this.matches(searchValue, capabilityString, or(matchesWords, matchesCamelCase), words);
        }
      }
    }
  }
  matches(searchValue, wordToMatchAgainst, wordMatchesFilter, words) {
    let matches = searchValue ? wordFilter(searchValue, wordToMatchAgainst) : null;
    if (!matches) {
      matches = this.matchesWords(words, wordToMatchAgainst, wordMatchesFilter);
    }
    if (matches) {
      matches = this.filterAndSort(matches);
    }
    return matches;
  }
  matchesWords(words, wordToMatchAgainst, wordMatchesFilter) {
    let matches = [];
    for (const word of words) {
      const wordMatches = wordMatchesFilter(word, wordToMatchAgainst);
      if (wordMatches) {
        matches = [...matches || [], ...wordMatches];
      } else {
        matches = null;
        break;
      }
    }
    return matches;
  }
  filterAndSort(matches) {
    return distinct(matches, ((a) => a.start + "." + a.end)).filter((match) => !matches.some((m) => !(m.start === match.start && m.end === match.end) && (m.start <= match.start && m.end >= match.end))).sort((a, b) => a.start - b.start);
  }
}
export {
  ChatModelGroup,
  ChatModelsViewModel,
  GROUP_ENTRY_TEMPLATE_ID,
  MODEL_ENTRY_TEMPLATE_ID,
  SEARCH_SUGGESTIONS,
  VENDOR_ENTRY_TEMPLATE_ID,
  getManageModelsProviderLabel,
  isLanguageModelGroupEntry,
  isLanguageModelProviderEntry,
  isStatusEntry
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRNYW5hZ2VtZW50XFxjaGF0TW9kZWxzVmlld01vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGlzdGluY3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgSU1hdGNoLCBJRmlsdGVyLCBvciwgbWF0Y2hlc0NhbWVsQ2FzZSwgbWF0Y2hlc1dvcmRzLCBtYXRjaGVzQmFzZUNvbnRpZ3VvdXNTdWJTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBnZXRMYW5ndWFnZU1vZGVsUHJvdmlkZXJEaXNwbGF5TmFtZSwgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIElMYW5ndWFnZU1vZGVsUHJvdmlkZXJEZXNjcmlwdG9yLCBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAgfSBmcm9tICcuLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFNvdXJjZVByZXNlbnRhdGlvbiwgbGFuZ3VhZ2VNb2RlbFNvdXJjZVByZXNlbnRhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxTb3VyY2VQcmVzZW50YXRpb24uanMnO1xuXG5leHBvcnQgY29uc3QgTU9ERUxfRU5UUllfVEVNUExBVEVfSUQgPSAnbW9kZWwuZW50cnkudGVtcGxhdGUnO1xuZXhwb3J0IGNvbnN0IFZFTkRPUl9FTlRSWV9URU1QTEFURV9JRCA9ICd2ZW5kb3IuZW50cnkudGVtcGxhdGUnO1xuZXhwb3J0IGNvbnN0IEdST1VQX0VOVFJZX1RFTVBMQVRFX0lEID0gJ2dyb3VwLmVudHJ5LnRlbXBsYXRlJztcblxuY29uc3Qgd29yZEZpbHRlciA9IG9yKG1hdGNoZXNCYXNlQ29udGlndW91c1N1YlN0cmluZywgbWF0Y2hlc1dvcmRzKTtcbmNvbnN0IENBUEFCSUxJVFlfUkVHRVggPSAvQGNhcGFiaWxpdHk6XFxzKihbXlxcc10rKS9naTtcbmNvbnN0IFBST1ZJREVSX1JFR0VYID0gL0Bwcm92aWRlcjpcXHMqKChcIi4rP1wiKXwoW15cXHNdKykpL2dpO1xuXG5leHBvcnQgY29uc3QgU0VBUkNIX1NVR0dFU1RJT05TID0ge1xuXHRGSUxURVJfVFlQRVM6IFtcblx0XHQnQHByb3ZpZGVyOicsXG5cdFx0J0BjYXBhYmlsaXR5OicsXG5cdF0sXG5cdENBUEFCSUxJVElFUzogW1xuXHRcdCdAY2FwYWJpbGl0eTp0b29scycsXG5cdFx0J0BjYXBhYmlsaXR5OnZpc2lvbicsXG5cdFx0J0BjYXBhYmlsaXR5OmFnZW50J1xuXHRdLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyIHtcblx0dmVuZG9yOiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGVzY3JpcHRvcjtcblx0Z3JvdXA6IElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXA7XG5cdHNvdXJjZUlkPzogc3RyaW5nO1xuXHRzb3VyY2VQcmVzZW50YXRpb24/OiBJTGFuZ3VhZ2VNb2RlbFNvdXJjZVByZXNlbnRhdGlvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGFuZ3VhZ2VNb2RlbCBleHRlbmRzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB7XG5cdHByb3ZpZGVyOiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyO1xuXHRoaWRkZW46IGJvb2xlYW47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRNYW5hZ2VNb2RlbHNQcm92aWRlckxhYmVsKG1vZGVsOiBJTGFuZ3VhZ2VNb2RlbCk6IHN0cmluZyB7XG5cdHJldHVybiBtb2RlbC5wcm92aWRlci5ncm91cC5uYW1lO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMYW5ndWFnZU1vZGVsRW50cnkge1xuXHR0eXBlOiAnbW9kZWwnO1xuXHRpZDogc3RyaW5nO1xuXHR0ZW1wbGF0ZUlkOiBzdHJpbmc7XG5cdG1vZGVsOiBJTGFuZ3VhZ2VNb2RlbDtcblx0cHJvdmlkZXJNYXRjaGVzPzogSU1hdGNoW107XG5cdG1vZGVsTmFtZU1hdGNoZXM/OiBJTWF0Y2hbXTtcblx0bW9kZWxJZE1hdGNoZXM/OiBJTWF0Y2hbXTtcblx0Y2FwYWJpbGl0eU1hdGNoZXM/OiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkge1xuXHR0eXBlOiAnZ3JvdXAnO1xuXHRpZDogc3RyaW5nO1xuXHRsYWJlbDogc3RyaW5nO1xuXHRjb2xsYXBzZWQ6IGJvb2xlYW47XG5cdHRlbXBsYXRlSWQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkge1xuXHR0eXBlOiAndmVuZG9yJztcblx0aWQ6IHN0cmluZztcblx0bGFiZWw6IHN0cmluZztcblx0dGVtcGxhdGVJZDogc3RyaW5nO1xuXHRjb2xsYXBzZWQ6IGJvb2xlYW47XG5cdGhpZGRlbjogYm9vbGVhbjtcblx0c291cmNlUHJlc2VudGF0aW9uPzogSUxhbmd1YWdlTW9kZWxTb3VyY2VQcmVzZW50YXRpb247XG5cdHZlbmRvckVudHJ5OiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdGF0dXNFbnRyeSB7XG5cdHR5cGU6ICdzdGF0dXMnO1xuXHRpZDogc3RyaW5nO1xuXHRtZXNzYWdlOiBzdHJpbmc7XG5cdHNldmVyaXR5OiBTZXZlcml0eTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGFuZ3VhZ2VNb2RlbEVudHJpZXNHcm91cCB7XG5cdGdyb3VwOiBJTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkgfCBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnk7XG5cdG1vZGVsczogSUxhbmd1YWdlTW9kZWxbXTtcblx0c3RhdHVzPzogSVN0YXR1c0VudHJ5O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShlbnRyeTogSVZpZXdNb2RlbEVudHJ5KTogZW50cnkgaXMgSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5IHtcblx0cmV0dXJuIGVudHJ5LnR5cGUgPT09ICd2ZW5kb3InO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShlbnRyeTogSVZpZXdNb2RlbEVudHJ5KTogZW50cnkgaXMgSUxhbmd1YWdlTW9kZWxHcm91cEVudHJ5IHtcblx0cmV0dXJuIGVudHJ5LnR5cGUgPT09ICdncm91cCc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N0YXR1c0VudHJ5KGVudHJ5OiBJVmlld01vZGVsRW50cnkpOiBlbnRyeSBpcyBJU3RhdHVzRW50cnkge1xuXHRyZXR1cm4gZW50cnkudHlwZSA9PT0gJ3N0YXR1cyc7XG59XG5cbmV4cG9ydCB0eXBlIElWaWV3TW9kZWxFbnRyeSA9IElMYW5ndWFnZU1vZGVsRW50cnkgfCBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkgfCBJTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkgfCBJU3RhdHVzRW50cnk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZpZXdNb2RlbENoYW5nZUV2ZW50IHtcblx0YXQ6IG51bWJlcjtcblx0cmVtb3ZlZDogbnVtYmVyO1xuXHRhZGRlZDogSVZpZXdNb2RlbEVudHJ5W107XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIENoYXRNb2RlbEdyb3VwIHtcblx0VmVuZG9yID0gJ3ZlbmRvcicsXG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0TW9kZWxzVmlld01vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVmlld01vZGVsQ2hhbmdlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlR3JvdXBpbmcgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxDaGF0TW9kZWxHcm91cD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlR3JvdXBpbmcgPSB0aGlzLl9vbkRpZENoYW5nZUdyb3VwaW5nLmV2ZW50O1xuXG5cdHByaXZhdGUgbGFuZ3VhZ2VNb2RlbHM6IElMYW5ndWFnZU1vZGVsW107XG5cdHByaXZhdGUgbGFuZ3VhZ2VNb2RlbEdyb3VwU3RhdHVzZXM6IEFycmF5PHsgcHJvdmlkZXI6IElMYW5ndWFnZU1vZGVsUHJvdmlkZXI7IHN0YXR1czogeyBzZXZlcml0eTogU2V2ZXJpdHk7IG1lc3NhZ2U6IHN0cmluZyB9IH0+ID0gW107XG5cdHByaXZhdGUgbGFuZ3VhZ2VNb2RlbEdyb3VwczogSUxhbmd1YWdlTW9kZWxFbnRyaWVzR3JvdXBbXSA9IFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29sbGFwc2VkR3JvdXBzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgc2VhcmNoVmFsdWU6IHN0cmluZyA9ICcnO1xuXHRwcml2YXRlIG1vZGVsc1NvcnRlZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgX2dyb3VwQnk6IENoYXRNb2RlbEdyb3VwID0gQ2hhdE1vZGVsR3JvdXAuVmVuZG9yO1xuXHRnZXQgZ3JvdXBCeSgpOiBDaGF0TW9kZWxHcm91cCB7IHJldHVybiB0aGlzLl9ncm91cEJ5OyB9XG5cdHNldCBncm91cEJ5KGdyb3VwQnk6IENoYXRNb2RlbEdyb3VwKSB7XG5cdFx0aWYgKHRoaXMuX2dyb3VwQnkgIT09IGdyb3VwQnkpIHtcblx0XHRcdHRoaXMuX2dyb3VwQnkgPSBncm91cEJ5O1xuXHRcdFx0dGhpcy5jb2xsYXBzZWRHcm91cHMuY2xlYXIoKTtcblx0XHRcdHRoaXMubGFuZ3VhZ2VNb2RlbEdyb3VwcyA9IHRoaXMuZ3JvdXBNb2RlbHModGhpcy5sYW5ndWFnZU1vZGVscyk7XG5cdFx0XHR0aGlzLmRvRmlsdGVyKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUdyb3VwaW5nLmZpcmUoZ3JvdXBCeSk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5sYW5ndWFnZU1vZGVscyA9IFtdO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHModmVuZG9yID0+IHRoaXMucmVmcmVzaFZlbmRvcih2ZW5kb3IpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2Uub25EaWRDaGFuZ2VNb2RlbFZpc2liaWxpdHkoKCkgPT4gdGhpcy5yZWZyZXNoVmlzaWJpbGl0eSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF92aWV3TW9kZWxFbnRyaWVzOiBJVmlld01vZGVsRW50cnlbXSA9IFtdO1xuXHRnZXQgdmlld01vZGVsRW50cmllcygpOiByZWFkb25seSBJVmlld01vZGVsRW50cnlbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZpZXdNb2RlbEVudHJpZXM7XG5cdH1cblx0cHJpdmF0ZSBzcGxpY2UoYXQ6IG51bWJlciwgcmVtb3ZlZDogbnVtYmVyLCBhZGRlZDogSVZpZXdNb2RlbEVudHJ5W10pOiB2b2lkIHtcblx0XHR0aGlzLl92aWV3TW9kZWxFbnRyaWVzLnNwbGljZShhdCwgcmVtb3ZlZCwgLi4uYWRkZWQpO1xuXHRcdGlmICh0aGlzLnNlbGVjdGVkRW50cnkpIHtcblx0XHRcdHRoaXMuc2VsZWN0ZWRFbnRyeSA9IHRoaXMuX3ZpZXdNb2RlbEVudHJpZXMuZmluZChlbnRyeSA9PiBlbnRyeS5pZCA9PT0gdGhpcy5zZWxlY3RlZEVudHJ5Py5pZCk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBhdCwgcmVtb3ZlZCwgYWRkZWQgfSk7XG5cdH1cblxuXHRzZWxlY3RlZEVudHJ5OiBJVmlld01vZGVsRW50cnkgfCB1bmRlZmluZWQ7XG5cblx0cHVibGljIHNob3VsZFJlZmlsdGVyKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5tb2RlbHNTb3J0ZWQ7XG5cdH1cblxuXHRmaWx0ZXIoc2VhcmNoVmFsdWU6IHN0cmluZyk6IHJlYWRvbmx5IElWaWV3TW9kZWxFbnRyeVtdIHtcblx0XHRpZiAoc2VhcmNoVmFsdWUgIT09IHRoaXMuc2VhcmNoVmFsdWUpIHtcblx0XHRcdHRoaXMuc2VhcmNoVmFsdWUgPSBzZWFyY2hWYWx1ZTtcblx0XHRcdHRoaXMuY29sbGFwc2VkR3JvdXBzLmNsZWFyKCk7XG5cdFx0XHRpZiAoIXRoaXMubW9kZWxzU29ydGVkKSB7XG5cdFx0XHRcdHRoaXMubGFuZ3VhZ2VNb2RlbEdyb3VwcyA9IHRoaXMuZ3JvdXBNb2RlbHModGhpcy5sYW5ndWFnZU1vZGVscyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmRvRmlsdGVyKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnZpZXdNb2RlbEVudHJpZXM7XG5cdH1cblxuXHRwcml2YXRlIGRvRmlsdGVyKCk6IHZvaWQge1xuXHRcdGNvbnN0IHZpZXdNb2RlbEVudHJpZXM6IElWaWV3TW9kZWxFbnRyeVtdID0gW107XG5cdFx0Y29uc3Qgc2hvdWxkU2hvd0dyb3VwSGVhZGVycyA9IHRoaXMubGFuZ3VhZ2VNb2RlbEdyb3Vwcy5sZW5ndGggPiAxXG5cdFx0XHR8fCB0aGlzLmxhbmd1YWdlTW9kZWxHcm91cHMuc29tZShncm91cCA9PiBpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KGdyb3VwLmdyb3VwKSAmJiBncm91cC5ncm91cC5zb3VyY2VQcmVzZW50YXRpb24gIT09IHVuZGVmaW5lZCk7XG5cblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMubGFuZ3VhZ2VNb2RlbEdyb3Vwcykge1xuXHRcdFx0aWYgKHRoaXMuY29sbGFwc2VkR3JvdXBzLmhhcyhncm91cC5ncm91cC5pZCkpIHtcblx0XHRcdFx0Z3JvdXAuZ3JvdXAuY29sbGFwc2VkID0gdHJ1ZTtcblx0XHRcdFx0aWYgKHNob3VsZFNob3dHcm91cEhlYWRlcnMpIHtcblx0XHRcdFx0XHR2aWV3TW9kZWxFbnRyaWVzLnB1c2goZ3JvdXAuZ3JvdXApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBncm91cEVudHJpZXM6IElWaWV3TW9kZWxFbnRyeVtdID0gW107XG5cdFx0XHRpZiAoZ3JvdXAuc3RhdHVzKSB7XG5cdFx0XHRcdGdyb3VwRW50cmllcy5wdXNoKGdyb3VwLnN0YXR1cyk7XG5cdFx0XHR9XG5cblx0XHRcdGdyb3VwRW50cmllcy5wdXNoKC4uLnRoaXMuZmlsdGVyTW9kZWxzKGdyb3VwLm1vZGVscywgdGhpcy5zZWFyY2hWYWx1ZSkpO1xuXG5cdFx0XHRpZiAoZ3JvdXBFbnRyaWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Z3JvdXAuZ3JvdXAuY29sbGFwc2VkID0gZmFsc2U7XG5cdFx0XHRcdGlmIChzaG91bGRTaG93R3JvdXBIZWFkZXJzKSB7XG5cdFx0XHRcdFx0dmlld01vZGVsRW50cmllcy5wdXNoKGdyb3VwLmdyb3VwKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR2aWV3TW9kZWxFbnRyaWVzLnB1c2goLi4uZ3JvdXBFbnRyaWVzKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5zcGxpY2UoMCwgdGhpcy5fdmlld01vZGVsRW50cmllcy5sZW5ndGgsIHZpZXdNb2RlbEVudHJpZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJNb2RlbHMobW9kZWxFbnRyaWVzOiBJTGFuZ3VhZ2VNb2RlbFtdLCBzZWFyY2hWYWx1ZTogc3RyaW5nKTogSVZpZXdNb2RlbEVudHJ5W10ge1xuXHRcdGNvbnN0IHByb3ZpZGVyTmFtZXM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IHByb3ZpZGVyTWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cdFx0UFJPVklERVJfUkVHRVgubGFzdEluZGV4ID0gMDtcblx0XHR3aGlsZSAoKHByb3ZpZGVyTWF0Y2ggPSBQUk9WSURFUl9SRUdFWC5leGVjKHNlYXJjaFZhbHVlKSkgIT09IG51bGwpIHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyTmFtZSA9IHByb3ZpZGVyTWF0Y2hbMl0gPyBwcm92aWRlck1hdGNoWzJdLnN1YnN0cmluZygxLCBwcm92aWRlck1hdGNoWzJdLmxlbmd0aCAtIDEpIDogcHJvdmlkZXJNYXRjaFszXTtcblx0XHRcdHByb3ZpZGVyTmFtZXMucHVzaChwcm92aWRlck5hbWUpO1xuXHRcdH1cblx0XHRpZiAocHJvdmlkZXJOYW1lcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRzZWFyY2hWYWx1ZSA9IHNlYXJjaFZhbHVlLnJlcGxhY2UoUFJPVklERVJfUkVHRVgsICcnKTtcblx0XHR9XG5cblx0XHRjb25zdCBjYXBhYmlsaXRpZXM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IGNhcGFiaWxpdHlNYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblx0XHRDQVBBQklMSVRZX1JFR0VYLmxhc3RJbmRleCA9IDA7XG5cdFx0d2hpbGUgKChjYXBhYmlsaXR5TWF0Y2ggPSBDQVBBQklMSVRZX1JFR0VYLmV4ZWMoc2VhcmNoVmFsdWUpKSAhPT0gbnVsbCkge1xuXHRcdFx0Y2FwYWJpbGl0aWVzLnB1c2goY2FwYWJpbGl0eU1hdGNoWzFdLnRvTG93ZXJDYXNlKCkpO1xuXHRcdH1cblx0XHRpZiAoY2FwYWJpbGl0aWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHNlYXJjaFZhbHVlID0gc2VhcmNoVmFsdWUucmVwbGFjZShDQVBBQklMSVRZX1JFR0VYLCAnJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcXVvdGVBdEZpcnN0Q2hhciA9IHNlYXJjaFZhbHVlLmNoYXJBdCgwKSA9PT0gJ1wiJztcblx0XHRjb25zdCBxdW90ZUF0TGFzdENoYXIgPSBzZWFyY2hWYWx1ZS5jaGFyQXQoc2VhcmNoVmFsdWUubGVuZ3RoIC0gMSkgPT09ICdcIic7XG5cdFx0Y29uc3QgY29tcGxldGVNYXRjaCA9IHF1b3RlQXRGaXJzdENoYXIgJiYgcXVvdGVBdExhc3RDaGFyO1xuXHRcdGlmIChxdW90ZUF0Rmlyc3RDaGFyKSB7XG5cdFx0XHRzZWFyY2hWYWx1ZSA9IHNlYXJjaFZhbHVlLnN1YnN0cmluZygxKTtcblx0XHR9XG5cdFx0aWYgKHF1b3RlQXRMYXN0Q2hhcikge1xuXHRcdFx0c2VhcmNoVmFsdWUgPSBzZWFyY2hWYWx1ZS5zdWJzdHJpbmcoMCwgc2VhcmNoVmFsdWUubGVuZ3RoIC0gMSk7XG5cdFx0fVxuXHRcdHNlYXJjaFZhbHVlID0gc2VhcmNoVmFsdWUudHJpbSgpO1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBJVmlld01vZGVsRW50cnlbXSA9IFtdO1xuXHRcdGNvbnN0IHdvcmRzID0gc2VhcmNoVmFsdWUuc3BsaXQoJyAnKTtcblx0XHRjb25zdCBsb3dlclByb3ZpZGVycyA9IHByb3ZpZGVyTmFtZXMubWFwKHAgPT4gcC50b0xvd2VyQ2FzZSgpLnRyaW0oKSk7XG5cblx0XHRmb3IgKGNvbnN0IG1vZGVsRW50cnkgb2YgbW9kZWxFbnRyaWVzKSB7XG5cdFx0XHRpZiAobG93ZXJQcm92aWRlcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBtYXRjaGVzUHJvdmlkZXIgPSBsb3dlclByb3ZpZGVycy5zb21lKHByb3ZpZGVyID0+XG5cdFx0XHRcdFx0bW9kZWxFbnRyeS5wcm92aWRlci52ZW5kb3IudmVuZG9yLnRvTG93ZXJDYXNlKCkgPT09IHByb3ZpZGVyIHx8XG5cdFx0XHRcdFx0bW9kZWxFbnRyeS5wcm92aWRlci52ZW5kb3IuZGlzcGxheU5hbWUudG9Mb3dlckNhc2UoKSA9PT0gcHJvdmlkZXIgfHxcblx0XHRcdFx0XHRtb2RlbEVudHJ5LnByb3ZpZGVyLmdyb3VwLnZlbmRvci50b0xvd2VyQ2FzZSgpID09PSBwcm92aWRlciB8fFxuXHRcdFx0XHRcdG1vZGVsRW50cnkucHJvdmlkZXIuZ3JvdXAubmFtZS50b0xvd2VyQ2FzZSgpID09PSBwcm92aWRlclxuXHRcdFx0XHQpO1xuXHRcdFx0XHRpZiAoIW1hdGNoZXNQcm92aWRlcikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZpbHRlciBieSBjYXBhYmlsaXRpZXNcblx0XHRcdGxldCBtYXRjaGVkQ2FwYWJpbGl0aWVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0aWYgKGNhcGFiaWxpdGllcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGlmICghbW9kZWxFbnRyeS5tZXRhZGF0YS5jYXBhYmlsaXRpZXMpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRsZXQgbWF0Y2hlc0FsbCA9IHRydWU7XG5cdFx0XHRcdGZvciAoY29uc3QgY2FwYWJpbGl0eSBvZiBjYXBhYmlsaXRpZXMpIHtcblx0XHRcdFx0XHRjb25zdCBtYXRjaGVkRm9yVGhpc0NhcGFiaWxpdHkgPSB0aGlzLmdldE1hdGNoaW5nQ2FwYWJpbGl0aWVzKG1vZGVsRW50cnksIGNhcGFiaWxpdHkpO1xuXHRcdFx0XHRcdGlmIChtYXRjaGVkRm9yVGhpc0NhcGFiaWxpdHkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRtYXRjaGVzQWxsID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bWF0Y2hlZENhcGFiaWxpdGllcy5wdXNoKC4uLm1hdGNoZWRGb3JUaGlzQ2FwYWJpbGl0eSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFtYXRjaGVzQWxsKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0bWF0Y2hlZENhcGFiaWxpdGllcyA9IGRpc3RpbmN0KG1hdGNoZWRDYXBhYmlsaXRpZXMpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGaWx0ZXIgYnkgdGV4dFxuXHRcdFx0bGV0IG1vZGVsTWF0Y2hlczogTW9kZWxJdGVtTWF0Y2hlcyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChzZWFyY2hWYWx1ZSkge1xuXHRcdFx0XHRtb2RlbE1hdGNoZXMgPSBuZXcgTW9kZWxJdGVtTWF0Y2hlcyhtb2RlbEVudHJ5LCBzZWFyY2hWYWx1ZSwgd29yZHMsIGNvbXBsZXRlTWF0Y2gpO1xuXHRcdFx0XHRpZiAoIW1vZGVsTWF0Y2hlcy5tb2RlbE5hbWVNYXRjaGVzICYmICFtb2RlbE1hdGNoZXMubW9kZWxJZE1hdGNoZXMgJiYgIW1vZGVsTWF0Y2hlcy5wcm92aWRlck1hdGNoZXMgJiYgIW1vZGVsTWF0Y2hlcy5jYXBhYmlsaXR5TWF0Y2hlcykge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1vZGVsSWQgPSB0aGlzLmdldE1vZGVsSWQobW9kZWxFbnRyeSk7XG5cdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdHR5cGU6ICdtb2RlbCcsXG5cdFx0XHRcdGlkOiBtb2RlbElkLFxuXHRcdFx0XHR0ZW1wbGF0ZUlkOiBNT0RFTF9FTlRSWV9URU1QTEFURV9JRCxcblx0XHRcdFx0bW9kZWw6IG1vZGVsRW50cnksXG5cdFx0XHRcdG1vZGVsTmFtZU1hdGNoZXM6IG1vZGVsTWF0Y2hlcz8ubW9kZWxOYW1lTWF0Y2hlcyB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdG1vZGVsSWRNYXRjaGVzOiBtb2RlbE1hdGNoZXM/Lm1vZGVsSWRNYXRjaGVzIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0cHJvdmlkZXJNYXRjaGVzOiBtb2RlbE1hdGNoZXM/LnByb3ZpZGVyTWF0Y2hlcyB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdGNhcGFiaWxpdHlNYXRjaGVzOiBtYXRjaGVkQ2FwYWJpbGl0aWVzLmxlbmd0aCA/IG1hdGNoZWRDYXBhYmlsaXRpZXMgOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TWF0Y2hpbmdDYXBhYmlsaXRpZXMobW9kZWxFbnRyeTogSUxhbmd1YWdlTW9kZWwsIGNhcGFiaWxpdHk6IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCBtYXRjaGVkQ2FwYWJpbGl0aWVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGlmICghbW9kZWxFbnRyeS5tZXRhZGF0YS5jYXBhYmlsaXRpZXMpIHtcblx0XHRcdHJldHVybiBtYXRjaGVkQ2FwYWJpbGl0aWVzO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAoY2FwYWJpbGl0eSkge1xuXHRcdFx0Y2FzZSAndG9vbHMnOlxuXHRcdFx0Y2FzZSAndG9vbGNhbGxpbmcnOlxuXHRcdFx0XHRpZiAobW9kZWxFbnRyeS5tZXRhZGF0YS5jYXBhYmlsaXRpZXMudG9vbENhbGxpbmcgPT09IHRydWUpIHtcblx0XHRcdFx0XHRtYXRjaGVkQ2FwYWJpbGl0aWVzLnB1c2goJ3Rvb2xDYWxsaW5nJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICd2aXNpb24nOlxuXHRcdFx0XHRpZiAobW9kZWxFbnRyeS5tZXRhZGF0YS5jYXBhYmlsaXRpZXMudmlzaW9uID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0bWF0Y2hlZENhcGFiaWxpdGllcy5wdXNoKCd2aXNpb24nKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2FnZW50Jzpcblx0XHRcdGNhc2UgJ2FnZW50bW9kZSc6XG5cdFx0XHRcdGlmIChtb2RlbEVudHJ5Lm1ldGFkYXRhLmNhcGFiaWxpdGllcy5hZ2VudE1vZGUgPT09IHRydWUpIHtcblx0XHRcdFx0XHRtYXRjaGVkQ2FwYWJpbGl0aWVzLnB1c2goJ2FnZW50TW9kZScpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0Ly8gQ2hlY2sgZWRpdCB0b29sc1xuXHRcdFx0XHRpZiAobW9kZWxFbnRyeS5tZXRhZGF0YS5jYXBhYmlsaXRpZXMuZWRpdFRvb2xzKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB0b29sIG9mIG1vZGVsRW50cnkubWV0YWRhdGEuY2FwYWJpbGl0aWVzLmVkaXRUb29scykge1xuXHRcdFx0XHRcdFx0aWYgKHRvb2wudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhjYXBhYmlsaXR5KSkge1xuXHRcdFx0XHRcdFx0XHRtYXRjaGVkQ2FwYWJpbGl0aWVzLnB1c2godG9vbCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRyZXR1cm4gbWF0Y2hlZENhcGFiaWxpdGllcztcblx0fVxuXG5cdHByaXZhdGUgZ3JvdXBNb2RlbHMobGFuZ3VhZ2VNb2RlbHM6IElMYW5ndWFnZU1vZGVsW10pOiBJTGFuZ3VhZ2VNb2RlbEVudHJpZXNHcm91cFtdIHtcblx0XHRjb25zdCByZXN1bHQ6IElMYW5ndWFnZU1vZGVsRW50cmllc0dyb3VwW10gPSBbXTtcblx0XHRpZiAodGhpcy5ncm91cEJ5ID09PSBDaGF0TW9kZWxHcm91cC5WZW5kb3IpIHtcblx0XHRcdGZvciAoY29uc3QgbW9kZWwgb2YgbGFuZ3VhZ2VNb2RlbHMpIHtcblx0XHRcdFx0Y29uc3QgZ3JvdXBJZCA9IHRoaXMuZ2V0UHJvdmlkZXJHcm91cElkKG1vZGVsLnByb3ZpZGVyKTtcblx0XHRcdFx0bGV0IGdyb3VwID0gcmVzdWx0LmZpbmQoZ3JvdXAgPT4gZ3JvdXAuZ3JvdXAuaWQgPT09IGdyb3VwSWQpO1xuXHRcdFx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRcdFx0Z3JvdXAgPSB7XG5cdFx0XHRcdFx0XHRncm91cDogdGhpcy5jcmVhdGVMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShtb2RlbC5wcm92aWRlciksXG5cdFx0XHRcdFx0XHRtb2RlbHM6IFtdLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goZ3JvdXApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGdyb3VwLm1vZGVscy5wdXNoKG1vZGVsKTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3Qgc3RhdHVzR3JvdXAgb2YgdGhpcy5sYW5ndWFnZU1vZGVsR3JvdXBTdGF0dXNlcykge1xuXHRcdFx0XHRjb25zdCBncm91cElkID0gdGhpcy5nZXRQcm92aWRlckdyb3VwSWQoc3RhdHVzR3JvdXAucHJvdmlkZXIpO1xuXHRcdFx0XHRsZXQgZ3JvdXAgPSByZXN1bHQuZmluZChncm91cCA9PiBncm91cC5ncm91cC5pZCA9PT0gZ3JvdXBJZCk7XG5cdFx0XHRcdGlmICghZ3JvdXApIHtcblx0XHRcdFx0XHRncm91cCA9IHtcblx0XHRcdFx0XHRcdGdyb3VwOiB0aGlzLmNyZWF0ZUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KHN0YXR1c0dyb3VwLnByb3ZpZGVyKSxcblx0XHRcdFx0XHRcdG1vZGVsczogW10sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChncm91cCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Z3JvdXAuc3RhdHVzID0ge1xuXHRcdFx0XHRcdGlkOiBgc3RhdHVzLiR7Z3JvdXAuZ3JvdXAuaWR9YCxcblx0XHRcdFx0XHR0eXBlOiAnc3RhdHVzJyxcblx0XHRcdFx0XHQuLi5zdGF0dXNHcm91cC5zdGF0dXMsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0XHRpZiAoYS5tb2RlbHNbMF0/LnByb3ZpZGVyLnZlbmRvci5pc0RlZmF1bHQpIHsgcmV0dXJuIC0xOyB9XG5cdFx0XHRcdGlmIChiLm1vZGVsc1swXT8ucHJvdmlkZXIudmVuZG9yLmlzRGVmYXVsdCkgeyByZXR1cm4gMTsgfVxuXHRcdFx0XHRyZXR1cm4gYS5ncm91cC5sYWJlbC5sb2NhbGVDb21wYXJlKGIuZ3JvdXAubGFiZWwpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgcmVzdWx0KSB7XG5cdFx0XHRpZiAoaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShncm91cC5ncm91cCkpIHtcblx0XHRcdFx0Z3JvdXAuZ3JvdXAuaGlkZGVuID0gZ3JvdXAubW9kZWxzLmxlbmd0aCA+IDAgJiYgZ3JvdXAubW9kZWxzLmV2ZXJ5KG1vZGVsID0+IG1vZGVsLmhpZGRlbik7XG5cdFx0XHR9XG5cdFx0XHRncm91cC5tb2RlbHMuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0XHRpZiAoYS5wcm92aWRlci52ZW5kb3IuaXNEZWZhdWx0ICYmIGIucHJvdmlkZXIudmVuZG9yLmlzRGVmYXVsdCkge1xuXHRcdFx0XHRcdHJldHVybiBhLm1ldGFkYXRhLm5hbWUubG9jYWxlQ29tcGFyZShiLm1ldGFkYXRhLm5hbWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhLnByb3ZpZGVyLnZlbmRvci5pc0RlZmF1bHQpIHsgcmV0dXJuIC0xOyB9XG5cdFx0XHRcdGlmIChiLnByb3ZpZGVyLnZlbmRvci5pc0RlZmF1bHQpIHsgcmV0dXJuIDE7IH1cblx0XHRcdFx0aWYgKGEucHJvdmlkZXIuZ3JvdXAubmFtZSA9PT0gYi5wcm92aWRlci5ncm91cC5uYW1lKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGEubWV0YWRhdGEubmFtZS5sb2NhbGVDb21wYXJlKGIubWV0YWRhdGEubmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGEucHJvdmlkZXIuZ3JvdXAubmFtZS5sb2NhbGVDb21wYXJlKGIucHJvdmlkZXIuZ3JvdXAubmFtZSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0dGhpcy5tb2RlbHNTb3J0ZWQgPSB0cnVlO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KHByb3ZpZGVyOiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyKTogSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5IHtcblx0XHRjb25zdCBpZCA9IHRoaXMuZ2V0UHJvdmlkZXJHcm91cElkKHByb3ZpZGVyKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ3ZlbmRvcicsXG5cdFx0XHRpZCxcblx0XHRcdGxhYmVsOiBwcm92aWRlci5ncm91cC5uYW1lLFxuXHRcdFx0dGVtcGxhdGVJZDogVkVORE9SX0VOVFJZX1RFTVBMQVRFX0lELFxuXHRcdFx0Y29sbGFwc2VkOiB0aGlzLmNvbGxhcHNlZEdyb3Vwcy5oYXMoaWQpLFxuXHRcdFx0aGlkZGVuOiBmYWxzZSxcblx0XHRcdHNvdXJjZVByZXNlbnRhdGlvbjogcHJvdmlkZXIuc291cmNlUHJlc2VudGF0aW9uLFxuXHRcdFx0dmVuZG9yRW50cnk6IHByb3ZpZGVyLFxuXHRcdH07XG5cdH1cblxuXHRnZXRWZW5kb3JzKCk6IElMYW5ndWFnZU1vZGVsUHJvdmlkZXJEZXNjcmlwdG9yW10ge1xuXHRcdHJldHVybiBbLi4udGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0VmVuZG9ycygpXS5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRpZiAoYS5pc0RlZmF1bHQpIHsgcmV0dXJuIC0xOyB9XG5cdFx0XHRpZiAoYi5pc0RlZmF1bHQpIHsgcmV0dXJuIDE7IH1cblx0XHRcdHJldHVybiBhLmRpc3BsYXlOYW1lLmxvY2FsZUNvbXBhcmUoYi5kaXNwbGF5TmFtZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyByZWZyZXNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnNlbGVjdExhbmd1YWdlTW9kZWxzKHt9KTtcblx0XHRhd2FpdCB0aGlzLnJlZnJlc2hBbGxWZW5kb3JzKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlZnJlc2hBbGxWZW5kb3JzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubGFuZ3VhZ2VNb2RlbHMgPSBbXTtcblx0XHR0aGlzLmxhbmd1YWdlTW9kZWxHcm91cFN0YXR1c2VzID0gW107XG5cdFx0Zm9yIChjb25zdCB2ZW5kb3Igb2YgdGhpcy5nZXRWZW5kb3JzKCkpIHtcblx0XHRcdHRoaXMuYWRkVmVuZG9yTW9kZWxzKHZlbmRvcik7XG5cdFx0fVxuXHRcdHRoaXMubGFuZ3VhZ2VNb2RlbEdyb3VwcyA9IHRoaXMuZ3JvdXBNb2RlbHModGhpcy5sYW5ndWFnZU1vZGVscyk7XG5cdFx0dGhpcy5kb0ZpbHRlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoVmVuZG9yKHZlbmRvcklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCB2ZW5kb3IgPSB0aGlzLmdldFZlbmRvcnMoKS5maW5kKHYgPT4gdi52ZW5kb3IgPT09IHZlbmRvcklkKTtcblx0XHRpZiAoIXZlbmRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSBleGlzdGluZyBtb2RlbHMgZm9yIHRoaXMgdmVuZG9yXG5cdFx0dGhpcy5sYW5ndWFnZU1vZGVscyA9IHRoaXMubGFuZ3VhZ2VNb2RlbHMuZmlsdGVyKG0gPT4gbS5wcm92aWRlci52ZW5kb3IudmVuZG9yICE9PSB2ZW5kb3JJZCk7XG5cdFx0dGhpcy5sYW5ndWFnZU1vZGVsR3JvdXBTdGF0dXNlcyA9IHRoaXMubGFuZ3VhZ2VNb2RlbEdyb3VwU3RhdHVzZXMuZmlsdGVyKHMgPT4gcy5wcm92aWRlci52ZW5kb3IudmVuZG9yICE9PSB2ZW5kb3JJZCk7XG5cblx0XHQvLyBBZGQgdXBkYXRlZCBtb2RlbHMgZm9yIHRoaXMgdmVuZG9yXG5cdFx0dGhpcy5hZGRWZW5kb3JNb2RlbHModmVuZG9yKTtcblx0XHR0aGlzLmxhbmd1YWdlTW9kZWxHcm91cHMgPSB0aGlzLmdyb3VwTW9kZWxzKHRoaXMubGFuZ3VhZ2VNb2RlbHMpO1xuXHRcdHRoaXMuZG9GaWx0ZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgYWRkVmVuZG9yTW9kZWxzKHZlbmRvcjogSUxhbmd1YWdlTW9kZWxQcm92aWRlckRlc2NyaXB0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbHM6IElMYW5ndWFnZU1vZGVsW10gPSBbXTtcblx0XHRjb25zdCBsYW5ndWFnZU1vZGVsc0dyb3VwcyA9IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmdldExhbmd1YWdlTW9kZWxHcm91cHModmVuZG9yLnZlbmRvcik7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBsYW5ndWFnZU1vZGVsc0dyb3Vwcykge1xuXHRcdFx0Y29uc3QgZGVmYXVsdFByb3ZpZGVyOiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyID0ge1xuXHRcdFx0XHRncm91cDogZ3JvdXAuZ3JvdXAgPz8ge1xuXHRcdFx0XHRcdHZlbmRvcjogdmVuZG9yLnZlbmRvcixcblx0XHRcdFx0XHRuYW1lOiB2ZW5kb3IuZGlzcGxheU5hbWVcblx0XHRcdFx0fSxcblx0XHRcdFx0dmVuZG9yXG5cdFx0XHR9O1xuXHRcdFx0aWYgKGdyb3VwLnN0YXR1cykge1xuXHRcdFx0XHR0aGlzLmxhbmd1YWdlTW9kZWxHcm91cFN0YXR1c2VzLnB1c2goe1xuXHRcdFx0XHRcdHByb3ZpZGVyOiBkZWZhdWx0UHJvdmlkZXIsXG5cdFx0XHRcdFx0c3RhdHVzOiB7XG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBncm91cC5zdGF0dXMubWVzc2FnZSxcblx0XHRcdFx0XHRcdHNldmVyaXR5OiBncm91cC5zdGF0dXMuc2V2ZXJpdHlcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBpZGVudGlmaWVyIG9mIGdyb3VwLm1vZGVsSWRlbnRpZmllcnMpIHtcblx0XHRcdFx0Y29uc3QgbWV0YWRhdGEgPSB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKGlkZW50aWZpZXIpO1xuXHRcdFx0XHRpZiAoIW1ldGFkYXRhKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHZlbmRvci5pc0RlZmF1bHQgJiYgbWV0YWRhdGEuaWQgPT09ICdhdXRvJykge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEFnZW50LWhvc3QgQllPSyBtb2RlbHMgYXJlIGNvcGllcyBvZiB0aGUgdXNlcidzIG93biBCWU9LIG1vZGVscyBzdXJmYWNlZFxuXHRcdFx0XHQvLyBieSBhbiBhZ2VudCBob3N0IChlLmcuIENvcGlsb3QgQ0xJKS4gVGhleSBhbHJlYWR5IGFwcGVhciB1bmRlciB0aGVpciByZWFsXG5cdFx0XHRcdC8vIHByb3ZpZGVyIGdyb3VwLCBzbyBsaXN0aW5nIHRoZW0gYWdhaW4gdW5kZXIgdGhlIGFnZW50LWhvc3QgdmVuZG9yIHdvdWxkXG5cdFx0XHRcdC8vIGR1cGxpY2F0ZSB0aGUgZW50aXJlIEJZT0sgY2F0YWxvZ3VlIChlLmcuIGh1bmRyZWRzIG9mIE9wZW5Sb3V0ZXIgbW9kZWxzXG5cdFx0XHRcdC8vIHVuZGVyIFwiQ29waWxvdFwiKS4gU2tpcCB0aGVtIGhlcmUuXG5cdFx0XHRcdGlmIChJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YS5nZXRBZ2VudEhvc3RCeW9rTWFuYWdlTW9kZWxzSWRlbnRpZmllcihtZXRhZGF0YSkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHNvdXJjZVByZXNlbnRhdGlvbiA9IG1ldGFkYXRhLm1vZGVsR3JvdXA/LnNvdXJjZUlkXG5cdFx0XHRcdFx0PyBsYW5ndWFnZU1vZGVsU291cmNlUHJlc2VudGF0aW9uUmVnaXN0cnkuZ2V0KG1ldGFkYXRhLnZlbmRvciwgbWV0YWRhdGEubW9kZWxHcm91cC5zb3VyY2VJZClcblx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBtZXRhZGF0YS5tb2RlbEdyb3VwID8ge1xuXHRcdFx0XHRcdHZlbmRvcixcblx0XHRcdFx0XHRncm91cDoge1xuXHRcdFx0XHRcdFx0dmVuZG9yOiBtZXRhZGF0YS5tb2RlbEdyb3VwLmlkLFxuXHRcdFx0XHRcdFx0bmFtZTogc291cmNlUHJlc2VudGF0aW9uPy5sYWJlbCA/PyBnZXRMYW5ndWFnZU1vZGVsUHJvdmlkZXJEaXNwbGF5TmFtZSh0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZSwgbWV0YWRhdGEubW9kZWxHcm91cC5pZCksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRzb3VyY2VJZDogbWV0YWRhdGEubW9kZWxHcm91cC5zb3VyY2VJZCxcblx0XHRcdFx0XHRzb3VyY2VQcmVzZW50YXRpb24sXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElMYW5ndWFnZU1vZGVsUHJvdmlkZXIgOiBkZWZhdWx0UHJvdmlkZXI7XG5cdFx0XHRcdG1vZGVscy5wdXNoKHtcblx0XHRcdFx0XHRpZGVudGlmaWVyLFxuXHRcdFx0XHRcdG1ldGFkYXRhLFxuXHRcdFx0XHRcdHByb3ZpZGVyLFxuXHRcdFx0XHRcdGhpZGRlbjogdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UuaXNNb2RlbEhpZGRlbihpZGVudGlmaWVyKSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMubGFuZ3VhZ2VNb2RlbHMucHVzaCguLi5tb2RlbHMuc29ydCgoYSwgYikgPT4gYS5tZXRhZGF0YS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5tZXRhZGF0YS5uYW1lKSkpO1xuXHR9XG5cblx0Z2V0TW9kZWxzRm9yR3JvdXAoZ3JvdXA6IElMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeSB8IElMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeSk6IElMYW5ndWFnZU1vZGVsW10ge1xuXHRcdGlmIChpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KGdyb3VwKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMubGFuZ3VhZ2VNb2RlbHMuZmlsdGVyKG0gPT5cblx0XHRcdFx0dGhpcy5nZXRQcm92aWRlckdyb3VwSWQobS5wcm92aWRlcikgPT09IGdyb3VwLmlkXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdC8vIHJldHVybiBhbGwgbW9kZWxzIHVuZ3JvdXBlZFxuXHRcdHJldHVybiB0aGlzLmxhbmd1YWdlTW9kZWxzO1xuXHR9XG5cblx0dG9nZ2xlTW9kZWxIaWRkZW4oZW50cnk6IElMYW5ndWFnZU1vZGVsRW50cnkpOiB2b2lkIHtcblx0XHR0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5zZXRNb2RlbEhpZGRlbihlbnRyeS5tb2RlbC5pZGVudGlmaWVyLCAhZW50cnkubW9kZWwuaGlkZGVuKTtcblx0fVxuXG5cdHRvZ2dsZUdyb3VwSGlkZGVuKGVudHJ5OiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkpOiB2b2lkIHtcblx0XHR0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5zZXRNb2RlbHNIaWRkZW4odGhpcy5nZXRNb2RlbHNGb3JHcm91cChlbnRyeSkubWFwKG1vZGVsID0+IG1vZGVsLmlkZW50aWZpZXIpLCAhZW50cnkuaGlkZGVuKTtcblx0fVxuXG5cdHNldE1vZGVsc0hpZGRlbihlbnRyaWVzOiByZWFkb25seSBJTGFuZ3VhZ2VNb2RlbEVudHJ5W10sIGhpZGRlbjogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnNldE1vZGVsc0hpZGRlbihlbnRyaWVzLm1hcChlbnRyeSA9PiBlbnRyeS5tb2RlbC5pZGVudGlmaWVyKSwgaGlkZGVuKTtcblx0fVxuXG5cdHByaXZhdGUgcmVmcmVzaFZpc2liaWxpdHkoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBtb2RlbCBvZiB0aGlzLmxhbmd1YWdlTW9kZWxzKSB7XG5cdFx0XHRtb2RlbC5oaWRkZW4gPSB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5pc01vZGVsSGlkZGVuKG1vZGVsLmlkZW50aWZpZXIpO1xuXHRcdH1cblx0XHQvLyBSZWJ1aWxkIGdyb3VwcyBzbyBwcm92aWRlci9ncm91cCBoZWFkZXIgYGhpZGRlbmAgcmVmbGVjdHMgdGhlIG5ldyBzdGF0ZS5cblx0XHR0aGlzLmxhbmd1YWdlTW9kZWxHcm91cHMgPSB0aGlzLmdyb3VwTW9kZWxzKHRoaXMubGFuZ3VhZ2VNb2RlbHMpO1xuXHRcdHRoaXMuZG9GaWx0ZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TW9kZWxJZChtb2RlbEVudHJ5OiBJTGFuZ3VhZ2VNb2RlbCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke21vZGVsRW50cnkucHJvdmlkZXIuZ3JvdXAubmFtZX0uJHttb2RlbEVudHJ5LmlkZW50aWZpZXJ9LiR7bW9kZWxFbnRyeS5tZXRhZGF0YS52ZXJzaW9ufWA7XG5cdH1cblxuXHRwcml2YXRlIGdldFByb3ZpZGVyR3JvdXBJZChwcm92aWRlcjogSUxhbmd1YWdlTW9kZWxQcm92aWRlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3Byb3ZpZGVyLmdyb3VwLnZlbmRvcn0tJHtwcm92aWRlci5ncm91cC5uYW1lfS0ke3Byb3ZpZGVyLnNvdXJjZUlkID8/ICdjb25maWd1cmVkJ31gO1xuXHR9XG5cblx0dG9nZ2xlQ29sbGFwc2VkKHZpZXdNb2RlbEVudHJ5OiBJVmlld01vZGVsRW50cnkpOiB2b2lkIHtcblx0XHRjb25zdCBpZCA9IGlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkodmlld01vZGVsRW50cnkpID8gdmlld01vZGVsRW50cnkuaWQgOiBpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KHZpZXdNb2RlbEVudHJ5KSA/IHZpZXdNb2RlbEVudHJ5LmlkIDogdW5kZWZpbmVkO1xuXHRcdGlmICghaWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5zZWxlY3RlZEVudHJ5ID0gdmlld01vZGVsRW50cnk7XG5cdFx0aWYgKCF0aGlzLmNvbGxhcHNlZEdyb3Vwcy5kZWxldGUoaWQpKSB7XG5cdFx0XHR0aGlzLmNvbGxhcHNlZEdyb3Vwcy5hZGQoaWQpO1xuXHRcdH1cblx0XHR0aGlzLmRvRmlsdGVyKCk7XG5cdH1cblxuXHRjb2xsYXBzZUFsbCgpOiB2b2lkIHtcblx0XHR0aGlzLmNvbGxhcHNlZEdyb3Vwcy5jbGVhcigpO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy52aWV3TW9kZWxFbnRyaWVzKSB7XG5cdFx0XHRpZiAoaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShlbnRyeSkgfHwgaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShlbnRyeSkpIHtcblx0XHRcdFx0dGhpcy5jb2xsYXBzZWRHcm91cHMuYWRkKGVudHJ5LmlkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5kb0ZpbHRlcigpO1xuXHR9XG5cblx0Z2V0Q29uZmlndXJlZFZlbmRvcnMoKTogSUxhbmd1YWdlTW9kZWxQcm92aWRlcltdIHtcblx0XHRjb25zdCByZXN1bHQ6IElMYW5ndWFnZU1vZGVsUHJvdmlkZXJbXSA9IFtdO1xuXHRcdGNvbnN0IHNlZW5WZW5kb3JzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBtb2RlbEVudHJ5IG9mIHRoaXMubGFuZ3VhZ2VNb2RlbHMpIHtcblx0XHRcdGlmICghc2VlblZlbmRvcnMuaGFzKG1vZGVsRW50cnkucHJvdmlkZXIuZ3JvdXAubmFtZSkpIHtcblx0XHRcdFx0c2VlblZlbmRvcnMuYWRkKG1vZGVsRW50cnkucHJvdmlkZXIuZ3JvdXAubmFtZSk7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG1vZGVsRW50cnkucHJvdmlkZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmNsYXNzIE1vZGVsSXRlbU1hdGNoZXMge1xuXG5cdHJlYWRvbmx5IG1vZGVsTmFtZU1hdGNoZXM6IElNYXRjaFtdIHwgbnVsbCA9IG51bGw7XG5cdHJlYWRvbmx5IG1vZGVsSWRNYXRjaGVzOiBJTWF0Y2hbXSB8IG51bGwgPSBudWxsO1xuXHRyZWFkb25seSBwcm92aWRlck1hdGNoZXM6IElNYXRjaFtdIHwgbnVsbCA9IG51bGw7XG5cdHJlYWRvbmx5IGNhcGFiaWxpdHlNYXRjaGVzOiBJTWF0Y2hbXSB8IG51bGwgPSBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKG1vZGVsRW50cnk6IElMYW5ndWFnZU1vZGVsLCBzZWFyY2hWYWx1ZTogc3RyaW5nLCB3b3Jkczogc3RyaW5nW10sIGNvbXBsZXRlTWF0Y2g6IGJvb2xlYW4pIHtcblx0XHRpZiAoIWNvbXBsZXRlTWF0Y2gpIHtcblx0XHRcdC8vIE1hdGNoIGFnYWluc3QgbW9kZWwgbmFtZVxuXHRcdFx0dGhpcy5tb2RlbE5hbWVNYXRjaGVzID0gbW9kZWxFbnRyeS5tZXRhZGF0YS5uYW1lID9cblx0XHRcdFx0dGhpcy5tYXRjaGVzKHNlYXJjaFZhbHVlLCBtb2RlbEVudHJ5Lm1ldGFkYXRhLm5hbWUsICh3b3JkLCB3b3JkVG9NYXRjaEFnYWluc3QpID0+IG1hdGNoZXNXb3Jkcyh3b3JkLCB3b3JkVG9NYXRjaEFnYWluc3QsIHRydWUpLCB3b3JkcykgOlxuXHRcdFx0XHRudWxsO1xuXG5cdFx0XHR0aGlzLm1vZGVsSWRNYXRjaGVzID0gdGhpcy5tYXRjaGVzKHNlYXJjaFZhbHVlLCBtb2RlbEVudHJ5Lm1ldGFkYXRhLmlkLCBvcihtYXRjaGVzV29yZHMsIG1hdGNoZXNDYW1lbENhc2UpLCB3b3Jkcyk7XG5cblx0XHRcdC8vIE1hdGNoIGFnYWluc3QgdmVuZG9yIGRpc3BsYXkgbmFtZVxuXHRcdFx0dGhpcy5wcm92aWRlck1hdGNoZXMgPSB0aGlzLm1hdGNoZXMoc2VhcmNoVmFsdWUsIG1vZGVsRW50cnkucHJvdmlkZXIuZ3JvdXAubmFtZSwgKHdvcmQsIHdvcmRUb01hdGNoQWdhaW5zdCkgPT4gbWF0Y2hlc1dvcmRzKHdvcmQsIHdvcmRUb01hdGNoQWdhaW5zdCwgdHJ1ZSksIHdvcmRzKTtcblxuXHRcdFx0Ly8gTWF0Y2ggYWdhaW5zdCBjYXBhYmlsaXRpZXNcblx0XHRcdGlmIChtb2RlbEVudHJ5Lm1ldGFkYXRhLmNhcGFiaWxpdGllcykge1xuXHRcdFx0XHRjb25zdCBjYXBhYmlsaXR5U3RyaW5nczogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0aWYgKG1vZGVsRW50cnkubWV0YWRhdGEuY2FwYWJpbGl0aWVzLnRvb2xDYWxsaW5nKSB7XG5cdFx0XHRcdFx0Y2FwYWJpbGl0eVN0cmluZ3MucHVzaCgndG9vbHMnLCAndG9vbENhbGxpbmcnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobW9kZWxFbnRyeS5tZXRhZGF0YS5jYXBhYmlsaXRpZXMudmlzaW9uKSB7XG5cdFx0XHRcdFx0Y2FwYWJpbGl0eVN0cmluZ3MucHVzaCgndmlzaW9uJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG1vZGVsRW50cnkubWV0YWRhdGEuY2FwYWJpbGl0aWVzLmFnZW50TW9kZSkge1xuXHRcdFx0XHRcdGNhcGFiaWxpdHlTdHJpbmdzLnB1c2goJ2FnZW50JywgJ2FnZW50TW9kZScpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChtb2RlbEVudHJ5Lm1ldGFkYXRhLmNhcGFiaWxpdGllcy5lZGl0VG9vbHMpIHtcblx0XHRcdFx0XHRjYXBhYmlsaXR5U3RyaW5ncy5wdXNoKC4uLm1vZGVsRW50cnkubWV0YWRhdGEuY2FwYWJpbGl0aWVzLmVkaXRUb29scyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjYXBhYmlsaXR5U3RyaW5nID0gY2FwYWJpbGl0eVN0cmluZ3Muam9pbignICcpO1xuXHRcdFx0XHRpZiAoY2FwYWJpbGl0eVN0cmluZykge1xuXHRcdFx0XHRcdHRoaXMuY2FwYWJpbGl0eU1hdGNoZXMgPSB0aGlzLm1hdGNoZXMoc2VhcmNoVmFsdWUsIGNhcGFiaWxpdHlTdHJpbmcsIG9yKG1hdGNoZXNXb3JkcywgbWF0Y2hlc0NhbWVsQ2FzZSksIHdvcmRzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgbWF0Y2hlcyhzZWFyY2hWYWx1ZTogc3RyaW5nIHwgbnVsbCwgd29yZFRvTWF0Y2hBZ2FpbnN0OiBzdHJpbmcsIHdvcmRNYXRjaGVzRmlsdGVyOiBJRmlsdGVyLCB3b3Jkczogc3RyaW5nW10pOiBJTWF0Y2hbXSB8IG51bGwge1xuXHRcdGxldCBtYXRjaGVzID0gc2VhcmNoVmFsdWUgPyB3b3JkRmlsdGVyKHNlYXJjaFZhbHVlLCB3b3JkVG9NYXRjaEFnYWluc3QpIDogbnVsbDtcblx0XHRpZiAoIW1hdGNoZXMpIHtcblx0XHRcdG1hdGNoZXMgPSB0aGlzLm1hdGNoZXNXb3Jkcyh3b3Jkcywgd29yZFRvTWF0Y2hBZ2FpbnN0LCB3b3JkTWF0Y2hlc0ZpbHRlcik7XG5cdFx0fVxuXHRcdGlmIChtYXRjaGVzKSB7XG5cdFx0XHRtYXRjaGVzID0gdGhpcy5maWx0ZXJBbmRTb3J0KG1hdGNoZXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gbWF0Y2hlcztcblx0fVxuXG5cdHByaXZhdGUgbWF0Y2hlc1dvcmRzKHdvcmRzOiBzdHJpbmdbXSwgd29yZFRvTWF0Y2hBZ2FpbnN0OiBzdHJpbmcsIHdvcmRNYXRjaGVzRmlsdGVyOiBJRmlsdGVyKTogSU1hdGNoW10gfCBudWxsIHtcblx0XHRsZXQgbWF0Y2hlczogSU1hdGNoW10gfCBudWxsID0gW107XG5cdFx0Zm9yIChjb25zdCB3b3JkIG9mIHdvcmRzKSB7XG5cdFx0XHRjb25zdCB3b3JkTWF0Y2hlcyA9IHdvcmRNYXRjaGVzRmlsdGVyKHdvcmQsIHdvcmRUb01hdGNoQWdhaW5zdCk7XG5cdFx0XHRpZiAod29yZE1hdGNoZXMpIHtcblx0XHRcdFx0bWF0Y2hlcyA9IFsuLi4obWF0Y2hlcyB8fCBbXSksIC4uLndvcmRNYXRjaGVzXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1hdGNoZXMgPSBudWxsO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG1hdGNoZXM7XG5cdH1cblxuXHRwcml2YXRlIGZpbHRlckFuZFNvcnQobWF0Y2hlczogSU1hdGNoW10pOiBJTWF0Y2hbXSB7XG5cdFx0cmV0dXJuIGRpc3RpbmN0KG1hdGNoZXMsIChhID0+IGEuc3RhcnQgKyAnLicgKyBhLmVuZCkpXG5cdFx0XHQuZmlsdGVyKG1hdGNoID0+ICFtYXRjaGVzLnNvbWUobSA9PiAhKG0uc3RhcnQgPT09IG1hdGNoLnN0YXJ0ICYmIG0uZW5kID09PSBtYXRjaC5lbmQpICYmIChtLnN0YXJ0IDw9IG1hdGNoLnN0YXJ0ICYmIG0uZW5kID49IG1hdGNoLmVuZCkpKVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IGEuc3RhcnQgLSBiLnN0YXJ0KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUEwQixJQUFJLGtCQUFrQixjQUFjLHNDQUFzQztBQUNwRyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxxQ0FBcUMsNEJBQTRCLDhCQUF5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
