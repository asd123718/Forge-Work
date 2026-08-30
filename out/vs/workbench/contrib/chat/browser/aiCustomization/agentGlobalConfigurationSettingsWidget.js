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
import "./media/agentGlobalConfigurationSettings.css";
import * as DOM from "../../../../../base/browser/dom.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { SelectBox } from "../../../../../base/browser/ui/selectBox/selectBox.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { readAgentCustomizationSettings } from "../../../../../platform/agentHost/common/agentCustomizationSettings.js";
import { discoversCodexLocalModels, getCodexModelCatalogEntry, isOllamaCatalog } from "../../../../../platform/agentHost/common/codexModelsConfig.js";
import { FORGE_DISPLAY_LANGUAGE_STORAGE_KEY, FORGE_LANGUAGE_PACK_EXTENSION_ID, forgeLocalize, getForgeDisplayLanguage, setForgeDisplayLanguageOverride } from "../../../../../platform/agentHost/common/forgeLocale.js";
import { ollamaTagsUrl, parseOllamaTagsJson, uniqueModelNames } from "../../../../../platform/native/common/ollamaList.js";
import { IContextViewService } from "../../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { Link } from "../../../../../platform/opener/browser/link.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { asJson, IRequestService, NO_FETCH_TELEMETRY } from "../../../../../platform/request/common/request.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { defaultButtonStyles, defaultSelectBoxStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { ILocaleService } from "../../../../services/localization/common/locale.js";
import { AgentModelsSettings } from "./agentModelsSettings.js";
let AHPAgentSettingsWidget = class extends Disposable {
  constructor(parent, agentProvider, target, mode = "all", contextViewService, notificationService, editorService, hoverService, openerService, storageService, localeService, requestService) {
    super();
    this.agentProvider = agentProvider;
    this.mode = mode;
    this.contextViewService = contextViewService;
    this.notificationService = notificationService;
    this.editorService = editorService;
    this.hoverService = hoverService;
    this.openerService = openerService;
    this.storageService = storageService;
    this.localeService = localeService;
    this.requestService = requestService;
    this.renderDisposables = this._register(new DisposableStore());
    this.targetListener = this._register(new MutableDisposable());
    const stored = this.storageService.get(FORGE_DISPLAY_LANGUAGE_STORAGE_KEY, StorageScope.APPLICATION);
    if (stored === "en" || stored === "zh-cn") {
      setForgeDisplayLanguageOverride(stored);
    }
    this.container = DOM.append(parent, DOM.$(".agent-global-configuration-settings"));
    this._register(autorun((reader) => this.connect(target.read(reader))));
  }
  layout() {
    this.container.classList.toggle("narrow", this.container.clientWidth < 560);
  }
  focus() {
    this.focusTarget?.();
  }
  connect(target) {
    if (this.target === target && target) {
      return;
    }
    this.target = target;
    this.targetListener.value = target?.onDidChange(() => this.render());
    this.render();
  }
  render() {
    this.renderDisposables.clear();
    DOM.clearNode(this.container);
    this.focusTarget = void 0;
    const state = this.target?.getState();
    const descriptor = readAgentCustomizationSettings(state, this.agentProvider);
    if (!state?.config || !descriptor) {
      DOM.append(this.container, DOM.$(".agent-global-configuration-settings-status")).textContent = forgeLocalize("agentSettings.unavailable", "These harness settings are not available from the connected agent host.", "\u5F53\u524D\u65E0\u6CD5\u4ECE\u5DF2\u8FDE\u63A5\u7684 Agent Host \u8BFB\u53D6\u8FD9\u4E9B\u8BBE\u7F6E\u3002");
      return;
    }
    const settings = descriptor.settings.filter((setting) => this.mode === "all" || this.mode === "models" === (setting.kind === "models"));
    const content = DOM.append(this.container, DOM.$(this.mode === "models" ? ".agent-global-configuration-settings-content.agent-global-configuration-settings-models-content" : ".agent-global-configuration-settings-content"));
    DOM.append(content, DOM.$("h1")).textContent = this.mode === "models" ? forgeLocalize("agentSettings.models.title", "Models", "\u6A21\u578B") : forgeLocalize("codex.configuration.title", "Codex", "Codex");
    DOM.append(content, DOM.$("p.agent-global-configuration-settings-intro")).textContent = this.mode === "models" ? forgeLocalize("agentSettings.models.description", "Configure the model providers Codex can use, including cloud APIs and local Ollama servers.", "\u914D\u7F6E Codex \u53EF\u4F7F\u7528\u7684\u6A21\u578B\u63D0\u4F9B\u5546\uFF0C\u5305\u62EC\u4E91\u7AEF API \u548C\u672C\u5730 Ollama\u3002") : forgeLocalize("codex.configuration.description", "Set agent permissions, personality, and other Codex defaults stored in config.toml. Project and managed configuration can override these user values.", "\u8BBE\u7F6E Agent \u6743\u9650\u3001\u4E2A\u6027\u548C\u5176\u4ED6\u5199\u5165 config.toml \u7684 Codex \u9ED8\u8BA4\u503C\u3002\u9879\u76EE\u7EA7\u548C\u7BA1\u7406\u914D\u7F6E\u53EF\u4EE5\u8986\u76D6\u8FD9\u4E9B\u7528\u6237\u8BBE\u7F6E\u3002");
    for (const group of new Set(settings.map((setting) => setting.group))) {
      const section = DOM.append(content, DOM.$(this.mode === "models" ? ".agent-global-configuration-settings-section.agent-global-configuration-settings-models-section" : ".agent-global-configuration-settings-section"));
      if (this.mode !== "models") {
        DOM.append(section, DOM.$("h2")).textContent = translateCodexGroup(group);
        if (settings.some((setting) => setting.group === group && setting.kind === "permissions")) {
          DOM.append(section, DOM.$("p.agent-global-configuration-settings-section-description")).textContent = forgeLocalize(
            "codex.configuration.permissions.sectionDescription",
            "This is the default for new chats. Change the Permissions control in the chat input to apply it to the current conversation. Default asks before deleting files; Full Access does not.",
            "\u8FD9\u662F\u65B0\u5BF9\u8BDD\u7684\u9ED8\u8BA4\u6743\u9650\u3002\u5F53\u524D\u5BF9\u8BDD\u8BF7\u5728\u8F93\u5165\u6846\u7684\u300C\u6743\u9650\u300D\u63A7\u4EF6\u4E2D\u4FEE\u6539\u3002\u9ED8\u8BA4\u4F1A\u5728\u5220\u9664\u6587\u4EF6\u524D\u8BE2\u95EE\uFF1B\u5B8C\u5168\u8BBF\u95EE\u5219\u4E0D\u4F1A\u3002"
          );
        }
      }
      const card = DOM.append(section, DOM.$(".agent-global-configuration-settings-card"));
      for (const setting of settings.filter((setting2) => setting2.group === group)) {
        const schema = state.config.schema.properties[setting.key];
        if (schema) {
          this.renderSetting(card, descriptor, setting.key, setting.kind, setting.saveLabel, schema, state.config.values[setting.key]);
        }
      }
    }
    if (this.mode !== "models") {
      this.renderAppearance(content);
    }
    if (this.mode !== "harness") {
      this.renderConfigurationFile(content, descriptor);
    }
  }
  renderSetting(parent, _descriptor, key, kind, saveLabel, schema, value) {
    if (kind === "models") {
      this.renderModelsSetting(parent, schema, value, key);
      return;
    }
    if (kind === "permissions") {
      this.renderPermissionsSetting(parent, schema, value, key);
      return;
    }
    const row = DOM.append(parent, DOM.$(".agent-global-configuration-settings-row"));
    const labels = DOM.append(row, DOM.$(".agent-global-configuration-settings-labels"));
    DOM.append(labels, DOM.$(".agent-global-configuration-settings-label")).textContent = translateCodexSchemaTitle(key, schema.title);
    if (schema.description) {
      DOM.append(labels, DOM.$(".agent-global-configuration-settings-description")).textContent = translateCodexSchemaDescription(key, schema.description);
    }
    if (kind === "multiline") {
      row.classList.add("agent-global-configuration-settings-text-row");
      const input = DOM.append(row, DOM.$("textarea.agent-global-configuration-settings-text"));
      input.ariaLabel = schema.title;
      input.value = typeof value === "string" ? value : "";
      this.focusTarget ??= () => input.focus();
      const actions = DOM.append(row, DOM.$(".agent-global-configuration-settings-actions"));
      const button = this.renderDisposables.add(new Button(actions, { ...defaultButtonStyles, secondary: true }));
      button.label = saveLabel ?? forgeLocalize("agentSettings.save", "Save", "\u4FDD\u5B58");
      this.renderDisposables.add(button.onDidClick(() => void this.save(key, input.value.trim())));
      return;
    }
    const options = schema.enum?.map((option, index) => ({ text: translateCodexEnumLabel(key, String(option), schema.enumLabels?.[index] ?? String(option)) })) ?? [];
    const selected = Math.max(0, schema.enum?.findIndex((option) => option === value) ?? 0);
    const selectContainer = DOM.append(row, DOM.$(".agent-global-configuration-settings-select"));
    const select = this.renderDisposables.add(new SelectBox(options, selected, this.contextViewService, { ...defaultSelectBoxStyles }, { ariaLabel: schema.title }));
    select.render(selectContainer);
    this.focusTarget ??= () => select.focus();
    this.renderDisposables.add(select.onDidSelect((event) => void this.save(key, schema.enum?.[event.index])));
  }
  renderAppearance(parent) {
    const section = DOM.append(parent, DOM.$(".agent-global-configuration-settings-section"));
    DOM.append(section, DOM.$("h2")).textContent = forgeLocalize("codex.configuration.appearance", "Appearance", "\u5916\u89C2");
    const card = DOM.append(section, DOM.$(".agent-global-configuration-settings-card"));
    const row = DOM.append(card, DOM.$(".agent-global-configuration-settings-row"));
    const labels = DOM.append(row, DOM.$(".agent-global-configuration-settings-labels"));
    DOM.append(labels, DOM.$(".agent-global-configuration-settings-label")).textContent = forgeLocalize("codex.configuration.language", "Language", "\u8BED\u8A00");
    DOM.append(labels, DOM.$(".agent-global-configuration-settings-description")).textContent = forgeLocalize("codex.configuration.language.description", "Switch Codex settings between English and Chinese. Restart to apply the language pack to the rest of Forge.", "\u5728\u4E2D\u82F1\u6587\u4E4B\u95F4\u5207\u6362 Codex \u8BBE\u7F6E\u3002\u91CD\u542F\u540E\u8BED\u8A00\u5305\u4F1A\u5E94\u7528\u5230 Forge \u7684\u5176\u4F59\u754C\u9762\u3002");
    const options = [
      { id: "en", text: "English" },
      { id: "zh-cn", text: "\u4E2D\u6587" }
    ];
    const selected = Math.max(0, options.findIndex((option) => option.id === getForgeDisplayLanguage()));
    const selectContainer = DOM.append(row, DOM.$(".agent-global-configuration-settings-select"));
    const select = this.renderDisposables.add(new SelectBox(options.map((option) => ({ text: option.text })), selected, this.contextViewService, { ...defaultSelectBoxStyles }, { ariaLabel: forgeLocalize("codex.configuration.language", "Language", "\u8BED\u8A00") }));
    select.render(selectContainer);
    this.renderDisposables.add(select.onDidSelect((event) => void this.applyDisplayLanguage(options[event.index].id)));
  }
  async applyDisplayLanguage(locale) {
    setForgeDisplayLanguageOverride(locale);
    this.storageService.store(FORGE_DISPLAY_LANGUAGE_STORAGE_KEY, locale, StorageScope.APPLICATION, StorageTarget.MACHINE);
    this.render();
    try {
      if (locale === "en") {
        await this.localeService.clearLocalePreference();
      } else {
        await this.localeService.setLocale({
          id: "zh-cn",
          label: "\u4E2D\u6587(\u7B80\u4F53)",
          extensionId: FORGE_LANGUAGE_PACK_EXTENSION_ID
        });
      }
    } catch (error) {
      this.notificationService.error(error);
    }
  }
  async save(key, value) {
    try {
      await this.target?.setValue(key, value);
    } catch (error) {
      this.notificationService.error(error);
    }
  }
  renderPermissionsSetting(parent, schema, value, key) {
    parent.classList.add("agent-global-configuration-settings-permissions-card");
    const current = typeof value === "string" ? value : "default";
    const list = DOM.append(parent, DOM.$(".agent-global-configuration-settings-permissions"));
    const options = schema.enum ?? ["default", "auto-review", "full-access"];
    for (let index = 0; index < options.length; index++) {
      const option = String(options[index]);
      const button = DOM.append(list, DOM.$("button.agent-global-configuration-settings-permission"));
      button.type = "button";
      button.classList.toggle("selected", option === current);
      button.classList.toggle("danger", option === "full-access");
      button.setAttribute("aria-pressed", option === current ? "true" : "false");
      button.setAttribute("aria-label", translateCodexEnumLabel(key, option, schema.enumLabels?.[index] ?? option));
      DOM.append(button, DOM.$(".agent-global-configuration-settings-permission-title")).textContent = translateCodexEnumLabel(key, option, schema.enumLabels?.[index] ?? option);
      const description = translateCodexEnumDescription(key, option, schema.enumDescriptions?.[index] ?? "");
      if (description) {
        DOM.append(button, DOM.$(".agent-global-configuration-settings-permission-description")).textContent = description;
      }
      this.focusTarget ??= () => button.focus();
      this.renderDisposables.add(DOM.addDisposableListener(button, "click", () => {
        if (option !== current) {
          void this.save(key, option);
        }
      }));
    }
  }
  renderModelsSetting(parent, schema, value, key) {
    parent.classList.add("agent-global-configuration-settings-models-card");
    const container = DOM.append(parent, DOM.$(".agent-global-configuration-settings-models"));
    if (this.mode !== "models") {
      const header = DOM.append(container, DOM.$(".agent-global-configuration-settings-row"));
      const labels = DOM.append(header, DOM.$(".agent-global-configuration-settings-labels"));
      DOM.append(labels, DOM.$(".agent-global-configuration-settings-label")).textContent = translateCodexSchemaTitle(key, schema.title);
      if (schema.description) {
        DOM.append(labels, DOM.$(".agent-global-configuration-settings-description")).textContent = translateCodexSchemaDescription(key, schema.description);
      }
    }
    const editor = this.renderDisposables.add(new AgentModelsSettings(
      container,
      value,
      (next) => this.save(key, next),
      (providerId) => this.target?.getModelProviderApiKey?.(providerId),
      (providerId, apiKey) => this.target?.setModelProviderApiKey?.(providerId, apiKey),
      this.contextViewService,
      (catalogId, baseUrl) => this.listLocalProviderModels(catalogId, baseUrl)
    ));
    this.focusTarget ??= () => editor.focus();
  }
  renderConfigurationFile(parent, descriptor) {
    const file = descriptor.configurationFile;
    if (!file) {
      return;
    }
    const section = DOM.append(parent, DOM.$(".agent-global-configuration-settings-section"));
    DOM.append(section, DOM.$("h2")).textContent = forgeLocalize("codex.configuration.file.title", "Advanced configuration", "\u9AD8\u7EA7\u914D\u7F6E");
    DOM.append(section, DOM.$("p.agent-global-configuration-settings-section-description")).textContent = forgeLocalize("codex.configuration.file.description", "Open the Codex configuration file to customize additional agent behavior.", "\u6253\u5F00 Codex \u914D\u7F6E\u6587\u4EF6\u4EE5\u81EA\u5B9A\u4E49\u66F4\u591A\u4EE3\u7406\u884C\u4E3A\u3002");
    if (file.documentationUrl && file.documentationLabel) {
      this.renderDisposables.add(new Link(section, { label: forgeLocalize("codex.configuration.file.docs", "Codex configuration documentation", "Codex \u914D\u7F6E\u6587\u6863"), href: file.documentationUrl }, {}, this.hoverService, this.openerService));
    }
    const button = this.renderDisposables.add(new Button(section, { ...defaultButtonStyles, secondary: true }));
    button.label = forgeLocalize("codex.configuration.file.open", "Open config.toml", "\u6253\u5F00 config.toml");
    this.renderDisposables.add(button.onDidClick(() => this.editorService.openEditor({ resource: this.target?.mapResource(URI.parse(file.resource)) ?? URI.parse(file.resource), options: { pinned: true } })));
  }
  async listLocalProviderModels(catalogId, baseUrl) {
    if (!discoversCodexLocalModels(catalogId)) {
      return [];
    }
    const collected = /* @__PURE__ */ new Set();
    const add = (names) => {
      for (const name of names ?? []) {
        const trimmed = name.trim();
        if (trimmed) {
          collected.add(trimmed);
        }
      }
    };
    const native = this.listNativeModels(catalogId, baseUrl);
    const http = Promise.all([
      this.discoverLocalModels(catalogId, baseUrl),
      isOllamaCatalog(catalogId) ? this.discoverLocalModels(catalogId, "http://127.0.0.1:11434/v1") : Promise.resolve([]),
      isOllamaCatalog(catalogId) ? this.discoverLocalModels(catalogId, "http://localhost:11434/v1") : Promise.resolve([])
    ]);
    const [fromNative, fromHttp] = await Promise.all([native, http]);
    add(fromNative);
    for (const names of fromHttp) {
      add(names);
    }
    return [...collected];
  }
  async listNativeModels(catalogId, baseUrl) {
    try {
      return await Promise.race([
        this.target?.discoverLocalModels?.(catalogId, baseUrl) ?? Promise.resolve([]),
        new Promise((resolve) => setTimeout(() => resolve([]), 4e3))
      ]);
    } catch {
      return [];
    }
  }
  async discoverLocalModels(catalogId, baseUrl) {
    const catalog = getCodexModelCatalogEntry(catalogId);
    const fallback = catalog.defaultBaseUrl || (isOllamaCatalog(catalogId) ? "http://127.0.0.1:11434/v1" : "http://localhost:1234/v1");
    try {
      const url = isOllamaCatalog(catalogId) ? ollamaTagsUrl(baseUrl || fallback) : this.localModelsUrl(catalogId, baseUrl || fallback);
      const context = await this.requestService.request({ type: "GET", url, timeout: 8e3, callSite: NO_FETCH_TELEMETRY }, CancellationToken.None);
      if (context.res.statusCode && context.res.statusCode >= 400) {
        return [];
      }
      const body = await asJson(context);
      if (isOllamaCatalog(catalogId)) {
        return parseOllamaTagsJson(body);
      }
      if (!body) {
        return [];
      }
      const raw = Array.isArray(body) ? body : Array.isArray(body.data) ? body.data : Array.isArray(body.models) ? body.models : [];
      return uniqueModelNames(raw.map((model) => model.model || model.id || model.name || ""));
    } catch {
      return [];
    }
  }
  localModelsUrl(catalogId, baseUrl) {
    const catalog = getCodexModelCatalogEntry(catalogId);
    const url = new URL(baseUrl);
    url.search = "";
    url.hash = "";
    if (catalog.kind === "lmstudio") {
      url.pathname = `${url.pathname.replace(/\/(?:v1|api)\/?$/, "").replace(/\/$/, "")}/api/v0/models`;
    } else if (!/\/models\/?$/.test(url.pathname)) {
      url.pathname = `${url.pathname.replace(/\/$/, "")}/models`;
    }
    return url.toString();
  }
};
AHPAgentSettingsWidget = __decorateClass([
  __decorateParam(4, IContextViewService),
  __decorateParam(5, INotificationService),
  __decorateParam(6, IEditorService),
  __decorateParam(7, IHoverService),
  __decorateParam(8, IOpenerService),
  __decorateParam(9, IStorageService),
  __decorateParam(10, ILocaleService),
  __decorateParam(11, IRequestService)
], AHPAgentSettingsWidget);
function translateCodexGroup(group) {
  switch (group) {
    case "Agent permissions":
      return forgeLocalize("codex.configuration.permissions.group", "Agent permissions", "Agent \u6743\u9650");
    case "Personalization":
      return forgeLocalize("codex.configuration.personalization", "Personalization", "\u4E2A\u6027\u5316");
    case "Review policy":
      return forgeLocalize("codex.configuration.review", "Review policy", "\u5BA1\u67E5\u7B56\u7565");
    case "Models":
      return forgeLocalize("codex.configuration.models.group", "Models", "\u6A21\u578B");
    default:
      return group;
  }
}
function translateCodexSchemaTitle(key, fallback) {
  switch (key) {
    case "codex.permissionsPreset":
      return forgeLocalize("codex.configuration.permissions", "Permissions", "\u6743\u9650");
    case "codex.personality":
      return forgeLocalize("codex.configuration.personality", "Personality", "\u4E2A\u6027");
    case "codex.autoReviewPolicy":
      return forgeLocalize("codex.configuration.autoReviewPolicy", "Auto-review policy", "\u81EA\u52A8\u5BA1\u67E5\u7B56\u7565");
    case "codex.models":
      return forgeLocalize("codex.configuration.models", "Models", "\u6A21\u578B");
    default:
      return fallback;
  }
}
function translateCodexSchemaDescription(key, fallback) {
  switch (key) {
    case "codex.permissionsPreset":
      return forgeLocalize("codex.configuration.permissions.description", "Choose how much Codex can do on its own. Default asks before deleting files, using the internet, or leaving the workspace. Full Access skips those prompts.", "\u9009\u62E9 Codex \u53EF\u4EE5\u81EA\u884C\u5B8C\u6210\u591A\u5C11\u64CD\u4F5C\u3002\u9ED8\u8BA4\u4F1A\u5728\u5220\u9664\u6587\u4EF6\u3001\u8BBF\u95EE\u7F51\u7EDC\u6216\u79BB\u5F00\u5DE5\u4F5C\u533A\u524D\u8BE2\u95EE\u3002\u5B8C\u5168\u8BBF\u95EE\u4F1A\u8DF3\u8FC7\u8FD9\u4E9B\u786E\u8BA4\u3002");
    case "codex.personality":
      return forgeLocalize("codex.configuration.personality.description", "Controls the default communication style for Codex. Default leaves personality unset in config.toml.", "\u63A7\u5236 Codex \u7684\u9ED8\u8BA4\u6C9F\u901A\u98CE\u683C\u3002\u9009\u62E9 Default \u65F6\u4E0D\u4F1A\u5728 config.toml \u4E2D\u5199\u5165 personality\u3002");
    case "codex.autoReviewPolicy":
      return forgeLocalize("codex.configuration.autoReviewPolicy.description", "Updates auto_review.policy in config.toml. Leave empty to remove the auto_review section.", "\u66F4\u65B0 config.toml \u4E2D\u7684 auto_review.policy\u3002\u7559\u7A7A\u5219\u5220\u9664 auto_review \u6BB5\u3002");
    case "codex.models":
      return forgeLocalize("codex.configuration.models.description", "Choose the default model and provider, and add custom model providers such as Ollama or any OpenAI-compatible endpoint.", "\u9009\u62E9\u9ED8\u8BA4\u6A21\u578B\u548C\u63D0\u4F9B\u5546\uFF0C\u5E76\u6DFB\u52A0 Ollama \u6216\u5176\u4ED6 OpenAI \u517C\u5BB9\u63A5\u53E3\u3002");
    default:
      return fallback;
  }
}
function translateCodexEnumLabel(key, option, fallback) {
  if (key === "codex.permissionsPreset") {
    switch (option) {
      case "default":
        return forgeLocalize("codex.configuration.permissions.default", "Default", "\u9ED8\u8BA4");
      case "auto-review":
        return forgeLocalize("codex.configuration.permissions.autoReview", "Auto-Review", "\u81EA\u52A8\u5BA1\u67E5");
      case "full-access":
        return forgeLocalize("codex.configuration.permissions.fullAccess", "Full Access", "\u5B8C\u5168\u8BBF\u95EE");
      default:
        return fallback;
    }
  }
  if (key !== "codex.personality") {
    return fallback;
  }
  switch (option) {
    case "default":
      return forgeLocalize("codex.configuration.personality.default", "Default", "\u9ED8\u8BA4");
    case "friendly":
      return forgeLocalize("codex.configuration.personality.friendly", "Friendly", "\u53CB\u597D");
    case "pragmatic":
      return forgeLocalize("codex.configuration.personality.pragmatic", "Pragmatic", "\u52A1\u5B9E");
    default:
      return fallback;
  }
}
function translateCodexEnumDescription(key, option, fallback) {
  if (key !== "codex.permissionsPreset") {
    return fallback;
  }
  switch (option) {
    case "default":
      return forgeLocalize("codex.configuration.permissions.defaultDescription", "Read and edit files in this workspace and run routine local commands. Codex asks before deleting files, using the internet, or touching paths outside the workspace.", "\u53EF\u4EE5\u8BFB\u53D6\u548C\u7F16\u8F91\u5F53\u524D\u5DE5\u4F5C\u533A\u6587\u4EF6\uFF0C\u5E76\u8FD0\u884C\u5E38\u89C4\u672C\u5730\u547D\u4EE4\u3002\u5220\u9664\u6587\u4EF6\u3001\u8BBF\u95EE\u7F51\u7EDC\u6216\u4FEE\u6539\u5DE5\u4F5C\u533A\u5916\u8DEF\u5F84\u524D\u4F1A\u5148\u8BE2\u95EE\u3002");
    case "auto-review":
      return forgeLocalize("codex.configuration.permissions.autoReviewDescription", "Same workspace access as Default, but approval requests go to the auto-reviewer instead of a prompt.", "\u548C\u5DE5\u4F5C\u533A\u6743\u9650\u4E0E\u9ED8\u8BA4\u76F8\u540C\uFF0C\u4F46\u5BA1\u6279\u8BF7\u6C42\u4EA4\u7ED9\u81EA\u52A8\u5BA1\u67E5\uFF0C\u800C\u4E0D\u662F\u5F39\u51FA\u786E\u8BA4\u3002");
    case "full-access":
      return forgeLocalize("codex.configuration.permissions.fullAccessDescription", "Codex can edit or delete files anywhere and use the internet without asking. Use only when you want full machine access.", "\u53EF\u4EE5\u5728\u4EFB\u610F\u4F4D\u7F6E\u7F16\u8F91\u6216\u5220\u9664\u6587\u4EF6\uFF0C\u5E76\u65E0\u9700\u786E\u8BA4\u5730\u8BBF\u95EE\u7F51\u7EDC\u3002\u4EC5\u5728\u9700\u8981\u5B8C\u5168\u672C\u673A\u8BBF\u95EE\u65F6\u4F7F\u7528\u3002");
    default:
      return fallback;
  }
}
export {
  AHPAgentSettingsWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFpQ3VzdG9taXphdGlvblxcYWdlbnRHbG9iYWxDb25maWd1cmF0aW9uU2V0dGluZ3NXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvYWdlbnRHbG9iYWxDb25maWd1cmF0aW9uU2V0dGluZ3MuY3NzJztcbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IFNlbGVjdEJveCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zZWxlY3RCb3gvc2VsZWN0Qm94LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgdHlwZSBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHJlYWRBZ2VudEN1c3RvbWl6YXRpb25TZXR0aW5ncywgdHlwZSBJQWdlbnRDdXN0b21pemF0aW9uU2V0dGluZ3NEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEN1c3RvbWl6YXRpb25TZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBkaXNjb3ZlcnNDb2RleExvY2FsTW9kZWxzLCBnZXRDb2RleE1vZGVsQ2F0YWxvZ0VudHJ5LCBpc09sbGFtYUNhdGFsb2cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2NvZGV4TW9kZWxzQ29uZmlnLmpzJztcbmltcG9ydCB7IEZPUkdFX0RJU1BMQVlfTEFOR1VBR0VfU1RPUkFHRV9LRVksIEZPUkdFX0xBTkdVQUdFX1BBQ0tfRVhURU5TSU9OX0lELCBmb3JnZUxvY2FsaXplLCBnZXRGb3JnZURpc3BsYXlMYW5ndWFnZSwgc2V0Rm9yZ2VEaXNwbGF5TGFuZ3VhZ2VPdmVycmlkZSwgdHlwZSBGb3JnZURpc3BsYXlMYW5ndWFnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vZm9yZ2VMb2NhbGUuanMnO1xuaW1wb3J0IHsgb2xsYW1hVGFnc1VybCwgcGFyc2VPbGxhbWFUYWdzSnNvbiwgdW5pcXVlTW9kZWxOYW1lcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vb2xsYW1hTGlzdC5qcyc7XG5pbXBvcnQgdHlwZSB7IENvbmZpZ1Byb3BlcnR5U2NoZW1hLCBSb290U3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgTGluayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9icm93c2VyL2xpbmsuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBhc0pzb24sIElSZXF1ZXN0U2VydmljZSwgTk9fRkVUQ0hfVEVMRU1FVFJZIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcywgZGVmYXVsdFNlbGVjdEJveFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9jYWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xvY2FsaXphdGlvbi9jb21tb24vbG9jYWxlLmpzJztcbmltcG9ydCB7IEFnZW50TW9kZWxzU2V0dGluZ3MgfSBmcm9tICcuL2FnZW50TW9kZWxzU2V0dGluZ3MuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEdsb2JhbENvbmZpZ3VyYXRpb25TZXR0aW5nc1RhcmdldCB7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiAobGlzdGVuZXI6ICgpID0+IHZvaWQpID0+IHsgZGlzcG9zZSgpOiB2b2lkIH07XG5cdGdldFN0YXRlKCk6IFJvb3RTdGF0ZSB8IHVuZGVmaW5lZDtcblx0c2V0VmFsdWUoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKTogUHJvbWlzZTx2b2lkPjtcblx0bWFwUmVzb3VyY2UodXJpOiBVUkkpOiBVUkk7XG5cdGdldE1vZGVsUHJvdmlkZXJBcGlLZXk/KHByb3ZpZGVySWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0c2V0TW9kZWxQcm92aWRlckFwaUtleT8ocHJvdmlkZXJJZDogc3RyaW5nLCBhcGlLZXk6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD47XG5cdGRpc2NvdmVyTG9jYWxNb2RlbHM/KGNhdGFsb2dJZDogc3RyaW5nLCBiYXNlVXJsOiBzdHJpbmcpOiBQcm9taXNlPHJlYWRvbmx5IHN0cmluZ1tdPjtcbn1cblxuZXhwb3J0IHR5cGUgQWdlbnRTZXR0aW5nc1dpZGdldE1vZGUgPSAnYWxsJyB8ICdoYXJuZXNzJyB8ICdtb2RlbHMnO1xuXG5leHBvcnQgY2xhc3MgQUhQQWdlbnRTZXR0aW5nc1dpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlbmRlckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSB0YXJnZXRMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHRhcmdldDogSUFnZW50R2xvYmFsQ29uZmlndXJhdGlvblNldHRpbmdzVGFyZ2V0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGZvY3VzVGFyZ2V0OiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IocGFyZW50OiBIVE1MRWxlbWVudCwgcHJpdmF0ZSByZWFkb25seSBhZ2VudFByb3ZpZGVyOiBzdHJpbmcsIHRhcmdldDogSU9ic2VydmFibGU8SUFnZW50R2xvYmFsQ29uZmlndXJhdGlvblNldHRpbmdzVGFyZ2V0IHwgdW5kZWZpbmVkPiwgcHJpdmF0ZSByZWFkb25seSBtb2RlOiBBZ2VudFNldHRpbmdzV2lkZ2V0TW9kZSA9ICdhbGwnLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJTG9jYWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvY2FsZVNlcnZpY2U6IElMb2NhbGVTZXJ2aWNlLFxuXHRcdEBJUmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZXF1ZXN0U2VydmljZTogSVJlcXVlc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IHN0b3JlZCA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KEZPUkdFX0RJU1BMQVlfTEFOR1VBR0VfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0aWYgKHN0b3JlZCA9PT0gJ2VuJyB8fCBzdG9yZWQgPT09ICd6aC1jbicpIHtcblx0XHRcdHNldEZvcmdlRGlzcGxheUxhbmd1YWdlT3ZlcnJpZGUoc3RvcmVkKTtcblx0XHR9XG5cdFx0dGhpcy5jb250YWluZXIgPSBET00uYXBwZW5kKHBhcmVudCwgRE9NLiQoJy5hZ2VudC1nbG9iYWwtY29uZmlndXJhdGlvbi1zZXR0aW5ncycpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB0aGlzLmNvbm5lY3QodGFyZ2V0LnJlYWQocmVhZGVyKSkpKTtcblx0fVxuXG5cdGxheW91dCgpOiB2b2lkIHsgdGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnbmFycm93JywgdGhpcy5jb250YWluZXIuY2xpZW50V2lkdGggPCA1NjApOyB9XG5cdGZvY3VzKCk6IHZvaWQgeyB0aGlzLmZvY3VzVGFyZ2V0Py4oKTsgfVxuXG5cdHByaXZhdGUgY29ubmVjdCh0YXJnZXQ6IElBZ2VudEdsb2JhbENvbmZpZ3VyYXRpb25TZXR0aW5nc1RhcmdldCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnRhcmdldCA9PT0gdGFyZ2V0ICYmIHRhcmdldCkgeyByZXR1cm47IH1cblx0XHR0aGlzLnRhcmdldCA9IHRhcmdldDtcblx0XHR0aGlzLnRhcmdldExpc3RlbmVyLnZhbHVlID0gdGFyZ2V0Py5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLnJlbmRlcigpKTtcblx0XHR0aGlzLnJlbmRlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdERPTS5jbGVhck5vZGUodGhpcy5jb250YWluZXIpO1xuXHRcdHRoaXMuZm9jdXNUYXJnZXQgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLnRhcmdldD8uZ2V0U3RhdGUoKTtcblx0XHRjb25zdCBkZXNjcmlwdG9yID0gcmVhZEFnZW50Q3VzdG9taXphdGlvblNldHRpbmdzKHN0YXRlLCB0aGlzLmFnZW50UHJvdmlkZXIpO1xuXHRcdGlmICghc3RhdGU/LmNvbmZpZyB8fCAhZGVzY3JpcHRvcikge1xuXHRcdFx0RE9NLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgRE9NLiQoJy5hZ2VudC1nbG9iYWwtY29uZmlndXJhdGlvbi1zZXR0aW5ncy1zdGF0dXMnKSkudGV4dENvbnRlbnQgPSBmb3JnZUxvY2FsaXplKCdhZ2VudFNldHRpbmdzLnVuYXZhaWxhYmxlJywgXCJUaGVzZSBoYXJuZXNzIHNldHRpbmdzIGFyZSBub3QgYXZhaWxhYmxlIGZyb20gdGhlIGNvbm5lY3RlZCBhZ2VudCBob3N0LlwiLCBcIlx1NUY1M1x1NTI0RFx1NjVFMFx1NkNENVx1NEVDRVx1NURGMlx1OEZERVx1NjNBNVx1NzY4NCBBZ2VudCBIb3N0IFx1OEJGQlx1NTNENlx1OEZEOVx1NEU5Qlx1OEJCRVx1N0Y2RVx1MzAwMlwiKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2V0dGluZ3MgPSBkZXNjcmlwdG9yLnNldHRpbmdzLmZpbHRlcihzZXR0aW5nID0+IHRoaXMubW9kZSA9PT0gJ2FsbCcgfHwgKHRoaXMubW9kZSA9PT0gJ21vZGVscycpID09PSAoc2V0dGluZy5raW5kID09PSAnbW9kZWxzJykpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBET00uYXBwZW5kKHRoaXMuY29udGFpbmVyLCBET00uJCh0aGlzLm1vZGUgPT09ICdtb2RlbHMnXG5cdFx0XHQ/ICcuYWdlbnQtZ2xvYmFsLWNvbmZpZ3VyYXRpb24tc2V0dGluZ3MtY29udGVudC5hZ2VudC1nbG9iYWwtY29uZmlndXJhdGlvbi1zZXR0aW5ncy1tb2RlbHMtY29udGVudCdcblx0XHRcdDogJy5hZ2VudC1nbG9iYWwtY29uZmlndXJhdGlvbi1zZXR0aW5ncy1jb250ZW50JykpO1xuXHRcdERPTS5hcHBlbmQoY29udGVudCwgRE9NLiQoJ2gxJykpLnRleHRDb250ZW50ID0gdGhpcy5tb2RlID09PSAnbW9kZWxzJ1xuXHRcdFx0PyBmb3JnZUxvY2FsaXplKCdhZ2VudFNldHRpbmdzLm1vZGVscy50aXRsZScsIFwiTW9kZWxzXCIsIFwiXHU2QTIxXHU1NzhCXCIpXG5cdFx0XHQ6IGZvcmdlTG9jYWxpemUoJ2NvZGV4LmNvbmZpZ3VyYXRpb24udGl0bGUnLCBcIkNvZGV4XCIsIFwiQ29kZXhcIik7XG5cdFx0RE9NLmFwcGVuZChjb250ZW50LCBET00uJCgncC5hZ2VudC1nbG9iYWwtY29uZmlndXJhdGlvbi1zZXR0aW5ncy1pbnRybycpKS50ZXh0Q29udGVudCA9IHRoaXMubW9kZSA9PT0gJ21vZGVscydcblx0XHRcdD8gZm9yZ2VMb2NhbGl6ZSgnYWdlbnRTZXR0aW5ncy5tb2RlbHMuZGVzY3JpcHRpb24nLCBcIkNvbmZpZ3VyZSB0aGUgbW9kZWwgcHJvdmlkZXJzIENvZGV4IGNhbiB1c2UsIGluY2x1ZGluZyBjbG91ZCBBUElzIGFuZCBsb2NhbCBPbGxhbWEgc2VydmVycy5cIiwgXCJcdTkxNERcdTdGNkUgQ29kZXggXHU1M0VGXHU0RjdGXHU3NTI4XHU3Njg0XHU2QTIxXHU1NzhCXHU2M0QwXHU0RjlCXHU1NTQ2XHVGRjBDXHU1MzA1XHU2MkVDXHU0RTkxXHU3QUVGIEFQSSBcdTU0OENcdTY3MkNcdTU3MzAgT2xsYW1hXHUzMDAyXCIpXG5cdFx0XHQ6IGZvcmdlTG9jYWxpemUoJ2NvZGV4LmNvbmZpZ3VyYXRpb24uZGVzY3JpcHRpb24nLCBcIlNldCBhZ2VudCBwZXJtaXNzaW9ucywgcGVyc29uYWxpdHksIGFuZCBvdGhlciBDb2RleCBkZWZhdWx0cyBzdG9yZWQgaW4gY29uZmlnLnRvbWwuIFByb2plY3QgYW5kIG1hbmFnZWQgY29uZmlndXJhdGlvbiBjYW4gb3ZlcnJpZGUgdGhlc2UgdXNlciB2YWx1ZXMuXCIsIFwiXHU4QkJFXHU3RjZFIEFnZW50IFx1Njc0M1x1OTY1MFx1MzAwMVx1NEUyQVx1NjAyN1x1NTQ4Q1x1NTE3Nlx1NEVENlx1NTE5OVx1NTE2NSBjb25maWcudG9tbCBcdTc2ODQgQ29kZXggXHU5RUQ4XHU4QkE0XHU1MDNDXHUzMDAyXHU5ODc5XHU3NkVFXHU3RUE3XHU1NDhDXHU3QkExXHU3NDA2XHU5MTREXHU3RjZFXHU1M0VGXHU0RUU1XHU4OTg2XHU3NkQ2XHU4RkQ5XHU0RTlCXHU3NTI4XHU2MjM3XHU4QkJFXHU3RjZFXHUzMDAyXCIpO1xuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgbmV3IFNldChzZXR0aW5ncy5tYXAoc2V0dGluZyA9PiBzZXR0aW5nLmdyb3VwKSkpIHtcblx0XHRcdGNvbnN0IHNlY3Rpb24gPSBET00uYXBwZW5kKGNvbnRlbnQsIERPTS4kKHRoaXMubW9kZSA9PT0gJ21vZGVscydcblx0XHRcdFx0PyAnLmFnZW50LWdsb2JhbC1jb25maWd1cmF0aW9uLXNldHRpbmdzLXNlY3Rpb24uYWdlbnQtZ2xvYmFsLWNvbmZpZ3VyYXRpb24tc2V0dGluZ3MtbW9kZWxzLXNlY3Rpb24nXG5cdFx0XHRcdDogJy5hZ2VudC1nbG9iYWwtY29uZmlndXJhdGlvbi1zZXR0aW5ncy1zZWN0aW9uJykpO1xuXHRcdFx0aWYgKHRoaXMubW9kZSAhPT0gJ21vZGVscycpIHtcblx0XHRcdFx0RE9NLmFwcGVuZChzZWN0aW9uLCBET00uJCgnaDInKSkudGV4dENvbnRlbnQgPSB0cmFuc2xhdGVDb2RleEdyb3VwKGdyb3VwKTtcblx0XHRcdFx0aWYgKHNldHRpbmdzLnNvbWUoc2V0dGluZyA9PiBzZXR0aW5nLmdyb3VwID09PSBncm91cCAmJiBzZXR0aW5nLmtpbmQgPT09ICdwZXJtaXNzaW9ucycpKSB7XG5cdFx0XHRcdFx0RE9NLmFwcGVuZChzZWN0aW9uLCBET00uJCgncC5hZ2VudC1nbG9iYWwtY29uZmlndXJhdGlvbi1zZXR0aW5ncy1zZWN0aW9uLWRlc2NyaXB0aW9uJykpLnRleHRDb250ZW50ID0gZm9yZ2VMb2NhbGl6ZShcblx0XHRcdFx0XHRcdCdjb2RleC5jb25maWd1cmF0aW9uLnBlcm1pc3Npb25zLnNlY3Rpb25EZXNjcmlwdGlvbicsXG5cdFx0XHRcdFx0XHRcIlRoaXMgaXMgdGhlIGRlZmF1bHQgZm9yIG5ldyBjaGF0cy4gQ2hhbmdlIHRoZSBQZXJtaXNzaW9ucyBjb250cm9sIGluIHRoZSBjaGF0IGlucHV0IHRvIGFwcGx5IGl0IHRvIHRoZSBjdXJyZW50IGNvbnZlcnNhdGlvbi4gRGVmYXVsdCBhc2tzIGJlZm9yZSBkZWxldGluZyBmaWxlczsgRnVsbCBBY2Nlc3MgZG9lcyBub3QuXCIsXG5cdFx0XHRcdFx0XHRcIlx1OEZEOVx1NjYyRlx1NjVCMFx1NUJGOVx1OEJERFx1NzY4NFx1OUVEOFx1OEJBNFx1Njc0M1x1OTY1MFx1MzAwMlx1NUY1M1x1NTI0RFx1NUJGOVx1OEJERFx1OEJGN1x1NTcyOFx1OEY5M1x1NTE2NVx1Njg0Nlx1NzY4NFx1MzAwQ1x1Njc0M1x1OTY1MFx1MzAwRFx1NjNBN1x1NEVGNlx1NEUyRFx1NEZFRVx1NjUzOVx1MzAwMlx1OUVEOFx1OEJBNFx1NEYxQVx1NTcyOFx1NTIyMFx1OTY2NFx1NjU4N1x1NEVGNlx1NTI0RFx1OEJFMlx1OTVFRVx1RkYxQlx1NUI4Q1x1NTE2OFx1OEJCRlx1OTVFRVx1NTIxOVx1NEUwRFx1NEYxQVx1MzAwMlwiLFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IGNhcmQgPSBET00uYXBwZW5kKHNlY3Rpb24sIERPTS4kKCcuYWdlbnQtZ2xvYmFsLWNvbmZpZ3VyYXRpb24tc2V0dGluZ3MtY2FyZCcpKTtcblx0XHRcdGZvciAoY29uc3Qgc2V0dGluZyBvZiBzZXR0aW5ncy5maWx0ZXIoc2V0dGluZyA9PiBzZXR0aW5nLmdyb3VwID09PSBncm91cCkpIHtcblx0XHRcdFx0Y29uc3Qgc2NoZW1hID0gc3RhdGUuY29uZmlnLnNjaGVtYS5wcm9wZXJ0aWVzW3NldHRpbmcua2V5XTtcblx0XHRcdFx0aWYgKHNjaGVtYSkgeyB0aGlzLnJlbmRlclNldHRpbmcoY2FyZCwgZGVzY3JpcHRvciwgc2V0dGluZy5rZXksIHNldHRpbmcua2luZCwgc2V0dGluZy5zYXZlTGFiZWwsIHNjaGVtYSwgc3RhdGUuY29uZmlnLnZhbHVlc1tzZXR0aW5nLmtleV0pOyB9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0aGlzLm1vZGUgIT09ICdtb2RlbHMnKSB7XG5cdFx0XHR0aGlzLnJlbmRlckFwcGVhcmFuY2UoY29udGVudCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLm1vZGUgIT09ICdoYXJuZXNzJykge1xuXHRcdFx0dGhpcy5yZW5kZXJDb25maWd1cmF0aW9uRmlsZShjb250ZW50LCBkZXNjcmlwdG9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclNldHRpbmcocGFyZW50OiBIVE1MRWxlbWVudCwgX2Rlc2NyaXB0b3I6IElBZ2VudEN1c3RvbWl6YXRpb25TZXR0aW5nc0Rlc2NyaXB0b3IsIGtleTogc3RyaW5nLCBraW5kOiAnbXVsdGlsaW5lJyB8ICdtb2RlbHMnIHwgJ3Blcm1pc3Npb25zJyB8IHVuZGVmaW5lZCwgc2F2ZUxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIHNjaGVtYTogQ29uZmlnUHJvcGVydHlTY2hlbWEsIHZhbHVlOiB1bmtub3duKTogdm9pZCB7XG5cdFx0aWYgKGtpbmQgPT09ICdtb2RlbHMnKSB7XG5cdFx0XHR0aGlzLnJlbmRlck1vZGVsc1NldHRpbmcocGFyZW50LCBzY2hlbWEsIHZhbHVlLCBrZXkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoa2luZCA9PT0gJ3Blcm1pc3Npb25zJykge1xuXHRcdFx0dGhpcy5yZW5kZXJQZXJtaXNzaW9uc1NldHRpbmcocGFyZW50LCBzY2hlbWEsIHZhbHVlLCBrZXkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByb3cgPSBET00uYXBwZW5kKHBhcmVudCwgRE9NLiQoJy5hZ2VudC1nbG9iYWwtY29uZmlndXJhdGlvbi1zZXR0aW5ncy1yb3cnKSk7XG5cdFx0Y29uc3QgbGFiZWxzID0gRE9NLmFwcGVuZChyb3csIERPTS4kKCcuYWdlbnQtZ2xvYmFsLWNvbmZpZ3VyYXRpb24tc2V0dGluZ3MtbGFiZWxzJykpO1xuXHRcdERPTS5hcHBlbmQobGFiZWxzLCBET00uJCgnLmFnZW50LWdsb2JhbC1jb25maWd1cmF0aW9uLXNldHRpbmdzLWxhYmVsJykpLnRleHRDb250ZW50ID0gdHJhbnNsYXRlQ29kZXhTY2hlbWFUaXRsZShrZXksIHNjaGVtYS50aXRsZSk7XG5cdFx0aWYgKHNjaGVtYS5kZXNjcmlwdGlvbikgeyBET00uYXBwZW5kKGxhYmVscywgRE9NLiQoJy5hZ2VudC1nbG9iYWwtY29uZmlndXJhdGlvbi1zZXR0aW5ncy1kZXNjcmlwdGlvbicpKS50ZXh0Q29udGVudCA9IHRyYW5zbGF0ZUNvZGV4U2NoZW1hRGVzY3JpcHRpb24oa2V5LCBzY2hlbWEuZGVzY3JpcHRpb24pOyB9XG5cdFx0aWYgKGtpbmQgPT09ICdtdWx0aWxpbmUnKSB7XG5cdFx0XHRyb3cuY2xhc3NMaXN0LmFkZCgnYWdlbnQtZ2xvYmFsLWNvbmZpZ3VyYXRpb24tc2V0dGluZ3MtdGV4dC1yb3cnKTtcblx0XHRcdGNvbnN0IGlucHV0ID0gRE9NLmFwcGVuZChyb3csIERPTS4kKCd0ZXh0YXJlYS5hZ2VudC1nbG9iYWwtY29uZmlndXJhdGlvbi1zZXR0aW5ncy10ZXh0JykpIGFzIEhUTUxUZXh0QXJlYUVsZW1lbnQ7XG5cdFx0XHRpbnB1dC5hcmlhTGFiZWwgPSBzY2hlbWEudGl0bGU7XG5cdFx0XHRpbnB1dC52YWx1ZSA9IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgPyB2YWx1ZSA6ICcnO1xuXHRcdFx0dGhpcy5mb2N1c1RhcmdldCA/Pz0gKCkgPT4gaW5wdXQuZm9jdXMoKTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBET00uYXBwZW5kKHJvdywgRE9NLiQoJy5hZ2VudC1nbG9iYWwtY29uZmlndXJhdGlvbi1zZXR0aW5ncy1hY3Rpb25zJykpO1xuXHRcdFx0Y29uc3QgYnV0dG9uID0gdGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbihhY3Rpb25zLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSB9KSk7XG5cdFx0XHRidXR0b24ubGFiZWwgPSBzYXZlTGFiZWwgPz8gZm9yZ2VMb2NhbGl6ZSgnYWdlbnRTZXR0aW5ncy5zYXZlJywgXCJTYXZlXCIsIFwiXHU0RkREXHU1QjU4XCIpO1xuXHRcdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoYnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdm9pZCB0aGlzLnNhdmUoa2V5LCBpbnB1dC52YWx1ZS50cmltKCkpKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG9wdGlvbnMgPSBzY2hlbWEuZW51bT8ubWFwKChvcHRpb24sIGluZGV4KSA9PiAoeyB0ZXh0OiB0cmFuc2xhdGVDb2RleEVudW1MYWJlbChrZXksIFN0cmluZyhvcHRpb24pLCBzY2hlbWEuZW51bUxhYmVscz8uW2luZGV4XSA/PyBTdHJpbmcob3B0aW9uKSkgfSkpID8/IFtdO1xuXHRcdGNvbnN0IHNlbGVjdGVkID0gTWF0aC5tYXgoMCwgc2NoZW1hLmVudW0/LmZpbmRJbmRleChvcHRpb24gPT4gb3B0aW9uID09PSB2YWx1ZSkgPz8gMCk7XG5cdFx0Y29uc3Qgc2VsZWN0Q29udGFpbmVyID0gRE9NLmFwcGVuZChyb3csIERPTS4kKCcuYWdlbnQtZ2xvYmFsLWNvbmZpZ3VyYXRpb24tc2V0dGluZ3Mtc2VsZWN0JykpO1xuXHRcdGNvbnN0IHNlbGVjdCA9IHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKG5ldyBTZWxlY3RCb3gob3B0aW9ucywgc2VsZWN0ZWQsIHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLCB7IC4uLmRlZmF1bHRTZWxlY3RCb3hTdHlsZXMgfSwgeyBhcmlhTGFiZWw6IHNjaGVtYS50aXRsZSB9KSk7XG5cdFx0c2VsZWN0LnJlbmRlcihzZWxlY3RDb250YWluZXIpO1xuXHRcdHRoaXMuZm9jdXNUYXJnZXQgPz89ICgpID0+IHNlbGVjdC5mb2N1cygpO1xuXHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKHNlbGVjdC5vbkRpZFNlbGVjdChldmVudCA9PiB2b2lkIHRoaXMuc2F2ZShrZXksIHNjaGVtYS5lbnVtPy5bZXZlbnQuaW5kZXhdKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJBcHBlYXJhbmNlKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBzZWN0aW9uID0gRE9NLmFwcGVuZChwYXJlbnQsIERPTS4kKCcuYWdlbnQtZ2xvYmFsLWNvbmZpZ3VyYXRpb24tc2V0dGluZ3Mtc2VjdGlvbicpKTtcblx0XHRET00uYXBwZW5kKHNlY3Rpb24sIERPTS4kKCdoMicpKS50ZXh0Q29udGVudCA9IGZvcmdlTG9jYWxpemUoJ2NvZGV4LmNvbmZpZ3VyYXRpb24uYXBwZWFyYW5jZScsIFwiQXBwZWFyYW5jZVwiLCBcIlx1NTkxNlx1ODlDMlwiKTtcblx0XHRjb25zdCBjYXJkID0gRE9NLmFwcGVuZChzZWN0aW9uLCBET00uJCgnLmFnZW50LWdsb2JhbC1jb25maWd1cmF0aW9uLXNldHRpbmdzLWNhcmQnKSk7XG5cdFx0Y29uc3Qgcm93ID0gRE9NLmFwcGVuZChjYXJkLCBET00uJCgnLmFnZW50LWdsb2JhbC1jb25maWd1cmF0aW9uLXNldHRpbmdzLXJvdycpKTtcblx0XHRjb25zdCBsYWJlbHMgPSBET00uYXBwZW5kKHJvdywgRE9NLiQoJy5hZ2VudC1nbG9iYWwtY29uZmlndXJhdGlvbi1zZXR0aW5ncy1sYWJlbHMnKSk7XG5cdFx0RE9NLmFwcGVuZChsYWJlbHMsIERPTS4kKCcuYWdlbnQtZ2xvYmFsLWNvbmZpZ3VyYXRpb24tc2V0dGluZ3MtbGFiZWwnKSkudGV4dENvbnRlbnQgPSBmb3JnZUxvY2FsaXplKCdjb2RleC5jb25maWd1cmF0aW9uLmxhbmd1YWdlJywgXCJMYW5ndWFnZVwiLCBcIlx1OEJFRFx1OEEwMFwiKTtcblx0XHRET00uYXBwZW5kKGxhYmVscywgRE9NLiQoJy5hZ2VudC1nbG9iYWwtY29uZmlndXJhdGlvbi1zZXR0aW5ncy1kZXNjcmlwdGlvbicpKS50ZXh0Q29udGVudCA9IGZvcmdlTG9jYWxpemUoJ2NvZGV4LmNvbmZpZ3VyYXRpb24ubGFuZ3VhZ2UuZGVzY3JpcHRpb24nLCBcIlN3aXRjaCBDb2RleCBzZXR0aW5ncyBiZXR3ZWVuIEVuZ2xpc2ggYW5kIENoaW5lc2UuIFJlc3RhcnQgdG8gYXBwbHkgdGhlIGxhbmd1YWdlIHBhY2sgdG8gdGhlIHJlc3Qgb2YgRm9yZ2UuXCIsIFwiXHU1NzI4XHU0RTJEXHU4MkYxXHU2NTg3XHU0RTRCXHU5NUY0XHU1MjA3XHU2MzYyIENvZGV4IFx1OEJCRVx1N0Y2RVx1MzAwMlx1OTFDRFx1NTQyRlx1NTQwRVx1OEJFRFx1OEEwMFx1NTMwNVx1NEYxQVx1NUU5NFx1NzUyOFx1NTIzMCBGb3JnZSBcdTc2ODRcdTUxNzZcdTRGNTlcdTc1NENcdTk3NjJcdTMwMDJcIik7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IFtcblx0XHRcdHsgaWQ6ICdlbicgYXMgY29uc3QsIHRleHQ6ICdFbmdsaXNoJyB9LFxuXHRcdFx0eyBpZDogJ3poLWNuJyBhcyBjb25zdCwgdGV4dDogJ1x1NEUyRFx1NjU4NycgfSxcblx0XHRdO1xuXHRcdGNvbnN0IHNlbGVjdGVkID0gTWF0aC5tYXgoMCwgb3B0aW9ucy5maW5kSW5kZXgob3B0aW9uID0+IG9wdGlvbi5pZCA9PT0gZ2V0Rm9yZ2VEaXNwbGF5TGFuZ3VhZ2UoKSkpO1xuXHRcdGNvbnN0IHNlbGVjdENvbnRhaW5lciA9IERPTS5hcHBlbmQocm93LCBET00uJCgnLmFnZW50LWdsb2JhbC1jb25maWd1cmF0aW9uLXNldHRpbmdzLXNlbGVjdCcpKTtcblx0XHRjb25zdCBzZWxlY3QgPSB0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZChuZXcgU2VsZWN0Qm94KG9wdGlvbnMubWFwKG9wdGlvbiA9PiAoeyB0ZXh0OiBvcHRpb24udGV4dCB9KSksIHNlbGVjdGVkLCB0aGlzLmNvbnRleHRWaWV3U2VydmljZSwgeyAuLi5kZWZhdWx0U2VsZWN0Qm94U3R5bGVzIH0sIHsgYXJpYUxhYmVsOiBmb3JnZUxvY2FsaXplKCdjb2RleC5jb25maWd1cmF0aW9uLmxhbmd1YWdlJywgXCJMYW5ndWFnZVwiLCBcIlx1OEJFRFx1OEEwMFwiKSB9KSk7XG5cdFx0c2VsZWN0LnJlbmRlcihzZWxlY3RDb250YWluZXIpO1xuXHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKHNlbGVjdC5vbkRpZFNlbGVjdChldmVudCA9PiB2b2lkIHRoaXMuYXBwbHlEaXNwbGF5TGFuZ3VhZ2Uob3B0aW9uc1tldmVudC5pbmRleF0uaWQpKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFwcGx5RGlzcGxheUxhbmd1YWdlKGxvY2FsZTogRm9yZ2VEaXNwbGF5TGFuZ3VhZ2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRzZXRGb3JnZURpc3BsYXlMYW5ndWFnZU92ZXJyaWRlKGxvY2FsZSk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShGT1JHRV9ESVNQTEFZX0xBTkdVQUdFX1NUT1JBR0VfS0VZLCBsb2NhbGUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR0aGlzLnJlbmRlcigpO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAobG9jYWxlID09PSAnZW4nKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMubG9jYWxlU2VydmljZS5jbGVhckxvY2FsZVByZWZlcmVuY2UoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMubG9jYWxlU2VydmljZS5zZXRMb2NhbGUoe1xuXHRcdFx0XHRcdGlkOiAnemgtY24nLFxuXHRcdFx0XHRcdGxhYmVsOiAnXHU0RTJEXHU2NTg3KFx1N0I4MFx1NEY1MyknLFxuXHRcdFx0XHRcdGV4dGVuc2lvbklkOiBGT1JHRV9MQU5HVUFHRV9QQUNLX0VYVEVOU0lPTl9JRCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzYXZlKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7IGF3YWl0IHRoaXMudGFyZ2V0Py5zZXRWYWx1ZShrZXksIHZhbHVlKTsgfSBjYXRjaCAoZXJyb3IpIHsgdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycm9yKTsgfVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJQZXJtaXNzaW9uc1NldHRpbmcocGFyZW50OiBIVE1MRWxlbWVudCwgc2NoZW1hOiBDb25maWdQcm9wZXJ0eVNjaGVtYSwgdmFsdWU6IHVua25vd24sIGtleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0cGFyZW50LmNsYXNzTGlzdC5hZGQoJ2FnZW50LWdsb2JhbC1jb25maWd1cmF0aW9uLXNldHRpbmdzLXBlcm1pc3Npb25zLWNhcmQnKTtcblx0XHRjb25zdCBjdXJyZW50ID0gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHZhbHVlIDogJ2RlZmF1bHQnO1xuXHRcdGNvbnN0IGxpc3QgPSBET00uYXBwZW5kKHBhcmVudCwgRE9NLiQoJy5hZ2VudC1nbG9iYWwtY29uZmlndXJhdGlvbi1zZXR0aW5ncy1wZXJtaXNzaW9ucycpKTtcblx0XHRjb25zdCBvcHRpb25zID0gc2NoZW1hLmVudW0gPz8gWydkZWZhdWx0JywgJ2F1dG8tcmV2aWV3JywgJ2Z1bGwtYWNjZXNzJ107XG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IG9wdGlvbnMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRjb25zdCBvcHRpb24gPSBTdHJpbmcob3B0aW9uc1tpbmRleF0pO1xuXHRcdFx0Y29uc3QgYnV0dG9uID0gRE9NLmFwcGVuZChsaXN0LCBET00uJCgnYnV0dG9uLmFnZW50LWdsb2JhbC1jb25maWd1cmF0aW9uLXNldHRpbmdzLXBlcm1pc3Npb24nKSkgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdFx0XHRidXR0b24udHlwZSA9ICdidXR0b24nO1xuXHRcdFx0YnV0dG9uLmNsYXNzTGlzdC50b2dnbGUoJ3NlbGVjdGVkJywgb3B0aW9uID09PSBjdXJyZW50KTtcblx0XHRcdGJ1dHRvbi5jbGFzc0xpc3QudG9nZ2xlKCdkYW5nZXInLCBvcHRpb24gPT09ICdmdWxsLWFjY2VzcycpO1xuXHRcdFx0YnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1wcmVzc2VkJywgb3B0aW9uID09PSBjdXJyZW50ID8gJ3RydWUnIDogJ2ZhbHNlJyk7XG5cdFx0XHRidXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdHJhbnNsYXRlQ29kZXhFbnVtTGFiZWwoa2V5LCBvcHRpb24sIHNjaGVtYS5lbnVtTGFiZWxzPy5baW5kZXhdID8/IG9wdGlvbikpO1xuXHRcdFx0RE9NLmFwcGVuZChidXR0b24sIERPTS4kKCcuYWdlbnQtZ2xvYmFsLWNvbmZpZ3VyYXRpb24tc2V0dGluZ3MtcGVybWlzc2lvbi10aXRsZScpKS50ZXh0Q29udGVudCA9IHRyYW5zbGF0ZUNvZGV4RW51bUxhYmVsKGtleSwgb3B0aW9uLCBzY2hlbWEuZW51bUxhYmVscz8uW2luZGV4XSA/PyBvcHRpb24pO1xuXHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSB0cmFuc2xhdGVDb2RleEVudW1EZXNjcmlwdGlvbihrZXksIG9wdGlvbiwgc2NoZW1hLmVudW1EZXNjcmlwdGlvbnM/LltpbmRleF0gPz8gJycpO1xuXHRcdFx0aWYgKGRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdERPTS5hcHBlbmQoYnV0dG9uLCBET00uJCgnLmFnZW50LWdsb2JhbC1jb25maWd1cmF0aW9uLXNldHRpbmdzLXBlcm1pc3Npb24tZGVzY3JpcHRpb24nKSkudGV4dENvbnRlbnQgPSBkZXNjcmlwdGlvbjtcblx0XHRcdH1cblx0XHRcdHRoaXMuZm9jdXNUYXJnZXQgPz89ICgpID0+IGJ1dHRvbi5mb2N1cygpO1xuXHRcdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b24sICdjbGljaycsICgpID0+IHtcblx0XHRcdFx0aWYgKG9wdGlvbiAhPT0gY3VycmVudCkge1xuXHRcdFx0XHRcdHZvaWQgdGhpcy5zYXZlKGtleSwgb3B0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTW9kZWxzU2V0dGluZyhwYXJlbnQ6IEhUTUxFbGVtZW50LCBzY2hlbWE6IENvbmZpZ1Byb3BlcnR5U2NoZW1hLCB2YWx1ZTogdW5rbm93biwga2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRwYXJlbnQuY2xhc3NMaXN0LmFkZCgnYWdlbnQtZ2xvYmFsLWNvbmZpZ3VyYXRpb24tc2V0dGluZ3MtbW9kZWxzLWNhcmQnKTtcblx0XHRjb25zdCBjb250YWluZXIgPSBET00uYXBwZW5kKHBhcmVudCwgRE9NLiQoJy5hZ2VudC1nbG9iYWwtY29uZmlndXJhdGlvbi1zZXR0aW5ncy1tb2RlbHMnKSk7XG5cdFx0aWYgKHRoaXMubW9kZSAhPT0gJ21vZGVscycpIHtcblx0XHRcdGNvbnN0IGhlYWRlciA9IERPTS5hcHBlbmQoY29udGFpbmVyLCBET00uJCgnLmFnZW50LWdsb2JhbC1jb25maWd1cmF0aW9uLXNldHRpbmdzLXJvdycpKTtcblx0XHRcdGNvbnN0IGxhYmVscyA9IERPTS5hcHBlbmQoaGVhZGVyLCBET00uJCgnLmFnZW50LWdsb2JhbC1jb25maWd1cmF0aW9uLXNldHRpbmdzLWxhYmVscycpKTtcblx0XHRcdERPTS5hcHBlbmQobGFiZWxzLCBET00uJCgnLmFnZW50LWdsb2JhbC1jb25maWd1cmF0aW9uLXNldHRpbmdzLWxhYmVsJykpLnRleHRDb250ZW50ID0gdHJhbnNsYXRlQ29kZXhTY2hlbWFUaXRsZShrZXksIHNjaGVtYS50aXRsZSk7XG5cdFx0XHRpZiAoc2NoZW1hLmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdERPTS5hcHBlbmQobGFiZWxzLCBET00uJCgnLmFnZW50LWdsb2JhbC1jb25maWd1cmF0aW9uLXNldHRpbmdzLWRlc2NyaXB0aW9uJykpLnRleHRDb250ZW50ID0gdHJhbnNsYXRlQ29kZXhTY2hlbWFEZXNjcmlwdGlvbihrZXksIHNjaGVtYS5kZXNjcmlwdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudE1vZGVsc1NldHRpbmdzKFxuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0dmFsdWUsXG5cdFx0XHRuZXh0ID0+IHRoaXMuc2F2ZShrZXksIG5leHQpLFxuXHRcdFx0cHJvdmlkZXJJZCA9PiB0aGlzLnRhcmdldD8uZ2V0TW9kZWxQcm92aWRlckFwaUtleT8uKHByb3ZpZGVySWQpLFxuXHRcdFx0KHByb3ZpZGVySWQsIGFwaUtleSkgPT4gdGhpcy50YXJnZXQ/LnNldE1vZGVsUHJvdmlkZXJBcGlLZXk/Lihwcm92aWRlcklkLCBhcGlLZXkpLFxuXHRcdFx0dGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0XHQoY2F0YWxvZ0lkLCBiYXNlVXJsKSA9PiB0aGlzLmxpc3RMb2NhbFByb3ZpZGVyTW9kZWxzKGNhdGFsb2dJZCwgYmFzZVVybCksXG5cdFx0KSk7XG5cdFx0dGhpcy5mb2N1c1RhcmdldCA/Pz0gKCkgPT4gZWRpdG9yLmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNvbmZpZ3VyYXRpb25GaWxlKHBhcmVudDogSFRNTEVsZW1lbnQsIGRlc2NyaXB0b3I6IElBZ2VudEN1c3RvbWl6YXRpb25TZXR0aW5nc0Rlc2NyaXB0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBmaWxlID0gZGVzY3JpcHRvci5jb25maWd1cmF0aW9uRmlsZTtcblx0XHRpZiAoIWZpbGUpIHsgcmV0dXJuOyB9XG5cdFx0Y29uc3Qgc2VjdGlvbiA9IERPTS5hcHBlbmQocGFyZW50LCBET00uJCgnLmFnZW50LWdsb2JhbC1jb25maWd1cmF0aW9uLXNldHRpbmdzLXNlY3Rpb24nKSk7XG5cdFx0RE9NLmFwcGVuZChzZWN0aW9uLCBET00uJCgnaDInKSkudGV4dENvbnRlbnQgPSBmb3JnZUxvY2FsaXplKCdjb2RleC5jb25maWd1cmF0aW9uLmZpbGUudGl0bGUnLCBcIkFkdmFuY2VkIGNvbmZpZ3VyYXRpb25cIiwgXCJcdTlBRDhcdTdFQTdcdTkxNERcdTdGNkVcIik7XG5cdFx0RE9NLmFwcGVuZChzZWN0aW9uLCBET00uJCgncC5hZ2VudC1nbG9iYWwtY29uZmlndXJhdGlvbi1zZXR0aW5ncy1zZWN0aW9uLWRlc2NyaXB0aW9uJykpLnRleHRDb250ZW50ID0gZm9yZ2VMb2NhbGl6ZSgnY29kZXguY29uZmlndXJhdGlvbi5maWxlLmRlc2NyaXB0aW9uJywgXCJPcGVuIHRoZSBDb2RleCBjb25maWd1cmF0aW9uIGZpbGUgdG8gY3VzdG9taXplIGFkZGl0aW9uYWwgYWdlbnQgYmVoYXZpb3IuXCIsIFwiXHU2MjUzXHU1RjAwIENvZGV4IFx1OTE0RFx1N0Y2RVx1NjU4N1x1NEVGNlx1NEVFNVx1ODFFQVx1NUI5QVx1NEU0OVx1NjZGNFx1NTkxQVx1NEVFM1x1NzQwNlx1ODg0Q1x1NEUzQVx1MzAwMlwiKTtcblx0XHRpZiAoZmlsZS5kb2N1bWVudGF0aW9uVXJsICYmIGZpbGUuZG9jdW1lbnRhdGlvbkxhYmVsKSB7IHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKG5ldyBMaW5rKHNlY3Rpb24sIHsgbGFiZWw6IGZvcmdlTG9jYWxpemUoJ2NvZGV4LmNvbmZpZ3VyYXRpb24uZmlsZS5kb2NzJywgXCJDb2RleCBjb25maWd1cmF0aW9uIGRvY3VtZW50YXRpb25cIiwgXCJDb2RleCBcdTkxNERcdTdGNkVcdTY1ODdcdTY4NjNcIiksIGhyZWY6IGZpbGUuZG9jdW1lbnRhdGlvblVybCB9LCB7fSwgdGhpcy5ob3ZlclNlcnZpY2UsIHRoaXMub3BlbmVyU2VydmljZSkpOyB9XG5cdFx0Y29uc3QgYnV0dG9uID0gdGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbihzZWN0aW9uLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSB9KSk7XG5cdFx0YnV0dG9uLmxhYmVsID0gZm9yZ2VMb2NhbGl6ZSgnY29kZXguY29uZmlndXJhdGlvbi5maWxlLm9wZW4nLCBcIk9wZW4gY29uZmlnLnRvbWxcIiwgXCJcdTYyNTNcdTVGMDAgY29uZmlnLnRvbWxcIik7XG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoYnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogdGhpcy50YXJnZXQ/Lm1hcFJlc291cmNlKFVSSS5wYXJzZShmaWxlLnJlc291cmNlKSkgPz8gVVJJLnBhcnNlKGZpbGUucmVzb3VyY2UpLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0pKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGxpc3RMb2NhbFByb3ZpZGVyTW9kZWxzKGNhdGFsb2dJZDogc3RyaW5nLCBiYXNlVXJsOiBzdHJpbmcpOiBQcm9taXNlPHJlYWRvbmx5IHN0cmluZ1tdPiB7XG5cdFx0aWYgKCFkaXNjb3ZlcnNDb2RleExvY2FsTW9kZWxzKGNhdGFsb2dJZCkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgY29sbGVjdGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgYWRkID0gKG5hbWVzPzogcmVhZG9ubHkgc3RyaW5nW10pID0+IHtcblx0XHRcdGZvciAoY29uc3QgbmFtZSBvZiBuYW1lcyA/PyBbXSkge1xuXHRcdFx0XHRjb25zdCB0cmltbWVkID0gbmFtZS50cmltKCk7XG5cdFx0XHRcdGlmICh0cmltbWVkKSB7XG5cdFx0XHRcdFx0Y29sbGVjdGVkLmFkZCh0cmltbWVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgbmF0aXZlID0gdGhpcy5saXN0TmF0aXZlTW9kZWxzKGNhdGFsb2dJZCwgYmFzZVVybCk7XG5cdFx0Y29uc3QgaHR0cCA9IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMuZGlzY292ZXJMb2NhbE1vZGVscyhjYXRhbG9nSWQsIGJhc2VVcmwpLFxuXHRcdFx0aXNPbGxhbWFDYXRhbG9nKGNhdGFsb2dJZCkgPyB0aGlzLmRpc2NvdmVyTG9jYWxNb2RlbHMoY2F0YWxvZ0lkLCAnaHR0cDovLzEyNy4wLjAuMToxMTQzNC92MScpIDogUHJvbWlzZS5yZXNvbHZlKFtdKSxcblx0XHRcdGlzT2xsYW1hQ2F0YWxvZyhjYXRhbG9nSWQpID8gdGhpcy5kaXNjb3ZlckxvY2FsTW9kZWxzKGNhdGFsb2dJZCwgJ2h0dHA6Ly9sb2NhbGhvc3Q6MTE0MzQvdjEnKSA6IFByb21pc2UucmVzb2x2ZShbXSksXG5cdFx0XSk7XG5cdFx0Y29uc3QgW2Zyb21OYXRpdmUsIGZyb21IdHRwXSA9IGF3YWl0IFByb21pc2UuYWxsKFtuYXRpdmUsIGh0dHBdKTtcblx0XHRhZGQoZnJvbU5hdGl2ZSk7XG5cdFx0Zm9yIChjb25zdCBuYW1lcyBvZiBmcm9tSHR0cCkge1xuXHRcdFx0YWRkKG5hbWVzKTtcblx0XHR9XG5cdFx0cmV0dXJuIFsuLi5jb2xsZWN0ZWRdO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBsaXN0TmF0aXZlTW9kZWxzKGNhdGFsb2dJZDogc3RyaW5nLCBiYXNlVXJsOiBzdHJpbmcpOiBQcm9taXNlPHJlYWRvbmx5IHN0cmluZ1tdPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBQcm9taXNlLnJhY2UoW1xuXHRcdFx0XHR0aGlzLnRhcmdldD8uZGlzY292ZXJMb2NhbE1vZGVscz8uKGNhdGFsb2dJZCwgYmFzZVVybCkgPz8gUHJvbWlzZS5yZXNvbHZlKFtdKSxcblx0XHRcdFx0bmV3IFByb21pc2U8cmVhZG9ubHkgc3RyaW5nW10+KHJlc29sdmUgPT4gc2V0VGltZW91dCgoKSA9PiByZXNvbHZlKFtdKSwgNF8wMDApKSxcblx0XHRcdF0pO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZGlzY292ZXJMb2NhbE1vZGVscyhjYXRhbG9nSWQ6IHN0cmluZywgYmFzZVVybDogc3RyaW5nKTogUHJvbWlzZTxyZWFkb25seSBzdHJpbmdbXT4ge1xuXHRcdGNvbnN0IGNhdGFsb2cgPSBnZXRDb2RleE1vZGVsQ2F0YWxvZ0VudHJ5KGNhdGFsb2dJZCk7XG5cdFx0Y29uc3QgZmFsbGJhY2sgPSBjYXRhbG9nLmRlZmF1bHRCYXNlVXJsIHx8IChpc09sbGFtYUNhdGFsb2coY2F0YWxvZ0lkKSA/ICdodHRwOi8vMTI3LjAuMC4xOjExNDM0L3YxJyA6ICdodHRwOi8vbG9jYWxob3N0OjEyMzQvdjEnKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdXJsID0gaXNPbGxhbWFDYXRhbG9nKGNhdGFsb2dJZClcblx0XHRcdFx0PyBvbGxhbWFUYWdzVXJsKGJhc2VVcmwgfHwgZmFsbGJhY2spXG5cdFx0XHRcdDogdGhpcy5sb2NhbE1vZGVsc1VybChjYXRhbG9nSWQsIGJhc2VVcmwgfHwgZmFsbGJhY2spO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMucmVxdWVzdFNlcnZpY2UucmVxdWVzdCh7IHR5cGU6ICdHRVQnLCB1cmwsIHRpbWVvdXQ6IDhfMDAwLCBjYWxsU2l0ZTogTk9fRkVUQ0hfVEVMRU1FVFJZIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0aWYgKGNvbnRleHQucmVzLnN0YXR1c0NvZGUgJiYgY29udGV4dC5yZXMuc3RhdHVzQ29kZSA+PSA0MDApIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYm9keSA9IGF3YWl0IGFzSnNvbjx7IGRhdGE/OiBBcnJheTxJTG9jYWxNb2RlbFJlY29yZD47IG1vZGVscz86IEFycmF5PElMb2NhbE1vZGVsUmVjb3JkPiB9IHwgSUxvY2FsTW9kZWxSZWNvcmRbXT4oY29udGV4dCk7XG5cdFx0XHRpZiAoaXNPbGxhbWFDYXRhbG9nKGNhdGFsb2dJZCkpIHtcblx0XHRcdFx0cmV0dXJuIHBhcnNlT2xsYW1hVGFnc0pzb24oYm9keSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWJvZHkpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmF3OiBJTG9jYWxNb2RlbFJlY29yZFtdID0gQXJyYXkuaXNBcnJheShib2R5KVxuXHRcdFx0XHQ/IGJvZHlcblx0XHRcdFx0OiBBcnJheS5pc0FycmF5KGJvZHkuZGF0YSlcblx0XHRcdFx0XHQ/IGJvZHkuZGF0YVxuXHRcdFx0XHRcdDogQXJyYXkuaXNBcnJheShib2R5Lm1vZGVscylcblx0XHRcdFx0XHRcdD8gYm9keS5tb2RlbHNcblx0XHRcdFx0XHRcdDogW107XG5cdFx0XHRyZXR1cm4gdW5pcXVlTW9kZWxOYW1lcyhyYXcubWFwKG1vZGVsID0+IG1vZGVsLm1vZGVsIHx8IG1vZGVsLmlkIHx8IG1vZGVsLm5hbWUgfHwgJycpKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGxvY2FsTW9kZWxzVXJsKGNhdGFsb2dJZDogc3RyaW5nLCBiYXNlVXJsOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGNhdGFsb2cgPSBnZXRDb2RleE1vZGVsQ2F0YWxvZ0VudHJ5KGNhdGFsb2dJZCk7XG5cdFx0Y29uc3QgdXJsID0gbmV3IFVSTChiYXNlVXJsKTtcblx0XHR1cmwuc2VhcmNoID0gJyc7XG5cdFx0dXJsLmhhc2ggPSAnJztcblx0XHRpZiAoY2F0YWxvZy5raW5kID09PSAnbG1zdHVkaW8nKSB7XG5cdFx0XHR1cmwucGF0aG5hbWUgPSBgJHt1cmwucGF0aG5hbWUucmVwbGFjZSgvXFwvKD86djF8YXBpKVxcLz8kLywgJycpLnJlcGxhY2UoL1xcLyQvLCAnJyl9L2FwaS92MC9tb2RlbHNgO1xuXHRcdH0gZWxzZSBpZiAoIS9cXC9tb2RlbHNcXC8/JC8udGVzdCh1cmwucGF0aG5hbWUpKSB7XG5cdFx0XHR1cmwucGF0aG5hbWUgPSBgJHt1cmwucGF0aG5hbWUucmVwbGFjZSgvXFwvJC8sICcnKX0vbW9kZWxzYDtcblx0XHR9XG5cdFx0cmV0dXJuIHVybC50b1N0cmluZygpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJTG9jYWxNb2RlbFJlY29yZCB7XG5cdHJlYWRvbmx5IGlkPzogc3RyaW5nO1xuXHRyZWFkb25seSBuYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBtb2RlbD86IHN0cmluZztcbn1cblxuZnVuY3Rpb24gdHJhbnNsYXRlQ29kZXhHcm91cChncm91cDogc3RyaW5nKTogc3RyaW5nIHtcblx0c3dpdGNoIChncm91cCkge1xuXHRcdGNhc2UgJ0FnZW50IHBlcm1pc3Npb25zJzpcblx0XHRcdHJldHVybiBmb3JnZUxvY2FsaXplKCdjb2RleC5jb25maWd1cmF0aW9uLnBlcm1pc3Npb25zLmdyb3VwJywgXCJBZ2VudCBwZXJtaXNzaW9uc1wiLCBcIkFnZW50IFx1Njc0M1x1OTY1MFwiKTtcblx0XHRjYXNlICdQZXJzb25hbGl6YXRpb24nOlxuXHRcdFx0cmV0dXJuIGZvcmdlTG9jYWxpemUoJ2NvZGV4LmNvbmZpZ3VyYXRpb24ucGVyc29uYWxpemF0aW9uJywgXCJQZXJzb25hbGl6YXRpb25cIiwgXCJcdTRFMkFcdTYwMjdcdTUzMTZcIik7XG5cdFx0Y2FzZSAnUmV2aWV3IHBvbGljeSc6XG5cdFx0XHRyZXR1cm4gZm9yZ2VMb2NhbGl6ZSgnY29kZXguY29uZmlndXJhdGlvbi5yZXZpZXcnLCBcIlJldmlldyBwb2xpY3lcIiwgXCJcdTVCQTFcdTY3RTVcdTdCNTZcdTc1NjVcIik7XG5cdFx0Y2FzZSAnTW9kZWxzJzpcblx0XHRcdHJldHVybiBmb3JnZUxvY2FsaXplKCdjb2RleC5jb25maWd1cmF0aW9uLm1vZGVscy5ncm91cCcsIFwiTW9kZWxzXCIsIFwiXHU2QTIxXHU1NzhCXCIpO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gZ3JvdXA7XG5cdH1cbn1cblxuZnVuY3Rpb24gdHJhbnNsYXRlQ29kZXhTY2hlbWFUaXRsZShrZXk6IHN0cmluZywgZmFsbGJhY2s6IHN0cmluZyk6IHN0cmluZyB7XG5cdHN3aXRjaCAoa2V5KSB7XG5cdFx0Y2FzZSAnY29kZXgucGVybWlzc2lvbnNQcmVzZXQnOlxuXHRcdFx0cmV0dXJuIGZvcmdlTG9jYWxpemUoJ2NvZGV4LmNvbmZpZ3VyYXRpb24ucGVybWlzc2lvbnMnLCBcIlBlcm1pc3Npb25zXCIsIFwiXHU2NzQzXHU5NjUwXCIpO1xuXHRcdGNhc2UgJ2NvZGV4LnBlcnNvbmFsaXR5Jzpcblx0XHRcdHJldHVybiBmb3JnZUxvY2FsaXplKCdjb2RleC5jb25maWd1cmF0aW9uLnBlcnNvbmFsaXR5JywgXCJQZXJzb25hbGl0eVwiLCBcIlx1NEUyQVx1NjAyN1wiKTtcblx0XHRjYXNlICdjb2RleC5hdXRvUmV2aWV3UG9saWN5Jzpcblx0XHRcdHJldHVybiBmb3JnZUxvY2FsaXplKCdjb2RleC5jb25maWd1cmF0aW9uLmF1dG9SZXZpZXdQb2xpY3knLCBcIkF1dG8tcmV2aWV3IHBvbGljeVwiLCBcIlx1ODFFQVx1NTJBOFx1NUJBMVx1NjdFNVx1N0I1Nlx1NzU2NVwiKTtcblx0XHRjYXNlICdjb2RleC5tb2RlbHMnOlxuXHRcdFx0cmV0dXJuIGZvcmdlTG9jYWxpemUoJ2NvZGV4LmNvbmZpZ3VyYXRpb24ubW9kZWxzJywgXCJNb2RlbHNcIiwgXCJcdTZBMjFcdTU3OEJcIik7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBmYWxsYmFjaztcblx0fVxufVxuXG5mdW5jdGlvbiB0cmFuc2xhdGVDb2RleFNjaGVtYURlc2NyaXB0aW9uKGtleTogc3RyaW5nLCBmYWxsYmFjazogc3RyaW5nKTogc3RyaW5nIHtcblx0c3dpdGNoIChrZXkpIHtcblx0XHRjYXNlICdjb2RleC5wZXJtaXNzaW9uc1ByZXNldCc6XG5cdFx0XHRyZXR1cm4gZm9yZ2VMb2NhbGl6ZSgnY29kZXguY29uZmlndXJhdGlvbi5wZXJtaXNzaW9ucy5kZXNjcmlwdGlvbicsIFwiQ2hvb3NlIGhvdyBtdWNoIENvZGV4IGNhbiBkbyBvbiBpdHMgb3duLiBEZWZhdWx0IGFza3MgYmVmb3JlIGRlbGV0aW5nIGZpbGVzLCB1c2luZyB0aGUgaW50ZXJuZXQsIG9yIGxlYXZpbmcgdGhlIHdvcmtzcGFjZS4gRnVsbCBBY2Nlc3Mgc2tpcHMgdGhvc2UgcHJvbXB0cy5cIiwgXCJcdTkwMDlcdTYyRTkgQ29kZXggXHU1M0VGXHU0RUU1XHU4MUVBXHU4ODRDXHU1QjhDXHU2MjEwXHU1OTFBXHU1QzExXHU2NENEXHU0RjVDXHUzMDAyXHU5RUQ4XHU4QkE0XHU0RjFBXHU1NzI4XHU1MjIwXHU5NjY0XHU2NTg3XHU0RUY2XHUzMDAxXHU4QkJGXHU5NUVFXHU3RjUxXHU3RURDXHU2MjE2XHU3OUJCXHU1RjAwXHU1REU1XHU0RjVDXHU1MzNBXHU1MjREXHU4QkUyXHU5NUVFXHUzMDAyXHU1QjhDXHU1MTY4XHU4QkJGXHU5NUVFXHU0RjFBXHU4REYzXHU4RkM3XHU4RkQ5XHU0RTlCXHU3ODZFXHU4QkE0XHUzMDAyXCIpO1xuXHRcdGNhc2UgJ2NvZGV4LnBlcnNvbmFsaXR5Jzpcblx0XHRcdHJldHVybiBmb3JnZUxvY2FsaXplKCdjb2RleC5jb25maWd1cmF0aW9uLnBlcnNvbmFsaXR5LmRlc2NyaXB0aW9uJywgXCJDb250cm9scyB0aGUgZGVmYXVsdCBjb21tdW5pY2F0aW9uIHN0eWxlIGZvciBDb2RleC4gRGVmYXVsdCBsZWF2ZXMgcGVyc29uYWxpdHkgdW5zZXQgaW4gY29uZmlnLnRvbWwuXCIsIFwiXHU2M0E3XHU1MjM2IENvZGV4IFx1NzY4NFx1OUVEOFx1OEJBNFx1NkM5Rlx1OTAxQVx1OThDRVx1NjgzQ1x1MzAwMlx1OTAwOVx1NjJFOSBEZWZhdWx0IFx1NjVGNlx1NEUwRFx1NEYxQVx1NTcyOCBjb25maWcudG9tbCBcdTRFMkRcdTUxOTlcdTUxNjUgcGVyc29uYWxpdHlcdTMwMDJcIik7XG5cdFx0Y2FzZSAnY29kZXguYXV0b1Jldmlld1BvbGljeSc6XG5cdFx0XHRyZXR1cm4gZm9yZ2VMb2NhbGl6ZSgnY29kZXguY29uZmlndXJhdGlvbi5hdXRvUmV2aWV3UG9saWN5LmRlc2NyaXB0aW9uJywgXCJVcGRhdGVzIGF1dG9fcmV2aWV3LnBvbGljeSBpbiBjb25maWcudG9tbC4gTGVhdmUgZW1wdHkgdG8gcmVtb3ZlIHRoZSBhdXRvX3JldmlldyBzZWN0aW9uLlwiLCBcIlx1NjZGNFx1NjVCMCBjb25maWcudG9tbCBcdTRFMkRcdTc2ODQgYXV0b19yZXZpZXcucG9saWN5XHUzMDAyXHU3NTU5XHU3QTdBXHU1MjE5XHU1MjIwXHU5NjY0IGF1dG9fcmV2aWV3IFx1NkJCNVx1MzAwMlwiKTtcblx0XHRjYXNlICdjb2RleC5tb2RlbHMnOlxuXHRcdFx0cmV0dXJuIGZvcmdlTG9jYWxpemUoJ2NvZGV4LmNvbmZpZ3VyYXRpb24ubW9kZWxzLmRlc2NyaXB0aW9uJywgXCJDaG9vc2UgdGhlIGRlZmF1bHQgbW9kZWwgYW5kIHByb3ZpZGVyLCBhbmQgYWRkIGN1c3RvbSBtb2RlbCBwcm92aWRlcnMgc3VjaCBhcyBPbGxhbWEgb3IgYW55IE9wZW5BSS1jb21wYXRpYmxlIGVuZHBvaW50LlwiLCBcIlx1OTAwOVx1NjJFOVx1OUVEOFx1OEJBNFx1NkEyMVx1NTc4Qlx1NTQ4Q1x1NjNEMFx1NEY5Qlx1NTU0Nlx1RkYwQ1x1NUU3Nlx1NkRGQlx1NTJBMCBPbGxhbWEgXHU2MjE2XHU1MTc2XHU0RUQ2IE9wZW5BSSBcdTUxN0NcdTVCQjlcdTYzQTVcdTUzRTNcdTMwMDJcIik7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBmYWxsYmFjaztcblx0fVxufVxuXG5mdW5jdGlvbiB0cmFuc2xhdGVDb2RleEVudW1MYWJlbChrZXk6IHN0cmluZywgb3B0aW9uOiBzdHJpbmcsIGZhbGxiYWNrOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoa2V5ID09PSAnY29kZXgucGVybWlzc2lvbnNQcmVzZXQnKSB7XG5cdFx0c3dpdGNoIChvcHRpb24pIHtcblx0XHRcdGNhc2UgJ2RlZmF1bHQnOlxuXHRcdFx0XHRyZXR1cm4gZm9yZ2VMb2NhbGl6ZSgnY29kZXguY29uZmlndXJhdGlvbi5wZXJtaXNzaW9ucy5kZWZhdWx0JywgXCJEZWZhdWx0XCIsIFwiXHU5RUQ4XHU4QkE0XCIpO1xuXHRcdFx0Y2FzZSAnYXV0by1yZXZpZXcnOlxuXHRcdFx0XHRyZXR1cm4gZm9yZ2VMb2NhbGl6ZSgnY29kZXguY29uZmlndXJhdGlvbi5wZXJtaXNzaW9ucy5hdXRvUmV2aWV3JywgXCJBdXRvLVJldmlld1wiLCBcIlx1ODFFQVx1NTJBOFx1NUJBMVx1NjdFNVwiKTtcblx0XHRcdGNhc2UgJ2Z1bGwtYWNjZXNzJzpcblx0XHRcdFx0cmV0dXJuIGZvcmdlTG9jYWxpemUoJ2NvZGV4LmNvbmZpZ3VyYXRpb24ucGVybWlzc2lvbnMuZnVsbEFjY2VzcycsIFwiRnVsbCBBY2Nlc3NcIiwgXCJcdTVCOENcdTUxNjhcdThCQkZcdTk1RUVcIik7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gZmFsbGJhY2s7XG5cdFx0fVxuXHR9XG5cdGlmIChrZXkgIT09ICdjb2RleC5wZXJzb25hbGl0eScpIHtcblx0XHRyZXR1cm4gZmFsbGJhY2s7XG5cdH1cblx0c3dpdGNoIChvcHRpb24pIHtcblx0XHRjYXNlICdkZWZhdWx0Jzpcblx0XHRcdHJldHVybiBmb3JnZUxvY2FsaXplKCdjb2RleC5jb25maWd1cmF0aW9uLnBlcnNvbmFsaXR5LmRlZmF1bHQnLCBcIkRlZmF1bHRcIiwgXCJcdTlFRDhcdThCQTRcIik7XG5cdFx0Y2FzZSAnZnJpZW5kbHknOlxuXHRcdFx0cmV0dXJuIGZvcmdlTG9jYWxpemUoJ2NvZGV4LmNvbmZpZ3VyYXRpb24ucGVyc29uYWxpdHkuZnJpZW5kbHknLCBcIkZyaWVuZGx5XCIsIFwiXHU1M0NCXHU1OTdEXCIpO1xuXHRcdGNhc2UgJ3ByYWdtYXRpYyc6XG5cdFx0XHRyZXR1cm4gZm9yZ2VMb2NhbGl6ZSgnY29kZXguY29uZmlndXJhdGlvbi5wZXJzb25hbGl0eS5wcmFnbWF0aWMnLCBcIlByYWdtYXRpY1wiLCBcIlx1NTJBMVx1NUI5RVwiKTtcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIGZhbGxiYWNrO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHRyYW5zbGF0ZUNvZGV4RW51bURlc2NyaXB0aW9uKGtleTogc3RyaW5nLCBvcHRpb246IHN0cmluZywgZmFsbGJhY2s6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmIChrZXkgIT09ICdjb2RleC5wZXJtaXNzaW9uc1ByZXNldCcpIHtcblx0XHRyZXR1cm4gZmFsbGJhY2s7XG5cdH1cblx0c3dpdGNoIChvcHRpb24pIHtcblx0XHRjYXNlICdkZWZhdWx0Jzpcblx0XHRcdHJldHVybiBmb3JnZUxvY2FsaXplKCdjb2RleC5jb25maWd1cmF0aW9uLnBlcm1pc3Npb25zLmRlZmF1bHREZXNjcmlwdGlvbicsIFwiUmVhZCBhbmQgZWRpdCBmaWxlcyBpbiB0aGlzIHdvcmtzcGFjZSBhbmQgcnVuIHJvdXRpbmUgbG9jYWwgY29tbWFuZHMuIENvZGV4IGFza3MgYmVmb3JlIGRlbGV0aW5nIGZpbGVzLCB1c2luZyB0aGUgaW50ZXJuZXQsIG9yIHRvdWNoaW5nIHBhdGhzIG91dHNpZGUgdGhlIHdvcmtzcGFjZS5cIiwgXCJcdTUzRUZcdTRFRTVcdThCRkJcdTUzRDZcdTU0OENcdTdGMTZcdThGOTFcdTVGNTNcdTUyNERcdTVERTVcdTRGNUNcdTUzM0FcdTY1ODdcdTRFRjZcdUZGMENcdTVFNzZcdThGRDBcdTg4NENcdTVFMzhcdTg5QzRcdTY3MkNcdTU3MzBcdTU0N0RcdTRFRTRcdTMwMDJcdTUyMjBcdTk2NjRcdTY1ODdcdTRFRjZcdTMwMDFcdThCQkZcdTk1RUVcdTdGNTFcdTdFRENcdTYyMTZcdTRGRUVcdTY1MzlcdTVERTVcdTRGNUNcdTUzM0FcdTU5MTZcdThERUZcdTVGODRcdTUyNERcdTRGMUFcdTUxNDhcdThCRTJcdTk1RUVcdTMwMDJcIik7XG5cdFx0Y2FzZSAnYXV0by1yZXZpZXcnOlxuXHRcdFx0cmV0dXJuIGZvcmdlTG9jYWxpemUoJ2NvZGV4LmNvbmZpZ3VyYXRpb24ucGVybWlzc2lvbnMuYXV0b1Jldmlld0Rlc2NyaXB0aW9uJywgXCJTYW1lIHdvcmtzcGFjZSBhY2Nlc3MgYXMgRGVmYXVsdCwgYnV0IGFwcHJvdmFsIHJlcXVlc3RzIGdvIHRvIHRoZSBhdXRvLXJldmlld2VyIGluc3RlYWQgb2YgYSBwcm9tcHQuXCIsIFwiXHU1NDhDXHU1REU1XHU0RjVDXHU1MzNBXHU2NzQzXHU5NjUwXHU0RTBFXHU5RUQ4XHU4QkE0XHU3NkY4XHU1NDBDXHVGRjBDXHU0RjQ2XHU1QkExXHU2Mjc5XHU4QkY3XHU2QzQyXHU0RUE0XHU3RUQ5XHU4MUVBXHU1MkE4XHU1QkExXHU2N0U1XHVGRjBDXHU4MDBDXHU0RTBEXHU2NjJGXHU1RjM5XHU1MUZBXHU3ODZFXHU4QkE0XHUzMDAyXCIpO1xuXHRcdGNhc2UgJ2Z1bGwtYWNjZXNzJzpcblx0XHRcdHJldHVybiBmb3JnZUxvY2FsaXplKCdjb2RleC5jb25maWd1cmF0aW9uLnBlcm1pc3Npb25zLmZ1bGxBY2Nlc3NEZXNjcmlwdGlvbicsIFwiQ29kZXggY2FuIGVkaXQgb3IgZGVsZXRlIGZpbGVzIGFueXdoZXJlIGFuZCB1c2UgdGhlIGludGVybmV0IHdpdGhvdXQgYXNraW5nLiBVc2Ugb25seSB3aGVuIHlvdSB3YW50IGZ1bGwgbWFjaGluZSBhY2Nlc3MuXCIsIFwiXHU1M0VGXHU0RUU1XHU1NzI4XHU0RUZCXHU2MTBGXHU0RjREXHU3RjZFXHU3RjE2XHU4RjkxXHU2MjE2XHU1MjIwXHU5NjY0XHU2NTg3XHU0RUY2XHVGRjBDXHU1RTc2XHU2NUUwXHU5NzAwXHU3ODZFXHU4QkE0XHU1NzMwXHU4QkJGXHU5NUVFXHU3RjUxXHU3RURDXHUzMDAyXHU0RUM1XHU1NzI4XHU5NzAwXHU4OTgxXHU1QjhDXHU1MTY4XHU2NzJDXHU2NzNBXHU4QkJGXHU5NUVFXHU2NUY2XHU0RjdGXHU3NTI4XHUzMDAyXCIpO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gZmFsbGJhY2s7XG5cdH1cbn1cblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsY0FBYztBQUN2QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFlBQVksaUJBQWlCLHlCQUF5QjtBQUMvRCxTQUFTLGVBQWlDO0FBQzFDLFNBQVMsV0FBVztBQUNwQixTQUFTLHNDQUFrRjtBQUMzRixTQUFTLDJCQUEyQiwyQkFBMkIsdUJBQXVCO0FBQ3RGLFNBQVMsb0NBQW9DLGtDQUFrQyxlQUFlLHlCQUF5Qix1Q0FBa0U7QUFDekwsU0FBUyxlQUFlLHFCQUFxQix3QkFBd0I7QUFFckUsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsUUFBUSxpQkFBaUIsMEJBQTBCO0FBQzVELFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMscUJBQXFCLDhCQUE4QjtBQUM1RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJCQUEyQjtBQWM3QixJQUFNLHlCQUFOLGNBQXFDLFdBQVc7QUFBQSxFQU90RCxZQUFZLFFBQXNDLGVBQXVCLFFBQTJGLE9BQWdDLE9BQzdKLG9CQUNDLHFC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
