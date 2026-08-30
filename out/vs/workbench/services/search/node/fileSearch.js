import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "../../../../base/common/path.js";
import { StringDecoder } from "string_decoder";
import * as arrays from "../../../../base/common/arrays.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import * as glob from "../../../../base/common/glob.js";
import * as normalization from "../../../../base/common/normalization.js";
import { isEqualOrParent } from "../../../../base/common/extpath.js";
import * as platform from "../../../../base/common/platform.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import * as strings from "../../../../base/common/strings.js";
import * as types from "../../../../base/common/types.js";
import { Promises } from "../../../../base/node/pfs.js";
import { isFilePatternMatch, hasSiblingFn } from "../common/search.js";
import { spawnRipgrepCmd } from "./ripgrepFileSearch.js";
import { prepareQuery } from "../../../../base/common/fuzzyScorer.js";
const killCmds = /* @__PURE__ */ new Set();
process.on("exit", () => {
  killCmds.forEach((cmd) => cmd());
});
class FileWalker {
  constructor(config) {
    this.normalizedFilePatternLowercase = null;
    this.maxFilesize = null;
    this.isCanceled = false;
    this.fileWalkSW = null;
    this.cmdSW = null;
    this.cmdResultCount = 0;
    this.config = config;
    this.filePattern = config.filePattern || "";
    const globOptions = config.ignoreGlobCase ? { ignoreCase: true } : void 0;
    this.includePattern = config.includePattern && glob.parse(config.includePattern, globOptions);
    this.maxResults = config.maxResults || null;
    this.exists = !!config.exists;
    this.walkedPaths = /* @__PURE__ */ Object.create(null);
    this.resultCount = 0;
    this.isLimitHit = false;
    this.directoriesWalked = 0;
    this.filesWalked = 0;
    this.errors = [];
    if (this.filePattern) {
      this.normalizedFilePatternLowercase = config.shouldGlobMatchFilePattern ? null : prepareQuery(this.filePattern).normalizedLowercase;
    }
    this.globalExcludePattern = config.excludePattern && glob.parse(config.excludePattern, globOptions);
    this.folderExcludePatterns = /* @__PURE__ */ new Map();
    config.folderQueries.forEach((folderQuery) => {
      const folderExcludeExpression = {};
      folderQuery.excludePattern?.forEach((excludePattern) => {
        Object.assign(folderExcludeExpression, excludePattern.pattern || {}, this.config.excludePattern || {});
      });
      if (!folderQuery.excludePattern?.length) {
        Object.assign(folderExcludeExpression, this.config.excludePattern || {});
      }
      const fqPath = folderQuery.folder.fsPath;
      config.folderQueries.map((rootFolderQuery) => rootFolderQuery.folder.fsPath).filter((rootFolder) => rootFolder !== fqPath).forEach((otherRootFolder) => {
        if (isEqualOrParent(otherRootFolder, fqPath, config.ignoreGlobCase)) {
          folderExcludeExpression[path.relative(fqPath, otherRootFolder)] = true;
        }
      });
      this.folderExcludePatterns.set(fqPath, new AbsoluteAndRelativeParsedExpression(folderExcludeExpression, fqPath, config.ignoreGlobCase));
    });
  }
  cancel() {
    this.isCanceled = true;
    killCmds.forEach((cmd) => cmd());
  }
  walk(folderQueries, extraFiles, numThreads, onResult, onMessage, done) {
    this.fileWalkSW = StopWatch.create(false);
    if (this.isCanceled) {
      return done(null, this.isLimitHit);
    }
    extraFiles.forEach((extraFilePath) => {
      const basename = path.basename(extraFilePath.fsPath);
      if (this.globalExcludePattern && this.globalExcludePattern(extraFilePath.fsPath, basename)) {
        return;
      }
      this.matchFile(onResult, { relativePath: extraFilePath.fsPath, searchPath: void 0 });
    });
    this.cmdSW = StopWatch.create(false);
    this.parallel(folderQueries, (folderQuery, rootFolderDone) => {
      this.call(this.cmdTraversal, this, folderQuery, numThreads, onResult, onMessage, (err) => {
        if (err) {
          const errorMessage = toErrorMessage(err);
          console.error(errorMessage);
          this.errors.push(errorMessage);
          rootFolderDone(err, void 0);
        } else {
          rootFolderDone(null, void 0);
        }
      });
    }, (errors, _result) => {
      this.fileWalkSW.stop();
      const err = errors ? arrays.coalesce(errors)[0] : null;
      done(err, this.isLimitHit);
    });
  }
  parallel(list, fn, callback) {
    const results = new Array(list.length);
    const errors = new Array(list.length);
    let didErrorOccur = false;
    let doneCount = 0;
    if (list.length === 0) {
      return callback(null, []);
    }
    list.forEach((item, index) => {
      fn(item, (error, result) => {
        if (error) {
          didErrorOccur = true;
          results[index] = null;
          errors[index] = error;
        } else {
          results[index] = result;
          errors[index] = null;
        }
        if (++doneCount === list.length) {
          return callback(didErrorOccur ? errors : null, results);
        }
      });
    });
  }
  call(fun, that, ...args) {
    try {
      fun.apply(that, args);
    } catch (e) {
      args[args.length - 1](e);
    }
  }
  async cmdTraversal(folderQuery, numThreads, onResult, onMessage, cb) {
    const rootFolder = folderQuery.folder.fsPath;
    const isMac = platform.isMacintosh;
    const killCmd = () => cmd && cmd.kill();
    killCmds.add(killCmd);
    let done = (err) => {
      killCmds.delete(killCmd);
      done = () => {
      };
      cb(err);
    };
    let leftover = "";
    const tree = this.initDirectoryTree();
    let ripgrep;
    try {
      ripgrep = await spawnRipgrepCmd(this.config, folderQuery, this.config.includePattern, this.folderExcludePatterns.get(folderQuery.folder.fsPath).expression, numThreads);
    } catch (err) {
      done(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    const cmd = ripgrep.cmd;
    const noSiblingsClauses = !Object.keys(ripgrep.siblingClauses).length;
    const escapedArgs = ripgrep.rgArgs.args.map((arg) => arg.match(/^-/) ? arg : `'${arg}'`).join(" ");
    let rgCmd = `${ripgrep.rgDiskPath} ${escapedArgs}
 - cwd: ${ripgrep.cwd}`;
    if (ripgrep.rgArgs.siblingClauses) {
      rgCmd += `
 - Sibling clauses: ${JSON.stringify(ripgrep.rgArgs.siblingClauses)}`;
    }
    onMessage({ message: rgCmd });
    this.cmdResultCount = 0;
    this.collectStdout(cmd, "utf8", onMessage, (err, stdout, last) => {
      if (err) {
        done(err);
        return;
      }
      if (this.isLimitHit) {
        done();
        return;
      }
      const normalized = leftover + (isMac ? normalization.normalizeNFC(stdout || "") : stdout);
      const relativeFiles = normalized.split("\n");
      if (last) {
        const n = relativeFiles.length;
        relativeFiles[n - 1] = relativeFiles[n - 1].trim();
        if (!relativeFiles[n - 1]) {
          relativeFiles.pop();
        }
      } else {
        leftover = relativeFiles.pop() || "";
      }
      if (relativeFiles.length && relativeFiles[0].indexOf("\n") !== -1) {
        done(new Error("Splitting up files failed"));
        return;
      }
      this.cmdResultCount += relativeFiles.length;
      if (noSiblingsClauses) {
        for (const relativePath of relativeFiles) {
          this.matchFile(onResult, { base: rootFolder, relativePath, searchPath: this.getSearchPath(folderQuery, relativePath) });
          if (this.isLimitHit) {
            killCmd();
            break;
          }
        }
        if (last || this.isLimitHit) {
          done();
        }
        return;
      }
      this.addDirectoryEntries(folderQuery, tree, rootFolder, relativeFiles, onResult);
      if (last) {
        this.matchDirectoryTree(tree, rootFolder, onResult);
        done();
      }
    });
  }
  /**
   * Public for testing.
   */
  spawnFindCmd(folderQuery) {
    const excludePattern = this.folderExcludePatterns.get(folderQuery.folder.fsPath);
    const basenames = excludePattern.getBasenameTerms();
    const pathTerms = excludePattern.getPathTerms();
    const args = ["-L", "."];
    if (basenames.length || pathTerms.length) {
      args.push("-not", "(", "(");
      for (const basename of basenames) {
        args.push("-name", basename);
        args.push("-o");
      }
      for (const path2 of pathTerms) {
        args.push("-path", path2);
        args.push("-o");
      }
      args.pop();
      args.push(")", "-prune", ")");
    }
    args.push("-type", "f");
    return childProcess.spawn("find", args, { cwd: folderQuery.folder.fsPath });
  }
  /**
   * Public for testing.
   */
  readStdout(cmd, encoding, cb) {
    let all = "";
    this.collectStdout(cmd, encoding, () => {
    }, (err, stdout, last) => {
      if (err) {
        cb(err);
        return;
      }
      all += stdout;
      if (last) {
        cb(null, all);
      }
    });
  }
  collectStdout(cmd, encoding, onMessage, cb) {
    let onData = (err, stdout, last) => {
      if (err || last) {
        onData = () => {
        };
        this.cmdSW?.stop();
      }
      cb(err, stdout, last);
    };
    let gotData = false;
    if (cmd.stdout) {
      this.forwardData(cmd.stdout, encoding, onData);
      cmd.stdout.once("data", () => gotData = true);
    } else {
      onMessage({ message: "stdout is null" });
    }
    let stderr;
    if (cmd.stderr) {
      stderr = this.collectData(cmd.stderr);
    } else {
      onMessage({ message: "stderr is null" });
    }
    cmd.on("error", (err) => {
      onData(err);
    });
    cmd.on("close", (code) => {
      let stderrText;
      if (!gotData && (stderrText = this.decodeData(stderr, encoding)) && rgErrorMsgForDisplay(stderrText)) {
        onData(new Error(`command failed with error code ${code}: ${this.decodeData(stderr, encoding)}`));
      } else {
        if (this.exists && code === 0) {
          this.isLimitHit = true;
        }
        onData(null, "", true);
      }
    });
  }
  forwardData(stream, encoding, cb) {
    const decoder = new StringDecoder(encoding);
    stream.on("data", (data) => {
      cb(null, decoder.write(data));
    });
    return decoder;
  }
  collectData(stream) {
    const buffers = [];
    stream.on("data", (data) => {
      buffers.push(data);
    });
    return buffers;
  }
  decodeData(buffers, encoding) {
    const decoder = new StringDecoder(encoding);
    return buffers.map((buffer) => decoder.write(buffer)).join("");
  }
  initDirectoryTree() {
    const tree = {
      rootEntries: [],
      pathToEntries: /* @__PURE__ */ Object.create(null)
    };
    tree.pathToEntries["."] = tree.rootEntries;
    return tree;
  }
  addDirectoryEntries(folderQuery, { pathToEntries }, base, relativeFiles, onResult) {
    const filePatternMatch = this.filePattern && relativeFiles.find((f) => strings.equals(f, this.filePattern, this.config.ignoreGlobCase));
    if (filePatternMatch) {
      this.matchFile(onResult, {
        base,
        relativePath: filePatternMatch,
        searchPath: this.getSearchPath(folderQuery, filePatternMatch)
      });
    }
    const add = (relativePath) => {
      const basename = path.basename(relativePath);
      const dirname = path.dirname(relativePath);
      let entries = pathToEntries[dirname];
      if (!entries) {
        entries = pathToEntries[dirname] = [];
        add(dirname);
      }
      entries.push({
        base,
        relativePath,
        basename,
        searchPath: this.getSearchPath(folderQuery, relativePath)
      });
    };
    relativeFiles.forEach(add);
  }
  matchDirectoryTree({ rootEntries, pathToEntries }, rootFolder, onResult) {
    const self = this;
    const excludePattern = this.folderExcludePatterns.get(rootFolder);
    const filePattern = this.filePattern;
    const ignoreGlobCase = this.config.ignoreGlobCase;
    function matchDirectory(entries) {
      self.directoriesWalked++;
      const hasSibling = hasSiblingFn(() => entries.map((entry) => entry.basename));
      for (let i = 0, n = entries.length; i < n; i++) {
        const entry = entries[i];
        const { relativePath, basename } = entry;
        if (excludePattern.test(relativePath, basename, !strings.equals(filePattern, basename, ignoreGlobCase) ? hasSibling : void 0)) {
          continue;
        }
        const sub = pathToEntries[relativePath];
        if (sub) {
          matchDirectory(sub);
        } else {
          self.filesWalked++;
          if (strings.equals(relativePath, filePattern, ignoreGlobCase)) {
            continue;
          }
          self.matchFile(onResult, entry);
        }
        if (self.isLimitHit) {
          break;
        }
      }
    }
    matchDirectory(rootEntries);
  }
  getStats() {
    return {
      cmdTime: this.cmdSW.elapsed(),
      fileWalkTime: this.fileWalkSW.elapsed(),
      directoriesWalked: this.directoriesWalked,
      filesWalked: this.filesWalked,
      cmdResultCount: this.cmdResultCount
    };
  }
  doWalk(folderQuery, relativeParentPath, files, onResult, done) {
    const rootFolder = folderQuery.folder;
    const hasSibling = hasSiblingFn(() => files);
    this.parallel(files, (file, clb) => {
      if (this.isCanceled || this.isLimitHit) {
        return clb(null);
      }
      const currentRelativePath = relativeParentPath ? [relativeParentPath, file].join(path.sep) : file;
      if (this.folderExcludePatterns.get(folderQuery.folder.fsPath).test(currentRelativePath, file, !strings.equals(this.config.filePattern, file, this.config.ignoreGlobCase) ? hasSibling : void 0)) {
        return clb(null);
      }
      const currentAbsolutePath = [rootFolder.fsPath, currentRelativePath].join(path.sep);
      fs.lstat(currentAbsolutePath, (error, lstat) => {
        if (error || this.isCanceled || this.isLimitHit) {
          return clb(null);
        }
        this.statLinkIfNeeded(currentAbsolutePath, lstat, (error2, stat) => {
          if (error2 || this.isCanceled || this.isLimitHit) {
            return clb(null);
          }
          if (stat.isDirectory()) {
            this.directoriesWalked++;
            return this.realPathIfNeeded(currentAbsolutePath, lstat, (error3, realpath) => {
              if (error3 || this.isCanceled || this.isLimitHit) {
                return clb(null);
              }
              realpath = realpath || "";
              if (this.walkedPaths[realpath]) {
                return clb(null);
              }
              this.walkedPaths[realpath] = true;
              return Promises.readdir(currentAbsolutePath).then((children) => {
                if (this.isCanceled || this.isLimitHit) {
                  return clb(null);
                }
                this.doWalk(folderQuery, currentRelativePath, children, onResult, (err) => clb(err || null));
              }, (error4) => {
                clb(null);
              });
            });
          } else {
            this.filesWalked++;
            if (strings.equals(currentRelativePath, this.filePattern, this.config.ignoreGlobCase)) {
              return clb(null, void 0);
            }
            if (this.maxFilesize && types.isNumber(stat.size) && stat.size > this.maxFilesize) {
              return clb(null, void 0);
            }
            this.matchFile(onResult, {
              base: rootFolder.fsPath,
              relativePath: currentRelativePath,
              searchPath: this.getSearchPath(folderQuery, currentRelativePath)
            });
          }
          return clb(null, void 0);
        });
      });
    }, (error) => {
      const filteredErrors = error ? arrays.coalesce(error) : error;
      return done(filteredErrors && filteredErrors.length > 0 ? filteredErrors[0] : void 0);
    });
  }
  matchFile(onResult, candidate) {
    if (this.isFileMatch(candidate) && (!this.includePattern || this.includePattern(candidate.relativePath, path.basename(candidate.relativePath)))) {
      this.resultCount++;
      if (this.exists || this.maxResults && this.resultCount > this.maxResults) {
        this.isLimitHit = true;
      }
      if (!this.isLimitHit) {
        onResult(candidate);
      }
    }
  }
  isFileMatch(candidate) {
    if (this.filePattern) {
      if (this.filePattern === "*") {
        return true;
      }
      if (this.normalizedFilePatternLowercase) {
        return isFilePatternMatch(candidate, this.normalizedFilePatternLowercase);
      } else if (this.filePattern) {
        return isFilePatternMatch(candidate, this.filePattern, false, this.config.ignoreGlobCase);
      }
    }
    return true;
  }
  statLinkIfNeeded(path2, lstat, clb) {
    if (lstat.isSymbolicLink()) {
      return fs.stat(path2, clb);
    }
    return clb(null, lstat);
  }
  realPathIfNeeded(path2, lstat, clb) {
    if (lstat.isSymbolicLink()) {
      return fs.realpath(path2, (error, realpath) => {
        if (error) {
          return clb(error);
        }
        return clb(null, realpath);
      });
    }
    return clb(null, path2);
  }
  /**
   * If we're searching for files in multiple workspace folders, then better prepend the
   * name of the workspace folder to the path of the file. This way we'll be able to
   * better filter files that are all on the top of a workspace folder and have all the
   * same name. A typical example are `package.json` or `README.md` files.
   */
  getSearchPath(folderQuery, relativePath) {
    if (folderQuery.folderName) {
      return path.join(folderQuery.folderName, relativePath);
    }
    return relativePath;
  }
}
class Engine {
  constructor(config, numThreads) {
    this.folderQueries = config.folderQueries;
    this.extraFiles = config.extraFileResources || [];
    this.numThreads = numThreads;
    this.walker = new FileWalker(config);
  }
  search(onResult, onProgress, done) {
    this.walker.walk(this.folderQueries, this.extraFiles, this.numThreads, onResult, onProgress, (err, isLimitHit) => {
      done(err, {
        limitHit: isLimitHit,
        stats: this.walker.getStats(),
        messages: []
      });
    });
  }
  cancel() {
    this.walker.cancel();
  }
}
class AbsoluteAndRelativeParsedExpression {
  constructor(expression, root, ignoreCase) {
    this.expression = expression;
    this.root = root;
    this.ignoreCase = ignoreCase;
    this.init(expression);
  }
  /**
   * Split the IExpression into its absolute and relative components, and glob.parse them separately.
   */
  init(expr) {
    let absoluteGlobExpr;
    let relativeGlobExpr;
    Object.keys(expr).filter((key) => expr[key]).forEach((key) => {
      if (path.isAbsolute(key)) {
        absoluteGlobExpr = absoluteGlobExpr || glob.getEmptyExpression();
        absoluteGlobExpr[key] = expr[key];
      } else {
        relativeGlobExpr = relativeGlobExpr || glob.getEmptyExpression();
        relativeGlobExpr[key] = expr[key];
      }
    });
    const globOptions = { trimForExclusions: true, ignoreCase: this.ignoreCase };
    this.absoluteParsedExpr = absoluteGlobExpr && glob.parse(absoluteGlobExpr, globOptions);
    this.relativeParsedExpr = relativeGlobExpr && glob.parse(relativeGlobExpr, globOptions);
  }
  test(_path, basename, hasSibling) {
    return this.relativeParsedExpr && this.relativeParsedExpr(_path, basename, hasSibling) || this.absoluteParsedExpr && this.absoluteParsedExpr(path.join(this.root, _path), basename, hasSibling);
  }
  getBasenameTerms() {
    const basenameTerms = [];
    if (this.absoluteParsedExpr) {
      basenameTerms.push(...glob.getBasenameTerms(this.absoluteParsedExpr));
    }
    if (this.relativeParsedExpr) {
      basenameTerms.push(...glob.getBasenameTerms(this.relativeParsedExpr));
    }
    return basenameTerms;
  }
  getPathTerms() {
    const pathTerms = [];
    if (this.absoluteParsedExpr) {
      pathTerms.push(...glob.getPathTerms(this.absoluteParsedExpr));
    }
    if (this.relativeParsedExpr) {
      pathTerms.push(...glob.getPathTerms(this.relativeParsedExpr));
    }
    return pathTerms;
  }
}
function rgErrorMsgForDisplay(msg) {
  const lines = msg.trim().split("\n");
  const firstLine = lines[0].trim();
  if (firstLine.startsWith("Error parsing regex")) {
    return firstLine;
  }
  if (firstLine.startsWith("regex parse error")) {
    return strings.uppercaseFirstLetter(lines[lines.length - 1].trim());
  }
  if (firstLine.startsWith("error parsing glob") || firstLine.startsWith("unsupported encoding")) {
    return firstLine.charAt(0).toUpperCase() + firstLine.substr(1);
  }
  if (firstLine === `Literal '\\n' not allowed.`) {
    return `Literal '\\n' currently not supported`;
  }
  if (firstLine.startsWith("Literal ")) {
    return firstLine;
  }
  return void 0;
}
export {
  Engine,
  FileWalker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxzZWFyY2hcXG5vZGVcXGZpbGVTZWFyY2gudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBjaGlsZFByb2Nlc3MgZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgUmVhZGFibGUgfSBmcm9tICdzdHJlYW0nO1xuaW1wb3J0IHsgU3RyaW5nRGVjb2RlciB9IGZyb20gJ3N0cmluZ19kZWNvZGVyJztcbmltcG9ydCAqIGFzIGFycmF5cyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0ICogYXMgZ2xvYiBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCAqIGFzIG5vcm1hbGl6YXRpb24gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbm9ybWFsaXphdGlvbi5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsT3JQYXJlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9leHRwYXRoLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0ICogYXMgdHlwZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFByb21pc2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9ub2RlL3Bmcy5qcyc7XG5pbXBvcnQgeyBJRmlsZVF1ZXJ5LCBJRm9sZGVyUXVlcnksIElQcm9ncmVzc01lc3NhZ2UsIElTZWFyY2hFbmdpbmVTdGF0cywgSVJhd0ZpbGVNYXRjaCwgSVNlYXJjaEVuZ2luZSwgSVNlYXJjaEVuZ2luZVN1Y2Nlc3MsIGlzRmlsZVBhdHRlcm5NYXRjaCwgaGFzU2libGluZ0ZuIH0gZnJvbSAnLi4vY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBzcGF3blJpcGdyZXBDbWQgfSBmcm9tICcuL3JpcGdyZXBGaWxlU2VhcmNoLmpzJztcbmltcG9ydCB7IHByZXBhcmVRdWVyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Z1enp5U2NvcmVyLmpzJztcblxuaW50ZXJmYWNlIElEaXJlY3RvcnlFbnRyeSBleHRlbmRzIElSYXdGaWxlTWF0Y2gge1xuXHRiYXNlOiBzdHJpbmc7XG5cdGJhc2VuYW1lOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJRGlyZWN0b3J5VHJlZSB7XG5cdHJvb3RFbnRyaWVzOiBJRGlyZWN0b3J5RW50cnlbXTtcblx0cGF0aFRvRW50cmllczogeyBbcmVsYXRpdmVQYXRoOiBzdHJpbmddOiBJRGlyZWN0b3J5RW50cnlbXSB9O1xufVxuXG5jb25zdCBraWxsQ21kcyA9IG5ldyBTZXQ8KCkgPT4gdm9pZD4oKTtcbnByb2Nlc3Mub24oJ2V4aXQnLCAoKSA9PiB7XG5cdGtpbGxDbWRzLmZvckVhY2goY21kID0+IGNtZCgpKTtcbn0pO1xuXG5leHBvcnQgY2xhc3MgRmlsZVdhbGtlciB7XG5cdHByaXZhdGUgY29uZmlnOiBJRmlsZVF1ZXJ5O1xuXHRwcml2YXRlIGZpbGVQYXR0ZXJuOiBzdHJpbmc7XG5cdHByaXZhdGUgbm9ybWFsaXplZEZpbGVQYXR0ZXJuTG93ZXJjYXNlOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBpbmNsdWRlUGF0dGVybjogZ2xvYi5QYXJzZWRFeHByZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG1heFJlc3VsdHM6IG51bWJlciB8IG51bGw7XG5cdHByaXZhdGUgZXhpc3RzOiBib29sZWFuO1xuXHRwcml2YXRlIG1heEZpbGVzaXplOiBudW1iZXIgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBpc0xpbWl0SGl0OiBib29sZWFuO1xuXHRwcml2YXRlIHJlc3VsdENvdW50OiBudW1iZXI7XG5cdHByaXZhdGUgaXNDYW5jZWxlZCA9IGZhbHNlO1xuXHRwcml2YXRlIGZpbGVXYWxrU1c6IFN0b3BXYXRjaCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGRpcmVjdG9yaWVzV2Fsa2VkOiBudW1iZXI7XG5cdHByaXZhdGUgZmlsZXNXYWxrZWQ6IG51bWJlcjtcblx0cHJpdmF0ZSBlcnJvcnM6IHN0cmluZ1tdO1xuXHRwcml2YXRlIGNtZFNXOiBTdG9wV2F0Y2ggfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBjbWRSZXN1bHRDb3VudDogbnVtYmVyID0gMDtcblxuXHRwcml2YXRlIGZvbGRlckV4Y2x1ZGVQYXR0ZXJuczogTWFwPHN0cmluZywgQWJzb2x1dGVBbmRSZWxhdGl2ZVBhcnNlZEV4cHJlc3Npb24+O1xuXHRwcml2YXRlIGdsb2JhbEV4Y2x1ZGVQYXR0ZXJuOiBnbG9iLlBhcnNlZEV4cHJlc3Npb24gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSB3YWxrZWRQYXRoczogeyBbcGF0aDogc3RyaW5nXTogYm9vbGVhbiB9O1xuXG5cdGNvbnN0cnVjdG9yKGNvbmZpZzogSUZpbGVRdWVyeSkge1xuXHRcdHRoaXMuY29uZmlnID0gY29uZmlnO1xuXHRcdHRoaXMuZmlsZVBhdHRlcm4gPSBjb25maWcuZmlsZVBhdHRlcm4gfHwgJyc7XG5cdFx0Y29uc3QgZ2xvYk9wdGlvbnMgPSBjb25maWcuaWdub3JlR2xvYkNhc2UgPyB7IGlnbm9yZUNhc2U6IHRydWUgfSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLmluY2x1ZGVQYXR0ZXJuID0gY29uZmlnLmluY2x1ZGVQYXR0ZXJuICYmIGdsb2IucGFyc2UoY29uZmlnLmluY2x1ZGVQYXR0ZXJuLCBnbG9iT3B0aW9ucyk7XG5cdFx0dGhpcy5tYXhSZXN1bHRzID0gY29uZmlnLm1heFJlc3VsdHMgfHwgbnVsbDtcblx0XHR0aGlzLmV4aXN0cyA9ICEhY29uZmlnLmV4aXN0cztcblx0XHR0aGlzLndhbGtlZFBhdGhzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLnJlc3VsdENvdW50ID0gMDtcblx0XHR0aGlzLmlzTGltaXRIaXQgPSBmYWxzZTtcblx0XHR0aGlzLmRpcmVjdG9yaWVzV2Fsa2VkID0gMDtcblx0XHR0aGlzLmZpbGVzV2Fsa2VkID0gMDtcblx0XHR0aGlzLmVycm9ycyA9IFtdO1xuXG5cdFx0aWYgKHRoaXMuZmlsZVBhdHRlcm4pIHtcblx0XHRcdHRoaXMubm9ybWFsaXplZEZpbGVQYXR0ZXJuTG93ZXJjYXNlID0gY29uZmlnLnNob3VsZEdsb2JNYXRjaEZpbGVQYXR0ZXJuID8gbnVsbCA6IHByZXBhcmVRdWVyeSh0aGlzLmZpbGVQYXR0ZXJuKS5ub3JtYWxpemVkTG93ZXJjYXNlO1xuXHRcdH1cblxuXHRcdHRoaXMuZ2xvYmFsRXhjbHVkZVBhdHRlcm4gPSBjb25maWcuZXhjbHVkZVBhdHRlcm4gJiYgZ2xvYi5wYXJzZShjb25maWcuZXhjbHVkZVBhdHRlcm4sIGdsb2JPcHRpb25zKTtcblx0XHR0aGlzLmZvbGRlckV4Y2x1ZGVQYXR0ZXJucyA9IG5ldyBNYXA8c3RyaW5nLCBBYnNvbHV0ZUFuZFJlbGF0aXZlUGFyc2VkRXhwcmVzc2lvbj4oKTtcblxuXHRcdGNvbmZpZy5mb2xkZXJRdWVyaWVzLmZvckVhY2goZm9sZGVyUXVlcnkgPT4ge1xuXHRcdFx0Y29uc3QgZm9sZGVyRXhjbHVkZUV4cHJlc3Npb246IGdsb2IuSUV4cHJlc3Npb24gPSB7fTsgLy8gdG9kbzogY29uc2lkZXIgZXhjbHVkZSBiYXNlVVJJXG5cblx0XHRcdGZvbGRlclF1ZXJ5LmV4Y2x1ZGVQYXR0ZXJuPy5mb3JFYWNoKGV4Y2x1ZGVQYXR0ZXJuID0+IHtcblx0XHRcdFx0T2JqZWN0LmFzc2lnbihmb2xkZXJFeGNsdWRlRXhwcmVzc2lvbiwgZXhjbHVkZVBhdHRlcm4ucGF0dGVybiB8fCB7fSwgdGhpcy5jb25maWcuZXhjbHVkZVBhdHRlcm4gfHwge30pO1xuXHRcdFx0fSk7XG5cblx0XHRcdGlmICghZm9sZGVyUXVlcnkuZXhjbHVkZVBhdHRlcm4/Lmxlbmd0aCkge1xuXHRcdFx0XHRPYmplY3QuYXNzaWduKGZvbGRlckV4Y2x1ZGVFeHByZXNzaW9uLCB0aGlzLmNvbmZpZy5leGNsdWRlUGF0dGVybiB8fCB7fSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEFkZCBleGNsdWRlcyBmb3Igb3RoZXIgcm9vdCBmb2xkZXJzXG5cdFx0XHRjb25zdCBmcVBhdGggPSBmb2xkZXJRdWVyeS5mb2xkZXIuZnNQYXRoO1xuXHRcdFx0Y29uZmlnLmZvbGRlclF1ZXJpZXNcblx0XHRcdFx0Lm1hcChyb290Rm9sZGVyUXVlcnkgPT4gcm9vdEZvbGRlclF1ZXJ5LmZvbGRlci5mc1BhdGgpXG5cdFx0XHRcdC5maWx0ZXIocm9vdEZvbGRlciA9PiByb290Rm9sZGVyICE9PSBmcVBhdGgpXG5cdFx0XHRcdC5mb3JFYWNoKG90aGVyUm9vdEZvbGRlciA9PiB7XG5cdFx0XHRcdFx0Ly8gRXhjbHVkZSBuZXN0ZWQgcm9vdCBmb2xkZXJzXG5cdFx0XHRcdFx0aWYgKGlzRXF1YWxPclBhcmVudChvdGhlclJvb3RGb2xkZXIsIGZxUGF0aCwgY29uZmlnLmlnbm9yZUdsb2JDYXNlKSkge1xuXHRcdFx0XHRcdFx0Zm9sZGVyRXhjbHVkZUV4cHJlc3Npb25bcGF0aC5yZWxhdGl2ZShmcVBhdGgsIG90aGVyUm9vdEZvbGRlcildID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLmZvbGRlckV4Y2x1ZGVQYXR0ZXJucy5zZXQoZnFQYXRoLCBuZXcgQWJzb2x1dGVBbmRSZWxhdGl2ZVBhcnNlZEV4cHJlc3Npb24oZm9sZGVyRXhjbHVkZUV4cHJlc3Npb24sIGZxUGF0aCwgY29uZmlnLmlnbm9yZUdsb2JDYXNlKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRjYW5jZWwoKTogdm9pZCB7XG5cdFx0dGhpcy5pc0NhbmNlbGVkID0gdHJ1ZTtcblx0XHRraWxsQ21kcy5mb3JFYWNoKGNtZCA9PiBjbWQoKSk7XG5cdH1cblxuXHR3YWxrKGZvbGRlclF1ZXJpZXM6IElGb2xkZXJRdWVyeVtdLCBleHRyYUZpbGVzOiBVUklbXSwgbnVtVGhyZWFkczogbnVtYmVyIHwgdW5kZWZpbmVkLCBvblJlc3VsdDogKHJlc3VsdDogSVJhd0ZpbGVNYXRjaCkgPT4gdm9pZCwgb25NZXNzYWdlOiAobWVzc2FnZTogSVByb2dyZXNzTWVzc2FnZSkgPT4gdm9pZCwgZG9uZTogKGVycm9yOiBFcnJvciB8IG51bGwsIGlzTGltaXRIaXQ6IGJvb2xlYW4pID0+IHZvaWQpOiB2b2lkIHtcblx0XHR0aGlzLmZpbGVXYWxrU1cgPSBTdG9wV2F0Y2guY3JlYXRlKGZhbHNlKTtcblxuXHRcdC8vIFN1cHBvcnQgdGhhdCB0aGUgZmlsZSBwYXR0ZXJuIGlzIGEgZnVsbCBwYXRoIHRvIGEgZmlsZSB0aGF0IGV4aXN0c1xuXHRcdGlmICh0aGlzLmlzQ2FuY2VsZWQpIHtcblx0XHRcdHJldHVybiBkb25lKG51bGwsIHRoaXMuaXNMaW1pdEhpdCk7XG5cdFx0fVxuXG5cdFx0Ly8gRm9yIGVhY2ggZXh0cmEgZmlsZVxuXHRcdGV4dHJhRmlsZXMuZm9yRWFjaChleHRyYUZpbGVQYXRoID0+IHtcblx0XHRcdGNvbnN0IGJhc2VuYW1lID0gcGF0aC5iYXNlbmFtZShleHRyYUZpbGVQYXRoLmZzUGF0aCk7XG5cdFx0XHRpZiAodGhpcy5nbG9iYWxFeGNsdWRlUGF0dGVybiAmJiB0aGlzLmdsb2JhbEV4Y2x1ZGVQYXR0ZXJuKGV4dHJhRmlsZVBhdGguZnNQYXRoLCBiYXNlbmFtZSkpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBleGNsdWRlZFxuXHRcdFx0fVxuXG5cdFx0XHQvLyBGaWxlOiBDaGVjayBmb3IgbWF0Y2ggb24gZmlsZSBwYXR0ZXJuIGFuZCBpbmNsdWRlIHBhdHRlcm5cblx0XHRcdHRoaXMubWF0Y2hGaWxlKG9uUmVzdWx0LCB7IHJlbGF0aXZlUGF0aDogZXh0cmFGaWxlUGF0aC5mc1BhdGggLyogbm8gd29ya3NwYWNlIHJlbGF0aXZlIHBhdGggKi8sIHNlYXJjaFBhdGg6IHVuZGVmaW5lZCB9KTtcblx0XHR9KTtcblxuXHRcdHRoaXMuY21kU1cgPSBTdG9wV2F0Y2guY3JlYXRlKGZhbHNlKTtcblxuXHRcdC8vIEZvciBlYWNoIHJvb3QgZm9sZGVyXG5cdFx0dGhpcy5wYXJhbGxlbDxJRm9sZGVyUXVlcnksIHZvaWQ+KGZvbGRlclF1ZXJpZXMsIChmb2xkZXJRdWVyeTogSUZvbGRlclF1ZXJ5LCByb290Rm9sZGVyRG9uZTogKGVycjogRXJyb3IgfCBudWxsLCByZXN1bHQ6IHZvaWQpID0+IHZvaWQpID0+IHtcblx0XHRcdHRoaXMuY2FsbCh0aGlzLmNtZFRyYXZlcnNhbCwgdGhpcywgZm9sZGVyUXVlcnksIG51bVRocmVhZHMsIG9uUmVzdWx0LCBvbk1lc3NhZ2UsIChlcnI/OiBFcnJvcikgPT4ge1xuXHRcdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXJyb3JNZXNzYWdlID0gdG9FcnJvck1lc3NhZ2UoZXJyKTtcblx0XHRcdFx0XHRjb25zb2xlLmVycm9yKGVycm9yTWVzc2FnZSk7XG5cdFx0XHRcdFx0dGhpcy5lcnJvcnMucHVzaChlcnJvck1lc3NhZ2UpO1xuXHRcdFx0XHRcdHJvb3RGb2xkZXJEb25lKGVyciwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyb290Rm9sZGVyRG9uZShudWxsLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9LCAoZXJyb3JzLCBfcmVzdWx0KSA9PiB7XG5cdFx0XHR0aGlzLmZpbGVXYWxrU1chLnN0b3AoKTtcblx0XHRcdGNvbnN0IGVyciA9IGVycm9ycyA/IGFycmF5cy5jb2FsZXNjZShlcnJvcnMpWzBdIDogbnVsbDtcblx0XHRcdGRvbmUoZXJyLCB0aGlzLmlzTGltaXRIaXQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBwYXJhbGxlbDxULCBFPihsaXN0OiBUW10sIGZuOiAoaXRlbTogVCwgY2FsbGJhY2s6IChlcnI6IEVycm9yIHwgbnVsbCwgcmVzdWx0OiBFIHwgbnVsbCkgPT4gdm9pZCkgPT4gdm9pZCwgY2FsbGJhY2s6IChlcnI6IEFycmF5PEVycm9yIHwgbnVsbD4gfCBudWxsLCByZXN1bHQ6IEVbXSkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBuZXcgQXJyYXkobGlzdC5sZW5ndGgpO1xuXHRcdGNvbnN0IGVycm9ycyA9IG5ldyBBcnJheTxFcnJvciB8IG51bGw+KGxpc3QubGVuZ3RoKTtcblx0XHRsZXQgZGlkRXJyb3JPY2N1ciA9IGZhbHNlO1xuXHRcdGxldCBkb25lQ291bnQgPSAwO1xuXG5cdFx0aWYgKGxpc3QubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gY2FsbGJhY2sobnVsbCwgW10pO1xuXHRcdH1cblxuXHRcdGxpc3QuZm9yRWFjaCgoaXRlbSwgaW5kZXgpID0+IHtcblx0XHRcdGZuKGl0ZW0sIChlcnJvciwgcmVzdWx0KSA9PiB7XG5cdFx0XHRcdGlmIChlcnJvcikge1xuXHRcdFx0XHRcdGRpZEVycm9yT2NjdXIgPSB0cnVlO1xuXHRcdFx0XHRcdHJlc3VsdHNbaW5kZXhdID0gbnVsbDtcblx0XHRcdFx0XHRlcnJvcnNbaW5kZXhdID0gZXJyb3I7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0c1tpbmRleF0gPSByZXN1bHQ7XG5cdFx0XHRcdFx0ZXJyb3JzW2luZGV4XSA9IG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoKytkb25lQ291bnQgPT09IGxpc3QubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGNhbGxiYWNrKGRpZEVycm9yT2NjdXIgPyBlcnJvcnMgOiBudWxsLCByZXN1bHRzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGNhbGw8RiBleHRlbmRzIEZ1bmN0aW9uPihmdW46IEYsIHRoYXQ6IGFueSwgLi4uYXJnczogYW55W10pOiB2b2lkIHtcblx0XHR0cnkge1xuXHRcdFx0ZnVuLmFwcGx5KHRoYXQsIGFyZ3MpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGFyZ3NbYXJncy5sZW5ndGggLSAxXShlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNtZFRyYXZlcnNhbChmb2xkZXJRdWVyeTogSUZvbGRlclF1ZXJ5LCBudW1UaHJlYWRzOiBudW1iZXIgfCB1bmRlZmluZWQsIG9uUmVzdWx0OiAocmVzdWx0OiBJUmF3RmlsZU1hdGNoKSA9PiB2b2lkLCBvbk1lc3NhZ2U6IChtZXNzYWdlOiBJUHJvZ3Jlc3NNZXNzYWdlKSA9PiB2b2lkLCBjYjogKGVycj86IEVycm9yKSA9PiB2b2lkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGZvbGRlclF1ZXJ5LmZvbGRlci5mc1BhdGg7XG5cdFx0Y29uc3QgaXNNYWMgPSBwbGF0Zm9ybS5pc01hY2ludG9zaDtcblxuXHRcdGNvbnN0IGtpbGxDbWQgPSAoKSA9PiBjbWQgJiYgY21kLmtpbGwoKTtcblx0XHRraWxsQ21kcy5hZGQoa2lsbENtZCk7XG5cblx0XHRsZXQgZG9uZSA9IChlcnI/OiBFcnJvcikgPT4ge1xuXHRcdFx0a2lsbENtZHMuZGVsZXRlKGtpbGxDbWQpO1xuXHRcdFx0ZG9uZSA9ICgpID0+IHsgfTtcblx0XHRcdGNiKGVycik7XG5cdFx0fTtcblx0XHRsZXQgbGVmdG92ZXIgPSAnJztcblx0XHRjb25zdCB0cmVlID0gdGhpcy5pbml0RGlyZWN0b3J5VHJlZSgpO1xuXG5cdFx0bGV0IHJpcGdyZXA7XG5cdFx0dHJ5IHtcblx0XHRcdHJpcGdyZXAgPSBhd2FpdCBzcGF3blJpcGdyZXBDbWQodGhpcy5jb25maWcsIGZvbGRlclF1ZXJ5LCB0aGlzLmNvbmZpZy5pbmNsdWRlUGF0dGVybiwgdGhpcy5mb2xkZXJFeGNsdWRlUGF0dGVybnMuZ2V0KGZvbGRlclF1ZXJ5LmZvbGRlci5mc1BhdGgpIS5leHByZXNzaW9uLCBudW1UaHJlYWRzKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGRvbmUoZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIgOiBuZXcgRXJyb3IoU3RyaW5nKGVycikpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY21kID0gcmlwZ3JlcC5jbWQ7XG5cdFx0Y29uc3Qgbm9TaWJsaW5nc0NsYXVzZXMgPSAhT2JqZWN0LmtleXMocmlwZ3JlcC5zaWJsaW5nQ2xhdXNlcykubGVuZ3RoO1xuXG5cdFx0Y29uc3QgZXNjYXBlZEFyZ3MgPSByaXBncmVwLnJnQXJncy5hcmdzXG5cdFx0XHQubWFwKGFyZyA9PiBhcmcubWF0Y2goL14tLykgPyBhcmcgOiBgJyR7YXJnfSdgKVxuXHRcdFx0LmpvaW4oJyAnKTtcblxuXHRcdGxldCByZ0NtZCA9IGAke3JpcGdyZXAucmdEaXNrUGF0aH0gJHtlc2NhcGVkQXJnc31cXG4gLSBjd2Q6ICR7cmlwZ3JlcC5jd2R9YDtcblx0XHRpZiAocmlwZ3JlcC5yZ0FyZ3Muc2libGluZ0NsYXVzZXMpIHtcblx0XHRcdHJnQ21kICs9IGBcXG4gLSBTaWJsaW5nIGNsYXVzZXM6ICR7SlNPTi5zdHJpbmdpZnkocmlwZ3JlcC5yZ0FyZ3Muc2libGluZ0NsYXVzZXMpfWA7XG5cdFx0fVxuXHRcdG9uTWVzc2FnZSh7IG1lc3NhZ2U6IHJnQ21kIH0pO1xuXG5cdFx0dGhpcy5jbWRSZXN1bHRDb3VudCA9IDA7XG5cdFx0dGhpcy5jb2xsZWN0U3Rkb3V0KGNtZCwgJ3V0ZjgnLCBvbk1lc3NhZ2UsIChlcnI6IEVycm9yIHwgbnVsbCwgc3Rkb3V0Pzogc3RyaW5nLCBsYXN0PzogYm9vbGVhbikgPT4ge1xuXHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRkb25lKGVycik7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmlzTGltaXRIaXQpIHtcblx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1hYzogdXNlcyBORkQgdW5pY29kZSBmb3JtIG9uIGRpc2ssIGJ1dCB3ZSB3YW50IE5GQ1xuXHRcdFx0Y29uc3Qgbm9ybWFsaXplZCA9IGxlZnRvdmVyICsgKGlzTWFjID8gbm9ybWFsaXphdGlvbi5ub3JtYWxpemVORkMoc3Rkb3V0IHx8ICcnKSA6IHN0ZG91dCk7XG5cdFx0XHRjb25zdCByZWxhdGl2ZUZpbGVzID0gbm9ybWFsaXplZC5zcGxpdCgnXFxuJyk7XG5cblx0XHRcdGlmIChsYXN0KSB7XG5cdFx0XHRcdGNvbnN0IG4gPSByZWxhdGl2ZUZpbGVzLmxlbmd0aDtcblx0XHRcdFx0cmVsYXRpdmVGaWxlc1tuIC0gMV0gPSByZWxhdGl2ZUZpbGVzW24gLSAxXS50cmltKCk7XG5cdFx0XHRcdGlmICghcmVsYXRpdmVGaWxlc1tuIC0gMV0pIHtcblx0XHRcdFx0XHRyZWxhdGl2ZUZpbGVzLnBvcCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsZWZ0b3ZlciA9IHJlbGF0aXZlRmlsZXMucG9wKCkgfHwgJyc7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZWxhdGl2ZUZpbGVzLmxlbmd0aCAmJiByZWxhdGl2ZUZpbGVzWzBdLmluZGV4T2YoJ1xcbicpICE9PSAtMSkge1xuXHRcdFx0XHRkb25lKG5ldyBFcnJvcignU3BsaXR0aW5nIHVwIGZpbGVzIGZhaWxlZCcpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmNtZFJlc3VsdENvdW50ICs9IHJlbGF0aXZlRmlsZXMubGVuZ3RoO1xuXG5cdFx0XHRpZiAobm9TaWJsaW5nc0NsYXVzZXMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCByZWxhdGl2ZVBhdGggb2YgcmVsYXRpdmVGaWxlcykge1xuXHRcdFx0XHRcdHRoaXMubWF0Y2hGaWxlKG9uUmVzdWx0LCB7IGJhc2U6IHJvb3RGb2xkZXIsIHJlbGF0aXZlUGF0aCwgc2VhcmNoUGF0aDogdGhpcy5nZXRTZWFyY2hQYXRoKGZvbGRlclF1ZXJ5LCByZWxhdGl2ZVBhdGgpIH0pO1xuXHRcdFx0XHRcdGlmICh0aGlzLmlzTGltaXRIaXQpIHtcblx0XHRcdFx0XHRcdGtpbGxDbWQoKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobGFzdCB8fCB0aGlzLmlzTGltaXRIaXQpIHtcblx0XHRcdFx0XHRkb25lKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRPRE86IE9wdGltaXplIHNpYmxpbmdzIGNsYXVzZXMgd2l0aCByaXBncmVwIGhlcmUuXG5cdFx0XHR0aGlzLmFkZERpcmVjdG9yeUVudHJpZXMoZm9sZGVyUXVlcnksIHRyZWUsIHJvb3RGb2xkZXIsIHJlbGF0aXZlRmlsZXMsIG9uUmVzdWx0KTtcblxuXHRcdFx0aWYgKGxhc3QpIHtcblx0XHRcdFx0dGhpcy5tYXRjaERpcmVjdG9yeVRyZWUodHJlZSwgcm9vdEZvbGRlciwgb25SZXN1bHQpO1xuXHRcdFx0XHRkb25lKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogUHVibGljIGZvciB0ZXN0aW5nLlxuXHQgKi9cblx0c3Bhd25GaW5kQ21kKGZvbGRlclF1ZXJ5OiBJRm9sZGVyUXVlcnkpIHtcblx0XHRjb25zdCBleGNsdWRlUGF0dGVybiA9IHRoaXMuZm9sZGVyRXhjbHVkZVBhdHRlcm5zLmdldChmb2xkZXJRdWVyeS5mb2xkZXIuZnNQYXRoKSE7XG5cdFx0Y29uc3QgYmFzZW5hbWVzID0gZXhjbHVkZVBhdHRlcm4uZ2V0QmFzZW5hbWVUZXJtcygpO1xuXHRcdGNvbnN0IHBhdGhUZXJtcyA9IGV4Y2x1ZGVQYXR0ZXJuLmdldFBhdGhUZXJtcygpO1xuXHRcdGNvbnN0IGFyZ3MgPSBbJy1MJywgJy4nXTtcblx0XHRpZiAoYmFzZW5hbWVzLmxlbmd0aCB8fCBwYXRoVGVybXMubGVuZ3RoKSB7XG5cdFx0XHRhcmdzLnB1c2goJy1ub3QnLCAnKCcsICcoJyk7XG5cdFx0XHRmb3IgKGNvbnN0IGJhc2VuYW1lIG9mIGJhc2VuYW1lcykge1xuXHRcdFx0XHRhcmdzLnB1c2goJy1uYW1lJywgYmFzZW5hbWUpO1xuXHRcdFx0XHRhcmdzLnB1c2goJy1vJyk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHBhdGggb2YgcGF0aFRlcm1zKSB7XG5cdFx0XHRcdGFyZ3MucHVzaCgnLXBhdGgnLCBwYXRoKTtcblx0XHRcdFx0YXJncy5wdXNoKCctbycpO1xuXHRcdFx0fVxuXHRcdFx0YXJncy5wb3AoKTtcblx0XHRcdGFyZ3MucHVzaCgnKScsICctcHJ1bmUnLCAnKScpO1xuXHRcdH1cblx0XHRhcmdzLnB1c2goJy10eXBlJywgJ2YnKTtcblx0XHRyZXR1cm4gY2hpbGRQcm9jZXNzLnNwYXduKCdmaW5kJywgYXJncywgeyBjd2Q6IGZvbGRlclF1ZXJ5LmZvbGRlci5mc1BhdGggfSk7XG5cdH1cblxuXHQvKipcblx0ICogUHVibGljIGZvciB0ZXN0aW5nLlxuXHQgKi9cblx0cmVhZFN0ZG91dChjbWQ6IGNoaWxkUHJvY2Vzcy5DaGlsZFByb2Nlc3MsIGVuY29kaW5nOiBCdWZmZXJFbmNvZGluZywgY2I6IChlcnI6IEVycm9yIHwgbnVsbCwgc3Rkb3V0Pzogc3RyaW5nKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0bGV0IGFsbCA9ICcnO1xuXHRcdHRoaXMuY29sbGVjdFN0ZG91dChjbWQsIGVuY29kaW5nLCAoKSA9PiB7IH0sIChlcnI6IEVycm9yIHwgbnVsbCwgc3Rkb3V0Pzogc3RyaW5nLCBsYXN0PzogYm9vbGVhbikgPT4ge1xuXHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRjYihlcnIpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGFsbCArPSBzdGRvdXQ7XG5cdFx0XHRpZiAobGFzdCkge1xuXHRcdFx0XHRjYihudWxsLCBhbGwpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjb2xsZWN0U3Rkb3V0KGNtZDogY2hpbGRQcm9jZXNzLkNoaWxkUHJvY2VzcywgZW5jb2Rpbmc6IEJ1ZmZlckVuY29kaW5nLCBvbk1lc3NhZ2U6IChtZXNzYWdlOiBJUHJvZ3Jlc3NNZXNzYWdlKSA9PiB2b2lkLCBjYjogKGVycjogRXJyb3IgfCBudWxsLCBzdGRvdXQ/OiBzdHJpbmcsIGxhc3Q/OiBib29sZWFuKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0bGV0IG9uRGF0YSA9IChlcnI6IEVycm9yIHwgbnVsbCwgc3Rkb3V0Pzogc3RyaW5nLCBsYXN0PzogYm9vbGVhbikgPT4ge1xuXHRcdFx0aWYgKGVyciB8fCBsYXN0KSB7XG5cdFx0XHRcdG9uRGF0YSA9ICgpID0+IHsgfTtcblxuXHRcdFx0XHR0aGlzLmNtZFNXPy5zdG9wKCk7XG5cdFx0XHR9XG5cdFx0XHRjYihlcnIsIHN0ZG91dCwgbGFzdCk7XG5cdFx0fTtcblxuXHRcdGxldCBnb3REYXRhID0gZmFsc2U7XG5cdFx0aWYgKGNtZC5zdGRvdXQpIHtcblx0XHRcdC8vIFNob3VsZCBiZSBub24tbnVsbCwgYnV0ICMzODE5NVxuXHRcdFx0dGhpcy5mb3J3YXJkRGF0YShjbWQuc3Rkb3V0LCBlbmNvZGluZywgb25EYXRhKTtcblx0XHRcdGNtZC5zdGRvdXQub25jZSgnZGF0YScsICgpID0+IGdvdERhdGEgPSB0cnVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0b25NZXNzYWdlKHsgbWVzc2FnZTogJ3N0ZG91dCBpcyBudWxsJyB9KTtcblx0XHR9XG5cblx0XHRsZXQgc3RkZXJyOiBCdWZmZXJbXTtcblx0XHRpZiAoY21kLnN0ZGVycikge1xuXHRcdFx0Ly8gU2hvdWxkIGJlIG5vbi1udWxsLCBidXQgIzM4MTk1XG5cdFx0XHRzdGRlcnIgPSB0aGlzLmNvbGxlY3REYXRhKGNtZC5zdGRlcnIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRvbk1lc3NhZ2UoeyBtZXNzYWdlOiAnc3RkZXJyIGlzIG51bGwnIH0pO1xuXHRcdH1cblxuXHRcdGNtZC5vbignZXJyb3InLCAoZXJyOiBFcnJvcikgPT4ge1xuXHRcdFx0b25EYXRhKGVycik7XG5cdFx0fSk7XG5cblx0XHRjbWQub24oJ2Nsb3NlJywgKGNvZGU6IG51bWJlcikgPT4ge1xuXHRcdFx0Ly8gcmlwZ3JlcCByZXR1cm5zIGNvZGU9MSB3aGVuIG5vIHJlc3VsdHMgYXJlIGZvdW5kXG5cdFx0XHRsZXQgc3RkZXJyVGV4dDogc3RyaW5nO1xuXHRcdFx0aWYgKCFnb3REYXRhICYmIChzdGRlcnJUZXh0ID0gdGhpcy5kZWNvZGVEYXRhKHN0ZGVyciwgZW5jb2RpbmcpKSAmJiByZ0Vycm9yTXNnRm9yRGlzcGxheShzdGRlcnJUZXh0KSkge1xuXHRcdFx0XHRvbkRhdGEobmV3IEVycm9yKGBjb21tYW5kIGZhaWxlZCB3aXRoIGVycm9yIGNvZGUgJHtjb2RlfTogJHt0aGlzLmRlY29kZURhdGEoc3RkZXJyLCBlbmNvZGluZyl9YCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHRoaXMuZXhpc3RzICYmIGNvZGUgPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLmlzTGltaXRIaXQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9uRGF0YShudWxsLCAnJywgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGZvcndhcmREYXRhKHN0cmVhbTogUmVhZGFibGUsIGVuY29kaW5nOiBCdWZmZXJFbmNvZGluZywgY2I6IChlcnI6IEVycm9yIHwgbnVsbCwgc3Rkb3V0Pzogc3RyaW5nKSA9PiB2b2lkKTogU3RyaW5nRGVjb2RlciB7XG5cdFx0Y29uc3QgZGVjb2RlciA9IG5ldyBTdHJpbmdEZWNvZGVyKGVuY29kaW5nKTtcblx0XHRzdHJlYW0ub24oJ2RhdGEnLCAoZGF0YTogQnVmZmVyKSA9PiB7XG5cdFx0XHRjYihudWxsLCBkZWNvZGVyLndyaXRlKGRhdGEpKTtcblx0XHR9KTtcblx0XHRyZXR1cm4gZGVjb2Rlcjtcblx0fVxuXG5cdHByaXZhdGUgY29sbGVjdERhdGEoc3RyZWFtOiBSZWFkYWJsZSk6IEJ1ZmZlcltdIHtcblx0XHRjb25zdCBidWZmZXJzOiBCdWZmZXJbXSA9IFtdO1xuXHRcdHN0cmVhbS5vbignZGF0YScsIChkYXRhOiBCdWZmZXIpID0+IHtcblx0XHRcdGJ1ZmZlcnMucHVzaChkYXRhKTtcblx0XHR9KTtcblx0XHRyZXR1cm4gYnVmZmVycztcblx0fVxuXG5cdHByaXZhdGUgZGVjb2RlRGF0YShidWZmZXJzOiBCdWZmZXJbXSwgZW5jb2Rpbmc6IEJ1ZmZlckVuY29kaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBkZWNvZGVyID0gbmV3IFN0cmluZ0RlY29kZXIoZW5jb2RpbmcpO1xuXHRcdHJldHVybiBidWZmZXJzLm1hcChidWZmZXIgPT4gZGVjb2Rlci53cml0ZShidWZmZXIpKS5qb2luKCcnKTtcblx0fVxuXG5cdHByaXZhdGUgaW5pdERpcmVjdG9yeVRyZWUoKTogSURpcmVjdG9yeVRyZWUge1xuXHRcdGNvbnN0IHRyZWU6IElEaXJlY3RvcnlUcmVlID0ge1xuXHRcdFx0cm9vdEVudHJpZXM6IFtdLFxuXHRcdFx0cGF0aFRvRW50cmllczogT2JqZWN0LmNyZWF0ZShudWxsKVxuXHRcdH07XG5cdFx0dHJlZS5wYXRoVG9FbnRyaWVzWycuJ10gPSB0cmVlLnJvb3RFbnRyaWVzO1xuXHRcdHJldHVybiB0cmVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGREaXJlY3RvcnlFbnRyaWVzKGZvbGRlclF1ZXJ5OiBJRm9sZGVyUXVlcnksIHsgcGF0aFRvRW50cmllcyB9OiBJRGlyZWN0b3J5VHJlZSwgYmFzZTogc3RyaW5nLCByZWxhdGl2ZUZpbGVzOiBzdHJpbmdbXSwgb25SZXN1bHQ6IChyZXN1bHQ6IElSYXdGaWxlTWF0Y2gpID0+IHZvaWQpIHtcblx0XHQvLyBTdXBwb3J0IHJlbGF0aXZlIHBhdGhzIHRvIGZpbGVzIGZyb20gYSByb290IHJlc291cmNlIChpZ25vcmVzIGV4Y2x1ZGVzKVxuXHRcdGNvbnN0IGZpbGVQYXR0ZXJuTWF0Y2ggPSB0aGlzLmZpbGVQYXR0ZXJuICYmIHJlbGF0aXZlRmlsZXMuZmluZChmID0+IHN0cmluZ3MuZXF1YWxzKGYsIHRoaXMuZmlsZVBhdHRlcm4sIHRoaXMuY29uZmlnLmlnbm9yZUdsb2JDYXNlKSk7XG5cdFx0aWYgKGZpbGVQYXR0ZXJuTWF0Y2gpIHtcblx0XHRcdHRoaXMubWF0Y2hGaWxlKG9uUmVzdWx0LCB7XG5cdFx0XHRcdGJhc2UsXG5cdFx0XHRcdHJlbGF0aXZlUGF0aDogZmlsZVBhdHRlcm5NYXRjaCxcblx0XHRcdFx0c2VhcmNoUGF0aDogdGhpcy5nZXRTZWFyY2hQYXRoKGZvbGRlclF1ZXJ5LCBmaWxlUGF0dGVybk1hdGNoKVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWRkID0gKHJlbGF0aXZlUGF0aDogc3RyaW5nKSA9PiB7XG5cdFx0XHRjb25zdCBiYXNlbmFtZSA9IHBhdGguYmFzZW5hbWUocmVsYXRpdmVQYXRoKTtcblx0XHRcdGNvbnN0IGRpcm5hbWUgPSBwYXRoLmRpcm5hbWUocmVsYXRpdmVQYXRoKTtcblx0XHRcdGxldCBlbnRyaWVzID0gcGF0aFRvRW50cmllc1tkaXJuYW1lXTtcblx0XHRcdGlmICghZW50cmllcykge1xuXHRcdFx0XHRlbnRyaWVzID0gcGF0aFRvRW50cmllc1tkaXJuYW1lXSA9IFtdO1xuXHRcdFx0XHRhZGQoZGlybmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRlbnRyaWVzLnB1c2goe1xuXHRcdFx0XHRiYXNlLFxuXHRcdFx0XHRyZWxhdGl2ZVBhdGgsXG5cdFx0XHRcdGJhc2VuYW1lLFxuXHRcdFx0XHRzZWFyY2hQYXRoOiB0aGlzLmdldFNlYXJjaFBhdGgoZm9sZGVyUXVlcnksIHJlbGF0aXZlUGF0aCksXG5cdFx0XHR9KTtcblx0XHR9O1xuXHRcdHJlbGF0aXZlRmlsZXMuZm9yRWFjaChhZGQpO1xuXHR9XG5cblx0cHJpdmF0ZSBtYXRjaERpcmVjdG9yeVRyZWUoeyByb290RW50cmllcywgcGF0aFRvRW50cmllcyB9OiBJRGlyZWN0b3J5VHJlZSwgcm9vdEZvbGRlcjogc3RyaW5nLCBvblJlc3VsdDogKHJlc3VsdDogSVJhd0ZpbGVNYXRjaCkgPT4gdm9pZCkge1xuXHRcdGNvbnN0IHNlbGYgPSB0aGlzO1xuXHRcdGNvbnN0IGV4Y2x1ZGVQYXR0ZXJuID0gdGhpcy5mb2xkZXJFeGNsdWRlUGF0dGVybnMuZ2V0KHJvb3RGb2xkZXIpITtcblx0XHRjb25zdCBmaWxlUGF0dGVybiA9IHRoaXMuZmlsZVBhdHRlcm47XG5cdFx0Y29uc3QgaWdub3JlR2xvYkNhc2UgPSB0aGlzLmNvbmZpZy5pZ25vcmVHbG9iQ2FzZTtcblx0XHRmdW5jdGlvbiBtYXRjaERpcmVjdG9yeShlbnRyaWVzOiBJRGlyZWN0b3J5RW50cnlbXSkge1xuXHRcdFx0c2VsZi5kaXJlY3Rvcmllc1dhbGtlZCsrO1xuXHRcdFx0Y29uc3QgaGFzU2libGluZyA9IGhhc1NpYmxpbmdGbigoKSA9PiBlbnRyaWVzLm1hcChlbnRyeSA9PiBlbnRyeS5iYXNlbmFtZSkpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIG4gPSBlbnRyaWVzLmxlbmd0aDsgaSA8IG47IGkrKykge1xuXHRcdFx0XHRjb25zdCBlbnRyeSA9IGVudHJpZXNbaV07XG5cdFx0XHRcdGNvbnN0IHsgcmVsYXRpdmVQYXRoLCBiYXNlbmFtZSB9ID0gZW50cnk7XG5cblx0XHRcdFx0Ly8gQ2hlY2sgZXhjbHVkZSBwYXR0ZXJuXG5cdFx0XHRcdC8vIElmIHRoZSB1c2VyIHNlYXJjaGVzIGZvciB0aGUgZXhhY3QgZmlsZSBuYW1lLCB3ZSBhZGp1c3QgdGhlIGdsb2IgbWF0Y2hpbmdcblx0XHRcdFx0Ly8gdG8gaWdub3JlIGZpbHRlcmluZyBieSBzaWJsaW5ncyBiZWNhdXNlIHRoZSB1c2VyIHNlZW1zIHRvIGtub3cgd2hhdCB0aGV5XG5cdFx0XHRcdC8vIGFyZSBzZWFyY2hpbmcgZm9yIGFuZCB3ZSB3YW50IHRvIGluY2x1ZGUgdGhlIHJlc3VsdCBpbiB0aGF0IGNhc2UgYW55d2F5XG5cdFx0XHRcdGlmIChleGNsdWRlUGF0dGVybi50ZXN0KHJlbGF0aXZlUGF0aCwgYmFzZW5hbWUsICFzdHJpbmdzLmVxdWFscyhmaWxlUGF0dGVybiwgYmFzZW5hbWUsIGlnbm9yZUdsb2JDYXNlKSA/IGhhc1NpYmxpbmcgOiB1bmRlZmluZWQpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzdWIgPSBwYXRoVG9FbnRyaWVzW3JlbGF0aXZlUGF0aF07XG5cdFx0XHRcdGlmIChzdWIpIHtcblx0XHRcdFx0XHRtYXRjaERpcmVjdG9yeShzdWIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNlbGYuZmlsZXNXYWxrZWQrKztcblx0XHRcdFx0XHRpZiAoc3RyaW5ncy5lcXVhbHMocmVsYXRpdmVQYXRoLCBmaWxlUGF0dGVybiwgaWdub3JlR2xvYkNhc2UpKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTsgLy8gaWdub3JlIGZpbGUgaWYgaXRzIHBhdGggbWF0Y2hlcyB3aXRoIHRoZSBmaWxlIHBhdHRlcm4gYmVjYXVzZSB0aGF0IGlzIGFscmVhZHkgbWF0Y2hlZCBhYm92ZVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHNlbGYubWF0Y2hGaWxlKG9uUmVzdWx0LCBlbnRyeSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoc2VsZi5pc0xpbWl0SGl0KSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0bWF0Y2hEaXJlY3Rvcnkocm9vdEVudHJpZXMpO1xuXHR9XG5cblx0Z2V0U3RhdHMoKTogSVNlYXJjaEVuZ2luZVN0YXRzIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y21kVGltZTogdGhpcy5jbWRTVyEuZWxhcHNlZCgpLFxuXHRcdFx0ZmlsZVdhbGtUaW1lOiB0aGlzLmZpbGVXYWxrU1chLmVsYXBzZWQoKSxcblx0XHRcdGRpcmVjdG9yaWVzV2Fsa2VkOiB0aGlzLmRpcmVjdG9yaWVzV2Fsa2VkLFxuXHRcdFx0ZmlsZXNXYWxrZWQ6IHRoaXMuZmlsZXNXYWxrZWQsXG5cdFx0XHRjbWRSZXN1bHRDb3VudDogdGhpcy5jbWRSZXN1bHRDb3VudFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGRvV2Fsayhmb2xkZXJRdWVyeTogSUZvbGRlclF1ZXJ5LCByZWxhdGl2ZVBhcmVudFBhdGg6IHN0cmluZywgZmlsZXM6IHN0cmluZ1tdLCBvblJlc3VsdDogKHJlc3VsdDogSVJhd0ZpbGVNYXRjaCkgPT4gdm9pZCwgZG9uZTogKGVycm9yPzogRXJyb3IpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCByb290Rm9sZGVyID0gZm9sZGVyUXVlcnkuZm9sZGVyO1xuXG5cdFx0Ly8gRXhlY3V0ZSB0YXNrcyBvbiBlYWNoIGZpbGUgaW4gcGFyYWxsZWwgdG8gb3B0aW1pemUgdGhyb3VnaHB1dFxuXHRcdGNvbnN0IGhhc1NpYmxpbmcgPSBoYXNTaWJsaW5nRm4oKCkgPT4gZmlsZXMpO1xuXHRcdHRoaXMucGFyYWxsZWwoZmlsZXMsIChmaWxlOiBzdHJpbmcsIGNsYjogKGVycm9yOiBFcnJvciB8IG51bGwsIF8/OiBhbnkpID0+IHZvaWQpOiB2b2lkID0+IHtcblxuXHRcdFx0Ly8gQ2hlY2sgY2FuY2VsZWRcblx0XHRcdGlmICh0aGlzLmlzQ2FuY2VsZWQgfHwgdGhpcy5pc0xpbWl0SGl0KSB7XG5cdFx0XHRcdHJldHVybiBjbGIobnVsbCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIGV4Y2x1ZGUgcGF0dGVyblxuXHRcdFx0Ly8gSWYgdGhlIHVzZXIgc2VhcmNoZXMgZm9yIHRoZSBleGFjdCBmaWxlIG5hbWUsIHdlIGFkanVzdCB0aGUgZ2xvYiBtYXRjaGluZ1xuXHRcdFx0Ly8gdG8gaWdub3JlIGZpbHRlcmluZyBieSBzaWJsaW5ncyBiZWNhdXNlIHRoZSB1c2VyIHNlZW1zIHRvIGtub3cgd2hhdCB0aGV5XG5cdFx0XHQvLyBhcmUgc2VhcmNoaW5nIGZvciBhbmQgd2Ugd2FudCB0byBpbmNsdWRlIHRoZSByZXN1bHQgaW4gdGhhdCBjYXNlIGFueXdheVxuXHRcdFx0Y29uc3QgY3VycmVudFJlbGF0aXZlUGF0aCA9IHJlbGF0aXZlUGFyZW50UGF0aCA/IFtyZWxhdGl2ZVBhcmVudFBhdGgsIGZpbGVdLmpvaW4ocGF0aC5zZXApIDogZmlsZTtcblx0XHRcdGlmICh0aGlzLmZvbGRlckV4Y2x1ZGVQYXR0ZXJucy5nZXQoZm9sZGVyUXVlcnkuZm9sZGVyLmZzUGF0aCkhLnRlc3QoY3VycmVudFJlbGF0aXZlUGF0aCwgZmlsZSwgIXN0cmluZ3MuZXF1YWxzKHRoaXMuY29uZmlnLmZpbGVQYXR0ZXJuLCBmaWxlLCB0aGlzLmNvbmZpZy5pZ25vcmVHbG9iQ2FzZSkgPyBoYXNTaWJsaW5nIDogdW5kZWZpbmVkKSkge1xuXHRcdFx0XHRyZXR1cm4gY2xiKG51bGwpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBVc2UgbHN0YXQgdG8gZGV0ZWN0IGxpbmtzXG5cdFx0XHRjb25zdCBjdXJyZW50QWJzb2x1dGVQYXRoID0gW3Jvb3RGb2xkZXIuZnNQYXRoLCBjdXJyZW50UmVsYXRpdmVQYXRoXS5qb2luKHBhdGguc2VwKTtcblx0XHRcdGZzLmxzdGF0KGN1cnJlbnRBYnNvbHV0ZVBhdGgsIChlcnJvciwgbHN0YXQpID0+IHtcblx0XHRcdFx0aWYgKGVycm9yIHx8IHRoaXMuaXNDYW5jZWxlZCB8fCB0aGlzLmlzTGltaXRIaXQpIHtcblx0XHRcdFx0XHRyZXR1cm4gY2xiKG51bGwpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSWYgdGhlIHBhdGggaXMgYSBsaW5rLCB3ZSBtdXN0IGluc3RlYWQgdXNlIGZzLnN0YXQoKSB0byBmaW5kIG91dCBpZiB0aGVcblx0XHRcdFx0Ly8gbGluayBpcyBhIGRpcmVjdG9yeSBvciBub3QgYmVjYXVzZSBsc3RhdCB3aWxsIGFsd2F5cyByZXR1cm4gdGhlIHN0YXQgb2Zcblx0XHRcdFx0Ly8gdGhlIGxpbmsgd2hpY2ggaXMgYWx3YXlzIGEgZmlsZS5cblx0XHRcdFx0dGhpcy5zdGF0TGlua0lmTmVlZGVkKGN1cnJlbnRBYnNvbHV0ZVBhdGgsIGxzdGF0LCAoZXJyb3IsIHN0YXQpID0+IHtcblx0XHRcdFx0XHRpZiAoZXJyb3IgfHwgdGhpcy5pc0NhbmNlbGVkIHx8IHRoaXMuaXNMaW1pdEhpdCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGNsYihudWxsKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBEaXJlY3Rvcnk6IEZvbGxvdyBkaXJlY3Rvcmllc1xuXHRcdFx0XHRcdGlmIChzdGF0LmlzRGlyZWN0b3J5KCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuZGlyZWN0b3JpZXNXYWxrZWQrKztcblxuXHRcdFx0XHRcdFx0Ly8gdG8gcmVhbGx5IHByZXZlbnQgbG9vcHMgd2l0aCBsaW5rcyB3ZSBuZWVkIHRvIHJlc29sdmUgdGhlIHJlYWwgcGF0aCBvZiB0aGVtXG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5yZWFsUGF0aElmTmVlZGVkKGN1cnJlbnRBYnNvbHV0ZVBhdGgsIGxzdGF0LCAoZXJyb3IsIHJlYWxwYXRoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmIChlcnJvciB8fCB0aGlzLmlzQ2FuY2VsZWQgfHwgdGhpcy5pc0xpbWl0SGl0KSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIGNsYihudWxsKTtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdHJlYWxwYXRoID0gcmVhbHBhdGggfHwgJyc7XG5cdFx0XHRcdFx0XHRcdGlmICh0aGlzLndhbGtlZFBhdGhzW3JlYWxwYXRoXSkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBjbGIobnVsbCk7IC8vIGVzY2FwZSB3aGVuIHRoZXJlIGFyZSBjeWNsZXMgKGNhbiBoYXBwZW4gd2l0aCBzeW1saW5rcylcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdHRoaXMud2Fsa2VkUGF0aHNbcmVhbHBhdGhdID0gdHJ1ZTsgLy8gcmVtZW1iZXIgYXMgd2Fsa2VkXG5cblx0XHRcdFx0XHRcdFx0Ly8gQ29udGludWUgd2Fsa2luZ1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZXMucmVhZGRpcihjdXJyZW50QWJzb2x1dGVQYXRoKS50aGVuKGNoaWxkcmVuID0+IHtcblx0XHRcdFx0XHRcdFx0XHRpZiAodGhpcy5pc0NhbmNlbGVkIHx8IHRoaXMuaXNMaW1pdEhpdCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIGNsYihudWxsKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0XHR0aGlzLmRvV2Fsayhmb2xkZXJRdWVyeSwgY3VycmVudFJlbGF0aXZlUGF0aCwgY2hpbGRyZW4sIG9uUmVzdWx0LCBlcnIgPT4gY2xiKGVyciB8fCBudWxsKSk7XG5cdFx0XHRcdFx0XHRcdH0sIGVycm9yID0+IHtcblx0XHRcdFx0XHRcdFx0XHRjbGIobnVsbCk7XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gRmlsZTogQ2hlY2sgZm9yIG1hdGNoIG9uIGZpbGUgcGF0dGVybiBhbmQgaW5jbHVkZSBwYXR0ZXJuXG5cdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLmZpbGVzV2Fsa2VkKys7XG5cdFx0XHRcdFx0XHRpZiAoc3RyaW5ncy5lcXVhbHMoY3VycmVudFJlbGF0aXZlUGF0aCwgdGhpcy5maWxlUGF0dGVybiwgdGhpcy5jb25maWcuaWdub3JlR2xvYkNhc2UpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBjbGIobnVsbCwgdW5kZWZpbmVkKTsgLy8gaWdub3JlIGZpbGUgaWYgaXRzIHBhdGggbWF0Y2hlcyB3aXRoIHRoZSBmaWxlIHBhdHRlcm4gYmVjYXVzZSBjaGVja0ZpbGVQYXR0ZXJuUmVsYXRpdmVNYXRjaCgpIHRha2VzIGNhcmUgb2YgdGhvc2Vcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKHRoaXMubWF4RmlsZXNpemUgJiYgdHlwZXMuaXNOdW1iZXIoc3RhdC5zaXplKSAmJiBzdGF0LnNpemUgPiB0aGlzLm1heEZpbGVzaXplKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBjbGIobnVsbCwgdW5kZWZpbmVkKTsgLy8gaWdub3JlIGZpbGUgaWYgbWF4IGZpbGUgc2l6ZSBpcyBoaXRcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0dGhpcy5tYXRjaEZpbGUob25SZXN1bHQsIHtcblx0XHRcdFx0XHRcdFx0YmFzZTogcm9vdEZvbGRlci5mc1BhdGgsXG5cdFx0XHRcdFx0XHRcdHJlbGF0aXZlUGF0aDogY3VycmVudFJlbGF0aXZlUGF0aCxcblx0XHRcdFx0XHRcdFx0c2VhcmNoUGF0aDogdGhpcy5nZXRTZWFyY2hQYXRoKGZvbGRlclF1ZXJ5LCBjdXJyZW50UmVsYXRpdmVQYXRoKSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFVud2luZFxuXHRcdFx0XHRcdHJldHVybiBjbGIobnVsbCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9LCAoZXJyb3I6IEFycmF5PEVycm9yIHwgbnVsbD4gfCBudWxsKTogdm9pZCA9PiB7XG5cdFx0XHRjb25zdCBmaWx0ZXJlZEVycm9ycyA9IGVycm9yID8gYXJyYXlzLmNvYWxlc2NlKGVycm9yKSA6IGVycm9yOyAvLyBmaW5kIGFueSBlcnJvciBieSByZW1vdmluZyBudWxsIHZhbHVlcyBmaXJzdFxuXHRcdFx0cmV0dXJuIGRvbmUoZmlsdGVyZWRFcnJvcnMgJiYgZmlsdGVyZWRFcnJvcnMubGVuZ3RoID4gMCA/IGZpbHRlcmVkRXJyb3JzWzBdIDogdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgbWF0Y2hGaWxlKG9uUmVzdWx0OiAocmVzdWx0OiBJUmF3RmlsZU1hdGNoKSA9PiB2b2lkLCBjYW5kaWRhdGU6IElSYXdGaWxlTWF0Y2gpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5pc0ZpbGVNYXRjaChjYW5kaWRhdGUpICYmICghdGhpcy5pbmNsdWRlUGF0dGVybiB8fCB0aGlzLmluY2x1ZGVQYXR0ZXJuKGNhbmRpZGF0ZS5yZWxhdGl2ZVBhdGgsIHBhdGguYmFzZW5hbWUoY2FuZGlkYXRlLnJlbGF0aXZlUGF0aCkpKSkge1xuXHRcdFx0dGhpcy5yZXN1bHRDb3VudCsrO1xuXG5cdFx0XHRpZiAodGhpcy5leGlzdHMgfHwgKHRoaXMubWF4UmVzdWx0cyAmJiB0aGlzLnJlc3VsdENvdW50ID4gdGhpcy5tYXhSZXN1bHRzKSkge1xuXHRcdFx0XHR0aGlzLmlzTGltaXRIaXQgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuaXNMaW1pdEhpdCkge1xuXHRcdFx0XHRvblJlc3VsdChjYW5kaWRhdGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaXNGaWxlTWF0Y2goY2FuZGlkYXRlOiBJUmF3RmlsZU1hdGNoKTogYm9vbGVhbiB7XG5cdFx0Ly8gQ2hlY2sgZm9yIHNlYXJjaCBwYXR0ZXJuXG5cdFx0aWYgKHRoaXMuZmlsZVBhdHRlcm4pIHtcblx0XHRcdGlmICh0aGlzLmZpbGVQYXR0ZXJuID09PSAnKicpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7IC8vIHN1cHBvcnQgdGhlIGFsbC1tYXRjaGluZyB3aWxkY2FyZFxuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5ub3JtYWxpemVkRmlsZVBhdHRlcm5Mb3dlcmNhc2UpIHtcblx0XHRcdFx0cmV0dXJuIGlzRmlsZVBhdHRlcm5NYXRjaChjYW5kaWRhdGUsIHRoaXMubm9ybWFsaXplZEZpbGVQYXR0ZXJuTG93ZXJjYXNlKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5maWxlUGF0dGVybikge1xuXHRcdFx0XHRyZXR1cm4gaXNGaWxlUGF0dGVybk1hdGNoKGNhbmRpZGF0ZSwgdGhpcy5maWxlUGF0dGVybiwgZmFsc2UsIHRoaXMuY29uZmlnLmlnbm9yZUdsb2JDYXNlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBObyBwYXR0ZXJucyBtZWFucyB3ZSBtYXRjaCBhbGxcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdExpbmtJZk5lZWRlZChwYXRoOiBzdHJpbmcsIGxzdGF0OiBmcy5TdGF0cywgY2xiOiAoZXJyb3I6IEVycm9yIHwgbnVsbCwgc3RhdDogZnMuU3RhdHMpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRpZiAobHN0YXQuaXNTeW1ib2xpY0xpbmsoKSkge1xuXHRcdFx0cmV0dXJuIGZzLnN0YXQocGF0aCwgY2xiKTsgLy8gc3RhdCB0aGUgdGFyZ2V0IHRoZSBsaW5rIHBvaW50cyB0b1xuXHRcdH1cblxuXHRcdHJldHVybiBjbGIobnVsbCwgbHN0YXQpOyAvLyBub3QgYSBsaW5rLCBzbyB0aGUgc3RhdCBpcyBhbHJlYWR5IG9rIGZvciB1c1xuXHR9XG5cblx0cHJpdmF0ZSByZWFsUGF0aElmTmVlZGVkKHBhdGg6IHN0cmluZywgbHN0YXQ6IGZzLlN0YXRzLCBjbGI6IChlcnJvcjogRXJyb3IgfCBudWxsLCByZWFscGF0aD86IHN0cmluZykgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGlmIChsc3RhdC5pc1N5bWJvbGljTGluaygpKSB7XG5cdFx0XHRyZXR1cm4gZnMucmVhbHBhdGgocGF0aCwgKGVycm9yLCByZWFscGF0aCkgPT4ge1xuXHRcdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0XHRyZXR1cm4gY2xiKGVycm9yKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBjbGIobnVsbCwgcmVhbHBhdGgpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNsYihudWxsLCBwYXRoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJZiB3ZSdyZSBzZWFyY2hpbmcgZm9yIGZpbGVzIGluIG11bHRpcGxlIHdvcmtzcGFjZSBmb2xkZXJzLCB0aGVuIGJldHRlciBwcmVwZW5kIHRoZVxuXHQgKiBuYW1lIG9mIHRoZSB3b3Jrc3BhY2UgZm9sZGVyIHRvIHRoZSBwYXRoIG9mIHRoZSBmaWxlLiBUaGlzIHdheSB3ZSdsbCBiZSBhYmxlIHRvXG5cdCAqIGJldHRlciBmaWx0ZXIgZmlsZXMgdGhhdCBhcmUgYWxsIG9uIHRoZSB0b3Agb2YgYSB3b3Jrc3BhY2UgZm9sZGVyIGFuZCBoYXZlIGFsbCB0aGVcblx0ICogc2FtZSBuYW1lLiBBIHR5cGljYWwgZXhhbXBsZSBhcmUgYHBhY2thZ2UuanNvbmAgb3IgYFJFQURNRS5tZGAgZmlsZXMuXG5cdCAqL1xuXHRwcml2YXRlIGdldFNlYXJjaFBhdGgoZm9sZGVyUXVlcnk6IElGb2xkZXJRdWVyeSwgcmVsYXRpdmVQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGlmIChmb2xkZXJRdWVyeS5mb2xkZXJOYW1lKSB7XG5cdFx0XHRyZXR1cm4gcGF0aC5qb2luKGZvbGRlclF1ZXJ5LmZvbGRlck5hbWUsIHJlbGF0aXZlUGF0aCk7XG5cdFx0fVxuXHRcdHJldHVybiByZWxhdGl2ZVBhdGg7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEVuZ2luZSBpbXBsZW1lbnRzIElTZWFyY2hFbmdpbmU8SVJhd0ZpbGVNYXRjaD4ge1xuXHRwcml2YXRlIGZvbGRlclF1ZXJpZXM6IElGb2xkZXJRdWVyeVtdO1xuXHRwcml2YXRlIGV4dHJhRmlsZXM6IFVSSVtdO1xuXHRwcml2YXRlIHdhbGtlcjogRmlsZVdhbGtlcjtcblx0cHJpdmF0ZSBudW1UaHJlYWRzPzogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKGNvbmZpZzogSUZpbGVRdWVyeSwgbnVtVGhyZWFkcz86IG51bWJlcikge1xuXHRcdHRoaXMuZm9sZGVyUXVlcmllcyA9IGNvbmZpZy5mb2xkZXJRdWVyaWVzO1xuXHRcdHRoaXMuZXh0cmFGaWxlcyA9IGNvbmZpZy5leHRyYUZpbGVSZXNvdXJjZXMgfHwgW107XG5cdFx0dGhpcy5udW1UaHJlYWRzID0gbnVtVGhyZWFkcztcblxuXHRcdHRoaXMud2Fsa2VyID0gbmV3IEZpbGVXYWxrZXIoY29uZmlnKTtcblx0fVxuXG5cdHNlYXJjaChvblJlc3VsdDogKHJlc3VsdDogSVJhd0ZpbGVNYXRjaCkgPT4gdm9pZCwgb25Qcm9ncmVzczogKHByb2dyZXNzOiBJUHJvZ3Jlc3NNZXNzYWdlKSA9PiB2b2lkLCBkb25lOiAoZXJyb3I6IEVycm9yIHwgbnVsbCwgY29tcGxldGU6IElTZWFyY2hFbmdpbmVTdWNjZXNzKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0dGhpcy53YWxrZXIud2Fsayh0aGlzLmZvbGRlclF1ZXJpZXMsIHRoaXMuZXh0cmFGaWxlcywgdGhpcy5udW1UaHJlYWRzLCBvblJlc3VsdCwgb25Qcm9ncmVzcywgKGVycjogRXJyb3IgfCBudWxsLCBpc0xpbWl0SGl0OiBib29sZWFuKSA9PiB7XG5cdFx0XHRkb25lKGVyciwge1xuXHRcdFx0XHRsaW1pdEhpdDogaXNMaW1pdEhpdCxcblx0XHRcdFx0c3RhdHM6IHRoaXMud2Fsa2VyLmdldFN0YXRzKCksXG5cdFx0XHRcdG1lc3NhZ2VzOiBbXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0Y2FuY2VsKCk6IHZvaWQge1xuXHRcdHRoaXMud2Fsa2VyLmNhbmNlbCgpO1xuXHR9XG59XG5cbi8qKlxuICogVGhpcyBjbGFzcyBleGlzdHMgdG8gcHJvdmlkZSBvbmUgaW50ZXJmYWNlIG9uIHRvcCBvZiB0d28gUGFyc2VkRXhwcmVzc2lvbnMsIG9uZSBmb3IgYWJzb2x1dGUgZXhwcmVzc2lvbnMgYW5kIG9uZSBmb3IgcmVsYXRpdmUgZXhwcmVzc2lvbnMuXG4gKiBUaGUgYWJzb2x1dGUgYW5kIHJlbGF0aXZlIGV4cHJlc3Npb25zIGRvbid0IFwiaGF2ZVwiIHRvIGJlIGtlcHQgc2VwYXJhdGUsIGJ1dCB0aGlzIGtlZXBzIHVzIGZyb20gaGF2aW5nIHRvIHBhdGguam9pbiBldmVyeSBzaW5nbGVcbiAqIGZpbGUgc2VhcmNoZWQsIGl0J3Mgb25seSB1c2VkIGZvciBhIHRleHQgc2VhcmNoIHdpdGggYSBzZWFyY2hQYXRoXG4gKi9cbmNsYXNzIEFic29sdXRlQW5kUmVsYXRpdmVQYXJzZWRFeHByZXNzaW9uIHtcblx0cHJpdmF0ZSBhYnNvbHV0ZVBhcnNlZEV4cHI6IGdsb2IuUGFyc2VkRXhwcmVzc2lvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWxhdGl2ZVBhcnNlZEV4cHI6IGdsb2IuUGFyc2VkRXhwcmVzc2lvbiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgZXhwcmVzc2lvbjogZ2xvYi5JRXhwcmVzc2lvbiwgcHJpdmF0ZSByb290OiBzdHJpbmcsIHByaXZhdGUgaWdub3JlQ2FzZT86IGJvb2xlYW4pIHtcblx0XHR0aGlzLmluaXQoZXhwcmVzc2lvbik7XG5cdH1cblxuXHQvKipcblx0ICogU3BsaXQgdGhlIElFeHByZXNzaW9uIGludG8gaXRzIGFic29sdXRlIGFuZCByZWxhdGl2ZSBjb21wb25lbnRzLCBhbmQgZ2xvYi5wYXJzZSB0aGVtIHNlcGFyYXRlbHkuXG5cdCAqL1xuXHRwcml2YXRlIGluaXQoZXhwcjogZ2xvYi5JRXhwcmVzc2lvbik6IHZvaWQge1xuXHRcdGxldCBhYnNvbHV0ZUdsb2JFeHByOiBnbG9iLklFeHByZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRcdGxldCByZWxhdGl2ZUdsb2JFeHByOiBnbG9iLklFeHByZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRcdE9iamVjdC5rZXlzKGV4cHIpXG5cdFx0XHQuZmlsdGVyKGtleSA9PiBleHByW2tleV0pXG5cdFx0XHQuZm9yRWFjaChrZXkgPT4ge1xuXHRcdFx0XHRpZiAocGF0aC5pc0Fic29sdXRlKGtleSkpIHtcblx0XHRcdFx0XHRhYnNvbHV0ZUdsb2JFeHByID0gYWJzb2x1dGVHbG9iRXhwciB8fCBnbG9iLmdldEVtcHR5RXhwcmVzc2lvbigpO1xuXHRcdFx0XHRcdGFic29sdXRlR2xvYkV4cHJba2V5XSA9IGV4cHJba2V5XTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZWxhdGl2ZUdsb2JFeHByID0gcmVsYXRpdmVHbG9iRXhwciB8fCBnbG9iLmdldEVtcHR5RXhwcmVzc2lvbigpO1xuXHRcdFx0XHRcdHJlbGF0aXZlR2xvYkV4cHJba2V5XSA9IGV4cHJba2V5XTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRjb25zdCBnbG9iT3B0aW9ucyA9IHsgdHJpbUZvckV4Y2x1c2lvbnM6IHRydWUsIGlnbm9yZUNhc2U6IHRoaXMuaWdub3JlQ2FzZSB9O1xuXHRcdHRoaXMuYWJzb2x1dGVQYXJzZWRFeHByID0gYWJzb2x1dGVHbG9iRXhwciAmJiBnbG9iLnBhcnNlKGFic29sdXRlR2xvYkV4cHIsIGdsb2JPcHRpb25zKTtcblx0XHR0aGlzLnJlbGF0aXZlUGFyc2VkRXhwciA9IHJlbGF0aXZlR2xvYkV4cHIgJiYgZ2xvYi5wYXJzZShyZWxhdGl2ZUdsb2JFeHByLCBnbG9iT3B0aW9ucyk7XG5cdH1cblxuXHR0ZXN0KF9wYXRoOiBzdHJpbmcsIGJhc2VuYW1lPzogc3RyaW5nLCBoYXNTaWJsaW5nPzogKG5hbWU6IHN0cmluZykgPT4gYm9vbGVhbiB8IFByb21pc2U8Ym9vbGVhbj4pOiBzdHJpbmcgfCBQcm9taXNlPHN0cmluZyB8IG51bGw+IHwgdW5kZWZpbmVkIHwgbnVsbCB7XG5cdFx0cmV0dXJuICh0aGlzLnJlbGF0aXZlUGFyc2VkRXhwciAmJiB0aGlzLnJlbGF0aXZlUGFyc2VkRXhwcihfcGF0aCwgYmFzZW5hbWUsIGhhc1NpYmxpbmcpKSB8fFxuXHRcdFx0KHRoaXMuYWJzb2x1dGVQYXJzZWRFeHByICYmIHRoaXMuYWJzb2x1dGVQYXJzZWRFeHByKHBhdGguam9pbih0aGlzLnJvb3QsIF9wYXRoKSwgYmFzZW5hbWUsIGhhc1NpYmxpbmcpKTtcblx0fVxuXG5cdGdldEJhc2VuYW1lVGVybXMoKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IGJhc2VuYW1lVGVybXM6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKHRoaXMuYWJzb2x1dGVQYXJzZWRFeHByKSB7XG5cdFx0XHRiYXNlbmFtZVRlcm1zLnB1c2goLi4uZ2xvYi5nZXRCYXNlbmFtZVRlcm1zKHRoaXMuYWJzb2x1dGVQYXJzZWRFeHByKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucmVsYXRpdmVQYXJzZWRFeHByKSB7XG5cdFx0XHRiYXNlbmFtZVRlcm1zLnB1c2goLi4uZ2xvYi5nZXRCYXNlbmFtZVRlcm1zKHRoaXMucmVsYXRpdmVQYXJzZWRFeHByKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGJhc2VuYW1lVGVybXM7XG5cdH1cblxuXHRnZXRQYXRoVGVybXMoKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHBhdGhUZXJtczogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAodGhpcy5hYnNvbHV0ZVBhcnNlZEV4cHIpIHtcblx0XHRcdHBhdGhUZXJtcy5wdXNoKC4uLmdsb2IuZ2V0UGF0aFRlcm1zKHRoaXMuYWJzb2x1dGVQYXJzZWRFeHByKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucmVsYXRpdmVQYXJzZWRFeHByKSB7XG5cdFx0XHRwYXRoVGVybXMucHVzaCguLi5nbG9iLmdldFBhdGhUZXJtcyh0aGlzLnJlbGF0aXZlUGFyc2VkRXhwcikpO1xuXHRcdH1cblxuXHRcdHJldHVybiBwYXRoVGVybXM7XG5cdH1cbn1cblxuZnVuY3Rpb24gcmdFcnJvck1zZ0ZvckRpc3BsYXkobXNnOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBsaW5lcyA9IG1zZy50cmltKCkuc3BsaXQoJ1xcbicpO1xuXHRjb25zdCBmaXJzdExpbmUgPSBsaW5lc1swXS50cmltKCk7XG5cblx0aWYgKGZpcnN0TGluZS5zdGFydHNXaXRoKCdFcnJvciBwYXJzaW5nIHJlZ2V4JykpIHtcblx0XHRyZXR1cm4gZmlyc3RMaW5lO1xuXHR9XG5cblx0aWYgKGZpcnN0TGluZS5zdGFydHNXaXRoKCdyZWdleCBwYXJzZSBlcnJvcicpKSB7XG5cdFx0cmV0dXJuIHN0cmluZ3MudXBwZXJjYXNlRmlyc3RMZXR0ZXIobGluZXNbbGluZXMubGVuZ3RoIC0gMV0udHJpbSgpKTtcblx0fVxuXG5cdGlmIChmaXJzdExpbmUuc3RhcnRzV2l0aCgnZXJyb3IgcGFyc2luZyBnbG9iJykgfHxcblx0XHRmaXJzdExpbmUuc3RhcnRzV2l0aCgndW5zdXBwb3J0ZWQgZW5jb2RpbmcnKSkge1xuXHRcdC8vIFVwcGVyY2FzZSBmaXJzdCBsZXR0ZXJcblx0XHRyZXR1cm4gZmlyc3RMaW5lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgZmlyc3RMaW5lLnN1YnN0cigxKTtcblx0fVxuXG5cdGlmIChmaXJzdExpbmUgPT09IGBMaXRlcmFsICdcXFxcbicgbm90IGFsbG93ZWQuYCkge1xuXHRcdC8vIEkgd29uJ3QgbG9jYWxpemUgdGhpcyBiZWNhdXNlIG5vbmUgb2YgdGhlIFJpcGdyZXAgZXJyb3IgbWVzc2FnZXMgYXJlIGxvY2FsaXplZFxuXHRcdHJldHVybiBgTGl0ZXJhbCAnXFxcXG4nIGN1cnJlbnRseSBub3Qgc3VwcG9ydGVkYDtcblx0fVxuXG5cdGlmIChmaXJzdExpbmUuc3RhcnRzV2l0aCgnTGl0ZXJhbCAnKSkge1xuXHRcdC8vIE90aGVyIHVuc3VwcG9ydGVkIGNoYXJzXG5cdFx0cmV0dXJuIGZpcnN0TGluZTtcblx0fVxuXG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLGtCQUFrQjtBQUM5QixZQUFZLFFBQVE7QUFDcEIsWUFBWSxVQUFVO0FBRXRCLFNBQVMscUJBQXFCO0FBQzlCLFlBQVksWUFBWTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixZQUFZLFVBQVU7QUFDdEIsWUFBWSxtQkFBbUI7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsWUFBWSxjQUFjO0FBQzFCLFNBQVMsaUJBQWlCO0FBQzFCLFlBQVksYUFBYTtBQUN6QixZQUFZLFdBQVc7QUFFdkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBNkgsb0JBQW9CLG9CQUFvQjtBQUNySyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG9CQUFvQjtBQVk3QixNQUFNLFdBQVcsb0JBQUksSUFBZ0I7QUFDckMsUUFBUSxHQUFHLFFBQVEsTUFBTTtBQUN4QixXQUFTLFFBQVEsU0FBTyxJQUFJLENBQUM7QUFDOUIsQ0FBQztBQUVNLE1BQU0sV0FBVztBQUFBLEVBdUJ2QixZQUFZLFFBQW9CO0FBcEJoQyxTQUFRLGlDQUFnRDtBQUl4RCxTQUFRLGNBQTZCO0FBR3JDLFNBQVEsYUFBYTtBQUNyQixTQUFRLGFBQStCO0FBSXZDLFNBQVEsUUFBMEI7QUFDbEMsU0FBUSxpQkFBeUI7QUFRaEMsU0FBSyxTQUFTO0FBQ2QsU0FBSyxjQUFjLE9BQU8sZUFBZTtBQUN6QyxVQUFNLGNBQWMsT0FBTyxpQkFBaUIsRUFBRSxZQUFZLEtBQUssSUFBSTtBQUNuRSxTQUFLLGlCQUFpQixPQUFPLGtCQUFrQixLQUFLLE1BQU0sT0FBTyxnQkFBZ0IsV0FBVztBQUM1RixTQUFLLGFBQWEsT0FBTyxjQUFjO0FBQ3ZDLFNBQUssU0FBUyxDQUFDLENBQUMsT0FBTztBQUN2QixTQUFLLGNBQWMsdUJBQU8sT0FBTyxJQUFJO0FBQ3JDLFNBQUssY0FBYztBQUNuQixTQUFL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b0JBQW9CLEtBQUssTUFBTSxrQkFBa0IsV0FBVztBQUN0RixTQUFLLHFCQUFxQixvQkFBb0IsS0FBSyxNQUFNLGtCQUFrQixXQUFXO0FBQUEsRUFDdkY7QUFBQSxFQUVBLEtBQUssT0FBZSxVQUFtQixZQUErRztBQUNySixXQUFRLEtBQUssc0JBQXNCLEtBQUssbUJBQW1CLE9BQU8sVUFBVSxVQUFVLEtBQ3BGLEtBQUssc0JBQXNCLEtBQUssbUJBQW1CLEtBQUssS0FBSyxLQUFLLE1BQU0sS0FBSyxHQUFHLFVBQVUsVUFBVTtBQUFBLEVBQ3ZHO0FBQUEsRUFFQSxtQkFBNkI7QUFDNUIsVUFBTSxnQkFBMEIsQ0FBQztBQUNqQyxRQUFJLEtBQUssb0JBQW9CO0FBQzVCLG9CQUFjLEtBQUssR0FBRyxLQUFLLGlCQUFpQixLQUFLLGtCQUFrQixDQUFDO0FBQUEsSUFDckU7QUFFQSxRQUFJLEtBQUssb0JBQW9CO0FBQzVCLG9CQUFjLEtBQUssR0FBRyxLQUFLLGlCQUFpQixLQUFLLGtCQUFrQixDQUFDO0FBQUEsSUFDckU7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsZUFBeUI7QUFDeEIsVUFBTSxZQUFzQixDQUFDO0FBQzdCLFFBQUksS0FBSyxvQkFBb0I7QUFDNUIsZ0JBQVUsS0FBSyxHQUFHLEtBQUssYUFBYSxLQUFLLGtCQUFrQixDQUFDO0FBQUEsSUFDN0Q7QUFFQSxRQUFJLEtBQUssb0JBQW9CO0FBQzVCLGdCQUFVLEtBQUssR0FBRyxLQUFLLGFBQWEsS0FBSyxrQkFBa0IsQ0FBQztBQUFBLElBQzdEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVBLFNBQVMscUJBQXFCLEtBQWlDO0FBQzlELFFBQU0sUUFBUSxJQUFJLEtBQUssRUFBRSxNQUFNLElBQUk7QUFDbkMsUUFBTSxZQUFZLE1BQU0sQ0FBQyxFQUFFLEtBQUs7QUFFaEMsTUFBSSxVQUFVLFdBQVcscUJBQXFCLEdBQUc7QUFDaEQsV0FBTztBQUFBLEVBQ1I7QUFFQSxNQUFJLFVBQVUsV0FBVyxtQkFBbUIsR0FBRztBQUM5QyxXQUFPLFFBQVEscUJBQXFCLE1BQU0sTUFBTSxTQUFTLENBQUMsRUFBRSxLQUFLLENBQUM7QUFBQSxFQUNuRTtBQUVBLE1BQUksVUFBVSxXQUFXLG9CQUFvQixLQUM1QyxVQUFVLFdBQVcsc0JBQXNCLEdBQUc7QUFFOUMsV0FBTyxVQUFVLE9BQU8sQ0FBQyxFQUFFLFlBQVksSUFBSSxVQUFVLE9BQU8sQ0FBQztBQUFBLEVBQzlEO0FBRUEsTUFBSSxjQUFjLDhCQUE4QjtBQUUvQyxXQUFPO0FBQUEsRUFDUjtBQUVBLE1BQUksVUFBVSxXQUFXLFVBQVUsR0FBRztBQUVyQyxXQUFPO0FBQUEsRUFDUjtBQUVBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsicGF0aCIsICJlcnJvciJdCn0K
