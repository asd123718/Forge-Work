import { Emitter } from "../../../../base/common/event.js";
import { localize } from "../../../../nls.js";
import { Extensions, ConfigurationScope } from "../../../../platform/configuration/common/configurationRegistry.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
const IBreadcrumbsService = createDecorator("IEditorBreadcrumbsService");
class BreadcrumbsService {
  constructor() {
    this._map = /* @__PURE__ */ new Map();
  }
  register(group, widget) {
    if (this._map.has(group)) {
      throw new Error(`group (${group}) has already a widget`);
    }
    this._map.set(group, widget);
    return {
      dispose: () => this._map.delete(group)
    };
  }
  getWidget(group) {
    return this._map.get(group);
  }
}
registerSingleton(IBreadcrumbsService, BreadcrumbsService, InstantiationType.Delayed);
const _BreadcrumbsConfig = class _BreadcrumbsConfig {
  constructor() {
  }
  static _stub(name) {
    return {
      bindTo(service) {
        const onDidChange = new Emitter();
        const listener = service.onDidChangeConfiguration((e) => {
          if (e.affectsConfiguration(name)) {
            onDidChange.fire(void 0);
          }
        });
        return new class {
          constructor() {
            this.name = name;
            this.onDidChange = onDidChange.event;
          }
          getValue(overrides) {
            if (overrides) {
              return service.getValue(name, overrides);
            } else {
              return service.getValue(name);
            }
          }
          updateValue(newValue, overrides) {
            if (overrides) {
              return service.updateValue(name, newValue, overrides);
            } else {
              return service.updateValue(name, newValue);
            }
          }
          dispose() {
            listener.dispose();
            onDidChange.dispose();
          }
        }();
      }
    };
  }
};
_BreadcrumbsConfig.IsEnabled = _BreadcrumbsConfig._stub("breadcrumbs.enabled");
_BreadcrumbsConfig.UseQuickPick = _BreadcrumbsConfig._stub("breadcrumbs.useQuickPick");
_BreadcrumbsConfig.FilePath = _BreadcrumbsConfig._stub("breadcrumbs.filePath");
_BreadcrumbsConfig.SymbolPath = _BreadcrumbsConfig._stub("breadcrumbs.symbolPath");
_BreadcrumbsConfig.SymbolSortOrder = _BreadcrumbsConfig._stub("breadcrumbs.symbolSortOrder");
_BreadcrumbsConfig.SymbolPathSeparator = _BreadcrumbsConfig._stub("breadcrumbs.symbolPathSeparator");
_BreadcrumbsConfig.Icons = _BreadcrumbsConfig._stub("breadcrumbs.icons");
_BreadcrumbsConfig.ShowEditorType = _BreadcrumbsConfig._stub("breadcrumbs.showEditorType");
_BreadcrumbsConfig.TitleScrollbarSizing = _BreadcrumbsConfig._stub("workbench.editor.titleScrollbarSizing");
_BreadcrumbsConfig.TitleScrollbarVisibility = _BreadcrumbsConfig._stub("workbench.editor.titleScrollbarVisibility");
_BreadcrumbsConfig.FileExcludes = _BreadcrumbsConfig._stub("files.exclude");
let BreadcrumbsConfig = _BreadcrumbsConfig;
Registry.as(Extensions.Configuration).registerConfiguration({
  id: "breadcrumbs",
  title: localize("title", "Breadcrumb Navigation"),
  order: 101,
  type: "object",
  properties: {
    "breadcrumbs.enabled": {
      description: localize("enabled", "Enable/disable navigation breadcrumbs."),
      type: "boolean",
      default: true,
      agentsWindow: { default: true }
    },
    "breadcrumbs.filePath": {
      description: localize("filepath", "Controls whether and how file paths are shown in the breadcrumbs view."),
      type: "string",
      default: "on",
      enum: ["on", "off", "last"],
      enumDescriptions: [
        localize("filepath.on", "Show the file path in the breadcrumbs view."),
        localize("filepath.off", "Do not show the file path in the breadcrumbs view."),
        localize("filepath.last", "Only show the last element of the file path in the breadcrumbs view.")
      ]
    },
    "breadcrumbs.symbolPath": {
      description: localize("symbolpath", "Controls whether and how symbols are shown in the breadcrumbs view."),
      type: "string",
      default: "on",
      enum: ["on", "off", "last"],
      enumDescriptions: [
        localize("symbolpath.on", "Show all symbols in the breadcrumbs view."),
        localize("symbolpath.off", "Do not show symbols in the breadcrumbs view."),
        localize("symbolpath.last", "Only show the current symbol in the breadcrumbs view.")
      ]
    },
    "breadcrumbs.symbolSortOrder": {
      description: localize("symbolSortOrder", "Controls how symbols are sorted in the breadcrumbs outline view."),
      type: "string",
      default: "position",
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      enum: ["position", "name", "type"],
      enumDescriptions: [
        localize("symbolSortOrder.position", "Show symbol outline in file position order."),
        localize("symbolSortOrder.name", "Show symbol outline in alphabetical order."),
        localize("symbolSortOrder.type", "Show symbol outline in symbol type order.")
      ]
    },
    "breadcrumbs.icons": {
      description: localize("icons", "Render breadcrumb items with icons."),
      type: "boolean",
      default: true
    },
    "breadcrumbs.showEditorType": {
      markdownDescription: localize("showEditorType", "Controls whether the breadcrumbs bar shows a dropdown to switch between the editors that can open the current file (for example the text editor and a custom editor). The dropdown only appears when a more specialized editor is available."),
      type: "boolean",
      default: true,
      tags: ["experimental"]
    },
    "breadcrumbs.symbolPathSeparator": {
      description: localize("symbolPathSeparator", "The separator used when copying the breadcrumb symbol path."),
      type: "string",
      default: ".",
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "breadcrumbs.showFiles": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.file", "When enabled breadcrumbs show `file`-symbols.")
    },
    "breadcrumbs.showModules": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.module", "When enabled breadcrumbs show `module`-symbols.")
    },
    "breadcrumbs.showNamespaces": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.namespace", "When enabled breadcrumbs show `namespace`-symbols.")
    },
    "breadcrumbs.showPackages": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.package", "When enabled breadcrumbs show `package`-symbols.")
    },
    "breadcrumbs.showClasses": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.class", "When enabled breadcrumbs show `class`-symbols.")
    },
    "breadcrumbs.showMethods": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.method", "When enabled breadcrumbs show `method`-symbols.")
    },
    "breadcrumbs.showProperties": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.property", "When enabled breadcrumbs show `property`-symbols.")
    },
    "breadcrumbs.showFields": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.field", "When enabled breadcrumbs show `field`-symbols.")
    },
    "breadcrumbs.showConstructors": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.constructor", "When enabled breadcrumbs show `constructor`-symbols.")
    },
    "breadcrumbs.showEnums": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.enum", "When enabled breadcrumbs show `enum`-symbols.")
    },
    "breadcrumbs.showInterfaces": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.interface", "When enabled breadcrumbs show `interface`-symbols.")
    },
    "breadcrumbs.showFunctions": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.function", "When enabled breadcrumbs show `function`-symbols.")
    },
    "breadcrumbs.showVariables": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.variable", "When enabled breadcrumbs show `variable`-symbols.")
    },
    "breadcrumbs.showConstants": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.constant", "When enabled breadcrumbs show `constant`-symbols.")
    },
    "breadcrumbs.showStrings": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.string", "When enabled breadcrumbs show `string`-symbols.")
    },
    "breadcrumbs.showNumbers": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.number", "When enabled breadcrumbs show `number`-symbols.")
    },
    "breadcrumbs.showBooleans": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.boolean", "When enabled breadcrumbs show `boolean`-symbols.")
    },
    "breadcrumbs.showArrays": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.array", "When enabled breadcrumbs show `array`-symbols.")
    },
    "breadcrumbs.showObjects": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.object", "When enabled breadcrumbs show `object`-symbols.")
    },
    "breadcrumbs.showKeys": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.key", "When enabled breadcrumbs show `key`-symbols.")
    },
    "breadcrumbs.showNull": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.null", "When enabled breadcrumbs show `null`-symbols.")
    },
    "breadcrumbs.showEnumMembers": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.enumMember", "When enabled breadcrumbs show `enumMember`-symbols.")
    },
    "breadcrumbs.showStructs": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.struct", "When enabled breadcrumbs show `struct`-symbols.")
    },
    "breadcrumbs.showEvents": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.event", "When enabled breadcrumbs show `event`-symbols.")
    },
    "breadcrumbs.showOperators": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.operator", "When enabled breadcrumbs show `operator`-symbols.")
    },
    "breadcrumbs.showTypeParameters": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.typeParameter", "When enabled breadcrumbs show `typeParameter`-symbols.")
    }
  }
});
export {
  BreadcrumbsConfig,
  BreadcrumbsService,
  IBreadcrumbsService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXGJyZWFkY3J1bWJzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQnJlYWRjcnVtYnNXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnJlYWRjcnVtYnMvYnJlYWRjcnVtYnNXaWRnZXQuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgKiBhcyBnbG9iIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2dsb2IuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgQ29uZmlndXJhdGlvblNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBHcm91cElkZW50aWZpZXIsIElFZGl0b3JQYXJ0T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuXG5leHBvcnQgY29uc3QgSUJyZWFkY3J1bWJzU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJQnJlYWRjcnVtYnNTZXJ2aWNlPignSUVkaXRvckJyZWFkY3J1bWJzU2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElCcmVhZGNydW1ic1NlcnZpY2Uge1xuXG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWdpc3Rlcihncm91cDogR3JvdXBJZGVudGlmaWVyLCB3aWRnZXQ6IEJyZWFkY3J1bWJzV2lkZ2V0KTogSURpc3Bvc2FibGU7XG5cblx0Z2V0V2lkZ2V0KGdyb3VwOiBHcm91cElkZW50aWZpZXIpOiBCcmVhZGNydW1ic1dpZGdldCB8IHVuZGVmaW5lZDtcbn1cblxuXG5leHBvcnQgY2xhc3MgQnJlYWRjcnVtYnNTZXJ2aWNlIGltcGxlbWVudHMgSUJyZWFkY3J1bWJzU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbWFwID0gbmV3IE1hcDxudW1iZXIsIEJyZWFkY3J1bWJzV2lkZ2V0PigpO1xuXG5cdHJlZ2lzdGVyKGdyb3VwOiBudW1iZXIsIHdpZGdldDogQnJlYWRjcnVtYnNXaWRnZXQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0aWYgKHRoaXMuX21hcC5oYXMoZ3JvdXApKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGdyb3VwICgke2dyb3VwfSkgaGFzIGFscmVhZHkgYSB3aWRnZXRgKTtcblx0XHR9XG5cdFx0dGhpcy5fbWFwLnNldChncm91cCwgd2lkZ2V0KTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4gdGhpcy5fbWFwLmRlbGV0ZShncm91cClcblx0XHR9O1xuXHR9XG5cblx0Z2V0V2lkZ2V0KGdyb3VwOiBudW1iZXIpOiBCcmVhZGNydW1ic1dpZGdldCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX21hcC5nZXQoZ3JvdXApO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElCcmVhZGNydW1ic1NlcnZpY2UsIEJyZWFkY3J1bWJzU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5cblxuLy8jcmVnaW9uIGNvbmZpZ1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQnJlYWRjcnVtYnNDb25maWc8VD4ge1xuXG5cdGFic3RyYWN0IGdldCBuYW1lKCk6IHN0cmluZztcblx0YWJzdHJhY3QgZ2V0IG9uRGlkQ2hhbmdlKCk6IEV2ZW50PHZvaWQ+O1xuXG5cdGFic3RyYWN0IGdldFZhbHVlKG92ZXJyaWRlcz86IElDb25maWd1cmF0aW9uT3ZlcnJpZGVzKTogVDtcblx0YWJzdHJhY3QgdXBkYXRlVmFsdWUodmFsdWU6IFQsIG92ZXJyaWRlcz86IElDb25maWd1cmF0aW9uT3ZlcnJpZGVzKTogUHJvbWlzZTx2b2lkPjtcblx0YWJzdHJhY3QgZGlzcG9zZSgpOiB2b2lkO1xuXG5cdHByaXZhdGUgY29uc3RydWN0b3IoKSB7XG5cdFx0Ly8gaW50ZXJuYWxcblx0fVxuXG5cdHN0YXRpYyByZWFkb25seSBJc0VuYWJsZWQgPSBCcmVhZGNydW1ic0NvbmZpZy5fc3R1Yjxib29sZWFuPignYnJlYWRjcnVtYnMuZW5hYmxlZCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVXNlUXVpY2tQaWNrID0gQnJlYWRjcnVtYnNDb25maWcuX3N0dWI8Ym9vbGVhbj4oJ2JyZWFkY3J1bWJzLnVzZVF1aWNrUGljaycpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRmlsZVBhdGggPSBCcmVhZGNydW1ic0NvbmZpZy5fc3R1Yjwnb24nIHwgJ29mZicgfCAnbGFzdCc+KCdicmVhZGNydW1icy5maWxlUGF0aCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgU3ltYm9sUGF0aCA9IEJyZWFkY3J1bWJzQ29uZmlnLl9zdHViPCdvbicgfCAnb2ZmJyB8ICdsYXN0Jz4oJ2JyZWFkY3J1bWJzLnN5bWJvbFBhdGgnKTtcblx0c3RhdGljIHJlYWRvbmx5IFN5bWJvbFNvcnRPcmRlciA9IEJyZWFkY3J1bWJzQ29uZmlnLl9zdHViPCdwb3NpdGlvbicgfCAnbmFtZScgfCAndHlwZSc+KCdicmVhZGNydW1icy5zeW1ib2xTb3J0T3JkZXInKTtcblx0c3RhdGljIHJlYWRvbmx5IFN5bWJvbFBhdGhTZXBhcmF0b3IgPSBCcmVhZGNydW1ic0NvbmZpZy5fc3R1YjxzdHJpbmc+KCdicmVhZGNydW1icy5zeW1ib2xQYXRoU2VwYXJhdG9yJyk7XG5cdHN0YXRpYyByZWFkb25seSBJY29ucyA9IEJyZWFkY3J1bWJzQ29uZmlnLl9zdHViPGJvb2xlYW4+KCdicmVhZGNydW1icy5pY29ucycpO1xuXHRzdGF0aWMgcmVhZG9ubHkgU2hvd0VkaXRvclR5cGUgPSBCcmVhZGNydW1ic0NvbmZpZy5fc3R1Yjxib29sZWFuPignYnJlYWRjcnVtYnMuc2hvd0VkaXRvclR5cGUnKTtcblx0c3RhdGljIHJlYWRvbmx5IFRpdGxlU2Nyb2xsYmFyU2l6aW5nID0gQnJlYWRjcnVtYnNDb25maWcuX3N0dWI8SUVkaXRvclBhcnRPcHRpb25zWyd0aXRsZVNjcm9sbGJhclNpemluZyddPignd29ya2JlbmNoLmVkaXRvci50aXRsZVNjcm9sbGJhclNpemluZycpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVGl0bGVTY3JvbGxiYXJWaXNpYmlsaXR5ID0gQnJlYWRjcnVtYnNDb25maWcuX3N0dWI8SUVkaXRvclBhcnRPcHRpb25zWyd0aXRsZVNjcm9sbGJhclZpc2liaWxpdHknXT4oJ3dvcmtiZW5jaC5lZGl0b3IudGl0bGVTY3JvbGxiYXJWaXNpYmlsaXR5Jyk7XG5cblx0c3RhdGljIHJlYWRvbmx5IEZpbGVFeGNsdWRlcyA9IEJyZWFkY3J1bWJzQ29uZmlnLl9zdHViPGdsb2IuSUV4cHJlc3Npb24+KCdmaWxlcy5leGNsdWRlJyk7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3N0dWI8VD4obmFtZTogc3RyaW5nKTogeyBiaW5kVG8oc2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogQnJlYWRjcnVtYnNDb25maWc8VD4gfSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGJpbmRUbyhzZXJ2aWNlKSB7XG5cdFx0XHRcdGNvbnN0IG9uRGlkQ2hhbmdlID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblxuXHRcdFx0XHRjb25zdCBsaXN0ZW5lciA9IHNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKG5hbWUpKSB7XG5cdFx0XHRcdFx0XHRvbkRpZENoYW5nZS5maXJlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRyZXR1cm4gbmV3IGNsYXNzIGltcGxlbWVudHMgQnJlYWRjcnVtYnNDb25maWc8VD4ge1xuXHRcdFx0XHRcdHJlYWRvbmx5IG5hbWUgPSBuYW1lO1xuXHRcdFx0XHRcdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gb25EaWRDaGFuZ2UuZXZlbnQ7XG5cdFx0XHRcdFx0Z2V0VmFsdWUob3ZlcnJpZGVzPzogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMpOiBUIHtcblx0XHRcdFx0XHRcdGlmIChvdmVycmlkZXMpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHNlcnZpY2UuZ2V0VmFsdWUobmFtZSwgb3ZlcnJpZGVzKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBzZXJ2aWNlLmdldFZhbHVlKG5hbWUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR1cGRhdGVWYWx1ZShuZXdWYWx1ZTogVCwgb3ZlcnJpZGVzPzogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRcdGlmIChvdmVycmlkZXMpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHNlcnZpY2UudXBkYXRlVmFsdWUobmFtZSwgbmV3VmFsdWUsIG92ZXJyaWRlcyk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gc2VydmljZS51cGRhdGVWYWx1ZShuYW1lLCBuZXdWYWx1ZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0XHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRvbkRpZENoYW5nZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRpZDogJ2JyZWFkY3J1bWJzJyxcblx0dGl0bGU6IGxvY2FsaXplKCd0aXRsZScsIFwiQnJlYWRjcnVtYiBOYXZpZ2F0aW9uXCIpLFxuXHRvcmRlcjogMTAxLFxuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdCdicmVhZGNydW1icy5lbmFibGVkJzoge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdlbmFibGVkJywgXCJFbmFibGUvZGlzYWJsZSBuYXZpZ2F0aW9uIGJyZWFkY3J1bWJzLlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRhZ2VudHNXaW5kb3c6IHsgZGVmYXVsdDogdHJ1ZSB9LFxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLmZpbGVQYXRoJzoge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWxlcGF0aCcsIFwiQ29udHJvbHMgd2hldGhlciBhbmQgaG93IGZpbGUgcGF0aHMgYXJlIHNob3duIGluIHRoZSBicmVhZGNydW1icyB2aWV3LlwiKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVmYXVsdDogJ29uJyxcblx0XHRcdGVudW06IFsnb24nLCAnb2ZmJywgJ2xhc3QnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoJ2ZpbGVwYXRoLm9uJywgXCJTaG93IHRoZSBmaWxlIHBhdGggaW4gdGhlIGJyZWFkY3J1bWJzIHZpZXcuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnZmlsZXBhdGgub2ZmJywgXCJEbyBub3Qgc2hvdyB0aGUgZmlsZSBwYXRoIGluIHRoZSBicmVhZGNydW1icyB2aWV3LlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2ZpbGVwYXRoLmxhc3QnLCBcIk9ubHkgc2hvdyB0aGUgbGFzdCBlbGVtZW50IG9mIHRoZSBmaWxlIHBhdGggaW4gdGhlIGJyZWFkY3J1bWJzIHZpZXcuXCIpLFxuXHRcdFx0XVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLnN5bWJvbFBhdGgnOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3N5bWJvbHBhdGgnLCBcIkNvbnRyb2xzIHdoZXRoZXIgYW5kIGhvdyBzeW1ib2xzIGFyZSBzaG93biBpbiB0aGUgYnJlYWRjcnVtYnMgdmlldy5cIiksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlZmF1bHQ6ICdvbicsXG5cdFx0XHRlbnVtOiBbJ29uJywgJ29mZicsICdsYXN0J10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKCdzeW1ib2xwYXRoLm9uJywgXCJTaG93IGFsbCBzeW1ib2xzIGluIHRoZSBicmVhZGNydW1icyB2aWV3LlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3N5bWJvbHBhdGgub2ZmJywgXCJEbyBub3Qgc2hvdyBzeW1ib2xzIGluIHRoZSBicmVhZGNydW1icyB2aWV3LlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3N5bWJvbHBhdGgubGFzdCcsIFwiT25seSBzaG93IHRoZSBjdXJyZW50IHN5bWJvbCBpbiB0aGUgYnJlYWRjcnVtYnMgdmlldy5cIiksXG5cdFx0XHRdXG5cdFx0fSxcblx0XHQnYnJlYWRjcnVtYnMuc3ltYm9sU29ydE9yZGVyJzoge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzeW1ib2xTb3J0T3JkZXInLCBcIkNvbnRyb2xzIGhvdyBzeW1ib2xzIGFyZSBzb3J0ZWQgaW4gdGhlIGJyZWFkY3J1bWJzIG91dGxpbmUgdmlldy5cIiksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlZmF1bHQ6ICdwb3NpdGlvbicsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0ZW51bTogWydwb3NpdGlvbicsICduYW1lJywgJ3R5cGUnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoJ3N5bWJvbFNvcnRPcmRlci5wb3NpdGlvbicsIFwiU2hvdyBzeW1ib2wgb3V0bGluZSBpbiBmaWxlIHBvc2l0aW9uIG9yZGVyLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3N5bWJvbFNvcnRPcmRlci5uYW1lJywgXCJTaG93IHN5bWJvbCBvdXRsaW5lIGluIGFscGhhYmV0aWNhbCBvcmRlci5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdzeW1ib2xTb3J0T3JkZXIudHlwZScsIFwiU2hvdyBzeW1ib2wgb3V0bGluZSBpbiBzeW1ib2wgdHlwZSBvcmRlci5cIiksXG5cdFx0XHRdXG5cdFx0fSxcblx0XHQnYnJlYWRjcnVtYnMuaWNvbnMnOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ljb25zJywgXCJSZW5kZXIgYnJlYWRjcnVtYiBpdGVtcyB3aXRoIGljb25zLlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHR9LFxuXHRcdCdicmVhZGNydW1icy5zaG93RWRpdG9yVHlwZSc6IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdzaG93RWRpdG9yVHlwZScsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgYnJlYWRjcnVtYnMgYmFyIHNob3dzIGEgZHJvcGRvd24gdG8gc3dpdGNoIGJldHdlZW4gdGhlIGVkaXRvcnMgdGhhdCBjYW4gb3BlbiB0aGUgY3VycmVudCBmaWxlIChmb3IgZXhhbXBsZSB0aGUgdGV4dCBlZGl0b3IgYW5kIGEgY3VzdG9tIGVkaXRvcikuIFRoZSBkcm9wZG93biBvbmx5IGFwcGVhcnMgd2hlbiBhIG1vcmUgc3BlY2lhbGl6ZWQgZWRpdG9yIGlzIGF2YWlsYWJsZS5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLnN5bWJvbFBhdGhTZXBhcmF0b3InOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3N5bWJvbFBhdGhTZXBhcmF0b3InLCBcIlRoZSBzZXBhcmF0b3IgdXNlZCB3aGVuIGNvcHlpbmcgdGhlIGJyZWFkY3J1bWIgc3ltYm9sIHBhdGguXCIpLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZWZhdWx0OiAnLicsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFXG5cdFx0fSxcblx0XHQnYnJlYWRjcnVtYnMuc2hvd0ZpbGVzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5maWxlJywgXCJXaGVuIGVuYWJsZWQgYnJlYWRjcnVtYnMgc2hvdyBgZmlsZWAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdicmVhZGNydW1icy5zaG93TW9kdWxlcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMubW9kdWxlJywgXCJXaGVuIGVuYWJsZWQgYnJlYWRjcnVtYnMgc2hvdyBgbW9kdWxlYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLnNob3dOYW1lc3BhY2VzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5uYW1lc3BhY2UnLCBcIldoZW4gZW5hYmxlZCBicmVhZGNydW1icyBzaG93IGBuYW1lc3BhY2VgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnYnJlYWRjcnVtYnMuc2hvd1BhY2thZ2VzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5wYWNrYWdlJywgXCJXaGVuIGVuYWJsZWQgYnJlYWRjcnVtYnMgc2hvdyBgcGFja2FnZWAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdicmVhZGNydW1icy5zaG93Q2xhc3Nlcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMuY2xhc3MnLCBcIldoZW4gZW5hYmxlZCBicmVhZGNydW1icyBzaG93IGBjbGFzc2Atc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdicmVhZGNydW1icy5zaG93TWV0aG9kcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMubWV0aG9kJywgXCJXaGVuIGVuYWJsZWQgYnJlYWRjcnVtYnMgc2hvdyBgbWV0aG9kYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLnNob3dQcm9wZXJ0aWVzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5wcm9wZXJ0eScsIFwiV2hlbiBlbmFibGVkIGJyZWFkY3J1bWJzIHNob3cgYHByb3BlcnR5YC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLnNob3dGaWVsZHMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLmZpZWxkJywgXCJXaGVuIGVuYWJsZWQgYnJlYWRjcnVtYnMgc2hvdyBgZmllbGRgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnYnJlYWRjcnVtYnMuc2hvd0NvbnN0cnVjdG9ycyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMuY29uc3RydWN0b3InLCBcIldoZW4gZW5hYmxlZCBicmVhZGNydW1icyBzaG93IGBjb25zdHJ1Y3RvcmAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdicmVhZGNydW1icy5zaG93RW51bXMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLmVudW0nLCBcIldoZW4gZW5hYmxlZCBicmVhZGNydW1icyBzaG93IGBlbnVtYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLnNob3dJbnRlcmZhY2VzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5pbnRlcmZhY2UnLCBcIldoZW4gZW5hYmxlZCBicmVhZGNydW1icyBzaG93IGBpbnRlcmZhY2VgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnYnJlYWRjcnVtYnMuc2hvd0Z1bmN0aW9ucyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMuZnVuY3Rpb24nLCBcIldoZW4gZW5hYmxlZCBicmVhZGNydW1icyBzaG93IGBmdW5jdGlvbmAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdicmVhZGNydW1icy5zaG93VmFyaWFibGVzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy52YXJpYWJsZScsIFwiV2hlbiBlbmFibGVkIGJyZWFkY3J1bWJzIHNob3cgYHZhcmlhYmxlYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLnNob3dDb25zdGFudHMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLmNvbnN0YW50JywgXCJXaGVuIGVuYWJsZWQgYnJlYWRjcnVtYnMgc2hvdyBgY29uc3RhbnRgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnYnJlYWRjcnVtYnMuc2hvd1N0cmluZ3MnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLnN0cmluZycsIFwiV2hlbiBlbmFibGVkIGJyZWFkY3J1bWJzIHNob3cgYHN0cmluZ2Atc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdicmVhZGNydW1icy5zaG93TnVtYmVycyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMubnVtYmVyJywgXCJXaGVuIGVuYWJsZWQgYnJlYWRjcnVtYnMgc2hvdyBgbnVtYmVyYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLnNob3dCb29sZWFucyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMuYm9vbGVhbicsIFwiV2hlbiBlbmFibGVkIGJyZWFkY3J1bWJzIHNob3cgYGJvb2xlYW5gLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnYnJlYWRjcnVtYnMuc2hvd0FycmF5cyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMuYXJyYXknLCBcIldoZW4gZW5hYmxlZCBicmVhZGNydW1icyBzaG93IGBhcnJheWAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdicmVhZGNydW1icy5zaG93T2JqZWN0cyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMub2JqZWN0JywgXCJXaGVuIGVuYWJsZWQgYnJlYWRjcnVtYnMgc2hvdyBgb2JqZWN0YC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLnNob3dLZXlzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5rZXknLCBcIldoZW4gZW5hYmxlZCBicmVhZGNydW1icyBzaG93IGBrZXlgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnYnJlYWRjcnVtYnMuc2hvd051bGwnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLm51bGwnLCBcIldoZW4gZW5hYmxlZCBicmVhZGNydW1icyBzaG93IGBudWxsYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLnNob3dFbnVtTWVtYmVycyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMuZW51bU1lbWJlcicsIFwiV2hlbiBlbmFibGVkIGJyZWFkY3J1bWJzIHNob3cgYGVudW1NZW1iZXJgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnYnJlYWRjcnVtYnMuc2hvd1N0cnVjdHMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLnN0cnVjdCcsIFwiV2hlbiBlbmFibGVkIGJyZWFkY3J1bWJzIHNob3cgYHN0cnVjdGAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdicmVhZGNydW1icy5zaG93RXZlbnRzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5ldmVudCcsIFwiV2hlbiBlbmFibGVkIGJyZWFkY3J1bWJzIHNob3cgYGV2ZW50YC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLnNob3dPcGVyYXRvcnMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLm9wZXJhdG9yJywgXCJXaGVuIGVuYWJsZWQgYnJlYWRjcnVtYnMgc2hvdyBgb3BlcmF0b3JgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnYnJlYWRjcnVtYnMuc2hvd1R5cGVQYXJhbWV0ZXJzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy50eXBlUGFyYW1ldGVyJywgXCJXaGVuIGVuYWJsZWQgYnJlYWRjcnVtYnMgc2hvdyBgdHlwZVBhcmFtZXRlcmAtc3ltYm9scy5cIilcblx0XHR9XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsZUFBc0I7QUFHL0IsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxZQUFvQywwQkFBMEI7QUFDdkUsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCO0FBR2xCLE1BQU0sc0JBQXNCLGdCQUFxQywyQkFBMkI7QUFZNUYsTUFBTSxtQkFBa0Q7QUFBQSxFQUF4RDtBQUlOLFNBQWlCLE9B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
