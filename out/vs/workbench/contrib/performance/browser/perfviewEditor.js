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
import { localize } from "../../../../nls.js";
import { URI } from "../../../../base/common/uri.js";
import { TextResourceEditorInput } from "../../../common/editor/textResourceEditorInput.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { ILifecycleService, LifecyclePhase, StartupKindToString } from "../../../services/lifecycle/common/lifecycle.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ITimerService } from "../../../services/timer/browser/timerService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { dispose } from "../../../../base/common/lifecycle.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { writeTransientState } from "../../codeEditor/browser/toggleWordWrap.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ByteSize, IFileService } from "../../../../platform/files/common/files.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { isWeb } from "../../../../base/common/platform.js";
import { IFilesConfigurationService } from "../../../services/filesConfiguration/common/filesConfigurationService.js";
import { ITerminalService } from "../../terminal/browser/terminal.js";
import * as perf from "../../../../base/common/performance.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions, getWorkbenchContribution } from "../../../common/contributions.js";
import { ICustomEditorLabelService } from "../../../services/editor/common/customEditorLabelService.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
let PerfviewContrib = class {
  constructor(_instaService, textModelResolverService) {
    this._instaService = _instaService;
    this._inputUri = URI.from({ scheme: "perf", path: "Startup Performance" });
    this._registration = textModelResolverService.registerTextModelContentProvider("perf", _instaService.createInstance(PerfModelContentProvider));
  }
  static get() {
    return getWorkbenchContribution(PerfviewContrib.ID);
  }
  dispose() {
    this._registration.dispose();
  }
  getInputUri() {
    return this._inputUri;
  }
  getEditorInput() {
    return this._instaService.createInstance(PerfviewInput);
  }
};
PerfviewContrib.ID = "workbench.contrib.perfview";
PerfviewContrib = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, ITextModelService)
], PerfviewContrib);
let PerfviewInput = class extends TextResourceEditorInput {
  get typeId() {
    return PerfviewInput.Id;
  }
  constructor(textModelResolverService, textFileService, editorService, fileService, labelService, filesConfigurationService, textResourceConfigurationService, customEditorLabelService) {
    super(
      PerfviewContrib.get().getInputUri(),
      localize("name", "Startup Performance"),
      void 0,
      void 0,
      void 0,
      textModelResolverService,
      textFileService,
      editorService,
      fileService,
      labelService,
      filesConfigurationService,
      textResourceConfigurationService,
      customEditorLabelService
    );
  }
};
PerfviewInput.Id = "PerfviewInput";
PerfviewInput = __decorateClass([
  __decorateParam(0, ITextModelService),
  __decorateParam(1, ITextFileService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IFileService),
  __decorateParam(4, ILabelService),
  __decorateParam(5, IFilesConfigurationService),
  __decorateParam(6, ITextResourceConfigurationService),
  __decorateParam(7, ICustomEditorLabelService)
], PerfviewInput);
let PerfModelContentProvider = class {
  constructor(_modelService, _languageService, _editorService, _lifecycleService, _timerService, _extensionService, _productService, _remoteAgentService, _terminalService) {
    this._modelService = _modelService;
    this._languageService = _languageService;
    this._editorService = _editorService;
    this._lifecycleService = _lifecycleService;
    this._timerService = _timerService;
    this._extensionService = _extensionService;
    this._productService = _productService;
    this._remoteAgentService = _remoteAgentService;
    this._terminalService = _terminalService;
    this._modelDisposables = [];
  }
  provideTextContent(resource) {
    if (!this._model || this._model.isDisposed()) {
      this._modelDisposables = dispose(this._modelDisposables);
      const langId = this._languageService.createById("markdown");
      this._model = this._modelService.getModel(resource) || this._modelService.createModel("Loading...", langId, resource);
      this._modelDisposables.push(langId.onDidChange((e) => {
        this._model?.setLanguage(e);
      }));
      this._modelDisposables.push(this._extensionService.onDidChangeExtensionsStatus(this._updateModel, this));
      writeTransientState(this._model, { wordWrapOverride: "off" }, this._editorService);
    }
    this._updateModel();
    return Promise.resolve(this._model);
  }
  _updateModel() {
    Promise.all([
      this._timerService.whenReady(),
      this._lifecycleService.when(LifecyclePhase.Eventually),
      this._extensionService.whenInstalledExtensionsRegistered(),
      // The terminal service never connects to the pty host on the web
      isWeb && !this._remoteAgentService.getConnection()?.remoteAuthority ? Promise.resolve() : this._terminalService.whenConnected
    ]).then(() => {
      if (this._model && !this._model.isDisposed()) {
        const md = new MarkdownBuilder();
        this._addSummary(md);
        md.blank();
        this._addSummaryTable(md);
        md.blank();
        this._addExtensionsTable(md);
        md.blank();
        this._addPerfMarksTable("Terminal Stats", md, this._timerService.getPerformanceMarks().find((e) => e[0] === "renderer")?.[1].filter((e) => e.name.startsWith("code/terminal/")));
        md.blank();
        this._addAgentHostPerfMarksTable(md);
        md.blank();
        this._addWorkbenchContributionsPerfMarksTable(md);
        md.blank();
        this._addRawPerfMarks(md);
        md.blank();
        this._addResourceTimingStats(md);
        this._model.setValue(md.value);
      }
    });
  }
  _addSummary(md) {
    const metrics = this._timerService.startupMetrics;
    md.heading(2, "System Info");
    md.li(`${this._productService.nameShort}: ${this._productService.version} (${this._productService.commit || "0000000"})`);
    md.li(`OS: ${metrics.platform}(${metrics.release})`);
    if (metrics.cpus) {
      md.li(`CPUs: ${metrics.cpus.model}(${metrics.cpus.count} x ${metrics.cpus.speed})`);
    }
    if (typeof metrics.totalmem === "number" && typeof metrics.freemem === "number") {
      md.li(`Memory(System): ${(metrics.totalmem / ByteSize.GB).toFixed(2)} GB(${(metrics.freemem / ByteSize.GB).toFixed(2)}GB free)`);
    }
    if (metrics.meminfo) {
      md.li(`Memory(Process): ${(metrics.meminfo.workingSetSize / ByteSize.KB).toFixed(2)} MB working set(${(metrics.meminfo.privateBytes / ByteSize.KB).toFixed(2)}MB private, ${(metrics.meminfo.sharedBytes / ByteSize.KB).toFixed(2)}MB shared)`);
    }
    md.li(`VM(likelihood): ${metrics.isVMLikelyhood}%`);
    md.li(`Initial Startup: ${metrics.initialStartup}`);
    md.li(`Has ${metrics.windowCount - 1} other windows`);
    md.li(`Screen Reader Active: ${metrics.hasAccessibilitySupport}`);
    md.li(`Empty Workspace: ${metrics.emptyWorkbench}`);
  }
  _addSummaryTable(md) {
    const metrics = this._timerService.startupMetrics;
    const contribTimings = Registry.as(WorkbenchExtensions.Workbench).timings;
    const table = [];
    table.push(["import(main.js)", metrics.timers.ellapsedLoadMainBundle, "[main]", `initial startup: ${metrics.initialStartup}`]);
    table.push(["start => app.isReady", metrics.timers.ellapsedAppReady, "[main]", `initial startup: ${metrics.initialStartup}`]);
    table.push(["nls:start => nls:end", metrics.timers.ellapsedNlsGeneration, "[main]", `initial startup: ${metrics.initialStartup}`]);
    table.push(["run main.js", metrics.timers.ellapsedRunMainBundle, "[main]", `initial startup: ${metrics.initialStartup}`]);
    table.push(["start crash reporter", metrics.timers.ellapsedCrashReporter, "[main]", `initial startup: ${metrics.initialStartup}`]);
    table.push(["serve main IPC handle", metrics.timers.ellapsedMainServer, "[main]", `initial startup: ${metrics.initialStartup}`]);
    table.push(["create window", metrics.timers.ellapsedWindowCreate, "[main]", `initial startup: ${metrics.initialStartup}, ${metrics.initialStartup ? `state: ${metrics.timers.ellapsedWindowRestoreState}ms, widget: ${metrics.timers.ellapsedBrowserWindowCreate}ms, show: ${metrics.timers.ellapsedWindowMaximize}ms` : ""}`]);
    table.push(["app.isReady => window.loadUrl()", metrics.timers.ellapsedWindowLoad, "[main]", `initial startup: ${metrics.initialStartup}`]);
    table.push(["window.loadUrl() => begin to import(workbench.desktop.main.js)", metrics.timers.ellapsedWindowLoadToRequire, "[main->renderer]", StartupKindToString(metrics.windowKind)]);
    table.push(["import(workbench.desktop.main.js)", metrics.timers.ellapsedRequire, "[renderer]", `cached data: ${metrics.didUseCachedData ? "YES" : "NO"}`]);
    table.push(["wait for window config", metrics.timers.ellapsedWaitForWindowConfig, "[renderer]", void 0]);
    table.push(["init storage (global & workspace)", metrics.timers.ellapsedStorageInit, "[renderer]", void 0]);
    table.push(["init workspace service", metrics.timers.ellapsedWorkspaceServiceInit, "[renderer]", void 0]);
    if (isWeb) {
      table.push(["init settings and global state from settings sync service", metrics.timers.ellapsedRequiredUserDataInit, "[renderer]", void 0]);
      table.push(["init keybindings, snippets & extensions from settings sync service", metrics.timers.ellapsedOtherUserDataInit, "[renderer]", void 0]);
    }
    table.push(["register extensions & spawn extension host", metrics.timers.ellapsedExtensions, "[renderer]", void 0]);
    table.push(["restore primary viewlet", metrics.timers.ellapsedViewletRestore, "[renderer]", metrics.viewletId]);
    table.push(["restore secondary viewlet", metrics.timers.ellapsedAuxiliaryViewletRestore, "[renderer]", metrics.auxiliaryViewletId]);
    table.push(["restore panel", metrics.timers.ellapsedPanelRestore, "[renderer]", metrics.panelId]);
    table.push(["restore & resolve visible editors", metrics.timers.ellapsedEditorRestore, "[renderer]", `${metrics.editorIds.length}: ${metrics.editorIds.join(", ")}`]);
    table.push(["create workbench contributions", metrics.timers.ellapsedWorkbenchContributions, "[renderer]", `${(contribTimings.get(LifecyclePhase.Starting)?.length ?? 0) + (contribTimings.get(LifecyclePhase.Ready)?.length ?? 0)} blocking startup`]);
    table.push(["overall workbench load", metrics.timers.ellapsedWorkbench, "[renderer]", void 0]);
    table.push(["workbench ready", metrics.ellapsed, "[main->renderer]", void 0]);
    table.push(["renderer ready", metrics.timers.ellapsedRenderer, "[renderer]", void 0]);
    table.push(["shared process connection ready", metrics.timers.ellapsedSharedProcesConnected, "[renderer->sharedprocess]", void 0]);
    table.push(["extensions registered", metrics.timers.ellapsedExtensionsReady, "[renderer]", void 0]);
    md.heading(2, "Performance Marks");
    md.table(["What", "Duration", "Process", "Info"], table);
  }
  _addExtensionsTable(md) {
    const eager = [];
    const normal = [];
    const extensionsStatus = this._extensionService.getExtensionsStatus();
    for (const id in extensionsStatus) {
      const { activationTimes: times } = extensionsStatus[id];
      if (!times) {
        continue;
      }
      if (times.activationReason.startup) {
        eager.push([id, times.activationReason.startup, times.codeLoadingTime, times.activateCallTime, times.activateResolvedTime, times.activationReason.activationEvent, times.activationReason.extensionId.value]);
      } else {
        normal.push([id, times.activationReason.startup, times.codeLoadingTime, times.activateCallTime, times.activateResolvedTime, times.activationReason.activationEvent, times.activationReason.extensionId.value]);
      }
    }
    const table = eager.concat(normal);
    if (table.length > 0) {
      md.heading(2, "Extension Activation Stats");
      md.table(
        ["Extension", "Eager", "Load Code", "Call Activate", "Finish Activate", "Event", "By"],
        table
      );
    }
  }
  _addPerfMarksTable(name, md, marks) {
    if (!marks) {
      return;
    }
    const table = [];
    let lastStartTime = -1;
    let total = 0;
    for (const { name: name2, startTime } of marks) {
      const delta = lastStartTime !== -1 ? startTime - lastStartTime : 0;
      total += delta;
      table.push([name2, Math.round(startTime), Math.round(delta), Math.round(total)]);
      lastStartTime = startTime;
    }
    if (name) {
      md.heading(2, name);
    }
    md.table(["Name", "Timestamp", "Delta", "Total"], table);
  }
  _addAgentHostPerfMarksTable(md) {
    const marks = perf.getMarks();
    if (!marks.some((mark) => mark.name.startsWith("code/agentHost/"))) {
      return;
    }
    this._addPerfMarksTable("Agent Host Startup", md, marks.filter((mark) => mark.name === "code/timeOrigin" || mark.name.startsWith("code/agentHost/")));
  }
  _addWorkbenchContributionsPerfMarksTable(md) {
    md.heading(2, "Workbench Contributions Blocking Restore");
    const timings = Registry.as(WorkbenchExtensions.Workbench).timings;
    md.li(`Total (LifecyclePhase.Starting): ${timings.get(LifecyclePhase.Starting)?.length} (${timings.get(LifecyclePhase.Starting)?.reduce((p, c) => p + c[1], 0)}ms)`);
    md.li(`Total (LifecyclePhase.Ready): ${timings.get(LifecyclePhase.Ready)?.length} (${timings.get(LifecyclePhase.Ready)?.reduce((p, c) => p + c[1], 0)}ms)`);
    md.blank();
    const marks = this._timerService.getPerformanceMarks().find((e) => e[0] === "renderer")?.[1].filter(
      (e) => e.name.startsWith("code/willCreateWorkbenchContribution/1") || e.name.startsWith("code/didCreateWorkbenchContribution/1") || e.name.startsWith("code/willCreateWorkbenchContribution/2") || e.name.startsWith("code/didCreateWorkbenchContribution/2")
    );
    this._addPerfMarksTable(void 0, md, marks);
  }
  _addRawPerfMarks(md) {
    for (const [source, marks] of this._timerService.getPerformanceMarks()) {
      md.heading(2, `Raw Perf Marks: ${source}`);
      md.value += "```\n";
      md.value += `Name	Timestamp	Delta	Total
`;
      let lastStartTime = -1;
      let total = 0;
      for (const { name, startTime } of marks) {
        const delta = lastStartTime !== -1 ? startTime - lastStartTime : 0;
        total += delta;
        md.value += `${name}	${startTime}	${delta}	${total}
`;
        lastStartTime = startTime;
      }
      md.value += "```\n";
    }
  }
  _addResourceTimingStats(md) {
    const stats = performance.getEntriesByType("resource").map((entry) => {
      return [entry.name, entry.duration];
    });
    if (!stats.length) {
      return;
    }
    md.heading(2, "Resource Timing Stats");
    md.table(["Name", "Duration"], stats);
  }
};
PerfModelContentProvider = __decorateClass([
  __decorateParam(0, IModelService),
  __decorateParam(1, ILanguageService),
  __decorateParam(2, ICodeEditorService),
  __decorateParam(3, ILifecycleService),
  __decorateParam(4, ITimerService),
  __decorateParam(5, IExtensionService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IRemoteAgentService),
  __decorateParam(8, ITerminalService)
], PerfModelContentProvider);
class MarkdownBuilder {
  constructor() {
    this.value = "";
  }
  heading(level, value) {
    this.value += `${"#".repeat(level)} ${value}

`;
    return this;
  }
  blank() {
    this.value += "\n";
    return this;
  }
  li(value) {
    this.value += `* ${value}
`;
    return this;
  }
  table(header, rows) {
    this.value += this.toMarkdownTable(header, rows);
  }
  toMarkdownTable(header, rows) {
    let result = "";
    const lengths = [];
    header.forEach((cell, ci) => {
      lengths[ci] = cell.length;
    });
    rows.forEach((row) => {
      row.forEach((cell, ci) => {
        if (typeof cell === "undefined") {
          cell = row[ci] = "-";
        }
        const len = cell.toString().length;
        lengths[ci] = Math.max(len, lengths[ci]);
      });
    });
    header.forEach((cell, ci) => {
      result += `| ${cell + " ".repeat(lengths[ci] - cell.toString().length)} `;
    });
    result += "|\n";
    header.forEach((_cell, ci) => {
      result += `| ${"-".repeat(lengths[ci])} `;
    });
    result += "|\n";
    rows.forEach((row) => {
      row.forEach((cell, ci) => {
        if (typeof cell !== "undefined") {
          result += `| ${cell + " ".repeat(lengths[ci] - cell.toString().length)} `;
        }
      });
      result += "|\n";
    });
    return result;
  }
}
export {
  PerfModelContentProvider,
  PerfviewContrib,
  PerfviewInput
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHBlcmZvcm1hbmNlXFxicm93c2VyXFxwZXJmdmlld0VkaXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvdGV4dFJlc291cmNlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UsIElUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgTGlmZWN5Y2xlUGhhc2UsIFN0YXJ0dXBLaW5kVG9TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGltZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGltZXIvYnJvd3Nlci90aW1lclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHdyaXRlVHJhbnNpZW50U3RhdGUgfSBmcm9tICcuLi8uLi9jb2RlRWRpdG9yL2Jyb3dzZXIvdG9nZ2xlV29yZFdyYXAuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQnl0ZVNpemUsIElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsU2VydmljZSB9IGZyb20gJy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0ICogYXMgcGVyZiBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wZXJmb3JtYW5jZS5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hFeHRlbnNpb25zLCBnZXRXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9jdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNsYXNzIFBlcmZ2aWV3Q29udHJpYiB7XG5cblx0c3RhdGljIGdldCgpIHtcblx0XHRyZXR1cm4gZ2V0V29ya2JlbmNoQ29udHJpYnV0aW9uPFBlcmZ2aWV3Q29udHJpYj4oUGVyZnZpZXdDb250cmliLklEKTtcblx0fVxuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5wZXJmdmlldyc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaW5wdXRVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ3BlcmYnLCBwYXRoOiAnU3RhcnR1cCBQZXJmb3JtYW5jZScgfSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlZ2lzdHJhdGlvbjogSURpc3Bvc2FibGU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgdGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb24gPSB0ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2UucmVnaXN0ZXJUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIoJ3BlcmYnLCBfaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFBlcmZNb2RlbENvbnRlbnRQcm92aWRlcikpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXHR9XG5cblx0Z2V0SW5wdXRVcmkoKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5faW5wdXRVcmk7XG5cdH1cblxuXHRnZXRFZGl0b3JJbnB1dCgpOiBQZXJmdmlld0lucHV0IHtcblx0XHRyZXR1cm4gdGhpcy5faW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFBlcmZ2aWV3SW5wdXQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBQZXJmdmlld0lucHV0IGV4dGVuZHMgVGV4dFJlc291cmNlRWRpdG9ySW5wdXQge1xuXG5cdHN0YXRpYyByZWFkb25seSBJZCA9ICdQZXJmdmlld0lucHV0JztcblxuXHRvdmVycmlkZSBnZXQgdHlwZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFBlcmZ2aWV3SW5wdXQuSWQ7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgdGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASVRleHRGaWxlU2VydmljZSB0ZXh0RmlsZVNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIGZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2U6IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2U6IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUN1c3RvbUVkaXRvckxhYmVsU2VydmljZSBjdXN0b21FZGl0b3JMYWJlbFNlcnZpY2U6IElDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoXG5cdFx0XHRQZXJmdmlld0NvbnRyaWIuZ2V0KCkuZ2V0SW5wdXRVcmkoKSxcblx0XHRcdGxvY2FsaXplKCduYW1lJywgXCJTdGFydHVwIFBlcmZvcm1hbmNlXCIpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdFx0dGV4dEZpbGVTZXJ2aWNlLFxuXHRcdFx0ZWRpdG9yU2VydmljZSxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0bGFiZWxTZXJ2aWNlLFxuXHRcdFx0ZmlsZXNDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0Y3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlXG5cdFx0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUGVyZk1vZGVsQ29udGVudFByb3ZpZGVyIGltcGxlbWVudHMgSVRleHRNb2RlbENvbnRlbnRQcm92aWRlciB7XG5cblx0cHJpdmF0ZSBfbW9kZWw6IElUZXh0TW9kZWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX21vZGVsRGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9saWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASVRpbWVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aW1lclNlcnZpY2U6IElUaW1lclNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlXG5cdCkgeyB9XG5cblx0cHJvdmlkZVRleHRDb250ZW50KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElUZXh0TW9kZWw+IHtcblxuXHRcdGlmICghdGhpcy5fbW9kZWwgfHwgdGhpcy5fbW9kZWwuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHR0aGlzLl9tb2RlbERpc3Bvc2FibGVzID0gZGlzcG9zZSh0aGlzLl9tb2RlbERpc3Bvc2FibGVzKTtcblx0XHRcdGNvbnN0IGxhbmdJZCA9IHRoaXMuX2xhbmd1YWdlU2VydmljZS5jcmVhdGVCeUlkKCdtYXJrZG93bicpO1xuXHRcdFx0dGhpcy5fbW9kZWwgPSB0aGlzLl9tb2RlbFNlcnZpY2UuZ2V0TW9kZWwocmVzb3VyY2UpIHx8IHRoaXMuX21vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgnTG9hZGluZy4uLicsIGxhbmdJZCwgcmVzb3VyY2UpO1xuXG5cdFx0XHR0aGlzLl9tb2RlbERpc3Bvc2FibGVzLnB1c2gobGFuZ0lkLm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHR0aGlzLl9tb2RlbD8uc2V0TGFuZ3VhZ2UoZSk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9tb2RlbERpc3Bvc2FibGVzLnB1c2godGhpcy5fZXh0ZW5zaW9uU2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvbnNTdGF0dXModGhpcy5fdXBkYXRlTW9kZWwsIHRoaXMpKTtcblxuXHRcdFx0d3JpdGVUcmFuc2llbnRTdGF0ZSh0aGlzLl9tb2RlbCwgeyB3b3JkV3JhcE92ZXJyaWRlOiAnb2ZmJyB9LCB0aGlzLl9lZGl0b3JTZXJ2aWNlKTtcblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlTW9kZWwoKTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuX21vZGVsKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZU1vZGVsKCk6IHZvaWQge1xuXG5cdFx0UHJvbWlzZS5hbGwoW1xuXHRcdFx0dGhpcy5fdGltZXJTZXJ2aWNlLndoZW5SZWFkeSgpLFxuXHRcdFx0dGhpcy5fbGlmZWN5Y2xlU2VydmljZS53aGVuKExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHkpLFxuXHRcdFx0dGhpcy5fZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKSxcblx0XHRcdC8vIFRoZSB0ZXJtaW5hbCBzZXJ2aWNlIG5ldmVyIGNvbm5lY3RzIHRvIHRoZSBwdHkgaG9zdCBvbiB0aGUgd2ViXG5cdFx0XHRpc1dlYiAmJiAhdGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKT8ucmVtb3RlQXV0aG9yaXR5ID8gUHJvbWlzZS5yZXNvbHZlKCkgOiB0aGlzLl90ZXJtaW5hbFNlcnZpY2Uud2hlbkNvbm5lY3RlZFxuXHRcdF0pLnRoZW4oKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX21vZGVsICYmICF0aGlzLl9tb2RlbC5pc0Rpc3Bvc2VkKCkpIHtcblxuXHRcdFx0XHRjb25zdCBtZCA9IG5ldyBNYXJrZG93bkJ1aWxkZXIoKTtcblx0XHRcdFx0dGhpcy5fYWRkU3VtbWFyeShtZCk7XG5cdFx0XHRcdG1kLmJsYW5rKCk7XG5cdFx0XHRcdHRoaXMuX2FkZFN1bW1hcnlUYWJsZShtZCk7XG5cdFx0XHRcdG1kLmJsYW5rKCk7XG5cdFx0XHRcdHRoaXMuX2FkZEV4dGVuc2lvbnNUYWJsZShtZCk7XG5cdFx0XHRcdG1kLmJsYW5rKCk7XG5cdFx0XHRcdHRoaXMuX2FkZFBlcmZNYXJrc1RhYmxlKCdUZXJtaW5hbCBTdGF0cycsIG1kLCB0aGlzLl90aW1lclNlcnZpY2UuZ2V0UGVyZm9ybWFuY2VNYXJrcygpLmZpbmQoZSA9PiBlWzBdID09PSAncmVuZGVyZXInKT8uWzFdLmZpbHRlcihlID0+IGUubmFtZS5zdGFydHNXaXRoKCdjb2RlL3Rlcm1pbmFsLycpKSk7XG5cdFx0XHRcdG1kLmJsYW5rKCk7XG5cdFx0XHRcdHRoaXMuX2FkZEFnZW50SG9zdFBlcmZNYXJrc1RhYmxlKG1kKTtcblx0XHRcdFx0bWQuYmxhbmsoKTtcblx0XHRcdFx0dGhpcy5fYWRkV29ya2JlbmNoQ29udHJpYnV0aW9uc1BlcmZNYXJrc1RhYmxlKG1kKTtcblx0XHRcdFx0bWQuYmxhbmsoKTtcblx0XHRcdFx0dGhpcy5fYWRkUmF3UGVyZk1hcmtzKG1kKTtcblx0XHRcdFx0bWQuYmxhbmsoKTtcblx0XHRcdFx0dGhpcy5fYWRkUmVzb3VyY2VUaW1pbmdTdGF0cyhtZCk7XG5cblx0XHRcdFx0dGhpcy5fbW9kZWwuc2V0VmFsdWUobWQudmFsdWUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdH1cblxuXHRwcml2YXRlIF9hZGRTdW1tYXJ5KG1kOiBNYXJrZG93bkJ1aWxkZXIpOiB2b2lkIHtcblx0XHRjb25zdCBtZXRyaWNzID0gdGhpcy5fdGltZXJTZXJ2aWNlLnN0YXJ0dXBNZXRyaWNzO1xuXHRcdG1kLmhlYWRpbmcoMiwgJ1N5c3RlbSBJbmZvJyk7XG5cdFx0bWQubGkoYCR7dGhpcy5fcHJvZHVjdFNlcnZpY2UubmFtZVNob3J0fTogJHt0aGlzLl9wcm9kdWN0U2VydmljZS52ZXJzaW9ufSAoJHt0aGlzLl9wcm9kdWN0U2VydmljZS5jb21taXQgfHwgJzAwMDAwMDAnfSlgKTtcblx0XHRtZC5saShgT1M6ICR7bWV0cmljcy5wbGF0Zm9ybX0oJHttZXRyaWNzLnJlbGVhc2V9KWApO1xuXHRcdGlmIChtZXRyaWNzLmNwdXMpIHtcblx0XHRcdG1kLmxpKGBDUFVzOiAke21ldHJpY3MuY3B1cy5tb2RlbH0oJHttZXRyaWNzLmNwdXMuY291bnR9IHggJHttZXRyaWNzLmNwdXMuc3BlZWR9KWApO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIG1ldHJpY3MudG90YWxtZW0gPT09ICdudW1iZXInICYmIHR5cGVvZiBtZXRyaWNzLmZyZWVtZW0gPT09ICdudW1iZXInKSB7XG5cdFx0XHRtZC5saShgTWVtb3J5KFN5c3RlbSk6ICR7KG1ldHJpY3MudG90YWxtZW0gLyAoQnl0ZVNpemUuR0IpKS50b0ZpeGVkKDIpfSBHQigkeyhtZXRyaWNzLmZyZWVtZW0gLyAoQnl0ZVNpemUuR0IpKS50b0ZpeGVkKDIpfUdCIGZyZWUpYCk7XG5cdFx0fVxuXHRcdGlmIChtZXRyaWNzLm1lbWluZm8pIHtcblx0XHRcdG1kLmxpKGBNZW1vcnkoUHJvY2Vzcyk6ICR7KG1ldHJpY3MubWVtaW5mby53b3JraW5nU2V0U2l6ZSAvIEJ5dGVTaXplLktCKS50b0ZpeGVkKDIpfSBNQiB3b3JraW5nIHNldCgkeyhtZXRyaWNzLm1lbWluZm8ucHJpdmF0ZUJ5dGVzIC8gQnl0ZVNpemUuS0IpLnRvRml4ZWQoMil9TUIgcHJpdmF0ZSwgJHsobWV0cmljcy5tZW1pbmZvLnNoYXJlZEJ5dGVzIC8gQnl0ZVNpemUuS0IpLnRvRml4ZWQoMil9TUIgc2hhcmVkKWApO1xuXHRcdH1cblx0XHRtZC5saShgVk0obGlrZWxpaG9vZCk6ICR7bWV0cmljcy5pc1ZNTGlrZWx5aG9vZH0lYCk7XG5cdFx0bWQubGkoYEluaXRpYWwgU3RhcnR1cDogJHttZXRyaWNzLmluaXRpYWxTdGFydHVwfWApO1xuXHRcdG1kLmxpKGBIYXMgJHttZXRyaWNzLndpbmRvd0NvdW50IC0gMX0gb3RoZXIgd2luZG93c2ApO1xuXHRcdG1kLmxpKGBTY3JlZW4gUmVhZGVyIEFjdGl2ZTogJHttZXRyaWNzLmhhc0FjY2Vzc2liaWxpdHlTdXBwb3J0fWApO1xuXHRcdG1kLmxpKGBFbXB0eSBXb3Jrc3BhY2U6ICR7bWV0cmljcy5lbXB0eVdvcmtiZW5jaH1gKTtcblx0fVxuXG5cdHByaXZhdGUgX2FkZFN1bW1hcnlUYWJsZShtZDogTWFya2Rvd25CdWlsZGVyKTogdm9pZCB7XG5cblx0XHRjb25zdCBtZXRyaWNzID0gdGhpcy5fdGltZXJTZXJ2aWNlLnN0YXJ0dXBNZXRyaWNzO1xuXHRcdGNvbnN0IGNvbnRyaWJUaW1pbmdzID0gUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpLnRpbWluZ3M7XG5cblx0XHRjb25zdCB0YWJsZTogQXJyYXk8QXJyYXk8c3RyaW5nIHwgbnVtYmVyIHwgdW5kZWZpbmVkPj4gPSBbXTtcblx0XHR0YWJsZS5wdXNoKFsnaW1wb3J0KG1haW4uanMpJywgbWV0cmljcy50aW1lcnMuZWxsYXBzZWRMb2FkTWFpbkJ1bmRsZSwgJ1ttYWluXScsIGBpbml0aWFsIHN0YXJ0dXA6ICR7bWV0cmljcy5pbml0aWFsU3RhcnR1cH1gXSk7XG5cdFx0dGFibGUucHVzaChbJ3N0YXJ0ID0+IGFwcC5pc1JlYWR5JywgbWV0cmljcy50aW1lcnMuZWxsYXBzZWRBcHBSZWFkeSwgJ1ttYWluXScsIGBpbml0aWFsIHN0YXJ0dXA6ICR7bWV0cmljcy5pbml0aWFsU3RhcnR1cH1gXSk7XG5cdFx0dGFibGUucHVzaChbJ25sczpzdGFydCA9PiBubHM6ZW5kJywgbWV0cmljcy50aW1lcnMuZWxsYXBzZWRObHNHZW5lcmF0aW9uLCAnW21haW5dJywgYGluaXRpYWwgc3RhcnR1cDogJHttZXRyaWNzLmluaXRpYWxTdGFydHVwfWBdKTtcblx0XHR0YWJsZS5wdXNoKFsncnVuIG1haW4uanMnLCBtZXRyaWNzLnRpbWVycy5lbGxhcHNlZFJ1bk1haW5CdW5kbGUsICdbbWFpbl0nLCBgaW5pdGlhbCBzdGFydHVwOiAke21ldHJpY3MuaW5pdGlhbFN0YXJ0dXB9YF0pO1xuXHRcdHRhYmxlLnB1c2goWydzdGFydCBjcmFzaCByZXBvcnRlcicsIG1ldHJpY3MudGltZXJzLmVsbGFwc2VkQ3Jhc2hSZXBvcnRlciwgJ1ttYWluXScsIGBpbml0aWFsIHN0YXJ0dXA6ICR7bWV0cmljcy5pbml0aWFsU3RhcnR1cH1gXSk7XG5cdFx0dGFibGUucHVzaChbJ3NlcnZlIG1haW4gSVBDIGhhbmRsZScsIG1ldHJpY3MudGltZXJzLmVsbGFwc2VkTWFpblNlcnZlciwgJ1ttYWluXScsIGBpbml0aWFsIHN0YXJ0dXA6ICR7bWV0cmljcy5pbml0aWFsU3RhcnR1cH1gXSk7XG5cdFx0dGFibGUucHVzaChbJ2NyZWF0ZSB3aW5kb3cnLCBtZXRyaWNzLnRpbWVycy5lbGxhcHNlZFdpbmRvd0NyZWF0ZSwgJ1ttYWluXScsIGBpbml0aWFsIHN0YXJ0dXA6ICR7bWV0cmljcy5pbml0aWFsU3RhcnR1cH0sICR7bWV0cmljcy5pbml0aWFsU3RhcnR1cCA/IGBzdGF0ZTogJHttZXRyaWNzLnRpbWVycy5lbGxhcHNlZFdpbmRvd1Jlc3RvcmVTdGF0ZX1tcywgd2lkZ2V0OiAke21ldHJpY3MudGltZXJzLmVsbGFwc2VkQnJvd3NlcldpbmRvd0NyZWF0ZX1tcywgc2hvdzogJHttZXRyaWNzLnRpbWVycy5lbGxhcHNlZFdpbmRvd01heGltaXplfW1zYCA6ICcnfWBdKTtcblx0XHR0YWJsZS5wdXNoKFsnYXBwLmlzUmVhZHkgPT4gd2luZG93LmxvYWRVcmwoKScsIG1ldHJpY3MudGltZXJzLmVsbGFwc2VkV2luZG93TG9hZCwgJ1ttYWluXScsIGBpbml0aWFsIHN0YXJ0dXA6ICR7bWV0cmljcy5pbml0aWFsU3RhcnR1cH1gXSk7XG5cdFx0dGFibGUucHVzaChbJ3dpbmRvdy5sb2FkVXJsKCkgPT4gYmVnaW4gdG8gaW1wb3J0KHdvcmtiZW5jaC5kZXNrdG9wLm1haW4uanMpJywgbWV0cmljcy50aW1lcnMuZWxsYXBzZWRXaW5kb3dMb2FkVG9SZXF1aXJlLCAnW21haW4tPnJlbmRlcmVyXScsIFN0YXJ0dXBLaW5kVG9TdHJpbmcobWV0cmljcy53aW5kb3dLaW5kKV0pO1xuXHRcdHRhYmxlLnB1c2goWydpbXBvcnQod29ya2JlbmNoLmRlc2t0b3AubWFpbi5qcyknLCBtZXRyaWNzLnRpbWVycy5lbGxhcHNlZFJlcXVpcmUsICdbcmVuZGVyZXJdJywgYGNhY2hlZCBkYXRhOiAkeyhtZXRyaWNzLmRpZFVzZUNhY2hlZERhdGEgPyAnWUVTJyA6ICdOTycpfWBdKTtcblx0XHR0YWJsZS5wdXNoKFsnd2FpdCBmb3Igd2luZG93IGNvbmZpZycsIG1ldHJpY3MudGltZXJzLmVsbGFwc2VkV2FpdEZvcldpbmRvd0NvbmZpZywgJ1tyZW5kZXJlcl0nLCB1bmRlZmluZWRdKTtcblx0XHR0YWJsZS5wdXNoKFsnaW5pdCBzdG9yYWdlIChnbG9iYWwgJiB3b3Jrc3BhY2UpJywgbWV0cmljcy50aW1lcnMuZWxsYXBzZWRTdG9yYWdlSW5pdCwgJ1tyZW5kZXJlcl0nLCB1bmRlZmluZWRdKTtcblx0XHR0YWJsZS5wdXNoKFsnaW5pdCB3b3Jrc3BhY2Ugc2VydmljZScsIG1ldHJpY3MudGltZXJzLmVsbGFwc2VkV29ya3NwYWNlU2VydmljZUluaXQsICdbcmVuZGVyZXJdJywgdW5kZWZpbmVkXSk7XG5cdFx0aWYgKGlzV2ViKSB7XG5cdFx0XHR0YWJsZS5wdXNoKFsnaW5pdCBzZXR0aW5ncyBhbmQgZ2xvYmFsIHN0YXRlIGZyb20gc2V0dGluZ3Mgc3luYyBzZXJ2aWNlJywgbWV0cmljcy50aW1lcnMuZWxsYXBzZWRSZXF1aXJlZFVzZXJEYXRhSW5pdCwgJ1tyZW5kZXJlcl0nLCB1bmRlZmluZWRdKTtcblx0XHRcdHRhYmxlLnB1c2goWydpbml0IGtleWJpbmRpbmdzLCBzbmlwcGV0cyAmIGV4dGVuc2lvbnMgZnJvbSBzZXR0aW5ncyBzeW5jIHNlcnZpY2UnLCBtZXRyaWNzLnRpbWVycy5lbGxhcHNlZE90aGVyVXNlckRhdGFJbml0LCAnW3JlbmRlcmVyXScsIHVuZGVmaW5lZF0pO1xuXHRcdH1cblx0XHR0YWJsZS5wdXNoKFsncmVnaXN0ZXIgZXh0ZW5zaW9ucyAmIHNwYXduIGV4dGVuc2lvbiBob3N0JywgbWV0cmljcy50aW1lcnMuZWxsYXBzZWRFeHRlbnNpb25zLCAnW3JlbmRlcmVyXScsIHVuZGVmaW5lZF0pO1xuXHRcdHRhYmxlLnB1c2goWydyZXN0b3JlIHByaW1hcnkgdmlld2xldCcsIG1ldHJpY3MudGltZXJzLmVsbGFwc2VkVmlld2xldFJlc3RvcmUsICdbcmVuZGVyZXJdJywgbWV0cmljcy52aWV3bGV0SWRdKTtcblx0XHR0YWJsZS5wdXNoKFsncmVzdG9yZSBzZWNvbmRhcnkgdmlld2xldCcsIG1ldHJpY3MudGltZXJzLmVsbGFwc2VkQXV4aWxpYXJ5Vmlld2xldFJlc3RvcmUsICdbcmVuZGVyZXJdJywgbWV0cmljcy5hdXhpbGlhcnlWaWV3bGV0SWRdKTtcblx0XHR0YWJsZS5wdXNoKFsncmVzdG9yZSBwYW5lbCcsIG1ldHJpY3MudGltZXJzLmVsbGFwc2VkUGFuZWxSZXN0b3JlLCAnW3JlbmRlcmVyXScsIG1ldHJpY3MucGFuZWxJZF0pO1xuXHRcdHRhYmxlLnB1c2goWydyZXN0b3JlICYgcmVzb2x2ZSB2aXNpYmxlIGVkaXRvcnMnLCBtZXRyaWNzLnRpbWVycy5lbGxhcHNlZEVkaXRvclJlc3RvcmUsICdbcmVuZGVyZXJdJywgYCR7bWV0cmljcy5lZGl0b3JJZHMubGVuZ3RofTogJHttZXRyaWNzLmVkaXRvcklkcy5qb2luKCcsICcpfWBdKTtcblx0XHR0YWJsZS5wdXNoKFsnY3JlYXRlIHdvcmtiZW5jaCBjb250cmlidXRpb25zJywgbWV0cmljcy50aW1lcnMuZWxsYXBzZWRXb3JrYmVuY2hDb250cmlidXRpb25zLCAnW3JlbmRlcmVyXScsIGAkeyhjb250cmliVGltaW5ncy5nZXQoTGlmZWN5Y2xlUGhhc2UuU3RhcnRpbmcpPy5sZW5ndGggPz8gMCkgKyAoY29udHJpYlRpbWluZ3MuZ2V0KExpZmVjeWNsZVBoYXNlLlJlYWR5KT8ubGVuZ3RoID8/IDApfSBibG9ja2luZyBzdGFydHVwYF0pO1xuXHRcdHRhYmxlLnB1c2goWydvdmVyYWxsIHdvcmtiZW5jaCBsb2FkJywgbWV0cmljcy50aW1lcnMuZWxsYXBzZWRXb3JrYmVuY2gsICdbcmVuZGVyZXJdJywgdW5kZWZpbmVkXSk7XG5cdFx0dGFibGUucHVzaChbJ3dvcmtiZW5jaCByZWFkeScsIG1ldHJpY3MuZWxsYXBzZWQsICdbbWFpbi0+cmVuZGVyZXJdJywgdW5kZWZpbmVkXSk7XG5cdFx0dGFibGUucHVzaChbJ3JlbmRlcmVyIHJlYWR5JywgbWV0cmljcy50aW1lcnMuZWxsYXBzZWRSZW5kZXJlciwgJ1tyZW5kZXJlcl0nLCB1bmRlZmluZWRdKTtcblx0XHR0YWJsZS5wdXNoKFsnc2hhcmVkIHByb2Nlc3MgY29ubmVjdGlvbiByZWFkeScsIG1ldHJpY3MudGltZXJzLmVsbGFwc2VkU2hhcmVkUHJvY2VzQ29ubmVjdGVkLCAnW3JlbmRlcmVyLT5zaGFyZWRwcm9jZXNzXScsIHVuZGVmaW5lZF0pO1xuXHRcdHRhYmxlLnB1c2goWydleHRlbnNpb25zIHJlZ2lzdGVyZWQnLCBtZXRyaWNzLnRpbWVycy5lbGxhcHNlZEV4dGVuc2lvbnNSZWFkeSwgJ1tyZW5kZXJlcl0nLCB1bmRlZmluZWRdKTtcblxuXHRcdG1kLmhlYWRpbmcoMiwgJ1BlcmZvcm1hbmNlIE1hcmtzJyk7XG5cdFx0bWQudGFibGUoWydXaGF0JywgJ0R1cmF0aW9uJywgJ1Byb2Nlc3MnLCAnSW5mbyddLCB0YWJsZSk7XG5cdH1cblxuXHRwcml2YXRlIF9hZGRFeHRlbnNpb25zVGFibGUobWQ6IE1hcmtkb3duQnVpbGRlcik6IHZvaWQge1xuXG5cdFx0Y29uc3QgZWFnZXI6ICh7IHRvU3RyaW5nKCk6IHN0cmluZyB9KVtdW10gPSBbXTtcblx0XHRjb25zdCBub3JtYWw6ICh7IHRvU3RyaW5nKCk6IHN0cmluZyB9KVtdW10gPSBbXTtcblx0XHRjb25zdCBleHRlbnNpb25zU3RhdHVzID0gdGhpcy5fZXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb25zU3RhdHVzKCk7XG5cdFx0Zm9yIChjb25zdCBpZCBpbiBleHRlbnNpb25zU3RhdHVzKSB7XG5cdFx0XHRjb25zdCB7IGFjdGl2YXRpb25UaW1lczogdGltZXMgfSA9IGV4dGVuc2lvbnNTdGF0dXNbaWRdO1xuXHRcdFx0aWYgKCF0aW1lcykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICh0aW1lcy5hY3RpdmF0aW9uUmVhc29uLnN0YXJ0dXApIHtcblx0XHRcdFx0ZWFnZXIucHVzaChbaWQsIHRpbWVzLmFjdGl2YXRpb25SZWFzb24uc3RhcnR1cCwgdGltZXMuY29kZUxvYWRpbmdUaW1lLCB0aW1lcy5hY3RpdmF0ZUNhbGxUaW1lLCB0aW1lcy5hY3RpdmF0ZVJlc29sdmVkVGltZSwgdGltZXMuYWN0aXZhdGlvblJlYXNvbi5hY3RpdmF0aW9uRXZlbnQsIHRpbWVzLmFjdGl2YXRpb25SZWFzb24uZXh0ZW5zaW9uSWQudmFsdWVdKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG5vcm1hbC5wdXNoKFtpZCwgdGltZXMuYWN0aXZhdGlvblJlYXNvbi5zdGFydHVwLCB0aW1lcy5jb2RlTG9hZGluZ1RpbWUsIHRpbWVzLmFjdGl2YXRlQ2FsbFRpbWUsIHRpbWVzLmFjdGl2YXRlUmVzb2x2ZWRUaW1lLCB0aW1lcy5hY3RpdmF0aW9uUmVhc29uLmFjdGl2YXRpb25FdmVudCwgdGltZXMuYWN0aXZhdGlvblJlYXNvbi5leHRlbnNpb25JZC52YWx1ZV0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHRhYmxlID0gZWFnZXIuY29uY2F0KG5vcm1hbCk7XG5cdFx0aWYgKHRhYmxlLmxlbmd0aCA+IDApIHtcblx0XHRcdG1kLmhlYWRpbmcoMiwgJ0V4dGVuc2lvbiBBY3RpdmF0aW9uIFN0YXRzJyk7XG5cdFx0XHRtZC50YWJsZShcblx0XHRcdFx0WydFeHRlbnNpb24nLCAnRWFnZXInLCAnTG9hZCBDb2RlJywgJ0NhbGwgQWN0aXZhdGUnLCAnRmluaXNoIEFjdGl2YXRlJywgJ0V2ZW50JywgJ0J5J10sXG5cdFx0XHRcdHRhYmxlXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FkZFBlcmZNYXJrc1RhYmxlKG5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgbWQ6IE1hcmtkb3duQnVpbGRlciwgbWFya3M6IHJlYWRvbmx5IHBlcmYuUGVyZm9ybWFuY2VNYXJrW10gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIW1hcmtzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRhYmxlOiBBcnJheTxBcnJheTxzdHJpbmcgfCBudW1iZXIgfCB1bmRlZmluZWQ+PiA9IFtdO1xuXHRcdGxldCBsYXN0U3RhcnRUaW1lID0gLTE7XG5cdFx0bGV0IHRvdGFsID0gMDtcblx0XHRmb3IgKGNvbnN0IHsgbmFtZSwgc3RhcnRUaW1lIH0gb2YgbWFya3MpIHtcblx0XHRcdGNvbnN0IGRlbHRhID0gbGFzdFN0YXJ0VGltZSAhPT0gLTEgPyBzdGFydFRpbWUgLSBsYXN0U3RhcnRUaW1lIDogMDtcblx0XHRcdHRvdGFsICs9IGRlbHRhO1xuXHRcdFx0dGFibGUucHVzaChbbmFtZSwgTWF0aC5yb3VuZChzdGFydFRpbWUpLCBNYXRoLnJvdW5kKGRlbHRhKSwgTWF0aC5yb3VuZCh0b3RhbCldKTtcblx0XHRcdGxhc3RTdGFydFRpbWUgPSBzdGFydFRpbWU7XG5cdFx0fVxuXHRcdGlmIChuYW1lKSB7XG5cdFx0XHRtZC5oZWFkaW5nKDIsIG5hbWUpO1xuXHRcdH1cblx0XHRtZC50YWJsZShbJ05hbWUnLCAnVGltZXN0YW1wJywgJ0RlbHRhJywgJ1RvdGFsJ10sIHRhYmxlKTtcblx0fVxuXG5cdHByaXZhdGUgX2FkZEFnZW50SG9zdFBlcmZNYXJrc1RhYmxlKG1kOiBNYXJrZG93bkJ1aWxkZXIpOiB2b2lkIHtcblx0XHRjb25zdCBtYXJrcyA9IHBlcmYuZ2V0TWFya3MoKTtcblx0XHRpZiAoIW1hcmtzLnNvbWUobWFyayA9PiBtYXJrLm5hbWUuc3RhcnRzV2l0aCgnY29kZS9hZ2VudEhvc3QvJykpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2FkZFBlcmZNYXJrc1RhYmxlKCdBZ2VudCBIb3N0IFN0YXJ0dXAnLCBtZCwgbWFya3MuZmlsdGVyKG1hcmsgPT4gbWFyay5uYW1lID09PSAnY29kZS90aW1lT3JpZ2luJyB8fCBtYXJrLm5hbWUuc3RhcnRzV2l0aCgnY29kZS9hZ2VudEhvc3QvJykpKTtcblx0fVxuXG5cdHByaXZhdGUgX2FkZFdvcmtiZW5jaENvbnRyaWJ1dGlvbnNQZXJmTWFya3NUYWJsZShtZDogTWFya2Rvd25CdWlsZGVyKTogdm9pZCB7XG5cdFx0bWQuaGVhZGluZygyLCAnV29ya2JlbmNoIENvbnRyaWJ1dGlvbnMgQmxvY2tpbmcgUmVzdG9yZScpO1xuXG5cdFx0Y29uc3QgdGltaW5ncyA9IFJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKS50aW1pbmdzO1xuXHRcdG1kLmxpKGBUb3RhbCAoTGlmZWN5Y2xlUGhhc2UuU3RhcnRpbmcpOiAke3RpbWluZ3MuZ2V0KExpZmVjeWNsZVBoYXNlLlN0YXJ0aW5nKT8ubGVuZ3RofSAoJHt0aW1pbmdzLmdldChMaWZlY3ljbGVQaGFzZS5TdGFydGluZyk/LnJlZHVjZSgocCwgYykgPT4gcCArIGNbMV0sIDApfW1zKWApO1xuXHRcdG1kLmxpKGBUb3RhbCAoTGlmZWN5Y2xlUGhhc2UuUmVhZHkpOiAke3RpbWluZ3MuZ2V0KExpZmVjeWNsZVBoYXNlLlJlYWR5KT8ubGVuZ3RofSAoJHt0aW1pbmdzLmdldChMaWZlY3ljbGVQaGFzZS5SZWFkeSk/LnJlZHVjZSgocCwgYykgPT4gcCArIGNbMV0sIDApfW1zKWApO1xuXHRcdG1kLmJsYW5rKCk7XG5cblx0XHRjb25zdCBtYXJrcyA9IHRoaXMuX3RpbWVyU2VydmljZS5nZXRQZXJmb3JtYW5jZU1hcmtzKCkuZmluZChlID0+IGVbMF0gPT09ICdyZW5kZXJlcicpPy5bMV0uZmlsdGVyKGUgPT5cblx0XHRcdGUubmFtZS5zdGFydHNXaXRoKCdjb2RlL3dpbGxDcmVhdGVXb3JrYmVuY2hDb250cmlidXRpb24vMScpIHx8XG5cdFx0XHRlLm5hbWUuc3RhcnRzV2l0aCgnY29kZS9kaWRDcmVhdGVXb3JrYmVuY2hDb250cmlidXRpb24vMScpIHx8XG5cdFx0XHRlLm5hbWUuc3RhcnRzV2l0aCgnY29kZS93aWxsQ3JlYXRlV29ya2JlbmNoQ29udHJpYnV0aW9uLzInKSB8fFxuXHRcdFx0ZS5uYW1lLnN0YXJ0c1dpdGgoJ2NvZGUvZGlkQ3JlYXRlV29ya2JlbmNoQ29udHJpYnV0aW9uLzInKVxuXHRcdCk7XG5cdFx0dGhpcy5fYWRkUGVyZk1hcmtzVGFibGUodW5kZWZpbmVkLCBtZCwgbWFya3MpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWRkUmF3UGVyZk1hcmtzKG1kOiBNYXJrZG93bkJ1aWxkZXIpOiB2b2lkIHtcblxuXHRcdGZvciAoY29uc3QgW3NvdXJjZSwgbWFya3NdIG9mIHRoaXMuX3RpbWVyU2VydmljZS5nZXRQZXJmb3JtYW5jZU1hcmtzKCkpIHtcblx0XHRcdG1kLmhlYWRpbmcoMiwgYFJhdyBQZXJmIE1hcmtzOiAke3NvdXJjZX1gKTtcblx0XHRcdG1kLnZhbHVlICs9ICdgYGBcXG4nO1xuXHRcdFx0bWQudmFsdWUgKz0gYE5hbWVcXHRUaW1lc3RhbXBcXHREZWx0YVxcdFRvdGFsXFxuYDtcblx0XHRcdGxldCBsYXN0U3RhcnRUaW1lID0gLTE7XG5cdFx0XHRsZXQgdG90YWwgPSAwO1xuXHRcdFx0Zm9yIChjb25zdCB7IG5hbWUsIHN0YXJ0VGltZSB9IG9mIG1hcmtzKSB7XG5cdFx0XHRcdGNvbnN0IGRlbHRhID0gbGFzdFN0YXJ0VGltZSAhPT0gLTEgPyBzdGFydFRpbWUgLSBsYXN0U3RhcnRUaW1lIDogMDtcblx0XHRcdFx0dG90YWwgKz0gZGVsdGE7XG5cdFx0XHRcdG1kLnZhbHVlICs9IGAke25hbWV9XFx0JHtzdGFydFRpbWV9XFx0JHtkZWx0YX1cXHQke3RvdGFsfVxcbmA7XG5cdFx0XHRcdGxhc3RTdGFydFRpbWUgPSBzdGFydFRpbWU7XG5cdFx0XHR9XG5cdFx0XHRtZC52YWx1ZSArPSAnYGBgXFxuJztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hZGRSZXNvdXJjZVRpbWluZ1N0YXRzKG1kOiBNYXJrZG93bkJ1aWxkZXIpIHtcblx0XHRjb25zdCBzdGF0cyA9IHBlcmZvcm1hbmNlLmdldEVudHJpZXNCeVR5cGUoJ3Jlc291cmNlJykubWFwKGVudHJ5ID0+IHtcblx0XHRcdHJldHVybiBbZW50cnkubmFtZSwgZW50cnkuZHVyYXRpb25dO1xuXHRcdH0pO1xuXHRcdGlmICghc3RhdHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdG1kLmhlYWRpbmcoMiwgJ1Jlc291cmNlIFRpbWluZyBTdGF0cycpO1xuXHRcdG1kLnRhYmxlKFsnTmFtZScsICdEdXJhdGlvbiddLCBzdGF0cyk7XG5cdH1cbn1cblxuY2xhc3MgTWFya2Rvd25CdWlsZGVyIHtcblxuXHR2YWx1ZTogc3RyaW5nID0gJyc7XG5cblx0aGVhZGluZyhsZXZlbDogbnVtYmVyLCB2YWx1ZTogc3RyaW5nKTogdGhpcyB7XG5cdFx0dGhpcy52YWx1ZSArPSBgJHsnIycucmVwZWF0KGxldmVsKX0gJHt2YWx1ZX1cXG5cXG5gO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0YmxhbmsoKSB7XG5cdFx0dGhpcy52YWx1ZSArPSAnXFxuJztcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdGxpKHZhbHVlOiBzdHJpbmcpIHtcblx0XHR0aGlzLnZhbHVlICs9IGAqICR7dmFsdWV9XFxuYDtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHRhYmxlKGhlYWRlcjogc3RyaW5nW10sIHJvd3M6IEFycmF5PEFycmF5PHsgdG9TdHJpbmcoKTogc3RyaW5nIH0gfCB1bmRlZmluZWQ+Pikge1xuXHRcdHRoaXMudmFsdWUgKz0gdGhpcy50b01hcmtkb3duVGFibGUoaGVhZGVyLCByb3dzKTtcblx0fVxuXG5cdHByaXZhdGUgdG9NYXJrZG93blRhYmxlKGhlYWRlcjogc3RyaW5nW10sIHJvd3M6IEFycmF5PEFycmF5PHsgdG9TdHJpbmcoKTogc3RyaW5nIH0gfCB1bmRlZmluZWQ+Pik6IHN0cmluZyB7XG5cdFx0bGV0IHJlc3VsdCA9ICcnO1xuXG5cdFx0Y29uc3QgbGVuZ3RoczogbnVtYmVyW10gPSBbXTtcblx0XHRoZWFkZXIuZm9yRWFjaCgoY2VsbCwgY2kpID0+IHtcblx0XHRcdGxlbmd0aHNbY2ldID0gY2VsbC5sZW5ndGg7XG5cdFx0fSk7XG5cdFx0cm93cy5mb3JFYWNoKHJvdyA9PiB7XG5cdFx0XHRyb3cuZm9yRWFjaCgoY2VsbCwgY2kpID0+IHtcblx0XHRcdFx0aWYgKHR5cGVvZiBjZWxsID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdGNlbGwgPSByb3dbY2ldID0gJy0nO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGxlbiA9IGNlbGwudG9TdHJpbmcoKS5sZW5ndGg7XG5cdFx0XHRcdGxlbmd0aHNbY2ldID0gTWF0aC5tYXgobGVuLCBsZW5ndGhzW2NpXSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdC8vIGhlYWRlclxuXHRcdGhlYWRlci5mb3JFYWNoKChjZWxsLCBjaSkgPT4geyByZXN1bHQgKz0gYHwgJHtjZWxsICsgJyAnLnJlcGVhdChsZW5ndGhzW2NpXSAtIGNlbGwudG9TdHJpbmcoKS5sZW5ndGgpfSBgOyB9KTtcblx0XHRyZXN1bHQgKz0gJ3xcXG4nO1xuXHRcdGhlYWRlci5mb3JFYWNoKChfY2VsbCwgY2kpID0+IHsgcmVzdWx0ICs9IGB8ICR7Jy0nLnJlcGVhdChsZW5ndGhzW2NpXSl9IGA7IH0pO1xuXHRcdHJlc3VsdCArPSAnfFxcbic7XG5cblx0XHQvLyBjZWxsc1xuXHRcdHJvd3MuZm9yRWFjaChyb3cgPT4ge1xuXHRcdFx0cm93LmZvckVhY2goKGNlbGwsIGNpKSA9PiB7XG5cdFx0XHRcdGlmICh0eXBlb2YgY2VsbCAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0XHRyZXN1bHQgKz0gYHwgJHtjZWxsICsgJyAnLnJlcGVhdChsZW5ndGhzW2NpXSAtIGNlbGwudG9TdHJpbmcoKS5sZW5ndGgpfSBgO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHJlc3VsdCArPSAnfFxcbic7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHlCQUFvRDtBQUU3RCxTQUFTLG1CQUFtQixnQkFBZ0IsMkJBQTJCO0FBQ3ZFLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQXNCLGVBQWU7QUFDckMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxVQUFVLG9CQUFvQjtBQUN2QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyx3QkFBd0I7QUFDakMsWUFBWSxVQUFVO0FBQ3RCLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQTBDLGNBQWMscUJBQXFCLGdDQUFnQztBQUM3RyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDJCQUEyQjtBQUU3QixJQUFNLGtCQUFOLE1BQXNCO0FBQUEsRUFXNUIsWUFDeUMs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
