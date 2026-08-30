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
import { coalesce } from "../../../../base/common/arrays.js";
import { createCancelablePromise, DeferredPromise, raceCancellation } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { createStringDataTransferItem, matchesMimeType, UriList, VSDataTransfer } from "../../../../base/common/dataTransfer.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { HierarchicalKind } from "../../../../base/common/hierarchicalKind.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Mimes } from "../../../../base/common/mime.js";
import { upcast } from "../../../../base/common/types.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IBulkEditService } from "../../../browser/services/bulkEditService.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Handler } from "../../../common/editorCommon.js";
import { DocumentPasteTriggerKind } from "../../../common/languages.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from "../../editorState/browser/editorState.js";
import { InlineProgressManager } from "../../inlineProgress/browser/inlineProgress.js";
import { MessageController } from "../../message/browser/messageController.js";
import { DefaultTextPasteOrDropEditProvider } from "./defaultProviders.js";
import { createCombinedWorkspaceEdit, sortEditsByYieldTo } from "./edit.js";
import { PostEditWidgetManager } from "./postEditWidget.js";
const changePasteTypeCommandId = "editor.changePasteType";
const pasteAsPreferenceConfig = "editor.pasteAs.preferences";
const pasteWidgetVisibleCtx = new RawContextKey("pasteWidgetVisible", false, localize("pasteWidgetVisible", "Whether the paste widget is showing"));
const vscodeClipboardMime = "application/vnd.code.copymetadata";
let CopyPasteController = class extends Disposable {
  constructor(editor, instantiationService, _logService, _bulkEditService, _clipboardService, _commandService, _configService, _languageFeaturesService, _quickInputService, _progressService) {
    super();
    this._logService = _logService;
    this._bulkEditService = _bulkEditService;
    this._clipboardService = _clipboardService;
    this._commandService = _commandService;
    this._configService = _configService;
    this._languageFeaturesService = _languageFeaturesService;
    this._quickInputService = _quickInputService;
    this._progressService = _progressService;
    this._editor = editor;
    this._register(editor.onWillCopy((e) => this.handleCopy(e)));
    this._register(editor.onWillCut((e) => this.handleCopy(e)));
    this._register(editor.onWillPaste((e) => this.handlePaste(e)));
    this._pasteProgressManager = this._register(new InlineProgressManager("pasteIntoEditor", editor, instantiationService));
    this._postPasteWidgetManager = this._register(instantiationService.createInstance(
      PostEditWidgetManager,
      "pasteIntoEditor",
      editor,
      pasteWidgetVisibleCtx,
      { id: changePasteTypeCommandId, label: localize("postPasteWidgetTitle", "Show paste options...") },
      () => CopyPasteController._configureDefaultAction ? [CopyPasteController._configureDefaultAction] : []
    ));
  }
  static get(editor) {
    return editor.getContribution(CopyPasteController.ID);
  }
  static setConfigureDefaultAction(action) {
    CopyPasteController._configureDefaultAction = action;
  }
  changePasteType() {
    this._postPasteWidgetManager.tryShowSelector();
  }
  async pasteAs(preferred) {
    this._logService.trace("CopyPasteController.pasteAs");
    this._editor.focus();
    try {
      this._logService.trace("Before calling editor.action.clipboardPasteAction");
      this._pasteAsActionContext = { preferred };
      await this._commandService.executeCommand("editor.action.clipboardPasteAction");
    } finally {
      this._pasteAsActionContext = void 0;
    }
  }
  clearWidgets() {
    this._postPasteWidgetManager.clear();
  }
  isPasteAsEnabled() {
    return this._editor.getOption(EditorOption.pasteAs).enabled;
  }
  async finishedPaste() {
    await this._currentPasteOperation;
  }
  handleCopy(e) {
    this._logService.trace("CopyPasteController#handleCopy");
    if (!this._editor.hasTextFocus()) {
      return;
    }
    this._clipboardService.clearInternalState?.();
    if (!this.isPasteAsEnabled()) {
      return;
    }
    const model = this._editor.getModel();
    const viewModel = this._editor._getViewModel();
    const selections = this._editor.getSelections();
    if (!model || !viewModel || !selections?.length) {
      return;
    }
    const defaultPastePayload = {
      multicursorText: e.dataToCopy.multicursorText ?? null,
      pasteOnNewLine: e.dataToCopy.isFromEmptySelection,
      mode: null
    };
    const providers = this._languageFeaturesService.documentPasteEditProvider.ordered(model).filter((x) => !!x.prepareDocumentPaste);
    if (!providers.length) {
      this.setCopyMetadata(e.clipboardData, { defaultPastePayload });
      return;
    }
    const dataTransfer = new VSDataTransfer();
    const providerCopyMimeTypes = providers.flatMap((x) => x.copyMimeTypes ?? []);
    const handle = generateUuid();
    this.setCopyMetadata(e.clipboardData, {
      id: handle,
      providerCopyMimeTypes,
      defaultPastePayload
    });
    const operations = providers.map((provider) => {
      return {
        providerMimeTypes: provider.copyMimeTypes,
        operation: createCancelablePromise((token) => provider.prepareDocumentPaste(model, e.dataToCopy.sourceRanges, dataTransfer, token).catch((err) => {
          console.error(err);
          return void 0;
        }))
      };
    });
    CopyPasteController._currentCopyOperation?.operations.forEach((entry) => entry.operation.cancel());
    CopyPasteController._currentCopyOperation = { handle, operations };
  }
  async handlePaste(e) {
    this._logService.trace("CopyPasteController#handlePaste for id : ", e.metadata?.id);
    if (!this._editor.hasTextFocus()) {
      return;
    }
    const dataTransfer = e.toExternalVSDataTransfer();
    if (!dataTransfer) {
      return;
    }
    dataTransfer.delete(vscodeClipboardMime);
    MessageController.get(this._editor)?.closeMessage();
    this._currentPasteOperation?.cancel();
    this._currentPasteOperation = void 0;
    const model = this._editor.getModel();
    const selections = this._editor.getSelections();
    if (!selections?.length || !model) {
      return;
    }
    if (this._editor.getOption(EditorOption.readOnly) || !this.isPasteAsEnabled() && !this._pasteAsActionContext) {
      return;
    }
    const metadata = this.fetchCopyMetadata(e);
    this._logService.trace("CopyPasteController#handlePaste with metadata : ", metadata?.id, " and text.length : ", e.clipboardData.getData("text/plain").length);
    const fileTypes = Array.from(e.clipboardData.files).map((file) => file.type);
    const allPotentialMimeTypes = [
      ...e.clipboardData.types,
      ...fileTypes,
      ...metadata?.providerCopyMimeTypes ?? [],
      // TODO: always adds `uri-list` because this get set if there are resources in the system clipboard.
      // However we can only check the system clipboard async. For this early check, just add it in.
      // We filter providers again once we have the final dataTransfer we will use.
      Mimes.uriList
    ];
    const allProviders = this._languageFeaturesService.documentPasteEditProvider.ordered(model).filter((provider) => {
      const preference = this._pasteAsActionContext?.preferred;
      if (preference) {
        if (!this.providerMatchesPreference(provider, preference)) {
          return false;
        }
      }
      return provider.pasteMimeTypes?.some((type) => matchesMimeType(type, allPotentialMimeTypes));
    });
    if (!allProviders.length) {
      if (this._pasteAsActionContext?.preferred) {
        this.showPasteAsNoEditMessage(selections, this._pasteAsActionContext.preferred);
        e.setHandled();
      }
      return;
    }
    e.setHandled();
    if (this._pasteAsActionContext) {
      this.showPasteAsPick(this._pasteAsActionContext.preferred, allProviders, selections, dataTransfer, metadata);
    } else {
      this.doPasteInline(allProviders, selections, dataTransfer, metadata, e.browserEvent);
    }
  }
  showPasteAsNoEditMessage(selections, preference) {
    const kindLabel = "only" in preference ? preference.only.value : "preferences" in preference ? preference.preferences.length ? preference.preferences.map((preference2) => preference2.value).join(", ") : localize("noPreferences", "empty") : preference.providerId;
    MessageController.get(this._editor)?.showMessage(localize("pasteAsError", "No paste edits for '{0}' found", kindLabel), selections[0].getStartPosition());
  }
  doPasteInline(allProviders, selections, dataTransfer, metadata, clipboardEvent) {
    this._logService.trace("CopyPasteController#doPasteInline");
    const editor = this._editor;
    if (!editor.hasModel()) {
      return;
    }
    const editorStateCts = new EditorStateCancellationTokenSource(editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Selection, void 0);
    const p = createCancelablePromise(async (pToken) => {
      const editor2 = this._editor;
      if (!editor2.hasModel()) {
        return;
      }
      const model = editor2.getModel();
      const disposables = new DisposableStore();
      const cts = disposables.add(new CancellationTokenSource(pToken));
      disposables.add(editorStateCts.token.onCancellationRequested(() => cts.cancel()));
      const token = cts.token;
      try {
        await this.mergeInDataFromCopy(allProviders, dataTransfer, metadata, token);
        if (token.isCancellationRequested) {
          return;
        }
        const supportedProviders = allProviders.filter((provider) => this.isSupportedPasteProvider(provider, dataTransfer));
        if (!supportedProviders.length || supportedProviders.length === 1 && supportedProviders[0] instanceof DefaultTextPasteOrDropEditProvider) {
          return this.applyDefaultPasteHandler(dataTransfer, metadata, token, clipboardEvent);
        }
        const context = {
          triggerKind: DocumentPasteTriggerKind.Automatic
        };
        const editSession = await this.getPasteEdits(supportedProviders, dataTransfer, model, selections, context, token);
        disposables.add(editSession);
        if (token.isCancellationRequested) {
          return;
        }
        if (editSession.edits.length === 1 && editSession.edits[0].provider instanceof DefaultTextPasteOrDropEditProvider) {
          return this.applyDefaultPasteHandler(dataTransfer, metadata, token, clipboardEvent);
        }
        if (editSession.edits.length) {
          const canShowWidget = editor2.getOption(EditorOption.pasteAs).showPasteSelector === "afterPaste";
          return this._postPasteWidgetManager.applyEditAndShowIfNeeded(selections, { activeEditIndex: this.getInitialActiveEditIndex(model, editSession.edits), allEdits: editSession.edits }, canShowWidget, async (edit, resolveToken) => {
            if (!edit.provider.resolveDocumentPasteEdit) {
              return edit;
            }
            const resolveP = edit.provider.resolveDocumentPasteEdit(edit, resolveToken);
            const showP = new DeferredPromise();
            const resolved = await this._pasteProgressManager.showWhile(selections[0].getEndPosition(), localize("resolveProcess", "Resolving paste edit for '{0}'. Click to cancel", edit.title), raceCancellation(Promise.race([showP.p, resolveP]), resolveToken), {
              cancel: () => showP.cancel()
            }, 0);
            if (resolved) {
              edit.insertText = resolved.insertText;
              edit.additionalEdit = resolved.additionalEdit;
            }
            return edit;
          }, token);
        }
        await this.applyDefaultPasteHandler(dataTransfer, metadata, token, clipboardEvent);
      } finally {
        disposables.dispose();
        if (this._currentPasteOperation === p) {
          this._currentPasteOperation = void 0;
        }
      }
    });
    this._pasteProgressManager.showWhile(selections[0].getEndPosition(), localize("pasteIntoEditorProgress", "Running paste handlers. Click to cancel and do basic paste"), p, {
      cancel: async () => {
        p.cancel();
        if (editorStateCts.token.isCancellationRequested) {
          return;
        }
        await this.applyDefaultPasteHandler(dataTransfer, metadata, editorStateCts.token, clipboardEvent);
      }
    }).finally(() => {
      editorStateCts.dispose();
    });
    this._currentPasteOperation = p;
  }
  showPasteAsPick(preference, allProviders, selections, dataTransfer, metadata) {
    this._logService.trace("CopyPasteController#showPasteAsPick");
    const p = createCancelablePromise(async (token) => {
      const editor = this._editor;
      if (!editor.hasModel()) {
        return;
      }
      const model = editor.getModel();
      const disposables = new DisposableStore();
      const tokenSource = disposables.add(new EditorStateCancellationTokenSource(editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Selection, void 0, token));
      try {
        await this.mergeInDataFromCopy(allProviders, dataTransfer, metadata, tokenSource.token);
        if (tokenSource.token.isCancellationRequested) {
          return;
        }
        let supportedProviders = allProviders.filter((provider) => this.isSupportedPasteProvider(provider, dataTransfer, preference));
        if (preference) {
          supportedProviders = supportedProviders.filter((provider) => this.providerMatchesPreference(provider, preference));
        }
        const context = {
          triggerKind: DocumentPasteTriggerKind.PasteAs,
          only: preference && "only" in preference ? preference.only : void 0
        };
        let editSession = disposables.add(await this.getPasteEdits(supportedProviders, dataTransfer, model, selections, context, tokenSource.token));
        if (tokenSource.token.isCancellationRequested) {
          return;
        }
        if (preference) {
          editSession = {
            edits: editSession.edits.filter((edit) => {
              if ("only" in preference) {
                return preference.only.contains(edit.kind);
              } else if ("preferences" in preference) {
                return preference.preferences.some((preference2) => preference2.contains(edit.kind));
              } else {
                return preference.providerId === edit.provider.id;
              }
            }),
            dispose: editSession.dispose
          };
        }
        if (!editSession.edits.length) {
          if (preference) {
            this.showPasteAsNoEditMessage(selections, preference);
          }
          return;
        }
        let pickedEdit;
        if (preference) {
          pickedEdit = editSession.edits.at(0);
        } else {
          const configureDefaultItem = {
            id: "editor.pasteAs.default",
            label: localize("pasteAsDefault", "Configure default paste action"),
            edit: void 0
          };
          const selected = await this._quickInputService.pick(
            [
              ...editSession.edits.map((edit) => ({
                label: edit.title,
                description: edit.kind?.value,
                edit
              })),
              ...CopyPasteController._configureDefaultAction ? [
                upcast({ type: "separator" }),
                {
                  label: CopyPasteController._configureDefaultAction.label,
                  edit: void 0
                }
              ] : []
            ],
            {
              placeHolder: localize("pasteAsPickerPlaceholder", "Select Paste Action")
            }
          );
          if (selected === configureDefaultItem) {
            CopyPasteController._configureDefaultAction?.run();
            return;
          }
          pickedEdit = selected?.edit;
        }
        if (!pickedEdit) {
          return;
        }
        const combinedWorkspaceEdit = createCombinedWorkspaceEdit(model.uri, selections, pickedEdit);
        await this._bulkEditService.apply(combinedWorkspaceEdit, { editor: this._editor });
      } finally {
        disposables.dispose();
        if (this._currentPasteOperation === p) {
          this._currentPasteOperation = void 0;
        }
      }
    });
    this._progressService.withProgress({
      location: ProgressLocation.Window,
      title: localize("pasteAsProgress", "Running paste handlers")
    }, () => p);
  }
  setCopyMetadata(clipboardData, metadata) {
    this._logService.trace("CopyPasteController#setCopyMetadata new id : ", metadata.id);
    clipboardData.setData(vscodeClipboardMime, JSON.stringify(metadata));
  }
  fetchCopyMetadata(e) {
    this._logService.trace("CopyPasteController#fetchCopyMetadata");
    const rawMetadata = e.clipboardData.getData(vscodeClipboardMime);
    if (rawMetadata) {
      try {
        return JSON.parse(rawMetadata);
      } catch {
        return void 0;
      }
    }
    if (e.metadata) {
      return {
        defaultPastePayload: {
          mode: e.metadata.mode,
          multicursorText: e.metadata.multicursorText ?? null,
          pasteOnNewLine: !!e.metadata.isFromEmptySelection
        }
      };
    }
    return void 0;
  }
  async mergeInDataFromCopy(allProviders, dataTransfer, metadata, token) {
    this._logService.trace("CopyPasteController#mergeInDataFromCopy with metadata : ", metadata?.id);
    if (metadata?.id && CopyPasteController._currentCopyOperation?.handle === metadata.id) {
      const toResolve = CopyPasteController._currentCopyOperation.operations.filter((op) => allProviders.some((provider) => provider.pasteMimeTypes.some((type) => matchesMimeType(type, op.providerMimeTypes)))).map((op) => op.operation);
      const toMergeResults = await Promise.all(toResolve);
      if (token.isCancellationRequested) {
        return;
      }
      for (const toMergeData of toMergeResults.reverse()) {
        if (toMergeData) {
          for (const [key, value] of toMergeData) {
            dataTransfer.replace(key, value);
          }
        }
      }
    }
    if (!dataTransfer.has(Mimes.uriList)) {
      const resources = await this._clipboardService.readResources();
      if (token.isCancellationRequested) {
        return;
      }
      if (resources.length) {
        dataTransfer.append(Mimes.uriList, createStringDataTransferItem(UriList.create(resources)));
      }
    }
  }
  async getPasteEdits(providers, dataTransfer, model, selections, context, token) {
    const disposables = new DisposableStore();
    const results = await raceCancellation(
      Promise.all(providers.map(async (provider) => {
        try {
          const edits2 = await provider.provideDocumentPasteEdits?.(model, selections, dataTransfer, context, token);
          if (edits2) {
            disposables.add(edits2);
          }
          return edits2?.edits?.map((edit) => ({ ...edit, provider }));
        } catch (err) {
          if (!isCancellationError(err)) {
            console.error(err);
          }
          return void 0;
        }
      })),
      token
    );
    const edits = coalesce(results ?? []).flat().filter((edit) => {
      return !context.only || context.only.contains(edit.kind);
    });
    return {
      edits: sortEditsByYieldTo(edits),
      dispose: () => disposables.dispose()
    };
  }
  async applyDefaultPasteHandler(dataTransfer, metadata, token, clipboardEvent) {
    const textDataTransfer = dataTransfer.get(Mimes.text) ?? dataTransfer.get("text");
    const text = await textDataTransfer?.asString() ?? "";
    if (token.isCancellationRequested) {
      return;
    }
    const payload = {
      clipboardEvent,
      text,
      pasteOnNewLine: metadata?.defaultPastePayload.pasteOnNewLine ?? false,
      multicursorText: metadata?.defaultPastePayload.multicursorText ?? null,
      mode: null
    };
    this._logService.trace("CopyPasteController#applyDefaultPasteHandler for id : ", metadata?.id);
    this._editor.trigger("keyboard", Handler.Paste, payload);
  }
  /**
   * Filter out providers if they:
   * - Don't handle any of the data transfer types we have
   * - Don't match the preferred paste kind
   */
  isSupportedPasteProvider(provider, dataTransfer, preference) {
    if (!provider.pasteMimeTypes?.some((type) => dataTransfer.matches(type))) {
      return false;
    }
    return !preference || this.providerMatchesPreference(provider, preference);
  }
  providerMatchesPreference(provider, preference) {
    if ("only" in preference) {
      return provider.providedPasteEditKinds.some((providedKind) => preference.only.contains(providedKind));
    } else if ("preferences" in preference) {
      return provider.providedPasteEditKinds.some((providedKind) => preference.preferences.some((preferredKind) => preferredKind.contains(providedKind)));
    } else {
      return provider.id === preference.providerId;
    }
  }
  getInitialActiveEditIndex(model, edits) {
    const preferredProviders = this._configService.getValue(pasteAsPreferenceConfig, { resource: model.uri });
    for (const config of Array.isArray(preferredProviders) ? preferredProviders : []) {
      const desiredKind = new HierarchicalKind(config);
      const editIndex = edits.findIndex((edit) => desiredKind.contains(edit.kind));
      if (editIndex >= 0) {
        return editIndex;
      }
    }
    return 0;
  }
};
CopyPasteController.ID = "editor.contrib.copyPasteActionController";
CopyPasteController = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IBulkEditService),
  __decorateParam(4, IClipboardService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, ILanguageFeaturesService),
  __decorateParam(8, IQuickInputService),
  __decorateParam(9, IProgressService)
], CopyPasteController);
export {
  CopyPasteController,
  changePasteTypeCommandId,
  pasteAsPreferenceConfig,
  pasteWidgetVisibleCtx
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGRyb3BPclBhc3RlSW50b1xcYnJvd3NlclxcY29weVBhc3RlQ29udHJvbGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSwgRGVmZXJyZWRQcm9taXNlLCByYWNlQ2FuY2VsbGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGNyZWF0ZVN0cmluZ0RhdGFUcmFuc2Zlckl0ZW0sIElSZWFkb25seVZTRGF0YVRyYW5zZmVyLCBtYXRjaGVzTWltZVR5cGUsIFVyaUxpc3QsIFZTRGF0YVRyYW5zZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0YVRyYW5zZmVyLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSGllcmFyY2hpY2FsS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hpZXJhcmNoaWNhbEtpbmQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE1pbWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWltZS5qcyc7XG5pbXBvcnQgeyB1cGNhc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0sIElRdWlja1BpY2tTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRDb3B5RXZlbnQsIElDbGlwYm9hcmRQYXN0ZUV2ZW50LCBJV3JpdGFibGVDbGlwYm9hcmREYXRhIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jb250cm9sbGVyL2VkaXRDb250ZXh0L2NsaXBib2FyZFV0aWxzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBQYXN0ZVBheWxvYWQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUJ1bGtFZGl0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvc2VydmljZXMvYnVsa0VkaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSGFuZGxlciwgSUVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgRG9jdW1lbnRQYXN0ZUNvbnRleHQsIERvY3VtZW50UGFzdGVFZGl0LCBEb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyLCBEb2N1bWVudFBhc3RlVHJpZ2dlcktpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvclN0YXRlRmxhZywgRWRpdG9yU3RhdGVDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uL2VkaXRvclN0YXRlL2Jyb3dzZXIvZWRpdG9yU3RhdGUuanMnO1xuaW1wb3J0IHsgSW5saW5lUHJvZ3Jlc3NNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vaW5saW5lUHJvZ3Jlc3MvYnJvd3Nlci9pbmxpbmVQcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlQ29udHJvbGxlciB9IGZyb20gJy4uLy4uL21lc3NhZ2UvYnJvd3Nlci9tZXNzYWdlQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBQcmVmZXJyZWRQYXN0ZUNvbmZpZ3VyYXRpb24gfSBmcm9tICcuL2NvcHlQYXN0ZUNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0VGV4dFBhc3RlT3JEcm9wRWRpdFByb3ZpZGVyIH0gZnJvbSAnLi9kZWZhdWx0UHJvdmlkZXJzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNvbWJpbmVkV29ya3NwYWNlRWRpdCwgc29ydEVkaXRzQnlZaWVsZFRvIH0gZnJvbSAnLi9lZGl0LmpzJztcbmltcG9ydCB7IFBvc3RFZGl0V2lkZ2V0TWFuYWdlciB9IGZyb20gJy4vcG9zdEVkaXRXaWRnZXQuanMnO1xuXG5leHBvcnQgY29uc3QgY2hhbmdlUGFzdGVUeXBlQ29tbWFuZElkID0gJ2VkaXRvci5jaGFuZ2VQYXN0ZVR5cGUnO1xuXG5leHBvcnQgY29uc3QgcGFzdGVBc1ByZWZlcmVuY2VDb25maWcgPSAnZWRpdG9yLnBhc3RlQXMucHJlZmVyZW5jZXMnO1xuXG5leHBvcnQgY29uc3QgcGFzdGVXaWRnZXRWaXNpYmxlQ3R4ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3Bhc3RlV2lkZ2V0VmlzaWJsZScsIGZhbHNlLCBsb2NhbGl6ZSgncGFzdGVXaWRnZXRWaXNpYmxlJywgXCJXaGV0aGVyIHRoZSBwYXN0ZSB3aWRnZXQgaXMgc2hvd2luZ1wiKSk7XG5cbmNvbnN0IHZzY29kZUNsaXBib2FyZE1pbWUgPSAnYXBwbGljYXRpb24vdm5kLmNvZGUuY29weW1ldGFkYXRhJztcblxuaW50ZXJmYWNlIENvcHlNZXRhZGF0YSB7XG5cdHJlYWRvbmx5IGlkPzogc3RyaW5nO1xuXHRyZWFkb25seSBwcm92aWRlckNvcHlNaW1lVHlwZXM/OiByZWFkb25seSBzdHJpbmdbXTtcblxuXHRyZWFkb25seSBkZWZhdWx0UGFzdGVQYXlsb2FkOiBPbWl0PFBhc3RlUGF5bG9hZCwgJ3RleHQnPjtcbn1cblxudHlwZSBQYXN0ZUVkaXRXaXRoUHJvdmlkZXIgPSBEb2N1bWVudFBhc3RlRWRpdCAmIHtcblx0cHJvdmlkZXI6IERvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXI7XG59O1xuXG5cbmludGVyZmFjZSBEb2N1bWVudFBhc3RlV2l0aFByb3ZpZGVyRWRpdHNTZXNzaW9uIHtcblx0ZWRpdHM6IHJlYWRvbmx5IFBhc3RlRWRpdFdpdGhQcm92aWRlcltdO1xuXHRkaXNwb3NlKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCB0eXBlIFBhc3RlUHJlZmVyZW5jZSA9XG5cdHwgeyByZWFkb25seSBvbmx5OiBIaWVyYXJjaGljYWxLaW5kIH1cblx0fCB7IHJlYWRvbmx5IHByZWZlcmVuY2VzOiByZWFkb25seSBIaWVyYXJjaGljYWxLaW5kW10gfVxuXHR8IHsgcmVhZG9ubHkgcHJvdmlkZXJJZDogc3RyaW5nIH0gLy8gT25seSB1c2VkIGludGVybmFsbHlcblx0O1xuXG5pbnRlcmZhY2UgQ29weU9wZXJhdGlvbiB7XG5cdHJlYWRvbmx5IHByb3ZpZGVyTWltZVR5cGVzOiByZWFkb25seSBzdHJpbmdbXTtcblx0cmVhZG9ubHkgb3BlcmF0aW9uOiBDYW5jZWxhYmxlUHJvbWlzZTxJUmVhZG9ubHlWU0RhdGFUcmFuc2ZlciB8IHVuZGVmaW5lZD47XG59XG5cbmV4cG9ydCBjbGFzcyBDb3B5UGFzdGVDb250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmNvbnRyaWIuY29weVBhc3RlQWN0aW9uQ29udHJvbGxlcic7XG5cblx0cHVibGljIHN0YXRpYyBnZXQoZWRpdG9yOiBJQ29kZUVkaXRvcik6IENvcHlQYXN0ZUNvbnRyb2xsZXIgfCBudWxsIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxDb3B5UGFzdGVDb250cm9sbGVyPihDb3B5UGFzdGVDb250cm9sbGVyLklEKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgc2V0Q29uZmlndXJlRGVmYXVsdEFjdGlvbihhY3Rpb246IElBY3Rpb24pIHtcblx0XHRDb3B5UGFzdGVDb250cm9sbGVyLl9jb25maWd1cmVEZWZhdWx0QWN0aW9uID0gYWN0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NvbmZpZ3VyZURlZmF1bHRBY3Rpb24/OiBJQWN0aW9uO1xuXG5cdC8qKlxuXHQgKiBHbG9iYWwgdHJhY2tpbmcgdGhlIGxhc3QgY29weSBvcGVyYXRpb24uXG5cdCAqXG5cdCAqIFRoaXMgaXMgc2hhcmVkIGFjcm9zcyBhbGwgZWRpdG9ycyBzbyB0aGF0IHlvdSBjYW4gY29weSBhbmQgcGFzdGUgYmV0d2VlbiBncm91cHMuXG5cdCAqXG5cdCAqIFRPRE86IGZpZ3VyZSBvdXQgaG93IHRvIG1ha2UgdGhpcyB3b3JrIHdpdGggbXVsdGlwbGUgd2luZG93c1xuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgX2N1cnJlbnRDb3B5T3BlcmF0aW9uPzoge1xuXHRcdHJlYWRvbmx5IGhhbmRsZTogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IG9wZXJhdGlvbnM6IFJlYWRvbmx5QXJyYXk8Q29weU9wZXJhdGlvbj47XG5cdH07XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcjtcblxuXHRwcml2YXRlIF9jdXJyZW50UGFzdGVPcGVyYXRpb24/OiBDYW5jZWxhYmxlUHJvbWlzZTx2b2lkPjtcblx0cHJpdmF0ZSBfcGFzdGVBc0FjdGlvbkNvbnRleHQ/OiB7IHJlYWRvbmx5IHByZWZlcnJlZD86IFBhc3RlUHJlZmVyZW5jZSB9O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Bhc3RlUHJvZ3Jlc3NNYW5hZ2VyOiBJbmxpbmVQcm9ncmVzc01hbmFnZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Bvc3RQYXN0ZVdpZGdldE1hbmFnZXI6IFBvc3RFZGl0V2lkZ2V0TWFuYWdlcjxQYXN0ZUVkaXRXaXRoUHJvdmlkZXI+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUJ1bGtFZGl0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9idWxrRWRpdFNlcnZpY2U6IElCdWxrRWRpdFNlcnZpY2UsXG5cdFx0QElDbGlwYm9hcmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ1NlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2VkaXRvciA9IGVkaXRvcjtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvci5vbldpbGxDb3B5KGUgPT4gdGhpcy5oYW5kbGVDb3B5KGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yLm9uV2lsbEN1dChlID0+IHRoaXMuaGFuZGxlQ29weShlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvci5vbldpbGxQYXN0ZShlID0+IHRoaXMuaGFuZGxlUGFzdGUoZSkpKTtcblxuXHRcdHRoaXMuX3Bhc3RlUHJvZ3Jlc3NNYW5hZ2VyID0gdGhpcy5fcmVnaXN0ZXIobmV3IElubGluZVByb2dyZXNzTWFuYWdlcigncGFzdGVJbnRvRWRpdG9yJywgZWRpdG9yLCBpbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXG5cdFx0dGhpcy5fcG9zdFBhc3RlV2lkZ2V0TWFuYWdlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFBvc3RFZGl0V2lkZ2V0TWFuYWdlciwgJ3Bhc3RlSW50b0VkaXRvcicsIGVkaXRvciwgcGFzdGVXaWRnZXRWaXNpYmxlQ3R4LFxuXHRcdFx0eyBpZDogY2hhbmdlUGFzdGVUeXBlQ29tbWFuZElkLCBsYWJlbDogbG9jYWxpemUoJ3Bvc3RQYXN0ZVdpZGdldFRpdGxlJywgXCJTaG93IHBhc3RlIG9wdGlvbnMuLi5cIikgfSxcblx0XHRcdCgpID0+IENvcHlQYXN0ZUNvbnRyb2xsZXIuX2NvbmZpZ3VyZURlZmF1bHRBY3Rpb24gPyBbQ29weVBhc3RlQ29udHJvbGxlci5fY29uZmlndXJlRGVmYXVsdEFjdGlvbl0gOiBbXVxuXHRcdCkpO1xuXHR9XG5cblx0cHVibGljIGNoYW5nZVBhc3RlVHlwZSgpIHtcblx0XHR0aGlzLl9wb3N0UGFzdGVXaWRnZXRNYW5hZ2VyLnRyeVNob3dTZWxlY3RvcigpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHBhc3RlQXMocHJlZmVycmVkPzogUGFzdGVQcmVmZXJlbmNlKSB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnQ29weVBhc3RlQ29udHJvbGxlci5wYXN0ZUFzJyk7XG5cdFx0dGhpcy5fZWRpdG9yLmZvY3VzKCk7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ0JlZm9yZSBjYWxsaW5nIGVkaXRvci5hY3Rpb24uY2xpcGJvYXJkUGFzdGVBY3Rpb24nKTtcblx0XHRcdHRoaXMuX3Bhc3RlQXNBY3Rpb25Db250ZXh0ID0geyBwcmVmZXJyZWQgfTtcblx0XHRcdGF3YWl0IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdlZGl0b3IuYWN0aW9uLmNsaXBib2FyZFBhc3RlQWN0aW9uJyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX3Bhc3RlQXNBY3Rpb25Db250ZXh0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBjbGVhcldpZGdldHMoKSB7XG5cdFx0dGhpcy5fcG9zdFBhc3RlV2lkZ2V0TWFuYWdlci5jbGVhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1Bhc3RlQXNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5wYXN0ZUFzKS5lbmFibGVkO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGZpbmlzaGVkUGFzdGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fY3VycmVudFBhc3RlT3BlcmF0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVDb3B5KGU6IElDbGlwYm9hcmRDb3B5RXZlbnQpIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdDb3B5UGFzdGVDb250cm9sbGVyI2hhbmRsZUNvcHknKTtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNUZXh0Rm9jdXMoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEV4cGxpY2l0bHkgY2xlYXIgdGhlIGNsaXBib2FyZCBpbnRlcm5hbCBzdGF0ZS5cblx0XHQvLyBUaGlzIGlzIG5lZWRlZCBiZWNhdXNlIG9uIHdlYiwgdGhlIGJyb3dzZXIgY2xpcGJvYXJkIGlzIGZha2VkIG91dCB1c2luZyBhbiBpbi1tZW1vcnkgc3RvcmUuXG5cdFx0Ly8gVGhpcyBtZWFucyB0aGUgcmVzb3VyY2VzIGNsaXBib2FyZCBpcyBub3QgcHJvcGVybHkgdXBkYXRlZCB3aGVuIGNvcHlpbmcgZnJvbSB0aGUgZWRpdG9yLlxuXHRcdHRoaXMuX2NsaXBib2FyZFNlcnZpY2UuY2xlYXJJbnRlcm5hbFN0YXRlPy4oKTtcblxuXHRcdGlmICghdGhpcy5pc1Bhc3RlQXNFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuX2VkaXRvci5fZ2V0Vmlld01vZGVsKCk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0aWYgKCFtb2RlbCB8fCAhdmlld01vZGVsIHx8ICFzZWxlY3Rpb25zPy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkZWZhdWx0UGFzdGVQYXlsb2FkID0ge1xuXHRcdFx0bXVsdGljdXJzb3JUZXh0OiBlLmRhdGFUb0NvcHkubXVsdGljdXJzb3JUZXh0ID8/IG51bGwsXG5cdFx0XHRwYXN0ZU9uTmV3TGluZTogZS5kYXRhVG9Db3B5LmlzRnJvbUVtcHR5U2VsZWN0aW9uLFxuXHRcdFx0bW9kZTogbnVsbFxuXHRcdH07XG5cblx0XHRjb25zdCBwcm92aWRlcnMgPSB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyXG5cdFx0XHQub3JkZXJlZChtb2RlbClcblx0XHRcdC5maWx0ZXIoeCA9PiAhIXgucHJlcGFyZURvY3VtZW50UGFzdGUpO1xuXHRcdGlmICghcHJvdmlkZXJzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5zZXRDb3B5TWV0YWRhdGEoZS5jbGlwYm9hcmREYXRhLCB7IGRlZmF1bHRQYXN0ZVBheWxvYWQgfSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGF0YVRyYW5zZmVyID0gbmV3IFZTRGF0YVRyYW5zZmVyKCk7XG5cdFx0Y29uc3QgcHJvdmlkZXJDb3B5TWltZVR5cGVzID0gcHJvdmlkZXJzLmZsYXRNYXAoeCA9PiB4LmNvcHlNaW1lVHlwZXMgPz8gW10pO1xuXG5cdFx0Ly8gU2F2ZSBvZmYgYSBoYW5kbGUgcG9pbnRpbmcgdG8gZGF0YSB0aGF0IFZTIENvZGUgbWFpbnRhaW5zLlxuXHRcdGNvbnN0IGhhbmRsZSA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdHRoaXMuc2V0Q29weU1ldGFkYXRhKGUuY2xpcGJvYXJkRGF0YSwge1xuXHRcdFx0aWQ6IGhhbmRsZSxcblx0XHRcdHByb3ZpZGVyQ29weU1pbWVUeXBlcyxcblx0XHRcdGRlZmF1bHRQYXN0ZVBheWxvYWRcblx0XHR9KTtcblxuXHRcdGNvbnN0IG9wZXJhdGlvbnMgPSBwcm92aWRlcnMubWFwKChwcm92aWRlcik6IENvcHlPcGVyYXRpb24gPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cHJvdmlkZXJNaW1lVHlwZXM6IHByb3ZpZGVyLmNvcHlNaW1lVHlwZXMsXG5cdFx0XHRcdG9wZXJhdGlvbjogY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT5cblx0XHRcdFx0XHRwcm92aWRlci5wcmVwYXJlRG9jdW1lbnRQYXN0ZSEobW9kZWwsIGUuZGF0YVRvQ29weS5zb3VyY2VSYW5nZXMsIGRhdGFUcmFuc2ZlciwgdG9rZW4pXG5cdFx0XHRcdFx0XHQuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc29sZS5lcnJvcihlcnIpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0fSkpXG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0Q29weVBhc3RlQ29udHJvbGxlci5fY3VycmVudENvcHlPcGVyYXRpb24/Lm9wZXJhdGlvbnMuZm9yRWFjaChlbnRyeSA9PiBlbnRyeS5vcGVyYXRpb24uY2FuY2VsKCkpO1xuXHRcdENvcHlQYXN0ZUNvbnRyb2xsZXIuX2N1cnJlbnRDb3B5T3BlcmF0aW9uID0geyBoYW5kbGUsIG9wZXJhdGlvbnMgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlUGFzdGUoZTogSUNsaXBib2FyZFBhc3RlRXZlbnQpIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdDb3B5UGFzdGVDb250cm9sbGVyI2hhbmRsZVBhc3RlIGZvciBpZCA6ICcsIGUubWV0YWRhdGE/LmlkKTtcblxuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc1RleHRGb2N1cygpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGF0YVRyYW5zZmVyID0gZS50b0V4dGVybmFsVlNEYXRhVHJhbnNmZXIoKTtcblx0XHRpZiAoIWRhdGFUcmFuc2Zlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRkYXRhVHJhbnNmZXIuZGVsZXRlKHZzY29kZUNsaXBib2FyZE1pbWUpO1xuXG5cdFx0TWVzc2FnZUNvbnRyb2xsZXIuZ2V0KHRoaXMuX2VkaXRvcik/LmNsb3NlTWVzc2FnZSgpO1xuXHRcdHRoaXMuX2N1cnJlbnRQYXN0ZU9wZXJhdGlvbj8uY2FuY2VsKCk7XG5cdFx0dGhpcy5fY3VycmVudFBhc3RlT3BlcmF0aW9uID0gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBzZWxlY3Rpb25zID0gdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRpZiAoIXNlbGVjdGlvbnM/Lmxlbmd0aCB8fCAhbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoXG5cdFx0XHR0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5yZWFkT25seSkgLy8gTmV2ZXIgZW5hYmxlZCBpZiBlZGl0b3IgaXMgcmVhZG9ubHkuXG5cdFx0XHR8fCAoIXRoaXMuaXNQYXN0ZUFzRW5hYmxlZCgpICYmICF0aGlzLl9wYXN0ZUFzQWN0aW9uQ29udGV4dCkgLy8gT3IgZmVhdHVyZSBkaXNhYmxlZCAoYnV0IHN0aWxsIGVuYWJsZSBpZiBwYXN0ZSB3YXMgZXhwbGljaXRseSByZXF1ZXN0ZWQpXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWV0YWRhdGEgPSB0aGlzLmZldGNoQ29weU1ldGFkYXRhKGUpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ0NvcHlQYXN0ZUNvbnRyb2xsZXIjaGFuZGxlUGFzdGUgd2l0aCBtZXRhZGF0YSA6ICcsIG1ldGFkYXRhPy5pZCwgJyBhbmQgdGV4dC5sZW5ndGggOiAnLCBlLmNsaXBib2FyZERhdGEuZ2V0RGF0YSgndGV4dC9wbGFpbicpLmxlbmd0aCk7XG5cblx0XHRjb25zdCBmaWxlVHlwZXMgPSBBcnJheS5mcm9tKGUuY2xpcGJvYXJkRGF0YS5maWxlcykubWFwKGZpbGUgPT4gZmlsZS50eXBlKTtcblxuXHRcdGNvbnN0IGFsbFBvdGVudGlhbE1pbWVUeXBlcyA9IFtcblx0XHRcdC4uLmUuY2xpcGJvYXJkRGF0YS50eXBlcyxcblx0XHRcdC4uLmZpbGVUeXBlcyxcblx0XHRcdC4uLm1ldGFkYXRhPy5wcm92aWRlckNvcHlNaW1lVHlwZXMgPz8gW10sXG5cdFx0XHQvLyBUT0RPOiBhbHdheXMgYWRkcyBgdXJpLWxpc3RgIGJlY2F1c2UgdGhpcyBnZXQgc2V0IGlmIHRoZXJlIGFyZSByZXNvdXJjZXMgaW4gdGhlIHN5c3RlbSBjbGlwYm9hcmQuXG5cdFx0XHQvLyBIb3dldmVyIHdlIGNhbiBvbmx5IGNoZWNrIHRoZSBzeXN0ZW0gY2xpcGJvYXJkIGFzeW5jLiBGb3IgdGhpcyBlYXJseSBjaGVjaywganVzdCBhZGQgaXQgaW4uXG5cdFx0XHQvLyBXZSBmaWx0ZXIgcHJvdmlkZXJzIGFnYWluIG9uY2Ugd2UgaGF2ZSB0aGUgZmluYWwgZGF0YVRyYW5zZmVyIHdlIHdpbGwgdXNlLlxuXHRcdFx0TWltZXMudXJpTGlzdCxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWxsUHJvdmlkZXJzID0gdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlclxuXHRcdFx0Lm9yZGVyZWQobW9kZWwpXG5cdFx0XHQuZmlsdGVyKHByb3ZpZGVyID0+IHtcblx0XHRcdFx0Ly8gRmlsdGVyIG91dCBwcm92aWRlcnMgdGhhdCBkb24ndCBtYXRjaCB0aGUgcmVxdWVzdGVkIHBhc3RlIHR5cGVzXG5cdFx0XHRcdGNvbnN0IHByZWZlcmVuY2UgPSB0aGlzLl9wYXN0ZUFzQWN0aW9uQ29udGV4dD8ucHJlZmVycmVkO1xuXHRcdFx0XHRpZiAocHJlZmVyZW5jZSkge1xuXHRcdFx0XHRcdGlmICghdGhpcy5wcm92aWRlck1hdGNoZXNQcmVmZXJlbmNlKHByb3ZpZGVyLCBwcmVmZXJlbmNlKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEFuZCBwcm92aWRlcnMgdGhhdCBkb24ndCBoYW5kbGUgYW55IG9mIG1pbWUgdHlwZXMgaW4gdGhlIGNsaXBib2FyZFxuXHRcdFx0XHRyZXR1cm4gcHJvdmlkZXIucGFzdGVNaW1lVHlwZXM/LnNvbWUodHlwZSA9PiBtYXRjaGVzTWltZVR5cGUodHlwZSwgYWxsUG90ZW50aWFsTWltZVR5cGVzKSk7XG5cdFx0XHR9KTtcblx0XHRpZiAoIWFsbFByb3ZpZGVycy5sZW5ndGgpIHtcblx0XHRcdGlmICh0aGlzLl9wYXN0ZUFzQWN0aW9uQ29udGV4dD8ucHJlZmVycmVkKSB7XG5cdFx0XHRcdHRoaXMuc2hvd1Bhc3RlQXNOb0VkaXRNZXNzYWdlKHNlbGVjdGlvbnMsIHRoaXMuX3Bhc3RlQXNBY3Rpb25Db250ZXh0LnByZWZlcnJlZCk7XG5cblx0XHRcdFx0Ly8gQWxzbyBwcmV2ZW50IGRlZmF1bHQgcGFzdGUgZnJvbSBhcHBseWluZ1xuXHRcdFx0XHRlLnNldEhhbmRsZWQoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBQcmV2ZW50IHRoZSBlZGl0b3IncyBkZWZhdWx0IHBhc3RlIGhhbmRsZXIgZnJvbSBydW5uaW5nLlxuXHRcdC8vIE5vdGUgdGhhdCBhZnRlciB0aGlzIHBvaW50LCB3ZSBhcmUgZnVsbHkgcmVzcG9uc2libGUgZm9yIGhhbmRsaW5nIHBhc3RlLlxuXHRcdC8vIElmIHdlIGNhbid0IHByb3ZpZGVyIGEgcGFzdGUgZm9yIGFueSByZWFzb24sIHdlIG5lZWQgdG8gZXhwbGljaXRseSBkZWxlZ2F0ZSBwYXN0aW5nIGJhY2sgdG8gdGhlIGVkaXRvci5cblx0XHRlLnNldEhhbmRsZWQoKTtcblxuXHRcdGlmICh0aGlzLl9wYXN0ZUFzQWN0aW9uQ29udGV4dCkge1xuXHRcdFx0dGhpcy5zaG93UGFzdGVBc1BpY2sodGhpcy5fcGFzdGVBc0FjdGlvbkNvbnRleHQucHJlZmVycmVkLCBhbGxQcm92aWRlcnMsIHNlbGVjdGlvbnMsIGRhdGFUcmFuc2ZlciwgbWV0YWRhdGEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmRvUGFzdGVJbmxpbmUoYWxsUHJvdmlkZXJzLCBzZWxlY3Rpb25zLCBkYXRhVHJhbnNmZXIsIG1ldGFkYXRhLCBlLmJyb3dzZXJFdmVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzaG93UGFzdGVBc05vRWRpdE1lc3NhZ2Uoc2VsZWN0aW9uczogcmVhZG9ubHkgU2VsZWN0aW9uW10sIHByZWZlcmVuY2U6IFBhc3RlUHJlZmVyZW5jZSkge1xuXHRcdGNvbnN0IGtpbmRMYWJlbCA9ICdvbmx5JyBpbiBwcmVmZXJlbmNlXG5cdFx0XHQ/IHByZWZlcmVuY2Uub25seS52YWx1ZVxuXHRcdFx0OiAncHJlZmVyZW5jZXMnIGluIHByZWZlcmVuY2Vcblx0XHRcdFx0PyAocHJlZmVyZW5jZS5wcmVmZXJlbmNlcy5sZW5ndGggPyBwcmVmZXJlbmNlLnByZWZlcmVuY2VzLm1hcChwcmVmZXJlbmNlID0+IHByZWZlcmVuY2UudmFsdWUpLmpvaW4oJywgJykgOiBsb2NhbGl6ZSgnbm9QcmVmZXJlbmNlcycsIFwiZW1wdHlcIikpXG5cdFx0XHRcdDogcHJlZmVyZW5jZS5wcm92aWRlcklkO1xuXG5cdFx0TWVzc2FnZUNvbnRyb2xsZXIuZ2V0KHRoaXMuX2VkaXRvcik/LnNob3dNZXNzYWdlKGxvY2FsaXplKCdwYXN0ZUFzRXJyb3InLCBcIk5vIHBhc3RlIGVkaXRzIGZvciAnezB9JyBmb3VuZFwiLCBraW5kTGFiZWwpLCBzZWxlY3Rpb25zWzBdLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cdH1cblxuXHRwcml2YXRlIGRvUGFzdGVJbmxpbmUoYWxsUHJvdmlkZXJzOiByZWFkb25seSBEb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyW10sIHNlbGVjdGlvbnM6IHJlYWRvbmx5IFNlbGVjdGlvbltdLCBkYXRhVHJhbnNmZXI6IFZTRGF0YVRyYW5zZmVyLCBtZXRhZGF0YTogQ29weU1ldGFkYXRhIHwgdW5kZWZpbmVkLCBjbGlwYm9hcmRFdmVudDogQ2xpcGJvYXJkRXZlbnQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdDb3B5UGFzdGVDb250cm9sbGVyI2RvUGFzdGVJbmxpbmUnKTtcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9lZGl0b3I7XG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvclN0YXRlQ3RzID0gbmV3IEVkaXRvclN0YXRlQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoZWRpdG9yLCBDb2RlRWRpdG9yU3RhdGVGbGFnLlZhbHVlIHwgQ29kZUVkaXRvclN0YXRlRmxhZy5TZWxlY3Rpb24sIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBwID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoYXN5bmMgKHBUb2tlbikgPT4ge1xuXHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5fZWRpdG9yO1xuXHRcdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IGN0cyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UocFRva2VuKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZWRpdG9yU3RhdGVDdHMudG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gY3RzLmNhbmNlbCgpKSk7XG5cblx0XHRcdGNvbnN0IHRva2VuID0gY3RzLnRva2VuO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5tZXJnZUluRGF0YUZyb21Db3B5KGFsbFByb3ZpZGVycywgZGF0YVRyYW5zZmVyLCBtZXRhZGF0YSwgdG9rZW4pO1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzdXBwb3J0ZWRQcm92aWRlcnMgPSBhbGxQcm92aWRlcnMuZmlsdGVyKHByb3ZpZGVyID0+IHRoaXMuaXNTdXBwb3J0ZWRQYXN0ZVByb3ZpZGVyKHByb3ZpZGVyLCBkYXRhVHJhbnNmZXIpKTtcblx0XHRcdFx0aWYgKCFzdXBwb3J0ZWRQcm92aWRlcnMubGVuZ3RoXG5cdFx0XHRcdFx0fHwgKHN1cHBvcnRlZFByb3ZpZGVycy5sZW5ndGggPT09IDEgJiYgc3VwcG9ydGVkUHJvdmlkZXJzWzBdIGluc3RhbmNlb2YgRGVmYXVsdFRleHRQYXN0ZU9yRHJvcEVkaXRQcm92aWRlcikgLy8gT25seSBvdXIgZGVmYXVsdCB0ZXh0IHByb3ZpZGVyIGlzIGFjdGl2ZVxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5hcHBseURlZmF1bHRQYXN0ZUhhbmRsZXIoZGF0YVRyYW5zZmVyLCBtZXRhZGF0YSwgdG9rZW4sIGNsaXBib2FyZEV2ZW50KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGNvbnRleHQ6IERvY3VtZW50UGFzdGVDb250ZXh0ID0ge1xuXHRcdFx0XHRcdHRyaWdnZXJLaW5kOiBEb2N1bWVudFBhc3RlVHJpZ2dlcktpbmQuQXV0b21hdGljLFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IGVkaXRTZXNzaW9uID0gYXdhaXQgdGhpcy5nZXRQYXN0ZUVkaXRzKHN1cHBvcnRlZFByb3ZpZGVycywgZGF0YVRyYW5zZmVyLCBtb2RlbCwgc2VsZWN0aW9ucywgY29udGV4dCwgdG9rZW4pO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoZWRpdFNlc3Npb24pO1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBJZiB0aGUgb25seSBlZGl0IHJldHVybmVkIGlzIG91ciBkZWZhdWx0IHRleHQgZWRpdCwgdXNlIHRoZSBkZWZhdWx0IHBhc3RlIGhhbmRsZXJcblx0XHRcdFx0aWYgKGVkaXRTZXNzaW9uLmVkaXRzLmxlbmd0aCA9PT0gMSAmJiBlZGl0U2Vzc2lvbi5lZGl0c1swXS5wcm92aWRlciBpbnN0YW5jZW9mIERlZmF1bHRUZXh0UGFzdGVPckRyb3BFZGl0UHJvdmlkZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5hcHBseURlZmF1bHRQYXN0ZUhhbmRsZXIoZGF0YVRyYW5zZmVyLCBtZXRhZGF0YSwgdG9rZW4sIGNsaXBib2FyZEV2ZW50KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChlZGl0U2Vzc2lvbi5lZGl0cy5sZW5ndGgpIHtcblx0XHRcdFx0XHRjb25zdCBjYW5TaG93V2lkZ2V0ID0gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ucGFzdGVBcykuc2hvd1Bhc3RlU2VsZWN0b3IgPT09ICdhZnRlclBhc3RlJztcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fcG9zdFBhc3RlV2lkZ2V0TWFuYWdlci5hcHBseUVkaXRBbmRTaG93SWZOZWVkZWQoc2VsZWN0aW9ucywgeyBhY3RpdmVFZGl0SW5kZXg6IHRoaXMuZ2V0SW5pdGlhbEFjdGl2ZUVkaXRJbmRleChtb2RlbCwgZWRpdFNlc3Npb24uZWRpdHMpLCBhbGxFZGl0czogZWRpdFNlc3Npb24uZWRpdHMgfSwgY2FuU2hvd1dpZGdldCwgYXN5bmMgKGVkaXQsIHJlc29sdmVUb2tlbikgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCFlZGl0LnByb3ZpZGVyLnJlc29sdmVEb2N1bWVudFBhc3RlRWRpdCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZWRpdDtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgcmVzb2x2ZVAgPSBlZGl0LnByb3ZpZGVyLnJlc29sdmVEb2N1bWVudFBhc3RlRWRpdChlZGl0LCByZXNvbHZlVG9rZW4pO1xuXHRcdFx0XHRcdFx0Y29uc3Qgc2hvd1AgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRcdFx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHRoaXMuX3Bhc3RlUHJvZ3Jlc3NNYW5hZ2VyLnNob3dXaGlsZShzZWxlY3Rpb25zWzBdLmdldEVuZFBvc2l0aW9uKCksIGxvY2FsaXplKCdyZXNvbHZlUHJvY2VzcycsIFwiUmVzb2x2aW5nIHBhc3RlIGVkaXQgZm9yICd7MH0nLiBDbGljayB0byBjYW5jZWxcIiwgZWRpdC50aXRsZSksIHJhY2VDYW5jZWxsYXRpb24oUHJvbWlzZS5yYWNlKFtzaG93UC5wLCByZXNvbHZlUF0pLCByZXNvbHZlVG9rZW4pLCB7XG5cdFx0XHRcdFx0XHRcdGNhbmNlbDogKCkgPT4gc2hvd1AuY2FuY2VsKClcblx0XHRcdFx0XHRcdH0sIDApO1xuXG5cdFx0XHRcdFx0XHRpZiAocmVzb2x2ZWQpIHtcblx0XHRcdFx0XHRcdFx0ZWRpdC5pbnNlcnRUZXh0ID0gcmVzb2x2ZWQuaW5zZXJ0VGV4dDtcblx0XHRcdFx0XHRcdFx0ZWRpdC5hZGRpdGlvbmFsRWRpdCA9IHJlc29sdmVkLmFkZGl0aW9uYWxFZGl0O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIGVkaXQ7XG5cdFx0XHRcdFx0fSwgdG9rZW4pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXdhaXQgdGhpcy5hcHBseURlZmF1bHRQYXN0ZUhhbmRsZXIoZGF0YVRyYW5zZmVyLCBtZXRhZGF0YSwgdG9rZW4sIGNsaXBib2FyZEV2ZW50KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRQYXN0ZU9wZXJhdGlvbiA9PT0gcCkge1xuXHRcdFx0XHRcdHRoaXMuX2N1cnJlbnRQYXN0ZU9wZXJhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcGFzdGVQcm9ncmVzc01hbmFnZXIuc2hvd1doaWxlKHNlbGVjdGlvbnNbMF0uZ2V0RW5kUG9zaXRpb24oKSwgbG9jYWxpemUoJ3Bhc3RlSW50b0VkaXRvclByb2dyZXNzJywgXCJSdW5uaW5nIHBhc3RlIGhhbmRsZXJzLiBDbGljayB0byBjYW5jZWwgYW5kIGRvIGJhc2ljIHBhc3RlXCIpLCBwLCB7XG5cdFx0XHRjYW5jZWw6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0cC5jYW5jZWwoKTtcblx0XHRcdFx0aWYgKGVkaXRvclN0YXRlQ3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXdhaXQgdGhpcy5hcHBseURlZmF1bHRQYXN0ZUhhbmRsZXIoZGF0YVRyYW5zZmVyLCBtZXRhZGF0YSwgZWRpdG9yU3RhdGVDdHMudG9rZW4sIGNsaXBib2FyZEV2ZW50KTtcblx0XHRcdH1cblx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdGVkaXRvclN0YXRlQ3RzLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0XHR0aGlzLl9jdXJyZW50UGFzdGVPcGVyYXRpb24gPSBwO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG93UGFzdGVBc1BpY2socHJlZmVyZW5jZTogUGFzdGVQcmVmZXJlbmNlIHwgdW5kZWZpbmVkLCBhbGxQcm92aWRlcnM6IHJlYWRvbmx5IERvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXJbXSwgc2VsZWN0aW9uczogcmVhZG9ubHkgU2VsZWN0aW9uW10sIGRhdGFUcmFuc2ZlcjogVlNEYXRhVHJhbnNmZXIsIG1ldGFkYXRhOiBDb3B5TWV0YWRhdGEgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdDb3B5UGFzdGVDb250cm9sbGVyI3Nob3dQYXN0ZUFzUGljaycpO1xuXHRcdGNvbnN0IHAgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZShhc3luYyAodG9rZW4pID0+IHtcblx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuX2VkaXRvcjtcblx0XHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblxuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCB0b2tlblNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRWRpdG9yU3RhdGVDYW5jZWxsYXRpb25Ub2tlblNvdXJjZShlZGl0b3IsIENvZGVFZGl0b3JTdGF0ZUZsYWcuVmFsdWUgfCBDb2RlRWRpdG9yU3RhdGVGbGFnLlNlbGVjdGlvbiwgdW5kZWZpbmVkLCB0b2tlbikpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5tZXJnZUluRGF0YUZyb21Db3B5KGFsbFByb3ZpZGVycywgZGF0YVRyYW5zZmVyLCBtZXRhZGF0YSwgdG9rZW5Tb3VyY2UudG9rZW4pO1xuXHRcdFx0XHRpZiAodG9rZW5Tb3VyY2UudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBGaWx0ZXIgb3V0IGFueSBwcm92aWRlcnMgdGhlIGRvbid0IG1hdGNoIHRoZSBmdWxsIGRhdGEgdHJhbnNmZXIgd2Ugd2lsbCBzZW5kIHRoZW0uXG5cdFx0XHRcdGxldCBzdXBwb3J0ZWRQcm92aWRlcnMgPSBhbGxQcm92aWRlcnMuZmlsdGVyKHByb3ZpZGVyID0+IHRoaXMuaXNTdXBwb3J0ZWRQYXN0ZVByb3ZpZGVyKHByb3ZpZGVyLCBkYXRhVHJhbnNmZXIsIHByZWZlcmVuY2UpKTtcblx0XHRcdFx0aWYgKHByZWZlcmVuY2UpIHtcblx0XHRcdFx0XHQvLyBXZSBhcmUgbG9va2luZyBmb3IgYSBzcGVjaWZpYyBlZGl0XG5cdFx0XHRcdFx0c3VwcG9ydGVkUHJvdmlkZXJzID0gc3VwcG9ydGVkUHJvdmlkZXJzLmZpbHRlcihwcm92aWRlciA9PiB0aGlzLnByb3ZpZGVyTWF0Y2hlc1ByZWZlcmVuY2UocHJvdmlkZXIsIHByZWZlcmVuY2UpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGNvbnRleHQ6IERvY3VtZW50UGFzdGVDb250ZXh0ID0ge1xuXHRcdFx0XHRcdHRyaWdnZXJLaW5kOiBEb2N1bWVudFBhc3RlVHJpZ2dlcktpbmQuUGFzdGVBcyxcblx0XHRcdFx0XHRvbmx5OiBwcmVmZXJlbmNlICYmICdvbmx5JyBpbiBwcmVmZXJlbmNlID8gcHJlZmVyZW5jZS5vbmx5IDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRsZXQgZWRpdFNlc3Npb24gPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgdGhpcy5nZXRQYXN0ZUVkaXRzKHN1cHBvcnRlZFByb3ZpZGVycywgZGF0YVRyYW5zZmVyLCBtb2RlbCwgc2VsZWN0aW9ucywgY29udGV4dCwgdG9rZW5Tb3VyY2UudG9rZW4pKTtcblx0XHRcdFx0aWYgKHRva2VuU291cmNlLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRmlsdGVyIG91dCBhbnkgZWRpdHMgdGhhdCBkb24ndCBtYXRjaCB0aGUgcmVxdWVzdGVkIGtpbmRcblx0XHRcdFx0aWYgKHByZWZlcmVuY2UpIHtcblx0XHRcdFx0XHRlZGl0U2Vzc2lvbiA9IHtcblx0XHRcdFx0XHRcdGVkaXRzOiBlZGl0U2Vzc2lvbi5lZGl0cy5maWx0ZXIoZWRpdCA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmICgnb25seScgaW4gcHJlZmVyZW5jZSkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBwcmVmZXJlbmNlLm9ubHkuY29udGFpbnMoZWRpdC5raW5kKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIGlmICgncHJlZmVyZW5jZXMnIGluIHByZWZlcmVuY2UpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gcHJlZmVyZW5jZS5wcmVmZXJlbmNlcy5zb21lKHByZWZlcmVuY2UgPT4gcHJlZmVyZW5jZS5jb250YWlucyhlZGl0LmtpbmQpKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gcHJlZmVyZW5jZS5wcm92aWRlcklkID09PSBlZGl0LnByb3ZpZGVyLmlkO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRcdGRpc3Bvc2U6IGVkaXRTZXNzaW9uLmRpc3Bvc2Vcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFlZGl0U2Vzc2lvbi5lZGl0cy5sZW5ndGgpIHtcblx0XHRcdFx0XHRpZiAocHJlZmVyZW5jZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5zaG93UGFzdGVBc05vRWRpdE1lc3NhZ2Uoc2VsZWN0aW9ucywgcHJlZmVyZW5jZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBwaWNrZWRFZGl0OiBEb2N1bWVudFBhc3RlRWRpdCB8IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHByZWZlcmVuY2UpIHtcblx0XHRcdFx0XHRwaWNrZWRFZGl0ID0gZWRpdFNlc3Npb24uZWRpdHMuYXQoMCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dHlwZSBJdGVtV2l0aEVkaXQgPSBJUXVpY2tQaWNrSXRlbSAmIHsgZWRpdD86IERvY3VtZW50UGFzdGVFZGl0IH07XG5cdFx0XHRcdFx0Y29uc3QgY29uZmlndXJlRGVmYXVsdEl0ZW06IEl0ZW1XaXRoRWRpdCA9IHtcblx0XHRcdFx0XHRcdGlkOiAnZWRpdG9yLnBhc3RlQXMuZGVmYXVsdCcsXG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Bhc3RlQXNEZWZhdWx0JywgXCJDb25maWd1cmUgZGVmYXVsdCBwYXN0ZSBhY3Rpb25cIiksXG5cdFx0XHRcdFx0XHRlZGl0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdGVkID0gYXdhaXQgdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UucGljazxJdGVtV2l0aEVkaXQ+KFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQuLi5lZGl0U2Vzc2lvbi5lZGl0cy5tYXAoKGVkaXQpOiBJdGVtV2l0aEVkaXQgPT4gKHtcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogZWRpdC50aXRsZSxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZWRpdC5raW5kPy52YWx1ZSxcblx0XHRcdFx0XHRcdFx0XHRlZGl0LFxuXHRcdFx0XHRcdFx0XHR9KSksXG5cdFx0XHRcdFx0XHRcdC4uLihDb3B5UGFzdGVDb250cm9sbGVyLl9jb25maWd1cmVEZWZhdWx0QWN0aW9uID8gW1xuXHRcdFx0XHRcdFx0XHRcdHVwY2FzdDxJUXVpY2tQaWNrU2VwYXJhdG9yPih7IHR5cGU6ICdzZXBhcmF0b3InIH0pLFxuXHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBDb3B5UGFzdGVDb250cm9sbGVyLl9jb25maWd1cmVEZWZhdWx0QWN0aW9uLmxhYmVsLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZWRpdDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XSA6IFtdKVxuXHRcdFx0XHRcdFx0XSwge1xuXHRcdFx0XHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdwYXN0ZUFzUGlja2VyUGxhY2Vob2xkZXInLCBcIlNlbGVjdCBQYXN0ZSBBY3Rpb25cIiksXG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRpZiAoc2VsZWN0ZWQgPT09IGNvbmZpZ3VyZURlZmF1bHRJdGVtKSB7XG5cdFx0XHRcdFx0XHRDb3B5UGFzdGVDb250cm9sbGVyLl9jb25maWd1cmVEZWZhdWx0QWN0aW9uPy5ydW4oKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRwaWNrZWRFZGl0ID0gc2VsZWN0ZWQ/LmVkaXQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIXBpY2tlZEVkaXQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjb21iaW5lZFdvcmtzcGFjZUVkaXQgPSBjcmVhdGVDb21iaW5lZFdvcmtzcGFjZUVkaXQobW9kZWwudXJpLCBzZWxlY3Rpb25zLCBwaWNrZWRFZGl0KTtcblx0XHRcdFx0YXdhaXQgdGhpcy5fYnVsa0VkaXRTZXJ2aWNlLmFwcGx5KGNvbWJpbmVkV29ya3NwYWNlRWRpdCwgeyBlZGl0b3I6IHRoaXMuX2VkaXRvciB9KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRQYXN0ZU9wZXJhdGlvbiA9PT0gcCkge1xuXHRcdFx0XHRcdHRoaXMuX2N1cnJlbnRQYXN0ZU9wZXJhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7XG5cdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5XaW5kb3csXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3Bhc3RlQXNQcm9ncmVzcycsIFwiUnVubmluZyBwYXN0ZSBoYW5kbGVyc1wiKSxcblx0XHR9LCAoKSA9PiBwKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0Q29weU1ldGFkYXRhKGNsaXBib2FyZERhdGE6IElXcml0YWJsZUNsaXBib2FyZERhdGEsIG1ldGFkYXRhOiBDb3B5TWV0YWRhdGEpIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdDb3B5UGFzdGVDb250cm9sbGVyI3NldENvcHlNZXRhZGF0YSBuZXcgaWQgOiAnLCBtZXRhZGF0YS5pZCk7XG5cdFx0Y2xpcGJvYXJkRGF0YS5zZXREYXRhKHZzY29kZUNsaXBib2FyZE1pbWUsIEpTT04uc3RyaW5naWZ5KG1ldGFkYXRhKSk7XG5cdH1cblxuXHRwcml2YXRlIGZldGNoQ29weU1ldGFkYXRhKGU6IElDbGlwYm9hcmRQYXN0ZUV2ZW50KTogQ29weU1ldGFkYXRhIHwgdW5kZWZpbmVkIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdDb3B5UGFzdGVDb250cm9sbGVyI2ZldGNoQ29weU1ldGFkYXRhJyk7XG5cblx0XHQvLyBQcmVmZXIgdXNpbmcgdGhlIGNsaXBib2FyZCBkYXRhIHdlIHNhdmVkIG9mZlxuXHRcdGNvbnN0IHJhd01ldGFkYXRhID0gZS5jbGlwYm9hcmREYXRhLmdldERhdGEodnNjb2RlQ2xpcGJvYXJkTWltZSk7XG5cdFx0aWYgKHJhd01ldGFkYXRhKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShyYXdNZXRhZGF0YSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZS5tZXRhZGF0YSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGVmYXVsdFBhc3RlUGF5bG9hZDoge1xuXHRcdFx0XHRcdG1vZGU6IGUubWV0YWRhdGEubW9kZSxcblx0XHRcdFx0XHRtdWx0aWN1cnNvclRleHQ6IGUubWV0YWRhdGEubXVsdGljdXJzb3JUZXh0ID8/IG51bGwsXG5cdFx0XHRcdFx0cGFzdGVPbk5ld0xpbmU6ICEhZS5tZXRhZGF0YS5pc0Zyb21FbXB0eVNlbGVjdGlvbixcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbWVyZ2VJbkRhdGFGcm9tQ29weShhbGxQcm92aWRlcnM6IHJlYWRvbmx5IERvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXJbXSwgZGF0YVRyYW5zZmVyOiBWU0RhdGFUcmFuc2ZlciwgbWV0YWRhdGE6IENvcHlNZXRhZGF0YSB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnQ29weVBhc3RlQ29udHJvbGxlciNtZXJnZUluRGF0YUZyb21Db3B5IHdpdGggbWV0YWRhdGEgOiAnLCBtZXRhZGF0YT8uaWQpO1xuXHRcdGlmIChtZXRhZGF0YT8uaWQgJiYgQ29weVBhc3RlQ29udHJvbGxlci5fY3VycmVudENvcHlPcGVyYXRpb24/LmhhbmRsZSA9PT0gbWV0YWRhdGEuaWQpIHtcblx0XHRcdC8vIE9ubHkgcmVzb2x2ZSBwcm92aWRlcnMgdGhhdCBoYXZlIGRhdGEgd2UgbWF5IGNhcmUgYWJvdXRcblx0XHRcdGNvbnN0IHRvUmVzb2x2ZSA9IENvcHlQYXN0ZUNvbnRyb2xsZXIuX2N1cnJlbnRDb3B5T3BlcmF0aW9uLm9wZXJhdGlvbnNcblx0XHRcdFx0LmZpbHRlcihvcCA9PiBhbGxQcm92aWRlcnMuc29tZShwcm92aWRlciA9PiBwcm92aWRlci5wYXN0ZU1pbWVUeXBlcy5zb21lKHR5cGUgPT4gbWF0Y2hlc01pbWVUeXBlKHR5cGUsIG9wLnByb3ZpZGVyTWltZVR5cGVzKSkpKVxuXHRcdFx0XHQubWFwKG9wID0+IG9wLm9wZXJhdGlvbik7XG5cblx0XHRcdGNvbnN0IHRvTWVyZ2VSZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwodG9SZXNvbHZlKTtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIFZhbHVlcyBmcm9tIGhpZ2hlciBwcmlvcml0eSBwcm92aWRlcnMgc2hvdWxkIG92ZXJ3cml0ZSB2YWx1ZXMgZnJvbSBsb3dlciBwcmlvcml0eSBvbmVzLlxuXHRcdFx0Ly8gUmV2ZXJzZSB0aGUgYXJyYXkgdG8gc28gdGhhdCB0aGUgY2FsbHMgdG8gYERhdGFUcmFuc2Zlci5yZXBsYWNlYCBsYXRlciB3aWxsIGRvIHRoaXNcblx0XHRcdGZvciAoY29uc3QgdG9NZXJnZURhdGEgb2YgdG9NZXJnZVJlc3VsdHMucmV2ZXJzZSgpKSB7XG5cdFx0XHRcdGlmICh0b01lcmdlRGF0YSkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHRvTWVyZ2VEYXRhKSB7XG5cdFx0XHRcdFx0XHRkYXRhVHJhbnNmZXIucmVwbGFjZShrZXksIHZhbHVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWRhdGFUcmFuc2Zlci5oYXMoTWltZXMudXJpTGlzdCkpIHtcblx0XHRcdGNvbnN0IHJlc291cmNlcyA9IGF3YWl0IHRoaXMuX2NsaXBib2FyZFNlcnZpY2UucmVhZFJlc291cmNlcygpO1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlc291cmNlcy5sZW5ndGgpIHtcblx0XHRcdFx0ZGF0YVRyYW5zZmVyLmFwcGVuZChNaW1lcy51cmlMaXN0LCBjcmVhdGVTdHJpbmdEYXRhVHJhbnNmZXJJdGVtKFVyaUxpc3QuY3JlYXRlKHJlc291cmNlcykpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFBhc3RlRWRpdHMocHJvdmlkZXJzOiByZWFkb25seSBEb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyW10sIGRhdGFUcmFuc2ZlcjogVlNEYXRhVHJhbnNmZXIsIG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb25zOiByZWFkb25seSBTZWxlY3Rpb25bXSwgY29udGV4dDogRG9jdW1lbnRQYXN0ZUNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8RG9jdW1lbnRQYXN0ZVdpdGhQcm92aWRlckVkaXRzU2Vzc2lvbj4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IHJhY2VDYW5jZWxsYXRpb24oXG5cdFx0XHRQcm9taXNlLmFsbChwcm92aWRlcnMubWFwKGFzeW5jIHByb3ZpZGVyID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBlZGl0cyA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVEb2N1bWVudFBhc3RlRWRpdHM/Lihtb2RlbCwgc2VsZWN0aW9ucywgZGF0YVRyYW5zZmVyLCBjb250ZXh0LCB0b2tlbik7XG5cdFx0XHRcdFx0aWYgKGVkaXRzKSB7XG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoZWRpdHMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gZWRpdHM/LmVkaXRzPy5tYXAoZWRpdCA9PiAoeyAuLi5lZGl0LCBwcm92aWRlciB9KSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRcdFx0XHRjb25zb2xlLmVycm9yKGVycik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0pKSxcblx0XHRcdHRva2VuKTtcblx0XHRjb25zdCBlZGl0cyA9IGNvYWxlc2NlKHJlc3VsdHMgPz8gW10pLmZsYXQoKS5maWx0ZXIoZWRpdCA9PiB7XG5cdFx0XHRyZXR1cm4gIWNvbnRleHQub25seSB8fCBjb250ZXh0Lm9ubHkuY29udGFpbnMoZWRpdC5raW5kKTtcblx0XHR9KTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWRpdHM6IHNvcnRFZGl0c0J5WWllbGRUbyhlZGl0cyksXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKClcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhcHBseURlZmF1bHRQYXN0ZUhhbmRsZXIoZGF0YVRyYW5zZmVyOiBWU0RhdGFUcmFuc2ZlciwgbWV0YWRhdGE6IENvcHlNZXRhZGF0YSB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBjbGlwYm9hcmRFdmVudDogQ2xpcGJvYXJkRXZlbnQgfCB1bmRlZmluZWQpIHtcblx0XHRjb25zdCB0ZXh0RGF0YVRyYW5zZmVyID0gZGF0YVRyYW5zZmVyLmdldChNaW1lcy50ZXh0KSA/PyBkYXRhVHJhbnNmZXIuZ2V0KCd0ZXh0Jyk7XG5cdFx0Y29uc3QgdGV4dCA9IChhd2FpdCB0ZXh0RGF0YVRyYW5zZmVyPy5hc1N0cmluZygpKSA/PyAnJztcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwYXlsb2FkOiBQYXN0ZVBheWxvYWQgPSB7XG5cdFx0XHRjbGlwYm9hcmRFdmVudCxcblx0XHRcdHRleHQsXG5cdFx0XHRwYXN0ZU9uTmV3TGluZTogbWV0YWRhdGE/LmRlZmF1bHRQYXN0ZVBheWxvYWQucGFzdGVPbk5ld0xpbmUgPz8gZmFsc2UsXG5cdFx0XHRtdWx0aWN1cnNvclRleHQ6IG1ldGFkYXRhPy5kZWZhdWx0UGFzdGVQYXlsb2FkLm11bHRpY3Vyc29yVGV4dCA/PyBudWxsLFxuXHRcdFx0bW9kZTogbnVsbCxcblx0XHR9O1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ0NvcHlQYXN0ZUNvbnRyb2xsZXIjYXBwbHlEZWZhdWx0UGFzdGVIYW5kbGVyIGZvciBpZCA6ICcsIG1ldGFkYXRhPy5pZCk7XG5cdFx0dGhpcy5fZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5QYXN0ZSwgcGF5bG9hZCk7XG5cdH1cblxuXHQvKipcblx0ICogRmlsdGVyIG91dCBwcm92aWRlcnMgaWYgdGhleTpcblx0ICogLSBEb24ndCBoYW5kbGUgYW55IG9mIHRoZSBkYXRhIHRyYW5zZmVyIHR5cGVzIHdlIGhhdmVcblx0ICogLSBEb24ndCBtYXRjaCB0aGUgcHJlZmVycmVkIHBhc3RlIGtpbmRcblx0ICovXG5cdHByaXZhdGUgaXNTdXBwb3J0ZWRQYXN0ZVByb3ZpZGVyKHByb3ZpZGVyOiBEb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyLCBkYXRhVHJhbnNmZXI6IFZTRGF0YVRyYW5zZmVyLCBwcmVmZXJlbmNlPzogUGFzdGVQcmVmZXJlbmNlKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFwcm92aWRlci5wYXN0ZU1pbWVUeXBlcz8uc29tZSh0eXBlID0+IGRhdGFUcmFuc2Zlci5tYXRjaGVzKHR5cGUpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiAhcHJlZmVyZW5jZSB8fCB0aGlzLnByb3ZpZGVyTWF0Y2hlc1ByZWZlcmVuY2UocHJvdmlkZXIsIHByZWZlcmVuY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBwcm92aWRlck1hdGNoZXNQcmVmZXJlbmNlKHByb3ZpZGVyOiBEb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyLCBwcmVmZXJlbmNlOiBQYXN0ZVByZWZlcmVuY2UpOiBib29sZWFuIHtcblx0XHRpZiAoJ29ubHknIGluIHByZWZlcmVuY2UpIHtcblx0XHRcdHJldHVybiBwcm92aWRlci5wcm92aWRlZFBhc3RlRWRpdEtpbmRzLnNvbWUocHJvdmlkZWRLaW5kID0+IHByZWZlcmVuY2Uub25seS5jb250YWlucyhwcm92aWRlZEtpbmQpKTtcblx0XHR9IGVsc2UgaWYgKCdwcmVmZXJlbmNlcycgaW4gcHJlZmVyZW5jZSkge1xuXHRcdFx0cmV0dXJuIHByb3ZpZGVyLnByb3ZpZGVkUGFzdGVFZGl0S2luZHMuc29tZShwcm92aWRlZEtpbmQgPT4gcHJlZmVyZW5jZS5wcmVmZXJlbmNlcy5zb21lKHByZWZlcnJlZEtpbmQgPT4gcHJlZmVycmVkS2luZC5jb250YWlucyhwcm92aWRlZEtpbmQpKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBwcm92aWRlci5pZCA9PT0gcHJlZmVyZW5jZS5wcm92aWRlcklkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0SW5pdGlhbEFjdGl2ZUVkaXRJbmRleChtb2RlbDogSVRleHRNb2RlbCwgZWRpdHM6IHJlYWRvbmx5IERvY3VtZW50UGFzdGVFZGl0W10pOiBudW1iZXIge1xuXHRcdGNvbnN0IHByZWZlcnJlZFByb3ZpZGVycyA9IHRoaXMuX2NvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8UHJlZmVycmVkUGFzdGVDb25maWd1cmF0aW9uW10+KHBhc3RlQXNQcmVmZXJlbmNlQ29uZmlnLCB7IHJlc291cmNlOiBtb2RlbC51cmkgfSk7XG5cdFx0Zm9yIChjb25zdCBjb25maWcgb2YgQXJyYXkuaXNBcnJheShwcmVmZXJyZWRQcm92aWRlcnMpID8gcHJlZmVycmVkUHJvdmlkZXJzIDogW10pIHtcblx0XHRcdGNvbnN0IGRlc2lyZWRLaW5kID0gbmV3IEhpZXJhcmNoaWNhbEtpbmQoY29uZmlnKTtcblx0XHRcdGNvbnN0IGVkaXRJbmRleCA9IGVkaXRzLmZpbmRJbmRleChlZGl0ID0+IGRlc2lyZWRLaW5kLmNvbnRhaW5zKGVkaXQua2luZCkpO1xuXHRcdFx0aWYgKGVkaXRJbmRleCA+PSAwKSB7XG5cdFx0XHRcdHJldHVybiBlZGl0SW5kZXg7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIDA7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxnQkFBZ0I7QUFDekIsU0FBNEIseUJBQXlCLGlCQUFpQix3QkFBd0I7QUFDOUYsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsOEJBQXVELGlCQUFpQixTQUFTLHNCQUFzQjtBQUNoSCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FB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QUE0QztBQUM5SyxVQUFNLG1CQUFtQixhQUFhLElBQUksTUFBTSxJQUFJLEtBQUssYUFBYSxJQUFJLE1BQU07QUFDaEYsVUFBTSxPQUFRLE1BQU0sa0JBQWtCLFNBQVMsS0FBTTtBQUNyRCxRQUFJLE1BQU0seUJBQXlCO0FBQ2xDO0FBQUEsSUFDRDtBQUVBLFVBQU0sVUFBd0I7QUFBQSxNQUM3QjtBQUFBLE1BQ0E7QUFBQSxNQUNBLGdCQUFnQixVQUFVLG9CQUFvQixrQkFBa0I7QUFBQSxNQUNoRSxpQkFBaUIsVUFBVSxvQkFBb0IsbUJBQW1CO0FBQUEsTUFDbEUsTUFBTTtBQUFBLElBQ1A7QUFDQSxTQUFLLFlBQVksTUFBTSwwREFBMEQsVUFBVSxFQUFFO0FBQzdGLFNBQUssUUFBUSxRQUFRLFlBQVksUUFBUSxPQUFPLE9BQU87QUFBQSxFQUN4RDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9RLHlCQUF5QixVQUFxQyxjQUE4QixZQUF1QztBQUMxSSxRQUFJLENBQUMsU0FBUyxnQkFBZ0IsS0FBSyxVQUFRLGFBQWEsUUFBUSxJQUFJLENBQUMsR0FBRztBQUN2RSxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sQ0FBQyxjQUFjLEtBQUssMEJBQTBCLFVBQVUsVUFBVTtBQUFBLEVBQzFFO0FBQUEsRUFFUSwwQkFBMEIsVUFBcUMsWUFBc0M7QUFDNUcsUUFBSSxVQUFVLFlBQVk7QUFDekIsYUFBTyxTQUFTLHVCQUF1QixLQUFLLGtCQUFnQixXQUFXLEtBQUssU0FBUyxZQUFZLENBQUM7QUFBQSxJQUNuRyxXQUFXLGlCQUFpQixZQUFZO0FBQ3ZDLGFBQU8sU0FBUyx1QkFBdUIsS0FBSyxrQkFBZ0IsV0FBVyxZQUFZLEtBQUssbUJBQWlCLGNBQWMsU0FBUyxZQUFZLENBQUMsQ0FBQztBQUFBLElBQy9JLE9BQU87QUFDTixhQUFPLFNBQVMsT0FBTyxXQUFXO0FBQUEsSUFDbkM7QUFBQSxFQUNEO0FBQUEsRUFFUSwwQkFBMEIsT0FBbUIsT0FBNkM7QUFDakcsVUFBTSxxQkFBcUIsS0FBSyxlQUFlLFNBQXdDLHlCQUF5QixFQUFFLFVBQVUsTUFBTSxJQUFJLENBQUM7QUFDdkksZUFBVyxVQUFVLE1BQU0sUUFBUSxrQkFBa0IsSUFBSSxxQkFBcUIsQ0FBQyxHQUFHO0FBQ2pGLFlBQU0sY0FBYyxJQUFJLGlCQUFpQixNQUFNO0FBQy9DLFlBQU0sWUFBWSxNQUFNLFVBQVUsVUFBUSxZQUFZLFNBQVMsS0FBSyxJQUFJLENBQUM7QUFDekUsVUFBSSxhQUFhLEdBQUc7QUFDbkIsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQXZsQmEsb0JBRVcsS0FBSztBQUZoQixzQkFBTjtBQUFBLEVBb0NKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQTVDVTsiLAogICJuYW1lcyI6IFsicHJlZmVyZW5jZSIsICJlZGl0b3IiLCAiZWRpdHMiXQp9Cg==
