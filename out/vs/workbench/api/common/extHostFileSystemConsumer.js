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
import { MainContext } from "./extHost.protocol.js";
import * as files from "../../../platform/files/common/files.js";
import { FileSystemError } from "./extHostTypes.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { IExtHostFileSystemInfo } from "./extHostFileSystemInfo.js";
import { toDisposable } from "../../../base/common/lifecycle.js";
import { ResourceQueue } from "../../../base/common/async.js";
import { extUri, extUriIgnorePathCase } from "../../../base/common/resources.js";
import { Schemas } from "../../../base/common/network.js";
let ExtHostConsumerFileSystem = class {
  constructor(extHostRpc, fileSystemInfo) {
    this._fileSystemProvider = /* @__PURE__ */ new Map();
    this._writeQueue = new ResourceQueue();
    this._proxy = extHostRpc.getProxy(MainContext.MainThreadFileSystem);
    const that = this;
    this.value = Object.freeze({
      async stat(uri) {
        try {
          let stat;
          const provider = that._fileSystemProvider.get(uri.scheme);
          if (provider) {
            await that._proxy.$ensureActivation(uri.scheme);
            stat = await provider.impl.stat(uri);
          } else {
            stat = await that._proxy.$stat(uri);
          }
          return {
            type: stat.type,
            ctime: stat.ctime,
            mtime: stat.mtime,
            size: stat.size,
            permissions: stat.permissions === files.FilePermission.Readonly ? 1 : void 0
          };
        } catch (err) {
          ExtHostConsumerFileSystem._handleError(err);
        }
      },
      async readDirectory(uri) {
        try {
          const provider = that._fileSystemProvider.get(uri.scheme);
          if (provider) {
            await that._proxy.$ensureActivation(uri.scheme);
            return (await provider.impl.readDirectory(uri)).slice();
          } else {
            return await that._proxy.$readdir(uri);
          }
        } catch (err) {
          return ExtHostConsumerFileSystem._handleError(err);
        }
      },
      async createDirectory(uri) {
        try {
          const provider = that._fileSystemProvider.get(uri.scheme);
          if (provider && !provider.isReadonly) {
            await that._proxy.$ensureActivation(uri.scheme);
            return await that.mkdirp(provider.impl, provider.extUri, uri);
          } else {
            return await that._proxy.$mkdir(uri);
          }
        } catch (err) {
          return ExtHostConsumerFileSystem._handleError(err);
        }
      },
      async readFile(uri) {
        try {
          const provider = that._fileSystemProvider.get(uri.scheme);
          if (provider) {
            await that._proxy.$ensureActivation(uri.scheme);
            return (await provider.impl.readFile(uri)).slice();
          } else {
            const buff = await that._proxy.$readFile(uri);
            return buff.buffer;
          }
        } catch (err) {
          return ExtHostConsumerFileSystem._handleError(err);
        }
      },
      async writeFile(uri, content) {
        try {
          const provider = that._fileSystemProvider.get(uri.scheme);
          if (provider && !provider.isReadonly) {
            await that._proxy.$ensureActivation(uri.scheme);
            await that.mkdirp(provider.impl, provider.extUri, provider.extUri.dirname(uri));
            return await that._writeQueue.queueFor(uri, () => Promise.resolve(provider.impl.writeFile(uri, content, { create: true, overwrite: true })));
          } else {
            return await that._proxy.$writeFile(uri, VSBuffer.wrap(content));
          }
        } catch (err) {
          return ExtHostConsumerFileSystem._handleError(err);
        }
      },
      async delete(uri, options) {
        try {
          const provider = that._fileSystemProvider.get(uri.scheme);
          if (provider && !provider.isReadonly && !options?.useTrash) {
            await that._proxy.$ensureActivation(uri.scheme);
            return await provider.impl.delete(uri, { recursive: false, ...options });
          } else {
            return await that._proxy.$delete(uri, { recursive: false, useTrash: false, atomic: false, ...options });
          }
        } catch (err) {
          return ExtHostConsumerFileSystem._handleError(err);
        }
      },
      async rename(oldUri, newUri, options) {
        try {
          return await that._proxy.$rename(oldUri, newUri, { ...{ overwrite: false }, ...options });
        } catch (err) {
          return ExtHostConsumerFileSystem._handleError(err);
        }
      },
      async copy(source, destination, options) {
        try {
          return await that._proxy.$copy(source, destination, { ...{ overwrite: false }, ...options });
        } catch (err) {
          return ExtHostConsumerFileSystem._handleError(err);
        }
      },
      isWritableFileSystem(scheme) {
        const capabilities = fileSystemInfo.getCapabilities(scheme);
        if (typeof capabilities === "number") {
          return !(capabilities & files.FileSystemProviderCapabilities.Readonly);
        }
        return void 0;
      }
    });
  }
  async mkdirp(provider, providerExtUri, directory) {
    const directoriesToCreate = [];
    while (!providerExtUri.isEqual(directory, providerExtUri.dirname(directory))) {
      try {
        const stat = await provider.stat(directory);
        if ((stat.type & files.FileType.Directory) === 0) {
          throw FileSystemError.FileExists(`Unable to create folder '${directory.scheme === Schemas.file ? directory.fsPath : directory.toString(true)}' that already exists but is not a directory`);
        }
        break;
      } catch (error) {
        if (files.toFileSystemProviderErrorCode(error) !== files.FileSystemProviderErrorCode.FileNotFound) {
          throw error;
        }
        directoriesToCreate.push(providerExtUri.basename(directory));
        directory = providerExtUri.dirname(directory);
      }
    }
    for (let i = directoriesToCreate.length - 1; i >= 0; i--) {
      directory = providerExtUri.joinPath(directory, directoriesToCreate[i]);
      try {
        await provider.createDirectory(directory);
      } catch (error) {
        if (files.toFileSystemProviderErrorCode(error) !== files.FileSystemProviderErrorCode.FileExists) {
          throw error;
        }
      }
    }
  }
  static _handleError(err) {
    if (err instanceof FileSystemError) {
      throw err;
    }
    if (err instanceof files.FileSystemProviderError) {
      switch (err.code) {
        case files.FileSystemProviderErrorCode.FileExists:
          throw FileSystemError.FileExists(err.message);
        case files.FileSystemProviderErrorCode.FileNotFound:
          throw FileSystemError.FileNotFound(err.message);
        case files.FileSystemProviderErrorCode.FileNotADirectory:
          throw FileSystemError.FileNotADirectory(err.message);
        case files.FileSystemProviderErrorCode.FileIsADirectory:
          throw FileSystemError.FileIsADirectory(err.message);
        case files.FileSystemProviderErrorCode.NoPermissions:
          throw FileSystemError.NoPermissions(err.message);
        case files.FileSystemProviderErrorCode.Unavailable:
          throw FileSystemError.Unavailable(err.message);
        default:
          throw new FileSystemError(err.message, err.name);
      }
    }
    if (!(err instanceof Error)) {
      throw new FileSystemError(String(err));
    }
    if (err.name === "ENOPRO" || err.message.includes("ENOPRO")) {
      throw FileSystemError.Unavailable(err.message);
    }
    switch (err.name) {
      case files.FileSystemProviderErrorCode.FileExists:
        throw FileSystemError.FileExists(err.message);
      case files.FileSystemProviderErrorCode.FileNotFound:
        throw FileSystemError.FileNotFound(err.message);
      case files.FileSystemProviderErrorCode.FileNotADirectory:
        throw FileSystemError.FileNotADirectory(err.message);
      case files.FileSystemProviderErrorCode.FileIsADirectory:
        throw FileSystemError.FileIsADirectory(err.message);
      case files.FileSystemProviderErrorCode.NoPermissions:
        throw FileSystemError.NoPermissions(err.message);
      case files.FileSystemProviderErrorCode.Unavailable:
        throw FileSystemError.Unavailable(err.message);
      default:
        throw new FileSystemError(err.message, err.name);
    }
  }
  // ---
  addFileSystemProvider(scheme, provider, options) {
    this._fileSystemProvider.set(scheme, { impl: provider, extUri: options?.isCaseSensitive ? extUri : extUriIgnorePathCase, isReadonly: !!options?.isReadonly });
    return toDisposable(() => this._fileSystemProvider.delete(scheme));
  }
  getFileSystemProviderExtUri(scheme) {
    return this._fileSystemProvider.get(scheme)?.extUri ?? extUri;
  }
};
ExtHostConsumerFileSystem = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostFileSystemInfo)
], ExtHostConsumerFileSystem);
const IExtHostConsumerFileSystem = createDecorator("IExtHostConsumerFileSystem");
export {
  ExtHostConsumerFileSystem,
  IExtHostConsumerFileSystem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0RmlsZVN5c3RlbUNvbnN1bWVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRGaWxlU3lzdGVtU2hhcGUgfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCAqIGFzIGZpbGVzIGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBGaWxlU3lzdGVtRXJyb3IgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRIb3N0UnBjU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdFJwY1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RGaWxlU3lzdGVtSW5mbyB9IGZyb20gJy4vZXh0SG9zdEZpbGVTeXN0ZW1JbmZvLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VRdWV1ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElFeHRVcmksIGV4dFVyaSwgZXh0VXJpSWdub3JlUGF0aENhc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuXG5leHBvcnQgY2xhc3MgRXh0SG9zdENvbnN1bWVyRmlsZVN5c3RlbSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IHZhbHVlOiB2c2NvZGUuRmlsZVN5c3RlbTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogTWFpblRocmVhZEZpbGVTeXN0ZW1TaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfZmlsZVN5c3RlbVByb3ZpZGVyID0gbmV3IE1hcDxzdHJpbmcsIHsgaW1wbDogdnNjb2RlLkZpbGVTeXN0ZW1Qcm92aWRlcjsgZXh0VXJpOiBJRXh0VXJpOyBpc1JlYWRvbmx5OiBib29sZWFuIH0+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd3JpdGVRdWV1ZSA9IG5ldyBSZXNvdXJjZVF1ZXVlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRIb3N0UnBjU2VydmljZSBleHRIb3N0UnBjOiBJRXh0SG9zdFJwY1NlcnZpY2UsXG5cdFx0QElFeHRIb3N0RmlsZVN5c3RlbUluZm8gZmlsZVN5c3RlbUluZm86IElFeHRIb3N0RmlsZVN5c3RlbUluZm8sXG5cdCkge1xuXHRcdHRoaXMuX3Byb3h5ID0gZXh0SG9zdFJwYy5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkRmlsZVN5c3RlbSk7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cblx0XHR0aGlzLnZhbHVlID0gT2JqZWN0LmZyZWV6ZSh7XG5cdFx0XHRhc3luYyBzdGF0KHVyaTogdnNjb2RlLlVyaSk6IFByb21pc2U8dnNjb2RlLkZpbGVTdGF0PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0bGV0IHN0YXQ7XG5cblx0XHRcdFx0XHRjb25zdCBwcm92aWRlciA9IHRoYXQuX2ZpbGVTeXN0ZW1Qcm92aWRlci5nZXQodXJpLnNjaGVtZSk7XG5cdFx0XHRcdFx0aWYgKHByb3ZpZGVyKSB7XG5cdFx0XHRcdFx0XHQvLyB1c2Ugc2hvcnRjdXRcblx0XHRcdFx0XHRcdGF3YWl0IHRoYXQuX3Byb3h5LiRlbnN1cmVBY3RpdmF0aW9uKHVyaS5zY2hlbWUpO1xuXHRcdFx0XHRcdFx0c3RhdCA9IGF3YWl0IHByb3ZpZGVyLmltcGwuc3RhdCh1cmkpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRzdGF0ID0gYXdhaXQgdGhhdC5fcHJveHkuJHN0YXQodXJpKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0dHlwZTogc3RhdC50eXBlLFxuXHRcdFx0XHRcdFx0Y3RpbWU6IHN0YXQuY3RpbWUsXG5cdFx0XHRcdFx0XHRtdGltZTogc3RhdC5tdGltZSxcblx0XHRcdFx0XHRcdHNpemU6IHN0YXQuc2l6ZSxcblx0XHRcdFx0XHRcdHBlcm1pc3Npb25zOiBzdGF0LnBlcm1pc3Npb25zID09PSBmaWxlcy5GaWxlUGVybWlzc2lvbi5SZWFkb25seSA/IDEgOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRFeHRIb3N0Q29uc3VtZXJGaWxlU3lzdGVtLl9oYW5kbGVFcnJvcihlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgcmVhZERpcmVjdG9yeSh1cmk6IHZzY29kZS5VcmkpOiBQcm9taXNlPFtzdHJpbmcsIHZzY29kZS5GaWxlVHlwZV1bXT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdGhhdC5fZmlsZVN5c3RlbVByb3ZpZGVyLmdldCh1cmkuc2NoZW1lKTtcblx0XHRcdFx0XHRpZiAocHJvdmlkZXIpIHtcblx0XHRcdFx0XHRcdC8vIHVzZSBzaG9ydGN1dFxuXHRcdFx0XHRcdFx0YXdhaXQgdGhhdC5fcHJveHkuJGVuc3VyZUFjdGl2YXRpb24odXJpLnNjaGVtZSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gKGF3YWl0IHByb3ZpZGVyLmltcGwucmVhZERpcmVjdG9yeSh1cmkpKS5zbGljZSgpOyAvLyBzYWZlLWNvcHlcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoYXQuX3Byb3h5LiRyZWFkZGlyKHVyaSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRyZXR1cm4gRXh0SG9zdENvbnN1bWVyRmlsZVN5c3RlbS5faGFuZGxlRXJyb3IoZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGFzeW5jIGNyZWF0ZURpcmVjdG9yeSh1cmk6IHZzY29kZS5VcmkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBwcm92aWRlciA9IHRoYXQuX2ZpbGVTeXN0ZW1Qcm92aWRlci5nZXQodXJpLnNjaGVtZSk7XG5cdFx0XHRcdFx0aWYgKHByb3ZpZGVyICYmICFwcm92aWRlci5pc1JlYWRvbmx5KSB7XG5cdFx0XHRcdFx0XHQvLyB1c2Ugc2hvcnRjdXRcblx0XHRcdFx0XHRcdGF3YWl0IHRoYXQuX3Byb3h5LiRlbnN1cmVBY3RpdmF0aW9uKHVyaS5zY2hlbWUpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoYXQubWtkaXJwKHByb3ZpZGVyLmltcGwsIHByb3ZpZGVyLmV4dFVyaSwgdXJpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoYXQuX3Byb3h5LiRta2Rpcih1cmkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIEV4dEhvc3RDb25zdW1lckZpbGVTeXN0ZW0uX2hhbmRsZUVycm9yKGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRhc3luYyByZWFkRmlsZSh1cmk6IHZzY29kZS5VcmkpOiBQcm9taXNlPFVpbnQ4QXJyYXk+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBwcm92aWRlciA9IHRoYXQuX2ZpbGVTeXN0ZW1Qcm92aWRlci5nZXQodXJpLnNjaGVtZSk7XG5cdFx0XHRcdFx0aWYgKHByb3ZpZGVyKSB7XG5cdFx0XHRcdFx0XHQvLyB1c2Ugc2hvcnRjdXRcblx0XHRcdFx0XHRcdGF3YWl0IHRoYXQuX3Byb3h5LiRlbnN1cmVBY3RpdmF0aW9uKHVyaS5zY2hlbWUpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIChhd2FpdCBwcm92aWRlci5pbXBsLnJlYWRGaWxlKHVyaSkpLnNsaWNlKCk7IC8vIHNhZmUtY29weVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zdCBidWZmID0gYXdhaXQgdGhhdC5fcHJveHkuJHJlYWRGaWxlKHVyaSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYnVmZi5idWZmZXI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRyZXR1cm4gRXh0SG9zdENvbnN1bWVyRmlsZVN5c3RlbS5faGFuZGxlRXJyb3IoZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGFzeW5jIHdyaXRlRmlsZSh1cmk6IHZzY29kZS5VcmksIGNvbnRlbnQ6IFVpbnQ4QXJyYXkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBwcm92aWRlciA9IHRoYXQuX2ZpbGVTeXN0ZW1Qcm92aWRlci5nZXQodXJpLnNjaGVtZSk7XG5cdFx0XHRcdFx0aWYgKHByb3ZpZGVyICYmICFwcm92aWRlci5pc1JlYWRvbmx5KSB7XG5cdFx0XHRcdFx0XHQvLyB1c2Ugc2hvcnRjdXRcblx0XHRcdFx0XHRcdGF3YWl0IHRoYXQuX3Byb3h5LiRlbnN1cmVBY3RpdmF0aW9uKHVyaS5zY2hlbWUpO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhhdC5ta2RpcnAocHJvdmlkZXIuaW1wbCwgcHJvdmlkZXIuZXh0VXJpLCBwcm92aWRlci5leHRVcmkuZGlybmFtZSh1cmkpKTtcblx0XHRcdFx0XHRcdHJldHVybiBhd2FpdCB0aGF0Ll93cml0ZVF1ZXVlLnF1ZXVlRm9yKHVyaSwgKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHByb3ZpZGVyLmltcGwud3JpdGVGaWxlKHVyaSwgY29udGVudCwgeyBjcmVhdGU6IHRydWUsIG92ZXJ3cml0ZTogdHJ1ZSB9KSkpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhhdC5fcHJveHkuJHdyaXRlRmlsZSh1cmksIFZTQnVmZmVyLndyYXAoY29udGVudCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIEV4dEhvc3RDb25zdW1lckZpbGVTeXN0ZW0uX2hhbmRsZUVycm9yKGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRhc3luYyBkZWxldGUodXJpOiB2c2NvZGUuVXJpLCBvcHRpb25zPzogeyByZWN1cnNpdmU/OiBib29sZWFuOyB1c2VUcmFzaD86IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdGhhdC5fZmlsZVN5c3RlbVByb3ZpZGVyLmdldCh1cmkuc2NoZW1lKTtcblx0XHRcdFx0XHRpZiAocHJvdmlkZXIgJiYgIXByb3ZpZGVyLmlzUmVhZG9ubHkgJiYgIW9wdGlvbnM/LnVzZVRyYXNoIC8qIG5vIHNob3J0Y3V0OiB1c2UgdHJhc2ggKi8pIHtcblx0XHRcdFx0XHRcdC8vIHVzZSBzaG9ydGN1dFxuXHRcdFx0XHRcdFx0YXdhaXQgdGhhdC5fcHJveHkuJGVuc3VyZUFjdGl2YXRpb24odXJpLnNjaGVtZSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYXdhaXQgcHJvdmlkZXIuaW1wbC5kZWxldGUodXJpLCB7IHJlY3Vyc2l2ZTogZmFsc2UsIC4uLm9wdGlvbnMgfSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJldHVybiBhd2FpdCB0aGF0Ll9wcm94eS4kZGVsZXRlKHVyaSwgeyByZWN1cnNpdmU6IGZhbHNlLCB1c2VUcmFzaDogZmFsc2UsIGF0b21pYzogZmFsc2UsIC4uLm9wdGlvbnMgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRyZXR1cm4gRXh0SG9zdENvbnN1bWVyRmlsZVN5c3RlbS5faGFuZGxlRXJyb3IoZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGFzeW5jIHJlbmFtZShvbGRVcmk6IHZzY29kZS5VcmksIG5ld1VyaTogdnNjb2RlLlVyaSwgb3B0aW9ucz86IHsgb3ZlcndyaXRlPzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Ly8gbm8gc2hvcnRjdXQ6IHBvdGVudGlhbGx5IGludm9sdmVzIGRpZmZlcmVudCBzY2hlbWVzLCBkb2VzIG1rZGlycFxuXHRcdFx0XHRcdHJldHVybiBhd2FpdCB0aGF0Ll9wcm94eS4kcmVuYW1lKG9sZFVyaSwgbmV3VXJpLCB7IC4uLnsgb3ZlcndyaXRlOiBmYWxzZSB9LCAuLi5vcHRpb25zIH0pO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRyZXR1cm4gRXh0SG9zdENvbnN1bWVyRmlsZVN5c3RlbS5faGFuZGxlRXJyb3IoZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGFzeW5jIGNvcHkoc291cmNlOiB2c2NvZGUuVXJpLCBkZXN0aW5hdGlvbjogdnNjb2RlLlVyaSwgb3B0aW9ucz86IHsgb3ZlcndyaXRlPzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Ly8gbm8gc2hvcnRjdXQ6IHBvdGVudGlhbGx5IGludm9sdmVzIGRpZmZlcmVudCBzY2hlbWVzLCBkb2VzIG1rZGlycFxuXHRcdFx0XHRcdHJldHVybiBhd2FpdCB0aGF0Ll9wcm94eS4kY29weShzb3VyY2UsIGRlc3RpbmF0aW9uLCB7IC4uLnsgb3ZlcndyaXRlOiBmYWxzZSB9LCAuLi5vcHRpb25zIH0pO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRyZXR1cm4gRXh0SG9zdENvbnN1bWVyRmlsZVN5c3RlbS5faGFuZGxlRXJyb3IoZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGlzV3JpdGFibGVGaWxlU3lzdGVtKHNjaGVtZTogc3RyaW5nKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdGNvbnN0IGNhcGFiaWxpdGllcyA9IGZpbGVTeXN0ZW1JbmZvLmdldENhcGFiaWxpdGllcyhzY2hlbWUpO1xuXHRcdFx0XHRpZiAodHlwZW9mIGNhcGFiaWxpdGllcyA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRyZXR1cm4gIShjYXBhYmlsaXRpZXMgJiBmaWxlcy5GaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUmVhZG9ubHkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG1rZGlycChwcm92aWRlcjogdnNjb2RlLkZpbGVTeXN0ZW1Qcm92aWRlciwgcHJvdmlkZXJFeHRVcmk6IElFeHRVcmksIGRpcmVjdG9yeTogdnNjb2RlLlVyaSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRpcmVjdG9yaWVzVG9DcmVhdGU6IHN0cmluZ1tdID0gW107XG5cblx0XHR3aGlsZSAoIXByb3ZpZGVyRXh0VXJpLmlzRXF1YWwoZGlyZWN0b3J5LCBwcm92aWRlckV4dFVyaS5kaXJuYW1lKGRpcmVjdG9yeSkpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgcHJvdmlkZXIuc3RhdChkaXJlY3RvcnkpO1xuXHRcdFx0XHRpZiAoKHN0YXQudHlwZSAmIGZpbGVzLkZpbGVUeXBlLkRpcmVjdG9yeSkgPT09IDApIHtcblx0XHRcdFx0XHR0aHJvdyBGaWxlU3lzdGVtRXJyb3IuRmlsZUV4aXN0cyhgVW5hYmxlIHRvIGNyZWF0ZSBmb2xkZXIgJyR7ZGlyZWN0b3J5LnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlID8gZGlyZWN0b3J5LmZzUGF0aCA6IGRpcmVjdG9yeS50b1N0cmluZyh0cnVlKX0nIHRoYXQgYWxyZWFkeSBleGlzdHMgYnV0IGlzIG5vdCBhIGRpcmVjdG9yeWApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YnJlYWs7IC8vIHdlIGhhdmUgaGl0IGEgZGlyZWN0b3J5IHRoYXQgZXhpc3RzIC0+IGdvb2Rcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmIChmaWxlcy50b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZShlcnJvcikgIT09IGZpbGVzLkZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQpIHtcblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIGZ1cnRoZXIgZ28gdXAgYW5kIHJlbWVtYmVyIHRvIGNyZWF0ZSB0aGlzIGRpcmVjdG9yeVxuXHRcdFx0XHRkaXJlY3Rvcmllc1RvQ3JlYXRlLnB1c2gocHJvdmlkZXJFeHRVcmkuYmFzZW5hbWUoZGlyZWN0b3J5KSk7XG5cdFx0XHRcdGRpcmVjdG9yeSA9IHByb3ZpZGVyRXh0VXJpLmRpcm5hbWUoZGlyZWN0b3J5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gZGlyZWN0b3JpZXNUb0NyZWF0ZS5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0ZGlyZWN0b3J5ID0gcHJvdmlkZXJFeHRVcmkuam9pblBhdGgoZGlyZWN0b3J5LCBkaXJlY3Rvcmllc1RvQ3JlYXRlW2ldKTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgcHJvdmlkZXIuY3JlYXRlRGlyZWN0b3J5KGRpcmVjdG9yeSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRpZiAoZmlsZXMudG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUoZXJyb3IpICE9PSBmaWxlcy5GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZUV4aXN0cykge1xuXHRcdFx0XHRcdC8vIEZvciBta2RpcnAoKSB3ZSB0b2xlcmF0ZSB0aGF0IHRoZSBta2RpcigpIGNhbGwgZmFpbHNcblx0XHRcdFx0XHQvLyBpbiBjYXNlIHRoZSBmb2xkZXIgYWxyZWFkeSBleGlzdHMuIFRoaXMgZm9sbG93cyBub2RlLmpzXG5cdFx0XHRcdFx0Ly8gb3duIGltcGxlbWVudGF0aW9uIG9mIGZzLm1rZGlyKHsgcmVjdXJzaXZlOiB0cnVlIH0pIGFuZFxuXHRcdFx0XHRcdC8vIHJlZHVjZXMgdGhlIGNoYW5jZXMgb2YgcmFjZSBjb25kaXRpb25zIGxlYWRpbmcgdG8gZXJyb3JzXG5cdFx0XHRcdFx0Ly8gaWYgbXVsdGlwbGUgY2FsbHMgdHJ5IHRvIGNyZWF0ZSB0aGUgc2FtZSBmb2xkZXJzXG5cdFx0XHRcdFx0Ly8gQXMgc3VjaCwgd2Ugb25seSB0aHJvdyBhbiBlcnJvciBoZXJlIGlmIGl0IGlzIG90aGVyIHRoYW5cblx0XHRcdFx0XHQvLyB0aGUgZmFjdCB0aGF0IHRoZSBmaWxlIGFscmVhZHkgZXhpc3RzLlxuXHRcdFx0XHRcdC8vIChzZWUgYWxzbyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvODk4MzQpXG5cdFx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaGFuZGxlRXJyb3IoZXJyOiBhbnkpOiBuZXZlciB7XG5cdFx0Ly8gZGVzaXJlZCBlcnJvciB0eXBlXG5cdFx0aWYgKGVyciBpbnN0YW5jZW9mIEZpbGVTeXN0ZW1FcnJvcikge1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblxuXHRcdC8vIGZpbGUgc3lzdGVtIHByb3ZpZGVyIGVycm9yXG5cdFx0aWYgKGVyciBpbnN0YW5jZW9mIGZpbGVzLkZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKSB7XG5cdFx0XHRzd2l0Y2ggKGVyci5jb2RlKSB7XG5cdFx0XHRcdGNhc2UgZmlsZXMuRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVFeGlzdHM6IHRocm93IEZpbGVTeXN0ZW1FcnJvci5GaWxlRXhpc3RzKGVyci5tZXNzYWdlKTtcblx0XHRcdFx0Y2FzZSBmaWxlcy5GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZU5vdEZvdW5kOiB0aHJvdyBGaWxlU3lzdGVtRXJyb3IuRmlsZU5vdEZvdW5kKGVyci5tZXNzYWdlKTtcblx0XHRcdFx0Y2FzZSBmaWxlcy5GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZU5vdEFEaXJlY3Rvcnk6IHRocm93IEZpbGVTeXN0ZW1FcnJvci5GaWxlTm90QURpcmVjdG9yeShlcnIubWVzc2FnZSk7XG5cdFx0XHRcdGNhc2UgZmlsZXMuRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVJc0FEaXJlY3Rvcnk6IHRocm93IEZpbGVTeXN0ZW1FcnJvci5GaWxlSXNBRGlyZWN0b3J5KGVyci5tZXNzYWdlKTtcblx0XHRcdFx0Y2FzZSBmaWxlcy5GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuTm9QZXJtaXNzaW9uczogdGhyb3cgRmlsZVN5c3RlbUVycm9yLk5vUGVybWlzc2lvbnMoZXJyLm1lc3NhZ2UpO1xuXHRcdFx0XHRjYXNlIGZpbGVzLkZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5VbmF2YWlsYWJsZTogdGhyb3cgRmlsZVN5c3RlbUVycm9yLlVuYXZhaWxhYmxlKGVyci5tZXNzYWdlKTtcblxuXHRcdFx0XHRkZWZhdWx0OiB0aHJvdyBuZXcgRmlsZVN5c3RlbUVycm9yKGVyci5tZXNzYWdlLCBlcnIubmFtZSBhcyBmaWxlcy5GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGdlbmVyaWMgZXJyb3Jcblx0XHRpZiAoIShlcnIgaW5zdGFuY2VvZiBFcnJvcikpIHtcblx0XHRcdHRocm93IG5ldyBGaWxlU3lzdGVtRXJyb3IoU3RyaW5nKGVycikpO1xuXHRcdH1cblxuXHRcdC8vIG5vIHByb3ZpZGVyICh1bmtub3duIHNjaGVtZSkgZXJyb3Jcblx0XHRpZiAoZXJyLm5hbWUgPT09ICdFTk9QUk8nIHx8IGVyci5tZXNzYWdlLmluY2x1ZGVzKCdFTk9QUk8nKSkge1xuXHRcdFx0dGhyb3cgRmlsZVN5c3RlbUVycm9yLlVuYXZhaWxhYmxlKGVyci5tZXNzYWdlKTtcblx0XHR9XG5cblx0XHQvLyBmaWxlIHN5c3RlbSBlcnJvclxuXHRcdHN3aXRjaCAoZXJyLm5hbWUpIHtcblx0XHRcdGNhc2UgZmlsZXMuRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVFeGlzdHM6IHRocm93IEZpbGVTeXN0ZW1FcnJvci5GaWxlRXhpc3RzKGVyci5tZXNzYWdlKTtcblx0XHRcdGNhc2UgZmlsZXMuRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RGb3VuZDogdGhyb3cgRmlsZVN5c3RlbUVycm9yLkZpbGVOb3RGb3VuZChlcnIubWVzc2FnZSk7XG5cdFx0XHRjYXNlIGZpbGVzLkZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90QURpcmVjdG9yeTogdGhyb3cgRmlsZVN5c3RlbUVycm9yLkZpbGVOb3RBRGlyZWN0b3J5KGVyci5tZXNzYWdlKTtcblx0XHRcdGNhc2UgZmlsZXMuRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVJc0FEaXJlY3Rvcnk6IHRocm93IEZpbGVTeXN0ZW1FcnJvci5GaWxlSXNBRGlyZWN0b3J5KGVyci5tZXNzYWdlKTtcblx0XHRcdGNhc2UgZmlsZXMuRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLk5vUGVybWlzc2lvbnM6IHRocm93IEZpbGVTeXN0ZW1FcnJvci5Ob1Blcm1pc3Npb25zKGVyci5tZXNzYWdlKTtcblx0XHRcdGNhc2UgZmlsZXMuRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLlVuYXZhaWxhYmxlOiB0aHJvdyBGaWxlU3lzdGVtRXJyb3IuVW5hdmFpbGFibGUoZXJyLm1lc3NhZ2UpO1xuXG5cdFx0XHRkZWZhdWx0OiB0aHJvdyBuZXcgRmlsZVN5c3RlbUVycm9yKGVyci5tZXNzYWdlLCBlcnIubmFtZSBhcyBmaWxlcy5GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLVxuXG5cdGFkZEZpbGVTeXN0ZW1Qcm92aWRlcihzY2hlbWU6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5GaWxlU3lzdGVtUHJvdmlkZXIsIG9wdGlvbnM/OiB7IGlzQ2FzZVNlbnNpdGl2ZT86IGJvb2xlYW47IGlzUmVhZG9ubHk/OiBib29sZWFuIHwgSU1hcmtkb3duU3RyaW5nIH0pOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5fZmlsZVN5c3RlbVByb3ZpZGVyLnNldChzY2hlbWUsIHsgaW1wbDogcHJvdmlkZXIsIGV4dFVyaTogb3B0aW9ucz8uaXNDYXNlU2Vuc2l0aXZlID8gZXh0VXJpIDogZXh0VXJpSWdub3JlUGF0aENhc2UsIGlzUmVhZG9ubHk6ICEhb3B0aW9ucz8uaXNSZWFkb25seSB9KTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX2ZpbGVTeXN0ZW1Qcm92aWRlci5kZWxldGUoc2NoZW1lKSk7XG5cdH1cblxuXHRnZXRGaWxlU3lzdGVtUHJvdmlkZXJFeHRVcmkoc2NoZW1lOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5fZmlsZVN5c3RlbVByb3ZpZGVyLmdldChzY2hlbWUpPy5leHRVcmkgPz8gZXh0VXJpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dEhvc3RDb25zdW1lckZpbGVTeXN0ZW0gZXh0ZW5kcyBFeHRIb3N0Q29uc3VtZXJGaWxlU3lzdGVtIHsgfVxuZXhwb3J0IGNvbnN0IElFeHRIb3N0Q29uc3VtZXJGaWxlU3lzdGVtID0gY3JlYXRlRGVjb3JhdG9yPElFeHRIb3N0Q29uc3VtZXJGaWxlU3lzdGVtPignSUV4dEhvc3RDb25zdW1lckZpbGVTeXN0ZW0nKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxtQkFBOEM7QUFFdkQsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQXNCLG9CQUFvQjtBQUMxQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFrQixRQUFRLDRCQUE0QjtBQUN0RCxTQUFTLGVBQWU7QUFHakIsSUFBTSw0QkFBTixNQUFnQztBQUFBLEVBV3RDLFlBQ3FCLFlBQ0ksZ0JBQ3ZCO0FBUEYsU0FBaUIsc0JBQXNCLG9CQUFJLElBQXVGO0FBRWxJLFNBQWlCLGNBQWMsSUFBSSxjQUFjO0FBTWhELFNBQUssU0FBUyxXQUFXLFNBQVMsWUFBWSxvQkFBb0I7QUFDbEUsVUFBTSxPQUFPO0FBRWIsU0FBSyxRQUFRLE9BQU8sT0FBTztBQUFBLE1BQzFC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
