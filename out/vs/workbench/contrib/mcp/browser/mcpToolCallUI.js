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
import { Gesture } from "../../../../base/browser/touch.js";
import { decodeBase64 } from "../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { derived, observableFromEvent } from "../../../../base/common/observable.js";
import { isMobile, isWeb, locale } from "../../../../base/common/platform.js";
import { hasKey } from "../../../../base/common/types.js";
import { IAgentHostService } from "../../../../platform/agentHost/common/agentService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ColorScheme } from "../../../../platform/theme/common/theme.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { McpServer } from "../common/mcpServer.js";
import { IMcpService, IMcpSamplingService, McpToolVisibility } from "../common/mcpTypes.js";
import { findMcpServer, startServerAndWaitForLiveTools, translateMcpLogMessage } from "../common/mcpTypesUtils.js";
function readResourceContentToHtml(contents) {
  if (!contents || contents.length === 0) {
    throw new Error("UI resource not found on server");
  }
  const content = contents[0];
  let html;
  const mimeType = content.mimeType || "text/html";
  if (hasKey(content, { text: true })) {
    html = content.text;
  } else if (hasKey(content, { blob: true })) {
    html = decodeBase64(content.blob).toString();
  } else {
    throw new Error("UI resource has no content");
  }
  const meta = content._meta?.ui;
  return {
    ...meta,
    html,
    mimeType
  };
}
let LocalMcpAppCallTransport = class extends Disposable {
  constructor(_uiData, _mcpService, _samplingService) {
    super();
    this._uiData = _uiData;
    this._mcpService = _mcpService;
    this._samplingService = _samplingService;
    this._onNotification = this._register(new Emitter());
    this.onNotification = this._onNotification.event;
  }
  async _getServer(token) {
    return findMcpServer(
      this._mcpService,
      (s) => s.definition.id === this._uiData.serverDefinitionId && s.collection.id === this._uiData.collectionId,
      token
    );
  }
  async log(params) {
    const server = await this._getServer(CancellationToken.None);
    if (server) {
      translateMcpLogMessage(server.logger, params, `[App UI]`);
    }
  }
  async loadResource(token) {
    const server = await this._getServer(token);
    if (!server) {
      throw new Error("MCP server not found for UI resource");
    }
    const resourceResult = await McpServer.callOn(server, (h) => h.readResource({ uri: this._uiData.resourceUri }, token), token);
    return readResourceContentToHtml(resourceResult.contents);
  }
  async callTool(name, params, token) {
    const server = await this._getServer(token);
    if (!server) {
      throw new Error("MCP server not found for tool call");
    }
    await startServerAndWaitForLiveTools(server, void 0, token);
    const tool = server.tools.get().find((t) => t.definition.name === name);
    if (!tool || !(tool.visibility & McpToolVisibility.App)) {
      throw new Error(`Tool not found on server: ${name}`);
    }
    const res = await tool.call(params, void 0, token);
    return {
      content: res.content,
      isError: res.isError,
      _meta: res._meta,
      structuredContent: res.structuredContent
    };
  }
  async readResource(uri, token) {
    const server = await this._getServer(token);
    if (!server) {
      throw new Error("MCP server not found");
    }
    return await McpServer.callOn(server, (h) => h.readResource({ uri }, token), token);
  }
  async sampling(params, token) {
    const server = await this._getServer(token);
    if (!server) {
      throw new Error("MCP server not found for sampling");
    }
    const { sample } = await this._samplingService.sample({
      server,
      isDuringToolCall: true,
      params
    }, token);
    return sample;
  }
};
LocalMcpAppCallTransport = __decorateClass([
  __decorateParam(1, IMcpService),
  __decorateParam(2, IMcpSamplingService)
], LocalMcpAppCallTransport);
let AhpMcpAppCallTransport = class extends Disposable {
  constructor(_uiData, _channel, _agentHostService) {
    super();
    this._uiData = _uiData;
    this._channel = _channel;
    this._agentHostService = _agentHostService;
    this._onNotification = this._register(new Emitter());
    this.onNotification = this._onNotification.event;
    this._register(this._agentHostService.onMcpNotification((n) => {
      if (n.channel === this._channel) {
        this._onNotification.fire({ method: n.method, params: n.params });
      }
    }));
  }
  async log(params) {
    try {
      await this._agentHostService.handleMcpRequest(this._channel, "notifications/message", params);
    } catch {
    }
  }
  async loadResource(_token) {
    const result = await this._agentHostService.handleMcpRequest(this._channel, "resources/read", { uri: this._uiData.resourceUri });
    return readResourceContentToHtml(result.contents);
  }
  async callTool(name, params, _token) {
    const result = await this._agentHostService.handleMcpRequest(this._channel, "tools/call", { name, arguments: params });
    return result;
  }
  async readResource(uri, _token) {
    const result = await this._agentHostService.handleMcpRequest(this._channel, "resources/read", { uri });
    return result;
  }
  async sampling(params, _token) {
    const result = await this._agentHostService.handleMcpRequest(this._channel, "sampling/createMessage", params);
    return result;
  }
};
AhpMcpAppCallTransport = __decorateClass([
  __decorateParam(2, IAgentHostService)
], AhpMcpAppCallTransport);
let McpToolCallUI = class extends Disposable {
  constructor(_uiData, instantiationService, themeService) {
    super();
    this._uiData = _uiData;
    this._transport = this._register(
      _uiData.kind === "agentHost" ? instantiationService.createInstance(AhpMcpAppCallTransport, _uiData, _uiData.channel) : instantiationService.createInstance(LocalMcpAppCallTransport, _uiData)
    );
    this.onNotification = this._transport.onNotification;
    const colorTheme = observableFromEvent(
      themeService.onDidColorThemeChange,
      () => {
        const type = themeService.getColorTheme().type;
        return type === ColorScheme.DARK || type === ColorScheme.HIGH_CONTRAST_DARK ? "dark" : "light";
      }
    );
    this.hostContext = derived((reader) => {
      return {
        theme: colorTheme.read(reader),
        styles: {
          variables: {
            "--color-background-primary": "var(--vscode-editor-background)",
            "--color-background-secondary": "var(--vscode-sideBar-background)",
            "--color-background-tertiary": "var(--vscode-activityBar-background)",
            "--color-background-inverse": "var(--vscode-editor-foreground)",
            "--color-background-ghost": "transparent",
            "--color-background-info": "var(--vscode-inputValidation-infoBackground)",
            "--color-background-danger": "var(--vscode-inputValidation-errorBackground)",
            "--color-background-success": "var(--vscode-diffEditor-insertedTextBackground)",
            "--color-background-warning": "var(--vscode-inputValidation-warningBackground)",
            "--color-background-disabled": "var(--vscode-editor-inactiveSelectionBackground)",
            "--color-text-primary": "var(--vscode-foreground)",
            "--color-text-secondary": "var(--vscode-descriptionForeground)",
            "--color-text-tertiary": "var(--vscode-disabledForeground)",
            "--color-text-inverse": "var(--vscode-editor-background)",
            "--color-text-info": "var(--vscode-textLink-foreground)",
            "--color-text-danger": "var(--vscode-errorForeground)",
            "--color-text-success": "var(--vscode-testing-iconPassed)",
            "--color-text-warning": "var(--vscode-editorWarning-foreground)",
            "--color-text-disabled": "var(--vscode-disabledForeground)",
            "--color-text-ghost": "var(--vscode-descriptionForeground)",
            "--color-border-primary": "var(--vscode-widget-border)",
            "--color-border-secondary": "var(--vscode-editorWidget-border)",
            "--color-border-tertiary": "var(--vscode-panel-border)",
            "--color-border-inverse": "var(--vscode-foreground)",
            "--color-border-ghost": "transparent",
            "--color-border-info": "var(--vscode-inputValidation-infoBorder)",
            "--color-border-danger": "var(--vscode-inputValidation-errorBorder)",
            "--color-border-success": "var(--vscode-testing-iconPassed)",
            "--color-border-warning": "var(--vscode-inputValidation-warningBorder)",
            "--color-border-disabled": "var(--vscode-disabledForeground)",
            "--color-ring-primary": "var(--vscode-focusBorder)",
            "--color-ring-secondary": "var(--vscode-focusBorder)",
            "--color-ring-inverse": "var(--vscode-focusBorder)",
            "--color-ring-info": "var(--vscode-inputValidation-infoBorder)",
            "--color-ring-danger": "var(--vscode-inputValidation-errorBorder)",
            "--color-ring-success": "var(--vscode-testing-iconPassed)",
            "--color-ring-warning": "var(--vscode-inputValidation-warningBorder)",
            "--font-sans": "var(--vscode-font-family)",
            "--font-mono": "var(--vscode-editor-font-family)",
            "--font-weight-normal": "normal",
            "--font-weight-medium": "500",
            "--font-weight-semibold": "600",
            "--font-weight-bold": "bold",
            "--font-text-xs-size": "10px",
            "--font-text-sm-size": "11px",
            "--font-text-md-size": "13px",
            "--font-text-lg-size": "14px",
            "--font-heading-xs-size": "16px",
            "--font-heading-sm-size": "18px",
            "--font-heading-md-size": "20px",
            "--font-heading-lg-size": "24px",
            "--font-heading-xl-size": "32px",
            "--font-heading-2xl-size": "40px",
            "--font-heading-3xl-size": "48px",
            "--border-radius-xs": "2px",
            "--border-radius-sm": "3px",
            "--border-radius-md": "4px",
            "--border-radius-lg": "6px",
            "--border-radius-xl": "8px",
            "--border-radius-full": "9999px",
            "--border-width-regular": "1px",
            "--font-text-xs-line-height": "1.5",
            "--font-text-sm-line-height": "1.5",
            "--font-text-md-line-height": "1.5",
            "--font-text-lg-line-height": "1.5",
            "--font-heading-xs-line-height": "1.25",
            "--font-heading-sm-line-height": "1.25",
            "--font-heading-md-line-height": "1.25",
            "--font-heading-lg-line-height": "1.25",
            "--font-heading-xl-line-height": "1.25",
            "--font-heading-2xl-line-height": "1.25",
            "--font-heading-3xl-line-height": "1.25",
            "--shadow-hairline": "0 0 0 1px var(--vscode-widget-shadow)",
            "--shadow-sm": "0 1px 2px 0 var(--vscode-widget-shadow)",
            "--shadow-md": "0 4px 6px -1px var(--vscode-widget-shadow)",
            "--shadow-lg": "0 10px 15px -3px var(--vscode-widget-shadow)"
          }
        },
        displayMode: "inline",
        availableDisplayModes: ["inline"],
        locale,
        platform: isWeb ? "web" : isMobile ? "mobile" : "desktop",
        deviceCapabilities: {
          touch: Gesture.isTouchDevice(),
          hover: Gesture.isHoverDevice()
        }
      };
    });
  }
  /**
   * Gets the underlying UI data.
   */
  get uiData() {
    return this._uiData;
  }
  /**
   * Logs a message to the MCP server's logger.
   */
  log(log) {
    return this._transport.log(log);
  }
  /**
   * Loads the UI resource from the MCP server.
   * @param token Cancellation token
   * @returns The HTML content and CSP configuration
   */
  loadResource(token) {
    return this._transport.loadResource(token);
  }
  /**
   * Calls a tool on the MCP server.
   * @param name Tool name
   * @param params Tool parameters
   * @param token Cancellation token
   * @returns The tool call result
   */
  callTool(name, params, token) {
    return this._transport.callTool(name, params, token);
  }
  /**
   * Reads a resource from the MCP server.
   * @param uri Resource URI
   * @param token Cancellation token
   * @returns The resource content
   */
  readResource(uri, token) {
    return this._transport.readResource(uri, token);
  }
  /**
   * Issues a `sampling/createMessage` request against the MCP server's
   * host-side sampling implementation. Only supported when the App
   * server runs inside an agent host that has opted into sampling.
   */
  sampling(params, token) {
    return this._transport.sampling(params, token);
  }
};
McpToolCallUI = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IThemeService)
], McpToolCallUI);
export {
  McpToolCallUI
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcYnJvd3NlclxcbWNwVG9vbENhbGxVSS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEdlc3R1cmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgZGVjb2RlQmFzZTY0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZGVyaXZlZCwgSU9ic2VydmFibGUsIG9ic2VydmFibGVGcm9tRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzTW9iaWxlLCBpc1dlYiwgbG9jYWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IENvbG9yU2NoZW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1jcFNlcnZlciB9IGZyb20gJy4uL2NvbW1vbi9tY3BTZXJ2ZXIuanMnO1xuaW1wb3J0IHsgSU1jcFNlcnZlciwgSU1jcFNlcnZpY2UsIElNY3BTYW1wbGluZ1NlcnZpY2UsIElNY3BUb29sQ2FsbFVJRGF0YSwgTWNwVG9vbFZpc2liaWxpdHkgfSBmcm9tICcuLi9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgZmluZE1jcFNlcnZlciwgc3RhcnRTZXJ2ZXJBbmRXYWl0Rm9yTGl2ZVRvb2xzLCB0cmFuc2xhdGVNY3BMb2dNZXNzYWdlIH0gZnJvbSAnLi4vY29tbW9uL21jcFR5cGVzVXRpbHMuanMnO1xuaW1wb3J0IHsgTUNQIH0gZnJvbSAnLi4vY29tbW9uL21vZGVsQ29udGV4dFByb3RvY29sLmpzJztcbmltcG9ydCB7IE1jcEFwcHMgfSBmcm9tICcuLi9jb21tb24vbW9kZWxDb250ZXh0UHJvdG9jb2xBcHBzLmpzJztcblxuLyoqXG4gKiBSZXN1bHQgZnJvbSBsb2FkaW5nIGFuIE1DUCBBcHAgVUkgcmVzb3VyY2UuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSU1jcEFwcFJlc291cmNlQ29udGVudCBleHRlbmRzIE1jcEFwcHMuTWNwVWlSZXNvdXJjZU1ldGEge1xuXHQvKiogVGhlIEhUTUwgY29udGVudCBvZiB0aGUgVUkgcmVzb3VyY2UgKi9cblx0cmVhZG9ubHkgaHRtbDogc3RyaW5nO1xuXHQvKiogTUlNRSB0eXBlIG9mIHRoZSBjb250ZW50ICovXG5cdHJlYWRvbmx5IG1pbWVUeXBlOiBzdHJpbmc7XG59XG5cbi8qKlxuICogVHJhbnNwb3J0IGFic3RyYWN0aW9uIGZvciB0aGUgY29uc3RyYWluZWQgc3Vic2V0IG9mIE1DUCByZXF1ZXN0cyBhbiBNQ1BcbiAqIEFwcCdzIHdlYnZpZXcgbWFrZXMgYmFjayB0byB0aGUgaG9zdC4gVHdvIGltcGxlbWVudGF0aW9ucyBleGlzdDogb25lXG4gKiByb3V0ZXMgdGhyb3VnaCB7QGxpbmsgSU1jcFNlcnZpY2V9IChsb2NhbCBzZXJ2ZXJzKSwgdGhlIG90aGVyIHRocm91Z2hcbiAqIHtAbGluayBJQWdlbnRIb3N0U2VydmljZS5oYW5kbGVNY3BSZXF1ZXN0fSBvbiBhbiBgbWNwOi8vYCBBSFAgc2lkZVxuICogY2hhbm5lbCAoYWdlbnQtaG9zdC1yZXNpZGVudCBzZXJ2ZXJzKS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJTWNwQXBwQ2FsbFRyYW5zcG9ydCBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0LyoqIEZvcndhcmRlZCBNQ1Agc2VydmVyIG5vdGlmaWNhdGlvbnMgKGBub3RpZmljYXRpb25zLypgKSBmb3IgdGhpcyBzZXJ2ZXIuICovXG5cdHJlYWRvbmx5IG9uTm90aWZpY2F0aW9uOiBFdmVudDx7IHJlYWRvbmx5IG1ldGhvZDogc3RyaW5nOyByZWFkb25seSBwYXJhbXM/OiB1bmtub3duIH0+O1xuXG5cdGxvYWRSZXNvdXJjZSh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElNY3BBcHBSZXNvdXJjZUNvbnRlbnQ+O1xuXHRjYWxsVG9vbChuYW1lOiBzdHJpbmcsIHBhcmFtczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TUNQLkNhbGxUb29sUmVzdWx0Pjtcblx0cmVhZFJlc291cmNlKHVyaTogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5SZWFkUmVzb3VyY2VSZXN1bHQ+O1xuXHRzYW1wbGluZyhwYXJhbXM6IE1DUC5DcmVhdGVNZXNzYWdlUmVxdWVzdFsncGFyYW1zJ10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TUNQLkNyZWF0ZU1lc3NhZ2VSZXN1bHQ+O1xuXHRsb2cocGFyYW1zOiBNQ1AuTG9nZ2luZ01lc3NhZ2VOb3RpZmljYXRpb25QYXJhbXMpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5mdW5jdGlvbiByZWFkUmVzb3VyY2VDb250ZW50VG9IdG1sKGNvbnRlbnRzOiByZWFkb25seSAoTUNQLlRleHRSZXNvdXJjZUNvbnRlbnRzIHwgTUNQLkJsb2JSZXNvdXJjZUNvbnRlbnRzKVtdKTogSU1jcEFwcFJlc291cmNlQ29udGVudCB7XG5cdGlmICghY29udGVudHMgfHwgY29udGVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdVSSByZXNvdXJjZSBub3QgZm91bmQgb24gc2VydmVyJyk7XG5cdH1cblxuXHRjb25zdCBjb250ZW50ID0gY29udGVudHNbMF07XG5cdGxldCBodG1sOiBzdHJpbmc7XG5cdGNvbnN0IG1pbWVUeXBlID0gY29udGVudC5taW1lVHlwZSB8fCAndGV4dC9odG1sJztcblxuXHRpZiAoaGFzS2V5KGNvbnRlbnQsIHsgdGV4dDogdHJ1ZSB9KSkge1xuXHRcdGh0bWwgPSBjb250ZW50LnRleHQ7XG5cdH0gZWxzZSBpZiAoaGFzS2V5KGNvbnRlbnQsIHsgYmxvYjogdHJ1ZSB9KSkge1xuXHRcdGh0bWwgPSBkZWNvZGVCYXNlNjQoY29udGVudC5ibG9iKS50b1N0cmluZygpO1xuXHR9IGVsc2Uge1xuXHRcdHRocm93IG5ldyBFcnJvcignVUkgcmVzb3VyY2UgaGFzIG5vIGNvbnRlbnQnKTtcblx0fVxuXG5cdGNvbnN0IG1ldGEgPSBjb250ZW50Ll9tZXRhPy51aSBhcyBNY3BBcHBzLk1jcFVpUmVzb3VyY2VNZXRhIHwgdW5kZWZpbmVkO1xuXHRyZXR1cm4ge1xuXHRcdC4uLm1ldGEsXG5cdFx0aHRtbCxcblx0XHRtaW1lVHlwZSxcblx0fTtcbn1cblxuLyoqXG4gKiBMb2NhbCB0cmFuc3BvcnQ6IHJlc29sdmVzIHRoZSBNQ1Agc2VydmVyIHZpYSB7QGxpbmsgSU1jcFNlcnZpY2V9IGFuZFxuICogcHJveGllcyByZXF1ZXN0cyB0aHJvdWdoIHtAbGluayBJTWNwU2VydmVyfS4gVXNlZCBmb3IgbG9jYWxseS1jb25maWd1cmVkXG4gKiBNQ1Agc2VydmVycyB3aG9zZSBzdGF0ZSBsaXZlcyBpbiB0aGUgd29ya2JlbmNoLlxuICovXG5jbGFzcyBMb2NhbE1jcEFwcENhbGxUcmFuc3BvcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU1jcEFwcENhbGxUcmFuc3BvcnQge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk5vdGlmaWNhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgbWV0aG9kOiBzdHJpbmc7IHJlYWRvbmx5IHBhcmFtcz86IHVua25vd24gfT4oKSk7XG5cdHJlYWRvbmx5IG9uTm90aWZpY2F0aW9uOiBFdmVudDx7IHJlYWRvbmx5IG1ldGhvZDogc3RyaW5nOyByZWFkb25seSBwYXJhbXM/OiB1bmtub3duIH0+ID0gdGhpcy5fb25Ob3RpZmljYXRpb24uZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdWlEYXRhOiBFeHRyYWN0PElNY3BUb29sQ2FsbFVJRGF0YSwgeyBraW5kOiAnbG9jYWwnIH0+LFxuXHRcdEBJTWNwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tY3BTZXJ2aWNlOiBJTWNwU2VydmljZSxcblx0XHRASU1jcFNhbXBsaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zYW1wbGluZ1NlcnZpY2U6IElNY3BTYW1wbGluZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRTZXJ2ZXIodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTWNwU2VydmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIGZpbmRNY3BTZXJ2ZXIodGhpcy5fbWNwU2VydmljZSwgcyA9PlxuXHRcdFx0cy5kZWZpbml0aW9uLmlkID09PSB0aGlzLl91aURhdGEuc2VydmVyRGVmaW5pdGlvbklkICYmXG5cdFx0XHRzLmNvbGxlY3Rpb24uaWQgPT09IHRoaXMuX3VpRGF0YS5jb2xsZWN0aW9uSWQsXG5cdFx0XHR0b2tlblxuXHRcdCk7XG5cdH1cblxuXHRhc3luYyBsb2cocGFyYW1zOiBNQ1AuTG9nZ2luZ01lc3NhZ2VOb3RpZmljYXRpb25QYXJhbXMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXJ2ZXIgPSBhd2FpdCB0aGlzLl9nZXRTZXJ2ZXIoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0aWYgKHNlcnZlcikge1xuXHRcdFx0dHJhbnNsYXRlTWNwTG9nTWVzc2FnZSgoc2VydmVyIGFzIE1jcFNlcnZlcikubG9nZ2VyLCBwYXJhbXMsIGBbQXBwIFVJXWApO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGxvYWRSZXNvdXJjZSh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElNY3BBcHBSZXNvdXJjZUNvbnRlbnQ+IHtcblx0XHRjb25zdCBzZXJ2ZXIgPSBhd2FpdCB0aGlzLl9nZXRTZXJ2ZXIodG9rZW4pO1xuXHRcdGlmICghc2VydmVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ01DUCBzZXJ2ZXIgbm90IGZvdW5kIGZvciBVSSByZXNvdXJjZScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc291cmNlUmVzdWx0ID0gYXdhaXQgTWNwU2VydmVyLmNhbGxPbihzZXJ2ZXIsIGggPT4gaC5yZWFkUmVzb3VyY2UoeyB1cmk6IHRoaXMuX3VpRGF0YS5yZXNvdXJjZVVyaSB9LCB0b2tlbiksIHRva2VuKTtcblx0XHRyZXR1cm4gcmVhZFJlc291cmNlQ29udGVudFRvSHRtbChyZXNvdXJjZVJlc3VsdC5jb250ZW50cyk7XG5cdH1cblxuXHRhc3luYyBjYWxsVG9vbChuYW1lOiBzdHJpbmcsIHBhcmFtczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TUNQLkNhbGxUb29sUmVzdWx0PiB7XG5cdFx0Y29uc3Qgc2VydmVyID0gYXdhaXQgdGhpcy5fZ2V0U2VydmVyKHRva2VuKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdNQ1Agc2VydmVyIG5vdCBmb3VuZCBmb3IgdG9vbCBjYWxsJyk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgc3RhcnRTZXJ2ZXJBbmRXYWl0Rm9yTGl2ZVRvb2xzKHNlcnZlciwgdW5kZWZpbmVkLCB0b2tlbik7XG5cblx0XHRjb25zdCB0b29sID0gc2VydmVyLnRvb2xzLmdldCgpLmZpbmQodCA9PiB0LmRlZmluaXRpb24ubmFtZSA9PT0gbmFtZSk7XG5cdFx0aWYgKCF0b29sIHx8ICEodG9vbC52aXNpYmlsaXR5ICYgTWNwVG9vbFZpc2liaWxpdHkuQXBwKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUb29sIG5vdCBmb3VuZCBvbiBzZXJ2ZXI6ICR7bmFtZX1gKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXMgPSBhd2FpdCB0b29sLmNhbGwocGFyYW1zLCB1bmRlZmluZWQsIHRva2VuKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudDogcmVzLmNvbnRlbnQsXG5cdFx0XHRpc0Vycm9yOiByZXMuaXNFcnJvcixcblx0XHRcdF9tZXRhOiByZXMuX21ldGEsXG5cdFx0XHRzdHJ1Y3R1cmVkQ29udGVudDogcmVzLnN0cnVjdHVyZWRDb250ZW50LFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyByZWFkUmVzb3VyY2UodXJpOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TUNQLlJlYWRSZXNvdXJjZVJlc3VsdD4ge1xuXHRcdGNvbnN0IHNlcnZlciA9IGF3YWl0IHRoaXMuX2dldFNlcnZlcih0b2tlbik7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTUNQIHNlcnZlciBub3QgZm91bmQnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYXdhaXQgTWNwU2VydmVyLmNhbGxPbihzZXJ2ZXIsIGggPT4gaC5yZWFkUmVzb3VyY2UoeyB1cmkgfSwgdG9rZW4pLCB0b2tlbik7XG5cdH1cblxuXHRhc3luYyBzYW1wbGluZyhwYXJhbXM6IE1DUC5DcmVhdGVNZXNzYWdlUmVxdWVzdFsncGFyYW1zJ10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TUNQLkNyZWF0ZU1lc3NhZ2VSZXN1bHQ+IHtcblx0XHRjb25zdCBzZXJ2ZXIgPSBhd2FpdCB0aGlzLl9nZXRTZXJ2ZXIodG9rZW4pO1xuXHRcdGlmICghc2VydmVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ01DUCBzZXJ2ZXIgbm90IGZvdW5kIGZvciBzYW1wbGluZycpO1xuXHRcdH1cblx0XHRjb25zdCB7IHNhbXBsZSB9ID0gYXdhaXQgdGhpcy5fc2FtcGxpbmdTZXJ2aWNlLnNhbXBsZSh7XG5cdFx0XHRzZXJ2ZXIsXG5cdFx0XHRpc0R1cmluZ1Rvb2xDYWxsOiB0cnVlLFxuXHRcdFx0cGFyYW1zLFxuXHRcdH0sIHRva2VuKTtcblx0XHRyZXR1cm4gc2FtcGxlO1xuXHR9XG59XG5cbi8qKlxuICogQUhQIHRyYW5zcG9ydDogcm91dGVzIHJlcXVlc3RzIG92ZXIgdGhlIGBtY3A6Ly9gIHNpZGUgY2hhbm5lbCB2aWFcbiAqIHtAbGluayBJQWdlbnRIb3N0U2VydmljZS5oYW5kbGVNY3BSZXF1ZXN0fSwgYW5kIGZpbHRlcnNcbiAqIHtAbGluayBJQWdlbnRIb3N0U2VydmljZS5vbk1jcE5vdGlmaWNhdGlvbn0gZG93biB0byB0aGlzIGNoYW5uZWwuXG4gKlxuICogVXNlZCBmb3IgTUNQIHNlcnZlcnMgb3duZWQgYnkgYW4gYWdlbnQgaG9zdCAoZS5nLiBDb3BpbG90IENMSSkuXG4gKi9cbmNsYXNzIEFocE1jcEFwcENhbGxUcmFuc3BvcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU1jcEFwcENhbGxUcmFuc3BvcnQge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk5vdGlmaWNhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgbWV0aG9kOiBzdHJpbmc7IHJlYWRvbmx5IHBhcmFtcz86IHVua25vd24gfT4oKSk7XG5cdHJlYWRvbmx5IG9uTm90aWZpY2F0aW9uOiBFdmVudDx7IHJlYWRvbmx5IG1ldGhvZDogc3RyaW5nOyByZWFkb25seSBwYXJhbXM/OiB1bmtub3duIH0+ID0gdGhpcy5fb25Ob3RpZmljYXRpb24uZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdWlEYXRhOiBFeHRyYWN0PElNY3BUb29sQ2FsbFVJRGF0YSwgeyBraW5kOiAnYWdlbnRIb3N0JyB9Pixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jaGFubmVsOiBzdHJpbmcsXG5cdFx0QElBZ2VudEhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50SG9zdFNlcnZpY2U6IElBZ2VudEhvc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYWdlbnRIb3N0U2VydmljZS5vbk1jcE5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdGlmIChuLmNoYW5uZWwgPT09IHRoaXMuX2NoYW5uZWwpIHtcblx0XHRcdFx0dGhpcy5fb25Ob3RpZmljYXRpb24uZmlyZSh7IG1ldGhvZDogbi5tZXRob2QsIHBhcmFtczogbi5wYXJhbXMgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0YXN5bmMgbG9nKHBhcmFtczogTUNQLkxvZ2dpbmdNZXNzYWdlTm90aWZpY2F0aW9uUGFyYW1zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gTm90aWZpY2F0aW9ucyBhcmUgb25lLXdheTsgdGhlIEFIUCBgbWNwOi8vYCBjaGFubmVsIGFjY2VwdHNcblx0XHQvLyBgbm90aWZpY2F0aW9ucy9tZXNzYWdlYCBmcm9tIHRoZSBjbGllbnQuIFdlIHVzZSB0aGUgcmVxdWVzdFxuXHRcdC8vIHBhdGggaGVyZSBmb3Igc3ltbWV0cnkgKHRoZSBob3N0IHRyZWF0cyBgbm90aWZpY2F0aW9ucy9tZXNzYWdlYFxuXHRcdC8vIHRoZSBzYW1lIHJlZ2FyZGxlc3Mgb2YgaG93IGl0IGFycml2ZWQpLiBGYWlsdXJlcyBhcmUgc3dhbGxvd2VkXG5cdFx0Ly8gdG8gYXZvaWQgc3VyZmFjaW5nIGxvZy1waXBlIGVycm9ycyB0byB0aGUgQXBwLlxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLmhhbmRsZU1jcFJlcXVlc3QodGhpcy5fY2hhbm5lbCwgJ25vdGlmaWNhdGlvbnMvbWVzc2FnZScsIHBhcmFtcyBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIG5vLW9wXG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgbG9hZFJlc291cmNlKF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElNY3BBcHBSZXNvdXJjZUNvbnRlbnQ+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLmhhbmRsZU1jcFJlcXVlc3QodGhpcy5fY2hhbm5lbCwgJ3Jlc291cmNlcy9yZWFkJywgeyB1cmk6IHRoaXMuX3VpRGF0YS5yZXNvdXJjZVVyaSB9KSBhcyBNQ1AuUmVhZFJlc291cmNlUmVzdWx0O1xuXHRcdHJldHVybiByZWFkUmVzb3VyY2VDb250ZW50VG9IdG1sKHJlc3VsdC5jb250ZW50cyk7XG5cdH1cblxuXHRhc3luYyBjYWxsVG9vbChuYW1lOiBzdHJpbmcsIHBhcmFtczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5DYWxsVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2FnZW50SG9zdFNlcnZpY2UuaGFuZGxlTWNwUmVxdWVzdCh0aGlzLl9jaGFubmVsLCAndG9vbHMvY2FsbCcsIHsgbmFtZSwgYXJndW1lbnRzOiBwYXJhbXMgfSkgYXMgTUNQLkNhbGxUb29sUmVzdWx0O1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhc3luYyByZWFkUmVzb3VyY2UodXJpOiBzdHJpbmcsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5SZWFkUmVzb3VyY2VSZXN1bHQ+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLmhhbmRsZU1jcFJlcXVlc3QodGhpcy5fY2hhbm5lbCwgJ3Jlc291cmNlcy9yZWFkJywgeyB1cmkgfSkgYXMgTUNQLlJlYWRSZXNvdXJjZVJlc3VsdDtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0YXN5bmMgc2FtcGxpbmcocGFyYW1zOiBNQ1AuQ3JlYXRlTWVzc2FnZVJlcXVlc3RbJ3BhcmFtcyddLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuQ3JlYXRlTWVzc2FnZVJlc3VsdD4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2FnZW50SG9zdFNlcnZpY2UuaGFuZGxlTWNwUmVxdWVzdCh0aGlzLl9jaGFubmVsLCAnc2FtcGxpbmcvY3JlYXRlTWVzc2FnZScsIHBhcmFtcyBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KSBhcyBNQ1AuQ3JlYXRlTWVzc2FnZVJlc3VsdDtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbi8qKlxuICogV3JhcHBlciBjbGFzcyB0aGF0IFwidXBncmFkZXNcIiBzZXJpYWxpemFibGUgSU1jcFRvb2xDYWxsVUlEYXRhIGludG8gYSBmdW5jdGlvbmFsXG4gKiBvYmplY3QgdGhhdCBjYW4gbG9hZCBVSSByZXNvdXJjZXMgYW5kIHByb3h5IHRvb2wvcmVzb3VyY2UgY2FsbHMgYmFjayB0byB0aGUgTUNQIHNlcnZlci5cbiAqXG4gKiBTZWxlY3RzIHRoZSB1bmRlcmx5aW5nIHRyYW5zcG9ydCBiYXNlZCBvbiB3aGV0aGVyIHRoZSByZW5kZXJlciB3YXMgZ2l2ZW5cbiAqIGFuIEFIUCBgbWNwOi8vYCBjaGFubmVsIFx1MjAxNCBhZ2VudC1ob3N0LXJlc2lkZW50IHNlcnZlcnMgcm91dGUgdGhyb3VnaFxuICoge0BsaW5rIElBZ2VudEhvc3RTZXJ2aWNlfSwgZXZlcnl0aGluZyBlbHNlIHVzZXMgdGhlIGxvY2FsIHtAbGluayBJTWNwU2VydmljZX0uXG4gKi9cbmV4cG9ydCBjbGFzcyBNY3BUb29sQ2FsbFVJIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdC8qKlxuXHQgKiBCYXNpYyBob3N0IGNvbnRleHQgcmVmbGVjdGluZyB0aGUgY3VycmVudCBVSSBhbmQgdGhlbWUuIE5vdGFibHkgbGFja3Ncblx0ICogdGhlIGB0b29sSW5mb2Agb3IgYHZpZXdwb3J0YCBzaXplcy5cblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBob3N0Q29udGV4dDogSU9ic2VydmFibGU8TWNwQXBwcy5NY3BVaUhvc3RDb250ZXh0PjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90cmFuc3BvcnQ6IElNY3BBcHBDYWxsVHJhbnNwb3J0O1xuXG5cdC8qKiBGb3J3YXJkZWQgTUNQIHNlcnZlciBub3RpZmljYXRpb25zIHNjb3BlZCB0byB0aGlzIEFwcCdzIHNlcnZlci4gKi9cblx0cHVibGljIHJlYWRvbmx5IG9uTm90aWZpY2F0aW9uOiBFdmVudDx7IHJlYWRvbmx5IG1ldGhvZDogc3RyaW5nOyByZWFkb25seSBwYXJhbXM/OiB1bmtub3duIH0+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3VpRGF0YTogSU1jcFRvb2xDYWxsVUlEYXRhLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl90cmFuc3BvcnQgPSB0aGlzLl9yZWdpc3Rlcihcblx0XHRcdF91aURhdGEua2luZCA9PT0gJ2FnZW50SG9zdCdcblx0XHRcdFx0PyBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBaHBNY3BBcHBDYWxsVHJhbnNwb3J0LCBfdWlEYXRhLCBfdWlEYXRhLmNoYW5uZWwpXG5cdFx0XHRcdDogaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTG9jYWxNY3BBcHBDYWxsVHJhbnNwb3J0LCBfdWlEYXRhKVxuXHRcdCk7XG5cdFx0dGhpcy5vbk5vdGlmaWNhdGlvbiA9IHRoaXMuX3RyYW5zcG9ydC5vbk5vdGlmaWNhdGlvbjtcblxuXHRcdGNvbnN0IGNvbG9yVGhlbWUgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KFxuXHRcdFx0dGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSxcblx0XHRcdCgpID0+IHtcblx0XHRcdFx0Y29uc3QgdHlwZSA9IHRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkudHlwZTtcblx0XHRcdFx0cmV0dXJuIHR5cGUgPT09IENvbG9yU2NoZW1lLkRBUksgfHwgdHlwZSA9PT0gQ29sb3JTY2hlbWUuSElHSF9DT05UUkFTVF9EQVJLID8gJ2RhcmsnIDogJ2xpZ2h0Jztcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0dGhpcy5ob3N0Q29udGV4dCA9IGRlcml2ZWQoKHJlYWRlcik6IE1jcEFwcHMuTWNwVWlIb3N0Q29udGV4dCA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0aGVtZTogY29sb3JUaGVtZS5yZWFkKHJlYWRlciksXG5cdFx0XHRcdHN0eWxlczoge1xuXHRcdFx0XHRcdHZhcmlhYmxlczoge1xuXHRcdFx0XHRcdFx0Jy0tY29sb3ItYmFja2dyb3VuZC1wcmltYXJ5JzogJ3ZhcigtLXZzY29kZS1lZGl0b3ItYmFja2dyb3VuZCknLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItYmFja2dyb3VuZC1zZWNvbmRhcnknOiAndmFyKC0tdnNjb2RlLXNpZGVCYXItYmFja2dyb3VuZCknLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItYmFja2dyb3VuZC10ZXJ0aWFyeSc6ICd2YXIoLS12c2NvZGUtYWN0aXZpdHlCYXItYmFja2dyb3VuZCknLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItYmFja2dyb3VuZC1pbnZlcnNlJzogJ3ZhcigtLXZzY29kZS1lZGl0b3ItZm9yZWdyb3VuZCknLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItYmFja2dyb3VuZC1naG9zdCc6ICd0cmFuc3BhcmVudCcsXG5cdFx0XHRcdFx0XHQnLS1jb2xvci1iYWNrZ3JvdW5kLWluZm8nOiAndmFyKC0tdnNjb2RlLWlucHV0VmFsaWRhdGlvbi1pbmZvQmFja2dyb3VuZCknLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItYmFja2dyb3VuZC1kYW5nZXInOiAndmFyKC0tdnNjb2RlLWlucHV0VmFsaWRhdGlvbi1lcnJvckJhY2tncm91bmQpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLWJhY2tncm91bmQtc3VjY2Vzcyc6ICd2YXIoLS12c2NvZGUtZGlmZkVkaXRvci1pbnNlcnRlZFRleHRCYWNrZ3JvdW5kKScsXG5cdFx0XHRcdFx0XHQnLS1jb2xvci1iYWNrZ3JvdW5kLXdhcm5pbmcnOiAndmFyKC0tdnNjb2RlLWlucHV0VmFsaWRhdGlvbi13YXJuaW5nQmFja2dyb3VuZCknLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItYmFja2dyb3VuZC1kaXNhYmxlZCc6ICd2YXIoLS12c2NvZGUtZWRpdG9yLWluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCknLFxuXG5cdFx0XHRcdFx0XHQnLS1jb2xvci10ZXh0LXByaW1hcnknOiAndmFyKC0tdnNjb2RlLWZvcmVncm91bmQpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLXRleHQtc2Vjb25kYXJ5JzogJ3ZhcigtLXZzY29kZS1kZXNjcmlwdGlvbkZvcmVncm91bmQpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLXRleHQtdGVydGlhcnknOiAndmFyKC0tdnNjb2RlLWRpc2FibGVkRm9yZWdyb3VuZCknLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItdGV4dC1pbnZlcnNlJzogJ3ZhcigtLXZzY29kZS1lZGl0b3ItYmFja2dyb3VuZCknLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItdGV4dC1pbmZvJzogJ3ZhcigtLXZzY29kZS10ZXh0TGluay1mb3JlZ3JvdW5kKScsXG5cdFx0XHRcdFx0XHQnLS1jb2xvci10ZXh0LWRhbmdlcic6ICd2YXIoLS12c2NvZGUtZXJyb3JGb3JlZ3JvdW5kKScsXG5cdFx0XHRcdFx0XHQnLS1jb2xvci10ZXh0LXN1Y2Nlc3MnOiAndmFyKC0tdnNjb2RlLXRlc3RpbmctaWNvblBhc3NlZCknLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItdGV4dC13YXJuaW5nJzogJ3ZhcigtLXZzY29kZS1lZGl0b3JXYXJuaW5nLWZvcmVncm91bmQpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLXRleHQtZGlzYWJsZWQnOiAndmFyKC0tdnNjb2RlLWRpc2FibGVkRm9yZWdyb3VuZCknLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItdGV4dC1naG9zdCc6ICd2YXIoLS12c2NvZGUtZGVzY3JpcHRpb25Gb3JlZ3JvdW5kKScsXG5cblx0XHRcdFx0XHRcdCctLWNvbG9yLWJvcmRlci1wcmltYXJ5JzogJ3ZhcigtLXZzY29kZS13aWRnZXQtYm9yZGVyKScsXG5cdFx0XHRcdFx0XHQnLS1jb2xvci1ib3JkZXItc2Vjb25kYXJ5JzogJ3ZhcigtLXZzY29kZS1lZGl0b3JXaWRnZXQtYm9yZGVyKScsXG5cdFx0XHRcdFx0XHQnLS1jb2xvci1ib3JkZXItdGVydGlhcnknOiAndmFyKC0tdnNjb2RlLXBhbmVsLWJvcmRlciknLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItYm9yZGVyLWludmVyc2UnOiAndmFyKC0tdnNjb2RlLWZvcmVncm91bmQpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLWJvcmRlci1naG9zdCc6ICd0cmFuc3BhcmVudCcsXG5cdFx0XHRcdFx0XHQnLS1jb2xvci1ib3JkZXItaW5mbyc6ICd2YXIoLS12c2NvZGUtaW5wdXRWYWxpZGF0aW9uLWluZm9Cb3JkZXIpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLWJvcmRlci1kYW5nZXInOiAndmFyKC0tdnNjb2RlLWlucHV0VmFsaWRhdGlvbi1lcnJvckJvcmRlciknLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItYm9yZGVyLXN1Y2Nlc3MnOiAndmFyKC0tdnNjb2RlLXRlc3RpbmctaWNvblBhc3NlZCknLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItYm9yZGVyLXdhcm5pbmcnOiAndmFyKC0tdnNjb2RlLWlucHV0VmFsaWRhdGlvbi13YXJuaW5nQm9yZGVyKScsXG5cdFx0XHRcdFx0XHQnLS1jb2xvci1ib3JkZXItZGlzYWJsZWQnOiAndmFyKC0tdnNjb2RlLWRpc2FibGVkRm9yZWdyb3VuZCknLFxuXG5cdFx0XHRcdFx0XHQnLS1jb2xvci1yaW5nLXByaW1hcnknOiAndmFyKC0tdnNjb2RlLWZvY3VzQm9yZGVyKScsXG5cdFx0XHRcdFx0XHQnLS1jb2xvci1yaW5nLXNlY29uZGFyeSc6ICd2YXIoLS12c2NvZGUtZm9jdXNCb3JkZXIpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLXJpbmctaW52ZXJzZSc6ICd2YXIoLS12c2NvZGUtZm9jdXNCb3JkZXIpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLXJpbmctaW5mbyc6ICd2YXIoLS12c2NvZGUtaW5wdXRWYWxpZGF0aW9uLWluZm9Cb3JkZXIpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLXJpbmctZGFuZ2VyJzogJ3ZhcigtLXZzY29kZS1pbnB1dFZhbGlkYXRpb24tZXJyb3JCb3JkZXIpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLXJpbmctc3VjY2Vzcyc6ICd2YXIoLS12c2NvZGUtdGVzdGluZy1pY29uUGFzc2VkKScsXG5cdFx0XHRcdFx0XHQnLS1jb2xvci1yaW5nLXdhcm5pbmcnOiAndmFyKC0tdnNjb2RlLWlucHV0VmFsaWRhdGlvbi13YXJuaW5nQm9yZGVyKScsXG5cblx0XHRcdFx0XHRcdCctLWZvbnQtc2Fucyc6ICd2YXIoLS12c2NvZGUtZm9udC1mYW1pbHkpJyxcblx0XHRcdFx0XHRcdCctLWZvbnQtbW9ubyc6ICd2YXIoLS12c2NvZGUtZWRpdG9yLWZvbnQtZmFtaWx5KScsXG5cblx0XHRcdFx0XHRcdCctLWZvbnQtd2VpZ2h0LW5vcm1hbCc6ICdub3JtYWwnLFxuXHRcdFx0XHRcdFx0Jy0tZm9udC13ZWlnaHQtbWVkaXVtJzogJzUwMCcsXG5cdFx0XHRcdFx0XHQnLS1mb250LXdlaWdodC1zZW1pYm9sZCc6ICc2MDAnLFxuXHRcdFx0XHRcdFx0Jy0tZm9udC13ZWlnaHQtYm9sZCc6ICdib2xkJyxcblxuXHRcdFx0XHRcdFx0Jy0tZm9udC10ZXh0LXhzLXNpemUnOiAnMTBweCcsXG5cdFx0XHRcdFx0XHQnLS1mb250LXRleHQtc20tc2l6ZSc6ICcxMXB4Jyxcblx0XHRcdFx0XHRcdCctLWZvbnQtdGV4dC1tZC1zaXplJzogJzEzcHgnLFxuXHRcdFx0XHRcdFx0Jy0tZm9udC10ZXh0LWxnLXNpemUnOiAnMTRweCcsXG5cblx0XHRcdFx0XHRcdCctLWZvbnQtaGVhZGluZy14cy1zaXplJzogJzE2cHgnLFxuXHRcdFx0XHRcdFx0Jy0tZm9udC1oZWFkaW5nLXNtLXNpemUnOiAnMThweCcsXG5cdFx0XHRcdFx0XHQnLS1mb250LWhlYWRpbmctbWQtc2l6ZSc6ICcyMHB4Jyxcblx0XHRcdFx0XHRcdCctLWZvbnQtaGVhZGluZy1sZy1zaXplJzogJzI0cHgnLFxuXHRcdFx0XHRcdFx0Jy0tZm9udC1oZWFkaW5nLXhsLXNpemUnOiAnMzJweCcsXG5cdFx0XHRcdFx0XHQnLS1mb250LWhlYWRpbmctMnhsLXNpemUnOiAnNDBweCcsXG5cdFx0XHRcdFx0XHQnLS1mb250LWhlYWRpbmctM3hsLXNpemUnOiAnNDhweCcsXG5cblx0XHRcdFx0XHRcdCctLWJvcmRlci1yYWRpdXMteHMnOiAnMnB4Jyxcblx0XHRcdFx0XHRcdCctLWJvcmRlci1yYWRpdXMtc20nOiAnM3B4Jyxcblx0XHRcdFx0XHRcdCctLWJvcmRlci1yYWRpdXMtbWQnOiAnNHB4Jyxcblx0XHRcdFx0XHRcdCctLWJvcmRlci1yYWRpdXMtbGcnOiAnNnB4Jyxcblx0XHRcdFx0XHRcdCctLWJvcmRlci1yYWRpdXMteGwnOiAnOHB4Jyxcblx0XHRcdFx0XHRcdCctLWJvcmRlci1yYWRpdXMtZnVsbCc6ICc5OTk5cHgnLFxuXG5cdFx0XHRcdFx0XHQnLS1ib3JkZXItd2lkdGgtcmVndWxhcic6ICcxcHgnLFxuXG5cdFx0XHRcdFx0XHQnLS1mb250LXRleHQteHMtbGluZS1oZWlnaHQnOiAnMS41Jyxcblx0XHRcdFx0XHRcdCctLWZvbnQtdGV4dC1zbS1saW5lLWhlaWdodCc6ICcxLjUnLFxuXHRcdFx0XHRcdFx0Jy0tZm9udC10ZXh0LW1kLWxpbmUtaGVpZ2h0JzogJzEuNScsXG5cdFx0XHRcdFx0XHQnLS1mb250LXRleHQtbGctbGluZS1oZWlnaHQnOiAnMS41JyxcblxuXHRcdFx0XHRcdFx0Jy0tZm9udC1oZWFkaW5nLXhzLWxpbmUtaGVpZ2h0JzogJzEuMjUnLFxuXHRcdFx0XHRcdFx0Jy0tZm9udC1oZWFkaW5nLXNtLWxpbmUtaGVpZ2h0JzogJzEuMjUnLFxuXHRcdFx0XHRcdFx0Jy0tZm9udC1oZWFkaW5nLW1kLWxpbmUtaGVpZ2h0JzogJzEuMjUnLFxuXHRcdFx0XHRcdFx0Jy0tZm9udC1oZWFkaW5nLWxnLWxpbmUtaGVpZ2h0JzogJzEuMjUnLFxuXHRcdFx0XHRcdFx0Jy0tZm9udC1oZWFkaW5nLXhsLWxpbmUtaGVpZ2h0JzogJzEuMjUnLFxuXHRcdFx0XHRcdFx0Jy0tZm9udC1oZWFkaW5nLTJ4bC1saW5lLWhlaWdodCc6ICcxLjI1Jyxcblx0XHRcdFx0XHRcdCctLWZvbnQtaGVhZGluZy0zeGwtbGluZS1oZWlnaHQnOiAnMS4yNScsXG5cblx0XHRcdFx0XHRcdCctLXNoYWRvdy1oYWlybGluZSc6ICcwIDAgMCAxcHggdmFyKC0tdnNjb2RlLXdpZGdldC1zaGFkb3cpJyxcblx0XHRcdFx0XHRcdCctLXNoYWRvdy1zbSc6ICcwIDFweCAycHggMCB2YXIoLS12c2NvZGUtd2lkZ2V0LXNoYWRvdyknLFxuXHRcdFx0XHRcdFx0Jy0tc2hhZG93LW1kJzogJzAgNHB4IDZweCAtMXB4IHZhcigtLXZzY29kZS13aWRnZXQtc2hhZG93KScsXG5cdFx0XHRcdFx0XHQnLS1zaGFkb3ctbGcnOiAnMCAxMHB4IDE1cHggLTNweCB2YXIoLS12c2NvZGUtd2lkZ2V0LXNoYWRvdyknLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZGlzcGxheU1vZGU6ICdpbmxpbmUnLFxuXHRcdFx0XHRhdmFpbGFibGVEaXNwbGF5TW9kZXM6IFsnaW5saW5lJ10sXG5cdFx0XHRcdGxvY2FsZTogbG9jYWxlLFxuXHRcdFx0XHRwbGF0Zm9ybTogaXNXZWIgPyAnd2ViJyA6IGlzTW9iaWxlID8gJ21vYmlsZScgOiAnZGVza3RvcCcsXG5cdFx0XHRcdGRldmljZUNhcGFiaWxpdGllczoge1xuXHRcdFx0XHRcdHRvdWNoOiBHZXN0dXJlLmlzVG91Y2hEZXZpY2UoKSxcblx0XHRcdFx0XHRob3ZlcjogR2VzdHVyZS5pc0hvdmVyRGV2aWNlKCksXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIHVuZGVybHlpbmcgVUkgZGF0YS5cblx0ICovXG5cdHB1YmxpYyBnZXQgdWlEYXRhKCk6IElNY3BUb29sQ2FsbFVJRGF0YSB7XG5cdFx0cmV0dXJuIHRoaXMuX3VpRGF0YTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMb2dzIGEgbWVzc2FnZSB0byB0aGUgTUNQIHNlcnZlcidzIGxvZ2dlci5cblx0ICovXG5cdHB1YmxpYyBsb2cobG9nOiBNQ1AuTG9nZ2luZ01lc3NhZ2VOb3RpZmljYXRpb25QYXJhbXMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdHJhbnNwb3J0LmxvZyhsb2cpO1xuXHR9XG5cblx0LyoqXG5cdCAqIExvYWRzIHRoZSBVSSByZXNvdXJjZSBmcm9tIHRoZSBNQ1Agc2VydmVyLlxuXHQgKiBAcGFyYW0gdG9rZW4gQ2FuY2VsbGF0aW9uIHRva2VuXG5cdCAqIEByZXR1cm5zIFRoZSBIVE1MIGNvbnRlbnQgYW5kIENTUCBjb25maWd1cmF0aW9uXG5cdCAqL1xuXHRwdWJsaWMgbG9hZFJlc291cmNlKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SU1jcEFwcFJlc291cmNlQ29udGVudD4ge1xuXHRcdHJldHVybiB0aGlzLl90cmFuc3BvcnQubG9hZFJlc291cmNlKHRva2VuKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYWxscyBhIHRvb2wgb24gdGhlIE1DUCBzZXJ2ZXIuXG5cdCAqIEBwYXJhbSBuYW1lIFRvb2wgbmFtZVxuXHQgKiBAcGFyYW0gcGFyYW1zIFRvb2wgcGFyYW1ldGVyc1xuXHQgKiBAcGFyYW0gdG9rZW4gQ2FuY2VsbGF0aW9uIHRva2VuXG5cdCAqIEByZXR1cm5zIFRoZSB0b29sIGNhbGwgcmVzdWx0XG5cdCAqL1xuXHRwdWJsaWMgY2FsbFRvb2wobmFtZTogc3RyaW5nLCBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5DYWxsVG9vbFJlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLl90cmFuc3BvcnQuY2FsbFRvb2wobmFtZSwgcGFyYW1zLCB0b2tlbik7XG5cdH1cblxuXHQvKipcblx0ICogUmVhZHMgYSByZXNvdXJjZSBmcm9tIHRoZSBNQ1Agc2VydmVyLlxuXHQgKiBAcGFyYW0gdXJpIFJlc291cmNlIFVSSVxuXHQgKiBAcGFyYW0gdG9rZW4gQ2FuY2VsbGF0aW9uIHRva2VuXG5cdCAqIEByZXR1cm5zIFRoZSByZXNvdXJjZSBjb250ZW50XG5cdCAqL1xuXHRwdWJsaWMgcmVhZFJlc291cmNlKHVyaTogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5SZWFkUmVzb3VyY2VSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdHJhbnNwb3J0LnJlYWRSZXNvdXJjZSh1cmksIHRva2VuKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJc3N1ZXMgYSBgc2FtcGxpbmcvY3JlYXRlTWVzc2FnZWAgcmVxdWVzdCBhZ2FpbnN0IHRoZSBNQ1Agc2VydmVyJ3Ncblx0ICogaG9zdC1zaWRlIHNhbXBsaW5nIGltcGxlbWVudGF0aW9uLiBPbmx5IHN1cHBvcnRlZCB3aGVuIHRoZSBBcHBcblx0ICogc2VydmVyIHJ1bnMgaW5zaWRlIGFuIGFnZW50IGhvc3QgdGhhdCBoYXMgb3B0ZWQgaW50byBzYW1wbGluZy5cblx0ICovXG5cdHB1YmxpYyBzYW1wbGluZyhwYXJhbXM6IE1DUC5DcmVhdGVNZXNzYWdlUmVxdWVzdFsncGFyYW1zJ10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TUNQLkNyZWF0ZU1lc3NhZ2VSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdHJhbnNwb3J0LnNhbXBsaW5nKHBhcmFtcywgdG9rZW4pO1xu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QUF5QjtBQUFBLFlBQ3pCLDBCQUEwQjtBQUFBLFlBQzFCLDBCQUEwQjtBQUFBLFlBQzFCLDJCQUEyQjtBQUFBLFlBRTNCLHdCQUF3QjtBQUFBLFlBQ3hCLDBCQUEwQjtBQUFBLFlBQzFCLHdCQUF3QjtBQUFBLFlBQ3hCLHFCQUFxQjtBQUFBLFlBQ3JCLHVCQUF1QjtBQUFBLFlBQ3ZCLHdCQUF3QjtBQUFBLFlBQ3hCLHdCQUF3QjtBQUFBLFlBRXhCLGVBQWU7QUFBQSxZQUNmLGVBQWU7QUFBQSxZQUVmLHdCQUF3QjtBQUFBLFlBQ3hCLHdCQUF3QjtBQUFBLFlBQ3hCLDBCQUEwQjtBQUFBLFlBQzFCLHNCQUFzQjtBQUFBLFlBRXRCLHVCQUF1QjtBQUFBLFlBQ3ZCLHVCQUF1QjtBQUFBLFlBQ3ZCLHVCQUF1QjtBQUFBLFlBQ3ZCLHVCQUF1QjtBQUFBLFlBRXZCLDBCQUEwQjtBQUFBLFlBQzFCLDBCQUEwQjtBQUFBLFlBQzFCLDBCQUEwQjtBQUFBLFlBQzFCLDBCQUEwQjtBQUFBLFlBQzFCLDBCQUEwQjtBQUFBLFlBQzFCLDJCQUEyQjtBQUFBLFlBQzNCLDJCQUEyQjtBQUFBLFlBRTNCLHNCQUFzQjtBQUFBLFlBQ3RCLHNCQUFzQjtBQUFBLFlBQ3RCLHNCQUFzQjtBQUFBLFlBQ3RCLHNCQUFzQjtBQUFBLFlBQ3RCLHNCQUFzQjtBQUFBLFlBQ3RCLHdCQUF3QjtBQUFBLFlBRXhCLDBCQUEwQjtBQUFBLFlBRTFCLDhCQUE4QjtBQUFBLFlBQzlCLDhCQUE4QjtBQUFBLFlBQzlCLDhCQUE4QjtBQUFBLFlBQzlCLDhCQUE4QjtBQUFBLFlBRTlCLGlDQUFpQztBQUFBLFlBQ2pDLGlDQUFpQztBQUFBLFlBQ2pDLGlDQUFpQztBQUFBLFlBQ2pDLGlDQUFpQztBQUFBLFlBQ2pDLGlDQUFpQztBQUFBLFlBQ2pDLGtDQUFrQztBQUFBLFlBQ2xDLGtDQUFrQztBQUFBLFlBRWxDLHFCQUFxQjtBQUFBLFlBQ3JCLGVBQWU7QUFBQSxZQUNmLGVBQWU7QUFBQSxZQUNmLGVBQWU7QUFBQSxVQUNoQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBLGFBQWE7QUFBQSxRQUNiLHVCQUF1QixDQUFDLFFBQVE7QUFBQSxRQUNoQztBQUFBLFFBQ0EsVUFBVSxRQUFRLFFBQVEsV0FBVyxXQUFXO0FBQUEsUUFDaEQsb0JBQW9CO0FBQUEsVUFDbkIsT0FBTyxRQUFRLGNBQWM7QUFBQSxVQUM3QixPQUFPLFFBQVEsY0FBYztBQUFBLFFBQzlCO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLElBQVcsU0FBNkI7QUFDdkMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS08sSUFBSSxLQUEwRDtBQUNwRSxXQUFPLEtBQUssV0FBVyxJQUFJLEdBQUc7QUFBQSxFQUMvQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9PLGFBQWEsT0FBMkQ7QUFDOUUsV0FBTyxLQUFLLFdBQVcsYUFBYSxLQUFLO0FBQUEsRUFDMUM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBU08sU0FBUyxNQUFjLFFBQWlDLE9BQXVEO0FBQ3JILFdBQU8sS0FBSyxXQUFXLFNBQVMsTUFBTSxRQUFRLEtBQUs7QUFBQSxFQUNwRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUU8sYUFBYSxLQUFhLE9BQTJEO0FBQzNGLFdBQU8sS0FBSyxXQUFXLGFBQWEsS0FBSyxLQUFLO0FBQUEsRUFDL0M7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPTyxTQUFTLFFBQTRDLE9BQTREO0FBQ3ZILFdBQU8sS0FBSyxXQUFXLFNBQVMsUUFBUSxLQUFLO0FBQUEsRUFDOUM7QUFDRDtBQWpNYSxnQkFBTjtBQUFBLEVBY0o7QUFBQSxFQUNBO0FBQUEsR0FmVTsiLAogICJuYW1lcyI6IFtdCn0K
