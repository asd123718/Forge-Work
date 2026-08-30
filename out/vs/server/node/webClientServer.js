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
import { createReadStream, promises } from "fs";
import * as cookie from "cookie";
import * as crypto from "crypto";
import { isEqualOrParent } from "../../base/common/extpath.js";
import { getMediaMime } from "../../base/common/mime.js";
import { isLinux } from "../../base/common/platform.js";
import { ILogService, LogLevel } from "../../platform/log/common/log.js";
import { IServerEnvironmentService } from "./serverEnvironmentService.js";
import { extname, dirname, join, normalize, posix, resolve } from "../../base/common/path.js";
import { FileAccess, connectionTokenCookieName, connectionTokenQueryName, Schemas, builtinExtensionsPath } from "../../base/common/network.js";
import { generateUuid } from "../../base/common/uuid.js";
import { IProductService } from "../../platform/product/common/productService.js";
import { ServerConnectionTokenType } from "./serverConnectionToken.js";
import { asTextOrError, IRequestService } from "../../platform/request/common/request.js";
import { CancellationToken } from "../../base/common/cancellation.js";
import { URI } from "../../base/common/uri.js";
import { streamToBuffer } from "../../base/common/buffer.js";
import { isString } from "../../base/common/types.js";
import { CharCode } from "../../base/common/charCode.js";
import { ICSSDevelopmentService } from "../../platform/cssDev/node/cssDevService.js";
const textMimeType = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".svg": "image/svg+xml"
};
async function serveError(req, res, errorCode, errorMessage) {
  res.writeHead(errorCode, { "Content-Type": "text/plain" });
  res.end(errorMessage);
}
var CacheControl = /* @__PURE__ */ ((CacheControl2) => {
  CacheControl2[CacheControl2["NO_CACHING"] = 0] = "NO_CACHING";
  CacheControl2[CacheControl2["ETAG"] = 1] = "ETAG";
  CacheControl2[CacheControl2["NO_EXPIRY"] = 2] = "NO_EXPIRY";
  return CacheControl2;
})(CacheControl || {});
async function serveFile(filePath, cacheControl, logService, req, res, responseHeaders) {
  try {
    const stat = await promises.stat(filePath);
    if (cacheControl === 1 /* ETAG */) {
      const etag = `W/"${[stat.ino, stat.size, stat.mtime.getTime()].join("-")}"`;
      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304);
        return void res.end();
      }
      responseHeaders["Etag"] = etag;
    } else if (cacheControl === 2 /* NO_EXPIRY */) {
      responseHeaders["Cache-Control"] = "public, max-age=31536000";
    } else if (cacheControl === 0 /* NO_CACHING */) {
      responseHeaders["Cache-Control"] = "no-store";
    }
    responseHeaders["Content-Type"] = textMimeType[extname(filePath)] || getMediaMime(filePath) || "text/plain";
    const fileStream = createReadStream(filePath);
    await new Promise((resolve2, reject) => {
      fileStream.on("error", reject);
      fileStream.on("open", () => {
        res.writeHead(200, responseHeaders);
        fileStream.pipe(res);
        res.once("close", () => fileStream.destroy());
        fileStream.on("end", resolve2);
        fileStream.removeAllListeners("error");
        fileStream.on("error", (error) => {
          logService.error(error);
          console.error(error.toString());
          res.destroy();
        });
      });
    });
  } catch (error) {
    if (error.code !== "ENOENT") {
      logService.error(error);
      console.error(error.toString());
    } else {
      console.error(`File not found: ${filePath}`);
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    return void res.end("Not found");
  }
}
const APP_ROOT = dirname(FileAccess.asFileUri("").fsPath);
const STATIC_PATH = `/static`;
const CALLBACK_PATH = `/callback`;
const WEB_EXTENSION_PATH = `/web-extension-resource`;
let WebClientServer = class {
  constructor(_connectionToken, _basePath, _productPath, _environmentService, _logService, _requestService, _productService, _cssDevService) {
    this._connectionToken = _connectionToken;
    this._basePath = _basePath;
    this._productPath = _productPath;
    this._environmentService = _environmentService;
    this._logService = _logService;
    this._requestService = _requestService;
    this._productService = _productService;
    this._cssDevService = _cssDevService;
    this._webExtensionResourceUrlTemplate = this._productService.extensionsGallery?.resourceUrlTemplate ? URI.parse(this._productService.extensionsGallery.resourceUrlTemplate) : void 0;
  }
  /**
   * Handle web resources (i.e. only needed by the web client).
   * **NOTE**: This method is only invoked when the server has web bits.
   * **NOTE**: This method is only invoked after the connection token has been validated.
   * @param parsedUrl The URL to handle, including base and product path
   * @param pathname The pathname of the URL, without base and product path
   */
  async handle(req, res, parsedUrl, pathname) {
    try {
      if (pathname.startsWith(STATIC_PATH) && pathname.charCodeAt(STATIC_PATH.length) === CharCode.Slash) {
        return this._handleStatic(req, res, pathname.substring(STATIC_PATH.length));
      }
      if (pathname === "/") {
        return this._handleRoot(req, res, parsedUrl);
      }
      if (pathname === CALLBACK_PATH) {
        return this._handleCallback(res);
      }
      if (pathname.startsWith(WEB_EXTENSION_PATH) && pathname.charCodeAt(WEB_EXTENSION_PATH.length) === CharCode.Slash) {
        return this._handleWebExtensionResource(req, res, pathname.substring(WEB_EXTENSION_PATH.length));
      }
      return serveError(req, res, 404, "Not found.");
    } catch (error) {
      this._logService.error(error);
      console.error(error.toString());
      return serveError(req, res, 500, "Internal Server Error.");
    }
  }
  /**
   * Handle HTTP requests for /static/*
   * @param resourcePath The path after /static/
   */
  async _handleStatic(req, res, resourcePath) {
    const headers = /* @__PURE__ */ Object.create(null);
    const normalizedPathname = decodeURIComponent(resourcePath);
    const filePath = join(APP_ROOT, normalizedPathname);
    if (!isEqualOrParent(filePath, APP_ROOT, !isLinux)) {
      return serveError(req, res, 400, `Bad request.`);
    }
    return serveFile(filePath, this._environmentService.isBuilt ? 2 /* NO_EXPIRY */ : 1 /* ETAG */, this._logService, req, res, headers);
  }
  _getResourceURLTemplateAuthority(uri) {
    const index = uri.authority.indexOf(".");
    return index !== -1 ? uri.authority.substring(index + 1) : void 0;
  }
  /**
   * Handle extension resources
   * @param resourcePath The path after /web-extension-resource/
   */
  async _handleWebExtensionResource(req, res, resourcePath) {
    if (!this._webExtensionResourceUrlTemplate) {
      return serveError(req, res, 500, "No extension gallery service configured.");
    }
    const normalizedPathname = decodeURIComponent(resourcePath);
    const path = normalize(normalizedPathname);
    const uri = URI.parse(path).with({
      scheme: this._webExtensionResourceUrlTemplate.scheme,
      authority: path.substring(0, path.indexOf("/")),
      path: path.substring(path.indexOf("/") + 1)
    });
    if (this._getResourceURLTemplateAuthority(this._webExtensionResourceUrlTemplate) !== this._getResourceURLTemplateAuthority(uri)) {
      return serveError(req, res, 403, "Request Forbidden");
    }
    const headers = {};
    const setRequestHeader = (header) => {
      const value = req.headers[header];
      if (value && (isString(value) || value[0])) {
        headers[header] = isString(value) ? value : value[0];
      } else if (header !== header.toLowerCase()) {
        setRequestHeader(header.toLowerCase());
      }
    };
    setRequestHeader("X-Client-Name");
    setRequestHeader("X-Client-Version");
    setRequestHeader("X-Machine-Id");
    setRequestHeader("X-Client-Commit");
    const context = await this._requestService.request({
      type: "GET",
      url: uri.toString(true),
      headers,
      callSite: "webClientServer.fetchAndWriteFile"
    }, CancellationToken.None);
    const status = context.res.statusCode || 500;
    if (status !== 200) {
      let text = null;
      try {
        text = await asTextOrError(context);
      } catch (error) {
      }
      return serveError(req, res, status, text || `Request failed with status ${status}`);
    }
    const responseHeaders = /* @__PURE__ */ Object.create(null);
    const setResponseHeader = (header) => {
      const value = context.res.headers[header];
      if (value) {
        responseHeaders[header] = value;
      } else if (header !== header.toLowerCase()) {
        setResponseHeader(header.toLowerCase());
      }
    };
    setResponseHeader("Cache-Control");
    setResponseHeader("Content-Type");
    res.writeHead(200, responseHeaders);
    const buffer = await streamToBuffer(context.stream);
    return void res.end(buffer.buffer);
  }
  /**
   * Handle HTTP requests for /
   */
  async _handleRoot(req, res, parsedUrl) {
    const getFirstHeader = (headerName) => {
      const val = req.headers[headerName];
      return Array.isArray(val) ? val[0] : val;
    };
    const basePath = getFirstHeader("x-forwarded-prefix") || this._basePath;
    const queryConnectionTokens = parsedUrl.searchParams.getAll(connectionTokenQueryName);
    if (queryConnectionTokens.length === 1) {
      const queryConnectionToken = queryConnectionTokens[0];
      const responseHeaders = /* @__PURE__ */ Object.create(null);
      responseHeaders["Set-Cookie"] = cookie.serialize(
        connectionTokenCookieName,
        queryConnectionToken,
        {
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 7
          /* 1 week */
        }
      );
      const newQuery = new URLSearchParams(parsedUrl.searchParams);
      newQuery.delete(connectionTokenQueryName);
      const queryString = newQuery.toString();
      const newLocation = queryString ? `${basePath}?${queryString}` : basePath;
      responseHeaders["Location"] = newLocation;
      res.writeHead(302, responseHeaders);
      return void res.end();
    }
    const replacePort = (host, port) => {
      const index = host?.indexOf(":");
      if (index !== -1) {
        host = host?.substring(0, index);
      }
      host += `:${port}`;
      return host;
    };
    const useTestResolver = !this._environmentService.isBuilt && this._environmentService.args["use-test-resolver"];
    let remoteAuthority = useTestResolver ? "test+test" : getFirstHeader("x-original-host") || getFirstHeader("x-forwarded-host") || req.headers.host;
    if (!remoteAuthority) {
      return serveError(req, res, 400, `Bad request.`);
    }
    const forwardedPort = getFirstHeader("x-forwarded-port");
    if (forwardedPort) {
      remoteAuthority = replacePort(remoteAuthority, forwardedPort);
    }
    function asJSON(value) {
      return JSON.stringify(value).replace(/"/g, "&quot;");
    }
    let _wrapWebWorkerExtHostInIframe = void 0;
    if (this._environmentService.args["enable-smoke-test-driver"]) {
      _wrapWebWorkerExtHostInIframe = false;
    }
    if (this._logService.getLevel() === LogLevel.Trace) {
      ["x-original-host", "x-forwarded-host", "x-forwarded-port", "host"].forEach((header) => {
        const value = getFirstHeader(header);
        if (value) {
          this._logService.trace(`[WebClientServer] ${header}: ${value}`);
        }
      });
      this._logService.trace(`[WebClientServer] Request URL: ${req.url}, basePath: ${basePath}, remoteAuthority: ${remoteAuthority}`);
    }
    const staticRoute = posix.join(basePath, this._productPath, STATIC_PATH);
    const callbackRoute = posix.join(basePath, this._productPath, CALLBACK_PATH);
    const webExtensionRoute = posix.join(basePath, this._productPath, WEB_EXTENSION_PATH);
    const resolveWorkspaceURI = (defaultLocation) => defaultLocation && URI.file(resolve(defaultLocation)).with({ scheme: Schemas.vscodeRemote, authority: remoteAuthority });
    const filePath = FileAccess.asFileUri(`vs/code/browser/workbench/workbench${this._environmentService.isBuilt ? "" : "-dev"}.html`).fsPath;
    const authSessionInfo = !this._environmentService.isBuilt && this._environmentService.args["github-auth"] ? {
      id: generateUuid(),
      providerId: "github",
      accessToken: this._environmentService.args["github-auth"],
      scopes: [["user:email"], ["repo"]]
    } : void 0;
    const productConfiguration = {
      embedderIdentifier: "server-distro",
      voiceWsUrl: this._productService.voiceWsUrl,
      extensionsGallery: this._webExtensionResourceUrlTemplate && this._productService.extensionsGallery ? {
        ...this._productService.extensionsGallery,
        resourceUrlTemplate: this._webExtensionResourceUrlTemplate.with({
          scheme: "http",
          authority: remoteAuthority,
          path: `${webExtensionRoute}/${this._webExtensionResourceUrlTemplate.authority}${this._webExtensionResourceUrlTemplate.path}`
        }).toString(true)
      } : void 0
    };
    if (!this._environmentService.isBuilt) {
      try {
        const productOverrides = JSON.parse((await promises.readFile(join(APP_ROOT, "product.overrides.json"))).toString());
        Object.assign(productConfiguration, productOverrides);
      } catch (err) {
      }
    }
    const workbenchWebConfiguration = {
      remoteAuthority,
      serverBasePath: basePath,
      _wrapWebWorkerExtHostInIframe,
      developmentOptions: { enableSmokeTestDriver: this._environmentService.args["enable-smoke-test-driver"] ? true : void 0, logLevel: this._logService.getLevel() },
      settingsSyncOptions: !this._environmentService.isBuilt && this._environmentService.args["enable-sync"] ? { enabled: true } : void 0,
      enableWorkspaceTrust: !this._environmentService.args["disable-workspace-trust"],
      enabledExtensionProposedApi: this._environmentService.args["enable-proposed-api"],
      folderUri: resolveWorkspaceURI(this._environmentService.args["default-folder"]),
      workspaceUri: resolveWorkspaceURI(this._environmentService.args["default-workspace"]),
      productConfiguration,
      callbackRoute
    };
    const cookies = cookie.parse(req.headers.cookie || "");
    const locale = cookies["vscode.nls.locale"] || req.headers["accept-language"]?.split(",")[0]?.toLowerCase() || "en";
    let WORKBENCH_NLS_BASE_URL;
    let WORKBENCH_NLS_URL;
    if (!locale.startsWith("en") && this._productService.nlsCoreBaseUrl) {
      WORKBENCH_NLS_BASE_URL = this._productService.nlsCoreBaseUrl;
      WORKBENCH_NLS_URL = `${WORKBENCH_NLS_BASE_URL}${this._productService.commit}/${this._productService.version}/${locale}/nls.messages.js`;
    } else {
      WORKBENCH_NLS_URL = "";
    }
    const values = {
      WORKBENCH_WEB_CONFIGURATION: asJSON(workbenchWebConfiguration),
      WORKBENCH_AUTH_SESSION: authSessionInfo ? asJSON(authSessionInfo) : "",
      WORKBENCH_WEB_BASE_URL: staticRoute,
      WORKBENCH_NLS_URL,
      WORKBENCH_NLS_FALLBACK_URL: `${staticRoute}/out/nls.messages.js`
    };
    if (this._cssDevService.isEnabled) {
      const cssModules = await this._cssDevService.getCssModules();
      values["WORKBENCH_DEV_CSS_MODULES"] = JSON.stringify(cssModules);
    }
    if (useTestResolver) {
      const bundledExtensions = [];
      for (const extensionPath of ["vscode-test-resolver", "github-authentication"]) {
        const packageJSON = JSON.parse((await promises.readFile(FileAccess.asFileUri(`${builtinExtensionsPath}/${extensionPath}/package.json`).fsPath)).toString());
        bundledExtensions.push({ extensionPath, packageJSON });
      }
      values["WORKBENCH_BUILTIN_EXTENSIONS"] = asJSON(bundledExtensions);
    }
    let data;
    try {
      const workbenchTemplate = (await promises.readFile(filePath)).toString();
      data = workbenchTemplate.replace(/\{\{([^}]+)\}\}/g, (_, key) => values[key] ?? "undefined");
    } catch (e) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return void res.end("Not found");
    }
    const webWorkerExtensionHostIframeScriptSHA = "sha256-daEgfo2VIXpx2Np71KqCCbkeQwv+68vPrx54XRcbdcs=";
    const cspDirectives = [
      "default-src 'self';",
      "img-src 'self' https: data: blob:;",
      "media-src 'self';",
      `script-src 'self' 'unsafe-eval' ${WORKBENCH_NLS_BASE_URL ?? ""} blob: 'nonce-1nline-m4p' ${this._getScriptCspHashes(data).join(" ")} '${webWorkerExtensionHostIframeScriptSHA}' 'sha256-/r7rqQ+yrxt57sxLuQ6AMYcy/lUpvAIzHjIJt/OeLWU=' ${useTestResolver ? "" : `http://${remoteAuthority}`};`,
      // the sha is the same as in src/vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html
      "child-src 'self';",
      `frame-src 'self' https://*.vscode-cdn.net data:;`,
      "worker-src 'self' data: blob:;",
      "style-src 'self' 'unsafe-inline';",
      "connect-src 'self' ws: wss: https:;",
      "font-src 'self' blob:;",
      "manifest-src 'self';"
    ].join(" ");
    const headers = {
      "Content-Type": "text/html",
      "Content-Security-Policy": cspDirectives
    };
    if (this._connectionToken.type !== ServerConnectionTokenType.None) {
      headers["Set-Cookie"] = cookie.serialize(
        connectionTokenCookieName,
        this._connectionToken.value,
        {
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 7
          /* 1 week */
        }
      );
    }
    res.writeHead(200, headers);
    return void res.end(data);
  }
  _getScriptCspHashes(content) {
    const regex = /<script>([\s\S]+?)<\/script>/img;
    const result = [];
    let match;
    while (match = regex.exec(content)) {
      const hasher = crypto.createHash("sha256");
      const script = match[1].replace(/\r\n/g, "\n");
      const hash = hasher.update(Buffer.from(script)).digest().toString("base64");
      result.push(`'sha256-${hash}'`);
    }
    return result;
  }
  /**
   * Handle HTTP requests for /callback
   */
  async _handleCallback(res) {
    const filePath = FileAccess.asFileUri("vs/code/browser/workbench/callback.html").fsPath;
    const data = (await promises.readFile(filePath)).toString();
    const cspDirectives = [
      "default-src 'self';",
      "img-src 'self' https: data: blob:;",
      "media-src 'none';",
      `script-src 'self' ${this._getScriptCspHashes(data).join(" ")};`,
      "style-src 'self' 'unsafe-inline';",
      "font-src 'self' blob:;"
    ].join(" ");
    res.writeHead(200, {
      "Content-Type": "text/html",
      "Content-Security-Policy": cspDirectives
    });
    return void res.end(data);
  }
};
WebClientServer = __decorateClass([
  __decorateParam(3, IServerEnvironmentService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IRequestService),
  __decorateParam(6, IProductService),
  __decorateParam(7, ICSSDevelopmentService)
], WebClientServer);
export {
  CacheControl,
  WebClientServer,
  serveError,
  serveFile
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXJ2ZXJcXG5vZGVcXHdlYkNsaWVudFNlcnZlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNyZWF0ZVJlYWRTdHJlYW0sIHByb21pc2VzIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHR5cGUgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0ICogYXMgY29va2llIGZyb20gJ2Nvb2tpZSc7XG5pbXBvcnQgKiBhcyBjcnlwdG8gZnJvbSAnY3J5cHRvJztcbmltcG9ydCB7IGlzRXF1YWxPclBhcmVudCB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2V4dHBhdGguanMnO1xuaW1wb3J0IHsgZ2V0TWVkaWFNaW1lIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vbWltZS5qcyc7XG5pbXBvcnQgeyBpc0xpbnV4IH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIExvZ0xldmVsIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVNlcnZlckVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4vc2VydmVyRW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGV4dG5hbWUsIGRpcm5hbWUsIGpvaW4sIG5vcm1hbGl6ZSwgcG9zaXgsIHJlc29sdmUgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MsIGNvbm5lY3Rpb25Ub2tlbkNvb2tpZU5hbWUsIGNvbm5lY3Rpb25Ub2tlblF1ZXJ5TmFtZSwgU2NoZW1hcywgYnVpbHRpbkV4dGVuc2lvbnNQYXRoIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlcnZlckNvbm5lY3Rpb25Ub2tlbiwgU2VydmVyQ29ubmVjdGlvblRva2VuVHlwZSB9IGZyb20gJy4vc2VydmVyQ29ubmVjdGlvblRva2VuLmpzJztcbmltcG9ydCB7IGFzVGV4dE9yRXJyb3IsIElSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgSUhlYWRlcnMgfSBmcm9tICcuLi8uLi9iYXNlL3BhcnRzL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHN0cmVhbVRvQnVmZmVyIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IElQcm9kdWN0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcsIE11dGFibGUgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5pZmVzdCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNTU0RldmVsb3BtZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2Nzc0Rldi9ub2RlL2Nzc0RldlNlcnZpY2UuanMnO1xuXG5jb25zdCB0ZXh0TWltZVR5cGU6IHsgW2V4dDogc3RyaW5nXTogc3RyaW5nIHwgdW5kZWZpbmVkIH0gPSB7XG5cdCcuaHRtbCc6ICd0ZXh0L2h0bWwnLFxuXHQnLmpzJzogJ3RleHQvamF2YXNjcmlwdCcsXG5cdCcuanNvbic6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0Jy5jc3MnOiAndGV4dC9jc3MnLFxuXHQnLnN2Zyc6ICdpbWFnZS9zdmcreG1sJyxcbn07XG5cbi8qKlxuICogUmV0dXJuIGFuIGVycm9yIHRvIHRoZSBjbGllbnQuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXJ2ZUVycm9yKHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSwgZXJyb3JDb2RlOiBudW1iZXIsIGVycm9yTWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdHJlcy53cml0ZUhlYWQoZXJyb3JDb2RlLCB7ICdDb250ZW50LVR5cGUnOiAndGV4dC9wbGFpbicgfSk7XG5cdHJlcy5lbmQoZXJyb3JNZXNzYWdlKTtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gQ2FjaGVDb250cm9sIHtcblx0Tk9fQ0FDSElORywgRVRBRywgTk9fRVhQSVJZXG59XG5cbi8qKlxuICogU2VydmUgYSBmaWxlIGF0IGEgZ2l2ZW4gcGF0aCBvciA0MDQgaWYgdGhlIGZpbGUgaXMgbWlzc2luZy5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNlcnZlRmlsZShmaWxlUGF0aDogc3RyaW5nLCBjYWNoZUNvbnRyb2w6IENhY2hlQ29udHJvbCwgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsIHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSwgcmVzcG9uc2VIZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTx2b2lkPiB7XG5cdHRyeSB7XG5cdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHByb21pc2VzLnN0YXQoZmlsZVBhdGgpOyAvLyB0aHJvd3MgYW4gZXJyb3IgaWYgZmlsZSBkb2Vzbid0IGV4aXN0XG5cdFx0aWYgKGNhY2hlQ29udHJvbCA9PT0gQ2FjaGVDb250cm9sLkVUQUcpIHtcblxuXHRcdFx0Ly8gQ2hlY2sgaWYgZmlsZSBtb2RpZmllZCBzaW5jZVxuXHRcdFx0Y29uc3QgZXRhZyA9IGBXL1wiJHtbc3RhdC5pbm8sIHN0YXQuc2l6ZSwgc3RhdC5tdGltZS5nZXRUaW1lKCldLmpvaW4oJy0nKX1cImA7IC8vIHdlYWsgdmFsaWRhdG9yIChodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9IVFRQL0hlYWRlcnMvRVRhZylcblx0XHRcdGlmIChyZXEuaGVhZGVyc1snaWYtbm9uZS1tYXRjaCddID09PSBldGFnKSB7XG5cdFx0XHRcdHJlcy53cml0ZUhlYWQoMzA0KTtcblx0XHRcdFx0cmV0dXJuIHZvaWQgcmVzLmVuZCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXNwb25zZUhlYWRlcnNbJ0V0YWcnXSA9IGV0YWc7XG5cdFx0fSBlbHNlIGlmIChjYWNoZUNvbnRyb2wgPT09IENhY2hlQ29udHJvbC5OT19FWFBJUlkpIHtcblx0XHRcdHJlc3BvbnNlSGVhZGVyc1snQ2FjaGUtQ29udHJvbCddID0gJ3B1YmxpYywgbWF4LWFnZT0zMTUzNjAwMCc7XG5cdFx0fSBlbHNlIGlmIChjYWNoZUNvbnRyb2wgPT09IENhY2hlQ29udHJvbC5OT19DQUNISU5HKSB7XG5cdFx0XHRyZXNwb25zZUhlYWRlcnNbJ0NhY2hlLUNvbnRyb2wnXSA9ICduby1zdG9yZSc7XG5cdFx0fVxuXG5cdFx0cmVzcG9uc2VIZWFkZXJzWydDb250ZW50LVR5cGUnXSA9IHRleHRNaW1lVHlwZVtleHRuYW1lKGZpbGVQYXRoKV0gfHwgZ2V0TWVkaWFNaW1lKGZpbGVQYXRoKSB8fCAndGV4dC9wbGFpbic7XG5cblx0XHQvLyBDcmVhdGUgdGhlIHN0cmVhbSBmaXJzdCBhbmQgd2FpdCBmb3IgaXQgdG8gb3BlbiBiZWZvcmUgc2VuZGluZ1xuXHRcdC8vIGhlYWRlcnMgc28gdGhhdCBlcnJvcnMgKGUuZy4gRU5PRU5UIHJhY2UpIGNhbiBzdGlsbCBwcm9kdWNlIGFcblx0XHQvLyBwcm9wZXIgNDA0IHJlc3BvbnNlIGluc3RlYWQgb2YgYWJvcnRpbmcgYSBoYWxmLXNlbnQgMjAwLlxuXHRcdGNvbnN0IGZpbGVTdHJlYW0gPSBjcmVhdGVSZWFkU3RyZWFtKGZpbGVQYXRoKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRmaWxlU3RyZWFtLm9uKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0XHRmaWxlU3RyZWFtLm9uKCdvcGVuJywgKCkgPT4ge1xuXHRcdFx0XHQvLyBGaWxlIG9wZW5lZCBzdWNjZXNzZnVsbHkgLSBzZW5kIGhlYWRlcnMgYW5kIHBpcGVcblx0XHRcdFx0cmVzLndyaXRlSGVhZCgyMDAsIHJlc3BvbnNlSGVhZGVycyk7XG5cdFx0XHRcdGZpbGVTdHJlYW0ucGlwZShyZXMpO1xuXHRcdFx0XHQvLyBEZXN0cm95IHRoZSByZWFkIHN0cmVhbSBpZiB0aGUgcmVzcG9uc2UgaXMgY2xvc2VkIHByZW1hdHVyZWx5XG5cdFx0XHRcdC8vIChlLmcuIGNsaWVudCBkaXNjb25uZWN0KSB0byBhdm9pZCBsZWFraW5nIHRoZSBmaWxlIGRlc2NyaXB0b3IuXG5cdFx0XHRcdHJlcy5vbmNlKCdjbG9zZScsICgpID0+IGZpbGVTdHJlYW0uZGVzdHJveSgpKTtcblx0XHRcdFx0ZmlsZVN0cmVhbS5vbignZW5kJywgcmVzb2x2ZSk7XG5cdFx0XHRcdC8vIFJlcGxhY2UgdGhlIGluaXRpYWwgZXJyb3IgaGFuZGxlciBub3cgdGhhdCBoZWFkZXJzIGFyZSBzZW50XG5cdFx0XHRcdGZpbGVTdHJlYW0ucmVtb3ZlQWxsTGlzdGVuZXJzKCdlcnJvcicpO1xuXHRcdFx0XHRmaWxlU3RyZWFtLm9uKCdlcnJvcicsIGVycm9yID0+IHtcblx0XHRcdFx0XHRsb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdFx0XHRjb25zb2xlLmVycm9yKGVycm9yLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdHJlcy5kZXN0cm95KCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0aWYgKGVycm9yLmNvZGUgIT09ICdFTk9FTlQnKSB7XG5cdFx0XHRsb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdGNvbnNvbGUuZXJyb3IoZXJyb3IudG9TdHJpbmcoKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoYEZpbGUgbm90IGZvdW5kOiAke2ZpbGVQYXRofWApO1xuXHRcdH1cblxuXHRcdHJlcy53cml0ZUhlYWQoNDA0LCB7ICdDb250ZW50LVR5cGUnOiAndGV4dC9wbGFpbicgfSk7XG5cdFx0cmV0dXJuIHZvaWQgcmVzLmVuZCgnTm90IGZvdW5kJyk7XG5cdH1cbn1cblxuY29uc3QgQVBQX1JPT1QgPSBkaXJuYW1lKEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCcnKS5mc1BhdGgpO1xuXG5jb25zdCBTVEFUSUNfUEFUSCA9IGAvc3RhdGljYDtcbmNvbnN0IENBTExCQUNLX1BBVEggPSBgL2NhbGxiYWNrYDtcbmNvbnN0IFdFQl9FWFRFTlNJT05fUEFUSCA9IGAvd2ViLWV4dGVuc2lvbi1yZXNvdXJjZWA7XG5cbmV4cG9ydCBjbGFzcyBXZWJDbGllbnRTZXJ2ZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dlYkV4dGVuc2lvblJlc291cmNlVXJsVGVtcGxhdGU6IFVSSSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb25uZWN0aW9uVG9rZW46IFNlcnZlckNvbm5lY3Rpb25Ub2tlbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9iYXNlUGF0aDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RQYXRoOiBzdHJpbmcsXG5cdFx0QElTZXJ2ZXJFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJU2VydmVyRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3JlcXVlc3RTZXJ2aWNlOiBJUmVxdWVzdFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQ1NTRGV2ZWxvcG1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Nzc0RldlNlcnZpY2U6IElDU1NEZXZlbG9wbWVudFNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5fd2ViRXh0ZW5zaW9uUmVzb3VyY2VVcmxUZW1wbGF0ZSA9IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmV4dGVuc2lvbnNHYWxsZXJ5Py5yZXNvdXJjZVVybFRlbXBsYXRlID8gVVJJLnBhcnNlKHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmV4dGVuc2lvbnNHYWxsZXJ5LnJlc291cmNlVXJsVGVtcGxhdGUpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZSB3ZWIgcmVzb3VyY2VzIChpLmUuIG9ubHkgbmVlZGVkIGJ5IHRoZSB3ZWIgY2xpZW50KS5cblx0ICogKipOT1RFKio6IFRoaXMgbWV0aG9kIGlzIG9ubHkgaW52b2tlZCB3aGVuIHRoZSBzZXJ2ZXIgaGFzIHdlYiBiaXRzLlxuXHQgKiAqKk5PVEUqKjogVGhpcyBtZXRob2QgaXMgb25seSBpbnZva2VkIGFmdGVyIHRoZSBjb25uZWN0aW9uIHRva2VuIGhhcyBiZWVuIHZhbGlkYXRlZC5cblx0ICogQHBhcmFtIHBhcnNlZFVybCBUaGUgVVJMIHRvIGhhbmRsZSwgaW5jbHVkaW5nIGJhc2UgYW5kIHByb2R1Y3QgcGF0aFxuXHQgKiBAcGFyYW0gcGF0aG5hbWUgVGhlIHBhdGhuYW1lIG9mIHRoZSBVUkwsIHdpdGhvdXQgYmFzZSBhbmQgcHJvZHVjdCBwYXRoXG5cdCAqL1xuXHRhc3luYyBoYW5kbGUocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlLCBwYXJzZWRVcmw6IFVSTCwgcGF0aG5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAocGF0aG5hbWUuc3RhcnRzV2l0aChTVEFUSUNfUEFUSCkgJiYgcGF0aG5hbWUuY2hhckNvZGVBdChTVEFUSUNfUEFUSC5sZW5ndGgpID09PSBDaGFyQ29kZS5TbGFzaCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5faGFuZGxlU3RhdGljKHJlcSwgcmVzLCBwYXRobmFtZS5zdWJzdHJpbmcoU1RBVElDX1BBVEgubGVuZ3RoKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocGF0aG5hbWUgPT09ICcvJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5faGFuZGxlUm9vdChyZXEsIHJlcywgcGFyc2VkVXJsKTtcblx0XHRcdH1cblx0XHRcdGlmIChwYXRobmFtZSA9PT0gQ0FMTEJBQ0tfUEFUSCkge1xuXHRcdFx0XHQvLyBjYWxsYmFjayBzdXBwb3J0XG5cdFx0XHRcdHJldHVybiB0aGlzLl9oYW5kbGVDYWxsYmFjayhyZXMpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHBhdGhuYW1lLnN0YXJ0c1dpdGgoV0VCX0VYVEVOU0lPTl9QQVRIKSAmJiBwYXRobmFtZS5jaGFyQ29kZUF0KFdFQl9FWFRFTlNJT05fUEFUSC5sZW5ndGgpID09PSBDaGFyQ29kZS5TbGFzaCkge1xuXHRcdFx0XHQvLyBleHRlbnNpb24gcmVzb3VyY2Ugc3VwcG9ydFxuXHRcdFx0XHRyZXR1cm4gdGhpcy5faGFuZGxlV2ViRXh0ZW5zaW9uUmVzb3VyY2UocmVxLCByZXMsIHBhdGhuYW1lLnN1YnN0cmluZyhXRUJfRVhURU5TSU9OX1BBVEgubGVuZ3RoKSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBzZXJ2ZUVycm9yKHJlcSwgcmVzLCA0MDQsICdOb3QgZm91bmQuJyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0Y29uc29sZS5lcnJvcihlcnJvci50b1N0cmluZygpKTtcblxuXHRcdFx0cmV0dXJuIHNlcnZlRXJyb3IocmVxLCByZXMsIDUwMCwgJ0ludGVybmFsIFNlcnZlciBFcnJvci4nKTtcblx0XHR9XG5cdH1cblx0LyoqXG5cdCAqIEhhbmRsZSBIVFRQIHJlcXVlc3RzIGZvciAvc3RhdGljLypcblx0ICogQHBhcmFtIHJlc291cmNlUGF0aCBUaGUgcGF0aCBhZnRlciAvc3RhdGljL1xuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlU3RhdGljKHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSwgcmVzb3VyY2VQYXRoOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuXHRcdC8vIFN0cmlwIHRoZSB0aGlzLl9zdGF0aWNSb3V0ZSBmcm9tIHRoZSBwYXRoXG5cdFx0Y29uc3Qgbm9ybWFsaXplZFBhdGhuYW1lID0gZGVjb2RlVVJJQ29tcG9uZW50KHJlc291cmNlUGF0aCk7IC8vIHN1cHBvcnQgcGF0aHMgdGhhdCBhcmUgdXJpLWVuY29kZWQgKGUuZy4gc3BhY2VzID0+ICUyMClcblxuXHRcdGNvbnN0IGZpbGVQYXRoID0gam9pbihBUFBfUk9PVCwgbm9ybWFsaXplZFBhdGhuYW1lKTsgLy8gam9pbiBhbHNvIG5vcm1hbGl6ZXMgdGhlIHBhdGhcblx0XHRpZiAoIWlzRXF1YWxPclBhcmVudChmaWxlUGF0aCwgQVBQX1JPT1QsICFpc0xpbnV4KSkge1xuXHRcdFx0cmV0dXJuIHNlcnZlRXJyb3IocmVxLCByZXMsIDQwMCwgYEJhZCByZXF1ZXN0LmApO1xuXHRcdH1cblxuXHRcdHJldHVybiBzZXJ2ZUZpbGUoZmlsZVBhdGgsIHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5pc0J1aWx0ID8gQ2FjaGVDb250cm9sLk5PX0VYUElSWSA6IENhY2hlQ29udHJvbC5FVEFHLCB0aGlzLl9sb2dTZXJ2aWNlLCByZXEsIHJlcywgaGVhZGVycyk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSZXNvdXJjZVVSTFRlbXBsYXRlQXV0aG9yaXR5KHVyaTogVVJJKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpbmRleCA9IHVyaS5hdXRob3JpdHkuaW5kZXhPZignLicpO1xuXHRcdHJldHVybiBpbmRleCAhPT0gLTEgPyB1cmkuYXV0aG9yaXR5LnN1YnN0cmluZyhpbmRleCArIDEpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZSBleHRlbnNpb24gcmVzb3VyY2VzXG5cdCAqIEBwYXJhbSByZXNvdXJjZVBhdGggVGhlIHBhdGggYWZ0ZXIgL3dlYi1leHRlbnNpb24tcmVzb3VyY2UvXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVXZWJFeHRlbnNpb25SZXNvdXJjZShyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCByZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UsIHJlc291cmNlUGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl93ZWJFeHRlbnNpb25SZXNvdXJjZVVybFRlbXBsYXRlKSB7XG5cdFx0XHRyZXR1cm4gc2VydmVFcnJvcihyZXEsIHJlcywgNTAwLCAnTm8gZXh0ZW5zaW9uIGdhbGxlcnkgc2VydmljZSBjb25maWd1cmVkLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vcm1hbGl6ZWRQYXRobmFtZSA9IGRlY29kZVVSSUNvbXBvbmVudChyZXNvdXJjZVBhdGgpOyAvLyBzdXBwb3J0IHBhdGhzIHRoYXQgYXJlIHVyaS1lbmNvZGVkIChlLmcuIHNwYWNlcyA9PiAlMjApXG5cdFx0Y29uc3QgcGF0aCA9IG5vcm1hbGl6ZShub3JtYWxpemVkUGF0aG5hbWUpO1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShwYXRoKS53aXRoKHtcblx0XHRcdHNjaGVtZTogdGhpcy5fd2ViRXh0ZW5zaW9uUmVzb3VyY2VVcmxUZW1wbGF0ZS5zY2hlbWUsXG5cdFx0XHRhdXRob3JpdHk6IHBhdGguc3Vic3RyaW5nKDAsIHBhdGguaW5kZXhPZignLycpKSxcblx0XHRcdHBhdGg6IHBhdGguc3Vic3RyaW5nKHBhdGguaW5kZXhPZignLycpICsgMSlcblx0XHR9KTtcblxuXHRcdGlmICh0aGlzLl9nZXRSZXNvdXJjZVVSTFRlbXBsYXRlQXV0aG9yaXR5KHRoaXMuX3dlYkV4dGVuc2lvblJlc291cmNlVXJsVGVtcGxhdGUpICE9PSB0aGlzLl9nZXRSZXNvdXJjZVVSTFRlbXBsYXRlQXV0aG9yaXR5KHVyaSkpIHtcblx0XHRcdHJldHVybiBzZXJ2ZUVycm9yKHJlcSwgcmVzLCA0MDMsICdSZXF1ZXN0IEZvcmJpZGRlbicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhlYWRlcnM6IElIZWFkZXJzID0ge307XG5cdFx0Y29uc3Qgc2V0UmVxdWVzdEhlYWRlciA9IChoZWFkZXI6IHN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSByZXEuaGVhZGVyc1toZWFkZXJdO1xuXHRcdFx0aWYgKHZhbHVlICYmIChpc1N0cmluZyh2YWx1ZSkgfHwgdmFsdWVbMF0pKSB7XG5cdFx0XHRcdGhlYWRlcnNbaGVhZGVyXSA9IGlzU3RyaW5nKHZhbHVlKSA/IHZhbHVlIDogdmFsdWVbMF07XG5cdFx0XHR9IGVsc2UgaWYgKGhlYWRlciAhPT0gaGVhZGVyLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRcdFx0c2V0UmVxdWVzdEhlYWRlcihoZWFkZXIudG9Mb3dlckNhc2UoKSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRzZXRSZXF1ZXN0SGVhZGVyKCdYLUNsaWVudC1OYW1lJyk7XG5cdFx0c2V0UmVxdWVzdEhlYWRlcignWC1DbGllbnQtVmVyc2lvbicpO1xuXHRcdHNldFJlcXVlc3RIZWFkZXIoJ1gtTWFjaGluZS1JZCcpO1xuXHRcdHNldFJlcXVlc3RIZWFkZXIoJ1gtQ2xpZW50LUNvbW1pdCcpO1xuXG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMuX3JlcXVlc3RTZXJ2aWNlLnJlcXVlc3Qoe1xuXHRcdFx0dHlwZTogJ0dFVCcsXG5cdFx0XHR1cmw6IHVyaS50b1N0cmluZyh0cnVlKSxcblx0XHRcdGhlYWRlcnMsXG5cdFx0XHRjYWxsU2l0ZTogJ3dlYkNsaWVudFNlcnZlci5mZXRjaEFuZFdyaXRlRmlsZSdcblx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGNvbnN0IHN0YXR1cyA9IGNvbnRleHQucmVzLnN0YXR1c0NvZGUgfHwgNTAwO1xuXHRcdGlmIChzdGF0dXMgIT09IDIwMCkge1xuXHRcdFx0bGV0IHRleHQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGV4dCA9IGF3YWl0IGFzVGV4dE9yRXJyb3IoY29udGV4dCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikgey8qIElnbm9yZSAqLyB9XG5cdFx0XHRyZXR1cm4gc2VydmVFcnJvcihyZXEsIHJlcywgc3RhdHVzLCB0ZXh0IHx8IGBSZXF1ZXN0IGZhaWxlZCB3aXRoIHN0YXR1cyAke3N0YXR1c31gKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNwb25zZUhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHN0cmluZ1tdPiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0Y29uc3Qgc2V0UmVzcG9uc2VIZWFkZXIgPSAoaGVhZGVyOiBzdHJpbmcpID0+IHtcblx0XHRcdGNvbnN0IHZhbHVlID0gY29udGV4dC5yZXMuaGVhZGVyc1toZWFkZXJdO1xuXHRcdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRcdHJlc3BvbnNlSGVhZGVyc1toZWFkZXJdID0gdmFsdWU7XG5cdFx0XHR9IGVsc2UgaWYgKGhlYWRlciAhPT0gaGVhZGVyLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRcdFx0c2V0UmVzcG9uc2VIZWFkZXIoaGVhZGVyLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0c2V0UmVzcG9uc2VIZWFkZXIoJ0NhY2hlLUNvbnRyb2wnKTtcblx0XHRzZXRSZXNwb25zZUhlYWRlcignQ29udGVudC1UeXBlJyk7XG5cdFx0cmVzLndyaXRlSGVhZCgyMDAsIHJlc3BvbnNlSGVhZGVycyk7XG5cdFx0Y29uc3QgYnVmZmVyID0gYXdhaXQgc3RyZWFtVG9CdWZmZXIoY29udGV4dC5zdHJlYW0pO1xuXHRcdHJldHVybiB2b2lkIHJlcy5lbmQoYnVmZmVyLmJ1ZmZlcik7XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlIEhUVFAgcmVxdWVzdHMgZm9yIC9cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVJvb3QocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlLCBwYXJzZWRVcmw6IFVSTCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Y29uc3QgZ2V0Rmlyc3RIZWFkZXIgPSAoaGVhZGVyTmFtZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRjb25zdCB2YWwgPSByZXEuaGVhZGVyc1toZWFkZXJOYW1lXTtcblx0XHRcdHJldHVybiBBcnJheS5pc0FycmF5KHZhbCkgPyB2YWxbMF0gOiB2YWw7XG5cdFx0fTtcblxuXHRcdC8vIFByZWZpeCByb3V0ZXMgd2l0aCBiYXNlUGF0aCBmb3IgY2xpZW50c1xuXHRcdGNvbnN0IGJhc2VQYXRoID0gZ2V0Rmlyc3RIZWFkZXIoJ3gtZm9yd2FyZGVkLXByZWZpeCcpIHx8IHRoaXMuX2Jhc2VQYXRoO1xuXG5cdFx0Y29uc3QgcXVlcnlDb25uZWN0aW9uVG9rZW5zID0gcGFyc2VkVXJsLnNlYXJjaFBhcmFtcy5nZXRBbGwoY29ubmVjdGlvblRva2VuUXVlcnlOYW1lKTtcblx0XHRpZiAocXVlcnlDb25uZWN0aW9uVG9rZW5zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0Y29uc3QgcXVlcnlDb25uZWN0aW9uVG9rZW4gPSBxdWVyeUNvbm5lY3Rpb25Ub2tlbnNbMF07XG5cdFx0XHQvLyBXZSBnb3QgYSBjb25uZWN0aW9uIHRva2VuIGFzIGEgcXVlcnkgcGFyYW1ldGVyLlxuXHRcdFx0Ly8gV2Ugd2FudCB0byBoYXZlIGEgY2xlYW4gVVJMLCBzbyB3ZSBzdHJpcCBpdFxuXHRcdFx0Y29uc3QgcmVzcG9uc2VIZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRcdHJlc3BvbnNlSGVhZGVyc1snU2V0LUNvb2tpZSddID0gY29va2llLnNlcmlhbGl6ZShcblx0XHRcdFx0Y29ubmVjdGlvblRva2VuQ29va2llTmFtZSxcblx0XHRcdFx0cXVlcnlDb25uZWN0aW9uVG9rZW4sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzYW1lU2l0ZTogJ2xheCcsXG5cdFx0XHRcdFx0bWF4QWdlOiA2MCAqIDYwICogMjQgKiA3IC8qIDEgd2VlayAqL1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCBuZXdRdWVyeSA9IG5ldyBVUkxTZWFyY2hQYXJhbXMocGFyc2VkVXJsLnNlYXJjaFBhcmFtcyk7XG5cdFx0XHRuZXdRdWVyeS5kZWxldGUoY29ubmVjdGlvblRva2VuUXVlcnlOYW1lKTtcblx0XHRcdGNvbnN0IHF1ZXJ5U3RyaW5nID0gbmV3UXVlcnkudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IG5ld0xvY2F0aW9uID0gcXVlcnlTdHJpbmcgPyBgJHtiYXNlUGF0aH0/JHtxdWVyeVN0cmluZ31gIDogYmFzZVBhdGg7XG5cdFx0XHRyZXNwb25zZUhlYWRlcnNbJ0xvY2F0aW9uJ10gPSBuZXdMb2NhdGlvbjtcblxuXHRcdFx0cmVzLndyaXRlSGVhZCgzMDIsIHJlc3BvbnNlSGVhZGVycyk7XG5cdFx0XHRyZXR1cm4gdm9pZCByZXMuZW5kKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVwbGFjZVBvcnQgPSAoaG9zdDogc3RyaW5nLCBwb3J0OiBzdHJpbmcpID0+IHtcblx0XHRcdGNvbnN0IGluZGV4ID0gaG9zdD8uaW5kZXhPZignOicpO1xuXHRcdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRob3N0ID0gaG9zdD8uc3Vic3RyaW5nKDAsIGluZGV4KTtcblx0XHRcdH1cblx0XHRcdGhvc3QgKz0gYDoke3BvcnR9YDtcblx0XHRcdHJldHVybiBob3N0O1xuXHRcdH07XG5cblx0XHRjb25zdCB1c2VUZXN0UmVzb2x2ZXIgPSAoIXRoaXMuX2Vudmlyb25tZW50U2VydmljZS5pc0J1aWx0ICYmIHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5hcmdzWyd1c2UtdGVzdC1yZXNvbHZlciddKTtcblx0XHRsZXQgcmVtb3RlQXV0aG9yaXR5ID0gKFxuXHRcdFx0dXNlVGVzdFJlc29sdmVyXG5cdFx0XHRcdD8gJ3Rlc3QrdGVzdCdcblx0XHRcdFx0OiAoZ2V0Rmlyc3RIZWFkZXIoJ3gtb3JpZ2luYWwtaG9zdCcpIHx8IGdldEZpcnN0SGVhZGVyKCd4LWZvcndhcmRlZC1ob3N0JykgfHwgcmVxLmhlYWRlcnMuaG9zdClcblx0XHQpO1xuXHRcdGlmICghcmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRyZXR1cm4gc2VydmVFcnJvcihyZXEsIHJlcywgNDAwLCBgQmFkIHJlcXVlc3QuYCk7XG5cdFx0fVxuXHRcdGNvbnN0IGZvcndhcmRlZFBvcnQgPSBnZXRGaXJzdEhlYWRlcigneC1mb3J3YXJkZWQtcG9ydCcpO1xuXHRcdGlmIChmb3J3YXJkZWRQb3J0KSB7XG5cdFx0XHRyZW1vdGVBdXRob3JpdHkgPSByZXBsYWNlUG9ydChyZW1vdGVBdXRob3JpdHksIGZvcndhcmRlZFBvcnQpO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGFzSlNPTih2YWx1ZTogdW5rbm93bik6IHN0cmluZyB7XG5cdFx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkodmFsdWUpLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKTtcblx0XHR9XG5cblx0XHRsZXQgX3dyYXBXZWJXb3JrZXJFeHRIb3N0SW5JZnJhbWU6IHVuZGVmaW5lZCB8IGZhbHNlID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYXJnc1snZW5hYmxlLXNtb2tlLXRlc3QtZHJpdmVyJ10pIHtcblx0XHRcdC8vIGludGVncmF0aW9uIHRlc3RzIHJ1biBhdCBhIHRpbWUgd2hlbiB0aGUgYnVpbHQgb3V0cHV0IGlzIG5vdCB5ZXQgcHVibGlzaGVkIHRvIHRoZSBDRE5cblx0XHRcdC8vIHNvIHdlIG11c3QgZGlzYWJsZSB0aGUgaWZyYW1lIHdyYXBwaW5nIGJlY2F1c2UgdGhlIGlmcmFtZSBVUkwgd2lsbCBnaXZlIGEgNDA0XG5cdFx0XHRfd3JhcFdlYldvcmtlckV4dEhvc3RJbklmcmFtZSA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9sb2dTZXJ2aWNlLmdldExldmVsKCkgPT09IExvZ0xldmVsLlRyYWNlKSB7XG5cdFx0XHRbJ3gtb3JpZ2luYWwtaG9zdCcsICd4LWZvcndhcmRlZC1ob3N0JywgJ3gtZm9yd2FyZGVkLXBvcnQnLCAnaG9zdCddLmZvckVhY2goaGVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBnZXRGaXJzdEhlYWRlcihoZWFkZXIpO1xuXHRcdFx0XHRpZiAodmFsdWUpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbV2ViQ2xpZW50U2VydmVyXSAke2hlYWRlcn06ICR7dmFsdWV9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW1dlYkNsaWVudFNlcnZlcl0gUmVxdWVzdCBVUkw6ICR7cmVxLnVybH0sIGJhc2VQYXRoOiAke2Jhc2VQYXRofSwgcmVtb3RlQXV0aG9yaXR5OiAke3JlbW90ZUF1dGhvcml0eX1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0aWNSb3V0ZSA9IHBvc2l4LmpvaW4oYmFzZVBhdGgsIHRoaXMuX3Byb2R1Y3RQYXRoLCBTVEFUSUNfUEFUSCk7XG5cdFx0Y29uc3QgY2FsbGJhY2tSb3V0ZSA9IHBvc2l4LmpvaW4oYmFzZVBhdGgsIHRoaXMuX3Byb2R1Y3RQYXRoLCBDQUxMQkFDS19QQVRIKTtcblx0XHRjb25zdCB3ZWJFeHRlbnNpb25Sb3V0ZSA9IHBvc2l4LmpvaW4oYmFzZVBhdGgsIHRoaXMuX3Byb2R1Y3RQYXRoLCBXRUJfRVhURU5TSU9OX1BBVEgpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZVdvcmtzcGFjZVVSSSA9IChkZWZhdWx0TG9jYXRpb24/OiBzdHJpbmcpID0+IGRlZmF1bHRMb2NhdGlvbiAmJiBVUkkuZmlsZShyZXNvbHZlKGRlZmF1bHRMb2NhdGlvbikpLndpdGgoeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlUmVtb3RlLCBhdXRob3JpdHk6IHJlbW90ZUF1dGhvcml0eSB9KTtcblxuXHRcdGNvbnN0IGZpbGVQYXRoID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoYHZzL2NvZGUvYnJvd3Nlci93b3JrYmVuY2gvd29ya2JlbmNoJHt0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCA/ICcnIDogJy1kZXYnfS5odG1sYCkuZnNQYXRoO1xuXHRcdGNvbnN0IGF1dGhTZXNzaW9uSW5mbyA9ICF0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCAmJiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYXJnc1snZ2l0aHViLWF1dGgnXSA/IHtcblx0XHRcdGlkOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdHByb3ZpZGVySWQ6ICdnaXRodWInLFxuXHRcdFx0YWNjZXNzVG9rZW46IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5hcmdzWydnaXRodWItYXV0aCddLFxuXHRcdFx0c2NvcGVzOiBbWyd1c2VyOmVtYWlsJ10sIFsncmVwbyddXVxuXHRcdH0gOiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBwcm9kdWN0Q29uZmlndXJhdGlvbjogUGFydGlhbDxNdXRhYmxlPElQcm9kdWN0Q29uZmlndXJhdGlvbj4+ID0ge1xuXHRcdFx0ZW1iZWRkZXJJZGVudGlmaWVyOiAnc2VydmVyLWRpc3RybycsXG5cdFx0XHR2b2ljZVdzVXJsOiB0aGlzLl9wcm9kdWN0U2VydmljZS52b2ljZVdzVXJsLFxuXHRcdFx0ZXh0ZW5zaW9uc0dhbGxlcnk6IHRoaXMuX3dlYkV4dGVuc2lvblJlc291cmNlVXJsVGVtcGxhdGUgJiYgdGhpcy5fcHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uc0dhbGxlcnkgPyB7XG5cdFx0XHRcdC4uLnRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmV4dGVuc2lvbnNHYWxsZXJ5LFxuXHRcdFx0XHRyZXNvdXJjZVVybFRlbXBsYXRlOiB0aGlzLl93ZWJFeHRlbnNpb25SZXNvdXJjZVVybFRlbXBsYXRlLndpdGgoe1xuXHRcdFx0XHRcdHNjaGVtZTogJ2h0dHAnLFxuXHRcdFx0XHRcdGF1dGhvcml0eTogcmVtb3RlQXV0aG9yaXR5LFxuXHRcdFx0XHRcdHBhdGg6IGAke3dlYkV4dGVuc2lvblJvdXRlfS8ke3RoaXMuX3dlYkV4dGVuc2lvblJlc291cmNlVXJsVGVtcGxhdGUuYXV0aG9yaXR5fSR7dGhpcy5fd2ViRXh0ZW5zaW9uUmVzb3VyY2VVcmxUZW1wbGF0ZS5wYXRofWBcblx0XHRcdFx0fSkudG9TdHJpbmcodHJ1ZSlcblx0XHRcdH0gOiB1bmRlZmluZWRcblx0XHR9O1xuXG5cdFx0aWYgKCF0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcHJvZHVjdE92ZXJyaWRlcyA9IEpTT04ucGFyc2UoKGF3YWl0IHByb21pc2VzLnJlYWRGaWxlKGpvaW4oQVBQX1JPT1QsICdwcm9kdWN0Lm92ZXJyaWRlcy5qc29uJykpKS50b1N0cmluZygpKTtcblx0XHRcdFx0T2JqZWN0LmFzc2lnbihwcm9kdWN0Q29uZmlndXJhdGlvbiwgcHJvZHVjdE92ZXJyaWRlcyk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHsvKiBJZ25vcmUgRXJyb3IgKi8gfVxuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtiZW5jaFdlYkNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRyZW1vdGVBdXRob3JpdHksXG5cdFx0XHRzZXJ2ZXJCYXNlUGF0aDogYmFzZVBhdGgsXG5cdFx0XHRfd3JhcFdlYldvcmtlckV4dEhvc3RJbklmcmFtZSxcblx0XHRcdGRldmVsb3BtZW50T3B0aW9uczogeyBlbmFibGVTbW9rZVRlc3REcml2ZXI6IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5hcmdzWydlbmFibGUtc21va2UtdGVzdC1kcml2ZXInXSA/IHRydWUgOiB1bmRlZmluZWQsIGxvZ0xldmVsOiB0aGlzLl9sb2dTZXJ2aWNlLmdldExldmVsKCkgfSxcblx0XHRcdHNldHRpbmdzU3luY09wdGlvbnM6ICF0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCAmJiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYXJnc1snZW5hYmxlLXN5bmMnXSA/IHsgZW5hYmxlZDogdHJ1ZSB9IDogdW5kZWZpbmVkLFxuXHRcdFx0ZW5hYmxlV29ya3NwYWNlVHJ1c3Q6ICF0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYXJnc1snZGlzYWJsZS13b3Jrc3BhY2UtdHJ1c3QnXSxcblx0XHRcdGVuYWJsZWRFeHRlbnNpb25Qcm9wb3NlZEFwaTogdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3NbJ2VuYWJsZS1wcm9wb3NlZC1hcGknXSxcblx0XHRcdGZvbGRlclVyaTogcmVzb2x2ZVdvcmtzcGFjZVVSSSh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYXJnc1snZGVmYXVsdC1mb2xkZXInXSksXG5cdFx0XHR3b3Jrc3BhY2VVcmk6IHJlc29sdmVXb3Jrc3BhY2VVUkkodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3NbJ2RlZmF1bHQtd29ya3NwYWNlJ10pLFxuXHRcdFx0cHJvZHVjdENvbmZpZ3VyYXRpb24sXG5cdFx0XHRjYWxsYmFja1JvdXRlOiBjYWxsYmFja1JvdXRlXG5cdFx0fTtcblxuXHRcdGNvbnN0IGNvb2tpZXMgPSBjb29raWUucGFyc2UocmVxLmhlYWRlcnMuY29va2llIHx8ICcnKTtcblx0XHRjb25zdCBsb2NhbGUgPSBjb29raWVzWyd2c2NvZGUubmxzLmxvY2FsZSddIHx8IHJlcS5oZWFkZXJzWydhY2NlcHQtbGFuZ3VhZ2UnXT8uc3BsaXQoJywnKVswXT8udG9Mb3dlckNhc2UoKSB8fCAnZW4nO1xuXHRcdGxldCBXT1JLQkVOQ0hfTkxTX0JBU0VfVVJMOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IFdPUktCRU5DSF9OTFNfVVJMOiBzdHJpbmc7XG5cdFx0aWYgKCFsb2NhbGUuc3RhcnRzV2l0aCgnZW4nKSAmJiB0aGlzLl9wcm9kdWN0U2VydmljZS5ubHNDb3JlQmFzZVVybCkge1xuXHRcdFx0V09SS0JFTkNIX05MU19CQVNFX1VSTCA9IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLm5sc0NvcmVCYXNlVXJsO1xuXHRcdFx0V09SS0JFTkNIX05MU19VUkwgPSBgJHtXT1JLQkVOQ0hfTkxTX0JBU0VfVVJMfSR7dGhpcy5fcHJvZHVjdFNlcnZpY2UuY29tbWl0fS8ke3RoaXMuX3Byb2R1Y3RTZXJ2aWNlLnZlcnNpb259LyR7bG9jYWxlfS9ubHMubWVzc2FnZXMuanNgO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRXT1JLQkVOQ0hfTkxTX1VSTCA9ICcnOyAvLyBmYWxsYmFjayB3aWxsIGFwcGx5XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmFsdWVzOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9ID0ge1xuXHRcdFx0V09SS0JFTkNIX1dFQl9DT05GSUdVUkFUSU9OOiBhc0pTT04od29ya2JlbmNoV2ViQ29uZmlndXJhdGlvbiksXG5cdFx0XHRXT1JLQkVOQ0hfQVVUSF9TRVNTSU9OOiBhdXRoU2Vzc2lvbkluZm8gPyBhc0pTT04oYXV0aFNlc3Npb25JbmZvKSA6ICcnLFxuXHRcdFx0V09SS0JFTkNIX1dFQl9CQVNFX1VSTDogc3RhdGljUm91dGUsXG5cdFx0XHRXT1JLQkVOQ0hfTkxTX1VSTCxcblx0XHRcdFdPUktCRU5DSF9OTFNfRkFMTEJBQ0tfVVJMOiBgJHtzdGF0aWNSb3V0ZX0vb3V0L25scy5tZXNzYWdlcy5qc2Bcblx0XHR9O1xuXG5cdFx0Ly8gREVWIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHRcdC8vIERFVjogVGhpcyBpcyBmb3IgZGV2ZWxvcG1lbnQgYW5kIGVuYWJsZXMgbG9hZGluZyBDU1MgdmlhIGltcG9ydC1zdGF0ZW1lbnRzIHZpYSBpbXBvcnQtbWFwcy5cblx0XHQvLyBERVY6IFRoZSBzZXJ2ZXIgbmVlZHMgdG8gc2VuZCBhbG9uZyBhbGwgQ1NTIG1vZHVsZXMgc28gdGhhdCB0aGUgY2xpZW50IGNhbiBjb25zdHJ1Y3QgdGhlXG5cdFx0Ly8gREVWOiBpbXBvcnQtbWFwLlxuXHRcdC8vIERFViAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0XHRpZiAodGhpcy5fY3NzRGV2U2VydmljZS5pc0VuYWJsZWQpIHtcblx0XHRcdGNvbnN0IGNzc01vZHVsZXMgPSBhd2FpdCB0aGlzLl9jc3NEZXZTZXJ2aWNlLmdldENzc01vZHVsZXMoKTtcblx0XHRcdHZhbHVlc1snV09SS0JFTkNIX0RFVl9DU1NfTU9EVUxFUyddID0gSlNPTi5zdHJpbmdpZnkoY3NzTW9kdWxlcyk7XG5cdFx0fVxuXG5cdFx0aWYgKHVzZVRlc3RSZXNvbHZlcikge1xuXHRcdFx0Y29uc3QgYnVuZGxlZEV4dGVuc2lvbnM6IHsgZXh0ZW5zaW9uUGF0aDogc3RyaW5nOyBwYWNrYWdlSlNPTjogSUV4dGVuc2lvbk1hbmlmZXN0IH1bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb25QYXRoIG9mIFsndnNjb2RlLXRlc3QtcmVzb2x2ZXInLCAnZ2l0aHViLWF1dGhlbnRpY2F0aW9uJ10pIHtcblx0XHRcdFx0Y29uc3QgcGFja2FnZUpTT04gPSBKU09OLnBhcnNlKChhd2FpdCBwcm9taXNlcy5yZWFkRmlsZShGaWxlQWNjZXNzLmFzRmlsZVVyaShgJHtidWlsdGluRXh0ZW5zaW9uc1BhdGh9LyR7ZXh0ZW5zaW9uUGF0aH0vcGFja2FnZS5qc29uYCkuZnNQYXRoKSkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGJ1bmRsZWRFeHRlbnNpb25zLnB1c2goeyBleHRlbnNpb25QYXRoLCBwYWNrYWdlSlNPTiB9KTtcblx0XHRcdH1cblx0XHRcdHZhbHVlc1snV09SS0JFTkNIX0JVSUxUSU5fRVhURU5TSU9OUyddID0gYXNKU09OKGJ1bmRsZWRFeHRlbnNpb25zKTtcblx0XHR9XG5cblx0XHRsZXQgZGF0YTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgd29ya2JlbmNoVGVtcGxhdGUgPSAoYXdhaXQgcHJvbWlzZXMucmVhZEZpbGUoZmlsZVBhdGgpKS50b1N0cmluZygpO1xuXHRcdFx0ZGF0YSA9IHdvcmtiZW5jaFRlbXBsYXRlLnJlcGxhY2UoL1xce1xceyhbXn1dKylcXH1cXH0vZywgKF8sIGtleSkgPT4gdmFsdWVzW2tleV0gPz8gJ3VuZGVmaW5lZCcpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHJlcy53cml0ZUhlYWQoNDA0LCB7ICdDb250ZW50LVR5cGUnOiAndGV4dC9wbGFpbicgfSk7XG5cdFx0XHRyZXR1cm4gdm9pZCByZXMuZW5kKCdOb3QgZm91bmQnKTtcblx0XHR9XG5cblx0XHRjb25zdCB3ZWJXb3JrZXJFeHRlbnNpb25Ib3N0SWZyYW1lU2NyaXB0U0hBID0gJ3NoYTI1Ni1kYUVnZm8yVklYcHgyTnA3MUtxQ0Nia2VRd3YrNjh2UHJ4NTRYUmNiZGNzPSc7XG5cblx0XHRjb25zdCBjc3BEaXJlY3RpdmVzID0gW1xuXHRcdFx0J2RlZmF1bHQtc3JjIFxcJ3NlbGZcXCc7Jyxcblx0XHRcdCdpbWctc3JjIFxcJ3NlbGZcXCcgaHR0cHM6IGRhdGE6IGJsb2I6OycsXG5cdFx0XHQnbWVkaWEtc3JjIFxcJ3NlbGZcXCc7Jyxcblx0XHRcdGBzY3JpcHQtc3JjICdzZWxmJyAndW5zYWZlLWV2YWwnICR7V09SS0JFTkNIX05MU19CQVNFX1VSTCA/PyAnJ30gYmxvYjogJ25vbmNlLTFubGluZS1tNHAnICR7dGhpcy5fZ2V0U2NyaXB0Q3NwSGFzaGVzKGRhdGEpLmpvaW4oJyAnKX0gJyR7d2ViV29ya2VyRXh0ZW5zaW9uSG9zdElmcmFtZVNjcmlwdFNIQX0nICdzaGEyNTYtL3I3cnFRK3lyeHQ1N3N4THVRNkFNWWN5L2xVcHZBSXpIaklKdC9PZUxXVT0nICR7dXNlVGVzdFJlc29sdmVyID8gJycgOiBgaHR0cDovLyR7cmVtb3RlQXV0aG9yaXR5fWB9O2AsICAvLyB0aGUgc2hhIGlzIHRoZSBzYW1lIGFzIGluIHNyYy92cy93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9ucy93b3JrZXIvd2ViV29ya2VyRXh0ZW5zaW9uSG9zdElmcmFtZS5odG1sXG5cdFx0XHQnY2hpbGQtc3JjIFxcJ3NlbGZcXCc7Jyxcblx0XHRcdGBmcmFtZS1zcmMgJ3NlbGYnIGh0dHBzOi8vKi52c2NvZGUtY2RuLm5ldCBkYXRhOjtgLFxuXHRcdFx0J3dvcmtlci1zcmMgXFwnc2VsZlxcJyBkYXRhOiBibG9iOjsnLFxuXHRcdFx0J3N0eWxlLXNyYyBcXCdzZWxmXFwnIFxcJ3Vuc2FmZS1pbmxpbmVcXCc7Jyxcblx0XHRcdCdjb25uZWN0LXNyYyBcXCdzZWxmXFwnIHdzOiB3c3M6IGh0dHBzOjsnLFxuXHRcdFx0J2ZvbnQtc3JjIFxcJ3NlbGZcXCcgYmxvYjo7Jyxcblx0XHRcdCdtYW5pZmVzdC1zcmMgXFwnc2VsZlxcJzsnXG5cdFx0XS5qb2luKCcgJyk7XG5cblx0XHRjb25zdCBoZWFkZXJzOiBodHRwLk91dGdvaW5nSHR0cEhlYWRlcnMgPSB7XG5cdFx0XHQnQ29udGVudC1UeXBlJzogJ3RleHQvaHRtbCcsXG5cdFx0XHQnQ29udGVudC1TZWN1cml0eS1Qb2xpY3knOiBjc3BEaXJlY3RpdmVzXG5cdFx0fTtcblx0XHRpZiAodGhpcy5fY29ubmVjdGlvblRva2VuLnR5cGUgIT09IFNlcnZlckNvbm5lY3Rpb25Ub2tlblR5cGUuTm9uZSkge1xuXHRcdFx0Ly8gQXQgdGhpcyBwb2ludCB3ZSBrbm93IHRoZSBjbGllbnQgaGFzIGEgdmFsaWQgY29va2llXG5cdFx0XHQvLyBhbmQgd2Ugd2FudCB0byBzZXQgaXQgcHJvbG9uZyBpdCB0byBlbnN1cmUgdGhhdCB0aGlzXG5cdFx0XHQvLyBjbGllbnQgaXMgdmFsaWQgZm9yIGFub3RoZXIgMSB3ZWVrIGF0IGxlYXN0XG5cdFx0XHRoZWFkZXJzWydTZXQtQ29va2llJ10gPSBjb29raWUuc2VyaWFsaXplKFxuXHRcdFx0XHRjb25uZWN0aW9uVG9rZW5Db29raWVOYW1lLFxuXHRcdFx0XHR0aGlzLl9jb25uZWN0aW9uVG9rZW4udmFsdWUsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzYW1lU2l0ZTogJ2xheCcsXG5cdFx0XHRcdFx0bWF4QWdlOiA2MCAqIDYwICogMjQgKiA3IC8qIDEgd2VlayAqL1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHJlcy53cml0ZUhlYWQoMjAwLCBoZWFkZXJzKTtcblx0XHRyZXR1cm4gdm9pZCByZXMuZW5kKGRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U2NyaXB0Q3NwSGFzaGVzKGNvbnRlbnQ6IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0XHQvLyBDb21wdXRlIHRoZSBDU1AgaGFzaGVzIGZvciBsaW5lIHNjcmlwdHMuIFVzZXMgcmVnZXhcblx0XHQvLyB3aGljaCBtZWFucyBpdCBpc24ndCAxMDAlIGdvb2QuXG5cdFx0Y29uc3QgcmVnZXggPSAvPHNjcmlwdD4oW1xcc1xcU10rPyk8XFwvc2NyaXB0Pi9pbWc7XG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBtYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblx0XHR3aGlsZSAobWF0Y2ggPSByZWdleC5leGVjKGNvbnRlbnQpKSB7XG5cdFx0XHRjb25zdCBoYXNoZXIgPSBjcnlwdG8uY3JlYXRlSGFzaCgnc2hhMjU2Jyk7XG5cdFx0XHQvLyBUaGlzIG9ubHkgd29ya3Mgb24gV2luZG93cyBpZiB3ZSBzdHJpcCBgXFxyYCBmcm9tIGBcXHJcXG5gLlxuXHRcdFx0Y29uc3Qgc2NyaXB0ID0gbWF0Y2hbMV0ucmVwbGFjZSgvXFxyXFxuL2csICdcXG4nKTtcblx0XHRcdGNvbnN0IGhhc2ggPSBoYXNoZXJcblx0XHRcdFx0LnVwZGF0ZShCdWZmZXIuZnJvbShzY3JpcHQpKVxuXHRcdFx0XHQuZGlnZXN0KCkudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuXG5cdFx0XHRyZXN1bHQucHVzaChgJ3NoYTI1Ni0ke2hhc2h9J2ApO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZSBIVFRQIHJlcXVlc3RzIGZvciAvY2FsbGJhY2tcblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZUNhbGxiYWNrKHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZpbGVQYXRoID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL2NvZGUvYnJvd3Nlci93b3JrYmVuY2gvY2FsbGJhY2suaHRtbCcpLmZzUGF0aDtcblx0XHRjb25zdCBkYXRhID0gKGF3YWl0IHByb21pc2VzLnJlYWRGaWxlKGZpbGVQYXRoKSkudG9TdHJpbmcoKTtcblx0XHRjb25zdCBjc3BEaXJlY3RpdmVzID0gW1xuXHRcdFx0J2RlZmF1bHQtc3JjIFxcJ3NlbGZcXCc7Jyxcblx0XHRcdCdpbWctc3JjIFxcJ3NlbGZcXCcgaHR0cHM6IGRhdGE6IGJsb2I6OycsXG5cdFx0XHQnbWVkaWEtc3JjIFxcJ25vbmVcXCc7Jyxcblx0XHRcdGBzY3JpcHQtc3JjICdzZWxmJyAke3RoaXMuX2dldFNjcmlwdENzcEhhc2hlcyhkYXRhKS5qb2luKCcgJyl9O2AsXG5cdFx0XHQnc3R5bGUtc3JjIFxcJ3NlbGZcXCcgXFwndW5zYWZlLWlubGluZVxcJzsnLFxuXHRcdFx0J2ZvbnQtc3JjIFxcJ3NlbGZcXCcgYmxvYjo7J1xuXHRcdF0uam9pbignICcpO1xuXG5cdFx0cmVzLndyaXRlSGVhZCgyMDAsIHtcblx0XHRcdCdDb250ZW50LVR5cGUnOiAndGV4dC9odG1sJyxcblx0XHRcdCdDb250ZW50LVNlY3VyaXR5LVBvbGljeSc6IGNzcERpcmVjdGl2ZXNcblx0XHR9KTtcblx0XHRyZXR1cm4gdm9pZCByZXMuZW5kKGRhdGEpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCLGdCQUFnQjtBQUUzQyxZQUFZLFlBQVk7QUFDeEIsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWEsZ0JBQWdCO0FBQ3RDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsU0FBUyxTQUFTLE1BQU0sV0FBVyxPQUFPLGVBQWU7QUFDbEUsU0FBUyxZQUFZLDJCQUEyQiwwQkFBMEIsU0FBUyw2QkFBNkI7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QywyREFBMkQsa0JBQWtCLEtBQUssVUFBVSxlQUFlLEVBQUU7QUFBQTtBQUFBLE1BQzNSO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxFQUFFLEtBQUssR0FBRztBQUVWLFVBQU0sVUFBb0M7QUFBQSxNQUN6QyxnQkFBZ0I7QUFBQSxNQUNoQiwyQkFBMkI7QUFBQSxJQUM1QjtBQUNBLFFBQUksS0FBSyxpQkFBaUIsU0FBUywwQkFBMEIsTUFBTTtBQUlsRSxjQUFRLFlBQVksSUFBSSxPQUFPO0FBQUEsUUFDOUI7QUFBQSxRQUNBLEtBQUssaUJBQWlCO0FBQUEsUUFDdEI7QUFBQSxVQUNDLFVBQVU7QUFBQSxVQUNWLFFBQVEsS0FBSyxLQUFLLEtBQUs7QUFBQTtBQUFBLFFBQ3hCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLFVBQVUsS0FBSyxPQUFPO0FBQzFCLFdBQU8sS0FBSyxJQUFJLElBQUksSUFBSTtBQUFBLEVBQ3pCO0FBQUEsRUFFUSxvQkFBb0IsU0FBMkI7QUFHdEQsVUFBTSxRQUFRO0FBQ2QsVUFBTSxTQUFtQixDQUFDO0FBQzFCLFFBQUk7QUFDSixXQUFPLFFBQVEsTUFBTSxLQUFLLE9BQU8sR0FBRztBQUNuQyxZQUFNLFNBQVMsT0FBTyxXQUFXLFFBQVE7QUFFekMsWUFBTSxTQUFTLE1BQU0sQ0FBQyxFQUFFLFFBQVEsU0FBUyxJQUFJO0FBQzdDLFlBQU0sT0FBTyxPQUNYLE9BQU8sT0FBTyxLQUFLLE1BQU0sQ0FBQyxFQUMxQixPQUFPLEVBQUUsU0FBUyxRQUFRO0FBRTVCLGFBQU8sS0FBSyxXQUFXLElBQUksR0FBRztBQUFBLElBQy9CO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE1BQWMsZ0JBQWdCLEtBQXlDO0FBQ3RFLFVBQU0sV0FBVyxXQUFXLFVBQVUseUNBQXlDLEVBQUU7QUFDakYsVUFBTSxRQUFRLE1BQU0sU0FBUyxTQUFTLFFBQVEsR0FBRyxTQUFTO0FBQzFELFVBQU0sZ0JBQWdCO0FBQUEsTUFDckI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EscUJBQXFCLEtBQUssb0JBQW9CLElBQUksRUFBRSxLQUFLLEdBQUcsQ0FBQztBQUFBLE1BQzdEO0FBQUEsTUFDQTtBQUFBLElBQ0QsRUFBRSxLQUFLLEdBQUc7QUFFVixRQUFJLFVBQVUsS0FBSztBQUFBLE1BQ2xCLGdCQUFnQjtBQUFBLE1BQ2hCLDJCQUEyQjtBQUFBLElBQzVCLENBQUM7QUFDRCxXQUFPLEtBQUssSUFBSSxJQUFJLElBQUk7QUFBQSxFQUN6QjtBQUNEO0FBMVlhLGtCQUFOO0FBQUEsRUFRSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVpVOyIsCiAgIm5hbWVzIjogWyJDYWNoZUNvbnRyb2wiLCAicmVzb2x2ZSJdCn0K
