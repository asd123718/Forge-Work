import { URI } from "../../../base/common/uri.js";
import { LogLevel as LogServiceLevel } from "../../../platform/log/common/log.js";
import { LogLevel, createHttpPatch, createProxyAuthorizationLookup, createProxyResolver, createTlsPatch, createNetPatch, loadSystemCertificates } from "@vscode/proxy-agent";
import { systemCertificatesNodeDefault } from "../../../platform/request/common/request.js";
import { createRequire } from "node:module";
import { lookupKerberosAuthorization } from "../../../platform/request/node/requestService.js";
import * as proxyAgent from "@vscode/proxy-agent";
const require2 = createRequire(import.meta.url);
const http = require2("http");
const https = require2("https");
const tls = require2("tls");
const net = require2("net");
const systemCertificatesV2Default = false;
const useElectronFetchDefault = false;
function connectProxyResolver(extHostWorkspace, configProvider, extensionService, extHostLogService, mainThreadTelemetry, initData, disposables) {
  const isRemote = initData.remote.isRemote;
  const useHostProxyDefault = initData.environment.useHostProxy ?? !isRemote;
  const fallbackToLocalKerberos = useHostProxyDefault;
  const loadLocalCertificates = useHostProxyDefault;
  const isUseHostProxyEnabled = () => !isRemote || configProvider.getConfiguration("http").get("useLocalProxyConfiguration", useHostProxyDefault);
  const timedResolveProxy = createTimedResolveProxy(extHostWorkspace, mainThreadTelemetry);
  const params = {
    resolveProxy: timedResolveProxy,
    lookupProxyAuthorization: createProxyAuthorizationLookup({
      log: extHostLogService,
      lookupKerberosAuthorization: async (proxyURL) => {
        try {
          const spnConfig = getExtHostConfigValue(configProvider, isRemote, "http.proxyKerberosServicePrincipal");
          const response = await lookupKerberosAuthorization(proxyURL, spnConfig, extHostLogService, "ProxyResolver#lookupProxyAuthorization");
          return "Negotiate " + response;
        } catch (err) {
          extHostLogService.debug("ProxyResolver#lookupProxyAuthorization Kerberos authentication failed", err);
        }
        if (isRemote && fallbackToLocalKerberos) {
          extHostLogService.debug("ProxyResolver#lookupProxyAuthorization Kerberos authentication lookup on host", `proxyURL:${proxyURL}`);
          const auth = await extHostWorkspace.lookupKerberosAuthorization(proxyURL);
          if (auth) {
            return auth;
          }
        }
        return void 0;
      },
      lookupAuthorization: (authInfo) => extHostWorkspace.lookupAuthorization(authInfo),
      onDidRequestAuthentication: (authenticate) => sendTelemetry(mainThreadTelemetry, authenticate, isRemote)
    }),
    getProxyURL: () => getExtHostConfigValue(configProvider, isRemote, "http.proxy"),
    getProxySupport: () => getExtHostConfigValue(configProvider, isRemote, "http.proxySupport") || "off",
    getNoProxyConfig: () => getExtHostConfigValue(configProvider, isRemote, "http.noProxy") || [],
    isAdditionalFetchSupportEnabled: () => getExtHostConfigValue(configProvider, isRemote, "http.fetchAdditionalSupport", true),
    isWebSocketPatchEnabled: () => getExtHostConfigValue(configProvider, isRemote, "http.webSocketAdditionalSupport", true),
    addCertificatesV1: () => certSettingV1(configProvider, isRemote),
    addCertificatesV2: () => certSettingV2(configProvider, isRemote),
    loadSystemCertificatesFromNode: () => getExtHostConfigValue(configProvider, isRemote, "http.systemCertificatesNode", systemCertificatesNodeDefault),
    log: extHostLogService,
    getLogLevel: () => {
      const level = extHostLogService.getLevel();
      switch (level) {
        case LogServiceLevel.Trace:
          return LogLevel.Trace;
        case LogServiceLevel.Debug:
          return LogLevel.Debug;
        case LogServiceLevel.Info:
          return LogLevel.Info;
        case LogServiceLevel.Warning:
          return LogLevel.Warning;
        case LogServiceLevel.Error:
          return LogLevel.Error;
        case LogServiceLevel.Off:
          return LogLevel.Off;
        default:
          return never(level);
      }
      function never(level2) {
        extHostLogService.error("Unknown log level", level2);
        return LogLevel.Debug;
      }
    },
    proxyResolveTelemetry: () => {
    },
    isUseHostProxyEnabled,
    getNetworkInterfaceCheckInterval: () => {
      const intervalSeconds = getExtHostConfigValue(configProvider, isRemote, "http.experimental.networkInterfaceCheckInterval", 300);
      return intervalSeconds * 1e3;
    },
    loadAdditionalCertificates: async () => {
      const useNodeSystemCerts = getExtHostConfigValue(configProvider, isRemote, "http.systemCertificatesNode", systemCertificatesNodeDefault);
      const promises = [];
      if (isRemote) {
        promises.push(loadSystemCertificates({
          loadSystemCertificatesFromNode: () => useNodeSystemCerts,
          log: extHostLogService
        }));
      }
      if (loadLocalCertificates) {
        if (!isRemote && useNodeSystemCerts) {
          promises.push(loadSystemCertificates({
            loadSystemCertificatesFromNode: () => useNodeSystemCerts,
            log: extHostLogService
          }));
        } else {
          extHostLogService.trace("ProxyResolver#loadAdditionalCertificates: Loading certificates from main process");
          const certs = extHostWorkspace.loadCertificates();
          certs.then((certs2) => extHostLogService.trace("ProxyResolver#loadAdditionalCertificates: Loaded certificates from main process", certs2.length));
          promises.push(certs);
        }
      }
      const result = (await Promise.all(promises)).flat();
      mainThreadTelemetry.$publicLog2("additionalCertificates", {
        count: result.length,
        isRemote,
        loadLocalCertificates,
        useNodeSystemCerts
      });
      return result;
    },
    env: process.env
  };
  const { resolveProxyWithRequest, resolveProxyURL, resolveProxyByURL } = createProxyResolver(params);
  const target = proxyAgent.default || proxyAgent;
  target.resolveProxyURL = resolveProxyURL;
  target.resolveProxyByURL = resolveProxyByURL;
  patchGlobalFetch(params, configProvider, mainThreadTelemetry, initData, resolveProxyURL, disposables);
  patchGlobalWebSocket(params, resolveProxyURL);
  const lookup = createPatchedModules(params, resolveProxyWithRequest);
  return configureModuleLoading(extensionService, lookup);
}
const unsafeHeaders = [
  "content-length",
  "host",
  "trailer",
  "te",
  "upgrade",
  "cookie2",
  "keep-alive",
  "transfer-encoding",
  "set-cookie"
];
function patchGlobalFetch(params, configProvider, mainThreadTelemetry, initData, resolveProxyURL, disposables) {
  if (!globalThis.__vscodeOriginalFetch) {
    const originalFetch = globalThis.fetch;
    globalThis.__vscodeOriginalFetch = originalFetch;
    const createPatchedFetch = (options) => proxyAgent.createFetchPatch(params, originalFetch, resolveProxyURL, options);
    const patchedFetch = createPatchedFetch();
    globalThis.__vscodePatchedFetch = patchedFetch;
    globalThis.__vscodeCreateFetchPatch = createPatchedFetch;
    let useElectronFetch = false;
    if (!initData.remote.isRemote) {
      useElectronFetch = configProvider.getConfiguration("http").get("electronFetch", useElectronFetchDefault);
      disposables.add(configProvider.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("http.electronFetch")) {
          useElectronFetch = configProvider.getConfiguration("http").get("electronFetch", useElectronFetchDefault);
        }
      }));
    }
    globalThis.fetch = async function fetch(input, init) {
      function getRequestProperty(name) {
        return init && name in init ? init[name] : typeof input === "object" && "cache" in input ? input[name] : void 0;
      }
      const urlString = typeof input === "string" ? input : "cache" in input ? input.url : input.toString();
      const isDataUrl = urlString.startsWith("data:");
      if (isDataUrl) {
        recordFetchFeatureUse(mainThreadTelemetry, "data");
      }
      const isBlobUrl = urlString.startsWith("blob:");
      if (isBlobUrl) {
        recordFetchFeatureUse(mainThreadTelemetry, "blob");
      }
      const isManualRedirect = getRequestProperty("redirect") === "manual";
      if (isManualRedirect) {
        recordFetchFeatureUse(mainThreadTelemetry, "manualRedirect");
      }
      const integrity = getRequestProperty("integrity");
      if (integrity) {
        recordFetchFeatureUse(mainThreadTelemetry, "integrity");
      }
      if (!useElectronFetch || isDataUrl || isBlobUrl || isManualRedirect || integrity) {
        const response2 = await patchedFetch(input, init);
        monitorResponseProperties(mainThreadTelemetry, response2, urlString);
        return response2;
      }
      if (init?.headers) {
        const headers = new Headers(init.headers);
        for (const header of unsafeHeaders) {
          headers.delete(header);
        }
        init = { ...init, headers };
      }
      const electronInput = input instanceof URL ? input.toString() : input;
      const electron = require2("electron");
      const response = await electron.net.fetch(electronInput, init);
      monitorResponseProperties(mainThreadTelemetry, response, urlString);
      return response;
    };
  }
}
function patchGlobalWebSocket(params, resolveProxyURL) {
  if (!globalThis.__vscodeOriginalWebSocket) {
    const originalWebSocket = globalThis.WebSocket;
    globalThis.__vscodeOriginalWebSocket = originalWebSocket;
    globalThis.WebSocket = proxyAgent.createWebSocketPatch(params, originalWebSocket, resolveProxyURL);
  }
}
function monitorResponseProperties(mainThreadTelemetry, response, urlString) {
  const originalUrl = response.url;
  Object.defineProperty(response, "url", {
    get() {
      recordFetchFeatureUse(mainThreadTelemetry, "url");
      return originalUrl || urlString;
    }
  });
  const originalType = response.type;
  Object.defineProperty(response, "type", {
    get() {
      recordFetchFeatureUse(mainThreadTelemetry, "typeProperty");
      return originalType !== "default" ? originalType : "basic";
    }
  });
}
const fetchFeatureUse = {
  url: 0,
  typeProperty: 0,
  data: 0,
  blob: 0,
  integrity: 0,
  manualRedirect: 0
};
let timer;
const enableFeatureUseTelemetry = false;
function recordFetchFeatureUse(mainThreadTelemetry, feature) {
  if (enableFeatureUseTelemetry && !fetchFeatureUse[feature]++) {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      mainThreadTelemetry.$publicLog2("fetchFeatureUse", fetchFeatureUse);
    }, 1e4);
    timer.unref?.();
  }
}
const proxyResolveStats = {
  count: 0,
  totalDuration: 0,
  minDuration: Number.MAX_SAFE_INTEGER,
  maxDuration: 0,
  types: /* @__PURE__ */ new Set(),
  lastSentTime: 0
};
const telemetryInterval = 60 * 60 * 1e3;
function proxyResolveType(proxy) {
  const type = proxy ? String(proxy).trim().split(/\s+/, 1)[0] : "EMPTY";
  if (["DIRECT", "PROXY", "HTTPS", "SOCKS", "EMPTY"].indexOf(type) === -1) {
    return "UNKNOWN";
  }
  return type;
}
function sendProxyResolveStats(mainThreadTelemetry) {
  if (proxyResolveStats.count > 0) {
    const avgDuration = proxyResolveStats.totalDuration / proxyResolveStats.count;
    mainThreadTelemetry.$publicLog2("proxyResolveStats", {
      count: proxyResolveStats.count,
      totalDuration: proxyResolveStats.totalDuration,
      minDuration: proxyResolveStats.minDuration,
      maxDuration: proxyResolveStats.maxDuration,
      avgDuration,
      type: [...proxyResolveStats.types].sort().join(",")
    });
    proxyResolveStats.count = 0;
    proxyResolveStats.totalDuration = 0;
    proxyResolveStats.minDuration = Number.MAX_SAFE_INTEGER;
    proxyResolveStats.maxDuration = 0;
    proxyResolveStats.types.clear();
  }
  proxyResolveStats.lastSentTime = Date.now();
}
function createTimedResolveProxy(extHostWorkspace, mainThreadTelemetry) {
  return async (url) => {
    const startTime = performance.now();
    let proxy;
    try {
      proxy = await extHostWorkspace.resolveProxy(url);
      return proxy;
    } finally {
      const duration = performance.now() - startTime;
      proxyResolveStats.count++;
      proxyResolveStats.totalDuration += duration;
      proxyResolveStats.minDuration = Math.min(proxyResolveStats.minDuration, duration);
      proxyResolveStats.maxDuration = Math.max(proxyResolveStats.maxDuration, duration);
      proxyResolveStats.types.add(proxyResolveType(proxy));
      const now = Date.now();
      if (now - proxyResolveStats.lastSentTime >= telemetryInterval) {
        sendProxyResolveStats(mainThreadTelemetry);
      }
    }
  };
}
function createPatchedModules(params, resolveProxy) {
  function mergeModules(module, patch) {
    const target = module.default || module;
    target.__vscodeOriginal = Object.assign({}, target);
    return Object.assign(target, patch);
  }
  return {
    http: mergeModules(http, createHttpPatch(params, http, resolveProxy)),
    https: mergeModules(https, createHttpPatch(params, https, resolveProxy)),
    net: mergeModules(net, createNetPatch(params, net)),
    tls: mergeModules(tls, createTlsPatch(params, tls))
  };
}
function certSettingV1(configProvider, isRemote) {
  return !getExtHostConfigValue(configProvider, isRemote, "http.experimental.systemCertificatesV2", systemCertificatesV2Default) && !!getExtHostConfigValue(configProvider, isRemote, "http.systemCertificates");
}
function certSettingV2(configProvider, isRemote) {
  return !!getExtHostConfigValue(configProvider, isRemote, "http.experimental.systemCertificatesV2", systemCertificatesV2Default) && !!getExtHostConfigValue(configProvider, isRemote, "http.systemCertificates");
}
const modulesCache = /* @__PURE__ */ new Map();
function configureModuleLoading(extensionService, lookup) {
  return extensionService.getExtensionPathIndex().then((extensionPaths) => {
    const node_module = require2("module");
    const original = node_module._load;
    node_module._load = function load(request, parent, isMain) {
      if (request === "net") {
        return lookup.net;
      }
      if (request === "tls") {
        return lookup.tls;
      }
      if (request !== "http" && request !== "https" && request !== "undici") {
        return original.apply(this, arguments);
      }
      const ext = extensionPaths.findSubstr(URI.file(parent.filename));
      let cache = modulesCache.get(ext);
      if (!cache) {
        modulesCache.set(ext, cache = {});
      }
      if (!cache[request]) {
        if (request === "undici") {
          const undici = original.apply(this, arguments);
          proxyAgent.patchUndici(undici);
          cache[request] = undici;
        } else {
          const mod = lookup[request];
          cache[request] = { ...mod };
        }
      }
      return cache[request];
    };
  });
}
let telemetrySent = false;
const enableProxyAuthenticationTelemetry = false;
function sendTelemetry(mainThreadTelemetry, authenticate, isRemote) {
  if (!enableProxyAuthenticationTelemetry || telemetrySent || !authenticate.length) {
    return;
  }
  telemetrySent = true;
  mainThreadTelemetry.$publicLog2("proxyAuthenticationRequest", {
    authenticationType: authenticate.map((a) => a.split(" ")[0]).join(","),
    extensionHostType: isRemote ? "remote" : "local"
  });
}
function getExtHostConfigValue(configProvider, isRemote, key, fallback) {
  if (isRemote) {
    return configProvider.getConfiguration().get(key) ?? fallback;
  }
  const values = configProvider.getConfiguration().inspect(key);
  return values?.globalLocalValue ?? values?.defaultValue ?? fallback;
}
export {
  connectProxyResolver
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcbm9kZVxccHJveHlSZXNvbHZlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElFeHRIb3N0V29ya3NwYWNlUHJvdmlkZXIgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uSW5zcGVjdCwgRXh0SG9zdENvbmZpZ1Byb3ZpZGVyIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3RDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWRUZWxlbWV0cnlTaGFwZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25Ib3N0SW5pdERhdGEgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25Ib3N0UHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgRXh0SG9zdEV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RFeHRlbnNpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTG9nTGV2ZWwgYXMgTG9nU2VydmljZUxldmVsIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBMb2dMZXZlbCwgY3JlYXRlSHR0cFBhdGNoLCBjcmVhdGVQcm94eUF1dGhvcml6YXRpb25Mb29rdXAsIGNyZWF0ZVByb3h5UmVzb2x2ZXIsIGNyZWF0ZVRsc1BhdGNoLCBQcm94eVN1cHBvcnRTZXR0aW5nLCBQcm94eUFnZW50UGFyYW1zLCBjcmVhdGVOZXRQYXRjaCwgbG9hZFN5c3RlbUNlcnRpZmljYXRlcywgUmVzb2x2ZVByb3h5V2l0aFJlcXVlc3QgfSBmcm9tICdAdnNjb2RlL3Byb3h5LWFnZW50JztcbmltcG9ydCB7IHN5c3RlbUNlcnRpZmljYXRlc05vZGVEZWZhdWx0IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY3JlYXRlUmVxdWlyZSB9IGZyb20gJ25vZGU6bW9kdWxlJztcbmltcG9ydCB0eXBlICogYXMgdW5kaWNpVHlwZSBmcm9tICd1bmRpY2ktdHlwZXMnO1xuaW1wb3J0IHR5cGUgKiBhcyB0bHNUeXBlIGZyb20gJ3Rscyc7XG5pbXBvcnQgeyBsb29rdXBLZXJiZXJvc0F1dGhvcml6YXRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9yZXF1ZXN0L25vZGUvcmVxdWVzdFNlcnZpY2UuanMnO1xuaW1wb3J0ICogYXMgcHJveHlBZ2VudCBmcm9tICdAdnNjb2RlL3Byb3h5LWFnZW50JztcblxuY29uc3QgcmVxdWlyZSA9IGNyZWF0ZVJlcXVpcmUoaW1wb3J0Lm1ldGEudXJsKTtcbmNvbnN0IGh0dHAgPSByZXF1aXJlKCdodHRwJyk7XG5jb25zdCBodHRwcyA9IHJlcXVpcmUoJ2h0dHBzJyk7XG5jb25zdCB0bHM6IHR5cGVvZiB0bHNUeXBlID0gcmVxdWlyZSgndGxzJyk7XG5jb25zdCBuZXQgPSByZXF1aXJlKCduZXQnKTtcblxuY29uc3Qgc3lzdGVtQ2VydGlmaWNhdGVzVjJEZWZhdWx0ID0gZmFsc2U7XG5jb25zdCB1c2VFbGVjdHJvbkZldGNoRGVmYXVsdCA9IGZhbHNlO1xuXG5leHBvcnQgZnVuY3Rpb24gY29ubmVjdFByb3h5UmVzb2x2ZXIoXG5cdGV4dEhvc3RXb3Jrc3BhY2U6IElFeHRIb3N0V29ya3NwYWNlUHJvdmlkZXIsXG5cdGNvbmZpZ1Byb3ZpZGVyOiBFeHRIb3N0Q29uZmlnUHJvdmlkZXIsXG5cdGV4dGVuc2lvblNlcnZpY2U6IEV4dEhvc3RFeHRlbnNpb25TZXJ2aWNlLFxuXHRleHRIb3N0TG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdG1haW5UaHJlYWRUZWxlbWV0cnk6IE1haW5UaHJlYWRUZWxlbWV0cnlTaGFwZSxcblx0aW5pdERhdGE6IElFeHRlbnNpb25Ib3N0SW5pdERhdGEsXG5cdGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsXG4pIHtcblxuXHRjb25zdCBpc1JlbW90ZSA9IGluaXREYXRhLnJlbW90ZS5pc1JlbW90ZTtcblx0Y29uc3QgdXNlSG9zdFByb3h5RGVmYXVsdCA9IGluaXREYXRhLmVudmlyb25tZW50LnVzZUhvc3RQcm94eSA/PyAhaXNSZW1vdGU7XG5cdGNvbnN0IGZhbGxiYWNrVG9Mb2NhbEtlcmJlcm9zID0gdXNlSG9zdFByb3h5RGVmYXVsdDtcblx0Y29uc3QgbG9hZExvY2FsQ2VydGlmaWNhdGVzID0gdXNlSG9zdFByb3h5RGVmYXVsdDtcblx0Y29uc3QgaXNVc2VIb3N0UHJveHlFbmFibGVkID0gKCkgPT4gIWlzUmVtb3RlIHx8IGNvbmZpZ1Byb3ZpZGVyLmdldENvbmZpZ3VyYXRpb24oJ2h0dHAnKS5nZXQ8Ym9vbGVhbj4oJ3VzZUxvY2FsUHJveHlDb25maWd1cmF0aW9uJywgdXNlSG9zdFByb3h5RGVmYXVsdCk7XG5cdGNvbnN0IHRpbWVkUmVzb2x2ZVByb3h5ID0gY3JlYXRlVGltZWRSZXNvbHZlUHJveHkoZXh0SG9zdFdvcmtzcGFjZSwgbWFpblRocmVhZFRlbGVtZXRyeSk7XG5cdGNvbnN0IHBhcmFtczogUHJveHlBZ2VudFBhcmFtcyA9IHtcblx0XHRyZXNvbHZlUHJveHk6IHRpbWVkUmVzb2x2ZVByb3h5LFxuXHRcdGxvb2t1cFByb3h5QXV0aG9yaXphdGlvbjogY3JlYXRlUHJveHlBdXRob3JpemF0aW9uTG9va3VwKHtcblx0XHRcdGxvZzogZXh0SG9zdExvZ1NlcnZpY2UsXG5cdFx0XHRsb29rdXBLZXJiZXJvc0F1dGhvcml6YXRpb246IGFzeW5jIHByb3h5VVJMID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBzcG5Db25maWcgPSBnZXRFeHRIb3N0Q29uZmlnVmFsdWU8c3RyaW5nPihjb25maWdQcm92aWRlciwgaXNSZW1vdGUsICdodHRwLnByb3h5S2VyYmVyb3NTZXJ2aWNlUHJpbmNpcGFsJyk7XG5cdFx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBsb29rdXBLZXJiZXJvc0F1dGhvcml6YXRpb24ocHJveHlVUkwsIHNwbkNvbmZpZywgZXh0SG9zdExvZ1NlcnZpY2UsICdQcm94eVJlc29sdmVyI2xvb2t1cFByb3h5QXV0aG9yaXphdGlvbicpO1xuXHRcdFx0XHRcdHJldHVybiAnTmVnb3RpYXRlICcgKyByZXNwb25zZTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0ZXh0SG9zdExvZ1NlcnZpY2UuZGVidWcoJ1Byb3h5UmVzb2x2ZXIjbG9va3VwUHJveHlBdXRob3JpemF0aW9uIEtlcmJlcm9zIGF1dGhlbnRpY2F0aW9uIGZhaWxlZCcsIGVycik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaXNSZW1vdGUgJiYgZmFsbGJhY2tUb0xvY2FsS2VyYmVyb3MpIHtcblx0XHRcdFx0XHRleHRIb3N0TG9nU2VydmljZS5kZWJ1ZygnUHJveHlSZXNvbHZlciNsb29rdXBQcm94eUF1dGhvcml6YXRpb24gS2VyYmVyb3MgYXV0aGVudGljYXRpb24gbG9va3VwIG9uIGhvc3QnLCBgcHJveHlVUkw6JHtwcm94eVVSTH1gKTtcblx0XHRcdFx0XHRjb25zdCBhdXRoID0gYXdhaXQgZXh0SG9zdFdvcmtzcGFjZS5sb29rdXBLZXJiZXJvc0F1dGhvcml6YXRpb24ocHJveHlVUkwpO1xuXHRcdFx0XHRcdGlmIChhdXRoKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYXV0aDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRsb29rdXBBdXRob3JpemF0aW9uOiBhdXRoSW5mbyA9PiBleHRIb3N0V29ya3NwYWNlLmxvb2t1cEF1dGhvcml6YXRpb24oYXV0aEluZm8pLFxuXHRcdFx0b25EaWRSZXF1ZXN0QXV0aGVudGljYXRpb246IGF1dGhlbnRpY2F0ZSA9PiBzZW5kVGVsZW1ldHJ5KG1haW5UaHJlYWRUZWxlbWV0cnksIGF1dGhlbnRpY2F0ZSwgaXNSZW1vdGUpLFxuXHRcdH0pLFxuXHRcdGdldFByb3h5VVJMOiAoKSA9PiBnZXRFeHRIb3N0Q29uZmlnVmFsdWU8c3RyaW5nPihjb25maWdQcm92aWRlciwgaXNSZW1vdGUsICdodHRwLnByb3h5JyksXG5cdFx0Z2V0UHJveHlTdXBwb3J0OiAoKSA9PiBnZXRFeHRIb3N0Q29uZmlnVmFsdWU8UHJveHlTdXBwb3J0U2V0dGluZz4oY29uZmlnUHJvdmlkZXIsIGlzUmVtb3RlLCAnaHR0cC5wcm94eVN1cHBvcnQnKSB8fCAnb2ZmJyxcblx0XHRnZXROb1Byb3h5Q29uZmlnOiAoKSA9PiBnZXRFeHRIb3N0Q29uZmlnVmFsdWU8c3RyaW5nW10+KGNvbmZpZ1Byb3ZpZGVyLCBpc1JlbW90ZSwgJ2h0dHAubm9Qcm94eScpIHx8IFtdLFxuXHRcdGlzQWRkaXRpb25hbEZldGNoU3VwcG9ydEVuYWJsZWQ6ICgpID0+IGdldEV4dEhvc3RDb25maWdWYWx1ZTxib29sZWFuPihjb25maWdQcm92aWRlciwgaXNSZW1vdGUsICdodHRwLmZldGNoQWRkaXRpb25hbFN1cHBvcnQnLCB0cnVlKSxcblx0XHRpc1dlYlNvY2tldFBhdGNoRW5hYmxlZDogKCkgPT4gZ2V0RXh0SG9zdENvbmZpZ1ZhbHVlPGJvb2xlYW4+KGNvbmZpZ1Byb3ZpZGVyLCBpc1JlbW90ZSwgJ2h0dHAud2ViU29ja2V0QWRkaXRpb25hbFN1cHBvcnQnLCB0cnVlKSxcblx0XHRhZGRDZXJ0aWZpY2F0ZXNWMTogKCkgPT4gY2VydFNldHRpbmdWMShjb25maWdQcm92aWRlciwgaXNSZW1vdGUpLFxuXHRcdGFkZENlcnRpZmljYXRlc1YyOiAoKSA9PiBjZXJ0U2V0dGluZ1YyKGNvbmZpZ1Byb3ZpZGVyLCBpc1JlbW90ZSksXG5cdFx0bG9hZFN5c3RlbUNlcnRpZmljYXRlc0Zyb21Ob2RlOiAoKSA9PiBnZXRFeHRIb3N0Q29uZmlnVmFsdWU8Ym9vbGVhbj4oY29uZmlnUHJvdmlkZXIsIGlzUmVtb3RlLCAnaHR0cC5zeXN0ZW1DZXJ0aWZpY2F0ZXNOb2RlJywgc3lzdGVtQ2VydGlmaWNhdGVzTm9kZURlZmF1bHQpLFxuXHRcdGxvZzogZXh0SG9zdExvZ1NlcnZpY2UsXG5cdFx0Z2V0TG9nTGV2ZWw6ICgpID0+IHtcblx0XHRcdGNvbnN0IGxldmVsID0gZXh0SG9zdExvZ1NlcnZpY2UuZ2V0TGV2ZWwoKTtcblx0XHRcdHN3aXRjaCAobGV2ZWwpIHtcblx0XHRcdFx0Y2FzZSBMb2dTZXJ2aWNlTGV2ZWwuVHJhY2U6IHJldHVybiBMb2dMZXZlbC5UcmFjZTtcblx0XHRcdFx0Y2FzZSBMb2dTZXJ2aWNlTGV2ZWwuRGVidWc6IHJldHVybiBMb2dMZXZlbC5EZWJ1Zztcblx0XHRcdFx0Y2FzZSBMb2dTZXJ2aWNlTGV2ZWwuSW5mbzogcmV0dXJuIExvZ0xldmVsLkluZm87XG5cdFx0XHRcdGNhc2UgTG9nU2VydmljZUxldmVsLldhcm5pbmc6IHJldHVybiBMb2dMZXZlbC5XYXJuaW5nO1xuXHRcdFx0XHRjYXNlIExvZ1NlcnZpY2VMZXZlbC5FcnJvcjogcmV0dXJuIExvZ0xldmVsLkVycm9yO1xuXHRcdFx0XHRjYXNlIExvZ1NlcnZpY2VMZXZlbC5PZmY6IHJldHVybiBMb2dMZXZlbC5PZmY7XG5cdFx0XHRcdGRlZmF1bHQ6IHJldHVybiBuZXZlcihsZXZlbCk7XG5cdFx0XHR9XG5cdFx0XHRmdW5jdGlvbiBuZXZlcihsZXZlbDogbmV2ZXIpIHtcblx0XHRcdFx0ZXh0SG9zdExvZ1NlcnZpY2UuZXJyb3IoJ1Vua25vd24gbG9nIGxldmVsJywgbGV2ZWwpO1xuXHRcdFx0XHRyZXR1cm4gTG9nTGV2ZWwuRGVidWc7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRwcm94eVJlc29sdmVUZWxlbWV0cnk6ICgpID0+IHsgfSxcblx0XHRpc1VzZUhvc3RQcm94eUVuYWJsZWQsXG5cdFx0Z2V0TmV0d29ya0ludGVyZmFjZUNoZWNrSW50ZXJ2YWw6ICgpID0+IHtcblx0XHRcdGNvbnN0IGludGVydmFsU2Vjb25kcyA9IGdldEV4dEhvc3RDb25maWdWYWx1ZTxudW1iZXI+KGNvbmZpZ1Byb3ZpZGVyLCBpc1JlbW90ZSwgJ2h0dHAuZXhwZXJpbWVudGFsLm5ldHdvcmtJbnRlcmZhY2VDaGVja0ludGVydmFsJywgMzAwKTtcblx0XHRcdHJldHVybiBpbnRlcnZhbFNlY29uZHMgKiAxMDAwO1xuXHRcdH0sXG5cdFx0bG9hZEFkZGl0aW9uYWxDZXJ0aWZpY2F0ZXM6IGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHVzZU5vZGVTeXN0ZW1DZXJ0cyA9IGdldEV4dEhvc3RDb25maWdWYWx1ZTxib29sZWFuPihjb25maWdQcm92aWRlciwgaXNSZW1vdGUsICdodHRwLnN5c3RlbUNlcnRpZmljYXRlc05vZGUnLCBzeXN0ZW1DZXJ0aWZpY2F0ZXNOb2RlRGVmYXVsdCk7XG5cdFx0XHRjb25zdCBwcm9taXNlczogUHJvbWlzZTxzdHJpbmdbXT5bXSA9IFtdO1xuXHRcdFx0aWYgKGlzUmVtb3RlKSB7XG5cdFx0XHRcdHByb21pc2VzLnB1c2gobG9hZFN5c3RlbUNlcnRpZmljYXRlcyh7XG5cdFx0XHRcdFx0bG9hZFN5c3RlbUNlcnRpZmljYXRlc0Zyb21Ob2RlOiAoKSA9PiB1c2VOb2RlU3lzdGVtQ2VydHMsXG5cdFx0XHRcdFx0bG9nOiBleHRIb3N0TG9nU2VydmljZSxcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGxvYWRMb2NhbENlcnRpZmljYXRlcykge1xuXHRcdFx0XHRpZiAoIWlzUmVtb3RlICYmIHVzZU5vZGVTeXN0ZW1DZXJ0cykge1xuXHRcdFx0XHRcdHByb21pc2VzLnB1c2gobG9hZFN5c3RlbUNlcnRpZmljYXRlcyh7XG5cdFx0XHRcdFx0XHRsb2FkU3lzdGVtQ2VydGlmaWNhdGVzRnJvbU5vZGU6ICgpID0+IHVzZU5vZGVTeXN0ZW1DZXJ0cyxcblx0XHRcdFx0XHRcdGxvZzogZXh0SG9zdExvZ1NlcnZpY2UsXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGV4dEhvc3RMb2dTZXJ2aWNlLnRyYWNlKCdQcm94eVJlc29sdmVyI2xvYWRBZGRpdGlvbmFsQ2VydGlmaWNhdGVzOiBMb2FkaW5nIGNlcnRpZmljYXRlcyBmcm9tIG1haW4gcHJvY2VzcycpO1xuXHRcdFx0XHRcdGNvbnN0IGNlcnRzID0gZXh0SG9zdFdvcmtzcGFjZS5sb2FkQ2VydGlmaWNhdGVzKCk7IC8vIExvYWRpbmcgZnJvbSBtYWluIHByb2Nlc3MgdG8gc2hhcmUgY2FjaGUuXG5cdFx0XHRcdFx0Y2VydHMudGhlbihjZXJ0cyA9PiBleHRIb3N0TG9nU2VydmljZS50cmFjZSgnUHJveHlSZXNvbHZlciNsb2FkQWRkaXRpb25hbENlcnRpZmljYXRlczogTG9hZGVkIGNlcnRpZmljYXRlcyBmcm9tIG1haW4gcHJvY2VzcycsIGNlcnRzLmxlbmd0aCkpO1xuXHRcdFx0XHRcdHByb21pc2VzLnB1c2goY2VydHMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHQgPSAoYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpKS5mbGF0KCk7XG5cdFx0XHRtYWluVGhyZWFkVGVsZW1ldHJ5LiRwdWJsaWNMb2cyPEFkZGl0aW9uYWxDZXJ0aWZpY2F0ZXNFdmVudCwgQWRkaXRpb25hbENlcnRpZmljYXRlc0NsYXNzaWZpY2F0aW9uPignYWRkaXRpb25hbENlcnRpZmljYXRlcycsIHtcblx0XHRcdFx0Y291bnQ6IHJlc3VsdC5sZW5ndGgsXG5cdFx0XHRcdGlzUmVtb3RlLFxuXHRcdFx0XHRsb2FkTG9jYWxDZXJ0aWZpY2F0ZXMsXG5cdFx0XHRcdHVzZU5vZGVTeXN0ZW1DZXJ0cyxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9LFxuXHRcdGVudjogcHJvY2Vzcy5lbnYsXG5cdH07XG5cdGNvbnN0IHsgcmVzb2x2ZVByb3h5V2l0aFJlcXVlc3QsIHJlc29sdmVQcm94eVVSTCwgcmVzb2x2ZVByb3h5QnlVUkwgfSA9IGNyZWF0ZVByb3h5UmVzb2x2ZXIocGFyYW1zKTtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdGNvbnN0IHRhcmdldCA9IChwcm94eUFnZW50IGFzIGFueSkuZGVmYXVsdCB8fCBwcm94eUFnZW50O1xuXHR0YXJnZXQucmVzb2x2ZVByb3h5VVJMID0gcmVzb2x2ZVByb3h5VVJMO1xuXHR0YXJnZXQucmVzb2x2ZVByb3h5QnlVUkwgPSByZXNvbHZlUHJveHlCeVVSTDtcblxuXHRwYXRjaEdsb2JhbEZldGNoKHBhcmFtcywgY29uZmlnUHJvdmlkZXIsIG1haW5UaHJlYWRUZWxlbWV0cnksIGluaXREYXRhLCByZXNvbHZlUHJveHlVUkwsIGRpc3Bvc2FibGVzKTtcblx0cGF0Y2hHbG9iYWxXZWJTb2NrZXQocGFyYW1zLCByZXNvbHZlUHJveHlVUkwpO1xuXG5cdGNvbnN0IGxvb2t1cCA9IGNyZWF0ZVBhdGNoZWRNb2R1bGVzKHBhcmFtcywgcmVzb2x2ZVByb3h5V2l0aFJlcXVlc3QpO1xuXHRyZXR1cm4gY29uZmlndXJlTW9kdWxlTG9hZGluZyhleHRlbnNpb25TZXJ2aWNlLCBsb29rdXApO1xufVxuXG5jb25zdCB1bnNhZmVIZWFkZXJzID0gW1xuXHQnY29udGVudC1sZW5ndGgnLFxuXHQnaG9zdCcsXG5cdCd0cmFpbGVyJyxcblx0J3RlJyxcblx0J3VwZ3JhZGUnLFxuXHQnY29va2llMicsXG5cdCdrZWVwLWFsaXZlJyxcblx0J3RyYW5zZmVyLWVuY29kaW5nJyxcblx0J3NldC1jb29raWUnLFxuXTtcblxuZnVuY3Rpb24gcGF0Y2hHbG9iYWxGZXRjaChwYXJhbXM6IFByb3h5QWdlbnRQYXJhbXMsIGNvbmZpZ1Byb3ZpZGVyOiBFeHRIb3N0Q29uZmlnUHJvdmlkZXIsIG1haW5UaHJlYWRUZWxlbWV0cnk6IE1haW5UaHJlYWRUZWxlbWV0cnlTaGFwZSwgaW5pdERhdGE6IElFeHRlbnNpb25Ib3N0SW5pdERhdGEsIHJlc29sdmVQcm94eVVSTDogKHVybDogc3RyaW5nKSA9PiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4sIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpIHtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdGlmICghKGdsb2JhbFRoaXMgYXMgYW55KS5fX3ZzY29kZU9yaWdpbmFsRmV0Y2gpIHtcblx0XHRjb25zdCBvcmlnaW5hbEZldGNoID0gZ2xvYmFsVGhpcy5mZXRjaDtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHQoZ2xvYmFsVGhpcyBhcyBhbnkpLl9fdnNjb2RlT3JpZ2luYWxGZXRjaCA9IG9yaWdpbmFsRmV0Y2g7XG5cdFx0Y29uc3QgY3JlYXRlUGF0Y2hlZEZldGNoID0gKG9wdGlvbnM/OiBwcm94eUFnZW50LkNyZWF0ZUZldGNoUGF0Y2hPcHRpb25zKSA9PiBwcm94eUFnZW50LmNyZWF0ZUZldGNoUGF0Y2gocGFyYW1zLCBvcmlnaW5hbEZldGNoLCByZXNvbHZlUHJveHlVUkwsIG9wdGlvbnMpO1xuXHRcdGNvbnN0IHBhdGNoZWRGZXRjaCA9IGNyZWF0ZVBhdGNoZWRGZXRjaCgpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdChnbG9iYWxUaGlzIGFzIGFueSkuX192c2NvZGVQYXRjaGVkRmV0Y2ggPSBwYXRjaGVkRmV0Y2g7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0KGdsb2JhbFRoaXMgYXMgYW55KS5fX3ZzY29kZUNyZWF0ZUZldGNoUGF0Y2ggPSBjcmVhdGVQYXRjaGVkRmV0Y2g7XG5cdFx0bGV0IHVzZUVsZWN0cm9uRmV0Y2ggPSBmYWxzZTtcblx0XHRpZiAoIWluaXREYXRhLnJlbW90ZS5pc1JlbW90ZSkge1xuXHRcdFx0dXNlRWxlY3Ryb25GZXRjaCA9IGNvbmZpZ1Byb3ZpZGVyLmdldENvbmZpZ3VyYXRpb24oJ2h0dHAnKS5nZXQ8Ym9vbGVhbj4oJ2VsZWN0cm9uRmV0Y2gnLCB1c2VFbGVjdHJvbkZldGNoRGVmYXVsdCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoY29uZmlnUHJvdmlkZXIub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignaHR0cC5lbGVjdHJvbkZldGNoJykpIHtcblx0XHRcdFx0XHR1c2VFbGVjdHJvbkZldGNoID0gY29uZmlnUHJvdmlkZXIuZ2V0Q29uZmlndXJhdGlvbignaHR0cCcpLmdldDxib29sZWFuPignZWxlY3Ryb25GZXRjaCcsIHVzZUVsZWN0cm9uRmV0Y2hEZWZhdWx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHQvLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvRmV0Y2hfQVBJXG5cdFx0Z2xvYmFsVGhpcy5mZXRjaCA9IGFzeW5jIGZ1bmN0aW9uIGZldGNoKGlucHV0OiBzdHJpbmcgfCBVUkwgfCBSZXF1ZXN0LCBpbml0PzogUmVxdWVzdEluaXQpIHtcblx0XHRcdGZ1bmN0aW9uIGdldFJlcXVlc3RQcm9wZXJ0eShuYW1lOiBrZXlvZiBSZXF1ZXN0ICYga2V5b2YgUmVxdWVzdEluaXQpIHtcblx0XHRcdFx0cmV0dXJuIGluaXQgJiYgbmFtZSBpbiBpbml0ID8gaW5pdFtuYW1lXSA6IHR5cGVvZiBpbnB1dCA9PT0gJ29iamVjdCcgJiYgJ2NhY2hlJyBpbiBpbnB1dCA/IGlucHV0W25hbWVdIDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Ly8gTGltaXRhdGlvbnM6IGh0dHBzOi8vZ2l0aHViLmNvbS9lbGVjdHJvbi9lbGVjdHJvbi9wdWxsLzM2NzMzI2lzc3VlY29tbWVudC0xNDA1NjE1NDk0XG5cdFx0XHQvLyBuZXQuZmV0Y2ggZmFpbHMgb24gbWFudWFsIHJlZGlyZWN0OiBodHRwczovL2dpdGh1Yi5jb20vZWxlY3Ryb24vZWxlY3Ryb24vaXNzdWVzLzQzNzE1XG5cdFx0XHRjb25zdCB1cmxTdHJpbmcgPSB0eXBlb2YgaW5wdXQgPT09ICdzdHJpbmcnID8gaW5wdXQgOiAnY2FjaGUnIGluIGlucHV0ID8gaW5wdXQudXJsIDogaW5wdXQudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGlzRGF0YVVybCA9IHVybFN0cmluZy5zdGFydHNXaXRoKCdkYXRhOicpO1xuXHRcdFx0aWYgKGlzRGF0YVVybCkge1xuXHRcdFx0XHRyZWNvcmRGZXRjaEZlYXR1cmVVc2UobWFpblRocmVhZFRlbGVtZXRyeSwgJ2RhdGEnKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlzQmxvYlVybCA9IHVybFN0cmluZy5zdGFydHNXaXRoKCdibG9iOicpO1xuXHRcdFx0aWYgKGlzQmxvYlVybCkge1xuXHRcdFx0XHRyZWNvcmRGZXRjaEZlYXR1cmVVc2UobWFpblRocmVhZFRlbGVtZXRyeSwgJ2Jsb2InKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlzTWFudWFsUmVkaXJlY3QgPSBnZXRSZXF1ZXN0UHJvcGVydHkoJ3JlZGlyZWN0JykgPT09ICdtYW51YWwnO1xuXHRcdFx0aWYgKGlzTWFudWFsUmVkaXJlY3QpIHtcblx0XHRcdFx0cmVjb3JkRmV0Y2hGZWF0dXJlVXNlKG1haW5UaHJlYWRUZWxlbWV0cnksICdtYW51YWxSZWRpcmVjdCcpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaW50ZWdyaXR5ID0gZ2V0UmVxdWVzdFByb3BlcnR5KCdpbnRlZ3JpdHknKTtcblx0XHRcdGlmIChpbnRlZ3JpdHkpIHtcblx0XHRcdFx0cmVjb3JkRmV0Y2hGZWF0dXJlVXNlKG1haW5UaHJlYWRUZWxlbWV0cnksICdpbnRlZ3JpdHknKTtcblx0XHRcdH1cblx0XHRcdGlmICghdXNlRWxlY3Ryb25GZXRjaCB8fCBpc0RhdGFVcmwgfHwgaXNCbG9iVXJsIHx8IGlzTWFudWFsUmVkaXJlY3QgfHwgaW50ZWdyaXR5KSB7XG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcGF0Y2hlZEZldGNoKGlucHV0LCBpbml0KTtcblx0XHRcdFx0bW9uaXRvclJlc3BvbnNlUHJvcGVydGllcyhtYWluVGhyZWFkVGVsZW1ldHJ5LCByZXNwb25zZSwgdXJsU3RyaW5nKTtcblx0XHRcdFx0cmV0dXJuIHJlc3BvbnNlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVW5zdXBwb3J0ZWQgaGVhZGVyczogaHR0cHM6Ly9zb3VyY2UuY2hyb21pdW0ub3JnL2Nocm9taXVtL2Nocm9taXVtL3NyYy8rL21haW46c2VydmljZXMvbmV0d29yay9wdWJsaWMvY3BwL2hlYWRlcl91dGlsLmNjO2w9MzI7ZHJjPWVlNzI5OWY4OTYxYTFiMDVhMzU1NGVmY2M0OTZiNmRhYTBkN2Y2ZTFcblx0XHRcdGlmIChpbml0Py5oZWFkZXJzKSB7XG5cdFx0XHRcdGNvbnN0IGhlYWRlcnMgPSBuZXcgSGVhZGVycyhpbml0LmhlYWRlcnMpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGhlYWRlciBvZiB1bnNhZmVIZWFkZXJzKSB7XG5cdFx0XHRcdFx0aGVhZGVycy5kZWxldGUoaGVhZGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpbml0ID0geyAuLi5pbml0LCBoZWFkZXJzIH07XG5cdFx0XHR9XG5cdFx0XHQvLyBTdXBwb3J0IGZvciBVUkw6IGh0dHBzOi8vZ2l0aHViLmNvbS9lbGVjdHJvbi9lbGVjdHJvbi9pc3N1ZXMvNDM3MTJcblx0XHRcdGNvbnN0IGVsZWN0cm9uSW5wdXQgPSBpbnB1dCBpbnN0YW5jZW9mIFVSTCA/IGlucHV0LnRvU3RyaW5nKCkgOiBpbnB1dDtcblx0XHRcdGNvbnN0IGVsZWN0cm9uID0gcmVxdWlyZSgnZWxlY3Ryb24nKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZWxlY3Ryb24ubmV0LmZldGNoKGVsZWN0cm9uSW5wdXQsIGluaXQpO1xuXHRcdFx0bW9uaXRvclJlc3BvbnNlUHJvcGVydGllcyhtYWluVGhyZWFkVGVsZW1ldHJ5LCByZXNwb25zZSwgdXJsU3RyaW5nKTtcblx0XHRcdHJldHVybiByZXNwb25zZTtcblx0XHR9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIHBhdGNoR2xvYmFsV2ViU29ja2V0KHBhcmFtczogUHJveHlBZ2VudFBhcmFtcywgcmVzb2x2ZVByb3h5VVJMOiAodXJsOiBzdHJpbmcpID0+IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPikge1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0aWYgKCEoZ2xvYmFsVGhpcyBhcyBhbnkpLl9fdnNjb2RlT3JpZ2luYWxXZWJTb2NrZXQpIHtcblx0XHRjb25zdCBvcmlnaW5hbFdlYlNvY2tldCA9IGdsb2JhbFRoaXMuV2ViU29ja2V0O1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdChnbG9iYWxUaGlzIGFzIGFueSkuX192c2NvZGVPcmlnaW5hbFdlYlNvY2tldCA9IG9yaWdpbmFsV2ViU29ja2V0O1xuXHRcdGdsb2JhbFRoaXMuV2ViU29ja2V0ID0gcHJveHlBZ2VudC5jcmVhdGVXZWJTb2NrZXRQYXRjaChwYXJhbXMsIG9yaWdpbmFsV2ViU29ja2V0LCByZXNvbHZlUHJveHlVUkwpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG1vbml0b3JSZXNwb25zZVByb3BlcnRpZXMobWFpblRocmVhZFRlbGVtZXRyeTogTWFpblRocmVhZFRlbGVtZXRyeVNoYXBlLCByZXNwb25zZTogUmVzcG9uc2UsIHVybFN0cmluZzogc3RyaW5nKSB7XG5cdGNvbnN0IG9yaWdpbmFsVXJsID0gcmVzcG9uc2UudXJsO1xuXHRPYmplY3QuZGVmaW5lUHJvcGVydHkocmVzcG9uc2UsICd1cmwnLCB7XG5cdFx0Z2V0KCkge1xuXHRcdFx0cmVjb3JkRmV0Y2hGZWF0dXJlVXNlKG1haW5UaHJlYWRUZWxlbWV0cnksICd1cmwnKTtcblx0XHRcdHJldHVybiBvcmlnaW5hbFVybCB8fCB1cmxTdHJpbmc7XG5cdFx0fVxuXHR9KTtcblx0Y29uc3Qgb3JpZ2luYWxUeXBlID0gcmVzcG9uc2UudHlwZTtcblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KHJlc3BvbnNlLCAndHlwZScsIHtcblx0XHRnZXQoKSB7XG5cdFx0XHRyZWNvcmRGZXRjaEZlYXR1cmVVc2UobWFpblRocmVhZFRlbGVtZXRyeSwgJ3R5cGVQcm9wZXJ0eScpO1xuXHRcdFx0cmV0dXJuIG9yaWdpbmFsVHlwZSAhPT0gJ2RlZmF1bHQnID8gb3JpZ2luYWxUeXBlIDogJ2Jhc2ljJztcblx0XHR9XG5cdH0pO1xufVxuXG50eXBlIEZldGNoRmVhdHVyZVVzZUNsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ2Nocm1hcnRpJztcblx0Y29tbWVudDogJ0RhdGEgYWJvdXQgZmV0Y2ggQVBJIHVzZSc7XG5cdHVybDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIHVybCBwcm9wZXJ0eSB3YXMgdXNlZC4nIH07XG5cdHR5cGVQcm9wZXJ0eTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIHR5cGUgcHJvcGVydHkgd2FzIHVzZWQuJyB9O1xuXHRkYXRhOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciBhIGRhdGEgVVJMIHdhcyB1c2VkLicgfTtcblx0YmxvYjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgYSBibG9iIFVSTCB3YXMgdXNlZC4nIH07XG5cdGludGVncml0eTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIGludGVncml0eSBwcm9wZXJ0eSB3YXMgdXNlZC4nIH07XG5cdG1hbnVhbFJlZGlyZWN0OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciBhIG1hbnVhbCByZWRpcmVjdCB3YXMgdXNlZC4nIH07XG59O1xuXG50eXBlIEZldGNoRmVhdHVyZVVzZUV2ZW50ID0ge1xuXHR1cmw6IG51bWJlcjtcblx0dHlwZVByb3BlcnR5OiBudW1iZXI7XG5cdGRhdGE6IG51bWJlcjtcblx0YmxvYjogbnVtYmVyO1xuXHRpbnRlZ3JpdHk6IG51bWJlcjtcblx0bWFudWFsUmVkaXJlY3Q6IG51bWJlcjtcbn07XG5cbmNvbnN0IGZldGNoRmVhdHVyZVVzZTogRmV0Y2hGZWF0dXJlVXNlRXZlbnQgPSB7XG5cdHVybDogMCxcblx0dHlwZVByb3BlcnR5OiAwLFxuXHRkYXRhOiAwLFxuXHRibG9iOiAwLFxuXHRpbnRlZ3JpdHk6IDAsXG5cdG1hbnVhbFJlZGlyZWN0OiAwLFxufTtcblxubGV0IHRpbWVyOiBUaW1lb3V0IHwgdW5kZWZpbmVkO1xuY29uc3QgZW5hYmxlRmVhdHVyZVVzZVRlbGVtZXRyeSA9IGZhbHNlO1xuZnVuY3Rpb24gcmVjb3JkRmV0Y2hGZWF0dXJlVXNlKG1haW5UaHJlYWRUZWxlbWV0cnk6IE1haW5UaHJlYWRUZWxlbWV0cnlTaGFwZSwgZmVhdHVyZToga2V5b2YgdHlwZW9mIGZldGNoRmVhdHVyZVVzZSkge1xuXHRpZiAoZW5hYmxlRmVhdHVyZVVzZVRlbGVtZXRyeSAmJiAhZmV0Y2hGZWF0dXJlVXNlW2ZlYXR1cmVdKyspIHtcblx0XHRpZiAodGltZXIpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aW1lcik7XG5cdFx0fVxuXHRcdHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRtYWluVGhyZWFkVGVsZW1ldHJ5LiRwdWJsaWNMb2cyPEZldGNoRmVhdHVyZVVzZUV2ZW50LCBGZXRjaEZlYXR1cmVVc2VDbGFzc2lmaWNhdGlvbj4oJ2ZldGNoRmVhdHVyZVVzZScsIGZldGNoRmVhdHVyZVVzZSk7XG5cdFx0fSwgMTAwMDApOyAvLyBjb2xsZWN0IGFkZGl0aW9uYWwgZmVhdHVyZXMgZm9yIDEwIHNlY29uZHNcblx0XHQodGltZXIgYXMgdW5rbm93biBhcyBOb2RlSlMuVGltZW91dCkudW5yZWY/LigpO1xuXHR9XG59XG5cbnR5cGUgQWRkaXRpb25hbENlcnRpZmljYXRlc0NsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ2Nocm1hcnRpJztcblx0Y29tbWVudDogJ1RyYWNrcyB0aGUgbnVtYmVyIG9mIGFkZGl0aW9uYWwgY2VydGlmaWNhdGVzIGxvYWRlZCBmb3IgVExTIGNvbm5lY3Rpb25zJztcblx0Y291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgYWRkaXRpb25hbCBjZXJ0aWZpY2F0ZXMgbG9hZGVkJyB9O1xuXHRpc1JlbW90ZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1doZXRoZXIgdGhpcyBpcyBhIHJlbW90ZSBleHRlbnNpb24gaG9zdCcgfTtcblx0bG9hZExvY2FsQ2VydGlmaWNhdGVzOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnV2hldGhlciBsb2NhbCBjZXJ0aWZpY2F0ZXMgYXJlIGxvYWRlZCcgfTtcblx0dXNlTm9kZVN5c3RlbUNlcnRzOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnV2hldGhlciBOb2RlLmpzIHN5c3RlbSBjZXJ0aWZpY2F0ZXMgYXJlIHVzZWQnIH07XG59O1xuXG50eXBlIEFkZGl0aW9uYWxDZXJ0aWZpY2F0ZXNFdmVudCA9IHtcblx0Y291bnQ6IG51bWJlcjtcblx0aXNSZW1vdGU6IGJvb2xlYW47XG5cdGxvYWRMb2NhbENlcnRpZmljYXRlczogYm9vbGVhbjtcblx0dXNlTm9kZVN5c3RlbUNlcnRzOiBib29sZWFuO1xufTtcblxudHlwZSBQcm94eVJlc29sdmVTdGF0c0NsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ2Nocm1hcnRpJztcblx0Y29tbWVudDogJ1BlcmZvcm1hbmNlIHN0YXRpc3RpY3MgZm9yIHByb3h5IHJlc29sdXRpb24nO1xuXHRjb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ051bWJlciBvZiBwcm94eSByZXNvbHV0aW9uIGNhbGxzJyB9O1xuXHR0b3RhbER1cmF0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVG90YWwgdGltZSBzcGVudCBpbiBwcm94eSByZXNvbHV0aW9uIChtcyknIH07XG5cdG1pbkR1cmF0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnTWluaW11bSByZXNvbHV0aW9uIHRpbWUgKG1zKScgfTtcblx0bWF4RHVyYXRpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdNYXhpbXVtIHJlc29sdXRpb24gdGltZSAobXMpJyB9O1xuXHRhdmdEdXJhdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ0F2ZXJhZ2UgcmVzb2x1dGlvbiB0aW1lIChtcyknIH07XG5cdHR5cGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdTb3J0ZWQsIGNvbW1hLXNlcGFyYXRlZCBsaXN0IG9mIHJlc29sdmVkIHByb3h5IHR5cGVzIHNlZW4gZHVyaW5nIHRoZSBpbnRlcnZhbCAoZS5nLiBESVJFQ1QsIFBST1hZLCBIVFRQUywgU09DS1MsIEVNUFRZLCBVTktOT1dOKScgfTtcbn07XG5cbnR5cGUgUHJveHlSZXNvbHZlU3RhdHNFdmVudCA9IHtcblx0Y291bnQ6IG51bWJlcjtcblx0dG90YWxEdXJhdGlvbjogbnVtYmVyO1xuXHRtaW5EdXJhdGlvbjogbnVtYmVyO1xuXHRtYXhEdXJhdGlvbjogbnVtYmVyO1xuXHRhdmdEdXJhdGlvbjogbnVtYmVyO1xuXHR0eXBlOiBzdHJpbmc7XG59O1xuXG5jb25zdCBwcm94eVJlc29sdmVTdGF0cyA9IHtcblx0Y291bnQ6IDAsXG5cdHRvdGFsRHVyYXRpb246IDAsXG5cdG1pbkR1cmF0aW9uOiBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUixcblx0bWF4RHVyYXRpb246IDAsXG5cdHR5cGVzOiBuZXcgU2V0PHN0cmluZz4oKSxcblx0bGFzdFNlbnRUaW1lOiAwLFxufTtcblxuY29uc3QgdGVsZW1ldHJ5SW50ZXJ2YWwgPSA2MCAqIDYwICogMTAwMDsgLy8gMSBob3VyXG5cbmZ1bmN0aW9uIHByb3h5UmVzb2x2ZVR5cGUocHJveHk6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdGNvbnN0IHR5cGUgPSBwcm94eSA/IFN0cmluZyhwcm94eSkudHJpbSgpLnNwbGl0KC9cXHMrLywgMSlbMF0gOiAnRU1QVFknO1xuXHRpZiAoWydESVJFQ1QnLCAnUFJPWFknLCAnSFRUUFMnLCAnU09DS1MnLCAnRU1QVFknXS5pbmRleE9mKHR5cGUpID09PSAtMSkge1xuXHRcdHJldHVybiAnVU5LTk9XTic7XG5cdH1cblx0cmV0dXJuIHR5cGU7XG59XG5cbmZ1bmN0aW9uIHNlbmRQcm94eVJlc29sdmVTdGF0cyhtYWluVGhyZWFkVGVsZW1ldHJ5OiBNYWluVGhyZWFkVGVsZW1ldHJ5U2hhcGUpIHtcblx0aWYgKHByb3h5UmVzb2x2ZVN0YXRzLmNvdW50ID4gMCkge1xuXHRcdGNvbnN0IGF2Z0R1cmF0aW9uID0gcHJveHlSZXNvbHZlU3RhdHMudG90YWxEdXJhdGlvbiAvIHByb3h5UmVzb2x2ZVN0YXRzLmNvdW50O1xuXHRcdG1haW5UaHJlYWRUZWxlbWV0cnkuJHB1YmxpY0xvZzI8UHJveHlSZXNvbHZlU3RhdHNFdmVudCwgUHJveHlSZXNvbHZlU3RhdHNDbGFzc2lmaWNhdGlvbj4oJ3Byb3h5UmVzb2x2ZVN0YXRzJywge1xuXHRcdFx0Y291bnQ6IHByb3h5UmVzb2x2ZVN0YXRzLmNvdW50LFxuXHRcdFx0dG90YWxEdXJhdGlvbjogcHJveHlSZXNvbHZlU3RhdHMudG90YWxEdXJhdGlvbixcblx0XHRcdG1pbkR1cmF0aW9uOiBwcm94eVJlc29sdmVTdGF0cy5taW5EdXJhdGlvbixcblx0XHRcdG1heER1cmF0aW9uOiBwcm94eVJlc29sdmVTdGF0cy5tYXhEdXJhdGlvbixcblx0XHRcdGF2Z0R1cmF0aW9uLFxuXHRcdFx0dHlwZTogWy4uLnByb3h5UmVzb2x2ZVN0YXRzLnR5cGVzXS5zb3J0KCkuam9pbignLCcpLFxuXHRcdH0pO1xuXHRcdC8vIFJlc2V0IHN0YXRzIGFmdGVyIHNlbmRpbmdcblx0XHRwcm94eVJlc29sdmVTdGF0cy5jb3VudCA9IDA7XG5cdFx0cHJveHlSZXNvbHZlU3RhdHMudG90YWxEdXJhdGlvbiA9IDA7XG5cdFx0cHJveHlSZXNvbHZlU3RhdHMubWluRHVyYXRpb24gPSBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUjtcblx0XHRwcm94eVJlc29sdmVTdGF0cy5tYXhEdXJhdGlvbiA9IDA7XG5cdFx0cHJveHlSZXNvbHZlU3RhdHMudHlwZXMuY2xlYXIoKTtcblx0fVxuXHRwcm94eVJlc29sdmVTdGF0cy5sYXN0U2VudFRpbWUgPSBEYXRlLm5vdygpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVUaW1lZFJlc29sdmVQcm94eShleHRIb3N0V29ya3NwYWNlOiBJRXh0SG9zdFdvcmtzcGFjZVByb3ZpZGVyLCBtYWluVGhyZWFkVGVsZW1ldHJ5OiBNYWluVGhyZWFkVGVsZW1ldHJ5U2hhcGUpIHtcblx0cmV0dXJuIGFzeW5jICh1cmw6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0Y29uc3Qgc3RhcnRUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XG5cdFx0bGV0IHByb3h5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdHByb3h5ID0gYXdhaXQgZXh0SG9zdFdvcmtzcGFjZS5yZXNvbHZlUHJveHkodXJsKTtcblx0XHRcdHJldHVybiBwcm94eTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y29uc3QgZHVyYXRpb24gPSBwZXJmb3JtYW5jZS5ub3coKSAtIHN0YXJ0VGltZTtcblx0XHRcdHByb3h5UmVzb2x2ZVN0YXRzLmNvdW50Kys7XG5cdFx0XHRwcm94eVJlc29sdmVTdGF0cy50b3RhbER1cmF0aW9uICs9IGR1cmF0aW9uO1xuXHRcdFx0cHJveHlSZXNvbHZlU3RhdHMubWluRHVyYXRpb24gPSBNYXRoLm1pbihwcm94eVJlc29sdmVTdGF0cy5taW5EdXJhdGlvbiwgZHVyYXRpb24pO1xuXHRcdFx0cHJveHlSZXNvbHZlU3RhdHMubWF4RHVyYXRpb24gPSBNYXRoLm1heChwcm94eVJlc29sdmVTdGF0cy5tYXhEdXJhdGlvbiwgZHVyYXRpb24pO1xuXHRcdFx0cHJveHlSZXNvbHZlU3RhdHMudHlwZXMuYWRkKHByb3h5UmVzb2x2ZVR5cGUocHJveHkpKTtcblxuXHRcdFx0Ly8gU2VuZCB0ZWxlbWV0cnkgaWYgYXQgbGVhc3QgYW4gaG91ciBoYXMgcGFzc2VkIHNpbmNlIGxhc3Qgc2VuZFxuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGlmIChub3cgLSBwcm94eVJlc29sdmVTdGF0cy5sYXN0U2VudFRpbWUgPj0gdGVsZW1ldHJ5SW50ZXJ2YWwpIHtcblx0XHRcdFx0c2VuZFByb3h5UmVzb2x2ZVN0YXRzKG1haW5UaHJlYWRUZWxlbWV0cnkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlUGF0Y2hlZE1vZHVsZXMocGFyYW1zOiBQcm94eUFnZW50UGFyYW1zLCByZXNvbHZlUHJveHk6IFJlc29sdmVQcm94eVdpdGhSZXF1ZXN0KSB7XG5cblx0ZnVuY3Rpb24gbWVyZ2VNb2R1bGVzKG1vZHVsZTogYW55LCBwYXRjaDogYW55KSB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gbW9kdWxlLmRlZmF1bHQgfHwgbW9kdWxlO1xuXHRcdHRhcmdldC5fX3ZzY29kZU9yaWdpbmFsID0gT2JqZWN0LmFzc2lnbih7fSwgdGFyZ2V0KTtcblx0XHRyZXR1cm4gT2JqZWN0LmFzc2lnbih0YXJnZXQsIHBhdGNoKTtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0aHR0cDogbWVyZ2VNb2R1bGVzKGh0dHAsIGNyZWF0ZUh0dHBQYXRjaChwYXJhbXMsIGh0dHAsIHJlc29sdmVQcm94eSkpLFxuXHRcdGh0dHBzOiBtZXJnZU1vZHVsZXMoaHR0cHMsIGNyZWF0ZUh0dHBQYXRjaChwYXJhbXMsIGh0dHBzLCByZXNvbHZlUHJveHkpKSxcblx0XHRuZXQ6IG1lcmdlTW9kdWxlcyhuZXQsIGNyZWF0ZU5ldFBhdGNoKHBhcmFtcywgbmV0KSksXG5cdFx0dGxzOiBtZXJnZU1vZHVsZXModGxzLCBjcmVhdGVUbHNQYXRjaChwYXJhbXMsIHRscykpXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNlcnRTZXR0aW5nVjEoY29uZmlnUHJvdmlkZXI6IEV4dEhvc3RDb25maWdQcm92aWRlciwgaXNSZW1vdGU6IGJvb2xlYW4pIHtcblx0cmV0dXJuICFnZXRFeHRIb3N0Q29uZmlnVmFsdWU8Ym9vbGVhbj4oY29uZmlnUHJvdmlkZXIsIGlzUmVtb3RlLCAnaHR0cC5leHBlcmltZW50YWwuc3lzdGVtQ2VydGlmaWNhdGVzVjInLCBzeXN0ZW1DZXJ0aWZpY2F0ZXNWMkRlZmF1bHQpICYmICEhZ2V0RXh0SG9zdENvbmZpZ1ZhbHVlPGJvb2xlYW4+KGNvbmZpZ1Byb3ZpZGVyLCBpc1JlbW90ZSwgJ2h0dHAuc3lzdGVtQ2VydGlmaWNhdGVzJyk7XG59XG5cbmZ1bmN0aW9uIGNlcnRTZXR0aW5nVjIoY29uZmlnUHJvdmlkZXI6IEV4dEhvc3RDb25maWdQcm92aWRlciwgaXNSZW1vdGU6IGJvb2xlYW4pIHtcblx0cmV0dXJuICEhZ2V0RXh0SG9zdENvbmZpZ1ZhbHVlPGJvb2xlYW4+KGNvbmZpZ1Byb3ZpZGVyLCBpc1JlbW90ZSwgJ2h0dHAuZXhwZXJpbWVudGFsLnN5c3RlbUNlcnRpZmljYXRlc1YyJywgc3lzdGVtQ2VydGlmaWNhdGVzVjJEZWZhdWx0KSAmJiAhIWdldEV4dEhvc3RDb25maWdWYWx1ZTxib29sZWFuPihjb25maWdQcm92aWRlciwgaXNSZW1vdGUsICdodHRwLnN5c3RlbUNlcnRpZmljYXRlcycpO1xufVxuXG5jb25zdCBtb2R1bGVzQ2FjaGUgPSBuZXcgTWFwPElFeHRlbnNpb25EZXNjcmlwdGlvbiB8IHVuZGVmaW5lZCwgeyBodHRwPzogdHlwZW9mIGh0dHA7IGh0dHBzPzogdHlwZW9mIGh0dHBzOyB1bmRpY2k/OiB0eXBlb2YgdW5kaWNpVHlwZSB9PigpO1xuZnVuY3Rpb24gY29uZmlndXJlTW9kdWxlTG9hZGluZyhleHRlbnNpb25TZXJ2aWNlOiBFeHRIb3N0RXh0ZW5zaW9uU2VydmljZSwgbG9va3VwOiBSZXR1cm5UeXBlPHR5cGVvZiBjcmVhdGVQYXRjaGVkTW9kdWxlcz4pOiBQcm9taXNlPHZvaWQ+IHtcblx0cmV0dXJuIGV4dGVuc2lvblNlcnZpY2UuZ2V0RXh0ZW5zaW9uUGF0aEluZGV4KClcblx0XHQudGhlbihleHRlbnNpb25QYXRocyA9PiB7XG5cdFx0XHRjb25zdCBub2RlX21vZHVsZSA9IHJlcXVpcmUoJ21vZHVsZScpO1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWwgPSBub2RlX21vZHVsZS5fbG9hZDtcblx0XHRcdG5vZGVfbW9kdWxlLl9sb2FkID0gZnVuY3Rpb24gbG9hZChyZXF1ZXN0OiBzdHJpbmcsIHBhcmVudDogeyBmaWxlbmFtZTogc3RyaW5nIH0sIGlzTWFpbjogYm9vbGVhbikge1xuXHRcdFx0XHRpZiAocmVxdWVzdCA9PT0gJ25ldCcpIHtcblx0XHRcdFx0XHRyZXR1cm4gbG9va3VwLm5ldDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChyZXF1ZXN0ID09PSAndGxzJykge1xuXHRcdFx0XHRcdHJldHVybiBsb29rdXAudGxzO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHJlcXVlc3QgIT09ICdodHRwJyAmJiByZXF1ZXN0ICE9PSAnaHR0cHMnICYmIHJlcXVlc3QgIT09ICd1bmRpY2knKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBleHQgPSBleHRlbnNpb25QYXRocy5maW5kU3Vic3RyKFVSSS5maWxlKHBhcmVudC5maWxlbmFtZSkpO1xuXHRcdFx0XHRsZXQgY2FjaGUgPSBtb2R1bGVzQ2FjaGUuZ2V0KGV4dCk7XG5cdFx0XHRcdGlmICghY2FjaGUpIHtcblx0XHRcdFx0XHRtb2R1bGVzQ2FjaGUuc2V0KGV4dCwgY2FjaGUgPSB7fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFjYWNoZVtyZXF1ZXN0XSkge1xuXHRcdFx0XHRcdGlmIChyZXF1ZXN0ID09PSAndW5kaWNpJykge1xuXHRcdFx0XHRcdFx0Y29uc3QgdW5kaWNpID0gb3JpZ2luYWwuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHRcdFx0XHRcdHByb3h5QWdlbnQucGF0Y2hVbmRpY2kodW5kaWNpKTtcblx0XHRcdFx0XHRcdGNhY2hlW3JlcXVlc3RdID0gdW5kaWNpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zdCBtb2QgPSBsb29rdXBbcmVxdWVzdF07XG5cdFx0XHRcdFx0XHRjYWNoZVtyZXF1ZXN0XSA9IHsgLi4ubW9kIH07IC8vIENvcHkgdG8gd29yayBhcm91bmQgIzkzMTY3LlxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gY2FjaGVbcmVxdWVzdF07XG5cdFx0XHR9O1xuXHRcdH0pO1xufVxuXG50eXBlIFByb3h5QXV0aGVudGljYXRpb25DbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdjaHJtYXJ0aSc7XG5cdGNvbW1lbnQ6ICdEYXRhIGFib3V0IHByb3h5IGF1dGhlbnRpY2F0aW9uIHJlcXVlc3RzJztcblx0YXV0aGVudGljYXRpb25UeXBlOiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1R5cGUgb2YgdGhlIGF1dGhlbnRpY2F0aW9uIHJlcXVlc3RlZCcgfTtcblx0ZXh0ZW5zaW9uSG9zdFR5cGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUeXBlIG9mIHRoZSBleHRlbnNpb24gaG9zdCcgfTtcbn07XG5cbnR5cGUgUHJveHlBdXRoZW50aWNhdGlvbkV2ZW50ID0ge1xuXHRhdXRoZW50aWNhdGlvblR5cGU6IHN0cmluZztcblx0ZXh0ZW5zaW9uSG9zdFR5cGU6IHN0cmluZztcbn07XG5cbmxldCB0ZWxlbWV0cnlTZW50ID0gZmFsc2U7XG5jb25zdCBlbmFibGVQcm94eUF1dGhlbnRpY2F0aW9uVGVsZW1ldHJ5ID0gZmFsc2U7XG5mdW5jdGlvbiBzZW5kVGVsZW1ldHJ5KG1haW5UaHJlYWRUZWxlbWV0cnk6IE1haW5UaHJlYWRUZWxlbWV0cnlTaGFwZSwgYXV0aGVudGljYXRlOiBzdHJpbmdbXSwgaXNSZW1vdGU6IGJvb2xlYW4pIHtcblx0aWYgKCFlbmFibGVQcm94eUF1dGhlbnRpY2F0aW9uVGVsZW1ldHJ5IHx8IHRlbGVtZXRyeVNlbnQgfHwgIWF1dGhlbnRpY2F0ZS5sZW5ndGgpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0dGVsZW1ldHJ5U2VudCA9IHRydWU7XG5cblx0bWFpblRocmVhZFRlbGVtZXRyeS4kcHVibGljTG9nMjxQcm94eUF1dGhlbnRpY2F0aW9uRXZlbnQsIFByb3h5QXV0aGVudGljYXRpb25DbGFzc2lmaWNhdGlvbj4oJ3Byb3h5QXV0aGVudGljYXRpb25SZXF1ZXN0Jywge1xuXHRcdGF1dGhlbnRpY2F0aW9uVHlwZTogYXV0aGVudGljYXRlLm1hcChhID0+IGEuc3BsaXQoJyAnKVswXSkuam9pbignLCcpLFxuXHRcdGV4dGVuc2lvbkhvc3RUeXBlOiBpc1JlbW90ZSA/ICdyZW1vdGUnIDogJ2xvY2FsJyxcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGdldEV4dEhvc3RDb25maWdWYWx1ZTxUPihjb25maWdQcm92aWRlcjogRXh0SG9zdENvbmZpZ1Byb3ZpZGVyLCBpc1JlbW90ZTogYm9vbGVhbiwga2V5OiBzdHJpbmcsIGZhbGxiYWNrOiBUKTogVDtcbmZ1bmN0aW9uIGdldEV4dEhvc3RDb25maWdWYWx1ZTxUPihjb25maWdQcm92aWRlcjogRXh0SG9zdENvbmZpZ1Byb3ZpZGVyLCBpc1JlbW90ZTogYm9vbGVhbiwga2V5OiBzdHJpbmcpOiBUIHwgdW5kZWZpbmVkO1xuZnVuY3Rpb24gZ2V0RXh0SG9zdENvbmZpZ1ZhbHVlPFQ+KGNvbmZpZ1Byb3ZpZGVyOiBFeHRIb3N0Q29uZmlnUHJvdmlkZXIsIGlzUmVtb3RlOiBib29sZWFuLCBrZXk6IHN0cmluZywgZmFsbGJhY2s/OiBUKTogVCB8IHVuZGVmaW5lZCB7XG5cdGlmIChpc1JlbW90ZSkge1xuXHRcdHJldHVybiBjb25maWdQcm92aWRlci5nZXRDb25maWd1cmF0aW9uKCkuZ2V0PFQ+KGtleSkgPz8gZmFsbGJhY2s7XG5cdH1cblx0Y29uc3QgdmFsdWVzOiBDb25maWd1cmF0aW9uSW5zcGVjdDxUPiB8IHVuZGVmaW5lZCA9IGNvbmZpZ1Byb3ZpZGVyLmdldENvbmZpZ3VyYXRpb24oKS5pbnNwZWN0PFQ+KGtleSk7XG5cdHJldHVybiB2YWx1ZXM/Lmdsb2JhbExvY2FsVmFsdWUgPz8gdmFsdWVzPy5kZWZhdWx0VmFsdWUgPz8gZmFsbGJhY2s7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFVQSxTQUFTLFdBQVc7QUFDcEIsU0FBc0IsWUFBWSx1QkFBdUI7QUFFekQsU0FBUyxVQUFV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
