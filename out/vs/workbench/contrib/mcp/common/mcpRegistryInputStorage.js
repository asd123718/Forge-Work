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
import { Sequencer } from "../../../../base/common/async.js";
import { decodeBase64, encodeBase64, VSBuffer } from "../../../../base/common/buffer.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { isEmptyObject } from "../../../../base/common/types.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ISecretStorageService } from "../../../../platform/secrets/common/secrets.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
const MCP_ENCRYPTION_KEY_NAME = "mcpEncryptionKey";
const MCP_ENCRYPTION_KEY_ALGORITHM = "AES-GCM";
const MCP_ENCRYPTION_KEY_LEN = 256;
const MCP_ENCRYPTION_IV_LENGTH = 12;
const MCP_DATA_STORED_VERSION = 1;
const MCP_DATA_STORED_KEY = "mcpInputs";
let McpRegistryInputStorage = class extends Disposable {
  constructor(_scope, _target, _storageService, _secretStorageService, _logService) {
    super();
    this._scope = _scope;
    this._storageService = _storageService;
    this._secretStorageService = _secretStorageService;
    this._logService = _logService;
    this._secretsSealerSequencer = new Sequencer();
    this._getEncryptionKey = new Lazy(() => {
      return McpRegistryInputStorage.secretSequencer.queue(async () => {
        const existing = await this._secretStorageService.get(MCP_ENCRYPTION_KEY_NAME);
        if (existing) {
          try {
            const parsed = JSON.parse(existing);
            return await crypto.subtle.importKey("jwk", parsed, MCP_ENCRYPTION_KEY_ALGORITHM, false, ["encrypt", "decrypt"]);
          } catch {
          }
        }
        const key = await crypto.subtle.generateKey(
          { name: MCP_ENCRYPTION_KEY_ALGORITHM, length: MCP_ENCRYPTION_KEY_LEN },
          true,
          ["encrypt", "decrypt"]
        );
        const exported = await crypto.subtle.exportKey("jwk", key);
        await this._secretStorageService.set(MCP_ENCRYPTION_KEY_NAME, JSON.stringify(exported));
        return key;
      });
    });
    this._didChange = false;
    this._record = new Lazy(() => {
      const stored = this._storageService.getObject(MCP_DATA_STORED_KEY, this._scope);
      return stored?.version === MCP_DATA_STORED_VERSION ? { ...stored } : { version: MCP_DATA_STORED_VERSION, values: {} };
    });
    this._register(_storageService.onWillSaveState(() => {
      if (this._didChange) {
        this._storageService.store(MCP_DATA_STORED_KEY, {
          version: MCP_DATA_STORED_VERSION,
          values: this._record.value.values,
          secrets: this._record.value.secrets
        }, this._scope, _target);
        this._didChange = false;
      }
    }));
  }
  /** Deletes all collection data from storage. */
  clearAll() {
    this._record.value.values = {};
    this._record.value.secrets = void 0;
    this._record.value.unsealedSecrets = void 0;
    this._didChange = true;
  }
  /** Delete a single collection data from the storage. */
  async clear(inputKey) {
    const secrets = await this._unsealSecrets();
    delete this._record.value.values[inputKey];
    this._didChange = true;
    if (secrets.hasOwnProperty(inputKey)) {
      delete secrets[inputKey];
      await this._sealSecrets();
    }
  }
  /** Gets a mapping of saved input data. */
  async getMap() {
    const secrets = await this._unsealSecrets();
    return { ...this._record.value.values, ...secrets };
  }
  /** Updates the input data mapping. */
  async setPlainText(values) {
    Object.assign(this._record.value.values, values);
    this._didChange = true;
  }
  /** Updates the input secrets mapping. */
  async setSecrets(values) {
    const unsealed = await this._unsealSecrets();
    Object.assign(unsealed, values);
    await this._sealSecrets();
  }
  async _sealSecrets() {
    const key = await this._getEncryptionKey.value;
    return this._secretsSealerSequencer.queue(async () => {
      if (!this._record.value.unsealedSecrets || isEmptyObject(this._record.value.unsealedSecrets)) {
        this._record.value.secrets = void 0;
        return;
      }
      const toSeal = JSON.stringify(this._record.value.unsealedSecrets);
      const iv = crypto.getRandomValues(new Uint8Array(MCP_ENCRYPTION_IV_LENGTH));
      const encrypted = await crypto.subtle.encrypt(
        { name: MCP_ENCRYPTION_KEY_ALGORITHM, iv: iv.buffer },
        key,
        new TextEncoder().encode(toSeal).buffer
      );
      const enc = encodeBase64(VSBuffer.wrap(new Uint8Array(encrypted)));
      this._record.value.secrets = { iv: encodeBase64(VSBuffer.wrap(iv)), value: enc };
      this._didChange = true;
    });
  }
  async _unsealSecrets() {
    if (!this._record.value.secrets) {
      return this._record.value.unsealedSecrets ??= {};
    }
    if (this._record.value.unsealedSecrets) {
      return this._record.value.unsealedSecrets;
    }
    try {
      const key = await this._getEncryptionKey.value;
      const iv = decodeBase64(this._record.value.secrets.iv);
      const encrypted = decodeBase64(this._record.value.secrets.value);
      const decrypted = await crypto.subtle.decrypt(
        { name: MCP_ENCRYPTION_KEY_ALGORITHM, iv: iv.buffer },
        key,
        encrypted.buffer
      );
      const unsealedSecrets = JSON.parse(new TextDecoder().decode(decrypted));
      this._record.value.unsealedSecrets = unsealedSecrets;
      return unsealedSecrets;
    } catch (e) {
      this._logService.warn("Error unsealing MCP secrets", e);
      this._record.value.secrets = void 0;
    }
    return {};
  }
};
McpRegistryInputStorage.secretSequencer = new Sequencer();
McpRegistryInputStorage = __decorateClass([
  __decorateParam(2, IStorageService),
  __decorateParam(3, ISecretStorageService),
  __decorateParam(4, ILogService)
], McpRegistryInputStorage);
export {
  McpRegistryInputStorage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcY29tbW9uXFxtY3BSZWdpc3RyeUlucHV0U3RvcmFnZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFNlcXVlbmNlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGRlY29kZUJhc2U2NCwgZW5jb2RlQmFzZTY0LCBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzRW1wdHlPYmplY3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTZWNyZXRTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3NlY3JldHMvY29tbW9uL3NlY3JldHMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uLmpzJztcblxuY29uc3QgTUNQX0VOQ1JZUFRJT05fS0VZX05BTUUgPSAnbWNwRW5jcnlwdGlvbktleSc7XG5jb25zdCBNQ1BfRU5DUllQVElPTl9LRVlfQUxHT1JJVEhNID0gJ0FFUy1HQ00nO1xuY29uc3QgTUNQX0VOQ1JZUFRJT05fS0VZX0xFTiA9IDI1NjtcbmNvbnN0IE1DUF9FTkNSWVBUSU9OX0lWX0xFTkdUSCA9IDEyOyAvLyA5NiBiaXRzXG5jb25zdCBNQ1BfREFUQV9TVE9SRURfVkVSU0lPTiA9IDE7XG5jb25zdCBNQ1BfREFUQV9TVE9SRURfS0VZID0gJ21jcElucHV0cyc7XG5cbmludGVyZmFjZSBJU3RvcmVkRGF0YSB7XG5cdHZlcnNpb246IG51bWJlcjtcblx0dmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCBJUmVzb2x2ZWRWYWx1ZT47XG5cdHNlY3JldHM/OiB7IHZhbHVlOiBzdHJpbmc7IGl2OiBzdHJpbmcgfTsgLy8gYmFzZTY0LCBlbmNyeXB0ZWRcbn1cblxuaW50ZXJmYWNlIElIeWRyYXRlZERhdGEgZXh0ZW5kcyBJU3RvcmVkRGF0YSB7XG5cdHVuc2VhbGVkU2VjcmV0cz86IFJlY29yZDxzdHJpbmcsIElSZXNvbHZlZFZhbHVlPjtcbn1cblxuZXhwb3J0IGNsYXNzIE1jcFJlZ2lzdHJ5SW5wdXRTdG9yYWdlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgc3RhdGljIHNlY3JldFNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXIoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2VjcmV0c1NlYWxlclNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXIoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9nZXRFbmNyeXB0aW9uS2V5ID0gbmV3IExhenkoKCkgPT4ge1xuXHRcdHJldHVybiBNY3BSZWdpc3RyeUlucHV0U3RvcmFnZS5zZWNyZXRTZXF1ZW5jZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSBhd2FpdCB0aGlzLl9zZWNyZXRTdG9yYWdlU2VydmljZS5nZXQoTUNQX0VOQ1JZUFRJT05fS0VZX05BTUUpO1xuXHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgcGFyc2VkOiBKc29uV2ViS2V5ID0gSlNPTi5wYXJzZShleGlzdGluZyk7XG5cdFx0XHRcdFx0cmV0dXJuIGF3YWl0IGNyeXB0by5zdWJ0bGUuaW1wb3J0S2V5KCdqd2snLCBwYXJzZWQsIE1DUF9FTkNSWVBUSU9OX0tFWV9BTEdPUklUSE0sIGZhbHNlLCBbJ2VuY3J5cHQnLCAnZGVjcnlwdCddKTtcblx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0Ly8gZmFsbCB0aHJvdWdoXG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qga2V5ID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5nZW5lcmF0ZUtleShcblx0XHRcdFx0eyBuYW1lOiBNQ1BfRU5DUllQVElPTl9LRVlfQUxHT1JJVEhNLCBsZW5ndGg6IE1DUF9FTkNSWVBUSU9OX0tFWV9MRU4gfSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0WydlbmNyeXB0JywgJ2RlY3J5cHQnXSxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IGV4cG9ydGVkID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5leHBvcnRLZXkoJ2p3aycsIGtleSk7XG5cdFx0XHRhd2FpdCB0aGlzLl9zZWNyZXRTdG9yYWdlU2VydmljZS5zZXQoTUNQX0VOQ1JZUFRJT05fS0VZX05BTUUsIEpTT04uc3RyaW5naWZ5KGV4cG9ydGVkKSk7XG5cdFx0XHRyZXR1cm4ga2V5O1xuXHRcdH0pO1xuXHR9KTtcblxuXHRwcml2YXRlIF9kaWRDaGFuZ2UgPSBmYWxzZTtcblxuXHRwcml2YXRlIF9yZWNvcmQgPSBuZXcgTGF6eTxJSHlkcmF0ZWREYXRhPigoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmVkID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0T2JqZWN0PElTdG9yZWREYXRhPihNQ1BfREFUQV9TVE9SRURfS0VZLCB0aGlzLl9zY29wZSk7XG5cdFx0cmV0dXJuIHN0b3JlZD8udmVyc2lvbiA9PT0gTUNQX0RBVEFfU1RPUkVEX1ZFUlNJT04gPyB7IC4uLnN0b3JlZCB9IDogeyB2ZXJzaW9uOiBNQ1BfREFUQV9TVE9SRURfVkVSU0lPTiwgdmFsdWVzOiB7fSB9O1xuXHR9KTtcblxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Njb3BlOiBTdG9yYWdlU2NvcGUsXG5cdFx0X3RhcmdldDogU3RvcmFnZVRhcmdldCxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElTZWNyZXRTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZWNyZXRTdG9yYWdlU2VydmljZTogSVNlY3JldFN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKF9zdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2RpZENoYW5nZSkge1xuXHRcdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShNQ1BfREFUQV9TVE9SRURfS0VZLCB7XG5cdFx0XHRcdFx0dmVyc2lvbjogTUNQX0RBVEFfU1RPUkVEX1ZFUlNJT04sXG5cdFx0XHRcdFx0dmFsdWVzOiB0aGlzLl9yZWNvcmQudmFsdWUudmFsdWVzLFxuXHRcdFx0XHRcdHNlY3JldHM6IHRoaXMuX3JlY29yZC52YWx1ZS5zZWNyZXRzLFxuXHRcdFx0XHR9IHNhdGlzZmllcyBJU3RvcmVkRGF0YSwgdGhpcy5fc2NvcGUsIF90YXJnZXQpO1xuXHRcdFx0XHR0aGlzLl9kaWRDaGFuZ2UgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKiogRGVsZXRlcyBhbGwgY29sbGVjdGlvbiBkYXRhIGZyb20gc3RvcmFnZS4gKi9cblx0cHVibGljIGNsZWFyQWxsKCkge1xuXHRcdHRoaXMuX3JlY29yZC52YWx1ZS52YWx1ZXMgPSB7fTtcblx0XHR0aGlzLl9yZWNvcmQudmFsdWUuc2VjcmV0cyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9yZWNvcmQudmFsdWUudW5zZWFsZWRTZWNyZXRzID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2RpZENoYW5nZSA9IHRydWU7XG5cdH1cblxuXHQvKiogRGVsZXRlIGEgc2luZ2xlIGNvbGxlY3Rpb24gZGF0YSBmcm9tIHRoZSBzdG9yYWdlLiAqL1xuXHRwdWJsaWMgYXN5bmMgY2xlYXIoaW5wdXRLZXk6IHN0cmluZykge1xuXHRcdGNvbnN0IHNlY3JldHMgPSBhd2FpdCB0aGlzLl91bnNlYWxTZWNyZXRzKCk7XG5cdFx0ZGVsZXRlIHRoaXMuX3JlY29yZC52YWx1ZS52YWx1ZXNbaW5wdXRLZXldO1xuXHRcdHRoaXMuX2RpZENoYW5nZSA9IHRydWU7XG5cblx0XHRpZiAoc2VjcmV0cy5oYXNPd25Qcm9wZXJ0eShpbnB1dEtleSkpIHtcblx0XHRcdGRlbGV0ZSBzZWNyZXRzW2lucHV0S2V5XTtcblx0XHRcdGF3YWl0IHRoaXMuX3NlYWxTZWNyZXRzKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIEdldHMgYSBtYXBwaW5nIG9mIHNhdmVkIGlucHV0IGRhdGEuICovXG5cdHB1YmxpYyBhc3luYyBnZXRNYXAoKSB7XG5cdFx0Y29uc3Qgc2VjcmV0cyA9IGF3YWl0IHRoaXMuX3Vuc2VhbFNlY3JldHMoKTtcblx0XHRyZXR1cm4geyAuLi50aGlzLl9yZWNvcmQudmFsdWUudmFsdWVzLCAuLi5zZWNyZXRzIH07XG5cdH1cblxuXHQvKiogVXBkYXRlcyB0aGUgaW5wdXQgZGF0YSBtYXBwaW5nLiAqL1xuXHRwdWJsaWMgYXN5bmMgc2V0UGxhaW5UZXh0KHZhbHVlczogUmVjb3JkPHN0cmluZywgSVJlc29sdmVkVmFsdWU+KSB7XG5cdFx0T2JqZWN0LmFzc2lnbih0aGlzLl9yZWNvcmQudmFsdWUudmFsdWVzLCB2YWx1ZXMpO1xuXHRcdHRoaXMuX2RpZENoYW5nZSA9IHRydWU7XG5cdH1cblxuXHQvKiogVXBkYXRlcyB0aGUgaW5wdXQgc2VjcmV0cyBtYXBwaW5nLiAqL1xuXHRwdWJsaWMgYXN5bmMgc2V0U2VjcmV0cyh2YWx1ZXM6IFJlY29yZDxzdHJpbmcsIElSZXNvbHZlZFZhbHVlPikge1xuXHRcdGNvbnN0IHVuc2VhbGVkID0gYXdhaXQgdGhpcy5fdW5zZWFsU2VjcmV0cygpO1xuXHRcdE9iamVjdC5hc3NpZ24odW5zZWFsZWQsIHZhbHVlcyk7XG5cdFx0YXdhaXQgdGhpcy5fc2VhbFNlY3JldHMoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NlYWxTZWNyZXRzKCkge1xuXHRcdGNvbnN0IGtleSA9IGF3YWl0IHRoaXMuX2dldEVuY3J5cHRpb25LZXkudmFsdWU7XG5cdFx0cmV0dXJuIHRoaXMuX3NlY3JldHNTZWFsZXJTZXF1ZW5jZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9yZWNvcmQudmFsdWUudW5zZWFsZWRTZWNyZXRzIHx8IGlzRW1wdHlPYmplY3QodGhpcy5fcmVjb3JkLnZhbHVlLnVuc2VhbGVkU2VjcmV0cykpIHtcblx0XHRcdFx0dGhpcy5fcmVjb3JkLnZhbHVlLnNlY3JldHMgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdG9TZWFsID0gSlNPTi5zdHJpbmdpZnkodGhpcy5fcmVjb3JkLnZhbHVlLnVuc2VhbGVkU2VjcmV0cyk7XG5cdFx0XHRjb25zdCBpdiA9IGNyeXB0by5nZXRSYW5kb21WYWx1ZXMobmV3IFVpbnQ4QXJyYXkoTUNQX0VOQ1JZUFRJT05fSVZfTEVOR1RIKSk7XG5cdFx0XHRjb25zdCBlbmNyeXB0ZWQgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmVuY3J5cHQoXG5cdFx0XHRcdHsgbmFtZTogTUNQX0VOQ1JZUFRJT05fS0VZX0FMR09SSVRITSwgaXY6IGl2LmJ1ZmZlciB9LFxuXHRcdFx0XHRrZXksXG5cdFx0XHRcdG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSh0b1NlYWwpLmJ1ZmZlciBhcyBBcnJheUJ1ZmZlcixcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IGVuYyA9IGVuY29kZUJhc2U2NChWU0J1ZmZlci53cmFwKG5ldyBVaW50OEFycmF5KGVuY3J5cHRlZCkpKTtcblx0XHRcdHRoaXMuX3JlY29yZC52YWx1ZS5zZWNyZXRzID0geyBpdjogZW5jb2RlQmFzZTY0KFZTQnVmZmVyLndyYXAoaXYpKSwgdmFsdWU6IGVuYyB9O1xuXHRcdFx0dGhpcy5fZGlkQ2hhbmdlID0gdHJ1ZTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Vuc2VhbFNlY3JldHMoKTogUHJvbWlzZTxSZWNvcmQ8c3RyaW5nLCBJUmVzb2x2ZWRWYWx1ZT4+IHtcblx0XHRpZiAoIXRoaXMuX3JlY29yZC52YWx1ZS5zZWNyZXRzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVjb3JkLnZhbHVlLnVuc2VhbGVkU2VjcmV0cyA/Pz0ge307XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3JlY29yZC52YWx1ZS51bnNlYWxlZFNlY3JldHMpIHtcblx0XHRcdHJldHVybiB0aGlzLl9yZWNvcmQudmFsdWUudW5zZWFsZWRTZWNyZXRzO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBrZXkgPSBhd2FpdCB0aGlzLl9nZXRFbmNyeXB0aW9uS2V5LnZhbHVlO1xuXHRcdFx0Y29uc3QgaXYgPSBkZWNvZGVCYXNlNjQodGhpcy5fcmVjb3JkLnZhbHVlLnNlY3JldHMuaXYpO1xuXHRcdFx0Y29uc3QgZW5jcnlwdGVkID0gZGVjb2RlQmFzZTY0KHRoaXMuX3JlY29yZC52YWx1ZS5zZWNyZXRzLnZhbHVlKTtcblxuXHRcdFx0Y29uc3QgZGVjcnlwdGVkID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5kZWNyeXB0KFxuXHRcdFx0XHR7IG5hbWU6IE1DUF9FTkNSWVBUSU9OX0tFWV9BTEdPUklUSE0sIGl2OiBpdi5idWZmZXIgYXMgVWludDhBcnJheTxBcnJheUJ1ZmZlcj4gfSxcblx0XHRcdFx0a2V5LFxuXHRcdFx0XHRlbmNyeXB0ZWQuYnVmZmVyIGFzIFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXI+LFxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgdW5zZWFsZWRTZWNyZXRzID0gSlNPTi5wYXJzZShuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoZGVjcnlwdGVkKSk7XG5cdFx0XHR0aGlzLl9yZWNvcmQudmFsdWUudW5zZWFsZWRTZWNyZXRzID0gdW5zZWFsZWRTZWNyZXRzO1xuXHRcdFx0cmV0dXJuIHVuc2VhbGVkU2VjcmV0cztcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ0Vycm9yIHVuc2VhbGluZyBNQ1Agc2VjcmV0cycsIGUpO1xuXHRcdFx0dGhpcy5fcmVjb3JkLnZhbHVlLnNlY3JldHMgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHt9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsY0FBYyxjQUFjLGdCQUFn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
