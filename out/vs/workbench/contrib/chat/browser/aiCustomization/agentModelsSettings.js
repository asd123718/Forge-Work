import * as DOM from "../../../../../base/browser/dom.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { SelectBox } from "../../../../../base/browser/ui/selectBox/selectBox.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { allocateCodexProviderId, defaultCodexModelProviderEntry, discoversCodexLocalModels, getCodexModelCatalogEntry, isLocalCatalog, isOllamaCatalog, listCodexModelCatalog, normalizeCodexModelsConfig, withDefaultCodexRouting } from "../../../../../platform/agentHost/common/codexModelsConfig.js";
import { isOfficialLockedModel, isOfficialModelProvider, officialModelCardSpec } from "../../../../../platform/agentHost/common/officialModelCards.js";
import { forgeLocalize } from "../../../../../platform/agentHost/common/forgeLocale.js";
import { ollamaTagsUrl, parseOllamaTagsJson, uniqueModelNames } from "../../../../../platform/native/common/ollamaList.js";
import { defaultButtonStyles, defaultSelectBoxStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
const INSERT_SHIFT_MS = 170;
const INSERT_POP_MS = 200;
class AgentModelsSettings extends Disposable {
  constructor(parent, value, onSave, readApiKey, writeApiKey, contextViewService, discoverLocalModelsFn) {
    super();
    this.onSave = onSave;
    this.readApiKey = readApiKey;
    this.writeApiKey = writeApiKey;
    this.contextViewService = contextViewService;
    this.discoverLocalModelsFn = discoverLocalModelsFn;
    this.renderDisposables = this._register(new DisposableStore());
    this.pendingApiKeys = /* @__PURE__ */ new Map();
    this.discoveredLocalModels = /* @__PURE__ */ new Map();
    this.discoveringLocal = /* @__PURE__ */ new Set();
    this.localSelects = /* @__PURE__ */ new Map();
    this.catalogSelects = /* @__PURE__ */ new Map();
    this.modelNewButtons = /* @__PURE__ */ new Map();
    this.modelRemoveButtons = /* @__PURE__ */ new Map();
    const config = normalizeCodexModelsConfig(value);
    this.model = config.model;
    this.modelProvider = config.modelProvider;
    this.providers = config.providers.length > 0 ? [...config.providers] : [defaultCodexModelProviderEntry()];
    this.activeProviderId = config.activeProviderId ?? this.providers[0]?.id;
    this.originalProviders = config.providers;
    this.container = DOM.append(parent, DOM.$(".agent-models-settings"));
    this.render();
    void this.hydrateStoredApiKeys();
  }
  focus() {
    this.focusTarget?.();
  }
  activeProviderIndex() {
    const byId = this.providers.findIndex((provider) => provider.id !== "" && provider.id === this.activeProviderId);
    if (byId >= 0) {
      return byId;
    }
    const unsaved = this.providers.findIndex((provider) => provider.id === this.activeProviderId || this.activeProviderId === void 0 && provider.id === "");
    return unsaved >= 0 ? unsaved : 0;
  }
  discoveryKey(provider) {
    return provider.id || `draft:${this.providers.indexOf(provider)}`;
  }
  visibleModels(provider) {
    if (provider.models.length > 0) {
      return provider.models.map((model) => ({ ...model }));
    }
    return [{ name: provider.selectedModel, enabled: true }];
  }
  usedCatalogIds(exceptIndex) {
    return new Set(this.providers.filter((provider, index) => index !== exceptIndex && !isOfficialModelProvider(provider)).map((provider) => provider.catalogId));
  }
  nextUnusedCatalogId() {
    const used = this.usedCatalogIds();
    return listCodexModelCatalog().find((entry) => !used.has(entry.id))?.id;
  }
  usedModelNames(index, exceptRow) {
    return new Set(this.visibleModels(this.providers[index]).filter((_, rowIndex) => rowIndex !== exceptRow).map((model) => model.name.trim()).filter((name) => name !== ""));
  }
  canAddModelRow(index) {
    const provider = this.providers[index];
    if (!provider) {
      return false;
    }
    return !this.visibleModels(provider).some((model) => model.name.trim() === "");
  }
  catalogSelectOptions(index) {
    const used = this.usedCatalogIds(index);
    return listCodexModelCatalog().map((entry) => ({
      value: entry.id,
      label: entry.label,
      disabled: used.has(entry.id),
      detail: used.has(entry.id) ? forgeLocalize("codex.models.provider.alreadyAdded", "Already added", "\u5DF2\u6DFB\u52A0") : entry.group === "local" ? forgeLocalize("codex.models.provider.group.local", "Local", "\u672C\u5730") : forgeLocalize("codex.models.provider.group.cloud", "Cloud", "\u4E91\u7AEF")
    }));
  }
  render() {
    this.renderDisposables.clear();
    this.localSelects.clear();
    this.catalogSelects.clear();
    this.modelNewButtons.clear();
    this.modelRemoveButtons.clear();
    this.listEl = void 0;
    this.addProviderButton = void 0;
    DOM.clearNode(this.container);
    this.focusTarget = void 0;
    if (this.providers.length === 0) {
      this.providers = [defaultCodexModelProviderEntry()];
    }
    const providersSection = DOM.append(this.container, DOM.$(".agent-models-providers"));
    const providersHeader = DOM.append(providersSection, DOM.$(".agent-models-providers-header"));
    const providersCopy = DOM.append(providersHeader, DOM.$(".agent-models-providers-copy"));
    DOM.append(providersCopy, DOM.$(".agent-models-providers-title")).textContent = forgeLocalize("codex.models.customProviders", "Providers", "\u63D0\u4F9B\u5546");
    DOM.append(providersCopy, DOM.$(".agent-models-providers-description")).textContent = forgeLocalize("codex.models.customProviders.description", "New next to Providers adds another provider card. New next to Model name adds another model on this card.", "\u9876\u90E8\u65B0\u5EFA\u6DFB\u52A0\u63D0\u4F9B\u5546\u5361\u7247\u3002\u6A21\u578B\u540D\u79F0\u65C1\u7684\u65B0\u5EFA\u4F1A\u5728\u540C\u4E00\u5F20\u5361\u7247\u91CC\u518D\u52A0\u4E00\u4E2A\u6A21\u578B\u3002");
    const addButton = this.renderDisposables.add(new Button(providersHeader, { ...defaultButtonStyles, secondary: true }));
    addButton.label = forgeLocalize("codex.models.addProvider", "New", "\u65B0\u5EFA");
    this.addProviderButton = addButton;
    this.renderDisposables.add(addButton.onDidClick(() => this.addProviderBlock()));
    this.listEl = DOM.append(providersSection, DOM.$(".agent-models-providers-list"));
    for (let i = 0; i < this.providers.length; i++) {
      this.renderProvider(DOM.append(this.listEl, DOM.$(".agent-models-provider")), i);
      if (discoversCodexLocalModels(this.providers[i].catalogId)) {
        this.ensureLocalDiscovery(this.providers[i]);
      }
    }
    this.syncAddButtons();
  }
  addProviderBlock() {
    const catalogId = this.nextUnusedCatalogId();
    if (!catalogId) {
      this.showError(forgeLocalize("codex.models.provider.allAdded", "Every provider has already been added.", "\u6240\u6709\u63D0\u4F9B\u5546\u90FD\u5DF2\u7ECF\u6DFB\u52A0\u8FC7\u4E86\u3002"));
      return;
    }
    const before = this.snapshotLayout();
    const next = defaultCodexModelProviderEntry(catalogId);
    this.providers = [...this.providers, next];
    this.activeProviderId = `draft:${this.providers.length - 1}`;
    if (!this.listEl) {
      this.render();
      return;
    }
    const card = DOM.append(this.listEl, DOM.$(".agent-models-provider"));
    this.renderProvider(card, this.providers.length - 1);
    if (discoversCodexLocalModels(catalogId)) {
      this.ensureLocalDiscovery(this.providers[this.providers.length - 1]);
    }
    this.refreshCatalogSelects();
    this.syncAddButtons();
    this.playInsertAnimation(before, card);
  }
  addModelRow(index) {
    if (!this.canAddModelRow(index)) {
      this.showError(forgeLocalize("codex.models.model.alreadyAdded", "This model has already been added, or finish the empty model row first.", "\u8BE5\u6A21\u578B\u5DF2\u7ECF\u6DFB\u52A0\u8FC7\u4E86\uFF0C\u6216\u8BF7\u5148\u5B8C\u6210\u5F53\u524D\u7A7A\u767D\u7684\u6A21\u578B\u540D\u79F0\u3002"));
      return;
    }
    const before = this.snapshotLayout();
    const rows = this.visibleModels(this.providers[index]);
    this.updateProvider(index, { models: [...rows, { name: "", enabled: true }] });
    const card = this.listEl?.children[index];
    const modelRows = card?.querySelector(".agent-models-model-rows");
    if (!modelRows) {
      this.render();
      return;
    }
    const nextRows = this.visibleModels(this.providers[index]);
    const catalog = getCodexModelCatalogEntry(this.providers[index].catalogId);
    this.renderModelRow(modelRows, index, nextRows.length - 1, nextRows, catalog);
    const inserted = modelRows.lastElementChild;
    this.refreshLocalSelects(this.discoveryKey(this.providers[index]));
    this.syncAddButtons();
    if (inserted) {
      this.playInsertAnimation(before, inserted);
    }
  }
  removeModelRow(index, rowIndex) {
    const provider = this.providers[index];
    const rows = this.visibleModels(provider);
    if (isOfficialLockedModel(provider, rows[rowIndex]?.name ?? "")) {
      this.showError(forgeLocalize("codex.models.official.modelLocked", "Official models on this card cannot be deleted.", "\u5B98\u65B9\u6A21\u578B\u4E0D\u80FD\u5220\u9664\u3002"));
      return;
    }
    const nextRows = rows.filter((_, i) => i !== rowIndex);
    const next = nextRows.length > 0 ? nextRows : [{ name: "", enabled: true }];
    this.updateProvider(index, { models: next, selectedModel: next.find((model) => model.name.trim() !== "")?.name ?? "" });
    if (this.providers[index].id && this.originalProviders.some((candidate) => candidate.id === this.providers[index].id)) {
      void this.persist(false);
      return;
    }
    this.render();
  }
  renderProvider(card, index) {
    const provider = this.providers[index];
    const catalog = getCodexModelCatalogEntry(provider.catalogId);
    const official = isOfficialModelProvider(provider);
    card.dataset["layoutId"] = `provider:${this.discoveryKey(provider)}`;
    if (official) {
      card.classList.add("agent-models-provider-official");
    }
    const header = DOM.append(card, DOM.$(".agent-models-provider-header"));
    const identity = DOM.append(header, DOM.$(".agent-models-provider-identity"));
    DOM.append(identity, DOM.$(".agent-models-provider-title")).textContent = provider.name || catalog.label;
    if (official) {
      DOM.append(identity, DOM.$(".agent-models-provider-subtitle")).textContent = forgeLocalize(
        "codex.models.official.subtitle",
        "Official model card. Synced after sign-in and cannot be deleted.",
        "\u5B98\u65B9\u6A21\u578B\u5361 \xB7 \u767B\u5F55\u540E\u81EA\u52A8\u540C\u6B65\uFF0C\u4E0D\u53EF\u5220\u9664"
      );
    }
    const actions = DOM.append(header, DOM.$(".agent-models-provider-actions"));
    this.renderSwitch(actions, provider.enabled, forgeLocalize("codex.models.provider.enabled", "Show this provider in the agent picker", "\u5728 Agent \u6A21\u578B\u5217\u8868\u4E2D\u663E\u793A\u6B64\u63D0\u4F9B\u5546"), (enabled) => {
      this.updateProvider(index, { enabled });
      void this.persistIfSaved(index);
    });
    if (!official) {
      const removeButton = this.renderDisposables.add(new Button(actions, { ...defaultButtonStyles, secondary: true }));
      removeButton.label = forgeLocalize("codex.models.provider.remove", "Remove", "\u5220\u9664");
      this.renderDisposables.add(removeButton.onDidClick(() => {
        const removed = this.providers[index];
        this.providers = this.providers.filter((_, i) => i !== index);
        if (this.providers.length === 0) {
          this.providers = [defaultCodexModelProviderEntry()];
        }
        this.activeProviderId = this.providers[Math.min(index, this.providers.length - 1)]?.id || `draft:0`;
        if (removed.id && this.originalProviders.some((candidate) => candidate.id === removed.id)) {
          void this.persist(false);
        } else {
          this.render();
        }
      }));
    }
    const fields = DOM.append(card, DOM.$(".agent-models-provider-fields"));
    if (official) {
      this.renderLockedCatalog(fields, catalog.label);
    } else {
      const catalogOptions = this.catalogSelectOptions(index);
      const catalogSelect = this.renderProviderSelect(fields, forgeLocalize("codex.models.provider.kind", "Provider", "\u6A21\u578B\u63D0\u4F9B\u5546"), catalogOptions, provider.catalogId);
      this.catalogSelects.set(index, catalogSelect);
      this.renderDisposables.add(catalogSelect.onDidSelect((event) => {
        const selected = catalogOptions[event.index];
        if (!selected || selected.disabled) {
          return;
        }
        const nextCatalog = getCodexModelCatalogEntry(selected.value);
        if (this.usedCatalogIds(index).has(nextCatalog.id)) {
          this.showError(forgeLocalize("codex.models.provider.alreadyAdded.error", 'Provider "{0}" has already been added.', "\u63D0\u4F9B\u5546\u201C{0}\u201D\u5DF2\u7ECF\u6DFB\u52A0\u8FC7\u4E86\u3002", nextCatalog.label));
          return;
        }
        this.applyCatalog(index, nextCatalog);
        this.render();
      }));
    }
    const modelRows = DOM.append(fields, DOM.$(".agent-models-model-rows.agent-models-provider-field-wide"));
    const rows = this.visibleModels(provider);
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      this.renderModelRow(modelRows, index, rowIndex, rows, catalog);
    }
    const urlPlaceholder = official && provider.officialSource ? officialModelCardSpec(provider.officialSource).defaultBaseUrl : catalog.autoConfigure ? catalog.defaultBaseUrl : forgeLocalize("codex.models.provider.baseUrl.placeholder", "https://api.example.com/v1", "https://api.example.com/v1");
    const baseUrlInput = this.renderProviderField(
      fields,
      forgeLocalize("codex.models.provider.baseUrl", "Provider URL", "\u63D0\u4F9B\u5546\u7F51\u5740"),
      urlPlaceholder,
      provider.baseUrl,
      "text",
      "agent-models-provider-field-wide",
      `field:${this.discoveryKey(provider)}:url`
    );
    if (!official && catalog.autoConfigure && !provider.baseUrl) {
      baseUrlInput.value = catalog.defaultBaseUrl;
      this.updateProvider(index, { baseUrl: catalog.defaultBaseUrl });
    }
    this.renderDisposables.add(DOM.addDisposableListener(baseUrlInput, "input", () => {
      this.updateProvider(index, { baseUrl: baseUrlInput.value.trim() });
      if (discoversCodexLocalModels(this.providers[index].catalogId)) {
        this.discoveredLocalModels.delete(this.discoveryKey(this.providers[index]));
      }
    }));
    if (official || !catalog.autoConfigure) {
      const apiKeyInput = this.renderProviderField(
        fields,
        forgeLocalize("codex.models.provider.apiKey", "API key", "API \u5BC6\u94A5"),
        official ? forgeLocalize("codex.models.official.apiKey.placeholder", "Optional fallback API key", "\u53EF\u9009\u5907\u7528 API \u5BC6\u94A5\uFF08\u9ED8\u8BA4\u4E3A\u7A7A\uFF09") : forgeLocalize("codex.models.provider.apiKey.placeholder", "Enter the API key", "\u8BF7\u8F93\u5165 API \u5BC6\u94A5"),
        "",
        "password",
        "agent-models-provider-field-wide",
        `field:${this.discoveryKey(provider)}:api`
      );
      this.renderDisposables.add(DOM.addDisposableListener(apiKeyInput, "input", () => {
        const id = this.ensureProviderId(index);
        this.pendingApiKeys.set(id, apiKeyInput.value);
        this.updateProvider(index, { authMode: "stored" });
      }));
    }
  }
  renderLockedCatalog(parent, label) {
    const field = DOM.append(parent, DOM.$(".agent-models-provider-field"));
    DOM.append(field, DOM.$(".agent-models-provider-field-label")).textContent = forgeLocalize("codex.models.provider.kind", "Provider", "\u6A21\u578B\u63D0\u4F9B\u5546");
    const locked = DOM.append(field, DOM.$(".agent-models-provider-locked"));
    locked.textContent = label;
  }
  renderModelRow(parent, index, rowIndex, rows, catalog) {
    const model = rows[rowIndex];
    const officialLocked = isOfficialLockedModel(this.providers[index], model.name);
    const field = DOM.append(parent, DOM.$(".agent-models-provider-field.agent-models-model-row"));
    field.dataset["layoutId"] = `model:${this.discoveryKey(this.providers[index])}:${rowIndex}`;
    DOM.append(field, DOM.$(".agent-models-provider-field-label")).textContent = forgeLocalize("codex.models.provider.modelName", "Model name", "\u6A21\u578B\u540D\u79F0");
    const controls = DOM.append(field, DOM.$(".agent-models-model-controls"));
    if (discoversCodexLocalModels(catalog.id) && !officialLocked) {
      this.renderLocalModelSelect(controls, index, rowIndex, model);
    } else {
      const input = DOM.append(controls, DOM.$("input.agent-global-configuration-settings-input.agent-models-model-input"));
      input.value = model.name;
      input.placeholder = isLocalCatalog(catalog.id) ? forgeLocalize("codex.models.provider.modelName.localPlaceholder", "e.g. qwen3-coder", "\u4F8B\u5982 qwen3-coder") : forgeLocalize("codex.models.provider.modelName.placeholder", "e.g. gpt-5.6", "\u4F8B\u5982 gpt-5.6");
      input.ariaLabel = forgeLocalize("codex.models.provider.modelName", "Model name", "\u6A21\u578B\u540D\u79F0");
      if (officialLocked) {
        input.readOnly = true;
        input.title = forgeLocalize("codex.models.official.modelLocked", "Official models on this card cannot be deleted.", "\u5B98\u65B9\u6A21\u578B\u4E0D\u80FD\u5220\u9664\u3002");
      } else {
        this.renderDisposables.add(DOM.addDisposableListener(input, "input", () => {
          this.updateModelRow(index, rowIndex, { name: input.value });
          const accepted = this.visibleModels(this.providers[index])[rowIndex]?.name ?? "";
          if (input.value.trim() !== "" && input.value.trim() !== accepted && this.usedModelNames(index, rowIndex).has(input.value.trim())) {
            input.value = accepted;
          }
        }));
      }
      this.focusTarget ??= () => input.focus();
    }
    this.renderSwitch(controls, model.enabled, forgeLocalize("codex.models.model.enabled", "Show this model in the agent picker", "\u5728 Agent \u6A21\u578B\u5217\u8868\u4E2D\u663E\u793A\u6B64\u6A21\u578B"), (enabled) => {
      this.updateModelRow(index, rowIndex, { enabled });
      void this.persistIfSaved(index);
    });
    const newButton = this.renderDisposables.add(new Button(controls, { ...defaultButtonStyles, secondary: true }));
    newButton.label = forgeLocalize("codex.models.model.new", "New", "\u65B0\u5EFA");
    const buttons = this.modelNewButtons.get(index) ?? [];
    buttons.push(newButton);
    this.modelNewButtons.set(index, buttons);
    this.renderDisposables.add(newButton.onDidClick(() => this.addModelRow(index)));
    const saveButton = this.renderDisposables.add(new Button(controls, { ...defaultButtonStyles }));
    saveButton.label = forgeLocalize("codex.models.model.save", "Save", "\u4FDD\u5B58");
    this.renderDisposables.add(saveButton.onDidClick(() => void this.saveModels(index)));
    const removeButton = this.renderDisposables.add(new Button(controls, { ...defaultButtonStyles, secondary: true }));
    removeButton.label = forgeLocalize("codex.models.model.remove", "Remove", "\u5220\u9664");
    const removeButtons = this.modelRemoveButtons.get(index) ?? [];
    removeButtons.push(removeButton);
    this.modelRemoveButtons.set(index, removeButtons);
    removeButton.enabled = !officialLocked && rows.length > 1;
    this.renderDisposables.add(removeButton.onDidClick(() => this.removeModelRow(index, rowIndex)));
  }
  renderLocalModelSelect(controls, index, rowIndex, model) {
    if (!this.contextViewService) {
      throw new Error("A context view service is required to render model provider selects.");
    }
    const provider = this.providers[index];
    const key = this.discoveryKey(provider);
    const discovered = this.discoveredLocalModels.get(key) ?? [];
    const loading = this.discoveringLocal.has(key);
    const options = this.localModelOptions(provider, model, index, rowIndex, discovered, loading, this.discoveredLocalModels.has(key));
    const selected = Math.max(0, options.findIndex((option) => option.value === model.name && option.value !== ""));
    const selectContainer = DOM.append(controls, DOM.$(".agent-models-provider-select.agent-models-model-input"));
    const select = this.renderDisposables.add(new SelectBox(
      this.toSelectItems(options),
      selected,
      this.contextViewService,
      { ...defaultSelectBoxStyles },
      { ariaLabel: forgeLocalize("codex.models.provider.modelName", "Model name", "\u6A21\u578B\u540D\u79F0"), useCustomDrawn: true, minBottomMargin: 8 }
    ));
    select.render(selectContainer);
    this.localSelects.set(`${key}:${rowIndex}`, { providerIndex: index, rowIndex, select });
    this.renderDisposables.add(select.onDidSelect((event) => {
      const current = this.providers[index];
      const latest = this.localModelOptions(
        current,
        this.visibleModels(current)[rowIndex] ?? { name: "", enabled: true },
        index,
        rowIndex,
        this.discoveredLocalModels.get(this.discoveryKey(current)) ?? [],
        this.discoveringLocal.has(this.discoveryKey(current)),
        this.discoveredLocalModels.has(this.discoveryKey(current))
      );
      const value = latest[event.index]?.value ?? "";
      if (!value) {
        return;
      }
      if (this.usedModelNames(index, rowIndex).has(value)) {
        this.showError(forgeLocalize("codex.models.model.duplicate", 'Model "{0}" has already been added.', "\u6A21\u578B\u201C{0}\u201D\u5DF2\u7ECF\u6DFB\u52A0\u8FC7\u4E86\u3002", value));
        return;
      }
      this.updateModelRow(index, rowIndex, { name: value });
      this.refreshLocalSelects(this.discoveryKey(this.providers[index]));
      this.syncAddButtons();
    }));
    const startDiscovery = () => this.ensureLocalDiscovery(this.providers[index], true);
    this.renderDisposables.add(DOM.addDisposableListener(selectContainer, "pointerdown", startDiscovery, true));
    this.renderDisposables.add(DOM.addDisposableListener(selectContainer, "keydown", startDiscovery, true));
    this.focusTarget ??= () => select.focus();
  }
  renderSwitch(parent, checked, title, onChange) {
    const button = DOM.append(parent, DOM.$("button.agent-models-switch"));
    button.type = "button";
    button.title = title;
    button.setAttribute("role", "switch");
    button.setAttribute("aria-checked", String(checked));
    button.setAttribute("aria-label", title);
    this.renderDisposables.add(DOM.addDisposableListener(button, "click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const next = button.getAttribute("aria-checked") !== "true";
      onChange(next);
      button.setAttribute("aria-checked", String(next));
    }));
  }
  renderProviderField(parent, label, placeholder, value, type = "text", className, layoutId) {
    const field = DOM.append(parent, DOM.$(".agent-models-provider-field"));
    if (className) {
      field.classList.add(className);
    }
    if (layoutId) {
      field.dataset["layoutId"] = layoutId;
    }
    DOM.append(field, DOM.$(".agent-models-provider-field-label")).textContent = label;
    const input = DOM.append(field, DOM.$("input.agent-global-configuration-settings-input"));
    input.value = value;
    input.type = type;
    input.placeholder = placeholder;
    input.ariaLabel = label;
    return input;
  }
  renderProviderSelect(parent, label, options, value) {
    const field = DOM.append(parent, DOM.$(".agent-models-provider-field"));
    DOM.append(field, DOM.$(".agent-models-provider-field-label")).textContent = label;
    const selectContainer = DOM.append(field, DOM.$(".agent-models-provider-select"));
    const selected = Math.max(0, options.findIndex((option) => option.value === value));
    if (!this.contextViewService) {
      throw new Error("A context view service is required to render model provider selects.");
    }
    const select = this.renderDisposables.add(new SelectBox(
      options.map((option) => ({ text: option.label, detail: option.detail, isDisabled: option.disabled })),
      selected,
      this.contextViewService,
      { ...defaultSelectBoxStyles },
      { ariaLabel: label, useCustomDrawn: true, minBottomMargin: 8 }
    ));
    select.render(selectContainer);
    return select;
  }
  applyCatalog(index, catalog) {
    const provider = this.providers[index];
    const previous = getCodexModelCatalogEntry(provider.catalogId);
    const keepUrl = provider.baseUrl !== "" && provider.baseUrl !== previous.defaultBaseUrl;
    this.updateProvider(index, {
      catalogId: catalog.id,
      name: catalog.label,
      kind: catalog.kind,
      baseUrl: catalog.autoConfigure ? keepUrl ? provider.baseUrl : catalog.defaultBaseUrl : keepUrl ? provider.baseUrl : "",
      authMode: catalog.autoConfigure ? "none" : "stored",
      envKey: ""
    });
  }
  updateProvider(index, patch) {
    this.providers = this.providers.map((p, i) => i === index ? { ...p, ...patch } : p);
  }
  updateModelRow(index, rowIndex, patch) {
    const rows = this.visibleModels(this.providers[index]);
    if (!rows[rowIndex]) {
      return;
    }
    if (patch.name !== void 0) {
      const name = patch.name.trim();
      if (name && this.usedModelNames(index, rowIndex).has(name)) {
        this.showError(forgeLocalize("codex.models.model.duplicate", 'Model "{0}" has already been added.', "\u6A21\u578B\u201C{0}\u201D\u5DF2\u7ECF\u6DFB\u52A0\u8FC7\u4E86\u3002", name));
        return;
      }
    }
    rows[rowIndex] = { ...rows[rowIndex], ...patch };
    const selectedModel = (patch.name ?? rows[rowIndex].name).trim() || this.providers[index].selectedModel;
    this.updateProvider(index, { models: rows, selectedModel });
    this.container.querySelector(".agent-models-error")?.remove();
  }
  ensureProviderId(index) {
    const provider = this.providers[index];
    if (provider.id) {
      return provider.id;
    }
    const id = allocateCodexProviderId(provider.catalogId, this.providers.map((candidate) => candidate.id).filter((candidate) => candidate !== ""));
    this.updateProvider(index, { id });
    if (!this.activeProviderId || this.activeProviderId.startsWith("draft:")) {
      this.activeProviderId = id;
    }
    return id;
  }
  async saveModels(index) {
    this.ensureProviderId(index);
    const seen = /* @__PURE__ */ new Set();
    const rows = this.visibleModels(this.providers[index]).map((model) => ({ ...model, name: model.name.trim() })).filter((model) => {
      if (model.name === "" || seen.has(model.name)) {
        return false;
      }
      seen.add(model.name);
      return true;
    });
    const selectedModel = rows.find((model) => model.name === this.providers[index].selectedModel)?.name ?? rows[0]?.name ?? "";
    this.updateProvider(index, { models: rows, selectedModel });
    const error = await this.persist(false);
    if (error) {
      return;
    }
    this.syncAddButtons();
  }
  async persistIfSaved(index) {
    const provider = this.providers[index];
    if (provider?.id && this.originalProviders.some((candidate) => candidate.id === provider.id)) {
      await this.persist(false);
    }
  }
  async hydrateStoredApiKeys() {
    for (const provider of this.providers.filter((candidate) => candidate.authMode === "stored" && candidate.id)) {
      const apiKey = await this.readApiKey?.(provider.id);
      if (apiKey) {
        await this.writeApiKey?.(provider.id, apiKey);
      }
    }
  }
  toSelectItems(options) {
    return options.map((option) => ({ text: option.label, isDisabled: option.disabled || option.value === "" }));
  }
  localModelOptions(provider, row, providerIndex, rowIndex, discovered, loading, attempted) {
    const used = this.usedModelNames(providerIndex, rowIndex);
    const names = uniqueModelNames([row.name, ...discovered]).filter((name) => name === row.name.trim() || !used.has(name));
    if (names.length > 0) {
      const items = names.map((name) => ({ value: name, label: name, disabled: used.has(name) && name !== row.name.trim() }));
      if (!row.name.trim()) {
        return [{
          value: "",
          label: forgeLocalize("codex.models.local.choose", "Select a model", "\u9009\u62E9\u6A21\u578B")
        }, ...items];
      }
      return items;
    }
    if (loading) {
      return [{
        value: "",
        label: isOllamaCatalog(provider.catalogId) ? forgeLocalize("codex.models.ollama.loading", "Detecting models with ollama list...", "\u6B63\u5728\u7528 ollama list \u68C0\u6D4B\u6A21\u578B...") : forgeLocalize("codex.models.local.loading", "Detecting local models...", "\u6B63\u5728\u81EA\u52A8\u68C0\u6D4B\u672C\u5730\u6A21\u578B...")
      }];
    }
    if (!attempted) {
      return [{
        value: "",
        label: forgeLocalize("codex.models.local.openToDetect", "Open to auto-detect models", "\u6253\u5F00\u4E0B\u62C9\u5217\u4EE5\u81EA\u52A8\u68C0\u6D4B")
      }];
    }
    return [{
      value: "",
      label: isOllamaCatalog(provider.catalogId) ? forgeLocalize("codex.models.ollama.empty", "No Ollama models detected", "\u672A\u68C0\u6D4B\u5230 Ollama \u6A21\u578B") : forgeLocalize("codex.models.local.empty", "No local models detected", "\u672A\u68C0\u6D4B\u5230\u672C\u5730\u6A21\u578B")
    }];
  }
  refreshLocalSelects(key) {
    for (const [selectKey, entry] of this.localSelects) {
      if (!selectKey.startsWith(`${key}:`)) {
        continue;
      }
      const provider = this.providers[entry.providerIndex];
      if (!provider) {
        continue;
      }
      const row = this.visibleModels(provider)[entry.rowIndex] ?? { name: "", enabled: true };
      const options = this.localModelOptions(
        provider,
        row,
        entry.providerIndex,
        entry.rowIndex,
        this.discoveredLocalModels.get(key) ?? [],
        this.discoveringLocal.has(key),
        this.discoveredLocalModels.has(key)
      );
      const selected = Math.max(0, options.findIndex((option) => option.value === row.name && option.value !== ""));
      entry.select.setOptions(this.toSelectItems(options), selected);
    }
  }
  refreshCatalogSelects() {
    for (const [index, select] of this.catalogSelects) {
      const options = this.catalogSelectOptions(index);
      const selected = Math.max(0, options.findIndex((option) => option.value === this.providers[index]?.catalogId));
      select.setOptions(options.map((option) => ({ text: option.label, detail: option.detail, isDisabled: option.disabled })), selected);
    }
  }
  syncAddButtons() {
    if (this.addProviderButton) {
      this.addProviderButton.enabled = !!this.nextUnusedCatalogId();
    }
    for (const [index, buttons] of this.modelNewButtons) {
      const enabled = this.canAddModelRow(index);
      for (const button of buttons) {
        button.enabled = enabled;
      }
    }
    for (const [index, buttons] of this.modelRemoveButtons) {
      const provider = this.providers[index] ?? defaultCodexModelProviderEntry();
      const rows = this.visibleModels(provider);
      buttons.forEach((button, rowIndex) => {
        button.enabled = rows.length > 1 && !isOfficialLockedModel(provider, rows[rowIndex]?.name ?? "");
      });
    }
  }
  snapshotLayout() {
    const map = /* @__PURE__ */ new Map();
    for (const el of this.container.querySelectorAll("[data-layout-id]")) {
      const id = el.dataset["layoutId"];
      if (id) {
        map.set(id, el.getBoundingClientRect());
      }
    }
    return map;
  }
  prefersReducedMotion() {
    return this.container.ownerDocument.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches === true;
  }
  playInsertAnimation(before, inserted) {
    const finish = () => {
      inserted.classList.remove("agent-models-enter", "agent-models-enter-pending");
      inserted.style.pointerEvents = "";
      inserted.style.opacity = "";
      inserted.style.transform = "";
      for (const el of moving) {
        el.classList.remove("agent-models-layout-moving");
        el.style.transition = "";
        el.style.transform = "";
        el.style.pointerEvents = "";
      }
    };
    const moving = [];
    if (this.prefersReducedMotion()) {
      finish();
      inserted.scrollIntoView({ block: "nearest" });
      return;
    }
    for (const node of this.container.querySelectorAll("[data-layout-id]")) {
      const el = node;
      if (el === inserted) {
        continue;
      }
      const first = el.dataset["layoutId"] ? before.get(el.dataset["layoutId"]) : void 0;
      if (!first) {
        continue;
      }
      const last = el.getBoundingClientRect();
      const dy = first.top - last.top;
      if (Math.abs(dy) < 0.5) {
        continue;
      }
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
      el.classList.add("agent-models-layout-moving");
      moving.push(el);
    }
    inserted.classList.add("agent-models-enter-pending");
    inserted.getBoundingClientRect();
    const win = this.container.ownerDocument.defaultView;
    win?.requestAnimationFrame(() => {
      for (const el of moving) {
        el.style.transition = `transform ${INSERT_SHIFT_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
        el.style.transform = "";
      }
    });
    const pop = () => {
      inserted.classList.remove("agent-models-enter-pending");
      inserted.classList.add("agent-models-enter");
      inserted.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    if (moving.length > 0) {
      win?.setTimeout(pop, INSERT_SHIFT_MS);
    } else {
      win?.requestAnimationFrame(pop);
    }
    inserted.addEventListener("animationend", (event) => {
      if (event.target === inserted) {
        finish();
      }
    }, { once: true });
    win?.setTimeout(finish, INSERT_SHIFT_MS + INSERT_POP_MS + 80);
  }
  ensureLocalDiscovery(provider, force = false) {
    if (!provider || !discoversCodexLocalModels(provider.catalogId)) {
      return;
    }
    const key = this.discoveryKey(provider);
    if (!force && (this.discoveringLocal.has(key) || this.discoveredLocalModels.has(key))) {
      return;
    }
    if (this.discoveringLocal.has(key)) {
      return;
    }
    this.discoveringLocal.add(key);
    if (!this.discoveredLocalModels.has(key)) {
      this.refreshLocalSelects(key);
    }
    const catalog = getCodexModelCatalogEntry(provider.catalogId);
    void this.discoverLocalModels(catalog, provider.baseUrl || catalog.defaultBaseUrl).then((models) => {
      this.discoveringLocal.delete(key);
      this.discoveredLocalModels.set(key, models);
      this.refreshLocalSelects(key);
      this.syncAddButtons();
    });
  }
  async discoverLocalModels(catalog, baseUrl) {
    if (this.discoverLocalModelsFn) {
      return uniqueModelNames(await this.discoverLocalModelsFn(catalog.id, baseUrl));
    }
    try {
      if (isOllamaCatalog(catalog.id)) {
        return await this.discoverOllamaModels(baseUrl);
      }
      const url = new URL(baseUrl || catalog.defaultBaseUrl || "http://localhost:1234/v1");
      url.search = "";
      url.hash = "";
      if (catalog.kind === "lmstudio") {
        url.pathname = `${url.pathname.replace(/\/(?:v1|api)\/?$/, "").replace(/\/$/, "")}/api/v0/models`;
      } else if (!/\/models\/?$/.test(url.pathname)) {
        url.pathname = `${url.pathname.replace(/\/$/, "")}/models`;
      }
      const response = await fetch(url.toString());
      if (!response.ok) {
        return [];
      }
      const body = await response.json();
      const raw = Array.isArray(body.data) ? body.data : Array.isArray(body.models) ? body.models : Array.isArray(body) ? body : [];
      return uniqueModelNames(raw.map((model) => model.id || model.name || ""));
    } catch {
      return [];
    }
  }
  async discoverOllamaModels(baseUrl) {
    const urls = uniqueModelNames([
      ollamaTagsUrl(baseUrl || "http://127.0.0.1:11434/v1"),
      "http://127.0.0.1:11434/api/tags",
      "http://localhost:11434/api/tags"
    ]);
    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          continue;
        }
        const names = parseOllamaTagsJson(await response.json());
        if (names.length > 0) {
          return names;
        }
      } catch {
        continue;
      }
    }
    return [];
  }
  async persist(requireApiKeys) {
    const drafts = this.providers.map((provider) => provider.models.filter((model) => model.name.trim() === ""));
    const usedIds = new Set(this.providers.map((provider) => provider.id).filter((id) => id !== ""));
    const providers = this.providers.map((provider) => {
      const catalog = getCodexModelCatalogEntry(provider.catalogId);
      let id = provider.id;
      if (!id) {
        id = allocateCodexProviderId(provider.catalogId, [...usedIds]);
        usedIds.add(id);
      }
      const seen = /* @__PURE__ */ new Set();
      const models = provider.models.filter((model) => {
        const name = model.name.trim();
        if (name === "" || seen.has(name)) {
          return false;
        }
        seen.add(name);
        return true;
      });
      return {
        ...provider,
        id,
        name: provider.official ? provider.name : catalog.label,
        baseUrl: provider.baseUrl || (!provider.official && catalog.autoConfigure ? catalog.defaultBaseUrl : ""),
        authMode: !provider.official && catalog.autoConfigure ? "none" : "stored",
        kind: catalog.kind,
        models
      };
    });
    this.providers = providers.map((provider, index) => drafts[index]?.length ? { ...provider, models: [...provider.models, ...drafts[index]] } : provider);
    const active = this.providers[this.activeProviderIndex()] ?? providers[0];
    this.activeProviderId = active?.id;
    const config = withDefaultCodexRouting({
      model: this.model.trim(),
      modelProvider: this.modelProvider.trim(),
      providers,
      activeProviderId: providers.some((provider) => provider.id === this.activeProviderId) ? this.activeProviderId : providers[0]?.id
    });
    this.model = config.model;
    this.modelProvider = config.modelProvider;
    const error = this.validate(config);
    if (error) {
      this.showError(error);
      return error;
    }
    if (requireApiKeys) {
      for (const provider of config.providers.filter((candidate) => candidate.authMode === "stored" && !candidate.official)) {
        const pending = this.pendingApiKeys.get(provider.id)?.trim();
        const existing = await this.readApiKey?.(provider.id);
        if (!pending && !existing) {
          const message = forgeLocalize("codex.models.provider.apiKey.required", "Enter an API key for {0}.", "\u8BF7\u586B\u5199 {0} \u7684 API \u5BC6\u94A5\u3002", provider.name || provider.id);
          this.showError(message);
          return message;
        }
      }
    }
    const previousProviders = this.originalProviders;
    await this.onSave(config);
    this.originalProviders = config.providers;
    const nextIds = new Set(config.providers.map((provider) => provider.id));
    for (const previous of previousProviders) {
      const next = config.providers.find((provider) => provider.id === previous.id);
      if (!nextIds.has(previous.id) || previous.authMode === "stored" && next?.authMode !== "stored") {
        await this.writeApiKey?.(previous.id, void 0);
      }
    }
    for (const provider of config.providers.filter((candidate) => candidate.authMode === "stored")) {
      const pending = this.pendingApiKeys.get(provider.id)?.trim();
      const existing = await this.readApiKey?.(provider.id);
      await this.writeApiKey?.(provider.id, pending || existing);
    }
    this.pendingApiKeys.clear();
    this.container.querySelector(".agent-models-error")?.remove();
    return void 0;
  }
  validate(config) {
    const ids = /* @__PURE__ */ new Set();
    const catalogs = /* @__PURE__ */ new Set();
    for (const provider of config.providers) {
      if (!/^[A-Za-z0-9_-]+$/.test(provider.id)) {
        return forgeLocalize("codex.models.provider.id.invalid", "Provider IDs may only contain letters, numbers, underscores, and hyphens.", "\u63D0\u4F9B\u5546\u5185\u90E8\u6807\u8BC6\u53EA\u80FD\u5305\u542B\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u4E0B\u5212\u7EBF\u548C\u8FDE\u5B57\u7B26\u3002");
      }
      if (ids.has(provider.id)) {
        return forgeLocalize("codex.models.provider.id.duplicate", 'Provider "{0}" is duplicated.', "\u63D0\u4F9B\u5546\u201C{0}\u201D\u91CD\u590D\u4E86\u3002", provider.id);
      }
      ids.add(provider.id);
      if (!isOfficialModelProvider(provider)) {
        if (catalogs.has(provider.catalogId)) {
          return forgeLocalize("codex.models.provider.alreadyAdded.error", 'Provider "{0}" has already been added.', "\u63D0\u4F9B\u5546\u201C{0}\u201D\u5DF2\u7ECF\u6DFB\u52A0\u8FC7\u4E86\u3002", provider.name || provider.catalogId);
        }
        catalogs.add(provider.catalogId);
      }
      const modelNames = /* @__PURE__ */ new Set();
      for (const model of provider.models) {
        const name = model.name.trim();
        if (name === "") {
          continue;
        }
        if (modelNames.has(name)) {
          return forgeLocalize("codex.models.model.duplicate", 'Model "{0}" has already been added.', "\u6A21\u578B\u201C{0}\u201D\u5DF2\u7ECF\u6DFB\u52A0\u8FC7\u4E86\u3002", name);
        }
        modelNames.add(name);
      }
      if (!provider.baseUrl) {
        if (provider.official || provider.models.length === 0) {
          continue;
        }
        return forgeLocalize("codex.models.provider.baseUrl.required", "Provider URL is required for {0}.", "\u8BF7\u586B\u5199 {0} \u7684\u63D0\u4F9B\u5546\u7F51\u5740\u3002", provider.name || provider.id);
      }
      try {
        const url = new URL(provider.baseUrl);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error("unsupported protocol");
        }
      } catch {
        return forgeLocalize("codex.models.provider.baseUrl.invalid", "Enter a valid HTTP or HTTPS URL for {0}.", "\u8BF7\u4E3A {0} \u8F93\u5165\u6709\u6548\u7684 HTTP \u6216 HTTPS \u7F51\u5740\u3002", provider.name || provider.id);
      }
    }
    return void 0;
  }
  showError(message) {
    this.container.querySelector(".agent-models-error")?.remove();
    DOM.append(this.container, DOM.$(".agent-models-error")).textContent = message;
  }
}
export {
  AgentModelsSettings
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFpQ3VzdG9taXphdGlvblxcYWdlbnRNb2RlbHNTZXR0aW5ncy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IFNlbGVjdEJveCwgdHlwZSBJU2VsZWN0T3B0aW9uSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zZWxlY3RCb3gvc2VsZWN0Qm94LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhbGxvY2F0ZUNvZGV4UHJvdmlkZXJJZCwgZGVmYXVsdENvZGV4TW9kZWxQcm92aWRlckVudHJ5LCBkaXNjb3ZlcnNDb2RleExvY2FsTW9kZWxzLCBnZXRDb2RleE1vZGVsQ2F0YWxvZ0VudHJ5LCBpc0xvY2FsQ2F0YWxvZywgaXNPbGxhbWFDYXRhbG9nLCBsaXN0Q29kZXhNb2RlbENhdGFsb2csIG5vcm1hbGl6ZUNvZGV4TW9kZWxzQ29uZmlnLCB3aXRoRGVmYXVsdENvZGV4Um91dGluZywgdHlwZSBJQ29kZXhNb2RlbENhdGFsb2dFbnRyeSwgdHlwZSBJQ29kZXhNb2RlbFByb3ZpZGVyRW50cnksIHR5cGUgSUNvZGV4TW9kZWxzQ29uZmlnLCB0eXBlIElDb2RleFNhdmVkTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2NvZGV4TW9kZWxzQ29uZmlnLmpzJztcbmltcG9ydCB7IGlzT2ZmaWNpYWxMb2NrZWRNb2RlbCwgaXNPZmZpY2lhbE1vZGVsUHJvdmlkZXIsIG9mZmljaWFsTW9kZWxDYXJkU3BlYyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vb2ZmaWNpYWxNb2RlbENhcmRzLmpzJztcbmltcG9ydCB7IGZvcmdlTG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2ZvcmdlTG9jYWxlLmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IG9sbGFtYVRhZ3NVcmwsIHBhcnNlT2xsYW1hVGFnc0pzb24sIHVuaXF1ZU1vZGVsTmFtZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL29sbGFtYUxpc3QuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcywgZGVmYXVsdFNlbGVjdEJveFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5cbmNvbnN0IElOU0VSVF9TSElGVF9NUyA9IDE3MDtcbmNvbnN0IElOU0VSVF9QT1BfTVMgPSAyMDA7XG5cbi8qKlxuICogRWRpdGFibGUgXCJNb2RlbHNcIiBzZWN0aW9uIHJlbmRlcmVkIGluc2lkZSB0aGUgQ29kZXggaGFybmVzcyBzZXR0aW5ncy5cbiAqXG4gKiBUaGUgaGVhZGVyIE5ldyBidXR0b24gYXBwZW5kcyBhIHByb3ZpZGVyIGNhcmQuIFRoZSBOZXcgYnV0dG9uIGJlc2lkZSBNb2RlbFxuICogbmFtZSBhcHBlbmRzIGFub3RoZXIgbW9kZWwgcm93IG9uIHRoYXQgc2FtZSBjYXJkLlxuICovXG5leHBvcnQgY2xhc3MgQWdlbnRNb2RlbHNTZXR0aW5ncyBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVuZGVyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHByaXZhdGUgbW9kZWw6IHN0cmluZztcblx0cHJpdmF0ZSBtb2RlbFByb3ZpZGVyOiBzdHJpbmc7XG5cdHByaXZhdGUgcHJvdmlkZXJzOiBJQ29kZXhNb2RlbFByb3ZpZGVyRW50cnlbXTtcblx0cHJpdmF0ZSBhY3RpdmVQcm92aWRlcklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgb3JpZ2luYWxQcm92aWRlcnM6IHJlYWRvbmx5IElDb2RleE1vZGVsUHJvdmlkZXJFbnRyeVtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IHBlbmRpbmdBcGlLZXlzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBkaXNjb3ZlcmVkTG9jYWxNb2RlbHMgPSBuZXcgTWFwPHN0cmluZywgcmVhZG9ubHkgc3RyaW5nW10+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzY292ZXJpbmdMb2NhbCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGxvY2FsU2VsZWN0cyA9IG5ldyBNYXA8c3RyaW5nLCB7IHByb3ZpZGVySW5kZXg6IG51bWJlcjsgcm93SW5kZXg6IG51bWJlcjsgc2VsZWN0OiBTZWxlY3RCb3ggfT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBjYXRhbG9nU2VsZWN0cyA9IG5ldyBNYXA8bnVtYmVyLCBTZWxlY3RCb3g+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbW9kZWxOZXdCdXR0b25zID0gbmV3IE1hcDxudW1iZXIsIEJ1dHRvbltdPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1vZGVsUmVtb3ZlQnV0dG9ucyA9IG5ldyBNYXA8bnVtYmVyLCBCdXR0b25bXT4oKTtcblx0cHJpdmF0ZSBsaXN0RWw6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGFkZFByb3ZpZGVyQnV0dG9uOiBCdXR0b24gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBmb2N1c1RhcmdldDogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHBhcmVudDogSFRNTEVsZW1lbnQsXG5cdFx0dmFsdWU6IHVua25vd24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvblNhdmU6ICh2YWx1ZTogSUNvZGV4TW9kZWxzQ29uZmlnKSA9PiBQcm9taXNlPHZvaWQ+IHwgdm9pZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlYWRBcGlLZXk/OiAocHJvdmlkZXJJZDogc3RyaW5nKSA9PiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB3cml0ZUFwaUtleT86IChwcm92aWRlcklkOiBzdHJpbmcsIGFwaUtleTogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFZpZXdTZXJ2aWNlPzogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRpc2NvdmVyTG9jYWxNb2RlbHNGbj86IChjYXRhbG9nSWQ6IHN0cmluZywgYmFzZVVybDogc3RyaW5nKSA9PiBQcm9taXNlPHJlYWRvbmx5IHN0cmluZ1tdPixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCBjb25maWcgPSBub3JtYWxpemVDb2RleE1vZGVsc0NvbmZpZyh2YWx1ZSk7XG5cdFx0dGhpcy5tb2RlbCA9IGNvbmZpZy5tb2RlbDtcblx0XHR0aGlzLm1vZGVsUHJvdmlkZXIgPSBjb25maWcubW9kZWxQcm92aWRlcjtcblx0XHR0aGlzLnByb3ZpZGVycyA9IGNvbmZpZy5wcm92aWRlcnMubGVuZ3RoID4gMCA/IFsuLi5jb25maWcucHJvdmlkZXJzXSA6IFtkZWZhdWx0Q29kZXhNb2RlbFByb3ZpZGVyRW50cnkoKV07XG5cdFx0dGhpcy5hY3RpdmVQcm92aWRlcklkID0gY29uZmlnLmFjdGl2ZVByb3ZpZGVySWQgPz8gdGhpcy5wcm92aWRlcnNbMF0/LmlkO1xuXHRcdHRoaXMub3JpZ2luYWxQcm92aWRlcnMgPSBjb25maWcucHJvdmlkZXJzO1xuXHRcdHRoaXMuY29udGFpbmVyID0gRE9NLmFwcGVuZChwYXJlbnQsIERPTS4kKCcuYWdlbnQtbW9kZWxzLXNldHRpbmdzJykpO1xuXHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0dm9pZCB0aGlzLmh5ZHJhdGVTdG9yZWRBcGlLZXlzKCk7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHsgdGhpcy5mb2N1c1RhcmdldD8uKCk7IH1cblxuXHRwcml2YXRlIGFjdGl2ZVByb3ZpZGVySW5kZXgoKTogbnVtYmVyIHtcblx0XHRjb25zdCBieUlkID0gdGhpcy5wcm92aWRlcnMuZmluZEluZGV4KHByb3ZpZGVyID0+IHByb3ZpZGVyLmlkICE9PSAnJyAmJiBwcm92aWRlci5pZCA9PT0gdGhpcy5hY3RpdmVQcm92aWRlcklkKTtcblx0XHRpZiAoYnlJZCA+PSAwKSB7XG5cdFx0XHRyZXR1cm4gYnlJZDtcblx0XHR9XG5cdFx0Y29uc3QgdW5zYXZlZCA9IHRoaXMucHJvdmlkZXJzLmZpbmRJbmRleChwcm92aWRlciA9PiBwcm92aWRlci5pZCA9PT0gdGhpcy5hY3RpdmVQcm92aWRlcklkIHx8ICh0aGlzLmFjdGl2ZVByb3ZpZGVySWQgPT09IHVuZGVmaW5lZCAmJiBwcm92aWRlci5pZCA9PT0gJycpKTtcblx0XHRyZXR1cm4gdW5zYXZlZCA+PSAwID8gdW5zYXZlZCA6IDA7XG5cdH1cblxuXHRwcml2YXRlIGRpc2NvdmVyeUtleShwcm92aWRlcjogSUNvZGV4TW9kZWxQcm92aWRlckVudHJ5KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gcHJvdmlkZXIuaWQgfHwgYGRyYWZ0OiR7dGhpcy5wcm92aWRlcnMuaW5kZXhPZihwcm92aWRlcil9YDtcblx0fVxuXG5cdHByaXZhdGUgdmlzaWJsZU1vZGVscyhwcm92aWRlcjogSUNvZGV4TW9kZWxQcm92aWRlckVudHJ5KTogSUNvZGV4U2F2ZWRNb2RlbFtdIHtcblx0XHRpZiAocHJvdmlkZXIubW9kZWxzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiBwcm92aWRlci5tb2RlbHMubWFwKG1vZGVsID0+ICh7IC4uLm1vZGVsIH0pKTtcblx0XHR9XG5cdFx0cmV0dXJuIFt7IG5hbWU6IHByb3ZpZGVyLnNlbGVjdGVkTW9kZWwsIGVuYWJsZWQ6IHRydWUgfV07XG5cdH1cblxuXHRwcml2YXRlIHVzZWRDYXRhbG9nSWRzKGV4Y2VwdEluZGV4PzogbnVtYmVyKTogU2V0PHN0cmluZz4ge1xuXHRcdHJldHVybiBuZXcgU2V0KHRoaXMucHJvdmlkZXJzXG5cdFx0XHQuZmlsdGVyKChwcm92aWRlciwgaW5kZXgpID0+IGluZGV4ICE9PSBleGNlcHRJbmRleCAmJiAhaXNPZmZpY2lhbE1vZGVsUHJvdmlkZXIocHJvdmlkZXIpKVxuXHRcdFx0Lm1hcChwcm92aWRlciA9PiBwcm92aWRlci5jYXRhbG9nSWQpKTtcblx0fVxuXG5cdHByaXZhdGUgbmV4dFVudXNlZENhdGFsb2dJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHVzZWQgPSB0aGlzLnVzZWRDYXRhbG9nSWRzKCk7XG5cdFx0cmV0dXJuIGxpc3RDb2RleE1vZGVsQ2F0YWxvZygpLmZpbmQoZW50cnkgPT4gIXVzZWQuaGFzKGVudHJ5LmlkKSk/LmlkO1xuXHR9XG5cblx0cHJpdmF0ZSB1c2VkTW9kZWxOYW1lcyhpbmRleDogbnVtYmVyLCBleGNlcHRSb3c/OiBudW1iZXIpOiBTZXQ8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIG5ldyBTZXQodGhpcy52aXNpYmxlTW9kZWxzKHRoaXMucHJvdmlkZXJzW2luZGV4XSlcblx0XHRcdC5maWx0ZXIoKF8sIHJvd0luZGV4KSA9PiByb3dJbmRleCAhPT0gZXhjZXB0Um93KVxuXHRcdFx0Lm1hcChtb2RlbCA9PiBtb2RlbC5uYW1lLnRyaW0oKSlcblx0XHRcdC5maWx0ZXIobmFtZSA9PiBuYW1lICE9PSAnJykpO1xuXHR9XG5cblx0cHJpdmF0ZSBjYW5BZGRNb2RlbFJvdyhpbmRleDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLnByb3ZpZGVyc1tpbmRleF07XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gIXRoaXMudmlzaWJsZU1vZGVscyhwcm92aWRlcikuc29tZShtb2RlbCA9PiBtb2RlbC5uYW1lLnRyaW0oKSA9PT0gJycpO1xuXHR9XG5cblx0cHJpdmF0ZSBjYXRhbG9nU2VsZWN0T3B0aW9ucyhpbmRleDogbnVtYmVyKTogeyB2YWx1ZTogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyBkZXRhaWw/OiBzdHJpbmc7IGRpc2FibGVkPzogYm9vbGVhbiB9W10ge1xuXHRcdGNvbnN0IHVzZWQgPSB0aGlzLnVzZWRDYXRhbG9nSWRzKGluZGV4KTtcblx0XHRyZXR1cm4gbGlzdENvZGV4TW9kZWxDYXRhbG9nKCkubWFwKGVudHJ5ID0+ICh7XG5cdFx0XHR2YWx1ZTogZW50cnkuaWQsXG5cdFx0XHRsYWJlbDogZW50cnkubGFiZWwsXG5cdFx0XHRkaXNhYmxlZDogdXNlZC5oYXMoZW50cnkuaWQpLFxuXHRcdFx0ZGV0YWlsOiB1c2VkLmhhcyhlbnRyeS5pZClcblx0XHRcdFx0PyBmb3JnZUxvY2FsaXplKCdjb2RleC5tb2RlbHMucHJvdmlkZXIuYWxyZWFkeUFkZGVkJywgJ0FscmVhZHkgYWRkZWQnLCAnXHU1REYyXHU2REZCXHU1MkEwJylcblx0XHRcdFx0OiBlbnRyeS5ncm91cCA9PT0gJ2xvY2FsJ1xuXHRcdFx0XHRcdD8gZm9yZ2VMb2NhbGl6ZSgnY29kZXgubW9kZWxzLnByb3ZpZGVyLmdyb3VwLmxvY2FsJywgJ0xvY2FsJywgJ1x1NjcyQ1x1NTczMCcpXG5cdFx0XHRcdFx0OiBmb3JnZUxvY2FsaXplKCdjb2RleC5tb2RlbHMucHJvdmlkZXIuZ3JvdXAuY2xvdWQnLCAnQ2xvdWQnLCAnXHU0RTkxXHU3QUVGJyksXG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMubG9jYWxTZWxlY3RzLmNsZWFyKCk7XG5cdFx0dGhpcy5jYXRhbG9nU2VsZWN0cy5jbGVhcigpO1xuXHRcdHRoaXMubW9kZWxOZXdCdXR0b25zLmNsZWFyKCk7XG5cdFx0dGhpcy5tb2RlbFJlbW92ZUJ1dHRvbnMuY2xlYXIoKTtcblx0XHR0aGlzLmxpc3RFbCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmFkZFByb3ZpZGVyQnV0dG9uID0gdW5kZWZpbmVkO1xuXHRcdERPTS5jbGVhck5vZGUodGhpcy5jb250YWluZXIpO1xuXHRcdHRoaXMuZm9jdXNUYXJnZXQgPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAodGhpcy5wcm92aWRlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLnByb3ZpZGVycyA9IFtkZWZhdWx0Q29kZXhNb2RlbFByb3ZpZGVyRW50cnkoKV07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvdmlkZXJzU2VjdGlvbiA9IERPTS5hcHBlbmQodGhpcy5jb250YWluZXIsIERPTS4kKCcuYWdlbnQtbW9kZWxzLXByb3ZpZGVycycpKTtcblx0XHRjb25zdCBwcm92aWRlcnNIZWFkZXIgPSBET00uYXBwZW5kKHByb3ZpZGVyc1NlY3Rpb24sIERPTS4kKCcuYWdlbnQtbW9kZWxzLXByb3ZpZGVycy1oZWFkZXInKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXJzQ29weSA9IERPTS5hcHBlbmQocHJvdmlkZXJzSGVhZGVyLCBET00uJCgnLmFnZW50LW1vZGVscy1wcm92aWRlcnMtY29weScpKTtcblx0XHRET00uYXBwZW5kKHByb3ZpZGVyc0NvcHksIERPTS4kKCcuYWdlbnQtbW9kZWxzLXByb3ZpZGVycy10aXRsZScpKS50ZXh0Q29udGVudCA9IGZvcmdlTG9jYWxpemUoJ2NvZGV4Lm1vZGVscy5jdXN0b21Qcm92aWRlcnMnLCAnUHJvdmlkZXJzJywgJ1x1NjNEMFx1NEY5Qlx1NTU0NicpO1xuXHRcdERPTS5hcHBlbmQocHJvdmlkZXJzQ29weSwgRE9NLiQoJy5hZ2VudC1tb2RlbHMtcHJvdmlkZXJzLWRlc2NyaXB0aW9uJykpLnRleHRDb250ZW50ID0gZm9yZ2VMb2NhbGl6ZSgnY29kZXgubW9kZWxzLmN1c3RvbVByb3ZpZGVycy5kZXNjcmlwdGlvbicsICdOZXcgbmV4dCB0byBQcm92aWRlcnMgYWRkcyBhbm90aGVyIHByb3ZpZGVyIGNhcmQuIE5ldyBuZXh0IHRvIE1vZGVsIG5hbWUgYWRkcyBhbm90aGVyIG1vZGVsIG9uIHRoaXMgY2FyZC4nLCAnXHU5ODc2XHU5MEU4XHU2NUIwXHU1RUZBXHU2REZCXHU1MkEwXHU2M0QwXHU0RjlCXHU1NTQ2XHU1MzYxXHU3MjQ3XHUzMDAyXHU2QTIxXHU1NzhCXHU1NDBEXHU3OUYwXHU2NUMxXHU3Njg0XHU2NUIwXHU1RUZBXHU0RjFBXHU1NzI4XHU1NDBDXHU0RTAwXHU1RjIwXHU1MzYxXHU3MjQ3XHU5MUNDXHU1MThEXHU1MkEwXHU0RTAwXHU0RTJBXHU2QTIxXHU1NzhCXHUzMDAyJyk7XG5cdFx0Y29uc3QgYWRkQnV0dG9uID0gdGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbihwcm92aWRlcnNIZWFkZXIsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlIH0pKTtcblx0XHRhZGRCdXR0b24ubGFiZWwgPSBmb3JnZUxvY2FsaXplKCdjb2RleC5tb2RlbHMuYWRkUHJvdmlkZXInLCAnTmV3JywgJ1x1NjVCMFx1NUVGQScpO1xuXHRcdHRoaXMuYWRkUHJvdmlkZXJCdXR0b24gPSBhZGRCdXR0b247XG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoYWRkQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5hZGRQcm92aWRlckJsb2NrKCkpKTtcblxuXHRcdHRoaXMubGlzdEVsID0gRE9NLmFwcGVuZChwcm92aWRlcnNTZWN0aW9uLCBET00uJCgnLmFnZW50LW1vZGVscy1wcm92aWRlcnMtbGlzdCcpKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMucHJvdmlkZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR0aGlzLnJlbmRlclByb3ZpZGVyKERPTS5hcHBlbmQodGhpcy5saXN0RWwsIERPTS4kKCcuYWdlbnQtbW9kZWxzLXByb3ZpZGVyJykpLCBpKTtcblx0XHRcdGlmIChkaXNjb3ZlcnNDb2RleExvY2FsTW9kZWxzKHRoaXMucHJvdmlkZXJzW2ldLmNhdGFsb2dJZCkpIHtcblx0XHRcdFx0dGhpcy5lbnN1cmVMb2NhbERpc2NvdmVyeSh0aGlzLnByb3ZpZGVyc1tpXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuc3luY0FkZEJ1dHRvbnMoKTtcblx0fVxuXG5cdHByaXZhdGUgYWRkUHJvdmlkZXJCbG9jaygpOiB2b2lkIHtcblx0XHRjb25zdCBjYXRhbG9nSWQgPSB0aGlzLm5leHRVbnVzZWRDYXRhbG9nSWQoKTtcblx0XHRpZiAoIWNhdGFsb2dJZCkge1xuXHRcdFx0dGhpcy5zaG93RXJyb3IoZm9yZ2VMb2NhbGl6ZSgnY29kZXgubW9kZWxzLnByb3ZpZGVyLmFsbEFkZGVkJywgJ0V2ZXJ5IHByb3ZpZGVyIGhhcyBhbHJlYWR5IGJlZW4gYWRkZWQuJywgJ1x1NjI0MFx1NjcwOVx1NjNEMFx1NEY5Qlx1NTU0Nlx1OTBGRFx1NURGMlx1N0VDRlx1NkRGQlx1NTJBMFx1OEZDN1x1NEU4Nlx1MzAwMicpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYmVmb3JlID0gdGhpcy5zbmFwc2hvdExheW91dCgpO1xuXHRcdGNvbnN0IG5leHQgPSBkZWZhdWx0Q29kZXhNb2RlbFByb3ZpZGVyRW50cnkoY2F0YWxvZ0lkKTtcblx0XHR0aGlzLnByb3ZpZGVycyA9IFsuLi50aGlzLnByb3ZpZGVycywgbmV4dF07XG5cdFx0dGhpcy5hY3RpdmVQcm92aWRlcklkID0gYGRyYWZ0OiR7dGhpcy5wcm92aWRlcnMubGVuZ3RoIC0gMX1gO1xuXHRcdGlmICghdGhpcy5saXN0RWwpIHtcblx0XHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNhcmQgPSBET00uYXBwZW5kKHRoaXMubGlzdEVsLCBET00uJCgnLmFnZW50LW1vZGVscy1wcm92aWRlcicpKTtcblx0XHR0aGlzLnJlbmRlclByb3ZpZGVyKGNhcmQsIHRoaXMucHJvdmlkZXJzLmxlbmd0aCAtIDEpO1xuXHRcdGlmIChkaXNjb3ZlcnNDb2RleExvY2FsTW9kZWxzKGNhdGFsb2dJZCkpIHtcblx0XHRcdHRoaXMuZW5zdXJlTG9jYWxEaXNjb3ZlcnkodGhpcy5wcm92aWRlcnNbdGhpcy5wcm92aWRlcnMubGVuZ3RoIC0gMV0pO1xuXHRcdH1cblx0XHR0aGlzLnJlZnJlc2hDYXRhbG9nU2VsZWN0cygpO1xuXHRcdHRoaXMuc3luY0FkZEJ1dHRvbnMoKTtcblx0XHR0aGlzLnBsYXlJbnNlcnRBbmltYXRpb24oYmVmb3JlLCBjYXJkKTtcblx0fVxuXG5cdHByaXZhdGUgYWRkTW9kZWxSb3coaW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jYW5BZGRNb2RlbFJvdyhpbmRleCkpIHtcblx0XHRcdHRoaXMuc2hvd0Vycm9yKGZvcmdlTG9jYWxpemUoJ2NvZGV4Lm1vZGVscy5tb2RlbC5hbHJlYWR5QWRkZWQnLCAnVGhpcyBtb2RlbCBoYXMgYWxyZWFkeSBiZWVuIGFkZGVkLCBvciBmaW5pc2ggdGhlIGVtcHR5IG1vZGVsIHJvdyBmaXJzdC4nLCAnXHU4QkU1XHU2QTIxXHU1NzhCXHU1REYyXHU3RUNGXHU2REZCXHU1MkEwXHU4RkM3XHU0RTg2XHVGRjBDXHU2MjE2XHU4QkY3XHU1MTQ4XHU1QjhDXHU2MjEwXHU1RjUzXHU1MjREXHU3QTdBXHU3NjdEXHU3Njg0XHU2QTIxXHU1NzhCXHU1NDBEXHU3OUYwXHUzMDAyJykpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBiZWZvcmUgPSB0aGlzLnNuYXBzaG90TGF5b3V0KCk7XG5cdFx0Y29uc3Qgcm93cyA9IHRoaXMudmlzaWJsZU1vZGVscyh0aGlzLnByb3ZpZGVyc1tpbmRleF0pO1xuXHRcdHRoaXMudXBkYXRlUHJvdmlkZXIoaW5kZXgsIHsgbW9kZWxzOiBbLi4ucm93cywgeyBuYW1lOiAnJywgZW5hYmxlZDogdHJ1ZSB9XSB9KTtcblx0XHRjb25zdCBjYXJkID0gdGhpcy5saXN0RWw/LmNoaWxkcmVuW2luZGV4XSBhcyBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBtb2RlbFJvd3MgPSBjYXJkPy5xdWVyeVNlbGVjdG9yKCcuYWdlbnQtbW9kZWxzLW1vZGVsLXJvd3MnKSBhcyBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoIW1vZGVsUm93cykge1xuXHRcdFx0dGhpcy5yZW5kZXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbmV4dFJvd3MgPSB0aGlzLnZpc2libGVNb2RlbHModGhpcy5wcm92aWRlcnNbaW5kZXhdKTtcblx0XHRjb25zdCBjYXRhbG9nID0gZ2V0Q29kZXhNb2RlbENhdGFsb2dFbnRyeSh0aGlzLnByb3ZpZGVyc1tpbmRleF0uY2F0YWxvZ0lkKTtcblx0XHR0aGlzLnJlbmRlck1vZGVsUm93KG1vZGVsUm93cywgaW5kZXgsIG5leHRSb3dzLmxlbmd0aCAtIDEsIG5leHRSb3dzLCBjYXRhbG9nKTtcblx0XHRjb25zdCBpbnNlcnRlZCA9IG1vZGVsUm93cy5sYXN0RWxlbWVudENoaWxkIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHR0aGlzLnJlZnJlc2hMb2NhbFNlbGVjdHModGhpcy5kaXNjb3ZlcnlLZXkodGhpcy5wcm92aWRlcnNbaW5kZXhdKSk7XG5cdFx0dGhpcy5zeW5jQWRkQnV0dG9ucygpO1xuXHRcdGlmIChpbnNlcnRlZCkge1xuXHRcdFx0dGhpcy5wbGF5SW5zZXJ0QW5pbWF0aW9uKGJlZm9yZSwgaW5zZXJ0ZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlTW9kZWxSb3coaW5kZXg6IG51bWJlciwgcm93SW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5wcm92aWRlcnNbaW5kZXhdO1xuXHRcdGNvbnN0IHJvd3MgPSB0aGlzLnZpc2libGVNb2RlbHMocHJvdmlkZXIpO1xuXHRcdGlmIChpc09mZmljaWFsTG9ja2VkTW9kZWwocHJvdmlkZXIsIHJvd3Nbcm93SW5kZXhdPy5uYW1lID8/ICcnKSkge1xuXHRcdFx0dGhpcy5zaG93RXJyb3IoZm9yZ2VMb2NhbGl6ZSgnY29kZXgubW9kZWxzLm9mZmljaWFsLm1vZGVsTG9ja2VkJywgJ09mZmljaWFsIG1vZGVscyBvbiB0aGlzIGNhcmQgY2Fubm90IGJlIGRlbGV0ZWQuJywgJ1x1NUI5OFx1NjVCOVx1NkEyMVx1NTc4Qlx1NEUwRFx1ODBGRFx1NTIyMFx1OTY2NFx1MzAwMicpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbmV4dFJvd3MgPSByb3dzLmZpbHRlcigoXywgaSkgPT4gaSAhPT0gcm93SW5kZXgpO1xuXHRcdGNvbnN0IG5leHQgPSBuZXh0Um93cy5sZW5ndGggPiAwID8gbmV4dFJvd3MgOiBbeyBuYW1lOiAnJywgZW5hYmxlZDogdHJ1ZSB9XTtcblx0XHR0aGlzLnVwZGF0ZVByb3ZpZGVyKGluZGV4LCB7IG1vZGVsczogbmV4dCwgc2VsZWN0ZWRNb2RlbDogbmV4dC5maW5kKG1vZGVsID0+IG1vZGVsLm5hbWUudHJpbSgpICE9PSAnJyk/Lm5hbWUgPz8gJycgfSk7XG5cdFx0aWYgKHRoaXMucHJvdmlkZXJzW2luZGV4XS5pZCAmJiB0aGlzLm9yaWdpbmFsUHJvdmlkZXJzLnNvbWUoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5pZCA9PT0gdGhpcy5wcm92aWRlcnNbaW5kZXhdLmlkKSkge1xuXHRcdFx0dm9pZCB0aGlzLnBlcnNpc3QoZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnJlbmRlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJQcm92aWRlcihjYXJkOiBIVE1MRWxlbWVudCwgaW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5wcm92aWRlcnNbaW5kZXhdO1xuXHRcdGNvbnN0IGNhdGFsb2cgPSBnZXRDb2RleE1vZGVsQ2F0YWxvZ0VudHJ5KHByb3ZpZGVyLmNhdGFsb2dJZCk7XG5cdFx0Y29uc3Qgb2ZmaWNpYWwgPSBpc09mZmljaWFsTW9kZWxQcm92aWRlcihwcm92aWRlcik7XG5cdFx0Y2FyZC5kYXRhc2V0WydsYXlvdXRJZCddID0gYHByb3ZpZGVyOiR7dGhpcy5kaXNjb3ZlcnlLZXkocHJvdmlkZXIpfWA7XG5cdFx0aWYgKG9mZmljaWFsKSB7XG5cdFx0XHRjYXJkLmNsYXNzTGlzdC5hZGQoJ2FnZW50LW1vZGVscy1wcm92aWRlci1vZmZpY2lhbCcpO1xuXHRcdH1cblx0XHRjb25zdCBoZWFkZXIgPSBET00uYXBwZW5kKGNhcmQsIERPTS4kKCcuYWdlbnQtbW9kZWxzLXByb3ZpZGVyLWhlYWRlcicpKTtcblx0XHRjb25zdCBpZGVudGl0eSA9IERPTS5hcHBlbmQoaGVhZGVyLCBET00uJCgnLmFnZW50LW1vZGVscy1wcm92aWRlci1pZGVudGl0eScpKTtcblx0XHRET00uYXBwZW5kKGlkZW50aXR5LCBET00uJCgnLmFnZW50LW1vZGVscy1wcm92aWRlci10aXRsZScpKS50ZXh0Q29udGVudCA9IHByb3ZpZGVyLm5hbWUgfHwgY2F0YWxvZy5sYWJlbDtcblx0XHRpZiAob2ZmaWNpYWwpIHtcblx0XHRcdERPTS5hcHBlbmQoaWRlbnRpdHksIERPTS4kKCcuYWdlbnQtbW9kZWxzLXByb3ZpZGVyLXN1YnRpdGxlJykpLnRleHRDb250ZW50ID0gZm9yZ2VMb2NhbGl6ZShcblx0XHRcdFx0J2NvZGV4Lm1vZGVscy5vZmZpY2lhbC5zdWJ0aXRsZScsXG5cdFx0XHRcdCdPZmZpY2lhbCBtb2RlbCBjYXJkLiBTeW5jZWQgYWZ0ZXIgc2lnbi1pbiBhbmQgY2Fubm90IGJlIGRlbGV0ZWQuJyxcblx0XHRcdFx0J1x1NUI5OFx1NjVCOVx1NkEyMVx1NTc4Qlx1NTM2MSBcdTAwQjcgXHU3NjdCXHU1RjU1XHU1NDBFXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHVGRjBDXHU0RTBEXHU1M0VGXHU1MjIwXHU5NjY0Jyxcblx0XHRcdCk7XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGlvbnMgPSBET00uYXBwZW5kKGhlYWRlciwgRE9NLiQoJy5hZ2VudC1tb2RlbHMtcHJvdmlkZXItYWN0aW9ucycpKTtcblx0XHR0aGlzLnJlbmRlclN3aXRjaChhY3Rpb25zLCBwcm92aWRlci5lbmFibGVkLCBmb3JnZUxvY2FsaXplKCdjb2RleC5tb2RlbHMucHJvdmlkZXIuZW5hYmxlZCcsICdTaG93IHRoaXMgcHJvdmlkZXIgaW4gdGhlIGFnZW50IHBpY2tlcicsICdcdTU3MjggQWdlbnQgXHU2QTIxXHU1NzhCXHU1MjE3XHU4ODY4XHU0RTJEXHU2NjNFXHU3OTNBXHU2QjY0XHU2M0QwXHU0RjlCXHU1NTQ2JyksIGVuYWJsZWQgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVQcm92aWRlcihpbmRleCwgeyBlbmFibGVkIH0pO1xuXHRcdFx0dm9pZCB0aGlzLnBlcnNpc3RJZlNhdmVkKGluZGV4KTtcblx0XHR9KTtcblx0XHRpZiAoIW9mZmljaWFsKSB7XG5cdFx0XHRjb25zdCByZW1vdmVCdXR0b24gPSB0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKGFjdGlvbnMsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlIH0pKTtcblx0XHRcdHJlbW92ZUJ1dHRvbi5sYWJlbCA9IGZvcmdlTG9jYWxpemUoJ2NvZGV4Lm1vZGVscy5wcm92aWRlci5yZW1vdmUnLCAnUmVtb3ZlJywgJ1x1NTIyMFx1OTY2NCcpO1xuXHRcdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQocmVtb3ZlQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZW1vdmVkID0gdGhpcy5wcm92aWRlcnNbaW5kZXhdO1xuXHRcdFx0XHR0aGlzLnByb3ZpZGVycyA9IHRoaXMucHJvdmlkZXJzLmZpbHRlcigoXywgaSkgPT4gaSAhPT0gaW5kZXgpO1xuXHRcdFx0XHRpZiAodGhpcy5wcm92aWRlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5wcm92aWRlcnMgPSBbZGVmYXVsdENvZGV4TW9kZWxQcm92aWRlckVudHJ5KCldO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuYWN0aXZlUHJvdmlkZXJJZCA9IHRoaXMucHJvdmlkZXJzW01hdGgubWluKGluZGV4LCB0aGlzLnByb3ZpZGVycy5sZW5ndGggLSAxKV0/LmlkIHx8IGBkcmFmdDowYDtcblx0XHRcdFx0aWYgKHJlbW92ZWQuaWQgJiYgdGhpcy5vcmlnaW5hbFByb3ZpZGVycy5zb21lKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUuaWQgPT09IHJlbW92ZWQuaWQpKSB7XG5cdFx0XHRcdFx0dm9pZCB0aGlzLnBlcnNpc3QoZmFsc2UpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRjb25zdCBmaWVsZHMgPSBET00uYXBwZW5kKGNhcmQsIERPTS4kKCcuYWdlbnQtbW9kZWxzLXByb3ZpZGVyLWZpZWxkcycpKTtcblx0XHRpZiAob2ZmaWNpYWwpIHtcblx0XHRcdHRoaXMucmVuZGVyTG9ja2VkQ2F0YWxvZyhmaWVsZHMsIGNhdGFsb2cubGFiZWwpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBjYXRhbG9nT3B0aW9ucyA9IHRoaXMuY2F0YWxvZ1NlbGVjdE9wdGlvbnMoaW5kZXgpO1xuXHRcdFx0Y29uc3QgY2F0YWxvZ1NlbGVjdCA9IHRoaXMucmVuZGVyUHJvdmlkZXJTZWxlY3QoZmllbGRzLCBmb3JnZUxvY2FsaXplKCdjb2RleC5tb2RlbHMucHJvdmlkZXIua2luZCcsICdQcm92aWRlcicsICdcdTZBMjFcdTU3OEJcdTYzRDBcdTRGOUJcdTU1NDYnKSwgY2F0YWxvZ09wdGlvbnMsIHByb3ZpZGVyLmNhdGFsb2dJZCk7XG5cdFx0XHR0aGlzLmNhdGFsb2dTZWxlY3RzLnNldChpbmRleCwgY2F0YWxvZ1NlbGVjdCk7XG5cdFx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZChjYXRhbG9nU2VsZWN0Lm9uRGlkU2VsZWN0KGV2ZW50ID0+IHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWQgPSBjYXRhbG9nT3B0aW9uc1tldmVudC5pbmRleF07XG5cdFx0XHRcdGlmICghc2VsZWN0ZWQgfHwgc2VsZWN0ZWQuZGlzYWJsZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbmV4dENhdGFsb2cgPSBnZXRDb2RleE1vZGVsQ2F0YWxvZ0VudHJ5KHNlbGVjdGVkLnZhbHVlKTtcblx0XHRcdFx0aWYgKHRoaXMudXNlZENhdGFsb2dJZHMoaW5kZXgpLmhhcyhuZXh0Q2F0YWxvZy5pZCkpIHtcblx0XHRcdFx0XHR0aGlzLnNob3dFcnJvcihmb3JnZUxvY2FsaXplKCdjb2RleC5tb2RlbHMucHJvdmlkZXIuYWxyZWFkeUFkZGVkLmVycm9yJywgJ1Byb3ZpZGVyIFwiezB9XCIgaGFzIGFscmVhZHkgYmVlbiBhZGRlZC4nLCAnXHU2M0QwXHU0RjlCXHU1NTQ2XHUyMDFDezB9XHUyMDFEXHU1REYyXHU3RUNGXHU2REZCXHU1MkEwXHU4RkM3XHU0RTg2XHUzMDAyJywgbmV4dENhdGFsb2cubGFiZWwpKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5hcHBseUNhdGFsb2coaW5kZXgsIG5leHRDYXRhbG9nKTtcblx0XHRcdFx0dGhpcy5yZW5kZXIoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbFJvd3MgPSBET00uYXBwZW5kKGZpZWxkcywgRE9NLiQoJy5hZ2VudC1tb2RlbHMtbW9kZWwtcm93cy5hZ2VudC1tb2RlbHMtcHJvdmlkZXItZmllbGQtd2lkZScpKTtcblx0XHRjb25zdCByb3dzID0gdGhpcy52aXNpYmxlTW9kZWxzKHByb3ZpZGVyKTtcblx0XHRmb3IgKGxldCByb3dJbmRleCA9IDA7IHJvd0luZGV4IDwgcm93cy5sZW5ndGg7IHJvd0luZGV4KyspIHtcblx0XHRcdHRoaXMucmVuZGVyTW9kZWxSb3cobW9kZWxSb3dzLCBpbmRleCwgcm93SW5kZXgsIHJvd3MsIGNhdGFsb2cpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVybFBsYWNlaG9sZGVyID0gb2ZmaWNpYWwgJiYgcHJvdmlkZXIub2ZmaWNpYWxTb3VyY2Vcblx0XHRcdD8gb2ZmaWNpYWxNb2RlbENhcmRTcGVjKHByb3ZpZGVyLm9mZmljaWFsU291cmNlKS5kZWZhdWx0QmFzZVVybFxuXHRcdFx0OiBjYXRhbG9nLmF1dG9Db25maWd1cmVcblx0XHRcdFx0PyBjYXRhbG9nLmRlZmF1bHRCYXNlVXJsXG5cdFx0XHRcdDogZm9yZ2VMb2NhbGl6ZSgnY29kZXgubW9kZWxzLnByb3ZpZGVyLmJhc2VVcmwucGxhY2Vob2xkZXInLCAnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20vdjEnLCAnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20vdjEnKTtcblx0XHRjb25zdCBiYXNlVXJsSW5wdXQgPSB0aGlzLnJlbmRlclByb3ZpZGVyRmllbGQoXG5cdFx0XHRmaWVsZHMsXG5cdFx0XHRmb3JnZUxvY2FsaXplKCdjb2RleC5tb2RlbHMucHJvdmlkZXIuYmFzZVVybCcsICdQcm92aWRlciBVUkwnLCAnXHU2M0QwXHU0RjlCXHU1NTQ2XHU3RjUxXHU1NzQwJyksXG5cdFx0XHR1cmxQbGFjZWhvbGRlcixcblx0XHRcdHByb3ZpZGVyLmJhc2VVcmwsXG5cdFx0XHQndGV4dCcsXG5cdFx0XHQnYWdlbnQtbW9kZWxzLXByb3ZpZGVyLWZpZWxkLXdpZGUnLFxuXHRcdFx0YGZpZWxkOiR7dGhpcy5kaXNjb3ZlcnlLZXkocHJvdmlkZXIpfTp1cmxgLFxuXHRcdCk7XG5cdFx0aWYgKCFvZmZpY2lhbCAmJiBjYXRhbG9nLmF1dG9Db25maWd1cmUgJiYgIXByb3ZpZGVyLmJhc2VVcmwpIHtcblx0XHRcdGJhc2VVcmxJbnB1dC52YWx1ZSA9IGNhdGFsb2cuZGVmYXVsdEJhc2VVcmw7XG5cdFx0XHR0aGlzLnVwZGF0ZVByb3ZpZGVyKGluZGV4LCB7IGJhc2VVcmw6IGNhdGFsb2cuZGVmYXVsdEJhc2VVcmwgfSk7XG5cdFx0fVxuXHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYmFzZVVybElucHV0LCAnaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZVByb3ZpZGVyKGluZGV4LCB7IGJhc2VVcmw6IGJhc2VVcmxJbnB1dC52YWx1ZS50cmltKCkgfSk7XG5cdFx0XHRpZiAoZGlzY292ZXJzQ29kZXhMb2NhbE1vZGVscyh0aGlzLnByb3ZpZGVyc1tpbmRleF0uY2F0YWxvZ0lkKSkge1xuXHRcdFx0XHR0aGlzLmRpc2NvdmVyZWRMb2NhbE1vZGVscy5kZWxldGUodGhpcy5kaXNjb3ZlcnlLZXkodGhpcy5wcm92aWRlcnNbaW5kZXhdKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0aWYgKG9mZmljaWFsIHx8ICFjYXRhbG9nLmF1dG9Db25maWd1cmUpIHtcblx0XHRcdGNvbnN0IGFwaUtleUlucHV0ID0gdGhpcy5yZW5kZXJQcm92aWRlckZpZWxkKFxuXHRcdFx0XHRmaWVsZHMsXG5cdFx0XHRcdGZvcmdlTG9jYWxpemUoJ2NvZGV4Lm1vZGVscy5wcm92aWRlci5hcGlLZXknLCAnQVBJIGtleScsICdBUEkgXHU1QkM2XHU5NEE1JyksXG5cdFx0XHRcdG9mZmljaWFsXG5cdFx0XHRcdFx0PyBmb3JnZUxvY2FsaXplKCdjb2RleC5tb2RlbHMub2ZmaWNpYWwuYXBpS2V5LnBsYWNlaG9sZGVyJywgJ09wdGlvbmFsIGZhbGxiYWNrIEFQSSBrZXknLCAnXHU1M0VGXHU5MDA5XHU1OTA3XHU3NTI4IEFQSSBcdTVCQzZcdTk0QTVcdUZGMDhcdTlFRDhcdThCQTRcdTRFM0FcdTdBN0FcdUZGMDknKVxuXHRcdFx0XHRcdDogZm9yZ2VMb2NhbGl6ZSgnY29kZXgubW9kZWxzLnByb3ZpZGVyLmFwaUtleS5wbGFjZWhvbGRlcicsICdFbnRlciB0aGUgQVBJIGtleScsICdcdThCRjdcdThGOTNcdTUxNjUgQVBJIFx1NUJDNlx1OTRBNScpLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J3Bhc3N3b3JkJyxcblx0XHRcdFx0J2FnZW50LW1vZGVscy1wcm92aWRlci1maWVsZC13aWRlJyxcblx0XHRcdFx0YGZpZWxkOiR7dGhpcy5kaXNjb3ZlcnlLZXkocHJvdmlkZXIpfTphcGlgLFxuXHRcdFx0KTtcblx0XHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYXBpS2V5SW5wdXQsICdpbnB1dCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaWQgPSB0aGlzLmVuc3VyZVByb3ZpZGVySWQoaW5kZXgpO1xuXHRcdFx0XHR0aGlzLnBlbmRpbmdBcGlLZXlzLnNldChpZCwgYXBpS2V5SW5wdXQudmFsdWUpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVByb3ZpZGVyKGluZGV4LCB7IGF1dGhNb2RlOiAnc3RvcmVkJyB9KTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckxvY2tlZENhdGFsb2cocGFyZW50OiBIVE1MRWxlbWVudCwgbGFiZWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGZpZWxkID0gRE9NLmFwcGVuZChwYXJlbnQsIERPTS4kKCcuYWdlbnQtbW9kZWxzLXByb3ZpZGVyLWZpZWxkJykpO1xuXHRcdERPTS5hcHBlbmQoZmllbGQsIERPTS4kKCcuYWdlbnQtbW9kZWxzLXByb3ZpZGVyLWZpZWxkLWxhYmVsJykpLnRleHRDb250ZW50ID0gZm9yZ2VMb2NhbGl6ZSgnY29kZXgubW9kZWxzLnByb3ZpZGVyLmtpbmQnLCAnUHJvdmlkZXInLCAnXHU2QTIxXHU1NzhCXHU2M0QwXHU0RjlCXHU1NTQ2Jyk7XG5cdFx0Y29uc3QgbG9ja2VkID0gRE9NLmFwcGVuZChmaWVsZCwgRE9NLiQoJy5hZ2VudC1tb2RlbHMtcHJvdmlkZXItbG9ja2VkJykpO1xuXHRcdGxvY2tlZC50ZXh0Q29udGVudCA9IGxhYmVsO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJNb2RlbFJvdyhwYXJlbnQ6IEhUTUxFbGVtZW50LCBpbmRleDogbnVtYmVyLCByb3dJbmRleDogbnVtYmVyLCByb3dzOiByZWFkb25seSBJQ29kZXhTYXZlZE1vZGVsW10sIGNhdGFsb2c6IElDb2RleE1vZGVsQ2F0YWxvZ0VudHJ5KTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSByb3dzW3Jvd0luZGV4XTtcblx0XHRjb25zdCBvZmZpY2lhbExvY2tlZCA9IGlzT2ZmaWNpYWxMb2NrZWRNb2RlbCh0aGlzLnByb3ZpZGVyc1tpbmRleF0sIG1vZGVsLm5hbWUpO1xuXHRcdGNvbnN0IGZpZWxkID0gRE9NLmFwcGVuZChwYXJlbnQsIERPTS4kKCcuYWdlbnQtbW9kZWxzLXByb3ZpZGVyLWZpZWxkLmFnZW50LW1vZGVscy1tb2RlbC1yb3cnKSk7XG5cdFx0ZmllbGQuZGF0YXNldFsnbGF5b3V0SWQnXSA9IGBtb2RlbDoke3RoaXMuZGlzY292ZXJ5S2V5KHRoaXMucHJvdmlkZXJzW2luZGV4XSl9OiR7cm93SW5kZXh9YDtcblx0XHRET00uYXBwZW5kKGZpZWxkLCBET00uJCgnLmFnZW50LW1vZGVscy1wcm92aWRlci1maWVsZC1sYWJlbCcpKS50ZXh0Q29udGVudCA9IGZvcmdlTG9jYWxpemUoJ2NvZGV4Lm1vZGVscy5wcm92aWRlci5tb2RlbE5hbWUnLCAnTW9kZWwgbmFtZScsICdcdTZBMjFcdTU3OEJcdTU0MERcdTc5RjAnKTtcblx0XHRjb25zdCBjb250cm9scyA9IERPTS5hcHBlbmQoZmllbGQsIERPTS4kKCcuYWdlbnQtbW9kZWxzLW1vZGVsLWNvbnRyb2xzJykpO1xuXG5cdFx0aWYgKGRpc2NvdmVyc0NvZGV4TG9jYWxNb2RlbHMoY2F0YWxvZy5pZCkgJiYgIW9mZmljaWFsTG9ja2VkKSB7XG5cdFx0XHR0aGlzLnJlbmRlckxvY2FsTW9kZWxTZWxlY3QoY29udHJvbHMsIGluZGV4LCByb3dJbmRleCwgbW9kZWwpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IERPTS5hcHBlbmQoY29udHJvbHMsIERPTS4kKCdpbnB1dC5hZ2VudC1nbG9iYWwtY29uZmlndXJhdGlvbi1zZXR0aW5ncy1pbnB1dC5hZ2VudC1tb2RlbHMtbW9kZWwtaW5wdXQnKSkgYXMgSFRNTElucHV0RWxlbWVudDtcblx0XHRcdGlucHV0LnZhbHVlID0gbW9kZWwubmFtZTtcblx0XHRcdGlucHV0LnBsYWNlaG9sZGVyID0gaXNMb2NhbENhdGFsb2coY2F0YWxvZy5pZClcblx0XHRcdFx0PyBmb3JnZUxvY2FsaXplKCdjb2RleC5tb2RlbHMucHJvdmlkZXIubW9kZWxOYW1lLmxvY2FsUGxhY2Vob2xkZXInLCAnZS5nLiBxd2VuMy1jb2RlcicsICdcdTRGOEJcdTU5ODIgcXdlbjMtY29kZXInKVxuXHRcdFx0XHQ6IGZvcmdlTG9jYWxpemUoJ2NvZGV4Lm1vZGVscy5wcm92aWRlci5tb2RlbE5hbWUucGxhY2Vob2xkZXInLCAnZS5nLiBncHQtNS42JywgJ1x1NEY4Qlx1NTk4MiBncHQtNS42Jyk7XG5cdFx0XHRpbnB1dC5hcmlhTGFiZWwgPSBmb3JnZUxvY2FsaXplKCdjb2RleC5tb2RlbHMucHJvdmlkZXIubW9kZWxOYW1lJywgJ01vZGVsIG5hbWUnLCAnXHU2QTIxXHU1NzhCXHU1NDBEXHU3OUYwJyk7XG5cdFx0XHRpZiAob2ZmaWNpYWxMb2NrZWQpIHtcblx0XHRcdFx0aW5wdXQucmVhZE9ubHkgPSB0cnVlO1xuXHRcdFx0XHRpbnB1dC50aXRsZSA9IGZvcmdlTG9jYWxpemUoJ2NvZGV4Lm1vZGVscy5vZmZpY2lhbC5tb2RlbExvY2tlZCcsICdPZmZpY2lhbCBtb2RlbHMgb24gdGhpcyBjYXJkIGNhbm5vdCBiZSBkZWxldGVkLicsICdcdTVCOThcdTY1QjlcdTZBMjFcdTU3OEJcdTRFMERcdTgwRkRcdTUyMjBcdTk2NjRcdTMwMDInKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoaW5wdXQsICdpbnB1dCcsICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZU1vZGVsUm93KGluZGV4LCByb3dJbmRleCwgeyBuYW1lOiBpbnB1dC52YWx1ZSB9KTtcblx0XHRcdFx0XHRjb25zdCBhY2NlcHRlZCA9IHRoaXMudmlzaWJsZU1vZGVscyh0aGlzLnByb3ZpZGVyc1tpbmRleF0pW3Jvd0luZGV4XT8ubmFtZSA/PyAnJztcblx0XHRcdFx0XHRpZiAoaW5wdXQudmFsdWUudHJpbSgpICE9PSAnJyAmJiBpbnB1dC52YWx1ZS50cmltKCkgIT09IGFjY2VwdGVkICYmIHRoaXMudXNlZE1vZGVsTmFtZXMoaW5kZXgsIHJvd0luZGV4KS5oYXMoaW5wdXQudmFsdWUudHJpbSgpKSkge1xuXHRcdFx0XHRcdFx0aW5wdXQudmFsdWUgPSBhY2NlcHRlZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuZm9jdXNUYXJnZXQgPz89ICgpID0+IGlucHV0LmZvY3VzKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW5kZXJTd2l0Y2goY29udHJvbHMsIG1vZGVsLmVuYWJsZWQsIGZvcmdlTG9jYWxpemUoJ2NvZGV4Lm1vZGVscy5tb2RlbC5lbmFibGVkJywgJ1Nob3cgdGhpcyBtb2RlbCBpbiB0aGUgYWdlbnQgcGlja2VyJywgJ1x1NTcyOCBBZ2VudCBcdTZBMjFcdTU3OEJcdTUyMTdcdTg4NjhcdTRFMkRcdTY2M0VcdTc5M0FcdTZCNjRcdTZBMjFcdTU3OEInKSwgZW5hYmxlZCA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZU1vZGVsUm93KGluZGV4LCByb3dJbmRleCwgeyBlbmFibGVkIH0pO1xuXHRcdFx0dm9pZCB0aGlzLnBlcnNpc3RJZlNhdmVkKGluZGV4KTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IG5ld0J1dHRvbiA9IHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24oY29udHJvbHMsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlIH0pKTtcblx0XHRuZXdCdXR0b24ubGFiZWwgPSBmb3JnZUxvY2FsaXplKCdjb2RleC5tb2RlbHMubW9kZWwubmV3JywgJ05ldycsICdcdTY1QjBcdTVFRkEnKTtcblx0XHRjb25zdCBidXR0b25zID0gdGhpcy5tb2RlbE5ld0J1dHRvbnMuZ2V0KGluZGV4KSA/PyBbXTtcblx0XHRidXR0b25zLnB1c2gobmV3QnV0dG9uKTtcblx0XHR0aGlzLm1vZGVsTmV3QnV0dG9ucy5zZXQoaW5kZXgsIGJ1dHRvbnMpO1xuXHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKG5ld0J1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMuYWRkTW9kZWxSb3coaW5kZXgpKSk7XG5cdFx0Y29uc3Qgc2F2ZUJ1dHRvbiA9IHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24oY29udHJvbHMsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcyB9KSk7XG5cdFx0c2F2ZUJ1dHRvbi5sYWJlbCA9IGZvcmdlTG9jYWxpemUoJ2NvZGV4Lm1vZGVscy5tb2RlbC5zYXZlJywgJ1NhdmUnLCAnXHU0RkREXHU1QjU4Jyk7XG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoc2F2ZUJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHZvaWQgdGhpcy5zYXZlTW9kZWxzKGluZGV4KSkpO1xuXHRcdGNvbnN0IHJlbW92ZUJ1dHRvbiA9IHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24oY29udHJvbHMsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlIH0pKTtcblx0XHRyZW1vdmVCdXR0b24ubGFiZWwgPSBmb3JnZUxvY2FsaXplKCdjb2RleC5tb2RlbHMubW9kZWwucmVtb3ZlJywgJ1JlbW92ZScsICdcdTUyMjBcdTk2NjQnKTtcblx0XHRjb25zdCByZW1vdmVCdXR0b25zID0gdGhpcy5tb2RlbFJlbW92ZUJ1dHRvbnMuZ2V0KGluZGV4KSA/PyBbXTtcblx0XHRyZW1vdmVCdXR0b25zLnB1c2gocmVtb3ZlQnV0dG9uKTtcblx0XHR0aGlzLm1vZGVsUmVtb3ZlQnV0dG9ucy5zZXQoaW5kZXgsIHJlbW92ZUJ1dHRvbnMpO1xuXHRcdHJlbW92ZUJ1dHRvbi5lbmFibGVkID0gIW9mZmljaWFsTG9ja2VkICYmIHJvd3MubGVuZ3RoID4gMTtcblx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZChyZW1vdmVCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLnJlbW92ZU1vZGVsUm93KGluZGV4LCByb3dJbmRleCkpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTG9jYWxNb2RlbFNlbGVjdChjb250cm9sczogSFRNTEVsZW1lbnQsIGluZGV4OiBudW1iZXIsIHJvd0luZGV4OiBudW1iZXIsIG1vZGVsOiBJQ29kZXhTYXZlZE1vZGVsKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNvbnRleHRWaWV3U2VydmljZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBIGNvbnRleHQgdmlldyBzZXJ2aWNlIGlzIHJlcXVpcmVkIHRvIHJlbmRlciBtb2RlbCBwcm92aWRlciBzZWxlY3RzLicpO1xuXHRcdH1cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMucHJvdmlkZXJzW2luZGV4XTtcblx0XHRjb25zdCBrZXkgPSB0aGlzLmRpc2NvdmVyeUtleShwcm92aWRlcik7XG5cdFx0Y29uc3QgZGlzY292ZXJlZCA9IHRoaXMuZGlzY292ZXJlZExvY2FsTW9kZWxzLmdldChrZXkpID8/IFtdO1xuXHRcdGNvbnN0IGxvYWRpbmcgPSB0aGlzLmRpc2NvdmVyaW5nTG9jYWwuaGFzKGtleSk7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMubG9jYWxNb2RlbE9wdGlvbnMocHJvdmlkZXIsIG1vZGVsLCBpbmRleCwgcm93SW5kZXgsIGRpc2NvdmVyZWQsIGxvYWRpbmcsIHRoaXMuZGlzY292ZXJlZExvY2FsTW9kZWxzLmhhcyhrZXkpKTtcblx0XHRjb25zdCBzZWxlY3RlZCA9IE1hdGgubWF4KDAsIG9wdGlvbnMuZmluZEluZGV4KG9wdGlvbiA9PiBvcHRpb24udmFsdWUgPT09IG1vZGVsLm5hbWUgJiYgb3B0aW9uLnZhbHVlICE9PSAnJykpO1xuXHRcdGNvbnN0IHNlbGVjdENvbnRhaW5lciA9IERPTS5hcHBlbmQoY29udHJvbHMsIERPTS4kKCcuYWdlbnQtbW9kZWxzLXByb3ZpZGVyLXNlbGVjdC5hZ2VudC1tb2RlbHMtbW9kZWwtaW5wdXQnKSk7XG5cdFx0Y29uc3Qgc2VsZWN0ID0gdGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQobmV3IFNlbGVjdEJveChcblx0XHRcdHRoaXMudG9TZWxlY3RJdGVtcyhvcHRpb25zKSxcblx0XHRcdHNlbGVjdGVkLFxuXHRcdFx0dGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0XHR7IC4uLmRlZmF1bHRTZWxlY3RCb3hTdHlsZXMgfSxcblx0XHRcdHsgYXJpYUxhYmVsOiBmb3JnZUxvY2FsaXplKCdjb2RleC5tb2RlbHMucHJvdmlkZXIubW9kZWxOYW1lJywgJ01vZGVsIG5hbWUnLCAnXHU2QTIxXHU1NzhCXHU1NDBEXHU3OUYwJyksIHVzZUN1c3RvbURyYXduOiB0cnVlLCBtaW5Cb3R0b21NYXJnaW46IDggfSxcblx0XHQpKTtcblx0XHRzZWxlY3QucmVuZGVyKHNlbGVjdENvbnRhaW5lcik7XG5cdFx0dGhpcy5sb2NhbFNlbGVjdHMuc2V0KGAke2tleX06JHtyb3dJbmRleH1gLCB7IHByb3ZpZGVySW5kZXg6IGluZGV4LCByb3dJbmRleCwgc2VsZWN0IH0pO1xuXHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKHNlbGVjdC5vbkRpZFNlbGVjdChldmVudCA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5wcm92aWRlcnNbaW5kZXhdO1xuXHRcdFx0Y29uc3QgbGF0ZXN0ID0gdGhpcy5sb2NhbE1vZGVsT3B0aW9ucyhcblx0XHRcdFx0Y3VycmVudCxcblx0XHRcdFx0dGhpcy52aXNpYmxlTW9kZWxzKGN1cnJlbnQpW3Jvd0luZGV4XSA/PyB7IG5hbWU6ICcnLCBlbmFibGVkOiB0cnVlIH0sXG5cdFx0XHRcdGluZGV4LFxuXHRcdFx0XHRyb3dJbmRleCxcblx0XHRcdFx0dGhpcy5kaXNjb3ZlcmVkTG9jYWxNb2RlbHMuZ2V0KHRoaXMuZGlzY292ZXJ5S2V5KGN1cnJlbnQpKSA/PyBbXSxcblx0XHRcdFx0dGhpcy5kaXNjb3ZlcmluZ0xvY2FsLmhhcyh0aGlzLmRpc2NvdmVyeUtleShjdXJyZW50KSksXG5cdFx0XHRcdHRoaXMuZGlzY292ZXJlZExvY2FsTW9kZWxzLmhhcyh0aGlzLmRpc2NvdmVyeUtleShjdXJyZW50KSksXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBsYXRlc3RbZXZlbnQuaW5kZXhdPy52YWx1ZSA/PyAnJztcblx0XHRcdGlmICghdmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMudXNlZE1vZGVsTmFtZXMoaW5kZXgsIHJvd0luZGV4KS5oYXModmFsdWUpKSB7XG5cdFx0XHRcdHRoaXMuc2hvd0Vycm9yKGZvcmdlTG9jYWxpemUoJ2NvZGV4Lm1vZGVscy5tb2RlbC5kdXBsaWNhdGUnLCAnTW9kZWwgXCJ7MH1cIiBoYXMgYWxyZWFkeSBiZWVuIGFkZGVkLicsICdcdTZBMjFcdTU3OEJcdTIwMUN7MH1cdTIwMURcdTVERjJcdTdFQ0ZcdTZERkJcdTUyQTBcdThGQzdcdTRFODZcdTMwMDInLCB2YWx1ZSkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnVwZGF0ZU1vZGVsUm93KGluZGV4LCByb3dJbmRleCwgeyBuYW1lOiB2YWx1ZSB9KTtcblx0XHRcdHRoaXMucmVmcmVzaExvY2FsU2VsZWN0cyh0aGlzLmRpc2NvdmVyeUtleSh0aGlzLnByb3ZpZGVyc1tpbmRleF0pKTtcblx0XHRcdHRoaXMuc3luY0FkZEJ1dHRvbnMoKTtcblx0XHR9KSk7XG5cdFx0Y29uc3Qgc3RhcnREaXNjb3ZlcnkgPSAoKSA9PiB0aGlzLmVuc3VyZUxvY2FsRGlzY292ZXJ5KHRoaXMucHJvdmlkZXJzW2luZGV4XSwgdHJ1ZSk7XG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihzZWxlY3RDb250YWluZXIsICdwb2ludGVyZG93bicsIHN0YXJ0RGlzY292ZXJ5LCB0cnVlKSk7XG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihzZWxlY3RDb250YWluZXIsICdrZXlkb3duJywgc3RhcnREaXNjb3ZlcnksIHRydWUpKTtcblx0XHR0aGlzLmZvY3VzVGFyZ2V0ID8/PSAoKSA9PiBzZWxlY3QuZm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyU3dpdGNoKHBhcmVudDogSFRNTEVsZW1lbnQsIGNoZWNrZWQ6IGJvb2xlYW4sIHRpdGxlOiBzdHJpbmcsIG9uQ2hhbmdlOiAoY2hlY2tlZDogYm9vbGVhbikgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IGJ1dHRvbiA9IERPTS5hcHBlbmQocGFyZW50LCBET00uJCgnYnV0dG9uLmFnZW50LW1vZGVscy1zd2l0Y2gnKSkgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdFx0YnV0dG9uLnR5cGUgPSAnYnV0dG9uJztcblx0XHRidXR0b24udGl0bGUgPSB0aXRsZTtcblx0XHRidXR0b24uc2V0QXR0cmlidXRlKCdyb2xlJywgJ3N3aXRjaCcpO1xuXHRcdGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcsIFN0cmluZyhjaGVja2VkKSk7XG5cdFx0YnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRpdGxlKTtcblx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGJ1dHRvbiwgJ2NsaWNrJywgZXZlbnQgPT4ge1xuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0Y29uc3QgbmV4dCA9IGJ1dHRvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpICE9PSAndHJ1ZSc7XG5cdFx0XHRvbkNoYW5nZShuZXh0KTtcblx0XHRcdGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcsIFN0cmluZyhuZXh0KSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJQcm92aWRlckZpZWxkKHBhcmVudDogSFRNTEVsZW1lbnQsIGxhYmVsOiBzdHJpbmcsIHBsYWNlaG9sZGVyOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcsIHR5cGUgPSAndGV4dCcsIGNsYXNzTmFtZT86IHN0cmluZywgbGF5b3V0SWQ/OiBzdHJpbmcpOiBIVE1MSW5wdXRFbGVtZW50IHtcblx0XHRjb25zdCBmaWVsZCA9IERPTS5hcHBlbmQocGFyZW50LCBET00uJCgnLmFnZW50LW1vZGVscy1wcm92aWRlci1maWVsZCcpKTtcblx0XHRpZiAoY2xhc3NOYW1lKSB7XG5cdFx0XHRmaWVsZC5jbGFzc0xpc3QuYWRkKGNsYXNzTmFtZSk7XG5cdFx0fVxuXHRcdGlmIChsYXlvdXRJZCkge1xuXHRcdFx0ZmllbGQuZGF0YXNldFsnbGF5b3V0SWQnXSA9IGxheW91dElkO1xuXHRcdH1cblx0XHRET00uYXBwZW5kKGZpZWxkLCBET00uJCgnLmFnZW50LW1vZGVscy1wcm92aWRlci1maWVsZC1sYWJlbCcpKS50ZXh0Q29udGVudCA9IGxhYmVsO1xuXHRcdGNvbnN0IGlucHV0ID0gRE9NLmFwcGVuZChmaWVsZCwgRE9NLiQoJ2lucHV0LmFnZW50LWdsb2JhbC1jb25maWd1cmF0aW9uLXNldHRpbmdzLWlucHV0JykpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5cdFx0aW5wdXQudmFsdWUgPSB2YWx1ZTtcblx0XHRpbnB1dC50eXBlID0gdHlwZTtcblx0XHRpbnB1dC5wbGFjZWhvbGRlciA9IHBsYWNlaG9sZGVyO1xuXHRcdGlucHV0LmFyaWFMYWJlbCA9IGxhYmVsO1xuXHRcdHJldHVybiBpbnB1dDtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyUHJvdmlkZXJTZWxlY3QocGFyZW50OiBIVE1MRWxlbWVudCwgbGFiZWw6IHN0cmluZywgb3B0aW9uczogcmVhZG9ubHkgeyB2YWx1ZTogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyBkZXRhaWw/OiBzdHJpbmc7IGRpc2FibGVkPzogYm9vbGVhbiB9W10sIHZhbHVlOiBzdHJpbmcpOiBTZWxlY3RCb3gge1xuXHRcdGNvbnN0IGZpZWxkID0gRE9NLmFwcGVuZChwYXJlbnQsIERPTS4kKCcuYWdlbnQtbW9kZWxzLXByb3ZpZGVyLWZpZWxkJykpO1xuXHRcdERPTS5hcHBlbmQoZmllbGQsIERPTS4kKCcuYWdlbnQtbW9kZWxzLXByb3ZpZGVyLWZpZWxkLWxhYmVsJykpLnRleHRDb250ZW50ID0gbGFiZWw7XG5cdFx0Y29uc3Qgc2VsZWN0Q29udGFpbmVyID0gRE9NLmFwcGVuZChmaWVsZCwgRE9NLiQoJy5hZ2VudC1tb2RlbHMtcHJvdmlkZXItc2VsZWN0JykpO1xuXHRcdGNvbnN0IHNlbGVjdGVkID0gTWF0aC5tYXgoMCwgb3B0aW9ucy5maW5kSW5kZXgob3B0aW9uID0+IG9wdGlvbi52YWx1ZSA9PT0gdmFsdWUpKTtcblx0XHRpZiAoIXRoaXMuY29udGV4dFZpZXdTZXJ2aWNlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0EgY29udGV4dCB2aWV3IHNlcnZpY2UgaXMgcmVxdWlyZWQgdG8gcmVuZGVyIG1vZGVsIHByb3ZpZGVyIHNlbGVjdHMuJyk7XG5cdFx0fVxuXHRcdGNvbnN0IHNlbGVjdCA9IHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKG5ldyBTZWxlY3RCb3goXG5cdFx0XHRvcHRpb25zLm1hcChvcHRpb24gPT4gKHsgdGV4dDogb3B0aW9uLmxhYmVsLCBkZXRhaWw6IG9wdGlvbi5kZXRhaWwsIGlzRGlzYWJsZWQ6IG9wdGlvbi5kaXNhYmxlZCB9KSksXG5cdFx0XHRzZWxlY3RlZCxcblx0XHRcdHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdFx0eyAuLi5kZWZhdWx0U2VsZWN0Qm94U3R5bGVzIH0sXG5cdFx0XHR7IGFyaWFMYWJlbDogbGFiZWwsIHVzZUN1c3RvbURyYXduOiB0cnVlLCBtaW5Cb3R0b21NYXJnaW46IDggfSxcblx0XHQpKTtcblx0XHRzZWxlY3QucmVuZGVyKHNlbGVjdENvbnRhaW5lcik7XG5cdFx0cmV0dXJuIHNlbGVjdDtcblx0fVxuXG5cdHByaXZhdGUgYXBwbHlDYXRhbG9nKGluZGV4OiBudW1iZXIsIGNhdGFsb2c6IElDb2RleE1vZGVsQ2F0YWxvZ0VudHJ5KTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLnByb3ZpZGVyc1tpbmRleF07XG5cdFx0Y29uc3QgcHJldmlvdXMgPSBnZXRDb2RleE1vZGVsQ2F0YWxvZ0VudHJ5KHByb3ZpZGVyLmNhdGFsb2dJZCk7XG5cdFx0Y29uc3Qga2VlcFVybCA9IHByb3ZpZGVyLmJhc2VVcmwgIT09ICcnICYmIHByb3ZpZGVyLmJhc2VVcmwgIT09IHByZXZpb3VzLmRlZmF1bHRCYXNlVXJsO1xuXHRcdHRoaXMudXBkYXRlUHJvdmlkZXIoaW5kZXgsIHtcblx0XHRcdGNhdGFsb2dJZDogY2F0YWxvZy5pZCxcblx0XHRcdG5hbWU6IGNhdGFsb2cubGFiZWwsXG5cdFx0XHRraW5kOiBjYXRhbG9nLmtpbmQsXG5cdFx0XHRiYXNlVXJsOiBjYXRhbG9nLmF1dG9Db25maWd1cmUgPyAoa2VlcFVybCA/IHByb3ZpZGVyLmJhc2VVcmwgOiBjYXRhbG9nLmRlZmF1bHRCYXNlVXJsKSA6IChrZWVwVXJsID8gcHJvdmlkZXIuYmFzZVVybCA6ICcnKSxcblx0XHRcdGF1dGhNb2RlOiBjYXRhbG9nLmF1dG9Db25maWd1cmUgPyAnbm9uZScgOiAnc3RvcmVkJyxcblx0XHRcdGVudktleTogJycsXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVByb3ZpZGVyKGluZGV4OiBudW1iZXIsIHBhdGNoOiBQYXJ0aWFsPElDb2RleE1vZGVsUHJvdmlkZXJFbnRyeT4pOiB2b2lkIHtcblx0XHR0aGlzLnByb3ZpZGVycyA9IHRoaXMucHJvdmlkZXJzLm1hcCgocCwgaSkgPT4gaSA9PT0gaW5kZXggPyB7IC4uLnAsIC4uLnBhdGNoIH0gOiBwKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTW9kZWxSb3coaW5kZXg6IG51bWJlciwgcm93SW5kZXg6IG51bWJlciwgcGF0Y2g6IFBhcnRpYWw8SUNvZGV4U2F2ZWRNb2RlbD4pOiB2b2lkIHtcblx0XHRjb25zdCByb3dzID0gdGhpcy52aXNpYmxlTW9kZWxzKHRoaXMucHJvdmlkZXJzW2luZGV4XSk7XG5cdFx0aWYgKCFyb3dzW3Jvd0luZGV4XSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAocGF0Y2gubmFtZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBuYW1lID0gcGF0Y2gubmFtZS50cmltKCk7XG5cdFx0XHRpZiAobmFtZSAmJiB0aGlzLnVzZWRNb2RlbE5hbWVzKGluZGV4LCByb3dJbmRleCkuaGFzKG5hbWUpKSB7XG5cdFx0XHRcdHRoaXMuc2hvd0Vycm9yKGZvcmdlTG9jYWxpemUoJ2NvZGV4Lm1vZGVscy5tb2RlbC5kdXBsaWNhdGUnLCAnTW9kZWwgXCJ7MH1cIiBoYXMgYWxyZWFkeSBiZWVuIGFkZGVkLicsICdcdTZBMjFcdTU3OEJcdTIwMUN7MH1cdTIwMURcdTVERjJcdTdFQ0ZcdTZERkJcdTUyQTBcdThGQzdcdTRFODZcdTMwMDInLCBuYW1lKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cm93c1tyb3dJbmRleF0gPSB7IC4uLnJvd3Nbcm93SW5kZXhdLCAuLi5wYXRjaCB9O1xuXHRcdGNvbnN0IHNlbGVjdGVkTW9kZWwgPSAocGF0Y2gubmFtZSA/PyByb3dzW3Jvd0luZGV4XS5uYW1lKS50cmltKCkgfHwgdGhpcy5wcm92aWRlcnNbaW5kZXhdLnNlbGVjdGVkTW9kZWw7XG5cdFx0dGhpcy51cGRhdGVQcm92aWRlcihpbmRleCwgeyBtb2RlbHM6IHJvd3MsIHNlbGVjdGVkTW9kZWwgfSk7XG5cdFx0dGhpcy5jb250YWluZXIucXVlcnlTZWxlY3RvcignLmFnZW50LW1vZGVscy1lcnJvcicpPy5yZW1vdmUoKTtcblx0fVxuXG5cdHByaXZhdGUgZW5zdXJlUHJvdmlkZXJJZChpbmRleDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMucHJvdmlkZXJzW2luZGV4XTtcblx0XHRpZiAocHJvdmlkZXIuaWQpIHtcblx0XHRcdHJldHVybiBwcm92aWRlci5pZDtcblx0XHR9XG5cdFx0Y29uc3QgaWQgPSBhbGxvY2F0ZUNvZGV4UHJvdmlkZXJJZChwcm92aWRlci5jYXRhbG9nSWQsIHRoaXMucHJvdmlkZXJzLm1hcChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmlkKS5maWx0ZXIoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZSAhPT0gJycpKTtcblx0XHR0aGlzLnVwZGF0ZVByb3ZpZGVyKGluZGV4LCB7IGlkIH0pO1xuXHRcdGlmICghdGhpcy5hY3RpdmVQcm92aWRlcklkIHx8IHRoaXMuYWN0aXZlUHJvdmlkZXJJZC5zdGFydHNXaXRoKCdkcmFmdDonKSkge1xuXHRcdFx0dGhpcy5hY3RpdmVQcm92aWRlcklkID0gaWQ7XG5cdFx0fVxuXHRcdHJldHVybiBpZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2F2ZU1vZGVscyhpbmRleDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5lbnN1cmVQcm92aWRlcklkKGluZGV4KTtcblx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3Qgcm93cyA9IHRoaXMudmlzaWJsZU1vZGVscyh0aGlzLnByb3ZpZGVyc1tpbmRleF0pXG5cdFx0XHQubWFwKG1vZGVsID0+ICh7IC4uLm1vZGVsLCBuYW1lOiBtb2RlbC5uYW1lLnRyaW0oKSB9KSlcblx0XHRcdC5maWx0ZXIobW9kZWwgPT4ge1xuXHRcdFx0XHRpZiAobW9kZWwubmFtZSA9PT0gJycgfHwgc2Vlbi5oYXMobW9kZWwubmFtZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2Vlbi5hZGQobW9kZWwubmFtZSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRNb2RlbCA9IHJvd3MuZmluZChtb2RlbCA9PiBtb2RlbC5uYW1lID09PSB0aGlzLnByb3ZpZGVyc1tpbmRleF0uc2VsZWN0ZWRNb2RlbCk/Lm5hbWVcblx0XHRcdD8/IHJvd3NbMF0/Lm5hbWVcblx0XHRcdD8/ICcnO1xuXHRcdHRoaXMudXBkYXRlUHJvdmlkZXIoaW5kZXgsIHsgbW9kZWxzOiByb3dzLCBzZWxlY3RlZE1vZGVsIH0pO1xuXHRcdGNvbnN0IGVycm9yID0gYXdhaXQgdGhpcy5wZXJzaXN0KGZhbHNlKTtcblx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5zeW5jQWRkQnV0dG9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwZXJzaXN0SWZTYXZlZChpbmRleDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLnByb3ZpZGVyc1tpbmRleF07XG5cdFx0aWYgKHByb3ZpZGVyPy5pZCAmJiB0aGlzLm9yaWdpbmFsUHJvdmlkZXJzLnNvbWUoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5pZCA9PT0gcHJvdmlkZXIuaWQpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnBlcnNpc3QoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaHlkcmF0ZVN0b3JlZEFwaUtleXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLnByb3ZpZGVycy5maWx0ZXIoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5hdXRoTW9kZSA9PT0gJ3N0b3JlZCcgJiYgY2FuZGlkYXRlLmlkKSkge1xuXHRcdFx0Y29uc3QgYXBpS2V5ID0gYXdhaXQgdGhpcy5yZWFkQXBpS2V5Py4ocHJvdmlkZXIuaWQpO1xuXHRcdFx0aWYgKGFwaUtleSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLndyaXRlQXBpS2V5Py4ocHJvdmlkZXIuaWQsIGFwaUtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB0b1NlbGVjdEl0ZW1zKG9wdGlvbnM6IHJlYWRvbmx5IHsgdmFsdWU6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgZGlzYWJsZWQ/OiBib29sZWFuIH1bXSk6IElTZWxlY3RPcHRpb25JdGVtW10ge1xuXHRcdHJldHVybiBvcHRpb25zLm1hcChvcHRpb24gPT4gKHsgdGV4dDogb3B0aW9uLmxhYmVsLCBpc0Rpc2FibGVkOiBvcHRpb24uZGlzYWJsZWQgfHwgb3B0aW9uLnZhbHVlID09PSAnJyB9KSk7XG5cdH1cblxuXHRwcml2YXRlIGxvY2FsTW9kZWxPcHRpb25zKHByb3ZpZGVyOiBJQ29kZXhNb2RlbFByb3ZpZGVyRW50cnksIHJvdzogSUNvZGV4U2F2ZWRNb2RlbCwgcHJvdmlkZXJJbmRleDogbnVtYmVyLCByb3dJbmRleDogbnVtYmVyLCBkaXNjb3ZlcmVkOiByZWFkb25seSBzdHJpbmdbXSwgbG9hZGluZzogYm9vbGVhbiwgYXR0ZW1wdGVkOiBib29sZWFuKTogeyB2YWx1ZTogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyBkaXNhYmxlZD86IGJvb2xlYW4gfVtdIHtcblx0XHRjb25zdCB1c2VkID0gdGhpcy51c2VkTW9kZWxOYW1lcyhwcm92aWRlckluZGV4LCByb3dJbmRleCk7XG5cdFx0Y29uc3QgbmFtZXMgPSB1bmlxdWVNb2RlbE5hbWVzKFtyb3cubmFtZSwgLi4uZGlzY292ZXJlZF0pLmZpbHRlcihuYW1lID0+IG5hbWUgPT09IHJvdy5uYW1lLnRyaW0oKSB8fCAhdXNlZC5oYXMobmFtZSkpO1xuXHRcdGlmIChuYW1lcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IG5hbWVzLm1hcChuYW1lID0+ICh7IHZhbHVlOiBuYW1lLCBsYWJlbDogbmFtZSwgZGlzYWJsZWQ6IHVzZWQuaGFzKG5hbWUpICYmIG5hbWUgIT09IHJvdy5uYW1lLnRyaW0oKSB9KSk7XG5cdFx0XHRpZiAoIXJvdy5uYW1lLnRyaW0oKSkge1xuXHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHR2YWx1ZTogJycsXG5cdFx0XHRcdFx0bGFiZWw6IGZvcmdlTG9jYWxpemUoJ2NvZGV4Lm1vZGVscy5sb2NhbC5jaG9vc2UnLCAnU2VsZWN0IGEgbW9kZWwnLCAnXHU5MDA5XHU2MkU5XHU2QTIxXHU1NzhCJyksXG5cdFx0XHRcdH0sIC4uLml0ZW1zXTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpdGVtcztcblx0XHR9XG5cdFx0aWYgKGxvYWRpbmcpIHtcblx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHR2YWx1ZTogJycsXG5cdFx0XHRcdGxhYmVsOiBpc09sbGFtYUNhdGFsb2cocHJvdmlkZXIuY2F0YWxvZ0lkKVxuXHRcdFx0XHRcdD8gZm9yZ2VMb2NhbGl6ZSgnY29kZXgubW9kZWxzLm9sbGFtYS5sb2FkaW5nJywgJ0RldGVjdGluZyBtb2RlbHMgd2l0aCBvbGxhbWEgbGlzdC4uLicsICdcdTZCNjNcdTU3MjhcdTc1Mjggb2xsYW1hIGxpc3QgXHU2OEMwXHU2RDRCXHU2QTIxXHU1NzhCLi4uJylcblx0XHRcdFx0XHQ6IGZvcmdlTG9jYWxpemUoJ2NvZGV4Lm1vZGVscy5sb2NhbC5sb2FkaW5nJywgJ0RldGVjdGluZyBsb2NhbCBtb2RlbHMuLi4nLCAnXHU2QjYzXHU1NzI4XHU4MUVBXHU1MkE4XHU2OEMwXHU2RDRCXHU2NzJDXHU1NzMwXHU2QTIxXHU1NzhCLi4uJyksXG5cdFx0XHR9XTtcblx0XHR9XG5cdFx0aWYgKCFhdHRlbXB0ZWQpIHtcblx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHR2YWx1ZTogJycsXG5cdFx0XHRcdGxhYmVsOiBmb3JnZUxvY2FsaXplKCdjb2RleC5tb2RlbHMubG9jYWwub3BlblRvRGV0ZWN0JywgJ09wZW4gdG8gYXV0by1kZXRlY3QgbW9kZWxzJywgJ1x1NjI1M1x1NUYwMFx1NEUwQlx1NjJDOVx1NTIxN1x1NEVFNVx1ODFFQVx1NTJBOFx1NjhDMFx1NkQ0QicpLFxuXHRcdFx0fV07XG5cdFx0fVxuXHRcdHJldHVybiBbe1xuXHRcdFx0dmFsdWU6ICcnLFxuXHRcdFx0bGFiZWw6IGlzT2xsYW1hQ2F0YWxvZyhwcm92aWRlci5jYXRhbG9nSWQpXG5cdFx0XHRcdD8gZm9yZ2VMb2NhbGl6ZSgnY29kZXgubW9kZWxzLm9sbGFtYS5lbXB0eScsICdObyBPbGxhbWEgbW9kZWxzIGRldGVjdGVkJywgJ1x1NjcyQVx1NjhDMFx1NkQ0Qlx1NTIzMCBPbGxhbWEgXHU2QTIxXHU1NzhCJylcblx0XHRcdFx0OiBmb3JnZUxvY2FsaXplKCdjb2RleC5tb2RlbHMubG9jYWwuZW1wdHknLCAnTm8gbG9jYWwgbW9kZWxzIGRldGVjdGVkJywgJ1x1NjcyQVx1NjhDMFx1NkQ0Qlx1NTIzMFx1NjcyQ1x1NTczMFx1NkEyMVx1NTc4QicpLFxuXHRcdH1dO1xuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoTG9jYWxTZWxlY3RzKGtleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBbc2VsZWN0S2V5LCBlbnRyeV0gb2YgdGhpcy5sb2NhbFNlbGVjdHMpIHtcblx0XHRcdGlmICghc2VsZWN0S2V5LnN0YXJ0c1dpdGgoYCR7a2V5fTpgKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5wcm92aWRlcnNbZW50cnkucHJvdmlkZXJJbmRleF07XG5cdFx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgcm93ID0gdGhpcy52aXNpYmxlTW9kZWxzKHByb3ZpZGVyKVtlbnRyeS5yb3dJbmRleF0gPz8geyBuYW1lOiAnJywgZW5hYmxlZDogdHJ1ZSB9O1xuXHRcdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMubG9jYWxNb2RlbE9wdGlvbnMoXG5cdFx0XHRcdHByb3ZpZGVyLFxuXHRcdFx0XHRyb3csXG5cdFx0XHRcdGVudHJ5LnByb3ZpZGVySW5kZXgsXG5cdFx0XHRcdGVudHJ5LnJvd0luZGV4LFxuXHRcdFx0XHR0aGlzLmRpc2NvdmVyZWRMb2NhbE1vZGVscy5nZXQoa2V5KSA/PyBbXSxcblx0XHRcdFx0dGhpcy5kaXNjb3ZlcmluZ0xvY2FsLmhhcyhrZXkpLFxuXHRcdFx0XHR0aGlzLmRpc2NvdmVyZWRMb2NhbE1vZGVscy5oYXMoa2V5KSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBzZWxlY3RlZCA9IE1hdGgubWF4KDAsIG9wdGlvbnMuZmluZEluZGV4KG9wdGlvbiA9PiBvcHRpb24udmFsdWUgPT09IHJvdy5uYW1lICYmIG9wdGlvbi52YWx1ZSAhPT0gJycpKTtcblx0XHRcdGVudHJ5LnNlbGVjdC5zZXRPcHRpb25zKHRoaXMudG9TZWxlY3RJdGVtcyhvcHRpb25zKSwgc2VsZWN0ZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVmcmVzaENhdGFsb2dTZWxlY3RzKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW2luZGV4LCBzZWxlY3RdIG9mIHRoaXMuY2F0YWxvZ1NlbGVjdHMpIHtcblx0XHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLmNhdGFsb2dTZWxlY3RPcHRpb25zKGluZGV4KTtcblx0XHRcdGNvbnN0IHNlbGVjdGVkID0gTWF0aC5tYXgoMCwgb3B0aW9ucy5maW5kSW5kZXgob3B0aW9uID0+IG9wdGlvbi52YWx1ZSA9PT0gdGhpcy5wcm92aWRlcnNbaW5kZXhdPy5jYXRhbG9nSWQpKTtcblx0XHRcdHNlbGVjdC5zZXRPcHRpb25zKG9wdGlvbnMubWFwKG9wdGlvbiA9PiAoeyB0ZXh0OiBvcHRpb24ubGFiZWwsIGRldGFpbDogb3B0aW9uLmRldGFpbCwgaXNEaXNhYmxlZDogb3B0aW9uLmRpc2FibGVkIH0pKSwgc2VsZWN0ZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3luY0FkZEJ1dHRvbnMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuYWRkUHJvdmlkZXJCdXR0b24pIHtcblx0XHRcdHRoaXMuYWRkUHJvdmlkZXJCdXR0b24uZW5hYmxlZCA9ICEhdGhpcy5uZXh0VW51c2VkQ2F0YWxvZ0lkKCk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgW2luZGV4LCBidXR0b25zXSBvZiB0aGlzLm1vZGVsTmV3QnV0dG9ucykge1xuXHRcdFx0Y29uc3QgZW5hYmxlZCA9IHRoaXMuY2FuQWRkTW9kZWxSb3coaW5kZXgpO1xuXHRcdFx0Zm9yIChjb25zdCBidXR0b24gb2YgYnV0dG9ucykge1xuXHRcdFx0XHRidXR0b24uZW5hYmxlZCA9IGVuYWJsZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgW2luZGV4LCBidXR0b25zXSBvZiB0aGlzLm1vZGVsUmVtb3ZlQnV0dG9ucykge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLnByb3ZpZGVyc1tpbmRleF0gPz8gZGVmYXVsdENvZGV4TW9kZWxQcm92aWRlckVudHJ5KCk7XG5cdFx0XHRjb25zdCByb3dzID0gdGhpcy52aXNpYmxlTW9kZWxzKHByb3ZpZGVyKTtcblx0XHRcdGJ1dHRvbnMuZm9yRWFjaCgoYnV0dG9uLCByb3dJbmRleCkgPT4ge1xuXHRcdFx0XHRidXR0b24uZW5hYmxlZCA9IHJvd3MubGVuZ3RoID4gMSAmJiAhaXNPZmZpY2lhbExvY2tlZE1vZGVsKHByb3ZpZGVyLCByb3dzW3Jvd0luZGV4XT8ubmFtZSA/PyAnJyk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNuYXBzaG90TGF5b3V0KCk6IE1hcDxzdHJpbmcsIERPTVJlY3Q+IHtcblx0XHRjb25zdCBtYXAgPSBuZXcgTWFwPHN0cmluZywgRE9NUmVjdD4oKTtcblx0XHRmb3IgKGNvbnN0IGVsIG9mIHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWxheW91dC1pZF0nKSkge1xuXHRcdFx0Y29uc3QgaWQgPSAoZWwgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXRbJ2xheW91dElkJ107XG5cdFx0XHRpZiAoaWQpIHtcblx0XHRcdFx0bWFwLnNldChpZCwgZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbWFwO1xuXHR9XG5cblx0cHJpdmF0ZSBwcmVmZXJzUmVkdWNlZE1vdGlvbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jb250YWluZXIub3duZXJEb2N1bWVudC5kZWZhdWx0Vmlldz8ubWF0Y2hNZWRpYSgnKHByZWZlcnMtcmVkdWNlZC1tb3Rpb246IHJlZHVjZSknKS5tYXRjaGVzID09PSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBwbGF5SW5zZXJ0QW5pbWF0aW9uKGJlZm9yZTogTWFwPHN0cmluZywgRE9NUmVjdD4sIGluc2VydGVkOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGZpbmlzaCA9ICgpID0+IHtcblx0XHRcdGluc2VydGVkLmNsYXNzTGlzdC5yZW1vdmUoJ2FnZW50LW1vZGVscy1lbnRlcicsICdhZ2VudC1tb2RlbHMtZW50ZXItcGVuZGluZycpO1xuXHRcdFx0aW5zZXJ0ZWQuc3R5bGUucG9pbnRlckV2ZW50cyA9ICcnO1xuXHRcdFx0aW5zZXJ0ZWQuc3R5bGUub3BhY2l0eSA9ICcnO1xuXHRcdFx0aW5zZXJ0ZWQuc3R5bGUudHJhbnNmb3JtID0gJyc7XG5cdFx0XHRmb3IgKGNvbnN0IGVsIG9mIG1vdmluZykge1xuXHRcdFx0XHRlbC5jbGFzc0xpc3QucmVtb3ZlKCdhZ2VudC1tb2RlbHMtbGF5b3V0LW1vdmluZycpO1xuXHRcdFx0XHRlbC5zdHlsZS50cmFuc2l0aW9uID0gJyc7XG5cdFx0XHRcdGVsLnN0eWxlLnRyYW5zZm9ybSA9ICcnO1xuXHRcdFx0XHRlbC5zdHlsZS5wb2ludGVyRXZlbnRzID0gJyc7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBtb3Zpbmc6IEhUTUxFbGVtZW50W10gPSBbXTtcblx0XHRpZiAodGhpcy5wcmVmZXJzUmVkdWNlZE1vdGlvbigpKSB7XG5cdFx0XHRmaW5pc2goKTtcblx0XHRcdGluc2VydGVkLnNjcm9sbEludG9WaWV3KHsgYmxvY2s6ICduZWFyZXN0JyB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBub2RlIG9mIHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWxheW91dC1pZF0nKSkge1xuXHRcdFx0Y29uc3QgZWwgPSBub2RlIGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0aWYgKGVsID09PSBpbnNlcnRlZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZpcnN0ID0gZWwuZGF0YXNldFsnbGF5b3V0SWQnXSA/IGJlZm9yZS5nZXQoZWwuZGF0YXNldFsnbGF5b3V0SWQnXSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIWZpcnN0KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbGFzdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0Y29uc3QgZHkgPSBmaXJzdC50b3AgLSBsYXN0LnRvcDtcblx0XHRcdGlmIChNYXRoLmFicyhkeSkgPCAwLjUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRlbC5zdHlsZS50cmFuc2l0aW9uID0gJ25vbmUnO1xuXHRcdFx0ZWwuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZVkoJHtkeX1weClgO1xuXHRcdFx0ZWwuY2xhc3NMaXN0LmFkZCgnYWdlbnQtbW9kZWxzLWxheW91dC1tb3ZpbmcnKTtcblx0XHRcdG1vdmluZy5wdXNoKGVsKTtcblx0XHR9XG5cdFx0aW5zZXJ0ZWQuY2xhc3NMaXN0LmFkZCgnYWdlbnQtbW9kZWxzLWVudGVyLXBlbmRpbmcnKTtcblx0XHRpbnNlcnRlZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCB3aW4gPSB0aGlzLmNvbnRhaW5lci5vd25lckRvY3VtZW50LmRlZmF1bHRWaWV3O1xuXHRcdHdpbj8ucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgZWwgb2YgbW92aW5nKSB7XG5cdFx0XHRcdGVsLnN0eWxlLnRyYW5zaXRpb24gPSBgdHJhbnNmb3JtICR7SU5TRVJUX1NISUZUX01TfW1zIGN1YmljLWJlemllcigwLjIyLCAxLCAwLjM2LCAxKWA7XG5cdFx0XHRcdGVsLnN0eWxlLnRyYW5zZm9ybSA9ICcnO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnN0IHBvcCA9ICgpID0+IHtcblx0XHRcdGluc2VydGVkLmNsYXNzTGlzdC5yZW1vdmUoJ2FnZW50LW1vZGVscy1lbnRlci1wZW5kaW5nJyk7XG5cdFx0XHRpbnNlcnRlZC5jbGFzc0xpc3QuYWRkKCdhZ2VudC1tb2RlbHMtZW50ZXInKTtcblx0XHRcdGluc2VydGVkLnNjcm9sbEludG9WaWV3KHsgYmxvY2s6ICduZWFyZXN0JywgYmVoYXZpb3I6ICdzbW9vdGgnIH0pO1xuXHRcdH07XG5cdFx0aWYgKG1vdmluZy5sZW5ndGggPiAwKSB7XG5cdFx0XHR3aW4/LnNldFRpbWVvdXQocG9wLCBJTlNFUlRfU0hJRlRfTVMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR3aW4/LnJlcXVlc3RBbmltYXRpb25GcmFtZShwb3ApO1xuXHRcdH1cblx0XHRpbnNlcnRlZC5hZGRFdmVudExpc3RlbmVyKCdhbmltYXRpb25lbmQnLCBldmVudCA9PiB7XG5cdFx0XHRpZiAoZXZlbnQudGFyZ2V0ID09PSBpbnNlcnRlZCkge1xuXHRcdFx0XHRmaW5pc2goKTtcblx0XHRcdH1cblx0XHR9LCB7IG9uY2U6IHRydWUgfSk7XG5cdFx0d2luPy5zZXRUaW1lb3V0KGZpbmlzaCwgSU5TRVJUX1NISUZUX01TICsgSU5TRVJUX1BPUF9NUyArIDgwKTtcblx0fVxuXG5cdHByaXZhdGUgZW5zdXJlTG9jYWxEaXNjb3ZlcnkocHJvdmlkZXI6IElDb2RleE1vZGVsUHJvdmlkZXJFbnRyeSB8IHVuZGVmaW5lZCwgZm9yY2UgPSBmYWxzZSk6IHZvaWQge1xuXHRcdGlmICghcHJvdmlkZXIgfHwgIWRpc2NvdmVyc0NvZGV4TG9jYWxNb2RlbHMocHJvdmlkZXIuY2F0YWxvZ0lkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBrZXkgPSB0aGlzLmRpc2NvdmVyeUtleShwcm92aWRlcik7XG5cdFx0aWYgKCFmb3JjZSAmJiAodGhpcy5kaXNjb3ZlcmluZ0xvY2FsLmhhcyhrZXkpIHx8IHRoaXMuZGlzY292ZXJlZExvY2FsTW9kZWxzLmhhcyhrZXkpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5kaXNjb3ZlcmluZ0xvY2FsLmhhcyhrZXkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZGlzY292ZXJpbmdMb2NhbC5hZGQoa2V5KTtcblx0XHRpZiAoIXRoaXMuZGlzY292ZXJlZExvY2FsTW9kZWxzLmhhcyhrZXkpKSB7XG5cdFx0XHR0aGlzLnJlZnJlc2hMb2NhbFNlbGVjdHMoa2V5KTtcblx0XHR9XG5cdFx0Y29uc3QgY2F0YWxvZyA9IGdldENvZGV4TW9kZWxDYXRhbG9nRW50cnkocHJvdmlkZXIuY2F0YWxvZ0lkKTtcblx0XHR2b2lkIHRoaXMuZGlzY292ZXJMb2NhbE1vZGVscyhjYXRhbG9nLCBwcm92aWRlci5iYXNlVXJsIHx8IGNhdGFsb2cuZGVmYXVsdEJhc2VVcmwpLnRoZW4obW9kZWxzID0+IHtcblx0XHRcdHRoaXMuZGlzY292ZXJpbmdMb2NhbC5kZWxldGUoa2V5KTtcblx0XHRcdHRoaXMuZGlzY292ZXJlZExvY2FsTW9kZWxzLnNldChrZXksIG1vZGVscyk7XG5cdFx0XHR0aGlzLnJlZnJlc2hMb2NhbFNlbGVjdHMoa2V5KTtcblx0XHRcdHRoaXMuc3luY0FkZEJ1dHRvbnMoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZGlzY292ZXJMb2NhbE1vZGVscyhjYXRhbG9nOiBJQ29kZXhNb2RlbENhdGFsb2dFbnRyeSwgYmFzZVVybDogc3RyaW5nKTogUHJvbWlzZTxyZWFkb25seSBzdHJpbmdbXT4ge1xuXHRcdGlmICh0aGlzLmRpc2NvdmVyTG9jYWxNb2RlbHNGbikge1xuXHRcdFx0cmV0dXJuIHVuaXF1ZU1vZGVsTmFtZXMoYXdhaXQgdGhpcy5kaXNjb3ZlckxvY2FsTW9kZWxzRm4oY2F0YWxvZy5pZCwgYmFzZVVybCkpO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0aWYgKGlzT2xsYW1hQ2F0YWxvZyhjYXRhbG9nLmlkKSkge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5kaXNjb3Zlck9sbGFtYU1vZGVscyhiYXNlVXJsKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHVybCA9IG5ldyBVUkwoYmFzZVVybCB8fCBjYXRhbG9nLmRlZmF1bHRCYXNlVXJsIHx8ICdodHRwOi8vbG9jYWxob3N0OjEyMzQvdjEnKTtcblx0XHRcdHVybC5zZWFyY2ggPSAnJztcblx0XHRcdHVybC5oYXNoID0gJyc7XG5cdFx0XHRpZiAoY2F0YWxvZy5raW5kID09PSAnbG1zdHVkaW8nKSB7XG5cdFx0XHRcdHVybC5wYXRobmFtZSA9IGAke3VybC5wYXRobmFtZS5yZXBsYWNlKC9cXC8oPzp2MXxhcGkpXFwvPyQvLCAnJykucmVwbGFjZSgvXFwvJC8sICcnKX0vYXBpL3YwL21vZGVsc2A7XG5cdFx0XHR9IGVsc2UgaWYgKCEvXFwvbW9kZWxzXFwvPyQvLnRlc3QodXJsLnBhdGhuYW1lKSkge1xuXHRcdFx0XHR1cmwucGF0aG5hbWUgPSBgJHt1cmwucGF0aG5hbWUucmVwbGFjZSgvXFwvJC8sICcnKX0vbW9kZWxzYDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLnRvU3RyaW5nKCkpO1xuXHRcdFx0aWYgKCFyZXNwb25zZS5vaykge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBib2R5ID0gYXdhaXQgcmVzcG9uc2UuanNvbigpIGFzIHsgZGF0YT86IEFycmF5PHsgaWQ/OiBzdHJpbmc7IG5hbWU/OiBzdHJpbmcgfT47IG1vZGVscz86IEFycmF5PHsgaWQ/OiBzdHJpbmc7IG5hbWU/OiBzdHJpbmcgfT4gfTtcblx0XHRcdGNvbnN0IHJhdyA9IEFycmF5LmlzQXJyYXkoYm9keS5kYXRhKSA/IGJvZHkuZGF0YSA6IEFycmF5LmlzQXJyYXkoYm9keS5tb2RlbHMpID8gYm9keS5tb2RlbHMgOiBBcnJheS5pc0FycmF5KGJvZHkpID8gYm9keSBhcyBBcnJheTx7IGlkPzogc3RyaW5nOyBuYW1lPzogc3RyaW5nIH0+IDogW107XG5cdFx0XHRyZXR1cm4gdW5pcXVlTW9kZWxOYW1lcyhyYXcubWFwKG1vZGVsID0+IG1vZGVsLmlkIHx8IG1vZGVsLm5hbWUgfHwgJycpKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRpc2NvdmVyT2xsYW1hTW9kZWxzKGJhc2VVcmw6IHN0cmluZyk6IFByb21pc2U8cmVhZG9ubHkgc3RyaW5nW10+IHtcblx0XHRjb25zdCB1cmxzID0gdW5pcXVlTW9kZWxOYW1lcyhbXG5cdFx0XHRvbGxhbWFUYWdzVXJsKGJhc2VVcmwgfHwgJ2h0dHA6Ly8xMjcuMC4wLjE6MTE0MzQvdjEnKSxcblx0XHRcdCdodHRwOi8vMTI3LjAuMC4xOjExNDM0L2FwaS90YWdzJyxcblx0XHRcdCdodHRwOi8vbG9jYWxob3N0OjExNDM0L2FwaS90YWdzJyxcblx0XHRdKTtcblx0XHRmb3IgKGNvbnN0IHVybCBvZiB1cmxzKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCk7XG5cdFx0XHRcdGlmICghcmVzcG9uc2Uub2spIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBuYW1lcyA9IHBhcnNlT2xsYW1hVGFnc0pzb24oYXdhaXQgcmVzcG9uc2UuanNvbigpKTtcblx0XHRcdFx0aWYgKG5hbWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRyZXR1cm4gbmFtZXM7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwZXJzaXN0KHJlcXVpcmVBcGlLZXlzOiBib29sZWFuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkcmFmdHMgPSB0aGlzLnByb3ZpZGVycy5tYXAocHJvdmlkZXIgPT4gcHJvdmlkZXIubW9kZWxzLmZpbHRlcihtb2RlbCA9PiBtb2RlbC5uYW1lLnRyaW0oKSA9PT0gJycpKTtcblx0XHRjb25zdCB1c2VkSWRzID0gbmV3IFNldCh0aGlzLnByb3ZpZGVycy5tYXAocHJvdmlkZXIgPT4gcHJvdmlkZXIuaWQpLmZpbHRlcihpZCA9PiBpZCAhPT0gJycpKTtcblx0XHRjb25zdCBwcm92aWRlcnMgPSB0aGlzLnByb3ZpZGVycy5tYXAocHJvdmlkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY2F0YWxvZyA9IGdldENvZGV4TW9kZWxDYXRhbG9nRW50cnkocHJvdmlkZXIuY2F0YWxvZ0lkKTtcblx0XHRcdGxldCBpZCA9IHByb3ZpZGVyLmlkO1xuXHRcdFx0aWYgKCFpZCkge1xuXHRcdFx0XHRpZCA9IGFsbG9jYXRlQ29kZXhQcm92aWRlcklkKHByb3ZpZGVyLmNhdGFsb2dJZCwgWy4uLnVzZWRJZHNdKTtcblx0XHRcdFx0dXNlZElkcy5hZGQoaWQpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gcHJvdmlkZXIubW9kZWxzLmZpbHRlcihtb2RlbCA9PiB7XG5cdFx0XHRcdGNvbnN0IG5hbWUgPSBtb2RlbC5uYW1lLnRyaW0oKTtcblx0XHRcdFx0aWYgKG5hbWUgPT09ICcnIHx8IHNlZW4uaGFzKG5hbWUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNlZW4uYWRkKG5hbWUpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4ucHJvdmlkZXIsXG5cdFx0XHRcdGlkLFxuXHRcdFx0XHRuYW1lOiBwcm92aWRlci5vZmZpY2lhbCA/IHByb3ZpZGVyLm5hbWUgOiBjYXRhbG9nLmxhYmVsLFxuXHRcdFx0XHRiYXNlVXJsOiBwcm92aWRlci5iYXNlVXJsIHx8ICghcHJvdmlkZXIub2ZmaWNpYWwgJiYgY2F0YWxvZy5hdXRvQ29uZmlndXJlID8gY2F0YWxvZy5kZWZhdWx0QmFzZVVybCA6ICcnKSxcblx0XHRcdFx0YXV0aE1vZGU6ICFwcm92aWRlci5vZmZpY2lhbCAmJiBjYXRhbG9nLmF1dG9Db25maWd1cmUgPyAnbm9uZScgYXMgY29uc3QgOiAnc3RvcmVkJyBhcyBjb25zdCxcblx0XHRcdFx0a2luZDogY2F0YWxvZy5raW5kLFxuXHRcdFx0XHRtb2RlbHMsXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHRcdHRoaXMucHJvdmlkZXJzID0gcHJvdmlkZXJzLm1hcCgocHJvdmlkZXIsIGluZGV4KSA9PiBkcmFmdHNbaW5kZXhdPy5sZW5ndGhcblx0XHRcdD8geyAuLi5wcm92aWRlciwgbW9kZWxzOiBbLi4ucHJvdmlkZXIubW9kZWxzLCAuLi5kcmFmdHNbaW5kZXhdXSB9XG5cdFx0XHQ6IHByb3ZpZGVyKTtcblx0XHRjb25zdCBhY3RpdmUgPSB0aGlzLnByb3ZpZGVyc1t0aGlzLmFjdGl2ZVByb3ZpZGVySW5kZXgoKV0gPz8gcHJvdmlkZXJzWzBdO1xuXHRcdHRoaXMuYWN0aXZlUHJvdmlkZXJJZCA9IGFjdGl2ZT8uaWQ7XG5cdFx0Y29uc3QgY29uZmlnID0gd2l0aERlZmF1bHRDb2RleFJvdXRpbmcoe1xuXHRcdFx0bW9kZWw6IHRoaXMubW9kZWwudHJpbSgpLFxuXHRcdFx0bW9kZWxQcm92aWRlcjogdGhpcy5tb2RlbFByb3ZpZGVyLnRyaW0oKSxcblx0XHRcdHByb3ZpZGVycyxcblx0XHRcdGFjdGl2ZVByb3ZpZGVySWQ6IHByb3ZpZGVycy5zb21lKHByb3ZpZGVyID0+IHByb3ZpZGVyLmlkID09PSB0aGlzLmFjdGl2ZVByb3ZpZGVySWQpID8gdGhpcy5hY3RpdmVQcm92aWRlcklkIDogcHJvdmlkZXJzWzBdPy5pZCxcblx0XHR9KTtcblx0XHR0aGlzLm1vZGVsID0gY29uZmlnLm1vZGVsO1xuXHRcdHRoaXMubW9kZWxQcm92aWRlciA9IGNvbmZpZy5tb2RlbFByb3ZpZGVyO1xuXHRcdGNvbnN0IGVycm9yID0gdGhpcy52YWxpZGF0ZShjb25maWcpO1xuXHRcdGlmIChlcnJvcikge1xuXHRcdFx0dGhpcy5zaG93RXJyb3IoZXJyb3IpO1xuXHRcdFx0cmV0dXJuIGVycm9yO1xuXHRcdH1cblx0XHRpZiAocmVxdWlyZUFwaUtleXMpIHtcblx0XHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgY29uZmlnLnByb3ZpZGVycy5maWx0ZXIoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5hdXRoTW9kZSA9PT0gJ3N0b3JlZCcgJiYgIWNhbmRpZGF0ZS5vZmZpY2lhbCkpIHtcblx0XHRcdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMucGVuZGluZ0FwaUtleXMuZ2V0KHByb3ZpZGVyLmlkKT8udHJpbSgpO1xuXHRcdFx0XHRjb25zdCBleGlzdGluZyA9IGF3YWl0IHRoaXMucmVhZEFwaUtleT8uKHByb3ZpZGVyLmlkKTtcblx0XHRcdFx0aWYgKCFwZW5kaW5nICYmICFleGlzdGluZykge1xuXHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBmb3JnZUxvY2FsaXplKCdjb2RleC5tb2RlbHMucHJvdmlkZXIuYXBpS2V5LnJlcXVpcmVkJywgJ0VudGVyIGFuIEFQSSBrZXkgZm9yIHswfS4nLCAnXHU4QkY3XHU1ODZCXHU1MTk5IHswfSBcdTc2ODQgQVBJIFx1NUJDNlx1OTRBNVx1MzAwMicsIHByb3ZpZGVyLm5hbWUgfHwgcHJvdmlkZXIuaWQpO1xuXHRcdFx0XHRcdHRoaXMuc2hvd0Vycm9yKG1lc3NhZ2UpO1xuXHRcdFx0XHRcdHJldHVybiBtZXNzYWdlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHByZXZpb3VzUHJvdmlkZXJzID0gdGhpcy5vcmlnaW5hbFByb3ZpZGVycztcblx0XHRhd2FpdCB0aGlzLm9uU2F2ZShjb25maWcpO1xuXHRcdHRoaXMub3JpZ2luYWxQcm92aWRlcnMgPSBjb25maWcucHJvdmlkZXJzO1xuXHRcdGNvbnN0IG5leHRJZHMgPSBuZXcgU2V0KGNvbmZpZy5wcm92aWRlcnMubWFwKHByb3ZpZGVyID0+IHByb3ZpZGVyLmlkKSk7XG5cdFx0Zm9yIChjb25zdCBwcmV2aW91cyBvZiBwcmV2aW91c1Byb3ZpZGVycykge1xuXHRcdFx0Y29uc3QgbmV4dCA9IGNvbmZpZy5wcm92aWRlcnMuZmluZChwcm92aWRlciA9PiBwcm92aWRlci5pZCA9PT0gcHJldmlvdXMuaWQpO1xuXHRcdFx0aWYgKCFuZXh0SWRzLmhhcyhwcmV2aW91cy5pZCkgfHwgKHByZXZpb3VzLmF1dGhNb2RlID09PSAnc3RvcmVkJyAmJiBuZXh0Py5hdXRoTW9kZSAhPT0gJ3N0b3JlZCcpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMud3JpdGVBcGlLZXk/LihwcmV2aW91cy5pZCwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiBjb25maWcucHJvdmlkZXJzLmZpbHRlcihjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmF1dGhNb2RlID09PSAnc3RvcmVkJykpIHtcblx0XHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLnBlbmRpbmdBcGlLZXlzLmdldChwcm92aWRlci5pZCk/LnRyaW0oKTtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgdGhpcy5yZWFkQXBpS2V5Py4ocHJvdmlkZXIuaWQpO1xuXHRcdFx0YXdhaXQgdGhpcy53cml0ZUFwaUtleT8uKHByb3ZpZGVyLmlkLCBwZW5kaW5nIHx8IGV4aXN0aW5nKTtcblx0XHR9XG5cdFx0dGhpcy5wZW5kaW5nQXBpS2V5cy5jbGVhcigpO1xuXHRcdHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5hZ2VudC1tb2RlbHMtZXJyb3InKT8ucmVtb3ZlKCk7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgdmFsaWRhdGUoY29uZmlnOiBJQ29kZXhNb2RlbHNDb25maWcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IGNhdGFsb2dzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiBjb25maWcucHJvdmlkZXJzKSB7XG5cdFx0XHRpZiAoIS9eW0EtWmEtejAtOV8tXSskLy50ZXN0KHByb3ZpZGVyLmlkKSkge1xuXHRcdFx0XHRyZXR1cm4gZm9yZ2VMb2NhbGl6ZSgnY29kZXgubW9kZWxzLnByb3ZpZGVyLmlkLmludmFsaWQnLCAnUHJvdmlkZXIgSURzIG1heSBvbmx5IGNvbnRhaW4gbGV0dGVycywgbnVtYmVycywgdW5kZXJzY29yZXMsIGFuZCBoeXBoZW5zLicsICdcdTYzRDBcdTRGOUJcdTU1NDZcdTUxODVcdTkwRThcdTY4MDdcdThCQzZcdTUzRUFcdTgwRkRcdTUzMDVcdTU0MkJcdTVCNTdcdTZCQ0RcdTMwMDFcdTY1NzBcdTVCNTdcdTMwMDFcdTRFMEJcdTUyMTJcdTdFQkZcdTU0OENcdThGREVcdTVCNTdcdTdCMjZcdTMwMDInKTtcblx0XHRcdH1cblx0XHRcdGlmIChpZHMuaGFzKHByb3ZpZGVyLmlkKSkge1xuXHRcdFx0XHRyZXR1cm4gZm9yZ2VMb2NhbGl6ZSgnY29kZXgubW9kZWxzLnByb3ZpZGVyLmlkLmR1cGxpY2F0ZScsICdQcm92aWRlciBcInswfVwiIGlzIGR1cGxpY2F0ZWQuJywgJ1x1NjNEMFx1NEY5Qlx1NTU0Nlx1MjAxQ3swfVx1MjAxRFx1OTFDRFx1NTkwRFx1NEU4Nlx1MzAwMicsIHByb3ZpZGVyLmlkKTtcblx0XHRcdH1cblx0XHRcdGlkcy5hZGQocHJvdmlkZXIuaWQpO1xuXHRcdFx0aWYgKCFpc09mZmljaWFsTW9kZWxQcm92aWRlcihwcm92aWRlcikpIHtcblx0XHRcdFx0aWYgKGNhdGFsb2dzLmhhcyhwcm92aWRlci5jYXRhbG9nSWQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZvcmdlTG9jYWxpemUoJ2NvZGV4Lm1vZGVscy5wcm92aWRlci5hbHJlYWR5QWRkZWQuZXJyb3InLCAnUHJvdmlkZXIgXCJ7MH1cIiBoYXMgYWxyZWFkeSBiZWVuIGFkZGVkLicsICdcdTYzRDBcdTRGOUJcdTU1NDZcdTIwMUN7MH1cdTIwMURcdTVERjJcdTdFQ0ZcdTZERkJcdTUyQTBcdThGQzdcdTRFODZcdTMwMDInLCBwcm92aWRlci5uYW1lIHx8IHByb3ZpZGVyLmNhdGFsb2dJZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2F0YWxvZ3MuYWRkKHByb3ZpZGVyLmNhdGFsb2dJZCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtb2RlbE5hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IG1vZGVsIG9mIHByb3ZpZGVyLm1vZGVscykge1xuXHRcdFx0XHRjb25zdCBuYW1lID0gbW9kZWwubmFtZS50cmltKCk7XG5cdFx0XHRcdGlmIChuYW1lID09PSAnJykge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChtb2RlbE5hbWVzLmhhcyhuYW1lKSkge1xuXHRcdFx0XHRcdHJldHVybiBmb3JnZUxvY2FsaXplKCdjb2RleC5tb2RlbHMubW9kZWwuZHVwbGljYXRlJywgJ01vZGVsIFwiezB9XCIgaGFzIGFscmVhZHkgYmVlbiBhZGRlZC4nLCAnXHU2QTIxXHU1NzhCXHUyMDFDezB9XHUyMDFEXHU1REYyXHU3RUNGXHU2REZCXHU1MkEwXHU4RkM3XHU0RTg2XHUzMDAyJywgbmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bW9kZWxOYW1lcy5hZGQobmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXByb3ZpZGVyLmJhc2VVcmwpIHtcblx0XHRcdFx0aWYgKHByb3ZpZGVyLm9mZmljaWFsIHx8IHByb3ZpZGVyLm1vZGVscy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZm9yZ2VMb2NhbGl6ZSgnY29kZXgubW9kZWxzLnByb3ZpZGVyLmJhc2VVcmwucmVxdWlyZWQnLCAnUHJvdmlkZXIgVVJMIGlzIHJlcXVpcmVkIGZvciB7MH0uJywgJ1x1OEJGN1x1NTg2Qlx1NTE5OSB7MH0gXHU3Njg0XHU2M0QwXHU0RjlCXHU1NTQ2XHU3RjUxXHU1NzQwXHUzMDAyJywgcHJvdmlkZXIubmFtZSB8fCBwcm92aWRlci5pZCk7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB1cmwgPSBuZXcgVVJMKHByb3ZpZGVyLmJhc2VVcmwpO1xuXHRcdFx0XHRpZiAodXJsLnByb3RvY29sICE9PSAnaHR0cDonICYmIHVybC5wcm90b2NvbCAhPT0gJ2h0dHBzOicpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3Vuc3VwcG9ydGVkIHByb3RvY29sJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRyZXR1cm4gZm9yZ2VMb2NhbGl6ZSgnY29kZXgubW9kZWxzLnByb3ZpZGVyLmJhc2VVcmwuaW52YWxpZCcsICdFbnRlciBhIHZhbGlkIEhUVFAgb3IgSFRUUFMgVVJMIGZvciB7MH0uJywgJ1x1OEJGN1x1NEUzQSB7MH0gXHU4RjkzXHU1MTY1XHU2NzA5XHU2NTQ4XHU3Njg0IEhUVFAgXHU2MjE2IEhUVFBTIFx1N0Y1MVx1NTc0MFx1MzAwMicsIHByb3ZpZGVyLm5hbWUgfHwgcHJvdmlkZXIuaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG93RXJyb3IobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5jb250YWluZXIucXVlcnlTZWxlY3RvcignLmFnZW50LW1vZGVscy1lcnJvcicpPy5yZW1vdmUoKTtcblx0XHRET00uYXBwZW5kKHRoaXMuY29udGFpbmVyLCBET00uJCgnLmFnZW50LW1vZGVscy1lcnJvcicpKS50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxpQkFBeUM7QUFDbEQsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLHlCQUF5QixnQ0FBZ0MsMkJBQTJCLDJCQUEyQixnQkFBZ0IsaUJBQWlCLHVCQUF1Qiw0QkFBNEIsK0JBQTRJO0FBQ3hW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
