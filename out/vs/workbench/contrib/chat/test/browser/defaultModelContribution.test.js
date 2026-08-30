import assert from "assert";
import { Emitter } from "../../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { createDefaultModelArrays, DefaultModelContribution } from "../../browser/defaultModelContribution.js";
import { UtilityModelContribution, UtilitySmallModelContribution } from "../../browser/utilityModelContribution.js";
class TestLanguageModelsService {
  constructor() {
    this._models = /* @__PURE__ */ new Map();
    this._vendors = [];
    this._modelCounter = 0;
    this._onDidChangeLanguageModels = new Emitter();
    this.onDidChangeLanguageModels = this._onDidChangeLanguageModels.event;
  }
  addVendor(vendor) {
    this._vendors.push(vendor);
  }
  addModel(metadata) {
    this._models.set(`${this._modelCounter++}:${metadata.vendor}/${metadata.id}`, metadata);
  }
  getLanguageModelIds() {
    return Array.from(this._models.keys());
  }
  lookupLanguageModel(id) {
    return this._models.get(id);
  }
  getVendors() {
    return this._vendors;
  }
  dispose() {
    this._onDidChangeLanguageModels.dispose();
  }
}
class TestContribution extends DefaultModelContribution {
  constructor(arrays, storageFormat, languageModelsService) {
    super(
      arrays,
      {
        configKey: "test.utilityModel",
        configSectionId: void 0,
        logPrefix: "[Test]",
        storageFormat
      },
      languageModelsService,
      new NullLogService()
    );
  }
}
function makeMetadata(overrides) {
  return {
    version: "1.0",
    family: "test",
    extension: new ExtensionIdentifier("test.ext"),
    isUserSelectable: true,
    maxInputTokens: 4096,
    maxOutputTokens: 1024,
    capabilities: { toolCalling: true },
    isDefaultForLocation: {},
    ...overrides
  };
}
suite("DefaultModelContribution", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function setup(opts) {
    const service = new TestLanguageModelsService();
    store.add({ dispose: () => service.dispose() });
    for (const v of opts?.vendors ?? []) {
      service.addVendor(v);
    }
    for (const m of opts?.models ?? []) {
      service.addModel(m);
    }
    const arrays = createDefaultModelArrays();
    const contribution = store.add(new TestContribution(arrays, opts?.storageFormat, service));
    return { arrays, contribution, service };
  }
  test("default state \u2014 no models registered yields only the empty/auto entry", () => {
    const { arrays } = setup();
    assert.deepStrictEqual(
      { ids: arrays.modelIds, labels: arrays.modelLabels },
      { ids: [""], labels: ["Auto (Vendor Default)"] }
    );
  });
  test("copilot vendor model \u2014 stored as vendor/id with vendor display name in the label", () => {
    const { arrays } = setup({
      storageFormat: "vendorAndId",
      vendors: [{ vendor: "copilot", displayName: "Copilot", isDefault: true, configuration: void 0, managementCommand: void 0, when: void 0 }],
      models: [makeMetadata({ id: "gpt-4o-mini", name: "GPT 4o mini", vendor: "copilot" })]
    });
    assert.deepStrictEqual(
      { ids: arrays.modelIds, labels: arrays.modelLabels },
      {
        ids: ["", "copilot/gpt-4o-mini"],
        labels: ["Auto (Vendor Default)", "GPT 4o mini (Copilot)"]
      }
    );
  });
  test("third-party (BYOK) vendor model \u2014 stored as vendor/id with provider display name", () => {
    const { arrays } = setup({
      storageFormat: "vendorAndId",
      vendors: [
        { vendor: "copilot", displayName: "Copilot", isDefault: true, configuration: void 0, managementCommand: void 0, when: void 0 },
        { vendor: "anthropic", displayName: "Anthropic", isDefault: false, configuration: void 0, managementCommand: void 0, when: void 0 }
      ],
      models: [
        makeMetadata({ id: "gpt-4o-mini", name: "GPT 4o mini", vendor: "copilot" }),
        // BYOK providers may omit `isUserSelectable` — must still be included.
        makeMetadata({ id: "claude-haiku-4.5", name: "Claude Haiku 4.5", vendor: "anthropic", isUserSelectable: void 0 }),
        // Internal alias models opt out via explicit false — must be excluded.
        makeMetadata({ id: "copilot-utility", name: "Utility", vendor: "copilot", isUserSelectable: false })
      ]
    });
    assert.deepStrictEqual(
      { ids: arrays.modelIds, labels: arrays.modelLabels },
      {
        ids: ["", "anthropic/claude-haiku-4.5", "copilot/gpt-4o-mini"],
        labels: ["Auto (Vendor Default)", "Claude Haiku 4.5 (Anthropic)", "GPT 4o mini (Copilot)"]
      }
    );
  });
  test("hidden vendor cache entries are excluded from the picker", () => {
    const { arrays } = setup({
      storageFormat: "vendorAndId",
      vendors: [{ vendor: "copilot", displayName: "Copilot", isDefault: true, configuration: void 0, managementCommand: void 0, when: void 0 }],
      models: [
        makeMetadata({ id: "gpt-4o-mini", name: "GPT 4o mini", vendor: "copilot" }),
        makeMetadata({ id: "hidden-model", name: "Hidden Model", vendor: "hidden-vendor" })
      ]
    });
    assert.deepStrictEqual(
      { ids: arrays.modelIds, labels: arrays.modelLabels },
      {
        ids: ["", "copilot/gpt-4o-mini"],
        labels: ["Auto (Vendor Default)", "GPT 4o mini (Copilot)"]
      }
    );
  });
  test("ambiguous vendor/id \u2014 duplicate keys (e.g. same id in two provider groups) are excluded from the picker", () => {
    const { arrays } = setup({
      storageFormat: "vendorAndId",
      vendors: [{ vendor: "anthropic", displayName: "Anthropic", isDefault: false, configuration: void 0, managementCommand: void 0, when: void 0 }],
      models: [
        // Two distinct configured groups for the same vendor expose
        // the same model id. The setting value would be ambiguous,
        // so neither must appear in the enum.
        makeMetadata({ id: "claude-haiku-4.5", name: "Claude Haiku 4.5", vendor: "anthropic" }),
        makeMetadata({ id: "claude-haiku-4.5", name: "Claude Haiku 4.5", vendor: "anthropic" }),
        // A non-conflicting model from the same vendor must remain.
        makeMetadata({ id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5", vendor: "anthropic" })
      ]
    });
    assert.deepStrictEqual(
      { ids: arrays.modelIds, labels: arrays.modelLabels },
      {
        ids: ["", "anthropic/claude-sonnet-4.5"],
        labels: ["Auto (Vendor Default)", "Claude Sonnet 4.5 (Anthropic)"]
      }
    );
  });
  test("utility model settings exclude Copilot vendor models", () => {
    const service = new TestLanguageModelsService();
    store.add({ dispose: () => service.dispose() });
    service.addVendor({ vendor: "copilot", displayName: "Copilot", isDefault: true, configuration: void 0, managementCommand: void 0, when: void 0 });
    service.addVendor({ vendor: "anthropic", displayName: "Anthropic", isDefault: false, configuration: void 0, managementCommand: void 0, when: void 0 });
    service.addModel(makeMetadata({ id: "gpt-4o-mini", name: "GPT 4o mini", vendor: "copilot" }));
    service.addModel(makeMetadata({ id: "claude-haiku-4.5", name: "Claude Haiku 4.5", vendor: "anthropic" }));
    store.add(new UtilityModelContribution(service, new NullLogService()));
    store.add(new UtilitySmallModelContribution(service, new NullLogService()));
    assert.deepStrictEqual({
      utility: { ids: UtilityModelContribution.modelIds, labels: UtilityModelContribution.modelLabels },
      utilitySmall: { ids: UtilitySmallModelContribution.modelIds, labels: UtilitySmallModelContribution.modelLabels }
    }, {
      utility: { ids: ["", "anthropic/claude-haiku-4.5"], labels: ["Default", "Claude Haiku 4.5 (Anthropic)"] },
      utilitySmall: { ids: ["", "anthropic/claude-haiku-4.5"], labels: ["Default", "Claude Haiku 4.5 (Anthropic)"] }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGRlZmF1bHRNb2RlbENvbnRyaWJ1dGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWZhdWx0TW9kZWxBcnJheXMsIERlZmF1bHRNb2RlbEFycmF5cywgRGVmYXVsdE1vZGVsQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9kZWZhdWx0TW9kZWxDb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgVXRpbGl0eU1vZGVsQ29udHJpYnV0aW9uLCBVdGlsaXR5U21hbGxNb2RlbENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdXRpbGl0eU1vZGVsQ29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLCBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGVzY3JpcHRvciwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5cbmNsYXNzIFRlc3RMYW5ndWFnZU1vZGVsc1NlcnZpY2UgaW1wbGVtZW50cyBQYXJ0aWFsPElMYW5ndWFnZU1vZGVsc1NlcnZpY2U+IHtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxzID0gbmV3IE1hcDxzdHJpbmcsIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF92ZW5kb3JzOiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGVzY3JpcHRvcltdID0gW107XG5cdHByaXZhdGUgX21vZGVsQ291bnRlciA9IDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscyA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscyA9IHRoaXMuX29uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMuZXZlbnQ7XG5cblx0YWRkVmVuZG9yKHZlbmRvcjogSUxhbmd1YWdlTW9kZWxQcm92aWRlckRlc2NyaXB0b3IpOiB2b2lkIHtcblx0XHR0aGlzLl92ZW5kb3JzLnB1c2godmVuZG9yKTtcblx0fVxuXG5cdGFkZE1vZGVsKG1ldGFkYXRhOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSk6IHZvaWQge1xuXHRcdC8vIFVzZSBhbiBpbnRlcm5hbCB1bmlxdWUga2V5IHNvIGNhbGxlcnMgY2FuIHJlZ2lzdGVyIG11bHRpcGxlIG1vZGVsc1xuXHRcdC8vIHRoYXQgc2hhcmUgdGhlIHNhbWUgYCR7dmVuZG9yfS8ke2lkfWAgKGRpZmZlcmVudCBwcm92aWRlciBncm91cHMpLlxuXHRcdHRoaXMuX21vZGVscy5zZXQoYCR7dGhpcy5fbW9kZWxDb3VudGVyKyt9OiR7bWV0YWRhdGEudmVuZG9yfS8ke21ldGFkYXRhLmlkfWAsIG1ldGFkYXRhKTtcblx0fVxuXG5cdGdldExhbmd1YWdlTW9kZWxJZHMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMuX21vZGVscy5rZXlzKCkpO1xuXHR9XG5cblx0bG9va3VwTGFuZ3VhZ2VNb2RlbChpZDogc3RyaW5nKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbHMuZ2V0KGlkKTtcblx0fVxuXG5cdGdldFZlbmRvcnMoKTogSUxhbmd1YWdlTW9kZWxQcm92aWRlckRlc2NyaXB0b3JbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZlbmRvcnM7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RDb250cmlidXRpb24gZXh0ZW5kcyBEZWZhdWx0TW9kZWxDb250cmlidXRpb24ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRhcnJheXM6IERlZmF1bHRNb2RlbEFycmF5cyxcblx0XHRzdG9yYWdlRm9ybWF0OiAncXVhbGlmaWVkTmFtZScgfCAndmVuZG9yQW5kSWQnIHwgdW5kZWZpbmVkLFxuXHRcdGxhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoXG5cdFx0XHRhcnJheXMsXG5cdFx0XHR7XG5cdFx0XHRcdGNvbmZpZ0tleTogJ3Rlc3QudXRpbGl0eU1vZGVsJyxcblx0XHRcdFx0Y29uZmlnU2VjdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdGxvZ1ByZWZpeDogJ1tUZXN0XScsXG5cdFx0XHRcdHN0b3JhZ2VGb3JtYXQsXG5cdFx0XHR9LFxuXHRcdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KTtcblx0fVxufVxuXG5mdW5jdGlvbiBtYWtlTWV0YWRhdGEob3ZlcnJpZGVzOiBQYXJ0aWFsPElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhPiAmIFBpY2s8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsICdpZCcgfCAnbmFtZScgfCAndmVuZG9yJz4pOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSB7XG5cdHJldHVybiB7XG5cdFx0dmVyc2lvbjogJzEuMCcsXG5cdFx0ZmFtaWx5OiAndGVzdCcsXG5cdFx0ZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdC5leHQnKSxcblx0XHRpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLFxuXHRcdG1heElucHV0VG9rZW5zOiA0MDk2LFxuXHRcdG1heE91dHB1dFRva2VuczogMTAyNCxcblx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IHRydWUgfSxcblx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30sXG5cdFx0Li4ub3ZlcnJpZGVzLFxuXHR9IHNhdGlzZmllcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YTtcbn1cblxuc3VpdGUoJ0RlZmF1bHRNb2RlbENvbnRyaWJ1dGlvbicsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBzZXR1cChvcHRzPzogeyBtb2RlbHM/OiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YVtdOyB2ZW5kb3JzPzogSUxhbmd1YWdlTW9kZWxQcm92aWRlckRlc2NyaXB0b3JbXTsgc3RvcmFnZUZvcm1hdD86ICdxdWFsaWZpZWROYW1lJyB8ICd2ZW5kb3JBbmRJZCcgfSkge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdExhbmd1YWdlTW9kZWxzU2VydmljZSgpO1xuXHRcdHN0b3JlLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHNlcnZpY2UuZGlzcG9zZSgpIH0pO1xuXG5cdFx0Zm9yIChjb25zdCB2IG9mIG9wdHM/LnZlbmRvcnMgPz8gW10pIHtcblx0XHRcdHNlcnZpY2UuYWRkVmVuZG9yKHYpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IG0gb2Ygb3B0cz8ubW9kZWxzID8/IFtdKSB7XG5cdFx0XHRzZXJ2aWNlLmFkZE1vZGVsKG0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFycmF5cyA9IGNyZWF0ZURlZmF1bHRNb2RlbEFycmF5cygpO1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IHN0b3JlLmFkZChuZXcgVGVzdENvbnRyaWJ1dGlvbihhcnJheXMsIG9wdHM/LnN0b3JhZ2VGb3JtYXQsIHNlcnZpY2UgYXMgdW5rbm93biBhcyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKSk7XG5cdFx0cmV0dXJuIHsgYXJyYXlzLCBjb250cmlidXRpb24sIHNlcnZpY2UgfTtcblx0fVxuXG5cdHRlc3QoJ2RlZmF1bHQgc3RhdGUgXHUyMDE0IG5vIG1vZGVscyByZWdpc3RlcmVkIHlpZWxkcyBvbmx5IHRoZSBlbXB0eS9hdXRvIGVudHJ5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYXJyYXlzIH0gPSBzZXR1cCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgaWRzOiBhcnJheXMubW9kZWxJZHMsIGxhYmVsczogYXJyYXlzLm1vZGVsTGFiZWxzIH0sXG5cdFx0XHR7IGlkczogWycnXSwgbGFiZWxzOiBbJ0F1dG8gKFZlbmRvciBEZWZhdWx0KSddIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY29waWxvdCB2ZW5kb3IgbW9kZWwgXHUyMDE0IHN0b3JlZCBhcyB2ZW5kb3IvaWQgd2l0aCB2ZW5kb3IgZGlzcGxheSBuYW1lIGluIHRoZSBsYWJlbCcsICgpID0+IHtcblx0XHRjb25zdCB7IGFycmF5cyB9ID0gc2V0dXAoe1xuXHRcdFx0c3RvcmFnZUZvcm1hdDogJ3ZlbmRvckFuZElkJyxcblx0XHRcdHZlbmRvcnM6IFt7IHZlbmRvcjogJ2NvcGlsb3QnLCBkaXNwbGF5TmFtZTogJ0NvcGlsb3QnLCBpc0RlZmF1bHQ6IHRydWUsIGNvbmZpZ3VyYXRpb246IHVuZGVmaW5lZCwgbWFuYWdlbWVudENvbW1hbmQ6IHVuZGVmaW5lZCwgd2hlbjogdW5kZWZpbmVkIH1dLFxuXHRcdFx0bW9kZWxzOiBbbWFrZU1ldGFkYXRhKHsgaWQ6ICdncHQtNG8tbWluaScsIG5hbWU6ICdHUFQgNG8gbWluaScsIHZlbmRvcjogJ2NvcGlsb3QnIH0pXSxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBpZHM6IGFycmF5cy5tb2RlbElkcywgbGFiZWxzOiBhcnJheXMubW9kZWxMYWJlbHMgfSxcblx0XHRcdHtcblx0XHRcdFx0aWRzOiBbJycsICdjb3BpbG90L2dwdC00by1taW5pJ10sXG5cdFx0XHRcdGxhYmVsczogWydBdXRvIChWZW5kb3IgRGVmYXVsdCknLCAnR1BUIDRvIG1pbmkgKENvcGlsb3QpJ10sXG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RoaXJkLXBhcnR5IChCWU9LKSB2ZW5kb3IgbW9kZWwgXHUyMDE0IHN0b3JlZCBhcyB2ZW5kb3IvaWQgd2l0aCBwcm92aWRlciBkaXNwbGF5IG5hbWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhcnJheXMgfSA9IHNldHVwKHtcblx0XHRcdHN0b3JhZ2VGb3JtYXQ6ICd2ZW5kb3JBbmRJZCcsXG5cdFx0XHR2ZW5kb3JzOiBbXG5cdFx0XHRcdHsgdmVuZG9yOiAnY29waWxvdCcsIGRpc3BsYXlOYW1lOiAnQ29waWxvdCcsIGlzRGVmYXVsdDogdHJ1ZSwgY29uZmlndXJhdGlvbjogdW5kZWZpbmVkLCBtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLCB3aGVuOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0eyB2ZW5kb3I6ICdhbnRocm9waWMnLCBkaXNwbGF5TmFtZTogJ0FudGhyb3BpYycsIGlzRGVmYXVsdDogZmFsc2UsIGNvbmZpZ3VyYXRpb246IHVuZGVmaW5lZCwgbWFuYWdlbWVudENvbW1hbmQ6IHVuZGVmaW5lZCwgd2hlbjogdW5kZWZpbmVkIH0sXG5cdFx0XHRdLFxuXHRcdFx0bW9kZWxzOiBbXG5cdFx0XHRcdG1ha2VNZXRhZGF0YSh7IGlkOiAnZ3B0LTRvLW1pbmknLCBuYW1lOiAnR1BUIDRvIG1pbmknLCB2ZW5kb3I6ICdjb3BpbG90JyB9KSxcblx0XHRcdFx0Ly8gQllPSyBwcm92aWRlcnMgbWF5IG9taXQgYGlzVXNlclNlbGVjdGFibGVgIFx1MjAxNCBtdXN0IHN0aWxsIGJlIGluY2x1ZGVkLlxuXHRcdFx0XHRtYWtlTWV0YWRhdGEoeyBpZDogJ2NsYXVkZS1oYWlrdS00LjUnLCBuYW1lOiAnQ2xhdWRlIEhhaWt1IDQuNScsIHZlbmRvcjogJ2FudGhyb3BpYycsIGlzVXNlclNlbGVjdGFibGU6IHVuZGVmaW5lZCB9KSxcblx0XHRcdFx0Ly8gSW50ZXJuYWwgYWxpYXMgbW9kZWxzIG9wdCBvdXQgdmlhIGV4cGxpY2l0IGZhbHNlIFx1MjAxNCBtdXN0IGJlIGV4Y2x1ZGVkLlxuXHRcdFx0XHRtYWtlTWV0YWRhdGEoeyBpZDogJ2NvcGlsb3QtdXRpbGl0eScsIG5hbWU6ICdVdGlsaXR5JywgdmVuZG9yOiAnY29waWxvdCcsIGlzVXNlclNlbGVjdGFibGU6IGZhbHNlIH0pLFxuXHRcdFx0XSxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBpZHM6IGFycmF5cy5tb2RlbElkcywgbGFiZWxzOiBhcnJheXMubW9kZWxMYWJlbHMgfSxcblx0XHRcdHtcblx0XHRcdFx0aWRzOiBbJycsICdhbnRocm9waWMvY2xhdWRlLWhhaWt1LTQuNScsICdjb3BpbG90L2dwdC00by1taW5pJ10sXG5cdFx0XHRcdGxhYmVsczogWydBdXRvIChWZW5kb3IgRGVmYXVsdCknLCAnQ2xhdWRlIEhhaWt1IDQuNSAoQW50aHJvcGljKScsICdHUFQgNG8gbWluaSAoQ29waWxvdCknXSxcblx0XHRcdH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaGlkZGVuIHZlbmRvciBjYWNoZSBlbnRyaWVzIGFyZSBleGNsdWRlZCBmcm9tIHRoZSBwaWNrZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhcnJheXMgfSA9IHNldHVwKHtcblx0XHRcdHN0b3JhZ2VGb3JtYXQ6ICd2ZW5kb3JBbmRJZCcsXG5cdFx0XHR2ZW5kb3JzOiBbeyB2ZW5kb3I6ICdjb3BpbG90JywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgaXNEZWZhdWx0OiB0cnVlLCBjb25maWd1cmF0aW9uOiB1bmRlZmluZWQsIG1hbmFnZW1lbnRDb21tYW5kOiB1bmRlZmluZWQsIHdoZW46IHVuZGVmaW5lZCB9XSxcblx0XHRcdG1vZGVsczogW1xuXHRcdFx0XHRtYWtlTWV0YWRhdGEoeyBpZDogJ2dwdC00by1taW5pJywgbmFtZTogJ0dQVCA0byBtaW5pJywgdmVuZG9yOiAnY29waWxvdCcgfSksXG5cdFx0XHRcdG1ha2VNZXRhZGF0YSh7IGlkOiAnaGlkZGVuLW1vZGVsJywgbmFtZTogJ0hpZGRlbiBNb2RlbCcsIHZlbmRvcjogJ2hpZGRlbi12ZW5kb3InIH0pLFxuXHRcdFx0XSxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBpZHM6IGFycmF5cy5tb2RlbElkcywgbGFiZWxzOiBhcnJheXMubW9kZWxMYWJlbHMgfSxcblx0XHRcdHtcblx0XHRcdFx0aWRzOiBbJycsICdjb3BpbG90L2dwdC00by1taW5pJ10sXG5cdFx0XHRcdGxhYmVsczogWydBdXRvIChWZW5kb3IgRGVmYXVsdCknLCAnR1BUIDRvIG1pbmkgKENvcGlsb3QpJ10sXG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FtYmlndW91cyB2ZW5kb3IvaWQgXHUyMDE0IGR1cGxpY2F0ZSBrZXlzIChlLmcuIHNhbWUgaWQgaW4gdHdvIHByb3ZpZGVyIGdyb3VwcykgYXJlIGV4Y2x1ZGVkIGZyb20gdGhlIHBpY2tlcicsICgpID0+IHtcblx0XHRjb25zdCB7IGFycmF5cyB9ID0gc2V0dXAoe1xuXHRcdFx0c3RvcmFnZUZvcm1hdDogJ3ZlbmRvckFuZElkJyxcblx0XHRcdHZlbmRvcnM6IFt7IHZlbmRvcjogJ2FudGhyb3BpYycsIGRpc3BsYXlOYW1lOiAnQW50aHJvcGljJywgaXNEZWZhdWx0OiBmYWxzZSwgY29uZmlndXJhdGlvbjogdW5kZWZpbmVkLCBtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLCB3aGVuOiB1bmRlZmluZWQgfV0sXG5cdFx0XHRtb2RlbHM6IFtcblx0XHRcdFx0Ly8gVHdvIGRpc3RpbmN0IGNvbmZpZ3VyZWQgZ3JvdXBzIGZvciB0aGUgc2FtZSB2ZW5kb3IgZXhwb3NlXG5cdFx0XHRcdC8vIHRoZSBzYW1lIG1vZGVsIGlkLiBUaGUgc2V0dGluZyB2YWx1ZSB3b3VsZCBiZSBhbWJpZ3VvdXMsXG5cdFx0XHRcdC8vIHNvIG5laXRoZXIgbXVzdCBhcHBlYXIgaW4gdGhlIGVudW0uXG5cdFx0XHRcdG1ha2VNZXRhZGF0YSh7IGlkOiAnY2xhdWRlLWhhaWt1LTQuNScsIG5hbWU6ICdDbGF1ZGUgSGFpa3UgNC41JywgdmVuZG9yOiAnYW50aHJvcGljJyB9KSxcblx0XHRcdFx0bWFrZU1ldGFkYXRhKHsgaWQ6ICdjbGF1ZGUtaGFpa3UtNC41JywgbmFtZTogJ0NsYXVkZSBIYWlrdSA0LjUnLCB2ZW5kb3I6ICdhbnRocm9waWMnIH0pLFxuXHRcdFx0XHQvLyBBIG5vbi1jb25mbGljdGluZyBtb2RlbCBmcm9tIHRoZSBzYW1lIHZlbmRvciBtdXN0IHJlbWFpbi5cblx0XHRcdFx0bWFrZU1ldGFkYXRhKHsgaWQ6ICdjbGF1ZGUtc29ubmV0LTQuNScsIG5hbWU6ICdDbGF1ZGUgU29ubmV0IDQuNScsIHZlbmRvcjogJ2FudGhyb3BpYycgfSksXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IGlkczogYXJyYXlzLm1vZGVsSWRzLCBsYWJlbHM6IGFycmF5cy5tb2RlbExhYmVscyB9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZHM6IFsnJywgJ2FudGhyb3BpYy9jbGF1ZGUtc29ubmV0LTQuNSddLFxuXHRcdFx0XHRsYWJlbHM6IFsnQXV0byAoVmVuZG9yIERlZmF1bHQpJywgJ0NsYXVkZSBTb25uZXQgNC41IChBbnRocm9waWMpJ10sXG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3V0aWxpdHkgbW9kZWwgc2V0dGluZ3MgZXhjbHVkZSBDb3BpbG90IHZlbmRvciBtb2RlbHMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0TGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKCk7XG5cdFx0c3RvcmUuYWRkKHsgZGlzcG9zZTogKCkgPT4gc2VydmljZS5kaXNwb3NlKCkgfSk7XG5cdFx0c2VydmljZS5hZGRWZW5kb3IoeyB2ZW5kb3I6ICdjb3BpbG90JywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgaXNEZWZhdWx0OiB0cnVlLCBjb25maWd1cmF0aW9uOiB1bmRlZmluZWQsIG1hbmFnZW1lbnRDb21tYW5kOiB1bmRlZmluZWQsIHdoZW46IHVuZGVmaW5lZCB9KTtcblx0XHRzZXJ2aWNlLmFkZFZlbmRvcih7IHZlbmRvcjogJ2FudGhyb3BpYycsIGRpc3BsYXlOYW1lOiAnQW50aHJvcGljJywgaXNEZWZhdWx0OiBmYWxzZSwgY29uZmlndXJhdGlvbjogdW5kZWZpbmVkLCBtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLCB3aGVuOiB1bmRlZmluZWQgfSk7XG5cdFx0c2VydmljZS5hZGRNb2RlbChtYWtlTWV0YWRhdGEoeyBpZDogJ2dwdC00by1taW5pJywgbmFtZTogJ0dQVCA0byBtaW5pJywgdmVuZG9yOiAnY29waWxvdCcgfSkpO1xuXHRcdHNlcnZpY2UuYWRkTW9kZWwobWFrZU1ldGFkYXRhKHsgaWQ6ICdjbGF1ZGUtaGFpa3UtNC41JywgbmFtZTogJ0NsYXVkZSBIYWlrdSA0LjUnLCB2ZW5kb3I6ICdhbnRocm9waWMnIH0pKTtcblxuXHRcdHN0b3JlLmFkZChuZXcgVXRpbGl0eU1vZGVsQ29udHJpYnV0aW9uKHNlcnZpY2UgYXMgdW5rbm93biBhcyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdHN0b3JlLmFkZChuZXcgVXRpbGl0eVNtYWxsTW9kZWxDb250cmlidXRpb24oc2VydmljZSBhcyB1bmtub3duIGFzIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHV0aWxpdHk6IHsgaWRzOiBVdGlsaXR5TW9kZWxDb250cmlidXRpb24ubW9kZWxJZHMsIGxhYmVsczogVXRpbGl0eU1vZGVsQ29udHJpYnV0aW9uLm1vZGVsTGFiZWxzIH0sXG5cdFx0XHR1dGlsaXR5U21hbGw6IHsgaWRzOiBVdGlsaXR5U21hbGxNb2RlbENvbnRyaWJ1dGlvbi5tb2RlbElkcywgbGFiZWxzOiBVdGlsaXR5U21hbGxNb2RlbENvbnRyaWJ1dGlvbi5tb2RlbExhYmVscyB9LFxuXHRcdH0sIHtcblx0XHRcdHV0aWxpdHk6IHsgaWRzOiBbJycsICdhbnRocm9waWMvY2xhdWRlLWhhaWt1LTQuNSddLCBsYWJlbHM6IFsnRGVmYXVsdCcsICdDbGF1ZGUgSGFpa3UgNC41IChBbnRocm9waWMpJ10gfSxcblx0XHRcdHV0aWxpdHlTbWFsbDogeyBpZHM6IFsnJywgJ2FudGhyb3BpYy9jbGF1ZGUtaGFpa3UtNC41J10sIGxhYmVsczogWydEZWZhdWx0JywgJ0NsYXVkZSBIYWlrdSA0LjUgKEFudGhyb3BpYyknXSB9LFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDBCQUE4QyxnQ0FBZ0M7QUFDdkYsU0FBUywwQkFBMEIscUNBQXFDO0FBR3hFLE1BQU0sMEJBQXFFO0FBQUEsRUFBM0U7QUFDQyxTQUFpQixVQUFVLG9CQUFJLElBQXdDO0FBQ3ZFLFNBQWlCLFdBQStDLENBQUM7QUFDakUsU0FBUSxnQkFBZ0I7QUFFeEIsU0FBaUIsNkJBQTZCLElBQUksUUFBZ0I7QUFDbEUsU0FBUyw0QkFBNEIsS0FBSywyQkFBMkI7QUFBQTtBQUFBLEVBRXJFLFVBQVUsUUFBZ0Q7QUFDekQsU0FBSyxTQUFTLEtBQUssTUFBTTtBQUFBLEVBQzFCO0FBQUEsRUFFQSxTQUFTLFVBQTRDO0FBR3BELFNBQUssUUFBUSxJQUFJLEdBQUcsS0FBSyxlQUFlLElBQUksU0FBUyxNQUFNLElBQUksU0FBUyxFQUFFLElBQUksUUFBUTtBQUFBLEVBQ3ZGO0FBQUEsRUFFQSxzQkFBZ0M7QUFDL0IsV0FBTyxNQUFNLEtBQUssS0FBSyxRQUFRLEtBQUssQ0FBQztBQUFBLEVBQ3RDO0FBQUEsRUFFQSxvQkFBb0IsSUFBb0Q7QUFDdkUsV0FBTyxLQUFLLFFBQVEsSUFBSSxFQUFFO0FBQUEsRUFDM0I7QUFBQSxFQUVBLGFBQWlEO0FBQ2hELFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLFVBQWdCO0FBQ2YsU0FBSywyQkFBMkIsUUFBUTtBQUFBLEVBQ3pDO0FBQ0Q7QUFFQSxNQUFNLHlCQUF5Qix5QkFBeUI7QUFBQSxFQUN2RCxZQUNDLFFBQ0EsZUFDQSx1QkFDQztBQUNEO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxRQUNDLFdBQVc7QUFBQSxRQUNYLGlCQUFpQjtB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
