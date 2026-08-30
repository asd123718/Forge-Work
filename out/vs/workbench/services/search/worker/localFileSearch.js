import * as glob from "../../../../base/common/glob.js";
import { URI } from "../../../../base/common/uri.js";
import { LocalFileSearchWorkerHost } from "../common/localFileSearchWorkerTypes.js";
import * as paths from "../../../../base/common/path.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { getFileResults } from "../common/getFileResults.js";
import { IgnoreFile } from "../common/ignoreFile.js";
import { createRegExp } from "../../../../base/common/strings.js";
import { Promises } from "../../../../base/common/async.js";
import { ExtUri } from "../../../../base/common/resources.js";
import { revive } from "../../../../base/common/marshalling.js";
const PERF = false;
const globalStart = +/* @__PURE__ */ new Date();
const itrcount = {};
const time = async (name, task) => {
  if (!PERF) {
    return task();
  }
  const start = Date.now();
  const itr = (itrcount[name] ?? 0) + 1;
  console.info(name, itr, "starting", Math.round((start - globalStart) * 10) / 1e4);
  itrcount[name] = itr;
  const r = await task();
  const end = Date.now();
  console.info(name, itr, "took", end - start);
  return r;
};
function create(workerServer) {
  return new LocalFileSearchWorker(workerServer);
}
class LocalFileSearchWorker {
  constructor(workerServer) {
    this._requestHandlerBrand = void 0;
    this.cancellationTokens = /* @__PURE__ */ new Map();
    this.host = LocalFileSearchWorkerHost.getChannel(workerServer);
  }
  $cancelQuery(queryId) {
    this.cancellationTokens.get(queryId)?.cancel();
  }
  registerCancellationToken(queryId) {
    const source = new CancellationTokenSource();
    this.cancellationTokens.set(queryId, source);
    return source;
  }
  async $listDirectory(handle, query, folderQuery, ignorePathCasing, queryId) {
    const revivedFolderQuery = reviveFolderQuery(folderQuery);
    const extUri = new ExtUri(() => ignorePathCasing);
    const token = this.registerCancellationToken(queryId);
    const entries = [];
    let limitHit = false;
    let count = 0;
    const max = query.maxResults || 512;
    const filePatternMatcher = query.filePattern ? (name) => query.filePattern.split("").every((c) => name.includes(c)) : (name) => true;
    await time("listDirectory", () => this.walkFolderQuery(handle, reviveQueryProps(query), revivedFolderQuery, extUri, (file) => {
      if (!filePatternMatcher(file.name)) {
        return;
      }
      count++;
      if (max && count > max) {
        limitHit = true;
        token.cancel();
      }
      return entries.push(file.path);
    }, token.token));
    return {
      results: entries,
      limitHit
    };
  }
  async $searchDirectory(handle, query, folderQuery, ignorePathCasing, queryId) {
    const revivedQuery = reviveFolderQuery(folderQuery);
    const extUri = new ExtUri(() => ignorePathCasing);
    return time("searchInFiles", async () => {
      const token = this.registerCancellationToken(queryId);
      const results = [];
      const pattern = createSearchRegExp(query.contentPattern);
      const onGoingProcesses = [];
      let fileCount = 0;
      let resultCount = 0;
      const limitHit = false;
      const processFile = async (file) => {
        if (token.token.isCancellationRequested) {
          return;
        }
        fileCount++;
        const contents = await file.resolve();
        if (token.token.isCancellationRequested) {
          return;
        }
        const bytes = new Uint8Array(contents);
        const fileResults = getFileResults(bytes, pattern, {
          surroundingContext: query.surroundingContext ?? 0,
          previewOptions: query.previewOptions,
          remainingResultQuota: query.maxResults ? query.maxResults - resultCount : 1e4
        });
        if (fileResults.length) {
          resultCount += fileResults.length;
          if (query.maxResults && resultCount > query.maxResults) {
            token.cancel();
          }
          const match = {
            resource: URI.joinPath(revivedQuery.folder, file.path),
            results: fileResults
          };
          this.host.$sendTextSearchMatch(match, queryId);
          results.push(match);
        }
      };
      await time(
        "walkFolderToResolve",
        () => this.walkFolderQuery(handle, reviveQueryProps(query), revivedQuery, extUri, async (file) => onGoingProcesses.push(processFile(file)), token.token)
      );
      await time("resolveOngoingProcesses", () => Promise.all(onGoingProcesses));
      if (PERF) {
        console.log("Searched in", fileCount, "files");
      }
      return {
        results,
        limitHit
      };
    });
  }
  async walkFolderQuery(handle, queryProps, folderQuery, extUri, onFile, token) {
    const ignoreGlobCase = queryProps.ignoreGlobCase || folderQuery.ignoreGlobCase;
    const globOptions = { trimForExclusions: true, ignoreCase: ignoreGlobCase };
    const folderExcludes = folderQuery.excludePattern?.map((excludePattern) => glob.parse(excludePattern.pattern ?? {}, globOptions));
    const evalFolderExcludes = (path, basename, hasSibling) => {
      return folderExcludes?.some((folderExclude) => {
        return folderExclude(path, basename, hasSibling);
      });
    };
    const isFolderExcluded = (path, basename, hasSibling) => {
      path = path.slice(1);
      if (evalFolderExcludes(path, basename, hasSibling)) {
        return true;
      }
      if (pathExcludedInQuery(queryProps, path)) {
        return true;
      }
      return false;
    };
    const isFileIncluded = (path, basename, hasSibling) => {
      path = path.slice(1);
      if (evalFolderExcludes(path, basename, hasSibling)) {
        return false;
      }
      if (!pathIncludedInQuery(queryProps, path, extUri)) {
        return false;
      }
      return true;
    };
    const processFile = (file, prior) => {
      const resolved = {
        type: "file",
        name: file.name,
        path: prior,
        resolve: () => file.getFile().then((r) => r.arrayBuffer())
      };
      return resolved;
    };
    const isFileSystemDirectoryHandle = (handle2) => {
      return handle2.kind === "directory";
    };
    const isFileSystemFileHandle = (handle2) => {
      return handle2.kind === "file";
    };
    const processDirectory = async (directory, prior, ignoreFile) => {
      if (!folderQuery.disregardIgnoreFiles) {
        const ignoreFiles = await Promise.all([
          directory.getFileHandle(".gitignore").catch((e) => void 0),
          directory.getFileHandle(".ignore").catch((e) => void 0)
        ]);
        await Promise.all(ignoreFiles.map(async (file) => {
          if (!file) {
            return;
          }
          const ignoreContents = new TextDecoder("utf8").decode(new Uint8Array(await (await file.getFile()).arrayBuffer()));
          ignoreFile = new IgnoreFile(ignoreContents, prior, ignoreFile, ignoreGlobCase);
        }));
      }
      const entries = Promises.withAsyncBody(async (c) => {
        const files = [];
        const dirs = [];
        const entries2 = [];
        const sibilings = /* @__PURE__ */ new Set();
        for await (const entry of directory.entries()) {
          entries2.push(entry);
          sibilings.add(entry[0]);
        }
        for (const [basename, handle2] of entries2) {
          if (token.isCancellationRequested) {
            break;
          }
          const path = prior + basename;
          if (ignoreFile && !ignoreFile.isPathIncludedInTraversal(path, handle2.kind === "directory")) {
            continue;
          }
          const hasSibling = (query) => sibilings.has(query);
          if (isFileSystemDirectoryHandle(handle2) && !isFolderExcluded(path, basename, hasSibling)) {
            dirs.push(processDirectory(handle2, path + "/", ignoreFile));
          } else if (isFileSystemFileHandle(handle2) && isFileIncluded(path, basename, hasSibling)) {
            files.push(processFile(handle2, path));
          }
        }
        c([...await Promise.all(dirs), ...files]);
      });
      return {
        type: "dir",
        name: directory.name,
        entries
      };
    };
    const resolveDirectory = async (directory, onFile2) => {
      if (token.isCancellationRequested) {
        return;
      }
      await Promise.all(
        (await directory.entries).sort((a, b) => -(a.type === "dir" ? 0 : 1) + (b.type === "dir" ? 0 : 1)).map(async (entry) => {
          if (entry.type === "dir") {
            return resolveDirectory(entry, onFile2);
          } else {
            return onFile2(entry);
          }
        })
      );
    };
    const processed = await time("process", () => processDirectory(handle, "/"));
    await time("resolve", () => resolveDirectory(processed, onFile));
  }
}
function createSearchRegExp(options) {
  return createRegExp(options.pattern, !!options.isRegExp, {
    wholeWord: options.isWordMatch,
    global: true,
    matchCase: options.isCaseSensitive,
    multiline: true,
    unicode: true
  });
}
function reviveFolderQuery(folderQuery) {
  return revive({
    ...revive(folderQuery),
    excludePattern: folderQuery.excludePattern?.map((ep) => ({ folder: URI.revive(ep.folder), pattern: ep.pattern })),
    folder: URI.revive(folderQuery.folder)
  });
}
function reviveQueryProps(queryProps) {
  return {
    ...queryProps,
    extraFileResources: queryProps.extraFileResources?.map((r) => URI.revive(r)),
    folderQueries: queryProps.folderQueries.map((fq) => reviveFolderQuery(fq))
  };
}
function pathExcludedInQuery(queryProps, fsPath) {
  const globOptions = queryProps.ignoreGlobCase ? { ignoreCase: true } : void 0;
  if (queryProps.excludePattern && glob.match(queryProps.excludePattern, fsPath, globOptions)) {
    return true;
  }
  return false;
}
function pathIncludedInQuery(queryProps, path, extUri) {
  const globOptions = queryProps.ignoreGlobCase ? { ignoreCase: true } : void 0;
  if (queryProps.excludePattern && glob.match(queryProps.excludePattern, path, globOptions)) {
    return false;
  }
  if (queryProps.includePattern || queryProps.usingSearchPaths) {
    if (queryProps.includePattern && glob.match(queryProps.includePattern, path, globOptions)) {
      return true;
    }
    if (queryProps.usingSearchPaths) {
      return !!queryProps.folderQueries && queryProps.folderQueries.some((fq) => {
        const searchPath = fq.folder;
        const uri = URI.file(path);
        if (extUri.isEqualOrParent(uri, searchPath)) {
          const relPath = paths.relative(searchPath.path, uri.path);
          return !fq.includePattern || !!glob.match(fq.includePattern, relPath, globOptions);
        } else {
          return false;
        }
      });
    }
    return false;
  }
  return true;
}
export {
  LocalFileSearchWorker,
  create
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxzZWFyY2hcXHdvcmtlclxcbG9jYWxGaWxlU2VhcmNoLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZ2xvYiBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCB7IFVyaUNvbXBvbmVudHMsIFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJV2ViV29ya2VyU2VydmVyUmVxdWVzdEhhbmRsZXIsIElXZWJXb3JrZXJTZXJ2ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi93b3JrZXIvd2ViV29ya2VyLmpzJztcbmltcG9ydCB7IElMb2NhbEZpbGVTZWFyY2hXb3JrZXIsIExvY2FsRmlsZVNlYXJjaFdvcmtlckhvc3QsIElXb3JrZXJGaWxlU2VhcmNoQ29tcGxldGUsIElXb3JrZXJGaWxlU3lzdGVtRGlyZWN0b3J5SGFuZGxlLCBJV29ya2VyRmlsZVN5c3RlbUhhbmRsZSwgSVdvcmtlclRleHRTZWFyY2hDb21wbGV0ZSB9IGZyb20gJy4uL2NvbW1vbi9sb2NhbEZpbGVTZWFyY2hXb3JrZXJUeXBlcy5qcyc7XG5pbXBvcnQgeyBJQ29tbW9uUXVlcnlQcm9wcywgSUZpbGVNYXRjaCwgSUZpbGVRdWVyeVByb3BzLCBJRm9sZGVyUXVlcnksIElQYXR0ZXJuSW5mbywgSVRleHRRdWVyeVByb3BzLCB9IGZyb20gJy4uL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0ICogYXMgcGF0aHMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZ2V0RmlsZVJlc3VsdHMgfSBmcm9tICcuLi9jb21tb24vZ2V0RmlsZVJlc3VsdHMuanMnO1xuaW1wb3J0IHsgSWdub3JlRmlsZSB9IGZyb20gJy4uL2NvbW1vbi9pZ25vcmVGaWxlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVJlZ0V4cCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFeHRVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgcmV2aXZlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuXG5jb25zdCBQRVJGID0gZmFsc2U7XG5cbnR5cGUgRmlsZU5vZGUgPSB7XG5cdHR5cGU6ICdmaWxlJztcblx0bmFtZTogc3RyaW5nO1xuXHRwYXRoOiBzdHJpbmc7XG5cdHJlc29sdmU6ICgpID0+IFByb21pc2U8QXJyYXlCdWZmZXI+O1xufTtcblxudHlwZSBEaXJOb2RlID0ge1xuXHR0eXBlOiAnZGlyJztcblx0bmFtZTogc3RyaW5nO1xuXHRlbnRyaWVzOiBQcm9taXNlPChEaXJOb2RlIHwgRmlsZU5vZGUpW10+O1xufTtcblxuY29uc3QgZ2xvYmFsU3RhcnQgPSArbmV3IERhdGUoKTtcbmNvbnN0IGl0cmNvdW50OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG5jb25zdCB0aW1lID0gYXN5bmMgPFQ+KG5hbWU6IHN0cmluZywgdGFzazogKCkgPT4gUHJvbWlzZTxUPiB8IFQpID0+IHtcblx0aWYgKCFQRVJGKSB7IHJldHVybiB0YXNrKCk7IH1cblxuXHRjb25zdCBzdGFydCA9IERhdGUubm93KCk7XG5cdGNvbnN0IGl0ciA9IChpdHJjb3VudFtuYW1lXSA/PyAwKSArIDE7XG5cdGNvbnNvbGUuaW5mbyhuYW1lLCBpdHIsICdzdGFydGluZycsIE1hdGgucm91bmQoKHN0YXJ0IC0gZ2xvYmFsU3RhcnQpICogMTApIC8gMTAwMDApO1xuXG5cdGl0cmNvdW50W25hbWVdID0gaXRyO1xuXHRjb25zdCByID0gYXdhaXQgdGFzaygpO1xuXHRjb25zdCBlbmQgPSBEYXRlLm5vdygpO1xuXHRjb25zb2xlLmluZm8obmFtZSwgaXRyLCAndG9vaycsIGVuZCAtIHN0YXJ0KTtcblx0cmV0dXJuIHI7XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlKHdvcmtlclNlcnZlcjogSVdlYldvcmtlclNlcnZlcik6IElXZWJXb3JrZXJTZXJ2ZXJSZXF1ZXN0SGFuZGxlciB7XG5cdHJldHVybiBuZXcgTG9jYWxGaWxlU2VhcmNoV29ya2VyKHdvcmtlclNlcnZlcik7XG59XG5cbmV4cG9ydCBjbGFzcyBMb2NhbEZpbGVTZWFyY2hXb3JrZXIgaW1wbGVtZW50cyBJTG9jYWxGaWxlU2VhcmNoV29ya2VyLCBJV2ViV29ya2VyU2VydmVyUmVxdWVzdEhhbmRsZXIge1xuXHRfcmVxdWVzdEhhbmRsZXJCcmFuZDogdm9pZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGhvc3Q6IExvY2FsRmlsZVNlYXJjaFdvcmtlckhvc3Q7XG5cdGNhbmNlbGxhdGlvblRva2VuczogTWFwPG51bWJlciwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+ID0gbmV3IE1hcCgpO1xuXG5cdGNvbnN0cnVjdG9yKHdvcmtlclNlcnZlcjogSVdlYldvcmtlclNlcnZlcikge1xuXHRcdHRoaXMuaG9zdCA9IExvY2FsRmlsZVNlYXJjaFdvcmtlckhvc3QuZ2V0Q2hhbm5lbCh3b3JrZXJTZXJ2ZXIpO1xuXHR9XG5cblx0JGNhbmNlbFF1ZXJ5KHF1ZXJ5SWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuY2FuY2VsbGF0aW9uVG9rZW5zLmdldChxdWVyeUlkKT8uY2FuY2VsKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQ2FuY2VsbGF0aW9uVG9rZW4ocXVlcnlJZDogbnVtYmVyKTogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2Uge1xuXHRcdGNvbnN0IHNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMuY2FuY2VsbGF0aW9uVG9rZW5zLnNldChxdWVyeUlkLCBzb3VyY2UpO1xuXHRcdHJldHVybiBzb3VyY2U7XG5cdH1cblxuXHRhc3luYyAkbGlzdERpcmVjdG9yeShoYW5kbGU6IElXb3JrZXJGaWxlU3lzdGVtRGlyZWN0b3J5SGFuZGxlLCBxdWVyeTogSUZpbGVRdWVyeVByb3BzPFVyaUNvbXBvbmVudHM+LCBmb2xkZXJRdWVyeTogSUZvbGRlclF1ZXJ5PFVyaUNvbXBvbmVudHM+LCBpZ25vcmVQYXRoQ2FzaW5nOiBib29sZWFuLCBxdWVyeUlkOiBudW1iZXIpOiBQcm9taXNlPElXb3JrZXJGaWxlU2VhcmNoQ29tcGxldGU+IHtcblx0XHRjb25zdCByZXZpdmVkRm9sZGVyUXVlcnkgPSByZXZpdmVGb2xkZXJRdWVyeShmb2xkZXJRdWVyeSk7XG5cdFx0Y29uc3QgZXh0VXJpID0gbmV3IEV4dFVyaSgoKSA9PiBpZ25vcmVQYXRoQ2FzaW5nKTtcblxuXHRcdGNvbnN0IHRva2VuID0gdGhpcy5yZWdpc3RlckNhbmNlbGxhdGlvblRva2VuKHF1ZXJ5SWQpO1xuXHRcdGNvbnN0IGVudHJpZXM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IGxpbWl0SGl0ID0gZmFsc2U7XG5cdFx0bGV0IGNvdW50ID0gMDtcblxuXHRcdGNvbnN0IG1heCA9IHF1ZXJ5Lm1heFJlc3VsdHMgfHwgNTEyO1xuXG5cdFx0Y29uc3QgZmlsZVBhdHRlcm5NYXRjaGVyID0gcXVlcnkuZmlsZVBhdHRlcm5cblx0XHRcdD8gKG5hbWU6IHN0cmluZykgPT4gcXVlcnkuZmlsZVBhdHRlcm4hLnNwbGl0KCcnKS5ldmVyeShjID0+IG5hbWUuaW5jbHVkZXMoYykpXG5cdFx0XHQ6IChuYW1lOiBzdHJpbmcpID0+IHRydWU7XG5cblx0XHRhd2FpdCB0aW1lKCdsaXN0RGlyZWN0b3J5JywgKCkgPT4gdGhpcy53YWxrRm9sZGVyUXVlcnkoaGFuZGxlLCByZXZpdmVRdWVyeVByb3BzKHF1ZXJ5KSwgcmV2aXZlZEZvbGRlclF1ZXJ5LCBleHRVcmksIGZpbGUgPT4ge1xuXHRcdFx0aWYgKCFmaWxlUGF0dGVybk1hdGNoZXIoZmlsZS5uYW1lKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvdW50Kys7XG5cblx0XHRcdGlmIChtYXggJiYgY291bnQgPiBtYXgpIHtcblx0XHRcdFx0bGltaXRIaXQgPSB0cnVlO1xuXHRcdFx0XHR0b2tlbi5jYW5jZWwoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBlbnRyaWVzLnB1c2goZmlsZS5wYXRoKTtcblx0XHR9LCB0b2tlbi50b2tlbikpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc3VsdHM6IGVudHJpZXMsXG5cdFx0XHRsaW1pdEhpdFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyAkc2VhcmNoRGlyZWN0b3J5KGhhbmRsZTogSVdvcmtlckZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGUsIHF1ZXJ5OiBJVGV4dFF1ZXJ5UHJvcHM8VXJpQ29tcG9uZW50cz4sIGZvbGRlclF1ZXJ5OiBJRm9sZGVyUXVlcnk8VXJpQ29tcG9uZW50cz4sIGlnbm9yZVBhdGhDYXNpbmc6IGJvb2xlYW4sIHF1ZXJ5SWQ6IG51bWJlcik6IFByb21pc2U8SVdvcmtlclRleHRTZWFyY2hDb21wbGV0ZT4ge1xuXHRcdGNvbnN0IHJldml2ZWRRdWVyeSA9IHJldml2ZUZvbGRlclF1ZXJ5KGZvbGRlclF1ZXJ5KTtcblx0XHRjb25zdCBleHRVcmkgPSBuZXcgRXh0VXJpKCgpID0+IGlnbm9yZVBhdGhDYXNpbmcpO1xuXG5cdFx0cmV0dXJuIHRpbWUoJ3NlYXJjaEluRmlsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b2tlbiA9IHRoaXMucmVnaXN0ZXJDYW5jZWxsYXRpb25Ub2tlbihxdWVyeUlkKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0czogSUZpbGVNYXRjaFtdID0gW107XG5cblx0XHRcdGNvbnN0IHBhdHRlcm4gPSBjcmVhdGVTZWFyY2hSZWdFeHAocXVlcnkuY29udGVudFBhdHRlcm4pO1xuXG5cdFx0XHRjb25zdCBvbkdvaW5nUHJvY2Vzc2VzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcblxuXHRcdFx0bGV0IGZpbGVDb3VudCA9IDA7XG5cdFx0XHRsZXQgcmVzdWx0Q291bnQgPSAwO1xuXHRcdFx0Y29uc3QgbGltaXRIaXQgPSBmYWxzZTtcblxuXHRcdFx0Y29uc3QgcHJvY2Vzc0ZpbGUgPSBhc3luYyAoZmlsZTogRmlsZU5vZGUpID0+IHtcblx0XHRcdFx0aWYgKHRva2VuLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZmlsZUNvdW50Kys7XG5cblx0XHRcdFx0Y29uc3QgY29udGVudHMgPSBhd2FpdCBmaWxlLnJlc29sdmUoKTtcblx0XHRcdFx0aWYgKHRva2VuLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheShjb250ZW50cyk7XG5cdFx0XHRcdGNvbnN0IGZpbGVSZXN1bHRzID0gZ2V0RmlsZVJlc3VsdHMoYnl0ZXMsIHBhdHRlcm4sIHtcblx0XHRcdFx0XHRzdXJyb3VuZGluZ0NvbnRleHQ6IHF1ZXJ5LnN1cnJvdW5kaW5nQ29udGV4dCA/PyAwLFxuXHRcdFx0XHRcdHByZXZpZXdPcHRpb25zOiBxdWVyeS5wcmV2aWV3T3B0aW9ucyxcblx0XHRcdFx0XHRyZW1haW5pbmdSZXN1bHRRdW90YTogcXVlcnkubWF4UmVzdWx0cyA/IChxdWVyeS5tYXhSZXN1bHRzIC0gcmVzdWx0Q291bnQpIDogMTAwMDAsXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGlmIChmaWxlUmVzdWx0cy5sZW5ndGgpIHtcblx0XHRcdFx0XHRyZXN1bHRDb3VudCArPSBmaWxlUmVzdWx0cy5sZW5ndGg7XG5cdFx0XHRcdFx0aWYgKHF1ZXJ5Lm1heFJlc3VsdHMgJiYgcmVzdWx0Q291bnQgPiBxdWVyeS5tYXhSZXN1bHRzKSB7XG5cdFx0XHRcdFx0XHR0b2tlbi5jYW5jZWwoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgbWF0Y2ggPSB7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLmpvaW5QYXRoKHJldml2ZWRRdWVyeS5mb2xkZXIsIGZpbGUucGF0aCksXG5cdFx0XHRcdFx0XHRyZXN1bHRzOiBmaWxlUmVzdWx0cyxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHRoaXMuaG9zdC4kc2VuZFRleHRTZWFyY2hNYXRjaChtYXRjaCwgcXVlcnlJZCk7XG5cdFx0XHRcdFx0cmVzdWx0cy5wdXNoKG1hdGNoKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgdGltZSgnd2Fsa0ZvbGRlclRvUmVzb2x2ZScsICgpID0+XG5cdFx0XHRcdHRoaXMud2Fsa0ZvbGRlclF1ZXJ5KGhhbmRsZSwgcmV2aXZlUXVlcnlQcm9wcyhxdWVyeSksIHJldml2ZWRRdWVyeSwgZXh0VXJpLCBhc3luYyBmaWxlID0+IG9uR29pbmdQcm9jZXNzZXMucHVzaChwcm9jZXNzRmlsZShmaWxlKSksIHRva2VuLnRva2VuKVxuXHRcdFx0KTtcblxuXHRcdFx0YXdhaXQgdGltZSgncmVzb2x2ZU9uZ29pbmdQcm9jZXNzZXMnLCAoKSA9PiBQcm9taXNlLmFsbChvbkdvaW5nUHJvY2Vzc2VzKSk7XG5cblx0XHRcdGlmIChQRVJGKSB7IGNvbnNvbGUubG9nKCdTZWFyY2hlZCBpbicsIGZpbGVDb3VudCwgJ2ZpbGVzJyk7IH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmVzdWx0cyxcblx0XHRcdFx0bGltaXRIaXQsXG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHdhbGtGb2xkZXJRdWVyeShoYW5kbGU6IElXb3JrZXJGaWxlU3lzdGVtRGlyZWN0b3J5SGFuZGxlLCBxdWVyeVByb3BzOiBJQ29tbW9uUXVlcnlQcm9wczxVUkk+LCBmb2xkZXJRdWVyeTogSUZvbGRlclF1ZXJ5PFVSST4sIGV4dFVyaTogRXh0VXJpLCBvbkZpbGU6IChmaWxlOiBGaWxlTm9kZSkgPT4gUHJvbWlzZTx1bmtub3duPiB8IHVua25vd24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Y29uc3QgaWdub3JlR2xvYkNhc2UgPSBxdWVyeVByb3BzLmlnbm9yZUdsb2JDYXNlIHx8IGZvbGRlclF1ZXJ5Lmlnbm9yZUdsb2JDYXNlO1xuXHRcdGNvbnN0IGdsb2JPcHRpb25zID0geyB0cmltRm9yRXhjbHVzaW9uczogdHJ1ZSwgaWdub3JlQ2FzZTogaWdub3JlR2xvYkNhc2UgfTtcblx0XHRjb25zdCBmb2xkZXJFeGNsdWRlcyA9IGZvbGRlclF1ZXJ5LmV4Y2x1ZGVQYXR0ZXJuPy5tYXAoZXhjbHVkZVBhdHRlcm4gPT4gZ2xvYi5wYXJzZShleGNsdWRlUGF0dGVybi5wYXR0ZXJuID8/IHt9LCBnbG9iT3B0aW9ucykgYXMgZ2xvYi5QYXJzZWRFeHByZXNzaW9uKTtcblxuXHRcdGNvbnN0IGV2YWxGb2xkZXJFeGNsdWRlcyA9IChwYXRoOiBzdHJpbmcsIGJhc2VuYW1lOiBzdHJpbmcsIGhhc1NpYmxpbmc6IChxdWVyeTogc3RyaW5nKSA9PiBib29sZWFuKSA9PiB7XG5cdFx0XHRyZXR1cm4gZm9sZGVyRXhjbHVkZXM/LnNvbWUoZm9sZGVyRXhjbHVkZSA9PiB7XG5cdFx0XHRcdHJldHVybiBmb2xkZXJFeGNsdWRlKHBhdGgsIGJhc2VuYW1lLCBoYXNTaWJsaW5nKTtcblx0XHRcdH0pO1xuXG5cdFx0fTtcblx0XHQvLyBGb3IgZm9sZGVycywgb25seSBjaGVjayBpZiB0aGUgZm9sZGVyIGlzIGV4cGxpY2l0bHkgZXhjbHVkZWQgc28gd2Fsa2luZyBjb250aW51ZXMuXG5cdFx0Y29uc3QgaXNGb2xkZXJFeGNsdWRlZCA9IChwYXRoOiBzdHJpbmcsIGJhc2VuYW1lOiBzdHJpbmcsIGhhc1NpYmxpbmc6IChxdWVyeTogc3RyaW5nKSA9PiBib29sZWFuKSA9PiB7XG5cdFx0XHRwYXRoID0gcGF0aC5zbGljZSgxKTtcblx0XHRcdGlmIChldmFsRm9sZGVyRXhjbHVkZXMocGF0aCwgYmFzZW5hbWUsIGhhc1NpYmxpbmcpKSB7IHJldHVybiB0cnVlOyB9XG5cdFx0XHRpZiAocGF0aEV4Y2x1ZGVkSW5RdWVyeShxdWVyeVByb3BzLCBwYXRoKSkgeyByZXR1cm4gdHJ1ZTsgfVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH07XG5cblx0XHQvLyBGb3IgZmlsZXMgZW5zdXJlIHRoZSBmdWxsIGNoZWNrIHRha2VzIHBsYWNlLlxuXHRcdGNvbnN0IGlzRmlsZUluY2x1ZGVkID0gKHBhdGg6IHN0cmluZywgYmFzZW5hbWU6IHN0cmluZywgaGFzU2libGluZzogKHF1ZXJ5OiBzdHJpbmcpID0+IGJvb2xlYW4pID0+IHtcblx0XHRcdHBhdGggPSBwYXRoLnNsaWNlKDEpO1xuXHRcdFx0aWYgKGV2YWxGb2xkZXJFeGNsdWRlcyhwYXRoLCBiYXNlbmFtZSwgaGFzU2libGluZykpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0XHRpZiAoIXBhdGhJbmNsdWRlZEluUXVlcnkocXVlcnlQcm9wcywgcGF0aCwgZXh0VXJpKSkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH07XG5cblx0XHRjb25zdCBwcm9jZXNzRmlsZSA9IChmaWxlOiBGaWxlU3lzdGVtRmlsZUhhbmRsZSwgcHJpb3I6IHN0cmluZyk6IEZpbGVOb2RlID0+IHtcblxuXHRcdFx0Y29uc3QgcmVzb2x2ZWQ6IEZpbGVOb2RlID0ge1xuXHRcdFx0XHR0eXBlOiAnZmlsZScsXG5cdFx0XHRcdG5hbWU6IGZpbGUubmFtZSxcblx0XHRcdFx0cGF0aDogcHJpb3IsXG5cdFx0XHRcdHJlc29sdmU6ICgpID0+IGZpbGUuZ2V0RmlsZSgpLnRoZW4ociA9PiByLmFycmF5QnVmZmVyKCkpXG5cdFx0XHR9IGFzIGNvbnN0O1xuXG5cdFx0XHRyZXR1cm4gcmVzb2x2ZWQ7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGlzRmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZSA9IChoYW5kbGU6IElXb3JrZXJGaWxlU3lzdGVtSGFuZGxlKTogaGFuZGxlIGlzIEZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGUgPT4ge1xuXHRcdFx0cmV0dXJuIGhhbmRsZS5raW5kID09PSAnZGlyZWN0b3J5Jztcblx0XHR9O1xuXG5cdFx0Y29uc3QgaXNGaWxlU3lzdGVtRmlsZUhhbmRsZSA9IChoYW5kbGU6IElXb3JrZXJGaWxlU3lzdGVtSGFuZGxlKTogaGFuZGxlIGlzIEZpbGVTeXN0ZW1GaWxlSGFuZGxlID0+IHtcblx0XHRcdHJldHVybiBoYW5kbGUua2luZCA9PT0gJ2ZpbGUnO1xuXHRcdH07XG5cblx0XHRjb25zdCBwcm9jZXNzRGlyZWN0b3J5ID0gYXN5bmMgKGRpcmVjdG9yeTogSVdvcmtlckZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGUsIHByaW9yOiBzdHJpbmcsIGlnbm9yZUZpbGU/OiBJZ25vcmVGaWxlKTogUHJvbWlzZTxEaXJOb2RlPiA9PiB7XG5cblx0XHRcdGlmICghZm9sZGVyUXVlcnkuZGlzcmVnYXJkSWdub3JlRmlsZXMpIHtcblx0XHRcdFx0Y29uc3QgaWdub3JlRmlsZXMgPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdFx0ZGlyZWN0b3J5LmdldEZpbGVIYW5kbGUoJy5naXRpZ25vcmUnKS5jYXRjaChlID0+IHVuZGVmaW5lZCksXG5cdFx0XHRcdFx0ZGlyZWN0b3J5LmdldEZpbGVIYW5kbGUoJy5pZ25vcmUnKS5jYXRjaChlID0+IHVuZGVmaW5lZCksXG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGlnbm9yZUZpbGVzLm1hcChhc3luYyBmaWxlID0+IHtcblx0XHRcdFx0XHRpZiAoIWZpbGUpIHsgcmV0dXJuOyB9XG5cblx0XHRcdFx0XHRjb25zdCBpZ25vcmVDb250ZW50cyA9IG5ldyBUZXh0RGVjb2RlcigndXRmOCcpLmRlY29kZShuZXcgVWludDhBcnJheShhd2FpdCAoYXdhaXQgZmlsZS5nZXRGaWxlKCkpLmFycmF5QnVmZmVyKCkpKTtcblx0XHRcdFx0XHRpZ25vcmVGaWxlID0gbmV3IElnbm9yZUZpbGUoaWdub3JlQ29udGVudHMsIHByaW9yLCBpZ25vcmVGaWxlLCBpZ25vcmVHbG9iQ2FzZSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZW50cmllcyA9IFByb21pc2VzLndpdGhBc3luY0JvZHk8KEZpbGVOb2RlIHwgRGlyTm9kZSlbXT4oYXN5bmMgYyA9PiB7XG5cdFx0XHRcdGNvbnN0IGZpbGVzOiBGaWxlTm9kZVtdID0gW107XG5cdFx0XHRcdGNvbnN0IGRpcnM6IFByb21pc2U8RGlyTm9kZT5bXSA9IFtdO1xuXG5cdFx0XHRcdGNvbnN0IGVudHJpZXM6IFtzdHJpbmcsIElXb3JrZXJGaWxlU3lzdGVtSGFuZGxlXVtdID0gW107XG5cdFx0XHRcdGNvbnN0IHNpYmlsaW5ncyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0XHRcdGZvciBhd2FpdCAoY29uc3QgZW50cnkgb2YgZGlyZWN0b3J5LmVudHJpZXMoKSkge1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaChlbnRyeSk7XG5cdFx0XHRcdFx0c2liaWxpbmdzLmFkZChlbnRyeVswXSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRmb3IgKGNvbnN0IFtiYXNlbmFtZSwgaGFuZGxlXSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBwYXRoID0gcHJpb3IgKyBiYXNlbmFtZTtcblxuXHRcdFx0XHRcdGlmIChpZ25vcmVGaWxlICYmICFpZ25vcmVGaWxlLmlzUGF0aEluY2x1ZGVkSW5UcmF2ZXJzYWwocGF0aCwgaGFuZGxlLmtpbmQgPT09ICdkaXJlY3RvcnknKSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgaGFzU2libGluZyA9IChxdWVyeTogc3RyaW5nKSA9PiBzaWJpbGluZ3MuaGFzKHF1ZXJ5KTtcblxuXHRcdFx0XHRcdGlmIChpc0ZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGUoaGFuZGxlKSAmJiAhaXNGb2xkZXJFeGNsdWRlZChwYXRoLCBiYXNlbmFtZSwgaGFzU2libGluZykpIHtcblx0XHRcdFx0XHRcdGRpcnMucHVzaChwcm9jZXNzRGlyZWN0b3J5KGhhbmRsZSwgcGF0aCArICcvJywgaWdub3JlRmlsZSkpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNGaWxlU3lzdGVtRmlsZUhhbmRsZShoYW5kbGUpICYmIGlzRmlsZUluY2x1ZGVkKHBhdGgsIGJhc2VuYW1lLCBoYXNTaWJsaW5nKSkge1xuXHRcdFx0XHRcdFx0ZmlsZXMucHVzaChwcm9jZXNzRmlsZShoYW5kbGUsIHBhdGgpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YyhbLi4uYXdhaXQgUHJvbWlzZS5hbGwoZGlycyksIC4uLmZpbGVzXSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogJ2RpcicsXG5cdFx0XHRcdG5hbWU6IGRpcmVjdG9yeS5uYW1lLFxuXHRcdFx0XHRlbnRyaWVzXG5cdFx0XHR9O1xuXHRcdH07XG5cblx0XHRjb25zdCByZXNvbHZlRGlyZWN0b3J5ID0gYXN5bmMgKGRpcmVjdG9yeTogRGlyTm9kZSwgb25GaWxlOiAoZjogRmlsZU5vZGUpID0+IFByb21pc2U8dW5rbm93bj4gfCB1bmtub3duKSA9PiB7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHsgcmV0dXJuOyB9XG5cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFxuXHRcdFx0XHQoYXdhaXQgZGlyZWN0b3J5LmVudHJpZXMpXG5cdFx0XHRcdFx0LnNvcnQoKGEsIGIpID0+IC0oYS50eXBlID09PSAnZGlyJyA/IDAgOiAxKSArIChiLnR5cGUgPT09ICdkaXInID8gMCA6IDEpKVxuXHRcdFx0XHRcdC5tYXAoYXN5bmMgZW50cnkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGVudHJ5LnR5cGUgPT09ICdkaXInKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiByZXNvbHZlRGlyZWN0b3J5KGVudHJ5LCBvbkZpbGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBvbkZpbGUoZW50cnkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcHJvY2Vzc2VkID0gYXdhaXQgdGltZSgncHJvY2VzcycsICgpID0+IHByb2Nlc3NEaXJlY3RvcnkoaGFuZGxlLCAnLycpKTtcblx0XHRhd2FpdCB0aW1lKCdyZXNvbHZlJywgKCkgPT4gcmVzb2x2ZURpcmVjdG9yeShwcm9jZXNzZWQsIG9uRmlsZSkpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVNlYXJjaFJlZ0V4cChvcHRpb25zOiBJUGF0dGVybkluZm8pOiBSZWdFeHAge1xuXHRyZXR1cm4gY3JlYXRlUmVnRXhwKG9wdGlvbnMucGF0dGVybiwgISFvcHRpb25zLmlzUmVnRXhwLCB7XG5cdFx0d2hvbGVXb3JkOiBvcHRpb25zLmlzV29yZE1hdGNoLFxuXHRcdGdsb2JhbDogdHJ1ZSxcblx0XHRtYXRjaENhc2U6IG9wdGlvbnMuaXNDYXNlU2Vuc2l0aXZlLFxuXHRcdG11bHRpbGluZTogdHJ1ZSxcblx0XHR1bmljb2RlOiB0cnVlLFxuXHR9KTtcbn1cblxuZnVuY3Rpb24gcmV2aXZlRm9sZGVyUXVlcnkoZm9sZGVyUXVlcnk6IElGb2xkZXJRdWVyeTxVcmlDb21wb25lbnRzPik6IElGb2xkZXJRdWVyeTxVUkk+IHtcblx0Ly8gQHRvZG86IGFuZHJlYSAtIHRyeSB0byBzZWUgd2h5IHdlIGNhbid0IGp1c3QgY2FsbCAncmV2aXZlJyBoZXJlXG5cdHJldHVybiByZXZpdmUoe1xuXHRcdC4uLnJldml2ZShmb2xkZXJRdWVyeSksXG5cdFx0ZXhjbHVkZVBhdHRlcm46IGZvbGRlclF1ZXJ5LmV4Y2x1ZGVQYXR0ZXJuPy5tYXAoZXAgPT4gKHsgZm9sZGVyOiBVUkkucmV2aXZlKGVwLmZvbGRlciksIHBhdHRlcm46IGVwLnBhdHRlcm4gfSkpLFxuXHRcdGZvbGRlcjogVVJJLnJldml2ZShmb2xkZXJRdWVyeS5mb2xkZXIpLFxuXHR9KTtcbn1cblxuZnVuY3Rpb24gcmV2aXZlUXVlcnlQcm9wcyhxdWVyeVByb3BzOiBJQ29tbW9uUXVlcnlQcm9wczxVcmlDb21wb25lbnRzPik6IElDb21tb25RdWVyeVByb3BzPFVSST4ge1xuXHRyZXR1cm4ge1xuXHRcdC4uLnF1ZXJ5UHJvcHMsXG5cdFx0ZXh0cmFGaWxlUmVzb3VyY2VzOiBxdWVyeVByb3BzLmV4dHJhRmlsZVJlc291cmNlcz8ubWFwKHIgPT4gVVJJLnJldml2ZShyKSksXG5cdFx0Zm9sZGVyUXVlcmllczogcXVlcnlQcm9wcy5mb2xkZXJRdWVyaWVzLm1hcChmcSA9PiByZXZpdmVGb2xkZXJRdWVyeShmcSkpLFxuXHR9O1xufVxuXG5cbmZ1bmN0aW9uIHBhdGhFeGNsdWRlZEluUXVlcnkocXVlcnlQcm9wczogSUNvbW1vblF1ZXJ5UHJvcHM8VVJJPiwgZnNQYXRoOiBzdHJpbmcpOiBib29sZWFuIHtcblx0Y29uc3QgZ2xvYk9wdGlvbnMgPSBxdWVyeVByb3BzLmlnbm9yZUdsb2JDYXNlID8geyBpZ25vcmVDYXNlOiB0cnVlIH0gOiB1bmRlZmluZWQ7XG5cdGlmIChxdWVyeVByb3BzLmV4Y2x1ZGVQYXR0ZXJuICYmIGdsb2IubWF0Y2gocXVlcnlQcm9wcy5leGNsdWRlUGF0dGVybiwgZnNQYXRoLCBnbG9iT3B0aW9ucykpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIHBhdGhJbmNsdWRlZEluUXVlcnkocXVlcnlQcm9wczogSUNvbW1vblF1ZXJ5UHJvcHM8VVJJPiwgcGF0aDogc3RyaW5nLCBleHRVcmk6IEV4dFVyaSk6IGJvb2xlYW4ge1xuXHRjb25zdCBnbG9iT3B0aW9ucyA9IHF1ZXJ5UHJvcHMuaWdub3JlR2xvYkNhc2UgPyB7IGlnbm9yZUNhc2U6IHRydWUgfSA6IHVuZGVmaW5lZDtcblx0aWYgKHF1ZXJ5UHJvcHMuZXhjbHVkZVBhdHRlcm4gJiYgZ2xvYi5tYXRjaChxdWVyeVByb3BzLmV4Y2x1ZGVQYXR0ZXJuLCBwYXRoLCBnbG9iT3B0aW9ucykpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpZiAocXVlcnlQcm9wcy5pbmNsdWRlUGF0dGVybiB8fCBxdWVyeVByb3BzLnVzaW5nU2VhcmNoUGF0aHMpIHtcblx0XHRpZiAocXVlcnlQcm9wcy5pbmNsdWRlUGF0dGVybiAmJiBnbG9iLm1hdGNoKHF1ZXJ5UHJvcHMuaW5jbHVkZVBhdHRlcm4sIHBhdGgsIGdsb2JPcHRpb25zKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgc2VhcmNoUGF0aHMgYXJlIGJlaW5nIHVzZWQsIHRoZSBleHRyYSBmaWxlIG11c3QgYmUgaW4gYSBzdWJmb2xkZXIgYW5kIG1hdGNoIHRoZSBwYXR0ZXJuLCBpZiBwcmVzZW50XG5cdFx0aWYgKHF1ZXJ5UHJvcHMudXNpbmdTZWFyY2hQYXRocykge1xuXG5cdFx0XHRyZXR1cm4gISFxdWVyeVByb3BzLmZvbGRlclF1ZXJpZXMgJiYgcXVlcnlQcm9wcy5mb2xkZXJRdWVyaWVzLnNvbWUoZnEgPT4ge1xuXHRcdFx0XHRjb25zdCBzZWFyY2hQYXRoID0gZnEuZm9sZGVyO1xuXHRcdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZShwYXRoKTtcblx0XHRcdFx0aWYgKGV4dFVyaS5pc0VxdWFsT3JQYXJlbnQodXJpLCBzZWFyY2hQYXRoKSkge1xuXHRcdFx0XHRcdGNvbnN0IHJlbFBhdGggPSBwYXRocy5yZWxhdGl2ZShzZWFyY2hQYXRoLnBhdGgsIHVyaS5wYXRoKTtcblx0XHRcdFx0XHRyZXR1cm4gIWZxLmluY2x1ZGVQYXR0ZXJuIHx8ICEhZ2xvYi5tYXRjaChmcS5pbmNsdWRlUGF0dGVybiwgcmVsUGF0aCwgZ2xvYk9wdGlvbnMpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cmV0dXJuIHRydWU7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFVBQVU7QUFDdEIsU0FBd0IsV0FBVztBQUVuQyxTQUFpQyxpQ0FBa0o7QUFFbkwsWUFBWSxXQUFXO0FBQ3ZCLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxjQUFjO0FBRXZCLE1BQU0sT0FBTztBQWViLE1BQU0sY0FBYyxDQUFDLG9CQUFJLEtBQUs7QUFD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SSxXQUFXLGtCQUFrQixXQUFXLGtCQUFrQjtBQUM3RCxRQUFJLFdBQVcsa0JBQWtCLEtBQUssTUFBTSxXQUFXLGdCQUFnQixNQUFNLFdBQVcsR0FBRztBQUMxRixhQUFPO0FBQUEsSUFDUjtBQUdBLFFBQUksV0FBVyxrQkFBa0I7QUFFaEMsYUFBTyxDQUFDLENBQUMsV0FBVyxpQkFBaUIsV0FBVyxjQUFjLEtBQUssUUFBTTtBQUN4RSxjQUFNLGFBQWEsR0FBRztBQUN0QixjQUFNLE1BQU0sSUFBSSxLQUFLLElBQUk7QUFDekIsWUFBSSxPQUFPLGdCQUFnQixLQUFLLFVBQVUsR0FBRztBQUM1QyxnQkFBTSxVQUFVLE1BQU0sU0FBUyxXQUFXLE1BQU0sSUFBSSxJQUFJO0FBQ3hELGlCQUFPLENBQUMsR0FBRyxrQkFBa0IsQ0FBQyxDQUFDLEtBQUssTUFBTSxHQUFHLGdCQUFnQixTQUFTLFdBQVc7QUFBQSxRQUNsRixPQUFPO0FBQ04saUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBRUEsU0FBTztBQUNSOyIsCiAgIm5hbWVzIjogWyJoYW5kbGUiLCAiZW50cmllcyIsICJvbkZpbGUiXQp9Cg==
