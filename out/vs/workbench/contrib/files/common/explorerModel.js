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
import { URI } from "../../../../base/common/uri.js";
import { isEqual } from "../../../../base/common/extpath.js";
import { posix } from "../../../../base/common/path.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { FileSystemProviderCapabilities } from "../../../../platform/files/common/files.js";
import { rtrim, startsWithIgnoreCase, equalsIgnoreCase } from "../../../../base/common/strings.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { dispose } from "../../../../base/common/lifecycle.js";
import { memoize } from "../../../../base/common/decorators.js";
import { Emitter } from "../../../../base/common/event.js";
import { joinPath, isEqualOrParent, basenameOrAuthority } from "../../../../base/common/resources.js";
import { SortOrder } from "./files.js";
import { ExplorerFileNestingTrie } from "./explorerFileNestingTrie.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
class ExplorerModel {
  constructor(contextService, uriIdentityService, fileService, configService, filesConfigService) {
    this.contextService = contextService;
    this.uriIdentityService = uriIdentityService;
    this._onDidChangeRoots = new Emitter();
    const setRoots = () => this._roots = this.contextService.getWorkspace().folders.map((folder) => new ExplorerItem(folder.uri, fileService, configService, filesConfigService, void 0, true, false, false, false, folder.name));
    setRoots();
    this._listener = this.contextService.onDidChangeWorkspaceFolders(() => {
      setRoots();
      this._onDidChangeRoots.fire();
    });
  }
  get roots() {
    return this._roots;
  }
  get onDidChangeRoots() {
    return this._onDidChangeRoots.event;
  }
  /**
   * Returns an array of child stat from this stat that matches with the provided path.
   * Starts matching from the first root.
   * Will return empty array in case the FileStat does not exist.
   */
  findAll(resource) {
    return coalesce(this.roots.map((root) => root.find(resource)));
  }
  /**
   * Returns a FileStat that matches the passed resource.
   * In case multiple FileStat are matching the resource (same folder opened multiple times) returns the FileStat that has the closest root.
   * Will return undefined in case the FileStat does not exist.
   */
  findClosest(resource) {
    const folder = this.contextService.getWorkspaceFolder(resource);
    if (folder) {
      const root = this.roots.find((r) => this.uriIdentityService.extUri.isEqual(r.resource, folder.uri));
      if (root) {
        return root.find(resource);
      }
    }
    return null;
  }
  dispose() {
    this._onDidChangeRoots.dispose();
    dispose(this._listener);
  }
}
const _ExplorerItem = class _ExplorerItem {
  constructor(resource, fileService, configService, filesConfigService, _parent, _isDirectory, _isSymbolicLink, _readonly, _locked, _name = basenameOrAuthority(resource), _mtime, _unknown = false) {
    this.resource = resource;
    this.fileService = fileService;
    this.configService = configService;
    this.filesConfigService = filesConfigService;
    this._parent = _parent;
    this._isDirectory = _isDirectory;
    this._isSymbolicLink = _isSymbolicLink;
    this._readonly = _readonly;
    this._locked = _locked;
    this._name = _name;
    this._mtime = _mtime;
    this._unknown = _unknown;
    // used in tests
    this.error = void 0;
    this._isExcluded = false;
    // Find
    this.markedAsFindResult = false;
    this._isDirectoryResolved = false;
  }
  get isExcluded() {
    if (this._isExcluded) {
      return true;
    }
    if (!this._parent) {
      return false;
    }
    return this._parent.isExcluded;
  }
  set isExcluded(value) {
    this._isExcluded = value;
  }
  hasChildren(filter) {
    if (this.hasNests) {
      return this.nestedChildren?.some((c) => filter(c)) ?? false;
    } else {
      return this.isDirectory;
    }
  }
  get hasNests() {
    return !!this.nestedChildren?.length;
  }
  get isDirectoryResolved() {
    return this._isDirectoryResolved;
  }
  get isSymbolicLink() {
    return !!this._isSymbolicLink;
  }
  get isDirectory() {
    return !!this._isDirectory;
  }
  get isReadonly() {
    return this.filesConfigService.isReadonly(this.resource, { resource: this.resource, name: this.name, readonly: this._readonly, locked: this._locked });
  }
  get mtime() {
    return this._mtime;
  }
  get name() {
    return this._name;
  }
  get isUnknown() {
    return this._unknown;
  }
  get parent() {
    return this._parent;
  }
  get root() {
    if (!this._parent) {
      return this;
    }
    return this._parent.root;
  }
  get children() {
    return /* @__PURE__ */ new Map();
  }
  updateName(value) {
    this._parent?.removeChild(this);
    this._name = value;
    this._parent?.addChild(this);
  }
  getId() {
    let id = this.root.resource.toString() + "::" + this.resource.toString();
    if (this.isMarkedAsFiltered()) {
      id += "::findFilterResult";
    }
    return id;
  }
  toString() {
    return `ExplorerItem: ${this.name}`;
  }
  get isRoot() {
    return this === this.root;
  }
  static create(fileService, configService, filesConfigService, raw, parent, resolveTo) {
    const stat = new _ExplorerItem(raw.resource, fileService, configService, filesConfigService, parent, raw.isDirectory, raw.isSymbolicLink, raw.readonly, raw.locked, raw.name, raw.mtime, !raw.isFile && !raw.isDirectory);
    if (stat.isDirectory) {
      stat._isDirectoryResolved = !!raw.children || !!resolveTo && resolveTo.some((r) => {
        return isEqualOrParent(r, stat.resource);
      });
      if (raw.children) {
        for (let i = 0, len = raw.children.length; i < len; i++) {
          const child = _ExplorerItem.create(fileService, configService, filesConfigService, raw.children[i], stat, resolveTo);
          stat.addChild(child);
        }
      }
    }
    return stat;
  }
  /**
   * Merges the stat which was resolved from the disk with the local stat by copying over properties
   * and children. The merge will only consider resolved stat elements to avoid overwriting data which
   * exists locally.
   */
  static mergeLocalWithDisk(disk, local) {
    if (disk.resource.toString() !== local.resource.toString()) {
      return;
    }
    const mergingDirectories = disk.isDirectory || local.isDirectory;
    if (mergingDirectories && local._isDirectoryResolved && !disk._isDirectoryResolved) {
      return;
    }
    local.resource = disk.resource;
    if (!local.isRoot) {
      local.updateName(disk.name);
    }
    local._isDirectory = disk.isDirectory;
    local._mtime = disk.mtime;
    local._isDirectoryResolved = disk._isDirectoryResolved;
    local._isSymbolicLink = disk.isSymbolicLink;
    local.error = disk.error;
    if (mergingDirectories && disk._isDirectoryResolved) {
      const oldLocalChildren = new ResourceMap();
      local.children.forEach((child) => {
        oldLocalChildren.set(child.resource, child);
      });
      local.children.clear();
      disk.children.forEach((diskChild) => {
        const formerLocalChild = oldLocalChildren.get(diskChild.resource);
        if (formerLocalChild) {
          _ExplorerItem.mergeLocalWithDisk(diskChild, formerLocalChild);
          local.addChild(formerLocalChild);
          oldLocalChildren.delete(diskChild.resource);
        } else {
          local.addChild(diskChild);
        }
      });
      oldLocalChildren.forEach((oldChild) => {
        if (oldChild instanceof NewExplorerItem) {
          local.addChild(oldChild);
        }
      });
    }
  }
  /**
   * Adds a child element to this folder.
   */
  addChild(child) {
    child._parent = this;
    child.updateResource(false);
    this.children.set(this.getPlatformAwareName(child.name), child);
  }
  getChild(name) {
    return this.children.get(this.getPlatformAwareName(name));
  }
  fetchChildren(sortOrder) {
    const nestingConfig = this.configService.getValue({ resource: this.root.resource }).explorer.fileNesting;
    if (nestingConfig.enabled && this.nestedChildren) {
      return this.nestedChildren;
    }
    return (async () => {
      if (!this._isDirectoryResolved) {
        const resolveMetadata = sortOrder === SortOrder.Modified;
        this.error = void 0;
        try {
          const stat = await this.fileService.resolve(this.resource, { resolveSingleChildDescendants: true, resolveMetadata });
          const resolved = _ExplorerItem.create(this.fileService, this.configService, this.filesConfigService, stat, this);
          _ExplorerItem.mergeLocalWithDisk(resolved, this);
        } catch (e) {
          this.error = e;
          throw e;
        }
        this._isDirectoryResolved = true;
      }
      const items = [];
      if (nestingConfig.enabled) {
        const fileChildren = [];
        const dirChildren = [];
        for (const child of this.children.entries()) {
          child[1].nestedParent = void 0;
          if (child[1].isDirectory) {
            dirChildren.push(child);
          } else {
            fileChildren.push(child);
          }
        }
        const nested = this.fileNester.nest(
          fileChildren.map(([name]) => name),
          this.getPlatformAwareName(this.name)
        );
        for (const [fileEntryName, fileEntryItem] of fileChildren) {
          const nestedItems = nested.get(fileEntryName);
          if (nestedItems !== void 0) {
            fileEntryItem.nestedChildren = [];
            for (const name of nestedItems.keys()) {
              const child = assertReturnsDefined(this.children.get(name));
              fileEntryItem.nestedChildren.push(child);
              child.nestedParent = fileEntryItem;
            }
            items.push(fileEntryItem);
          } else {
            fileEntryItem.nestedChildren = void 0;
          }
        }
        for (const [_, dirEntryItem] of dirChildren.values()) {
          items.push(dirEntryItem);
        }
      } else {
        this.children.forEach((child) => {
          items.push(child);
        });
      }
      return items;
    })();
  }
  get fileNester() {
    if (!this.root._fileNester) {
      const nestingConfig = this.configService.getValue({ resource: this.root.resource }).explorer.fileNesting;
      const patterns = Object.entries(nestingConfig.patterns).filter((entry) => typeof entry[0] === "string" && typeof entry[1] === "string" && entry[0] && entry[1]).map(([parentPattern, childrenPatterns]) => [
        this.getPlatformAwareName(parentPattern.trim()),
        childrenPatterns.split(",").map((p) => this.getPlatformAwareName(p.trim().replace(/\u200b/g, "").trim())).filter((p) => p !== "")
      ]);
      this.root._fileNester = new ExplorerFileNestingTrie(patterns);
    }
    return this.root._fileNester;
  }
  /**
   * Removes a child element from this folder.
   */
  removeChild(child) {
    this.nestedChildren = void 0;
    this.children.delete(this.getPlatformAwareName(child.name));
  }
  forgetChildren() {
    this.children.clear();
    this.nestedChildren = void 0;
    this._isDirectoryResolved = false;
    this._fileNester = void 0;
  }
  getPlatformAwareName(name) {
    return this.fileService.hasCapability(this.resource, FileSystemProviderCapabilities.PathCaseSensitive) ? name : name.toLowerCase();
  }
  /**
   * Moves this element under a new parent element.
   */
  move(newParent) {
    this.nestedParent?.removeChild(this);
    this._parent?.removeChild(this);
    newParent.removeChild(this);
    newParent.addChild(this);
    this.updateResource(true);
  }
  updateResource(recursive) {
    if (this._parent) {
      this.resource = joinPath(this._parent.resource, this.name);
    }
    if (recursive) {
      if (this.isDirectory) {
        this.children.forEach((child) => {
          child.updateResource(true);
        });
      }
    }
  }
  /**
   * Tells this stat that it was renamed. This requires changes to all children of this stat (if any)
   * so that the path property can be updated properly.
   */
  rename(renamedStat) {
    this.updateName(renamedStat.name);
    this._mtime = renamedStat.mtime;
    this.updateResource(true);
  }
  /**
   * Returns a child stat from this stat that matches with the provided path.
   * Will return "null" in case the child does not exist.
   */
  find(resource) {
    const ignoreCase = !this.fileService.hasCapability(resource, FileSystemProviderCapabilities.PathCaseSensitive);
    if (resource && this.resource.scheme === resource.scheme && equalsIgnoreCase(this.resource.authority, resource.authority) && (ignoreCase ? startsWithIgnoreCase(resource.path, this.resource.path) : resource.path.startsWith(this.resource.path))) {
      return this.findByPath(rtrim(resource.path, posix.sep), this.resource.path.length, ignoreCase);
    }
    return null;
  }
  findByPath(path, index, ignoreCase) {
    if (isEqual(rtrim(this.resource.path, posix.sep), path, ignoreCase)) {
      return this;
    }
    if (this.isDirectory) {
      while (index < path.length && path[index] === posix.sep) {
        index++;
      }
      let indexOfNextSep = path.indexOf(posix.sep, index);
      if (indexOfNextSep === -1) {
        indexOfNextSep = path.length;
      }
      const name = path.substring(index, indexOfNextSep);
      const child = this.children.get(this.getPlatformAwareName(name));
      if (child) {
        return child.findByPath(path, indexOfNextSep, ignoreCase);
      }
    }
    return null;
  }
  isMarkedAsFiltered() {
    return this.markedAsFindResult;
  }
  markItemAndParentsAsFiltered() {
    this.markedAsFindResult = true;
    this.parent?.markItemAndParentsAsFiltered();
  }
  unmarkItemAndChildren() {
    this.markedAsFindResult = false;
    this.children.forEach((child) => child.unmarkItemAndChildren());
  }
};
__decorateClass([
  memoize
], _ExplorerItem.prototype, "children", 1);
let ExplorerItem = _ExplorerItem;
class NewExplorerItem extends ExplorerItem {
  constructor(fileService, configService, filesConfigService, parent, isDirectory) {
    super(URI.file(""), fileService, configService, filesConfigService, parent, isDirectory);
    this._isDirectoryResolved = true;
  }
}
export {
  ExplorerItem,
  ExplorerModel,
  NewExplorerItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZpbGVzXFxjb21tb25cXGV4cGxvcmVyTW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V4dHBhdGguanMnO1xuaW1wb3J0IHsgcG9zaXggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IElGaWxlU3RhdCwgSUZpbGVTZXJ2aWNlLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgcnRyaW0sIHN0YXJ0c1dpdGhJZ25vcmVDYXNlLCBlcXVhbHNJZ25vcmVDYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgZGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBtZW1vaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGpvaW5QYXRoLCBpc0VxdWFsT3JQYXJlbnQsIGJhc2VuYW1lT3JBdXRob3JpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvbiwgU29ydE9yZGVyIH0gZnJvbSAnLi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IEV4cGxvcmVyRmlsZU5lc3RpbmdUcmllIH0gZnJvbSAnLi9leHBsb3JlckZpbGVOZXN0aW5nVHJpZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuXG5leHBvcnQgY2xhc3MgRXhwbG9yZXJNb2RlbCBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9yb290cyE6IEV4cGxvcmVySXRlbVtdO1xuXHRwcml2YXRlIF9saXN0ZW5lcjogSURpc3Bvc2FibGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUm9vdHMgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdGNvbmZpZ1NlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRmaWxlc0NvbmZpZ1NlcnZpY2U6IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRjb25zdCBzZXRSb290cyA9ICgpID0+IHRoaXMuX3Jvb3RzID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzXG5cdFx0XHQubWFwKGZvbGRlciA9PiBuZXcgRXhwbG9yZXJJdGVtKGZvbGRlci51cmksIGZpbGVTZXJ2aWNlLCBjb25maWdTZXJ2aWNlLCBmaWxlc0NvbmZpZ1NlcnZpY2UsIHVuZGVmaW5lZCwgdHJ1ZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgZm9sZGVyLm5hbWUpKTtcblx0XHRzZXRSb290cygpO1xuXG5cdFx0dGhpcy5fbGlzdGVuZXIgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycygoKSA9PiB7XG5cdFx0XHRzZXRSb290cygpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VSb290cy5maXJlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRnZXQgcm9vdHMoKTogRXhwbG9yZXJJdGVtW10ge1xuXHRcdHJldHVybiB0aGlzLl9yb290cztcblx0fVxuXG5cdGdldCBvbkRpZENoYW5nZVJvb3RzKCk6IEV2ZW50PHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VSb290cy5ldmVudDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGFuIGFycmF5IG9mIGNoaWxkIHN0YXQgZnJvbSB0aGlzIHN0YXQgdGhhdCBtYXRjaGVzIHdpdGggdGhlIHByb3ZpZGVkIHBhdGguXG5cdCAqIFN0YXJ0cyBtYXRjaGluZyBmcm9tIHRoZSBmaXJzdCByb290LlxuXHQgKiBXaWxsIHJldHVybiBlbXB0eSBhcnJheSBpbiBjYXNlIHRoZSBGaWxlU3RhdCBkb2VzIG5vdCBleGlzdC5cblx0ICovXG5cdGZpbmRBbGwocmVzb3VyY2U6IFVSSSk6IEV4cGxvcmVySXRlbVtdIHtcblx0XHRyZXR1cm4gY29hbGVzY2UodGhpcy5yb290cy5tYXAocm9vdCA9PiByb290LmZpbmQocmVzb3VyY2UpKSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBhIEZpbGVTdGF0IHRoYXQgbWF0Y2hlcyB0aGUgcGFzc2VkIHJlc291cmNlLlxuXHQgKiBJbiBjYXNlIG11bHRpcGxlIEZpbGVTdGF0IGFyZSBtYXRjaGluZyB0aGUgcmVzb3VyY2UgKHNhbWUgZm9sZGVyIG9wZW5lZCBtdWx0aXBsZSB0aW1lcykgcmV0dXJucyB0aGUgRmlsZVN0YXQgdGhhdCBoYXMgdGhlIGNsb3Nlc3Qgcm9vdC5cblx0ICogV2lsbCByZXR1cm4gdW5kZWZpbmVkIGluIGNhc2UgdGhlIEZpbGVTdGF0IGRvZXMgbm90IGV4aXN0LlxuXHQgKi9cblx0ZmluZENsb3Nlc3QocmVzb3VyY2U6IFVSSSk6IEV4cGxvcmVySXRlbSB8IG51bGwge1xuXHRcdGNvbnN0IGZvbGRlciA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHJlc291cmNlKTtcblx0XHRpZiAoZm9sZGVyKSB7XG5cdFx0XHRjb25zdCByb290ID0gdGhpcy5yb290cy5maW5kKHIgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoci5yZXNvdXJjZSwgZm9sZGVyLnVyaSkpO1xuXHRcdFx0aWYgKHJvb3QpIHtcblx0XHRcdFx0cmV0dXJuIHJvb3QuZmluZChyZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUm9vdHMuZGlzcG9zZSgpO1xuXHRcdGRpc3Bvc2UodGhpcy5fbGlzdGVuZXIpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHBsb3Jlckl0ZW0ge1xuXHRfaXNEaXJlY3RvcnlSZXNvbHZlZDogYm9vbGVhbjsgLy8gdXNlZCBpbiB0ZXN0c1xuXHRwdWJsaWMgZXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pc0V4Y2x1ZGVkID0gZmFsc2U7XG5cblx0cHVibGljIG5lc3RlZFBhcmVudDogRXhwbG9yZXJJdGVtIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgbmVzdGVkQ2hpbGRyZW46IEV4cGxvcmVySXRlbVtdIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZXNvdXJjZTogVVJJLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ1NlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGZpbGVzQ29uZmlnU2VydmljZTogSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBfcGFyZW50OiBFeHBsb3Jlckl0ZW0gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSBfaXNEaXJlY3Rvcnk/OiBib29sZWFuLFxuXHRcdHByaXZhdGUgX2lzU3ltYm9saWNMaW5rPzogYm9vbGVhbixcblx0XHRwcml2YXRlIF9yZWFkb25seT86IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSBfbG9ja2VkPzogYm9vbGVhbixcblx0XHRwcml2YXRlIF9uYW1lOiBzdHJpbmcgPSBiYXNlbmFtZU9yQXV0aG9yaXR5KHJlc291cmNlKSxcblx0XHRwcml2YXRlIF9tdGltZT86IG51bWJlcixcblx0XHRwcml2YXRlIF91bmtub3duID0gZmFsc2Vcblx0KSB7XG5cdFx0dGhpcy5faXNEaXJlY3RvcnlSZXNvbHZlZCA9IGZhbHNlO1xuXHR9XG5cblx0Z2V0IGlzRXhjbHVkZWQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX2lzRXhjbHVkZWQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3BhcmVudCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9wYXJlbnQuaXNFeGNsdWRlZDtcblx0fVxuXG5cdHNldCBpc0V4Y2x1ZGVkKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5faXNFeGNsdWRlZCA9IHZhbHVlO1xuXHR9XG5cblx0aGFzQ2hpbGRyZW4oZmlsdGVyOiAoc3RhdDogRXhwbG9yZXJJdGVtKSA9PiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuaGFzTmVzdHMpIHtcblx0XHRcdHJldHVybiB0aGlzLm5lc3RlZENoaWxkcmVuPy5zb21lKGMgPT4gZmlsdGVyKGMpKSA/PyBmYWxzZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuaXNEaXJlY3Rvcnk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGhhc05lc3RzKCkge1xuXHRcdHJldHVybiAhISh0aGlzLm5lc3RlZENoaWxkcmVuPy5sZW5ndGgpO1xuXHR9XG5cblx0Z2V0IGlzRGlyZWN0b3J5UmVzb2x2ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzRGlyZWN0b3J5UmVzb2x2ZWQ7XG5cdH1cblxuXHRnZXQgaXNTeW1ib2xpY0xpbmsoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5faXNTeW1ib2xpY0xpbms7XG5cdH1cblxuXHRnZXQgaXNEaXJlY3RvcnkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5faXNEaXJlY3Rvcnk7XG5cdH1cblxuXHRnZXQgaXNSZWFkb25seSgpOiBib29sZWFuIHwgSU1hcmtkb3duU3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5maWxlc0NvbmZpZ1NlcnZpY2UuaXNSZWFkb25seSh0aGlzLnJlc291cmNlLCB7IHJlc291cmNlOiB0aGlzLnJlc291cmNlLCBuYW1lOiB0aGlzLm5hbWUsIHJlYWRvbmx5OiB0aGlzLl9yZWFkb25seSwgbG9ja2VkOiB0aGlzLl9sb2NrZWQgfSk7XG5cdH1cblxuXHRnZXQgbXRpbWUoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbXRpbWU7XG5cdH1cblxuXHRnZXQgbmFtZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9uYW1lO1xuXHR9XG5cblx0Z2V0IGlzVW5rbm93bigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdW5rbm93bjtcblx0fVxuXG5cdGdldCBwYXJlbnQoKTogRXhwbG9yZXJJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fcGFyZW50O1xuXHR9XG5cblx0Z2V0IHJvb3QoKTogRXhwbG9yZXJJdGVtIHtcblx0XHRpZiAoIXRoaXMuX3BhcmVudCkge1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3BhcmVudC5yb290O1xuXHR9XG5cblx0QG1lbW9pemUgZ2V0IGNoaWxkcmVuKCk6IE1hcDxzdHJpbmcsIEV4cGxvcmVySXRlbT4ge1xuXHRcdHJldHVybiBuZXcgTWFwPHN0cmluZywgRXhwbG9yZXJJdGVtPigpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVOYW1lKHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHQvLyBSZS1hZGQgdG8gcGFyZW50IHNpbmNlIHRoZSBwYXJlbnQgaGFzIGEgbmFtZSBtYXAgdG8gY2hpbGRyZW4gYW5kIHRoZSBuYW1lIG1pZ2h0IGhhdmUgY2hhbmdlZFxuXHRcdHRoaXMuX3BhcmVudD8ucmVtb3ZlQ2hpbGQodGhpcyk7XG5cdFx0dGhpcy5fbmFtZSA9IHZhbHVlO1xuXHRcdHRoaXMuX3BhcmVudD8uYWRkQ2hpbGQodGhpcyk7XG5cdH1cblxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdGxldCBpZCA9IHRoaXMucm9vdC5yZXNvdXJjZS50b1N0cmluZygpICsgJzo6JyArIHRoaXMucmVzb3VyY2UudG9TdHJpbmcoKTtcblxuXHRcdGlmICh0aGlzLmlzTWFya2VkQXNGaWx0ZXJlZCgpKSB7XG5cdFx0XHRpZCArPSAnOjpmaW5kRmlsdGVyUmVzdWx0Jztcblx0XHR9XG5cblx0XHRyZXR1cm4gaWQ7XG5cdH1cblxuXHR0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgRXhwbG9yZXJJdGVtOiAke3RoaXMubmFtZX1gO1xuXHR9XG5cblx0Z2V0IGlzUm9vdCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcyA9PT0gdGhpcy5yb290O1xuXHR9XG5cblx0c3RhdGljIGNyZWF0ZShmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLCBjb25maWdTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIGZpbGVzQ29uZmlnU2VydmljZTogSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsIHJhdzogSUZpbGVTdGF0LCBwYXJlbnQ6IEV4cGxvcmVySXRlbSB8IHVuZGVmaW5lZCwgcmVzb2x2ZVRvPzogcmVhZG9ubHkgVVJJW10pOiBFeHBsb3Jlckl0ZW0ge1xuXHRcdGNvbnN0IHN0YXQgPSBuZXcgRXhwbG9yZXJJdGVtKHJhdy5yZXNvdXJjZSwgZmlsZVNlcnZpY2UsIGNvbmZpZ1NlcnZpY2UsIGZpbGVzQ29uZmlnU2VydmljZSwgcGFyZW50LCByYXcuaXNEaXJlY3RvcnksIHJhdy5pc1N5bWJvbGljTGluaywgcmF3LnJlYWRvbmx5LCByYXcubG9ja2VkLCByYXcubmFtZSwgcmF3Lm10aW1lLCAhcmF3LmlzRmlsZSAmJiAhcmF3LmlzRGlyZWN0b3J5KTtcblxuXHRcdC8vIFJlY3Vyc2l2ZWx5IGFkZCBjaGlsZHJlbiBpZiBwcmVzZW50XG5cdFx0aWYgKHN0YXQuaXNEaXJlY3RvcnkpIHtcblxuXHRcdFx0Ly8gaXNEaXJlY3RvcnlSZXNvbHZlZCBpcyBhIHZlcnkgaW1wb3J0YW50IGluZGljYXRvciBpbiB0aGUgc3RhdCBtb2RlbCB0aGF0IHRlbGxzIGlmIHRoZSBmb2xkZXIgd2FzIGZ1bGx5IHJlc29sdmVkXG5cdFx0XHQvLyB0aGUgZm9sZGVyIGlzIGZ1bGx5IHJlc29sdmVkIGlmIGVpdGhlciBpdCBoYXMgYSBsaXN0IG9mIGNoaWxkcmVuIG9yIHRoZSBjbGllbnQgcmVxdWVzdGVkIHRoaXMgYnkgdXNpbmcgdGhlIHJlc29sdmVUb1xuXHRcdFx0Ly8gYXJyYXkgb2YgcmVzb3VyY2UgcGF0aCB0byByZXNvbHZlLlxuXHRcdFx0c3RhdC5faXNEaXJlY3RvcnlSZXNvbHZlZCA9ICEhcmF3LmNoaWxkcmVuIHx8ICghIXJlc29sdmVUbyAmJiByZXNvbHZlVG8uc29tZSgocikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gaXNFcXVhbE9yUGFyZW50KHIsIHN0YXQucmVzb3VyY2UpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBSZWN1cnNlIGludG8gY2hpbGRyZW5cblx0XHRcdGlmIChyYXcuY2hpbGRyZW4pIHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHJhdy5jaGlsZHJlbi5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IGNoaWxkID0gRXhwbG9yZXJJdGVtLmNyZWF0ZShmaWxlU2VydmljZSwgY29uZmlnU2VydmljZSwgZmlsZXNDb25maWdTZXJ2aWNlLCByYXcuY2hpbGRyZW5baV0sIHN0YXQsIHJlc29sdmVUbyk7XG5cdFx0XHRcdFx0c3RhdC5hZGRDaGlsZChjaGlsZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gc3RhdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBNZXJnZXMgdGhlIHN0YXQgd2hpY2ggd2FzIHJlc29sdmVkIGZyb20gdGhlIGRpc2sgd2l0aCB0aGUgbG9jYWwgc3RhdCBieSBjb3B5aW5nIG92ZXIgcHJvcGVydGllc1xuXHQgKiBhbmQgY2hpbGRyZW4uIFRoZSBtZXJnZSB3aWxsIG9ubHkgY29uc2lkZXIgcmVzb2x2ZWQgc3RhdCBlbGVtZW50cyB0byBhdm9pZCBvdmVyd3JpdGluZyBkYXRhIHdoaWNoXG5cdCAqIGV4aXN0cyBsb2NhbGx5LlxuXHQgKi9cblx0c3RhdGljIG1lcmdlTG9jYWxXaXRoRGlzayhkaXNrOiBFeHBsb3Jlckl0ZW0sIGxvY2FsOiBFeHBsb3Jlckl0ZW0pOiB2b2lkIHtcblx0XHRpZiAoZGlzay5yZXNvdXJjZS50b1N0cmluZygpICE9PSBsb2NhbC5yZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRyZXR1cm47IC8vIE1lcmdpbmcgb25seSBzdXBwb3J0ZWQgZm9yIHN0YXRzIHdpdGggdGhlIHNhbWUgcmVzb3VyY2Vcblx0XHR9XG5cblx0XHQvLyBTdG9wIG1lcmdpbmcgd2hlbiBhIGZvbGRlciBpcyBub3QgcmVzb2x2ZWQgdG8gYXZvaWQgbG9vc2luZyBsb2NhbCBkYXRhXG5cdFx0Y29uc3QgbWVyZ2luZ0RpcmVjdG9yaWVzID0gZGlzay5pc0RpcmVjdG9yeSB8fCBsb2NhbC5pc0RpcmVjdG9yeTtcblx0XHRpZiAobWVyZ2luZ0RpcmVjdG9yaWVzICYmIGxvY2FsLl9pc0RpcmVjdG9yeVJlc29sdmVkICYmICFkaXNrLl9pc0RpcmVjdG9yeVJlc29sdmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUHJvcGVydGllc1xuXHRcdGxvY2FsLnJlc291cmNlID0gZGlzay5yZXNvdXJjZTtcblx0XHRpZiAoIWxvY2FsLmlzUm9vdCkge1xuXHRcdFx0bG9jYWwudXBkYXRlTmFtZShkaXNrLm5hbWUpO1xuXHRcdH1cblx0XHRsb2NhbC5faXNEaXJlY3RvcnkgPSBkaXNrLmlzRGlyZWN0b3J5O1xuXHRcdGxvY2FsLl9tdGltZSA9IGRpc2subXRpbWU7XG5cdFx0bG9jYWwuX2lzRGlyZWN0b3J5UmVzb2x2ZWQgPSBkaXNrLl9pc0RpcmVjdG9yeVJlc29sdmVkO1xuXHRcdGxvY2FsLl9pc1N5bWJvbGljTGluayA9IGRpc2suaXNTeW1ib2xpY0xpbms7XG5cdFx0bG9jYWwuZXJyb3IgPSBkaXNrLmVycm9yO1xuXG5cdFx0Ly8gTWVyZ2UgQ2hpbGRyZW4gaWYgcmVzb2x2ZWRcblx0XHRpZiAobWVyZ2luZ0RpcmVjdG9yaWVzICYmIGRpc2suX2lzRGlyZWN0b3J5UmVzb2x2ZWQpIHtcblxuXHRcdFx0Ly8gTWFwIHJlc291cmNlID0+IHN0YXRcblx0XHRcdGNvbnN0IG9sZExvY2FsQ2hpbGRyZW4gPSBuZXcgUmVzb3VyY2VNYXA8RXhwbG9yZXJJdGVtPigpO1xuXHRcdFx0bG9jYWwuY2hpbGRyZW4uZm9yRWFjaChjaGlsZCA9PiB7XG5cdFx0XHRcdG9sZExvY2FsQ2hpbGRyZW4uc2V0KGNoaWxkLnJlc291cmNlLCBjaGlsZCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gQ2xlYXIgY3VycmVudCBjaGlsZHJlblxuXHRcdFx0bG9jYWwuY2hpbGRyZW4uY2xlYXIoKTtcblxuXHRcdFx0Ly8gTWVyZ2UgcmVjZWl2ZWQgY2hpbGRyZW5cblx0XHRcdGRpc2suY2hpbGRyZW4uZm9yRWFjaChkaXNrQ2hpbGQgPT4ge1xuXHRcdFx0XHRjb25zdCBmb3JtZXJMb2NhbENoaWxkID0gb2xkTG9jYWxDaGlsZHJlbi5nZXQoZGlza0NoaWxkLnJlc291cmNlKTtcblx0XHRcdFx0Ly8gRXhpc3RpbmcgY2hpbGQ6IG1lcmdlXG5cdFx0XHRcdGlmIChmb3JtZXJMb2NhbENoaWxkKSB7XG5cdFx0XHRcdFx0RXhwbG9yZXJJdGVtLm1lcmdlTG9jYWxXaXRoRGlzayhkaXNrQ2hpbGQsIGZvcm1lckxvY2FsQ2hpbGQpO1xuXHRcdFx0XHRcdGxvY2FsLmFkZENoaWxkKGZvcm1lckxvY2FsQ2hpbGQpO1xuXHRcdFx0XHRcdG9sZExvY2FsQ2hpbGRyZW4uZGVsZXRlKGRpc2tDaGlsZC5yZXNvdXJjZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBOZXcgY2hpbGQ6IGFkZFxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRsb2NhbC5hZGRDaGlsZChkaXNrQ2hpbGQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0b2xkTG9jYWxDaGlsZHJlbi5mb3JFYWNoKG9sZENoaWxkID0+IHtcblx0XHRcdFx0aWYgKG9sZENoaWxkIGluc3RhbmNlb2YgTmV3RXhwbG9yZXJJdGVtKSB7XG5cdFx0XHRcdFx0bG9jYWwuYWRkQ2hpbGQob2xkQ2hpbGQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQWRkcyBhIGNoaWxkIGVsZW1lbnQgdG8gdGhpcyBmb2xkZXIuXG5cdCAqL1xuXHRhZGRDaGlsZChjaGlsZDogRXhwbG9yZXJJdGVtKTogdm9pZCB7XG5cdFx0Ly8gSW5oZXJpdCBzb21lIHBhcmVudCBwcm9wZXJ0aWVzIHRvIGNoaWxkXG5cdFx0Y2hpbGQuX3BhcmVudCA9IHRoaXM7XG5cdFx0Y2hpbGQudXBkYXRlUmVzb3VyY2UoZmFsc2UpO1xuXHRcdHRoaXMuY2hpbGRyZW4uc2V0KHRoaXMuZ2V0UGxhdGZvcm1Bd2FyZU5hbWUoY2hpbGQubmFtZSksIGNoaWxkKTtcblx0fVxuXG5cdGdldENoaWxkKG5hbWU6IHN0cmluZyk6IEV4cGxvcmVySXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuY2hpbGRyZW4uZ2V0KHRoaXMuZ2V0UGxhdGZvcm1Bd2FyZU5hbWUobmFtZSkpO1xuXHR9XG5cblx0ZmV0Y2hDaGlsZHJlbihzb3J0T3JkZXI6IFNvcnRPcmRlcik6IEV4cGxvcmVySXRlbVtdIHwgUHJvbWlzZTxFeHBsb3Jlckl0ZW1bXT4ge1xuXHRcdGNvbnN0IG5lc3RpbmdDb25maWcgPSB0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8SUZpbGVzQ29uZmlndXJhdGlvbj4oeyByZXNvdXJjZTogdGhpcy5yb290LnJlc291cmNlIH0pLmV4cGxvcmVyLmZpbGVOZXN0aW5nO1xuXG5cdFx0Ly8gZmFzdCBwYXRoIHdoZW4gdGhlIGNoaWxkcmVuIGNhbiBiZSByZXNvbHZlZCBzeW5jXG5cdFx0aWYgKG5lc3RpbmdDb25maWcuZW5hYmxlZCAmJiB0aGlzLm5lc3RlZENoaWxkcmVuKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5uZXN0ZWRDaGlsZHJlbjtcblx0XHR9XG5cblx0XHRyZXR1cm4gKGFzeW5jICgpID0+IHtcblx0XHRcdGlmICghdGhpcy5faXNEaXJlY3RvcnlSZXNvbHZlZCkge1xuXHRcdFx0XHQvLyBSZXNvbHZlIG1ldGFkYXRhIG9ubHkgd2hlbiB0aGUgbXRpbWUgaXMgbmVlZGVkIHNpbmNlIHRoaXMgY2FuIGJlIGV4cGVuc2l2ZVxuXHRcdFx0XHQvLyBNdGltZSBpcyBvbmx5IHVzZWQgd2hlbiB0aGUgc29ydCBvcmRlciBpcyAnbW9kaWZpZWQnXG5cdFx0XHRcdGNvbnN0IHJlc29sdmVNZXRhZGF0YSA9IHNvcnRPcmRlciA9PT0gU29ydE9yZGVyLk1vZGlmaWVkO1xuXHRcdFx0XHR0aGlzLmVycm9yID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUodGhpcy5yZXNvdXJjZSwgeyByZXNvbHZlU2luZ2xlQ2hpbGREZXNjZW5kYW50czogdHJ1ZSwgcmVzb2x2ZU1ldGFkYXRhIH0pO1xuXHRcdFx0XHRcdGNvbnN0IHJlc29sdmVkID0gRXhwbG9yZXJJdGVtLmNyZWF0ZSh0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLmNvbmZpZ1NlcnZpY2UsIHRoaXMuZmlsZXNDb25maWdTZXJ2aWNlLCBzdGF0LCB0aGlzKTtcblx0XHRcdFx0XHRFeHBsb3Jlckl0ZW0ubWVyZ2VMb2NhbFdpdGhEaXNrKHJlc29sdmVkLCB0aGlzKTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdHRoaXMuZXJyb3IgPSBlO1xuXHRcdFx0XHRcdHRocm93IGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5faXNEaXJlY3RvcnlSZXNvbHZlZCA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGl0ZW1zOiBFeHBsb3Jlckl0ZW1bXSA9IFtdO1xuXHRcdFx0aWYgKG5lc3RpbmdDb25maWcuZW5hYmxlZCkge1xuXHRcdFx0XHRjb25zdCBmaWxlQ2hpbGRyZW46IFtzdHJpbmcsIEV4cGxvcmVySXRlbV1bXSA9IFtdO1xuXHRcdFx0XHRjb25zdCBkaXJDaGlsZHJlbjogW3N0cmluZywgRXhwbG9yZXJJdGVtXVtdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgdGhpcy5jaGlsZHJlbi5lbnRyaWVzKCkpIHtcblx0XHRcdFx0XHRjaGlsZFsxXS5uZXN0ZWRQYXJlbnQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aWYgKGNoaWxkWzFdLmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0XHRkaXJDaGlsZHJlbi5wdXNoKGNoaWxkKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZmlsZUNoaWxkcmVuLnB1c2goY2hpbGQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG5lc3RlZCA9IHRoaXMuZmlsZU5lc3Rlci5uZXN0KFxuXHRcdFx0XHRcdGZpbGVDaGlsZHJlbi5tYXAoKFtuYW1lXSkgPT4gbmFtZSksXG5cdFx0XHRcdFx0dGhpcy5nZXRQbGF0Zm9ybUF3YXJlTmFtZSh0aGlzLm5hbWUpKTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IFtmaWxlRW50cnlOYW1lLCBmaWxlRW50cnlJdGVtXSBvZiBmaWxlQ2hpbGRyZW4pIHtcblx0XHRcdFx0XHRjb25zdCBuZXN0ZWRJdGVtcyA9IG5lc3RlZC5nZXQoZmlsZUVudHJ5TmFtZSk7XG5cdFx0XHRcdFx0aWYgKG5lc3RlZEl0ZW1zICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGZpbGVFbnRyeUl0ZW0ubmVzdGVkQ2hpbGRyZW4gPSBbXTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgbmFtZSBvZiBuZXN0ZWRJdGVtcy5rZXlzKCkpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY2hpbGQgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLmNoaWxkcmVuLmdldChuYW1lKSk7XG5cdFx0XHRcdFx0XHRcdGZpbGVFbnRyeUl0ZW0ubmVzdGVkQ2hpbGRyZW4ucHVzaChjaGlsZCk7XG5cdFx0XHRcdFx0XHRcdGNoaWxkLm5lc3RlZFBhcmVudCA9IGZpbGVFbnRyeUl0ZW07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpdGVtcy5wdXNoKGZpbGVFbnRyeUl0ZW0pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRmaWxlRW50cnlJdGVtLm5lc3RlZENoaWxkcmVuID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAoY29uc3QgW18sIGRpckVudHJ5SXRlbV0gb2YgZGlyQ2hpbGRyZW4udmFsdWVzKCkpIHtcblx0XHRcdFx0XHRpdGVtcy5wdXNoKGRpckVudHJ5SXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuY2hpbGRyZW4uZm9yRWFjaChjaGlsZCA9PiB7XG5cdFx0XHRcdFx0aXRlbXMucHVzaChjaGlsZCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGl0ZW1zO1xuXHRcdH0pKCk7XG5cdH1cblxuXHRwcml2YXRlIF9maWxlTmVzdGVyOiBFeHBsb3JlckZpbGVOZXN0aW5nVHJpZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBnZXQgZmlsZU5lc3RlcigpOiBFeHBsb3JlckZpbGVOZXN0aW5nVHJpZSB7XG5cdFx0aWYgKCF0aGlzLnJvb3QuX2ZpbGVOZXN0ZXIpIHtcblx0XHRcdGNvbnN0IG5lc3RpbmdDb25maWcgPSB0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8SUZpbGVzQ29uZmlndXJhdGlvbj4oeyByZXNvdXJjZTogdGhpcy5yb290LnJlc291cmNlIH0pLmV4cGxvcmVyLmZpbGVOZXN0aW5nO1xuXHRcdFx0Y29uc3QgcGF0dGVybnMgPSBPYmplY3QuZW50cmllcyhuZXN0aW5nQ29uZmlnLnBhdHRlcm5zKVxuXHRcdFx0XHQuZmlsdGVyKGVudHJ5ID0+XG5cdFx0XHRcdFx0dHlwZW9mIChlbnRyeVswXSkgPT09ICdzdHJpbmcnICYmIHR5cGVvZiAoZW50cnlbMV0pID09PSAnc3RyaW5nJyAmJiBlbnRyeVswXSAmJiBlbnRyeVsxXSlcblx0XHRcdFx0Lm1hcCgoW3BhcmVudFBhdHRlcm4sIGNoaWxkcmVuUGF0dGVybnNdKSA9PlxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdHRoaXMuZ2V0UGxhdGZvcm1Bd2FyZU5hbWUocGFyZW50UGF0dGVybi50cmltKCkpLFxuXHRcdFx0XHRcdFx0Y2hpbGRyZW5QYXR0ZXJucy5zcGxpdCgnLCcpLm1hcChwID0+IHRoaXMuZ2V0UGxhdGZvcm1Bd2FyZU5hbWUocC50cmltKCkucmVwbGFjZSgvXFx1MjAwYi9nLCAnJykudHJpbSgpKSlcblx0XHRcdFx0XHRcdFx0LmZpbHRlcihwID0+IHAgIT09ICcnKVxuXHRcdFx0XHRcdF0gYXMgW3N0cmluZywgc3RyaW5nW11dKTtcblxuXHRcdFx0dGhpcy5yb290Ll9maWxlTmVzdGVyID0gbmV3IEV4cGxvcmVyRmlsZU5lc3RpbmdUcmllKHBhdHRlcm5zKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMucm9vdC5fZmlsZU5lc3Rlcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW1vdmVzIGEgY2hpbGQgZWxlbWVudCBmcm9tIHRoaXMgZm9sZGVyLlxuXHQgKi9cblx0cmVtb3ZlQ2hpbGQoY2hpbGQ6IEV4cGxvcmVySXRlbSk6IHZvaWQge1xuXHRcdHRoaXMubmVzdGVkQ2hpbGRyZW4gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5jaGlsZHJlbi5kZWxldGUodGhpcy5nZXRQbGF0Zm9ybUF3YXJlTmFtZShjaGlsZC5uYW1lKSk7XG5cdH1cblxuXHRmb3JnZXRDaGlsZHJlbigpOiB2b2lkIHtcblx0XHR0aGlzLmNoaWxkcmVuLmNsZWFyKCk7XG5cdFx0dGhpcy5uZXN0ZWRDaGlsZHJlbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9pc0RpcmVjdG9yeVJlc29sdmVkID0gZmFsc2U7XG5cdFx0dGhpcy5fZmlsZU5lc3RlciA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UGxhdGZvcm1Bd2FyZU5hbWUobmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5maWxlU2VydmljZS5oYXNDYXBhYmlsaXR5KHRoaXMucmVzb3VyY2UsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5QYXRoQ2FzZVNlbnNpdGl2ZSkgPyBuYW1lIDogbmFtZS50b0xvd2VyQ2FzZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1vdmVzIHRoaXMgZWxlbWVudCB1bmRlciBhIG5ldyBwYXJlbnQgZWxlbWVudC5cblx0ICovXG5cdG1vdmUobmV3UGFyZW50OiBFeHBsb3Jlckl0ZW0pOiB2b2lkIHtcblx0XHR0aGlzLm5lc3RlZFBhcmVudD8ucmVtb3ZlQ2hpbGQodGhpcyk7XG5cdFx0dGhpcy5fcGFyZW50Py5yZW1vdmVDaGlsZCh0aGlzKTtcblx0XHRuZXdQYXJlbnQucmVtb3ZlQ2hpbGQodGhpcyk7IC8vIG1ha2Ugc3VyZSB0byByZW1vdmUgYW55IHByZXZpb3VzIHZlcnNpb24gb2YgdGhlIGZpbGUgaWYgYW55XG5cdFx0bmV3UGFyZW50LmFkZENoaWxkKHRoaXMpO1xuXHRcdHRoaXMudXBkYXRlUmVzb3VyY2UodHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVJlc291cmNlKHJlY3Vyc2l2ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wYXJlbnQpIHtcblx0XHRcdHRoaXMucmVzb3VyY2UgPSBqb2luUGF0aCh0aGlzLl9wYXJlbnQucmVzb3VyY2UsIHRoaXMubmFtZSk7XG5cdFx0fVxuXG5cdFx0aWYgKHJlY3Vyc2l2ZSkge1xuXHRcdFx0aWYgKHRoaXMuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0dGhpcy5jaGlsZHJlbi5mb3JFYWNoKGNoaWxkID0+IHtcblx0XHRcdFx0XHRjaGlsZC51cGRhdGVSZXNvdXJjZSh0cnVlKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFRlbGxzIHRoaXMgc3RhdCB0aGF0IGl0IHdhcyByZW5hbWVkLiBUaGlzIHJlcXVpcmVzIGNoYW5nZXMgdG8gYWxsIGNoaWxkcmVuIG9mIHRoaXMgc3RhdCAoaWYgYW55KVxuXHQgKiBzbyB0aGF0IHRoZSBwYXRoIHByb3BlcnR5IGNhbiBiZSB1cGRhdGVkIHByb3Blcmx5LlxuXHQgKi9cblx0cmVuYW1lKHJlbmFtZWRTdGF0OiB7IG5hbWU6IHN0cmluZzsgbXRpbWU/OiBudW1iZXIgfSk6IHZvaWQge1xuXG5cdFx0Ly8gTWVyZ2UgYSBzdWJzZXQgb2YgUHJvcGVydGllcyB0aGF0IGNhbiBjaGFuZ2Ugb24gcmVuYW1lXG5cdFx0dGhpcy51cGRhdGVOYW1lKHJlbmFtZWRTdGF0Lm5hbWUpO1xuXHRcdHRoaXMuX210aW1lID0gcmVuYW1lZFN0YXQubXRpbWU7XG5cblx0XHQvLyBVcGRhdGUgUGF0aHMgaW5jbHVkaW5nIGNoaWxkcmVuXG5cdFx0dGhpcy51cGRhdGVSZXNvdXJjZSh0cnVlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGEgY2hpbGQgc3RhdCBmcm9tIHRoaXMgc3RhdCB0aGF0IG1hdGNoZXMgd2l0aCB0aGUgcHJvdmlkZWQgcGF0aC5cblx0ICogV2lsbCByZXR1cm4gXCJudWxsXCIgaW4gY2FzZSB0aGUgY2hpbGQgZG9lcyBub3QgZXhpc3QuXG5cdCAqL1xuXHRmaW5kKHJlc291cmNlOiBVUkkpOiBFeHBsb3Jlckl0ZW0gfCBudWxsIHtcblx0XHQvLyBSZXR1cm4gaWYgcGF0aCBmb3VuZFxuXHRcdC8vIEZvciBwZXJmb3JtYW5jZSByZWFzb25zIHRyeSB0byBkbyB0aGUgY29tcGFyaXNvbiBhcyBmYXN0IGFzIHBvc3NpYmxlXG5cdFx0Y29uc3QgaWdub3JlQ2FzZSA9ICF0aGlzLmZpbGVTZXJ2aWNlLmhhc0NhcGFiaWxpdHkocmVzb3VyY2UsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5QYXRoQ2FzZVNlbnNpdGl2ZSk7XG5cdFx0aWYgKHJlc291cmNlICYmIHRoaXMucmVzb3VyY2Uuc2NoZW1lID09PSByZXNvdXJjZS5zY2hlbWUgJiYgZXF1YWxzSWdub3JlQ2FzZSh0aGlzLnJlc291cmNlLmF1dGhvcml0eSwgcmVzb3VyY2UuYXV0aG9yaXR5KSAmJlxuXHRcdFx0KGlnbm9yZUNhc2UgPyBzdGFydHNXaXRoSWdub3JlQ2FzZShyZXNvdXJjZS5wYXRoLCB0aGlzLnJlc291cmNlLnBhdGgpIDogcmVzb3VyY2UucGF0aC5zdGFydHNXaXRoKHRoaXMucmVzb3VyY2UucGF0aCkpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5maW5kQnlQYXRoKHJ0cmltKHJlc291cmNlLnBhdGgsIHBvc2l4LnNlcCksIHRoaXMucmVzb3VyY2UucGF0aC5sZW5ndGgsIGlnbm9yZUNhc2UpO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsOyAvL1VuYWJsZSB0byBmaW5kXG5cdH1cblxuXHRwcml2YXRlIGZpbmRCeVBhdGgocGF0aDogc3RyaW5nLCBpbmRleDogbnVtYmVyLCBpZ25vcmVDYXNlOiBib29sZWFuKTogRXhwbG9yZXJJdGVtIHwgbnVsbCB7XG5cdFx0aWYgKGlzRXF1YWwocnRyaW0odGhpcy5yZXNvdXJjZS5wYXRoLCBwb3NpeC5zZXApLCBwYXRoLCBpZ25vcmVDYXNlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNEaXJlY3RvcnkpIHtcblx0XHRcdC8vIElnbm9yZSBzZXBhcnRvciB0byBtb3JlIGVhc2lseSBkZWR1Y3QgdGhlIG5leHQgbmFtZSB0byBzZWFyY2hcblx0XHRcdHdoaWxlIChpbmRleCA8IHBhdGgubGVuZ3RoICYmIHBhdGhbaW5kZXhdID09PSBwb3NpeC5zZXApIHtcblx0XHRcdFx0aW5kZXgrKztcblx0XHRcdH1cblxuXHRcdFx0bGV0IGluZGV4T2ZOZXh0U2VwID0gcGF0aC5pbmRleE9mKHBvc2l4LnNlcCwgaW5kZXgpO1xuXHRcdFx0aWYgKGluZGV4T2ZOZXh0U2VwID09PSAtMSkge1xuXHRcdFx0XHQvLyBJZiB0aGVyZSBpcyBubyBzZXBhcmF0b3IgdGFrZSB0aGUgcmVtYWluZGVyIG9mIHRoZSBwYXRoXG5cdFx0XHRcdGluZGV4T2ZOZXh0U2VwID0gcGF0aC5sZW5ndGg7XG5cdFx0XHR9XG5cdFx0XHQvLyBUaGUgbmFtZSB0byBzZWFyY2ggaXMgYmV0d2VlbiB0d28gc2VwYXJhdG9yc1xuXHRcdFx0Y29uc3QgbmFtZSA9IHBhdGguc3Vic3RyaW5nKGluZGV4LCBpbmRleE9mTmV4dFNlcCk7XG5cblx0XHRcdGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZHJlbi5nZXQodGhpcy5nZXRQbGF0Zm9ybUF3YXJlTmFtZShuYW1lKSk7XG5cblx0XHRcdGlmIChjaGlsZCkge1xuXHRcdFx0XHQvLyBXZSBmb3VuZCBhIGNoaWxkIHdpdGggdGhlIGdpdmVuIG5hbWUsIHNlYXJjaCBpbnNpZGUgaXRcblx0XHRcdFx0cmV0dXJuIGNoaWxkLmZpbmRCeVBhdGgocGF0aCwgaW5kZXhPZk5leHRTZXAsIGlnbm9yZUNhc2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Ly8gRmluZFxuXHRwcml2YXRlIG1hcmtlZEFzRmluZFJlc3VsdCA9IGZhbHNlO1xuXHRpc01hcmtlZEFzRmlsdGVyZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubWFya2VkQXNGaW5kUmVzdWx0O1xuXHR9XG5cblx0bWFya0l0ZW1BbmRQYXJlbnRzQXNGaWx0ZXJlZCgpOiB2b2lkIHtcblx0XHR0aGlzLm1hcmtlZEFzRmluZFJlc3VsdCA9IHRydWU7XG5cdFx0dGhpcy5wYXJlbnQ/Lm1hcmtJdGVtQW5kUGFyZW50c0FzRmlsdGVyZWQoKTtcblx0fVxuXG5cdHVubWFya0l0ZW1BbmRDaGlsZHJlbigpOiB2b2lkIHtcblx0XHR0aGlzLm1hcmtlZEFzRmluZFJlc3VsdCA9IGZhbHNlO1xuXHRcdHRoaXMuY2hpbGRyZW4uZm9yRWFjaChjaGlsZCA9PiBjaGlsZC51bm1hcmtJdGVtQW5kQ2hpbGRyZW4oKSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5ld0V4cGxvcmVySXRlbSBleHRlbmRzIEV4cGxvcmVySXRlbSB7XG5cdGNvbnN0cnVjdG9yKGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsIGNvbmZpZ1NlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSwgZmlsZXNDb25maWdTZXJ2aWNlOiBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSwgcGFyZW50OiBFeHBsb3Jlckl0ZW0sIGlzRGlyZWN0b3J5OiBib29sZWFuKSB7XG5cdFx0c3VwZXIoVVJJLmZpbGUoJycpLCBmaWxlU2VydmljZSwgY29uZmlnU2VydmljZSwgZmlsZXNDb25maWdTZXJ2aWNlLCBwYXJlbnQsIGlzRGlyZWN0b3J5KTtcblx0XHR0aGlzLl9pc0RpcmVjdG9yeVJlc29sdmVkID0gdHJ1ZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7OztBQUtBLFNBQVMsV0FBVztB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
