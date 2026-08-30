const FORGE_MODELS_FILE_NAME = "forge-models.json";
const CODEX_MODELS_ROOT_CONFIG_KEY = "codex.models";
const OLLAMA_PROVIDER_ID = "ollama";
const LMSTUDIO_PROVIDER_ID = "lmstudio";
const CODEX_MODEL_PROVIDER_MANIFESTS = [
  { kind: "responses", label: "Responses-compatible", defaultBaseUrl: "", defaultAuthMode: "stored", allowsStoredApiKey: true },
  { kind: "ollama", label: "Ollama", defaultBaseUrl: "http://localhost:11434/v1", defaultAuthMode: "none", allowsStoredApiKey: false },
  { kind: "lmstudio", label: "LM Studio", defaultBaseUrl: "http://localhost:1234/v1", defaultAuthMode: "none", allowsStoredApiKey: false }
];
const CODEX_MODEL_CATALOG = [
  { id: "openai", label: "OpenAI", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "azure-openai", label: "Azure OpenAI", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "anthropic", label: "Anthropic", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "google", label: "Google Gemini", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "vertex", label: "Google Vertex AI", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "groq", label: "Groq", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "mistral", label: "Mistral", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "cohere", label: "Cohere", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "together", label: "Together AI", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "fireworks", label: "Fireworks", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "openrouter", label: "OpenRouter", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "deepseek", label: "DeepSeek", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "moonshot", label: "Moonshot / Kimi", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "zhipu", label: "Zhipu GLM", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "dashscope", label: "Alibaba DashScope / Qwen", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "qianfan", label: "Baidu Qianfan", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "volcengine", label: "ByteDance Doubao", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "minimax", label: "MiniMax", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "yi", label: "01.AI Yi", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "xai", label: "xAI Grok", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "perplexity", label: "Perplexity", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "nvidia", label: "NVIDIA NIM", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "huggingface", label: "Hugging Face", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "bedrock", label: "Amazon Bedrock", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "cloudflare", label: "Cloudflare Workers AI", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "siliconflow", label: "SiliconFlow", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "deepinfra", label: "DeepInfra", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "sambanova", label: "SambaNova", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "replicate", label: "Replicate", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "ai21", label: "AI21", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "cerebras", label: "Cerebras", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "novita", label: "Novita", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "github-models", label: "GitHub Models", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "stepfun", label: "StepFun", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "baichuan", label: "Baichuan", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "sensenova", label: "SenseNova", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "hunyuan", label: "Tencent Hunyuan", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "spark", label: "iFlytek Spark", group: "cloud", kind: "responses", defaultBaseUrl: "", autoConfigure: false },
  { id: "ollama", label: "Ollama", group: "local", kind: "ollama", defaultBaseUrl: "http://localhost:11434/v1", autoConfigure: true },
  { id: "lmstudio", label: "LM Studio", group: "local", kind: "lmstudio", defaultBaseUrl: "http://localhost:1234/v1", autoConfigure: true },
  { id: "vllm", label: "vLLM", group: "local", kind: "responses", defaultBaseUrl: "http://localhost:8000/v1", autoConfigure: false },
  { id: "localai", label: "LocalAI", group: "local", kind: "responses", defaultBaseUrl: "http://localhost:8080/v1", autoConfigure: false },
  { id: "llamacpp", label: "llama.cpp", group: "local", kind: "responses", defaultBaseUrl: "http://localhost:8080/v1", autoConfigure: false },
  { id: "gpt4all", label: "GPT4All", group: "local", kind: "responses", defaultBaseUrl: "http://localhost:4891/v1", autoConfigure: false },
  { id: "openwebui", label: "Open WebUI", group: "local", kind: "responses", defaultBaseUrl: "http://localhost:3000/v1", autoConfigure: false },
  { id: "jan", label: "Jan", group: "local", kind: "responses", defaultBaseUrl: "http://localhost:1337/v1", autoConfigure: false },
  { id: "oobabooga", label: "Oobabooga", group: "local", kind: "responses", defaultBaseUrl: "http://localhost:5000/v1", autoConfigure: false },
  { id: "mlx", label: "MLX", group: "local", kind: "responses", defaultBaseUrl: "http://localhost:8080/v1", autoConfigure: false },
  { id: "tgi", label: "Text Generation Inference", group: "local", kind: "responses", defaultBaseUrl: "http://localhost:8080/v1", autoConfigure: false }
];
const STORED_API_KEY_ENV_PREFIX = "FORGE_CODEX_PROVIDER_";
const STORED_API_KEY_ENV_SUFFIX = "_API_KEY";
function getCodexModelCatalogEntry(catalogId) {
  return CODEX_MODEL_CATALOG.find((entry) => entry.id === catalogId) ?? CODEX_MODEL_CATALOG.find((entry) => entry.id === "openai") ?? CODEX_MODEL_CATALOG[0];
}
function listCodexModelCatalog() {
  return [...CODEX_MODEL_CATALOG].sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base", numeric: true }));
}
function isOllamaCatalog(catalogId) {
  return catalogId === "ollama";
}
function discoversCodexLocalModels(catalogId) {
  return isOllamaCatalog(catalogId);
}
function isLocalCatalog(catalogId) {
  return getCodexModelCatalogEntry(catalogId).group === "local";
}
function allocateCodexProviderId(catalogId, existingIds) {
  const base = (catalogId || "provider").replace(/[^A-Za-z0-9_-]/g, "-").replace(/^-+|-+$/g, "") || "provider";
  if (!existingIds.includes(base)) {
    return base;
  }
  let suffix = 2;
  while (existingIds.includes(`${base}-${suffix}`)) {
    suffix++;
  }
  return `${base}-${suffix}`;
}
function enabledCodexPickerModels(config) {
  return config.providers.filter((provider) => provider.enabled && provider.id !== "").flatMap((provider) => provider.models.filter((model) => model.enabled && model.name.trim() !== "").map((model) => ({ providerId: provider.id, name: model.name })));
}
function isRoutableCodexProvider(provider) {
  if (!provider.enabled || provider.id === "") {
    return false;
  }
  if (provider.official && provider.baseUrl.trim() === "") {
    return false;
  }
  return true;
}
function withDefaultCodexRouting(config) {
  const enabled = enabledCodexPickerModels(config).filter((model) => {
    const provider = config.providers.find((candidate) => candidate.id === model.providerId);
    return !!provider && isRoutableCodexProvider(provider);
  });
  const selected = config.providers.find((provider) => provider.id === config.activeProviderId && isRoutableCodexProvider(provider)) ?? config.providers.find((provider) => isRoutableCodexProvider(provider));
  const selectedModel = selected?.models.find((model) => model.enabled && model.name === selected.selectedModel) ?? selected?.models.find((model) => model.enabled);
  const fallback = enabled[0];
  return {
    ...config,
    model: selectedModel?.name || fallback?.name || config.model,
    modelProvider: selected?.id || fallback?.providerId || config.modelProvider
  };
}
function codexProviderSecretStorageKey(providerId) {
  return `forge.codex.modelProvider.${encodeURIComponent(providerId)}.apiKey`;
}
function codexProviderSecretResource(providerId) {
  return `https://forge.local/codex/model-provider/${encodeURIComponent(providerId)}`;
}
function codexProviderStoredApiKeyEnv(providerId) {
  const normalized = providerId.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  return `${STORED_API_KEY_ENV_PREFIX}${normalized}${STORED_API_KEY_ENV_SUFFIX}`;
}
function isCodexProviderStoredApiKeyEnv(envKey) {
  return envKey.startsWith(STORED_API_KEY_ENV_PREFIX) && envKey.endsWith(STORED_API_KEY_ENV_SUFFIX);
}
function defaultCodexModelProviderEntry(catalogId = "openai") {
  const catalog = getCodexModelCatalogEntry(catalogId);
  return {
    id: "",
    catalogId: catalog.id,
    name: catalog.label,
    baseUrl: catalog.autoConfigure ? catalog.defaultBaseUrl : "",
    envKey: "",
    kind: catalog.kind,
    authMode: catalog.autoConfigure ? "none" : "stored",
    wireApi: "responses",
    enabled: true,
    models: [],
    selectedModel: ""
  };
}
function emptyCodexModelsConfig() {
  return { model: "", modelProvider: "", providers: [] };
}
function isEmptyCodexModelsConfig(value) {
  const config = normalizeCodexModelsConfig(value);
  return config.model === "" && config.modelProvider === "" && config.providers.length === 0;
}
function preferCodexModelsConfig(...candidates) {
  for (const candidate of candidates) {
    if (candidate === void 0) {
      continue;
    }
    const config = normalizeCodexModelsConfig(candidate);
    if (!isEmptyCodexModelsConfig(config)) {
      return config;
    }
  }
  return void 0;
}
function inferCatalogId(id, kind) {
  if (CODEX_MODEL_CATALOG.some((entry) => entry.id === id)) {
    return id;
  }
  if (kind === "ollama") {
    return "ollama";
  }
  if (kind === "lmstudio") {
    return "lmstudio";
  }
  const normalized = id.toLowerCase();
  const match = CODEX_MODEL_CATALOG.find((entry) => normalized.includes(entry.id));
  return match?.id ?? "openai";
}
function normalizeSavedModels(value, selectedModel) {
  const models = [];
  const seen = /* @__PURE__ */ new Set();
  if (Array.isArray(value)) {
    for (const raw of value) {
      if (typeof raw === "string" && raw.trim() !== "") {
        const name2 = raw.trim();
        if (seen.has(name2)) {
          continue;
        }
        seen.add(name2);
        models.push({ name: name2, enabled: true });
        continue;
      }
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        continue;
      }
      const entry = raw;
      const name = typeof entry.name === "string" ? entry.name.trim() : "";
      if (name === "" || seen.has(name)) {
        continue;
      }
      seen.add(name);
      models.push({ name, enabled: entry.enabled !== false });
    }
  }
  if (selectedModel && !seen.has(selectedModel)) {
    models.push({ name: selectedModel, enabled: true });
  }
  return models;
}
function normalizeProvider(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return void 0;
  }
  const entry = raw;
  if (typeof entry.id !== "string" || entry.id.trim() === "") {
    return void 0;
  }
  const kind = entry.kind === "ollama" || entry.kind === "lmstudio" ? entry.kind : "responses";
  const envKey = typeof entry.envKey === "string" ? entry.envKey : "";
  const authMode = entry.authMode === "stored" || isCodexProviderStoredApiKeyEnv(envKey) ? "stored" : entry.authMode === "none" ? "none" : envKey === "" ? "none" : "environment";
  const catalogId = typeof entry.catalogId === "string" && entry.catalogId.trim() !== "" ? entry.catalogId.trim() : inferCatalogId(entry.id.trim(), kind);
  const catalog = getCodexModelCatalogEntry(catalogId);
  const selectedModel = typeof entry.selectedModel === "string" ? entry.selectedModel.trim() : "";
  const official = entry.official === true;
  const officialSource = entry.officialSource === "codex" || entry.officialSource === "grok" || entry.officialSource === "deepseek" ? entry.officialSource : void 0;
  const officialModels = Array.isArray(entry.officialModels) ? uniqueNonEmptyStrings(entry.officialModels) : [];
  return {
    id: entry.id.trim(),
    catalogId: catalog.id,
    name: typeof entry.name === "string" && entry.name.trim() !== "" ? entry.name : catalog.label,
    baseUrl: typeof entry.baseUrl === "string" ? entry.baseUrl : "",
    envKey,
    kind: catalog.kind,
    authMode: catalog.autoConfigure ? "none" : authMode,
    wireApi: "responses",
    enabled: entry.enabled !== false,
    models: normalizeSavedModels(entry.models, selectedModel),
    selectedModel,
    ...official ? {
      official: true,
      officialSource,
      officialModels
    } : {}
  };
}
function uniqueNonEmptyStrings(value) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    const name = item.trim();
    if (name === "" || seen.has(name)) {
      continue;
    }
    seen.add(name);
    result.push(name);
  }
  return result;
}
function normalizeCodexModelsConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyCodexModelsConfig();
  }
  const record = value;
  const model = typeof record.model === "string" ? record.model : "";
  const modelProvider = typeof record.modelProvider === "string" ? record.modelProvider : "";
  const providers = Array.isArray(record.providers) ? record.providers.map(normalizeProvider).filter((entry) => !!entry) : [];
  const activeProviderId = typeof record.activeProviderId === "string" && providers.some((provider) => provider.id === record.activeProviderId) ? record.activeProviderId : providers[0]?.id;
  return { model, modelProvider, providers, activeProviderId };
}
export {
  CODEX_MODELS_ROOT_CONFIG_KEY,
  CODEX_MODEL_CATALOG,
  CODEX_MODEL_PROVIDER_MANIFESTS,
  FORGE_MODELS_FILE_NAME,
  LMSTUDIO_PROVIDER_ID,
  OLLAMA_PROVIDER_ID,
  allocateCodexProviderId,
  codexProviderSecretResource,
  codexProviderSecretStorageKey,
  codexProviderStoredApiKeyEnv,
  defaultCodexModelProviderEntry,
  discoversCodexLocalModels,
  emptyCodexModelsConfig,
  enabledCodexPickerModels,
  getCodexModelCatalogEntry,
  isCodexProviderStoredApiKeyEnv,
  isEmptyCodexModelsConfig,
  isLocalCatalog,
  isOllamaCatalog,
  listCodexModelCatalog,
  normalizeCodexModelsConfig,
  preferCodexModelsConfig,
  withDefaultCodexRouting
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxjb21tb25cXGNvZGV4TW9kZWxzQ29uZmlnLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLyoqXG4gKiBTdHJ1Y3R1cmVkIHZhbHVlIGJhY2tpbmcgdGhlIENvZGV4IFwiTW9kZWxzXCIgc2V0dGluZ3Mgc2VjdGlvbi5cbiAqXG4gKiBUaGlzIHNoYXBlIGlzIHN0b3JlZCB1bmRlciB0aGUgcHJvdmlkZXItYmFja2VkIHJvb3QgY29uZmlnIGtleVxuICogYGNvZGV4Lm1vZGVsc2AsIG1pcnJvcmVkIHRvIGBmb3JnZS1tb2RlbHMuanNvbmAgdW5kZXIgQ29kZXggaG9tZSwgYW5kXG4gKiBicmlkZ2VkIHRvIHRoZSBDb2RleCBgY29uZmlnLnRvbWxgIGBtb2RlbGAsIGBtb2RlbF9wcm92aWRlcmAsIGFuZFxuICogYG1vZGVsX3Byb3ZpZGVyc2Aga2V5cyBieSB0aGUgQ29kZXggYWdlbnQgKHNlZSBgY29kZXhBZ2VudC50c2ApLlxuICovXG5cbi8qKiBXaXJlIHByb3RvY29sIGZvciBhIGN1c3RvbSBwcm92aWRlci4gT25seSBgcmVzcG9uc2VzYCBpcyBzdXBwb3J0ZWQgdXBzdHJlYW0uICovXG5leHBvcnQgdHlwZSBDb2RleE1vZGVsV2lyZUFwaSA9ICdyZXNwb25zZXMnO1xuXG5leHBvcnQgdHlwZSBDb2RleE1vZGVsUHJvdmlkZXJLaW5kID0gJ3Jlc3BvbnNlcycgfCAnb2xsYW1hJyB8ICdsbXN0dWRpbyc7XG5leHBvcnQgdHlwZSBDb2RleE1vZGVsUHJvdmlkZXJBdXRoTW9kZSA9ICdub25lJyB8ICdlbnZpcm9ubWVudCcgfCAnc3RvcmVkJztcbmV4cG9ydCB0eXBlIENvZGV4TW9kZWxDYXRhbG9nR3JvdXAgPSAnY2xvdWQnIHwgJ2xvY2FsJztcbmV4cG9ydCB0eXBlIENvZGV4T2ZmaWNpYWxNb2RlbFNvdXJjZSA9ICdjb2RleCcgfCAnZ3JvaycgfCAnZGVlcHNlZWsnO1xuXG5leHBvcnQgY29uc3QgRk9SR0VfTU9ERUxTX0ZJTEVfTkFNRSA9ICdmb3JnZS1tb2RlbHMuanNvbic7XG5leHBvcnQgY29uc3QgQ09ERVhfTU9ERUxTX1JPT1RfQ09ORklHX0tFWSA9ICdjb2RleC5tb2RlbHMnO1xuXG4vKiogQSBzYXZlZCBtb2RlbCBuYW1lIGJlbG9uZ2luZyB0byBvbmUgcHJvdmlkZXIgdGFiLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ29kZXhTYXZlZE1vZGVsIHtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBlbmFibGVkOiBib29sZWFuO1xufVxuXG4vKiogQSBzaW5nbGUgdXNlci1kZWZpbmVkIG1vZGVsIHByb3ZpZGVyIChgbW9kZWxfcHJvdmlkZXJzLjxpZD5gKS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNvZGV4TW9kZWxQcm92aWRlckVudHJ5IHtcblx0LyoqIEtleSBpbiB0aGUgYG1vZGVsX3Byb3ZpZGVyc2AgdGFibGUuIEhpZGRlbiBmcm9tIHRoZSBzZXR0aW5ncyBVSS4gKi9cblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0LyoqIENhdGFsb2cgdmVuZG9yIGlkIChPcGVuQUksIE9sbGFtYSwgRGVlcFNlZWssIC4uLikuICovXG5cdHJlYWRvbmx5IGNhdGFsb2dJZDogc3RyaW5nO1xuXHQvKiogRnJpZW5kbHkgZGlzcGxheSBuYW1lIChgbmFtZWApLiAqL1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdC8qKiBPcGVuQUktY29tcGF0aWJsZSBiYXNlIFVSTCAoYGJhc2VfdXJsYCksIGUuZy4gYGh0dHA6Ly9sb2NhbGhvc3Q6MTE0MzQvdjFgLiAqL1xuXHRyZWFkb25seSBiYXNlVXJsOiBzdHJpbmc7XG5cdC8qKiBFbnZpcm9ubWVudCB2YXJpYWJsZSBob2xkaW5nIHRoZSBBUEkga2V5IChgZW52X2tleWApLiBNYXkgYmUgZW1wdHkuICovXG5cdHJlYWRvbmx5IGVudktleTogc3RyaW5nO1xuXHQvKiogUHJvdmlkZXIgcHJlc2V0LiBMb2NhbCBwcmVzZXRzIGFsc28gZGVmaW5lIHRoZWlyIG1vZGVsLWRpc2NvdmVyeSBlbmRwb2ludC4gKi9cblx0cmVhZG9ubHkga2luZDogQ29kZXhNb2RlbFByb3ZpZGVyS2luZDtcblx0LyoqIEhvdyBGb3JnZSBzdXBwbGllcyBjcmVkZW50aWFscyB3aXRob3V0IHBlcnNpc3RpbmcgYSBwbGFpbnRleHQga2V5IGluIGNvbmZpZy50b21sLiAqL1xuXHRyZWFkb25seSBhdXRoTW9kZTogQ29kZXhNb2RlbFByb3ZpZGVyQXV0aE1vZGU7XG5cdC8qKiBXaXJlIEFQSSB0aGUgcHJvdmlkZXIgc3BlYWtzLiAqL1xuXHRyZWFkb25seSB3aXJlQXBpOiBDb2RleE1vZGVsV2lyZUFwaTtcblx0LyoqIFdoZW4gdHJ1ZSwgdGhpcyBwcm92aWRlcidzIGVuYWJsZWQgbW9kZWxzIGFwcGVhciBpbiB0aGUgYWdlbnQgcGlja2VyLiAqL1xuXHRyZWFkb25seSBlbmFibGVkOiBib29sZWFuO1xuXHQvKiogU2F2ZWQgbW9kZWwgbmFtZXMgZm9yIHRoaXMgcHJvdmlkZXIgY2FyZC4gKi9cblx0cmVhZG9ubHkgbW9kZWxzOiByZWFkb25seSBJQ29kZXhTYXZlZE1vZGVsW107XG5cdC8qKiBDdXJyZW50bHkgZWRpdGVkIG1vZGVsIG5hbWU7IHJlc3RvcmVkIHdoZW4gc3dpdGNoaW5nIHRhYnMuICovXG5cdHJlYWRvbmx5IHNlbGVjdGVkTW9kZWw6IHN0cmluZztcblx0LyoqIExvZ2luLW1hbmFnZWQgdmVuZG9yIGNhcmQuIE1hbnVhbCBjYXJkcyBuZXZlciBzZXQgdGhpcy4gKi9cblx0cmVhZG9ubHkgb2ZmaWNpYWw/OiBib29sZWFuO1xuXHQvKiogV2hpY2ggc2lnbmVkLWluIGFnZW50IG93bnMgdGhpcyBvZmZpY2lhbCBjYXJkLiAqL1xuXHRyZWFkb25seSBvZmZpY2lhbFNvdXJjZT86IENvZGV4T2ZmaWNpYWxNb2RlbFNvdXJjZTtcblx0LyoqIFZlbmRvci1jYXRhbG9nIG5hbWVzIHRoYXQgY2Fubm90IGJlIGRlbGV0ZWQgd2hpbGUgc2lnbmVkIGluLiAqL1xuXHRyZWFkb25seSBvZmZpY2lhbE1vZGVscz86IHJlYWRvbmx5IHN0cmluZ1tdO1xufVxuXG4vKiogRGVmYXVsdCBtb2RlbCArIHByb3ZpZGVyIHBsdXMgY3VzdG9tIHByb3ZpZGVycyBjb25maWd1cmVkIGZvciBDb2RleC4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNvZGV4TW9kZWxzQ29uZmlnIHtcblx0LyoqIERlZmF1bHQgbW9kZWwgaWQgKGBtb2RlbGApLCBlLmcuIGBncHQtNS42LWx1bmFgIG9yIGBvbGxhbWEvcXdlbjMtY29kZXJgLiAqL1xuXHRyZWFkb25seSBtb2RlbDogc3RyaW5nO1xuXHQvKiogRGVmYXVsdCBwcm92aWRlciBpZCAoYG1vZGVsX3Byb3ZpZGVyYCksIGUuZy4gYG9wZW5haWAsIGBvbGxhbWFgLCBgbG1zdHVkaW9gLCBvciBhIGN1c3RvbSBpZC4gKi9cblx0cmVhZG9ubHkgbW9kZWxQcm92aWRlcjogc3RyaW5nO1xuXHQvKiogVXNlci1kZWZpbmVkIHByb3ZpZGVycyAoYG1vZGVsX3Byb3ZpZGVycy4qYCkuICovXG5cdHJlYWRvbmx5IHByb3ZpZGVyczogcmVhZG9ubHkgSUNvZGV4TW9kZWxQcm92aWRlckVudHJ5W107XG5cdC8qKiBQcm92aWRlciB0YWIgdGhhdCBzaG91bGQgc3RheSBzZWxlY3RlZCBhZnRlciByZWxvYWQuICovXG5cdHJlYWRvbmx5IGFjdGl2ZVByb3ZpZGVySWQ/OiBzdHJpbmc7XG59XG5cbi8qKiBQcm92aWRlciBpZCB1c2VkIGZvciB0aGUgYnVpbHQtaW4gT2xsYW1hIE9TUyBwcm92aWRlci4gKi9cbmV4cG9ydCBjb25zdCBPTExBTUFfUFJPVklERVJfSUQgPSAnb2xsYW1hJztcbi8qKiBQcm92aWRlciBpZCB1c2VkIGZvciB0aGUgYnVpbHQtaW4gTE0gU3R1ZGlvIE9TUyBwcm92aWRlci4gKi9cbmV4cG9ydCBjb25zdCBMTVNUVURJT19QUk9WSURFUl9JRCA9ICdsbXN0dWRpbyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvZGV4TW9kZWxQcm92aWRlck1hbmlmZXN0IHtcblx0cmVhZG9ubHkga2luZDogQ29kZXhNb2RlbFByb3ZpZGVyS2luZDtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgZGVmYXVsdEJhc2VVcmw6IHN0cmluZztcblx0cmVhZG9ubHkgZGVmYXVsdEF1dGhNb2RlOiBDb2RleE1vZGVsUHJvdmlkZXJBdXRoTW9kZTtcblx0cmVhZG9ubHkgYWxsb3dzU3RvcmVkQXBpS2V5OiBib29sZWFuO1xufVxuXG5leHBvcnQgY29uc3QgQ09ERVhfTU9ERUxfUFJPVklERVJfTUFOSUZFU1RTOiByZWFkb25seSBJQ29kZXhNb2RlbFByb3ZpZGVyTWFuaWZlc3RbXSA9IFtcblx0eyBraW5kOiAncmVzcG9uc2VzJywgbGFiZWw6ICdSZXNwb25zZXMtY29tcGF0aWJsZScsIGRlZmF1bHRCYXNlVXJsOiAnJywgZGVmYXVsdEF1dGhNb2RlOiAnc3RvcmVkJywgYWxsb3dzU3RvcmVkQXBpS2V5OiB0cnVlIH0sXG5cdHsga2luZDogJ29sbGFtYScsIGxhYmVsOiAnT2xsYW1hJywgZGVmYXVsdEJhc2VVcmw6ICdodHRwOi8vbG9jYWxob3N0OjExNDM0L3YxJywgZGVmYXVsdEF1dGhNb2RlOiAnbm9uZScsIGFsbG93c1N0b3JlZEFwaUtleTogZmFsc2UgfSxcblx0eyBraW5kOiAnbG1zdHVkaW8nLCBsYWJlbDogJ0xNIFN0dWRpbycsIGRlZmF1bHRCYXNlVXJsOiAnaHR0cDovL2xvY2FsaG9zdDoxMjM0L3YxJywgZGVmYXVsdEF1dGhNb2RlOiAnbm9uZScsIGFsbG93c1N0b3JlZEFwaUtleTogZmFsc2UgfSxcbl07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvZGV4TW9kZWxDYXRhbG9nRW50cnkge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBncm91cDogQ29kZXhNb2RlbENhdGFsb2dHcm91cDtcblx0cmVhZG9ubHkga2luZDogQ29kZXhNb2RlbFByb3ZpZGVyS2luZDtcblx0cmVhZG9ubHkgZGVmYXVsdEJhc2VVcmw6IHN0cmluZztcblx0cmVhZG9ubHkgYXV0b0NvbmZpZ3VyZTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNvbnN0IENPREVYX01PREVMX0NBVEFMT0c6IHJlYWRvbmx5IElDb2RleE1vZGVsQ2F0YWxvZ0VudHJ5W10gPSBbXG5cdHsgaWQ6ICdvcGVuYWknLCBsYWJlbDogJ09wZW5BSScsIGdyb3VwOiAnY2xvdWQnLCBraW5kOiAncmVzcG9uc2VzJywgZGVmYXVsdEJhc2VVcmw6ICcnLCBhdXRvQ29uZmlndXJlOiBmYWxzZSB9LFxuXHR7IGlkOiAnYXp1cmUtb3BlbmFpJywgbGFiZWw6ICdBenVyZSBPcGVuQUknLCBncm91cDogJ2Nsb3VkJywga2luZDogJ3Jlc3BvbnNlcycsIGRlZmF1bHRCYXNlVXJsOiAnJywgYXV0b0NvbmZpZ3VyZTogZmFsc2UgfSxcblx0eyBpZDogJ2FudGhyb3BpYycsIGxhYmVsOiAnQW50aHJvcGljJywgZ3JvdXA6ICdjbG91ZCcsIGtpbmQ6ICdyZXNwb25zZXMnLCBkZWZhdWx0QmFzZVVybDogJycsIGF1dG9Db25maWd1cmU6IGZhbHNlIH0sXG5cdHsgaWQ6ICdnb29nbGUnLCBsYWJlbDogJ0dvb2dsZSBHZW1pbmknLCBncm91cDogJ2Nsb3VkJywga2luZDogJ3Jlc3BvbnNlcycsIGRlZmF1bHRCYXNlVXJsOiAnJywgYXV0b0NvbmZpZ3VyZTogZmFsc2UgfSxcblx0eyBpZDogJ3ZlcnRleCcsIGxhYmVsOiAnR29vZ2xlIFZlcnRleCBBSScsIGdyb3VwOiAnY2xvdWQnLCBraW5kOiAncmVzcG9uc2VzJywgZGVmYXVsdEJhc2VVcmw6ICcnLCBhdXRvQ29uZmlndXJlOiBmYWxzZSB9LFxuXHR7IGlkOiAnZ3JvcScsIGxhYmVsOiAnR3JvcScsIGdyb3VwOiAnY2xvdWQnLCBraW5kOiAncmVzcG9uc2VzJywgZGVmYXVsdEJhc2VVcmw6ICcnLCBhdXRvQ29uZmlndXJlOiBmYWxzZSB9LFxuXHR7IGlkOiAnbWlzdHJhbCcsIGxhYmVsOiAnTWlzdHJhbCcsIGdyb3VwOiAnY2xvdWQnLCBraW5kOiAncmVzcG9uc2VzJywgZGVmYXVsdEJhc2VVcmw6ICcnLCBhdXRvQ29uZmlndXJlOiBmYWxzZSB9LFxuXHR7IGlkOiAnY29oZXJlJywgbGFiZWw6ICdDb2hlcmUnLCBncm91cDogJ2Nsb3VkJywga2luZDogJ3Jlc3BvbnNlcycsIGRlZmF1bHRCYXNlVXJsOiAnJywgYXV0b0NvbmZpZ3VyZTogZmFsc2UgfSxcblx0eyBpZDogJ3RvZ2V0aGVyJywgbGFiZWw6ICdUb2dldGhlciBBSScsIGdyb3VwOiAnY2xvdWQnLCBraW5kOiAncmVzcG9uc2VzJywgZGVmYXVsdEJhc2VVcmw6ICcnLCBhdXRvQ29uZmlndXJlOiBmYWxzZSB9LFxuXHR7IGlkOiAnZmlyZXdvcmtzJywgbGFiZWw6ICdGaXJld29ya3MnLCBncm91cDogJ2Nsb3VkJywga2luZDogJ3Jlc3BvbnNlcycsIGRlZmF1bHRCYXNlVXJsOiAnJywgYXV0b0NvbmZpZ3VyZTogZmFsc2UgfSxcblx0eyBpZDogJ29wZW5yb3V0ZXInLCBsYWJlbDogJ09wZW5Sb3V0ZXInLCBncm91cDogJ2Nsb3VkJywga2luZDogJ3Jlc3BvbnNlcycsIGRlZmF1bHRCYXNlVXJsOiAnJywgYXV0b0NvbmZpZ3VyZTogZmFsc2UgfSxcblx0eyBpZDogJ2RlZXBzZWVrJywgbGFiZWw6ICdEZWVwU2VlaycsIGdyb3VwOiAnY2xvdWQnLCBraW5kOiAncmVzcG9uc2VzJywgZGVmYXVsdEJhc2VVcmw6ICcnLCBhdXRvQ29uZmlndXJlOiBmYWxzZSB9LFxuXHR7IGlkOiAnbW9vbnNob3QnLCBsYWJlbDogJ01vb25zaG90IC8gS2ltaScsIGdyb3VwOiAnY2xvdWQnLCBraW5kOiAncmVzcG9uc2VzJywgZGVmYXVsdEJhc2VVcmw6ICcnLCBhdXRvQ29uZmlndXJlOiBmYWxzZSB9LFxuXHR7IGlkOiAnemhpcHUnLCBsYWJlbDogJ1poaXB1IEdMTScsIGdyb3VwOiAnY2xvdWQnLCBraW5kOiAncmVzcG9uc2VzJywgZGVmYXVsdEJhc2VVcmw6ICcnLCBhdXRvQ29uZmlndXJlOiBmYWxzZSB9LFxuXHR7IGlkOiAnZGFzaHNjb3BlJywgbGFiZWw6ICdBbGliYWJhIERhc2hTY29wZSAvIFF3ZW4nLCBncm91cDogJ2Nsb3VkJywga2luZDogJ3Jlc3BvbnNlcycsIGRlZmF1bHRCYXNlVXJsOiAnJywgYXV0b0NvbmZpZ3VyZTogZmFsc2UgfSxcblx0eyBpZDogJ3FpYW5mYW4nLCBsYWJlbDogJ0JhaWR1IFFpYW5mYW4nLCBncm91cDogJ2Nsb3VkJywga2luZDogJ3Jlc3BvbnNlcycsIGRlZmF1bHRCYXNlVXJsOiAnJywgYXV0b0NvbmZpZ3VyZTogZmFsc2UgfSxcblx0eyBpZDogJ3ZvbGNlbmdpbmUnLCBsYWJlbDogJ0J5dGVEYW5jZSBEb3ViYW8nLCBncm91cDogJ2Nsb3VkJywga2luZDogJ3Jlc3BvbnNlcycsIGRlZmF1bHRCYXNlVXJsOiAnJywgYXV0b0NvbmZpZ3VyZTogZmFsc2UgfSxcblx0eyBpZDogJ21pbmltYXgnLCBsYWJlbDogJ01pbmlNYXgnLCBncm91cDogJ2Nsb3VkJywga2luZDogJ3Jlc3BvbnNlcycsIGRlZmF1bHRCYXNlVXJsOiAnJywgYXV0b0NvbmZpZ3VyZTogZmFsc2UgfSxcblx0eyBpZDogJ3lpJywgbGFiZWw6ICcwMS5BSSBZaScsIGdyb3VwOiAnY2xvdWQnLCBraW5kOiAncmVzcG9uc2VzJywgZGVmYXVsdEJhc2VVcmw6ICcnLCBhdXRvQ29uZmlndXJlOiBmYWxzZSB9LFxuXHR7IGlkOiAneGFpJywgbGFiZWw6ICd4QUkgR3JvaycsIGdyb3VwOiAnY2xvdWQnLCBraW5kOiAncmVzcG9uc2VzJywgZGVmYXVsdEJhc2VVcmw6ICcnLCBhdXRvQ29uZmlndXJlOiBmYWxzZSB9LFxuXHR7IGlkOiAncGVycGxleGl0eScsIGxhYmVsOiAnUGVycGxleGl0eScsIGdyb3VwOiAnY2xvdWQnLCBraW5kOiAncmVzcG9uc2VzJywgZGVmYXVsdEJhc2VVcmw6ICcnLCBhdXRvQ29uZmlndXJlOiBmYWxzZSB9LFxuXHR7IGlkOiAnbnZpZGlhJywgbGFiZWw6ICdOVklESUEgTklNJywgZ3JvdXA6ICdjbG91ZCcsIGtpbmQ6ICdyZXNwb25zZXMnLCBkZWZhdWx0QmFzZVVybDogJycsIGF1dG9Db25maWd1cmU6IGZhbHNlIH0sXG5cdHsgaWQ6ICdodWdnaW5nZmFjZScsIGxhYmVsOiAnSHVnZ2luZyBGYWNlJywgZ3JvdXA6ICdjbG91ZCcsIGtpbmQ6ICdyZXNwb25zZXMnLCBkZWZhdWx0QmFzZVVybDogJycsIGF1dG9Db25maWd1cmU6IGZhbHNlIH0sXG5cdHsgaWQ6ICdiZWRyb2NrJywgbGFiZWw6ICdBbWF6b24gQmVkcm9jaycsIGdyb3VwOiAnY2xvdWQnLCBraW5kOiAncmVzcG9uc2VzJywgZGVmYXVsdEJhc2VVcmw6ICcnLCBhdXRvQ29uZmlndXJlOiBmYWxzZSB9LFxuXHR7IGlkOiAnY2xvdWRmbGFyZScsIGxhYmVsOiAnQ2xvdWRmbGFyZSBXb3JrZXJzIEFJJywgZ3JvdXA6ICdjbG91ZCcsIGtpbmQ6ICdyZXNwb25zZXMnLCBkZWZhdWx0QmFzZVVybDogJycsIGF1dG9Db25maWd1cmU6IGZhbHNlIH0sXG5cdHsgaWQ6ICdzaWxpY29uZmxvdycsIGxhYmVsOiAnU2lsaWNvbkZsb3cnLCBncm91cDogJ2Nsb3VkJywga2luZDogJ3Jlc3BvbnNlcycsIGRlZmF1bHRCYXNlVXJsOiAnJywgYXV0b0NvbmZpZ3VyZTogZmFsc2UgfSxcblx0eyBpZDogJ2RlZXBpbmZyYScsIGxhYmVsOiAnRGVlcEluZnJhJywgZ3JvdXA6ICdjbG91ZCcsIGtpbmQ6ICdyZXNwb25zZXMnLCBkZWZhdWx0QmFzZVVybDogJycsIGF1dG9Db25maWd1cmU6IGZhbHNlIH0sXG5cdHsgaWQ6ICdzYW1iYW5vdmEnLCBsYWJlbDogJ1NhbWJhTm92YScsIGdyb3VwOiAnY2xvdWQnLCBraW5kOiAncmVzcG9uc2VzJywgZGVmYXVsdEJhc2VVcmw6ICcnLCBhdXRvQ29uZmlndXJlOiBmYWxzZSB9LFxuXHR7IGlkOiAncmVwbGljYXRlJywgbGFiZWw6ICdSZXBsaWNhdGUnLCBncm91cDogJ2Nsb3VkJywga2luZDogJ3Jlc3BvbnNlcycsIGRlZmF1bHRCYXNlVXJsOiAnJywgYXV0b0NvbmZpZ3VyZTogZmFsc2UgfSxcblx0eyBpZDogJ2FpMjEnLCBsYWJlbDogJ0FJMjEnLCBncm91cDogJ2Nsb3VkJywga2luZDogJ3Jlc3BvbnNlcycsIGRlZmF1bHRCYXNlVXJsOiAnJywgYXV0b0NvbmZpZ3VyZTogZmFsc2UgfSxcblx0eyBpZDogJ2NlcmVicmFzJywgbGFiZWw6ICdDZXJlYnJhcycsIGdyb3VwOiAnY2xvdWQnLCBraW5kOiAncmVzcG9uc2VzJywgZGVmYXVsdEJhc2VVcmw6ICcnLCBhdXRvQ29uZmlndXJlOiBmYWxzZSB9LFxuXHR7IGlkOiAnbm92aXRhJywgbGFiZWw6ICdOb3ZpdGEnLCBncm91cDogJ2Nsb3VkJywga2luZDogJ3Jlc3BvbnNlcycsIGRlZmF1bHRCYXNlVXJsOiAnJywgYXV0b0NvbmZpZ3VyZTogZmFsc2UgfSxcblx0eyBpZDogJ2dpdGh1Yi1tb2RlbHMnLCBsYWJlbDogJ0dpdEh1YiBNb2RlbHMnLCBncm91cDogJ2Nsb3VkJywga2luZDogJ3Jlc3BvbnNlcycsIGRlZmF1bHRCYXNlVXJsOiAnJywgYXV0b0NvbmZpZ3VyZTogZmFsc2UgfSxcblx0eyBpZDogJ3N0ZXBmdW4nLCBsYWJlbDogJ1N0ZXBGdW4nLCBncm91cDogJ2Nsb3VkJywga2luZDogJ3Jlc3BvbnNlcycsIGRlZmF1bHRCYXNlVXJsOiAnJywgYXV0b0NvbmZpZ3VyZTogZmFsc2UgfSxcblx0eyBpZDogJ2JhaWNodWFuJywgbGFiZWw6ICdCYWljaHVhbicsIGdyb3VwOiAnY2xvdWQnLCBraW5kOiAncmVzcG9uc2VzJywgZGVmYXVsdEJhc2VVcmw6ICcnLCBhdXRvQ29uZmlndXJlOiBmYWxzZSB9LFxuXHR7IGlkOiAnc2Vuc2Vub3ZhJywgbGFiZWw6ICdTZW5zZU5vdmEnLCBncm91cDogJ2Nsb3VkJywga2luZDogJ3Jlc3BvbnNlcycsIGRlZmF1bHRCYXNlVXJsOiAnJywgYXV0b0NvbmZpZ3VyZTogZmFsc2UgfSxcblx0eyBpZDogJ2h1bnl1YW4nLCBsYWJlbDogJ1RlbmNlbnQgSHVueXVhbicsIGdyb3VwOiAnY2xvdWQnLCBraW5kOiAncmVzcG9uc2VzJywgZGVmYXVsdEJhc2VVcmw6ICcnLCBhdXRvQ29uZmlndXJlOiBmYWxzZSB9LFxuXHR7IGlkOiAnc3BhcmsnLCBsYWJlbDogJ2lGbHl0ZWsgU3BhcmsnLCBncm91cDogJ2Nsb3VkJywga2luZDogJ3Jlc3BvbnNlcycsIGRlZmF1bHRCYXNlVXJsOiAnJywgYXV0b0NvbmZpZ3VyZTogZmFsc2UgfSxcblx0eyBpZDogJ29sbGFtYScsIGxhYmVsOiAnT2xsYW1hJywgZ3JvdXA6ICdsb2NhbCcsIGtpbmQ6ICdvbGxhbWEnLCBkZWZhdWx0QmFzZVVybDogJ2h0dHA6Ly9sb2NhbGhvc3Q6MTE0MzQvdjEnLCBhdXRvQ29uZmlndXJlOiB0cnVlIH0sXG5cdHsgaWQ6ICdsbXN0dWRpbycsIGxhYmVsOiAnTE0gU3R1ZGlvJywgZ3JvdXA6ICdsb2NhbCcsIGtpbmQ6ICdsbXN0dWRpbycsIGRlZmF1bHRCYXNlVXJsOiAnaHR0cDovL2xvY2FsaG9zdDoxMjM0L3YxJywgYXV0b0NvbmZpZ3VyZTogdHJ1ZSB9LFxuXHR7IGlkOiAndmxsbScsIGxhYmVsOiAndkxMTScsIGdyb3VwOiAnbG9jYWwnLCBraW5kOiAncmVzcG9uc2VzJywgZGVmYXVsdEJhc2VVcmw6ICdodHRwOi8vbG9jYWxob3N0OjgwMDAvdjEnLCBhdXRvQ29uZmlndXJlOiBmYWxzZSB9LFxuXHR7IGlkOiAnbG9jYWxhaScsIGxhYmVsOiAnTG9jYWxBSScsIGdyb3VwOiAnbG9jYWwnLCBraW5kOiAncmVzcG9uc2VzJywgZGVmYXVsdEJhc2VVcmw6ICdodHRwOi8vbG9jYWxob3N0OjgwODAvdjEnLCBhdXRvQ29uZmlndXJlOiBmYWxzZSB9LFxuXHR7IGlkOiAnbGxhbWFjcHAnLCBsYWJlbDogJ2xsYW1hLmNwcCcsIGdyb3VwOiAnbG9jYWwnLCBraW5kOiAncmVzcG9uc2VzJywgZGVmYXVsdEJhc2VVcmw6ICdodHRwOi8vbG9jYWxob3N0OjgwODAvdjEnLCBhdXRvQ29uZmlndXJlOiBmYWxzZSB9LFxuXHR7IGlkOiAnZ3B0NGFsbCcsIGxhYmVsOiAnR1BUNEFsbCcsIGdyb3VwOiAnbG9jYWwnLCBraW5kOiAncmVzcG9uc2VzJywgZGVmYXVsdEJhc2VVcmw6ICdodHRwOi8vbG9jYWxob3N0OjQ4OTEvdjEnLCBhdXRvQ29uZmlndXJlOiBmYWxzZSB9LFxuXHR7IGlkOiAnb3BlbndlYnVpJywgbGFiZWw6ICdPcGVuIFdlYlVJJywgZ3JvdXA6ICdsb2NhbCcsIGtpbmQ6ICdyZXNwb25zZXMnLCBkZWZhdWx0QmFzZVVybDogJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMC92MScsIGF1dG9Db25maWd1cmU6IGZhbHNlIH0sXG5cdHsgaWQ6ICdqYW4nLCBsYWJlbDogJ0phbicsIGdyb3VwOiAnbG9jYWwnLCBraW5kOiAncmVzcG9uc2VzJywgZGVmYXVsdEJhc2VVcmw6ICdodHRwOi8vbG9jYWxob3N0OjEzMzcvdjEnLCBhdXRvQ29uZmlndXJlOiBmYWxzZSB9LFxuXHR7IGlkOiAnb29iYWJvb2dhJywgbGFiZWw6ICdPb2JhYm9vZ2EnLCBncm91cDogJ2xvY2FsJywga2luZDogJ3Jlc3BvbnNlcycsIGRlZmF1bHRCYXNlVXJsOiAnaHR0cDovL2xvY2FsaG9zdDo1MDAwL3YxJywgYXV0b0NvbmZpZ3VyZTogZmFsc2UgfSxcblx0eyBpZDogJ21seCcsIGxhYmVsOiAnTUxYJywgZ3JvdXA6ICdsb2NhbCcsIGtpbmQ6ICdyZXNwb25zZXMnLCBkZWZhdWx0QmFzZVVybDogJ2h0dHA6Ly9sb2NhbGhvc3Q6ODA4MC92MScsIGF1dG9Db25maWd1cmU6IGZhbHNlIH0sXG5cdHsgaWQ6ICd0Z2knLCBsYWJlbDogJ1RleHQgR2VuZXJhdGlvbiBJbmZlcmVuY2UnLCBncm91cDogJ2xvY2FsJywga2luZDogJ3Jlc3BvbnNlcycsIGRlZmF1bHRCYXNlVXJsOiAnaHR0cDovL2xvY2FsaG9zdDo4MDgwL3YxJywgYXV0b0NvbmZpZ3VyZTogZmFsc2UgfSxcbl07XG5cbmNvbnN0IFNUT1JFRF9BUElfS0VZX0VOVl9QUkVGSVggPSAnRk9SR0VfQ09ERVhfUFJPVklERVJfJztcbmNvbnN0IFNUT1JFRF9BUElfS0VZX0VOVl9TVUZGSVggPSAnX0FQSV9LRVknO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29kZXhNb2RlbENhdGFsb2dFbnRyeShjYXRhbG9nSWQ6IHN0cmluZyk6IElDb2RleE1vZGVsQ2F0YWxvZ0VudHJ5IHtcblx0cmV0dXJuIENPREVYX01PREVMX0NBVEFMT0cuZmluZChlbnRyeSA9PiBlbnRyeS5pZCA9PT0gY2F0YWxvZ0lkKVxuXHRcdD8/IENPREVYX01PREVMX0NBVEFMT0cuZmluZChlbnRyeSA9PiBlbnRyeS5pZCA9PT0gJ29wZW5haScpXG5cdFx0Pz8gQ09ERVhfTU9ERUxfQ0FUQUxPR1swXTtcbn1cblxuLyoqIFByb3ZpZGVycyBzaG93biBpbiB0aGUgbW9kZWwtY2FyZCBwaWNrZXIsIHNvcnRlZCBieSBkaXNwbGF5IG5hbWUuICovXG5leHBvcnQgZnVuY3Rpb24gbGlzdENvZGV4TW9kZWxDYXRhbG9nKCk6IHJlYWRvbmx5IElDb2RleE1vZGVsQ2F0YWxvZ0VudHJ5W10ge1xuXHRyZXR1cm4gWy4uLkNPREVYX01PREVMX0NBVEFMT0ddLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsLCAnZW4nLCB7IHNlbnNpdGl2aXR5OiAnYmFzZScsIG51bWVyaWM6IHRydWUgfSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNPbGxhbWFDYXRhbG9nKGNhdGFsb2dJZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBjYXRhbG9nSWQgPT09ICdvbGxhbWEnO1xufVxuXG4vKiogT25seSBPbGxhbWEgY2FuIGxpc3QgaW5zdGFsbGVkIG1vZGVsczsgb3RoZXIgbG9jYWwgc2VydmVycyByZXF1aXJlIGEgdHlwZWQgbmFtZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkaXNjb3ZlcnNDb2RleExvY2FsTW9kZWxzKGNhdGFsb2dJZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBpc09sbGFtYUNhdGFsb2coY2F0YWxvZ0lkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzTG9jYWxDYXRhbG9nKGNhdGFsb2dJZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBnZXRDb2RleE1vZGVsQ2F0YWxvZ0VudHJ5KGNhdGFsb2dJZCkuZ3JvdXAgPT09ICdsb2NhbCc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhbGxvY2F0ZUNvZGV4UHJvdmlkZXJJZChjYXRhbG9nSWQ6IHN0cmluZywgZXhpc3RpbmdJZHM6IHJlYWRvbmx5IHN0cmluZ1tdKTogc3RyaW5nIHtcblx0Y29uc3QgYmFzZSA9IChjYXRhbG9nSWQgfHwgJ3Byb3ZpZGVyJykucmVwbGFjZSgvW15BLVphLXowLTlfLV0vZywgJy0nKS5yZXBsYWNlKC9eLSt8LSskL2csICcnKSB8fCAncHJvdmlkZXInO1xuXHRpZiAoIWV4aXN0aW5nSWRzLmluY2x1ZGVzKGJhc2UpKSB7XG5cdFx0cmV0dXJuIGJhc2U7XG5cdH1cblx0bGV0IHN1ZmZpeCA9IDI7XG5cdHdoaWxlIChleGlzdGluZ0lkcy5pbmNsdWRlcyhgJHtiYXNlfS0ke3N1ZmZpeH1gKSkge1xuXHRcdHN1ZmZpeCsrO1xuXHR9XG5cdHJldHVybiBgJHtiYXNlfS0ke3N1ZmZpeH1gO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZW5hYmxlZENvZGV4UGlja2VyTW9kZWxzKGNvbmZpZzogSUNvZGV4TW9kZWxzQ29uZmlnKTogcmVhZG9ubHkgeyBwcm92aWRlcklkOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB9W10ge1xuXHRyZXR1cm4gY29uZmlnLnByb3ZpZGVyc1xuXHRcdC5maWx0ZXIocHJvdmlkZXIgPT4gcHJvdmlkZXIuZW5hYmxlZCAmJiBwcm92aWRlci5pZCAhPT0gJycpXG5cdFx0LmZsYXRNYXAocHJvdmlkZXIgPT4gcHJvdmlkZXIubW9kZWxzXG5cdFx0XHQuZmlsdGVyKG1vZGVsID0+IG1vZGVsLmVuYWJsZWQgJiYgbW9kZWwubmFtZS50cmltKCkgIT09ICcnKVxuXHRcdFx0Lm1hcChtb2RlbCA9PiAoeyBwcm92aWRlcklkOiBwcm92aWRlci5pZCwgbmFtZTogbW9kZWwubmFtZSB9KSkpO1xufVxuXG5mdW5jdGlvbiBpc1JvdXRhYmxlQ29kZXhQcm92aWRlcihwcm92aWRlcjogSUNvZGV4TW9kZWxQcm92aWRlckVudHJ5KTogYm9vbGVhbiB7XG5cdGlmICghcHJvdmlkZXIuZW5hYmxlZCB8fCBwcm92aWRlci5pZCA9PT0gJycpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Ly8gT2ZmaWNpYWwgY2FyZHMgd2l0aCBlbXB0eSBVUkwgc3RheSBvbiB0aGUgdmVuZG9yIHN1YnNjcmlwdGlvbiB1bnRpbCBCWU9LIGlzIGZpbGxlZC5cblx0aWYgKHByb3ZpZGVyLm9mZmljaWFsICYmIHByb3ZpZGVyLmJhc2VVcmwudHJpbSgpID09PSAnJykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdpdGhEZWZhdWx0Q29kZXhSb3V0aW5nKGNvbmZpZzogSUNvZGV4TW9kZWxzQ29uZmlnKTogSUNvZGV4TW9kZWxzQ29uZmlnIHtcblx0Y29uc3QgZW5hYmxlZCA9IGVuYWJsZWRDb2RleFBpY2tlck1vZGVscyhjb25maWcpLmZpbHRlcihtb2RlbCA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjb25maWcucHJvdmlkZXJzLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5pZCA9PT0gbW9kZWwucHJvdmlkZXJJZCk7XG5cdFx0cmV0dXJuICEhcHJvdmlkZXIgJiYgaXNSb3V0YWJsZUNvZGV4UHJvdmlkZXIocHJvdmlkZXIpO1xuXHR9KTtcblx0Y29uc3Qgc2VsZWN0ZWQgPSBjb25maWcucHJvdmlkZXJzLmZpbmQocHJvdmlkZXIgPT4gcHJvdmlkZXIuaWQgPT09IGNvbmZpZy5hY3RpdmVQcm92aWRlcklkICYmIGlzUm91dGFibGVDb2RleFByb3ZpZGVyKHByb3ZpZGVyKSlcblx0XHQ/PyBjb25maWcucHJvdmlkZXJzLmZpbmQocHJvdmlkZXIgPT4gaXNSb3V0YWJsZUNvZGV4UHJvdmlkZXIocHJvdmlkZXIpKTtcblx0Y29uc3Qgc2VsZWN0ZWRNb2RlbCA9IHNlbGVjdGVkPy5tb2RlbHMuZmluZChtb2RlbCA9PiBtb2RlbC5lbmFibGVkICYmIG1vZGVsLm5hbWUgPT09IHNlbGVjdGVkLnNlbGVjdGVkTW9kZWwpXG5cdFx0Pz8gc2VsZWN0ZWQ/Lm1vZGVscy5maW5kKG1vZGVsID0+IG1vZGVsLmVuYWJsZWQpO1xuXHRjb25zdCBmYWxsYmFjayA9IGVuYWJsZWRbMF07XG5cdHJldHVybiB7XG5cdFx0Li4uY29uZmlnLFxuXHRcdG1vZGVsOiBzZWxlY3RlZE1vZGVsPy5uYW1lIHx8IGZhbGxiYWNrPy5uYW1lIHx8IGNvbmZpZy5tb2RlbCxcblx0XHRtb2RlbFByb3ZpZGVyOiBzZWxlY3RlZD8uaWQgfHwgZmFsbGJhY2s/LnByb3ZpZGVySWQgfHwgY29uZmlnLm1vZGVsUHJvdmlkZXIsXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb2RleFByb3ZpZGVyU2VjcmV0U3RvcmFnZUtleShwcm92aWRlcklkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gYGZvcmdlLmNvZGV4Lm1vZGVsUHJvdmlkZXIuJHtlbmNvZGVVUklDb21wb25lbnQocHJvdmlkZXJJZCl9LmFwaUtleWA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb2RleFByb3ZpZGVyU2VjcmV0UmVzb3VyY2UocHJvdmlkZXJJZDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGBodHRwczovL2ZvcmdlLmxvY2FsL2NvZGV4L21vZGVsLXByb3ZpZGVyLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHByb3ZpZGVySWQpfWA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb2RleFByb3ZpZGVyU3RvcmVkQXBpS2V5RW52KHByb3ZpZGVySWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IG5vcm1hbGl6ZWQgPSBwcm92aWRlcklkLnRvVXBwZXJDYXNlKCkucmVwbGFjZSgvW15BLVowLTlfXS9nLCAnXycpO1xuXHRyZXR1cm4gYCR7U1RPUkVEX0FQSV9LRVlfRU5WX1BSRUZJWH0ke25vcm1hbGl6ZWR9JHtTVE9SRURfQVBJX0tFWV9FTlZfU1VGRklYfWA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0NvZGV4UHJvdmlkZXJTdG9yZWRBcGlLZXlFbnYoZW52S2V5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGVudktleS5zdGFydHNXaXRoKFNUT1JFRF9BUElfS0VZX0VOVl9QUkVGSVgpICYmIGVudktleS5lbmRzV2l0aChTVE9SRURfQVBJX0tFWV9FTlZfU1VGRklYKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlZmF1bHRDb2RleE1vZGVsUHJvdmlkZXJFbnRyeShjYXRhbG9nSWQgPSAnb3BlbmFpJyk6IElDb2RleE1vZGVsUHJvdmlkZXJFbnRyeSB7XG5cdGNvbnN0IGNhdGFsb2cgPSBnZXRDb2RleE1vZGVsQ2F0YWxvZ0VudHJ5KGNhdGFsb2dJZCk7XG5cdHJldHVybiB7XG5cdFx0aWQ6ICcnLFxuXHRcdGNhdGFsb2dJZDogY2F0YWxvZy5pZCxcblx0XHRuYW1lOiBjYXRhbG9nLmxhYmVsLFxuXHRcdGJhc2VVcmw6IGNhdGFsb2cuYXV0b0NvbmZpZ3VyZSA/IGNhdGFsb2cuZGVmYXVsdEJhc2VVcmwgOiAnJyxcblx0XHRlbnZLZXk6ICcnLFxuXHRcdGtpbmQ6IGNhdGFsb2cua2luZCxcblx0XHRhdXRoTW9kZTogY2F0YWxvZy5hdXRvQ29uZmlndXJlID8gJ25vbmUnIDogJ3N0b3JlZCcsXG5cdFx0d2lyZUFwaTogJ3Jlc3BvbnNlcycsXG5cdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRtb2RlbHM6IFtdLFxuXHRcdHNlbGVjdGVkTW9kZWw6ICcnLFxuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZW1wdHlDb2RleE1vZGVsc0NvbmZpZygpOiBJQ29kZXhNb2RlbHNDb25maWcge1xuXHRyZXR1cm4geyBtb2RlbDogJycsIG1vZGVsUHJvdmlkZXI6ICcnLCBwcm92aWRlcnM6IFtdIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0VtcHR5Q29kZXhNb2RlbHNDb25maWcodmFsdWU6IHVua25vd24pOiBib29sZWFuIHtcblx0Y29uc3QgY29uZmlnID0gbm9ybWFsaXplQ29kZXhNb2RlbHNDb25maWcodmFsdWUpO1xuXHRyZXR1cm4gY29uZmlnLm1vZGVsID09PSAnJyAmJiBjb25maWcubW9kZWxQcm92aWRlciA9PT0gJycgJiYgY29uZmlnLnByb3ZpZGVycy5sZW5ndGggPT09IDA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcmVmZXJDb2RleE1vZGVsc0NvbmZpZyguLi5jYW5kaWRhdGVzOiByZWFkb25seSB1bmtub3duW10pOiBJQ29kZXhNb2RlbHNDb25maWcgfCB1bmRlZmluZWQge1xuXHRmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVzKSB7XG5cdFx0aWYgKGNhbmRpZGF0ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgY29uZmlnID0gbm9ybWFsaXplQ29kZXhNb2RlbHNDb25maWcoY2FuZGlkYXRlKTtcblx0XHRpZiAoIWlzRW1wdHlDb2RleE1vZGVsc0NvbmZpZyhjb25maWcpKSB7XG5cdFx0XHRyZXR1cm4gY29uZmlnO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBpbmZlckNhdGFsb2dJZChpZDogc3RyaW5nLCBraW5kOiBDb2RleE1vZGVsUHJvdmlkZXJLaW5kKTogc3RyaW5nIHtcblx0aWYgKENPREVYX01PREVMX0NBVEFMT0cuc29tZShlbnRyeSA9PiBlbnRyeS5pZCA9PT0gaWQpKSB7XG5cdFx0cmV0dXJuIGlkO1xuXHR9XG5cdGlmIChraW5kID09PSAnb2xsYW1hJykge1xuXHRcdHJldHVybiAnb2xsYW1hJztcblx0fVxuXHRpZiAoa2luZCA9PT0gJ2xtc3R1ZGlvJykge1xuXHRcdHJldHVybiAnbG1zdHVkaW8nO1xuXHR9XG5cdGNvbnN0IG5vcm1hbGl6ZWQgPSBpZC50b0xvd2VyQ2FzZSgpO1xuXHRjb25zdCBtYXRjaCA9IENPREVYX01PREVMX0NBVEFMT0cuZmluZChlbnRyeSA9PiBub3JtYWxpemVkLmluY2x1ZGVzKGVudHJ5LmlkKSk7XG5cdHJldHVybiBtYXRjaD8uaWQgPz8gJ29wZW5haSc7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZVNhdmVkTW9kZWxzKHZhbHVlOiB1bmtub3duLCBzZWxlY3RlZE1vZGVsOiBzdHJpbmcpOiByZWFkb25seSBJQ29kZXhTYXZlZE1vZGVsW10ge1xuXHRjb25zdCBtb2RlbHM6IElDb2RleFNhdmVkTW9kZWxbXSA9IFtdO1xuXHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdGZvciAoY29uc3QgcmF3IG9mIHZhbHVlKSB7XG5cdFx0XHRpZiAodHlwZW9mIHJhdyA9PT0gJ3N0cmluZycgJiYgcmF3LnRyaW0oKSAhPT0gJycpIHtcblx0XHRcdFx0Y29uc3QgbmFtZSA9IHJhdy50cmltKCk7XG5cdFx0XHRcdGlmIChzZWVuLmhhcyhuYW1lKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNlZW4uYWRkKG5hbWUpO1xuXHRcdFx0XHRtb2RlbHMucHVzaCh7IG5hbWUsIGVuYWJsZWQ6IHRydWUgfSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFyYXcgfHwgdHlwZW9mIHJhdyAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheShyYXcpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZW50cnkgPSByYXcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0XHRjb25zdCBuYW1lID0gdHlwZW9mIGVudHJ5Lm5hbWUgPT09ICdzdHJpbmcnID8gZW50cnkubmFtZS50cmltKCkgOiAnJztcblx0XHRcdGlmIChuYW1lID09PSAnJyB8fCBzZWVuLmhhcyhuYW1lKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHNlZW4uYWRkKG5hbWUpO1xuXHRcdFx0bW9kZWxzLnB1c2goeyBuYW1lLCBlbmFibGVkOiBlbnRyeS5lbmFibGVkICE9PSBmYWxzZSB9KTtcblx0XHR9XG5cdH1cblx0aWYgKHNlbGVjdGVkTW9kZWwgJiYgIXNlZW4uaGFzKHNlbGVjdGVkTW9kZWwpKSB7XG5cdFx0bW9kZWxzLnB1c2goeyBuYW1lOiBzZWxlY3RlZE1vZGVsLCBlbmFibGVkOiB0cnVlIH0pO1xuXHR9XG5cdHJldHVybiBtb2RlbHM7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZVByb3ZpZGVyKHJhdzogdW5rbm93bik6IElDb2RleE1vZGVsUHJvdmlkZXJFbnRyeSB8IHVuZGVmaW5lZCB7XG5cdGlmICghcmF3IHx8IHR5cGVvZiByYXcgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkocmF3KSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgZW50cnkgPSByYXcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdGlmICh0eXBlb2YgZW50cnkuaWQgIT09ICdzdHJpbmcnIHx8IGVudHJ5LmlkLnRyaW0oKSA9PT0gJycpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGtpbmQ6IENvZGV4TW9kZWxQcm92aWRlcktpbmQgPSBlbnRyeS5raW5kID09PSAnb2xsYW1hJyB8fCBlbnRyeS5raW5kID09PSAnbG1zdHVkaW8nID8gZW50cnkua2luZCA6ICdyZXNwb25zZXMnO1xuXHRjb25zdCBlbnZLZXkgPSB0eXBlb2YgZW50cnkuZW52S2V5ID09PSAnc3RyaW5nJyA/IGVudHJ5LmVudktleSA6ICcnO1xuXHRjb25zdCBhdXRoTW9kZTogQ29kZXhNb2RlbFByb3ZpZGVyQXV0aE1vZGUgPSBlbnRyeS5hdXRoTW9kZSA9PT0gJ3N0b3JlZCcgfHwgaXNDb2RleFByb3ZpZGVyU3RvcmVkQXBpS2V5RW52KGVudktleSlcblx0XHQ/ICdzdG9yZWQnXG5cdFx0OiBlbnRyeS5hdXRoTW9kZSA9PT0gJ25vbmUnXG5cdFx0XHQ/ICdub25lJ1xuXHRcdFx0OiBlbnZLZXkgPT09ICcnID8gJ25vbmUnIDogJ2Vudmlyb25tZW50Jztcblx0Y29uc3QgY2F0YWxvZ0lkID0gdHlwZW9mIGVudHJ5LmNhdGFsb2dJZCA9PT0gJ3N0cmluZycgJiYgZW50cnkuY2F0YWxvZ0lkLnRyaW0oKSAhPT0gJydcblx0XHQ/IGVudHJ5LmNhdGFsb2dJZC50cmltKClcblx0XHQ6IGluZmVyQ2F0YWxvZ0lkKGVudHJ5LmlkLnRyaW0oKSwga2luZCk7XG5cdGNvbnN0IGNhdGFsb2cgPSBnZXRDb2RleE1vZGVsQ2F0YWxvZ0VudHJ5KGNhdGFsb2dJZCk7XG5cdGNvbnN0IHNlbGVjdGVkTW9kZWwgPSB0eXBlb2YgZW50cnkuc2VsZWN0ZWRNb2RlbCA9PT0gJ3N0cmluZycgPyBlbnRyeS5zZWxlY3RlZE1vZGVsLnRyaW0oKSA6ICcnO1xuXHRjb25zdCBvZmZpY2lhbCA9IGVudHJ5Lm9mZmljaWFsID09PSB0cnVlO1xuXHRjb25zdCBvZmZpY2lhbFNvdXJjZTogQ29kZXhPZmZpY2lhbE1vZGVsU291cmNlIHwgdW5kZWZpbmVkID0gZW50cnkub2ZmaWNpYWxTb3VyY2UgPT09ICdjb2RleCcgfHwgZW50cnkub2ZmaWNpYWxTb3VyY2UgPT09ICdncm9rJyB8fCBlbnRyeS5vZmZpY2lhbFNvdXJjZSA9PT0gJ2RlZXBzZWVrJ1xuXHRcdD8gZW50cnkub2ZmaWNpYWxTb3VyY2Vcblx0XHQ6IHVuZGVmaW5lZDtcblx0Y29uc3Qgb2ZmaWNpYWxNb2RlbHMgPSBBcnJheS5pc0FycmF5KGVudHJ5Lm9mZmljaWFsTW9kZWxzKVxuXHRcdD8gdW5pcXVlTm9uRW1wdHlTdHJpbmdzKGVudHJ5Lm9mZmljaWFsTW9kZWxzKVxuXHRcdDogW107XG5cdHJldHVybiB7XG5cdFx0aWQ6IGVudHJ5LmlkLnRyaW0oKSxcblx0XHRjYXRhbG9nSWQ6IGNhdGFsb2cuaWQsXG5cdFx0bmFtZTogdHlwZW9mIGVudHJ5Lm5hbWUgPT09ICdzdHJpbmcnICYmIGVudHJ5Lm5hbWUudHJpbSgpICE9PSAnJyA/IGVudHJ5Lm5hbWUgOiBjYXRhbG9nLmxhYmVsLFxuXHRcdGJhc2VVcmw6IHR5cGVvZiBlbnRyeS5iYXNlVXJsID09PSAnc3RyaW5nJyA/IGVudHJ5LmJhc2VVcmwgOiAnJyxcblx0XHRlbnZLZXksXG5cdFx0a2luZDogY2F0YWxvZy5raW5kLFxuXHRcdGF1dGhNb2RlOiBjYXRhbG9nLmF1dG9Db25maWd1cmUgPyAnbm9uZScgOiBhdXRoTW9kZSxcblx0XHR3aXJlQXBpOiAncmVzcG9uc2VzJyxcblx0XHRlbmFibGVkOiBlbnRyeS5lbmFibGVkICE9PSBmYWxzZSxcblx0XHRtb2RlbHM6IG5vcm1hbGl6ZVNhdmVkTW9kZWxzKGVudHJ5Lm1vZGVscywgc2VsZWN0ZWRNb2RlbCksXG5cdFx0c2VsZWN0ZWRNb2RlbCxcblx0XHQuLi4ob2ZmaWNpYWwgPyB7XG5cdFx0XHRvZmZpY2lhbDogdHJ1ZSxcblx0XHRcdG9mZmljaWFsU291cmNlLFxuXHRcdFx0b2ZmaWNpYWxNb2RlbHMsXG5cdFx0fSA6IHt9KSxcblx0fTtcbn1cblxuZnVuY3Rpb24gdW5pcXVlTm9uRW1wdHlTdHJpbmdzKHZhbHVlOiByZWFkb25seSB1bmtub3duW10pOiByZWFkb25seSBzdHJpbmdbXSB7XG5cdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGl0ZW0gb2YgdmFsdWUpIHtcblx0XHRpZiAodHlwZW9mIGl0ZW0gIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgbmFtZSA9IGl0ZW0udHJpbSgpO1xuXHRcdGlmIChuYW1lID09PSAnJyB8fCBzZWVuLmhhcyhuYW1lKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdHNlZW4uYWRkKG5hbWUpO1xuXHRcdHJlc3VsdC5wdXNoKG5hbWUpO1xuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogQ29lcmNlcyBhbiBhcmJpdHJhcnkgcm9vdC1jb25maWcgdmFsdWUgaW50byBhIHdlbGwtZm9ybWVkXG4gKiB7QGxpbmsgSUNvZGV4TW9kZWxzQ29uZmlnfS4gTWFsZm9ybWVkIG9yIG1pc3NpbmcgZmllbGRzIGFyZSBkcm9wcGVkIHNvIHRoZVxuICogc2V0dGluZ3MgVUkgYW5kIHRoZSB3cml0ZSBicmlkZ2UgbmV2ZXIgcHJvcGFnYXRlIGludmFsaWQgZGF0YS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZUNvZGV4TW9kZWxzQ29uZmlnKHZhbHVlOiB1bmtub3duKTogSUNvZGV4TW9kZWxzQ29uZmlnIHtcblx0aWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0cmV0dXJuIGVtcHR5Q29kZXhNb2RlbHNDb25maWcoKTtcblx0fVxuXHRjb25zdCByZWNvcmQgPSB2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0Y29uc3QgbW9kZWwgPSB0eXBlb2YgcmVjb3JkLm1vZGVsID09PSAnc3RyaW5nJyA/IHJlY29yZC5tb2RlbCA6ICcnO1xuXHRjb25zdCBtb2RlbFByb3ZpZGVyID0gdHlwZW9mIHJlY29yZC5tb2RlbFByb3ZpZGVyID09PSAnc3RyaW5nJyA/IHJlY29yZC5tb2RlbFByb3ZpZGVyIDogJyc7XG5cdGNvbnN0IHByb3ZpZGVycyA9IEFycmF5LmlzQXJyYXkocmVjb3JkLnByb3ZpZGVycylcblx0XHQ/IHJlY29yZC5wcm92aWRlcnMubWFwKG5vcm1hbGl6ZVByb3ZpZGVyKS5maWx0ZXIoKGVudHJ5KTogZW50cnkgaXMgSUNvZGV4TW9kZWxQcm92aWRlckVudHJ5ID0+ICEhZW50cnkpXG5cdFx0OiBbXTtcblx0Y29uc3QgYWN0aXZlUHJvdmlkZXJJZCA9IHR5cGVvZiByZWNvcmQuYWN0aXZlUHJvdmlkZXJJZCA9PT0gJ3N0cmluZycgJiYgcHJvdmlkZXJzLnNvbWUocHJvdmlkZXIgPT4gcHJvdmlkZXIuaWQgPT09IHJlY29yZC5hY3RpdmVQcm92aWRlcklkKVxuXHRcdD8gcmVjb3JkLmFjdGl2ZVByb3ZpZGVySWRcblx0XHQ6IHByb3ZpZGVyc1swXT8uaWQ7XG5cdHJldHVybiB7IG1vZGVsLCBtb2RlbFByb3ZpZGVyLCBwcm92aWRlcnMsIGFjdGl2ZVByb3ZpZGVySWQgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQXNCTyxNQUFNLHlCQUF5QjtBQUMvQixNQUFNLCtCQUErQjtBQXFEckMsTUFBTSxxQkFBcUI7QUFFM0IsTUFBTSx1QkFBdUI7QUFVN0IsTUFBTSxpQ0FBeUU7QUFBQSxFQUNyRixFQUFFLE1BQU0sYUFBYSxPQUFPLHdCQUF3QixnQkFBZ0IsSUFBSSxpQkFBaUIsVUFBVSxvQkFBb0IsS0FBSztBQUFBLEVBQzVILEVBQUUsTUFBTSxVQUFVLE9BQU8sVUFBVSxnQkFBZ0IsNkJB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
