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
import { getCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { EditorAction, registerEditorAction } from "../../../../editor/browser/editorExtensions.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import * as nls from "../../../../nls.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { formatDocumentRangesWithProvider, formatDocumentWithProvider, getRealAndSyntheticDocumentFormattersOrdered, FormattingConflicts, FormattingMode, FormattingKind } from "../../../../editor/contrib/format/browser/format.js";
import { Range } from "../../../../editor/common/core/range.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { IExtensionService, toExtension } from "../../../services/extensions/common/extensions.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { INotificationService, NotificationPriority, Severity } from "../../../../platform/notification/common/notification.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IWorkbenchExtensionEnablementService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { editorConfigurationBaseNode } from "../../../../editor/common/config/editorConfigurationSchema.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { ILanguageStatusService } from "../../../services/languageStatus/common/languageStatusService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { generateUuid } from "../../../../base/common/uuid.js";
let DefaultFormatter = class extends Disposable {
  constructor(_extensionService, _extensionEnablementService, _configService, _notificationService, _dialogService, _quickInputService, _languageService, _languageFeaturesService, _languageStatusService, _editorService) {
    super();
    this._extensionService = _extensionService;
    this._extensionEnablementService = _extensionEnablementService;
    this._configService = _configService;
    this._notificationService = _notificationService;
    this._dialogService = _dialogService;
    this._quickInputService = _quickInputService;
    this._languageService = _languageService;
    this._languageFeaturesService = _languageFeaturesService;
    this._languageStatusService = _languageStatusService;
    this._editorService = _editorService;
    this._languageStatusStore = this._store.add(new DisposableStore());
    this._store.add(this._extensionService.onDidChangeExtensions(this._updateConfigValues, this));
    this._store.add(FormattingConflicts.setFormatterSelector((formatter, document, mode, kind) => this._selectFormatter(formatter, document, mode, kind)));
    this._store.add(_editorService.onDidActiveEditorChange(this._updateStatus, this));
    this._store.add(_languageFeaturesService.documentFormattingEditProvider.onDidChange(this._updateStatus, this));
    this._store.add(_languageFeaturesService.documentRangeFormattingEditProvider.onDidChange(this._updateStatus, this));
    this._store.add(_languageFeaturesService.documentFormattingEditProvider.onDidChange(this._updateConfigValues, this));
    this._store.add(_languageFeaturesService.documentRangeFormattingEditProvider.onDidChange(this._updateConfigValues, this));
    this._store.add(_configService.onDidChangeConfiguration((e) => e.affectsConfiguration(DefaultFormatter.configName) && this._updateStatus()));
    this._updateConfigValues();
  }
  async _updateConfigValues() {
    await this._extensionService.whenInstalledExtensionsRegistered();
    let extensions = [...this._extensionService.extensions];
    const documentFormatters = this._languageFeaturesService.documentFormattingEditProvider.allNoModel();
    const rangeFormatters = this._languageFeaturesService.documentRangeFormattingEditProvider.allNoModel();
    const formatterExtensionIds = /* @__PURE__ */ new Set();
    for (const formatter of documentFormatters) {
      if (formatter.extensionId) {
        formatterExtensionIds.add(ExtensionIdentifier.toKey(formatter.extensionId));
      }
    }
    for (const formatter of rangeFormatters) {
      if (formatter.extensionId) {
        formatterExtensionIds.add(ExtensionIdentifier.toKey(formatter.extensionId));
      }
    }
    extensions = extensions.sort((a, b) => {
      const contributesFormatterA = formatterExtensionIds.has(ExtensionIdentifier.toKey(a.identifier));
      const contributesFormatterB = formatterExtensionIds.has(ExtensionIdentifier.toKey(b.identifier));
      if (contributesFormatterA && !contributesFormatterB) {
        return -1;
      } else if (!contributesFormatterA && contributesFormatterB) {
        return 1;
      }
      const boostA = a.categories?.find((cat) => cat === "Formatters" || cat === "Programming Languages");
      const boostB = b.categories?.find((cat) => cat === "Formatters" || cat === "Programming Languages");
      if (boostA && !boostB) {
        return -1;
      } else if (!boostA && boostB) {
        return 1;
      } else {
        return a.name.localeCompare(b.name);
      }
    });
    DefaultFormatter.extensionIds.length = 0;
    DefaultFormatter.extensionItemLabels.length = 0;
    DefaultFormatter.extensionDescriptions.length = 0;
    DefaultFormatter.extensionIds.push(null);
    DefaultFormatter.extensionItemLabels.push(nls.localize("null", "None"));
    DefaultFormatter.extensionDescriptions.push(nls.localize("nullFormatterDescription", "None"));
    for (const extension of extensions) {
      if (extension.main || extension.browser) {
        DefaultFormatter.extensionIds.push(extension.identifier.value);
        DefaultFormatter.extensionItemLabels.push(extension.displayName ?? "");
        DefaultFormatter.extensionDescriptions.push(extension.description ?? "");
      }
    }
  }
  static _maybeQuotes(s) {
    return s.match(/\s/) ? `'${s}'` : s;
  }
  async _analyzeFormatter(kind, formatter, document) {
    const defaultFormatterId = this._configService.getValue(DefaultFormatter.configName, {
      resource: document.uri,
      overrideIdentifier: document.getLanguageId()
    });
    if (defaultFormatterId) {
      const defaultFormatter = formatter.find((formatter2) => ExtensionIdentifier.equals(formatter2.extensionId, defaultFormatterId));
      if (defaultFormatter) {
        return defaultFormatter;
      }
      const extension = await this._extensionService.getExtension(defaultFormatterId);
      if (extension && this._extensionEnablementService.isEnabled(toExtension(extension))) {
        const langName2 = this._languageService.getLanguageName(document.getLanguageId()) || document.getLanguageId();
        const detail = kind === FormattingKind.File ? nls.localize("miss.1", "Extension '{0}' is configured as formatter but it cannot format '{1}'-files", extension.displayName || extension.name, langName2) : nls.localize("miss.2", "Extension '{0}' is configured as formatter but it can only format '{1}'-files as a whole, not selections or parts of it.", extension.displayName || extension.name, langName2);
        return detail;
      }
    } else if (formatter.length === 1) {
      return formatter[0];
    }
    const langName = this._languageService.getLanguageName(document.getLanguageId()) || document.getLanguageId();
    const message = !defaultFormatterId ? nls.localize("config.needed", "There are multiple formatters for '{0}' files. One of them should be configured as default formatter.", DefaultFormatter._maybeQuotes(langName)) : nls.localize("config.bad", "Extension '{0}' is configured as formatter but not available. Select a different default formatter to continue.", defaultFormatterId);
    return message;
  }
  async _selectFormatter(formatter, document, mode, kind) {
    const formatterOrMessage = await this._analyzeFormatter(kind, formatter, document);
    if (typeof formatterOrMessage !== "string") {
      return formatterOrMessage;
    }
    if (mode !== FormattingMode.Silent) {
      const { confirmed } = await this._dialogService.confirm({
        message: nls.localize("miss", "Configure Default Formatter"),
        detail: formatterOrMessage,
        primaryButton: nls.localize({ key: "do.config", comment: ["&& denotes a mnemonic"] }, "&&Configure...")
      });
      if (confirmed) {
        return this._pickAndPersistDefaultFormatter(formatter, document);
      }
    } else {
      this._notificationService.prompt(
        Severity.Info,
        formatterOrMessage,
        [{ label: nls.localize("do.config.notification", "Configure..."), run: () => this._pickAndPersistDefaultFormatter(formatter, document) }],
        { priority: NotificationPriority.SILENT }
      );
    }
    return void 0;
  }
  async _pickAndPersistDefaultFormatter(formatter, document) {
    const picks = formatter.map((formatter2, index) => {
      return {
        index,
        label: formatter2.displayName || (formatter2.extensionId ? formatter2.extensionId.value : "?"),
        description: formatter2.extensionId && formatter2.extensionId.value
      };
    });
    const langName = this._languageService.getLanguageName(document.getLanguageId()) || document.getLanguageId();
    const pick = await this._quickInputService.pick(picks, { placeHolder: nls.localize("select", "Select a default formatter for '{0}' files", DefaultFormatter._maybeQuotes(langName)) });
    if (!pick || !formatter[pick.index].extensionId) {
      return void 0;
    }
    this._configService.updateValue(DefaultFormatter.configName, formatter[pick.index].extensionId.value, {
      resource: document.uri,
      overrideIdentifier: document.getLanguageId()
    });
    return formatter[pick.index];
  }
  // --- status item
  _updateStatus() {
    this._languageStatusStore.clear();
    const editor = getCodeEditor(this._editorService.activeTextEditorControl);
    if (!editor || !editor.hasModel()) {
      return;
    }
    const document = editor.getModel();
    const formatter = getRealAndSyntheticDocumentFormattersOrdered(this._languageFeaturesService.documentFormattingEditProvider, this._languageFeaturesService.documentRangeFormattingEditProvider, document);
    if (formatter.length === 0) {
      return;
    }
    const cts = new CancellationTokenSource();
    this._languageStatusStore.add(toDisposable(() => cts.dispose(true)));
    this._analyzeFormatter(FormattingKind.File, formatter, document).then((result) => {
      if (cts.token.isCancellationRequested) {
        return;
      }
      if (typeof result !== "string") {
        return;
      }
      const command = { id: `formatter/configure/dfl/${generateUuid()}`, title: nls.localize("do.config.command", "Configure...") };
      this._languageStatusStore.add(CommandsRegistry.registerCommand(command.id, () => this._pickAndPersistDefaultFormatter(formatter, document)));
      this._languageStatusStore.add(this._languageStatusService.addStatus({
        id: "formatter.conflict",
        name: nls.localize("summary", "Formatter Conflicts"),
        selector: { language: document.getLanguageId(), pattern: document.uri.fsPath },
        severity: Severity.Error,
        label: nls.localize("formatter", "Formatting"),
        detail: result,
        busy: false,
        source: "",
        command,
        accessibilityInfo: void 0
      }));
    });
  }
};
DefaultFormatter.configName = "editor.defaultFormatter";
DefaultFormatter.extensionIds = [];
DefaultFormatter.extensionItemLabels = [];
DefaultFormatter.extensionDescriptions = [];
DefaultFormatter = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IWorkbenchExtensionEnablementService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IDialogService),
  __decorateParam(5, IQuickInputService),
  __decorateParam(6, ILanguageService),
  __decorateParam(7, ILanguageFeaturesService),
  __decorateParam(8, ILanguageStatusService),
  __decorateParam(9, IEditorService)
], DefaultFormatter);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
  DefaultFormatter,
  LifecyclePhase.Restored
);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  ...editorConfigurationBaseNode,
  properties: {
    [DefaultFormatter.configName]: {
      description: nls.localize("formatter.default", "Defines a default formatter which takes precedence over all other formatter settings. Must be the identifier of an extension contributing a formatter."),
      type: ["string", "null"],
      default: null,
      enum: DefaultFormatter.extensionIds,
      enumItemLabels: DefaultFormatter.extensionItemLabels,
      markdownEnumDescriptions: DefaultFormatter.extensionDescriptions
    }
  }
});
async function showFormatterPick(accessor, model, formatters) {
  const quickPickService = accessor.get(IQuickInputService);
  const configService = accessor.get(IConfigurationService);
  const languageService = accessor.get(ILanguageService);
  const overrides = { resource: model.uri, overrideIdentifier: model.getLanguageId() };
  const defaultFormatter = configService.getValue(DefaultFormatter.configName, overrides);
  let defaultFormatterPick;
  const picks = formatters.map((provider, index) => {
    const isDefault = ExtensionIdentifier.equals(provider.extensionId, defaultFormatter);
    const pick2 = {
      index,
      label: provider.displayName || "",
      description: isDefault ? nls.localize("def", "(default)") : void 0
    };
    if (isDefault) {
      defaultFormatterPick = pick2;
    }
    return pick2;
  });
  const configurePick = {
    label: nls.localize("config", "Configure Default Formatter...")
  };
  const pick = await quickPickService.pick(
    [...picks, { type: "separator" }, configurePick],
    {
      placeHolder: nls.localize("format.placeHolder", "Select a formatter"),
      activeItem: defaultFormatterPick
    }
  );
  if (!pick) {
    return void 0;
  } else if (pick === configurePick) {
    const langName = languageService.getLanguageName(model.getLanguageId()) || model.getLanguageId();
    const pick2 = await quickPickService.pick(picks, { placeHolder: nls.localize("select", "Select a default formatter for '{0}' files", DefaultFormatter._maybeQuotes(langName)) });
    if (pick2 && formatters[pick2.index].extensionId) {
      configService.updateValue(DefaultFormatter.configName, formatters[pick2.index].extensionId.value, overrides);
    }
    return void 0;
  } else {
    return pick.index;
  }
}
registerEditorAction(class FormatDocumentMultipleAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.formatDocument.multiple",
      label: nls.localize("formatDocument.label.multiple", "Format Document With..."),
      alias: "Format Document...",
      precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasMultipleDocumentFormattingProvider),
      contextMenuOpts: {
        group: "1_modification",
        order: 1.3
      }
    });
  }
  async run(accessor, editor, args) {
    if (!editor.hasModel()) {
      return;
    }
    const instaService = accessor.get(IInstantiationService);
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const model = editor.getModel();
    const provider = getRealAndSyntheticDocumentFormattersOrdered(languageFeaturesService.documentFormattingEditProvider, languageFeaturesService.documentRangeFormattingEditProvider, model);
    const pick = await instaService.invokeFunction(showFormatterPick, model, provider);
    if (typeof pick === "number") {
      await instaService.invokeFunction(formatDocumentWithProvider, provider[pick], editor, FormattingMode.Explicit, CancellationToken.None);
    }
  }
});
registerEditorAction(class FormatSelectionMultipleAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.formatSelection.multiple",
      label: nls.localize("formatSelection.label.multiple", "Format Selection With..."),
      alias: "Format Code...",
      precondition: ContextKeyExpr.and(ContextKeyExpr.and(EditorContextKeys.writable), EditorContextKeys.hasMultipleDocumentSelectionFormattingProvider),
      contextMenuOpts: {
        when: ContextKeyExpr.and(EditorContextKeys.hasNonEmptySelection),
        group: "1_modification",
        order: 1.31
      }
    });
  }
  async run(accessor, editor) {
    if (!editor.hasModel()) {
      return;
    }
    const instaService = accessor.get(IInstantiationService);
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const model = editor.getModel();
    let range = editor.getSelection();
    if (range.isEmpty()) {
      range = new Range(range.startLineNumber, 1, range.startLineNumber, model.getLineMaxColumn(range.startLineNumber));
    }
    const provider = languageFeaturesService.documentRangeFormattingEditProvider.ordered(model);
    const pick = await instaService.invokeFunction(showFormatterPick, model, provider);
    if (typeof pick === "number") {
      await instaService.invokeFunction(formatDocumentRangesWithProvider, provider[pick], editor, range, CancellationToken.None, true);
    }
  }
});
export {
  DefaultFormatter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZvcm1hdFxcYnJvd3NlclxcZm9ybWF0QWN0aW9uc011bHRpcGxlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZ2V0Q29kZUVkaXRvciwgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGlvbiwgcmVnaXN0ZXJFZGl0b3JBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBEb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIsIERvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgZm9ybWF0RG9jdW1lbnRSYW5nZXNXaXRoUHJvdmlkZXIsIGZvcm1hdERvY3VtZW50V2l0aFByb3ZpZGVyLCBnZXRSZWFsQW5kU3ludGhldGljRG9jdW1lbnRGb3JtYXR0ZXJzT3JkZXJlZCwgRm9ybWF0dGluZ0NvbmZsaWN0cywgRm9ybWF0dGluZ01vZGUsIEZvcm1hdHRpbmdLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZm9ybWF0L2Jyb3dzZXIvZm9ybWF0LmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hFeHRlbnNpb25zLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LCBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSwgdG9FeHRlbnNpb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIE5vdGlmaWNhdGlvblByaW9yaXR5LCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IGVkaXRvckNvbmZpZ3VyYXRpb25CYXNlTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTdGF0dXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGFuZ3VhZ2VTdGF0dXMvY29tbW9uL2xhbmd1YWdlU3RhdHVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuXG50eXBlIEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIgPSBEb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIgfCBEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlcjtcblxuZXhwb3J0IGNsYXNzIERlZmF1bHRGb3JtYXR0ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IGNvbmZpZ05hbWUgPSAnZWRpdG9yLmRlZmF1bHRGb3JtYXR0ZXInO1xuXG5cdHN0YXRpYyBleHRlbnNpb25JZHM6IChzdHJpbmcgfCBudWxsKVtdID0gW107XG5cdHN0YXRpYyBleHRlbnNpb25JdGVtTGFiZWxzOiBzdHJpbmdbXSA9IFtdO1xuXHRzdGF0aWMgZXh0ZW5zaW9uRGVzY3JpcHRpb25zOiBzdHJpbmdbXSA9IFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU3RhdHVzU3RvcmUgPSB0aGlzLl9zdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlnU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVN0YXR1c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTdGF0dXNTZXJ2aWNlOiBJTGFuZ3VhZ2VTdGF0dXNTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5fZXh0ZW5zaW9uU2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvbnModGhpcy5fdXBkYXRlQ29uZmlnVmFsdWVzLCB0aGlzKSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKEZvcm1hdHRpbmdDb25mbGljdHMuc2V0Rm9ybWF0dGVyU2VsZWN0b3IoKGZvcm1hdHRlciwgZG9jdW1lbnQsIG1vZGUsIGtpbmQpID0+IHRoaXMuX3NlbGVjdEZvcm1hdHRlcihmb3JtYXR0ZXIsIGRvY3VtZW50LCBtb2RlLCBraW5kKSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChfZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSh0aGlzLl91cGRhdGVTdGF0dXMsIHRoaXMpKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlci5vbkRpZENoYW5nZSh0aGlzLl91cGRhdGVTdGF0dXMsIHRoaXMpKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLm9uRGlkQ2hhbmdlKHRoaXMuX3VwZGF0ZVN0YXR1cywgdGhpcykpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLm9uRGlkQ2hhbmdlKHRoaXMuX3VwZGF0ZUNvbmZpZ1ZhbHVlcywgdGhpcykpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIub25EaWRDaGFuZ2UodGhpcy5fdXBkYXRlQ29uZmlnVmFsdWVzLCB0aGlzKSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKF9jb25maWdTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oRGVmYXVsdEZvcm1hdHRlci5jb25maWdOYW1lKSAmJiB0aGlzLl91cGRhdGVTdGF0dXMoKSkpO1xuXHRcdHRoaXMuX3VwZGF0ZUNvbmZpZ1ZhbHVlcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdXBkYXRlQ29uZmlnVmFsdWVzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk7XG5cdFx0bGV0IGV4dGVuc2lvbnMgPSBbLi4udGhpcy5fZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zXTtcblxuXHRcdC8vIEdldCBhbGwgZm9ybWF0dGVyIHByb3ZpZGVycyB0byBpZGVudGlmeSB3aGljaCBleHRlbnNpb25zIGFjdHVhbGx5IGNvbnRyaWJ1dGUgZm9ybWF0dGVyc1xuXHRcdGNvbnN0IGRvY3VtZW50Rm9ybWF0dGVycyA9IHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlci5hbGxOb01vZGVsKCk7XG5cdFx0Y29uc3QgcmFuZ2VGb3JtYXR0ZXJzID0gdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIuYWxsTm9Nb2RlbCgpO1xuXHRcdGNvbnN0IGZvcm1hdHRlckV4dGVuc2lvbklkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0Zm9yIChjb25zdCBmb3JtYXR0ZXIgb2YgZG9jdW1lbnRGb3JtYXR0ZXJzKSB7XG5cdFx0XHRpZiAoZm9ybWF0dGVyLmV4dGVuc2lvbklkKSB7XG5cdFx0XHRcdGZvcm1hdHRlckV4dGVuc2lvbklkcy5hZGQoRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShmb3JtYXR0ZXIuZXh0ZW5zaW9uSWQpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBmb3JtYXR0ZXIgb2YgcmFuZ2VGb3JtYXR0ZXJzKSB7XG5cdFx0XHRpZiAoZm9ybWF0dGVyLmV4dGVuc2lvbklkKSB7XG5cdFx0XHRcdGZvcm1hdHRlckV4dGVuc2lvbklkcy5hZGQoRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShmb3JtYXR0ZXIuZXh0ZW5zaW9uSWQpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRleHRlbnNpb25zID0gZXh0ZW5zaW9ucy5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHQvLyBVbHRpbWF0ZSBib29zdDogZXh0ZW5zaW9ucyB0aGF0IGFjdHVhbGx5IGNvbnRyaWJ1dGUgZm9ybWF0dGVyc1xuXHRcdFx0Y29uc3QgY29udHJpYnV0ZXNGb3JtYXR0ZXJBID0gZm9ybWF0dGVyRXh0ZW5zaW9uSWRzLmhhcyhFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KGEuaWRlbnRpZmllcikpO1xuXHRcdFx0Y29uc3QgY29udHJpYnV0ZXNGb3JtYXR0ZXJCID0gZm9ybWF0dGVyRXh0ZW5zaW9uSWRzLmhhcyhFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KGIuaWRlbnRpZmllcikpO1xuXG5cdFx0XHRpZiAoY29udHJpYnV0ZXNGb3JtYXR0ZXJBICYmICFjb250cmlidXRlc0Zvcm1hdHRlckIpIHtcblx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0fSBlbHNlIGlmICghY29udHJpYnV0ZXNGb3JtYXR0ZXJBICYmIGNvbnRyaWJ1dGVzRm9ybWF0dGVyQikge1xuXHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2Vjb25kYXJ5IGJvb3N0OiBjYXRlZ29yeS1iYXNlZCBzb3J0aW5nXG5cdFx0XHRjb25zdCBib29zdEEgPSBhLmNhdGVnb3JpZXM/LmZpbmQoY2F0ID0+IGNhdCA9PT0gJ0Zvcm1hdHRlcnMnIHx8IGNhdCA9PT0gJ1Byb2dyYW1taW5nIExhbmd1YWdlcycpO1xuXHRcdFx0Y29uc3QgYm9vc3RCID0gYi5jYXRlZ29yaWVzPy5maW5kKGNhdCA9PiBjYXQgPT09ICdGb3JtYXR0ZXJzJyB8fCBjYXQgPT09ICdQcm9ncmFtbWluZyBMYW5ndWFnZXMnKTtcblxuXHRcdFx0aWYgKGJvb3N0QSAmJiAhYm9vc3RCKSB7XG5cdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdH0gZWxzZSBpZiAoIWJvb3N0QSAmJiBib29zdEIpIHtcblx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdERlZmF1bHRGb3JtYXR0ZXIuZXh0ZW5zaW9uSWRzLmxlbmd0aCA9IDA7XG5cdFx0RGVmYXVsdEZvcm1hdHRlci5leHRlbnNpb25JdGVtTGFiZWxzLmxlbmd0aCA9IDA7XG5cdFx0RGVmYXVsdEZvcm1hdHRlci5leHRlbnNpb25EZXNjcmlwdGlvbnMubGVuZ3RoID0gMDtcblxuXHRcdERlZmF1bHRGb3JtYXR0ZXIuZXh0ZW5zaW9uSWRzLnB1c2gobnVsbCk7XG5cdFx0RGVmYXVsdEZvcm1hdHRlci5leHRlbnNpb25JdGVtTGFiZWxzLnB1c2gobmxzLmxvY2FsaXplKCdudWxsJywgJ05vbmUnKSk7XG5cdFx0RGVmYXVsdEZvcm1hdHRlci5leHRlbnNpb25EZXNjcmlwdGlvbnMucHVzaChubHMubG9jYWxpemUoJ251bGxGb3JtYXR0ZXJEZXNjcmlwdGlvbicsIFwiTm9uZVwiKSk7XG5cblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uLm1haW4gfHwgZXh0ZW5zaW9uLmJyb3dzZXIpIHtcblx0XHRcdFx0RGVmYXVsdEZvcm1hdHRlci5leHRlbnNpb25JZHMucHVzaChleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSk7XG5cdFx0XHRcdERlZmF1bHRGb3JtYXR0ZXIuZXh0ZW5zaW9uSXRlbUxhYmVscy5wdXNoKGV4dGVuc2lvbi5kaXNwbGF5TmFtZSA/PyAnJyk7XG5cdFx0XHRcdERlZmF1bHRGb3JtYXR0ZXIuZXh0ZW5zaW9uRGVzY3JpcHRpb25zLnB1c2goZXh0ZW5zaW9uLmRlc2NyaXB0aW9uID8/ICcnKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRzdGF0aWMgX21heWJlUXVvdGVzKHM6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHMubWF0Y2goL1xccy8pID8gYCcke3N9J2AgOiBzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYW5hbHl6ZUZvcm1hdHRlcjxUIGV4dGVuZHMgRm9ybWF0dGluZ0VkaXRQcm92aWRlcj4oa2luZDogRm9ybWF0dGluZ0tpbmQsIGZvcm1hdHRlcjogVFtdLCBkb2N1bWVudDogSVRleHRNb2RlbCk6IFByb21pc2U8VCB8IHN0cmluZz4ge1xuXHRcdGNvbnN0IGRlZmF1bHRGb3JtYXR0ZXJJZCA9IHRoaXMuX2NvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihEZWZhdWx0Rm9ybWF0dGVyLmNvbmZpZ05hbWUsIHtcblx0XHRcdHJlc291cmNlOiBkb2N1bWVudC51cmksXG5cdFx0XHRvdmVycmlkZUlkZW50aWZpZXI6IGRvY3VtZW50LmdldExhbmd1YWdlSWQoKVxuXHRcdH0pO1xuXG5cdFx0aWYgKGRlZmF1bHRGb3JtYXR0ZXJJZCkge1xuXHRcdFx0Ly8gZ29vZCAtPiBmb3JtYXR0ZXIgY29uZmlndXJlZFxuXHRcdFx0Y29uc3QgZGVmYXVsdEZvcm1hdHRlciA9IGZvcm1hdHRlci5maW5kKGZvcm1hdHRlciA9PiBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyhmb3JtYXR0ZXIuZXh0ZW5zaW9uSWQsIGRlZmF1bHRGb3JtYXR0ZXJJZCkpO1xuXHRcdFx0aWYgKGRlZmF1bHRGb3JtYXR0ZXIpIHtcblx0XHRcdFx0Ly8gZm9ybWF0dGVyIGF2YWlsYWJsZVxuXHRcdFx0XHRyZXR1cm4gZGVmYXVsdEZvcm1hdHRlcjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gYmFkIC0+IGZvcm1hdHRlciBnb25lXG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSBhd2FpdCB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmdldEV4dGVuc2lvbihkZWZhdWx0Rm9ybWF0dGVySWQpO1xuXHRcdFx0aWYgKGV4dGVuc2lvbiAmJiB0aGlzLl9leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQodG9FeHRlbnNpb24oZXh0ZW5zaW9uKSkpIHtcblx0XHRcdFx0Ly8gZm9ybWF0dGVyIGRvZXMgbm90IHRhcmdldCB0aGlzIGZpbGVcblx0XHRcdFx0Y29uc3QgbGFuZ05hbWUgPSB0aGlzLl9sYW5ndWFnZVNlcnZpY2UuZ2V0TGFuZ3VhZ2VOYW1lKGRvY3VtZW50LmdldExhbmd1YWdlSWQoKSkgfHwgZG9jdW1lbnQuZ2V0TGFuZ3VhZ2VJZCgpO1xuXHRcdFx0XHRjb25zdCBkZXRhaWwgPSBraW5kID09PSBGb3JtYXR0aW5nS2luZC5GaWxlXG5cdFx0XHRcdFx0PyBubHMubG9jYWxpemUoJ21pc3MuMScsIFwiRXh0ZW5zaW9uICd7MH0nIGlzIGNvbmZpZ3VyZWQgYXMgZm9ybWF0dGVyIGJ1dCBpdCBjYW5ub3QgZm9ybWF0ICd7MX0nLWZpbGVzXCIsIGV4dGVuc2lvbi5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24ubmFtZSwgbGFuZ05hbWUpXG5cdFx0XHRcdFx0OiBubHMubG9jYWxpemUoJ21pc3MuMicsIFwiRXh0ZW5zaW9uICd7MH0nIGlzIGNvbmZpZ3VyZWQgYXMgZm9ybWF0dGVyIGJ1dCBpdCBjYW4gb25seSBmb3JtYXQgJ3sxfSctZmlsZXMgYXMgYSB3aG9sZSwgbm90IHNlbGVjdGlvbnMgb3IgcGFydHMgb2YgaXQuXCIsIGV4dGVuc2lvbi5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24ubmFtZSwgbGFuZ05hbWUpO1xuXHRcdFx0XHRyZXR1cm4gZGV0YWlsO1xuXHRcdFx0fVxuXG5cdFx0fSBlbHNlIGlmIChmb3JtYXR0ZXIubGVuZ3RoID09PSAxKSB7XG5cdFx0XHQvLyBvayAtPiBub3RoaW5nIGNvbmZpZ3VyZWQgYnV0IG9ubHkgb25lIGZvcm1hdHRlciBhdmFpbGFibGVcblx0XHRcdHJldHVybiBmb3JtYXR0ZXJbMF07XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFuZ05hbWUgPSB0aGlzLl9sYW5ndWFnZVNlcnZpY2UuZ2V0TGFuZ3VhZ2VOYW1lKGRvY3VtZW50LmdldExhbmd1YWdlSWQoKSkgfHwgZG9jdW1lbnQuZ2V0TGFuZ3VhZ2VJZCgpO1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSAhZGVmYXVsdEZvcm1hdHRlcklkXG5cdFx0XHQ/IG5scy5sb2NhbGl6ZSgnY29uZmlnLm5lZWRlZCcsIFwiVGhlcmUgYXJlIG11bHRpcGxlIGZvcm1hdHRlcnMgZm9yICd7MH0nIGZpbGVzLiBPbmUgb2YgdGhlbSBzaG91bGQgYmUgY29uZmlndXJlZCBhcyBkZWZhdWx0IGZvcm1hdHRlci5cIiwgRGVmYXVsdEZvcm1hdHRlci5fbWF5YmVRdW90ZXMobGFuZ05hbWUpKVxuXHRcdFx0OiBubHMubG9jYWxpemUoJ2NvbmZpZy5iYWQnLCBcIkV4dGVuc2lvbiAnezB9JyBpcyBjb25maWd1cmVkIGFzIGZvcm1hdHRlciBidXQgbm90IGF2YWlsYWJsZS4gU2VsZWN0IGEgZGlmZmVyZW50IGRlZmF1bHQgZm9ybWF0dGVyIHRvIGNvbnRpbnVlLlwiLCBkZWZhdWx0Rm9ybWF0dGVySWQpO1xuXG5cdFx0cmV0dXJuIG1lc3NhZ2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zZWxlY3RGb3JtYXR0ZXI8VCBleHRlbmRzIEZvcm1hdHRpbmdFZGl0UHJvdmlkZXI+KGZvcm1hdHRlcjogVFtdLCBkb2N1bWVudDogSVRleHRNb2RlbCwgbW9kZTogRm9ybWF0dGluZ01vZGUsIGtpbmQ6IEZvcm1hdHRpbmdLaW5kKTogUHJvbWlzZTxUIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZm9ybWF0dGVyT3JNZXNzYWdlID0gYXdhaXQgdGhpcy5fYW5hbHl6ZUZvcm1hdHRlcihraW5kLCBmb3JtYXR0ZXIsIGRvY3VtZW50KTtcblx0XHRpZiAodHlwZW9mIGZvcm1hdHRlck9yTWVzc2FnZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBmb3JtYXR0ZXJPck1lc3NhZ2U7XG5cdFx0fVxuXG5cdFx0aWYgKG1vZGUgIT09IEZvcm1hdHRpbmdNb2RlLlNpbGVudCkge1xuXHRcdFx0Ly8gcnVubmluZyBmcm9tIGEgdXNlciBhY3Rpb24gLT4gc2hvdyBtb2RhbCBkaWFsb2cgc28gdGhhdCB1c2VycyBjb25maWd1cmVcblx0XHRcdC8vIGEgZGVmYXVsdCBmb3JtYXR0ZXJcblx0XHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ21pc3MnLCBcIkNvbmZpZ3VyZSBEZWZhdWx0IEZvcm1hdHRlclwiKSxcblx0XHRcdFx0ZGV0YWlsOiBmb3JtYXR0ZXJPck1lc3NhZ2UsXG5cdFx0XHRcdHByaW1hcnlCdXR0b246IG5scy5sb2NhbGl6ZSh7IGtleTogJ2RvLmNvbmZpZycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkNvbmZpZ3VyZS4uLlwiKVxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoY29uZmlybWVkKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9waWNrQW5kUGVyc2lzdERlZmF1bHRGb3JtYXR0ZXIoZm9ybWF0dGVyLCBkb2N1bWVudCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIG5vIHVzZXIgYWN0aW9uIC0+IHNob3cgYSBzaWxlbnQgbm90aWZpY2F0aW9uIGFuZCBwcm9jZWVkXG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFx0U2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0Zm9ybWF0dGVyT3JNZXNzYWdlLFxuXHRcdFx0XHRbeyBsYWJlbDogbmxzLmxvY2FsaXplKCdkby5jb25maWcubm90aWZpY2F0aW9uJywgXCJDb25maWd1cmUuLi5cIiksIHJ1bjogKCkgPT4gdGhpcy5fcGlja0FuZFBlcnNpc3REZWZhdWx0Rm9ybWF0dGVyKGZvcm1hdHRlciwgZG9jdW1lbnQpIH1dLFxuXHRcdFx0XHR7IHByaW9yaXR5OiBOb3RpZmljYXRpb25Qcmlvcml0eS5TSUxFTlQgfVxuXHRcdFx0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3BpY2tBbmRQZXJzaXN0RGVmYXVsdEZvcm1hdHRlcjxUIGV4dGVuZHMgRm9ybWF0dGluZ0VkaXRQcm92aWRlcj4oZm9ybWF0dGVyOiBUW10sIGRvY3VtZW50OiBJVGV4dE1vZGVsKTogUHJvbWlzZTxUIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcGlja3MgPSBmb3JtYXR0ZXIubWFwKChmb3JtYXR0ZXIsIGluZGV4KTogSUluZGV4ZWRQaWNrID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGluZGV4LFxuXHRcdFx0XHRsYWJlbDogZm9ybWF0dGVyLmRpc3BsYXlOYW1lIHx8IChmb3JtYXR0ZXIuZXh0ZW5zaW9uSWQgPyBmb3JtYXR0ZXIuZXh0ZW5zaW9uSWQudmFsdWUgOiAnPycpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogZm9ybWF0dGVyLmV4dGVuc2lvbklkICYmIGZvcm1hdHRlci5leHRlbnNpb25JZC52YWx1ZVxuXHRcdFx0fTtcblx0XHR9KTtcblx0XHRjb25zdCBsYW5nTmFtZSA9IHRoaXMuX2xhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZU5hbWUoZG9jdW1lbnQuZ2V0TGFuZ3VhZ2VJZCgpKSB8fCBkb2N1bWVudC5nZXRMYW5ndWFnZUlkKCk7XG5cdFx0Y29uc3QgcGljayA9IGF3YWl0IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLnBpY2socGlja3MsIHsgcGxhY2VIb2xkZXI6IG5scy5sb2NhbGl6ZSgnc2VsZWN0JywgXCJTZWxlY3QgYSBkZWZhdWx0IGZvcm1hdHRlciBmb3IgJ3swfScgZmlsZXNcIiwgRGVmYXVsdEZvcm1hdHRlci5fbWF5YmVRdW90ZXMobGFuZ05hbWUpKSB9KTtcblx0XHRpZiAoIXBpY2sgfHwgIWZvcm1hdHRlcltwaWNrLmluZGV4XS5leHRlbnNpb25JZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fY29uZmlnU2VydmljZS51cGRhdGVWYWx1ZShEZWZhdWx0Rm9ybWF0dGVyLmNvbmZpZ05hbWUsIGZvcm1hdHRlcltwaWNrLmluZGV4XS5leHRlbnNpb25JZCEudmFsdWUsIHtcblx0XHRcdHJlc291cmNlOiBkb2N1bWVudC51cmksXG5cdFx0XHRvdmVycmlkZUlkZW50aWZpZXI6IGRvY3VtZW50LmdldExhbmd1YWdlSWQoKVxuXHRcdH0pO1xuXHRcdHJldHVybiBmb3JtYXR0ZXJbcGljay5pbmRleF07XG5cdH1cblxuXHQvLyAtLS0gc3RhdHVzIGl0ZW1cblxuXHRwcml2YXRlIF91cGRhdGVTdGF0dXMoKSB7XG5cdFx0dGhpcy5fbGFuZ3VhZ2VTdGF0dXNTdG9yZS5jbGVhcigpO1xuXG5cdFx0Y29uc3QgZWRpdG9yID0gZ2V0Q29kZUVkaXRvcih0aGlzLl9lZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sKTtcblx0XHRpZiAoIWVkaXRvciB8fCAhZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblxuXHRcdGNvbnN0IGRvY3VtZW50ID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgZm9ybWF0dGVyID0gZ2V0UmVhbEFuZFN5bnRoZXRpY0RvY3VtZW50Rm9ybWF0dGVyc09yZGVyZWQodGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLCB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlciwgZG9jdW1lbnQpO1xuXG5cdFx0aWYgKGZvcm1hdHRlci5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLl9sYW5ndWFnZVN0YXR1c1N0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblxuXHRcdHRoaXMuX2FuYWx5emVGb3JtYXR0ZXIoRm9ybWF0dGluZ0tpbmQuRmlsZSwgZm9ybWF0dGVyLCBkb2N1bWVudCkudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mIHJlc3VsdCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29tbWFuZCA9IHsgaWQ6IGBmb3JtYXR0ZXIvY29uZmlndXJlL2RmbC8ke2dlbmVyYXRlVXVpZCgpfWAsIHRpdGxlOiBubHMubG9jYWxpemUoJ2RvLmNvbmZpZy5jb21tYW5kJywgXCJDb25maWd1cmUuLi5cIikgfTtcblx0XHRcdHRoaXMuX2xhbmd1YWdlU3RhdHVzU3RvcmUuYWRkKENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKGNvbW1hbmQuaWQsICgpID0+IHRoaXMuX3BpY2tBbmRQZXJzaXN0RGVmYXVsdEZvcm1hdHRlcihmb3JtYXR0ZXIsIGRvY3VtZW50KSkpO1xuXHRcdFx0dGhpcy5fbGFuZ3VhZ2VTdGF0dXNTdG9yZS5hZGQodGhpcy5fbGFuZ3VhZ2VTdGF0dXNTZXJ2aWNlLmFkZFN0YXR1cyh7XG5cdFx0XHRcdGlkOiAnZm9ybWF0dGVyLmNvbmZsaWN0Jyxcblx0XHRcdFx0bmFtZTogbmxzLmxvY2FsaXplKCdzdW1tYXJ5JywgXCJGb3JtYXR0ZXIgQ29uZmxpY3RzXCIpLFxuXHRcdFx0XHRzZWxlY3RvcjogeyBsYW5ndWFnZTogZG9jdW1lbnQuZ2V0TGFuZ3VhZ2VJZCgpLCBwYXR0ZXJuOiBkb2N1bWVudC51cmkuZnNQYXRoIH0sXG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnZm9ybWF0dGVyJywgXCJGb3JtYXR0aW5nXCIpLFxuXHRcdFx0XHRkZXRhaWw6IHJlc3VsdCxcblx0XHRcdFx0YnVzeTogZmFsc2UsXG5cdFx0XHRcdHNvdXJjZTogJycsXG5cdFx0XHRcdGNvbW1hbmQsXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlJbmZvOiB1bmRlZmluZWRcblx0XHRcdH0pKTtcblx0XHR9KTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oXG5cdERlZmF1bHRGb3JtYXR0ZXIsXG5cdExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkXG4pO1xuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHQuLi5lZGl0b3JDb25maWd1cmF0aW9uQmFzZU5vZGUsXG5cdHByb3BlcnRpZXM6IHtcblx0XHRbRGVmYXVsdEZvcm1hdHRlci5jb25maWdOYW1lXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZm9ybWF0dGVyLmRlZmF1bHQnLCBcIkRlZmluZXMgYSBkZWZhdWx0IGZvcm1hdHRlciB3aGljaCB0YWtlcyBwcmVjZWRlbmNlIG92ZXIgYWxsIG90aGVyIGZvcm1hdHRlciBzZXR0aW5ncy4gTXVzdCBiZSB0aGUgaWRlbnRpZmllciBvZiBhbiBleHRlbnNpb24gY29udHJpYnV0aW5nIGEgZm9ybWF0dGVyLlwiKSxcblx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ251bGwnXSxcblx0XHRcdGRlZmF1bHQ6IG51bGwsXG5cdFx0XHRlbnVtOiBEZWZhdWx0Rm9ybWF0dGVyLmV4dGVuc2lvbklkcyxcblx0XHRcdGVudW1JdGVtTGFiZWxzOiBEZWZhdWx0Rm9ybWF0dGVyLmV4dGVuc2lvbkl0ZW1MYWJlbHMsXG5cdFx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IERlZmF1bHRGb3JtYXR0ZXIuZXh0ZW5zaW9uRGVzY3JpcHRpb25zXG5cdFx0fVxuXHR9XG59KTtcblxuaW50ZXJmYWNlIElJbmRleGVkUGljayBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0aW5kZXg6IG51bWJlcjtcbn1cblxuXG5hc3luYyBmdW5jdGlvbiBzaG93Rm9ybWF0dGVyUGljayhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgbW9kZWw6IElUZXh0TW9kZWwsIGZvcm1hdHRlcnM6IEZvcm1hdHRpbmdFZGl0UHJvdmlkZXJbXSk6IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPiB7XG5cdGNvbnN0IHF1aWNrUGlja1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0Y29uc3QgY29uZmlnU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cblx0Y29uc3Qgb3ZlcnJpZGVzID0geyByZXNvdXJjZTogbW9kZWwudXJpLCBvdmVycmlkZUlkZW50aWZpZXI6IG1vZGVsLmdldExhbmd1YWdlSWQoKSB9O1xuXHRjb25zdCBkZWZhdWx0Rm9ybWF0dGVyID0gY29uZmlnU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KERlZmF1bHRGb3JtYXR0ZXIuY29uZmlnTmFtZSwgb3ZlcnJpZGVzKTtcblxuXHRsZXQgZGVmYXVsdEZvcm1hdHRlclBpY2s6IElJbmRleGVkUGljayB8IHVuZGVmaW5lZDtcblxuXHRjb25zdCBwaWNrcyA9IGZvcm1hdHRlcnMubWFwKChwcm92aWRlciwgaW5kZXgpID0+IHtcblx0XHRjb25zdCBpc0RlZmF1bHQgPSBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyhwcm92aWRlci5leHRlbnNpb25JZCwgZGVmYXVsdEZvcm1hdHRlcik7XG5cdFx0Y29uc3QgcGljazogSUluZGV4ZWRQaWNrID0ge1xuXHRcdFx0aW5kZXgsXG5cdFx0XHRsYWJlbDogcHJvdmlkZXIuZGlzcGxheU5hbWUgfHwgJycsXG5cdFx0XHRkZXNjcmlwdGlvbjogaXNEZWZhdWx0ID8gbmxzLmxvY2FsaXplKCdkZWYnLCBcIihkZWZhdWx0KVwiKSA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXG5cdFx0aWYgKGlzRGVmYXVsdCkge1xuXHRcdFx0Ly8gYXV0b2ZvY3VzIGRlZmF1bHQgcGlja1xuXHRcdFx0ZGVmYXVsdEZvcm1hdHRlclBpY2sgPSBwaWNrO1xuXHRcdH1cblxuXHRcdHJldHVybiBwaWNrO1xuXHR9KTtcblxuXHRjb25zdCBjb25maWd1cmVQaWNrOiBJUXVpY2tQaWNrSXRlbSA9IHtcblx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdjb25maWcnLCBcIkNvbmZpZ3VyZSBEZWZhdWx0IEZvcm1hdHRlci4uLlwiKVxuXHR9O1xuXG5cdGNvbnN0IHBpY2sgPSBhd2FpdCBxdWlja1BpY2tTZXJ2aWNlLnBpY2soWy4uLnBpY2tzLCB7IHR5cGU6ICdzZXBhcmF0b3InIH0sIGNvbmZpZ3VyZVBpY2tdLFxuXHRcdHtcblx0XHRcdHBsYWNlSG9sZGVyOiBubHMubG9jYWxpemUoJ2Zvcm1hdC5wbGFjZUhvbGRlcicsIFwiU2VsZWN0IGEgZm9ybWF0dGVyXCIpLFxuXHRcdFx0YWN0aXZlSXRlbTogZGVmYXVsdEZvcm1hdHRlclBpY2tcblx0XHR9XG5cdCk7XG5cdGlmICghcGljaykge1xuXHRcdC8vIGRpc21pc3NlZFxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cblx0fSBlbHNlIGlmIChwaWNrID09PSBjb25maWd1cmVQaWNrKSB7XG5cdFx0Ly8gY29uZmlnIGRlZmF1bHRcblx0XHRjb25zdCBsYW5nTmFtZSA9IGxhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZU5hbWUobW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKSB8fCBtb2RlbC5nZXRMYW5ndWFnZUlkKCk7XG5cdFx0Y29uc3QgcGljayA9IGF3YWl0IHF1aWNrUGlja1NlcnZpY2UucGljayhwaWNrcywgeyBwbGFjZUhvbGRlcjogbmxzLmxvY2FsaXplKCdzZWxlY3QnLCBcIlNlbGVjdCBhIGRlZmF1bHQgZm9ybWF0dGVyIGZvciAnezB9JyBmaWxlc1wiLCBEZWZhdWx0Rm9ybWF0dGVyLl9tYXliZVF1b3RlcyhsYW5nTmFtZSkpIH0pO1xuXHRcdGlmIChwaWNrICYmIGZvcm1hdHRlcnNbcGljay5pbmRleF0uZXh0ZW5zaW9uSWQpIHtcblx0XHRcdGNvbmZpZ1NlcnZpY2UudXBkYXRlVmFsdWUoRGVmYXVsdEZvcm1hdHRlci5jb25maWdOYW1lLCBmb3JtYXR0ZXJzW3BpY2suaW5kZXhdLmV4dGVuc2lvbklkIS52YWx1ZSwgb3ZlcnJpZGVzKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblxuXHR9IGVsc2Uge1xuXHRcdC8vIHBpY2tlZCBvbmVcblx0XHRyZXR1cm4gKDxJSW5kZXhlZFBpY2s+cGljaykuaW5kZXg7XG5cdH1cblxufVxuXG5yZWdpc3RlckVkaXRvckFjdGlvbihjbGFzcyBGb3JtYXREb2N1bWVudE11bHRpcGxlQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uZm9ybWF0RG9jdW1lbnQubXVsdGlwbGUnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnZm9ybWF0RG9jdW1lbnQubGFiZWwubXVsdGlwbGUnLCBcIkZvcm1hdCBEb2N1bWVudCBXaXRoLi4uXCIpLFxuXHRcdFx0YWxpYXM6ICdGb3JtYXQgRG9jdW1lbnQuLi4nLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsIEVkaXRvckNvbnRleHRLZXlzLmhhc011bHRpcGxlRG9jdW1lbnRGb3JtYXR0aW5nUHJvdmlkZXIpLFxuXHRcdFx0Y29udGV4dE1lbnVPcHRzOiB7XG5cdFx0XHRcdGdyb3VwOiAnMV9tb2RpZmljYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMS4zXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IsIGFyZ3M6IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGluc3RhU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGdldFJlYWxBbmRTeW50aGV0aWNEb2N1bWVudEZvcm1hdHRlcnNPcmRlcmVkKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlciwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIsIG1vZGVsKTtcblx0XHRjb25zdCBwaWNrID0gYXdhaXQgaW5zdGFTZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHNob3dGb3JtYXR0ZXJQaWNrLCBtb2RlbCwgcHJvdmlkZXIpO1xuXHRcdGlmICh0eXBlb2YgcGljayA9PT0gJ251bWJlcicpIHtcblx0XHRcdGF3YWl0IGluc3RhU2VydmljZS5pbnZva2VGdW5jdGlvbihmb3JtYXREb2N1bWVudFdpdGhQcm92aWRlciwgcHJvdmlkZXJbcGlja10sIGVkaXRvciwgRm9ybWF0dGluZ01vZGUuRXhwbGljaXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKGNsYXNzIEZvcm1hdFNlbGVjdGlvbk11bHRpcGxlQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uZm9ybWF0U2VsZWN0aW9uLm11bHRpcGxlJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2Zvcm1hdFNlbGVjdGlvbi5sYWJlbC5tdWx0aXBsZScsIFwiRm9ybWF0IFNlbGVjdGlvbiBXaXRoLi4uXCIpLFxuXHRcdFx0YWxpYXM6ICdGb3JtYXQgQ29kZS4uLicsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUpLCBFZGl0b3JDb250ZXh0S2V5cy5oYXNNdWx0aXBsZURvY3VtZW50U2VsZWN0aW9uRm9ybWF0dGluZ1Byb3ZpZGVyKSxcblx0XHRcdGNvbnRleHRNZW51T3B0czoge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yQ29udGV4dEtleXMuaGFzTm9uRW1wdHlTZWxlY3Rpb24pLFxuXHRcdFx0XHRncm91cDogJzFfbW9kaWZpY2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEuMzFcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaW5zdGFTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0bGV0IHJhbmdlOiBSYW5nZSA9IGVkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAocmFuZ2UuaXNFbXB0eSgpKSB7XG5cdFx0XHRyYW5nZSA9IG5ldyBSYW5nZShyYW5nZS5zdGFydExpbmVOdW1iZXIsIDEsIHJhbmdlLnN0YXJ0TGluZU51bWJlciwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihyYW5nZS5zdGFydExpbmVOdW1iZXIpKTtcblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLm9yZGVyZWQobW9kZWwpO1xuXHRcdGNvbnN0IHBpY2sgPSBhd2FpdCBpbnN0YVNlcnZpY2UuaW52b2tlRnVuY3Rpb24oc2hvd0Zvcm1hdHRlclBpY2ssIG1vZGVsLCBwcm92aWRlcik7XG5cdFx0aWYgKHR5cGVvZiBwaWNrID09PSAnbnVtYmVyJykge1xuXHRcdFx0YXdhaXQgaW5zdGFTZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZvcm1hdERvY3VtZW50UmFuZ2VzV2l0aFByb3ZpZGVyLCBwcm92aWRlcltwaWNrXSwgZWRpdG9yLCByYW5nZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxxQkFBa0M7QUFDM0MsU0FBUyxjQUFjLDRCQUE0QjtBQUNuRCxTQUFTLHlCQUF5QjtBQUVsQyxZQUFZLFNBQVM7QUFDckIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywwQkFBMEM7QUFDbkQsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsa0NBQWtDLDRCQUE0Qiw4Q0FBOEMscUJBQXFCLGdCQUFnQixzQkFBc0I7QUFDaEwsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQWlDLGNBQWMsK0JBQStCO0FBQzlFLFNBQVMsY0FBYywyQkFBb0Y7QUFDM0csU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBbUIsbUJBQW1CO0FBQy9DLFNBQVMsWUFBWSxpQkFBaUIsb0JBQW9CO0FBQzFELFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsc0JBQXNCLHNCQUFzQixnQkFBZ0I7QUFDckUsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw0Q0FBNEM7QUFDckQsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxvQkFBb0I7QUFJdEIsSUFBTSxtQkFBTixjQUErQixXQUE2QztBQUFBLEVBVWxGLFlBQ3FDLG1CQUNtQiw2QkFDZixnQkFDRCxzQkFDTixnQkFDSSxvQkFDRixrQkFD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UjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUE0QixRQUFxQixNQUE4QjtBQUN4RixRQUFJLENBQUMsT0FBTyxTQUFTLEdBQUc7QUFDdkI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxlQUFlLFNBQVMsSUFBSSxxQkFBcUI7QUFDdkQsVUFBTSwwQkFBMEIsU0FBUyxJQUFJLHdCQUF3QjtBQUNyRSxVQUFNLFFBQVEsT0FBTyxTQUFTO0FBQzlCLFVBQU0sV0FBVyw2Q0FBNkMsd0JBQXdCLGdDQUFnQyx3QkFBd0IscUNBQXFDLEtBQUs7QUFDeEwsVUFBTSxPQUFPLE1BQU0sYUFBYSxlQUFlLG1CQUFtQixPQUFPLFFBQVE7QUFDakYsUUFBSSxPQUFPLFNBQVMsVUFBVTtBQUM3QixZQUFNLGFBQWEsZUFBZSw0QkFBNEIsU0FBUyxJQUFJLEdBQUcsUUFBUSxlQUFlLFVBQVUsa0JBQWtCLElBQUk7QUFBQSxJQUN0STtBQUFBLEVBQ0Q7QUFDRCxDQUFDO0FBRUQscUJBQXFCLE1BQU0sc0NBQXNDLGFBQWE7QUFBQSxFQUU3RSxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxJQUFJLFNBQVMsa0NBQWtDLDBCQUEwQjtBQUFBLE1BQ2hGLE9BQU87QUFBQSxNQUNQLGNBQWMsZUFBZSxJQUFJLGVBQWUsSUFBSSxrQkFBa0IsUUFBUSxHQUFHLGtCQUFrQiw4Q0FBOEM7QUFBQSxNQUNqSixpQkFBaUI7QUFBQSxRQUNoQixNQUFNLGVBQWUsSUFBSSxrQkFBa0Isb0JBQW9CO0FBQUEsUUFDL0QsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBNEIsUUFBb0M7QUFDekUsUUFBSSxDQUFDLE9BQU8sU0FBUyxHQUFHO0FBQ3ZCO0FBQUEsSUFDRDtBQUNBLFVBQU0sZUFBZSxTQUFTLElBQUkscUJBQXFCO0FBQ3ZELFVBQU0sMEJBQTBCLFNBQVMsSUFBSSx3QkFBd0I7QUFFckUsVUFBTSxRQUFRLE9BQU8sU0FBUztBQUM5QixRQUFJLFFBQWUsT0FBTyxhQUFhO0FBQ3ZDLFFBQUksTUFBTSxRQUFRLEdBQUc7QUFDcEIsY0FBUSxJQUFJLE1BQU0sTUFBTSxpQkFBaUIsR0FBRyxNQUFNLGlCQUFpQixNQUFNLGlCQUFpQixNQUFNLGVBQWUsQ0FBQztBQUFBLElBQ2pIO0FBRUEsVUFBTSxXQUFXLHdCQUF3QixvQ0FBb0MsUUFBUSxLQUFLO0FBQzFGLFVBQU0sT0FBTyxNQUFNLGFBQWEsZUFBZSxtQkFBbUIsT0FBTyxRQUFRO0FBQ2pGLFFBQUksT0FBTyxTQUFTLFVBQVU7QUFDN0IsWUFBTSxhQUFhLGVBQWUsa0NBQWtDLFNBQVMsSUFBSSxHQUFHLFFBQVEsT0FBTyxrQkFBa0IsTUFBTSxJQUFJO0FBQUEsSUFDaEk7QUFBQSxFQUNEO0FBQ0QsQ0FBQzsiLAogICJuYW1lcyI6IFsiZm9ybWF0dGVyIiwgImxhbmdOYW1lIiwgInBpY2siXQp9Cg==
