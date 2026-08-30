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
import { spawn } from "child_process";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "../../../../base/common/path.js";
import { isWindows } from "../../../../base/common/platform.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ILogService } from "../../../log/common/log.js";
import { INativeEnvironmentService } from "../../../environment/common/environment.js";
import { CODEX_MODELS_ROOT_CONFIG_KEY, normalizeCodexModelsConfig } from "../../common/codexModelsConfig.js";
import {
  DEEPSEEK_ACCOUNT_SECRET_RESOURCE,
  GROK_ACCOUNT_SECRET_RESOURCE,
  vendorAccountMetaKey,
  vendorAccountSignInRequestKey,
  vendorAccountSignOutRequestKey
} from "../../common/forgeVendorAccount.js";
import {
  officialCardsEqual,
  officialModelCardSpec,
  removeOfficialModelProvider,
  upsertOfficialModelProvider
} from "../../common/officialModelCards.js";
import { IAgentHostProxyResolver } from "../agentHostProxyResolver.js";
import { grokAuthPath, grokLoginUrl, grokNetworkErrorMessage, pollGrokDeviceToken, requestGrokDeviceCode, resolveGrokFetch, writeGrokOidcAuth } from "./grokDeviceLogin.js";
import { IAgentConfigurationService } from "../agentConfigurationService.js";
import { getVendorAccountSecret, setVendorAccountSecret } from "./vendorAccountSecrets.js";
import { findGrokBuildBinary, resolveSpawnCommand } from "./workerRuntime.js";
let ForgeVendorAccountHost = class extends Disposable {
  constructor(_configuration, _logService, _environment, _proxyResolver) {
    super();
    this._configuration = _configuration;
    this._logService = _logService;
    this._environment = _environment;
    this._proxyResolver = _proxyResolver;
    this._grokLoginEpoch = 0;
    this._register(this._configuration.onDidRootConfigChange(() => this._onRootConfig()));
    void this._restoreExistingSessions();
  }
  static consumeAuthenticate(resource, token) {
    if (resource === GROK_ACCOUNT_SECRET_RESOURCE) {
      setVendorAccountSecret("grok", token || void 0);
      return true;
    }
    if (resource === DEEPSEEK_ACCOUNT_SECRET_RESOURCE) {
      setVendorAccountSecret("deepseek", token || void 0);
      return true;
    }
    return false;
  }
  _onRootConfig() {
    const values = this._configuration.getRootConfigValues?.() ?? {};
    this._handleRequest("grok", values[vendorAccountSignInRequestKey("grok")], values[vendorAccountSignOutRequestKey("grok")]);
    this._handleRequest("deepseek", values[vendorAccountSignInRequestKey("deepseek")], values[vendorAccountSignOutRequestKey("deepseek")]);
  }
  _handleRequest(kind, signIn, signOut) {
    if (typeof signIn === "string" && signIn !== this._signInCursor(kind)) {
      this._setSignInCursor(kind, signIn);
      this._configuration.updateRootConfig({ [vendorAccountSignInRequestKey(kind)]: void 0 });
      void this._signIn(kind, signIn);
    }
    if (typeof signOut === "string" && signOut !== this._signOutCursor(kind)) {
      this._setSignOutCursor(kind, signOut);
      this._configuration.updateRootConfig({ [vendorAccountSignOutRequestKey(kind)]: void 0 });
      void this._signOut(kind);
    }
  }
  _signInCursor(kind) {
    return kind === "grok" ? this._lastGrokSignIn : this._lastDeepSeekSignIn;
  }
  _signOutCursor(kind) {
    return kind === "grok" ? this._lastGrokSignOut : this._lastDeepSeekSignOut;
  }
  _setSignInCursor(kind, value) {
    if (kind === "grok") {
      this._lastGrokSignIn = value;
    } else {
      this._lastDeepSeekSignIn = value;
    }
  }
  _setSignOutCursor(kind, value) {
    if (kind === "grok") {
      this._lastGrokSignOut = value;
    } else {
      this._lastDeepSeekSignOut = value;
    }
  }
  async _restoreExistingSessions() {
    const grok = readGrokAuth(this._userHome());
    if (grok || getVendorAccountSecret("grok")) {
      await this._completeLogin("grok", grok?.email ?? "Grok", grok?.planType);
    }
    const deepseekKey = getVendorAccountSecret("deepseek") || readDeepSeekCredentials(this._userHome());
    if (deepseekKey) {
      if (!getVendorAccountSecret("deepseek")) {
        setVendorAccountSecret("deepseek", deepseekKey);
      }
      await this._completeLogin("deepseek", "DeepSeek");
    }
  }
  async _signIn(kind, request) {
    const epoch = kind === "grok" ? ++this._grokLoginEpoch : this._grokLoginEpoch;
    this._publish(kind, { status: "signingIn" });
    try {
      if (kind === "deepseek") {
        const apiKey2 = getVendorAccountSecret("deepseek");
        if (!apiKey2) {
          this._publish(kind, { status: "error", error: "\u8BF7\u5148\u586B\u5199 DeepSeek API \u5BC6\u94A5\u3002" });
          return;
        }
        writeDeepSeekCredentials(this._userHome(), apiKey2);
        await this._completeLogin("deepseek", "DeepSeek");
        return;
      }
      const apiKey = getVendorAccountSecret("grok");
      if (apiKey) {
        await this._completeLogin("grok", "Grok");
        return;
      }
      const existing = readGrokAuth(this._userHome());
      if (existing) {
        await this._completeLogin("grok", existing.email, existing.planType);
        return;
      }
      await this._runGrokBrowserLogin(request, epoch);
    } catch (error) {
      if (kind === "grok" && epoch !== this._grokLoginEpoch) {
        return;
      }
      const message = grokNetworkErrorMessage(error);
      this._logService.warn(`[ForgeAccount] ${kind} sign-in failed: ${message}`);
      this._publish(kind, { status: "error", error: message });
    }
  }
  async _signOut(kind) {
    if (kind === "grok") {
      this._grokLoginEpoch++;
      this._grokLoginAbort?.abort();
      this._grokLoginAbort = void 0;
      setVendorAccountSecret("grok", void 0);
      void spawnDetached(resolveGrokLoginCommand(this._environment.appRoot)?.command, ["logout"]);
    } else {
      setVendorAccountSecret("deepseek", void 0);
      writeDeepSeekCredentials(this._userHome(), void 0);
    }
    this._setOfficialCard(kind, false, []);
    this._publish(kind, { status: "signedOut" });
  }
  async _runGrokBrowserLogin(request, epoch) {
    this._grokLoginAbort?.abort();
    this._grokLoginAbort = new AbortController();
    const abort = this._grokLoginAbort.signal;
    const fetchImpl = await resolveGrokFetch((input, init) => this._proxyResolver.fetch(input, init ?? {}));
    const device = await requestGrokDeviceCode(fetchImpl, abort);
    if (epoch !== this._grokLoginEpoch) {
      return;
    }
    this._publish("grok", {
      status: "signingIn",
      authUrl: grokLoginUrl(device),
      authUrlNonce: request,
      userCode: device.userCode
    });
    const tokens = await pollGrokDeviceToken(fetchImpl, device, abort);
    if (epoch !== this._grokLoginEpoch) {
      return;
    }
    const saved = writeGrokOidcAuth(this._userHome(), tokens);
    await this._completeLogin("grok", saved.email ?? "Grok");
  }
  async _completeLogin(kind, email, planType) {
    const models = await fetchOfficialVendorModels(kind, this._apiKeyFor(kind));
    this._setOfficialCard(kind, true, models);
    this._publish(kind, {
      status: "signedIn",
      email,
      planType
    });
  }
  _apiKeyFor(kind) {
    if (kind === "grok") {
      return getVendorAccountSecret("grok") || readGrokAuth(this._userHome())?.key;
    }
    return getVendorAccountSecret("deepseek") || readDeepSeekCredentials(this._userHome());
  }
  _setOfficialCard(kind, signedIn, models) {
    const current = normalizeCodexModelsConfig(this._configuration.getRootConfigValues?.()?.[CODEX_MODELS_ROOT_CONFIG_KEY]);
    const next = signedIn ? upsertOfficialModelProvider(current, kind, models) : removeOfficialModelProvider(current, kind);
    if (officialCardsEqual(current, next)) {
      return;
    }
    this._configuration.updateRootConfig({ [CODEX_MODELS_ROOT_CONFIG_KEY]: next });
  }
  _publish(kind, account) {
    this._configuration.publishRootTransientValues?.({ [vendorAccountMetaKey(kind)]: account });
  }
  _userHome() {
    return this._environment.userHome?.fsPath || homedir();
  }
};
ForgeVendorAccountHost = __decorateClass([
  __decorateParam(0, IAgentConfigurationService),
  __decorateParam(1, ILogService),
  __decorateParam(2, INativeEnvironmentService),
  __decorateParam(3, IAgentHostProxyResolver)
], ForgeVendorAccountHost);
async function fetchOfficialVendorModels(kind, apiKey) {
  const spec = officialModelCardSpec(kind);
  if (!apiKey) {
    return spec.fallbackModels;
  }
  const base = spec.defaultBaseUrl.replace(/\/$/, "");
  const urls = kind === "grok" ? [`${base}/language-models`, `${base}/models`] : [`${base}/models`];
  for (const url of urls) {
    try {
      const names = parseModelCatalog(await fetchJson(url, apiKey));
      if (names.length > 0) {
        return names;
      }
    } catch {
      continue;
    }
  }
  return spec.fallbackModels;
}
function parseModelCatalog(body) {
  const record = body && typeof body === "object" ? body : {};
  const raw = Array.isArray(record.data) ? record.data : Array.isArray(record.models) ? record.models : Array.isArray(body) ? body : [];
  const names = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of raw) {
    const id = typeof item === "string" ? item : item && typeof item === "object" ? String(item.id ?? item.name ?? "") : "";
    const name = id.trim();
    if (name === "" || seen.has(name)) {
      continue;
    }
    seen.add(name);
    names.push(name);
  }
  return names;
}
async function fetchJson(url, apiKey) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`${url} ${response.status}`);
  }
  return response.json();
}
function readGrokAuth(userHome) {
  try {
    const raw = JSON.parse(readFileSync(grokAuthPath(userHome), "utf8"));
    for (const value of Object.values(raw)) {
      if (!value || typeof value !== "object") {
        continue;
      }
      const entry = value;
      if (typeof entry.key !== "string" || entry.key.trim() === "") {
        continue;
      }
      return {
        key: entry.key,
        email: typeof entry.email === "string" ? entry.email : void 0,
        planType: typeof entry.team_name === "string" ? entry.team_name : typeof entry.auth_mode === "string" ? entry.auth_mode : void 0
      };
    }
  } catch {
    return void 0;
  }
  return void 0;
}
function deepSeekCredentialsPath(userHome) {
  return join(process.env.DSH_HOME || join(userHome, ".dsh"), ".credentials.yaml");
}
function readDeepSeekCredentials(userHome) {
  try {
    const text = readFileSync(deepSeekCredentialsPath(userHome), "utf8");
    const match = text.match(/^\s*DEEPSEEK_API_KEY\s*:\s*(.+)\s*$/m);
    const value = match?.[1]?.trim().replace(/^['"]|['"]$/g, "");
    return value || void 0;
  } catch {
    return void 0;
  }
}
function writeDeepSeekCredentials(userHome, apiKey) {
  const path = deepSeekCredentialsPath(userHome);
  mkdirSync(join(path, ".."), { recursive: true });
  if (!apiKey) {
    try {
      const current = readFileSync(path, "utf8");
      writeFileSync(path, `${current.replace(/^\s*DEEPSEEK_API_KEY\s*:.*$/m, "").trim()}
`, "utf8");
    } catch {
      return;
    }
    return;
  }
  writeFileSync(path, `DEEPSEEK_API_KEY: ${JSON.stringify(apiKey)}
`, "utf8");
}
function resolveGrokLoginCommand(repoRoot) {
  const built = findGrokBuildBinary(repoRoot);
  if (built) {
    return { command: built, prefixArgs: [] };
  }
  return { command: isWindows ? "grok.cmd" : "grok", prefixArgs: [] };
}
function spawnDetached(command, args) {
  if (!command) {
    return;
  }
  try {
    const resolved = resolveSpawnCommand(command);
    spawn(resolved.command, [...resolved.prefixArgs, ...args], { detached: true, stdio: "ignore", windowsHide: true, shell: resolved.shell }).unref();
  } catch {
    return;
  }
}
export {
  ForgeVendorAccountHost,
  fetchOfficialVendorModels
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxvcmNoZXN0cmF0aW9uXFxmb3JnZVZlbmRvckFjY291bnRIb3N0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXHJcbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxyXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuXHJcbmltcG9ydCB7IHNwYXduIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XHJcbmltcG9ydCB7IG1rZGlyU3luYywgcmVhZEZpbGVTeW5jLCB3cml0ZUZpbGVTeW5jIH0gZnJvbSAnZnMnO1xyXG5pbXBvcnQgeyBob21lZGlyIH0gZnJvbSAnb3MnO1xyXG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XHJcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcclxuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XHJcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xyXG5pbXBvcnQgeyBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcclxuaW1wb3J0IHsgQ09ERVhfTU9ERUxTX1JPT1RfQ09ORklHX0tFWSwgbm9ybWFsaXplQ29kZXhNb2RlbHNDb25maWcgfSBmcm9tICcuLi8uLi9jb21tb24vY29kZXhNb2RlbHNDb25maWcuanMnO1xyXG5pbXBvcnQge1xyXG5cdERFRVBTRUVLX0FDQ09VTlRfU0VDUkVUX1JFU09VUkNFLFxyXG5cdEdST0tfQUNDT1VOVF9TRUNSRVRfUkVTT1VSQ0UsXHJcblx0dHlwZSBGb3JnZVZlbmRvckFjY291bnRLaW5kLFxyXG5cdHR5cGUgSUZvcmdlVmVuZG9yQWNjb3VudEluZm8sXHJcblx0dmVuZG9yQWNjb3VudE1ldGFLZXksXHJcblx0dmVuZG9yQWNjb3VudFNpZ25JblJlcXVlc3RLZXksXHJcblx0dmVuZG9yQWNjb3VudFNpZ25PdXRSZXF1ZXN0S2V5LFxyXG59IGZyb20gJy4uLy4uL2NvbW1vbi9mb3JnZVZlbmRvckFjY291bnQuanMnO1xyXG5pbXBvcnQge1xyXG5cdG9mZmljaWFsQ2FyZHNFcXVhbCxcclxuXHRvZmZpY2lhbE1vZGVsQ2FyZFNwZWMsXHJcblx0cmVtb3ZlT2ZmaWNpYWxNb2RlbFByb3ZpZGVyLFxyXG5cdHVwc2VydE9mZmljaWFsTW9kZWxQcm92aWRlcixcclxufSBmcm9tICcuLi8uLi9jb21tb24vb2ZmaWNpYWxNb2RlbENhcmRzLmpzJztcclxuaW1wb3J0IHsgSUFnZW50SG9zdFByb3h5UmVzb2x2ZXIgfSBmcm9tICcuLi9hZ2VudEhvc3RQcm94eVJlc29sdmVyLmpzJztcclxuaW1wb3J0IHsgZ3Jva0F1dGhQYXRoLCBncm9rTG9naW5VcmwsIGdyb2tOZXR3b3JrRXJyb3JNZXNzYWdlLCBwb2xsR3Jva0RldmljZVRva2VuLCByZXF1ZXN0R3Jva0RldmljZUNvZGUsIHJlc29sdmVHcm9rRmV0Y2gsIHdyaXRlR3Jva09pZGNBdXRoIH0gZnJvbSAnLi9ncm9rRGV2aWNlTG9naW4uanMnO1xyXG5pbXBvcnQgeyBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uL2FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xyXG5pbXBvcnQgeyBnZXRWZW5kb3JBY2NvdW50U2VjcmV0LCBzZXRWZW5kb3JBY2NvdW50U2VjcmV0IH0gZnJvbSAnLi92ZW5kb3JBY2NvdW50U2VjcmV0cy5qcyc7XHJcbmltcG9ydCB7IGZpbmRHcm9rQnVpbGRCaW5hcnksIHJlc29sdmVTcGF3bkNvbW1hbmQgfSBmcm9tICcuL3dvcmtlclJ1bnRpbWUuanMnO1xyXG5cclxuZXhwb3J0IGNsYXNzIEZvcmdlVmVuZG9yQWNjb3VudEhvc3QgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcclxuXHRwcml2YXRlIF9sYXN0R3Jva1NpZ25Jbj86IHN0cmluZztcclxuXHRwcml2YXRlIF9sYXN0R3Jva1NpZ25PdXQ/OiBzdHJpbmc7XHJcblx0cHJpdmF0ZSBfbGFzdERlZXBTZWVrU2lnbkluPzogc3RyaW5nO1xyXG5cdHByaXZhdGUgX2xhc3REZWVwU2Vla1NpZ25PdXQ/OiBzdHJpbmc7XHJcblx0cHJpdmF0ZSBfZ3Jva0xvZ2luQWJvcnQ/OiBBYm9ydENvbnRyb2xsZXI7XHJcblx0cHJpdmF0ZSBfZ3Jva0xvZ2luRXBvY2ggPSAwO1xyXG5cclxuXHRjb25zdHJ1Y3RvcihcclxuXHRcdEBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uOiBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSxcclxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcclxuXHRcdEBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50OiBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLFxyXG5cdFx0QElBZ2VudEhvc3RQcm94eVJlc29sdmVyIHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5UmVzb2x2ZXI6IElBZ2VudEhvc3RQcm94eVJlc29sdmVyLFxyXG5cdCkge1xyXG5cdFx0c3VwZXIoKTtcclxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb24ub25EaWRSb290Q29uZmlnQ2hhbmdlKCgpID0+IHRoaXMuX29uUm9vdENvbmZpZygpKSk7XHJcblx0XHR2b2lkIHRoaXMuX3Jlc3RvcmVFeGlzdGluZ1Nlc3Npb25zKCk7XHJcblx0fVxyXG5cclxuXHRzdGF0aWMgY29uc3VtZUF1dGhlbnRpY2F0ZShyZXNvdXJjZTogc3RyaW5nLCB0b2tlbjogc3RyaW5nKTogYm9vbGVhbiB7XHJcblx0XHRpZiAocmVzb3VyY2UgPT09IEdST0tfQUNDT1VOVF9TRUNSRVRfUkVTT1VSQ0UpIHtcclxuXHRcdFx0c2V0VmVuZG9yQWNjb3VudFNlY3JldCgnZ3JvaycsIHRva2VuIHx8IHVuZGVmaW5lZCk7XHJcblx0XHRcdHJldHVybiB0cnVlO1xyXG5cdFx0fVxyXG5cdFx0aWYgKHJlc291cmNlID09PSBERUVQU0VFS19BQ0NPVU5UX1NFQ1JFVF9SRVNPVVJDRSkge1xyXG5cdFx0XHRzZXRWZW5kb3JBY2NvdW50U2VjcmV0KCdkZWVwc2VlaycsIHRva2VuIHx8IHVuZGVmaW5lZCk7XHJcblx0XHRcdHJldHVybiB0cnVlO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIGZhbHNlO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfb25Sb290Q29uZmlnKCk6IHZvaWQge1xyXG5cdFx0Y29uc3QgdmFsdWVzID0gdGhpcy5fY29uZmlndXJhdGlvbi5nZXRSb290Q29uZmlnVmFsdWVzPy4oKSA/PyB7fTtcclxuXHRcdHRoaXMuX2hhbmRsZVJlcXVlc3QoJ2dyb2snLCB2YWx1ZXNbdmVuZG9yQWNjb3VudFNpZ25JblJlcXVlc3RLZXkoJ2dyb2snKV0sIHZhbHVlc1t2ZW5kb3JBY2NvdW50U2lnbk91dFJlcXVlc3RLZXkoJ2dyb2snKV0pO1xyXG5cdFx0dGhpcy5faGFuZGxlUmVxdWVzdCgnZGVlcHNlZWsnLCB2YWx1ZXNbdmVuZG9yQWNjb3VudFNpZ25JblJlcXVlc3RLZXkoJ2RlZXBzZWVrJyldLCB2YWx1ZXNbdmVuZG9yQWNjb3VudFNpZ25PdXRSZXF1ZXN0S2V5KCdkZWVwc2VlaycpXSk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF9oYW5kbGVSZXF1ZXN0KGtpbmQ6IEZvcmdlVmVuZG9yQWNjb3VudEtpbmQsIHNpZ25JbjogdW5rbm93biwgc2lnbk91dDogdW5rbm93bik6IHZvaWQge1xyXG5cdFx0aWYgKHR5cGVvZiBzaWduSW4gPT09ICdzdHJpbmcnICYmIHNpZ25JbiAhPT0gdGhpcy5fc2lnbkluQ3Vyc29yKGtpbmQpKSB7XHJcblx0XHRcdHRoaXMuX3NldFNpZ25JbkN1cnNvcihraW5kLCBzaWduSW4pO1xyXG5cdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uLnVwZGF0ZVJvb3RDb25maWcoeyBbdmVuZG9yQWNjb3VudFNpZ25JblJlcXVlc3RLZXkoa2luZCldOiB1bmRlZmluZWQgfSk7XHJcblx0XHRcdHZvaWQgdGhpcy5fc2lnbkluKGtpbmQsIHNpZ25Jbik7XHJcblx0XHR9XHJcblx0XHRpZiAodHlwZW9mIHNpZ25PdXQgPT09ICdzdHJpbmcnICYmIHNpZ25PdXQgIT09IHRoaXMuX3NpZ25PdXRDdXJzb3Ioa2luZCkpIHtcclxuXHRcdFx0dGhpcy5fc2V0U2lnbk91dEN1cnNvcihraW5kLCBzaWduT3V0KTtcclxuXHRcdFx0dGhpcy5fY29uZmlndXJhdGlvbi51cGRhdGVSb290Q29uZmlnKHsgW3ZlbmRvckFjY291bnRTaWduT3V0UmVxdWVzdEtleShraW5kKV06IHVuZGVmaW5lZCB9KTtcclxuXHRcdFx0dm9pZCB0aGlzLl9zaWduT3V0KGtpbmQpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfc2lnbkluQ3Vyc29yKGtpbmQ6IEZvcmdlVmVuZG9yQWNjb3VudEtpbmQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xyXG5cdFx0cmV0dXJuIGtpbmQgPT09ICdncm9rJyA/IHRoaXMuX2xhc3RHcm9rU2lnbkluIDogdGhpcy5fbGFzdERlZXBTZWVrU2lnbkluO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfc2lnbk91dEN1cnNvcihraW5kOiBGb3JnZVZlbmRvckFjY291bnRLaW5kKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcclxuXHRcdHJldHVybiBraW5kID09PSAnZ3JvaycgPyB0aGlzLl9sYXN0R3Jva1NpZ25PdXQgOiB0aGlzLl9sYXN0RGVlcFNlZWtTaWduT3V0O1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfc2V0U2lnbkluQ3Vyc29yKGtpbmQ6IEZvcmdlVmVuZG9yQWNjb3VudEtpbmQsIHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcclxuXHRcdGlmIChraW5kID09PSAnZ3JvaycpIHtcclxuXHRcdFx0dGhpcy5fbGFzdEdyb2tTaWduSW4gPSB2YWx1ZTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHRoaXMuX2xhc3REZWVwU2Vla1NpZ25JbiA9IHZhbHVlO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfc2V0U2lnbk91dEN1cnNvcihraW5kOiBGb3JnZVZlbmRvckFjY291bnRLaW5kLCB2YWx1ZTogc3RyaW5nKTogdm9pZCB7XHJcblx0XHRpZiAoa2luZCA9PT0gJ2dyb2snKSB7XHJcblx0XHRcdHRoaXMuX2xhc3RHcm9rU2lnbk91dCA9IHZhbHVlO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0dGhpcy5fbGFzdERlZXBTZWVrU2lnbk91dCA9IHZhbHVlO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBhc3luYyBfcmVzdG9yZUV4aXN0aW5nU2Vzc2lvbnMoKTogUHJvbWlzZTx2b2lkPiB7XHJcblx0XHRjb25zdCBncm9rID0gcmVhZEdyb2tBdXRoKHRoaXMuX3VzZXJIb21lKCkpO1xyXG5cdFx0aWYgKGdyb2sgfHwgZ2V0VmVuZG9yQWNjb3VudFNlY3JldCgnZ3JvaycpKSB7XHJcblx0XHRcdGF3YWl0IHRoaXMuX2NvbXBsZXRlTG9naW4oJ2dyb2snLCBncm9rPy5lbWFpbCA/PyAnR3JvaycsIGdyb2s/LnBsYW5UeXBlKTtcclxuXHRcdH1cclxuXHRcdGNvbnN0IGRlZXBzZWVrS2V5ID0gZ2V0VmVuZG9yQWNjb3VudFNlY3JldCgnZGVlcHNlZWsnKSB8fCByZWFkRGVlcFNlZWtDcmVkZW50aWFscyh0aGlzLl91c2VySG9tZSgpKTtcclxuXHRcdGlmIChkZWVwc2Vla0tleSkge1xyXG5cdFx0XHRpZiAoIWdldFZlbmRvckFjY291bnRTZWNyZXQoJ2RlZXBzZWVrJykpIHtcclxuXHRcdFx0XHRzZXRWZW5kb3JBY2NvdW50U2VjcmV0KCdkZWVwc2VlaycsIGRlZXBzZWVrS2V5KTtcclxuXHRcdFx0fVxyXG5cdFx0XHRhd2FpdCB0aGlzLl9jb21wbGV0ZUxvZ2luKCdkZWVwc2VlaycsICdEZWVwU2VlaycpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBhc3luYyBfc2lnbkluKGtpbmQ6IEZvcmdlVmVuZG9yQWNjb3VudEtpbmQsIHJlcXVlc3Q6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG5cdFx0Y29uc3QgZXBvY2ggPSBraW5kID09PSAnZ3JvaycgPyArK3RoaXMuX2dyb2tMb2dpbkVwb2NoIDogdGhpcy5fZ3Jva0xvZ2luRXBvY2g7XHJcblx0XHR0aGlzLl9wdWJsaXNoKGtpbmQsIHsgc3RhdHVzOiAnc2lnbmluZ0luJyB9KTtcclxuXHRcdHRyeSB7XHJcblx0XHRcdGlmIChraW5kID09PSAnZGVlcHNlZWsnKSB7XHJcblx0XHRcdFx0Y29uc3QgYXBpS2V5ID0gZ2V0VmVuZG9yQWNjb3VudFNlY3JldCgnZGVlcHNlZWsnKTtcclxuXHRcdFx0XHRpZiAoIWFwaUtleSkge1xyXG5cdFx0XHRcdFx0dGhpcy5fcHVibGlzaChraW5kLCB7IHN0YXR1czogJ2Vycm9yJywgZXJyb3I6ICdcdThCRjdcdTUxNDhcdTU4NkJcdTUxOTkgRGVlcFNlZWsgQVBJIFx1NUJDNlx1OTRBNVx1MzAwMicgfSk7XHJcblx0XHRcdFx0XHRyZXR1cm47XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdHdyaXRlRGVlcFNlZWtDcmVkZW50aWFscyh0aGlzLl91c2VySG9tZSgpLCBhcGlLZXkpO1xyXG5cdFx0XHRcdGF3YWl0IHRoaXMuX2NvbXBsZXRlTG9naW4oJ2RlZXBzZWVrJywgJ0RlZXBTZWVrJyk7XHJcblx0XHRcdFx0cmV0dXJuO1xyXG5cdFx0XHR9XHJcblx0XHRcdGNvbnN0IGFwaUtleSA9IGdldFZlbmRvckFjY291bnRTZWNyZXQoJ2dyb2snKTtcclxuXHRcdFx0aWYgKGFwaUtleSkge1xyXG5cdFx0XHRcdGF3YWl0IHRoaXMuX2NvbXBsZXRlTG9naW4oJ2dyb2snLCAnR3JvaycpO1xyXG5cdFx0XHRcdHJldHVybjtcclxuXHRcdFx0fVxyXG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHJlYWRHcm9rQXV0aCh0aGlzLl91c2VySG9tZSgpKTtcclxuXHRcdFx0aWYgKGV4aXN0aW5nKSB7XHJcblx0XHRcdFx0YXdhaXQgdGhpcy5fY29tcGxldGVMb2dpbignZ3JvaycsIGV4aXN0aW5nLmVtYWlsLCBleGlzdGluZy5wbGFuVHlwZSk7XHJcblx0XHRcdFx0cmV0dXJuO1xyXG5cdFx0XHR9XHJcblx0XHRcdGF3YWl0IHRoaXMuX3J1bkdyb2tCcm93c2VyTG9naW4ocmVxdWVzdCwgZXBvY2gpO1xyXG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcclxuXHRcdFx0aWYgKGtpbmQgPT09ICdncm9rJyAmJiBlcG9jaCAhPT0gdGhpcy5fZ3Jva0xvZ2luRXBvY2gpIHtcclxuXHRcdFx0XHRyZXR1cm47XHJcblx0XHRcdH1cclxuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGdyb2tOZXR3b3JrRXJyb3JNZXNzYWdlKGVycm9yKTtcclxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbRm9yZ2VBY2NvdW50XSAke2tpbmR9IHNpZ24taW4gZmFpbGVkOiAke21lc3NhZ2V9YCk7XHJcblx0XHRcdHRoaXMuX3B1Ymxpc2goa2luZCwgeyBzdGF0dXM6ICdlcnJvcicsIGVycm9yOiBtZXNzYWdlIH0pO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBhc3luYyBfc2lnbk91dChraW5kOiBGb3JnZVZlbmRvckFjY291bnRLaW5kKTogUHJvbWlzZTx2b2lkPiB7XHJcblx0XHRpZiAoa2luZCA9PT0gJ2dyb2snKSB7XHJcblx0XHRcdHRoaXMuX2dyb2tMb2dpbkVwb2NoKys7XHJcblx0XHRcdHRoaXMuX2dyb2tMb2dpbkFib3J0Py5hYm9ydCgpO1xyXG5cdFx0XHR0aGlzLl9ncm9rTG9naW5BYm9ydCA9IHVuZGVmaW5lZDtcclxuXHRcdFx0c2V0VmVuZG9yQWNjb3VudFNlY3JldCgnZ3JvaycsIHVuZGVmaW5lZCk7XHJcblx0XHRcdHZvaWQgc3Bhd25EZXRhY2hlZChyZXNvbHZlR3Jva0xvZ2luQ29tbWFuZCh0aGlzLl9lbnZpcm9ubWVudC5hcHBSb290KT8uY29tbWFuZCwgWydsb2dvdXQnXSk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRzZXRWZW5kb3JBY2NvdW50U2VjcmV0KCdkZWVwc2VlaycsIHVuZGVmaW5lZCk7XHJcblx0XHRcdHdyaXRlRGVlcFNlZWtDcmVkZW50aWFscyh0aGlzLl91c2VySG9tZSgpLCB1bmRlZmluZWQpO1xyXG5cdFx0fVxyXG5cdFx0dGhpcy5fc2V0T2ZmaWNpYWxDYXJkKGtpbmQsIGZhbHNlLCBbXSk7XHJcblx0XHR0aGlzLl9wdWJsaXNoKGtpbmQsIHsgc3RhdHVzOiAnc2lnbmVkT3V0JyB9KTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgYXN5bmMgX3J1bkdyb2tCcm93c2VyTG9naW4ocmVxdWVzdDogc3RyaW5nLCBlcG9jaDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XHJcblx0XHR0aGlzLl9ncm9rTG9naW5BYm9ydD8uYWJvcnQoKTtcclxuXHRcdHRoaXMuX2dyb2tMb2dpbkFib3J0ID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xyXG5cdFx0Y29uc3QgYWJvcnQgPSB0aGlzLl9ncm9rTG9naW5BYm9ydC5zaWduYWw7XHJcblx0XHRjb25zdCBmZXRjaEltcGwgPSBhd2FpdCByZXNvbHZlR3Jva0ZldGNoKChpbnB1dCwgaW5pdCkgPT4gdGhpcy5fcHJveHlSZXNvbHZlci5mZXRjaChpbnB1dCwgaW5pdCA/PyB7fSkpO1xyXG5cdFx0Y29uc3QgZGV2aWNlID0gYXdhaXQgcmVxdWVzdEdyb2tEZXZpY2VDb2RlKGZldGNoSW1wbCwgYWJvcnQpO1xyXG5cdFx0aWYgKGVwb2NoICE9PSB0aGlzLl9ncm9rTG9naW5FcG9jaCkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblx0XHR0aGlzLl9wdWJsaXNoKCdncm9rJywge1xyXG5cdFx0XHRzdGF0dXM6ICdzaWduaW5nSW4nLFxyXG5cdFx0XHRhdXRoVXJsOiBncm9rTG9naW5VcmwoZGV2aWNlKSxcclxuXHRcdFx0YXV0aFVybE5vbmNlOiByZXF1ZXN0LFxyXG5cdFx0XHR1c2VyQ29kZTogZGV2aWNlLnVzZXJDb2RlLFxyXG5cdFx0fSk7XHJcblx0XHRjb25zdCB0b2tlbnMgPSBhd2FpdCBwb2xsR3Jva0RldmljZVRva2VuKGZldGNoSW1wbCwgZGV2aWNlLCBhYm9ydCk7XHJcblx0XHRpZiAoZXBvY2ggIT09IHRoaXMuX2dyb2tMb2dpbkVwb2NoKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdGNvbnN0IHNhdmVkID0gd3JpdGVHcm9rT2lkY0F1dGgodGhpcy5fdXNlckhvbWUoKSwgdG9rZW5zKTtcclxuXHRcdGF3YWl0IHRoaXMuX2NvbXBsZXRlTG9naW4oJ2dyb2snLCBzYXZlZC5lbWFpbCA/PyAnR3JvaycpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBhc3luYyBfY29tcGxldGVMb2dpbihraW5kOiBGb3JnZVZlbmRvckFjY291bnRLaW5kLCBlbWFpbD86IHN0cmluZywgcGxhblR5cGU/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcclxuXHRcdGNvbnN0IG1vZGVscyA9IGF3YWl0IGZldGNoT2ZmaWNpYWxWZW5kb3JNb2RlbHMoa2luZCwgdGhpcy5fYXBpS2V5Rm9yKGtpbmQpKTtcclxuXHRcdHRoaXMuX3NldE9mZmljaWFsQ2FyZChraW5kLCB0cnVlLCBtb2RlbHMpO1xyXG5cdFx0dGhpcy5fcHVibGlzaChraW5kLCB7XHJcblx0XHRcdHN0YXR1czogJ3NpZ25lZEluJyxcclxuXHRcdFx0ZW1haWwsXHJcblx0XHRcdHBsYW5UeXBlLFxyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF9hcGlLZXlGb3Ioa2luZDogRm9yZ2VWZW5kb3JBY2NvdW50S2luZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XHJcblx0XHRpZiAoa2luZCA9PT0gJ2dyb2snKSB7XHJcblx0XHRcdHJldHVybiBnZXRWZW5kb3JBY2NvdW50U2VjcmV0KCdncm9rJykgfHwgcmVhZEdyb2tBdXRoKHRoaXMuX3VzZXJIb21lKCkpPy5rZXk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gZ2V0VmVuZG9yQWNjb3VudFNlY3JldCgnZGVlcHNlZWsnKSB8fCByZWFkRGVlcFNlZWtDcmVkZW50aWFscyh0aGlzLl91c2VySG9tZSgpKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX3NldE9mZmljaWFsQ2FyZChraW5kOiBGb3JnZVZlbmRvckFjY291bnRLaW5kLCBzaWduZWRJbjogYm9vbGVhbiwgbW9kZWxzOiByZWFkb25seSBzdHJpbmdbXSk6IHZvaWQge1xyXG5cdFx0Y29uc3QgY3VycmVudCA9IG5vcm1hbGl6ZUNvZGV4TW9kZWxzQ29uZmlnKHRoaXMuX2NvbmZpZ3VyYXRpb24uZ2V0Um9vdENvbmZpZ1ZhbHVlcz8uKCk/LltDT0RFWF9NT0RFTFNfUk9PVF9DT05GSUdfS0VZXSk7XHJcblx0XHRjb25zdCBuZXh0ID0gc2lnbmVkSW5cclxuXHRcdFx0PyB1cHNlcnRPZmZpY2lhbE1vZGVsUHJvdmlkZXIoY3VycmVudCwga2luZCwgbW9kZWxzKVxyXG5cdFx0XHQ6IHJlbW92ZU9mZmljaWFsTW9kZWxQcm92aWRlcihjdXJyZW50LCBraW5kKTtcclxuXHRcdGlmIChvZmZpY2lhbENhcmRzRXF1YWwoY3VycmVudCwgbmV4dCkpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdFx0dGhpcy5fY29uZmlndXJhdGlvbi51cGRhdGVSb290Q29uZmlnKHsgW0NPREVYX01PREVMU19ST09UX0NPTkZJR19LRVldOiBuZXh0IH0pO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfcHVibGlzaChraW5kOiBGb3JnZVZlbmRvckFjY291bnRLaW5kLCBhY2NvdW50OiBJRm9yZ2VWZW5kb3JBY2NvdW50SW5mbyk6IHZvaWQge1xyXG5cdFx0dGhpcy5fY29uZmlndXJhdGlvbi5wdWJsaXNoUm9vdFRyYW5zaWVudFZhbHVlcz8uKHsgW3ZlbmRvckFjY291bnRNZXRhS2V5KGtpbmQpXTogYWNjb3VudCB9KTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX3VzZXJIb21lKCk6IHN0cmluZyB7XHJcblx0XHRyZXR1cm4gdGhpcy5fZW52aXJvbm1lbnQudXNlckhvbWU/LmZzUGF0aCB8fCBob21lZGlyKCk7XHJcblx0fVxyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmV0Y2hPZmZpY2lhbFZlbmRvck1vZGVscyhraW5kOiBGb3JnZVZlbmRvckFjY291bnRLaW5kLCBhcGlLZXk6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8cmVhZG9ubHkgc3RyaW5nW10+IHtcclxuXHRjb25zdCBzcGVjID0gb2ZmaWNpYWxNb2RlbENhcmRTcGVjKGtpbmQpO1xyXG5cdGlmICghYXBpS2V5KSB7XHJcblx0XHRyZXR1cm4gc3BlYy5mYWxsYmFja01vZGVscztcclxuXHR9XHJcblx0Y29uc3QgYmFzZSA9IHNwZWMuZGVmYXVsdEJhc2VVcmwucmVwbGFjZSgvXFwvJC8sICcnKTtcclxuXHRjb25zdCB1cmxzID0ga2luZCA9PT0gJ2dyb2snXHJcblx0XHQ/IFtgJHtiYXNlfS9sYW5ndWFnZS1tb2RlbHNgLCBgJHtiYXNlfS9tb2RlbHNgXVxyXG5cdFx0OiBbYCR7YmFzZX0vbW9kZWxzYF07XHJcblx0Zm9yIChjb25zdCB1cmwgb2YgdXJscykge1xyXG5cdFx0dHJ5IHtcclxuXHRcdFx0Y29uc3QgbmFtZXMgPSBwYXJzZU1vZGVsQ2F0YWxvZyhhd2FpdCBmZXRjaEpzb24odXJsLCBhcGlLZXkpKTtcclxuXHRcdFx0aWYgKG5hbWVzLmxlbmd0aCA+IDApIHtcclxuXHRcdFx0XHRyZXR1cm4gbmFtZXM7XHJcblx0XHRcdH1cclxuXHRcdH0gY2F0Y2gge1xyXG5cdFx0XHRjb250aW51ZTtcclxuXHRcdH1cclxuXHR9XHJcblx0cmV0dXJuIHNwZWMuZmFsbGJhY2tNb2RlbHM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBhcnNlTW9kZWxDYXRhbG9nKGJvZHk6IHVua25vd24pOiByZWFkb25seSBzdHJpbmdbXSB7XHJcblx0Y29uc3QgcmVjb3JkID0gYm9keSAmJiB0eXBlb2YgYm9keSA9PT0gJ29iamVjdCcgPyBib2R5IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IDoge307XHJcblx0Y29uc3QgcmF3ID0gQXJyYXkuaXNBcnJheShyZWNvcmQuZGF0YSkgPyByZWNvcmQuZGF0YVxyXG5cdFx0OiBBcnJheS5pc0FycmF5KHJlY29yZC5tb2RlbHMpID8gcmVjb3JkLm1vZGVsc1xyXG5cdFx0XHQ6IEFycmF5LmlzQXJyYXkoYm9keSkgPyBib2R5XHJcblx0XHRcdFx0OiBbXTtcclxuXHRjb25zdCBuYW1lczogc3RyaW5nW10gPSBbXTtcclxuXHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XHJcblx0Zm9yIChjb25zdCBpdGVtIG9mIHJhdykge1xyXG5cdFx0Y29uc3QgaWQgPSB0eXBlb2YgaXRlbSA9PT0gJ3N0cmluZycgPyBpdGVtXHJcblx0XHRcdDogaXRlbSAmJiB0eXBlb2YgaXRlbSA9PT0gJ29iamVjdCcgPyBTdHJpbmcoKGl0ZW0gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLmlkID8/IChpdGVtIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS5uYW1lID8/ICcnKVxyXG5cdFx0XHRcdDogJyc7XHJcblx0XHRjb25zdCBuYW1lID0gaWQudHJpbSgpO1xyXG5cdFx0aWYgKG5hbWUgPT09ICcnIHx8IHNlZW4uaGFzKG5hbWUpKSB7XHJcblx0XHRcdGNvbnRpbnVlO1xyXG5cdFx0fVxyXG5cdFx0c2Vlbi5hZGQobmFtZSk7XHJcblx0XHRuYW1lcy5wdXNoKG5hbWUpO1xyXG5cdH1cclxuXHRyZXR1cm4gbmFtZXM7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGZldGNoSnNvbih1cmw6IHN0cmluZywgYXBpS2V5OiBzdHJpbmcpOiBQcm9taXNlPHVua25vd24+IHtcclxuXHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCwge1xyXG5cdFx0aGVhZGVyczoge1xyXG5cdFx0XHRBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7YXBpS2V5fWAsXHJcblx0XHRcdEFjY2VwdDogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG5cdFx0fSxcclxuXHR9KTtcclxuXHRpZiAoIXJlc3BvbnNlLm9rKSB7XHJcblx0XHR0aHJvdyBuZXcgRXJyb3IoYCR7dXJsfSAke3Jlc3BvbnNlLnN0YXR1c31gKTtcclxuXHR9XHJcblx0cmV0dXJuIHJlc3BvbnNlLmpzb24oKTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVhZEdyb2tBdXRoKHVzZXJIb21lOiBzdHJpbmcpOiB7IGVtYWlsPzogc3RyaW5nOyBwbGFuVHlwZT86IHN0cmluZzsga2V5Pzogc3RyaW5nIH0gfCB1bmRlZmluZWQge1xyXG5cdHRyeSB7XHJcblx0XHRjb25zdCByYXcgPSBKU09OLnBhcnNlKHJlYWRGaWxlU3luYyhncm9rQXV0aFBhdGgodXNlckhvbWUpLCAndXRmOCcpKSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcclxuXHRcdGZvciAoY29uc3QgdmFsdWUgb2YgT2JqZWN0LnZhbHVlcyhyYXcpKSB7XHJcblx0XHRcdGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0Jykge1xyXG5cdFx0XHRcdGNvbnRpbnVlO1xyXG5cdFx0XHR9XHJcblx0XHRcdGNvbnN0IGVudHJ5ID0gdmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XHJcblx0XHRcdGlmICh0eXBlb2YgZW50cnkua2V5ICE9PSAnc3RyaW5nJyB8fCBlbnRyeS5rZXkudHJpbSgpID09PSAnJykge1xyXG5cdFx0XHRcdGNvbnRpbnVlO1xyXG5cdFx0XHR9XHJcblx0XHRcdHJldHVybiB7XHJcblx0XHRcdFx0a2V5OiBlbnRyeS5rZXksXHJcblx0XHRcdFx0ZW1haWw6IHR5cGVvZiBlbnRyeS5lbWFpbCA9PT0gJ3N0cmluZycgPyBlbnRyeS5lbWFpbCA6IHVuZGVmaW5lZCxcclxuXHRcdFx0XHRwbGFuVHlwZTogdHlwZW9mIGVudHJ5LnRlYW1fbmFtZSA9PT0gJ3N0cmluZycgPyBlbnRyeS50ZWFtX25hbWUgOiB0eXBlb2YgZW50cnkuYXV0aF9tb2RlID09PSAnc3RyaW5nJyA/IGVudHJ5LmF1dGhfbW9kZSA6IHVuZGVmaW5lZCxcclxuXHRcdFx0fTtcclxuXHRcdH1cclxuXHR9IGNhdGNoIHtcclxuXHRcdHJldHVybiB1bmRlZmluZWQ7XHJcblx0fVxyXG5cdHJldHVybiB1bmRlZmluZWQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRlZXBTZWVrQ3JlZGVudGlhbHNQYXRoKHVzZXJIb21lOiBzdHJpbmcpOiBzdHJpbmcge1xyXG5cdHJldHVybiBqb2luKHByb2Nlc3MuZW52LkRTSF9IT01FIHx8IGpvaW4odXNlckhvbWUsICcuZHNoJyksICcuY3JlZGVudGlhbHMueWFtbCcpO1xyXG59XHJcblxyXG5mdW5jdGlvbiByZWFkRGVlcFNlZWtDcmVkZW50aWFscyh1c2VySG9tZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcclxuXHR0cnkge1xyXG5cdFx0Y29uc3QgdGV4dCA9IHJlYWRGaWxlU3luYyhkZWVwU2Vla0NyZWRlbnRpYWxzUGF0aCh1c2VySG9tZSksICd1dGY4Jyk7XHJcblx0XHRjb25zdCBtYXRjaCA9IHRleHQubWF0Y2goL15cXHMqREVFUFNFRUtfQVBJX0tFWVxccyo6XFxzKiguKylcXHMqJC9tKTtcclxuXHRcdGNvbnN0IHZhbHVlID0gbWF0Y2g/LlsxXT8udHJpbSgpLnJlcGxhY2UoL15bJ1wiXXxbJ1wiXSQvZywgJycpO1xyXG5cdFx0cmV0dXJuIHZhbHVlIHx8IHVuZGVmaW5lZDtcclxuXHR9IGNhdGNoIHtcclxuXHRcdHJldHVybiB1bmRlZmluZWQ7XHJcblx0fVxyXG59XHJcblxyXG5mdW5jdGlvbiB3cml0ZURlZXBTZWVrQ3JlZGVudGlhbHModXNlckhvbWU6IHN0cmluZywgYXBpS2V5OiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcclxuXHRjb25zdCBwYXRoID0gZGVlcFNlZWtDcmVkZW50aWFsc1BhdGgodXNlckhvbWUpO1xyXG5cdG1rZGlyU3luYyhqb2luKHBhdGgsICcuLicpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcclxuXHRpZiAoIWFwaUtleSkge1xyXG5cdFx0dHJ5IHtcclxuXHRcdFx0Y29uc3QgY3VycmVudCA9IHJlYWRGaWxlU3luYyhwYXRoLCAndXRmOCcpO1xyXG5cdFx0XHR3cml0ZUZpbGVTeW5jKHBhdGgsIGAke2N1cnJlbnQucmVwbGFjZSgvXlxccypERUVQU0VFS19BUElfS0VZXFxzKjouKiQvbSwgJycpLnRyaW0oKX1cXG5gLCAndXRmOCcpO1xyXG5cdFx0fSBjYXRjaCB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdHJldHVybjtcclxuXHR9XHJcblx0d3JpdGVGaWxlU3luYyhwYXRoLCBgREVFUFNFRUtfQVBJX0tFWTogJHtKU09OLnN0cmluZ2lmeShhcGlLZXkpfVxcbmAsICd1dGY4Jyk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlc29sdmVHcm9rTG9naW5Db21tYW5kKHJlcG9Sb290OiBzdHJpbmcpOiB7IGNvbW1hbmQ6IHN0cmluZzsgcHJlZml4QXJnczogc3RyaW5nW10gfSB8IHVuZGVmaW5lZCB7XHJcblx0Y29uc3QgYnVpbHQgPSBmaW5kR3Jva0J1aWxkQmluYXJ5KHJlcG9Sb290KTtcclxuXHRpZiAoYnVpbHQpIHtcclxuXHRcdHJldHVybiB7IGNvbW1hbmQ6IGJ1aWx0LCBwcmVmaXhBcmdzOiBbXSB9O1xyXG5cdH1cclxuXHRyZXR1cm4geyBjb21tYW5kOiBpc1dpbmRvd3MgPyAnZ3Jvay5jbWQnIDogJ2dyb2snLCBwcmVmaXhBcmdzOiBbXSB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBzcGF3bkRldGFjaGVkKGNvbW1hbmQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgYXJnczogcmVhZG9ubHkgc3RyaW5nW10pOiB2b2lkIHtcclxuXHRpZiAoIWNvbW1hbmQpIHtcclxuXHRcdHJldHVybjtcclxuXHR9XHJcblx0dHJ5IHtcclxuXHRcdGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZVNwYXduQ29tbWFuZChjb21tYW5kKTtcclxuXHRcdHNwYXduKHJlc29sdmVkLmNvbW1hbmQsIFsuLi5yZXNvbHZlZC5wcmVmaXhBcmdzLCAuLi5hcmdzXSwgeyBkZXRhY2hlZDogdHJ1ZSwgc3RkaW86ICdpZ25vcmUnLCB3aW5kb3dzSGlkZTogdHJ1ZSwgc2hlbGw6IHJlc29sdmVkLnNoZWxsIH0pLnVucmVmKCk7XHJcblx0fSBjYXRjaCB7XHJcblx0XHRyZXR1cm47XHJcblx0fVxyXG59XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsV0FBVyxjQUFjLHFCQUFxQjtBQUN2RCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsOEJBQThCLGtDQUFrQztBQUN6RTtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFHQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FD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
