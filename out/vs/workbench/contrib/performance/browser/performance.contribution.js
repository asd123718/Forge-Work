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
import { EventProfiling } from "../../../../base/common/event.js";
import { GCBasedDisposableTracker, setDisposableTracker } from "../../../../base/common/lifecycle.js";
import { env } from "../../../../base/common/process.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { Extensions as ConfigExt } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { InstantiationService, Trace } from "../../../../platform/instantiation/common/instantiationService.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions, registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { EditorExtensions } from "../../../common/editor.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { InputLatencyContrib } from "./inputLatencyContrib.js";
import { PerfviewContrib, PerfviewInput } from "./perfviewEditor.js";
registerWorkbenchContribution2(
  PerfviewContrib.ID,
  PerfviewContrib,
  { lazy: true }
);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(
  PerfviewInput.Id,
  class {
    canSerialize() {
      return true;
    }
    serialize() {
      return "";
    }
    deserialize(instantiationService) {
      return instantiationService.createInstance(PerfviewInput);
    }
  }
);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "perfview.show",
      title: localize2("show.label", "Startup Performance"),
      category: Categories.Developer,
      f1: true
    });
  }
  run(accessor) {
    const editorService = accessor.get(IEditorService);
    const contrib = PerfviewContrib.get();
    return editorService.openEditor(contrib.getEditorInput(), { pinned: true });
  }
});
registerAction2(class PrintServiceCycles extends Action2 {
  constructor() {
    super({
      id: "perf.insta.printAsyncCycles",
      title: localize2("cycles", "Print Service Cycles"),
      category: Categories.Developer,
      f1: true
    });
  }
  run(accessor) {
    const instaService = accessor.get(IInstantiationService);
    if (instaService instanceof InstantiationService) {
      const cycle = instaService._globalGraph?.findCycleSlow();
      if (cycle) {
        console.warn(`CYCLE`, cycle);
      } else {
        console.warn(`YEAH, no more cycles`);
      }
    }
  }
});
registerAction2(class PrintServiceTraces extends Action2 {
  constructor() {
    super({
      id: "perf.insta.printTraces",
      title: localize2("insta.trace", "Print Service Traces"),
      category: Categories.Developer,
      f1: true
    });
  }
  run() {
    if (Trace.all.size === 0) {
      console.log("Enable via `instantiationService.ts#_enableAllTracing`");
      return;
    }
    for (const item of Trace.all) {
      console.log(item);
    }
  }
});
registerAction2(class PrintEventProfiling extends Action2 {
  constructor() {
    super({
      id: "perf.event.profiling",
      title: localize2("emitter", "Print Emitter Profiles"),
      category: Categories.Developer,
      f1: true
    });
  }
  run() {
    if (EventProfiling.all.size === 0) {
      console.log("USE `EmitterOptions._profName` to enable profiling");
      return;
    }
    for (const item of EventProfiling.all) {
      console.log(`${item.name}: ${item.invocationCount} invocations COST ${item.elapsedOverall}ms, ${item.listenerCount} listeners, avg cost is ${item.durations.reduce((a, b) => a + b, 0) / item.durations.length}ms`);
    }
  }
});
Registry.as(Extensions.Workbench).registerWorkbenchContribution(
  InputLatencyContrib,
  LifecyclePhase.Eventually
);
Registry.as(ConfigExt.Configuration).registerConfiguration({
  id: "performance",
  order: 101,
  title: localize("performanceConfigurationTitle", "Performance"),
  type: "object",
  properties: {
    "telemetry.performance.inputLatencySamplingProbability": {
      type: "number",
      default: 0,
      minimum: 0,
      maximum: 1,
      tags: ["experimental"],
      markdownDescription: localize("telemetry.performance.inputLatencySamplingProbability", "Probability (0 to 1) that input latency telemetry is reported for this session. Set to 0 to disable, 1 to always report."),
      experiment: {
        mode: "auto"
      }
    }
  }
});
let DisposableTracking = class {
  constructor(envService) {
    if (!envService.isBuilt && !envService.extensionTestsLocationURI && !env["VSCODE_DEV_DISABLE_DISPOSABLE_TRACKING"]) {
      setDisposableTracker(new GCBasedDisposableTracker());
    }
  }
};
DisposableTracking.Id = "perf.disposableTracking";
DisposableTracking = __decorateClass([
  __decorateParam(0, IEnvironmentService)
], DisposableTracking);
registerWorkbenchContribution2(DisposableTracking.Id, DisposableTracking, WorkbenchPhase.Eventually);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHBlcmZvcm1hbmNlXFxicm93c2VyXFxwZXJmb3JtYW5jZS5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFdmVudFByb2ZpbGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEdDQmFzZWREaXNwb3NhYmxlVHJhY2tlciwgc2V0RGlzcG9zYWJsZVRyYWNrZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW52IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIENvbmZpZ0V4dCwgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblNlcnZpY2UsIFRyYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yLCBXb3JrYmVuY2hQaGFzZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnMsIElFZGl0b3JGYWN0b3J5UmVnaXN0cnksIElFZGl0b3JTZXJpYWxpemVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElucHV0TGF0ZW5jeUNvbnRyaWIgfSBmcm9tICcuL2lucHV0TGF0ZW5jeUNvbnRyaWIuanMnO1xuaW1wb3J0IHsgUGVyZnZpZXdDb250cmliLCBQZXJmdmlld0lucHV0IH0gZnJvbSAnLi9wZXJmdmlld0VkaXRvci5qcyc7XG5cbi8vIC0tIHN0YXJ0dXAgcGVyZm9ybWFuY2Ugdmlld1xuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoXG5cdFBlcmZ2aWV3Q29udHJpYi5JRCxcblx0UGVyZnZpZXdDb250cmliLFxuXHR7IGxhenk6IHRydWUgfVxuKTtcblxuUmVnaXN0cnkuYXM8SUVkaXRvckZhY3RvcnlSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JGYWN0b3J5KS5yZWdpc3RlckVkaXRvclNlcmlhbGl6ZXIoXG5cdFBlcmZ2aWV3SW5wdXQuSWQsXG5cdGNsYXNzIGltcGxlbWVudHMgSUVkaXRvclNlcmlhbGl6ZXIge1xuXHRcdGNhblNlcmlhbGl6ZSgpOiBib29sZWFuIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRzZXJpYWxpemUoKTogc3RyaW5nIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0ZGVzZXJpYWxpemUoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IFBlcmZ2aWV3SW5wdXQge1xuXHRcdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFBlcmZ2aWV3SW5wdXQpO1xuXHRcdH1cblx0fVxuKTtcblxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3BlcmZ2aWV3LnNob3cnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2hvdy5sYWJlbCcsICdTdGFydHVwIFBlcmZvcm1hbmNlJyksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgY29udHJpYiA9IFBlcmZ2aWV3Q29udHJpYi5nZXQoKTtcblx0XHRyZXR1cm4gZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGNvbnRyaWIuZ2V0RWRpdG9ySW5wdXQoKSwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdH1cbn0pO1xuXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBQcmludFNlcnZpY2VDeWNsZXMgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3BlcmYuaW5zdGEucHJpbnRBc3luY0N5Y2xlcycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjeWNsZXMnLCAnUHJpbnQgU2VydmljZSBDeWNsZXMnKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBpbnN0YVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRpZiAoaW5zdGFTZXJ2aWNlIGluc3RhbmNlb2YgSW5zdGFudGlhdGlvblNlcnZpY2UpIHtcblx0XHRcdGNvbnN0IGN5Y2xlID0gaW5zdGFTZXJ2aWNlLl9nbG9iYWxHcmFwaD8uZmluZEN5Y2xlU2xvdygpO1xuXHRcdFx0aWYgKGN5Y2xlKSB7XG5cdFx0XHRcdGNvbnNvbGUud2FybihgQ1lDTEVgLCBjeWNsZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zb2xlLndhcm4oYFlFQUgsIG5vIG1vcmUgY3ljbGVzYCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFByaW50U2VydmljZVRyYWNlcyBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAncGVyZi5pbnN0YS5wcmludFRyYWNlcycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnN0YS50cmFjZScsICdQcmludCBTZXJ2aWNlIFRyYWNlcycpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdHJ1bigpIHtcblx0XHRpZiAoVHJhY2UuYWxsLnNpemUgPT09IDApIHtcblx0XHRcdGNvbnNvbGUubG9nKCdFbmFibGUgdmlhIGBpbnN0YW50aWF0aW9uU2VydmljZS50cyNfZW5hYmxlQWxsVHJhY2luZ2AnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgVHJhY2UuYWxsKSB7XG5cdFx0XHRjb25zb2xlLmxvZyhpdGVtKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBQcmludEV2ZW50UHJvZmlsaW5nIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdwZXJmLmV2ZW50LnByb2ZpbGluZycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdlbWl0dGVyJywgJ1ByaW50IEVtaXR0ZXIgUHJvZmlsZXMnKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oKTogdm9pZCB7XG5cdFx0aWYgKEV2ZW50UHJvZmlsaW5nLmFsbC5zaXplID09PSAwKSB7XG5cdFx0XHRjb25zb2xlLmxvZygnVVNFIGBFbWl0dGVyT3B0aW9ucy5fcHJvZk5hbWVgIHRvIGVuYWJsZSBwcm9maWxpbmcnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIEV2ZW50UHJvZmlsaW5nLmFsbCkge1xuXHRcdFx0Y29uc29sZS5sb2coYCR7aXRlbS5uYW1lfTogJHtpdGVtLmludm9jYXRpb25Db3VudH0gaW52b2NhdGlvbnMgQ09TVCAke2l0ZW0uZWxhcHNlZE92ZXJhbGx9bXMsICR7aXRlbS5saXN0ZW5lckNvdW50fSBsaXN0ZW5lcnMsIGF2ZyBjb3N0IGlzICR7aXRlbS5kdXJhdGlvbnMucmVkdWNlKChhLCBiKSA9PiBhICsgYiwgMCkgLyBpdGVtLmR1cmF0aW9ucy5sZW5ndGh9bXNgKTtcblx0XHR9XG5cdH1cbn0pO1xuXG4vLyAtLSBpbnB1dCBsYXRlbmN5XG5cblJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KEV4dGVuc2lvbnMuV29ya2JlbmNoKS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihcblx0SW5wdXRMYXRlbmN5Q29udHJpYixcblx0TGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseVxuKTtcblxuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWdFeHQuQ29uZmlndXJhdGlvbikucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0aWQ6ICdwZXJmb3JtYW5jZScsXG5cdG9yZGVyOiAxMDEsXG5cdHRpdGxlOiBsb2NhbGl6ZSgncGVyZm9ybWFuY2VDb25maWd1cmF0aW9uVGl0bGUnLCBcIlBlcmZvcm1hbmNlXCIpLFxuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdCd0ZWxlbWV0cnkucGVyZm9ybWFuY2UuaW5wdXRMYXRlbmN5U2FtcGxpbmdQcm9iYWJpbGl0eSc6IHtcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVmYXVsdDogMCxcblx0XHRcdG1pbmltdW06IDAsXG5cdFx0XHRtYXhpbXVtOiAxLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZWxlbWV0cnkucGVyZm9ybWFuY2UuaW5wdXRMYXRlbmN5U2FtcGxpbmdQcm9iYWJpbGl0eScsIFwiUHJvYmFiaWxpdHkgKDAgdG8gMSkgdGhhdCBpbnB1dCBsYXRlbmN5IHRlbGVtZXRyeSBpcyByZXBvcnRlZCBmb3IgdGhpcyBzZXNzaW9uLiBTZXQgdG8gMCB0byBkaXNhYmxlLCAxIHRvIGFsd2F5cyByZXBvcnQuXCIpLFxuXHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRtb2RlOiAnYXV0bydcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG4vLyAtLSB0cmFjayBsZWFraW5nIGRpc3Bvc2FibGVzLCB0aG9zZSB0aGF0IGdldCBHQydlZCBiZWZvcmUgaGF2aW5nIGJlZW4gZGlzcG9zZWRcblxuXG5jbGFzcyBEaXNwb3NhYmxlVHJhY2tpbmcge1xuXHRzdGF0aWMgcmVhZG9ubHkgSWQgPSAncGVyZi5kaXNwb3NhYmxlVHJhY2tpbmcnO1xuXHRjb25zdHJ1Y3RvcihASUVudmlyb25tZW50U2VydmljZSBlbnZTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlKSB7XG5cdFx0aWYgKCFlbnZTZXJ2aWNlLmlzQnVpbHQgJiYgIWVudlNlcnZpY2UuZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSAmJiAhZW52WydWU0NPREVfREVWX0RJU0FCTEVfRElTUE9TQUJMRV9UUkFDS0lORyddKSB7XG5cdFx0XHRzZXREaXNwb3NhYmxlVHJhY2tlcihuZXcgR0NCYXNlZERpc3Bvc2FibGVUcmFja2VyKCkpO1xuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoRGlzcG9zYWJsZVRyYWNraW5nLklkLCBEaXNwb3NhYmxlVHJhY2tpbmcsIFdvcmtiZW5jaFBoYXNlLkV2ZW50dWFsbHkpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDBCQUEwQiw0QkFBNEI7QUFDL0QsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLGNBQWMsaUJBQXlDO0FBQ2hFLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsc0JBQXNCLGFBQWE7QUFDNUMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxZQUE2QyxnQ0FBZ0Msc0JBQXNCO0FBQzVHLFNBQVMsd0JBQW1FO0FBQzVFLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUJBQWlCLHFCQUFxQjtBQUkvQztBQUFBLEVBQ0MsZ0JBQWdCO0FBQUEsRUFDaEI7QUFBQSxFQUNBLEVBQUUsTUFBTSxLQUFLO0FBQ2Q7QUFFQSxTQUFTLEdBQTJCLGlCQUFpQixhQUFhLEVBQUU7QUFBQSxFQUNuRSxjQUFjO0FBQUEsRUFDZCxNQUFtQztBQUFBLElBQ2xDLGVBQXdCO0FBQ3ZCLGFBQU87QUFBQSxJQUNSO0FBQUEsSUFDQSxZQUFvQjtBQUNuQixhQUFPO0FBQUEsSUFDUjtBQUFBLElBQ0EsWUFBWSxzQkFBNEQ7QUFDdkUsYUFBTyxxQkFBcUIsZUFBZSxhQUFhO0FBQUEsSUFDekQ7QUFBQSxFQUNEO0FBQ0Q7QUFHQSxnQkFBZ0IsY0FBYyxRQUFRO0FBQUEsRUFFckMsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSxjQUFjLHFCQUFxQjtBQUFBLE1BQ3BELFVBQVUsV0FBVztBQUFBLE1BQ3JCLElBQUk7QUFBQSxJQUNMLENB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
