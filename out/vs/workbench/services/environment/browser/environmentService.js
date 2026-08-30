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
import { Schemas } from "../../../../base/common/network.js";
import { joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { memoize } from "../../../../base/common/decorators.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { parseLineAndColumnAware } from "../../../../base/common/extpath.js";
import { LogLevelToString } from "../../../../platform/log/common/log.js";
import { isUndefined } from "../../../../base/common/types.js";
import { refineServiceDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { EXTENSION_IDENTIFIER_WITH_LOG_REGEX } from "../../../../platform/environment/common/environmentService.js";
const IBrowserWorkbenchEnvironmentService = refineServiceDecorator(IEnvironmentService);
class BrowserWorkbenchEnvironmentService {
  constructor(workspaceId, logsHome, options, productService) {
    this.workspaceId = workspaceId;
    this.logsHome = logsHome;
    this.options = options;
    this.productService = productService;
    this.extensionHostDebugEnvironment = void 0;
    if (options.workspaceProvider && Array.isArray(options.workspaceProvider.payload)) {
      try {
        this.payload = new Map(options.workspaceProvider.payload);
      } catch (error) {
        onUnexpectedError(error);
      }
    }
  }
  get remoteAuthority() {
    return this.options.remoteAuthority;
  }
  get expectsResolverExtension() {
    return !!this.options.remoteAuthority?.includes("+") && !this.options.webSocketFactory;
  }
  get isBuilt() {
    return !!this.productService.commit;
  }
  get logLevel() {
    const logLevelFromPayload = this.payload?.get("logLevel");
    if (logLevelFromPayload) {
      return logLevelFromPayload.split(",").find((entry) => !EXTENSION_IDENTIFIER_WITH_LOG_REGEX.test(entry));
    }
    return this.options.developmentOptions?.logLevel !== void 0 ? LogLevelToString(this.options.developmentOptions?.logLevel) : void 0;
  }
  get extensionLogLevel() {
    const logLevelFromPayload = this.payload?.get("logLevel");
    if (logLevelFromPayload) {
      const result = [];
      for (const entry of logLevelFromPayload.split(",")) {
        const matches = EXTENSION_IDENTIFIER_WITH_LOG_REGEX.exec(entry);
        if (matches?.[1] && matches[2]) {
          result.push([matches[1], matches[2]]);
        }
      }
      return result.length ? result : void 0;
    }
    return this.options.developmentOptions?.extensionLogLevel !== void 0 ? this.options.developmentOptions?.extensionLogLevel.map(([extension, logLevel]) => [extension, LogLevelToString(logLevel)]) : void 0;
  }
  get profDurationMarkers() {
    const profDurationMarkersFromPayload = this.payload?.get("profDurationMarkers");
    if (profDurationMarkersFromPayload) {
      const result = [];
      for (const entry of profDurationMarkersFromPayload.split(",")) {
        result.push(entry);
      }
      return result.length === 2 ? result : void 0;
    }
    return void 0;
  }
  get windowLogsPath() {
    return this.logsHome;
  }
  get logFile() {
    return joinPath(this.windowLogsPath, "window.log");
  }
  get userRoamingDataHome() {
    return URI.file("/User").with({ scheme: Schemas.vscodeUserData });
  }
  get argvResource() {
    return joinPath(this.userRoamingDataHome, "argv.json");
  }
  get cacheHome() {
    return joinPath(this.userRoamingDataHome, "caches");
  }
  get workspaceStorageHome() {
    return joinPath(this.userRoamingDataHome, "workspaceStorage");
  }
  get appSharedDataHome() {
    return joinPath(this.userRoamingDataHome, "sharedData");
  }
  get localHistoryHome() {
    return joinPath(this.userRoamingDataHome, "History");
  }
  get stateResource() {
    return joinPath(this.userRoamingDataHome, "State", "storage.json");
  }
  get userDataSyncHome() {
    return joinPath(this.userRoamingDataHome, "sync", this.workspaceId);
  }
  get sync() {
    return void 0;
  }
  get keyboardLayoutResource() {
    return joinPath(this.userRoamingDataHome, "keyboardLayout.json");
  }
  get untitledWorkspacesHome() {
    return joinPath(this.userRoamingDataHome, "Workspaces");
  }
  get agentSessionsWorkspace() {
    return joinPath(this.userRoamingDataHome, "agent-sessions.code-workspace");
  }
  get serviceMachineIdResource() {
    return joinPath(this.userRoamingDataHome, "machineid");
  }
  get extHostLogsPath() {
    return joinPath(this.logsHome, "exthost");
  }
  get debugExtensionHost() {
    if (!this.extensionHostDebugEnvironment) {
      this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
    }
    return this.extensionHostDebugEnvironment.params;
  }
  get isExtensionDevelopment() {
    if (!this.extensionHostDebugEnvironment) {
      this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
    }
    return this.extensionHostDebugEnvironment.isExtensionDevelopment;
  }
  get extensionDevelopmentLocationURI() {
    if (!this.extensionHostDebugEnvironment) {
      this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
    }
    return this.extensionHostDebugEnvironment.extensionDevelopmentLocationURI;
  }
  get extensionDevelopmentLocationKind() {
    if (!this.extensionHostDebugEnvironment) {
      this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
    }
    return this.extensionHostDebugEnvironment.extensionDevelopmentKind;
  }
  get extensionTestsLocationURI() {
    if (!this.extensionHostDebugEnvironment) {
      this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
    }
    return this.extensionHostDebugEnvironment.extensionTestsLocationURI;
  }
  get extensionEnabledProposedApi() {
    if (!this.extensionHostDebugEnvironment) {
      this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
    }
    if (this.extensionHostDebugEnvironment.extensionEnabledProposedApi !== void 0) {
      return this.extensionHostDebugEnvironment.extensionEnabledProposedApi;
    }
    if (this.options.enabledExtensionProposedApi !== void 0) {
      return [...this.options.enabledExtensionProposedApi];
    }
    return void 0;
  }
  get debugRenderer() {
    if (!this.extensionHostDebugEnvironment) {
      this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
    }
    return this.extensionHostDebugEnvironment.debugRenderer;
  }
  get enableSmokeTestDriver() {
    return this.options.developmentOptions?.enableSmokeTestDriver;
  }
  get disableExtensions() {
    return this.payload?.get("disableExtensions") === "true";
  }
  get enableExtensions() {
    return this.options.enabledExtensions;
  }
  get webviewExternalEndpoint() {
    const endpoint = this.options.webviewEndpoint || this.productService.webviewContentExternalBaseUrlTemplate || "https://{{uuid}}.vscode-cdn.net/{{quality}}/{{commit}}/out/vs/workbench/contrib/webview/browser/pre/";
    const webviewExternalEndpointCommit = this.payload?.get("webviewExternalEndpointCommit");
    return endpoint.replace("{{commit}}", webviewExternalEndpointCommit ?? this.productService.commit ?? "ef65ac1ba57f57f2a3961bfe94aa20481caca4c6").replace("{{quality}}", (webviewExternalEndpointCommit ? "insider" : this.productService.quality) ?? "insider");
  }
  get extensionTelemetryLogResource() {
    return joinPath(this.logsHome, "extensionTelemetry.log");
  }
  get disableTelemetry() {
    return false;
  }
  get disableExperiments() {
    return false;
  }
  get verbose() {
    return this.payload?.get("verbose") === "true";
  }
  get logExtensionHostCommunication() {
    return this.payload?.get("logExtensionHostCommunication") === "true";
  }
  get skipReleaseNotes() {
    return this.payload?.get("skipReleaseNotes") === "true";
  }
  get skipWelcome() {
    return this.payload?.get("skipWelcome") === "true";
  }
  get disableWorkspaceTrust() {
    return !this.options.enableWorkspaceTrust;
  }
  get isSessionsWindow() {
    return this.payload?.get("isSessionsWindow") === "true";
  }
  get profile() {
    return this.payload?.get("profile");
  }
  get editSessionId() {
    return this.options.editSessionId;
  }
  resolveExtensionHostDebugEnvironment() {
    const extensionHostDebugEnvironment = {
      params: {
        port: null,
        break: false
      },
      debugRenderer: false,
      isExtensionDevelopment: false,
      extensionDevelopmentLocationURI: void 0,
      extensionDevelopmentKind: void 0
    };
    if (this.payload && (!this.isBuilt || this.enableSmokeTestDriver)) {
      for (const [key, value] of this.payload) {
        switch (key) {
          case "extensionDevelopmentPath":
            if (!extensionHostDebugEnvironment.extensionDevelopmentLocationURI) {
              extensionHostDebugEnvironment.extensionDevelopmentLocationURI = [];
            }
            extensionHostDebugEnvironment.extensionDevelopmentLocationURI.push(URI.parse(value));
            extensionHostDebugEnvironment.isExtensionDevelopment = true;
            break;
          case "extensionDevelopmentKind":
            extensionHostDebugEnvironment.extensionDevelopmentKind = [value];
            break;
          case "extensionTestsPath":
            extensionHostDebugEnvironment.extensionTestsLocationURI = URI.parse(value);
            break;
          case "debugRenderer":
            extensionHostDebugEnvironment.debugRenderer = value === "true";
            break;
          case "debugId":
            extensionHostDebugEnvironment.params.debugId = value;
            break;
          case "inspect-brk-extensions":
            extensionHostDebugEnvironment.params.port = parseInt(value);
            extensionHostDebugEnvironment.params.break = true;
            break;
          case "inspect-extensions":
            extensionHostDebugEnvironment.params.port = parseInt(value);
            break;
          case "extensionEnvironment":
            try {
              extensionHostDebugEnvironment.params.env = JSON.parse(value);
            } catch (error) {
              onUnexpectedError(error);
            }
            break;
          case "enableProposedApi":
            extensionHostDebugEnvironment.extensionEnabledProposedApi = [];
            break;
        }
      }
    }
    const developmentOptions = this.options.developmentOptions;
    if (developmentOptions && !extensionHostDebugEnvironment.isExtensionDevelopment) {
      if (developmentOptions.extensions?.length) {
        extensionHostDebugEnvironment.extensionDevelopmentLocationURI = developmentOptions.extensions.map((e) => URI.revive(e));
        extensionHostDebugEnvironment.isExtensionDevelopment = true;
      }
      if (developmentOptions.extensionTestsPath) {
        extensionHostDebugEnvironment.extensionTestsLocationURI = URI.revive(developmentOptions.extensionTestsPath);
      }
    }
    return extensionHostDebugEnvironment;
  }
  get filesToOpenOrCreate() {
    if (this.payload) {
      const fileToOpen = this.payload.get("openFile");
      if (fileToOpen) {
        const fileUri = URI.parse(fileToOpen);
        if (this.payload.has("gotoLineMode")) {
          const pathColumnAware = parseLineAndColumnAware(fileUri.path);
          return [{
            fileUri: fileUri.with({ path: pathColumnAware.path }),
            options: {
              selection: !isUndefined(pathColumnAware.line) ? { startLineNumber: pathColumnAware.line, startColumn: pathColumnAware.column || 1 } : void 0
            }
          }];
        }
        return [{ fileUri }];
      }
    }
    return void 0;
  }
  get filesToDiff() {
    if (this.payload) {
      const fileToDiffPrimary = this.payload.get("diffFilePrimary");
      const fileToDiffSecondary = this.payload.get("diffFileSecondary");
      if (fileToDiffPrimary && fileToDiffSecondary) {
        return [
          { fileUri: URI.parse(fileToDiffSecondary) },
          { fileUri: URI.parse(fileToDiffPrimary) }
        ];
      }
    }
    return void 0;
  }
  get filesToMerge() {
    if (this.payload) {
      const fileToMerge1 = this.payload.get("mergeFile1");
      const fileToMerge2 = this.payload.get("mergeFile2");
      const fileToMergeBase = this.payload.get("mergeFileBase");
      const fileToMergeResult = this.payload.get("mergeFileResult");
      if (fileToMerge1 && fileToMerge2 && fileToMergeBase && fileToMergeResult) {
        return [
          { fileUri: URI.parse(fileToMerge1) },
          { fileUri: URI.parse(fileToMerge2) },
          { fileUri: URI.parse(fileToMergeBase) },
          { fileUri: URI.parse(fileToMergeResult) }
        ];
      }
    }
    return void 0;
  }
}
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "remoteAuthority", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "expectsResolverExtension", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "isBuilt", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "logLevel", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "windowLogsPath", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "logFile", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "userRoamingDataHome", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "argvResource", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "cacheHome", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "workspaceStorageHome", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "appSharedDataHome", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "localHistoryHome", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "stateResource", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "userDataSyncHome", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "sync", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "keyboardLayoutResource", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "untitledWorkspacesHome", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "agentSessionsWorkspace", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "serviceMachineIdResource", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "extHostLogsPath", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "debugExtensionHost", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "isExtensionDevelopment", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "extensionDevelopmentLocationURI", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "extensionDevelopmentLocationKind", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "extensionTestsLocationURI", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "extensionEnabledProposedApi", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "debugRenderer", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "enableSmokeTestDriver", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "disableExtensions", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "enableExtensions", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "webviewExternalEndpoint", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "extensionTelemetryLogResource", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "disableTelemetry", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "disableExperiments", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "verbose", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "logExtensionHostCommunication", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "skipReleaseNotes", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "skipWelcome", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "disableWorkspaceTrust", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "isSessionsWindow", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "profile", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "editSessionId", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "filesToOpenOrCreate", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "filesToDiff", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "filesToMerge", 1);
export {
  BrowserWorkbenchEnvironmentService,
  IBrowserWorkbenchEnvironmentService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxlbnZpcm9ubWVudFxcYnJvd3NlclxcZW52aXJvbm1lbnRTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbktpbmQsIElFbnZpcm9ubWVudFNlcnZpY2UsIElFeHRlbnNpb25Ib3N0RGVidWdQYXJhbXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSVBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29uc3RydWN0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvd2ViLmFwaS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBtZW1vaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBwYXJzZUxpbmVBbmRDb2x1bW5Bd2FyZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V4dHBhdGguanMnO1xuaW1wb3J0IHsgTG9nTGV2ZWxUb1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGlzVW5kZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgcmVmaW5lU2VydmljZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVRleHRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRVhURU5TSU9OX0lERU5USUZJRVJfV0lUSF9MT0dfUkVHRVggfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNvbnN0IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlID0gcmVmaW5lU2VydmljZURlY29yYXRvcjxJRW52aXJvbm1lbnRTZXJ2aWNlLCBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZT4oSUVudmlyb25tZW50U2VydmljZSk7XG5cbi8qKlxuICogQSBzdWJjbGFzcyBvZiB0aGUgYElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2VgIHRvIGJlIHVzZWQgb25seSBlbnZpcm9ubWVudHNcbiAqIHdoZXJlIHRoZSB3ZWIgQVBJIGlzIGF2YWlsYWJsZSAoYnJvd3NlcnMsIEVsZWN0cm9uKS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBleHRlbmRzIElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2Uge1xuXG5cdC8qKlxuXHQgKiBPcHRpb25zIHVzZWQgdG8gY29uZmlndXJlIHRoZSB3b3JrYmVuY2guXG5cdCAqL1xuXHRyZWFkb25seSBvcHRpb25zPzogSVdvcmtiZW5jaENvbnN0cnVjdGlvbk9wdGlvbnM7XG5cblx0LyoqXG5cdCAqIEdldHMgd2hldGhlciBhIHJlc29sdmVyIGV4dGVuc2lvbiBpcyBleHBlY3RlZCBmb3IgdGhlIGVudmlyb25tZW50LlxuXHQgKi9cblx0cmVhZG9ubHkgZXhwZWN0c1Jlc29sdmVyRXh0ZW5zaW9uOiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBpbXBsZW1lbnRzIElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRAbWVtb2l6ZVxuXHRnZXQgcmVtb3RlQXV0aG9yaXR5KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLm9wdGlvbnMucmVtb3RlQXV0aG9yaXR5OyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IGV4cGVjdHNSZXNvbHZlckV4dGVuc2lvbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLm9wdGlvbnMucmVtb3RlQXV0aG9yaXR5Py5pbmNsdWRlcygnKycpICYmICF0aGlzLm9wdGlvbnMud2ViU29ja2V0RmFjdG9yeTtcblx0fVxuXG5cdEBtZW1vaXplXG5cdGdldCBpc0J1aWx0KCk6IGJvb2xlYW4geyByZXR1cm4gISF0aGlzLnByb2R1Y3RTZXJ2aWNlLmNvbW1pdDsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBsb2dMZXZlbCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGxvZ0xldmVsRnJvbVBheWxvYWQgPSB0aGlzLnBheWxvYWQ/LmdldCgnbG9nTGV2ZWwnKTtcblx0XHRpZiAobG9nTGV2ZWxGcm9tUGF5bG9hZCkge1xuXHRcdFx0cmV0dXJuIGxvZ0xldmVsRnJvbVBheWxvYWQuc3BsaXQoJywnKS5maW5kKGVudHJ5ID0+ICFFWFRFTlNJT05fSURFTlRJRklFUl9XSVRIX0xPR19SRUdFWC50ZXN0KGVudHJ5KSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy5kZXZlbG9wbWVudE9wdGlvbnM/LmxvZ0xldmVsICE9PSB1bmRlZmluZWQgPyBMb2dMZXZlbFRvU3RyaW5nKHRoaXMub3B0aW9ucy5kZXZlbG9wbWVudE9wdGlvbnM/LmxvZ0xldmVsKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCBleHRlbnNpb25Mb2dMZXZlbCgpOiBbc3RyaW5nLCBzdHJpbmddW10gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGxvZ0xldmVsRnJvbVBheWxvYWQgPSB0aGlzLnBheWxvYWQ/LmdldCgnbG9nTGV2ZWwnKTtcblx0XHRpZiAobG9nTGV2ZWxGcm9tUGF5bG9hZCkge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBbc3RyaW5nLCBzdHJpbmddW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgbG9nTGV2ZWxGcm9tUGF5bG9hZC5zcGxpdCgnLCcpKSB7XG5cdFx0XHRcdGNvbnN0IG1hdGNoZXMgPSBFWFRFTlNJT05fSURFTlRJRklFUl9XSVRIX0xPR19SRUdFWC5leGVjKGVudHJ5KTtcblx0XHRcdFx0aWYgKG1hdGNoZXM/LlsxXSAmJiBtYXRjaGVzWzJdKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goW21hdGNoZXNbMV0sIG1hdGNoZXNbMl1dKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVzdWx0Lmxlbmd0aCA/IHJlc3VsdCA6IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5vcHRpb25zLmRldmVsb3BtZW50T3B0aW9ucz8uZXh0ZW5zaW9uTG9nTGV2ZWwgIT09IHVuZGVmaW5lZCA/IHRoaXMub3B0aW9ucy5kZXZlbG9wbWVudE9wdGlvbnM/LmV4dGVuc2lvbkxvZ0xldmVsLm1hcCgoW2V4dGVuc2lvbiwgbG9nTGV2ZWxdKSA9PiAoW2V4dGVuc2lvbiwgTG9nTGV2ZWxUb1N0cmluZyhsb2dMZXZlbCldKSkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgcHJvZkR1cmF0aW9uTWFya2VycygpOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcHJvZkR1cmF0aW9uTWFya2Vyc0Zyb21QYXlsb2FkID0gdGhpcy5wYXlsb2FkPy5nZXQoJ3Byb2ZEdXJhdGlvbk1hcmtlcnMnKTtcblx0XHRpZiAocHJvZkR1cmF0aW9uTWFya2Vyc0Zyb21QYXlsb2FkKSB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHByb2ZEdXJhdGlvbk1hcmtlcnNGcm9tUGF5bG9hZC5zcGxpdCgnLCcpKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGVudHJ5KTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJlc3VsdC5sZW5ndGggPT09IDIgPyByZXN1bHQgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdEBtZW1vaXplXG5cdGdldCB3aW5kb3dMb2dzUGF0aCgpOiBVUkkgeyByZXR1cm4gdGhpcy5sb2dzSG9tZTsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBsb2dGaWxlKCk6IFVSSSB7IHJldHVybiBqb2luUGF0aCh0aGlzLndpbmRvd0xvZ3NQYXRoLCAnd2luZG93LmxvZycpOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IHVzZXJSb2FtaW5nRGF0YUhvbWUoKTogVVJJIHsgcmV0dXJuIFVSSS5maWxlKCcvVXNlcicpLndpdGgoeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlVXNlckRhdGEgfSk7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgYXJndlJlc291cmNlKCk6IFVSSSB7IHJldHVybiBqb2luUGF0aCh0aGlzLnVzZXJSb2FtaW5nRGF0YUhvbWUsICdhcmd2Lmpzb24nKTsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBjYWNoZUhvbWUoKTogVVJJIHsgcmV0dXJuIGpvaW5QYXRoKHRoaXMudXNlclJvYW1pbmdEYXRhSG9tZSwgJ2NhY2hlcycpOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IHdvcmtzcGFjZVN0b3JhZ2VIb21lKCk6IFVSSSB7IHJldHVybiBqb2luUGF0aCh0aGlzLnVzZXJSb2FtaW5nRGF0YUhvbWUsICd3b3Jrc3BhY2VTdG9yYWdlJyk7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgYXBwU2hhcmVkRGF0YUhvbWUoKTogVVJJIHsgcmV0dXJuIGpvaW5QYXRoKHRoaXMudXNlclJvYW1pbmdEYXRhSG9tZSwgJ3NoYXJlZERhdGEnKTsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBsb2NhbEhpc3RvcnlIb21lKCk6IFVSSSB7IHJldHVybiBqb2luUGF0aCh0aGlzLnVzZXJSb2FtaW5nRGF0YUhvbWUsICdIaXN0b3J5Jyk7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgc3RhdGVSZXNvdXJjZSgpOiBVUkkgeyByZXR1cm4gam9pblBhdGgodGhpcy51c2VyUm9hbWluZ0RhdGFIb21lLCAnU3RhdGUnLCAnc3RvcmFnZS5qc29uJyk7IH1cblxuXHQvKipcblx0ICogSW4gV2ViIGV2ZXJ5IHdvcmtzcGFjZSBjYW4gcG90ZW50aWFsbHkgaGF2ZSBzY29wZWQgdXNlci1kYXRhXG5cdCAqIGFuZC9vciBleHRlbnNpb25zIGFuZCBpZiBTeW5jIHN0YXRlIGlzIHNoYXJlZCB0aGVuIGl0IGNhbiBtYWtlXG5cdCAqIFN5bmMgZXJyb3IgcHJvbmUgLSBzYXkgcmVtb3ZpbmcgZXh0ZW5zaW9ucyBmcm9tIGFub3RoZXIgd29ya3NwYWNlLlxuXHQgKiBIZW5jZSBzY29wZSBTeW5jIHN0YXRlIHBlciB3b3Jrc3BhY2UuIFN5bmMgc2NvcGVkIHRvIGEgd29ya3NwYWNlXG5cdCAqIGlzIGNhcGFibGUgb2YgaGFuZGxpbmcgb3BlbmluZyBzYW1lIHdvcmtzcGFjZSBpbiBtdWx0aXBsZSB3aW5kb3dzLlxuXHQgKi9cblx0QG1lbW9pemVcblx0Z2V0IHVzZXJEYXRhU3luY0hvbWUoKTogVVJJIHsgcmV0dXJuIGpvaW5QYXRoKHRoaXMudXNlclJvYW1pbmdEYXRhSG9tZSwgJ3N5bmMnLCB0aGlzLndvcmtzcGFjZUlkKTsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBzeW5jKCk6ICdvbicgfCAnb2ZmJyB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQga2V5Ym9hcmRMYXlvdXRSZXNvdXJjZSgpOiBVUkkgeyByZXR1cm4gam9pblBhdGgodGhpcy51c2VyUm9hbWluZ0RhdGFIb21lLCAna2V5Ym9hcmRMYXlvdXQuanNvbicpOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IHVudGl0bGVkV29ya3NwYWNlc0hvbWUoKTogVVJJIHsgcmV0dXJuIGpvaW5QYXRoKHRoaXMudXNlclJvYW1pbmdEYXRhSG9tZSwgJ1dvcmtzcGFjZXMnKTsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBhZ2VudFNlc3Npb25zV29ya3NwYWNlKCk6IFVSSSB7IHJldHVybiBqb2luUGF0aCh0aGlzLnVzZXJSb2FtaW5nRGF0YUhvbWUsICdhZ2VudC1zZXNzaW9ucy5jb2RlLXdvcmtzcGFjZScpOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IHNlcnZpY2VNYWNoaW5lSWRSZXNvdXJjZSgpOiBVUkkgeyByZXR1cm4gam9pblBhdGgodGhpcy51c2VyUm9hbWluZ0RhdGFIb21lLCAnbWFjaGluZWlkJyk7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgZXh0SG9zdExvZ3NQYXRoKCk6IFVSSSB7IHJldHVybiBqb2luUGF0aCh0aGlzLmxvZ3NIb21lLCAnZXh0aG9zdCcpOyB9XG5cblx0cHJpdmF0ZSBleHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudDogSUV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdEBtZW1vaXplXG5cdGdldCBkZWJ1Z0V4dGVuc2lvbkhvc3QoKTogSUV4dGVuc2lvbkhvc3REZWJ1Z1BhcmFtcyB7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50KSB7XG5cdFx0XHR0aGlzLmV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50ID0gdGhpcy5yZXNvbHZlRXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudC5wYXJhbXM7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgaXNFeHRlbnNpb25EZXZlbG9wbWVudCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQpIHtcblx0XHRcdHRoaXMuZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQgPSB0aGlzLnJlc29sdmVFeHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50LmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQ7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgZXh0ZW5zaW9uRGV2ZWxvcG1lbnRMb2NhdGlvblVSSSgpOiBVUklbXSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50KSB7XG5cdFx0XHR0aGlzLmV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50ID0gdGhpcy5yZXNvbHZlRXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudC5leHRlbnNpb25EZXZlbG9wbWVudExvY2F0aW9uVVJJO1xuXHR9XG5cblx0QG1lbW9pemVcblx0Z2V0IGV4dGVuc2lvbkRldmVsb3BtZW50TG9jYXRpb25LaW5kKCk6IEV4dGVuc2lvbktpbmRbXSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50KSB7XG5cdFx0XHR0aGlzLmV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50ID0gdGhpcy5yZXNvbHZlRXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudC5leHRlbnNpb25EZXZlbG9wbWVudEtpbmQ7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSgpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5leHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudCkge1xuXHRcdFx0dGhpcy5leHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudCA9IHRoaXMucmVzb2x2ZUV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50KCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQuZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSTtcblx0fVxuXG5cdEBtZW1vaXplXG5cdGdldCBleHRlbnNpb25FbmFibGVkUHJvcG9zZWRBcGkoKTogc3RyaW5nW10gfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5leHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudCkge1xuXHRcdFx0dGhpcy5leHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudCA9IHRoaXMucmVzb2x2ZUV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50KCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQuZXh0ZW5zaW9uRW5hYmxlZFByb3Bvc2VkQXBpICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50LmV4dGVuc2lvbkVuYWJsZWRQcm9wb3NlZEFwaTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLmVuYWJsZWRFeHRlbnNpb25Qcm9wb3NlZEFwaSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gWy4uLnRoaXMub3B0aW9ucy5lbmFibGVkRXh0ZW5zaW9uUHJvcG9zZWRBcGldO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgZGVidWdSZW5kZXJlcigpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQpIHtcblx0XHRcdHRoaXMuZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQgPSB0aGlzLnJlc29sdmVFeHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50LmRlYnVnUmVuZGVyZXI7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgZW5hYmxlU21va2VUZXN0RHJpdmVyKCkgeyByZXR1cm4gdGhpcy5vcHRpb25zLmRldmVsb3BtZW50T3B0aW9ucz8uZW5hYmxlU21va2VUZXN0RHJpdmVyOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IGRpc2FibGVFeHRlbnNpb25zKCkgeyByZXR1cm4gdGhpcy5wYXlsb2FkPy5nZXQoJ2Rpc2FibGVFeHRlbnNpb25zJykgPT09ICd0cnVlJzsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBlbmFibGVFeHRlbnNpb25zKCkgeyByZXR1cm4gdGhpcy5vcHRpb25zLmVuYWJsZWRFeHRlbnNpb25zOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IHdlYnZpZXdFeHRlcm5hbEVuZHBvaW50KCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgZW5kcG9pbnQgPSB0aGlzLm9wdGlvbnMud2Vidmlld0VuZHBvaW50XG5cdFx0XHR8fCB0aGlzLnByb2R1Y3RTZXJ2aWNlLndlYnZpZXdDb250ZW50RXh0ZXJuYWxCYXNlVXJsVGVtcGxhdGVcblx0XHRcdHx8ICdodHRwczovL3t7dXVpZH19LnZzY29kZS1jZG4ubmV0L3t7cXVhbGl0eX19L3t7Y29tbWl0fX0vb3V0L3ZzL3dvcmtiZW5jaC9jb250cmliL3dlYnZpZXcvYnJvd3Nlci9wcmUvJztcblxuXHRcdGNvbnN0IHdlYnZpZXdFeHRlcm5hbEVuZHBvaW50Q29tbWl0ID0gdGhpcy5wYXlsb2FkPy5nZXQoJ3dlYnZpZXdFeHRlcm5hbEVuZHBvaW50Q29tbWl0Jyk7XG5cdFx0cmV0dXJuIGVuZHBvaW50XG5cdFx0XHQucmVwbGFjZSgne3tjb21taXR9fScsIHdlYnZpZXdFeHRlcm5hbEVuZHBvaW50Q29tbWl0ID8/IHRoaXMucHJvZHVjdFNlcnZpY2UuY29tbWl0ID8/ICdlZjY1YWMxYmE1N2Y1N2YyYTM5NjFiZmU5NGFhMjA0ODFjYWNhNGM2Jylcblx0XHRcdC5yZXBsYWNlKCd7e3F1YWxpdHl9fScsICh3ZWJ2aWV3RXh0ZXJuYWxFbmRwb2ludENvbW1pdCA/ICdpbnNpZGVyJyA6IHRoaXMucHJvZHVjdFNlcnZpY2UucXVhbGl0eSkgPz8gJ2luc2lkZXInKTtcblx0fVxuXG5cdEBtZW1vaXplXG5cdGdldCBleHRlbnNpb25UZWxlbWV0cnlMb2dSZXNvdXJjZSgpOiBVUkkgeyByZXR1cm4gam9pblBhdGgodGhpcy5sb2dzSG9tZSwgJ2V4dGVuc2lvblRlbGVtZXRyeS5sb2cnKTsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBkaXNhYmxlVGVsZW1ldHJ5KCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgZGlzYWJsZUV4cGVyaW1lbnRzKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgdmVyYm9zZSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMucGF5bG9hZD8uZ2V0KCd2ZXJib3NlJykgPT09ICd0cnVlJzsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBsb2dFeHRlbnNpb25Ib3N0Q29tbXVuaWNhdGlvbigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMucGF5bG9hZD8uZ2V0KCdsb2dFeHRlbnNpb25Ib3N0Q29tbXVuaWNhdGlvbicpID09PSAndHJ1ZSc7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgc2tpcFJlbGVhc2VOb3RlcygpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMucGF5bG9hZD8uZ2V0KCdza2lwUmVsZWFzZU5vdGVzJykgPT09ICd0cnVlJzsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBza2lwV2VsY29tZSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMucGF5bG9hZD8uZ2V0KCdza2lwV2VsY29tZScpID09PSAndHJ1ZSc7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgZGlzYWJsZVdvcmtzcGFjZVRydXN0KCk6IGJvb2xlYW4geyByZXR1cm4gIXRoaXMub3B0aW9ucy5lbmFibGVXb3Jrc3BhY2VUcnVzdDsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBpc1Nlc3Npb25zV2luZG93KCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5wYXlsb2FkPy5nZXQoJ2lzU2Vzc2lvbnNXaW5kb3cnKSA9PT0gJ3RydWUnOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IHByb2ZpbGUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMucGF5bG9hZD8uZ2V0KCdwcm9maWxlJyk7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgZWRpdFNlc3Npb25JZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5vcHRpb25zLmVkaXRTZXNzaW9uSWQ7IH1cblxuXHRwcml2YXRlIHBheWxvYWQ6IE1hcDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VJZDogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IGxvZ3NIb21lOiBVUkksXG5cdFx0cmVhZG9ubHkgb3B0aW9uczogSVdvcmtiZW5jaENvbnN0cnVjdGlvbk9wdGlvbnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlXG5cdCkge1xuXHRcdGlmIChvcHRpb25zLndvcmtzcGFjZVByb3ZpZGVyICYmIEFycmF5LmlzQXJyYXkob3B0aW9ucy53b3Jrc3BhY2VQcm92aWRlci5wYXlsb2FkKSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5wYXlsb2FkID0gbmV3IE1hcChvcHRpb25zLndvcmtzcGFjZVByb3ZpZGVyLnBheWxvYWQpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpOyAvLyBwb3NzaWJsZSBpbnZhbGlkIHBheWxvYWQgZm9yIG1hcFxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZUV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50KCk6IElFeHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudCB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQ6IElFeHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudCA9IHtcblx0XHRcdHBhcmFtczoge1xuXHRcdFx0XHRwb3J0OiBudWxsLFxuXHRcdFx0XHRicmVhazogZmFsc2Vcblx0XHRcdH0sXG5cdFx0XHRkZWJ1Z1JlbmRlcmVyOiBmYWxzZSxcblx0XHRcdGlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQ6IGZhbHNlLFxuXHRcdFx0ZXh0ZW5zaW9uRGV2ZWxvcG1lbnRMb2NhdGlvblVSSTogdW5kZWZpbmVkLFxuXHRcdFx0ZXh0ZW5zaW9uRGV2ZWxvcG1lbnRLaW5kOiB1bmRlZmluZWRcblx0XHR9O1xuXG5cdFx0Ly8gRXh0ZW5zaW9uIGhvc3QgZGV2ZWxvcG1lbnQgb3B0aW9ucyBmcm9tIHRoZSBwYXlsb2FkIGFyZSBvbmx5IHZhbGlkIGluIGRldmVsb3BtZW50IG9yIHNtb2tlIHRlc3QgYnVpbGRzLlxuXHRcdGlmICh0aGlzLnBheWxvYWQgJiYgKCF0aGlzLmlzQnVpbHQgfHwgdGhpcy5lbmFibGVTbW9rZVRlc3REcml2ZXIpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiB0aGlzLnBheWxvYWQpIHtcblx0XHRcdFx0c3dpdGNoIChrZXkpIHtcblx0XHRcdFx0XHRjYXNlICdleHRlbnNpb25EZXZlbG9wbWVudFBhdGgnOlxuXHRcdFx0XHRcdFx0aWYgKCFleHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudC5leHRlbnNpb25EZXZlbG9wbWVudExvY2F0aW9uVVJJKSB7XG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50LmV4dGVuc2lvbkRldmVsb3BtZW50TG9jYXRpb25VUkkgPSBbXTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50LmV4dGVuc2lvbkRldmVsb3BtZW50TG9jYXRpb25VUkkucHVzaChVUkkucGFyc2UodmFsdWUpKTtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50LmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnZXh0ZW5zaW9uRGV2ZWxvcG1lbnRLaW5kJzpcblx0XHRcdFx0XHRcdGV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50LmV4dGVuc2lvbkRldmVsb3BtZW50S2luZCA9IFs8RXh0ZW5zaW9uS2luZD52YWx1ZV07XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdleHRlbnNpb25UZXN0c1BhdGgnOlxuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQuZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSA9IFVSSS5wYXJzZSh2YWx1ZSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdkZWJ1Z1JlbmRlcmVyJzpcblx0XHRcdFx0XHRcdGV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50LmRlYnVnUmVuZGVyZXIgPSB2YWx1ZSA9PT0gJ3RydWUnO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnZGVidWdJZCc6XG5cdFx0XHRcdFx0XHRleHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudC5wYXJhbXMuZGVidWdJZCA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnaW5zcGVjdC1icmstZXh0ZW5zaW9ucyc6XG5cdFx0XHRcdFx0XHRleHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudC5wYXJhbXMucG9ydCA9IHBhcnNlSW50KHZhbHVlKTtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50LnBhcmFtcy5icmVhayA9IHRydWU7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdpbnNwZWN0LWV4dGVuc2lvbnMnOlxuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQucGFyYW1zLnBvcnQgPSBwYXJzZUludCh2YWx1ZSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdleHRlbnNpb25FbnZpcm9ubWVudCc6XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRleHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudC5wYXJhbXMuZW52ID0gSlNPTi5wYXJzZSh2YWx1ZSk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnJvcik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdlbmFibGVQcm9wb3NlZEFwaSc6XG5cdFx0XHRcdFx0XHRleHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudC5leHRlbnNpb25FbmFibGVkUHJvcG9zZWRBcGkgPSBbXTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGV2ZWxvcG1lbnRPcHRpb25zID0gdGhpcy5vcHRpb25zLmRldmVsb3BtZW50T3B0aW9ucztcblx0XHRpZiAoZGV2ZWxvcG1lbnRPcHRpb25zICYmICFleHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudC5pc0V4dGVuc2lvbkRldmVsb3BtZW50KSB7XG5cdFx0XHRpZiAoZGV2ZWxvcG1lbnRPcHRpb25zLmV4dGVuc2lvbnM/Lmxlbmd0aCkge1xuXHRcdFx0XHRleHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudC5leHRlbnNpb25EZXZlbG9wbWVudExvY2F0aW9uVVJJID0gZGV2ZWxvcG1lbnRPcHRpb25zLmV4dGVuc2lvbnMubWFwKGUgPT4gVVJJLnJldml2ZShlKSk7XG5cdFx0XHRcdGV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50LmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZGV2ZWxvcG1lbnRPcHRpb25zLmV4dGVuc2lvblRlc3RzUGF0aCkge1xuXHRcdFx0XHRleHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudC5leHRlbnNpb25UZXN0c0xvY2F0aW9uVVJJID0gVVJJLnJldml2ZShkZXZlbG9wbWVudE9wdGlvbnMuZXh0ZW5zaW9uVGVzdHNQYXRoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQ7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgZmlsZXNUb09wZW5PckNyZWF0ZSgpOiBJUGF0aDxJVGV4dEVkaXRvck9wdGlvbnM+W10gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLnBheWxvYWQpIHtcblx0XHRcdGNvbnN0IGZpbGVUb09wZW4gPSB0aGlzLnBheWxvYWQuZ2V0KCdvcGVuRmlsZScpO1xuXHRcdFx0aWYgKGZpbGVUb09wZW4pIHtcblx0XHRcdFx0Y29uc3QgZmlsZVVyaSA9IFVSSS5wYXJzZShmaWxlVG9PcGVuKTtcblxuXHRcdFx0XHQvLyBTdXBwb3J0OiAtLWdvdG8gcGFyYW1ldGVyIHRvIG9wZW4gb24gbGluZS9jb2xcblx0XHRcdFx0aWYgKHRoaXMucGF5bG9hZC5oYXMoJ2dvdG9MaW5lTW9kZScpKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGF0aENvbHVtbkF3YXJlID0gcGFyc2VMaW5lQW5kQ29sdW1uQXdhcmUoZmlsZVVyaS5wYXRoKTtcblxuXHRcdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdFx0ZmlsZVVyaTogZmlsZVVyaS53aXRoKHsgcGF0aDogcGF0aENvbHVtbkF3YXJlLnBhdGggfSksXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdHNlbGVjdGlvbjogIWlzVW5kZWZpbmVkKHBhdGhDb2x1bW5Bd2FyZS5saW5lKSA/IHsgc3RhcnRMaW5lTnVtYmVyOiBwYXRoQ29sdW1uQXdhcmUubGluZSwgc3RhcnRDb2x1bW46IHBhdGhDb2x1bW5Bd2FyZS5jb2x1bW4gfHwgMSB9IDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fV07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gW3sgZmlsZVVyaSB9XTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0QG1lbW9pemVcblx0Z2V0IGZpbGVzVG9EaWZmKCk6IElQYXRoW10gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLnBheWxvYWQpIHtcblx0XHRcdGNvbnN0IGZpbGVUb0RpZmZQcmltYXJ5ID0gdGhpcy5wYXlsb2FkLmdldCgnZGlmZkZpbGVQcmltYXJ5Jyk7XG5cdFx0XHRjb25zdCBmaWxlVG9EaWZmU2Vjb25kYXJ5ID0gdGhpcy5wYXlsb2FkLmdldCgnZGlmZkZpbGVTZWNvbmRhcnknKTtcblx0XHRcdGlmIChmaWxlVG9EaWZmUHJpbWFyeSAmJiBmaWxlVG9EaWZmU2Vjb25kYXJ5KSB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0eyBmaWxlVXJpOiBVUkkucGFyc2UoZmlsZVRvRGlmZlNlY29uZGFyeSkgfSxcblx0XHRcdFx0XHR7IGZpbGVVcmk6IFVSSS5wYXJzZShmaWxlVG9EaWZmUHJpbWFyeSkgfVxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgZmlsZXNUb01lcmdlKCk6IElQYXRoW10gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLnBheWxvYWQpIHtcblx0XHRcdGNvbnN0IGZpbGVUb01lcmdlMSA9IHRoaXMucGF5bG9hZC5nZXQoJ21lcmdlRmlsZTEnKTtcblx0XHRcdGNvbnN0IGZpbGVUb01lcmdlMiA9IHRoaXMucGF5bG9hZC5nZXQoJ21lcmdlRmlsZTInKTtcblx0XHRcdGNvbnN0IGZpbGVUb01lcmdlQmFzZSA9IHRoaXMucGF5bG9hZC5nZXQoJ21lcmdlRmlsZUJhc2UnKTtcblx0XHRcdGNvbnN0IGZpbGVUb01lcmdlUmVzdWx0ID0gdGhpcy5wYXlsb2FkLmdldCgnbWVyZ2VGaWxlUmVzdWx0Jyk7XG5cdFx0XHRpZiAoZmlsZVRvTWVyZ2UxICYmIGZpbGVUb01lcmdlMiAmJiBmaWxlVG9NZXJnZUJhc2UgJiYgZmlsZVRvTWVyZ2VSZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHR7IGZpbGVVcmk6IFVSSS5wYXJzZShmaWxlVG9NZXJnZTEpIH0sXG5cdFx0XHRcdFx0eyBmaWxlVXJpOiBVUkkucGFyc2UoZmlsZVRvTWVyZ2UyKSB9LFxuXHRcdFx0XHRcdHsgZmlsZVVyaTogVVJJLnBhcnNlKGZpbGVUb01lcmdlQmFzZSkgfSxcblx0XHRcdFx0XHR7IGZpbGVVcmk6IFVSSS5wYXJzZShmaWxlVG9NZXJnZVJlc3VsdCkgfVxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElFeHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudCB7XG5cdHBhcmFtczogSUV4dGVuc2lvbkhvc3REZWJ1Z1BhcmFtcztcblx0ZGVidWdSZW5kZXJlcjogYm9vbGVhbjtcblx0aXNFeHRlbnNpb25EZXZlbG9wbWVudDogYm9vbGVhbjtcblx0ZXh0ZW5zaW9uRGV2ZWxvcG1lbnRMb2NhdGlvblVSST86IFVSSVtdO1xuXHRleHRlbnNpb25EZXZlbG9wbWVudEtpbmQ/OiBFeHRlbnNpb25LaW5kW107XG5cdGV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkk/OiBVUkk7XG5cdGV4dGVuc2lvbkVuYWJsZWRQcm9wb3NlZEFwaT86IHN0cmluZ1tdO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBd0IsMkJBQXNEO0FBSzlFLFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFT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
