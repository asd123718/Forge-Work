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
import { DeferredPromise } from "../../../../base/common/async.js";
import { VSBuffer, decodeBase64 } from "../../../../base/common/buffer.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { derived, observableValue } from "../../../../base/common/observable.js";
import { extUri } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import {
  AgentHostAccessMode,
  AgentHostLocalFilePermissionsSettingId,
  AgentHostPermissionMode,
  AgentHostResourcePermissionError,
  IAgentHostResourceService,
  LOCAL_AGENT_HOST_RESOURCE_IDENTITY
} from "../../../../platform/agentHost/common/agentHostResourceService.js";
import { normalizeRemoteAgentHostAddress } from "../../../../platform/agentHost/common/agentHostUri.js";
import {
  ContentEncoding,
  ResourceType
} from "../../../../platform/agentHost/common/state/protocol/commands.js";
import { ROOT_STATE_URI } from "../../../../platform/agentHost/common/state/sessionState.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ILogService } from "../../../../platform/log/common/log.js";
function normalizeResourceIdentity(identity) {
  return identity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY ? identity : normalizeRemoteAgentHostAddress(identity);
}
let AgentHostResourceService = class extends Disposable {
  constructor(_configurationService, _fileService, _textModelService, _logService) {
    super();
    this._configurationService = _configurationService;
    this._fileService = _fileService;
    this._textModelService = _textModelService;
    this._logService = _logService;
    this._inMemoryGrants = /* @__PURE__ */ new Map();
    this._pending = observableValue("agentHostResources.pending", []);
    this.allPending = this._pending;
  }
  // ---- Gated FS operations ------------------------------------------------
  async list(identity, uri) {
    await this._gate(identity, uri, AgentHostPermissionMode.Read, { channel: ROOT_STATE_URI, uri: uri.toString(), read: true });
    const stat = await this._fileService.resolve(uri);
    if (!stat.isDirectory) {
      throw new Error(`Resource is not a directory: ${uri.toString()}`);
    }
    return {
      entries: (stat.children ?? []).map((c) => ({
        name: c.name,
        type: c.isDirectory ? "directory" : "file"
      }))
    };
  }
  async read(identity, uri) {
    await this._gate(identity, uri, AgentHostPermissionMode.Read, { channel: ROOT_STATE_URI, uri: uri.toString(), read: true });
    try {
      const content = await this._fileService.readFile(uri);
      return { bytes: content.value };
    } catch (err) {
      const virtual = await this._readVirtual(uri);
      if (virtual) {
        return { bytes: virtual };
      }
      throw err;
    }
  }
  async write(identity, params) {
    const uri = URI.parse(params.uri);
    await this._gate(identity, uri, AgentHostPermissionMode.Write, { channel: ROOT_STATE_URI, uri: uri.toString(), write: true });
    const buf = params.encoding === ContentEncoding.Base64 ? decodeBase64(params.data) : VSBuffer.fromString(params.data);
    try {
      if (params.createOnly) {
        await this._fileService.createFile(uri, buf, { overwrite: false });
      } else {
        await this._fileService.writeFile(uri, buf);
      }
    } catch (err) {
      if (await this._writeVirtual(uri, buf)) {
        return;
      }
      throw err;
    }
  }
  async del(identity, params) {
    const uri = URI.parse(params.uri);
    await this._gate(identity, uri, AgentHostPermissionMode.Write, { channel: ROOT_STATE_URI, uri: uri.toString(), write: true });
    await this._fileService.del(uri, { recursive: !!params.recursive });
  }
  async move(identity, params) {
    const source = URI.parse(params.source);
    const destination = URI.parse(params.destination);
    await this._gate(identity, source, AgentHostPermissionMode.Write, { channel: ROOT_STATE_URI, uri: source.toString(), write: true });
    await this._gate(identity, destination, AgentHostPermissionMode.Write, { channel: ROOT_STATE_URI, uri: destination.toString(), write: true });
    await this._fileService.move(source, destination, !params.failIfExists);
  }
  async copy(identity, params) {
    const source = URI.parse(params.source);
    const destination = URI.parse(params.destination);
    await this._gate(identity, source, AgentHostPermissionMode.Read, { channel: ROOT_STATE_URI, uri: source.toString(), read: true });
    await this._gate(identity, destination, AgentHostPermissionMode.Write, { channel: ROOT_STATE_URI, uri: destination.toString(), write: true });
    await this._fileService.copy(source, destination, !params.failIfExists);
  }
  async resolve(identity, params) {
    const uri = URI.parse(params.uri);
    await this._gate(identity, uri, AgentHostPermissionMode.Read, { channel: ROOT_STATE_URI, uri: uri.toString(), read: true });
    let stat;
    try {
      stat = await this._fileService.stat(uri);
    } catch (err) {
      const virtual = await this._statVirtual(uri);
      if (virtual) {
        return virtual;
      }
      throw err;
    }
    let type;
    if (stat.isSymbolicLink && params.followSymlinks === false) {
      type = ResourceType.Symlink;
    } else if (stat.isDirectory) {
      type = ResourceType.Directory;
    } else {
      type = ResourceType.File;
    }
    return {
      uri: uri.toString(),
      type,
      ...stat.size !== void 0 ? { size: stat.size } : {},
      ...stat.mtime !== void 0 ? { mtime: new Date(stat.mtime).toISOString() } : {},
      ...stat.ctime !== void 0 ? { ctime: new Date(stat.ctime).toISOString() } : {},
      ...stat.etag ? { etag: stat.etag } : {}
    };
  }
  async mkdir(identity, params) {
    const uri = URI.parse(params.uri);
    await this._gate(identity, uri, AgentHostPermissionMode.Write, { channel: ROOT_STATE_URI, uri: uri.toString(), write: true });
    const existing = await this._fileService.stat(uri).catch(() => void 0);
    if (existing && !existing.isDirectory) {
      throw new Error(`Path exists and is not a directory: ${uri.toString()}`);
    }
    await this._fileService.createFolder(uri);
  }
  // ---- Permission requests / observables ---------------------------------
  async check(identity, uri, mode) {
    const normalized = normalizeResourceIdentity(identity);
    const canonical = await this._canonicalize(uri);
    return this._isCovered(normalized, canonical, mode);
  }
  async request(identity, params) {
    const normalized = normalizeResourceIdentity(identity);
    const canonical = await this._canonicalize(URI.parse(params.uri));
    if (normalized === LOCAL_AGENT_HOST_RESOURCE_IDENTITY) {
      return;
    }
    const wantsWrite = params.write === true;
    const wantsRead = params.read === true || !wantsWrite;
    if (wantsRead && !await this._isCovered(normalized, canonical, AgentHostPermissionMode.Read)) {
      await this._enqueue(normalized, canonical, AgentHostPermissionMode.Read);
    }
    if (wantsWrite && !await this._isCovered(normalized, canonical, AgentHostPermissionMode.Write)) {
      await this._enqueue(normalized, canonical, AgentHostPermissionMode.Write);
    }
  }
  pendingFor(address) {
    const normalized = normalizeRemoteAgentHostAddress(address);
    return derived((reader) => this._pending.read(reader).filter((r) => r.address === normalized));
  }
  findPending(id) {
    return this._pending.get().find((r) => r.id === id);
  }
  grantImplicitRead(identity, uri) {
    const handle = generateUuid();
    const lexical = extUri.normalizePath(uri);
    const realpath = this._fileService.realpath(lexical).then(
      (real) => real ?? lexical,
      () => lexical
    );
    this._inMemoryGrants.set(handle, {
      identity: normalizeResourceIdentity(identity),
      realpath,
      mode: AgentHostAccessMode.Read
    });
    return toDisposable(() => this._inMemoryGrants.delete(handle));
  }
  connectionClosed(identity) {
    const normalized = normalizeResourceIdentity(identity);
    for (const [handle, grant] of this._inMemoryGrants) {
      if (grant.identity === normalized) {
        this._inMemoryGrants.delete(handle);
      }
    }
    if (normalized === LOCAL_AGENT_HOST_RESOURCE_IDENTITY) {
      return;
    }
    const cancel = new CancellationError();
    const remaining = [];
    for (const request of this._pending.get()) {
      if (request.address === normalized) {
        request.deferred.error(cancel);
      } else {
        remaining.push(request);
      }
    }
    if (remaining.length !== this._pending.get().length) {
      this._pending.set(remaining, void 0);
    }
  }
  // ---- internals ---------------------------------------------------------
  async _gate(identity, uri, mode, deniedRequest) {
    if (!await this.check(identity, uri, mode)) {
      throw new AgentHostResourcePermissionError(deniedRequest);
    }
  }
  async _readVirtual(uri) {
    try {
      const ref = await this._textModelService.createModelReference(uri);
      try {
        return VSBuffer.fromString(ref.object.textEditorModel.getValue());
      } finally {
        ref.dispose();
      }
    } catch {
      return void 0;
    }
  }
  /**
   * Write {@link bytes} as text into the resolved text model for {@link uri},
   * if one can be resolved and is writable. Returns `true` when the model was
   * updated, `false` otherwise (no provider, readonly, decode failure).
   */
  async _writeVirtual(uri, bytes) {
    try {
      const ref = await this._textModelService.createModelReference(uri);
      try {
        if (ref.object.isReadonly()) {
          return false;
        }
        ref.object.textEditorModel.setValue(bytes.toString());
        return true;
      } finally {
        ref.dispose();
      }
    } catch {
      return false;
    }
  }
  /**
   * Resolve {@link uri} via {@link ITextModelService} and synthesize a
   * {@link ResourceResolveResult} so virtual resources stat as `File` with
   * a size matching their text content. Returns `undefined` if no model
   * can be resolved.
   */
  async _statVirtual(uri) {
    try {
      const ref = await this._textModelService.createModelReference(uri);
      try {
        const size = VSBuffer.fromString(ref.object.textEditorModel.getValue()).byteLength;
        return {
          uri: uri.toString(),
          type: ResourceType.File,
          size
        };
      } finally {
        ref.dispose();
      }
    } catch {
      return void 0;
    }
  }
  /**
   * Resolve {@link uri} against the local filesystem, collapsing `..`
   * segments and following symlinks so the policy check sees the same
   * path the OS will actually open. For URIs that don't exist (e.g. a
   * `resourceWrite` for a new file), realpath the deepest existing
   * ancestor and re-append the leaf.
   */
  async _canonicalize(uri) {
    const normalized = extUri.normalizePath(uri);
    const real = await this._fileService.realpath(normalized).catch(() => void 0);
    if (real) {
      return real;
    }
    const parent = extUri.dirname(normalized);
    if (extUri.isEqual(parent, normalized)) {
      return normalized;
    }
    const realParent = await this._fileService.realpath(parent).catch(() => void 0);
    return realParent ? extUri.joinPath(realParent, extUri.basename(normalized)) : normalized;
  }
  async _isCovered(identity, canonicalUri, mode) {
    if (identity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY) {
      return true;
    }
    const requireWrite = mode === AgentHostPermissionMode.Write;
    for (const grant of this._readPersistedGrants(identity)) {
      if (requireWrite && grant.mode !== AgentHostAccessMode.ReadWrite) {
        continue;
      }
      if (extUri.isEqualOrParent(canonicalUri, grant.uri)) {
        return true;
      }
    }
    const candidates = [];
    for (const grant of this._inMemoryGrants.values()) {
      if (grant.identity !== identity) {
        continue;
      }
      if (requireWrite && grant.mode !== AgentHostAccessMode.ReadWrite) {
        continue;
      }
      candidates.push(grant.realpath);
    }
    const realpaths = await Promise.all(candidates);
    return realpaths.some((uri) => extUri.isEqualOrParent(canonicalUri, uri));
  }
  _enqueue(address, canonicalUri, mode) {
    const existing = this._pending.get().find((r) => r.address === address && r.mode === mode && extUri.isEqual(r.uri, canonicalUri));
    if (existing) {
      return existing.deferred.p;
    }
    const deferred = new DeferredPromise();
    const request = {
      id: generateUuid(),
      address,
      uri: canonicalUri,
      mode,
      deferred,
      allow: () => this._resolve(request, "memory"),
      allowAlways: () => this._resolve(request, "persist"),
      deny: () => {
        this._dropPending(request);
        deferred.error(new CancellationError());
      }
    };
    this._pending.set([...this._pending.get(), request], void 0);
    return deferred.p;
  }
  _resolve(request, scope) {
    const accessMode = request.mode === AgentHostPermissionMode.Write ? AgentHostAccessMode.ReadWrite : AgentHostAccessMode.Read;
    this._inMemoryGrants.set(generateUuid(), {
      identity: request.address,
      realpath: Promise.resolve(request.uri),
      mode: accessMode
    });
    if (scope === "persist") {
      void this._persistGrant(request.address, request.uri, request.mode).catch((err) => {
        this._logService.warn("[AgentHostResourceService] Failed to persist grant", err);
      });
    }
    this._dropPending(request);
    request.deferred.complete();
  }
  _dropPending(request) {
    const next = this._pending.get().filter((r) => r !== request);
    if (next.length !== this._pending.get().length) {
      this._pending.set(next, void 0);
    }
  }
  *_readPersistedGrants(address) {
    const forAddress = this._configurationService.getValue(AgentHostLocalFilePermissionsSettingId)?.[address];
    if (!forAddress) {
      return;
    }
    for (const [uriStr, mode] of Object.entries(forAddress)) {
      if (mode !== AgentHostAccessMode.Read && mode !== AgentHostAccessMode.ReadWrite) {
        continue;
      }
      try {
        yield { uri: URI.parse(uriStr), mode };
      } catch {
      }
    }
  }
  async _persistGrant(address, uri, mode) {
    const requested = mode === AgentHostPermissionMode.Write ? AgentHostAccessMode.ReadWrite : AgentHostAccessMode.Read;
    for (const grant of this._readPersistedGrants(address)) {
      const covers = grant.mode === AgentHostAccessMode.ReadWrite || requested === AgentHostAccessMode.Read;
      if (covers && extUri.isEqualOrParent(uri, grant.uri)) {
        return;
      }
    }
    const { target, value } = this._inspectScopedSetting();
    const forAddress = { ...value[address] ?? {} };
    const uriKey = uri.toString();
    if (forAddress[uriKey] === AgentHostAccessMode.ReadWrite) {
      return;
    }
    forAddress[uriKey] = requested;
    await this._configurationService.updateValue(
      AgentHostLocalFilePermissionsSettingId,
      { ...value, [address]: forAddress },
      target
    );
  }
  _inspectScopedSetting() {
    const inspected = this._configurationService.inspect(AgentHostLocalFilePermissionsSettingId);
    if (inspected.applicationValue !== void 0) {
      return { target: ConfigurationTarget.APPLICATION, value: inspected.applicationValue };
    }
    if (inspected.userLocalValue !== void 0) {
      return { target: ConfigurationTarget.USER_LOCAL, value: inspected.userLocalValue };
    }
    if (inspected.userRemoteValue !== void 0) {
      return { target: ConfigurationTarget.USER_REMOTE, value: inspected.userRemoteValue };
    }
    if (inspected.userValue !== void 0) {
      return { target: ConfigurationTarget.USER, value: inspected.userValue };
    }
    return { target: ConfigurationTarget.APPLICATION, value: {} };
  }
};
AgentHostResourceService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IFileService),
  __decorateParam(2, ITextModelService),
  __decorateParam(3, ILogService)
], AgentHostResourceService);
registerSingleton(IAgentHostResourceService, AgentHostResourceService, InstantiationType.Delayed);
export {
  AgentHostResourceService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxhZ2VudEhvc3RcXGNvbW1vblxcYWdlbnRIb3N0UmVzb3VyY2VTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIsIGRlY29kZUJhc2U2NCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBkZXJpdmVkLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGV4dFVyaSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7XG5cdEFnZW50SG9zdEFjY2Vzc01vZGUsXG5cdEFnZW50SG9zdExvY2FsRmlsZVBlcm1pc3Npb25zU2V0dGluZ0lkLFxuXHRBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZSxcblx0QWdlbnRIb3N0UGVybWlzc2lvbnNTZXR0aW5nLFxuXHRBZ2VudEhvc3RSZXNvdXJjZUlkZW50aXR5LFxuXHRBZ2VudEhvc3RSZXNvdXJjZVBlcm1pc3Npb25FcnJvcixcblx0SUFnZW50SG9zdFJlc291cmNlU2VydmljZSxcblx0SVBlbmRpbmdSZXNvdXJjZVJlcXVlc3QsXG5cdElSZXNvdXJjZUxpc3RSZXN1bHQsXG5cdElSZXNvdXJjZVJlYWRSZXN1bHQsXG5cdExPQ0FMX0FHRU5UX0hPU1RfUkVTT1VSQ0VfSURFTlRJVFksXG59IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0UmVzb3VyY2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IG5vcm1hbGl6ZVJlbW90ZUFnZW50SG9zdEFkZHJlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFVyaS5qcyc7XG5pbXBvcnQge1xuXHRDb250ZW50RW5jb2RpbmcsXG5cdFJlc291cmNlQ29weVBhcmFtcywgUmVzb3VyY2VEZWxldGVQYXJhbXMsIFJlc291cmNlTWtkaXJQYXJhbXMsIFJlc291cmNlTW92ZVBhcmFtcyxcblx0UmVzb3VyY2VSZXF1ZXN0UGFyYW1zLCBSZXNvdXJjZVJlc29sdmVQYXJhbXMsIFJlc291cmNlUmVzb2x2ZVJlc3VsdCwgUmVzb3VyY2VUeXBlLCBSZXNvdXJjZVdyaXRlUGFyYW1zLFxufSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IFJPT1RfU1RBVEVfVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcblxuaW50ZXJmYWNlIElJbnRlcm5hbFBlbmRpbmdSZXF1ZXN0IGV4dGVuZHMgSVBlbmRpbmdSZXNvdXJjZVJlcXVlc3Qge1xuXHRyZWFkb25seSBkZWZlcnJlZDogRGVmZXJyZWRQcm9taXNlPHZvaWQ+O1xufVxuXG5pbnRlcmZhY2UgSUluTWVtb3J5R3JhbnQge1xuXHRyZWFkb25seSBpZGVudGl0eTogQWdlbnRIb3N0UmVzb3VyY2VJZGVudGl0eTtcblx0LyoqXG5cdCAqIFJlc29sdmVzIHRvIHRoZSByZWFscGF0aCdkIFVSSSBmb3IgdGhlIGdyYW50LiBTdG9yZWQgYXMgYSBwcm9taXNlIHNvXG5cdCAqIGBncmFudEltcGxpY2l0UmVhZGAgY2FuIHJldHVybiBzeW5jaHJvbm91c2x5IHdoaWxlIHRoZSByZWFscGF0aCBsb29rdXBcblx0ICogaXMgaW4gZmxpZ2h0OyBjb25zdW1lcnMgaW4gYF9pc0NvdmVyZWRgIGF3YWl0IHRoZSByZXNvbHZlZCBVUkkgYmVmb3JlXG5cdCAqIGNvbXBhcmluZywgc28gYSBjaGVjayB0aGF0IGhhcHBlbnMgYmVmb3JlIHRoZSBsb29rdXAgY29tcGxldGVzIHN0aWxsXG5cdCAqIGNvbXBhcmVzIGFnYWluc3QgdGhlIGNhbm9uaWNhbCBwYXRoLiBBbHdheXMgcmVzb2x2ZXMgKG5ldmVyIHJlamVjdHMpLlxuXHQgKi9cblx0cmVhZG9ubHkgcmVhbHBhdGg6IFByb21pc2U8VVJJPjtcblx0cmVhZG9ubHkgbW9kZTogQWdlbnRIb3N0QWNjZXNzTW9kZTtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplUmVzb3VyY2VJZGVudGl0eShpZGVudGl0eTogQWdlbnRIb3N0UmVzb3VyY2VJZGVudGl0eSk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHkge1xuXHRyZXR1cm4gaWRlbnRpdHkgPT09IExPQ0FMX0FHRU5UX0hPU1RfUkVTT1VSQ0VfSURFTlRJVFkgPyBpZGVudGl0eSA6IG5vcm1hbGl6ZVJlbW90ZUFnZW50SG9zdEFkZHJlc3MoaWRlbnRpdHkpO1xufVxuXG4vKipcbiAqIERlZmF1bHQgaW1wbGVtZW50YXRpb24gb2Yge0BsaW5rIElBZ2VudEhvc3RSZXNvdXJjZVNlcnZpY2V9IFx1MjAxNCB0aGUgdW5pZmllZFxuICogb3duZXIgb2YgYWdlbnQtaG9zdC1mYWNpbmcgZmlsZXN5c3RlbSBvcGVyYXRpb25zIGFuZCB0aGUgcGVybWlzc2lvblxuICogcG9saWN5IHRoYXQgZ2F0ZXMgdGhlbS4gUmVhZHMgdHJhbnNwYXJlbnRseSBmYWxsIGJhY2sgdG9cbiAqIHtAbGluayBJVGV4dE1vZGVsU2VydmljZX0gc28gdmlydHVhbCByZXNvdXJjZXMgKHVudGl0bGVkIGRvY3VtZW50cyxcbiAqIG5vdGVib29rIGNlbGxzLCAuLi4pIHdvcmsgd2l0aG91dCB0aGUgaG9zdCBoYXZpbmcgdG8ga25vdyBhYm91dCB0aGVtLlxuICpcbiAqIFBlcm1pc3Npb24gc3RvcmFnZSBzaGFwZSAoaW4gdXNlciBzZXR0aW5ncyk6XG4gKlxuICogYGBganNvbmNcbiAqIFwiY2hhdC5hZ2VudEhvc3QubG9jYWxGaWxlUGVybWlzc2lvbnNcIjoge1xuICogICBcImxvY2FsaG9zdDozMDAwXCI6IHtcbiAqICAgICBcImZpbGU6Ly8vVXNlcnMvbWUvLmdpdGNvbmZpZ1wiOiBcInJcIixcbiAqICAgICBcImZpbGU6Ly8vVXNlcnMvbWUvLmFnZW50Q29uZmlnXCI6IFwicndcIlxuICogICB9XG4gKiB9XG4gKiBgYGBcbiAqXG4gKiAtIEtleXMgYXJlIHJlbW90ZSBhZGRyZXNzZXMgbm9ybWFsaXplZCB2aWFcbiAqICAge0BsaW5rIG5vcm1hbGl6ZVJlbW90ZUFnZW50SG9zdEFkZHJlc3N9LlxuICogLSBWYWx1ZXMgYXJlIFVSSSBzdHJpbmdzIFx1MjE5MiBgcmAgfCBgcndgLiBEZXNjZW5kYW50IFVSSXMgYXJlIGNvdmVyZWQgYnkgYVxuICogICBwYXJlbnQgZ3JhbnQuXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudEhvc3RSZXNvdXJjZVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50SG9zdFJlc291cmNlU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luTWVtb3J5R3JhbnRzID0gbmV3IE1hcDxzdHJpbmcsIElJbk1lbW9yeUdyYW50PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElJbnRlcm5hbFBlbmRpbmdSZXF1ZXN0W10+KCdhZ2VudEhvc3RSZXNvdXJjZXMucGVuZGluZycsIFtdKTtcblxuXHRyZWFkb25seSBhbGxQZW5kaW5nOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJUGVuZGluZ1Jlc291cmNlUmVxdWVzdFtdPiA9IHRoaXMuX3BlbmRpbmc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0Ly8gLS0tLSBHYXRlZCBGUyBvcGVyYXRpb25zIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGFzeW5jIGxpc3QoaWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHksIHVyaTogVVJJKTogUHJvbWlzZTxJUmVzb3VyY2VMaXN0UmVzdWx0PiB7XG5cdFx0YXdhaXQgdGhpcy5fZ2F0ZShpZGVudGl0eSwgdXJpLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5SZWFkLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IHVyaS50b1N0cmluZygpLCByZWFkOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZXNvbHZlKHVyaSk7XG5cdFx0aWYgKCFzdGF0LmlzRGlyZWN0b3J5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFJlc291cmNlIGlzIG5vdCBhIGRpcmVjdG9yeTogJHt1cmkudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGVudHJpZXM6IChzdGF0LmNoaWxkcmVuID8/IFtdKS5tYXAoYyA9PiAoe1xuXHRcdFx0XHRuYW1lOiBjLm5hbWUsXG5cdFx0XHRcdHR5cGU6IGMuaXNEaXJlY3RvcnkgPyAnZGlyZWN0b3J5JyA6ICdmaWxlJyxcblx0XHRcdH0pKSxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgcmVhZChpZGVudGl0eTogQWdlbnRIb3N0UmVzb3VyY2VJZGVudGl0eSwgdXJpOiBVUkkpOiBQcm9taXNlPElSZXNvdXJjZVJlYWRSZXN1bHQ+IHtcblx0XHRhd2FpdCB0aGlzLl9nYXRlKGlkZW50aXR5LCB1cmksIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLlJlYWQsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogdXJpLnRvU3RyaW5nKCksIHJlYWQ6IHRydWUgfSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZSh1cmkpO1xuXHRcdFx0cmV0dXJuIHsgYnl0ZXM6IGNvbnRlbnQudmFsdWUgfTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNvbnN0IHZpcnR1YWwgPSBhd2FpdCB0aGlzLl9yZWFkVmlydHVhbCh1cmkpO1xuXHRcdFx0aWYgKHZpcnR1YWwpIHtcblx0XHRcdFx0cmV0dXJuIHsgYnl0ZXM6IHZpcnR1YWwgfTtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cdH1cblxuXHRhc3luYyB3cml0ZShpZGVudGl0eTogQWdlbnRIb3N0UmVzb3VyY2VJZGVudGl0eSwgcGFyYW1zOiBSZXNvdXJjZVdyaXRlUGFyYW1zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKHBhcmFtcy51cmkpO1xuXHRcdGF3YWl0IHRoaXMuX2dhdGUoaWRlbnRpdHksIHVyaSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuV3JpdGUsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogdXJpLnRvU3RyaW5nKCksIHdyaXRlOiB0cnVlIH0pO1xuXHRcdGNvbnN0IGJ1ZiA9IHBhcmFtcy5lbmNvZGluZyA9PT0gQ29udGVudEVuY29kaW5nLkJhc2U2NFxuXHRcdFx0PyBkZWNvZGVCYXNlNjQocGFyYW1zLmRhdGEpXG5cdFx0XHQ6IFZTQnVmZmVyLmZyb21TdHJpbmcocGFyYW1zLmRhdGEpO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAocGFyYW1zLmNyZWF0ZU9ubHkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuY3JlYXRlRmlsZSh1cmksIGJ1ZiwgeyBvdmVyd3JpdGU6IGZhbHNlIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHVyaSwgYnVmKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmIChhd2FpdCB0aGlzLl93cml0ZVZpcnR1YWwodXJpLCBidWYpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBkZWwoaWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHksIHBhcmFtczogUmVzb3VyY2VEZWxldGVQYXJhbXMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UocGFyYW1zLnVyaSk7XG5cdFx0YXdhaXQgdGhpcy5fZ2F0ZShpZGVudGl0eSwgdXJpLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5Xcml0ZSwgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiB1cmkudG9TdHJpbmcoKSwgd3JpdGU6IHRydWUgfSk7XG5cdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZGVsKHVyaSwgeyByZWN1cnNpdmU6ICEhcGFyYW1zLnJlY3Vyc2l2ZSB9KTtcblx0fVxuXG5cdGFzeW5jIG1vdmUoaWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHksIHBhcmFtczogUmVzb3VyY2VNb3ZlUGFyYW1zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc291cmNlID0gVVJJLnBhcnNlKHBhcmFtcy5zb3VyY2UpO1xuXHRcdGNvbnN0IGRlc3RpbmF0aW9uID0gVVJJLnBhcnNlKHBhcmFtcy5kZXN0aW5hdGlvbik7XG5cdFx0YXdhaXQgdGhpcy5fZ2F0ZShpZGVudGl0eSwgc291cmNlLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5Xcml0ZSwgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiBzb3VyY2UudG9TdHJpbmcoKSwgd3JpdGU6IHRydWUgfSk7XG5cdFx0YXdhaXQgdGhpcy5fZ2F0ZShpZGVudGl0eSwgZGVzdGluYXRpb24sIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLldyaXRlLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IGRlc3RpbmF0aW9uLnRvU3RyaW5nKCksIHdyaXRlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLm1vdmUoc291cmNlLCBkZXN0aW5hdGlvbiwgIXBhcmFtcy5mYWlsSWZFeGlzdHMpO1xuXHR9XG5cblx0YXN5bmMgY29weShpZGVudGl0eTogQWdlbnRIb3N0UmVzb3VyY2VJZGVudGl0eSwgcGFyYW1zOiBSZXNvdXJjZUNvcHlQYXJhbXMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzb3VyY2UgPSBVUkkucGFyc2UocGFyYW1zLnNvdXJjZSk7XG5cdFx0Y29uc3QgZGVzdGluYXRpb24gPSBVUkkucGFyc2UocGFyYW1zLmRlc3RpbmF0aW9uKTtcblx0XHRhd2FpdCB0aGlzLl9nYXRlKGlkZW50aXR5LCBzb3VyY2UsIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLlJlYWQsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogc291cmNlLnRvU3RyaW5nKCksIHJlYWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgdGhpcy5fZ2F0ZShpZGVudGl0eSwgZGVzdGluYXRpb24sIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLldyaXRlLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IGRlc3RpbmF0aW9uLnRvU3RyaW5nKCksIHdyaXRlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmNvcHkoc291cmNlLCBkZXN0aW5hdGlvbiwgIXBhcmFtcy5mYWlsSWZFeGlzdHMpO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZShpZGVudGl0eTogQWdlbnRIb3N0UmVzb3VyY2VJZGVudGl0eSwgcGFyYW1zOiBSZXNvdXJjZVJlc29sdmVQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlUmVzb2x2ZVJlc3VsdD4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShwYXJhbXMudXJpKTtcblx0XHRhd2FpdCB0aGlzLl9nYXRlKGlkZW50aXR5LCB1cmksIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLlJlYWQsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogdXJpLnRvU3RyaW5nKCksIHJlYWQ6IHRydWUgfSk7XG5cdFx0bGV0IHN0YXQ7XG5cdFx0dHJ5IHtcblx0XHRcdHN0YXQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5zdGF0KHVyaSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRjb25zdCB2aXJ0dWFsID0gYXdhaXQgdGhpcy5fc3RhdFZpcnR1YWwodXJpKTtcblx0XHRcdGlmICh2aXJ0dWFsKSB7XG5cdFx0XHRcdHJldHVybiB2aXJ0dWFsO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0XHRsZXQgdHlwZTogUmVzb3VyY2VUeXBlO1xuXHRcdGlmIChzdGF0LmlzU3ltYm9saWNMaW5rICYmIHBhcmFtcy5mb2xsb3dTeW1saW5rcyA9PT0gZmFsc2UpIHtcblx0XHRcdHR5cGUgPSBSZXNvdXJjZVR5cGUuU3ltbGluaztcblx0XHR9IGVsc2UgaWYgKHN0YXQuaXNEaXJlY3RvcnkpIHtcblx0XHRcdHR5cGUgPSBSZXNvdXJjZVR5cGUuRGlyZWN0b3J5O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0eXBlID0gUmVzb3VyY2VUeXBlLkZpbGU7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHR1cmk6IHVyaS50b1N0cmluZygpLFxuXHRcdFx0dHlwZSxcblx0XHRcdC4uLihzdGF0LnNpemUgIT09IHVuZGVmaW5lZCA/IHsgc2l6ZTogc3RhdC5zaXplIH0gOiB7fSksXG5cdFx0XHQuLi4oc3RhdC5tdGltZSAhPT0gdW5kZWZpbmVkID8geyBtdGltZTogbmV3IERhdGUoc3RhdC5tdGltZSkudG9JU09TdHJpbmcoKSB9IDoge30pLFxuXHRcdFx0Li4uKHN0YXQuY3RpbWUgIT09IHVuZGVmaW5lZCA/IHsgY3RpbWU6IG5ldyBEYXRlKHN0YXQuY3RpbWUpLnRvSVNPU3RyaW5nKCkgfSA6IHt9KSxcblx0XHRcdC4uLihzdGF0LmV0YWcgPyB7IGV0YWc6IHN0YXQuZXRhZyB9IDoge30pLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBta2RpcihpZGVudGl0eTogQWdlbnRIb3N0UmVzb3VyY2VJZGVudGl0eSwgcGFyYW1zOiBSZXNvdXJjZU1rZGlyUGFyYW1zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKHBhcmFtcy51cmkpO1xuXHRcdGF3YWl0IHRoaXMuX2dhdGUoaWRlbnRpdHksIHVyaSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuV3JpdGUsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogdXJpLnRvU3RyaW5nKCksIHdyaXRlOiB0cnVlIH0pO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2Uuc3RhdCh1cmkpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0aWYgKGV4aXN0aW5nICYmICFleGlzdGluZy5pc0RpcmVjdG9yeSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBQYXRoIGV4aXN0cyBhbmQgaXMgbm90IGEgZGlyZWN0b3J5OiAke3VyaS50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5jcmVhdGVGb2xkZXIodXJpKTtcblx0fVxuXG5cdC8vIC0tLS0gUGVybWlzc2lvbiByZXF1ZXN0cyAvIG9ic2VydmFibGVzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGFzeW5jIGNoZWNrKGlkZW50aXR5OiBBZ2VudEhvc3RSZXNvdXJjZUlkZW50aXR5LCB1cmk6IFVSSSwgbW9kZTogQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUmVzb3VyY2VJZGVudGl0eShpZGVudGl0eSk7XG5cdFx0Y29uc3QgY2Fub25pY2FsID0gYXdhaXQgdGhpcy5fY2Fub25pY2FsaXplKHVyaSk7XG5cdFx0cmV0dXJuIHRoaXMuX2lzQ292ZXJlZChub3JtYWxpemVkLCBjYW5vbmljYWwsIG1vZGUpO1xuXHR9XG5cblx0YXN5bmMgcmVxdWVzdChpZGVudGl0eTogQWdlbnRIb3N0UmVzb3VyY2VJZGVudGl0eSwgcGFyYW1zOiBSZXNvdXJjZVJlcXVlc3RQYXJhbXMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUmVzb3VyY2VJZGVudGl0eShpZGVudGl0eSk7XG5cdFx0Y29uc3QgY2Fub25pY2FsID0gYXdhaXQgdGhpcy5fY2Fub25pY2FsaXplKFVSSS5wYXJzZShwYXJhbXMudXJpKSk7XG5cdFx0aWYgKG5vcm1hbGl6ZWQgPT09IExPQ0FMX0FHRU5UX0hPU1RfUkVTT1VSQ0VfSURFTlRJVFkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgd2FudHNXcml0ZSA9IHBhcmFtcy53cml0ZSA9PT0gdHJ1ZTtcblx0XHRjb25zdCB3YW50c1JlYWQgPSBwYXJhbXMucmVhZCA9PT0gdHJ1ZSB8fCAhd2FudHNXcml0ZTtcblxuXHRcdGlmICh3YW50c1JlYWQgJiYgIWF3YWl0IHRoaXMuX2lzQ292ZXJlZChub3JtYWxpemVkLCBjYW5vbmljYWwsIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLlJlYWQpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9lbnF1ZXVlKG5vcm1hbGl6ZWQsIGNhbm9uaWNhbCwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuUmVhZCk7XG5cdFx0fVxuXHRcdGlmICh3YW50c1dyaXRlICYmICFhd2FpdCB0aGlzLl9pc0NvdmVyZWQobm9ybWFsaXplZCwgY2Fub25pY2FsLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5Xcml0ZSkpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2VucXVldWUobm9ybWFsaXplZCwgY2Fub25pY2FsLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5Xcml0ZSk7XG5cdFx0fVxuXHR9XG5cblx0cGVuZGluZ0ZvcihhZGRyZXNzOiBzdHJpbmcpOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJUGVuZGluZ1Jlc291cmNlUmVxdWVzdFtdPiB7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVJlbW90ZUFnZW50SG9zdEFkZHJlc3MoYWRkcmVzcyk7XG5cdFx0cmV0dXJuIGRlcml2ZWQocmVhZGVyID0+IHRoaXMuX3BlbmRpbmcucmVhZChyZWFkZXIpLmZpbHRlcihyID0+IHIuYWRkcmVzcyA9PT0gbm9ybWFsaXplZCkpO1xuXHR9XG5cblx0ZmluZFBlbmRpbmcoaWQ6IHN0cmluZyk6IElQZW5kaW5nUmVzb3VyY2VSZXF1ZXN0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fcGVuZGluZy5nZXQoKS5maW5kKHIgPT4gci5pZCA9PT0gaWQpO1xuXHR9XG5cblx0Z3JhbnRJbXBsaWNpdFJlYWQoaWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHksIHVyaTogVVJJKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IGxleGljYWwgPSBleHRVcmkubm9ybWFsaXplUGF0aCh1cmkpO1xuXHRcdGNvbnN0IHJlYWxwYXRoID0gdGhpcy5fZmlsZVNlcnZpY2UucmVhbHBhdGgobGV4aWNhbCkudGhlbihcblx0XHRcdHJlYWwgPT4gcmVhbCA/PyBsZXhpY2FsLFxuXHRcdFx0KCkgPT4gbGV4aWNhbCxcblx0XHQpO1xuXHRcdHRoaXMuX2luTWVtb3J5R3JhbnRzLnNldChoYW5kbGUsIHtcblx0XHRcdGlkZW50aXR5OiBub3JtYWxpemVSZXNvdXJjZUlkZW50aXR5KGlkZW50aXR5KSxcblx0XHRcdHJlYWxwYXRoLFxuXHRcdFx0bW9kZTogQWdlbnRIb3N0QWNjZXNzTW9kZS5SZWFkLFxuXHRcdH0pO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5faW5NZW1vcnlHcmFudHMuZGVsZXRlKGhhbmRsZSkpO1xuXHR9XG5cblx0Y29ubmVjdGlvbkNsb3NlZChpZGVudGl0eTogQWdlbnRIb3N0UmVzb3VyY2VJZGVudGl0eSk6IHZvaWQge1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVSZXNvdXJjZUlkZW50aXR5KGlkZW50aXR5KTtcblxuXHRcdGZvciAoY29uc3QgW2hhbmRsZSwgZ3JhbnRdIG9mIHRoaXMuX2luTWVtb3J5R3JhbnRzKSB7XG5cdFx0XHRpZiAoZ3JhbnQuaWRlbnRpdHkgPT09IG5vcm1hbGl6ZWQpIHtcblx0XHRcdFx0dGhpcy5faW5NZW1vcnlHcmFudHMuZGVsZXRlKGhhbmRsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG5vcm1hbGl6ZWQgPT09IExPQ0FMX0FHRU5UX0hPU1RfUkVTT1VSQ0VfSURFTlRJVFkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY2FuY2VsID0gbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0Y29uc3QgcmVtYWluaW5nOiBJSW50ZXJuYWxQZW5kaW5nUmVxdWVzdFtdID0gW107XG5cdFx0Zm9yIChjb25zdCByZXF1ZXN0IG9mIHRoaXMuX3BlbmRpbmcuZ2V0KCkpIHtcblx0XHRcdGlmIChyZXF1ZXN0LmFkZHJlc3MgPT09IG5vcm1hbGl6ZWQpIHtcblx0XHRcdFx0cmVxdWVzdC5kZWZlcnJlZC5lcnJvcihjYW5jZWwpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVtYWluaW5nLnB1c2gocmVxdWVzdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChyZW1haW5pbmcubGVuZ3RoICE9PSB0aGlzLl9wZW5kaW5nLmdldCgpLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fcGVuZGluZy5zZXQocmVtYWluaW5nLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0gaW50ZXJuYWxzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgYXN5bmMgX2dhdGUoXG5cdFx0aWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHksXG5cdFx0dXJpOiBVUkksXG5cdFx0bW9kZTogQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUsXG5cdFx0ZGVuaWVkUmVxdWVzdDogUmVzb3VyY2VSZXF1ZXN0UGFyYW1zLFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWF3YWl0IHRoaXMuY2hlY2soaWRlbnRpdHksIHVyaSwgbW9kZSkpIHtcblx0XHRcdHRocm93IG5ldyBBZ2VudEhvc3RSZXNvdXJjZVBlcm1pc3Npb25FcnJvcihkZW5pZWRSZXF1ZXN0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWFkVmlydHVhbCh1cmk6IFVSSSk6IFByb21pc2U8VlNCdWZmZXIgfCB1bmRlZmluZWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5fdGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZSh1cmkpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIFZTQnVmZmVyLmZyb21TdHJpbmcocmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwuZ2V0VmFsdWUoKSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogV3JpdGUge0BsaW5rIGJ5dGVzfSBhcyB0ZXh0IGludG8gdGhlIHJlc29sdmVkIHRleHQgbW9kZWwgZm9yIHtAbGluayB1cml9LFxuXHQgKiBpZiBvbmUgY2FuIGJlIHJlc29sdmVkIGFuZCBpcyB3cml0YWJsZS4gUmV0dXJucyBgdHJ1ZWAgd2hlbiB0aGUgbW9kZWwgd2FzXG5cdCAqIHVwZGF0ZWQsIGBmYWxzZWAgb3RoZXJ3aXNlIChubyBwcm92aWRlciwgcmVhZG9ubHksIGRlY29kZSBmYWlsdXJlKS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3dyaXRlVmlydHVhbCh1cmk6IFVSSSwgYnl0ZXM6IFZTQnVmZmVyKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuX3RleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UodXJpKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGlmIChyZWYub2JqZWN0LmlzUmVhZG9ubHkoKSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbC5zZXRWYWx1ZShieXRlcy50b1N0cmluZygpKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIHtAbGluayB1cml9IHZpYSB7QGxpbmsgSVRleHRNb2RlbFNlcnZpY2V9IGFuZCBzeW50aGVzaXplIGFcblx0ICoge0BsaW5rIFJlc291cmNlUmVzb2x2ZVJlc3VsdH0gc28gdmlydHVhbCByZXNvdXJjZXMgc3RhdCBhcyBgRmlsZWAgd2l0aFxuXHQgKiBhIHNpemUgbWF0Y2hpbmcgdGhlaXIgdGV4dCBjb250ZW50LiBSZXR1cm5zIGB1bmRlZmluZWRgIGlmIG5vIG1vZGVsXG5cdCAqIGNhbiBiZSByZXNvbHZlZC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3N0YXRWaXJ0dWFsKHVyaTogVVJJKTogUHJvbWlzZTxSZXNvdXJjZVJlc29sdmVSZXN1bHQgfCB1bmRlZmluZWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5fdGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZSh1cmkpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc2l6ZSA9IFZTQnVmZmVyLmZyb21TdHJpbmcocmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwuZ2V0VmFsdWUoKSkuYnl0ZUxlbmd0aDtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR1cmk6IHVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdHR5cGU6IFJlc291cmNlVHlwZS5GaWxlLFxuXHRcdFx0XHRcdHNpemUsXG5cdFx0XHRcdH07XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSB7QGxpbmsgdXJpfSBhZ2FpbnN0IHRoZSBsb2NhbCBmaWxlc3lzdGVtLCBjb2xsYXBzaW5nIGAuLmBcblx0ICogc2VnbWVudHMgYW5kIGZvbGxvd2luZyBzeW1saW5rcyBzbyB0aGUgcG9saWN5IGNoZWNrIHNlZXMgdGhlIHNhbWVcblx0ICogcGF0aCB0aGUgT1Mgd2lsbCBhY3R1YWxseSBvcGVuLiBGb3IgVVJJcyB0aGF0IGRvbid0IGV4aXN0IChlLmcuIGFcblx0ICogYHJlc291cmNlV3JpdGVgIGZvciBhIG5ldyBmaWxlKSwgcmVhbHBhdGggdGhlIGRlZXBlc3QgZXhpc3Rpbmdcblx0ICogYW5jZXN0b3IgYW5kIHJlLWFwcGVuZCB0aGUgbGVhZi5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2Nhbm9uaWNhbGl6ZSh1cmk6IFVSSSk6IFByb21pc2U8VVJJPiB7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZCA9IGV4dFVyaS5ub3JtYWxpemVQYXRoKHVyaSk7XG5cdFx0Y29uc3QgcmVhbCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWxwYXRoKG5vcm1hbGl6ZWQpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0aWYgKHJlYWwpIHtcblx0XHRcdHJldHVybiByZWFsO1xuXHRcdH1cblx0XHRjb25zdCBwYXJlbnQgPSBleHRVcmkuZGlybmFtZShub3JtYWxpemVkKTtcblx0XHRpZiAoZXh0VXJpLmlzRXF1YWwocGFyZW50LCBub3JtYWxpemVkKSkge1xuXHRcdFx0cmV0dXJuIG5vcm1hbGl6ZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJlYWxQYXJlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFscGF0aChwYXJlbnQpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0cmV0dXJuIHJlYWxQYXJlbnRcblx0XHRcdD8gZXh0VXJpLmpvaW5QYXRoKHJlYWxQYXJlbnQsIGV4dFVyaS5iYXNlbmFtZShub3JtYWxpemVkKSlcblx0XHRcdDogbm9ybWFsaXplZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2lzQ292ZXJlZChpZGVudGl0eTogQWdlbnRIb3N0UmVzb3VyY2VJZGVudGl0eSwgY2Fub25pY2FsVXJpOiBVUkksIG1vZGU6IEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKGlkZW50aXR5ID09PSBMT0NBTF9BR0VOVF9IT1NUX1JFU09VUkNFX0lERU5USVRZKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgcmVxdWlyZVdyaXRlID0gbW9kZSA9PT0gQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuV3JpdGU7XG5cblx0XHRmb3IgKGNvbnN0IGdyYW50IG9mIHRoaXMuX3JlYWRQZXJzaXN0ZWRHcmFudHMoaWRlbnRpdHkpKSB7XG5cdFx0XHRpZiAocmVxdWlyZVdyaXRlICYmIGdyYW50Lm1vZGUgIT09IEFnZW50SG9zdEFjY2Vzc01vZGUuUmVhZFdyaXRlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV4dFVyaS5pc0VxdWFsT3JQYXJlbnQoY2Fub25pY2FsVXJpLCBncmFudC51cmkpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGNhbmRpZGF0ZXM6IFByb21pc2U8VVJJPltdID0gW107XG5cdFx0Zm9yIChjb25zdCBncmFudCBvZiB0aGlzLl9pbk1lbW9yeUdyYW50cy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKGdyYW50LmlkZW50aXR5ICE9PSBpZGVudGl0eSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXF1aXJlV3JpdGUgJiYgZ3JhbnQubW9kZSAhPT0gQWdlbnRIb3N0QWNjZXNzTW9kZS5SZWFkV3JpdGUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjYW5kaWRhdGVzLnB1c2goZ3JhbnQucmVhbHBhdGgpO1xuXHRcdH1cblx0XHRjb25zdCByZWFscGF0aHMgPSBhd2FpdCBQcm9taXNlLmFsbChjYW5kaWRhdGVzKTtcblx0XHRyZXR1cm4gcmVhbHBhdGhzLnNvbWUodXJpID0+IGV4dFVyaS5pc0VxdWFsT3JQYXJlbnQoY2Fub25pY2FsVXJpLCB1cmkpKTtcblx0fVxuXG5cdHByaXZhdGUgX2VucXVldWUoYWRkcmVzczogc3RyaW5nLCBjYW5vbmljYWxVcmk6IFVSSSwgbW9kZTogQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3BlbmRpbmcuZ2V0KCkuZmluZChyID0+XG5cdFx0XHRyLmFkZHJlc3MgPT09IGFkZHJlc3MgJiYgci5tb2RlID09PSBtb2RlICYmIGV4dFVyaS5pc0VxdWFsKHIudXJpLCBjYW5vbmljYWxVcmkpKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZy5kZWZlcnJlZC5wO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IHJlcXVlc3Q6IElJbnRlcm5hbFBlbmRpbmdSZXF1ZXN0ID0ge1xuXHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0YWRkcmVzcyxcblx0XHRcdHVyaTogY2Fub25pY2FsVXJpLFxuXHRcdFx0bW9kZSxcblx0XHRcdGRlZmVycmVkLFxuXHRcdFx0YWxsb3c6ICgpID0+IHRoaXMuX3Jlc29sdmUocmVxdWVzdCwgJ21lbW9yeScpLFxuXHRcdFx0YWxsb3dBbHdheXM6ICgpID0+IHRoaXMuX3Jlc29sdmUocmVxdWVzdCwgJ3BlcnNpc3QnKSxcblx0XHRcdGRlbnk6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fZHJvcFBlbmRpbmcocmVxdWVzdCk7XG5cdFx0XHRcdGRlZmVycmVkLmVycm9yKG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHR0aGlzLl9wZW5kaW5nLnNldChbLi4udGhpcy5fcGVuZGluZy5nZXQoKSwgcmVxdWVzdF0sIHVuZGVmaW5lZCk7XG5cdFx0cmV0dXJuIGRlZmVycmVkLnA7XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlKHJlcXVlc3Q6IElJbnRlcm5hbFBlbmRpbmdSZXF1ZXN0LCBzY29wZTogJ21lbW9yeScgfCAncGVyc2lzdCcpOiB2b2lkIHtcblx0XHRjb25zdCBhY2Nlc3NNb2RlID0gcmVxdWVzdC5tb2RlID09PSBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5Xcml0ZVxuXHRcdFx0PyBBZ2VudEhvc3RBY2Nlc3NNb2RlLlJlYWRXcml0ZVxuXHRcdFx0OiBBZ2VudEhvc3RBY2Nlc3NNb2RlLlJlYWQ7XG5cblx0XHR0aGlzLl9pbk1lbW9yeUdyYW50cy5zZXQoZ2VuZXJhdGVVdWlkKCksIHtcblx0XHRcdGlkZW50aXR5OiByZXF1ZXN0LmFkZHJlc3MsXG5cdFx0XHRyZWFscGF0aDogUHJvbWlzZS5yZXNvbHZlKHJlcXVlc3QudXJpKSxcblx0XHRcdG1vZGU6IGFjY2Vzc01vZGUsXG5cdFx0fSk7XG5cblx0XHRpZiAoc2NvcGUgPT09ICdwZXJzaXN0Jykge1xuXHRcdFx0dm9pZCB0aGlzLl9wZXJzaXN0R3JhbnQocmVxdWVzdC5hZGRyZXNzLCByZXF1ZXN0LnVyaSwgcmVxdWVzdC5tb2RlKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1tBZ2VudEhvc3RSZXNvdXJjZVNlcnZpY2VdIEZhaWxlZCB0byBwZXJzaXN0IGdyYW50JywgZXJyKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuX2Ryb3BQZW5kaW5nKHJlcXVlc3QpO1xuXHRcdHJlcXVlc3QuZGVmZXJyZWQuY29tcGxldGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2Ryb3BQZW5kaW5nKHJlcXVlc3Q6IElJbnRlcm5hbFBlbmRpbmdSZXF1ZXN0KTogdm9pZCB7XG5cdFx0Y29uc3QgbmV4dCA9IHRoaXMuX3BlbmRpbmcuZ2V0KCkuZmlsdGVyKHIgPT4gciAhPT0gcmVxdWVzdCk7XG5cdFx0aWYgKG5leHQubGVuZ3RoICE9PSB0aGlzLl9wZW5kaW5nLmdldCgpLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fcGVuZGluZy5zZXQobmV4dCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlICpfcmVhZFBlcnNpc3RlZEdyYW50cyhhZGRyZXNzOiBzdHJpbmcpOiBJdGVyYWJsZTx7IHVyaTogVVJJOyBtb2RlOiBBZ2VudEhvc3RBY2Nlc3NNb2RlIH0+IHtcblx0XHRjb25zdCBmb3JBZGRyZXNzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Vcblx0XHRcdC5nZXRWYWx1ZTxBZ2VudEhvc3RQZXJtaXNzaW9uc1NldHRpbmc+KEFnZW50SG9zdExvY2FsRmlsZVBlcm1pc3Npb25zU2V0dGluZ0lkKT8uW2FkZHJlc3NdO1xuXHRcdGlmICghZm9yQWRkcmVzcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IFt1cmlTdHIsIG1vZGVdIG9mIE9iamVjdC5lbnRyaWVzKGZvckFkZHJlc3MpKSB7XG5cdFx0XHRpZiAobW9kZSAhPT0gQWdlbnRIb3N0QWNjZXNzTW9kZS5SZWFkICYmIG1vZGUgIT09IEFnZW50SG9zdEFjY2Vzc01vZGUuUmVhZFdyaXRlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0eWllbGQgeyB1cmk6IFVSSS5wYXJzZSh1cmlTdHIpLCBtb2RlIH07XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gSWdub3JlIG1hbGZvcm1lZCBVUkkga2V5cy5cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9wZXJzaXN0R3JhbnQoYWRkcmVzczogc3RyaW5nLCB1cmk6IFVSSSwgbW9kZTogQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXF1ZXN0ZWQ6IEFnZW50SG9zdEFjY2Vzc01vZGUgPSBtb2RlID09PSBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5Xcml0ZVxuXHRcdFx0PyBBZ2VudEhvc3RBY2Nlc3NNb2RlLlJlYWRXcml0ZVxuXHRcdFx0OiBBZ2VudEhvc3RBY2Nlc3NNb2RlLlJlYWQ7XG5cblx0XHRmb3IgKGNvbnN0IGdyYW50IG9mIHRoaXMuX3JlYWRQZXJzaXN0ZWRHcmFudHMoYWRkcmVzcykpIHtcblx0XHRcdGNvbnN0IGNvdmVycyA9IGdyYW50Lm1vZGUgPT09IEFnZW50SG9zdEFjY2Vzc01vZGUuUmVhZFdyaXRlIHx8IHJlcXVlc3RlZCA9PT0gQWdlbnRIb3N0QWNjZXNzTW9kZS5SZWFkO1xuXHRcdFx0aWYgKGNvdmVycyAmJiBleHRVcmkuaXNFcXVhbE9yUGFyZW50KHVyaSwgZ3JhbnQudXJpKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyB0YXJnZXQsIHZhbHVlIH0gPSB0aGlzLl9pbnNwZWN0U2NvcGVkU2V0dGluZygpO1xuXHRcdGNvbnN0IGZvckFkZHJlc3M6IFJlY29yZDxzdHJpbmcsIEFnZW50SG9zdEFjY2Vzc01vZGU+ID0geyAuLi4odmFsdWVbYWRkcmVzc10gPz8ge30pIH07XG5cdFx0Y29uc3QgdXJpS2V5ID0gdXJpLnRvU3RyaW5nKCk7XG5cdFx0aWYgKGZvckFkZHJlc3NbdXJpS2V5XSA9PT0gQWdlbnRIb3N0QWNjZXNzTW9kZS5SZWFkV3JpdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yQWRkcmVzc1t1cmlLZXldID0gcmVxdWVzdGVkO1xuXG5cdFx0YXdhaXQgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoXG5cdFx0XHRBZ2VudEhvc3RMb2NhbEZpbGVQZXJtaXNzaW9uc1NldHRpbmdJZCxcblx0XHRcdHsgLi4udmFsdWUsIFthZGRyZXNzXTogZm9yQWRkcmVzcyB9LFxuXHRcdFx0dGFyZ2V0LFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9pbnNwZWN0U2NvcGVkU2V0dGluZygpOiB7IHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldDsgdmFsdWU6IEFnZW50SG9zdFBlcm1pc3Npb25zU2V0dGluZyB9IHtcblx0XHRjb25zdCBpbnNwZWN0ZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PEFnZW50SG9zdFBlcm1pc3Npb25zU2V0dGluZz4oQWdlbnRIb3N0TG9jYWxGaWxlUGVybWlzc2lvbnNTZXR0aW5nSWQpO1xuXHRcdGlmIChpbnNwZWN0ZWQuYXBwbGljYXRpb25WYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4geyB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuQVBQTElDQVRJT04sIHZhbHVlOiBpbnNwZWN0ZWQuYXBwbGljYXRpb25WYWx1ZSB9O1xuXHRcdH1cblx0XHRpZiAoaW5zcGVjdGVkLnVzZXJMb2NhbFZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB7IHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMLCB2YWx1ZTogaW5zcGVjdGVkLnVzZXJMb2NhbFZhbHVlIH07XG5cdFx0fVxuXHRcdGlmIChpbnNwZWN0ZWQudXNlclJlbW90ZVZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB7IHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URSwgdmFsdWU6IGluc3BlY3RlZC51c2VyUmVtb3RlVmFsdWUgfTtcblx0XHR9XG5cdFx0aWYgKGluc3BlY3RlZC51c2VyVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHsgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsIHZhbHVlOiBpbnNwZWN0ZWQudXNlclZhbHVlIH07XG5cdFx0fVxuXHRcdHJldHVybiB7IHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5BUFBMSUNBVElPTiwgdmFsdWU6IHt9IH07XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUFnZW50SG9zdFJlc291cmNlU2VydmljZSwgQWdlbnRIb3N0UmVzb3VyY2VTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBdUI7QUFD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
