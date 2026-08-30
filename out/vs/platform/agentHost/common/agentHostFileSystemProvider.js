import { decodeBase64, VSBuffer } from "../../../base/common/buffer.js";
import { disposableTimeout } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { createFileSystemProviderError, FileChangeType, FilePermission, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType } from "../../files/common/files.js";
import { fromAgentHostUri, toAgentHostUri } from "./agentHostUri.js";
import { ContentEncoding } from "./state/protocol/commands.js";
import { AhpErrorCodes } from "./state/protocol/errors.js";
import { ProtocolError } from "./state/sessionProtocol.js";
import { ActionType } from "./state/sessionActions.js";
import { ROOT_STATE_URI } from "./state/sessionState.js";
async function createRemoteWatchHandle(primitives, params) {
  const { channel } = await primitives.createResourceWatch(params);
  const channelUri = URI.parse(channel);
  await primitives.subscribe(channelUri);
  const onDidChangeEmitter = new Emitter();
  const listener = primitives.onDidAction((envelope) => {
    if (envelope.channel !== channel || envelope.action.type !== ActionType.ResourceWatchChanged) {
      return;
    }
    const items = envelope.action.changes?.items ?? [];
    if (items.length === 0) {
      return;
    }
    onDidChangeEmitter.fire(items.map((item) => ({
      resource: URI.parse(item.uri),
      type: item.type === "added" ? FileChangeType.ADDED : item.type === "deleted" ? FileChangeType.DELETED : FileChangeType.UPDATED
    })));
  });
  let disposed = false;
  return {
    onDidChange: onDidChangeEmitter.event,
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      listener.dispose();
      onDidChangeEmitter.dispose();
      try {
        primitives.unsubscribe(channelUri);
      } catch {
      }
    }
  };
}
function agentHostUri(authority, path) {
  return toAgentHostUri(URI.file(path), authority);
}
function agentHostRemotePath(uri) {
  return fromAgentHostUri(uri).path;
}
const _AHPFileSystemProvider = class _AHPFileSystemProvider extends Disposable {
  constructor(_connectionGraceMs = _AHPFileSystemProvider._DEFAULT_CONNECTION_GRACE_MS) {
    super();
    this._connectionGraceMs = _connectionGraceMs;
    this.capabilities = FileSystemProviderCapabilities.PathCaseSensitive | FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileFolderCopy | FileSystemProviderCapabilities.FileRealpath;
    this._onDidChangeCapabilities = this._register(new Emitter());
    this.onDidChangeCapabilities = this._onDidChangeCapabilities.event;
    this._onDidChangeFile = this._register(new Emitter());
    this.onDidChangeFile = this._onDidChangeFile.event;
    this._onDidWatchError = this._register(new Emitter());
    this.onDidWatchError = this._onDidWatchError.event;
    /**
     * Per-authority registration slot. We keep the slot alive for a brief
     * grace period after the last registration is disposed, so an
     * operation issued during a reconnection window can wait for the
     * replacement registration instead of failing immediately.
     */
    this._authorities = /* @__PURE__ */ new Map();
    /**
     * Fires the authority whose active connection has changed: added,
     * replaced, fallen back to an older registration, entered the grace
     * window (no active connection), or evicted. Long-lived consumers
     * (e.g. {@link watch}) subscribe here so they continue to receive
     * notifications across full entry eviction + later re-creation —
     * something a per-entry emitter cannot offer.
     */
    this._onDidChangeConnection = this._register(new Emitter());
  }
  /**
   * Register a mapping from a URI authority to a connection.
   * Returns a disposable that unregisters the mapping. Multiple
   * concurrent registrations for the same authority are supported;
   * the most recent registration wins, and disposing it falls back to
   * the previous one (if any). After the *last* registration is
   * disposed the entry is held open for {@link _connectionGraceMs} so
   * that a reconnect can replace it without orphaning in-flight
   * operations.
   */
  registerAuthority(authority, connection) {
    let entry = this._authorities.get(authority);
    if (!entry) {
      entry = {
        connections: [connection],
        expiry: new MutableDisposable()
      };
      this._authorities.set(authority, entry);
    } else {
      entry.expiry.clear();
      entry.connections.push(connection);
    }
    const adopted = entry;
    this._onDidChangeConnection.fire(authority);
    return toDisposable(() => {
      const idx = adopted.connections.indexOf(connection);
      if (idx === -1) {
        return;
      }
      const wasActive = idx === adopted.connections.length - 1;
      adopted.connections.splice(idx, 1);
      if (adopted.connections.length === 0) {
        adopted.expiry.value = disposableTimeout(
          () => this._expireAuthority(authority, adopted),
          this._connectionGraceMs,
          this._store
        );
      }
      if (wasActive) {
        this._onDidChangeConnection.fire(authority);
      }
    });
  }
  _expireAuthority(authority, entry) {
    if (this._authorities.get(authority) !== entry || entry.connections.length > 0) {
      return;
    }
    this._authorities.delete(authority);
    entry.expiry.dispose();
    this._onDidChangeConnection.fire(authority);
  }
  dispose() {
    for (const entry of this._authorities.values()) {
      entry.expiry.dispose();
      entry.connections.length = 0;
    }
    this._authorities.clear();
    super.dispose();
  }
  watch(resource, opts) {
    const store = new DisposableStore();
    const handleHolder = store.add(new MutableDisposable());
    const authority = resource.authority;
    const params = {
      channel: ROOT_STATE_URI,
      uri: this._decodeUri(resource).toString(),
      recursive: opts.recursive,
      ...opts.excludes.length > 0 ? { excludes: { items: [...opts.excludes] } } : {},
      ...opts.includes && opts.includes.length > 0 ? { includes: { items: opts.includes.map((p) => typeof p === "string" ? p : p.pattern) } } : {}
    };
    let attached;
    let attaching = false;
    let pendingReattach = false;
    const reattach = async () => {
      if (store.isDisposed) {
        return;
      }
      if (attaching) {
        pendingReattach = true;
        return;
      }
      const entry = this._authorities.get(authority);
      const next = entry?.connections.at(-1);
      if (next === attached) {
        return;
      }
      handleHolder.clear();
      attached = void 0;
      const watchResource = next?.watchResource;
      if (!next || !watchResource) {
        return;
      }
      attaching = true;
      const target = next;
      try {
        const handle = await watchResource.call(target, params);
        if (store.isDisposed) {
          handle.dispose();
          return;
        }
        const current = this._authorities.get(authority);
        if (!current || current.connections.at(-1) !== target) {
          handle.dispose();
          return;
        }
        const sub = handle.onDidChange((changes) => this._onDidChangeFile.fire(changes.map((c) => ({
          resource: this._encodeUri(c.resource, resource.authority),
          type: c.type
        }))));
        handleHolder.value = toDisposable(() => {
          sub.dispose();
          handle.dispose();
        });
        attached = target;
      } catch (err) {
        this._onDidWatchError.fire(err instanceof Error ? err.message : String(err));
      } finally {
        attaching = false;
        if (pendingReattach) {
          pendingReattach = false;
          void reattach();
        }
      }
    };
    store.add(this._onDidChangeConnection.event((a) => {
      if (a === authority) {
        void reattach();
      }
    }));
    void reattach();
    return store;
  }
  async stat(resource) {
    const path = resource.path;
    if (path === "/" || path === "") {
      return { type: FileType.Directory, mtime: 0, ctime: 0, size: 0, permissions: FilePermission.Readonly };
    }
    const decoded = this._decodeUri(resource);
    if (decoded.scheme === "session-db" || decoded.scheme === "git-blob") {
      return { type: FileType.File, mtime: 0, ctime: 0, size: 0, permissions: FilePermission.Readonly };
    }
    if (decoded.path === "/" || decoded.path === "") {
      return { type: FileType.Directory, mtime: 0, ctime: 0, size: 0, permissions: FilePermission.Readonly };
    }
    const connection = await this._getConnection(resource.authority);
    try {
      const resolved = await this._resolve(connection, decoded);
      return {
        type: resolved.type === "directory" ? FileType.Directory : resolved.type === "symlink" ? FileType.SymbolicLink : FileType.File,
        mtime: resolved.mtime ? Date.parse(resolved.mtime) : 0,
        ctime: resolved.ctime ? Date.parse(resolved.ctime) : 0,
        size: resolved.size ?? 0
      };
    } catch (err) {
      throw this._mapError(err, FileSystemProviderErrorCode.FileNotFound);
    }
  }
  async realpath(resource) {
    const path = resource.path;
    if (path === "/" || path === "") {
      return path;
    }
    const decoded = this._decodeUri(resource);
    if (decoded.scheme === "session-db" || decoded.scheme === "git-blob" || decoded.path === "/" || decoded.path === "") {
      return path;
    }
    const connection = await this._getConnection(resource.authority);
    try {
      const resolved = await this._resolve(connection, decoded);
      return this._encodeUri(URI.parse(resolved.uri), resource.authority).path;
    } catch (err) {
      throw this._mapError(err, FileSystemProviderErrorCode.FileNotFound);
    }
  }
  async readdir(resource) {
    const entries = await this._listDirectory(resource.authority, resource);
    return entries.map((e) => [e.name, e.type === "directory" ? FileType.Directory : FileType.File]);
  }
  async readFile(resource) {
    const connection = await this._getConnection(resource.authority);
    try {
      const originalUri = this._decodeUri(resource);
      const result = await connection.resourceRead(originalUri);
      if (result.encoding === ContentEncoding.Base64) {
        return decodeBase64(result.data).buffer;
      }
      return VSBuffer.fromString(result.data).buffer;
    } catch (err) {
      throw this._mapError(err, FileSystemProviderErrorCode.FileNotFound);
    }
  }
  async writeFile(resource, content, _opts) {
    const connection = await this._getConnection(resource.authority);
    try {
      const originalUri = this._decodeUri(resource);
      await connection.resourceWrite({
        channel: ROOT_STATE_URI,
        uri: originalUri.toString(),
        data: VSBuffer.wrap(content).toString(),
        encoding: ContentEncoding.Utf8
      });
    } catch (err) {
      throw this._mapError(err, FileSystemProviderErrorCode.NoPermissions);
    }
  }
  async mkdir(resource) {
    const connection = await this._getConnection(resource.authority);
    try {
      const originalUri = this._decodeUri(resource);
      await connection.resourceMkdir({ channel: ROOT_STATE_URI, uri: originalUri.toString() });
    } catch (err) {
      throw this._mapError(err, FileSystemProviderErrorCode.NoPermissions);
    }
  }
  async delete(resource, opts) {
    const connection = await this._getConnection(resource.authority);
    try {
      const originalUri = this._decodeUri(resource);
      await connection.resourceDelete({ channel: ROOT_STATE_URI, uri: originalUri.toString(), recursive: opts.recursive });
    } catch (err) {
      throw this._mapError(err, FileSystemProviderErrorCode.NoPermissions);
    }
  }
  async rename(from, to, opts) {
    const connection = await this._getConnection(from.authority);
    try {
      const originalFrom = this._decodeUri(from);
      const originalTo = this._decodeUri(to);
      await connection.resourceMove({ channel: ROOT_STATE_URI, source: originalFrom.toString(), destination: originalTo.toString(), failIfExists: !opts.overwrite });
    } catch (err) {
      throw this._mapError(err, FileSystemProviderErrorCode.NoPermissions);
    }
  }
  async copy(from, to, opts) {
    const connection = await this._getConnection(from.authority);
    try {
      const originalFrom = this._decodeUri(from);
      const originalTo = this._decodeUri(to);
      await connection.resourceCopy({ channel: ROOT_STATE_URI, source: originalFrom.toString(), destination: originalTo.toString(), failIfExists: !opts.overwrite });
    } catch (err) {
      throw this._mapError(err, FileSystemProviderErrorCode.NoPermissions);
    }
  }
  /**
   * Negotiate access to {@link resource} with the receiver, asking for the
   * granted modes in {@link opts}. Used after a `NoPermissions` failure to
   * prompt the receiver to grant access; the caller can then retry.
   *
   * Resolves on success. Rejects if the receiver denies, the connection
   * is missing, or the connection doesn't implement `resourceRequest`.
   */
  async requestResourceAccess(resource, opts) {
    const connection = await this._getConnection(resource.authority);
    if (!connection.resourceRequest) {
      throw createFileSystemProviderError(
        `Connection for ${resource.authority} does not support resourceRequest`,
        FileSystemProviderErrorCode.Unavailable
      );
    }
    const originalUri = this._decodeUri(resource);
    try {
      await connection.resourceRequest({
        channel: ROOT_STATE_URI,
        uri: originalUri.toString(),
        read: opts.read,
        write: opts.write
      });
    } catch (err) {
      throw this._mapError(err, FileSystemProviderErrorCode.NoPermissions);
    }
  }
  // ---- Internals ----------------------------------------------------------
  _getConnection(authority) {
    const entry = this._authorities.get(authority);
    if (!entry) {
      return Promise.reject(createFileSystemProviderError(
        `No connection for authority: ${authority}`,
        FileSystemProviderErrorCode.Unavailable
      ));
    }
    const active = entry.connections.at(-1);
    if (active) {
      return Promise.resolve(active);
    }
    return new Promise((resolve, reject) => {
      const settle = () => {
        const current = this._authorities.get(authority);
        if (!current) {
          sub.dispose();
          reject(createFileSystemProviderError(
            `No connection for authority: ${authority}`,
            FileSystemProviderErrorCode.Unavailable
          ));
          return;
        }
        const c = current.connections.at(-1);
        if (c) {
          sub.dispose();
          resolve(c);
        }
      };
      const sub = this._onDidChangeConnection.event((a) => {
        if (a === authority) {
          settle();
        }
      });
      settle();
    });
  }
  /**
   * Translate a thrown error from a {@link IRemoteFilesystemConnection}
   * into a {@link FileSystemProviderError}. Preserves `PermissionDenied`
   * (-32009) as `NoPermissions` so callers can distinguish a
   * permission failure from `NotFound` and decide whether to negotiate
   * via {@link requestResourceAccess}.
   */
  _mapError(err, defaultCode) {
    if (err instanceof ProtocolError && err.code === AhpErrorCodes.PermissionDenied) {
      return createFileSystemProviderError(err.message, FileSystemProviderErrorCode.NoPermissions);
    }
    return createFileSystemProviderError(
      err instanceof Error ? err.message : String(err),
      defaultCode
    );
  }
  /**
   * Resolve a decoded resource over {@link connection}. Shared by
   * {@link stat} and {@link realpath}.
   */
  _resolve(connection, decoded) {
    return connection.resourceResolve({ channel: ROOT_STATE_URI, uri: decoded.toString() });
  }
  async _listDirectory(authority, resource) {
    const connection = await this._getConnection(authority);
    try {
      const originalUri = this._decodeUri(resource);
      const result = await connection.resourceList(originalUri);
      return result.entries;
    } catch (err) {
      throw this._mapError(err, FileSystemProviderErrorCode.Unavailable);
    }
  }
};
/**
 * Grace period during which {@link _getConnection} will await a new
 * registration after the previous one is disposed. Covers the window
 * where a transport is briefly torn down and re-registered (e.g. an
 * agent-host client reconnect that races a plugin sync). 5s matches
 * the typical reconnect timeout. Consumers should still implement
 * logical retries for longer reconnection latencies, but this is a
 * low level, best-effort mechanism.
 *
 * Tests can override this via the constructor parameter.
 */
_AHPFileSystemProvider._DEFAULT_CONNECTION_GRACE_MS = 5e3;
let AHPFileSystemProvider = _AHPFileSystemProvider;
class AgentHostFileSystemProvider extends AHPFileSystemProvider {
  _decodeUri(resource) {
    return fromAgentHostUri(resource);
  }
  _encodeUri(resource, authority) {
    return toAgentHostUri(resource, authority);
  }
}
export {
  AHPFileSystemProvider,
  AgentHostFileSystemProvider,
  agentHostRemotePath,
  agentHostUri,
  createRemoteWatchHandle
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxjb21tb25cXGFnZW50SG9zdEZpbGVTeXN0ZW1Qcm92aWRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlY29kZUJhc2U2NCwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yLCBGaWxlQ2hhbmdlVHlwZSwgRmlsZVBlcm1pc3Npb24sIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcywgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLCBGaWxlVHlwZSwgSUZpbGVDaGFuZ2UsIElGaWxlRGVsZXRlT3B0aW9ucywgSUZpbGVPdmVyd3JpdGVPcHRpb25zLCBJRmlsZVN5c3RlbVByb3ZpZGVyLCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFscGF0aENhcGFiaWxpdHksIElGaWxlV3JpdGVPcHRpb25zLCBJU3RhdCwgSVdhdGNoT3B0aW9ucyB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBmcm9tQWdlbnRIb3N0VXJpLCB0b0FnZW50SG9zdFVyaSB9IGZyb20gJy4vYWdlbnRIb3N0VXJpLmpzJztcbmltcG9ydCB7IENvbnRlbnRFbmNvZGluZywgdHlwZSBDcmVhdGVSZXNvdXJjZVdhdGNoUGFyYW1zLCB0eXBlIERpcmVjdG9yeUVudHJ5LCB0eXBlIFJlc291cmNlQ29weVBhcmFtcywgdHlwZSBSZXNvdXJjZUNvcHlSZXN1bHQsIHR5cGUgUmVzb3VyY2VEZWxldGVQYXJhbXMsIHR5cGUgUmVzb3VyY2VEZWxldGVSZXN1bHQsIHR5cGUgUmVzb3VyY2VMaXN0UmVzdWx0LCB0eXBlIFJlc291cmNlTWtkaXJQYXJhbXMsIHR5cGUgUmVzb3VyY2VNa2RpclJlc3VsdCwgdHlwZSBSZXNvdXJjZU1vdmVQYXJhbXMsIHR5cGUgUmVzb3VyY2VNb3ZlUmVzdWx0LCB0eXBlIFJlc291cmNlUmVhZFJlc3VsdCwgdHlwZSBSZXNvdXJjZVJlcXVlc3RQYXJhbXMsIHR5cGUgUmVzb3VyY2VSZXF1ZXN0UmVzdWx0LCB0eXBlIFJlc291cmNlUmVzb2x2ZVBhcmFtcywgdHlwZSBSZXNvdXJjZVJlc29sdmVSZXN1bHQsIHR5cGUgUmVzb3VyY2VXcml0ZVBhcmFtcywgdHlwZSBSZXNvdXJjZVdyaXRlUmVzdWx0IH0gZnJvbSAnLi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBBaHBFcnJvckNvZGVzIH0gZnJvbSAnLi9zdGF0ZS9wcm90b2NvbC9lcnJvcnMuanMnO1xuaW1wb3J0IHsgUHJvdG9jb2xFcnJvciB9IGZyb20gJy4vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIHR5cGUgQWN0aW9uRW52ZWxvcGUgfSBmcm9tICcuL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IFJPT1RfU1RBVEVfVVJJIH0gZnJvbSAnLi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuXG4vKipcbiAqIEludGVyZmFjZSBmb3IgcGVyZm9ybWluZyByZXNvdXJjZSBvcGVyYXRpb25zIG9uIGEgcmVtb3RlIGVuZHBvaW50LlxuICpcbiAqIEJvdGgge0BsaW5rIElBZ2VudENvbm5lY3Rpb259IChjbGllbnRcdTIxOTJzZXJ2ZXIpIGFuZCBjbGllbnQtZXhwb3NlZFxuICogZmlsZXN5c3RlbXMgKHNlcnZlclx1MjE5MmNsaWVudCkgc2F0aXNmeSB0aGlzIGNvbnRyYWN0LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElSZW1vdGVGaWxlc3lzdGVtQ29ubmVjdGlvbiB7XG5cdHJlc291cmNlTGlzdCh1cmk6IFVSSSk6IFByb21pc2U8UmVzb3VyY2VMaXN0UmVzdWx0Pjtcblx0cmVzb3VyY2VSZWFkKHVyaTogVVJJKTogUHJvbWlzZTxSZXNvdXJjZVJlYWRSZXN1bHQ+O1xuXHRyZXNvdXJjZVdyaXRlKHBhcmFtczogUmVzb3VyY2VXcml0ZVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VXcml0ZVJlc3VsdD47XG5cdHJlc291cmNlRGVsZXRlKHBhcmFtczogUmVzb3VyY2VEZWxldGVQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlRGVsZXRlUmVzdWx0Pjtcblx0cmVzb3VyY2VNb3ZlKHBhcmFtczogUmVzb3VyY2VNb3ZlUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZU1vdmVSZXN1bHQ+O1xuXHQvKiogQ29weSBhIHJlc291cmNlIG9uIHRoZSByZW1vdGUgZW5kcG9pbnQuICovXG5cdHJlc291cmNlQ29weShwYXJhbXM6IFJlc291cmNlQ29weVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VDb3B5UmVzdWx0Pjtcblx0LyoqXG5cdCAqIE5lZ290aWF0ZSBhY2Nlc3MgdG8gYSByZXNvdXJjZSB0aGUgcmVjZWl2ZXIgbWVkaWF0ZXMuIE9wdGlvbmFsIGJlY2F1c2Vcblx0ICogbm90IGV2ZXJ5IGNvbm5lY3Rpb24gaW4gdGhlIGNvZGViYXNlIGNhcnJpZXMgb25lIFx1MjAxNCBvbmx5IHRoZSBhZ2VudC1ob3N0XG5cdCAqIHNlcnZlci10by1jbGllbnQgZGlyZWN0aW9uIG5lZWRzIHRvIHNlbmQgYHJlc291cmNlUmVxdWVzdGAgdG9kYXkuXG5cdCAqL1xuXHRyZXNvdXJjZVJlcXVlc3Q/KHBhcmFtczogUmVzb3VyY2VSZXF1ZXN0UGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZVJlcXVlc3RSZXN1bHQ+O1xuXHQvKiogUmVzb2x2ZSAoc3RhdCArIHJlYWxwYXRoKSBhIHJlc291cmNlIG9uIHRoZSByZW1vdGUgZW5kcG9pbnQuICovXG5cdHJlc291cmNlUmVzb2x2ZShwYXJhbXM6IFJlc291cmNlUmVzb2x2ZVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VSZXNvbHZlUmVzdWx0Pjtcblx0LyoqIENyZWF0ZSBhIGRpcmVjdG9yeSBvbiB0aGUgcmVtb3RlIGVuZHBvaW50IChta2RpciAtcCBzZW1hbnRpY3MpLiAqL1xuXHRyZXNvdXJjZU1rZGlyKHBhcmFtczogUmVzb3VyY2VNa2RpclBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VNa2RpclJlc3VsdD47XG5cdC8qKlxuXHQgKiBTdGFydCBhIGZpbGUtc3lzdGVtIHdhdGNoZXIgb24gdGhlIHJlbW90ZSBlbmRwb2ludCBhbmQgcmV0dXJuIGFcblx0ICogaGFuZGxlIHdob3NlIGBvbkRpZENoYW5nZWAgZXZlbnQgZmlyZXMgZm9yIGV2ZXJ5IGNoYW5nZSB0aGUgcmVtb3RlXG5cdCAqIHJlcG9ydHMgdW5kZXIgdGhlIHdhdGNoZWQgcm9vdC4gRGlzcG9zaW5nIHRoZSBoYW5kbGUgdW5zdWJzY3JpYmVzXG5cdCAqIHRoZSB3YXRjaCAoc3ViamVjdCB0byB0aGUgcmVjZWl2ZXIncyBncmFjZSB3aW5kb3cpLlxuXHQgKlxuXHQgKiBPcHRpb25hbDogaW1wbGVtZW50YXRpb25zIHdpdGhvdXQgc3Vic2NyaXB0aW9uIG1hY2hpbmVyeSBvbWl0IGl0OyB0aGVcblx0ICogZmlsZXN5c3RlbSBwcm92aWRlciBkZWdyYWRlcyB0byBhIG5vLW9wIGB3YXRjaCgpYCBpbiB0aGF0IGNhc2UuXG5cdCAqL1xuXHR3YXRjaFJlc291cmNlPyhwYXJhbXM6IENyZWF0ZVJlc291cmNlV2F0Y2hQYXJhbXMpOiBQcm9taXNlPElSZW1vdGVXYXRjaEhhbmRsZT47XG59XG5cbi8qKlxuICogSGFuZGxlIGZvciBhIHJlbW90ZSBmaWxlLXN5c3RlbSB3YXRjaGVyIHJldHVybmVkIGJ5XG4gKiB7QGxpbmsgSVJlbW90ZUZpbGVzeXN0ZW1Db25uZWN0aW9uLndhdGNoUmVzb3VyY2V9LiBNaXJyb3JzIHRoZSBzaGFwZVxuICogb2YgYElGaWxlU3lzdGVtV2F0Y2hlcmAgZnJvbSBgLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzYCBzbyB0aGUgRlNcbiAqIHByb3ZpZGVyIGNhbiBwbHVnIGV2ZW50cyBzdHJhaWdodCBpbnRvIGl0cyBvd24gYG9uRGlkQ2hhbmdlRmlsZWBcbiAqIGVtaXR0ZXIuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVJlbW90ZVdhdGNoSGFuZGxlIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8cmVhZG9ubHkgSUZpbGVDaGFuZ2VbXT47XG59XG5cbi8qKlxuICogU2hhcmVkIGltcGxlbWVudGF0aW9uIG9mIHtAbGluayBJQWdlbnRDb25uZWN0aW9uLndhdGNoUmVzb3VyY2V9IFx1MjAxNFxuICogYnVuZGxlcyBgY3JlYXRlUmVzb3VyY2VXYXRjaGAgKyBgc3Vic2NyaWJlYCArIGEgcGVyLWNoYW5uZWwgbGlzdGVuZXJcbiAqIG9uIHRoZSBhY3Rpb24gc3RyZWFtIGludG8gYW4ge0BsaW5rIElSZW1vdGVXYXRjaEhhbmRsZX0uIFVzZWQgYnlcbiAqIGV2ZXJ5IHRyYW5zcG9ydCB0aGF0IGV4cG9zZXMgdGhvc2UgZm91ciBwcmltaXRpdmVzIHNvIHdlIGRvbid0IG5lZWRcbiAqIHRvIGR1cGxpY2F0ZSB0aGUgd2lyZSBib29ra2VlcGluZyBpbiBlYWNoIGBJQWdlbnRDb25uZWN0aW9uYFxuICogaW1wbGVtZW50YXRpb24uXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjcmVhdGVSZW1vdGVXYXRjaEhhbmRsZShcblx0cHJpbWl0aXZlczoge1xuXHRcdGNyZWF0ZVJlc291cmNlV2F0Y2gocGFyYW1zOiBDcmVhdGVSZXNvdXJjZVdhdGNoUGFyYW1zKTogUHJvbWlzZTx7IGNoYW5uZWw6IHN0cmluZyB9Pjtcblx0XHRzdWJzY3JpYmUoY2hhbm5lbDogVVJJKTogUHJvbWlzZTx1bmtub3duPjtcblx0XHR1bnN1YnNjcmliZShjaGFubmVsOiBVUkkpOiB2b2lkO1xuXHRcdG9uRGlkQWN0aW9uOiBFdmVudDxBY3Rpb25FbnZlbG9wZT47XG5cdH0sXG5cdHBhcmFtczogQ3JlYXRlUmVzb3VyY2VXYXRjaFBhcmFtcyxcbik6IFByb21pc2U8SVJlbW90ZVdhdGNoSGFuZGxlPiB7XG5cdGNvbnN0IHsgY2hhbm5lbCB9ID0gYXdhaXQgcHJpbWl0aXZlcy5jcmVhdGVSZXNvdXJjZVdhdGNoKHBhcmFtcyk7XG5cdGNvbnN0IGNoYW5uZWxVcmkgPSBVUkkucGFyc2UoY2hhbm5lbCk7XG5cdGF3YWl0IHByaW1pdGl2ZXMuc3Vic2NyaWJlKGNoYW5uZWxVcmkpO1xuXHRjb25zdCBvbkRpZENoYW5nZUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxyZWFkb25seSBJRmlsZUNoYW5nZVtdPigpO1xuXHRjb25zdCBsaXN0ZW5lciA9IHByaW1pdGl2ZXMub25EaWRBY3Rpb24oZW52ZWxvcGUgPT4ge1xuXHRcdGlmIChlbnZlbG9wZS5jaGFubmVsICE9PSBjaGFubmVsIHx8IGVudmVsb3BlLmFjdGlvbi50eXBlICE9PSBBY3Rpb25UeXBlLlJlc291cmNlV2F0Y2hDaGFuZ2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGl0ZW1zID0gZW52ZWxvcGUuYWN0aW9uLmNoYW5nZXM/Lml0ZW1zID8/IFtdO1xuXHRcdGlmIChpdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0b25EaWRDaGFuZ2VFbWl0dGVyLmZpcmUoaXRlbXMubWFwKGl0ZW0gPT4gKHtcblx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoaXRlbS51cmkpLFxuXHRcdFx0dHlwZTogaXRlbS50eXBlID09PSAnYWRkZWQnID8gRmlsZUNoYW5nZVR5cGUuQURERURcblx0XHRcdFx0OiBpdGVtLnR5cGUgPT09ICdkZWxldGVkJyA/IEZpbGVDaGFuZ2VUeXBlLkRFTEVURURcblx0XHRcdFx0XHQ6IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQsXG5cdFx0fSkpKTtcblx0fSk7XG5cdGxldCBkaXNwb3NlZCA9IGZhbHNlO1xuXHRyZXR1cm4ge1xuXHRcdG9uRGlkQ2hhbmdlOiBvbkRpZENoYW5nZUVtaXR0ZXIuZXZlbnQsXG5cdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0aWYgKGRpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGRpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdG9uRGlkQ2hhbmdlRW1pdHRlci5kaXNwb3NlKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRwcmltaXRpdmVzLnVuc3Vic2NyaWJlKGNoYW5uZWxVcmkpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIENvbm5lY3Rpb24gbWF5IGFscmVhZHkgYmUgZ29uZTsgdGhlIHNlcnZlci1zaWRlIGdyYWNlXG5cdFx0XHRcdC8vIHRpbWVyIHdpbGwgY2xlYW4gdXAuXG5cdFx0XHR9XG5cdFx0fSxcblx0fTtcbn1cblxuLyoqXG4gKiBCdWlsZCBhIHtAbGluayBBR0VOVF9IT1NUX1NDSEVNRX0gVVJJIGZvciBhIGdpdmVuIGNvbm5lY3Rpb24gYXV0aG9yaXR5XG4gKiBhbmQgcmVtb3RlIHBhdGguIEFzc3VtZXMgdGhlIHJlbW90ZSBwYXRoIGlzIGEgYGZpbGU6Ly9gIHJlc291cmNlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYWdlbnRIb3N0VXJpKGF1dGhvcml0eTogc3RyaW5nLCBwYXRoOiBzdHJpbmcpOiBVUkkge1xuXHRyZXR1cm4gdG9BZ2VudEhvc3RVcmkoVVJJLmZpbGUocGF0aCksIGF1dGhvcml0eSk7XG59XG5cbi8qKlxuICogRXh0cmFjdCB0aGUgcmVtb3RlIGZpbGVzeXN0ZW0gcGF0aCBmcm9tIGEge0BsaW5rIEFHRU5UX0hPU1RfU0NIRU1FfSBVUkkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhZ2VudEhvc3RSZW1vdGVQYXRoKHVyaTogVVJJKTogc3RyaW5nIHtcblx0cmV0dXJuIGZyb21BZ2VudEhvc3RVcmkodXJpKS5wYXRoO1xufVxuXG4vLyAtLS0tIEFic3RyYWN0IGJhc2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5pbnRlcmZhY2UgSUF1dGhvcml0eUVudHJ5IHtcblx0LyoqXG5cdCAqIEFsbCBjdXJyZW50bHktcmVnaXN0ZXJlZCBjb25uZWN0aW9ucyBmb3IgdGhpcyBhdXRob3JpdHksIG9sZGVzdFxuXHQgKiBmaXJzdC4gVGhlIGFjdGl2ZSBjb25uZWN0aW9uIGlzIHRoZSBsYXN0IGVudHJ5IChtb3N0IHJlY2VudFxuXHQgKiByZWdpc3RyYXRpb24gd2lucykuIE9sZGVyIHJlZ2lzdHJhdGlvbnMgYXJlIGtlcHQgc28gdGhhdCBpZiBhXG5cdCAqIGNhbGxlciByZWdpc3RlcnMgYEFgLCB0aGVuIGBCYCwgdGhlbiBkaXNwb3NlcyBgQmAsIHdlIHRyYW5zcGFyZW50bHlcblx0ICogZmFsbCBiYWNrIHRvIGBBYCBpbnN0ZWFkIG9mIGVudGVyaW5nIGEgZ3JhY2Ugd2luZG93LlxuXHQgKlxuXHQgKiBFbXB0eSB3aGlsZSB0aGUgZW50cnkgaXMgaW5zaWRlIHRoZSBncmFjZSB3aW5kb3cuXG5cdCAqL1xuXHRjb25uZWN0aW9uczogSVJlbW90ZUZpbGVzeXN0ZW1Db25uZWN0aW9uW107XG5cdC8qKlxuXHQgKiBQZW5kaW5nIGV2aWN0aW9uIHRpbWVyOyBhcm1lZCB3aGlsZSB7QGxpbmsgY29ubmVjdGlvbnN9IGlzIGVtcHR5LFxuXHQgKiBjbGVhcmVkIG9uIHJlLXJlZ2lzdHJhdGlvbiBvciBldmljdGlvbi5cblx0ICovXG5cdHJlYWRvbmx5IGV4cGlyeTogTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+O1xufVxuXG4vKipcbiAqIHtAbGluayBJRmlsZVN5c3RlbVByb3ZpZGVyfSB0aGF0IHByb3hpZXMgZmlsZXN5c3RlbSBvcGVyYXRpb25zXG4gKiB0aHJvdWdoIGEge0BsaW5rIElSZW1vdGVGaWxlc3lzdGVtQ29ubmVjdGlvbn0uXG4gKlxuICogVVJJcyBlbmNvZGUgdGhlIG9yaWdpbmFsIHNjaGVtZSBhbmQgYXV0aG9yaXR5IGluIHRoZSBwYXRoIHNvIGFueSByZW1vdGVcbiAqIHJlc291cmNlIGNhbiBiZSByZXByZXNlbnRlZC4gU3ViY2xhc3NlcyBwcm92aWRlIHRoZSBVUkkgZGVjb2RlIGZ1bmN0aW9uXG4gKiBhbmQgc2NoZW1lLXNwZWNpZmljIGhlbHBlcnMuXG4gKlxuICogSW5kaXZpZHVhbCBjb25uZWN0aW9ucyBhcmUgaWRlbnRpZmllZCBieSB0aGUgVVJJJ3MgYXV0aG9yaXR5IGNvbXBvbmVudC5cbiAqL1xuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFIUEZpbGVTeXN0ZW1Qcm92aWRlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRmlsZVN5c3RlbVByb3ZpZGVyLCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFscGF0aENhcGFiaWxpdHkge1xuXG5cdHJlYWRvbmx5IGNhcGFiaWxpdGllcyA9XG5cdFx0RmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLlBhdGhDYXNlU2Vuc2l0aXZlIHxcblx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSB8XG5cdFx0RmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVGb2xkZXJDb3B5IHxcblx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWxwYXRoO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ2FwYWJpbGl0aWVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ2FwYWJpbGl0aWVzID0gdGhpcy5fb25EaWRDaGFuZ2VDYXBhYmlsaXRpZXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VGaWxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8cmVhZG9ubHkgSUZpbGVDaGFuZ2VbXT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmlsZSA9IHRoaXMuX29uRGlkQ2hhbmdlRmlsZS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRXYXRjaEVycm9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRXYXRjaEVycm9yID0gdGhpcy5fb25EaWRXYXRjaEVycm9yLmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBQZXItYXV0aG9yaXR5IHJlZ2lzdHJhdGlvbiBzbG90LiBXZSBrZWVwIHRoZSBzbG90IGFsaXZlIGZvciBhIGJyaWVmXG5cdCAqIGdyYWNlIHBlcmlvZCBhZnRlciB0aGUgbGFzdCByZWdpc3RyYXRpb24gaXMgZGlzcG9zZWQsIHNvIGFuXG5cdCAqIG9wZXJhdGlvbiBpc3N1ZWQgZHVyaW5nIGEgcmVjb25uZWN0aW9uIHdpbmRvdyBjYW4gd2FpdCBmb3IgdGhlXG5cdCAqIHJlcGxhY2VtZW50IHJlZ2lzdHJhdGlvbiBpbnN0ZWFkIG9mIGZhaWxpbmcgaW1tZWRpYXRlbHkuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hdXRob3JpdGllcyA9IG5ldyBNYXA8c3RyaW5nLCBJQXV0aG9yaXR5RW50cnk+KCk7XG5cblx0LyoqXG5cdCAqIEZpcmVzIHRoZSBhdXRob3JpdHkgd2hvc2UgYWN0aXZlIGNvbm5lY3Rpb24gaGFzIGNoYW5nZWQ6IGFkZGVkLFxuXHQgKiByZXBsYWNlZCwgZmFsbGVuIGJhY2sgdG8gYW4gb2xkZXIgcmVnaXN0cmF0aW9uLCBlbnRlcmVkIHRoZSBncmFjZVxuXHQgKiB3aW5kb3cgKG5vIGFjdGl2ZSBjb25uZWN0aW9uKSwgb3IgZXZpY3RlZC4gTG9uZy1saXZlZCBjb25zdW1lcnNcblx0ICogKGUuZy4ge0BsaW5rIHdhdGNofSkgc3Vic2NyaWJlIGhlcmUgc28gdGhleSBjb250aW51ZSB0byByZWNlaXZlXG5cdCAqIG5vdGlmaWNhdGlvbnMgYWNyb3NzIGZ1bGwgZW50cnkgZXZpY3Rpb24gKyBsYXRlciByZS1jcmVhdGlvbiBcdTIwMTRcblx0ICogc29tZXRoaW5nIGEgcGVyLWVudHJ5IGVtaXR0ZXIgY2Fubm90IG9mZmVyLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb25uZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblxuXHQvKipcblx0ICogR3JhY2UgcGVyaW9kIGR1cmluZyB3aGljaCB7QGxpbmsgX2dldENvbm5lY3Rpb259IHdpbGwgYXdhaXQgYSBuZXdcblx0ICogcmVnaXN0cmF0aW9uIGFmdGVyIHRoZSBwcmV2aW91cyBvbmUgaXMgZGlzcG9zZWQuIENvdmVycyB0aGUgd2luZG93XG5cdCAqIHdoZXJlIGEgdHJhbnNwb3J0IGlzIGJyaWVmbHkgdG9ybiBkb3duIGFuZCByZS1yZWdpc3RlcmVkIChlLmcuIGFuXG5cdCAqIGFnZW50LWhvc3QgY2xpZW50IHJlY29ubmVjdCB0aGF0IHJhY2VzIGEgcGx1Z2luIHN5bmMpLiA1cyBtYXRjaGVzXG5cdCAqIHRoZSB0eXBpY2FsIHJlY29ubmVjdCB0aW1lb3V0LiBDb25zdW1lcnMgc2hvdWxkIHN0aWxsIGltcGxlbWVudFxuXHQgKiBsb2dpY2FsIHJldHJpZXMgZm9yIGxvbmdlciByZWNvbm5lY3Rpb24gbGF0ZW5jaWVzLCBidXQgdGhpcyBpcyBhXG5cdCAqIGxvdyBsZXZlbCwgYmVzdC1lZmZvcnQgbWVjaGFuaXNtLlxuXHQgKlxuXHQgKiBUZXN0cyBjYW4gb3ZlcnJpZGUgdGhpcyB2aWEgdGhlIGNvbnN0cnVjdG9yIHBhcmFtZXRlci5cblx0ICovXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9ERUZBVUxUX0NPTk5FQ1RJT05fR1JBQ0VfTVMgPSA1MDAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3Rpb25HcmFjZU1zOiBudW1iZXIgPSBBSFBGaWxlU3lzdGVtUHJvdmlkZXIuX0RFRkFVTFRfQ09OTkVDVElPTl9HUkFDRV9NUyxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RlciBhIG1hcHBpbmcgZnJvbSBhIFVSSSBhdXRob3JpdHkgdG8gYSBjb25uZWN0aW9uLlxuXHQgKiBSZXR1cm5zIGEgZGlzcG9zYWJsZSB0aGF0IHVucmVnaXN0ZXJzIHRoZSBtYXBwaW5nLiBNdWx0aXBsZVxuXHQgKiBjb25jdXJyZW50IHJlZ2lzdHJhdGlvbnMgZm9yIHRoZSBzYW1lIGF1dGhvcml0eSBhcmUgc3VwcG9ydGVkO1xuXHQgKiB0aGUgbW9zdCByZWNlbnQgcmVnaXN0cmF0aW9uIHdpbnMsIGFuZCBkaXNwb3NpbmcgaXQgZmFsbHMgYmFjayB0b1xuXHQgKiB0aGUgcHJldmlvdXMgb25lIChpZiBhbnkpLiBBZnRlciB0aGUgKmxhc3QqIHJlZ2lzdHJhdGlvbiBpc1xuXHQgKiBkaXNwb3NlZCB0aGUgZW50cnkgaXMgaGVsZCBvcGVuIGZvciB7QGxpbmsgX2Nvbm5lY3Rpb25HcmFjZU1zfSBzb1xuXHQgKiB0aGF0IGEgcmVjb25uZWN0IGNhbiByZXBsYWNlIGl0IHdpdGhvdXQgb3JwaGFuaW5nIGluLWZsaWdodFxuXHQgKiBvcGVyYXRpb25zLlxuXHQgKi9cblx0cmVnaXN0ZXJBdXRob3JpdHkoYXV0aG9yaXR5OiBzdHJpbmcsIGNvbm5lY3Rpb246IElSZW1vdGVGaWxlc3lzdGVtQ29ubmVjdGlvbik6IElEaXNwb3NhYmxlIHtcblx0XHRsZXQgZW50cnkgPSB0aGlzLl9hdXRob3JpdGllcy5nZXQoYXV0aG9yaXR5KTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRlbnRyeSA9IHtcblx0XHRcdFx0Y29ubmVjdGlvbnM6IFtjb25uZWN0aW9uXSxcblx0XHRcdFx0ZXhwaXJ5OiBuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCksXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fYXV0aG9yaXRpZXMuc2V0KGF1dGhvcml0eSwgZW50cnkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRlbnRyeS5leHBpcnkuY2xlYXIoKTtcblx0XHRcdGVudHJ5LmNvbm5lY3Rpb25zLnB1c2goY29ubmVjdGlvbik7XG5cdFx0fVxuXHRcdGNvbnN0IGFkb3B0ZWQgPSBlbnRyeTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb24uZmlyZShhdXRob3JpdHkpO1xuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBpZHggPSBhZG9wdGVkLmNvbm5lY3Rpb25zLmluZGV4T2YoY29ubmVjdGlvbik7XG5cdFx0XHRpZiAoaWR4ID09PSAtMSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB3YXNBY3RpdmUgPSBpZHggPT09IGFkb3B0ZWQuY29ubmVjdGlvbnMubGVuZ3RoIC0gMTtcblx0XHRcdGFkb3B0ZWQuY29ubmVjdGlvbnMuc3BsaWNlKGlkeCwgMSk7XG5cdFx0XHRpZiAoYWRvcHRlZC5jb25uZWN0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0YWRvcHRlZC5leHBpcnkudmFsdWUgPSBkaXNwb3NhYmxlVGltZW91dChcblx0XHRcdFx0XHQoKSA9PiB0aGlzLl9leHBpcmVBdXRob3JpdHkoYXV0aG9yaXR5LCBhZG9wdGVkKSxcblx0XHRcdFx0XHR0aGlzLl9jb25uZWN0aW9uR3JhY2VNcyxcblx0XHRcdFx0XHR0aGlzLl9zdG9yZSxcblx0XHRcdFx0KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHdhc0FjdGl2ZSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb24uZmlyZShhdXRob3JpdHkpOyAvLyBGYWxsaW5nIGJhY2sgdG8gYW4gb2xkZXIgY29ubmVjdGlvbiBcdTIwMTQgc3VyZmFjZSB0aGUgY2hhbmdlLlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZXhwaXJlQXV0aG9yaXR5KGF1dGhvcml0eTogc3RyaW5nLCBlbnRyeTogSUF1dGhvcml0eUVudHJ5KTogdm9pZCB7XG5cdFx0Ly8gQSByZS1yZWdpc3RyYXRpb24gbWF5IGhhdmUgbGFuZGVkIGJldHdlZW4gc2NoZWR1bGluZyBhbmRcblx0XHQvLyBmaXJpbmcgXHUyMDE0IGJhaWwgaW4gdGhhdCBjYXNlLlxuXHRcdGlmICh0aGlzLl9hdXRob3JpdGllcy5nZXQoYXV0aG9yaXR5KSAhPT0gZW50cnkgfHwgZW50cnkuY29ubmVjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9hdXRob3JpdGllcy5kZWxldGUoYXV0aG9yaXR5KTtcblx0XHRlbnRyeS5leHBpcnkuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbi5maXJlKGF1dGhvcml0eSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fYXV0aG9yaXRpZXMudmFsdWVzKCkpIHtcblx0XHRcdGVudHJ5LmV4cGlyeS5kaXNwb3NlKCk7XG5cdFx0XHRlbnRyeS5jb25uZWN0aW9ucy5sZW5ndGggPSAwO1xuXHRcdH1cblx0XHR0aGlzLl9hdXRob3JpdGllcy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8qKiBEZWNvZGUgYSBwcm92aWRlciBVUkkgYmFjayB0byB0aGUgb3JpZ2luYWwgVVJJIGZvciB0aGUgcmVtb3RlIGVuZHBvaW50LiAqL1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2RlY29kZVVyaShyZXNvdXJjZTogVVJJKTogVVJJO1xuXG5cdC8qKiBFbmNvZGUgYSByZW1vdGUgVVJJIGJhY2sgaW50byBhIHByb3ZpZGVyIFVSSSB3aXRoIHRoZSBnaXZlbiBhdXRob3JpdHkuICovXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfZW5jb2RlVXJpKHJlc291cmNlOiBVUkksIGF1dGhvcml0eTogc3RyaW5nKTogVVJJO1xuXG5cdHdhdGNoKHJlc291cmNlOiBVUkksIG9wdHM6IElXYXRjaE9wdGlvbnMpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Ly8gYElGaWxlU3lzdGVtUHJvdmlkZXIud2F0Y2hgIGlzIHN5bmNocm9ub3VzLCBidXQgYWNxdWlyaW5nIGFcblx0XHQvLyBjb25uZWN0aW9uIG1heSBoYXZlIHRvIHdhaXQgZm9yIGEgKHJlKXJlZ2lzdHJhdGlvbiBhbmQgdGhlXG5cdFx0Ly8gdW5kZXJseWluZyBBSFAgYGNyZWF0ZVJlc291cmNlV2F0Y2hgICsgYHN1YnNjcmliZWAgcm91bmQtdHJpcFxuXHRcdC8vIGlzIGl0c2VsZiBhc3luYy4gQWRkaXRpb25hbGx5LCB3YXRjaGVycyBhcmUgbG9uZy1saXZlZDogZXZlcnlcblx0XHQvLyB0aW1lIHRoZSBhY3RpdmUgY29ubmVjdGlvbiBmb3IgYGF1dGhvcml0eWAgY2hhbmdlcyAocmVjb25uZWN0LFxuXHRcdC8vIGZhbGxiYWNrIHRvIGFuIG9sZGVyIHJlZ2lzdHJhdGlvbiwgZXZpY3Rpb24gZm9sbG93ZWQgYnkgYSBmcmVzaFxuXHRcdC8vIHJlZ2lzdHJhdGlvbiwgLi4uKSB3ZSB0ZWFyIGRvd24gYW55IGV4aXN0aW5nIHJlbW90ZSBoYW5kbGUgYW5kXG5cdFx0Ly8gcmUtYXR0YWNoIGFnYWluc3QgdGhlIG5ldyBjb25uZWN0aW9uLiBUaGUgY2xhc3MtbGV2ZWxcblx0XHQvLyB7QGxpbmsgX29uRGlkQ2hhbmdlQ29ubmVjdGlvbn0gZXZlbnQga2VlcHMgdXMgaW5mb3JtZWQgYWNyb3NzXG5cdFx0Ly8gdGhlIGZ1bGwgZW50cnktZXZpY3Rpb24gY3ljbGUuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgaGFuZGxlSG9sZGVyID0gc3RvcmUuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cdFx0Y29uc3QgYXV0aG9yaXR5ID0gcmVzb3VyY2UuYXV0aG9yaXR5O1xuXHRcdGNvbnN0IHBhcmFtczogQ3JlYXRlUmVzb3VyY2VXYXRjaFBhcmFtcyA9IHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0dXJpOiB0aGlzLl9kZWNvZGVVcmkocmVzb3VyY2UpLnRvU3RyaW5nKCksXG5cdFx0XHRyZWN1cnNpdmU6IG9wdHMucmVjdXJzaXZlLFxuXHRcdFx0Li4uKG9wdHMuZXhjbHVkZXMubGVuZ3RoID4gMCA/IHsgZXhjbHVkZXM6IHsgaXRlbXM6IFsuLi5vcHRzLmV4Y2x1ZGVzXSB9IH0gOiB7fSksXG5cdFx0XHQuLi4ob3B0cy5pbmNsdWRlcyAmJiBvcHRzLmluY2x1ZGVzLmxlbmd0aCA+IDBcblx0XHRcdFx0PyB7IGluY2x1ZGVzOiB7IGl0ZW1zOiBvcHRzLmluY2x1ZGVzLm1hcChwID0+IHR5cGVvZiBwID09PSAnc3RyaW5nJyA/IHAgOiBwLnBhdHRlcm4pIH0gfVxuXHRcdFx0XHQ6IHt9KSxcblx0XHR9O1xuXG5cdFx0Ly8gVHJhY2sgd2hpY2ggY29ubmVjdGlvbiB0aGUgY3VycmVudCBoYW5kbGUgd2FzIGNyZWF0ZWQgYWdhaW5zdFxuXHRcdC8vIHNvIHdlIGlnbm9yZSBzcHVyaW91cyBjaGFuZ2UgZXZlbnRzIHRoYXQgZG9uJ3QgcmVwcmVzZW50IGFcblx0XHQvLyByZWFsIHN3YXAgKGUuZy4gYSBzdGFsZSByZWdpc3RyYXRpb24gZGlzcG9zYWwpLlxuXHRcdGxldCBhdHRhY2hlZDogSVJlbW90ZUZpbGVzeXN0ZW1Db25uZWN0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBhdHRhY2hpbmcgPSBmYWxzZTtcblx0XHRsZXQgcGVuZGluZ1JlYXR0YWNoID0gZmFsc2U7XG5cblx0XHRjb25zdCByZWF0dGFjaCA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdGlmIChzdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChhdHRhY2hpbmcpIHtcblx0XHRcdFx0cGVuZGluZ1JlYXR0YWNoID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9hdXRob3JpdGllcy5nZXQoYXV0aG9yaXR5KTtcblx0XHRcdGNvbnN0IG5leHQgPSBlbnRyeT8uY29ubmVjdGlvbnMuYXQoLTEpO1xuXHRcdFx0aWYgKG5leHQgPT09IGF0dGFjaGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGhhbmRsZUhvbGRlci5jbGVhcigpO1xuXHRcdFx0YXR0YWNoZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCB3YXRjaFJlc291cmNlID0gbmV4dD8ud2F0Y2hSZXNvdXJjZTtcblx0XHRcdGlmICghbmV4dCB8fCAhd2F0Y2hSZXNvdXJjZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhdHRhY2hpbmcgPSB0cnVlO1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gbmV4dDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHdhdGNoUmVzb3VyY2UuY2FsbCh0YXJnZXQsIHBhcmFtcyk7XG5cdFx0XHRcdGlmIChzdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX2F1dGhvcml0aWVzLmdldChhdXRob3JpdHkpO1xuXHRcdFx0XHRpZiAoIWN1cnJlbnQgfHwgY3VycmVudC5jb25uZWN0aW9ucy5hdCgtMSkgIT09IHRhcmdldCkge1xuXHRcdFx0XHRcdC8vIEFjdGl2ZSBjb25uZWN0aW9uIGNoYW5nZWQgdW5kZXJuZWF0aCB1cyBcdTIwMTQgdG9zcyB0aGlzXG5cdFx0XHRcdFx0Ly8gaGFuZGxlIGFuZCBsZXQgdGhlIHBlbmRpbmcgcmVhdHRhY2ggcGljayB0aGUgbmV3IG9uZS5cblx0XHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzdWIgPSBoYW5kbGUub25EaWRDaGFuZ2UoY2hhbmdlcyA9PiB0aGlzLl9vbkRpZENoYW5nZUZpbGUuZmlyZShjaGFuZ2VzLm1hcChjID0+ICh7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IHRoaXMuX2VuY29kZVVyaShjLnJlc291cmNlLCByZXNvdXJjZS5hdXRob3JpdHkpLFxuXHRcdFx0XHRcdHR5cGU6IGMudHlwZSxcblx0XHRcdFx0fSkpKSk7XG5cdFx0XHRcdGhhbmRsZUhvbGRlci52YWx1ZSA9IHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdFx0c3ViLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXR0YWNoZWQgPSB0YXJnZXQ7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRXYXRjaEVycm9yLmZpcmUoZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF0dGFjaGluZyA9IGZhbHNlO1xuXHRcdFx0XHRpZiAocGVuZGluZ1JlYXR0YWNoKSB7XG5cdFx0XHRcdFx0cGVuZGluZ1JlYXR0YWNoID0gZmFsc2U7XG5cdFx0XHRcdFx0dm9pZCByZWF0dGFjaCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZCh0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb24uZXZlbnQoYSA9PiB7XG5cdFx0XHRpZiAoYSA9PT0gYXV0aG9yaXR5KSB7XG5cdFx0XHRcdHZvaWQgcmVhdHRhY2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dm9pZCByZWF0dGFjaCgpO1xuXG5cdFx0cmV0dXJuIHN0b3JlO1xuXHR9XG5cblx0YXN5bmMgc3RhdChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJU3RhdD4ge1xuXHRcdGNvbnN0IHBhdGggPSByZXNvdXJjZS5wYXRoO1xuXG5cdFx0aWYgKHBhdGggPT09ICcvJyB8fCBwYXRoID09PSAnJykge1xuXHRcdFx0cmV0dXJuIHsgdHlwZTogRmlsZVR5cGUuRGlyZWN0b3J5LCBtdGltZTogMCwgY3RpbWU6IDAsIHNpemU6IDAsIHBlcm1pc3Npb25zOiBGaWxlUGVybWlzc2lvbi5SZWFkb25seSB9O1xuXHRcdH1cblx0XHRjb25zdCBkZWNvZGVkID0gdGhpcy5fZGVjb2RlVXJpKHJlc291cmNlKTtcblx0XHRpZiAoZGVjb2RlZC5zY2hlbWUgPT09ICdzZXNzaW9uLWRiJyB8fCBkZWNvZGVkLnNjaGVtZSA9PT0gJ2dpdC1ibG9iJykge1xuXHRcdFx0cmV0dXJuIHsgdHlwZTogRmlsZVR5cGUuRmlsZSwgbXRpbWU6IDAsIGN0aW1lOiAwLCBzaXplOiAwLCBwZXJtaXNzaW9uczogRmlsZVBlcm1pc3Npb24uUmVhZG9ubHkgfTtcblx0XHR9XG5cblx0XHRpZiAoZGVjb2RlZC5wYXRoID09PSAnLycgfHwgZGVjb2RlZC5wYXRoID09PSAnJykge1xuXHRcdFx0cmV0dXJuIHsgdHlwZTogRmlsZVR5cGUuRGlyZWN0b3J5LCBtdGltZTogMCwgY3RpbWU6IDAsIHNpemU6IDAsIHBlcm1pc3Npb25zOiBGaWxlUGVybWlzc2lvbi5SZWFkb25seSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCB0aGlzLl9nZXRDb25uZWN0aW9uKHJlc291cmNlLmF1dGhvcml0eSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgdGhpcy5fcmVzb2x2ZShjb25uZWN0aW9uLCBkZWNvZGVkKTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogcmVzb2x2ZWQudHlwZSA9PT0gJ2RpcmVjdG9yeScgPyBGaWxlVHlwZS5EaXJlY3Rvcnlcblx0XHRcdFx0XHQ6IHJlc29sdmVkLnR5cGUgPT09ICdzeW1saW5rJyA/IEZpbGVUeXBlLlN5bWJvbGljTGlua1xuXHRcdFx0XHRcdFx0OiBGaWxlVHlwZS5GaWxlLFxuXHRcdFx0XHRtdGltZTogcmVzb2x2ZWQubXRpbWUgPyBEYXRlLnBhcnNlKHJlc29sdmVkLm10aW1lKSA6IDAsXG5cdFx0XHRcdGN0aW1lOiByZXNvbHZlZC5jdGltZSA/IERhdGUucGFyc2UocmVzb2x2ZWQuY3RpbWUpIDogMCxcblx0XHRcdFx0c2l6ZTogcmVzb2x2ZWQuc2l6ZSA/PyAwLFxuXHRcdFx0fTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRocm93IHRoaXMuX21hcEVycm9yKGVyciwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RGb3VuZCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVhbHBhdGgocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgcGF0aCA9IHJlc291cmNlLnBhdGg7XG5cdFx0Ly8gU3ludGhldGljIHJvb3RzIGFuZCB2aXJ0dWFsIGNvbnRlbnQgc2NoZW1lcyBoYXZlIG5vIGRpc3RpbmN0XG5cdFx0Ly8gY2Fub25pY2FsIHBhdGggXHUyMDE0IHJldHVybiB0aGUgaW5wdXQgcGF0aCB1bmNoYW5nZWQuXG5cdFx0aWYgKHBhdGggPT09ICcvJyB8fCBwYXRoID09PSAnJykge1xuXHRcdFx0cmV0dXJuIHBhdGg7XG5cdFx0fVxuXHRcdGNvbnN0IGRlY29kZWQgPSB0aGlzLl9kZWNvZGVVcmkocmVzb3VyY2UpO1xuXHRcdGlmIChkZWNvZGVkLnNjaGVtZSA9PT0gJ3Nlc3Npb24tZGInIHx8IGRlY29kZWQuc2NoZW1lID09PSAnZ2l0LWJsb2InIHx8IGRlY29kZWQucGF0aCA9PT0gJy8nIHx8IGRlY29kZWQucGF0aCA9PT0gJycpIHtcblx0XHRcdHJldHVybiBwYXRoO1xuXHRcdH1cblx0XHRjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgdGhpcy5fZ2V0Q29ubmVjdGlvbihyZXNvdXJjZS5hdXRob3JpdHkpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHRoaXMuX3Jlc29sdmUoY29ubmVjdGlvbiwgZGVjb2RlZCk7XG5cdFx0XHQvLyBgcmVzb2x2ZWQudXJpYCBpcyB0aGUgcmVtb3RlIGNhbm9uaWNhbCAocmVhbHBhdGgpIFVSSS4gUmUtZW5jb2RlXG5cdFx0XHQvLyBpdCBiYWNrIGludG8gcHJvdmlkZXIgc3BhY2U7IHRoZSBmaWxlIHNlcnZpY2UgYXBwbGllcyB0aGVcblx0XHRcdC8vIHJldHVybmVkIHBhdGggb250byB0aGUgb3JpZ2luYWwgcHJvdmlkZXIgVVJJLlxuXHRcdFx0cmV0dXJuIHRoaXMuX2VuY29kZVVyaShVUkkucGFyc2UocmVzb2x2ZWQudXJpKSwgcmVzb3VyY2UuYXV0aG9yaXR5KS5wYXRoO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhyb3cgdGhpcy5fbWFwRXJyb3IoZXJyLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZU5vdEZvdW5kKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZWFkZGlyKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPFtzdHJpbmcsIEZpbGVUeXBlXVtdPiB7XG5cdFx0Y29uc3QgZW50cmllcyA9IGF3YWl0IHRoaXMuX2xpc3REaXJlY3RvcnkocmVzb3VyY2UuYXV0aG9yaXR5LCByZXNvdXJjZSk7XG5cdFx0cmV0dXJuIGVudHJpZXMubWFwKGUgPT4gW2UubmFtZSwgZS50eXBlID09PSAnZGlyZWN0b3J5JyA/IEZpbGVUeXBlLkRpcmVjdG9yeSA6IEZpbGVUeXBlLkZpbGVdKTtcblx0fVxuXG5cdGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPFVpbnQ4QXJyYXk+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgdGhpcy5fZ2V0Q29ubmVjdGlvbihyZXNvdXJjZS5hdXRob3JpdHkpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBvcmlnaW5hbFVyaSA9IHRoaXMuX2RlY29kZVVyaShyZXNvdXJjZSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0aW9uLnJlc291cmNlUmVhZChvcmlnaW5hbFVyaSk7XG5cdFx0XHRpZiAocmVzdWx0LmVuY29kaW5nID09PSBDb250ZW50RW5jb2RpbmcuQmFzZTY0KSB7XG5cdFx0XHRcdHJldHVybiBkZWNvZGVCYXNlNjQocmVzdWx0LmRhdGEpLmJ1ZmZlcjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBWU0J1ZmZlci5mcm9tU3RyaW5nKHJlc3VsdC5kYXRhKS5idWZmZXI7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aHJvdyB0aGlzLl9tYXBFcnJvcihlcnIsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHdyaXRlRmlsZShyZXNvdXJjZTogVVJJLCBjb250ZW50OiBVaW50OEFycmF5LCBfb3B0czogSUZpbGVXcml0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgdGhpcy5fZ2V0Q29ubmVjdGlvbihyZXNvdXJjZS5hdXRob3JpdHkpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBvcmlnaW5hbFVyaSA9IHRoaXMuX2RlY29kZVVyaShyZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCBjb25uZWN0aW9uLnJlc291cmNlV3JpdGUoe1xuXHRcdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdFx0dXJpOiBvcmlnaW5hbFVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRkYXRhOiBWU0J1ZmZlci53cmFwKGNvbnRlbnQpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGVuY29kaW5nOiBDb250ZW50RW5jb2RpbmcuVXRmOCxcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhyb3cgdGhpcy5fbWFwRXJyb3IoZXJyLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuTm9QZXJtaXNzaW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgbWtkaXIocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCB0aGlzLl9nZXRDb25uZWN0aW9uKHJlc291cmNlLmF1dGhvcml0eSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG9yaWdpbmFsVXJpID0gdGhpcy5fZGVjb2RlVXJpKHJlc291cmNlKTtcblx0XHRcdGF3YWl0IGNvbm5lY3Rpb24ucmVzb3VyY2VNa2Rpcih7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IG9yaWdpbmFsVXJpLnRvU3RyaW5nKCkgfSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aHJvdyB0aGlzLl9tYXBFcnJvcihlcnIsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Ob1Blcm1pc3Npb25zKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBkZWxldGUocmVzb3VyY2U6IFVSSSwgb3B0czogSUZpbGVEZWxldGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGF3YWl0IHRoaXMuX2dldENvbm5lY3Rpb24ocmVzb3VyY2UuYXV0aG9yaXR5KTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxVcmkgPSB0aGlzLl9kZWNvZGVVcmkocmVzb3VyY2UpO1xuXHRcdFx0YXdhaXQgY29ubmVjdGlvbi5yZXNvdXJjZURlbGV0ZSh7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IG9yaWdpbmFsVXJpLnRvU3RyaW5nKCksIHJlY3Vyc2l2ZTogb3B0cy5yZWN1cnNpdmUgfSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aHJvdyB0aGlzLl9tYXBFcnJvcihlcnIsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Ob1Blcm1pc3Npb25zKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZW5hbWUoZnJvbTogVVJJLCB0bzogVVJJLCBvcHRzOiBJRmlsZU92ZXJ3cml0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgdGhpcy5fZ2V0Q29ubmVjdGlvbihmcm9tLmF1dGhvcml0eSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG9yaWdpbmFsRnJvbSA9IHRoaXMuX2RlY29kZVVyaShmcm9tKTtcblx0XHRcdGNvbnN0IG9yaWdpbmFsVG8gPSB0aGlzLl9kZWNvZGVVcmkodG8pO1xuXHRcdFx0YXdhaXQgY29ubmVjdGlvbi5yZXNvdXJjZU1vdmUoeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgc291cmNlOiBvcmlnaW5hbEZyb20udG9TdHJpbmcoKSwgZGVzdGluYXRpb246IG9yaWdpbmFsVG8udG9TdHJpbmcoKSwgZmFpbElmRXhpc3RzOiAhb3B0cy5vdmVyd3JpdGUgfSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aHJvdyB0aGlzLl9tYXBFcnJvcihlcnIsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Ob1Blcm1pc3Npb25zKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBjb3B5KGZyb206IFVSSSwgdG86IFVSSSwgb3B0czogSUZpbGVPdmVyd3JpdGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGF3YWl0IHRoaXMuX2dldENvbm5lY3Rpb24oZnJvbS5hdXRob3JpdHkpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBvcmlnaW5hbEZyb20gPSB0aGlzLl9kZWNvZGVVcmkoZnJvbSk7XG5cdFx0XHRjb25zdCBvcmlnaW5hbFRvID0gdGhpcy5fZGVjb2RlVXJpKHRvKTtcblx0XHRcdGF3YWl0IGNvbm5lY3Rpb24ucmVzb3VyY2VDb3B5KHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHNvdXJjZTogb3JpZ2luYWxGcm9tLnRvU3RyaW5nKCksIGRlc3RpbmF0aW9uOiBvcmlnaW5hbFRvLnRvU3RyaW5nKCksIGZhaWxJZkV4aXN0czogIW9wdHMub3ZlcndyaXRlIH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhyb3cgdGhpcy5fbWFwRXJyb3IoZXJyLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuTm9QZXJtaXNzaW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIE5lZ290aWF0ZSBhY2Nlc3MgdG8ge0BsaW5rIHJlc291cmNlfSB3aXRoIHRoZSByZWNlaXZlciwgYXNraW5nIGZvciB0aGVcblx0ICogZ3JhbnRlZCBtb2RlcyBpbiB7QGxpbmsgb3B0c30uIFVzZWQgYWZ0ZXIgYSBgTm9QZXJtaXNzaW9uc2AgZmFpbHVyZSB0b1xuXHQgKiBwcm9tcHQgdGhlIHJlY2VpdmVyIHRvIGdyYW50IGFjY2VzczsgdGhlIGNhbGxlciBjYW4gdGhlbiByZXRyeS5cblx0ICpcblx0ICogUmVzb2x2ZXMgb24gc3VjY2Vzcy4gUmVqZWN0cyBpZiB0aGUgcmVjZWl2ZXIgZGVuaWVzLCB0aGUgY29ubmVjdGlvblxuXHQgKiBpcyBtaXNzaW5nLCBvciB0aGUgY29ubmVjdGlvbiBkb2Vzbid0IGltcGxlbWVudCBgcmVzb3VyY2VSZXF1ZXN0YC5cblx0ICovXG5cdGFzeW5jIHJlcXVlc3RSZXNvdXJjZUFjY2VzcyhyZXNvdXJjZTogVVJJLCBvcHRzOiB7IHJlYWRvbmx5IHJlYWQ/OiBib29sZWFuOyByZWFkb25seSB3cml0ZT86IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCB0aGlzLl9nZXRDb25uZWN0aW9uKHJlc291cmNlLmF1dGhvcml0eSk7XG5cdFx0aWYgKCFjb25uZWN0aW9uLnJlc291cmNlUmVxdWVzdCkge1xuXHRcdFx0dGhyb3cgY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IoXG5cdFx0XHRcdGBDb25uZWN0aW9uIGZvciAke3Jlc291cmNlLmF1dGhvcml0eX0gZG9lcyBub3Qgc3VwcG9ydCByZXNvdXJjZVJlcXVlc3RgLFxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuVW5hdmFpbGFibGUsXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRjb25zdCBvcmlnaW5hbFVyaSA9IHRoaXMuX2RlY29kZVVyaShyZXNvdXJjZSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGNvbm5lY3Rpb24ucmVzb3VyY2VSZXF1ZXN0KHtcblx0XHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRcdHVyaTogb3JpZ2luYWxVcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0cmVhZDogb3B0cy5yZWFkLFxuXHRcdFx0XHR3cml0ZTogb3B0cy53cml0ZSxcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhyb3cgdGhpcy5fbWFwRXJyb3IoZXJyLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuTm9QZXJtaXNzaW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tLSBJbnRlcm5hbHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgX2dldENvbm5lY3Rpb24oYXV0aG9yaXR5OiBzdHJpbmcpOiBQcm9taXNlPElSZW1vdGVGaWxlc3lzdGVtQ29ubmVjdGlvbj4ge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fYXV0aG9yaXRpZXMuZ2V0KGF1dGhvcml0eSk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKFxuXHRcdFx0XHRgTm8gY29ubmVjdGlvbiBmb3IgYXV0aG9yaXR5OiAke2F1dGhvcml0eX1gLFxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuVW5hdmFpbGFibGUsXG5cdFx0XHQpKTtcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmUgPSBlbnRyeS5jb25uZWN0aW9ucy5hdCgtMSk7XG5cdFx0aWYgKGFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShhY3RpdmUpO1xuXHRcdH1cblx0XHQvLyBFbnRyeSBpcyBpbnNpZGUgaXRzIGdyYWNlIHdpbmRvdyBhZnRlciB0aGUgbGFzdCByZWdpc3RyYXRpb25cblx0XHQvLyB3YXMgZGlzcG9zZWQuIFdhaXQgdW50aWwgZWl0aGVyIGEgbmV3IHJlZ2lzdHJhdGlvbiBhcnJpdmVzXG5cdFx0Ly8gKHJlc29sdmUpIG9yIHRoZSBncmFjZSB0aW1lciBleHBpcmVzIGFuZCBldmljdHMgdGhlIGVudHJ5XG5cdFx0Ly8gKHJlamVjdCkuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IHNldHRsZSA9ICgpOiB2b2lkID0+IHtcblx0XHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX2F1dGhvcml0aWVzLmdldChhdXRob3JpdHkpO1xuXHRcdFx0XHRpZiAoIWN1cnJlbnQpIHtcblx0XHRcdFx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJlamVjdChjcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihcblx0XHRcdFx0XHRcdGBObyBjb25uZWN0aW9uIGZvciBhdXRob3JpdHk6ICR7YXV0aG9yaXR5fWAsXG5cdFx0XHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuVW5hdmFpbGFibGUsXG5cdFx0XHRcdFx0KSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGMgPSBjdXJyZW50LmNvbm5lY3Rpb25zLmF0KC0xKTtcblx0XHRcdFx0aWYgKGMpIHtcblx0XHRcdFx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJlc29sdmUoYyk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRjb25zdCBzdWIgPSB0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb24uZXZlbnQoYSA9PiB7XG5cdFx0XHRcdGlmIChhID09PSBhdXRob3JpdHkpIHtcblx0XHRcdFx0XHRzZXR0bGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHQvLyBSZS1jaGVjayBhZnRlciBzdWJzY3JpYmluZyBpbiBjYXNlIHRoZSBzdGF0ZSBjaGFuZ2VkIGJldHdlZW5cblx0XHRcdC8vIG91ciBpbml0aWFsIGNoZWNrIGFuZCB0aGUgbGlzdGVuZXIgcmVnaXN0cmF0aW9uLlxuXHRcdFx0c2V0dGxlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogVHJhbnNsYXRlIGEgdGhyb3duIGVycm9yIGZyb20gYSB7QGxpbmsgSVJlbW90ZUZpbGVzeXN0ZW1Db25uZWN0aW9ufVxuXHQgKiBpbnRvIGEge0BsaW5rIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yfS4gUHJlc2VydmVzIGBQZXJtaXNzaW9uRGVuaWVkYFxuXHQgKiAoLTMyMDA5KSBhcyBgTm9QZXJtaXNzaW9uc2Agc28gY2FsbGVycyBjYW4gZGlzdGluZ3Vpc2ggYVxuXHQgKiBwZXJtaXNzaW9uIGZhaWx1cmUgZnJvbSBgTm90Rm91bmRgIGFuZCBkZWNpZGUgd2hldGhlciB0byBuZWdvdGlhdGVcblx0ICogdmlhIHtAbGluayByZXF1ZXN0UmVzb3VyY2VBY2Nlc3N9LlxuXHQgKi9cblx0cHJpdmF0ZSBfbWFwRXJyb3IoZXJyOiB1bmtub3duLCBkZWZhdWx0Q29kZTogRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlKTogRXJyb3Ige1xuXHRcdGlmIChlcnIgaW5zdGFuY2VvZiBQcm90b2NvbEVycm9yICYmIGVyci5jb2RlID09PSBBaHBFcnJvckNvZGVzLlBlcm1pc3Npb25EZW5pZWQpIHtcblx0XHRcdHJldHVybiBjcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnIubWVzc2FnZSwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLk5vUGVybWlzc2lvbnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IoXG5cdFx0XHRlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVyciksXG5cdFx0XHRkZWZhdWx0Q29kZSxcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgYSBkZWNvZGVkIHJlc291cmNlIG92ZXIge0BsaW5rIGNvbm5lY3Rpb259LiBTaGFyZWQgYnlcblx0ICoge0BsaW5rIHN0YXR9IGFuZCB7QGxpbmsgcmVhbHBhdGh9LlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZShjb25uZWN0aW9uOiBJUmVtb3RlRmlsZXN5c3RlbUNvbm5lY3Rpb24sIGRlY29kZWQ6IFVSSSk6IFByb21pc2U8UmVzb3VyY2VSZXNvbHZlUmVzdWx0PiB7XG5cdFx0cmV0dXJuIGNvbm5lY3Rpb24ucmVzb3VyY2VSZXNvbHZlKHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogZGVjb2RlZC50b1N0cmluZygpIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbGlzdERpcmVjdG9yeShhdXRob3JpdHk6IHN0cmluZywgcmVzb3VyY2U6IFVSSSk6IFByb21pc2U8cmVhZG9ubHkgRGlyZWN0b3J5RW50cnlbXT4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCB0aGlzLl9nZXRDb25uZWN0aW9uKGF1dGhvcml0eSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG9yaWdpbmFsVXJpID0gdGhpcy5fZGVjb2RlVXJpKHJlc291cmNlKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24ucmVzb3VyY2VMaXN0KG9yaWdpbmFsVXJpKTtcblx0XHRcdHJldHVybiByZXN1bHQuZW50cmllcztcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRocm93IHRoaXMuX21hcEVycm9yKGVyciwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLlVuYXZhaWxhYmxlKTtcblx0XHR9XG5cdH1cbn1cblxuLy8gLS0tLSBBZ2VudCBIb3N0IGZpbGVzeXN0ZW0gKGNsaWVudCByZWFkcyBhZ2VudCBob3N0IGZpbGVzKSAtLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBGaWxlc3lzdGVtIHByb3ZpZGVyIGZvciBhY2Nlc3NpbmcgYWdlbnQgaG9zdCBmaWxlcyBmcm9tIHRoZVxuICogY2xpZW50IHNpZGUuIFJlZ2lzdGVyZWQgdW5kZXIgdGhlIGB2c2NvZGUtYWdlbnQtaG9zdGAgc2NoZW1lLlxuICpcbiAqIGBgYFxuICogdnNjb2RlLWFnZW50LWhvc3Q6Ly9bY29ubmVjdGlvbkF1dGhvcml0eV0vW29yaWdpbmFsU2NoZW1lXS9bb3JpZ2luYWxBdXRob3JpdHldL1tvcmlnaW5hbFBhdGhdXG4gKiBgYGBcbiAqL1xuZXhwb3J0IGNsYXNzIEFnZW50SG9zdEZpbGVTeXN0ZW1Qcm92aWRlciBleHRlbmRzIEFIUEZpbGVTeXN0ZW1Qcm92aWRlciB7XG5cdHByb3RlY3RlZCBfZGVjb2RlVXJpKHJlc291cmNlOiBVUkkpOiBVUkkge1xuXHRcdHJldHVybiBmcm9tQWdlbnRIb3N0VXJpKHJlc291cmNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZW5jb2RlVXJpKHJlc291cmNlOiBVUkksIGF1dGhvcml0eTogc3RyaW5nKTogVVJJIHtcblx0XHRyZXR1cm4gdG9BZ2VudEhvc3RVcmkocmVzb3VyY2UsIGF1dGhvcml0eSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsY0FBYyxnQkFBZ0I7QUFDdkMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksaUJBQThCLG1CQUFtQixvQkFBb0I7QUFDMUYsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0JBQStCLGdCQUFnQixnQkFBZ0IsZ0NBQWdDLDZCQUE2QixnQkFBcUw7QUFDMVQsU0FBUyxrQkFBa0Isc0JBQXNCO0FBQ2pELFNBQVMsdUJBQWdmO0FBQ3pmLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsa0JBQXVDO0FBQ2hELFNBQVMsc0JBQXNCO0FBeUQvQixlQUFzQix3QkFDckIsWUFNQSxRQUM4QjtBQUM5QixRQUFNLEVBQUUsUUFBUSxJQUFJLE1BQU0sV0FBVyxvQkFBb0IsTUFBTTtBQUMvRCxRQUFNLGFBQWEsSUFBSSxNQUFNLE9BQU87QUFDcEMsUUFBTSxXQUFXLFVBQVUsVUFBVTtBQUNyQyxRQUFNLHFCQUFxQixJQUFJLFFBQWdDO0FBQy9ELFFBQU0sV0FBVyxXQUFXLFlBQVksY0FBWTtBQUNuRCxRQUFJLFNBQVMsWUFBWSxXQUFXLFNBQVMsT0FBTyxTQUFTLFdBQVcsc0JBQXNCO0FBQzdGO0FBQUEsSUFDRDtBQUNBLFVBQU0sUUFBUSxTQUFTLE9BQU8sU0FBUyxTQUFTLENBQUM7QUFDakQsUUFBSSxNQUFNLFdBQVcsR0FBRztBQUN2QjtBQUFBLElBQ0Q7QUFDQSx1QkFBbUIsS0FBSyxNQUFNLElBQUksV0FBUztBQUFBLE1BQzFDLFVBQVUsSUFBSSxNQUFNLEtBQUssR0FBRztBQUFBLE1BQzVCLE1BQU0sS0FBSyxTQUFTLFVBQVUsZUFBZSxRQUMxQyxLQUFLLFNBQVMsWUFBWSxlQUFlLFVBQ3hDLGVBQWU7QUFBQSxJQUNwQixFQUFFLENBQUM7QUFBQSxFQUNKLENBQUM7QUFDRCxNQUFJLFdBQVc7QUFDZixTQUFPO0FBQUEsSUFDTixhQUFhLG1CQUFtQjtBQUFBLElBQ2hDLFNBQVMsTUFBTTtBQUNkLFVBQUksVUFBVTtBQUNiO0FBQUEsTUFDRDtBQUNBLGlCQUFXO0FBQ1gsZUFBUyxRQUFRO0FBQ2pCLHlCQUFtQixRQUFRO0FBQzNCLFVBQUk7QUFDSCxtQkFBVyxZQUFZLFVBQVU7QUFBQSxNQUNsQyxRQUFRO0FBQUEsTUFHUjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUFNTyxTQUFTLGFBQWEsV0FBbUIsTUFBbUI7QUFDbEUsU0FBTyxlQUFlLElBQUksS0FBSyxJQUFJLEdBQUcsU0FBUztBQUNoRDtBQUtPLFNBQVMsb0JBQW9CLEtBQWtCO0FBQ3JELFNBQU8saUJBQWlCLEdBQUcsRUFBRTtBQUM5QjtBQWdDTyxNQUFlLHlCQUFmLE1BQWUsK0JBQThCLFdBQXlGO0FBQUEsRUErQzVJLFlBQ2tCLHFCQUE2Qix1QkFBc0IsOEJBQ25FO0FBQ0QsVUFBTTtBQUZXO0FBOUNsQixTQUFTLGVBQ1IsK0JBQStCLG9CQUMvQiwrQkFBK0IsZ0JBQy9CLCtCQUErQixpQkFDL0IsK0JBQStCO0FBRWhDLFNBQWlCLDJCQUEyQixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDOUUsU0FBUywwQkFBMEIsS0FBSyx5QkFBeUI7QUFFakUsU0FBaUIsbUJBQW1CLEtBQUssVUFBVSxJQUFJLFFBQWdDLENBQUM7QUFDeEYsU0FBUyxrQkFBa0IsS0FBSyxpQkFBaUI7QUFDakQsU0FBaUIsbUJBQW1CLEtBQUssVUFBVSxJQUFJLFFBQWdCLENBQUM7QUFDeEUsU0FBUyxrQkFBa0IsS0FBSyxpQkFBaUI7QUFRakQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBaUIsZUFBZSxvQkFBSSxJQUE2QjtBQVVqRTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBaUIseUJBQXlCLEtBQUssVUFBVSxJQUFJLFFBQWdCLENBQUM7QUFBQSxFQW1COUU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBWUEsa0JBQWtCLFdBQW1CLFlBQXNEO0FBQzFGLFFBQUksUUFBUSxLQUFLLGFBQWEsSUFBSSxTQUFTO0FBQzNDLFFBQUksQ0FBQyxPQUFPO0FBQ1gsY0FBUTtBQUFBLFFBQ1AsYUFBYSxDQUFDLFVBQVU7QUFBQSxRQUN4QixRQUFRLElBQUksa0JBQStCO0FBQUEsTUFDNUM7QUFDQSxXQUFLLGFBQWEsSUFBSSxXQUFXLEtBQUs7QUFBQSxJQUN2QyxPQUFPO0FBQ04sWUFBTSxPQUFPLE1BQU07QUFDbkIsWUFBTSxZQUFZLEtBQUssVUFBVTtBQUFBLElBQ2xDO0FBQ0EsVUFBTSxVQUFVO0FBQ2hCLFNBQUssdUJBQXVCLEtBQUssU0FBUztBQUUxQyxXQUFPLGFBQWEsTUFBTTtBQUN6QixZQUFNLE1BQU0sUUFBUSxZQUFZLFFBQVEsVUFBVTtBQUNsRCxVQUFJLFFBQVEsSUFBSTtBQUNmO0FBQUEsTUFDRDtBQUNBLFlBQU0sWUFBWSxRQUFRLFFBQVEsWUFBWSxTQUFTO0FBQ3ZELGNBQVEsWUFBWSxPQUFPLEtBQUssQ0FBQztBQUNqQyxVQUFJLFFBQVEsWUFBWSxXQUFXLEdBQUc7QUFDckMsZ0JBQVEsT0FBTyxRQUFRO0FBQUEsVUFDdEIsTUFBTSxLQUFLLGlCQUFpQixXQUFXLE9BQU87QUFBQSxVQUM5QyxLQUFLO0FBQUEsVUFDTCxLQUFLO0FBQUEsUUFDTjtBQUFBLE1BQ0Q7QUFFQSxVQUFJLFdBQVc7QUFDZCxhQUFLLHVCQUF1QixLQUFLLFNBQVM7QUFBQSxNQUMzQztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLGlCQUFpQixXQUFtQixPQUE4QjtBQUd6RSxRQUFJLEtBQUssYUFBYSxJQUFJLFNBQVMsTUFBTSxTQUFTLE1BQU0sWUFBWSxTQUFTLEdBQUc7QUFDL0U7QUFBQSxJQUNEO0FBQ0EsU0FBSyxhQUFhLE9BQU8sU0FBUztBQUNsQyxVQUFNLE9BQU8sUUFBUTtBQUNyQixTQUFLLHVCQUF1QixLQUFLLFNBQVM7QUFBQSxFQUMzQztBQUFBLEVBRVMsVUFBZ0I7QUFDeEIsZUFBVyxTQUFTLEtBQUssYUFBYSxPQUFPLEdBQUc7QUFDL0MsWUFBTSxPQUFPLFFBQVE7QUFDckIsWUFBTSxZQUFZLFNBQVM7QUFBQSxJQUM1QjtBQUNBLFNBQUssYUFBYSxNQUFNO0FBQ3hCLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFBQSxFQVFBLE1BQU0sVUFBZSxNQUFrQztBQVd0RCxVQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsVUFBTSxlQUFlLE1BQU0sSUFBSSxJQUFJLGtCQUErQixDQUFDO0FBQ25FLFVBQU0sWUFBWSxTQUFTO0FBQzNCLFVBQU0sU0FBb0M7QUFBQSxNQUN6QyxTQUFTO0FBQUEsTUFDVCxLQUFLLEtBQUssV0FBVyxRQUFRLEVBQUUsU0FBUztBQUFBLE1BQ3hDLFdBQVcsS0FBSztBQUFBLE1BQ2hCLEdBQUksS0FBSyxTQUFTLFNBQVMsSUFBSSxFQUFFLFVBQVUsRUFBRSxPQUFPLENBQUMsR0FBRyxLQUFLLFFBQVEsRUFBRSxFQUFFLElBQUksQ0FBQztBQUFBLE1BQzlFLEdBQUksS0FBSyxZQUFZLEtBQUssU0FBUyxTQUFTLElBQ3pDLEVBQUUsVUFBVSxFQUFFLE9BQU8sS0FBSyxTQUFTLElBQUksT0FBSyxPQUFPLE1BQU0sV0FBVyxJQUFJLEVBQUUsT0FBTyxFQUFFLEVBQUUsSUFDckYsQ0FBQztBQUFBLElBQ0w7QUFLQSxRQUFJO0FBQ0osUUFBSSxZQUFZO0FBQ2hCLFFBQUksa0JBQWtCO0FBRXRCLFVBQU0sV0FBVyxZQUEyQjtBQUMzQyxVQUFJLE1BQU0sWUFBWTtBQUNyQjtBQUFBLE1BQ0Q7QUFDQSxVQUFJLFdBQVc7QUFDZCwwQkFBa0I7QUFDbEI7QUFBQSxNQUNEO0FBQ0EsWUFBTSxRQUFRLEtBQUssYUFBYSxJQUFJLFNBQVM7QUFDN0MsWUFBTSxPQUFPLE9BQU8sWUFBWSxHQUFHLEVBQUU7QUFDckMsVUFBSSxTQUFTLFVBQVU7QUFDdEI7QUFBQSxNQUNEO0FBQ0EsbUJBQWEsTUFBTTtBQUNuQixpQkFBVztBQUNYLFlBQU0sZ0JBQWdCLE1BQU07QUFDNUIsVUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlO0FBQzVCO0FBQUEsTUFDRDtBQUNBLGtCQUFZO0FBQ1osWUFBTSxTQUFTO0FBQ2YsVUFBSTtBQUNILGNBQU0sU0FBUyxNQUFNLGNBQWMsS0FBSyxRQUFRLE1BQU07QUFDdEQsWUFBSSxNQUFNLFlBQVk7QUFDckIsaUJBQU8sUUFBUTtBQUNmO0FBQUEsUUFDRDtBQUNBLGNBQU0sVUFBVSxLQUFLLGFBQWEsSUFBSSxTQUFTO0FBQy9DLFlBQUksQ0FBQyxXQUFXLFFBQVEsWUFBWSxHQUFHLEVBQUUsTUFBTSxRQUFRO0FBR3RELGlCQUFPLFFBQVE7QUFDZjtBQUFBLFFBQ0Q7QUFDQSxjQUFNLE1BQU0sT0FBTyxZQUFZLGFBQVcsS0FBSyxpQkFBaUIsS0FBSyxRQUFRLElBQUksUUFBTTtBQUFBLFVBQ3RGLFVBQVUsS0FBSyxXQUFXLEVBQUUsVUFBVSxTQUFTLFNBQVM7QUFBQSxVQUN4RCxNQUFNLEVBQUU7QUFBQSxRQUNULEVBQUUsQ0FBQyxDQUFDO0FBQ0oscUJBQWEsUUFBUSxhQUFhLE1BQU07QUFDdkMsY0FBSSxRQUFRO0FBQ1osaUJBQU8sUUFBUTtBQUFBLFFBQ2hCLENBQUM7QUFDRCxtQkFBVztBQUFBLE1BQ1osU0FBUyxLQUFLO0FBQ2IsYUFBSyxpQkFBaUIsS0FBSyxlQUFlLFFBQVEsSUFBSSxVQUFVLE9BQU8sR0FBRyxDQUFDO0FBQUEsTUFDNUUsVUFBRTtBQUNELG9CQUFZO0FBQ1osWUFBSSxpQkFBaUI7QUFDcEIsNEJBQWtCO0FBQ2xCLGVBQUssU0FBUztBQUFBLFFBQ2Y7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFVBQU0sSUFBSSxLQUFLLHVCQUF1QixNQUFNLE9BQUs7QUFDaEQsVUFBSSxNQUFNLFdBQVc7QUFDcEIsYUFBSyxTQUFTO0FBQUEsTUFDZjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxTQUFTO0FBRWQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQU0sS0FBSyxVQUErQjtBQUN6QyxVQUFNLE9BQU8sU0FBUztBQUV0QixRQUFJLFNBQVMsT0FBTyxTQUFTLElBQUk7QUFDaEMsYUFBTyxFQUFFLE1BQU0sU0FBUyxXQUFXLE9BQU8sR0FBRyxPQUFPLEdBQUcsTUFBTSxHQUFHLGFBQWEsZUFBZSxTQUFTO0FBQUEsSUFDdEc7QUFDQSxVQUFNLFVBQVUsS0FBSyxXQUFXLFFBQVE7QUFDeEMsUUFBSSxRQUFRLFdBQVcsZ0JBQWdCLFFBQVEsV0FBVyxZQUFZO0FBQ3JFLGFBQU8sRUFBRSxNQUFNLFNBQVMsTUFBTSxPQUFPLEdBQUcsT0FBTyxHQUFHLE1BQU0sR0FBRyxhQUFhLGVBQWUsU0FBUztBQUFBLElBQ2pHO0FBRUEsUUFBSSxRQUFRLFNBQVMsT0FBTyxRQUFRLFNBQVMsSUFBSTtBQUNoRCxhQUFPLEVBQUUsTUFBTSxTQUFTLFdBQVcsT0FBTyxHQUFHLE9BQU8sR0FBRyxNQUFNLEdBQUcsYUFBYSxlQUFlLFNBQVM7QUFBQSxJQUN0RztBQUVBLFVBQU0sYUFBYSxNQUFNLEtBQUssZUFBZSxTQUFTLFNBQVM7QUFDL0QsUUFBSTtBQUNILFlBQU0sV0FBVyxNQUFNLEtBQUssU0FBUyxZQUFZLE9BQU87QUFFeEQsYUFBTztBQUFBLFFBQ04sTUFBTSxTQUFTLFNBQVMsY0FBYyxTQUFTLFlBQzVDLFNBQVMsU0FBUyxZQUFZLFNBQVMsZUFDdEMsU0FBUztBQUFBLFFBQ2IsT0FBTyxTQUFTLFFBQVEsS0FBSyxNQUFNLFNBQVMsS0FBSyxJQUFJO0FBQUEsUUFDckQsT0FBTyxTQUFTLFFBQVEsS0FBSyxNQUFNLFNBQVMsS0FBSyxJQUFJO0FBQUEsUUFDckQsTUFBTSxTQUFTLFFBQVE7QUFBQSxNQUN4QjtBQUFBLElBQ0QsU0FBUyxLQUFLO0FBQ2IsWUFBTSxLQUFLLFVBQVUsS0FBSyw0QkFBNEIsWUFBWTtBQUFBLElBQ25FO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxTQUFTLFVBQWdDO0FBQzlDLFVBQU0sT0FBTyxTQUFTO0FBR3RCLFFBQUksU0FBUyxPQUFPLFNBQVMsSUFBSTtBQUNoQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sVUFBVSxLQUFLLFdBQVcsUUFBUTtBQUN4QyxRQUFJLFFBQVEsV0FBVyxnQkFBZ0IsUUFBUSxXQUFXLGNBQWMsUUFBUSxTQUFTLE9BQU8sUUFBUSxTQUFTLElBQUk7QUFDcEgsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLGFBQWEsTUFBTSxLQUFLLGVBQWUsU0FBUyxTQUFTO0FBQy9ELFFBQUk7QUFDSCxZQUFNLFdBQVcsTUFBTSxLQUFLLFNBQVMsWUFBWSxPQUFPO0FBSXhELGFBQU8sS0FBSyxXQUFXLElBQUksTUFBTSxTQUFTLEdBQUcsR0FBRyxTQUFTLFNBQVMsRUFBRTtBQUFBLElBQ3JFLFNBQVMsS0FBSztBQUNiLFlBQU0sS0FBSyxVQUFVLEtBQUssNEJBQTRCLFlBQVk7QUFBQSxJQUNuRTtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sUUFBUSxVQUE4QztBQUMzRCxVQUFNLFVBQVUsTUFBTSxLQUFLLGVBQWUsU0FBUyxXQUFXLFFBQVE7QUFDdEUsV0FBTyxRQUFRLElBQUksT0FBSyxDQUFDLEVBQUUsTUFBTSxFQUFFLFNBQVMsY0FBYyxTQUFTLFlBQVksU0FBUyxJQUFJLENBQUM7QUFBQSxFQUM5RjtBQUFBLEVBRUEsTUFBTSxTQUFTLFVBQW9DO0FBQ2xELFVBQU0sYUFBYSxNQUFNLEtBQUssZUFBZSxTQUFTLFNBQVM7QUFDL0QsUUFBSTtBQUNILFlBQU0sY0FBYyxLQUFLLFdBQVcsUUFBUTtBQUM1QyxZQUFNLFNBQVMsTUFBTSxXQUFXLGFBQWEsV0FBVztBQUN4RCxVQUFJLE9BQU8sYUFBYSxnQkFBZ0IsUUFBUTtBQUMvQyxlQUFPLGFBQWEsT0FBTyxJQUFJLEVBQUU7QUFBQSxNQUNsQztBQUNBLGFBQU8sU0FBUyxXQUFXLE9BQU8sSUFBSSxFQUFFO0FBQUEsSUFDekMsU0FBUyxLQUFLO0FBQ2IsWUFBTSxLQUFLLFVBQVUsS0FBSyw0QkFBNEIsWUFBWTtBQUFBLElBQ25FO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxVQUFVLFVBQWUsU0FBcUIsT0FBeUM7QUFDNUYsVUFBTSxhQUFhLE1BQU0sS0FBSyxlQUFlLFNBQVMsU0FBUztBQUMvRCxRQUFJO0FBQ0gsWUFBTSxjQUFjLEtBQUssV0FBVyxRQUFRO0FBQzVDLFlBQU0sV0FBVyxjQUFjO0FBQUEsUUFDOUIsU0FBUztBQUFBLFFBQ1QsS0FBSyxZQUFZLFNBQVM7QUFBQSxRQUMxQixNQUFNLFNBQVMsS0FBSyxPQUFPLEVBQUUsU0FBUztBQUFBLFFBQ3RDLFVBQVUsZ0JBQWdCO0FBQUEsTUFDM0IsQ0FBQztBQUFBLElBQ0YsU0FBUyxLQUFLO0FBQ2IsWUFBTSxLQUFLLFVBQVUsS0FBSyw0QkFBNEIsYUFBYTtBQUFBLElBQ3BFO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxNQUFNLFVBQThCO0FBQ3pDLFVBQU0sYUFBYSxNQUFNLEtBQUssZUFBZSxTQUFTLFNBQVM7QUFDL0QsUUFBSTtBQUNILFlBQU0sY0FBYyxLQUFLLFdBQVcsUUFBUTtBQUM1QyxZQUFNLFdBQVcsY0FBYyxFQUFFLFNBQVMsZ0JBQWdCLEtBQUssWUFBWSxTQUFTLEVBQUUsQ0FBQztBQUFBLElBQ3hGLFNBQVMsS0FBSztBQUNiLFlBQU0sS0FBSyxVQUFVLEtBQUssNEJBQTRCLGFBQWE7QUFBQSxJQUNwRTtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sT0FBTyxVQUFlLE1BQXlDO0FBQ3BFLFVBQU0sYUFBYSxNQUFNLEtBQUssZUFBZSxTQUFTLFNBQVM7QUFDL0QsUUFBSTtBQUNILFlBQU0sY0FBYyxLQUFLLFdBQVcsUUFBUTtBQUM1QyxZQUFNLFdBQVcsZUFBZSxFQUFFLFNBQVMsZ0JBQWdCLEtBQUssWUFBWSxTQUFTLEdBQUcsV0FBVyxLQUFLLFVBQVUsQ0FBQztBQUFBLElBQ3BILFNBQVMsS0FBSztBQUNiLFlBQU0sS0FBSyxVQUFVLEtBQUssNEJBQTRCLGFBQWE7QUFBQSxJQUNwRTtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sT0FBTyxNQUFXLElBQVMsTUFBNEM7QUFDNUUsVUFBTSxhQUFhLE1BQU0sS0FBSyxlQUFlLEtBQUssU0FBUztBQUMzRCxRQUFJO0FBQ0gsWUFBTSxlQUFlLEtBQUssV0FBVyxJQUFJO0FBQ3pDLFlBQU0sYUFBYSxLQUFLLFdBQVcsRUFBRTtBQUNyQyxZQUFNLFdBQVcsYUFBYSxFQUFFLFNBQVMsZ0JBQWdCLFFBQVEsYUFBYSxTQUFTLEdBQUcsYUFBYSxXQUFXLFNBQVMsR0FBRyxjQUFjLENBQUMsS0FBSyxVQUFVLENBQUM7QUFBQSxJQUM5SixTQUFTLEtBQUs7QUFDYixZQUFNLEtBQUssVUFBVSxLQUFLLDRCQUE0QixhQUFhO0FBQUEsSUFDcEU7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLEtBQUssTUFBVyxJQUFTLE1BQTRDO0FBQzFFLFVBQU0sYUFBYSxNQUFNLEtBQUssZUFBZSxLQUFLLFNBQVM7QUFDM0QsUUFBSTtBQUNILFlBQU0sZUFBZSxLQUFLLFdBQVcsSUFBSTtBQUN6QyxZQUFNLGFBQWEsS0FBSyxXQUFXLEVBQUU7QUFDckMsWUFBTSxXQUFXLGFBQWEsRUFBRSxTQUFTLGdCQUFnQixRQUFRLGFBQWEsU0FBUyxHQUFHLGFBQWEsV0FBVyxTQUFTLEdBQUcsY0FBYyxDQUFDLEtBQUssVUFBVSxDQUFDO0FBQUEsSUFDOUosU0FBUyxLQUFLO0FBQ2IsWUFBTSxLQUFLLFVBQVUsS0FBSyw0QkFBNEIsYUFBYTtBQUFBLElBQ3BFO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVVBLE1BQU0sc0JBQXNCLFVBQWUsTUFBNEU7QUFDdEgsVUFBTSxhQUFhLE1BQU0sS0FBSyxlQUFlLFNBQVMsU0FBUztBQUMvRCxRQUFJLENBQUMsV0FBVyxpQkFBaUI7QUFDaEMsWUFBTTtBQUFBLFFBQ0wsa0JBQWtCLFNBQVMsU0FBUztBQUFBLFFBQ3BDLDRCQUE0QjtBQUFBLE1BQzdCO0FBQUEsSUFDRDtBQUNBLFVBQU0sY0FBYyxLQUFLLFdBQVcsUUFBUTtBQUM1QyxRQUFJO0FBQ0gsWUFBTSxXQUFXLGdCQUFnQjtBQUFBLFFBQ2hDLFNBQVM7QUFBQSxRQUNULEtBQUssWUFBWSxTQUFTO0FBQUEsUUFDMUIsTUFBTSxLQUFLO0FBQUEsUUFDWCxPQUFPLEtBQUs7QUFBQSxNQUNiLENBQUM7QUFBQSxJQUNGLFNBQVMsS0FBSztBQUNiLFlBQU0sS0FBSyxVQUFVLEtBQUssNEJBQTRCLGFBQWE7QUFBQSxJQUNwRTtBQUFBLEVBQ0Q7QUFBQTtBQUFBLEVBSVEsZUFBZSxXQUF5RDtBQUMvRSxVQUFNLFFBQVEsS0FBSyxhQUFhLElBQUksU0FBUztBQUM3QyxRQUFJLENBQUMsT0FBTztBQUNYLGFBQU8sUUFBUSxPQUFPO0FBQUEsUUFDckIsZ0NBQWdDLFNBQVM7QUFBQSxRQUN6Qyw0QkFBNEI7QUFBQSxNQUM3QixDQUFDO0FBQUEsSUFDRjtBQUVBLFVBQU0sU0FBUyxNQUFNLFlBQVksR0FBRyxFQUFFO0FBQ3RDLFFBQUksUUFBUTtBQUNYLGFBQU8sUUFBUSxRQUFRLE1BQU07QUFBQSxJQUM5QjtBQUtBLFdBQU8sSUFBSSxRQUFRLENBQUMsU0FBUyxXQUFXO0FBQ3ZDLFlBQU0sU0FBUyxNQUFZO0FBQzFCLGNBQU0sVUFBVSxLQUFLLGFBQWEsSUFBSSxTQUFTO0FBQy9DLFlBQUksQ0FBQyxTQUFTO0FBQ2IsY0FBSSxRQUFRO0FBQ1osaUJBQU87QUFBQSxZQUNOLGdDQUFnQyxTQUFTO0FBQUEsWUFDekMsNEJBQTRCO0FBQUEsVUFDN0IsQ0FBQztBQUNEO0FBQUEsUUFDRDtBQUNBLGNBQU0sSUFBSSxRQUFRLFlBQVksR0FBRyxFQUFFO0FBQ25DLFlBQUksR0FBRztBQUNOLGNBQUksUUFBUTtBQUNaLGtCQUFRLENBQUM7QUFBQSxRQUNWO0FBQUEsTUFDRDtBQUNBLFlBQU0sTUFBTSxLQUFLLHVCQUF1QixNQUFNLE9BQUs7QUFDbEQsWUFBSSxNQUFNLFdBQVc7QUFDcEIsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRCxDQUFDO0FBR0QsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBU1EsVUFBVSxLQUFjLGFBQWlEO0FBQ2hGLFFBQUksZUFBZSxpQkFBaUIsSUFBSSxTQUFTLGNBQWMsa0JBQWtCO0FBQ2hGLGFBQU8sOEJBQThCLElBQUksU0FBUyw0QkFBNEIsYUFBYTtBQUFBLElBQzVGO0FBQ0EsV0FBTztBQUFBLE1BQ04sZUFBZSxRQUFRLElBQUksVUFBVSxPQUFPLEdBQUc7QUFBQSxNQUMvQztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1RLFNBQVMsWUFBeUMsU0FBOEM7QUFDdkcsV0FBTyxXQUFXLGdCQUFnQixFQUFFLFNBQVMsZ0JBQWdCLEtBQUssUUFBUSxTQUFTLEVBQUUsQ0FBQztBQUFBLEVBQ3ZGO0FBQUEsRUFFQSxNQUFjLGVBQWUsV0FBbUIsVUFBbUQ7QUFDbEcsVUFBTSxhQUFhLE1BQU0sS0FBSyxlQUFlLFNBQVM7QUFDdEQsUUFBSTtBQUNILFlBQU0sY0FBYyxLQUFLLFdBQVcsUUFBUTtBQUM1QyxZQUFNLFNBQVMsTUFBTSxXQUFXLGFBQWEsV0FBVztBQUN4RCxhQUFPLE9BQU87QUFBQSxJQUNmLFNBQVMsS0FBSztBQUNiLFlBQU0sS0FBSyxVQUFVLEtBQUssNEJBQTRCLFdBQVc7QUFBQSxJQUNsRTtBQUFBLEVBQ0Q7QUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUE5Y3NCLHVCQTZDRywrQkFBK0I7QUE3Q2pELElBQWUsd0JBQWY7QUEwZEEsTUFBTSxvQ0FBb0Msc0JBQXNCO0FBQUEsRUFDNUQsV0FBVyxVQUFvQjtBQUN4QyxXQUFPLGlCQUFpQixRQUFRO0FBQUEsRUFDakM7QUFBQSxFQUVVLFdBQVcsVUFBZSxXQUF3QjtBQUMzRCxXQUFPLGVBQWUsVUFBVSxTQUFTO0FBQUEsRUFDMUM7QUFDRDsiLAogICJuYW1lcyI6IFtdCn0K
