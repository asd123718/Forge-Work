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
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { EditorExtensions } from "../../../common/editor.js";
import { BrowserEditor } from "./browserEditor.js";
import { BrowserEditorInput, BrowserEditorSerializer } from "../common/browserEditorInput.js";
import { BrowserViewUri } from "../../../../platform/browserView/common/browserViewUri.js";
import { registerSingleton, InstantiationType } from "../../../../platform/instantiation/common/extensions.js";
import { IEditorResolverService, RegisteredEditorPriority } from "../../../services/editor/common/editorResolverService.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { Schemas } from "../../../../base/common/network.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { IBrowserViewCDPService, IBrowserViewWorkbenchService } from "../common/browserView.js";
import { BrowserViewWorkbenchService } from "./browserViewWorkbenchService.js";
import { BrowserViewCDPService } from "./browserViewCDPService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { logBrowserOpen } from "../../../../platform/browserView/common/browserViewTelemetry.js";
import "./features/webContentsViewRendererFeature.js";
import "./features/browserNavigationFeatures.js";
import "./features/browserWelcomeFeature.js";
import "./features/browserFavoritesFeature.js";
import "./features/browserHistoryFeature.js";
import "./features/browserPermissionsFeature.js";
import "./features/browserDataStorageFeatures.js";
import "./features/browserDevToolsFeature.js";
import "./features/browserEditorChatFeatures.js";
import "./features/browserEditorErrorFeatures.js";
import "./features/browserEditorZoomFeature.js";
import "./features/browserEditorEmulationFeatures.js";
import "./features/browserAutoReloadFeatures.js";
import "./features/browserEditorFindFeature.js";
import "./features/browserSearchFeatures.js";
import "./features/browserTabManagementFeatures.js";
import "./features/browserRemoteFeatures.js";
function getBrowserViewStateUrl(viewState) {
  const url = Object.entries(viewState ?? {}).find(([key]) => key === "url")?.[1];
  return typeof url === "string" ? url : void 0;
}
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    BrowserEditor,
    BrowserEditorInput.EDITOR_ID,
    localize("browser.editorLabel", "Browser")
  ),
  [
    new SyncDescriptor(BrowserEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(
  BrowserEditorInput.ID,
  BrowserEditorSerializer
);
let BrowserEditorResolverContribution = class {
  constructor(editorResolverService, browserViewWorkbenchService, telemetryService) {
    editorResolverService.registerEditor(
      `${Schemas.vscodeBrowser}:/**`,
      {
        id: BrowserEditorInput.EDITOR_ID,
        label: localize("browser.editorLabel", "Browser"),
        priority: RegisteredEditorPriority.exclusive
      },
      {
        canSupportResource: (resource) => resource.scheme === Schemas.vscodeBrowser,
        singlePerResource: true
      },
      {
        createEditorInput: ({ resource, options }) => {
          const parsed = BrowserViewUri.parse(resource);
          if (!parsed) {
            throw new Error(`Invalid browser view resource: ${resource.toString()}`);
          }
          const browserInput = browserViewWorkbenchService.getOrCreateLazy(parsed.id, options?.viewState);
          void browserInput.resolve();
          return {
            editor: browserInput,
            options: {
              pinned: !!browserInput.url,
              // pin if navigated
              ...options
            }
          };
        }
      }
    );
    for (const extension of ["html", "htm"]) {
      editorResolverService.registerEditor(
        `${Schemas.file}:/**/*.${extension}`,
        {
          id: BrowserEditorInput.EDITOR_ID,
          label: localize("browser.htmlEditorLabel", "Integrated Browser"),
          priority: RegisteredEditorPriority.option
        },
        {
          canSupportResource: (resource) => resource.scheme === Schemas.file,
          singlePerResource: true
        },
        {
          createEditorInput: ({ resource, options }) => {
            logBrowserOpen(telemetryService, "fileResource");
            const viewState = options?.viewState;
            const browserInput = browserViewWorkbenchService.getOrCreateLazy(generateUuid(), {
              ...viewState,
              url: getBrowserViewStateUrl(viewState) ?? resource.toString()
            }, resource);
            void browserInput.resolve();
            return {
              editor: browserInput,
              options: {
                pinned: true,
                ...options
              }
            };
          }
        }
      );
    }
  }
};
BrowserEditorResolverContribution.ID = "workbench.contrib.browserEditorResolver";
BrowserEditorResolverContribution = __decorateClass([
  __decorateParam(0, IEditorResolverService),
  __decorateParam(1, IBrowserViewWorkbenchService),
  __decorateParam(2, ITelemetryService)
], BrowserEditorResolverContribution);
registerWorkbenchContribution2(BrowserEditorResolverContribution.ID, BrowserEditorResolverContribution, WorkbenchPhase.BlockStartup);
registerSingleton(IBrowserViewWorkbenchService, BrowserViewWorkbenchService, InstantiationType.Delayed);
registerSingleton(IBrowserViewCDPService, BrowserViewCDPService, InstantiationType.Delayed);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFxicm93c2VyVmlldy5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmVEZXNjcmlwdG9yLCBJRWRpdG9yUGFuZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9ucywgSUVkaXRvckZhY3RvcnlSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgQnJvd3NlckVkaXRvciB9IGZyb20gJy4vYnJvd3NlckVkaXRvci5qcyc7XG5pbXBvcnQgeyBCcm93c2VyRWRpdG9ySW5wdXQsIEJyb3dzZXJFZGl0b3JTZXJpYWxpemVyIH0gZnJvbSAnLi4vY29tbW9uL2Jyb3dzZXJFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBCcm93c2VyVmlld1VyaSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyVmlld1VyaS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlclNpbmdsZXRvbiwgSW5zdGFudGlhdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JSZXNvbHZlclNlcnZpY2UsIFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElCcm93c2VyVmlld0NEUFNlcnZpY2UsIElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi9icm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQnJvd3NlclZpZXdDRFBTZXJ2aWNlIH0gZnJvbSAnLi9icm93c2VyVmlld0NEUFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBsb2dCcm93c2VyT3BlbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyVmlld1RlbGVtZXRyeS5qcyc7XG5cbi8vIFJlZ2lzdGVyIGFjdGlvbnMgYW5kIGJyb3dzZXIgZmVhdHVyZXNcbmltcG9ydCAnLi9mZWF0dXJlcy93ZWJDb250ZW50c1ZpZXdSZW5kZXJlckZlYXR1cmUuanMnO1xuaW1wb3J0ICcuL2ZlYXR1cmVzL2Jyb3dzZXJOYXZpZ2F0aW9uRmVhdHVyZXMuanMnO1xuaW1wb3J0ICcuL2ZlYXR1cmVzL2Jyb3dzZXJXZWxjb21lRmVhdHVyZS5qcyc7XG5pbXBvcnQgJy4vZmVhdHVyZXMvYnJvd3NlckZhdm9yaXRlc0ZlYXR1cmUuanMnO1xuaW1wb3J0ICcuL2ZlYXR1cmVzL2Jyb3dzZXJIaXN0b3J5RmVhdHVyZS5qcyc7XG5pbXBvcnQgJy4vZmVhdHVyZXMvYnJvd3NlclBlcm1pc3Npb25zRmVhdHVyZS5qcyc7XG5pbXBvcnQgJy4vZmVhdHVyZXMvYnJvd3NlckRhdGFTdG9yYWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0ICcuL2ZlYXR1cmVzL2Jyb3dzZXJEZXZUb29sc0ZlYXR1cmUuanMnO1xuaW1wb3J0ICcuL2ZlYXR1cmVzL2Jyb3dzZXJFZGl0b3JDaGF0RmVhdHVyZXMuanMnO1xuaW1wb3J0ICcuL2ZlYXR1cmVzL2Jyb3dzZXJFZGl0b3JFcnJvckZlYXR1cmVzLmpzJztcbmltcG9ydCAnLi9mZWF0dXJlcy9icm93c2VyRWRpdG9yWm9vbUZlYXR1cmUuanMnO1xuaW1wb3J0ICcuL2ZlYXR1cmVzL2Jyb3dzZXJFZGl0b3JFbXVsYXRpb25GZWF0dXJlcy5qcyc7XG5pbXBvcnQgJy4vZmVhdHVyZXMvYnJvd3NlckF1dG9SZWxvYWRGZWF0dXJlcy5qcyc7XG5pbXBvcnQgJy4vZmVhdHVyZXMvYnJvd3NlckVkaXRvckZpbmRGZWF0dXJlLmpzJztcbmltcG9ydCAnLi9mZWF0dXJlcy9icm93c2VyU2VhcmNoRmVhdHVyZXMuanMnO1xuaW1wb3J0ICcuL2ZlYXR1cmVzL2Jyb3dzZXJUYWJNYW5hZ2VtZW50RmVhdHVyZXMuanMnO1xuaW1wb3J0ICcuL2ZlYXR1cmVzL2Jyb3dzZXJSZW1vdGVGZWF0dXJlcy5qcyc7XG5cbmZ1bmN0aW9uIGdldEJyb3dzZXJWaWV3U3RhdGVVcmwodmlld1N0YXRlOiBvYmplY3QgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCB1cmwgPSBPYmplY3QuZW50cmllcyh2aWV3U3RhdGUgPz8ge30pLmZpbmQoKFtrZXldKSA9PiBrZXkgPT09ICd1cmwnKT8uWzFdO1xuXHRyZXR1cm4gdHlwZW9mIHVybCA9PT0gJ3N0cmluZycgPyB1cmwgOiB1bmRlZmluZWQ7XG59XG5cblJlZ2lzdHJ5LmFzPElFZGl0b3JQYW5lUmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yUGFuZSkucmVnaXN0ZXJFZGl0b3JQYW5lKFxuXHRFZGl0b3JQYW5lRGVzY3JpcHRvci5jcmVhdGUoXG5cdFx0QnJvd3NlckVkaXRvcixcblx0XHRCcm93c2VyRWRpdG9ySW5wdXQuRURJVE9SX0lELFxuXHRcdGxvY2FsaXplKCdicm93c2VyLmVkaXRvckxhYmVsJywgXCJCcm93c2VyXCIpXG5cdCksXG5cdFtcblx0XHRuZXcgU3luY0Rlc2NyaXB0b3IoQnJvd3NlckVkaXRvcklucHV0KVxuXHRdXG4pO1xuXG5SZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnJlZ2lzdGVyRWRpdG9yU2VyaWFsaXplcihcblx0QnJvd3NlckVkaXRvcklucHV0LklELFxuXHRCcm93c2VyRWRpdG9yU2VyaWFsaXplclxuKTtcblxuY2xhc3MgQnJvd3NlckVkaXRvclJlc29sdmVyQ29udHJpYnV0aW9uIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5icm93c2VyRWRpdG9yUmVzb2x2ZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIGVkaXRvclJlc29sdmVyU2VydmljZTogSUVkaXRvclJlc29sdmVyU2VydmljZSxcblx0XHRASUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSBicm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2U6IElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRlZGl0b3JSZXNvbHZlclNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoXG5cdFx0XHRgJHtTY2hlbWFzLnZzY29kZUJyb3dzZXJ9Oi8qKmAsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBCcm93c2VyRWRpdG9ySW5wdXQuRURJVE9SX0lELFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2Jyb3dzZXIuZWRpdG9yTGFiZWwnLCBcIkJyb3dzZXJcIiksXG5cdFx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZXhjbHVzaXZlXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRjYW5TdXBwb3J0UmVzb3VyY2U6IHJlc291cmNlID0+IHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVCcm93c2VyLFxuXHRcdFx0XHRzaW5nbGVQZXJSZXNvdXJjZTogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlLCBvcHRpb25zIH0pID0+IHtcblx0XHRcdFx0XHRjb25zdCBwYXJzZWQgPSBCcm93c2VyVmlld1VyaS5wYXJzZShyZXNvdXJjZSk7XG5cdFx0XHRcdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBicm93c2VyIHZpZXcgcmVzb3VyY2U6ICR7cmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBicm93c2VySW5wdXQgPSBicm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UuZ2V0T3JDcmVhdGVMYXp5KHBhcnNlZC5pZCwgb3B0aW9ucz8udmlld1N0YXRlKTtcblxuXHRcdFx0XHRcdC8vIFN0YXJ0IHJlc29sdmluZyB0aGUgaW5wdXQgcmlnaHQgYXdheS4gVGhpcyB3aWxsIGNyZWF0ZSB0aGUgYnJvd3NlciB2aWV3LlxuXHRcdFx0XHRcdC8vIFRoaXMgYWxsb3dzIGJyb3dzZXIgdmlld3MgdG8gYmUgbG9hZGVkIGluIHRoZSBiYWNrZ3JvdW5kLlxuXHRcdFx0XHRcdHZvaWQgYnJvd3NlcklucHV0LnJlc29sdmUoKTtcblxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRlZGl0b3I6IGJyb3dzZXJJbnB1dCxcblx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0cGlubmVkOiAhIWJyb3dzZXJJbnB1dC51cmwsIC8vIHBpbiBpZiBuYXZpZ2F0ZWRcblx0XHRcdFx0XHRcdFx0Li4ub3B0aW9uc1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgWydodG1sJywgJ2h0bSddKSB7XG5cdFx0XHRlZGl0b3JSZXNvbHZlclNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoXG5cdFx0XHRcdGAke1NjaGVtYXMuZmlsZX06LyoqLyouJHtleHRlbnNpb259YCxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBCcm93c2VyRWRpdG9ySW5wdXQuRURJVE9SX0lELFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYnJvd3Nlci5odG1sRWRpdG9yTGFiZWwnLCBcIkludGVncmF0ZWQgQnJvd3NlclwiKSxcblx0XHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5Lm9wdGlvblxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y2FuU3VwcG9ydFJlc291cmNlOiByZXNvdXJjZSA9PiByZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSxcblx0XHRcdFx0XHRzaW5nbGVQZXJSZXNvdXJjZTogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlLCBvcHRpb25zIH0pID0+IHtcblx0XHRcdFx0XHRcdGxvZ0Jyb3dzZXJPcGVuKHRlbGVtZXRyeVNlcnZpY2UsICdmaWxlUmVzb3VyY2UnKTtcblxuXHRcdFx0XHRcdFx0Y29uc3Qgdmlld1N0YXRlID0gb3B0aW9ucz8udmlld1N0YXRlO1xuXHRcdFx0XHRcdFx0Y29uc3QgYnJvd3NlcklucHV0ID0gYnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLmdldE9yQ3JlYXRlTGF6eShnZW5lcmF0ZVV1aWQoKSwge1xuXHRcdFx0XHRcdFx0XHQuLi52aWV3U3RhdGUsXG5cdFx0XHRcdFx0XHRcdHVybDogZ2V0QnJvd3NlclZpZXdTdGF0ZVVybCh2aWV3U3RhdGUpID8/IHJlc291cmNlLnRvU3RyaW5nKClcblx0XHRcdFx0XHRcdH0sIHJlc291cmNlKTtcblx0XHRcdFx0XHRcdHZvaWQgYnJvd3NlcklucHV0LnJlc29sdmUoKTtcblxuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0ZWRpdG9yOiBicm93c2VySW5wdXQsXG5cdFx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0XHRwaW5uZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0Li4ub3B0aW9uc1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKEJyb3dzZXJFZGl0b3JSZXNvbHZlckNvbnRyaWJ1dGlvbi5JRCwgQnJvd3NlckVkaXRvclJlc29sdmVyQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1N0YXJ0dXApO1xuXG5yZWdpc3RlclNpbmdsZXRvbihJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLCBCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUJyb3dzZXJWaWV3Q0RQU2VydmljZSwgQnJvd3NlclZpZXdDRFBTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw0QkFBaUQ7QUFDMUQsU0FBUyx3QkFBZ0Q7QUFDekQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxvQkFBb0IsK0JBQStCO0FBQzVELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLHdCQUF3QixnQ0FBZ0M7QUFDakUsU0FBaUMsZ0NBQWdDLHNCQUFzQjtBQUN2RixTQUFTLGVBQWU7QUFDeEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx3QkFBd0Isb0NBQW9DO0FBQ3JFLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQXNCO0FBRy9CLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFP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
