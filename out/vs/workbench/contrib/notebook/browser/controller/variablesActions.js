import { localize2 } from "../../../../../nls.js";
import { MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IViewsService } from "../../../../services/views/common/viewsService.js";
import { KERNEL_HAS_VARIABLE_PROVIDER } from "../../common/notebookContextKeys.js";
import { NOTEBOOK_VARIABLE_VIEW_ENABLED } from "../contrib/notebookVariables/notebookVariableContextKeys.js";
import * as icons from "../notebookIcons.js";
import { NotebookAction } from "./coreActions.js";
const OPEN_VARIABLES_VIEW_COMMAND_ID = "notebook.openVariablesView";
registerAction2(class OpenVariablesViewAction extends NotebookAction {
  constructor() {
    super({
      id: OPEN_VARIABLES_VIEW_COMMAND_ID,
      title: localize2("notebookActions.openVariablesView", "Variables"),
      icon: icons.variablesViewIcon,
      menu: [
        {
          id: MenuId.InteractiveToolbar,
          group: "navigation",
          when: ContextKeyExpr.and(
            KERNEL_HAS_VARIABLE_PROVIDER,
            // jupyter extension currently contributes their own goto variables button
            ContextKeyExpr.notEquals("jupyter.kernel.isjupyter", true),
            NOTEBOOK_VARIABLE_VIEW_ENABLED
          )
        },
        {
          id: MenuId.EditorTitle,
          order: -1,
          group: "navigation",
          when: ContextKeyExpr.and(
            KERNEL_HAS_VARIABLE_PROVIDER,
            // jupyter extension currently contributes their own goto variables button
            ContextKeyExpr.notEquals("jupyter.kernel.isjupyter", true),
            ContextKeyExpr.notEquals("config.notebook.globalToolbar", true),
            NOTEBOOK_VARIABLE_VIEW_ENABLED
          )
        },
        {
          id: MenuId.NotebookToolbar,
          order: -1,
          group: "navigation",
          when: ContextKeyExpr.and(
            KERNEL_HAS_VARIABLE_PROVIDER,
            // jupyter extension currently contributes their own goto variables button
            ContextKeyExpr.notEquals("jupyter.kernel.isjupyter", true),
            ContextKeyExpr.equals("config.notebook.globalToolbar", true),
            NOTEBOOK_VARIABLE_VIEW_ENABLED
          )
        }
      ]
    });
  }
  async runWithContext(accessor, context) {
    const variableViewId = "workbench.notebook.variables";
    accessor.get(IViewsService).openView(variableViewId, true);
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cm9sbGVyXFx2YXJpYWJsZXNBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgS0VSTkVMX0hBU19WQVJJQUJMRV9QUk9WSURFUiB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IE5PVEVCT09LX1ZBUklBQkxFX1ZJRVdfRU5BQkxFRCB9IGZyb20gJy4uL2NvbnRyaWIvbm90ZWJvb2tWYXJpYWJsZXMvbm90ZWJvb2tWYXJpYWJsZUNvbnRleHRLZXlzLmpzJztcbmltcG9ydCAqIGFzIGljb25zIGZyb20gJy4uL25vdGVib29rSWNvbnMuanMnO1xuXG5pbXBvcnQgeyBJTm90ZWJvb2tBY3Rpb25Db250ZXh0LCBOb3RlYm9va0FjdGlvbiB9IGZyb20gJy4vY29yZUFjdGlvbnMuanMnO1xuXG5jb25zdCBPUEVOX1ZBUklBQkxFU19WSUVXX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2sub3BlblZhcmlhYmxlc1ZpZXcnO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgT3BlblZhcmlhYmxlc1ZpZXdBY3Rpb24gZXh0ZW5kcyBOb3RlYm9va0FjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9QRU5fVkFSSUFCTEVTX1ZJRVdfQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25vdGVib29rQWN0aW9ucy5vcGVuVmFyaWFibGVzVmlldycsIFwiVmFyaWFibGVzXCIpLFxuXHRcdFx0aWNvbjogaWNvbnMudmFyaWFibGVzVmlld0ljb24sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkludGVyYWN0aXZlVG9vbGJhcixcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdEtFUk5FTF9IQVNfVkFSSUFCTEVfUFJPVklERVIsXG5cdFx0XHRcdFx0XHQvLyBqdXB5dGVyIGV4dGVuc2lvbiBjdXJyZW50bHkgY29udHJpYnV0ZXMgdGhlaXIgb3duIGdvdG8gdmFyaWFibGVzIGJ1dHRvblxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIubm90RXF1YWxzKCdqdXB5dGVyLmtlcm5lbC5pc2p1cHl0ZXInLCB0cnVlKSxcblx0XHRcdFx0XHRcdE5PVEVCT09LX1ZBUklBQkxFX1ZJRVdfRU5BQkxFRFxuXHRcdFx0XHRcdClcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsXG5cdFx0XHRcdFx0b3JkZXI6IC0xLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0S0VSTkVMX0hBU19WQVJJQUJMRV9QUk9WSURFUixcblx0XHRcdFx0XHRcdC8vIGp1cHl0ZXIgZXh0ZW5zaW9uIGN1cnJlbnRseSBjb250cmlidXRlcyB0aGVpciBvd24gZ290byB2YXJpYWJsZXMgYnV0dG9uXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoJ2p1cHl0ZXIua2VybmVsLmlzanVweXRlcicsIHRydWUpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIubm90RXF1YWxzKCdjb25maWcubm90ZWJvb2suZ2xvYmFsVG9vbGJhcicsIHRydWUpLFxuXHRcdFx0XHRcdFx0Tk9URUJPT0tfVkFSSUFCTEVfVklFV19FTkFCTEVEXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va1Rvb2xiYXIsXG5cdFx0XHRcdFx0b3JkZXI6IC0xLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0S0VSTkVMX0hBU19WQVJJQUJMRV9QUk9WSURFUixcblx0XHRcdFx0XHRcdC8vIGp1cHl0ZXIgZXh0ZW5zaW9uIGN1cnJlbnRseSBjb250cmlidXRlcyB0aGVpciBvd24gZ290byB2YXJpYWJsZXMgYnV0dG9uXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoJ2p1cHl0ZXIua2VybmVsLmlzanVweXRlcicsIHRydWUpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcubm90ZWJvb2suZ2xvYmFsVG9vbGJhcicsIHRydWUpLFxuXHRcdFx0XHRcdFx0Tk9URUJPT0tfVkFSSUFCTEVfVklFV19FTkFCTEVEXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQWN0aW9uQ29udGV4dCkge1xuXHRcdGNvbnN0IHZhcmlhYmxlVmlld0lkID0gJ3dvcmtiZW5jaC5ub3RlYm9vay52YXJpYWJsZXMnO1xuXHRcdGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKS5vcGVuVmlldyh2YXJpYWJsZVZpZXdJZCwgdHJ1ZSk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxRQUFRLHVCQUF1QjtBQUN4QyxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG9DQUFvQztBQUM3QyxTQUFTLHNDQUFzQztBQUMvQyxZQUFZLFdBQVc7QUFFdkIsU0FBaUMsc0JBQXNCO0FBRXZELE1BQU0saUNBQWlDO0FBRXZDLGdCQUFnQixNQUFNLGdDQUFnQyxlQUFlO0FBQUEsRUFFcEUsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSxxQ0FBcUMsV0FBVztBQUFBLE1BQ2pFLE1BQU0sTUFBTTtBQUFBLE1BQ1osTUFBTTtBQUFBLFFBQ0w7QUFBQSxVQUNDLElBQUksT0FBTztBQUFBLFVBQ1gsT0FBTztBQUFBLFVBQ1AsTUFBTSxlQUFlO0FBQUEsWUFDcEI7QUFBQTtBQUFBLFlBRUEsZUFBZSxVQUFVLDRCQUE0QixJQUFJO0FBQUEsWUFDekQ7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUksT0FBTztBQUFBLFVBQ1gsT0FBTztBQUFBLFVBQ1AsT0FBTztBQUFBLFVBQ1AsTUFBTSxlQUFlO0FBQUEsWUFDcEI7QUFBQTtBQUFBLFlBRUEsZUFBZSxVQUFVLDRCQUE0QixJQUFJO0FBQUEsWUFDekQsZUFBZSxVQUFVLGlDQUFpQyxJQUFJO0FBQUEsWUFDOUQ7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUksT0FBTztBQUFBLFVBQ1gsT0FBTztBQUFBLFVBQ1AsT0FBTztBQUFBLFVBQ1AsTUFBTSxlQUFlO0FBQUEsWUFDcEI7QUFBQTtBQUFBLFlBRUEsZUFBZSxVQUFVLDRCQUE0QixJQUFJO0FBQUEsWUFDekQsZUFBZSxPQUFPLGlDQUFpQyxJQUFJO0FBQUEsWUFDM0Q7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFlLGVBQWUsVUFBNEIsU0FBaUM7QUFDMUYsVUFBTSxpQkFBaUI7QUFDdkIsYUFBUyxJQUFJLGFBQWEsRUFBRSxTQUFTLGdCQUFnQixJQUFJO0FBQUEsRUFDMUQ7QUFDRCxDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
