import { localize, localize2 } from "../../../../nls.js";
import { Extensions as ViewExtensions } from "../../../common/views.js";
import { OutlinePane } from "./outlinePane.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../platform/configuration/common/configurationRegistry.js";
import { VIEW_CONTAINER } from "../../files/browser/explorerViewlet.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { OutlineConfigKeys } from "../../../services/outline/browser/outline.js";
import { IOutlinePane } from "./outline.js";
import "./outlineActions.js";
const outlineViewIcon = registerIcon("outline-view-icon", Codicon.symbolClass, localize("outlineViewIcon", "View icon of the outline view."));
Registry.as(ViewExtensions.ViewsRegistry).registerViews([{
  id: IOutlinePane.Id,
  name: localize2("name", "Outline"),
  containerIcon: outlineViewIcon,
  ctorDescriptor: new SyncDescriptor(OutlinePane),
  canToggleVisibility: true,
  canMoveView: true,
  hideByDefault: false,
  collapsed: true,
  order: 2,
  weight: 30,
  focusCommand: { id: "outline.focus" }
}], VIEW_CONTAINER);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  "id": "outline",
  "order": 117,
  "title": localize("outlineConfigurationTitle", "Outline"),
  "type": "object",
  "properties": {
    [OutlineConfigKeys.icons]: {
      "description": localize("outline.showIcons", "Render Outline elements with icons."),
      "type": "boolean",
      "default": true
    },
    [OutlineConfigKeys.collapseItems]: {
      "description": localize("outline.initialState", "Controls whether Outline items are collapsed or expanded."),
      "type": "string",
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      "enum": [
        "alwaysCollapse",
        "alwaysExpand"
      ],
      "enumDescriptions": [
        localize("outline.initialState.collapsed", "Collapse all items."),
        localize("outline.initialState.expanded", "Expand all items.")
      ],
      "default": "alwaysExpand"
    },
    [OutlineConfigKeys.problemsEnabled]: {
      "markdownDescription": localize("outline.showProblem", "Show errors and warnings on Outline elements. Overwritten by {0} when it is off.", "`#problems.visibility#`"),
      "type": "boolean",
      "default": true
    },
    [OutlineConfigKeys.problemsColors]: {
      "markdownDescription": localize("outline.problem.colors", "Use colors for errors and warnings on Outline elements. Overwritten by {0} when it is off.", "`#problems.visibility#`"),
      "type": "boolean",
      "default": true
    },
    [OutlineConfigKeys.problemsBadges]: {
      "markdownDescription": localize("outline.problems.badges", "Use badges for errors and warnings on Outline elements. Overwritten by {0} when it is off.", "`#problems.visibility#`"),
      "type": "boolean",
      "default": true
    },
    "outline.showFiles": {
      type: "boolean",
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      default: true,
      markdownDescription: localize("filteredTypes.file", "When enabled, Outline shows `file`-symbols.")
    },
    "outline.showModules": {
      type: "boolean",
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      default: true,
      markdownDescription: localize("filteredTypes.module", "When enabled, Outline shows `module`-symbols.")
    },
    "outline.showNamespaces": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.namespace", "When enabled, Outline shows `namespace`-symbols.")
    },
    "outline.showPackages": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.package", "When enabled, Outline shows `package`-symbols.")
    },
    "outline.showClasses": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.class", "When enabled, Outline shows `class`-symbols.")
    },
    "outline.showMethods": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.method", "When enabled, Outline shows `method`-symbols.")
    },
    "outline.showProperties": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.property", "When enabled, Outline shows `property`-symbols.")
    },
    "outline.showFields": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.field", "When enabled, Outline shows `field`-symbols.")
    },
    "outline.showConstructors": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.constructor", "When enabled, Outline shows `constructor`-symbols.")
    },
    "outline.showEnums": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.enum", "When enabled, Outline shows `enum`-symbols.")
    },
    "outline.showInterfaces": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.interface", "When enabled, Outline shows `interface`-symbols.")
    },
    "outline.showFunctions": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.function", "When enabled, Outline shows `function`-symbols.")
    },
    "outline.showVariables": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.variable", "When enabled, Outline shows `variable`-symbols.")
    },
    "outline.showConstants": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.constant", "When enabled, Outline shows `constant`-symbols.")
    },
    "outline.showStrings": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.string", "When enabled, Outline shows `string`-symbols.")
    },
    "outline.showNumbers": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.number", "When enabled, Outline shows `number`-symbols.")
    },
    "outline.showBooleans": {
      type: "boolean",
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      default: true,
      markdownDescription: localize("filteredTypes.boolean", "When enabled, Outline shows `boolean`-symbols.")
    },
    "outline.showArrays": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.array", "When enabled, Outline shows `array`-symbols.")
    },
    "outline.showObjects": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.object", "When enabled, Outline shows `object`-symbols.")
    },
    "outline.showKeys": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.key", "When enabled, Outline shows `key`-symbols.")
    },
    "outline.showNull": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.null", "When enabled, Outline shows `null`-symbols.")
    },
    "outline.showEnumMembers": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.enumMember", "When enabled, Outline shows `enumMember`-symbols.")
    },
    "outline.showStructs": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.struct", "When enabled, Outline shows `struct`-symbols.")
    },
    "outline.showEvents": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.event", "When enabled, Outline shows `event`-symbols.")
    },
    "outline.showOperators": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.operator", "When enabled, Outline shows `operator`-symbols.")
    },
    "outline.showTypeParameters": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.typeParameter", "When enabled, Outline shows `typeParameter`-symbols.")
    }
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG91dGxpbmVcXGJyb3dzZXJcXG91dGxpbmUuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJVmlld3NSZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBWaWV3RXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBPdXRsaW5lUGFuZSB9IGZyb20gJy4vb3V0bGluZVBhbmUuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgQ29uZmlndXJhdGlvblNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFZJRVdfQ09OVEFJTkVSIH0gZnJvbSAnLi4vLi4vZmlsZXMvYnJvd3Nlci9leHBsb3JlclZpZXdsZXQuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBPdXRsaW5lQ29uZmlnS2V5cyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL291dGxpbmUvYnJvd3Nlci9vdXRsaW5lLmpzJztcbmltcG9ydCB7IElPdXRsaW5lUGFuZSB9IGZyb20gJy4vb3V0bGluZS5qcyc7XG5cbi8vIC0tLSBhY3Rpb25zXG5cbmltcG9ydCAnLi9vdXRsaW5lQWN0aW9ucy5qcyc7XG5cbi8vIC0tLSB2aWV3XG5cbmNvbnN0IG91dGxpbmVWaWV3SWNvbiA9IHJlZ2lzdGVySWNvbignb3V0bGluZS12aWV3LWljb24nLCBDb2RpY29uLnN5bWJvbENsYXNzLCBsb2NhbGl6ZSgnb3V0bGluZVZpZXdJY29uJywgJ1ZpZXcgaWNvbiBvZiB0aGUgb3V0bGluZSB2aWV3LicpKTtcblxuUmVnaXN0cnkuYXM8SVZpZXdzUmVnaXN0cnk+KFZpZXdFeHRlbnNpb25zLlZpZXdzUmVnaXN0cnkpLnJlZ2lzdGVyVmlld3MoW3tcblx0aWQ6IElPdXRsaW5lUGFuZS5JZCxcblx0bmFtZTogbG9jYWxpemUyKCduYW1lJywgXCJPdXRsaW5lXCIpLFxuXHRjb250YWluZXJJY29uOiBvdXRsaW5lVmlld0ljb24sXG5cdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoT3V0bGluZVBhbmUpLFxuXHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlLFxuXHRjYW5Nb3ZlVmlldzogdHJ1ZSxcblx0aGlkZUJ5RGVmYXVsdDogZmFsc2UsXG5cdGNvbGxhcHNlZDogdHJ1ZSxcblx0b3JkZXI6IDIsXG5cdHdlaWdodDogMzAsXG5cdGZvY3VzQ29tbWFuZDogeyBpZDogJ291dGxpbmUuZm9jdXMnIH1cbn1dLCBWSUVXX0NPTlRBSU5FUik7XG5cbi8vIC0tLSBjb25maWd1cmF0aW9uc1xuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHQnaWQnOiAnb3V0bGluZScsXG5cdCdvcmRlcic6IDExNyxcblx0J3RpdGxlJzogbG9jYWxpemUoJ291dGxpbmVDb25maWd1cmF0aW9uVGl0bGUnLCBcIk91dGxpbmVcIiksXG5cdCd0eXBlJzogJ29iamVjdCcsXG5cdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFtPdXRsaW5lQ29uZmlnS2V5cy5pY29uc106IHtcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdvdXRsaW5lLnNob3dJY29ucycsIFwiUmVuZGVyIE91dGxpbmUgZWxlbWVudHMgd2l0aCBpY29ucy5cIiksXG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZWZhdWx0JzogdHJ1ZVxuXHRcdH0sXG5cdFx0W091dGxpbmVDb25maWdLZXlzLmNvbGxhcHNlSXRlbXNdOiB7XG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnb3V0bGluZS5pbml0aWFsU3RhdGUnLCBcIkNvbnRyb2xzIHdoZXRoZXIgT3V0bGluZSBpdGVtcyBhcmUgY29sbGFwc2VkIG9yIGV4cGFuZGVkLlwiKSxcblx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0J2VudW0nOiBbXG5cdFx0XHRcdCdhbHdheXNDb2xsYXBzZScsXG5cdFx0XHRcdCdhbHdheXNFeHBhbmQnXG5cdFx0XHRdLFxuXHRcdFx0J2VudW1EZXNjcmlwdGlvbnMnOiBbXG5cdFx0XHRcdGxvY2FsaXplKCdvdXRsaW5lLmluaXRpYWxTdGF0ZS5jb2xsYXBzZWQnLCBcIkNvbGxhcHNlIGFsbCBpdGVtcy5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdvdXRsaW5lLmluaXRpYWxTdGF0ZS5leHBhbmRlZCcsIFwiRXhwYW5kIGFsbCBpdGVtcy5cIilcblx0XHRcdF0sXG5cdFx0XHQnZGVmYXVsdCc6ICdhbHdheXNFeHBhbmQnXG5cdFx0fSxcblx0XHRbT3V0bGluZUNvbmZpZ0tleXMucHJvYmxlbXNFbmFibGVkXToge1xuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnb3V0bGluZS5zaG93UHJvYmxlbScsIFwiU2hvdyBlcnJvcnMgYW5kIHdhcm5pbmdzIG9uIE91dGxpbmUgZWxlbWVudHMuIE92ZXJ3cml0dGVuIGJ5IHswfSB3aGVuIGl0IGlzIG9mZi5cIiwgJ2AjcHJvYmxlbXMudmlzaWJpbGl0eSNgJyksXG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZWZhdWx0JzogdHJ1ZVxuXHRcdH0sXG5cdFx0W091dGxpbmVDb25maWdLZXlzLnByb2JsZW1zQ29sb3JzXToge1xuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnb3V0bGluZS5wcm9ibGVtLmNvbG9ycycsIFwiVXNlIGNvbG9ycyBmb3IgZXJyb3JzIGFuZCB3YXJuaW5ncyBvbiBPdXRsaW5lIGVsZW1lbnRzLiBPdmVyd3JpdHRlbiBieSB7MH0gd2hlbiBpdCBpcyBvZmYuXCIsICdgI3Byb2JsZW1zLnZpc2liaWxpdHkjYCcpLFxuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnZGVmYXVsdCc6IHRydWVcblx0XHR9LFxuXHRcdFtPdXRsaW5lQ29uZmlnS2V5cy5wcm9ibGVtc0JhZGdlc106IHtcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbG9jYWxpemUoJ291dGxpbmUucHJvYmxlbXMuYmFkZ2VzJywgXCJVc2UgYmFkZ2VzIGZvciBlcnJvcnMgYW5kIHdhcm5pbmdzIG9uIE91dGxpbmUgZWxlbWVudHMuIE92ZXJ3cml0dGVuIGJ5IHswfSB3aGVuIGl0IGlzIG9mZi5cIiwgJ2AjcHJvYmxlbXMudmlzaWJpbGl0eSNgJyksXG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZWZhdWx0JzogdHJ1ZVxuXHRcdH0sXG5cdFx0J291dGxpbmUuc2hvd0ZpbGVzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5maWxlJywgXCJXaGVuIGVuYWJsZWQsIE91dGxpbmUgc2hvd3MgYGZpbGVgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnb3V0bGluZS5zaG93TW9kdWxlcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMubW9kdWxlJywgXCJXaGVuIGVuYWJsZWQsIE91dGxpbmUgc2hvd3MgYG1vZHVsZWAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdvdXRsaW5lLnNob3dOYW1lc3BhY2VzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5uYW1lc3BhY2UnLCBcIldoZW4gZW5hYmxlZCwgT3V0bGluZSBzaG93cyBgbmFtZXNwYWNlYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J291dGxpbmUuc2hvd1BhY2thZ2VzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5wYWNrYWdlJywgXCJXaGVuIGVuYWJsZWQsIE91dGxpbmUgc2hvd3MgYHBhY2thZ2VgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnb3V0bGluZS5zaG93Q2xhc3Nlcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMuY2xhc3MnLCBcIldoZW4gZW5hYmxlZCwgT3V0bGluZSBzaG93cyBgY2xhc3NgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnb3V0bGluZS5zaG93TWV0aG9kcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMubWV0aG9kJywgXCJXaGVuIGVuYWJsZWQsIE91dGxpbmUgc2hvd3MgYG1ldGhvZGAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdvdXRsaW5lLnNob3dQcm9wZXJ0aWVzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5wcm9wZXJ0eScsIFwiV2hlbiBlbmFibGVkLCBPdXRsaW5lIHNob3dzIGBwcm9wZXJ0eWAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdvdXRsaW5lLnNob3dGaWVsZHMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLmZpZWxkJywgXCJXaGVuIGVuYWJsZWQsIE91dGxpbmUgc2hvd3MgYGZpZWxkYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J291dGxpbmUuc2hvd0NvbnN0cnVjdG9ycyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMuY29uc3RydWN0b3InLCBcIldoZW4gZW5hYmxlZCwgT3V0bGluZSBzaG93cyBgY29uc3RydWN0b3JgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnb3V0bGluZS5zaG93RW51bXMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLmVudW0nLCBcIldoZW4gZW5hYmxlZCwgT3V0bGluZSBzaG93cyBgZW51bWAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdvdXRsaW5lLnNob3dJbnRlcmZhY2VzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5pbnRlcmZhY2UnLCBcIldoZW4gZW5hYmxlZCwgT3V0bGluZSBzaG93cyBgaW50ZXJmYWNlYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J291dGxpbmUuc2hvd0Z1bmN0aW9ucyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMuZnVuY3Rpb24nLCBcIldoZW4gZW5hYmxlZCwgT3V0bGluZSBzaG93cyBgZnVuY3Rpb25gLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnb3V0bGluZS5zaG93VmFyaWFibGVzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy52YXJpYWJsZScsIFwiV2hlbiBlbmFibGVkLCBPdXRsaW5lIHNob3dzIGB2YXJpYWJsZWAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdvdXRsaW5lLnNob3dDb25zdGFudHMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLmNvbnN0YW50JywgXCJXaGVuIGVuYWJsZWQsIE91dGxpbmUgc2hvd3MgYGNvbnN0YW50YC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J291dGxpbmUuc2hvd1N0cmluZ3MnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLnN0cmluZycsIFwiV2hlbiBlbmFibGVkLCBPdXRsaW5lIHNob3dzIGBzdHJpbmdgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnb3V0bGluZS5zaG93TnVtYmVycyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMubnVtYmVyJywgXCJXaGVuIGVuYWJsZWQsIE91dGxpbmUgc2hvd3MgYG51bWJlcmAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdvdXRsaW5lLnNob3dCb29sZWFucyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMuYm9vbGVhbicsIFwiV2hlbiBlbmFibGVkLCBPdXRsaW5lIHNob3dzIGBib29sZWFuYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J291dGxpbmUuc2hvd0FycmF5cyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMuYXJyYXknLCBcIldoZW4gZW5hYmxlZCwgT3V0bGluZSBzaG93cyBgYXJyYXlgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnb3V0bGluZS5zaG93T2JqZWN0cyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMub2JqZWN0JywgXCJXaGVuIGVuYWJsZWQsIE91dGxpbmUgc2hvd3MgYG9iamVjdGAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdvdXRsaW5lLnNob3dLZXlzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5rZXknLCBcIldoZW4gZW5hYmxlZCwgT3V0bGluZSBzaG93cyBga2V5YC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J291dGxpbmUuc2hvd051bGwnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLm51bGwnLCBcIldoZW4gZW5hYmxlZCwgT3V0bGluZSBzaG93cyBgbnVsbGAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdvdXRsaW5lLnNob3dFbnVtTWVtYmVycyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMuZW51bU1lbWJlcicsIFwiV2hlbiBlbmFibGVkLCBPdXRsaW5lIHNob3dzIGBlbnVtTWVtYmVyYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J291dGxpbmUuc2hvd1N0cnVjdHMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLnN0cnVjdCcsIFwiV2hlbiBlbmFibGVkLCBPdXRsaW5lIHNob3dzIGBzdHJ1Y3RgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnb3V0bGluZS5zaG93RXZlbnRzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5ldmVudCcsIFwiV2hlbiBlbmFibGVkLCBPdXRsaW5lIHNob3dzIGBldmVudGAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdvdXRsaW5lLnNob3dPcGVyYXRvcnMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLm9wZXJhdG9yJywgXCJXaGVuIGVuYWJsZWQsIE91dGxpbmUgc2hvd3MgYG9wZXJhdG9yYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J291dGxpbmUuc2hvd1R5cGVQYXJhbWV0ZXJzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy50eXBlUGFyYW1ldGVyJywgXCJXaGVuIGVuYWJsZWQsIE91dGxpbmUgc2hvd3MgYHR5cGVQYXJhbWV0ZXJgLXN5bWJvbHMuXCIpXG5cdFx0fVxuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBeUIsY0FBYyxzQkFBc0I7QUFDN0QsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBaUMsY0FBYyx5QkFBeUIsMEJBQTBCO0FBQ2xHLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZUFBZTtBQUN4QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG9CQUFvQjtBQUk3QixPQUFPO0FBSVAsTUFBTSxrQkFBa0IsYUFBYSxxQkFBcUIsUUFBUSxhQUFhLFNBQVMsbUJBQW1CLGdDQUFnQyxDQUFDO0FBRTVJLFNBQVMsR0FBbUIsZUFBZSxhQUFhLEVBQUUsY0FBYyxDQUFDO0FBQUEsRUFDeEUsSUFBSSxhQUFhO0FBQUEsRUFDakIsTUFBTSxVQUFVLFFBQVEsU0FBUztBQUFBLEVBQ2pDLGVBQWU7QUFBQSxFQUNmLGdCQUFnQixJQUFJLGVBQWUsV0FBVztBQUFBLEVBQzlDLHFCQUFxQjtBQUFBLEVBQ3JCLGFBQWE7QUFBQSxFQUNiLGVBQWU7QUFBQSxFQUNmLFdBQVc7QUFBQSxFQUNYLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLGNBQWMsRUFBRSxJQUFJLGdCQUFnQjtBQUNyQyxDQUFDLEdBQUcsY0FBYztBQUlsQixTQUFTLEdBQTJCLHdCQUF3QixhQUFhLEVBQUUsc0JBQXNCO0FBQUEsRUFDaEcsTUFBTTtBQUFBLEVBQ04sU0FBUztBQUFBLEVBQ1QsU0FBUyxTQUFTLDZCQUE2QixTQUFTO0FBQUEsRUFDeEQsUUFBUTtBQUFBLEVBQ1IsY0FBYztBQUFBLElBQ2IsQ0FBQyxrQkFBa0IsS0FBSyxHQUFHO0FBQUEsTUFDMUIsZUFBZSxTQUFTLHFCQUFxQixxQ0FBcUM7QUFBQSxNQUNsRixRQUFRO0FBQUEsTUFDUixXQUFXO0FBQUEsSUFDWjtBQUFBLElBQ0EsQ0FBQyxrQkFBa0IsYUFBYSxHQUFHO0FBQUEsTUFDbEMsZUFBZSxTQUFTLHdCQUF3QiwyREFBMkQ7QUFBQSxNQUMzRyxRQUFRO0FBQUEsTUFDUixPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLFFBQVE7QUFBQSxRQUNQO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLG9CQUFvQjtBQUFBLFFBQ25CLFNBQVMsa0NBQWtDLHFCQUFxQjtBQUFBLFFBQ2hFLFNBQVMsaUNBQWlDLG1CQUFtQjtBQUFBLE1BQzlEO0FBQUEsTUFDQSxXQUFXO0FBQUEsSUFDWjtBQUFBLElBQ0EsQ0FBQyxrQkFBa0IsZUFBZSxHQUFHO0FBQUEsTUFDcEMsdUJBQXVCLFNBQVMsdUJBQXVCLG9GQUFvRix5QkFBeUI7QUFBQSxNQUNwSyxRQUFRO0FBQUEsTUFDUixXQUFXO0FBQUEsSUFDWjtBQUFBLElBQ0EsQ0FBQyxrQkFBa0IsY0FBYyxHQUFHO0FBQUEsTUFDbkMsdUJBQXVCLFNBQVMsMEJBQTBCLDhGQUE4Rix5QkFBeUI7QUFBQSxNQUNqTCxRQUFRO0FBQUEsTUFDUixXQUFXO0FBQUEsSUFDWjtBQUFBLElBQ0EsQ0FBQyxrQkFBa0IsY0FBYyxHQUFHO0FBQUEsTUFDbkMsdUJBQXVCLFNBQVMsMkJBQTJCLDhGQUE4Rix5QkFBeUI7QUFBQSxNQUNsTCxRQUFRO0FBQUEsTUFDUixXQUFXO0FBQUEsSUFDWjtBQUFBLElBQ0EscUJBQXFCO0FBQUEsTUFDcEIsTUFBTTtBQUFBLE1BQ04sT0FBTyxtQkFBbUI7QUFBQSxNQUMxQixTQUFTO0FBQUEsTUFDVCxxQkFBcUIsU0FBUyxzQkFBc0IsNkNBQTZDO0FBQUEsSUFDbEc7QUFBQSxJQUNBLHVCQUF1QjtBQUFBLE1BQ3RCLE1BQU07QUFBQSxNQUNOLE9BQU8sbUJBQW1CO0FBQUEsTUFDMUIsU0FBUztBQUFBLE1BQ1QscUJBQXFCLFNBQVMsd0JBQXdCLCtDQUErQztBQUFBLElBQ3RHO0FBQUEsSUFDQSwwQkFBMEI7QUFBQSxNQUN6QixNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLHFCQUFxQixTQUFTLDJCQUEyQixrREFBa0Q7QUFBQSxJQUM1RztBQUFBLElBQ0Esd0JBQXdCO0FBQUEsTUFDdkIsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsT0FBTyxtQkFBbUI7QUFBQSxNQUMxQixxQkFBcUIsU0FBUyx5QkFBeUIsZ0RBQWdEO0FBQUEsSUFDeEc7QUFBQSxJQUNBLHVCQUF1QjtBQUFBLE1BQ3RCLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULE9BQU8sbUJBQW1CO0FBQUEsTUFDMUIscUJBQXFCLFNBQVMsdUJBQXVCLDhDQUE4QztBQUFBLElBQ3BHO0FBQUEsSUFDQSx1QkFBdUI7QUFBQSxNQUN0QixNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLHFCQUFxQixTQUFTLHdCQUF3QiwrQ0FBK0M7QUFBQSxJQUN0RztBQUFBLElBQ0EsMEJBQTBCO0FBQUEsTUFDekIsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsT0FBTyxtQkFBbUI7QUFBQSxNQUMxQixxQkFBcUIsU0FBUywwQkFBMEIsaURBQWlEO0FBQUEsSUFDMUc7QUFBQSxJQUNBLHNCQUFzQjtBQUFBLE1BQ3JCLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULE9BQU8sbUJBQW1CO0FBQUEsTUFDMUIscUJBQXFCLFNBQVMsdUJBQXVCLDhDQUE4QztBQUFBLElBQ3BHO0FBQUEsSUFDQSw0QkFBNEI7QUFBQSxNQUMzQixNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLHFCQUFxQixTQUFTLDZCQUE2QixvREFBb0Q7QUFBQSxJQUNoSDtBQUFBLElBQ0EscUJBQXFCO0FBQUEsTUFDcEIsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsT0FBTyxtQkFBbUI7QUFBQSxNQUMxQixxQkFBcUIsU0FBUyxzQkFBc0IsNkNBQTZDO0FBQUEsSUFDbEc7QUFBQSxJQUNBLDBCQUEwQjtBQUFBLE1BQ3pCLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULE9BQU8sbUJBQW1CO0FBQUEsTUFDMUIscUJBQXFCLFNBQVMsMkJBQTJCLGtEQUFrRDtBQUFBLElBQzVHO0FBQUEsSUFDQSx5QkFBeUI7QUFBQSxNQUN4QixNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLHFCQUFxQixTQUFTLDBCQUEwQixpREFBaUQ7QUFBQSxJQUMxRztBQUFBLElBQ0EseUJBQXlCO0FBQUEsTUFDeEIsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsT0FBTyxtQkFBbUI7QUFBQSxNQUMxQixxQkFBcUIsU0FBUywwQkFBMEIsaURBQWlEO0FBQUEsSUFDMUc7QUFBQSxJQUNBLHlCQUF5QjtBQUFBLE1BQ3hCLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULE9BQU8sbUJBQW1CO0FBQUEsTUFDMUIscUJBQXFCLFNBQVMsMEJBQTBCLGlEQUFpRDtBQUFBLElBQzFHO0FBQUEsSUFDQSx1QkFBdUI7QUFBQSxNQUN0QixNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLHFCQUFxQixTQUFTLHdCQUF3QiwrQ0FBK0M7QUFBQSxJQUN0RztBQUFBLElBQ0EsdUJBQXVCO0FBQUEsTUFDdEIsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsT0FBTyxtQkFBbUI7QUFBQSxNQUMxQixxQkFBcUIsU0FBUyx3QkFBd0IsK0NBQStDO0FBQUEsSUFDdEc7QUFBQSxJQUNBLHdCQUF3QjtBQUFBLE1BQ3ZCLE1BQU07QUFBQSxNQUNOLE9BQU8sbUJBQW1CO0FBQUEsTUFDMUIsU0FBUztBQUFBLE1BQ1QscUJBQXFCLFNBQVMseUJBQXlCLGdEQUFnRDtBQUFBLElBQ3hHO0FBQUEsSUFDQSxzQkFBc0I7QUFBQSxNQUNyQixNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLHFCQUFxQixTQUFTLHVCQUF1Qiw4Q0FBOEM7QUFBQSxJQUNwRztBQUFBLElBQ0EsdUJBQXVCO0FBQUEsTUFDdEIsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsT0FBTyxtQkFBbUI7QUFBQSxNQUMxQixxQkFBcUIsU0FBUyx3QkFBd0IsK0NBQStDO0FBQUEsSUFDdEc7QUFBQSxJQUNBLG9CQUFvQjtBQUFBLE1BQ25CLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULE9BQU8sbUJBQW1CO0FBQUEsTUFDMUIscUJBQXFCLFNBQVMscUJBQXFCLDRDQUE0QztBQUFBLElBQ2hHO0FBQUEsSUFDQSxvQkFBb0I7QUFBQSxNQUNuQixNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLHFCQUFxQixTQUFTLHNCQUFzQiw2Q0FBNkM7QUFBQSxJQUNsRztBQUFBLElBQ0EsMkJBQTJCO0FBQUEsTUFDMUIsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsT0FBTyxtQkFBbUI7QUFBQSxNQUMxQixxQkFBcUIsU0FBUyw0QkFBNEIsbURBQW1EO0FBQUEsSUFDOUc7QUFBQSxJQUNBLHVCQUF1QjtBQUFBLE1BQ3RCLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULE9BQU8sbUJBQW1CO0FBQUEsTUFDMUIscUJBQXFCLFNBQVMsd0JBQXdCLCtDQUErQztBQUFBLElBQ3RHO0FBQUEsSUFDQSxzQkFBc0I7QUFBQSxNQUNyQixNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLHFCQUFxQixTQUFTLHVCQUF1Qiw4Q0FBOEM7QUFBQSxJQUNwRztBQUFBLElBQ0EseUJBQXlCO0FBQUEsTUFDeEIsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsT0FBTyxtQkFBbUI7QUFBQSxNQUMxQixxQkFBcUIsU0FBUywwQkFBMEIsaURBQWlEO0FBQUEsSUFDMUc7QUFBQSxJQUNBLDhCQUE4QjtBQUFBLE1BQzdCLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULE9BQU8sbUJBQW1CO0FBQUEsTUFDMUIscUJBQXFCLFNBQVMsK0JBQStCLHNEQUFzRDtBQUFBLElBQ3BIO0FBQUEsRUFDRDtBQUNELENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
