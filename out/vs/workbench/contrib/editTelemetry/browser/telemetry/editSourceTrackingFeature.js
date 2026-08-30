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
import { CachedFunction } from "../../../../../base/common/cache.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { autorun, mapObservableArrayCached, derived, observableValue, derivedWithSetter, observableFromEvent } from "../../../../../base/common/observable.js";
import { DynamicCssRules } from "../../../../../editor/browser/editorDom.js";
import { observableCodeEditor } from "../../../../../editor/browser/observableCodeEditor.js";
import { CodeEditorWidget } from "../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { observableConfigValue } from "../../../../../platform/observable/common/platformObservableUtils.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IStatusbarService, StatusbarAlignment } from "../../../../services/statusbar/browser/statusbar.js";
import { EditSourceTrackingImpl } from "./editSourceTrackingImpl.js";
import { DataChannelForwardingTelemetryService } from "../../../../../platform/dataChannel/browser/forwardingTelemetryService.js";
import { EDIT_TELEMETRY_DETAILS_SETTING_ID, EDIT_TELEMETRY_SHOW_DECORATIONS, EDIT_TELEMETRY_SHOW_STATUS_BAR } from "../settings.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { AgentHostEditMarkerService } from "./agentHostEditMarkerService.js";
let EditTrackingFeature = class extends Disposable {
  constructor(_workspace, _annotatedDocuments, _configurationService, _instantiationService, _statusbarService, _editorService, _extensionService) {
    super();
    this._workspace = _workspace;
    this._annotatedDocuments = _annotatedDocuments;
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
    this._statusbarService = _statusbarService;
    this._editorService = _editorService;
    this._extensionService = _extensionService;
    this._showStateInMarkdownDoc = "editTelemetry.showDebugDetails";
    this._toggleDecorations = "editTelemetry.toggleDebugDecorations";
    this._editSourceTrackingShowDecorations = makeSettable(observableConfigValue(EDIT_TELEMETRY_SHOW_DECORATIONS, false, this._configurationService));
    this._editSourceTrackingShowStatusBar = observableConfigValue(EDIT_TELEMETRY_SHOW_STATUS_BAR, false, this._configurationService);
    const editSourceDetailsEnabled = observableConfigValue(EDIT_TELEMETRY_DETAILS_SETTING_ID, false, this._configurationService);
    const extensions = observableFromEvent(this._extensionService.onDidChangeExtensions, () => {
      return this._extensionService.extensions;
    });
    const extensionIds = derived((reader) => new Set(extensions.read(reader).map((e) => e.identifier.value.toLowerCase())));
    function getExtensionInfoObs(extensionId) {
      const extIdLowerCase = extensionId.toLowerCase();
      return derived((reader) => extensionIds.read(reader).has(extIdLowerCase));
    }
    const copilotInstalled = getExtensionInfoObs("GitHub.copilot");
    const copilotChatInstalled = getExtensionInfoObs("GitHub.copilot-chat");
    const shouldSendDetails = derived((reader) => editSourceDetailsEnabled.read(reader) || !!copilotInstalled.read(reader) || !!copilotChatInstalled.read(reader));
    const instantiationServiceWithInterceptedTelemetry = this._instantiationService.createChild(new ServiceCollection(
      [ITelemetryService, this._instantiationService.createInstance(DataChannelForwardingTelemetryService)]
    ));
    const markerService = this._register(instantiationServiceWithInterceptedTelemetry.createInstance(AgentHostEditMarkerService));
    const impl = this._register(instantiationServiceWithInterceptedTelemetry.createInstance(EditSourceTrackingImpl, shouldSendDetails, this._annotatedDocuments, markerService));
    this._register(autorun((reader) => {
      if (!this._editSourceTrackingShowDecorations.read(reader)) {
        return;
      }
      const visibleEditors = observableFromEvent(this, this._editorService.onDidVisibleEditorsChange, () => this._editorService.visibleTextEditorControls);
      mapObservableArrayCached(this, visibleEditors, (editor, store) => {
        if (editor instanceof CodeEditorWidget) {
          const obsEditor = observableCodeEditor(editor);
          const cssStyles = new DynamicCssRules(editor);
          const decorations = new CachedFunction((source) => {
            const r = store.add(cssStyles.createClassNameRef({
              backgroundColor: source.getColor()
            }));
            return r.className;
          });
          store.add(obsEditor.setDecorations(derived((reader2) => {
            const uri = obsEditor.model.read(reader2)?.uri;
            if (!uri) {
              return [];
            }
            const doc = this._workspace.getDocument(uri);
            if (!doc) {
              return [];
            }
            const docsState = impl.docsState.read(reader2).get(doc);
            if (!docsState) {
              return [];
            }
            const ranges = docsState.longtermTracker.read(reader2)?.getTrackedRanges(reader2) ?? [];
            return ranges.map((r) => ({
              range: doc.value.read(void 0).getTransformer().getRange(r.range),
              options: {
                description: "editSourceTracking",
                inlineClassName: decorations.get(r.source)
              }
            }));
          })));
        }
      }).recomputeInitiallyAndOnChange(reader.store);
    }));
    this._register(autorun((reader) => {
      if (!this._editSourceTrackingShowStatusBar.read(reader)) {
        return;
      }
      const statusBarItem = reader.store.add(this._statusbarService.addEntry(
        {
          name: "",
          text: "",
          command: this._showStateInMarkdownDoc,
          tooltip: "Edit Source Tracking",
          ariaLabel: ""
        },
        "editTelemetry",
        StatusbarAlignment.RIGHT,
        100
      ));
      const sumChangedCharacters = derived((reader2) => {
        const docs = impl.docsState.read(reader2);
        let sum = 0;
        for (const state of docs.values()) {
          const t = state.longtermTracker.read(reader2);
          if (!t) {
            continue;
          }
          const d = state.getTelemetryData(t.getTrackedRanges(reader2));
          sum += d.totalModifiedCharactersInFinalState;
        }
        return sum;
      });
      const tooltipMarkdownString = derived((reader2) => {
        const docs = impl.docsState.read(reader2);
        const docsDataInTooltip = [];
        const editSources = [];
        for (const [doc, state] of docs) {
          const tracker = state.longtermTracker.read(reader2);
          if (!tracker) {
            continue;
          }
          const trackedRanges = tracker.getTrackedRanges(reader2);
          const data = state.getTelemetryData(trackedRanges);
          if (data.totalModifiedCharactersInFinalState === 0) {
            continue;
          }
          editSources.push(...trackedRanges.map((r) => r.source));
          const filteredData = Object.fromEntries(
            Object.entries(data).filter(([_, value]) => !(typeof value === "number") || value !== 0)
          );
          docsDataInTooltip.push([
            `### ${doc.uri.fsPath}`,
            "```json",
            JSON.stringify(filteredData, void 0, "	"),
            "```",
            "\n"
          ].join("\n"));
        }
        let tooltipContent;
        if (docsDataInTooltip.length === 0) {
          tooltipContent = "No modified documents";
        } else if (docsDataInTooltip.length <= 3) {
          tooltipContent = docsDataInTooltip.join("\n\n");
        } else {
          const lastThree = docsDataInTooltip.slice(-3);
          tooltipContent = "...\n\n" + lastThree.join("\n\n");
        }
        const agenda = this._createEditSourceAgenda(editSources);
        const tooltipWithCommand = new MarkdownString(tooltipContent + "\n\n[View Details](command:" + this._showStateInMarkdownDoc + ")");
        tooltipWithCommand.appendMarkdown("\n\n" + agenda + "\n\nToggle decorations: [Click here](command:" + this._toggleDecorations + ")");
        tooltipWithCommand.isTrusted = { enabledCommands: [this._toggleDecorations] };
        tooltipWithCommand.supportHtml = true;
        return tooltipWithCommand;
      });
      reader.store.add(autorun((reader2) => {
        statusBarItem.update({
          name: "editTelemetry",
          text: `$(edit) ${sumChangedCharacters.read(reader2)} chars inserted`,
          ariaLabel: `Edit Source Tracking: ${sumChangedCharacters.read(reader2)} modified characters`,
          tooltip: tooltipMarkdownString.read(reader2),
          command: this._showStateInMarkdownDoc
        });
      }));
      reader.store.add(CommandsRegistry.registerCommand(this._toggleDecorations, () => {
        this._editSourceTrackingShowDecorations.set(!this._editSourceTrackingShowDecorations.read(void 0), void 0);
      }));
    }));
  }
  _createEditSourceAgenda(editSources) {
    const editSourcesSeen = /* @__PURE__ */ new Set();
    const editSourceInfo = [];
    for (const editSource of editSources) {
      if (!editSourcesSeen.has(editSource.toString())) {
        editSourcesSeen.add(editSource.toString());
        editSourceInfo.push({ name: editSource.toString(), color: editSource.getColor() });
      }
    }
    const agendaItems = editSourceInfo.map(
      (info) => `<span style="background-color:${info.color};border-radius:3px;">${info.name}</span>`
    );
    return agendaItems.join(" ");
  }
};
EditTrackingFeature = __decorateClass([
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IStatusbarService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IExtensionService)
], EditTrackingFeature);
function makeSettable(obs) {
  const overrideObs = observableValue("overrideObs", void 0);
  return derivedWithSetter(overrideObs, (reader) => {
    return overrideObs.read(reader) ?? obs.read(reader);
  }, (value, tx) => {
    overrideObs.set(value, tx);
  });
}
export {
  EditTrackingFeature
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGVkaXRUZWxlbWV0cnlcXGJyb3dzZXJcXHRlbGVtZXRyeVxcZWRpdFNvdXJjZVRyYWNraW5nRmVhdHVyZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cblxuaW1wb3J0IHsgQ2FjaGVkRnVuY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYWNoZS5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgbWFwT2JzZXJ2YWJsZUFycmF5Q2FjaGVkLCBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlLCBkZXJpdmVkV2l0aFNldHRlciwgb2JzZXJ2YWJsZUZyb21FdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgRHluYW1pY0Nzc1J1bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRG9tLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvb2JzZXJ2YWJsZUNvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2NvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgSU1vZGVsRGVsdGFEZWNvcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVDb25maWdWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL3BsYXRmb3JtT2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVN0YXR1c2JhclNlcnZpY2UsIFN0YXR1c2JhckFsaWdubWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3N0YXR1c2Jhci9icm93c2VyL3N0YXR1c2Jhci5qcyc7XG5pbXBvcnQgeyBFZGl0U291cmNlIH0gZnJvbSAnLi4vaGVscGVycy9kb2N1bWVudFdpdGhBbm5vdGF0ZWRFZGl0cy5qcyc7XG5pbXBvcnQgeyBFZGl0U291cmNlVHJhY2tpbmdJbXBsIH0gZnJvbSAnLi9lZGl0U291cmNlVHJhY2tpbmdJbXBsLmpzJztcbmltcG9ydCB7IElBbm5vdGF0ZWREb2N1bWVudHMgfSBmcm9tICcuLi9oZWxwZXJzL2Fubm90YXRlZERvY3VtZW50cy5qcyc7XG5pbXBvcnQgeyBEYXRhQ2hhbm5lbEZvcndhcmRpbmdUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGF0YUNoYW5uZWwvYnJvd3Nlci9mb3J3YXJkaW5nVGVsZW1ldHJ5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBFRElUX1RFTEVNRVRSWV9ERVRBSUxTX1NFVFRJTkdfSUQsIEVESVRfVEVMRU1FVFJZX1NIT1dfREVDT1JBVElPTlMsIEVESVRfVEVMRU1FVFJZX1NIT1dfU1RBVFVTX0JBUiB9IGZyb20gJy4uL3NldHRpbmdzLmpzJztcbmltcG9ydCB7IFZTQ29kZVdvcmtzcGFjZSB9IGZyb20gJy4uL2hlbHBlcnMvdnNjb2RlT2JzZXJ2YWJsZVdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNsYXNzIEVkaXRUcmFja2luZ0ZlYXR1cmUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0U291cmNlVHJhY2tpbmdTaG93RGVjb3JhdGlvbnM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRTb3VyY2VUcmFja2luZ1Nob3dTdGF0dXNCYXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nob3dTdGF0ZUluTWFya2Rvd25Eb2MgPSAnZWRpdFRlbGVtZXRyeS5zaG93RGVidWdEZXRhaWxzJztcblx0cHJpdmF0ZSByZWFkb25seSBfdG9nZ2xlRGVjb3JhdGlvbnMgPSAnZWRpdFRlbGVtZXRyeS50b2dnbGVEZWJ1Z0RlY29yYXRpb25zJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2U6IFZTQ29kZVdvcmtzcGFjZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9hbm5vdGF0ZWREb2N1bWVudHM6IElBbm5vdGF0ZWREb2N1bWVudHMsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVN0YXR1c2JhclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RhdHVzYmFyU2VydmljZTogSVN0YXR1c2JhclNlcnZpY2UsXG5cblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fZWRpdFNvdXJjZVRyYWNraW5nU2hvd0RlY29yYXRpb25zID0gbWFrZVNldHRhYmxlKG9ic2VydmFibGVDb25maWdWYWx1ZShFRElUX1RFTEVNRVRSWV9TSE9XX0RFQ09SQVRJT05TLCBmYWxzZSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHR0aGlzLl9lZGl0U291cmNlVHJhY2tpbmdTaG93U3RhdHVzQmFyID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlKEVESVRfVEVMRU1FVFJZX1NIT1dfU1RBVFVTX0JBUiwgZmFsc2UsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0U291cmNlRGV0YWlsc0VuYWJsZWQgPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWUoRURJVF9URUxFTUVUUllfREVUQUlMU19TRVRUSU5HX0lELCBmYWxzZSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcy5fZXh0ZW5zaW9uU2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvbnMsICgpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnM7XG5cdFx0fSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWRzID0gZGVyaXZlZChyZWFkZXIgPT4gbmV3IFNldChleHRlbnNpb25zLnJlYWQocmVhZGVyKS5tYXAoZSA9PiBlLmlkZW50aWZpZXIudmFsdWUudG9Mb3dlckNhc2UoKSkpKTtcblx0XHRmdW5jdGlvbiBnZXRFeHRlbnNpb25JbmZvT2JzKGV4dGVuc2lvbklkOiBzdHJpbmcpIHtcblx0XHRcdGNvbnN0IGV4dElkTG93ZXJDYXNlID0gZXh0ZW5zaW9uSWQudG9Mb3dlckNhc2UoKTtcblx0XHRcdHJldHVybiBkZXJpdmVkKHJlYWRlciA9PiBleHRlbnNpb25JZHMucmVhZChyZWFkZXIpLmhhcyhleHRJZExvd2VyQ2FzZSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvcGlsb3RJbnN0YWxsZWQgPSBnZXRFeHRlbnNpb25JbmZvT2JzKCdHaXRIdWIuY29waWxvdCcpO1xuXHRcdGNvbnN0IGNvcGlsb3RDaGF0SW5zdGFsbGVkID0gZ2V0RXh0ZW5zaW9uSW5mb09icygnR2l0SHViLmNvcGlsb3QtY2hhdCcpO1xuXG5cdFx0Y29uc3Qgc2hvdWxkU2VuZERldGFpbHMgPSBkZXJpdmVkKHJlYWRlciA9PiBlZGl0U291cmNlRGV0YWlsc0VuYWJsZWQucmVhZChyZWFkZXIpIHx8ICEhY29waWxvdEluc3RhbGxlZC5yZWFkKHJlYWRlcikgfHwgISFjb3BpbG90Q2hhdEluc3RhbGxlZC5yZWFkKHJlYWRlcikpO1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2VXaXRoSW50ZXJjZXB0ZWRUZWxlbWV0cnkgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbSVRlbGVtZXRyeVNlcnZpY2UsIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERhdGFDaGFubmVsRm9yd2FyZGluZ1RlbGVtZXRyeVNlcnZpY2UpXVxuXHRcdCkpO1xuXHRcdGNvbnN0IG1hcmtlclNlcnZpY2UgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZVdpdGhJbnRlcmNlcHRlZFRlbGVtZXRyeS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RFZGl0TWFya2VyU2VydmljZSkpO1xuXHRcdGNvbnN0IGltcGwgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZVdpdGhJbnRlcmNlcHRlZFRlbGVtZXRyeS5jcmVhdGVJbnN0YW5jZShFZGl0U291cmNlVHJhY2tpbmdJbXBsLCBzaG91bGRTZW5kRGV0YWlscywgdGhpcy5fYW5ub3RhdGVkRG9jdW1lbnRzLCBtYXJrZXJTZXJ2aWNlKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKChyZWFkZXIpID0+IHtcblx0XHRcdGlmICghdGhpcy5fZWRpdFNvdXJjZVRyYWNraW5nU2hvd0RlY29yYXRpb25zLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHZpc2libGVFZGl0b3JzID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9uRGlkVmlzaWJsZUVkaXRvcnNDaGFuZ2UsICgpID0+IHRoaXMuX2VkaXRvclNlcnZpY2UudmlzaWJsZVRleHRFZGl0b3JDb250cm9scyk7XG5cblx0XHRcdG1hcE9ic2VydmFibGVBcnJheUNhY2hlZCh0aGlzLCB2aXNpYmxlRWRpdG9ycywgKGVkaXRvciwgc3RvcmUpID0+IHtcblx0XHRcdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIENvZGVFZGl0b3JXaWRnZXQpIHtcblx0XHRcdFx0XHRjb25zdCBvYnNFZGl0b3IgPSBvYnNlcnZhYmxlQ29kZUVkaXRvcihlZGl0b3IpO1xuXG5cdFx0XHRcdFx0Y29uc3QgY3NzU3R5bGVzID0gbmV3IER5bmFtaWNDc3NSdWxlcyhlZGl0b3IpO1xuXHRcdFx0XHRcdGNvbnN0IGRlY29yYXRpb25zID0gbmV3IENhY2hlZEZ1bmN0aW9uKChzb3VyY2U6IEVkaXRTb3VyY2UpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHIgPSBzdG9yZS5hZGQoY3NzU3R5bGVzLmNyZWF0ZUNsYXNzTmFtZVJlZih7XG5cdFx0XHRcdFx0XHRcdGJhY2tncm91bmRDb2xvcjogc291cmNlLmdldENvbG9yKCksXG5cdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gci5jbGFzc05hbWU7XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRzdG9yZS5hZGQob2JzRWRpdG9yLnNldERlY29yYXRpb25zKGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHVyaSA9IG9ic0VkaXRvci5tb2RlbC5yZWFkKHJlYWRlcik/LnVyaTtcblx0XHRcdFx0XHRcdGlmICghdXJpKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0XHRcdFx0Y29uc3QgZG9jID0gdGhpcy5fd29ya3NwYWNlLmdldERvY3VtZW50KHVyaSk7XG5cdFx0XHRcdFx0XHRpZiAoIWRvYykgeyByZXR1cm4gW107IH1cblx0XHRcdFx0XHRcdGNvbnN0IGRvY3NTdGF0ZSA9IGltcGwuZG9jc1N0YXRlLnJlYWQocmVhZGVyKS5nZXQoZG9jKTtcblx0XHRcdFx0XHRcdGlmICghZG9jc1N0YXRlKSB7IHJldHVybiBbXTsgfVxuXG5cdFx0XHRcdFx0XHRjb25zdCByYW5nZXMgPSAoZG9jc1N0YXRlLmxvbmd0ZXJtVHJhY2tlci5yZWFkKHJlYWRlcik/LmdldFRyYWNrZWRSYW5nZXMocmVhZGVyKSkgPz8gW107XG5cblx0XHRcdFx0XHRcdHJldHVybiByYW5nZXMubWFwPElNb2RlbERlbHRhRGVjb3JhdGlvbj4ociA9PiAoe1xuXHRcdFx0XHRcdFx0XHRyYW5nZTogZG9jLnZhbHVlLnJlYWQodW5kZWZpbmVkKS5nZXRUcmFuc2Zvcm1lcigpLmdldFJhbmdlKHIucmFuZ2UpLFxuXHRcdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdlZGl0U291cmNlVHJhY2tpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGlubGluZUNsYXNzTmFtZTogZGVjb3JhdGlvbnMuZ2V0KHIuc291cmNlKSxcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdH0pKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHJlYWRlci5zdG9yZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9lZGl0U291cmNlVHJhY2tpbmdTaG93U3RhdHVzQmFyLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0YXR1c0Jhckl0ZW0gPSByZWFkZXIuc3RvcmUuYWRkKHRoaXMuX3N0YXR1c2JhclNlcnZpY2UuYWRkRW50cnkoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRuYW1lOiAnJyxcblx0XHRcdFx0XHR0ZXh0OiAnJyxcblx0XHRcdFx0XHRjb21tYW5kOiB0aGlzLl9zaG93U3RhdGVJbk1hcmtkb3duRG9jLFxuXHRcdFx0XHRcdHRvb2x0aXA6ICdFZGl0IFNvdXJjZSBUcmFja2luZycsXG5cdFx0XHRcdFx0YXJpYUxhYmVsOiAnJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRUZWxlbWV0cnknLFxuXHRcdFx0XHRTdGF0dXNiYXJBbGlnbm1lbnQuUklHSFQsXG5cdFx0XHRcdDEwMFxuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IHN1bUNoYW5nZWRDaGFyYWN0ZXJzID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBkb2NzID0gaW1wbC5kb2NzU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRsZXQgc3VtID0gMDtcblx0XHRcdFx0Zm9yIChjb25zdCBzdGF0ZSBvZiBkb2NzLnZhbHVlcygpKSB7XG5cdFx0XHRcdFx0Y29uc3QgdCA9IHN0YXRlLmxvbmd0ZXJtVHJhY2tlci5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0aWYgKCF0KSB7IGNvbnRpbnVlOyB9XG5cdFx0XHRcdFx0Y29uc3QgZCA9IHN0YXRlLmdldFRlbGVtZXRyeURhdGEodC5nZXRUcmFja2VkUmFuZ2VzKHJlYWRlcikpO1xuXHRcdFx0XHRcdHN1bSArPSBkLnRvdGFsTW9kaWZpZWRDaGFyYWN0ZXJzSW5GaW5hbFN0YXRlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBzdW07XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdG9vbHRpcE1hcmtkb3duU3RyaW5nID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBkb2NzID0gaW1wbC5kb2NzU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBkb2NzRGF0YUluVG9vbHRpcDogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0Y29uc3QgZWRpdFNvdXJjZXM6IEVkaXRTb3VyY2VbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtkb2MsIHN0YXRlXSBvZiBkb2NzKSB7XG5cdFx0XHRcdFx0Y29uc3QgdHJhY2tlciA9IHN0YXRlLmxvbmd0ZXJtVHJhY2tlci5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0aWYgKCF0cmFja2VyKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgdHJhY2tlZFJhbmdlcyA9IHRyYWNrZXIuZ2V0VHJhY2tlZFJhbmdlcyhyZWFkZXIpO1xuXHRcdFx0XHRcdGNvbnN0IGRhdGEgPSBzdGF0ZS5nZXRUZWxlbWV0cnlEYXRhKHRyYWNrZWRSYW5nZXMpO1xuXHRcdFx0XHRcdGlmIChkYXRhLnRvdGFsTW9kaWZpZWRDaGFyYWN0ZXJzSW5GaW5hbFN0YXRlID09PSAwKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTsgLy8gRG9uJ3QgaW5jbHVkZSB1bm1vZGlmaWVkIGRvY3VtZW50cyBpbiB0b29sdGlwXG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0ZWRpdFNvdXJjZXMucHVzaCguLi50cmFja2VkUmFuZ2VzLm1hcChyID0+IHIuc291cmNlKSk7XG5cblx0XHRcdFx0XHQvLyBGaWx0ZXIgb3V0IHVubW9kaWZpZWQgcHJvcGVydGllcyBhcyB0aGVzZSBhcmUgbm90IGludGVyZXN0aW5nIHRvIHNlZSBpbiB0aGUgaG92ZXJcblx0XHRcdFx0XHRjb25zdCBmaWx0ZXJlZERhdGEgPSBPYmplY3QuZnJvbUVudHJpZXMoXG5cdFx0XHRcdFx0XHRPYmplY3QuZW50cmllcyhkYXRhKS5maWx0ZXIoKFtfLCB2YWx1ZV0pID0+ICEodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykgfHwgdmFsdWUgIT09IDApXG5cdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdGRvY3NEYXRhSW5Ub29sdGlwLnB1c2goW1xuXHRcdFx0XHRcdFx0YCMjIyAke2RvYy51cmkuZnNQYXRofWAsXG5cdFx0XHRcdFx0XHQnYGBganNvbicsXG5cdFx0XHRcdFx0XHRKU09OLnN0cmluZ2lmeShmaWx0ZXJlZERhdGEsIHVuZGVmaW5lZCwgJ1xcdCcpLFxuXHRcdFx0XHRcdFx0J2BgYCcsXG5cdFx0XHRcdFx0XHQnXFxuJ1xuXHRcdFx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IHRvb2x0aXBDb250ZW50OiBzdHJpbmc7XG5cdFx0XHRcdGlmIChkb2NzRGF0YUluVG9vbHRpcC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHR0b29sdGlwQ29udGVudCA9ICdObyBtb2RpZmllZCBkb2N1bWVudHMnO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGRvY3NEYXRhSW5Ub29sdGlwLmxlbmd0aCA8PSAzKSB7XG5cdFx0XHRcdFx0dG9vbHRpcENvbnRlbnQgPSBkb2NzRGF0YUluVG9vbHRpcC5qb2luKCdcXG5cXG4nKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBsYXN0VGhyZWUgPSBkb2NzRGF0YUluVG9vbHRpcC5zbGljZSgtMyk7XG5cdFx0XHRcdFx0dG9vbHRpcENvbnRlbnQgPSAnLi4uXFxuXFxuJyArIGxhc3RUaHJlZS5qb2luKCdcXG5cXG4nKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGFnZW5kYSA9IHRoaXMuX2NyZWF0ZUVkaXRTb3VyY2VBZ2VuZGEoZWRpdFNvdXJjZXMpO1xuXG5cdFx0XHRcdGNvbnN0IHRvb2x0aXBXaXRoQ29tbWFuZCA9IG5ldyBNYXJrZG93blN0cmluZyh0b29sdGlwQ29udGVudCArICdcXG5cXG5bVmlldyBEZXRhaWxzXShjb21tYW5kOicgKyB0aGlzLl9zaG93U3RhdGVJbk1hcmtkb3duRG9jICsgJyknKTtcblx0XHRcdFx0dG9vbHRpcFdpdGhDb21tYW5kLmFwcGVuZE1hcmtkb3duKCdcXG5cXG4nICsgYWdlbmRhICsgJ1xcblxcblRvZ2dsZSBkZWNvcmF0aW9uczogW0NsaWNrIGhlcmVdKGNvbW1hbmQ6JyArIHRoaXMuX3RvZ2dsZURlY29yYXRpb25zICsgJyknKTtcblx0XHRcdFx0dG9vbHRpcFdpdGhDb21tYW5kLmlzVHJ1c3RlZCA9IHsgZW5hYmxlZENvbW1hbmRzOiBbdGhpcy5fdG9nZ2xlRGVjb3JhdGlvbnNdIH07XG5cdFx0XHRcdHRvb2x0aXBXaXRoQ29tbWFuZC5zdXBwb3J0SHRtbCA9IHRydWU7XG5cblx0XHRcdFx0cmV0dXJuIHRvb2x0aXBXaXRoQ29tbWFuZDtcblx0XHRcdH0pO1xuXG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0c3RhdHVzQmFySXRlbS51cGRhdGUoe1xuXHRcdFx0XHRcdG5hbWU6ICdlZGl0VGVsZW1ldHJ5Jyxcblx0XHRcdFx0XHR0ZXh0OiBgJChlZGl0KSAke3N1bUNoYW5nZWRDaGFyYWN0ZXJzLnJlYWQocmVhZGVyKX0gY2hhcnMgaW5zZXJ0ZWRgLFxuXHRcdFx0XHRcdGFyaWFMYWJlbDogYEVkaXQgU291cmNlIFRyYWNraW5nOiAke3N1bUNoYW5nZWRDaGFyYWN0ZXJzLnJlYWQocmVhZGVyKX0gbW9kaWZpZWQgY2hhcmFjdGVyc2AsXG5cdFx0XHRcdFx0dG9vbHRpcDogdG9vbHRpcE1hcmtkb3duU3RyaW5nLnJlYWQocmVhZGVyKSxcblx0XHRcdFx0XHRjb21tYW5kOiB0aGlzLl9zaG93U3RhdGVJbk1hcmtkb3duRG9jLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pKTtcblxuXHRcdFx0cmVhZGVyLnN0b3JlLmFkZChDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh0aGlzLl90b2dnbGVEZWNvcmF0aW9ucywgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9lZGl0U291cmNlVHJhY2tpbmdTaG93RGVjb3JhdGlvbnMuc2V0KCF0aGlzLl9lZGl0U291cmNlVHJhY2tpbmdTaG93RGVjb3JhdGlvbnMucmVhZCh1bmRlZmluZWQpLCB1bmRlZmluZWQpO1xuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUVkaXRTb3VyY2VBZ2VuZGEoZWRpdFNvdXJjZXM6IEVkaXRTb3VyY2VbXSk6IHN0cmluZyB7XG5cdFx0Ly8gQ29sbGVjdCBhbGwgZWRpdCBzb3VyY2VzIGZyb20gdGhlIHRyYWNrZWQgZG9jdW1lbnRzXG5cdFx0Y29uc3QgZWRpdFNvdXJjZXNTZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgZWRpdFNvdXJjZUluZm8gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVkaXRTb3VyY2Ugb2YgZWRpdFNvdXJjZXMpIHtcblx0XHRcdGlmICghZWRpdFNvdXJjZXNTZWVuLmhhcyhlZGl0U291cmNlLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHRcdGVkaXRTb3VyY2VzU2Vlbi5hZGQoZWRpdFNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0ZWRpdFNvdXJjZUluZm8ucHVzaCh7IG5hbWU6IGVkaXRTb3VyY2UudG9TdHJpbmcoKSwgY29sb3I6IGVkaXRTb3VyY2UuZ2V0Q29sb3IoKSB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBhZ2VuZGFJdGVtcyA9IGVkaXRTb3VyY2VJbmZvLm1hcChpbmZvID0+XG5cdFx0XHRgPHNwYW4gc3R5bGU9XCJiYWNrZ3JvdW5kLWNvbG9yOiR7aW5mby5jb2xvcn07Ym9yZGVyLXJhZGl1czozcHg7XCI+JHtpbmZvLm5hbWV9PC9zcGFuPmBcblx0XHQpO1xuXG5cdFx0cmV0dXJuIGFnZW5kYUl0ZW1zLmpvaW4oJyAnKTtcblx0fVxufVxuXG5mdW5jdGlvbiBtYWtlU2V0dGFibGU8VD4ob2JzOiBJT2JzZXJ2YWJsZTxUPik6IElTZXR0YWJsZU9ic2VydmFibGU8VD4ge1xuXHRjb25zdCBvdmVycmlkZU9icyA9IG9ic2VydmFibGVWYWx1ZTxUIHwgdW5kZWZpbmVkPignb3ZlcnJpZGVPYnMnLCB1bmRlZmluZWQpO1xuXHRyZXR1cm4gZGVyaXZlZFdpdGhTZXR0ZXIob3ZlcnJpZGVPYnMsIChyZWFkZXIpID0+IHtcblx0XHRyZXR1cm4gb3ZlcnJpZGVPYnMucmVhZChyZWFkZXIpID8/IG9icy5yZWFkKHJlYWRlcik7XG5cdH0sICh2YWx1ZSwgdHgpID0+IHtcblx0XHRvdmVycmlkZU9icy5zZXQodmFsdWUsIHR4KTtcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBUywwQkFBMEIsU0FBMkMsaUJBQWlCLG1CQUFtQiwyQkFBMkI7QUFDdEosU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBbUIsMEJBQTBCO0FBRXRELFNBQVMsOEJBQThCO0FBRXZDLFNBQVMsNkNBQTZDO0FBQ3RELFNBQVMsbUNBQW1DLGlDQUFpQyxzQ0FBc0M7QUFFbkgsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQ0FBa0M7QUFFcEMsSUFBTSxzQkFBTixjQUFrQyxXQUFXO0FBQUEsRUFPbkQsWUFDa0IsWUFDQSxxQkFDdUIsdUJBQ0EsdUJBQ0osbUJBRUgsZ0JBQ0csbUJBQ25DO0FBQ0QsVUFBTTtBQVRXO0FBQ0E7QUFDdUI7QUFDQTtBQUNKO0FBRUg7QUFDRztBQVhyQyxTQUFpQiwwQkFBMEI7QUFD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
