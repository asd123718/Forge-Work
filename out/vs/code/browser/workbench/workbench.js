import { isStandalone } from "../../../base/browser/browser.js";
import { addDisposableListener } from "../../../base/browser/dom.js";
import { mainWindow } from "../../../base/browser/window.js";
import { VSBuffer, decodeBase64, encodeBase64 } from "../../../base/common/buffer.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { parse } from "../../../base/common/marshalling.js";
import { Schemas } from "../../../base/common/network.js";
import { posix } from "../../../base/common/path.js";
import { isEqual } from "../../../base/common/resources.js";
import { ltrim } from "../../../base/common/strings.js";
import { URI } from "../../../base/common/uri.js";
import product from "../../../platform/product/common/product.js";
import { isFolderToOpen, isWorkspaceToOpen } from "../../../platform/window/common/window.js";
import { create } from "../../../workbench/workbench.web.main.internal.js";
class TransparentCrypto {
  async seal(data) {
    return data;
  }
  async unseal(data) {
    return data;
  }
}
var AESConstants = /* @__PURE__ */ ((AESConstants2) => {
  AESConstants2["ALGORITHM"] = "AES-GCM";
  AESConstants2[AESConstants2["KEY_LENGTH"] = 256] = "KEY_LENGTH";
  AESConstants2[AESConstants2["IV_LENGTH"] = 12] = "IV_LENGTH";
  return AESConstants2;
})(AESConstants || {});
class NetworkError extends Error {
  constructor(inner) {
    super(inner.message);
    this.name = inner.name;
    this.stack = inner.stack;
  }
}
class ServerKeyedAESCrypto {
  constructor(authEndpoint) {
    this.authEndpoint = authEndpoint;
  }
  /**
   * Gets whether the algorithm is supported; requires a secure context
   */
  static supported() {
    return !!crypto.subtle;
  }
  async seal(data) {
    const iv = mainWindow.crypto.getRandomValues(new Uint8Array(12 /* IV_LENGTH */));
    const clientKeyObj = await mainWindow.crypto.subtle.generateKey(
      { name: "AES-GCM" /* ALGORITHM */, length: 256 /* KEY_LENGTH */ },
      true,
      ["encrypt", "decrypt"]
    );
    const clientKey = new Uint8Array(await mainWindow.crypto.subtle.exportKey("raw", clientKeyObj));
    const key = await this.getKey(clientKey);
    const dataUint8Array = new TextEncoder().encode(data);
    const cipherText = await mainWindow.crypto.subtle.encrypt(
      { name: "AES-GCM" /* ALGORITHM */, iv },
      key,
      dataUint8Array
    );
    const result = new Uint8Array([...clientKey, ...iv, ...new Uint8Array(cipherText)]);
    return encodeBase64(VSBuffer.wrap(result));
  }
  async unseal(data) {
    const dataUint8Array = decodeBase64(data);
    if (dataUint8Array.byteLength < 60) {
      throw Error("Invalid length for the value for credentials.crypto");
    }
    const keyLength = 256 /* KEY_LENGTH */ / 8;
    const clientKey = dataUint8Array.slice(0, keyLength);
    const iv = dataUint8Array.slice(keyLength, keyLength + 12 /* IV_LENGTH */);
    const cipherText = dataUint8Array.slice(keyLength + 12 /* IV_LENGTH */);
    const key = await this.getKey(clientKey.buffer);
    const decrypted = await mainWindow.crypto.subtle.decrypt(
      { name: "AES-GCM" /* ALGORITHM */, iv: iv.buffer },
      key,
      cipherText.buffer
    );
    return new TextDecoder().decode(new Uint8Array(decrypted));
  }
  /**
   * Given a clientKey, returns the CryptoKey object that is used to encrypt/decrypt the data.
   * The actual key is (clientKey XOR serverKey)
   */
  async getKey(clientKey) {
    if (!clientKey || clientKey.byteLength !== 256 /* KEY_LENGTH */ / 8) {
      throw Error("Invalid length for clientKey");
    }
    const serverKey = await this.getServerKeyPart();
    const keyData = new Uint8Array(256 /* KEY_LENGTH */ / 8);
    for (let i = 0; i < keyData.byteLength; i++) {
      keyData[i] = clientKey[i] ^ serverKey[i];
    }
    return mainWindow.crypto.subtle.importKey(
      "raw",
      keyData,
      {
        name: "AES-GCM" /* ALGORITHM */,
        length: 256 /* KEY_LENGTH */
      },
      true,
      ["encrypt", "decrypt"]
    );
  }
  async getServerKeyPart() {
    if (this.serverKey) {
      return this.serverKey;
    }
    let attempt = 0;
    let lastError;
    while (attempt <= 3) {
      try {
        const res = await fetch(this.authEndpoint, { credentials: "include", method: "POST" });
        if (!res.ok) {
          throw new Error(res.statusText);
        }
        const serverKey = new Uint8Array(await res.arrayBuffer());
        if (serverKey.byteLength !== 256 /* KEY_LENGTH */ / 8) {
          throw Error(`The key retrieved by the server is not ${256 /* KEY_LENGTH */} bit long.`);
        }
        this.serverKey = serverKey;
        return this.serverKey;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        attempt++;
        await new Promise((resolve) => setTimeout(resolve, attempt * attempt * 100));
      }
    }
    if (lastError) {
      throw new NetworkError(lastError);
    }
    throw new Error("Unknown error");
  }
}
class LocalStorageSecretStorageProvider {
  constructor(crypto2) {
    this.crypto = crypto2;
    this.storageKey = "secrets.provider";
    this.type = "persisted";
    this.secretsPromise = this.load();
  }
  async load() {
    const record = this.loadAuthSessionFromElement();
    const encrypted = localStorage.getItem(this.storageKey);
    if (encrypted) {
      try {
        const decrypted = JSON.parse(await this.crypto.unseal(encrypted));
        return { ...record, ...decrypted };
      } catch (err) {
        console.error("Failed to decrypt secrets from localStorage", err);
        if (!(err instanceof NetworkError)) {
          localStorage.removeItem(this.storageKey);
        }
      }
    }
    return record;
  }
  loadAuthSessionFromElement() {
    let authSessionInfo;
    const authSessionElement = mainWindow.document.getElementById("vscode-workbench-auth-session");
    const authSessionElementAttribute = authSessionElement ? authSessionElement.getAttribute("data-settings") : void 0;
    if (authSessionElementAttribute) {
      try {
        authSessionInfo = JSON.parse(authSessionElementAttribute);
      } catch (error) {
      }
    }
    if (!authSessionInfo) {
      return {};
    }
    const record = {};
    record[`${product.urlProtocol}.loginAccount`] = JSON.stringify(authSessionInfo);
    if (authSessionInfo.providerId !== "github") {
      console.error(`Unexpected auth provider: ${authSessionInfo.providerId}. Expected 'github'.`);
      return record;
    }
    const authAccount = JSON.stringify({ extensionId: "vscode.github-authentication", key: "github.auth" });
    record[authAccount] = JSON.stringify(authSessionInfo.scopes.map((scopes) => ({
      id: authSessionInfo.id,
      scopes,
      accessToken: authSessionInfo.accessToken
    })));
    return record;
  }
  async get(key) {
    const secrets = await this.secretsPromise;
    return secrets[key];
  }
  async set(key, value) {
    const secrets = await this.secretsPromise;
    secrets[key] = value;
    this.secretsPromise = Promise.resolve(secrets);
    this.save();
  }
  async delete(key) {
    const secrets = await this.secretsPromise;
    delete secrets[key];
    this.secretsPromise = Promise.resolve(secrets);
    this.save();
  }
  async keys() {
    const secrets = await this.secretsPromise;
    return Object.keys(secrets) || [];
  }
  async save() {
    try {
      const encrypted = await this.crypto.seal(JSON.stringify(await this.secretsPromise));
      localStorage.setItem(this.storageKey, encrypted);
    } catch (err) {
      console.error(err);
    }
  }
}
const _LocalStorageURLCallbackProvider = class _LocalStorageURLCallbackProvider extends Disposable {
  constructor(_callbackRoute) {
    super();
    this._callbackRoute = _callbackRoute;
    this._onCallback = this._register(new Emitter());
    this.onCallback = this._onCallback.event;
    this.pendingCallbacks = /* @__PURE__ */ new Set();
    this.lastTimeChecked = Date.now();
    this.checkCallbacksTimeout = void 0;
  }
  create(options = {}) {
    const id = ++_LocalStorageURLCallbackProvider.REQUEST_ID;
    const queryParams = [`vscode-reqid=${id}`];
    for (const key of _LocalStorageURLCallbackProvider.QUERY_KEYS) {
      const value = options[key];
      if (value) {
        queryParams.push(`vscode-${key}=${encodeURIComponent(value)}`);
      }
    }
    if (!(options.authority === "vscode.github-authentication" && options.path === "/dummy")) {
      const key = `vscode-web.url-callbacks[${id}]`;
      localStorage.removeItem(key);
      this.pendingCallbacks.add(id);
      this.startListening();
    }
    return URI.parse(mainWindow.location.href).with({ path: this._callbackRoute, query: queryParams.join("&") });
  }
  startListening() {
    if (this.onDidChangeLocalStorageDisposable) {
      return;
    }
    this.onDidChangeLocalStorageDisposable = addDisposableListener(mainWindow, "storage", () => this.onDidChangeLocalStorage());
  }
  stopListening() {
    this.onDidChangeLocalStorageDisposable?.dispose();
    this.onDidChangeLocalStorageDisposable = void 0;
  }
  // this fires every time local storage changes, but we
  // don't want to check more often than once a second
  async onDidChangeLocalStorage() {
    const ellapsed = Date.now() - this.lastTimeChecked;
    if (ellapsed > 1e3) {
      this.checkCallbacks();
    } else if (this.checkCallbacksTimeout === void 0) {
      this.checkCallbacksTimeout = setTimeout(() => {
        this.checkCallbacksTimeout = void 0;
        this.checkCallbacks();
      }, 1e3 - ellapsed);
    }
  }
  checkCallbacks() {
    let pendingCallbacks;
    for (const id of this.pendingCallbacks) {
      const key = `vscode-web.url-callbacks[${id}]`;
      const result = localStorage.getItem(key);
      if (result !== null) {
        try {
          this._onCallback.fire(URI.revive(JSON.parse(result)));
        } catch (error) {
          console.error(error);
        }
        pendingCallbacks = pendingCallbacks ?? new Set(this.pendingCallbacks);
        pendingCallbacks.delete(id);
        localStorage.removeItem(key);
      }
    }
    if (pendingCallbacks) {
      this.pendingCallbacks = pendingCallbacks;
      if (this.pendingCallbacks.size === 0) {
        this.stopListening();
      }
    }
    this.lastTimeChecked = Date.now();
  }
  dispose() {
    clearTimeout(this.checkCallbacksTimeout);
    this.stopListening();
    super.dispose();
  }
};
_LocalStorageURLCallbackProvider.REQUEST_ID = 0;
_LocalStorageURLCallbackProvider.QUERY_KEYS = [
  "scheme",
  "authority",
  "path",
  "query",
  "fragment"
];
let LocalStorageURLCallbackProvider = _LocalStorageURLCallbackProvider;
const _WorkspaceProvider = class _WorkspaceProvider {
  constructor(workspace, payload, config) {
    this.workspace = workspace;
    this.payload = payload;
    this.config = config;
    this.trusted = true;
  }
  static create(config) {
    let foundWorkspace = false;
    let workspace;
    let payload = /* @__PURE__ */ Object.create(null);
    const query = new URL(document.location.href).searchParams;
    query.forEach((value, key) => {
      switch (key) {
        // Folder
        case _WorkspaceProvider.QUERY_PARAM_FOLDER:
          if (config.remoteAuthority && value.startsWith(posix.sep)) {
            workspace = { folderUri: URI.from({ scheme: Schemas.vscodeRemote, path: value, authority: config.remoteAuthority }) };
          } else {
            workspace = { folderUri: URI.parse(value) };
          }
          foundWorkspace = true;
          break;
        // Workspace
        case _WorkspaceProvider.QUERY_PARAM_WORKSPACE:
          if (config.remoteAuthority && value.startsWith(posix.sep)) {
            workspace = { workspaceUri: URI.from({ scheme: Schemas.vscodeRemote, path: value, authority: config.remoteAuthority }) };
          } else {
            workspace = { workspaceUri: URI.parse(value) };
          }
          foundWorkspace = true;
          break;
        // Empty
        case _WorkspaceProvider.QUERY_PARAM_EMPTY_WINDOW:
          workspace = void 0;
          foundWorkspace = true;
          break;
        // Payload
        case _WorkspaceProvider.QUERY_PARAM_PAYLOAD:
          try {
            payload = parse(value);
          } catch (error) {
            console.error(error);
          }
          break;
      }
    });
    if (!foundWorkspace) {
      if (config.folderUri) {
        workspace = { folderUri: URI.revive(config.folderUri) };
      } else if (config.workspaceUri) {
        workspace = { workspaceUri: URI.revive(config.workspaceUri) };
      }
    }
    return new _WorkspaceProvider(workspace, payload, config);
  }
  async open(workspace, options) {
    if (options?.reuse && !options.payload && this.isSame(this.workspace, workspace)) {
      return true;
    }
    const targetHref = this.createTargetUrl(workspace, options);
    if (targetHref) {
      if (options?.reuse) {
        mainWindow.location.href = targetHref;
        return true;
      } else {
        let result;
        if (isStandalone()) {
          result = mainWindow.open(targetHref, "_blank", "toolbar=no");
        } else {
          result = mainWindow.open(targetHref);
        }
        return !!result;
      }
    }
    return false;
  }
  createTargetUrl(workspace, options) {
    let targetHref = void 0;
    if (!workspace) {
      targetHref = `${document.location.origin}${document.location.pathname}?${_WorkspaceProvider.QUERY_PARAM_EMPTY_WINDOW}=true`;
    } else if (isFolderToOpen(workspace)) {
      const queryParamFolder = this.encodeWorkspacePath(workspace.folderUri);
      targetHref = `${document.location.origin}${document.location.pathname}?${_WorkspaceProvider.QUERY_PARAM_FOLDER}=${queryParamFolder}`;
    } else if (isWorkspaceToOpen(workspace)) {
      const queryParamWorkspace = this.encodeWorkspacePath(workspace.workspaceUri);
      targetHref = `${document.location.origin}${document.location.pathname}?${_WorkspaceProvider.QUERY_PARAM_WORKSPACE}=${queryParamWorkspace}`;
    }
    if (options?.payload) {
      targetHref += `&${_WorkspaceProvider.QUERY_PARAM_PAYLOAD}=${encodeURIComponent(JSON.stringify(options.payload))}`;
    }
    return targetHref;
  }
  encodeWorkspacePath(uri) {
    if (this.config.remoteAuthority && uri.scheme === Schemas.vscodeRemote) {
      return encodeURIComponent(`${posix.sep}${ltrim(uri.path, posix.sep)}`).replaceAll("%2F", "/");
    }
    return encodeURIComponent(uri.toString(true));
  }
  isSame(workspaceA, workspaceB) {
    if (!workspaceA || !workspaceB) {
      return workspaceA === workspaceB;
    }
    if (isFolderToOpen(workspaceA) && isFolderToOpen(workspaceB)) {
      return isEqual(workspaceA.folderUri, workspaceB.folderUri);
    }
    if (isWorkspaceToOpen(workspaceA) && isWorkspaceToOpen(workspaceB)) {
      return isEqual(workspaceA.workspaceUri, workspaceB.workspaceUri);
    }
    return false;
  }
  hasRemote() {
    if (this.workspace) {
      if (isFolderToOpen(this.workspace)) {
        return this.workspace.folderUri.scheme === Schemas.vscodeRemote;
      }
      if (isWorkspaceToOpen(this.workspace)) {
        return this.workspace.workspaceUri.scheme === Schemas.vscodeRemote;
      }
    }
    return true;
  }
};
_WorkspaceProvider.QUERY_PARAM_EMPTY_WINDOW = "ew";
_WorkspaceProvider.QUERY_PARAM_FOLDER = "folder";
_WorkspaceProvider.QUERY_PARAM_WORKSPACE = "workspace";
_WorkspaceProvider.QUERY_PARAM_PAYLOAD = "payload";
let WorkspaceProvider = _WorkspaceProvider;
function readCookie(name) {
  const cookies = document.cookie.split("; ");
  for (const cookie of cookies) {
    if (cookie.startsWith(name + "=")) {
      return cookie.substring(name.length + 1);
    }
  }
  return void 0;
}
(function() {
  const configElement = mainWindow.document.getElementById("vscode-workbench-web-configuration");
  const configElementAttribute = configElement ? configElement.getAttribute("data-settings") : void 0;
  if (!configElement || !configElementAttribute) {
    throw new Error("Missing web configuration element");
  }
  const config = JSON.parse(configElementAttribute);
  const secretStorageKeyPath = readCookie("vscode-secret-key-path");
  const secretStorageCrypto = secretStorageKeyPath && ServerKeyedAESCrypto.supported() ? new ServerKeyedAESCrypto(secretStorageKeyPath) : new TransparentCrypto();
  create(mainWindow.document.body, {
    ...config,
    windowIndicator: config.windowIndicator ?? { label: "$(remote)", tooltip: `${product.nameShort} Web` },
    settingsSyncOptions: config.settingsSyncOptions ? { enabled: config.settingsSyncOptions.enabled } : void 0,
    workspaceProvider: WorkspaceProvider.create(config),
    urlCallbackProvider: new LocalStorageURLCallbackProvider(config.callbackRoute),
    secretStorageProvider: config.remoteAuthority && !secretStorageKeyPath ? void 0 : new LocalStorageSecretStorageProvider(secretStorageCrypto)
  });
})();
export {
  LocalStorageSecretStorageProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxjb2RlXFxicm93c2VyXFx3b3JrYmVuY2hcXHdvcmtiZW5jaC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlzU3RhbmRhbG9uZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9icm93c2VyLmpzJztcbmltcG9ydCB7IGFkZERpc3Bvc2FibGVMaXN0ZW5lciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIsIGRlY29kZUJhc2U2NCwgZW5jb2RlQmFzZTY0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBwYXJzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IHBvc2l4IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGx0cmltIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBJU2VjcmV0U3RvcmFnZVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vc2VjcmV0cy9jb21tb24vc2VjcmV0cy5qcyc7XG5pbXBvcnQgeyBpc0ZvbGRlclRvT3BlbiwgaXNXb3Jrc3BhY2VUb09wZW4gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgdHlwZSB7IElXb3JrYmVuY2hDb25zdHJ1Y3Rpb25PcHRpb25zLCBJV29ya3NwYWNlLCBJV29ya3NwYWNlUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci93ZWIuYXBpLmpzJztcbmltcG9ydCB7IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8gfSBmcm9tICcuLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJVVJMQ2FsbGJhY2tQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy91cmwvYnJvd3Nlci91cmxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZSB9IGZyb20gJy4uLy4uLy4uL3dvcmtiZW5jaC93b3JrYmVuY2gud2ViLm1haW4uaW50ZXJuYWwuanMnO1xuXG5pbnRlcmZhY2UgSVNlY3JldFN0b3JhZ2VDcnlwdG8ge1xuXHRzZWFsKGRhdGE6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPjtcblx0dW5zZWFsKGRhdGE6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPjtcbn1cblxuY2xhc3MgVHJhbnNwYXJlbnRDcnlwdG8gaW1wbGVtZW50cyBJU2VjcmV0U3RvcmFnZUNyeXB0byB7XG5cblx0YXN5bmMgc2VhbChkYXRhOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiBkYXRhO1xuXHR9XG5cblx0YXN5bmMgdW5zZWFsKGRhdGE6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIGRhdGE7XG5cdH1cbn1cblxuY29uc3QgZW51bSBBRVNDb25zdGFudHMge1xuXHRBTEdPUklUSE0gPSAnQUVTLUdDTScsXG5cdEtFWV9MRU5HVEggPSAyNTYsXG5cdElWX0xFTkdUSCA9IDEyLFxufVxuXG5jbGFzcyBOZXR3b3JrRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG5cblx0Y29uc3RydWN0b3IoaW5uZXI6IEVycm9yKSB7XG5cdFx0c3VwZXIoaW5uZXIubWVzc2FnZSk7XG5cdFx0dGhpcy5uYW1lID0gaW5uZXIubmFtZTtcblx0XHR0aGlzLnN0YWNrID0gaW5uZXIuc3RhY2s7XG5cdH1cbn1cblxuY2xhc3MgU2VydmVyS2V5ZWRBRVNDcnlwdG8gaW1wbGVtZW50cyBJU2VjcmV0U3RvcmFnZUNyeXB0byB7XG5cblx0cHJpdmF0ZSBzZXJ2ZXJLZXk6IFVpbnQ4QXJyYXkgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEdldHMgd2hldGhlciB0aGUgYWxnb3JpdGhtIGlzIHN1cHBvcnRlZDsgcmVxdWlyZXMgYSBzZWN1cmUgY29udGV4dFxuXHQgKi9cblx0c3RhdGljIHN1cHBvcnRlZCgpIHtcblx0XHRyZXR1cm4gISFjcnlwdG8uc3VidGxlO1xuXHR9XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBhdXRoRW5kcG9pbnQ6IHN0cmluZykgeyB9XG5cblx0YXN5bmMgc2VhbChkYXRhOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdC8vIEdldCBhIG5ldyBrZXkgYW5kIElWIG9uIGV2ZXJ5IGNoYW5nZSwgdG8gYXZvaWQgdGhlIHJpc2sgb2YgcmV1c2luZyB0aGUgc2FtZSBrZXkgYW5kIElWIHBhaXIgd2l0aCBBRVMtR0NNXG5cdFx0Ly8gKHNlZSBhbHNvOiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvQWVzR2NtUGFyYW1zI3Byb3BlcnRpZXMpXG5cdFx0Y29uc3QgaXYgPSBtYWluV2luZG93LmNyeXB0by5nZXRSYW5kb21WYWx1ZXMobmV3IFVpbnQ4QXJyYXkoQUVTQ29uc3RhbnRzLklWX0xFTkdUSCkpO1xuXHRcdC8vIGNyeXB0by5nZXRSYW5kb21WYWx1ZXMgaXNuJ3QgYSBnb29kLWVub3VnaCBQUk5HIHRvIGdlbmVyYXRlIGNyeXB0byBrZXlzLCBzbyB3ZSBuZWVkIHRvIHVzZSBjcnlwdG8uc3VidGxlLmdlbmVyYXRlS2V5IGFuZCBleHBvcnQgdGhlIGtleSBpbnN0ZWFkXG5cdFx0Y29uc3QgY2xpZW50S2V5T2JqID0gYXdhaXQgbWFpbldpbmRvdy5jcnlwdG8uc3VidGxlLmdlbmVyYXRlS2V5KFxuXHRcdFx0eyBuYW1lOiBBRVNDb25zdGFudHMuQUxHT1JJVEhNIGFzIGNvbnN0LCBsZW5ndGg6IEFFU0NvbnN0YW50cy5LRVlfTEVOR1RIIGFzIGNvbnN0IH0sXG5cdFx0XHR0cnVlLFxuXHRcdFx0WydlbmNyeXB0JywgJ2RlY3J5cHQnXVxuXHRcdCk7XG5cblx0XHRjb25zdCBjbGllbnRLZXkgPSBuZXcgVWludDhBcnJheShhd2FpdCBtYWluV2luZG93LmNyeXB0by5zdWJ0bGUuZXhwb3J0S2V5KCdyYXcnLCBjbGllbnRLZXlPYmopKTtcblx0XHRjb25zdCBrZXkgPSBhd2FpdCB0aGlzLmdldEtleShjbGllbnRLZXkpO1xuXHRcdGNvbnN0IGRhdGFVaW50OEFycmF5ID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKGRhdGEpO1xuXHRcdGNvbnN0IGNpcGhlclRleHQ6IEFycmF5QnVmZmVyID0gYXdhaXQgbWFpbldpbmRvdy5jcnlwdG8uc3VidGxlLmVuY3J5cHQoXG5cdFx0XHR7IG5hbWU6IEFFU0NvbnN0YW50cy5BTEdPUklUSE0gYXMgY29uc3QsIGl2IH0sXG5cdFx0XHRrZXksXG5cdFx0XHRkYXRhVWludDhBcnJheVxuXHRcdCk7XG5cblx0XHQvLyBCYXNlNjQgZW5jb2RlIHRoZSByZXN1bHQgYW5kIHN0b3JlIHRoZSBjaXBoZXJ0ZXh0LCB0aGUga2V5LCBhbmQgdGhlIElWIGluIGxvY2FsU3RvcmFnZVxuXHRcdC8vIE5vdGUgdGhhdCB0aGUgY2xpZW50S2V5IGFuZCBJViBkb24ndCBuZWVkIHRvIGJlIHNlY3JldFxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBVaW50OEFycmF5KFsuLi5jbGllbnRLZXksIC4uLml2LCAuLi5uZXcgVWludDhBcnJheShjaXBoZXJUZXh0KV0pO1xuXHRcdHJldHVybiBlbmNvZGVCYXNlNjQoVlNCdWZmZXIud3JhcChyZXN1bHQpKTtcblx0fVxuXG5cdGFzeW5jIHVuc2VhbChkYXRhOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdC8vIGVuY3J5cHRlZCBzaG91bGQgY29udGFpbiwgaW4gb3JkZXI6IHRoZSBrZXkgKDMyLWJ5dGUpLCB0aGUgSVYgZm9yIEFFUy1HQ00gKDEyLWJ5dGUpIGFuZCB0aGUgY2lwaGVydGV4dCAod2hpY2ggaGFzIHRoZSBHQ00gYXV0aCB0YWcgYXQgdGhlIGVuZClcblx0XHQvLyBNaW5pbXVtIGxlbmd0aCBtdXN0IGJlIDQ0IChrZXkrSVYgbGVuZ3RoKSArIDE2IGJ5dGVzICgxIGJsb2NrIGVuY3J5cHRlZCB3aXRoIEFFUyAtIHJlZ2FyZGxlc3Mgb2Yga2V5IHNpemUpXG5cdFx0Y29uc3QgZGF0YVVpbnQ4QXJyYXkgPSBkZWNvZGVCYXNlNjQoZGF0YSk7XG5cblx0XHRpZiAoZGF0YVVpbnQ4QXJyYXkuYnl0ZUxlbmd0aCA8IDYwKSB7XG5cdFx0XHR0aHJvdyBFcnJvcignSW52YWxpZCBsZW5ndGggZm9yIHRoZSB2YWx1ZSBmb3IgY3JlZGVudGlhbHMuY3J5cHRvJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qga2V5TGVuZ3RoID0gQUVTQ29uc3RhbnRzLktFWV9MRU5HVEggLyA4O1xuXHRcdGNvbnN0IGNsaWVudEtleSA9IGRhdGFVaW50OEFycmF5LnNsaWNlKDAsIGtleUxlbmd0aCk7XG5cdFx0Y29uc3QgaXYgPSBkYXRhVWludDhBcnJheS5zbGljZShrZXlMZW5ndGgsIGtleUxlbmd0aCArIEFFU0NvbnN0YW50cy5JVl9MRU5HVEgpO1xuXHRcdGNvbnN0IGNpcGhlclRleHQgPSBkYXRhVWludDhBcnJheS5zbGljZShrZXlMZW5ndGggKyBBRVNDb25zdGFudHMuSVZfTEVOR1RIKTtcblxuXHRcdC8vIERvIHRoZSBkZWNyeXB0aW9uIGFuZCBwYXJzZSB0aGUgcmVzdWx0IGFzIEpTT05cblx0XHRjb25zdCBrZXkgPSBhd2FpdCB0aGlzLmdldEtleShjbGllbnRLZXkuYnVmZmVyKTtcblx0XHRjb25zdCBkZWNyeXB0ZWQgPSBhd2FpdCBtYWluV2luZG93LmNyeXB0by5zdWJ0bGUuZGVjcnlwdChcblx0XHRcdHsgbmFtZTogQUVTQ29uc3RhbnRzLkFMR09SSVRITSBhcyBjb25zdCwgaXY6IGl2LmJ1ZmZlciBhcyBVaW50OEFycmF5PEFycmF5QnVmZmVyPiB9LFxuXHRcdFx0a2V5LFxuXHRcdFx0Y2lwaGVyVGV4dC5idWZmZXIgYXMgVWludDhBcnJheTxBcnJheUJ1ZmZlcj5cblx0XHQpO1xuXG5cdFx0cmV0dXJuIG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShuZXcgVWludDhBcnJheShkZWNyeXB0ZWQpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHaXZlbiBhIGNsaWVudEtleSwgcmV0dXJucyB0aGUgQ3J5cHRvS2V5IG9iamVjdCB0aGF0IGlzIHVzZWQgdG8gZW5jcnlwdC9kZWNyeXB0IHRoZSBkYXRhLlxuXHQgKiBUaGUgYWN0dWFsIGtleSBpcyAoY2xpZW50S2V5IFhPUiBzZXJ2ZXJLZXkpXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIGdldEtleShjbGllbnRLZXk6IFVpbnQ4QXJyYXkpOiBQcm9taXNlPENyeXB0b0tleT4ge1xuXHRcdGlmICghY2xpZW50S2V5IHx8IGNsaWVudEtleS5ieXRlTGVuZ3RoICE9PSBBRVNDb25zdGFudHMuS0VZX0xFTkdUSCAvIDgpIHtcblx0XHRcdHRocm93IEVycm9yKCdJbnZhbGlkIGxlbmd0aCBmb3IgY2xpZW50S2V5Jyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VydmVyS2V5ID0gYXdhaXQgdGhpcy5nZXRTZXJ2ZXJLZXlQYXJ0KCk7XG5cdFx0Y29uc3Qga2V5RGF0YSA9IG5ldyBVaW50OEFycmF5KEFFU0NvbnN0YW50cy5LRVlfTEVOR1RIIC8gOCk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGtleURhdGEuYnl0ZUxlbmd0aDsgaSsrKSB7XG5cdFx0XHRrZXlEYXRhW2ldID0gY2xpZW50S2V5W2ldIF4gc2VydmVyS2V5W2ldO1xuXHRcdH1cblxuXHRcdHJldHVybiBtYWluV2luZG93LmNyeXB0by5zdWJ0bGUuaW1wb3J0S2V5KFxuXHRcdFx0J3JhdycsXG5cdFx0XHRrZXlEYXRhLFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBBRVNDb25zdGFudHMuQUxHT1JJVEhNIGFzIGNvbnN0LFxuXHRcdFx0XHRsZW5ndGg6IEFFU0NvbnN0YW50cy5LRVlfTEVOR1RIIGFzIGNvbnN0LFxuXHRcdFx0fSxcblx0XHRcdHRydWUsXG5cdFx0XHRbJ2VuY3J5cHQnLCAnZGVjcnlwdCddXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0U2VydmVyS2V5UGFydCgpOiBQcm9taXNlPFVpbnQ4QXJyYXk+IHtcblx0XHRpZiAodGhpcy5zZXJ2ZXJLZXkpIHtcblx0XHRcdHJldHVybiB0aGlzLnNlcnZlcktleTtcblx0XHR9XG5cblx0XHRsZXQgYXR0ZW1wdCA9IDA7XG5cdFx0bGV0IGxhc3RFcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cblx0XHR3aGlsZSAoYXR0ZW1wdCA8PSAzKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaCh0aGlzLmF1dGhFbmRwb2ludCwgeyBjcmVkZW50aWFsczogJ2luY2x1ZGUnLCBtZXRob2Q6ICdQT1NUJyB9KTtcblx0XHRcdFx0aWYgKCFyZXMub2spIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IocmVzLnN0YXR1c1RleHQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc2VydmVyS2V5ID0gbmV3IFVpbnQ4QXJyYXkoYXdhaXQgcmVzLmFycmF5QnVmZmVyKCkpO1xuXHRcdFx0XHRpZiAoc2VydmVyS2V5LmJ5dGVMZW5ndGggIT09IEFFU0NvbnN0YW50cy5LRVlfTEVOR1RIIC8gOCkge1xuXHRcdFx0XHRcdHRocm93IEVycm9yKGBUaGUga2V5IHJldHJpZXZlZCBieSB0aGUgc2VydmVyIGlzIG5vdCAke0FFU0NvbnN0YW50cy5LRVlfTEVOR1RIfSBiaXQgbG9uZy5gKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuc2VydmVyS2V5ID0gc2VydmVyS2V5O1xuXG5cdFx0XHRcdHJldHVybiB0aGlzLnNlcnZlcktleTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0bGFzdEVycm9yID0gZSBpbnN0YW5jZW9mIEVycm9yID8gZSA6IG5ldyBFcnJvcihTdHJpbmcoZSkpO1xuXHRcdFx0XHRhdHRlbXB0Kys7XG5cblx0XHRcdFx0Ly8gZXhwb25lbnRpYWwgYmFja29mZlxuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgYXR0ZW1wdCAqIGF0dGVtcHQgKiAxMDApKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobGFzdEVycm9yKSB7XG5cdFx0XHR0aHJvdyBuZXcgTmV0d29ya0Vycm9yKGxhc3RFcnJvcik7XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVycm9yJyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIExvY2FsU3RvcmFnZVNlY3JldFN0b3JhZ2VQcm92aWRlciBpbXBsZW1lbnRzIElTZWNyZXRTdG9yYWdlUHJvdmlkZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZUtleSA9ICdzZWNyZXRzLnByb3ZpZGVyJztcblxuXHRwcml2YXRlIHNlY3JldHNQcm9taXNlOiBQcm9taXNlPFJlY29yZDxzdHJpbmcsIHN0cmluZz4+O1xuXG5cdHR5cGU6ICdpbi1tZW1vcnknIHwgJ3BlcnNpc3RlZCcgfCAndW5rbm93bicgPSAncGVyc2lzdGVkJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNyeXB0bzogSVNlY3JldFN0b3JhZ2VDcnlwdG8sXG5cdCkge1xuXHRcdHRoaXMuc2VjcmV0c1Byb21pc2UgPSB0aGlzLmxvYWQoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9hZCgpOiBQcm9taXNlPFJlY29yZDxzdHJpbmcsIHN0cmluZz4+IHtcblx0XHRjb25zdCByZWNvcmQgPSB0aGlzLmxvYWRBdXRoU2Vzc2lvbkZyb21FbGVtZW50KCk7XG5cblx0XHRjb25zdCBlbmNyeXB0ZWQgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSh0aGlzLnN0b3JhZ2VLZXkpO1xuXHRcdGlmIChlbmNyeXB0ZWQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGRlY3J5cHRlZCA9IEpTT04ucGFyc2UoYXdhaXQgdGhpcy5jcnlwdG8udW5zZWFsKGVuY3J5cHRlZCkpO1xuXG5cdFx0XHRcdHJldHVybiB7IC4uLnJlY29yZCwgLi4uZGVjcnlwdGVkIH07XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0Ly8gVE9ETzogc2VuZCB0ZWxlbWV0cnlcblx0XHRcdFx0Y29uc29sZS5lcnJvcignRmFpbGVkIHRvIGRlY3J5cHQgc2VjcmV0cyBmcm9tIGxvY2FsU3RvcmFnZScsIGVycik7XG5cdFx0XHRcdGlmICghKGVyciBpbnN0YW5jZW9mIE5ldHdvcmtFcnJvcikpIHtcblx0XHRcdFx0XHRsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbSh0aGlzLnN0b3JhZ2VLZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlY29yZDtcblx0fVxuXG5cdHByaXZhdGUgbG9hZEF1dGhTZXNzaW9uRnJvbUVsZW1lbnQoKTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB7XG5cdFx0bGV0IGF1dGhTZXNzaW9uSW5mbzogKEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8gJiB7IHNjb3Blczogc3RyaW5nW11bXSB9KSB8IHVuZGVmaW5lZDtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBhdXRoU2Vzc2lvbkVsZW1lbnQgPSBtYWluV2luZG93LmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd2c2NvZGUtd29ya2JlbmNoLWF1dGgtc2Vzc2lvbicpO1xuXHRcdGNvbnN0IGF1dGhTZXNzaW9uRWxlbWVudEF0dHJpYnV0ZSA9IGF1dGhTZXNzaW9uRWxlbWVudCA/IGF1dGhTZXNzaW9uRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtc2V0dGluZ3MnKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoYXV0aFNlc3Npb25FbGVtZW50QXR0cmlidXRlKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhdXRoU2Vzc2lvbkluZm8gPSBKU09OLnBhcnNlKGF1dGhTZXNzaW9uRWxlbWVudEF0dHJpYnV0ZSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikgeyAvKiBJbnZhbGlkIHNlc3Npb24gaXMgcGFzc2VkLiBJZ25vcmUuICovIH1cblx0XHR9XG5cblx0XHRpZiAoIWF1dGhTZXNzaW9uSW5mbykge1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlY29yZDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuXG5cdFx0Ly8gU2V0dGluZ3MgU3luYyBFbnRyeVxuXHRcdHJlY29yZFtgJHtwcm9kdWN0LnVybFByb3RvY29sfS5sb2dpbkFjY291bnRgXSA9IEpTT04uc3RyaW5naWZ5KGF1dGhTZXNzaW9uSW5mbyk7XG5cblx0XHQvLyBBdXRoIGV4dGVuc2lvbiBFbnRyeVxuXHRcdGlmIChhdXRoU2Vzc2lvbkluZm8ucHJvdmlkZXJJZCAhPT0gJ2dpdGh1YicpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoYFVuZXhwZWN0ZWQgYXV0aCBwcm92aWRlcjogJHthdXRoU2Vzc2lvbkluZm8ucHJvdmlkZXJJZH0uIEV4cGVjdGVkICdnaXRodWInLmApO1xuXHRcdFx0cmV0dXJuIHJlY29yZDtcblx0XHR9XG5cblx0XHRjb25zdCBhdXRoQWNjb3VudCA9IEpTT04uc3RyaW5naWZ5KHsgZXh0ZW5zaW9uSWQ6ICd2c2NvZGUuZ2l0aHViLWF1dGhlbnRpY2F0aW9uJywga2V5OiAnZ2l0aHViLmF1dGgnIH0pO1xuXHRcdHJlY29yZFthdXRoQWNjb3VudF0gPSBKU09OLnN0cmluZ2lmeShhdXRoU2Vzc2lvbkluZm8uc2NvcGVzLm1hcChzY29wZXMgPT4gKHtcblx0XHRcdGlkOiBhdXRoU2Vzc2lvbkluZm8uaWQsXG5cdFx0XHRzY29wZXMsXG5cdFx0XHRhY2Nlc3NUb2tlbjogYXV0aFNlc3Npb25JbmZvLmFjY2Vzc1Rva2VuXG5cdFx0fSkpKTtcblxuXHRcdHJldHVybiByZWNvcmQ7XG5cdH1cblxuXHRhc3luYyBnZXQoa2V5OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHNlY3JldHMgPSBhd2FpdCB0aGlzLnNlY3JldHNQcm9taXNlO1xuXG5cdFx0cmV0dXJuIHNlY3JldHNba2V5XTtcblx0fVxuXG5cdGFzeW5jIHNldChrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlY3JldHMgPSBhd2FpdCB0aGlzLnNlY3JldHNQcm9taXNlO1xuXHRcdHNlY3JldHNba2V5XSA9IHZhbHVlO1xuXHRcdHRoaXMuc2VjcmV0c1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoc2VjcmV0cyk7XG5cdFx0dGhpcy5zYXZlKCk7XG5cdH1cblxuXHRhc3luYyBkZWxldGUoa2V5OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZWNyZXRzID0gYXdhaXQgdGhpcy5zZWNyZXRzUHJvbWlzZTtcblx0XHRkZWxldGUgc2VjcmV0c1trZXldO1xuXHRcdHRoaXMuc2VjcmV0c1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoc2VjcmV0cyk7XG5cdFx0dGhpcy5zYXZlKCk7XG5cdH1cblxuXHRhc3luYyBrZXlzKCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRjb25zdCBzZWNyZXRzID0gYXdhaXQgdGhpcy5zZWNyZXRzUHJvbWlzZTtcblx0XHRyZXR1cm4gT2JqZWN0LmtleXMoc2VjcmV0cykgfHwgW107XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNhdmUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGVuY3J5cHRlZCA9IGF3YWl0IHRoaXMuY3J5cHRvLnNlYWwoSlNPTi5zdHJpbmdpZnkoYXdhaXQgdGhpcy5zZWNyZXRzUHJvbWlzZSkpO1xuXHRcdFx0bG9jYWxTdG9yYWdlLnNldEl0ZW0odGhpcy5zdG9yYWdlS2V5LCBlbmNyeXB0ZWQpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc29sZS5lcnJvcihlcnIpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBMb2NhbFN0b3JhZ2VVUkxDYWxsYmFja1Byb3ZpZGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElVUkxDYWxsYmFja1Byb3ZpZGVyIHtcblxuXHRwcml2YXRlIHN0YXRpYyBSRVFVRVNUX0lEID0gMDtcblxuXHRwcml2YXRlIHN0YXRpYyBRVUVSWV9LRVlTOiAoJ3NjaGVtZScgfCAnYXV0aG9yaXR5JyB8ICdwYXRoJyB8ICdxdWVyeScgfCAnZnJhZ21lbnQnKVtdID0gW1xuXHRcdCdzY2hlbWUnLFxuXHRcdCdhdXRob3JpdHknLFxuXHRcdCdwYXRoJyxcblx0XHQncXVlcnknLFxuXHRcdCdmcmFnbWVudCdcblx0XTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNhbGxiYWNrID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VVJJPigpKTtcblx0cmVhZG9ubHkgb25DYWxsYmFjayA9IHRoaXMuX29uQ2FsbGJhY2suZXZlbnQ7XG5cblx0cHJpdmF0ZSBwZW5kaW5nQ2FsbGJhY2tzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdHByaXZhdGUgbGFzdFRpbWVDaGVja2VkID0gRGF0ZS5ub3coKTtcblx0cHJpdmF0ZSBjaGVja0NhbGxiYWNrc1RpbWVvdXQ6IFRpbWVvdXQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgb25EaWRDaGFuZ2VMb2NhbFN0b3JhZ2VEaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9jYWxsYmFja1JvdXRlOiBzdHJpbmcpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0Y3JlYXRlKG9wdGlvbnM6IFBhcnRpYWw8VXJpQ29tcG9uZW50cz4gPSB7fSk6IFVSSSB7XG5cdFx0Y29uc3QgaWQgPSArK0xvY2FsU3RvcmFnZVVSTENhbGxiYWNrUHJvdmlkZXIuUkVRVUVTVF9JRDtcblx0XHRjb25zdCBxdWVyeVBhcmFtczogc3RyaW5nW10gPSBbYHZzY29kZS1yZXFpZD0ke2lkfWBdO1xuXG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgTG9jYWxTdG9yYWdlVVJMQ2FsbGJhY2tQcm92aWRlci5RVUVSWV9LRVlTKSB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IG9wdGlvbnNba2V5XTtcblxuXHRcdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRcdHF1ZXJ5UGFyYW1zLnB1c2goYHZzY29kZS0ke2tleX09JHtlbmNvZGVVUklDb21wb25lbnQodmFsdWUpfWApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFRPRE9Aam9hbyByZW1vdmUgZXZlbnR1YWxseVxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlLWRldi9pc3N1ZXMvNjJcblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9ibG9iLzE1OTQ3OWViNWFlNDUxYTY2YjVkYWMzYzEyZDU2NGYzMmY0NTQ3OTYvZXh0ZW5zaW9ucy9naXRodWItYXV0aGVudGljYXRpb24vc3JjL2dpdGh1YlNlcnZlci50cyNMNTAtTDUwXG5cdFx0aWYgKCEob3B0aW9ucy5hdXRob3JpdHkgPT09ICd2c2NvZGUuZ2l0aHViLWF1dGhlbnRpY2F0aW9uJyAmJiBvcHRpb25zLnBhdGggPT09ICcvZHVtbXknKSkge1xuXHRcdFx0Y29uc3Qga2V5ID0gYHZzY29kZS13ZWIudXJsLWNhbGxiYWNrc1ske2lkfV1gO1xuXHRcdFx0bG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oa2V5KTtcblxuXHRcdFx0dGhpcy5wZW5kaW5nQ2FsbGJhY2tzLmFkZChpZCk7XG5cdFx0XHR0aGlzLnN0YXJ0TGlzdGVuaW5nKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFVSSS5wYXJzZShtYWluV2luZG93LmxvY2F0aW9uLmhyZWYpLndpdGgoeyBwYXRoOiB0aGlzLl9jYWxsYmFja1JvdXRlLCBxdWVyeTogcXVlcnlQYXJhbXMuam9pbignJicpIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGFydExpc3RlbmluZygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5vbkRpZENoYW5nZUxvY2FsU3RvcmFnZURpc3Bvc2FibGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLm9uRGlkQ2hhbmdlTG9jYWxTdG9yYWdlRGlzcG9zYWJsZSA9IGFkZERpc3Bvc2FibGVMaXN0ZW5lcihtYWluV2luZG93LCAnc3RvcmFnZScsICgpID0+IHRoaXMub25EaWRDaGFuZ2VMb2NhbFN0b3JhZ2UoKSk7XG5cdH1cblxuXHRwcml2YXRlIHN0b3BMaXN0ZW5pbmcoKTogdm9pZCB7XG5cdFx0dGhpcy5vbkRpZENoYW5nZUxvY2FsU3RvcmFnZURpc3Bvc2FibGU/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlTG9jYWxTdG9yYWdlRGlzcG9zYWJsZSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8vIHRoaXMgZmlyZXMgZXZlcnkgdGltZSBsb2NhbCBzdG9yYWdlIGNoYW5nZXMsIGJ1dCB3ZVxuXHQvLyBkb24ndCB3YW50IHRvIGNoZWNrIG1vcmUgb2Z0ZW4gdGhhbiBvbmNlIGEgc2Vjb25kXG5cdHByaXZhdGUgYXN5bmMgb25EaWRDaGFuZ2VMb2NhbFN0b3JhZ2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWxsYXBzZWQgPSBEYXRlLm5vdygpIC0gdGhpcy5sYXN0VGltZUNoZWNrZWQ7XG5cblx0XHRpZiAoZWxsYXBzZWQgPiAxMDAwKSB7XG5cdFx0XHR0aGlzLmNoZWNrQ2FsbGJhY2tzKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmNoZWNrQ2FsbGJhY2tzVGltZW91dCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmNoZWNrQ2FsbGJhY2tzVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmNoZWNrQ2FsbGJhY2tzVGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5jaGVja0NhbGxiYWNrcygpO1xuXHRcdFx0fSwgMTAwMCAtIGVsbGFwc2VkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNoZWNrQ2FsbGJhY2tzKCk6IHZvaWQge1xuXHRcdGxldCBwZW5kaW5nQ2FsbGJhY2tzOiBTZXQ8bnVtYmVyPiB8IHVuZGVmaW5lZDtcblxuXHRcdGZvciAoY29uc3QgaWQgb2YgdGhpcy5wZW5kaW5nQ2FsbGJhY2tzKSB7XG5cdFx0XHRjb25zdCBrZXkgPSBgdnNjb2RlLXdlYi51cmwtY2FsbGJhY2tzWyR7aWR9XWA7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShrZXkpO1xuXG5cdFx0XHRpZiAocmVzdWx0ICE9PSBudWxsKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0dGhpcy5fb25DYWxsYmFjay5maXJlKFVSSS5yZXZpdmUoSlNPTi5wYXJzZShyZXN1bHQpKSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwZW5kaW5nQ2FsbGJhY2tzID0gcGVuZGluZ0NhbGxiYWNrcyA/PyBuZXcgU2V0KHRoaXMucGVuZGluZ0NhbGxiYWNrcyk7XG5cdFx0XHRcdHBlbmRpbmdDYWxsYmFja3MuZGVsZXRlKGlkKTtcblx0XHRcdFx0bG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAocGVuZGluZ0NhbGxiYWNrcykge1xuXHRcdFx0dGhpcy5wZW5kaW5nQ2FsbGJhY2tzID0gcGVuZGluZ0NhbGxiYWNrcztcblxuXHRcdFx0aWYgKHRoaXMucGVuZGluZ0NhbGxiYWNrcy5zaXplID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuc3RvcExpc3RlbmluZygpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMubGFzdFRpbWVDaGVja2VkID0gRGF0ZS5ub3coKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Y2xlYXJUaW1lb3V0KHRoaXMuY2hlY2tDYWxsYmFja3NUaW1lb3V0KTtcblx0XHR0aGlzLnN0b3BMaXN0ZW5pbmcoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgV29ya3NwYWNlUHJvdmlkZXIgaW1wbGVtZW50cyBJV29ya3NwYWNlUHJvdmlkZXIge1xuXG5cdHByaXZhdGUgc3RhdGljIFFVRVJZX1BBUkFNX0VNUFRZX1dJTkRPVyA9ICdldyc7XG5cdHByaXZhdGUgc3RhdGljIFFVRVJZX1BBUkFNX0ZPTERFUiA9ICdmb2xkZXInO1xuXHRwcml2YXRlIHN0YXRpYyBRVUVSWV9QQVJBTV9XT1JLU1BBQ0UgPSAnd29ya3NwYWNlJztcblxuXHRwcml2YXRlIHN0YXRpYyBRVUVSWV9QQVJBTV9QQVlMT0FEID0gJ3BheWxvYWQnO1xuXG5cdHN0YXRpYyBjcmVhdGUoY29uZmlnOiBJV29ya2JlbmNoQ29uc3RydWN0aW9uT3B0aW9ucyAmIHsgZm9sZGVyVXJpPzogVXJpQ29tcG9uZW50czsgd29ya3NwYWNlVXJpPzogVXJpQ29tcG9uZW50cyB9KSB7XG5cdFx0bGV0IGZvdW5kV29ya3NwYWNlID0gZmFsc2U7XG5cdFx0bGV0IHdvcmtzcGFjZTogSVdvcmtzcGFjZTtcblx0XHRsZXQgcGF5bG9hZCA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cblx0XHRjb25zdCBxdWVyeSA9IG5ldyBVUkwoZG9jdW1lbnQubG9jYXRpb24uaHJlZikuc2VhcmNoUGFyYW1zO1xuXHRcdHF1ZXJ5LmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcblx0XHRcdHN3aXRjaCAoa2V5KSB7XG5cblx0XHRcdFx0Ly8gRm9sZGVyXG5cdFx0XHRcdGNhc2UgV29ya3NwYWNlUHJvdmlkZXIuUVVFUllfUEFSQU1fRk9MREVSOlxuXHRcdFx0XHRcdGlmIChjb25maWcucmVtb3RlQXV0aG9yaXR5ICYmIHZhbHVlLnN0YXJ0c1dpdGgocG9zaXguc2VwKSkge1xuXHRcdFx0XHRcdFx0Ly8gd2hlbiBjb25uZWN0ZWQgdG8gYSByZW1vdGUgYW5kIGhhdmluZyBhIHZhbHVlXG5cdFx0XHRcdFx0XHQvLyB0aGF0IGlzIGEgcGF0aCAoYmVnaW5zIHdpdGggYSBgL2ApLCBhc3N1bWUgdGhpc1xuXHRcdFx0XHRcdFx0Ly8gaXMgYSB2c2NvZGUtcmVtb3RlIHJlc291cmNlIGFzIHNpbXBsaWZpZWQgVVJMLlxuXHRcdFx0XHRcdFx0d29ya3NwYWNlID0geyBmb2xkZXJVcmk6IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZVJlbW90ZSwgcGF0aDogdmFsdWUsIGF1dGhvcml0eTogY29uZmlnLnJlbW90ZUF1dGhvcml0eSB9KSB9O1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2UgPSB7IGZvbGRlclVyaTogVVJJLnBhcnNlKHZhbHVlKSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRmb3VuZFdvcmtzcGFjZSA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Ly8gV29ya3NwYWNlXG5cdFx0XHRcdGNhc2UgV29ya3NwYWNlUHJvdmlkZXIuUVVFUllfUEFSQU1fV09SS1NQQUNFOlxuXHRcdFx0XHRcdGlmIChjb25maWcucmVtb3RlQXV0aG9yaXR5ICYmIHZhbHVlLnN0YXJ0c1dpdGgocG9zaXguc2VwKSkge1xuXHRcdFx0XHRcdFx0Ly8gd2hlbiBjb25uZWN0ZWQgdG8gYSByZW1vdGUgYW5kIGhhdmluZyBhIHZhbHVlXG5cdFx0XHRcdFx0XHQvLyB0aGF0IGlzIGEgcGF0aCAoYmVnaW5zIHdpdGggYSBgL2ApLCBhc3N1bWUgdGhpc1xuXHRcdFx0XHRcdFx0Ly8gaXMgYSB2c2NvZGUtcmVtb3RlIHJlc291cmNlIGFzIHNpbXBsaWZpZWQgVVJMLlxuXHRcdFx0XHRcdFx0d29ya3NwYWNlID0geyB3b3Jrc3BhY2VVcmk6IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZVJlbW90ZSwgcGF0aDogdmFsdWUsIGF1dGhvcml0eTogY29uZmlnLnJlbW90ZUF1dGhvcml0eSB9KSB9O1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2UgPSB7IHdvcmtzcGFjZVVyaTogVVJJLnBhcnNlKHZhbHVlKSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRmb3VuZFdvcmtzcGFjZSA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Ly8gRW1wdHlcblx0XHRcdFx0Y2FzZSBXb3Jrc3BhY2VQcm92aWRlci5RVUVSWV9QQVJBTV9FTVBUWV9XSU5ET1c6XG5cdFx0XHRcdFx0d29ya3NwYWNlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGZvdW5kV29ya3NwYWNlID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHQvLyBQYXlsb2FkXG5cdFx0XHRcdGNhc2UgV29ya3NwYWNlUHJvdmlkZXIuUVVFUllfUEFSQU1fUEFZTE9BRDpcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0cGF5bG9hZCA9IHBhcnNlKHZhbHVlKTsgLy8gdXNlIG1hcnNoYWxsaW5nI3BhcnNlKCkgdG8gcmV2aXZlIHBvdGVudGlhbCBVUklzXG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoZXJyb3IpOyAvLyBwb3NzaWJsZSBpbnZhbGlkIEpTT05cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBJZiBubyB3b3Jrc3BhY2UgaXMgcHJvdmlkZWQgdGhyb3VnaCB0aGUgVVJMLCBjaGVjayBmb3IgY29uZmlnXG5cdFx0Ly8gYXR0cmlidXRlIGZyb20gc2VydmVyXG5cdFx0aWYgKCFmb3VuZFdvcmtzcGFjZSkge1xuXHRcdFx0aWYgKGNvbmZpZy5mb2xkZXJVcmkpIHtcblx0XHRcdFx0d29ya3NwYWNlID0geyBmb2xkZXJVcmk6IFVSSS5yZXZpdmUoY29uZmlnLmZvbGRlclVyaSkgfTtcblx0XHRcdH0gZWxzZSBpZiAoY29uZmlnLndvcmtzcGFjZVVyaSkge1xuXHRcdFx0XHR3b3Jrc3BhY2UgPSB7IHdvcmtzcGFjZVVyaTogVVJJLnJldml2ZShjb25maWcud29ya3NwYWNlVXJpKSB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgV29ya3NwYWNlUHJvdmlkZXIod29ya3NwYWNlLCBwYXlsb2FkLCBjb25maWcpO1xuXHR9XG5cblx0cmVhZG9ubHkgdHJ1c3RlZCA9IHRydWU7XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSB3b3Jrc3BhY2U6IElXb3Jrc3BhY2UsXG5cdFx0cmVhZG9ubHkgcGF5bG9hZDogb2JqZWN0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29uZmlnOiBJV29ya2JlbmNoQ29uc3RydWN0aW9uT3B0aW9uc1xuXHQpIHtcblx0fVxuXG5cdGFzeW5jIG9wZW4od29ya3NwYWNlOiBJV29ya3NwYWNlLCBvcHRpb25zPzogeyByZXVzZT86IGJvb2xlYW47IHBheWxvYWQ/OiBvYmplY3QgfSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmIChvcHRpb25zPy5yZXVzZSAmJiAhb3B0aW9ucy5wYXlsb2FkICYmIHRoaXMuaXNTYW1lKHRoaXMud29ya3NwYWNlLCB3b3Jrc3BhY2UpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gcmV0dXJuIGVhcmx5IGlmIHdvcmtzcGFjZSBhbmQgZW52aXJvbm1lbnQgaXMgbm90IGNoYW5naW5nIGFuZCB3ZSBhcmUgcmV1c2luZyB3aW5kb3dcblx0XHR9XG5cblx0XHRjb25zdCB0YXJnZXRIcmVmID0gdGhpcy5jcmVhdGVUYXJnZXRVcmwod29ya3NwYWNlLCBvcHRpb25zKTtcblx0XHRpZiAodGFyZ2V0SHJlZikge1xuXHRcdFx0aWYgKG9wdGlvbnM/LnJldXNlKSB7XG5cdFx0XHRcdG1haW5XaW5kb3cubG9jYXRpb24uaHJlZiA9IHRhcmdldEhyZWY7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IHJlc3VsdDtcblx0XHRcdFx0aWYgKGlzU3RhbmRhbG9uZSgpKSB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gbWFpbldpbmRvdy5vcGVuKHRhcmdldEhyZWYsICdfYmxhbmsnLCAndG9vbGJhcj1ubycpOyAvLyBlbnN1cmVzIHRvIG9wZW4gYW5vdGhlciAnc3RhbmRhbG9uZScgd2luZG93IVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdCA9IG1haW5XaW5kb3cub3Blbih0YXJnZXRIcmVmKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiAhIXJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVRhcmdldFVybCh3b3Jrc3BhY2U6IElXb3Jrc3BhY2UsIG9wdGlvbnM/OiB7IHJldXNlPzogYm9vbGVhbjsgcGF5bG9hZD86IG9iamVjdCB9KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblxuXHRcdC8vIEVtcHR5XG5cdFx0bGV0IHRhcmdldEhyZWY6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoIXdvcmtzcGFjZSkge1xuXHRcdFx0dGFyZ2V0SHJlZiA9IGAke2RvY3VtZW50LmxvY2F0aW9uLm9yaWdpbn0ke2RvY3VtZW50LmxvY2F0aW9uLnBhdGhuYW1lfT8ke1dvcmtzcGFjZVByb3ZpZGVyLlFVRVJZX1BBUkFNX0VNUFRZX1dJTkRPV309dHJ1ZWA7XG5cdFx0fVxuXG5cdFx0Ly8gRm9sZGVyXG5cdFx0ZWxzZSBpZiAoaXNGb2xkZXJUb09wZW4od29ya3NwYWNlKSkge1xuXHRcdFx0Y29uc3QgcXVlcnlQYXJhbUZvbGRlciA9IHRoaXMuZW5jb2RlV29ya3NwYWNlUGF0aCh3b3Jrc3BhY2UuZm9sZGVyVXJpKTtcblx0XHRcdHRhcmdldEhyZWYgPSBgJHtkb2N1bWVudC5sb2NhdGlvbi5vcmlnaW59JHtkb2N1bWVudC5sb2NhdGlvbi5wYXRobmFtZX0/JHtXb3Jrc3BhY2VQcm92aWRlci5RVUVSWV9QQVJBTV9GT0xERVJ9PSR7cXVlcnlQYXJhbUZvbGRlcn1gO1xuXHRcdH1cblxuXHRcdC8vIFdvcmtzcGFjZVxuXHRcdGVsc2UgaWYgKGlzV29ya3NwYWNlVG9PcGVuKHdvcmtzcGFjZSkpIHtcblx0XHRcdGNvbnN0IHF1ZXJ5UGFyYW1Xb3Jrc3BhY2UgPSB0aGlzLmVuY29kZVdvcmtzcGFjZVBhdGgod29ya3NwYWNlLndvcmtzcGFjZVVyaSk7XG5cdFx0XHR0YXJnZXRIcmVmID0gYCR7ZG9jdW1lbnQubG9jYXRpb24ub3JpZ2lufSR7ZG9jdW1lbnQubG9jYXRpb24ucGF0aG5hbWV9PyR7V29ya3NwYWNlUHJvdmlkZXIuUVVFUllfUEFSQU1fV09SS1NQQUNFfT0ke3F1ZXJ5UGFyYW1Xb3Jrc3BhY2V9YDtcblx0XHR9XG5cblx0XHQvLyBBcHBlbmQgcGF5bG9hZCBpZiBhbnlcblx0XHRpZiAob3B0aW9ucz8ucGF5bG9hZCkge1xuXHRcdFx0dGFyZ2V0SHJlZiArPSBgJiR7V29ya3NwYWNlUHJvdmlkZXIuUVVFUllfUEFSQU1fUEFZTE9BRH09JHtlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkob3B0aW9ucy5wYXlsb2FkKSl9YDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGFyZ2V0SHJlZjtcblx0fVxuXG5cdHByaXZhdGUgZW5jb2RlV29ya3NwYWNlUGF0aCh1cmk6IFVSSSk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuY29uZmlnLnJlbW90ZUF1dGhvcml0eSAmJiB1cmkuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZVJlbW90ZSkge1xuXG5cdFx0XHQvLyB3aGVuIGNvbm5lY3RlZCB0byBhIHJlbW90ZSBhbmQgaGF2aW5nIGEgZm9sZGVyXG5cdFx0XHQvLyBvciB3b3Jrc3BhY2UgZm9yIHRoYXQgcmVtb3RlLCBvbmx5IHVzZSB0aGUgcGF0aFxuXHRcdFx0Ly8gYXMgcXVlcnkgdmFsdWUgdG8gZm9ybSBzaG9ydGVyLCBuaWNlciBVUkxzLlxuXHRcdFx0Ly8gaG93ZXZlciwgd2Ugc3RpbGwgbmVlZCB0byBgZW5jb2RlVVJJQ29tcG9uZW50YFxuXHRcdFx0Ly8gdG8gZW5zdXJlIHRvIHByZXNlcnZlIHNwZWNpYWwgY2hhcmFjdGVycywgc3VjaFxuXHRcdFx0Ly8gYXMgYCtgIGluIHRoZSBwYXRoLlxuXG5cdFx0XHRyZXR1cm4gZW5jb2RlVVJJQ29tcG9uZW50KGAke3Bvc2l4LnNlcH0ke2x0cmltKHVyaS5wYXRoLCBwb3NpeC5zZXApfWApLnJlcGxhY2VBbGwoJyUyRicsICcvJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVuY29kZVVSSUNvbXBvbmVudCh1cmkudG9TdHJpbmcodHJ1ZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1NhbWUod29ya3NwYWNlQTogSVdvcmtzcGFjZSwgd29ya3NwYWNlQjogSVdvcmtzcGFjZSk6IGJvb2xlYW4ge1xuXHRcdGlmICghd29ya3NwYWNlQSB8fCAhd29ya3NwYWNlQikge1xuXHRcdFx0cmV0dXJuIHdvcmtzcGFjZUEgPT09IHdvcmtzcGFjZUI7IC8vIGJvdGggZW1wdHlcblx0XHR9XG5cblx0XHRpZiAoaXNGb2xkZXJUb09wZW4od29ya3NwYWNlQSkgJiYgaXNGb2xkZXJUb09wZW4od29ya3NwYWNlQikpIHtcblx0XHRcdHJldHVybiBpc0VxdWFsKHdvcmtzcGFjZUEuZm9sZGVyVXJpLCB3b3Jrc3BhY2VCLmZvbGRlclVyaSk7IC8vIHNhbWUgd29ya3NwYWNlXG5cdFx0fVxuXG5cdFx0aWYgKGlzV29ya3NwYWNlVG9PcGVuKHdvcmtzcGFjZUEpICYmIGlzV29ya3NwYWNlVG9PcGVuKHdvcmtzcGFjZUIpKSB7XG5cdFx0XHRyZXR1cm4gaXNFcXVhbCh3b3Jrc3BhY2VBLndvcmtzcGFjZVVyaSwgd29ya3NwYWNlQi53b3Jrc3BhY2VVcmkpOyAvLyBzYW1lIHdvcmtzcGFjZVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGhhc1JlbW90ZSgpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy53b3Jrc3BhY2UpIHtcblx0XHRcdGlmIChpc0ZvbGRlclRvT3Blbih0aGlzLndvcmtzcGFjZSkpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlLmZvbGRlclVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlUmVtb3RlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNXb3Jrc3BhY2VUb09wZW4odGhpcy53b3Jrc3BhY2UpKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLndvcmtzcGFjZS53b3Jrc3BhY2VVcmkuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZVJlbW90ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5mdW5jdGlvbiByZWFkQ29va2llKG5hbWU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGNvb2tpZXMgPSBkb2N1bWVudC5jb29raWUuc3BsaXQoJzsgJyk7XG5cdGZvciAoY29uc3QgY29va2llIG9mIGNvb2tpZXMpIHtcblx0XHRpZiAoY29va2llLnN0YXJ0c1dpdGgobmFtZSArICc9JykpIHtcblx0XHRcdHJldHVybiBjb29raWUuc3Vic3RyaW5nKG5hbWUubGVuZ3RoICsgMSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuKGZ1bmN0aW9uICgpIHtcblxuXHQvLyBGaW5kIGNvbmZpZyBieSBjaGVja2luZyBmb3IgRE9NXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRjb25zdCBjb25maWdFbGVtZW50ID0gbWFpbldpbmRvdy5kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndnNjb2RlLXdvcmtiZW5jaC13ZWItY29uZmlndXJhdGlvbicpO1xuXHRjb25zdCBjb25maWdFbGVtZW50QXR0cmlidXRlID0gY29uZmlnRWxlbWVudCA/IGNvbmZpZ0VsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLXNldHRpbmdzJykgOiB1bmRlZmluZWQ7XG5cdGlmICghY29uZmlnRWxlbWVudCB8fCAhY29uZmlnRWxlbWVudEF0dHJpYnV0ZSkge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWlzc2luZyB3ZWIgY29uZmlndXJhdGlvbiBlbGVtZW50Jyk7XG5cdH1cblx0Y29uc3QgY29uZmlnOiBJV29ya2JlbmNoQ29uc3RydWN0aW9uT3B0aW9ucyAmIHsgZm9sZGVyVXJpPzogVXJpQ29tcG9uZW50czsgd29ya3NwYWNlVXJpPzogVXJpQ29tcG9uZW50czsgY2FsbGJhY2tSb3V0ZTogc3RyaW5nIH0gPSBKU09OLnBhcnNlKGNvbmZpZ0VsZW1lbnRBdHRyaWJ1dGUpO1xuXHRjb25zdCBzZWNyZXRTdG9yYWdlS2V5UGF0aCA9IHJlYWRDb29raWUoJ3ZzY29kZS1zZWNyZXQta2V5LXBhdGgnKTtcblx0Y29uc3Qgc2VjcmV0U3RvcmFnZUNyeXB0byA9IHNlY3JldFN0b3JhZ2VLZXlQYXRoICYmIFNlcnZlcktleWVkQUVTQ3J5cHRvLnN1cHBvcnRlZCgpXG5cdFx0PyBuZXcgU2VydmVyS2V5ZWRBRVNDcnlwdG8oc2VjcmV0U3RvcmFnZUtleVBhdGgpIDogbmV3IFRyYW5zcGFyZW50Q3J5cHRvKCk7XG5cblx0Ly8gQ3JlYXRlIHdvcmtiZW5jaFxuXHRjcmVhdGUobWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LCB7XG5cdFx0Li4uY29uZmlnLFxuXHRcdHdpbmRvd0luZGljYXRvcjogY29uZmlnLndpbmRvd0luZGljYXRvciA/PyB7IGxhYmVsOiAnJChyZW1vdGUpJywgdG9vbHRpcDogYCR7cHJvZHVjdC5uYW1lU2hvcnR9IFdlYmAgfSxcblx0XHRzZXR0aW5nc1N5bmNPcHRpb25zOiBjb25maWcuc2V0dGluZ3NTeW5jT3B0aW9ucyA/IHsgZW5hYmxlZDogY29uZmlnLnNldHRpbmdzU3luY09wdGlvbnMuZW5hYmxlZCwgfSA6IHVuZGVmaW5lZCxcblx0XHR3b3Jrc3BhY2VQcm92aWRlcjogV29ya3NwYWNlUHJvdmlkZXIuY3JlYXRlKGNvbmZpZyksXG5cdFx0dXJsQ2FsbGJhY2tQcm92aWRlcjogbmV3IExvY2FsU3RvcmFnZVVSTENhbGxiYWNrUHJvdmlkZXIoY29uZmlnLmNhbGxiYWNrUm91dGUpLFxuXHRcdHNlY3JldFN0b3JhZ2VQcm92aWRlcjogY29uZmlnLnJlbW90ZUF1dGhvcml0eSAmJiAhc2VjcmV0U3RvcmFnZUtleVBhdGhcblx0XHRcdD8gdW5kZWZpbmVkIC8qIHdpdGggYSByZW1vdGUgd2l0aG91dCBlbWJlZGRlci1wcmVmZXJyZWQgc3RvcmFnZSwgc3RvcmUgb24gdGhlIHJlbW90ZSAqL1xuXHRcdFx0OiBuZXcgTG9jYWxTdG9yYWdlU2VjcmV0U3RvcmFnZVByb3ZpZGVyKHNlY3JldFN0b3JhZ2VDcnlwdG8pLFxuXHR9KTtcbn0pKCk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFVBQVUsY0FBYyxvQkFBb0I7QUFDckQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQStCO0FBQ3hDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxXQUEwQjtBQUNuQyxPQUFPLGFBQWE7QUFFcEIsU0FBUyxnQkFBZ0IseUJBQXlCO0FBSWxELFNBQVMsY0FBYztBQU92QixNQUFNLGtCQUFrRDtBQUFBLEVBRXZELE1BQU0sS0FBSyxNQUErQjtBQUN6QyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxPQUFPLE1BQStCO0FBQzNDLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFFQSxJQUFXLGVBQVgsa0JBQVdBLGtCQUFYO0FBQ0MsRUFBQUEsY0FBQSxlQUFZO0FBQ1osRUFBQUEsNEJBQUEsZ0JBQWEsT0FBYjtBQUNBLEVBQUFBLDRCQUFBLGVBQVksTUFBWjtBQUhVLFNBQUFBO0FBQUEsR0FBQTtBQU1YLE1BQU0scUJBQXFCLE1BQU07QUFBQSxFQUVoQyxZQUFZLE9BQWM7QUFDekIsVUFBTSxNQUFNLE9BQU87QUFDbkIsU0FBSyxPQUFPLE1BQU07QUFDbEIsU0FBSyxRQUFRLE1BQU07QUFBQSxFQUNwQjtBQUNEO0FBRUEsTUFBTSxxQkFBcUQ7QUFBQSxFQVcxRCxZQUE2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
