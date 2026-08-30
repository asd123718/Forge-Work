import { streamToBuffer } from "../../../base/common/buffer.js";
import { getErrorMessage } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { localize } from "../../../nls.js";
import { ConfigurationScope, Extensions } from "../../configuration/common/configurationRegistry.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { Registry } from "../../registry/common/platform.js";
const IRequestService = createDecorator("requestService");
const NO_FETCH_TELEMETRY = "NO_FETCH_TELEMETRY";
class LoggableHeaders {
  constructor(original) {
    this.original = original;
  }
  toJSON() {
    if (!this.headers) {
      const headers = /* @__PURE__ */ Object.create(null);
      for (const key in this.original) {
        if (key.toLowerCase() === "authorization" || key.toLowerCase() === "proxy-authorization") {
          headers[key] = "*****";
        } else {
          headers[key] = this.original[key];
        }
      }
      this.headers = headers;
    }
    return this.headers;
  }
}
class AbstractRequestService extends Disposable {
  constructor(logService) {
    super();
    this.logService = logService;
    this.counter = 0;
    this._onDidCompleteRequest = this._register(new Emitter());
    this.onDidCompleteRequest = this._onDidCompleteRequest.event;
  }
  async logAndRequest(options, request) {
    const prefix = `#${++this.counter}: ${options.url}`;
    this.logService.trace(`${prefix} - begin`, options.type, new LoggableHeaders(options.headers ?? {}));
    const startTime = Date.now();
    try {
      const result = await request();
      this.logService.trace(`${prefix} - end`, options.type, result.res.statusCode, result.res.headers);
      this._onDidCompleteRequest.fire({
        callSite: options.callSite,
        latency: Date.now() - startTime,
        statusCode: result.res.statusCode
      });
      return result;
    } catch (error) {
      this.logService.error(`${prefix} - error`, options.type, getErrorMessage(error));
      throw error;
    }
  }
}
function isSuccess(context) {
  return context.res.statusCode && context.res.statusCode >= 200 && context.res.statusCode < 300 || context.res.statusCode === 1223;
}
function isClientError(context) {
  return !!context.res.statusCode && context.res.statusCode >= 400 && context.res.statusCode < 500;
}
function isServerError(context) {
  return !!context.res.statusCode && context.res.statusCode >= 500 && context.res.statusCode < 600;
}
function readHeader(headers, name) {
  if (!headers) {
    return void 0;
  }
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
function retryAfterFromHeaders(headers) {
  const value = readHeader(headers, "retry-after");
  if (!value) {
    return void 0;
  }
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : void 0;
}
function hasNoContent(context) {
  return context.res.statusCode === 204;
}
async function asText(context) {
  if (hasNoContent(context)) {
    return null;
  }
  const buffer = await streamToBuffer(context.stream);
  return buffer.toString();
}
async function asTextOrError(context) {
  if (!isSuccess(context)) {
    throw new Error("Server returned " + context.res.statusCode);
  }
  return asText(context);
}
async function asJson(context) {
  if (!isSuccess(context)) {
    throw new Error("Server returned " + context.res.statusCode);
  }
  if (hasNoContent(context)) {
    return null;
  }
  const buffer = await streamToBuffer(context.stream);
  const str = buffer.toString();
  try {
    return JSON.parse(str);
  } catch (err) {
    err.message += ":\n" + str;
    throw err;
  }
}
function updateProxyConfigurationsScope(useHostProxy, useHostProxyDefault) {
  registerProxyConfigurations(useHostProxy, useHostProxyDefault);
}
const USER_LOCAL_AND_REMOTE_SETTINGS = [
  "http.proxy",
  "http.proxyStrictSSL",
  "http.proxyKerberosServicePrincipal",
  "http.noProxy",
  "http.proxyAuthorization",
  "http.proxySupport",
  "http.systemCertificates",
  "http.systemCertificatesNode",
  "http.experimental.systemCertificatesV2",
  "http.fetchAdditionalSupport",
  "http.experimental.networkInterfaceCheckInterval"
];
const systemCertificatesNodeDefault = false;
let proxyConfiguration = [];
let previousUseHostProxy = void 0;
let previousUseHostProxyDefault = void 0;
function registerProxyConfigurations(useHostProxy = true, useHostProxyDefault = true) {
  if (previousUseHostProxy === useHostProxy && previousUseHostProxyDefault === useHostProxyDefault) {
    return;
  }
  previousUseHostProxy = useHostProxy;
  previousUseHostProxyDefault = useHostProxyDefault;
  const configurationRegistry = Registry.as(Extensions.Configuration);
  const oldProxyConfiguration = proxyConfiguration;
  proxyConfiguration = [
    {
      id: "http",
      order: 15,
      title: localize("httpConfigurationTitle", "HTTP"),
      type: "object",
      scope: ConfigurationScope.MACHINE,
      properties: {
        "http.useLocalProxyConfiguration": {
          type: "boolean",
          default: useHostProxyDefault,
          markdownDescription: localize("useLocalProxy", "Controls whether in the remote extension host the local proxy configuration should be used. This setting only applies as a remote setting during [remote development](https://aka.ms/vscode-remote)."),
          restricted: true
        }
      }
    },
    {
      id: "http",
      order: 15,
      title: localize("httpConfigurationTitle", "HTTP"),
      type: "object",
      scope: ConfigurationScope.APPLICATION,
      properties: {
        "http.electronFetch": {
          type: "boolean",
          default: false,
          description: localize("electronFetch", "Controls whether use of Electron's fetch implementation instead of Node.js' should be enabled. All local extensions will get Electron's fetch implementation for the global fetch API."),
          restricted: true
        }
      }
    },
    {
      id: "http",
      order: 15,
      title: localize("httpConfigurationTitle", "HTTP"),
      type: "object",
      scope: useHostProxy ? ConfigurationScope.APPLICATION : ConfigurationScope.MACHINE,
      properties: {
        "http.proxy": {
          type: "string",
          pattern: "^(https?|socks|socks4a?|socks5h?)://([^:]*(:[^@]*)?@)?([^:]+|\\[[:0-9a-fA-F]+\\])(:\\d+)?/?$|^$",
          markdownDescription: localize("proxy", "The proxy setting to use. If not set, will be inherited from the `http_proxy` and `https_proxy` environment variables. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`"),
          restricted: true
        },
        "http.proxyStrictSSL": {
          type: "boolean",
          default: true,
          markdownDescription: localize("strictSSL", "Controls whether the proxy server certificate should be verified against the list of supplied CAs. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`"),
          restricted: true
        },
        "http.proxyKerberosServicePrincipal": {
          type: "string",
          markdownDescription: localize("proxyKerberosServicePrincipal", "Overrides the principal service name for Kerberos authentication with the HTTP proxy. A default based on the proxy hostname is used when this is not set. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`"),
          restricted: true
        },
        "http.noProxy": {
          type: "array",
          items: { type: "string" },
          markdownDescription: localize("noProxy", "Specifies domain names for which proxy settings should be ignored for HTTP/HTTPS requests. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`"),
          restricted: true
        },
        "http.proxyAuthorization": {
          type: ["null", "string"],
          default: null,
          markdownDescription: localize("proxyAuthorization", "The value to send as the `Proxy-Authorization` header for every network request. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`"),
          restricted: true
        },
        "http.proxySupport": {
          type: "string",
          enum: ["off", "on", "fallback", "override"],
          enumDescriptions: [
            localize("proxySupportOff", "Disable proxy support for extensions."),
            localize("proxySupportOn", "Enable proxy support for extensions."),
            localize("proxySupportFallback", "Enable proxy support for extensions, fall back to request options, when no proxy found."),
            localize("proxySupportOverride", "Enable proxy support for extensions, override request options.")
          ],
          default: "override",
          markdownDescription: localize("proxySupport", "Use the proxy support for extensions. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`"),
          restricted: true
        },
        "http.systemCertificates": {
          type: "boolean",
          default: true,
          markdownDescription: localize("systemCertificates", "Controls whether CA certificates should be loaded from the OS. On Windows and macOS, a reload of the window is required after turning this off. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`"),
          restricted: true
        },
        "http.systemCertificatesNode": {
          type: "boolean",
          tags: ["experimental"],
          default: systemCertificatesNodeDefault,
          markdownDescription: localize("systemCertificatesNode", "Controls whether system certificates should be loaded using Node.js built-in support. Reload the window after changing this setting. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`"),
          restricted: true,
          experiment: {
            mode: "auto"
          }
        },
        "http.experimental.systemCertificatesV2": {
          type: "boolean",
          tags: ["experimental"],
          default: false,
          markdownDescription: localize("systemCertificatesV2", "Controls whether experimental loading of CA certificates from the OS should be enabled. This uses a more general approach than the default implementation. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`"),
          restricted: true
        },
        "http.fetchAdditionalSupport": {
          type: "boolean",
          default: true,
          markdownDescription: localize("fetchAdditionalSupport", "Controls whether Node.js' fetch implementation should be extended with additional support. Currently proxy support ({1}) and system certificates ({2}) are added when the corresponding settings are enabled. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`", "`#http.proxySupport#`", "`#http.systemCertificates#`"),
          restricted: true
        },
        "http.webSocketAdditionalSupport": {
          type: "boolean",
          default: true,
          markdownDescription: localize("webSocketAdditionalSupport", "Controls whether the built-in WebSocket implementation should be extended with additional support. Currently proxy support ({1}) and system certificates ({2}) are added when the corresponding settings are enabled. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`", "`#http.proxySupport#`", "`#http.systemCertificates#`"),
          restricted: true
        },
        "http.experimental.networkInterfaceCheckInterval": {
          type: "number",
          default: 300,
          minimum: -1,
          tags: ["experimental"],
          markdownDescription: localize("networkInterfaceCheckInterval", "Controls the interval in seconds for checking network interface changes to invalidate the proxy cache. Set to -1 to disable. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`"),
          restricted: true,
          experiment: {
            mode: "auto"
          }
        }
      }
    }
  ];
  configurationRegistry.updateConfigurations({ add: proxyConfiguration, remove: oldProxyConfiguration });
}
registerProxyConfigurations();
export {
  AbstractRequestService,
  IRequestService,
  NO_FETCH_TELEMETRY,
  USER_LOCAL_AND_REMOTE_SETTINGS,
  asJson,
  asText,
  asTextOrError,
  hasNoContent,
  isClientError,
  isServerError,
  isSuccess,
  readHeader,
  retryAfterFromHeaders,
  systemCertificatesNodeDefault,
  updateProxyConfigurationsScope
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccmVxdWVzdFxcY29tbW9uXFxyZXF1ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgc3RyZWFtVG9CdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZ2V0RXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJSGVhZGVycywgSVJlcXVlc3RDb250ZXh0LCBJUmVxdWVzdE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblNjb3BlLCBFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvbk5vZGUsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcblxuZXhwb3J0IGNvbnN0IElSZXF1ZXN0U2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJUmVxdWVzdFNlcnZpY2U+KCdyZXF1ZXN0U2VydmljZScpO1xuXG4vKipcbiAqIFVzZSBhcyB0aGUge0BsaW5rIElSZXF1ZXN0T3B0aW9ucy5jYWxsU2l0ZX0gdmFsdWUgdG8gcHJldmVudFxuICogcmVxdWVzdCB0ZWxlbWV0cnkgZnJvbSBiZWluZyBlbWl0dGVkLiBUaGlzIGlzIG5lZWRlZCBmb3JcbiAqIGNhbGxlcnMgc3VjaCBhcyB0aGUgdGVsZW1ldHJ5IHNlbmRlciB0byBhdm9pZCBjeWNsaWNhbCBjYWxscy5cbiAqL1xuZXhwb3J0IGNvbnN0IE5PX0ZFVENIX1RFTEVNRVRSWSA9ICdOT19GRVRDSF9URUxFTUVUUlknO1xuXG5leHBvcnQgaW50ZXJmYWNlIElSZXF1ZXN0Q29tcGxldGVFdmVudCB7XG5cdHJlYWRvbmx5IGNhbGxTaXRlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhdGVuY3k6IG51bWJlcjtcblx0cmVhZG9ubHkgc3RhdHVzQ29kZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhJbmZvIHtcblx0aXNQcm94eTogYm9vbGVhbjtcblx0c2NoZW1lOiBzdHJpbmc7XG5cdGhvc3Q6IHN0cmluZztcblx0cG9ydDogbnVtYmVyO1xuXHRyZWFsbTogc3RyaW5nO1xuXHRhdHRlbXB0OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ3JlZGVudGlhbHMge1xuXHR1c2VybmFtZTogc3RyaW5nO1xuXHRwYXNzd29yZDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZXF1ZXN0U2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogRmlyZXMgd2hlbiBhIHJlcXVlc3QgY29tcGxldGVzIChzdWNjZXNzZnVsbHkgb3Igd2l0aCBhbiBlcnJvciByZXNwb25zZSkuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENvbXBsZXRlUmVxdWVzdDogRXZlbnQ8SVJlcXVlc3RDb21wbGV0ZUV2ZW50PjtcblxuXHRyZXF1ZXN0KG9wdGlvbnM6IElSZXF1ZXN0T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUmVxdWVzdENvbnRleHQ+O1xuXG5cdHJlc29sdmVQcm94eSh1cmw6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0bG9va3VwQXV0aG9yaXphdGlvbihhdXRoSW5mbzogQXV0aEluZm8pOiBQcm9taXNlPENyZWRlbnRpYWxzIHwgdW5kZWZpbmVkPjtcblx0bG9va3VwS2VyYmVyb3NBdXRob3JpemF0aW9uKHVybDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRsb2FkQ2VydGlmaWNhdGVzKCk6IFByb21pc2U8c3RyaW5nW10+O1xufVxuXG5jbGFzcyBMb2dnYWJsZUhlYWRlcnMge1xuXG5cdHByaXZhdGUgaGVhZGVyczogSUhlYWRlcnMgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBvcmlnaW5hbDogSUhlYWRlcnMpIHsgfVxuXG5cdHRvSlNPTigpOiBhbnkge1xuXHRcdGlmICghdGhpcy5oZWFkZXJzKSB7XG5cdFx0XHRjb25zdCBoZWFkZXJzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRcdGZvciAoY29uc3Qga2V5IGluIHRoaXMub3JpZ2luYWwpIHtcblx0XHRcdFx0aWYgKGtleS50b0xvd2VyQ2FzZSgpID09PSAnYXV0aG9yaXphdGlvbicgfHwga2V5LnRvTG93ZXJDYXNlKCkgPT09ICdwcm94eS1hdXRob3JpemF0aW9uJykge1xuXHRcdFx0XHRcdGhlYWRlcnNba2V5XSA9ICcqKioqKic7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aGVhZGVyc1trZXldID0gdGhpcy5vcmlnaW5hbFtrZXldO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmhlYWRlcnMgPSBoZWFkZXJzO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5oZWFkZXJzO1xuXHR9XG5cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0UmVxdWVzdFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVJlcXVlc3RTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGNvdW50ZXIgPSAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ29tcGxldGVSZXF1ZXN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVJlcXVlc3RDb21wbGV0ZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDb21wbGV0ZVJlcXVlc3QgPSB0aGlzLl9vbkRpZENvbXBsZXRlUmVxdWVzdC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihwcm90ZWN0ZWQgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGxvZ0FuZFJlcXVlc3Qob3B0aW9uczogSVJlcXVlc3RPcHRpb25zLCByZXF1ZXN0OiAoKSA9PiBQcm9taXNlPElSZXF1ZXN0Q29udGV4dD4pOiBQcm9taXNlPElSZXF1ZXN0Q29udGV4dD4ge1xuXHRcdGNvbnN0IHByZWZpeCA9IGAjJHsrK3RoaXMuY291bnRlcn06ICR7b3B0aW9ucy51cmx9YDtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7cHJlZml4fSAtIGJlZ2luYCwgb3B0aW9ucy50eXBlLCBuZXcgTG9nZ2FibGVIZWFkZXJzKG9wdGlvbnMuaGVhZGVycyA/PyB7fSkpO1xuXHRcdGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlcXVlc3QoKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHtwcmVmaXh9IC0gZW5kYCwgb3B0aW9ucy50eXBlLCByZXN1bHQucmVzLnN0YXR1c0NvZGUsIHJlc3VsdC5yZXMuaGVhZGVycyk7XG5cdFx0XHR0aGlzLl9vbkRpZENvbXBsZXRlUmVxdWVzdC5maXJlKHtcblx0XHRcdFx0Y2FsbFNpdGU6IG9wdGlvbnMuY2FsbFNpdGUsXG5cdFx0XHRcdGxhdGVuY3k6IERhdGUubm93KCkgLSBzdGFydFRpbWUsXG5cdFx0XHRcdHN0YXR1c0NvZGU6IHJlc3VsdC5yZXMuc3RhdHVzQ29kZSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGAke3ByZWZpeH0gLSBlcnJvcmAsIG9wdGlvbnMudHlwZSwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHRhYnN0cmFjdCByZXF1ZXN0KG9wdGlvbnM6IElSZXF1ZXN0T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUmVxdWVzdENvbnRleHQ+O1xuXHRhYnN0cmFjdCByZXNvbHZlUHJveHkodXJsOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdGFic3RyYWN0IGxvb2t1cEF1dGhvcml6YXRpb24oYXV0aEluZm86IEF1dGhJbmZvKTogUHJvbWlzZTxDcmVkZW50aWFscyB8IHVuZGVmaW5lZD47XG5cdGFic3RyYWN0IGxvb2t1cEtlcmJlcm9zQXV0aG9yaXphdGlvbih1cmw6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0YWJzdHJhY3QgbG9hZENlcnRpZmljYXRlcygpOiBQcm9taXNlPHN0cmluZ1tdPjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3VjY2Vzcyhjb250ZXh0OiBJUmVxdWVzdENvbnRleHQpOiBib29sZWFuIHtcblx0cmV0dXJuIChjb250ZXh0LnJlcy5zdGF0dXNDb2RlICYmIGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPj0gMjAwICYmIGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPCAzMDApIHx8IGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPT09IDEyMjM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0NsaWVudEVycm9yKGNvbnRleHQ6IElSZXF1ZXN0Q29udGV4dCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gISFjb250ZXh0LnJlcy5zdGF0dXNDb2RlICYmIGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPj0gNDAwICYmIGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPCA1MDA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1NlcnZlckVycm9yKGNvbnRleHQ6IElSZXF1ZXN0Q29udGV4dCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gISFjb250ZXh0LnJlcy5zdGF0dXNDb2RlICYmIGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPj0gNTAwICYmIGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPCA2MDA7XG59XG5cbi8qKlxuICogUmVhZHMgYSBoZWFkZXIgdmFsdWUgZnJvbSBhbiB7QGxpbmsgSUhlYWRlcnN9IG1hcCwgdG9sZXJhdGluZyBhcnJheS1zaGFwZWRcbiAqIHZhbHVlcyBhbmQgY2FzZS1pbnNlbnNpdGl2ZSBsb29rdXBzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhZEhlYWRlcihoZWFkZXJzOiBJSGVhZGVycyB8IHVuZGVmaW5lZCwgbmFtZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFoZWFkZXJzKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB2YWx1ZSA9IGhlYWRlcnNbbmFtZV0gPz8gaGVhZGVyc1tuYW1lLnRvTG93ZXJDYXNlKCldO1xuXHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gdmFsdWVbMF07XG5cdH1cblx0cmV0dXJuIHZhbHVlO1xufVxuXG4vKipcbiAqIFBhcnNlcyB0aGUgYFJldHJ5LUFmdGVyYCBoZWFkZXIgYXMgYSBudW1iZXIgb2Ygc2Vjb25kcy4gUmV0dXJucyBgdW5kZWZpbmVkYFxuICogaWYgYWJzZW50IG9yIG5vdCBhIGZpbml0ZSBwb3NpdGl2ZSBudW1iZXIuIFRoZSBIVFRQLWRhdGUgZm9ybSBpcyBub3QgcGFyc2VkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmV0cnlBZnRlckZyb21IZWFkZXJzKGhlYWRlcnM6IElIZWFkZXJzIHwgdW5kZWZpbmVkKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdmFsdWUgPSByZWFkSGVhZGVyKGhlYWRlcnMsICdyZXRyeS1hZnRlcicpO1xuXHRpZiAoIXZhbHVlKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBwYXJzZWQgPSBwYXJzZUludCh2YWx1ZSwgMTApO1xuXHRyZXR1cm4gTnVtYmVyLmlzRmluaXRlKHBhcnNlZCkgJiYgcGFyc2VkID4gMCA/IHBhcnNlZCA6IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc05vQ29udGVudChjb250ZXh0OiBJUmVxdWVzdENvbnRleHQpOiBib29sZWFuIHtcblx0cmV0dXJuIGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPT09IDIwNDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFzVGV4dChjb250ZXh0OiBJUmVxdWVzdENvbnRleHQpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcblx0aWYgKGhhc05vQ29udGVudChjb250ZXh0KSkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cdGNvbnN0IGJ1ZmZlciA9IGF3YWl0IHN0cmVhbVRvQnVmZmVyKGNvbnRleHQuc3RyZWFtKTtcblx0cmV0dXJuIGJ1ZmZlci50b1N0cmluZygpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYXNUZXh0T3JFcnJvcihjb250ZXh0OiBJUmVxdWVzdENvbnRleHQpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcblx0aWYgKCFpc1N1Y2Nlc3MoY29udGV4dCkpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1NlcnZlciByZXR1cm5lZCAnICsgY29udGV4dC5yZXMuc3RhdHVzQ29kZSk7XG5cdH1cblx0cmV0dXJuIGFzVGV4dChjb250ZXh0KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFzSnNvbjxUID0ge30+KGNvbnRleHQ6IElSZXF1ZXN0Q29udGV4dCk6IFByb21pc2U8VCB8IG51bGw+IHtcblx0aWYgKCFpc1N1Y2Nlc3MoY29udGV4dCkpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1NlcnZlciByZXR1cm5lZCAnICsgY29udGV4dC5yZXMuc3RhdHVzQ29kZSk7XG5cdH1cblx0aWYgKGhhc05vQ29udGVudChjb250ZXh0KSkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cdGNvbnN0IGJ1ZmZlciA9IGF3YWl0IHN0cmVhbVRvQnVmZmVyKGNvbnRleHQuc3RyZWFtKTtcblx0Y29uc3Qgc3RyID0gYnVmZmVyLnRvU3RyaW5nKCk7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIEpTT04ucGFyc2Uoc3RyKTtcblx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0ZXJyLm1lc3NhZ2UgKz0gJzpcXG4nICsgc3RyO1xuXHRcdHRocm93IGVycjtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlUHJveHlDb25maWd1cmF0aW9uc1Njb3BlKHVzZUhvc3RQcm94eTogYm9vbGVhbiwgdXNlSG9zdFByb3h5RGVmYXVsdDogYm9vbGVhbik6IHZvaWQge1xuXHRyZWdpc3RlclByb3h5Q29uZmlndXJhdGlvbnModXNlSG9zdFByb3h5LCB1c2VIb3N0UHJveHlEZWZhdWx0KTtcbn1cblxuZXhwb3J0IGNvbnN0IFVTRVJfTE9DQUxfQU5EX1JFTU9URV9TRVRUSU5HUyA9IFtcblx0J2h0dHAucHJveHknLFxuXHQnaHR0cC5wcm94eVN0cmljdFNTTCcsXG5cdCdodHRwLnByb3h5S2VyYmVyb3NTZXJ2aWNlUHJpbmNpcGFsJyxcblx0J2h0dHAubm9Qcm94eScsXG5cdCdodHRwLnByb3h5QXV0aG9yaXphdGlvbicsXG5cdCdodHRwLnByb3h5U3VwcG9ydCcsXG5cdCdodHRwLnN5c3RlbUNlcnRpZmljYXRlcycsXG5cdCdodHRwLnN5c3RlbUNlcnRpZmljYXRlc05vZGUnLFxuXHQnaHR0cC5leHBlcmltZW50YWwuc3lzdGVtQ2VydGlmaWNhdGVzVjInLFxuXHQnaHR0cC5mZXRjaEFkZGl0aW9uYWxTdXBwb3J0Jyxcblx0J2h0dHAuZXhwZXJpbWVudGFsLm5ldHdvcmtJbnRlcmZhY2VDaGVja0ludGVydmFsJyxcbl07XG5cbmV4cG9ydCBjb25zdCBzeXN0ZW1DZXJ0aWZpY2F0ZXNOb2RlRGVmYXVsdCA9IGZhbHNlO1xuXG5sZXQgcHJveHlDb25maWd1cmF0aW9uOiBJQ29uZmlndXJhdGlvbk5vZGVbXSA9IFtdO1xubGV0IHByZXZpb3VzVXNlSG9zdFByb3h5OiBib29sZWFuIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xubGV0IHByZXZpb3VzVXNlSG9zdFByb3h5RGVmYXVsdDogYm9vbGVhbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbmZ1bmN0aW9uIHJlZ2lzdGVyUHJveHlDb25maWd1cmF0aW9ucyh1c2VIb3N0UHJveHkgPSB0cnVlLCB1c2VIb3N0UHJveHlEZWZhdWx0ID0gdHJ1ZSk6IHZvaWQge1xuXHRpZiAocHJldmlvdXNVc2VIb3N0UHJveHkgPT09IHVzZUhvc3RQcm94eSAmJiBwcmV2aW91c1VzZUhvc3RQcm94eURlZmF1bHQgPT09IHVzZUhvc3RQcm94eURlZmF1bHQpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRwcmV2aW91c1VzZUhvc3RQcm94eSA9IHVzZUhvc3RQcm94eTtcblx0cHJldmlvdXNVc2VIb3N0UHJveHlEZWZhdWx0ID0gdXNlSG9zdFByb3h5RGVmYXVsdDtcblxuXHRjb25zdCBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXHRjb25zdCBvbGRQcm94eUNvbmZpZ3VyYXRpb24gPSBwcm94eUNvbmZpZ3VyYXRpb247XG5cdHByb3h5Q29uZmlndXJhdGlvbiA9IFtcblx0XHR7XG5cdFx0XHRpZDogJ2h0dHAnLFxuXHRcdFx0b3JkZXI6IDE1LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdodHRwQ29uZmlndXJhdGlvblRpdGxlJywgXCJIVFRQXCIpLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLk1BQ0hJTkUsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdCdodHRwLnVzZUxvY2FsUHJveHlDb25maWd1cmF0aW9uJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB1c2VIb3N0UHJveHlEZWZhdWx0LFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd1c2VMb2NhbFByb3h5JywgXCJDb250cm9scyB3aGV0aGVyIGluIHRoZSByZW1vdGUgZXh0ZW5zaW9uIGhvc3QgdGhlIGxvY2FsIHByb3h5IGNvbmZpZ3VyYXRpb24gc2hvdWxkIGJlIHVzZWQuIFRoaXMgc2V0dGluZyBvbmx5IGFwcGxpZXMgYXMgYSByZW1vdGUgc2V0dGluZyBkdXJpbmcgW3JlbW90ZSBkZXZlbG9wbWVudF0oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXJlbW90ZSkuXCIpLFxuXHRcdFx0XHRcdHJlc3RyaWN0ZWQ6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHR9LFxuXHRcdHtcblx0XHRcdGlkOiAnaHR0cCcsXG5cdFx0XHRvcmRlcjogMTUsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2h0dHBDb25maWd1cmF0aW9uVGl0bGUnLCBcIkhUVFBcIiksXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdCdodHRwLmVsZWN0cm9uRmV0Y2gnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZWxlY3Ryb25GZXRjaCcsIFwiQ29udHJvbHMgd2hldGhlciB1c2Ugb2YgRWxlY3Ryb24ncyBmZXRjaCBpbXBsZW1lbnRhdGlvbiBpbnN0ZWFkIG9mIE5vZGUuanMnIHNob3VsZCBiZSBlbmFibGVkLiBBbGwgbG9jYWwgZXh0ZW5zaW9ucyB3aWxsIGdldCBFbGVjdHJvbidzIGZldGNoIGltcGxlbWVudGF0aW9uIGZvciB0aGUgZ2xvYmFsIGZldGNoIEFQSS5cIiksXG5cdFx0XHRcdFx0cmVzdHJpY3RlZDogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0aWQ6ICdodHRwJyxcblx0XHRcdG9yZGVyOiAxNSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnaHR0cENvbmZpZ3VyYXRpb25UaXRsZScsIFwiSFRUUFwiKSxcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0c2NvcGU6IHVzZUhvc3RQcm94eSA/IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTiA6IENvbmZpZ3VyYXRpb25TY29wZS5NQUNISU5FLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHQnaHR0cC5wcm94eSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRwYXR0ZXJuOiAnXihodHRwcz98c29ja3N8c29ja3M0YT98c29ja3M1aD8pOi8vKFteOl0qKDpbXkBdKik/QCk/KFteOl0rfFxcXFxbWzowLTlhLWZBLUZdK1xcXFxdKSg6XFxcXGQrKT8vPyR8XiQnLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm94eScsIFwiVGhlIHByb3h5IHNldHRpbmcgdG8gdXNlLiBJZiBub3Qgc2V0LCB3aWxsIGJlIGluaGVyaXRlZCBmcm9tIHRoZSBgaHR0cF9wcm94eWAgYW5kIGBodHRwc19wcm94eWAgZW52aXJvbm1lbnQgdmFyaWFibGVzLiBXaGVuIGR1cmluZyBbcmVtb3RlIGRldmVsb3BtZW50XShodHRwczovL2FrYS5tcy92c2NvZGUtcmVtb3RlKSB0aGUgezB9IHNldHRpbmcgaXMgZGlzYWJsZWQgdGhpcyBzZXR0aW5nIGNhbiBiZSBjb25maWd1cmVkIGluIHRoZSBsb2NhbCBhbmQgdGhlIHJlbW90ZSBzZXR0aW5ncyBzZXBhcmF0ZWx5LlwiLCAnYCNodHRwLnVzZUxvY2FsUHJveHlDb25maWd1cmF0aW9uI2AnKSxcblx0XHRcdFx0XHRyZXN0cmljdGVkOiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdodHRwLnByb3h5U3RyaWN0U1NMJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdzdHJpY3RTU0wnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIHByb3h5IHNlcnZlciBjZXJ0aWZpY2F0ZSBzaG91bGQgYmUgdmVyaWZpZWQgYWdhaW5zdCB0aGUgbGlzdCBvZiBzdXBwbGllZCBDQXMuIFdoZW4gZHVyaW5nIFtyZW1vdGUgZGV2ZWxvcG1lbnRdKGh0dHBzOi8vYWthLm1zL3ZzY29kZS1yZW1vdGUpIHRoZSB7MH0gc2V0dGluZyBpcyBkaXNhYmxlZCB0aGlzIHNldHRpbmcgY2FuIGJlIGNvbmZpZ3VyZWQgaW4gdGhlIGxvY2FsIGFuZCB0aGUgcmVtb3RlIHNldHRpbmdzIHNlcGFyYXRlbHkuXCIsICdgI2h0dHAudXNlTG9jYWxQcm94eUNvbmZpZ3VyYXRpb24jYCcpLFxuXHRcdFx0XHRcdHJlc3RyaWN0ZWQ6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0J2h0dHAucHJveHlLZXJiZXJvc1NlcnZpY2VQcmluY2lwYWwnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb3h5S2VyYmVyb3NTZXJ2aWNlUHJpbmNpcGFsJywgXCJPdmVycmlkZXMgdGhlIHByaW5jaXBhbCBzZXJ2aWNlIG5hbWUgZm9yIEtlcmJlcm9zIGF1dGhlbnRpY2F0aW9uIHdpdGggdGhlIEhUVFAgcHJveHkuIEEgZGVmYXVsdCBiYXNlZCBvbiB0aGUgcHJveHkgaG9zdG5hbWUgaXMgdXNlZCB3aGVuIHRoaXMgaXMgbm90IHNldC4gV2hlbiBkdXJpbmcgW3JlbW90ZSBkZXZlbG9wbWVudF0oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXJlbW90ZSkgdGhlIHswfSBzZXR0aW5nIGlzIGRpc2FibGVkIHRoaXMgc2V0dGluZyBjYW4gYmUgY29uZmlndXJlZCBpbiB0aGUgbG9jYWwgYW5kIHRoZSByZW1vdGUgc2V0dGluZ3Mgc2VwYXJhdGVseS5cIiwgJ2AjaHR0cC51c2VMb2NhbFByb3h5Q29uZmlndXJhdGlvbiNgJyksXG5cdFx0XHRcdFx0cmVzdHJpY3RlZDogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnaHR0cC5ub1Byb3h5Jzoge1xuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbm9Qcm94eScsIFwiU3BlY2lmaWVzIGRvbWFpbiBuYW1lcyBmb3Igd2hpY2ggcHJveHkgc2V0dGluZ3Mgc2hvdWxkIGJlIGlnbm9yZWQgZm9yIEhUVFAvSFRUUFMgcmVxdWVzdHMuIFdoZW4gZHVyaW5nIFtyZW1vdGUgZGV2ZWxvcG1lbnRdKGh0dHBzOi8vYWthLm1zL3ZzY29kZS1yZW1vdGUpIHRoZSB7MH0gc2V0dGluZyBpcyBkaXNhYmxlZCB0aGlzIHNldHRpbmcgY2FuIGJlIGNvbmZpZ3VyZWQgaW4gdGhlIGxvY2FsIGFuZCB0aGUgcmVtb3RlIHNldHRpbmdzIHNlcGFyYXRlbHkuXCIsICdgI2h0dHAudXNlTG9jYWxQcm94eUNvbmZpZ3VyYXRpb24jYCcpLFxuXHRcdFx0XHRcdHJlc3RyaWN0ZWQ6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0J2h0dHAucHJveHlBdXRob3JpemF0aW9uJzoge1xuXHRcdFx0XHRcdHR5cGU6IFsnbnVsbCcsICdzdHJpbmcnXSxcblx0XHRcdFx0XHRkZWZhdWx0OiBudWxsLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm94eUF1dGhvcml6YXRpb24nLCBcIlRoZSB2YWx1ZSB0byBzZW5kIGFzIHRoZSBgUHJveHktQXV0aG9yaXphdGlvbmAgaGVhZGVyIGZvciBldmVyeSBuZXR3b3JrIHJlcXVlc3QuIFdoZW4gZHVyaW5nIFtyZW1vdGUgZGV2ZWxvcG1lbnRdKGh0dHBzOi8vYWthLm1zL3ZzY29kZS1yZW1vdGUpIHRoZSB7MH0gc2V0dGluZyBpcyBkaXNhYmxlZCB0aGlzIHNldHRpbmcgY2FuIGJlIGNvbmZpZ3VyZWQgaW4gdGhlIGxvY2FsIGFuZCB0aGUgcmVtb3RlIHNldHRpbmdzIHNlcGFyYXRlbHkuXCIsICdgI2h0dHAudXNlTG9jYWxQcm94eUNvbmZpZ3VyYXRpb24jYCcpLFxuXHRcdFx0XHRcdHJlc3RyaWN0ZWQ6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0J2h0dHAucHJveHlTdXBwb3J0Jzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsnb2ZmJywgJ29uJywgJ2ZhbGxiYWNrJywgJ292ZXJyaWRlJ10sXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3Byb3h5U3VwcG9ydE9mZicsIFwiRGlzYWJsZSBwcm94eSBzdXBwb3J0IGZvciBleHRlbnNpb25zLlwiKSxcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdwcm94eVN1cHBvcnRPbicsIFwiRW5hYmxlIHByb3h5IHN1cHBvcnQgZm9yIGV4dGVuc2lvbnMuXCIpLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3Byb3h5U3VwcG9ydEZhbGxiYWNrJywgXCJFbmFibGUgcHJveHkgc3VwcG9ydCBmb3IgZXh0ZW5zaW9ucywgZmFsbCBiYWNrIHRvIHJlcXVlc3Qgb3B0aW9ucywgd2hlbiBubyBwcm94eSBmb3VuZC5cIiksXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgncHJveHlTdXBwb3J0T3ZlcnJpZGUnLCBcIkVuYWJsZSBwcm94eSBzdXBwb3J0IGZvciBleHRlbnNpb25zLCBvdmVycmlkZSByZXF1ZXN0IG9wdGlvbnMuXCIpLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ292ZXJyaWRlJyxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJveHlTdXBwb3J0JywgXCJVc2UgdGhlIHByb3h5IHN1cHBvcnQgZm9yIGV4dGVuc2lvbnMuIFdoZW4gZHVyaW5nIFtyZW1vdGUgZGV2ZWxvcG1lbnRdKGh0dHBzOi8vYWthLm1zL3ZzY29kZS1yZW1vdGUpIHRoZSB7MH0gc2V0dGluZyBpcyBkaXNhYmxlZCB0aGlzIHNldHRpbmcgY2FuIGJlIGNvbmZpZ3VyZWQgaW4gdGhlIGxvY2FsIGFuZCB0aGUgcmVtb3RlIHNldHRpbmdzIHNlcGFyYXRlbHkuXCIsICdgI2h0dHAudXNlTG9jYWxQcm94eUNvbmZpZ3VyYXRpb24jYCcpLFxuXHRcdFx0XHRcdHJlc3RyaWN0ZWQ6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0J2h0dHAuc3lzdGVtQ2VydGlmaWNhdGVzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdzeXN0ZW1DZXJ0aWZpY2F0ZXMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgQ0EgY2VydGlmaWNhdGVzIHNob3VsZCBiZSBsb2FkZWQgZnJvbSB0aGUgT1MuIE9uIFdpbmRvd3MgYW5kIG1hY09TLCBhIHJlbG9hZCBvZiB0aGUgd2luZG93IGlzIHJlcXVpcmVkIGFmdGVyIHR1cm5pbmcgdGhpcyBvZmYuIFdoZW4gZHVyaW5nIFtyZW1vdGUgZGV2ZWxvcG1lbnRdKGh0dHBzOi8vYWthLm1zL3ZzY29kZS1yZW1vdGUpIHRoZSB7MH0gc2V0dGluZyBpcyBkaXNhYmxlZCB0aGlzIHNldHRpbmcgY2FuIGJlIGNvbmZpZ3VyZWQgaW4gdGhlIGxvY2FsIGFuZCB0aGUgcmVtb3RlIHNldHRpbmdzIHNlcGFyYXRlbHkuXCIsICdgI2h0dHAudXNlTG9jYWxQcm94eUNvbmZpZ3VyYXRpb24jYCcpLFxuXHRcdFx0XHRcdHJlc3RyaWN0ZWQ6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0J2h0dHAuc3lzdGVtQ2VydGlmaWNhdGVzTm9kZSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdFx0XHRkZWZhdWx0OiBzeXN0ZW1DZXJ0aWZpY2F0ZXNOb2RlRGVmYXVsdCxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc3lzdGVtQ2VydGlmaWNhdGVzTm9kZScsIFwiQ29udHJvbHMgd2hldGhlciBzeXN0ZW0gY2VydGlmaWNhdGVzIHNob3VsZCBiZSBsb2FkZWQgdXNpbmcgTm9kZS5qcyBidWlsdC1pbiBzdXBwb3J0LiBSZWxvYWQgdGhlIHdpbmRvdyBhZnRlciBjaGFuZ2luZyB0aGlzIHNldHRpbmcuIFdoZW4gZHVyaW5nIFtyZW1vdGUgZGV2ZWxvcG1lbnRdKGh0dHBzOi8vYWthLm1zL3ZzY29kZS1yZW1vdGUpIHRoZSB7MH0gc2V0dGluZyBpcyBkaXNhYmxlZCB0aGlzIHNldHRpbmcgY2FuIGJlIGNvbmZpZ3VyZWQgaW4gdGhlIGxvY2FsIGFuZCB0aGUgcmVtb3RlIHNldHRpbmdzIHNlcGFyYXRlbHkuXCIsICdgI2h0dHAudXNlTG9jYWxQcm94eUNvbmZpZ3VyYXRpb24jYCcpLFxuXHRcdFx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnaHR0cC5leHBlcmltZW50YWwuc3lzdGVtQ2VydGlmaWNhdGVzVjInOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3N5c3RlbUNlcnRpZmljYXRlc1YyJywgXCJDb250cm9scyB3aGV0aGVyIGV4cGVyaW1lbnRhbCBsb2FkaW5nIG9mIENBIGNlcnRpZmljYXRlcyBmcm9tIHRoZSBPUyBzaG91bGQgYmUgZW5hYmxlZC4gVGhpcyB1c2VzIGEgbW9yZSBnZW5lcmFsIGFwcHJvYWNoIHRoYW4gdGhlIGRlZmF1bHQgaW1wbGVtZW50YXRpb24uIFdoZW4gZHVyaW5nIFtyZW1vdGUgZGV2ZWxvcG1lbnRdKGh0dHBzOi8vYWthLm1zL3ZzY29kZS1yZW1vdGUpIHRoZSB7MH0gc2V0dGluZyBpcyBkaXNhYmxlZCB0aGlzIHNldHRpbmcgY2FuIGJlIGNvbmZpZ3VyZWQgaW4gdGhlIGxvY2FsIGFuZCB0aGUgcmVtb3RlIHNldHRpbmdzIHNlcGFyYXRlbHkuXCIsICdgI2h0dHAudXNlTG9jYWxQcm94eUNvbmZpZ3VyYXRpb24jYCcpLFxuXHRcdFx0XHRcdHJlc3RyaWN0ZWQ6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0J2h0dHAuZmV0Y2hBZGRpdGlvbmFsU3VwcG9ydCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmV0Y2hBZGRpdGlvbmFsU3VwcG9ydCcsIFwiQ29udHJvbHMgd2hldGhlciBOb2RlLmpzJyBmZXRjaCBpbXBsZW1lbnRhdGlvbiBzaG91bGQgYmUgZXh0ZW5kZWQgd2l0aCBhZGRpdGlvbmFsIHN1cHBvcnQuIEN1cnJlbnRseSBwcm94eSBzdXBwb3J0ICh7MX0pIGFuZCBzeXN0ZW0gY2VydGlmaWNhdGVzICh7Mn0pIGFyZSBhZGRlZCB3aGVuIHRoZSBjb3JyZXNwb25kaW5nIHNldHRpbmdzIGFyZSBlbmFibGVkLiBXaGVuIGR1cmluZyBbcmVtb3RlIGRldmVsb3BtZW50XShodHRwczovL2FrYS5tcy92c2NvZGUtcmVtb3RlKSB0aGUgezB9IHNldHRpbmcgaXMgZGlzYWJsZWQgdGhpcyBzZXR0aW5nIGNhbiBiZSBjb25maWd1cmVkIGluIHRoZSBsb2NhbCBhbmQgdGhlIHJlbW90ZSBzZXR0aW5ncyBzZXBhcmF0ZWx5LlwiLCAnYCNodHRwLnVzZUxvY2FsUHJveHlDb25maWd1cmF0aW9uI2AnLCAnYCNodHRwLnByb3h5U3VwcG9ydCNgJywgJ2AjaHR0cC5zeXN0ZW1DZXJ0aWZpY2F0ZXMjYCcpLFxuXHRcdFx0XHRcdHJlc3RyaWN0ZWQ6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0J2h0dHAud2ViU29ja2V0QWRkaXRpb25hbFN1cHBvcnQnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dlYlNvY2tldEFkZGl0aW9uYWxTdXBwb3J0JywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBidWlsdC1pbiBXZWJTb2NrZXQgaW1wbGVtZW50YXRpb24gc2hvdWxkIGJlIGV4dGVuZGVkIHdpdGggYWRkaXRpb25hbCBzdXBwb3J0LiBDdXJyZW50bHkgcHJveHkgc3VwcG9ydCAoezF9KSBhbmQgc3lzdGVtIGNlcnRpZmljYXRlcyAoezJ9KSBhcmUgYWRkZWQgd2hlbiB0aGUgY29ycmVzcG9uZGluZyBzZXR0aW5ncyBhcmUgZW5hYmxlZC4gV2hlbiBkdXJpbmcgW3JlbW90ZSBkZXZlbG9wbWVudF0oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXJlbW90ZSkgdGhlIHswfSBzZXR0aW5nIGlzIGRpc2FibGVkIHRoaXMgc2V0dGluZyBjYW4gYmUgY29uZmlndXJlZCBpbiB0aGUgbG9jYWwgYW5kIHRoZSByZW1vdGUgc2V0dGluZ3Mgc2VwYXJhdGVseS5cIiwgJ2AjaHR0cC51c2VMb2NhbFByb3h5Q29uZmlndXJhdGlvbiNgJywgJ2AjaHR0cC5wcm94eVN1cHBvcnQjYCcsICdgI2h0dHAuc3lzdGVtQ2VydGlmaWNhdGVzI2AnKSxcblx0XHRcdFx0XHRyZXN0cmljdGVkOiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdodHRwLmV4cGVyaW1lbnRhbC5uZXR3b3JrSW50ZXJmYWNlQ2hlY2tJbnRlcnZhbCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRkZWZhdWx0OiAzMDAsXG5cdFx0XHRcdFx0bWluaW11bTogLTEsXG5cdFx0XHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbmV0d29ya0ludGVyZmFjZUNoZWNrSW50ZXJ2YWwnLCBcIkNvbnRyb2xzIHRoZSBpbnRlcnZhbCBpbiBzZWNvbmRzIGZvciBjaGVja2luZyBuZXR3b3JrIGludGVyZmFjZSBjaGFuZ2VzIHRvIGludmFsaWRhdGUgdGhlIHByb3h5IGNhY2hlLiBTZXQgdG8gLTEgdG8gZGlzYWJsZS4gV2hlbiBkdXJpbmcgW3JlbW90ZSBkZXZlbG9wbWVudF0oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXJlbW90ZSkgdGhlIHswfSBzZXR0aW5nIGlzIGRpc2FibGVkIHRoaXMgc2V0dGluZyBjYW4gYmUgY29uZmlndXJlZCBpbiB0aGUgbG9jYWwgYW5kIHRoZSByZW1vdGUgc2V0dGluZ3Mgc2VwYXJhdGVseS5cIiwgJ2AjaHR0cC51c2VMb2NhbFByb3h5Q29uZmlndXJhdGlvbiNgJyksXG5cdFx0XHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdFx0XHRleHBlcmltZW50OiB7XG5cdFx0XHRcdFx0XHRtb2RlOiAnYXV0bydcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdF07XG5cdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS51cGRhdGVDb25maWd1cmF0aW9ucyh7IGFkZDogcHJveHlDb25maWd1cmF0aW9uLCByZW1vdmU6IG9sZFByb3h5Q29uZmlndXJhdGlvbiB9KTtcbn1cblxucmVnaXN0ZXJQcm94eUNvbmZpZ3VyYXRpb25zKCk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsb0JBQW9CLGtCQUE4RDtBQUMzRixTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLGdCQUFnQjtBQUVsQixNQUFNLGtCQUFrQixnQkFBaUMsZ0JBQWdCO0FBT3pFLE1BQU0scUJBQXFCO0FBc0NsQyxNQUFNLGdCQUFnQjtBQUFBLEVB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
