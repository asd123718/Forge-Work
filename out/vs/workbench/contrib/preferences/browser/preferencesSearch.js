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
import { distinct } from "../../../../base/common/arrays.js";
import { matchesBaseContiguousSubString, matchesContiguousSubString, matchesSubString, matchesWords } from "../../../../base/common/filters.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import * as strings from "../../../../base/common/strings.js";
import { TfIdfCalculator } from "../../../../base/common/tfIdf.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IAiSettingsSearchService } from "../../../services/aiSettingsSearch/common/aiSettingsSearch.js";
import { SettingKeyMatchTypes, SettingMatchType } from "../../../services/preferences/common/preferences.js";
import { nullRange } from "../../../services/preferences/common/preferencesModels.js";
import { EMBEDDINGS_SEARCH_PROVIDER_NAME, IPreferencesSearchService, LLM_RANKED_SEARCH_PROVIDER_NAME, STRING_MATCH_SEARCH_PROVIDER_NAME, TF_IDF_SEARCH_PROVIDER_NAME } from "../common/preferences.js";
let PreferencesSearchService = class extends Disposable {
  constructor(instantiationService, configurationService) {
    super();
    this.instantiationService = instantiationService;
    this.configurationService = configurationService;
  }
  getLocalSearchProvider(filter) {
    return this.instantiationService.createInstance(LocalSearchProvider, filter);
  }
  get remoteSearchAllowed() {
    const workbenchSettings = this.configurationService.getValue().workbench.settings;
    return workbenchSettings.enableNaturalLanguageSearch;
  }
  getRemoteSearchProvider(filter) {
    if (!this.remoteSearchAllowed) {
      return void 0;
    }
    this._remoteSearchProvider ??= this.instantiationService.createInstance(RemoteSearchProvider);
    this._remoteSearchProvider.setFilter(filter);
    return this._remoteSearchProvider;
  }
  getAiSearchProvider(filter) {
    if (!this.remoteSearchAllowed) {
      return void 0;
    }
    this._aiSearchProvider ??= this.instantiationService.createInstance(AiSearchProvider);
    this._aiSearchProvider.setFilter(filter);
    return this._aiSearchProvider;
  }
};
PreferencesSearchService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IConfigurationService)
], PreferencesSearchService);
function cleanFilter(filter) {
  return filter.replace(/[":]/g, " ").replace(/  /g, " ").trim();
}
let LocalSearchProvider = class {
  constructor(_filter, configurationService) {
    this._filter = _filter;
    this.configurationService = configurationService;
    this._filter = cleanFilter(this._filter);
  }
  searchModel(preferencesModel, token) {
    if (!this._filter) {
      return Promise.resolve(null);
    }
    const settingMatcher = (setting) => {
      let { matches, matchType, keyMatchScore } = new SettingMatches(
        this._filter,
        setting,
        true,
        this.configurationService
      );
      if (matchType === SettingMatchType.None || matches.length === 0) {
        return null;
      }
      if (strings.equalsIgnoreCase(this._filter, setting.key)) {
        matchType = SettingMatchType.ExactMatch;
      }
      return {
        matches,
        matchType,
        keyMatchScore,
        score: 0
        // only used for RemoteSearchProvider matches.
      };
    };
    const filterMatches = preferencesModel.filterSettings(this._filter, this.getGroupFilter(this._filter), settingMatcher);
    const topKeyMatchType = Math.max(...filterMatches.map((m) => m.matchType & SettingKeyMatchTypes));
    const alwaysAllowedMatchTypes = SettingMatchType.DescriptionOrValueMatch | SettingMatchType.LanguageTagSettingMatch;
    const filteredMatches = filterMatches.filter((m) => m.matchType & topKeyMatchType || m.matchType & alwaysAllowedMatchTypes || m.matchType === SettingMatchType.ExactMatch).map((m) => ({ ...m, providerName: STRING_MATCH_SEARCH_PROVIDER_NAME }));
    return Promise.resolve({
      filterMatches: filteredMatches,
      exactMatch: filteredMatches.some((m) => m.matchType === SettingMatchType.ExactMatch)
    });
  }
  getGroupFilter(filter) {
    const regex = strings.createRegExp(filter, false, { global: true });
    return (group) => {
      return group.id !== "defaultOverrides" && regex.test(group.title);
    };
  }
};
LocalSearchProvider = __decorateClass([
  __decorateParam(1, IConfigurationService)
], LocalSearchProvider);
class SettingMatches {
  constructor(searchString, setting, searchDescription, configurationService) {
    this.searchDescription = searchDescription;
    this.configurationService = configurationService;
    this.matchType = SettingMatchType.None;
    /**
     * A match score for key matches to allow comparing key matches against each other.
     * Otherwise, all key matches are treated the same, and sorting is done by ToC order.
     */
    this.keyMatchScore = 0;
    this.matches = distinct(this._findMatchesInSetting(searchString, setting), (match) => `${match.startLineNumber}_${match.startColumn}_${match.endLineNumber}_${match.endColumn}_`);
  }
  _findMatchesInSetting(searchString, setting) {
    const result = this._doFindMatchesInSetting(searchString, setting);
    return result;
  }
  _keyToLabel(settingId) {
    const label = settingId.replace(/[-._]/g, " ").replace(/([a-z]+)([A-Z])/g, "$1 $2").replace(/([A-Za-z]+)(\d+)/g, "$1 $2").replace(/(\d+)([A-Za-z]+)/g, "$1 $2").toLowerCase();
    return label;
  }
  _toAlphaNumeric(s) {
    return s.replace(/[^\p{L}\p{N}]+/gu, "");
  }
  _doFindMatchesInSetting(searchString, setting) {
    const descriptionMatchingWords = /* @__PURE__ */ new Map();
    const keyMatchingWords = /* @__PURE__ */ new Map();
    const valueMatchingWords = /* @__PURE__ */ new Map();
    const settingKeyAsWords = this._keyToLabel(setting.key);
    const queryWords = new Set(searchString.split(" "));
    for (const word of queryWords) {
      const keyMatches = matchesWords(word, settingKeyAsWords, true);
      if (keyMatches?.length) {
        keyMatchingWords.set(word, keyMatches.map((match) => this.toKeyRange(setting, match)));
      }
    }
    if (keyMatchingWords.size === queryWords.size) {
      this.matchType |= SettingMatchType.AllWordsInSettingsLabel;
    } else if (keyMatchingWords.size >= 2) {
      this.matchType |= SettingMatchType.ContiguousWordsInSettingsLabel;
      this.keyMatchScore = keyMatchingWords.size;
    }
    const searchStringAlphaNumeric = this._toAlphaNumeric(searchString);
    const keyAlphaNumeric = this._toAlphaNumeric(setting.key);
    const keyIdMatches = matchesContiguousSubString(searchStringAlphaNumeric, keyAlphaNumeric);
    if (keyIdMatches?.length) {
      keyMatchingWords.set(setting.key, keyIdMatches.map((match) => this.toKeyRange(setting, match)));
      this.matchType |= SettingMatchType.ContiguousQueryInSettingId;
    }
    if (this.matchType === SettingMatchType.None) {
      keyMatchingWords.clear();
      for (const word of queryWords) {
        const keyMatches = matchesWords(word, settingKeyAsWords, false);
        if (keyMatches?.length) {
          keyMatchingWords.set(word, keyMatches.map((match) => this.toKeyRange(setting, match)));
        }
      }
      if (keyMatchingWords.size >= 2 || keyMatchingWords.size === 1 && queryWords.size === 1) {
        this.matchType |= SettingMatchType.NonContiguousWordsInSettingsLabel;
        this.keyMatchScore = keyMatchingWords.size;
      } else {
        const keyIdMatches2 = matchesSubString(searchStringAlphaNumeric, keyAlphaNumeric);
        if (keyIdMatches2?.length) {
          keyMatchingWords.set(setting.key, keyIdMatches2.map((match) => this.toKeyRange(setting, match)));
          this.matchType |= SettingMatchType.NonContiguousQueryInSettingId;
        }
      }
    }
    if (setting.overrides?.length && this.matchType !== SettingMatchType.None) {
      this.matchType = SettingMatchType.LanguageTagSettingMatch;
      const keyRanges2 = keyMatchingWords.size ? Array.from(keyMatchingWords.values()).flat() : [];
      return [...keyRanges2];
    }
    const hasContiguousKeyMatchTypes = this.matchType >= SettingMatchType.ContiguousWordsInSettingsLabel;
    if (this.searchDescription && !hasContiguousKeyMatchTypes) {
      const searchableLines = setting.keywords?.length ? [...setting.description, setting.keywords.join(" ")] : setting.description;
      for (const word of queryWords) {
        for (let lineIndex = 0; lineIndex < searchableLines.length; lineIndex++) {
          const descriptionMatches = matchesBaseContiguousSubString(word, searchableLines[lineIndex]);
          if (descriptionMatches?.length) {
            descriptionMatchingWords.set(word, descriptionMatches.map((match) => this.toDescriptionRange(setting, match, lineIndex)));
          }
        }
      }
      if (descriptionMatchingWords.size === queryWords.size) {
        this.matchType |= SettingMatchType.DescriptionOrValueMatch;
      } else {
        descriptionMatchingWords.clear();
      }
    }
    if (!hasContiguousKeyMatchTypes) {
      if (setting.enum?.length) {
        for (const option of setting.enum) {
          if (typeof option !== "string") {
            continue;
          }
          valueMatchingWords.clear();
          for (const word of queryWords) {
            const valueMatches = matchesContiguousSubString(word, option);
            if (valueMatches?.length) {
              valueMatchingWords.set(word, valueMatches.map((match) => this.toValueRange(setting, match)));
            }
          }
          if (valueMatchingWords.size === queryWords.size) {
            this.matchType |= SettingMatchType.DescriptionOrValueMatch;
            break;
          } else {
            valueMatchingWords.clear();
          }
        }
      } else {
        const settingValue = this.configurationService.getValue(setting.key);
        if (typeof settingValue === "string") {
          for (const word of queryWords) {
            const valueMatches = matchesContiguousSubString(word, settingValue);
            if (valueMatches?.length) {
              valueMatchingWords.set(word, valueMatches.map((match) => this.toValueRange(setting, match)));
            }
          }
          if (valueMatchingWords.size === queryWords.size) {
            this.matchType |= SettingMatchType.DescriptionOrValueMatch;
          } else {
            valueMatchingWords.clear();
          }
        }
      }
    }
    const descriptionRanges = descriptionMatchingWords.size ? Array.from(descriptionMatchingWords.values()).flat() : [];
    const keyRanges = keyMatchingWords.size ? Array.from(keyMatchingWords.values()).flat() : [];
    const valueRanges = valueMatchingWords.size ? Array.from(valueMatchingWords.values()).flat() : [];
    return [...descriptionRanges, ...keyRanges, ...valueRanges];
  }
  toKeyRange(setting, match) {
    return {
      startLineNumber: setting.keyRange.startLineNumber,
      startColumn: setting.keyRange.startColumn + match.start,
      endLineNumber: setting.keyRange.startLineNumber,
      endColumn: setting.keyRange.startColumn + match.end
    };
  }
  toDescriptionRange(setting, match, lineIndex) {
    const descriptionRange = setting.descriptionRanges[lineIndex];
    if (!descriptionRange) {
      return nullRange;
    }
    return {
      startLineNumber: descriptionRange.startLineNumber,
      startColumn: descriptionRange.startColumn + match.start,
      endLineNumber: descriptionRange.endLineNumber,
      endColumn: descriptionRange.startColumn + match.end
    };
  }
  toValueRange(setting, match) {
    return {
      startLineNumber: setting.valueRange.startLineNumber,
      startColumn: setting.valueRange.startColumn + match.start + 1,
      endLineNumber: setting.valueRange.startLineNumber,
      endColumn: setting.valueRange.startColumn + match.end + 1
    };
  }
}
class SettingsRecordProvider {
  constructor() {
    this._settingsRecord = {};
  }
  updateModel(preferencesModel) {
    if (preferencesModel === this._currentPreferencesModel) {
      return;
    }
    this._currentPreferencesModel = preferencesModel;
    this.refresh();
  }
  refresh() {
    this._settingsRecord = {};
    if (!this._currentPreferencesModel) {
      return;
    }
    for (const group of this._currentPreferencesModel.settingsGroups) {
      if (group.id === "mostCommonlyUsed") {
        continue;
      }
      for (const section of group.sections) {
        for (const setting of section.settings) {
          this._settingsRecord[setting.key] = setting;
        }
      }
    }
  }
  getSettingsRecord() {
    return this._settingsRecord;
  }
}
const _EmbeddingsSearchProvider = class _EmbeddingsSearchProvider {
  constructor(_aiSettingsSearchService) {
    this._aiSettingsSearchService = _aiSettingsSearchService;
    this._filter = "";
    this._recordProvider = new SettingsRecordProvider();
  }
  setFilter(filter) {
    this._filter = cleanFilter(filter);
  }
  async searchModel(preferencesModel, token) {
    if (!this._filter || !this._aiSettingsSearchService.isEnabled()) {
      return null;
    }
    this._recordProvider.updateModel(preferencesModel);
    this._aiSettingsSearchService.startSearch(this._filter, token);
    return {
      filterMatches: await this.getEmbeddingsItems(token),
      exactMatch: false
    };
  }
  async getEmbeddingsItems(token) {
    const settingsRecord = this._recordProvider.getSettingsRecord();
    const filterMatches = [];
    const settings = await this._aiSettingsSearchService.getEmbeddingsResults(this._filter, token);
    if (!settings) {
      return [];
    }
    const providerName = EMBEDDINGS_SEARCH_PROVIDER_NAME;
    for (const settingKey of settings) {
      if (filterMatches.length === _EmbeddingsSearchProvider.EMBEDDINGS_SETTINGS_SEARCH_MAX_PICKS) {
        break;
      }
      filterMatches.push({
        setting: settingsRecord[settingKey],
        matches: [settingsRecord[settingKey].range],
        matchType: SettingMatchType.RemoteMatch,
        keyMatchScore: 0,
        score: 0,
        // the results are sorted upstream.
        providerName
      });
    }
    return filterMatches;
  }
};
_EmbeddingsSearchProvider.EMBEDDINGS_SETTINGS_SEARCH_MAX_PICKS = 10;
let EmbeddingsSearchProvider = _EmbeddingsSearchProvider;
const _TfIdfSearchProvider = class _TfIdfSearchProvider {
  constructor() {
    this._filter = "";
    this._documents = [];
    this._settingsRecord = {};
  }
  setFilter(filter) {
    this._filter = cleanFilter(filter);
  }
  keyToLabel(settingId) {
    const label = settingId.replace(/[-._]/g, " ").replace(/([a-z]+)([A-Z])/g, "$1 $2").replace(/([A-Za-z]+)(\d+)/g, "$1 $2").replace(/(\d+)([A-Za-z]+)/g, "$1 $2").toLowerCase();
    return label;
  }
  settingItemToEmbeddingString(item) {
    let result = `Setting Id: ${item.key}
`;
    result += `Label: ${this.keyToLabel(item.key)}
`;
    result += `Description: ${item.description}
`;
    return result;
  }
  async searchModel(preferencesModel, token) {
    if (!this._filter) {
      return null;
    }
    if (this._currentPreferencesModel !== preferencesModel) {
      this._currentPreferencesModel = preferencesModel;
      this._documents = [];
      this._settingsRecord = {};
      for (const group of preferencesModel.settingsGroups) {
        if (group.id === "mostCommonlyUsed") {
          continue;
        }
        for (const section of group.sections) {
          for (const setting of section.settings) {
            this._documents.push({
              key: setting.key,
              textChunks: [this.settingItemToEmbeddingString(setting)]
            });
            this._settingsRecord[setting.key] = setting;
          }
        }
      }
    }
    return {
      filterMatches: await this.getTfIdfItems(token),
      exactMatch: false
    };
  }
  async getTfIdfItems(token) {
    const filterMatches = [];
    const tfIdfCalculator = new TfIdfCalculator();
    tfIdfCalculator.updateDocuments(this._documents);
    const tfIdfRankings = tfIdfCalculator.calculateScores(this._filter, token);
    tfIdfRankings.sort((a, b) => b.score - a.score);
    const maxScore = tfIdfRankings[0].score;
    if (maxScore < _TfIdfSearchProvider.TF_IDF_PRE_NORMALIZE_THRESHOLD) {
      return [];
    }
    for (const info of tfIdfRankings) {
      if (info.score / maxScore < _TfIdfSearchProvider.TF_IDF_POST_NORMALIZE_THRESHOLD || filterMatches.length === _TfIdfSearchProvider.TF_IDF_MAX_PICKS) {
        break;
      }
      const pick = info.key;
      filterMatches.push({
        setting: this._settingsRecord[pick],
        matches: [this._settingsRecord[pick].range],
        matchType: SettingMatchType.RemoteMatch,
        keyMatchScore: 0,
        score: info.score,
        providerName: TF_IDF_SEARCH_PROVIDER_NAME
      });
    }
    return filterMatches;
  }
};
_TfIdfSearchProvider.TF_IDF_PRE_NORMALIZE_THRESHOLD = 50;
_TfIdfSearchProvider.TF_IDF_POST_NORMALIZE_THRESHOLD = 0.7;
_TfIdfSearchProvider.TF_IDF_MAX_PICKS = 5;
let TfIdfSearchProvider = _TfIdfSearchProvider;
class RemoteSearchProvider {
  constructor() {
    this._filter = "";
    this._tfIdfSearchProvider = new TfIdfSearchProvider();
  }
  setFilter(filter) {
    this._filter = filter;
    this._tfIdfSearchProvider.setFilter(filter);
  }
  async searchModel(preferencesModel, token) {
    if (!this._filter) {
      return null;
    }
    const results = await this._tfIdfSearchProvider.searchModel(preferencesModel, token);
    return results;
  }
}
let AiSearchProvider = class {
  constructor(aiSettingsSearchService) {
    this.aiSettingsSearchService = aiSettingsSearchService;
    this._filter = "";
    this._embeddingsSearchProvider = new EmbeddingsSearchProvider(this.aiSettingsSearchService);
    this._recordProvider = new SettingsRecordProvider();
  }
  setFilter(filter) {
    this._filter = filter;
    this._embeddingsSearchProvider.setFilter(filter);
  }
  async searchModel(preferencesModel, token) {
    if (!this._filter || !this.aiSettingsSearchService.isEnabled()) {
      return null;
    }
    this._recordProvider.updateModel(preferencesModel);
    const results = await this._embeddingsSearchProvider.searchModel(preferencesModel, token);
    return results;
  }
  async getLLMRankedResults(token) {
    if (!this._filter || !this.aiSettingsSearchService.isEnabled()) {
      return null;
    }
    const items = await this.getLLMRankedItems(token);
    return {
      filterMatches: items,
      exactMatch: false
    };
  }
  async getLLMRankedItems(token) {
    const settingsRecord = this._recordProvider.getSettingsRecord();
    const filterMatches = [];
    const settings = await this.aiSettingsSearchService.getLLMRankedResults(this._filter, token);
    if (!settings) {
      return [];
    }
    for (const settingKey of settings) {
      if (!settingsRecord[settingKey]) {
        continue;
      }
      filterMatches.push({
        setting: settingsRecord[settingKey],
        matches: [settingsRecord[settingKey].range],
        matchType: SettingMatchType.RemoteMatch,
        keyMatchScore: 0,
        score: 0,
        // the results are sorted upstream.
        providerName: LLM_RANKED_SEARCH_PROVIDER_NAME
      });
    }
    return filterMatches;
  }
};
AiSearchProvider = __decorateClass([
  __decorateParam(0, IAiSettingsSearchService)
], AiSearchProvider);
registerSingleton(IPreferencesSearchService, PreferencesSearchService, InstantiationType.Delayed);
export {
  LocalSearchProvider,
  PreferencesSearchService,
  SettingMatches
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHByZWZlcmVuY2VzXFxicm93c2VyXFxwcmVmZXJlbmNlc1NlYXJjaC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRpc3RpbmN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgSU1hdGNoLCBtYXRjaGVzQmFzZUNvbnRpZ3VvdXNTdWJTdHJpbmcsIG1hdGNoZXNDb250aWd1b3VzU3ViU3RyaW5nLCBtYXRjaGVzU3ViU3RyaW5nLCBtYXRjaGVzV29yZHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFRmSWRmQ2FsY3VsYXRvciwgVGZJZGZEb2N1bWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RmSWRmLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQWlTZXR0aW5nc1NlYXJjaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9haVNldHRpbmdzU2VhcmNoL2NvbW1vbi9haVNldHRpbmdzU2VhcmNoLmpzJztcbmltcG9ydCB7IElHcm91cEZpbHRlciwgSVNlYXJjaFJlc3VsdCwgSVNldHRpbmcsIElTZXR0aW5nTWF0Y2gsIElTZXR0aW5nTWF0Y2hlciwgSVNldHRpbmdzRWRpdG9yTW9kZWwsIElTZXR0aW5nc0dyb3VwLCBTZXR0aW5nS2V5TWF0Y2hUeXBlcywgU2V0dGluZ01hdGNoVHlwZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBudWxsUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXNNb2RlbHMuanMnO1xuaW1wb3J0IHsgRU1CRURESU5HU19TRUFSQ0hfUFJPVklERVJfTkFNRSwgSUFpU2VhcmNoUHJvdmlkZXIsIElQcmVmZXJlbmNlc1NlYXJjaFNlcnZpY2UsIElSZW1vdGVTZWFyY2hQcm92aWRlciwgSVNlYXJjaFByb3ZpZGVyLCBJV29ya2JlbmNoU2V0dGluZ3NDb25maWd1cmF0aW9uLCBMTE1fUkFOS0VEX1NFQVJDSF9QUk9WSURFUl9OQU1FLCBTVFJJTkdfTUFUQ0hfU0VBUkNIX1BST1ZJREVSX05BTUUsIFRGX0lERl9TRUFSQ0hfUFJPVklERVJfTkFNRSB9IGZyb20gJy4uL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUVuZHBvaW50RGV0YWlscyB7XG5cdHVybEJhc2U/OiBzdHJpbmc7XG5cdGtleT86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIFByZWZlcmVuY2VzU2VhcmNoU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUHJlZmVyZW5jZXNTZWFyY2hTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfcmVtb3RlU2VhcmNoUHJvdmlkZXI6IElSZW1vdGVTZWFyY2hQcm92aWRlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYWlTZWFyY2hQcm92aWRlcjogSUFpU2VhcmNoUHJvdmlkZXIgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRnZXRMb2NhbFNlYXJjaFByb3ZpZGVyKGZpbHRlcjogc3RyaW5nKTogTG9jYWxTZWFyY2hQcm92aWRlciB7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTG9jYWxTZWFyY2hQcm92aWRlciwgZmlsdGVyKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IHJlbW90ZVNlYXJjaEFsbG93ZWQoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgd29ya2JlbmNoU2V0dGluZ3MgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElXb3JrYmVuY2hTZXR0aW5nc0NvbmZpZ3VyYXRpb24+KCkud29ya2JlbmNoLnNldHRpbmdzO1xuXHRcdHJldHVybiB3b3JrYmVuY2hTZXR0aW5ncy5lbmFibGVOYXR1cmFsTGFuZ3VhZ2VTZWFyY2g7XG5cdH1cblxuXHRnZXRSZW1vdGVTZWFyY2hQcm92aWRlcihmaWx0ZXI6IHN0cmluZyk6IElSZW1vdGVTZWFyY2hQcm92aWRlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLnJlbW90ZVNlYXJjaEFsbG93ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVtb3RlU2VhcmNoUHJvdmlkZXIgPz89IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVtb3RlU2VhcmNoUHJvdmlkZXIpO1xuXHRcdHRoaXMuX3JlbW90ZVNlYXJjaFByb3ZpZGVyLnNldEZpbHRlcihmaWx0ZXIpO1xuXHRcdHJldHVybiB0aGlzLl9yZW1vdGVTZWFyY2hQcm92aWRlcjtcblx0fVxuXG5cdGdldEFpU2VhcmNoUHJvdmlkZXIoZmlsdGVyOiBzdHJpbmcpOiBJQWlTZWFyY2hQcm92aWRlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLnJlbW90ZVNlYXJjaEFsbG93ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fYWlTZWFyY2hQcm92aWRlciA/Pz0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBaVNlYXJjaFByb3ZpZGVyKTtcblx0XHR0aGlzLl9haVNlYXJjaFByb3ZpZGVyLnNldEZpbHRlcihmaWx0ZXIpO1xuXHRcdHJldHVybiB0aGlzLl9haVNlYXJjaFByb3ZpZGVyO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNsZWFuRmlsdGVyKGZpbHRlcjogc3RyaW5nKTogc3RyaW5nIHtcblx0Ly8gUmVtb3ZlIFwiIGFuZCA6IHdoaWNoIGFyZSBsaWtlbHkgdG8gYmUgY29weXBhc3RlZCBhcyBwYXJ0IG9mIGEgc2V0dGluZyBuYW1lLlxuXHQvLyBMZWF2ZSBvdGhlciBzcGVjaWFsIGNoYXJhY3RlcnMgd2hpY2ggdGhlIHVzZXIgbWlnaHQgd2FudCB0byBzZWFyY2ggZm9yLlxuXHRyZXR1cm4gZmlsdGVyXG5cdFx0LnJlcGxhY2UoL1tcIjpdL2csICcgJylcblx0XHQucmVwbGFjZSgvICAvZywgJyAnKVxuXHRcdC50cmltKCk7XG59XG5cbmV4cG9ydCBjbGFzcyBMb2NhbFNlYXJjaFByb3ZpZGVyIGltcGxlbWVudHMgSVNlYXJjaFByb3ZpZGVyIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfZmlsdGVyOiBzdHJpbmcsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5fZmlsdGVyID0gY2xlYW5GaWx0ZXIodGhpcy5fZmlsdGVyKTtcblx0fVxuXG5cdHNlYXJjaE1vZGVsKHByZWZlcmVuY2VzTW9kZWw6IElTZXR0aW5nc0VkaXRvck1vZGVsLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTZWFyY2hSZXN1bHQgfCBudWxsPiB7XG5cdFx0aWYgKCF0aGlzLl9maWx0ZXIpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2V0dGluZ01hdGNoZXI6IElTZXR0aW5nTWF0Y2hlciA9IChzZXR0aW5nOiBJU2V0dGluZykgPT4ge1xuXHRcdFx0bGV0IHsgbWF0Y2hlcywgbWF0Y2hUeXBlLCBrZXlNYXRjaFNjb3JlIH0gPSBuZXcgU2V0dGluZ01hdGNoZXMoXG5cdFx0XHRcdHRoaXMuX2ZpbHRlcixcblx0XHRcdFx0c2V0dGluZyxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZVxuXHRcdFx0KTtcblx0XHRcdGlmIChtYXRjaFR5cGUgPT09IFNldHRpbmdNYXRjaFR5cGUuTm9uZSB8fCBtYXRjaGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdGlmIChzdHJpbmdzLmVxdWFsc0lnbm9yZUNhc2UodGhpcy5fZmlsdGVyLCBzZXR0aW5nLmtleSkpIHtcblx0XHRcdFx0bWF0Y2hUeXBlID0gU2V0dGluZ01hdGNoVHlwZS5FeGFjdE1hdGNoO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bWF0Y2hlcyxcblx0XHRcdFx0bWF0Y2hUeXBlLFxuXHRcdFx0XHRrZXlNYXRjaFNjb3JlLFxuXHRcdFx0XHRzY29yZTogMCAvLyBvbmx5IHVzZWQgZm9yIFJlbW90ZVNlYXJjaFByb3ZpZGVyIG1hdGNoZXMuXG5cdFx0XHR9O1xuXHRcdH07XG5cblx0XHRjb25zdCBmaWx0ZXJNYXRjaGVzID0gcHJlZmVyZW5jZXNNb2RlbC5maWx0ZXJTZXR0aW5ncyh0aGlzLl9maWx0ZXIsIHRoaXMuZ2V0R3JvdXBGaWx0ZXIodGhpcy5fZmlsdGVyKSwgc2V0dGluZ01hdGNoZXIpO1xuXG5cdFx0Ly8gQ2hlY2sgdGhlIHRvcCBrZXkgbWF0Y2ggdHlwZS5cblx0XHRjb25zdCB0b3BLZXlNYXRjaFR5cGUgPSBNYXRoLm1heCguLi5maWx0ZXJNYXRjaGVzLm1hcChtID0+IChtLm1hdGNoVHlwZSAmIFNldHRpbmdLZXlNYXRjaFR5cGVzKSkpO1xuXHRcdC8vIEFsd2F5cyBhbGxvdyBkZXNjcmlwdGlvbiBtYXRjaGVzIGFzIHBhcnQgb2YgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIzOTkzNi5cblx0XHRjb25zdCBhbHdheXNBbGxvd2VkTWF0Y2hUeXBlcyA9IFNldHRpbmdNYXRjaFR5cGUuRGVzY3JpcHRpb25PclZhbHVlTWF0Y2ggfCBTZXR0aW5nTWF0Y2hUeXBlLkxhbmd1YWdlVGFnU2V0dGluZ01hdGNoO1xuXHRcdGNvbnN0IGZpbHRlcmVkTWF0Y2hlcyA9IGZpbHRlck1hdGNoZXNcblx0XHRcdC5maWx0ZXIobSA9PiAobS5tYXRjaFR5cGUgJiB0b3BLZXlNYXRjaFR5cGUpIHx8IChtLm1hdGNoVHlwZSAmIGFsd2F5c0FsbG93ZWRNYXRjaFR5cGVzKSB8fCBtLm1hdGNoVHlwZSA9PT0gU2V0dGluZ01hdGNoVHlwZS5FeGFjdE1hdGNoKVxuXHRcdFx0Lm1hcChtID0+ICh7IC4uLm0sIHByb3ZpZGVyTmFtZTogU1RSSU5HX01BVENIX1NFQVJDSF9QUk9WSURFUl9OQU1FIH0pKTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcblx0XHRcdGZpbHRlck1hdGNoZXM6IGZpbHRlcmVkTWF0Y2hlcyxcblx0XHRcdGV4YWN0TWF0Y2g6IGZpbHRlcmVkTWF0Y2hlcy5zb21lKG0gPT4gbS5tYXRjaFR5cGUgPT09IFNldHRpbmdNYXRjaFR5cGUuRXhhY3RNYXRjaClcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0R3JvdXBGaWx0ZXIoZmlsdGVyOiBzdHJpbmcpOiBJR3JvdXBGaWx0ZXIge1xuXHRcdGNvbnN0IHJlZ2V4ID0gc3RyaW5ncy5jcmVhdGVSZWdFeHAoZmlsdGVyLCBmYWxzZSwgeyBnbG9iYWw6IHRydWUgfSk7XG5cdFx0cmV0dXJuIChncm91cDogSVNldHRpbmdzR3JvdXApID0+IHtcblx0XHRcdHJldHVybiBncm91cC5pZCAhPT0gJ2RlZmF1bHRPdmVycmlkZXMnICYmIHJlZ2V4LnRlc3QoZ3JvdXAudGl0bGUpO1xuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNldHRpbmdNYXRjaGVzIHtcblx0cmVhZG9ubHkgbWF0Y2hlczogSVJhbmdlW107XG5cdG1hdGNoVHlwZTogU2V0dGluZ01hdGNoVHlwZSA9IFNldHRpbmdNYXRjaFR5cGUuTm9uZTtcblx0LyoqXG5cdCAqIEEgbWF0Y2ggc2NvcmUgZm9yIGtleSBtYXRjaGVzIHRvIGFsbG93IGNvbXBhcmluZyBrZXkgbWF0Y2hlcyBhZ2FpbnN0IGVhY2ggb3RoZXIuXG5cdCAqIE90aGVyd2lzZSwgYWxsIGtleSBtYXRjaGVzIGFyZSB0cmVhdGVkIHRoZSBzYW1lLCBhbmQgc29ydGluZyBpcyBkb25lIGJ5IFRvQyBvcmRlci5cblx0ICovXG5cdGtleU1hdGNoU2NvcmU6IG51bWJlciA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0c2VhcmNoU3RyaW5nOiBzdHJpbmcsXG5cdFx0c2V0dGluZzogSVNldHRpbmcsXG5cdFx0cHJpdmF0ZSBzZWFyY2hEZXNjcmlwdGlvbjogYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5tYXRjaGVzID0gZGlzdGluY3QodGhpcy5fZmluZE1hdGNoZXNJblNldHRpbmcoc2VhcmNoU3RyaW5nLCBzZXR0aW5nKSwgKG1hdGNoKSA9PiBgJHttYXRjaC5zdGFydExpbmVOdW1iZXJ9XyR7bWF0Y2guc3RhcnRDb2x1bW59XyR7bWF0Y2guZW5kTGluZU51bWJlcn1fJHttYXRjaC5lbmRDb2x1bW59X2ApO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZE1hdGNoZXNJblNldHRpbmcoc2VhcmNoU3RyaW5nOiBzdHJpbmcsIHNldHRpbmc6IElTZXR0aW5nKTogSVJhbmdlW10ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2RvRmluZE1hdGNoZXNJblNldHRpbmcoc2VhcmNoU3RyaW5nLCBzZXR0aW5nKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfa2V5VG9MYWJlbChzZXR0aW5nSWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbGFiZWwgPSBzZXR0aW5nSWRcblx0XHRcdC5yZXBsYWNlKC9bLS5fXS9nLCAnICcpXG5cdFx0XHQucmVwbGFjZSgvKFthLXpdKykoW0EtWl0pL2csICckMSAkMicpXG5cdFx0XHQucmVwbGFjZSgvKFtBLVphLXpdKykoXFxkKykvZywgJyQxICQyJylcblx0XHRcdC5yZXBsYWNlKC8oXFxkKykoW0EtWmEtel0rKS9nLCAnJDEgJDInKVxuXHRcdFx0LnRvTG93ZXJDYXNlKCk7XG5cdFx0cmV0dXJuIGxhYmVsO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9BbHBoYU51bWVyaWMoczogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gcy5yZXBsYWNlKC9bXlxccHtMfVxccHtOfV0rL2d1LCAnJyk7XG5cdH1cblxuXHRwcml2YXRlIF9kb0ZpbmRNYXRjaGVzSW5TZXR0aW5nKHNlYXJjaFN0cmluZzogc3RyaW5nLCBzZXR0aW5nOiBJU2V0dGluZyk6IElSYW5nZVtdIHtcblx0XHRjb25zdCBkZXNjcmlwdGlvbk1hdGNoaW5nV29yZHM6IE1hcDxzdHJpbmcsIElSYW5nZVtdPiA9IG5ldyBNYXA8c3RyaW5nLCBJUmFuZ2VbXT4oKTtcblx0XHRjb25zdCBrZXlNYXRjaGluZ1dvcmRzOiBNYXA8c3RyaW5nLCBJUmFuZ2VbXT4gPSBuZXcgTWFwPHN0cmluZywgSVJhbmdlW10+KCk7XG5cdFx0Y29uc3QgdmFsdWVNYXRjaGluZ1dvcmRzOiBNYXA8c3RyaW5nLCBJUmFuZ2VbXT4gPSBuZXcgTWFwPHN0cmluZywgSVJhbmdlW10+KCk7XG5cblx0XHQvLyBLZXkgKElEKSBzZWFyY2hcblx0XHQvLyBGaXJzdCwgc2VhcmNoIGJ5IHRoZSBzZXR0aW5nJ3MgSUQgYW5kIGxhYmVsLlxuXHRcdGNvbnN0IHNldHRpbmdLZXlBc1dvcmRzOiBzdHJpbmcgPSB0aGlzLl9rZXlUb0xhYmVsKHNldHRpbmcua2V5KTtcblx0XHRjb25zdCBxdWVyeVdvcmRzID0gbmV3IFNldDxzdHJpbmc+KHNlYXJjaFN0cmluZy5zcGxpdCgnICcpKTtcblx0XHRmb3IgKGNvbnN0IHdvcmQgb2YgcXVlcnlXb3Jkcykge1xuXHRcdFx0Ly8gQ2hlY2sgaWYgdGhlIGtleSBjb250YWlucyB0aGUgd29yZC4gVXNlIGNvbnRpZ3VvdXMgc2VhcmNoLlxuXHRcdFx0Y29uc3Qga2V5TWF0Y2hlcyA9IG1hdGNoZXNXb3Jkcyh3b3JkLCBzZXR0aW5nS2V5QXNXb3JkcywgdHJ1ZSk7XG5cdFx0XHRpZiAoa2V5TWF0Y2hlcz8ubGVuZ3RoKSB7XG5cdFx0XHRcdGtleU1hdGNoaW5nV29yZHMuc2V0KHdvcmQsIGtleU1hdGNoZXMubWFwKG1hdGNoID0+IHRoaXMudG9LZXlSYW5nZShzZXR0aW5nLCBtYXRjaCkpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGtleU1hdGNoaW5nV29yZHMuc2l6ZSA9PT0gcXVlcnlXb3Jkcy5zaXplKSB7XG5cdFx0XHQvLyBBbGwgd29yZHMgaW4gdGhlIHF1ZXJ5IG1hdGNoZWQgd2l0aCBzb21ldGhpbmcgaW4gdGhlIHNldHRpbmcga2V5LlxuXHRcdFx0Ly8gTWF0Y2hlcyBcImVkaXQgZm9ybWF0IG9uIHBhc3RlXCIgdG8gXCJlZGl0b3IuZm9ybWF0T25QYXN0ZVwiLlxuXHRcdFx0dGhpcy5tYXRjaFR5cGUgfD0gU2V0dGluZ01hdGNoVHlwZS5BbGxXb3Jkc0luU2V0dGluZ3NMYWJlbDtcblx0XHR9IGVsc2UgaWYgKGtleU1hdGNoaW5nV29yZHMuc2l6ZSA+PSAyKSB7XG5cdFx0XHQvLyBNYXRjaGVzIFwiZWRpdCBwYXN0ZVwiIHRvIFwiZWRpdG9yLmZvcm1hdE9uUGFzdGVcIi5cblx0XHRcdC8vIFRoZSBpZiBzdGF0ZW1lbnQgcmVkdWNlcyBub2lzZSBieSBwcmV2ZW50aW5nIFwiZWRpdG9yIGZvcm1hdG9ucGFzdFwiIGZyb20gbWF0Y2hpbmcgYWxsIGVkaXRvciBzZXR0aW5ncy5cblx0XHRcdHRoaXMubWF0Y2hUeXBlIHw9IFNldHRpbmdNYXRjaFR5cGUuQ29udGlndW91c1dvcmRzSW5TZXR0aW5nc0xhYmVsO1xuXHRcdFx0dGhpcy5rZXlNYXRjaFNjb3JlID0ga2V5TWF0Y2hpbmdXb3Jkcy5zaXplO1xuXHRcdH1cblx0XHRjb25zdCBzZWFyY2hTdHJpbmdBbHBoYU51bWVyaWMgPSB0aGlzLl90b0FscGhhTnVtZXJpYyhzZWFyY2hTdHJpbmcpO1xuXHRcdGNvbnN0IGtleUFscGhhTnVtZXJpYyA9IHRoaXMuX3RvQWxwaGFOdW1lcmljKHNldHRpbmcua2V5KTtcblx0XHRjb25zdCBrZXlJZE1hdGNoZXMgPSBtYXRjaGVzQ29udGlndW91c1N1YlN0cmluZyhzZWFyY2hTdHJpbmdBbHBoYU51bWVyaWMsIGtleUFscGhhTnVtZXJpYyk7XG5cdFx0aWYgKGtleUlkTWF0Y2hlcz8ubGVuZ3RoKSB7XG5cdFx0XHQvLyBNYXRjaGVzIFwiZWRpdG9yZm9ybWF0b25wXCIgdG8gXCJlZGl0b3IuZm9ybWF0b25wYXN0ZVwiLlxuXHRcdFx0a2V5TWF0Y2hpbmdXb3Jkcy5zZXQoc2V0dGluZy5rZXksIGtleUlkTWF0Y2hlcy5tYXAobWF0Y2ggPT4gdGhpcy50b0tleVJhbmdlKHNldHRpbmcsIG1hdGNoKSkpO1xuXHRcdFx0dGhpcy5tYXRjaFR5cGUgfD0gU2V0dGluZ01hdGNoVHlwZS5Db250aWd1b3VzUXVlcnlJblNldHRpbmdJZDtcblx0XHR9XG5cblx0XHQvLyBGYWxsIGJhY2sgdG8gbm9uLWNvbnRpZ3VvdXMga2V5IChJRCkgc2VhcmNoZXMgaWYgbm90aGluZyBtYXRjaGVkIHlldC5cblx0XHRpZiAodGhpcy5tYXRjaFR5cGUgPT09IFNldHRpbmdNYXRjaFR5cGUuTm9uZSkge1xuXHRcdFx0a2V5TWF0Y2hpbmdXb3Jkcy5jbGVhcigpO1xuXHRcdFx0Zm9yIChjb25zdCB3b3JkIG9mIHF1ZXJ5V29yZHMpIHtcblx0XHRcdFx0Y29uc3Qga2V5TWF0Y2hlcyA9IG1hdGNoZXNXb3Jkcyh3b3JkLCBzZXR0aW5nS2V5QXNXb3JkcywgZmFsc2UpO1xuXHRcdFx0XHRpZiAoa2V5TWF0Y2hlcz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0a2V5TWF0Y2hpbmdXb3Jkcy5zZXQod29yZCwga2V5TWF0Y2hlcy5tYXAobWF0Y2ggPT4gdGhpcy50b0tleVJhbmdlKHNldHRpbmcsIG1hdGNoKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoa2V5TWF0Y2hpbmdXb3Jkcy5zaXplID49IDIgfHwgKGtleU1hdGNoaW5nV29yZHMuc2l6ZSA9PT0gMSAmJiBxdWVyeVdvcmRzLnNpemUgPT09IDEpKSB7XG5cdFx0XHRcdC8vIE1hdGNoZXMgXCJlZGZvcm9ucGFzXCIgdG8gXCJlZGl0b3IuZm9ybWF0T25QYXN0ZVwiLlxuXHRcdFx0XHQvLyBUaGUgaWYgc3RhdGVtZW50IHJlZHVjZXMgbm9pc2UgYnkgcHJldmVudGluZyBcImVkaXRvciBmb21vbnBhc3RcIiBmcm9tIG1hdGNoaW5nIGFsbCBlZGl0b3Igc2V0dGluZ3MuXG5cdFx0XHRcdHRoaXMubWF0Y2hUeXBlIHw9IFNldHRpbmdNYXRjaFR5cGUuTm9uQ29udGlndW91c1dvcmRzSW5TZXR0aW5nc0xhYmVsO1xuXHRcdFx0XHR0aGlzLmtleU1hdGNoU2NvcmUgPSBrZXlNYXRjaGluZ1dvcmRzLnNpemU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBrZXlJZE1hdGNoZXMgPSBtYXRjaGVzU3ViU3RyaW5nKHNlYXJjaFN0cmluZ0FscGhhTnVtZXJpYywga2V5QWxwaGFOdW1lcmljKTtcblx0XHRcdFx0aWYgKGtleUlkTWF0Y2hlcz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Ly8gTWF0Y2hlcyBcImVkZm1vbnBhc1wiIHRvIFwiZWRpdG9yLmZvcm1hdE9uUGFzdGVcIi5cblx0XHRcdFx0XHRrZXlNYXRjaGluZ1dvcmRzLnNldChzZXR0aW5nLmtleSwga2V5SWRNYXRjaGVzLm1hcChtYXRjaCA9PiB0aGlzLnRvS2V5UmFuZ2Uoc2V0dGluZywgbWF0Y2gpKSk7XG5cdFx0XHRcdFx0dGhpcy5tYXRjaFR5cGUgfD0gU2V0dGluZ01hdGNoVHlwZS5Ob25Db250aWd1b3VzUXVlcnlJblNldHRpbmdJZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHRoZSBtYXRjaCB3YXMgZm9yIGEgbGFuZ3VhZ2UgdGFnIGdyb3VwIHNldHRpbmcgc3VjaCBhcyBbbWFya2Rvd25dLlxuXHRcdC8vIEluIHN1Y2ggYSBjYXNlLCBtb3ZlIHRoYXQgc2V0dGluZyB0byBiZSBsYXN0LlxuXHRcdGlmIChzZXR0aW5nLm92ZXJyaWRlcz8ubGVuZ3RoICYmICh0aGlzLm1hdGNoVHlwZSAhPT0gU2V0dGluZ01hdGNoVHlwZS5Ob25lKSkge1xuXHRcdFx0dGhpcy5tYXRjaFR5cGUgPSBTZXR0aW5nTWF0Y2hUeXBlLkxhbmd1YWdlVGFnU2V0dGluZ01hdGNoO1xuXHRcdFx0Y29uc3Qga2V5UmFuZ2VzID0ga2V5TWF0Y2hpbmdXb3Jkcy5zaXplID9cblx0XHRcdFx0QXJyYXkuZnJvbShrZXlNYXRjaGluZ1dvcmRzLnZhbHVlcygpKS5mbGF0KCkgOiBbXTtcblx0XHRcdHJldHVybiBbLi4ua2V5UmFuZ2VzXTtcblx0XHR9XG5cblx0XHQvLyBEZXNjcmlwdGlvbiBzZWFyY2hcblx0XHQvLyBTZWFyY2ggdGhlIGRlc2NyaXB0aW9uIGlmIHdlIGZvdW5kIG5vbi1jb250aWd1b3VzIGtleSBtYXRjaGVzIGF0IGJlc3QuXG5cdFx0Y29uc3QgaGFzQ29udGlndW91c0tleU1hdGNoVHlwZXMgPSB0aGlzLm1hdGNoVHlwZSA+PSBTZXR0aW5nTWF0Y2hUeXBlLkNvbnRpZ3VvdXNXb3Jkc0luU2V0dGluZ3NMYWJlbDtcblx0XHRpZiAodGhpcy5zZWFyY2hEZXNjcmlwdGlvbiAmJiAhaGFzQ29udGlndW91c0tleU1hdGNoVHlwZXMpIHtcblx0XHRcdC8vIFNlYXJjaCB0aGUgZGVzY3JpcHRpb24gbGluZXMgYW5kIGFueSBhZGRpdGlvbmFsIGtleXdvcmRzLlxuXHRcdFx0Y29uc3Qgc2VhcmNoYWJsZUxpbmVzID0gc2V0dGluZy5rZXl3b3Jkcz8ubGVuZ3RoXG5cdFx0XHRcdD8gWy4uLnNldHRpbmcuZGVzY3JpcHRpb24sIHNldHRpbmcua2V5d29yZHMuam9pbignICcpXVxuXHRcdFx0XHQ6IHNldHRpbmcuZGVzY3JpcHRpb247XG5cdFx0XHRmb3IgKGNvbnN0IHdvcmQgb2YgcXVlcnlXb3Jkcykge1xuXHRcdFx0XHRmb3IgKGxldCBsaW5lSW5kZXggPSAwOyBsaW5lSW5kZXggPCBzZWFyY2hhYmxlTGluZXMubGVuZ3RoOyBsaW5lSW5kZXgrKykge1xuXHRcdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uTWF0Y2hlcyA9IG1hdGNoZXNCYXNlQ29udGlndW91c1N1YlN0cmluZyh3b3JkLCBzZWFyY2hhYmxlTGluZXNbbGluZUluZGV4XSk7XG5cdFx0XHRcdFx0aWYgKGRlc2NyaXB0aW9uTWF0Y2hlcz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbk1hdGNoaW5nV29yZHMuc2V0KHdvcmQsIGRlc2NyaXB0aW9uTWF0Y2hlcy5tYXAobWF0Y2ggPT4gdGhpcy50b0Rlc2NyaXB0aW9uUmFuZ2Uoc2V0dGluZywgbWF0Y2gsIGxpbmVJbmRleCkpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChkZXNjcmlwdGlvbk1hdGNoaW5nV29yZHMuc2l6ZSA9PT0gcXVlcnlXb3Jkcy5zaXplKSB7XG5cdFx0XHRcdHRoaXMubWF0Y2hUeXBlIHw9IFNldHRpbmdNYXRjaFR5cGUuRGVzY3JpcHRpb25PclZhbHVlTWF0Y2g7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBDbGVhciBvdXQgdGhlIG1hdGNoIGZvciBub3cuIFdlIHdhbnQgdG8gcmVxdWlyZSBhbGwgd29yZHMgdG8gbWF0Y2ggaW4gdGhlIGRlc2NyaXB0aW9uLlxuXHRcdFx0XHRkZXNjcmlwdGlvbk1hdGNoaW5nV29yZHMuY2xlYXIoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBWYWx1ZSBzZWFyY2hcblx0XHQvLyBDaGVjayBpZiB0aGUgdmFsdWUgY29udGFpbnMgYWxsIHRoZSB3b3Jkcy5cblx0XHQvLyBTZWFyY2ggdGhlIHZhbHVlcyBpZiB3ZSBmb3VuZCBub24tY29udGlndW91cyBrZXkgbWF0Y2hlcyBhdCBiZXN0LlxuXHRcdGlmICghaGFzQ29udGlndW91c0tleU1hdGNoVHlwZXMpIHtcblx0XHRcdGlmIChzZXR0aW5nLmVudW0/Lmxlbmd0aCkge1xuXHRcdFx0XHQvLyBTZWFyY2ggYWxsIHN0cmluZyB2YWx1ZXMgb2YgZW51bXMuXG5cdFx0XHRcdGZvciAoY29uc3Qgb3B0aW9uIG9mIHNldHRpbmcuZW51bSkge1xuXHRcdFx0XHRcdGlmICh0eXBlb2Ygb3B0aW9uICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHZhbHVlTWF0Y2hpbmdXb3Jkcy5jbGVhcigpO1xuXHRcdFx0XHRcdGZvciAoY29uc3Qgd29yZCBvZiBxdWVyeVdvcmRzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB2YWx1ZU1hdGNoZXMgPSBtYXRjaGVzQ29udGlndW91c1N1YlN0cmluZyh3b3JkLCBvcHRpb24pO1xuXHRcdFx0XHRcdFx0aWYgKHZhbHVlTWF0Y2hlcz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRcdHZhbHVlTWF0Y2hpbmdXb3Jkcy5zZXQod29yZCwgdmFsdWVNYXRjaGVzLm1hcChtYXRjaCA9PiB0aGlzLnRvVmFsdWVSYW5nZShzZXR0aW5nLCBtYXRjaCkpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHZhbHVlTWF0Y2hpbmdXb3Jkcy5zaXplID09PSBxdWVyeVdvcmRzLnNpemUpIHtcblx0XHRcdFx0XHRcdHRoaXMubWF0Y2hUeXBlIHw9IFNldHRpbmdNYXRjaFR5cGUuRGVzY3JpcHRpb25PclZhbHVlTWF0Y2g7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gQ2xlYXIgb3V0IHRoZSBtYXRjaCBmb3Igbm93LiBXZSB3YW50IHRvIHJlcXVpcmUgYWxsIHdvcmRzIHRvIG1hdGNoIGluIHRoZSB2YWx1ZS5cblx0XHRcdFx0XHRcdHZhbHVlTWF0Y2hpbmdXb3Jkcy5jbGVhcigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gU2VhcmNoIHNpbmdsZSBzdHJpbmcgdmFsdWUuXG5cdFx0XHRcdGNvbnN0IHNldHRpbmdWYWx1ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoc2V0dGluZy5rZXkpO1xuXHRcdFx0XHRpZiAodHlwZW9mIHNldHRpbmdWYWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHdvcmQgb2YgcXVlcnlXb3Jkcykge1xuXHRcdFx0XHRcdFx0Y29uc3QgdmFsdWVNYXRjaGVzID0gbWF0Y2hlc0NvbnRpZ3VvdXNTdWJTdHJpbmcod29yZCwgc2V0dGluZ1ZhbHVlKTtcblx0XHRcdFx0XHRcdGlmICh2YWx1ZU1hdGNoZXM/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHR2YWx1ZU1hdGNoaW5nV29yZHMuc2V0KHdvcmQsIHZhbHVlTWF0Y2hlcy5tYXAobWF0Y2ggPT4gdGhpcy50b1ZhbHVlUmFuZ2Uoc2V0dGluZywgbWF0Y2gpKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh2YWx1ZU1hdGNoaW5nV29yZHMuc2l6ZSA9PT0gcXVlcnlXb3Jkcy5zaXplKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm1hdGNoVHlwZSB8PSBTZXR0aW5nTWF0Y2hUeXBlLkRlc2NyaXB0aW9uT3JWYWx1ZU1hdGNoO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBDbGVhciBvdXQgdGhlIG1hdGNoIGZvciBub3cuIFdlIHdhbnQgdG8gcmVxdWlyZSBhbGwgd29yZHMgdG8gbWF0Y2ggaW4gdGhlIHZhbHVlLlxuXHRcdFx0XHRcdFx0dmFsdWVNYXRjaGluZ1dvcmRzLmNsZWFyKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVzY3JpcHRpb25SYW5nZXMgPSBkZXNjcmlwdGlvbk1hdGNoaW5nV29yZHMuc2l6ZSA/XG5cdFx0XHRBcnJheS5mcm9tKGRlc2NyaXB0aW9uTWF0Y2hpbmdXb3Jkcy52YWx1ZXMoKSkuZmxhdCgpIDogW107XG5cdFx0Y29uc3Qga2V5UmFuZ2VzID0ga2V5TWF0Y2hpbmdXb3Jkcy5zaXplID9cblx0XHRcdEFycmF5LmZyb20oa2V5TWF0Y2hpbmdXb3Jkcy52YWx1ZXMoKSkuZmxhdCgpIDogW107XG5cdFx0Y29uc3QgdmFsdWVSYW5nZXMgPSB2YWx1ZU1hdGNoaW5nV29yZHMuc2l6ZSA/XG5cdFx0XHRBcnJheS5mcm9tKHZhbHVlTWF0Y2hpbmdXb3Jkcy52YWx1ZXMoKSkuZmxhdCgpIDogW107XG5cdFx0cmV0dXJuIFsuLi5kZXNjcmlwdGlvblJhbmdlcywgLi4ua2V5UmFuZ2VzLCAuLi52YWx1ZVJhbmdlc107XG5cdH1cblxuXHRwcml2YXRlIHRvS2V5UmFuZ2Uoc2V0dGluZzogSVNldHRpbmcsIG1hdGNoOiBJTWF0Y2gpOiBJUmFuZ2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IHNldHRpbmcua2V5UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0c3RhcnRDb2x1bW46IHNldHRpbmcua2V5UmFuZ2Uuc3RhcnRDb2x1bW4gKyBtYXRjaC5zdGFydCxcblx0XHRcdGVuZExpbmVOdW1iZXI6IHNldHRpbmcua2V5UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0ZW5kQ29sdW1uOiBzZXR0aW5nLmtleVJhbmdlLnN0YXJ0Q29sdW1uICsgbWF0Y2guZW5kXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgdG9EZXNjcmlwdGlvblJhbmdlKHNldHRpbmc6IElTZXR0aW5nLCBtYXRjaDogSU1hdGNoLCBsaW5lSW5kZXg6IG51bWJlcik6IElSYW5nZSB7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb25SYW5nZSA9IHNldHRpbmcuZGVzY3JpcHRpb25SYW5nZXNbbGluZUluZGV4XTtcblx0XHRpZiAoIWRlc2NyaXB0aW9uUmFuZ2UpIHtcblx0XHRcdC8vIFRoaXMgY2FzZSBvY2N1cnMgd2l0aCBhZGRlZCBzZXR0aW5ncyBzdWNoIGFzIHRoZVxuXHRcdFx0Ly8gbWFuYWdlIGV4dGVuc2lvbiBzZXR0aW5nLlxuXHRcdFx0cmV0dXJuIG51bGxSYW5nZTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogZGVzY3JpcHRpb25SYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRzdGFydENvbHVtbjogZGVzY3JpcHRpb25SYW5nZS5zdGFydENvbHVtbiArIG1hdGNoLnN0YXJ0LFxuXHRcdFx0ZW5kTGluZU51bWJlcjogZGVzY3JpcHRpb25SYW5nZS5lbmRMaW5lTnVtYmVyLFxuXHRcdFx0ZW5kQ29sdW1uOiBkZXNjcmlwdGlvblJhbmdlLnN0YXJ0Q29sdW1uICsgbWF0Y2guZW5kXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgdG9WYWx1ZVJhbmdlKHNldHRpbmc6IElTZXR0aW5nLCBtYXRjaDogSU1hdGNoKTogSVJhbmdlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBzZXR0aW5nLnZhbHVlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0c3RhcnRDb2x1bW46IHNldHRpbmcudmFsdWVSYW5nZS5zdGFydENvbHVtbiArIG1hdGNoLnN0YXJ0ICsgMSxcblx0XHRcdGVuZExpbmVOdW1iZXI6IHNldHRpbmcudmFsdWVSYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRlbmRDb2x1bW46IHNldHRpbmcudmFsdWVSYW5nZS5zdGFydENvbHVtbiArIG1hdGNoLmVuZCArIDFcblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIFNldHRpbmdzUmVjb3JkUHJvdmlkZXIge1xuXHRwcml2YXRlIF9zZXR0aW5nc1JlY29yZDogSVN0cmluZ0RpY3Rpb25hcnk8SVNldHRpbmc+ID0ge307XG5cdHByaXZhdGUgX2N1cnJlbnRQcmVmZXJlbmNlc01vZGVsOiBJU2V0dGluZ3NFZGl0b3JNb2RlbCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcigpIHsgfVxuXG5cdHVwZGF0ZU1vZGVsKHByZWZlcmVuY2VzTW9kZWw6IElTZXR0aW5nc0VkaXRvck1vZGVsKSB7XG5cdFx0aWYgKHByZWZlcmVuY2VzTW9kZWwgPT09IHRoaXMuX2N1cnJlbnRQcmVmZXJlbmNlc01vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fY3VycmVudFByZWZlcmVuY2VzTW9kZWwgPSBwcmVmZXJlbmNlc01vZGVsO1xuXHRcdHRoaXMucmVmcmVzaCgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoKCkge1xuXHRcdHRoaXMuX3NldHRpbmdzUmVjb3JkID0ge307XG5cblx0XHRpZiAoIXRoaXMuX2N1cnJlbnRQcmVmZXJlbmNlc01vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLl9jdXJyZW50UHJlZmVyZW5jZXNNb2RlbC5zZXR0aW5nc0dyb3Vwcykge1xuXHRcdFx0aWYgKGdyb3VwLmlkID09PSAnbW9zdENvbW1vbmx5VXNlZCcpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHNlY3Rpb24gb2YgZ3JvdXAuc2VjdGlvbnMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBzZXR0aW5nIG9mIHNlY3Rpb24uc2V0dGluZ3MpIHtcblx0XHRcdFx0XHR0aGlzLl9zZXR0aW5nc1JlY29yZFtzZXR0aW5nLmtleV0gPSBzZXR0aW5nO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0U2V0dGluZ3NSZWNvcmQoKTogSVN0cmluZ0RpY3Rpb25hcnk8SVNldHRpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2V0dGluZ3NSZWNvcmQ7XG5cdH1cbn1cblxuY2xhc3MgRW1iZWRkaW5nc1NlYXJjaFByb3ZpZGVyIGltcGxlbWVudHMgSVJlbW90ZVNlYXJjaFByb3ZpZGVyIHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRU1CRURESU5HU19TRVRUSU5HU19TRUFSQ0hfTUFYX1BJQ0tTID0gMTA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVjb3JkUHJvdmlkZXI6IFNldHRpbmdzUmVjb3JkUHJvdmlkZXI7XG5cdHByaXZhdGUgX2ZpbHRlcjogc3RyaW5nID0gJyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYWlTZXR0aW5nc1NlYXJjaFNlcnZpY2U6IElBaVNldHRpbmdzU2VhcmNoU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLl9yZWNvcmRQcm92aWRlciA9IG5ldyBTZXR0aW5nc1JlY29yZFByb3ZpZGVyKCk7XG5cdH1cblxuXHRzZXRGaWx0ZXIoZmlsdGVyOiBzdHJpbmcpIHtcblx0XHR0aGlzLl9maWx0ZXIgPSBjbGVhbkZpbHRlcihmaWx0ZXIpO1xuXHR9XG5cblx0YXN5bmMgc2VhcmNoTW9kZWwocHJlZmVyZW5jZXNNb2RlbDogSVNldHRpbmdzRWRpdG9yTW9kZWwsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNlYXJjaFJlc3VsdCB8IG51bGw+IHtcblx0XHRpZiAoIXRoaXMuX2ZpbHRlciB8fCAhdGhpcy5fYWlTZXR0aW5nc1NlYXJjaFNlcnZpY2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlY29yZFByb3ZpZGVyLnVwZGF0ZU1vZGVsKHByZWZlcmVuY2VzTW9kZWwpO1xuXHRcdHRoaXMuX2FpU2V0dGluZ3NTZWFyY2hTZXJ2aWNlLnN0YXJ0U2VhcmNoKHRoaXMuX2ZpbHRlciwgdG9rZW4pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGZpbHRlck1hdGNoZXM6IGF3YWl0IHRoaXMuZ2V0RW1iZWRkaW5nc0l0ZW1zKHRva2VuKSxcblx0XHRcdGV4YWN0TWF0Y2g6IGZhbHNlXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0RW1iZWRkaW5nc0l0ZW1zKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNldHRpbmdNYXRjaFtdPiB7XG5cdFx0Y29uc3Qgc2V0dGluZ3NSZWNvcmQgPSB0aGlzLl9yZWNvcmRQcm92aWRlci5nZXRTZXR0aW5nc1JlY29yZCgpO1xuXHRcdGNvbnN0IGZpbHRlck1hdGNoZXM6IElTZXR0aW5nTWF0Y2hbXSA9IFtdO1xuXHRcdGNvbnN0IHNldHRpbmdzID0gYXdhaXQgdGhpcy5fYWlTZXR0aW5nc1NlYXJjaFNlcnZpY2UuZ2V0RW1iZWRkaW5nc1Jlc3VsdHModGhpcy5fZmlsdGVyLCB0b2tlbik7XG5cdFx0aWYgKCFzZXR0aW5ncykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3ZpZGVyTmFtZSA9IEVNQkVERElOR1NfU0VBUkNIX1BST1ZJREVSX05BTUU7XG5cdFx0Zm9yIChjb25zdCBzZXR0aW5nS2V5IG9mIHNldHRpbmdzKSB7XG5cdFx0XHRpZiAoZmlsdGVyTWF0Y2hlcy5sZW5ndGggPT09IEVtYmVkZGluZ3NTZWFyY2hQcm92aWRlci5FTUJFRERJTkdTX1NFVFRJTkdTX1NFQVJDSF9NQVhfUElDS1MpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRmaWx0ZXJNYXRjaGVzLnB1c2goe1xuXHRcdFx0XHRzZXR0aW5nOiBzZXR0aW5nc1JlY29yZFtzZXR0aW5nS2V5XSxcblx0XHRcdFx0bWF0Y2hlczogW3NldHRpbmdzUmVjb3JkW3NldHRpbmdLZXldLnJhbmdlXSxcblx0XHRcdFx0bWF0Y2hUeXBlOiBTZXR0aW5nTWF0Y2hUeXBlLlJlbW90ZU1hdGNoLFxuXHRcdFx0XHRrZXlNYXRjaFNjb3JlOiAwLFxuXHRcdFx0XHRzY29yZTogMCwgLy8gdGhlIHJlc3VsdHMgYXJlIHNvcnRlZCB1cHN0cmVhbS5cblx0XHRcdFx0cHJvdmlkZXJOYW1lXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmlsdGVyTWF0Y2hlcztcblx0fVxufVxuXG5jbGFzcyBUZklkZlNlYXJjaFByb3ZpZGVyIGltcGxlbWVudHMgSVJlbW90ZVNlYXJjaFByb3ZpZGVyIHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVEZfSURGX1BSRV9OT1JNQUxJWkVfVEhSRVNIT0xEID0gNTA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFRGX0lERl9QT1NUX05PUk1BTElaRV9USFJFU0hPTEQgPSAwLjc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFRGX0lERl9NQVhfUElDS1MgPSA1O1xuXG5cdHByaXZhdGUgX2N1cnJlbnRQcmVmZXJlbmNlc01vZGVsOiBJU2V0dGluZ3NFZGl0b3JNb2RlbCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZmlsdGVyOiBzdHJpbmcgPSAnJztcblx0cHJpdmF0ZSBfZG9jdW1lbnRzOiBUZklkZkRvY3VtZW50W10gPSBbXTtcblx0cHJpdmF0ZSBfc2V0dGluZ3NSZWNvcmQ6IElTdHJpbmdEaWN0aW9uYXJ5PElTZXR0aW5nPiA9IHt9O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHR9XG5cblx0c2V0RmlsdGVyKGZpbHRlcjogc3RyaW5nKSB7XG5cdFx0dGhpcy5fZmlsdGVyID0gY2xlYW5GaWx0ZXIoZmlsdGVyKTtcblx0fVxuXG5cdGtleVRvTGFiZWwoc2V0dGluZ0lkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGxhYmVsID0gc2V0dGluZ0lkXG5cdFx0XHQucmVwbGFjZSgvWy0uX10vZywgJyAnKVxuXHRcdFx0LnJlcGxhY2UoLyhbYS16XSspKFtBLVpdKS9nLCAnJDEgJDInKVxuXHRcdFx0LnJlcGxhY2UoLyhbQS1aYS16XSspKFxcZCspL2csICckMSAkMicpXG5cdFx0XHQucmVwbGFjZSgvKFxcZCspKFtBLVphLXpdKykvZywgJyQxICQyJylcblx0XHRcdC50b0xvd2VyQ2FzZSgpO1xuXHRcdHJldHVybiBsYWJlbDtcblx0fVxuXG5cdHNldHRpbmdJdGVtVG9FbWJlZGRpbmdTdHJpbmcoaXRlbTogSVNldHRpbmcpOiBzdHJpbmcge1xuXHRcdGxldCByZXN1bHQgPSBgU2V0dGluZyBJZDogJHtpdGVtLmtleX1cXG5gO1xuXHRcdHJlc3VsdCArPSBgTGFiZWw6ICR7dGhpcy5rZXlUb0xhYmVsKGl0ZW0ua2V5KX1cXG5gO1xuXHRcdHJlc3VsdCArPSBgRGVzY3JpcHRpb246ICR7aXRlbS5kZXNjcmlwdGlvbn1cXG5gO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhc3luYyBzZWFyY2hNb2RlbChwcmVmZXJlbmNlc01vZGVsOiBJU2V0dGluZ3NFZGl0b3JNb2RlbCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2VhcmNoUmVzdWx0IHwgbnVsbD4ge1xuXHRcdGlmICghdGhpcy5fZmlsdGVyKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fY3VycmVudFByZWZlcmVuY2VzTW9kZWwgIT09IHByZWZlcmVuY2VzTW9kZWwpIHtcblx0XHRcdC8vIFJlZnJlc2ggdGhlIGRvY3VtZW50cyBhbmQgc2V0dGluZ3MgcmVjb3JkXG5cdFx0XHR0aGlzLl9jdXJyZW50UHJlZmVyZW5jZXNNb2RlbCA9IHByZWZlcmVuY2VzTW9kZWw7XG5cdFx0XHR0aGlzLl9kb2N1bWVudHMgPSBbXTtcblx0XHRcdHRoaXMuX3NldHRpbmdzUmVjb3JkID0ge307XG5cdFx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHByZWZlcmVuY2VzTW9kZWwuc2V0dGluZ3NHcm91cHMpIHtcblx0XHRcdFx0aWYgKGdyb3VwLmlkID09PSAnbW9zdENvbW1vbmx5VXNlZCcpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IHNlY3Rpb24gb2YgZ3JvdXAuc2VjdGlvbnMpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmcgb2Ygc2VjdGlvbi5zZXR0aW5ncykge1xuXHRcdFx0XHRcdFx0dGhpcy5fZG9jdW1lbnRzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRrZXk6IHNldHRpbmcua2V5LFxuXHRcdFx0XHRcdFx0XHR0ZXh0Q2h1bmtzOiBbdGhpcy5zZXR0aW5nSXRlbVRvRW1iZWRkaW5nU3RyaW5nKHNldHRpbmcpXVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR0aGlzLl9zZXR0aW5nc1JlY29yZFtzZXR0aW5nLmtleV0gPSBzZXR0aW5nO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRmaWx0ZXJNYXRjaGVzOiBhd2FpdCB0aGlzLmdldFRmSWRmSXRlbXModG9rZW4pLFxuXHRcdFx0ZXhhY3RNYXRjaDogZmFsc2Vcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRUZklkZkl0ZW1zKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNldHRpbmdNYXRjaFtdPiB7XG5cdFx0Y29uc3QgZmlsdGVyTWF0Y2hlczogSVNldHRpbmdNYXRjaFtdID0gW107XG5cdFx0Y29uc3QgdGZJZGZDYWxjdWxhdG9yID0gbmV3IFRmSWRmQ2FsY3VsYXRvcigpO1xuXHRcdHRmSWRmQ2FsY3VsYXRvci51cGRhdGVEb2N1bWVudHModGhpcy5fZG9jdW1lbnRzKTtcblx0XHRjb25zdCB0ZklkZlJhbmtpbmdzID0gdGZJZGZDYWxjdWxhdG9yLmNhbGN1bGF0ZVNjb3Jlcyh0aGlzLl9maWx0ZXIsIHRva2VuKTtcblx0XHR0ZklkZlJhbmtpbmdzLnNvcnQoKGEsIGIpID0+IGIuc2NvcmUgLSBhLnNjb3JlKTtcblx0XHRjb25zdCBtYXhTY29yZSA9IHRmSWRmUmFua2luZ3NbMF0uc2NvcmU7XG5cblx0XHRpZiAobWF4U2NvcmUgPCBUZklkZlNlYXJjaFByb3ZpZGVyLlRGX0lERl9QUkVfTk9STUFMSVpFX1RIUkVTSE9MRCkge1xuXHRcdFx0Ly8gUmVqZWN0IGFsbCB0aGUgbWF0Y2hlcy5cblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGluZm8gb2YgdGZJZGZSYW5raW5ncykge1xuXHRcdFx0aWYgKGluZm8uc2NvcmUgLyBtYXhTY29yZSA8IFRmSWRmU2VhcmNoUHJvdmlkZXIuVEZfSURGX1BPU1RfTk9STUFMSVpFX1RIUkVTSE9MRCB8fCBmaWx0ZXJNYXRjaGVzLmxlbmd0aCA9PT0gVGZJZGZTZWFyY2hQcm92aWRlci5URl9JREZfTUFYX1BJQ0tTKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcGljayA9IGluZm8ua2V5O1xuXHRcdFx0ZmlsdGVyTWF0Y2hlcy5wdXNoKHtcblx0XHRcdFx0c2V0dGluZzogdGhpcy5fc2V0dGluZ3NSZWNvcmRbcGlja10sXG5cdFx0XHRcdG1hdGNoZXM6IFt0aGlzLl9zZXR0aW5nc1JlY29yZFtwaWNrXS5yYW5nZV0sXG5cdFx0XHRcdG1hdGNoVHlwZTogU2V0dGluZ01hdGNoVHlwZS5SZW1vdGVNYXRjaCxcblx0XHRcdFx0a2V5TWF0Y2hTY29yZTogMCxcblx0XHRcdFx0c2NvcmU6IGluZm8uc2NvcmUsXG5cdFx0XHRcdHByb3ZpZGVyTmFtZTogVEZfSURGX1NFQVJDSF9QUk9WSURFUl9OQU1FXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmlsdGVyTWF0Y2hlcztcblx0fVxufVxuXG5jbGFzcyBSZW1vdGVTZWFyY2hQcm92aWRlciBpbXBsZW1lbnRzIElSZW1vdGVTZWFyY2hQcm92aWRlciB7XG5cdHByaXZhdGUgX3RmSWRmU2VhcmNoUHJvdmlkZXI6IFRmSWRmU2VhcmNoUHJvdmlkZXI7XG5cdHByaXZhdGUgX2ZpbHRlcjogc3RyaW5nID0gJyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5fdGZJZGZTZWFyY2hQcm92aWRlciA9IG5ldyBUZklkZlNlYXJjaFByb3ZpZGVyKCk7XG5cdH1cblxuXHRzZXRGaWx0ZXIoZmlsdGVyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9maWx0ZXIgPSBmaWx0ZXI7XG5cdFx0dGhpcy5fdGZJZGZTZWFyY2hQcm92aWRlci5zZXRGaWx0ZXIoZmlsdGVyKTtcblx0fVxuXG5cdGFzeW5jIHNlYXJjaE1vZGVsKHByZWZlcmVuY2VzTW9kZWw6IElTZXR0aW5nc0VkaXRvck1vZGVsLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTZWFyY2hSZXN1bHQgfCBudWxsPiB7XG5cdFx0aWYgKCF0aGlzLl9maWx0ZXIpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLl90ZklkZlNlYXJjaFByb3ZpZGVyLnNlYXJjaE1vZGVsKHByZWZlcmVuY2VzTW9kZWwsIHRva2VuKTtcblx0XHRyZXR1cm4gcmVzdWx0cztcblx0fVxufVxuXG5jbGFzcyBBaVNlYXJjaFByb3ZpZGVyIGltcGxlbWVudHMgSUFpU2VhcmNoUHJvdmlkZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lbWJlZGRpbmdzU2VhcmNoUHJvdmlkZXI6IEVtYmVkZGluZ3NTZWFyY2hQcm92aWRlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVjb3JkUHJvdmlkZXI6IFNldHRpbmdzUmVjb3JkUHJvdmlkZXI7XG5cdHByaXZhdGUgX2ZpbHRlcjogc3RyaW5nID0gJyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBaVNldHRpbmdzU2VhcmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFpU2V0dGluZ3NTZWFyY2hTZXJ2aWNlOiBJQWlTZXR0aW5nc1NlYXJjaFNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5fZW1iZWRkaW5nc1NlYXJjaFByb3ZpZGVyID0gbmV3IEVtYmVkZGluZ3NTZWFyY2hQcm92aWRlcih0aGlzLmFpU2V0dGluZ3NTZWFyY2hTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWNvcmRQcm92aWRlciA9IG5ldyBTZXR0aW5nc1JlY29yZFByb3ZpZGVyKCk7XG5cdH1cblxuXHRzZXRGaWx0ZXIoZmlsdGVyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9maWx0ZXIgPSBmaWx0ZXI7XG5cdFx0dGhpcy5fZW1iZWRkaW5nc1NlYXJjaFByb3ZpZGVyLnNldEZpbHRlcihmaWx0ZXIpO1xuXHR9XG5cblx0YXN5bmMgc2VhcmNoTW9kZWwocHJlZmVyZW5jZXNNb2RlbDogSVNldHRpbmdzRWRpdG9yTW9kZWwsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNlYXJjaFJlc3VsdCB8IG51bGw+IHtcblx0XHRpZiAoIXRoaXMuX2ZpbHRlciB8fCAhdGhpcy5haVNldHRpbmdzU2VhcmNoU2VydmljZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVjb3JkUHJvdmlkZXIudXBkYXRlTW9kZWwocHJlZmVyZW5jZXNNb2RlbCk7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuX2VtYmVkZGluZ3NTZWFyY2hQcm92aWRlci5zZWFyY2hNb2RlbChwcmVmZXJlbmNlc01vZGVsLCB0b2tlbik7XG5cdFx0cmV0dXJuIHJlc3VsdHM7XG5cdH1cblxuXHRhc3luYyBnZXRMTE1SYW5rZWRSZXN1bHRzKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNlYXJjaFJlc3VsdCB8IG51bGw+IHtcblx0XHRpZiAoIXRoaXMuX2ZpbHRlciB8fCAhdGhpcy5haVNldHRpbmdzU2VhcmNoU2VydmljZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCB0aGlzLmdldExMTVJhbmtlZEl0ZW1zKHRva2VuKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZmlsdGVyTWF0Y2hlczogaXRlbXMsXG5cdFx0XHRleGFjdE1hdGNoOiBmYWxzZVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldExMTVJhbmtlZEl0ZW1zKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNldHRpbmdNYXRjaFtdPiB7XG5cdFx0Y29uc3Qgc2V0dGluZ3NSZWNvcmQgPSB0aGlzLl9yZWNvcmRQcm92aWRlci5nZXRTZXR0aW5nc1JlY29yZCgpO1xuXHRcdGNvbnN0IGZpbHRlck1hdGNoZXM6IElTZXR0aW5nTWF0Y2hbXSA9IFtdO1xuXHRcdGNvbnN0IHNldHRpbmdzID0gYXdhaXQgdGhpcy5haVNldHRpbmdzU2VhcmNoU2VydmljZS5nZXRMTE1SYW5rZWRSZXN1bHRzKHRoaXMuX2ZpbHRlciwgdG9rZW4pO1xuXHRcdGlmICghc2V0dGluZ3MpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHNldHRpbmdLZXkgb2Ygc2V0dGluZ3MpIHtcblx0XHRcdGlmICghc2V0dGluZ3NSZWNvcmRbc2V0dGluZ0tleV0pIHtcblx0XHRcdFx0Ly8gTm9uLWV4aXN0ZW50IHNldHRpbmcuXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0ZmlsdGVyTWF0Y2hlcy5wdXNoKHtcblx0XHRcdFx0c2V0dGluZzogc2V0dGluZ3NSZWNvcmRbc2V0dGluZ0tleV0sXG5cdFx0XHRcdG1hdGNoZXM6IFtzZXR0aW5nc1JlY29yZFtzZXR0aW5nS2V5XS5yYW5nZV0sXG5cdFx0XHRcdG1hdGNoVHlwZTogU2V0dGluZ01hdGNoVHlwZS5SZW1vdGVNYXRjaCxcblx0XHRcdFx0a2V5TWF0Y2hTY29yZTogMCxcblx0XHRcdFx0c2NvcmU6IDAsIC8vIHRoZSByZXN1bHRzIGFyZSBzb3J0ZWQgdXBzdHJlYW0uXG5cdFx0XHRcdHByb3ZpZGVyTmFtZTogTExNX1JBTktFRF9TRUFSQ0hfUFJPVklERVJfTkFNRVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZpbHRlck1hdGNoZXM7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVByZWZlcmVuY2VzU2VhcmNoU2VydmljZSwgUHJlZmVyZW5jZXNTZWFyY2hTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFHekIsU0FBaUIsZ0NBQWdDLDRCQUE0QixrQkFBa0Isb0JBQW9CO0FBQ25ILFNBQVMsa0JBQWtCO0FBQzNCLFlBQVksYUFBYTtBQUN6QixTQUFTLHVCQUFzQztBQUUvQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBc0gsc0JBQXNCLHdCQUF3QjtBQUNwSyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGlDQUFvRCwyQkFBb0csaUNBQWlDLG1DQUFtQyxtQ0FBbUM7QUFPalEsSUFBTSwyQkFBTixjQUF1QyxXQUFnRDtBQUFBLEVBTTdGLFlBQ3lDLHNCQUNBLHNCQUN2QztBQUNELFVBQU07QUFIa0M7QUFDQTtBQUFBLEVBR3pDO0FBQUEsRUFFQSx1QkFBdUIsUUFBcUM7QUFDM0QsV0FBTyxLQUFLLHFCQUFxQixlQUFlLHFCQUFxQixNQUFNO0FBQUEsRUFDNUU7QUFBQSxFQUVBLElBQVksc0JBQStCO0FBQzFDLFVBQU0sb0JBQW9CLEtBQUsscUJBQXFCLFNBQTBDLEVBQUUsVUFBVTtBQUMxRyxXQUFPLGtCQUFrQjtBQUFBLEVBQzFCO0FBQUEsRUFFQSx3QkFBd0IsUUFBbUQ7QUFDMUUsUUFBSSxDQUFDLEtBQUsscUJBQXFCO0FBQzlCLGFBQU87QUFBQSxJQUNSO0FBRUEsU0FBSywwQkFBMEIsS0FBSyxxQkFBcUIsZUFBZSxvQkFBb0I7QUFDNUYsU0FBSyxzQkFBc0IsVUFBVSxNQUFNO0FBQzNDLFdBQU8sS0FBSztBQUFB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
