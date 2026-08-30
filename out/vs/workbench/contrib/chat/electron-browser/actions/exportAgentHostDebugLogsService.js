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
import { Schemas } from "../../../../../base/common/network.js";
import { joinPath } from "../../../../../base/common/resources.js";
import { hasKey } from "../../../../../base/common/types.js";
import { localize } from "../../../../../nls.js";
import { IFileDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { InstantiationType, registerSingleton } from "../../../../../platform/instantiation/common/extensions.js";
import { INativeHostService } from "../../../../../platform/native/common/native.js";
import { IAgentHostDebugLogsExportService } from "../../browser/actions/exportAgentHostDebugLogsAction.js";
let NativeAgentHostDebugLogsExportService = class {
  constructor(fileDialogService, nativeHostService) {
    this.fileDialogService = fileDialogService;
    this.nativeHostService = nativeHostService;
  }
  async save(exportName, files) {
    const defaultUri = joinPath(await this.fileDialogService.preferredHome(Schemas.file), `${exportName}.zip`);
    const saveUri = await this.fileDialogService.showSaveDialog({
      title: localize("exportDebugLogs.saveDialogTitle", "Export Agent Host Debug Logs"),
      defaultUri,
      filters: [{ name: localize("exportDebugLogs.zipFilter", "Zip Archive"), extensions: ["zip"] }],
      availableFileSystems: [Schemas.file]
    });
    if (!saveUri) {
      return false;
    }
    await this.nativeHostService.createZipFile(saveUri, files.map((file) => {
      return hasKey(file, { contents: true }) ? file : { path: file.path, source: file.resource, size: file.size };
    }));
    return true;
  }
};
NativeAgentHostDebugLogsExportService = __decorateClass([
  __decorateParam(0, IFileDialogService),
  __decorateParam(1, INativeHostService)
], NativeAgentHostDebugLogsExportService);
registerSingleton(IAgentHostDebugLogsExportService, NativeAgentHostDebugLogsExportService, InstantiationType.Delayed);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGVsZWN0cm9uLWJyb3dzZXJcXGFjdGlvbnNcXGV4cG9ydEFnZW50SG9zdERlYnVnTG9nc1NlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBoYXNLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbmF0aXZlL2NvbW1vbi9uYXRpdmUuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdERlYnVnTG9nRmlsZSwgSUFnZW50SG9zdERlYnVnTG9nc0V4cG9ydFNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL2FjdGlvbnMvZXhwb3J0QWdlbnRIb3N0RGVidWdMb2dzQWN0aW9uLmpzJztcblxuY2xhc3MgTmF0aXZlQWdlbnRIb3N0RGVidWdMb2dzRXhwb3J0U2VydmljZSBpbXBsZW1lbnRzIElBZ2VudEhvc3REZWJ1Z0xvZ3NFeHBvcnRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0QElOYXRpdmVIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5hdGl2ZUhvc3RTZXJ2aWNlOiBJTmF0aXZlSG9zdFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgc2F2ZShleHBvcnROYW1lOiBzdHJpbmcsIGZpbGVzOiByZWFkb25seSBJQWdlbnRIb3N0RGVidWdMb2dGaWxlW10pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBkZWZhdWx0VXJpID0gam9pblBhdGgoYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5wcmVmZXJyZWRIb21lKFNjaGVtYXMuZmlsZSksIGAke2V4cG9ydE5hbWV9LnppcGApO1xuXHRcdGNvbnN0IHNhdmVVcmkgPSBhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLnNob3dTYXZlRGlhbG9nKHtcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZXhwb3J0RGVidWdMb2dzLnNhdmVEaWFsb2dUaXRsZScsIFwiRXhwb3J0IEFnZW50IEhvc3QgRGVidWcgTG9nc1wiKSxcblx0XHRcdGRlZmF1bHRVcmksXG5cdFx0XHRmaWx0ZXJzOiBbeyBuYW1lOiBsb2NhbGl6ZSgnZXhwb3J0RGVidWdMb2dzLnppcEZpbHRlcicsIFwiWmlwIEFyY2hpdmVcIiksIGV4dGVuc2lvbnM6IFsnemlwJ10gfV0sXG5cdFx0XHRhdmFpbGFibGVGaWxlU3lzdGVtczogW1NjaGVtYXMuZmlsZV0sXG5cdFx0fSk7XG5cblx0XHRpZiAoIXNhdmVVcmkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLm5hdGl2ZUhvc3RTZXJ2aWNlLmNyZWF0ZVppcEZpbGUoc2F2ZVVyaSwgZmlsZXMubWFwKGZpbGUgPT4ge1xuXHRcdFx0cmV0dXJuIGhhc0tleShmaWxlLCB7IGNvbnRlbnRzOiB0cnVlIH0pXG5cdFx0XHRcdD8gZmlsZVxuXHRcdFx0XHQ6IHsgcGF0aDogZmlsZS5wYXRoLCBzb3VyY2U6IGZpbGUucmVzb3VyY2UsIHNpemU6IGZpbGUuc2l6ZSB9O1xuXHRcdH0pKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJQWdlbnRIb3N0RGVidWdMb2dzRXhwb3J0U2VydmljZSwgTmF0aXZlQWdlbnRIb3N0RGVidWdMb2dzRXhwb3J0U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsMEJBQTBCO0FBQ25DLFNBQWlDLHdDQUF3QztBQUV6RSxJQUFNLHdDQUFOLE1BQXdGO0FBQUEsRUFHdkYsWUFDc0MsbUJBQ0EsbUJBQ3BDO0FBRm9DO0FBQ0E7QUFBQSxFQUNsQztBQUFBLEVBRUosTUFBTSxLQUFLLFlBQW9CLE9BQTREO0FBQzFGLFVBQU0sYUFBYSxTQUFTLE1BQU0sS0FBSyxrQkFBa0IsY0FBYyxRQUFRLElBQUksR0FBRyxHQUFHLFVBQVUsTUFBTTtBQUN6RyxVQUFNLFVBQVUsTUFBTSxLQUFLLGtCQUFrQixlQUFlO0FBQUEsTUFDM0QsT0FBTyxTQUFTLG1DQUFtQyw4QkFBOEI7QUFBQSxNQUNqRjtBQUFBLE1BQ0EsU0FBUyxDQUFDLEVBQUUsTUFBTSxTQUFTLDZCQUE2QixhQUFhLEdBQUcsWUFBWSxDQUFDLEtBQUssRUFBRSxDQUFDO0FBQUEsTUFDN0Ysc0JBQXNCLENBQUMsUUFBUSxJQUFJO0FBQUEsSUFDcEMsQ0FBQztBQUVELFFBQUksQ0FBQyxTQUFTO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLEtBQUssa0JBQWtCLGNBQWMsU0FBUyxNQUFNLElBQUksVUFBUTtBQUNyRSxhQUFPLE9BQU8sTUFBTSxFQUFFLFVBQVUsS0FBSyxDQUFDLElBQ25DLE9BQ0EsRUFBRSxNQUFNLEtBQUssTUFBTSxRQUFRLEtBQUssVUFBVSxNQUFNLEtBQUssS0FBSztBQUFBLElBQzlELENBQUMsQ0FBQztBQUNGLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUE1Qk0sd0NBQU47QUFBQSxFQUlHO0FBQUEsRUFDQTtBQUFBLEdBTEc7QUE4Qk4sa0JBQWtCLGtDQUFrQyx1Q0FBdUMsa0JBQWtCLE9BQU87IiwKICAibmFtZXMiOiBbXQp9Cg==
